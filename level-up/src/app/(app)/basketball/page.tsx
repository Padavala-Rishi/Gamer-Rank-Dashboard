"use client";
import { LivePage } from "@/components/live-page";
import View, { metadata } from "./view";

export default function Page() {
  return <LivePage view={View} title={metadata.title} />;
}
