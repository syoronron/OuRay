import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Section, SetupNotice } from "@/components/page-header";
import { StatusBadge } from "@/components/trip-board";
import { loadBoardTrip } from "@/lib/data/board";
import { isDatabaseConfigured } from "@/lib/data/carrier";
import { DIRECTIONS } from "@/lib/labels";
import { formatDateShort, formatDateTime, formatDuration, formatTime, toJst } from "@/lib/time";
import { boardStatus, isBookable, tripCode } from "@/lib/trips/board";
import { CapacityCells } from "../../carrier/trip-card";

/** 便の詳細（荷主向け）。予約は P2 で作る */
export default async function BoardTripPage({ params }: PageProps<"/trips/[id]">) {
  const { id } = await params;
  await connection();
  if (!isDatabaseConfigured()) return <SetupNotice />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadBoardTrip(id);
  if (!data) notFound();
  const { trip, depots, carriers, routes, areas, categories } = data;

  const carrier = carriers.get(trip.company_id)!;
  const route = trip.route_id ? routes.get(trip.route_id) : undefined;
  const origin = depots.get(trip.origin_depot_id);
  const dest = depots.get(trip.dest_depot_id);
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const status = boardStatus(trip, new Date());
  const dep = toJst(trip.depart_at);
  const arr = toJst(trip.arrive_at);
  const free = Math.max(trip.capacity_pallets - trip.booked_pallets, 0);
  const freeKg = Math.max(trip.capacity_kg - trip.booked_kg, 0);
  const minutes = Math.round((new Date(trip.arrive_at).getTime() - new Date(trip.depart_at).getTime()) / 60_000);
  const categoryByCode = new Map(categories.map((c) => [c.code, c]));

  return (
    <>
      <Link href={`/trips?date=${dep.date}`} className="mb-3 inline-flex min-h-11 items-center text-sm text-gray">
        ← 出発便一覧
      </Link>

      <div className="rounded-2xl bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
          <p className="num text-xl font-bold text-navy">{tripCode(carrier.code, route?.number ?? null)}</p>
          <StatusBadge status={status} />
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-5 py-5">
          <div>
            <p className="text-xs text-gray">出発</p>
            <p className="num text-[34px] font-normal">{formatTime(dep.minutes)}</p>
            <p className="num text-xs text-gray">{formatDateShort(dep.date)}</p>
            <p className="mt-1 font-bold">{origin?.name}</p>
            <p className="text-xs text-gray">{origin && areaName.get(origin.area_id)}</p>
          </div>
          <p className="num pt-6 text-center text-xs text-gray">
            →
            <br />
            {formatDuration(minutes)}
          </p>
          <div className="text-right">
            <p className="text-xs text-gray">到着</p>
            <p className="num text-[34px] font-normal">{formatTime(arr.minutes)}</p>
            <p className="num text-xs text-gray">{formatDateShort(arr.date)}</p>
            <p className="mt-1 font-bold">{dest?.name}</p>
            <p className="text-xs text-gray">{dest && areaName.get(dest.area_id)}</p>
          </div>
        </div>
        <div className="border-t border-line px-5 py-4 text-sm">
          <p>
            {carrier.name}
            {route && <span className="ml-2 text-xs text-gray">{DIRECTIONS[route.direction]}便</span>}
          </p>
          {carrier.carrier_license_no && <p className="num text-xs text-gray">一般貨物自動車運送事業 許可番号 {carrier.carrier_license_no}</p>}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Section title="空きと料金">
          <CapacityCells total={trip.capacity_pallets} booked={trip.booked_pallets} />
          <p className="num mt-2 text-sm">
            空き <span className="text-xl font-bold">{free}</span> 枠（あと {freeKg.toLocaleString()}kg まで）
          </p>
          <p className="num mt-1 text-sm">
            1パレット枠 <span className="text-xl font-bold">{trip.price_per_pallet.toLocaleString()}</span> 円（税抜）
          </p>
          {trip.detour_max_km > 0 && (
            <p className="num mt-1 text-sm">
              寄り道（{trip.detour_max_km}km以内の施設などで集荷・配達） 1か所 {trip.detour_fee.toLocaleString()}円
            </p>
          )}
          <p className="num mt-3 text-xs text-gray">
            予約の締切：{formatDateTime(trip.booking_cutoff_at)}
            {trip.requires_approval && "・運送会社が承認してから確定します"}
          </p>
        </Section>

        <Section title="運べる荷物">
          <ul className="grid gap-1 text-sm">
            {trip.accepted_categories.map((code) => {
              const c = categoryByCode.get(code);
              if (!c || c.is_waste) return null;
              return (
                <li key={code} className="flex items-center gap-2">
                  <span className="inline-block size-1.5 rounded-full bg-navy" aria-hidden />
                  {c.name}
                  {c.hygiene && <span className="rounded-[4px] border border-navy px-1.5 text-[10px] font-medium text-navy">衛生物</span>}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-gray">
            危険物・生き物・現金や貴重品・廃棄物（使用済みの紙おむつ等）は運べません。
          </p>
        </Section>

        {[
          ["持ち込む場所", origin],
          ["受け取る場所", dest],
        ].map(([label, d]) =>
          d && typeof d !== "string" ? (
            <Section key={label as string} title={label as string}>
              <p className="font-bold">{d.name}</p>
              <p className="text-sm text-gray">{d.address}</p>
              <p className="num mt-1 text-xs text-gray">
                {d.open !== null && d.close !== null && `荷受け ${formatTime(d.open)}–${formatTime(d.close)}`}
                {d.has_forklift && "・フォークリフトあり"}
              </p>
              {d.note && <p className="mt-1 text-xs">{d.note}</p>}
            </Section>
          ) : null,
        )}
      </div>

      <div className="mt-5">
        <button
          type="button"
          disabled
          className="min-h-14 w-full rounded-[10px] bg-primary font-bold text-white disabled:opacity-40"
        >
          {isBookable(status) ? "この便を予約する（準備中）" : `予約できません（${status.label}）`}
        </button>
        <p className="mt-2 text-center text-xs text-gray">
          運送の契約は、荷主さまと{carrier.name}の間で結びます。OuRay は予約の仲介をします。
        </p>
      </div>
    </>
  );
}
