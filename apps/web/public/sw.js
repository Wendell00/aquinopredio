/* Service worker do Aqui no Prédio.
 * - Web Push: mostra a notificação e abre a URL ao tocar.
 * - Offline: navegações sem rede caem na página /offline (RNF-002); estáticos versionados ficam em cache.
 * Respostas da API (/api) nunca são cacheadas: contêm dados pessoais e dependem da sessão.
 */
const VERSION = "v1";
const STATIC_CACHE = `anp-static-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/logo-horizontal.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("anp-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  // Arquivos com hash no nome nunca mudam: cache primeiro.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            const copy = response.clone();
            if (response.ok) caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Aqui no Prédio", body: "", url: "/notificacoes", tag: undefined };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // payload vazio ou inválido: mostra o padrão
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      data: { url: data.url },
      lang: "pt-BR",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/inicio", self.location.origin);
  // Só abre URLs do próprio app.
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === target.origin);
      if (open) return open.focus().then(() => open.navigate(target.href));
      return self.clients.openWindow(target.href);
    }),
  );
});
