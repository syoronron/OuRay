-- =====================================================================
-- 便名（例：DM102）を付ける
-- SQL Editor で実行してください（何回実行しても大丈夫です）。
--
-- 便名 ＝ 運送会社の略号（英大文字2〜3文字） ＋ 定期ルートの番号
-- 航空便の便名と同じように、毎週同じ便には同じ便名が付く。
-- 臨時の便（定期ルートなし）は「臨時」と表示する。
-- =====================================================================

alter table public.companies add column if not exists code text;
alter table public.routes    add column if not exists number integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_code_format') then
    alter table public.companies add constraint companies_code_format check (code is null or code ~ '^[A-Z]{2,3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'companies_code_key') then
    alter table public.companies add constraint companies_code_key unique (code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'routes_number_range') then
    alter table public.routes add constraint routes_number_range check (number is null or number between 1 and 9999);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'routes_company_number_key') then
    alter table public.routes add constraint routes_company_number_key unique (company_id, number);
  end if;
end $$;

-- デモ用データの便名（seed.sql を実行済みの場合）
update public.companies set code = 'DM' where id = '00000000-0000-0000-0000-000000000c01' and code is null;
update public.routes set number = v.n
from (values
  ('00000000-0000-0000-0000-0000000000b1'::uuid, 101),
  ('00000000-0000-0000-0000-0000000000b2'::uuid, 102),
  ('00000000-0000-0000-0000-0000000000b3'::uuid, 201),
  ('00000000-0000-0000-0000-0000000000b4'::uuid, 202)
) as v(id, n)
where routes.id = v.id and routes.number is null;
