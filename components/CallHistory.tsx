"use client";
import { useEffect, useState } from "react";
import { Card, Icon, useT } from "./ui";

type Row = { id: string; created_at: string; radius_km: number; origin: string | null; dest: string | null; recipients: number; accepts: number };

const when = (s: string) => new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 내 정보: 내가 보낸 CALL 이력. 알림·수락 인원만 보여 준다(다른 회원 정보는 없음). */
export default function MyCallHistory() {
  const t = useT();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/call/history")
      .then((r) => r.json())
      .then((j) => setRows(j.calls ?? []))
      .catch(() => setRows([]));
  }, []);

  const count = rows?.length ?? 0;
  return (
    <div>
      <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("내 CALL 이력")}</h2>
      <Card data-block-id="C098" data-block-name="내 CALL 이력" className="space-y-2 p-4">
        {rows === null ? (
          <p className="text-[15px] text-sub">{t("불러오는 중…")}</p>
        ) : count === 0 ? (
          <p className="text-[15px] text-sub">{t("아직 보낸 CALL이 없어요.")}</p>
        ) : (
          <>
            <button type="button" data-block-id="B313" data-block-name="CALL 이력 펼치기" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-[15px]">
              <span>{open ? t("내역 접기") : t("내역 보기")} <span className="num text-sub">({count.toLocaleString("ko-KR")})</span></span>
              <span className={`text-sub transition-transform ${open ? "rotate-90" : ""}`}>{Icon.arrow()}</span>
            </button>
            {open && (
              <ul className="divide-y divide-line">
                {rows.map((r) => (
                  <li key={r.id} className="space-y-0.5 py-3">
                    <p className="text-[15px] font-semibold">{r.origin && r.dest ? `${r.origin} → ${r.dest}` : t("삭제된 글")}</p>
                    <p className="num text-[13px] text-sub">
                      {when(r.created_at)} · {t("반경")} {r.radius_km}km · {t("알림")} {r.recipients.toLocaleString("ko-KR")}명 · {t("수락")} {r.accepts.toLocaleString("ko-KR")}명
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
