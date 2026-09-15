<script setup lang="ts">
/**
 * NotesPanel — left-pane「笔记」tab: workspace notes grouped by document.
 *
 * Every piece of state comes from notesStore (current-document detection
 * included); jumping back to the source page is emitted to WorkspacePage.
 * This component never builds storage paths: notes.json lives wherever the
 * main process put it (notesStore.notesFilePath is display-only).
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useNotesStore } from "../../stores/notes-store";
import { emitNotesAsk } from "../../composables/useQuickAsk";
import { docDisplayName } from "../../utils/notes-path";
import {
  buildNoteCopyFragment,
  resolveListEmptyReason,
  UNDO_EXPIRED_MESSAGE,
  UNDO_ROW_MS,
  type ListEmptyReason,
} from "../../utils/notes-view";
import { MAX_CONTEXT_NOTES } from "../../utils/reading-context";
import type { ReaderNote } from "@shared/types";

/** 原文超过该长度才渲染「展开全文」（启发式阈值，避免逐行测量 DOM 宽度）。 */
const COLLAPSED_TEXT_LENGTH = 180;
/** 删除待确认与瞬时提示的复位窗口。 */
const DELETE_CONFIRM_MS = 3000;
const NOTICE_MS = 4000;
/** 复制按钮的「已复制」反馈窗口（与 ChatPanel 同值，不抽公共模块）。 */
const COPY_FEEDBACK_MS = 1200;

/** 空态判别值 → 类名；条件判定只在 resolveListEmptyReason，本表不做第二次判断。 */
const LIST_EMPTY_CLASS: Record<ListEmptyReason, string> = {
  "search-chapter": "notes-search-empty",
  "search-current-doc": "notes-search-empty",
  search: "notes-search-empty",
  chapter: "notes-chapter-empty",
  "current-doc": "notes-filtered-empty",
};

/** 「追问」的两个禁用原因（R8 设计档 §1.4 三态；自上而下第一条命中者生效）。 */
const ASK_DISABLED_TITLE = "等待澄清回答时无法发起追问";
const ASK_NO_DOC_TITLE = "请先打开文档，摘录才会随提问注入";
/** 条数上限提示：挂在未选中条目的控件包裹元素上（禁用控件在 Chromium 下不派发鼠标事件）。 */
const SELECT_CAP_TITLE = `最多可注入 ${MAX_CONTEXT_NOTES} 条笔记，请先取消其它选择`;

const props = defineProps<{
  clarifying: boolean;
  documentOpen: boolean;
}>();

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
/** 撤销在途守卫：只在 finally 复位，stale 分支不得让按钮永久禁用。 */
const restoring = ref(false);
const copiedNoteId = ref<string | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let confirmTimer: ReturnType<typeof setTimeout> | null = null;
let undoRowTimer: ReturnType<typeof setTimeout> | null = null;
let copyTimer: ReturnType<typeof setTimeout> | null = null;

/** 两个「追问」入口的禁用与 title 判据（R8 设计档 §1.4）：可用 ⇔ 本次会注入 reader_notes。 */
const askDisabledTitle = computed(() => {
  if (props.clarifying) return ASK_DISABLED_TITLE;
  if (!props.documentOpen) return ASK_NO_DOC_TITLE;
  return null;
});

const currentDocSwitch = computed({
  get: () => notesStore.currentDocOnly,
  set: (value: boolean) => notesStore.setCurrentDocOnly(value),
});
/** 逃生口只对主进程接受重建的两个码渲染（read-failed 可能是临时占用，改名会丢可恢复数据）。 */
const showEscapeHatch = computed(
  () => notesStore.errorCode === "corrupt" || notesStore.errorCode === "version-unsupported",
);
const exportLabel = computed(() => (notesStore.hasNotes ? "导出 Markdown" : "暂无笔记"));
/** 搜索框只经 store 的 setSearchQuery 写值（原串），是否生效一律看派生 searchActive。 */
const searchModel = computed({
  get: () => notesStore.searchQuery,
  set: (value: string) => notesStore.setSearchQuery(value),
});
const sortLabel = computed(() => (notesStore.sortMode === "page" ? "排序：页码" : "排序：最新"));
const sortTitle = computed(() =>
  notesStore.sortMode === "page" ? "当前按页码排序，点击改为「最新优先」" : "当前按最新优先排序，点击改为「页码」",
);
/** 撤销行的展示文案：正文截断只影响展示，还原内容完全来自主进程槽。 */
const undoSnippet = computed(() => {
  const pending = notesStore.pendingUndo;
  if (!pending) return "";
  return pending.text.length > 12 ? `${pending.text.slice(0, 12)}…` : pending.text;
});
const emptyReason = computed(() =>
  resolveListEmptyReason({
    query: notesStore.activeQuery,
    visibleCount: notesStore.visibleCount,
    chapterFilterActive: notesStore.chapterFilter !== null,
    currentDocOnly: notesStore.currentDocOnly,
  }),
);
const emptyClass = computed(() => (emptyReason.value ? LIST_EMPTY_CLASS[emptyReason.value] : ""));
/** 搜索类三条含 {q}（activeQuery 已 trim），其余两条是 R9 既有逐字文案。 */
const emptyText = computed(() => {
  const reason = emptyReason.value;
  if (reason === "search-chapter") return `本章内没有匹配「${notesStore.activeQuery}」的笔记`;
  if (reason === "search-current-doc") return `当前文档内没有匹配「${notesStore.activeQuery}」的笔记`;
  if (reason === "search") return `没有匹配「${notesStore.activeQuery}」的笔记`;
  if (reason === "chapter") return "本章暂无笔记";
  if (reason === "current-doc") return "当前文档暂无笔记";
  return "";
});
/** 章节过滤条容器 title：文档显示名取当前文档比较键的末段（与地图行同一个字符串）。 */
const chapterFilterTitle = computed(
  () =>
    `仅显示当前文档「${docDisplayName(notesStore.currentDocKey ?? "")}」该章节范围内的笔记；点「清除」恢复全部笔记`,
);
/**
 * 头部计数（四分叉）：错误态下本地列表是本次读取失败前的旧值，不展示；
 * 搜索维度优先于章节/文档维度（计数只表达搜索，另两维由控件自身状态表达）。
 * 可见条数取 store 的 visibleCount（V 的唯一定点），面板不自行求和。
 */
const countLabel = computed(() => {
  if (notesStore.status === "error") return "";
  const visibleCount = notesStore.visibleCount;
  // 左栏头部与导出按钮同排，文案必须放得下，否则头部高度会跳一档
  if (notesStore.searchActive) return `命中 ${visibleCount} 条 / 共 ${notesStore.totalCount} 条`;
  if (notesStore.chapterFilter) return `本章 ${visibleCount} 条 / 共 ${notesStore.totalCount} 条`;
  if (!notesStore.currentDocOnly) return `共 ${notesStore.totalCount} 条`;
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

/** 未选且已达上限才禁用；已选条目始终可以取消（上限守卫在 store 内用派生计数判）。 */
function isNoteSelectDisabled(id: string): boolean {
  return !notesStore.isNoteSelected(id) && notesStore.selectionFull;
}

/** 行内「追问」：替换语义只在 store 单一动作内落地；id 已失效即 no-op（零副作用）。 */
function onAskNote(note: ReaderNote): void {
  if (notesStore.replaceSelectionWith(note.id)) emitNotesAsk();
}

/** 排序切换不新增第二个 setter：只写 store 的 sortMode（不落盘、不发 IPC）。 */
function onToggleSort(): void {
  notesStore.setSortMode(notesStore.sortMode === "page" ? "created" : "page");
}

/** Esc 只清空查询并交出焦点；不 stopPropagation（既有 window 级 Esc 语义保留）。 */
function onSearchEsc(): void {
  notesStore.clearSearchQuery();
  searchInputRef.value?.blur();
}

/** 清空按钮：置空后把焦点交还输入框，便于继续输入。 */
function onSearchClear(): void {
  notesStore.clearSearchQuery();
  searchInputRef.value?.focus();
}

/**
 * 撤销行计时基准是 deletedAt：重挂载不续命不复活。定时器建在 watch 上（每次新删除都重建），
 * 剩余 ≤ 0 时钳到 0（到期处理只有定时器回调一处）。
 */
function scheduleUndoRow(): void {
  if (undoRowTimer) {
    clearTimeout(undoRowTimer);
    undoRowTimer = null;
  }
  const pending = notesStore.pendingUndo;
  if (!pending) return;
  undoRowTimer = setTimeout(() => {
    undoRowTimer = null;
    notesStore.clearPendingUndo();
  }, Math.max(0, UNDO_ROW_MS - (Date.now() - pending.deletedAt)));
}

watch(() => notesStore.pendingUndo, scheduleUndoRow, { immediate: true });

/** stale（目标已被替换 / 已复位）零副作用：不弹提示、不动行、不覆盖列表。 */
async function onUndoClick(): Promise<void> {
  if (restoring.value) return;
  restoring.value = true;
  try {
    const result = await notesStore.undoDelete();
    if ("stale" in result) return;
    if (result.ok) {
      setNotice("success", "已还原该条笔记");
      return;
    }
    setNotice("error", `撤销失败：${result.message}`);
    if (result.message === UNDO_EXPIRED_MESSAGE) notesStore.clearPendingUndo();
  } finally {
    restoring.value = false;
  }
}

// --- 剪贴板：异步 API 优先，execCommand 兜底（写法与 ChatPanel 一致） ---

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyViaExecCommand(text);
  }
}

function copyViaExecCommand(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

/** 复制是只读动作：不写盘、不改过滤/选择/排序，两链路都失败时不置反馈态。 */
async function onCopyNote(note: ReaderNote): Promise<void> {
  if (!(await copyToClipboard(buildNoteCopyFragment(note)))) {
    setNotice("error", "复制失败：无法访问剪贴板");
    return;
  }
  copiedNoteId.value = note.id;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copiedNoteId.value = null;
    copyTimer = null;
  }, COPY_FEEDBACK_MS);
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
  // 卸载兜底：待确认监听、撤销行定时器与复制反馈定时器必须成对清理
  if (undoRowTimer) {
    clearTimeout(undoRowTimer);
    undoRowTimer = null;
  }
  if (copyTimer) {
    clearTimeout(copyTimer);
    copyTimer = null;
  }
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
      <div v-if="notesStore.status === 'ready' && notesStore.hasNotes" class="notes-search">
        <input
          ref="searchInputRef"
          v-model="searchModel"
          type="text"
          class="notes-search-input"
          placeholder="搜索原文或备注"
          @keydown.esc="onSearchEsc"
        />
        <v-btn
          v-if="notesStore.searchActive"
          class="notes-search-clear"
          icon="mdi-close"
          size="x-small"
          variant="text"
          title="清空搜索"
          @click="onSearchClear"
        />
      </div>
      <div v-if="notesStore.status === 'ready' && notesStore.hasNotes" class="notes-sort">
        <button type="button" class="notes-sort-btn" :title="sortTitle" @click="onToggleSort">
          {{ sortLabel }}
        </button>
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
      <div
        v-if="notesStore.status === 'ready' && notesStore.chapterFilter"
        class="notes-chapter-filter"
        :title="chapterFilterTitle"
      >
        <span class="notes-chapter-filter-text">
          章节：{{ notesStore.chapterFilter.title }} · 第 {{ notesStore.chapterFilter.label }} 页
        </span>
        <button
          type="button"
          class="notes-chapter-filter-clear"
          title="清除章节过滤，恢复全部笔记"
          @click="notesStore.clearChapterFilter()"
        >
          清除
        </button>
      </div>
      <div
        v-if="notesStore.status === 'ready' && notesStore.hasNotes && notesStore.selectedCount > 0"
        class="notes-selection-bar"
      >
        <span class="notes-selection-count">已选 {{ notesStore.selectedCount }} 条</span>
        <span class="notes-ask-btn-wrap" :title="askDisabledTitle ?? undefined">
          <button type="button" class="notes-ask-btn" :disabled="askDisabledTitle !== null" @click="emitNotesAsk()">
            问 AI
          </button>
        </span>
        <button
          type="button"
          class="notes-selection-clear"
          title="取消全部选择"
          @click="notesStore.clearNoteSelection()"
        >
          清空
        </button>
      </div>
    </div>

    <div v-if="notice" class="notes-notice" :class="`is-${notice.kind}`">
      <span class="notice-text">{{ notice.text }}</span>
      <button type="button" class="notice-close" title="关闭" @click="dismissNotice">
        <v-icon size="12">mdi-close</v-icon>
      </button>
    </div>

    <div v-if="notesStore.pendingUndo" class="notes-undo">
      <span class="undo-text">已删除「{{ undoSnippet }}」· 第 {{ notesStore.pendingUndo.page }} 页</span>
      <button type="button" class="notes-undo-btn" title="还原这条笔记" :disabled="restoring" @click="onUndoClick">
        撤销
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

    <div v-else-if="emptyReason" :class="emptyClass">{{ emptyText }}</div>

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
          :class="{ confirming: confirmingDeleteId === note.id, selected: notesStore.isNoteSelected(note.id) }"
          @click="emit('open-note', note)"
        >
          <!-- 点击落点唯一：切换只挂在包裹元素上，复选框本体只挂受控属性（本体再挂 toggle 会双触发） -->
          <span
            class="note-select-wrap"
            :title="isNoteSelectDisabled(note.id) ? SELECT_CAP_TITLE : undefined"
            @click.stop="notesStore.toggleNoteSelected(note.id)"
          >
            <input
              type="checkbox"
              class="note-select"
              :checked="notesStore.isNoteSelected(note.id)"
              :disabled="isNoteSelectDisabled(note.id)"
            />
          </span>
          <div class="note-body">
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

            <div class="note-actions">
              <button
                type="button"
                class="note-copy"
                :class="{ 'is-copied': copiedNoteId === note.id }"
                :title="copiedNoteId === note.id ? '已复制' : '复制为 Markdown'"
                @click.stop="onCopyNote(note)"
              >
                {{ copiedNoteId === note.id ? "已复制" : "复制" }}
              </button>
              <span class="note-ask-wrap" :title="askDisabledTitle ?? undefined">
                <button
                  type="button"
                  class="note-ask"
                  :disabled="askDisabledTitle !== null"
                  @click.stop="onAskNote(note)"
                >
                  追问
                </button>
              </span>
            </div>
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

/* 搜索行：位于头部首行之后、排序行之前；未就绪/无笔记时整行不进 DOM */
.notes-search {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 盒模型照抄 PdfSearchPanel.vue 的 .search-input（需求 §0.8：高 26px、圆角 6、12px 字号、focus 边框） */
.notes-search-input {
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

.notes-search-input:focus {
  border-color: var(--pix-border-focus, #31424f);
}

.notes-sort {
  display: flex;
  align-items: center;
}

.notes-sort-btn {
  padding: 1px 6px;
  border: none;
  border-radius: var(--pix-radius-sm);
  background: transparent;
  color: var(--pix-text-link, #314b5f);
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
}

.notes-sort-btn:hover {
  background: var(--pix-bg-hover, #e8eff5);
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

/* 选择条：随头部 sticky，位于筛选开关之后（R8 设计档 §1.5） */
.notes-selection-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 3px 4px 3px 8px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: var(--pix-radius-md);
  background: var(--pix-bg-elevated, #ffffff);
}

/* 章节过滤条：位于筛选开关之后、选择条之前（R9 设计档 §1.8），盒模型逐字对齐选择条 */
.notes-chapter-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 3px 4px 3px 8px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: var(--pix-radius-md);
  background: var(--pix-bg-elevated, #ffffff);
}

.notes-chapter-filter-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  color: var(--pix-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notes-chapter-filter-clear {
  flex-shrink: 0;
  padding: 2px 6px;
  border: none;
  border-radius: var(--pix-radius-sm);
  background: transparent;
  color: var(--pix-text-muted);
  font-size: 11px;
  line-height: 1.5;
  cursor: pointer;
}

.notes-chapter-filter-clear:hover {
  background: var(--pix-bg-hover, #e8eff5);
  color: var(--pix-text-primary);
}

.notes-selection-count {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  color: var(--pix-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notes-ask-btn-wrap {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.notes-ask-btn {
  padding: 2px 8px;
  border: none;
  border-radius: 999px;
  background: var(--pix-accent, #31424f);
  color: #ffffff;
  font-size: 11px;
  line-height: 1.5;
  cursor: pointer;
}

.notes-ask-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.notes-selection-clear {
  flex-shrink: 0;
  padding: 2px 6px;
  border: none;
  border-radius: var(--pix-radius-sm);
  background: transparent;
  color: var(--pix-text-muted);
  font-size: 11px;
  line-height: 1.5;
  cursor: pointer;
}

.notes-selection-clear:hover {
  background: var(--pix-bg-hover, #e8eff5);
  color: var(--pix-text-primary);
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

.notes-undo {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 10px 6px;
  padding: 6px 8px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: var(--pix-radius-md);
  background: var(--pix-bg-elevated, #ffffff);
}

.undo-text {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--pix-text-secondary);
  word-break: break-word;
}

.notes-undo-btn {
  flex-shrink: 0;
  padding: 1px 6px;
  border: none;
  border-radius: var(--pix-radius-sm);
  background: transparent;
  color: var(--pix-text-link, #314b5f);
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
}

.notes-undo-btn:hover {
  background: var(--pix-bg-hover, #e8eff5);
}

.notes-undo-btn:disabled {
  opacity: 0.5;
  cursor: default;
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

/* 搜索类空态（4a/4b/4c 共用；原因由文本区分），盒模型逐字对齐 .notes-filtered-empty */
.notes-search-empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--pix-text-muted);
}

/* 章节过滤生效且可见行 0（分支优先于「当前文档暂无笔记」） */
.notes-chapter-empty {
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
  flex-direction: row;
  gap: 6px;
  align-items: flex-start;
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

/* 选择控件列：宽度固定 13px + gap 6px，.note-head 内部三元素与删除按钮位置不变（32 段 headOverflow 回归门） */
.note-select-wrap {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  height: 16px;
}

.note-select {
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: var(--pix-accent);
  cursor: pointer;
}

.note-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 已选行态；与 .confirming 叠加时由后者在样式表中的既有配色胜出，不新增第三种配色 */
.note-row.selected {
  border-color: var(--pix-accent, #31424f);
  background: var(--pix-accent-light, #edf2f6);
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

/* 行内追问：.note-body 的最后一个子节点，右对齐单行 */
.note-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.note-ask-wrap {
  display: inline-flex;
  align-items: center;
}

.note-copy {
  padding: 1px 6px;
  border: none;
  border-radius: var(--pix-radius-sm);
  background: transparent;
  color: var(--pix-text-link, #314b5f);
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
}

.note-copy:hover {
  background: var(--pix-bg-hover, #e8eff5);
}

.note-copy.is-copied {
  color: var(--pix-accent, #31424f);
}

.note-ask {
  padding: 1px 6px;
  border: none;
  border-radius: var(--pix-radius-sm);
  background: transparent;
  color: var(--pix-text-link, #314b5f);
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
}

.note-ask:hover {
  background: var(--pix-bg-hover, #e8eff5);
}

.note-ask:disabled {
  opacity: 0.5;
  cursor: default;
  color: var(--pix-text-muted);
}
</style>
