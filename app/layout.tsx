import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "链动小铺 · AI 账号价格与库存雷达",
  description: "站内筛选 ChatGPT Plus、Business / Team、Go、Pro 与充值服务；直接前往原商家商品页，并区分目录收录、页面可达和原页有货核验。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
