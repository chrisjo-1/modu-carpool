/** 나의 당근함: 링크·사진 검증 (서버와 화면이 같은 기준을 쓴다) */
export const KARROT_MAX_PHOTOS = 2;
export const KARROT_MAX_ITEMS = 30;
/** 사진 한 장의 base64 글자 수 상한(약 220KB). 화면에서 600px JPEG로 줄여 보낸다. */
export const KARROT_PHOTO_MAX_CHARS = 300_000;
export const KARROT_LINK_HINT = "당근마켓 상품 링크(daangn.com)만 등록할 수 있어요.";

/** https 이고 호스트가 daangn.com(또는 그 하위)인 링크만 허용 */
export function isKarrotLink(s: string): boolean {
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return h === "daangn.com" || h.endsWith(".daangn.com");
  } catch {
    return false;
  }
}

/** data:image/jpeg;base64 형식이고 JPEG 머리글을 가진 사진인지 확인. 통과하면 base64 본문을 돌려준다. */
export function parseKarrotPhoto(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
  if (!m || m[1].length > KARROT_PHOTO_MAX_CHARS) return null;
  const head = Buffer.from(m[1].slice(0, 8), "base64");
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return null;
  return m[1];
}
