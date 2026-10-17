"use client";

/** 새로고침 때 맨 위에 보이는 얇은 로딩바. 전체 로딩 화면 대신 쓰며, 같은 탭에서 처음 여는 경우에는 CSS로 숨겨진다. */
export default function TopLoading() {
  return (
    <div className="splash-slim fixed inset-x-0 top-0 z-[80] h-[3px] overflow-hidden bg-accent/15" role="progressbar" aria-label="불러오는 중">
      <div className="slim-bar-run h-full w-2/5 bg-accent" />
    </div>
  );
}
