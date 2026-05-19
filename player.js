import audios from "./data/audios.js";
import { path, secondsToMinutes } from "./utils.js";
import elements from "./playerElements.js";

const STORAGE_KEYS = {
  volume: "anos90-volume",
  currentTrack: "anos90-current-track",
};

export default {
  audioData: audios,
  filteredAudios: [...audios],
  currentAudio: {},
  currentPlaying: 0,
  isPlaying: false,

  start() {
    elements.get.call(this);
    this.restoreState();
    this.populateCategories();
    this.renderPlaylist();
    elements.bindStaticActions.call(this);
    this.update();
  },

  restoreState() {
    const savedVolume = Number(localStorage.getItem(STORAGE_KEYS.volume));
    const savedTrack = Number(localStorage.getItem(STORAGE_KEYS.currentTrack));

    this.volumeControl.value = Number.isFinite(savedVolume) ? savedVolume : 100;

    if (Number.isInteger(savedTrack) && savedTrack >= 0 && savedTrack < this.audioData.length) {
      this.currentPlaying = savedTrack;
    }
  },

  play() {
    this.isPlaying = true;

    this.audio.play().catch(() => {
      this.isPlaying = false;
      this.playPause.textContent = "play_arrow";
      this.showStatus("Clique novamente para iniciar o áudio.");
    });

    this.playPause.textContent = "pause";
  },

  pause() {
    this.isPlaying = false;
    this.audio.pause();
    this.playPause.textContent = "play_arrow";
  },

  togglePlayPause() {
    this.isPlaying ? this.pause() : this.play();
  },

  next() {
    const index = this.filteredAudios.findIndex((audio) => audio.id === this.currentAudio.id);
    const nextIndex = index + 1 >= this.filteredAudios.length ? 0 : index + 1;

    this.setCurrentAudioById(this.filteredAudios[nextIndex].id, true);
  },

  back() {
    const index = this.filteredAudios.findIndex((audio) => audio.id === this.currentAudio.id);
    const previousIndex = index - 1 < 0 ? this.filteredAudios.length - 1 : index - 1;

    this.setCurrentAudioById(this.filteredAudios[previousIndex].id, true);
  },

  setCurrentAudioById(id, shouldPlay = false) {
    const realIndex = this.audioData.findIndex((audio) => audio.id === id);

    if (realIndex === -1) {
      return;
    }

    this.pause();
    this.currentPlaying = realIndex;
    this.update();

    if (shouldPlay) {
      this.play();
    }
  },

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    this.volume.textContent = this.audio.muted ? "volume_mute" : "volume_up";
  },

  setVolume(value) {
    const volume = Math.min(Math.max(Number(value), 0), 100);

    this.audio.volume = volume / 100;
    this.audio.muted = volume === 0;
    this.volume.textContent = this.audio.muted ? "volume_mute" : "volume_up";
    localStorage.setItem(STORAGE_KEYS.volume, String(volume));
  },

  setSeekbar(value) {
    this.audio.currentTime = Number(value);
  },

  timeUpdate() {
    this.currentDuration.textContent = secondsToMinutes(this.audio.currentTime);
    this.seekbar.value = Math.floor(this.audio.currentTime || 0);
  },

  update() {
    this.currentAudio = this.audioData[this.currentPlaying];

    if (!this.currentAudio) {
      this.showStatus("Nenhuma faixa encontrada.");
      return;
    }

    this.cover.style.background = `url("${path(this.currentAudio.cover)}") no-repeat center center / cover`;
    this.title.textContent = this.currentAudio.title;
    this.artist.textContent = this.currentAudio.artist;
    this.nowPlayingCategory.textContent = this.currentAudio.category;

    elements.createAudioElement.call(this, path(this.currentAudio.file));
    elements.bindAudioActions.call(this);

    this.setVolume(this.volumeControl.value);
    this.highlightCurrentTrack();

    localStorage.setItem(STORAGE_KEYS.currentTrack, String(this.currentPlaying));
  },

  populateCategories() {
    const categories = [...new Set(this.audioData.map((audio) => audio.category))];

    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      this.categoryFilter.appendChild(option);
    });
  },

  applyFilters() {
    const term = this.searchInput.value.trim().toLowerCase();
    const category = this.categoryFilter.value;

    this.filteredAudios = this.audioData.filter((audio) => {
      const matchesCategory = category === "all" || audio.category === category;
      const matchesTerm = `${audio.title} ${audio.artist}`.toLowerCase().includes(term);

      return matchesCategory && matchesTerm;
    });

    this.renderPlaylist();
  },

  renderPlaylist() {
    this.playlist.innerHTML = "";

    if (!this.filteredAudios.length) {
      this.playlist.innerHTML = `<li class="playlist-empty">Nenhuma faixa encontrada.</li>`;
      this.playlistCount.textContent = "0 faixas";
      return;
    }

    const fragment = document.createDocumentFragment();

    this.filteredAudios.forEach((audio) => {
      const item = document.createElement("li");
      item.className = "playlist-item";
      item.dataset.id = audio.id;

      item.innerHTML = `
        <button type="button" aria-label="Tocar ${audio.title} de ${audio.artist}">
          <span class="playlist-number">${String(audio.id).padStart(2, "0")}</span>
          <span>
            <strong>${audio.title}</strong>
            <small>${audio.artist}</small>
          </span>
        </button>
      `;

      item.querySelector("button").onclick = () => this.setCurrentAudioById(audio.id, true);
      fragment.appendChild(item);
    });

    this.playlist.appendChild(fragment);
    this.playlistCount.textContent = `${this.filteredAudios.length} faixas`;
    this.highlightCurrentTrack();
  },

  highlightCurrentTrack() {
    this.playlist.querySelectorAll(".playlist-item").forEach((item) => {
      item.classList.toggle("is-active", Number(item.dataset.id) === this.currentAudio.id);
    });
  },

  showStatus(message) {
    this.artist.textContent = message;
  },
};
