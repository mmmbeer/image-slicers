import { bindInputEvents, createPreviewCard, role, setWarning } from "../../ui/dom.js";

const IMAGE_EXTENSIONS = /\.(avif|bmp|gif|jpe?g|png|webp)$/i;
const DEFAULT_TEXT = "{{filename}}";
const GOOGLE_FONTS = [
  "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Raleway", "Inter", "Oswald", "Merriweather", "Nunito",
  "Source Sans 3", "PT Sans", "Playfair Display", "Noto Sans", "Ubuntu", "Rubik", "Work Sans", "Mulish", "Quicksand", "Manrope",
  "Fira Sans", "Barlow", "Karla", "Libre Franklin", "Inconsolata", "Josefin Sans", "Arimo", "Bebas Neue", "Bitter", "Cabin",
  "Crimson Text", "DM Sans", "Exo 2", "Heebo", "IBM Plex Sans", "Jost", "Libre Baskerville", "Monda", "Mukta", "Nanum Gothic",
  "Nunito Sans", "Oxygen", "Pacifico", "Prompt", "Questrial", "Roboto Condensed", "Roboto Slab", "Source Serif 4", "Titillium Web", "Varela Round",
];

const TRANSFORMS = [
  { type: "scale", label: "Scale", defaults: { percent: 100 } },
  { type: "resize", label: "Resize", defaults: { width: 512, height: 512, mode: "stretch" } },
  { type: "fit", label: "Fit Contain", defaults: { width: 512, height: 512, color: "transparent" } },
  { type: "cover", label: "Fit Cover", defaults: { width: 512, height: 512 } },
  { type: "rotate", label: "Rotate", defaults: { degrees: 0, expand: true } },
  { type: "flip", label: "Flip", defaults: { axis: "horizontal" } },
  { type: "crop", label: "Crop", defaults: { x: 0, y: 0, width: 256, height: 256 } },
  { type: "trim", label: "Trim Transparent", defaults: { threshold: 8 } },
  { type: "pad", label: "Pad", defaults: { left: 0, right: 0, top: 0, bottom: 0, color: "transparent" } },
  { type: "background", label: "Background", defaults: { color: "#ffffff" } },
  { type: "border", label: "Border", defaults: { size: 8, color: "#ffffff" } },
  { type: "rounded", label: "Rounded Corners", defaults: { radius: 24, percent: 0 } },
  { type: "opacity", label: "Opacity", defaults: { amount: 100 } },
  { type: "brightness", label: "Brightness", defaults: { amount: 100 } },
  { type: "contrast", label: "Contrast", defaults: { amount: 100 } },
  { type: "saturation", label: "Saturation", defaults: { amount: 100 } },
  { type: "hue", label: "Hue Rotate", defaults: { degrees: 0 } },
  { type: "blur", label: "Blur", defaults: { radius: 0 } },
  { type: "sharpen", label: "Sharpen", defaults: { amount: 0.35 } },
  { type: "pixelate", label: "Pixelate", defaults: { size: 8 } },
  { type: "grayscale", label: "Black & White", defaults: {} },
  { type: "threshold", label: "Threshold B&W", defaults: { level: 128 } },
  { type: "invert", label: "Invert", defaults: {} },
  { type: "sepia", label: "Sepia", defaults: { amount: 100 } },
  { type: "text", label: "Add Text", defaults: {
    text: DEFAULT_TEXT,
    x: 24,
    y: 24,
    width: 360,
    height: 64,
    size: 32,
    color: "#ffffff",
    font: "Roboto",
    weight: "700",
    align: "left",
    baseline: "top",
    shadow: true,
  } },
  { type: "watermark", label: "Image Watermark", defaults: {
    imageData: "",
    opacity: 35,
    repeat: true,
    x: 24,
    y: 24,
    width: 128,
    height: 128,
    gapX: 32,
    gapY: 32,
  } },
  { type: "format", label: "Output Format", defaults: { format: "image/png", quality: 0.92 } },
  { type: "rename", label: "Rename", defaults: { pattern: "{{filename}}_processed" } },
];

const TRANSFORM_MAP = new Map(TRANSFORMS.map((item) => [item.type, item]));
const FILTER_TYPES = new Set(["brightness", "contrast", "saturation", "hue", "blur", "grayscale", "invert", "sepia", "opacity"]);

export const batchProcessorTool = {
  id: "batch-processor",
  name: "Batch Processor",
  description: "Stack repeatable image transformations and export the same recipe across many images.",
  create(context) {
    return new BatchProcessor(context);
  },
};

class BatchProcessor {
  constructor(context) {
    this.context = context;
    this.handlesOwnImports = true;
    this.assets = [];
    this.steps = [];
    this.activeStepId = null;
    this.draggedStepId = null;
    this.previewDrag = null;
    this.previewEdit = null;
    this.previewTimer = 0;
    this.previewCanvas = document.createElement("canvas");
    this.previewCanvas.width = 1;
    this.previewCanvas.height = 1;
    this.output = { format: "image/png", quality: 0.92, rename: "{{filename}}_processed" };
  }

  mount(root) {
    this.root = root;
    root.innerHTML = template();
    this.captureElements(root);
    this.bindEvents();
    this.render();
  }

  captureElements(root) {
    this.preview = role(root, "batch-preview");
    this.previewContext = this.preview.getContext("2d");
    this.batchInfo = role(root, "batch-info");
    this.stepList = role(root, "step-list");
    this.warning = role(root, "warning");
    this.previewRoot = role(root, "previews");
    this.exportCount = role(root, "export-count");
    this.recipeInput = role(root, "recipe-input");
    this.multiInput = role(root, "multi-input");
    this.folderInput = role(root, "folder-input");
    this.zipInput = role(root, "zip-input");
    this.format = role(root, "output-format");
    this.quality = role(root, "output-quality");
    this.rename = role(root, "output-rename");
    this.loadGoogleFonts();
  }

  bindEvents() {
    const clearStepsButton = this.root.querySelector('[data-action="clear-steps"]');
    clearStepsButton.innerHTML = '<img src="./src/assets/close.png" alt="" aria-hidden="true" />';
    clearStepsButton.setAttribute("aria-label", "Clear steps");
    this.multiInput.addEventListener("change", () => this.loadFiles([...this.multiInput.files]));
    this.folderInput.addEventListener("change", () => this.loadFiles([...this.folderInput.files]));
    this.zipInput.addEventListener("change", () => this.loadZipFile(this.zipInput.files?.[0]));
    clearStepsButton.addEventListener("click", () => this.clearSteps());
    this.root.querySelector('[data-action="export-recipe"]').addEventListener("click", () => this.exportRecipe());
    this.recipeInput.addEventListener("change", () => this.importRecipe(this.recipeInput.files?.[0]));
    bindInputEvents([this.format, this.quality, this.rename], () => {
      this.output.format = this.format.value;
      this.output.quality = clamp(Number(this.quality.value || 0.92), 0.1, 1);
      this.output.rename = this.rename.value || "{{filename}}_processed";
      this.renderDynamic();
    });
    this.preview.addEventListener("pointerdown", (event) => this.onPreviewPointerDown(event));
    this.preview.addEventListener("pointermove", (event) => this.onPreviewPointerMove(event));
    this.preview.addEventListener("pointerup", (event) => this.onPreviewPointerUp(event));
    this.preview.addEventListener("pointercancel", (event) => this.onPreviewPointerUp(event));
    this.preview.addEventListener("pointerleave", () => {
      if (!this.previewDrag) this.preview.style.cursor = "default";
    });
  }

  unmount() {
    clearTimeout(this.previewTimer);
    this.root = null;
  }

  async loadFiles(files) {
    const imageFiles = files.filter((file) => file.type?.startsWith("image/") || IMAGE_EXTENSIONS.test(file.name));
    if (!imageFiles.length) {
      this.context.notify("No browser-supported images were found.");
      return;
    }
    const assets = [];
    for (const file of imageFiles) {
      try {
        assets.push(await this.context.imageLoader.loadImageFile(file));
      } catch {
        // Ignore unreadable images in a mixed batch.
      }
    }
    if (!assets.length) {
      this.context.notify("The selected images could not be decoded.");
      return;
    }
    this.assets = assets;
    this.context.setEmptyStateHidden(true);
    this.context.notify(`Loaded ${assets.length} image${assets.length === 1 ? "" : "s"}`);
    this.render();
  }

  async loadZipFile(file) {
    if (!file) return;
    if (!window.JSZip) {
      this.context.notify("JSZip did not load from the CDN.");
      return;
    }
    try {
      const zip = await window.JSZip.loadAsync(file);
      const files = [];
      for (const entry of Object.values(zip.files)) {
        if (entry.dir || !IMAGE_EXTENSIONS.test(entry.name)) continue;
        const blob = await entry.async("blob");
        files.push(new File([blob], entry.name.split(/[\\/]/).pop(), { type: mimeTypeForName(entry.name) }));
      }
      await this.loadFiles(files);
    } catch (error) {
      this.context.notify(error.message || "The ZIP file could not be read.");
    }
  }

  loadImage(asset) {
    this.assets = [asset];
    this.context.setEmptyStateHidden(true);
    this.render();
  }

  reset() {
    this.steps = [];
    this.activeStepId = null;
    this.output = { format: "image/png", quality: 0.92, rename: "{{filename}}_processed" };
    this.format.value = this.output.format;
    this.quality.value = String(this.output.quality);
    this.rename.value = this.output.rename;
    this.render();
  }

  appendStep(type) {
    const spec = TRANSFORM_MAP.get(type);
    if (!spec) return;
    const step = { id: makeId(), type, params: structuredClone(spec.defaults) };
    this.steps.push(step);
    this.activeStepId = step.id;
    this.render();
  }

  clearSteps() {
    this.steps = [];
    this.activeStepId = null;
    this.render();
  }

  getExportItems() {
    if (!this.assets.length) return [];
    return this.assets.map((asset, index) => {
      const metadata = getMetadata(asset, index, this.assets.length);
      const format = this.getOutputFormat();
      return {
        filename: this.getOutputFilename(metadata, format),
        type: format.mime,
        getBlob: async () => {
          const canvas = await this.processAsset(asset, index);
          return this.context.canvasUtils.canvasToBlob(canvas, format.mime, format.quality);
        },
      };
    });
  }

  async processAsset(asset, index) {
    let canvas = imageToCanvas(asset.image, asset.width, asset.height);
    for (const step of this.steps) {
      canvas = await applyStep(canvas, step, getMetadata(asset, index, this.assets.length));
      await nextFrame();
    }
    return canvas;
  }

  async processAssetBeforeStep(asset, index, targetStepId) {
    let canvas = imageToCanvas(asset.image, asset.width, asset.height);
    for (const step of this.steps) {
      if (step.id === targetStepId) break;
      canvas = await applyStep(canvas, step, getMetadata(asset, index, this.assets.length));
      await nextFrame();
    }
    return canvas;
  }

  render() {
    this.renderStepList();
    this.renderPreviewSummary();
    this.schedulePreview();
    this.context.setDirtyState();
  }

  renderDynamic() {
    this.renderPreviewSummary();
    this.schedulePreview();
    this.context.setDirtyState();
  }

  renderStepList() {
    this.stepList.innerHTML = "";
    if (this.activeStepId && !this.steps.some((step) => step.id === this.activeStepId)) {
      this.activeStepId = this.steps[0]?.id || null;
    }
    this.steps.forEach((step, index) => this.stepList.append(this.createStepEditor(step, index)));
    this.stepList.append(this.createAddStepCard());
  }

  createStepEditor(step, index) {
    const spec = TRANSFORM_MAP.get(step.type);
    const isActive = step.id === this.activeStepId;
    const row = document.createElement("div");
    row.className = `batch-step${isActive ? " active" : ""}`;
    row.dataset.stepId = step.id;
    row.innerHTML = `
      <div class="batch-step-head">
        <strong>${index + 1}. ${spec?.label || step.type}</strong>
        <div class="mini-button-row">
          <button type="button" data-action="up" title="Move up">↑</button>
          <button type="button" data-action="down" title="Move down">↓</button>
          <button type="button" data-action="remove" title="Remove">×</button>
        </div>
      </div>
      <div class="batch-step-fields"></div>
    `;
    const fields = row.querySelector(".batch-step-fields");
    fields.append(...fieldsForStep(step));
    fields.hidden = !isActive;
    const head = row.querySelector(".batch-step-head");
    head.dataset.action = "select-step";
    head.setAttribute("aria-expanded", isActive ? "true" : "false");
    const grip = document.createElement("button");
    grip.className = "batch-step-grip";
    grip.type = "button";
    grip.draggable = true;
    grip.dataset.action = "drag-step";
    grip.title = "Drag to reorder";
    grip.textContent = "::";
    head.prepend(grip);
    head.querySelector("strong").innerHTML = `<span class="batch-step-number">${index + 1}</span> ${spec?.label || step.type}`;
    row.querySelector('[data-action="up"]').innerHTML = '<img src="./src/assets/up-chevron.png" alt="" aria-hidden="true" />';
    row.querySelector('[data-action="up"]').setAttribute("aria-label", "Move up");
    row.querySelector('[data-action="down"]').innerHTML = '<img src="./src/assets/down-chevron.png" alt="" aria-hidden="true" />';
    row.querySelector('[data-action="down"]').setAttribute("aria-label", "Move down");
    row.querySelector('[data-action="remove"]').innerHTML = '<img src="./src/assets/close.png" alt="" aria-hidden="true" />';
    row.querySelector('[data-action="remove"]').setAttribute("aria-label", "Remove");
    head.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      this.activeStepId = isActive ? null : step.id;
      this.render();
    });
    row.querySelector('[data-action="up"]').disabled = index === 0;
    row.querySelector('[data-action="down"]').disabled = index === this.steps.length - 1;
    row.querySelector('[data-action="up"]').addEventListener("click", () => this.moveStep(index, -1));
    row.querySelector('[data-action="down"]').addEventListener("click", () => this.moveStep(index, 1));
    row.querySelector('[data-action="remove"]').addEventListener("click", () => {
      const nextStep = this.steps[index + 1] || this.steps[index - 1] || null;
      this.steps.splice(index, 1);
      if (this.activeStepId === step.id) this.activeStepId = nextStep?.id || null;
      this.render();
    });
    grip.addEventListener("dragstart", (event) => {
      this.draggedStepId = step.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", step.id);
    });
    row.addEventListener("dragover", (event) => {
      if (!this.draggedStepId || this.draggedStepId === step.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      row.classList.remove("drag-over");
      this.moveStepById(this.draggedStepId, step.id);
    });
    row.addEventListener("dragend", () => {
      this.draggedStepId = null;
      row.classList.remove("drag-over");
    });
    bindInputEvents([...fields.querySelectorAll("input, select")], async (event) => {
      const input = event.currentTarget;
      if (input.type === "file") {
        const file = input.files?.[0];
        if (!file) return;
        step.params.imageData = await readFileAsDataUrl(file);
        step.params._image = await loadImageFromDataUrl(step.params.imageData);
      } else {
        step.params[input.name] = parseInputValue(input);
        if (step.type === "rounded" && input.name === "radius") {
          step.params.percent = radiusToPercent(step.params.radius, this.previewEdit?.baseCanvas || this.previewCanvas);
          const percentInput = fields.querySelector('input[name="percent"]');
          if (percentInput) percentInput.value = String(step.params.percent);
        }
        if (step.type === "rounded" && input.name === "percent") {
          step.params.radius = percentToRadius(step.params.percent, this.previewEdit?.baseCanvas || this.previewCanvas);
          const radiusInput = fields.querySelector('input[name="radius"]');
          if (radiusInput) radiusInput.value = String(step.params.radius);
        }
      }
      this.renderDynamic();
    });
    return row;
  }

  createAddStepCard() {
    const card = document.createElement("div");
    card.className = "batch-step batch-add-step";
    card.innerHTML = `
      <div class="batch-step-head">
        <strong>${this.steps.length + 1} Add Step</strong>
      </div>
      <div class="batch-step-fields batch-add-step-fields">
        <div class="field">
          <label for="batch-step-type">Transformation</label>
          <select id="batch-step-type" data-role="step-type">
            ${TRANSFORMS.map((item) => `<option value="${item.type}">${item.label}</option>`).join("")}
          </select>
        </div>
        <button class="primary-button full-button" data-role="add-step" type="button" title="Add step"><img src="./src/assets/plus.png" alt="" aria-hidden="true" />Add Step</button>
      </div>
    `;
    const select = card.querySelector('[data-role="step-type"]');
    card.querySelector('[data-role="add-step"]').addEventListener("click", () => this.appendStep(select.value));
    return card;
  }

  moveStep(index, direction) {
    const next = index + direction;
    if (next < 0 || next >= this.steps.length) return;
    const [step] = this.steps.splice(index, 1);
    this.steps.splice(next, 0, step);
    this.activeStepId = step.id;
    this.render();
  }

  moveStepById(sourceId, targetId) {
    const sourceIndex = this.steps.findIndex((step) => step.id === sourceId);
    const targetIndex = this.steps.findIndex((step) => step.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const [step] = this.steps.splice(sourceIndex, 1);
    this.steps.splice(targetIndex, 0, step);
    this.activeStepId = step.id;
    this.draggedStepId = null;
    this.render();
  }

  schedulePreview() {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.renderPreview(), 50);
  }

  async renderPreview() {
    if (!this.assets.length) {
      clearCanvas(this.preview, this.previewContext);
      setWarning(this.warning, "Import a ZIP, folder, or image batch to preview the first image.");
      return;
    }
    setWarning(this.warning, []);
    try {
      const activeStep = this.steps.find((step) => step.id === this.activeStepId);
      if (activeStep && (activeStep.type === "crop" || activeStep.type === "text")) {
        const baseCanvas = await this.processAssetBeforeStep(this.assets[0], 0, activeStep.id);
        this.previewCanvas = baseCanvas;
        const fit = drawFittedCanvas(baseCanvas, this.preview, this.previewContext);
        this.previewEdit = { step: activeStep, baseCanvas, fit };
        this.drawPreviewEditOverlay();
      } else {
        this.previewCanvas = await this.processAsset(this.assets[0], 0);
        drawFittedCanvas(this.previewCanvas, this.preview, this.previewContext);
        this.previewEdit = null;
      }
    } catch (error) {
      setWarning(this.warning, error.message);
    }
  }

  drawPreviewEditOverlay() {
    if (!this.previewEdit) return;
    const { step, fit } = this.previewEdit;
    const rect = this.getStepRect(step);
    const view = sourceRectToPreview(rect, fit);
    const ctx = this.previewContext;
    ctx.save();
    if (step.type === "crop") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(fit.x, fit.y, fit.width, Math.max(0, view.y - fit.y));
      ctx.fillRect(fit.x, view.y + view.height, fit.width, Math.max(0, fit.y + fit.height - view.y - view.height));
      ctx.fillRect(fit.x, view.y, Math.max(0, view.x - fit.x), view.height);
      ctx.fillRect(view.x + view.width, view.y, Math.max(0, fit.x + fit.width - view.x - view.width), view.height);
    }
    ctx.strokeStyle = "#ff6a5a";
    ctx.fillStyle = "#ff6a5a";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(view.x, view.y, view.width, view.height);
    ctx.setLineDash([]);
    for (const handle of getRectHandles(view)) {
      ctx.fillRect(handle.x - 5, handle.y - 5, 10, 10);
    }
    ctx.restore();
  }

  getStepRect(step) {
    const p = step.params;
    if (step.type === "text") {
      return {
        x: Number(p.x || 0),
        y: Number(p.y || 0),
        width: Number(p.width || 240),
        height: Number(p.height || Math.max(1, Number(p.size || 32) * 1.4)),
      };
    }
    return {
      x: Number(p.x || 0),
      y: Number(p.y || 0),
      width: Number(p.width || 1),
      height: Number(p.height || 1),
    };
  }

  onPreviewPointerDown(event) {
    const hit = this.getPreviewHit(event);
    if (!hit) return;
    event.preventDefault();
    this.previewDrag = {
      pointerId: event.pointerId,
      mode: hit.mode,
      handle: hit.handle,
      startPointer: hit.source,
      startRect: this.getStepRect(this.previewEdit.step),
    };
    this.preview.setPointerCapture?.(event.pointerId);
  }

  onPreviewPointerMove(event) {
    if (!this.previewEdit) return;
    if (!this.previewDrag) {
      const hit = this.getPreviewHit(event);
      this.preview.style.cursor = hit ? cursorForHit(hit) : "default";
      return;
    }
    if (this.previewDrag.pointerId !== event.pointerId) return;
    const pointer = this.eventToSourcePoint(event);
    if (!pointer) return;
    const dx = pointer.x - this.previewDrag.startPointer.x;
    const dy = pointer.y - this.previewDrag.startPointer.y;
    const rect = adjustRect(this.previewDrag.startRect, dx, dy, this.previewDrag);
    this.applyStepRect(this.previewEdit.step, rect);
    this.renderDynamic();
  }

  onPreviewPointerUp(event) {
    if (!this.previewDrag || this.previewDrag.pointerId !== event.pointerId) return;
    this.preview.releasePointerCapture?.(event.pointerId);
    this.previewDrag = null;
  }

  getPreviewHit(event) {
    if (!this.previewEdit) return null;
    const source = this.eventToSourcePoint(event);
    if (!source) return null;
    const rect = this.getStepRect(this.previewEdit.step);
    const view = sourceRectToPreview(rect, this.previewEdit.fit);
    const point = eventToCanvasPoint(this.preview, event);
    const handles = getRectHandles(view);
    const handle = handles.find((item) => Math.hypot(point.x - item.x, point.y - item.y) <= 9);
    if (handle) return { mode: "resize", handle: handle.name, source };
    if (point.x >= view.x && point.x <= view.x + view.width && point.y >= view.y && point.y <= view.y + view.height) {
      return { mode: "move", source };
    }
    return null;
  }

  eventToSourcePoint(event) {
    if (!this.previewEdit) return null;
    const point = eventToCanvasPoint(this.preview, event);
    const { fit } = this.previewEdit;
    return {
      x: clamp((point.x - fit.x) / fit.scale, 0, this.previewEdit.baseCanvas.width),
      y: clamp((point.y - fit.y) / fit.scale, 0, this.previewEdit.baseCanvas.height),
    };
  }

  applyStepRect(step, rect) {
    const base = this.previewEdit.baseCanvas;
    step.params.x = Math.round(clamp(rect.x, 0, base.width - 1));
    step.params.y = Math.round(clamp(rect.y, 0, base.height - 1));
    step.params.width = Math.round(clamp(rect.width, 1, base.width - step.params.x));
    step.params.height = Math.round(clamp(rect.height, 1, base.height - step.params.y));
    if (step.type === "text") {
      step.params.size = Math.max(1, Math.round(step.params.height * 0.6));
    }
    this.updateActiveFieldValues(step);
  }

  updateActiveFieldValues(step) {
    const row = this.stepList.querySelector(`[data-step-id="${step.id}"]`);
    if (!row) return;
    for (const input of row.querySelectorAll("input, select")) {
      if (input.type === "file") continue;
      if (Object.hasOwn(step.params, input.name)) input.value = String(step.params[input.name]);
    }
  }

  loadGoogleFonts() {
    if (document.getElementById("batch-google-fonts")) return;
    const link = document.createElement("link");
    link.id = "batch-google-fonts";
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${GOOGLE_FONTS.map((font) => `family=${encodeURIComponent(font)}:wght@400;700`).join("&")}&display=swap`;
    document.head.append(link);
  }

  renderPreviewSummary() {
    const count = this.getExportItems().length;
    const first = this.assets[0];
    this.batchInfo.textContent = first
      ? `${this.assets.length} image${this.assets.length === 1 ? "" : "s"} · first: ${first.fileName} · ${first.width} x ${first.height}`
      : "No batch loaded";
    this.exportCount.textContent = `${count} file${count === 1 ? "" : "s"}`;
    this.previewRoot.innerHTML = "";
    if (!first) return;
    const max = Math.min(this.assets.length, 8);
    for (let index = 0; index < max; index += 1) {
      const asset = this.assets[index];
      const format = this.getOutputFormat();
      const card = createPreviewCard(this.getOutputFilename(getMetadata(asset, index, this.assets.length), format), `${asset.width} x ${asset.height}`);
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      drawImageThumbnail(asset.image, asset.width, asset.height, canvas);
      card.append(canvas);
      this.previewRoot.append(card);
    }
  }

  getOutputFormat() {
    const formatStep = [...this.steps].reverse().find((step) => step.type === "format");
    const mime = formatStep?.params?.format || this.output.format || "image/png";
    const quality = clamp(Number(formatStep?.params?.quality ?? this.output.quality ?? 0.92), 0.1, 1);
    const extension = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
    return { mime, extension, quality };
  }

  getOutputFilename(metadata, format) {
    const renameStep = [...this.steps].reverse().find((step) => step.type === "rename");
    const pattern = renameStep?.params?.pattern || this.output.rename || "{{filename}}_processed";
    return `${safeName(expandPlaceholders(pattern, metadata))}.${format.extension}`;
  }

  exportRecipe() {
    const recipe = {
      version: 1,
      output: this.output,
      steps: this.steps.map((step) => ({ type: step.type, params: recipeParams(step.params) })),
    };
    const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" });
    this.context.downloadManager.downloadBlob(blob, "batch_recipe.json");
  }

  async importRecipe(file) {
    if (!file) return;
    try {
      const recipe = JSON.parse(await file.text());
      this.steps = (recipe.steps || [])
        .filter((step) => TRANSFORM_MAP.has(step.type))
        .map((step) => ({ id: makeId(), type: step.type, params: { ...TRANSFORM_MAP.get(step.type).defaults, ...step.params } }));
      this.activeStepId = this.steps[0]?.id || null;
      this.output = { ...this.output, ...recipe.output };
      this.format.value = this.output.format;
      this.quality.value = String(this.output.quality);
      this.rename.value = this.output.rename;
      this.context.notify(`Loaded ${this.steps.length} recipe step${this.steps.length === 1 ? "" : "s"}`);
      this.render();
    } catch (error) {
      this.context.notify(error.message || "Recipe JSON could not be loaded.");
    } finally {
      this.recipeInput.value = "";
    }
  }
}

function template() {
  return `
    <div class="tool-layout batch-layout">
      <section class="editor-pane">
        <div class="pane-title">
          <h2>Batch Preview</h2>
          <span data-role="batch-info">No batch loaded</span>
        </div>
        <div class="canvas-stage batch-preview-stage">
          <canvas data-role="batch-preview" width="720" height="480"></canvas>
        </div>
        <div class="warning" data-role="warning"></div>
        <div class="pane-title">
          <h2>Export Preview</h2>
          <span data-role="export-count">0 files</span>
        </div>
        <div class="preview-grid" data-role="previews"></div>
      </section>
      <aside class="settings-pane">
        <div class="control-group">
          <h3>Import</h3>
          <div class="batch-imports">
            <label class="primary-button batch-file-button" title="Import images"><img src="./src/assets/import.png" alt="" aria-hidden="true" />Images<input data-role="multi-input" type="file" accept="image/*" multiple /></label>
            <label class="primary-button batch-file-button" title="Import folder"><img src="./src/assets/folder.png" alt="" aria-hidden="true" />Folder<input data-role="folder-input" type="file" accept="image/*" webkitdirectory multiple /></label>
            <label class="primary-button batch-file-button" title="Import ZIP"><img src="./src/assets/zip.png" alt="" aria-hidden="true" />ZIP<input data-role="zip-input" type="file" accept=".zip,application/zip" /></label>
          </div>
        </div>
        <div class="control-group">
          <div class="control-header">
            <h3>Transform Stack</h3>
            <button class="icon-button" type="button" data-action="clear-steps" title="Clear steps">×</button>
          </div>
          <div class="batch-step-list" data-role="step-list"></div>
        </div>
        <div class="control-group">
          <h3>Output</h3>
          <div class="batch-output-fields">
            <div class="field">
              <label>Format</label>
              <select data-role="output-format">
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/webp">WebP</option>
              </select>
            </div>
            <div class="field">
              <label>Quality</label>
              <input data-role="output-quality" type="number" min="0.1" max="1" step="0.01" value="0.92" />
            </div>
          </div>
          <div class="field batch-output-rename">
            <label>Filename</label>
            <input data-role="output-rename" type="text" value="{{filename}}_processed" />
            <span class="field-help">{{filename}}, {{extension}}, {{number}}, {{index}}, {{today}}, {{width}}, {{height}}</span>
          </div>
        </div>
        <div class="control-group">
          <h3>Recipe</h3>
          <div class="button-row">
            <button type="button" data-action="export-recipe" title="Export recipe JSON"><img src="./src/assets/export.png" alt="" aria-hidden="true" />Export JSON</button>
            <label class="batch-file-button secondary-file-button" title="Load recipe JSON"><img src="./src/assets/file.png" alt="" aria-hidden="true" />Load JSON<input data-role="recipe-input" type="file" accept="application/json,.json" /></label>
          </div>
        </div>
      </aside>
    </div>
  `;
}

function fieldsForStep(step) {
  const p = step.params;
  const field = (name, label, type = "number", attrs = "") => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.innerHTML = `<label>${label}</label><input name="${name}" type="${type}" value="${escapeAttr(p[name] ?? "")}" ${attrs} />`;
    return wrap;
  };
  const select = (name, label, options) => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.innerHTML = `<label>${label}</label><select name="${name}">${options.map(([value, text]) => (
      `<option value="${value}" ${String(p[name]) === String(value) ? "selected" : ""}>${text}</option>`
    )).join("")}</select>`;
    return wrap;
  };
  const fontSelect = (name, label) => select(name, label, GOOGLE_FONTS.map((font) => [font, font]));
  const file = (name, label, help = "") => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.innerHTML = `<label>${label}</label><input name="${name}" type="file" accept="image/*" />${help ? `<span class="field-help">${help}</span>` : ""}`;
    return wrap;
  };
  const color = (name, label) => field(name, label, "text");
  const grid = (...items) => {
    const wrap = document.createElement("div");
    wrap.className = "field-grid";
    wrap.append(...items);
    return wrap;
  };

  switch (step.type) {
    case "scale": return [field("percent", "Percent", "number", 'min="1" max="800" step="1"')];
    case "resize": return [grid(field("width", "Width"), field("height", "Height")), select("mode", "Mode", [["preserve", "Preserve ratio"], ["stretch", "Stretch"]])];
    case "fit":
    case "cover": return [grid(field("width", "Width"), field("height", "Height")), ...(step.type === "fit" ? [color("color", "Fill color")] : [])];
    case "rotate": return [field("degrees", "Degrees", "number", 'step="1"'), select("expand", "Canvas", [[true, "Expand"], [false, "Keep size"]])];
    case "flip": return [select("axis", "Axis", [["horizontal", "Horizontal"], ["vertical", "Vertical"], ["both", "Both"]])];
    case "crop": return [grid(field("x", "X"), field("y", "Y")), grid(field("width", "Width"), field("height", "Height"))];
    case "trim": return [field("threshold", "Alpha threshold", "number", 'min="0" max="255"')];
    case "pad": return [grid(field("left", "Left"), field("right", "Right")), grid(field("top", "Top"), field("bottom", "Bottom")), color("color", "Fill color")];
    case "background": return [color("color", "Fill color")];
    case "border": return [field("size", "Size"), color("color", "Color")];
    case "rounded": return [grid(field("radius", "Radius px", "number", 'min="0" step="1"'), field("percent", "Radius %", "number", 'min="0" max="50" step="1"'))];
    case "opacity":
    case "brightness":
    case "contrast":
    case "saturation":
    case "sepia": return [field("amount", "Amount", "number", 'min="0" max="300" step="1"')];
    case "hue": return [field("degrees", "Degrees", "number", 'step="1"')];
    case "blur": return [field("radius", "Radius", "number", 'min="0" step="0.5"')];
    case "sharpen": return [field("amount", "Amount", "number", 'min="0" max="2" step="0.05"')];
    case "pixelate": return [field("size", "Block size", "number", 'min="1" step="1"')];
    case "threshold": return [field("level", "Level", "number", 'min="0" max="255"')];
    case "text": return [
      field("text", "Text", "text"),
      grid(field("x", "X"), field("y", "Y")),
      grid(field("width", "Width"), field("height", "Height")),
      grid(field("size", "Size"), color("color", "Color")),
      grid(fontSelect("font", "Font"), field("weight", "Weight", "text")),
      select("align", "Align", [["left", "Left"], ["center", "Center"], ["right", "Right"]]),
      select("baseline", "Baseline", [["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"], ["alphabetic", "Alphabetic"]]),
      select("shadow", "Shadow", [[true, "On"], [false, "Off"]]),
    ];
    case "watermark": return [
      file("imageFile", "Watermark image", p.imageData ? "Image loaded into this recipe." : "Choose a PNG, JPEG, WebP, or SVG watermark."),
      grid(field("opacity", "Opacity %", "number", 'min="0" max="100" step="1"'), select("repeat", "Repeat", [[true, "On"], [false, "Off"]])),
      grid(field("x", "X"), field("y", "Y")),
      grid(field("width", "Width"), field("height", "Height")),
      grid(field("gapX", "Repeat gap X"), field("gapY", "Repeat gap Y")),
    ];
    case "format": return [select("format", "Format", [["image/png", "PNG"], ["image/jpeg", "JPEG"], ["image/webp", "WebP"]]), field("quality", "Quality", "number", 'min="0.1" max="1" step="0.01"')];
    case "rename": return [field("pattern", "Pattern", "text")];
    default: return [];
  }
}

async function applyStep(canvas, step, metadata) {
  const p = step.params || {};
  if (step.type === "format") return canvas;
  if (step.type === "rename") return canvas;
  if (FILTER_TYPES.has(step.type)) return applyFilter(canvas, step);
  switch (step.type) {
    case "scale": return resizeCanvas(canvas, canvas.width * Number(p.percent || 100) / 100, canvas.height * Number(p.percent || 100) / 100);
    case "resize": return p.mode === "preserve" ? resizePreserve(canvas, Number(p.width), Number(p.height)) : resizeCanvas(canvas, Number(p.width), Number(p.height));
    case "fit": return containCanvas(canvas, Number(p.width), Number(p.height), p.color);
    case "cover": return coverCanvas(canvas, Number(p.width), Number(p.height));
    case "rotate": return rotateCanvas(canvas, Number(p.degrees || 0), p.expand !== false && p.expand !== "false");
    case "flip": return flipCanvas(canvas, p.axis);
    case "crop": return cropCanvas(canvas, Number(p.x), Number(p.y), Number(p.width), Number(p.height));
    case "trim": return trimTransparent(canvas, Number(p.threshold || 8));
    case "pad": return padCanvas(canvas, Number(p.left), Number(p.right), Number(p.top), Number(p.bottom), p.color);
    case "background": return backgroundCanvas(canvas, p.color);
    case "border": return padCanvas(canvas, Number(p.size), Number(p.size), Number(p.size), Number(p.size), p.color);
    case "rounded": return roundedCanvas(canvas, getRoundedRadius(canvas, p));
    case "sharpen": return sharpenCanvas(canvas, Number(p.amount || 0.35));
    case "pixelate": return pixelateCanvas(canvas, Number(p.size || 8));
    case "threshold": return thresholdCanvas(canvas, Number(p.level || 128));
    case "text": return textCanvas(canvas, p, metadata);
    case "watermark": return watermarkCanvas(canvas, p);
    default: return canvas;
  }
}

function imageToCanvas(image, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(image, 0, 0);
  return canvas;
}

function newCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width || 1));
  canvas.height = Math.max(1, Math.round(height || 1));
  return canvas;
}

function resizeCanvas(source, width, height) {
  const canvas = newCanvas(width, height);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function resizePreserve(source, width, height) {
  const scale = Math.min(width / source.width, height / source.height);
  return resizeCanvas(source, source.width * scale, source.height * scale);
}

function containCanvas(source, width, height, color) {
  const canvas = newCanvas(width, height);
  const ctx = canvas.getContext("2d");
  fillBackground(ctx, canvas.width, canvas.height, color);
  const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
  const w = source.width * scale;
  const h = source.height * scale;
  ctx.drawImage(source, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  return canvas;
}

function coverCanvas(source, width, height) {
  const canvas = newCanvas(width, height);
  const scale = Math.max(canvas.width / source.width, canvas.height / source.height);
  const w = source.width * scale;
  const h = source.height * scale;
  canvas.getContext("2d").drawImage(source, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  return canvas;
}

function rotateCanvas(source, degrees, expand) {
  const radians = degrees * Math.PI / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const width = expand ? source.width * cos + source.height * sin : source.width;
  const height = expand ? source.width * sin + source.height * cos : source.height;
  const canvas = newCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function flipCanvas(source, axis) {
  const canvas = newCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  const sx = axis === "vertical" ? 1 : -1;
  const sy = axis === "horizontal" ? 1 : -1;
  ctx.translate(sx < 0 ? canvas.width : 0, sy < 0 ? canvas.height : 0);
  ctx.scale(sx, sy);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function cropCanvas(source, x, y, width, height) {
  const canvas = newCanvas(width, height);
  canvas.getContext("2d").drawImage(source, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function padCanvas(source, left, right, top, bottom, color) {
  const canvas = newCanvas(source.width + left + right, source.height + top + bottom);
  const ctx = canvas.getContext("2d");
  fillBackground(ctx, canvas.width, canvas.height, color);
  ctx.drawImage(source, left, top);
  return canvas;
}

function backgroundCanvas(source, color) {
  const canvas = newCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  fillBackground(ctx, canvas.width, canvas.height, color);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function roundedCanvas(source, radius) {
  const canvas = newCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  const r = Math.min(radius, source.width / 2, source.height / 2);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(source.width, 0, source.width, source.height, r);
  ctx.arcTo(source.width, source.height, 0, source.height, r);
  ctx.arcTo(0, source.height, 0, 0, r);
  ctx.arcTo(0, 0, source.width, 0, r);
  ctx.clip();
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function getRoundedRadius(source, params) {
  if (Number(params.percent || 0) > 0) return percentToRadius(params.percent, source);
  return Number(params.radius || 0);
}

function applyFilter(source, step) {
  const p = step.params || {};
  const filters = {
    opacity: `opacity(${Number(p.amount || 100)}%)`,
    brightness: `brightness(${Number(p.amount || 100)}%)`,
    contrast: `contrast(${Number(p.amount || 100)}%)`,
    saturation: `saturate(${Number(p.amount || 100)}%)`,
    hue: `hue-rotate(${Number(p.degrees || 0)}deg)`,
    blur: `blur(${Number(p.radius || 0)}px)`,
    grayscale: "grayscale(100%)",
    invert: "invert(100%)",
    sepia: `sepia(${Number(p.amount || 100)}%)`,
  };
  const canvas = newCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  ctx.filter = filters[step.type] || "none";
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function thresholdCanvas(source, level) {
  const canvas = newCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const gray = imageData.data[i] * 0.299 + imageData.data[i + 1] * 0.587 + imageData.data[i + 2] * 0.114;
    const value = gray >= level ? 255 : 0;
    imageData.data[i] = value;
    imageData.data[i + 1] = value;
    imageData.data[i + 2] = value;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function sharpenCanvas(source, amount) {
  if (amount <= 0) return source;
  const canvas = newCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const out = ctx.createImageData(canvas.width, canvas.height);
  const w = canvas.width;
  const kernel = [0, -amount, 0, -amount, 1 + 4 * amount, -amount, 0, -amount, 0];
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        let value = 0;
        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            const px = clamp(x + kx, 0, canvas.width - 1);
            const py = clamp(y + ky, 0, canvas.height - 1);
            value += src.data[(py * w + px) * 4 + c] * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        out.data[(y * w + x) * 4 + c] = c === 3 ? src.data[(y * w + x) * 4 + c] : clamp(value, 0, 255);
      }
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

function pixelateCanvas(source, size) {
  const block = Math.max(1, Math.round(size));
  const small = newCanvas(Math.ceil(source.width / block), Math.ceil(source.height / block));
  const smallCtx = small.getContext("2d");
  smallCtx.imageSmoothingEnabled = false;
  smallCtx.drawImage(source, 0, 0, small.width, small.height);
  const canvas = newCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function trimTransparent(source, threshold) {
  const ctx = source.getContext("2d");
  const data = ctx.getImageData(0, 0, source.width, source.height).data;
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (data[(y * source.width + x) * 4 + 3] <= threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return source;
  return cropCanvas(source, minX, minY, maxX - minX + 1, maxY - minY + 1);
}

function textCanvas(source, params, metadata) {
  const canvas = newCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const size = Math.max(1, Number(params.size || 32));
  const lineHeight = size * 1.18;
  const x = Number(params.x || 0);
  const y = Number(params.y || 0);
  const width = Math.max(1, Number(params.width || source.width - x));
  const height = Math.max(1, Number(params.height || lineHeight));
  ctx.font = `${params.weight || "400"} ${size}px "${params.font || "Roboto"}"`;
  ctx.fillStyle = params.color || "#ffffff";
  ctx.textAlign = params.align || "left";
  ctx.textBaseline = params.baseline || "top";
  if (params.shadow === true || params.shadow === "true") {
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
  }
  const lines = wrapText(ctx, expandPlaceholders(params.text || DEFAULT_TEXT, metadata), width);
  const baseX = params.align === "center" ? x + width / 2 : params.align === "right" ? x + width : x;
  let baseY = y;
  if (params.baseline === "middle") baseY = y + height / 2 - (Math.min(lines.length, Math.floor(height / lineHeight)) * lineHeight) / 2;
  if (params.baseline === "bottom") baseY = y + height - Math.min(lines.length, Math.floor(height / lineHeight)) * lineHeight;
  const maxLines = Math.max(1, Math.floor(height / lineHeight));
  lines.slice(0, maxLines).forEach((line, index) => {
    ctx.fillText(line, baseX, baseY + index * lineHeight);
  });
  return canvas;
}

async function watermarkCanvas(source, params) {
  const canvas = newCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);
  const image = await getWatermarkImage(params);
  if (!image) return canvas;
  const width = Math.max(1, Number(params.width || image.naturalWidth || 1));
  const height = Math.max(1, Number(params.height || image.naturalHeight || 1));
  const x = Number(params.x || 0);
  const y = Number(params.y || 0);
  const opacity = clamp(Number(params.opacity ?? 35), 0, 100) / 100;
  const repeat = params.repeat === true || params.repeat === "true";
  const gapX = Math.max(0, Number(params.gapX || 0));
  const gapY = Math.max(0, Number(params.gapY || 0));
  ctx.save();
  ctx.globalAlpha = opacity;
  if (repeat) {
    for (let yy = y; yy < canvas.height; yy += height + gapY) {
      for (let xx = x; xx < canvas.width; xx += width + gapX) {
        ctx.drawImage(image, xx, yy, width, height);
      }
    }
  } else {
    ctx.drawImage(image, x, y, width, height);
  }
  ctx.restore();
  return canvas;
}

function drawFittedCanvas(source, target, ctx) {
  clearCanvas(target, ctx);
  const scale = Math.min(target.width / source.width, target.height / source.height, 1);
  const width = source.width * scale;
  const height = source.height * scale;
  const x = (target.width - width) / 2;
  const y = (target.height - height) / 2;
  ctx.drawImage(source, x, y, width, height);
  return { x, y, width, height, scale };
}

function drawImageThumbnail(image, width, height, target) {
  const ctx = target.getContext("2d");
  clearCanvas(target, ctx);
  const scale = Math.min(target.width / width, target.height / height, 1);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  ctx.drawImage(image, (target.width - drawWidth) / 2, (target.height - drawHeight) / 2, drawWidth, drawHeight);
}

function clearCanvas(canvas, ctx) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function fillBackground(ctx, width, height, color) {
  if (!color || color === "transparent") return;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
}

function getMetadata(asset, index, total) {
  const fileName = asset.fileName;
  const dot = fileName.lastIndexOf(".");
  const filename = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot + 1) : "";
  const today = new Date().toISOString().slice(0, 10);
  return {
    original: fileName,
    filename,
    extension,
    number: String(index + 1).padStart(String(total).length, "0"),
    index: String(index),
    today,
    width: String(asset.width),
    height: String(asset.height),
  };
}

function expandPlaceholders(pattern, metadata) {
  return String(pattern || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => metadata[key] ?? "");
}

function safeName(value) {
  return String(value || "image").trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_").replace(/\s+/g, "_") || "image";
}

function parseInputValue(input) {
  if (input.tagName === "SELECT" && (input.value === "true" || input.value === "false")) return input.value === "true";
  if (input.type === "number") return Number(input.value);
  return input.value;
}

function recipeParams(params) {
  const clean = { ...params };
  delete clean._image;
  return clean;
}

function radiusToPercent(radius, source) {
  const max = Math.max(1, Math.min(source?.width || 1, source?.height || 1) / 2);
  return Math.round(clamp(Number(radius || 0) / max * 50, 0, 50));
}

function percentToRadius(percent, source) {
  const max = Math.max(1, Math.min(source?.width || 1, source?.height || 1) / 2);
  return Math.round(clamp(Number(percent || 0), 0, 50) / 50 * max);
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function sourceRectToPreview(rect, fit) {
  return {
    x: fit.x + rect.x * fit.scale,
    y: fit.y + rect.y * fit.scale,
    width: rect.width * fit.scale,
    height: rect.height * fit.scale,
  };
}

function getRectHandles(rect) {
  const x1 = rect.x;
  const y1 = rect.y;
  const x2 = rect.x + rect.width;
  const y2 = rect.y + rect.height;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return [
    { name: "nw", x: x1, y: y1 },
    { name: "n", x: cx, y: y1 },
    { name: "ne", x: x2, y: y1 },
    { name: "e", x: x2, y: cy },
    { name: "se", x: x2, y: y2 },
    { name: "s", x: cx, y: y2 },
    { name: "sw", x: x1, y: y2 },
    { name: "w", x: x1, y: cy },
  ];
}

function eventToCanvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function adjustRect(start, dx, dy, drag) {
  const rect = { ...start };
  if (drag.mode === "move") {
    rect.x += dx;
    rect.y += dy;
    return rect;
  }
  if (drag.handle.includes("w")) {
    rect.x += dx;
    rect.width -= dx;
  }
  if (drag.handle.includes("e")) rect.width += dx;
  if (drag.handle.includes("n")) {
    rect.y += dy;
    rect.height -= dy;
  }
  if (drag.handle.includes("s")) rect.height += dy;
  if (rect.width < 1) {
    rect.x += rect.width - 1;
    rect.width = 1;
  }
  if (rect.height < 1) {
    rect.y += rect.height - 1;
    rect.height = 1;
  }
  return rect;
}

function cursorForHit(hit) {
  if (hit.mode === "move") return "move";
  const cursors = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };
  return cursors[hit.handle] || "default";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error || new Error("Could not read watermark image.")));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    if (!dataUrl) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Could not load watermark image.")));
    image.src = dataUrl;
  });
}

async function getWatermarkImage(params) {
  if (params._image) return params._image;
  if (!params.imageData) return null;
  params._image = await loadImageFromDataUrl(params.imageData);
  return params._image;
}

function mimeTypeForName(name) {
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.gif$/i.test(name)) return "image/gif";
  if (/\.avif$/i.test(name)) return "image/avif";
  if (/\.bmp$/i.test(name)) return "image/bmp";
  return "image/png";
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}
