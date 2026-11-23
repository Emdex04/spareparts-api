/* SpareParts Pro — offline helper
   - The app's own files are kept on the phone, so the app still opens with no internet.
   - Shop data (/api) always comes from the server. With no internet the app gets a clear
     "offline" answer (status 503) and keeps sales on the phone until the connection is back. */
const CACHE_NAME = "spareparts-v8";

const APP_FILES = [
    "./",
    "./index.html",
    "./app.js",
    "./style.css",
    "./manifest.json",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./vendor/html5-qrcode.min.js",
    "./vendor/fontawesome/css/all.min.css",
    "./vendor/fontawesome/webfonts/fa-solid-900.woff2",
    "./vendor/fontawesome/webfonts/fa-regular-400.woff2",
    "./vendor/fontawesome/webfonts/fa-brands-400.woff2"
];

self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)).catch(() => {}));
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
    );
    self.clients.claim();
});

const offlineReply = () => new Response(
    JSON.stringify({ message: "You are offline. Please reconnect.", offline: true }),
    { status: 503, headers: { "Content-Type": "application/json" } }
);

self.addEventListener("fetch", event => {
    const req = event.request;
    if (req.method !== "GET" && !new URL(req.url).pathname.startsWith("/api")) return;
    const url = new URL(req.url);

    // Shop data: never stored on the phone by this helper
    if (url.pathname.startsWith("/api")) {
        event.respondWith(fetch(req).catch(offlineReply));
        return;
    }

    // Everything else (app files, fonts, icons, the barcode reader): fresh copy when online,
    // the saved copy when offline
    event.respondWith(
        fetch(req)
            .then(res => {
                if (res && (res.ok || res.type === "opaque")) {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
                }
                return res;
            })
            .catch(async () => {
                const saved = await caches.match(req, { ignoreSearch: true });
                if (saved) return saved;
                if (req.mode === "navigate") {
                    const page = await caches.match("./index.html");
                    if (page) return page;
                }
                return Response.error();
            })
    );
});
