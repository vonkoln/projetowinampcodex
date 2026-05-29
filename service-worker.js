const CACHE_VERSION = "v1.0.0";
const CORE_CACHE = `winamp-core-${CACHE_VERSION}`;
const MEDIA_CACHE = `winamp-media-${CACHE_VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./index.js",
  "./style.css",
  "./manifest.json",
  "./data/audios.js",
  "./skin/base-2.91.wsz"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CORE_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CORE_CACHE && key !== MEDIA_CACHE)
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const port = event.ports && event.ports[0];

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();

    if (port) {
      port.postMessage({ ok: true });
    }

    return;
  }

  if (data.type === "CACHE_URLS") {
    const urls = Array.isArray(data.urls) ? data.urls : [];

    event.waitUntil(
      cacheUrls(urls)
        .then(() => {
          if (port) {
            port.postMessage({ ok: true });
          }
        })
        .catch((error) => {
          if (port) {
            port.postMessage({
              ok: false,
              error: error.message || String(error)
            });
          }
        })
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (isGoogleScriptRequest(url) || isExternalRequest(url)) {
    return;
  }

  if (isMediaRequest(url)) {
    event.respondWith(mediaStrategy(request));
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(navigationStrategy(request));
    return;
  }

  event.respondWith(cacheFirstStrategy(request));
});

function isExternalRequest(url) {
  return url.origin !== self.location.origin;
}

function isGoogleScriptRequest(url) {
  return url.hostname.includes("script.google.com") ||
         url.hostname.includes("googleusercontent.com");
}

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isMediaRequest(url) {
  return /\.(mp3|m4a|aac|ogg|wav|flac)$/i.test(url.pathname);
}

async function cacheUrls(urls) {
  const coreCache = await caches.open(CORE_CACHE);
  const mediaCache = await caches.open(MEDIA_CACHE);

  await Promise.all(
    urls.map(async (url) => {
      const request = new Request(url, {
        cache: "reload"
      });

      const response = await fetch(request);

      if (!response || !response.ok) {
        throw new Error(`Falha ao salvar no cache: ${url}`);
      }

      const targetCache = isMediaRequest(new URL(request.url))
        ? mediaCache
        : coreCache;

      await targetCache.put(request, response);
    })
  );
}

async function navigationStrategy(request) {
  try {
    const networkResponse = await fetch(request);

    const cache = await caches.open(CORE_CACHE);
    cache.put("./index.html", networkResponse.clone());

    return networkResponse;
  } catch {
    const cached = await caches.match("./index.html");

    if (cached) {
      return cached;
    }

    return new Response("Offline e index.html não está no cache.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
}

async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response && response.ok) {
    const cache = await caches.open(CORE_CACHE);
    cache.put(request, response.clone());
  }

  return response;
}

async function mediaStrategy(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      const cache = await caches.open(MEDIA_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch {
    return new Response("Áudio não disponível offline.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
}