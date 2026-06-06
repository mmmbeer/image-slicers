export async function loadImageFile(file) {
  if (!file || !file.type?.startsWith("image/")) {
    throw new Error("Choose a PNG, JPG, GIF, or other browser-supported image file.");
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageUrl(url);
    return {
      file,
      fileName: file.name,
      type: file.type,
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadImageUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be decoded."));
    image.src = url;
  });
}
