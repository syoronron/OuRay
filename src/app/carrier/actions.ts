"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { failure, success, type ActionState } from "@/lib/action-state";
import { isAdmin } from "@/lib/auth";
import {
  db,
  getTrip,
  listCategories,
  listDepots,
  listRoutes,
  listVehicles,
  requireCarrier,
  type Vehicle,
} from "@/lib/data/carrier";
import { BODY_TYPES, DIRECTIONS, PLATE_KINDS, TEMPERATURES, TRIP_STATUSES } from "@/lib/labels";
import { addDays, jstToDate, parseTime, todayJst } from "@/lib/time";
import { GENERATE_DAYS, generateTrips } from "@/lib/trips/generate";
import { resolveWeek } from "@/lib/week";

/*
 * 運送会社側の操作。
 * どの操作も「デモの運送会社のデータか」をサーバー側で確認してから行う。
 * （P5 でログインを入れたら、ここで「ログイン中の会社か」を確認する）
 */

const LOGIN_REQUIRED = "ログインの有効期限が切れました。ページを再読み込みして、もう一度ログインしてください。";

// ---------- 入力チェック用の部品 ----------

const uuid = z.guid("不正なIDです");
const optionalUuid = z.preprocess((v) => (v === "" || v === undefined ? null : v), uuid.nullable());
const text = (label: string, max = 100) =>
  z.string().trim().min(1, `${label}を入力してください`).max(max, `${label}は${max}文字以内で入力してください`);
const optionalText = (max = 200) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().default(null));
const int = (label: string, min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[,，\s]/g, "") : v),
    z.coerce
      .number({ error: `${label}は数字で入力してください` })
      .int(`${label}は整数で入力してください`)
      .min(min, `${label}は${min}以上にしてください`)
      .max(max, `${label}は${max.toLocaleString()}以下にしてください`),
  );
const optionalInt = (label: string, min: number, max: number) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), int(label, min, max).nullable());
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const time = (label: string) =>
  z
    .string()
    .transform((v) => parseTime(v))
    .refine((v): v is number => v !== null && v < 1440, `${label}の形式が正しくありません`);
const optionalTime = (label: string) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), time(label).nullable());
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません");
const optionalDate = z.preprocess((v) => (v === "" || v === undefined ? null : v), date.nullable());
const oneOf = <T extends string>(map: Record<T, string>, label: string) =>
  z.enum(Object.keys(map) as [T, ...T[]], { error: `${label}を選んでください` });

/** 同じ名前の項目が複数あるもの（曜日・品目のチェックボックス）は配列にする */
const MULTI = new Set(["weekdays", "accepted_categories"]);

function formObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    out[key] = MULTI.has(key) ? formData.getAll(key) : formData.get(key);
  }
  for (const key of MULTI) out[key] ??= [];
  return out;
}

type Parsed<T> = { error: string; data?: never } | { error?: never; data: T };

function parse<T extends z.ZodTypeAny>(schema: T, formData: FormData): Parsed<z.infer<T>> {
  const result = schema.safeParse(formObject(formData));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "入力内容を確認してください" };
  return { data: result.data };
}

/** データベースのエラーを、配車担当者に伝わる言葉に変える */
const RPC_MESSAGES: Record<string, string> = {
  trip_not_found: "便が見つかりません。ページを再読み込みしてください。",
  trip_locked: "出発済み・到着済み・運休の便は変更できません。",
  bad_transition: "今の状態からは、その操作はできません。",
  vehicle_not_green: "白ナンバー（自家用）の車両の便は公開できません。運賃をもらって他社の荷物を運ぶには、緑ナンバー（事業用）が必要です。",
  no_capacity_to_sell: "売る枠（パレット枠・重量）が 0 なので公開できません。先に空きを設定してください。",
  trip_past: "予約の締切を過ぎているので公開できません。",
  has_bookings: "予約が入っているので下書きに戻せません。運休にするか、受付終了にしてください。",
  over_vehicle: "車両の上限（パレット枠数・最大積載量）を超えています。",
  below_booked: "予約済みの量より少なくはできません。",
};

function explain(error: { code?: string; message: string }, conflictMessage?: string): string {
  for (const [key, message] of Object.entries(RPC_MESSAGES)) {
    if (error.message.includes(key)) return message;
  }
  switch (error.code) {
    case "23505":
      return conflictMessage ?? "同じ内容がすでに登録されています。";
    case "23503":
      return "ほかのデータ（定期ルート・便・予約）で使われているため、削除できません。";
    case "23514":
      return "入力内容が条件を満たしていません。数値や時刻を確認してください。";
    default:
      console.error(error);
      return "保存できませんでした。時間をおいてもう一度お試しください。";
  }
}

/** 車両の上限に収まっているか */
function checkCapacity(vehicle: Vehicle, pallets: number, kg: number): string | null {
  if (pallets > vehicle.pallet_slots) {
    return `パレット枠は、車両の上限（${vehicle.pallet_slots}枠）以下にしてください。`;
  }
  if (kg > vehicle.max_load_kg) {
    return `重量は、車両の最大積載量（${vehicle.max_load_kg.toLocaleString()}kg）以下にしてください。`;
  }
  return null;
}

/** 受け入れる品目が正しいか（廃棄物は選べない） */
async function checkCategories(codes: string[]): Promise<string | null> {
  const categories = await listCategories();
  const byCode = new Map(categories.map((c) => [c.code, c]));
  if (codes.length === 0) return "受け入れる品目を1つ以上選んでください。";
  for (const code of codes) {
    const c = byCode.get(code);
    if (!c) return "品目の選び方が正しくありません。ページを再読み込みしてください。";
    if (c.is_waste) {
      return `「${c.name}」は廃棄物のため受け付けられません（廃棄物の収集運搬業の許可が必要です）。`;
    }
  }
  return null;
}

// =====================================================================
// 拠点
// =====================================================================

const depotSchema = z.object({
  id: optionalUuid,
  name: text("拠点の名前", 60),
  area_id: z.string().min(1, "エリアを選んでください"),
  new_area: optionalText(40),
  address: text("住所", 200),
  open_time: optionalTime("荷受けの開始時刻"),
  close_time: optionalTime("荷受けの終了時刻"),
  has_forklift: checkbox,
  note: optionalText(200),
});

export async function saveDepot(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return failure(LOGIN_REQUIRED);
  const parsed = parse(depotSchema, formData);
  if (parsed.error !== undefined) return failure(parsed.error);
  const { id, new_area, open_time, close_time, ...d } = parsed.data;
  if ((open_time === null) !== (close_time === null)) {
    return failure("荷受けの時間は、開始と終了の両方を入力してください（または両方を空にしてください）。");
  }
  if (open_time !== null && close_time !== null && open_time >= close_time) {
    return failure("荷受けの開始時刻は、終了時刻より前にしてください。");
  }
  const carrier = await requireCarrier();

  // エリア：新しく追加する場合は、同じ名前があればそれを使う
  let areaId = d.area_id;
  if (areaId === "new") {
    if (!new_area) return failure("新しいエリアの名前を入力してください。");
    const { data: area, error } = await db()
      .from("areas")
      .upsert({ name: new_area }, { onConflict: "name" })
      .select("id")
      .single();
    if (error) return failure(explain(error));
    areaId = area.id;
  } else if (!uuid.safeParse(areaId).success) {
    return failure("エリアを選んでください。");
  }

  const toTime = (m: number | null) =>
    m === null ? null : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const row = {
    ...d,
    area_id: areaId,
    open_time: toTime(open_time),
    close_time: toTime(close_time),
    company_id: carrier.id,
  };
  const query = id
    ? db().from("depots").update(row).eq("id", id).eq("company_id", carrier.id)
    : db().from("depots").insert(row);
  const { error } = await query;
  if (error) return failure(explain(error, "同じ名前の拠点がすでにあります。"));
  redirect("/carrier/fleet");
}

export async function deleteDepot(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return failure(LOGIN_REQUIRED);
  const parsed = parse(z.object({ id: uuid }), formData);
  if (parsed.error !== undefined) return failure(parsed.error);
  const carrier = await requireCarrier();
  const { error } = await db().from("depots").delete().eq("id", parsed.data.id).eq("company_id", carrier.id);
  if (error) return failure(explain(error));
  redirect("/carrier/fleet");
}

// =====================================================================
// 車両
// =====================================================================

const vehicleSchema = z.object({
  id: optionalUuid,
  name: text("車両の呼び名", 60),
  plate_number: optionalText(40),
  plate_kind: oneOf(PLATE_KINDS, "ナンバーの種類"),
  body_type: oneOf(BODY_TYPES, "車種"),
  bed_length_mm: optionalInt("荷台の長さ", 1, 20000),
  bed_width_mm: optionalInt("荷台の幅", 1, 5000),
  bed_height_mm: optionalInt("荷台の高さ", 1, 5000),
  max_load_kg: int("最大積載量", 1, 30000),
  pallet_slots: int("パレット枠数", 1, 40),
  has_power_gate: checkbox,
  temperature: oneOf(TEMPERATURES, "温度帯"),
});

export async function saveVehicle(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return failure(LOGIN_REQUIRED);
  const parsed = parse(vehicleSchema, formData);
  if (parsed.error !== undefined) return failure(parsed.error);
  const { id, ...v } = parsed.data;
  const carrier = await requireCarrier();

  if (id) {
    // 車両の上限を下げるときは、定期ルートの空きが上限を超えないか確認する
    const routes = (await listRoutes(carrier.id)).filter((r) => r.vehicle_id === id);
    const over = routes.find((r) => r.capacity_pallets > v.pallet_slots || r.capacity_kg > v.max_load_kg);
    if (over) {
      return failure("この車両を使う定期ルートの空きが、新しい上限を超えています。先に定期ルートの空きを減らしてください。");
    }
  }

  const row = { ...v, company_id: carrier.id };
  const query = id
    ? db().from("vehicles").update(row).eq("id", id).eq("company_id", carrier.id)
    : db().from("vehicles").insert(row);
  const { error } = await query;
  if (error) return failure(explain(error, "同じ呼び名の車両がすでにあります。"));
  redirect("/carrier/fleet");
}

export async function deleteVehicle(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return failure(LOGIN_REQUIRED);
  const parsed = parse(z.object({ id: uuid }), formData);
  if (parsed.error !== undefined) return failure(parsed.error);
  const carrier = await requireCarrier();
  const { error } = await db().from("vehicles").delete().eq("id", parsed.data.id).eq("company_id", carrier.id);
  if (error) return failure(explain(error));
  redirect("/carrier/fleet");
}

// =====================================================================
// 定期ルート
// =====================================================================

/** ルートと単発便で共通の項目 */
const tripFields = {
  vehicle_id: uuid,
  origin_depot_id: uuid,
  dest_depot_id: uuid,
  depart_time: time("出発時刻"),
  duration_h: int("所要時間（時間）", 0, 72),
  duration_m: int("所要時間（分）", 0, 59),
  capacity_pallets: int("売るパレット枠", 0, 40),
  capacity_kg: int("売る重量", 0, 30000),
  price_per_pallet: int("1枠の料金", 0, 1_000_000),
  booking_cutoff_hours: int("予約の締切", 0, 336),
  requires_approval: checkbox,
  accepted_categories: z.array(z.string()),
  detour_max_km: int("寄り道できる距離", 0, 100),
  detour_fee: int("寄り道1か所の料金", 0, 1_000_000),
};

const routeSchema = z.object({
  id: optionalUuid,
  number: optionalInt("便名の番号", 1, 9999),
  direction: oneOf(DIRECTIONS, "行き・帰り"),
  paired_route_id: optionalUuid,
  weekdays: z
    .array(z.coerce.number().int().min(0).max(6))
    .min(1, "運行する曜日を1つ以上選んでください"),
  active_from: date,
  active_until: optionalDate,
  ...tripFields,
});

type TripFieldValues = {
  vehicle_id: string;
  origin_depot_id: string;
  dest_depot_id: string;
  duration_h: number;
  duration_m: number;
  capacity_pallets: number;
  capacity_kg: number;
  accepted_categories: string[];
};

/** ルート・単発便の共通チェック。問題なければ所要時間（分）を返す */
async function checkTripFields(
  companyId: string,
  v: TripFieldValues,
): Promise<{ error: string } | { durationMinutes: number }> {
  if (v.origin_depot_id === v.dest_depot_id) return { error: "出発地と到着地は別の拠点にしてください。" };
  const durationMinutes = v.duration_h * 60 + v.duration_m;
  if (durationMinutes < 10) return { error: "所要時間は10分以上にしてください。" };
  if (durationMinutes > 72 * 60) return { error: "所要時間は72時間以内にしてください。" };

  const [vehicles, depots] = await Promise.all([listVehicles(companyId), listDepots(companyId)]);
  const vehicle = vehicles.find((x) => x.id === v.vehicle_id);
  if (!vehicle) return { error: "車両を選んでください。" };
  const depotIds = new Set(depots.map((d) => d.id));
  if (!depotIds.has(v.origin_depot_id) || !depotIds.has(v.dest_depot_id)) {
    return { error: "出発地・到着地の拠点を選んでください。" };
  }
  const capacityError = checkCapacity(vehicle, v.capacity_pallets, v.capacity_kg);
  if (capacityError) return { error: capacityError };
  const categoryError = await checkCategories(v.accepted_categories);
  if (categoryError) return { error: categoryError };
  return { durationMinutes };
}

const toTimeString = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export async function saveRoute(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return failure(LOGIN_REQUIRED);
  const parsed = parse(routeSchema, formData);
  if (parsed.error !== undefined) return failure(parsed.error);
  const { id, duration_h, duration_m, depart_time, weekdays, paired_route_id, ...r } = parsed.data;
  if (r.active_until && r.active_until < r.active_from) {
    return failure("有効期間の終わりは、始まりより後の日付にしてください。");
  }
  const carrier = await requireCarrier();
  const checked = await checkTripFields(carrier.id, { ...r, duration_h, duration_m });
  if ("error" in checked) return failure(checked.error);

  if (paired_route_id) {
    const routes = await listRoutes(carrier.id);
    if (paired_route_id === id || !routes.some((x) => x.id === paired_route_id)) {
      return failure("組になるルートの選び方が正しくありません。");
    }
  }

  const row = {
    ...r,
    company_id: carrier.id,
    paired_route_id,
    weekdays: [...new Set(weekdays)].sort(),
    depart_time: toTimeString(depart_time),
    duration_minutes: checked.durationMinutes,
  };
  const query = id
    ? db().from("routes").update(row).eq("id", id).eq("company_id", carrier.id).select("id").single()
    : db().from("routes").insert(row).select("id").single();
  const { data, error } = await query;
  if (error) return failure(explain(error, "同じ便名の番号が、ほかの定期ルートで使われています。"));

  // 組になるルートからも、このルートをたどれるようにする（まだ組がないときだけ）
  if (paired_route_id) {
    await db()
      .from("routes")
      .update({ paired_route_id: data.id })
      .eq("id", paired_route_id)
      .eq("company_id", carrier.id)
      .is("paired_route_id", null);
  }
  redirect("/carrier/routes");
}

export async function deleteRoute(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return failure(LOGIN_REQUIRED);
  const parsed = parse(z.object({ id: uuid }), formData);
  if (parsed.error !== undefined) return failure(parsed.error);
  const carrier = await requireCarrier();
  // 作った便は残る（単発の便として扱われる）
  const { error } = await db().from("routes").delete().eq("id", parsed.data.id).eq("company_id", carrier.id);
  if (error) return failure(explain(error));
  redirect("/carrier/routes");
}

// =====================================================================
// 便
// =====================================================================

/** 定期ルートから、今日から4週間分の便を作る */
export async function regenerateTrips(): Promise<ActionState> {
  if (!(await isAdmin())) return failure(LOGIN_REQUIRED);
  const carrier = await requireCarrier();
  const routes = await listRoutes(carrier.id);
  if (routes.length === 0) return failure("定期ルートがありません。「ルート」で定期ルートを登録してください。");

  const today = todayJst();
  const last = addDays(today, GENERATE_DAYS - 1);
  const candidates = generateTrips({
    routes: routes.map((r) => ({
      id: r.id,
      weekdays: r.weekdays,
      departMinutes: r.depart,
      durationMinutes: r.duration_minutes,
      bookingCutoffHours: r.booking_cutoff_hours,
      activeFrom: r.active_from,
      activeUntil: r.active_until,
    })),
    from: today,
    to: last,
    now: new Date(),
  });

  const { data, error } = await db().rpc("regenerate_trips", {
    p_company_id: carrier.id,
    p_from: jstToDate(today, 0).toISOString(),
    p_to: jstToDate(addDays(last, 1), 0).toISOString(),
    p_trips: candidates.map((c) => ({
      route_id: c.routeId,
      depart_at: c.departAt.toISOString(),
      arrive_at: c.arriveAt.toISOString(),
      booking_cutoff_at: c.bookingCutoffAt.toISOString(),
    })),
  });
  if (error) return failure(explain(error));
  refresh();
  const created = (data as { created: number; removed: number }[])[0]?.created ?? 0;
  return success(
    created === 0
      ? "新しく作る便はありませんでした（4週間分はすでに作られています）。"
      : `便を${created}件作りました（下書き）。内容を確認して「公開」してください。`,
  );
}

/** 表示中の週の下書きを、まとめて公開する */
export async function publishWeek(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return failure(LOGIN_REQUIRED);
  const week = resolveWeek(String(formData.get("week") ?? ""));
  const carrier = await requireCarrier();
  const { data, error } = await db().rpc("publish_drafts", {
    p_company_id: carrier.id,
    p_from: jstToDate(week.from, 0).toISOString(),
    p_to: jstToDate(addDays(week.to, 1), 0).toISOString(),
  });
  if (error) return failure(explain(error));
  refresh();
  return data === 0
    ? failure("公開できる下書きがありません（売る枠が 0 の便・締切を過ぎた便は公開できません）。")
    : success(`${data}件の便を公開しました。荷主の検索に表示されます。`);
}

const statusSchema = z.object({
  id: uuid,
  status: oneOf(TRIP_STATUSES, "状態"),
  message: optionalText(200),
});

export async function setTripStatus(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return failure(LOGIN_REQUIRED);
  const parsed = parse(statusSchema, formData);
  if (parsed.error !== undefined) return failure(parsed.error);
  const carrier = await requireCarrier();
  const { data, error } = await db().rpc("set_trip_status", {
    p_company_id: carrier.id,
    p_trip_id: parsed.data.id,
    p_status: parsed.data.status,
    p_message: parsed.data.message,
  });
  if (error) return failure(explain(error));
  refresh();
  const messages: Partial<Record<keyof typeof TRIP_STATUSES, string>> = {
    published: "公開しました。荷主の検索に表示されます。",
    closed: "受付を終了しました。新しい予約は入りません。",
    draft: "下書きに戻しました。",
    cancelled:
      data > 0
        ? `運休にしました。予約していた${data}件の荷主のページに「運休」と表示されます。OuRay の運営からも連絡します。`
        : "運休にしました。",
  };
  return success(messages[parsed.data.status] ?? "変更しました。");
}

const updateTripSchema = z.object({
  id: uuid,
  capacity_pallets: tripFields.capacity_pallets,
  capacity_kg: tripFields.capacity_kg,
  price_per_pallet: tripFields.price_per_pallet,
  accepted_categories: tripFields.accepted_categories,
});

export async function updateTrip(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return failure(LOGIN_REQUIRED);
  const parsed = parse(updateTripSchema, formData);
  if (parsed.error !== undefined) return failure(parsed.error);
  const t = parsed.data;
  const categoryError = await checkCategories(t.accepted_categories);
  if (categoryError) return failure(categoryError);
  const carrier = await requireCarrier();
  const { error } = await db().rpc("update_trip", {
    p_company_id: carrier.id,
    p_trip_id: t.id,
    p_capacity_pallets: t.capacity_pallets,
    p_capacity_kg: t.capacity_kg,
    p_price_per_pallet: t.price_per_pallet,
    p_accepted_categories: t.accepted_categories,
  });
  if (error) return failure(explain(error));
  refresh();
  return success("保存しました。");
}

const newTripSchema = z.object({ date, ...tripFields });

/** 単発の便を追加する（P1-9） */
export async function addTrip(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return failure(LOGIN_REQUIRED);
  const parsed = parse(newTripSchema, formData);
  if (parsed.error !== undefined) return failure(parsed.error);
  const { date: day, depart_time, duration_h, duration_m, booking_cutoff_hours, ...t } = parsed.data;
  const carrier = await requireCarrier();
  const checked = await checkTripFields(carrier.id, { ...t, duration_h, duration_m });
  if ("error" in checked) return failure(checked.error);

  const departAt = jstToDate(day, depart_time);
  const bookingCutoffAt = new Date(departAt.getTime() - booking_cutoff_hours * 3_600_000);
  if (bookingCutoffAt.getTime() <= Date.now()) {
    return failure("予約の締切がすでに過ぎています。出発日時か締切を見直してください。");
  }
  const { data, error } = await db()
    .from("trips")
    .insert({
      ...t,
      company_id: carrier.id,
      route_id: null,
      depart_at: departAt.toISOString(),
      arrive_at: new Date(departAt.getTime() + checked.durationMinutes * 60_000).toISOString(),
      booking_cutoff_at: bookingCutoffAt.toISOString(),
      status: "draft",
    })
    .select("id")
    .single();
  if (error) return failure(explain(error));
  redirect(`/carrier/trips/${data.id}`);
}

export async function deleteTrip(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return failure(LOGIN_REQUIRED);
  const parsed = parse(z.object({ id: uuid }), formData);
  if (parsed.error !== undefined) return failure(parsed.error);
  const carrier = await requireCarrier();
  const trip = await getTrip(carrier.id, parsed.data.id);
  if (!trip) return failure(RPC_MESSAGES.trip_not_found);
  if (trip.status !== "draft") return failure("削除できるのは下書きの便だけです。公開した便は「運休」にしてください。");
  const { error } = await db().from("trips").delete().eq("id", trip.id).eq("company_id", carrier.id).eq("status", "draft");
  if (error) return failure(explain(error));
  redirect("/carrier");
}
