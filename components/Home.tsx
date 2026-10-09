"use client";
import FareCard from "./Fare";
import { HIDDEN_TEXT } from "./Me";
import { useMemo, useState } from "react";
import { METER_URL, type Post, type Thread, type User } from "@/lib/types";
import { Avatar, Card, Icon, Segment, Sheet, Tag, api, btnGhost, btnPrimary, distanceKm, field, kmText, money, scheduleText, useLang, useT, when } from "./ui";

type Role = "all" | "driver" | "rider";
type Kind = "all" | "commute" | "trip";

/** 글 키워드 칩. 카드에서는 앞의 몇 개만 */
export function KeywordChips({ post, max }: { post: Post; max?: number }) {
  const t = useT();
  const list = post.tags ?? [];
  if (!list.length) return null;
  const shown = max ? list.slice(0, max) : list;
  return (
    <div data-block-id="C015" data-block-name="키워드" className="flex flex-wrap gap-1.5">
      {shown.map((k) => (
        <span key={k.label} className={`rounded-full px-2.5 py-0.5 text-[12px] ${k.group === "gift" ? "bg-[#FFF7E6] text-[#9A5B00]" : "bg-bg text-sub"}`}>
          {k.group === "gift" ? `${t("감사")} · ` : "#"}{t(k.label)}
        </span>
      ))}
      {max && list.length > max && <span className="px-1 text-[12px] text-sub">+{list.length - max}</span>}
    </div>
  );
}

function PostTags({ post }: { post: Post }) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="flex flex-wrap gap-1.5">
      {post.regular && <Tag tone="accent">{t("정기카풀")}</Tag>}
      <Tag tone={post.regular ? "plain" : "accent"}>{post.role === "driver" ? t("운전자") : t("탑승자")}</Tag>
      {!post.regular && <Tag>{post.kind === "commute" ? t("출퇴근") : t("나들이·관광")}</Tag>}
      <Tag tone={post.cost === "free" ? "plain" : "warn"}>{post.cost === "fixed" ? money(post.price ?? 0, lang) : post.cost === "meter" ? t("비용 나눔") : t("무료")}</Tag>
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

export default function Home({ posts, sample, onOpen, toast }: { posts: Post[]; sample: boolean; onOpen: (p: Post) => void; toast: (m: string) => void }) {
  const t = useT();
  const lang = useLang();
  const [role, setRole] = useState<Role>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [q, setQ] = useState("");
  const [regularOnly, setRegularOnly] = useState(false);
  // 정렬: 출발 임박순(기본) · 최신순 · 가까운 순(내 위치 필요)
  const [sort, setSort] = useState<"soon" | "new" | "near">("soon");
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const pickSort = (s: "soon" | "new" | "near") => {
    if (s !== "near") {
      setSort(s);
      return;
    }
    if (here) return setSort("near");
    toggleNear();
  };
  const toggleNear = () => {
    if (!("geolocation" in navigator)) return toast(t("이 기기는 위치 확인을 지원하지 않아요."));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSort("near");
      },
      (err) => {
        setLocating(false);
        toast(t(err.code === err.PERMISSION_DENIED ? "위치 권한을 허용해 주세요." : "현재 위치를 찾지 못했어요."));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };
  /** 내 위치에서 글의 출발지까지 거리(km). 위치가 없는 글은 null. */
  const far = (p: Post) => (here && p.originLat != null && p.originLng != null ? distanceKm(here.lat, here.lng, p.originLat, p.originLng) : null);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    const hit = posts.filter(
      (p) =>
        (role === "all" || p.role === role) &&
        (kind === "all" || p.kind === kind) &&
        (!regularOnly || !!p.regular) &&
        // "정기카풀"이라고 검색해도 정기카풀 글이 나오게 한다.
        (!k || `${p.origin} ${p.dest} ${p.note} ${p.regular ? `정기카풀 ${t("정기카풀")}` : ""}`.toLowerCase().includes(k)),
    );
    // 종료된 글은 어떤 정렬에서도 맨 아래에 둔다.
    const live = hit.filter((p) => !p.ended);
    const done = hit.filter((p) => p.ended);
    if (sort === "new") live.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    // 가까운 순: 출발 위치가 저장된 글을 거리순으로, 위치가 없는 글은 뒤에 둔다.
    else if (sort === "near" && here) live.sort((a, b) => (far(a) ?? Infinity) - (far(b) ?? Infinity));
    return [...live, ...done];
    // 검색어·필터가 바뀔 때만 다시 계산한다(t는 언어가 바뀌면 달라진다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, role, kind, q, regularOnly, lang, here, sort]);

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
        <button type="button" data-block-id="B002" data-block-name="정기카풀 필터" role="switch" aria-checked={regularOnly} onClick={() => setRegularOnly((v) => !v)} className={`rounded-full border px-4 text-[14px] ${regularOnly ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line bg-white text-sub"}`}>
          {t("정기카풀만 보기")}
        </button>
        <div data-block-id="B003" data-block-name="정렬" role="radiogroup" aria-label={t("정렬")} className="mt-1 flex gap-1.5">
          {([["soon", t("출발 임박순")], ["new", t("최신순")], ["near", locating ? t("위치를 찾는 중…") : t("가까운 순")]] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={sort === k} disabled={k === "near" && locating} onClick={() => pickSort(k)} className={`min-h-0 rounded-full border px-3.5 py-1.5 text-[14px] ${sort === k ? "border-accent bg-accentSoft font-semibold text-accent" : "border-line bg-white text-sub"}`}>
              {label}
            </button>
          ))}
        </div>
        {sort === "near" && here && <p className="text-[13px] text-sub">{t("내 위치에서 출발지가 가까운 순서입니다. 출발 위치가 없는 글은 아래에 나옵니다.")}</p>}
      </div>

      {sample && <p className="rounded-2xl bg-accentSoft px-4 py-3 text-[14px] text-ink">{t("지금 보이는 글은 화면 확인용 예시입니다.")}</p>}

      {list.length === 0 ? (
        <Card className="px-6 py-12 text-center text-sub">{t("조건에 맞는 카풀이 아직 없어요.")}</Card>
      ) : (
        <ul className="space-y-3">
          {list.map((p) => (
            <li key={p.id}>
              <button data-block-id="C001" data-block-name="카풀 카드" onClick={() => onOpen(p)} className={`block w-full text-left ${p.ended ? "opacity-60" : ""}`}>
                <Card className="space-y-3 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <PostTags post={p} />
                    <span className="flex shrink-0 gap-1.5">{p.ended && <Tag>{t("종료")}</Tag>}{!p.ended && p.status === "progress" && <Tag tone="accent">{t("카풀 진행 중")}</Tag>}{p.mine && <Tag>{t("내 글")}</Tag>}</span>
                  </div>
                  <Route origin={p.origin} dest={p.dest} />
                  <KeywordChips post={p} max={4} />
                  <div className="flex items-center justify-between text-[14px] text-sub">
                    <span className="num">{scheduleText(p, lang)}{far(p) != null && <b className="ml-1.5 font-semibold text-accent">· {kmText(far(p) as number)}</b>}</span>
                    <span className="flex items-center gap-1.5"><Avatar src={p.ownerPhoto} name={p.owner} size={24} />{p.owner} · {p.role === "driver" ? t("남은 자리") : t("인원")} {p.seats}</span>
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
  onEditCommute,
  onEdit,
  onProfile,
  onBlock,
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
  onEditCommute: (p: Post) => void;
  onEdit: (p: Post) => void;
  /** 회원 프로필 열기, 사유를 받아 차단하기 */
  onProfile: (id: string) => void;
  onBlock: (id: string, name: string) => void;
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
    const text = `${post.origin} → ${post.dest} · ${scheduleText(post, lang)}`;
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
        <KeywordChips post={post} />
        <dl className="space-y-2 text-[16px]">
          {post.regular && <div className="flex justify-between"><dt className="text-sub">{t("일정")}</dt><dd className="num font-semibold">{scheduleText(post, lang)}</dd></div>}
          <div className="flex justify-between"><dt className="text-sub">{t("출발")}</dt><dd className="num font-semibold">{when(post.departAt, lang)}</dd></div>
          {post.cost === "fixed" && <div className="flex justify-between"><dt className="text-sub">{t("1인 금액")}</dt><dd className="num font-semibold text-warn">{money(post.price ?? 0, lang)}</dd></div>}
          <div className="flex justify-between"><dt className="text-sub">{post.role === "driver" ? t("남은 자리") : t("인원")}</dt><dd className="num font-semibold">{post.seats}</dd></div>
          <div className="flex justify-between"><dt className="text-sub">{post.role === "driver" ? t("운전자") : t("탑승자")}</dt><dd>{user && !sample && post.ownerId ? <button data-block-id="B017" data-block-name="작성자 프로필" className="flex min-h-0 items-center gap-2 font-semibold underline decoration-line underline-offset-4" onClick={() => onProfile(post.ownerId as string)}><Avatar src={post.ownerPhoto} name={post.owner} size={28} />{post.owner}</button> : <span className="flex items-center gap-2 font-semibold"><Avatar src={post.ownerPhoto} name={post.owner} size={28} />{post.owner}</span>}</dd></div>
        </dl>
        {post.originLat != null && post.originLng != null && (
          <a data-block-id="B014" data-block-name="출발 위치 지도" href={`https://map.kakao.com/link/map/${encodeURIComponent(post.origin)},${post.originLat},${post.originLng}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-2xl bg-bg px-4 text-[15px] font-semibold text-ink">
            {t("출발 위치 지도에서 보기")} {Icon.arrow()}
          </a>
        )}
        <FareCard post={post} />
        {post.carPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img data-block-id="C012" data-block-name="차량 사진" src={post.carPhoto} alt={t("운전자 차량 사진")} loading="lazy" className="max-h-56 w-full rounded-2xl border border-line object-cover" />
        )}
        {post.ownerBio && <p className="rounded-2xl bg-bg px-4 py-3 text-[15px] text-sub">{post.ownerBio}</p>}
        {post.note && <p className="whitespace-pre-wrap text-[16px] leading-relaxed">{post.note}</p>}

        {post.cost === "fixed" ? (
          <p className="rounded-2xl border border-[#F6D9C4] bg-warnSoft p-4 text-[14px] leading-relaxed text-[#7C2D12]">{t("운전자가 정한 1인 금액입니다. 출퇴근 실비를 나누는 용도이며 결제는 당사자끼리 직접 합니다.")}</p>
        ) : post.cost === "meter" ? (
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
                  <button className="flex min-h-0 items-center gap-2 font-semibold underline decoration-line underline-offset-4" onClick={() => th.otherId && onProfile(th.otherId)}><Avatar src={th.otherPhoto} name={th.other} size={28} />{th.other}</button>
                  <span className="flex items-center gap-2">
                    {th.otherId && <button className="min-h-0 text-[13px] text-sub underline" disabled={busy} onClick={() => onBlock(th.otherId as string, th.other)}>{t("차단")}</button>}
                    <Tag tone={th.status === "accepted" ? "accent" : "plain"}>{statusText[th.status]}</Tag>
                  </span>
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
            {post.hidden && <p data-block-id="C014" data-block-name="노출 안 됨 안내" className="rounded-xl bg-warnSoft px-4 py-3 text-[14px] text-warn">{t(HIDDEN_TEXT[post.hidden])}</p>}
            <button data-block-id="B015" data-block-name="글 수정" className={`${btnPrimary} py-3 text-[15px]`} onClick={() => (post.regular ? onEditCommute(post) : onEdit(post))}>{post.regular ? t("출퇴근 정보 수정") : t("글 수정")}</button>
            <div className="flex gap-2 pt-1">
              {post.role === "rider" ? (
                <button
                  data-block-id="B018"
                  data-block-name="진행 중 / 다시 게시"
                  disabled={busy}
                  className={`${btnGhost} py-3 text-[15px]`}
                  onClick={() => {
                    if (post.status !== "open") return run("/api/posts", "PATCH", { id: post.id, status: "open" }, "다시 게시했어요. 운전자를 다시 모집합니다.");
                    if (!window.confirm(t("다른 운전자의 카풀 신청이 중지됩니다.\n카풀이 불발된 경우 '다시 게시' 버튼을 눌러 운전자를 다시 모집할 수 있습니다."))) return;
                    run("/api/posts", "PATCH", { id: post.id, status: "progress" }, "카풀 진행 중으로 표시했어요.");
                  }}
                >
                  {post.status === "open" ? t("일시정지") : t("다시 게시")}
                </button>
              ) : (
                <button disabled={busy} className={`${btnGhost} py-3 text-[15px]`} onClick={() => run("/api/posts", "PATCH", { id: post.id, status: post.status === "open" ? "closed" : "open" }, post.status === "open" ? "마감했어요." : "다시 열었어요.")}>
                  {post.status === "open" ? t("모집 마감") : t("다시 열기")}
                </button>
              )}
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
          post.ended ? (
            <p data-block-id="C016" data-block-name="종료 안내" className="rounded-2xl bg-bg px-4 py-4 text-center text-[15px] font-semibold text-sub">{t("출발 시각이 지나 종료된 카풀이에요.")}</p>
          ) : post.status === "progress" ? (
            <p data-block-id="C011" data-block-name="카풀 진행 중 안내" className="rounded-2xl bg-accentSoft px-4 py-4 text-center text-[15px] font-semibold text-accent">{t("카풀 진행 중인 글이에요. 지금은 신청을 받지 않습니다.")}</p>
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
          )
        )}

        <button data-block-id="B013" data-block-name="공유" className="w-full text-[15px] text-sub underline" onClick={share}>{t("이 카풀 공유하기")}</button>
        {user && !sample && !post.mine && post.ownerId && (
          <button data-block-id="B016" data-block-name="회원 차단" disabled={busy} className="w-full text-[14px] text-sub underline" onClick={() => onBlock(post.ownerId as string, post.owner)}>{t("이 회원 차단")}</button>
        )}
      </div>
    </Sheet>
  );
}
