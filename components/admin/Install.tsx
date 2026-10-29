"use client";
import { useEffect, useState } from "react";

type Stats = { app7: number; web7: number; pc7: number; app30: number; web30: number; pc30: number; ever_app: number };
const MODES: [string, string, string][] = [
  ["off", "끄기", "안내하지 않아요."],
  ["nudge", "권유", "휴대폰 인터넷 창으로 들어오면 접속마다 설치 안내가 떠요. [나중에 할게요]로 닫을 수 있어요."],
  ["require", "필수", "휴대폰 인터넷 창에서는 닫기 없이 설치 안내만 보여요. 설치한 앱(홈 화면 아이콘)으로만 이용할 수 있어요. PC·비밀번호 재설정·인증·탈퇴·마음 상담 링크는 막지 않아요."],
];

/** 관리자 > 사이트: 앱 설치 안내(끄기·권유·필수)와 최근 접속 회원의 앱·인터넷 창 인원 */
export default function AdminInstall() {
  const [gate, setGate] = useState("off");
  const [stats, setStats] = useState<Stats | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () =>
    fetch("/api/admin/install")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return setMsg(j.error);
        setGate(j.gate);
        setStats(j.stats);
      })
      .catch(() => setMsg("불러오지 못했습니다."));
  useEffect(() => {
    load();
  }, []);
  const save = async (g: string) => {
    if (g === gate) return;
    if (g === "require" && !window.confirm("필수로 바꾸면 휴대폰 인터넷 창으로는 이용할 수 없고, 앱을 설치해야만 이용할 수 있어요. 바꿀까요?")) return;
    setBusy(true);
    const r = await fetch("/api/admin/install", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gate: g }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "저장하지 못했습니다.");
    setGate(j.gate);
    setMsg("저장했어요. 회원이 앱을 새로 열면 적용돼요.");
  };
  const row = (label: string, app: number, web: number, pc: number) => {
    const mobile = app + web;
    return (
      <p className="rounded-xl bg-bg px-3 py-2">
        {label} · 앱 <b className="num">{app}</b> · 인터넷 창 <b className="num">{web}</b> · PC <b className="num">{pc}</b>
        {mobile > 0 && <span className="text-sub"> (휴대폰 중 앱 {Math.round((app / mobile) * 100)}%)</span>}
      </p>
    );
  };
  return (
    <section data-block-id="S411" data-block-name="앱 설치 안내" className="mt-4 max-w-xl space-y-3 rounded-2xl bg-white p-5 shadow-card">
      <div>
        <p className="text-[15px] font-semibold">앱 설치 안내</p>
        <p className="mt-1 text-[13px] leading-relaxed text-sub">휴대폰에서 인터넷 창(크롬·사파리·카카오톡 안 화면)으로 들어온 회원에게 앱 설치를 안내해요. 안드로이드는 [앱 설치하기] 한 번, 아이폰은 공유 → 홈 화면에 추가 그림 안내, 카카오톡·네이버 안 화면은 크롬/사파리로 열기 안내가 나가요.</p>
      </div>
      <div className="grid gap-2">
        {MODES.map(([k, label, desc]) => (
          <label key={k} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-[14px] ${gate === k ? "border-accent bg-accentSoft" : "border-line"}`}>
            <input type="radio" name="install-gate" checked={gate === k} disabled={busy} onChange={() => save(k)} className="mt-1" />
            <span><b>{label}</b><span className="block text-[13px] text-sub">{desc}</span></span>
          </label>
        ))}
      </div>
      {stats && (
        <div className="grid gap-2 text-[14px]">
          {row("최근 7일", stats.app7, stats.web7, stats.pc7)}
          {row("최근 30일", stats.app30, stats.web30, stats.pc30)}
          <p className="text-[12px] text-sub">로그인한 회원이 마지막으로 연 방식 기준(2026-10-29부터 기록). 앱으로 한 번이라도 연 회원 {stats.ever_app}명.</p>
        </div>
      )}
      {msg && <p className="text-[14px] text-sub">{msg}</p>}
    </section>
  );
}
