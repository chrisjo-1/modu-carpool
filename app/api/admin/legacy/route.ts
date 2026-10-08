import { keyedHash, maskEmail, maskPhone, normEmail, normPhone, runMatch } from "@/lib/legacy";
import { body, clientIp, db, ensureSchema, fail, hasDb, isAdmin, json } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);
const s = (v: unknown, max: number) => (v == null ? "" : String(v).trim().slice(0, max));
const STD_STATUS = ["사용중", "탈퇴", "정지중"];
const fmtPhone = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : p ?? "";
};

/** 현황 + 목록(연락처는 가림) 또는 한 명의 상세(?id=, &reveal=1 이면 연락처 공개·열람 기록) */
export async function GET(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const p = new URL(req.url).searchParams;
  try {
    await ensureSchema();
    const sql = db();
    const id = p.get("id");
    if (id) {
      const rows = await sql`select l.*, u.name as user_name, u.email as user_email from legacy_members l left join users u on u.id = l.matched_user where l.warp_id = ${id}`;
      if (!rows.length) return json({ error: "없는 회원입니다." }, 404);
      const r = rows[0];
      const reveal = p.get("reveal") === "1";
      if (reveal) await sql`insert into legacy_access (warp_id, ip) values (${id}, ${clientIp(req)})`;
      return json({
        member: {
          ...r,
          email_h: undefined,
          phone_h: undefined,
          phone: reveal ? fmtPhone((r.phone_norm as string) || (r.phone as string)) : maskPhone((r.phone_norm as string) || (r.phone as string)),
          phone_norm: undefined,
          email: reveal ? r.email : maskEmail(r.email as string),
          email_norm: undefined,
          naver_id: reveal ? r.naver_id : r.naver_id ? maskEmail(String(r.naver_id)) || "****" : "",
          kakao_id: reveal ? r.kakao_id : r.kakao_id ? "****" : "",
          revealed: reveal,
        },
      });
    }

    const q = s(p.get("q"), 60).toLowerCase();
    const like = `%${q}%`;
    const kind = s(p.get("kind"), 10);
    const match = s(p.get("match"), 10);
    const status = s(p.get("status"), 10);
    const review = p.get("review") === "1";
    const page = Math.max(0, Math.min(2000, Number(p.get("page")) || 0));
    const digits = q.replace(/\D/g, "");
    const plike = digits ? `%${digits}%` : like;
    const [stats, list, count] = await Promise.all([
      sql`select count(*)::int as total,
            count(*) filter (where withdrawn)::int as withdrawn,
            count(*) filter (where match_status = '가입됨')::int as joined,
            count(*) filter (where match_status = '미가입')::int as not_joined,
            count(*) filter (where match_status = '비교대기')::int as pending,
            count(*) filter (where kind = '라이더')::int as riders,
            count(*) filter (where kind = '드라이버')::int as drivers,
            count(*) filter (where email_norm is not null and phone_norm is not null)::int as both_keys,
            count(*) filter (where records >= 6 or status is null or not (status = any(${STD_STATUS})))::int as review,
            count(*) filter (where marketing = '동의')::int as agreed,
            max(imported_at) as imported_at
          from legacy_members`,
      sql`select l.warp_id, l.name, l.nickname, l.gender, l.kind, l.joined_on, l.status, coalesce(l.phone_norm, l.phone) as phone, l.email, l.records, l.withdrawn,
                 l.match_status, l.matched_by, l.marketing, l.promo
          from legacy_members l where (${q} = '' or l.warp_id ilike ${like} or l.name ilike ${like} or l.nickname ilike ${like} or l.email_norm like ${like} or l.phone_norm like ${plike})
      and (${kind} = '' or l.kind = ${kind})
      and (${match} = '' or l.match_status = ${match})
      and (${status} = '' or (${status} = '기타' and (l.status is null or not (l.status = any(${STD_STATUS})))) or l.status = ${status})
      and (not ${review} or l.records >= 6 or l.status is null or not (l.status = any(${STD_STATUS})))
          order by l.warp_id limit 50 offset ${page * 50}`,
      sql`select count(*)::int as n from legacy_members l where (${q} = '' or l.warp_id ilike ${like} or l.name ilike ${like} or l.nickname ilike ${like} or l.email_norm like ${like} or l.phone_norm like ${plike})
      and (${kind} = '' or l.kind = ${kind})
      and (${match} = '' or l.match_status = ${match})
      and (${status} = '' or (${status} = '기타' and (l.status is null or not (l.status = any(${STD_STATUS})))) or l.status = ${status})
      and (not ${review} or l.records >= 6 or l.status is null or not (l.status = any(${STD_STATUS})))`,
    ]);
    const st = stats[0];
    return json({
      stats: { ...st, imported_at: st.imported_at ? new Date(st.imported_at as string).getTime() : null },
      count: count[0].n,
      page,
      rows: list.map((r) => ({ ...r, phone: maskPhone(r.phone as string), email: maskEmail(r.email as string) })),
    });
  } catch (e) {
    return fail(e);
  }
}

/** {action:"import", rows:[...]}: 엑셀 '회원통합' 시트를 500행씩 받아 넣는다. {action:"match"}: 전체 대조 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  try {
    await ensureSchema();
    const sql = db();
    if (b.action === "match") return json({ ok: true, ...(await runMatch()) });
    if (b.action !== "import" || !Array.isArray(b.rows) || b.rows.length === 0 || b.rows.length > 1000)
      return json({ error: "잘못된 요청입니다." }, 400);
    const cols: Record<string, (string | number | boolean | null)[]> = {
      id: [], no: [], name: [], gender: [], nick: [], kind: [], joined: [], status: [], phone: [], phoneN: [], email: [], emailN: [],
      naver: [], kakao: [], records: [], withdrawn: [], emailH: [], phoneH: [], marketing: [], promo: [], memo: [],
    };
    let skipped = 0;
    for (const raw of b.rows as Record<string, unknown>[]) {
      const id = s(raw.id, 40);
      if (!/^[A-Za-z0-9_-]{3,40}$/.test(id)) {
        skipped++;
        continue;
      }
      const status = s(raw.status, 20) || null;
      const out = status === "탈퇴";
      const emailN = normEmail(raw.emailN) || normEmail(raw.email);
      const phoneN = normPhone(raw.phoneN) || normPhone(raw.phone);
      const push = (k: string, v: string | number | boolean | null) => cols[k].push(v);
      push("id", id);
      push("no", s(raw.no, 30));
      push("name", out ? null : s(raw.name, 40) || null);
      push("gender", s(raw.gender, 10) || null);
      push("nick", out ? null : s(raw.nick, 40) || null);
      push("kind", s(raw.kind, 10) || null);
      push("joined", s(raw.joined, 20) || null);
      push("status", status);
      push("phone", out ? null : s(raw.phone, 30) || null);
      push("phoneN", out ? null : phoneN || null);
      push("email", out ? null : s(raw.email, 120) || null);
      push("emailN", out ? null : emailN || null);
      push("naver", out ? null : s(raw.naver, 120) || null);
      push("kakao", out ? null : s(raw.kakao, 120) || null);
      push("records", Math.max(1, Math.min(999, Math.round(Number(raw.records)) || 1)));
      push("withdrawn", out);
      push("emailH", emailN ? keyedHash(emailN) : null);
      push("phoneH", phoneN ? keyedHash(phoneN) : null);
      push("marketing", s(raw.marketing, 10) || "미확인");
      push("promo", out ? "제외" : s(raw.promo, 20) || "동의확인필요");
      push("memo", s(raw.memo, 300));
    }
    if (cols.id.length) {
      await sql`insert into legacy_members (warp_id, src_no, name, gender, nickname, kind, joined_on, status, phone, phone_norm, email, email_norm,
                  naver_id, kakao_id, records, withdrawn, email_h, phone_h, marketing, promo, memo)
        select * from unnest(${cols.id}::text[], ${cols.no}::text[], ${cols.name}::text[], ${cols.gender}::text[], ${cols.nick}::text[], ${cols.kind}::text[],
                             ${cols.joined}::text[], ${cols.status}::text[], ${cols.phone}::text[], ${cols.phoneN}::text[], ${cols.email}::text[], ${cols.emailN}::text[],
                             ${cols.naver}::text[], ${cols.kakao}::text[], ${cols.records}::int[], ${cols.withdrawn}::boolean[], ${cols.emailH}::text[], ${cols.phoneH}::text[],
                             ${cols.marketing}::text[], ${cols.promo}::text[], ${cols.memo}::text[])
        on conflict (warp_id) do update set src_no = excluded.src_no, name = excluded.name, gender = excluded.gender, nickname = excluded.nickname,
          kind = excluded.kind, joined_on = excluded.joined_on, status = excluded.status, phone = excluded.phone, phone_norm = excluded.phone_norm,
          email = excluded.email, email_norm = excluded.email_norm, naver_id = excluded.naver_id, kakao_id = excluded.kakao_id,
          records = excluded.records, withdrawn = excluded.withdrawn, email_h = excluded.email_h, phone_h = excluded.phone_h,
          marketing = excluded.marketing, promo = excluded.promo,
          memo = case when excluded.memo <> '' then excluded.memo else legacy_members.memo end, imported_at = now()`;
    }
    return json({ ok: true, saved: cols.id.length, skipped });
  } catch (e) {
    return fail(e);
  }
}
