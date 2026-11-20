import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader, Section, SetupNotice } from "@/components/page-header";
import { WeekNav } from "@/components/week-nav";
import { requireAdminPage } from "@/lib/auth";
import { getCarrier, isDatabaseConfigured, listDepots, listRoutes, listTrips } from "@/lib/data/carrier";
import { DIRECTIONS } from "@/lib/labels";
import { addDays, formatDateShort, jstToDate, todayJst, toJst } from "@/lib/time";
import { GENERATE_DAYS } from "@/lib/trips/generate";
import { resolveWeek } from "@/lib/week";
import { publishWeek, regenerateTrips } from "./actions";
import { MissingCarrier } from "./notices";
import { TripCard } from "./trip-card";

/** 便：週ごとの便の一覧。定期ルートから作る → 確認 → 公開 */
export default async function TripsPage({ searchParams }: PageProps<"/carrier">) {
  const { week: weekParam } = await searchParams;
  await requireAdminPage();
  if (!isDatabaseConfigured()) return <SetupNotice />;
  const carrier = await getCarrier();
  if (!carrier) return <MissingCarrier />;

  const week = resolveWeek(weekParam);
  const [trips, routes, depots] = await Promise.all([
    listTrips(carrier.id, jstToDate(week.from, 0), jstToDate(addDays(week.to, 1), 0)),
    listRoutes(carrier.id),
    listDepots(carrier.id),
  ]);
  const depotName = new Map(depots.map((d) => [d.id, d.name]));
  const routeLabel = new Map(routes.map((r) => [r.id, DIRECTIONS[r.direction]]));
  const drafts = trips.filter((t) => t.status === "draft" && t.capacity_pallets > 0).length;
  const published = trips.filter((t) => t.status === "published");
  const freeSlots = published.reduce((s, t) => s + t.capacity_pallets - t.booked_pallets, 0);
  const today = todayJst();

  return (
    <>
      <PageHeader eyebrow="TRIPS" title="便">
        {carrier.name}の便です。定期ルートから便を作り、内容を確認して公開すると、荷主の検索に表示されます。
      </PageHeader>

      <div className="grid gap-4">
        <Section title="便を作る">
          <p className="text-sm leading-relaxed text-gray">
            定期ルートから、今日から{GENERATE_DAYS / 7}週間分の便を下書きで作ります。公開中の便・予約のある便はそのまま残ります。
          </p>
          <ActionForm action={regenerateTrips} className="mt-3">
            <SubmitButton variant="outline" className="w-full" pendingText="作成中…">
              定期ルートから便を作る
            </SubmitButton>
          </ActionForm>
          <Link href="/carrier/trips/new" className="mt-2 flex min-h-11 items-center justify-center text-sm text-gray underline underline-offset-4">
            臨時の便を1件だけ追加する
          </Link>
        </Section>

        <WeekNav week={week} basePath="/carrier" />

        <div className="grid grid-cols-3 border border-ink bg-white text-center">
          <Stat label="便" value={trips.filter((t) => t.status !== "cancelled").length} />
          <Stat label="公開中" value={published.length} />
          <Stat label="空き枠（公開中）" value={freeSlots} />
        </div>

        {/* 公開後に下書きが 0 件になっても、結果のメッセージが消えないようにフォームは常に出す */}
        <ActionForm action={publishWeek}>
          <input type="hidden" name="week" value={week.from} />
          <SubmitButton variant="accent" className="w-full" pendingText="公開中…" disabled={drafts === 0}>
            {drafts > 0 ? `この週の下書き${drafts}件を公開する` : "公開する下書きはありません"}
          </SubmitButton>
          <p className="mt-1 text-xs text-gray">売る枠が 0 の便（満載の行き便など）は公開されません。</p>
        </ActionForm>

        {trips.length === 0 ? (
          <p className="border border-dashed border-mist bg-white p-6 text-center text-sm text-gray">
            この週の便はありません。
          </p>
        ) : (
          week.days.map((day) => {
            const dayTrips = trips.filter((t) => toJst(t.depart_at).date === day);
            if (dayTrips.length === 0) return null;
            return (
              <section key={day}>
                <h2 className="num mb-2 flex items-center gap-2 text-sm font-bold">
                  {formatDateShort(day)}
                  {day === today && <span className="bg-ink px-1.5 text-[10px] text-white">今日</span>}
                </h2>
                <div className="grid gap-2">
                  {dayTrips.map((t) => (
                    <TripCard
                      key={t.id}
                      trip={t}
                      originName={depotName.get(t.origin_depot_id) ?? "—"}
                      destName={depotName.get(t.dest_depot_id) ?? "—"}
                      label={t.route_id ? (routeLabel.get(t.route_id) ?? "定期") : "臨時"}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-line p-2 last:border-r-0">
      <p className="num text-xl font-bold">{value}</p>
      <p className="text-[10px] text-gray">{label}</p>
    </div>
  );
}
