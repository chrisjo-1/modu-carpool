import { isValidMemberCode, isUniqueViolation, normalizeMemberCode } from "@/lib/memberCode";
import { body, db, ensureSchema, fail, hasDb, isAdmin, isUuid, json } from "@/lib/server";

export const dynamic = "force-dynamic";

const denied = () => json({ error: "관리자 로그인이 필요합니다." }, 401);

/**
 * 관리자 > 회원 고유코드 변경.
 * check: 새 코드의 형식과 중복 여부만 확인한다.
 * apply: 회원 ID와 새 코드를 받아 다시 중복을 확인한 뒤 저장한다. 표시 이름이 예전 코드와 같으면 함께 바꾼다.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return denied();
  if (!hasDb()) return json({ error: "DB가 연결되지 않았습니다." }, 503);
  const b = await body(req);
  const code = normalizeMemberCode(b.code);
  if (!isValidMemberCode(code)) return json({ ok: false, valid: false, error: "고유코드는 숫자 7자리와 영문 1자리로 입력해 주세요. (I, O 제외)" }, 400);
  try {
    await ensureSchema();
    const sql = db();
    const taken = await sql`select id from users where member_code = ${code} limit 1`;
    if (b.action === "check") return json({ ok: true, valid: true, code, available: taken.length === 0 });
    if (b.action !== "apply") return json({ error: "잘못된 요청입니다." }, 400);

    if (!isUuid(b.userId)) return json({ error: "회원을 찾을 수 없습니다." }, 404);
    const cur = await sql`select member_code from users where id = ${b.userId}`;
    if (!cur.length) return json({ error: "회원을 찾을 수 없습니다." }, 404);
    const old = String(cur[0].member_code ?? "");
    if (old === code) return json({ error: "현재 코드와 같습니다." }, 400);
    if (taken.length) return json({ ok: false, available: false, error: "이미 사용 중인 고유코드입니다." }, 409);
    try {
      // 이름이 예전 코드와 같을 때만 새 코드로 바꾼다(닉네임으로 바꾼 이름은 그대로 둔다).
      await sql`update users set member_code = ${code}, name = case when name = ${old} then ${code} else name end where id = ${b.userId}`;
    } catch (e) {
      if (isUniqueViolation(e)) return json({ ok: false, available: false, error: "방금 다른 회원이 같은 코드를 썼습니다. 다시 확인해 주세요." }, 409);
      throw e;
    }
    return json({ ok: true, code, previous: old });
  } catch (e) {
    return fail(e);
  }
}
