import Link from "next/link";
import { connection } from "next/server";
import { PageHeader, Section, SetupNotice } from "@/components/page-header";
import { requireAdminPage } from "@/lib/auth";
import { currentCarrierId, getCarrier, isDatabaseConfigured, listDepots } from "@/lib/data/carrier";
import { MissingCarrier } from "../../../notices";
import { ImportForm } from "./import-form";

/** 拠点の一括登録（Excel などから表を貼り付け） */
export default async function ImportDepotsPage() {
  await requireAdminPage();
  await connection();
  if (!isDatabaseConfigured()) return <SetupNotice />;
  const carrierId = currentCarrierId();
  const [carrier, depots] = await Promise.all([getCarrier(), listDepots(carrierId)]);
  if (!carrier) return <MissingCarrier />;

  return (
    <>
      <Link href="/carrier/fleet" className="mb-3 inline-flex min-h-11 items-center text-sm text-gray">
        ← 拠点・車両
      </Link>
      <PageHeader eyebrow="IMPORT" title="拠点をまとめて登録">
        工場・営業所の一覧（Excel など）を貼り付けると、まとめて拠点に登録できます。今の拠点は {depots.length}件です。
      </PageHeader>
      <Section>
        <ImportForm existing={depots.map((d) => d.name)} />
      </Section>
    </>
  );
}
