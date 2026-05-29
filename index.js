

import audios from "./data/audios.js";

const AUDIO_BASE_PATH = "./files/";
const SKIN_PATH = "./skin/base-2.91.wsz";

/*
  Cole aqui a URL do Apps Script publicado como App da Web.
  Exemplo:
  const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/SEU_ID/exec";
*/
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzRDsf6AfX6eq3pWQqzkV3mUd20Hj3BwjTMD58Tlx_cXAtnQI-PTKjQm5r4cOGi49CI/exec";

const APP_CORE_CACHE_FILES = [
  "./",
  "./index.html",
  "./index.js",
  "./style.css",
  "./manifest.json",
  "./data/audios.js",
  "./skin/base-2.91.wsz",
];

const elements = {
  container: document.getElementById("webamp-container"),
  status: document.getElementById("player-status"),
  trackCount: document.getElementById("track-count"),

  connectionBanner: document.getElementById("connection-banner"),
  connectionStatusText: document.getElementById("connection-status-text"),

  cacheCoreButton: document.getElementById("cache-core-button"),
  offlineCacheStatus: document.getElementById("offline-cache-status"),

  downloadList: document.getElementById("download-list"),
  downloadCount: document.getElementById("download-count"),
  refreshRanking: document.getElementById("refresh-ranking"),
};

let globalRanking = [];
let rankingByTrackKey = new Map();
let serviceWorkerRegistration = null;

function setStatus(message, type = "info") {
  elements.status.textContent = message;
  elements.status.dataset.type = type;
}

function setOfflineCacheStatus(message, type = "info") {
  elements.offlineCacheStatus.textContent = message;
  elements.offlineCacheStatus.dataset.type = type;
}

function parseDurationToSeconds(duration) {
  if (!duration || typeof duration !== "string") {
    return undefined;
  }

  const parts = duration.split(":").map((part) => Number(part.trim()));

  if (parts.some((part) => Number.isNaN(part))) {
    return undefined;
  }

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

  if (duration) {
    track.duration = duration;
  }

  return track;
}

function getInitialTracks() {
  return audios
    .map(normalizeTrack)
    .filter(Boolean);
}

function getTrackKey(item, index) {
  if (item.id !== undefined && item.id !== null) {
    return `id-${item.id}`;
  }

  if (item.file) {
    return `file-${item.file}`;
  }

  return `index-${index}`;
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
      if (didFinish) {
        return;
      }

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
    if (!item.file) {
      return total;
    }

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
      if (b.count !== a.count) {
        return b.count - a.count;
      }

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

  return payload;
}

async function fetchGlobalRanking() {
  elements.downloadList.innerHTML = `
    <p class="download-empty">Atualizando lista por downloads globais...</p>
  `;

  try {
    const payload = await createJsonpRequest({
      action: "ranking",
    });

    updateRankingState(payload);
    renderDownloadList();
  } catch (error) {
    console.error(error);

    elements.downloadList.innerHTML = `
      <p class="download-empty">
        Não foi possível carregar os downloads globais. A lista será exibida em ordem alfabética.
      </p>
    `;

    renderDownloadList();
  }
}

function renderDownloadList() {
  const sortedAudios = getAudiosSortedByDownloads();
  const totalFiles = sortedAudios.length;
  const totalDownloads = getTotalGlobalDownloads();

  elements.downloadCount.textContent =
    `${totalFiles} arquivo${totalFiles === 1 ? "" : "s"} · ${totalDownloads} download${totalDownloads === 1 ? "" : "s"}`;

  if (!sortedAudios.length) {
    elements.downloadList.innerHTML = `
      <p class="download-empty">Nenhum arquivo disponível para download.</p>
    `;
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

    link.href = `${AUDIO_BASE_PATH}${item.file}`;
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

      const audioUrl = `${AUDIO_BASE_PATH}${item.file}`;

      try {
        await cacheMediaFile(audioUrl);
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
    setOfflineCacheStatus("Conexão restaurada. Músicas acessadas podem continuar do cache.", "success");
  } else {
    elements.connectionStatusText.textContent = "Sem conexão";
    setOfflineCacheStatus("Sem internet. O que já estiver em cache ainda pode funcionar.", "warning");
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    setOfflineCacheStatus("Service Worker não é suportado neste navegador.", "error");
    return;
  }

  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register("./service-worker.js");

    setOfflineCacheStatus("Cache ativo. Músicas acessadas serão reaproveitadas.", "success");

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

function sendMessageToServiceWorker(message) {
  return new Promise((resolve, reject) => {
    if (!navigator.serviceWorker?.controller) {
      reject(new Error("Service Worker ainda não está controlando a página."));
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

    navigator.serviceWorker.controller.postMessage(message, [messageChannel.port2]);
  });
}

async function cacheCoreFiles() {
  setOfflineCacheStatus("Salvando arquivos principais offline...");

  try {
    await sendMessageToServiceWorker({
      type: "CACHE_URLS",
      urls: APP_CORE_CACHE_FILES,
    });

    setOfflineCacheStatus("Arquivos principais salvos offline.", "success");
  } catch (error) {
    console.error(error);

    if (!navigator.serviceWorker?.controller) {
      setOfflineCacheStatus("Atualize a página uma vez para ativar o cache offline.", "warning");
      return;
    }

    setOfflineCacheStatus("Não foi possível salvar os arquivos principais.", "error");
  }
}

async function cacheMediaFile(url) {
  if (!navigator.serviceWorker?.controller) {
    return;
  }

  await sendMessageToServiceWorker({
    type: "CACHE_URLS",
    urls: [url],
  });
}

function bindActions() {
  elements.refreshRanking.addEventListener("click", fetchGlobalRanking);
  elements.cacheCoreButton.addEventListener("click", cacheCoreFiles);

  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);

  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    setOfflineCacheStatus("Cache atualizado. Recarregue se notar instabilidade.", "success");
  });
}

async function startWebamp() {
  try {
    bindActions();
    updateConnectionStatus();

    await registerServiceWorker();

    renderDownloadList();
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
  } catch (error) {
    console.error(error);

    setStatus(
      `Erro ao iniciar Webamp: ${error.message}`,
      "error"
    );
  }
}

startWebamp();