import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_CARRIER_ID } from "@/lib/demo";
import type { BodyType, Direction, PlateKind, Temperature, TripStatus } from "@/lib/labels";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseTime } from "@/lib/time";

/**
 * 運送会社のデータの読み込み（サーバー専用）。
 * ログイン機能（P5）ができるまでは、デモの運送会社（seed.sql）だけを扱う。
 * 読み込みはすべて company_id で絞る（P5・P7 で会社が増えても、他社のデータが混ざらないように）。
 */

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("データベースが設定されていません。");
  }
}

export function db(): SupabaseClient {
  const client = getSupabaseAdmin();
  if (!client) throw new DatabaseNotConfiguredError();
  return client;
}

export function isDatabaseConfigured(): boolean {
  return getSupabaseAdmin() !== null;
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what}の読み込みに失敗しました: ${error.message}`);
}

const toMinutes = (v: string | null) => (v ? parseTime(v) : null);

// ---------- 型 ----------

export type Carrier = { id: string; name: string; carrier_license_no: string | null };

export type Area = { id: string; name: string };

export type Depot = {
  id: string;
  area_id: string;
  name: string;
  address: string;
  open: number | null;
  close: number | null;
  has_forklift: boolean;
  note: string | null;
};

export type Vehicle = {
  id: string;
  name: string;
  plate_number: string | null;
  plate_kind: PlateKind;
  body_type: BodyType;
  bed_length_mm: number | null;
  bed_width_mm: number | null;
  bed_height_mm: number | null;
  max_load_kg: number;
  pallet_slots: number;
  has_power_gate: boolean;
  temperature: Temperature;
};

export type Route = {
  id: string;
  vehicle_id: string;
  origin_depot_id: string;
  dest_depot_id: string;
  direction: Direction;
  paired_route_id: string | null;
  weekdays: number[];
  depart: number;
  duration_minutes: number;
  capacity_pallets: number;
  capacity_kg: number;
  price_per_pallet: number;
  booking_cutoff_hours: number;
  requires_approval: boolean;
  accepted_categories: string[];
  detour_max_km: number;
  detour_fee: number;
  active_from: string;
  active_until: string | null;
};

export type Trip = {
  id: string;
  route_id: string | null;
  vehicle_id: string;
  origin_depot_id: string;
  dest_depot_id: string;
  depart_at: string;
  arrive_at: string;
  capacity_pallets: number;
  capacity_kg: number;
  price_per_pallet: number;
  booking_cutoff_at: string;
  requires_approval: boolean;
  accepted_categories: string[];
  detour_max_km: number;
  detour_fee: number;
  status: TripStatus;
  /** 枠を使っている予約の合計 */
  booked_pallets: number;
  booked_kg: number;
  booking_count: number;
};

export type CargoCategory = {
  code: string;
  name: string;
  hygiene: boolean;
  is_waste: boolean;
};

// ---------- 読み込み ----------

export async function getCarrier(): Promise<Carrier | null> {
  const { data, error } = await db()
    .from("companies")
    .select("id, name, carrier_license_no")
    .eq("id", DEMO_CARRIER_ID)
    .eq("is_carrier", true)
    .maybeSingle();
  if (error) fail("運送会社", error);
  return data;
}

/** 運送会社が見つからなければエラー（サーバーアクション用） */
export async function requireCarrier(): Promise<Carrier> {
  const carrier = await getCarrier();
  if (!carrier) throw new Error("デモの運送会社が見つかりません。supabase/seed.sql を実行してください。");
  return carrier;
}

export async function listAreas(): Promise<Area[]> {
  const { data, error } = await db().from("areas").select("id, name").order("sort_order").order("name");
  if (error) fail("エリア", error);
  return data;
}

export async function listCategories(): Promise<CargoCategory[]> {
  const { data, error } = await db()
    .from("cargo_categories")
    .select("code, name, hygiene, is_waste")
    .order("sort_order");
  if (error) fail("品目", error);
  return data;
}

const DEPOT_COLUMNS = "id, area_id, name, address, open_time, close_time, has_forklift, note";
type DepotRow = Omit<Depot, "open" | "close"> & { open_time: string | null; close_time: string | null };
const toDepot = ({ open_time, close_time, ...d }: DepotRow): Depot => ({
  ...d,
  open: toMinutes(open_time),
  close: toMinutes(close_time),
});

export async function listDepots(companyId: string): Promise<Depot[]> {
  const { data, error } = await db().from("depots").select(DEPOT_COLUMNS).eq("company_id", companyId).order("created_at");
  if (error) fail("拠点", error);
  return (data as DepotRow[]).map(toDepot);
}

export async function getDepot(companyId: string, id: string): Promise<Depot | null> {
  const { data, error } = await db()
    .from("depots")
    .select(DEPOT_COLUMNS)
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("拠点", error);
  return data ? toDepot(data as DepotRow) : null;
}

const VEHICLE_COLUMNS =
  "id, name, plate_number, plate_kind, body_type, bed_length_mm, bed_width_mm, bed_height_mm, max_load_kg, pallet_slots, has_power_gate, temperature";

export async function listVehicles(companyId: string): Promise<Vehicle[]> {
  const { data, error } = await db().from("vehicles").select(VEHICLE_COLUMNS).eq("company_id", companyId).order("created_at");
  if (error) fail("車両", error);
  return data as Vehicle[];
}

export async function getVehicle(companyId: string, id: string): Promise<Vehicle | null> {
  const { data, error } = await db()
    .from("vehicles")
    .select(VEHICLE_COLUMNS)
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("車両", error);
  return data as Vehicle | null;
}

const ROUTE_COLUMNS =
  "id, vehicle_id, origin_depot_id, dest_depot_id, direction, paired_route_id, weekdays, depart_time, duration_minutes, capacity_pallets, capacity_kg, price_per_pallet, booking_cutoff_hours, requires_approval, accepted_categories, detour_max_km, detour_fee, active_from, active_until";
type RouteRow = Omit<Route, "depart"> & { depart_time: string };
const toRoute = ({ depart_time, ...r }: RouteRow): Route => ({ ...r, depart: toMinutes(depart_time) ?? 0 });

export async function listRoutes(companyId: string): Promise<Route[]> {
  const { data, error } = await db()
    .from("routes")
    .select(ROUTE_COLUMNS)
    .eq("company_id", companyId)
    .order("created_at");
  if (error) fail("定期ルート", error);
  return (data as RouteRow[]).map(toRoute);
}

export async function getRoute(companyId: string, id: string): Promise<Route | null> {
  const { data, error } = await db()
    .from("routes")
    .select(ROUTE_COLUMNS)
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("定期ルート", error);
  return data ? toRoute(data as RouteRow) : null;
}

const TRIP_COLUMNS =
  "id, route_id, vehicle_id, origin_depot_id, dest_depot_id, depart_at, arrive_at, capacity_pallets, capacity_kg, price_per_pallet, booking_cutoff_at, requires_approval, accepted_categories, detour_max_km, detour_fee, status, bookings(pallets, weight_kg, status)";

/** 予約の状態のうち「枠を使っている」もの（DB の booking_holds_capacity と同じ） */
const HOLDING = new Set(["requested", "confirmed", "loaded", "in_transit", "delivered"]);

type TripRow = Omit<Trip, "booked_pallets" | "booked_kg" | "booking_count"> & {
  bookings: { pallets: number; weight_kg: number; status: string }[] | null;
};
function toTrip({ bookings, ...t }: TripRow): Trip {
  const holding = (bookings ?? []).filter((b) => HOLDING.has(b.status));
  return {
    ...t,
    booked_pallets: holding.reduce((s, b) => s + b.pallets, 0),
    booked_kg: holding.reduce((s, b) => s + b.weight_kg, 0),
    booking_count: holding.length,
  };
}

/** 出発日時が [from, to) の便 */
export async function listTrips(companyId: string, from: Date, to: Date): Promise<Trip[]> {
  const { data, error } = await db()
    .from("trips")
    .select(TRIP_COLUMNS)
    .eq("company_id", companyId)
    .gte("depart_at", from.toISOString())
    .lt("depart_at", to.toISOString())
    .order("depart_at");
  if (error) fail("便", error);
  return (data as unknown as TripRow[]).map(toTrip);
}

export async function getTrip(companyId: string, id: string): Promise<Trip | null> {
  const { data, error } = await db()
    .from("trips")
    .select(TRIP_COLUMNS)
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("便", error);
  return data ? toTrip(data as unknown as TripRow) : null;
}
