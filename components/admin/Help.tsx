"use client";
import { useCallback, useEffect, useState } from "react";
import { HELP_SECTION_LABEL, HELP_SECTIONS, HELP_TOPIC_LABEL, HELP_TOPICS, type HelpItem, type HelpSection, type HelpTopic } from "@/lib/helpTypes";

const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] outline-none focus:border-accent";
const btn = "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const ghost = "rounded-lg bg-bg px-4 py-2 text-sm text-sub";

type Draft = { id: number | null; section: HelpSection; topic: HelpTopic; title: string; body: string; image: string; sort: number; active: boolean };
const blank = (section: HelpSection, topic: HelpTopic = "app"): Draft => ({ id: null, section, topic, title: "", body: "", image: "", sort: 0, active: true });

/** 사진을 긴 변 800px의 JPEG로 줄여 data URL로 만든다(DB에 함께 저장). */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  let q = 0.82;
  let out = canvas.toDataURL("image/jpeg", q);
  while (out.length > 390_000 && q > 0.4) out = canvas.toDataURL("image/jpeg", (q -= 0.12));
  return out;
}

/** 관리자: 튜토리얼·자주 묻는 질문·의견 안내의 내용 수정, 추가, 사진 넣기, 끄기, 삭제 */
export default function AdminHelp() {
  const [items, setItems] = useState<HelpItem[]>([]);
  const [section, setSection] = useState<HelpSection>("tutorial");
  const [topicFilter, setTopicFilter] = useState<HelpTopic | "all">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/help").then((x) => x.json()).catch(() => ({ items: [] }));
    setItems(r.items ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const list = items.filter((i) => i.section === section && (section !== "faq" || topicFilter === "all" || i.topic === topicFilter));
  const post = async (payload: Record<string, unknown>, done: string) => {
    setBusy(true);
    const r = await fetch("/api/admin/help", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((x) => x.json()).catch(() => ({ error: "네트워크 오류" }));
    setBusy(false);
    if (r.error) return setMsg(r.error);
    setMsg(done);
    setDraft(null);
    load();
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file || !draft) return;
    try {
      setDraft({ ...draft, image: await shrink(file) });
      setMsg("");
    } catch {
      setMsg("사진을 읽지 못했어요. JPEG나 PNG 파일을 넣어 주세요.");
    }
  };

  return (
    <section data-block-id="S160" data-block-name="도움말 관리" className="rounded-2xl border border-line bg-white p-5 shadow-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">도움말 · 의견 안내 <span className="text-sm font-normal text-sub">내 정보의 도움말 창에 보이는 내용이에요</span></h2>
        <div className="flex gap-2">
          {HELP_SECTIONS.map((s) => (
            <button key={s} data-block-id="B160" data-block-name={`도움말 ${HELP_SECTION_LABEL[s]}`} aria-pressed={section === s} onClick={() => { setSection(s); setDraft(null); setMsg(""); }} className={`rounded-xl px-3 py-2 text-sm ${section === s ? "bg-accent font-semibold text-white" : "bg-bg text-sub"}`}>{HELP_SECTION_LABEL[s]}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button data-block-id="B161" className={btn} onClick={() => { setDraft(blank(section, topicFilter === "law" ? "law" : "app")); setMsg(""); }}>항목 추가</button>
        {section === "faq" && (
          <div className="flex gap-1" role="group" aria-label="질문 소분류">
            {(["all", ...HELP_TOPICS] as const).map((k) => (
              <button key={k} aria-pressed={topicFilter === k} onClick={() => setTopicFilter(k)} className={`rounded-full px-3 py-1.5 text-sm ${topicFilter === k ? "bg-accentSoft font-semibold text-accent" : "bg-bg text-sub"}`}>
                {k === "all" ? "전체" : HELP_TOPIC_LABEL[k]} {k === "all" ? items.filter((i) => i.section === "faq").length : items.filter((i) => i.section === "faq" && i.topic === k).length}
              </button>
            ))}
          </div>
        )}
        {msg && <span className="text-sm text-sub">{msg}</span>}
      </div>

      {draft && (
        <div data-block-id="C160" data-block-name="도움말 편집" className="space-y-3 rounded-xl bg-bg p-4">
          <p className="text-sm font-semibold">{draft.id ? "항목 수정" : "새 항목"} · {HELP_SECTION_LABEL[draft.section]}</p>
          {draft.section === "faq" && (
            <div className="flex items-center gap-2 text-sm text-sub">소분류
              {HELP_TOPICS.map((k) => (
                <button key={k} type="button" aria-pressed={draft.topic === k} onClick={() => setDraft({ ...draft, topic: k })} className={`rounded-full px-3 py-1 ${draft.topic === k ? "bg-accent font-semibold text-white" : "bg-white text-sub"}`}>{HELP_TOPIC_LABEL[k]}</button>
              ))}
            </div>
          )}
          <label className="block text-sm text-sub">{section === "faq" ? "질문" : "제목"}
            <input data-block-id="F160" className={`${input} mt-1`} maxLength={80} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="block text-sm text-sub">{section === "faq" ? "답변" : "내용"}
            <textarea data-block-id="F161" className={`${input} mt-1`} rows={5} maxLength={2000} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </label>
          <div className="space-y-2">
            <p className="text-sm text-sub">사진 (선택, 한 장)</p>
            {draft.image ? (
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.image} alt="미리보기" className="h-28 rounded-xl border border-line object-cover" />
                <button className={ghost} onClick={() => setDraft({ ...draft, image: "" })}>사진 빼기</button>
              </div>
            ) : (
              <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="사진 고르기" onChange={(e) => onPhoto(e.target.files?.[0])} className="text-sm" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-sub">순서
              <input type="number" min={0} max={999} className={`${input} w-24`} value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: Number(e.target.value) || 0 })} />
            </label>
            <label className="flex items-center gap-2 text-sm text-sub"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />회원에게 보이기</label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button data-block-id="B162" className={btn} disabled={busy || !draft.title.trim()} onClick={() => post({ action: "save", id: draft.id, section: draft.section, topic: draft.topic, title: draft.title, body: draft.body, image: draft.image, sort: draft.sort, active: draft.active }, "저장했어요.")}>저장</button>
            <button className={ghost} onClick={() => setDraft(null)}>취소</button>
            {draft.id && <button className="rounded-lg px-4 py-2 text-sm text-warn underline" disabled={busy} onClick={() => { if (window.confirm("이 항목을 삭제할까요?")) post({ action: "delete", id: draft.id }, "삭제했어요."); }}>삭제</button>}
          </div>
        </div>
      )}

      <ul className="divide-y divide-line">
        {list.length === 0 && <li className="py-4 text-sm text-sub">항목이 없어요. &apos;항목 추가&apos;를 눌러 주세요.</li>}
        {list.map((it) => (
          <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-semibold">{it.sort}. {it.title} {it.section === "faq" && <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${it.topic === "law" ? "bg-warnSoft text-warn" : "bg-bg text-sub"}`}>{HELP_TOPIC_LABEL[it.topic]}</span>} {!it.active && <span className="ml-1 rounded-full bg-bg px-2 py-0.5 text-xs text-sub">숨김</span>} {it.image && <span className="ml-1 rounded-full bg-accentSoft px-2 py-0.5 text-xs text-accent">사진</span>}</p>
              <p className="truncate text-sm text-sub">{it.body || "내용 없음"}</p>
            </div>
            <button className={ghost} onClick={() => setDraft({ id: it.id, section: it.section, topic: it.topic, title: it.title, body: it.body, image: it.image, sort: it.sort, active: it.active })}>수정</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
