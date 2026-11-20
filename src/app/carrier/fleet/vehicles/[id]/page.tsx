import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader, Section, SetupNotice } from "@/components/page-header";
import { requireAdminPage } from "@/lib/auth";
import { getCarrier, getVehicle, isDatabaseConfigured } from "@/lib/data/carrier";
import { BODY_TYPES, PLATE_KINDS, TEMPERATURES } from "@/lib/labels";
import { deleteVehicle, saveVehicle } from "../../../actions";
import { MissingCarrier } from "../../../notices";
import { Field, NumberInput, SubHeading } from "../../../trip-fields";

/** 車両の追加（/carrier/fleet/vehicles/new）・編集 */
export default async function VehiclePage({ params }: PageProps<"/carrier/fleet/vehicles/[id]">) {
  const { id } = await params;
  await requireAdminPage();
  if (!isDatabaseConfigured()) return <SetupNotice />;
  const carrier = await getCarrier();
  if (!carrier) return <MissingCarrier />;
  const isNew = id === "new";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const vehicle = isNew ? null : await getVehicle(carrier.id, id);
  if (!isNew && !vehicle) notFound();

  return (
    <>
      <Link href="/carrier/fleet" className="mb-3 inline-flex min-h-11 items-center text-sm text-gray">
        ← 拠点・車両
      </Link>
      <PageHeader eyebrow={isNew ? "NEW VEHICLE" : "VEHICLE"} title={isNew ? "車両を追加" : "車両を編集"} />
      <div className="grid gap-4">
        <Section>
          <ActionForm action={saveVehicle} className="grid gap-4">
            {vehicle && <input type="hidden" name="id" value={vehicle.id} />}
            <Field label="呼び名" hint="例：4t ウイング 1号車">
              <input name="name" defaultValue={vehicle?.name} maxLength={60} required className="field" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ナンバー（任意）" hint="荷主には表示しません。">
                <input name="plate_number" defaultValue={vehicle?.plate_number ?? ""} maxLength={40} className="field" />
              </Field>
              <Field label="ナンバーの種類">
                <select name="plate_kind" defaultValue={vehicle?.plate_kind ?? "green"} className="field">
                  {Object.entries(PLATE_KINDS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="-mt-2 text-xs leading-relaxed text-gray">
              白ナンバーの車両は、運賃をもらって他社の荷物を運べないため、便を公開できません。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="車種">
                <select name="body_type" defaultValue={vehicle?.body_type ?? "wing"} className="field">
                  {Object.entries(BODY_TYPES).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="温度帯">
                <select name="temperature" defaultValue={vehicle?.temperature ?? "ambient"} className="field">
                  {Object.entries(TEMPERATURES).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <SubHeading>積める量（便で売れる上限）</SubHeading>
            <div className="grid grid-cols-2 gap-3">
              <Field label="パレット枠数" hint="1.1m×1.1mのパレットが何枚積めるか">
                <NumberInput name="pallet_slots" unit="枠" min={1} max={40} defaultValue={vehicle?.pallet_slots} />
              </Field>
              <Field label="最大積載量">
                <NumberInput name="max_load_kg" unit="kg" min={1} max={30000} defaultValue={vehicle?.max_load_kg} />
              </Field>
            </div>

            <SubHeading>荷台の寸法（任意）</SubHeading>
            <div className="grid grid-cols-3 gap-2">
              <Field label="長さ">
                <NumberInput name="bed_length_mm" unit="mm" min={1} required={false} defaultValue={vehicle?.bed_length_mm} />
              </Field>
              <Field label="幅">
                <NumberInput name="bed_width_mm" unit="mm" min={1} required={false} defaultValue={vehicle?.bed_width_mm} />
              </Field>
              <Field label="高さ">
                <NumberInput name="bed_height_mm" unit="mm" min={1} required={false} defaultValue={vehicle?.bed_height_mm} />
              </Field>
            </div>
            <label className="flex min-h-11 items-center gap-3 border border-line bg-white px-3 text-sm">
              <input type="checkbox" name="has_power_gate" defaultChecked={vehicle?.has_power_gate} className="size-5 accent-ink" />
              パワーゲートがある
            </label>
            <SubmitButton variant="accent" pendingText="保存中…">
              {isNew ? "車両を追加する" : "保存する"}
            </SubmitButton>
          </ActionForm>
        </Section>
        {vehicle && (
          <ActionForm action={deleteVehicle} confirm="この車両を削除します。よろしいですか？">
            <input type="hidden" name="id" value={vehicle.id} />
            <SubmitButton variant="danger" className="w-full" pendingText="削除中…">
              この車両を削除する
            </SubmitButton>
            <p className="mt-1 text-center text-xs text-gray">定期ルートや便で使っている車両は削除できません。</p>
          </ActionForm>
        )}
      </div>
    </>
  );
}
