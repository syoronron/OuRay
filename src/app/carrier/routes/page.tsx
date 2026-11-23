import Link from "next/link";
import { PageHeader, SetupNotice } from "@/components/page-header";
import { requireAdminPage } from "@/lib/auth";
import { getCarrier, isDatabaseConfigured, listDepots, listRoutes, listVehicles, type Route } from "@/lib/data/carrier";
import { DIRECTIONS } from "@/lib/labels";
import { formatDuration, formatTime, weekdayLabel } from "@/lib/time";
import { tripCode } from "@/lib/trips/board";
import { MissingCarrier, NeedFleet } from "../notices";

/** 定期ルートの一覧。行き・帰りの組をまとめて表示する */
export default async function RoutesPage() {
  await requireAdminPage();
  if (!isDatabaseConfigured()) return <SetupNotice />;
  const carrier = await getCarrier();
  if (!carrier) return <MissingCarrier />;
  const [routes, depots, vehicles] = await Promise.all([
    listRoutes(carrier.id),
    listDepots(carrier.id),
    listVehicles(carrier.id),
  ]);
  const depotName = new Map(depots.map((d) => [d.id, d.name]));
  const vehicleName = new Map(vehicles.map((v) => [v.id, v.name]));

  // 行き → 組の帰り の順に並べる（組のないものはそのまま）
  const ordered: Route[] = [];
  const seen = new Set<string>();
  for (const r of routes) {
    if (seen.has(r.id)) continue;
    const pair = r.paired_route_id ? routes.find((x) => x.id === r.paired_route_id && !seen.has(x.id)) : undefined;
    const group = pair ? (r.direction === "outbound" ? [r, pair] : [pair, r]) : [r];
    for (const g of group) {
      ordered.push(g);
      seen.add(g.id);
    }
  }

  return (
    <>
      <PageHeader eyebrow="ROUTES" title="定期ルート">
        毎週決まった曜日に走るルートです。ここから「便」を自動で作ります。帰り便の空きを売るのが基本で、行き便はふだん売る枠を 0 にしておきます。
      </PageHeader>

      {vehicles.length === 0 || depots.length < 2 ? (
        <NeedFleet />
      ) : (
        <div className="grid gap-2">
          <Link href="/carrier/routes/new" className="flex min-h-12 items-center justify-center rounded-[10px] bg-navy font-bold text-white">
            定期ルートを追加する
          </Link>
          {ordered.length === 0 && (
            <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray">まだ定期ルートがありません。</p>
          )}
          {ordered.map((r) => (
            <Link key={r.id} href={`/carrier/routes/${r.id}`} className="block rounded-xl bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">
                  <span className="num mr-2 text-sm">{r.number !== null ? tripCode(carrier.code, r.number) : "—"}</span>
                  {depotName.get(r.origin_depot_id)} <span className="num text-gray">→</span> {depotName.get(r.dest_depot_id)}
                </p>
                <span
                  className={`rounded-[5px] border px-2 py-0.5 text-xs ${r.direction === "return" ? "border-primary bg-primary text-white" : "border-mist bg-white text-gray"}`}
                >
                  {DIRECTIONS[r.direction]}
                </span>
              </div>
              <p className="num mt-1 text-sm">
                毎週 {r.weekdays.map(weekdayLabel).join("・")}　{formatTime(r.depart)}発（{formatDuration(r.duration_minutes)}）
              </p>
              <p className="num mt-1 text-xs text-gray">
                {vehicleName.get(r.vehicle_id)}・
                {r.capacity_pallets > 0
                  ? `${r.capacity_pallets}枠 / ${r.capacity_kg.toLocaleString()}kg を 1枠 ${r.price_per_pallet.toLocaleString()}円`
                  : "売る枠なし"}
                {r.detour_max_km > 0 && `・寄り道 ${r.detour_max_km}km`}
                {r.active_until && `・${r.active_until} まで`}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
