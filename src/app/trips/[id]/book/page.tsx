import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SetupNotice } from "@/components/page-header";
import { StatusBadge } from "@/components/trip-board";
import { loadBoardTrip } from "@/lib/data/board";
import { isDatabaseConfigured } from "@/lib/data/carrier";
import { formatDateShort, formatDateTime, formatTime, toJst } from "@/lib/time";
import { boardStatus, isBookable, tripCode } from "@/lib/trips/board";
import { BookingForm } from "./booking-form";

/** 予約の申込（荷主向け） */
export default async function BookPage({ params }: PageProps<"/trips/[id]/book">) {
  const { id } = await params;
  await connection();
  if (!isDatabaseConfigured()) return <SetupNotice />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadBoardTrip(id);
  if (!data) notFound();
  const { trip, depots, carriers, routes, categories } = data;
  const carrier = carriers.get(trip.company_id)!;
  const route = trip.route_id ? routes.get(trip.route_id) : undefined;
  const status = boardStatus(trip, new Date());
  const origin = depots.get(trip.origin_depot_id);
  const dest = depots.get(trip.dest_depot_id);
  const dep = toJst(trip.depart_at);
  const arr = toJst(trip.arrive_at);

  return (
    <>
      <Link href={`/trips/${trip.id}`} className="mb-3 inline-flex min-h-11 items-center text-sm text-gray">
        ← 便の詳細
      </Link>
      <p className="num text-[11px] font-medium tracking-[0.2em] text-gray">BOOKING</p>
      <h1 className="mt-1 text-[30px] leading-tight font-normal md:text-[40px]">予約の申込</h1>

      {/* 申し込む便（搭乗券のような1行） */}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-white px-5 py-4">
        <span className="num text-lg font-bold text-navy">{tripCode(carrier.code, route?.number ?? null)}</span>
        <span className="num">
          {formatDateShort(dep.date)} {formatTime(dep.minutes)} {origin?.name} → {formatTime(arr.minutes)} {dest?.name}
        </span>
        <span className="text-sm text-gray">{carrier.name}</span>
        <span className="ml-auto">
          <StatusBadge status={status} />
        </span>
      </div>

      {isBookable(status) ? (
        <div className="mt-4">
          <p className="mb-4 text-sm text-gray">
            締切：<span className="num">{formatDateTime(trip.booking_cutoff_at)}</span>
          </p>
          <BookingForm
            trip={{
              id: trip.id,
              freePallets: Math.max(trip.capacity_pallets - trip.booked_pallets, 0),
              freeKg: Math.max(trip.capacity_kg - trip.booked_kg, 0),
              pricePerPallet: trip.price_per_pallet,
              detourMaxKm: trip.detour_max_km,
              detourFee: trip.detour_fee,
              originName: origin?.name ?? "出発の拠点",
              destName: dest?.name ?? "到着の拠点",
              categories: categories
                .filter((c) => !c.is_waste && trip.accepted_categories.includes(c.code))
                .map((c) => ({ code: c.code, name: c.name, hygiene: c.hygiene })),
            }}
          />
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-white p-6 text-sm">
          <p className="font-bold">この便は予約できません（{status.label}）</p>
          <Link href={`/trips?date=${dep.date}`} className="mt-3 inline-flex min-h-11 items-center text-navy underline underline-offset-4">
            ほかの便をさがす
          </Link>
        </div>
      )}
    </>
  );
}
