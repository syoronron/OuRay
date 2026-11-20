# データの設計

テーブル定義の下書きは [`supabase/migrations/20261201000000_init.sql`](../supabase/migrations/20261201000000_init.sql) にあります。
ヒアリング（[確認事項](open-questions.md)）の結果で変わる可能性があるので、P0 で実行する前に見直します。

## テーブルのつながり

```
companies（会社：運送会社・荷主）
 ├─ depots（拠点）──── areas（エリア）
 ├─ vehicles（車両）
 ├─ routes（定期ルート：曜日・時刻・出発拠点→到着拠点・車両・料金）
 │    └─ trips（便：日時が決まった1回分の運行）  ← 自動生成
 │         └─ bookings（予約：荷主がパレット枠を押さえる）
 │              ├─ booking_events（状態の記録：積込・到着・事故など。写真つき）
 │              └─ invoices（請求）※P4
 └─ （荷主として）bookings
```

## Zicci との対応

| Zicci | OuRay | 共通の考え方 |
|---|---|---|
| 店舗 `stores` | 会社 `companies` | |
| シフト `shifts` | 定期ルート `routes` | 元になる予定 |
| 面接枠 `interview_slots` | 便 `trips` | 予定から自動生成。予約が入ったものは作り直しで消さない |
| 予約 `reservations`（1枠1件） | 予約 `bookings`（1便に複数件） | 便をロックして残りを確認してから登録 |
| 応募状況のページ | 予約確認ページ `/b/[token]` | 推測できないURLで進み具合を見る |
| `create_reservation()` | `create_booking()` | 取りすぎ防止を DB の関数で保証 |

## 大事な決まりごと

### 1. 空きは「パレット枠」と「重量」の2つで数える
- 便 `trips` に `capacity_pallets`（売る枠数）と `capacity_kg`（売る重量）を持つ
- 予約 `bookings` に `pallets` と `weight_kg`
- 有効な予約（申込中・確定・運行中）の合計が、便の上限を超えないこと
- 合計は毎回集計する（残り枠をカラムで持つと、ずれる原因になるため）

### 2. 予約の取りすぎ防止
`create_booking()` の中で
1. 便を `for update` でロック（同じ便への同時申込はここで順番待ち）
2. 公開中か・締切前か・白ナンバーでないかを確認
3. 有効な予約の合計 ＋ 今回の分 ≦ 上限 を確認
4. 登録

### 3. 便の状態
`draft`（下書き）→ `published`（公開中）→ `closed`（受付終了）→ `departed`（出発）→ `completed`（到着）／`cancelled`（運休）

### 4. 予約の状態（荷主のページに表示）
`requested`（申込中・承認待ち）→ `confirmed`（予約確定）→ `loaded`（積込済み）→ `in_transit`（輸送中）→ `delivered`（受け渡し済み）
途中で `rejected`（お断り）／`cancelled`（キャンセル）／`trip_cancelled`（運休）

### 5. 金額
- 金額は円の整数（`integer`）。小数は使わない
- 予約時の単価・手数料率を予約に **写して保存** する（あとで料金表を変えても、予約時の金額が分かる。Zicci の面接記録に質問文を保存したのと同じ考え方）

### 6. セキュリティ
- すべてのテーブルで RLS を有効にし、ポリシーは作らない（サーバーからのみ操作。Zicci と同じ）
- 荷主の予約確認ページは `bookings.access_token`（推測できない値）で開く
- 荷主の検索画面には、他の荷主の情報・運送会社のドライバー名・車両ナンバーを出さない
