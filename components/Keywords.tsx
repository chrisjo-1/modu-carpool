"use client";
import { useEffect, useState } from "react";
import { api, useT } from "./ui";

type Keyword = { id: string; label: string };
type Keywords = { gift: Keyword[]; driver: Keyword[]; rider: Keyword[] };
let cache: Keywords | null = null;

export function useKeywords() {
  const [kw, setKw] = useState<Keywords | null>(cache);
  useEffect(() => {
    if (cache) return;
    api<{ keywords: Keywords }>("/api/keywords").then((r) => {
      if (r.ok) {
        cache = r.data.keywords;
        setKw(cache);
      }
    });
  }, []);
  return kw;
}

/** 글쓰기: 역할에 맞는 내용 키워드 + 무료 운행이면 감사 표시 키워드 */
export function TagPicker({ role, cost, value, onChange }: { role: "driver" | "rider"; cost: string; value: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  const kw = useKeywords();
  // 역할이나 비용이 바뀌어 더 이상 고를 수 없는 키워드는 뺀다.
  useEffect(() => {
    if (!kw) return;
    const ok = new Set([...(role === "rider" ? kw.rider : kw.driver).map((k) => k.id), ...(cost === "free" ? kw.gift.map((k) => k.id) : [])]);
    const next = value.filter((v) => ok.has(v));
    if (next.length !== value.length) onChange(next);
  }, [kw, role, cost, value, onChange]);
  if (!kw) return null;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : value.length >= 8 ? value : [...value, id]);
  const group = (title: string, list: Keyword[], block: string) =>
    list.length > 0 && (
      <div data-block-id={block} data-block-name={title}>
        <p className="mb-1.5 text-sm text-sub">{title}</p>
        <div className="flex flex-wrap gap-2">
          {list.map((k) => {
            const on = value.includes(k.id);
            return (
              <button key={k.id} type="button" aria-pressed={on} onClick={() => toggle(k.id)} className={`min-h-0 rounded-full border px-3.5 py-1.5 text-[14px] ${on ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line bg-white text-sub"}`}>
                {on ? "✓ " : ""}{t(k.label)}
              </button>
            );
          })}
        </div>
      </div>
    );
  return (
    <div className="space-y-3">
      {group(role === "rider" ? t("탑승자 키워드") : t("운전자 키워드"), role === "rider" ? kw.rider : kw.driver, "F060")}
      {cost === "free" && group(t("무료 운행 감사 표시"), kw.gift, "F061")}
    </div>
  );
}
