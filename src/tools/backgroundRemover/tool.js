import { bindInputEvents, role, setWarning } from "../../ui/dom.js";

const DEFAULTS = {
  tolerance: 28,
  sampleSize: 5,
  connectivity: "contiguous",
  edgeWidth: 3,
  feather: 36,
  decontaminate: true,
  decontaminationStrength: 90,
  zoom: 1,
};

export const backgroundRemoverTool = {
  id: "background-remover",
  name: "Color Remover",
  description: "Remove a clicked contiguous background color with soft edge recovery and despill.",
  create(context) {
    return new BackgroundRemover(context);
  },
};

class BackgroundRemover {
  constructor(context) {
    this.context = context;
    this.asset = null;
    this.sourceCanvas = document.createElement("canvas");
    this.outputCanvas = document.createElement("canvas");
    this.sample = null;
    this.settings = { ...DEFAULTS };
    this.renderTimer = 0;
  }

  mount(root) {
    this.root = root;
    root.innerHTML = template();
    this.captureElements(root);
    this.bindEvents();
    this.render();
  }

  captureElements(root) {
    this.canvas = role(root, "background-preview");
    this.ctx = this.canvas.getContext("2d");
    this.sourceInfo = role(root, "source-info");
    this.sampleInfo = role(root, "sample-info");
    this.warning = role(root, "warning");
    this.maskStats = role(root, "mask-stats");
    this.beforeCanvas = role(root, "before-zoom");
    this.afterCanvas = role(root, "after-zoom");
    this.inputs = {
      tolerance: role(root, "tolerance"),
      sampleSize: role(root, "sample-size"),
      connectivity: role(root, "connectivity"),
      edgeWidth: role(root, "edge-width"),
      feather: role(root, "feather"),
      decontaminate: role(root, "decontaminate"),
      decontaminationStrength: role(root, "decontamination-strength"),
      zoom: role(root, "zoom"),
    };
  }

  bindEvents() {
    this.canvas.addEventListener("click", (event) => this.sampleAtEvent(event));
    bindInputEvents(Object.values(this.inputs), () => this.readControls());
  }

  unmount() {
    clearTimeout(this.renderTimer);
    this.root = null;
  }

  loadImage(asset) {
    this.asset = asset;
    this.sourceCanvas.width = asset.width;
    this.sourceCanvas.height = asset.height;
    this.outputCanvas.width = asset.width;
    this.outputCanvas.height = asset.height;
    this.sourceCanvas.getContext("2d").drawImage(asset.image, 0, 0);
    this.sourceInfo.textContent = `${asset.fileName} - ${asset.width} x ${asset.height}`;
    this.sample = null;
    this.render();
  }

  reset() {
    this.settings = { ...DEFAULTS };
    for (const [key, input] of Object.entries(this.inputs)) {
      if (!input) continue;
      if (input.type === "checkbox") input.checked = Boolean(this.settings[key]);
      else input.value = String(this.settings[key]);
    }
    this.sample = null;
    this.render();
  }

  getExportItems() {
    if (!this.asset || !this.sample) return [];
    return [{
      filename: `${safeBaseName(this.asset.fileName)}_transparent.png`,
      type: "image/png",
      getBlob: async () => {
        this.process();
        return this.context.canvasUtils.canvasToBlob(this.outputCanvas, "image/png");
      },
    }];
  }

  readControls() {
    this.settings = {
      tolerance: clamp(Number(this.inputs.tolerance.value), 0, 255),
      sampleSize: clamp(Number(this.inputs.sampleSize.value), 1, 9),
      connectivity: this.inputs.connectivity.value,
      edgeWidth: clamp(Number(this.inputs.edgeWidth.value), 0, 12),
      feather: clamp(Number(this.inputs.feather.value), 1, 255),
      decontaminate: this.inputs.decontaminate.checked,
      decontaminationStrength: clamp(Number(this.inputs.decontaminationStrength.value), 0, 100),
      zoom: clamp(Number(this.inputs.zoom.value), 1, 12),
    };
    this.scheduleRender();
  }

  sampleAtEvent(event) {
    if (!this.asset) return;
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = (event.clientX - rect.left) * (this.canvas.width / rect.width);
    const canvasY = (event.clientY - rect.top) * (this.canvas.height / rect.height);
    const fitted = fittedRect(this.asset.width, this.asset.height, this.canvas.width, this.canvas.height);
    const x = Math.floor((canvasX - fitted.x) / fitted.scale);
    const y = Math.floor((canvasY - fitted.y) / fitted.scale);
    if (x < 0 || y < 0 || x >= this.asset.width || y >= this.asset.height) return;
    this.sample = sampleBackground(this.sourceCanvas, x, y, this.settings.sampleSize);
    this.render();
  }

  scheduleRender() {
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.render(), 60);
  }

  render() {
    if (!this.asset) {
      this.clearPreviews();
      this.sampleInfo.textContent = "Click the image background to sample it.";
      this.maskStats.textContent = "No mask";
      setWarning(this.warning, "Import an image, then click the background color to remove.");
      this.context.setDirtyState();
      return;
    }

    setWarning(this.warning, this.sample ? [] : "Click a background pixel in the preview to create the transparency mask.");
    if (this.sample) this.process();
    else copyCanvas(this.sourceCanvas, this.outputCanvas);
    drawFitted(this.outputCanvas, this.canvas, this.ctx);
    this.renderZooms();
    this.renderSampleInfo();
    this.context.setDirtyState();
  }

  process() {
    if (!this.asset || !this.sample) return;
    const sourceCtx = this.sourceCanvas.getContext("2d");
    const outputCtx = this.outputCanvas.getContext("2d");
    const imageData = sourceCtx.getImageData(0, 0, this.asset.width, this.asset.height);
    const result = removeBackground(imageData, this.sample, this.settings);
    outputCtx.putImageData(result.imageData, 0, 0);
    this.stats = result.stats;
  }

  renderSampleInfo() {
    if (!this.sample) {
      this.sampleInfo.textContent = "Click the image background to sample it.";
      this.maskStats.textContent = "No mask";
      return;
    }
    const hex = rgbToHex(this.sample.srgb);
    this.sampleInfo.innerHTML = `<span class="sample-chip" style="background:${hex}"></span>${hex} at ${this.sample.x}, ${this.sample.y}`;
    const stats = this.stats || { hard: 0, soft: 0 };
    this.maskStats.textContent = `${stats.hard.toLocaleString()} hard pixels, ${stats.soft.toLocaleString()} soft edge pixels`;
  }

  renderZooms() {
    if (!this.asset || !this.sample) {
      this.clearZoom(this.beforeCanvas);
      this.clearZoom(this.afterCanvas);
      return;
    }
    drawZoom(this.sourceCanvas, this.beforeCanvas, this.sample.x, this.sample.y, this.settings.zoom);
    drawZoom(this.outputCanvas, this.afterCanvas, this.sample.x, this.sample.y, this.settings.zoom);
  }

  clearPreviews() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.clearZoom(this.beforeCanvas);
    this.clearZoom(this.afterCanvas);
  }

  clearZoom(canvas) {
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }
}

function template() {
  return `
    <div class="tool-layout background-remover-layout">
      <section class="editor-pane">
        <div class="pane-title">
          <h2>Transparency Preview</h2>
          <span data-role="source-info">No image loaded</span>
        </div>
        <div class="canvas-stage background-remover-stage">
          <canvas data-role="background-preview" width="960" height="640"></canvas>
        </div>
        <div class="warning" data-role="warning"></div>
        <div class="edge-compare">
          <div>
            <div class="thumb-title">Before</div>
            <canvas data-role="before-zoom" width="180" height="180"></canvas>
          </div>
          <div>
            <div class="thumb-title">After</div>
            <canvas data-role="after-zoom" width="180" height="180"></canvas>
          </div>
        </div>
      </section>
      <aside class="settings-pane">
        <div class="control-group">
          <h3>Sample</h3>
          <div class="sample-readout" data-role="sample-info">Click the image background to sample it.</div>
          <div class="field">
            <label>Sample size</label>
            <select data-role="sample-size">
              <option value="3">3 x 3</option>
              <option value="5" selected>5 x 5</option>
              <option value="7">7 x 7</option>
              <option value="9">9 x 9</option>
            </select>
          </div>
        </div>
        <div class="control-group">
          <h3>Hard Mask</h3>
          <div class="field">
            <label>Tolerance</label>
            <input data-role="tolerance" type="range" min="0" max="255" value="${DEFAULTS.tolerance}" />
          </div>
          <div class="field">
            <label>Selection mode</label>
            <select data-role="connectivity">
              <option value="contiguous" selected>Contiguous only</option>
              <option value="global">Global matching color</option>
            </select>
          </div>
        </div>
        <div class="control-group">
          <h3>Edge Recovery</h3>
          <div class="field">
            <label>Edge width</label>
            <input data-role="edge-width" type="range" min="0" max="12" value="${DEFAULTS.edgeWidth}" />
          </div>
          <div class="field">
            <label>Feather</label>
            <input data-role="feather" type="range" min="1" max="255" value="${DEFAULTS.feather}" />
          </div>
          <label class="toggle">
            <input data-role="decontaminate" type="checkbox" checked />
            <span>Decontaminate edge color</span>
          </label>
          <div class="field">
            <label>Decontamination strength</label>
            <input data-role="decontamination-strength" type="range" min="0" max="100" value="${DEFAULTS.decontaminationStrength}" />
          </div>
        </div>
        <div class="control-group">
          <h3>Inspect</h3>
          <div class="field">
            <label>Edge zoom</label>
            <input data-role="zoom" type="range" min="1" max="12" value="${DEFAULTS.zoom}" />
          </div>
          <div class="sample-readout" data-role="mask-stats">No mask</div>
        </div>
      </aside>
    </div>
  `;
}

function sampleBackground(canvas, centerX, centerY, size) {
  const radius = Math.floor(size / 2);
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const linear = [0, 0, 0];
  const srgb = [0, 0, 0];
  let count = 0;
  for (let y = Math.max(0, centerY - radius); y <= Math.min(canvas.height - 1, centerY + radius); y += 1) {
    for (let x = Math.max(0, centerX - radius); x <= Math.min(canvas.width - 1, centerX + radius); x += 1) {
      const index = (y * canvas.width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        srgb[c] += data[index + c];
        linear[c] += srgbToLinear(data[index + c] / 255);
      }
      count += 1;
    }
  }
  return {
    x: centerX,
    y: centerY,
    srgb: srgb.map((value) => Math.round(value / count)),
    linear: linear.map((value) => value / count),
  };
}

function removeBackground(imageData, sample, settings) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const total = width * height;
  const hard = new Uint8Array(total);
  const tolerance = Math.max(0.002, settings.tolerance / 255);

  if (settings.connectivity === "global") {
    for (let index = 0; index < total; index += 1) {
      if (linearDistanceAt(data, index, sample.linear) <= tolerance) hard[index] = 1;
    }
  } else {
    floodFill(data, width, height, sample.x, sample.y, tolerance, sample.linear, hard);
  }

  const band = buildEdgeBand(hard, width, height, settings.edgeWidth);
  const output = new ImageData(new Uint8ClampedArray(data), width, height);
  const out = output.data;
  let hardCount = 0;
  let softCount = 0;
  const feather = Math.max(0.004, settings.feather / 255);
  const despill = settings.decontaminate ? settings.decontaminationStrength / 100 : 0;

  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const sourceAlpha = data[offset + 3] / 255;
    if (hard[index]) {
      out[offset + 3] = 0;
      hardCount += 1;
      continue;
    }
    if (!band[index]) continue;

    const colorDistance = linearDistanceAt(data, index, sample.linear);
    const colorAlpha = smoothstep(tolerance * 0.55, tolerance + feather, colorDistance);
    const spatialAlpha = smoothstep(0, 1, (band[index] - 1) / Math.max(1, settings.edgeWidth));
    const alpha = clamp(Math.max(colorAlpha, spatialAlpha) * sourceAlpha, 0, sourceAlpha);
    if (alpha < sourceAlpha) softCount += 1;

    if (despill > 0 && alpha > 0.015 && alpha < 0.999) {
      for (let c = 0; c < 3; c += 1) {
        const observed = data[offset + c] / 255;
        const background = sample.srgb[c] / 255;
        const reconstructed = clamp((observed - (1 - alpha) * background) / Math.max(alpha, 0.015), 0, 1);
        out[offset + c] = Math.round(255 * mix(observed, reconstructed, despill));
      }
    }
    out[offset + 3] = Math.round(alpha * 255);
  }

  return { imageData: output, stats: { hard: hardCount, soft: softCount } };
}

function floodFill(data, width, height, startX, startY, tolerance, targetLinear, hard) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = [startY * width + startX];
  visited[queue[0]] = 1;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    if (linearDistanceAt(data, index, targetLinear) > tolerance) continue;
    hard[index] = 1;
    const x = index % width;
    const y = Math.floor(index / width);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (visited[next]) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
  }
}

function buildEdgeBand(mask, width, height, radius) {
  const band = new Uint8Array(width * height);
  let frontier = mask;
  for (let step = 1; step <= radius; step += 1) {
    const next = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (!frontier[index]) continue;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const neighbor = ny * width + nx;
            if (mask[neighbor] || band[neighbor]) continue;
            band[neighbor] = step;
            next[neighbor] = 1;
          }
        }
      }
    }
    frontier = next;
  }
  return band;
}

function drawFitted(source, target, ctx) {
  ctx.clearRect(0, 0, target.width, target.height);
  const rect = fittedRect(source.width, source.height, target.width, target.height);
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
}

function fittedRect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight, 1);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  return {
    x: Math.floor((targetWidth - width) / 2),
    y: Math.floor((targetHeight - height) / 2),
    width,
    height,
    scale,
  };
}

function drawZoom(source, target, centerX, centerY, zoom) {
  const ctx = target.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, target.width, target.height);
  const size = Math.max(6, Math.floor(Math.min(target.width, target.height) / zoom));
  const sx = clamp(Math.round(centerX - size / 2), 0, Math.max(0, source.width - size));
  const sy = clamp(Math.round(centerY - size / 2), 0, Math.max(0, source.height - size));
  ctx.drawImage(source, sx, sy, Math.min(size, source.width), Math.min(size, source.height), 0, 0, target.width, target.height);
}

function copyCanvas(source, target) {
  target.width = source.width;
  target.height = source.height;
  target.getContext("2d").drawImage(source, 0, 0);
}

function linearDistanceAt(data, pixelIndex, target) {
  const offset = pixelIndex * 4;
  const dr = srgbToLinear(data[offset] / 255) - target[0];
  const dg = srgbToLinear(data[offset + 1] / 255) - target[1];
  const db = srgbToLinear(data[offset + 2] / 255) - target[2];
  return Math.hypot(dr, dg, db);
}

function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function rgbToHex(rgb) {
  return `#${rgb.map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function safeBaseName(fileName) {
  const base = String(fileName || "image").replace(/\.[^.]+$/, "");
  return base.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_").replace(/\s+/g, "_") || "image";
}
