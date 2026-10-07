"use client";
import { useState } from "react";
import type { User } from "@/lib/types";
import { Card, Segment, api, btnPrimary, field, useT } from "./ui";

/** datetime-local 입력의 기본값: 내일 오전 8시 */
function defaultWhen() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PostForm({ user, enabled, goLogin, onDone, toast }: { user: User | null; enabled: boolean; goLogin: () => void; onDone: () => void; toast: (m: string) => void }) {
  const t = useT();
  const [role, setRole] = useState<"driver" | "rider">("driver");
  const [kind, setKind] = useState<"commute" | "trip">("commute");
  const [cost, setCost] = useState<"free" | "meter">("free");
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [at, setAt] = useState(defaultWhen);
  const [seats, setSeats] = useState(2);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await api("/api/posts", "POST", { role, kind, cost: kind === "commute" ? cost : "free", origin, dest, departAt: new Date(at).getTime(), seats, note });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setOrigin("");
    setDest("");
    setNote("");
    toast(t("카풀을 등록했어요."));
    onDone();
  };

  return (
    <section data-block-id="S002" data-block-name="카풀 등록" className="space-y-4">
      <header>
        <h1 className="text-[28px] font-bold">{t("카풀 등록")}</h1>
        <p className="mt-1 text-sub">{t("태워 줄 수도, 태워 달라고 할 수도 있어요.")}</p>
      </header>

      {!user ? (
        <Card className="space-y-4 p-6 text-center">
          <p className="text-sub">{enabled ? t("카풀을 등록하려면 로그인이 필요해요.") : t("회원 기능은 준비 중입니다. 곧 열립니다.")}</p>
          {enabled && <button data-block-id="B020" data-block-name="로그인 이동" className={btnPrimary} onClick={goLogin}>{t("로그인 / 회원가입")}</button>}
        </Card>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Card className="space-y-4 p-5">
            <div className="space-y-1.5">
              <p className="text-sm text-sub">{t("나는")}</p>
              <Segment label={t("역할")} value={role} onChange={setRole} options={[["driver", t("운전자예요")], ["rider", t("탑승자예요")]]} />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm text-sub">{t("종류")}</p>
              <Segment label={t("종류")} value={kind} onChange={setKind} options={[["commute", t("출퇴근")], ["trip", t("나들이·관광")]]} />
            </div>
            <label className="block text-sm text-sub">
              {t("출발지")}
              <input data-block-id="F020" className={`${field} mt-1`} required minLength={2} maxLength={60} placeholder={t("예: 수원 영통역")} value={origin} onChange={(e) => setOrigin(e.target.value)} />
            </label>
            <label className="block text-sm text-sub">
              {t("도착지")}
              <input data-block-id="F021" className={`${field} mt-1`} required minLength={2} maxLength={60} placeholder={t("예: 강남역")} value={dest} onChange={(e) => setDest(e.target.value)} />
            </label>
            <label className="block text-sm text-sub">
              {t("출발 일시")}
              <input data-block-id="F022" className={`${field} num mt-1`} type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} />
            </label>
            <div className="flex items-center justify-between">
              <p className="text-sm text-sub">{role === "driver" ? t("태울 수 있는 자리") : t("함께 탈 인원")}</p>
              <div className="flex items-center gap-3">
                <button type="button" aria-label={t("줄이기")} className="grid h-11 w-11 place-items-center rounded-full bg-bg text-xl" onClick={() => setSeats((s) => Math.max(1, s - 1))}>−</button>
                <span className="num w-6 text-center text-xl font-bold">{seats}</span>
                <button type="button" aria-label={t("늘리기")} className="grid h-11 w-11 place-items-center rounded-full bg-bg text-xl" onClick={() => setSeats((s) => Math.min(6, s + 1))}>+</button>
              </div>
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <p className="text-sm text-sub">{t("비용")}</p>
            {kind === "commute" ? (
              <>
                <Segment label={t("비용")} value={cost} onChange={setCost} options={[["free", t("무료")], ["meter", t("미터기로 비용 나눔")]]} />
                {cost === "meter" && <p className="text-[14px] leading-relaxed text-warn">{t("비용 나눔은 평일 출퇴근 시간대(오전 7~9시, 오후 6~8시) 카풀에서 실비를 나누는 경우에만 허용됩니다.")}</p>}
              </>
            ) : (
              <p className="text-[15px] leading-relaxed text-sub">{t("나들이·관광 카풀은 무료 운행만 등록할 수 있어요.")}</p>
            )}
          </Card>

          <Card className="p-5">
            <label className="block text-sm text-sub">
              {t("남길 말 (선택)")}
              <textarea data-block-id="F023" className={`${field} mt-1`} rows={3} maxLength={300} placeholder={t("타는 곳, 짐, 분위기 등을 적어 주세요.")} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </Card>

          <button data-block-id="B021" data-block-name="등록" className={btnPrimary} disabled={busy}>{busy ? t("처리 중…") : t("등록하기")}</button>
        </form>
      )}
    </section>
  );
}
