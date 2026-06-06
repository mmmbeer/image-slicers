import { getAdjustedSourceRect, getGrid, positionGridZoomPopover } from "./gridEditor.js";

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
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(tool.asset.image, source.x, source.y, source.width, source.height, x, y, w, h);
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.strokeRect(x, y, w, h);
    if (cell.index === tool.selectedCellIndex) drawSelectedCell(ctx, x, y, w, h);
  }
  positionGridZoomPopover(tool, grid, fit);
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
  ctx.drawImage(tool.asset.image, source.x, source.y, source.width, source.height, 0, 0, size, size);
  return canvas;
}
