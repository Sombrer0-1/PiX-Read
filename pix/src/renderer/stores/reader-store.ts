/**
 * Reader Store
 *
 * Single source of truth for the center reading pane.
 * Later agents should read/write these fields instead of changing this file.
 *
 * Fields:
 * - filePath / page / pageCount / selectedText / outline / mapOpen / captureMode / gotoPage
 * Write `gotoPage` to ask PdfViewer to scroll; it is cleared after the jump.
 */

import { defineStore } from "pinia";
import { ref } from "vue";
import type { ReaderOutlineNode } from "@shared/types";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const DEFAULT_SCALE = 1;

export const useReaderStore = defineStore("reader", () => {
  const filePath = ref<string | null>(null);
  const page = ref(1);
  const pageCount = ref(0);
  const selectedText = ref("");
  const outline = ref<ReaderOutlineNode[]>([]);
  const mapOpen = ref(false);
  /** Region-capture mode: drag a rectangle over the PDF to attach a screenshot. */
  const captureMode = ref(false);
  const scale = ref(DEFAULT_SCALE);
  /** Set to a 1-based page number to scroll; PdfViewer clears it after jumping. */
  const gotoPage = ref<number | null>(null);

  function clampPage(next: number, count: number): number {
    if (count <= 0) return Math.max(1, Math.round(next));
    return Math.min(Math.max(1, Math.round(next)), count);
  }

  function openDocument(path: string | null): void {
    filePath.value = path;
    page.value = 1;
    pageCount.value = 0;
    selectedText.value = "";
    outline.value = [];
    gotoPage.value = null;
  }

  function setPage(next: number): void {
    page.value = clampPage(next, pageCount.value);
  }

  function setPageCount(count: number): void {
    pageCount.value = Math.max(0, count);
    if (pageCount.value > 0) {
      page.value = clampPage(page.value, pageCount.value);
    }
  }

  function setSelectedText(text: string): void {
    selectedText.value = text;
  }

  function setOutline(nodes: ReaderOutlineNode[]): void {
    outline.value = nodes;
  }

  function setMapOpen(open: boolean): void {
    mapOpen.value = open;
  }

  function setCaptureMode(active: boolean): void {
    captureMode.value = active;
  }

  function setScale(next: number): void {
    const rounded = Math.round(next * 100) / 100;
    scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, rounded));
  }

  return {
    filePath,
    page,
    pageCount,
    selectedText,
    outline,
    mapOpen,
    captureMode,
    scale,
    gotoPage,
    openDocument,
    setPage,
    setPageCount,
    setSelectedText,
    setOutline,
    setMapOpen,
    setCaptureMode,
    setScale,
  };
});
