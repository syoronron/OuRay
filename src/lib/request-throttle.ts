import "server-only";

/**
 * 公開フォーム（予約の申込など）の送りすぎを防ぐ簡易版。
 * 同じ接続元から、WINDOW_MINUTES 分の間に LIMIT 回まで。
 * 記録はサーバーのメモリにだけ置く（login-throttle.ts と同じ考え方。完全ではないが、いたずらの連続送信は防げる）。
 */
const LIMIT = 10;
const WINDOW_MINUTES = 60;

const hits = new Map<string, number[]>();

/** 受け付けてよければ true（そのまま1回として数える） */
export function allowRequest(key: string, now = Date.now()): boolean {
  const since = now - WINDOW_MINUTES * 60_000;
  const recent = (hits.get(key) ?? []).filter((t) => t > since);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => t <= since)) hits.delete(k);
  }
  return true;
}
