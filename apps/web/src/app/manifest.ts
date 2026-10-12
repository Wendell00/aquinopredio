import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aqui no Prédio",
    short_name: "Aqui no Prédio",
    description: "Serviços e produtos dos seus vizinhos, no seu prédio e nos prédios ao redor.",
    lang: "pt-BR",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF9F3",
    theme_color: "#D63700",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
