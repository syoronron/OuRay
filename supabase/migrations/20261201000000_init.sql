-- =====================================================================
-- OuRay 初期スキーマ（下書き）
-- Supabase の「SQL Editor」にこのファイルの中身を貼り付けて実行します。
-- ※ ヒアリング（docs/open-questions.md）の結果を反映してから実行してください。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 会社（運送会社・荷主）
-- 1つの会社が両方を兼ねることもある
-- ---------------------------------------------------------------------
create table public.companies (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(trim(name)) > 0),
  is_carrier         boolean not null default false,  -- 運送会社として便を出す
  is_shipper         boolean not null default false,  -- 荷主として予約する
  corporate_number   text,                            -- 法人番号（13桁）
  invoice_number     text,                            -- インボイス登録番号（T+13桁）
  carrier_license_no text,                            -- 一般貨物自動車運送事業の許可番号
  contact_name       text,
  phone              text,
  email              text,
  -- 運営が審査して承認したか（未承認の会社は便を出せない・予約できない）
  status             text not null default 'pending'
                       check (status in ('pending', 'approved', 'suspended')),
  created_at         timestamptz not null default now(),
  check (is_carrier or is_shipper),
  check (corporate_number is null or corporate_number ~ '^[0-9]{13}$'),
  check (invoice_number   is null or invoice_number   ~ '^T[0-9]{13}$')
);

-- ---------------------------------------------------------------------
-- エリア（荷主が検索するときの単位。例：愛知、東京23区）
-- ---------------------------------------------------------------------
create table public.areas (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------
-- 拠点（荷物の持ち込み・受け取り場所）
-- ---------------------------------------------------------------------
create table public.depots (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  area_id       uuid not null references public.areas (id),
  name          text not null check (length(trim(name)) > 0),
  address       text not null,
  lat           double precision,
  lng           double precision,
  open_time     time,                 -- 荷受けできる時間帯
  close_time    time,
  has_forklift  boolean not null default false,
  note          text,                 -- 搬入口の場所など
  created_at    timestamptz not null default now(),
  unique (company_id, name)
);
create index on public.depots (area_id);

-- ---------------------------------------------------------------------
-- 車両
-- plate_kind: green=緑ナンバー（事業用） / white=白ナンバー（自家用）
-- 白ナンバーの車両の便は公開できない（create_booking で確認）
-- ---------------------------------------------------------------------
create table public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  name             text not null,                 -- 呼び名（例：4t ウイング 1号車）
  plate_number     text,
  plate_kind       text not null check (plate_kind in ('green', 'white')),
  body_type        text not null
                     check (body_type in ('flat', 'van', 'wing', 'car_carrier', 'other')),
  bed_length_mm    integer check (bed_length_mm > 0),
  bed_width_mm     integer check (bed_width_mm  > 0),
  bed_height_mm    integer check (bed_height_mm > 0),
  max_load_kg      integer not null check (max_load_kg > 0),
  pallet_slots     integer not null check (pallet_slots > 0),  -- 積めるパレットの数
  has_power_gate   boolean not null default false,
  temperature      text not null default 'ambient'
                     check (temperature in ('ambient', 'chilled', 'frozen')),
  created_at       timestamptz not null default now(),
  unique (company_id, name)
);

-- ---------------------------------------------------------------------
-- 定期ルート（便の元になる予定）
-- 例：毎週火・金 14:00 名古屋センター発 → 翌6:00 東京〇〇店着
-- weekdays: 0=日曜 … 6=土曜
-- ---------------------------------------------------------------------
create table public.routes (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies (id) on delete cascade,
  vehicle_id           uuid not null references public.vehicles (id),
  origin_depot_id      uuid not null references public.depots (id),
  dest_depot_id        uuid not null references public.depots (id),
  -- 行き便（自社の荷物で満載）か、帰り便（空きを売る）か
  direction            text not null default 'return'
                         check (direction in ('outbound', 'return')),
  -- 組になる行き便（帰り便から行き便をたどれるように）
  paired_route_id      uuid references public.routes (id) on delete set null,
  weekdays             smallint[] not null
                         check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
                                and cardinality(weekdays) > 0),
  depart_time          time not null,
  duration_minutes     integer not null check (duration_minutes between 10 and 4320),
  -- 売る空き（初期値は車両の上限。自社の荷物分を差し引いて設定）
  capacity_pallets     integer not null check (capacity_pallets >= 0),
  capacity_kg          integer not null check (capacity_kg >= 0),
  -- 料金（円・税抜）
  price_per_pallet     integer not null check (price_per_pallet >= 0),
  -- 予約の締切（出発の何時間前まで）
  booking_cutoff_hours integer not null default 24 check (booking_cutoff_hours between 0 and 336),
  -- true: 運送会社が承認してから確定 / false: 即時確定
  requires_approval    boolean not null default true,
  active_from          date not null default current_date,
  active_until         date,
  created_at           timestamptz not null default now(),
  check (origin_depot_id <> dest_depot_id),
  check (active_until is null or active_from <= active_until)
);
create index on public.routes (company_id);

-- ---------------------------------------------------------------------
-- 便（日時が決まった1回分の運行）
-- 定期ルートから自動生成（route_id あり）、または単発で登録（route_id なし）
-- ルートの値は便に写して持つ（便ごとに空き・料金を調整できるように）
-- ---------------------------------------------------------------------
create table public.trips (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies (id) on delete cascade,
  route_id             uuid references public.routes (id) on delete set null,
  vehicle_id           uuid not null references public.vehicles (id),
  origin_depot_id      uuid not null references public.depots (id),
  dest_depot_id        uuid not null references public.depots (id),
  depart_at            timestamptz not null,
  arrive_at            timestamptz not null,
  capacity_pallets     integer not null check (capacity_pallets >= 0),
  capacity_kg          integer not null check (capacity_kg >= 0),
  price_per_pallet     integer not null check (price_per_pallet >= 0),
  booking_cutoff_at    timestamptz not null,
  requires_approval    boolean not null default true,
  status               text not null default 'draft'
                         check (status in ('draft', 'published', 'closed',
                                           'departed', 'completed', 'cancelled')),
  created_at           timestamptz not null default now(),
  check (depart_at < arrive_at),
  check (booking_cutoff_at <= depart_at),
  check (origin_depot_id <> dest_depot_id),
  -- 同じ定期ルートから同じ日時の便が2つできないようにする
  unique (route_id, depart_at)
);
create index on public.trips (status, depart_at);
create index on public.trips (company_id, depart_at);

-- ---------------------------------------------------------------------
-- 予約（荷主がパレット枠を押さえる。1便に複数件）
-- 単価・手数料率は予約時の値を写して保存する（あとで料金を変えても分かるように）
-- ---------------------------------------------------------------------
create table public.bookings (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references public.trips (id) on delete restrict,
  shipper_id        uuid not null references public.companies (id) on delete restrict,
  -- 荷主の予約確認ページ（/b/専用の値）を開くための、推測できない値
  access_token      text not null unique
                      default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status            text not null default 'requested'
                      check (status in ('requested', 'confirmed', 'rejected', 'cancelled',
                                        'trip_cancelled', 'loaded', 'in_transit', 'delivered')),
  -- 荷物
  cargo_category    text not null,                  -- 品目（選択式）
  cargo_description text,
  packaging         text not null check (packaging in ('pallet', 'carton', 'other')),
  pieces            integer not null check (pieces > 0),
  pallets           integer not null check (pallets > 0),
  weight_kg         integer not null check (weight_kg > 0),
  -- 当日の連絡先（持ち込み・受け取りの担当者）
  pickup_contact    text not null,
  pickup_phone      text not null,
  dropoff_contact   text not null,
  dropoff_phone     text not null,
  -- 金額（円・税抜）。予約時に計算して保存
  unit_price        integer not null check (unit_price >= 0),
  freight_amount    integer not null check (freight_amount >= 0),
  fee_rate_bp       integer not null check (fee_rate_bp between 0 and 10000), -- 手数料率（1bp=0.01%）
  fee_amount        integer not null check (fee_amount >= 0),
  terms_version     text not null,                  -- 同意した約款の版
  created_at        timestamptz not null default now(),
  decided_at        timestamptz,                    -- 承認・お断りした日時
  cancelled_at      timestamptz
);
create index on public.bookings (trip_id);
create index on public.bookings (shipper_id, created_at desc);

-- 「枠を使っている」予約の状態
create or replace function public.booking_holds_capacity(p_status text)
returns boolean language sql immutable as $$
  select p_status in ('requested', 'confirmed', 'loaded', 'in_transit', 'delivered')
$$;

-- ---------------------------------------------------------------------
-- 状態の記録（積込・到着・遅れ・事故など。荷主のページに時系列で表示）
-- ---------------------------------------------------------------------
create table public.booking_events (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  kind        text not null
                check (kind in ('requested', 'confirmed', 'rejected', 'cancelled',
                                'trip_cancelled', 'loaded', 'in_transit', 'delivered',
                                'delay', 'damage', 'note')),
  message     text,
  photo_paths text[] not null default '{}',   -- Supabase Storage のパス
  created_by  text not null check (created_by in ('carrier', 'shipper', 'admin', 'system')),
  created_at  timestamptz not null default now()
);
create index on public.booking_events (booking_id, created_at);

-- ---------------------------------------------------------------------
-- セキュリティ（RLS）
-- すべてのテーブルで RLS を有効にし、ポリシーは作らない。
-- → ブラウザから直接データベースを読み書きすることはできず、
--   サーバー側（秘密鍵を持つ Next.js のサーバー処理）からのみ操作できる。
-- ログイン機能（P5）を作るときに、必要なポリシーを追加する。
-- ---------------------------------------------------------------------
alter table public.companies      enable row level security;
alter table public.areas          enable row level security;
alter table public.depots         enable row level security;
alter table public.vehicles       enable row level security;
alter table public.routes         enable row level security;
alter table public.trips          enable row level security;
alter table public.bookings       enable row level security;
alter table public.booking_events enable row level security;

-- =====================================================================
-- 予約の作成
-- 1つの関数（＝1つのトランザクション）の中で、便をロックしてから確認・登録するので、
-- 同じ便に同時に申し込みがあっても、空きを超えて予約が入ることはない。
--
-- エラーは次のメッセージで返す（アプリ側で日本語の案内に変える）:
--   shipper_not_approved 荷主が未承認
--   trip_unavailable     公開中の便ではない／白ナンバーの車両
--   trip_closed          締切を過ぎている
--   no_capacity          パレット枠または重量が足りない
-- =====================================================================
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
  p_terms_version     text
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
  v_id          uuid;
  v_token       text;
begin
  if not exists (select 1 from companies c
                 where c.id = p_shipper_id and c.is_shipper and c.status = 'approved') then
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

  select coalesce(sum(b.pallets), 0), coalesce(sum(b.weight_kg), 0)
    into v_used_pal, v_used_kg
  from bookings b
  where b.trip_id = p_trip_id and booking_holds_capacity(b.status);

  if v_used_pal + p_pallets > v_trip.capacity_pallets
     or v_used_kg + p_weight_kg > v_trip.capacity_kg then
    raise exception 'no_capacity';
  end if;

  v_freight := v_trip.price_per_pallet * p_pallets;
  v_fee     := (v_freight * p_fee_rate_bp) / 10000;
  v_status  := case when v_trip.requires_approval then 'requested' else 'confirmed' end;

  insert into bookings (
    trip_id, shipper_id, status,
    cargo_category, cargo_description, packaging, pieces, pallets, weight_kg,
    pickup_contact, pickup_phone, dropoff_contact, dropoff_phone,
    unit_price, freight_amount, fee_rate_bp, fee_amount, terms_version
  ) values (
    p_trip_id, p_shipper_id, v_status,
    trim(p_cargo_category), nullif(trim(p_cargo_description), ''), p_packaging,
    p_pieces, p_pallets, p_weight_kg,
    trim(p_pickup_contact), trim(p_pickup_phone), trim(p_dropoff_contact), trim(p_dropoff_phone),
    v_trip.price_per_pallet, v_freight, p_fee_rate_bp, v_fee, p_terms_version
  )
  returning id, bookings.access_token into v_id, v_token;

  insert into booking_events (booking_id, kind, created_by)
  values (v_id, v_status, 'shipper');

  return query select v_id, v_token, v_status, v_freight;
end;
$$;
