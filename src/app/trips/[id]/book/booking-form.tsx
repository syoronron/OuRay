"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PACKAGING } from "@/lib/booking";
import { quote, yen } from "@/lib/money";
import { requestBooking } from "../../actions";

export type BookingFormTrip = {
  id: string;
  freePallets: number;
  freeKg: number;
  pricePerPallet: number;
  detourMaxKm: number;
  detourFee: number;
  originName: string;
  destName: string;
  categories: { code: string; name: string; hygiene: boolean }[];
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray">{hint}</span>}
    </label>
  );
}

function Panel({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 md:p-8">
      <h2 className="mb-4 flex items-center gap-3 text-lg font-bold">
        <span className="num flex size-7 items-center justify-center rounded-full bg-navy text-sm text-white">{step}</span>
        {title}
      </h2>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Check({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3 rounded-[10px] border border-mist bg-white p-3 text-sm leading-relaxed">
      <input type="checkbox" name={name} required className="mt-0.5 size-5 shrink-0 accent-[#0058aa]" />
      <span>{children}</span>
    </label>
  );
}

/** 拠点で受け渡す／施設などに寄ってもらう、の選択 */
function PlaceChoice({
  name,
  depotLabel,
  addressLabel,
  canDetour,
  detourMaxKm,
  value,
  onChange,
}: {
  name: "pickup" | "dropoff";
  depotLabel: string;
  addressLabel: string;
  canDetour: boolean;
  detourMaxKm: number;
  value: "depot" | "address";
  onChange: (v: "depot" | "address") => void;
}) {
  return (
    <div className="grid gap-2">
      {(["depot", "address"] as const).map((mode) => (
        <label
          key={mode}
          className={`flex min-h-12 items-center gap-3 rounded-[10px] border px-3 text-sm ${
            value === mode ? "border-primary bg-[#eef4fb]" : "border-mist bg-white"
          } ${mode === "address" && !canDetour ? "opacity-50" : ""}`}
        >
          <input
            type="radio"
            name={`${name}_mode`}
            value={mode}
            checked={value === mode}
            disabled={mode === "address" && !canDetour}
            onChange={() => onChange(mode)}
            className="size-5 accent-[#0058aa]"
          />
          {mode === "depot" ? depotLabel : canDetour ? `${addressLabel}（拠点から${detourMaxKm}km以内）` : `${addressLabel}（この便はできません）`}
        </label>
      ))}
      {value === "address" && (
        <Field label="住所" hint="運送会社が距離を確認して、承認するときにお知らせします。">
          <input name={`${name}_address`} required maxLength={200} className="field" />
        </Field>
      )}
    </div>
  );
}

export function BookingForm({ trip }: { trip: BookingFormTrip }) {
  const [category, setCategory] = useState(trip.categories[0]?.code ?? "");
  const [pallets, setPallets] = useState(1);
  const [pickupMode, setPickupMode] = useState<"depot" | "address">("depot");
  const [dropoffMode, setDropoffMode] = useState<"depot" | "address">("depot");
  const [contact, setContact] = useState({ name: "", phone: "" });
  // 持ち込む方：自分で入力するまでは、ご担当者と同じ内容を入れておく
  const [pickup, setPickup] = useState<{ name: string | null; phone: string | null }>({ name: null, phone: null });
  const canDetour = trip.detourMaxKm > 0;
  const hygiene = trip.categories.find((c) => c.code === category)?.hygiene ?? false;

  const detours = (pickupMode === "address" ? 1 : 0) + (dropoffMode === "address" ? 1 : 0);
  const safePallets = Number.isInteger(pallets) && pallets >= 1 && pallets <= trip.freePallets ? pallets : 1;
  const q = quote({ pricePerPallet: trip.pricePerPallet, pallets: safePallets, detours, detourFee: trip.detourFee, feeRateBp: 0 });

  return (
    <ActionForm action={requestBooking} className="grid gap-4" messageClassName="rounded-[10px] bg-white p-3">
      <input type="hidden" name="trip_id" value={trip.id} />

      <Panel step={1} title="ご依頼主">
        <Field label="会社名・施設名">
          <input name="company_name" required maxLength={100} autoComplete="organization" className="field" />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="ご担当者のお名前">
            <input
              name="contact_name"
              required
              maxLength={50}
              autoComplete="name"
              className="field"
              onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
            />
          </Field>
          <Field label="電話番号" hint="運送会社から確認の電話をすることがあります。">
            <input
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              className="field num"
              onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="メールアドレス（任意）">
          <input name="email" type="email" autoComplete="email" maxLength={200} className="field" />
        </Field>
      </Panel>

      <Panel step={2} title="荷物">
        <Field label="品目">
          <select name="cargo_category" value={category} onChange={(e) => setCategory(e.target.value)} className="field">
            {trip.categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
                {c.hygiene ? "（衛生物）" : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="荷姿">
            <select name="packaging" defaultValue="pallet" className="field">
              {Object.entries(PACKAGING).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="個数">
            <input name="pieces" type="number" inputMode="numeric" min={1} max={9999} defaultValue={1} required className="field num" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="使うパレット枠" hint={`空き ${trip.freePallets}枠。1枠＝1.1m×1.1m（カゴ台車1台もおよそ1枠）`}>
            <input
              name="pallets"
              type="number"
              inputMode="numeric"
              min={1}
              max={trip.freePallets}
              value={Number.isNaN(pallets) ? "" : pallets}
              onChange={(e) => setPallets(e.target.valueAsNumber)}
              required
              className="field num"
            />
          </Field>
          <Field label="総重量（kg）" hint={`あと ${trip.freeKg.toLocaleString()}kg まで`}>
            <input name="weight_kg" type="number" inputMode="numeric" min={1} max={trip.freeKg} required className="field num" />
          </Field>
        </div>
        <Field label="中身・注意すること（任意）" hint="例：シーツ20袋、上積み不可 など">
          <input name="cargo_description" maxLength={200} className="field" />
        </Field>
        <Check name="no_prohibited">
          危険物・生き物・現金や貴重品・廃棄物（使用済みの紙おむつ等）は入っていません。
        </Check>
        {hygiene && (
          <Check name="sealed">
            使用済みのリネンなどは、<strong>密閉した袋・ふた付きの容器</strong>に入れ、外側を汚さないようにします。感染症の疑いがある物は入れません。
          </Check>
        )}
      </Panel>

      <Panel step={3} title="持ち込み・受け取り">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <p className="text-sm font-bold">出発するとき</p>
            <PlaceChoice
              name="pickup"
              depotLabel={`${trip.originName}に持ち込む`}
              addressLabel="施設などで集荷してもらう"
              canDetour={canDetour}
              detourMaxKm={trip.detourMaxKm}
              value={pickupMode}
              onChange={setPickupMode}
            />
            <Field label="持ち込む方のお名前">
              <input
                name="pickup_contact"
                required
                maxLength={50}
                value={pickup.name ?? contact.name}
                onChange={(e) => setPickup((p) => ({ ...p, name: e.target.value }))}
                className="field"
              />
            </Field>
            <Field label="その方の電話番号">
              <input
                name="pickup_phone"
                type="tel"
                required
                value={pickup.phone ?? contact.phone}
                onChange={(e) => setPickup((p) => ({ ...p, phone: e.target.value }))}
                className="field num"
              />
            </Field>
          </div>
          <div className="grid gap-2">
            <p className="text-sm font-bold">到着したとき</p>
            <PlaceChoice
              name="dropoff"
              depotLabel={`${trip.destName}で受け取る`}
              addressLabel="届け先まで配達してもらう"
              canDetour={canDetour}
              detourMaxKm={trip.detourMaxKm}
              value={dropoffMode}
              onChange={setDropoffMode}
            />
            <Field label="受け取る方のお名前">
              <input name="dropoff_contact" required maxLength={50} className="field" />
            </Field>
            <Field label="その方の電話番号">
              <input name="dropoff_phone" type="tel" required className="field num" />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel step={4} title="料金と同意">
        <dl className="num grid grid-cols-[1fr_auto] gap-y-1 rounded-[10px] bg-paper p-4 text-sm">
          <dt>
            運賃（{yen(trip.pricePerPallet)}円 × {safePallets}枠）
          </dt>
          <dd className="text-right">{yen(q.palletAmount)}円</dd>
          {detours > 0 && (
            <>
              <dt>
                寄り道（{yen(trip.detourFee)}円 × {detours}か所）
              </dt>
              <dd className="text-right">{yen(q.detourAmount)}円</dd>
            </>
          )}
          <dt>消費税（10%）</dt>
          <dd className="text-right">{yen(q.tax)}円</dd>
          <dt className="mt-2 border-t border-line pt-2 font-bold">お支払い（税込）</dt>
          <dd className="mt-2 border-t border-line pt-2 text-right text-xl font-bold">{yen(q.total)}円</dd>
        </dl>
        <p className="text-xs leading-relaxed text-gray">
          お支払いは、運送が終わったあとに運送会社からの請求書でお願いします（月ごと・銀行振込）。実際の重量・枠数が違う場合は、運送会社が金額を直してお知らせします。
        </p>
        <Check name="agree">
          運送の契約は、私たちと<strong>この便の運送会社</strong>の間で結ばれ、OuRay は予約の仲介をすることを理解しました。運送会社の運送約款（荷物の事故の補償の上限を含む）と、OuRay の利用規約に同意します。
        </Check>
        <SubmitButton variant="accent" className="min-h-14 w-full text-base" pendingText="申し込んでいます…">
          この内容で申し込む
        </SubmitButton>
        <p className="text-center text-xs text-gray">申し込んだあと、運送会社が内容を確認して「予約確定」になります。</p>
      </Panel>
    </ActionForm>
  );
}
