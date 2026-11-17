"use client";
import { useState } from "react";
import { creditInviteText } from "@/lib/creditInvite";

type G = { group: string; label: string; total: number; phone: number; newWarp: number; newWarpPhone: number; oldWarp: number; oldWarpPhone: number };
const f = (v: number) => v.toLocaleString("ko-KR");
const NOTE: Record<string, string> = {
  apple: "대량 메일에서 빠져 한 번도 못 받은 분",
  bad: "반송됐거나 주소가 비었거나 형식이 틀린 분",
  filtered: "반송이 많은 도메인(다음·한메일·네이트·카카오 등)·문 닫은 메일·오타 주소라 메일을 보내지 않는 분",
  unread: "메일 받고 2일 지났는데 열어 본 기록이 없는 분 (10/29 전 메일은 열람 기록이 없어 여기에 들어가요)",
  none: "아직 메일을 안 보낸 분 — 문자보다 메일을 먼저 보내요",
};

/** 문자·알림톡 안내 대상(워프 회원 유입용). 여는 데 시간이 걸려 [불러오기]를 눌러야 센다. */
export default function SmsTargets() {
  const [g, setG] = useState<G[] | null>(null);
  const [links, setLinks] = useState<{ total: number; clicked: number } | null>(null);
  const [lg, setLg] = useState<string[]>(["filtered", "bad", "apple"]);
  const [lw, setLw] = useState("all");
  const [ln, setLn] = useState(100);
  const [lmsg, setLmsg] = useState("");
  const makeLinks = async () => {
    setBusy(true);
    setLmsg("");
    const r = await fetch("/api/admin/sms-targets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "links", groups: lg, warp: lw, limit: ln }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setLmsg(j.error ?? "만들지 못했어요.");
    setLinks(j.links);
    setLmsg(`새 링크 ${f(j.made)}개를 만들었어요${j.skipped ? ` · 계정을 못 만든 분 ${f(j.skipped)}명(메일 없음·탈퇴 등)` : ""}${j.left ? ` · 시간이 모자라 ${f(j.left)}명은 다음에` : ""}.`);
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = async () => {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/admin/sms-targets");
    setBusy(false);
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).error ?? "불러오지 못했습니다.");
    const j = await r.json();
    setG(j.groups);
    setLinks(j.links ?? null);
  };
  const sendable = g ? g.filter((x) => x.group !== "none").reduce((s, x) => s + x.phone, 0) : 0;
  return (
    <section data-block-id="S422" data-block-name="문자·알림톡 대상" className="space-y-3 rounded-2xl bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold">문자 · 알림톡 대상 (워프 회원 유입)</h2>
          <p className="text-[13px] text-sub">메일로 알리지 못한 워프 회원이에요. 이미 모두의카풀을 쓰는 분(비번 설정·접속)과 탈퇴한 분은 빠져요. 전화번호는 명단에 넣지 않고 있음(O/X)만 보여요 — 문자는 업체 연결 뒤 서버에서 보냅니다.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" data-block-id="B475" onClick={load} disabled={busy} className="rounded-xl border border-line bg-white px-4 py-2.5 text-[15px] font-semibold text-ink disabled:opacity-50">{busy ? "세는 중…" : g ? "다시 세기" : "인원 세기"}</button>
          <a href="/api/admin/sms-targets?csv=all" data-block-id="B476" className="rounded-xl border border-line bg-white px-4 py-2.5 text-[15px] font-semibold text-ink">전체 명단 (CSV)</a>
        </div>
      </div>
      {err && <p className="text-sm text-warn">{err}</p>}
      {g && (
        <>
          <p className="text-[15px]">지금 문자로 안내할 인원(아이폰·반송·안 열어 봄, 전화 있음): <b>{f(sendable)}명</b></p>
          <div className="grid gap-3 md:grid-cols-2">
            {g.map((x) => (
              <div key={x.group} className="space-y-1 rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{x.label} <span className="text-sub">{f(x.total)}명</span></p>
                  <a href={`/api/admin/sms-targets?csv=${x.group}`} className="text-[13px] font-semibold text-accent">CSV</a>
                </div>
                <p className="text-[13px] text-sub">{NOTE[x.group]}</p>
                <p className="text-[14px]">전화 있음 {f(x.phone)} · 신워프 {f(x.newWarp)}(전화 {f(x.newWarpPhone)}) · 구워프 {f(x.oldWarp)}(전화 {f(x.oldWarpPhone)})</p>
              </div>
            ))}
          </div>
        </>
      )}
      <div data-block-id="C451" data-block-name="크레딧 이관 안내 링크" className="space-y-2 rounded-xl border border-accent bg-accentSoft/40 p-3">
        <p className="font-semibold">크레딧 이관 안내 링크 (문자·카톡용)</p>
        <p className="text-[13px] text-sub">회원마다 14일짜리 링크를 만들어요. 누르면 가입을 안 끝낸 분은 비밀번호만 정하면 바로 로그인, 이미 가입한 분은 로그인 뒤 — 둘 다 <b>크레딧 이관 신청 창</b>이 워프 고유번호·메일이 채워진 채로 열려요. 계정이 없는 분은 워프 명단 메일로 임시 계정을 만들어요. 전화번호가 있는 분만, 한 번에 최대 300명.</p>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          {(g ?? []).map((x) => (
            <label key={x.group} className="flex items-center gap-1">
              <input type="checkbox" checked={lg.includes(x.group)} onChange={() => setLg((v) => (v.includes(x.group) ? v.filter((y) => y !== x.group) : [...v, x.group]))} />
              {x.label}
            </label>
          ))}
          {!g && <span className="text-sub">[인원 세기]를 먼저 눌러 주세요.</span>}
          <select value={lw} onChange={(e) => setLw(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1">
            <option value="all">신·구워프 모두</option>
            <option value="new">신워프만</option>
            <option value="old">구워프만</option>
          </select>
          <input type="number" min={1} max={300} value={ln} onChange={(e) => setLn(Number(e.target.value) || 1)} className="w-20 rounded-lg border border-line bg-white px-2 py-1" />
          <span>명</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" data-block-id="B505" data-block-name="이관 안내 링크 만들기" onClick={makeLinks} disabled={busy || !g || !lg.length} className="rounded-xl bg-accent px-4 py-2.5 text-[15px] font-bold text-white disabled:opacity-50">{busy ? "만드는 중…" : "링크 만들기"}</button>
          <a href="/api/admin/sms-targets?csv=links" data-block-id="B506" data-block-name="이관 안내 링크 명단" className="rounded-xl border border-line bg-white px-4 py-2.5 text-[15px] font-semibold text-ink">만든 링크 명단 (CSV)</a>
        </div>
        {links && <p className="text-[14px]">만든 링크 {f(links.total)}개 · 누른 분 {f(links.clicked)}명</p>}
        {lmsg && <p className="text-[14px] text-ink">{lmsg}</p>}
        <div className="rounded-lg bg-white p-2 text-[13px] text-sub">
          <p className="font-semibold text-ink">보낼 문구 (CSV에 회원별 링크가 들어간 문구가 있어요)</p>
          <p className="whitespace-pre-line">{creditInviteText("https://moducarpool.com/s/○○○○○○○○")}</p>
          <p className="mt-1">회원별 링크를 못 쓰는 곳(단체 카톡방 등)은 공용 링크 <b>moducarpool.com/credit</b> — 로그인 뒤 같은 창이 열려요.</p>
        </div>
      </div>
    </section>
  );
}
