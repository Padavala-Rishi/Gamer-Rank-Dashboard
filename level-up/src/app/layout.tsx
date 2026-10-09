import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Level Up", template: "%s · Level Up" },
  description: "Turn basketball, college, development and fitness into a personal RPG: complete real quests, earn XP, level up.",
  applicationName: "Level Up",
  appleWebApp: { capable: true, title: "Level Up", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0b0c0f" }, { media: "(prefers-color-scheme: light)", color: "#f5f4ef" }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="en" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
