import {
  DEFAULT_PAGE_SIZE,
  EDITABLE_PREVIEW_TYPES,
  ICONS,
  MEMBER_PERMISSIONS,
  NAME_COLLATOR,
  PDFJS_MODULE_URL,
  PDFJS_WORKER_URL,
} from "./app/constants.js";
import { RouteController } from "./app/routing/RouteController.js";
import { UploadProgressController } from "./app/upload/UploadProgressController.js";
import { formatDate, formatDuration, formatPercent, formatSize, formatSpeed } from "./app/utils/formatters.js";
import { createPathHelpers } from "./app/utils/path-helpers.js";
import {
  downloadUrl,
  previewUrl,
  publicLinksApiUrl,
  toAbsoluteUrl,
  workspacePublicLinksApiUrl,
} from "./app/utils/url.js";
import { PreviewController } from "./app/preview/PreviewController.js";

let routeExtension = null;

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
  uploadTracker: null,
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

const {
  buildDestinationPath,
  fileExtension,
  fileIconMarkup,
  folderBreadcrumbMarkup,
  isDescendantOrSamePath,
  joinRelativePath,
  leafName,
  normalizePathInput,
  parentFolderPath,
  suggestCopyPath,
  typeKey,
  typeLabel,
} = createPathHelpers({ escapeHtml, renderSvgIcon });

const uploadProgress = new UploadProgressController({ state, getById: $, escapeHtml });
const routeController = new RouteController({
  state,
  getExtension: () => routeExtension,
  normalizePathInput,
});
const previewController = new PreviewController({
  state,
  getById: $,
  api,
  escapeHtml,
  renderSvgIcon,
  formatDuration,
  previewUrl,
  toAbsoluteUrl,
  openHtmlPreview,
  downloadItem,
  syncUploadDock,
  closeManager,
  closeAllActionMenus,
  loadFiles,
  canEditItem,
  toast,
  pdfModuleUrl: PDFJS_MODULE_URL,
  pdfWorkerUrl: PDFJS_WORKER_URL,
});

function resetPreviewDialog() {
  previewController.resetDialog();
}

async function previewItem(item) {
  await previewController.previewItem(item);
}

async function previewItemForWorkspace(workspace, item) {
  await previewController.previewItemForWorkspace(workspace, item);
}

async function saveEditor() {
  await previewController.saveEditor();
}

function buildAppUrl() {
  return routeController.buildUrl();
}

function syncRoute({ replace = false } = {}) {
  return routeController.sync({ replace });
}

function parseAppRoute() {
  return routeController.parseRoute();
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

function normalizePageSize(value) {
  return routeController.normalizePageSize(value);
}

function ensureStylesheet(href) {
  if (!href || document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}

function extensionContext() {
  return {
    state,
    api,
    escapeHtml,
    renderSvgIcon,
    toast,
    openModal,
    syncRoute,
    showManagerView,
    refreshShellPreservingWorkspace,
    bootstrap,
  };
}

async function loadRouteExtension() {
  if (routeExtension) {
    return routeExtension;
  }
  const modulePath = document.body.dataset.extensionModule;
  if (!modulePath) {
    return null;
  }
  ensureStylesheet(document.body.dataset.extensionStyle || "");
  const module = await import(modulePath);
  routeExtension = module.installExtension(extensionContext());
  return routeExtension;
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

function applyFileRoutePreferences(route = null) {
  const preferences = routeController.fileRoutePreferences(route);
  state.fileQuery = preferences.fileQuery;
  state.sortField = preferences.sortField;
  state.sortDirection = preferences.sortDirection;
  state.page = preferences.page;
  state.pageSize = preferences.pageSize;
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
      case "actor-admin": {
        const extension = await loadRouteExtension();
        if (extension?.openActorManager) {
          await extension.openActorManager({ skipRouteSync: true });
          break;
        }
        await openFileListView({ skipRouteSync: true, preserveDetail: true });
        break;
      }
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
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall back to a manual copy path when Clipboard API is unavailable.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("copy failed");
  }
}

function currentWorkspaceInfo() {
  return state.workspaces.find((workspace) => workspace.name === state.currentWorkspace) || null;
}

function isFileListView() {
  return state.activeView === "files";
}

function activeNavButtonId() {
  const extensionButtonId = routeExtension?.activeNavButtonId?.(state);
  if (extensionButtonId) {
    return extensionButtonId;
  }
  switch (state.activeView) {
    case "shared":
      return "sharedNavBtn";
    case "share-manager":
      return "shareManagerNavBtn";
    case "workspace-members":
      return "spaceManagerNavBtn";
    case "profile":
      return "profileNavBtn";
    case "files":
    default:
      return "fileListNavBtn";
  }
}

function updateSidebarNav() {
  const activeId = activeNavButtonId();
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.id === activeId);
  });
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
  return routeController.defaultSortDirection(field);
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
  const summary = uploadProgress.summary();
  title.textContent = state.isUploading ? "正在上传" : (summary ? "继续上传" : "拖拽上传");
  hint.textContent = state.isUploading
    ? `${summary ? `${summary.processedFiles}/${summary.totalFiles} 个文件 · ${formatPercent(summary.percent)} · 实时 ${formatSpeed(summary.overallSpeed)}` : "文件上传中，请稍候"}`
    : `拖拽文件到这里，或点击选择文件，上传到 ${state.currentWorkspace}/${state.currentPath || ""}`;
  uploadProgress.render();
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
    const submenu = menu.querySelector(".action-submenu");
    submenu?.classList.remove("open-upward");
    if (submenu) {
      submenu.style.top = "";
      submenu.style.left = "";
    }
  });
}

function positionActionMenu(menu) {
  if (!menu) return;
  const submenu = menu.querySelector(".action-submenu");
  if (!submenu) return;

  submenu.classList.remove("open-upward");
  submenu.style.top = "";
  submenu.style.left = "";

  const viewportPadding = 12;
  const gap = 8;
  const menuRect = menu.getBoundingClientRect();
  const submenuWidth = submenu.offsetWidth;
  const submenuHeight = submenu.offsetHeight;
  const availableBelow = window.innerHeight - viewportPadding - menuRect.bottom - gap;
  const availableAbove = menuRect.top - viewportPadding - gap;
  const shouldOpenUpward = submenuHeight > availableBelow && availableAbove > availableBelow;

  const top = shouldOpenUpward
    ? Math.max(viewportPadding, menuRect.top - submenuHeight - gap)
    : Math.min(window.innerHeight - viewportPadding - submenuHeight, menuRect.bottom + gap);
  const left = Math.min(
    Math.max(viewportPadding, menuRect.right - submenuWidth),
    window.innerWidth - viewportPadding - submenuWidth,
  );

  submenu.classList.toggle("open-upward", shouldOpenUpward);
  submenu.style.top = `${Math.round(top)}px`;
  submenu.style.left = `${Math.round(left)}px`;
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
  window.location.replace("/");
}

function showApp() {
}

async function bootstrap() {
  try {
    const session = await api("/api/session");
    if (session.actor) {
      state.actor = session.actor;
      await loadRouteExtension();
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
  previewController.close();
}

async function editItem(item) {
  await previewController.editItem(item);
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
      try {
        await copyText(button.dataset.publicLinkUrl);
        toast("公开链接已复制");
      } catch {
        toast("复制失败，请手动复制输入框里的链接");
      }
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
  } else if (state.managerMode === "profile") {
    await openProfileManager();
  } else if (routeExtension && await routeExtension.refreshManager?.(state.managerMode)) {
    return;
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

async function uploadSelectedFile(file, { index = -1, reload = true, notify = true, preserveDetail = false } = {}) {
  let uploaded;
  let overwritten = false;
  try {
    uploadProgress.startFile(index);
    uploaded = await uploadProgress.requestFileUpload(file, {
      onProgress: ({ loaded }) => uploadProgress.updateFile(index, loaded),
    });
  } catch (error) {
    if (error.status === 409 && error.message === "destination path already exists") {
      if (index > -1) {
        const trackedFile = state.uploadTracker?.files?.[index];
        if (trackedFile) {
          trackedFile.loaded = 0;
          trackedFile.message = "等待覆盖确认";
          trackedFile.status = "queued";
          uploadProgress.render();
        }
      }
      const confirmed = await confirmOverwriteUpload(file);
      if (!confirmed) {
        uploadProgress.finishFile(index, "skipped", "已跳过");
        if (notify) {
          toast(`已取消覆盖 ${file.name}`);
        }
        return { skipped: true, overwritten: false, uploaded: null };
      }
      uploadProgress.startFile(index);
      uploaded = await uploadProgress.requestFileUpload(file, {
        overwrite: true,
        onProgress: ({ loaded }) => uploadProgress.updateFile(index, loaded),
      });
      overwritten = true;
    } else {
      uploadProgress.failFile(index, error.message || "上传失败");
      throw error;
    }
  }
  uploadProgress.finishFile(index, overwritten ? "overwritten" : "done", overwritten ? "已覆盖" : "已完成");
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
  state.uploadTracker = uploadProgress.createTracker(files);
  syncUploadDock();
  let uploadedCount = 0;
  let overwrittenCount = 0;
  let skippedCount = 0;
  try {
    for (const [index, file] of files.entries()) {
      const result = await uploadSelectedFile(file, { index, reload: false, notify: false });
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
    uploadProgress.markFinished();
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
          toast("共享空间已删除");
          await loadShell({ skipContentLoad: true });
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
  const adminBtn = $("adminBtn");

  $("previewModal").addEventListener("close", resetPreviewDialog);
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
  adminBtn?.addEventListener("click", () => {
    window.location.assign(adminBtn.dataset.route || "/app/admin/actors");
  });
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
  $("uploadProgressCloseBtn").addEventListener("click", () => {
    if (uploadProgress.clear()) {
      syncUploadDock();
    }
  });
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
