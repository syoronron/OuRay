import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-5">
      <p className="num text-[11px] font-medium tracking-[0.2em] text-gray">{eyebrow}</p>
      <h1 className="mt-1 text-[28px] leading-tight font-normal">{title}</h1>
      {children && <div className="mt-2 text-sm leading-relaxed text-gray">{children}</div>}
    </header>
  );
}

/** 見出し付きのカード（直角・1px の黒線） */
export function Section({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5">
      {(title || aside) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && (
            <h2 className="text-base font-bold">{title}</h2>
          )}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function SetupNotice() {
  return (
    <div className="rounded-2xl bg-white p-5 text-sm leading-relaxed">
      <p className="font-bold">データベースの設定が完了していません</p>
      <p className="mt-1 text-gray">
        環境変数 SUPABASE_URL と SUPABASE_SECRET_KEY を確認してください。
        <Link href="/" className="font-bold text-ink underline underline-offset-4">
          トップページ
        </Link>
        の「システムの状態」に、どこを直せばよいかが表示されます。
      </p>
    </div>
  );
}
