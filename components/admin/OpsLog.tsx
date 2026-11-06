"use client";

import { useEffect, useState } from "react";
import { api, Card, Tag, btnPrimary, field } from "@/components/ui";

type Item = { id: number; at: number; category: string; actor: string; action: string; detail: string };
const CAT: [string, string][] = [["", "전체"], ["admin", "자동 조치"], ["memo", "메모"]];
const when = (v: number) => new Date(v).toLocaleString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 관리자 '운영 일지': 관리자가 화면에서 한 조치(자동 기록)와 직접 남긴 메모. 개발 변경 기록은 docs/CHANGELOG.md. */
export default function AdminOpsLog() {
  const [cat, setCat] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (c = cat) => {
    const r = await api<{ items: Item[] }>(`/api/admin/oplog${c ? `?cat=${c}` : ""}`);
    if (r.ok) setItems(r.data.items ?? []);
    else setMsg(r.error || "불러오지 못했어요.");
  };

  useEffect(() => {
    load(cat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const r = await api("/api/admin/oplog", "POST", { text });
    setBusy(false);
    if (!r.ok) return setMsg(r.error || "저장하지 못했어요.");
    setText("");
    setMsg("메모를 남겼어요.");
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-[18px] font-bold">운영 일지</h2>
        <p className="mt-1 text-[14px] text-sub">
          관리자가 화면에서 한 조치는 자동으로 남아요(등급 지정, 1:1 알림, 안심동행 처리). 메모도 여기에 적을 수 있어요. 개발 변경 기록은 저장소의 docs/CHANGELOG.md에 있어요.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="메모 (예: 신워프 명단 2차 업로드 완료)" className={field} />
          <button type="button" onClick={save} disabled={busy || !text.trim()} className={btnPrimary}>메모 남기기</button>
        </div>
        {msg && <p className="mt-2 text-[14px] text-sub">{msg}</p>}
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {CAT.map(([v, label]) => (
          <button key={v || "all"} type="button" onClick={() => setCat(v)} aria-pressed={cat === v}
            className={`rounded-lg border px-3 py-1.5 text-[14px] ${cat === v ? "border-ink bg-ink font-semibold text-white" : "border-line bg-white text-sub"}`}>{label}</button>
        ))}
      </div>

      <section className="space-y-2">
        {items.length === 0 && <p className="text-[14px] text-sub">기록이 없어요.</p>}
        {items.map((i) => (
          <Card key={i.id}>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-sub">
              <span>{when(i.at)}</span>
              <Tag tone={i.category === "memo" ? "plain" : "accent"}>{i.category === "memo" ? "메모" : "자동 조치"}</Tag>
              <span>{i.actor}</span>
            </div>
            <p className="mt-1 text-[15px] font-semibold">{i.action}</p>
            {i.detail && <p className="mt-0.5 whitespace-pre-wrap text-[14px] text-sub">{i.detail}</p>}
          </Card>
        ))}
      </section>
    </div>
  );
}
