"use client";

import dynamic from "next/dynamic";

/** Mapa só no navegador (Leaflet usa `window`). */
export const PinMap = dynamic(() => import("./pin-map.client"), {
  ssr: false,
  loading: () => (
    <div className="h-72 w-full animate-pulse rounded-xl bg-sand" role="status">
      <span className="sr-only">Carregando mapa</span>
    </div>
  ),
});
