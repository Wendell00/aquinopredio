"use client";

import { useEffect } from "react";

/** Registra o service worker (push e página offline). */
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => undefined);
    }
  }, []);
  return null;
}
