import { maybeRunWarpSync } from "@/lib/warpSync";
import { maybeRunAutoMail } from "@/lib/mailAuto";
import { maybeRunKakaoJob } from "@/lib/kakao";
import { maybeRunPoolJob } from "@/lib/poolJob";
import { maybeRunSafetyChecks } from "@/lib/safetyJob";
import { maybeExpireCalls } from "@/lib/call";
import { maybeFillWarpGeo } from "@/lib/warpPool";
import { driverTier } from "@/lib/types";
import { notifyRouteAlerts } from "@/lib/alerts";
import { notifyDrivers } from "@/lib/drivers";
import { CAR_REQUIRED, carReady } from "@/lib/car";
import { grant } from "@/lib/credits";
import { PHOTO_REQUIRED, hasPhoto, isVerified } from "@/lib/verify";
import { allowedTags, getKeywords, tagLabels } from "@/lib/keywords";
import { body, currentUserId, db, ensureSchema, fail, hasDb, isUuid, json, needLogin, carPhotoUrl, photoUrl, text } from "@/lib/server";
import { samplePosts } from "@/lib/sample";
import { after } from "next/server";
import { fillPostAreas } from "@/lib/area";
import { fillPostCoords } from "@/lib/geofill";
import { pingIndexNow } from "@/lib/indexnow";
import { maybeRunRepostReminders } from "@/lib/repostRemind";
import { MAX_PRICE, nextOccurrence, priceAllowedAt, priceAllowedRegular, toMinutes, validDays } from "@/lib/time";

export const dynamic = "force-dynamic";

/** 한국 주변 범위의 좌표만 받는다. 아니면 둘 다 null. */
function coord(lat: unknown, lng: unknown): [number | null, number | null] {
  const a = Number(lat);
  const o = Number(lng);
  const ok = lat != null && lng != null && Number.isFinite(a) && Number.isFinite(o) && a > 32 && a < 40 && o > 123 && o < 133;
  return ok ? [a, o] : [null, null];
}

/**
 * 비용 방식을 정한다. 금액 입력(fixed)은 허용 조건(allowed)을 만족할 때만,
 * 미터기 나눔은 출퇴근 카풀에서만 가능하고 그 밖에는 무료로 저장한다.
 */
function costOf(b: Record<string, unknown>, commute: boolean, allowed: boolean): { cost: string; price: number; error?: string } {
  if (b.cost === "fixed" && commute && allowed) {
    const price = Math.round(Number(b.price) / 100) * 100;
    if (!(price >= 500 && price <= MAX_PRICE)) return { cost: "free", price: 0, error: `금액은 500원에서 ${MAX_PRICE.toLocaleString("ko-KR")}원 사이로 입력해 주세요.` };
    return { cost: "fixed", price };
  }
  return { cost: b.cost === "meter" && commute ? "meter" : "free", price: 0 };
}

export async function GET(req: Request) {
  if (!hasDb()) return json({ sample: true, posts: samplePosts() });
  try {
    await ensureSchema();
    const me = await currentUserId();
    const mine = new URL(req.url).searchParams.get("mine") === "1";
    if (mine && !me) return needLogin();
    // ?id=글ID: 그 글 하나만(목록 300개 밖의 글도 매칭·알림에서 바로 열 수 있게, 2026-11-06). 공개 조건은 목록과 같다.
    const oneRaw = new URL(req.url).searchParams.get("id");
    const one = isUuid(oneRaw) ? oneRaw : null;
    // 검색·더 보기(2026-11-14 사용자 지시 "건수는 총 등록 건수, 검색은 전체 대상"): q = 띄어쓰기로 나눈 낱말이 모두 들어간 글(장소·지역·글쓴이·고유코드·메모, '정기'/'정기카풀'은 정기카풀 글),
    // offset = 다음 300건, count=1 = 공개 글 전체 수만.
    const sp = new URL(req.url).searchParams;
    const words = (sp.get("q") ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5).map((w) => w.slice(0, 30));
    const qw = words.length ? words : null;
    const offset = Math.max(0, Math.min(20000, Math.floor(Number(sp.get("offset")) || 0)));
    const sql = db();
    if (!mine && sp.get("count") === "1") {
      const c = await sql`select count(*)::int as n from posts p join users u on u.id = p.user_id
        where (p.status in ('open', 'progress') or (p.status = 'closed' and not u.test and not p.demo))
          and not u.blocked and u.withdrawn_at is null and (not p.demo or p.demo_shown)
          and (p.regular or p.depart_at > now() - interval '7 days' or not u.test)
          and not exists (select 1 from blocks k where (k.blocker = ${me} and k.blocked = p.user_id) or (k.blocker = p.user_id and k.blocked = ${me}))
          and (${qw}::text[] is null or (select bool_and(case when w in ('정기', '정기카풀') then p.regular
                else lower(concat_ws(' ', p.origin, p.dest, p.origin_area, p.dest_area, u.name, u.member_code, p.note)) like '%' || w || '%' end) from unnest(${qw}::text[]) w))`;
      return json({ total: Number(c[0]?.n ?? 0) });
    }
    const rows = mine
      ? await sql`select p.*, u.name as owner, u.member_code as owner_code, u.bio as owner_bio, u.photo_v, u.car_v, u.car_no as owner_car_no, u.tier_set as owner_tier_set, u.test as owner_test, u.blocked as owner_blocked,
                         (not p.regular and p.depart_at <= now() - interval '7 days') as expired,
                         (not p.regular and p.depart_at <= now()) as ended,
                         (select count(*)::int from calls c where c.post_id = p.id or c.source_post_id = p.id) as call_count,
                         (select count(*)::int from call_recipients r join calls c on c.id = r.call_id where c.post_id = p.id or c.source_post_id = p.id) as call_notified,
                         (select count(*)::int from call_accepts a join calls c on c.id = a.call_id where c.post_id = p.id or c.source_post_id = p.id) as call_accepts,
                         (select max(c.created_at) from calls c where c.post_id = p.id or c.source_post_id = p.id) as call_at
                  from posts p join users u on u.id = p.user_id
                  where p.user_id = ${me} order by p.regular desc, p.depart_at desc limit 100`
      : await sql`select p.*, u.name as owner, u.member_code as owner_code, u.bio as owner_bio, u.photo_v, u.car_v, u.car_no as owner_car_no, u.tier_set as owner_tier_set, u.test as owner_test, false as owner_blocked, false as expired,
                         (not p.regular and p.depart_at <= now()) as ended,
                         (select count(*)::int from calls c where c.post_id = p.id or c.source_post_id = p.id) as call_count,
                         (select count(*)::int from call_recipients r join calls c on c.id = r.call_id where c.post_id = p.id or c.source_post_id = p.id) as call_notified,
                         (select count(*)::int from call_accepts a join calls c on c.id = a.call_id where c.post_id = p.id or c.source_post_id = p.id) as call_accepts,
                         (select max(c.created_at) from calls c where c.post_id = p.id or c.source_post_id = p.id) as call_at
                  from posts p join users u on u.id = p.user_id
                  where (p.status in ('open', 'progress') or (p.status = 'closed' and not u.test and not p.demo))
                    and not u.blocked and u.withdrawn_at is null and (not p.demo or p.demo_shown)
                    and (p.regular or p.depart_at > now() - interval '7 days' or not u.test)
                    and not exists (select 1 from blocks k where (k.blocker = ${me} and k.blocked = p.user_id) or (k.blocker = p.user_id and k.blocked = ${me}))
                    and (${one}::uuid is null or p.id = ${one}::uuid)
                    and (${qw}::text[] is null or (select bool_and(case when w in ('정기', '정기카풀') then p.regular
                          else lower(concat_ws(' ', p.origin, p.dest, p.origin_area, p.dest_area, u.name, u.member_code, p.note)) like '%' || w || '%' end) from unnest(${qw}::text[]) w))
                  -- 정기 매칭(워프 명단)에서 한꺼번에 올린 글(warp_code가 영문 코드)은 뒤로(2026-11-05 사용자 요청, 약 6천 건 예정):
                  -- 최근 300건을 고를 때 실제 회원 글이 밀려나지 않게 서버에서도 먼저 실제 글을 고른다.
                  order by (p.source = 'warp' and coalesce(p.warp_code, '') ~ '^[A-Z]{6,12}$'), p.created_at desc, p.id limit 300 offset ${offset}`;
    const now = Date.now();
    const kw = await getKeywords();
    const posts = rows.map((r) => ({
      tagIds: (r.tags as string[]) ?? [],
      tags: tagLabels(kw, r.tags),
      id: r.id,
      ownerId: r.user_id,
      taxiShare: r.taxi_share === true,
      owner: r.owner || "회원",
      ownerCode: r.owner_code || "",
      ownerBio: r.owner_bio,
      ownerPhoto: photoUrl(r.user_id, r.photo_v),
      carPhoto: r.role === "driver" ? carPhotoUrl(r.user_id, r.car_v) : "",
      ownerTier: r.role === "driver" ? driverTier({ carNo: r.owner_car_no, carPhoto: carPhotoUrl(r.user_id, r.car_v), photo: photoUrl(r.user_id, r.photo_v), tierSet: r.owner_tier_set }) : "",
      role: r.role,
      kind: r.kind,
      fromWarp: r.source === "warp",
      warpPool: r.source === "warp" && /^[A-Z]{6,12}$/.test(String(r.warp_code ?? "")),
      cost: r.cost,
      price: r.price,
      regular: r.regular,
      leg: r.leg === "back" ? "back" : "go",
      days: r.days,
      timeGo: r.time_go,
      timeBack: r.time_back,
      origin: r.origin,
      dest: r.dest,
      originArea: r.origin_area ?? "",
      destArea: r.dest_area ?? "",
      originLat: r.origin_lat,
      originLng: r.origin_lng,
      destLat: r.dest_lat,
      destLng: r.dest_lng,
      // 정기카풀은 다음 출발 시각을 그때그때 계산한다.
      departAt: r.regular ? nextOccurrence(String(r.days), String(r.time_go), now) : new Date(r.depart_at as string).getTime(),
      seats: r.seats,
      note: r.note,
      status: r.status,
      mine: !!me && r.user_id === me,
      // 출발 시각이 지난 일회성 글: 목록에 '종료'로 남고 신청은 받지 않는다.
      ended: !!r.ended,
      // CALL을 보낸 기록이 있는 글(원래 글과 그 호출 글 모두). 개수·알림·수락은 글 주인에게만 보인다.
      call: Number(r.call_count ?? 0) > 0 ? (() => { const mineCall = !!me && r.user_id === me; return { count: Number(r.call_count), notified: mineCall ? Number(r.call_notified ?? 0) : 0, accepts: mineCall ? Number(r.call_accepts ?? 0) : 0, at: r.call_at ? new Date(r.call_at as string).getTime() : 0, mine: mineCall }; })() : null,
      // 최신순에서 실사용자 글을 임시글·테스트 계정 글보다 위에 두기 위한 표시
      demo: r.demo === true,
      ownerTest: r.owner_test === true,
      createdAt: new Date(r.created_at as string).getTime(),
      remind: r.remind !== false,
      // 내 글 목록에서만: 다른 회원 목록에 보이지 않는 이유
      hidden: me && r.user_id === me ? (r.owner_blocked ? "blocked" : r.owner_test ? "test" : r.expired ? "expired" : "") : undefined,
    }));
    // 출발 임박순, 종료된 글은 맨 아래(최근에 끝난 순)
    // 지역 이름이 빠진 글은 응답을 보낸 뒤에 조금씩 채운다(첫 화면을 막지 않음).
    // 위치 없이 이름만 있는 글을 먼저 채우고, 이어서 지역 글씨를 채운다.
    after(() => fillPostCoords().catch((e) => console.error("[geofill]", e)).then(() => fillPostAreas()).catch(() => {}));
    after(() => maybeRunRepostReminders().catch((e) => console.error("[repost-remind]", e)));
    // 워프동기화: 대신 올릴 워프 글 처리(3분에 한 번, 응답 뒤)
    after(() => maybeRunWarpSync().catch((e) => console.error("[warp-sync]", e)));
    // 대량 메일 자동 이어 보내기(안전장치: 9~20시, 하루 몫, 반송률 2% 넘으면 멈춤). 10분에 한 번
    after(() => maybeRunAutoMail().catch((e) => console.error("[mail-auto]", e)));
    // 정기 매칭 일괄 게시·안내 메일(켜져 있을 때만, 3분에 한 번)
    after(() => maybeRunPoolJob().catch((e) => console.error("[pool-job]", e)));
    // 알림톡 발송 작업(관리자가 시작했을 때만, 3분에 한 번)
    // 안심동행 안심 체크 푸시·무응답·도착 지연(진행 중인 건이 있을 때만, 1분에 한 번)
    // CALL 자동 마감(출발 15분 전까지 수락 없으면 끝내고 알림)
    after(() => maybeExpireCalls().catch((e) => console.error("[call-expire]", e)));
    after(() => maybeRunSafetyChecks().catch((e) => console.error("[safety-job]", e)));
    after(() => maybeFillWarpGeo().catch((e) => console.error("[warp-geo-job]", e)));
    after(() => maybeRunKakaoJob().catch((e) => console.error("[kakao]", e)));
    if (!mine) posts.sort((a, b) => (a.ended === b.ended ? (a.ended ? b.departAt - a.departAt : a.departAt - b.departAt) : a.ended ? 1 : -1));
    return json({ sample: false, posts });
  } catch (e) {
    return fail(e);
  }
}

/** 한 번짜리 글의 입력을 검사해 저장할 값으로 정리한다. 등록과 수정이 함께 쓴다. */
function oneTime(b: Record<string, unknown>) {
  const role = b.role === "rider" ? "rider" : "driver";
  const kind = b.kind === "trip" ? "trip" : "commute";
  const origin = text(b.origin, 60);
  const dest = text(b.dest, 60);
  const departAt = new Date(Number(b.departAt));
  const seats = Math.round(Number(b.seats));
  const [oLat, oLng] = coord(b.originLat, b.originLng);
  const [dLat, dLng] = coord(b.destLat, b.destLng);
  if (origin.length < 2 || dest.length < 2) return { error: "출발지와 도착지를 입력해 주세요." };
  if (Number.isNaN(departAt.getTime()) || departAt.getTime() < Date.now() - 3600_000 || departAt.getTime() > Date.now() + 90 * 86400_000)
    return { error: "출발 일시를 확인해 주세요." };
  if (!(seats >= 1 && seats <= 6)) return { error: "인원은 1~6명으로 입력해 주세요." };
  const c = costOf(b, kind === "commute", priceAllowedAt(departAt.getTime()));
  if (c.error) return { error: c.error };
  return { v: { role, kind, origin, dest, at: departAt.toISOString(), seats, oLat, oLng, dLat, dLng, cost: c.cost, price: c.price, note: text(b.note, 300), taxiShare: false } };
}

/** 한 번짜리 카풀 등록 */
export async function POST(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b0 = await body(req);
  const r = { ...oneTime(b0), tags: b0.tags };
  if (!r.v) return json({ error: r.error }, 400);
  const v = r.v;
  try {
    await ensureSchema();
    if (!(await isVerified(me))) return json({ error: "이메일 인증을 마치면 글을 올릴 수 있어요. 메일함을 확인해 주세요." }, 403);
    if (!(await hasPhoto(me))) return json({ error: PHOTO_REQUIRED }, 403);
    const sql = db();
    if (v.role === "driver" && !(await carReady(me))) return json({ error: CAR_REQUIRED }, 403);
    const open = await sql`select count(*)::int as n from posts where user_id = ${me} and status = 'open' and not regular and depart_at > now()`;
    if ((open[0].n as number) >= 10) return json({ error: "진행 중인 글은 10개까지 올릴 수 있습니다." }, 429);
    const tags = allowedTags(await getKeywords(), r.tags, v.role, v.cost);
    const hadPost = (await sql`select 1 from posts where user_id = ${me} limit 1`).length > 0;
    const rows = await sql`
      insert into posts (user_id, role, kind, cost, price, origin, dest, depart_at, seats, note, origin_lat, origin_lng, dest_lat, dest_lng, tags, taxi_share)
      values (${me}, ${v.role}, ${v.kind}, ${v.cost}, ${v.price}, ${v.origin}, ${v.dest}, ${v.at}, ${v.seats}, ${v.note},
              ${v.oLat}, ${v.oLng}, ${v.dLat}, ${v.dLng}, ${tags}::text[], ${v.taxiShare})
      returning id`;
    const credit = (await grant(me, "post").catch(() => 0)) + (hadPost ? 0 : await grant(me, "firstpost").catch(() => 0));
    await notifyRouteAlerts(String(rows[0].id));
    if (v.role === "rider") await notifyDrivers(String(rows[0].id));
    // 새 글 주소를 검색엔진에 알린다(응답 뒤, 실패해도 무시).
    after(() => pingIndexNow([`/post/${rows[0].id}`]).catch(() => {}));
    return json({ id: rows[0].id, credit });
  } catch (e) {
    return fail(e);
  }
}

/** 내 출퇴근 정보를 정기카풀 글로 게시(이미 있으면 고친다). 회원당 하나만 둔다. */
export async function PUT(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  const role = b.role === "rider" ? "rider" : "driver";
  const origin = text(b.origin, 60);
  const dest = text(b.dest, 60);
  const days = b.days;
  const timeGo = text(b.timeGo, 5);
  const timeBack = text(b.timeBack, 5);
  const seats = Math.round(Number(b.seats));
  const [oLat, oLng] = coord(b.originLat, b.originLng);
  const [dLat, dLng] = coord(b.destLat, b.destLng);
  if (origin.length < 2 || dest.length < 2) return json({ error: "출발지와 도착지를 입력해 주세요." }, 400);
  if (!validDays(days)) return json({ error: "출퇴근 요일을 하나 이상 골라 주세요." }, 400);
  // 올릴 길: go(출근만) · both(출근·퇴근) · back(퇴근만, 2026-11-05 사용자 요청). 예전 화면은 퇴근 시각 유무로 판단.
  const legs: "go" | "both" | "back" = b.legs === "go" || b.legs === "both" || b.legs === "back" ? b.legs : timeBack ? "both" : "go";
  const goOn = legs !== "back";
  const backOn = legs !== "go";
  if (goOn && toMinutes(timeGo) < 0) return json({ error: "출근 출발 시각을 확인해 주세요." }, 400);
  if (backOn && toMinutes(timeBack) < 0) return json({ error: "퇴근 출발 시각을 확인해 주세요." }, 400);
  if (!(seats >= 1 && seats <= 6)) return json({ error: "인원은 1~6명으로 입력해 주세요." }, 400);
  const c = costOf(b, true, priceAllowedRegular(days, goOn ? timeGo : timeBack, goOn && backOn ? timeBack : ""));
  if (c.error) return json({ error: c.error }, 400);
  const sorted = [...days].sort().join("");
  const next = new Date(nextOccurrence(sorted, goOn ? timeGo : timeBack)).toISOString();
  // 퇴근만이면 출근 글은 숨김(설정값만 보관해 다음 수정 때 쓴다)
  const goStatus = goOn ? "open" : "hidden";
  const goBack = backOn ? timeBack : "";
  try {
    await ensureSchema();
    if (!(await isVerified(me))) return json({ error: "이메일 인증을 마치면 글을 올릴 수 있어요. 메일함을 확인해 주세요." }, 403);
    if (!(await hasPhoto(me))) return json({ error: PHOTO_REQUIRED }, 403);
    const sql = db();
    if (role === "driver" && !(await carReady(me))) return json({ error: CAR_REQUIRED }, 403);
    const tags = allowedTags(await getKeywords(), b.tags, role, c.cost);
    const note = text(b.note, 300);
    // 출근 글(leg = go): 기존과 같이 한 건을 고친다. 퇴근길도 함께면 퇴근 글(leg = back)을 따로 둔다.
    const goUpd = await sql`
      update posts set role = ${role}, cost = ${c.cost}, price = ${c.price}, origin = ${origin}, dest = ${dest},
        origin_lat = ${oLat}, origin_lng = ${oLng}, dest_lat = ${dLat}, dest_lng = ${dLng}, geo_tried_at = null,
        days = ${sorted}, time_go = ${timeGo}, time_back = ${goBack}, depart_at = ${next},
        seats = ${seats}, note = ${note}, status = ${goStatus}, tags = ${tags}::text[]
      where user_id = ${me} and regular and leg = 'go' returning id`;
    let id: string;
    let updated = goUpd.length > 0;
    let credit = 0;
    if (updated) {
      id = String(goUpd[0].id);
    } else {
      const hadPost = (await sql`select 1 from posts where user_id = ${me} limit 1`).length > 0;
      const rows = await sql`
        insert into posts (user_id, role, kind, cost, price, origin, dest, depart_at, seats, note, origin_lat, origin_lng, dest_lat, dest_lng,
                           regular, days, time_go, time_back, tags, leg, status)
        values (${me}, ${role}, 'commute', ${c.cost}, ${c.price}, ${origin}, ${dest}, ${next}, ${seats}, ${note},
                ${oLat}, ${oLng}, ${dLat}, ${dLng}, true, ${sorted}, ${timeGo}, ${goBack}, ${tags}::text[], 'go', ${goStatus})
        returning id`;
      id = String(rows[0].id);
      credit = (await grant(me, "post").catch(() => 0)) + (hadPost ? 0 : await grant(me, "firstpost").catch(() => 0));
      if (goOn) {
        const goId = id;
        await notifyRouteAlerts(goId);
        after(() => pingIndexNow([`/post/${goId}`]).catch(() => {}));
      }
    }
    // 퇴근 글: 출발·도착을 바꾸고 시각은 퇴근 시각. 퇴근길을 껐으면 기존 퇴근 글은 마감한다.
    if (backOn) {
      const backNext = new Date(nextOccurrence(sorted, timeBack)).toISOString();
      const backUpd = await sql`
        update posts set role = ${role}, cost = ${c.cost}, price = ${c.price}, origin = ${dest}, dest = ${origin},
          origin_lat = ${dLat}, origin_lng = ${dLng}, dest_lat = ${oLat}, dest_lng = ${oLng}, geo_tried_at = null,
          days = ${sorted}, time_go = ${timeBack}, time_back = '', depart_at = ${backNext},
          seats = ${seats}, note = ${note}, status = 'open', tags = ${tags}::text[]
        where user_id = ${me} and regular and leg = 'back' returning id`;
      if (!backUpd.length) {
        const back = await sql`
          insert into posts (user_id, role, kind, cost, price, origin, dest, depart_at, seats, note, origin_lat, origin_lng, dest_lat, dest_lng,
                             regular, days, time_go, time_back, tags, leg)
          values (${me}, ${role}, 'commute', ${c.cost}, ${c.price}, ${dest}, ${origin}, ${backNext}, ${seats}, ${note},
                  ${dLat}, ${dLng}, ${oLat}, ${oLng}, true, ${sorted}, ${timeBack}, '', ${tags}::text[], 'back')
          returning id`;
        await notifyRouteAlerts(String(back[0].id));
        if (!goOn) {
          const backId = String(back[0].id);
          after(() => pingIndexNow([`/post/${backId}`]).catch(() => {}));
        }
      }
    } else {
      await sql`update posts set status = 'closed' where user_id = ${me} and regular and leg = 'back' and status <> 'closed'`;
    }
    return json({ id, updated, credit, both: goOn && backOn, legs });
  } catch (e) {
    return fail(e);
  }
}

/** 내 글 수정(내용이 함께 오면) 또는 마감·다시 열기(status 만 오면) */
export async function PATCH(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const b = await body(req);
  if (!isUuid(b.id)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    const sql = db();
    if (typeof b.origin === "string") {
      const r = oneTime(b);
      if (!r.v) return json({ error: r.error }, 400);
      const v = r.v;
      // 정기카풀은 출퇴근 정보 창(PUT)에서 고친다.
      const rows = await sql`
        update posts set role = ${v.role}, kind = ${v.kind}, cost = ${v.cost}, price = ${v.price}, origin = ${v.origin}, dest = ${v.dest},
          depart_at = ${v.at}, seats = ${v.seats}, note = ${v.note}, tags = ${allowedTags(await getKeywords(), b.tags, v.role, v.cost)}::text[],
          origin_lat = ${v.oLat}, origin_lng = ${v.oLng}, dest_lat = ${v.dLat}, dest_lng = ${v.dLng}, geo_tried_at = null
        where id = ${b.id} and user_id = ${me} and not regular returning id`;
      if (!rows.length) return json({ error: "권한이 없습니다." }, 403);
      return json({ ok: true });
    }
    // 다시 올리기 하루 전 알림 켜기·끄기 {id, remind}
    if (typeof b.remind === "boolean") {
      await sql`update posts set remind = ${b.remind} where id = ${b.id} and user_id = ${me} and not regular`;
      return json({ ok: true });
    }
    // 'progress'(카풀 진행 중)는 탑승자 글에만 쓴다: 목록에는 남지만 새 신청은 받지 않는다.
    const status = b.status === "open" ? "open" : b.status === "progress" ? "progress" : "closed";
    await sql`update posts set status = case when ${status} = 'progress' and role <> 'rider' then 'closed' else ${status} end where id = ${b.id} and user_id = ${me}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  const me = await currentUserId();
  if (!me) return needLogin();
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return json({ error: "잘못된 요청입니다." }, 400);
  try {
    await ensureSchema();
    await db()`delete from posts where id = ${id} and user_id = ${me}`;
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
