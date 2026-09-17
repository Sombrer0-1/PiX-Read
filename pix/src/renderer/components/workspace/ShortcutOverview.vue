<script setup lang="ts">
/**
 * ShortcutOverview — 「快捷键总览」入口（Teleport 进 .center-pill）与只读浮层（R17 N96/N98）。
 * 键位文案全部来自 utils/shortcut-help.ts；不读取阅读器状态、不做持久化、不改既有键位语义。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { SHORTCUT_KEY_JOIN, SHORTCUT_NOTE, SHORTCUT_SECTIONS } from "../../utils/shortcut-help";

const open = ref(false);
const pillReady = ref(false);
const panelEl = ref<HTMLDivElement | null>(null);
const toggleEl = ref<HTMLButtonElement | null>(null);
/** 打开前的焦点元素；关闭时优先归还（不可连接则退回入口按钮）。 */
let lastFocused: HTMLElement | null = null;

/** 与 PdfViewer.vue:400-407 的谓词逐字同构（有意重复：本轮 PdfViewer.vue 零 diff）。 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function close(): void {
  if (!open.value) return;
  open.value = false;
  if (lastFocused?.isConnected) lastFocused.focus();
  else toggleEl.value?.focus();
  lastFocused = null;
}

async function toggle(): Promise<void> {
  if (open.value) {
    close();
    return;
  }
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  open.value = true;
  await nextTick();
  panelEl.value?.focus();
}

/** 点击浮层与入口之外 ⇒ 关闭（浮层打开期间挂载）。 */
function onDocumentPointerdown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (panelEl.value?.contains(target)) return;
  if (toggleEl.value?.contains(target)) return;
  close();
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    // 关闭浮层但绝不阻断阅读区既有 Esc 语义（不 preventDefault、不阻断冒泡）。
    if (open.value) close();
    return;
  }
  if (event.key !== "?") return;
  if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  // 输入框 / 可编辑目标内不触发，且不得 preventDefault（早退在 preventDefault 之前）。
  if (isEditableTarget(event.target)) return;
  event.preventDefault();
  void toggle();
}

watch(open, (value) => {
  if (value) document.addEventListener("pointerdown", onDocumentPointerdown);
  else document.removeEventListener("pointerdown", onDocumentPointerdown);
});

onMounted(() => {
  pillReady.value = !!document.querySelector(".center-pill");
  window.addEventListener("keydown", onWindowKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onWindowKeydown);
  document.removeEventListener("pointerdown", onDocumentPointerdown);
});
</script>

<template>
  <Teleport v-if="pillReady" to=".center-pill">
    <button
      ref="toggleEl"
      type="button"
      class="shortcut-toggle"
      title="快捷键总览（?）"
      aria-label="快捷键总览"
      :aria-expanded="open"
      @click="toggle"
    >
      <v-icon size="14">mdi-keyboard-outline</v-icon>
    </button>
  </Teleport>

  <div v-if="open" ref="panelEl" class="shortcut-overview" role="dialog" aria-label="快捷键总览" tabindex="-1">
    <div class="shortcut-header">
      <span class="shortcut-title">快捷键总览</span>
      <button type="button" class="shortcut-close" title="关闭" aria-label="关闭" @click="close">
        <v-icon size="14">mdi-close</v-icon>
      </button>
    </div>
    <div v-for="(section, sectionIndex) in SHORTCUT_SECTIONS" :key="sectionIndex" class="shortcut-section">
      <p class="shortcut-section-title">{{ section.title }}</p>
      <div v-for="(row, rowIndex) in section.rows" :key="rowIndex" class="shortcut-row">
        <kbd class="shortcut-key">{{ row.keys.join(SHORTCUT_KEY_JOIN) }}</kbd>
        <span class="shortcut-desc">{{ row.desc }}</span>
      </div>
    </div>
    <p class="shortcut-note">{{ SHORTCUT_NOTE }}</p>
  </div>
</template>

<style scoped>
.shortcut-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 2px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--pix-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.shortcut-toggle:hover {
  background: var(--pix-bg-hover, #eef2f6);
  color: var(--pix-text-primary);
}

.shortcut-toggle[aria-expanded="true"] {
  background: var(--pix-bg-active, #dfeaf4);
  color: var(--pix-text-primary);
}

.shortcut-overview {
  position: absolute;
  top: 40px;
  left: 8px;
  z-index: 7;
  width: 320px;
  max-height: calc(100% - 104px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 12px;
  background: var(--pix-bg-elevated, #ffffff);
  box-shadow: var(--pix-shadow-md);
  color: var(--pix-text-primary);
  font-family: var(--pix-font-ui);
  font-size: 12px;
  line-height: 1.5;
  outline: none;
}

.shortcut-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.shortcut-title {
  font-size: 12px;
  font-weight: 600;
}

.shortcut-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--pix-text-secondary);
  cursor: pointer;
}

.shortcut-close:hover {
  background: var(--pix-bg-hover, #eef2f6);
  color: var(--pix-text-primary);
}

.shortcut-section-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--pix-text-muted);
}

.shortcut-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.shortcut-key {
  flex: 0 0 auto;
  min-width: 88px;
  padding: 1px 6px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 4px;
  background: var(--pix-bg-code, #f4f6f9);
  color: var(--pix-text-secondary);
  font-family: var(--pix-font-mono, monospace);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}

.shortcut-desc {
  color: var(--pix-text-secondary);
}

.shortcut-note {
  margin: 0;
  padding-top: 4px;
  border-top: 1px solid var(--pix-border-light, #e3eaf0);
  color: var(--pix-text-muted);
  font-size: 11px;
}
</style>
