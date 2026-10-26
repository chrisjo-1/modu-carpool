# 서울교통공사 시간대별 혼잡도(평일·토요일·일요일)를 앱용 작은 JSON으로 바꾼다.
# 원본: 공공데이터포털 '서울교통공사_지하철혼잡도정보' https://www.data.go.kr/data/15071311/fileData.do (분기마다 갱신)
# 사용법: python3 -I scripts/build-congestion.py <엑셀 또는 CSV 경로> lib/data/congestion-YYYY-MM.json [YYYY-MM]
#  - 엑셀: 시트 '평일'·'토요일'·'일요일', 시간 칸 '05:30~06:00'
#  - CSV(cp949 또는 utf-8): 첫 칸 '구분'(평일/토요일/일요일), 시간 칸 '5시30분'
# 원본 파일은 앱에 넣지 않는다. 결과 JSON만 쓴다.
import csv, json, re, sys

src, out = sys.argv[1], sys.argv[2]
period = sys.argv[3] if len(sys.argv) > 3 else re.search(r"(\d{4}-\d{2})", out).group(1)
DIR = {"상선": "up", "내선": "up", "하선": "down", "외선": "down"}  # 2호선 내선=상행, 외선=하행
DAY_ORDER = ["평일", "토요일", "일요일"]  # 저장 순서: 0=평일, 1=토요일, 2=일요일


def sheets():
    """요일별 (머리줄, 행들) — 행은 [구분, 호선, 역번호, 역명, 상하구분, 시간...] 또는 엑셀 원래 순서"""
    if src.lower().endswith(".csv"):
        raw = open(src, "rb").read()
        for enc in ("utf-8-sig", "cp949"):
            try:
                txt = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        data = list(csv.reader(txt.splitlines()))
        header = data[0]
        for day in DAY_ORDER:
            yield day, header, [r for r in data[1:] if r and r[0].strip() == day]
    else:
        import openpyxl
        wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
        for day in DAY_ORDER:
            data = list(wb[day].iter_rows(values_only=True))
            yield day, data[0], data[1:]


def slot_name(h):
    h = str(h).strip()
    m = re.match(r"^(\d{1,2})시(\d{2})분$", h)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}"
    return h[:5]


def is_time(h):
    return isinstance(h, str) and ("~" in h or re.match(r"^\d{1,2}시\d{2}분$", h.strip()))


rows_by_key = {}
owner = {}
slots = None

for day_index, (day, header, data) in enumerate(sheets()):
    time_cols = [i for i, h in enumerate(header) if is_time(h)]
    names = [slot_name(header[i]) for i in time_cols]
    if slots is None:
        slots = names
    elif names != slots:
        raise SystemExit(f"{day} 시간 칸이 다릅니다")
    for r in data:
        if not r or not r[1] or str(r[4]).strip() not in DIR:
            continue
        line = str(r[1]).replace("호선", "").strip()
        key = f"{line}|{str(r[3]).strip()}|{DIR[str(r[4]).strip()]}"
        vals = [round(float(str(r[i] or 0).strip() or 0)) for i in time_cols]
        code = int(str(r[2]).strip())
        if key in owner and owner[key] != code:
            # 같은 역명이 본선(역번호 9000 미만)과 지선(9000 이상)에 따로 있는 경우: 본선 값을 쓴다.
            if code >= 9000:
                continue
            print("본선으로 대체:", key, owner[key], "->", code)
        owner[key] = code
        slot_map = rows_by_key.setdefault(key, [None, None, None])
        slot_map[day_index] = vals

missing = [k for k, v in rows_by_key.items() if any(x is None for x in v)]
if missing:
    raise SystemExit(f"요일 자료가 빠진 역: {missing[:5]}")

result = {
    "source": f"서울교통공사 시간대별 혼잡도 {period[:4]}년 {int(period[5:])}월 (평일·토요일·일요일)",
    "period": period,
    "firstSlot": slots[0],
    "slotCount": len(slots),
    "rows": rows_by_key,
}
with open(out, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
print("rows", len(rows_by_key), "slots", len(slots), "first", slots[0], "last", slots[-1])
