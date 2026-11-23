"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { failure, type ActionState } from "@/lib/action-state";
import { FEE_RATE_BP, PACKAGING, TERMS_VERSION, isPhone } from "@/lib/booking";
import { loadBoardTrip } from "@/lib/data/board";
import { db } from "@/lib/data/carrier";
import { allowRequest } from "@/lib/request-throttle";
import { boardStatus, isBookable } from "@/lib/trips/board";

/*
 * 荷主の操作（公開ページ）。ログインはまだないので、入力された会社名・電話番号で荷主を見分ける。
 * 予約できるかどうか（空き・締切・品目・寄り道）は、最後はデータベースの request_booking() が確かめる。
 */

const text = (label: string, max: number) =>
  z.string().trim().min(1, `${label}を入力してください`).max(max, `${label}は${max}文字以内で入力してください`);
const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().default(null));
const phone = (label: string) =>
  z.string().trim().refine(isPhone, `${label}を、市外局番から入力してください（例：090-1234-5678）`);
const int = (label: string, min: number, max: number) =>
  z.coerce
    .number({ error: `${label}は数字で入力してください` })
    .int(`${label}は整数で入力してください`)
    .min(min, `${label}は${min}以上にしてください`)
    .max(max, `${label}は${max.toLocaleString()}以下にしてください`);
const checked = (message: string) => z.literal("on", { error: message });

const schema = z.object({
  trip_id: z.guid(),
  company_name: text("会社名・施設名", 100),
  contact_name: text("ご担当者のお名前", 50),
  phone: phone("電話番号"),
  email: z.preprocess((v) => (v === "" ? null : v), z.email("メールアドレスの形式が正しくありません").max(200).nullable()),
  cargo_category: z.string().min(1, "品目を選んでください"),
  packaging: z.enum(Object.keys(PACKAGING) as [keyof typeof PACKAGING, ...(keyof typeof PACKAGING)[]], {
    error: "荷姿を選んでください",
  }),
  pieces: int("個数", 1, 9999),
  pallets: int("パレット枠数", 1, 40),
  weight_kg: int("総重量", 1, 30000),
  cargo_description: optionalText(200),
  pickup_mode: z.enum(["depot", "address"]),
  pickup_address: optionalText(200),
  dropoff_mode: z.enum(["depot", "address"]),
  dropoff_address: optionalText(200),
  pickup_contact: text("持ち込む方のお名前", 50),
  pickup_phone: phone("持ち込む方の電話番号"),
  dropoff_contact: text("受け取る方のお名前", 50),
  dropoff_phone: phone("受け取る方の電話番号"),
  no_prohibited: checked("積めない物が入っていないことを確認してください"),
  agree: checked("運送の条件と利用規約への同意が必要です"),
  sealed: z.string().optional(),
});

const MESSAGES: Record<string, string> = {
  shipper_not_approved: "現在、この会社からの予約は受け付けていません。OuRay の運営にお問い合わせください。",
  shipper_info_required: "会社名と電話番号を入力してください。",
  trip_unavailable: "この便は予約を受け付けていません。便の一覧から別の便を選んでください。",
  trip_closed: "この便は予約の締切を過ぎました。便の一覧から別の便を選んでください。",
  no_capacity: "空きが足りません（ほかの方の予約が先に入った可能性があります）。枠数・重量を減らすか、別の便を選んでください。",
  category_waste: "廃棄物は運べません（廃棄物の収集運搬業の許可が必要です）。",
  category_not_accepted: "この便では、選んだ品目を運べません。",
  detour_not_available: "この便は、拠点以外での集荷・配達をしていません。",
};

export async function requestBooking(_: ActionState, formData: FormData): Promise<ActionState> {
  const h = await headers();
  const client = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  if (!allowRequest(`booking:${client}`)) {
    return failure("短い時間に何度も申し込まれたため、受付を一時的に止めています。時間をおいてお試しください。");
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  const f = parsed.data;

  const data = await loadBoardTrip(f.trip_id);
  if (!data) return failure(MESSAGES.trip_unavailable);
  const { trip, categories } = data;
  if (!isBookable(boardStatus(trip, new Date()))) return failure(MESSAGES.trip_unavailable);

  const category = categories.find((c) => c.code === f.cargo_category);
  if (!category || category.is_waste || !trip.accepted_categories.includes(f.cargo_category)) {
    return failure(category?.is_waste ? MESSAGES.category_waste : MESSAGES.category_not_accepted);
  }
  if (category.hygiene && f.sealed !== "on") {
    return failure("使用済みのリネンなどは、密閉した袋・ふた付きの容器に入れてください（確認欄にチェックが必要です）。");
  }

  const pickupAddress = f.pickup_mode === "address" ? f.pickup_address : null;
  const dropoffAddress = f.dropoff_mode === "address" ? f.dropoff_address : null;
  if (f.pickup_mode === "address" && !pickupAddress) return failure("集荷してほしい場所の住所を入力してください。");
  if (f.dropoff_mode === "address" && !dropoffAddress) return failure("届けてほしい場所の住所を入力してください。");
  if ((pickupAddress || dropoffAddress) && trip.detour_max_km === 0) return failure(MESSAGES.detour_not_available);

  const { data: rows, error } = await db().rpc("request_booking", {
    p_trip_id: trip.id,
    p_company_name: f.company_name,
    p_contact_name: f.contact_name,
    p_phone: f.phone,
    p_email: f.email,
    p_cargo_category: f.cargo_category,
    p_cargo_description: f.cargo_description,
    p_packaging: f.packaging,
    p_pieces: f.pieces,
    p_pallets: f.pallets,
    p_weight_kg: f.weight_kg,
    p_pickup_contact: f.pickup_contact,
    p_pickup_phone: f.pickup_phone,
    p_dropoff_contact: f.dropoff_contact,
    p_dropoff_phone: f.dropoff_phone,
    p_fee_rate_bp: FEE_RATE_BP,
    p_terms_version: TERMS_VERSION,
    p_pickup_address: pickupAddress,
    p_dropoff_address: dropoffAddress,
  });
  if (error) {
    const key = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    if (!key) console.error(error);
    return failure(key ? MESSAGES[key] : "申し込めませんでした。時間をおいてもう一度お試しください。");
  }
  const token = (rows as { access_token: string }[])[0]?.access_token;
  if (!token) return failure("申し込めませんでした。時間をおいてもう一度お試しください。");
  redirect(`/b/${token}?new=1`);
}
