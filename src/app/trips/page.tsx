import Link from "next/link";
import { connection } from "next/server";
import { BoardRow, Segmented } from "@/components/trip-board";
import { SetupNotice } from "@/components/page-header";
import { loadBoard, type Board, type BoardTrip } from "@/lib/data/board";
import { isDatabaseConfigured } from "@/lib/data/carrier";
import { addDays, formatDateShort, formatTime, isDateString, jstToDate, todayJst, toJst } from "@/lib/time";
import { boardStatus, tripCode } from "@/lib/trips/board";
import { AutoSubmitForm } from "./auto-submit";

/**
 * 便をさがす（荷主向けの公開ページ）。
 * 空港の「出発フライト一覧」と同じ並び：
 *   出発便／到着便の切り替え → 検索 → 日付・時間帯・絞り込み → 前の便 → 便の一覧
 */

const DAYS_AHEAD = 28;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

type Search = {
  dir: "dep" | "arr";
  area: string;
  date: string;
  time: string; // "now" | "all" | "0".."23"
  q: string;
  open: boolean;
  hygiene: boolean;
  detour: boolean;
};

function readSearch(sp: Record<string, string | string[] | undefined>): Search {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const today = todayJst();
  const date = isDateString(one("date")) && one("date") >= today && one("date") <= addDays(today, DAYS_AHEAD) ? one("date") : today;
  const timeParam = one("time");
  const time =
    timeParam === "all" || (/^\d{1,2}$/.test(timeParam) && Number(timeParam) < 24) || (timeParam === "now" && date === today)
      ? timeParam
      : date === today
        ? "now"
        : "all";
  return {
    dir: one("dir") === "arr" ? "arr" : "dep",
    area: one("area"),
    date,
    time,
    q: one("q").trim().slice(0, 50),
    open: one("open") === "1",
    hygiene: one("hygiene") === "1",
    detour: one("detour") === "1",
  };
}

/** 検索条件を保ったまま、一部だけ変えた URL */
function hrefWith(s: Search, patch: Partial<Search>): string {
  const next = { ...s, ...patch };
  const params = new URLSearchParams();
  if (next.dir === "arr") params.set("dir", "arr");
  if (next.area) params.set("area", next.area);
  params.set("date", next.date);
  params.set("time", next.time);
  if (next.q) params.set("q", next.q);
  if (next.open) params.set("open", "1");
  if (next.hygiene) params.set("hygiene", "1");
  if (next.detour) params.set("detour", "1");
  return `/trips?${params.toString()}`;
}

export default async function TripsBoardPage({ searchParams }: PageProps<"/trips">) {
  await connection();
  const s = readSearch(await searchParams);
  if (!isDatabaseConfigured()) return <SetupNotice />;

  // 到着便は到着日で探すので、前の日に出発した便も読み込む
  const board = await loadBoard(jstToDate(addDays(s.date, s.dir === "arr" ? -3 : 0), 0), jstToDate(addDays(s.date, 1), 0));
  const now = new Date();
  const { shown, earlier } = filterTrips(board, s, now);
  const hygieneCodes = new Set(board.categories.filter((c) => c.hygiene && !c.is_waste).map((c) => c.code));
  const areaName = new Map(board.areas.map((a) => [a.id, a.name]));
  const depotLabel = (id: string) => {
    const d = board.depots.get(id);
    return d ? `${d.name}（${areaName.get(d.area_id) ?? ""}）` : "—";
  };
  const today = todayJst();

  return (
    <>
      <p className="num text-[11px] font-medium tracking-[0.2em] text-gray">{s.dir === "dep" ? "DEPARTURES" : "ARRIVALS"}</p>
      <h1 className="mt-1 text-[30px] leading-tight font-normal md:text-[44px]">{s.dir === "dep" ? "出発便一覧" : "到着便一覧"}</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray">
        トラックの帰り便などの空きを、パレット1枠から予約できます。日時と場所が決まった便なので、安く運べます。
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.4fr] md:items-center">
        <Segmented
          items={[
            { href: hrefWith(s, { dir: "dep" }), label: "出発便", active: s.dir === "dep" },
            { href: hrefWith(s, { dir: "arr" }), label: "到着便", active: s.dir === "arr" },
          ]}
        />
        <form method="get" role="search" className="flex rounded-[10px] border border-mist bg-white focus-within:border-primary">
          {/* 検索しても、ほかの条件は保つ */}
          {s.dir === "arr" && <input type="hidden" name="dir" value="arr" />}
          {s.area && <input type="hidden" name="area" value={s.area} />}
          <input type="hidden" name="date" value={s.date} />
          <input type="hidden" name="time" value={s.time} />
          <input
            type="search"
            name="q"
            defaultValue={s.q}
            placeholder="拠点・エリア・運送会社・便名"
            aria-label="拠点・エリア・運送会社・便名で探す"
            className="min-h-13 min-w-0 flex-1 rounded-l-[10px] px-4 text-base outline-none"
          />
          <button type="submit" aria-label="探す" className="flex w-12 items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
              <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="#033b7d" strokeWidth="1.8" />
              <line x1="13" y1="13" x2="18" y2="18" stroke="#033b7d" strokeWidth="1.8" />
            </svg>
          </button>
        </form>
      </div>

      <section className="-mx-4 mt-6 rounded-t-2xl bg-white px-4 pt-6 pb-6 md:mx-0 md:rounded-2xl md:p-12">
        <AutoSubmitForm className="grid gap-3">
          {s.dir === "arr" && <input type="hidden" name="dir" value="arr" />}
          {s.q && <input type="hidden" name="q" value={s.q} />}
          <div className="grid gap-2 md:grid-cols-[auto_1fr] md:items-start">
            <div className="grid grid-cols-2 rounded-[10px] border border-mist md:w-[26rem]">
              <label className="flex items-center gap-2 px-4">
                <span className="sr-only">日付</span>
                <CalendarIcon />
                <select name="date" defaultValue={s.date} className="num min-h-12 w-full bg-transparent text-sm text-navy outline-none">
                  {Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => addDays(today, i)).map((d) => (
                    <option key={d} value={d}>
                      {formatDateShort(d)}
                      {d === today ? " 今日" : d === addDays(today, 1) ? " 明日" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 border-l border-line px-4">
                <span className="sr-only">時間帯</span>
                <ClockIcon />
                <select name="time" defaultValue={s.time} className="num min-h-12 w-full bg-transparent text-sm text-navy outline-none">
                  {s.date === today && <option value="now">現在時刻</option>}
                  <option value="all">すべての時間帯</option>
                  {HOURS.map((h) => (
                    <option key={h} value={String(h)}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex min-h-12 items-center gap-2 rounded-[10px] border border-mist px-4">
              <span className="shrink-0 text-xs text-gray">{s.dir === "dep" ? "出発エリア" : "到着エリア"}</span>
              <select name="area" defaultValue={s.area} className="min-h-12 w-full bg-transparent text-sm text-navy outline-none">
                <option value="">すべて</option>
                {board.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details className="group" open={s.open || s.hygiene || s.detour}>
            <summary className="ml-auto flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 text-navy">
              <FilterIcon />
              絞り込み
              <span className="num text-gray transition-transform group-open:rotate-180" aria-hidden>
                ▾
              </span>
            </summary>
            <div className="mt-2 grid gap-1 md:grid-cols-3">
              <Check name="open" checked={s.open} label="空きのある便だけ" />
              <Check name="hygiene" checked={s.hygiene} label="衛生物（使用済みリネン）OK" />
              <Check name="detour" checked={s.detour} label="施設などに寄り道できる" />
            </div>
          </details>
          <noscript>
            <button type="submit" className="min-h-11 w-full rounded-[10px] border border-mist font-bold">
              この条件で表示する
            </button>
          </noscript>
        </AutoSubmitForm>

        <div className="mt-4 grid gap-2">
          {earlier > 0 && (
            <Link
              href={hrefWith(s, { time: "all" })}
              className="flex min-h-9 items-center justify-center gap-2 rounded-[5px] bg-paper text-sm text-gray hover:text-ink"
            >
              <span className="num" aria-hidden>
                ↑
              </span>
              前の便（{earlier}件）
            </Link>
          )}

          {shown.length === 0 ? (
            <p className="rounded-[5px] bg-paper p-8 text-center text-sm text-gray">
              条件に合う便はありません。日付やエリアを変えてみてください。
            </p>
          ) : (
            shown.map((t) => {
              const carrier = board.carriers.get(t.company_id)!;
              const route = t.route_id ? board.routes.get(t.route_id) : undefined;
              const dep = toJst(t.depart_at);
              const arr = toJst(t.arrive_at);
              const status = boardStatus(t, now);
              const free = t.capacity_pallets - t.booked_pallets;
              const otherDay = (d: string) => (d === s.date ? "" : `${formatDateShort(d)} `);
              return (
                <BoardRow
                  key={t.id}
                  href={`/trips/${t.id}`}
                  time={formatTime((s.dir === "dep" ? dep : arr).minutes)}
                  destination={s.dir === "dep" ? `${depotLabel(t.dest_depot_id)} 行き` : `${depotLabel(t.origin_depot_id)} から`}
                  code={tripCode(carrier.code, route?.number ?? null)}
                  carrier={carrier.name}
                  details={
                    <>
                      {s.dir === "dep"
                        ? `${board.depots.get(t.origin_depot_id)?.name ?? "—"} 発 → ${otherDay(arr.date)}${formatTime(arr.minutes)} 着`
                        : `${otherDay(dep.date)}${formatTime(dep.minutes)} 発 → ${board.depots.get(t.dest_depot_id)?.name ?? "—"} 着`}
                      <br />
                      空き {Math.max(free, 0)}枠・1枠 {t.price_per_pallet.toLocaleString()}円
                      {t.accepted_categories.some((c) => hygieneCodes.has(c)) && "・衛生物OK"}
                      {t.detour_max_km > 0 && `・寄り道${t.detour_max_km}km`}
                    </>
                  }
                  status={status}
                  dimmed={status.tone === "cancelled" || status.tone === "closed" || status.tone === "done"}
                />
              );
            })
          )}
        </div>
        <p className="num mt-3 text-right text-[11px] text-gray">最終更新 {formatTime(toJst(now).minutes)}</p>
      </section>
    </>
  );
}

/** 条件で絞り込み、時刻順に並べる。現在時刻・時間帯より前の便は「前の便」として数だけ返す */
function filterTrips(board: Board, s: Search, now: Date): { shown: BoardTrip[]; earlier: number } {
  const hygieneCodes = new Set(board.categories.filter((c) => c.hygiene && !c.is_waste).map((c) => c.code));
  const areaName = new Map(board.areas.map((a) => [a.id, a.name]));
  const q = s.q.toLowerCase();
  const keyTime = (t: BoardTrip) => (s.dir === "dep" ? t.depart_at : t.arrive_at);

  const matched = board.trips
    .filter((t) => toJst(keyTime(t)).date === s.date)
    .filter((t) => {
      if (!s.area) return true;
      const depot = board.depots.get(s.dir === "dep" ? t.origin_depot_id : t.dest_depot_id);
      return depot?.area_id === s.area;
    })
    .filter((t) => !s.open || (t.status === "published" && t.capacity_pallets - t.booked_pallets > 0 && new Date(t.booking_cutoff_at) > now))
    .filter((t) => !s.hygiene || t.accepted_categories.some((c) => hygieneCodes.has(c)))
    .filter((t) => !s.detour || t.detour_max_km > 0)
    .filter((t) => {
      if (!q) return true;
      const carrier = board.carriers.get(t.company_id);
      const route = t.route_id ? board.routes.get(t.route_id) : undefined;
      const words = [
        carrier?.name,
        tripCode(carrier?.code ?? null, route?.number ?? null),
        ...[t.origin_depot_id, t.dest_depot_id].flatMap((id) => {
          const d = board.depots.get(id);
          return [d?.name, d ? areaName.get(d.area_id) : undefined];
        }),
      ];
      return words.some((w) => w?.toLowerCase().includes(q));
    })
    .sort((a, b) => keyTime(a).localeCompare(keyTime(b)));

  let threshold: number | null = null;
  if (s.time === "now") threshold = now.getTime();
  else if (/^\d{1,2}$/.test(s.time)) threshold = jstToDate(s.date, Number(s.time) * 60).getTime();
  if (threshold === null) return { shown: matched, earlier: 0 };
  const shown = matched.filter((t) => new Date(keyTime(t)).getTime() >= threshold);
  return { shown, earlier: matched.length - shown.length };
}

function Check({ name, checked, label }: { name: string; checked: boolean; label: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-[10px] border border-mist px-3 text-sm">
      <input type="checkbox" name={name} value="1" defaultChecked={checked} className="size-5 accent-[#0058aa]" />
      {label}
    </label>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden className="shrink-0">
      <rect x="2" y="4" width="16" height="14" fill="none" stroke="#033b7d" strokeWidth="1.5" />
      <line x1="2" y1="8" x2="18" y2="8" stroke="#033b7d" strokeWidth="1.5" />
      <line x1="6" y1="2" x2="6" y2="5" stroke="#033b7d" strokeWidth="1.5" />
      <line x1="14" y1="2" x2="14" y2="5" stroke="#033b7d" strokeWidth="1.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden className="shrink-0">
      <circle cx="10" cy="10" r="8" fill="none" stroke="#033b7d" strokeWidth="1.5" />
      <polyline points="10,5 10,10 13.5,12" fill="none" stroke="#033b7d" strokeWidth="1.5" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
      <line x1="2" y1="5" x2="18" y2="5" stroke="#033b7d" strokeWidth="1.5" />
      <line x1="2" y1="10" x2="18" y2="10" stroke="#033b7d" strokeWidth="1.5" />
      <line x1="2" y1="15" x2="18" y2="15" stroke="#033b7d" strokeWidth="1.5" />
      <rect x="5" y="3" width="3" height="4" fill="#fff" stroke="#033b7d" strokeWidth="1.5" />
      <rect x="12" y="8" width="3" height="4" fill="#fff" stroke="#033b7d" strokeWidth="1.5" />
      <rect x="7" y="13" width="3" height="4" fill="#fff" stroke="#033b7d" strokeWidth="1.5" />
    </svg>
  );
}
