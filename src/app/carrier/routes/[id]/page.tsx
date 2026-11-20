import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader, Section, SetupNotice } from "@/components/page-header";
import { requireAdminPage } from "@/lib/auth";
import {
  getCarrier,
  getRoute,
  isDatabaseConfigured,
  listCategories,
  listDepots,
  listRoutes,
  listVehicles,
} from "@/lib/data/carrier";
import { DIRECTIONS } from "@/lib/labels";
import { formatTime, todayJst, weekdayLabel } from "@/lib/time";
import { deleteRoute, saveRoute } from "../../actions";
import { MissingCarrier, NeedFleet } from "../../notices";
import { Field, SubHeading, TripFields } from "../../trip-fields";

/** 定期ルートの追加（/carrier/routes/new）・編集 */
export default async function RoutePage({ params }: PageProps<"/carrier/routes/[id]">) {
  const { id } = await params;
  await requireAdminPage();
  if (!isDatabaseConfigured()) return <SetupNotice />;
  const carrier = await getCarrier();
  if (!carrier) return <MissingCarrier />;

  const isNew = id === "new";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [route, routes, vehicles, depots, categories] = await Promise.all([
    isNew ? null : getRoute(carrier.id, id),
    listRoutes(carrier.id),
    listVehicles(carrier.id),
    listDepots(carrier.id),
    listCategories(),
  ]);
  if (!isNew && !route) notFound();
  const depotName = new Map(depots.map((d) => [d.id, d.name]));
  const others = routes.filter((r) => r.id !== id);

  return (
    <>
      <Link href="/carrier/routes" className="mb-3 inline-flex min-h-11 items-center text-sm text-gray">
        ← 定期ルート
      </Link>
      <PageHeader eyebrow={isNew ? "NEW ROUTE" : "ROUTE"} title={isNew ? "定期ルートを追加" : "定期ルートを編集"}>
        {isNew
          ? "毎週走るルートを登録します。行き便と帰り便は別々に登録し、「組になるルート」で結びます。"
          : "変更は、これから作る便に反映されます。作成済みの便を直すときは、便の一覧から「定期ルートから便を作る」を押してください（公開済みの便は変わりません）。"}
      </PageHeader>

      {vehicles.length === 0 || depots.length < 2 ? (
        <NeedFleet />
      ) : (
        <div className="grid gap-4">
          <Section>
            <ActionForm action={saveRoute} className="grid gap-4">
              {route && <input type="hidden" name="id" value={route.id} />}

              <SubHeading>行き・帰り</SubHeading>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(DIRECTIONS).map(([value, label]) => (
                  <label key={value} className="flex min-h-11 items-center gap-2 border border-ink bg-white px-3 text-sm has-checked:bg-ink has-checked:text-white">
                    <input
                      type="radio"
                      name="direction"
                      value={value}
                      defaultChecked={(route?.direction ?? "return") === value}
                      className="sr-only"
                    />
                    {label}便{value === "return" ? "（空きを売る）" : "（ふだん満載）"}
                  </label>
                ))}
              </div>
              <Field label="組になるルート（任意）" hint="行き便と帰り便を結ぶと、一覧で並んで表示されます。">
                <select name="paired_route_id" defaultValue={route?.paired_route_id ?? ""} className="field">
                  <option value="">なし</option>
                  {others.map((r) => (
                    <option key={r.id} value={r.id}>
                      {DIRECTIONS[r.direction]}：{depotName.get(r.origin_depot_id)} → {depotName.get(r.dest_depot_id)}（
                      {r.weekdays.map(weekdayLabel).join("・")} {formatTime(r.depart)}）
                    </option>
                  ))}
                </select>
              </Field>

              <fieldset>
                <legend className="label">運行する曜日</legend>
                <div className="grid grid-cols-7 gap-1">
                  {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                    <label
                      key={wd}
                      className="flex min-h-11 items-center justify-center border border-ink bg-white text-sm font-bold has-checked:bg-ink has-checked:text-white"
                    >
                      <input
                        type="checkbox"
                        name="weekdays"
                        value={wd}
                        defaultChecked={route?.weekdays.includes(wd)}
                        className="sr-only"
                      />
                      {weekdayLabel(wd)}
                    </label>
                  ))}
                </div>
              </fieldset>

              <TripFields
                vehicles={vehicles}
                depots={depots}
                categories={categories}
                defaults={route ?? { capacity_pallets: undefined }}
              />

              <SubHeading>有効期間</SubHeading>
              <div className="grid grid-cols-2 gap-3">
                <Field label="始まり">
                  <input name="active_from" type="date" defaultValue={route?.active_from ?? todayJst()} required className="field num" />
                </Field>
                <Field label="終わり（任意）">
                  <input name="active_until" type="date" defaultValue={route?.active_until ?? ""} className="field num" />
                </Field>
              </div>

              <SubmitButton variant="accent" pendingText="保存中…">
                {isNew ? "定期ルートを追加する" : "保存する"}
              </SubmitButton>
            </ActionForm>
          </Section>

          {route && (
            <ActionForm
              action={deleteRoute}
              confirm="この定期ルートを削除します。作成済みの便は「臨時の便」として残ります。よろしいですか？"
            >
              <input type="hidden" name="id" value={route.id} />
              <SubmitButton variant="danger" className="w-full" pendingText="削除中…">
                この定期ルートを削除する
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      )}
    </>
  );
}
