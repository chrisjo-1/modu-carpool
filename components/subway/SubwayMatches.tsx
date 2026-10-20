"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CarMatch } from "@/lib/subwayPosition";
import { parseSeat, positionLabel, seatLabel } from "@/lib/subwayPosition";
import SeatMap from "./SeatMap";
import { api, field, useT } from "../ui";

type Pair = { role: "take" | "give"; stops: number; seatStation: string; meetStation: string; gapMin: number; car: string; gate: string };
type Spot = { car: string; door: string; side: "left" | "right" | ""; seat?: string; memo: string; photo?: boolean };
type Contact = { type: string; id: string };
type Cand = Pair & { planId: number; timeGo: string };
type Req = { id: string; status: string; incoming: boolean; otherPlanId: number; otherTime: string; pair: Pair | null; spot: Spot | null; contact: Contact | null };

const smallBtn = "shrink-0 rounded-xl bg-violet px-4 py-2 text-[14px] font-semibold text-white active:opacity-90 disabled:opacity-40";
const ghostBtn = "shrink-0 rounded-xl bg-bg px-4 py-2 text-[14px] font-semibold text-ink active:opacity-80 disabled:opacity-40";

const toMin = (hhmm: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** 자리 위치를 한 줄로: "6번째 칸 · 2~3번 문 사이 4번째 좌석 · 힌트: 네이비 패딩" */
export function spotText(s: Spot): string {
  const p = s.seat ? parseSeat(s.seat) : null;
  const side = s.side === "left" ? " 왼쪽" : s.side === "right" ? " 오른쪽" : "";
  const where = p ? `${s.car}번째 칸 · ${seatLabel(p)}` : `${s.car}-${s.door}${side}`;
  return `${where}${s.memo ? ` · 힌트: ${s.memo}` : ""}`;
}

/**
 * 매칭 정보: 받은 요청 → 매칭됨 → 추천 상대 → 보낸 요청.
 * 수락 전에는 정거장 수·타는 역·시각만, 수락 후에는 하차역·자리 위치·연락처·대화를 보여 준다.
 * 매칭됨이 있으면 하차 2정거장 전부터 화면 위쪽에 안내를 계속 띄운다(시각 추정).
 */
export default function SubwayMatches({ myTime, myDays, reloadKey = 0, chatAsk = 0 }: { myTime: string; myDays: string; reloadKey?: number; chatAsk?: number }) {
  const t = useT();
  const [cands, setCands] = useState<Cand[] | null>(null);
  const [reqs, setReqs] = useState<{ incoming: Req[]; outgoing: Req[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [chatOpen, setChatOpen] = useState("");
  // "대화로 알리기"를 누르면 한 번 대기했다가, 목록이 준비되면 수락된 매칭의 대화창을 연다.
  const [askPending, setAskPending] = useState(false);

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([
      api<{ candidates: Cand[] }>("/api/seat/match"),
      api<{ incoming: Req[]; outgoing: Req[] }>("/api/seat/request"),
    ]);
    if (!c.ok || !r.ok) return setFailed(true);
    setFailed(false);
    setCands(c.data.candidates);
    setReqs(r.data);
  }, []);

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

  const send = async (planId: number) => {
    setBusy(`c${planId}`);
    setMsg("");
    const r = await api("/api/seat/request", "POST", { planId });
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

  return (
    <div className="space-y-5" data-block-id="S072" data-block-name="매칭 정보">
      <RideBanner accepted={accepted} myTime={myTime} myDays={myDays} onChat={(id) => setChatOpen(id)} />
      {msg && <p className="rounded-xl bg-bg px-3 py-2 text-[13px] text-ink">{msg}</p>}

      {incomingPending.length > 0 && (
        <Group title={t("받은 요청")}>
          {incomingPending.map((r) => (
            <div key={r.id} className="space-y-3 rounded-2xl border border-violet/40 bg-white p-4">
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

      <Group title={t("추천 상대")}>
        {fresh.length === 0 ? (
          <p className="text-[14px] leading-relaxed text-sub">{t("지금은 자리를 나눌 수 있는 상대가 없어요. 같은 방향으로 1~3정거장 안에 내리거나 타는 분이 등록하면 알려 드려요.")}</p>
        ) : (
          fresh.map((c) => (
            <div key={`${c.planId}-${c.role}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
              <div className="min-w-0">
                <PairText pair={c} time={c.timeGo} />
              </div>
              <button type="button" className={smallBtn} disabled={busy === `c${c.planId}`} onClick={() => send(c.planId)}>{t("요청")}</button>
            </div>
          ))
        )}
      </Group>

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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold text-sub">{title}</p>
      {children}
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
        <span className="mr-1.5 rounded-full bg-violetSoft px-2 py-0.5 text-[12px] font-semibold text-violet">{take ? t("자리 희망") : t("자리 양보")}</span>
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
            <p className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[14px] ${m.mine ? "bg-violet text-white" : "bg-bg text-ink"}`}>{m.body}</p>
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
    <div className="fixed left-1/2 top-3 z-30 w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-2xl border border-violet/40 bg-white px-4 py-3 shadow-card" role="status" aria-live="polite">
      <p className="text-[12px] font-semibold text-violet">{p.seatStation} · {give ? t("자리 양보") : t("자리 희망")}</p>
      <p className="mt-0.5 text-[15px] font-semibold text-ink">{line}</p>
      {!give && r.spot && <p className="num mt-0.5 text-[13px] text-sub">{t("상대 자리")} {spotText(r.spot)}</p>}
      <button type="button" className="mt-2 text-[13px] font-semibold text-violet" onClick={() => onChat(r.id)}>{t("대화하기")}</button>
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
  if (result.kind === "same_car") return <p className="text-[14px] font-semibold text-violet">{t("같은 칸이에요.")}</p>;
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
