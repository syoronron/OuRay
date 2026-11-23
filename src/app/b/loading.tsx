/** 予約確認ページの読み込み中の表示 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="読み込み中" className="animate-pulse">
      <div className="h-3 w-24 rounded bg-line" />
      <div className="mt-2 h-9 w-40 rounded bg-line" />
      <div className="mt-5 h-36 rounded-2xl bg-white" />
      <div className="mt-4 h-44 rounded-2xl bg-white" />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="h-40 rounded-2xl bg-white" />
        <div className="h-40 rounded-2xl bg-white" />
      </div>
    </div>
  );
}
