export class PreviewController {
  constructor({
    state,
    getById,
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
    pdfModuleUrl,
    pdfWorkerUrl,
  }) {
    this.state = state;
    this.getById = getById;
    this.api = api;
    this.escapeHtml = escapeHtml;
    this.renderSvgIcon = renderSvgIcon;
    this.formatDuration = formatDuration;
    this.previewUrl = previewUrl;
    this.toAbsoluteUrl = toAbsoluteUrl;
    this.openHtmlPreview = openHtmlPreview;
    this.downloadItem = downloadItem;
    this.syncUploadDock = syncUploadDock;
    this.closeManager = closeManager;
    this.closeAllActionMenus = closeAllActionMenus;
    this.loadFiles = loadFiles;
    this.canEditItem = canEditItem;
    this.toast = toast;
    this.pdfModuleUrl = pdfModuleUrl;
    this.pdfWorkerUrl = pdfWorkerUrl;
    this.pdfJsPromise = null;
  }

  runCleanup() {
    if (typeof this.state.previewCleanup === "function") {
      try {
        this.state.previewCleanup();
      } catch {
        // Cleanup should not block future previews.
      }
    }
    this.state.previewCleanup = null;
  }

  resetDialog() {
    this.runCleanup();
    this.state.currentItem = null;
    this.state.editorPath = null;
    this.getById("contentGrid").classList.remove("detail-open");
    this.getById("detailPane").classList.add("hidden");
    this.getById("detailModeLabel").textContent = "详情";
    this.getById("previewTitle").textContent = "预览";
    this.getById("previewOpenBtn").classList.add("hidden");
    this.getById("previewOpenBtn").onclick = null;
    this.getById("saveTextBtn").classList.add("hidden");
    this.getById("previewBody").className = "preview-body preview-modal-body empty-state";
    this.getById("previewBody").textContent = "点击文件的预览或编辑按钮后在这里查看内容";
    this.syncUploadDock();
  }

  isOpen() {
    return Boolean(this.getById("previewModal")?.open);
  }

  close() {
    if (this.isOpen()) {
      this.getById("previewModal").close();
      return;
    }
    this.resetDialog();
  }

  openShell(modeLabel, title, options = {}) {
    this.closeManager();
    this.closeAllActionMenus();
    this.runCleanup();
    this.getById("contentGrid").classList.remove("detail-open");
    this.getById("detailPane").classList.add("hidden");
    this.getById("detailModeLabel").textContent = modeLabel;
    this.getById("previewTitle").textContent = title;
    this.getById("previewBody").className = "preview-body preview-modal-body";
    this.getById("previewBody").innerHTML = "";
    this.getById("saveTextBtn").classList.add("hidden");
    if (options.externalHref) {
      this.getById("previewOpenBtn").classList.remove("hidden");
      this.getById("previewOpenBtn").onclick = () => {
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
      this.getById("previewOpenBtn").classList.add("hidden");
      this.getById("previewOpenBtn").onclick = null;
    }
    if (!this.isOpen()) {
      this.getById("previewModal").showModal();
    }
  }

  async previewItem(item) {
    await this.previewItemForWorkspace(this.state.currentWorkspace, item);
  }

  async previewItemForWorkspace(workspace, item) {
    this.state.currentItem = item;
    this.state.editorPath = null;
    const src = this.previewUrl(workspace, item.path);
    if (item.preview_type === "html") {
      this.runCleanup();
      if (this.isOpen()) {
        this.getById("previewModal").close();
      }
      this.openHtmlPreview(workspace, item.path);
      return;
    }
    this.openShell("预览", item.path, { externalHref: src });
    const previewBody = this.getById("previewBody");
    if (item.preview_type === "image") {
      previewBody.innerHTML = `<img src="${src}" alt="${this.escapeHtml(item.name)}" />`;
      return;
    }
    if (item.preview_type === "video") {
      previewBody.innerHTML = `<video src="${src}" controls></video>`;
      return;
    }
    if (item.preview_type === "audio") {
      previewBody.innerHTML = `
        <section class="audio-preview-shell">
          <section class="audio-player-panel">
            <audio id="audioPlayer" class="audio-native-element" src="${src}" preload="metadata"></audio>
            <button id="audioPlayBtn" class="audio-play-button" type="button" aria-label="播放">
              ${this.renderSvgIcon("play")}
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
      this.state.previewCleanup = this.createAudioPreview(
        previewBody.querySelector("#audioPlayer"),
        previewBody.querySelector("#audioVisualizer"),
        previewBody,
      );
      return;
    }
    if (item.preview_type === "pdf") {
      previewBody.innerHTML = `
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
      this.state.previewCleanup = this.createPdfPreview(src, previewBody);
      return;
    }
    if (item.preview_type === "markdown") {
      const params = new URLSearchParams({ workspace, path: item.path });
      const html = await this.api(`/api/files/markdown?${params.toString()}`);
      previewBody.innerHTML = `<div class="markdown-preview">${html}</div>`;
      return;
    }
    if (item.preview_type === "text") {
      const text = await this.loadText(item.path, workspace);
      previewBody.innerHTML = `<pre class="text-preview">${this.escapeHtml(text)}</pre>`;
      return;
    }
    previewBody.innerHTML = `
      <div class="empty-state">
        <button id="previewDownloadBtn" type="button">下载 ${this.escapeHtml(item.name)}</button>
      </div>
    `;
    this.getById("previewDownloadBtn").addEventListener("click", async () => {
      try {
        await this.downloadItem(item, workspace);
      } catch (error) {
        this.toast(error.message);
      }
    });
  }

  async editItem(item) {
    if (!this.canEditItem(item)) return;
    this.state.currentItem = item;
    this.openShell("编辑", item.path);
    const text = await this.loadText(item.path);
    this.getById("previewBody").innerHTML = `<textarea class="editor" id="textEditor" spellcheck="false">${this.escapeHtml(text)}</textarea>`;
    this.enableEditor(item.path);
  }

  async loadText(path, workspace = this.state.currentWorkspace) {
    const params = new URLSearchParams({ workspace, path });
    const payload = await this.api(`/api/files/text?${params.toString()}`);
    return payload.content;
  }

  enableEditor(path) {
    this.state.editorPath = path;
    this.getById("saveTextBtn").classList.toggle("hidden", this.state.currentPermission !== "write");
  }

  async saveEditor() {
    const editor = this.getById("textEditor");
    if (!editor || !this.state.editorPath) return;
    const item = this.state.currentItem;
    await this.api("/api/files/text", {
      method: "POST",
      body: {
        workspace: this.state.currentWorkspace,
        path: this.state.editorPath,
        content: editor.value,
      },
    });
    this.toast("已保存");
    await this.loadFiles({ preserveDetail: true });
    if (item) {
      await this.editItem(item);
    }
  }

  async getPdfJs() {
    if (!this.pdfJsPromise) {
      this.pdfJsPromise = import(this.pdfModuleUrl).then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = this.pdfWorkerUrl;
        return pdfjs;
      });
    }
    return this.pdfJsPromise;
  }

  resizeVisualizerCanvas(canvas) {
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

  createAudioVisualizer(audio, canvas) {
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
      const { ctx, width, height } = this.resizeVisualizerCanvas(canvas);
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

  createAudioPreview(audio, canvas, root) {
    const visualizerCleanup = this.createAudioVisualizer(audio, canvas);
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
      currentTimeLabel.textContent = this.formatDuration(currentTime);
      durationLabel.textContent = this.formatDuration(duration);
      playButton.innerHTML = this.renderSvgIcon(audio.paused ? "play" : "pause");
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

  createPdfPreview(src, root) {
    const status = root.querySelector("#pdfPreviewStatus");
    const pages = root.querySelector("#pdfPreviewPages");
    let disposed = false;
    let loadingTask = null;
    const renderTasks = new Set();
    const showError = (message) => {
      status.textContent = "PDF 预览失败";
      pages.innerHTML = `<div class="empty-panel pdf-preview-error">${this.escapeHtml(message)}</div>`;
    };
    const renderPage = async (pdf, pageNumber) => {
      const page = await pdf.getPage(pageNumber);
      if (disposed) return;
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
      const renderTask = page.render({ canvasContext: context, viewport: renderViewport });
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
        const pdfjs = await this.getPdfJs();
        if (disposed) return;
        loadingTask = pdfjs.getDocument({
          url: this.toAbsoluteUrl(src),
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
          if (disposed) break;
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
}