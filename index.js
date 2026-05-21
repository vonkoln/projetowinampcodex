import audios from "./data/audios.js";

const AUDIO_BASE_PATH = "./files/";
const COVER_BASE_PATH = "./files/";
const DEFAULT_COVER = "https://placehold.co/500x500/0c1123/ffffff?text=Player";

const STORAGE_KEYS = {
  theme: "player-theme",
  volume: "player-volume",
  currentTrackId: "player-current-track-id",
};

const DOT_MATRIX_MAP = {
  "0": [
    "01110",
    "10001",
    "10011",
    "10101",
    "11001",
    "10001",
    "01110",
  ],
  "1": [
    "00100",
    "01100",
    "00100",
    "00100",
    "00100",
    "00100",
    "01110",
  ],
  "2": [
    "01110",
    "10001",
    "00001",
    "00110",
    "01000",
    "10000",
    "11111",
  ],
  "3": [
    "11110",
    "00001",
    "00001",
    "01110",
    "00001",
    "00001",
    "11110",
  ],
  "4": [
    "00010",
    "00110",
    "01010",
    "10010",
    "11111",
    "00010",
    "00010",
  ],
  "5": [
    "11111",
    "10000",
    "10000",
    "11110",
    "00001",
    "00001",
    "11110",
  ],
  "6": [
    "01110",
    "10000",
    "10000",
    "11110",
    "10001",
    "10001",
    "01110",
  ],
  "7": [
    "11111",
    "00001",
    "00010",
    "00100",
    "01000",
    "01000",
    "01000",
  ],
  "8": [
    "01110",
    "10001",
    "10001",
    "01110",
    "10001",
    "10001",
    "01110",
  ],
  "9": [
    "01110",
    "10001",
    "10001",
    "01111",
    "00001",
    "00001",
    "01110",
  ],
  ":": [
    "00",
    "11",
    "11",
    "00",
    "11",
    "11",
    "00",
  ],
};

const SPECTRUM_COLUMN_COUNT = 26;
const SPECTRUM_BLOCK_COUNT = 10;

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
  waStatusTime: document.getElementById("wa-status-time"),
  waTotalPlaylist: document.getElementById("wa-total-playlist"),
  waSeekbar: document.getElementById("wa-seekbar"),
  waSeekThumb: document.getElementById("wa-seek-thumb"),
  waVolumebar: document.getElementById("wa-volumebar"),
  waVolumeThumb: document.getElementById("wa-volume-thumb"),
  waTimeMatrix: document.getElementById("wa-time-matrix"),
  waSpectrum: document.getElementById("wa-spectrum"),
  waPlayIndicator: document.getElementById("wa-play-indicator"),
  waBitrateBox: document.getElementById("wa-bitrate-box"),
  waKhzBox: document.getElementById("wa-khz-box"),

  waPrev: document.getElementById("wa-prev"),
  waPlay: document.getElementById("wa-play"),
  waPause: document.getElementById("wa-pause"),
  waStop: document.getElementById("wa-stop"),
  waNext: document.getElementById("wa-next"),
};

let filteredTracks = [...tracks];
let currentTrackIndex = 0;
let lastVolumeBeforeMute = 80;

let audioContext = null;
let analyserNode = null;
let mediaElementSource = null;
let frequencyData = null;
let visualizerFrameId = null;

let lastRenderedMatrixTime = "";
let spectrumColumns = [];
let smoothedLevels = new Array(SPECTRUM_COLUMN_COUNT).fill(0);
let peakLevels = new Array(SPECTRUM_COLUMN_COUNT).fill(0);
let peakHoldFrames = new Array(SPECTRUM_COLUMN_COUNT).fill(0);

function assertRequiredElements() {
  const missing = Object.entries(elements)
    .filter(([, element]) => !element)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Elementos obrigatórios não encontrados: ${missing.join(", ")}`);
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
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
  elements.waBitrateBox.textContent = "192 kbps";
  elements.waKhzBox.textContent = "44 kHz";

  elements.classicSeek.value = 0;
  elements.classicCurrentTime.textContent = "00:00";
  elements.classicDuration.textContent = track.duration || "--:--";

  renderMatrixTime("00:00");
  elements.waStatusTime.textContent = `00:00/${track.duration || "--:--"}`;
  elements.waSeekThumb.style.left = "0%";

  resetVisualizer();
  showStatus("");
  saveCurrentTrack();
  renderPlaylist();
  updatePlayStateVisuals();
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

function buildDotMatrixGlyph(character) {
  const pattern = DOT_MATRIX_MAP[character] || DOT_MATRIX_MAP["0"];
  const glyph = document.createElement("div");
  glyph.className = `wa-glyph ${character === ":" ? "is-colon" : "is-digit"}`;

  const rows = pattern.length;
  const cols = pattern[0].length;

  glyph.style.setProperty("--glyph-cols", cols);
  glyph.style.setProperty("--glyph-rows", rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const dot = document.createElement("span");
      dot.className = `wa-dot ${pattern[row][col] === "1" ? "on" : ""}`;
      glyph.appendChild(dot);
    }
  }

  return glyph;
}

function renderMatrixTime(timeString) {
  if (lastRenderedMatrixTime === timeString) {
    return;
  }

  elements.waTimeMatrix.innerHTML = "";

  [...timeString].forEach((character) => {
    elements.waTimeMatrix.appendChild(buildDotMatrixGlyph(character));
  });

  lastRenderedMatrixTime = timeString;
}

function buildSpectrum() {
  elements.waSpectrum.innerHTML = "";
  spectrumColumns = [];

  for (let i = 0; i < SPECTRUM_COLUMN_COUNT; i++) {
    const column = document.createElement("div");
    column.className = "wa-spectrum-column";

    const peak = document.createElement("span");
    peak.className = "wa-spectrum-peak";

    const blocks = [];

    for (let j = 0; j < SPECTRUM_BLOCK_COUNT; j++) {
      const block = document.createElement("span");
      block.className = "wa-spectrum-block";

      if (j <= 1) {
        block.dataset.tone = "blue";
      } else if (j <= 4) {
        block.dataset.tone = "white";
      } else if (j <= 7) {
        block.dataset.tone = "green";
      } else {
        block.dataset.tone = "yellow";
      }

      blocks.push(block);
      column.appendChild(block);
    }

    column.appendChild(peak);
    elements.waSpectrum.appendChild(column);

    spectrumColumns.push({
      element: column,
      peak,
      blocks,
    });
  }
}

async function initAudioAnalyzer() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  if (!audioContext) {
    audioContext = new AudioContextClass();

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 512;
    analyserNode.smoothingTimeConstant = 0.58;

    frequencyData = new Uint8Array(analyserNode.frequencyBinCount);

    mediaElementSource = audioContext.createMediaElementSource(elements.audio);
    mediaElementSource.connect(analyserNode);
    analyserNode.connect(audioContext.destination);
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
}

function getAverageBinValue(startBin, endBin) {
  if (!frequencyData || !frequencyData.length) {
    return 0;
  }

  const start = Math.max(0, Math.min(startBin, frequencyData.length - 1));
  const end = Math.max(start + 1, Math.min(endBin, frequencyData.length));

  let sum = 0;
  let count = 0;

  for (let i = start; i < end; i++) {
    sum += frequencyData[i];
    count++;
  }

  return count ? sum / count : 0;
}

function getLogFrequencyRange(columnIndex, totalColumns, maxBin) {
  const minFreqIndex = 1;
  const maxFreqIndex = maxBin - 1;

  const startNorm = columnIndex / totalColumns;
  const endNorm = (columnIndex + 1) / totalColumns;

  const start = Math.floor(minFreqIndex + (Math.pow(startNorm, 2.15) * (maxFreqIndex - minFreqIndex)));
  const end = Math.floor(minFreqIndex + (Math.pow(endNorm, 2.15) * (maxFreqIndex - minFreqIndex)));

  return {
    start: Math.max(1, start),
    end: Math.max(start + 1, end),
  };
}

function updateSpectrumDisplay(levels, peaks) {
  spectrumColumns.forEach((column, columnIndex) => {
    const activeBlocks = Math.max(0, Math.min(SPECTRUM_BLOCK_COUNT, Math.round(levels[columnIndex])));
    const peakBlock = Math.max(0, Math.min(SPECTRUM_BLOCK_COUNT - 1, Math.round(peaks[columnIndex])));

    column.blocks.forEach((block, blockIndex) => {
      const isActive = blockIndex < activeBlocks;
      block.classList.toggle("active", isActive);
    });

    column.peak.style.opacity = peaks[columnIndex] > 0.2 ? "1" : "0";
    column.peak.style.bottom = `${Math.max(0, peakBlock * 2)}px`;
  });
}

function animateVisualizer() {
  if (!analyserNode || !frequencyData) {
    return;
  }

  analyserNode.getByteFrequencyData(frequencyData);

  const binCount = frequencyData.length;

  const bassEnergy = getAverageBinValue(1, 12);
  const midEnergy = getAverageBinValue(12, 60);
  const highEnergy = getAverageBinValue(60, 130);

  const musicalPulse =
    ((bassEnergy * 1.3) + (midEnergy * 0.95) + (highEnergy * 0.6)) / (1.3 + 0.95 + 0.6);

  for (let i = 0; i < SPECTRUM_COLUMN_COUNT; i++) {
    const range = getLogFrequencyRange(i, SPECTRUM_COLUMN_COUNT, binCount);
    const columnEnergy = getAverageBinValue(range.start, range.end);

    let weighted = columnEnergy;

    if (i < 6) {
      weighted = (columnEnergy * 0.75) + (bassEnergy * 0.55);
    } else if (i < 18) {
      weighted = (columnEnergy * 0.82) + (midEnergy * 0.28);
    } else {
      weighted = (columnEnergy * 0.88) + (highEnergy * 0.24);
    }

    const normalized = Math.max(0, Math.min(1, Math.pow(weighted / 255, 0.82)));
    const pulseBoost = (musicalPulse / 255) * 0.85;
    const targetLevel = Math.max(0, Math.min(SPECTRUM_BLOCK_COUNT, (normalized * (SPECTRUM_BLOCK_COUNT - 0.15)) + (pulseBoost * 0.55)));

    const currentLevel = smoothedLevels[i];

    if (targetLevel > currentLevel) {
      smoothedLevels[i] = currentLevel + ((targetLevel - currentLevel) * 0.55);
    } else {
      smoothedLevels[i] = currentLevel - Math.min(0.18, currentLevel - targetLevel);
    }

    smoothedLevels[i] = Math.max(0, Math.min(SPECTRUM_BLOCK_COUNT, smoothedLevels[i]));

    if (smoothedLevels[i] >= peakLevels[i]) {
      peakLevels[i] = smoothedLevels[i];
      peakHoldFrames[i] = 7;
    } else if (peakHoldFrames[i] > 0) {
      peakHoldFrames[i]--;
    } else {
      peakLevels[i] = Math.max(smoothedLevels[i], peakLevels[i] - 0.14);
    }
  }

  updateSpectrumDisplay(smoothedLevels, peakLevels);
  visualizerFrameId = requestAnimationFrame(animateVisualizer);
}

function startVisualizer() {
  if (visualizerFrameId) {
    return;
  }

  visualizerFrameId = requestAnimationFrame(animateVisualizer);
}

function stopVisualizer() {
  if (visualizerFrameId) {
    cancelAnimationFrame(visualizerFrameId);
    visualizerFrameId = null;
  }
}

function resetVisualizer() {
  smoothedLevels = new Array(SPECTRUM_COLUMN_COUNT).fill(0);
  peakLevels = new Array(SPECTRUM_COLUMN_COUNT).fill(0);
  peakHoldFrames = new Array(SPECTRUM_COLUMN_COUNT).fill(0);
  updateSpectrumDisplay(smoothedLevels, peakLevels);
}

async function playTrack() {
  if (!elements.audio.src) {
    loadTrack(currentTrackIndex);
  }

  try {
    await initAudioAnalyzer();

    const playPromise = elements.audio.play();

    if (playPromise !== undefined) {
      await playPromise;
    }

    startVisualizer();
    showStatus("");
  } catch {
    showStatus("O navegador bloqueou a reprodução ou o arquivo não foi encontrado.");
  }
}

function pauseTrack() {
  elements.audio.pause();
  stopVisualizer();
}

function stopTrack() {
  elements.audio.pause();
  elements.audio.currentTime = 0;
  stopVisualizer();
  resetVisualizer();
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

function updatePlayStateVisuals() {
  const isPaused = elements.audio.paused;

  elements.classicPlayIcon.textContent = isPaused ? "play_arrow" : "pause";
  elements.waPlayIndicator.classList.toggle("is-playing", !isPaused);
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

  renderMatrixTime(current);
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

  elements.audio.addEventListener("ended", () => {
    stopVisualizer();
    nextSong();
  });

  elements.audio.addEventListener("play", () => {
    updatePlayStateVisuals();
    startVisualizer();
  });

  elements.audio.addEventListener("pause", () => {
    updatePlayStateVisuals();
    stopVisualizer();
  });

  elements.audio.addEventListener("error", () => {
    const track = getCurrentTrack();
    showStatus(`Não foi possível carregar: ${track?.file || track?.title || "faixa atual"}.`);
    stopVisualizer();
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

  buildDotMatrixGlyph("0");
  buildSpectrum();
  populateCategories();
  initTheme();
  restoreState();
  bindEvents();
  loadTrack(currentTrackIndex);
  applyFilters();
  resetVisualizer();
  renderMatrixTime("00:00");
}

start();