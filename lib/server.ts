import { neon } from "@neondatabase/serverless";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { REASONS } from "./types";
import { isUniqueViolation, makeMemberCode } from "./memberCode";

export const hasDb = () => !!process.env.DATABASE_URL;
export const authEnabled = () => hasDb() && !!process.env.SESSION_SECRET;

export function db() {
  return neon(process.env.DATABASE_URL as string);
}

/** 고유코드가 없는 회원(기존 회원·테스트 회원)에게 하나씩 배정한다. 중복이면 다시 뽑는다. */
export async function backfillMemberCodes(sql: ReturnType<typeof db>) {
  for (let round = 0; round < 50; round++) {
    const rows = await sql`select id from users where member_code is null limit 200`;
    if (!rows.length) return;
    for (const r of rows) {
      for (let i = 0; i < 10; i++) {
        try {
          await sql`update users set member_code = ${makeMemberCode()} where id = ${r.id} and member_code is null`;
          break;
        } catch (e) {
          if (!isUniqueViolation(e)) throw e;
        }
      }
    }
  }
}

let ready: Promise<void> | null = null;
const SCHEMA_KEY = "schema_hash";

/** 테이블·열·색인 만들기. 이 함수 내용이 바뀌면(배포 후 첫 요청에서) 한 번만 다시 돈다. */
async function buildSchema(sql: ReturnType<typeof db>) {
  await sql`create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    pw text not null,
    created_at timestamptz not null default now())`;
  await sql`alter table users add column if not exists name text not null default ''`;
  await sql`alter table users add column if not exists bio text not null default ''`;
  await sql`alter table users add column if not exists contact text not null default ''`;
  await sql`alter table users add column if not exists contact_type text not null default ''`;
  // 고유코드(8자리): 가입 때 자동 배정, 아래 backfillMemberCodes 가 빈 회원에게 채운다.
  await sql`alter table users add column if not exists member_code text`;
  await sql`create unique index if not exists users_member_code_uniq on users (member_code)`;
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
  await sql`create unique index if not exists credit_photo_uniq on credit_ledger (user_id) where reason = 'photo'`;
  await sql`create unique index if not exists credit_firstpost_uniq on credit_ledger (user_id) where reason = 'firstpost'`;
  await sql`create unique index if not exists credit_subway_uniq on credit_ledger (user_id) where reason = 'subway'`;
  // 나의 당근함: 회원이 당근마켓 상품을 소개하는 진열(로그인 회원에게만 보임, 거래는 당근마켓에서)
  await sql`create table if not exists karrot_items (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    title text not null,
    note text not null default '',
    link text not null,
    photos text[] not null default '{}',
    created_at timestamptz not null default now())`;
  await sql`create index if not exists karrot_items_user_idx on karrot_items (user_id)`;
  // 카풀 보상: 탑승자가 같이 탄 운전자에게 당근함 물품을 골라 보내고, 운전자가 받았다고 확인한다.
  await sql`create table if not exists karrot_rewards (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null references posts(id) on delete cascade,
    rider uuid not null references users(id) on delete cascade,
    driver uuid not null references users(id) on delete cascade,
    item_id uuid references karrot_items(id) on delete set null,
    item_title text not null default '',
    item_link text not null default '',
    status text not null default 'chosen',
    created_at timestamptz not null default now(),
    confirmed_at timestamptz,
    unique (post_id, rider))`;
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
  // 의견 감사 크레딧: 관리자가 한 번만 지급한다(지급액·지급 시각 기록)
  await sql`alter table feedback add column if not exists reward integer not null default 0`;
  await sql`alter table feedback add column if not exists rewarded_at timestamptz`;
  await sql`alter table users add column if not exists role_pref text not null default ''`;
  // 역할은 운전자·탑승자 둘 중 하나만 쓴다(운전자는 탑승도 하므로 "둘 다"는 운전자로 옮긴다).
  await sql`update users set role_pref = 'driver' where role_pref = 'both'`;
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
  // 가입 때 받은 현재 위치(위치 권한 허용 필수). 인증이 끝나면 회원의 위치로 옮긴다.
  await sql`alter table pending_signups add column if not exists loc_lat double precision`;
  await sql`alter table pending_signups add column if not exists loc_lng double precision`;
  // 가입하게 된 경로(기존 회원 소개·검색·지인 추천·기타). 기존 회원은 비어 있다.
  await sql`alter table pending_signups add column if not exists join_source text not null default ''`;
  await sql`alter table users add column if not exists join_source text not null default ''`;
  // 워프(풀럭) 기존 회원 확인에 쓴 값(고유번호 또는 워프 이메일). 인증이 끝나면 대조해 이전 크레딧을 준다.
  await sql`alter table pending_signups add column if not exists legacy_key text not null default ''`;
  // 가입 때 입력한 출퇴근 정보(프로필). kind: commute(출퇴근) | other(기타, 주요 이동경로만)
  await sql`alter table users add column if not exists commute_kind text not null default ''`;
  await sql`alter table users add column if not exists commute_origin text not null default ''`;
  await sql`alter table users add column if not exists commute_dest text not null default ''`;
  await sql`alter table users add column if not exists commute_olat double precision`;
  await sql`alter table users add column if not exists commute_olng double precision`;
  await sql`alter table users add column if not exists commute_dlat double precision`;
  await sql`alter table users add column if not exists commute_dlng double precision`;
  await sql`alter table users add column if not exists commute_time text not null default ''`;
  await sql`alter table users add column if not exists commute_price integer not null default 0`;
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
  // 푸시 '끄기'는 구독을 지우지 않고 멈춤 표시만 한다. 10일 넘게 접속하지 않으면 보낼 때 다시 켠다.
  await sql`alter table push_subs add column if not exists paused_at timestamptz`;
  await sql`alter table users add column if not exists car_photo text not null default ''`;
  await sql`alter table users add column if not exists car_v integer not null default 0`;
  // 관리자가 지정한 운전자 등급('' = 자동, silver, gold)
  await sql`alter table users add column if not exists tier_set text not null default ''`;
  // 워프(구 서비스)에서 넘어온 회원의 이전 기록. 관리자가 넣는다. 프로필 별점·이용 횟수에 합쳐 보여 준다.
  await sql`alter table users add column if not exists legacy_stars real not null default 0`;
  await sql`alter table users add column if not exists legacy_reviews integer not null default 0`;
  await sql`alter table users add column if not exists legacy_rides integer not null default 0`;
  // 워프 이전 기록을 관리자가 고친 내역(근거 메모 필수)
  await sql`create table if not exists legacy_stats_log (
    id bigserial primary key,
    user_id uuid not null references users(id) on delete cascade,
    stars real not null, count integer not null, memo text not null,
    created_at timestamptz not null default now())`;
  await sql`create index if not exists legacy_stats_log_user_idx on legacy_stats_log (user_id, created_at desc)`;
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
  await sql`create table if not exists report_chat_access (
    id bigserial primary key,
    report_id uuid not null,
    ip text not null default '',
    at timestamptz not null default now())`;
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
  await sql`create table if not exists mail_log (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    kind text not null,
    category text not null,
    to_email text not null,
    user_id uuid,
    subject text not null default '',
    status text not null,
    error text not null default '',
    provider_id text not null default '')`;
  await sql`create index if not exists mail_log_created_idx on mail_log (created_at)`;
  // 발송 작성본(이름을 붙여 저장)과 메일에 넣을 이미지(작은 파일, base64)
  await sql`create table if not exists mail_templates (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    name text not null,
    category text not null default 'transactional',
    subject text not null default '',
    body text not null default '')`;
  await sql`create table if not exists mail_images (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    content_type text not null,
    data text not null)`;
  // 중복 발송 확인(같은 제목·같은 주소·보낸 기록)을 빠르게 찾게 한다
  await sql`create index if not exists mail_log_dedupe_idx on mail_log (to_email, subject, status)`;
  await sql`alter table mail_log add column if not exists campaign_id uuid`;
  await sql`create index if not exists mail_log_campaign_idx on mail_log (campaign_id, to_email)`;
  await sql`create table if not exists mail_campaigns (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    title text not null,
    category text not null,
    segment text not null,
    only_consent boolean not null default false,
    only_driver boolean not null default false,
    subject text not null,
    body text not null,
    status text not null default 'draft',
    started_at timestamptz,
    finished_at timestamptz)`;
  await sql`create table if not exists mail_policy (
    id int primary key,
    daily_cap int not null default 100,
    quiet_on boolean not null default true,
    quiet_from int not null default 21,
    quiet_to int not null default 8,
    marketing_on boolean not null default false,
    require_consent boolean not null default true,
    updated_at timestamptz not null default now(),
    constraint mail_policy_one_row check (id = 1))`;
  await sql`insert into mail_policy (id) values (1) on conflict do nothing`;
  await sql`create table if not exists mail_suppressions (
    email text primary key,
    reason text not null,
    created_at timestamptz not null default now())`;
  await sql`create table if not exists marketing_consent_log (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    user_id uuid,
    email text not null,
    action text not null,
    source text not null default '')`;
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
  // CALL: 호출 기록, 받은 회원 목록, 수락 기록(수락한 회원에게만 호출자의 연락 방법을 보여 준다)
  await sql`create table if not exists calls (
    id uuid primary key default gen_random_uuid(),
    caller uuid not null references users(id) on delete cascade,
    post_id uuid references posts(id) on delete set null,
    radius_km double precision not null,
    created_at timestamptz not null default now())`;
  await sql`create table if not exists call_recipients (
    call_id uuid not null references calls(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    primary key (call_id, user_id))`;
  await sql`create table if not exists call_accepts (
    call_id uuid not null references calls(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    accepted_at timestamptz not null default now(),
    primary key (call_id, user_id))`;
  // 택시동승 호출(CALL과 별도): 현재 위치 반경의 운전자·탑승자에게 보내고, 수락하면 호출자 연락처를 보여 준다.
  await sql`create table if not exists taxi_calls (
    id uuid primary key default gen_random_uuid(),
    caller uuid not null references users(id) on delete cascade,
    origin text not null, dest text not null,
    origin_lat double precision, origin_lng double precision,
    depart_at timestamptz not null, note text not null default '',
    radius_km double precision not null,
    created_at timestamptz not null default now())`;
  await sql`create table if not exists taxi_call_recipients (
    call_id uuid not null references taxi_calls(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    primary key (call_id, user_id))`;
  await sql`create table if not exists taxi_call_accepts (
    call_id uuid not null references taxi_calls(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    accepted_at timestamptz not null default now(),
    primary key (call_id, user_id))`;
  // 표시 이름을 고유코드로 바꾼다. 기존 닉네임은 old_name 에 남겨 둔다(한 번만 실행).
  await sql`alter table users add column if not exists old_name text`;
  // 워프 회원 질문에 '아니오'로 답한 회원: 다시 묻지 않는다.
  await sql`alter table users add column if not exists warp_no boolean not null default false`;
  // 워프 이메일 확인 링크: 가입 이메일과 다른 워프 이메일로 확인하면, 그 메일로 보낸 링크를 눌러야 이전 크레딧을 준다.
  await sql`create table if not exists legacy_claims (
    token_hash text primary key,
    user_id uuid not null references users(id) on delete cascade,
    warp_id text not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    used boolean not null default false)`;
  await sql`create index if not exists legacy_claims_user_idx on legacy_claims (user_id)`;
  // 탈퇴: 탈퇴한 시각만 남긴다(메일 주소는 계정·워프 행에 그대로 둔다). 탈퇴 확인 메일 링크 저장소.
  await sql`alter table users add column if not exists withdrawn_at timestamptz`;
  await sql`alter table legacy_members add column if not exists withdrawn_at timestamptz`;
  await sql`alter table users add column if not exists pw_reset_required boolean not null default false`;
  await sql`create table if not exists withdraw_claims (
    token_hash text primary key,
    email_norm text not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    used boolean not null default false)`;
  await sql`alter table withdraw_claims add column if not exists kind text not null default 'withdraw'`;
  // 마지막 접속 시각(관리자 회원 목록용). 요청 때마다 쓰지 않도록 5분에 한 번만 기록한다.
  await sql`alter table users add column if not exists last_seen timestamptz`;
  // 회원이 앱을 열 때 기록하는 현재 위치(CALL 대상 찾기용). 30분이 지나면 쓰지 않는다. 화면에는 보이지 않는다.
  await sql`alter table users add column if not exists loc_lat double precision`;
  await sql`alter table users add column if not exists loc_lng double precision`;
  await sql`alter table users add column if not exists loc_at timestamptz`;
  // CALL을 보낼 때의 호출자 현위치(호출 기록용)
  await sql`alter table calls add column if not exists caller_lat double precision`;
  await sql`alter table calls add column if not exists caller_lng double precision`;
  // 도움말(튜토리얼·자주 묻는 질문·의견 안내). 관리자 화면에서 고친다.
  await sql`create table if not exists help_items (
    id bigserial primary key,
    section text not null,
    title text not null,
    body text not null default '',
    image text not null default '',
    sort integer not null default 0,
    active boolean not null default true,
    created_at timestamptz not null default now())`;
  // 공지 대상 계산: 회원마다 구 워프 회원을 찾는 데 쓰는 색인(없으면 회원 수 × 전체 검색이 돼 매우 느리다)
  await sql`create index if not exists legacy_matched_user_idx on legacy_members (matched_user)`;
  await sql`create index if not exists posts_user_role_idx on posts (user_id, role)`;
  // 공지 유형: notice(공지만: 팝업·띠) · push(푸시 알림만) · both(둘 다)
  await sql`alter table notices add column if not exists kind text not null default 'notice'`;
  await sql`update notices set kind = 'both' where kind = 'notice' and push_sent > 0`;
  // 채팅 목록(/api/requests)에서 "내가 보낸 신청 + 내 글에 들어온 신청"을 빨리 찾기 위한 색인
  await sql`create index if not exists requests_user_idx on requests (user_id)`;
  await sql`create index if not exists posts_user_idx on posts (user_id)`;
  await sql`create index if not exists chat_reads_req_idx on chat_reads (request_id, user_id)`;
}

/** 매번 가볍게 확인하는 자료 정리(고유코드 없는 회원 채우기, 표시 이름을 고유코드로). 할 일이 없으면 쿼리 2번. */
async function maintainData(sql: ReturnType<typeof db>) {
  await backfillMemberCodes(sql);
  await sql`update users set old_name = name, name = member_code where member_code is not null and name <> member_code and old_name is null`;
}

function textHash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
}

/**
 * 스키마 준비(인스턴스당 1회). 예전에는 서버가 새로 뜰 때마다 DDL 150여 개를 순서대로 보내 첫 요청이 느렸다.
 * 이제 settings.schema_hash 가 지금 코드와 같으면 DDL을 건너뛴다(조회 1번 + 자료 정리 2번).
 */
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const sql = db();
      const want = textHash(buildSchema.toString());
      let have = "";
      try {
        const r = await sql`select value from settings where key = ${SCHEMA_KEY}`;
        have = r.length ? String(r[0].value) : "";
      } catch {
        /* 처음 설치라 settings 표가 없다 */
      }
      if (have !== want) {
        await buildSchema(sql);
        await sql`insert into settings (key, value) values (${SCHEMA_KEY}, ${want}) on conflict (key) do update set value = excluded.value`;
      }
      await maintainData(sql);
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
    const rows = await db()`select blocked, withdrawn_at, extract(epoch from pw_at)::bigint as pw_at from users where id = ${id}`;
    if (!rows.length || rows[0].blocked || rows[0].withdrawn_at) return null;
    // 비밀번호를 바꾼 뒤에는 그 전에 만들어진 로그인(다른 기기 포함)을 모두 끊는다.
    if (rows[0].pw_at != null && typeof p?.iat === "number" && p.iat < Number(rows[0].pw_at)) return null;
    await db()`update users set last_seen = now() where id = ${id} and (last_seen is null or last_seen < now() - interval '5 minutes')`;
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
