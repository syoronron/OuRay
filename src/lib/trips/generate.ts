import { addDays, jstToDate, weekdayOf } from "@/lib/time";

/**
 * 定期ルートから便を作るロジック（データベースに依存しない純粋な計算）。
 * Zicci の「シフト → 面接枠」の自動生成と同じ考え方。
 *
 *   定期ルートごとに、期間内の日付のうち
 *     ・運行する曜日で
 *     ・ルートの有効期間内で
 *     ・予約の締切がまだ来ていない
 *   日を「便」の候補にする。
 *
 * 車両・空き・料金などはデータベースの regenerate_trips() でルートから写すので、
 * ここでは「いつ出発・到着・締切か」だけを決める。
 */

/** 定期ルートから何日先まで便を作るか（今日を含む） */
export const GENERATE_DAYS = 28;

export type RouteSchedule = {
  id: string;
  /** 運行する曜日。0=日曜 … 6=土曜 */
  weekdays: number[];
  /** 出発時刻（0時からの分） */
  departMinutes: number;
  /** 所要時間（分） */
  durationMinutes: number;
  /** 予約の締切（出発の何時間前か） */
  bookingCutoffHours: number;
  /** 有効期間（YYYY-MM-DD。この日を含む） */
  activeFrom: string;
  activeUntil: string | null;
};

export type TripCandidate = {
  routeId: string;
  /** 出発日（日本時間） */
  date: string;
  departAt: Date;
  arriveAt: Date;
  bookingCutoffAt: Date;
};

export function generateTrips(input: {
  routes: RouteSchedule[];
  /** 対象期間の初日（日本時間の日付。この日を含む） */
  from: string;
  /** 対象期間の最終日（この日を含む） */
  to: string;
  /** 締切がこの時刻以前の便は作らない（もう予約を受けられないため） */
  now: Date;
}): TripCandidate[] {
  const result: TripCandidate[] = [];
  for (const route of input.routes) {
    if (route.durationMinutes <= 0 || route.weekdays.length === 0) continue;
    const weekdays = new Set(route.weekdays);
    for (let date = input.from; date <= input.to; date = addDays(date, 1)) {
      if (!weekdays.has(weekdayOf(date))) continue;
      if (date < route.activeFrom) continue;
      if (route.activeUntil && date > route.activeUntil) continue;

      const departAt = jstToDate(date, route.departMinutes);
      const arriveAt = new Date(departAt.getTime() + route.durationMinutes * 60_000);
      const bookingCutoffAt = new Date(departAt.getTime() - route.bookingCutoffHours * 3_600_000);
      if (bookingCutoffAt.getTime() <= input.now.getTime()) continue;

      result.push({ routeId: route.id, date, departAt, arriveAt, bookingCutoffAt });
    }
  }
  return result.sort((a, b) => a.departAt.getTime() - b.departAt.getTime() || a.routeId.localeCompare(b.routeId));
}
