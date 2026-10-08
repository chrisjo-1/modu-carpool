"use client";
import { useEffect, useState } from "react";
import { REASONS, type Member } from "@/lib/types";
import { Avatar, Sheet, Tag, api, btnGhost, btnPrimary, field, useLang, useT, when } from "./ui";

/** 별 다섯 개. onChange 가 있으면 눌러서 고를 수 있다. */
export function Stars({ value, onChange, size = 22 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  const t = useT();
  return (
    <span className="inline-flex items-center" role={onChange ? "radiogroup" : "img"} aria-label={`${t("별점")} ${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= Math.round(value);
        const star = (
          <svg width={size} height={size} viewBox="0 0 24 24" fill={on ? "#F5A623" : "none"} stroke={on ? "#F5A623" : "#C5CAD3"} strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
            <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5z" />
          </svg>
        );
        return onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}`} onClick={() => onChange(n)} className="grid min-h-0 place-items-center p-1">
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}

/** 신고·차단 사유를 고르는 창. "기타"는 내용을 직접 적어야 한다. */
export function ReasonSheet({
  mode,
  name,
  onSubmit,
  onClose,
}: {
  mode: "report" | "block";
  name: string;
  onSubmit: (reason: string, detail: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const needDetail = reason === "etc";

  return (
    <Sheet title={mode === "report" ? t("신고하기") : t("차단하기")} blockId="S080" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSubmit(reason, detail.trim());
          setBusy(false);
        }}
      >
        <div>
          <h2 className="text-xl font-bold">{name}</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-sub">
            {mode === "report" ? t("신고 내용은 운영자가 확인합니다. 상대에게는 알리지 않습니다.") : t("차단하면 서로의 글과 신청, 대화가 보이지 않게 됩니다. 사유는 운영자만 확인합니다.")}
          </p>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm text-sub">{t("사유")}</legend>
          {REASONS.map(([k, label]) => (
            <label key={k} className={`flex min-h-[48px] items-center gap-3 rounded-xl border px-4 text-[16px] ${reason === k ? "border-accent bg-accentSoft font-semibold" : "border-line bg-white"}`}>
              <input data-block-id={`F080-${k}`} type="radio" name="reason" value={k} required className="h-5 w-5 accent-[#2F6BFF]" checked={reason === k} onChange={() => setReason(k)} />
              {t(label)}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm text-sub">
          {needDetail ? t("기타 사유 (직접 입력)") : t("자세한 내용 (선택)")}
          <textarea data-block-id="F081" className={`${field} mt-1`} rows={3} maxLength={300} required={needDetail} minLength={needDetail ? 2 : undefined} placeholder={t("어떤 일이 있었는지 적어 주세요.")} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <button type="button" className={`${btnGhost} w-auto shrink-0`} onClick={onClose}>{t("취소")}</button>
          <button data-block-id="B080" data-block-name="사유 제출" className={btnPrimary} disabled={busy || !reason}>{busy ? t("처리 중…") : mode === "report" ? t("신고하기") : t("차단하기")}</button>
        </div>
      </form>
    </Sheet>
  );
}

/** 회원 프로필: 별점, 지난 카풀 목록, 신고·차단 */
export function MemberSheet({
  userId,
  onClose,
  onReport,
  onBlock,
  toast,
}: {
  userId: string;
  onClose: () => void;
  onReport: (id: string, name: string) => void;
  onBlock: (id: string, name: string) => void;
  toast: (m: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [m, setM] = useState<Member | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ member: Member }>(`/api/users?u=${userId}`).then((r) => {
      if (!alive) return;
      if (r.ok) setM(r.data.member);
      else {
        toast(t(r.error));
        onClose();
      }
    });
    return () => {
      alive = false;
    };
    // 회원이 바뀔 때만 다시 불러온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <Sheet title={t("프로필")} blockId="S081" onClose={onClose}>
      {!m ? (
        <div className="h-48 animate-pulse rounded-2xl bg-bg" aria-hidden />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar src={m.photo} name={m.name} size={72} />
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-bold">{m.name}</h2>
              <p data-block-id="C080" data-block-name="별점" className="mt-1 flex items-center gap-2 text-[15px]">
                <Stars value={m.rating.avg} size={18} />
                {m.rating.count > 0 ? (
                  <span className="num"><b>{m.rating.avg.toFixed(1)}</b> <span className="text-sub">({m.rating.count})</span></span>
                ) : (
                  <span className="text-sub">{t("아직 받은 별점이 없어요.")}</span>
                )}
              </p>
            </div>
          </div>
          {m.bio && <p className="whitespace-pre-wrap rounded-2xl bg-bg px-4 py-3 text-[15px]">{m.bio}</p>}
          {m.carPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img data-block-id="C082" data-block-name="차량 사진" src={m.carPhoto} alt={t("차량 사진")} loading="lazy" className="max-h-52 w-full rounded-2xl border border-line object-cover" />
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-sub">{t("지난 카풀")} {m.history.length}</h3>
            {m.history.length === 0 ? (
              <p className="rounded-2xl bg-bg px-4 py-6 text-center text-[15px] text-sub">{t("아직 진행한 카풀이 없어요.")}</p>
            ) : (
              <ul data-block-id="C081" data-block-name="지난 카풀" className="divide-y divide-line rounded-2xl border border-line">
                {m.history.map((h, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{h.origin} → {h.dest}</p>
                      <p className="num text-[13px] text-sub">{h.regular ? t("정기카풀") : when(h.at, lang)}</p>
                    </div>
                    <Tag>{h.role === "driver" ? t("운전자") : t("탑승자")}</Tag>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!m.me && (
            <div className="flex gap-2">
              <button data-block-id="B081" data-block-name="신고하기" className={`${btnGhost} py-3 text-[15px]`} onClick={() => onReport(m.id, m.name)}>{t("신고하기")}</button>
              {!m.blockedByMe && <button data-block-id="B082" data-block-name="차단하기" className={`${btnGhost} py-3 text-[15px] text-warn`} onClick={() => onBlock(m.id, m.name)}>{t("차단하기")}</button>}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
