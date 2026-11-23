import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader, Section, SetupNotice } from "@/components/page-header";
import { requireAdminPage } from "@/lib/auth";
import { getCarrier, getDepot, isDatabaseConfigured, listAreas } from "@/lib/data/carrier";
import { formatTime } from "@/lib/time";
import { deleteDepot, saveDepot } from "../../../actions";
import { MissingCarrier } from "../../../notices";
import { Field } from "../../../trip-fields";

/** 拠点の追加（/carrier/fleet/depots/new）・編集 */
export default async function DepotPage({ params }: PageProps<"/carrier/fleet/depots/[id]">) {
  const { id } = await params;
  await requireAdminPage();
  if (!isDatabaseConfigured()) return <SetupNotice />;
  const carrier = await getCarrier();
  if (!carrier) return <MissingCarrier />;
  const isNew = id === "new";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [depot, areas] = await Promise.all([isNew ? null : getDepot(carrier.id, id), listAreas()]);
  if (!isNew && !depot) notFound();

  return (
    <>
      <Link href="/carrier/fleet" className="mb-3 inline-flex min-h-11 items-center text-sm text-gray">
        ← 拠点・車両
      </Link>
      <PageHeader eyebrow={isNew ? "NEW DEPOT" : "DEPOT"} title={isNew ? "拠点を追加" : "拠点を編集"} />
      <div className="grid gap-4">
        <Section>
          <ActionForm action={saveDepot} className="grid gap-4">
            {depot && <input type="hidden" name="id" value={depot.id} />}
            <Field label="拠点の名前" hint="例：名古屋センター、〇〇店">
              <input name="name" defaultValue={depot?.name} maxLength={60} required className="field" />
            </Field>
            <Field label="エリア" hint="荷主が便を探すときの地域です。">
              <select name="area_id" defaultValue={depot?.area_id ?? ""} required className="field">
                <option value="" disabled>
                  選んでください
                </option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                <option value="new">新しいエリアを追加…</option>
              </select>
            </Field>
            <Field label="新しいエリアの名前" hint="上で「新しいエリアを追加」を選んだときだけ入力します（例：大阪）。">
              <input name="new_area" maxLength={40} className="field" />
            </Field>
            <Field label="住所">
              <input name="address" defaultValue={depot?.address} maxLength={200} required className="field" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="荷受けの開始">
                <input
                  name="open_time"
                  type="time"
                  defaultValue={depot?.open != null ? formatTime(depot.open) : ""}
                  className="field num"
                />
              </Field>
              <Field label="荷受けの終了">
                <input
                  name="close_time"
                  type="time"
                  defaultValue={depot?.close != null ? formatTime(depot.close) : ""}
                  className="field num"
                />
              </Field>
            </div>
            <label className="flex min-h-11 items-center gap-3 border border-line bg-white px-3 text-sm">
              <input type="checkbox" name="has_forklift" defaultChecked={depot?.has_forklift} className="size-5 accent-[#0058aa]" />
              フォークリフトがある
            </label>
            <Field label="荷主へのメモ（任意）" hint="搬入口の場所・駐車の注意など。予約した荷主に表示します。">
              <input name="note" defaultValue={depot?.note ?? ""} maxLength={200} className="field" />
            </Field>
            <SubmitButton variant="accent" pendingText="保存中…">
              {isNew ? "拠点を追加する" : "保存する"}
            </SubmitButton>
          </ActionForm>
        </Section>
        {depot && (
          <ActionForm action={deleteDepot} confirm="この拠点を削除します。よろしいですか？">
            <input type="hidden" name="id" value={depot.id} />
            <SubmitButton variant="danger" className="w-full" pendingText="削除中…">
              この拠点を削除する
            </SubmitButton>
            <p className="mt-1 text-center text-xs text-gray">定期ルートや便で使っている拠点は削除できません。</p>
          </ActionForm>
        )}
      </div>
    </>
  );
}
