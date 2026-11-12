import IDS from "./data/subway-ids.json";

/**
 * 서울시 실시간 지하철 정보(서울 열린데이터광장 swopenapi, 인증키 SEOUL_SUBWAY_KEY). 서버에서만 부른다.
 * - 역 코드: lib/data/subway-ids.json (서울시 역 코드표 2026-09-02, 앱 역 이름 → [역 ID, API 역 이름]).
 * - 같은 역은 25초 동안 받은 결과를 다시 쓴다(하루 호출 한도 아끼기).
 */

type IdMap = { lines: Record<string, string>; st: Record<string, Record<string, [string, string]>> };
const MAP = IDS as unknown as IdMap;

export const realtimeReady = () => !!process.env.SEOUL_SUBWAY_KEY;
export const realtimeLine = (line: string) => !!MAP.lines[line];
export const subwayIdOf = (line: string) => MAP.lines[line] ?? "";
export const stationIdOf = (line: string, station: string) => MAP.st[line]?.[station]?.[0] ?? "";

export type Arrival = {
  trainNo: string;
  terminal: string;
  /** 진입·도착·출발 등 화면 문구(예: "전역 출발", "3분 후") */
  msg: string;
  /** 0 진입, 1 도착, 2 출발, 3 전역 출발, 4 전역 진입, 5 전역 도착, 99 운행 중 */
  code: number;
  /** 도착까지 남은 초(모르면 0) */
  sec: number;
  express: boolean;
  last: boolean;
};

type Raw = Record<string, unknown>;
const cache = new Map<string, { at: number; rows: Raw[] }>();
/** 역마다 실제로 결과가 나온 API 역 이름(괄호 없는 이름 / 괄호 포함 이름 중) */
const goodName = new Map<string, string>();
const TTL = 25_000;

async function call(service: string, arg: string, count = 30): Promise<Raw[]> {
  const key = process.env.SEOUL_SUBWAY_KEY;
  if (!key) throw new Error("실시간 지하철 인증키가 설정되지 않았어요.");
  const ck = `${service}|${arg}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;
  const url = `http://swopenapi.seoul.go.kr/api/subway/${key}/json/${service}/0/${count}/${encodeURIComponent(arg)}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`실시간 지하철 정보를 받지 못했어요(${res.status}).`);
  const j = (await res.json().catch(() => ({}))) as Raw;
  const list = (j.realtimeArrivalList ?? j.realtimePositionList ?? []) as Raw[];
  const err = (j.errorMessage ?? j) as Raw;
  const code = String(err.code ?? "");
  // INFO-200 = 자료 없음(빈 목록). 그 밖의 오류(인증키·한도 등)는 알린다.
  if (!Array.isArray(list) || (!list.length && code && code !== "INFO-000" && code !== "INFO-200")) {
    if (code && code !== "INFO-200") throw new Error(`실시간 지하철 정보 오류: ${String(err.message ?? code)}`);
  }
  const rows = Array.isArray(list) ? list : [];
  cache.set(ck, { at: Date.now(), rows });
  if (cache.size > 400) cache.delete(cache.keys().next().value as string);
  return rows;
}

const str = (v: unknown) => (v == null ? "" : String(v));

/**
 * 한 역의 실시간 도착 정보(그 노선만). next를 주면 그 역 쪽으로 가는 열차만.
 * 막 출발한 열차(출발)도 넣는다 — "방금 탄 열차"를 고를 수 있게.
 */
export async function arrivalsAt(line: string, station: string, next?: string): Promise<Arrival[]> {
  const sid = stationIdOf(line, station);
  const subwayId = subwayIdOf(line);
  if (!sid || !subwayId) return [];
  const apiName = MAP.st[line][station][1];
  const plain = apiName.replace(/\(.*\)$/, "");
  const names = [...new Set([goodName.get(sid), plain, apiName, station].filter(Boolean) as string[])];
  let rows: Raw[] = [];
  for (const n of names) {
    const all = await call("realtimeStationArrival", n);
    rows = all.filter((r) => str(r.subwayId) === subwayId && str(r.statnId) === sid);
    if (rows.length) {
      goodName.set(sid, n);
      break;
    }
  }
  const nextId = next ? stationIdOf(line, next) : "";
  if (nextId) {
    const toward = rows.filter((r) => str(r.statnTid) === nextId);
    if (toward.length) rows = toward;
  }
  const out: Arrival[] = rows.map((r) => {
    const code = Number(r.arvlCd ?? 99);
    const sec = Number(r.barvlDt ?? 0) || 0;
    return {
      trainNo: str(r.btrainNo).replace(/^0+(?=\d)/, ""),
      terminal: str(r.bstatnNm).replace(/행$/, ""),
      msg: str(r.arvlMsg2),
      code: Number.isFinite(code) ? code : 99,
      sec,
      express: /급행|특급|ITX/.test(str(r.btrainSttus)),
      last: str(r.lstcarAt) === "1",
    };
  });
  // 막 출발·도착·진입한 열차 먼저, 그다음 도착이 가까운 순
  const rank = (a: Arrival) => (a.code === 2 ? 0 : a.code === 1 ? 1 : a.code === 0 ? 2 : 3);
  const seen = new Set<string>();
  return out
    .filter((a) => a.trainNo && !seen.has(a.trainNo) && seen.add(a.trainNo))
    .sort((a, b) => rank(a) - rank(b) || a.sec - b.sec)
    .slice(0, 4);
}

export type TrainPos = { trainNo: string; station: string; status: number; terminal: string; at: string };

/** 노선 전체 열차 위치(열차번호별). 정거장 안내용. */
export async function trainPositions(line: string): Promise<TrainPos[]> {
  const subwayId = subwayIdOf(line);
  if (!subwayId) return [];
  const lineName = { gyeongui: "경의중앙선", suin: "수인분당선", sinbundang: "신분당선", airport: "공항철도", gyeongchun: "경춘선", ui: "우이신설선", sillim: "신림선", seohae: "서해선", gyeonggang: "경강선", gtxa: "GTX-A" }[line] ?? `${line}호선`;
  const rows = await call("realtimePosition", lineName, 200);
  const byId = new Map(Object.entries(MAP.st[line] ?? {}).map(([name, v]) => [v[0], name]));
  return rows.map((r) => ({
    trainNo: str(r.trainNo).replace(/^0+(?=\d)/, ""),
    station: byId.get(str(r.statnId)) ?? str(r.statnNm),
    status: Number(r.trainSttus ?? 0),
    terminal: byId.get(str(r.statnTid)) ?? str(r.statnTnm),
    at: str(r.recptnDt),
  }));
}
