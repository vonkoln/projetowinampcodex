const CACHE_VERSION = "v4.0.0";
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

let mediaManifest = [];
let prefetchNextCount = 5;
let autoPrefetchRunning = false;
const prefetchingUrls = new Set();

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

  if (data.type === "INIT_MEDIA_MANIFEST") {
    mediaManifest = Array.isArray(data.items)
      ? data.items.map(normalizeCacheItem).filter(Boolean)
      : [];

    prefetchNextCount = Number(data.prefetchNextCount || 5);

    if (port) {
      port.postMessage({
        ok: true,
        total: mediaManifest.length
      });
    }

    return;
  }

  if (data.type === "CACHE_URLS") {
    const items = normalizeIncomingItems(data);
    const scope = data.scope || "manual";

    event.waitUntil(
      cacheItemsSequentially(items, scope)
        .then(() => {
          notifyClients({
            type: "CACHE_DONE",
            scope,
            message: scope === "manual"
              ? "Músicas escolhidas salvas offline."
              : "Cache concluído."
          });

          if (port) {
            port.postMessage({
              ok: true,
              total: items.length
            });
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

  if (isGoogleScriptRequest(url)) {
    return;
  }

  if (isMediaRequest(url)) {
    event.waitUntil(prefetchCurrentAndNext(url.href));
    event.respondWith(mediaStrategy(request));
    return;
  }

  if (isExternalRequest(url)) {
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(navigationStrategy(request));
    return;
  }

  event.respondWith(cacheFirstStrategy(request));
});

function normalizeIncomingItems(data) {
  if (Array.isArray(data.items)) {
    return data.items.map(normalizeCacheItem).filter(Boolean);
  }

  if (Array.isArray(data.urls)) {
    return data.urls
      .map((url) => normalizeCacheItem({ url, name: url }))
      .filter(Boolean);
  }

  return [];
}

function normalizeCacheItem(item) {
  try {
    const url = new URL(item.url, self.location.href).href;

    return {
      url,
      name: item.name || getNameFromUrl(url),
    };
  } catch {
    return null;
  }
}

function normalizeUrl(url) {
  try {
    return new URL(url, self.location.href).href;
  } catch {
    return "";
  }
}

function getNameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const fileName = path.split("/").pop() || url;
    return decodeURIComponent(fileName);
  } catch {
    return url;
  }
}

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

function getCacheKey(url) {
  return new Request(normalizeUrl(url), {
    method: "GET"
  });
}

async function notifyClients(message) {
  const clientsList = await self.clients.matchAll({
    includeUncontrolled: true,
    type: "window"
  });

  clientsList.forEach((client) => {
    client.postMessage(message);
  });
}

async function cacheItemsSequentially(items, scope) {
  const validItems = items.filter(Boolean);
  const totalItems = validItems.length;

  if (!totalItems) {
    return;
  }

  for (let index = 0; index < totalItems; index++) {
    const item = validItems[index];

    const beforeTotalPercent = (index / totalItems) * 100;

    await notifyClients({
      type: "CACHE_PROGRESS",
      scope,
      itemName: item.name,
      itemPercent: 0,
      totalPercent: beforeTotalPercent
    });

    if (isMediaRequest(new URL(item.url))) {
      await cacheFullMedia(item, scope, index, totalItems);
    } else {
      await cacheCoreFile(item.url);
    }

    const afterTotalPercent = ((index + 1) / totalItems) * 100;

    await notifyClients({
      type: "CACHE_PROGRESS",
      scope,
      itemName: item.name,
      itemPercent: 100,
      totalPercent: afterTotalPercent
    });
  }
}

async function cacheCoreFile(url) {
  const cache = await caches.open(CORE_CACHE);
  const request = getCacheKey(url);

  const response = await fetch(request, {
    cache: "reload"
  });

  if (!response || !response.ok) {
    throw new Error(`Falha ao salvar no cache: ${url}`);
  }

  await cache.put(request, response.clone());
}

async function cacheFullMedia(item, scope, itemIndex = 0, totalItems = 1) {
  const normalizedUrl = normalizeUrl(item.url);

  if (!normalizedUrl || prefetchingUrls.has(normalizedUrl)) {
    return;
  }

  prefetchingUrls.add(normalizedUrl);

  try {
    const cache = await caches.open(MEDIA_CACHE);
    const cacheKey = getCacheKey(normalizedUrl);
    const alreadyCached = await cache.match(cacheKey);

    if (alreadyCached) {
      await notifyClients({
        type: "CACHE_PROGRESS",
        scope,
        itemName: `${item.name} já estava salva`,
        itemPercent: 100,
        totalPercent: ((itemIndex + 1) / totalItems) * 100
      });

      return;
    }

    const response = await fetch(normalizedUrl, {
      method: "GET",
      cache: "reload",
      mode: "cors",
    });

    if (!response || !response.ok) {
      throw new Error(`Falha ao salvar áudio no cache: ${normalizedUrl}`);
    }

    const contentLength = Number(response.headers.get("Content-Length") || 0);

    if (!response.body || !contentLength) {
      await cache.put(cacheKey, response.clone());

      await notifyClients({
        type: "CACHE_PROGRESS",
        scope,
        itemName: item.name,
        itemPercent: 100,
        totalPercent: ((itemIndex + 1) / totalItems) * 100
      });

      return;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
      receivedLength += value.length;

      const itemPercent = Math.min(100, (receivedLength / contentLength) * 100);
      const totalPercent = ((itemIndex + (itemPercent / 100)) / totalItems) * 100;

      await notifyClients({
        type: "CACHE_PROGRESS",
        scope,
        itemName: item.name,
        itemPercent,
        totalPercent
      });
    }

    const blob = new Blob(chunks, {
      type: response.headers.get("Content-Type") || "audio/mpeg"
    });

    const cachedResponse = new Response(blob, {
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
        "Content-Length": String(blob.size),
        "Accept-Ranges": "bytes"
      }
    });

    await cache.put(cacheKey, cachedResponse);
  } finally {
    prefetchingUrls.delete(normalizedUrl);
  }
}

async function prefetchCurrentAndNext(currentUrl) {
  if (autoPrefetchRunning) {
    return;
  }

  const normalizedCurrentUrl = normalizeUrl(currentUrl);

  if (!normalizedCurrentUrl) {
    return;
  }

  const currentIndex = mediaManifest.findIndex((item) => item.url === normalizedCurrentUrl);

  if (currentIndex === -1) {
    return;
  }

  const itemsToCache = [];

  for (let offset = 0; offset <= prefetchNextCount; offset++) {
    const nextIndex = currentIndex + offset;

    if (nextIndex >= mediaManifest.length) {
      break;
    }

    itemsToCache.push(mediaManifest[nextIndex]);
  }

  if (!itemsToCache.length) {
    return;
  }

  autoPrefetchRunning = true;

  try {
    await cacheItemsSequentially(itemsToCache, "auto");

    await notifyClients({
      type: "CACHE_DONE",
      scope: "auto",
      message: "Música atual + próximas 5 salvas."
    });
  } finally {
    autoPrefetchRunning = false;
  }
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
  const cache = await caches.open(MEDIA_CACHE);
  const url = new URL(request.url);
  const cacheKey = getCacheKey(url.href);
  const cached = await cache.match(cacheKey);
  const rangeHeader = request.headers.get("Range");

  if (cached && rangeHeader) {
    return createRangeResponse(cached, rangeHeader);
  }

  if (cached) {
    return cached;
  }

  try {
    return await fetch(request);
  } catch {
    return new Response("Áudio não disponível offline.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
}

async function createRangeResponse(response, rangeHeader) {
  const arrayBuffer = await response.arrayBuffer();
  const size = arrayBuffer.byteLength;

  const rangeMatch = /bytes=(\d*)-(\d*)/.exec(rangeHeader);

  if (!rangeMatch) {
    return response;
  }

  let start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
  let end = rangeMatch[2] ? Number(rangeMatch[2]) : size - 1;

  if (!Number.isFinite(start) || start < 0) {
    start = 0;
  }

  if (!Number.isFinite(end) || end >= size) {
    end = size - 1;
  }

  if (start > end || start >= size) {
    return new Response(null, {
      status: 416,
      statusText: "Range Not Satisfiable",
      headers: {
        "Content-Range": `bytes */${size}`
      }
    });
  }

  const slicedBuffer = arrayBuffer.slice(start, end + 1);
  const contentType = response.headers.get("Content-Type") || "audio/mpeg";

  return new Response(slicedBuffer, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(slicedBuffer.byteLength),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes"
    }
  });
}