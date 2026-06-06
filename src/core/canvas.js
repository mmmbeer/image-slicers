export function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas export failed."));
    }, type, quality);
  });
}

export function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function copyCanvas(source) {
  const canvas = createCanvas(source.width, source.height);
  canvas.getContext("2d").drawImage(source, 0, 0);
  return canvas;
}

export function cropImage(image, sx, sy, sw, sh) {
  const canvas = createCanvas(sw, sh);
  const context = canvas.getContext("2d");
  if (sw > 0 && sh > 0) {
    context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  }
  return canvas;
}

export function fitSize(width, height, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
  };
}
