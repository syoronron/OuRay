import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Section } from "@/components/page-header";
import { PhotoInput } from "@/components/photo-input";
import { BOOKING_STATUSES, PACKAGING } from "@/lib/booking";
import type { BookingWithEvents, Shipper } from "@/lib/data/bookings";
import type { CargoCategory, Trip } from "@/lib/data/carrier";
import { formatDateTime, formatPhone } from "@/lib/time";
import {
  cancelBookingByCarrier,
  deliverBooking,
  departTrip,
  loadBooking,
  recordCleaning,
  reportBooking,
} from "../../actions";

const EVENT_LABELS: Record<string, string> = {
  requested: "申込",
  confirmed: "予約確定",
  rejected: "お断り",
  cancelled: "キャンセル",
  trip_cancelled: "運休",
  loaded: "積込",
  in_transit: "出発（輸送中）",
  delivered: "受け渡し",
  delay: "遅れ",
  damage: "荷物の事故",
  note: "連絡",
};

/** 当日の作業に出す予約（申込中・お断り・キャンセルは出さない） */
const WORKING = new Set(["confirmed", "loaded", "in_transit", "delivered"]);

/**
 * 便の詳細の「当日の作業」（P3）。
 *   予約ごと：積込済みにする（写真）→（便の出発）→ 受け渡し済みにする（受取人・写真）
 *   便：出発する／衛生物を運んだら清掃を記録
 *   いつでも：遅れ・事故・連絡を報告（写真）
 */
export function TripOperations({
  trip,
  bookings,
  shippers,
  categories,
  photoUrls,
}: {
  trip: Trip;
  bookings: BookingWithEvents[];
  shippers: Map<string, Shipper>;
  categories: CargoCategory[];
  photoUrls: Map<string, string>;
}) {
  const working = bookings.filter((b) => WORKING.has(b.status));
  const requested = bookings.filter((b) => b.status === "requested").length;
  const notLoaded = working.filter((b) => b.status === "confirmed").length;
  const canDepart = trip.status === "published" || trip.status === "closed";
  const hygieneCodes = new Set(categories.filter((c) => c.hygiene).map((c) => c.code));
  const carriedHygiene = working.some((b) => hygieneCodes.has(b.cargo_category) && b.status !== "confirmed");
  const categoryName = new Map(categories.map((c) => [c.code, c.name]));

  return (
    <Section
      title="当日の作業"
      aside={
        working.length > 0 ? (
          <Link href={`/carrier/trips/${trip.id}/sheet`} className="text-sm text-navy underline underline-offset-4">
            積込リストを印刷
          </Link>
        ) : undefined
      }
    >
      {working.length === 0 ? (
        <p className="text-sm text-gray">
          確定した予約はまだありません。
          {requested > 0 && (
            <Link href="/carrier/bookings" className="ml-1 text-navy underline underline-offset-4">
              承認待ちが {requested}件 あります
            </Link>
          )}
        </p>
      ) : (
        <ol className="grid gap-3">
          {working.map((b) => (
            <li key={b.id} className="rounded-[10px] bg-paper p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{shippers.get(b.shipper_id)?.name ?? "—"}</p>
                  <p className="num text-xs text-gray">
                    {categoryName.get(b.cargo_category) ?? b.cargo_category}
                    {hygieneCodes.has(b.cargo_category) && "（衛生物）"}・{PACKAGING[b.packaging]} {b.pieces}個・{b.pallets}枠・
                    {b.weight_kg.toLocaleString()}kg
                  </p>
                </div>
                <span className="shrink-0 rounded-[5px] border border-navy bg-white px-2 py-0.5 text-xs text-navy">
                  {BOOKING_STATUSES[b.status]}
                </span>
              </div>
              <p className="num mt-1 text-xs">
                {b.pickup_address ? `集荷：${b.pickup_address}` : "拠点に持ち込み"}（{b.pickup_contact} {formatPhone(b.pickup_phone)}）
                <br />
                {b.dropoff_address ? `配達：${b.dropoff_address}` : "拠点で受け取り"}（{b.dropoff_contact} {formatPhone(b.dropoff_phone)}）
              </p>

              {/* 写真と記録 */}
              <ul className="mt-2 grid gap-1 border-t border-line pt-2 text-xs">
                {b.events
                  .filter((e) => !["requested", "confirmed"].includes(e.kind))
                  .map((e, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="num w-24 shrink-0 text-gray">{formatDateTime(e.created_at)}</span>
                      <span className={e.kind === "damage" ? "font-bold text-danger" : ""}>
                        {EVENT_LABELS[e.kind] ?? e.kind}
                        {e.message && `：${e.message}`}
                        {e.photo_paths.map((p) =>
                          photoUrls.get(p) ? (
                            <a key={p} href={photoUrls.get(p)} target="_blank" rel="noreferrer" className="mt-1 block w-fit">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={photoUrls.get(p)} alt="記録の写真" className="h-20 rounded-[5px] object-cover" />
                            </a>
                          ) : null,
                        )}
                      </span>
                    </li>
                  ))}
              </ul>

              {/* その予約で、次にすること */}
              {b.status === "confirmed" && (
                <ActionForm action={loadBooking} className="mt-3 grid gap-2">
                  <input type="hidden" name="id" value={b.id} />
                  <PhotoInput label="積み込んだ荷物の写真（任意）" />
                  <input name="message" maxLength={200} placeholder="メモ（任意）例：カゴ台車2台" className="field" />
                  <SubmitButton variant="accent" pendingText="記録中…">
                    積込済みにする
                  </SubmitButton>
                </ActionForm>
              )}
              {b.status === "loaded" && <p className="mt-3 text-sm text-gray">積込済み。便の「出発する」を押すと「輸送中」になります。</p>}
              {b.status === "in_transit" && (
                <ActionForm action={deliverBooking} className="mt-3 grid gap-2">
                  <input type="hidden" name="id" value={b.id} />
                  <input name="received_by" required maxLength={50} placeholder="受け取った方のお名前" className="field" />
                  <PhotoInput label="受け渡した荷物の写真（任意）" />
                  <SubmitButton variant="accent" pendingText="記録中…">
                    受け渡し済みにする
                  </SubmitButton>
                </ActionForm>
              )}
              {b.status === "delivered" && b.received_by && (
                <p className="mt-3 text-sm">受け渡し済み（受け取り：{b.received_by}）</p>
              )}

              <details className="mt-2">
                <summary className="flex min-h-10 cursor-pointer list-none items-center text-sm text-navy underline underline-offset-4">
                  遅れ・荷物の事故・連絡を報告する
                </summary>
                <ActionForm action={reportBooking} className="mt-2 grid gap-2">
                  <input type="hidden" name="id" value={b.id} />
                  <select name="kind" defaultValue="delay" className="field">
                    <option value="delay">遅れ</option>
                    <option value="damage">荷物の事故（破損・紛失）</option>
                    <option value="note">そのほかの連絡</option>
                  </select>
                  <input name="message" required maxLength={200} placeholder="内容（荷主のページに表示されます）" className="field" />
                  <PhotoInput label="写真（任意）" />
                  <SubmitButton variant="outline" pendingText="記録中…">
                    報告する
                  </SubmitButton>
                </ActionForm>
              </details>

              {(b.status === "confirmed" || b.status === "loaded") && (
                <details className="mt-1">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center text-sm text-gray underline underline-offset-4">
                    この予約を取り消す（積めなかった・荷物が来なかった）
                  </summary>
                  <ActionForm action={cancelBookingByCarrier} confirm="この予約を取り消します。よろしいですか？" className="mt-2 grid gap-2">
                    <input type="hidden" name="id" value={b.id} />
                    <input name="message" required maxLength={200} placeholder="理由（荷主のページに表示されます）" className="field" />
                    <SubmitButton variant="outline" pendingText="処理中…">
                      取り消す
                    </SubmitButton>
                  </ActionForm>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* 便の出発 */}
      {canDepart && working.length > 0 && (
        <ActionForm
          action={departTrip}
          confirm={`出発します。積込済みの荷物は「輸送中」になります。${requested > 0 ? `確定していない申込${requested}件は、お断りになります。` : ""}よろしいですか？`}
          className="mt-4 border-t border-line pt-4"
        >
          <input type="hidden" name="id" value={trip.id} />
          {notLoaded > 0 && (
            <p className="mb-2 text-sm text-warn">まだ積み込んでいない予約が {notLoaded}件 あります。積み込むか、取り消してから出発してください。</p>
          )}
          <SubmitButton variant="ink" className="w-full" pendingText="記録中…">
            出発する
          </SubmitButton>
        </ActionForm>
      )}

      {/* 衛生物を運んだ便の清掃 */}
      {(trip.status === "departed" || trip.status === "completed") && carriedHygiene && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-sm font-bold">荷台の清掃（衛生物を運んだ便）</p>
          {trip.cleaned_at ? (
            <p className="num mt-1 text-sm">
              清掃済み：{formatDateTime(trip.cleaned_at)}
              {trip.cleaning_photo && photoUrls.get(trip.cleaning_photo) && (
                <a href={photoUrls.get(trip.cleaning_photo)} target="_blank" rel="noreferrer" className="mt-1 block w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrls.get(trip.cleaning_photo)} alt="清掃後の荷台" className="h-20 rounded-[5px] object-cover" />
                </a>
              )}
            </p>
          ) : (
            <ActionForm action={recordCleaning} className="mt-2 grid gap-2">
              <input type="hidden" name="id" value={trip.id} />
              <p className="text-xs text-gray">受け渡しのあと、次の便（行きの自動車部品など）の前に荷台を清掃して記録してください。</p>
              <PhotoInput label="清掃後の荷台の写真（任意）" />
              <SubmitButton variant="outline" pendingText="記録中…">
                清掃したことを記録する
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      )}
    </Section>
  );
}
