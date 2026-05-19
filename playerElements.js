import { secondsToMinutes } from "./utils.js";

const requiredSelectors = {
  cover: ".card-image",
  title: "#track-title",
  artist: "#track-artist",
  playPause: "#play-pause",
  playButton: "#play-button",
  nextTrack: "#next-track",
  previousTrack: "#previous-track",
  volume: "#volume-icon",
  volumeButton: "#volume-button",
  volumeControl: "#volume-control",
  seekbar: "#seekbar",
  currentDuration: "#current-duration",
  totalDuration: "#total-duration",
  searchInput: "#search-input",
  categoryFilter: "#category-filter",
  playlist: "#playlist",
  playlistCount: "#playlist-count",
  nowPlayingCategory: "#now-playing-category",
};

export default {
  get() {
    Object.entries(requiredSelectors).forEach(([key, selector]) => {
      this[key] = document.querySelector(selector);

      if (!this[key]) {
        throw new Error(`Elemento obrigatório não encontrado: ${selector}`);
      }
    });
  },

createAudioElement(audio) {
  if (this.audio) {
    this.audio.onerror = null;
    this.audio.onended = null;
    this.audio.onloadedmetadata = null;
    this.audio.ontimeupdate = null;

    this.audio.pause();
    this.audio.removeAttribute("src");
  }

  this.audio = new Audio(audio);
  this.audio.preload = "metadata";
  this.audio.volume = Number(this.volumeControl.value || 100) / 100;
},

  bindStaticActions() {
    this.playButton.onclick = () => this.togglePlayPause();
    this.playPause.onclick = () => this.togglePlayPause();

    this.volumeButton.onclick = () => this.toggleMute();
    this.volume.onclick = () => this.toggleMute();

    this.volumeControl.oninput = () => {
      this.setVolume(this.volumeControl.value);
    };

    this.seekbar.oninput = () => {
      this.setSeekbar(this.seekbar.value);
    };

    this.nextTrack.onclick = () => this.next();
    this.previousTrack.onclick = () => this.back();

    this.searchInput.oninput = () => this.applyFilters();
    this.categoryFilter.onchange = () => this.applyFilters();

    document.addEventListener("keydown", (event) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();

      if (activeTag === "input" || activeTag === "select") {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        this.togglePlayPause();
      }

      if (event.code === "ArrowRight") {
        this.next();
      }

      if (event.code === "ArrowLeft") {
        this.back();
      }
    });
  },

  bindAudioActions() {
    this.audio.onended = () => this.next();

    this.audio.onloadedmetadata = () => {
      this.seekbar.max = Math.floor(this.audio.duration || 0);
      this.totalDuration.textContent = secondsToMinutes(this.audio.duration || 0);
    };

    this.audio.ontimeupdate = () => this.timeUpdate();

    this.audio.onerror = () => {
      this.showStatus("Não foi possível carregar esta faixa.");
    };
  },
};
