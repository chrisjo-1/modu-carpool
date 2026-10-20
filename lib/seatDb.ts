import { neon } from "@neondatabase/serverless";
import type { SubwayPlan } from "./subway";
import { rankCandidates, seatPair, type Candidate, type SeatPair, type SeatPlanRow } from "./seatMatch";
import { compareCarNo, type CarMatch } from "./subwayPosition";

/**
 * 앉아가기 전용 저장소(modu-seat). 모카 본 DB(DATABASE_URL)와 분리해 SEAT_DATABASE_URL로 접속한다.
 * 회원 정보(로그인·모드)는 모카 본 DB를 그대로 쓰고, 여기에는 user_id만 둔다.
 */
export const seatDbReady = () => !!process.env.SEAT_DATABASE_URL;

export function seatSql() {
  return neon(process.env.SEAT_DATABASE_URL as string);
}

let ready: Promise<void> | null = null;

/** 테이블과 인덱스 만들기. 내용이 바뀌면 배포 후 첫 요청에서 한 번만 다시 돈다. */
async function buildSeatSchema(sql: ReturnType<typeof seatSql>) {
  await sql`create table if not exists seat_plans (
    id bigserial primary key,
    user_id text not null,
    days text not null default '12345',
    board_line text not null,
    board_station text not null,
    time_go text not null,
    board_car text not null,
    board_gate text not null default '',
    alight_line text not null,
    alight_station text not null,
    back boolean not null default true,
    time_back text not null default '',
    back_car text not null default '',
    back_gate text not null default '',
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now())`;
  // 한 회원은 활성 등록을 하나만 가진다.
  await sql`create unique index if not exists seat_plans_active_uniq on seat_plans (user_id) where status = 'active'`;
  await sql`create index if not exists seat_plans_match_idx on seat_plans (board_line, alight_line) where status = 'active'`;
  await sql`create table if not exists seat_requests (
    id uuid primary key default gen_random_uuid(),
    from_user text not null,
    to_user text not null,
    from_plan bigint not null references seat_plans(id) on delete cascade,
    to_plan bigint not null references seat_plans(id) on delete cascade,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    responded_at timestamptz,
    unique (from_plan, to_plan))`;
  await sql`create index if not exists seat_requests_to_idx on seat_requests (to_user, status)`;
  // 입구 안내용 착석 기록. 회원 번호를 넣지 않는다(익명 집계).
  await sql`create table if not exists seat_feedback (
    id bigserial primary key,
    line text not null,
    station text not null,
    dir text not null,
    dow text not null,
    slot text not null,
    car text not null,
    entrance text not null,
    seated boolean not null,
    created_at timestamptz not null default now())`;
  await sql`create index if not exists seat_feedback_lookup on seat_feedback (line, station, dir, dow, slot)`;
  // 매칭된 두 사람이 탑승 후 넣는 차량 번호. 같은 칸 확인에만 쓰고 하루 뒤 지운다.
  await sql`create table if not exists seat_car_confirm (
    request_id uuid not null references seat_requests(id) on delete cascade,
    user_id text not null,
    car_no text not null,
    created_at timestamptz not null default now(),
    primary key (request_id, user_id))`;
  // 요청 종류: manual(직접 요청), call(CALL로 보낸 요청)
  await sql`alter table seat_requests add column if not exists kind text not null default 'manual'`;
  // 오늘 앉은 자리 위치(칸-문·왼쪽/오른쪽·메모). 수락된 상대에게만 보인다. 날짜가 바뀌면 다시 입력한다.
  await sql`create table if not exists seat_spots (
    user_id text not null,
    day text not null,
    car text not null,
    door text not null,
    side text not null default '',
    memo text not null default '',
    updated_at timestamptz not null default now(),
    primary key (user_id, day))`;
  // 그림에서 고른 좌석(예: A2-4). lib/subwayPosition.ts parseSeat 형식.
  await sql`alter table seat_spots add column if not exists seat text not null default ''`;
  // 등록한 방면(다음 역): 출근·퇴근. 매칭은 출근 방면을 쓴다.
  await sql`alter table seat_plans add column if not exists board_next text not null default ''`;
  await sql`alter table seat_plans add column if not exists back_next text not null default ''`;
  // 오늘의 힌트 사진(선택, JPEG base64). 오늘 하루치만 두고 이틀 지난 자리 정보와 함께 지운다.
  await sql`alter table seat_spots add column if not exists photo text not null default ''`;
  // 수락된 매칭끼리의 대화(카풀 채팅과 별도 저장소).
  await sql`create table if not exists seat_messages (
    id bigserial primary key,
    request_id uuid not null references seat_requests(id) on delete cascade,
    user_id text not null,
    body text not null,
    created_at timestamptz not null default now())`;
  await sql`create index if not exists seat_messages_req on seat_messages (request_id, id)`;
}

function textHash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
}

/** 스키마 준비(인스턴스당 1회). seat_meta.schema_hash 가 지금 코드와 같으면 DDL을 건너뛴다(조회 1번). */
export function ensureSeatSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const sql = seatSql();
      const want = textHash(buildSeatSchema.toString());
      let have = "";
      try {
        const r = await sql`select value from seat_meta where key = 'schema_hash'`;
        have = r.length ? String(r[0].value) : "";
      } catch {
        /* 처음이라 seat_meta 표가 없다 */
      }
      if (have === want) return;
      await buildSeatSchema(sql);
      await sql`create table if not exists seat_meta (key text primary key, value text not null)`;
      await sql`insert into seat_meta (key, value) values ('schema_hash', ${want}) on conflict (key) do update set value = excluded.value`;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

type Raw = Record<string, unknown>;

export function toRow(r: Raw): SeatPlanRow {
  return {
    id: Number(r.id),
    userId: String(r.user_id),
    days: String(r.days),
    boardLine: String(r.board_line),
    boardStation: String(r.board_station),
    alightLine: String(r.alight_line),
    alightStation: String(r.alight_station),
    timeGo: String(r.time_go),
    boardCar: String(r.board_car),
    boardGate: String(r.board_gate),
    back: Boolean(r.back),
    timeBack: String(r.time_back),
    backCar: String(r.back_car),
    backGate: String(r.back_gate),
    boardNext: String(r.board_next ?? ""),
    backNext: String(r.back_next ?? ""),
  };
}

/** 등록 행을 화면의 입력 값(SubwayPlan)으로 바꾼다. */
export function toSubwayPlan(p: SeatPlanRow): SubwayPlan {
  return {
    boardLine: p.boardLine,
    board: p.boardStation,
    alightLine: p.alightLine,
    alight: p.alightStation,
    timeGo: p.timeGo,
    car: p.boardCar,
    gate: p.boardGate,
    back: p.back,
    timeBack: p.timeBack,
    carBack: p.backCar,
    gateBack: p.backGate,
    boardNext: p.boardNext,
    backNext: p.backNext,
  };
}

export async function getMyPlan(userId: string): Promise<SeatPlanRow | null> {
  await ensureSeatSchema();
  const rows = await seatSql()`select * from seat_plans where user_id = ${userId} and status = 'active' limit 1`;
  return rows.length ? toRow(rows[0] as Raw) : null;
}

/** 등록을 저장한다. 이미 있으면 그 내용을 고친다. */
export async function upsertPlan(userId: string, days: string, p: SubwayPlan): Promise<SeatPlanRow> {
  await ensureSeatSchema();
  const back = p.back;
  const rows = await seatSql()`insert into seat_plans
      (user_id, days, board_line, board_station, time_go, board_car, board_gate,
       alight_line, alight_station, back, time_back, back_car, back_gate, board_next, back_next, status, updated_at)
    values (${userId}, ${days}, ${p.boardLine}, ${p.board}, ${p.timeGo}, ${p.car}, ${p.gate},
       ${p.alightLine}, ${p.alight}, ${back}, ${back ? p.timeBack : ""}, ${back ? p.carBack : ""}, ${back ? p.gateBack : ""}, ${p.boardNext}, ${back ? p.backNext : ""}, 'active', now())
    on conflict (user_id) where status = 'active' do update set
      days = excluded.days, board_line = excluded.board_line, board_station = excluded.board_station,
      time_go = excluded.time_go, board_car = excluded.board_car, board_gate = excluded.board_gate,
      alight_line = excluded.alight_line, alight_station = excluded.alight_station,
      back = excluded.back, time_back = excluded.time_back, back_car = excluded.back_car,
      back_gate = excluded.back_gate, board_next = excluded.board_next, back_next = excluded.back_next, updated_at = now()
    returning *`;
  return toRow(rows[0] as Raw);
}

/** 등록을 해제한다(기록은 남기고 상태만 닫는다). */
export async function closePlan(userId: string): Promise<void> {
  await ensureSeatSchema();
  await seatSql()`update seat_plans set status = 'closed', updated_at = now() where user_id = ${userId} and status = 'active'`;
}

/** 같은 노선의 활성 등록 중 내 것이 아닌 것들을 가져온다. 방향·정거장·시각 판정은 rankCandidates가 한다(출근만). */
export async function listCandidates(me: SeatPlanRow): Promise<Candidate[]> {
  await ensureSeatSchema();
  const rows = await seatSql()`select * from seat_plans
    where status = 'active' and board_line = ${me.boardLine} and alight_line = ${me.boardLine} and user_id <> ${me.userId}`;
  return rankCandidates(me, rows.map((r) => toRow(r as Raw)));
}

/** 후보에게 앉아가기 요청을 보낸다. 규칙에 맞는 후보에게만 보낼 수 있다. */
export async function createRequest(fromUser: string, toPlanId: number, kind: "manual" | "call" = "manual"): Promise<{ ok: true; id: string; toUser: string } | { ok: false; error: string }> {
  await ensureSeatSchema();
  const sql = seatSql();
  const mine = await getMyPlan(fromUser);
  if (!mine) return { ok: false, error: "먼저 앉아가기 등록을 저장해 주세요." };
  const target = await sql`select * from seat_plans where id = ${toPlanId} and status = 'active' limit 1`;
  if (!target.length) return { ok: false, error: "이미 해제된 등록이에요." };
  const t = toRow(target[0] as Raw);
  if (t.userId === fromUser) return { ok: false, error: "내 등록에는 요청할 수 없어요." };
  if (!rankCandidates(mine, [t]).length) return { ok: false, error: "시간이나 역이 맞지 않아 요청할 수 없어요." };
  const rows = await sql`insert into seat_requests (from_user, to_user, from_plan, to_plan, kind)
    values (${fromUser}, ${t.userId}, ${mine.id}, ${t.id}, ${kind})
    on conflict (from_plan, to_plan) do nothing returning id`;
  if (!rows.length) return { ok: false, error: "이미 요청을 보냈어요." };
  return { ok: true, id: String(rows[0].id), toUser: t.userId };
}

/** 받은 요청을 수락하거나 거절한다. 받은 사람만 처리할 수 있다. */
export async function respondRequest(requestId: string, toUser: string, accept: boolean): Promise<{ ok: true; status: string; fromUser: string } | { ok: false; error: string }> {
  await ensureSeatSchema();
  const status = accept ? "accepted" : "declined";
  const rows = await seatSql()`update seat_requests set status = ${status}, responded_at = now()
    where id = ${requestId} and to_user = ${toUser} and status = 'pending' returning status, from_user`;
  if (!rows.length) return { ok: false, error: "처리할 요청이 없거나 이미 처리됐어요." };
  return { ok: true, status: String(rows[0].status), fromUser: String(rows[0].from_user) };
}

export type RequestView = {
  id: string;
  status: string;
  incoming: boolean;
  otherPlanId: number;
  /** 상대의 탑승 시각 */
  otherTime: string;
  /** 상대 회원 번호(서버 안에서만 쓴다. 화면으로 보내지 않는다) */
  otherUser: string;
  /** 자리 나눔 정보(take = 내가 받음, give = 내 자리를 상대가 받음). 등록이 바뀌어 더 맞지 않으면 null */
  pair: (SeatPair & { role: "take" | "give" }) | null;
};

/** 내가 받은 요청과 보낸 요청. 상대의 회원 번호는 주지 않고 역·시각·칸-문만 보여 준다. */
export async function listRequests(userId: string): Promise<{ incoming: RequestView[]; outgoing: RequestView[] }> {
  await ensureSeatSchema();
  const sql = seatSql();
  const rows = await sql`select id, status, from_user, to_user, from_plan, to_plan from seat_requests
    where from_user = ${userId} or to_user = ${userId} order by created_at desc limit 100`;
  const ids = [...new Set(rows.flatMap((r) => [Number(r.from_plan), Number(r.to_plan)]))];
  const plans = ids.length ? await sql`select * from seat_plans where id = any(${ids})` : [];
  const byId = new Map(plans.map((p) => [Number(p.id), toRow(p as Raw)]));
  const view: RequestView[] = rows.map((r) => {
    const incoming = String(r.to_user) === userId;
    const mine = byId.get(Number(incoming ? r.to_plan : r.from_plan));
    const other = byId.get(Number(incoming ? r.from_plan : r.to_plan));
    let pair: RequestView["pair"] = null;
    if (mine && other) {
      const take = seatPair(mine, other);
      const give = take ? null : seatPair(other, mine);
      pair = take ? { ...take, role: "take" } : give ? { ...give, role: "give" } : null;
    }
    return { id: String(r.id), status: String(r.status), incoming, otherPlanId: other?.id ?? 0, otherTime: other?.timeGo ?? "", otherUser: String(incoming ? r.from_user : r.to_user), pair };
  });
  return { incoming: view.filter((v) => v.incoming), outgoing: view.filter((v) => !v.incoming) };
}

/** 수락된 매칭의 당사자인지 확인하고 노선을 돌려준다. */
async function acceptedMatch(requestId: string, userId: string): Promise<string | null> {
  const rows = await seatSql()`select p.board_line from seat_requests r join seat_plans p on p.id = r.to_plan
    where r.id = ${requestId} and r.status = 'accepted' and (r.from_user = ${userId} or r.to_user = ${userId}) limit 1`;
  return rows.length ? String(rows[0].board_line) : null;
}

/** 두 사람의 차량 번호를 비교한다. 한쪽만 넣었으면 null(기다리는 중). 상대 번호는 돌려주지 않는다. */
async function compareFor(requestId: string, userId: string, line: string): Promise<{ mine: string; result: CarMatch | null }> {
  const rows = await seatSql()`select user_id, car_no from seat_car_confirm where request_id = ${requestId}`;
  const mine = rows.find((r) => String(r.user_id) === userId);
  const other = rows.find((r) => String(r.user_id) !== userId);
  const myNo = mine ? String(mine.car_no) : "";
  return { mine: myNo, result: myNo && other ? compareCarNo(line, myNo, String(other.car_no)) : null };
}

export type ConfirmResult = { ok: true; mine: string; result: CarMatch | null } | { ok: false; error: string };

/** 탑승 후 차량 번호를 넣는다(선택 기능). 하루가 지난 기록은 먼저 지운다. */
export async function submitCarNo(requestId: string, userId: string, carNo: string): Promise<ConfirmResult> {
  await ensureSeatSchema();
  const sql = seatSql();
  await sql`delete from seat_car_confirm where created_at < now() - interval '1 day'`;
  const line = await acceptedMatch(requestId, userId);
  if (!line) return { ok: false, error: "확인할 매칭이 없어요." };
  await sql`insert into seat_car_confirm (request_id, user_id, car_no) values (${requestId}, ${userId}, ${carNo})
    on conflict (request_id, user_id) do update set car_no = excluded.car_no, created_at = now()`;
  return { ok: true, ...(await compareFor(requestId, userId, line)) };
}

/** 지금까지 넣은 차량 번호 확인 상태. */
export async function getCarConfirm(requestId: string, userId: string): Promise<ConfirmResult> {
  await ensureSeatSchema();
  const line = await acceptedMatch(requestId, userId);
  if (!line) return { ok: false, error: "확인할 매칭이 없어요." };
  return { ok: true, ...(await compareFor(requestId, userId, line)) };
}

/** 한국 날짜(YYYY-MM-DD). 자리 위치는 하루만 쓴다. */
export const seatDay = (t = Date.now()) => new Date(t + 9 * 3600_000).toISOString().slice(0, 10);

/** 활성 등록 전체(매일 아침 자동 알림용). */
export async function activePlans(): Promise<SeatPlanRow[]> {
  await ensureSeatSchema();
  const rows = await seatSql()`select * from seat_plans where status = 'active'`;
  return rows.map((r) => toRow(r as Raw));
}

/** CALL: 맞는 상대 모두에게 요청을 보낸다(희망·양보는 자동 판단). 이미 주고받은 상대는 건너뛴다. */
export async function callAll(userId: string): Promise<{ ok: true; sent: { toUser: string; role: "take" | "give"; stops: number }[] } | { ok: false; error: string }> {
  const mine = await getMyPlan(userId);
  if (!mine) return { ok: false, error: "먼저 지하철 출퇴근 정보를 등록해 주세요." };
  const cands = await listCandidates(mine);
  const sql = seatSql();
  const done = await sql`select from_plan, to_plan from seat_requests where from_plan = ${mine.id} or to_plan = ${mine.id}`;
  const touched = new Set(done.flatMap((r) => [Number(r.from_plan), Number(r.to_plan)]));
  const sent: { toUser: string; role: "take" | "give"; stops: number }[] = [];
  const seen = new Set<number>();
  for (const c of cands) {
    if (touched.has(c.id) || seen.has(c.id)) continue;
    seen.add(c.id);
    const r = await createRequest(userId, c.id, "call");
    if (r.ok) sent.push({ toUser: r.toUser, role: c.role, stops: c.stops });
  }
  return { ok: true, sent };
}

/** 수락된 매칭의 상대 회원 번호들(자리 위치를 알려 줄 대상). */
export async function acceptedPartners(userId: string): Promise<string[]> {
  await ensureSeatSchema();
  const rows = await seatSql()`select case when from_user = ${userId} then to_user else from_user end as other
    from seat_requests where status = 'accepted' and (from_user = ${userId} or to_user = ${userId})`;
  return [...new Set(rows.map((r) => String(r.other)))];
}

/** seat: 그림에서 고른 좌석(A2-4 형식, 없으면 ""), memo: 오늘의 힌트(옷 색깔·소지품 등) */
export type Spot = { car: string; door: string; side: "left" | "right" | ""; seat: string; memo: string; photo?: boolean };

/** 오늘 내 자리 위치. */
export async function getSpot(userId: string, day = seatDay()): Promise<Spot | null> {
  await ensureSeatSchema();
  const rows = await seatSql()`select car, door, side, seat, memo, (photo <> '') as has_photo from seat_spots where user_id = ${userId} and day = ${day}`;
  if (!rows.length) return null;
  const r = rows[0];
  return { car: String(r.car), door: String(r.door), side: (String(r.side) as Spot["side"]) || "", seat: String(r.seat ?? ""), memo: String(r.memo), photo: r.has_photo === true };
}

/** 오늘의 힌트 사진(base64). 없으면 "". */
export async function getSpotPhoto(userId: string, day = seatDay()): Promise<string> {
  await ensureSeatSchema();
  const rows = await seatSql()`select photo from seat_spots where user_id = ${userId} and day = ${day}`;
  return rows.length ? String(rows[0].photo ?? "") : "";
}

/** photo: undefined = 기존 사진 유지, "" = 지우기, base64 = 바꾸기 */
export async function setSpot(userId: string, s: Spot, day = seatDay(), photo?: string): Promise<void> {
  await ensureSeatSchema();
  const sql = seatSql();
  await sql`delete from seat_spots where day < ${seatDay(Date.now() - 2 * 86400_000)}`;
  await sql`insert into seat_spots (user_id, day, car, door, side, seat, memo, photo) values (${userId}, ${day}, ${s.car}, ${s.door}, ${s.side}, ${s.seat}, ${s.memo}, ${photo ?? ""})
    on conflict (user_id, day) do update set car = excluded.car, door = excluded.door, side = excluded.side, seat = excluded.seat, memo = excluded.memo,
      photo = case when ${photo === undefined} then seat_spots.photo else excluded.photo end, updated_at = now()`;
}

export async function clearSpot(userId: string, day = seatDay()): Promise<void> {
  await ensureSeatSchema();
  await seatSql()`delete from seat_spots where user_id = ${userId} and day = ${day}`;
}

/** 수락된 매칭의 상대 회원 번호. 당사자가 아니면 null. */
export async function matchPartner(requestId: string, userId: string): Promise<string | null> {
  await ensureSeatSchema();
  const rows = await seatSql()`select from_user, to_user from seat_requests
    where id = ${requestId} and status = 'accepted' and (from_user = ${userId} or to_user = ${userId}) limit 1`;
  if (!rows.length) return null;
  return String(rows[0].from_user) === userId ? String(rows[0].to_user) : String(rows[0].from_user);
}

export type ChatMsg = { id: number; mine: boolean; body: string; at: number };

export async function listSeatMessages(requestId: string, userId: string): Promise<ChatMsg[]> {
  const rows = await seatSql()`select id, user_id, body, created_at from seat_messages where request_id = ${requestId} order by id desc limit 100`;
  return rows.reverse().map((m) => ({ id: Number(m.id), mine: String(m.user_id) === userId, body: String(m.body), at: new Date(m.created_at as string).getTime() }));
}

export async function addSeatMessage(requestId: string, userId: string, body: string): Promise<void> {
  await seatSql()`insert into seat_messages (request_id, user_id, body) values (${requestId}, ${userId}, ${body})`;
}
