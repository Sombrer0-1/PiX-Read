<script setup lang="ts">
/**
 * PdfSelectionQuickAsk — floating「问 AI / 摘录」actions over the reader stage.
 *
 * Shows near the end of a non-collapsed document selection (anchored inside
 * .reader-stage). 「问 AI」forwards the cached text through the useQuickAsk
 * seam; 「摘录」saves it into notesStore with the page resolved from the
 * selection anchor (never from the current scroll page). pointerdown is
 * prevented so clicking never collapses the selection.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { emitQuickAsk } from "../../composables/useQuickAsk";
import type { TemplateAction } from "../../utils/quick-ask-templates";
import { useNotesStore } from "../../stores/notes-store";
import { useReaderStore } from "../../stores/reader-store";
import { resolveSelectionPage } from "../../utils/note-capture";

/** Minimum trimmed selection length before the button shows. */
const MIN_SELECTION_CHARS = 2;
const BUTTON_GAP = 6;
const STAGE_PADDING = 4;
/** 原位反馈停留时间；选区仍在则回到双按钮，否则浮层已被隐藏。 */
const FEEDBACK_MS = 2500;

const FEEDBACK_ICONS: Record<"ok" | "duplicate" | "error", string> = {
  ok: "mdi-check-circle-outline",
  duplicate: "mdi-information-outline",
  error: "mdi-alert-circle-outline",
};

const readerStore = useReaderStore();
const notesStore = useNotesStore();
const visible = ref(false);
const floatEl = ref<HTMLDivElement | null>(null);
const pos = ref({ left: 0, top: 0 });
/** 三态原位反馈：动作按钮 ↔ 反馈文本（不弹对话框）。 */
const mode = ref<"actions" | "feedback">("actions");
const feedback = ref<{ kind: "ok" | "duplicate" | "error"; text: string } | null>(null);
const pending = ref(false);
/** 选区锚点解析出的页码；无法定位到页时不显示「摘录」。 */
const selectionPage = ref<number | null>(null);

const canExcerpt = computed(() => readerStore.pageCount > 0 && selectionPage.value !== null);

/** Text captured when the layer appeared; the click sends this, not a re-read. */
let cachedText = "";
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

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
  selectionPage.value = resolveSelectionPage(range, stage);
  mode.value = "actions";
  feedback.value = null;
  if (feedbackTimer) {
    clearTimeout(feedbackTimer);
    feedbackTimer = null;
  }
  visible.value = true;
  await nextTick();
  const el = floatEl.value;
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
  selectionPage.value = null;
  mode.value = "actions";
  feedback.value = null;
  if (feedbackTimer) {
    clearTimeout(feedbackTimer);
    feedbackTimer = null;
  }
}

function showFeedback(kind: "ok" | "duplicate" | "error", text: string): void {
  if (!visible.value) return;
  feedback.value = { kind, text };
  mode.value = "feedback";
  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    feedbackTimer = null;
    if (!visible.value) return;
    mode.value = "actions";
    feedback.value = null;
  }, FEEDBACK_MS);
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
  // 反馈态可见期间，入库引发的 DOM 更新会带出一次「选区未变」的 selectionchange；
  // 同文本（trim 后逐字相等）不得把反馈重置为 actions（不重置 mode / 不清 feedback / 不重算几何 / 不重开计时器）。
  if (mode.value === "feedback" && visible.value && text.trim() === cachedText) return;
  void showFor(selection.getRangeAt(0), text.trim());
}

function onStageScroll(event: Event): void {
  const stage = resolveStage();
  if (!stage) return;                          // 阅读区不存在 ⇒ 不隐藏
  if (!(event.target instanceof Node)) return; // 非节点目标 ⇒ 不隐藏
  if (!stage.contains(event.target)) return;   // 目标不在 stage 子树内 ⇒ 不隐藏
  if (visible.value) hide();                   // 阅读区滚动 ⇒ 隐藏（既有语义）
}

function onButtonClick(): void {
  const text = cachedText;
  hide();
  if (text) emitQuickAsk(text);
}

function onTemplateClick(action: TemplateAction): void {
  const text = cachedText;
  hide();
  if (text) emitQuickAsk(text, action);
}

async function onExcerptClick(): Promise<void> {
  const page = selectionPage.value;
  const docFilePath = readerStore.filePath;
  const text = cachedText;
  if (page == null || !docFilePath || !text || pending.value) return;
  pending.value = true;
  const result = await notesStore.addNote({ kind: "excerpt", docFilePath, page, text });
  pending.value = false;
  // 选区已变（或浮层已隐藏）时不再显示旧结果的反馈
  if (!visible.value || cachedText !== text) return;
  if (!result.ok) {
    showFeedback("error", `摘录失败：${result.message}`);
    return;
  }
  if (result.duplicate) {
    showFeedback("duplicate", "已在笔记中");
    return;
  }
  showFeedback("ok", `已摘录 · 第 ${result.page} 页`);
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
  if (feedbackTimer) {
    clearTimeout(feedbackTimer);
    feedbackTimer = null;
  }
});
</script>

<template>
  <div
    v-show="visible"
    ref="floatEl"
    class="quick-ask"
    :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
    @pointerdown.prevent
  >
    <template v-if="mode === 'actions'">
      <button type="button" class="quick-ask-btn" :disabled="pending" @click="onButtonClick">
        <v-icon size="12">mdi-comment-question-outline</v-icon>
        问 AI
      </button>
      <button type="button" class="quick-ask-btn" :disabled="pending" @click="onTemplateClick('explain')">
        <v-icon size="12">mdi-lightbulb-on-outline</v-icon>
        解释
      </button>
      <button type="button" class="quick-ask-btn" :disabled="pending" @click="onTemplateClick('translate')">
        <v-icon size="12">mdi-translate</v-icon>
        翻译
      </button>
      <button
        v-if="canExcerpt"
        type="button"
        class="quick-ask-btn"
        :disabled="pending"
        @click="onExcerptClick"
      >
        <v-icon size="12">mdi-notebook-plus-outline</v-icon>
        摘录
      </button>
    </template>
    <div v-else-if="feedback" class="quick-ask-feedback" :class="`is-${feedback.kind}`">
      <v-icon size="12">{{ FEEDBACK_ICONS[feedback.kind] }}</v-icon>
      {{ feedback.text }}
    </div>
  </div>
</template>

<style scoped>
.quick-ask {
  position: absolute;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 999px;
  background: var(--pix-bg-elevated, #ffffff);
  color: var(--pix-text-primary);
  font-size: 12px;
  line-height: 1;
  box-shadow: var(--pix-shadow-xs);
}

.quick-ask-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.quick-ask-btn:hover {
  background: var(--pix-bg-hover, #eef2f6);
}

.quick-ask-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.quick-ask-feedback {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  white-space: nowrap;
}

.quick-ask-feedback.is-ok {
  color: var(--pix-success, #3f855f);
}

.quick-ask-feedback.is-duplicate {
  color: var(--pix-text-secondary, #52606d);
}

.quick-ask-feedback.is-error {
  color: var(--pix-error, #b75a55);
}
</style>
