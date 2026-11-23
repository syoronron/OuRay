"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MAX_ROWS, parseDepotTable } from "@/lib/depot-import";
import { importDepots } from "../../../actions";

const EXAMPLE = "拠点名\tエリア\t住所\t荷受け開始\t荷受け終了\tフォークリフト\tメモ\n〇〇工場\t愛知\t愛知県豊田市〇〇町1-1\t8:00\t17:00\tあり\t北門から入る";

/** 貼り付けた表を、その場で読み取って確認できるフォーム */
export function ImportForm({ existing }: { existing: string[] }) {
  const [text, setText] = useState("");
  const { rows, errors } = parseDepotTable(text);
  const known = new Set(existing);
  const updates = rows.filter((r) => known.has(r.name)).length;

  return (
    <ActionForm action={importDepots} className="grid gap-4" resetOnSuccess>
      <label className="block">
        <span className="label">表を貼り付け（1行に1拠点。Excel のセルをそのままコピーできます）</span>
        <textarea
          name="table"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={EXAMPLE}
          className="field min-h-48 py-3 font-mono text-sm leading-relaxed"
        />
      </label>
      <p className="text-xs leading-relaxed text-gray">
        列の順番：<strong>拠点名・エリア・住所</strong>（必須）、荷受け開始・荷受け終了（例 8:00）、フォークリフト（あり／なし）、メモ。
        1行目が見出しなら読み飛ばします。同じ拠点名がすでにあれば上書きします。一度に{MAX_ROWS}件まで。
      </p>

      {text.trim() && (
        <div className="rounded-[10px] bg-paper p-3">
          <p className="text-sm font-bold">
            読み取り結果：{rows.length}件
            {updates > 0 && <span className="ml-2 font-normal text-gray">（うち上書き {updates}件）</span>}
            {errors.length > 0 && <span className="ml-2 text-danger">直す必要がある行 {errors.length}件</span>}
          </p>
          {errors.length > 0 && (
            <ul className="mt-2 grid gap-1 text-xs text-danger">
              {errors.slice(0, 10).map((e) => (
                <li key={e.line}>
                  {e.line}行目：{e.message}
                </li>
              ))}
            </ul>
          )}
          {rows.length > 0 && (
            <div className="mt-2 max-h-80 overflow-auto">
              <table className="num w-full min-w-[560px] text-left text-xs">
                <thead>
                  <tr className="border-b border-mist text-gray">
                    <th className="p-1">拠点名</th>
                    <th className="p-1">エリア</th>
                    <th className="p-1">住所</th>
                    <th className="p-1">荷受け</th>
                    <th className="p-1">FL</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className="border-b border-line align-top">
                      <td className="p-1 font-bold">
                        {r.name}
                        {known.has(r.name) && <span className="ml-1 font-normal text-warn">上書き</span>}
                      </td>
                      <td className="p-1">{r.area}</td>
                      <td className="p-1">{r.address}</td>
                      <td className="p-1">{r.open ? `${r.open}–${r.close}` : "—"}</td>
                      <td className="p-1">{r.hasForklift ? "あり" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <SubmitButton variant="accent" pendingText="登録中…" disabled={rows.length === 0 || errors.length > 0}>
        {rows.length > 0 ? `${rows.length}件の拠点を登録する` : "拠点を登録する"}
      </SubmitButton>
    </ActionForm>
  );
}
