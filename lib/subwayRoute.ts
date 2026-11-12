/**
 * 지하철 노선 그래프(순수 함수). 방향은 상행/하행 대신 "다음역"·"종착역" 이름으로 안내한다.
 *
 * - 각 구간(seg)은 역 이름 순서이며, 순서 방향을 "down"(혼잡도 자료의 하선·외선)으로 본다.
 *   역번호가 커지는 쪽이 하선이다(종점 역의 하선 값이 0인 것으로 확인).
 * - 2호선 본선은 순환(loop). 지선과 5호선 갈래는 갈라지는 역에서 이어 붙인다.
 * - 1~9호선(코레일·연장 구간 포함)과 경의중앙·수인분당·신분당·공항철도·경춘·우이신설·신림·서해·경강·GTX-A를 정의한다
 *   (2026-11-12, 서울시 실시간 도착정보 역 코드표 2026-09-02 기준). 인천1·2호선 등 그 밖의 노선은 null을 돌려준다.
 */

export type Dir = "up" | "down";

type LineDef = { segs: string[][]; loop?: string[] };

const LINES: Record<string, LineDef> = {
  // 3·4·7·8호선: 서울교통공사 구간의 역번호 순서(하선)를 그대로 두고 연장 구간을 앞뒤에 이었다. 6호선은 응암 순환(응암~구산)과 본선(응암~신내).
  // 1호선: 서울교통공사 구간 순서(서울역→청량리 = 하선)에 맞춰 경인·경부·경원·연천 구간을 잇는다. 갈래: 경부(신창~구로), 광명, 서동탄.
  "1": { segs: [
    [
      "인천", "동인천", "도원", "제물포", "도화", "주안", "간석", "동암", "백운", "부평", "부개", "송내", "중동", "부천",
      "소사", "역곡", "온수", "오류동", "개봉", "구일", "구로", "신도림", "영등포", "신길", "대방", "노량진", "용산", "남영",
      "서울역", "시청", "종각", "종로3가", "종로5가", "동대문", "동묘앞", "신설동", "제기동", "청량리", "회기", "외대앞", "신이문", "석계",
      "광운대", "월계", "녹천", "창동", "방학", "도봉", "도봉산", "망월사", "회룡", "의정부", "가능", "녹양", "양주", "덕계",
      "덕정", "지행", "동두천중앙", "보산", "동두천", "소요산", "청산", "전곡", "연천",
    ],
    [
      "신창", "온양온천", "배방", "탕정", "아산", "쌍용(나사렛대)", "봉명", "천안", "두정", "직산", "성환", "평택", "지제", "서정리",
      "송탄", "진위", "오산", "오산대", "세마", "병점", "세류", "수원", "화서", "성균관대", "의왕", "당정", "군포", "금정",
      "명학", "안양", "관악", "석수", "금천구청", "독산", "가산디지털단지", "구로",
    ],
    [
      "광명", "금천구청",
    ],
    [
      "서동탄", "병점",
    ],
  ] },
  "3": { segs: [
    [
      "대화", "주엽", "정발산", "마두", "백석", "대곡", "화정", "원당", "원흥", "삼송", "지축", "구파발", "연신내", "불광",
      "녹번", "홍제", "무악재", "독립문", "경복궁", "안국", "종로3가", "을지로3가", "충무로", "동대입구", "약수", "금호", "옥수", "압구정",
      "신사", "잠원", "고속터미널", "교대", "남부터미널", "양재", "매봉", "도곡", "대치", "학여울", "대청", "일원", "수서", "가락시장",
      "경찰병원", "오금",
    ],
  ] },
  "4": { segs: [
    [
      "불암산", "상계", "노원", "창동", "쌍문", "수유", "미아", "미아사거리", "길음", "성신여대입구", "한성대입구", "혜화", "동대문", "동대문역사문화공원",
      "충무로", "명동", "회현", "서울역", "숙대입구", "삼각지", "신용산", "이촌", "동작", "총신대입구", "사당", "남태령", "선바위", "경마공원",
      "대공원", "과천", "정부과천청사", "인덕원", "평촌", "범계", "금정", "산본", "수리산", "대야미", "반월", "상록수", "한대앞", "중앙",
      "고잔", "초지", "안산", "신길온천", "정왕", "오이도",
    ],
  ] },
  "7": { segs: [
    [
      "장암", "도봉산", "수락산", "마들", "노원", "중계", "하계", "공릉", "태릉입구", "먹골", "중화", "상봉", "면목", "사가정",
      "용마산", "중곡", "군자", "어린이대공원", "건대입구", "자양(뚝섬한강공원)", "청담", "강남구청", "학동", "논현", "반포", "고속터미널", "내방", "이수",
      "남성", "숭실대입구", "상도", "장승배기", "신대방삼거리", "보라매", "신풍", "대림", "남구로", "가산디지털단지", "철산", "광명사거리", "천왕", "온수",
      "까치울", "부천종합운동장", "춘의", "신중동", "부천시청", "상동", "삼산체육관", "굴포천", "부평구청", "산곡", "석남",
    ],
  ] },
  "8": { segs: [
    [
      "별내", "다산", "동구릉", "구리", "장자호수공원", "암사역사공원", "암사", "천호", "강동구청", "몽촌토성", "잠실", "석촌", "송파", "가락시장",
      "문정", "장지", "복정", "남위례", "산성", "남한산성입구", "단대오거리", "신흥", "수진", "모란",
    ],
  ] },
  "6": {
    loop: ["응암", "역촌", "불광", "독바위", "연신내", "구산"],
    segs: [[
      "응암", "새절", "증산", "디지털미디어시티", "월드컵경기장", "마포구청", "망원", "합정", "상수", "광흥창", "대흥", "공덕", "효창공원앞", "삼각지", "녹사평", "이태원", "한강진",
      "버티고개", "약수", "청구", "신당", "동묘앞", "창신", "보문", "안암", "고려대", "월곡", "상월곡", "돌곶이", "석계", "태릉입구", "화랑대", "봉화산", "신내"
    ]],
  },
  // 9호선: 개화 → 중앙보훈병원(역 순서 방향을 down으로 둔다). 혼잡도 자료는 없다.
  "9": { segs: [[
      "개화", "김포공항", "공항시장", "신방화", "마곡나루", "양천향교", "가양", "증미", "등촌", "염창", "신목동", "선유도", "당산",
      "국회의사당", "여의도", "샛강", "노량진", "노들", "흑석", "동작", "구반포", "신반포", "고속터미널", "사평", "신논현", "언주",
      "선정릉", "삼성중앙", "봉은사", "종합운동장", "삼전", "석촌고분", "석촌", "송파나루", "한성백제", "올림픽공원", "둔촌오륜", "중앙보훈병원",
    ]] },
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
  // 경의중앙선: 서울역 갈래(가좌~신촌~서울역) 포함.
  gyeongui: { segs: [
    [
      "임진강", "운천", "문산", "파주", "월롱", "금촌", "금릉", "운정", "야당", "탄현", "일산", "풍산", "백마", "곡산",
      "대곡", "능곡", "행신", "강매", "한국항공대", "수색", "디지털미디어시티", "가좌", "홍대입구", "서강대", "공덕", "효창공원앞", "용산", "이촌",
      "서빙고", "한남", "옥수", "응봉", "왕십리", "청량리", "회기", "중랑", "상봉", "망우", "양원", "구리", "도농", "양정",
      "덕소", "도심", "팔당", "운길산", "양수", "신원", "국수", "아신", "오빈", "양평", "원덕", "용문", "지평",
    ],
    [
      "가좌", "신촌(경의중앙선)", "서울역",
    ],
  ] },
  suin: { segs: [
    [
      "청량리", "왕십리", "서울숲", "압구정로데오", "강남구청", "선정릉", "선릉", "한티", "도곡", "구룡", "개포동", "대모산입구", "수서", "복정",
      "가천대", "태평", "모란", "야탑", "이매", "서현", "수내", "정자", "미금", "오리", "죽전", "보정", "구성", "신갈",
      "기흥", "상갈", "청명", "영통", "망포", "매탄권선", "수원시청", "매교", "수원", "고색", "오목천", "어천", "야목", "사리",
      "한대앞", "중앙", "고잔", "초지", "안산", "신길온천", "정왕", "오이도", "달월", "월곶", "소래포구", "인천논현", "호구포", "남동인더스파크",
      "원인재", "연수", "송도", "인하대", "숭의", "신포", "인천",
    ],
  ] },
  sinbundang: { segs: [
    [
      "신사", "논현", "신논현", "강남", "양재", "양재시민의숲", "청계산입구", "판교", "정자", "미금", "동천", "수지구청", "성복", "상현",
      "광교중앙", "광교",
    ],
  ] },
  airport: { segs: [
    [
      "서울역", "공덕", "홍대입구", "디지털미디어시티", "마곡나루", "김포공항", "계양", "검암", "청라국제도시", "영종", "운서", "공항화물청사", "인천공항1터미널", "인천공항2터미널",
    ],
  ] },
  // 경춘선: 광운대 갈래(광운대~상봉) 포함.
  gyeongchun: { segs: [
    [
      "청량리", "회기", "중랑", "상봉", "망우", "신내", "갈매", "별내", "퇴계원", "사릉", "금곡", "평내호평", "천마산", "마석",
      "대성리", "청평", "상천", "가평", "굴봉산", "백양리", "강촌", "김유정", "남춘천", "춘천",
    ],
    [
      "광운대", "상봉",
    ],
  ] },
  ui: { segs: [
    [
      "북한산우이", "솔밭공원", "4.19 민주묘지", "가오리", "화계", "삼양", "삼양사거리", "솔샘", "북한산보국문", "정릉", "성신여대입구", "보문", "신설동",
    ],
  ] },
  sillim: { segs: [
    [
      "샛강", "대방", "서울지방병무청", "보라매", "보라매공원", "보라매병원", "당곡", "신림", "서원", "서울대벤처타운", "관악산",
    ],
  ] },
  seohae: { segs: [
    [
      "일산", "풍산", "백마", "곡산", "대곡", "능곡", "김포공항", "원종", "부천종합운동장", "소사", "소새울", "시흥대야", "신천", "신현",
      "시흥시청", "시흥능곡", "달미", "선부", "초지", "시우", "원시",
    ],
  ] },
  gyeonggang: { segs: [
    [
      "판교", "성남", "이매", "삼동", "경기광주", "초월", "곤지암", "신둔도예촌", "이천", "부발", "세종왕릉", "여주",
    ],
  ] },
  // GTX-A: 운정중앙~서울역, 수서~동탄 두 구간(아직 이어지지 않음).
  gtxa: { segs: [
    [
      "운정중앙", "킨텍스", "대곡", "연신내", "서울역",
    ],
    [
      "수서", "성남", "구성", "동탄",
    ],
  ] },
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

/**
 * prev → cur로 온 뒤 이어 갈 수 있는 역들. 갈래 역에서는 들어온 방향(down/up)과 같은 쪽만 따른다
 * (예: 1호선 수원 → 구로로 오면 인천 쪽으로 되돌아가지 않고 신도림 쪽, 경춘선 광운대 → 상봉이면 청량리 쪽이 아니라 망우 쪽).
 * 같은 방향 갈래가 없으면 나머지를 모두 따른다.
 */
function forward(g: Map<string, Edge[]>, prev: string, cur: string, dir: Dir | null): Edge[] {
  const onward = (g.get(cur) ?? []).filter((e) => e.to !== prev);
  if (!dir || onward.length < 2) return onward;
  const same = onward.filter((e) => e.dir === dir);
  return same.length ? same : onward;
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
  const walk = (prev: string, cur: string, dir: Dir | null, seen: Set<string>) => {
    if (seen.has(cur)) return;
    seen.add(cur);
    const onward = forward(g, prev, cur, dir);
    if (onward.length === 0) return void ends.push(cur);
    // 순환 본선과 만나는 지선 끝(예: 신설동 → 성수)은 그 역을 종착으로 본다.
    if (loop.has(cur)) return void ends.push(cur);
    for (const e of onward) walk(cur, e.to, e.dir, seen);
  };
  walk(a, next, edgeDir(line, a, next), new Set([a]));
  return ends.length ? ends.join("·") : null;
}

export type Heading = { next: string; dir: Dir; terminal: string | null };

/**
 * from에서 next 쪽으로 갈 때 이어지는 역 n개(next 포함). 갈래가 나뉘면 첫 갈래를 따른다.
 * 예: 9호선 당산 → 국회의사당 쪽 = ["국회의사당", "여의도", "샛강"].
 */
export function nextStations(line: string, from: string, next: string, n = 3): string[] {
  const g = graph(line);
  if (!g || !(g.get(from) ?? []).some((e) => e.to === next)) return next ? [next] : [];
  const out = [next];
  let prev = from;
  let cur = next;
  while (out.length < n) {
    const onward = forward(g, prev, cur, out.length === 1 ? edgeDir(line, from, next) : edgeDir(line, prev, cur));
    if (!onward.length) break;
    prev = cur;
    cur = onward[0].to;
    if (cur === from || out.includes(cur)) break;
    out.push(cur);
  }
  return out;
}

/** 한 역에서 갈 수 있는 방향들(다음역 기준). 칸 안내의 방향 버튼에 쓴다. */
/**
 * 고른 방면(다음 역)을 첫 걸음으로 하는 경로. 2호선처럼 두 방향으로 갈 수 있을 때 쓴다.
 * next가 없거나 그 역과 이어지지 않으면 기본 경로(routePath)를 돌려준다.
 */
export function routePathVia(line: string, from: string, to: string, next?: string): string[] | null {
  const g = graph(line);
  if (!next || !g || from === to) return routePath(line, from, to);
  if (!(g.get(from) ?? []).some((e) => e.to === next)) return routePath(line, from, to);
  if (next === to) return [from, to];
  const prev = new Map<string, string>([[from, ""], [next, ""]]);
  const queue = [next];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of g.get(cur) ?? []) {
      if (prev.has(e.to)) continue;
      prev.set(e.to, cur);
      if (e.to === to) {
        const path = [to];
        let p = cur;
        while (p) {
          path.unshift(p);
          p = prev.get(p)!;
        }
        return [from, ...path];
      }
      queue.push(e.to);
    }
  }
  return routePath(line, from, to);
}

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
