# 모두의카풀

같은 방향, 같이 가요. 출퇴근과 서울 나들이 카풀 매칭 웹앱(PWA).

- Next.js 15 (App Router) · Tailwind CSS · Neon(Postgres)
- 한국어 · English · 日本語 · 中文
- 무료 운행 원칙, 출퇴근 카풀에 한해 [모카 미터기](https://moca-meter.vercel.app)로 실비 분담

## 환경 변수

| 이름 | 설명 |
|---|---|
| `DATABASE_URL` | Neon 연결 주소. 없으면 예시 글만 보이고 회원 기능이 꺼진다. |
| `SESSION_SECRET` | 로그인 쿠키 서명용 비밀값 |
| `ADMIN_PASSWORD` | `/admin` 비밀번호 |
| `NEXT_PUBLIC_METER_URL` | (선택) 미터기 주소 |

테이블은 첫 요청 때 자동으로 만들어진다(`lib/server.ts`).

## 개발

```
npm install
npm run dev
```
