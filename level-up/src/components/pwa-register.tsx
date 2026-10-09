"use client";
import { useEffect } from "react";

/** Registers the offline service worker (production builds only; it is generated at build time into /sw.js). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const go = () => { navigator.serviceWorker.register("/sw.js").catch(() => { /* offline support is a bonus */ }); };
    if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
  }, []);
  return null;
}
