-- =====================================================================
-- 予約（P2）
-- SQL Editor で実行してください（何回実行しても大丈夫です）。
--
-- エラーは次のメッセージで返す（アプリ側で日本語の案内に変える）:
--   shipper_not_approved  利用停止中の荷主
--   trip_unavailable      公開中の便ではない
--   trip_closed           締切を過ぎている
--   no_capacity           パレット枠または重量が足りない
--   category_waste        廃棄物
--   category_not_accepted この便では受け入れていない品目
--   detour_not_available  この便は寄り道をしない
--   booking_not_found     予約が見つからない（他社の便の予約も含む）
--   not_requested         申込中ではない（承認・お断りできない）
--   cannot_cancel         キャンセルできない状態・締切後
-- =====================================================================

-- ---------------------------------------------------------------------
-- 予約の作成（初期スキーマの create_booking を置き換え）
-- 初めての荷主（審査待ち）も申し込めるようにする。そのときは必ず「申込中」になり、
-- 運送会社が内容を見て承認してから確定する。
-- ---------------------------------------------------------------------
create or replace function public.create_booking(
  p_trip_id           uuid,
  p_shipper_id        uuid,
  p_cargo_category    text,
  p_cargo_description text,
  p_packaging         text,
  p_pieces            integer,
  p_pallets           integer,
  p_weight_kg         integer,
  p_pickup_contact    text,
  p_pickup_phone      text,
  p_dropoff_contact   text,
  p_dropoff_phone     text,
  p_fee_rate_bp       integer,
  p_terms_version     text,
  p_pickup_address    text default null,
  p_dropoff_address   text default null
) returns table (booking_id uuid, access_token text, status text, freight_amount integer)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_trip        trips%rowtype;
  v_plate       text;
  v_used_pal    integer;
  v_used_kg     integer;
  v_freight     integer;
  v_fee         integer;
  v_status      text;
  v_shipper     text;
  v_cat         cargo_categories%rowtype;
  v_detours     integer;
  v_detour_amt  integer;
  v_id          uuid;
  v_token       text;
begin
  -- 荷主：審査済み、または初めての荷主（審査待ち）。利用停止中は受け付けない
  select c.status into v_shipper from companies c where c.id = p_shipper_id and c.is_shipper;
  if v_shipper is null or v_shipper = 'suspended' then
    raise exception 'shipper_not_approved';
  end if;

  -- 便をロックする（同じ便への同時申し込みは、ここで順番待ちになる）
  select * into v_trip from trips t where t.id = p_trip_id for update;
  if not found or v_trip.status <> 'published' then
    raise exception 'trip_unavailable';
  end if;

  select v.plate_kind into v_plate from vehicles v where v.id = v_trip.vehicle_id;
  if v_plate is distinct from 'green' then
    raise exception 'trip_unavailable';
  end if;

  if now() > v_trip.booking_cutoff_at then
    raise exception 'trip_closed';
  end if;

  select * into v_cat from cargo_categories c where c.code = p_cargo_category;
  if not found then
    raise exception 'category_not_accepted';
  end if;
  if v_cat.is_waste then
    raise exception 'category_waste';
  end if;
  if not (p_cargo_category = any (v_trip.accepted_categories)) then
    raise exception 'category_not_accepted';
  end if;

  v_detours := (case when nullif(trim(p_pickup_address), '')  is not null then 1 else 0 end)
             + (case when nullif(trim(p_dropoff_address), '') is not null then 1 else 0 end);
  if v_detours > 0 and v_trip.detour_max_km = 0 then
    raise exception 'detour_not_available';
  end if;
  v_detour_amt := v_detours * v_trip.detour_fee;

  select coalesce(sum(b.pallets), 0), coalesce(sum(b.weight_kg), 0)
    into v_used_pal, v_used_kg
  from bookings b
  where b.trip_id = p_trip_id and booking_holds_capacity(b.status);

  if v_used_pal + p_pallets > v_trip.capacity_pallets
     or v_used_kg + p_weight_kg > v_trip.capacity_kg then
    raise exception 'no_capacity';
  end if;

  v_freight := v_trip.price_per_pallet * p_pallets + v_detour_amt;
  v_fee     := (v_freight * p_fee_rate_bp) / 10000;
  -- 承認制の便、または審査待ちの荷主なら「申込中」（運送会社が承認してから確定）
  v_status  := case when v_trip.requires_approval or v_shipper <> 'approved' then 'requested' else 'confirmed' end;

  insert into bookings (
    trip_id, shipper_id, status,
    cargo_category, cargo_description, packaging, pieces, pallets, weight_kg,
    pickup_contact, pickup_phone, dropoff_contact, dropoff_phone,
    pickup_address, dropoff_address, detour_amount,
    unit_price, freight_amount, fee_rate_bp, fee_amount, terms_version
  ) values (
    p_trip_id, p_shipper_id, v_status,
    trim(p_cargo_category), nullif(trim(p_cargo_description), ''), p_packaging,
    p_pieces, p_pallets, p_weight_kg,
    trim(p_pickup_contact), trim(p_pickup_phone), trim(p_dropoff_contact), trim(p_dropoff_phone),
    nullif(trim(p_pickup_address), ''), nullif(trim(p_dropoff_address), ''), v_detour_amt,
    v_trip.price_per_pallet, v_freight, p_fee_rate_bp, v_fee, p_terms_version
  )
  returning id, bookings.access_token into v_id, v_token;

  insert into booking_events (booking_id, kind, created_by)
  values (v_id, v_status, 'shipper');

  return query select v_id, v_token, v_status, v_freight;
end;
$$;

-- ---------------------------------------------------------------------
-- 荷主の申込（公開ページから）
-- 会社名と電話番号が同じ荷主がいればその会社で、いなければ「審査待ち」の荷主として登録してから予約する。
-- ---------------------------------------------------------------------
create or replace function public.request_booking(
  p_trip_id           uuid,
  p_company_name      text,
  p_contact_name      text,
  p_phone             text,
  p_email             text,
  p_cargo_category    text,
  p_cargo_description text,
  p_packaging         text,
  p_pieces            integer,
  p_pallets           integer,
  p_weight_kg         integer,
  p_pickup_contact    text,
  p_pickup_phone      text,
  p_dropoff_contact   text,
  p_dropoff_phone     text,
  p_fee_rate_bp       integer,
  p_terms_version     text,
  p_pickup_address    text default null,
  p_dropoff_address   text default null
) returns table (booking_id uuid, access_token text, status text, freight_amount integer)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_shipper uuid;
  v_digits  text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if length(trim(coalesce(p_company_name, ''))) = 0 or length(v_digits) < 10 then
    raise exception 'shipper_info_required';
  end if;

  select c.id into v_shipper
  from companies c
  where c.is_shipper
    and lower(trim(c.name)) = lower(trim(p_company_name))
    and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_digits
  order by (c.status = 'approved') desc, c.created_at
  limit 1;

  if v_shipper is null then
    insert into companies (name, is_shipper, contact_name, phone, email, status)
    values (trim(p_company_name), true, nullif(trim(p_contact_name), ''), trim(p_phone), nullif(trim(p_email), ''), 'pending')
    returning id into v_shipper;
  end if;

  return query
  select * from create_booking(
    p_trip_id, v_shipper, p_cargo_category, p_cargo_description, p_packaging,
    p_pieces, p_pallets, p_weight_kg,
    p_pickup_contact, p_pickup_phone, p_dropoff_contact, p_dropoff_phone,
    p_fee_rate_bp, p_terms_version, p_pickup_address, p_dropoff_address
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 運送会社が申込を承認する／お断りする
-- p_decision: 'confirmed'（承認） / 'rejected'（お断り）
-- ---------------------------------------------------------------------
create or replace function public.decide_booking(
  p_company_id uuid,
  p_booking_id uuid,
  p_decision   text,
  p_message    text default null
) returns text
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_booking bookings%rowtype;
begin
  if p_decision not in ('confirmed', 'rejected') then
    raise exception 'not_requested';
  end if;

  -- 便→予約の順にロックする（予約の作成と同じ順番にして、行き違いを防ぐ）
  perform 1 from trips t
   where t.company_id = p_company_id
     and t.id = (select b.trip_id from bookings b where b.id = p_booking_id)
  for update;
  if not found then
    raise exception 'booking_not_found';
  end if;

  select * into v_booking from bookings b where b.id = p_booking_id for update;
  if v_booking.status <> 'requested' then
    raise exception 'not_requested';
  end if;

  update bookings b set status = p_decision, decided_at = now() where b.id = p_booking_id;
  insert into booking_events (booking_id, kind, message, created_by)
  values (p_booking_id, p_decision, nullif(trim(p_message), ''), 'carrier');
  return p_decision;
end;
$$;

-- ---------------------------------------------------------------------
-- 荷主が予約確認ページからキャンセルする（予約の締切まで）
-- ---------------------------------------------------------------------
create or replace function public.cancel_booking(
  p_access_token text,
  p_message      text default null
) returns text
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_booking bookings%rowtype;
  v_cutoff  timestamptz;
begin
  select * into v_booking from bookings b where b.access_token = p_access_token;
  if not found then
    raise exception 'booking_not_found';
  end if;

  select t.booking_cutoff_at into v_cutoff from trips t where t.id = v_booking.trip_id for update;
  select * into v_booking from bookings b where b.id = v_booking.id for update;

  if v_booking.status not in ('requested', 'confirmed') or now() > v_cutoff then
    raise exception 'cannot_cancel';
  end if;

  update bookings b set status = 'cancelled', cancelled_at = now() where b.id = v_booking.id;
  insert into booking_events (booking_id, kind, message, created_by)
  values (v_booking.id, 'cancelled', nullif(trim(p_message), ''), 'shipper');
  return 'cancelled';
end;
$$;

-- アプリ（サーバー）が新しい関数を使えるようにする（20261203000000_grants.sql と同じ考え方）
grant execute on all functions in schema public to service_role;
