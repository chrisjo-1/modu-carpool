"use client";
import { useState } from "react";
import type { Post } from "@/lib/types";
import { Avatar, Sheet, api, useAdminMember, useLang, when } from "./ui";

type Contact = { phone: string; state: string; lastSeen: string | null; push: number; invitedAt: string | null; warpId: string };
type Owner = Contact & { userId: string; code: string; name: string; role: string; photo: string; warpPost: boolean };
type Item = Contact & {
  postId: string; userId: string; code: string; warp: boolean; photo: string; role: "driver" | "rider"; regular: boolean;
  origin: string; dest: string; days: string; timeGo: string; departAt: number; chance: number; timeFit: boolean; onRoute: boolean;
  homeKm: number; workKm: number;
};
type Data = { needDest: boolean; owner: Owner; items: Item[] };

const DAY = ["일", "월", "화", "수", "목", "금", "토"];
const daysText = (d: string) => d.split("").map((x) => DAY[Number(x)] ?? "").join("");
const dash = (p: string) => (p.length === 11 ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}` : p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p);
const ago = (s: string | null) => {
  if (!s) return "접속 없음";
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  return d <= 0 ? "오늘 접속" : `${d}일 전 접속`;
};
const shortDay = (s: string) => new Date(s).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
/** 정보통신망법: 밤 9시~아침 8시에는 광고성 문자를 보내지 않는다(정보성이어도 피함) */
const quiet = () => {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hour12: false }));
  return h >= 21 || h < 8;
};

/**
 * 앱 안 관리자 기능(2026-11-23 사용자 지시): 관리자 메일로 로그인하면 모든 글 상세에 [관리자 · 같은 길 회원·연락처] 버튼.
 * 글쓴이와 매칭 회원(앱 글·워프 정기카풀)의 전화번호·가입 상태를 보고, [문자]로 회원별 링크가 담긴 안내 문자를 휴대폰 문자 앱에 채워 연다.
 */
export function AdminMatchButton({ post, toast }: { post: Post; toast: (m: string) => void }) {
  const admin = useAdminMember();
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!admin) return null;
  const load = async () => {
    setBusy(true);
    const r = await api<Data>(`/api/admin/match-contacts?post=${post.id}`);
    setBusy(false);
    if (!r.ok) return toast(r.error);
    setD(r.data);
    setOpen(true);
  };
  return (
    <>
      <button type="button" data-block-id="B518" data-block-name="관리자 같은 길 회원·연락처" disabled={busy} onClick={load}
        className="min-h-[44px] w-full rounded-2xl border border-dashed border-brand bg-white px-4 py-2.5 text-[14px] font-semibold text-brand disabled:opacity-60">
        {busy ? "불러오는 중…" : "관리자 · 같은 길 회원·연락처 보기"}
      </button>
      {open && d && <AdminMatchSheet post={post} d={d} toast={toast} onClose={() => setOpen(false)} />}
    </>
  );
}

function AdminMatchSheet({ post, d, toast, onClose }: { post: Post; d: Data; toast: (m: string) => void; onClose: () => void }) {
  const lang = useLang();
  const [sent, setSent] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<{ key: string; phone: string; text: string } | null>(null);

  const invite = async (key: string, who: "owner" | "match", target: { userId: string; warpId: string; phone: string; chance?: number }) => {
    if (!target.phone) return toast("전화번호가 없어요.");
    const r = await api<{ link: string; text: string }>("/api/admin/match-contacts", "POST", {
      post: post.id, who, userId: target.userId, warpId: target.warpId, chance: target.chance, count: d.items.length,
    });
    if (!r.ok) return toast(r.error);
    setSent((s) => ({ ...s, [key]: "방금" }));
    setDraft({ key, phone: target.phone, text: r.data.text });
  };

  const smsHref = (phone: string, text: string) => {
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    return `sms:${phone}${ios ? "&" : "?"}body=${encodeURIComponent(text)}`;
  };

  const Row = ({ k, who, photo, title, role, sub, c, chance, userId }: { k: string; who: "owner" | "match"; photo: string; title: string; role: string; sub: React.ReactNode; c: Contact; chance?: number; userId: string }) => (
    <li className="space-y-2 rounded-2xl border border-line bg-white p-3">
      <div className="flex items-start gap-3">
        <Avatar src={photo} name={title} role={role === "driver" ? "driver" : "rider"} size={40} />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <b>{title}</b>
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${role === "driver" ? "bg-accentSoft text-accent" : "bg-mintSoft text-mint"}`}>{role === "driver" ? "운전자" : "탑승자"}</span>
            <span className={`rounded-full px-2 py-0.5 text-[12px] ${c.state === "가입 완료" ? "bg-mintSoft text-mint" : "bg-warnSoft text-warn"}`}>{c.state}</span>
          </span>
          <span className="block text-[13px] text-sub">{sub}</span>
          <span className="block text-[12px] text-sub">
            {ago(c.lastSeen)} · 알림 기기 {c.push}{c.warpId ? ` · 워프 ${c.warpId}` : ""}
            {sent[k] ? " · 문자 링크 방금 만듦" : c.invitedAt ? ` · 지난 문자 ${shortDay(c.invitedAt)}` : ""}
          </span>
        </span>
        {chance != null && <span className="num shrink-0 text-right"><span className="block text-[18px] font-bold">{chance}%</span><span className="block text-[11px] text-sub">매칭</span></span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {c.phone ? (
          <>
            <a href={`tel:${c.phone}`} className="rounded-lg border border-line bg-white px-3 py-1.5 text-[14px] font-semibold tabular-nums">{dash(c.phone)}</a>
            <button type="button" data-block-id="B519" onClick={() => invite(k, who, { userId, warpId: c.warpId, phone: c.phone, chance })}
              className="rounded-lg bg-brand px-3 py-1.5 text-[14px] font-semibold text-white">문자 보내기</button>
          </>
        ) : (
          <span className="text-[13px] text-sub">전화번호 없음{userId ? " · 앱 알림·채팅으로만 연락" : ""}</span>
        )}
      </div>
      {draft?.key === k && (
        <div data-block-id="C456" className="space-y-2 rounded-xl bg-bg p-3">
          <textarea className="h-32 w-full rounded-lg border border-line bg-white p-2 text-[14px]" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          {quiet() && <p className="text-[12px] font-semibold text-warn">지금은 밤 9시~아침 8시예요. 문자는 아침 8시 뒤에 보내 주세요.</p>}
          <div className="flex flex-wrap gap-2">
            <a href={smsHref(draft.phone, draft.text)} className="rounded-lg bg-brand px-3 py-1.5 text-[14px] font-semibold text-white">문자 앱 열기</a>
            <button type="button" className="rounded-lg border border-line bg-white px-3 py-1.5 text-[14px]"
              onClick={() => navigator.clipboard?.writeText(draft.text).then(() => toast("문구를 복사했어요."), () => toast("복사하지 못했어요."))}>문구 복사</button>
          </div>
          <p className="text-[12px] text-sub">링크는 14일 동안 쓸 수 있어요. 가입을 안 마친 분은 링크로 비밀번호를 정하면 바로 이 글이 열려요.</p>
        </div>
      )}
    </li>
  );

  const o = d.owner;
  return (
    <Sheet title="관리자 · 같은 길 회원·연락처" onClose={onClose} blockId="S443">
      <div className="space-y-3">
        <p className="rounded-xl bg-warnSoft px-3 py-2 text-[12px] text-warn">관리자만 보이는 화면이에요. 전화번호 열람은 기록돼요. 문자는 안내 목적으로만, 밤 9시~아침 8시는 피해 주세요.</p>
        <p className="text-[13px] font-semibold">이 글을 올린 분</p>
        <ul><Row k="owner" who="owner" photo={o.photo} title={o.code || o.name || "글쓴이"} role={o.role} userId={o.userId} c={o}
          sub={<>{post.origin} → {post.dest}{o.warpPost ? " · 워프동기화 글" : ""}</>} /></ul>
        <p className="text-[13px] font-semibold">같은 길 회원 {d.items.length}명 <span className="font-normal text-sub">(가능성 높은 순 · 요일·시간 맞는 분 먼저)</span></p>
        {d.needDest && <p className="text-[13px] text-sub">이 글은 도착지 위치가 없어 같은 길 회원을 찾을 수 없어요.</p>}
        {!d.needDest && d.items.length === 0 && <p className="text-[13px] text-sub">아직 같은 길 회원이 없어요.</p>}
        <ul data-block-id="C457" className="space-y-2">
          {d.items.map((m, i) => (
            <Row key={m.postId || `w${i}`} k={m.postId || `w${m.warpId || i}`} who="match" photo={m.photo} title={m.warp ? `워프 회원${m.warpId ? ` ${m.warpId}` : ""}` : m.code || "회원"}
              role={m.role} userId={m.userId} c={m} chance={m.chance}
              sub={<>
                {m.origin} → {m.dest}
                <br />
                {m.regular ? `정기 ${daysText(m.days)} ${m.timeGo}` : when(m.departAt, lang)}
                {m.timeFit ? " · 요일·시간 맞음" : ""}{m.onRoute ? " · 가는 길 위" : ""} · 출발 {m.homeKm}km · 도착 {m.workKm}km
                {!m.warp && m.postId && (
                  <> · <button type="button" className="underline" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("modu:open-post", { detail: m.postId })); }}>글 보기</button></>
                )}
              </>} />
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
