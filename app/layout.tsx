import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "链动小铺 · ChatGPT 全网渠道雷达",
  description: "聚合数千条 ChatGPT 报价渠道，并对 Plus 成品号与 Business / Team 席位进行原站库存、价格、购买入口和长期低价复核。",
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
