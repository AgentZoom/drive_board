const DEFAULT_PAGE_SIZE = 20;
const ALLOWED_PAGE_SIZES = new Set([10, 20, 50, 100]);
const ROUTE_PREFIX = "/app";
const PDFJS_MODULE_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.mjs";

let pdfJsPromise = null;

const state = {
  actor: null,
  workspaces: [],
  actors: [],
  shared: [],
  activeView: "files",
  currentWorkspace: null,
  currentPath: "",
  currentPermission: "read",
  currentItem: null,
  editorPath: null,
  currentItems: [],
  workspaceQuery: "",
  fileQuery: "",
  sortField: "modified_at",
  sortDirection: "desc",
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  managerMode: null,
  managerContext: null,
  previewCleanup: null,
  dragDepth: 0,
  isUploading: false,
};

const EDITABLE_PREVIEW_TYPES = new Set(["html", "markdown", "text"]);
const MEMBER_PERMISSIONS = ["read", "write", "owner"];
const NAME_COLLATOR = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
const NAV_BUTTON_IDS = ["fileListNavBtn", "sharedNavBtn", "shareManagerNavBtn", "spaceManagerNavBtn", "adminBtn", "profileNavBtn"];
const CODE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "css",
  "go",
  "h",
  "hpp",
  "java",
  "js",
  "json",
  "jsx",
  "lua",
  "php",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "toml",
  "ts",
  "tsx",
  "xml",
  "yaml",
  "yml",
]);
const ICONS = {
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />',
  "folder-up": '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" /><path d="m12 15 0-6" /><path d="m9.5 11.5 2.5-2.5 2.5 2.5" />',
  file: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />',
  text: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h6" />',
  code: '<path d="m8 9-5 3 5 3" /><path d="m16 9 5 3-5 3" /><path d="m14 4-4 16" />',
  html: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 12-2 2 2 2" /><path d="m15 12 2 2-2 2" />',
  markdown: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8.5 17v-5l2.5 2.5 2.5-2.5v5" /><path d="M16 12v5" />',
  pdf: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 17v-5h2a1.5 1.5 0 0 1 0 3H9" /><path d="M14 17v-5" /><path d="M14 14h2.5" />',
  image: '<rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m21 15-4.5-4.5L7 20" />',
  audio: '<path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 6a8.5 8.5 0 0 1 0 12" />',
  video: '<rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-3v10l-4-3z" /><path d="m9 10 4 2-4 2z" />',
  binary: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8.5 13h7" /><path d="M8.5 17h3" />',
  preview: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="3" />',
  edit: '<path d="M12 20h9" /><path d="m16.5 3.5 4 4L8 20l-4 1 1-4Z" />',
  download: '<path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />',
  share: '<circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4" /><path d="m15.4 6.5-6.8 4" />',
  modify: '<circle cx="12" cy="12" r="9" /><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />',
  delete: '<path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="3" />',
  "eye-off": '<path d="M3 3 21 21" /><path d="M10.7 5.1A11.8 11.8 0 0 1 12 5c6.4 0 10 7 10 7a18.7 18.7 0 0 1-4.1 4.9" /><path d="M6.6 6.6A18.2 18.2 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" />',
  play: '<path d="M8 6v12l10-6Z" fill="currentColor" stroke="none" />',
  pause: '<rect x="7" y="6" width="4" height="12" rx="1.2" fill="currentColor" stroke="none" /><rect x="13" y="6" width="4" height="12" rx="1.2" fill="currentColor" stroke="none" />',
};

const $ = (id) => document.getElementById(id);

function toast(message) {
  const node = $("toast");
  node.textContent = message;
  node.classList.remove("hidden");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => node.classList.add("hidden"), 2800);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderSvgIcon(name) {
  const paths = ICONS[name] || ICONS.file;
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${paths}
    </svg>
  `;
}

function syncTokenVisibilityToggle(button, input) {
  const visible = input.type === "text";
  button.innerHTML = renderSvgIcon(visible ? "eye-off" : "eye");
  button.setAttribute("aria-label", visible ? "隐藏 token" : "显示 token");
  button.title = visible ? "隐藏 token" : "显示 token";
}

async function api(path, options = {}) {
  const init = { ...options, headers: { ...(options.headers || {}) } };
  if (init.body && !(init.body instanceof FormData)) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(init.body);
  }
  const response = await fetch(path, init);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch {
      detail = await response.text();
    }
    throw new Error(detail);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function previewUrl(workspace, path) {
  const encodedPath = String(path || "")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `/preview/${encodeURIComponent(workspace)}/${encodedPath}`;
}

function downloadUrl(workspace, path) {
  const params = new URLSearchParams({ workspace, path });
  return `/api/files/download?${params.toString()}`;
}

function publicLinksApiUrl(workspace, path) {
  const params = new URLSearchParams({ workspace, path });
  return `/api/public-links?${params.toString()}`;
}

function workspacePublicLinksApiUrl(workspace) {
  const params = new URLSearchParams({ workspace });
  return `/api/public-links?${params.toString()}`;
}

function toAbsoluteUrl(path) {
  return new URL(path, window.location.origin).toString();
}

function decodeRoutePart(value) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizePageSize(value) {
  const size = Number(value) || DEFAULT_PAGE_SIZE;
  return ALLOWED_PAGE_SIZES.has(size) ? size : DEFAULT_PAGE_SIZE;
}

function resolveRouteWorkspace(name) {
  if (name && state.workspaces.some((workspace) => workspace.name === name)) {
    return name;
  }
  if (state.currentWorkspace && state.workspaces.some((workspace) => workspace.name === state.currentWorkspace)) {
    return state.currentWorkspace;
  }
  return state.workspaces[0]?.name || null;
}

function buildAppUrl() {
  const segments = [ROUTE_PREFIX];
  const params = new URLSearchParams();

  switch (state.activeView) {
    case "shared":
      segments.push("shared");
      if (state.currentWorkspace) {
        params.set("workspace", state.currentWorkspace);
      }
      break;
    case "share-manager":
      segments.push("share-manager");
      if (state.currentWorkspace) {
        segments.push(encodeURIComponent(state.currentWorkspace));
      }
      break;
    case "workspace-members":
      segments.push("workspace-members");
      if (state.currentWorkspace) {
        segments.push(encodeURIComponent(state.currentWorkspace));
      }
      break;
    case "actor-admin":
      segments.push("admin", "actors");
      if (state.currentWorkspace) {
        params.set("workspace", state.currentWorkspace);
      }
      break;
    case "profile":
      segments.push("profile");
      if (state.currentWorkspace) {
        params.set("workspace", state.currentWorkspace);
      }
      break;
    case "files":
    default: {
      segments.push("files");
      if (state.currentWorkspace) {
        segments.push(encodeURIComponent(state.currentWorkspace));
        const normalizedPath = normalizePathInput(state.currentPath);
        if (normalizedPath) {
          segments.push(...normalizedPath.split("/").map(encodeURIComponent));
        }
      }
      if (state.fileQuery) {
        params.set("q", state.fileQuery);
      }
      if (state.sortField !== "modified_at") {
        params.set("sort", state.sortField);
      }
      if (state.sortDirection !== defaultSortDirection(state.sortField)) {
        params.set("dir", state.sortDirection);
      }
      if (state.page !== 1) {
        params.set("page", String(state.page));
      }
      if (state.pageSize !== DEFAULT_PAGE_SIZE) {
        params.set("size", String(state.pageSize));
      }
      break;
    }
  }

  const query = params.toString();
  return `${segments.join("/")}${query ? `?${query}` : ""}`;
}

function syncRoute({ replace = false } = {}) {
  const nextUrl = buildAppUrl();
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl === currentUrl) {
    return;
  }
  window.history[replace ? "replaceState" : "pushState"](null, "", nextUrl);
}

function parseAppRoute() {
  const url = new URL(window.location.href);
  const segments = url.pathname.split("/").filter(Boolean).map(decodeRoutePart);
  if (segments[0] !== ROUTE_PREFIX.slice(1)) {
    return null;
  }

  const params = url.searchParams;
  const route = {
    view: "files",
    workspace: null,
    path: "",
    fileQuery: "",
    sortField: "modified_at",
    sortDirection: "desc",
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  };

  if (segments[1] === "shared") {
    route.view = "shared";
    route.workspace = params.get("workspace") || null;
    return route;
  }
  if (segments[1] === "share-manager") {
    route.view = "share-manager";
    route.workspace = segments[2] || params.get("workspace") || null;
    return route;
  }
  if (segments[1] === "workspace-members") {
    route.view = "workspace-members";
    route.workspace = segments[2] || params.get("workspace") || null;
    return route;
  }
  if (segments[1] === "admin" && segments[2] === "actors") {
    route.view = "actor-admin";
    route.workspace = params.get("workspace") || null;
    return route;
  }
  if (segments[1] === "profile") {
    route.view = "profile";
    route.workspace = params.get("workspace") || null;
    return route;
  }

  const fileSegments = segments[1] === "files" ? segments.slice(2) : [];
  route.workspace = fileSegments[0] || params.get("workspace") || null;
  route.path = fileSegments.length > 1 ? fileSegments.slice(1).join("/") : "";
  route.fileQuery = params.get("q") || "";

  const sortField = params.get("sort");
  if (["name", "size", "modified_at"].includes(sortField)) {
    route.sortField = sortField;
  }
  const sortDirection = params.get("dir");
  route.sortDirection = sortDirection === "asc" || sortDirection === "desc"
    ? sortDirection
    : defaultSortDirection(route.sortField);

  const page = Number.parseInt(params.get("page") || "1", 10);
  route.page = Number.isInteger(page) && page > 0 ? page : 1;
  route.pageSize = normalizePageSize(params.get("size"));
  return route;
}

function applyFileRoutePreferences(route = null) {
  state.fileQuery = route?.fileQuery || "";
  state.sortField = route?.sortField || "modified_at";
  state.sortDirection = route?.sortDirection || defaultSortDirection(state.sortField);
  state.page = route?.page || 1;
  state.pageSize = normalizePageSize(route?.pageSize);
  $("fileSearchInput").value = state.fileQuery;
  $("pageSizeSelect").value = String(state.pageSize);
}

async function restoreRouteFromLocation() {
  const route = parseAppRoute();
  const view = route?.view || "files";
  const workspace = resolveRouteWorkspace(route?.workspace);
  if (workspace) {
    state.currentWorkspace = workspace;
    renderWorkspaces();
  }

  if (view === "files") {
    state.currentPath = route?.path || "";
    applyFileRoutePreferences(route);
    try {
      await openFileListView({ skipRouteSync: true, preserveDetail: true });
    } catch {
      state.currentPath = "";
      await openFileListView({ skipRouteSync: true, preserveDetail: true });
    }
    syncRoute({ replace: true });
    return;
  }

  try {
    switch (view) {
      case "shared":
        await openSharedManager({ skipRouteSync: true });
        break;
      case "share-manager":
        await openShareManager({ skipRouteSync: true });
        if (state.activeView !== "share-manager") {
          await openFileListView({ skipRouteSync: true, preserveDetail: true });
        }
        break;
      case "workspace-members":
        await openWorkspaceMembersManager({ skipRouteSync: true });
        if (state.activeView !== "workspace-members") {
          await openFileListView({ skipRouteSync: true, preserveDetail: true });
        }
        break;
      case "actor-admin":
        await openActorManager({ skipRouteSync: true });
        break;
      case "profile":
        await openProfileManager({ skipRouteSync: true });
        break;
      default:
        await openFileListView({ skipRouteSync: true, preserveDetail: true });
        break;
    }
  } catch {
    await openFileListView({ skipRouteSync: true, preserveDetail: true });
  }
  syncRoute({ replace: true });
}

async function getPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import(PDFJS_MODULE_URL).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

async function readErrorDetail(response) {
  let detail = response.statusText;
  try {
    const payload = await response.json();
    detail = payload.detail || detail;
  } catch {
    const text = await response.text();
    detail = text || detail;
  }
  return detail;
}

function currentUploadDestinationPath() {
  return state.currentPath ? `${state.currentPath}/` : "";
}

async function requestFileUpload(file, { overwrite = false } = {}) {
  const form = new FormData();
  form.append("workspace", state.currentWorkspace);
  form.append("path", currentUploadDestinationPath());
  form.append("overwrite", overwrite ? "true" : "false");
  form.append("file", file);

  const response = await fetch("/api/files/upload", { method: "POST", body: form });
  if (!response.ok) {
    const error = new Error(await readErrorDetail(response));
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function confirmOverwriteUpload(file) {
  return new Promise((resolve) => {
    openModal(
      `
        <h2>覆盖已有文件？</h2>
        <p class="modal-copy">${escapeHtml(file.name)} 已存在于当前文件夹。确认后会用新文件覆盖旧文件。</p>
      `,
      async () => {
        resolve(true);
      },
      {
        confirmLabel: "覆盖上传",
        cancelLabel: "取消",
        onReady: ({ modal }) => {
          $("modalCancel").onclick = () => {
            modal.close();
            resolve(false);
          };
        },
      },
    );
  });
}

async function fetchBlobOrThrow(path) {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(await readErrorDetail(response));
  }
  return response.blob();
}

function saveBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.className = "hidden";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function downloadItem(item, workspace = state.currentWorkspace, href = downloadUrl(workspace, item.path)) {
  const blob = await fetchBlobOrThrow(href);
  saveBlob(blob, item.name || leafName(item.path) || "download");
  toast(`开始下载 ${item.name || leafName(item.path)}`);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "readonly");
  textarea.className = "hidden";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function normalizePathInput(value) {
  return String(value ?? "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "");
}

function leafName(path) {
  const normalized = normalizePathInput(path);
  if (!normalized) return "";
  return normalized.split("/").pop() || "";
}

function parentFolderPath(path) {
  const normalized = normalizePathInput(path);
  if (!normalized || !normalized.includes("/")) return "";
  return normalized.split("/").slice(0, -1).join("/");
}

function joinRelativePath(folder, name) {
  const normalizedFolder = normalizePathInput(folder);
  return normalizedFolder ? `${normalizedFolder}/${name}` : name;
}

function fileExtension(path) {
  const name = leafName(path);
  const index = name.lastIndexOf(".");
  return index > -1 ? name.slice(index + 1).toLowerCase() : "";
}

function typeKey(item) {
  if (!item || item.kind === "folder") {
    return "folder";
  }
  if (item.preview_type === "text" && CODE_EXTENSIONS.has(fileExtension(item.path || item.name))) {
    return "code";
  }
  return item.preview_type || "binary";
}

function typeLabel(item) {
  return {
    folder: "文件夹",
    html: "HTML",
    markdown: "Markdown",
    code: "代码",
    text: "文本",
    pdf: "PDF",
    image: "图片",
    audio: "音频",
    video: "视频",
    binary: "文件",
  }[typeKey(item)] || "文件";
}

function fileIconMarkup(item) {
  const kind = typeKey(item);
  return `<span class="file-icon" data-file-kind="${escapeHtml(kind)}">${renderSvgIcon(kind === "folder" ? "folder" : kind)}</span>`;
}

function suggestCopyPath(item) {
  const parent = parentFolderPath(item.path);
  const extensionIndex = item.kind === "file" ? item.name.lastIndexOf(".") : -1;
  const copyName = extensionIndex > 0
    ? `${item.name.slice(0, extensionIndex)}-copy${item.name.slice(extensionIndex)}`
    : `${item.name}-copy`;
  return joinRelativePath(parent, copyName);
}

function isDescendantOrSamePath(parent, child) {
  const normalizedParent = normalizePathInput(parent);
  const normalizedChild = normalizePathInput(child);
  return Boolean(normalizedParent)
    && (normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`));
}

function buildDestinationPath(folder, name) {
  const trimmedName = String(name ?? "").trim();
  if (!trimmedName) {
    throw new Error("名称不能为空");
  }
  if (/[\\/]/.test(trimmedName)) {
    throw new Error("名称不能包含路径分隔符");
  }
  return joinRelativePath(folder, trimmedName);
}

function folderBreadcrumbMarkup(path) {
  const crumbs = ['<button type="button" data-folder-path="">根目录</button>'];
  const parts = normalizePathInput(path) ? normalizePathInput(path).split("/") : [];
  let cursor = "";
  for (const part of parts) {
    cursor = cursor ? `${cursor}/${part}` : part;
    crumbs.push(`<span>/</span><button type="button" data-folder-path="${escapeHtml(cursor)}">${escapeHtml(part)}</button>`);
  }
  return crumbs.join("");
}

function formatSize(size) {
  if (size === null || size === undefined) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function currentWorkspaceInfo() {
  return state.workspaces.find((workspace) => workspace.name === state.currentWorkspace) || null;
}

function isFileListView() {
  return state.activeView === "files";
}

function activeNavButtonId() {
  switch (state.activeView) {
    case "shared":
      return "sharedNavBtn";
    case "share-manager":
      return "shareManagerNavBtn";
    case "workspace-members":
      return "spaceManagerNavBtn";
    case "actor-admin":
      return "adminBtn";
    case "profile":
      return "profileNavBtn";
    case "files":
    default:
      return "fileListNavBtn";
  }
}

function updateSidebarNav() {
  const activeId = activeNavButtonId();
  for (const id of NAV_BUTTON_IDS) {
    const button = $(id);
    if (button) {
      button.classList.toggle("is-active", id === activeId);
    }
  }
}

function applyViewMode() {
  const showFiles = isFileListView();
  $("topbar").classList.toggle("hidden", !showFiles);
  $("browserView").classList.toggle("hidden", !showFiles);
  $("managerView").classList.toggle("hidden", showFiles);
  updateSidebarNav();
  syncUploadDock();
}

function switchToFileView() {
  state.activeView = "files";
  state.managerMode = null;
  state.managerContext = null;
  $("managerBody").className = "manager-body empty-state";
  $("managerBody").textContent = "请选择一个管理动作。";
  applyViewMode();
}

function defaultSortDirection(field) {
  return field === "modified_at" ? "desc" : "asc";
}

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function compareItemValues(left, right, field) {
  if (field === "name") {
    return NAME_COLLATOR.compare(left.name || "", right.name || "");
  }
  if (field === "size") {
    return (Number(left.size) || 0) - (Number(right.size) || 0);
  }
  if (field === "modified_at") {
    return (new Date(left.modified_at || 0).getTime() || 0) - (new Date(right.modified_at || 0).getTime() || 0);
  }
  return 0;
}

function getVisibleFileState() {
  const query = normalizeSearch(state.fileQuery);
  let items = [...state.currentItems];
  if (query) {
    items = items.filter((item) => {
      const haystack = `${item.name || ""} ${item.path || ""} ${item.preview_type || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }
  items.sort((left, right) => {
    const value = compareItemValues(left, right, state.sortField);
    if (value !== 0) {
      return state.sortDirection === "asc" ? value : -value;
    }
    const fallback = NAME_COLLATOR.compare(left.name || "", right.name || "");
    return state.sortDirection === "asc" ? fallback : -fallback;
  });
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / state.pageSize) || 1);
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const start = (state.page - 1) * state.pageSize;
  return {
    items,
    pageItems: items.slice(start, start + state.pageSize),
    totalItems,
    totalPages,
  };
}

function renderSortHeaders() {
  document.querySelectorAll(".sort-header").forEach((button) => {
    const active = button.dataset.sortField === state.sortField;
    button.classList.toggle("is-active", active);
  });
  document.querySelectorAll("[data-sort-indicator]").forEach((indicator) => {
    const field = indicator.dataset.sortIndicator;
    if (field === state.sortField) {
      indicator.textContent = state.sortDirection === "asc" ? "↑" : "↓";
      indicator.dataset.state = state.sortDirection;
    } else {
      indicator.textContent = "↕";
      indicator.dataset.state = "idle";
    }
  });
}

function renderPagination(totalItems, totalPages) {
  $("pageStatus").textContent = `当前第 ${state.page} 页 / 总 ${totalPages} 页 · 共 ${totalItems} 项`;
  $("firstPageBtn").disabled = state.page <= 1;
  $("prevPageBtn").disabled = state.page <= 1;
  $("nextPageBtn").disabled = state.page >= totalPages;
  $("lastPageBtn").disabled = state.page >= totalPages;
}

function workspaceBadgeText(workspace) {
  if (!workspace) return "-";
  return workspace.kind === "private" ? "private" : workspace.permission;
}

function workspaceSummaryText(workspace) {
  if (!workspace) return "暂无可用空间";
  const kindText = workspace.kind === "private" ? "个人 workspace" : "共享 workspace";
  return `${kindText} · ${state.workspaces.length} 个可见空间`;
}

function sharePathLabel(path) {
  return path || "/";
}

function groupSharesByPath(shares) {
  const groups = new Map();
  for (const share of shares) {
    const key = share.path || "";
    if (!groups.has(key)) {
      groups.set(key, { path: key, shares: [] });
    }
    groups.get(key).shares.push(share);
  }
  return Array.from(groups.values()).sort((left, right) => sharePathLabel(left.path).localeCompare(sharePathLabel(right.path)));
}

function shareRecipientsSummary(shares) {
  const labels = shares.map((share) => share.display_name || share.actor_id);
  if (labels.length <= 2) return labels.join(" · ");
  return `${labels.slice(0, 2).join(" · ")} 等 ${labels.length} 人`;
}

function canEditItem(item) {
  return item?.kind === "file" && EDITABLE_PREVIEW_TYPES.has(item.preview_type);
}

function canManageWorkspaceMembers() {
  return currentWorkspaceInfo()?.kind === "share_group";
}

function canUploadHere() {
  return Boolean(state.currentWorkspace) && state.currentPermission === "write" && isFileListView();
}

function permissionOptions(options, selected) {
  return options
    .map((value) => `<option value="${value}"${value === selected ? " selected" : ""}>${value}</option>`)
    .join("");
}

function actorOptions({ excludeIds = [], selectedId = null, includeSelf = false } = {}) {
  const blocked = new Set(excludeIds.filter(Boolean));
  return state.actors
    .filter((actor) => {
      if (!includeSelf && actor.actor_id === state.actor?.actor_id && actor.actor_id !== selectedId) {
        return false;
      }
      return !blocked.has(actor.actor_id) || actor.actor_id === selectedId;
    })
    .map((actor) => `
      <option value="${escapeHtml(actor.actor_id)}"${actor.actor_id === selectedId ? " selected" : ""}>
        ${escapeHtml(actor.actor_id)} · ${escapeHtml(actor.display_name)}
      </option>
    `)
    .join("");
}

function actorMeta(actorId) {
  const actor = state.actors.find((item) => item.actor_id === actorId) || null;
  if (!actor) {
    return {
      title: actorId,
      subtitle: "",
    };
  }
  return {
    title: actor.actor_id,
    subtitle: [actor.display_name, actor.kind].filter(Boolean).join(" · "),
  };
}

function setWriteActionsEnabled(enabled) {
  for (const id of ["uploadBtn", "folderBtn", "textBtn"]) {
    $(id).disabled = !enabled;
  }
}

function toggleDropOverlay(visible) {
  const active = visible && canUploadHere() && !state.isUploading;
  $("dropOverlay").classList.toggle("is-visible", active);
  $("uploadDropzone").classList.toggle("is-dragover", active);
}

function syncUploadDock() {
  const dock = $("uploadDock");
  const dropzone = $("uploadDropzone");
  const title = $("uploadDockTitle");
  const hint = $("uploadDockHint");
  const visible = canUploadHere();
  dock.classList.toggle("hidden", !visible);
  if (!visible) {
    toggleDropOverlay(false);
    return;
  }
  dropzone.disabled = state.isUploading;
  dropzone.classList.toggle("is-uploading", state.isUploading);
  title.textContent = state.isUploading ? "正在上传" : "拖拽上传";
  hint.textContent = state.isUploading
    ? "文件上传中，请稍候"
    : `拖拽文件到这里，或点击选择文件，上传到 ${state.currentWorkspace}/${state.currentPath || ""}`;
}

function eventHasFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function openHtmlPreview(workspace, path) {
  const link = document.createElement("a");
  link.href = previewUrl(workspace, path);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "hidden";
  document.body.append(link);
  link.click();
  link.remove();
  return true;
}

function closeAllActionMenus() {
  document.querySelectorAll(".action-menu.is-open").forEach((menu) => {
    menu.classList.remove("is-open");
    menu.querySelector(".action-submenu")?.classList.remove("open-upward");
  });
}

function positionActionMenu(menu) {
  if (!menu) return;
  const submenu = menu.querySelector(".action-submenu");
  if (!submenu) return;

  submenu.classList.remove("open-upward");

  const menuRect = menu.getBoundingClientRect();
  const submenuRect = submenu.getBoundingClientRect();
  const tableWrapRect = menu.closest(".file-table-wrap")?.getBoundingClientRect();
  const paginationRect = $("filePagination")?.getBoundingClientRect();
  const lowerBoundary = paginationRect?.top ?? tableWrapRect?.bottom ?? window.innerHeight;
  const upperBoundary = tableWrapRect?.top ?? 0;
  const availableBelow = lowerBoundary - menuRect.bottom - 8;
  const availableAbove = menuRect.top - upperBoundary - 8;
  const shouldOpenUpward = submenuRect.height > availableBelow && availableAbove > availableBelow;

  submenu.classList.toggle("open-upward", shouldOpenUpward);
}

function toggleActionMenu(menu) {
  if (!menu) return;
  const shouldOpen = !menu.classList.contains("is-open");
  closeAllActionMenus();
  menu.classList.toggle("is-open", shouldOpen);
  if (shouldOpen) {
    positionActionMenu(menu);
  }
}

function runPreviewCleanup() {
  if (typeof state.previewCleanup === "function") {
    try {
      state.previewCleanup();
    } catch {
      // Cleanup should not block future previews.
    }
  }
  state.previewCleanup = null;
}

function resetPreviewDialog() {
  runPreviewCleanup();
  state.currentItem = null;
  state.editorPath = null;
  $("contentGrid").classList.remove("detail-open");
  $("detailPane").classList.add("hidden");
  $("detailModeLabel").textContent = "详情";
  $("previewTitle").textContent = "预览";
  $("previewOpenBtn").classList.add("hidden");
  $("previewOpenBtn").onclick = null;
  $("saveTextBtn").classList.add("hidden");
  $("previewBody").className = "preview-body preview-modal-body empty-state";
  $("previewBody").textContent = "点击文件的预览或编辑按钮后在这里查看内容";
  syncUploadDock();
}

function isPreviewOpen() {
  return Boolean($("previewModal")?.open);
}

function resizeVisualizerCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(canvas.clientWidth || 640, 320);
  const height = Math.max(canvas.clientHeight || 240, 180);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function createAudioVisualizer(audio, canvas) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return () => {};
  }

  const context = new AudioContextCtor();
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.84;
  const source = context.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(context.destination);
  const data = new Uint8Array(analyser.frequencyBinCount);
  let frameId = 0;

  const render = () => {
    const { ctx, width, height } = resizeVisualizerCanvas(canvas);
    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "rgba(13, 33, 42, 0.95)");
    bg.addColorStop(1, "rgba(14, 93, 88, 0.88)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    for (let index = 0; index < 5; index += 1) {
      ctx.strokeStyle = `rgba(220, 255, 246, ${0.04 + index * 0.02})`;
      ctx.beginPath();
      ctx.moveTo(0, (height / 4) * index);
      ctx.lineTo(width, (height / 4) * index);
      ctx.stroke();
    }

    analyser.getByteFrequencyData(data);
    const barCount = Math.min(64, data.length);
    const gap = 4;
    const barWidth = (width - gap * (barCount - 1)) / barCount;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    gradient.addColorStop(0.35, "rgba(122, 255, 228, 0.9)");
    gradient.addColorStop(1, "rgba(37, 200, 173, 0.15)");
    ctx.fillStyle = gradient;

    for (let index = 0; index < barCount; index += 1) {
      const magnitude = (data[index] || 0) / 255;
      const barHeight = Math.max(10, magnitude * (height - 36));
      const x = index * (barWidth + gap);
      const y = height - barHeight;
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(2, barWidth), barHeight, 10);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let index = 0; index < barCount; index += 1) {
      const magnitude = (data[index] || 0) / 255;
      const x = index * (barWidth + gap) + barWidth / 2;
      const y = height * 0.72 - magnitude * (height * 0.32);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    frameId = window.requestAnimationFrame(render);
  };

  const resume = () => {
    context.resume().catch(() => {});
    if (!frameId) {
      render();
    }
  };

  const handleVisibility = () => {
    if (audio.paused && frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
    if (!audio.paused) {
      resume();
    }
  };

  audio.addEventListener("play", resume);
  audio.addEventListener("pause", handleVisibility);
  audio.addEventListener("ended", handleVisibility);
  audio.addEventListener("canplay", resume, { once: true });
  render();

  return () => {
    window.cancelAnimationFrame(frameId);
    audio.pause();
    audio.removeEventListener("play", resume);
    audio.removeEventListener("pause", handleVisibility);
    audio.removeEventListener("ended", handleVisibility);
    try {
      source.disconnect();
      analyser.disconnect();
    } catch {
      // Ignore disconnect errors during teardown.
    }
    context.close().catch(() => {});
  };
}

function createAudioPreview(audio, canvas, root) {
  const visualizerCleanup = createAudioVisualizer(audio, canvas);
  const playButton = root.querySelector("#audioPlayBtn");
  const progress = root.querySelector("#audioProgress");
  const currentTimeLabel = root.querySelector("#audioCurrentTime");
  const durationLabel = root.querySelector("#audioDuration");

  const syncAudioUi = () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const progressValue = duration > 0 ? (currentTime / duration) * 100 : 0;
    progress.value = String(progressValue);
    progress.style.setProperty("--progress", `${progressValue}%`);
    currentTimeLabel.textContent = formatDuration(currentTime);
    durationLabel.textContent = formatDuration(duration);
    playButton.innerHTML = renderSvgIcon(audio.paused ? "play" : "pause");
    playButton.setAttribute("aria-label", audio.paused ? "播放" : "暂停");
  };

  const togglePlayback = async () => {
    if (audio.paused) {
      await audio.play();
    } else {
      audio.pause();
    }
    syncAudioUi();
  };

  const seekAudio = () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      return;
    }
    audio.currentTime = (Number(progress.value) / 100) * audio.duration;
    syncAudioUi();
  };

  playButton.addEventListener("click", togglePlayback);
  progress.addEventListener("input", seekAudio);
  audio.addEventListener("loadedmetadata", syncAudioUi);
  audio.addEventListener("durationchange", syncAudioUi);
  audio.addEventListener("timeupdate", syncAudioUi);
  audio.addEventListener("play", syncAudioUi);
  audio.addEventListener("pause", syncAudioUi);
  audio.addEventListener("ended", syncAudioUi);
  syncAudioUi();

  return () => {
    playButton.removeEventListener("click", togglePlayback);
    progress.removeEventListener("input", seekAudio);
    audio.removeEventListener("loadedmetadata", syncAudioUi);
    audio.removeEventListener("durationchange", syncAudioUi);
    audio.removeEventListener("timeupdate", syncAudioUi);
    audio.removeEventListener("play", syncAudioUi);
    audio.removeEventListener("pause", syncAudioUi);
    audio.removeEventListener("ended", syncAudioUi);
    visualizerCleanup();
  };
}

function createPdfPreview(src, root) {
  const status = root.querySelector("#pdfPreviewStatus");
  const pages = root.querySelector("#pdfPreviewPages");
  let disposed = false;
  let loadingTask = null;
  const renderTasks = new Set();

  const showError = (message) => {
    status.textContent = "PDF 预览失败";
    pages.innerHTML = `<div class="empty-panel pdf-preview-error">${escapeHtml(message)}</div>`;
  };

  const renderPage = async (pdf, pageNumber) => {
    const page = await pdf.getPage(pageNumber);
    if (disposed) {
      return;
    }

    const viewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.min(Math.max(pages.clientWidth - 8, 320), 980);
    const scale = availableWidth / viewport.width;
    const pixelRatio = window.devicePixelRatio || 1;
    const renderViewport = page.getViewport({ scale: scale * pixelRatio });
    const displayViewport = page.getViewport({ scale });

    const wrapper = document.createElement("section");
    wrapper.className = "pdf-page-card";
    wrapper.innerHTML = `
      <header class="pdf-page-head">
        <span>第 ${pageNumber} 页</span>
      </header>
      <canvas class="pdf-page-canvas"></canvas>
    `;
    pages.append(wrapper);

    const canvas = wrapper.querySelector("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.ceil(renderViewport.width);
    canvas.height = Math.ceil(renderViewport.height);
    canvas.style.width = `${displayViewport.width}px`;
    canvas.style.height = `${displayViewport.height}px`;

    const renderTask = page.render({
      canvasContext: context,
      viewport: renderViewport,
    });
    renderTasks.add(renderTask);
    try {
      await renderTask.promise;
    } finally {
      renderTasks.delete(renderTask);
    }
  };

  (async () => {
    try {
      status.textContent = "正在加载 PDF…";
      const pdfjs = await getPdfJs();
      if (disposed) {
        return;
      }
      loadingTask = pdfjs.getDocument({
        url: toAbsoluteUrl(src),
        withCredentials: true,
      });
      const pdf = await loadingTask.promise;
      if (disposed) {
        await loadingTask.destroy();
        return;
      }

      status.textContent = `共 ${pdf.numPages} 页`;
      pages.innerHTML = "";
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (disposed) {
          break;
        }
        await renderPage(pdf, pageNumber);
      }
      if (!disposed && pdf.numPages === 0) {
        pages.innerHTML = '<div class="empty-panel">这个 PDF 没有可渲染的页面。</div>';
      }
    } catch (error) {
      if (!disposed) {
        console.error(error);
        showError(error?.message || "当前 PDF 无法渲染，请尝试新窗口打开。");
      }
    }
  })();

  return () => {
    disposed = true;
    for (const renderTask of renderTasks) {
      try {
        renderTask.cancel();
      } catch {
        // Ignore cancelled render tasks during teardown.
      }
    }
    renderTasks.clear();
    if (loadingTask) {
      loadingTask.destroy().catch(() => {});
    }
  };
}

function resetTransientViewState() {
  state.activeView = "files";
  state.currentWorkspace = null;
  state.currentPath = "";
  state.currentPermission = "read";
  state.currentItem = null;
  state.editorPath = null;
  state.currentItems = [];
  state.fileQuery = "";
  state.sortField = "modified_at";
  state.sortDirection = "desc";
  state.page = 1;
  state.pageSize = DEFAULT_PAGE_SIZE;
  state.managerMode = null;
  state.managerContext = null;
}

function showLogin() {
  resetTransientViewState();
  $("loginView").classList.remove("hidden");
  $("appView").classList.add("hidden");
}

function showApp() {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
}

async function bootstrap() {
  try {
    const session = await api("/api/session");
    if (session.actor) {
      state.actor = session.actor;
      await loadShell({ skipContentLoad: true });
      showApp();
      await restoreRouteFromLocation();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

async function loadShell({ skipContentLoad = false } = {}) {
  const [workspaces, actors, shared] = await Promise.all([
    api("/api/workspaces"),
    api("/api/actors"),
    api("/api/shared"),
  ]);
  state.workspaces = workspaces.workspaces;
  state.actors = actors.actors;
  state.shared = shared.items;
  if (state.currentWorkspace && !state.workspaces.some((workspace) => workspace.name === state.currentWorkspace)) {
    state.currentWorkspace = null;
    state.currentPath = "";
    closeManager();
    closeDetail();
  }
  $("actorLabel").textContent = state.actor.display_name || state.actor.actor_id;
  $("adminBtn").classList.toggle("hidden", !state.actor.is_admin);
  renderWorkspaces();
  renderShared();
  if (!state.currentWorkspace && state.workspaces.length) {
    state.currentWorkspace = state.workspaces[0].name;
    state.currentPath = "";
  }
  $("fileSearchInput").value = state.fileQuery;
  $("pageSizeSelect").value = String(state.pageSize);
  updateSidebarNav();
  applyViewMode();
  if (!skipContentLoad) {
    await restoreRouteFromLocation();
  }
}

function renderWorkspaces() {
  const list = $("workspaceList");
  const searchInput = $("workspaceSearchInput");
  const switcher = $("workspaceSwitcher");
  list.innerHTML = "";
  if (searchInput && searchInput.value !== state.workspaceQuery) {
    searchInput.value = state.workspaceQuery;
  }
  const current = currentWorkspaceInfo() || state.workspaces[0] || null;
  $("spaceManagerNavBtn").classList.toggle("hidden", !current || current.kind !== "share_group");
  $("workspaceSwitchLabel").textContent = current?.name || "请选择";
  $("workspaceSwitchMeta").textContent = workspaceSummaryText(current);
  $("workspaceSwitchPill").textContent = workspaceBadgeText(current);
  if (!state.workspaces.length) {
    switcher.open = false;
    return;
  }
  const query = state.workspaceQuery.trim().toLocaleLowerCase();
  const visibleWorkspaces = state.workspaces.filter((workspace) => {
    if (!query) return true;
    const searchText = [
      workspace.name,
      workspace.kind === "private" ? "个人空间" : "共享空间",
      workspace.permission,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return searchText.includes(query);
  });
  if (!visibleWorkspaces.length) {
    const empty = document.createElement("div");
    empty.className = "workspace-empty-state";
    empty.textContent = "没有匹配的空间";
    list.append(empty);
    return;
  }
  for (const workspace of visibleWorkspaces) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workspace-option";
    if (state.currentWorkspace === workspace.name) button.classList.add("is-active");
    button.innerHTML = `
      <span class="workspace-option-copy">
        <strong>${escapeHtml(workspace.name)}</strong>
        <span>${escapeHtml(workspace.kind === "private" ? "个人空间" : `共享空间 · ${workspace.permission}`)}</span>
      </span>
      <span class="workspace-switch-pill">${escapeHtml(workspaceBadgeText(workspace))}</span>
    `;
    button.addEventListener("click", () => {
      switcher.open = false;
      selectWorkspace(workspace.name, "");
    });
    list.append(button);
  }
}

function renderShared() {
  $("sharedCount").textContent = String(state.shared.length);
  $("sharedNavBtn").title = state.shared.length ? `与我共享 ${state.shared.length} 项` : "暂无共享项目";
}

async function selectWorkspace(name, path = "", { skipRouteSync = false, preserveDetail = false, replaceRoute = false } = {}) {
  $("workspaceSwitcher").open = false;
  state.currentWorkspace = name;
  state.currentPath = path;
  state.currentItem = null;
  switchToFileView();
  renderWorkspaces();
  await loadFiles({ preserveDetail });
  if (!skipRouteSync) {
    syncRoute({ replace: replaceRoute });
  }
}

async function loadFiles({ preserveDetail = false, preservePage = false } = {}) {
  if (!state.currentWorkspace) return;
  const params = new URLSearchParams({
    workspace: state.currentWorkspace,
    path: state.currentPath || "",
  });
  const payload = await api(`/api/files?${params.toString()}`);
  state.currentPermission = payload.permission;
  state.currentItems = payload.items;
  if (!preservePage) {
    state.page = 1;
  }
  setWriteActionsEnabled(payload.permission === "write");
  renderFileList(payload.path || "");
  if (!preserveDetail) {
    closeDetail();
  }
}

function renderFileList(path = state.currentPath || "") {
  renderBreadcrumb(path);
  renderRows(state.currentItems);
  renderSortHeaders();
  syncUploadDock();
}

function renderBreadcrumb(path) {
  const rootButton = `<button data-path="">${escapeHtml(state.currentWorkspace)}</button>`;
  const parts = path ? path.split("/") : [];
  const crumbs = [rootButton];
  let cursor = "";
  for (const part of parts) {
    cursor = cursor ? `${cursor}/${part}` : part;
    crumbs.push(`<span>/</span><button data-path="${escapeHtml(cursor)}">${escapeHtml(part)}</button>`);
  }
  $("breadcrumb").innerHTML = crumbs.join("");
  $("breadcrumb").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => selectWorkspace(state.currentWorkspace, button.dataset.path));
  });
}

function renderActionPill(action, label, icon, variant, disabled = false) {
  return `
    <button
      data-action="${action}"
      class="action-pill-button ${variant}"
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}"
      ${disabled ? " disabled" : ""}
    >
      <span class="action-pill-icon" aria-hidden="true">${renderSvgIcon(icon)}</span>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderActionIcon(action, label, icon, variant, disabled = false) {
  return `
    <button
      data-action="${action}"
      class="action-icon-button ${variant}"
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}"
      ${disabled ? " disabled" : ""}
    >
      <span aria-hidden="true">${renderSvgIcon(icon)}</span>
    </button>
  `;
}

function renderModifyMenu() {
  return `
    <div class="action-menu">
      ${renderActionPill("toggle-modify", "修改", "modify", "action-neutral action-pill-compact")}
      <div class="action-submenu">
        <button type="button" data-action="rename">重命名</button>
        <button type="button" data-action="move">移动</button>
        <button type="button" data-action="copy">复制</button>
      </div>
    </div>
  `;
}

function renderRows(items) {
  const rows = $("fileRows");
  rows.innerHTML = "";
  const { pageItems, totalItems, totalPages } = getVisibleFileState();
  if (state.currentPath) {
    const parent = state.currentPath.split("/").slice(0, -1).join("/");
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><div class="file-name">${fileIconMarkup({ kind: "folder", preview_type: "folder" })}<button>..</button></div></td>
      <td></td><td></td><td></td>
    `;
    row.querySelector("button").addEventListener("click", () => selectWorkspace(state.currentWorkspace, parent));
    rows.append(row);
  }
  if (!pageItems.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="4" class="empty-table-row">${totalItems ? "当前页没有内容。" : "没有匹配的文件或文件夹。"}</td>`;
    rows.append(row);
    renderPagination(totalItems, totalPages);
    return;
  }
  for (const item of pageItems) {
    const row = document.createElement("tr");
    const nameCell = item.kind === "folder"
      ? `<button title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</button>`
      : `<span class="file-label" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>`;
    const actions = [];
    if (item.kind === "file") {
      actions.push(renderActionIcon("preview", "预览", "preview", "action-neutral"));
      if (canEditItem(item)) {
        actions.push(renderActionIcon("edit", "编辑", "edit", "action-edit", state.currentPermission !== "write"));
      }
      actions.push(renderActionIcon("download", "下载", "download", "action-download"));
    }
    if (state.currentPermission === "write") {
      actions.push(renderModifyMenu());
    }
    actions.push(renderActionPill("share", "分享", "share", "action-share", state.currentPermission !== "write"));
    if (state.currentPermission === "write") {
      actions.push(renderActionIcon("delete", "删除", "delete", "action-delete"));
    }
    row.innerHTML = `
      <td>
        <div class="file-name">
          ${fileIconMarkup(item)}
          ${nameCell}
        </div>
      </td>
      <td>${formatSize(item.size)}</td>
      <td>${formatDate(item.modified_at)}</td>
      <td>
        <span class="row-actions">
          ${actions.join("")}
        </span>
      </td>
    `;
    row.querySelector(".file-name button")?.addEventListener("click", () => {
      selectWorkspace(state.currentWorkspace, item.path);
    });
    row.querySelector('[data-action="preview"]')?.addEventListener("click", (event) => {
      event.stopPropagation();
      previewItem(item);
    });
    row.querySelector('[data-action="edit"]')?.addEventListener("click", (event) => {
      event.stopPropagation();
      editItem(item);
    });
    row.querySelector('[data-action="download"]')?.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        await downloadItem(item);
      } catch (error) {
        toast(error.message);
      }
    });
    const modifyMenu = row.querySelector(".action-menu");
    row.querySelector('[data-action="toggle-modify"]')?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleActionMenu(modifyMenu);
    });
    modifyMenu?.querySelector('[data-action="rename"]')?.addEventListener("click", (event) => {
      event.stopPropagation();
      closeAllActionMenus();
      openRenameModal(item);
    });
    modifyMenu?.querySelector('[data-action="move"]')?.addEventListener("click", (event) => {
      event.stopPropagation();
      closeAllActionMenus();
      openMoveModal(item);
    });
    modifyMenu?.querySelector('[data-action="copy"]')?.addEventListener("click", (event) => {
      event.stopPropagation();
      closeAllActionMenus();
      openCopyModal(item);
    });
    row.querySelector('[data-action="share"]')?.addEventListener("click", (event) => {
      event.stopPropagation();
      state.currentItem = item;
      openShareModal(item.path);
    });
    row.querySelector('[data-action="delete"]')?.addEventListener("click", (event) => {
      event.stopPropagation();
      confirmDelete(item);
    });
    rows.append(row);
  }
  renderPagination(totalItems, totalPages);
}

function closeDetail() {
  if (isPreviewOpen()) {
    $("previewModal").close();
    return;
  }
  resetPreviewDialog();
}

function openDetailShell(modeLabel, title, options = {}) {
  closeManager();
  closeAllActionMenus();
  runPreviewCleanup();
  $("contentGrid").classList.remove("detail-open");
  $("detailPane").classList.add("hidden");
  $("detailModeLabel").textContent = modeLabel;
  $("previewTitle").textContent = title;
  $("previewBody").className = "preview-body preview-modal-body";
  $("previewBody").innerHTML = "";
  $("saveTextBtn").classList.add("hidden");
  if (options.externalHref) {
    $("previewOpenBtn").classList.remove("hidden");
    $("previewOpenBtn").onclick = () => {
      const link = document.createElement("a");
      link.href = options.externalHref;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "hidden";
      document.body.append(link);
      link.click();
      link.remove();
    };
  } else {
    $("previewOpenBtn").classList.add("hidden");
    $("previewOpenBtn").onclick = null;
  }
  if (!isPreviewOpen()) {
    $("previewModal").showModal();
  }
}

async function previewItem(item) {
  await previewItemForWorkspace(state.currentWorkspace, item);
}

async function previewItemForWorkspace(workspace, item) {
  state.currentItem = item;
  state.editorPath = null;
  const src = previewUrl(workspace, item.path);
  if (item.preview_type === "html") {
    runPreviewCleanup();
    if (isPreviewOpen()) {
      $("previewModal").close();
    }
    openHtmlPreview(workspace, item.path);
    return;
  }
  openDetailShell("预览", item.path, { externalHref: src });
  if (item.preview_type === "image") {
    $("previewBody").innerHTML = `<img src="${src}" alt="${escapeHtml(item.name)}" />`;
    return;
  }
  if (item.preview_type === "video") {
    $("previewBody").innerHTML = `<video src="${src}" controls></video>`;
    return;
  }
  if (item.preview_type === "audio") {
    $("previewBody").innerHTML = `
      <section class="audio-preview-shell">
        <section class="audio-player-panel">
          <audio id="audioPlayer" class="audio-native-element" src="${src}" preload="metadata"></audio>
          <button id="audioPlayBtn" class="audio-play-button" type="button" aria-label="播放">
            ${renderSvgIcon("play")}
          </button>
          <div class="audio-progress-shell">
            <div class="audio-progress-meta">
              <span class="audio-time-pair">
                <span id="audioCurrentTime">0:00</span>
                <span>/</span>
                <span id="audioDuration">0:00</span>
              </span>
            </div>
            <input id="audioProgress" class="audio-progress-input" type="range" min="0" max="100" step="0.1" value="0" aria-label="音频播放进度" />
          </div>
        </section>
        <div class="audio-visualizer-card">
          <canvas class="audio-visualizer" id="audioVisualizer" aria-hidden="true"></canvas>
        </div>
      </section>
    `;
    state.previewCleanup = createAudioPreview(
      $("previewBody").querySelector("#audioPlayer"),
      $("previewBody").querySelector("#audioVisualizer"),
      $("previewBody"),
    );
    return;
  }
  if (item.preview_type === "pdf") {
    $("previewBody").innerHTML = `
      <section class="document-preview-shell pdf-preview-shell">
        <div class="preview-inline-actions pdf-preview-toolbar">
          <span id="pdfPreviewStatus" class="path-chip">正在加载 PDF…</span>
          <a class="preview-link" href="${src}" target="_blank" rel="noopener noreferrer">新窗口打开</a>
        </div>
        <div id="pdfPreviewPages" class="pdf-preview-pages">
          <div class="empty-panel">正在准备 PDF 预览…</div>
        </div>
      </section>
    `;
    state.previewCleanup = createPdfPreview(src, $("previewBody"));
    return;
  }
  if (item.preview_type === "markdown") {
    const params = new URLSearchParams({ workspace, path: item.path });
    const html = await api(`/api/files/markdown?${params.toString()}`);
    $("previewBody").innerHTML = `<div class="markdown-preview">${html}</div>`;
    return;
  }
  if (item.preview_type === "text") {
    const text = await loadText(item.path, workspace);
    $("previewBody").innerHTML = `<pre class="text-preview">${escapeHtml(text)}</pre>`;
    return;
  }
  $("previewBody").innerHTML = `
    <div class="empty-state">
      <button id="previewDownloadBtn" type="button">下载 ${escapeHtml(item.name)}</button>
    </div>
  `;
  $("previewDownloadBtn").addEventListener("click", async () => {
    try {
      await downloadItem(item, workspace);
    } catch (error) {
      toast(error.message);
    }
  });
}

async function editItem(item) {
  if (!canEditItem(item)) return;
  state.currentItem = item;
  openDetailShell("编辑", item.path);
  const text = await loadText(item.path);
  $("previewBody").innerHTML = `<textarea class="editor" id="textEditor" spellcheck="false">${escapeHtml(text)}</textarea>`;
  enableEditor(item.path);
}

async function loadText(path, workspace = state.currentWorkspace) {
  const params = new URLSearchParams({ workspace, path });
  const payload = await api(`/api/files/text?${params.toString()}`);
  return payload.content;
}

function enableEditor(path) {
  state.editorPath = path;
  $("saveTextBtn").classList.toggle("hidden", state.currentPermission !== "write");
}

async function saveEditor() {
  const editor = $("textEditor");
  if (!editor || !state.editorPath) return;
  const item = state.currentItem;
  await api("/api/files/text", {
    method: "POST",
    body: {
      workspace: state.currentWorkspace,
      path: state.editorPath,
      content: editor.value,
    },
  });
  toast("已保存");
  await loadFiles({ preserveDetail: true });
  if (item) {
    await editItem(item);
  }
}

function openModal(html, onConfirm, options = {}) {
  const modal = $("modal");
  const form = $("modalForm");
  closeAllActionMenus();
  $("modalBody").innerHTML = html;
  $("modalConfirm").textContent = options.confirmLabel || "确认";
  $("modalConfirm").classList.remove("danger-button");
  $("modalConfirm").classList.toggle("hidden", Boolean(options.hideConfirm));
  $("modalConfirm").classList.toggle("danger-button", options.confirmVariant === "danger");
  $("modalCancel").textContent = options.cancelLabel || "取消";
  $("modalCancel").onclick = () => modal.close();
  form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      await onConfirm(new FormData(form));
      modal.close();
    } catch (error) {
      toast(error.message);
    }
  };
  options.onReady?.({ modal, form, body: $("modalBody") });
  modal.showModal();
}

function showManagerView() {
  closeDetail();
  state.currentItem = null;
  $("managerBody").className = "manager-body";
  state.dragDepth = 0;
  toggleDropOverlay(false);
  applyViewMode();
}

function closeManager() {
  switchToFileView();
  state.dragDepth = 0;
  toggleDropOverlay(false);
  syncUploadDock();
}

function renderPublicLinksSection(path, payload, { compact = false, hideWhenUnavailable = false } = {}) {
  const sectionClass = compact ? "manager-section compact" : "manager-section";
  const headClass = compact ? "section-head compact" : "section-head";
  if (payload.target_kind !== "file") {
    if (hideWhenUnavailable) {
      return "";
    }
    return `
      <section class="${sectionClass}" data-public-link-section>
        <div class="${headClass}">
          <div>
            <h2>公开链接管理</h2>
            <p>公开链接只支持单个文件，文件夹和根目录不会生成公开下载地址。</p>
          </div>
        </div>
        <div class="empty-panel">当前路径不是文件，不能生成公开链接。</div>
      </section>
    `;
  }
  return `
    <section class="${sectionClass}" data-public-link-section>
      <div class="${headClass}">
        <div>
          <h2>公开链接管理</h2>
          <p>生成后，任何拿到链接的人都可以直接下载这个文件。</p>
        </div>
        <button type="button" data-action="create-public-link" data-path="${escapeHtml(path)}">生成公开链接</button>
      </div>
      ${payload.public_links.length ? `
        <table class="manager-table${compact ? " compact" : ""}">
          <thead>
            <tr>
              <th>公开链接</th>
              <th>创建时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${payload.public_links
              .map((link) => {
                const absoluteUrl = toAbsoluteUrl(link.download_url);
                return `
                  <tr data-public-link-id="${link.id}">
                    <td>
                      <input class="public-link-input" readonly value="${escapeHtml(absoluteUrl)}" />
                    </td>
                    <td>${formatDate(link.created_at)}</td>
                    <td>
                      <div class="manager-actions public-link-actions">
                        <button type="button" data-action="copy-public-link" data-public-link-url="${escapeHtml(absoluteUrl)}">复制链接</button>
                        <a class="secondary inline-link-button" href="${escapeHtml(link.download_url)}" target="_blank" rel="noopener noreferrer">打开</a>
                        <button type="button" data-action="delete-public-link" class="secondary" data-public-link-id="${link.id}">撤销</button>
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      ` : `<div class="empty-panel">当前文件还没有公开链接。</div>`}
    </section>
  `;
}

function bindPublicLinkActions(container, { workspace, path, refresh }) {
  container.querySelector('[data-action="create-public-link"]')?.addEventListener("click", async () => {
    await api("/api/public-links", {
      method: "POST",
      body: {
        workspace,
        path,
      },
    });
    toast("公开链接已生成");
    await refresh();
  });

  container.querySelectorAll('[data-action="copy-public-link"]').forEach((button) => {
    button.addEventListener("click", async () => {
      await copyText(button.dataset.publicLinkUrl);
      toast("公开链接已复制");
    });
  });

  container.querySelectorAll('[data-action="delete-public-link"]').forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/public-links/${button.dataset.publicLinkId}`, { method: "DELETE" });
      toast("公开链接已撤销");
      await refresh();
    });
  });
}

function renderWorkspacePublicLinksSection(payload) {
  return `
    <section class="manager-section">
      <div class="section-head">
        <div>
          <h2>工作区内公开链接</h2>
          <p>这里集中管理当前 workspace 里已经生成过的所有公开下载链接。</p>
        </div>
      </div>
      ${payload.public_links.length ? `
        <table class="manager-table">
          <thead>
            <tr>
              <th>文件</th>
              <th>公开链接</th>
              <th>创建时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${payload.public_links.map((link) => {
              const absoluteUrl = toAbsoluteUrl(link.download_url);
              return `
                <tr>
                  <td>
                    <div class="row-meta">
                      <strong>${escapeHtml(link.path)}</strong>
                      <span>${escapeHtml(leafName(link.path))}</span>
                    </div>
                  </td>
                  <td><input class="public-link-input" readonly value="${escapeHtml(absoluteUrl)}" /></td>
                  <td>${formatDate(link.created_at)}</td>
                  <td>
                    <div class="manager-actions public-link-actions">
                      <button type="button" data-action="copy-public-link" data-public-link-url="${escapeHtml(absoluteUrl)}">复制链接</button>
                      <a class="secondary inline-link-button" href="${escapeHtml(link.download_url)}" target="_blank" rel="noopener noreferrer">打开</a>
                      <button type="button" data-action="delete-public-link" class="secondary" data-public-link-id="${link.id}">撤销</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      ` : `<div class="empty-panel">当前 workspace 里还没有公开链接。</div>`}
    </section>
  `;
}

async function openShareModal(path = state.currentItem?.path || state.currentPath || "") {
  if (!state.currentWorkspace) return;
  if (state.currentPermission !== "write") {
    toast("当前目录只读，无法管理分享");
    return;
  }
  const params = new URLSearchParams({ workspace: state.currentWorkspace, path });
  const [payload, publicLinkPayload] = await Promise.all([
    api(`/api/shares?${params.toString()}`),
    api(publicLinksApiUrl(state.currentWorkspace, path)),
  ]);
  const recipients = actorOptions();
  openModal(
    `
      <h2>分享 ${escapeHtml(path || "/")}</h2>
      <p class="modal-copy">直接在这里新增、更新或取消当前路径的分享。</p>
      <div class="manager-stack compact">
        <section class="manager-section compact">
          ${recipients
            ? `
              <label>
                <span>分享对象</span>
                <select name="actor_id" class="multi-select" multiple size="8">${recipients}</select>
              </label>
              <label>
                <span>权限</span>
                <select name="permission">${permissionOptions(["read", "write"], "read")}</select>
              </label>
            `
            : `<div class="empty-panel">没有可新增的分享对象。</div>`}
        </section>
        <section class="manager-section compact">
          <div class="section-head compact">
            <div>
              <h2>当前分享列表</h2>
              <p>可以直接修改权限，或取消分享。</p>
            </div>
          </div>
          ${payload.shares.length
            ? `
              <table class="manager-table compact">
                <thead>
                  <tr>
                    <th>对象</th>
                    <th>权限</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${payload.shares
                    .map((share) => `
                      <tr data-share-id="${share.id}" data-actor-id="${escapeHtml(share.actor_id)}">
                        <td>
                          <div class="row-meta">
                            <strong>${escapeHtml(share.actor_id)}</strong>
                            <span>${escapeHtml(share.display_name)}</span>
                          </div>
                        </td>
                        <td><select name="permission">${permissionOptions(["read", "write"], share.permission)}</select></td>
                        <td>
                          <div class="manager-actions">
                            <button type="button" data-action="save-share">保存</button>
                            <button type="button" data-action="delete-share" class="secondary">取消分享</button>
                          </div>
                        </td>
                      </tr>
                    `)
                    .join("")}
                </tbody>
              </table>
            `
            : `<div class="empty-panel">当前路径还没有分享记录。</div>`}
        </section>
        ${renderPublicLinksSection(path, publicLinkPayload, { compact: true, hideWhenUnavailable: true })}
      </div>
    `,
    async (form) => {
      const actorIds = Array.from(document.querySelectorAll('#modalBody [name="actor_id"] option:checked')).map((option) => option.value);
      if (!actorIds.length) {
        toast("请至少选择一个分享对象");
        return;
      }
      const permission = form.get("permission");
      await Promise.all(
        actorIds.map((actorId) =>
          api("/api/shares", {
            method: "POST",
            body: {
              workspace: state.currentWorkspace,
              path,
              actor_id: actorId,
              permission,
            },
          }),
        ),
      );
      toast(`已更新 ${actorIds.length} 个分享对象`);
      if (state.managerMode === "share") {
        await refreshCurrentManager();
      }
    },
    {
      confirmLabel: recipients ? "提交分享" : "关闭",
      hideConfirm: !recipients,
      onReady: ({ modal, body }) => {
        body.querySelectorAll('[data-action="save-share"]').forEach((button) => {
          button.addEventListener("click", async () => {
            const row = button.closest("tr");
            await api("/api/shares", {
              method: "POST",
              body: {
                workspace: state.currentWorkspace,
                path,
                actor_id: row.dataset.actorId,
                permission: row.querySelector('[name="permission"]').value,
              },
            });
            toast("分享权限已更新");
            if (state.managerMode === "share") {
              await refreshCurrentManager();
            }
            modal.close();
          });
        });
        body.querySelectorAll('[data-action="delete-share"]').forEach((button) => {
          button.addEventListener("click", async () => {
            const row = button.closest("tr");
            await api(`/api/shares/${row.dataset.shareId}`, { method: "DELETE" });
            toast("分享已取消");
            if (state.managerMode === "share") {
              await refreshCurrentManager();
            }
            modal.close();
          });
        });
        bindPublicLinkActions(body, {
          workspace: state.currentWorkspace,
          path,
          refresh: async () => {
            modal.close();
            await openShareModal(path);
          },
        });
      },
    },
  );
}

async function openSharedItem(item) {
  if (!item) return;
  if (item.kind === "folder") {
    closeManager();
    await selectWorkspace(item.workspace, item.path || "");
    return;
  }
  await previewItemForWorkspace(item.workspace, {
    name: item.path.split("/").pop() || item.path,
    path: item.path,
    kind: "file",
    preview_type: item.preview_type || "binary",
  });
}

async function openSharedManager({ skipRouteSync = false, replaceRoute = false } = {}) {
  state.activeView = "shared";
  state.managerMode = "shared";
  state.managerContext = {};
  showManagerView();
  const payload = await api("/api/shared");
  state.shared = payload.items;
  renderShared();
  const body = $("managerBody");
  body.innerHTML = `
    <div class="manager-stack">
      <section class="manager-section">
        <div class="section-head">
          <div>
            <h2>共享给我的内容</h2>
            <p>点击进入文件夹，或直接预览别人共享给你的文件。</p>
          </div>
        </div>
        ${state.shared.length ? `
          <table class="manager-table">
            <thead>
              <tr>
                <th>项目</th>
                <th>来源</th>
                <th>权限</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${state.shared
                .map((item, index) => `
                  <tr>
                    <td>
                      <div class="row-meta">
                        <strong>${escapeHtml(sharePathLabel(item.path))}</strong>
                        <span>${escapeHtml(item.kind === "folder" ? "文件夹" : `文件 · ${item.preview_type || "binary"}`)}</span>
                      </div>
                    </td>
                    <td>
                      <div class="row-meta">
                        <strong>${escapeHtml(item.workspace)}</strong>
                        <span>${escapeHtml(item.workspace_kind === "private" ? "个人 workspace" : "共享 workspace")}</span>
                      </div>
                    </td>
                    <td><span class="nav-pill">${escapeHtml(item.permission)}</span></td>
                    <td>
                      <div class="manager-actions">
                        <button type="button" data-action="open-shared" data-shared-index="${index}">${item.kind === "folder" ? "进入" : "预览"}</button>
                      </div>
                    </td>
                  </tr>
                `)
                .join("")}
            </tbody>
          </table>
        ` : `<div class="empty-panel">暂时没有共享给你的文件或文件夹。</div>`}
      </section>
    </div>
  `;

  body.querySelectorAll('[data-action="open-shared"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const item = state.shared[Number(button.dataset.sharedIndex)];
      await openSharedItem(item);
    });
  });
  if (!skipRouteSync) {
    syncRoute({ replace: replaceRoute });
  }
}

async function refreshCurrentManager() {
  if (state.managerMode === "share") {
    await openShareManager();
  } else if (state.managerMode === "shared") {
    await openSharedManager();
  } else if (state.managerMode === "workspace-members") {
    await openWorkspaceMembersManager();
  } else if (state.managerMode === "actor-admin") {
    await openActorManager();
  } else if (state.managerMode === "profile") {
    await openProfileManager();
  }
}

async function openFileListView({ skipRouteSync = false, preserveDetail = true, replaceRoute = false } = {}) {
  switchToFileView();
  if (!state.currentWorkspace && state.workspaces.length) {
    state.currentWorkspace = state.workspaces[0].name;
  }
  if (state.currentWorkspace) {
    await loadFiles({ preserveDetail, preservePage: true });
  }
  if (!skipRouteSync) {
    syncRoute({ replace: replaceRoute });
  }
}

async function refreshShellPreservingWorkspace({ reloadFiles = true } = {}) {
  const workspace = state.currentWorkspace;
  const path = state.currentPath;
  await loadShell({ skipContentLoad: true });
  if (!workspace || !state.currentWorkspace) return;
  if (workspace === state.currentWorkspace) {
    state.currentPath = path;
    if (reloadFiles) {
      try {
        await loadFiles({ preservePage: true });
      } catch {
        await selectWorkspace(workspace, "");
      }
    }
  }
}

async function openShareManager({ skipRouteSync = false, replaceRoute = false } = {}) {
  if (!state.currentWorkspace) return;
  const params = new URLSearchParams({
    workspace: state.currentWorkspace,
    path: "",
  });
  try {
    const payload = await api(`/api/files?${params.toString()}`);
    state.currentPermission = payload.permission;
  } catch (error) {
    toast(error.message);
    return;
  }
  if (state.currentPermission !== "write") {
    toast("当前目录只读，无法管理分享");
    return;
  }
  state.activeView = "share-manager";
  state.managerMode = "share";
  state.managerContext = {};
  showManagerView();
  const workspaceParams = new URLSearchParams({ workspace: state.currentWorkspace });
  const [workspacePayload, workspacePublicLinksPayload] = await Promise.all([
    api(`/api/shares?${workspaceParams.toString()}`),
    api(workspacePublicLinksApiUrl(state.currentWorkspace)),
  ]);
  const groupedShares = groupSharesByPath(workspacePayload.shares);
  const body = $("managerBody");
  body.innerHTML = `
    <div class="manager-stack">
      ${renderWorkspacePublicLinksSection(workspacePublicLinksPayload)}

      <section class="manager-section">
        <div class="section-head">
          <div>
            <h2>工作区内已分享项</h2>
            <p>这里只保留整个 workspace 已经分享出去的路径，点击按钮会直接打开该路径的分享设置弹窗。</p>
          </div>
        </div>
        ${groupedShares.length ? `
          <table class="manager-table">
            <thead>
              <tr>
                <th>路径</th>
                <th>分享对象</th>
                <th>权限</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${groupedShares
                .map((group) => `
                  <tr>
                    <td>
                      <div class="row-meta">
                        <strong>${escapeHtml(sharePathLabel(group.path))}</strong>
                        <span>${group.shares.length} 条分享记录</span>
                      </div>
                    </td>
                    <td>${escapeHtml(shareRecipientsSummary(group.shares))}</td>
                    <td>${escapeHtml(Array.from(new Set(group.shares.map((share) => share.permission))).join(" / "))}</td>
                    <td>
                      <div class="manager-actions">
                        <button type="button" data-action="open-share-modal" data-path="${escapeHtml(group.path)}">管理这个路径</button>
                      </div>
                    </td>
                  </tr>
                `)
                .join("")}
            </tbody>
          </table>
        ` : `<div class="empty-panel">这个 workspace 里还没有任何分享记录。</div>`}
      </section>
    </div>
  `;

  body.querySelectorAll('[data-action="open-share-modal"]').forEach((button) => {
    button.addEventListener("click", async () => {
      await openShareModal(button.dataset.path || "");
    });
  });

  bindPublicLinkActions(body, {
    workspace: state.currentWorkspace,
    path: state.currentPath || "",
    refresh: async () => {
      await refreshCurrentManager();
    },
  });
  if (!skipRouteSync) {
    syncRoute({ replace: replaceRoute });
  }
}

function confirmDelete(item) {
  openModal(
    `<h2>删除</h2><p>确认删除 ${escapeHtml(item.path)}？</p>`,
    async () => {
      const params = new URLSearchParams({ workspace: state.currentWorkspace, path: item.path });
      await api(`/api/files?${params.toString()}`, { method: "DELETE" });
      toast("已删除");
      await loadFiles();
    },
    { confirmLabel: "删除", confirmVariant: "danger" },
  );
}

function canBrowseIntoFolder(item, folderPath) {
  return item.kind !== "folder" || !isDescendantOrSamePath(item.path, folderPath);
}

async function openTransferModal(item, mode) {
  const kindLabel = item.kind === "folder" ? "文件夹" : "文件";
  const confirmLabel = mode === "copy" ? "复制" : "移动";
  const destinationName = mode === "copy" ? leafName(suggestCopyPath(item)) : item.name;
  const endpoint = mode === "copy" ? "/api/files/copy" : "/api/files/move";
  let targetFolder = state.currentPath || "";

  openModal(
    `
      <h2>${confirmLabel}${escapeHtml(item.name)}</h2>
      <p class="modal-copy">默认目标目录就是当前文件夹。点击下面的文件夹可以继续进入更深的目标位置。</p>
      <div class="folder-picker-shell">
        <div class="folder-picker-current">当前目标目录：<strong id="folderPickerCurrent"></strong></div>
        <div id="folderPickerBreadcrumb" class="folder-picker-breadcrumb"></div>
        <div id="folderPickerList" class="folder-picker-list"></div>
      </div>
      <label>
        <span>${mode === "copy" ? "复制后名称" : "目标名称"}</span>
        <input name="destination_name" required value="${escapeHtml(destinationName)}" />
      </label>
    `,
    async (form) => {
      const destinationPath = buildDestinationPath(targetFolder, form.get("destination_name"));
      try {
        await api(endpoint, {
          method: "POST",
          body: {
            workspace: state.currentWorkspace,
            source_path: item.path,
            destination_path: destinationPath,
          },
        });
      } catch (error) {
        if (error.message === "Not Found") {
          throw new Error("当前后端还没加载最新文件操作接口，请重启服务后再试");
        }
        throw error;
      }
      closeDetail();
      toast(`${kindLabel}已${mode === "copy" ? "复制" : "移动"}`);
      await loadFiles();
    },
    {
      confirmLabel,
      onReady: ({ body }) => {
        const breadcrumb = body.querySelector("#folderPickerBreadcrumb");
        const list = body.querySelector("#folderPickerList");
        const current = body.querySelector("#folderPickerCurrent");
        const nameInput = body.querySelector('[name="destination_name"]');
        const confirmButton = $("modalConfirm");

        const updateConfirmState = () => {
          try {
            const nextPath = buildDestinationPath(targetFolder, nameInput.value);
            confirmButton.disabled = normalizePathInput(nextPath) === normalizePathInput(item.path);
          } catch {
            confirmButton.disabled = true;
          }
        };

        const renderFolderPicker = async () => {
          current.textContent = `${state.currentWorkspace}/${targetFolder || ""}`;
          breadcrumb.innerHTML = folderBreadcrumbMarkup(targetFolder);
          breadcrumb.querySelectorAll("button").forEach((button) => {
            button.addEventListener("click", async () => {
              targetFolder = button.dataset.folderPath || "";
              await renderFolderPicker();
            });
          });

          const params = new URLSearchParams({ workspace: state.currentWorkspace, path: targetFolder });
          const payload = await api(`/api/files?${params.toString()}`);
          const folders = payload.items
            .filter((entry) => entry.kind === "folder")
            .filter((entry) => canBrowseIntoFolder(item, entry.path));

          const cards = [];
          if (targetFolder) {
            cards.push(`
              <button type="button" class="folder-picker-item folder-picker-up" data-folder-path="${escapeHtml(parentFolderPath(targetFolder))}">
                <strong>..</strong>
                <small>返回上一级</small>
              </button>
            `);
          }
          cards.push(
            ...folders.map((entry) => `
              <button type="button" class="folder-picker-item" data-folder-path="${escapeHtml(entry.path)}">
                <strong>${escapeHtml(entry.name)}</strong>
                <small>${escapeHtml(entry.path)}</small>
              </button>
            `),
          );

          list.innerHTML = cards.length ? cards.join("") : '<div class="empty-panel">当前目录没有可进入的子文件夹。</div>';
          list.querySelectorAll("button").forEach((button) => {
            button.addEventListener("click", async () => {
              targetFolder = button.dataset.folderPath || "";
              await renderFolderPicker();
            });
          });
          updateConfirmState();
        };

        nameInput.addEventListener("input", updateConfirmState);
        renderFolderPicker().catch((error) => {
          list.innerHTML = `<div class="empty-panel">${escapeHtml(error.message)}</div>`;
          confirmButton.disabled = true;
        });
      },
    },
  );
}

function openRenameModal(item) {
  const kindLabel = item.kind === "folder" ? "文件夹" : "文件";
  openModal(
    `
      <h2>重命名</h2>
      <p class="modal-copy">当前路径：${escapeHtml(item.path)}</p>
      <label>
        <span>新名称</span>
        <input name="new_name" required value="${escapeHtml(item.name)}" />
      </label>
    `,
    async (form) => {
      try {
        await api("/api/files/rename", {
          method: "POST",
          body: {
            workspace: state.currentWorkspace,
            path: item.path,
            new_name: String(form.get("new_name") || "").trim(),
          },
        });
      } catch (error) {
        if (error.message === "Not Found") {
          throw new Error("当前后端还没加载最新重命名接口，请重启服务后再试");
        }
        throw error;
      }
      closeDetail();
      toast(`${kindLabel}已重命名`);
      await loadFiles();
    },
    {
      confirmLabel: "重命名",
      onReady: ({ body }) => {
        body.querySelector('[name="new_name"]')?.select();
      },
    },
  );
}

function openMoveModal(item) {
  openTransferModal(item, "move");
}

function openCopyModal(item) {
  openTransferModal(item, "copy");
}

function openNewGroupModal() {
  const creatorId = state.actor?.actor_id || "";
  openModal(
    `
      <h2>新建共享空间</h2>
      <label>
        <span>名称</span>
        <input name="name" required placeholder="research-team" />
      </label>
      <section class="manager-section compact workspace-create-section">
        <div class="section-head compact">
          <div>
            <h2>空间成员</h2>
            <p>创建者默认保留 owner 权限。确认后会直接进入新建的共享空间。</p>
          </div>
          <button id="addWorkspaceMemberBtn" type="button" class="secondary">添加成员</button>
        </div>
        <table class="manager-table compact workspace-create-members-table">
          <thead>
            <tr>
              <th>成员</th>
              <th>权限</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="workspaceCreateMemberRows"></tbody>
        </table>
        <p id="workspaceCreateMemberHint" class="field-hint"></p>
      </section>
    `,
    async (form) => {
      const rows = Array.from(document.querySelectorAll('[data-role="workspace-member-row"]'));
      const members = rows
        .map((row) => ({
          actor_id: String(row.querySelector('[data-role="workspace-member-actor"]')?.value || "").trim(),
          permission: String(row.querySelector('[data-role="workspace-member-permission"]')?.value || "read"),
        }))
        .filter((member) => member.actor_id);
      const created = await api("/api/workspaces", {
        method: "POST",
        body: {
          name: String(form.get("name") || "").trim(),
          kind: "share_group",
          members,
        },
      });
      await loadShell({ skipContentLoad: true });
      toast("共享空间已创建");
      await selectWorkspace(created.workspace.name, "");
    },
    {
      onReady: ({ body }) => {
        const rows = body.querySelector("#workspaceCreateMemberRows");
        const hint = body.querySelector("#workspaceCreateMemberHint");
        const addButton = body.querySelector("#addWorkspaceMemberBtn");
        const extraMembers = [];

        const availableActors = (selectedId = "") => {
          const selectedIds = new Set(extraMembers.map((member) => member.actorId).filter(Boolean));
          return state.actors.filter((actor) => {
            if (actor.actor_id === creatorId) {
              return false;
            }
            return !selectedIds.has(actor.actor_id) || actor.actor_id === selectedId;
          });
        };

        const renderRows = () => {
          const creator = actorMeta(creatorId);
          rows.innerHTML = `
            <tr>
              <td>
                <div class="row-meta">
                  <strong>${escapeHtml(creator.title)}</strong>
                  <span>${escapeHtml(creator.subtitle || "创建者")}</span>
                </div>
              </td>
              <td><span class="status-pill">owner</span></td>
              <td></td>
            </tr>
            ${extraMembers
              .map((member, index) => `
                <tr data-role="workspace-member-row">
                  <td>
                    <select data-role="workspace-member-actor" data-index="${index}">
                      ${actorOptions({
                        excludeIds: extraMembers
                          .filter((_, candidateIndex) => candidateIndex !== index)
                          .map((candidate) => candidate.actorId),
                        selectedId: member.actorId,
                      })}
                    </select>
                  </td>
                  <td>
                    <select data-role="workspace-member-permission" data-index="${index}">
                      ${permissionOptions(MEMBER_PERMISSIONS, member.permission)}
                    </select>
                  </td>
                  <td>
                    <div class="manager-actions workspace-create-row-actions">
                      <button type="button" data-action="remove-workspace-member" data-index="${index}" class="secondary">移除</button>
                    </div>
                  </td>
                </tr>
              `)
              .join("")}
          `;

          hint.textContent = availableActors().length
            ? "可继续添加成员，并为每位成员设置 read、write 或 owner 权限。"
            : "没有可添加的新成员了。";
          addButton.disabled = !availableActors().length;

          rows.querySelectorAll('[data-role="workspace-member-actor"]').forEach((select) => {
            select.addEventListener("change", () => {
              const index = Number(select.dataset.index);
              extraMembers[index].actorId = select.value;
              renderRows();
            });
          });

          rows.querySelectorAll('[data-role="workspace-member-permission"]').forEach((select) => {
            select.addEventListener("change", () => {
              const index = Number(select.dataset.index);
              extraMembers[index].permission = select.value;
            });
          });

          rows.querySelectorAll('[data-action="remove-workspace-member"]').forEach((button) => {
            button.addEventListener("click", () => {
              extraMembers.splice(Number(button.dataset.index), 1);
              renderRows();
            });
          });
        };

        addButton.addEventListener("click", () => {
          const nextActor = availableActors()[0];
          if (!nextActor) {
            toast("没有可添加的新成员");
            return;
          }
          extraMembers.push({ actorId: nextActor.actor_id, permission: "read" });
          renderRows();
        });

        body.querySelector('[name="name"]')?.select();
        renderRows();
      },
    },
  );
}

function openNewFolderModal() {
  openModal(
    `<h2>新建文件夹</h2><label><span>名称</span><input name="name" required /></label>`,
    async (form) => {
      const name = form.get("name");
      const path = state.currentPath ? `${state.currentPath}/${name}` : name;
      await api("/api/folders", {
        method: "POST",
        body: { workspace: state.currentWorkspace, path },
      });
      toast("文件夹已创建");
      await loadFiles();
    },
  );
}

function openNewTextModal() {
  openModal(
    `<h2>新建文本文件</h2><label><span>文件名</span><input name="name" required placeholder="note.md" /></label>`,
    async (form) => {
      const name = form.get("name");
      const path = state.currentPath ? `${state.currentPath}/${name}` : name;
      await api("/api/files/text", {
        method: "POST",
        body: { workspace: state.currentWorkspace, path, content: "" },
      });
      toast("文件已创建");
      await loadFiles();
    },
  );
}

async function uploadSelectedFile(file, { reload = true, notify = true, preserveDetail = false } = {}) {
  let uploaded;
  let overwritten = false;
  try {
    uploaded = await requestFileUpload(file);
  } catch (error) {
    if (error.status === 409 && error.message === "destination path already exists") {
      const confirmed = await confirmOverwriteUpload(file);
      if (!confirmed) {
        if (notify) {
          toast(`已取消覆盖 ${file.name}`);
        }
        return { skipped: true, overwritten: false, uploaded: null };
      }
      uploaded = await requestFileUpload(file, { overwrite: true });
      overwritten = true;
    } else {
      throw error;
    }
  }
  if (notify) {
    toast(`${overwritten ? "已覆盖" : "已上传"} ${file.name}`);
  }
  if (reload) {
    await loadFiles({ preserveDetail });
  }
  return { skipped: false, overwritten, uploaded };
}

async function uploadFiles(fileList) {
  if (!canUploadHere()) return;
  const files = Array.from(fileList || []).filter((file) => file && file.name);
  if (!files.length) return;
  state.isUploading = true;
  syncUploadDock();
  let uploadedCount = 0;
  let overwrittenCount = 0;
  let skippedCount = 0;
  try {
    for (const file of files) {
      const result = await uploadSelectedFile(file, { reload: false, notify: false });
      if (!result || result.skipped) {
        skippedCount += 1;
        continue;
      }
      if (result.overwritten) {
        overwrittenCount += 1;
      } else {
        uploadedCount += 1;
      }
    }
    if (uploadedCount || overwrittenCount) {
      await loadFiles({ preserveDetail: !$("detailPane").classList.contains("hidden") });
    }
    const summary = [];
    if (uploadedCount) {
      summary.push(uploadedCount === 1 && files.length === 1 ? `已上传 ${files[0].name}` : `新上传 ${uploadedCount} 个文件`);
    }
    if (overwrittenCount) {
      summary.push(overwrittenCount === 1 && files.length === 1 ? `已覆盖 ${files[0].name}` : `覆盖 ${overwrittenCount} 个文件`);
    }
    if (skippedCount) {
      summary.push(skippedCount === 1 && files.length === 1 ? `已取消覆盖 ${files[0].name}` : `跳过 ${skippedCount} 个文件`);
    }
    if (summary.length) {
      toast(summary.join("，"));
    }
  } catch (error) {
    toast(error.message);
  } finally {
    state.isUploading = false;
    state.dragDepth = 0;
    toggleDropOverlay(false);
    syncUploadDock();
    $("fileInput").value = "";
  }
}

async function openWorkspaceMembersManager({ skipRouteSync = false, replaceRoute = false } = {}) {
  if (!state.currentWorkspace) return;
  if (!canManageWorkspaceMembers()) {
    toast("只有共享空间支持空间管理");
    return;
  }
  state.activeView = "workspace-members";
  state.managerMode = "workspace-members";
  state.managerContext = { workspace: state.currentWorkspace };
  showManagerView();
  const payload = await api(`/api/workspaces/${encodeURIComponent(state.currentWorkspace)}/members`);
  const memberIds = payload.members.map((member) => member.actor_id);
  const canDeleteWorkspace = Boolean(
    state.actor?.is_admin
      || payload.members.some(
        (member) => member.actor_id === state.actor?.actor_id && member.permission === "owner",
      )
  );
  $("managerBody").innerHTML = `
    <div class="manager-stack">
      <section class="manager-section">
        <div class="section-head">
          <div>
            <h2>空间管理</h2>
            <p>在这里可以维护共享空间成员，也可以删除整个共享空间。</p>
          </div>
          <button id="createWorkspaceMemberBtn" type="button">添加成员</button>
        </div>
      </section>

      <section class="manager-section">
        <div class="section-head">
          <div>
            <h2>现有成员</h2>
            <p>可以直接修改成员权限，或者移出当前空间。</p>
          </div>
        </div>
        ${payload.members.length ? `
          <table class="manager-table">
            <thead>
              <tr>
                <th>成员</th>
                <th>权限</th>
                <th>加入时间</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${payload.members
                .map((member) => `
                  <tr data-actor-id="${escapeHtml(member.actor_id)}">
                    <td>
                      <div class="row-meta">
                        <strong>${escapeHtml(member.actor_id)}</strong>
                        <span>${escapeHtml(member.display_name)} · ${escapeHtml(member.kind)}</span>
                      </div>
                    </td>
                    <td><select name="permission">${permissionOptions(MEMBER_PERMISSIONS, member.permission)}</select></td>
                    <td>${formatDate(member.created_at)}</td>
                    <td>
                      <div class="manager-actions">
                        <button type="button" data-action="save-member">保存</button>
                        <button type="button" data-action="delete-member" class="secondary">移除</button>
                      </div>
                    </td>
                  </tr>
                `)
                .join("")}
            </tbody>
          </table>
        ` : `<div class="empty-panel">当前空间还没有额外成员。</div>`}
      </section>

      <section class="manager-section">
        <div class="section-head">
          <div>
            <h2>删除空间</h2>
            <p>删除后会移除该共享空间的成员、分享记录、公开链接以及空间内文件，此操作不可恢复。</p>
          </div>
        </div>
        ${canDeleteWorkspace
            ? `<div class="manager-actions"><button id="deleteWorkspaceBtn" type="button" class="danger-button">删除共享空间</button></div>`
          : `<p class="field-hint">只有该空间的 owner 或管理员可以删除共享空间。</p>`}
      </section>
    </div>
  `;

  $("createWorkspaceMemberBtn").addEventListener("click", () => {
    if (!actorOptions({ excludeIds: memberIds })) {
      toast("没有可添加的新成员");
      return;
    }
    openModal(
      `
        <h2>添加成员</h2>
        <label>
          <span>成员</span>
          <select name="actor_id">${actorOptions({ excludeIds: memberIds })}</select>
        </label>
        <label>
          <span>权限</span>
          <select name="permission">${permissionOptions(MEMBER_PERMISSIONS, "read")}</select>
        </label>
      `,
      async (form) => {
        await api(`/api/workspaces/${encodeURIComponent(state.currentWorkspace)}/members`, {
          method: "POST",
          body: {
            actor_id: form.get("actor_id"),
            permission: form.get("permission"),
          },
        });
        toast("成员已添加");
        await refreshShellPreservingWorkspace();
        await refreshCurrentManager();
      },
      { confirmLabel: "添加成员" },
    );
  });

  $("managerBody").querySelectorAll('[data-action="save-member"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      await api(`/api/workspaces/${encodeURIComponent(state.currentWorkspace)}/members`, {
        method: "POST",
        body: {
          actor_id: row.dataset.actorId,
          permission: row.querySelector('[name="permission"]').value,
        },
      });
      toast("成员已更新");
      await refreshShellPreservingWorkspace();
      await refreshCurrentManager();
    });
  });

  $("managerBody").querySelectorAll('[data-action="delete-member"]').forEach((button) => {
    button.addEventListener("click", () => {
      const row = button.closest("tr");
      openModal(
        `<h2>移除成员</h2><p>确认将 ${escapeHtml(row.dataset.actorId)} 移出 ${escapeHtml(state.currentWorkspace)}？</p>`,
        async () => {
          await api(`/api/workspaces/${encodeURIComponent(state.currentWorkspace)}/members/${encodeURIComponent(row.dataset.actorId)}`, {
            method: "DELETE",
          });
          toast("成员已移除");
          await refreshShellPreservingWorkspace();
          await refreshCurrentManager();
        },
      );
    });
  });

  if (canDeleteWorkspace) {
    $("deleteWorkspaceBtn").addEventListener("click", () => {
      const workspaceName = state.currentWorkspace;
      openModal(
        `<h2>删除共享空间</h2><p>确认删除 ${escapeHtml(workspaceName)}？空间成员、文件、分享记录和公开链接都会一起删除。</p>`,
        async () => {
          await api(`/api/workspaces/${encodeURIComponent(workspaceName)}`, {
            method: "DELETE",
          });
          await loadShell({ skipContentLoad: true });
          toast("共享空间已删除");
          await openFileListView({ replaceRoute: true });
        },
        { confirmLabel: "删除", confirmVariant: "danger" },
      );
    });
  }
  if (!skipRouteSync) {
    syncRoute({ replace: replaceRoute });
  }
}

async function openActorManager({ skipRouteSync = false, replaceRoute = false } = {}) {
  state.activeView = "actor-admin";
  state.managerMode = "actor-admin";
  state.managerContext = {};
  showManagerView();
  const payload = await api("/api/actors?include_inactive=true");
  $("managerBody").innerHTML = `
    <div class="manager-stack">
      <section class="manager-section">
        <div class="section-head">
          <div>
            <h2>用户管理</h2>
          </div>
          <button id="createActorBtn" type="button">创建成员</button>
        </div>
      </section>

      <section class="manager-section">
        <div class="section-head">
          <div>
            <h2>现有成员</h2>
            <p>支持更新显示名称、管理员状态、启用状态和彻底删除；用户可直接设置新密码，Agent token 支持隐藏和显示查看。</p>
          </div>
        </div>
        ${payload.actors.length ? `
          <table class="manager-table">
            <thead>
              <tr>
                <th>成员</th>
                <th>显示名称</th>
                <th>权限状态</th>
                <th>凭证</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${payload.actors
                .map((actor) => `
                  <tr data-actor-id="${escapeHtml(actor.actor_id)}" data-kind="${escapeHtml(actor.kind)}">
                    <td>
                      <div class="row-meta">
                        <strong>${escapeHtml(actor.actor_id)}</strong>
                      </div>
                    </td>
                    <td><input name="display_name" value="${escapeHtml(actor.display_name)}" /></td>
                    <td>
                      <div class="manager-inline-status actor-status-row">
                        <label class="toggle-row actor-admin-toggle">
                          <span>管理员</span>
                          <input name="is_admin" type="checkbox"${actor.is_admin ? " checked" : ""} />
                        </label>
                        <span class="status-pill${actor.is_active ? "" : " inactive"}">${actor.is_active ? "active" : "inactive"}</span>
                      </div>
                    </td>
                    <td>
                      ${actor.kind === "user"
                        ? `
                          <input
                            name="password"
                            type="password"
                            placeholder="输入新密码以更新"
                            autocomplete="new-password"
                          />
                        `
                        : `
                          <div class="token-visibility-field">
                            <input
                              class="token-visibility-input"
                              name="token"
                              type="password"
                              value="${escapeHtml(actor.token || "")}"
                              data-original-token="${escapeHtml(actor.token || "")}"
                              placeholder="${escapeHtml(actor.token ? "" : "当前 token 不可恢复，可直接填入新 token")}"
                              spellcheck="false"
                              autocomplete="off"
                            />
                            <button type="button" data-action="toggle-token-visibility" class="token-visibility-toggle secondary" aria-label="显示 token" title="显示 token">
                              ${renderSvgIcon("eye")}
                            </button>
                          </div>
                        `}
                    </td>
                    <td>
                      <div class="manager-actions actor-row-actions">
                        <button type="button" data-action="save-actor">保存</button>
                        <button type="button" data-action="toggle-actor" class="secondary">${actor.is_active ? "停用" : "启用"}</button>
                        <button type="button" data-action="delete-actor" class="danger-button">删除</button>
                      </div>
                    </td>
                  </tr>
                `)
                .join("")}
            </tbody>
          </table>
        ` : `<div class="empty-panel">暂无成员数据。</div>`}
      </section>
    </div>
  `;

  $("createActorBtn").addEventListener("click", () => {
    openModal(
      `
        <h2>创建成员</h2>
        <label>
          <span>类型</span>
          <select name="kind">
            <option value="user">人类用户</option>
            <option value="agent">Agent</option>
          </select>
        </label>
        <label>
          <span>账号或 Agent 名称</span>
          <input name="name" required />
        </label>
        <label>
          <span>显示名称</span>
          <input name="display_name" required />
        </label>
        <label id="createPasswordField">
          <span>密码</span>
          <input name="password" type="password" />
        </label>
        <label id="createTokenField" class="hidden">
          <span>Agent Token</span>
          <input name="token" />
        </label>
        <label class="toggle-row">
          <span>管理员</span>
          <input name="is_admin" type="checkbox" />
        </label>
      `,
      async (form) => {
        const kind = form.get("kind");
        const name = String(form.get("name") || "").trim();
        const displayName = String(form.get("display_name") || "").trim();
        const body = {
          kind,
          display_name: displayName,
          is_admin: form.get("is_admin") === "on",
        };
        if (kind === "user") {
          body.username = name;
          body.password = String(form.get("password") || "");
        } else {
          body.actor_id = name.startsWith("agent:") ? name : `agent:${name}`;
          const token = String(form.get("token") || "").trim();
          if (token) body.token = token;
        }
        const created = await api("/api/actors", { method: "POST", body });
        toast("成员已创建");
        await refreshShellPreservingWorkspace({ reloadFiles: false });
        await refreshCurrentManager();
        if (created.token) {
          openModal(`<h2>Agent Token</h2><div class="token-box">${escapeHtml(created.token)}</div>`, async () => {}, {
            confirmLabel: "关闭",
            cancelLabel: "关闭",
          });
        }
      },
      {
        confirmLabel: "创建成员",
        onReady: ({ body }) => {
          const toggleCreateFields = () => {
            const kind = body.querySelector('[name="kind"]').value;
            body.querySelector('#createPasswordField').classList.toggle('hidden', kind !== 'user');
            body.querySelector('#createTokenField').classList.toggle('hidden', kind !== 'agent');
          };
          toggleCreateFields();
          body.querySelector('[name="kind"]').addEventListener('change', toggleCreateFields);
        },
      },
    );
  });

  $("managerBody").querySelectorAll('[data-action="toggle-token-visibility"]').forEach((button) => {
    const input = button.closest(".token-visibility-field")?.querySelector('[name="token"]');
    if (!input) return;
    syncTokenVisibilityToggle(button, input);
    button.addEventListener("click", () => {
      input.type = input.type === "password" ? "text" : "password";
      syncTokenVisibilityToggle(button, input);
    });
  });

  $("managerBody").querySelectorAll('[data-action="save-actor"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      const body = {
        display_name: row.querySelector('[name="display_name"]').value.trim(),
        is_admin: row.querySelector('[name="is_admin"]').checked,
      };
      if (row.dataset.kind === "user") {
        const passwordField = row.querySelector('[name="password"]');
        const nextPassword = passwordField.value.trim();
        if (nextPassword) {
          body.password = nextPassword;
        }
      } else {
        const tokenField = row.querySelector('[name="token"]');
        const nextToken = tokenField.value.trim();
        const originalToken = tokenField.dataset.originalToken || "";
        if (nextToken && nextToken !== originalToken) {
          body.token = nextToken;
        }
      }
      await api(`/api/actors/${encodeURIComponent(row.dataset.actorId)}`, {
        method: "PATCH",
        body,
      });
      toast("成员已更新");
      await refreshShellPreservingWorkspace({ reloadFiles: false });
      await refreshCurrentManager();
    });
  });

  $("managerBody").querySelectorAll('[data-action="toggle-actor"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      const shouldEnable = button.textContent.trim() === "启用";
      await api(`/api/actors/${encodeURIComponent(row.dataset.actorId)}`, {
        method: "PATCH",
        body: { is_active: shouldEnable },
      });
      toast(shouldEnable ? "成员已启用" : "成员已停用");
      await refreshShellPreservingWorkspace({ reloadFiles: false });
      await refreshCurrentManager();
    });
  });

  $("managerBody").querySelectorAll('[data-action="delete-actor"]').forEach((button) => {
    button.addEventListener("click", () => {
      const row = button.closest("tr");
      const actorId = row.dataset.actorId;
      openModal(
        `<h2>删除成员</h2><p>确认彻底删除 ${escapeHtml(actorId)}？其登录凭证会失效，私有空间和其中的文件也会一起删除。</p>`,
        async () => {
          await api(`/api/actors/${encodeURIComponent(actorId)}`, {
            method: "DELETE",
          });
          toast("成员已删除");
          if (actorId === state.actor?.actor_id) {
            state.actor = null;
            window.history.replaceState(null, "", "/");
            await bootstrap();
            return;
          }
          await refreshShellPreservingWorkspace({ reloadFiles: false });
          await refreshCurrentManager();
        },
        { confirmLabel: "删除", confirmVariant: "danger" },
      );
    });
  });
  if (!skipRouteSync) {
    syncRoute({ replace: replaceRoute });
  }
}

async function openProfileManager({ skipRouteSync = false, replaceRoute = false } = {}) {
  state.activeView = "profile";
  state.managerMode = "profile";
  state.managerContext = {};
  showManagerView();
  $("managerBody").innerHTML = `
    <div class="manager-stack compact">
      <section class="manager-section">
        <div class="section-head compact">
          <div>
            <h2>个人设置</h2>
            <p>账号当前只读，可修改显示名称和登录密码。</p>
          </div>
        </div>
        <form id="profileForm" class="manager-form">
          <label>
            <span>账号</span>
            <input value="${escapeHtml(state.actor.username || state.actor.actor_id)}" readonly />
          </label>
          <label>
            <span>身份类型</span>
            <input value="${escapeHtml(state.actor.kind)}" readonly />
          </label>
          <label>
            <span>显示名称</span>
            <input name="display_name" value="${escapeHtml(state.actor.display_name || "")}" />
          </label>
          <label>
            <span>新密码</span>
            <input name="password" type="password" placeholder="留空则不修改密码" />
          </label>
          <label>
            <span>确认新密码</span>
            <input name="password_confirm" type="password" placeholder="再次输入新密码" />
          </label>
          <div class="manager-actions profile-form-actions">
            <button type="submit" class="profile-submit-button">保存设置</button>
          </div>
        </form>
      </section>
    </div>
  `;

  $("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const passwordConfirm = String(form.get("password_confirm") || "");
    if (password && password !== passwordConfirm) {
      toast("两次输入的新密码不一致");
      return;
    }
    const body = { display_name: String(form.get("display_name") || "").trim() };
    if (password) {
      body.password = password;
    }
    const payload = await api("/api/me", { method: "PATCH", body });
    state.actor = payload.actor;
    $("actorLabel").textContent = state.actor.display_name || state.actor.actor_id;
    toast("个人设置已保存");
    await openProfileManager();
  });
  if (!skipRouteSync) {
    syncRoute({ replace: replaceRoute });
  }
}

function bindEvents() {
  const workspaceSwitcher = $("workspaceSwitcher");
  const workspaceSearchInput = $("workspaceSearchInput");

  $("previewModal").addEventListener("close", resetPreviewDialog);
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("loginError").textContent = "";
    const form = new FormData(event.currentTarget);
    try {
      const payload = await api("/api/login", {
        method: "POST",
        body: { username: form.get("username"), password: form.get("password") },
      });
      state.actor = payload.actor;
      await loadShell({ skipContentLoad: true });
      showApp();
      await restoreRouteFromLocation();
    } catch (error) {
      $("loginError").textContent = error.message;
    }
  });
  $("logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    showLogin();
  });
  $("newGroupBtn").addEventListener("click", openNewGroupModal);
  $("fileListNavBtn").addEventListener("click", openFileListView);
  $("folderBtn").addEventListener("click", openNewFolderModal);
  $("textBtn").addEventListener("click", openNewTextModal);
  $("sharedNavBtn").addEventListener("click", openSharedManager);
  $("shareManagerNavBtn").addEventListener("click", openShareManager);
  $("spaceManagerNavBtn").addEventListener("click", openWorkspaceMembersManager);
  $("adminBtn").addEventListener("click", openActorManager);
  $("profileNavBtn").addEventListener("click", openProfileManager);
  $("saveTextBtn").addEventListener("click", saveEditor);
  $("closeDetailBtn").addEventListener("click", closeDetail);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".action-menu")) {
      closeAllActionMenus();
    }
    if (workspaceSwitcher.open && !event.target.closest(".workspace-switcher")) {
      workspaceSwitcher.open = false;
    }
  });
  workspaceSearchInput.addEventListener("input", (event) => {
    state.workspaceQuery = event.currentTarget.value;
    renderWorkspaces();
  });
  workspaceSwitcher.addEventListener("toggle", () => {
    if (workspaceSwitcher.open) {
      window.requestAnimationFrame(() => workspaceSearchInput.focus());
      return;
    }
    if (!state.workspaceQuery) return;
    state.workspaceQuery = "";
    workspaceSearchInput.value = "";
    renderWorkspaces();
  });
  $("fileSearchInput").addEventListener("input", (event) => {
    state.fileQuery = event.currentTarget.value;
    state.page = 1;
    renderRows(state.currentItems);
    renderSortHeaders();
    syncRoute({ replace: true });
  });
  $("pageSizeSelect").addEventListener("change", (event) => {
    state.pageSize = normalizePageSize(event.currentTarget.value);
    state.page = 1;
    renderRows(state.currentItems);
    renderSortHeaders();
    syncRoute({ replace: true });
  });
  document.querySelectorAll(".sort-header").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.dataset.sortField;
      if (state.sortField === field) {
        state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
      } else {
        state.sortField = field;
        state.sortDirection = defaultSortDirection(field);
      }
      state.page = 1;
      renderRows(state.currentItems);
      renderSortHeaders();
      syncRoute({ replace: true });
    });
  });
  $("firstPageBtn").addEventListener("click", () => {
    state.page = 1;
    renderRows(state.currentItems);
    syncRoute({ replace: true });
  });
  $("prevPageBtn").addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    renderRows(state.currentItems);
    syncRoute({ replace: true });
  });
  $("nextPageBtn").addEventListener("click", () => {
    const { totalPages } = getVisibleFileState();
    state.page = Math.min(totalPages, state.page + 1);
    renderRows(state.currentItems);
    syncRoute({ replace: true });
  });
  $("lastPageBtn").addEventListener("click", () => {
    const { totalPages } = getVisibleFileState();
    state.page = totalPages;
    renderRows(state.currentItems);
    syncRoute({ replace: true });
  });
  $("uploadBtn").addEventListener("click", () => $("fileInput").click());
  $("uploadDropzone").addEventListener("click", () => {
    if (!state.isUploading) {
      $("fileInput").click();
    }
  });
  $("fileInput").addEventListener("change", async (event) => {
    const files = Array.from(event.currentTarget.files || []);
    if (files.length) {
      await uploadFiles(files);
    }
  });
  document.addEventListener("dragenter", (event) => {
    if (!eventHasFiles(event) || !canUploadHere()) return;
    event.preventDefault();
    state.dragDepth += 1;
    toggleDropOverlay(true);
  });
  document.addEventListener("dragover", (event) => {
    if (!eventHasFiles(event) || !canUploadHere()) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    toggleDropOverlay(true);
  });
  document.addEventListener("dragleave", (event) => {
    if (!eventHasFiles(event) || !canUploadHere()) return;
    state.dragDepth = Math.max(0, state.dragDepth - 1);
    if (state.dragDepth === 0) {
      toggleDropOverlay(false);
    }
  });
  document.addEventListener("drop", async (event) => {
    if (!eventHasFiles(event) || !canUploadHere()) return;
    event.preventDefault();
    state.dragDepth = 0;
    toggleDropOverlay(false);
    await uploadFiles(event.dataTransfer.files);
  });
  window.addEventListener("popstate", async () => {
    if (!state.actor) return;
    try {
      await restoreRouteFromLocation();
    } catch (error) {
      toast(error.message);
    }
  });
}

bindEvents();
bootstrap();
