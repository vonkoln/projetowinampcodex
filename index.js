import audios from "./data/audios.js";

const AUDIO_BASE_PATH = "./files/";
const COVER_BASE_PATH = "./files/";
const DEFAULT_COVER = "https://placehold.co/500x500/0c1123/ffffff?text=Player";

const STORAGE_KEYS = {
  theme: "player-theme",
  volume: "player-volume",
  currentTrackId: "player-current-track-id",
};

const tracks = audios.map((item, index) => ({
  id: Number(item.id ?? index + 1),
  title: item.title || "Sem título",
  artist: item.artist || "",
  category: item.category || "Sem categoria",
  duration: item.duration || "--:--",
  file: item.file,
  coverFile: item.cover,
  src: `${AUDIO_BASE_PATH}${item.file}`,
  cover: `${COVER_BASE_PATH}${item.cover}`,
}));

const elements = {
  audio: document.getElementById("audio"),

  themeToggle: document.getElementById("theme-toggle"),
  searchInput: document.getElementById("search-input"),
  categoryFilter: document.getElementById("category-filter"),
  playlistCount: document.getElementById("playlist-count"),

  classicTitle: document.getElementById("classic-title"),
  classicArtist: document.getElementById("classic-artist"),
  classicCategory: document.getElementById("now-playing-category"),
  classicCover: document.getElementById("classic-cover"),
  classicPlayIcon: document.getElementById("classic-play-icon"),
  classicSeek: document.getElementById("classic-seek"),
  classicCurrentTime: document.getElementById("classic-current-time"),
  classicDuration: document.getElementById("classic-duration"),
  playerStatus: document.getElementById("player-status"),

  volume: document.getElementById("volume"),
  volumeIcon: document.getElementById("volume-icon"),
  volumeButton: document.getElementById("volume-button"),
  previousTrack: document.getElementById("previous-track"),
  playPause: document.getElementById("play-pause"),
  nextTrack: document.getElementById("next-track"),

  waPlaylist: document.getElementById("wa-playlist"),
  waTrackTitle: document.getElementById("wa-track-title"),
  waCurrentTime: document.getElementById("wa-current-time"),
  waStatusTime: document.getElementById("wa-status-time"),
  waTotalPlaylist: document.getElementById("wa-total-playlist"),
  waSeekbar: document.getElementById("wa-seekbar"),
  waSeekThumb: document.getElementById("wa-seek-thumb"),
  waVolumebar: document.getElementById("wa-volumebar"),
  waVolumeThumb: document.getElementById("wa-volume-thumb"),
  waBars: document.querySelector(".wa-bars"),

  waPrev: document.getElementById("wa-prev"),
  waPlay: document.getElementById("wa-play"),
  waPause: document.getElementById("wa-pause"),
  waStop: document.getElementById("wa-stop"),
  waNext: document.getElementById("wa-next"),
};

let filteredTracks = [...tracks];
let currentTrackIndex = 0;
let lastVolumeBeforeMute = 80;

function assertRequiredElements() {
  const missing = Object.entries(elements)
    .filter(([, element]) => !element)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Elementos obrigatórios não encontrados: ${missing.join(", ")}`);
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "00:00";
  }

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getTrackDisplayName(track) {
  return track.artist ? `${track.artist} - ${track.title}` : track.title;
}

function getCurrentTrack() {
  return tracks[currentTrackIndex] || tracks[0];
}

function getIndexByTrackId(id) {
  return tracks.findIndex((track) => track.id === Number(id));
}

function getFilteredIndexByCurrentTrack() {
  return filteredTracks.findIndex((track) => track.id === getCurrentTrack()?.id);
}

function showStatus(message = "") {
  elements.playerStatus.textContent = message;
}

function saveCurrentTrack() {
  const currentTrack = getCurrentTrack();

  if (currentTrack) {
    localStorage.setItem(STORAGE_KEYS.currentTrackId, String(currentTrack.id));
  }
}

function populateCategories() {
  const categories = [...new Set(tracks.map((track) => track.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    elements.categoryFilter.appendChild(option);
  });
}

function applyFilters() {
  const term = elements.searchInput.value.trim().toLowerCase();
  const category = elements.categoryFilter.value;

  filteredTracks = tracks.filter((track) => {
    const matchesCategory = category === "all" || track.category === category;
    const text = `${track.title} ${track.artist} ${track.category}`.toLowerCase();
    const matchesTerm = !term || text.includes(term);

    return matchesCategory && matchesTerm;
  });

  renderPlaylist();
}

function renderPlaylist() {
  elements.waPlaylist.innerHTML = "";

  if (!filteredTracks.length) {
    const empty = document.createElement("li");
    empty.className = "wa-playlist-empty";
    empty.textContent = "Nenhuma faixa encontrada.";
    elements.waPlaylist.appendChild(empty);

    elements.playlistCount.textContent = "0 faixas";
    elements.waTotalPlaylist.textContent = "0 FX";
    return;
  }

  const fragment = document.createDocumentFragment();
  const currentTrack = getCurrentTrack();

  filteredTracks.forEach((track, index) => {
    const li = document.createElement("li");

    if (track.id === currentTrack.id) {
      li.classList.add("active");
    }

    li.title = `${getTrackDisplayName(track)} | ${track.category}`;
    li.innerHTML = `
      <span>${index + 1}. ${getTrackDisplayName(track)}</span>
      <b>${track.duration || "--:--"}</b>
    `;

    li.addEventListener("click", () => {
      setCurrentTrackById(track.id, true);
    });

    fragment.appendChild(li);
  });

  elements.waPlaylist.appendChild(fragment);
  elements.playlistCount.textContent = `${filteredTracks.length} faixas`;
  elements.waTotalPlaylist.textContent = `${filteredTracks.length} FX`;
}

function loadTrack(index) {
  if (!tracks.length) {
    showStatus("Nenhuma música foi encontrada em data/audios.js.");
    return;
  }

  const safeIndex = Math.max(0, Math.min(index, tracks.length - 1));
  currentTrackIndex = safeIndex;

  const track = getCurrentTrack();

  elements.audio.src = track.src;
  elements.audio.volume = Number(elements.volume.value) / 100;
  elements.audio.load();

  elements.classicTitle.textContent = track.title;
  elements.classicArtist.textContent = track.artist || "Artista não informado";
  elements.classicCategory.textContent = track.category || "Sem categoria";

  elements.classicCover.style.backgroundImage = `
    url("${track.cover}"),
    url("${DEFAULT_COVER}")
  `;

  elements.waTrackTitle.textContent = `${track.id}. ${getTrackDisplayName(track)} (${track.duration || "--:--"})`;

  elements.classicSeek.value = 0;
  elements.classicCurrentTime.textContent = "00:00";
  elements.classicDuration.textContent = track.duration || "--:--";

  elements.waCurrentTime.textContent = "00:00";
  elements.waStatusTime.textContent = `00:00/${track.duration || "--:--"}`;
  elements.waSeekThumb.style.left = "0%";

  showStatus("");
  saveCurrentTrack();
  renderPlaylist();
  updatePlayIcon();
}

function setCurrentTrackById(id, shouldPlay = false) {
  const index = getIndexByTrackId(id);

  if (index === -1) {
    return;
  }

  pauseTrack();
  loadTrack(index);

  if (shouldPlay) {
    playTrack();
  }
}

function playTrack() {
  if (!elements.audio.src) {
    loadTrack(currentTrackIndex);
  }

  const playPromise = elements.audio.play();

  if (playPromise !== undefined) {
    playPromise.catch(() => {
      showStatus("O navegador bloqueou a reprodução ou o arquivo não foi encontrado.");
    });
  }
}

function pauseTrack() {
  elements.audio.pause();
}

function stopTrack() {
  elements.audio.pause();
  elements.audio.currentTime = 0;
  updateTimeDisplay();
}

function nextSong() {
  if (!filteredTracks.length) {
    return;
  }

  const filteredIndex = getFilteredIndexByCurrentTrack();
  const nextIndex = filteredIndex === -1 || filteredIndex + 1 >= filteredTracks.length ? 0 : filteredIndex + 1;

  setCurrentTrackById(filteredTracks[nextIndex].id, true);
}

function previousSong() {
  if (!filteredTracks.length) {
    return;
  }

  const filteredIndex = getFilteredIndexByCurrentTrack();
  const previousIndex = filteredIndex <= 0 ? filteredTracks.length - 1 : filteredIndex - 1;

  setCurrentTrackById(filteredTracks[previousIndex].id, true);
}

function updatePlayIcon() {
  const isPaused = elements.audio.paused;

  elements.classicPlayIcon.textContent = isPaused ? "play_arrow" : "pause";
  elements.waBars.classList.toggle("is-paused", isPaused);
}

function updateCurrentTrackDuration() {
  if (!Number.isFinite(elements.audio.duration) || elements.audio.duration <= 0) {
    return;
  }

  const track = getCurrentTrack();
  const realDuration = formatTime(elements.audio.duration);

  track.duration = realDuration;

  elements.classicDuration.textContent = realDuration;
  elements.waTrackTitle.textContent = `${track.id}. ${getTrackDisplayName(track)} (${realDuration})`;
  elements.waStatusTime.textContent = `${formatTime(elements.audio.currentTime)}/${realDuration}`;

  renderPlaylist();
}

function updateTimeDisplay() {
  const track = getCurrentTrack();

  const current = formatTime(elements.audio.currentTime);
  const total = Number.isFinite(elements.audio.duration) && elements.audio.duration > 0
    ? formatTime(elements.audio.duration)
    : track.duration || "--:--";

  elements.classicCurrentTime.textContent = current;
  elements.classicDuration.textContent = total;

  elements.waCurrentTime.textContent = current;
  elements.waStatusTime.textContent = `${current}/${total}`;

  if (Number.isFinite(elements.audio.duration) && elements.audio.duration > 0) {
    const percent = (elements.audio.currentTime / elements.audio.duration) * 100;

    elements.classicSeek.value = percent;
    elements.waSeekThumb.style.left = `calc(${percent}% - 5px)`;
  }
}

function setSeekByPercent(percent) {
  if (!Number.isFinite(elements.audio.duration) || elements.audio.duration <= 0) {
    return;
  }

  const safePercent = Math.max(0, Math.min(100, percent));

  elements.audio.currentTime = (safePercent / 100) * elements.audio.duration;
  updateTimeDisplay();
}

function setVolumeByPercent(percent) {
  const safePercent = Math.max(0, Math.min(100, Number(percent)));

  elements.volume.value = safePercent;
  elements.audio.volume = safePercent / 100;
  elements.audio.muted = safePercent === 0;

  elements.volumeIcon.textContent = elements.audio.muted ? "volume_mute" : "volume_up";
  elements.waVolumeThumb.style.left = `calc(${safePercent}% - 5px)`;

  if (safePercent > 0) {
    lastVolumeBeforeMute = safePercent;
  }

  localStorage.setItem(STORAGE_KEYS.volume, String(safePercent));
}

function toggleMute() {
  if (elements.audio.muted || Number(elements.volume.value) === 0) {
    setVolumeByPercent(lastVolumeBeforeMute || 80);
  } else {
    lastVolumeBeforeMute = Number(elements.volume.value) || 80;
    setVolumeByPercent(0);
  }
}

function handleBarClick(event, callback) {
  const rect = event.currentTarget.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const percent = (clickX / rect.width) * 100;

  callback(percent);
}

function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);

  if (savedTheme === "winamp") {
    document.body.classList.add("theme-winamp");
    elements.themeToggle.checked = true;
  }

  elements.themeToggle.addEventListener("change", () => {
    if (elements.themeToggle.checked) {
      document.body.classList.add("theme-winamp");
      localStorage.setItem(STORAGE_KEYS.theme, "winamp");
    } else {
      document.body.classList.remove("theme-winamp");
      localStorage.setItem(STORAGE_KEYS.theme, "classic");
    }
  });
}

function restoreState() {
  const savedVolume = Number(localStorage.getItem(STORAGE_KEYS.volume));
  const initialVolume = Number.isFinite(savedVolume) ? savedVolume : Number(elements.volume.value || 80);

  setVolumeByPercent(initialVolume);

  const savedTrackId = Number(localStorage.getItem(STORAGE_KEYS.currentTrackId));
  const savedIndex = getIndexByTrackId(savedTrackId);

  if (savedIndex !== -1) {
    currentTrackIndex = savedIndex;
  }
}

function bindEvents() {
  elements.playPause.addEventListener("click", () => {
    if (elements.audio.paused) {
      playTrack();
    } else {
      pauseTrack();
    }
  });

  elements.previousTrack.addEventListener("click", previousSong);
  elements.nextTrack.addEventListener("click", nextSong);

  elements.waPlay.addEventListener("click", playTrack);
  elements.waPause.addEventListener("click", pauseTrack);
  elements.waStop.addEventListener("click", stopTrack);
  elements.waPrev.addEventListener("click", previousSong);
  elements.waNext.addEventListener("click", nextSong);

  elements.volume.addEventListener("input", () => {
    setVolumeByPercent(Number(elements.volume.value));
  });

  elements.volumeButton.addEventListener("click", toggleMute);

  elements.waVolumebar.addEventListener("click", (event) => {
    handleBarClick(event, setVolumeByPercent);
  });

  elements.classicSeek.addEventListener("input", () => {
    setSeekByPercent(Number(elements.classicSeek.value));
  });

  elements.waSeekbar.addEventListener("click", (event) => {
    handleBarClick(event, setSeekByPercent);
  });

  elements.searchInput.addEventListener("input", applyFilters);
  elements.categoryFilter.addEventListener("change", applyFilters);

  elements.audio.addEventListener("loadedmetadata", () => {
    updateCurrentTrackDuration();
    updateTimeDisplay();
  });

  elements.audio.addEventListener("timeupdate", updateTimeDisplay);
  elements.audio.addEventListener("ended", nextSong);
  elements.audio.addEventListener("play", updatePlayIcon);
  elements.audio.addEventListener("pause", updatePlayIcon);

  elements.audio.addEventListener("error", () => {
    const track = getCurrentTrack();
    showStatus(`Não foi possível carregar: ${track?.file || track?.title || "faixa atual"}.`);
  });

  document.addEventListener("keydown", (event) => {
    const activeTag = document.activeElement?.tagName?.toLowerCase();

    if (activeTag === "input" || activeTag === "select" || activeTag === "textarea") {
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();

      if (elements.audio.paused) {
        playTrack();
      } else {
        pauseTrack();
      }
    }

    if (event.code === "ArrowRight") {
      nextSong();
    }

    if (event.code === "ArrowLeft") {
      previousSong();
    }
  });
}

function start() {
  assertRequiredElements();

  if (!tracks.length) {
    showStatus("A lista data/audios.js está vazia.");
    return;
  }

  populateCategories();
  initTheme();
  restoreState();
  bindEvents();
  loadTrack(currentTrackIndex);
  applyFilters();
}

start();