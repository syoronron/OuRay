"use client";

import type { ReactNode } from "react";

/**
 * 条件（日付・時間帯・エリアなど）を変えたら、すぐに一覧を表示し直すフォーム。
 * JavaScript が動かない環境でも、中の「表示する」ボタンで送れる。
 */
export function AutoSubmitForm({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <form
      method="get"
      className={className}
      onChange={(e) => {
        const target = e.target as HTMLElement;
        // 文字の検索欄は、入力のたびではなく Enter で送る
        if (target instanceof HTMLInputElement && target.type === "search") return;
        e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
