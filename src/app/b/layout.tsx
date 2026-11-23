import Link from "next/link";
import { Suspense } from "react";
import { LoadingLogo, Logo } from "@/components/logo";

/** 荷主の予約確認ページ */
export default function BookingLayout({ children }: LayoutProps<"/b">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" aria-label="トップページへ">
            <Logo size={22} />
          </Link>
          <span className="num text-[10px] font-semibold tracking-[0.2em] text-gray">MY BOOKING</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-12">
        <Suspense fallback={<LoadingLogo />}>{children}</Suspense>
      </main>
    </div>
  );
}
