"use client";
import { useEffect, useState } from "react";
import { api, useT } from "./ui";

type Banner = { kind: "image" | "video"; title: string; desc?: string; image?: string; link?: string; video?: string; ad: boolean };

/**
 * 채팅 목록 아래 한 칸(관리자 > 사이트 '채팅 배너').
 * 사진·영상은 선택이고, 제목·설명(설명은 두 줄까지)을 그 아래에 보여 준다. 셋 다 없으면 아무것도 그리지 않는다.
 */
export default function ChatBanner() {
  const t = useT();
  const [b, setB] = useState<Banner | null>(null);

  useEffect(() => {
    api<{ banner: Banner | null }>("/api/chat-banner").then((r) => {
      if (r.ok && r.data.banner) setB(r.data.banner);
    });
  }, []);

  if (!b) return null;
  const hasText = !!(b.title || b.desc);
  const isVideo = b.kind === "video" && !!b.video;
  if (!isVideo && !b.image && !hasText) return null;

  const external = /^https?:\/\//i.test(b.link ?? "");
  const media = isVideo ? (
    <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl bg-ink">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${b.video}?rel=0&playsinline=1`}
        title={b.title || t("채팅 배너 영상")}
        loading="lazy"
        allow="encrypted-media; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  ) : b.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.image} alt={b.title || t("채팅 배너")} loading="lazy" className="block h-auto w-full max-w-full rounded-t-2xl" />
  ) : null;

  const body = (
    <>
      {media}
      {hasText && (
        <div className="space-y-1 px-4 py-3">
          {b.title && <p className="text-[16px] font-bold leading-snug text-ink">{b.title}</p>}
          {b.desc && (
            <p className="text-[14px] leading-relaxed text-sub" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {b.desc}
            </p>
          )}
        </div>
      )}
    </>
  );

  return (
    <div data-block-id="C470" data-block-name="채팅 배너" className="space-y-1">
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        {b.link ? (
          <a href={b.link} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="block">
            {body}
          </a>
        ) : body}
      </div>
      {b.ad && <p className="px-1 text-right text-[11px] text-sub">{t("광고")}</p>}
    </div>
  );
}
