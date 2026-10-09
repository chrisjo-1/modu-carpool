"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { Place, Post } from "@/lib/types";
import type { usePush } from "./Push";
import { Card, Icon, Segment, Sheet, api, btnPrimary, useT } from "./ui";

const PlaceField = dynamic(() => import("./PlaceField"), { ssr: false });
type Alert = { id: string; label: string; want: string };
const empty: Place = { name: "", lat: null, lng: null };

/** 내 정보 > 경로 알림: 출발·도착이 2km 안으로 겹치는 새 글이 올라오면 푸시 */
export default function RouteAlerts({ regular, toast, push }: { regular: Post | null; toast: (m: string) => void; push: ReturnType<typeof usePush> }) {
  const t = useT();
  const [list, setList] = useState<Alert[]>([]);
  const [max, setMax] = useState(3);
  const [adding, setAdding] = useState(false);
  const [origin, setOrigin] = useState<Place>(empty);
  const [dest, setDest] = useState<Place>(empty);
  const [want, setWant] = useState<"any" | "driver" | "rider">("any");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ alerts: Alert[]; max: number }>("/api/alerts");
    if (r.ok) {
      setList(r.data.alerts);
      setMax(r.data.max);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async (o: Place, d: Place, w: string) => {
    if (o.lat == null || o.lng == null || d.lat == null || d.lng == null) return toast(t("출발지와 도착지를 목록에서 골라 주세요."));
    setBusy(true);
    const r = await api("/api/alerts", "POST", { origin: o.name, dest: d.name, oLat: o.lat, oLng: o.lng, dLat: d.lat, dLng: d.lng, want: w });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    setAdding(false);
    setOrigin(empty);
    setDest(empty);
    await load();
    toast(t(push.state === "on" ? "경로 알림을 등록했어요." : "경로 알림을 등록했어요. 푸시 알림을 켜야 받을 수 있어요."));
  };
  const remove = async (id: string) => {
    const r = await api(`/api/alerts?id=${id}`, "DELETE");
    if (!r.ok) return toast(t(r.error));
    load();
  };
  const wantText = (w: string) => (w === "driver" ? t("운전자 글만") : w === "rider" ? t("탑승자 글만") : t("모든 글"));
  const canQuick = regular && regular.originLat != null && regular.destLat != null && !list.some((a) => a.label === `${regular.origin} → ${regular.dest}`.slice(0, 90));

  return (
    <div>
      <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("경로 알림")}</h2>
      <Card data-block-id="C203" data-block-name="경로 알림" className="space-y-3 p-5">
        <p className="text-[14px] leading-relaxed text-sub">{t("내 경로와 출발지·도착지가 각각 2km 안인 새 카풀 글이 올라오면 푸시로 알려 드려요.")}</p>
        {push.state !== "on" && <p className="rounded-lg bg-[#FFF7E6] px-3 py-2 text-[13px] text-[#7A4A00]">{t("푸시 알림이 꺼져 있어요. 위에서 푸시 알림을 켜 주세요.")}</p>}
        {list.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {list.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{a.label}</span>
                  <span className="text-[13px] text-sub">{wantText(a.want)}</span>
                </span>
                <button data-block-id="B205" data-block-name="경로 알림 삭제" className="min-h-0 shrink-0 text-[14px] text-sub underline" onClick={() => remove(a.id)}>{t("삭제")}</button>
              </li>
            ))}
          </ul>
        )}
        {list.length < max && (
          <div className="flex flex-wrap gap-2">
            {canQuick && regular && (
              <button data-block-id="B206" data-block-name="출퇴근 경로로 알림" disabled={busy} className="rounded-xl bg-accentSoft px-4 text-[15px] font-semibold text-accent" onClick={() => add({ name: regular.origin, lat: regular.originLat ?? null, lng: regular.originLng ?? null }, { name: regular.dest, lat: regular.destLat ?? null, lng: regular.destLng ?? null }, regular.role === "driver" ? "rider" : "driver")}>
                {t("내 출퇴근 경로로 받기")}
              </button>
            )}
            <button data-block-id="B207" data-block-name="경로 알림 추가" className="flex items-center gap-1 rounded-xl border border-line bg-white px-4 text-[15px]" onClick={() => setAdding(true)}>
              {Icon.plus(1.6)} {t("경로 추가")}
            </button>
          </div>
        )}
      </Card>
      {adding && (
        <Sheet title={t("경로 알림 추가")} blockId="S204" onClose={() => setAdding(false)}>
          <div className="space-y-4">
            <PlaceField blockId="F206" label={t("출발지")} placeholder={t("예: 수원 영통역")} value={origin} onChange={setOrigin} locate toast={toast} />
            <PlaceField blockId="F207" label={t("도착지")} placeholder={t("예: 강남역")} value={dest} onChange={setDest} toast={toast} />
            <Segment label={t("받을 글")} value={want} onChange={setWant} options={[["any", t("모든 글")], ["driver", t("운전자 글만")], ["rider", t("탑승자 글만")]]} />
            <button data-block-id="B208" data-block-name="경로 알림 저장" className={btnPrimary} disabled={busy} onClick={() => add(origin, dest, want)}>{busy ? t("처리 중…") : t("알림 받기")}</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
