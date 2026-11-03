import Link from "next/link";

/** 없는 주소로 들어왔을 때 보여 주는 화면(기본 영문 화면 대신). 서버에서만 그려서 첫 화면 크기를 늘리지 않는다. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-ink" style={{ minHeight: "100vh" }}>
      <p className="text-[15px] font-semibold text-sub">404</p>
      <h1 className="text-[24px] font-bold">페이지를 찾을 수 없어요</h1>
      <p className="text-[15px] leading-relaxed text-sub">주소가 바뀌었거나 없는 페이지예요.<br />처음 화면에서 다시 찾아 주세요.</p>
      <Link href="/" className="mt-2 rounded-2xl bg-accent px-6 py-3.5 text-[16px] font-semibold text-white">모두의카풀 처음으로</Link>
    </main>
  );
}
