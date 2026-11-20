import { describe, expect, it } from "vitest";
import { quote, yen } from "./money";

describe("quote", () => {
  it("パレット枠の運賃と手数料を計算する", () => {
    const q = quote({ pricePerPallet: 8000, pallets: 3, detours: 0, detourFee: 3000, feeRateBp: 1000 });
    expect(q.freightAmount).toBe(24000);
    expect(q.feeAmount).toBe(2400);
    expect(q.carrierNet).toBe(21600);
    expect(q.tax).toBe(2400);
    expect(q.total).toBe(26400);
  });

  it("寄り道の料金を足す（DB の create_booking と同じ：2枠 + 施設での集荷1か所 = 19,000円）", () => {
    const q = quote({ pricePerPallet: 8000, pallets: 2, detours: 1, detourFee: 3000, feeRateBp: 1000 });
    expect(q.palletAmount).toBe(16000);
    expect(q.detourAmount).toBe(3000);
    expect(q.freightAmount).toBe(19000);
  });

  it("1円未満は切り捨てる", () => {
    const q = quote({ pricePerPallet: 999, pallets: 1, detours: 0, detourFee: 0, feeRateBp: 750 });
    expect(q.feeAmount).toBe(74); // 74.925
    expect(q.tax).toBe(99); // 99.9
  });

  it("おかしな値は受け付けない", () => {
    expect(() => quote({ pricePerPallet: -1, pallets: 1, detours: 0, detourFee: 0, feeRateBp: 0 })).toThrow();
    expect(() => quote({ pricePerPallet: 100, pallets: 1.5, detours: 0, detourFee: 0, feeRateBp: 0 })).toThrow();
    expect(() => quote({ pricePerPallet: 100, pallets: 1, detours: 0, detourFee: 0, feeRateBp: 10001 })).toThrow();
  });
});

describe("yen", () => {
  it("3桁ごとに区切る", () => {
    expect(yen(1234567)).toBe("1,234,567");
  });
});
