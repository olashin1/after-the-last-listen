// Browser-side image prep for avatar uploads: center-crop to a square and resize.
// Re-encoding through a canvas also drops EXIF metadata such as GPS location.

export type Crop = { sx: number; sy: number; size: number };

/** The largest centered square inside a width × height image. */
export function squareCrop(width: number, height: number): Crop {
  if (!(width > 0 && height > 0)) throw new RangeError("Image has no size.");
  const size = Math.min(width, height);
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size,
  };
}

/** Output edge length: never upscale a small image. */
export function outputSize(cropSize: number, max: number): number {
  return Math.max(1, Math.min(Math.round(cropSize), max));
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Center-crop `file` to a square of at most `max` px and encode it as WebP
 * (JPEG where the browser can't encode WebP). Throws if the file isn't a decodable image.
 */
export async function resizeToSquare(file: Blob, max: number): Promise<Blob> {
  // imageOrientation: honour EXIF rotation before cropping, since the output has no EXIF.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { sx, sy, size } = squareCrop(bitmap.width, bitmap.height);
    const edge = outputSize(size, max);

    const canvas = document.createElement("canvas");
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, edge, edge);

    // Browsers that can't encode WebP silently return PNG, so check the type.
    const webp = await toBlob(canvas, "image/webp", 0.85);
    if (webp?.type === "image/webp") return webp;
    const jpeg = await toBlob(canvas, "image/jpeg", 0.88);
    if (jpeg) return jpeg;
    throw new Error("Could not encode the image.");
  } finally {
    bitmap.close();
  }
}
