/**
 * 지하철 노선 그래프(순수 함수). 방향은 상행/하행 대신 "다음역"·"종착역" 이름으로 안내한다.
 *
 * - 각 구간(seg)은 역 이름 순서이며, 순서 방향을 "down"(혼잡도 자료의 하선·외선)으로 본다.
 *   역번호가 커지는 쪽이 하선이다(종점 역의 하선 값이 0인 것으로 확인).
 * - 2호선 본선은 순환(loop). 지선과 5호선 갈래는 갈라지는 역에서 이어 붙인다.
 * - 지금은 앉아가기 시범 노선(2호선·5호선)만 정의한다. 다른 노선은 null을 돌려준다.
 */

export type Dir = "up" | "down";

type LineDef = { segs: string[][]; loop?: string[] };

const LINES: Record<string, LineDef> = {
  "2": {
    // 본선 순환: 시청 → 을지로입구 → … → 충정로 → 시청 (외선 방향 = down)
    loop: [
      "시청", "을지로입구", "을지로3가", "을지로4가", "동대문역사문화공원", "신당", "상왕십리", "왕십리", "한양대", "뚝섬",
      "성수", "건대입구", "구의", "강변", "잠실나루", "잠실", "잠실새내", "종합운동장", "삼성", "선릉", "역삼", "강남",
      "교대", "서초", "방배", "사당", "낙성대", "서울대입구", "봉천", "신림", "신대방", "구로디지털단지", "대림", "신도림",
      "문래", "영등포구청", "당산", "합정", "홍대입구", "신촌", "이대", "아현", "충정로",
    ],
    segs: [
      ["성수", "용답", "신답", "용두", "신설동"], // 성수지선
      ["신도림", "도림천", "양천구청", "신정네거리", "까치산"], // 신정지선
    ],
  },
  "5": {
    segs: [
      [
        "방화", "개화산", "김포공항", "송정", "마곡", "발산", "우장산", "화곡", "까치산", "신정", "목동", "오목교", "양평",
        "영등포구청", "영등포시장", "신길", "여의도", "여의나루", "마포", "공덕", "애오개", "충정로", "서대문", "광화문", "종로3가",
        "을지로4가", "동대문역사문화공원", "청구", "신금호", "행당", "왕십리", "마장", "답십리", "장한평", "군자", "아차산",
        "광나루", "천호", "강동", "길동", "굽은다리", "명일", "고덕", "상일동", "강일", "미사", "하남풍산", "하남시청", "하남검단산",
      ],
      ["강동", "둔촌동", "올림픽공원(한국체대)", "방이", "오금", "개롱", "거여", "마천"], // 마천 갈래
    ],
  },
};

type Edge = { to: string; dir: Dir };

const graphCache: Record<string, Map<string, Edge[]>> = {};

function graph(line: string): Map<string, Edge[]> | null {
  const def = LINES[line];
  if (!def) return null;
  if (graphCache[line]) return graphCache[line];
  const g = new Map<string, Edge[]>();
  const add = (a: string, b: string) => {
    if (!g.has(a)) g.set(a, []);
    if (!g.has(b)) g.set(b, []);
    g.get(a)!.push({ to: b, dir: "down" });
    g.get(b)!.push({ to: a, dir: "up" });
  };
  if (def.loop) {
    for (let i = 0; i < def.loop.length; i++) add(def.loop[i], def.loop[(i + 1) % def.loop.length]);
  }
  for (const seg of def.segs) for (let i = 0; i + 1 < seg.length; i++) add(seg[i], seg[i + 1]);
  graphCache[line] = g;
  return g;
}

export function hasRoute(line: string): boolean {
  return !!LINES[line];
}

/** from → to 최단 경로(역 이름 목록, 양 끝 포함). 없으면 null. */
export function routePath(line: string, from: string, to: string): string[] | null {
  const g = graph(line);
  if (!g || !g.has(from) || !g.has(to)) return null;
  if (from === to) return [from];
  const prev = new Map<string, string>([[from, ""]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of g.get(cur)!) {
      if (prev.has(e.to)) continue;
      prev.set(e.to, cur);
      if (e.to === to) {
        const path = [to];
        let p = cur;
        while (p) {
          path.unshift(p);
          p = prev.get(p)!;
        }
        return path;
      }
      queue.push(e.to);
    }
  }
  return null;
}

/** 두 이웃 역 사이 방향(down/up). 이웃이 아니면 null. */
export function edgeDir(line: string, a: string, b: string): Dir | null {
  const e = graph(line)?.get(a)?.find((x) => x.to === b);
  return e ? e.dir : null;
}

/**
 * a → next 방향으로 계속 갔을 때의 종착역 이름. 갈래가 나뉘면 각 갈래의 종착역을 "·"로 잇는다
 * (예: 5호선 하행 → "하남검단산·마천"). 순환선 본선 위를 도는 방향이면 null(다음역으로만 안내).
 */
export function terminalOf(line: string, a: string, next: string): string | null {
  const g = graph(line);
  if (!g) return null;
  const loop = new Set(LINES[line].loop ?? []);
  if (loop.has(a) && loop.has(next)) return null;
  const ends: string[] = [];
  const walk = (prev: string, cur: string, seen: Set<string>) => {
    if (seen.has(cur)) return;
    seen.add(cur);
    const onward = g.get(cur)!.filter((e) => e.to !== prev);
    if (onward.length === 0) return void ends.push(cur);
    // 순환 본선과 만나는 지선 끝(예: 신설동 → 성수)은 그 역을 종착으로 본다.
    if (loop.has(cur)) return void ends.push(cur);
    for (const e of onward) walk(cur, e.to, seen);
  };
  walk(a, next, new Set([a]));
  return ends.length ? ends.join("·") : null;
}

export type Heading = { next: string; dir: Dir; terminal: string | null };

/** 한 역에서 갈 수 있는 방향들(다음역 기준). 칸 안내의 방향 버튼에 쓴다. */
export function headingsAt(line: string, station: string): Heading[] {
  const g = graph(line);
  const edges = g?.get(station);
  if (!edges) return [];
  return edges.map((e) => ({ next: e.to, dir: e.dir, terminal: terminalOf(line, station, e.to) }));
}

/** 출발역에서 도착역으로 갈 때의 첫 방향(다음역). */
export function headingFor(line: string, from: string, to: string): Heading | null {
  const path = routePath(line, from, to);
  if (!path || path.length < 2) return null;
  const dir = edgeDir(line, path[0], path[1]);
  if (!dir) return null;
  return { next: path[1], dir, terminal: terminalOf(line, path[0], path[1]) };
}
