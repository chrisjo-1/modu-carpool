"use client";
import { useEffect, useState } from "react";
import type { HelpItem, HelpSection } from "@/lib/helpTypes";
import { Card, Segment, Sheet, api, btnPrimary, useT } from "./ui";

/** 도움말 창: 위의 버튼(처음 쓰는 순서 / 자주 묻는 질문 / 의견 보내기)으로 한 가지씩 보여 준다. 내용은 관리자 화면에서 고친다. */
export function HelpSheet({ onClose, onOpenFeedback }: { onClose: () => void; onOpenFeedback: () => void }) {
  const t = useT();
  const [items, setItems] = useState<HelpItem[] | null>(null);
  const [tab, setTab] = useState<HelpSection>("tutorial");

  useEffect(() => {
    api<{ items: HelpItem[] }>("/api/help").then((r) => setItems(r.ok ? r.data.items : []));
  }, []);

  const shown = (items ?? []).filter((i) => i.section === tab);

  return (
    <Sheet title={t("도움말 · 튜토리얼")} blockId="S150" onClose={onClose}>
      <div className="space-y-4">
        <Segment<HelpSection>
          label={t("도움말 종류")}
          value={tab}
          onChange={setTab}
          options={[["tutorial", t("처음 쓰는 순서")], ["faq", t("자주 묻는 질문")], ["feedback", t("의견 보내기")]]}
        />
        {items === null && <div className="h-28 animate-pulse rounded-2xl bg-bg" aria-hidden />}

        {items !== null && tab === "tutorial" && (
          <section data-block-id="C070" data-block-name="튜토리얼" className="space-y-3">
            {shown.map((s) => (
              <Card key={s.id} className="space-y-2 p-4">
                <p className="font-semibold">{s.title}</p>
                {s.image && <img src={s.image} alt="" loading="lazy" className="w-full rounded-xl border border-line object-cover" />}
                {s.body && <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-sub">{s.body}</p>}
              </Card>
            ))}
          </section>
        )}

        {items !== null && tab === "faq" && (
          <section data-block-id="C071" data-block-name="자주 묻는 질문" className="space-y-3">
            {shown.map((f) => (
              <details key={f.id} className="rounded-2xl bg-white p-4 shadow-card">
                <summary className="cursor-pointer font-semibold">{f.title}</summary>
                {f.image && <img src={f.image} alt="" loading="lazy" className="mt-2 w-full rounded-xl border border-line object-cover" />}
                {f.body && <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-sub">{f.body}</p>}
              </details>
            ))}
          </section>
        )}

        {items !== null && tab === "feedback" && (
          <section data-block-id="C072" data-block-name="의견 안내" className="space-y-3">
            {shown.map((s) => (
              <Card key={s.id} className="space-y-2 p-4">
                <p className="font-semibold">{s.title}</p>
                {s.image && <img src={s.image} alt="" loading="lazy" className="w-full rounded-xl border border-line object-cover" />}
                {s.body && <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-sub">{s.body}</p>}
              </Card>
            ))}
            <button type="button" data-block-id="B064" data-block-name="의견 보내기 열기" className={btnPrimary} onClick={onOpenFeedback}>{t("의견 보내기")}</button>
          </section>
        )}
      </div>
    </Sheet>
  );
}
