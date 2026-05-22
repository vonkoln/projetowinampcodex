import audios from "./data/audios.js";

const AUDIO_BASE_PATH = "./files/";
const SKIN_PATH = "./skin/base-2.91.wsz";

/*
  Cole aqui a URL do Apps Script publicado como App da Web.
  Exemplo:
  const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/SEU_ID/exec";
*/

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzRDsf6AfX6eq3pWQqzkV3mUd20Hj3BwjTMD58Tlx_cXAtnQI-PTKjQm5r4cOGi49CI/exec";

const elements = {
  container: document.getElementById("webamp-container"),
  status: document.getElementById("player-status"),
  trackCount: document.getElementById("track-count"),

  downloadList: document.getElementById("download-list"),
  downloadCount: document.getElementById("download-count"),

  rankingList: document.getElementById("ranking-list"),
  rankingTotal: document.getElementById("ranking-total"),
  refreshRanking: document.getElementById("refresh-ranking"),
};

function setStatus(message, type = "info") {
  elements.status.textContent = message;
  elements.status.dataset.type = type;
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

  if (payload.ranking) {
    renderRanking(payload);
  }

  return payload;
}

async function fetchGlobalRanking() {
  elements.rankingList.innerHTML = `
    <p class="ranking-empty">Atualizando ranking global...</p>
  `;

  try {
    const payload = await createJsonpRequest({
      action: "ranking",
    });

    renderRanking(payload);
  } catch (error) {
    console.error(error);

    elements.rankingList.innerHTML = `
      <p class="ranking-empty">Não foi possível carregar o ranking global.</p>
    `;

    elements.rankingTotal.textContent = "erro";
  }
}

function renderDownloadList() {
  const validAudios = audios.filter((item) => item.file);

  elements.downloadCount.textContent = `${validAudios.length} arquivo${validAudios.length === 1 ? "" : "s"}`;

  if (!validAudios.length) {
    elements.downloadList.innerHTML = `
      <p class="download-empty">Nenhum arquivo disponível para download.</p>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  validAudios.forEach((item, index) => {
    const link = document.createElement("a");

    const artist = item.artist || "Artista desconhecido";
    const title = item.title || `Faixa ${index + 1}`;
    const category = item.category || "Sem categoria";
    const duration = item.duration || "--:--";

    link.href = `${AUDIO_BASE_PATH}${item.file}`;
    link.download = getSafeFileName(item, index);
    link.className = "download-item";
    link.dataset.trackKey = getTrackKey(item, index);

    link.innerHTML = `
      <span class="download-index">${String(index + 1).padStart(2, "0")}</span>

      <span class="download-info">
        <strong>${title}</strong>
        <small>${artist} · ${category}</small>
      </span>

      <span class="download-meta">
        <span class="download-duration">${duration}</span>
        <span class="download-counter" data-counter-for="${getTrackKey(item, index)}">global</span>
      </span>
    `;

    link.addEventListener("click", async (event) => {
      event.preventDefault();

      setStatus(`Registrando download: ${artist} - ${title}...`);

      try {
        await registerGlobalDownload(item, index);
        setStatus(`Download registrado: ${artist} - ${title}.`, "success");
      } catch (error) {
        console.error(error);
        setStatus("Download iniciado, mas não foi possível registrar no ranking global.", "error");
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

function renderRanking(payload) {
  const ranking = payload.ranking || [];
  const totalDownloads = Number(payload.totalDownloads || 0);

  elements.rankingTotal.textContent = `${totalDownloads} download${totalDownloads === 1 ? "" : "s"}`;

  updateDownloadCounters(ranking);

  const visibleRanking = ranking.filter((item) => Number(item.count || 0) > 0);

  if (!visibleRanking.length) {
    elements.rankingList.innerHTML = `
      <p class="ranking-empty">Nenhum download registrado ainda.</p>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  visibleRanking.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "ranking-item";

    const title = item.title || "Faixa sem título";
    const artist = item.artist || "Artista desconhecido";
    const category = item.category || "Sem categoria";
    const count = Number(item.count || 0);

    row.innerHTML = `
      <span class="ranking-position">${index + 1}</span>

      <span class="ranking-info">
        <strong>${title}</strong>
        <small>${artist} · ${category}</small>
      </span>

      <span class="ranking-count">${count}</span>
    `;

    fragment.appendChild(row);
  });

  elements.rankingList.innerHTML = "";
  elements.rankingList.appendChild(fragment);
}

function updateDownloadCounters(ranking) {
  const byKey = new Map();

  ranking.forEach((item) => {
    byKey.set(String(item.trackKey), Number(item.count || 0));
  });

  document.querySelectorAll("[data-counter-for]").forEach((counter) => {
    const key = counter.dataset.counterFor;
    const count = byKey.get(key) || 0;

    counter.textContent = `${count} download${count === 1 ? "" : "s"}`;
  });
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

function bindActions() {
  elements.refreshRanking.addEventListener("click", fetchGlobalRanking);
}

async function startWebamp() {
  try {
    bindActions();
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