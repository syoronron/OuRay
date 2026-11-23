"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-12 rounded-[10px] bg-navy px-5 font-bold text-white print:hidden"
    >
      印刷する
    </button>
  );
}
