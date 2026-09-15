<script setup lang="ts">
/**
 * ChatPanel — right pane of the reading workspace.
 *
 * Hosts the agent conversation: streamed display blocks, the composer,
 * model/thinking selectors, and clarification cards when the agent
 * requests user input. Session history lives in the pane-pill menu.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useRpc } from "../../composables/useRpc";
import { registerNotesAskConsumer, registerQuickAskConsumer } from "../../composables/useQuickAsk";
import { registerRegionCaptureConsumer } from "../../composables/useRegionCapture";
import { useNotesStore } from "../../stores/notes-store";
import { useReaderStore } from "../../stores/reader-store";
import { useSessionStore } from "../../stores/session-store";
import { MAX_CONTEXT_NOTES_CHARS, buildReadingUserMessage, selectNotesForContext } from "../../utils/reading-context";
import { renderMarkdown } from "../../utils/markdown";
import { preparePastedImage } from "../../utils/image-capture";
import type { RequestUserInputRequest } from "@/types/rpc";
import type { DisplayBlock, SessionInfo } from "@/types/session";
import type { ReadingAnchor } from "@shared/types";
import { deriveSessionTitle, formatSessionTime } from "../../utils/session-title";
import MessageBlock from "../session/MessageBlock.vue";
import ToolExecutionBlock from "../session/ToolExecutionBlock.vue";
import ErrorBlock from "../session/ErrorBlock.vue";
import GuideBlock from "../session/GuideBlock.vue";
import InputArea from "../input/InputArea.vue";
import ModelSelector from "../input/ModelSelector.vue";
import ThinkingSelector from "../input/ThinkingSelector.vue";
import ClarificationCard from "../input/ClarificationCard.vue";

const props = defineProps<{
  pendingUserInput?: RequestUserInputRequest | null;
  sessions?: SessionInfo[];
  currentSessionPath?: string;
  sessionTitle?: string;
}>();

const emit = defineEmits<{
  "new-session": [];
  "switch-session": [session: SessionInfo];
  "delete-session": [session: SessionInfo];
  "user-input-done": [];
}>();

const rpc = useRpc();
const sessionStore = useSessionStore();
const notesStore = useNotesStore();
const readerStore = useReaderStore();
const router = useRouter();

const THINKING_LEVEL_LABELS: Record<string, string> = {
  off: "关闭",
  minimal: "轻量",
  low: "低",
  medium: "标准",
  high: "深入",
  xhigh: "极深",
};

const COMPACTION_REASON_LABELS: Record<string, string> = {
  manual: "手动",
  threshold: "达到阈值",
  overflow: "上下文溢出",
};

// --- Reading-context chips: what the AI will see for the next send ---

type ContextChipKind = "document" | "selection" | "notes";

interface ContextChip {
  kind: ContextChipKind;
  icon: string;
  label: string;
  title?: string;
}

const SELECTED_TEXT_PREVIEW_MAX = 24;

/** Chips hidden for the send in progress; never mutates readerStore. */
const excludedContexts = ref<ReadonlySet<ContextChipKind>>(new Set());

function excludeContext(kind: ContextChipKind): void {
  const next = new Set(excludedContexts.value);
  next.add(kind);
  excludedContexts.value = next;
}

function resetExcludedContexts(): void {
  excludedContexts.value = new Set();
}

const documentChip = computed<ContextChip | null>(() => {
  const filePath = readerStore.filePath;
  if (!filePath) return null;
  const name = filePath.split(/[/\\]/).pop() || filePath;
  const pageLabel = readerStore.pageCount > 0 ? ` · 第 ${readerStore.page} 页` : "";
  return { kind: "document", icon: "mdi-file-pdf-outline", label: `当前文档：${name}${pageLabel}` };
});

const selectionChip = computed<ContextChip | null>(() => {
  const selected = readerStore.selectedText.trim();
  if (!selected) return null;
  const preview = selected.length > SELECTED_TEXT_PREVIEW_MAX
    ? `${selected.slice(0, SELECTED_TEXT_PREVIEW_MAX)}…`
    : selected;
  return { kind: "selection", icon: "mdi-text-selection", label: `选中文本：${preview}` };
});

/** 本次发送是否会输出 <reading_context>：文档 chip 被排除时 buildReadingUserMessage 早退。 */
const readingContextWillSend = computed(
  () => documentChip.value !== null && !excludedContexts.value.has("document"),
);

/**
 * 摘录 chip：与注入载荷同源（selectNotesForContext），可见 ⇔ 本次会输出 reader_notes 段。
 * N/M/P 全部取选择结果，不在本组件内做排序/裁剪/长度判定。
 */
const notesChip = computed<ContextChip | null>(() => {
  if (!readingContextWillSend.value || notesStore.selectedCount === 0) return null;
  const picked = selectNotesForContext(notesStore.selectedNotes);
  const total = picked.injected.length + picked.dropped.length;
  const dropped = picked.dropped.length;
  if (dropped === 0) {
    return { kind: "notes", icon: "mdi-notebook-outline", label: `摘录 ${total} 条`, title: `本次注入 ${picked.injected.length} 条笔记` };
  }
  return {
    kind: "notes",
    icon: "mdi-notebook-outline",
    label: `摘录 ${total} 条 · 超出上限未注入 ${dropped} 条`,
    title: `本次注入 ${picked.injected.length} 条笔记；${dropped} 条因超过 ${MAX_CONTEXT_NOTES_CHARS} 字符上限未注入`,
  };
});

const contextChips = computed<ContextChip[]>(() =>
  [documentChip.value, selectionChip.value, notesChip.value].filter(
    (chip): chip is ContextChip => chip !== null && !excludedContexts.value.has(chip.kind),
  ),
);

// A fresh turn must see every available context chip again.
watch(
  () => props.currentSessionPath,
  () => resetExcludedContexts(),
);
watch(
  () => sessionStore.displayBlocks.length === 0,
  (empty) => {
    if (empty) resetExcludedContexts();
  },
);

// Errors shaped like credential problems get an actionable guide card.
const AUTH_ERROR_PATTERN = /401|403|api[\s_-]?key|unauthorized|authentication|permission denied|invalid api key|密钥|未配置|no auth/i;
const AUTH_GUIDE_MESSAGE =
  "看起来还没有配置可用的 API 密钥。打开「设置 → 模型与密钥」，为你的提供商填入密钥后即可开始提问。";

function openSettings(): void {
  router.push("/settings?section=models");
}

const draft = ref("");
const attachments = ref<Array<{ path: string; name: string }>>([]);
const clipboardImages = ref<Array<{ mimeType: string; base64: string }>>([]);
const composerInput = ref<InstanceType<typeof InputArea> | null>(null);
const modelMenuOpen = ref(false);
const thinkingMenuOpen = ref(false);
const messagesEl = ref<HTMLElement | null>(null);
const optimisticBlockId = ref<string | null>(null);

/** One message can carry at most this many pasted screenshots. */
const MAX_PASTED_IMAGES = 8;

const isStreaming = computed(() => sessionStore.isStreaming);
const currentModelLabel = computed(() => {
  const model = rpc.sessionState.value?.model;
  return model ? `${model.id}` : "选择模型";
});
const currentThinkingLabel = computed(() => {
  const level = rpc.sessionState.value?.thinkingLevel;
  if (!level) return "思考深度";
  return THINKING_LEVEL_LABELS[level] ?? level;
});
const paneTitle = computed(() => props.sessionTitle || rpc.sessionState.value?.sessionName || "新对话");
const historySessions = computed(() => props.sessions ?? []);

// Composer usage meta is a pure computed; sessionStats refresh is owned by
// useRpc (agent lifecycle events) — no polling here.
function formatTokens(value: number): string {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(1)}k`;
}

const usageMeta = computed<{ left: string; right: string | null } | null>(() => {
  const stats = rpc.sessionStats.value;
  const tokens = stats?.tokens;
  if (!tokens) return null;
  if (tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite === 0) return null;
  let left = `输入 ${formatTokens(tokens.input)} · 输出 ${formatTokens(tokens.output)}`;
  if (stats.cost > 0) left += ` · $${stats.cost.toFixed(4)}`;
  const percent = stats.contextUsage?.percent;
  return { left, right: percent == null ? null : `上下文 ${percent}%` };
});

let answerMap = ref<Record<string, string>>({});
const clarifying = computed(() => !!props.pendingUserInput);
const currentQuestionIndex = ref(0);
const currentQuestion = computed(() => {
  const req = props.pendingUserInput;
  if (!req || currentQuestionIndex.value >= req.questions.length) return null;
  return req.questions[currentQuestionIndex.value];
});
const currentAnswer = computed(() => {
  const q = currentQuestion.value;
  return q ? answerMap.value[q.id] ?? "" : "";
});

const blocks = computed(() => sessionStore.displayBlocks);
const nowTick = ref(Date.now());
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let followTimer: ReturnType<typeof setInterval> | null = null;

/** Pixels from the bottom within which auto-scroll keeps following the stream. */
const NEAR_BOTTOM_PX = 120;

const hasLiveWork = computed(() =>
  sessionStore.isStreaming ||
  blocks.value.some((block) => block.type === "work-status" && block.isStreaming),
);

watch(
  () => blocks.value.length,
  async () => {
    await nextTick();
    followScrollEnd();
  },
);

watch(
  hasLiveWork,
  (live) => {
    if (live) {
      nowTick.value = Date.now();
      if (!elapsedTimer) {
        elapsedTimer = setInterval(() => {
          nowTick.value = Date.now();
        }, 1000);
      }
      // Streamed text grows without pushing new blocks; keep the view pinned
      // to the tail unless the user scrolled up to read.
      if (!followTimer) {
        followTimer = setInterval(() => {
          followScrollEnd();
        }, 400);
      }
      return;
    }
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
    if (followTimer) {
      clearInterval(followTimer);
      followTimer = null;
    }
    followScrollEnd();
  },
  { immediate: true },
);

function scrollToEnd(): void {
  const el = messagesEl.value;
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
}

function isNearBottom(): boolean {
  const el = messagesEl.value;
  if (!el) return false;
  return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
}

function followScrollEnd(): void {
  if (isNearBottom()) scrollToEnd();
}

function updateDraft(value: string): void {
  draft.value = value;
}

// --- Quick ask: floating button over the PDF selection (useQuickAsk seam) ---

const QUICK_ASK_TEMPLATE = "请解释选中的这段话：";

function onQuickAsk(): void {
  // 原文已由「选中文本」chip 注入发送链路，这里只补模板文案并聚焦，不覆盖输入。
  if (!draft.value) draft.value = QUICK_ASK_TEMPLATE;
  composerInput.value?.focus();
}

// --- Notes ask: NotesPanel 的选择条与行内「追问」（useQuickAsk 的第二套 seam） ---

const NOTES_ASK_TEMPLATE = "请结合我选中的摘录回答：";
const NOTES_ASK_NOTICE_MS = 2500;

const notesAskNotice = ref("");
let notesAskNoticeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 两个入口共用的唯一处理函数：选择集与替换语义已由 NotesPanel / store 就位。
 * 硬要求（R8 设计档 §1.4）：不把笔记原文写进输入框；草稿非空时一个字符都不改。
 */
function onNotesAsk(): void {
  if (draft.value.trim() === "") {
    draft.value = NOTES_ASK_TEMPLATE;
    composerInput.value?.focus();
    return;
  }
  composerInput.value?.focus();
  notesAskNotice.value = `已加入 ${notesStore.selectedCount} 条摘录，草稿已保留`;
  if (notesAskNoticeTimer) clearTimeout(notesAskNoticeTimer);
  notesAskNoticeTimer = setTimeout(() => {
    notesAskNoticeTimer = null;
    notesAskNotice.value = "";
  }, NOTES_ASK_NOTICE_MS);
}

async function pickFiles(): Promise<void> {
  if (!window.pixApi) return;
  const files = await window.pixApi.selectChatFiles();
  for (const path of files) {
    const name = path.split(/[/\\]/).pop() || path;
    attachments.value.push({ path, name });
  }
}

function removeAttachment(index: number): void {
  attachments.value.splice(index, 1);
}

async function send(): Promise<void> {
  const text = draft.value.trim();
  if ((!text && attachments.value.length === 0 && clipboardImages.value.length === 0) || clarifying.value) return;
  // Snapshot for this send; resetExcludedContexts() swaps in a new Set below.
  const excluded = excludedContexts.value;
  // --- 本轮唯一快照：filePath/page 各只读一次，既作锚点又作 <reading_context> 的实参 ---
  // 锚点登记不受 chip 排除分支约束：排除只影响「注入什么」，不影响「发送时读了哪一篇哪一页」。
  // 锚点与实参共用同一份快照对象：快照里 filePath / page 两个字段各只赋值一次（判定口径见设计档 §7.5 no.2）。
  const readFilePath = readerStore.filePath;
  const readPage = readerStore.page;
  // 发送瞬间的笔记选择集快照（派生结果，新数组）；发送在途的清单/选择变化只影响下一回合，不回溯本次载荷
  // 与「选中文本」同范式：chip 被移除只停用本次注入，不动选择集（设计档 §4 第 3 行）
  const notesSnapshot = excluded.has("notes") ? [] : [...notesStore.selectedNotes];
  const readContext = {
    filePath: readFilePath,
    page: readPage,
    pageCount: readerStore.pageCount,
    selectedText: excluded.has("selection") ? "" : readerStore.selectedText,
    notes: notesSnapshot,
  };
  const anchor: ReadingAnchor | null = readContext.filePath
    ? { docFilePath: readContext.filePath, page: readContext.page }
    : null;
  const filePaths = attachments.value.map((a) => a.path);
  optimisticBlockId.value = sessionStore.appendOptimisticUserMessage(text, filePaths, anchor);
  draft.value = "";
  attachments.value = [];
  const pastedImages = clipboardImages.value;
  clipboardImages.value = [];
  nextTick(() => scrollToEnd());
  try {
    const sendImages = pastedImages.length > 0 ? pastedImages : undefined;
    // Excluding the document chip sends the raw text; excluding the selection
    // chip keeps the document context but drops selectedText.
    const message = excluded.has("document") ? text : buildReadingUserMessage(text, readContext);
    // `message` carries the injected <reading_context>; the bubble shows `text`.
    // While the agent is running, Enter queues a steer instead of a duplicate prompt.
    if (isStreaming.value) {
      await rpc.sendSteer(message, filePaths, sendImages, text);
      return;
    }
    await rpc.sendPrompt(message, filePaths, sendImages, text);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    sessionStore.failOptimisticUserMessage(optimisticBlockId.value, errorMessage);
    if (AUTH_ERROR_PATTERN.test(errorMessage)) {
      sessionStore.appendGuide("auth", AUTH_GUIDE_MESSAGE);
    }
  } finally {
    optimisticBlockId.value = null;
    resetExcludedContexts();
  }
}

async function onPaste(event: ClipboardEvent): Promise<void> {
  const imageFiles = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  if (imageFiles.length === 0) return;
  // Keep the screenshot out of the textarea; it becomes an image attachment.
  event.preventDefault();
  for (const file of imageFiles) {
    if (clipboardImages.value.length >= MAX_PASTED_IMAGES) break;
    const prepared = await preparePastedImage(file);
    if (prepared) {
      clipboardImages.value = [...clipboardImages.value, prepared];
    }
  }
}

function removePastedImage(index: number): void {
  clipboardImages.value = clipboardImages.value.filter((_, i) => i !== index);
}

// --- Region capture: PdfViewer pushes framed screenshots (useRegionCapture seam) ---

function onRegionCapture(image: { mimeType: string; base64: string }): void {
  if (clipboardImages.value.length >= MAX_PASTED_IMAGES) return;
  clipboardImages.value = [...clipboardImages.value, image];
}

// --- Clipboard: async API first, execCommand fallback for denied contexts ---

const COPY_FEEDBACK_MS = 1200;

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

// --- Message copy: hover button on agent bubbles ---

const copiedMessageId = ref<string | null>(null);
let messageCopyTimer: ReturnType<typeof setTimeout> | null = null;

async function copyAgentMessage(block: Extract<DisplayBlock, { type: "agent-message" }>): Promise<void> {
  if (!(await copyToClipboard(block.content))) return;
  copiedMessageId.value = block.id;
  if (messageCopyTimer) clearTimeout(messageCopyTimer);
  messageCopyTimer = setTimeout(() => {
    copiedMessageId.value = null;
    messageCopyTimer = null;
  }, COPY_FEEDBACK_MS);
}

// --- Message action: 存为笔记（入库原文 markdown + 该轮锚点） ---

const ANSWER_FEEDBACK_MS = 2500;

/** 三态原位反馈（不弹对话框）；键 = 回答块 id。 */
type AnswerSaveState = "ok" | "duplicate" | "error";

interface AnswerSaveFeedback {
  state: AnswerSaveState;
  text: string;
}

/** 三分支目标：锚点原值 > 点击时刻的当前阅读位置 > 不可用。 */
interface AnswerSaveTarget {
  docFilePath: string;
  page: number;
  fromAnchor: boolean;
}

/** 每帧每块的解析结果（N49-4）：模板与事件处理器共用同一份，不再各自查一次锚点表。 */
interface AnswerActionView {
  target: AnswerSaveTarget | null;
  title: string;
  disabled: boolean;
}

const ANSWER_SAVE_UNAVAILABLE_TITLE = "无法存为笔记：这条回答没有发送时的文档锚点，且当前没有打开文档";

const answerFeedback = ref<Record<string, AnswerSaveFeedback>>({});
/** 键 = 回答块 id；IPC 在途守卫（同一同步段内连点只发一次）。 */
const answerSavePending = ref<ReadonlySet<string>>(new Set());
const answerFeedbackTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** 反馈文案里的文件名取法：最后一个分隔符之后（与 documentChip 同口径）。 */
function answerDocName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}

/** 空白回答不渲染动作；流式中的半截回答也不入库（判定用块自身的 isStreaming）。 */
function canShowAnswerSave(block: Extract<DisplayBlock, { type: "agent-message" }>): boolean {
  return block.content.trim() !== "" && !block.isStreaming;
}

function buildAnswerActionView(block: Extract<DisplayBlock, { type: "agent-message" }>): AnswerActionView {
  const anchor = sessionStore.readingAnchorFor(block.id);
  const target: AnswerSaveTarget | null = anchor
    ? { docFilePath: anchor.docFilePath, page: anchor.page, fromAnchor: true }
    : readerStore.filePath
      ? { docFilePath: readerStore.filePath, page: readerStore.page, fromAnchor: false }
      : null;
  if (!target) return { target: null, title: ANSWER_SAVE_UNAVAILABLE_TITLE, disabled: true };
  const location = `存为笔记 · ${answerDocName(target.docFilePath)} 第 ${target.page} 页`;
  return {
    target,
    title: target.fromAnchor ? location : `${location}（按当前阅读位置）`,
    disabled: answerSavePending.value.has(block.id),
  };
}

/**
 * 锚点解析单点（N49-4）：每帧每块至多一次；流式中与空白回答不参与解析。
 * 模板与事件处理器一律经下面三个访问器取这份视图。
 */
const answerActionViews = computed<Record<string, AnswerActionView>>(() => {
  const views: Record<string, AnswerActionView> = {};
  for (const block of blocks.value) {
    if (block.type !== "agent-message" || !canShowAnswerSave(block)) continue;
    views[block.id] = buildAnswerActionView(block);
  }
  return views;
});

function answerSaveView(block: Extract<DisplayBlock, { type: "agent-message" }>): AnswerActionView | null {
  return answerActionViews.value[block.id] ?? null;
}

function answerSaveTitle(block: Extract<DisplayBlock, { type: "agent-message" }>): string {
  const view = answerSaveView(block);
  return view ? view.title : ANSWER_SAVE_UNAVAILABLE_TITLE;
}

function answerSaveDisabled(block: Extract<DisplayBlock, { type: "agent-message" }>): boolean {
  const view = answerSaveView(block);
  return view ? view.disabled : true;
}

function answerSaveTarget(block: Extract<DisplayBlock, { type: "agent-message" }>): AnswerSaveTarget | null {
  const view = answerSaveView(block);
  return view ? view.target : null;
}

function showAnswerFeedback(blockId: string, state: AnswerSaveState, text: string): void {
  const timer = answerFeedbackTimers.get(blockId);
  if (timer) clearTimeout(timer);
  answerFeedback.value = { ...answerFeedback.value, [blockId]: { state, text } };
  answerFeedbackTimers.set(
    blockId,
    setTimeout(() => {
      answerFeedbackTimers.delete(blockId);
      const next = { ...answerFeedback.value };
      delete next[blockId];
      answerFeedback.value = next;
    }, ANSWER_FEEDBACK_MS),
  );
}

async function saveAnswerNote(block: Extract<DisplayBlock, { type: "agent-message" }>): Promise<void> {
  // 守卫必须在首个同步段内先判后置：反馈期不渲染按钮，这里只拦 IPC 在途窗口
  if (answerSavePending.value.has(block.id)) return;
  const target = answerSaveTarget(block);
  if (!target) return;
  const pending = new Set(answerSavePending.value);
  pending.add(block.id);
  answerSavePending.value = pending;
  try {
    const result = await notesStore.addNote({
      kind: "answer",
      docFilePath: target.docFilePath,
      page: target.page,
      text: block.content,
    });
    if (!result.ok) {
      showAnswerFeedback(block.id, "error", `保存失败：${result.message}`);
      return;
    }
    if (result.duplicate) {
      showAnswerFeedback(block.id, "duplicate", "已在笔记中");
      return;
    }
    showAnswerFeedback(block.id, "ok", `已存为笔记 · ${answerDocName(target.docFilePath)} 第 ${result.page} 页`);
  } finally {
    const next = new Set(answerSavePending.value);
    next.delete(block.id);
    answerSavePending.value = next;
  }
}

// --- Delegated clicks in .chat-messages: code copy + [[pN]] page-jump badges ---
// v-html re-creates these nodes on every render, so the listener lives on the
// container and feedback uses timers instead of per-button state.

let codeCopyTimer: ReturnType<typeof setTimeout> | null = null;

function resetCodeCopyLabels(): void {
  const root = messagesEl.value;
  if (!root) return;
  for (const btn of root.querySelectorAll<HTMLButtonElement>(".code-copy-btn")) {
    btn.textContent = "复制";
  }
}

async function copyCodeBlock(btn: HTMLButtonElement, code: string): Promise<void> {
  if (!(await copyToClipboard(code))) return;
  btn.textContent = "已复制";
  if (codeCopyTimer) clearTimeout(codeCopyTimer);
  codeCopyTimer = setTimeout(() => {
    codeCopyTimer = null;
    resetCodeCopyLabels();
  }, COPY_FEEDBACK_MS);
}

function jumpToPage(link: HTMLAnchorElement): void {
  // 非 PDF 文档没有页码概念，直接忽略点击。
  if (readerStore.pageCount <= 0) return;
  const page = Number((link.getAttribute("href") ?? "").slice("#pix-page-jump-".length));
  if (!Number.isInteger(page) || page <= 0) return;
  readerStore.gotoPage = page;
}

function onMessagesClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const copyBtn = target.closest(".code-copy-btn");
  if (copyBtn instanceof HTMLButtonElement) {
    const code = copyBtn.closest(".code-block")?.querySelector("pre");
    if (!code) return;
    event.preventDefault();
    void copyCodeBlock(copyBtn, code.textContent ?? "");
    return;
  }
  const pageLink = target.closest('a[href^="#pix-page-jump-"]');
  if (pageLink instanceof HTMLAnchorElement) {
    event.preventDefault();
    jumpToPage(pageLink);
  }
}

// --- Session rename (pane-pill menu -> dialog) ---

const renameDialogOpen = ref(false);
const renameDraft = ref("");
const renameSaving = ref(false);
const canRename = computed(() => !!rpc.sessionState.value?.sessionFile);

function openRenameDialog(): void {
  renameDraft.value = paneTitle.value;
  renameDialogOpen.value = true;
}

async function saveRename(): Promise<void> {
  const name = renameDraft.value.trim();
  if (!name || renameSaving.value) return;
  renameSaving.value = true;
  try {
    await rpc.setSessionName(name);
    renameDialogOpen.value = false;
  } finally {
    renameSaving.value = false;
  }
}

function updateAnswer(value: string): void {
  const q = currentQuestion.value;
  if (q) {
    answerMap.value = { ...answerMap.value, [q.id]: value };
  }
}

function submitClarification(): void {
  const req = props.pendingUserInput;
  const q = currentQuestion.value;
  if (!req || !q) return;
  answerMap.value = { ...answerMap.value, [q.id]: currentAnswer.value.trim() };
  if (currentQuestionIndex.value < req.questions.length - 1) {
    currentQuestionIndex.value++;
    return;
  }
  void window.pixApi.sendCommand({
    type: "respond_user_input",
    response: { id: req.id, answers: { ...answerMap.value } },
  });
  answerMap.value = {};
  currentQuestionIndex.value = 0;
  emit("user-input-done");
}

function cancelClarification(): void {
  const req = props.pendingUserInput;
  if (!req) return;
  void window.pixApi.sendCommand({
    type: "respond_user_input",
    response: { id: req.id, answers: {}, cancelled: true },
  });
  answerMap.value = {};
  currentQuestionIndex.value = 0;
  emit("user-input-done");
}

function blockKey(block: DisplayBlock, index: number): string {
  return `${block.id}-${index}`;
}

// Streaming mutates block.content on every token, and renderMarkdown is O(n)
// per parse — re-parsing the whole text each token is O(n^2) per answer.
// Throttle to ~8 parses/s; the final (non-streaming) pass always renders fresh.
const MD_FLUSH_MS = 120;
const mdTick = ref(0);
const mdCache = new Map<string, { content: string; html: string }>();
let mdFlushTimer: ReturnType<typeof setTimeout> | null = null;

function renderAgentMarkdown(block: Extract<DisplayBlock, { type: "agent-message" }>): string {
  void mdTick.value; // reactive dep so a deferred flush re-renders the bubble
  const cached = mdCache.get(block.id);
  if (cached && cached.content === block.content) return cached.html;
  if (!block.isStreaming || !cached || !mdFlushTimer) {
    const html = renderMarkdown(block.content);
    mdCache.set(block.id, { content: block.content, html });
    if (block.isStreaming && !mdFlushTimer) {
      mdFlushTimer = setTimeout(() => {
        mdFlushTimer = null;
        mdTick.value += 1;
      }, MD_FLUSH_MS);
    }
    if (mdCache.size > 300) {
      const oldest = mdCache.keys().next().value;
      if (oldest !== undefined) mdCache.delete(oldest);
    }
    return html;
  }
  return cached.html;
}

// --- Session deletion (two-step confirm inside the dropdown) ---

const deleteArmedPath = ref<string | null>(null);
let deleteArmTimer: ReturnType<typeof setTimeout> | null = null;

function onDeleteSession(session: SessionInfo): void {
  if (deleteArmedPath.value !== session.path) {
    deleteArmedPath.value = session.path;
    if (deleteArmTimer) clearTimeout(deleteArmTimer);
    deleteArmTimer = setTimeout(() => {
      deleteArmedPath.value = null;
      deleteArmTimer = null;
    }, 3000);
    return;
  }
  if (deleteArmTimer) {
    clearTimeout(deleteArmTimer);
    deleteArmTimer = null;
  }
  deleteArmedPath.value = null;
  emit("delete-session", session);
}

function workElapsedSeconds(block: { timestamp: number; elapsedSeconds?: number }): number {
  if (typeof block.elapsedSeconds === "number") return block.elapsedSeconds;
  void nowTick.value;
  return Math.max(0, Math.floor((Date.now() - block.timestamp) / 1000));
}

function visionStatusLabel(block: Extract<DisplayBlock, { type: "vision-status" }>): string {
  if (block.status === "running") return `视觉模型正在读取 ${block.imageCount} 张图片…`;
  if (block.status === "success") return `视觉模型已读取 ${block.imageCount} 张图片`;
  return "视觉模型读取失败";
}

function compactionLabel(block: Extract<DisplayBlock, { type: "compaction" }>): string {
  const reason = COMPACTION_REASON_LABELS[block.reason] ?? block.reason;
  if (block.aborted) return `上下文压缩已中断（${reason}）`;
  const detail = block.result.trim();
  return detail ? `上下文已压缩（${reason}）：${detail}` : `上下文已压缩（${reason}）`;
}

function retryLabel(block: Extract<DisplayBlock, { type: "retry" }>): string {
  if (block.success) return "重试成功";
  if (block.maxAttempts > 0) return `自动重试 ${block.attempt}/${block.maxAttempts}`;
  return `第 ${block.attempt} 次自动重试仍未成功`;
}

function isActiveSession(session: SessionInfo): boolean {
  return !!props.currentSessionPath && session.path === props.currentSessionPath;
}

function sessionTitle(session: SessionInfo): string {
  return deriveSessionTitle(session);
}

function onSelectSession(session: SessionInfo): void {
  if (isActiveSession(session)) return;
  emit("switch-session", session);
}

onMounted(() => {
  scrollToEnd();
  composerInput.value?.focus();
  registerQuickAskConsumer(onQuickAsk);
  registerNotesAskConsumer(onNotesAsk);
  registerRegionCaptureConsumer(onRegionCapture);
  messagesEl.value?.addEventListener("click", onMessagesClick);
});

onUnmounted(() => {
  registerQuickAskConsumer(null);
  registerNotesAskConsumer(null);
  registerRegionCaptureConsumer(null);
  messagesEl.value?.removeEventListener("click", onMessagesClick);
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
  if (followTimer) {
    clearInterval(followTimer);
    followTimer = null;
  }
  if (mdFlushTimer) {
    clearTimeout(mdFlushTimer);
    mdFlushTimer = null;
  }
  if (deleteArmTimer) {
    clearTimeout(deleteArmTimer);
    deleteArmTimer = null;
  }
  if (messageCopyTimer) {
    clearTimeout(messageCopyTimer);
    messageCopyTimer = null;
  }
  for (const timer of answerFeedbackTimers.values()) clearTimeout(timer);
  answerFeedbackTimers.clear();
  if (codeCopyTimer) {
    clearTimeout(codeCopyTimer);
    codeCopyTimer = null;
  }
  if (notesAskNoticeTimer) {
    clearTimeout(notesAskNoticeTimer);
    notesAskNoticeTimer = null;
  }
});
</script>

<template>
  <div class="chat-panel">
    <div class="chat-header">
      <div class="pane-pill">
        <v-menu location="bottom start" min-width="240" max-width="320" max-height="360">
          <template #activator="{ props: menuProps }">
            <button type="button" class="pill-session" v-bind="menuProps" :title="paneTitle">
              <span class="pill-label">{{ paneTitle }}</span>
              <v-icon size="16">mdi-chevron-down</v-icon>
            </button>
          </template>
          <v-list density="compact">
            <v-list-item
              prepend-icon="mdi-plus"
              title="新对话"
              :disabled="isStreaming"
              @click="emit('new-session')"
            />
            <v-list-item
              prepend-icon="mdi-pencil-outline"
              title="重命名当前对话"
              :disabled="isStreaming || !canRename"
              @click="openRenameDialog"
            />
            <v-divider v-if="historySessions.length > 0" class="session-menu-divider" />
            <v-list-subheader v-if="historySessions.length > 0">历史对话</v-list-subheader>
            <v-list-item
              v-for="session in historySessions"
              :key="session.path"
              :title="sessionTitle(session)"
              :subtitle="formatSessionTime(session.modified)"
              :active="isActiveSession(session)"
              :disabled="isStreaming"
              prepend-icon="mdi-comment-text-outline"
              @click="onSelectSession(session)"
            >
              <template v-if="!isActiveSession(session) && !isStreaming" #append>
                <button
                  type="button"
                  class="session-delete-btn"
                  :class="{ armed: deleteArmedPath === session.path }"
                  :title="deleteArmedPath === session.path ? '再次点击确认删除' : '删除该对话'"
                  @click.stop="onDeleteSession(session)"
                >
                  <v-icon size="14">
                    {{ deleteArmedPath === session.path ? "mdi-alert" : "mdi-trash-can-outline" }}
                  </v-icon>
                </button>
              </template>
            </v-list-item>
            <v-list-item
              v-if="historySessions.length === 0"
              title="暂无历史对话"
              disabled
            />
          </v-list>
        </v-menu>
        <button type="button" class="pill-icon-btn" title="新对话" :disabled="isStreaming" @click="emit('new-session')">
          <v-icon size="16">mdi-plus</v-icon>
        </button>
      </div>
      <div class="header-actions">
        <v-menu
          v-model="modelMenuOpen"
          :close-on-content-click="false"
          location="bottom end"
        >
          <template #activator="{ props: menuProps }">
            <button
              type="button"
              class="header-chip"
              v-bind="menuProps"
              :title="rpc.sessionState.value?.model ? `${rpc.sessionState.value.model.provider}/${rpc.sessionState.value.model.id}` : '选择模型'"
            >
              <v-icon size="14">mdi-brain</v-icon>
              <span>{{ currentModelLabel }}</span>
            </button>
          </template>
          <ModelSelector @close="modelMenuOpen = false" />
        </v-menu>
        <v-menu
          v-model="thinkingMenuOpen"
          :close-on-content-click="false"
          location="bottom end"
        >
          <template #activator="{ props: menuProps }">
            <button type="button" class="header-chip" v-bind="menuProps" title="思考深度">
              <v-icon size="14">mdi-lightbulb-on-outline</v-icon>
              <span>{{ currentThinkingLabel }}</span>
            </button>
          </template>
          <ThinkingSelector @close="thinkingMenuOpen = false" />
        </v-menu>
      </div>
    </div>

    <div ref="messagesEl" class="chat-messages">
      <template v-for="(block, index) in blocks" :key="blockKey(block, index)">
        <MessageBlock
          v-if="block.type === 'user-message'"
          :text="block.text"
          :attachments="block.attachments"
          :timestamp="block.timestamp"
        />
        <div v-else-if="block.type === 'agent-message'" class="agent-message">
          <button
            type="button"
            class="message-copy-btn"
            :class="{ copied: copiedMessageId === block.id }"
            :title="copiedMessageId === block.id ? '已复制' : '复制回答'"
            @click="copyAgentMessage(block)"
          >
            <v-icon size="14">{{ copiedMessageId === block.id ? "mdi-check" : "mdi-content-copy" }}</v-icon>
            <span v-if="copiedMessageId === block.id">已复制</span>
          </button>
          <!-- title 挂在容器上：禁用控件在 Chromium 下不派发鼠标事件，提示会拿不到 -->
          <span
            v-if="canShowAnswerSave(block)"
            class="answer-save-wrap"
            :class="{ 'has-feedback': !!answerFeedback[block.id] }"
            :title="answerSaveTitle(block)"
          >
            <button
              v-if="!answerFeedback[block.id]"
              type="button"
              class="answer-save-btn"
              :disabled="answerSaveDisabled(block)"
              @click="saveAnswerNote(block)"
            >
              存为笔记
            </button>
            <span v-else class="answer-note-feedback" :data-state="answerFeedback[block.id].state">
              {{ answerFeedback[block.id].text }}
            </span>
          </span>
          <!-- eslint-disable-next-line vue/no-v-html — markdown is sanitized by renderMarkdown -->
          <div class="agent-markdown" v-html="renderAgentMarkdown(block)" />
        </div>
        <div v-else-if="block.type === 'work-status'" class="work-status">
          <v-expansion-panels class="work-status-panels">
            <v-expansion-panel>
              <v-expansion-panel-title class="work-status-title">
                <span class="work-status-label">已处理 {{ workElapsedSeconds(block) }}s</span>
                <span v-if="block.isStreaming" class="spinner work-status-spinner" />
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <ToolExecutionBlock
                  v-for="tool in block.tools"
                  :key="tool.toolCallId"
                  :tool-name="tool.toolName"
                  :args="tool.args"
                  :result="tool.result"
                  :is-error="tool.isError"
                  :is-streaming="block.isStreaming && tool.result === null"
                  :timestamp="block.timestamp"
                />
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>
        <div v-else-if="block.type === 'thinking'" class="work-status">
          <v-expansion-panels class="work-status-panels">
            <v-expansion-panel>
              <v-expansion-panel-title class="work-status-title">
                <span class="work-status-label">已处理 {{ workElapsedSeconds(block) }}s</span>
                <span class="spinner work-status-spinner" />
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <div class="thinking-row">
                  <v-icon size="14">mdi-weather-night</v-icon>
                  <span>思考中…</span>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>
        <div v-else-if="block.type === 'vision-status'" class="note-row">
          {{ visionStatusLabel(block) }}
        </div>
        <ErrorBlock v-else-if="block.type === 'error'" :message="block.message" :source="block.source" />
        <GuideBlock v-else-if="block.type === 'guide'" :message="block.message" @open-settings="openSettings" />
        <div v-else-if="block.type === 'compaction'" class="note-row">
          {{ compactionLabel(block) }}
        </div>
        <div v-else-if="block.type === 'retry'" class="note-row">
          {{ retryLabel(block) }}
        </div>
        <div v-else-if="block.type === 'note'" class="note-row">{{ block.text }}</div>
        <div v-else-if="block.type === 'turn-separator'" class="turn-separator" />
      </template>

      <div v-if="blocks.length === 0" class="chat-empty">
        <v-icon size="40" class="empty-icon">mdi-creation-outline</v-icon>
        <p class="empty-title">新对话</p>
        <p class="empty-subtitle">输入消息即可新建或继续对话；提问会自动附带当前文档与页码。</p>
      </div>
    </div>

    <div class="composer">
      <ClarificationCard
        v-if="clarifying && currentQuestion"
        :question="currentQuestion"
        :question-index="currentQuestionIndex"
        :total-questions="pendingUserInput?.questions.length ?? 0"
        :answer="currentAnswer"
        @update:answer="updateAnswer"
        @next="submitClarification"
        @cancel="cancelClarification"
      />

      <div v-if="contextChips.length > 0" class="context-row">
        <span v-for="chip in contextChips" :key="chip.kind" class="context-chip" :title="chip.title">
          <v-icon size="12" class="context-chip-icon">{{ chip.icon }}</v-icon>
          <span class="context-chip-label">{{ chip.label }}</span>
          <button class="context-chip-remove" title="本次发送不使用" @click="excludeContext(chip.kind)">×</button>
        </span>
      </div>

      <div v-if="notesAskNotice" class="notes-ask-notice">{{ notesAskNotice }}</div>

      <div v-if="attachments.length > 0 || clipboardImages.length > 0" class="attachment-row">
        <span v-for="(attachment, index) in attachments" :key="attachment.path" class="attachment-chip">
          {{ attachment.name }}
          <button class="attachment-remove" title="移除" @click="removeAttachment(index)">×</button>
        </span>
        <span v-for="(_, index) in clipboardImages" :key="`paste-${index}`" class="attachment-chip">
          截图 {{ index + 1 }}
          <button class="attachment-remove" title="移除" @click="removePastedImage(index)">×</button>
        </span>
      </div>

      <div class="composer-box">
        <button class="composer-tool" title="添加附件" @click="pickFiles">
          <v-icon size="18">mdi-plus</v-icon>
        </button>
        <InputArea
          ref="composerInput"
          v-model="draft"
          class="composer-input"
          placeholder="向 PiX-Read 提问，可直接粘贴截图"
          :disabled="clarifying"
          @paste="onPaste"
          @update:model-value="updateDraft"
          @send="send"
        />
        <button
          v-if="!isStreaming"
          class="composer-send"
          :disabled="!draft.trim() && attachments.length === 0 && clipboardImages.length === 0"
          title="发送"
          @click="send"
        >
          <v-icon size="18">mdi-arrow-up</v-icon>
        </button>
        <button v-else class="composer-stop" title="停止" @click="rpc.abort()">
          <v-icon size="18">mdi-stop</v-icon>
        </button>
      </div>

      <div v-if="usageMeta" class="composer-meta">
        <span>{{ usageMeta.left }}</span>
        <span v-if="usageMeta.right">{{ usageMeta.right }}</span>
      </div>
    </div>

    <v-dialog v-model="renameDialogOpen" max-width="360">
      <v-card>
        <v-card-title class="rename-dialog-title">重命名当前对话</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="renameDraft"
            label="对话名称"
            autofocus
            :disabled="renameSaving"
            @keydown.enter="saveRename"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="renameSaving" @click="renameDialogOpen = false">取消</v-btn>
          <v-btn
            variant="tonal"
            color="primary"
            :loading="renameSaving"
            :disabled="!renameDraft.trim()"
            @click="saveRename"
          >
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.chat-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 8px;
  padding: 8px 10px 0;
  flex-shrink: 0;
  min-width: 0;
}

.pane-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: min(100%, 200px);
  height: var(--pix-pane-pill-height);
  padding: 0 6px 0 10px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: var(--pix-pane-pill-radius);
  background: var(--pix-bg-elevated, #ffffff);
  box-shadow: var(--pix-shadow-xs);
  flex: 1 1 auto;
  min-width: 0;
}

.pill-session {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--pix-text-primary);
  padding: 0;
}

.pill-label {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1;
}

.pill-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--pix-text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}

.pill-icon-btn:hover,
.pill-session:hover {
  color: var(--pix-text-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 auto;
  min-width: 0;
}

.header-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 999px;
  background: transparent;
  font-size: 11px;
  color: var(--pix-text-secondary);
  cursor: pointer;
  max-width: 110px;
  min-width: 0;
}

.header-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-chip:hover {
  background: var(--pix-bg-hover, #eef2f6);
}

.session-menu-divider {
  margin: 4px 0;
}

.session-delete-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--pix-text-muted, #8a959e);
  cursor: pointer;
}

.session-delete-btn:hover,
.session-delete-btn.armed {
  background: var(--pix-bg-hover, #eef2f6);
  color: var(--pix-error, #b75a55);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agent-message {
  position: relative;
  align-self: stretch;
  max-width: 100%;
}

.message-copy-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 6px;
  background: var(--pix-bg-elevated, #ffffff);
  color: var(--pix-text-secondary);
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.agent-message:hover .message-copy-btn,
.message-copy-btn.copied {
  opacity: 1;
}

.message-copy-btn.copied {
  color: var(--pix-accent, #31424f);
}

/* 复制按钮最宽态（图标 14 + 间距 4 +「已复制」≈33 + 内边距 12 + 边框 2 ≈ 65px）之外；冻结值。 */
.answer-save-wrap {
  position: absolute;
  top: 2px;
  right: 80px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.agent-message:hover .answer-save-wrap,
.answer-save-wrap.has-feedback {
  opacity: 1;
}

.answer-save-btn {
  padding: 2px 6px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 6px;
  background: var(--pix-bg-elevated, #ffffff);
  color: var(--pix-text-secondary);
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
}

.answer-save-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.answer-note-feedback {
  padding: 2px 6px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 6px;
  background: var(--pix-bg-elevated, #ffffff);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
}

.answer-note-feedback[data-state="ok"] {
  color: var(--pix-success, #3f855f);
}

.answer-note-feedback[data-state="duplicate"] {
  color: var(--pix-text-secondary, #52606d);
}

.answer-note-feedback[data-state="error"] {
  color: var(--pix-error, #b75a55);
}

.agent-markdown {
  font-size: 14px;
  line-height: 1.65;
  color: var(--pix-text-primary);
  overflow-wrap: break-word;
}

.agent-markdown :deep(p) {
  margin: 0 0 0.6em;
}

.agent-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.agent-markdown :deep(pre) {
  padding: 10px;
  border-radius: 8px;
  background: var(--pix-bg-code, #f4f6f9);
  overflow-x: auto;
  font-size: 13px;
}

.agent-markdown :deep(.code-block) {
  margin: 0.6em 0;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 8px;
  background: var(--pix-bg-code, #f4f6f9);
  overflow: hidden;
}

.agent-markdown :deep(.code-block-bar) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 6px 3px 10px;
  border-bottom: 1px solid var(--pix-border-light, #e3eaf0);
  background: var(--pix-bg-subtle, #f7f9fb);
}

.agent-markdown :deep(.code-lang) {
  font-size: 11px;
  color: var(--pix-text-muted);
  font-family: var(--pix-font-mono, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-markdown :deep(.code-copy-btn) {
  flex-shrink: 0;
  padding: 2px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--pix-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.agent-markdown :deep(.code-copy-btn:hover) {
  background: var(--pix-bg-hover, #eef2f6);
  color: var(--pix-text-primary);
}

.agent-markdown :deep(.code-block pre) {
  margin: 0;
  border-radius: 0;
  background: transparent;
}

.agent-markdown :deep(code) {
  font-family: var(--pix-font-mono, monospace);
}

.agent-markdown :deep(a[href^="#pix-page-jump-"]) {
  display: inline-block;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--pix-accent, #31424f);
  color: #ffffff;
  font-size: 12px;
  line-height: 18px;
  text-decoration: none;
  cursor: pointer;
  vertical-align: 1px;
}

.agent-markdown :deep(a[href^="#pix-page-jump-"]:hover) {
  background: #22303c;
}

.agent-markdown :deep(ul),
.agent-markdown :deep(ol) {
  margin: 0.4em 0 0.6em;
  padding-left: 1.3em;
}

.agent-markdown :deep(blockquote) {
  margin: 0.6em 0;
  padding: 0.2em 1em;
  border-left: 3px solid var(--pix-border-light, #e3eaf0);
  color: var(--pix-text-secondary);
}

.agent-markdown :deep(a) {
  color: var(--pix-accent, #31424f);
}

.work-status {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.work-status-panels {
  flex: 1;
}

.work-status-panels :deep(.v-expansion-panel) {
  background: transparent;
}

.work-status-panels :deep(.v-expansion-panel-title) {
  min-height: 32px;
  padding: 0 8px;
}

.work-status-panels :deep(.v-expansion-panel-text__wrapper) {
  padding: 0 4px 8px;
}

.work-status-title {
  min-height: 32px;
  font-size: 12px;
  color: var(--pix-text-secondary);
}

.work-status-label {
  font-size: 12px;
  color: var(--pix-text-secondary);
}

.work-status-spinner {
  margin-left: 8px;
}

.thinking-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--pix-text-muted);
}

.note-row {
  font-size: 12px;
  color: var(--pix-text-muted);
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--pix-bg-code, #f4f6f9);
}

.turn-separator {
  height: 1px;
  background: var(--pix-border-light, #e3eaf0);
  margin: 4px 0;
}

.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  padding: 24px;
}

.empty-icon {
  color: var(--pix-text-muted);
}

.empty-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--pix-text-primary);
}

.empty-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--pix-text-muted);
}

.composer {
  padding: 8px 10px 10px;
  border-top: 1px solid var(--pix-border-light, #e3eaf0);
}

.context-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

/* 草稿保护提示行（R8 设计档 §1.5）：位于 .context-row 与 .attachment-row 之间，2500ms 后自行消失 */
.notes-ask-notice {
  margin-bottom: 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--pix-text-secondary);
}

.context-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--pix-bg-code, #f4f6f9);
  color: var(--pix-text-secondary);
  max-width: 100%;
}

.context-chip-icon {
  flex-shrink: 0;
  color: var(--pix-text-muted);
}

.context-chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-chip-remove {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--pix-text-muted);
  padding: 0;
  flex-shrink: 0;
}

.context-chip-remove:hover {
  color: var(--pix-text-primary);
}

.attachment-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--pix-bg-code, #f4f6f9);
  color: var(--pix-text-secondary);
}

.attachment-remove {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--pix-text-muted);
  padding: 0;
}

.composer-box {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--pix-border, #d5dfe8);
  border-radius: 14px;
  background: var(--pix-bg-input, #ffffff);
}

.composer-tool,
.composer-send,
.composer-stop {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  background: transparent;
  color: var(--pix-text-secondary);
  flex-shrink: 0;
}

.composer-send {
  background: var(--pix-accent, #31424f);
  color: #ffffff;
}

.composer-send:disabled {
  opacity: 0.4;
  cursor: default;
}

.composer-stop {
  background: var(--pix-error, #b75a55);
  color: #ffffff;
}

.composer-input {
  border: none !important;
  background: transparent !important;
  padding: 6px 2px !important;
}

.composer-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 4px 0;
  font-size: 12px;
  color: var(--pix-text-muted);
}

.rename-dialog-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--pix-text-primary);
}
</style>
