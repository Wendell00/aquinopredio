import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
/** Endereço interno da API (servidor → servidor). O navegador só fala com `/api` (mesma origem). */
const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:3001";
/** Origem pública das imagens (S3/CDN). */
const storagePublicUrl = process.env.NEXT_PUBLIC_STORAGE_URL ?? "http://localhost:8333";
const mapTiles = "https://tile.openstreetmap.org";

/**
 * CSP sem nonce para manter páginas estáticas. Scripts inline do Next exigem 'unsafe-inline';
 * em dev o React Refresh exige 'unsafe-eval'. Se uma rota precisar de CSP estrita, migrar para
 * nonce via `proxy.ts`.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${new URL(storagePublicUrl).origin} ${mapTiles} https://lh3.googleusercontent.com`,
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  // O login com Google redireciona o formulário para accounts.google.com.
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Câmera e geolocalização são usadas pelo próprio app (fotos e "perto de mim").
    value: "camera=(self), geolocation=(self), microphone=(), payment=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      new URL(`${storagePublicUrl}/**`),
      new URL("https://lh3.googleusercontent.com/**"),
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // O service worker precisa ser sempre revalidado para atualizar o app.
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiInternalUrl}/api/:path*` }];
  },
};

export default nextConfig;
