-- =====================================================================
-- 運行当日の記録（P3）
-- SQL Editor で実行してください（何回実行しても大丈夫です）。
--
-- 予約の流れ：予約確定 → 積込済み → 輸送中（便が出発したとき）→ 受け渡し済み
-- 便の流れ：  公開中・受付終了 → 出発 → 到着（すべて受け渡したとき）
--
-- エラーは次のメッセージで返す（アプリ側で日本語の案内に変える）:
--   booking_not_found  予約が見つからない（他社の便の予約も含む）
--   trip_not_found     便が見つからない（他社の便も含む）
--   bad_step           その状態からは進められない
--   not_all_loaded     まだ積み込んでいない予約がある（出発できない）
--   message_required   理由・内容の入力が必要
-- =====================================================================

-- 受け取った人の名前、清掃の記録
alter table public.bookings add column if not exists received_by text;
alter table public.trips    add column if not exists cleaned_at timestamptz;
alter table public.trips    add column if not exists cleaning_photo text;

-- ---------------------------------------------------------------------
-- 写真の保存場所（Supabase Storage）。公開しない（表示は期限つきの URL で行う）
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('booking-photos', 'booking-photos', false)
    on conflict (id) do nothing;
  end if;
end $$;

-- 便と予約をロックして返す（運送会社の便の予約か確かめる）
create or replace function public.lock_carrier_booking(p_company_id uuid, p_booking_id uuid)
returns bookings
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_booking bookings%rowtype;
begin
  perform 1 from trips t
   where t.company_id = p_company_id
     and t.id = (select b.trip_id from bookings b where b.id = p_booking_id)
  for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  select * into v_booking from bookings b where b.id = p_booking_id for update;
  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------
-- 積み込んだ（予約確定 → 積込済み）
-- ---------------------------------------------------------------------
create or replace function public.load_booking(
  p_company_id uuid,
  p_booking_id uuid,
  p_photo      text default null,
  p_message    text default null
) returns text
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_booking bookings%rowtype;
  v_trip    text;
begin
  v_booking := lock_carrier_booking(p_company_id, p_booking_id);
  select t.status into v_trip from trips t where t.id = v_booking.trip_id;
  if v_booking.status <> 'confirmed' or v_trip not in ('published', 'closed') then
    raise exception 'bad_step';
  end if;
  update bookings b set status = 'loaded' where b.id = p_booking_id;
  insert into booking_events (booking_id, kind, message, photo_paths, created_by)
  values (p_booking_id, 'loaded', nullif(trim(p_message), ''),
          case when p_photo is null then '{}' else array[p_photo] end, 'carrier');
  return 'loaded';
end;
$$;

-- ---------------------------------------------------------------------
-- 便が出発した：積込済みの予約は「輸送中」に。
-- まだ確定していない申込は、出発に間に合わなかったのでお断りにする。
-- 積み込んでいない確定済みの予約が残っていたら出発できない（先に積むか、取り消す）。
-- ---------------------------------------------------------------------
create or replace function public.depart_trip(p_company_id uuid, p_trip_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_trip  trips%rowtype;
  v_count integer;
begin
  select * into v_trip from trips t where t.id = p_trip_id and t.company_id = p_company_id for update;
  if not found then
    raise exception 'trip_not_found';
  end if;
  if v_trip.status not in ('published', 'closed') then
    raise exception 'bad_step';
  end if;
  if exists (select 1 from bookings b where b.trip_id = p_trip_id and b.status = 'confirmed') then
    raise exception 'not_all_loaded';
  end if;

  with rejected as (
    update bookings b set status = 'rejected', decided_at = now()
     where b.trip_id = p_trip_id and b.status = 'requested'
    returning b.id
  )
  insert into booking_events (booking_id, kind, message, created_by)
  select r.id, 'rejected', '出発までに予約が確定しなかったため', 'system' from rejected r;

  with moved as (
    update bookings b set status = 'in_transit'
     where b.trip_id = p_trip_id and b.status = 'loaded'
    returning b.id
  ), logged as (
    insert into booking_events (booking_id, kind, created_by)
    select m.id, 'in_transit', 'carrier' from moved m
    returning 1
  )
  select count(*) into v_count from logged;

  -- 運ぶ荷物がなければ、そのまま到着扱い
  update trips t set status = case when v_count = 0 then 'completed' else 'departed' end where t.id = p_trip_id;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 受け渡した（輸送中 → 受け渡し済み）。すべて受け渡したら便は「到着」
-- ---------------------------------------------------------------------
create or replace function public.deliver_booking(
  p_company_id  uuid,
  p_booking_id  uuid,
  p_received_by text,
  p_photo       text default null,
  p_message     text default null
) returns text
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_booking bookings%rowtype;
begin
  if length(trim(coalesce(p_received_by, ''))) = 0 then
    raise exception 'message_required';
  end if;
  v_booking := lock_carrier_booking(p_company_id, p_booking_id);
  if v_booking.status <> 'in_transit' then
    raise exception 'bad_step';
  end if;
  update bookings b set status = 'delivered', received_by = trim(p_received_by) where b.id = p_booking_id;
  insert into booking_events (booking_id, kind, message, photo_paths, created_by)
  values (p_booking_id, 'delivered', '受け取り：' || trim(p_received_by) || coalesce('　' || nullif(trim(p_message), ''), ''),
          case when p_photo is null then '{}' else array[p_photo] end, 'carrier');

  if not exists (select 1 from bookings b where b.trip_id = v_booking.trip_id and b.status in ('loaded', 'in_transit')) then
    update trips t set status = 'completed' where t.id = v_booking.trip_id and t.status = 'departed';
    return 'trip_completed';
  end if;
  return 'delivered';
end;
$$;

-- ---------------------------------------------------------------------
-- 運送会社が確定済みの予約を取り消す（積めなかった・荷物が来なかった など。理由が必要）
-- ---------------------------------------------------------------------
create or replace function public.cancel_booking_by_carrier(
  p_company_id uuid,
  p_booking_id uuid,
  p_message    text
) returns text
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_booking bookings%rowtype;
begin
  if length(trim(coalesce(p_message, ''))) = 0 then
    raise exception 'message_required';
  end if;
  v_booking := lock_carrier_booking(p_company_id, p_booking_id);
  if v_booking.status not in ('confirmed', 'loaded') then
    raise exception 'bad_step';
  end if;
  update bookings b set status = 'cancelled', cancelled_at = now() where b.id = p_booking_id;
  insert into booking_events (booking_id, kind, message, created_by)
  values (p_booking_id, 'cancelled', trim(p_message), 'carrier');
  return 'cancelled';
end;
$$;

-- ---------------------------------------------------------------------
-- 遅れ・荷物の事故・連絡を記録する（状態は変えない。荷主のページに表示）
-- ---------------------------------------------------------------------
create or replace function public.report_booking(
  p_company_id uuid,
  p_booking_id uuid,
  p_kind       text,
  p_message    text,
  p_photo      text default null
) returns text
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_booking bookings%rowtype;
begin
  if p_kind not in ('delay', 'damage', 'note') then
    raise exception 'bad_step';
  end if;
  if length(trim(coalesce(p_message, ''))) = 0 then
    raise exception 'message_required';
  end if;
  v_booking := lock_carrier_booking(p_company_id, p_booking_id);
  if v_booking.status not in ('confirmed', 'loaded', 'in_transit', 'delivered') then
    raise exception 'bad_step';
  end if;
  insert into booking_events (booking_id, kind, message, photo_paths, created_by)
  values (p_booking_id, p_kind, trim(p_message),
          case when p_photo is null then '{}' else array[p_photo] end, 'carrier');
  return p_kind;
end;
$$;

-- ---------------------------------------------------------------------
-- 荷台を清掃した（衛生物を運んだ便）
-- ---------------------------------------------------------------------
create or replace function public.record_cleaning(p_company_id uuid, p_trip_id uuid, p_photo text default null)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_at timestamptz := now();
begin
  update trips t set cleaned_at = v_at, cleaning_photo = coalesce(p_photo, t.cleaning_photo)
   where t.id = p_trip_id and t.company_id = p_company_id and t.status in ('departed', 'completed');
  if not found then
    raise exception 'bad_step';
  end if;
  return v_at;
end;
$$;

-- アプリ（サーバー）が新しい関数を使えるようにする
grant execute on all functions in schema public to service_role;
