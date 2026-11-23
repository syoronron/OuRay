import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { SystemStatus } from "./system-status";

/** 行き便は満載、帰り便は空き。空きに予約が入っていく様子を、パレット枠のマスで見せる */
function TripGraphic() {
  const slots = 8;
  const booked = 3;
  return (
    <div className="w-full" aria-hidden>
      <div>
        <p className="num flex justify-between text-[11px] font-semibold tracking-[0.12em] text-gray">
          <span>OUTBOUND　行き</span>
          <span>FULL</span>
        </p>
        <div className="mt-1 grid grid-cols-8 gap-1">
          {Array.from({ length: slots }, (_, i) => (
            <span key={i} className="aspect-square rounded-[10px] bg-navy" />
          ))}
        </div>
      </div>
      <div className="mt-5">
        <p className="num flex justify-between text-[11px] font-semibold tracking-[0.12em] text-gray">
          <span>RETURN　帰り</span>
          <span>
            {slots - booked} / {slots} EMPTY
          </span>
        </p>
        <div className="mt-1 grid grid-cols-8 gap-1">
          {Array.from({ length: slots }, (_, i) => (
            <span key={i} className={`aspect-square rounded-[4px] border ${i < booked ? "border-primary bg-primary" : "stripe border-mist bg-white"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** トップページ：1枚のポスターのように、文字は最小限（Zicci と同じ考え方） */
export default function Home() {
  return (
    <>
      {/* 背景：トラックの写真（トヨタモビリティへの提案用）。文字が読みやすいよう、上に薄い白の層を重ねる */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
        <Image
          src="/images/top-trucks.jpg"
          alt=""
          fill
          preload
          sizes="100vw"
          className="object-cover object-[34%_center] md:object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-paper/95 via-paper/55 to-paper/95" />
      </div>
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col px-5 pt-4 pb-4">
      <header className="flex items-center justify-between border-b border-line pb-3">
        <Logo size={22} />
        <span className="num text-[10px] font-semibold tracking-[0.2em] text-gray">RETURN-TRIP SHARING</span>
      </header>

      <h1 className="mt-[4svh] text-[clamp(2rem,10vw,2.75rem)] leading-[1.25] font-normal">
        帰りのトラック、
        <br />
        空いています。
      </h1>

      <div className="flex flex-1 items-center py-[4svh]">
        <TripGraphic />
      </div>

      <p className="text-lg font-bold">決まった日時の便だから、安い。</p>
      <p className="mt-1 text-sm leading-relaxed text-gray">
        急がない・毎週出る荷物を、トラックの帰り便の空きで運びます。
      </p>

      <div className="mt-4 grid gap-2">
        <Link
          href="/trips"
          className="flex min-h-14 items-center justify-between rounded-[10px] bg-primary px-5 font-bold text-white"
        >
          <span>
            便をさがす
            <span className="ml-2 text-xs font-medium">荷物を送りたい方</span>
          </span>
          <span className="num" aria-hidden>
            →
          </span>
        </Link>
        <Link
          href="/carrier"
          className="flex min-h-14 items-center justify-between rounded-[10px] border border-mist bg-white px-5 font-bold text-navy"
        >
          <span>
            空きを出す
            <span className="ml-2 text-xs font-medium">運送会社の方</span>
          </span>
          <span className="num" aria-hidden>
            →
          </span>
        </Link>
      </div>

      <footer className="pt-4">
        <Suspense fallback={<p className="text-[11px] text-gray">…</p>}>
          <SystemStatus compact />
        </Suspense>
      </footer>
    </main>
    </>
  );
}
