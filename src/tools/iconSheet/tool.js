import { clampNumber } from "../../core/math.js";
import { defaultCrop, resetCrop, setCropEdge } from "./crop.js";
import { resetGridCrops, setGridCropEdge } from "./gridCrop.js";
import { bindInputEvents, bindRangePairs, createPreviewCard, role, setWarning, syncRangePairs } from "../../ui/dom.js";
import {
  bindGridPointerEvents,
  getGrid,
  loadActiveCellZoom,
  normalizeGridControls,
  resetAllCellAdjustments,
  saveActiveCellZoom,
} from "./gridEditor.js";
import { drawGridPreview, renderGridCellToCanvas } from "./gridRendering.js";
import {
  applySingleControls,
  centerSingle,
  flipSingle,
  loadKonvaImage,
  renderSingleToCanvas,
  resetSingleTransform,
  rotateSingle90,
  setupKonva,
} from "./singleEditor.js";
import { iconSheetTemplate } from "./template.js";

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
    this.gridAdjustments = new Map();
    this.gridBaseAdjustment = { offsetX: 0, offsetY: 0 };
    this.gridCrops = new Map();
    this.singleCrop = defaultCrop();
    this.gridOverlays = { centerLines: false, sourceEdge: false };
    this.selectedCellIndex = null;
    this.gridDrag = null;
    this.renderTimer = 0;
  }

  mount(root) {
    this.root = root;
    root.innerHTML = iconSheetTemplate();
    this.captureElements(root);
    bindRangePairs(root);
    setupKonva(this);
    this.bindEvents();
    this.render();
  }

  captureElements(root) {
    this.stageContainer = role(root, "konva-stage");
    this.gridPreviewCanvas = role(root, "grid-preview");
    this.gridZoomPopover = role(root, "grid-zoom-popover");
    this.sourceInfo = role(root, "source-info");
    this.previewTitle = role(root, "preview-title");
    this.previewRoot = role(root, "previews");
    this.exportCount = role(root, "export-count");
    this.warning = role(root, "warning");
    this.singleControls = role(root, "single-controls");
    this.gridControls = role(root, "grid-controls");
    this.customSizeWrap = role(root, "custom-size-wrap");
    this.inputs = {
      prefix: role(root, "prefix"),
      size: role(root, "size"),
      customSize: role(root, "custom-size"),
      scale: role(root, "scale"),
      rotation: role(root, "rotation"),
      brightness: role(root, "brightness"),
      contrast: role(root, "contrast"),
      saturation: role(root, "saturation"),
      hue: role(root, "hue"),
      blur: role(root, "blur"),
      pixel: role(root, "pixel"),
      rows: role(root, "rows"),
      cols: role(root, "cols"),
      spacing: role(root, "spacing"),
      padding: role(root, "padding"),
      cellZoom: role(root, "cell-zoom"),
    };
  }

  bindEvents() {
    for (const button of this.root.querySelectorAll("[data-mode]")) {
      button.addEventListener("click", () => this.setMode(button.dataset.mode));
    }
    this.inputs.size.addEventListener("change", () => {
      this.customSizeWrap.hidden = this.inputs.size.value !== "custom";
      this.render();
    });
    bindInputEvents(Object.values(this.inputs), () => this.onInputChanged());
    bindGridPointerEvents(this);
    this.root.querySelector('[data-action="flip-x"]').addEventListener("click", () => flipSingle(this, "x"));
    this.root.querySelector('[data-action="flip-y"]').addEventListener("click", () => flipSingle(this, "y"));
    this.root.querySelector('[data-action="rotate-90"]').addEventListener("click", () => rotateSingle90(this));
    this.root.querySelector('[data-action="center"]').addEventListener("click", () => centerSingle(this));
    this.root.querySelector('[data-action="reset"]').addEventListener("click", () => resetSingleTransform(this));
    this.root.querySelector('[data-action="reset-cells"]').addEventListener("click", () => resetAllCellAdjustments(this));
    this.root.querySelector('[data-action="toggle-grid-lines"]').addEventListener("click", (event) => this.toggleGridOverlay(event, "centerLines"));
    this.root.querySelector('[data-action="toggle-source-edge"]').addEventListener("click", (event) => this.toggleGridOverlay(event, "sourceEdge"));
    this.root.querySelector('[data-action="reset-grid-image"]').addEventListener("click", () => resetAllCellAdjustments(this));
  }

  unmount() {
    clearTimeout(this.renderTimer);
    this.stage?.destroy();
    if (this.gridKeyHandler) document.removeEventListener("keydown", this.gridKeyHandler);
    this.stage = null;
    this.root = null;
  }

  loadImage(asset) {
    this.asset = asset;
    this.sourceInfo.textContent = `${asset.width} x ${asset.height}`;
    this.inputs.prefix.value = `${this.context.downloadManager.safeFilenamePart(asset.fileName, "icon")}_`;
    loadKonvaImage(this);
    this.render();
  }

  reset() {
    resetSingleTransform(this);
    this.inputs.rows.value = "3";
    this.inputs.cols.value = "3";
    this.inputs.spacing.value = "0";
    this.inputs.padding.value = "0";
    this.gridAdjustments.clear();
    this.gridBaseAdjustment = { offsetX: 0, offsetY: 0 };
    resetGridCrops(this);
    resetCrop(this.singleCrop);
    this.selectedCellIndex = null;
    loadActiveCellZoom(this);
    syncRangePairs(this.root);
    this.render();
  }

  getExportItems() {
    if (!this.asset) return [];
    return this.mode === "single" ? this.getSingleExportItems() : this.getGridExportItems();
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
    else loadActiveCellZoom(this);
    this.previewTitle.textContent = mode === "single" ? "Single Icon" : "Grid Extraction";
    this.render();
  }

  onInputChanged() {
    if (this.mode === "grid") {
      normalizeGridControls(this);
      saveActiveCellZoom(this);
    }
    if (this.mode === "single") applySingleControls(this);
    this.render();
  }

  scheduleRender() {
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.render(), 80);
  }

  getOutputSize() {
    const selected = this.inputs.size.value;
    const raw = selected === "custom" ? this.inputs.customSize.value : selected;
    return clampNumber(Math.round(Number(raw || 128)), 8, 2048);
  }

  setGridCropEdge(edge, value) {
    if (this.gridDrag?.cell) setGridCropEdge(this, this.gridDrag.cell.index, edge, value);
  }

  setSingleCropEdge(edge, value) {
    setCropEdge(this.singleCrop, edge, value);
  }

  toggleGridOverlay(event, key) {
    this.gridOverlays[key] = !this.gridOverlays[key];
    event.currentTarget.classList.toggle("active", this.gridOverlays[key]);
    this.render();
  }

  render() {
    setWarning(this.warning, window.Konva ? [] : "Konva did not load from the CDN. Single-icon editing is unavailable.");
    if (this.mode === "grid") drawGridPreview(this);
    this.renderExportPreview();
    this.context.setDirtyState();
  }

  renderExportPreview() {
    this.previewRoot.innerHTML = "";
    const count = this.getExportItems().length;
    this.exportCount.textContent = `${count} file${count === 1 ? "" : "s"}`;
    if (!this.asset) return;
    if (this.mode === "single") this.renderSinglePreview();
    else this.renderGridPreviewCards();
  }

  renderSinglePreview() {
    const card = createPreviewCard(`${this.filePrefix()}icon.png`);
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    card.append(canvas);
    this.previewRoot.append(card);
    renderSingleToCanvas(this, canvas, 96);
  }

  renderGridPreviewCards() {
    const grid = getGrid(this);
    const max = Math.min(grid.cells.length, 12);
    for (let index = 0; index < max; index += 1) {
      const card = createPreviewCard(`${this.filePrefix()}${String(index + 1).padStart(2, "0")}.png`);
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      card.append(canvas);
      renderGridCellToCanvas(this, canvas, grid.cells[index], 96);
      this.previewRoot.append(card);
    }
  }

  getSingleExportItems() {
    if (!this.stage || !this.konvaImage) return [];
    return [{
      filename: `${this.filePrefix()}icon.png`,
      type: "image/png",
      getBlob: async () => {
        const canvas = renderSingleToCanvas(this, document.createElement("canvas"), this.getOutputSize());
        return this.context.canvasUtils.canvasToBlob(canvas, "image/png");
      },
    }];
  }

  getGridExportItems() {
    if (!this.asset) return [];
    const size = this.getOutputSize();
    return getGrid(this).cells.map((cell) => ({
      filename: `${this.filePrefix()}${String(cell.index).padStart(2, "0")}.png`,
      type: "image/png",
      getBlob: async () => {
        const canvas = document.createElement("canvas");
        renderGridCellToCanvas(this, canvas, cell, size);
        return this.context.canvasUtils.canvasToBlob(canvas, "image/png");
      },
    }));
  }

  filePrefix() {
    return String(this.inputs.prefix.value || "icon_").trim().replace(/[^\w-]+/g, "_") || "icon_";
  }
}
