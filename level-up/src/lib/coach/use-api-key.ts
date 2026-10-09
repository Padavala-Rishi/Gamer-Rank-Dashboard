"use client";
import { useEffect, useState } from "react";
import { getApiKey } from "./browser";

/** Whether an API key is saved on this device (read after mount, so server rendering and hydration agree). */
export function useApiKey() {
  const [hasKey, setHasKey] = useState(false);
  const refresh = () => setHasKey(Boolean(getApiKey()));
  useEffect(refresh, []);
  return { hasKey, refresh };
}
