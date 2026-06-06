export function clampSlices(asset, L, R, T, B) {
  const width = asset?.width || 0;
  const height = asset?.height || 0;
  L = Math.max(0, Math.min(L, width));
  R = Math.max(0, Math.min(R, width));
  T = Math.max(0, Math.min(T, height));
  B = Math.max(0, Math.min(B, height));

  if (L + R > width) {
    const over = L + R - width;
    if (L >= R) L -= over;
    else R -= over;
  }
  if (T + B > height) {
    const over = T + B - height;
    if (T >= B) T -= over;
    else B -= over;
  }

  return {
    L: Math.max(0, Math.round(L)),
    R: Math.max(0, Math.round(R)),
    T: Math.max(0, Math.round(T)),
    B: Math.max(0, Math.round(B)),
  };
}

export function getRects(asset, slices) {
  const { L, R, T, B } = slices;
  const width = asset.width;
  const height = asset.height;
  const x1 = L;
  const x2 = width - R;
  const y1 = T;
  const y2 = height - B;
  return {
    corner_tl: { sx: 0, sy: 0, sw: L, sh: T },
    edge_top: { sx: x1, sy: 0, sw: x2 - x1, sh: T },
    corner_tr: { sx: x2, sy: 0, sw: R, sh: T },
    edge_left: { sx: 0, sy: y1, sw: L, sh: y2 - y1 },
    center: { sx: x1, sy: y1, sw: x2 - x1, sh: y2 - y1 },
    edge_right: { sx: x2, sy: y1, sw: R, sh: y2 - y1 },
    corner_bl: { sx: 0, sy: y2, sw: L, sh: B },
    edge_bottom: { sx: x1, sy: y2, sw: x2 - x1, sh: B },
    corner_br: { sx: x2, sy: y2, sw: R, sh: B },
  };
}

export function getSliceIssues(asset, slices) {
  if (!asset) return ["No image loaded."];
  const { L, R, T, B } = slices;
  const issues = [];
  if (L + R >= asset.width) issues.push("Left and right slices leave no center width.");
  if (T + B >= asset.height) issues.push("Top and bottom slices leave no center height.");
  return issues;
}
