import { role } from "../../ui/dom.js";

const TILE_SIZES = [256, 512, 1024, 2048];
const MAX_SOURCE_PIXELS = 4096 * 4096;
const WRAP_OFFSETS = [
  [0, 0], [-1, 0], [1, 0],
  [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];
const DEFAULT_SETTINGS = {
  showGrid: true,
  showCenter: true,
  showSeams: true,
  showBounds: true,
  showWraps: true,
  checkerboard: true,
  snapGrid: false,
  snapCenter: false,
  snapEdges: false,
  snapStrength: 8,
  previewRepeat: 3,
  exportFormat: "png",
};
const DEFAULT_SCATTER = {
  seed: 12345,
  count: 80,
  minSpacing: 24,
  scaleMin: 0.5,
  scaleMax: 1.2,
  rotationMin: 0,
  rotationMax: 360,
  opacityMin: 0.7,
  opacityMax: 1,
  randomFlipX: true,
  randomFlipY: false,
  hueShift: 0,
  brightness: 0,
  avoidOverlap: true,
};

export const patternBuilderTool = {
  id: "pattern-builder",
  name: "Pattern Builder",
  description: "Build seamless repeating tiles from transparent raster stamps.",
  create(context) {
    return new PatternBuilder(context);
  },
};

class PatternBuilder {
  constructor(context) {
    this.context = context;
    this.handlesOwnImports = true;
    this.scene = createScene();
    this.settings = readSettings();
    this.scatter = { ...DEFAULT_SCATTER };
    this.mode = "manual";
    this.previewMode = "tile";
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.selectedId = null;
    this.sourceImages = new Map();
    this.drag = null;
    this.renderQueued = false;
    this.lastScatterResult = "";
    this.boundKeyDown = (event) => this.onKeyDown(event);
  }

  mount(root) {
    this.root = root;
    root.innerHTML = template(this.settings);
    this.capture(root);
    this.bindEvents();
    this.updateAll();
  }

  unmount() {
    document.removeEventListener("keydown", this.boundKeyDown);
    this.root = null;
    this.renderQueued = false;
  }

  loadImage(asset) {
    this.addSourceAsset(asset);
  }

  async loadFiles(files) {
    const images = [...files].filter((file) => file.type?.startsWith("image/"));
    if (!images.length) {
      this.notify("Drop PNG, WebP, or another browser-supported image file.");
      return;
    }
    for (const file of images) {
      try {
        const asset = await this.context.imageLoader.loadImageFile(file);
        this.addSourceAsset(asset);
      } catch (error) {
        this.notify(error.message);
      }
    }
  }

  reset() {
    this.scene = createScene();
    this.selectedId = null;
    this.sourceImages.clear();
    this.lastScatterResult = "";
    this.updateAll();
    this.notify("Pattern cleared");
  }

  getExportItems() {
    if (!this.scene.sources.length) return [];
    const base = "seamless_pattern";
    const items = [
      {
        filename: `${base}.png`,
        type: "image/png",
        getBlob: () => this.context.canvasUtils.canvasToBlob(this.renderExportCanvas(), "image/png"),
      },
      {
        filename: `${base}_recipe.json`,
        type: "application/json",
        getBlob: async () => new Blob([JSON.stringify(this.scene, null, 2)], { type: "application/json" }),
      },
    ];
    if (supportsWebP()) {
      items.splice(1, 0, {
        filename: `${base}.webp`,
        type: "image/webp",
        getBlob: () => this.context.canvasUtils.canvasToBlob(this.renderExportCanvas(), "image/webp", 0.92),
      });
    }
    return items;
  }

  capture(root) {
    this.canvas = role(root, "pattern-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.status = role(root, "pattern-status");
    this.sourceList = role(root, "source-list");
    this.layerList = role(root, "layer-list");
    this.objectList = role(root, "object-list");
    this.options = role(root, "pattern-options");
    this.fileInput = role(root, "source-input");
    this.recipeInput = role(root, "recipe-input");
    this.backgroundInput = role(root, "background-input");
    this.settingsModal = role(root, "settings-modal");
    this.inputs = {
      tileSize: role(root, "tile-size"),
      customSize: role(root, "custom-size"),
      mode: role(root, "mode"),
      previewMode: role(root, "preview-mode"),
      backgroundType: role(root, "background-type"),
      backgroundColor: role(root, "background-color"),
      zoom: role(root, "zoom"),
    };
  }

  bindEvents() {
    this.fileInput.addEventListener("change", () => {
      this.loadFiles(this.fileInput.files || []);
      this.fileInput.value = "";
    });
    this.recipeInput.addEventListener("change", () => {
      const file = this.recipeInput.files?.[0];
      if (file) this.loadRecipeFile(file);
      this.recipeInput.value = "";
    });
    this.backgroundInput.addEventListener("change", () => {
      const file = this.backgroundInput.files?.[0];
      if (file) this.loadBackgroundImage(file);
      this.backgroundInput.value = "";
    });
    this.root.addEventListener("click", (event) => this.onClick(event));
    this.root.addEventListener("input", (event) => this.onInput(event));
    this.root.addEventListener("change", (event) => this.onInput(event));
    this.canvas.addEventListener("pointerdown", (event) => this.onCanvasDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.onCanvasMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.endDrag(event));
    this.canvas.addEventListener("pointercancel", (event) => this.endDrag(event));
    this.canvas.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
    this.canvas.addEventListener("dragover", (event) => event.preventDefault());
    this.canvas.addEventListener("drop", (event) => this.onCanvasDrop(event));
    document.addEventListener("keydown", this.boundKeyDown);
  }

  onClick(event) {
    const action = event.target.closest("[data-action]")?.dataset.action;
    const sourceId = event.target.closest("[data-source-id]")?.dataset.sourceId;
    const objectId = event.target.closest("[data-object-id]")?.dataset.objectId;
    const layerId = event.target.closest("[data-layer-id]")?.dataset.layerId;

    if (sourceId && !action) {
      this.addObjectFromSource(sourceId);
      return;
    }
    if (objectId && !action) {
      this.selectObject(objectId);
      return;
    }
    if (layerId && !action) {
      this.selectLayer(layerId);
      return;
    }
    if (!action) return;

    if (action === "import") this.fileInput.click();
    if (action === "export-png") this.downloadSingle("png");
    if (action === "export-webp") this.downloadSingle("webp");
    if (action === "save-recipe") this.downloadRecipe();
    if (action === "load-recipe") this.recipeInput.click();
    if (action === "settings") this.openSettings();
    if (action === "close-settings") this.closeSettings();
    if (action === "fit") this.fitView();
    if (action === "reset-view") this.resetView();
    if (action === "duplicate") this.duplicateSelected();
    if (action === "delete") this.deleteSelected();
    if (action === "front") this.moveSelectedLayer(1);
    if (action === "back") this.moveSelectedLayer(-1);
    if (action === "flip-x") this.toggleSelected("flipX");
    if (action === "flip-y") this.toggleSelected("flipY");
    if (action === "generate-scatter") this.generateScatter(false);
    if (action === "new-seed") this.generateScatter(true);
    if (action === "convert-scatter") this.convertScatterToManual();
    if (action === "background-image") this.backgroundInput.click();
    if (action === "add-layer") this.addLayer();
    if (action === "toggle-layer") this.toggleLayer(layerId, "hidden");
    if (action === "lock-layer") this.toggleLayer(layerId, "locked");
    if (action === "toggle-object-lock") this.toggleObject(objectId, "locked");
    if (action === "toggle-object-hide") this.toggleObject(objectId, "hidden");
    this.updateAll();
  }

  onInput(event) {
    const target = event.target;
    const roleName = target.dataset.role;
    if (!roleName) return;
    if (roleName === "tile-size" || roleName === "custom-size") this.updateTileSize();
    if (roleName === "mode") this.mode = target.value;
    if (roleName === "preview-mode") this.previewMode = target.value;
    if (roleName === "background-type") this.scene.tile.background.type = target.value;
    if (roleName === "background-color") this.scene.tile.background.color = target.value;
    if (roleName === "zoom") this.zoom = Number(target.value || 1);
    if (target.dataset.setting) this.readSetting(target);
    if (target.dataset.scatter) this.readScatter(target);
    if (target.dataset.transform) this.readTransform(target);
    this.updateAll();
  }

  addSourceAsset(asset) {
    if (!asset?.image) return;
    if (asset.width * asset.height > MAX_SOURCE_PIXELS) {
      this.notify(`${asset.fileName} is too large for a responsive stamp workflow.`);
      return;
    }
    const id = uniqueId("source");
    const source = {
      id,
      name: asset.fileName,
      mimeType: asset.type || "image/png",
      width: asset.width,
      height: asset.height,
      dataUrl: "",
    };
    const canvas = document.createElement("canvas");
    canvas.width = asset.width;
    canvas.height = asset.height;
    canvas.getContext("2d").drawImage(asset.image, 0, 0);
    source.dataUrl = canvas.toDataURL(source.mimeType === "image/webp" ? "image/webp" : "image/png");
    this.scene.sources.push(source);
    this.sourceImages.set(id, asset.image);
    this.addObjectFromSource(id, { x: this.scene.tile.width / 2, y: this.scene.tile.height / 2 });
    this.context.setEmptyStateHidden(true);
    this.notify(`Imported ${asset.fileName}`);
  }

  async loadBackgroundImage(file) {
    try {
      const asset = await this.context.imageLoader.loadImageFile(file);
      const canvas = document.createElement("canvas");
      canvas.width = asset.width;
      canvas.height = asset.height;
      canvas.getContext("2d").drawImage(asset.image, 0, 0);
      this.scene.tile.background = {
        type: "image",
        name: asset.fileName,
        dataUrl: canvas.toDataURL(asset.type === "image/webp" ? "image/webp" : "image/png"),
      };
      this.backgroundImage = asset.image;
      this.updateAll();
    } catch (error) {
      this.notify(error.message);
    }
  }

  addObjectFromSource(sourceId, props = {}) {
    const source = this.getSource(sourceId);
    if (!source) return;
    const object = {
      id: uniqueId("obj"),
      sourceId,
      name: source.name,
      x: props.x ?? this.scene.tile.width / 2,
      y: props.y ?? this.scene.tile.height / 2,
      scaleX: props.scaleX ?? 1,
      scaleY: props.scaleY ?? 1,
      rotation: props.rotation ?? 0,
      opacity: props.opacity ?? 1,
      flipX: props.flipX ?? false,
      flipY: props.flipY ?? false,
      tint: props.tint ?? "",
      brightness: props.brightness ?? 0,
      locked: false,
      hidden: false,
      layerId: props.layerId ?? "manual",
      scatterGroupId: props.scatterGroupId ?? null,
    };
    this.scene.objects.push(object);
    this.selectedId = object.id;
    this.updateAll();
  }

  updateTileSize() {
    const next = this.inputs.tileSize.value === "custom"
      ? Number(this.inputs.customSize.value || this.scene.tile.width)
      : Number(this.inputs.tileSize.value);
    const size = clamp(Math.round(next), 64, 4096);
    this.scene.tile.width = size;
    this.scene.tile.height = size;
  }

  selectObject(id) {
    const object = this.getObject(id);
    if (!object || object.locked || this.getLayer(object.layerId)?.locked) return;
    this.selectedId = id;
    this.updateAll();
  }

  selectLayer(layerId) {
    const object = this.scene.objects.find((item) => item.layerId === layerId && !item.hidden);
    this.selectedId = object?.id || null;
    this.updateAll();
  }

  onCanvasDown(event) {
    const point = this.canvasToTile(event);
    if (!point) return;
    const picked = this.pickObject(point.x, point.y);
    if (picked) {
      this.selectObject(picked.id);
      this.drag = { type: "move", id: picked.id, start: point, ox: picked.x, oy: picked.y, pointerId: event.pointerId };
      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    this.selectedId = null;
    this.drag = { type: "pan", startX: event.clientX, startY: event.clientY, panX: this.panX, panY: this.panY, pointerId: event.pointerId };
    this.canvas.setPointerCapture(event.pointerId);
    this.updateAll();
  }

  onCanvasMove(event) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    if (this.drag.type === "pan") {
      this.panX = this.drag.panX + event.clientX - this.drag.startX;
      this.panY = this.drag.panY + event.clientY - this.drag.startY;
      this.scheduleRender();
      return;
    }
    const object = this.getObject(this.drag.id);
    const point = this.canvasToTile(event);
    if (!object || !point || object.locked) return;
    object.x = wrap(this.drag.ox + point.x - this.drag.start.x, this.scene.tile.width);
    object.y = wrap(this.drag.oy + point.y - this.drag.start.y, this.scene.tile.height);
    this.applySnapping(object);
    this.updateAll();
  }

  endDrag(event) {
    if (this.drag?.pointerId === event.pointerId) this.drag = null;
  }

  onWheel(event) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    this.zoom = clamp(round(this.zoom + delta, 2), 0.15, 4);
    this.inputs.zoom.value = String(this.zoom);
    this.scheduleRender();
    this.updateStatus();
  }

  onCanvasDrop(event) {
    event.preventDefault();
    const sourceId = event.dataTransfer?.getData("text/source-id");
    if (!sourceId) return;
    const point = this.canvasToTile(event);
    if (point) this.addObjectFromSource(sourceId, point);
  }

  onKeyDown(event) {
    if (!this.root || !this.selectedId || event.target.closest("input, select, textarea")) return;
    const object = this.getObject(this.selectedId);
    if (!object || object.locked) return;
    const step = event.shiftKey ? 10 : 1;
    const keys = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (keys[event.key]) {
      object.x = wrap(object.x + keys[event.key][0], this.scene.tile.width);
      object.y = wrap(object.y + keys[event.key][1], this.scene.tile.height);
      event.preventDefault();
      this.updateAll();
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      this.deleteSelected();
      event.preventDefault();
    }
  }

  readTransform(input) {
    const object = this.getObject(this.selectedId);
    if (!object || object.locked) return;
    const key = input.dataset.transform;
    let value = input.type === "checkbox" ? input.checked : Number(input.value);
    if (key === "opacity") value = clamp(value, 0, 1);
    object[key] = value;
  }

  readScatter(input) {
    const key = input.dataset.scatter;
    if (input.type === "checkbox") this.scatter[key] = input.checked;
    else if (key === "sourceIds") this.scatter[key] = [...this.options.querySelectorAll("[data-scatter-source]:checked")].map((item) => item.value);
    else this.scatter[key] = Number(input.value);
  }

  readSetting(input) {
    const key = input.dataset.setting;
    this.settings[key] = input.type === "checkbox" ? input.checked : input.value;
    if (key === "snapStrength" || key === "previewRepeat") this.settings[key] = Number(input.value);
    localStorage.setItem("imaginarium.patternSettings", JSON.stringify(this.settings));
  }

  applySnapping(object) {
    const strength = Number(this.settings.snapStrength || 0);
    if (this.settings.snapGrid) {
      object.x = snapValue(object.x, 32, strength);
      object.y = snapValue(object.y, 32, strength);
    }
    if (this.settings.snapCenter) {
      object.x = near(object.x, this.scene.tile.width / 2, strength);
      object.y = near(object.y, this.scene.tile.height / 2, strength);
    }
    if (this.settings.snapEdges) {
      object.x = snapToList(object.x, [0, this.scene.tile.width], strength);
      object.y = snapToList(object.y, [0, this.scene.tile.height], strength);
    }
  }

  generateScatter(newSeed) {
    const sourceIds = [...this.options.querySelectorAll("[data-scatter-source]:checked")].map((input) => input.value);
    const ids = sourceIds.length ? sourceIds : this.scene.sources.map((source) => source.id);
    if (!ids.length) {
      this.notify("Import at least one transparent source image before scattering.");
      return;
    }
    if (newSeed) this.scatter.seed = Math.floor(Math.random() * 999999);
    const groupId = uniqueId("scatter");
    const layerId = this.ensureScatterLayer(groupId);
    const rng = mulberry32(Number(this.scatter.seed) || 1);
    const placed = [];
    const maxAttempts = Math.max(this.scatter.count * 35, 200);
    let attempts = 0;
    while (placed.length < this.scatter.count && attempts < maxAttempts) {
      attempts += 1;
      const sourceId = ids[Math.floor(rng() * ids.length) % ids.length];
      const source = this.getSource(sourceId);
      const scale = lerp(this.scatter.scaleMin, this.scatter.scaleMax, rng());
      const item = {
        id: uniqueId("obj"),
        sourceId,
        name: source?.name || "Scatter",
        x: rng() * this.scene.tile.width,
        y: rng() * this.scene.tile.height,
        scaleX: scale,
        scaleY: scale,
        rotation: lerp(this.scatter.rotationMin, this.scatter.rotationMax, rng()),
        opacity: lerp(this.scatter.opacityMin, this.scatter.opacityMax, rng()),
        flipX: this.scatter.randomFlipX && rng() > 0.5,
        flipY: this.scatter.randomFlipY && rng() > 0.5,
        tint: this.scatter.hueShift ? `hsl(${Math.round(rng() * this.scatter.hueShift)}, 80%, 58%)` : "",
        brightness: this.scatter.brightness ? lerp(-this.scatter.brightness, this.scatter.brightness, rng()) : 0,
        locked: false,
        hidden: false,
        layerId,
        scatterGroupId: groupId,
      };
      if (this.scatter.avoidOverlap && !this.canPlaceScatter(item, placed)) continue;
      placed.push(item);
    }
    this.scene.scatterGroups.push({
      id: groupId,
      name: `Scatter ${this.scene.scatterGroups.length + 1}`,
      sourceIds: ids,
      seed: this.scatter.seed,
      count: this.scatter.count,
      minSpacing: this.scatter.minSpacing,
      scaleMin: this.scatter.scaleMin,
      scaleMax: this.scatter.scaleMax,
      rotationMin: this.scatter.rotationMin,
      rotationMax: this.scatter.rotationMax,
      opacityMin: this.scatter.opacityMin,
      opacityMax: this.scatter.opacityMax,
      randomFlipX: this.scatter.randomFlipX,
      randomFlipY: this.scatter.randomFlipY,
      avoidOverlap: this.scatter.avoidOverlap,
      locked: false,
      hidden: false,
      procedural: true,
    });
    this.scene.objects.push(...placed);
    this.lastScatterResult = `${placed.length}/${this.scatter.count} placed`;
    this.selectedId = placed[0]?.id || this.selectedId;
    this.updateAll();
    this.notify(`Scatter generated: ${this.lastScatterResult}`);
  }

  canPlaceScatter(candidate, placed) {
    const spacing = Number(this.scatter.minSpacing || 0);
    if (spacing <= 0) return true;
    return placed.every((item) => torusDistance(candidate, item, this.scene.tile.width, this.scene.tile.height) >= spacing);
  }

  convertScatterToManual() {
    for (const object of this.scene.objects) {
      if (object.scatterGroupId) {
        object.layerId = "manual";
        object.scatterGroupId = null;
      }
    }
    this.scene.scatterGroups = this.scene.scatterGroups.map((group) => ({ ...group, procedural: false }));
    this.updateAll();
    this.notify("Scatter objects converted to manual objects");
  }

  ensureScatterLayer(groupId) {
    const layerId = `layer_${groupId}`;
    this.scene.layers.push({ id: layerId, name: `Scatter ${this.scene.scatterGroups.length + 1}`, locked: false, hidden: false });
    return layerId;
  }

  duplicateSelected() {
    const object = this.getObject(this.selectedId);
    if (!object) return;
    const copy = { ...object, id: uniqueId("obj"), x: wrap(object.x + 24, this.scene.tile.width), y: wrap(object.y + 24, this.scene.tile.height), name: `${object.name} copy` };
    this.scene.objects.push(copy);
    this.selectedId = copy.id;
  }

  deleteSelected() {
    if (!this.selectedId) return;
    this.scene.objects = this.scene.objects.filter((object) => object.id !== this.selectedId);
    this.selectedId = null;
    this.updateAll();
  }

  moveSelectedLayer(direction) {
    const index = this.scene.objects.findIndex((object) => object.id === this.selectedId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= this.scene.objects.length) return;
    const [object] = this.scene.objects.splice(index, 1);
    this.scene.objects.splice(next, 0, object);
  }

  toggleSelected(key) {
    const object = this.getObject(this.selectedId);
    if (object) object[key] = !object[key];
  }

  toggleObject(id, key) {
    const object = this.getObject(id);
    if (object) object[key] = !object[key];
  }

  toggleLayer(id, key) {
    const layer = this.getLayer(id);
    if (layer) layer[key] = !layer[key];
  }

  addLayer() {
    this.scene.layers.push({ id: uniqueId("layer"), name: `Layer ${this.scene.layers.length + 1}`, locked: false, hidden: false });
  }

  renderExportCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = this.scene.tile.width;
    canvas.height = this.scene.tile.height;
    this.drawTile(canvas.getContext("2d"), { x: 0, y: 0, width: canvas.width, height: canvas.height, scale: 1, helpers: false });
    return canvas;
  }

  scheduleRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  render() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.max(420, Math.floor(rect.width));
    const cssHeight = Math.max(360, Math.floor(rect.height));
    this.canvas.width = Math.floor(cssWidth * dpr);
    this.canvas.height = Math.floor(cssHeight * dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, cssWidth, cssHeight);
    this.drawWorkspace(cssWidth, cssHeight);
  }

  drawWorkspace(width, height) {
    if (this.settings.checkerboard) drawChecker(this.ctx, 0, 0, width, height, 18);
    const repeat = this.previewMode === "5x5" ? 5 : this.previewMode === "3x3" ? 3 : 1;
    const tile = this.scene.tile.width;
    const scale = this.zoom * Math.min((width - 36) / (tile * repeat), (height - 36) / (tile * repeat), 1);
    const total = tile * repeat * scale;
    const originX = Math.floor((width - total) / 2 + this.panX);
    const originY = Math.floor((height - total) / 2 + this.panY);
    for (let y = 0; y < repeat; y += 1) {
      for (let x = 0; x < repeat; x += 1) {
        this.drawTile(this.ctx, {
          x: originX + x * tile * scale,
          y: originY + y * tile * scale,
          width: tile * scale,
          height: tile * scale,
          scale,
          helpers: repeat === 1,
        });
        if (this.settings.showSeams || this.previewMode !== "tile") {
          this.ctx.strokeStyle = "rgba(255,255,255,0.23)";
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(originX + x * tile * scale + 0.5, originY + y * tile * scale + 0.5, tile * scale, tile * scale);
        }
      }
    }
    this.view = { originX, originY, scale, repeat };
  }

  drawTile(ctx, view) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(view.x, view.y, view.width, view.height);
    ctx.clip();
    this.drawBackground(ctx, view);
    const visibleLayers = new Set(this.scene.layers.filter((layer) => !layer.hidden).map((layer) => layer.id));
    for (const object of this.scene.objects) {
      const layer = this.getLayer(object.layerId);
      if (object.hidden || !visibleLayers.has(object.layerId) || layer?.hidden) continue;
      this.drawWrappedObject(ctx, object, view);
    }
    ctx.restore();
    if (view.helpers) this.drawHelpers(ctx, view);
  }

  drawBackground(ctx, view) {
    const bg = this.scene.tile.background;
    if (bg.type === "color") {
      ctx.fillStyle = bg.color || "#000000";
      ctx.fillRect(view.x, view.y, view.width, view.height);
    } else if (bg.type === "image" && this.backgroundImage) {
      ctx.drawImage(this.backgroundImage, view.x, view.y, view.width, view.height);
    }
  }

  drawWrappedObject(ctx, object, view) {
    const source = this.getSource(object.sourceId);
    const image = this.sourceImages.get(object.sourceId);
    if (!source || !image) return;
    const offsets = this.settings.showWraps || !view.helpers ? WRAP_OFFSETS : [[0, 0]];
    for (const [ox, oy] of offsets) {
      this.drawObject(ctx, object, image, source, view, ox, oy);
    }
  }

  drawObject(ctx, object, image, source, view, offsetX, offsetY) {
    const x = view.x + (object.x + offsetX * this.scene.tile.width) * view.scale;
    const y = view.y + (object.y + offsetY * this.scene.tile.height) * view.scale;
    const sx = (object.flipX ? -1 : 1) * object.scaleX * view.scale;
    const sy = (object.flipY ? -1 : 1) * object.scaleY * view.scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(degToRad(object.rotation));
    ctx.scale(sx, sy);
    ctx.globalAlpha = clamp(object.opacity, 0, 1);
    if (object.brightness) ctx.filter = `brightness(${100 + object.brightness}%)`;
    ctx.drawImage(image, -source.width / 2, -source.height / 2);
    if (object.tint) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = object.tint;
      ctx.globalAlpha = Math.min(0.35, object.opacity);
      ctx.fillRect(-source.width / 2, -source.height / 2, source.width, source.height);
    }
    ctx.restore();
  }

  drawHelpers(ctx, view) {
    if (this.settings.showGrid) {
      ctx.strokeStyle = "rgba(255,45,45,0.18)";
      ctx.lineWidth = 1;
      const step = 32 * view.scale;
      for (let x = view.x; x <= view.x + view.width; x += step) line(ctx, x, view.y, x, view.y + view.height);
      for (let y = view.y; y <= view.y + view.height; y += step) line(ctx, view.x, y, view.x + view.width, y);
    }
    if (this.settings.showCenter) {
      ctx.strokeStyle = "rgba(85,211,145,0.55)";
      line(ctx, view.x + view.width / 2, view.y, view.x + view.width / 2, view.y + view.height);
      line(ctx, view.x, view.y + view.height / 2, view.x + view.width, view.y + view.height / 2);
    }
    if (this.settings.showBounds) this.drawObjectBounds(ctx, view);
  }

  drawObjectBounds(ctx, view) {
    for (const object of this.scene.objects) {
      if (object.hidden) continue;
      const source = this.getSource(object.sourceId);
      if (!source) continue;
      const selected = object.id === this.selectedId;
      ctx.save();
      ctx.translate(view.x + object.x * view.scale, view.y + object.y * view.scale);
      ctx.rotate(degToRad(object.rotation));
      ctx.strokeStyle = selected ? "#ff5a3d" : "rgba(255,255,255,0.28)";
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(
        -source.width * Math.abs(object.scaleX) * view.scale / 2,
        -source.height * Math.abs(object.scaleY) * view.scale / 2,
        source.width * Math.abs(object.scaleX) * view.scale,
        source.height * Math.abs(object.scaleY) * view.scale,
      );
      ctx.restore();
    }
  }

  pickObject(x, y) {
    for (let i = this.scene.objects.length - 1; i >= 0; i -= 1) {
      const object = this.scene.objects[i];
      const layer = this.getLayer(object.layerId);
      if (object.hidden || object.locked || layer?.locked || layer?.hidden) continue;
      const source = this.getSource(object.sourceId);
      if (!source) continue;
      if (pointHitsObject(x, y, object, source)) return object;
    }
    return null;
  }

  canvasToTile(event) {
    if (!this.view) return null;
    const rect = this.canvas.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const tileSize = this.scene.tile.width;
    const localX = (cx - this.view.originX) / this.view.scale;
    const localY = (cy - this.view.originY) / this.view.scale;
    if (localX < 0 || localY < 0 || localX >= tileSize * this.view.repeat || localY >= tileSize * this.view.repeat) return null;
    return { x: wrap(localX, tileSize), y: wrap(localY, tileSize) };
  }

  updateAll() {
    if (!this.root) return;
    this.syncControls();
    this.renderSources();
    this.renderOptions();
    this.renderLayers();
    this.updateStatus();
    this.scheduleRender();
    this.context.setEmptyStateHidden(this.scene.sources.length > 0);
    this.context.setDirtyState();
  }

  syncControls() {
    const size = this.scene.tile.width;
    this.inputs.tileSize.value = TILE_SIZES.includes(size) ? String(size) : "custom";
    this.inputs.customSize.value = String(size);
    this.inputs.mode.value = this.mode;
    this.inputs.previewMode.value = this.previewMode;
    this.inputs.backgroundType.value = this.scene.tile.background.type;
    this.inputs.backgroundColor.value = this.scene.tile.background.color || "#000000";
    this.inputs.zoom.value = String(this.zoom);
  }

  renderSources() {
    this.sourceList.innerHTML = this.scene.sources.length ? "" : `<div class="field-help">Import transparent PNG or WebP stamps.</div>`;
    for (const source of this.scene.sources) {
      const card = document.createElement("button");
      card.className = "pattern-source";
      card.type = "button";
      card.dataset.sourceId = source.id;
      card.draggable = true;
      card.innerHTML = `<img src="${source.dataUrl}" alt="" /><span>${escapeHtml(source.name)}</span><small>${source.width} x ${source.height}</small>`;
      card.addEventListener("dragstart", (event) => event.dataTransfer?.setData("text/source-id", source.id));
      this.sourceList.append(card);
    }
  }

  renderOptions() {
    const selected = this.getObject(this.selectedId);
    if (this.mode === "scatter") {
      this.options.innerHTML = scatterOptions(this.scene.sources, this.scatter, this.lastScatterResult);
      return;
    }
    if (this.mode === "combined") {
      this.options.innerHTML = combinedOptions(selected, this.scene.scatterGroups);
      return;
    }
    this.options.innerHTML = manualOptions(selected);
  }

  renderLayers() {
    this.layerList.innerHTML = "";
    for (const layer of this.scene.layers) {
      const row = document.createElement("div");
      row.className = "pattern-layer";
      row.dataset.layerId = layer.id;
      row.innerHTML = `<strong>${escapeHtml(layer.name)}</strong><span>${this.scene.objects.filter((object) => object.layerId === layer.id).length}</span><button data-layer-id="${layer.id}" data-action="toggle-layer">${layer.hidden ? "Show" : "Hide"}</button><button data-layer-id="${layer.id}" data-action="lock-layer">${layer.locked ? "Unlock" : "Lock"}</button>`;
      this.layerList.append(row);
    }
    this.objectList.innerHTML = "";
    for (const object of [...this.scene.objects].reverse()) {
      const row = document.createElement("div");
      row.className = `pattern-object-row${object.id === this.selectedId ? " active" : ""}`;
      row.dataset.objectId = object.id;
      row.innerHTML = `<span>${escapeHtml(object.name)}</span><button data-object-id="${object.id}" data-action="toggle-object-hide">${object.hidden ? "Show" : "Hide"}</button><button data-object-id="${object.id}" data-action="toggle-object-lock">${object.locked ? "Unlock" : "Lock"}</button>`;
      this.objectList.append(row);
    }
  }

  updateStatus() {
    const selected = this.getObject(this.selectedId);
    this.status.textContent = `Tile ${this.scene.tile.width} x ${this.scene.tile.height} | Objects ${this.scene.objects.length} | Selected ${selected?.name || "none"} | Zoom ${Math.round(this.zoom * 100)}% | Export ${this.scene.tile.width}px | Background ${this.scene.tile.background.type} | Seed ${this.scatter.seed}`;
  }

  openSettings() {
    this.settingsModal.hidden = false;
    this.settingsModal.innerHTML = settingsTemplate(this.settings);
  }

  closeSettings() {
    this.settingsModal.hidden = true;
  }

  fitView() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  resetView() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  async downloadSingle(format) {
    try {
      if (format === "webp" && !supportsWebP()) throw new Error("This browser does not support WebP canvas export.");
      const type = format === "webp" ? "image/webp" : "image/png";
      const blob = await this.context.canvasUtils.canvasToBlob(this.renderExportCanvas(), type, 0.92);
      this.context.downloadManager.downloadBlob(blob, `seamless_pattern.${format}`);
      this.notify(`Exported ${format.toUpperCase()} ${this.scene.tile.width} x ${this.scene.tile.height}`);
    } catch (error) {
      this.notify(error.message);
    }
  }

  async downloadRecipe() {
    const blob = new Blob([JSON.stringify(this.scene, null, 2)], { type: "application/json" });
    this.context.downloadManager.downloadBlob(blob, "seamless_pattern_recipe.json");
  }

  async loadRecipeFile(file) {
    try {
      const recipe = JSON.parse(await file.text());
      validateRecipe(recipe);
      this.scene = recipe;
      this.selectedId = null;
      this.sourceImages.clear();
      await this.hydrateRecipeImages();
      this.updateAll();
      this.notify("Recipe loaded");
    } catch (error) {
      this.notify(`Recipe could not be loaded: ${error.message}`);
    }
  }

  async hydrateRecipeImages() {
    for (const source of this.scene.sources) {
      this.sourceImages.set(source.id, await loadDataUrl(source.dataUrl));
    }
    if (this.scene.tile.background?.type === "image" && this.scene.tile.background.dataUrl) {
      this.backgroundImage = await loadDataUrl(this.scene.tile.background.dataUrl);
    }
  }

  getSource(id) {
    return this.scene.sources.find((source) => source.id === id);
  }

  getObject(id) {
    return this.scene.objects.find((object) => object.id === id);
  }

  getLayer(id) {
    return this.scene.layers.find((layer) => layer.id === id);
  }

  notify(message) {
    this.context.notify?.(message);
  }
}

function template(settings) {
  return `
    <div class="tool-layout pattern-builder-layout">
      <section class="editor-pane pattern-builder-editor">
        <div class="pattern-toolbar">
          <select data-role="tile-size" title="Tile size">
            ${TILE_SIZES.map((size) => `<option value="${size}">${size}</option>`).join("")}
            <option value="custom">Custom</option>
          </select>
          <input data-role="custom-size" type="number" min="64" max="4096" step="1" title="Custom square tile size" />
          <button type="button" data-action="import">Import Source</button>
          <button type="button" data-action="export-png">PNG</button>
          <button type="button" data-action="export-webp">WebP</button>
          <button type="button" data-action="save-recipe">Save JSON</button>
          <button type="button" data-action="load-recipe">Load JSON</button>
          <select data-role="mode" title="Mode">
            <option value="manual">Manual</option>
            <option value="scatter">Scatter</option>
            <option value="combined">Combined</option>
          </select>
          <select data-role="preview-mode" title="Preview">
            <option value="tile">Tile</option>
            <option value="3x3">3 x 3</option>
            <option value="5x5">5 x 5</option>
          </select>
          <button type="button" data-action="settings">Settings</button>
        </div>
        <div class="pattern-canvas-shell canvas-stage ${settings.checkerboard ? "show-transparency" : ""}">
          <canvas data-role="pattern-canvas" width="960" height="640"></canvas>
        </div>
        <div class="pattern-footer" data-role="pattern-status"></div>
        <input data-role="source-input" type="file" accept="image/png,image/webp,image/*" multiple hidden />
        <input data-role="recipe-input" type="file" accept="application/json,.json" hidden />
        <input data-role="background-input" type="file" accept="image/*" hidden />
        <div class="pattern-settings-modal" data-role="settings-modal" hidden></div>
      </section>
      <aside class="settings-pane pattern-options-pane">
        <div class="control-group">
          <h3>Background</h3>
          <div class="field">
            <label>Mode</label>
            <select data-role="background-type">
              <option value="transparent">Transparent</option>
              <option value="color">Solid color</option>
              <option value="image">Image</option>
            </select>
          </div>
          <div class="field-grid">
            <div class="field"><label>Color</label><input data-role="background-color" type="color" value="#000000" /></div>
            <button class="secondary-file-button" type="button" data-action="background-image">Image</button>
          </div>
          <div class="field range-field">
            <div class="range-control">
              <label>Zoom:</label>
              <input type="number" min="0.15" max="4" step="0.05" data-role="zoom" />
              <span>x</span>
              <input type="range" min="0.15" max="4" step="0.05" data-role="zoom" />
            </div>
          </div>
          <div class="button-row"><button type="button" data-action="fit">Fit</button><button type="button" data-action="reset-view">Reset view</button></div>
        </div>
        <div class="control-group">
          <h3>Sources</h3>
          <div class="pattern-source-list" data-role="source-list"></div>
        </div>
        <div class="control-group">
          <h3>Mode Options</h3>
          <div data-role="pattern-options"></div>
        </div>
        <div class="control-group">
          <h3>Layers</h3>
          <div class="pattern-layer-list" data-role="layer-list"></div>
          <div class="button-row"><button type="button" data-action="add-layer">Add layer</button></div>
        </div>
        <div class="control-group">
          <h3>Objects</h3>
          <div class="pattern-object-list" data-role="object-list"></div>
        </div>
      </aside>
    </div>
  `;
}

function manualOptions(object) {
  if (!object) return `<div class="field-help">Select an object or click a source thumbnail to place it.</div>`;
  return `
    <div class="field-grid">
      ${numberField("X", "x", object.x, 0, 4096, 1)}
      ${numberField("Y", "y", object.y, 0, 4096, 1)}
      ${numberField("Scale X", "scaleX", object.scaleX, -5, 5, 0.01)}
      ${numberField("Scale Y", "scaleY", object.scaleY, -5, 5, 0.01)}
      ${numberField("Rotate", "rotation", object.rotation, -360, 360, 1)}
      ${numberField("Opacity", "opacity", object.opacity, 0, 1, 0.01)}
    </div>
    <div class="button-row">
      <button type="button" data-action="flip-x">Flip H</button>
      <button type="button" data-action="flip-y">Flip V</button>
      <button type="button" data-action="duplicate">Duplicate</button>
      <button type="button" data-action="delete">Delete</button>
      <button type="button" data-action="front">Forward</button>
      <button type="button" data-action="back">Back</button>
    </div>
    <label class="toggle"><input data-transform="locked" data-role="object-lock" type="checkbox" ${object.locked ? "checked" : ""} /><span>Lock object</span></label>
  `;
}

function scatterOptions(sources, scatter, result) {
  return `
    <div class="pattern-scatter-sources">
      ${sources.map((source) => `<label class="toggle"><input data-scatter-source data-scatter="sourceIds" data-role="scatter-source" type="checkbox" value="${source.id}" checked /><span>${escapeHtml(source.name)}</span></label>`).join("") || `<div class="field-help">Import stamps before generating scatter.</div>`}
    </div>
    <div class="field-grid">
      ${scatterField("Count", "count", scatter.count, 1, 2000, 1)}
      ${scatterField("Seed", "seed", scatter.seed, 1, 999999, 1)}
      ${scatterField("Spacing", "minSpacing", scatter.minSpacing, 0, 512, 1)}
      ${scatterField("Scale min", "scaleMin", scatter.scaleMin, 0.05, 5, 0.01)}
      ${scatterField("Scale max", "scaleMax", scatter.scaleMax, 0.05, 5, 0.01)}
      ${scatterField("Rot min", "rotationMin", scatter.rotationMin, -360, 360, 1)}
      ${scatterField("Rot max", "rotationMax", scatter.rotationMax, -360, 360, 1)}
      ${scatterField("Opacity min", "opacityMin", scatter.opacityMin, 0, 1, 0.01)}
      ${scatterField("Opacity max", "opacityMax", scatter.opacityMax, 0, 1, 0.01)}
      ${scatterField("Hue shift", "hueShift", scatter.hueShift, 0, 360, 1)}
      ${scatterField("Brightness", "brightness", scatter.brightness, 0, 80, 1)}
    </div>
    <label class="toggle"><input data-scatter="randomFlipX" data-role="scatter-flip-x" type="checkbox" ${scatter.randomFlipX ? "checked" : ""} /><span>Random horizontal flip</span></label>
    <label class="toggle"><input data-scatter="randomFlipY" data-role="scatter-flip-y" type="checkbox" ${scatter.randomFlipY ? "checked" : ""} /><span>Random vertical flip</span></label>
    <label class="toggle"><input data-scatter="avoidOverlap" data-role="scatter-overlap" type="checkbox" ${scatter.avoidOverlap ? "checked" : ""} /><span>Avoid overlap</span></label>
    <div class="button-row">
      <button type="button" data-action="generate-scatter">Generate</button>
      <button type="button" data-action="new-seed">New seed</button>
      <button type="button" data-action="convert-scatter">Convert to editable</button>
    </div>
    <div class="field-help">${result || "Scatter creates logical objects that can coexist with manual objects."}</div>
  `;
}

function combinedOptions(object, groups) {
  return `
    ${manualOptions(object)}
    <div class="pattern-group-list">
      ${groups.map((group) => `<div class="pattern-layer"><strong>${escapeHtml(group.name)}</strong><span>seed ${group.seed}</span><span>${group.procedural ? "procedural" : "editable"}</span></div>`).join("") || `<div class="field-help">Generate scatter groups, then layer manual objects above or below them.</div>`}
    </div>
  `;
}

function settingsTemplate(settings) {
  const checks = [
    ["showGrid", "Show grid"],
    ["showCenter", "Show center guides"],
    ["showSeams", "Show seam guides"],
    ["showBounds", "Show object bounds"],
    ["showWraps", "Show wrapped clones"],
    ["checkerboard", "Checkerboard transparency"],
    ["snapGrid", "Snap to grid"],
    ["snapCenter", "Snap to center"],
    ["snapEdges", "Snap to edges"],
  ];
  return `
    <div class="pattern-settings-card">
      <div class="pane-title"><h2>Pattern Settings</h2><button type="button" data-action="close-settings">Close</button></div>
      ${checks.map(([key, label]) => `<label class="toggle"><input data-setting="${key}" data-role="setting-${key}" type="checkbox" ${settings[key] ? "checked" : ""} /><span>${label}</span></label>`).join("")}
      <div class="field-grid">
        <div class="field"><label>Snap strength</label><input data-setting="snapStrength" data-role="setting-snap" type="number" min="1" max="64" value="${settings.snapStrength}" /></div>
        <div class="field"><label>Preview repeat</label><select data-setting="previewRepeat" data-role="setting-repeat"><option value="3" ${settings.previewRepeat === 3 ? "selected" : ""}>3 x 3</option><option value="5" ${settings.previewRepeat === 5 ? "selected" : ""}>5 x 5</option></select></div>
        <div class="field"><label>Default export</label><select data-setting="exportFormat" data-role="setting-export"><option value="png" ${settings.exportFormat === "png" ? "selected" : ""}>PNG</option><option value="webp" ${settings.exportFormat === "webp" ? "selected" : ""}>WebP</option></select></div>
      </div>
    </div>
  `;
}

function numberField(label, key, value, min, max, step) {
  return `<div class="field"><label>${label}</label><input data-transform="${key}" data-role="transform-${key}" type="number" min="${min}" max="${max}" step="${step}" value="${round(value, 3)}" /></div>`;
}

function scatterField(label, key, value, min, max, step) {
  return `<div class="field"><label>${label}</label><input data-scatter="${key}" data-role="scatter-${key}" type="number" min="${min}" max="${max}" step="${step}" value="${round(value, 3)}" /></div>`;
}

function createScene() {
  return {
    version: "1.0",
    tile: { width: 1024, height: 1024, background: { type: "transparent", color: "#000000" } },
    sources: [],
    objects: [],
    scatterGroups: [],
    layers: [{ id: "manual", name: "Manual Objects", locked: false, hidden: false }],
  };
}

function readSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("imaginarium.patternSettings") || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function validateRecipe(recipe) {
  if (!recipe || recipe.version !== "1.0" || !recipe.tile || !Array.isArray(recipe.sources) || !Array.isArray(recipe.objects)) {
    throw new Error("Invalid pattern recipe.");
  }
  recipe.layers ||= [{ id: "manual", name: "Manual Objects", locked: false, hidden: false }];
  recipe.scatterGroups ||= [];
}

function loadDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Recipe image could not be decoded."));
    image.src = dataUrl;
  });
}

function pointHitsObject(x, y, object, source) {
  const cos = Math.cos(-degToRad(object.rotation));
  const sin = Math.sin(-degToRad(object.rotation));
  const dx = x - object.x;
  const dy = y - object.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return Math.abs(localX) <= source.width * Math.abs(object.scaleX) / 2 && Math.abs(localY) <= source.height * Math.abs(object.scaleY) / 2;
}

function drawChecker(ctx, x, y, width, height, size) {
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#151515";
  for (let yy = y; yy < y + height; yy += size) {
    for (let xx = x; xx < x + width; xx += size) {
      if (((xx / size) + (yy / size)) % 2 === 0) ctx.fillRect(xx, yy, size, size);
    }
  }
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function torusDistance(a, b, width, height) {
  const dx = Math.min(Math.abs(a.x - b.x), width - Math.abs(a.x - b.x));
  const dy = Math.min(Math.abs(a.y - b.y), height - Math.abs(a.y - b.y));
  return Math.hypot(dx, dy);
}

function supportsWebP() {
  const canvas = document.createElement("canvas");
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

function uniqueId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function wrap(value, size) {
  return ((value % size) + size) % size;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function round(value, places = 2) {
  const scale = 10 ** places;
  return Math.round((Number(value) || 0) * scale) / scale;
}

function degToRad(value) {
  return (Number(value) || 0) * Math.PI / 180;
}

function lerp(a, b, t) {
  return Number(a) + (Number(b) - Number(a)) * t;
}

function snapValue(value, grid, strength) {
  const snapped = Math.round(value / grid) * grid;
  return Math.abs(value - snapped) <= strength ? snapped : value;
}

function snapToList(value, list, strength) {
  let best = value;
  let bestDistance = strength + 1;
  for (const item of list) {
    const distance = Math.abs(value - item);
    if (distance <= strength && distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
}

function near(value, target, strength) {
  return Math.abs(value - target) <= strength ? target : value;
}
