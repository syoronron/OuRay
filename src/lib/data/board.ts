import "server-only";

import { db } from "@/lib/data/carrier";
import { parseTime } from "@/lib/time";
import type { TripStatus } from "@/lib/labels";

/**
 * 荷主向けの便の一覧（公開ページ）の読み込み。
 * 下書きの便・審査の済んでいない運送会社の便は出さない。
 * 車両のナンバー・ドライバー・他の荷主の予約内容は読み込まない（予約は枠数の合計だけ）。
 */

export type BoardTrip = {
  id: string;
  company_id: string;
  route_id: string | null;
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
  booked_pallets: number;
  booked_kg: number;
};

export type BoardDepot = {
  id: string;
  company_id: string;
  area_id: string;
  name: string;
  address: string;
  open: number | null;
  close: number | null;
  has_forklift: boolean;
  note: string | null;
};

export type BoardCarrier = { id: string; name: string; code: string | null; carrier_license_no: string | null };
export type BoardRoute = { id: string; number: number | null; direction: "outbound" | "return" };
export type BoardArea = { id: string; name: string };
export type BoardCategory = { code: string; name: string; hygiene: boolean; is_waste: boolean };

export type Board = {
  trips: BoardTrip[];
  depots: Map<string, BoardDepot>;
  carriers: Map<string, BoardCarrier>;
  routes: Map<string, BoardRoute>;
  areas: BoardArea[];
  categories: BoardCategory[];
};

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what}の読み込みに失敗しました: ${error.message}`);
}

const HOLDING = new Set(["requested", "confirmed", "loaded", "in_transit", "delivered"]);
const TRIP_COLUMNS =
  "id, company_id, route_id, origin_depot_id, dest_depot_id, depart_at, arrive_at, capacity_pallets, capacity_kg, price_per_pallet, booking_cutoff_at, requires_approval, accepted_categories, detour_max_km, detour_fee, status, bookings(pallets, weight_kg, status)";

type TripRow = Omit<BoardTrip, "booked_pallets" | "booked_kg"> & {
  bookings: { pallets: number; weight_kg: number; status: string }[] | null;
};
function toTrip({ bookings, ...t }: TripRow): BoardTrip {
  const holding = (bookings ?? []).filter((b) => HOLDING.has(b.status));
  return {
    ...t,
    booked_pallets: holding.reduce((s, b) => s + b.pallets, 0),
    booked_kg: holding.reduce((s, b) => s + b.weight_kg, 0),
  };
}

/** 一覧に必要な、便以外のデータ（拠点・運送会社・ルート・エリア・品目） */
async function loadLookups(): Promise<Omit<Board, "trips">> {
  const [depots, carriers, routes, areas, categories] = await Promise.all([
    db().from("depots").select("id, company_id, area_id, name, address, open_time, close_time, has_forklift, note"),
    db().from("companies").select("id, name, code, carrier_license_no").eq("is_carrier", true).eq("status", "approved"),
    db().from("routes").select("id, number, direction"),
    db().from("areas").select("id, name").order("sort_order").order("name"),
    db().from("cargo_categories").select("code, name, hygiene, is_waste").order("sort_order"),
  ]);
  for (const [what, r] of [
    ["拠点", depots],
    ["運送会社", carriers],
    ["定期ルート", routes],
    ["エリア", areas],
    ["品目", categories],
  ] as const) {
    if (r.error) fail(what, r.error);
  }
  type DepotRow = Omit<BoardDepot, "open" | "close"> & { open_time: string | null; close_time: string | null };
  return {
    depots: new Map(
      (depots.data as DepotRow[]).map(({ open_time, close_time, ...d }) => [
        d.id,
        { ...d, open: open_time ? parseTime(open_time) : null, close: close_time ? parseTime(close_time) : null },
      ]),
    ),
    carriers: new Map((carriers.data as BoardCarrier[]).map((c) => [c.id, c])),
    routes: new Map((routes.data as BoardRoute[]).map((r) => [r.id, r])),
    areas: areas.data as BoardArea[],
    categories: categories.data as BoardCategory[],
  };
}

/** 出発日時が [from, to) の便（下書き以外） */
export async function loadBoard(from: Date, to: Date): Promise<Board> {
  const [lookups, trips] = await Promise.all([
    loadLookups(),
    db()
      .from("trips")
      .select(TRIP_COLUMNS)
      .neq("status", "draft")
      .gte("depart_at", from.toISOString())
      .lt("depart_at", to.toISOString())
      .order("depart_at"),
  ]);
  if (trips.error) fail("便", trips.error);
  return {
    ...lookups,
    trips: (trips.data as unknown as TripRow[]).map(toTrip).filter((t) => lookups.carriers.has(t.company_id)),
  };
}

/** 便1件（下書き・未審査の運送会社の便は null） */
export async function loadBoardTrip(id: string): Promise<(Omit<Board, "trips"> & { trip: BoardTrip }) | null> {
  const [lookups, trip] = await Promise.all([
    loadLookups(),
    db().from("trips").select(TRIP_COLUMNS).eq("id", id).neq("status", "draft").maybeSingle(),
  ]);
  if (trip.error) fail("便", trip.error);
  if (!trip.data) return null;
  const t = toTrip(trip.data as unknown as TripRow);
  if (!lookups.carriers.has(t.company_id)) return null;
  return { ...lookups, trip: t };
}

/**
 * 指定の時刻より後で、荷主が予約できる（公開中・締切前の）いちばん近い便の出発日時。
 * 一覧が空のときに「次の便がある日」を案内するため。審査の済んでいない運送会社の便は除く。
 */
export async function nextOpenDeparture(after: Date): Promise<string | null> {
  const { data, error } = await db()
    .from("trips")
    .select("depart_at, company_id")
    .eq("status", "published")
    .gt("booking_cutoff_at", new Date().toISOString())
    .gte("depart_at", after.toISOString())
    .order("depart_at")
    .limit(20);
  if (error) fail("便", error);
  if (!data || data.length === 0) return null;
  const { data: carriers, error: e2 } = await db()
    .from("companies")
    .select("id")
    .eq("is_carrier", true)
    .eq("status", "approved")
    .in("id", [...new Set(data.map((t) => t.company_id as string))]);
  if (e2) fail("運送会社", e2);
  const ok = new Set((carriers ?? []).map((c) => c.id as string));
  return (data.find((t) => ok.has(t.company_id as string))?.depart_at as string | undefined) ?? null;
}
