import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/lib/site";
import { db, ensureSchema, hasDb, isUuid } from "@/lib/server";
import { dayLabel } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type Row = {
  id: string; origin: string; dest: string; depart_at: string | Date; role: string; kind: string;
  cost: string; price: number; regular: boolean; days: string; time_go: string; status: string; upcoming: boolean;
};

/**
 * 검색용 글 상세. 공개해도 되는 정보(출발·도착·시각·역할·비용)만 보여 준다.
 * 연락처·차량번호·사진·본문 메모는 여기 싣지 않는다. 앱에서 신청해야 볼 수 있다.
 */
async function loadPost(id: string): Promise<Row | null> {
  if (!isUuid(id) || !hasDb()) return null;
  await ensureSchema();
  const rows = await db()`
    select p.id, p.origin, p.dest, p.depart_at, p.role, p.kind, p.cost, p.price, p.regular, p.days, p.time_go, p.status,
           (p.regular or p.depart_at > now()) as upcoming
    from posts p join users u on u.id = p.user_id
    where p.id = ${id} and not p.demo and not u.test and not u.blocked`;
  return (rows[0] as Row) ?? null;
}

function when(r: Row) {
  if (r.regular) return `${dayLabel("ko", String(r.days))} ${r.time_go} 출발`;
  return `${new Date(r.depart_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })} 출발`;
}
const costText = (r: Row) => (r.cost === "fixed" && r.price ? `실비 분담 ${Number(r.price).toLocaleString("ko-KR")}원` : "무료 운행");
const roleText = (r: Row) => (r.role === "driver" ? "운전자 글" : "탑승자 글");

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = await loadPost(id).catch(() => null);
  if (!r) return { title: "카풀 글을 찾을 수 없어요", robots: { index: false, follow: false } };
  const title = `${r.origin} → ${r.dest} 카풀 · ${when(r)}`;
  const description = `${roleText(r)} · ${when(r)} · ${costText(r)}. 모두의카풀에서 같은 방향 사람과 카풀을 신청해 보세요.`;
  return {
    title,
    description,
    alternates: { canonical: `/post/${r.id}` },
    robots: r.upcoming && r.status === "open" ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { type: "article", url: `/post/${r.id}`, title, description, images: [{ url: "/og.png", width: 1200, height: 630 }] },
  };
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadPost(id).catch(() => null);
  if (!r) notFound();
  const open = r.upcoming && r.status === "open";
  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-16 pt-10 text-ink">
      <p className="text-[13px] text-sub"><Link href="/" className="underline">모두의카풀</Link> · 카풀 글</p>
      <h1 className="mt-3 text-[24px] font-bold leading-snug">{r.origin} → {r.dest}</h1>
      <ul className="mt-5 space-y-2 rounded-3xl border border-line bg-white p-5 text-[15px] shadow-card">
        <li><span className="text-sub">역할 </span>{roleText(r)}</li>
        <li><span className="text-sub">일시 </span>{when(r)}</li>
        <li><span className="text-sub">비용 </span>{costText(r)}</li>
      </ul>
      {open ? (
        <a href={`/?p=${r.id}`} className="mt-6 block rounded-2xl bg-accent px-5 py-4 text-center text-[17px] font-semibold text-white">모두의카풀 앱에서 신청하기</a>
      ) : (
        <p className="mt-6 rounded-2xl bg-bg px-4 py-4 text-center text-[15px] font-semibold text-sub">출발 시각이 지났거나 마감된 카풀이에요. <Link href="/" className="text-accent underline">다른 카풀 보기</Link></p>
      )}
      <p className="mt-6 text-[13px] leading-relaxed text-sub">연락처는 신청이 수락된 뒤에만 서로 공개됩니다. 이 서비스는 무료 운행과 실비 분담을 원칙으로 합니다.</p>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "모두의카풀", item: SITE_URL }, { "@type": "ListItem", position: 2, name: `${r.origin} → ${r.dest}`, item: `${SITE_URL}/post/${r.id}` }] }).replace(/</g, "\\u003c") }} />
    </main>
  );
}
