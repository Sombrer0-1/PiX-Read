<script setup lang="ts">
/**
 * PdfSelectionQuickAsk — floating "问 AI" button over the reader stage.
 *
 * Shows near the end of a non-collapsed document selection (anchored inside
 * .reader-stage) and forwards the cached text through the useQuickAsk seam.
 * pointerdown is prevented so clicking never collapses the selection or
 * clears readerStore.selectedText.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { emitQuickAsk } from "../../composables/useQuickAsk";
import { useReaderStore } from "../../stores/reader-store";

/** Minimum trimmed selection length before the button shows. */
const MIN_SELECTION_CHARS = 2;
const BUTTON_GAP = 6;
const STAGE_PADDING = 4;

const readerStore = useReaderStore();
const visible = ref(false);
const btnEl = ref<HTMLButtonElement | null>(null);
const pos = ref({ left: 0, top: 0 });

/** Text captured when the button appeared; the click sends this, not a re-read. */
let cachedText = "";

function resolveStage(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".reader-stage");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

async function showFor(range: Range, text: string): Promise<void> {
  const stage = resolveStage();
  if (!stage) return;
  cachedText = text;
  visible.value = true;
  await nextTick();
  const el = btnEl.value;
  if (!el || !visible.value) return;
  // Absolute offsets are relative to the positioned panel, not the viewport.
  const panel = el.offsetParent;
  if (!(panel instanceof HTMLElement)) return;
  const stageRect = stage.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const rect = range.getBoundingClientRect();
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  // 选区末端右上：右缘贴齐选区末端、悬于其上方，整体钳制在 stage 视口内。
  const minX = stageRect.left + STAGE_PADDING;
  const minY = stageRect.top + STAGE_PADDING;
  pos.value = {
    left:
      clamp(rect.right - width, minX, Math.max(minX, stageRect.right - width - STAGE_PADDING)) -
      panelRect.left,
    top:
      clamp(rect.top - height - BUTTON_GAP, minY, Math.max(minY, stageRect.bottom - height - STAGE_PADDING)) -
      panelRect.top,
  };
}

function hide(): void {
  visible.value = false;
  cachedText = "";
}

function onSelectionChange(): void {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !readerStore.filePath) {
    hide();
    return;
  }
  const text = selection.toString();
  if (text.trim().length < MIN_SELECTION_CHARS) {
    hide();
    return;
  }
  const anchor = selection.anchorNode;
  const stage = resolveStage();
  if (!anchor || !stage || !stage.contains(anchor)) {
    hide();
    return;
  }
  void showFor(selection.getRangeAt(0), text.trim());
}

function onStageScroll(): void {
  if (visible.value) hide();
}

function onButtonClick(): void {
  const text = cachedText;
  hide();
  if (text) emitQuickAsk(text);
}

watch(
  () => readerStore.filePath,
  () => hide(),
);

onMounted(() => {
  document.addEventListener("selectionchange", onSelectionChange);
  // Capture phase: scroll events from .pdf-scroll / .reader-content do not bubble.
  document.addEventListener("scroll", onStageScroll, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("selectionchange", onSelectionChange);
  document.removeEventListener("scroll", onStageScroll, true);
});
</script>

<template>
  <button
    v-show="visible"
    ref="btnEl"
    type="button"
    class="quick-ask-btn"
    :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
    @pointerdown.prevent
    @click="onButtonClick"
  >
    <v-icon size="12">mdi-comment-question-outline</v-icon>
    问 AI
  </button>
</template>

<style scoped>
.quick-ask-btn {
  position: absolute;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 999px;
  background: var(--pix-bg-elevated, #ffffff);
  color: var(--pix-text-primary);
  font-size: 12px;
  line-height: 1;
  box-shadow: var(--pix-shadow-xs);
  cursor: pointer;
}

.quick-ask-btn:hover {
  background: var(--pix-bg-hover, #eef2f6);
}
</style>
