import Link from "next/link";
import type { Trip } from "@/lib/data/carrier";
import { TRIP_STATUSES } from "@/lib/labels";
import { formatTripTimes } from "@/lib/time";

/** 便の状態のしるし */
export function StatusChip({ status }: { status: Trip["status"] }) {
  const style = {
    draft: "border-dashed border-gray text-gray",
    published: "border-navy text-navy",
    closed: "border-ink text-ink",
    departed: "border-mist text-gray",
    completed: "border-mist text-gray",
    cancelled: "border-danger text-danger",
  }[status];
  return <span className={`rounded-[5px] border bg-white px-2 py-0.5 text-xs ${style}`}>{TRIP_STATUSES[status]}</span>;
}

/** パレット枠のマス：予約済み（差し色）・空き（斜線）。枠が多いときは縮める */
export function CapacityCells({ total, booked }: { total: number; booked: number }) {
  if (total === 0) return null;
  return (
    <div className="flex gap-0.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-3 flex-1 rounded-[2px] border ${i < booked ? "border-primary bg-primary" : "stripe border-mist bg-white"}`} />
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
      className={`block rounded-xl bg-white p-4 ${trip.status === "cancelled" ? "opacity-60" : ""}`}
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
