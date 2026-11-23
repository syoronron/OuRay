import { describe, expect, it } from "vitest";
import { parseDepotTable } from "./depot-import";

describe("parseDepotTable", () => {
  it("Excel からのコピー（タブ区切り）を読む。見出しの行は飛ばす", () => {
    const text = "拠点名\tエリア\t住所\t荷受け開始\t荷受け終了\tフォークリフト\tメモ\n" +
      "豊田工場\t愛知\t愛知県豊田市〇〇1\t8:00\t17:00\tあり\t北門から\n" +
      "羽村工場\t東京都下\t東京都羽村市〇〇2\n";
    const r = parseDepotTable(text);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { line: 2, name: "豊田工場", area: "愛知", address: "愛知県豊田市〇〇1", open: "08:00", close: "17:00", hasForklift: true, note: "北門から" },
      { line: 3, name: "羽村工場", area: "東京都下", address: "東京都羽村市〇〇2", open: null, close: null, hasForklift: false, note: null },
    ]);
  });

  it("カンマ区切りも読む（\"...\" の中のカンマは区切らない）", () => {
    const r = parseDepotTable('田原工場,愛知,"愛知県田原市〇〇3号, 1番",６：３０,１８：００,○');
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ name: "田原工場", address: "愛知県田原市〇〇3号, 1番", open: "06:30", close: "18:00", hasForklift: true });
  });

  it("足りない・おかしい行は、行番号つきで知らせる", () => {
    const r = parseDepotTable("A工場\t愛知\n\nB工場\t愛知\t住所B\t25:00\t17:00\nC工場\t愛知\t住所C\t8:00\nD工場\t愛知\t住所D\nD工場\t愛知\t住所D2");
    expect(r.rows.map((x) => x.name)).toEqual(["D工場"]);
    expect(r.errors.map((e) => e.line)).toEqual([1, 3, 4, 6]);
  });
});
