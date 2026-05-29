/*
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzRDsf6AfX6eq3pWQqzkV3mUd20Hj3BwjTMD58Tlx_cXAtnQI-PTKjQm5r4cOGi49CI/exec";
*/
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzRDsf6AfX6eq3pWQqzkV3mUd20Hj3BwjTMD58Tlx_cXAtnQI-PTKjQm5r4cOGi49CI/exec";


const STORAGE_KEYS = {
  token: "hippodromo-admin-token",
  username: "hippodromo-admin-username",
};

const FIXED_PLAYLIST_IDS = new Set([
  "hippodromo",
  "redhot",
  "raimundos",
]);

const elements = {
  loginCard: document.getElementById("login-card"),
  loginForm: document.getElementById("login-form"),
  adminUser: document.getElementById("admin-user"),
  adminPassword: document.getElementById("admin-password"),
  loginStatus: document.getElementById("login-status"),

  adminPanel: document.getElementById("admin-panel"),
  playlistManager: document.getElementById("playlist-manager"),

  playlistForm: document.getElementById("playlist-form"),
  githubUrl: document.getElementById("github-url"),
  playlistName: document.getElementById("playlist-name"),
  playlistBranch: document.getElementById("playlist-branch"),
  inspectGithub: document.getElementById("inspect-github"),
  logoutButton: document.getElementById("logout-button"),
  adminStatus: document.getElementById("admin-status"),

  playlistList: document.getElementById("playlist-list"),
};

function on(element, eventName, handler) {
  if (!element) {
    console.warn(`Elemento não encontrado para evento ${eventName}.`);
    return;
  }

  element.addEventListener(eventName, handler);
}

function setStatus(element, message, type = "info") {
  if (!element) {
    console.warn(message);
    return;
  }

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

function getToken() {
  return localStorage.getItem(STORAGE_KEYS.token) || "";
}

function setSession(token, username) {
  localStorage.setItem(STORAGE_KEYS.token, token);
  localStorage.setItem(STORAGE_KEYS.username, username);
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.username);
}

function createJsonpRequest(params, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("COLE_AQUI")) {
      reject(new Error("URL do Google Apps Script não configurada no admin.js."));
      return;
    }

    const callbackName = `__adminCallback_${Date.now()}_${Math.round(Math.random() * 100000)}`;
    const url = new URL(GOOGLE_SCRIPT_URL);

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value ?? "");
    });

    url.searchParams.set("callback", callbackName);
    url.searchParams.set("_", Date.now());

    const script = document.createElement("script");
    let finished = false;

    const cleanup = () => {
      finished = true;
      delete window[callbackName];

      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const timer = window.setTimeout(() => {
      if (finished) return;

      cleanup();
      reject(new Error("Tempo esgotado ao acessar o Apps Script."));
    }, timeoutMs);

    window[callbackName] = (payload) => {
      window.clearTimeout(timer);
      cleanup();

      if (!payload || payload.ok === false) {
        reject(new Error(payload?.error || "Resposta inválida do servidor."));
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

async function handleLogin(event) {
  event.preventDefault();

  const username = elements.adminUser?.value.trim() || "";
  const password = elements.adminPassword?.value || "";

  if (!username || !password) {
    setStatus(elements.loginStatus, "Informe usuário e senha.", "warning");
    return;
  }

  setStatus(elements.loginStatus, "Validando login...");

  try {
    const passwordHash = await sha256(password);

    const payload = await createJsonpRequest({
      action: "adminLogin",
      username,
      passwordHash,
    });

    setSession(payload.token, payload.username);

    if (elements.adminPassword) {
      elements.adminPassword.value = "";
    }

    setStatus(elements.loginStatus, "Login realizado.", "success");

    await renderAuthState();
  } catch (error) {
    console.error(error);
    setStatus(elements.loginStatus, error.message, "error");
  }
}

async function checkSession() {
  const token = getToken();

  if (!token) {
    return false;
  }

  try {
    const payload = await createJsonpRequest({
      action: "adminCheck",
      token,
    });

    return !!payload.authenticated;
  } catch {
    return false;
  }
}

async function renderAuthState() {
  const logged = await checkSession();

  elements.loginCard?.classList.toggle("hidden", logged);
  elements.adminPanel?.classList.toggle("hidden", !logged);
  elements.playlistManager?.classList.toggle("hidden", !logged);

  if (logged) {
    await loadPlaylists();
  }
}

function logout() {
  clearSession();

  elements.loginCard?.classList.remove("hidden");
  elements.adminPanel?.classList.add("hidden");
  elements.playlistManager?.classList.add("hidden");

  setStatus(elements.loginStatus, "Sessão encerrada.", "success");
}

function parseGithubRepoUrl(url) {
  const parsed = new URL(url);
  const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");

  if (parsed.hostname !== "github.com" || parts.length < 2) {
    throw new Error("Use um link válido, exemplo: https://github.com/vonkoln/raimundos");
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

  const cleanHeading = heading
    .replace(/^#+\s*/, "")
    .trim();

  if (!cleanHeading || /^playlist\s*d\.?$/i.test(cleanHeading)) {
    return fallbackName;
  }

  if (/^playlist/i.test(cleanHeading)) {
    return cleanHeading;
  }

  return `Playlist ${cleanHeading}`;
}

async function inspectGithubRepository() {
  const url = elements.githubUrl?.value.trim() || "";

  if (!url) {
    setStatus(elements.adminStatus, "Informe o link do GitHub.", "warning");
    return null;
  }

  setStatus(elements.adminStatus, "Buscando dados do repositório...");

  const { owner, repo } = parseGithubRepoUrl(url);
  const repoInfo = await fetchGithubRepoInfo(owner, repo);
  const branch = elements.playlistBranch?.value.trim() || repoInfo.default_branch || "main";

  const readme = await fetchGithubText(owner, repo, branch, "README.md");
  const fallbackName = `Playlist ${repo.replace(/[-_]+/g, " ")}`;
  const name = extractPlaylistNameFromReadme(readme, fallbackName);

  if (elements.playlistName) {
    elements.playlistName.value = name;
  }

  if (elements.playlistBranch) {
    elements.playlistBranch.value = branch;
  }

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

    const id = createPlaylistId(inspected.owner, inspected.repo);
    const name = elements.playlistName?.value.trim() || inspected.name;

    setStatus(elements.adminStatus, "Salvando playlist no servidor...");

    await createJsonpRequest({
      action: "adminSavePlaylist",
      token: getToken(),
      id,
      name,
      subtitle: `Músicas carregadas do repositório GitHub ${inspected.owner}/${inspected.repo}`,
      owner: inspected.owner,
      repo: inspected.repo,
      branch: inspected.branch,
      dataFile: "data.js",
      filesPath: "files",
      repoUrl: inspected.repoUrl,
      hidden: "false",
    });

    if (elements.githubUrl) elements.githubUrl.value = "";
    if (elements.playlistName) elements.playlistName.value = "";
    if (elements.playlistBranch) elements.playlistBranch.value = "";

    setStatus(elements.adminStatus, `Playlist salva: ${name}`, "success");

    await loadPlaylists();
  } catch (error) {
    console.error(error);
    setStatus(elements.adminStatus, error.message, "error");
  }
}

async function loadPlaylists() {
  if (elements.playlistList) {
    elements.playlistList.textContent = "Carregando playlists...";
  }

  try {
    const payload = await createJsonpRequest({
      action: "adminListPlaylists",
      token: getToken(),
    });

    renderPlaylistManager(payload.playlists || []);
  } catch (error) {
    console.error(error);

    if (elements.playlistList) {
      elements.playlistList.textContent = "Erro ao carregar playlists.";
    }
  }
}

function renderPlaylistManager(playlists) {
  if (!elements.playlistList) {
    return;
  }

  if (!playlists.length) {
    elements.playlistList.textContent = "Nenhuma playlist dinâmica cadastrada.";
    return;
  }

  const fragment = document.createDocumentFragment();

  playlists.forEach((playlist) => {
    const row = document.createElement("div");
    row.className = "playlist-item";

    const fixed = FIXED_PLAYLIST_IDS.has(playlist.id);

    row.innerHTML = `
      <div>
        <strong>${playlist.name}</strong>
        <small>${playlist.repoUrl || `${playlist.owner}/${playlist.repo}`}</small>
        <span class="badge ${playlist.hidden ? "hidden-badge" : ""}">
          ${fixed ? "fixa" : "dinâmica"} · ${playlist.hidden ? "escondida" : "visível"}
        </span>
      </div>

      <div class="playlist-actions">
        <button type="button" class="secondary" data-action="toggle" data-hidden="${playlist.hidden ? "false" : "true"}" data-id="${playlist.id}">
          ${playlist.hidden ? "Mostrar" : "Esconder"}
        </button>

        ${
          fixed
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
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      const id = button.dataset.id;

      if (action === "toggle") {
        await togglePlaylist(id, button.dataset.hidden);
      }

      if (action === "delete") {
        await deletePlaylist(id);
      }
    });
  });
}

async function togglePlaylist(id, hidden) {
  try {
    await createJsonpRequest({
      action: "adminTogglePlaylist",
      token: getToken(),
      id,
      hidden,
    });

    await loadPlaylists();
  } catch (error) {
    alert(error.message);
  }
}

async function deletePlaylist(id) {
  const confirmed = window.confirm("Deseja excluir esta playlist dinâmica?");

  if (!confirmed) {
    return;
  }

  try {
    await createJsonpRequest({
      action: "adminDeletePlaylist",
      token: getToken(),
      id,
    });

    await loadPlaylists();
  } catch (error) {
    alert(error.message);
  }
}

function bindActions() {
  on(elements.loginForm, "submit", handleLogin);
  on(elements.playlistForm, "submit", savePlaylistFromForm);

  on(elements.inspectGithub, "click", async () => {
    try {
      await inspectGithubRepository();
    } catch (error) {
      console.error(error);
      setStatus(elements.adminStatus, error.message, "error");
    }
  });

  on(elements.logoutButton, "click", logout);
}

async function start() {
  bindActions();
  await renderAuthState();
}

start();