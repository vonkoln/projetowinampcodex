import audios from "./data/audios.js";

const AUDIO_BASE_PATH = "./files/";
const SKIN_PATH = "./skin/base-2.91.wsz";

const elements = {
  container: document.getElementById("webamp-container"),
  status: document.getElementById("player-status"),
  trackCount: document.getElementById("track-count"),
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

async function startWebamp() {
  try {
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