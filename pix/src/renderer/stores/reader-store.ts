/**
 * Reader Store
 *
 * Single source of truth for the center reading pane.
 * Later agents should read/write these fields instead of changing this file.
 *
 * Fields:
 * - filePath / page / pageCount / selectedText / outline / mapOpen / captureMode / gotoPage / pendingJump
 * Write `gotoPage` to ask PdfViewer to scroll; it is cleared after the jump.
 * Cross-document jumps go through the consume-once pair requestJump / takePendingJump.
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
  /**
   * Jump intent for a document that is not loaded yet; PdfViewer consumes it
   * once the page nodes exist. openDocument clears it unless the paths match.
   */
  const pendingJump = ref<{ filePath: string; page: number } | null>(null);

  function clampPage(next: number, count: number): number {
    if (count <= 0) return Math.max(1, Math.round(next));
    return Math.min(Math.max(1, Math.round(next)), count);
  }

  /** 路径比较键：小写 + 正斜杠（与 project-store.normalizePath 同约定）。 */
  function samePath(a: string, b: string): boolean {
    return a.toLowerCase().replace(/\\/g, "/") === b.toLowerCase().replace(/\\/g, "/");
  }

  function openDocument(path: string | null): void {
    filePath.value = path;
    page.value = 1;
    pageCount.value = 0;
    selectedText.value = "";
    outline.value = [];
    gotoPage.value = null;
    // 路径不匹配（或关闭文档）时清除旧意图；匹配则保留给 PdfViewer 消费
    if (!path || !pendingJump.value || !samePath(path, pendingJump.value.filePath)) {
      pendingJump.value = null;
    }
  }

  /**
   * 跳页入口：目标为当前已加载文档 → 直接写既有 gotoPage；否则记录意图等待加载。
   * 越界页钳制到最后页（主进程不解析 PDF，钳制只能发生在消费方）。
   */
  function requestJump(targetPath: string, page: number): void {
    const current = filePath.value;
    if (current && pageCount.value > 0 && samePath(current, targetPath)) {
      gotoPage.value = Math.min(page, pageCount.value);
      return;
    }
    pendingJump.value = { filePath: targetPath, page };
  }

  /** 消费式读取：路径匹配则清除意图并返回页码，否则返回 null；加载成功与失败路径都要调用。 */
  function takePendingJump(targetPath: string): number | null {
    const intent = pendingJump.value;
    if (!intent || !samePath(intent.filePath, targetPath)) return null;
    pendingJump.value = null;
    return intent.page;
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
    pendingJump,
    openDocument,
    requestJump,
    takePendingJump,
    setPage,
    setPageCount,
    setSelectedText,
    setOutline,
    setMapOpen,
    setCaptureMode,
    setScale,
  };
});
