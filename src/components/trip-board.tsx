import Link from "next/link";
import type { ReactNode } from "react";
import type { BoardStatus } from "@/lib/trips/board";

/**
 * 便の一覧の1行（空港の出発便一覧と同じ並び）。
 *
 *   上の段：定刻 ｜ 行き先 ｜ 運送会社・便名
 *   下の段：出発の拠点・所要時間・空き・料金など ｜ 状況の札     →
 */

/** 状況の札：白地に色の線（空港の「搭乗中」「定刻」と同じ形） */
const TONE: Record<BoardStatus["tone"], string> = {
  open: "border-navy text-navy",
  few: "border-warn text-warn",
  full: "border-ink text-ink",
  closed: "border-mist text-gray",
  cancelled: "border-danger text-danger",
  draft: "border-dashed border-gray text-gray",
  done: "border-mist text-gray",
};

export function StatusBadge({ status }: { status: BoardStatus }) {
  return (
    <span className={`inline-flex min-h-8 shrink-0 items-center rounded-[5px] border bg-white px-2 text-sm ${TONE[status.tone]}`}>
      {status.label}
    </span>
  );
}

export function BoardRow({
  href,
  time,
  destination,
  carrier,
  code,
  details,
  status,
  dimmed = false,
}: {
  href: string;
  /** 定刻（"10:00"） */
  time: string;
  /** 行き先（到着の拠点名） */
  destination: ReactNode;
  carrier: string;
  /** 便名（"DM102"） */
  code: string;
  /** 下の段に並べる情報 */
  details: ReactNode;
  status: BoardStatus;
  dimmed?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-2 rounded-[5px] bg-paper px-4 py-4 transition-colors hover:bg-[#eef2f7] md:px-6 ${dimmed ? "opacity-60" : ""}`}
    >
      {/* 定刻（PCでは縦線で区切る） */}
      <div className="min-w-0 flex-1 md:flex md:gap-5">
        <div className="flex gap-4 md:contents">
          <span className="num w-12 shrink-0 font-bold md:w-16 md:border-r md:border-line md:font-normal">{time}</span>
          <div className="min-w-0 flex-1">
            <div className="md:flex md:items-baseline md:gap-6">
              <p className="font-bold md:w-60 md:shrink-0">{destination}</p>
              <p className="mt-1 text-sm md:mt-0 md:flex md:flex-1 md:items-baseline md:gap-6">
                <span className="font-bold text-navy">{code}</span>
                <span className="ml-2 text-gray md:ml-0">{carrier}</span>
              </p>
            </div>
            <div className="mt-3 flex items-end gap-3 border-t border-line pt-3">
              <div className="num min-w-0 flex-1 text-sm leading-relaxed">{details}</div>
              <StatusBadge status={status} />
            </div>
          </div>
        </div>
      </div>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="ml-1 shrink-0 self-end md:self-center">
        <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="#033b7d" strokeWidth="1.5" />
      </svg>
    </Link>
  );
}

/** 一覧の上の切り替え（出発便 / 到着便 など）。リンクで切り替える */
export function Segmented({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <div className="grid rounded-[10px] bg-white p-1" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`flex min-h-12 items-center justify-center rounded-[10px] font-bold ${item.active ? "bg-primary text-white" : "text-ink/70"}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
