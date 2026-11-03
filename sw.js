/* EL SIN NOMBRE — same-origin asset cache for GitHub Pages. */
const SHELL_CACHE = "el-sin-nombre-shell-0.6.158";
const ASSET_CACHE = "el-sin-nombre-assets-build";
const SHELL_FILES = ["./index.html", "./guest.html", "./guest/index.html", "./invitado/index.html", "./manifest.webmanifest", "./guest-manifest.webmanifest", "./invitado-manifest.webmanifest", "./guest-file-manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .catch(error => console.info("Shell cache deferred:", error))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => ![SHELL_CACHE, ASSET_CACHE].includes(key))
        .filter(key => key.startsWith("el-sin-nombre-"))
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === "opaque")) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  // No volver a descargar modelos grandes cuando ya están guardados en esta versión.
  if (cached) return cached;
  return networkFirst(request, cacheName);
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE).catch(async () => {
      const cache = await caches.open(SHELL_CACHE);
      const guestFilePath = url.pathname.endsWith("/guest.html");
      const guestPath = /\/(?:guest|invitado)(?:\/|\/index\.html)?$/.test(url.pathname);
      const invitePath = /\/invitado(?:\/|\/index\.html)?$/.test(url.pathname);
      const fallback = guestFilePath ? "./guest.html" : (guestPath ? (invitePath ? "./invitado/index.html" : "./guest/index.html") : "./index.html");
      return (await cache.match(fallback)) || Response.error();
    }));
    return;
  }

  if (url.pathname.includes("/assets/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE).catch(() => Response.error()));
    return;
  }

  if (url.pathname.endsWith("/manifest.webmanifest") || url.pathname.endsWith("/guest-manifest.webmanifest") || url.pathname.endsWith("/invitado-manifest.webmanifest") || url.pathname.endsWith("/guest-file-manifest.webmanifest") || url.pathname.endsWith("/icon.svg")) {
    event.respondWith(cacheFirst(request, SHELL_CACHE).catch(() => Response.error()));
  }
});
