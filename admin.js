const ADMIN_CONFIG = {
  username: "admin",

  /*
    Usuário: admin
    Senha: admin123

    Atenção: este login é apenas controle local em site estático.
  */
  passwordHash: "240be518fabd2724d4bf8706148ed1ec7c4b80b84e6a2766a4bf7f5bd8c4cf6a0",
};

const STORAGE_KEYS = {
  session: "hippodromo-admin-session",
  customPlaylists: "hippodromo-custom-playlists",
  hiddenPlaylists: "hippodromo-hidden-playlists",
};

const FIXED_PLAYLISTS = [
  {
    id: "hippodromo",
    name: "Playlist Hippodromo",
    repoUrl: "local",
    fixed: true,
  },
  {
    id: "redhot",
    name: "Playlist Red Hot Chili Peppers",
    repoUrl: "https://github.com/vonkoln/redhot",
    fixed: true,
  },
  {
    id: "raimundos",
    name: "Playlist Raimundos",
    repoUrl: "https://github.com/vonkoln/raimundos",
    fixed: true,
  },
];

const elements = {
  loginCard: document.getElementById("login-card"),
  loginForm: document.getElementById("login-form"),
  adminUser: document.getElementById("admin-user"),
  adminPassword: document.getElementById("admin-password"),
  loginStatus: document.getElementById("login-status"),

  adminPanel: document.getElementById("admin-panel"),
  playlistManager: document.getElementById("playlist-manager"),
  dangerZone: document.getElementById("danger-zone"),

  playlistForm: document.getElementById("playlist-form"),
  githubUrl: document.getElementById("github-url"),
  playlistName: document.getElementById("playlist-name"),
  playlistBranch: document.getElementById("playlist-branch"),
  inspectGithub: document.getElementById("inspect-github"),
  logoutButton: document.getElementById("logout-button"),
  adminStatus: document.getElementById("admin-status"),

  playlistList: document.getElementById("playlist-list"),

  clearCustomPlaylists: document.getElementById("clear-custom-playlists"),
  clearHiddenPlaylists: document.getElementById("clear-hidden-playlists"),
  dangerStatus: document.getElementById("danger-status"),
};

window.gerarHashSenha = async function gerarHashSenha(senha) {
  const hash = await sha256(senha);
  console.log(hash);
  return hash;
};

function setStatus(element, message, type = "info") {
  element.textContent = message;
  element.dataset.type = type;
}

async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return [...new Uint8Array(hashBuffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isLoggedIn() {
  return localStorage.getItem(STORAGE_KEYS.session) === "active";
}

function setLoggedIn(value) {
  if (value) {
    localStorage.setItem(STORAGE_KEYS.session, "active");
  } else {
    localStorage.removeItem(STORAGE_KEYS.session);
  }

  renderAuthState();
}

function renderAuthState() {
  const logged = isLoggedIn();

  elements.loginCard.classList.toggle("hidden", logged);
  elements.adminPanel.classList.toggle("hidden", !logged);
  elements.playlistManager.classList.toggle("hidden", !logged);
  elements.dangerZone.classList.toggle("hidden", !logged);

  if (logged) {
    renderPlaylistManager();
  }
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

function saveCustomPlaylists(playlists) {
  localStorage.setItem(STORAGE_KEYS.customPlaylists, JSON.stringify(playlists));
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

function saveHiddenPlaylistIds(hiddenSet) {
  localStorage.setItem(STORAGE_KEYS.hiddenPlaylists, JSON.stringify([...hiddenSet]));
}

function parseGithubRepoUrl(url) {
  const parsed = new URL(url);
  const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");

  if (parsed.hostname !== "github.com" || parts.length < 2) {
    throw new Error("Use um link válido do GitHub, exemplo: https://github.com/vonkoln/raimundos");
  }

  return {
    owner: parts[0],
    repo: parts[1].replace(/\.git$/i, ""),
  };
}

function createPlaylistId(owner, repo) {
  return `${owner}-${repo}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchGithubRepoInfo(owner, repo) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error("Não foi possível acessar o repositório pelo GitHub API.");
  }

  return response.json();
}

async function fetchGithubText(owner, repo, branch, path) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    return "";
  }

  return response.text();
}

function extractPlaylistNameFromReadme(readme, fallbackName) {
  if (!readme) {
    return fallbackName;
  }

  const heading = readme
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("#"));

  if (!heading) {
    return fallbackName;
  }

  return heading
    .replace(/^#+\s*/, "")
    .replace(/^playlist\s*[:\-]?\s*/i, "Playlist ")
    .trim() || fallbackName;
}

async function inspectGithubRepository() {
  const url = elements.githubUrl.value.trim();

  if (!url) {
    setStatus(elements.adminStatus, "Informe o link do GitHub.", "warning");
    return null;
  }

  setStatus(elements.adminStatus, "Buscando dados do repositório...");

  const { owner, repo } = parseGithubRepoUrl(url);
  const repoInfo = await fetchGithubRepoInfo(owner, repo);
  const branch = elements.playlistBranch.value.trim() || repoInfo.default_branch || "main";

  const readme = await fetchGithubText(owner, repo, branch, "README.md");
  const fallbackName = `Playlist ${repo.replace(/[-_]+/g, " ")}`;
  const name = extractPlaylistNameFromReadme(readme, fallbackName);

  elements.playlistName.value = name;
  elements.playlistBranch.value = branch;

  setStatus(elements.adminStatus, `Repositório encontrado: ${name}`, "success");

  return {
    owner,
    repo,
    branch,
    name,
    repoUrl: `https://github.com/${owner}/${repo}`,
  };
}

async function savePlaylistFromForm(event) {
  event.preventDefault();

  try {
    const inspected = await inspectGithubRepository();

    if (!inspected) {
      return;
    }

    const customPlaylists = getCustomPlaylists();
    const playlistId = createPlaylistId(inspected.owner, inspected.repo);

    const playlist = {
      id: playlistId,
      name: elements.playlistName.value.trim() || inspected.name,
      subtitle: `Músicas carregadas do repositório GitHub ${inspected.owner}/${inspected.repo}`,
      type: "github",
      owner: inspected.owner,
      repo: inspected.repo,
      branch: inspected.branch,
      dataFile: "data.js",
      filesPath: "files",
      repoUrl: inspected.repoUrl,
      createdAt: new Date().toISOString(),
    };

    const existingIndex = customPlaylists.findIndex((item) => item.id === playlist.id);

    if (existingIndex === -1) {
      customPlaylists.push(playlist);
    } else {
      customPlaylists[existingIndex] = playlist;
    }

    saveCustomPlaylists(customPlaylists);

    elements.githubUrl.value = "";
    elements.playlistName.value = "";
    elements.playlistBranch.value = "";

    setStatus(elements.adminStatus, `Playlist salva: ${playlist.name}`, "success");
    renderPlaylistManager();
  } catch (error) {
    console.error(error);
    setStatus(elements.adminStatus, error.message, "error");
  }
}

function renderPlaylistManager() {
  const hiddenIds = getHiddenPlaylistIds();
  const customPlaylists = getCustomPlaylists();

  const allPlaylists = [
    ...FIXED_PLAYLISTS,
    ...customPlaylists,
  ];

  if (!allPlaylists.length) {
    elements.playlistList.innerHTML = "Nenhuma playlist cadastrada.";
    return;
  }

  const fragment = document.createDocumentFragment();

  allPlaylists.forEach((playlist) => {
    const row = document.createElement("div");
    row.className = "playlist-item";

    const isHidden = hiddenIds.has(playlist.id);

    row.innerHTML = `
      <div>
        <strong>${playlist.name}</strong>
        <small>${playlist.repoUrl || `${playlist.owner}/${playlist.repo}` || "local"}</small>
        <span class="badge ${isHidden ? "hidden-badge" : ""}">
          ${playlist.fixed ? "fixa" : "adicionada"} · ${isHidden ? "escondida" : "visível"}
        </span>
      </div>

      <div class="playlist-actions">
        <button type="button" class="secondary" data-action="${isHidden ? "show" : "hide"}" data-id="${playlist.id}">
          ${isHidden ? "Mostrar" : "Esconder"}
        </button>

        ${
          playlist.fixed
            ? ""
            : `<button type="button" class="danger" data-action="delete" data-id="${playlist.id}">
                Excluir
              </button>`
        }
      </div>
    `;

    fragment.appendChild(row);
  });

  elements.playlistList.innerHTML = "";
  elements.playlistList.appendChild(fragment);

  elements.playlistList.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      const id = button.dataset.id;

      if (action === "hide") {
        hidePlaylist(id);
      }

      if (action === "show") {
        showPlaylist(id);
      }

      if (action === "delete") {
        deletePlaylist(id);
      }
    });
  });
}

function hidePlaylist(id) {
  const hiddenIds = getHiddenPlaylistIds();

  hiddenIds.add(id);
  saveHiddenPlaylistIds(hiddenIds);
  renderPlaylistManager();
}

function showPlaylist(id) {
  const hiddenIds = getHiddenPlaylistIds();

  hiddenIds.delete(id);
  saveHiddenPlaylistIds(hiddenIds);
  renderPlaylistManager();
}

function deletePlaylist(id) {
  const confirmed = window.confirm("Deseja excluir esta playlist adicionada?");

  if (!confirmed) {
    return;
  }

  const customPlaylists = getCustomPlaylists()
    .filter((playlist) => playlist.id !== id);

  const hiddenIds = getHiddenPlaylistIds();
  hiddenIds.delete(id);

  saveCustomPlaylists(customPlaylists);
  saveHiddenPlaylistIds(hiddenIds);

  renderPlaylistManager();
}

function clearCustomPlaylists() {
  const confirmed = window.confirm("Deseja excluir todas as playlists adicionadas?");

  if (!confirmed) {
    return;
  }

  localStorage.removeItem(STORAGE_KEYS.customPlaylists);
  setStatus(elements.dangerStatus, "Playlists adicionadas excluídas.", "success");
  renderPlaylistManager();
}

function clearHiddenPlaylists() {
  localStorage.removeItem(STORAGE_KEYS.hiddenPlaylists);
  setStatus(elements.dangerStatus, "Todas as playlists escondidas voltaram a aparecer.", "success");
  renderPlaylistManager();
}

async function handleLogin(event) {
  event.preventDefault();

  const user = elements.adminUser.value.trim();
  const password = elements.adminPassword.value;
  const passwordHash = await sha256(password);

  if (user === ADMIN_CONFIG.username && passwordHash === ADMIN_CONFIG.passwordHash) {
    setLoggedIn(true);
    elements.adminPassword.value = "";
    setStatus(elements.loginStatus, "");
    return;
  }

  setStatus(elements.loginStatus, "Usuário ou senha inválidos.", "error");
}

function bindActions() {
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.playlistForm.addEventListener("submit", savePlaylistFromForm);

  elements.inspectGithub.addEventListener("click", async () => {
    try {
      await inspectGithubRepository();
    } catch (error) {
      console.error(error);
      setStatus(elements.adminStatus, error.message, "error");
    }
  });

  elements.logoutButton.addEventListener("click", () => {
    setLoggedIn(false);
  });

  elements.clearCustomPlaylists.addEventListener("click", clearCustomPlaylists);
  elements.clearHiddenPlaylists.addEventListener("click", clearHiddenPlaylists);
}

function start() {
  bindActions();
  renderAuthState();
}

start();