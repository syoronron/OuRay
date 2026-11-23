import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { SystemStatus } from "./system-status";

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

      {/* 全国の事業所の地図（トヨタモビリティへの提案用） */}
      <div className="flex flex-1 flex-col justify-center py-[4svh]">
        <Image
          src="/images/top-network-map.jpg"
          alt="全国に広がるトヨタ輸送の事業所の地図"
          width={1200}
          height={679}
          preload
          sizes="(max-width: 448px) 100vw, 408px"
          className="w-full rounded-2xl shadow-[0_8px_24px_rgba(3,59,125,0.18)]"
        />
        <h1 className="mt-6 text-[clamp(1.75rem,8vw,2.4rem)] leading-[1.3] font-bold text-navy">
          トヨタ初の
          <br />
          物流シェアリング
        </h1>
        <p className="mt-2 text-lg leading-relaxed">トヨタの交通網で輸送を安価に</p>
      </div>

      <div className="mt-4 grid gap-2">
        <Link
          href="/trips"
          className="flex min-h-14 items-center justify-between rounded-[10px] bg-primary px-5 font-bold text-white"
        >
          <span>
            お見積りはこちらから
            <span className="ml-2 text-xs font-medium">便をさがす</span>
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
