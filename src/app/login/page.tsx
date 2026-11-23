import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Logo } from "@/components/logo";
import { adminPasswordStatus } from "@/lib/auth";
import { login } from "./actions";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col px-5 pt-4 pb-8">
      <header className="flex items-center justify-between border-b border-line pb-3">
        <Link href="/" aria-label="トップページへ">
          <Logo size={22} />
        </Link>
        <span className="num text-[10px] font-semibold tracking-[0.2em] text-gray">CARRIER LOGIN</span>
      </header>
      <h1 className="mt-10 text-2xl font-bold">運送会社の管理画面</h1>
      <p className="mt-2 text-sm text-gray">パスワードを入力してください。</p>
      <Suspense>
        <LoginForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginForm({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next } = await searchParams;
  const status = adminPasswordStatus();

  if (status !== "ok") {
    return (
      <div className="mt-6 rounded-2xl bg-white p-5 text-sm leading-relaxed">
        <p className="font-bold">パスワードがまだ設定されていません</p>
        <p className="mt-1 text-gray">
          Vercel の Settings → Environment Variables に <span className="num font-semibold text-ink">ADMIN_PASSWORD</span>{" "}
          を追加してください（4文字以上）。追加したあとに Redeploy すると、ここからログインできるようになります。
        </p>
        {status === "too_short" && <p className="mt-2 font-medium text-danger">今のパスワードは短すぎます（4文字以上にしてください）。</p>}
      </div>
    );
  }

  return (
    <ActionForm action={login} className="mt-6 rounded-2xl bg-white p-5">
      <input type="hidden" name="next" value={typeof next === "string" ? next : "/carrier"} />
      <label className="label" htmlFor="password">
        パスワード
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        className="field"
        required
        autoFocus
      />
      <SubmitButton variant="accent" className="mt-4 w-full" pendingText="確認中…">
        ログイン
      </SubmitButton>
    </ActionForm>
  );
}
