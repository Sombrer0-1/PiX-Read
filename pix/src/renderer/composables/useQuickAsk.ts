/**
 * Module-level quick-ask seam for PdfSelectionQuickAsk.
 *
 * PdfSelectionQuickAsk emits the selected text; ChatPanel registers a handler
 * on mount and clears it on unmount. Mirrors useRegionCapture.ts.
 */

export type QuickAskHandler = (text: string) => void;

let currentHandler: QuickAskHandler | null = null;

export function registerQuickAskConsumer(handler: QuickAskHandler | null): void {
  currentHandler = handler;
}

export function emitQuickAsk(text: string): void {
  currentHandler?.(text);
}
