/**
 * OuRay のマーク（B案「往来の輪」）：行きと帰りの矢印がひとつの輪になり、その中をトラックが走る。
 * spinning のときは輪だけが回る（読み込み中の表示）。トラックは向きを保つ。
 * 動きを減らす設定の端末では回さない（motion-safe）。
 */
export function LogoMark({ size = 24, spinning = false }: { size?: number; spinning?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <g
        className={spinning ? "motion-safe:animate-[spin_1.2s_linear_infinite]" : undefined}
        style={{ transformOrigin: "32px 32px", transformBox: "view-box" }}
      >
        {/* 行き（上の弧） */}
        <path d="M10 28 A22 22 0 0 1 52 22" fill="none" stroke="#033b7d" strokeWidth="4" strokeLinecap="round" />
        <path d="M46 14 L53 22 L44 25" fill="none" stroke="#033b7d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {/* 帰り（下の弧） */}
        <path d="M54 36 A22 22 0 0 1 12 42" fill="none" stroke="#0058aa" strokeWidth="4" strokeLinecap="round" />
        <path d="M18 50 L11 42 L20 39" fill="none" stroke="#0058aa" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* 真ん中のトラック */}
      <rect x="16" y="25" width="19" height="13" rx="2" fill="#0058aa" />
      <path d="M37 29h6l4 4.5V38H37z" fill="#033b7d" />
      <circle cx="22" cy="40" r="3" fill="#fff" stroke="#033b7d" strokeWidth="2" />
      <circle cx="42" cy="40" r="3" fill="#fff" stroke="#033b7d" strokeWidth="2" />
    </svg>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size + 4} />
      <span className="num text-xl font-bold tracking-[-0.02em] text-navy">OuRay</span>
    </span>
  );
}

/** 読み込み中の表示：マークの輪が回る */
export function LoadingLogo({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[50svh] flex-col items-center justify-center gap-3">
      <LogoMark size={64} spinning />
      <p className="text-sm text-gray">{label}</p>
    </div>
  );
}
