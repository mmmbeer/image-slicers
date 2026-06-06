const baseParts = [
  { key: "corner_tl", label: "Corner TL", tag: "top-left" },
  { key: "edge_top", label: "Top", tag: "stretch X" },
  { key: "corner_tr", label: "Corner TR", tag: "top-right" },
  { key: "edge_left", label: "Left", tag: "stretch Y" },
  { key: "center", label: "Center", tag: "texture" },
  { key: "edge_right", label: "Right", tag: "stretch Y" },
  { key: "corner_bl", label: "Corner BL", tag: "bottom-left" },
  { key: "edge_bottom", label: "Bottom", tag: "stretch X" },
  { key: "corner_br", label: "Corner BR", tag: "bottom-right" },
];

const fadeParts = [
  { key: "edge_top_fade", label: "Top Fade", tag: "overlay" },
  { key: "edge_left_fade", label: "Left Fade", tag: "overlay" },
  { key: "edge_right_fade", label: "Right Fade", tag: "overlay" },
  { key: "edge_bottom_fade", label: "Bottom Fade", tag: "overlay" },
];

export const nineSlicerTool = {
  id: "nine-slicer",
  name: "Nine Slicer",
  description: "Create 9-slice and optional 13-slice border assets from raster images.",
  create(context) {
    return new NineSlicer(context);
  },
};

class NineSlicer {
  constructor(context) {
    this.context = context;
    this.asset = null;
    this.dragMode = null;
    this.pointerId = null;
    this.partCanvases = new Map();
  }

  mount(root) {
    this.root = root;
    root.innerHTML = `
      <div class="tool-layout">
        <section class="editor-pane">
          <div class="pane-title">
            <h2>Preview</h2>
            <span>Drag guide lines</span>
          </div>
          <div class="canvas-stage"><canvas data-role="preview"></canvas></div>
          <div class="panel" style="padding: 12px;">
            <div class="pane-title">
              <h2>Extracted Parts</h2>
              <span data-role="part-count">0 files</span>
            </div>
            <div class="thumb-grid" data-role="thumbs" style="margin-top: 12px;"></div>
          </div>
        </section>
        <aside class="settings-pane">
          <div class="control-group">
            <h3>Output</h3>
            <div class="field">
              <label for="ns-prefix">Name prefix</label>
              <input id="ns-prefix" data-role="prefix" type="text" value="frame_" />
            </div>
          </div>
          <div class="control-group">
            <h3>Slice Thickness</h3>
            <div class="field-grid">
              <div class="field"><label for="ns-left">Left</label><input id="ns-left" data-role="left" type="number" min="0" step="1" value="16" /></div>
              <div class="field"><label for="ns-right">Right</label><input id="ns-right" data-role="right" type="number" min="0" step="1" value="16" /></div>
              <div class="field"><label for="ns-top">Top</label><input id="ns-top" data-role="top" type="number" min="0" step="1" value="16" /></div>
              <div class="field"><label for="ns-bottom">Bottom</label><input id="ns-bottom" data-role="bottom" type="number" min="0" step="1" value="16" /></div>
            </div>
            <label class="toggle"><input data-role="snap" type="checkbox" checked /> Snap guides to pixels</label>
          </div>
          <div class="control-group">
            <h3>13-Slice Fade Edges</h3>
            <label class="toggle"><input data-role="fade-enabled" type="checkbox" /> Generate faded edge variants</label>
            <div class="field-grid">
              <div class="field"><label for="ns-fade-width">Fade width</label><input id="ns-fade-width" data-role="fade-width" type="number" min="1" step="1" value="16" /></div>
              <div class="field"><label for="ns-fade-mode">Fade mode</label><select id="ns-fade-mode" data-role="fade-mode"><option value="inside">Inward</option><option value="both">Both sides</option></select></div>
            </div>
          </div>
          <div class="warning" data-role="warning"></div>
        </aside>
      </div>
    `;

    this.preview = root.querySelector('[data-role="preview"]');
    this.previewContext = this.preview.getContext("2d");
    this.thumbs = root.querySelector('[data-role="thumbs"]');
    this.partCount = root.querySelector('[data-role="part-count"]');
    this.warning = root.querySelector('[data-role="warning"]');
    this.inputs = {
      prefix: root.querySelector('[data-role="prefix"]'),
      left: root.querySelector('[data-role="left"]'),
      right: root.querySelector('[data-role="right"]'),
      top: root.querySelector('[data-role="top"]'),
      bottom: root.querySelector('[data-role="bottom"]'),
      snap: root.querySelector('[data-role="snap"]'),
      fadeEnabled: root.querySelector('[data-role="fade-enabled"]'),
      fadeWidth: root.querySelector('[data-role="fade-width"]'),
      fadeMode: root.querySelector('[data-role="fade-mode"]'),
    };

    for (const input of [this.inputs.left, this.inputs.right, this.inputs.top, this.inputs.bottom]) {
      input.addEventListener("input", () => this.onSlicesChanged());
      input.addEventListener("change", () => this.onSlicesChanged());
    }
    for (const input of [this.inputs.snap, this.inputs.prefix, this.inputs.fadeWidth, this.inputs.fadeMode]) {
      input.addEventListener("input", () => this.render());
      input.addEventListener("change", () => this.render());
    }
    this.inputs.fadeEnabled.addEventListener("change", () => {
      this.ensureThumbGrid();
      this.render();
    });

    this.preview.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.preview.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.preview.addEventListener("pointerup", (event) => this.endDrag(event));
    this.preview.addEventListener("pointercancel", (event) => this.endDrag(event));
    this.preview.addEventListener("pointerleave", () => {
      if (!this.dragMode) this.preview.style.cursor = "default";
    });
    this.ensureThumbGrid();
  }

  unmount() {
    this.root = null;
  }

  loadImage(asset) {
    this.asset = asset;
    let { L, R, T, B } = this.getSlices();
    if (L + R >= asset.width || T + B >= asset.height) {
      L = Math.max(1, Math.floor(asset.width * 0.2));
      R = L;
      T = Math.max(1, Math.floor(asset.height * 0.2));
      B = T;
    }
    this.setSlices(this.clampSlices(L, R, T, B));
    this.ensureThumbGrid();
    this.render();
  }

  reset() {
    if (!this.asset) return;
    const size = Math.max(1, Math.floor(Math.min(this.asset.width, this.asset.height) * 0.18));
    this.setSlices(this.clampSlices(size, size, size, size));
    this.inputs.fadeEnabled.checked = false;
    this.inputs.fadeWidth.value = "16";
    this.inputs.fadeMode.value = "inside";
    this.ensureThumbGrid();
    this.render();
  }

  getExportItems() {
    if (!this.asset || this.getIssues().length) return [];
    const prefix = this.fileSafePrefix();
    const parts = this.getParts();
    const imageItems = parts.map((part) => ({
      filename: `${prefix}${part.key}.png`,
      type: "image/png",
      getBlob: () => this.context.canvasUtils.canvasToBlob(this.partCanvases.get(part.key), "image/png"),
    }));
    return [
      ...imageItems,
      {
        filename: `${prefix}slice_manifest.json`,
        type: "application/json",
        getBlob: async () => new Blob([JSON.stringify(this.getManifest(parts, prefix), null, 2)], { type: "application/json" }),
      },
    ];
  }

  getParts() {
    return this.inputs.fadeEnabled.checked ? [...baseParts, ...fadeParts] : [...baseParts];
  }

  ensureThumbGrid() {
    if (!this.thumbs) return;
    this.thumbs.innerHTML = "";
    this.partCanvases.clear();
    const parts = this.getParts();
    this.partCount.textContent = `${parts.length + 1} files`;

    for (const part of parts) {
      const wrap = document.createElement("div");
      wrap.className = "thumb";
      wrap.innerHTML = `<div class="thumb-title"><span>${part.label}</span><span class="tag">${part.tag}</span></div>`;
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      wrap.append(canvas);
      this.thumbs.append(wrap);
      this.partCanvases.set(part.key, canvas);
    }
  }

  getSlices() {
    if (!this.asset) return { L: 0, R: 0, T: 0, B: 0 };
    return this.clampSlices(
      Number(this.inputs.left.value || 0),
      Number(this.inputs.right.value || 0),
      Number(this.inputs.top.value || 0),
      Number(this.inputs.bottom.value || 0),
    );
  }

  setSlices({ L, R, T, B }) {
    this.inputs.left.value = String(L);
    this.inputs.right.value = String(R);
    this.inputs.top.value = String(T);
    this.inputs.bottom.value = String(B);
  }

  clampSlices(L, R, T, B) {
    const width = this.asset?.width || 0;
    const height = this.asset?.height || 0;
    L = Math.max(0, Math.min(L, width));
    R = Math.max(0, Math.min(R, width));
    T = Math.max(0, Math.min(T, height));
    B = Math.max(0, Math.min(B, height));
    if (L + R > width) {
      const over = L + R - width;
      if (L >= R) L -= over;
      else R -= over;
    }
    if (T + B > height) {
      const over = T + B - height;
      if (T >= B) T -= over;
      else B -= over;
    }
    return {
      L: Math.max(0, Math.round(L)),
      R: Math.max(0, Math.round(R)),
      T: Math.max(0, Math.round(T)),
      B: Math.max(0, Math.round(B)),
    };
  }

  getRects() {
    const { L, R, T, B } = this.getSlices();
    const width = this.asset.width;
    const height = this.asset.height;
    const x1 = L;
    const x2 = width - R;
    const y1 = T;
    const y2 = height - B;
    return {
      corner_tl: { sx: 0, sy: 0, sw: L, sh: T },
      edge_top: { sx: x1, sy: 0, sw: x2 - x1, sh: T },
      corner_tr: { sx: x2, sy: 0, sw: R, sh: T },
      edge_left: { sx: 0, sy: y1, sw: L, sh: y2 - y1 },
      center: { sx: x1, sy: y1, sw: x2 - x1, sh: y2 - y1 },
      edge_right: { sx: x2, sy: y1, sw: R, sh: y2 - y1 },
      corner_bl: { sx: 0, sy: y2, sw: L, sh: B },
      edge_bottom: { sx: x1, sy: y2, sw: x2 - x1, sh: B },
      corner_br: { sx: x2, sy: y2, sw: R, sh: B },
    };
  }

  getIssues() {
    if (!this.asset) return ["No image loaded."];
    const { L, R, T, B } = this.getSlices();
    const issues = [];
    if (L + R >= this.asset.width) issues.push("Left and right slices leave no center width.");
    if (T + B >= this.asset.height) issues.push("Top and bottom slices leave no center height.");
    return issues;
  }

  onSlicesChanged() {
    if (!this.asset) return;
    let { L, R, T, B } = this.getSlices();
    if (this.inputs.snap.checked) {
      L = Math.round(L);
      R = Math.round(R);
      T = Math.round(T);
      B = Math.round(B);
    }
    this.setSlices(this.clampSlices(L, R, T, B));
    this.render();
  }

  render() {
    if (!this.asset || !this.preview) {
      this.context.setDirtyState();
      return;
    }
    this.drawPreview();
    this.updateParts();
    const issues = this.getIssues();
    this.warning.textContent = issues.join(" ");
    this.warning.classList.toggle("visible", issues.length > 0);
    this.context.setDirtyState();
  }

  drawPreview() {
    const { image, width, height } = this.asset;
    const fit = this.context.canvasUtils.fitSize(width, height, 960, 620);
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    this.preview.style.width = `${fit.width}px`;
    this.preview.style.height = `${fit.height}px`;
    this.preview.width = Math.floor(fit.width * dpr);
    this.preview.height = Math.floor(fit.height * dpr);
    const ctx = this.previewContext;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.preview.width, this.preview.height);
    ctx.scale(dpr, dpr);
    ctx.drawImage(image, 0, 0, width, height, 0, 0, fit.width, fit.height);

    const { L, R, T, B } = this.getSlices();
    const x1 = L * fit.scale;
    const x2 = (width - R) * fit.scale;
    const y1 = T * fit.scale;
    const y2 = (height - B) * fit.scale;

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, x1, fit.height);
    ctx.fillRect(x2, 0, fit.width - x2, fit.height);
    ctx.fillRect(x1, 0, x2 - x1, y1);
    ctx.fillRect(x1, y2, x2 - x1, fit.height - y2);
    ctx.restore();

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ff5964";
    ctx.beginPath();
    ctx.moveTo(x1, 0);
    ctx.lineTo(x1, fit.height);
    ctx.moveTo(x2, 0);
    ctx.lineTo(x2, fit.height);
    ctx.moveTo(0, y1);
    ctx.lineTo(fit.width, y1);
    ctx.moveTo(0, y2);
    ctx.lineTo(fit.width, y2);
    ctx.stroke();
    ctx.fillStyle = "#ff5964";
    ctx.fillRect(x1 - 4, fit.height / 2 - 4, 8, 8);
    ctx.fillRect(x2 - 4, fit.height / 2 - 4, 8, 8);
    ctx.fillRect(fit.width / 2 - 4, y1 - 4, 8, 8);
    ctx.fillRect(fit.width / 2 - 4, y2 - 4, 8, 8);
    ctx.restore();
  }

  updateParts() {
    const rects = this.getRects();
    for (const part of baseParts) {
      const canvas = this.partCanvases.get(part.key);
      if (!canvas) continue;
      const rect = rects[part.key];
      this.drawSliceToCanvas(canvas, rect);
    }

    if (this.inputs.fadeEnabled.checked) {
      const fadeWidth = Math.max(1, Number(this.inputs.fadeWidth.value || 1));
      const mode = this.inputs.fadeMode.value === "both" ? "both" : "inside";
      this.copyCanvas(this.makeFadedEdge(this.partCanvases.get("edge_top"), "down", fadeWidth, mode), this.partCanvases.get("edge_top_fade"));
      this.copyCanvas(this.makeFadedEdge(this.partCanvases.get("edge_left"), "right", fadeWidth, mode), this.partCanvases.get("edge_left_fade"));
      this.copyCanvas(this.makeFadedEdge(this.partCanvases.get("edge_right"), "left", fadeWidth, mode), this.partCanvases.get("edge_right_fade"));
      this.copyCanvas(this.makeFadedEdge(this.partCanvases.get("edge_bottom"), "up", fadeWidth, mode), this.partCanvases.get("edge_bottom_fade"));
    }
  }

  drawSliceToCanvas(canvas, { sx, sy, sw, sh }) {
    canvas.width = Math.max(1, sw);
    canvas.height = Math.max(1, sh);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (sw > 0 && sh > 0) {
      ctx.drawImage(this.asset.image, sx, sy, sw, sh, 0, 0, sw, sh);
    }
  }

  copyCanvas(source, target) {
    target.width = source.width;
    target.height = source.height;
    const ctx = target.getContext("2d");
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(source, 0, 0);
  }

  makeFadedEdge(source, direction, fadePx, mode) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0);
    ctx.globalCompositeOperation = "destination-in";

    const w = canvas.width;
    const h = canvas.height;
    const horizontal = direction === "left" || direction === "right";
    const maxFade = horizontal ? w : h;
    const fade = Math.max(1, Math.min(fadePx, maxFade));
    const gradient = horizontal ? ctx.createLinearGradient(0, 0, w, 0) : ctx.createLinearGradient(0, 0, 0, h);
    const t = fade / maxFade;

    if (direction === "down" || direction === "right") {
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(Math.min(1, t), "rgba(255,255,255,0)");
      gradient.addColorStop(1, mode === "both" ? "rgba(255,255,255,1)" : "rgba(255,255,255,0)");
    } else {
      gradient.addColorStop(0, mode === "both" ? "rgba(255,255,255,1)" : "rgba(255,255,255,0)");
      gradient.addColorStop(Math.max(0, 1 - t), "rgba(255,255,255,0)");
      gradient.addColorStop(1, "rgba(255,255,255,1)");
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    return canvas;
  }

  getPointer(event) {
    const rect = this.preview.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
  }

  pickGuide(x, y, width, height) {
    if (!this.asset) return null;
    const { L, R, T, B } = this.getSlices();
    const scale = Math.min(width / this.asset.width, height / this.asset.height, 1);
    const candidates = [
      { mode: "v1", d: Math.abs(x - L * scale) },
      { mode: "v2", d: Math.abs(x - (this.asset.width - R) * scale) },
      { mode: "h1", d: Math.abs(y - T * scale) },
      { mode: "h2", d: Math.abs(y - (this.asset.height - B) * scale) },
    ].filter((item) => item.d <= 8);
    candidates.sort((a, b) => a.d - b.d);
    return candidates[0]?.mode || null;
  }

  onPointerMove(event) {
    if (!this.asset) return;
    const pos = this.getPointer(event);

    if (this.dragMode && event.pointerId === this.pointerId) {
      const scale = Math.min(pos.width / this.asset.width, pos.height / this.asset.height, 1);
      let { L, R, T, B } = this.getSlices();
      if (this.dragMode === "v1") L = pos.x / scale;
      if (this.dragMode === "v2") R = this.asset.width - pos.x / scale;
      if (this.dragMode === "h1") T = pos.y / scale;
      if (this.dragMode === "h2") B = this.asset.height - pos.y / scale;
      this.setSlices(this.clampSlices(L, R, T, B));
      this.render();
      return;
    }

    const mode = this.pickGuide(pos.x, pos.y, pos.width, pos.height);
    this.preview.style.cursor = mode?.startsWith("v") ? "ew-resize" : mode ? "ns-resize" : "default";
  }

  onPointerDown(event) {
    if (!this.asset) return;
    const pos = this.getPointer(event);
    const mode = this.pickGuide(pos.x, pos.y, pos.width, pos.height);
    if (!mode) return;
    this.dragMode = mode;
    this.pointerId = event.pointerId;
    this.preview.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  endDrag(event) {
    if (!this.dragMode || (this.pointerId !== null && event.pointerId !== this.pointerId)) return;
    this.dragMode = null;
    this.pointerId = null;
    this.preview.style.cursor = "default";
  }

  fileSafePrefix() {
    return String(this.inputs.prefix.value || "").trim().replace(/[^\w-]+/g, "_");
  }

  getManifest(parts, prefix) {
    const { L, R, T, B } = this.getSlices();
    return {
      source: {
        width: this.asset.width,
        height: this.asset.height,
        fileName: this.asset.fileName,
      },
      slices: { left: L, right: R, top: T, bottom: B },
      mode: this.inputs.fadeEnabled.checked ? "13-slice" : "9-slice",
      fadeEdges: this.inputs.fadeEnabled.checked
        ? { enabled: true, width: Math.max(1, Number(this.inputs.fadeWidth.value || 1)), mode: this.inputs.fadeMode.value }
        : { enabled: false },
      parts: parts.map((part) => ({ key: part.key, file: `${prefix}${part.key}.png` })),
    };
  }
}
