"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CarMatch } from "@/lib/subwayPosition";
import { needsMemoPopup, parseSeat, positionLabel, seatLabel } from "@/lib/subwayPosition";
import type { LineId } from "@/lib/subway";
import SeatMap from "./SeatMap";
import SeatSpotCard from "./SeatSpotCard";
import { Avatar, Sheet, api, field, useT } from "../ui";
import type { Posture, TodayRide } from "./SubwayCall";

type Pair = { role: "take" | "give"; stops: number; seatStation: string; meetStation: string; gapMin: number; car: string; gate: string };
type Spot = { car: string; door: string; side: "left" | "right" | ""; seat?: string; memo: string; photo?: boolean };
type Contact = { type: string; id: string };
type Cand = Pair & { planId: number; timeGo: string; name: string; trip?: "go" | "back" };
type Req = { id: string; status: string; incoming: boolean; otherPlanId: number; otherTime: string; pair: Pair | null; spot: Spot | null; contact: Contact | null };

const smallBtn = "shrink-0 rounded-xl bg-accent px-4 py-2 text-[14px] font-semibold text-white active:opacity-90 disabled:opacity-40";
const ghostBtn = "shrink-0 rounded-xl bg-bg px-4 py-2 text-[14px] font-semibold text-ink active:opacity-80 disabled:opacity-40";

const toMin = (hhmm: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** 자리 위치를 한 줄로: "6번째 칸 · 2~3번 문 사이 4번째 좌석 · 힌트: 네이비 패딩" */
/** 같은 노선 목록 표시 여부. 목록은 추후 개발 전까지 숨긴다. */
const SHOW_LIST = false;

export function spotText(s: Spot): string {
  const p = s.seat ? parseSeat(s.seat) : null;
  const side = s.side === "left" ? " 왼쪽" : s.side === "right" ? " 오른쪽" : "";
  const where = !s.car ? "" : p ? `${s.car}번째 칸 · ${seatLabel(p)}` : `${s.car}-${s.door}${side}`;
  return [where, s.memo ? `힌트: ${s.memo}` : ""].filter(Boolean).join(" · ");
}

/**
 * 같은 노선·같은 방향에서 내가 탄 뒤에 타는 분들의 목록(프로필·승차 정보)을 보여 준다.
 * 위쪽: 받은 요청·매칭됨. 수락 전에는 하차역·자리 위치를 숨기고, 수락 뒤에만 보여 준다.
 */
export default function SubwayMatches({ myTime, myDays, reloadKey = 0, chatAsk = 0, posture = "", line, station = "", next, trip = "go", ride }: { myTime: string; myDays: string; reloadKey?: number; chatAsk?: number; posture?: Posture; line: LineId; station?: string; next?: string; trip?: "go" | "back"; ride?: TodayRide }) {
  const rideQ = ride ? `&${new URLSearchParams({ line: ride.line, board: ride.board, alight: ride.alight, next: ride.next }).toString()}` : "";
  const t = useT();
  const [memoAsk, setMemoAsk] = useState(false);
  const [cands, setCands] = useState<Cand[] | null>(null);
  const [offDay, setOffDay] = useState(false);
  const [reqs, setReqs] = useState<{ incoming: Req[]; outgoing: Req[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [chatOpen, setChatOpen] = useState("");
  // "대화로 알리기"를 누르면 한 번 대기했다가, 목록이 준비되면 수락된 매칭의 대화창을 연다.
  const [askPending, setAskPending] = useState(false);

  // 목록 종류: 서 있을 때는 내리기 전에 자리를 비우는 분, 앉았을 때는 내 뒤에 타는 분.
  const listKind = posture === "stand" ? "before" : "ahead";
  const load = useCallback(async () => {
    const [r] = await Promise.all([api<{ incoming: Req[]; outgoing: Req[] }>("/api/seat/request")]);
    if (!r.ok) return setFailed(true);
    setFailed(false);
    setReqs(r.data);
    if (!posture) {
      setCands([]);
      setOffDay(false);
      return;
    }
    const c = await api<{ candidates: Cand[]; offDay?: boolean }>(`/api/seat/match?list=${listKind}&trip=${trip}${rideQ}`);
    if (!c.ok) return setFailed(true);
    setCands(c.data.candidates);
    setOffDay(!!c.data.offDay);
  }, [posture, listKind, trip, rideQ]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => {
    if (chatAsk > 0) setAskPending(true);
  }, [chatAsk]);

  useEffect(() => {
    if (!askPending || !reqs) return;
    const first = [...reqs.incoming, ...reqs.outgoing].find((r) => r.status === "accepted");
    setAskPending(false);
    if (first) setChatOpen(first.id);
    else setMsg(t("매칭이 수락되면 대화로 자리를 알려 줄 수 있어요. 먼저 상대에게 요청을 보내 주세요."));
  }, [askPending, reqs, t]);

  const send = async (planId: number, theirTrip: "go" | "back" = "go") => {
    setBusy(`c${planId}`);
    setMsg("");
    const r = await api("/api/seat/request", "POST", { planId, mode: listKind, trip, theirTrip, today: ride });
    setBusy("");
    if (!r.ok) return setMsg(t(r.error));
    setMsg(t("요청을 보냈어요. 상대가 수락하면 매칭돼요."));
    load();
  };

  const respond = async (id: string, accept: boolean) => {
    setBusy(id);
    setMsg("");
    const r = await api("/api/seat/request", "PUT", { id, accept });
    setBusy("");
    if (!r.ok) return setMsg(t(r.error));
    // 수락하면 내 자리를 상대에게 보여 준다. 칸이나 메모가 없으면 먼저 메모창을 띄운다.
    if (accept) {
      const sp = await api<{ spot: { car: string; memo: string } | null }>("/api/seat/spot");
      if (sp.ok && needsMemoPopup(sp.data.spot)) setMemoAsk(true);
    }
    load();
  };

  if (failed) return <p className="text-[14px] text-sub">{t("매칭 정보를 불러오지 못했어요. 잠시 후 다시 열어 주세요.")}</p>;
  if (!cands || !reqs) return <p className="text-[14px] text-sub">{t("불러오는 중…")}</p>;

  const all = [...reqs.incoming, ...reqs.outgoing];
  const accepted = all.filter((r) => r.status === "accepted");
  const incomingPending = reqs.incoming.filter((r) => r.status === "pending");
  const outgoingPending = reqs.outgoing.filter((r) => r.status === "pending");
  const touched = new Set(all.map((r) => r.otherPlanId));
  const fresh = cands.filter((c) => !touched.has(c.planId));
  const pool = fresh;

  return (
    <div className="space-y-6" data-block-id="S072" data-block-name="매칭 정보">
      <RideBanner accepted={accepted} myTime={myTime} myDays={myDays} onChat={(id) => setChatOpen(id)} />
      {msg && <p className="rounded-xl bg-bg px-3 py-2 text-[13px] text-ink">{msg}</p>}

      {incomingPending.length === 0 && accepted.length === 0 && outgoingPending.length === 0 && (
        <div className="space-y-2 rounded-2xl border border-line bg-white px-4 py-5" data-block-id="C135" data-block-name="매칭 없음">
          <p className="text-[15px] font-semibold text-ink">{t("아직 매칭이 없어요")}</p>
          <p className="text-[13px] leading-relaxed text-sub">{t("앉은 분이 '앉았어요'를 누르면 같은 노선·같은 방향 분께 알림이 가요. 알림을 받거나 보낸 요청이 생기면 여기에 나오고, 연결되면 대화로 자리를 넘겨받을 수 있어요.")}</p>
        </div>
      )}

      {incomingPending.length > 0 && (
        <Group title={t("받은 요청")}>
          {incomingPending.map((r) => (
            <div key={r.id} className="space-y-3 rounded-2xl border border-accent/40 bg-white p-4">
              <PairText pair={r.pair} time={r.otherTime} />
              <p className="text-[12px] text-sub">{t("수락하면 하차역·자리 위치·연락처가 서로 보이고 대화할 수 있어요.")}</p>
              <div className="flex gap-2">
                <button type="button" className={smallBtn} disabled={busy === r.id} onClick={() => respond(r.id, true)}>{t("수락")}</button>
                <button type="button" className={ghostBtn} disabled={busy === r.id} onClick={() => respond(r.id, false)}>{t("거절")}</button>
              </div>
            </div>
          ))}
        </Group>
      )}

      {accepted.length > 0 && (
        <Group title={t("매칭됨")}>
          {accepted.map((r) => (
            <MatchedCard key={r.id} r={r} chatOpen={chatOpen === r.id} onToggleChat={() => setChatOpen(chatOpen === r.id ? "" : r.id)} />
          ))}
        </Group>
      )}

      {/* 같은 노선 목록은 추후 개발 중이라 숨긴다(코드는 유지). */}
      {SHOW_LIST && (posture === "" ? (
        <Group title={t("같은 노선 상대")}>
          <div className="rounded-2xl bg-bg px-4 py-4">
            <p className="text-[14px] leading-relaxed text-sub">{t("위 PUSH에서 앉았는지 못 앉았는지 먼저 알려 주세요. 알려 주시면 맞는 분 목록이 나와요.")}</p>
          </div>
        </Group>
      ) : offDay ? (
        <Group title={t("같은 노선 상대")}>
          <div className="rounded-2xl bg-bg px-4 py-4">
            <p className="text-[14px] leading-relaxed text-sub">{t("오늘은 등록한 요일이 아니에요. 자리 나눔은 등록 요일에만 해요.")}</p>
          </div>
        </Group>
      ) : posture === "stand" ? (
        <Group title={t("내가 탄 동안 자리를 비우는 분")} aside={pool.length ? `${pool.length}${t("명")}` : ""}>
          {pool.length === 0 ? (
            <EmptyList text={t("지금 내가 내리기 전에 자리를 비우는 분이 없어요. 등록하는 분이 생기면 여기에 나와요.")} />
          ) : (
            pool.map((c) => <ProfileRow key={`${c.planId}-${c.role}`} c={c} busy={busy === `c${c.planId}`} onRequest={() => send(c.planId, c.trip)} />)
          )}
        </Group>
      ) : (
        <Group title={t("내 뒤에 타는 분 · 자리를 드릴 수 있어요")} aside={pool.length ? `${pool.length}${t("명")}` : ""}>
          {pool.length === 0 ? (
            <EmptyList text={t("지금 내가 탄 뒤에 같은 방향으로 타고, 내가 내리기 전에 같은 길을 가는 분이 없어요. 등록하는 분이 생기면 여기에 나와요.")} />
          ) : (
            pool.map((c) => <ProfileRow key={`${c.planId}-${c.role}`} c={c} busy={busy === `c${c.planId}`} onRequest={() => send(c.planId, c.trip)} />)
          )}
        </Group>
      ))}

      {memoAsk && (
        <Sheet title={t("내 자리와 메모를 남겨 주세요")} blockId="S080" onClose={() => setMemoAsk(false)}>
          <div className="space-y-3 pb-2">
            <p className="text-[13px] leading-relaxed text-sub">{t("수락한 상대에게 보여 줄 자리와 메모예요. 칸을 고르고, 옷차림 메모를 남겨 주세요.")}</p>
            <SeatSpotCard line={line} station={station} next={next} autoEdit onSaved={() => setMemoAsk(false)} />
          </div>
        </Sheet>
      )}

      {outgoingPending.length > 0 && (
        <Group title={t("보낸 요청")}>
          {outgoingPending.map((r) => (
            <div key={r.id} className="rounded-2xl border border-line bg-white p-4">
              <PairText pair={r.pair} time={r.otherTime} />
              <p className="mt-2 text-[13px] text-sub">{t("상대의 수락을 기다리고 있어요.")}</p>
            </div>
          ))}
        </Group>
      )}
    </div>
  );
}

function EmptyList({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-bg px-4 py-4">
      <p className="text-[14px] leading-relaxed text-sub">{text}</p>
    </div>
  );
}

function Group({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-semibold text-sub">{title}</p>
        {aside && <p className="num text-[12px] text-sub">{aside}</p>}
      </div>
      {children}
    </div>
  );
}

/** 상대 한 줄: 프로필(이름·기본 아바타)과 승차·하차 정보, 요청 버튼. 사진과 하차역은 수락 뒤에만. */
function ProfileRow({ c, busy, onRequest }: { c: Cand; busy: boolean; onRequest: () => void }) {
  const t = useT();
  const take = c.role === "take";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5">
      <Avatar name={c.name || t("회원")} size={44} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[15px] font-semibold text-ink">{c.name || t("회원")}</p>
          <span className="rounded-full bg-accentSoft px-2 py-0.5 text-[11px] font-semibold text-accent">{take ? t("자리 희망") : t("자리 양보")}</span>
        </div>
        <p className="text-[13px] text-sub">
          <span className="font-semibold text-ink">{c.stops}{t("정거장")}</span> {take ? t("뒤 자리가 나요") : t("뒤 내 자리를 드려요")}
        </p>
        <p className="num text-[12px] text-sub">
          {take ? `${c.meetStation} ${t("탑승")}` : `${t("상대")} ${c.meetStation} ${t("탑승")}`} · <span>{c.timeGo}</span>
        </p>
      </div>
      <button type="button" className={smallBtn} disabled={busy} onClick={onRequest}>{t("요청")}</button>
    </div>
  );
}

/** 자리 희망(받는 분)·자리 양보(주시는 분)와 정거장 수. 수락 전에는 하차역을 숨긴다. */
function PairText({ pair, time }: { pair: Pair | null; time: string }) {
  const t = useT();
  if (!pair) return <p className="text-[14px] text-sub">{t("등록이 바뀌어 지금은 자리를 나눌 수 없어요.")}</p>;
  const take = pair.role === "take";
  return (
    <div className="space-y-1">
      <p className="text-[15px] font-semibold text-ink">
        <span className="mr-1.5 rounded-full bg-accentSoft px-2 py-0.5 text-[12px] font-semibold text-accent">{take ? t("자리 희망") : t("자리 양보")}</span>
        {pair.stops}{t("정거장")} {take ? t("뒤 자리가 나요") : t("뒤 내 자리를 드려요")}
      </p>
      <p className="text-[13px] text-sub">
        {take ? <>{pair.meetStation} {t("탑승")} · {t("상대 출발")} <span className="num">{time}</span></> : <>{t("상대 탑승")} {pair.meetStation} <span className="num">{time}</span></>}
      </p>
    </div>
  );
}

/** 수락된 매칭: 하차역·자리 위치·연락처·대화·차량번호 확인. */
function MatchedCard({ r, chatOpen, onToggleChat }: { r: Req; chatOpen: boolean; onToggleChat: () => void }) {
  const t = useT();
  const p = r.pair;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatOpen) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [chatOpen]);
  return (
    <div ref={ref} className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <PairText pair={p} time={r.otherTime} />
      {p && (
        <div className="space-y-1.5 rounded-xl bg-bg px-3 py-3 text-[14px]">
          <p className="text-sub">
            {t("자리가 나는 역")} <span className="font-semibold text-ink">{p.seatStation}</span>
          </p>
          <p className="text-sub">
            {p.role === "take" ? t("상대 자리") : t("내 자리")}{" "}
            {r.spot ? (
              <span className="font-semibold text-ink">{spotText(r.spot)}</span>
            ) : (
              <span className="text-ink">{p.role === "take" ? t("아직 입력 전이에요") : t("위 '내 자리 위치'에 입력해 주세요")}</span>
            )}
          </p>
          {r.spot?.seat && <SeatMap value={r.spot.seat} car={r.spot.car} readOnly />}
          {r.spot?.photo && <HintPhoto reqId={r.id} />}
          {!r.spot && (p.car || p.gate) && (
            <p className="text-sub">
              {t("등록한 탑승 위치")} <span className="num text-ink">{positionLabel(p.car, p.gate) || p.car}</span>
            </p>
          )}
          {r.contact && (
            <p className="text-sub">
              {t("연락처")} <span className="select-all font-semibold text-ink">{r.contact.type ? `${r.contact.type} ` : ""}{r.contact.id}</span>
            </p>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" className={smallBtn} onClick={onToggleChat}>{chatOpen ? t("대화 닫기") : t("대화하기")}</button>
      </div>
      {chatOpen && <SeatChat id={r.id} />}
      <CarConfirm id={r.id} />
    </div>
  );
}

/** 지하철 매칭 대화. 열어 둔 동안만 5초마다 새 대화를 가져온다. */
function SeatChat({ id }: { id: string }) {
  const t = useT();
  const [list, setList] = useState<{ id: number; mine: boolean; body: string; at: number }[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const pull = useCallback(async () => {
    const r = await api<{ messages: typeof list }>(`/api/seat/chat?id=${id}`);
    if (r.ok) setList(r.data.messages);
  }, [id]);

  useEffect(() => {
    pull();
    const h = setInterval(() => {
      if (document.visibilityState === "visible") pull();
    }, 5000);
    return () => clearInterval(h);
  }, [pull]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [list.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setErr("");
    const r = await api("/api/seat/chat", "POST", { id, body });
    setBusy(false);
    if (!r.ok) return setErr(t(r.error));
    setText("");
    pull();
  };

  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <div ref={box} className="max-h-60 space-y-1.5 overflow-y-auto">
        {list.length === 0 && <p className="text-[13px] text-sub">{t("예: 다른 자리에 앉았어요 / 오늘은 자리가 필요 없어요")}</p>}
        {list.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <p className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[14px] ${m.mine ? "bg-accent text-white" : "bg-bg text-ink"}`}>{m.body}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className={`${field} min-w-0 flex-1`}
          maxLength={300}
          placeholder={t("메시지를 적어 주세요")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
          }}
        />
        <button type="button" className={smallBtn} disabled={busy || !text.trim()} onClick={send}>{t("보내기")}</button>
      </div>
      {err && <p className="text-[13px] text-warn">{err}</p>}
    </div>
  );
}

/**
 * 하차 2정거장 전부터 계속 띄우는 안내(시각 추정: 받는 분 탑승 시각 + 역 사이 2분).
 * 지하철 안에서는 위치가 정확하지 않아 시각으로 계산하고, 20초마다 다시 계산한다.
 */
function RideBanner({ accepted, myTime, myDays, onChat }: { accepted: Req[]; myTime: string; myDays: string; onChat: (id: string) => void }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(h);
  }, []);
  const d = new Date(now);
  if (!myDays.includes(String(d.getDay()))) return null;
  const nowMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

  let pick: { r: Req; left: number } | null = null;
  for (const r of accepted) {
    const p = r.pair;
    if (!p) continue;
    const boardAt = toMin(p.role === "take" ? myTime : r.otherTime); // 받는 분이 타는 시각
    if (boardAt === null) continue;
    const alightAt = boardAt + 2 * p.stops; // 자리가 나는(주는 분이 내리는) 예상 시각
    const minutes = alightAt - nowMin;
    if (minutes > 4.5 || minutes < -2) continue; // 2정거장 전부터 하차 직후까지
    if (!pick || minutes < pick.left) pick = { r, left: minutes };
  }
  if (!pick) return null;
  const { r, left } = pick;
  const p = r.pair as Pair;
  const stopsLeft = left <= 0.5 ? 0 : Math.min(2, Math.ceil(left / 2));
  const give = p.role === "give";
  const line =
    stopsLeft >= 2
      ? give
        ? r.spot
          ? t("2정거장 전입니다. 상대가 곧 자리로 와요")
          : t("2정거장 전입니다. 자리 위치를 알려 주세요")
        : t("2정거장 전입니다. 상대 자리 위치를 확인하세요")
      : stopsLeft === 1
        ? give
          ? t("1정거장 전이에요. CALL 또는 채팅으로 알려 주세요")
          : t("1정거장 전이에요. 자리 앞으로 가서 CALL 또는 채팅으로 알려 주세요")
        : give
          ? t("내리실 역이에요. 자리를 넘겨 주세요")
          : t("이번 역에서 자리가 나요");

  return (
    <div className="fixed left-1/2 top-3 z-30 w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-2xl border border-accent/40 bg-white px-4 py-3 shadow-card" role="status" aria-live="polite">
      <p className="text-[12px] font-semibold text-accent">{p.seatStation} · {give ? t("자리 양보") : t("자리 희망")}</p>
      <p className="mt-0.5 text-[15px] font-semibold text-ink">{line}</p>
      {!give && r.spot && <p className="num mt-0.5 text-[13px] text-sub">{t("상대 자리")} {spotText(r.spot)}</p>}
      <button type="button" className="mt-2 text-[13px] font-semibold text-accent" onClick={() => onChat(r.id)}>{t("대화하기")}</button>
    </div>
  );
}

/** 탑승 후 차량 번호 확인(선택). 상대가 넣은 번호는 받지 않고 결과만 받는다. */
function CarConfirm({ id }: { id: string }) {
  const t = useT();
  const [no, setNo] = useState("");
  const [mine, setMine] = useState("");
  const [result, setResult] = useState<CarMatch | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ mine: string; result: CarMatch | null }>(`/api/seat/confirm?id=${id}`).then((r) => {
      if (!alive || !r.ok) return;
      setMine(r.data.mine);
      setResult(r.data.result);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const submit = async () => {
    if (!/^\d{4}$/.test(no)) return setMsg(t("차량 번호 4자리를 넣어 주세요."));
    setBusy(true);
    setMsg("");
    const r = await api<{ mine: string; result: CarMatch | null }>("/api/seat/confirm", "POST", { id, carNo: no });
    setBusy(false);
    if (!r.ok) return setMsg(t(r.error));
    setMine(r.data.mine);
    setResult(r.data.result);
    setNo("");
  };

  return (
    <details className="border-t border-line pt-3">
      <summary className="cursor-pointer text-[13px] text-sub">{t("같은 칸인지 차량 번호로 확인하기 (선택)")}</summary>
      <div className="mt-2 space-y-2">
        <div className="flex gap-2">
          <input className={`${field} num min-w-0 flex-1`} inputMode="numeric" maxLength={4} placeholder={mine || t("예: 2590")} value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          <button type="button" className="shrink-0 rounded-2xl bg-bg px-4 text-[15px] font-semibold text-ink active:opacity-80 disabled:opacity-40" disabled={busy} onClick={submit}>{t("확인")}</button>
        </div>
        {mine && <ResultLine result={result} />}
        {msg && <p className="text-[13px] text-warn">{msg}</p>}
      </div>
    </details>
  );
}

function ResultLine({ result }: { result: CarMatch | null }) {
  const t = useT();
  if (!result) return <p className="text-[14px] text-sub">{t("상대가 아직 번호를 넣지 않았어요.")}</p>;
  if (result.kind === "same_car") return <p className="text-[14px] font-semibold text-accent">{t("같은 칸이에요.")}</p>;
  if (result.kind === "same_train") {
    return <p className="text-[14px] text-ink">{t("같은 열차예요. 상대는")} {result.gap}{t("칸 떨어진 곳에 있어요.")}</p>;
  }
  return <p className="text-[14px] text-ink">{t("다른 칸이에요. 바닥 표시 번호를 다시 확인해 주세요.")}</p>;
}

/** 수락된 상대의 오늘의 힌트 사진. 누르면 크게 본다. */
function HintPhoto({ reqId }: { reqId: string }) {
  const t = useT();
  const [big, setBig] = useState(false);
  return (
    <button type="button" data-block-id="C134" data-block-name="상대 힌트 사진" onClick={() => setBig((v) => !v)} className="block min-h-0 text-left">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/seat/spot/photo?req=${encodeURIComponent(reqId)}`} alt={t("상대의 오늘의 힌트 사진")} loading="lazy" className={`rounded-xl border border-line object-cover ${big ? "w-full" : "h-24 w-24"}`} />
      <span className="mt-1 block text-[12px] text-sub">{big ? t("눌러서 작게") : t("힌트 사진 · 눌러서 크게")}</span>
    </button>
  );
}
