import { neon } from "@neondatabase/serverless";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { DEFAULT_CONFIG, sanitizeConfig, type AppConfig } from "./config";

export const hasDb = () => !!process.env.DATABASE_URL;
export const authEnabled = () => hasDb() && !!process.env.SESSION_SECRET;

export function db() {
  return neon(process.env.DATABASE_URL as string);
}

let ready: Promise<void> | null = null;
/** 테이블이 없으면 만든다(인스턴스당 1회). */
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const sql = db();
      await sql`create table if not exists users (
        id uuid primary key default gen_random_uuid(),
        email text unique not null,
        pw text not null,
        created_at timestamptz not null default now())`;
      await sql`create table if not exists rides (
        user_id uuid not null references users(id) on delete cascade,
        id text not null,
        started_at timestamptz not null,
        ended_at timestamptz not null,
        distance_m integer not null,
        duration_s integer not null,
        total integer not null,
        passengers integer not null,
        per_person integer not null,
        preset text not null,
        primary key (user_id, id))`;
      await sql`create table if not exists app_config (
        id integer primary key default 1,
        data jsonb not null)`;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET as string);
const USER_COOKIE = "moca_session";
const ADMIN_COOKIE = "moca_admin";

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

export const setUserSession = (id: string, email: string) =>
  setCookie(USER_COOKIE, { sub: id, email, role: "user" }, 60 * 60 * 24 * 30);
export const setAdminSession = () => setCookie(ADMIN_COOKIE, { role: "admin" }, 60 * 60 * 8);
export async function clearCookie(which: "user" | "admin") {
  (await cookies()).delete(which === "user" ? USER_COOKIE : ADMIN_COOKIE);
}

export async function currentUser(): Promise<{ id: string; email: string } | null> {
  const p = await readCookie(USER_COOKIE);
  if (!p || p.role !== "user" || typeof p.sub !== "string") return null;
  return { id: p.sub, email: String(p.email ?? "") };
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

export async function loadConfig(): Promise<AppConfig> {
  if (!hasDb()) return DEFAULT_CONFIG;
  try {
    await ensureSchema();
    const rows = await db()`select data from app_config where id = 1`;
    return rows.length ? sanitizeConfig(rows[0].data) : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
