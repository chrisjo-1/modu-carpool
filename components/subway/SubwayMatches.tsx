"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { CarMatch } from "@/lib/subwayPosition";
import { positionLabel } from "@/lib/subwayPosition";
import { api, field, useT } from "../ui";

type Pair = { role: "take" | "give"; stops: number; seatStation: string; meetStation: string; gapMin: number; car: string; gate: string };
type Cand = Pair & { planId: number; timeGo: string };
type Req = { id: string; status: string; incoming: boolean; otherPlanId: number; otherTime: string; pair: Pair | null };

const smallBtn = "shrink-0 rounded-xl bg-violet px-4 py-2 text-[14px] font-semibold text-white active:opacity-90 disabled:opacity-40";
const ghostBtn = "shrink-0 rounded-xl bg-bg px-4 py-2 text-[14px] font-semibold text-ink active:opacity-80 disabled:opacity-40";

/**
 * 매칭 정보: 받은 요청 → 매칭됨 → 추천 상대 → 보낸 요청 순서로 보여 준다.
 * 상대 정보는 역·시각·칸-문만 보인다(이름·연락처 없음).
 */
export default function SubwayMatches() {
  const t = useT();
  const [cands, setCands] = useState<Cand[] | null>(null);
  const [reqs, setReqs] = useState<{ incoming: Req[]; outgoing: Req[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([
      api<{ candidates: Cand[] }>("/api/seat/match"),
      api<{ incoming: Req[]; outgoing: Req[] }>("/api/seat/request"),
    ]);
    if (!c.ok || !r.ok) return setFailed(true);
    setCands(c.data.candidates);
    setReqs(r.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
  // 이미 요청을 주고받은 상대는 추천 목록에서 뺀다.
  const touched = new Set(all.map((r) => r.otherPlanId));
  const fresh = cands.filter((c) => !touched.has(c.planId));

  return (
    <div className="space-y-5" data-block-id="S072" data-block-name="매칭 정보">
      {msg && <p className="rounded-xl bg-bg px-3 py-2 text-[13px] text-ink">{msg}</p>}

      {incomingPending.length > 0 && (
        <Group title={t("받은 요청")}>
          {incomingPending.map((r) => (
            <div key={r.id} className="space-y-3 rounded-2xl border border-violet/40 bg-white p-4">
              <PairText pair={r.pair} time={r.otherTime} />
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
            <div key={r.id} className="space-y-3 rounded-2xl border border-line bg-white p-4">
              <PairText pair={r.pair} time={r.otherTime} />
              <CarConfirm id={r.id} />
            </div>
          ))}
        </Group>
      )}

      <Group title={t("추천 상대")}>
        {fresh.length === 0 ? (
          <p className="text-[14px] leading-relaxed text-sub">{t("지금은 자리를 나눌 수 있는 상대가 없어요. 같은 방향으로 1~3정거장 안에 내리거나 타는 분이 등록하면 여기에 나와요.")}</p>
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

/** 자리 나눔 한 건의 설명: 누가 어디서 내리고, 몇 정거장, 어디서 만나는지. */
function PairText({ pair, time }: { pair: Pair | null; time: string }) {
  const t = useT();
  if (!pair) return <p className="text-[14px] text-sub">{t("등록이 바뀌어 지금은 자리를 나눌 수 없어요.")}</p>;
  const pos = positionLabel(pair.car, pair.gate) || (pair.car ? `${pair.car}${t("번째 칸")}` : "");
  return (
    <div className="space-y-1">
      <p className="text-[15px] font-semibold text-ink">
        <span className="mr-1.5 rounded-full bg-violetSoft px-2 py-0.5 text-[12px] font-semibold text-violet">{pair.stops}{t("정거장")}</span>
        {pair.role === "take" ? (
          <>{pair.seatStation}{t("에서 내리는 분의 자리를 받아요")}</>
        ) : (
          <>{pair.meetStation}{t("에서 타는 분이 내 자리를 받아요")}</>
        )}
      </p>
      <p className="text-[13px] text-sub">
        {pair.role === "take"
          ? <>{pair.meetStation} {t("탑승")} · {t("상대 출발")} <span className="num">{time}</span></>
          : <>{t("내가")} {pair.seatStation}{t("에서 내릴 때")} · {t("상대 탑승")} <span className="num">{time}</span></>}
      </p>
      {pos && (
        <p className="text-[13px] text-sub">
          {t("만날 위치")} <span className="num text-[15px] font-semibold text-ink">{pos}</span>
        </p>
      )}
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
    <div className="space-y-2 border-t border-line pt-3">
      <p className="text-[13px] text-sub">{t("탄 뒤 문 위의 차량 번호 4자리를 넣으면 같은 칸인지 알려 드려요. (선택)")}</p>
      <div className="flex gap-2">
        <input className={`${field} num min-w-0 flex-1`} inputMode="numeric" maxLength={4} placeholder={mine || t("예: 2590")} value={no} onChange={(e) => setNo(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        <button type="button" className="shrink-0 rounded-2xl bg-bg px-4 text-[15px] font-semibold text-ink active:opacity-80 disabled:opacity-40" disabled={busy} onClick={submit}>{t("확인")}</button>
      </div>
      {mine && <ResultLine result={result} />}
      {msg && <p className="text-[13px] text-warn">{msg}</p>}
    </div>
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
