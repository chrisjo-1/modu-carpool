"use client";
import { useState } from "react";
import { priceAllowedAt } from "@/lib/time";
import type { Place, Post, User } from "@/lib/types";
import { CostField } from "./Commute";
import { TagPicker } from "./Keywords";
import PlaceField from "./PlaceField";
import { Card, Segment, api, btnPrimary, field, useT } from "./ui";

/** 시각(ms)을 datetime-local 입력 값(기기 현지 시간)으로 */
function toLocalInput(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 새 글의 기본 출발 일시: 내일 오전 8시 */
function defaultWhen() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return toLocalInput(d.getTime());
}

/**
 * 한 번짜리 카풀 등록·수정 폼.
 * initial 이 있으면 그 글을 고치는 수정 모드이고, 없으면 새 글 등록이다.
 */
export default function PostForm({
  user,
  enabled,
  goLogin,
  onDone,
  toast,
  onRegular,
  initial,
}: {
  user: User | null;
  enabled: boolean;
  goLogin: () => void;
  onDone: (id?: string) => void;
  toast: (m: string) => void;
  /** 정기카풀(출퇴근) 입력 창을 연다. */
  onRegular: () => void;
  initial?: Post;
}) {
  const t = useT();
  const empty: Place = { name: "", lat: null, lng: null };
  const [role, setRole] = useState<"driver" | "rider">(initial?.role ?? "driver");
  const [kind, setKind] = useState<"commute" | "trip">(initial?.kind ?? "commute");
  const [taxiShare, setTaxiShare] = useState(false);
  const [cost, setCost] = useState<"free" | "meter" | "fixed">(initial?.cost ?? "free");
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : "");
  const [origin, setOrigin] = useState<Place>(initial ? { name: initial.origin, lat: initial.originLat ?? null, lng: initial.originLng ?? null } : empty);
  const [dest, setDest] = useState<Place>(initial ? { name: initial.dest, lat: initial.destLat ?? null, lng: initial.destLng ?? null } : empty);
  const [at, setAt] = useState(() => (initial ? toLocalInput(initial.departAt) : defaultWhen()));
  const [seats, setSeats] = useState(initial?.seats ?? 2);
  const [note, setNote] = useState(initial?.note ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tagIds ?? []);
  const [busy, setBusy] = useState(false);

  // 평일 출퇴근 시간대(오전 7~9시, 오후 6~8시) 출발일 때만 금액을 적을 수 있다.
  const allowed = kind === "commute" && priceAllowedAt(new Date(at).getTime());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await api<{ id?: string; credit?: number }>("/api/posts", initial ? "PATCH" : "POST", {
      id: initial?.id,
      role,
      kind,
      cost: kind !== "commute" || (cost === "fixed" && !allowed) ? "free" : cost,
      price: Number(price),
      origin: origin.name,
      dest: dest.name,
      originLat: origin.lat,
      originLng: origin.lng,
      destLat: dest.lat,
      destLng: dest.lng,
      departAt: new Date(at).getTime(),
      seats: role === "driver" ? seats : 1,
      note,
      tags,
      taxiShare: role === "rider" && taxiShare,
    });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    if (!initial) {
      setOrigin(empty);
      setDest(empty);
      setNote("");
    }
    const credit = !initial && r.data.credit ? ` +${r.data.credit.toLocaleString("ko-KR")} ${t("크레딧")}` : "";
    toast(t(initial ? "글을 수정했어요." : "카풀을 등록했어요.") + credit);
    onDone(initial ? undefined : (r.data as { id?: string }).id);
  };

  const form = (
    <form onSubmit={submit} className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="space-y-1.5">
          <p className="text-sm text-sub">{t("나는")}</p>
          <Segment label={t("역할")} value={role} onChange={setRole} options={[["driver", t("운전자")], ["rider", t("탑승자")]]} />
        </div>
        {role === "rider" && !initial && (
          <label data-block-id="F025" data-block-name="택시 동승 찾기" className="flex cursor-pointer items-start gap-3 rounded-xl bg-bg p-3">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#2F6BFF]" checked={taxiShare} onChange={(e) => setTaxiShare(e.target.checked)} />
            <span>
              <span className="block text-[15px] font-semibold">{t("택시 동승도 같이 찾아볼게요")}</span>
              <span className="block text-[13px] leading-relaxed text-sub">{t("체크하면 근처 운전자와 탑승자에게 택시 동승 상대를 찾는다고 알려요.")}</span>
            </span>
          </label>
        )}
        <div className="space-y-1.5">
          <p className="text-sm text-sub">{t("종류")}</p>
          {initial ? (
            <Segment label={t("종류")} value={kind} onChange={setKind} options={[["commute", t("1회 출퇴근")], ["trip", t("나들이·관광")]]} />
          ) : (
            // 정기카풀(출퇴근)을 고르면 출퇴근 정보 창이 바로 열리고, 거기서 저장하면 곧바로 게시된다.
            <Segment<"regular" | "commute" | "trip"> label={t("종류")} value={kind} onChange={(v) => (v === "regular" ? onRegular() : setKind(v))} options={[["regular", t("정기카풀(출퇴근)")], ["commute", t("1회 출퇴근")], ["trip", t("나들이·관광")]]} />
          )}
        </div>
        <PlaceField blockId={initial ? "F070" : "F020"} label={t("출발지")} placeholder={t("예: 수원 영통역")} value={origin} onChange={setOrigin} locate toast={toast} />
        <PlaceField blockId={initial ? "F071" : "F021"} label={t("도착지")} placeholder={t("예: 강남역")} value={dest} onChange={setDest} toast={toast} />
        <label className="block text-sm text-sub">
          {t("출발 일시")}
          <input data-block-id="F022" className={`${field} num mt-1`} type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        {role === "driver" && <div className="flex items-center justify-between">
          <p className="text-sm text-sub">{t("태울 수 있는 자리")}</p>
          <div className="flex items-center gap-3">
            <button type="button" aria-label={t("줄이기")} className="grid h-11 w-11 place-items-center rounded-full bg-bg text-xl" onClick={() => setSeats((s) => Math.max(1, s - 1))}>−</button>
            <span className="num w-6 text-center text-xl font-bold">{seats}</span>
            <button type="button" aria-label={t("늘리기")} className="grid h-11 w-11 place-items-center rounded-full bg-bg text-xl" onClick={() => setSeats((s) => Math.min(6, s + 1))}>+</button>
          </div>
        </div>}
      </Card>

      <Card className="space-y-3 p-5">
        <p className="text-sm text-sub">{t("비용")}</p>
        {kind === "commute" ? (
          <CostField cost={cost} setCost={setCost} price={price} setPrice={setPrice} allowed={allowed} />
        ) : (
          <p className="text-[15px] leading-relaxed text-sub">{t("나들이·관광 카풀은 무료 운행만 등록할 수 있어요.")}</p>
        )}
      </Card>
      <Card data-block-id="C060" data-block-name="키워드" className="p-5">
        <TagPicker role={role} cost={kind === "commute" && !(cost === "fixed" && !allowed) ? cost : "free"} value={tags} onChange={setTags} />
      </Card>

      <Card className="p-5">
        <label className="block text-sm text-sub">
          {t("남길 말 (선택)")}
          <textarea data-block-id="F023" className={`${field} mt-1`} rows={3} maxLength={300} placeholder={t("타는 곳, 짐, 분위기 등을 적어 주세요.")} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </Card>

      <button data-block-id={initial ? "B022" : "B021"} data-block-name={initial ? "수정 저장" : "등록"} className={btnPrimary} disabled={busy}>
        {busy ? t("처리 중…") : initial ? t("저장") : t("등록하기")}
      </button>
    </form>
  );

  // 수정 모드는 창(Sheet) 안에 들어가므로 제목 없이 폼만 보여준다.
  if (initial) return form;

  return (
    <section data-block-id="S002" data-block-name="카풀 등록" className="space-y-4">
      <header>
        <h1 className="text-[28px] font-bold">{t("카풀 등록")}</h1>
        <p className="mt-1 text-sub">{t("태워 줄 수도, 태워 달라고 할 수도 있어요.")}</p>
      </header>

      {!user ? (
        <Card className="space-y-4 p-6 text-center">
          <p className="text-sub">{enabled ? t("카풀을 등록하려면 로그인이 필요해요.") : t("회원 기능은 준비 중입니다. 곧 열립니다.")}</p>
          {enabled && <button data-block-id="B020" data-block-name="로그인 이동" className={btnPrimary} onClick={goLogin}>{t("로그인 / 회원가입")}</button>}
        </Card>
      ) : (
        form
      )}
    </section>
  );
}
