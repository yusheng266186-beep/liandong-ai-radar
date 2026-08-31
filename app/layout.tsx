import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "链动小铺 · AI 账号价格雷达",
  description: "ChatGPT Plus 与 Business / Team 席位的公开价格、库存、历史低价和风险对比监测台。",
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
