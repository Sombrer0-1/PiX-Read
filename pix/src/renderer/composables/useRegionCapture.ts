/**
 * Module-level page-region capture seam for ChatPanel.
 *
 * PdfViewer emits a captured region image; ChatPanel registers a handler on
 * mount and clears it on unmount. Mirrors useQuickAsk.ts.
 *
 * The handler returns whether the image was accepted (e.g. rejected when the
 * composer is already at its image cap) so PdfViewer can surface the failure
 * instead of silently losing the capture.
 */

import type { PageCapture } from "@shared/types";

export type RegionCaptureHandler = (image: PageCapture) => boolean;

let currentHandler: RegionCaptureHandler | null = null;

export function registerRegionCaptureConsumer(handler: RegionCaptureHandler | null): void {
  currentHandler = handler;
}

export function emitRegionCapture(image: PageCapture): boolean {
  return currentHandler ? currentHandler(image) : false;
}
