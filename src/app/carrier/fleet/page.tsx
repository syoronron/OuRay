import Link from "next/link";
import { PageHeader, Section, SetupNotice } from "@/components/page-header";
import { requireAdminPage } from "@/lib/auth";
import { getCarrier, isDatabaseConfigured, listAreas, listDepots, listVehicles } from "@/lib/data/carrier";
import { BODY_TYPES, TEMPERATURES } from "@/lib/labels";
import { formatTime } from "@/lib/time";
import { logout } from "../../login/actions";
import { MissingCarrier } from "../notices";

/** 拠点・車両の一覧 */
export default async function FleetPage() {
  await requireAdminPage();
  if (!isDatabaseConfigured()) return <SetupNotice />;
  const carrier = await getCarrier();
  if (!carrier) return <MissingCarrier />;
  const [depots, vehicles, areas] = await Promise.all([listDepots(carrier.id), listVehicles(carrier.id), listAreas()]);
  const areaName = new Map(areas.map((a) => [a.id, a.name]));

  return (
    <>
      <PageHeader eyebrow="FLEET" title="拠点・車両">
        {carrier.name}
        {carrier.carrier_license_no && <span className="num">（許可番号 {carrier.carrier_license_no}）</span>}
      </PageHeader>

      <div className="grid gap-4">
        <Section
          title="拠点"
          aside={
            <Link href="/carrier/fleet/depots/new" className="text-sm font-bold underline underline-offset-4">
              追加
            </Link>
          }
        >
          <p className="mb-2 text-xs text-gray">荷物の持ち込み・受け取りをする場所です。荷主はエリアで便を探します。</p>
          <ul className="grid gap-2">
            {depots.map((d) => (
              <li key={d.id}>
                <Link href={`/carrier/fleet/depots/${d.id}`} className="block border border-line p-3">
                  <p className="flex items-center justify-between font-bold">
                    {d.name}
                    <span className="border border-line px-1.5 text-[11px] font-normal">{areaName.get(d.area_id)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray">
                    {d.address}
                    {d.open !== null && d.close !== null && (
                      <span className="num">　荷受け {formatTime(d.open)}–{formatTime(d.close)}</span>
                    )}
                    {d.has_forklift && "　フォークリフトあり"}
                  </p>
                </Link>
              </li>
            ))}
            {depots.length === 0 && <li className="text-sm text-gray">まだ拠点がありません。</li>}
          </ul>
        </Section>

        <Section
          title="車両"
          aside={
            <Link href="/carrier/fleet/vehicles/new" className="text-sm font-bold underline underline-offset-4">
              追加
            </Link>
          }
        >
          <ul className="grid gap-2">
            {vehicles.map((v) => (
              <li key={v.id}>
                <Link href={`/carrier/fleet/vehicles/${v.id}`} className="block border border-line p-3">
                  <p className="flex items-center justify-between font-bold">
                    {v.name}
                    {v.plate_kind === "white" ? (
                      <span className="border border-danger px-1.5 text-[11px] font-normal text-danger">白ナンバー</span>
                    ) : (
                      <span className="border border-line px-1.5 text-[11px] font-normal">緑ナンバー</span>
                    )}
                  </p>
                  <p className="num mt-0.5 text-xs text-gray">
                    {BODY_TYPES[v.body_type]}・{TEMPERATURES[v.temperature]}・{v.pallet_slots}枠・最大
                    {v.max_load_kg.toLocaleString()}kg{v.has_power_gate && "・パワーゲート"}
                  </p>
                </Link>
              </li>
            ))}
            {vehicles.length === 0 && <li className="text-sm text-gray">まだ車両がありません。</li>}
          </ul>
        </Section>

        <form action={logout}>
          <button type="submit" className="min-h-11 w-full text-sm text-gray underline underline-offset-4">
            ログアウト
          </button>
        </form>
      </div>
    </>
  );
}
