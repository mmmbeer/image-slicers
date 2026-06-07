import { getAdjustedSourceRect, getGrid, positionGridZoomPopover } from "./gridEditor.js";
import { applyCropToRects, cropRect } from "./crop.js";
import { drawImageTransparent } from "./drawImage.js";

export function drawGridPreview(tool) {
  if (!tool.asset) return;
  const fit = tool.context.canvasUtils.fitSize(tool.asset.width, tool.asset.height, 960, 620);
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  tool.gridPreviewCanvas.style.width = `${fit.width}px`;
  tool.gridPreviewCanvas.style.height = `${fit.height}px`;
  tool.gridPreviewCanvas.width = Math.floor(fit.width * dpr);
  tool.gridPreviewCanvas.height = Math.floor(fit.height * dpr);
  const ctx = tool.gridPreviewCanvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, tool.gridPreviewCanvas.width, tool.gridPreviewCanvas.height);
  ctx.scale(dpr, dpr);
  const grid = getGrid(tool);
  ctx.strokeStyle = "#7ed0ff";
  ctx.lineWidth = 1.5;
  ctx.fillStyle = "rgba(126, 208, 255, 0.12)";

  for (const cell of grid.cells) {
    const x = cell.x * fit.scale;
    const y = cell.y * fit.scale;
    const w = cell.width * fit.scale;
    const h = cell.height * fit.scale;
    const source = getAdjustedSourceRect(tool, cell);
    const dest = { x, y, width: w, height: h };
    const cropped = applyCropToRects(source, dest, tool.gridCrop);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    drawImageTransparent(ctx, tool.asset.image, cropped.source, cropped.dest);
    ctx.fillRect(x, y, w, h);
    if (tool.gridOverlays.sourceEdge) drawSourceEdge(ctx, tool, source, dest);
    ctx.restore();
    if (tool.gridOverlays.centerLines) drawCenterLines(ctx, x, y, w, h);
    drawCropZone(ctx, cropRect(dest, tool.gridCrop));
    ctx.strokeRect(x, y, w, h);
    if (cell.index === tool.selectedCellIndex) drawSelectedCell(ctx, x, y, w, h);
  }
  positionGridZoomPopover(tool, grid, fit);
}

function drawCenterLines(ctx, x, y, w, h) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
  ctx.restore();
}

function drawCropZone(ctx, rect) {
  ctx.save();
  ctx.strokeStyle = "#a6e3a1";
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawSourceEdge(ctx, tool, source, dest) {
  const imageWidth = tool.asset.width;
  const imageHeight = tool.asset.height;
  const x = dest.x + ((0 - source.x) / source.width) * dest.width;
  const y = dest.y + ((0 - source.y) / source.height) * dest.height;
  const w = (imageWidth / source.width) * dest.width;
  const h = (imageHeight / source.height) * dest.height;
  ctx.save();
  ctx.strokeStyle = "#ffb38a";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawSelectedCell(ctx, x, y, w, h) {
  ctx.save();
  ctx.strokeStyle = "#a6e3a1";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 2));
  ctx.fillStyle = "rgba(166, 227, 161, 0.16)";
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

export function renderGridCellToCanvas(tool, canvas, cell, size) {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  const source = getAdjustedSourceRect(tool, cell);
  const cropped = applyCropToRects(source, { x: 0, y: 0, width: size, height: size }, tool.gridCrop);
  drawImageTransparent(ctx, tool.asset.image, cropped.source, cropped.dest);
  return canvas;
}
