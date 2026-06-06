import { clampNumber } from "../../core/math.js";
import { bindInputEvents, createPreviewCard, role, roles } from "../../ui/dom.js";

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
            <div class="field">
              <label for="ll-padding">Transparent padding</label>
              <input id="ll-padding" data-role="padding" type="range" min="0" max="40" step="1" value="8" />
              <span class="field-help">Percent of each output size.</span>
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

    this.sourceInfo = role(root, "source-info");
    this.previewRoot = role(root, "previews");
    this.exportCount = role(root, "export-count");
    this.inputs = {
      prefix: role(root, "prefix"),
      fit: role(root, "fit"),
      padding: role(root, "padding"),
      sizes: roles(root, "logo-size"),
    };

    bindInputEvents([this.inputs.prefix, this.inputs.fit, this.inputs.padding, ...this.inputs.sizes], () => this.render());
    this.render();
  }

  unmount() {
    this.root = null;
  }

  loadImage(asset) {
    this.asset = asset;
    this.sourceInfo.textContent = `${asset.width} x ${asset.height}`;
    this.inputs.prefix.value = `${this.context.downloadManager.safeFilenamePart(asset.fileName, "logo")}_`;
    this.render();
  }

  reset() {
    this.inputs.fit.value = "contain";
    this.inputs.padding.value = "8";
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
    this.renderExportPreview();
    this.context.setDirtyState();
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
    if (!this.asset) return canvas;

    const padding = Math.round(size * clampNumber(this.inputs.padding.value, 0, 40) / 100);
    const targetSize = Math.max(1, size - padding * 2);
    const fit = this.inputs.fit.value;
    if (fit === "stretch") {
      ctx.drawImage(this.asset.image, 0, 0, this.asset.width, this.asset.height, padding, padding, targetSize, targetSize);
      return canvas;
    }

    const scale = fit === "cover"
      ? Math.max(targetSize / this.asset.width, targetSize / this.asset.height)
      : Math.min(targetSize / this.asset.width, targetSize / this.asset.height);
    const drawWidth = this.asset.width * scale;
    const drawHeight = this.asset.height * scale;
    const dx = padding + (targetSize - drawWidth) / 2;
    const dy = padding + (targetSize - drawHeight) / 2;
    ctx.drawImage(this.asset.image, dx, dy, drawWidth, drawHeight);
    return canvas;
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
