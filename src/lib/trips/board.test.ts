import { describe, expect, it } from "vitest";
import { boardStatus, isBookable, tripCode } from "./board";

const now = new Date("2026-12-01T00:00:00Z");
const base = { status: "published", capacity_pallets: 10, booked_pallets: 0, booking_cutoff_at: "2026-12-02T00:00:00Z" };

describe("tripCode", () => {
  it("略号と番号をつなぐ。臨時の便は「臨時」", () => {
    expect(tripCode("DM", 102)).toBe("DM102");
    expect(tripCode(null, 7)).toBe("OR7");
    expect(tripCode("DM", null)).toBe("臨時");
  });
});

describe("boardStatus", () => {
  it("空きがあれば受付中", () => {
    expect(boardStatus(base, now)).toEqual({ label: "受付中", tone: "open" });
  });
  it("残りが少なければ残りわずか、0なら満載", () => {
    expect(boardStatus({ ...base, booked_pallets: 8 }, now)).toEqual({ label: "残り2枠", tone: "few" });
    expect(boardStatus({ ...base, booked_pallets: 10 }, now)).toEqual({ label: "満載", tone: "full" });
  });
  it("締切を過ぎたら受付終了", () => {
    expect(boardStatus({ ...base, booking_cutoff_at: "2026-11-30T00:00:00Z" }, now).label).toBe("受付終了");
    expect(boardStatus({ ...base, status: "closed" }, now).label).toBe("受付終了");
  });
  it("運休・出発済み・下書き", () => {
    expect(boardStatus({ ...base, status: "cancelled" }, now).label).toBe("運休");
    expect(boardStatus({ ...base, status: "departed" }, now).label).toBe("出発済み");
    expect(boardStatus({ ...base, status: "draft" }, now).label).toBe("下書き");
  });
  it("予約できるのは受付中と残りわずかだけ", () => {
    expect(isBookable(boardStatus(base, now))).toBe(true);
    expect(isBookable(boardStatus({ ...base, booked_pallets: 9 }, now))).toBe(true);
    expect(isBookable(boardStatus({ ...base, booked_pallets: 10 }, now))).toBe(false);
    expect(isBookable(boardStatus({ ...base, status: "closed" }, now))).toBe(false);
  });
});
