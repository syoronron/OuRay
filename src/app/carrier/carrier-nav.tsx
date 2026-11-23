"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

/**
 * 画面下のタブ（片手・親指で届く位置）。
 * 毎日見る「便」を左端に、登録は作業順（ルート ← 拠点・車両）に並べる。
 */
const tabs = [
  { href: "/carrier", label: "便", icon: "trips" },
  { href: "/carrier/routes", label: "定期ルート", icon: "routes" },
  { href: "/carrier/fleet", label: "拠点・車両", icon: "fleet" },
] as const;

function isActive(href: string, pathname: string): boolean {
  if (href === "/carrier") return pathname === "/carrier" || pathname.startsWith("/carrier/trips");
  return pathname.startsWith(href);
}

function Icon({ name, active }: { name: (typeof tabs)[number]["icon"]; active: boolean }) {
  const color = active ? "#0058aa" : "#545a61";
  const s = { stroke: color, strokeWidth: 1.5 };
  const fill = active ? color : "none";
  switch (name) {
    case "trips":
      // 便：荷台のパレット枠
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
          <rect x="2" y="5" width="16" height="10" fill="none" {...s} />
          <rect x="2" y="5" width="8" height="10" fill={fill} {...s} />
          <line x1="10" y1="5" x2="10" y2="15" {...s} />
        </svg>
      );
    case "routes":
      // 定期ルート：行きと帰りの矢印
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
          <line x1="2" y1="6" x2="17" y2="6" {...s} />
          <polyline points="13,2.5 17,6 13,9.5" fill="none" {...s} />
          <line x1="3" y1="14" x2="18" y2="14" {...s} />
          <polyline points="7,10.5 3,14 7,17.5" fill={fill} {...s} />
        </svg>
      );
    case "fleet":
      // 拠点・車両：トラック
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
          <rect x="1.5" y="5" width="11" height="9" fill={fill} {...s} />
          <polyline points="12.5,8 16,8 18.5,11 18.5,14 12.5,14" fill="none" {...s} />
          <circle cx="5" cy="15.5" r="1.8" fill="#fff" {...s} />
          <circle cx="15" cy="15.5" r="1.8" fill="#fff" {...s} />
        </svg>
      );
  }
}

/** 押したタブの上に出る、読み込み中の線 */
function PendingBar() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`absolute inset-x-3 top-0 h-0.5 bg-primary transition-opacity ${pending ? "animate-pulse opacity-100" : "opacity-0"}`}
    />
  );
}

export function CarrierNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] print:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {tabs.map((tab) => {
          const active = isActive(tab.href, pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] ${
                  active ? "font-bold text-primary" : "text-gray"
                }`}
              >
                <PendingBar />
                <Icon name={tab.icon} active={active} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
