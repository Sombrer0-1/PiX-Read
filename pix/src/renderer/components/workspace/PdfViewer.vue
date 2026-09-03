<script setup lang="ts">
/**
 * PdfViewer — continuous vertical PDF reader for the center pane.
 *
 * Reads PDF bytes through the libraryReadFile IPC (no custom protocol round
 * trip), renders them with pdf.js, keeps a selectable text layer, and exposes
 * gotoPage. Every load failure is bucketed into a Chinese message with the
 * technical line kept secondary. Capture mode lets the user drag a rectangle
 * over a page; the region is pushed to ChatPanel as a screenshot attachment.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { GlobalWorkerOptions, TextLayer, getDocument } from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import PdfJsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker&inline";
import { emitRegionCapture } from "../../composables/useRegionCapture";
import { useProjectStore } from "../../stores/project-store";
import { useReaderStore } from "../../stores/reader-store";
import { canvasToPngBase64 } from "../../utils/image-capture";
import {
  LibraryReadError,
  failureFromLibraryResult,
  failureFromParseError,
  hasLibraryReadApi,
  libraryReadFailureMessage,
  preflightLibraryPath,
  technicalDetail,
} from "../../utils/reading-context";
import type { LibraryReadFailure } from "../../utils/reading-context";
import type { PageCapture, ReaderOutlineNode } from "@shared/types";
import PdfSearchPanel from "./PdfSearchPanel.vue";

// Packaged file:// has origin "null". pdf.js then wraps workerSrc in a blob
// that import()s the file URL, which Chromium blocks. workerPort skips that.
// `?worker&inline` is required because pdf.js rejects anything that is not
// `instanceof Worker`, and the blob URL it builds is same-origin with us.
if (!GlobalWorkerOptions.workerPort) {
  GlobalWorkerOptions.workerPort = new PdfJsWorker();
}

const props = defineProps<{
  filePath: string;
}>();

const readerStore = useReaderStore();
const projectStore = useProjectStore();

const scrollEl = ref<HTMLDivElement | null>(null);
const isLoading = ref(false);
const failure = ref<LibraryReadFailure | null>(null);
const failureDetail = ref("");
const pageSizes = ref<Array<{ width: number; height: number }>>([]);
const searchOpen = ref(false);
const searchPanel = ref<InstanceType<typeof PdfSearchPanel> | null>(null);
const pageEditing = ref(false);
const pageDraft = ref("");
const pageInputEl = ref<HTMLInputElement | null>(null);
const captureLayerEl = ref<HTMLDivElement | null>(null);
/** Drag rectangle relative to the capture layer, in CSS pixels. */
const captureRect = ref<{ left: number; top: number; width: number; height: number } | null>(null);

const failureMessage = computed(() => (failure.value ? libraryReadFailureMessage(failure.value) : ""));
const failureIcon = computed(() =>
  failure.value === "no-library-root" ? "mdi-folder-key-outline" : "mdi-alert-circle-outline",
);

/** Matches the kernel's resizeImage cap so captures never bloat the request. */
const CAPTURE_MAX_EDGE = 2000;
/** A drag smaller than this on either side is a click, not a selection. */
const MIN_CAPTURE_PX = 6;

let pdfDoc: PDFDocumentProxy | null = null;
/** Reactive mirror of pdfDoc; PdfSearchPanel only needs document-level APIs. */
const pdfDocRef = shallowRef<PDFDocumentProxy | null>(null);
let loadingTask: PDFDocumentLoadingTask | null = null;
let loadGeneration = 0;
let observer: IntersectionObserver | null = null;
const renderTasks = new Map<number, RenderTask>();
const textLayers = new Map<number, TextLayer>();
const renderedPages = new Set<number>();
let captureDragging = false;
let capturePointerId: number | null = null;
let captureStart: { x: number; y: number } | null = null;
// Page wrappers in DOM order, kept between scroll events so page tracking can
// binary-search instead of walking every page on each frame.
let pageNodes: HTMLElement[] = [];
let scrollFrame: number | null = null;

function cssSize(base: number): number {
  return Math.max(1, Math.round(base * readerStore.scale));
}

function pageElement(pageNumber: number): HTMLElement | null {
  return scrollEl.value?.querySelector(`[data-page="${pageNumber}"]`) ?? null;
}

async function discardLoadingTask(task: PDFDocumentLoadingTask): Promise<void> {
  if (loadingTask === task) loadingTask = null;
  try {
    await task.destroy();
  } catch {
    // already destroyed
  }
}

async function destroyDocument(): Promise<void> {
  observer?.disconnect();
  observer = null;
  pageNodes = [];
  for (const task of renderTasks.values()) {
    task.cancel();
  }
  renderTasks.clear();
  for (const layer of textLayers.values()) {
    layer.cancel();
  }
  textLayers.clear();
  renderedPages.clear();
  if (loadingTask) {
    await discardLoadingTask(loadingTask);
  }
  pdfDoc = null;
  pdfDocRef.value = null;
}

function isRefProxy(value: unknown): value is { num: number; gen: number } {
  return !!value && typeof value === "object" && typeof (value as { num?: unknown }).num === "number";
}

async function convertOutline(doc: PDFDocumentProxy, nodes: unknown[]): Promise<ReaderOutlineNode[]> {
  const result: ReaderOutlineNode[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const raw = node as { title?: unknown; dest?: unknown; items?: unknown };
    const title = typeof raw.title === "string" ? raw.title : "";
    let page: number | null = null;
    try {
      const destArray =
        typeof raw.dest === "string" ? await doc.getDestination(raw.dest) : Array.isArray(raw.dest) ? raw.dest : null;
      const ref = destArray?.[0];
      if (isRefProxy(ref)) {
        page = (await doc.getPageIndex(ref)) + 1;
      }
    } catch {
      page = null;
    }
    const childItems = Array.isArray(raw.items) ? await convertOutline(doc, raw.items) : [];
    result.push({ title, page, items: childItems });
  }
  return result;
}

async function measurePages(
  doc: PDFDocumentProxy,
  generation: number,
): Promise<Array<{ width: number; height: number }>> {
  const sizes: Array<{ width: number; height: number }> = [];
  for (let i = 1; i <= doc.numPages; i++) {
    if (generation !== loadGeneration) return sizes;
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    sizes.push({ width: viewport.width, height: viewport.height });
  }
  return sizes;
}

function clearPageLayers(pageEl: HTMLElement): void {
  const canvas = pageEl.querySelector("canvas");
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
  const textLayerDiv = pageEl.querySelector<HTMLElement>(".textLayer");
  if (textLayerDiv) textLayerDiv.replaceChildren();
}

async function renderPage(pageNumber: number, generation: number): Promise<void> {
  if (!pdfDoc || generation !== loadGeneration || renderedPages.has(pageNumber)) return;
  const pageEl = pageElement(pageNumber);
  const canvas = pageEl?.querySelector("canvas");
  const textLayerDiv = pageEl?.querySelector<HTMLElement>(".textLayer");
  if (!pageEl || !canvas || !textLayerDiv) return;

  renderedPages.add(pageNumber);
  const page = await pdfDoc.getPage(pageNumber);
  if (generation !== loadGeneration) return;

  const viewport = page.getViewport({ scale: readerStore.scale });
  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const context = canvas.getContext("2d");
  if (!context) return;

  const renderTask = page.render({
    canvasContext: context,
    viewport,
    transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
  });
  renderTasks.set(pageNumber, renderTask);
  try {
    await renderTask.promise;
  } catch (err) {
    renderedPages.delete(pageNumber);
    if ((err as { name?: string } | null)?.name === "RenderingCancelledException") return;
    throw err;
  } finally {
    renderTasks.delete(pageNumber);
  }
  if (generation !== loadGeneration) return;

  textLayerDiv.replaceChildren();
  textLayerDiv.style.width = `${viewport.width}px`;
  textLayerDiv.style.height = `${viewport.height}px`;
  const textContent = await page.getTextContent();
  const textLayer = new TextLayer({
    textContentSource: textContent,
    container: textLayerDiv,
    viewport,
  });
  textLayers.set(pageNumber, textLayer);
  try {
    await textLayer.render();
  } catch {
    // cancelled during reload
  } finally {
    textLayers.delete(pageNumber);
  }
}

function releasePage(pageNumber: number): void {
  const task = renderTasks.get(pageNumber);
  if (task) {
    task.cancel();
    renderTasks.delete(pageNumber);
  }
  const layer = textLayers.get(pageNumber);
  if (layer) {
    layer.cancel();
    textLayers.delete(pageNumber);
  }
  renderedPages.delete(pageNumber);
  const pageEl = pageElement(pageNumber);
  if (pageEl) clearPageLayers(pageEl);
}

function observePages(): void {
  observer?.disconnect();
  const root = scrollEl.value;
  if (!root) return;
  pageNodes = Array.from(root.querySelectorAll<HTMLElement>("[data-page]"));
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const pageNumber = Number((entry.target as HTMLElement).dataset.page);
        if (!pageNumber) continue;
        if (entry.isIntersecting) {
          void renderPage(pageNumber, loadGeneration).catch((err) => {
            console.error("[pdf-viewer] Failed to render page", pageNumber, err);
          });
        } else if (Math.abs(pageNumber - readerStore.page) > 4) {
          releasePage(pageNumber);
        }
      }
    },
    { root, rootMargin: "1200px 0px", threshold: 0.01 },
  );
  for (const node of root.querySelectorAll("[data-page]")) {
    observer.observe(node);
  }
}

function updateCurrentPage(): void {
  const root = scrollEl.value;
  if (!root) return;
  const rootRect = root.getBoundingClientRect();
  const marker = rootRect.top + Math.min(120, root.clientHeight * 0.2);
  if (pageNodes.length !== pageSizes.value.length) {
    pageNodes = Array.from(root.querySelectorAll<HTMLElement>("[data-page]"));
  }
  if (pageNodes.length === 0) return;

  // Page tops grow monotonically, so the page under the marker is the last
  // one whose top edge sits above it — O(log n) rect reads per frame.
  let lo = 0;
  let hi = pageNodes.length - 1;
  let current = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pageNodes[mid].getBoundingClientRect().top <= marker) {
      current = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  readerStore.setPage(current + 1);
}

function scrollToPage(pageNumber: number): void {
  const root = scrollEl.value;
  const el = pageElement(pageNumber);
  if (!el || !root) return;
  const delta = el.getBoundingClientRect().top - root.getBoundingClientRect().top;
  root.scrollTop += delta;
  readerStore.setPage(pageNumber);
}

function gotoPage(pageNumber: number): void {
  readerStore.setPage(pageNumber);
  scrollToPage(readerStore.page);
}

async function beginPageEdit(): Promise<void> {
  pageDraft.value = String(readerStore.page);
  pageEditing.value = true;
  await nextTick();
  pageInputEl.value?.focus();
  pageInputEl.value?.select();
}

function commitPageDraft(): void {
  if (!pageEditing.value) return;
  const parsed = Number(pageDraft.value);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= readerStore.pageCount;
  pageEditing.value = false;
  if (!valid || parsed === readerStore.page) return;
  gotoPage(parsed);
}

function cancelPageEdit(): void {
  pageEditing.value = false;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function openSearch(): void {
  searchOpen.value = true;
  void nextTick(() => searchPanel.value?.focusInput());
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    // Intercept Ctrl+F before Chromium's own find bar; allowed even while
    // typing elsewhere because the panel steals focus from any field.
    if (
      event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      readerStore.pageCount > 0 &&
      event.key.toLowerCase() === "f"
    ) {
      event.preventDefault();
      openSearch();
    }
    return;
  }
  // Capture mode owns Esc first: it must cancel a drag / exit the mode even
  // when the search panel is open or an input has focus.
  if (event.key === "Escape" && readerStore.captureMode) {
    event.preventDefault();
    exitCaptureMode();
    return;
  }
  if (event.key === "Escape" && searchOpen.value) {
    event.preventDefault();
    searchOpen.value = false;
    return;
  }
  if (readerStore.pageCount <= 0 || isEditableTarget(event.target)) return;
  if (event.key === "/") {
    event.preventDefault();
    openSearch();
    return;
  }
  // PageUp/ArrowLeft on page 1 and PageDown/ArrowRight on the last page are
  // ignored without preventDefault, so the keypress must not scroll either.
  switch (event.key) {
    case "PageUp":
    case "ArrowLeft":
      if (readerStore.page <= 1) return;
      event.preventDefault();
      gotoPage(readerStore.page - 1);
      break;
    case "PageDown":
    case "ArrowRight":
      if (readerStore.page >= readerStore.pageCount) return;
      event.preventDefault();
      gotoPage(readerStore.page + 1);
      break;
    case "Home":
      event.preventDefault();
      gotoPage(1);
      break;
    case "End":
      event.preventDefault();
      gotoPage(readerStore.pageCount);
      break;
  }
}

// Spec: register on window only while the viewer is mounted with a document.
let keydownRegistered = false;

function setKeydownListener(active: boolean): void {
  if (active === keydownRegistered) return;
  keydownRegistered = active;
  if (active) {
    window.addEventListener("keydown", onWindowKeydown);
  } else {
    window.removeEventListener("keydown", onWindowKeydown);
  }
}

watch(
  () => readerStore.pageCount > 0,
  (active) => setKeydownListener(active),
  { immediate: true },
);

// --- Region capture: drag a rectangle, clip to one page, push to ChatPanel ---

interface CaptureRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const captureRectStyle = computed(() => {
  const rect = captureRect.value;
  if (!rect) return undefined;
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
});

function toggleCaptureMode(): void {
  readerStore.setCaptureMode(!readerStore.captureMode);
}

function resetCaptureDrag(): void {
  captureDragging = false;
  capturePointerId = null;
  captureStart = null;
  captureRect.value = null;
}

function exitCaptureMode(): void {
  resetCaptureDrag();
  readerStore.setCaptureMode(false);
}

function toLayerPoint(event: PointerEvent): { x: number; y: number } | null {
  const layer = captureLayerEl.value;
  if (!layer) return null;
  const rect = layer.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function onCapturePointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const start = toLayerPoint(event);
  const layer = captureLayerEl.value;
  if (!start || !layer) return;
  event.preventDefault();
  captureDragging = true;
  capturePointerId = event.pointerId;
  captureStart = start;
  captureRect.value = { left: start.x, top: start.y, width: 0, height: 0 };
  layer.setPointerCapture(event.pointerId);
}

function onCapturePointerMove(event: PointerEvent): void {
  if (!captureDragging || event.pointerId !== capturePointerId || !captureStart) return;
  const point = toLayerPoint(event);
  if (!point) return;
  captureRect.value = {
    left: Math.min(captureStart.x, point.x),
    top: Math.min(captureStart.y, point.y),
    width: Math.abs(point.x - captureStart.x),
    height: Math.abs(point.y - captureStart.y),
  };
}

function onCapturePointerUp(event: PointerEvent): void {
  if (!captureDragging || event.pointerId !== capturePointerId) return;
  try {
    captureLayerEl.value?.releasePointerCapture(event.pointerId);
  } catch {
    // capture already released
  }
  const rect = captureRect.value;
  resetCaptureDrag();
  if (rect && rect.width >= MIN_CAPTURE_PX && rect.height >= MIN_CAPTURE_PX) {
    captureRegion(rect);
  }
  exitCaptureMode();
}

function onCapturePointerCancel(event: PointerEvent): void {
  if (event.pointerId !== capturePointerId) return;
  resetCaptureDrag();
}

/**
 * Cut the drag rect out of the target page canvas. The rect arrives in
 * capture-layer coordinates; page lookup and clipping run in viewport
 * coordinates so scroll offset needs no special handling.
 */
function captureRegion(rect: CaptureRect): void {
  const root = scrollEl.value;
  const layer = captureLayerEl.value;
  if (!root || !layer) return;
  const layerRect = layer.getBoundingClientRect();
  const dragLeft = layerRect.left + rect.left;
  const dragTop = layerRect.top + rect.top;
  const dragRight = dragLeft + rect.width;
  const dragBottom = dragTop + rect.height;
  const centerX = (dragLeft + dragRight) / 2;
  const centerY = (dragTop + dragBottom) / 2;

  // Target page: the one containing the rect center; when the center falls in
  // the gap between pages, the page with the largest overlap wins. This also
  // clips cross-page drags to a single page.
  const pageEls = Array.from(root.querySelectorAll<HTMLElement>("[data-page]"));
  let target: HTMLElement | null = null;
  let bestArea = 0;
  for (const el of pageEls) {
    const pageRect = el.getBoundingClientRect();
    if (centerX >= pageRect.left && centerX <= pageRect.right && centerY >= pageRect.top && centerY <= pageRect.bottom) {
      target = el;
      break;
    }
    const overlapX = Math.min(dragRight, pageRect.right) - Math.max(dragLeft, pageRect.left);
    const overlapY = Math.min(dragBottom, pageRect.bottom) - Math.max(dragTop, pageRect.top);
    const area = overlapX * overlapY;
    if (overlapX > 0 && overlapY > 0 && area > bestArea) {
      bestArea = area;
      target = el;
    }
  }
  if (!target) return;
  const source = target.querySelector("canvas");
  if (!source || source.width <= 0 || source.height <= 0) return;
  const canvasRect = source.getBoundingClientRect();
  if (canvasRect.width <= 0 || canvasRect.height <= 0) return;

  // Intersect the drag rect with the canvas, then map CSS px -> device px
  // (the canvas backing store is scaled by window.devicePixelRatio).
  const ix0 = Math.max(dragLeft, canvasRect.left);
  const iy0 = Math.max(dragTop, canvasRect.top);
  const ix1 = Math.min(dragRight, canvasRect.right);
  const iy1 = Math.min(dragBottom, canvasRect.bottom);
  const cssWidth = ix1 - ix0;
  const cssHeight = iy1 - iy0;
  if (cssWidth <= 0 || cssHeight <= 0) return;
  const scaleX = source.width / canvasRect.width;
  const scaleY = source.height / canvasRect.height;
  const sx = Math.max(0, Math.min(source.width - 1, Math.round((ix0 - canvasRect.left) * scaleX)));
  const sy = Math.max(0, Math.min(source.height - 1, Math.round((iy0 - canvasRect.top) * scaleY)));
  const sw = Math.max(1, Math.min(source.width - sx, Math.round(cssWidth * scaleX)));
  const sh = Math.max(1, Math.min(source.height - sy, Math.round(cssHeight * scaleY)));

  // A HiDPI region can still reach several MB of PNG; downscale to the
  // kernel's image cap before it hits the wire.
  const captureScale = Math.min(1, CAPTURE_MAX_EDGE / Math.max(sw, sh));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * captureScale));
  out.height = Math.max(1, Math.round(sh * captureScale));
  const ctx = out.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
  const base64 = canvasToPngBase64(out);
  if (!base64) return;
  const capture: PageCapture = { mimeType: "image/png", base64 };
  emitRegionCapture(capture);
}

async function loadPdf(filePath: string): Promise<void> {
  const generation = ++loadGeneration;
  let rendered = false;
  let task: PDFDocumentLoadingTask | null = null;
  /** True once a newer load owns the viewer; releases whatever we opened. */
  const stale = async (): Promise<boolean> => {
    if (generation === loadGeneration) return false;
    if (task) await discardLoadingTask(task);
    return true;
  };

  isLoading.value = true;
  failure.value = null;
  failureDetail.value = "";
  pageSizes.value = [];
  readerStore.setPageCount(0);
  readerStore.setOutline([]);
  readerStore.setSelectedText("");
  await destroyDocument();
  if (generation !== loadGeneration) return;

  try {
    if (!hasLibraryReadApi()) {
      throw new LibraryReadError("renderer-unavailable", "preload 未提供 libraryReadFile，无法从主进程读取文件字节");
    }
    const libraryRoot = projectStore.currentProject?.path ?? "";
    const preflightFailure = preflightLibraryPath(filePath, libraryRoot);
    if (preflightFailure) {
      throw new LibraryReadError(preflightFailure, `资料库根目录：${libraryRoot || "未选择"}`);
    }

    const result = await window.pixApi.libraryReadFile(filePath);
    if (await stale()) return;
    if (!result.success || !result.data) {
      throw new LibraryReadError(failureFromLibraryResult(result), result.error || "主进程未返回文件内容");
    }

    task = getDocument({ data: result.data });
    loadingTask = task;
    const doc = await task.promise;
    if (await stale()) return;
    pdfDoc = doc;
    pdfDocRef.value = doc;

    readerStore.setPageCount(doc.numPages);
    pageSizes.value = await measurePages(doc, generation);
    if (await stale()) return;

    // The page nodes exist only after the loading pane is gone; observing the
    // scroll root before this silently renders zero pages.
    isLoading.value = false;
    await nextTick();
    if (await stale()) return;
    observePages();
    scrollToPage(1);
    rendered = true;

    const outline = await doc.getOutline();
    if (await stale()) return;
    const nodes = outline?.length ? await convertOutline(doc, outline) : [];
    if (await stale()) return;
    readerStore.setOutline(nodes);
  } catch (err) {
    if (generation !== loadGeneration) return;
    console.error("[pdf-viewer] Failed to load PDF", filePath, err);
    // Never trade a document that is already on screen for an error pane.
    if (rendered) return;
    if (err instanceof LibraryReadError) {
      failure.value = err.failure;
      failureDetail.value = err.detail;
    } else {
      failure.value = failureFromParseError(err);
      failureDetail.value = technicalDetail(err);
    }
    await destroyDocument();
  } finally {
    if (generation === loadGeneration) isLoading.value = false;
  }
}

function retryLoad(): void {
  void loadPdf(props.filePath);
}

/** Escape hatch for failures a retry can never fix (file over the read cap). */
async function openWithSystemApp(): Promise<void> {
  try {
    const result = await window.pixApi.libraryOpenPath(props.filePath);
    if (!result.success) console.error("[pdf-viewer] Failed to open PDF externally", result.error);
  } catch (err) {
    console.error("[pdf-viewer] Failed to open PDF externally", err);
  }
}

function onScroll(): void {
  if (scrollFrame !== null) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = null;
    updateCurrentPage();
  });
}

function onSelectionChange(): void {
  const root = scrollEl.value;
  const selection = document.getSelection();
  if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
    readerStore.setSelectedText("");
    return;
  }
  const anchor = selection.anchorNode;
  if (!anchor || !root.contains(anchor)) {
    readerStore.setSelectedText("");
    return;
  }
  readerStore.setSelectedText(selection.toString());
}

function zoomBy(delta: number): void {
  readerStore.setScale(readerStore.scale + delta);
}

// Wheel ticks arrive every ~30ms; each scale change re-renders the visible
// pages, so apply the leading step and coalesce the burst into one trailing
// step instead of re-rendering per tick.
const ZOOM_COALESCE_MS = 150;
let pendingZoomDelta = 0;
let zoomLastApplied = 0;
let zoomFlushTimer: ReturnType<typeof setTimeout> | null = null;

function applyZoom(delta: number): void {
  zoomLastApplied = performance.now();
  zoomBy(delta);
}

function onWheelZoom(event: WheelEvent): void {
  // Ctrl+wheel is the reader-standard zoom gesture; without preventDefault it
  // also triggers Chromium page zoom.
  if (!event.ctrlKey) return;
  event.preventDefault();
  pendingZoomDelta += event.deltaY < 0 ? 0.1 : -0.1;
  if (performance.now() - zoomLastApplied >= ZOOM_COALESCE_MS) {
    const delta = pendingZoomDelta;
    pendingZoomDelta = 0;
    applyZoom(delta);
    return;
  }
  if (!zoomFlushTimer) {
    zoomFlushTimer = setTimeout(() => {
      zoomFlushTimer = null;
      if (pendingZoomDelta === 0) return;
      const delta = pendingZoomDelta;
      pendingZoomDelta = 0;
      applyZoom(delta);
    }, ZOOM_COALESCE_MS);
  }
}

watch(
  () => props.filePath,
  (path) => {
    void loadPdf(path);
  },
  { immediate: true },
);

watch(
  () => readerStore.scale,
  async () => {
    if (!pdfDoc) return;
    for (const pageNumber of [...renderedPages]) {
      releasePage(pageNumber);
    }
    await nextTick();
    observePages();
    scrollToPage(readerStore.page);
  },
);

watch(
  () => readerStore.gotoPage,
  (target) => {
    if (target == null) return;
    readerStore.gotoPage = null;
    void nextTick(() => scrollToPage(target));
  },
);

// A stale text selection would survive into capture mode; clear it on entry.
watch(
  () => readerStore.captureMode,
  (active) => {
    if (!active) return;
    document.getSelection()?.removeAllRanges();
    readerStore.setSelectedText("");
  },
);

onMounted(() => {
  document.addEventListener("selectionchange", onSelectionChange);
});

onBeforeUnmount(() => {
  document.removeEventListener("selectionchange", onSelectionChange);
  setKeydownListener(false);
  if (scrollFrame !== null) {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
  }
  if (zoomFlushTimer) {
    clearTimeout(zoomFlushTimer);
    zoomFlushTimer = null;
  }
  loadGeneration += 1;
  void destroyDocument();
});

defineExpose({ gotoPage });
</script>

<template>
  <div class="pdf-viewer" :class="{ 'capture-mode': readerStore.captureMode }">
    <div v-if="readerStore.pageCount > 0" class="pdf-toolbar">
      <v-btn icon="mdi-minus" size="x-small" variant="text" title="缩小" @click="zoomBy(-0.1)" />
      <span class="zoom-label">{{ Math.round(readerStore.scale * 100) }}%</span>
      <v-btn icon="mdi-plus" size="x-small" variant="text" title="放大" @click="zoomBy(0.1)" />
      <v-btn icon="mdi-magnify" size="x-small" variant="text" title="在文档中搜索" @click="openSearch" />
    </div>

    <PdfSearchPanel
      v-if="searchOpen && readerStore.pageCount > 0"
      ref="searchPanel"
      :file-path="filePath"
      :pdf-document="pdfDocRef"
      @close="searchOpen = false"
    />

    <div v-if="isLoading" class="pdf-status-center">
      <v-progress-circular indeterminate size="28" />
    </div>
    <div v-else-if="failure" class="pdf-status-center pdf-error">
      <v-icon :size="40" class="status-icon">{{ failureIcon }}</v-icon>
      <p class="error-title">{{ failureMessage }}</p>
      <p v-if="failureDetail" class="error-detail">{{ failureDetail }}</p>
      <div class="error-actions">
        <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="retryLoad">
          重试
        </v-btn>
        <v-btn
          v-if="failure === 'file-too-large'"
          size="small"
          variant="text"
          prepend-icon="mdi-open-in-new"
          @click="openWithSystemApp"
        >
          用系统应用打开
        </v-btn>
      </div>
    </div>
    <div v-else ref="scrollEl" class="pdf-scroll" @scroll.passive="onScroll" @wheel="onWheelZoom">
      <div
        v-for="(size, index) in pageSizes"
        :key="index + 1"
        class="pdf-page"
        :data-page="index + 1"
        :style="{ width: `${cssSize(size.width)}px`, height: `${cssSize(size.height)}px` }"
      >
        <canvas />
        <div class="textLayer" />
        <div class="pdf-overlay">
          <slot name="overlay" :page="index + 1" />
        </div>
      </div>
    </div>

    <div
      v-if="readerStore.captureMode && readerStore.pageCount > 0"
      ref="captureLayerEl"
      class="capture-layer"
      @pointerdown="onCapturePointerDown"
      @pointermove="onCapturePointerMove"
      @pointerup="onCapturePointerUp"
      @pointercancel="onCapturePointerCancel"
      @wheel.prevent
    >
      <div v-if="captureRect" class="capture-rect" :style="captureRectStyle" />
      <div class="capture-hint">拖拽框选要提问的区域，Esc 取消</div>
    </div>

    <div v-if="readerStore.pageCount > 0" class="pdf-capture-fab">
      <v-btn
        icon="mdi-crop"
        size="small"
        :variant="readerStore.captureMode ? 'flat' : 'tonal'"
        color="primary"
        title="框选截图（随提问发送）"
        :aria-pressed="readerStore.captureMode"
        @click="toggleCaptureMode"
      />
    </div>

    <div v-if="readerStore.pageCount > 0" class="pdf-page-indicator">
      <v-btn
        icon="mdi-chevron-up"
        size="x-small"
        variant="text"
        title="上一页"
        :disabled="readerStore.page <= 1"
        @click="gotoPage(readerStore.page - 1)"
      />
      <input
        v-if="pageEditing"
        ref="pageInputEl"
        v-model="pageDraft"
        class="page-input"
        type="number"
        min="1"
        :max="readerStore.pageCount"
        @keydown.enter.prevent="commitPageDraft"
        @keydown.esc.prevent="cancelPageEdit"
        @blur="commitPageDraft"
      />
      <button v-else type="button" class="page-label" title="点击输入页码" @click="beginPageEdit">
        第 {{ readerStore.page }} / {{ readerStore.pageCount }} 页
      </button>
      <v-btn
        icon="mdi-chevron-down"
        size="x-small"
        variant="text"
        title="下一页"
        :disabled="readerStore.page >= readerStore.pageCount"
        @click="gotoPage(readerStore.page + 1)"
      />
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--pix-bg-subtle, #f7f9fb);
}

.pdf-toolbar {
  position: absolute;
  top: 40px;
  right: 12px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 8px;
  background: var(--pix-bg-elevated, #ffffff);
  box-shadow: var(--pix-shadow-xs);
}

.zoom-label {
  min-width: 44px;
  text-align: center;
  font-size: 12px;
  color: var(--pix-text-secondary);
}

.pdf-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 48px 16px 48px;
}

.pdf-page {
  position: relative;
  margin: 0 auto 16px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(31, 41, 51, 0.12);
}

.pdf-page canvas {
  display: block;
  position: absolute;
  inset: 0;
}

.pdf-page :deep(.textLayer) {
  position: absolute;
  inset: 0;
  overflow: hidden;
  line-height: 1;
  opacity: 1;
  z-index: 1;
  transform-origin: 0 0;
}

.pdf-page :deep(.textLayer span),
.pdf-page :deep(.textLayer br) {
  position: absolute;
  color: transparent;
  white-space: pre;
  cursor: text;
  transform-origin: 0 0;
}

.pdf-page :deep(.textLayer ::selection) {
  background: rgba(49, 66, 79, 0.28);
}

.pdf-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.capture-mode :deep(.textLayer),
.capture-mode .pdf-overlay {
  pointer-events: none;
  user-select: none;
}

.capture-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}

.capture-rect {
  position: absolute;
  border: 1.5px solid var(--pix-accent, #31424f);
  background: rgba(49, 66, 79, 0.08);
  pointer-events: none;
}

.capture-hint {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(31, 41, 51, 0.78);
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}

.pdf-capture-fab {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 6;
}

.pdf-status-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--pix-text-secondary);
  font-size: 13px;
}

.pdf-error {
  padding: 24px;
  text-align: center;
}

.error-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--pix-text-primary);
}

.error-detail {
  max-width: 360px;
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--pix-text-muted);
  word-break: break-word;
}

.error-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.status-icon {
  color: var(--pix-text-muted);
}

.pdf-page-indicator {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(31, 41, 51, 0.78);
  color: #fff;
  font-size: 12px;
}

.pdf-page-indicator :deep(.v-btn--disabled) {
  opacity: 0.45;
}

.page-label {
  min-width: 88px;
  padding: 2px 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #fff;
  font-size: 12px;
  text-align: center;
}

.page-label:hover {
  background: rgba(255, 255, 255, 0.14);
}

.page-input {
  width: 64px;
  height: 22px;
  padding: 0 6px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 12px;
  text-align: center;
  outline: none;
}

.page-input::-webkit-outer-spin-button,
.page-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>

<style>
/* Swatches for PdfSearchPanel's CSS Custom Highlight API. Global because
   ::highlight() cannot be scoped; literal --pix-accent (#31424f) values since
   custom properties are unreliable inside ::highlight rules. */
::highlight(pix-search) {
  background-color: rgba(49, 66, 79, 0.12);
}

::highlight(pix-search-current) {
  background-color: #31424f;
  color: #ffffff;
}
</style>
