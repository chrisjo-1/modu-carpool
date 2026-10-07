"use client";
import { useMemo, useState } from "react";
import { METER_URL, type Post, type Thread, type User } from "@/lib/types";
import { Card, Icon, Segment, Sheet, Tag, api, btnGhost, btnPrimary, field, useLang, useT, when } from "./ui";

type Role = "all" | "driver" | "rider";
type Kind = "all" | "commute" | "trip";

function PostTags({ post }: { post: Post }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1.5">
      <Tag tone="accent">{post.role === "driver" ? t("운전자") : t("탑승자")}</Tag>
      <Tag>{post.kind === "commute" ? t("출퇴근") : t("나들이·관광")}</Tag>
      <Tag tone={post.cost === "meter" ? "warn" : "plain"}>{post.cost === "meter" ? t("비용 나눔") : t("무료")}</Tag>
    </div>
  );
}

export function Route({ origin, dest }: { origin: string; dest: string }) {
  return (
    <div className="flex items-stretch gap-3">
      <div className="flex flex-col items-center py-1.5" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full border-2 border-accent" />
        <span className="w-px flex-1 bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
      </div>
      <div className="min-w-0 space-y-1.5 text-[17px] font-semibold leading-snug">
        <p className="truncate">{origin}</p>
        <p className="truncate">{dest}</p>
      </div>
    </div>
  );
}

export default function Home({ posts, sample, onOpen }: { posts: Post[]; sample: boolean; onOpen: (p: Post) => void }) {
  const t = useT();
  const lang = useLang();
  const [role, setRole] = useState<Role>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return posts.filter(
      (p) =>
        (role === "all" || p.role === role) &&
        (kind === "all" || p.kind === kind) &&
        (!k || `${p.origin} ${p.dest} ${p.note}`.toLowerCase().includes(k)),
    );
  }, [posts, role, kind, q]);

  return (
    <section data-block-id="S001" data-block-name="카풀 찾기" className="space-y-4">
      <header>
        <h1 data-block-id="S001-title" className="text-[28px] font-bold leading-tight">{t("같은 방향, 같이 가요")}</h1>
        <p data-block-id="S001-desc" className="mt-1 text-sub">{t("출퇴근길도 서울 나들이도, 방향이 같은 사람과 함께.")}</p>
      </header>

      <div className="space-y-2">
        <input data-block-id="F001" className={field} type="search" placeholder={t("출발지·도착지 검색")} aria-label={t("출발지·도착지 검색")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Segment label={t("종류")} value={kind} onChange={setKind} options={[["all", t("전체")], ["commute", t("출퇴근")], ["trip", t("나들이·관광")]]} />
        <Segment label={t("역할")} value={role} onChange={setRole} options={[["all", t("전체")], ["driver", t("운전자 글")], ["rider", t("탑승자 글")]]} />
      </div>

      {sample && <p className="rounded-2xl bg-accentSoft px-4 py-3 text-[14px] text-ink">{t("지금 보이는 글은 화면 확인용 예시입니다.")}</p>}

      {list.length === 0 ? (
        <Card className="px-6 py-12 text-center text-sub">{t("조건에 맞는 카풀이 아직 없어요.")}</Card>
      ) : (
        <ul className="space-y-3">
          {list.map((p) => (
            <li key={p.id}>
              <button data-block-id="C001" data-block-name="카풀 카드" onClick={() => onOpen(p)} className="block w-full text-left">
                <Card className="space-y-3 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <PostTags post={p} />
                    {p.mine && <Tag>{t("내 글")}</Tag>}
                  </div>
                  <Route origin={p.origin} dest={p.dest} />
                  <div className="flex items-center justify-between text-[14px] text-sub">
                    <span className="num">{when(p.departAt, lang)}</span>
                    <span>{p.owner} · {p.role === "driver" ? t("남은 자리") : t("인원")} {p.seats}</span>
                  </div>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PostDetail({
  post,
  user,
  sample,
  threads,
  onClose,
  onChanged,
  goLogin,
  openChat,
  toast,
}: {
  post: Post;
  user: User | null;
  sample: boolean;
  threads: Thread[];
  onClose: () => void;
  onChanged: () => void;
  goLogin: () => void;
  openChat: (th: Thread) => void;
  toast: (m: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const mineThread = threads.find((th) => th.postId === post.id && !th.iAmOwner);
  const incoming = threads.filter((th) => th.postId === post.id && th.iAmOwner);

  const run = async (url: string, method: string, data?: unknown, done?: string) => {
    setBusy(true);
    const r = await api(url, method, data);
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    if (done) toast(t(done));
    onChanged();
  };

  const share = async () => {
    const url = `${location.origin}/?p=${post.id}`;
    const text = `${post.origin} → ${post.dest} · ${when(post.departAt, lang)}`;
    try {
      if (navigator.share) await navigator.share({ title: t("모두의카풀"), text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast(t("링크를 복사했어요."));
      }
    } catch {
      /* 공유 취소 */
    }
  };

  const statusText = { pending: t("수락 대기 중"), accepted: t("수락됨"), declined: t("거절됨") };

  return (
    <Sheet title={t("카풀 상세")} blockId="S010" onClose={onClose}>
      <div className="space-y-4">
        <PostTags post={post} />
        <Route origin={post.origin} dest={post.dest} />
        <dl className="space-y-2 text-[16px]">
          <div className="flex justify-between"><dt className="text-sub">{t("출발")}</dt><dd className="num font-semibold">{when(post.departAt, lang)}</dd></div>
          <div className="flex justify-between"><dt className="text-sub">{post.role === "driver" ? t("남은 자리") : t("인원")}</dt><dd className="num font-semibold">{post.seats}</dd></div>
          <div className="flex justify-between"><dt className="text-sub">{post.role === "driver" ? t("운전자") : t("탑승자")}</dt><dd className="font-semibold">{post.owner}</dd></div>
        </dl>
        {post.originLat != null && post.originLng != null && (
          <a data-block-id="B014" data-block-name="출발 위치 지도" href={`https://map.kakao.com/link/map/${encodeURIComponent(post.origin)},${post.originLat},${post.originLng}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-2xl bg-bg px-4 text-[15px] font-semibold text-ink">
            {t("출발 위치 지도에서 보기")} {Icon.arrow()}
          </a>
        )}
        {post.ownerBio && <p className="rounded-2xl bg-bg px-4 py-3 text-[15px] text-sub">{post.ownerBio}</p>}
        {post.note && <p className="whitespace-pre-wrap text-[16px] leading-relaxed">{post.note}</p>}

        {post.cost === "meter" ? (
          <div className="space-y-2 rounded-2xl border border-[#F6D9C4] bg-warnSoft p-4 text-[14px] leading-relaxed text-[#7C2D12]">
            <p>{t("비용 나눔은 출퇴근 카풀에 한해 실비를 나누는 용도입니다. 영리 목적의 운송은 법으로 금지되어 있습니다.")}</p>
            <a data-block-id="B010" data-block-name="미터기 열기" href={METER_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl bg-white px-4 font-semibold text-ink">
              {t("모카 미터기로 비용 나누기")} {Icon.arrow()}
            </a>
          </div>
        ) : (
          <p className="rounded-2xl bg-bg px-4 py-3 text-[14px] text-sub">{t("무료 운행입니다. 금전을 요구하거나 주고받지 않습니다.")}</p>
        )}

        {post.mine ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-sub">{t("받은 신청")} {incoming.length}</h3>
            {incoming.length === 0 && <p className="text-[15px] text-sub">{t("아직 신청이 없어요.")}</p>}
            {incoming.map((th) => (
              <div key={th.id} className="space-y-2 rounded-2xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{th.other}</p>
                  <Tag tone={th.status === "accepted" ? "accent" : "plain"}>{statusText[th.status]}</Tag>
                </div>
                {th.otherBio && <p className="text-[14px] text-sub">{th.otherBio}</p>}
                {th.message && <p className="whitespace-pre-wrap text-[15px]">{th.message}</p>}
                {th.status === "pending" && (
                  <div className="flex gap-2">
                    <button disabled={busy} className={`${btnGhost} py-3 text-[15px]`} onClick={() => run("/api/requests", "PATCH", { id: th.id, status: "declined" })}>{t("거절")}</button>
                    <button data-block-id="B011" data-block-name="신청 수락" disabled={busy} className={`${btnPrimary} py-3 text-[15px]`} onClick={() => run("/api/requests", "PATCH", { id: th.id, status: "accepted" }, "수락했어요. 이제 대화할 수 있습니다.")}>{t("수락")}</button>
                  </div>
                )}
                {th.status === "accepted" && <button className={`${btnGhost} py-3 text-[15px]`} onClick={() => openChat(th)}>{t("대화하기")}</button>}
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button disabled={busy} className={`${btnGhost} py-3 text-[15px]`} onClick={() => run("/api/posts", "PATCH", { id: post.id, status: post.status === "open" ? "closed" : "open" }, post.status === "open" ? "마감했어요." : "다시 열었어요.")}>
                {post.status === "open" ? t("모집 마감") : t("다시 열기")}
              </button>
              <button
                disabled={busy}
                className={`${btnGhost} py-3 text-[15px] text-warn`}
                onClick={async () => {
                  if (!window.confirm(t("이 글을 삭제할까요?"))) return;
                  await run(`/api/posts?id=${post.id}`, "DELETE", undefined, "삭제했어요.");
                  onClose();
                }}
              >
                {t("삭제")}
              </button>
            </div>
          </div>
        ) : mineThread ? (
          <div className="space-y-2 rounded-2xl bg-accentSoft p-4">
            <p className="font-semibold">{t("내 신청")}: {statusText[mineThread.status]}</p>
            {mineThread.status === "accepted" ? (
              <button className={`${btnPrimary} py-3 text-[15px]`} onClick={() => openChat(mineThread)}>{t("대화하기")}</button>
            ) : (
              mineThread.status === "pending" && (
                <button disabled={busy} className="min-h-0 text-[15px] text-sub underline" onClick={() => run(`/api/requests?id=${mineThread.id}`, "DELETE", undefined, "신청을 취소했어요.")}>{t("신청 취소")}</button>
              )
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {user && !sample && (
              <label className="block text-sm text-sub">
                {t("한마디 (선택)")}
                <textarea data-block-id="F010" className={`${field} mt-1`} rows={2} maxLength={300} placeholder={t("간단한 소개나 타는 곳을 적어 주세요.")} value={message} onChange={(e) => setMessage(e.target.value)} />
              </label>
            )}
            <button
              data-block-id="B012"
              data-block-name="카풀 신청"
              disabled={busy}
              className={btnPrimary}
              onClick={() => {
                if (sample) return toast(t("예시 글에는 신청할 수 없어요."));
                if (!user) return goLogin();
                run("/api/requests", "POST", { postId: post.id, message }, "신청했어요. 수락되면 대화할 수 있습니다.");
              }}
            >
              {user || sample ? t("카풀 신청하기") : t("로그인하고 신청하기")}
            </button>
            <p className="text-center text-[13px] text-sub">{t("연락처는 상대가 수락한 뒤에만 서로 공개됩니다.")}</p>
          </div>
        )}

        <button data-block-id="B013" data-block-name="공유" className="w-full text-[15px] text-sub underline" onClick={share}>{t("이 카풀 공유하기")}</button>
      </div>
    </Sheet>
  );
}
