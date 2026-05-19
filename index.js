import player from "./player.js";

const initializePlayer = () => {
  try {
    player.start();
  } catch (error) {
    console.error("Erro ao iniciar o player:", error);
  }
};

window.addEventListener("DOMContentLoaded", initializePlayer);
