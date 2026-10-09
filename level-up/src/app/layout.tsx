import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Level Up", template: "%s · Level Up" },
  description: "Turn basketball, college, development and fitness into a personal RPG: complete real quests, earn XP, level up. Private and on your device.",
  applicationName: "Level Up",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon.ico" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Level Up", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0b0c0f" }, { media: "(prefers-color-scheme: light)", color: "#f5f4ef" }],
};

// Runs before first paint so a light-theme user never sees a dark flash.
const THEME_SCRIPT = `try{var t=localStorage.getItem("lu:theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body>{children}<PwaRegister /></body>
    </html>
  );
}
