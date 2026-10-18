"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Row = { warp_id: string; name: string | null; nickname: string | null; gender: string | null; kind: string | null; joined_on: string | null; status: string | null; phone: string; email: string; records: number; withdrawn: boolean; match_status: string; matched_by: string | null; marketing: string; promo: string; no_mail?: boolean };
type Stats = { total: number; withdrawn: number; joined: number; not_joined: number; pending: number; riders: number; drivers: number; both_keys: number; review: number; agreed: number; no_mail: number; legacy_joined: number; new_warp_joined: number; imported_at: number | null };
type Detail = Row & { src_no: string; naver_id: string; kakao_id: string; memo: string; user_name: string | null; user_email: string | null; revealed: boolean };

const input = "rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";
const call = (method: string, url: string, data?: unknown) =>
  fetch(url, { method, headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined });
const n = (v: number | undefined) => (v ?? 0).toLocaleString("ko-KR");
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");

/** 엑셀 '회원통합' 시트의 열 이름 → 서버로 보낼 키 */
const HEAD: Record<string, string> = {
  구워프_회원ID: "id", 원본회원번호: "no", 이름: "name", 성별: "gender", 닉네임: "nick", 구분: "kind", 구워프_가입일: "joined",
  구워프_회원상태: "status", 휴대폰: "phone", 휴대폰_정규화: "phoneN", 이메일: "email", 이메일_정규화: "emailN", 네이버ID: "naver",
  카카오톡ID: "kakao", 원본레코드수: "records", 마케팅동의상태: "marketing", 홍보대상상태: "promo", 관리자메모: "memo",
};

/**
 * 현재 모두의카풀 관리자 '회원 목록' 내보내기(신워프) 를 구워프 대조 표와 같은 열로 바꾼다.
 * 회원ID는 고유번호(고유코드, 8자리)를 그대로 쓰고, 원본번호를 '신워프 N' 으로 적어 구워프와 구분한다.
 * 고유번호로 가입 때 워프 확인을 하므로(findLegacyByKey) 접두사를 붙이지 않는다.
 */
function fromNewWarp(table: unknown[][]): Record<string, unknown>[] {
  const head = (table[0] ?? []).map((h) => String(h ?? "").trim());
  const at = (name: string) => head.indexOf(name);
  const c = { no: at("번호"), joined: at("등록일"), code: at("고유번호"), nick: at("닉네임"), gender: at("성별"), phone: at("휴대폰번호"), status: at("상태"), email: at("이메일"), type: at("가입 회원 유형") };
  const seen = new Map<string, Record<string, unknown>>();
  for (const r of table.slice(1)) {
    const code = r && c.code >= 0 ? String(r[c.code] ?? "").trim() : "";
    if (!code) continue;
    const id = code;
    const type = String(r[c.type] ?? "").trim();
    const status = String(r[c.status] ?? "").trim();
    seen.set(id, {
      id,
      no: `신워프 ${String(r[c.no] ?? "").trim()}`.trim(),
      gender: r[c.gender],
      nick: r[c.nick],
      kind: type === "운전자" ? "드라이버" : type === "탑승자" ? "라이더" : null,
      joined: r[c.joined],
      status: status === "승인" ? "사용중" : status || null,
      phone: r[c.phone],
      email: r[c.email],
      memo: "신워프: 현 모두의카풀 회원 목록 내보내기",
      records: 1,
    });
  }
  return [...seen.values()];
}

export default function Legacy() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [f, setF] = useState({ q: "", kind: "", match: "", status: "", review: false, src: "", mail: "" });
  const [detail, setDetail] = useState<Detail | null>(null);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (pg = 0, filt = f) => {
    const qs = new URLSearchParams({ q: filt.q, kind: filt.kind, match: filt.match, status: filt.status, review: filt.review ? "1" : "", src: filt.src, mail: filt.mail, page: String(pg) });
    const r = await fetch(`/api/admin/legacy?${qs}`).then((x) => x.json()).catch(() => null);
    if (!r || r.error) return setProgress(r?.error ?? "불러오지 못했습니다.");
    setStats(r.stats);
    setRows(r.rows);
    setCount(r.count);
    setPage(r.page);
    // 검색 조건은 바뀔 때만 다시 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load(0);
  }, [load]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setProgress("엑셀을 읽는 중…");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", dense: true });
      const firstTable = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: null });
      const firstHead = (firstTable[0] ?? []).map((h) => String(h ?? "").trim());
      const isNewWarp = firstHead.includes("고유번호") && firstHead.includes("가입 회원 유형");
      let data: Record<string, unknown>[];
      if (isNewWarp) {
        data = fromNewWarp(firstTable);
      } else {
        const ws = wb.Sheets["회원통합"] ?? wb.Sheets[wb.SheetNames.find((nm) => {
          const first = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nm], { header: 1, range: 0 })[0] as unknown[] | undefined;
          return !!first?.includes("구워프_회원ID");
        }) ?? ""];
        if (!ws) throw new Error("'회원통합' 시트(구워프_회원ID 열)를 찾지 못했습니다.");
        const table = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null });
        const head = (table[0] ?? []).map((h) => HEAD[String(h ?? "").trim()] ?? "");
        if (!head.includes("id")) throw new Error("구워프_회원ID 열이 없습니다.");
        data = table.slice(1).filter((r) => r && r[head.indexOf("id")]).map((r) => {
          const o: Record<string, unknown> = {};
          head.forEach((k, i) => k && (o[k] = r[i]));
          return o;
        });
      }
      if (!data.length) throw new Error("올릴 회원 행을 찾지 못했습니다.");
      const label = isNewWarp ? "신워프" : "구 워프";
      if (!window.confirm(`${label} 회원 ${n(data.length)}명을 올립니다. 같은 회원ID(고유번호)는 새 값으로 덮어씁니다. ${isNewWarp ? "원본번호에 '신워프'로 적혀 구워프 회원과 구분됩니다. 이메일이 있는 회원은 새 계정을 만들고(이미 있는 계정은 건너뜀), 비밀번호는 '비밀번호 찾기'로 새로 정하게 됩니다. " : ""}탈퇴 회원은 이름·연락처 없이 대조용 값만 저장됩니다. 진행할까요?`)) {
        setProgress("");
        return;
      }
      let saved = 0, skipped = 0, created = 0;
      for (let i = 0; i < data.length; i += 500) {
        setProgress(`올리는 중… ${n(Math.min(i + 500, data.length))} / ${n(data.length)}`);
        const res = await call("POST", "/api/admin/legacy", { action: "import", source: isNewWarp ? "신워프" : undefined, rows: data.slice(i, i + 500) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`${i + 1}번째 행부터 저장하지 못했습니다: ${j.error ?? res.status}`);
        saved += j.saved;
        skipped += j.skipped;
        created += j.created ?? 0;
      }
      setProgress("현재 회원과 대조하는 중…");
      const m = await call("POST", "/api/admin/legacy", { action: "match" }).then((x) => x.json());
      setProgress(`완료: ${n(saved)}명 저장${isNewWarp ? `, 새 계정 ${n(created)}명 생성(비밀번호는 '비밀번호 찾기'로 설정)` : ""}${skipped ? `, ${n(skipped)}행 건너뜀(회원ID 형식 오류)` : ""} · 대조 결과 가입됨 ${n(m.joined)}명`);
      load(0);
    } catch (e) {
      setProgress(e instanceof Error ? e.message : "업로드하지 못했습니다.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const rematch = async () => {
    setBusy(true);
    setProgress("현재 회원과 대조하는 중…");
    const m = await call("POST", "/api/admin/legacy", { action: "match" }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    setProgress(m?.ok ? `대조 완료: ${n(m.total)}명 중 가입됨 ${n(m.joined)}명` : "대조하지 못했습니다.");
    load(page);
  };

  const open = async (id: string, reveal = false) => {
    const r = await fetch(`/api/admin/legacy?id=${encodeURIComponent(id)}${reveal ? "&reveal=1" : ""}`).then((x) => x.json());
    if (r.member) setDetail(r.member);
  };

  const apply = (next: typeof f) => {
    setF(next);
    load(0, next);
  };
  // 숫자판을 누르면 그 숫자에 해당하는 회원 목록으로 바꾸고, 목록 위치로 내려간다.
  const go = (patch: Partial<typeof f>) => {
    apply({ q: "", kind: "", match: "", status: "", review: false, src: "", mail: "", ...patch });
    document.getElementById("legacy-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const s = stats;
  const pages = Math.max(1, Math.ceil(count / 50));

  const tiles: { id: string; k: string; v: string; sub: string; go: Partial<typeof f> }[] = [
    { id: "B101", k: "통합 회원", v: s ? `${n(s.total)}명` : "—", sub: s?.imported_at ? `올린 날 ${new Date(s.imported_at).toLocaleDateString("ko-KR")}` : "아직 없음", go: {} },
    { id: "B102", k: "구워프 → 이전", v: s ? `${n(s.legacy_joined)}명` : "—", sub: s ? `이메일 일치 · 신워프 ${n(s.new_warp_joined)}명 제외` : "", go: { src: "legacy_joined" } },
    { id: "B103", k: "가입됨", v: s ? `${n(s.joined)}명` : "—", sub: s ? pct(s.joined, s.total) : "", go: { match: "가입됨" } },
    { id: "B104", k: "미가입", v: s ? `${n(s.not_joined)}명` : "—", sub: s ? pct(s.not_joined, s.total) : "", go: { match: "미가입" } },
    { id: "B105", k: "비교대기", v: s ? `${n(s.pending)}명` : "—", sub: "대조 전", go: { match: "비교대기" } },
    { id: "B106", k: "탈퇴(개인정보 없음)", v: s ? `${n(s.withdrawn)}명` : "—", sub: "대조용 해시만 보관", go: { status: "탈퇴" } },
    { id: "B108", k: "메일불가 회원", v: s ? `${n(s.no_mail)}명` : "—", sub: "이메일 없음 · 메일 발송 제외", go: { mail: "none" } },
    { id: "B107", k: "검토 필요", v: s ? `${n(s.review)}명` : "—", sub: "원본 6건↑·상태값 오류", go: { review: true } },
  ];

  return (
    <div className="space-y-6">
      <section data-block-id="S100" data-block-name="이전 현황" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        {tiles.map((t) => (
          <button key={t.id} type="button" data-block-id={t.id} data-block-name={`이전 현황 ${t.k}`} onClick={() => go(t.go)} className="rounded-2xl border border-line bg-white p-4 text-left shadow-card active:opacity-80">
            <p className="text-sm text-sub">{t.k}</p>
            <p className="num mt-1 text-xl font-bold">{t.v}</p>
            <p className="num text-xs text-sub">{t.sub}</p>
          </button>
        ))}
      </section>
      {s && s.total > 0 && (
        <p className="num text-sm text-sub">
          라이더 {n(s.riders)} · 드라이버 {n(s.drivers)} · 이메일·휴대폰 모두 보유 {n(s.both_keys)} ({pct(s.both_keys, s.total)}) · 마케팅 동의 {n(s.agreed)}
        </p>
      )}

      <section data-block-id="S101" data-block-name="엑셀 올리기" className="space-y-3 rounded-2xl border border-line bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">구 워프 회원 엑셀 올리기</h2>
            <p className="text-sm text-sub">통합회원 DB 엑셀의 &lsquo;회원통합&rsquo; 시트를 읽어 500명씩 저장하고, 끝나면 현재 회원과 이메일·휴대폰 정확 일치로 대조합니다.</p>
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            <button data-block-id="B100" data-block-name="엑셀 선택" disabled={busy} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" onClick={() => fileRef.current?.click()}>엑셀 선택</button>
            <button data-block-id="B101" data-block-name="다시 대조" disabled={busy || !s?.total} className="rounded-xl bg-bg px-4 py-2.5 text-sm disabled:opacity-50" onClick={rematch}>다시 대조</button>
          </div>
        </div>
        {progress && <p role="status" data-block-id="C100" className="rounded-xl bg-accentSoft px-4 py-2.5 text-sm text-accent">{progress}</p>}
        <p className="text-xs text-sub">새로 가입한 회원은 가입 즉시 자동으로 &lsquo;가입됨&rsquo;으로 바뀝니다. 휴대폰 대조는 연락 수단을 &lsquo;전화번호&rsquo;로 등록한 회원만 해당됩니다.</p>
      </section>

      <section id="legacy-list" data-block-id="S102" data-block-name="구 워프 회원 목록" className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); apply(f); }}>
          <input data-block-id="F100" className={`${input} w-60`} type="search" placeholder="회원ID·이름·닉네임·이메일·휴대폰" aria-label="구 워프 회원 검색" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          <select aria-label="구분" className={input} value={f.kind} onChange={(e) => apply({ ...f, kind: e.target.value })}>
            <option value="">구분 전체</option><option>라이더</option><option>드라이버</option>
          </select>
          <select aria-label="대조 상태" className={input} value={f.match} onChange={(e) => apply({ ...f, match: e.target.value })}>
            <option value="">대조 전체</option><option>가입됨</option><option>미가입</option><option>비교대기</option>
          </select>
          <select aria-label="회원 상태" className={input} value={f.status} onChange={(e) => apply({ ...f, status: e.target.value })}>
            <option value="">상태 전체</option><option>사용중</option><option>탈퇴</option><option>정지중</option><option>기타</option>
          </select>
          <select aria-label="출처" className={input} value={f.src} onChange={(e) => apply({ ...f, src: e.target.value })}>
            <option value="">출처 전체</option><option value="legacy_joined">구워프 이전(이메일 일치)</option><option value="new_warp">신워프 명단</option>
          </select>
          <select aria-label="메일 가능 여부" className={input} value={f.mail} onChange={(e) => apply({ ...f, mail: e.target.value })}>
            <option value="">메일 전체</option><option value="ok">메일 가능</option><option value="none">메일불가(이메일 없음)</option>
          </select>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#2F6BFF]" checked={f.review} onChange={(e) => apply({ ...f, review: e.target.checked })} />검토 필요만</label>
          <button className="rounded-lg bg-bg px-4 py-2 text-sm">검색</button>
          <span className="num ml-auto text-sm text-sub">{n(count)}명</span>
        </form>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[960px] whitespace-nowrap text-left text-sm">
            <thead className="text-sub">
              <tr>{["회원ID", "이름 · 닉네임", "구분", "가입일", "상태", "휴대폰", "이메일", "대조", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.warp_id} className={r.withdrawn ? "text-sub" : ""}>
                  <td className="num px-2 py-2">{r.warp_id}</td>
                  <td className="px-2 py-2">{r.withdrawn ? "탈퇴 회원" : `${r.name ?? "—"} · ${r.nickname ?? "—"}`}</td>
                  <td className="px-2 py-2">{r.kind}</td>
                  <td className="num px-2 py-2">{(r.joined_on ?? "").slice(0, 10)}</td>
                  <td className="px-2 py-2">{r.status ?? <span className="text-warn">미입력</span>}{r.records >= 6 && <span className="ml-1 text-xs text-warn">원본 {r.records}건</span>}</td>
                  <td className="num px-2 py-2">{r.phone}</td>
                  <td className="px-2 py-2">{r.no_mail ? <span className="rounded-full bg-warnSoft px-2 py-0.5 text-xs font-semibold text-warn">메일불가</span> : r.email || "—"}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.match_status === "가입됨" ? "bg-accentSoft text-accent" : "bg-bg text-sub"}`}>{r.match_status}</span>
                    {r.matched_by && <span className="ml-1 text-xs text-sub">{r.matched_by}</span>}
                  </td>
                  <td className="px-2 py-2"><button data-block-id="B102" data-block-name="상세" className="min-h-0 text-accent underline" onClick={() => open(r.warp_id)}>상세</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="py-8 text-center text-sub">{s?.total ? "조건에 맞는 회원이 없습니다." : "아직 올린 데이터가 없습니다. 위에서 엑셀을 선택해 주세요."}</p>}
        </div>
        {count > 50 && (
          <div className="mt-3 flex items-center justify-center gap-3 text-sm">
            <button disabled={page === 0} className="rounded-lg bg-bg px-3 py-1.5 disabled:opacity-40" onClick={() => load(page - 1)}>이전</button>
            <span className="num">{page + 1} / {pages}</span>
            <button disabled={page + 1 >= pages} className="rounded-lg bg-bg px-3 py-1.5 disabled:opacity-40" onClick={() => load(page + 1)}>다음</button>
          </div>
        )}
      </section>

      {detail && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" role="dialog" aria-modal="true" aria-label="구 워프 회원 상세" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div data-block-id="S103" data-block-name="구 워프 회원 상세" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="num text-sm text-sub">{detail.warp_id} · 원본번호 {detail.src_no}</p>
                <h2 className="text-xl font-bold">{detail.withdrawn ? "탈퇴 회원" : `${detail.name ?? "—"} (${detail.nickname ?? "—"})`}</h2>
              </div>
              <button className="min-h-0 text-sub" aria-label="닫기" onClick={() => setDetail(null)}>✕</button>
            </div>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
              {[
                ["구분 · 성별", `${detail.kind ?? "—"} · ${detail.gender ?? "—"}`],
                ["가입일 · 상태", `${(detail.joined_on ?? "").slice(0, 10)} · ${detail.status ?? "미입력"}`],
                ["휴대폰", detail.phone || "—"],
                ["이메일", detail.email || "—"],
                ["네이버 · 카카오", `${detail.naver_id || "—"} · ${detail.kakao_id || "—"}`],
                ["원본 레코드", `${detail.records}건`],
                ["대조", `${detail.match_status}${detail.matched_by ? ` (${detail.matched_by})` : ""}${detail.user_name ? ` → 현재 회원 ${detail.user_name}` : ""}`],
                ["마케팅 · 홍보", `${detail.marketing} · ${detail.promo}`],
                ["메모", detail.memo || "—"],
              ].map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-sub">{k}</dt><dd className="break-all">{v}</dd></div>
              ))}
            </dl>
            {detail.withdrawn ? (
              <p className="rounded-xl bg-bg px-4 py-3 text-sm text-sub">탈퇴 회원은 개인정보를 저장하지 않았습니다. 재가입 여부 대조에만 쓰입니다.</p>
            ) : !detail.revealed ? (
              <button data-block-id="B103" data-block-name="연락처 보기" className="w-full rounded-xl bg-bg py-3 text-sm font-semibold" onClick={() => open(detail.warp_id, true)}>연락처 전체 보기 (열람 기록이 남습니다)</button>
            ) : (
              <p className="rounded-xl bg-accentSoft px-4 py-3 text-sm text-accent">연락처를 열람했습니다. 열람 기록이 저장되었습니다.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
