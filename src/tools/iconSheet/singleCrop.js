import { STAGE_SIZE } from "./constants.js";

const HANDLE = 10;

export function setupSingleCrop(tool) {
  if (!window.Konva || !tool.guideLayer) return;
  tool.singleCropRect = new window.Konva.Rect({
    stroke: "#a6e3a1",
    strokeWidth: 2,
    listening: false,
  });
  tool.singleCropHandles = ["left", "right", "top", "bottom"].map((edge) => makeHandle(tool, edge));
  tool.guideLayer.add(tool.singleCropRect);
  for (const handle of tool.singleCropHandles) tool.guideLayer.add(handle);
  updateSingleCropOverlay(tool);
}

export function updateSingleCropOverlay(tool) {
  if (!tool.singleCropRect) return;
  const rect = getSingleCropStageRect(tool);
  tool.singleCropRect.setAttrs(rect);
  for (const handle of tool.singleCropHandles) {
    const edge = handle.name();
    const attrs = edge === "left" || edge === "right"
      ? { x: rect.x + (edge === "left" ? 0 : rect.width) - HANDLE / 2, y: rect.y + rect.height / 2 - HANDLE / 2 }
      : { x: rect.x + rect.width / 2 - HANDLE / 2, y: rect.y + (edge === "top" ? 0 : rect.height) - HANDLE / 2 };
    handle.setAttrs(attrs);
  }
  tool.guideLayer.batchDraw();
}

export function getSingleCropStageRect(tool) {
  const crop = tool.singleCrop;
  return {
    x: STAGE_SIZE * crop.left,
    y: STAGE_SIZE * crop.top,
    width: STAGE_SIZE * Math.max(0.01, 1 - crop.left - crop.right),
    height: STAGE_SIZE * Math.max(0.01, 1 - crop.top - crop.bottom),
  };
}

function makeHandle(tool, edge) {
  const handle = new window.Konva.Rect({
    name: edge,
    width: HANDLE,
    height: HANDLE,
    fill: "#a6e3a1",
    stroke: "#0f151d",
    strokeWidth: 1,
    draggable: true,
  });
  handle.on("dragmove", () => {
    const pos = handle.position();
    if (edge === "left") tool.setSingleCropEdge("left", pos.x / STAGE_SIZE);
    if (edge === "right") tool.setSingleCropEdge("right", 1 - (pos.x + HANDLE / 2) / STAGE_SIZE);
    if (edge === "top") tool.setSingleCropEdge("top", pos.y / STAGE_SIZE);
    if (edge === "bottom") tool.setSingleCropEdge("bottom", 1 - (pos.y + HANDLE / 2) / STAGE_SIZE);
    updateSingleCropOverlay(tool);
    tool.scheduleRender();
  });
  handle.on("mouseenter", () => {
    document.body.style.cursor = edge === "left" || edge === "right" ? "ew-resize" : "ns-resize";
  });
  handle.on("mouseleave", () => {
    document.body.style.cursor = "default";
  });
  return handle;
}
