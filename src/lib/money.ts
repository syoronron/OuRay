/**
 * 金額の計算（すべて円の整数）。
 * データベースの create_booking() と同じ計算をする（画面の見積りと、確定した金額がずれないように）。
 * 変えるときは、supabase/migrations の create_booking() も一緒に直すこと。
 */

/** 消費税率（10%） */
export const TAX_RATE_PERCENT = 10;

export type Quote = {
  /** パレット枠の運賃（単価 × 枠数） */
  palletAmount: number;
  /** 寄り道（拠点以外での集荷・配達）の料金 */
  detourAmount: number;
  /** 運賃の合計（税抜）＝ 運送会社が荷主に請求する額 */
  freightAmount: number;
  /** 消費税 */
  tax: number;
  /** 荷主が払う額（税込） */
  total: number;
  /** OuRay の手数料（税抜）＝ OuRay が運送会社に請求する額 */
  feeAmount: number;
  /** 運送会社の受取額の目安（運賃 − 手数料。税抜） */
  carrierNet: number;
};

export function quote(input: {
  pricePerPallet: number;
  pallets: number;
  detours: number;
  detourFee: number;
  /** 手数料率（1bp = 0.01%。10% なら 1000） */
  feeRateBp: number;
}): Quote {
  const { pricePerPallet, pallets, detours, detourFee, feeRateBp } = input;
  for (const [name, v] of Object.entries(input)) {
    if (!Number.isInteger(v) || v < 0) throw new RangeError(`${name} は0以上の整数で指定してください`);
  }
  if (feeRateBp > 10000) throw new RangeError("feeRateBp は 10000（100%）以下で指定してください");

  const palletAmount = pricePerPallet * pallets;
  const detourAmount = detours * detourFee;
  const freightAmount = palletAmount + detourAmount;
  // 1円未満は切り捨て（DB の integer 同士の割り算と同じ）
  const tax = Math.floor((freightAmount * TAX_RATE_PERCENT) / 100);
  const feeAmount = Math.floor((freightAmount * feeRateBp) / 10000);
  return {
    palletAmount,
    detourAmount,
    freightAmount,
    tax,
    total: freightAmount + tax,
    feeAmount,
    carrierNet: freightAmount - feeAmount,
  };
}

/** 画面表示用：1234567 → "1,234,567" */
export function yen(amount: number): string {
  return amount.toLocaleString("ja-JP");
}
