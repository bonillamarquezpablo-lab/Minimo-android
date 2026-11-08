/* EL SIN NOMBRE — same-origin asset cache for GitHub Pages. */
const SHELL_CACHE = "el-sin-nombre-shell-0.6.263";
const ASSET_CACHE = "el-sin-nombre-assets-pending-build-0.6.204";
const SHELL_FILES = ["./index.html", "./guest.html", "./guest/index.html", "./invitado/index.html", "./manifest.webmanifest", "./guest-manifest.webmanifest", "./invitado-manifest.webmanifest", "./guest-file-manifest.webmanifest", "./scripts/nordic/beach-state.js", "./scripts/nordic/coastal-interaction.js", "./icon.svg"];

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

function isInvalidVikingGlbResponse(response, request) {
  if (!response) return true;
  const requestedUrl = new URL(request.url);
  if (!requestedUrl.pathname.endsWith("/assets/models/viking-rigged.glb")) return false;
  let responseUrl;
  try {
    responseUrl = new URL(response.url || request.url);
  } catch (_) {
    return true;
  }
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  // Vercel SSO puede devolver una página HTML 200 bajo la ruta del GLB.
  // Nunca debemos almacenarla ni reutilizarla como si fuera el modelo.
  return response.redirected ||
    responseUrl.origin !== requestedUrl.origin ||
    responseUrl.pathname !== requestedUrl.pathname ||
    contentType.includes("text/html");
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    // Keep a known-good cached copy when the server returns an HTTP error.
    if (response && (response.ok || response.type === "opaque")) {
      if (!isInvalidVikingGlbResponse(response, request)) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    }
    const cached = await cache.match(request);
    return cached || response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached && !isInvalidVikingGlbResponse(cached, request)) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  let cached = await cache.match(request);
  // Elimina respuestas SSO/HTML antiguas que se guardaron por error como un GLB.
  if (cached && isInvalidVikingGlbResponse(cached, request)) {
    await cache.delete(request);
    cached = null;
  }
  // No volver a descargar modelos grandes cuando ya están guardados en esta versión.
  if (cached) return cached;
  return networkFirst(request, cacheName);
}

async function isValidGameNavigation(response) {
  if (!response || !response.ok) return false;
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return false;
  try {
    const html = await response.clone().text();
    return /<meta\s+name=["']el-sin-nombre-build["']\s+content=["']\d+\.\d+\.\d+["']/i.test(html) &&
      /id=["']renderCanvas["']/i.test(html) &&
      /id=["']loading["']/i.test(html);
  } catch (_) {
    return false;
  }
}

async function getVerifiedCachedNavigation(cache, request, fallback) {
  const exact = await cache.match(request);
  if (exact && await isValidGameNavigation(exact)) return exact;
  if (exact) await cache.delete(request);
  const entry = await cache.match(fallback);
  if (entry && await isValidGameNavigation(entry)) return entry;
  if (entry) await cache.delete(fallback);
  return null;
}

const NAVIGATION_RECOVERY_HTML = `<!doctype html>
<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EL SIN NOMBRE · Recuperación</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#101b1d;color:#f2e7d1;font:16px system-ui;text-align:center">
<main style="max-width:34rem;padding:2rem"><h1 style="color:#e0bd78">No se pudo validar la copia local</h1>
<p>La versión guardada no parece una página de juego válida y tampoco se ha podido descargar una versión nueva.</p>
<p>Conéctate a Internet y vuelve a intentarlo. La partida guardada no se ha borrado.</p>
<button onclick="location.reload()" style="padding:.8rem 1.2rem;background:#94602e;color:white;border:1px solid #d8ad68;border-radius:8px;font-weight:800">VOLVER A INTENTAR</button></main></body></html>`;

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const guestFilePath = url.pathname.endsWith("/guest.html");
    const guestPath = /\/(?:guest|invitado)(?:\/|\/index\.html)?$/.test(url.pathname);
    const invitePath = /\/invitado(?:\/|\/index\.html)?$/.test(url.pathname);
    const fallback = guestFilePath ? "./guest.html" : (guestPath ? (invitePath ? "./invitado/index.html" : "./guest/index.html") : "./index.html");
    // Network first: never launch a saved shell before checking for a fresh valid build.
    // A bounded timeout prevents a broken or unreachable network from blocking forever.
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const fresh = await fetch(request, { cache: "no-store", signal: controller.signal });
        if (!await isValidGameNavigation(fresh)) throw new Error("Fresh game shell failed structural validation");
        await cache.put(request, fresh.clone()).catch(error => console.info("Shell cache update deferred:", error));
        return fresh;
      } catch (error) {
        const cached = await getVerifiedCachedNavigation(cache, request, fallback);
        if (cached) {
          console.info("Network unavailable; using a structurally validated offline shell:", error);
          return cached;
        }
        return new Response(NAVIGATION_RECOVERY_HTML, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
        });
      } finally {
        clearTimeout(timeout);
      }
    })());
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
