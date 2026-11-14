import { randomBytes } from "crypto";
import { campaignQuietNow, warpPostedMail } from "./mail";
import { db } from "./server";
import { MAX_PRICE, nextOccurrence, priceAllowedAt, priceAllowedRegular } from "./time";
import { geocodeAddress, shortPlace } from "./warpPool";

/**
 * 워프동기화 자동 처리(2026-11-04 사용자 지시: "워프 글을 모두의카풀로 유도").
 * status = 'go'인 글을 하나씩:
 *   1) 고유번호가 명단(legacy_members)에 없거나 이메일이 없으면 → 대기(queued). 명단이 올라와 이메일이 생기면 다음 실행 때 이어서 처리, 30일 지나면 지움.
 *   2) 있으면 계정 확인(없으면 신워프 명단과 같은 방식으로 만듦) → 주소 위치 찾기 → 1회 카풀 글 등록(posted).
 *      시간경과 글은 출발 시각이 지나 '종료', 완료 글은 마감으로 흐리게 보인다. 등록 시각은 워프 등록 시각을 그대로 쓴다.
 *   3) 밤 9시~아침 8시가 아니면 본인에게 "모두의카풀에 올려 두었어요" 메일(mailed). 한 사람에게 한 번에 한 통.
 * 금액은 평일 출퇴근 시간대 글에만 넣는다(그 밖은 무료로, 실비 분담 원칙).
 */
export async function runWarpSync(budgetMs = 25_000) {
  const sql = db();
  const t0 = Date.now();
  const out = { posted: 0, queued: 0, mailed: 0, skipped: 0 };
  await sql`delete from warp_sync_items where stage = 'queued' and queued_at < now() - interval '30 days'`;

  // 대기(계정 없음) 글은 6시간에 한 번만 다시 확인한다.
  // 단 그 사이 명단에 고유번호·이메일이 올라왔으면 바로 다시 처리한다(2026-11-14: 글을 먼저 붙여넣고 9분 뒤 명단을 올려 6시간 기다리던 문제).
  const items = await sql`select * from warp_sync_items w where status = 'go' and post_id is null
      and (stage = '' or (stage = 'queued' and (updated_at < now() - interval '6 hours'
        or exists (select 1 from legacy_members l where upper(l.warp_id) = upper(w.warp_id) and coalesce(l.email_norm, '') <> ''))))
    order by (stage = 'queued'), updated_at limit 4`;
  for (const it of items) {
    if (Date.now() - t0 > budgetMs * 0.6) break;
    const id = String(it.id);
    const warpId = String(it.warp_id).toUpperCase();
    const acc = await sql`select l.email_norm, l.nickname, l.name, l.matched_user from legacy_members l
      where upper(l.warp_id) = ${warpId} order by (l.matched_user is null), (coalesce(l.email_norm, '') = '') limit 1`;
    const email = acc.length ? String(acc[0].email_norm ?? "").trim().toLowerCase() : "";
    let user = acc.length && acc[0].matched_user
      ? (await sql`select id, withdrawn_at, blocked from users where id = ${acc[0].matched_user}`)[0]
      : email ? (await sql`select id, withdrawn_at, blocked from users where lower(email) = ${email} limit 1`)[0] : undefined;
    if (user && (user.withdrawn_at || user.blocked)) {
      await sql`update warp_sync_items set stage = 'skip', note = '탈퇴·정지 회원', updated_at = now() where id = ${id}`;
      out.skipped += 1;
      continue;
    }
    if (!user && !email) {
      await sql`update warp_sync_items set stage = 'queued', queued_at = coalesce(queued_at, now()), note = '명단에 고유번호·이메일 없음', updated_at = now() where id = ${id}`;
      out.queued += 1;
      continue;
    }
    if (!user) {
      const ins = await sql`insert into users (email, pw, name, contact, contact_type, member_code, pw_reset_required, email_verified)
        values (${email}, ${`unset:${randomBytes(32).toString("hex")}`}, ${String(acc[0]?.nickname || acc[0]?.name || "").slice(0, 40)}, '', '', ${warpId}, true, true)
        on conflict do nothing returning id, withdrawn_at, blocked`;
      user = ins[0] ?? (await sql`select id, withdrawn_at, blocked from users where lower(email) = ${email} limit 1`)[0];
      if (!user || user.withdrawn_at || user.blocked) {
        await sql`update warp_sync_items set stage = 'skip', note = '계정을 만들 수 없음', updated_at = now() where id = ${id}`;
        out.skipped += 1;
        continue;
      }
    }
    const userId = String(user.id);
    const home = String(it.home);
    const work = String(it.work);
    const h = (await geocodeAddress(home).catch(() => null)) as { lat: number; lng: number } | null;
    const w = work ? (await geocodeAddress(work).catch(() => null)) as { lat: number; lng: number } | null : null;
    const regular = String(it.kind) === "regular";
    const timeGo = String(it.time_go || "");
    const timeBack = String(it.time_back || "");
    const days = "12345";
    // 정기카풀은 다음 평일 출근 시각을 출발 시각으로 둔다(앱의 정기카풀과 같은 방식)
    const departAt = regular ? new Date(nextOccurrence(days, timeGo || "08:00")) : it.depart_at ? new Date(it.depart_at) : new Date();
    const allowed = regular ? priceAllowedRegular(days, timeGo || "08:00", timeBack) : priceAllowedAt(departAt.getTime());
    const rawPrice = Number(it.price) || 0;
    const fixed = allowed && rawPrice >= 500;
    const price = fixed ? Math.min(MAX_PRICE, Math.round(rawPrice / 100) * 100) : 0;
    const tags = String(it.tags ?? "").split(/[,·]/).map((x) => x.trim()).filter((x) => x && !/\d+\s*원|%/.test(x)).slice(0, 5);
    const note = ["워프와 동기화된 카풀이에요.", tags.length ? tags.join(" · ") : ""].filter(Boolean).join(" ").slice(0, 300);
    const origin = (String(it.home_name || "") || shortPlace(home)).slice(0, 60);
    const dest = (String(it.work_name || "") || shortPlace(work)).slice(0, 60);
    const status = String(it.warp_state) === "done" ? "closed" : "open";
    const created = it.reg_at ? new Date(it.reg_at).toISOString() : new Date().toISOString();
    // 처리가 도중에 끊겨 다시 실행돼도 같은 글을 두 번 만들지 않는다(고유번호 + 출발 시각이 같은 워프 글이 있으면 그 글을 잇는다)
    // 정기카풀은 관리자 '정기 매칭'에서 이미 올린 같은 회원 글(warp_pools.post_id)도 중복으로 본다
    const dup = regular
      ? await sql`select id from posts where status <> 'closed' and regular and (
            (source = 'warp' and warp_code = ${warpId})
            or id in (select post_id from warp_pools where upper(warp_id) = ${warpId} and post_id is not null)) limit 1`
      : await sql`select id from posts where source = 'warp' and warp_code = ${warpId} and depart_at = ${departAt.toISOString()} limit 1`;
    if (dup.length) {
      await sql`update warp_sync_items set stage = 'posted', post_id = ${dup[0].id}, user_id = ${userId}, updated_at = now() where id = ${id}`;
      out.posted += 1;
      continue;
    }
    const post = regular
      ? await sql`insert into posts (user_id, role, kind, cost, price, origin, dest, depart_at, seats, note,
          origin_lat, origin_lng, dest_lat, dest_lng, regular, days, time_go, time_back, tags, source, warp_code, status, created_at)
        values (${userId}, ${String(it.role) === "driver" ? "driver" : "rider"}, 'commute', ${fixed ? "fixed" : "free"}, ${price},
          ${origin}, ${dest}, ${departAt.toISOString()}, 1, ${note},
          ${h?.lat ?? null}, ${h?.lng ?? null}, ${w?.lat ?? null}, ${w?.lng ?? null}, true, ${days}, ${timeGo || "08:00"}, ${timeBack}, '{}'::text[], 'warp', ${warpId}, 'open', ${created})
        returning id`
      : await sql`insert into posts (user_id, role, kind, cost, price, origin, dest, depart_at, seats, note,
          origin_lat, origin_lng, dest_lat, dest_lng, tags, source, warp_code, status, created_at)
        values (${userId}, ${String(it.role) === "driver" ? "driver" : "rider"}, ${allowed ? "commute" : "trip"}, ${fixed ? "fixed" : "free"}, ${price},
          ${origin}, ${dest}, ${departAt.toISOString()}, 1, ${note},
          ${h?.lat ?? null}, ${h?.lng ?? null}, ${w?.lat ?? null}, ${w?.lng ?? null}, '{}'::text[], 'warp', ${warpId}, ${status}, ${created})
        returning id`;
    // 정기카풀이면 '정기 매칭' 목록의 같은 회원 행에도 올린 글을 이어 둔다(관리자가 다시 올려 중복되지 않게)
    if (regular) await sql`update warp_pools set post_id = ${post[0].id} where upper(warp_id) = ${warpId} and post_id is null`;
    await sql`update warp_sync_items set stage = 'posted', post_id = ${post[0].id}, user_id = ${userId},
      note = ${h ? "" : "출발 위치를 못 찾음(글 이름으로 나중에 채움)"}, updated_at = now() where id = ${id}`;
    out.posted += 1;
  }

  // 메일: 밤에는 보내지 않고 아침에 이어서. 한 사람에게 한 통(그 사람 글을 모두 담아).
  if (!campaignQuietNow()) {
    const due = await sql`select s.id, s.user_id, p.origin, p.dest, p.regular, (p.status = 'closed' or (not p.regular and p.depart_at <= now())) as over
      from warp_sync_items s join posts p on p.id = s.post_id
      where s.stage = 'posted' and s.mailed_at is null and s.user_id is not null order by s.user_id limit 30`;
    const byUser = new Map<string, { ids: string[]; routes: { route: string; over: boolean }[] }>();
    for (const r of due) {
      const k = String(r.user_id);
      const g = byUser.get(k) ?? { ids: [], routes: [] };
      g.ids.push(String(r.id));
      g.routes.push({ route: `${r.regular ? "[정기] " : ""}${r.origin} → ${r.dest}`, over: !!r.over });
      byUser.set(k, g);
    }
    for (const [uid, g] of byUser) {
      if (Date.now() - t0 > budgetMs) break;
      const sent = await warpPostedMail(uid, g.routes);
      await sql`update warp_sync_items set stage = ${sent ? "mailed" : "posted"}, mailed_at = now(),
        note = ${sent ? "" : "메일 못 보냄(수신거부·알림 끔 등)"}, updated_at = now() where id = any(${g.ids}::bigint[])`;
      if (sent) out.mailed += 1;
    }
  }
  return out;
}

let lastTry = 0;
/** 사이트 접속 응답 뒤에 3분에 한 번만(인스턴스 안 + DB 기록으로 겹치지 않게) 처리한다. */
export async function maybeRunWarpSync() {
  if (Date.now() - lastTry < 60_000) return;
  lastTry = Date.now();
  const sql = db();
  const work = await sql`select 1 from warp_sync_items where status = 'go'
    and (stage = '' or (stage = 'queued' and updated_at < now() - interval '6 hours') or (stage = 'posted' and mailed_at is null)) limit 1`;
  if (!work.length) return;
  const claim = await sql`insert into settings (key, value) values ('warp_sync_at', ${String(Date.now())})
    on conflict (key) do update set value = excluded.value
    where settings.value::bigint < ${Date.now() - 180_000} returning value`;
  if (claim.length) await runWarpSync(12_000);
}
