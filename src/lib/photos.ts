import "server-only";

import { db } from "@/lib/data/carrier";

/**
 * 荷物の写真（Supabase Storage の booking-photos。公開しない保存場所）。
 * 写真は端末で縮小（長い辺1600px・JPEG）してから送る（photo-input.tsx）。
 * 表示するときは、1時間だけ有効な URL を作る（URL が漏れても、時間がたてば見られない）。
 */
export const PHOTO_BUCKET = "booking-photos";
const MAX_BYTES = 3 * 1024 * 1024;
const SIGNED_SECONDS = 60 * 60;

/** フォームの写真を保存して、保存先のパスを返す。写真がなければ null。形式が違えばエラーの文 */
export async function savePhoto(value: FormDataEntryValue | null, folder: string): Promise<{ path: string | null } | { error: string }> {
  if (!(value instanceof File) || value.size === 0) return { path: null };
  if (!["image/jpeg", "image/png", "image/webp"].includes(value.type)) {
    return { error: "写真は JPEG・PNG・WebP の画像を選んでください。" };
  }
  if (value.size > MAX_BYTES) return { error: "写真が大きすぎます（3MBまで）。撮り直してください。" };
  const ext = value.type === "image/png" ? "png" : value.type === "image/webp" ? "webp" : "jpg";
  const path = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await db().storage.from(PHOTO_BUCKET).upload(path, value, { contentType: value.type, upsert: false });
  if (error) {
    console.error(error);
    return {
      error: /bucket/i.test(error.message)
        ? "写真の保存場所がありません。Supabase で 20261206000000_operations.sql を実行してください。"
        : "写真を保存できませんでした。写真なしで記録するか、時間をおいてお試しください。",
    };
  }
  return { path };
}

/** 写真のパス → 表示用の URL（1時間だけ有効）。作れなかったものは入らない */
export async function signedPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await db().storage.from(PHOTO_BUCKET).createSignedUrls(unique, SIGNED_SECONDS);
  if (error || !data) {
    console.error(error);
    return new Map();
  }
  const map = new Map<string, string>();
  for (const d of data) if (d.path && d.signedUrl) map.set(d.path, d.signedUrl);
  return map;
}
