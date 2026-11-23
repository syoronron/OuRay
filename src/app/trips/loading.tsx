/**
 * 便の一覧・詳細・申込の読み込み中の表示。
 * 押した瞬間にこの骨組みを出し、データが届いたら中身に置き換わる（体感の待ち時間を減らす）。
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="読み込み中" className="animate-pulse">
      <div className="h-3 w-24 rounded bg-line" />
      <div className="mt-2 h-9 w-48 rounded bg-line" />
      <div className="mt-3 h-4 w-full max-w-md rounded bg-line" />
      <div className="mt-5 h-14 w-full rounded-[10px] bg-white" />
      <div className="-mx-4 mt-6 rounded-t-2xl bg-white px-4 pt-6 pb-6 md:mx-0 md:rounded-2xl md:p-12">
        <div className="h-12 w-full rounded-[10px] bg-paper" />
        <div className="mt-4 grid gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 rounded-[5px] bg-paper" />
          ))}
        </div>
      </div>
    </div>
  );
}
