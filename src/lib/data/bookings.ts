import "server-only";

import { db } from "@/lib/data/carrier";
import type { BookingStatus, Packaging } from "@/lib/booking";

/**
 * 予約の読み込み（サーバー専用）。
 * 荷主のページは access_token（推測できない値）でだけ開ける。
 * 運送会社の画面は、自社の便の予約だけを読む。
 */

export type Booking = {
  id: string;
  trip_id: string;
  shipper_id: string;
  status: BookingStatus;
  cargo_category: string;
  cargo_description: string | null;
  packaging: Packaging;
  pieces: number;
  pallets: number;
  weight_kg: number;
  pickup_contact: string;
  pickup_phone: string;
  dropoff_contact: string;
  dropoff_phone: string;
  pickup_address: string | null;
  dropoff_address: string | null;
  unit_price: number;
  freight_amount: number;
  detour_amount: number;
  fee_amount: number;
  created_at: string;
  decided_at: string | null;
  cancelled_at: string | null;
};

export type BookingEvent = {
  kind: string;
  message: string | null;
  created_by: "carrier" | "shipper" | "admin" | "system";
  created_at: string;
};

export type Shipper = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  status: "pending" | "approved" | "suspended";
};

const BOOKING_COLUMNS =
  "id, trip_id, shipper_id, status, cargo_category, cargo_description, packaging, pieces, pallets, weight_kg, pickup_contact, pickup_phone, dropoff_contact, dropoff_phone, pickup_address, dropoff_address, unit_price, freight_amount, detour_amount, fee_amount, created_at, decided_at, cancelled_at";

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what}の読み込みに失敗しました: ${error.message}`);
}

/** 荷主の予約確認ページ用：予約・記録・荷主 */
export async function getBookingByToken(
  token: string,
): Promise<{ booking: Booking; events: BookingEvent[]; shipper: Shipper } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data, error } = await db().from("bookings").select(BOOKING_COLUMNS).eq("access_token", token).maybeSingle();
  if (error) fail("予約", error);
  if (!data) return null;
  const booking = data as Booking;
  const [events, shipper] = await Promise.all([
    db()
      .from("booking_events")
      .select("kind, message, created_by, created_at")
      .eq("booking_id", booking.id)
      .order("created_at"),
    db().from("companies").select("id, name, contact_name, phone, email, status").eq("id", booking.shipper_id).single(),
  ]);
  if (events.error) fail("予約の記録", events.error);
  if (shipper.error) fail("荷主", shipper.error);
  return { booking, events: events.data as BookingEvent[], shipper: shipper.data as Shipper };
}

/** 運送会社の画面用：自社の便の予約（便の出発が from 以降）と荷主 */
export async function listCarrierBookings(
  tripIds: string[],
): Promise<{ bookings: Booking[]; shippers: Map<string, Shipper> }> {
  if (tripIds.length === 0) return { bookings: [], shippers: new Map() };
  const all: Booking[] = [];
  // URL が長くなりすぎないよう、便を分けて読む
  for (let i = 0; i < tripIds.length; i += 100) {
    const { data, error } = await db()
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .in("trip_id", tripIds.slice(i, i + 100))
      .order("created_at");
    if (error) fail("予約", error);
    all.push(...(data as Booking[]));
  }
  const shipperIds = [...new Set(all.map((b) => b.shipper_id))];
  const shippers = new Map<string, Shipper>();
  if (shipperIds.length > 0) {
    const { data, error } = await db()
      .from("companies")
      .select("id, name, contact_name, phone, email, status")
      .in("id", shipperIds);
    if (error) fail("荷主", error);
    for (const s of data as Shipper[]) shippers.set(s.id, s);
  }
  return { bookings: all, shippers };
}
