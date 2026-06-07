import { defaultCrop, setCropEdge } from "./crop.js";
import { getGridCellAtPointer } from "./gridEditor.js";

export function getGridCrop(tool, index) {
  if (!tool.gridCrops.has(index)) tool.gridCrops.set(index, defaultCrop());
  return tool.gridCrops.get(index);
}

export function resetGridCrops(tool) {
  tool.gridCrops.clear();
}

export function setGridCropEdge(tool, index, edge, value) {
  setCropEdge(getGridCrop(tool, index), edge, value);
}

export function getGridCropEdgeAtPointer(tool, event) {
  const hit = getGridCellAtPointer(tool, event);
  if (!hit) return null;
  const pointer = sourcePointer(tool, event);
  const crop = getGridCrop(tool, hit.cell.index);
  const cell = hit.cell;
  const cropLeft = cell.x + cell.width * crop.left;
  const cropRight = cell.x + cell.width * (1 - crop.right);
  const cropTop = cell.y + cell.height * crop.top;
  const cropBottom = cell.y + cell.height * (1 - crop.bottom);
  const tolerance = Math.max(6 / hit.fit.scale, 2);
  const edges = [
    { edge: "left", d: Math.abs(pointer.x - cropLeft), inside: pointer.y >= cropTop && pointer.y <= cropBottom },
    { edge: "right", d: Math.abs(pointer.x - cropRight), inside: pointer.y >= cropTop && pointer.y <= cropBottom },
    { edge: "top", d: Math.abs(pointer.y - cropTop), inside: pointer.x >= cropLeft && pointer.x <= cropRight },
    { edge: "bottom", d: Math.abs(pointer.y - cropBottom), inside: pointer.x >= cropLeft && pointer.x <= cropRight },
  ].filter((item) => item.inside && item.d <= tolerance);
  edges.sort((a, b) => a.d - b.d);
  return edges[0] ? { edge: edges[0].edge, cell } : null;
}

export function updateGridCropFromPointer(tool, event) {
  const drag = tool.gridDrag;
  const pointer = sourcePointer(tool, event);
  const cell = drag?.cell;
  if (!cell) return;
  if (drag.edge === "left") setGridCropEdge(tool, cell.index, "left", (pointer.x - cell.x) / cell.width);
  if (drag.edge === "right") setGridCropEdge(tool, cell.index, "right", (cell.x + cell.width - pointer.x) / cell.width);
  if (drag.edge === "top") setGridCropEdge(tool, cell.index, "top", (pointer.y - cell.y) / cell.height);
  if (drag.edge === "bottom") setGridCropEdge(tool, cell.index, "bottom", (cell.y + cell.height - pointer.y) / cell.height);
}

export function updateGridHover(tool, event) {
  if (tool.gridDrag || tool.mode !== "grid" || !tool.asset) return;
  const cropHit = getGridCropEdgeAtPointer(tool, event);
  if (cropHit) {
    const vertical = cropHit.edge === "left" || cropHit.edge === "right";
    setCanvasAffordance(tool, vertical ? "ew-resize" : "ns-resize", `Drag ${cropHit.edge} crop edge`);
    return;
  }
  const hit = getGridCellAtPointer(tool, event);
  if (!hit) {
    setCanvasAffordance(tool, "default", tool.selectedCellIndex ? "Click to clear selected section" : "");
    return;
  }
  if (tool.selectedCellIndex === hit.cell.index) {
    setCanvasAffordance(tool, "move", "Drag selected section source image");
  } else if (tool.selectedCellIndex) {
    setCanvasAffordance(tool, "pointer", "Click to clear selected section");
  } else {
    setCanvasAffordance(tool, "grab", "Drag source image for all sections, or click to select");
  }
}

function sourcePointer(tool, event) {
  const rect = tool.gridPreviewCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * tool.asset.width,
    y: ((event.clientY - rect.top) / rect.height) * tool.asset.height,
  };
}

function setCanvasAffordance(tool, cursor, title) {
  tool.gridPreviewCanvas.style.cursor = cursor;
  tool.gridPreviewCanvas.title = title;
}
