const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzRDsf6AfX6eq3pWQqzkV3mUd20Hj3BwjTMD58Tlx_cXAtnQI-PTKjQm5r4cOGi49CI/exec";

const GITHUB_OWNER = "vonkoln";
const MAX_REPO_PAGES = 5;
const PLAYLIST_REQUIRED_DATA_FILE = "data.js";
const PLAYLIST_REQUIRED_FILES_FOLDER = "files";

const STORAGE_KEYS = {
  token: "hippodromo-admin-token",
  username: "hippodromo-admin-username",
};

const elements = {
  loginCard: document.getElementById("login-card"),
  loginForm: document.getElementById("login-form"),
  adminUser: document.getElementById("admin-user"),
  adminPassword: document.getElementById("admin-password"),
  loginStatus: document.getElementById("login-status"),

  adminPanel: document.getElementById("admin-panel"),
  playlistManager: document.getElementById("playlist-manager"),

  playlistForm: document.getElementById("playlist-form"),
  repoSearch: document.getElementById("repo-search"),
  repoSelector: document.getElementById("repo-selector"),
  repoPreview: document.getElementById("repo-preview"),
  refreshRepos: document.getElementById("refresh-repos"),

  playlistName: document.getElementById("playlist-name"),
  playlistBranch: document.getElementById("playlist-branch"),
  inspectGithub: document.getElementById("inspect-github"),
  logoutButton: document.getElementById("logout-button"),
  adminStatus: document.getElementById("admin-status"),

  playlistList: document.getElementById("playlist-list"),
};

let githubRepos = [];
let filteredGithubRepos = [];
let inspectedRepository = null;
let isLoadingRepos = false;

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

function setRepoPreview(message, type = "info") {
  if (!elements.repoPreview) {
    return;
  }

  elements.repoPreview.innerHTML = message;
  elements.repoPreview.dataset.type = type;
}

function setRepoSelectorMessage(message) {
  if (!elements.repoSelector) {
    return;
  }

  elements.repoSelector.innerHTML = "";

  const option = document.createElement("option");
  option.value = "";
  option.textContent = message;

  elements.repoSelector.appendChild(option);
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

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
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
    loadVonkolnRepositories();
    loadPlaylists();
  }
}

function logout() {
  clearSession();

  elements.loginCard?.classList.remove("hidden");
  elements.adminPanel?.classList.add("hidden");
  elements.playlistManager?.classList.add("hidden");

  setStatus(elements.loginStatus, "Sessão encerrada.", "success");
}

async function loadVonkolnRepositories() {
  if (isLoadingRepos) {
    return;
  }

  isLoadingRepos = true;
  githubRepos = [];
  filteredGithubRepos = [];
  inspectedRepository = null;

  setRepoSelectorMessage("Carregando repositórios...");
  setStatus(elements.adminStatus, `Buscando repositórios públicos de ${GITHUB_OWNER}...`);
  setRepoPreview("Carregando repositórios e filtrando apenas playlists válidas...", "info");

  try {
    const allRepos = await fetchAllVonkolnRepos();

    if (!allRepos.length) {
      setRepoSelectorMessage("Nenhum repositório encontrado");
      setStatus(elements.adminStatus, "Nenhum repositório público encontrado.", "warning");
      setRepoPreview("Nenhum repositório público foi encontrado.", "warning");
      return;
    }

    setRepoSelectorMessage(`Verificando 0 de ${allRepos.length}...`);

    const validPlaylistRepos = [];

    for (let index = 0; index < allRepos.length; index++) {
      const repo = allRepos[index];
      const owner = repo.owner?.login || GITHUB_OWNER;
      const branch = repo.default_branch || "main";

      setStatus(
        elements.adminStatus,
        `Verificando playlists ${index + 1} de ${allRepos.length}...`
      );

      setRepoSelectorMessage(`Verificando ${index + 1} de ${allRepos.length}...`);

      try {
        const isPlaylist = await repoLooksLikePlaylist(owner, repo.name, branch);

        if (isPlaylist) {
          validPlaylistRepos.push(repo);

          githubRepos = validPlaylistRepos
            .map(normalizeGithubRepo)
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

          filteredGithubRepos = [...githubRepos];

          renderRepoSelector();

          setRepoPreview(
            `${githubRepos.length} playlist(s) válida(s) encontrada(s) até agora.`,
            "success"
          );
        }
      } catch (error) {
        console.warn(`Falha ao verificar ${owner}/${repo.name}:`, error);
      }
    }

    githubRepos = validPlaylistRepos
      .map(normalizeGithubRepo)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    filteredGithubRepos = [...githubRepos];

    renderRepoSelector();

    if (githubRepos.length) {
      setStatus(
        elements.adminStatus,
        `${githubRepos.length} playlist(s) válida(s) encontrada(s).`,
        "success"
      );

      setRepoPreview(
        `Lista pronta. Foram exibidos apenas repositórios com <strong>${PLAYLIST_REQUIRED_DATA_FILE}</strong> e pasta <strong>${PLAYLIST_REQUIRED_FILES_FOLDER}/</strong>.`,
        "success"
      );
    } else {
      setRepoSelectorMessage("Nenhuma playlist válida encontrada");
      setStatus(elements.adminStatus, "Nenhuma playlist válida encontrada.", "warning");
      setRepoPreview(
        `Nenhum repositório válido encontrado. Para aparecer aqui, o repositório precisa conter <strong>${PLAYLIST_REQUIRED_DATA_FILE}</strong> e pasta <strong>${PLAYLIST_REQUIRED_FILES_FOLDER}/</strong>.`,
        "warning"
      );
    }
  } catch (error) {
    console.error(error);

    setRepoSelectorMessage("Erro ao carregar playlists");
    setStatus(elements.adminStatus, error.message, "error");

    setRepoPreview(
      `Erro ao carregar playlists do GitHub.<br>${error.message}`,
      "error"
    );
  } finally {
    isLoadingRepos = false;
  }
}

function normalizeGithubRepo(repo) {
  return {
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner?.login || GITHUB_OWNER,
    defaultBranch: repo.default_branch || "main",
    description: repo.description || "",
    htmlUrl: repo.html_url,
    updatedAt: repo.updated_at || "",
  };
}

async function fetchAllVonkolnRepos() {
  const repos = [];
  let page = 1;

  while (page <= MAX_REPO_PAGES) {
    const url = `https://api.github.com/users/${GITHUB_OWNER}/repos?per_page=100&page=${page}&sort=updated`;

    const response = await fetchWithTimeout(url, {
      headers: {
        "Accept": "application/vnd.github+json",
      },
    });

    if (response.status === 403) {
      throw new Error("Limite temporário da API do GitHub atingido. Aguarde alguns minutos e tente novamente.");
    }

    if (!response.ok) {
      throw new Error(`Não foi possível buscar repositórios do GitHub. HTTP ${response.status}.`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || !data.length) {
      break;
    }

    repos.push(...data);

    if (data.length < 100) {
      break;
    }

    page += 1;
  }

  return repos.filter((repo) => !repo.archived);
}

async function repoLooksLikePlaylist(owner, repo, branch) {
  const tree = await fetchGithubTree(owner, repo, branch);

  if (!tree.length) {
    return false;
  }

  const hasDataJs = tree.some((item) => {
    return item.type === "blob" &&
      item.path === PLAYLIST_REQUIRED_DATA_FILE;
  });

  const hasFilesFolder = tree.some((item) => {
    return item.type === "tree" &&
      (
        item.path === PLAYLIST_REQUIRED_FILES_FOLDER ||
        item.path.startsWith(`${PLAYLIST_REQUIRED_FILES_FOLDER}/`)
      );
  });

  return hasDataJs && hasFilesFolder;
}

async function fetchGithubTree(owner, repo, branch) {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;

  const response = await fetchWithTimeout(url, {
    headers: {
      "Accept": "application/vnd.github+json",
    },
  });

  if (response.status === 403) {
    throw new Error("Limite temporário da API do GitHub atingido.");
  }

  if (!response.ok) {
    return [];
  }

  const data = await response.json();

  return Array.isArray(data.tree) ? data.tree : [];
}

function renderRepoSelector() {
  if (!elements.repoSelector) {
    return;
  }

  elements.repoSelector.innerHTML = "";

  if (!filteredGithubRepos.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nenhuma playlist encontrada";
    elements.repoSelector.appendChild(option);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecione uma playlist";
  elements.repoSelector.appendChild(placeholder);

  filteredGithubRepos.forEach((repo) => {
    const option = document.createElement("option");

    option.value = repo.name;
    option.textContent = repo.description
      ? `${repo.name} — ${repo.description}`
      : repo.name;

    elements.repoSelector.appendChild(option);
  });
}

function filterRepoList() {
  const query = elements.repoSearch?.value.trim().toLowerCase() || "";

  inspectedRepository = null;

  if (!query) {
    filteredGithubRepos = [...githubRepos];
  } else {
    filteredGithubRepos = githubRepos.filter((repo) => {
      return repo.name.toLowerCase().includes(query) ||
        repo.fullName.toLowerCase().includes(query) ||
        repo.description.toLowerCase().includes(query);
    });
  }

  renderRepoSelector();

  setRepoPreview(
    `${filteredGithubRepos.length} playlist(s) encontrada(s) para a busca.`,
    filteredGithubRepos.length ? "info" : "warning"
  );
}

function getSelectedRepo() {
  const selectedName = elements.repoSelector?.value || "";

  if (!selectedName) {
    return null;
  }

  return githubRepos.find((repo) => repo.name === selectedName) || null;
}

function createPlaylistId(owner, repo) {
  return `${owner}-${repo}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchGithubText(owner, repo, branch, path) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;

  const response = await fetchWithTimeout(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    return "";
  }

  return response.text();
}

async function checkGithubPath(owner, repo, branch, path) {
  const tree = await fetchGithubTree(owner, repo, branch);

  return tree.some((item) => {
    return item.path === path || item.path.startsWith(`${path}/`);
  });
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
  const selectedRepo = getSelectedRepo();

  if (!selectedRepo) {
    setStatus(elements.adminStatus, "Selecione uma playlist da lista.", "warning");
    setRepoPreview("Nenhuma playlist selecionada.", "warning");
    return null;
  }

  const owner = selectedRepo.owner;
  const repo = selectedRepo.name;
  const branch = elements.playlistBranch?.value.trim() || selectedRepo.defaultBranch || "main";

  setStatus(elements.adminStatus, `Verificando ${owner}/${repo}...`);
  setRepoPreview(`Verificando estrutura de <strong>${owner}/${repo}</strong>...`, "info");

  const [readme, dataJs, hasFilesFolder] = await Promise.all([
    fetchGithubText(owner, repo, branch, "README.md"),
    fetchGithubText(owner, repo, branch, PLAYLIST_REQUIRED_DATA_FILE),
    checkGithubPath(owner, repo, branch, PLAYLIST_REQUIRED_FILES_FOLDER),
  ]);

  const fallbackName = `Playlist ${repo.replace(/[-_]+/g, " ")}`;
  const name = extractPlaylistNameFromReadme(readme, fallbackName);

  if (elements.playlistName) {
    elements.playlistName.value = name;
  }

  if (elements.playlistBranch) {
    elements.playlistBranch.value = branch;
  }

  if (!dataJs) {
    inspectedRepository = null;
    setStatus(elements.adminStatus, "Este repositório não possui data.js.", "error");
    setRepoPreview(
      `O repositório <strong>${owner}/${repo}</strong> não parece ser uma playlist válida porque não encontrei <strong>${PLAYLIST_REQUIRED_DATA_FILE}</strong>.`,
      "error"
    );
    return null;
  }

  if (!hasFilesFolder) {
    inspectedRepository = null;
    setStatus(elements.adminStatus, "Este repositório não possui pasta files.", "error");
    setRepoPreview(
      `O repositório <strong>${owner}/${repo}</strong> possui data.js, mas não encontrei a pasta <strong>${PLAYLIST_REQUIRED_FILES_FOLDER}</strong>.`,
      "error"
    );
    return null;
  }

  inspectedRepository = {
    owner,
    repo,
    branch,
    name,
    repoUrl: selectedRepo.htmlUrl || `https://github.com/${owner}/${repo}`,
  };

  setStatus(elements.adminStatus, `Playlist válida encontrada: ${name}`, "success");
  setRepoPreview(
    `Playlist válida: <strong>${name}</strong><br>Repositório: ${owner}/${repo}<br>Branch: ${branch}<br>Arquivos esperados: ${PLAYLIST_REQUIRED_DATA_FILE} + ${PLAYLIST_REQUIRED_FILES_FOLDER}/`,
    "success"
  );

  return inspectedRepository;
}

async function savePlaylistFromForm(event) {
  event.preventDefault();

  try {
    const inspected = inspectedRepository || await inspectGithubRepository();

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
      dataFile: PLAYLIST_REQUIRED_DATA_FILE,
      filesPath: PLAYLIST_REQUIRED_FILES_FOLDER,
      repoUrl: inspected.repoUrl,
      hidden: "false",
    });

    inspectedRepository = null;

    if (elements.repoSelector) elements.repoSelector.value = "";
    if (elements.repoSearch) elements.repoSearch.value = "";
    if (elements.playlistName) elements.playlistName.value = "";
    if (elements.playlistBranch) elements.playlistBranch.value = "";

    filteredGithubRepos = [...githubRepos];
    renderRepoSelector();

    setRepoPreview("Playlist salva. Selecione outra playlist para cadastrar.", "success");
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
    elements.playlistList.textContent = "Nenhuma playlist cadastrada.";
    return;
  }

  const fragment = document.createDocumentFragment();

  playlists.forEach((playlist) => {
    const row = document.createElement("div");
    row.className = "playlist-item";

    const fixed = !!playlist.fixed;

    row.innerHTML = `
      <div>
        <strong>${playlist.name}</strong>
        <small>${playlist.repoUrl || `${playlist.owner}/${playlist.repo}` || "local"}</small>
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

  on(elements.refreshRepos, "click", loadVonkolnRepositories);
  on(elements.repoSearch, "input", filterRepoList);

  on(elements.repoSelector, "change", () => {
    inspectedRepository = null;

    const selectedRepo = getSelectedRepo();

    if (!selectedRepo) {
      setRepoPreview("Selecione uma playlist para verificar se ela contém data.js e pasta files.", "info");
      return;
    }

    if (elements.playlistBranch) {
      elements.playlistBranch.value = selectedRepo.defaultBranch || "main";
    }

    if (elements.playlistName) {
      elements.playlistName.value = `Playlist ${selectedRepo.name.replace(/[-_]+/g, " ")}`;
    }

    setRepoPreview(
      `Selecionado: <strong>${selectedRepo.fullName}</strong><br>Clique em <strong>Verificar playlist</strong> antes de salvar.`,
      "info"
    );
  });

  on(elements.logoutButton, "click", logout);
}

async function start() {
  bindActions();
  await renderAuthState();
}

start();