import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";

/** 荷主向けの公開ページ（便をさがす） */
export default function TripsLayout({ children }: LayoutProps<"/trips">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" aria-label="トップページへ">
            <Logo size={22} />
          </Link>
          <span className="num text-[10px] font-semibold tracking-[0.2em] text-gray">FIND A TRIP</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-12">
        <Suspense fallback={<p className="text-sm text-gray">読み込み中…</p>}>{children}</Suspense>
      </main>
    </div>
  );
}
