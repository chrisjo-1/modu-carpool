"use client";
import { useEffect, useRef, useState } from "react";
import { KARROT_MAX_PHOTOS, KARROT_LINK_HINT, KARROT_PHOTO_MAX_CHARS, isKarrotLink } from "@/lib/karrot";
import { Card, Icon, Sheet, Tag, api, btnGhost, btnPrimary, field, useT } from "./ui";

type Item = { id: string; title: string; note: string; link: string; photos: string[]; mine: boolean };
type Elig = { post_id: string; origin: string; dest: string; depart_at: string; regular: boolean; reward_id: string | null; reward_status: string | null };
type Recv = { id: string; item_title: string; item_link: string; status: string; rider_name: string; origin: string; dest: string; created_at: string };

/** 사진을 600px 이하 JPEG로 줄인다. 서버 상한보다 크면 점점 더 줄인다. */
async function compress(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  let max = 600;
  let q = 0.7;
  for (let i = 0; i < 4; i++) {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length - "data:image/jpeg;base64,".length <= KARROT_PHOTO_MAX_CHARS) return url;
    max = Math.round(max * 0.8);
    q = Math.max(0.4, q - 0.1);
  }
  throw new Error("too large");
}

const input = field;

/** 내 정보: 나의 당근함(진열). 로그인 회원에게만 보인다. 거래는 당근마켓 링크로 이동해서 한다. */
export function KarrotShowcase({ toast }: { toast: (m: string) => void }) {
  const t = useT();
  const [items, setItems] = useState<Item[] | null>(null);
  const [q, setQ] = useState("");
  const [manage, setManage] = useState(false);

  const load = async (keyword: string) => {
    const r = await api<{ items: Item[] }>(`/api/karrot?q=${encodeURIComponent(keyword)}`);
    setItems(r.ok ? r.data.items : []);
    if (!r.ok) toast(t(r.error));
  };
  useEffect(() => {
    const id = setTimeout(() => load(q.trim()), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-sub">{t("나의 당근함")}</h2>
        <button type="button" data-block-id="B340" data-block-name="내 물품 관리" onClick={() => setManage(true)} className="min-h-0 text-[14px] font-semibold text-accent">{t("내 물품 관리")}</button>
      </div>
      <Card data-block-id="C110" data-block-name="나의 당근함" className="space-y-3 p-4">
        <p className="text-[13px] text-sub">{t("카풀 보상으로 드릴 수 있는 물건이에요. 구매는 당근마켓에서 해요.")}</p>
        <input data-block-id="F130" type="search" className={input} placeholder={t("키워드로 찾기 (예: 음료)")} aria-label={t("키워드로 찾기 (예: 음료)")} value={q} onChange={(e) => setQ(e.target.value)} />
        {items === null ? (
          <p className="text-[15px] text-sub">{t("불러오는 중…")}</p>
        ) : items.length === 0 ? (
          <p className="text-[15px] text-sub">{q ? t("찾는 물건이 없어요.") : t("아직 등록된 물건이 없어요.")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((it) => (
              <li key={it.id} className="flex gap-3 py-3">
                {it.photos[0] && <img src={`data:image/jpeg;base64,${it.photos[0]}`} alt={it.title} className="h-16 w-16 shrink-0 rounded-xl object-cover" />}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-[15px] font-semibold">{it.title} {it.mine && <Tag tone="accent">{t("내 물건")}</Tag>}</p>
                  {it.note && <p className="line-clamp-2 text-[13px] text-sub">{it.note}</p>}
                  <a data-block-id="B341" href={it.link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[14px] font-semibold text-accent">
                    {t("당근마켓에서 보기")} <span aria-hidden>↗</span>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {manage && <ItemManager toast={toast} onClose={() => { setManage(false); load(q.trim()); }} />}
    </div>
  );
}

/** 내 물품 등록·수정·삭제 시트 */
function ItemManager({ toast, onClose }: { toast: (m: string) => void; onClose: () => void }) {
  const t = useT();
  const [mine, setMine] = useState<Item[]>([]);
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const load = async () => {
    const r = await api<{ items: Item[] }>("/api/karrot?mine=1");
    if (r.ok) setMine(r.data.items);
  };
  useEffect(() => {
    load();
  }, []);

  const remove = async (it: Item) => {
    if (!window.confirm(t("이 물건을 삭제할까요?"))) return;
    const r = await api("/api/karrot?id=" + it.id, "DELETE");
    if (!r.ok) return toast(t(r.error));
    toast(t("삭제했어요."));
    load();
  };

  return (
    <Sheet title={t("내 물품 관리")} onClose={onClose} blockId="S150">
      {editing ? (
        <ItemForm item={editing === "new" ? null : editing} toast={toast} onDone={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
      ) : (
        <div className="space-y-3">
          <button type="button" data-block-id="B344" onClick={() => setEditing("new")} className={btnPrimary}>{t("물건 등록하기")}</button>
          {mine.length === 0 ? (
            <p className="text-center text-[15px] text-sub">{t("아직 등록한 물건이 없어요.")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {mine.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 py-3">
                  <p className="min-w-0 truncate text-[15px] font-semibold">{it.title}</p>
                  <div className="flex shrink-0 gap-3 text-[14px]">
                    <button type="button" data-block-id="B345" onClick={() => setEditing(it)} className="min-h-0 text-accent underline">{t("수정")}</button>
                    <button type="button" data-block-id="B346" onClick={() => remove(it)} className="min-h-0 text-warn underline">{t("삭제")}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}

function ItemForm({ item, toast, onDone, onCancel }: { item: Item | null; toast: (m: string) => void; onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [title, setTitle] = useState(item?.title ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [link, setLink] = useState(item?.link ?? "");
  const [photos, setPhotos] = useState<string[]>(item?.photos ?? []);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const addPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, KARROT_MAX_PHOTOS - photos.length);
    e.target.value = "";
    if (!files.length) return;
    try {
      const out: string[] = [];
      for (const f of files) out.push((await compress(f)).split(",")[1]);
      setPhotos((p) => [...p, ...out].slice(0, KARROT_MAX_PHOTOS));
    } catch {
      toast(t("사진을 읽지 못했어요. 다른 사진으로 시도해 주세요."));
    }
  };

  const save = async () => {
    if (!title.trim()) return toast(t("제목을 입력해 주세요."));
    if (!isKarrotLink(link.trim())) return toast(t(KARROT_LINK_HINT));
    if (!photos.length) return toast(t("사진을 1장 이상 올려 주세요."));
    setBusy(true);
    const payload = { title, note, link: link.trim(), photos: photos.map((p) => `data:image/jpeg;base64,${p}`) };
    const r = item
      ? await api("/api/karrot", "PATCH", { id: item.id, ...payload })
      : await api("/api/karrot", "POST", payload);
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    toast(t("저장했어요."));
    onDone();
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-[14px] font-semibold">{t("사진")} <span className="text-sub">({photos.length}/{KARROT_MAX_PHOTOS})</span></p>
        <div className="flex gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative h-20 w-20">
              <img src={`data:image/jpeg;base64,${p}`} alt="" className="h-20 w-20 rounded-xl object-cover" />
              <button type="button" aria-label={t("사진 빼기")} onClick={() => setPhotos((arr) => arr.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-ink text-white">×</button>
            </div>
          ))}
          {photos.length < KARROT_MAX_PHOTOS && (
            <button type="button" data-block-id="B347" onClick={() => file.current?.click()} className="grid h-20 w-20 place-items-center rounded-xl border border-dashed border-line text-sub">{Icon.plus?.() ?? "+"}</button>
          )}
        </div>
        <input ref={file} data-block-id="F131" type="file" accept="image/*" multiple className="hidden" aria-label={t("사진 올리기")} onChange={addPhoto} />
      </div>
      <input data-block-id="F132" className={input} placeholder={t("제목 (40자 이내)")} aria-label={t("제목")} maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea data-block-id="F133" className={input} rows={3} placeholder={t("설명 (300자 이내)")} aria-label={t("설명")} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      <input data-block-id="F134" className={input} type="url" placeholder="https://www.daangn.com/..." aria-label={t("당근마켓 링크")} value={link} onChange={(e) => setLink(e.target.value)} />
      <p className="text-[13px] text-sub">{t(KARROT_LINK_HINT)}</p>
      <button type="button" data-block-id="B348" disabled={busy} onClick={save} className={btnPrimary}>{busy ? t("처리 중…") : t("저장")}</button>
      <button type="button" onClick={onCancel} className={btnGhost}>{t("취소")}</button>
    </div>
  );
}

/** 내 정보: 카풀 보상. 탑승자는 같이 탄 운전자에게 물건을 보내고, 운전자는 받았다고 확인한다. */
export function KarrotRewards({ toast }: { toast: (m: string) => void }) {
  const t = useT();
  const [elig, setElig] = useState<Elig[] | null>(null);
  const [recv, setRecv] = useState<Recv[] | null>(null);
  const [target, setTarget] = useState<Elig | null>(null);

  const load = async () => {
    const [a, b] = await Promise.all([api<{ posts: Elig[] }>("/api/karrot/reward?eligible=1"), api<{ rewards: Recv[] }>("/api/karrot/reward?received=1")]);
    setElig(a.ok ? a.data.posts : []);
    setRecv(b.ok ? b.data.rewards : []);
  };
  useEffect(() => {
    load();
  }, []);

  const confirmReceived = async (id: string) => {
    const r = await api("/api/karrot/reward", "PATCH", { id });
    if (!r.ok) return toast(t(r.error));
    toast(t("받았다고 확인했어요."));
    load();
  };

  const hasAny = (elig?.length ?? 0) > 0 || (recv?.length ?? 0) > 0;
  if (elig === null || recv === null || !hasAny) return null;

  return (
    <div>
      <h2 className="mb-2 px-1 text-sm font-semibold text-sub">{t("카풀 보상")}</h2>
      <Card data-block-id="C111" data-block-name="카풀 보상" className="space-y-4 p-4">
        {elig.length > 0 && (
          <div className="space-y-2">
            <p className="text-[14px] font-semibold">{t("보상 보내기 (탑승자)")}</p>
            <ul className="divide-y divide-line">
              {elig.map((c) => (
                <li key={c.post_id} className="flex items-center justify-between gap-3 py-2.5">
                  <p className="min-w-0 truncate text-[15px]">{c.origin} → {c.dest}</p>
                  {c.reward_id ? <Tag tone="mint">{t("보냄")}</Tag> : (
                    <button type="button" data-block-id="B349" onClick={() => setTarget(c)} className="min-h-0 shrink-0 text-[14px] font-semibold text-accent">{t("물건 고르기")}</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {recv.length > 0 && (
          <div className="space-y-2">
            <p className="text-[14px] font-semibold">{t("받은 보상 (운전자)")}</p>
            <ul className="divide-y divide-line">
              {recv.map((r) => (
                <li key={r.id} className="space-y-1.5 py-2.5">
                  <p className="text-[15px] font-semibold">{r.item_title}</p>
                  <p className="text-[13px] text-sub">{r.rider_name} · {r.origin} → {r.dest}</p>
                  <div className="flex items-center justify-between gap-2">
                    <a href={r.item_link} target="_blank" rel="noopener noreferrer nofollow" className="text-[14px] font-semibold text-accent">{t("당근마켓에서 보기")} ↗</a>
                    {r.status === "confirmed" ? <Tag tone="mint">{t("받음 확인")}</Tag> : (
                      <button type="button" data-block-id="B351" onClick={() => confirmReceived(r.id)} className="min-h-0 text-[14px] font-semibold text-accent underline">{t("받았어요")}</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-sub">{t("실제 물건은 당사자끼리 만나서 주고받아요.")}</p>
          </div>
        )}
      </Card>
      {target && <RewardPick post={target} toast={toast} onClose={() => { setTarget(null); load(); }} />}
    </div>
  );
}

/** 탑승자: 키워드로 물건을 찾아 보상으로 고른다. */
function RewardPick({ post, toast, onClose }: { post: Elig; toast: (m: string) => void; onClose: () => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [picked, setPicked] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setTimeout(async () => {
      const r = await api<{ items: Item[] }>(`/api/karrot?q=${encodeURIComponent(q.trim())}`);
      setItems(r.ok ? r.data.items : []);
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  const send = async () => {
    if (!picked) return;
    setBusy(true);
    const r = await api("/api/karrot/reward", "POST", { postId: post.post_id, itemId: picked.id });
    setBusy(false);
    if (!r.ok) return toast(t(r.error));
    toast(t("보상을 보냈어요. 운전자에게 알림이 갔어요."));
    onClose();
  };

  return (
    <Sheet title={t("보상 물건 고르기")} onClose={onClose} blockId="S151">
      <div className="space-y-3">
        <p className="text-[14px] text-sub">{post.origin} → {post.dest}</p>
        <input data-block-id="F135" type="search" className={input} placeholder={t("키워드로 찾기 (예: 음료)")} aria-label={t("키워드로 찾기 (예: 음료)")} value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto">
          {items.map((it) => (
            <li key={it.id}>
              <button type="button" onClick={() => setPicked(it)} className={`flex w-full items-center gap-3 py-3 text-left ${picked?.id === it.id ? "text-accent" : ""}`}>
                {it.photos[0] && <img src={`data:image/jpeg;base64,${it.photos[0]}`} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{it.title}</span>
                {picked?.id === it.id && <span aria-hidden>✓</span>}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" data-block-id="B350" disabled={!picked || busy} onClick={send} className={btnPrimary}>{busy ? t("처리 중…") : t("이 물건을 보상으로 보내기")}</button>
        <p className="text-[12px] text-sub">{t("보상은 감사 표시예요. 금액으로 주고받지 않아요.")}</p>
      </div>
    </Sheet>
  );
}
