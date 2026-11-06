"use client";
import { useCallback, useEffect, useState } from "react";

type Tpl = { key: string; label: string; templateId: string; body: string };
type Job = { on: boolean; templateKey: string; groups: string[]; warp: string; cap: number; startedAt?: string; note?: string } | null;
type Data = {
  config: { key: boolean; secret: boolean; sender: boolean; pfId: boolean };
  ready: boolean;
  fallback: boolean;
  templates: Tpl[];
  job: Job;
  stats: { rows: { template: string; group: string; status: string; n: number }[]; links: { made: number; clicked: number; pw: number } };
};

const GROUPS: [string, string][] = [["apple", "아이폰 메일"], ["bad", "반송·잘못된 메일"], ["unread", "메일 안 열어 봄"], ["none", "아직 메일 안 보냄"]];
const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";
const f = (v: number) => v.toLocaleString("ko-KR");

/** 관리자 메일 탭 '알림톡 발송'(lib/kakao.ts). 워프 회원 유입용 정보성 안내만. */
export default function Kakao() {
  const [d, setD] = useState<Data | null>(null);
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [preview, setPreview] = useState("");
  const [tplKey, setTplKey] = useState("");
  const [groups, setGroups] = useState<string[]>(["apple", "bad"]);
  const [warp, setWarp] = useState("all");
  const [cap, setCap] = useState("200");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/kakao");
    if (!r.ok) return setMsg((await r.json().catch(() => ({}))).error ?? "불러오지 못했습니다.");
    const j = (await r.json()) as Data;
    setD(j);
    setTpls(j.templates);
    setTplKey((k) => k || j.templates[0]?.key || "");
  }, []);
  useEffect(() => { load(); }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin/kakao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(false);
    return (await r.json().catch(() => ({}))) as Record<string, unknown>;
  };

  if (!d) return null;
  const t = tpls.find((x) => x.key === tplKey);
  const sum = (status: string) => d.stats.rows.filter((x) => x.status === status).reduce((s, x) => s + x.n, 0);
  const setTpl = (i: number, k: keyof Tpl, v: string) => setTpls((list) => list.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  return (
    <section data-block-id="S423" data-block-name="알림톡 발송" className="space-y-4 rounded-2xl bg-white p-5 shadow-card">
      <div>
        <h2 className="text-[17px] font-bold">알림톡 발송 (워프 회원 유입)</h2>
        <p className="text-[13px] text-sub">솔라피로 보내요. 발신번호를 넣으면 알림톡이 안 될 때 같은 내용을 문자(LMS)로 대신 보내요. 한 사람에게 같은 문구는 한 번만, 오전 9시~오후 8시에만, 3분마다 100명씩(한 시간 600명까지). 기록에 전화번호는 남기지 않아요.</p>
      </div>

      <div className="rounded-xl border border-line p-3 text-sm">
        <p className="font-semibold">{d.ready ? "✓ 솔라피 연결 준비됨" : "솔라피 설정이 아직 없어요 (Vercel 환경변수)"}</p>
        <ul className="mt-1 grid grid-cols-2 gap-x-3 text-[13px]">
          {([["key", "SOLAPI_API_KEY"], ["secret", "SOLAPI_API_SECRET"], ["pfId", "SOLAPI_PFID (카카오 채널)"]] as const).map(([k, l]) => (
            <li key={k} className={d.config[k] ? "text-accent" : "text-warn"}>{d.config[k] ? "✓" : "✕"} {l}</li>
          ))}
          <li className={d.config.sender ? "text-accent" : "text-sub"}>{d.config.sender ? "✓" : "–"} SOLAPI_SENDER (발신번호, 선택)</li>
        </ul>
        <p className="mt-1 text-[13px] text-sub">{d.fallback ? "알림톡이 안 되는 분에게는 문자로 대신 보내요." : "발신번호가 없어 알림톡만 보내요. 카카오톡이 없거나 채널을 차단한 분에게는 가지 않아요."}</p>
      </div>

      <div className="space-y-3">
        <p className="font-semibold">템플릿 (카카오 승인 문구와 글자 하나까지 같아야 해요 · 변수 #{"{이름}"} #{"{링크}"})</p>
        {tpls.map((x, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-line p-3">
            <div className="grid gap-2 md:grid-cols-3">
              <input className={input} value={x.label} onChange={(e) => setTpl(i, "label", e.target.value)} placeholder="이름 (관리용)" />
              <input className={input} value={x.key} onChange={(e) => setTpl(i, "key", e.target.value)} placeholder="키 (영문)" />
              <input className={input} value={x.templateId} onChange={(e) => setTpl(i, "templateId", e.target.value)} placeholder="솔라피 템플릿 ID (승인 후)" />
            </div>
            <textarea className={input} rows={6} value={x.body} onChange={(e) => setTpl(i, "body", e.target.value)} />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-lg border border-line bg-white px-3 py-2 text-sm" onClick={() => setTpls((l) => [...l, { key: `tpl${l.length + 1}`, label: "", templateId: "", body: "" }])}>템플릿 추가</button>
          <button type="button" data-block-id="B477" disabled={busy} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={async () => {
            const r = await post({ action: "templates", templates: tpls });
            setMsg(r.ok ? "템플릿을 저장했어요." : String(r.error ?? "저장하지 못했어요."));
            load();
          }}>템플릿 저장</button>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-line p-3">
        <p className="font-semibold">시험 발송 (내 휴대폰으로 · 번호는 저장하지 않아요)</p>
        <div className="flex flex-wrap gap-2">
          <select className="rounded-lg border border-line bg-white px-3 py-2 text-[15px]" value={tplKey} onChange={(e) => setTplKey(e.target.value)}>
            {tpls.map((x) => <option key={x.key} value={x.key}>{x.label || x.key}</option>)}
          </select>
          <input className="rounded-lg border border-line bg-white px-3 py-2 text-[15px]" inputMode="tel" placeholder="010-0000-0000" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <button type="button" data-block-id="B478" disabled={busy} className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold" onClick={async () => {
            const r = await post({ action: "test", templateKey: tplKey, to: testTo });
            setPreview(String(r.preview ?? ""));
            setMsg(r.ok ? "시험 알림톡을 보냈어요. 휴대폰을 확인해 주세요." : String(r.error ?? "보내지 못했어요."));
          }}>시험 보내기 · 미리보기</button>
        </div>
        {preview && <pre className="whitespace-pre-wrap rounded-lg bg-bg p-3 text-[14px]">{preview}</pre>}
      </div>

      <div className="space-y-2 rounded-xl border border-line p-3">
        <p className="font-semibold">발송 작업</p>
        {d.job && (
          <p className={`text-sm ${d.job.on ? "font-semibold text-accent" : "text-sub"}`}>
            {d.job.on ? "보내는 중" : "멈춤"} · {tpls.find((x) => x.key === d.job?.templateKey)?.label || d.job.templateKey} · {d.job.groups.map((g) => GROUPS.find(([k]) => k === g)?.[1] ?? g).join(", ")} · {d.job.warp === "new" ? "신워프만" : d.job.warp === "old" ? "구워프만" : "신·구워프"} · 목표 {d.job.cap ? `${f(d.job.cap)}명` : "제한 없음"}{d.job.note ? ` · ${d.job.note}` : ""}
          </p>
        )}
        <div className="flex flex-wrap gap-3 text-[15px]">
          {GROUPS.map(([k, l]) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="checkbox" checked={groups.includes(k)} onChange={(e) => setGroups((g) => (e.target.checked ? [...g, k] : g.filter((x) => x !== k)))} /> {l}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded-lg border border-line bg-white px-3 py-2 text-[15px]" value={warp} onChange={(e) => setWarp(e.target.value)}>
            <option value="all">신·구워프 모두</option><option value="new">신워프만</option><option value="old">구워프만</option>
          </select>
          <label className="flex items-center gap-1 text-[15px]">목표 <input className="w-24 rounded-lg border border-line bg-white px-3 py-2" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))} />명 (0 = 모두)</label>
          {d.job?.on ? (
            <button type="button" data-block-id="B479" disabled={busy} className="rounded-lg bg-warn px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={async () => { const r = await post({ action: "stop" }); setMsg(r.ok ? "멈췄어요." : String(r.error)); load(); }}>멈추기</button>
          ) : (
            <button type="button" data-block-id="B480" disabled={busy || !d.ready || !t?.templateId} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={async () => {
              if (!window.confirm(`'${t?.label || tplKey}' 알림톡을 고른 그룹에 ${cap && cap !== "0" ? `${cap}명까지` : "모두"} 보낼까요?\n계정이 없는 분은 이때 임시 계정이 만들어지고, 보낸 알림톡은 되돌릴 수 없어요.`)) return;
              const r = await post({ action: "start", templateKey: tplKey, groups, warp, cap: Number(cap) || 0 });
              setMsg(r.ok ? `시작했어요. 첫 묶음: ${JSON.stringify(r.first)}` : String(r.error ?? "시작하지 못했어요."));
              load();
            }}>발송 시작</button>
          )}
        </div>
        {!d.ready && <p className="text-[13px] text-sub">솔라피 환경변수와 승인 템플릿 ID가 있어야 시작할 수 있어요.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
        <div className="rounded-xl bg-bg p-3"><p className="text-sub">보냄</p><p className="text-lg font-bold">{f(sum("sent"))}</p></div>
        <div className="rounded-xl bg-bg p-3"><p className="text-sub">실패</p><p className="text-lg font-bold">{f(sum("failed"))}</p></div>
        <div className="rounded-xl bg-bg p-3"><p className="text-sub">건너뜀</p><p className="text-lg font-bold">{f(sum("skip"))}</p></div>
        <div className="rounded-xl bg-bg p-3"><p className="text-sub">링크 누름</p><p className="text-lg font-bold">{f(d.stats.links.clicked)} / {f(d.stats.links.made)}</p></div>
        <div className="rounded-xl bg-bg p-3"><p className="text-sub">비번 설정 완료</p><p className="text-lg font-bold">{f(d.stats.links.pw)}</p></div>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
    </section>
  );
}
