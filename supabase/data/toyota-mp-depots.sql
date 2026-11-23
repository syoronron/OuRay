-- =====================================================================
-- トヨタモビリティパーツの支社（各支社の公式サイトで住所を確認できた10か所）
-- デモの運送会社（トヨタモビリティ想定）の拠点として登録します。何回実行しても大丈夫です。
-- 残りの23か所は docs/data/toyota-mp-depots-pending.md を見て、住所が分かりしだい追加します。
-- 出典：https://toyota-mp.co.jp/company/ の支社一覧、および各支社の公式サイト（2026年11月23日に確認）
-- =====================================================================
with src(name, area, address, note) as (values
  ('トヨタモビリティパーツ 福島支社', '福島', '福島県郡山市日和田町高倉字大口原18-68', null),
  ('トヨタモビリティパーツ 茨城支社', '茨城', '茨城県水戸市米沢町307番地の4', null),
  ('トヨタモビリティパーツ 東京・山梨統括支社', '東京23区', '東京都港区東麻布1丁目10番10号', null),
  ('トヨタモビリティパーツ 新潟支社', '新潟', '新潟県新潟市南区北田中780番地13', null),
  ('トヨタモビリティパーツ 長野支社', '長野', '長野県長野市青木島3丁目4-1', null),
  ('トヨタモビリティパーツ 滋賀支社', '滋賀', '滋賀県栗東市手原6丁目6番23号', null),
  ('トヨタモビリティパーツ 京都支社', '京都', '京都府久世郡久御山町田井東荒見6番地', null),
  ('トヨタモビリティパーツ 奈良支社', '奈良', '奈良県奈良市東九条町257番地', null),
  ('トヨタモビリティパーツ 四国統括支社', '愛媛', '愛媛県松山市高岡町458-1', null),
  ('トヨタモビリティパーツ 鹿児島支社', '鹿児島', '鹿児島県姶良市平松字車田3466-5', null)
), new_areas as (
  insert into public.areas (name, sort_order)
  select distinct s.area, 100 from src s
  on conflict (name) do nothing
  returning id, name
)
insert into public.depots (company_id, area_id, name, address, note)
select '00000000-0000-0000-0000-000000000c01', coalesce(n.id, a.id), s.name, s.address, s.note::text
from src s
left join new_areas n on n.name = s.area
left join public.areas a on a.name = s.area
on conflict (company_id, name) do update
  set address = excluded.address, area_id = excluded.area_id;
