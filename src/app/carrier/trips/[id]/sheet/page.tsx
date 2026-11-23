import Link from "next/link";
import { notFound } from "next/navigation";
import { SetupNotice } from "@/components/page-header";
import { requireAdminPage } from "@/lib/auth";
import { BOOKING_STATUSES, PACKAGING } from "@/lib/booking";
import { listCarrierBookings } from "@/lib/data/bookings";
import {
  currentCarrierId,
  getCarrier,
  getTrip,
  isDatabaseConfigured,
  listCategories,
  listDepots,
  listRoutes,
  listVehicles,
} from "@/lib/data/carrier";
import { formatDateShort, formatPhone, formatTripTimes, toJst } from "@/lib/time";
import { tripCode } from "@/lib/trips/board";
import { MissingCarrier } from "../../../notices";
import { PrintButton } from "./print-button";
import { connection } from "next/server";

/** 積込リスト（P3-1）：その便で積む荷物の一覧。A4 横で印刷できる */
export default async function LoadingSheetPage({ params }: PageProps<"/carrier/trips/[id]/sheet">) {
  const { id } = await params;
  await requireAdminPage();
  // 毎回その時点のデータで表示する（今日・現在時刻を使うため、作り置きしない）
  await connection();
  if (!isDatabaseConfigured()) return <SetupNotice />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const carrierId = currentCarrierId();
  const [carrier, trip, depots, vehicles, routes, categories, { bookings, shippers }] = await Promise.all([
    getCarrier(),
    getTrip(carrierId, id),
    listDepots(carrierId),
    listVehicles(carrierId),
    listRoutes(carrierId),
    listCategories(),
    listCarrierBookings({ companyId: carrierId, tripId: id }),
  ]);
  if (!carrier) return <MissingCarrier />;
  if (!trip) notFound();

  const rows = bookings.filter((b) => ["confirmed", "loaded", "in_transit", "delivered"].includes(b.status));
  const depot = (depotId: string) => depots.find((d) => d.id === depotId);
  const vehicle = vehicles.find((v) => v.id === trip.vehicle_id);
  const route = routes.find((r) => r.id === trip.route_id);
  const category = new Map(categories.map((c) => [c.code, c]));
  const totalPallets = rows.reduce((s, b) => s + b.pallets, 0);
  const totalKg = rows.reduce((s, b) => s + b.weight_kg, 0);

  return (
    <div className="print:p-[10mm]">
      {/* 印刷は A4 横 */}
      <style>{`@media print { @page { size: A4 landscape; margin: 0; } }`}</style>
      <div className="mb-3 flex items-center justify-between gap-2 print:hidden">
        <Link href={`/carrier/trips/${trip.id}`} className="inline-flex min-h-11 items-center text-sm text-gray">
          ← 便の詳細
        </Link>
        <PrintButton />
      </div>

      <header className="rounded-2xl bg-white p-4 print:rounded-none print:p-0">
        <p className="text-xs text-gray">積込リスト</p>
        <h1 className="num text-xl font-bold">
          <span className="text-navy">{tripCode(carrier.code, route?.number ?? null)}</span>　{formatDateShort(toJst(trip.depart_at).date)}{" "}
          {formatTripTimes(trip.depart_at, trip.arrive_at)}
        </h1>
        <p className="text-sm">
          {depot(trip.origin_depot_id)?.name} → {depot(trip.dest_depot_id)?.name}　車両：{vehicle?.name ?? "—"}
        </p>
        <p className="num mt-1 text-sm">
          合計 {rows.length}件・{totalPallets} / {vehicle?.pallet_slots ?? "—"}枠・{totalKg.toLocaleString()} /{" "}
          {vehicle?.max_load_kg.toLocaleString() ?? "—"}kg
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-6 text-center text-sm text-gray">確定した予約はありません。</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl bg-white p-2 print:overflow-visible print:rounded-none print:p-0">
          <table className="num w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b-2 border-ink">
                <th className="w-8 p-1.5">積</th>
                <th className="w-8 p-1.5">渡</th>
                <th className="p-1.5">荷主</th>
                <th className="p-1.5">荷物</th>
                <th className="p-1.5 text-right">枠</th>
                <th className="p-1.5 text-right">重量</th>
                <th className="p-1.5">持ち込み・集荷</th>
                <th className="p-1.5">受け取り・配達</th>
                <th className="p-1.5">状態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const c = category.get(b.cargo_category);
                return (
                  <tr key={b.id} className="border-b border-line align-top">
                    <td className="p-1.5 text-center text-base">{["loaded", "in_transit", "delivered"].includes(b.status) ? "☑" : "☐"}</td>
                    <td className="p-1.5 text-center text-base">{b.status === "delivered" ? "☑" : "☐"}</td>
                    <td className="p-1.5 font-bold">{shippers.get(b.shipper_id)?.name ?? "—"}</td>
                    <td className="p-1.5">
                      {c?.name ?? b.cargo_category}
                      {c?.hygiene && <span className="ml-1 font-bold">【衛生物：他の荷物と分ける】</span>}
                      <br />
                      {PACKAGING[b.packaging]} {b.pieces}個{b.cargo_description && `　${b.cargo_description}`}
                    </td>
                    <td className="p-1.5 text-right">{b.pallets}</td>
                    <td className="p-1.5 text-right">{b.weight_kg.toLocaleString()}kg</td>
                    <td className="p-1.5">
                      {b.pickup_address ? <strong>集荷：{b.pickup_address}</strong> : depot(trip.origin_depot_id)?.name}
                      <br />
                      {b.pickup_contact} {formatPhone(b.pickup_phone)}
                    </td>
                    <td className="p-1.5">
                      {b.dropoff_address ? <strong>配達：{b.dropoff_address}</strong> : depot(trip.dest_depot_id)?.name}
                      <br />
                      {b.dropoff_contact} {formatPhone(b.dropoff_phone)}
                    </td>
                    <td className="p-1.5">{BOOKING_STATUSES[b.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[10px] text-gray">
        積み込んだら「積」、受け渡したら「渡」に印をつけ、あとで OuRay の便の詳細から記録してください（写真も残せます）。
      </p>
    </div>
  );
}
