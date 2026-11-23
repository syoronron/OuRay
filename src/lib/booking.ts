/**
 * 予約まわりの決まりごと（データベースに依存しない。テストあり）。
 */

/** OuRay の手数料率（1bp = 0.01%）。成約額の10%。運送会社に請求する（荷主の支払額には含まれない） */
export const FEE_RATE_BP = 1000;

/** 予約時に同意してもらう約款・利用規約の版。文面を変えたら上げる */
export const TERMS_VERSION = "2026-11-draft";

export const PACKAGING = {
  pallet: "パレット",
  carton: "段ボール",
  cart: "カゴ台車",
  other: "その他",
} as const;
export type Packaging = keyof typeof PACKAGING;

export const BOOKING_STATUSES = {
  requested: "申込中",
  confirmed: "予約確定",
  rejected: "お断り",
  cancelled: "キャンセル",
  trip_cancelled: "運休",
  loaded: "積込済み",
  in_transit: "輸送中",
  delivered: "受け渡し済み",
} as const;
export type BookingStatus = keyof typeof BOOKING_STATUSES;

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && Object.hasOwn(BOOKING_STATUSES, value);
}

/** 荷主のページに出す進み具合（Zicci の「応募状況」と同じ考え方） */
export const STEPS = ["申込", "予約確定", "積込", "輸送中", "受け渡し"] as const;

/** いま何番目の段階まで進んだか（0始まり）。終わってしまった予約（お断り・キャンセル・運休）は null */
export function stepIndex(status: BookingStatus): number | null {
  switch (status) {
    case "requested":
      return 0;
    case "confirmed":
      return 1;
    case "loaded":
      return 2;
    case "in_transit":
      return 3;
    case "delivered":
      return 4;
    default:
      return null;
  }
}

/** 荷主が自分でキャンセルできるか（予約の締切まで、申込中・予約確定のとき） */
export function canCancel(status: BookingStatus, bookingCutoffAt: string, now: Date): boolean {
  return (status === "requested" || status === "confirmed") && now.getTime() <= new Date(bookingCutoffAt).getTime();
}

/** 電話番号として最低限の形か（数字が10〜11桁） */
export function isPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 11 && digits.startsWith("0");
}
