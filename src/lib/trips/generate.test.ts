import { describe, expect, it } from "vitest";
import { generateTrips, type RouteSchedule } from "./generate";

// 東京 → 名古屋（帰り）毎週水・土 10:00 発、7時間、締切24時間前
const route: RouteSchedule = {
  id: "r1",
  weekdays: [3, 6],
  departMinutes: 600,
  durationMinutes: 420,
  bookingCutoffHours: 24,
  activeFrom: "2026-01-01",
  activeUntil: null,
};

// 2026-11-30 は月曜
const now = new Date("2026-11-29T00:00:00+09:00");

describe("generateTrips", () => {
  it("運行する曜日だけ便を作る", () => {
    const trips = generateTrips({ routes: [route], from: "2026-11-30", to: "2026-12-13", now });
    expect(trips.map((t) => t.date)).toEqual(["2026-12-02", "2026-12-05", "2026-12-09", "2026-12-12"]);
  });

  it("出発・到着・締切を日本時間で計算する", () => {
    const [trip] = generateTrips({ routes: [route], from: "2026-12-02", to: "2026-12-02", now });
    expect(trip.departAt.toISOString()).toBe("2026-12-02T01:00:00.000Z"); // 10:00 JST
    expect(trip.arriveAt.toISOString()).toBe("2026-12-02T08:00:00.000Z"); // 17:00 JST
    expect(trip.bookingCutoffAt.toISOString()).toBe("2026-12-01T01:00:00.000Z"); // 前日 10:00 JST
  });

  it("日をまたぐ便は翌日に到着する", () => {
    const night = { ...route, departMinutes: 22 * 60, durationMinutes: 8 * 60 };
    const [trip] = generateTrips({ routes: [night], from: "2026-12-02", to: "2026-12-02", now });
    expect(trip.arriveAt.toISOString()).toBe("2026-12-02T21:00:00.000Z"); // 12/3 6:00 JST
  });

  it("締切が過ぎた便は作らない", () => {
    // 12/2 10:00 発の締切は 12/1 10:00。その直後
    const late = new Date("2026-12-01T10:00:00+09:00");
    const trips = generateTrips({ routes: [route], from: "2026-11-30", to: "2026-12-06", now: late });
    expect(trips.map((t) => t.date)).toEqual(["2026-12-05"]);
  });

  it("ルートの有効期間の外には作らない", () => {
    const limited = { ...route, activeFrom: "2026-12-03", activeUntil: "2026-12-10" };
    const trips = generateTrips({ routes: [limited], from: "2026-11-30", to: "2026-12-13", now });
    expect(trips.map((t) => t.date)).toEqual(["2026-12-05", "2026-12-09"]);
  });

  it("複数のルートを出発順に並べる", () => {
    const early = { ...route, id: "r0", weekdays: [3], departMinutes: 360 };
    const trips = generateTrips({ routes: [route, early], from: "2026-12-02", to: "2026-12-02", now });
    expect(trips.map((t) => t.routeId)).toEqual(["r0", "r1"]);
  });

  it("曜日がないルートは作らない", () => {
    expect(generateTrips({ routes: [{ ...route, weekdays: [] }], from: "2026-11-30", to: "2026-12-13", now })).toEqual([]);
  });
});
