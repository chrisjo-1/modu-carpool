# 서울교통공사 시간대별 혼잡도(2026년 6월, 평일·토요일·일요일) 엑셀을 앱용 작은 JSON으로 바꾼다.
# 사용법: python3 -I scripts/build-congestion.py <엑셀 경로> lib/data/congestion-2026-06.json
# 원본 엑셀은 앱에 넣지 않는다. 결과 JSON만 쓴다.
import json, sys, openpyxl

src, out = sys.argv[1], sys.argv[2]
DIR = {"상선": "up", "내선": "up", "하선": "down", "외선": "down"}  # 2호선 내선/외선 → up/down 대응은 확인 필요
DAY_ORDER = ["평일", "토요일", "일요일"]  # 저장 순서: 0=평일, 1=토요일, 2=일요일

wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
rows_by_key = {}
owner = {}
slots = None

for day_index, sheet in enumerate(DAY_ORDER):
    ws = wb[sheet]
    data = list(ws.iter_rows(values_only=True))
    header = data[0]
    time_cols = [i for i, h in enumerate(header) if isinstance(h, str) and "~" in h]
    if slots is None:
        slots = [header[i][:5] for i in time_cols]
    for r in data[1:]:
        if not r or not r[1] or r[4] not in DIR:
            continue
        line = str(r[1]).replace("호선", "")
        key = f"{line}|{r[3]}|{DIR[r[4]]}"
        vals = [round(float(r[i] or 0)) for i in time_cols]
        code = int(r[2])
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
    "source": "서울교통공사 시간대별 혼잡도 2026년 6월 (평일·토요일·일요일)",
    "period": "2026-06",
    "firstSlot": slots[0],
    "slotCount": len(slots),
    "rows": rows_by_key,
}
with open(out, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
print("rows", len(rows_by_key), "slots", len(slots), "first", slots[0], "last", slots[-1])
