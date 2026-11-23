import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader, Section, SetupNotice } from "@/components/page-header";
import { requireAdminPage } from "@/lib/auth";
import {
  getCarrier,
  getTrip,
  isDatabaseConfigured,
  listCategories,
  listDepots,
  listRoutes,
  listVehicles,
} from "@/lib/data/carrier";
import { BODY_TYPES, DIRECTIONS } from "@/lib/labels";
import { BOOKING_STATUSES } from "@/lib/booking";
import { listCarrierBookings } from "@/lib/data/bookings";
import { formatDateTime, formatDuration, formatTripTimes, formatDateShort, toJst } from "@/lib/time";
import { deleteTrip, setTripStatus, updateTrip } from "../../actions";
import { MissingCarrier } from "../../notices";
import { CapacityCells, StatusChip } from "../../trip-card";
import { CategoryChecks, Field, NumberInput } from "../../trip-fields";

/** 便の詳細：状態を変える（公開・受付終了・運休）、空きと料金を調整する */
export default async function TripPage({ params }: PageProps<"/carrier/trips/[id]">) {
  const { id } = await params;
  await requireAdminPage();
  if (!isDatabaseConfigured()) return <SetupNotice />;
  const carrier = await getCarrier();
  if (!carrier) return <MissingCarrier />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const trip = await getTrip(carrier.id, id);
  if (!trip) notFound();
  const [depots, vehicles, routes, categories, { bookings, shippers }] = await Promise.all([
    listDepots(carrier.id),
    listVehicles(carrier.id),
    listRoutes(carrier.id),
    listCategories(),
    listCarrierBookings([trip.id]),
  ]);
  const depot = (depotId: string) => depots.find((d) => d.id === depotId)?.name ?? "—";
  const vehicle = vehicles.find((v) => v.id === trip.vehicle_id);
  const route = routes.find((r) => r.id === trip.route_id);
  const durationMinutes = Math.round((new Date(trip.arrive_at).getTime() - new Date(trip.depart_at).getTime()) / 60_000);
  const editable = !["departed", "completed", "cancelled"].includes(trip.status);
  const categoryName = new Map(categories.map((c) => [c.code, c.name]));

  return (
    <>
      <Link href={`/carrier?week=${toJst(trip.depart_at).date}`} className="mb-3 inline-flex min-h-11 items-center text-sm text-gray">
        ← 便の一覧
      </Link>
      <PageHeader eyebrow="TRIP" title={`${depot(trip.origin_depot_id)} → ${depot(trip.dest_depot_id)}`}>
        <span className="num">
          {formatDateShort(toJst(trip.depart_at).date)} {formatTripTimes(trip.depart_at, trip.arrive_at)}（{formatDuration(durationMinutes)}）
        </span>
      </PageHeader>

      <div className="grid gap-4">
        <Section title="状態" aside={<StatusChip status={trip.status} />}>
          <dl className="grid grid-cols-[6.5rem_1fr] gap-y-1 text-sm">
            <dt className="text-gray">種類</dt>
            <dd>{route ? `定期ルート（${DIRECTIONS[route.direction]}）` : "臨時の便"}</dd>
            <dt className="text-gray">車両</dt>
            <dd>
              {vehicle ? `${vehicle.name}（${BODY_TYPES[vehicle.body_type]}）` : "—"}
              {vehicle?.plate_kind === "white" && <span className="ml-1 text-danger">白ナンバーのため公開できません</span>}
            </dd>
            <dt className="text-gray">予約の締切</dt>
            <dd className="num">{formatDateTime(trip.booking_cutoff_at)}</dd>
            <dt className="text-gray">予約の確定</dt>
            <dd>{trip.requires_approval ? "承認してから確定" : "すぐに確定"}</dd>
            <dt className="text-gray">寄り道</dt>
            <dd>{trip.detour_max_km > 0 ? `${trip.detour_max_km}km以内・1か所 ${trip.detour_fee.toLocaleString()}円` : "なし（拠点で受け渡し）"}</dd>
            <dt className="text-gray">品目</dt>
            <dd>{trip.accepted_categories.map((c) => categoryName.get(c) ?? c).join("、")}</dd>
          </dl>

          {editable && <StatusButtons tripId={trip.id} status={trip.status} hasBookings={trip.booking_count > 0} />}
        </Section>

        <Section title="空き">
          {trip.capacity_pallets > 0 ? (
            <>
              <CapacityCells total={trip.capacity_pallets} booked={trip.booked_pallets} />
              <p className="num mt-2 text-sm">
                予約 {trip.booked_pallets} / {trip.capacity_pallets} 枠・{trip.booked_kg.toLocaleString()} /{" "}
                {trip.capacity_kg.toLocaleString()} kg（{trip.booking_count}件）
              </p>
            </>
          ) : (
            <p className="text-sm text-gray">売る枠が 0 です（満載の便）。空きが出た日は、下で枠を増やすと公開できます。</p>
          )}

          {editable && (
            <ActionForm action={updateTrip} className="mt-4 grid gap-3 border-t border-line pt-4">
              <input type="hidden" name="id" value={trip.id} />
              <p className="text-xs text-gray">
                この便だけ変えられます（定期ルートは変わりません）。車両の上限：
                <span className="num">{vehicle ? `${vehicle.pallet_slots}枠・${vehicle.max_load_kg.toLocaleString()}kg` : "—"}</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="売るパレット枠">
                  <NumberInput name="capacity_pallets" unit="枠" max={vehicle?.pallet_slots} defaultValue={trip.capacity_pallets} />
                </Field>
                <Field label="売る重量">
                  <NumberInput name="capacity_kg" unit="kg" max={vehicle?.max_load_kg} defaultValue={trip.capacity_kg} />
                </Field>
              </div>
              <Field label="1パレット枠の料金（税抜）">
                <NumberInput name="price_per_pallet" unit="円" max={1_000_000} defaultValue={trip.price_per_pallet} />
              </Field>
              <CategoryChecks categories={categories} selected={trip.accepted_categories} />
              <SubmitButton variant="ink" pendingText="保存中…">
                この便の空き・料金を保存する
              </SubmitButton>
            </ActionForm>
          )}
        </Section>

        <Section
          title="この便の予約"
          aside={
            <Link href="/carrier/bookings" className="text-sm text-navy underline underline-offset-4">
              予約の画面へ
            </Link>
          }
        >
          {bookings.length === 0 ? (
            <p className="text-sm text-gray">まだ予約はありません。</p>
          ) : (
            <ul className="grid gap-2">
              {bookings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 rounded-[5px] bg-paper px-3 py-2 text-sm">
                  <span>
                    {shippers.get(b.shipper_id)?.name ?? "—"}
                    <span className="num ml-2 text-gray">
                      {b.pallets}枠・{b.weight_kg.toLocaleString()}kg{b.pickup_address || b.dropoff_address ? "・寄り道" : ""}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-[5px] border bg-white px-2 py-0.5 text-xs ${
                      b.status === "requested" ? "border-primary text-primary" : "border-mist text-gray"
                    }`}
                  >
                    {BOOKING_STATUSES[b.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 運休にしたあとも結果のメッセージ（影響を受けた予約の数）が消えないよう、フォームは残す */}
        {(editable || trip.status === "cancelled") && (
          <Section title={trip.status === "cancelled" ? "運休" : "運休にする"}>
            <ActionForm action={setTripStatus} confirm="この便を運休にします。元には戻せません。よろしいですか？" className="grid gap-2">
              <input type="hidden" name="id" value={trip.id} />
              <input type="hidden" name="status" value="cancelled" />
              {trip.status === "cancelled" ? (
                <p className="text-sm text-gray">この便は運休です。予約していた荷主のページには「運休」と表示されています。</p>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-gray">
                    車両の故障・行き便の中止などで走らないときに使います。予約がある場合は、荷主のページに「運休」と表示されます。元には戻せません。
                  </p>
                  <Field label="荷主へのひとこと（任意）">
                    <input name="message" maxLength={200} placeholder="例：車両点検のため" className="field" />
                  </Field>
                  <SubmitButton variant="danger" pendingText="処理中…">
                    運休にする
                  </SubmitButton>
                </>
              )}
            </ActionForm>
          </Section>
        )}

        {trip.status === "draft" && (
          <ActionForm action={deleteTrip} confirm="この下書きの便を削除します。よろしいですか？">
            <input type="hidden" name="id" value={trip.id} />
            <SubmitButton variant="danger" className="w-full" pendingText="削除中…">
              この下書きを削除する
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    </>
  );
}

function StatusButtons({ tripId, status, hasBookings }: { tripId: string; status: string; hasBookings: boolean }) {
  return (
    <ActionForm action={setTripStatus} className="mt-4 grid gap-2 border-t border-line pt-4">
      <input type="hidden" name="id" value={tripId} />
      {status === "draft" && (
        <SubmitButton variant="accent" name="status" value="published" pendingText="公開中…">
          公開する
        </SubmitButton>
      )}
      {status === "published" && (
        <SubmitButton variant="outline" name="status" value="closed" pendingText="処理中…">
          受付を終了する
        </SubmitButton>
      )}
      {status === "closed" && (
        <SubmitButton variant="ink" name="status" value="published" pendingText="処理中…">
          受付を再開する
        </SubmitButton>
      )}
      {status !== "draft" && !hasBookings && (
        <SubmitButton variant="quiet" name="status" value="draft" pendingText="処理中…">
          下書きに戻す（荷主の検索に出さない）
        </SubmitButton>
      )}
    </ActionForm>
  );
}
