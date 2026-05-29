/*
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzRDsf6AfX6eq3pWQqzkV3mUd20Hj3BwjTMD58Tlx_cXAtnQI-PTKjQm5r4cOGi49CI/exec";
*/
import audios from "./data/audios.js";

const AUDIO_BASE_PATH = "./files/";
const SKIN_PATH = "./skin/base-2.91.wsz";

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzRDsf6AfX6eq3pWQqzkV3mUd20Hj3BwjTMD58Tlx_cXAtnQI-PTKjQm5r4cOGi49CI/exec";


const MAX_OFFLINE_SELECTION = 10;

const elements = {
  container: document.getElementById("webamp-container"),
  status: document.getElementById("player-status"),
  trackCount: document.getElementById("track-count"),

  connectionBanner: document.getElementById("connection-banner"),
  connectionStatusText: document.getElementById("connection-status-text"),

  offlineCacheStatus: document.getElementById("offline-cache-status"),

  autoProgressFill: document.getElementById("auto-progress-fill"),
  autoItemProgress: document.getElementById("auto-item-progress"),
  autoTotalProgress: document.getElementById("auto-total-progress"),
  autoProgressName: document.getElementById("auto-progress-name"),

  manualProgressFill: document.getElementById("manual-progress-fill"),
  manualItemProgress: document.getElementById("manual-item-progress"),
  manualTotalProgress: document.getElementById("manual-total-progress"),
  manualProgressName: document.getElementById("manual-progress-name"),

  offlinePickerList: document.getElementById("offline-picker-list"),
  offlineSelectedCount: document.getElementById("offline-selected-count"),
  selectTopOffline: document.getElementById("select-top-offline"),
  clearOfflineSelection: document.getElementById("clear-offline-selection"),
  cacheSelectedButton: document.getElementById("cache-selected-button"),

  downloadList: document.getElementById("download-list"),
  downloadCount: document.getElementById("download-count"),
  refreshRanking: document.getElementById("refresh-ranking"),
};

let globalRanking = [];
let rankingByTrackKey = new Map();
let serviceWorkerRegistration = null;
let selectedOfflineKeys = new Set();

function setStatus(message, type = "info") {
  elements.status.textContent = message;
  elements.status.dataset.type = type;
}

function setOfflineCacheStatus(message, type = "info") {
  elements.offlineCacheStatus.textContent = message;
  elements.offlineCacheStatus.dataset.type = type;
}

function parseDurationToSeconds(duration) {
  if (!duration || typeof duration !== "string") return undefined;

  const parts = duration.split(":").map((part) => Number(part.trim()));

  if (parts.some((part) => Number.isNaN(part))) return undefined;

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return undefined;
}

function normalizeTrack(item, index) {
  const title = item.title || `Faixa ${index + 1}`;
  const artist = item.artist || "Artista desconhecido";
  const file = item.file;

  if (!file) {
    console.warn("Faixa ignorada por não possuir arquivo:", item);
    return null;
  }

  const duration = parseDurationToSeconds(item.duration);

  const track = {
    url: `${AUDIO_BASE_PATH}${file}`,
    metaData: {
      title,
      artist,
    },
  };

  if (duration) track.duration = duration;

  return track;
}

function getInitialTracks() {
  return audios
    .map(normalizeTrack)
    .filter(Boolean);
}

function getTrackKey(item, index) {
  if (item.id !== undefined && item.id !== null) return `id-${item.id}`;
  if (item.file) return `file-${item.file}`;
  return `index-${index}`;
}

function getTrackUrl(item) {
  return `${AUDIO_BASE_PATH}${item.file}`;
}

function getAbsoluteUrl(url) {
  return new URL(url, window.location.href).href;
}

function getSafeFileName(item, index) {
  const artist = item.artist || "Artista";
  const title = item.title || `Faixa ${index + 1}`;
  const extension = item.file?.split(".").pop() || "mp3";

  return `${String(index + 1).padStart(2, "0")} - ${artist} - ${title}.${extension}`
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTrackLabel(item, index) {
  const artist = item.artist || "Artista desconhecido";
  const title = item.title || `Faixa ${index + 1}`;
  return `${artist} - ${title}`;
}

function createJsonpRequest(params, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("COLE_AQUI")) {
      reject(new Error("URL do Google Apps Script não configurada no index.js."));
      return;
    }

    const callbackName = `__downloadCounterCallback_${Date.now()}_${Math.round(Math.random() * 100000)}`;
    const url = new URL(GOOGLE_SCRIPT_URL);

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value ?? "");
    });

    url.searchParams.set("callback", callbackName);
    url.searchParams.set("_", Date.now());

    const script = document.createElement("script");
    let didFinish = false;

    const cleanup = () => {
      didFinish = true;
      delete window[callbackName];

      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const timer = window.setTimeout(() => {
      if (didFinish) return;
      cleanup();
      reject(new Error("Tempo esgotado ao acessar o Google Sheets."));
    }, timeoutMs);

    window[callbackName] = (payload) => {
      window.clearTimeout(timer);
      cleanup();

      if (!payload || payload.ok === false) {
        reject(new Error(payload?.error || "Resposta inválida do Google Sheets."));
        return;
      }

      resolve(payload);
    };

    script.onerror = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new Error("Falha ao carregar resposta do Apps Script."));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function updateRankingState(payload) {
  globalRanking = Array.isArray(payload?.ranking) ? payload.ranking : [];
  rankingByTrackKey = new Map();

  globalRanking.forEach((item) => {
    rankingByTrackKey.set(String(item.trackKey), {
      ...item,
      count: Number(item.count || 0),
    });
  });
}

function getGlobalDownloadCount(item, index) {
  const key = getTrackKey(item, index);
  const rankingItem = rankingByTrackKey.get(key);
  return Number(rankingItem?.count || 0);
}

function getTotalGlobalDownloads() {
  return audios.reduce((total, item, index) => {
    if (!item.file) return total;
    return total + getGlobalDownloadCount(item, index);
  }, 0);
}

function getAudiosSortedByDownloads() {
  return audios
    .map((item, index) => ({
      item,
      index,
      key: getTrackKey(item, index),
      count: item.file ? getGlobalDownloadCount(item, index) : 0,
      label: getTrackLabel(item, index),
    }))
    .filter((entry) => entry.item.file)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, "pt-BR");
    });
}

async function registerGlobalDownload(item, index) {
  const payload = await createJsonpRequest({
    action: "download",
    trackKey: getTrackKey(item, index),
    id: item.id || "",
    artist: item.artist || "Artista desconhecido",
    title: item.title || `Faixa ${index + 1}`,
    file: item.file || "",
    category: item.category || "Sem categoria",
  });

  updateRankingState(payload);
  renderDownloadList();
  renderOfflinePickerList();

  return payload;
}

async function fetchGlobalRanking() {
  elements.downloadList.innerHTML = `<p class="download-empty">Atualizando lista por downloads globais...</p>`;

  try {
    const payload = await createJsonpRequest({ action: "ranking" });
    updateRankingState(payload);
    renderDownloadList();
    renderOfflinePickerList();
  } catch (error) {
    console.error(error);

    elements.downloadList.innerHTML = `
      <p class="download-empty">
        Não foi possível carregar os downloads globais. A lista será exibida em ordem alfabética.
      </p>
    `;

    renderDownloadList();
    renderOfflinePickerList();
  }
}

function renderDownloadList() {
  const sortedAudios = getAudiosSortedByDownloads();
  const totalFiles = sortedAudios.length;
  const totalDownloads = getTotalGlobalDownloads();

  elements.downloadCount.textContent =
    `${totalFiles} arquivo${totalFiles === 1 ? "" : "s"} · ${totalDownloads} download${totalDownloads === 1 ? "" : "s"}`;

  if (!sortedAudios.length) {
    elements.downloadList.innerHTML = `<p class="download-empty">Nenhum arquivo disponível para download.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  sortedAudios.forEach((entry, rankIndex) => {
    const { item, index, count } = entry;
    const link = document.createElement("a");

    const artist = item.artist || "Artista desconhecido";
    const title = item.title || `Faixa ${index + 1}`;
    const category = item.category || "Sem categoria";
    const duration = item.duration || "--:--";

    link.href = getTrackUrl(item);
    link.download = getSafeFileName(item, index);
    link.className = "download-item";
    link.dataset.trackKey = getTrackKey(item, index);

    if (rankIndex === 0 && count > 0) {
      link.classList.add("is-top-download");
    }

    link.innerHTML = `
      <span class="download-rank">${rankIndex + 1}</span>

      <span class="download-info">
        <strong>${title}</strong>
        <small>${artist} · ${category}</small>
      </span>

      <span class="download-meta">
        <span class="download-duration">${duration}</span>
        <span class="download-counter">${count} download${count === 1 ? "" : "s"}</span>
      </span>
    `;

    link.addEventListener("click", async (event) => {
      event.preventDefault();

      setStatus(`Registrando download: ${artist} - ${title}...`);

      try {
        await cacheMediaFiles([getTrackCacheItem(item, index)], "manual");
      } catch (error) {
        console.warn("Não foi possível pré-cachear antes do download:", error);
      }

      try {
        await registerGlobalDownload(item, index);
        setStatus(`Download registrado: ${artist} - ${title}.`, "success");
      } catch (error) {
        console.error(error);
        setStatus("Download iniciado, mas não foi possível registrar no contador global.", "error");
      } finally {
        startFileDownload(link.href, link.download);
      }
    });

    fragment.appendChild(link);
  });

  elements.downloadList.innerHTML = "";
  elements.downloadList.appendChild(fragment);
}

function renderOfflinePickerList() {
  const sortedAudios = getAudiosSortedByDownloads();

  if (!sortedAudios.length) {
    elements.offlinePickerList.innerHTML = `<p class="download-empty">Nenhuma música disponível para salvar offline.</p>`;
    updateOfflineSelectedCount();
    return;
  }

  const fragment = document.createDocumentFragment();

  sortedAudios.forEach((entry, rankIndex) => {
    const { item, index, count } = entry;

    const key = getTrackKey(item, index);
    const row = document.createElement("label");
    row.className = "offline-picker-item";

    const artist = item.artist || "Artista desconhecido";
    const title = item.title || `Faixa ${index + 1}`;
    const category = item.category || "Sem categoria";
    const duration = item.duration || "--:--";

    row.innerHTML = `
      <input type="checkbox" class="offline-checkbox" value="${key}">
      <span class="offline-rank">${rankIndex + 1}</span>

      <span class="offline-info">
        <strong>${title}</strong>
        <small>${artist} · ${category}</small>
      </span>

      <span class="offline-meta">
        <span>${duration}</span>
        <small>${count} download${count === 1 ? "" : "s"}</small>
      </span>
    `;

    const checkbox = row.querySelector(".offline-checkbox");
    checkbox.checked = selectedOfflineKeys.has(key);

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        if (selectedOfflineKeys.size >= MAX_OFFLINE_SELECTION) {
          checkbox.checked = false;
          setOfflineCacheStatus(`Escolha no máximo ${MAX_OFFLINE_SELECTION} músicas por vez.`, "warning");
          return;
        }

        selectedOfflineKeys.add(key);
      } else {
        selectedOfflineKeys.delete(key);
      }

      updateOfflineSelectedCount();
    });

    fragment.appendChild(row);
  });

  elements.offlinePickerList.innerHTML = "";
  elements.offlinePickerList.appendChild(fragment);

  updateOfflineSelectedCount();
}

function updateOfflineSelectedCount() {
  elements.offlineSelectedCount.textContent = `${selectedOfflineKeys.size}/${MAX_OFFLINE_SELECTION} selecionadas`;
}

function selectTopOfflineTracks() {
  selectedOfflineKeys.clear();

  getAudiosSortedByDownloads()
    .slice(0, MAX_OFFLINE_SELECTION)
    .forEach((entry) => selectedOfflineKeys.add(entry.key));

  renderOfflinePickerList();
  setOfflineCacheStatus("Top 10 marcado para salvar offline.", "success");
}

function clearOfflineSelection() {
  selectedOfflineKeys.clear();
  renderOfflinePickerList();
  setOfflineCacheStatus("Seleção offline limpa.");
}

function getTrackCacheItem(item, index) {
  return {
    url: getAbsoluteUrl(getTrackUrl(item)),
    name: getTrackLabel(item, index),
  };
}

async function cacheSelectedOfflineTracks() {
  const selectedEntries = audios
    .map((item, index) => ({
      item,
      index,
      key: getTrackKey(item, index),
    }))
    .filter((entry) => selectedOfflineKeys.has(entry.key) && entry.item.file)
    .slice(0, MAX_OFFLINE_SELECTION);

  if (!selectedEntries.length) {
    setOfflineCacheStatus("Selecione pelo menos uma música.", "warning");
    return;
  }

  const items = selectedEntries.map((entry) => getTrackCacheItem(entry.item, entry.index));

  resetProgress("manual");
  setOfflineCacheStatus(`Salvando ${items.length} música${items.length === 1 ? "" : "s"} offline...`);

  try {
    await cacheMediaFiles(items, "manual");
    setOfflineCacheStatus(`${items.length} música${items.length === 1 ? "" : "s"} salva${items.length === 1 ? "" : "s"} offline.`, "success");
  } catch (error) {
    console.error(error);
    setOfflineCacheStatus("Não foi possível salvar todas as músicas offline.", "error");
  }
}

function startFileDownload(url, fileName) {
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  link.remove();
}

function validateEnvironment() {
  if (!elements.container) {
    throw new Error("Container #webamp-container não encontrado.");
  }

  if (!window.Webamp) {
    throw new Error("Webamp não foi carregado. Verifique sua conexão ou o script CDN no index.html.");
  }

  if (
    typeof window.Webamp.browserIsSupported === "function" &&
    !window.Webamp.browserIsSupported()
  ) {
    throw new Error("Este navegador não é compatível com Webamp.");
  }
}

function updateTrackCount(tracks) {
  const total = tracks.length;
  elements.trackCount.textContent = `${total} faixa${total === 1 ? "" : "s"}`;
}

function updateConnectionStatus() {
  const isOnline = navigator.onLine;

  elements.connectionBanner.classList.toggle("is-online", isOnline);
  elements.connectionBanner.classList.toggle("is-offline", !isOnline);

  if (isOnline) {
    elements.connectionStatusText.textContent = "Online";
    setOfflineCacheStatus("Conexão restaurada. O cache automático continua ativo.", "success");
  } else {
    elements.connectionStatusText.textContent = "Sem conexão";
    setOfflineCacheStatus("Sem internet. Apenas músicas já salvas/cacheadas devem funcionar.", "warning");
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    setOfflineCacheStatus("Service Worker não é suportado neste navegador.", "error");
    return;
  }

  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register("./service-worker.js");
    await navigator.serviceWorker.ready;

    setOfflineCacheStatus("Cache automático ativo: música atual + próximas 5.", "success");

    sendMediaManifestToServiceWorker();

    if (serviceWorkerRegistration.waiting) {
      serviceWorkerRegistration.waiting.postMessage({
        type: "SKIP_WAITING",
      });
    }
  } catch (error) {
    console.error(error);
    setOfflineCacheStatus("Não foi possível ativar o cache offline.", "error");
  }
}

function getServiceWorkerTarget() {
  return navigator.serviceWorker?.controller ||
    serviceWorkerRegistration?.active ||
    serviceWorkerRegistration?.waiting ||
    serviceWorkerRegistration?.installing ||
    null;
}

function sendMessageToServiceWorker(message, waitForFinal = true) {
  return new Promise((resolve, reject) => {
    const target = getServiceWorkerTarget();

    if (!target) {
      reject(new Error("Service Worker ainda não está ativo."));
      return;
    }

    const messageChannel = new MessageChannel();

    messageChannel.port1.onmessage = (event) => {
      if (event.data?.ok) {
        resolve(event.data);
      } else {
        reject(new Error(event.data?.error || "Falha na comunicação com o Service Worker."));
      }
    };

    target.postMessage(message, [messageChannel.port2]);

    if (!waitForFinal) {
      resolve({ ok: true });
    }
  });
}

function sendMediaManifestToServiceWorker() {
  const items = audios
    .filter((item) => item.file)
    .map((item, index) => getTrackCacheItem(item, index));

  const message = {
    type: "INIT_MEDIA_MANIFEST",
    items,
    prefetchNextCount: 5,
  };

  const target = getServiceWorkerTarget();

  if (target) {
    target.postMessage(message);
  }
}

async function cacheMediaFiles(items, scope) {
  if (!items.length) return;

  const normalizedItems = items.map((item) => ({
    url: getAbsoluteUrl(item.url),
    name: item.name || item.url,
  }));

  await sendMessageToServiceWorker({
    type: "CACHE_URLS",
    items: normalizedItems,
    scope,
  });
}

function resetProgress(scope) {
  updateProgressBar({
    scope,
    itemName: scope === "manual"
      ? "Aguardando músicas escolhidas..."
      : "Aguardando música atual + próximas 5...",
    itemPercent: 0,
    totalPercent: 0,
  });
}

function updateProgressBar(data) {
  const itemPercent = Math.max(0, Math.min(100, Number(data.itemPercent || 0)));
  const totalPercent = Math.max(0, Math.min(100, Number(data.totalPercent || 0)));
  const itemName = data.itemName || "Aguardando...";

  const isManual = data.scope === "manual";

  const fill = isManual ? elements.manualProgressFill : elements.autoProgressFill;
  const itemLabel = isManual ? elements.manualItemProgress : elements.autoItemProgress;
  const totalLabel = isManual ? elements.manualTotalProgress : elements.autoTotalProgress;
  const nameLabel = isManual ? elements.manualProgressName : elements.autoProgressName;

  fill.style.width = `${itemPercent}%`;
  itemLabel.textContent = `${Math.round(itemPercent)}%`;
  totalLabel.textContent = `${Math.round(totalPercent)}%`;
  nameLabel.textContent = itemName;

  fill.classList.toggle("is-complete", itemPercent >= 100 && totalPercent >= 100);
}

function handleServiceWorkerMessage(event) {
  const data = event.data || {};

  if (data.type === "CACHE_PROGRESS") {
    updateProgressBar(data);
  }

  if (data.type === "CACHE_DONE") {
    updateProgressBar({
      scope: data.scope,
      itemName: data.message || "Download offline concluído.",
      itemPercent: 100,
      totalPercent: 100,
    });

    if (data.scope === "auto") {
      setOfflineCacheStatus("Música atual + próximas faixas salvas no cache.", "success");
    }

    if (data.scope === "manual") {
      setOfflineCacheStatus("Músicas escolhidas salvas para ouvir offline.", "success");
    }
  }
}

function bindActions() {
  elements.refreshRanking.addEventListener("click", fetchGlobalRanking);
  elements.selectTopOffline.addEventListener("click", selectTopOfflineTracks);
  elements.clearOfflineSelection.addEventListener("click", clearOfflineSelection);
  elements.cacheSelectedButton.addEventListener("click", cacheSelectedOfflineTracks);

  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);

  navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);

  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    setOfflineCacheStatus("Cache atualizado. Recarregue a página para finalizar.", "success");
    sendMediaManifestToServiceWorker();
  });
}

async function startWebamp() {
  try {
    bindActions();
    updateConnectionStatus();

    await registerServiceWorker();

    resetProgress("auto");
    resetProgress("manual");

    renderDownloadList();
    renderOfflinePickerList();
    fetchGlobalRanking();

    validateEnvironment();

    const tracks = getInitialTracks();

    if (!tracks.length) {
      setStatus("Nenhuma faixa encontrada em data/audios.js.", "error");
      updateTrackCount([]);
      return;
    }

    updateTrackCount(tracks);

    const webamp = new window.Webamp({
      initialTracks: tracks,

      initialSkin: {
        url: SKIN_PATH,
      },
    });

    await webamp.renderWhenReady(elements.container);

    setStatus("Webamp carregado com a skin Base 2.91.", "success");

    window.__webamp = webamp;

    sendMediaManifestToServiceWorker();
  } catch (error) {
    console.error(error);

    setStatus(
      `Erro ao iniciar Webamp: ${error.message}`,
      "error"
    );
  }
}

startWebamp();