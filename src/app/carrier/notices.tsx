import Link from "next/link";

export function MissingCarrier() {
  return (
    <div className="border border-ink bg-white p-4 text-sm leading-relaxed">
      <p className="font-bold">デモの運送会社が見つかりません</p>
      <p className="mt-1 text-gray">Supabase の SQL Editor で supabase/seed.sql を実行してください。</p>
    </div>
  );
}

export function NeedFleet() {
  return (
    <div className="border border-ink bg-white p-4 text-sm leading-relaxed">
      <p className="font-bold">先に拠点と車両を登録してください</p>
      <p className="mt-1 text-gray">便を作るには、拠点が2つ以上と、車両が1台以上必要です。</p>
      <Link href="/carrier/fleet" className="mt-3 flex min-h-11 items-center justify-center border border-ink font-bold">
        拠点・車両へ
      </Link>
    </div>
  );
}
