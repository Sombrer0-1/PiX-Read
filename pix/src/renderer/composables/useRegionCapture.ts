/**
 * Module-level page-region capture seam for ChatPanel.
 *
 * PdfViewer emits a captured region image; ChatPanel registers a handler on
 * mount and clears it on unmount. Mirrors useQuickAsk.ts.
 */

import type { PageCapture } from "@shared/types";

export type RegionCaptureHandler = (image: PageCapture) => void;

let currentHandler: RegionCaptureHandler | null = null;

export function registerRegionCaptureConsumer(handler: RegionCaptureHandler | null): void {
  currentHandler = handler;
}

export function emitRegionCapture(image: PageCapture): void {
  currentHandler?.(image);
}
