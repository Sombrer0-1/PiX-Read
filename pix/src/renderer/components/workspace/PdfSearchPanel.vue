<script setup lang="ts">
/**
 * PdfSearchPanel — full-document text search overlay for PdfViewer.
 *
 * Scans page text through pdf.js getTextContent (item str joined without
 * separators, case insensitive), yields between pages via requestIdleCallback
 * so large documents never freeze the UI, and caches per-page text until the
 * document changes. Match navigation jumps through readerStore.gotoPage, waits
 * for the target page's textLayer to reach the DOM, then re-matches on the
 * concatenated DOM text (the geometry source of truth) and paints highlights
 * with the CSS Custom Highlight API: light for every match on that page, solid
 * for the current one.
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useReaderStore } from "../../stores/reader-store";

/** TS 5.8 dom lib only types forEach; Chromium 130 ships the write API. */
type HighlightRegistryWriter = HighlightRegistry & {
  set(name: string, highlight: Highlight): HighlightRegistry;
  delete(name: string): boolean;
};

interface PageHit {
  page: number;
  count: number;
}

interface CurrentMatch {
  page: number;
  indexInPage: number;
}

interface TextSegment {
  node: Text;
  start: number;
}

const HIGHLIGHT_ALL = "pix-search";
const HIGHLIGHT_CURRENT = "pix-search-current";
const DEBOUNCE_MS = 300;
/** Upper bound for waiting on a page textLayer (slow render or image-only page). */
const LAYER_WAIT_TIMEOUT_MS = 5000;

const props = defineProps<{
  filePath: string;
  pdfDocument: PDFDocumentProxy | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const readerStore = useReaderStore();

const panelEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);
const query = ref("");
const scanning = ref(false);
const scanDone = ref(0);
const scanTotal = ref(0);
const pageHits = ref<PageHit[]>([]);
const currentIndex = ref(-1);

const totalHits = computed(() => pageHits.value.reduce((sum, hit) => sum + hit.count, 0));
const currentMatch = computed<CurrentMatch | null>(() => {
  let remaining = currentIndex.value;
  for (const hit of pageHits.value) {
    if (remaining < hit.count) return { page: hit.page, indexInPage: remaining };
    remaining -= hit.count;
  }
  return null;
});
const statusText = computed(() => {
  const term = query.value.trim();
  if (!term) return "";
  if (scanning.value) return `已扫 ${scanDone.value} / ${scanTotal.value} 页`;
  if (totalHits.value === 0) return `未找到 “${term}”`;
  const match = currentMatch.value;
  if (!match) return "";
  return `第 ${currentIndex.value + 1} / ${totalHits.value} 处 · 第 ${match.page} 页`;
});

/** Page text is stable per document; scale changes never alter it. */
const textCache = new Map<number, string>();
let scanToken = 0;
let revealToken = 0;
let revealRaf: number | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function highlightRegistry(): HighlightRegistryWriter {
  return CSS.highlights as HighlightRegistryWriter;
}

function clearHighlights(): void {
  highlightRegistry().delete(HIGHLIGHT_ALL);
  highlightRegistry().delete(HIGHLIGHT_CURRENT);
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at >= 0) {
    count += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}

async function getPageText(pageNumber: number): Promise<string> {
  const cached = textCache.get(pageNumber);
  if (cached !== undefined) return cached;
  const doc = props.pdfDocument;
  if (!doc) return "";
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  let text = "";
  for (const item of content.items) {
    if ("str" in item) text += item.str;
  }
  // A stale document switch can land mid-await; never cache across documents.
  if (props.pdfDocument === doc) textCache.set(pageNumber, text);
  return text;
}

function idleYield(): Promise<void> {
  return new Promise((resolve) => {
    window.requestIdleCallback(() => resolve(), { timeout: 32 });
  });
}

async function runSearch(): Promise<void> {
  const token = ++scanToken;
  revealToken += 1;
  clearHighlights();
  const term = query.value.trim();
  pageHits.value = [];
  currentIndex.value = -1;
  scanDone.value = 0;
  const doc = props.pdfDocument;
  if (!term || !doc) {
    scanning.value = false;
    scanTotal.value = doc?.numPages ?? 0;
    return;
  }
  scanning.value = true;
  scanTotal.value = doc.numPages;
  const needle = term.toLowerCase();
  const hits: PageHit[] = [];
  for (let pageNumber = 1; pageNumber <= scanTotal.value; pageNumber += 1) {
    if (token !== scanToken) return;
    let pageText = "";
    try {
      pageText = (await getPageText(pageNumber)).toLowerCase();
    } catch {
      // Document destroyed mid-scan; skip the page, the token check exits soon.
      if (token !== scanToken) return;
      continue;
    }
    if (token !== scanToken) return;
    const count = countOccurrences(pageText, needle);
    if (count > 0) hits.push({ page: pageNumber, count });
    scanDone.value = pageNumber;
    await idleYield();
  }
  if (token !== scanToken) return;
  scanning.value = false;
  pageHits.value = hits;
  if (hits.length > 0) {
    currentIndex.value = 0;
    revealCurrentMatch();
  }
}

function viewerRoot(): HTMLElement | null {
  return panelEl.value?.closest(".pdf-viewer") ?? null;
}

function revealCurrentMatch(): void {
  const match = currentMatch.value;
  if (!match) return;
  const token = ++revealToken;
  clearHighlights();
  if (readerStore.page !== match.page) {
    readerStore.gotoPage = match.page;
  }
  void waitForTextLayer(match.page, token).then((layer) => {
    if (!layer || token !== revealToken) return;
    paintHighlights(layer, match);
  });
}

function waitForTextLayer(pageNumber: number, token: number): Promise<HTMLElement | null> {
  const deadline = performance.now() + LAYER_WAIT_TIMEOUT_MS;
  return new Promise((resolve) => {
    const poll = () => {
      if (token !== revealToken) {
        resolve(null);
        return;
      }
      const pageEl = viewerRoot()?.querySelector<HTMLElement>(`.pdf-page[data-page="${pageNumber}"]`) ?? null;
      const layer = pageEl?.querySelector<HTMLElement>(".textLayer") ?? null;
      // pdf.js appends the whole layer DOM in one synchronous pass per chunk,
      // so the first span means this page's layer text is complete.
      if (layer?.querySelector("span")) {
        resolve(layer);
        return;
      }
      if (performance.now() >= deadline) {
        resolve(null);
        return;
      }
      revealRaf = requestAnimationFrame(poll);
    };
    poll();
  });
}

function paintHighlights(layer: HTMLElement, match: CurrentMatch, scrollIntoView = true): void {
  const term = query.value.trim();
  if (!term) return;
  const segments: TextSegment[] = [];
  let text = "";
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) {
      const value = node.nodeValue ?? "";
      if (value) {
        segments.push({ node, start: text.length });
        text += value;
      }
    }
    node = walker.nextNode();
  }
  if (segments.length === 0) return;
  const needle = term.toLowerCase();
  const haystack = text.toLowerCase();
  const ranges: Range[] = [];
  let from = haystack.indexOf(needle);
  while (from >= 0) {
    const range = rangeForSpan(segments, from, from + needle.length);
    if (range) ranges.push(range);
    from = haystack.indexOf(needle, from + needle.length);
  }
  if (ranges.length === 0) return;
  const registry = highlightRegistry();
  registry.set(HIGHLIGHT_ALL, new Highlight(...ranges));
  // DOM text can differ slightly from getTextContent; clamp to the last match.
  const localIndex = Math.min(match.indexInPage, ranges.length - 1);
  const current = ranges[Math.max(0, localIndex)];
  registry.set(HIGHLIGHT_CURRENT, new Highlight(current));
  if (scrollIntoView) scrollToRange(current);
}

function rangeForSpan(segments: TextSegment[], start: number, end: number): Range | null {
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  for (const segment of segments) {
    const nodeLength = segment.node.nodeValue?.length ?? 0;
    const segmentEnd = segment.start + nodeLength;
    if (!startNode && start < segmentEnd) {
      startNode = segment.node;
      startOffset = start - segment.start;
    }
    if (startNode && end > segment.start && end <= segmentEnd) {
      endNode = segment.node;
      endOffset = end - segment.start;
      break;
    }
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function scrollToRange(range: Range): void {
  const startNode = range.startContainer;
  const host = startNode instanceof Element ? startNode : startNode.parentElement;
  const pageEl = host?.closest(".pdf-page") ?? null;
  const scrollEl = pageEl?.closest<HTMLElement>(".pdf-scroll") ?? null;
  if (!pageEl || !scrollEl) return;
  const rects = range.getClientRects();
  const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const top = Math.max(0, scrollEl.scrollTop + rect.top - scrollEl.getBoundingClientRect().top - scrollEl.clientHeight / 3);
  scrollEl.scrollTo({ top, behavior: prefersReducedMotion ? "auto" : "smooth" });
}

function goToNext(): void {
  if (totalHits.value === 0) return;
  currentIndex.value = (currentIndex.value + 1) % totalHits.value;
  revealCurrentMatch();
}

function goToPrev(): void {
  if (totalHits.value === 0) return;
  currentIndex.value = (currentIndex.value - 1 + totalHits.value) % totalHits.value;
  revealCurrentMatch();
}

function onInputEnter(event: KeyboardEvent): void {
  if (event.isComposing) return;
  if (event.shiftKey) goToPrev();
  else goToNext();
}

function focusInput(): void {
  inputEl.value?.focus();
}

defineExpose({ focusInput });

function resetAll(): void {
  scanToken += 1;
  revealToken += 1;
  if (revealRaf !== null) {
    cancelAnimationFrame(revealRaf);
    revealRaf = null;
  }
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  textCache.clear();
  scanning.value = false;
  scanDone.value = 0;
  scanTotal.value = 0;
  pageHits.value = [];
  currentIndex.value = -1;
  query.value = "";
  clearHighlights();
}

watch(
  () => [props.filePath, props.pdfDocument],
  () => {
    resetAll();
  },
  { immediate: true },
);

watch(query, () => {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (!query.value.trim()) {
    void runSearch();
    return;
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runSearch();
  }, DEBOUNCE_MS);
});

watch(
  () => readerStore.page,
  (page) => {
    // Smooth scrolling sweeps through intermediate pages and each fires this
    // watcher. Clearing unconditionally would wipe a highlight painted right
    // before arrival; on the match's own page repaint (without rescrolling)
    // instead of clearing.
    const match = currentMatch.value;
    if (match && match.page === page) {
      const token = ++revealToken;
      void waitForTextLayer(match.page, token).then((layer) => {
        if (!layer || token !== revealToken) return;
        paintHighlights(layer, match, false);
      });
      return;
    }
    clearHighlights();
  },
);

onBeforeUnmount(() => {
  scanToken += 1;
  revealToken += 1;
  if (revealRaf !== null) {
    cancelAnimationFrame(revealRaf);
    revealRaf = null;
  }
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  clearHighlights();
});
</script>

<template>
  <div ref="panelEl" class="pdf-search-panel">
    <div class="search-row">
      <input
        ref="inputEl"
        v-model="query"
        class="search-input"
        type="text"
        placeholder="在文档中搜索"
        @keydown.enter="onInputEnter"
      />
      <v-btn
        icon="mdi-chevron-up"
        size="x-small"
        variant="text"
        title="上一处"
        :disabled="totalHits === 0"
        @click="goToPrev"
      />
      <v-btn
        icon="mdi-chevron-down"
        size="x-small"
        variant="text"
        title="下一处"
        :disabled="totalHits === 0"
        @click="goToNext"
      />
      <v-btn icon="mdi-close" size="x-small" variant="text" title="关闭搜索" @click="emit('close')" />
    </div>
    <p v-if="statusText" class="search-status" :class="{ active: scanning }">{{ statusText }}</p>
  </div>
</template>

<style scoped>
.pdf-search-panel {
  position: absolute;
  top: 78px;
  right: 12px;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 300px;
  padding: 8px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 8px;
  background: var(--pix-bg-elevated, #ffffff);
  box-shadow: var(--pix-shadow-xs, 0 1px 2px rgba(31, 41, 51, 0.06));
}

.search-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--pix-border, #d5dfe8);
  border-radius: 6px;
  background: var(--pix-bg-input, #ffffff);
  font-size: 12px;
  color: var(--pix-text-primary, #1f2933);
  outline: none;
}

.search-input:focus {
  border-color: var(--pix-border-focus, #31424f);
}

.search-status {
  margin: 0;
  padding: 0 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--pix-text-secondary, #52606d);
}

.search-status.active {
  color: var(--pix-text-muted, #82909d);
}
</style>
