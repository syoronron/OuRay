import Link from "next/link";
import type { Trip } from "@/lib/data/carrier";
import { TRIP_STATUSES } from "@/lib/labels";
import { formatTripTimes } from "@/lib/time";

/** 便の状態のしるし */
export function StatusChip({ status }: { status: Trip["status"] }) {
  const style = {
    draft: "stripe-soft bg-white text-ink",
    published: "bg-ink text-white",
    closed: "bg-white text-ink",
    departed: "bg-white text-gray",
    completed: "bg-white text-gray",
    cancelled: "bg-white text-danger border-danger",
  }[status];
  return <span className={`border border-ink px-1.5 py-0.5 text-[11px] font-bold ${style}`}>{TRIP_STATUSES[status]}</span>;
}

/** パレット枠のマス：予約済み（差し色）・空き（斜線）。枠が多いときは縮める */
export function CapacityCells({ total, booked }: { total: number; booked: number }) {
  if (total === 0) return null;
  return (
    <div className="flex gap-0.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-3 flex-1 border border-ink ${i < booked ? "bg-accent" : "stripe bg-white"}`} />
      ))}
    </div>
  );
}

export function TripCard({
  trip,
  originName,
  destName,
  label,
}: {
  trip: Trip;
  originName: string;
  destName: string;
  /** 「帰り」「行き」「単発」 */
  label: string;
}) {
  const free = trip.capacity_pallets - trip.booked_pallets;
  return (
    <Link
      href={`/carrier/trips/${trip.id}`}
      className={`block border border-ink bg-white p-3 ${trip.status === "cancelled" ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="num text-sm font-semibold">{formatTripTimes(trip.depart_at, trip.arrive_at)}</p>
        <div className="flex items-center gap-1">
          <span className="border border-line px-1.5 py-0.5 text-[11px]">{label}</span>
          <StatusChip status={trip.status} />
        </div>
      </div>
      <p className="mt-1 font-bold">
        {originName} <span className="num text-gray">→</span> {destName}
      </p>
      {trip.capacity_pallets === 0 ? (
        <p className="mt-2 text-xs text-gray">売る枠なし（満載の便）</p>
      ) : (
        <div className="mt-2">
          <CapacityCells total={trip.capacity_pallets} booked={trip.booked_pallets} />
          <p className="num mt-1 flex justify-between text-xs text-gray">
            <span>
              空き {free} / {trip.capacity_pallets} 枠
              {trip.booking_count > 0 && `・予約 ${trip.booking_count}件`}
            </span>
            <span>1枠 {trip.price_per_pallet.toLocaleString()}円</span>
          </p>
        </div>
      )}
    </Link>
  );
}
