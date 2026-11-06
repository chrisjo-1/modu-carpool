"use client";
import { useEffect, useState } from "react";
import type { Post } from "@/lib/types";
import { Avatar, Sheet, api, btnGhost, useLang, useT, when } from "./ui";

type Item = {
  postId: string; code: string; photo: string; role: "driver" | "rider"; regular: boolean;
  origin: string; dest: string; oArea: string; dArea: string; departAt: number; days: string; timeGo: string;
  chance: number; homeKm: number; workKm: number; onRoute: boolean; timeDiff: number | null;
};
type Data = { locked: boolean; cost: number; count: number; needDest: boolean; items?: Item[] };

const DAY = ["일", "월", "화", "수", "목", "금", "토"];
const daysText = (d: string) => d.split("").map((x) => DAY[Number(x)] ?? "").join("");

/**
 * 내 글 상세의 [매칭 가능성 있는 회원 보기](2026-11-06 사용자 지시). 지금은 무료, 나중에 크레딧(관리자 설정).
 * 공개된 글만 보여 주고, 누르면 그 글을 연다.
 */
export function MatchButton({ post, toast }: { post: Post; toast: (m: string) => void }) {
  const t = useT();
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    api<Data>(`/api/matches?post=${post.id}`).then((r) => { if (alive && r.ok) setD(r.data); });
    return () => { alive = false; };
  }, [post.id]);
  if (!d || d.needDest) return null;
  return (
    <>
      <button type="button" data-block-id="B494" data-block-name="매칭 가능성 있는 회원 보기" disabled={d.count === 0}
        onClick={async () => {
          if (d.locked) {
            const r = await api("/api/matches", "POST", { post: post.id });
            if (!r.ok) return toast(t(r.error));
            const again = await api<Data>(`/api/matches?post=${post.id}`);
            if (again.ok) setD(again.data);
          }
          setOpen(true);
        }}
        className={`${d.count ? "min-h-[48px] w-full rounded-2xl bg-brand px-4 font-semibold text-white" : btnGhost} py-3 text-[15px] disabled:opacity-60`}>
        {d.count ? `${t("매칭 가능성 있는 회원 보기")} · ${d.count}${t("명")}${d.locked && d.cost ? ` (${d.cost.toLocaleString("ko-KR")} ${t("크레딧")})` : ""}` : t("아직 같은 길 회원이 없어요 · 새로 올라오면 알려 드려요")}
      </button>
      {open && d.items && <MatchSheet items={d.items} onClose={() => setOpen(false)} />}
    </>
  );
}

function MatchSheet({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  return (
    <Sheet title={t("매칭 가능성 있는 회원")} onClose={onClose} blockId="S435">
      <div className="space-y-3">
        <p className="text-[13px] text-sub">{t("출발지·도착지 거리와 가는 길이 겹치는 정도로 계산했어요(시간은 따로 표시). 누르면 그 글을 볼 수 있어요.")}</p>
        <ul data-block-id="C438" data-block-name="매칭 회원 목록" className="space-y-2">
          {items.map((m) => (
            <li key={m.postId}>
              <button type="button" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("modu:open-post", { detail: m.postId })); }} className="flex w-full items-start gap-3 rounded-2xl border border-line bg-white p-3 text-left active:bg-bg">
                <Avatar src={m.photo} name={m.code} role={m.role} size={40} />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold">{m.code}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${m.role === "driver" ? "bg-accentSoft text-accent" : "bg-mintSoft text-mint"}`}>{t(m.role === "driver" ? "운전자" : "탑승자")}</span>
                    {m.onRoute && <span className="rounded-full bg-bg px-2 py-0.5 text-[12px] text-sub">{t("가는 길 위")}</span>}
                  </span>
                  <span className="block truncate text-[14px] text-ink">{m.origin} → {m.dest}</span>
                  <span className="block text-[12px] text-sub">
                    {m.regular ? `${t("정기")} ${daysText(m.days)} ${m.timeGo}` : when(m.departAt, lang)}
                    {m.timeDiff != null && ` · ${m.timeDiff <= 30 ? t("시간 맞음") : `${t("시간")} ${m.timeDiff}${t("분 차")}`}`}
                    {` · ${t("출발")} ${m.homeKm}km · ${t("도착")} ${m.workKm}km`}
                  </span>
                </span>
                <span className="num shrink-0 text-right"><span className="block text-[20px] font-bold text-ink">{m.chance}%</span><span className="block text-[11px] text-sub">{t("매칭")}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
