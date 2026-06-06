const STAGE_SIZE = 512;

export const iconSheetTool = {
  id: "icon-sheet",
  name: "Icon Sheet",
  description: "Compose one icon or extract a grid of consistently sized PNG icons.",
  create(context) {
    return new IconSheet(context);
  },
};

class IconSheet {
  constructor(context) {
    this.context = context;
    this.asset = null;
    this.mode = "single";
    this.stage = null;
    this.layer = null;
    this.guideLayer = null;
    this.transformer = null;
    this.konvaImage = null;
    this.gridPreviewCanvas = null;
    this.gridAdjustments = new Map();
    this.gridBaseAdjustment = { offsetX: 0, offsetY: 0 };
    this.selectedCellIndex = null;
    this.gridDrag = null;
    this.renderTimer = 0;
  }

  mount(root) {
    this.root = root;
    root.innerHTML = `
      <div class="tool-layout">
        <section class="editor-pane">
          <div class="pane-title">
            <h2 data-role="preview-title">Single Icon</h2>
            <span data-role="source-info">No image loaded</span>
          </div>
          <div class="canvas-stage">
            <div data-role="konva-stage" style="width:${STAGE_SIZE}px; height:${STAGE_SIZE}px;"></div>
            <canvas data-role="grid-preview" hidden></canvas>
            <div class="grid-zoom-popover" data-role="grid-zoom-popover" hidden>
              <label for="is-cell-zoom">Zoom</label>
              <input id="is-cell-zoom" data-role="cell-zoom" type="range" min="0.5" max="4" step="0.01" value="1" />
            </div>
          </div>
          <div class="panel" style="padding: 12px;">
            <div class="pane-title">
              <h2>Export Preview</h2>
              <span data-role="export-count">0 files</span>
            </div>
            <div class="preview-grid" data-role="previews" style="margin-top: 12px;"></div>
          </div>
        </section>
        <aside class="settings-pane">
          <div class="control-group">
            <h3>Mode</h3>
            <div class="segmented">
              <button data-mode="single" class="active" type="button">Single</button>
              <button data-mode="grid" type="button">Grid</button>
            </div>
          </div>
          <div class="control-group">
            <h3>Output</h3>
            <div class="field">
              <label for="is-prefix">Name prefix</label>
              <input id="is-prefix" data-role="prefix" type="text" value="icon_" />
            </div>
            <div class="field">
              <label for="is-size">Size</label>
              <select id="is-size" data-role="size">
                <option value="32">32</option>
                <option value="64">64</option>
                <option value="128" selected>128</option>
                <option value="256">256</option>
                <option value="512">512</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div class="field" data-role="custom-size-wrap" hidden>
              <label for="is-custom-size">Custom size</label>
              <input id="is-custom-size" data-role="custom-size" type="number" min="8" max="2048" step="1" value="128" />
            </div>
          </div>
          <div class="control-group" data-role="single-controls">
            <h3>Transform</h3>
            <div class="field"><label for="is-scale">Scale</label><input id="is-scale" data-role="scale" type="range" min="0.05" max="4" step="0.01" value="1" /></div>
            <div class="field"><label for="is-rotation">Rotation</label><input id="is-rotation" data-role="rotation" type="range" min="-180" max="180" step="1" value="0" /></div>
            <div class="button-row">
              <button data-action="flip-x" type="button">Flip X</button>
              <button data-action="flip-y" type="button">Flip Y</button>
              <button data-action="rotate-90" type="button">Rotate 90</button>
              <button data-action="center" type="button">Center</button>
              <button data-action="reset" type="button">Reset</button>
            </div>
            <h3 style="margin-top: 14px;">Filters</h3>
            <div class="field"><label for="is-brightness">Brightness</label><input id="is-brightness" data-role="brightness" type="range" min="-1" max="1" step="0.05" value="0" /></div>
            <div class="field"><label for="is-contrast">Contrast</label><input id="is-contrast" data-role="contrast" type="range" min="-100" max="100" step="1" value="0" /></div>
            <div class="field"><label for="is-saturation">Saturation</label><input id="is-saturation" data-role="saturation" type="range" min="-1" max="1" step="0.05" value="0" /></div>
            <div class="field"><label for="is-hue">Hue</label><input id="is-hue" data-role="hue" type="range" min="0" max="360" step="1" value="0" /></div>
            <div class="field"><label for="is-blur">Blur</label><input id="is-blur" data-role="blur" type="range" min="0" max="12" step="0.5" value="0" /></div>
            <div class="field"><label for="is-pixel">Pixelate</label><input id="is-pixel" data-role="pixel" type="range" min="1" max="32" step="1" value="1" /></div>
          </div>
          <div class="control-group" data-role="grid-controls" hidden>
            <h3>Grid Extraction</h3>
            <div class="field-grid">
              <div class="field"><label for="is-rows">Rows</label><input id="is-rows" data-role="rows" type="number" min="1" max="64" step="1" value="3" /></div>
              <div class="field"><label for="is-cols">Columns</label><input id="is-cols" data-role="cols" type="number" min="1" max="64" step="1" value="3" /></div>
              <div class="field"><label for="is-spacing">Spacing</label><input id="is-spacing" data-role="spacing" type="number" min="0" step="1" value="0" /></div>
              <div class="field"><label for="is-padding">Padding</label><input id="is-padding" data-role="padding" type="number" min="0" step="1" value="0" /></div>
            </div>
            <div class="button-row">
              <button data-action="reset-cells" type="button">Reset All Cells</button>
            </div>
          </div>
          <div class="warning" data-role="warning"></div>
        </aside>
      </div>
    `;

    this.stageContainer = root.querySelector('[data-role="konva-stage"]');
    this.gridPreviewCanvas = root.querySelector('[data-role="grid-preview"]');
    this.gridZoomPopover = root.querySelector('[data-role="grid-zoom-popover"]');
    this.sourceInfo = root.querySelector('[data-role="source-info"]');
    this.previewTitle = root.querySelector('[data-role="preview-title"]');
    this.previewRoot = root.querySelector('[data-role="previews"]');
    this.exportCount = root.querySelector('[data-role="export-count"]');
    this.warning = root.querySelector('[data-role="warning"]');
    this.singleControls = root.querySelector('[data-role="single-controls"]');
    this.gridControls = root.querySelector('[data-role="grid-controls"]');
    this.customSizeWrap = root.querySelector('[data-role="custom-size-wrap"]');
    this.inputs = {
      prefix: root.querySelector('[data-role="prefix"]'),
      size: root.querySelector('[data-role="size"]'),
      customSize: root.querySelector('[data-role="custom-size"]'),
      scale: root.querySelector('[data-role="scale"]'),
      rotation: root.querySelector('[data-role="rotation"]'),
      brightness: root.querySelector('[data-role="brightness"]'),
      contrast: root.querySelector('[data-role="contrast"]'),
      saturation: root.querySelector('[data-role="saturation"]'),
      hue: root.querySelector('[data-role="hue"]'),
      blur: root.querySelector('[data-role="blur"]'),
      pixel: root.querySelector('[data-role="pixel"]'),
      rows: root.querySelector('[data-role="rows"]'),
      cols: root.querySelector('[data-role="cols"]'),
      spacing: root.querySelector('[data-role="spacing"]'),
      padding: root.querySelector('[data-role="padding"]'),
      cellZoom: root.querySelector('[data-role="cell-zoom"]'),
    };

    this.setupKonva();
    this.bindEvents();
    this.render();
  }

  unmount() {
    clearTimeout(this.renderTimer);
    this.stage?.destroy();
    this.stage = null;
    this.root = null;
  }

  loadImage(asset) {
    this.asset = asset;
    this.sourceInfo.textContent = `${asset.width} x ${asset.height}`;
    this.inputs.prefix.value = `${this.context.downloadManager.safeFilenamePart(asset.fileName, "icon")}_`;
    this.loadKonvaImage();
    this.render();
  }

  reset() {
    this.resetSingleTransform();
    this.inputs.rows.value = "3";
    this.inputs.cols.value = "3";
    this.inputs.spacing.value = "0";
    this.inputs.padding.value = "0";
    this.gridAdjustments.clear();
    this.gridBaseAdjustment = { offsetX: 0, offsetY: 0 };
    this.selectedCellIndex = null;
    this.loadActiveCellZoom();
    this.render();
  }

  getExportItems() {
    if (!this.asset) return [];
    return this.mode === "single" ? this.getSingleExportItems() : this.getGridExportItems();
  }

  setupKonva() {
    if (!window.Konva) {
      this.warning.textContent = "Konva did not load from the CDN. Single-icon editing is unavailable.";
      this.warning.classList.add("visible");
      return;
    }

    this.stage = new window.Konva.Stage({
      container: this.stageContainer,
      width: STAGE_SIZE,
      height: STAGE_SIZE,
    });
    this.layer = new window.Konva.Layer();
    this.guideLayer = new window.Konva.Layer();
    this.stage.add(this.layer);
    this.stage.add(this.guideLayer);

    this.guideLayer.add(new window.Konva.Rect({
      x: 0,
      y: 0,
      width: STAGE_SIZE,
      height: STAGE_SIZE,
      stroke: "#7ed0ff",
      strokeWidth: 2,
      listening: false,
    }));
    this.guideLayer.add(new window.Konva.Line({
      points: [STAGE_SIZE / 2, 0, STAGE_SIZE / 2, STAGE_SIZE],
      stroke: "rgba(126,208,255,0.72)",
      strokeWidth: 1,
      dash: [6, 6],
      listening: false,
    }));
    this.guideLayer.add(new window.Konva.Line({
      points: [0, STAGE_SIZE / 2, STAGE_SIZE, STAGE_SIZE / 2],
      stroke: "rgba(126,208,255,0.72)",
      strokeWidth: 1,
      dash: [6, 6],
      listening: false,
    }));
    this.transformer = new window.Konva.Transformer({
      rotateEnabled: true,
      keepRatio: true,
      borderStroke: "#a6e3a1",
      anchorStroke: "#a6e3a1",
      anchorFill: "#0f151d",
    });
    this.guideLayer.add(this.transformer);
  }

  bindEvents() {
    for (const button of this.root.querySelectorAll("[data-mode]")) {
      button.addEventListener("click", () => this.setMode(button.dataset.mode));
    }
    this.inputs.size.addEventListener("change", () => {
      this.customSizeWrap.hidden = this.inputs.size.value !== "custom";
      this.render();
    });
    for (const input of Object.values(this.inputs)) {
      input.addEventListener("input", () => this.onInputChanged());
      input.addEventListener("change", () => this.onInputChanged());
    }
    this.gridPreviewCanvas.addEventListener("pointerdown", (event) => this.onGridPointerDown(event));
    this.gridPreviewCanvas.addEventListener("pointermove", (event) => this.onGridPointerMove(event));
    this.gridPreviewCanvas.addEventListener("pointerup", (event) => this.onGridPointerUp(event));
    this.gridPreviewCanvas.addEventListener("pointercancel", (event) => this.onGridPointerCancel(event));
    this.root.querySelector('[data-action="flip-x"]').addEventListener("click", () => this.flip("x"));
    this.root.querySelector('[data-action="flip-y"]').addEventListener("click", () => this.flip("y"));
    this.root.querySelector('[data-action="rotate-90"]').addEventListener("click", () => this.rotate90());
    this.root.querySelector('[data-action="center"]').addEventListener("click", () => this.centerImage());
    this.root.querySelector('[data-action="reset"]').addEventListener("click", () => this.resetSingleTransform());
    this.root.querySelector('[data-action="reset-cells"]').addEventListener("click", () => this.resetAllCellAdjustments());
  }

  setMode(mode) {
    this.mode = mode;
    for (const button of this.root.querySelectorAll("[data-mode]")) {
      button.classList.toggle("active", button.dataset.mode === mode);
    }
    this.singleControls.hidden = mode !== "single";
    this.gridControls.hidden = mode !== "grid";
    this.stageContainer.hidden = mode !== "single";
    this.gridPreviewCanvas.hidden = mode !== "grid";
    if (mode !== "grid") this.gridZoomPopover.hidden = true;
    else this.loadActiveCellZoom();
    this.previewTitle.textContent = mode === "single" ? "Single Icon" : "Grid Extraction";
    this.render();
  }

  loadKonvaImage() {
    if (!this.stage || !this.asset) return;
    this.konvaImage?.destroy();
    const node = new window.Konva.Image({ image: this.asset.image });
    this.konvaImage = node;
    const fit = Math.min(STAGE_SIZE / this.asset.width, STAGE_SIZE / this.asset.height);
    node.setAttrs({
      x: STAGE_SIZE / 2,
      y: STAGE_SIZE / 2,
      width: this.asset.width,
      height: this.asset.height,
      offsetX: this.asset.width / 2,
      offsetY: this.asset.height / 2,
      scaleX: fit,
      scaleY: fit,
      draggable: true,
    });
    node.filters([
      window.Konva.Filters.Brighten,
      window.Konva.Filters.Contrast,
      window.Konva.Filters.HSL,
      window.Konva.Filters.Blur,
      window.Konva.Filters.Pixelate,
    ]);
    node.pixelSize(1);
    node.cache();
    node.on("dragmove transform dragend transformend", () => {
      this.syncControlsFromNode();
      this.scheduleRender();
    });
    this.layer.add(node);
    this.transformer.nodes([node]);
    this.layer.batchDraw();
    this.guideLayer.batchDraw();
    this.syncControlsFromNode();
    this.render();
  }

  onInputChanged() {
    if (this.mode === "grid") {
      this.normalizeGridControls();
      this.saveActiveCellZoom();
    }
    if (this.mode === "single") this.applySingleControls();
    this.render();
  }

  scheduleRender() {
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.render(), 80);
  }

  applySingleControls() {
    if (!this.konvaImage) return;
    const signX = Math.sign(this.konvaImage.scaleX()) || 1;
    const signY = Math.sign(this.konvaImage.scaleY()) || 1;
    const scale = Number(this.inputs.scale.value || 1);
    this.konvaImage.scaleX(signX * scale);
    this.konvaImage.scaleY(signY * scale);
    this.konvaImage.rotation(Number(this.inputs.rotation.value || 0));
    this.konvaImage.brightness(Number(this.inputs.brightness.value || 0));
    this.konvaImage.contrast(Number(this.inputs.contrast.value || 0));
    this.konvaImage.saturation(Number(this.inputs.saturation.value || 0));
    this.konvaImage.hue(Number(this.inputs.hue.value || 0));
    this.konvaImage.blurRadius(Number(this.inputs.blur.value || 0));
    this.konvaImage.pixelSize(Number(this.inputs.pixel.value || 1));
    this.konvaImage.cache();
    this.layer.batchDraw();
    this.guideLayer.batchDraw();
  }

  syncControlsFromNode() {
    if (!this.konvaImage) return;
    this.inputs.scale.value = String(Math.abs(this.konvaImage.scaleX()).toFixed(2));
    this.inputs.rotation.value = String(Math.round(this.konvaImage.rotation()));
  }

  flip(axis) {
    if (!this.konvaImage) return;
    if (axis === "x") this.konvaImage.scaleX(this.konvaImage.scaleX() * -1);
    if (axis === "y") this.konvaImage.scaleY(this.konvaImage.scaleY() * -1);
    this.konvaImage.cache();
    this.layer.batchDraw();
    this.render();
  }

  rotate90() {
    if (!this.konvaImage) return;
    this.konvaImage.rotation((this.konvaImage.rotation() + 90) % 360);
    this.syncControlsFromNode();
    this.layer.batchDraw();
    this.render();
  }

  centerImage() {
    if (!this.konvaImage) return;
    this.konvaImage.position({ x: STAGE_SIZE / 2, y: STAGE_SIZE / 2 });
    this.layer.batchDraw();
    this.render();
  }

  resetSingleTransform() {
    if (!this.konvaImage || !this.asset) return;
    const fit = Math.min(STAGE_SIZE / this.asset.width, STAGE_SIZE / this.asset.height);
    this.konvaImage.setAttrs({
      x: STAGE_SIZE / 2,
      y: STAGE_SIZE / 2,
      rotation: 0,
      scaleX: fit,
      scaleY: fit,
    });
    this.inputs.scale.value = String(fit.toFixed(2));
    this.inputs.rotation.value = "0";
    this.inputs.brightness.value = "0";
    this.inputs.contrast.value = "0";
    this.inputs.saturation.value = "0";
    this.inputs.hue.value = "0";
    this.inputs.blur.value = "0";
    this.inputs.pixel.value = "1";
    this.applySingleControls();
    this.render();
  }

  getOutputSize() {
    const selected = this.inputs.size.value;
    const raw = selected === "custom" ? this.inputs.customSize.value : selected;
    return Math.max(8, Math.min(2048, Math.round(Number(raw || 128))));
  }

  render() {
    this.warning.classList.remove("visible");
    this.warning.textContent = "";
    if (!window.Konva) {
      this.warning.textContent = "Konva did not load from the CDN. Single-icon editing is unavailable.";
      this.warning.classList.add("visible");
    }
    if (this.mode === "grid") this.drawGridPreview();
    this.renderExportPreview();
    this.context.setDirtyState();
  }

  renderExportPreview() {
    this.previewRoot.innerHTML = "";
    const count = this.getExportItems().length;
    this.exportCount.textContent = `${count} file${count === 1 ? "" : "s"}`;
    if (!this.asset) return;

    if (this.mode === "single") {
      const card = this.createPreviewCard(`${this.filePrefix()}icon.png`);
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      card.append(canvas);
      this.previewRoot.append(card);
      this.renderSingleToCanvas(canvas, 96);
      return;
    }

    const grid = this.getGrid();
    const max = Math.min(grid.cells.length, 12);
    for (let index = 0; index < max; index += 1) {
      const card = this.createPreviewCard(`${this.filePrefix()}${String(index + 1).padStart(2, "0")}.png`);
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      card.append(canvas);
      this.renderGridCellToCanvas(canvas, grid.cells[index], 96);
      this.previewRoot.append(card);
    }
  }

  createPreviewCard(label) {
    const card = document.createElement("div");
    card.className = "preview-card";
    const title = document.createElement("div");
    title.className = "thumb-title";
    title.textContent = label;
    card.append(title);
    return card;
  }

  getSingleExportItems() {
    if (!this.stage || !this.konvaImage) return [];
    return [{
      filename: `${this.filePrefix()}icon.png`,
      type: "image/png",
      getBlob: async () => {
        const canvas = this.renderSingleToCanvas(document.createElement("canvas"), this.getOutputSize());
        return this.context.canvasUtils.canvasToBlob(canvas, "image/png");
      },
    }];
  }

  renderSingleToCanvas(canvas, size) {
    canvas.width = size;
    canvas.height = size;
    if (!this.stage || !this.konvaImage) return canvas;
    const previousTransformerVisible = this.transformer.visible();
    const previousGuideVisible = this.guideLayer.visible();
    try {
      this.transformer.visible(false);
      this.guideLayer.visible(false);
      this.stage.draw();
      const context = canvas.getContext("2d");
      const exportCanvas = this.stage.toCanvas({ pixelRatio: size / STAGE_SIZE });
      context.clearRect(0, 0, size, size);
      context.drawImage(exportCanvas, 0, 0, size, size);
    } finally {
      this.transformer.visible(previousTransformerVisible);
      this.guideLayer.visible(previousGuideVisible);
      this.stage.draw();
    }
    return canvas;
  }

  drawGridPreview() {
    if (!this.asset) return;
    const fit = this.context.canvasUtils.fitSize(this.asset.width, this.asset.height, 960, 620);
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    this.gridPreviewCanvas.style.width = `${fit.width}px`;
    this.gridPreviewCanvas.style.height = `${fit.height}px`;
    this.gridPreviewCanvas.width = Math.floor(fit.width * dpr);
    this.gridPreviewCanvas.height = Math.floor(fit.height * dpr);
    const ctx = this.gridPreviewCanvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.gridPreviewCanvas.width, this.gridPreviewCanvas.height);
    ctx.scale(dpr, dpr);
    ctx.drawImage(this.asset.image, 0, 0, this.asset.width, this.asset.height, 0, 0, fit.width, fit.height);
    const grid = this.getGrid();
    ctx.strokeStyle = "#7ed0ff";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "rgba(126, 208, 255, 0.12)";
    for (const cell of grid.cells) {
      const x = cell.x * fit.scale;
      const y = cell.y * fit.scale;
      const w = cell.width * fit.scale;
      const h = cell.height * fit.scale;
      const source = this.getAdjustedSourceRect(cell);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.drawImage(this.asset.image, source.x, source.y, source.width, source.height, x, y, w, h);
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      ctx.strokeRect(x, y, w, h);
      if (cell.index === this.selectedCellIndex) {
        ctx.save();
        ctx.strokeStyle = "#a6e3a1";
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 2));
        ctx.fillStyle = "rgba(166, 227, 161, 0.16)";
        ctx.fillRect(x, y, w, h);
        ctx.restore();
      }
    }
    this.positionGridZoomPopover(grid, fit);
  }

  getGrid() {
    const rows = this.clampInt(this.inputs.rows.value, 1, 64);
    const cols = this.clampInt(this.inputs.cols.value, 1, 64);
    const sourceWidth = this.asset?.width || 1;
    const sourceHeight = this.asset?.height || 1;
    const maxPadding = Math.max(0, Math.floor((Math.min(sourceWidth, sourceHeight) - 1) / 2));
    const padding = this.clampInt(this.inputs.padding.value, 0, maxPadding);
    const spacingLimits = [];
    if (cols > 1) spacingLimits.push(Math.floor((sourceWidth - padding * 2 - 1) / (cols - 1)));
    if (rows > 1) spacingLimits.push(Math.floor((sourceHeight - padding * 2 - 1) / (rows - 1)));
    const maxSpacing = Math.max(0, Math.min(...spacingLimits, Math.max(sourceWidth, sourceHeight)));
    const spacing = this.clampInt(this.inputs.spacing.value, 0, maxSpacing);
    const availableWidth = Math.max(1, sourceWidth - padding * 2 - spacing * (cols - 1));
    const availableHeight = Math.max(1, sourceHeight - padding * 2 - spacing * (rows - 1));
    const cellWidth = Math.max(1, Math.floor(availableWidth / cols));
    const cellHeight = Math.max(1, Math.floor(availableHeight / rows));
    const cells = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        cells.push({
          index: row * cols + col + 1,
          x: padding + col * (cellWidth + spacing),
          y: padding + row * (cellHeight + spacing),
          width: cellWidth,
          height: cellHeight,
        });
      }
    }
    return { rows, cols, spacing, padding, cells };
  }

  normalizeGridControls() {
    if (!this.asset) return;
    const { rows, cols, spacing, padding } = this.getGrid();
    this.inputs.rows.value = String(rows);
    this.inputs.cols.value = String(cols);
    this.inputs.spacing.value = String(spacing);
    this.inputs.padding.value = String(padding);
    const cellCount = rows * cols;
    if (this.selectedCellIndex && this.selectedCellIndex > cellCount) {
      this.selectedCellIndex = null;
      this.loadActiveCellZoom();
    }
  }

  getCellAdjustment(index) {
    return this.gridAdjustments.get(index) || { offsetX: 0, offsetY: 0, zoom: 1 };
  }

  setCellAdjustment(index, adjustment) {
    const offsetX = this.clampNumber(adjustment.offsetX, -100, 100);
    const offsetY = this.clampNumber(adjustment.offsetY, -100, 100);
    const zoom = this.clampNumber(adjustment.zoom, 0.5, 4);
    if (offsetX === 0 && offsetY === 0 && zoom === 1) {
      this.gridAdjustments.delete(index);
      return;
    }
    this.gridAdjustments.set(index, { offsetX, offsetY, zoom });
  }

  saveActiveCellZoom() {
    if (!this.selectedCellIndex) return;
    const current = this.getCellAdjustment(this.selectedCellIndex);
    const zoom = this.clampNumber(this.inputs.cellZoom.value, 0.5, 4);
    this.setCellAdjustment(this.selectedCellIndex, { ...current, zoom });
  }

  loadActiveCellZoom() {
    const adjustment = this.selectedCellIndex ? this.getCellAdjustment(this.selectedCellIndex) : { zoom: 1 };
    this.inputs.cellZoom.value = String(adjustment.zoom);
    this.gridZoomPopover.hidden = !this.selectedCellIndex;
  }

  resetAllCellAdjustments() {
    this.gridAdjustments.clear();
    this.gridBaseAdjustment = { offsetX: 0, offsetY: 0 };
    this.loadActiveCellZoom();
    this.render();
  }

  onGridPointerDown(event) {
    if (this.mode !== "grid" || !this.asset) return;
    const hit = this.getGridCellAtPointer(event);
    if (!hit) return;
    try {
      this.gridPreviewCanvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events used by smoke tests may not have a live pointer capture target.
    }
    this.gridDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      cellIndex: hit.cell.index,
      target: this.selectedCellIndex ? (hit.cell.index === this.selectedCellIndex ? "cell" : "none") : "all",
    };
  }

  onGridPointerMove(event) {
    if (!this.gridDrag || this.gridDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - this.gridDrag.lastX;
    const dy = event.clientY - this.gridDrag.lastY;
    const totalDx = event.clientX - this.gridDrag.startX;
    const totalDy = event.clientY - this.gridDrag.startY;
    if (Math.hypot(totalDx, totalDy) < 3) return;
    this.gridDrag.moved = true;
    this.gridDrag.lastX = event.clientX;
    this.gridDrag.lastY = event.clientY;
    const scale = this.getGridPreviewFit()?.scale || 1;
    const sourceDx = dx / scale;
    const sourceDy = dy / scale;
    if (this.gridDrag.target === "cell" && this.selectedCellIndex) {
      this.nudgeCellAdjustment(this.selectedCellIndex, sourceDx, sourceDy);
    } else if (this.gridDrag.target === "all") {
      this.nudgeBaseGridAdjustment(sourceDx, sourceDy);
    }
    this.render();
  }

  onGridPointerUp(event) {
    if (!this.gridDrag || this.gridDrag.pointerId !== event.pointerId) return;
    const drag = this.gridDrag;
    this.gridDrag = null;
    if (this.gridPreviewCanvas.hasPointerCapture?.(event.pointerId)) {
      this.gridPreviewCanvas.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) return;
    this.selectedCellIndex = this.selectedCellIndex === drag.cellIndex ? null : drag.cellIndex;
    this.loadActiveCellZoom();
    this.render();
  }

  onGridPointerCancel(event) {
    if (!this.gridDrag || this.gridDrag.pointerId !== event.pointerId) return;
    this.gridDrag = null;
    if (this.gridPreviewCanvas.hasPointerCapture?.(event.pointerId)) {
      this.gridPreviewCanvas.releasePointerCapture(event.pointerId);
    }
  }

  nudgeCellAdjustment(index, sourceDx, sourceDy) {
    const cell = this.getGrid().cells.find((item) => item.index === index);
    if (!cell) return;
    const current = this.getCellAdjustment(index);
    this.setCellAdjustment(index, {
      ...current,
      offsetX: current.offsetX - (sourceDx / cell.width) * 100,
      offsetY: current.offsetY - (sourceDy / cell.height) * 100,
    });
  }

  nudgeBaseGridAdjustment(sourceDx, sourceDy) {
    const grid = this.getGrid();
    const cell = grid.cells[0];
    if (!cell) return;
    this.gridBaseAdjustment = {
      offsetX: this.clampNumber(this.gridBaseAdjustment.offsetX - (sourceDx / cell.width) * 100, -100, 100),
      offsetY: this.clampNumber(this.gridBaseAdjustment.offsetY - (sourceDy / cell.height) * 100, -100, 100),
    };
  }

  getGridPreviewFit() {
    if (!this.asset) return null;
    return this.context.canvasUtils.fitSize(this.asset.width, this.asset.height, 960, 620);
  }

  getGridCellAtPointer(event) {
    const fit = this.getGridPreviewFit();
    if (!fit) return null;
    const rect = this.gridPreviewCanvas.getBoundingClientRect();
    const sourceX = ((event.clientX - rect.left) / rect.width) * this.asset.width;
    const sourceY = ((event.clientY - rect.top) / rect.height) * this.asset.height;
    const cell = this.getGrid().cells.find((item) => (
      sourceX >= item.x
      && sourceX <= item.x + item.width
      && sourceY >= item.y
      && sourceY <= item.y + item.height
    ));
    return cell ? { cell, fit } : null;
  }

  positionGridZoomPopover(grid, fit) {
    this.gridZoomPopover.hidden = !this.selectedCellIndex;
    if (!this.selectedCellIndex) return;
    const cell = grid.cells.find((item) => item.index === this.selectedCellIndex);
    if (!cell) return;
    const stageRect = this.gridPreviewCanvas.parentElement.getBoundingClientRect();
    const canvasRect = this.gridPreviewCanvas.getBoundingClientRect();
    const canvasLeft = canvasRect.left - stageRect.left;
    const canvasTop = canvasRect.top - stageRect.top;
    const x = cell.x * fit.scale;
    const y = cell.y * fit.scale;
    const w = cell.width * fit.scale;
    this.gridZoomPopover.style.left = `${Math.max(8, canvasLeft + x + w / 2)}px`;
    this.gridZoomPopover.style.top = `${Math.max(8, canvasTop + y + 8)}px`;
  }

  getGridExportItems() {
    if (!this.asset) return [];
    const size = this.getOutputSize();
    return this.getGrid().cells.map((cell) => ({
      filename: `${this.filePrefix()}${String(cell.index).padStart(2, "0")}.png`,
      type: "image/png",
      getBlob: async () => {
        const canvas = document.createElement("canvas");
        this.renderGridCellToCanvas(canvas, cell, size);
        return this.context.canvasUtils.canvasToBlob(canvas, "image/png");
      },
    }));
  }

  renderGridCellToCanvas(canvas, cell, size) {
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    const source = this.getAdjustedSourceRect(cell);
    ctx.drawImage(this.asset.image, source.x, source.y, source.width, source.height, 0, 0, size, size);
    return canvas;
  }

  getAdjustedSourceRect(cell) {
    const cellAdjustment = this.getCellAdjustment(cell.index);
    const adjustment = {
      offsetX: this.gridBaseAdjustment.offsetX + cellAdjustment.offsetX,
      offsetY: this.gridBaseAdjustment.offsetY + cellAdjustment.offsetY,
      zoom: cellAdjustment.zoom,
    };
    const zoom = Math.max(0.5, adjustment.zoom || 1);
    const width = Math.max(1, Math.min(this.asset.width, cell.width / zoom));
    const height = Math.max(1, Math.min(this.asset.height, cell.height / zoom));
    const centerX = cell.x + cell.width / 2 + (adjustment.offsetX / 100) * cell.width;
    const centerY = cell.y + cell.height / 2 + (adjustment.offsetY / 100) * cell.height;
    return {
      x: this.clampNumber(centerX - width / 2, 0, Math.max(0, this.asset.width - width)),
      y: this.clampNumber(centerY - height / 2, 0, Math.max(0, this.asset.height - height)),
      width,
      height,
    };
  }

  clampInt(value, min, max) {
    return Math.max(min, Math.min(max, Math.round(Number(value || min))));
  }

  clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, Number(value || min)));
  }

  filePrefix() {
    return String(this.inputs.prefix.value || "icon_").trim().replace(/[^\w-]+/g, "_") || "icon_";
  }
}
