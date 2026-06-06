export function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

export async function downloadItems(items) {
  for (const item of items) {
    const blob = await item.getBlob();
    downloadBlob(blob, item.filename);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function downloadZip(items, filename = "image-tool-export.zip") {
  if (!window.JSZip) {
    throw new Error("JSZip did not load from the CDN.");
  }

  const zip = new window.JSZip();
  for (const item of items) {
    zip.file(item.filename, await item.getBlob());
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, filename);
}

export function safeFilenamePart(value, fallback = "asset") {
  const cleaned = String(value || "")
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}
