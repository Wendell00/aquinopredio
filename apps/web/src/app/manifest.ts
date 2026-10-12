import type { MetadataRoute } from "next";

/** Manifesto do PWA (RNF-001): instalável, abre direto no início. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Aqui no Prédio",
    short_name: "Aqui no Prédio",
    description: "Serviços e produtos dos seus vizinhos, no seu prédio e nos prédios ao redor.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFF9F3",
    theme_color: "#D63700",
    categories: ["shopping", "lifestyle", "social"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Anunciar", url: "/anunciar", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Conversas", url: "/conversas", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
