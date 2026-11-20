import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader, Section, SetupNotice } from "@/components/page-header";
import { requireAdminPage } from "@/lib/auth";
import { getCarrier, isDatabaseConfigured, listCategories, listDepots, listVehicles } from "@/lib/data/carrier";
import { addDays, todayJst } from "@/lib/time";
import { addTrip } from "../../actions";
import { MissingCarrier, NeedFleet } from "../../notices";
import { Field, TripFields } from "../../trip-fields";

/** 臨時の便を1件だけ追加する（P1-9） */
export default async function NewTripPage() {
  await requireAdminPage();
  if (!isDatabaseConfigured()) return <SetupNotice />;
  const carrier = await getCarrier();
  if (!carrier) return <MissingCarrier />;
  const [vehicles, depots, categories] = await Promise.all([
    listVehicles(carrier.id),
    listDepots(carrier.id),
    listCategories(),
  ]);
  // 締切（初期値24時間前）に間に合うよう、初期値は明後日
  const defaultDate = addDays(todayJst(), 2);

  return (
    <>
      <Link href="/carrier" className="mb-3 inline-flex min-h-11 items-center text-sm text-gray">
        ← 便の一覧
      </Link>
      <PageHeader eyebrow="NEW TRIP" title="臨時の便を追加">
        定期ルートにない便を1件だけ追加します。下書きで作るので、確認してから公開してください。
      </PageHeader>
      {vehicles.length === 0 || depots.length < 2 ? (
        <NeedFleet />
      ) : (
        <Section>
          <ActionForm action={addTrip} className="grid gap-4">
            <Field label="出発日">
              <input name="date" type="date" min={todayJst()} defaultValue={defaultDate} required className="field num" />
            </Field>
            <TripFields vehicles={vehicles} depots={depots} categories={categories} defaults={{}} />
            <SubmitButton variant="accent" pendingText="追加中…">
              下書きで追加する
            </SubmitButton>
          </ActionForm>
        </Section>
      )}
    </>
  );
}
