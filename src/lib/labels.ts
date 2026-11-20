/** 画面に出す言葉（データベースの値 → 日本語） */

export const BODY_TYPES = {
  flat: "平ボディ",
  van: "バン",
  wing: "ウイング",
  car_carrier: "キャリアカー",
  other: "その他",
} as const;
export type BodyType = keyof typeof BODY_TYPES;

export const TEMPERATURES = {
  ambient: "常温",
  chilled: "冷蔵",
  frozen: "冷凍",
} as const;
export type Temperature = keyof typeof TEMPERATURES;

export const PLATE_KINDS = {
  green: "緑ナンバー（事業用）",
  white: "白ナンバー（自家用）",
} as const;
export type PlateKind = keyof typeof PLATE_KINDS;

export const DIRECTIONS = {
  outbound: "行き",
  return: "帰り",
} as const;
export type Direction = keyof typeof DIRECTIONS;

export const TRIP_STATUSES = {
  draft: "下書き",
  published: "公開中",
  closed: "受付終了",
  departed: "出発",
  completed: "到着",
  cancelled: "運休",
} as const;
export type TripStatus = keyof typeof TRIP_STATUSES;

export function isOneOf<T extends string>(map: Record<T, string>, value: unknown): value is T {
  return typeof value === "string" && Object.hasOwn(map, value);
}
