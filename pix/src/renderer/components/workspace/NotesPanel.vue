<script setup lang="ts">
/**
 * NotesPanel — left-pane「笔记」tab: workspace notes grouped by document.
 *
 * Every piece of state comes from notesStore (current-document detection
 * included); jumping back to the source page is emitted to WorkspacePage.
 * This component never builds storage paths: notes.json lives wherever the
 * main process put it (notesStore.notesFilePath is display-only).
 */
import { computed, onBeforeUnmount, ref } from "vue";
import { useNotesStore } from "../../stores/notes-store";
import type { ReaderNote } from "@shared/types";

/** 原文超过该长度才渲染「展开全文」（启发式阈值，避免逐行测量 DOM 宽度）。 */
const COLLAPSED_TEXT_LENGTH = 180;
/** 删除待确认与瞬时提示的复位窗口。 */
const DELETE_CONFIRM_MS = 3000;
const NOTICE_MS = 4000;

const emit = defineEmits<{
  "open-note": [note: ReaderNote];
}>();

const notesStore = useNotesStore();

const notice = ref<{ kind: "success" | "error"; text: string } | null>(null);
const confirmingDeleteId = ref<string | null>(null);
const deletingId = ref<string | null>(null);
const expandedIds = ref<Set<string>>(new Set());
const editingCommentId = ref<string | null>(null);
const commentDraft = ref("");
const savingComment = ref(false);
const exporting = ref(false);
const recovering = ref(false);

let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let confirmTimer: ReturnType<typeof setTimeout> | null = null;

const currentDocSwitch = computed({
  get: () => notesStore.currentDocOnly,
  set: (value: boolean) => notesStore.setCurrentDocOnly(value),
});
/** 逃生口只对主进程接受重建的两个码渲染（read-failed 可能是临时占用，改名会丢可恢复数据）。 */
const showEscapeHatch = computed(
  () => notesStore.errorCode === "corrupt" || notesStore.errorCode === "version-unsupported",
);
const exportLabel = computed(() => (notesStore.hasNotes ? "导出 Markdown" : "暂无笔记"));
const filteredEmpty = computed(() => notesStore.hasNotes && notesStore.groups.length === 0);
/**
 * 头部计数：错误态下本地列表是本次读取失败前的旧值，不展示；
 * 筛选开启时同时给出当前文档条数，避免头部与只含当前文档的列表不一致。
 */
const countLabel = computed(() => {
  if (notesStore.status === "error") return "";
  if (!notesStore.currentDocOnly) return `共 ${notesStore.totalCount} 条`;
  const visibleCount = notesStore.groups.reduce((sum, group) => sum + group.notes.length, 0);
  // 左栏头部与导出按钮同排，文案必须放得下，否则头部高度会跳一档
  return `当前 ${visibleCount} 条 / 共 ${notesStore.totalCount} 条`;
});

function setNotice(kind: "success" | "error", text: string): void {
  notice.value = { kind, text };
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    noticeTimer = null;
    notice.value = null;
  }, NOTICE_MS);
}

function dismissNotice(): void {
  if (noticeTimer) {
    clearTimeout(noticeTimer);
    noticeTimer = null;
  }
  notice.value = null;
}

/** 相对时间（唯一调用点；不引入 Intl locale 分支）。 */
function relativeTime(ms: number): string {
  const minutes = Math.floor(Math.max(0, Date.now() - ms) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function isExpanded(id: string): boolean {
  return expandedIds.value.has(id);
}

function toggleExpanded(id: string): void {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

function startCommentEdit(note: ReaderNote): void {
  editingCommentId.value = note.id;
  commentDraft.value = note.comment;
}

function cancelCommentEdit(): void {
  editingCommentId.value = null;
  commentDraft.value = "";
}

async function saveComment(note: ReaderNote): Promise<void> {
  if (savingComment.value) return;
  savingComment.value = true;
  const result = await notesStore.updateNoteComment(note.id, commentDraft.value.trim());
  savingComment.value = false;
  if (!result.ok) {
    // 保留输入与编辑态：失败不把面板推入错误态，也不吞掉刚写的内容
    setNotice("error", `备注保存失败：${result.message}`);
    return;
  }
  editingCommentId.value = null;
  commentDraft.value = "";
}

function startDeleteConfirm(id: string): void {
  clearDeleteConfirm();
  confirmingDeleteId.value = id;
  confirmTimer = setTimeout(() => {
    confirmTimer = null;
    clearDeleteConfirm();
  }, DELETE_CONFIRM_MS);
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
}

function clearDeleteConfirm(): void {
  if (confirmTimer) {
    clearTimeout(confirmTimer);
    confirmTimer = null;
  }
  confirmingDeleteId.value = null;
  document.removeEventListener("pointerdown", onDocumentPointerDown, true);
}

function onDocumentPointerDown(event: PointerEvent): void {
  // 监听在 capture 阶段先于按钮自身触发；落在删除按钮上的 pointerdown 要留给二次点击确认
  const target = event.target;
  if (target instanceof Element && target.closest(".note-delete")) return;
  clearDeleteConfirm();
}

function onDeleteClick(note: ReaderNote): void {
  if (confirmingDeleteId.value !== note.id) {
    startDeleteConfirm(note.id);
    return;
  }
  void confirmDelete(note.id);
}

async function confirmDelete(id: string): Promise<void> {
  clearDeleteConfirm();
  if (deletingId.value) return;
  deletingId.value = id;
  const result = await notesStore.removeNote(id);
  deletingId.value = null;
  if (!result.ok) setNotice("error", `删除失败：${result.message}`);
}

async function onExport(): Promise<void> {
  if (exporting.value || !notesStore.hasNotes) return;
  exporting.value = true;
  const result = await notesStore.exportMarkdown();
  exporting.value = false;
  if (!result.ok) setNotice("error", `导出失败：${result.message}`);
}

async function onRecover(): Promise<void> {
  if (recovering.value) return;
  recovering.value = true;
  const result = await notesStore.recoverCorruptNotes();
  recovering.value = false;
  if (!result.ok) {
    setNotice("error", `重建失败：${result.message}`);
    return;
  }
  setNotice("success", "已备份原文件并新建空库");
}

async function revealPath(path: string): Promise<void> {
  if (!path) return;
  try {
    const result = await window.pixApi.libraryShowInFolder(path);
    if (!result.success) setNotice("error", "无法在文件夹中显示该文件");
  } catch (err) {
    setNotice("error", `无法在文件夹中显示该文件：${err instanceof Error ? err.message : String(err)}`);
  }
}

function retryLoad(): void {
  void notesStore.loadNotes();
}

onBeforeUnmount(() => {
  if (noticeTimer) {
    clearTimeout(noticeTimer);
    noticeTimer = null;
  }
  // 卸载兜底：待确认监听与定时器必须成对清理
  clearDeleteConfirm();
});
</script>

<template>
  <div class="notes-panel">
    <div class="notes-header">
      <div class="notes-header-top">
        <span class="notes-count">{{ countLabel }}</span>
        <v-btn
          class="notes-export-btn"
          size="small"
          variant="tonal"
          prepend-icon="mdi-export-variant"
          :disabled="!notesStore.hasNotes || exporting || notesStore.status === 'error'"
          :loading="exporting"
          @click="onExport"
        >
          {{ exportLabel }}
        </v-btn>
      </div>
      <v-switch
        v-model="currentDocSwitch"
        class="notes-filter"
        density="compact"
        hide-details
        color="primary"
        :disabled="!notesStore.currentDocKey"
        label="仅看当前文档"
      />
    </div>

    <div v-if="notice" class="notes-notice" :class="`is-${notice.kind}`">
      <span class="notice-text">{{ notice.text }}</span>
      <button type="button" class="notice-close" title="关闭" @click="dismissNotice">
        <v-icon size="12">mdi-close</v-icon>
      </button>
    </div>

    <div v-if="notesStore.lastExport" class="notes-export-row">
      <span class="export-text">已导出 {{ notesStore.lastExport.count }} 条 → .pix-read/notes.md</span>
      <v-btn
        size="x-small"
        variant="text"
        prepend-icon="mdi-open-in-new"
        @click="revealPath(notesStore.lastExport.filePath)"
      >
        在文件夹中显示
      </v-btn>
    </div>

    <div v-if="notesStore.status === 'loading'" class="notes-loading">
      <v-progress-circular indeterminate size="24" />
    </div>

    <div v-else-if="notesStore.status === 'error'" class="notes-error">
      <v-icon size="32" class="error-icon">mdi-alert-circle-outline</v-icon>
      <p class="error-title">{{ notesStore.errorMessage }}</p>
      <p v-if="notesStore.errorDetail && notesStore.errorDetail !== notesStore.errorMessage" class="error-detail">
        {{ notesStore.errorDetail }}
      </p>
      <div class="error-actions">
        <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="retryLoad">
          重试
        </v-btn>
        <v-btn
          v-if="notesStore.notesFilePath"
          size="small"
          variant="text"
          prepend-icon="mdi-open-in-new"
          @click="revealPath(notesStore.notesFilePath)"
        >
          在文件夹中显示
        </v-btn>
        <v-btn
          v-if="showEscapeHatch"
          size="small"
          variant="text"
          prepend-icon="mdi-broom"
          :loading="recovering"
          @click="onRecover"
        >
          备份原文件并新建空库
        </v-btn>
      </div>
    </div>

    <div v-else-if="!notesStore.hasNotes" class="notes-empty">
      <v-icon size="40" class="empty-icon">mdi-notebook-outline</v-icon>
      <p class="empty-title">还没有摘录</p>
      <p class="empty-subtitle">在 PDF 中选中文字，点「摘录」保存到这里</p>
    </div>

    <div v-else-if="filteredEmpty" class="notes-filtered-empty">当前文档暂无笔记</div>

    <div v-else class="notes-list">
      <div v-for="group in notesStore.groups" :key="group.key" class="notes-group">
        <div class="notes-group-head" :title="group.docPath">
          <div class="group-titles">
            <span class="group-name">{{ group.displayName }}</span>
            <span v-if="group.docPath !== group.displayName" class="group-path">{{ group.docPath }}</span>
          </div>
          <v-chip v-if="group.isCurrentDoc" size="small" variant="tonal" color="primary">当前文档</v-chip>
          <span class="group-count">共 {{ group.notes.length }} 条</span>
        </div>

        <div
          v-for="note in group.notes"
          :key="note.id"
          class="note-row"
          :class="{ confirming: confirmingDeleteId === note.id }"
          @click="emit('open-note', note)"
        >
          <div class="note-head">
            <span class="note-page-badge">第 {{ note.page }} 页</span>
            <span v-if="note.kind === 'answer'" class="note-ai-badge">AI</span>
            <span class="note-time">{{ relativeTime(note.createdAt) }}</span>
            <button
              type="button"
              class="note-delete"
              :disabled="deletingId === note.id"
              @pointerdown.stop
              @click.stop="onDeleteClick(note)"
            >
              {{ confirmingDeleteId === note.id ? "确认删除" : "删除" }}
            </button>
          </div>

          <p class="note-text" :class="{ collapsed: !isExpanded(note.id) }">{{ note.text }}</p>
          <button
            v-if="note.text.length > COLLAPSED_TEXT_LENGTH"
            type="button"
            class="note-expand"
            @click.stop="toggleExpanded(note.id)"
          >
            {{ isExpanded(note.id) ? "收起" : "展开全文" }}
          </button>

          <div class="note-comment" @click.stop>
            <template v-if="editingCommentId === note.id">
              <v-textarea
                v-model="commentDraft"
                auto-grow
                rows="2"
                density="compact"
                hide-details
                placeholder="写点备注…"
              />
              <div class="comment-actions">
                <v-btn
                  size="x-small"
                  variant="tonal"
                  color="primary"
                  :loading="savingComment"
                  @click="saveComment(note)"
                >
                  保存
                </v-btn>
                <v-btn size="x-small" variant="text" :disabled="savingComment" @click="cancelCommentEdit">取消</v-btn>
              </div>
            </template>
            <button
              v-else
              type="button"
              class="comment-trigger"
              :class="{ empty: !note.comment }"
              @click="startCommentEdit(note)"
            >
              <v-icon size="12">mdi-pencil-outline</v-icon>
              <span class="comment-text">{{ note.comment || "添加备注" }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notes-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
}

.notes-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px 6px;
  background: var(--pix-bg-left, #edf3f8);
}

.notes-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.notes-count {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--pix-text-muted);
}

.notes-filter {
  margin: -2px 0 -6px;
}

/* x-small/small 的 rem 尺寸在 14px 根字号下低于面板正文字号，导出按钮显式按辅助字号渲染 */
.notes-export-btn {
  font-size: 11px;
}

.notes-filter :deep(.v-label) {
  font-size: 12px;
  color: var(--pix-text-secondary);
  opacity: 1;
}

.notes-notice {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 2px 10px 6px;
  padding: 6px 8px;
  border-radius: var(--pix-radius-md);
  font-size: 12px;
  line-height: 1.45;
}

.notes-notice.is-success {
  background: var(--pix-success-bg, #edf7f0);
  color: var(--pix-success, #3f855f);
}

.notes-notice.is-error {
  background: var(--pix-error-bg, #fff4f2);
  color: var(--pix-error, #b75a55);
}

.notice-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.notice-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: var(--pix-radius-sm);
  background: transparent;
  color: inherit;
  cursor: pointer;
  flex-shrink: 0;
}

.notice-close:hover {
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.notes-export-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 10px 6px;
  padding: 6px 8px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: var(--pix-radius-md);
  background: var(--pix-bg-elevated, #ffffff);
}

.export-text {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--pix-text-secondary);
  word-break: break-word;
}

.notes-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--pix-text-muted);
}

.notes-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  text-align: center;
}

.error-icon {
  color: var(--pix-text-muted);
}

.error-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--pix-text-primary);
}

.error-detail {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--pix-text-muted);
  word-break: break-word;
}

.error-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.notes-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 16px;
  text-align: center;
}

.empty-icon {
  color: var(--pix-text-muted);
}

.empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--pix-text-primary);
}

.empty-subtitle {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--pix-text-muted);
}

.notes-filtered-empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--pix-text-muted);
}

.notes-list {
  display: flex;
  flex-direction: column;
  padding: 0 6px 12px;
}

.notes-group {
  margin-bottom: 10px;
}

.notes-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  /* 组头与组内卡片正文同为 12px，靠分隔线拉开分组层级 */
  border-bottom: 1px solid var(--pix-border-light, #e3eaf0);
}

.group-titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.group-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--pix-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-path {
  font-size: 10px;
  color: var(--pix-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-count {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--pix-text-muted);
  font-variant-numeric: tabular-nums;
}

.note-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 6px;
  padding: 7px 8px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: var(--pix-radius-md);
  background: var(--pix-bg-elevated, #ffffff);
  cursor: pointer;
}

.note-row:hover {
  border-color: var(--pix-border, #d5dfe8);
}

.note-row.confirming {
  border-color: var(--pix-error-light, #f1d9d6);
  background: var(--pix-error-bg, #fff4f2);
}

.note-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.note-page-badge {
  flex-shrink: 0;
  height: 16px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--pix-accent-light, #edf2f6);
  color: var(--pix-accent, #31424f);
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}

.note-time {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  color: var(--pix-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* AI 结论的区分标记：只区分来源，不改变排序/筛选/计数口径。 */
.note-ai-badge {
  flex-shrink: 0;
  height: 16px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--pix-accent, #31424f);
  color: #ffffff;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
}

.note-row.confirming .note-ai-badge {
  background: var(--pix-error, #b75a55);
}

.note-delete {
  flex-shrink: 0;
  padding: 1px 6px;
  border: none;
  border-radius: var(--pix-radius-sm);
  background: transparent;
  color: var(--pix-text-muted);
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
}

.note-delete:hover {
  background: var(--pix-bg-hover, #e8eff5);
  color: var(--pix-error, #b75a55);
}

.note-delete:disabled {
  opacity: 0.5;
  cursor: default;
}

.note-row.confirming .note-delete {
  background: var(--pix-error, #b75a55);
  color: #ffffff;
  font-weight: 600;
}

.note-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--pix-text-secondary);
  word-break: break-word;
}

.note-text.collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.note-expand {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--pix-text-link, #314b5f);
  font-size: 11px;
  cursor: pointer;
}

.note-expand:hover {
  text-decoration: underline;
}

.note-comment {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.comment-trigger {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 3px 4px;
  border: none;
  border-radius: var(--pix-radius-sm);
  background: var(--pix-bg-subtle, #f7f9fb);
  color: var(--pix-text-secondary);
  font-size: 11px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
}

.comment-trigger:hover {
  background: var(--pix-bg-hover, #e8eff5);
}

.comment-trigger.empty {
  color: var(--pix-text-muted);
}

.comment-text {
  min-width: 0;
  word-break: break-word;
}

.comment-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
</style>
