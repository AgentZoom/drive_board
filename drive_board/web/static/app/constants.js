export const DEFAULT_PAGE_SIZE = 20;
export const ALLOWED_PAGE_SIZES = new Set([10, 20, 50, 100]);
export const ROUTE_PREFIX = "/app";
export const PDFJS_MODULE_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
export const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.mjs";

export const EDITABLE_PREVIEW_TYPES = new Set(["html", "markdown", "text"]);
export const MEMBER_PERMISSIONS = ["read", "write", "owner"];
export const NAME_COLLATOR = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
export const CODE_EXTENSIONS = new Set([
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

export const ICONS = {
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