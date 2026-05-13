const state = {
  actor: null,
  workspaces: [],
  actors: [],
  shared: [],
  currentWorkspace: null,
  currentPath: "",
  currentPermission: "read",
  currentItem: null,
  editorPath: null,
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

function showLogin() {
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
      await loadShell();
      showApp();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

async function loadShell() {
  const [workspaces, actors, shared] = await Promise.all([
    api("/api/workspaces"),
    api("/api/actors"),
    api("/api/shared"),
  ]);
  state.workspaces = workspaces.workspaces;
  state.actors = actors.actors;
  state.shared = shared.items;
  $("actorLabel").textContent = state.actor.display_name || state.actor.actor_id;
  $("adminBtn").classList.toggle("hidden", !state.actor.is_admin);
  renderWorkspaces();
  renderShared();
  if (!state.currentWorkspace && state.workspaces.length) {
    await selectWorkspace(state.workspaces[0].name, "");
  }
}

function renderWorkspaces() {
  const list = $("workspaceList");
  list.innerHTML = "";
  for (const workspace of state.workspaces) {
    const button = document.createElement("button");
    button.className = "nav-item";
    if (state.currentWorkspace === workspace.name) button.classList.add("active");
    button.innerHTML = `
      <span>${escapeHtml(workspace.name)}</span>
      <span class="nav-pill">${workspace.kind === "private" ? "private" : workspace.permission}</span>
    `;
    button.addEventListener("click", () => selectWorkspace(workspace.name, ""));
    list.append(button);
  }
}

function renderShared() {
  const list = $("sharedList");
  list.innerHTML = "";
  if (!state.shared.length) {
    list.innerHTML = `<div class="nav-pill">暂无直接分享</div>`;
    return;
  }
  for (const item of state.shared) {
    const button = document.createElement("button");
    button.className = "nav-item";
    const label = item.path || "/";
    button.innerHTML = `
      <span>${escapeHtml(item.workspace)}/${escapeHtml(label)}</span>
      <span class="nav-pill">${escapeHtml(item.permission)}</span>
    `;
    button.addEventListener("click", async () => {
      if (item.kind === "folder") {
        await selectWorkspace(item.workspace, item.path || "");
      } else {
        await selectWorkspace(item.workspace, item.parent_path || "");
        await previewItem({
          name: item.path.split("/").pop(),
          path: item.path,
          kind: "file",
          preview_type: item.preview_type || "binary",
        });
      }
    });
    list.append(button);
  }
}

async function selectWorkspace(name, path = "") {
  state.currentWorkspace = name;
  state.currentPath = path;
  state.currentItem = null;
  renderWorkspaces();
  await loadFiles();
}

async function loadFiles() {
  if (!state.currentWorkspace) return;
  const params = new URLSearchParams({
    workspace: state.currentWorkspace,
    path: state.currentPath || "",
  });
  const payload = await api(`/api/files?${params.toString()}`);
  state.currentPermission = payload.permission;
  $("workspaceTitle").textContent = payload.workspace.name;
  $("pathLabel").textContent = `${payload.workspace.name}/${payload.path || ""}`;
  $("permissionLabel").textContent = payload.permission === "write" ? "可读写" : "只读";
  $("membersBtn").classList.toggle(
    "hidden",
    payload.workspace.kind !== "share_group" && !state.actor.is_admin,
  );
  renderBreadcrumb(payload.path || "");
  renderRows(payload.items);
  clearPreview();
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

function renderRows(items) {
  const rows = $("fileRows");
  rows.innerHTML = "";
  if (state.currentPath) {
    const parent = state.currentPath.split("/").slice(0, -1).join("/");
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><div class="file-name"><span class="file-symbol">UP</span><button>..</button></div></td>
      <td>folder</td><td></td><td></td><td></td>
    `;
    row.querySelector("button").addEventListener("click", () => selectWorkspace(state.currentWorkspace, parent));
    rows.append(row);
  }
  for (const item of items) {
    const row = document.createElement("tr");
    const symbol = item.kind === "folder" ? "DIR" : (item.preview_type || "file").slice(0, 3).toUpperCase();
    row.innerHTML = `
      <td>
        <div class="file-name">
          <span class="file-symbol">${escapeHtml(symbol)}</span>
          <button title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</button>
        </div>
      </td>
      <td>${escapeHtml(item.preview_type)}</td>
      <td>${formatSize(item.size)}</td>
      <td>${formatDate(item.modified_at)}</td>
      <td>
        <span class="row-actions">
          <button data-action="share">分享</button>
          <button data-action="delete">删除</button>
        </span>
      </td>
    `;
    row.querySelector(".file-name button").addEventListener("click", () => {
      if (item.kind === "folder") {
        selectWorkspace(state.currentWorkspace, item.path);
      } else {
        previewItem(item);
      }
    });
    row.querySelector('[data-action="share"]').addEventListener("click", (event) => {
      event.stopPropagation();
      state.currentItem = item;
      openShareModal(item.path);
    });
    row.querySelector('[data-action="delete"]').addEventListener("click", (event) => {
      event.stopPropagation();
      confirmDelete(item);
    });
    rows.append(row);
  }
}

function clearPreview() {
  state.currentItem = null;
  state.editorPath = null;
  $("saveTextBtn").classList.add("hidden");
  $("previewTitle").textContent = "预览";
  $("previewBody").className = "preview-body empty-state";
  $("previewBody").textContent = "选择文件后在这里预览";
}

async function previewItem(item) {
  state.currentItem = item;
  state.editorPath = null;
  $("previewTitle").textContent = item.path;
  $("previewBody").className = "preview-body";
  $("previewBody").innerHTML = "";
  $("saveTextBtn").classList.add("hidden");
  const src = previewUrl(state.currentWorkspace, item.path);
  if (item.preview_type === "image") {
    $("previewBody").innerHTML = `<img src="${src}" alt="${escapeHtml(item.name)}" />`;
    return;
  }
  if (item.preview_type === "video") {
    $("previewBody").innerHTML = `<video src="${src}" controls></video>`;
    return;
  }
  if (item.preview_type === "audio") {
    $("previewBody").innerHTML = `<audio src="${src}" controls></audio>`;
    return;
  }
  if (item.preview_type === "pdf") {
    $("previewBody").innerHTML = `<iframe class="preview-frame" src="${src}"></iframe>`;
    return;
  }
  if (item.preview_type === "html") {
    const text = await loadText(item.path);
    $("previewBody").innerHTML = `
      <iframe class="preview-frame" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads" src="${src}"></iframe>
      <textarea class="editor" id="textEditor" spellcheck="false">${escapeHtml(text)}</textarea>
    `;
    enableEditor(item.path);
    return;
  }
  if (item.preview_type === "markdown") {
    const params = new URLSearchParams({ workspace: state.currentWorkspace, path: item.path });
    const [html, text] = await Promise.all([
      api(`/api/files/markdown?${params.toString()}`),
      loadText(item.path),
    ]);
    $("previewBody").innerHTML = `
      <div class="markdown-preview">${html}</div>
      <textarea class="editor" id="textEditor" spellcheck="false">${escapeHtml(text)}</textarea>
    `;
    enableEditor(item.path);
    return;
  }
  if (item.preview_type === "text") {
    const text = await loadText(item.path);
    $("previewBody").innerHTML = `<textarea class="editor" id="textEditor" spellcheck="false">${escapeHtml(text)}</textarea>`;
    enableEditor(item.path);
    return;
  }
  $("previewBody").innerHTML = `
    <div class="empty-state">
      <a href="${downloadUrl(state.currentWorkspace, item.path)}">下载 ${escapeHtml(item.name)}</a>
    </div>
  `;
}

async function loadText(path) {
  const params = new URLSearchParams({ workspace: state.currentWorkspace, path });
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
  await api("/api/files/text", {
    method: "POST",
    body: {
      workspace: state.currentWorkspace,
      path: state.editorPath,
      content: editor.value,
    },
  });
  toast("已保存");
  const item = state.currentItem;
  await loadFiles();
  if (item) await previewItem(item);
}

function openModal(html, onConfirm) {
  const modal = $("modal");
  const form = $("modalForm");
  $("modalBody").innerHTML = html;
  $("modalConfirm").onclick = async (event) => {
    event.preventDefault();
    try {
      await onConfirm(new FormData(form));
      modal.close();
    } catch (error) {
      toast(error.message);
    }
  };
  modal.showModal();
}

function actorOptions() {
  return state.actors
    .filter((actor) => actor.actor_id !== state.actor.actor_id)
    .map((actor) => `<option value="${escapeHtml(actor.actor_id)}">${escapeHtml(actor.actor_id)} · ${escapeHtml(actor.display_name)}</option>`)
    .join("");
}

function openShareModal(path = state.currentPath || "") {
  openModal(
    `
      <h2>分享</h2>
      <label><span>路径</span><input name="path" value="${escapeHtml(path)}" /></label>
      <label><span>对象</span><select name="actor_id">${actorOptions()}</select></label>
      <label><span>权限</span><select name="permission"><option value="read">只读</option><option value="write">读写</option></select></label>
    `,
    async (form) => {
      await api("/api/shares", {
        method: "POST",
        body: {
          workspace: state.currentWorkspace,
          path: form.get("path"),
          actor_id: form.get("actor_id"),
          permission: form.get("permission"),
        },
      });
      toast("分享已更新");
      await loadShell();
    },
  );
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
  );
}

function openNewGroupModal() {
  openModal(
    `<h2>新建共享空间</h2><label><span>名称</span><input name="name" required placeholder="research-team" /></label>`,
    async (form) => {
      await api("/api/workspaces", {
        method: "POST",
        body: { name: form.get("name"), kind: "share_group" },
      });
      toast("共享空间已创建");
      await loadShell();
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

async function uploadSelectedFile(file) {
  const form = new FormData();
  form.append("workspace", state.currentWorkspace);
  form.append("path", state.currentPath || "");
  form.append("file", file);
  await api("/api/files/upload", { method: "POST", body: form });
  toast("上传完成");
  await loadFiles();
}

async function openMembersModal() {
  const payload = await api(`/api/workspaces/${encodeURIComponent(state.currentWorkspace)}/members`);
  const rows = payload.members
    .map((member) => `<tr><td>${escapeHtml(member.actor_id)}</td><td>${escapeHtml(member.permission)}</td></tr>`)
    .join("");
  openModal(
    `
      <h2>成员</h2>
      <table class="file-table"><tbody>${rows}</tbody></table>
      <label><span>添加成员</span><select name="actor_id">${actorOptions()}</select></label>
      <label><span>权限</span><select name="permission"><option value="read">只读</option><option value="write">读写</option></select></label>
    `,
    async (form) => {
      await api(`/api/workspaces/${encodeURIComponent(state.currentWorkspace)}/members`, {
        method: "POST",
        body: { actor_id: form.get("actor_id"), permission: form.get("permission") },
      });
      toast("成员已更新");
    },
  );
}

function openAdminModal() {
  openModal(
    `
      <h2>创建成员</h2>
      <label><span>类型</span><select name="kind"><option value="user">人类用户</option><option value="agent">Agent</option></select></label>
      <label><span>账号或 Agent 名称</span><input name="name" required /></label>
      <label><span>显示名称</span><input name="display_name" required /></label>
      <label><span>密码</span><input name="password" type="password" /></label>
      <label><span>Agent Token</span><input name="token" /></label>
    `,
    async (form) => {
      const kind = form.get("kind");
      const name = form.get("name");
      const payload = {
        kind,
        display_name: form.get("display_name"),
      };
      if (kind === "user") {
        payload.username = name;
        payload.password = form.get("password");
      } else {
        payload.actor_id = name.startsWith("agent:") ? name : `agent:${name}`;
        payload.token = form.get("token") || null;
      }
      const created = await api("/api/actors", { method: "POST", body: payload });
      await loadShell();
      if (created.token) {
        openModal(
          `<h2>Agent Token</h2><div class="token-box">${escapeHtml(created.token)}</div>`,
          async () => {},
        );
      } else {
        toast("成员已创建");
      }
    },
  );
}

function bindEvents() {
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
      await loadShell();
      showApp();
    } catch (error) {
      $("loginError").textContent = error.message;
    }
  });
  $("logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    showLogin();
  });
  $("newGroupBtn").addEventListener("click", openNewGroupModal);
  $("folderBtn").addEventListener("click", openNewFolderModal);
  $("textBtn").addEventListener("click", openNewTextModal);
  $("shareBtn").addEventListener("click", () => openShareModal(state.currentItem?.path || state.currentPath || ""));
  $("membersBtn").addEventListener("click", openMembersModal);
  $("adminBtn").addEventListener("click", openAdminModal);
  $("saveTextBtn").addEventListener("click", saveEditor);
  $("uploadBtn").addEventListener("click", () => $("fileInput").click());
  $("fileInput").addEventListener("change", async (event) => {
    const file = event.currentTarget.files[0];
    if (file) await uploadSelectedFile(file);
    event.currentTarget.value = "";
  });
}

bindEvents();
bootstrap();
