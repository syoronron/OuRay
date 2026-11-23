import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Section, SetupNotice } from "@/components/page-header";
import { BOOKING_STATUSES, PACKAGING, STEPS, canCancel, stepIndex } from "@/lib/booking";
import { loadBoardTrip } from "@/lib/data/board";
import { getBookingByToken } from "@/lib/data/bookings";
import { isDatabaseConfigured } from "@/lib/data/carrier";
import { TAX_RATE_PERCENT, yen } from "@/lib/money";
import { formatDateShort, formatDateTime, formatPhone, formatTime, toJst } from "@/lib/time";
import { tripCode } from "@/lib/trips/board";
import { cancelMyBooking } from "./actions";
import { CopyLink } from "./copy-link";

// 予約確認ページは検索エンジンに載せない
export const metadata: Metadata = { title: "予約の確認｜OuRay", robots: { index: false, follow: false } };

const EVENT_LABELS: Record<string, string> = {
  requested: "申込を受け付けました",
  confirmed: "運送会社が予約を確定しました",
  rejected: "運送会社がお断りしました",
  cancelled: "キャンセルしました",
  trip_cancelled: "便が運休になりました",
  loaded: "積み込みました",
  in_transit: "輸送中です",
  delivered: "受け渡しました",
  delay: "遅れのお知らせ",
  damage: "荷物の事故のお知らせ",
  note: "運送会社からのお知らせ",
};

/** 荷主の予約確認ページ（推測できない URL。ログインなしで開ける） */
export default async function MyBookingPage({ params, searchParams }: PageProps<"/b/[token]">) {
  const { token } = await params;
  const { new: isNew } = await searchParams;
  await connection();
  if (!isDatabaseConfigured()) return <SetupNotice />;
  const data = await getBookingByToken(token);
  if (!data) notFound();
  const { booking, events, shipper } = data;
  const tripData = await loadBoardTrip(booking.trip_id);
  const trip = tripData?.trip;
  const carrier = trip ? tripData.carriers.get(trip.company_id) : undefined;
  const route = trip?.route_id ? tripData?.routes.get(trip.route_id) : undefined;
  const origin = trip ? tripData?.depots.get(trip.origin_depot_id) : undefined;
  const dest = trip ? tripData?.depots.get(trip.dest_depot_id) : undefined;
  const category = tripData?.categories.find((c) => c.code === booking.cargo_category);

  const step = stepIndex(booking.status);
  const tax = Math.floor((booking.freight_amount * TAX_RATE_PERCENT) / 100);
  const ended = step === null;
  const lastMessage = [...events].reverse().find((e) => e.message)?.message;

  return (
    <>
      {isNew === "1" && (
        <div className="mb-5 rounded-2xl bg-primary p-5 text-white">
          <p className="text-lg font-bold">申込を受け付けました</p>
          <p className="mt-1 text-sm leading-relaxed text-white/90">
            運送会社が内容を確認して「予約確定」にします。進み具合はこのページで確認できます。
            <strong>このページの URL を保存しておいてください</strong>（メールなどでのお知らせはありません）。
          </p>
          <div className="mt-3">
            <CopyLink />
          </div>
        </div>
      )}

      <p className="num text-[11px] font-medium tracking-[0.2em] text-gray">MY BOOKING</p>
      <h1 className="mt-1 text-[30px] leading-tight font-normal">予約の確認</h1>
      <p className="mt-1 text-sm text-gray">{shipper.name} 様</p>

      {/* 進み具合 */}
      <section className="mt-5 rounded-2xl bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold">いまの状況</h2>
          <span
            className={`rounded-[5px] border bg-white px-2 py-1 text-sm ${
              ended ? "border-danger text-danger" : "border-navy text-navy"
            }`}
          >
            {BOOKING_STATUSES[booking.status]}
          </span>
        </div>
        {ended ? (
          <p className="mt-3 text-sm leading-relaxed">
            {booking.status === "rejected" && "申し訳ありません。運送会社がこの予約をお断りしました。"}
            {booking.status === "cancelled" && "この予約はキャンセルされました。"}
            {booking.status === "trip_cancelled" && "この便は運休になりました。OuRay の運営からご連絡します。"}
            {lastMessage && <span className="mt-1 block text-gray">理由：{lastMessage}</span>}
            <Link href="/trips" className="mt-3 block font-bold text-navy underline underline-offset-4">
              ほかの便をさがす
            </Link>
          </p>
        ) : (
          <ol className="mt-4 grid grid-cols-5 gap-1">
            {STEPS.map((label, i) => (
              <li key={label} className="text-center">
                <span
                  className={`mx-auto block h-1.5 rounded-full ${i <= (step ?? -1) ? "bg-primary" : "bg-line"}`}
                  aria-hidden
                />
                <span className={`mt-2 block text-[11px] ${i === step ? "font-bold text-primary" : i < (step ?? -1) ? "text-ink" : "text-gray"}`}>
                  {label}
                </span>
              </li>
            ))}
          </ol>
        )}
        {booking.status === "requested" && (
          <p className="mt-4 rounded-[10px] bg-paper p-3 text-sm leading-relaxed text-gray">
            運送会社が内容を確認しています。確定すると、ここが「予約確定」に変わります。
          </p>
        )}
        {booking.status === "confirmed" && trip && origin && (
          <p className="mt-4 rounded-[10px] bg-[#eef4fb] p-3 text-sm leading-relaxed">
            {booking.pickup_address
              ? `出発の日に、${booking.pickup_address} へ集荷に伺います。`
              : `${formatDateShort(toJst(trip.depart_at).date)} ${formatTime(toJst(trip.depart_at).minutes)} の出発までに、${origin.name}へお持ち込みください。`}
          </p>
        )}
      </section>

      {/* 便 */}
      {trip && carrier && (
        <section className="mt-4 rounded-2xl bg-white">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <p className="num text-xl font-bold text-navy">{tripCode(carrier.code, route?.number ?? null)}</p>
            <p className="text-sm text-gray">{carrier.name}</p>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 px-5 py-5">
            <div>
              <p className="text-xs text-gray">出発</p>
              <p className="num text-[30px]">{formatTime(toJst(trip.depart_at).minutes)}</p>
              <p className="num text-xs text-gray">{formatDateShort(toJst(trip.depart_at).date)}</p>
              <p className="mt-1 font-bold">{origin?.name}</p>
            </div>
            <p className="num pt-7 text-gray">→</p>
            <div className="text-right">
              <p className="text-xs text-gray">到着</p>
              <p className="num text-[30px]">{formatTime(toJst(trip.arrive_at).minutes)}</p>
              <p className="num text-xs text-gray">{formatDateShort(toJst(trip.arrive_at).date)}</p>
              <p className="mt-1 font-bold">{dest?.name}</p>
            </div>
          </div>
        </section>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Section title="荷物">
          <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
            <dt className="text-gray">品目</dt>
            <dd>{category?.name ?? booking.cargo_category}</dd>
            <dt className="text-gray">荷姿・個数</dt>
            <dd className="num">
              {PACKAGING[booking.packaging]} {booking.pieces}個
            </dd>
            <dt className="text-gray">パレット枠</dt>
            <dd className="num">{booking.pallets}枠</dd>
            <dt className="text-gray">総重量</dt>
            <dd className="num">{booking.weight_kg.toLocaleString()}kg</dd>
            {booking.cargo_description && (
              <>
                <dt className="text-gray">メモ</dt>
                <dd>{booking.cargo_description}</dd>
              </>
            )}
          </dl>
        </Section>

        <Section title="料金">
          <dl className="num grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <dt>
              運賃（{yen(booking.unit_price)}円 × {booking.pallets}枠）
            </dt>
            <dd className="text-right">{yen(booking.freight_amount - booking.detour_amount)}円</dd>
            {booking.detour_amount > 0 && (
              <>
                <dt>寄り道</dt>
                <dd className="text-right">{yen(booking.detour_amount)}円</dd>
              </>
            )}
            <dt>消費税</dt>
            <dd className="text-right">{yen(tax)}円</dd>
            <dt className="mt-2 border-t border-line pt-2 font-bold">お支払い（税込）</dt>
            <dd className="mt-2 border-t border-line pt-2 text-right text-lg font-bold">{yen(booking.freight_amount + tax)}円</dd>
          </dl>
          <p className="mt-2 text-xs text-gray">運送会社（{carrier?.name ?? "運送会社"}）からの請求書でお支払いください。</p>
        </Section>

        <Section title="持ち込み（出発）">
          <p className="text-sm font-bold">{booking.pickup_address ? `集荷：${booking.pickup_address}` : origin?.name}</p>
          {!booking.pickup_address && origin && (
            <p className="text-sm text-gray">
              {origin.address}
              {origin.open !== null && origin.close !== null && (
                <span className="num">　荷受け {formatTime(origin.open)}–{formatTime(origin.close)}</span>
              )}
            </p>
          )}
          {!booking.pickup_address && origin?.note && <p className="mt-1 text-xs">{origin.note}</p>}
          <p className="num mt-2 text-xs text-gray">
            担当：{booking.pickup_contact}（{formatPhone(booking.pickup_phone)}）
          </p>
        </Section>

        <Section title="受け取り（到着）">
          <p className="text-sm font-bold">{booking.dropoff_address ? `配達：${booking.dropoff_address}` : dest?.name}</p>
          {!booking.dropoff_address && dest && (
            <p className="text-sm text-gray">
              {dest.address}
              {dest.open !== null && dest.close !== null && (
                <span className="num">　荷受け {formatTime(dest.open)}–{formatTime(dest.close)}</span>
              )}
            </p>
          )}
          {!booking.dropoff_address && dest?.note && <p className="mt-1 text-xs">{dest.note}</p>}
          <p className="num mt-2 text-xs text-gray">
            担当：{booking.dropoff_contact}（{formatPhone(booking.dropoff_phone)}）
          </p>
        </Section>
      </div>

      <div className="mt-4">
      <Section title="これまでの記録">
        <ol className="grid gap-2">
          {events.map((e, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="num w-28 shrink-0 text-gray">{formatDateTime(e.created_at)}</span>
              <span>
                {EVENT_LABELS[e.kind] ?? e.kind}
                {e.message && <span className="block text-gray">{e.message}</span>}
              </span>
            </li>
          ))}
        </ol>
      </Section>
      </div>

      {trip && canCancel(booking.status, trip.booking_cutoff_at, new Date()) && (
        <ActionForm action={cancelMyBooking} confirm="この予約をキャンセルします。よろしいですか？" className="mt-4 rounded-2xl bg-white p-5">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm text-gray">
            <span className="num">{formatDateTime(trip.booking_cutoff_at)}</span>
            （予約の締切）までは、ここからキャンセルできます。それより後は運送会社にお電話ください。
          </p>
          <input name="message" maxLength={200} placeholder="理由（任意）" className="field mt-3" />
          <SubmitButton variant="danger" className="mt-2" pendingText="処理中…">
            予約をキャンセルする
          </SubmitButton>
        </ActionForm>
      )}

      <p className="mt-6 text-center text-xs leading-relaxed text-gray">
        運送の契約は、{shipper.name} 様と{carrier?.name ?? "運送会社"}の間で結ばれています。OuRay は予約の仲介をしています。
      </p>
    </>
  );
}
