-- =====================================================================
-- アプリ（サーバー）にテーブルの読み書きを許可する
-- SQL Editor で実行してください（何回実行しても大丈夫です）。
--
-- 新しい Supabase プロジェクトでは、SQL で作ったテーブルに
-- Data API の役割（service_role など）の権限が自動で付かないことがあります。
-- そのときトップページに「permission denied for table ...」と表示されます。
--
-- 許可するのは service_role（Secret key で使う、サーバー専用の役割）だけです。
-- ブラウザから使う役割（anon / authenticated）には許可しないので、
-- これまでどおりブラウザから直接データベースを読み書きすることはできません。
-- =====================================================================

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- これから作るテーブル・関数にも、同じ許可を自動で付ける
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
