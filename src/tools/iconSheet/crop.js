import { clampNumber } from "../../core/math.js";

export function defaultCrop() {
  return { left: 0, right: 0, top: 0, bottom: 0 };
}

export function resetCrop(crop) {
  crop.left = 0;
  crop.right = 0;
  crop.top = 0;
  crop.bottom = 0;
}

export function setCropEdge(crop, edge, value) {
  const opposite = edge === "left" ? crop.right
    : edge === "right" ? crop.left
      : edge === "top" ? crop.bottom
        : crop.top;
  crop[edge] = clampNumber(value, 0, Math.max(0, 0.9 - opposite));
}

export function applyCropToRects(source, dest, crop) {
  const left = crop.left;
  const right = crop.right;
  const top = crop.top;
  const bottom = crop.bottom;
  return {
    source: {
      x: source.x + source.width * left,
      y: source.y + source.height * top,
      width: source.width * Math.max(0.01, 1 - left - right),
      height: source.height * Math.max(0.01, 1 - top - bottom),
    },
    dest: {
      x: dest.x + dest.width * left,
      y: dest.y + dest.height * top,
      width: dest.width * Math.max(0.01, 1 - left - right),
      height: dest.height * Math.max(0.01, 1 - top - bottom),
    },
  };
}

export function cropRect(dest, crop) {
  return {
    x: dest.x + dest.width * crop.left,
    y: dest.y + dest.height * crop.top,
    width: dest.width * Math.max(0.01, 1 - crop.left - crop.right),
    height: dest.height * Math.max(0.01, 1 - crop.top - crop.bottom),
  };
}
