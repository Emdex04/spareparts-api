const CACHE_NAME = "spareparts-v4";

// Files to cache for offline use
const STATIC_ASSETS = [
    "/index.html",
    "/app.js",
    "/manifest.json"
];

/* ============================================================
   INSTALL — cache static assets
============================================================ */
self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

/* ============================================================
   ACTIVATE — clean old caches
============================================================ */
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

/* ============================================================
   FETCH — network first, fall back to cache
   API calls always go to network (never cache live data)
============================================================ */
self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);

    // Always fetch API calls from network — never serve stale inventory data
    if (url.pathname.startsWith("/api") || url.hostname.includes("onrender.com")) {
        event.respondWith(
            fetch(event.request).catch(() =>
                new Response(JSON.stringify({ message: "You are offline. Please reconnect." }), {
                    headers: { "Content-Type": "application/json" }
                })
            )
        );
        return;
    }

    // For everything else — network first, cache fallback
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Cache fresh copy
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
