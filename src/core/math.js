export function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || min)));
}

export function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value || min))));
}
