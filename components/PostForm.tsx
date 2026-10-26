"use client";
import { nextSameSlot, slotLabel } from "@/lib/repost";
import { useState } from "react";
import { priceAllowedAt } from "@/lib/time";
import { defaultRoleFor, type Place, type Post, type User } from "@/lib/types";
import CarGateSheet from "./CarGate";
import { CostField } from "./Commute";
import { TagPicker } from "./Keywords";
import PlaceField from "./PlaceField";
import { Card, Segment, api, btnPrimary, btnRole, currentHere, field, useT } from "./ui";

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
  copy,
}: {
  user: User | null;
  enabled: boolean;
  goLogin: () => void;
  onDone: (id?: string) => void;
  toast: (m: string) => void;
  /** 정기카풀(출퇴근) 입력 창을 연다. */
  onRegular: () => void;
  initial?: Post;
  /** 다시 올리기: 이 글 내용을 채우고 날짜만 다음 같은 요일·같은 시각으로 바꾼 새 글 */
  copy?: Post;
}) {
  const t = useT();
  const empty: Place = { name: "", lat: null, lng: null };
  const src = initial ?? copy;
  // 새 글의 역할은 오른쪽 위 모드 알약(희망 역할)을 그대로 따른다. 이미 올린 글을 고칠 때만 여기서 고른다.
  const [roleEdit, setRoleEdit] = useState<"driver" | "rider">(initial?.role ?? defaultRoleFor(user));
  const role: "driver" | "rider" = initial ? roleEdit : copy ? copy.role : defaultRoleFor(user);
  const [kind, setKind] = useState<"commute" | "trip">(src?.kind === "trip" ? "trip" : "commute");
  const [price, setPrice] = useState(src?.price ? String(src.price) : "");
  const [origin, setOrigin] = useState<Place>(src ? { name: src.origin, lat: src.originLat ?? null, lng: src.originLng ?? null } : empty);
  const [dest, setDest] = useState<Place>(src ? { name: src.dest, lat: src.destLat ?? null, lng: src.destLng ?? null } : empty);
  const [at, setAt] = useState(() => (initial ? toLocalInput(initial.departAt) : copy ? toLocalInput(nextSameSlot(copy.departAt)) : defaultWhen()));
  const [note, setNote] = useState(src?.note ?? "");
  const [tags, setTags] = useState<string[]>(src?.tagIds ?? []);
  const [busy, setBusy] = useState(false);
  // 운전자 글은 차량번호와 차량 사진이 있어야 올릴 수 있다.
  const [carGate, setCarGate] = useState(false);
  const carOk = !!user?.carNo && !!user?.carPhoto;

  // 평일 출퇴근 시간대(오전 7~9시, 오후 6~8시) 출발일 때만 금액을 적을 수 있다.
  const allowed = kind === "commute" && priceAllowedAt(new Date(at).getTime());
  // 비용은 출발 시간으로 자동 정해진다(시간대 안 = 금액 입력, 밖 = 무료).
  const cost: "free" | "fixed" = allowed ? "fixed" : "free";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === "driver" && !carOk) return setCarGate(true);
    // 운전자 글은 위치 권한을 허용해야 올릴 수 있다. 권한을 요청하고, 받은 위치를 서버에 기록한다.
    if (role === "driver") {
      const here = await currentHere();
      if (!here) return toast(t("운전자는 위치 권한을 허용해야 글을 올릴 수 있어요."));
      void api("/api/location", "POST", { lat: here.lat, lng: here.lng });
    }
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
      seats: 1,
      note,
      tags,
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
      {carGate && <CarGateSheet onClose={() => setCarGate(false)} user={user} toast={toast} />}
      <Card className="space-y-4 p-5">
        {copy && !initial && (
          <p data-block-id="C401" data-block-name="다시 올리기 안내" className={`rounded-xl px-4 py-3 text-[14px] leading-relaxed ${copy.role === "driver" ? "bg-accentSoft text-accent" : "bg-mintSoft text-mint"}`}>
            <b>{t("지난 글을 그대로 채웠어요.")}</b> {t("출발 일시가 다음")} {slotLabel(nextSameSlot(copy.departAt))}{t("(으)로 맞춰져 있어요. 확인하고 등록만 누르세요.")}
          </p>
        )}
        {initial ? (
          <div className="space-y-1.5">
            <p className="text-sm text-sub">{t("나는")}</p>
            <Segment label={t("역할")} value={roleEdit} onChange={setRoleEdit} options={[["driver", t("운전자")], ["rider", t("탑승자")]]} accents={{ driver: "accent", rider: "mint" }} />
          </div>
        ) : copy ? null : (
          <p data-block-id="C023" data-block-name="등록 역할 안내" className="text-[13px] leading-relaxed text-sub">
            <b className={role === "driver" ? "text-accent" : "text-mint"}>{role === "driver" ? t("운전자 모드") : t("탑승자 모드")}</b>
            {role === "driver" ? t("로 올려요 · 태워 주는 글") : t("로 올려요 · 같이 탈 차를 찾는 글")}
            <span className="block">{t("역할은 오른쪽 위 모드 버튼에서 바꿔요.")}</span>
          </p>
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
      </Card>

      <Card className="space-y-3 p-5">
        {kind === "commute" ? (
          <CostField cost={cost} price={price} setPrice={setPrice} allowed={allowed} />
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

      <button data-block-id={initial ? "B022" : "B021"} data-block-name={initial ? "수정 저장" : "등록"} className={btnRole(role)} disabled={busy}>
        {busy ? t("처리 중…") : initial ? t("저장") : t(role === "driver" ? "탑승자 구해요 등록" : "운전자 구해요 등록")}
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
