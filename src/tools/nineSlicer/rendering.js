import { baseParts } from "./parts.js";
import { getRects } from "./slices.js";

export function drawSliceToCanvas(asset, canvas, { sx, sy, sw, sh }) {
  canvas.width = Math.max(1, sw);
  canvas.height = Math.max(1, sh);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (sw > 0 && sh > 0) {
    ctx.drawImage(asset.image, sx, sy, sw, sh, 0, 0, sw, sh);
  }
}

export function copyCanvasTo(source, target) {
  target.width = source.width;
  target.height = source.height;
  const ctx = target.getContext("2d");
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0);
}

export function makeFadedEdge(source, direction, fadePx, mode) {
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

export function updatePartCanvases({ asset, slices, canvases, fadeEnabled, fadeWidth, fadeMode }) {
  const rects = getRects(asset, slices);
  for (const part of baseParts) {
    const canvas = canvases.get(part.key);
    if (canvas) drawSliceToCanvas(asset, canvas, rects[part.key]);
  }

  if (!fadeEnabled) return;
  copyCanvasTo(makeFadedEdge(canvases.get("edge_top"), "down", fadeWidth, fadeMode), canvases.get("edge_top_fade"));
  copyCanvasTo(makeFadedEdge(canvases.get("edge_left"), "right", fadeWidth, fadeMode), canvases.get("edge_left_fade"));
  copyCanvasTo(makeFadedEdge(canvases.get("edge_right"), "left", fadeWidth, fadeMode), canvases.get("edge_right_fade"));
  copyCanvasTo(makeFadedEdge(canvases.get("edge_bottom"), "up", fadeWidth, fadeMode), canvases.get("edge_bottom_fade"));
}

export function drawSlicePreview({ canvas, context, asset, slices, fitSize }) {
  const { image, width, height } = asset;
  const fit = fitSize(width, height, 960, 620);
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  canvas.style.width = `${fit.width}px`;
  canvas.style.height = `${fit.height}px`;
  canvas.width = Math.floor(fit.width * dpr);
  canvas.height = Math.floor(fit.height * dpr);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.scale(dpr, dpr);
  context.drawImage(image, 0, 0, width, height, 0, 0, fit.width, fit.height);

  const x1 = slices.L * fit.scale;
  const x2 = (width - slices.R) * fit.scale;
  const y1 = slices.T * fit.scale;
  const y2 = (height - slices.B) * fit.scale;

  context.save();
  context.globalAlpha = 0.22;
  context.fillStyle = "#000";
  context.fillRect(0, 0, x1, fit.height);
  context.fillRect(x2, 0, fit.width - x2, fit.height);
  context.fillRect(x1, 0, x2 - x1, y1);
  context.fillRect(x1, y2, x2 - x1, fit.height - y2);
  context.restore();

  context.save();
  context.lineWidth = 2;
  context.strokeStyle = "#ff5964";
  context.beginPath();
  context.moveTo(x1, 0);
  context.lineTo(x1, fit.height);
  context.moveTo(x2, 0);
  context.lineTo(x2, fit.height);
  context.moveTo(0, y1);
  context.lineTo(fit.width, y1);
  context.moveTo(0, y2);
  context.lineTo(fit.width, y2);
  context.stroke();
  context.fillStyle = "#ff5964";
  context.fillRect(x1 - 4, fit.height / 2 - 4, 8, 8);
  context.fillRect(x2 - 4, fit.height / 2 - 4, 8, 8);
  context.fillRect(fit.width / 2 - 4, y1 - 4, 8, 8);
  context.fillRect(fit.width / 2 - 4, y2 - 4, 8, 8);
  context.restore();
}
