export function previewUrl(workspace, path) {
  const encodedPath = String(path || "")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `/preview/${encodeURIComponent(workspace)}/${encodedPath}`;
}

export function downloadUrl(workspace, path) {
  const params = new URLSearchParams({ workspace, path });
  return `/api/files/download?${params.toString()}`;
}

export function publicLinksApiUrl(workspace, path) {
  const params = new URLSearchParams({ workspace, path });
  return `/api/public-links?${params.toString()}`;
}

export function workspacePublicLinksApiUrl(workspace) {
  const params = new URLSearchParams({ workspace });
  return `/api/public-links?${params.toString()}`;
}

export function toAbsoluteUrl(path) {
  return new URL(path, window.location.origin).toString();
}

export function decodeRoutePart(value) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}