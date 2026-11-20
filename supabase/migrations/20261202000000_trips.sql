-- =====================================================================
-- 便の作成・公開・運休（P1）
-- 初期スキーマのあとに、SQL Editor で実行してください（何回実行しても大丈夫です）。
--
-- エラーは次のメッセージで返す（アプリ側で日本語の案内に変える）:
--   trip_not_found      便が見つからない（他社の便も含む）
--   trip_locked         出発済み・到着済み・運休の便は変更できない
--   bad_transition      その状態からは変えられない
--   vehicle_not_green   白ナンバーの車両の便は公開できない
--   no_capacity_to_sell 売る枠が 0 の便は公開できない
--   trip_past           締切を過ぎた便は公開できない
--   has_bookings        予約が入っている便は下書きに戻せない
--   over_vehicle        車両の上限を超えている
--   below_booked        予約済みの量より少なくはできない
-- =====================================================================

-- ---------------------------------------------------------------------
-- 定期ルートから便を作る
-- 指定期間の「下書きで予約のない、定期ルートの便」を消してから、候補を下書きとして作る。
-- 公開中・受付終了の便、予約のある便はそのまま残す（同じルート・同じ日時の候補は作らない）。
-- 1つの関数（＝1つのトランザクション）で行うので、途中で失敗しても中途半端にならない。
--
-- p_trips の形式（アプリの src/lib/trips/generate.ts が作る）:
--   [{"route_id": "...", "depart_at": "...", "arrive_at": "...", "booking_cutoff_at": "..."}, ...]
-- 車両・拠点・空き・料金などは、ここで定期ルートから写す。
-- 戻り値: 作った便の数 / 消した下書きの数
-- ---------------------------------------------------------------------
create or replace function public.regenerate_trips(
  p_company_id uuid,
  p_from       timestamptz,
  p_to         timestamptz,
  p_trips      jsonb
) returns table (created integer, removed integer)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_removed integer;
  v_created integer;
begin
  delete from trips t
  where t.company_id = p_company_id
    and t.route_id is not null
    and t.status = 'draft'
    and t.depart_at >= p_from
    and t.depart_at <  p_to
    and not exists (select 1 from bookings b where b.trip_id = t.id);
  get diagnostics v_removed = row_count;

  insert into trips (
    company_id, route_id, vehicle_id, origin_depot_id, dest_depot_id,
    depart_at, arrive_at, capacity_pallets, capacity_kg, price_per_pallet,
    booking_cutoff_at, requires_approval, accepted_categories, detour_max_km, detour_fee, status
  )
  select r.company_id, r.id, r.vehicle_id, r.origin_depot_id, r.dest_depot_id,
         c.depart_at, c.arrive_at, r.capacity_pallets, r.capacity_kg, r.price_per_pallet,
         c.booking_cutoff_at, r.requires_approval, r.accepted_categories, r.detour_max_km, r.detour_fee, 'draft'
  from jsonb_to_recordset(coalesce(p_trips, '[]'::jsonb))
         as c(route_id uuid, depart_at timestamptz, arrive_at timestamptz, booking_cutoff_at timestamptz)
  join routes r on r.id = c.route_id and r.company_id = p_company_id
  where c.depart_at >= p_from and c.depart_at < p_to
  on conflict (route_id, depart_at) do nothing;
  get diagnostics v_created = row_count;

  return query select v_created, v_removed;
end;
$$;

-- ---------------------------------------------------------------------
-- 便の状態を変える
--   draft     → published（公開）
--   published → closed（受付終了） / closed → published（受付再開）
--   published・closed → draft（下書きに戻す。予約がないときだけ）
--   draft・published・closed → cancelled（運休。予約は trip_cancelled にして記録を残す）
-- 戻り値: 運休にしたときに影響を受けた予約の数（それ以外は 0）
-- ---------------------------------------------------------------------
create or replace function public.set_trip_status(
  p_company_id uuid,
  p_trip_id    uuid,
  p_status     text,
  p_message    text default null
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_trip  trips%rowtype;
  v_plate text;
  v_count integer := 0;
begin
  select * into v_trip from trips t where t.id = p_trip_id and t.company_id = p_company_id for update;
  if not found then
    raise exception 'trip_not_found';
  end if;
  if v_trip.status in ('departed', 'completed', 'cancelled') then
    raise exception 'trip_locked';
  end if;
  if v_trip.status = p_status then
    return 0;
  end if;

  if p_status = 'published' then
    if v_trip.status not in ('draft', 'closed') then
      raise exception 'bad_transition';
    end if;
    select v.plate_kind into v_plate from vehicles v where v.id = v_trip.vehicle_id;
    if v_plate is distinct from 'green' then
      raise exception 'vehicle_not_green';
    end if;
    if v_trip.capacity_pallets = 0 or v_trip.capacity_kg = 0 then
      raise exception 'no_capacity_to_sell';
    end if;
    if v_trip.booking_cutoff_at <= now() then
      raise exception 'trip_past';
    end if;
  elsif p_status = 'closed' then
    if v_trip.status <> 'published' then
      raise exception 'bad_transition';
    end if;
  elsif p_status = 'draft' then
    if exists (select 1 from bookings b where b.trip_id = p_trip_id and booking_holds_capacity(b.status)) then
      raise exception 'has_bookings';
    end if;
  elsif p_status = 'cancelled' then
    with affected as (
      update bookings b
         set status = 'trip_cancelled', cancelled_at = now()
       where b.trip_id = p_trip_id and b.status in ('requested', 'confirmed')
      returning b.id
    ), logged as (
      insert into booking_events (booking_id, kind, message, created_by)
      select a.id, 'trip_cancelled', nullif(trim(p_message), ''), 'carrier' from affected a
      returning 1
    )
    select count(*) into v_count from logged;
  else
    raise exception 'bad_transition';
  end if;

  update trips t set status = p_status where t.id = p_trip_id;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 期間内の下書きをまとめて公開する
-- 公開できない便（売る枠が 0・白ナンバー・締切済み）は下書きのまま残す。
-- 戻り値: 公開した便の数
-- ---------------------------------------------------------------------
create or replace function public.publish_drafts(
  p_company_id uuid,
  p_from       timestamptz,
  p_to         timestamptz
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_count integer;
begin
  update trips t
     set status = 'published'
   where t.company_id = p_company_id
     and t.status = 'draft'
     and t.depart_at >= p_from
     and t.depart_at <  p_to
     and t.capacity_pallets > 0
     and t.capacity_kg > 0
     and t.booking_cutoff_at > now()
     and exists (select 1 from vehicles v where v.id = t.vehicle_id and v.plate_kind = 'green');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 便ごとの空き・料金・受け入れる品目を変える（P1-7b）
-- 便をロックしてから、車両の上限と予約済みの量の間に収まるかを確認する。
-- ---------------------------------------------------------------------
create or replace function public.update_trip(
  p_company_id          uuid,
  p_trip_id             uuid,
  p_capacity_pallets    integer,
  p_capacity_kg         integer,
  p_price_per_pallet    integer,
  p_accepted_categories text[]
) returns void
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_trip     trips%rowtype;
  v_slots    integer;
  v_max_kg   integer;
  v_used_pal integer;
  v_used_kg  integer;
begin
  select * into v_trip from trips t where t.id = p_trip_id and t.company_id = p_company_id for update;
  if not found then
    raise exception 'trip_not_found';
  end if;
  if v_trip.status in ('departed', 'completed', 'cancelled') then
    raise exception 'trip_locked';
  end if;

  select v.pallet_slots, v.max_load_kg into v_slots, v_max_kg from vehicles v where v.id = v_trip.vehicle_id;
  if p_capacity_pallets > v_slots or p_capacity_kg > v_max_kg then
    raise exception 'over_vehicle';
  end if;

  select coalesce(sum(b.pallets), 0), coalesce(sum(b.weight_kg), 0)
    into v_used_pal, v_used_kg
  from bookings b
  where b.trip_id = p_trip_id and booking_holds_capacity(b.status);
  if p_capacity_pallets < v_used_pal or p_capacity_kg < v_used_kg then
    raise exception 'below_booked';
  end if;

  update trips t
     set capacity_pallets    = p_capacity_pallets,
         capacity_kg         = p_capacity_kg,
         price_per_pallet    = p_price_per_pallet,
         accepted_categories = p_accepted_categories
   where t.id = p_trip_id;
end;
$$;
