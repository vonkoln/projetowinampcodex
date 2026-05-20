import audios from "./audios.js";

/*
  Como seu audios.js usa:
  file: "Out.mp3"
  cover: "out.jpg"

  então deixei os caminhos vazios.

  Caso seus arquivos estejam dentro de pastas, altere assim:

  const AUDIO_BASE_PATH = "musicas/";
  const COVER_BASE_PATH = "imagens/";
*/

const AUDIO_BASE_PATH = "";
const COVER_BASE_PATH = "";

const DEFAULT_COVER = "https://placehold.co/500x500/0c1123/ffffff?text=Player";

const tracks = audios.map((audioItem) => {
  return {
    id: audioItem.id,
    title: audioItem.title || "Sem título",
    artist: audioItem.artist || "",
    category: audioItem.category || "",
    duration: audioItem.duration || "--:--",
    src: `${AUDIO_BASE_PATH}${audioItem.file}`,
    cover: `${COVER_BASE_PATH}${audioItem.cover}`
  };
});

const audio = document.getElementById("audio");

const themeToggle = document.getElementById("theme-toggle");

const classicTitle = document.getElementById("classic-title");
const classicCover = document.getElementById("classic-cover");
const classicPlayIcon = document.getElementById("classic-play-icon");
const classicSeek = document.getElementById("classic-seek");
const classicCurrentTime = document.getElementById("classic-current-time");
const classicDuration = document.getElementById("classic-duration");

const volume = document.getElementById("volume");
const previousTrack = document.getElementById("previous-track");
const playPause = document.getElementById("play-pause");
const nextTrack = document.getElementById("next-track");

const waPlaylist = document.getElementById("wa-playlist");
const waTrackTitle = document.getElementById("wa-track-title");
const waCurrentTime = document.getElementById("wa-current-time");
const waStatusTime = document.getElementById("wa-status-time");
const waTotalPlaylist = document.getElementById("wa-total-playlist");
const waSeekbar = document.getElementById("wa-seekbar");
const waSeekThumb = document.getElementById("wa-seek-thumb");
const waVolumebar = document.getElementById("wa-volumebar");
const waVolumeThumb = document.getElementById("wa-volume-thumb");

const waPrev = document.getElementById("wa-prev");
const waPlay = document.getElementById("wa-play");
const waPause = document.getElementById("wa-pause");
const waStop = document.getElementById("wa-stop");
const waNext = document.getElementById("wa-next");

let currentTrack = 0;

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) {
    return "00:00";
  }

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getTrackDisplayName(track) {
  if (track.artist && track.artist.trim() !== "") {
    return `${track.artist} - ${track.title}`;
  }

  return track.title;
}

function getCurrentTrack() {
  return tracks[currentTrack];
}

function renderPlaylist() {
  waPlaylist.innerHTML = "";

  tracks.forEach((track, index) => {
    const li = document.createElement("li");

    if (index === currentTrack) {
      li.classList.add("active");
    }

    li.title = `${getTrackDisplayName(track)} | ${track.category}`;

    li.innerHTML = `
      <span>${index + 1}. ${getTrackDisplayName(track)}</span>
      <b>${track.duration || "--:--"}</b>
    `;

    li.addEventListener("click", () => {
      currentTrack = index;
      loadTrack(currentTrack);
      playTrack();
    });

    waPlaylist.appendChild(li);
  });

  waTotalPlaylist.textContent = `${tracks.length} FX`;
}

function loadTrack(index) {
  if (!tracks.length) {
    console.error("Nenhuma música encontrada no audios.js.");
    return;
  }

  const track = tracks[index];

  audio.src = track.src;
  audio.volume = Number(volume.value) / 100;
  audio.load();

  classicTitle.textContent = getTrackDisplayName(track);

  classicCover.style.backgroundImage = `
    url("${track.cover}"),
    url("${DEFAULT_COVER}")
  `;

  waTrackTitle.textContent = `${index + 1}. ${getTrackDisplayName(track)} (${track.duration || "--:--"})`;

  classicSeek.value = 0;
  classicCurrentTime.textContent = "00:00";
  classicDuration.textContent = track.duration || "--:--";

  waCurrentTime.textContent = "00:00";
  waStatusTime.textContent = `00:00/${track.duration || "--:--"}`;
  waSeekThumb.style.left = "0%";

  renderPlaylist();
  updatePlayIcon();
}

function playTrack() {
  const playPromise = audio.play();

  if (playPromise !== undefined) {
    playPromise.catch(() => {
      console.warn("O navegador bloqueou a reprodução ou o arquivo de áudio não foi encontrado.");
    });
  }

  updatePlayIcon();
}

function pauseTrack() {
  audio.pause();
  updatePlayIcon();
}

function stopTrack() {
  audio.pause();
  audio.currentTime = 0;
  updatePlayIcon();
  updateTimeDisplay();
}

function nextSong() {
  currentTrack++;

  if (currentTrack >= tracks.length) {
    currentTrack = 0;
  }

  loadTrack(currentTrack);
  playTrack();
}

function previousSong() {
  currentTrack--;

  if (currentTrack < 0) {
    currentTrack = tracks.length - 1;
  }

  loadTrack(currentTrack);
  playTrack();
}

function updatePlayIcon() {
  if (audio.paused) {
    classicPlayIcon.textContent = "play_arrow";
  } else {
    classicPlayIcon.textContent = "pause";
  }
}

function updateCurrentTrackDuration() {
  if (!audio.duration || isNaN(audio.duration) || !isFinite(audio.duration)) {
    return;
  }

  const track = getCurrentTrack();
  const realDuration = formatTime(audio.duration);

  track.duration = realDuration;

  classicDuration.textContent = realDuration;
  waTrackTitle.textContent = `${currentTrack + 1}. ${getTrackDisplayName(track)} (${realDuration})`;
  waStatusTime.textContent = `${formatTime(audio.currentTime)}/${realDuration}`;

  renderPlaylist();
}

function updateTimeDisplay() {
  const track = getCurrentTrack();

  const current = formatTime(audio.currentTime);
  const total = audio.duration ? formatTime(audio.duration) : track.duration || "--:--";

  classicCurrentTime.textContent = current;
  classicDuration.textContent = total;

  waCurrentTime.textContent = current;
  waStatusTime.textContent = `${current}/${total}`;

  if (audio.duration) {
    const percent = (audio.currentTime / audio.duration) * 100;

    classicSeek.value = percent;
    waSeekThumb.style.left = `calc(${percent}% - 5px)`;
  }
}

function setSeekByPercent(percent) {
  if (!audio.duration) {
    return;
  }

  audio.currentTime = (percent / 100) * audio.duration;
  updateTimeDisplay();
}

function setVolumeByPercent(percent) {
  const safePercent = Math.max(0, Math.min(100, percent));

  volume.value = safePercent;
  audio.volume = safePercent / 100;
  waVolumeThumb.style.left = `calc(${safePercent}% - 5px)`;
}

function handleBarClick(event, callback) {
  const rect = event.currentTarget.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const percent = (clickX / rect.width) * 100;

  callback(percent);
}

function initTheme() {
  const savedTheme = localStorage.getItem("player-theme");

  if (savedTheme === "winamp") {
    document.body.classList.add("theme-winamp");
    themeToggle.checked = true;
  }

  themeToggle.addEventListener("change", () => {
    if (themeToggle.checked) {
      document.body.classList.add("theme-winamp");
      localStorage.setItem("player-theme", "winamp");
    } else {
      document.body.classList.remove("theme-winamp");
      localStorage.setItem("player-theme", "classic");
    }
  });
}

playPause.addEventListener("click", () => {
  if (audio.paused) {
    playTrack();
  } else {
    pauseTrack();
  }
});

previousTrack.addEventListener("click", previousSong);
nextTrack.addEventListener("click", nextSong);

waPlay.addEventListener("click", playTrack);
waPause.addEventListener("click", pauseTrack);
waStop.addEventListener("click", stopTrack);
waPrev.addEventListener("click", previousSong);
waNext.addEventListener("click", nextSong);

volume.addEventListener("input", () => {
  setVolumeByPercent(Number(volume.value));
});

classicSeek.addEventListener("input", () => {
  setSeekByPercent(Number(classicSeek.value));
});

waSeekbar.addEventListener("click", (event) => {
  handleBarClick(event, setSeekByPercent);
});

waVolumebar.addEventListener("click", (event) => {
  handleBarClick(event, setVolumeByPercent);
});

audio.addEventListener("loadedmetadata", () => {
  updateCurrentTrackDuration();
  updateTimeDisplay();
});

audio.addEventListener("timeupdate", updateTimeDisplay);
audio.addEventListener("ended", nextSong);
audio.addEventListener("play", updatePlayIcon);
audio.addEventListener("pause", updatePlayIcon);

initTheme();
setVolumeByPercent(Number(volume.value));
loadTrack(currentTrack);