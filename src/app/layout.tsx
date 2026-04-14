import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "每日績效計算系統",
  description: "門市工效比、達標統計、工時異動與報表（網頁版）",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
