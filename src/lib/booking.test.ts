import { describe, expect, it } from "vitest";
import { canCancel, isPhone, stepIndex } from "./booking";

describe("stepIndex", () => {
  it("申込 → 予約確定 → 積込 → 輸送中 → 受け渡し", () => {
    expect(stepIndex("requested")).toBe(0);
    expect(stepIndex("confirmed")).toBe(1);
    expect(stepIndex("loaded")).toBe(2);
    expect(stepIndex("in_transit")).toBe(3);
    expect(stepIndex("delivered")).toBe(4);
  });
  it("お断り・キャンセル・運休は段階なし", () => {
    expect(stepIndex("rejected")).toBeNull();
    expect(stepIndex("cancelled")).toBeNull();
    expect(stepIndex("trip_cancelled")).toBeNull();
  });
});

describe("canCancel", () => {
  const cutoff = "2026-12-01T01:00:00Z";
  it("締切までは申込中・予約確定ならキャンセルできる", () => {
    const before = new Date("2026-12-01T00:59:00Z");
    expect(canCancel("requested", cutoff, before)).toBe(true);
    expect(canCancel("confirmed", cutoff, before)).toBe(true);
    expect(canCancel("loaded", cutoff, before)).toBe(false);
  });
  it("締切を過ぎたらできない", () => {
    expect(canCancel("confirmed", cutoff, new Date("2026-12-01T01:01:00Z"))).toBe(false);
  });
});

describe("isPhone", () => {
  it("区切りがあってもよい", () => {
    expect(isPhone("090-1234-5678")).toBe(true);
    expect(isPhone("052 123 4567")).toBe(true);
    expect(isPhone("12345")).toBe(false);
    expect(isPhone("1234567890")).toBe(false);
  });
});
