"use client";
import { useEffect, useState } from "react";
import type { CarMatch } from "@/lib/subwayPosition";
import { positionLabel } from "@/lib/subwayPosition";
import { api, field, useT } from "../ui";

type Req = { id: string; status: string; time_go: string; board_car: string; board_gate?: string };

/** 수락된 앉아가기 매칭 목록. 각 매칭에서 만날 위치와 차량 번호 확인(선택)을 보여 준다. */
export default function SubwayMatches({ onHelp }: { onHelp: () => void }) {
  const t = useT();
  const [list, setList] = useState<Req[] | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ incoming: Req[]; outgoing: Req[] }>("/api/seat/request").then((r) => {
      if (!alive || !r.ok) return;
      setList([...r.data.incoming, ...r.data.outgoing].filter((x) => x.status === "accepted"));
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!list || !list.length) return null;
  return (
    <section className="space-y-3" data-block-id="S072" data-block-name="내 매칭">
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-ink">{t("내 매칭")}</h3>
        <button type="button" className="text-[13px] font-medium text-violet" onClick={onHelp}>{t("위치 찾는 법")}</button>
      </div>
      {list.map((m) => (
        <MatchCard key={m.id} m={m} />
      ))}
    </section>
  );
}

function MatchCard({ m }: { m: Req }) {
  const t = useT();
  const pos = positionLabel(m.board_car, m.board_gate ?? "");
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] text-sub">{t("탑승 시각")} <span className="num font-semibold text-ink">{m.time_go}</span></p>
        <p className="text-[14px] text-sub">
          {t("만날 위치")} <span className="num text-[18px] font-semibold text-ink">{pos || `${m.board_car}${t("번째 칸")}`}</span>
        </p>
      </div>
      <CarConfirm id={m.id} />
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
