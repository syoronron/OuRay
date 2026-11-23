import type { SupabaseClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readSupabaseConfig } from "@/lib/supabase/config";
import { DEMO_CARRIER_ID } from "@/lib/demo";

type Status =
  | { kind: "unconfigured" }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string }
  | { kind: "outdated"; files: string[] }
  | { kind: "ok"; carrierName: string | null; routes: number };

/** データベースのエラーを、設定の見直しポイントがわかる言葉に変える */
function explainDbError(error: { message: string; code?: string }): string {
  const m = error.message;
  if (/invalid api key|jwt|jws|unauthorized|no api key/i.test(m)) {
    return `キーが正しくありません。SUPABASE_SECRET_KEY に Secret key（または service_role キー）が入っているか確認してください。（${m}）`;
  }
  if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(m)) {
    return `テーブルが見つかりません。Supabase の SQL Editor で supabase/migrations の SQL を実行してください。（${m}）`;
  }
  if (/fetch failed|enotfound|getaddrinfo/i.test(m)) {
    return `Supabase に接続できません。SUPABASE_URL が正しいか確認してください。（${m}）`;
  }
  if (error.code === "42501" || /permission denied/i.test(m)) {
    return `データベースの権限がありません。Supabase の SQL Editor で supabase/migrations/20261203000000_grants.sql を実行してください。それでも直らなければ、キーが Secret key（または service_role キー）か確認してください。（${m}）`;
  }
  return m;
}

const NIL = "00000000-0000-0000-0000-000000000000";

/**
 * SQL ファイルが実行済みかを、データを変えずに確かめる（そのファイルで足した項目・関数があるか）。
 * 足りないと、その項目を使う画面が「うまく表示できませんでした」になるので、先に知らせる。
 */
const MIGRATION_PROBES: { file: string; probe: (s: SupabaseClient) => PromiseLike<{ error: { code?: string; message: string } | null }> }[] = [
  {
    file: "20261202000000_trips.sql",
    // 存在しない会社の下書きを公開しようとする（何も変わらない）
    probe: (s) => s.rpc("publish_drafts", { p_company_id: NIL, p_from: new Date(0).toISOString(), p_to: new Date(0).toISOString() }),
  },
  { file: "20261204000000_trip_codes.sql", probe: (s) => s.from("routes").select("number").limit(1) },
  {
    file: "20261205000000_bookings.sql",
    // 存在しない予約を承認しようとする（「予約が見つからない」になれば、関数はある）
    probe: (s) => s.rpc("decide_booking", { p_company_id: NIL, p_booking_id: NIL, p_decision: "confirmed" }),
  },
  { file: "20261206000000_operations.sql", probe: (s) => s.from("trips").select("cleaned_at").limit(1) },
];

function isMissing(error: { code?: string; message: string } | null): boolean {
  if (!error) return false;
  return (
    ["42703", "42883", "PGRST202", "PGRST204"].includes(error.code ?? "") ||
    /does not exist|could not find the function|could not find the .* column/i.test(error.message)
  );
}

async function missingMigrations(supabase: SupabaseClient): Promise<string[]> {
  const results = await Promise.all(MIGRATION_PROBES.map(async (m) => ({ file: m.file, missing: isMissing((await m.probe(supabase)).error) })));
  return results.filter((r) => r.missing).map((r) => r.file);
}

async function checkDatabase(): Promise<Status> {
  const config = readSupabaseConfig();
  if (!config.ok) {
    return config.reason === "missing" ? { kind: "unconfigured" } : { kind: "invalid", message: config.message };
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return { kind: "invalid", message: "SUPABASE_URL の形式が正しくありません。" };

  try {
    const [carrier, routes] = await Promise.all([
      supabase.from("companies").select("name").eq("id", DEMO_CARRIER_ID).maybeSingle(),
      supabase.from("routes").select("id", { count: "exact", head: true }).eq("company_id", DEMO_CARRIER_ID),
    ]);
    const error = carrier.error ?? routes.error;
    if (error) return { kind: "error", message: explainDbError(error) };
    const missing = await missingMigrations(supabase);
    if (missing.length > 0) return { kind: "outdated", files: missing };
    return { kind: "ok", carrierName: carrier.data?.name ?? null, routes: routes.count ?? 0 };
  } catch (e) {
    return { kind: "error", message: explainDbError({ message: e instanceof Error ? e.message : String(e) }) };
  }
}

/** データベースにつながっているかを表示する（設定の確認用） */
export async function SystemStatus({ compact = false }: { compact?: boolean }) {
  // アクセスのたびに最新の状態を確認する（ビルド時に結果を固定しない）
  await connection();
  const status = await checkDatabase();

  const view = {
    unconfigured: {
      dot: "stripe bg-white",
      title: "データベース未設定",
      body: "環境変数 SUPABASE_URL と SUPABASE_SECRET_KEY を設定してください。",
    },
    invalid: {
      dot: "bg-danger",
      title: "設定に誤りがあります",
      body: status.kind === "invalid" ? status.message : "",
    },
    error: {
      dot: "bg-danger",
      title: "データベースに接続できません",
      body: status.kind === "error" ? status.message : "",
    },
    outdated: {
      dot: "bg-danger",
      title: "データベースの更新が必要です",
      body:
        status.kind === "outdated"
          ? `Supabase の SQL Editor で、supabase/migrations の次のファイルを順番に実行してください：${status.files.join("、")}（実行するまで、一部の画面が表示できません）`
          : "",
    },
    ok: {
      dot: "bg-primary",
      title: "データベース接続OK",
      body:
        status.kind === "ok" && status.carrierName
          ? `デモの運送会社「${status.carrierName}」（定期ルート ${status.routes} 本）を確認しました。`
          : "接続できました。デモ用のデータ（supabase/seed.sql）はまだ入っていません。",
    },
  }[status.kind];

  // 小さな1行表示：問題がなければ状態だけ、問題があれば直し方も出す
  if (compact) {
    return (
      <div className="flex items-start gap-2 text-[11px] text-gray">
        <span className={`mt-0.5 size-2.5 shrink-0 rounded-full border border-mist ${view.dot}`} aria-hidden />
        <p className="break-all">
          <span className="num font-semibold tracking-[0.12em]">SYSTEM</span>　{view.title}
          {status.kind !== "ok" && <span className="mt-0.5 block text-danger">{view.body}</span>}
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 rounded-2xl bg-white p-5">
      <span className={`mt-1 size-3 shrink-0 rounded-full border border-mist ${view.dot}`} aria-hidden />
      <div>
        <p className="font-semibold">{view.title}</p>
        <p className="mt-0.5 break-all text-sm text-gray">{view.body}</p>
      </div>
    </div>
  );
}
