import { bindInputEvents, role, setWarning } from "../../ui/dom.js";
import { getParts } from "./parts.js";
import { updatePartCanvases, drawSlicePreview } from "./rendering.js";
import { clampSlices, getSliceIssues } from "./slices.js";
import { nineSlicerTemplate } from "./template.js";

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
    root.innerHTML = nineSlicerTemplate();
    this.preview = role(root, "preview");
    this.previewContext = this.preview.getContext("2d");
    this.thumbs = role(root, "thumbs");
    this.partCount = role(root, "part-count");
    this.warning = role(root, "warning");
    this.inputs = {
      prefix: role(root, "prefix"),
      left: role(root, "left"),
      right: role(root, "right"),
      top: role(root, "top"),
      bottom: role(root, "bottom"),
      snap: role(root, "snap"),
      fadeEnabled: role(root, "fade-enabled"),
      fadeWidth: role(root, "fade-width"),
      fadeMode: role(root, "fade-mode"),
    };
    bindInputEvents([this.inputs.left, this.inputs.right, this.inputs.top, this.inputs.bottom], () => this.onSlicesChanged());
    bindInputEvents([this.inputs.snap, this.inputs.prefix, this.inputs.fadeWidth, this.inputs.fadeMode], () => this.render());
    this.inputs.fadeEnabled.addEventListener("change", () => {
      this.ensureThumbGrid();
      this.render();
    });
    this.bindPointerEvents();
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
    this.setSlices(clampSlices(this.asset, L, R, T, B));
    this.ensureThumbGrid();
    this.render();
  }

  reset() {
    if (!this.asset) return;
    const size = Math.max(1, Math.floor(Math.min(this.asset.width, this.asset.height) * 0.18));
    this.setSlices(clampSlices(this.asset, size, size, size, size));
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
    return [...imageItems, this.getManifestItem(parts, prefix)];
  }

  getParts() {
    return getParts(this.inputs.fadeEnabled.checked);
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
    return clampSlices(
      this.asset,
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

  getIssues() {
    return getSliceIssues(this.asset, this.getSlices());
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
    this.setSlices(clampSlices(this.asset, L, R, T, B));
    this.render();
  }

  render() {
    if (!this.asset || !this.preview) {
      this.context.setDirtyState();
      return;
    }
    drawSlicePreview({
      canvas: this.preview,
      context: this.previewContext,
      asset: this.asset,
      slices: this.getSlices(),
      fitSize: this.context.canvasUtils.fitSize,
    });
    this.updateParts();
    setWarning(this.warning, this.getIssues());
    this.context.setDirtyState();
  }

  updateParts() {
    updatePartCanvases({
      asset: this.asset,
      slices: this.getSlices(),
      canvases: this.partCanvases,
      fadeEnabled: this.inputs.fadeEnabled.checked,
      fadeWidth: Math.max(1, Number(this.inputs.fadeWidth.value || 1)),
      fadeMode: this.inputs.fadeMode.value === "both" ? "both" : "inside",
    });
  }

  bindPointerEvents() {
    this.preview.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.preview.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.preview.addEventListener("pointerup", (event) => this.endDrag(event));
    this.preview.addEventListener("pointercancel", (event) => this.endDrag(event));
    this.preview.addEventListener("pointerleave", () => {
      if (!this.dragMode) this.preview.style.cursor = "default";
    });
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
      this.updateDraggedGuide(pos);
      return;
    }
    const mode = this.pickGuide(pos.x, pos.y, pos.width, pos.height);
    this.preview.style.cursor = mode?.startsWith("v") ? "ew-resize" : mode ? "ns-resize" : "default";
  }

  updateDraggedGuide(pos) {
    const scale = Math.min(pos.width / this.asset.width, pos.height / this.asset.height, 1);
    let { L, R, T, B } = this.getSlices();
    if (this.dragMode === "v1") L = pos.x / scale;
    if (this.dragMode === "v2") R = this.asset.width - pos.x / scale;
    if (this.dragMode === "h1") T = pos.y / scale;
    if (this.dragMode === "h2") B = this.asset.height - pos.y / scale;
    this.setSlices(clampSlices(this.asset, L, R, T, B));
    this.render();
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

  getManifestItem(parts, prefix) {
    return {
      filename: `${prefix}slice_manifest.json`,
      type: "application/json",
      getBlob: async () => new Blob([JSON.stringify(this.getManifest(parts, prefix), null, 2)], { type: "application/json" }),
    };
  }

  getManifest(parts, prefix) {
    const { L, R, T, B } = this.getSlices();
    return {
      source: { width: this.asset.width, height: this.asset.height, fileName: this.asset.fileName },
      slices: { left: L, right: R, top: T, bottom: B },
      mode: this.inputs.fadeEnabled.checked ? "13-slice" : "9-slice",
      fadeEdges: this.inputs.fadeEnabled.checked
        ? { enabled: true, width: Math.max(1, Number(this.inputs.fadeWidth.value || 1)), mode: this.inputs.fadeMode.value }
        : { enabled: false },
      parts: parts.map((part) => ({ key: part.key, file: `${prefix}${part.key}.png` })),
    };
  }
}
