import Link from "next/link";
import type { ReactNode } from "react";
import type { BoardStatus } from "@/lib/trips/board";

/**
 * 便の一覧の1行（空港の出発便一覧と同じ並び）。
 *
 *   上の段：定刻 ｜ 行き先 ｜ 運送会社・便名
 *   下の段：出発の拠点・所要時間・空き・料金など ｜ 状況の札     →
 */

const TONE: Record<BoardStatus["tone"], string> = {
  open: "border-ink bg-ink text-white",
  few: "border-ink bg-accent text-ink",
  full: "border-ink bg-white text-ink",
  closed: "border-mist bg-white text-gray",
  cancelled: "border-danger bg-white text-danger",
  draft: "stripe-soft border-ink bg-white text-ink",
  done: "border-mist bg-white text-gray",
};

export function StatusBadge({ status }: { status: BoardStatus }) {
  return (
    <span className={`inline-flex min-h-7 shrink-0 items-center border px-2 text-xs font-bold ${TONE[status.tone]}`}>
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
      className={`group flex items-stretch border border-ink bg-white transition-colors hover:bg-paper ${dimmed ? "opacity-60" : ""}`}
    >
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <div className="flex items-baseline gap-3">
          <span className="num w-12 shrink-0 text-base font-bold">{time}</span>
          <span className="min-w-0 flex-1 truncate font-bold">{destination}</span>
        </div>
        <div className="mt-0.5 flex items-baseline gap-3 text-xs text-gray">
          <span className="num w-12 shrink-0 font-semibold text-ink">{code}</span>
          <span className="min-w-0 flex-1 truncate">{carrier}</span>
        </div>
        <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
          <div className="num min-w-0 flex-1 text-xs leading-relaxed text-gray">{details}</div>
          <StatusBadge status={status} />
        </div>
      </div>
      <span className="num flex w-8 shrink-0 items-center justify-center border-l border-line text-gray group-hover:text-ink" aria-hidden>
        →
      </span>
    </Link>
  );
}

/** 一覧の上の切り替え（出発便 / 到着便 など）。リンクで切り替える */
export function Segmented({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <div className="grid border border-ink bg-white p-1" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`flex min-h-11 items-center justify-center text-sm font-bold ${item.active ? "bg-ink text-white" : "text-gray"}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
