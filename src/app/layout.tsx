import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const jp = Noto_Sans_JP({
  // 日本語フォントは文字数が多く重いので、太さは2種類だけ読み込む（500 は 400 で表示される）
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-jp",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "OuRay｜帰り便の空きを、安く使う",
  description: "トラックの帰り便の空いた荷台を「便」として公開し、荷物を安く運びたい事業者と結ぶ物流シェアリング。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f8fb",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${jp.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
