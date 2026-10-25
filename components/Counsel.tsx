"use client";
import { useEffect, useMemo, useState } from "react";
import {
  CARE_TEXT, CHECK_NAME, CHOICES, QUIZ_GUIDE, INDEX_NAME, LEVEL_LABEL, LEVEL_TEXT, METHODS, METHOD_HINT, PRIVACY_TEXT, STATUS_LABEL, TOPICS, TOPIC_LABEL,
  looksLikePhone, questionsFor, scoreAnswers, slotLabel, type CounselStatus, type Method, type Result, type Topic,
} from "@/lib/counsel";
import { Sheet, api, btnGhost, btnPrimary, field, useT } from "./ui";

/** 마음 상담 주 버튼: 로즈 핑크(운전자 파랑·탑승자 초록·지하철 보라와 구분) */
const btnMind = btnPrimary.replace("bg-accent", "bg-mind").replace("text-[17px] font-semibold", "text-[18px] font-bold");

type Mine = { id: string; topic: Topic; slotAt: number; method: Method; status: CounselStatus };
type Info = { on: boolean; slots: number[]; mine: Mine | null; loggedIn: boolean };
type Step = "intro" | "topic" | "quiz" | "result" | "book" | "done";

const chip = (on: boolean) => `min-h-0 rounded-xl border px-4 py-3 text-left text-[15px] ${on ? "border-mind bg-mindSoft font-semibold text-mindInk" : "border-line bg-white text-ink"}`;

/**
 * 마음 상담: 유형 고르기 → 간단 질문(지난 2주) → 나의 스트레스 지수 → 상담 시간 예약.
 * 가볍게 들어올 수 있게 위기 전화번호 안내는 두지 않는다(위기 문항 해당은 관리자 메일에만 [긴급]).
 * 응답 원문은 서버에 보내기만 하고 저장하지 않는다(지수·단계만 저장). 연락처는 SNS 아이디만(전화번호 받지 않음).
 */
export default function Counsel({ onClose, toast }: { onClose: () => void; toast: (m: string) => void }) {
  const t = useT();
  const [info, setInfo] = useState<Info | null>(null);
  const [step, setStep] = useState<Step>("intro");
  const [topic, setTopic] = useState<Topic | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [slot, setSlot] = useState<number | null>(null);
  const [method, setMethod] = useState<Method>("kakao");
  const [contact, setContact] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [booked, setBooked] = useState<number | null>(null);

  const load = () =>
    fetch("/api/counsel")
      .then((r) => r.json())
      .then((j: Info) => setInfo(j))
      .catch(() => setErr(t("불러오지 못했어요. 잠시 후 다시 열어 주세요.")));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qs = useMemo(() => (topic ? questionsFor(topic) : []), [topic]);
  const result: Result | null = topic && answers.length === qs.length ? scoreAnswers(topic, answers) : null;
  const qi = answers.length;

  // 날짜별로 묶은 열린 시각
  const days = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of info?.slots ?? []) {
      const label = slotLabel(s);
      const day = label.slice(0, label.lastIndexOf(" "));
      m.set(day, [...(m.get(day) ?? []), s]);
    }
    return [...m.entries()];
  }, [info]);
  const [day, setDay] = useState("");
  const shownDay = day || days[0]?.[0] || "";

  const answer = (v: number) => {
    const next = [...answers, v];
    setAnswers(next);
    if (next.length === qs.length) setStep("result");
  };

  const book = async () => {
    if (!topic || slot == null) return;
    setErr("");
    setBusy(true);
    const r = await api<{ slotAt: number }>("/api/counsel", "POST", { action: "book", topic, answers, slot, method, contact, email: guestEmail, note, consent });
    setBusy(false);
    if (!r.ok) {
      setErr(t(r.error));
      if (r.error.includes("시간")) load();
      return;
    }
    setBooked(r.data.slotAt);
    setStep("done");
    load();
  };

  const cancel = async (id: string) => {
    setBusy(true);
    const r = await api("/api/counsel", "POST", { action: "cancel", id });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    toast(t("예약을 취소했어요."));
    load();
  };

  return (
    <Sheet title={t("마음 상담")} blockId="S370" onClose={onClose}>
      <div className="space-y-4 pb-2">
        {step === "intro" && (
          <>
            {info?.mine && (
              <div data-block-id="C372" data-block-name="내 상담 예약" className="space-y-2 rounded-2xl bg-mindSoft px-4 py-4">
                <p className="text-[14px] font-semibold text-mindInk">{t("내 상담 예약")} · {t(STATUS_LABEL[info.mine.status])}</p>
                <p className="text-[16px] font-semibold text-ink">{slotLabel(info.mine.slotAt)}</p>
                <p className="text-[14px] text-sub">{t(TOPIC_LABEL[info.mine.topic])}</p>
                <button type="button" data-block-id="B375" disabled={busy} className="min-h-0 text-[14px] text-sub underline" onClick={() => cancel(info.mine!.id)}>{t("예약 취소")}</button>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-[18px] font-bold text-ink">{t("요즘 마음은 어떠세요?")}</p>
              <p className="text-[15px] leading-relaxed text-sub">{t("몇 가지 질문으로 나의 스트레스 지수를 체크하고, 원하면 상담 시간을 예약할 수 있어요. 상담은 무료예요.")}</p>
              <p data-block-id="C374" data-block-name="상담 약속" className="rounded-xl bg-mindSoft px-4 py-3 text-[15px] font-semibold leading-relaxed text-mindInk">{t(CARE_TEXT)}</p>
              <ul className="space-y-1 text-[14px] leading-relaxed text-sub">
                <li>· {t("1~2분이면 끝나요. 답한 내용은 저장하지 않아요.")}</li>
                <li>· {t("결과는 진단이 아니라 참고용이에요.")}</li>
              </ul>
            </div>
            {!info ? (
              <p className="text-[15px] text-sub">{err || t("불러오는 중…")}</p>
            ) : (
              <button type="button" data-block-id="B370" data-block-name="상담 시작" className={btnMind} onClick={() => setStep("topic")}>{t(CHECK_NAME)}</button>
            )}
          </>
        )}

        {step === "topic" && (
          <>
            <p className="text-[17px] font-bold text-ink">{t("어떤 이야기를 나누고 싶으세요?")}</p>
            <div role="radiogroup" aria-label={t("상담 유형")} className="grid gap-2">
              {TOPICS.map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={topic === o.id} className={chip(topic === o.id)} onClick={() => setTopic(o.id)}>
                  <span className="block">{t(o.label)}</span>
                  <span className="block text-[13px] font-normal text-sub">{t(o.desc)}</span>
                </button>
              ))}
            </div>
            <button type="button" data-block-id="B371" className={btnMind} disabled={!topic} onClick={() => { setAnswers([]); setStep("quiz"); }}>{t("다음")}</button>
          </>
        )}

        {step === "quiz" && topic && qi < qs.length && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[13px] text-sub">
                <span className="font-semibold text-ink">{t(QUIZ_GUIDE)}</span>
                <span className="num">{qi + 1} / {qs.length}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-bg" aria-hidden>
                <div className="h-full rounded-full bg-mind motion-safe:transition-all" style={{ width: `${(qi / qs.length) * 100}%` }} />
              </div>
            </div>
            <p className="min-h-[3.5em] text-[18px] font-semibold leading-relaxed text-ink">{t(qs[qi])}</p>
            <div className="grid gap-2">
              {CHOICES.map((c, v) => (
                <button key={c} type="button" data-block-id="B372" className="min-h-[52px] rounded-xl border border-line bg-white px-4 text-left text-[16px] text-ink active:bg-mindSoft" onClick={() => answer(v)}>{t(c)}</button>
              ))}
            </div>
            <button type="button" className="min-h-0 text-[14px] text-sub underline" onClick={() => (qi === 0 ? setStep("topic") : setAnswers(answers.slice(0, -1)))}>{t("이전")}</button>
          </>
        )}

        {step === "result" && result && (
          <>
            <div data-block-id="C370" data-block-name="스트레스 지수" className="space-y-1 rounded-2xl bg-bg px-4 py-5 text-center">
              <p className="text-[14px] text-sub">{t(INDEX_NAME)}</p>
              <p className="num text-[44px] font-bold leading-none text-ink">{result.index}<span className="text-[18px] font-semibold text-sub"> / 100</span></p>
              <p className={`text-[16px] font-semibold ${result.level === "good" ? "text-mint" : result.level === "mild" ? "text-mindInk" : "text-warn"}`}>{t(LEVEL_LABEL[result.level])}</p>
            </div>
            <p className="text-[15px] leading-relaxed text-ink">{t(LEVEL_TEXT[result.level])} {t(CARE_TEXT)}</p>
            <p className="text-[12px] leading-relaxed text-sub">{t("점수가 높을수록 스트레스가 큰 상태예요. 표준 자가 점검 문항을 바탕으로 한 참고용이며 의학적 진단이 아니에요.")}</p>
            {info?.mine ? (
              <p className="rounded-xl bg-mindSoft px-4 py-3 text-[14px] text-mindInk">{t("이미 예약한 상담이 있어요")}: {slotLabel(info.mine.slotAt)}</p>
            ) : !info?.on || !info.slots.length ? (
              <p className="rounded-xl bg-bg px-4 py-3 text-[14px] text-sub">{t("지금은 예약할 수 있는 상담 시간이 없어요. 조금 뒤에 다시 확인해 주세요.")}</p>
            ) : (
              <button type="button" data-block-id="B373" data-block-name="상담 예약하기" className={btnMind} onClick={() => setStep("book")}>
                {t("상담 시간 예약하기")}
              </button>
            )}
            <button type="button" className={btnGhost} onClick={onClose}>{t("닫기")}</button>
          </>
        )}

        {step === "book" && result && (
          <>
            <div className="space-y-2">
              <p className="text-[15px] font-semibold text-ink">{t("상담 날짜")}</p>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {days.map(([d]) => (
                  <button key={d} type="button" aria-pressed={shownDay === d} className={`min-h-[44px] shrink-0 rounded-full border px-3.5 text-[14px] ${shownDay === d ? "border-mind bg-mindSoft font-semibold text-mindInk" : "border-line bg-white text-sub"}`} onClick={() => setDay(d)}>{d}</button>
                ))}
              </div>
              <div role="radiogroup" aria-label={t("상담 시각")} className="grid grid-cols-3 gap-2">
                {(days.find(([d]) => d === shownDay)?.[1] ?? []).map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={slot === s} className={`min-h-[44px] rounded-xl border text-[15px] ${slot === s ? "border-mind bg-mind font-semibold text-white" : "border-line bg-white text-ink"}`} onClick={() => setSlot(s)}>{slotLabel(s).slice(-5)}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[15px] font-semibold text-ink">{t("연락 방법")}</p>
              <div role="radiogroup" aria-label={t("연락 방법")} className="grid grid-cols-2 gap-2">
                {METHODS.map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={method === k} className={chip(method === k)} onClick={() => setMethod(k)}>{t(label)}</button>
                ))}
              </div>
              {method !== "email" ? (
                <input data-block-id="F370" aria-label={t("SNS 아이디")} className={field} maxLength={60} value={contact} onChange={(e) => setContact(e.target.value)}
                  placeholder={t(METHOD_HINT[method])} autoCapitalize="off" autoCorrect="off" />
              ) : (
                info?.loggedIn ? (
                  <p className="text-[13px] text-sub">{t("가입한 메일 주소로 연락드려요.")}</p>
                ) : (
                  <input data-block-id="F372" aria-label={t("메일 주소")} type="email" inputMode="email" autoCapitalize="off" className={field} maxLength={120} value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder={t("연락받을 메일 주소")} />
                )
              )}
              {method !== "email" && looksLikePhone(contact) && <p role="alert" className="text-[13px] text-warn">{t("전화번호는 받지 않아요. SNS 아이디를 적어 주세요.")}</p>}
              <p data-block-id="C375" data-block-name="비밀 보장" className="rounded-xl bg-mindSoft px-4 py-2.5 text-[14px] font-semibold text-mindInk">{t(PRIVACY_TEXT)}</p>
            </div>
            <label className="block text-[15px] font-semibold text-ink">
              {t("남기고 싶은 말 (선택)")}
              <textarea data-block-id="F371" className={`${field} mt-1 min-h-[88px]`} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("상담 전에 알려 주고 싶은 것이 있으면 적어 주세요.")} />
            </label>
            <label data-block-id="C373" data-block-name="민감정보 동의" className="flex items-start gap-2.5 rounded-xl bg-bg px-4 py-3 text-[13px] leading-relaxed text-sub">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                <b className="text-ink">{t("[필수] 민감정보 수집·이용 동의")}</b><br />
                {t("상담 예약을 위해 상담 유형, 스트레스 지수·단계, 희망 시간, 연락 방법·SNS 아이디, 남긴 말을 수집해요. 질문에 답한 내용 자체는 저장하지 않아요. 상담 시간이 지나고 180일 뒤 지워지며, 동의하지 않으면 예약할 수 없어요.")}
              </span>
            </label>
            {err && <p role="alert" className="rounded-xl bg-warnSoft px-4 py-3 text-[14px] text-warn">{err}</p>}
            <button type="button" data-block-id="B374" data-block-name="상담 예약 확정" className={btnMind} disabled={busy || slot == null || !consent || (method !== "email" && (!contact.trim() || looksLikePhone(contact))) || (method === "email" && !info?.loggedIn && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim()))} onClick={book}>
              {busy ? t("처리 중…") : slot != null ? `${slotLabel(slot)} ${t("예약하기")}` : t("시간을 골라 주세요")}
            </button>
            <button type="button" className="min-h-0 text-[14px] text-sub underline" onClick={() => setStep("result")}>{t("이전")}</button>
          </>
        )}

        {step === "done" && (
          <>
            <div className="space-y-2 py-2 text-center">
              <p className="text-[18px] font-bold text-ink">{t("예약이 접수됐어요")}</p>
              {booked != null && <p className="text-[16px] font-semibold text-mindInk">{slotLabel(booked)}</p>}
              <p className="text-[14px] leading-relaxed text-sub">{info?.loggedIn ? t("담당자가 확인한 뒤 남겨 주신 연락처로 연락드릴게요. 접수 확인 메일도 보내 드렸어요. 예약은 내 정보 › 설정 › 마음 상담에서 확인하거나 취소할 수 있어요.") : t("담당자가 확인한 뒤 남겨 주신 연락처로 연락드릴게요. 회원가입 없이 예약됐어요.")}</p>
              <p className="text-[15px] font-semibold text-mindInk">{t(CARE_TEXT)}</p>
            </div>
            <button type="button" className={btnMind} onClick={onClose}>{t("확인")}</button>
          </>
        )}
      </div>
    </Sheet>
  );
}
