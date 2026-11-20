import type { CargoCategory, Depot, Vehicle } from "@/lib/data/carrier";
import { BODY_TYPES } from "@/lib/labels";
import { formatTime } from "@/lib/time";

/** 便・定期ルートの入力欄の初期値 */
export type TripFieldDefaults = {
  vehicle_id?: string;
  origin_depot_id?: string;
  dest_depot_id?: string;
  depart?: number;
  duration_minutes?: number;
  capacity_pallets?: number;
  capacity_kg?: number;
  price_per_pallet?: number;
  booking_cutoff_hours?: number;
  requires_approval?: boolean;
  accepted_categories?: string[];
  detour_max_km?: number;
  detour_fee?: number;
};

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {hint && <p className="mt-1 text-xs text-gray">{hint}</p>}
    </div>
  );
}

/** 数字の入力欄（単位つき） */
export function NumberInput({
  name,
  unit,
  defaultValue,
  min = 0,
  max,
  required = true,
  label,
}: {
  name: string;
  unit: string;
  defaultValue?: number | null;
  min?: number;
  max?: number;
  required?: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        defaultValue={defaultValue ?? ""}
        required={required}
        aria-label={label}
        className="field num"
      />
      <span className="shrink-0 text-sm text-gray">{unit}</span>
    </div>
  );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-2 border-b border-line pb-1 text-xs font-bold tracking-wide">{children}</h3>;
}

/** 受け入れる品目（廃棄物は選べない） */
export function CategoryChecks({ categories, selected }: { categories: CargoCategory[]; selected: string[] }) {
  const chosen = new Set(selected);
  return (
    <fieldset>
      <legend className="label">受け入れる品目</legend>
      <div className="grid gap-1">
        {categories.map((c) => (
          <label
            key={c.code}
            className={`flex min-h-11 items-center gap-3 border border-line px-3 text-sm ${c.is_waste ? "bg-paper text-gray" : "bg-white"}`}
          >
            <input
              type="checkbox"
              name="accepted_categories"
              value={c.code}
              defaultChecked={!c.is_waste && chosen.has(c.code)}
              disabled={c.is_waste}
              className="size-5 accent-ink"
            />
            <span className="flex-1">{c.name}</span>
            {c.hygiene && !c.is_waste && <span className="border border-ink px-1.5 text-[10px] font-bold">衛生物</span>}
            {c.is_waste && <span className="text-[10px]">受付不可</span>}
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-gray">
        衛生物（使用済みのシーツ・タオル等）を受けるときは、他の荷物と分けて積み、受け渡し後に荷台を清掃してください。
        廃棄物（使用済みの紙おむつ等）は、廃棄物の収集運搬業の許可が必要なため受け付けていません。
      </p>
    </fieldset>
  );
}

/** 定期ルートと単発便で共通の入力欄 */
export function TripFields({
  vehicles,
  depots,
  categories,
  defaults,
}: {
  vehicles: Vehicle[];
  depots: Depot[];
  categories: CargoCategory[];
  defaults: TripFieldDefaults;
}) {
  const duration = defaults.duration_minutes ?? null;
  return (
    <div className="grid gap-4">
      <SubHeading>区間と時刻</SubHeading>
      <div className="grid grid-cols-2 gap-3">
        <Field label="出発地">
          <select name="origin_depot_id" defaultValue={defaults.origin_depot_id ?? ""} required className="field">
            <option value="" disabled>
              選んでください
            </option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="到着地">
          <select name="dest_depot_id" defaultValue={defaults.dest_depot_id ?? ""} required className="field">
            <option value="" disabled>
              選んでください
            </option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="出発時刻">
        <input
          name="depart_time"
          type="time"
          defaultValue={defaults.depart !== undefined ? formatTime(defaults.depart) : ""}
          required
          className="field num"
        />
      </Field>
      <Field label="所要時間">
        <div className="grid grid-cols-2 gap-3">
          <NumberInput name="duration_h" unit="時間" max={72} defaultValue={duration === null ? null : Math.floor(duration / 60)} label="所要時間（時間）" />
          <NumberInput name="duration_m" unit="分" max={59} defaultValue={duration === null ? 0 : duration % 60} label="所要時間（分）" />
        </div>
      </Field>

      <SubHeading>車両と売る空き</SubHeading>
      <Field label="車両">
        <select name="vehicle_id" defaultValue={defaults.vehicle_id ?? ""} required className="field">
          <option value="" disabled>
            選んでください
          </option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}（{BODY_TYPES[v.body_type]}・{v.pallet_slots}枠・{v.max_load_kg.toLocaleString()}kg
              {v.plate_kind === "white" ? "・白ナンバー" : ""}）
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="売るパレット枠">
          <NumberInput name="capacity_pallets" unit="枠" max={40} defaultValue={defaults.capacity_pallets} />
        </Field>
        <Field label="売る重量">
          <NumberInput name="capacity_kg" unit="kg" max={30000} defaultValue={defaults.capacity_kg} />
        </Field>
      </div>
      <p className="-mt-2 text-xs leading-relaxed text-gray">
        車両の上限（かっこ内）まで。自社の荷物を積む分は差し引いてください。行き便など、ふだん空きがない便は 0 にします。
      </p>

      <SubHeading>料金と予約</SubHeading>
      <Field label="1パレット枠の料金（税抜）">
        <NumberInput name="price_per_pallet" unit="円" max={1_000_000} defaultValue={defaults.price_per_pallet} />
      </Field>
      <Field label="予約の締切">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm text-gray">出発の</span>
          <NumberInput name="booking_cutoff_hours" unit="時間前まで" max={336} defaultValue={defaults.booking_cutoff_hours ?? 24} />
        </div>
      </Field>
      <label className="flex min-h-11 items-center gap-3 border border-line bg-white px-3 text-sm">
        <input
          type="checkbox"
          name="requires_approval"
          defaultChecked={defaults.requires_approval ?? true}
          className="size-5 accent-ink"
        />
        予約は承認してから確定する（おすすめ）
      </label>

      <CategoryChecks categories={categories} selected={defaults.accepted_categories ?? ["auto_parts", "returnable_container", "general"]} />

      <SubHeading>寄り道（拠点以外での集荷・配達）</SubHeading>
      <div className="grid grid-cols-2 gap-3">
        <Field label="寄り道できる距離">
          <NumberInput name="detour_max_km" unit="km以内" max={100} defaultValue={defaults.detour_max_km ?? 0} />
        </Field>
        <Field label="1か所の料金（税抜）">
          <NumberInput name="detour_fee" unit="円" max={1_000_000} defaultValue={defaults.detour_fee ?? 0} />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-gray">0km なら寄り道なし（拠点での受け渡しだけ）。介護施設などは拠点まで持ち込めないことが多いです。</p>
    </div>
  );
}
