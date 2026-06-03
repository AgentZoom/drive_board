import { formatPercent, formatSize, formatSpeed } from "../utils/formatters.js";

export class UploadProgressController {
  constructor({ state, getById, escapeHtml }) {
    this.state = state;
    this.getById = getById;
    this.escapeHtml = escapeHtml;
  }

  createTracker(files) {
    return {
      startedAt: Date.now(),
      finishedAt: null,
      totalBytes: files.reduce((sum, file) => sum + Math.max(0, Number(file.size) || 0), 0),
      speed: 0,
      files: files.map((file, index) => ({
        id: `${Date.now()}-${index}`,
        name: file.name,
        size: Math.max(0, Number(file.size) || 0),
        loaded: 0,
        speed: 0,
        averageSpeed: 0,
        status: "queued",
        message: "排队中",
        startedAt: null,
        completedAt: null,
        lastLoaded: 0,
        lastProgressAt: null,
      })),
    };
  }

  summary() {
    const tracker = this.state.uploadTracker;
    if (!tracker) return null;
    const totalFiles = tracker.files.length;
    const processedFiles = tracker.files.filter((file) => ["done", "overwritten", "skipped"].includes(file.status)).length;
    const failedFiles = tracker.files.filter((file) => file.status === "error").length;
    const totalLoaded = tracker.files.reduce((sum, file) => sum + Math.min(file.loaded || 0, file.size || 0), 0);
    const percent = tracker.totalBytes > 0 ? (totalLoaded / tracker.totalBytes) * 100 : totalFiles ? (processedFiles / totalFiles) * 100 : 0;
    const finishedAt = tracker.finishedAt || Date.now();
    const elapsedSeconds = Math.max((finishedAt - tracker.startedAt) / 1000, 0.001);
    const overallAverageSpeed = totalLoaded > 0 ? totalLoaded / elapsedSeconds : 0;
    const activeIndex = tracker.files.findIndex((file) => file.status === "uploading");
    return {
      totalFiles,
      processedFiles,
      failedFiles,
      totalLoaded,
      percent,
      overallSpeed: tracker.speed || 0,
      overallAverageSpeed,
      activeIndex,
    };
  }

  render() {
    const panel = this.getById("uploadProgressPanel");
    const fileList = this.getById("uploadFileList");
    const closeButton = this.getById("uploadProgressCloseBtn");
    const tracker = this.state.uploadTracker;
    if (!panel || !fileList || !closeButton) return;
    if (!tracker?.files?.length) {
      panel.classList.add("hidden");
      fileList.innerHTML = "";
      fileList.dataset.count = "0";
      closeButton.disabled = true;
      return;
    }
    panel.classList.remove("hidden");
    closeButton.disabled = this.state.isUploading;
    this.ensureRows(tracker);
    const summary = this.summary();
    if (!summary) return;
    const title = this.state.isUploading
      ? `正在上传 ${summary.activeIndex > -1 ? `${summary.activeIndex + 1}/${summary.totalFiles}` : `${summary.processedFiles}/${summary.totalFiles}`}`
      : summary.failedFiles
        ? "上传已中断"
        : "上传完成";
    this.getById("uploadOverallTitle").textContent = title;
    this.getById("uploadOverallStats").textContent = `${summary.processedFiles} / ${summary.totalFiles} 个文件`;
    this.getById("uploadOverallPercent").textContent = formatPercent(summary.percent);
    this.getById("uploadOverallSpeed").textContent = `实时 ${formatSpeed(summary.overallSpeed)}`;
    this.getById("uploadOverallAverageSpeed").textContent = `平均 ${formatSpeed(summary.overallAverageSpeed)}`;
    this.getById("uploadOverallBytes").textContent = `${formatSize(summary.totalLoaded)} / ${formatSize(tracker.totalBytes)}`;
    this.getById("uploadOverallBarFill").style.width = `${Math.max(0, Math.min(100, summary.percent))}%`;
    tracker.files.forEach((_, index) => this.updateFileRow(index));
  }

  clear() {
    if (this.state.isUploading) {
      return false;
    }
    this.state.uploadTracker = null;
    this.render();
    return true;
  }

  requestFileUpload(file, { overwrite = false, onProgress } = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/files/upload");
      xhr.responseType = "json";
      xhr.withCredentials = true;
      xhr.upload.addEventListener("progress", (event) => {
        if (!onProgress) return;
        const total = event.lengthComputable ? event.total : Math.max(0, Number(file.size) || 0);
        onProgress({ loaded: event.loaded, total });
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (onProgress) {
            onProgress({ loaded: Math.max(0, Number(file.size) || 0), total: Math.max(0, Number(file.size) || 0) });
          }
          resolve(xhr.response && typeof xhr.response === "object" ? xhr.response : JSON.parse(xhr.responseText || "null"));
          return;
        }
        const error = new Error(this.readUploadError(xhr));
        error.status = xhr.status;
        reject(error);
      });
      xhr.addEventListener("error", () => {
        const error = new Error("上传失败，网络连接异常");
        error.status = xhr.status || 0;
        reject(error);
      });
      xhr.addEventListener("abort", () => {
        const error = new Error("上传已取消");
        error.status = 0;
        reject(error);
      });
      const formData = new FormData();
      formData.set("workspace", this.state.currentWorkspace || "");
      formData.set("path", this.destinationUploadPath());
      formData.set("overwrite", overwrite ? "true" : "false");
      formData.set("file", file, file.name);
      xhr.send(formData);
    });
  }

  startFile(index) {
    const tracker = this.state.uploadTracker;
    const file = tracker?.files?.[index];
    if (!file) return;
    const now = Date.now();
    file.loaded = 0;
    file.speed = 0;
    file.averageSpeed = 0;
    file.startedAt = now;
    file.completedAt = null;
    file.lastLoaded = 0;
    file.lastProgressAt = now;
    file.status = "uploading";
    file.message = "上传中";
    tracker.speed = 0;
    this.render();
  }

  updateFile(index, loaded) {
    const tracker = this.state.uploadTracker;
    const file = tracker?.files?.[index];
    if (!file) return;
    const now = Date.now();
    const nextLoaded = Math.max(0, Math.min(file.size || 0, loaded || 0));
    const deltaBytes = Math.max(0, nextLoaded - (file.lastLoaded || 0));
    const deltaSeconds = file.lastProgressAt ? Math.max((now - file.lastProgressAt) / 1000, 0.001) : 0;
    file.loaded = nextLoaded;
    file.speed = deltaSeconds ? deltaBytes / deltaSeconds : file.speed;
    const elapsedSeconds = file.startedAt ? Math.max((now - file.startedAt) / 1000, 0.001) : 0;
    file.averageSpeed = elapsedSeconds ? file.loaded / elapsedSeconds : 0;
    file.lastLoaded = nextLoaded;
    file.lastProgressAt = now;
    tracker.speed = file.speed;
    this.render();
  }

  finishFile(index, status, message) {
    const tracker = this.state.uploadTracker;
    const file = tracker?.files?.[index];
    if (!file) return;
    const now = Date.now();
    if (["done", "overwritten"].includes(status)) {
      file.loaded = file.size;
    }
    const elapsedSeconds = file.startedAt ? Math.max((now - file.startedAt) / 1000, 0.001) : 0;
    file.averageSpeed = elapsedSeconds ? file.loaded / elapsedSeconds : file.averageSpeed;
    file.status = status;
    file.speed = 0;
    file.message = message;
    file.completedAt = now;
    tracker.speed = 0;
    this.render();
  }

  failFile(index, message) {
    const tracker = this.state.uploadTracker;
    const file = tracker?.files?.[index];
    if (!file) return;
    const now = Date.now();
    const elapsedSeconds = file.startedAt ? Math.max((now - file.startedAt) / 1000, 0.001) : 0;
    file.averageSpeed = elapsedSeconds ? file.loaded / elapsedSeconds : file.averageSpeed;
    file.status = "error";
    file.speed = 0;
    file.message = message;
    file.completedAt = now;
    tracker.speed = 0;
    this.render();
  }

  markFinished() {
    if (!this.state.uploadTracker) return;
    this.state.uploadTracker.finishedAt = Date.now();
    this.state.uploadTracker.speed = 0;
  }

  destinationUploadPath() {
    return this.state.currentPath ? `${this.state.currentPath}/` : "";
  }

  readUploadError(xhr) {
    const contentType = xhr.getResponseHeader("content-type") || "";
    if (contentType.includes("application/json") && xhr.response && typeof xhr.response === "object") {
      return xhr.response.detail || xhr.statusText || "upload failed";
    }
    if (typeof xhr.responseText === "string" && xhr.responseText.trim()) {
      try {
        return JSON.parse(xhr.responseText).detail || xhr.responseText;
      } catch {
        return xhr.responseText;
      }
    }
    return xhr.statusText || "upload failed";
  }

  ensureRows(tracker) {
    const fileList = this.getById("uploadFileList");
    if (!fileList) return;
    const count = Number(fileList.dataset.count || "0");
    if (count === tracker.files.length) {
      return;
    }
    fileList.innerHTML = tracker.files
      .map((file, index) => `
        <div id="uploadFileRow-${index}" class="upload-file-row" data-status="${this.escapeHtml(file.status)}">
          <div class="upload-file-head">
            <strong id="uploadFileName-${index}" title="${this.escapeHtml(file.name)}">${this.escapeHtml(file.name)}</strong>
            <span id="uploadFilePercent-${index}">0%</span>
          </div>
          <div class="upload-file-bar" aria-hidden="true">
            <span id="uploadFileFill-${index}" class="upload-file-fill"></span>
          </div>
          <div class="upload-file-meta">
            <span id="uploadFileBytes-${index}">0 B / ${this.escapeHtml(formatSize(file.size))}</span>
            <span id="uploadFileSpeed-${index}">实时 --</span>
            <span id="uploadFileAverageSpeed-${index}">平均 --</span>
            <span id="uploadFileStatus-${index}">排队中</span>
          </div>
        </div>
      `)
      .join("");
    fileList.dataset.count = String(tracker.files.length);
  }

  updateFileRow(index) {
    const tracker = this.state.uploadTracker;
    const file = tracker?.files?.[index];
    if (!file) return;
    const row = this.getById(`uploadFileRow-${index}`);
    if (!row) return;
    const loaded = Math.min(file.loaded || 0, file.size || 0);
    const percent = file.size > 0 ? (loaded / file.size) * 100 : (["done", "overwritten", "skipped"].includes(file.status) ? 100 : 0);
    row.dataset.status = file.status;
    this.getById(`uploadFilePercent-${index}`).textContent = formatPercent(percent);
    this.getById(`uploadFileFill-${index}`).style.width = `${Math.max(0, Math.min(100, percent))}%`;
    this.getById(`uploadFileBytes-${index}`).textContent = `${formatSize(loaded)} / ${formatSize(file.size)}`;
    this.getById(`uploadFileSpeed-${index}`).textContent = `实时 ${formatSpeed(file.speed)}`;
    this.getById(`uploadFileAverageSpeed-${index}`).textContent = `平均 ${formatSpeed(file.averageSpeed)}`;
    this.getById(`uploadFileStatus-${index}`).textContent = file.message;
  }
}