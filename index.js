/*
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzRDsf6AfX6eq3pWQqzkV3mUd20Hj3BwjTMD58Tlx_cXAtnQI-PTKjQm5r4cOGi49CI/exec";
*/

import hippodromoAudios from "./data/audios.js";

const SKIN_PATH = "./skin/base-2.91.wsz";

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzRDsf6AfX6eq3pWQqzkV3mUd20Hj3BwjTMD58Tlx_cXAtnQI-PTKjQm5r4cOGi49CI/exec";

const MAX_OFFLINE_SELECTION = 10;

const STORAGE_KEYS = {
  customPlaylists: "hippodromo-custom-playlists",
  hiddenPlaylists: "hippodromo-hidden-playlists",
  selectedPlaylist: "hippodromo-selected-playlist",
};

const FIXED_PLAYLISTS = {
  hippodromo: {
    id: "hippodromo",
    name: "Playlist Hippodromo",
    subtitle: "Base 2.91 + músicas do projeto atual",
    type: "local",
    audioBasePath: "./files/",
    audios: hippodromoAudios,
  },

  redhot: {
    id: "redhot",
    name: "Playlist Red Hot Chili Peppers",
    subtitle: "Músicas carregadas do repositório GitHub vonkoln/redhot",
    type: "github",
    owner: "vonkoln",
    repo: "redhot",
    branch: "master",
    dataFile: "data.js",
    filesPath: "files",
    repoUrl: "https://github.com/vonkoln/redhot",
  },

  raimundos: {
    id: "raimundos",
    name: "Playlist Raimundos",
    subtitle: "Músicas carregadas do repositório GitHub vonkoln/raimundos",
    type: "github",
    owner: "vonkoln",
    repo: "raimundos",
    branch: "main",
    dataFile: "data.js",
    filesPath: "files",
    repoUrl: "https://github.com/vonkoln/raimundos",
  },
};

const elements = {
  container: document.getElementById("webamp-container"),
  status: document.getElementById("player-status"),
  trackCount: document.getElementById("track-count"),

  playlistTitle: document.getElementById("playlist-title"),
  playlistSubtitle: document.getElementById("playlist-subtitle"),
  playlistSelector: document.getElementById("playlist-selector"),

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

let currentPlaylist = null;
let currentAudios = [];
let currentAudioBasePath = "./files/";

let globalRanking = [];
let rankingByTrackKey = new Map();
let serviceWorkerRegistration = null;
let selectedOfflineKeys = new Set();
let webampInstance = null;
let availablePlaylists = {};

function setStatus(message, type = "info") {
  elements.status.textContent = message;
  elements.status.dataset.type = type;
}

function setOfflineCacheStatus(message, type = "info") {
  elements.offlineCacheStatus.textContent = message;
  elements.offlineCacheStatus.dataset.type = type;
}

function getCustomPlaylists() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.customPlaylists);
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getHiddenPlaylistIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.hiddenPlaylists);
    const parsed = raw ? JSON.parse(raw) : [];

    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function getAvailablePlaylists() {
  const hiddenIds = getHiddenPlaylistIds();
  const customPlaylists = getCustomPlaylists();

  const merged = {
    ...FIXED_PLAYLISTS,
  };

  customPlaylists.forEach((playlist) => {
    if (playlist?.id) {
      merged[playlist.id] = playlist;
    }
  });

  Object.keys(merged).forEach((playlistId) => {
    if (hiddenIds.has(playlistId)) {
      delete merged[playlistId];
    }
  });

  if (!Object.keys(merged).length) {
    return {
      hippodromo: FIXED_PLAYLISTS.hippodromo,
    };
  }

  return merged;
}

function populatePlaylistSelector() {
  availablePlaylists = getAvailablePlaylists();

  elements.playlistSelector.innerHTML = "";

  Object.values(availablePlaylists).forEach((playlist) => {
    const option = document.createElement("option");

    option.value = playlist.id;
    option.textContent = playlist.name.replace(/^Playlist\s+/i, "");

    elements.playlistSelector.appendChild(option);
  });
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

function normalizeAudioItem(item, index) {
  return {
    id: item.id ?? index + 1,
    title: item.title || `Faixa ${index + 1}`,
    artist: item.artist || "Artista desconhecido",
    cover: item.cover || "",
    file: item.file || "",
    category: item.category || currentPlaylist?.name || "Sem categoria",
    duration: item.duration || "--:--",
  };
}

function normalizeTrack(item, index) {
  const audio = normalizeAudioItem(item, index);

  if (!audio.file) {
    console.warn("Faixa ignorada por não possuir arquivo:", item);
    return null;
  }

  const duration = parseDurationToSeconds(audio.duration);

  const track = {
    url: getTrackUrl(audio),
    metaData: {
      title: audio.title,
      artist: audio.artist,
    },
  };

  if (duration) track.duration = duration;

  return track;
}

function getInitialTracks() {
  return currentAudios
    .map(normalizeTrack)
    .filter(Boolean);
}

function getTrackKey(item, index) {
  const playlistPrefix = currentPlaylist?.id || "playlist";

  if (item.id !== undefined && item.id !== null) {
    return `${playlistPrefix}:id-${item.id}`;
  }

  if (item.file) {
    return `${playlistPrefix}:file-${item.file}`;
  }

  return `${playlistPrefix}:index-${index}`;
}

function getTrackUrl(item) {
  return `${currentAudioBasePath}${item.file}`;
}

function getAbsoluteUrl(url) {
  return new URL(url, window.location.href).href;
}

function getGithubCdnBaseUrl(playlist) {
  return `https://cdn.jsdelivr.net/gh/${playlist.owner}/${playlist.repo}@${playlist.branch}/`;
}

function getSafeFileName(item, index) {
  const artist = item.artist || "Artista";
  const title = item.title || `Faixa ${index + 1}`;
  const extension = item.file?.split(".").pop() || "mp3";

  return `${currentPlaylist?.name || "Playlist"} - ${String(index + 1).padStart(2, "0")} - ${artist} - ${title}.${extension}`
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTrackLabel(item, index) {
  const artist = item.artist || "Artista desconhecido";
  const title = item.title || `Faixa ${index + 1}`;
  return `${artist} - ${title}`;
}

async function loadPlaylist(playlistId) {
  populatePlaylistSelector();

  const playlist = availablePlaylists[playlistId] ||
    availablePlaylists.hippodromo ||
    Object.values(availablePlaylists)[0];

  if (!playlist) {
    throw new Error("Nenhuma playlist disponível.");
  }

  setStatus(`Carregando ${playlist.name}...`);
  setOfflineCacheStatus("Preparando cache da playlist...");

  currentPlaylist = playlist;
  selectedOfflineKeys.clear();

  elements.playlistTitle.textContent = playlist.name;
  elements.playlistSubtitle.textContent = playlist.subtitle || "";
  elements.playlistSelector.value = playlist.id;
  document.title = playlist.name;

  localStorage.setItem(STORAGE_KEYS.selectedPlaylist, playlist.id);

  if (playlist.type === "local") {
    currentAudioBasePath = playlist.audioBasePath;
    currentAudios = playlist.audios.map(normalizeAudioItem);
  }

  if (playlist.type === "github") {
    const data = await loadGithubPlaylistData(playlist);

    currentAudioBasePath = `${getGithubCdnBaseUrl(playlist)}${playlist.filesPath || "files"}/`;
    currentAudios = data.map(normalizeAudioItem);
  }

  await renderCurrentPlaylist();
}

async function loadGithubPlaylistData(playlist) {
  const dataUrl = `${getGithubCdnBaseUrl(playlist)}${playlist.dataFile || "data.js"}`;

  const response = await fetch(dataUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Não foi possível carregar ${playlist.name}. Verifique se existe data.js no repositório.`);
  }

  const source = await response.text();

  return parseExportDefaultArray(source);
}

function parseExportDefaultArray(source) {
  const cleanSource = source
    .replace(/^\s*export\s+default\s+/, "")
    .replace(/;\s*$/, "");

  try {
    const parsed = Function(`"use strict"; return (${cleanSource});`)();

    if (!Array.isArray(parsed)) {
      throw new Error("O arquivo data.js não retornou uma lista.");
    }

    return parsed;
  } catch (error) {
    console.error(error);
    throw new Error("Não foi possível interpretar o data.js da playlist.");
  }
}

async function renderCurrentPlaylist() {
  resetProgress("auto");
  resetProgress("manual");

  renderDownloadList();
  renderOfflinePickerList();

  sendMediaManifestToServiceWorker();

  await fetchGlobalRanking();

  await renderWebamp();
}

async function renderWebamp() {
  validateEnvironment();

  const tracks = getInitialTracks();

  if (!tracks.length) {
    setStatus("Nenhuma faixa encontrada nesta playlist.", "error");
    updateTrackCount([]);
    return;
  }

  updateTrackCount(tracks);

  try {
    if (webampInstance && typeof webampInstance.dispose === "function") {
      webampInstance.dispose();
    }
  } catch (error) {
    console.warn("Não foi possível descartar a instância anterior do Webamp:", error);
  }

  elements.container.innerHTML = "";

  webampInstance = new window.Webamp({
    initialTracks: tracks,

    initialSkin: {
      url: SKIN_PATH,
    },
  });

  await webampInstance.renderWhenReady(elements.container);

  window.__webamp = webampInstance;

  setStatus(`${currentPlaylist.name} carregada.`, "success");
  sendMediaManifestToServiceWorker();
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
  return currentAudios.reduce((total, item, index) => {
    if (!item.file) return total;
    return total + getGlobalDownloadCount(item, index);
  }, 0);
}

function getAudiosSortedByDownloads() {
  return currentAudios
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
    playlistId: currentPlaylist.id,
    playlistName: currentPlaylist.name,
    trackKey: getTrackKey(item, index),
    id: item.id || "",
    artist: item.artist || "Artista desconhecido",
    title: item.title || `Faixa ${index + 1}`,
    file: item.file || "",
    category: item.category || currentPlaylist.name || "Sem categoria",
  });

  updateRankingState(payload);
  renderDownloadList();
  renderOfflinePickerList();

  return payload;
}

async function fetchGlobalRanking() {
  elements.downloadList.innerHTML = `<p class="download-empty">Atualizando lista por downloads globais...</p>`;

  try {
    const payload = await createJsonpRequest({
      action: "ranking",
      playlistId: currentPlaylist?.id || "",
    });

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
    const category = item.category || currentPlaylist.name || "Sem categoria";
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
    const category = item.category || currentPlaylist.name || "Sem categoria";
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
  const selectedEntries = currentAudios
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
  if (!currentAudios.length) return;

  const items = currentAudios
    .filter((item) => item.file)
    .map((item, index) => getTrackCacheItem(item, index));

  const message = {
    type: "INIT_MEDIA_MANIFEST",
    playlistId: currentPlaylist?.id || "",
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

  elements.playlistSelector.addEventListener("change", async () => {
    try {
      await loadPlaylist(elements.playlistSelector.value);
    } catch (error) {
      console.error(error);
      setStatus(`Erro ao carregar playlist: ${error.message}`, "error");
    }
  });

  window.addEventListener("storage", (event) => {
    if (
      event.key === STORAGE_KEYS.customPlaylists ||
      event.key === STORAGE_KEYS.hiddenPlaylists
    ) {
      const currentId = currentPlaylist?.id || "hippodromo";
      populatePlaylistSelector();

      if (availablePlaylists[currentId]) {
        elements.playlistSelector.value = currentId;
      }
    }
  });

  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);

  navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);

  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    setOfflineCacheStatus("Cache atualizado. Recarregue a página para finalizar.", "success");
    sendMediaManifestToServiceWorker();
  });
}

async function startApp() {
  try {
    bindActions();
    updateConnectionStatus();

    await registerServiceWorker();

    resetProgress("auto");
    resetProgress("manual");

    populatePlaylistSelector();

    const savedPlaylistId = localStorage.getItem(STORAGE_KEYS.selectedPlaylist) || "hippodromo";
    const startPlaylistId = availablePlaylists[savedPlaylistId] ? savedPlaylistId : "hippodromo";

    await loadPlaylist(startPlaylistId);
  } catch (error) {
    console.error(error);

    setStatus(
      `Erro ao iniciar: ${error.message}`,
      "error"
    );
  }
}

startApp();