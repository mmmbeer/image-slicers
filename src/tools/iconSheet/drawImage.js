export function drawImageTransparent(ctx, image, source, dest) {
  const sx = Math.max(0, source.x);
  const sy = Math.max(0, source.y);
  const sx2 = Math.min(image.naturalWidth || image.width, source.x + source.width);
  const sy2 = Math.min(image.naturalHeight || image.height, source.y + source.height);
  const sw = sx2 - sx;
  const sh = sy2 - sy;
  if (sw <= 0 || sh <= 0) return;

  const rx = (sx - source.x) / source.width;
  const ry = (sy - source.y) / source.height;
  const rw = sw / source.width;
  const rh = sh / source.height;
  ctx.drawImage(
    image,
    sx,
    sy,
    sw,
    sh,
    dest.x + dest.width * rx,
    dest.y + dest.height * ry,
    dest.width * rw,
    dest.height * rh,
  );
}
