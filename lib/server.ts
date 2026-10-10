import { neon } from "@neondatabase/serverless";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { REASONS } from "./types";

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
      await sql`alter table users add column if not exists test boolean not null default false`;
      await sql`alter table users add column if not exists notify boolean not null default true`;
      await sql`alter table users add column if not exists pw_at timestamptz`;
      await sql`alter table users add column if not exists car_no text not null default ''`;
      // 크레딧: 잔액은 users.credits, 모든 변동은 credit_ledger 에 남긴다.
      await sql`alter table users add column if not exists credits integer not null default 0`;
      await sql`create table if not exists credit_ledger (
        id bigserial primary key,
        user_id uuid not null references users(id) on delete cascade,
        amount integer not null,
        reason text not null,
        memo text not null default '',
        day text not null default '',
        created_at timestamptz not null default now())`;
      await sql`create index if not exists credit_ledger_user_idx on credit_ledger (user_id, id desc)`;
      await sql`create unique index if not exists credit_daily_uniq on credit_ledger (user_id, reason, day) where reason in ('attend', 'post')`;
      await sql`create unique index if not exists credit_signup_uniq on credit_ledger (user_id) where reason = 'signup'`;
      await sql`create unique index if not exists credit_car_uniq on credit_ledger (user_id) where reason = 'car'`;
      await sql`create unique index if not exists credit_legacy_uniq on credit_ledger (user_id) where reason = 'legacy'`;
      await sql`create table if not exists settings (key text primary key, value text not null)`;
      // 공지 대상 고르기용: 성별, 주로 이용하는 역할(비어 있으면 글·차량·구 회원 정보로 판단)
      await sql`alter table users add column if not exists gender text not null default ''`;
      await sql`alter table posts add column if not exists tags text[] not null default '{}'`;
      // 메일 인증: 이 기능 전에 가입한 회원은 인증된 것으로 두고(기본값 true로 추가), 새 가입부터 false
      await sql`alter table users add column if not exists email_verified boolean not null default true`;
      await sql`alter table users alter column email_verified set default false`;
      await sql`create table if not exists email_verifications (
        token_hash text primary key,
        user_id uuid not null references users(id) on delete cascade,
        expires_at timestamptz not null,
        created_at timestamptz not null default now())`;
      // 약관·개인정보 동의, 선택 마케팅 수신 동의
      await sql`alter table users add column if not exists terms_at timestamptz`;
      await sql`alter table users add column if not exists marketing boolean not null default false`;
      await sql`alter table users add column if not exists marketing_at timestamptz`;
      // 경로 알림: 출발·도착이 비슷한 새 글이 올라오면 푸시
      await sql`create table if not exists route_alerts (
        id bigserial primary key,
        user_id uuid not null references users(id) on delete cascade,
        label text not null default '',
        o_lat double precision not null, o_lng double precision not null,
        d_lat double precision not null, d_lng double precision not null,
        want text not null default 'any',
        sent_day text not null default '',
        sent_count integer not null default 0,
        created_at timestamptz not null default now())`;
      await sql`create index if not exists route_alerts_user_idx on route_alerts (user_id)`;
      await sql`create table if not exists feedback (
        id bigserial primary key,
        user_id uuid references users(id) on delete set null,
        email text not null default '',
        category text not null,
        body text not null,
        status text not null default 'new',
        reply text not null default '',
        ip text not null default '',
        created_at timestamptz not null default now(),
        replied_at timestamptz)`;
      await sql`alter table users add column if not exists role_pref text not null default ''`;
      // 가입 뒤 희망 선택(복수): carpool · taxi · other. null이면 아직 고르지 않음.
      await sql`alter table users add column if not exists interests text[]`;
      // 이메일 인증 전 임시 가입 정보. 인증 링크를 누를 때 계정을 만든다.
      await sql`create table if not exists pending_signups (
        email text primary key,
        pw text not null,
        name text not null default '',
        notify boolean not null default true,
        marketing boolean not null default false,
        token_hash text not null,
        ip text not null default '',
        created_at timestamptz not null default now(),
        expires_at timestamptz not null)`;
      await sql`create unique index if not exists pending_token_uniq on pending_signups (token_hash)`;
      // 탑승자가 '택시 동승도 찾기'를 체크한 글
      await sql`alter table posts add column if not exists taxi_share boolean not null default false`;
      await sql`alter table posts add column if not exists demo boolean not null default false`;
      await sql`alter table posts add column if not exists demo_shown boolean not null default true`;
      await sql`create table if not exists notices (
        id bigserial primary key,
        title text not null,
        body text not null,
        roles text[] not null default '{}',
        genders text[] not null default '{}',
        active boolean not null default true,
        target_count integer not null default 0,
        push_sent integer not null default 0,
        created_at timestamptz not null default now())`;
      await sql`create table if not exists notice_reads (
        notice_id bigint not null references notices(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        at timestamptz not null default now(),
        primary key (notice_id, user_id))`;
      await sql`create table if not exists push_subs (
        endpoint text primary key,
        user_id uuid not null references users(id) on delete cascade,
        p256dh text not null,
        auth text not null,
        created_at timestamptz not null default now())`;
      await sql`create index if not exists push_subs_user_idx on push_subs (user_id)`;
      await sql`alter table users add column if not exists car_photo text not null default ''`;
      await sql`alter table users add column if not exists car_v integer not null default 0`;
      // 구 워프(이전 서비스) 회원. 탈퇴 회원은 개인정보 없이 대조용 해시만 둔다.
      await sql`create table if not exists legacy_members (
        warp_id text primary key,
        src_no text not null default '',
        name text, gender text, nickname text, kind text, joined_on text, status text,
        phone text, phone_norm text, email text, email_norm text, naver_id text, kakao_id text,
        records integer not null default 1,
        withdrawn boolean not null default false,
        email_h text, phone_h text,
        match_status text not null default '비교대기',
        matched_user uuid references users(id) on delete set null,
        matched_by text,
        marketing text not null default '미확인',
        promo text not null default '동의확인필요',
        memo text not null default '',
        imported_at timestamptz not null default now())`;
      await sql`create index if not exists legacy_email_idx on legacy_members (email_norm)`;
      await sql`create index if not exists legacy_phone_idx on legacy_members (phone_norm)`;
      await sql`create index if not exists legacy_email_h_idx on legacy_members (email_h)`;
      await sql`create index if not exists legacy_match_idx on legacy_members (match_status)`;
      await sql`create table if not exists legacy_access (
        id bigserial primary key, warp_id text not null, ip text not null default '', at timestamptz not null default now())`;
      await sql`create table if not exists password_resets (
        token_hash text primary key,
        user_id uuid not null references users(id) on delete cascade,
        ip text not null default '',
        expires_at timestamptz not null,
        used boolean not null default false,
        created_at timestamptz not null default now())`;
      await sql`create index if not exists password_resets_user_idx on password_resets (user_id, created_at)`;
      await sql`create table if not exists blocks (
        blocker uuid not null references users(id) on delete cascade,
        blocked uuid not null references users(id) on delete cascade,
        created_at timestamptz not null default now(),
        primary key (blocker, blocked))`;
      await sql`create index if not exists blocks_blocked_idx on blocks (blocked)`;
      await sql`alter table blocks add column if not exists reason text not null default ''`;
      await sql`alter table blocks add column if not exists detail text not null default ''`;
      await sql`create table if not exists reports (
        id uuid primary key default gen_random_uuid(),
        reporter uuid not null references users(id) on delete cascade,
        target uuid not null references users(id) on delete cascade,
        reason text not null,
        detail text not null default '',
        request_id uuid,
        status text not null default 'open',
        created_at timestamptz not null default now())`;
      await sql`create index if not exists reports_created_idx on reports (created_at)`;
      await sql`create table if not exists admin_attempts (ip text not null, at timestamptz not null default now())`;
      await sql`create index if not exists admin_attempts_at_idx on admin_attempts (at)`;
      // 회원 로그인 실패·가입 횟수 제한용 기록(kind: login-email, login-ip, signup-ip)
      await sql`create table if not exists auth_attempts (kind text not null, key text not null, at timestamptz not null default now())`;
      await sql`create index if not exists auth_attempts_idx on auth_attempts (kind, key, at)`;
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
      await sql`alter table messages add column if not exists image text not null default ''`;
      await sql`create table if not exists chat_reads (
        request_id uuid not null references requests(id) on delete cascade,
        user_id uuid not null references users(id) on delete cascade,
        last_id bigint not null default 0,
        primary key (request_id, user_id))`;
      await sql`alter table chat_reads add column if not exists read_at timestamptz`;
      await sql`create table if not exists mail_nudges (
        request_id uuid not null references requests(id) on delete cascade,
        sender uuid not null references users(id) on delete cascade,
        at timestamptz not null default now())`;
      await sql`create index if not exists mail_nudges_idx on mail_nudges (request_id, sender, at)`;
      await sql`create table if not exists reviews (
        request_id uuid not null references requests(id) on delete cascade,
        rater uuid not null references users(id) on delete cascade,
        ratee uuid not null references users(id) on delete cascade,
        stars integer not null,
        created_at timestamptz not null default now(),
        primary key (request_id, rater))`;
      await sql`create index if not exists reviews_ratee_idx on reviews (ratee)`;
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
    const rows = await db()`select blocked, extract(epoch from pw_at)::bigint as pw_at from users where id = ${id}`;
    if (!rows.length || rows[0].blocked) return null;
    // 비밀번호를 바꾼 뒤에는 그 전에 만들어진 로그인(다른 기기 포함)을 모두 끊는다.
    if (rows[0].pw_at != null && typeof p?.iat === "number" && p.iat < Number(rows[0].pw_at)) return null;
    return id;
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
export const carPhotoUrl = (userId: unknown, v: unknown) => (Number(v) > 0 ? `/api/photo?u=${userId}&car=1&v=${Number(v)}` : "");
export const clientIp = (req: Request) => req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

/** 신고·차단 사유를 검사한다. "기타"는 내용을 직접 적어야 한다. */
export function reasonOf(b: Record<string, unknown>): { reason: string; detail: string } | { error: string } {
  const reason = REASONS.some(([k]) => k === b.reason) ? String(b.reason) : "";
  const detail = text(b.detail, 300);
  if (!reason) return { error: "사유를 선택해 주세요." };
  if (reason === "etc" && detail.length < 2) return { error: "기타 사유를 적어 주세요." };
  return { reason, detail };
}

/** 최근 minutes 분 동안 같은 kind·key 기록이 max 번 이상이면 true (요청 횟수 제한) */
export async function overLimit(kind: string, key: string, max: number, minutes: number) {
  const r = await db()`select count(*)::int as n from auth_attempts where kind = ${kind} and key = ${key} and at > now() - make_interval(mins => ${minutes})`;
  return (r[0].n as number) >= max;
}
export async function recordAttempt(kind: string, key: string) {
  const sql = db();
  await sql`insert into auth_attempts (kind, key) values (${kind}, ${key})`;
  // 하루 지난 기록은 가끔 정리한다.
  if (Math.random() < 0.05) await sql`delete from auth_attempts where at < now() - interval '1 day'`;
}
