/**
 * OuRay のマーク：上の帯は行き便（荷物で満載＝黒）、下の帯は帰り便。
 * 帰り便の空き（斜線）に、予約された荷物（差し色）が入っていく。
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 50 50" aria-hidden>
      <defs>
        <pattern id="ouray-stripe" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="#033b7d" strokeWidth="1.2" />
        </pattern>
      </defs>
      {/* 行き：満載 */}
      <rect x="1.5" y="6" width="47" height="15" rx="3" fill="#033b7d" stroke="#033b7d" strokeWidth="2.4" />
      {/* 帰り：空き */}
      <rect x="1.5" y="29" width="47" height="15" rx="3" fill="#fff" stroke="#033b7d" strokeWidth="2.4" />
      <rect x="1.5" y="29" width="47" height="15" rx="3" fill="url(#ouray-stripe)" />
      {/* 帰り：予約で埋まった分 */}
      <rect x="1.5" y="29" width="22" height="15" rx="3" fill="#0058aa" stroke="#033b7d" strokeWidth="2.4" />
    </svg>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className="num text-xl font-bold tracking-[-0.02em] text-navy">OuRay</span>
    </span>
  );
}
