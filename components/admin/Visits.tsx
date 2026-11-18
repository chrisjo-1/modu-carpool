"use client";

import { useEffect, useState } from "react";
import { api, Card } from "@/components/ui";
import { JOIN_SOURCES } from "@/lib/types";

type Source = { source: string; label: string; visitors: number; members: number; signups: number };
type Data = {
  day: string; today: string; trackingSince: string | null;
  summary: { visitors: number; first_time: number; members: number; opens: number; app: number; browser: number; pc: number; membersSeen: number; signupRequests: number; warpFinished: number; tempCreated: number };
  sources: Source[]; hours: number[];
  signups: { src: string; n: number; done: number }[];
  trend: { day: string; visitors: number; first_time: number; members: number; signups: number; temp_created: number; pending: number }[];
};

const f = (n: number) => Number(n || 0).toLocaleString("ko-KR");
const SRC_NAME: Record<string, string> = Object.fromEntries(JOIN_SOURCES);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-3">
      <p className="text-[13px] text-sub">{label}</p>
      <p className="mt-0.5 text-[22px] font-extrabold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-sub">{sub}</p>}
    </div>
  );
}

/** 관리자 현황 › '방문'(2026-11-18): 오늘 방문자·회원 방문·처음 온 방문자·가입·접속 경로·시간대·최근 14일 */
export default function AdminVisits() {
  const [day, setDay] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");

  const load = async (v = day) => {
    setMsg("");
    const r = await api<Data>(`/api/admin/visits${v ? `?day=${v}` : ""}`);
    if (!r.ok) return setMsg(r.error || "불러오지 못했어요.");
    setD(r.data);
    if (!v) setDay(r.data.day);
  };
  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = d?.summary;
  const maxHour = Math.max(1, ...(d?.hours ?? [0]));
  const maxSrc = Math.max(1, ...(d?.sources ?? []).map((x) => x.visitors));
  const signupTotal = (d?.signups ?? []).reduce((a, x) => a + x.n, 0);

  return (
    <section data-block-id="S439" data-block-name="관리자 방문 현황" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">방문 · 가입 · 접속 경로</h2>
        <input type="date" value={day} max={d?.today} onChange={(e) => { setDay(e.target.value); load(e.target.value); }} className="rounded-lg border border-line bg-white px-2 py-1.5 text-[14px]" />
        {d && day !== d.today && <button type="button" className="rounded-lg border border-line bg-white px-3 py-1.5 text-[14px]" onClick={() => { setDay(d.today); load(d.today); }}>오늘</button>}
        <button type="button" className="rounded-lg border border-line bg-white px-3 py-1.5 text-[14px]" onClick={() => load()}>새로고침</button>
      </div>
      {msg && <p className="text-[14px] text-warn">{msg}</p>}
      {d && (
        <p className="text-[13px] text-sub">
          {d.trackingSince ? `방문 기록은 ${d.trackingSince}부터 쌓였어요.` : "방문 기록은 배포한 뒤부터 쌓여요."} 방문자 = 그날 앱을 연 기기 수(같은 기기는 하루 한 번), 테스트 계정 제외. 가입·회원 접속은 지난 날도 보여요.
        </p>
      )}

      {s && (
        <div data-block-id="C453" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="방문자(기기)" value={f(s.visitors)} sub={`처음 온 기기 ${f(s.first_time)} · 앱을 연 횟수 ${f(s.opens)}`} />
          <Stat label="회원 방문" value={f(d?.day === d?.today ? s.membersSeen : s.members)} sub={d?.day === d?.today ? `방문 기록으로 ${f(s.members)}명` : "방문 기록 기준"} />
          <Stat label="가입" value={f(signupTotal)} sub={`인증 대기 ${f(s.signupRequests)} · 워프 임시 계정 비번 설정 ${f(s.warpFinished)} · 임시 계정 생성 ${f(s.tempCreated)}`} />
          <Stat label="앱 · 인터넷 창 · PC" value={`${f(s.app)} · ${f(s.browser)} · ${f(s.pc)}`} sub={`앱 비율 ${pct(s.app, s.visitors)}`} />
        </div>
      )}

      {d && (
        <Card className="space-y-2 p-4">
          <p className="font-semibold">접속 경로</p>
          {d.sources.length === 0 && <p className="text-[14px] text-sub">이날 방문 기록이 없어요.</p>}
          {d.sources.map((x) => (
            <div key={x.source} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-[14px]">
                <span className="font-medium">{x.label}</span>
                <span className="tabular-nums text-sub">방문 {f(x.visitors)} · 회원 {f(x.members)} · 가입 {f(x.signups)}</span>
              </div>
              <div className="h-2 rounded-full bg-bg"><div className="h-2 rounded-full bg-accent" style={{ width: `${(x.visitors / maxSrc) * 100}%` }} /></div>
            </div>
          ))}
          <p className="text-[12px] text-sub">메일 링크 = 메일 속 버튼·링크(비밀번호 설정·인증·개인정보 안내 등), 문자·카톡 링크 = 회원별 /s/ 링크·/credit, 카카오톡 = 카카오톡 안에서 연 창, 직접 = 주소 입력·즐겨찾기·이전 페이지 정보 없음. 주소 끝에 ?utm_source=이름 을 붙이면 그 이름으로 따로 셉니다.</p>
        </Card>
      )}

      {d && (
        <Card className="space-y-2 p-4">
          <p className="font-semibold">시간대별 방문자</p>
          <div className="flex h-28 items-end gap-[3px]">
            {d.hours.map((n, h) => (
              <div key={h} className="flex flex-1 flex-col items-center gap-1" title={`${h}시 ${n}명`}>
                <div className="w-full rounded-t bg-accent" style={{ height: `${(n / maxHour) * 88}px`, minHeight: n ? 2 : 0 }} />
                <span className="text-[10px] text-sub">{h % 3 === 0 ? h : ""}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {d && (
        <Card className="space-y-2 p-4">
          <p className="font-semibold">가입 경로(가입할 때 고른 것)</p>
          <p className="text-[12px] text-sub">가입 화면에서 직접 가입한 회원만. 워프동기화·워프 명단으로 만든 임시 계정은 위 '임시 계정 생성'에 따로 셉니다.</p>
          {d.signups.length === 0 && <p className="text-[14px] text-sub">이날 가입이 없어요.</p>}
          {d.signups.map((x) => (
            <p key={x.src} className="flex justify-between text-[14px]"><span>{SRC_NAME[x.src] ?? x.src}</span><span className="tabular-nums">{f(x.n)}명 (비밀번호 설정 {f(x.done)})</span></p>
          ))}
        </Card>
      )}

      {d && (
        <Card className="overflow-x-auto p-4">
          <p className="mb-2 font-semibold">최근 14일</p>
          <table className="w-full min-w-[420px] text-[14px] tabular-nums">
            <thead className="text-left text-sub">
              <tr><th className="py-1">날짜</th><th>방문자</th><th>처음 온 기기</th><th>회원 방문</th><th>가입</th><th>인증 대기</th><th>임시 계정</th></tr>
            </thead>
            <tbody>
              {d.trend.map((r) => (
                <tr key={r.day} className={`border-t border-line ${r.day === d.day ? "font-bold" : ""}`}>
                  <td className="py-1"><button type="button" className="underline" onClick={() => { setDay(r.day); load(r.day); }}>{r.day.slice(5)}</button></td>
                  <td>{f(r.visitors)}</td><td>{f(r.first_time)}</td><td>{f(r.members)}</td><td>{f(r.signups)}</td><td>{f(r.pending)}</td><td>{f(r.temp_created)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
