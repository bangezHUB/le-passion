// Service worker: uygulama kabugu ve okunan kitaplar cevrimdisi calissin.
// Strateji: ag once (her zaman guncel), ag yoksa onbellek. Fontlar onbellek once.
const SHELL = "lp-shell-v1";
const LIBRARY = "lp-library-v1";
const FONTS = "lp-fonts-v1";
const KEEP = [SHELL, LIBRARY, FONTS];

const SHELL_FILES = [
  "./", "index.html", "style.css", "app.js", "state.js", "reader.js", "util.js", "crypto.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === "navigate") {
      const shell = await caches.open(SHELL);
      const page = await shell.match("index.html");
      if (page) return page;
    }
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
      event.respondWith(cacheFirst(request, FONTS));
    }
    return;
  }
  if (url.pathname.includes("/api/")) return; // senkron: her zaman ag
  const cacheName = url.pathname.includes("/library/") ? LIBRARY : SHELL;
  event.respondWith(networkFirst(request, cacheName));
});
