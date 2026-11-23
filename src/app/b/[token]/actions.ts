"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { failure, success, type ActionState } from "@/lib/action-state";
import { db } from "@/lib/data/carrier";

/** 荷主が予約確認ページからキャンセルする（予約の締切まで） */
export async function cancelMyBooking(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      token: z.string().regex(/^[0-9a-f]{64}$/),
      message: z.string().trim().max(200).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failure("ページを再読み込みしてから、もう一度お試しください。");

  const { error } = await db().rpc("cancel_booking", {
    p_access_token: parsed.data.token,
    p_message: parsed.data.message || null,
  });
  if (error) {
    if (error.message.includes("cannot_cancel")) {
      return failure("この予約は、もうキャンセルできません（締切を過ぎたか、すでに終わっています）。運送会社にお電話ください。");
    }
    if (!error.message.includes("booking_not_found")) console.error(error);
    return failure("キャンセルできませんでした。時間をおいてもう一度お試しください。");
  }
  refresh();
  return success("キャンセルしました。");
}
