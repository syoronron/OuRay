/**
 * 拠点の一括登録：Excel などから貼り付けた表を読み取る（データベースに依存しない。テストあり）。
 *
 * 1行に1拠点。列はタブ（Excel からのコピー）またはカンマで区切る。
 *   拠点名, エリア, 住所, 荷受けの開始, 荷受けの終了, フォークリフト, メモ
 * 拠点名・エリア・住所は必須。荷受けの時間は「8:00」の形。フォークリフトは「あり」「○」など。
 * 1行目が見出し（「拠点名」「名前」などで始まる行）なら読み飛ばす。
 */

export type DepotRow = {
  line: number;
  name: string;
  area: string;
  address: string;
  open: string | null;
  close: string | null;
  hasForklift: boolean;
  note: string | null;
};

export type ParseResult = { rows: DepotRow[]; errors: { line: number; message: string }[] };

export const MAX_ROWS = 200;

const HEADER = /^(拠点名|拠点|名前|名称|事業所|工場|name)$/i;
const TIME = /^([01]?\d|2[0-3])[:：]([0-5]\d)$/;
const YES = /^(あり|有|有り|○|〇|◯|yes|y|true|1)$/i;

/** カンマ区切りの1行を分ける（"..." で囲まれた中のカンマは区切らない） */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if ((ch === "," || ch === "，") && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function normalizeTime(value: string): string | null | "invalid" {
  const v = value.trim().replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
  if (!v) return null;
  const m = TIME.exec(v);
  if (!m) return "invalid";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function parseDepotTable(text: string): ParseResult {
  const rows: DepotRow[] = [];
  const errors: { line: number; message: string }[] = [];
  const seen = new Set<string>();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;
    const cells = (raw.includes("\t") ? raw.split("\t") : splitCsv(raw)).map((c) => c.trim());
    if (rows.length === 0 && errors.length === 0 && HEADER.test(cells[0] ?? "")) return; // 見出しの行

    const [name = "", area = "", address = "", openRaw = "", closeRaw = "", forklift = "", note = ""] = cells;
    if (!name || !area || !address) {
      errors.push({ line, message: "拠点名・エリア・住所のどれかが空です" });
      return;
    }
    if (name.length > 60) return void errors.push({ line, message: "拠点名は60文字以内にしてください" });
    if (area.length > 40) return void errors.push({ line, message: "エリアは40文字以内にしてください" });
    if (address.length > 200) return void errors.push({ line, message: "住所は200文字以内にしてください" });
    if (seen.has(name)) return void errors.push({ line, message: `「${name}」が2回出てきます` });

    const open = normalizeTime(openRaw);
    const close = normalizeTime(closeRaw);
    if (open === "invalid" || close === "invalid") {
      return void errors.push({ line, message: "荷受けの時間は「8:00」の形で入力してください" });
    }
    if ((open === null) !== (close === null)) {
      return void errors.push({ line, message: "荷受けの時間は、開始と終了の両方を入れてください（または両方を空に）" });
    }
    if (open !== null && close !== null && open >= close) {
      return void errors.push({ line, message: "荷受けの開始は、終了より前にしてください" });
    }

    seen.add(name);
    rows.push({
      line,
      name,
      area,
      address,
      open,
      close,
      hasForklift: YES.test(forklift),
      note: note ? note.slice(0, 200) : null,
    });
  });

  if (rows.length > MAX_ROWS) {
    errors.push({ line: rows[MAX_ROWS].line, message: `一度に登録できるのは${MAX_ROWS}件までです` });
  }
  return { rows: rows.slice(0, MAX_ROWS), errors };
}
