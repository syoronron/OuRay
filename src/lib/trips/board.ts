/**
 * 便の一覧（空港の出発便一覧のような表示）で使う、便名と状況の決め方。
 * データベースに依存しない純粋な計算（テストあり）。
 */

/** 便名：運送会社の略号 ＋ 定期ルートの番号（例：DM102）。臨時の便は「臨時」 */
export function tripCode(companyCode: string | null, routeNumber: number | null): string {
  if (routeNumber === null) return "臨時";
  return `${companyCode ?? "OR"}${routeNumber}`;
}

/** 残りがこの枠数以下なら「残りわずか」 */
export const FEW_LEFT = 2;

export type BoardTone = "open" | "few" | "full" | "closed" | "cancelled" | "draft" | "done";

export type BoardStatus = { label: string; tone: BoardTone };

/** 状況の札（受付中・残りわずか・満載・受付終了・運休 など） */
export function boardStatus(
  trip: {
    status: string;
    capacity_pallets: number;
    booked_pallets: number;
    booking_cutoff_at: string;
  },
  now: Date,
): BoardStatus {
  switch (trip.status) {
    case "cancelled":
      return { label: "運休", tone: "cancelled" };
    case "departed":
      return { label: "出発済み", tone: "done" };
    case "completed":
      return { label: "到着済み", tone: "done" };
    case "draft":
      return { label: "下書き", tone: "draft" };
    case "closed":
      return { label: "受付終了", tone: "closed" };
  }
  if (new Date(trip.booking_cutoff_at).getTime() <= now.getTime()) return { label: "受付終了", tone: "closed" };
  const free = trip.capacity_pallets - trip.booked_pallets;
  if (free <= 0) return { label: "満載", tone: "full" };
  if (free <= FEW_LEFT) return { label: `残り${free}枠`, tone: "few" };
  return { label: "受付中", tone: "open" };
}

/** 荷主が予約できる状況か */
export function isBookable(status: BoardStatus): boolean {
  return status.tone === "open" || status.tone === "few";
}
