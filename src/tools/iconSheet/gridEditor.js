import { clampInt, clampNumber } from "../../core/math.js";

export function getGrid(tool) {
  const rows = clampInt(tool.inputs.rows.value, 1, 64);
  const cols = clampInt(tool.inputs.cols.value, 1, 64);
  const sourceWidth = tool.asset?.width || 1;
  const sourceHeight = tool.asset?.height || 1;
  const maxPadding = Math.max(0, Math.floor((Math.min(sourceWidth, sourceHeight) - 1) / 2));
  const padding = clampInt(tool.inputs.padding.value, 0, maxPadding);
  const spacingLimits = [];
  if (cols > 1) spacingLimits.push(Math.floor((sourceWidth - padding * 2 - 1) / (cols - 1)));
  if (rows > 1) spacingLimits.push(Math.floor((sourceHeight - padding * 2 - 1) / (rows - 1)));
  const maxSpacing = Math.max(0, Math.min(...spacingLimits, Math.max(sourceWidth, sourceHeight)));
  const spacing = clampInt(tool.inputs.spacing.value, 0, maxSpacing);
  const availableWidth = Math.max(1, sourceWidth - padding * 2 - spacing * (cols - 1));
  const availableHeight = Math.max(1, sourceHeight - padding * 2 - spacing * (rows - 1));
  const cellWidth = Math.max(1, Math.floor(availableWidth / cols));
  const cellHeight = Math.max(1, Math.floor(availableHeight / rows));
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({
        index: row * cols + col + 1,
        x: padding + col * (cellWidth + spacing),
        y: padding + row * (cellHeight + spacing),
        width: cellWidth,
        height: cellHeight,
      });
    }
  }
  return { rows, cols, spacing, padding, cells };
}

export function normalizeGridControls(tool) {
  if (!tool.asset) return;
  const { rows, cols, spacing, padding } = getGrid(tool);
  tool.inputs.rows.value = String(rows);
  tool.inputs.cols.value = String(cols);
  tool.inputs.spacing.value = String(spacing);
  tool.inputs.padding.value = String(padding);
  const cellCount = rows * cols;
  if (tool.selectedCellIndex && tool.selectedCellIndex > cellCount) {
    tool.selectedCellIndex = null;
    loadActiveCellZoom(tool);
  }
}

export function getCellAdjustment(tool, index) {
  return tool.gridAdjustments.get(index) || { offsetX: 0, offsetY: 0, zoom: 1 };
}

export function setCellAdjustment(tool, index, adjustment) {
  const offsetX = clampNumber(adjustment.offsetX, -100, 100);
  const offsetY = clampNumber(adjustment.offsetY, -100, 100);
  const zoom = clampNumber(adjustment.zoom, 0.5, 4);
  if (offsetX === 0 && offsetY === 0 && zoom === 1) {
    tool.gridAdjustments.delete(index);
    return;
  }
  tool.gridAdjustments.set(index, { offsetX, offsetY, zoom });
}

export function saveActiveCellZoom(tool) {
  if (!tool.selectedCellIndex) return;
  const current = getCellAdjustment(tool, tool.selectedCellIndex);
  const zoom = clampNumber(tool.inputs.cellZoom.value, 0.5, 4);
  setCellAdjustment(tool, tool.selectedCellIndex, { ...current, zoom });
}

export function loadActiveCellZoom(tool) {
  const adjustment = tool.selectedCellIndex ? getCellAdjustment(tool, tool.selectedCellIndex) : { zoom: 1 };
  tool.inputs.cellZoom.value = String(adjustment.zoom);
  tool.gridZoomPopover.hidden = !tool.selectedCellIndex;
}

export function resetAllCellAdjustments(tool) {
  tool.gridAdjustments.clear();
  tool.gridBaseAdjustment = { offsetX: 0, offsetY: 0 };
  tool.gridCrop.left = 0;
  tool.gridCrop.right = 0;
  tool.gridCrop.top = 0;
  tool.gridCrop.bottom = 0;
  loadActiveCellZoom(tool);
  tool.render();
}

export function bindGridPointerEvents(tool) {
  tool.gridPreviewCanvas.addEventListener("pointerdown", (event) => onGridPointerDown(tool, event));
  tool.gridPreviewCanvas.addEventListener("pointermove", (event) => onGridPointerMove(tool, event));
  tool.gridPreviewCanvas.addEventListener("pointerup", (event) => onGridPointerUp(tool, event));
  tool.gridPreviewCanvas.addEventListener("pointercancel", (event) => onGridPointerCancel(tool, event));
}

export function onGridPointerDown(tool, event) {
  if (tool.mode !== "grid" || !tool.asset) return;
  const cropHit = getGridCropEdgeAtPointer(tool, event);
  if (cropHit) {
    tool.gridDrag = {
      type: "crop",
      pointerId: event.pointerId,
      edge: cropHit.edge,
      cell: cropHit.cell,
    };
    tool.gridPreviewCanvas.setPointerCapture?.(event.pointerId);
    return;
  }
  const hit = getGridCellAtPointer(tool, event);
  if (!hit) return;
  try {
    tool.gridPreviewCanvas.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic pointer events used by smoke tests may not have a live pointer capture target.
  }
  tool.gridDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    moved: false,
    cellIndex: hit.cell.index,
    target: tool.selectedCellIndex ? (hit.cell.index === tool.selectedCellIndex ? "cell" : "none") : "all",
  };
}

export function onGridPointerMove(tool, event) {
  if (!tool.gridDrag || tool.gridDrag.pointerId !== event.pointerId) return;
  if (tool.gridDrag.type === "crop") {
    updateGridCropFromPointer(tool, event);
    tool.render();
    return;
  }
  const dx = event.clientX - tool.gridDrag.lastX;
  const dy = event.clientY - tool.gridDrag.lastY;
  const totalDx = event.clientX - tool.gridDrag.startX;
  const totalDy = event.clientY - tool.gridDrag.startY;
  if (Math.hypot(totalDx, totalDy) < 3) return;
  tool.gridDrag.moved = true;
  tool.gridDrag.lastX = event.clientX;
  tool.gridDrag.lastY = event.clientY;
  const scale = getGridPreviewFit(tool)?.scale || 1;
  const sourceDx = dx / scale;
  const sourceDy = dy / scale;
  if (tool.gridDrag.target === "cell" && tool.selectedCellIndex) nudgeCellAdjustment(tool, tool.selectedCellIndex, sourceDx, sourceDy);
  else if (tool.gridDrag.target === "all") nudgeBaseGridAdjustment(tool, sourceDx, sourceDy);
  tool.render();
}

export function onGridPointerUp(tool, event) {
  if (!tool.gridDrag || tool.gridDrag.pointerId !== event.pointerId) return;
  const drag = tool.gridDrag;
  tool.gridDrag = null;
  if (tool.gridPreviewCanvas.hasPointerCapture?.(event.pointerId)) {
    tool.gridPreviewCanvas.releasePointerCapture(event.pointerId);
  }
  if (drag.type === "crop") return;
  if (drag.moved) return;
  tool.selectedCellIndex = tool.selectedCellIndex === drag.cellIndex ? null : drag.cellIndex;
  loadActiveCellZoom(tool);
  tool.render();
}

export function onGridPointerCancel(tool, event) {
  if (!tool.gridDrag || tool.gridDrag.pointerId !== event.pointerId) return;
  tool.gridDrag = null;
  if (tool.gridPreviewCanvas.hasPointerCapture?.(event.pointerId)) {
    tool.gridPreviewCanvas.releasePointerCapture(event.pointerId);
  }
}

export function nudgeCellAdjustment(tool, index, sourceDx, sourceDy) {
  const cell = getGrid(tool).cells.find((item) => item.index === index);
  if (!cell) return;
  const current = getCellAdjustment(tool, index);
  setCellAdjustment(tool, index, {
    ...current,
    offsetX: current.offsetX - (sourceDx / cell.width) * 100,
    offsetY: current.offsetY - (sourceDy / cell.height) * 100,
  });
}

export function nudgeBaseGridAdjustment(tool, sourceDx, sourceDy) {
  const cell = getGrid(tool).cells[0];
  if (!cell) return;
  tool.gridBaseAdjustment = {
    offsetX: clampNumber(tool.gridBaseAdjustment.offsetX - (sourceDx / cell.width) * 100, -100, 100),
    offsetY: clampNumber(tool.gridBaseAdjustment.offsetY - (sourceDy / cell.height) * 100, -100, 100),
  };
}

export function getGridPreviewFit(tool) {
  if (!tool.asset) return null;
  return tool.context.canvasUtils.fitSize(tool.asset.width, tool.asset.height, 960, 620);
}

export function getGridCellAtPointer(tool, event) {
  const fit = getGridPreviewFit(tool);
  if (!fit) return null;
  const rect = tool.gridPreviewCanvas.getBoundingClientRect();
  const sourceX = ((event.clientX - rect.left) / rect.width) * tool.asset.width;
  const sourceY = ((event.clientY - rect.top) / rect.height) * tool.asset.height;
  const cell = getGrid(tool).cells.find((item) => (
    sourceX >= item.x
    && sourceX <= item.x + item.width
    && sourceY >= item.y
    && sourceY <= item.y + item.height
  ));
  return cell ? { cell, fit } : null;
}

export function getGridCropEdgeAtPointer(tool, event) {
  const hit = getGridCellAtPointer(tool, event);
  if (!hit) return null;
  const rect = tool.gridPreviewCanvas.getBoundingClientRect();
  const fit = hit.fit;
  const x = (event.clientX - rect.left) / fit.scale;
  const y = (event.clientY - rect.top) / fit.scale;
  const crop = tool.gridCrop;
  const cell = hit.cell;
  const cropLeft = cell.x + cell.width * crop.left;
  const cropRight = cell.x + cell.width * (1 - crop.right);
  const cropTop = cell.y + cell.height * crop.top;
  const cropBottom = cell.y + cell.height * (1 - crop.bottom);
  const tolerance = Math.max(5 / fit.scale, 2);
  const edges = [
    { edge: "left", d: Math.abs(x - cropLeft), inside: y >= cropTop && y <= cropBottom },
    { edge: "right", d: Math.abs(x - cropRight), inside: y >= cropTop && y <= cropBottom },
    { edge: "top", d: Math.abs(y - cropTop), inside: x >= cropLeft && x <= cropRight },
    { edge: "bottom", d: Math.abs(y - cropBottom), inside: x >= cropLeft && x <= cropRight },
  ].filter((item) => item.inside && item.d <= tolerance);
  edges.sort((a, b) => a.d - b.d);
  return edges[0] ? { edge: edges[0].edge, cell } : null;
}

export function updateGridCropFromPointer(tool, event) {
  const drag = tool.gridDrag;
  const rect = tool.gridPreviewCanvas.getBoundingClientRect();
  const fit = getGridPreviewFit(tool);
  if (!fit || !drag?.cell) return;
  const x = ((event.clientX - rect.left) / rect.width) * tool.asset.width;
  const y = ((event.clientY - rect.top) / rect.height) * tool.asset.height;
  const cell = drag.cell;
  if (drag.edge === "left") tool.setGridCropEdge("left", (x - cell.x) / cell.width);
  if (drag.edge === "right") tool.setGridCropEdge("right", (cell.x + cell.width - x) / cell.width);
  if (drag.edge === "top") tool.setGridCropEdge("top", (y - cell.y) / cell.height);
  if (drag.edge === "bottom") tool.setGridCropEdge("bottom", (cell.y + cell.height - y) / cell.height);
}

export function positionGridZoomPopover(tool, grid, fit) {
  tool.gridZoomPopover.hidden = !tool.selectedCellIndex;
  if (!tool.selectedCellIndex) return;
  const cell = grid.cells.find((item) => item.index === tool.selectedCellIndex);
  if (!cell) return;
  const stageRect = tool.gridPreviewCanvas.parentElement.getBoundingClientRect();
  const canvasRect = tool.gridPreviewCanvas.getBoundingClientRect();
  const canvasLeft = canvasRect.left - stageRect.left;
  const canvasTop = canvasRect.top - stageRect.top;
  const x = cell.x * fit.scale;
  const y = cell.y * fit.scale;
  const w = cell.width * fit.scale;
  tool.gridZoomPopover.style.left = `${Math.max(8, canvasLeft + x + w / 2)}px`;
  tool.gridZoomPopover.style.top = `${Math.max(8, canvasTop + y + 8)}px`;
}

export function getAdjustedSourceRect(tool, cell) {
  const cellAdjustment = getCellAdjustment(tool, cell.index);
  const adjustment = {
    offsetX: tool.gridBaseAdjustment.offsetX + cellAdjustment.offsetX,
    offsetY: tool.gridBaseAdjustment.offsetY + cellAdjustment.offsetY,
    zoom: cellAdjustment.zoom,
  };
  const zoom = Math.max(0.5, adjustment.zoom || 1);
  const width = Math.max(1, cell.width / zoom);
  const height = Math.max(1, cell.height / zoom);
  const centerX = cell.x + cell.width / 2 + (adjustment.offsetX / 100) * cell.width;
  const centerY = cell.y + cell.height / 2 + (adjustment.offsetY / 100) * cell.height;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}
