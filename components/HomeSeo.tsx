import { db, ensureSchema, hasDb } from "@/lib/server";
import { ALL_LINES } from "@/lib/lineMeta";
import { OPENABLE_LINES } from "@/lib/subway";

/**
 * 홈 아래쪽 서비스 소개(서버에서 그림). 검색엔진이 읽을 제목·소개·최근 카풀 글 링크를 담는다.
 * 화면 맨 아래에 작게 보이는 실제 내용이며, 숨긴 글이 아니다. 홈은 10분마다 다시 만든다(revalidate).
 */
type Row = { id: string; origin: string; dest: string; regular: boolean; days: string; time_go: string; depart_at: string; origin_area: string | null; dest_area: string | null };

async function recentPosts(): Promise<Row[]> {
  if (!hasDb()) return [];
  try {
    await ensureSchema();
    const rows = await db()`select p.id, p.origin, p.dest, p.regular, p.days, p.time_go, p.depart_at, p.origin_area, p.dest_area
      from posts p join users u on u.id = p.user_id
      where p.status = 'open' and not p.demo and not u.test and not u.blocked and (p.regular or p.depart_at > now())
      order by p.created_at desc limit 10`;
    return rows as unknown as Row[];
  } catch {
    return [];
  }
}

const DAY = ["일", "월", "화", "수", "목", "금", "토"];
function whenText(r: Row): string {
  if (r.regular) {
    const days = [...(r.days || "")].map((d) => DAY[Number(d)] ?? "").join("");
    return `정기 ${days ? `${days} ` : ""}${r.time_go || ""}`.trim();
  }
  const d = new Date(new Date(r.depart_at).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export default async function HomeSeo() {
  const posts = await recentPosts();
  const lines = ALL_LINES.filter((l) => OPENABLE_LINES.includes(l.id));
  return (
    <section data-block-id="S300" data-block-name="서비스 소개" className="mt-10 space-y-5 border-t border-line pt-6 text-[14px] leading-relaxed text-sub">
      <div className="space-y-2">
        <h1 className="text-[17px] font-bold text-ink">모두의카풀 — 출퇴근 카풀·지하철 앉아가기</h1>
        <p>모두의카풀은 출퇴근길과 나들이길에 방향이 같은 사람끼리 함께 타는 카풀 매칭 서비스입니다. 운전자는 빈자리를 나누고, 탑승자는 같은 방향 차를 찾습니다. 무료 운행을 원칙으로 하며, 평일 출퇴근 시간에는 비용을 나눌 수 있습니다.</p>
        <p>지하철 앉아가기는 서울교통공사 시간대별 혼잡도와 이용자 착석 기록으로 앉을 확률이 높은 칸을 알려 주고, 곧 내리는 분과 자리를 이어 줍니다. 예전 카풀 앱 워프(warp)가 모두의카풀로 이름을 바꿨습니다.</p>
      </div>
      {posts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[15px] font-semibold text-ink">지금 열린 카풀</h2>
          <ul className="space-y-1">
            {posts.map((p) => (
              <li key={p.id}>
                <a href={`/post/${p.id}`} className="underline-offset-2 hover:underline">
                  {p.origin} → {p.dest} 카풀 · {whenText(p)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-2">
        <h2 className="text-[15px] font-semibold text-ink">지하철 앉아가기 노선 안내</h2>
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          <a href="/subway" className="underline">전체 노선</a>
          {lines.map((l) => (
            <a key={l.id} href={`/subway/${l.id}`} className="underline">{l.name} 앉아가기</a>
          ))}
        </p>
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1">
        <a href="/faq" className="underline">자주 묻는 질문</a>
        <a href="/warp" className="underline">워프에서 모두의카풀로</a>
        <a href="/terms" className="underline">이용약관</a>
        <a href="/privacy" className="underline">개인정보처리방침</a>
      </p>
    </section>
  );
}
