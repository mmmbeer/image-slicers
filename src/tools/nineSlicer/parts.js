export const baseParts = [
  { key: "corner_tl", label: "Corner TL", tag: "top-left" },
  { key: "edge_top", label: "Top", tag: "stretch X" },
  { key: "corner_tr", label: "Corner TR", tag: "top-right" },
  { key: "edge_left", label: "Left", tag: "stretch Y" },
  { key: "center", label: "Center", tag: "texture" },
  { key: "edge_right", label: "Right", tag: "stretch Y" },
  { key: "corner_bl", label: "Corner BL", tag: "bottom-left" },
  { key: "edge_bottom", label: "Bottom", tag: "stretch X" },
  { key: "corner_br", label: "Corner BR", tag: "bottom-right" },
];

export const fadeParts = [
  { key: "edge_top_fade", label: "Top Fade", tag: "overlay" },
  { key: "edge_left_fade", label: "Left Fade", tag: "overlay" },
  { key: "edge_right_fade", label: "Right Fade", tag: "overlay" },
  { key: "edge_bottom_fade", label: "Bottom Fade", tag: "overlay" },
];

export function getParts(fadeEnabled) {
  return fadeEnabled ? [...baseParts, ...fadeParts] : [...baseParts];
}
