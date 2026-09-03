/**
 * Canvas -> PNG helpers shared by the PDF page capture and paste-image paths.
 * Both cap the long edge at 2000px, matching the kernel's resizeImage limit,
 * so a HiDPI page or screenshot can never bloat the request payload.
 */

const BASE64_MARKER = "base64,";

export interface PreparedImage {
  mimeType: string;
  base64: string;
}

export function canvasToPngBase64(canvas: HTMLCanvasElement): string | null {
  const dataUrl = canvas.toDataURL("image/png");
  const index = dataUrl.indexOf(BASE64_MARKER);
  return index < 0 ? null : dataUrl.slice(index + BASE64_MARKER.length);
}

/** Decode a pasted image file and downscale it to maxEdge on the long side. */
export async function preparePastedImage(file: File, maxEdge = 2000): Promise<PreparedImage | null> {
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, width, height);
      const base64 = canvasToPngBase64(canvas);
      return base64 ? { mimeType: "image/png", base64 } : null;
    } finally {
      bitmap.close();
    }
  } catch (err) {
    // Undecodable formats (svg, heic, corrupted data) are skipped, not fatal.
    console.error("[image-capture] Failed to decode pasted image", err);
    return null;
  }
}
