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

/** 荷主の予約確認ページ用：予約と記録（記録は予約の中に入れて1回で読む） */
export async function getBookingByToken(token: string): Promise<{ booking: Booking; events: BookingEvent[] } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data, error } = await db()
    .from("bookings")
    .select(`${BOOKING_COLUMNS}, booking_events(kind, message, created_by, created_at)`)
    .eq("access_token", token)
    .maybeSingle();
  if (error) fail("予約", error);
  if (!data) return null;
  const { booking_events, ...booking } = data as unknown as Booking & { booking_events: BookingEvent[] | null };
  const events = (booking_events ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { booking: booking as Booking, events };
}

export async function getShipper(id: string): Promise<Shipper | null> {
  const { data, error } = await db()
    .from("companies")
    .select("id, name, contact_name, phone, email, status")
    .eq("id", id)
    .maybeSingle();
  if (error) fail("荷主", error);
  return data as Shipper | null;
}

/**
 * 運送会社の画面用：自社の便の予約と荷主。
 * 便（期間 or 1便）の中に予約を入れて1回で読み、荷主は同時に読む（待ち時間を減らすため）。
 * 荷主は今は全件を読む（数が少ないうちはこの方が速い。増えたら絞り込みに変える）。
 */
export async function listCarrierBookings(
  where: { companyId: string; from: Date; to: Date } | { companyId: string; tripId: string },
): Promise<{ bookings: Booking[]; shippers: Map<string, Shipper> }> {
  let trips = db().from("trips").select(`id, bookings(${BOOKING_COLUMNS})`).eq("company_id", where.companyId);
  trips = "tripId" in where
    ? trips.eq("id", where.tripId)
    : trips.gte("depart_at", where.from.toISOString()).lt("depart_at", where.to.toISOString());
  const [tripRows, shipperRows] = await Promise.all([
    trips,
    db().from("companies").select("id, name, contact_name, phone, email, status").eq("is_shipper", true),
  ]);
  if (tripRows.error) fail("予約", tripRows.error);
  if (shipperRows.error) fail("荷主", shipperRows.error);
  const bookings = (tripRows.data as unknown as { bookings: Booking[] | null }[])
    .flatMap((t) => t.bookings ?? [])
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { bookings, shippers: new Map((shipperRows.data as Shipper[]).map((x) => [x.id, x])) };
}
