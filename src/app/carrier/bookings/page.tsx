import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader, SetupNotice } from "@/components/page-header";
import { requireAdminPage } from "@/lib/auth";
import { BOOKING_STATUSES, PACKAGING } from "@/lib/booking";
import { listCarrierBookings, type Booking, type Shipper } from "@/lib/data/bookings";
import {
  currentCarrierId,
  getCarrier,
  isDatabaseConfigured,
  listCategories,
  listDepots,
  listRoutes,
  listTrips,
  type CargoCategory,
  type Trip,
} from "@/lib/data/carrier";
import { yen } from "@/lib/money";
import { addDays, formatDateShort, formatPhone, formatTime, jstToDate, todayJst, toJst } from "@/lib/time";
import { tripCode } from "@/lib/trips/board";
import { decideBooking } from "../actions";
import { MissingCarrier } from "../notices";

/** 予約：承認待ち → これからの予約（確定）→ 最近終わったもの */
export default async function BookingsPage() {
  await requireAdminPage();
  if (!isDatabaseConfigured()) return <SetupNotice />;
  const carrierId = currentCarrierId();

  const today = todayJst();
  const [carrier, trips, { bookings, shippers }, routes, depots, categories] = await Promise.all([
    getCarrier(),
    listTrips(carrierId, jstToDate(addDays(today, -14), 0), jstToDate(addDays(today, 60), 0)),
    listCarrierBookings({ companyId: carrierId, from: jstToDate(addDays(today, -14), 0), to: jstToDate(addDays(today, 60), 0) }),
    listRoutes(carrierId),
    listDepots(carrierId),
    listCategories(),
  ]);
  if (!carrier) return <MissingCarrier />;

  const tripById = new Map(trips.map((t) => [t.id, t]));
  const routeNumber = new Map(routes.map((r) => [r.id, r.number]));
  const depotName = new Map(depots.map((d) => [d.id, d.name]));
  const byDepart = (a: Booking, b: Booking) =>
    tripById.get(a.trip_id)!.depart_at.localeCompare(tripById.get(b.trip_id)!.depart_at);

  const requested = bookings.filter((b) => b.status === "requested").sort(byDepart);
  const since = oneDayAgo();
  const upcoming = bookings
    .filter((b) => ["confirmed", "loaded", "in_transit"].includes(b.status) && new Date(tripById.get(b.trip_id)!.arrive_at).getTime() > since)
    .sort(byDepart);
  const ended = bookings
    .filter((b) => ["rejected", "cancelled", "trip_cancelled", "delivered"].includes(b.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);

  const card = (b: Booking, decide: boolean) => (
    <BookingCard
      key={b.id}
      booking={b}
      trip={tripById.get(b.trip_id)!}
      shipper={shippers.get(b.shipper_id)}
      code={tripCode(carrier.code, routeNumber.get(tripById.get(b.trip_id)!.route_id ?? "") ?? null)}
      depotName={depotName}
      categories={categories}
      decide={decide}
    />
  );

  return (
    <>
      <PageHeader eyebrow="BOOKINGS" title="予約">
        荷主からの申込です。内容（品目・重さ・寄り道の住所）を確認して、承認するとその便の予約が確定します。
      </PageHeader>

      <div className="grid gap-6">
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-bold">
            承認待ち
            <span className="num rounded-full bg-primary px-2 text-sm text-white">{requested.length}</span>
          </h2>
          <div className="grid gap-3">
            {requested.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray">承認待ちの申込はありません。</p>
            ) : (
              requested.map((b) => card(b, true))
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-bold">これからの予約</h2>
          <div className="grid gap-3">
            {upcoming.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray">確定した予約はまだありません。</p>
            ) : (
              upcoming.map((b) => card(b, false))
            )}
          </div>
        </section>

        {ended.length > 0 && (
          <section>
            <h2 className="mb-2 font-bold text-gray">最近終わったもの</h2>
            <div className="grid gap-3 opacity-75">{ended.map((b) => card(b, false))}</div>
          </section>
        )}
      </div>
    </>
  );
}

/** 到着から1日たった予約は「これからの予約」から外す */
function oneDayAgo(): number {
  return Date.now() - 86_400_000;
}

function BookingCard({
  booking: b,
  trip,
  shipper,
  code,
  depotName,
  categories,
  decide,
}: {
  booking: Booking;
  trip: Trip;
  shipper: Shipper | undefined;
  code: string;
  depotName: Map<string, string>;
  categories: CargoCategory[];
  decide: boolean;
}) {
  const category = categories.find((c) => c.code === b.cargo_category);
  const dep = toJst(trip.depart_at);
  return (
    <article className="rounded-2xl bg-white p-4">
      <Link href={`/carrier/trips/${trip.id}`} className="flex flex-wrap items-baseline gap-x-3 rounded-[5px] bg-paper px-3 py-2 text-sm">
        <span className="num font-bold text-navy">{code}</span>
        <span className="num">
          {formatDateShort(dep.date)} {formatTime(dep.minutes)}
        </span>
        <span>
          {depotName.get(trip.origin_depot_id)} → {depotName.get(trip.dest_depot_id)}
        </span>
      </Link>

      <div className="mt-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">
            {shipper?.name ?? "—"}
            {shipper?.status === "pending" && (
              <span className="mt-1 block w-fit rounded-[4px] border border-warn px-1.5 text-[11px] font-medium text-warn">初めての荷主（審査待ち）</span>
            )}
          </p>
          <p className="num text-sm text-gray">
            {shipper?.contact_name} {shipper?.phone && <a href={`tel:${shipper.phone}`} className="text-navy underline">{formatPhone(shipper.phone)}</a>}
          </p>
        </div>
        <span className="shrink-0 rounded-[5px] border border-navy px-2 py-0.5 text-xs text-navy">{BOOKING_STATUSES[b.status]}</span>
      </div>

      <dl className="num mt-3 grid grid-cols-[5.5rem_1fr] gap-y-1 text-sm">
        <dt className="text-gray">荷物</dt>
        <dd>
          {category?.name ?? b.cargo_category}
          {category?.hygiene && <span className="ml-1 rounded-[4px] border border-navy px-1 text-[10px] text-navy">衛生物</span>}
          <br />
          {PACKAGING[b.packaging]} {b.pieces}個・{b.pallets}枠・{b.weight_kg.toLocaleString()}kg
          {b.cargo_description && <span className="block text-gray">{b.cargo_description}</span>}
        </dd>
        <dt className="text-gray">持ち込み</dt>
        <dd>
          {b.pickup_address ? <strong>集荷：{b.pickup_address}</strong> : `${depotName.get(trip.origin_depot_id)}に持ち込み`}
          <span className="block text-gray">
            {b.pickup_contact}（{formatPhone(b.pickup_phone)}）
          </span>
        </dd>
        <dt className="text-gray">受け取り</dt>
        <dd>
          {b.dropoff_address ? <strong>配達：{b.dropoff_address}</strong> : `${depotName.get(trip.dest_depot_id)}で受け取り`}
          <span className="block text-gray">
            {b.dropoff_contact}（{formatPhone(b.dropoff_phone)}）
          </span>
        </dd>
        <dt className="text-gray">金額</dt>
        <dd>
          運賃 {yen(b.freight_amount)}円（税抜）・手数料 {yen(b.fee_amount)}円
          <span className="block font-bold">受取 {yen(b.freight_amount - b.fee_amount)}円</span>
        </dd>
      </dl>

      {decide && (
        <div className="mt-4 grid gap-2 border-t border-line pt-4">
          <ActionForm action={decideBooking}>
            <input type="hidden" name="id" value={b.id} />
            <input type="hidden" name="decision" value="confirmed" />
            <SubmitButton variant="accent" className="w-full" pendingText="処理中…">
              承認して予約を確定する
            </SubmitButton>
          </ActionForm>
          <details>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center text-sm text-gray underline underline-offset-4">
              お断りする
            </summary>
            <ActionForm action={decideBooking} confirm="この申込をお断りします。よろしいですか？" className="mt-2 grid gap-2">
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="decision" value="rejected" />
              <input name="message" required maxLength={200} placeholder="理由（荷主のページに表示されます）" className="field" />
              <SubmitButton variant="outline" pendingText="処理中…">
                お断りする
              </SubmitButton>
            </ActionForm>
          </details>
        </div>
      )}
    </article>
  );
}
