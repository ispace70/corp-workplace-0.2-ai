import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Corp Workplace AI",
  description: "기업 내부 AI 워크플레이스 — 지식검색 & 데이터분석",
};

const VALID_THEMES = ["nanoBanana", "dark", "white"] as const;
type Theme = (typeof VALID_THEMES)[number];

function resolveTheme(): Theme {
  const t = process.env.NEXT_PUBLIC_THEME as Theme;
  return VALID_THEMES.includes(t) ? t : "nanoBanana";
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = resolveTheme();
  return (
    <html lang="ko" data-theme={theme}>
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  );
}
