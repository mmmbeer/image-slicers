import { clampNumber } from "../../core/math.js";
import { bindInputEvents, bindRangePairs, createPreviewCard, role, roles, syncRangePairs } from "../../ui/dom.js";
import { STAGE_SIZE } from "../iconSheet/constants.js";
import { applyCropToRects, defaultCrop, resetCrop, setCropEdge } from "../iconSheet/crop.js";
import { setupSingleCrop, updateSingleCropOverlay } from "../iconSheet/singleCrop.js";

const LOGO_SIZES = [
  { size: 16, label: "Favicon 16" },
  { size: 32, label: "Favicon 32" },
  { size: 48, label: "Favicon 48" },
  { size: 64, label: "Small mark" },
  { size: 128, label: "App icon 128" },
  { size: 180, label: "Apple touch" },
  { size: 192, label: "PWA 192" },
  { size: 256, label: "App icon 256" },
  { size: 512, label: "PWA 512" },
  { size: 1024, label: "Large icon" },
];

export const logoLibraryTool = {
  id: "logo-library",
  name: "Logo Library",
  description: "Generate a standard logo and app-icon size set from one image.",
  create(context) {
    return new LogoLibrary(context);
  },
};

class LogoLibrary {
  constructor(context) {
    this.context = context;
    this.asset = null;
    this.previewRoot = null;
    this.stage = null;
    this.layer = null;
    this.guideLayer = null;
    this.transformer = null;
    this.konvaImage = null;
    this.singleCrop = defaultCrop();
    this.renderTimer = 0;
  }

  mount(root) {
    this.root = root;
    root.innerHTML = `
      <div class="tool-layout">
        <section class="editor-pane">
          <div class="pane-title">
            <h2>Logo Size Library</h2>
            <span data-role="source-info">No image loaded</span>
          </div>
          <div class="canvas-stage">
            <div data-role="logo-stage" style="width:${STAGE_SIZE}px; height:${STAGE_SIZE}px;"></div>
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
            <h3>Output</h3>
            <div class="field">
              <label for="ll-prefix">Name prefix</label>
              <input id="ll-prefix" data-role="prefix" type="text" value="logo_" />
            </div>
            <div class="field">
              <label for="ll-fit">Image fit</label>
              <select id="ll-fit" data-role="fit">
                <option value="contain" selected>Contain</option>
                <option value="cover">Cover</option>
                <option value="stretch">Stretch</option>
              </select>
            </div>
            <div class="field range-field">
              <div class="range-control">
                <label for="ll-scale">Zoom:</label>
                <input data-range-for="scale" type="number" />
                <span>x</span>
                <input id="ll-scale" data-role="scale" data-range-input type="range" min="0.05" max="8" step="0.01" value="1" />
              </div>
            </div>
            <div class="field range-field">
              <div class="range-control">
                <label for="ll-rotation">Rotation:</label>
                <input data-range-for="rotation" type="number" />
                <span>deg</span>
                <input id="ll-rotation" data-role="rotation" data-range-input type="range" min="-180" max="180" step="1" value="0" />
              </div>
            </div>
            <div class="field range-field">
              <div class="range-control">
                <label for="ll-padding">Transparent padding:</label>
                <input data-range-for="padding" type="number" />
                <span>%</span>
                <input id="ll-padding" data-role="padding" data-range-input type="range" min="0" max="40" step="1" value="8" />
              </div>
              <span class="field-help">Percent of each output size.</span>
            </div>
            <div class="button-row">
              <button data-action="rotate-90" type="button">Rotate 90</button>
              <button data-action="center" type="button">Center</button>
              <button data-action="reset-transform" type="button" title="Reset logo transform"><img src="./src/assets/reset.png" alt="" aria-hidden="true" />Reset</button>
            </div>
          </div>
          <div class="control-group">
            <h3>Sizes</h3>
            <div class="size-list">
              ${LOGO_SIZES.map(({ size, label }) => `
                <label class="size-option">
                  <input data-role="logo-size" type="checkbox" value="${size}" checked />
                  <span>${size} x ${size} - ${label}</span>
                </label>
              `).join("")}
            </div>
          </div>
        </aside>
      </div>
    `;

    this.stageContainer = role(root, "logo-stage");
    this.sourceInfo = role(root, "source-info");
    this.previewRoot = role(root, "previews");
    this.exportCount = role(root, "export-count");
    this.inputs = {
      prefix: role(root, "prefix"),
      fit: role(root, "fit"),
      scale: role(root, "scale"),
      rotation: role(root, "rotation"),
      padding: role(root, "padding"),
      sizes: roles(root, "logo-size"),
    };

    bindRangePairs(root);
    this.setupStage();
    bindInputEvents([this.inputs.prefix, this.inputs.padding, ...this.inputs.sizes], () => this.render());
    bindInputEvents([this.inputs.scale, this.inputs.rotation], () => this.applyTransformControls());
    this.inputs.fit.addEventListener("change", () => this.resetTransform());
    root.querySelector('[data-action="rotate-90"]').addEventListener("click", () => this.rotate90());
    root.querySelector('[data-action="center"]').addEventListener("click", () => this.centerImage());
    root.querySelector('[data-action="reset-transform"]').addEventListener("click", () => this.resetTransform());
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
    this.inputs.prefix.value = `${this.context.downloadManager.safeFilenamePart(asset.fileName, "logo")}_`;
    this.loadKonvaImage();
    this.render();
  }

  reset() {
    this.inputs.fit.value = "contain";
    this.inputs.padding.value = "8";
    resetCrop(this.singleCrop);
    this.resetTransform();
    syncRangePairs(this.root);
    for (const input of this.inputs.sizes) input.checked = true;
    this.render();
  }

  getExportItems() {
    if (!this.asset) return [];
    return this.getSelectedSizes().map((size) => ({
      filename: `${this.filePrefix()}${size}x${size}.png`,
      type: "image/png",
      getBlob: async () => {
        const canvas = this.renderLogoToCanvas(document.createElement("canvas"), size);
        return this.context.canvasUtils.canvasToBlob(canvas, "image/png");
      },
    }));
  }

  render() {
    updateSingleCropOverlay(this);
    this.renderExportPreview();
    this.context.setDirtyState();
  }

  scheduleRender() {
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.render(), 80);
  }

  renderExportPreview() {
    this.previewRoot.innerHTML = "";
    const sizes = this.getSelectedSizes();
    this.exportCount.textContent = `${this.asset ? sizes.length : 0} file${sizes.length === 1 ? "" : "s"}`;
    if (!this.asset) return;

    for (const size of sizes) {
      const card = createPreviewCard(`${this.filePrefix()}${size}x${size}.png`, `${size}px`);
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      card.append(canvas);
      this.renderLogoToCanvas(canvas, 96);
      this.previewRoot.append(card);
    }
  }

  renderLogoToCanvas(canvas, size) {
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    if (!this.asset || !this.stage || !this.konvaImage) return canvas;

    const padding = Math.round(size * clampNumber(this.inputs.padding.value, 0, 40) / 100);
    const targetSize = Math.max(1, size - padding * 2);
    ctx.drawImage(this.renderStageCanvas(targetSize), padding, padding, targetSize, targetSize);
    return canvas;
  }

  renderStageCanvas(size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const previousTransformerVisible = this.transformer.visible();
    const previousGuideVisible = this.guideLayer.visible();
    try {
      this.transformer.visible(false);
      this.guideLayer.visible(false);
      this.stage.draw();
      const exportCanvas = this.stage.toCanvas({ pixelRatio: size / STAGE_SIZE });
      const cropped = applyCropToRects(
        { x: 0, y: 0, width: size, height: size },
        { x: 0, y: 0, width: size, height: size },
        this.singleCrop,
      );
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(
        exportCanvas,
        cropped.source.x,
        cropped.source.y,
        cropped.source.width,
        cropped.source.height,
        cropped.dest.x,
        cropped.dest.y,
        cropped.dest.width,
        cropped.dest.height,
      );
    } finally {
      this.transformer.visible(previousTransformerVisible);
      this.guideLayer.visible(previousGuideVisible);
      this.stage.draw();
    }
    return canvas;
  }

  setupStage() {
    if (!window.Konva) return;
    this.stage = new window.Konva.Stage({ container: this.stageContainer, width: STAGE_SIZE, height: STAGE_SIZE });
    this.layer = new window.Konva.Layer();
    this.guideLayer = new window.Konva.Layer();
    this.stage.add(this.layer);
    this.stage.add(this.guideLayer);
    this.guideLayer.add(new window.Konva.Rect({
      x: 0, y: 0, width: STAGE_SIZE, height: STAGE_SIZE, stroke: "#7ed0ff", strokeWidth: 2, listening: false,
    }));
    this.guideLayer.add(new window.Konva.Line({
      points: [STAGE_SIZE / 2, 0, STAGE_SIZE / 2, STAGE_SIZE],
      stroke: "rgba(126,208,255,0.72)", strokeWidth: 1, dash: [6, 6], listening: false,
    }));
    this.guideLayer.add(new window.Konva.Line({
      points: [0, STAGE_SIZE / 2, STAGE_SIZE, STAGE_SIZE / 2],
      stroke: "rgba(126,208,255,0.72)", strokeWidth: 1, dash: [6, 6], listening: false,
    }));
    this.transformer = new window.Konva.Transformer({
      rotateEnabled: true,
      keepRatio: true,
      borderStroke: "#a6e3a1",
      anchorStroke: "#a6e3a1",
      anchorFill: "#0f151d",
    });
    this.guideLayer.add(this.transformer);
    setupSingleCrop(this);
  }

  loadKonvaImage() {
    if (!this.stage || !this.asset) return;
    this.konvaImage?.destroy();
    this.konvaImage = new window.Konva.Image({
      image: this.asset.image,
      x: STAGE_SIZE / 2,
      y: STAGE_SIZE / 2,
      width: this.asset.width,
      height: this.asset.height,
      offsetX: this.asset.width / 2,
      offsetY: this.asset.height / 2,
      draggable: true,
    });
    this.konvaImage.on("dragmove transform dragend transformend", () => {
      this.syncControlsFromNode();
      this.scheduleRender();
    });
    this.layer.add(this.konvaImage);
    this.transformer.nodes([this.konvaImage]);
    this.resetTransform();
  }

  applyTransformControls() {
    if (!this.konvaImage) return;
    const signX = Math.sign(this.konvaImage.scaleX()) || 1;
    const signY = Math.sign(this.konvaImage.scaleY()) || 1;
    const scale = clampNumber(this.inputs.scale.value, 0.05, 8);
    this.konvaImage.scaleX(signX * scale);
    this.konvaImage.scaleY(signY * scale);
    this.konvaImage.rotation(Number(this.inputs.rotation.value || 0));
    this.layer.batchDraw();
    this.guideLayer.batchDraw();
    this.render();
  }

  syncControlsFromNode() {
    if (!this.konvaImage) return;
    this.inputs.scale.value = String(Math.abs(this.konvaImage.scaleX()).toFixed(2));
    this.inputs.rotation.value = String(Math.round(this.konvaImage.rotation()));
    syncRangePairs(this.root);
  }

  resetTransform() {
    if (!this.konvaImage || !this.asset) return;
    const fit = this.inputs.fit.value;
    const scaleX = fit === "stretch"
      ? STAGE_SIZE / this.asset.width
      : fit === "cover"
        ? Math.max(STAGE_SIZE / this.asset.width, STAGE_SIZE / this.asset.height)
        : Math.min(STAGE_SIZE / this.asset.width, STAGE_SIZE / this.asset.height);
    const scaleY = fit === "stretch" ? STAGE_SIZE / this.asset.height : scaleX;
    this.konvaImage.setAttrs({
      x: STAGE_SIZE / 2,
      y: STAGE_SIZE / 2,
      rotation: 0,
      scaleX,
      scaleY,
    });
    this.syncControlsFromNode();
    this.layer.batchDraw();
    this.guideLayer.batchDraw();
    this.render();
  }

  centerImage() {
    if (!this.konvaImage) return;
    this.konvaImage.position({ x: STAGE_SIZE / 2, y: STAGE_SIZE / 2 });
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

  setSingleCropEdge(edge, value) {
    setCropEdge(this.singleCrop, edge, value);
  }

  getSelectedSizes() {
    return this.inputs.sizes
      .filter((input) => input.checked)
      .map((input) => Number(input.value))
      .filter((size) => Number.isFinite(size) && size > 0);
  }

  filePrefix() {
    return String(this.inputs.prefix.value || "logo_").trim().replace(/[^\w-]+/g, "_") || "logo_";
  }
}
