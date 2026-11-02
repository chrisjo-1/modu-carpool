"use client";
import { useEffect, useState } from "react";
import { api, useT } from "./ui";

type Banner = { kind: "image" | "video"; title: string; image?: string; link?: string; video?: string; ad: boolean };

/** 채팅 목록 아래 이미지 배너(관리자 > 사이트 '채팅 배너'). 이미지가 없으면 아무것도 그리지 않는다. */
export default function ChatBanner() {
  const t = useT();
  const [b, setB] = useState<Banner | null>(null);

  useEffect(() => {
    api<{ banner: Banner | null }>("/api/chat-banner").then((r) => {
      if (r.ok && r.data.banner) setB(r.data.banner);
    });
  }, []);

  if (!b) return null;
  if (b.kind === "video" && b.video) {
    return (
      <div data-block-id="C470" data-block-name="채팅 배너 영상" className="space-y-1">
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-ink">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${b.video}?rel=0&playsinline=1`}
            title={b.title || t("채팅 배너 영상")}
            loading="lazy"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
        {b.ad && <p className="px-1 text-right text-[11px] text-sub">{t("광고")}</p>}
      </div>
    );
  }
  if (!b.image) return null;
  const external = /^https?:\/\//i.test(b.link ?? "");
  const img = <img src={b.image} alt={b.title || t("채팅 배너")} loading="lazy" className="block h-auto w-full max-w-full rounded-2xl" />;
  return (
    <div data-block-id="C470" data-block-name="채팅 배너" className="space-y-1">
      {b.link ? (
        <a href={b.link} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="block">
          {img}
        </a>
      ) : img}
      {b.ad && <p className="px-1 text-right text-[11px] text-sub">{t("광고")}</p>}
    </div>
  );
}
