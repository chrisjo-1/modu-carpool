"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import NotifyModal, { type NotifyTarget } from "./NotifyModal";

type Stats = { total: number; drivers: number; geo: number; geoWait: number; geoFail: number; moved: number; linked: number; inLegacy: number; modoPosts: number };
type Row = { code: string; active: boolean; role: "driver" | "rider"; home: string; work: string; region: string; timeGo: string; timeBack: string; warpId: string; regDate: string; geo: boolean; tried: boolean; moved: boolean; userId: string | null; name: string; withdrawn: boolean; hasMail: boolean };
type Point = { kind: "warp" | "post"; ref: string; role: "driver" | "rider"; home: string; work: string; timeGo: string; timeBack: string; warpId: string; userId: string | null; name: string; homeKm?: number; workKm?: number };

const input = "w-full rounded-xl border border-line bg-white px-4 py-2.5 text-[15px]";
const ROLE = { driver: "운전자", rider: "탑승자" } as const;
const roleChip = (r: "driver" | "rider") => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold text-white ${r === "driver" ? "bg-accent" : "bg-mint"}`}>{ROLE[r]}</span>;

/**
 * 관리자 > 카풀 > 정기 매칭(S413). 워프 정기카풀을 붙여넣어 저장하고, 거리로만 매칭 후보를 찾는다(시간은 추후).
 * 이 화면에서만 매칭자를 검색한다. 전화번호는 [번호 보기]로만(기록 남음), 연락은 [알림]으로 그 회원에게만.
 */
export default function WarpPools() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [noGeo, setNoGeo] = useState(false);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [geoRun, setGeoRun] = useState(false);
  const geoStop = useRef(false);
  const [base, setBase] = useState<Row | null>(null);
  const [radius, setRadius] = useState(3);
  const [opp, setOpp] = useState(true);
  const [cands, setCands] = useState<Point[] | null>(null);
  const [candMsg, setCandMsg] = useState("");
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [notify, setNotify] = useState<NotifyTarget | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ q, role, ...(noGeo ? { geo: "none" } : {}) });
    const r = await fetch(`/api/admin/warp-pools?${p}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      setStats(j.stats);
      setRows(j.list ?? []);
    }
  }, [q, role, noGeo]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const upload = async () => {
    if (!paste.trim()) return;
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/warp-pools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "upload", text: paste }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했어요.");
    setMsg(`읽음 ${j.read}건 (새로 ${j.added} · 바뀜 ${j.updated}${j.skipped ? ` · 잘려서 뺌 ${j.skipped}` : ""}) · 모두의카풀 글로 옮김 ${j.moved}건. 이어서 위치를 채워요.`);
    setPaste("");
    setShowPaste(false);
    await load();
    fillGeo();
  };

  // 위치 채우기: 한 번에 약 40초씩, 남은 게 없거나 멈출 때까지 이어서
  const fillGeo = async () => {
    if (geoRun) return;
    setGeoRun(true);
    geoStop.current = false;
    for (let i = 0; i < 100 && !geoStop.current; i++) {
      const r = await fetch("/api/admin/warp-pools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "geo" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(j.error ?? "위치 채우기 중 오류가 났어요.");
        break;
      }
      await load();
      if (!j.left) break;
    }
    setGeoRun(false);
  };

  const findCands = async (b: Row | null = base, r = radius, o = opp) => {
    if (!b) return;
    setCands(null);
    setCandMsg("");
    const res = await fetch(`/api/admin/warp-pools?match=${encodeURIComponent(b.code)}&r=${r}&opp=${o ? 1 : 0}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setCandMsg(j.error ?? "찾지 못했어요.");
    if (j.noGeo) return setCandMsg("이 글은 아직 위치를 못 찾아서 거리를 잴 수 없어요. [위치 채우기]를 먼저 해 주세요.");
    setCands(j.list ?? []);
  };
  const pickBase = (r: Row) => {
    setBase(r);
    findCands(r);
    setTimeout(() => document.getElementById("pool-cands")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const showPhone = async (key: string, warpId: string, userId: string | null) => {
    const r = await fetch("/api/admin/warp-pools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "phone", warpId, userId }) });
    const j = await r.json().catch(() => ({}));
    setPhones((p) => ({ ...p, [key]: r.ok ? j.phone || "번호 없음" : j.error ?? "확인 불가" }));
  };

  const PersonActions = ({ k, warpId, userId, label, canMail }: { k: string; warpId: string; userId: string | null; label: string; canMail: boolean }) => (
    <span className="flex flex-wrap items-center gap-3 text-sm">
      {phones[k] ? <span className="num font-semibold">{phones[k]}</span> : (
        <button data-block-id="B436" data-block-name="전화번호 보기" className="min-h-0 text-accent underline" onClick={() => showPhone(k, warpId, userId)}>번호 보기</button>
      )}
      {(userId || canMail) && (
        <button data-block-id="B437" data-block-name="이 회원에게 알림" className="min-h-0 font-semibold text-accent underline" onClick={() => setNotify({ userId, warpId, label })}>알림</button>
      )}
    </span>
  );

  return (
    <section data-block-id="S413" data-block-name="정기 매칭" className="space-y-4">
      <div className="rounded-2xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">워프 정기카풀 · 거리 매칭</h2>
          <div className="flex flex-wrap gap-2">
            <button data-block-id="B438" data-block-name="워프 목록 붙여넣기" className="min-h-0 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white" onClick={() => setShowPaste((v) => !v)}>목록 붙여넣기</button>
            <button data-block-id="B439" data-block-name="위치 채우기" className="min-h-0 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold" onClick={() => (geoRun ? (geoStop.current = true) : fillGeo())}>{geoRun ? "위치 채우는 중… (멈추기)" : "위치 채우기"}</button>
            <a data-block-id="B440" data-block-name="엑셀 내려받기" href="/api/admin/warp-pools?csv=1" className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold">엑셀(CSV) 내려받기</a>
          </div>
        </div>
        <p className="mt-1 text-sm text-sub">자택끼리·회사끼리 모두 반경 안이면 후보예요(회사 주소가 없는 글은 자택만)(시간은 아직 보지 않아요). 모두의카풀 진행 중 정기카풀 글도 후보에 들어가요. 이 화면에서만 볼 수 있어요.</p>
        {showPaste && (
          <div className="mt-3">
            <textarea data-block-id="F423" data-block-name="워프 정기카풀 붙여넣기" className={`${input} h-48 font-mono text-xs`} placeholder={"워프 관리자 화면의 정기카풀 목록을 그대로 복사해 붙여 주세요.\n(코드·사용·역할·자택·회사·지역·출근·퇴근·회원 고유번호·등록일, 엑셀에서 복사한 표도 돼요)"} value={paste} onChange={(e) => setPaste(e.target.value)} />
            <button data-block-id="B441" data-block-name="워프 정기카풀 저장" disabled={busy || !paste.trim()} className="mt-2 min-h-0 w-full rounded-xl bg-accent py-3 font-bold text-white disabled:opacity-50" onClick={upload}>{busy ? "저장 중…" : "저장하기 (같은 코드는 새 내용으로)"}</button>
          </div>
        )}
        {msg && <p className="mt-2 rounded-xl bg-accentSoft px-3 py-2 text-sm">{msg}</p>}
        {stats && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              ["저장된 워프 정기카풀", `${stats.total}건 (운전자 ${stats.drivers})`],
              ["위치 찾음", `${stats.geo}건${stats.geoWait ? ` · 대기 ${stats.geoWait}` : ""}${stats.geoFail ? ` · 못 찾음 ${stats.geoFail}` : ""}`],
              ["모두의카풀 계정 연결", `${stats.linked}명 · 글로 옮김 ${stats.moved}`],
              ["모두의카풀 정기 글(위치 있음)", `${stats.modoPosts}건`],
            ].map(([a, b]) => (
              <div key={a} className="rounded-xl bg-bg px-3 py-2"><p className="text-xs text-sub">{a}</p><p className="num font-bold">{b}</p></div>
            ))}
          </div>
        )}
        {stats && stats.total > stats.inLegacy && <p className="mt-2 text-xs text-sub">워프 회원 명단에 없는 고유번호 {stats.total - stats.inLegacy}건은 번호·메일을 알 수 없어요(구 워프 이전 탭에 명단을 올리면 연결돼요).</p>}
      </div>

      <div className="rounded-2xl border border-line bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <input data-block-id="F424" data-block-name="정기카풀 검색" className={`${input} min-w-0 flex-1`} placeholder="고유번호·코드·주소·이름" value={q} onChange={(e) => setQ(e.target.value)} />
          <select data-block-id="F425" data-block-name="역할 필터" className="rounded-xl border border-line bg-white px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">전체</option><option value="driver">운전자</option><option value="rider">탑승자</option>
          </select>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={noGeo} onChange={(e) => setNoGeo(e.target.checked)} />위치 못 찾은 글만</label>
        </div>
        <ul className="mt-3 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.code} className={`py-3 ${base?.code === r.code ? "bg-accentSoft/60" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {roleChip(r.role)}
                <span className="num font-semibold">{r.warpId || "고유번호 없음"}</span>
                {r.name && <span className="text-mint">· 모두의카풀 {r.name}</span>}
                {r.withdrawn && <span className="text-warn">· 워프 탈퇴</span>}
                {!r.active && <span className="text-sub">· 미사용</span>}
                {r.moved && <span className="rounded bg-mintSoft px-1.5 text-xs text-mint">글로 옮김</span>}
                <span className="ml-auto text-xs text-sub">{r.regDate} · {r.code}</span>
              </div>
              <p className="mt-1 text-[15px]">{r.home} → {r.work || "(회사 주소 없음)"}</p>
              <p className="text-xs text-sub">출근 {r.timeGo || "-"} · 퇴근 {r.timeBack || "-"}{!r.geo && (r.tried ? " · 위치 못 찾음" : " · 위치 찾는 중")}</p>
              <div className="mt-1 flex flex-wrap items-center gap-4">
                <button data-block-id="B442" data-block-name="매칭 후보 찾기" disabled={!r.geo} className="min-h-0 text-sm font-bold text-accent underline disabled:text-sub disabled:no-underline" onClick={() => pickBase(r)}>매칭 후보 찾기</button>
                <PersonActions k={`w:${r.code}`} warpId={r.warpId} userId={r.userId} label={`${r.warpId}${r.name ? ` · ${r.name}` : ""}`} canMail={r.hasMail && !r.withdrawn} />
              </div>
            </li>
          ))}
        </ul>
        {rows.length === 0 && <p className="py-6 text-center text-sub">저장된 정기카풀이 없어요. [목록 붙여넣기]로 올려 주세요.</p>}
      </div>

      {base && (
        <div id="pool-cands" data-block-id="S414" data-block-name="매칭 후보" className="rounded-2xl border-2 border-accent bg-white p-4">
          <p className="text-sm text-sub">기준</p>
          <p className="font-semibold">{roleChip(base.role)} {base.warpId} · {base.home} → {base.work || "(회사 주소 없음 · 자택만 비교)"}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1">반경
              <input data-block-id="F426" data-block-name="매칭 반경" type="number" min={0.5} max={30} step={0.5} className="w-20 rounded-lg border border-line px-2 py-1" value={radius} onChange={(e) => setRadius(Number(e.target.value) || 3)} />km
            </label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={opp} onChange={(e) => setOpp(e.target.checked)} />반대 역할만 (운전자↔탑승자)</label>
            <button data-block-id="B443" data-block-name="후보 다시 찾기" className="min-h-0 rounded-lg bg-accent px-3 py-1.5 font-semibold text-white" onClick={() => findCands(base, radius, opp)}>다시 찾기</button>
          </div>
          {candMsg && <p className="mt-2 text-sm text-warn">{candMsg}</p>}
          {cands && cands.length === 0 && <p className="mt-3 text-sm text-sub">반경 {radius}km 안에 후보가 없어요. 반경을 넓혀 보세요.</p>}
          {cands && cands.length > 0 && (
            <ul className="mt-3 divide-y divide-line">
              {cands.map((c) => (
                <li key={`${c.kind}:${c.ref}`} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {roleChip(c.role)}
                    <span className={`rounded px-1.5 text-xs ${c.kind === "warp" ? "bg-bg text-sub" : "bg-mintSoft text-mint"}`}>{c.kind === "warp" ? "워프" : "모두의카풀 글"}</span>
                    <span className="num font-semibold">{c.warpId || (c.kind === "warp" ? "고유번호 없음" : "")}</span>
                    {c.name && <span>{c.name}</span>}
                    <span className="num ml-auto font-bold text-accent">자택 {c.homeKm}km · {c.workKm != null && c.workKm >= 0 ? `회사 ${c.workKm}km` : "회사 비교 안 함"}</span>
                  </div>
                  <p className="mt-1 text-[15px]">{c.home} → {c.work || "(회사 주소 없음)"}</p>
                  <p className="text-xs text-sub">출근 {c.timeGo || "-"} · 퇴근 {c.timeBack || "-"}</p>
                  <div className="mt-1">
                    <PersonActions k={`${c.kind}:${c.ref}`} warpId={c.kind === "warp" ? c.warpId : ""} userId={c.userId} label={`${c.warpId}${c.name ? ` · ${c.name}` : ""}`} canMail={c.kind === "warp"} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {notify && <NotifyModal target={notify} onClose={() => setNotify(null)} />}
    </section>
  );
}
