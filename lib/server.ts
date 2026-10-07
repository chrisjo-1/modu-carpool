import { neon } from "@neondatabase/serverless";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";

export const hasDb = () => !!process.env.DATABASE_URL;
export const authEnabled = () => hasDb() && !!process.env.SESSION_SECRET;

export function db() {
  return neon(process.env.DATABASE_URL as string);
}

let ready: Promise<void> | null = null;
/** 테이블이 없으면 만든다(인스턴스당 1회). users 테이블은 모카 미터기와 함께 쓸 수 있다. */
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const sql = db();
      await sql`create table if not exists users (
        id uuid primary key default gen_random_uuid(),
        email text unique not null,
        pw text not null,
        created_at timestamptz not null default now())`;
      await sql`alter table users add column if not exists name text not null default ''`;
      await sql`alter table users add column if not exists bio text not null default ''`;
      await sql`alter table users add column if not exists contact text not null default ''`;
      await sql`alter table users add column if not exists contact_type text not null default ''`;
      await sql`create table if not exists posts (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users(id) on delete cascade,
        role text not null,
        kind text not null,
        cost text not null,
        origin text not null,
        dest text not null,
        depart_at timestamptz not null,
        seats integer not null,
        note text not null default '',
        status text not null default 'open',
        created_at timestamptz not null default now())`;
      await sql`create index if not exists posts_depart_idx on posts (status, depart_at)`;
      await sql`alter table posts add column if not exists origin_lat double precision`;
      await sql`alter table posts add column if not exists origin_lng double precision`;
      await sql`alter table posts add column if not exists dest_lat double precision`;
      await sql`alter table posts add column if not exists dest_lng double precision`;
      await sql`alter table posts add column if not exists price integer not null default 0`;
      await sql`alter table posts add column if not exists regular boolean not null default false`;
      await sql`alter table posts add column if not exists days text not null default ''`;
      await sql`alter table posts add column if not exists time_go text not null default ''`;
      await sql`alter table posts add column if not exists time_back text not null default ''`;
      await sql`create unique index if not exists posts_regular_uniq on posts (user_id) where regular`;
      await sql`alter table users add column if not exists photo text not null default ''`;
      await sql`alter table users add column if not exists photo_v integer not null default 0`;
      await sql`alter table users add column if not exists blocked boolean not null default false`;
      await sql`create table if not exists admin_attempts (ip text not null, at timestamptz not null default now())`;
      await sql`create index if not exists admin_attempts_at_idx on admin_attempts (at)`;
      await sql`create table if not exists requests (
        id uuid primary key default gen_random_uuid(),
        post_id uuid not null references posts(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        message text not null default '',
        status text not null default 'pending',
        created_at timestamptz not null default now(),
        unique (post_id, user_id))`;
      await sql`create table if not exists messages (
        id bigserial primary key,
        request_id uuid not null references requests(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        body text not null,
        created_at timestamptz not null default now())`;
      await sql`create index if not exists messages_req_idx on messages (request_id, id)`;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET as string);
const USER_COOKIE = "modu_session";
const ADMIN_COOKIE = "modu_admin";

async function setCookie(name: string, payload: Record<string, string>, maxAge: number) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secret());
  (await cookies()).set(name, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge });
}

async function readCookie(name: string): Promise<Record<string, unknown> | null> {
  if (!process.env.SESSION_SECRET) return null;
  const token = (await cookies()).get(name)?.value;
  if (!token) return null;
  try {
    return (await jwtVerify(token, secret())).payload;
  } catch {
    return null;
  }
}

export const setUserSession = (id: string) => setCookie(USER_COOKIE, { sub: id, role: "user" }, 60 * 60 * 24 * 30);
export const setAdminSession = () => setCookie(ADMIN_COOKIE, { role: "admin" }, 60 * 60 * 8);
export async function clearCookie(which: "user" | "admin") {
  (await cookies()).delete(which === "user" ? USER_COOKIE : ADMIN_COOKIE);
}

/** 로그인한 회원의 id. 로그인하지 않았거나 차단·삭제된 회원이면 null. */
export async function currentUserId(): Promise<string | null> {
  if (!authEnabled()) return null;
  const p = await readCookie(USER_COOKIE);
  const id = p && p.role === "user" && typeof p.sub === "string" ? p.sub : null;
  if (!id) return null;
  try {
    await ensureSchema();
    const rows = await db()`select blocked from users where id = ${id}`;
    return rows.length && !rows[0].blocked ? id : null;
  } catch (e) {
    console.error("[auth]", e);
    return null;
  }
}

export async function isAdmin(): Promise<boolean> {
  const p = await readCookie(ADMIN_COOKIE);
  return !!p && p.role === "admin";
}

export function checkAdminPassword(input: string): boolean {
  const real = process.env.ADMIN_PASSWORD;
  if (!real || !process.env.SESSION_SECRET) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(real);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export const body = async (req: Request) =>
  ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;

/** 앞뒤 공백을 지우고 길이를 제한한 문자열. */
export const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** 서버 로그에 원인을 남기고 사용자에게는 일반 안내만 보낸다. */
export const fail = (e?: unknown) => {
  if (e) console.error("[api]", e);
  return json({ error: "일시적인 오류입니다. 잠시 후 다시 시도해 주세요." }, 500);
};
export const needLogin = () => json({ error: "로그인이 필요합니다." }, 401);

/** 프로필 사진 주소. 사진이 없으면 빈 문자열. v는 캐시를 새로 고치기 위한 번호다. */
export const photoUrl = (userId: unknown, v: unknown) => (Number(v) > 0 ? `/api/photo?u=${userId}&v=${Number(v)}` : "");
export const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
