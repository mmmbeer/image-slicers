import { STAGE_SIZE } from "./constants.js";
import { applyCropToRects, resetCrop } from "./crop.js";
import { setupSingleCrop, updateSingleCropOverlay } from "./singleCrop.js";

export function setupKonva(tool) {
  if (!window.Konva) {
    tool.warning.textContent = "Konva did not load from the CDN. Single-icon editing is unavailable.";
    tool.warning.classList.add("visible");
    return;
  }

  tool.stage = new window.Konva.Stage({ container: tool.stageContainer, width: STAGE_SIZE, height: STAGE_SIZE });
  tool.layer = new window.Konva.Layer();
  tool.guideLayer = new window.Konva.Layer();
  tool.stage.add(tool.layer);
  tool.stage.add(tool.guideLayer);
  tool.guideLayer.add(new window.Konva.Rect({
    x: 0, y: 0, width: STAGE_SIZE, height: STAGE_SIZE, stroke: "#7ed0ff", strokeWidth: 2, listening: false,
  }));
  tool.guideLayer.add(new window.Konva.Line({
    points: [STAGE_SIZE / 2, 0, STAGE_SIZE / 2, STAGE_SIZE],
    stroke: "rgba(126,208,255,0.72)", strokeWidth: 1, dash: [6, 6], listening: false,
  }));
  tool.guideLayer.add(new window.Konva.Line({
    points: [0, STAGE_SIZE / 2, STAGE_SIZE, STAGE_SIZE / 2],
    stroke: "rgba(126,208,255,0.72)", strokeWidth: 1, dash: [6, 6], listening: false,
  }));
  tool.transformer = new window.Konva.Transformer({
    rotateEnabled: true,
    keepRatio: true,
    borderStroke: "#a6e3a1",
    anchorStroke: "#a6e3a1",
    anchorFill: "#0f151d",
  });
  tool.guideLayer.add(tool.transformer);
  setupSingleCrop(tool);
}

export function loadKonvaImage(tool) {
  if (!tool.stage || !tool.asset) return;
  tool.konvaImage?.destroy();
  const node = new window.Konva.Image({ image: tool.asset.image });
  tool.konvaImage = node;
  const fit = Math.min(STAGE_SIZE / tool.asset.width, STAGE_SIZE / tool.asset.height);
  node.setAttrs({
    x: STAGE_SIZE / 2,
    y: STAGE_SIZE / 2,
    width: tool.asset.width,
    height: tool.asset.height,
    offsetX: tool.asset.width / 2,
    offsetY: tool.asset.height / 2,
    scaleX: fit,
    scaleY: fit,
    draggable: true,
  });
  node.filters([
    window.Konva.Filters.Brighten,
    window.Konva.Filters.Contrast,
    window.Konva.Filters.HSL,
    window.Konva.Filters.Blur,
    window.Konva.Filters.Pixelate,
  ]);
  node.pixelSize(1);
  node.cache();
  node.on("dragmove transform dragend transformend", () => {
    syncControlsFromNode(tool);
    tool.scheduleRender();
  });
  tool.layer.add(node);
  tool.transformer.nodes([node]);
  tool.layer.batchDraw();
  tool.guideLayer.batchDraw();
  syncControlsFromNode(tool);
  tool.render();
}

export function applySingleControls(tool) {
  if (!tool.konvaImage) return;
  const signX = Math.sign(tool.konvaImage.scaleX()) || 1;
  const signY = Math.sign(tool.konvaImage.scaleY()) || 1;
  const scale = Number(tool.inputs.scale.value || 1);
  tool.konvaImage.scaleX(signX * scale);
  tool.konvaImage.scaleY(signY * scale);
  tool.konvaImage.rotation(Number(tool.inputs.rotation.value || 0));
  tool.konvaImage.brightness(Number(tool.inputs.brightness.value || 0));
  tool.konvaImage.contrast(Number(tool.inputs.contrast.value || 0));
  tool.konvaImage.saturation(Number(tool.inputs.saturation.value || 0));
  tool.konvaImage.hue(Number(tool.inputs.hue.value || 0));
  tool.konvaImage.blurRadius(Number(tool.inputs.blur.value || 0));
  tool.konvaImage.pixelSize(Number(tool.inputs.pixel.value || 1));
  tool.konvaImage.cache();
  tool.layer.batchDraw();
  tool.guideLayer.batchDraw();
}

export function syncControlsFromNode(tool) {
  if (!tool.konvaImage) return;
  tool.inputs.scale.value = String(Math.abs(tool.konvaImage.scaleX()).toFixed(2));
  tool.inputs.rotation.value = String(Math.round(tool.konvaImage.rotation()));
}

export function flipSingle(tool, axis) {
  if (!tool.konvaImage) return;
  if (axis === "x") tool.konvaImage.scaleX(tool.konvaImage.scaleX() * -1);
  if (axis === "y") tool.konvaImage.scaleY(tool.konvaImage.scaleY() * -1);
  tool.konvaImage.cache();
  tool.layer.batchDraw();
  tool.render();
}

export function rotateSingle90(tool) {
  if (!tool.konvaImage) return;
  tool.konvaImage.rotation((tool.konvaImage.rotation() + 90) % 360);
  syncControlsFromNode(tool);
  tool.layer.batchDraw();
  tool.render();
}

export function centerSingle(tool) {
  if (!tool.konvaImage) return;
  tool.konvaImage.position({ x: STAGE_SIZE / 2, y: STAGE_SIZE / 2 });
  tool.layer.batchDraw();
  tool.render();
}

export function resetSingleTransform(tool) {
  if (!tool.konvaImage || !tool.asset) return;
  const fit = Math.min(STAGE_SIZE / tool.asset.width, STAGE_SIZE / tool.asset.height);
  tool.konvaImage.setAttrs({ x: STAGE_SIZE / 2, y: STAGE_SIZE / 2, rotation: 0, scaleX: fit, scaleY: fit });
  tool.inputs.scale.value = String(fit.toFixed(2));
  tool.inputs.rotation.value = "0";
  tool.inputs.brightness.value = "0";
  tool.inputs.contrast.value = "0";
  tool.inputs.saturation.value = "0";
  tool.inputs.hue.value = "0";
  tool.inputs.blur.value = "0";
  tool.inputs.pixel.value = "1";
  resetCrop(tool.singleCrop);
  applySingleControls(tool);
  updateSingleCropOverlay(tool);
  tool.render();
}

export function renderSingleToCanvas(tool, canvas, size) {
  canvas.width = size;
  canvas.height = size;
  if (!tool.stage || !tool.konvaImage) return canvas;
  const previousTransformerVisible = tool.transformer.visible();
  const previousGuideVisible = tool.guideLayer.visible();
  try {
    tool.transformer.visible(false);
    tool.guideLayer.visible(false);
    tool.stage.draw();
    const context = canvas.getContext("2d");
    const exportCanvas = tool.stage.toCanvas({ pixelRatio: size / STAGE_SIZE });
    const cropped = applyCropToRects(
      { x: 0, y: 0, width: size, height: size },
      { x: 0, y: 0, width: size, height: size },
      tool.singleCrop,
    );
    context.clearRect(0, 0, size, size);
    context.drawImage(
      exportCanvas,
      cropped.source.x,
      cropped.source.y,
      cropped.source.width,
      cropped.source.height,
      cropped.dest.x,
      cropped.dest.y,
      cropped.dest.width,
      cropped.dest.height,
    );
  } finally {
    tool.transformer.visible(previousTransformerVisible);
    tool.guideLayer.visible(previousGuideVisible);
    tool.stage.draw();
  }
  return canvas;
}
