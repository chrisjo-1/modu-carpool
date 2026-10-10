import { db, ensureSchema } from "./server";
import { allowedTags, getKeywords, type Keywords } from "./keywords";
import { MAX_PRICE, nextOccurrence, priceAllowedAt, priceAllowedRegular } from "./time";

/** 관리자가 만드는 임시(예시) 게시물. 임시 회원 이름으로 올라가며, 관리자 화면에서 노출·삭제를 고른다. */
export const DEMO_EMAIL_LIKE = "demo-%@test.invalid";
export const DEMO_MAX = 100;

type Place = { name: string; lat: number; lng: number };
const PLACES: Place[] = [
  { name: "강남역", lat: 37.4979, lng: 127.0276 },
  { name: "판교역", lat: 37.3947, lng: 127.1112 },
  { name: "정자역", lat: 37.3670, lng: 127.1085 },
  { name: "수원 영통역", lat: 37.2519, lng: 127.0711 },
  { name: "여의도역", lat: 37.5216, lng: 126.9243 },
  { name: "서울역", lat: 37.5547, lng: 126.9707 },
  { name: "잠실역", lat: 37.5133, lng: 127.1001 },
  { name: "홍대입구역", lat: 37.5571, lng: 126.9245 },
  { name: "공덕역", lat: 37.5443, lng: 126.9516 },
  { name: "광화문", lat: 37.5759, lng: 126.9769 },
  { name: "성수역", lat: 37.5446, lng: 127.0560 },
  { name: "고속터미널역", lat: 37.5049, lng: 127.0049 },
  { name: "일산 대화역", lat: 37.6764, lng: 126.7467 },
  { name: "인천공항", lat: 37.4602, lng: 126.4407 },
  { name: "가평 청평역", lat: 37.7447, lng: 127.4224 },
  { name: "북촌 한옥마을", lat: 37.5826, lng: 126.9832 },
  { name: "남산타워", lat: 37.5512, lng: 126.9882 },
];
const NAMES = ["민준", "서연", "도윤", "지우", "하준", "수빈", "예준", "지민", "윤아", "현우", "소희", "태윤"];
const BIOS = ["판교·강남 출퇴근 5년차", "평일 출근만 해요", "주말 나들이도 좋아해요", "조용히 가는 편이에요", "안전운전 원칙입니다", "시간 약속 잘 지켜요"];
const NOTES = [
  "평일 매일 같이 가실 분 찾아요.",
  "짐은 작은 백팩 하나 정도예요.",
  "시간 맞춰 정확히 출발합니다.",
  "차에서 음악 크게 틀지 않아요.",
  "반려견 동반은 사전에 말씀 주세요.",
  "주말 나들이, 점심 같이 드실 분도 환영해요.",
  "중간에 편의점 한 번 들를 수 있어요.",
  "출발 전 메시지 주시면 바로 답해요.",
];

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const KST = 9 * 3600_000;
const DAY = 86400_000;

function subsetWeekdays(): string {
  const all = ["1", "2", "3", "4", "5"];
  const n = randInt(3, 5);
  return all.sort(() => Math.random() - 0.5).slice(0, n).sort().join("");
}

/** 키워드 후보에서 역할에 맞게 몇 개 고른다(저장 전 allowedTags 로 한 번 더 거른다). */
function tagsFor(kw: Keywords, role: string, cost: string): string[] {
  const pool = (role === "rider" ? kw.rider : kw.driver).map((k) => k.id);
  const ids = [...pool].sort(() => Math.random() - 0.5).slice(0, randInt(0, 2));
  if (role === "driver" && cost === "free" && kw.gift.length && Math.random() < 0.4) ids.push(pick(kw.gift).id);
  return allowedTags(kw, ids, role, cost);
}

type Owner = { id: string; name: string };

/** 임시 글 한 개의 내용을 무작위로 만든다. 출발 시각·비용·정기 여부 등 기능 조합을 골고루 섞는다. */
function makeOne(kw: Keywords, owner: Owner) {
  const now = Date.now();
  const role = Math.random() < 0.5 ? "driver" : "rider";
  const kind = Math.random() < 0.6 ? "commute" : "trip";
  const regular = kind === "commute" && Math.random() < 0.35;
  const ended = !regular && Math.random() < 0.12;
  const status = !ended && Math.random() < 0.12 ? "progress" : "open";
  const [o, d0] = [pick(PLACES), pick(PLACES)];
  const d = d0.name === o.name ? PLACES[(PLACES.indexOf(o) + 1) % PLACES.length] : d0;
  const seats = role === "driver" ? randInt(1, 4) : randInt(1, 2);
  const wantFixed = kind === "commute" && Math.random() < 0.3;
  const wantMeter = kind === "commute" && !wantFixed && Math.random() < 0.3;

  let days = "";
  let timeGo = "";
  let timeBack = "";
  let departAt: number;
  if (regular) {
    days = subsetWeekdays();
    timeGo = pick(["07:30", "08:00", "08:20"]);
    timeBack = Math.random() < 0.6 ? pick(["18:00", "18:30", "19:00"]) : "";
    departAt = nextOccurrence(days, timeGo, now);
  } else {
    // 한국 시간 자정 기준으로 날짜를 고르고, 출퇴근 시간대 금액 조건에 맞춘다.
    const midnight = Math.floor((now + KST) / DAY) * DAY - KST;
    const dayOff = ended ? -randInt(1, 3) : randInt(0, 5);
    const minutes = wantFixed || wantMeter ? pick([450, 480, 500, 1110, 1140, 1170]) : randInt(9 * 60, 22 * 60);
    departAt = midnight + dayOff * DAY + minutes * 60_000;
    if (ended) departAt = Math.min(departAt, now - 3600_000);
    // 종료되지 않을 글은 최소 1시간 뒤 이후로 옮긴다.
    if (!ended && departAt < now + 3600_000) departAt += DAY;
  }
  const fixedOk = regular ? priceAllowedRegular(days, timeGo, timeBack) : priceAllowedAt(departAt);
  let cost = "free";
  let price = 0;
  if (wantFixed && fixedOk) {
    cost = "fixed";
    price = Math.min(MAX_PRICE, randInt(10, 50) * 100);
  } else if (wantMeter) {
    cost = "meter";
  }
  const taxi = role === "rider" && Math.random() < 0.35;
  const tags = tagsFor(kw, role, cost);
  return {
    userId: owner.id,
    role,
    kind,
    cost,
    price,
    origin: o.name,
    dest: d.name,
    departAt: new Date(departAt).toISOString(),
    seats,
    note: pick(NOTES),
    status,
    oLat: o.lat,
    oLng: o.lng,
    dLat: d.lat,
    dLng: d.lng,
    regular,
    days,
    timeGo,
    timeBack,
    tags,
    taxi,
    createdAt: new Date(now - randInt(0, 72) * 3600_000 - randInt(0, 59) * 60_000).toISOString(),
  };
}

/** 임시 회원을 맞춘 뒤(없으면 만들고) 임시 글을 count개 저장한다. */
export async function createDemo(count: number): Promise<{ created: number; error?: string }> {
  await ensureSchema();
  const sql = db();
  const have = await sql`select count(*)::int as n from posts where demo`;
  if ((have[0].n as number) + count > DEMO_MAX) return { created: 0, error: `임시 글은 ${DEMO_MAX}개까지 둘 수 있어요. 먼저 지워 주세요.` };

  let owners = (await sql`select id, name from users where test and email like ${DEMO_EMAIL_LIKE} order by created_at limit 12`) as Owner[];
  const need = Math.max(0, 8 - owners.length);
  for (let i = 0; i < need; i++) {
    const tag = crypto.randomUUID().slice(0, 8);
    const name = NAMES[(owners.length + i) % NAMES.length];
    const bio = pick(BIOS);
    const rows = await sql`insert into users (email, pw, name, bio, test, email_verified, terms_at)
      values (${`demo-${tag}@test.invalid`}, ${`!${crypto.randomUUID()}`}, ${name}, ${bio}, true, true, now()) returning id`;
    owners.push({ id: String(rows[0].id), name });
  }
  owners = owners.map((u) => ({ id: String(u.id), name: u.name }));

  const kw = await getKeywords();
  for (let i = 0; i < count; i++) {
    const p = makeOne(kw, pick(owners));
    await sql`insert into posts (user_id, role, kind, cost, price, origin, dest, depart_at, seats, note, status,
                origin_lat, origin_lng, dest_lat, dest_lng, regular, days, time_go, time_back, tags, taxi_share, demo, demo_shown, created_at)
      values (${p.userId}, ${p.role}, ${p.kind}, ${p.cost}, ${p.price}, ${p.origin}, ${p.dest}, ${p.departAt}, ${p.seats}, ${p.note}, ${p.status},
              ${p.oLat}, ${p.oLng}, ${p.dLat}, ${p.dLng}, ${p.regular}, ${p.days}, ${p.timeGo}, ${p.timeBack}, ${p.tags}::text[], ${p.taxi}, true, true, ${p.createdAt})`;
  }
  return { created: count };
}
