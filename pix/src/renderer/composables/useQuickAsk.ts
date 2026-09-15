/**
 * Module-level quick-ask seams for PdfSelectionQuickAsk and NotesPanel.
 *
 * PdfSelectionQuickAsk emits the selected text; ChatPanel registers a handler
 * on mount and clears it on unmount. Mirrors useRegionCapture.ts.
 * The notes seam carries no payload: NotesPanel first replaces the note
 * selection in the store, then emits a bare trigger (R8 design §1.4).
 */

export type QuickAskHandler = (text: string) => void;

let currentHandler: QuickAskHandler | null = null;

export function registerQuickAskConsumer(handler: QuickAskHandler | null): void {
  currentHandler = handler;
}

export function emitQuickAsk(text: string): void {
  currentHandler?.(text);
}

export type NotesAskHandler = () => void;

let currentNotesAskHandler: NotesAskHandler | null = null;

export function registerNotesAskConsumer(handler: NotesAskHandler | null): void {
  currentNotesAskHandler = handler;
}

export function emitNotesAsk(): void {
  currentNotesAskHandler?.();
}
