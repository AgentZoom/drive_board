import { CODE_EXTENSIONS } from "../constants.js";

export function createPathHelpers({ escapeHtml, renderSvgIcon, codeExtensions = CODE_EXTENSIONS } = {}) {
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
    if (item.preview_type === "text" && codeExtensions.has(fileExtension(item.path || item.name))) {
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

  return {
    normalizePathInput,
    leafName,
    parentFolderPath,
    joinRelativePath,
    fileExtension,
    typeKey,
    typeLabel,
    fileIconMarkup,
    suggestCopyPath,
    isDescendantOrSamePath,
    buildDestinationPath,
    folderBreadcrumbMarkup,
  };
}