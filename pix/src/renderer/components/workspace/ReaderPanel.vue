<script setup lang="ts">
/**
 * ReaderPanel — center pane of the reading workspace.
 *
 * Markdown/text files are rendered inline. PDFs open in PdfViewer.
 * The pill's map icon toggles the PDF outline knowledge map in the left slot;
 * the slot only renders while the stage is wide enough to keep a usable page.
 * PdfSelectionQuickAsk floats "问 AI" over the stage selection.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { renderMarkdown } from "../../utils/markdown";
import { useProjectStore } from "../../stores/project-store";
import { useReaderStore } from "../../stores/reader-store";
import { useReaderStateStore } from "../../stores/reader-state-store";
import { absoluteDocPath, docDisplayName, docPathKey } from "../../utils/notes-path";
import { formatSessionTime } from "../../utils/session-title";
import {
  failureFromIpcError,
  libraryReadFailureMessage,
  preflightLibraryPath,
  technicalDetail,
} from "../../utils/reading-context";
import type { LibraryReadFailure } from "../../utils/reading-context";
import PdfViewer from "./PdfViewer.vue";
import KnowledgeMap from "./KnowledgeMap.vue";
import PdfSelectionQuickAsk from "./PdfSelectionQuickAsk.vue";
import ShortcutOverview from "./ShortcutOverview.vue";

/** Knowledge map needs this much stage width, otherwise the page column loses it. */
const MIN_STAGE_WIDTH_FOR_MAP = 620;

const props = defineProps<{
  filePath: string | null;
}>();

const emit = defineEmits<{
  "open-document": [path: string];
  "open-session": [path: string];
}>();

const readerStore = useReaderStore();
const readerStateStore = useReaderStateStore();
const projectStore = useProjectStore();
const pdfViewer = ref<InstanceType<typeof PdfViewer> | null>(null);
const mapToggleReady = ref(false);

const content = ref<string>("");
const truncated = ref(false);
const failure = ref<LibraryReadFailure | null>(null);
const failureDetail = ref("");
const isLoading = ref(false);
const readerStage = ref<HTMLElement | null>(null);
const stageWidth = ref(0);
let stageObserver: ResizeObserver | null = null;
let textLoadToken = 0;

const TEXT_EXTENSIONS = /\.(md|markdown|txt|json|jsonl|csv|ts|js|vue|css|html|py|rs|go|java|c|cpp|h|sh|ya?ml|toml|ini)$/i;

const isTextFile = computed(() => !!props.filePath && TEXT_EXTENSIONS.test(props.filePath));
const isMarkdown = computed(() => !!props.filePath && /\.(md|markdown)$/i.test(props.filePath));
const isPdf = computed(() => !!props.filePath && /\.pdf$/i.test(props.filePath));
const fileName = computed(() => props.filePath?.split(/[/\\]/).pop() ?? "");
const failureMessage = computed(() => (failure.value ? libraryReadFailureMessage(failure.value) : ""));
const mapFits = computed(() => stageWidth.value >= MIN_STAGE_WIDTH_FOR_MAP);
const showMap = computed(() => readerStore.mapOpen && isPdf.value && mapFits.value);
/** 续读入口：status 未加载完不渲染（不出现「无页码的半截入口」），无记录同理。 */
const resumeEntry = computed(() => {
  const last = readerStateStore.lastDoc;
  if (!readerStateStore.ready || !last) return null;
  return {
    path: absoluteDocPath(projectStore.currentProject?.path ?? "", last.docPath),
    name: docDisplayName(last.docPath),
    page: last.page,
  };
});

/** R18：入口载荷（四闸全过才有值）；记录会话即当前活动会话 ⇒ 隐藏（避免死路点击）。 */
const discussEntry = computed(() => {
  const link = readerStateStore.currentDiscussion;
  if (!link) return null;
  if (docPathKey(link.sessionPath) === docPathKey(projectStore.currentSession?.path ?? "")) return null;
  return { path: link.sessionPath, title: link.title, time: formatSessionTime(link.at) };
});

/** R18：入口文本与 tooltip 的唯一复用串（文本逐字 `继续讨论：{title} · {time}`）。 */
const discussLabel = computed(() =>
  discussEntry.value ? `继续讨论：${discussEntry.value.title} · ${discussEntry.value.time}` : "",
);

const renderedHtml = computed(() => {
  if (!isTextFile.value || !content.value) return "";
  return isMarkdown.value
    ? renderMarkdown(content.value)
    : `<pre>${escapeText(content.value)}</pre>`;
});

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function setFailure(next: LibraryReadFailure, detail: string): void {
  failure.value = next;
  failureDetail.value = detail;
}

async function loadTextFile(path: string): Promise<void> {
  const token = ++textLoadToken;
  isLoading.value = true;
  try {
    const libraryRoot = projectStore.currentProject?.path ?? "";
    const preflightFailure = preflightLibraryPath(path, libraryRoot);
    if (preflightFailure) {
      setFailure(preflightFailure, `资料库根目录：${libraryRoot || "未选择"}`);
      return;
    }
    const result = await window.pixApi.libraryReadText(path);
    if (token !== textLoadToken) return;
    if (result.success && result.content !== undefined) {
      content.value = result.content;
      truncated.value = !!result.truncated;
    } else {
      setFailure(failureFromIpcError(result.error), result.error || "主进程未返回文件内容");
    }
  } catch (err) {
    if (token !== textLoadToken) return;
    setFailure("read-failed", technicalDetail(err));
    console.error("[reader-panel] Failed to read text file", path, err);
  } finally {
    if (token === textLoadToken) isLoading.value = false;
  }
}

function retryTextLoad(): void {
  if (!props.filePath) return;
  content.value = "";
  truncated.value = false;
  failure.value = null;
  failureDetail.value = "";
  void loadTextFile(props.filePath);
}

watch(
  () => props.filePath,
  async (path) => {
    // 安全点 a：文档切换（PDF→PDF / PDF→文本 / 文档→空态）前先把上一篇的现场落盘，
    // 必须早于 openDocument 的复位（复位会把页码置 1 并清空 pageCount）
    readerStateStore.flush();
    readerStore.openDocument(path);
    content.value = "";
    truncated.value = false;
    failure.value = null;
    failureDetail.value = "";
    if (!path || !isTextFile.value) return;
    await loadTextFile(path);
  },
  { immediate: true },
);

async function openExternal(): Promise<void> {
  if (props.filePath) {
    await window.pixApi.libraryOpenPath(props.filePath);
  }
}

function openResumeEntry(): void {
  if (!resumeEntry.value) return;
  emit("open-document", resumeEntry.value.path);
}

/** R18：入口点击只发一个 emit（载荷 = 会话文件绝对路径）；切换链路全部在 WorkspacePage。 */
function openDiscussion(): void {
  if (!discussEntry.value) return;
  emit("open-session", discussEntry.value.path);
}

function toggleKnowledgeMap(): void {
  readerStore.setMapOpen(!readerStore.mapOpen);
}

onMounted(() => {
  mapToggleReady.value = !!document.querySelector(".center-pill");
  const stage = readerStage.value;
  if (!stage || typeof ResizeObserver === "undefined") return;
  stageWidth.value = stage.clientWidth;
  stageObserver = new ResizeObserver((entries) => {
    for (const entry of entries) stageWidth.value = entry.contentRect.width;
  });
  stageObserver.observe(stage);
});

onBeforeUnmount(() => {
  stageObserver?.disconnect();
  stageObserver = null;
});
</script>

<template>
  <div class="reader-panel">
    <div class="reader-header">
      <v-icon size="16" class="header-icon">
        {{ fileName ? "mdi-file-document-outline" : "mdi-book-open-outline" }}
      </v-icon>
      <span class="reader-title">{{ fileName || "阅读区" }}</span>
      <v-btn
        v-if="filePath"
        icon="mdi-open-in-new"
        size="x-small"
        variant="text"
        title="用系统应用打开"
        @click="openExternal"
      />
    </div>

    <Teleport v-if="mapToggleReady && isPdf" to=".center-pill">
      <button
        type="button"
        class="map-toggle"
        :class="{ active: showMap }"
        :title="mapFits ? '知识地图（书签目录）' : '阅读区宽度不足，无法显示知识地图'"
        :aria-pressed="showMap"
        :disabled="!mapFits"
        @click="toggleKnowledgeMap"
      >
        <v-icon size="14">mdi-map-outline</v-icon>
      </button>
    </Teleport>

    <Teleport v-if="mapToggleReady && discussEntry" to=".center-pill">
      <button type="button" class="reader-discuss" :title="`${discussLabel}；点击打开该会话`" @click="openDiscussion">
        <v-icon size="14">mdi-forum-outline</v-icon>
        <span class="reader-discuss-text">{{ discussLabel }}</span>
      </button>
    </Teleport>

    <div ref="readerStage" class="reader-stage">
      <aside v-if="showMap" class="knowledge-map-slot">
        <KnowledgeMap />
      </aside>

      <div class="reader-main">
        <div v-if="!filePath" class="reader-empty">
          <v-icon size="48" class="empty-icon">mdi-book-open-page-variant-outline</v-icon>
          <p class="empty-title">选择左侧文件开始阅读</p>
          <p class="empty-subtitle">支持 PDF 连续阅读、Markdown 与文本预览</p>
          <button v-if="resumeEntry" type="button" class="reader-resume" @click="openResumeEntry">
            <v-icon size="15">mdi-history</v-icon>
            继续阅读：{{ resumeEntry.name }} · 第 {{ resumeEntry.page }} 页
          </button>
        </div>

        <div v-else-if="isPdf && filePath" class="reader-pdf">
          <PdfViewer ref="pdfViewer" :file-path="filePath" />
        </div>

        <div v-else-if="isLoading" class="reader-empty">
          <v-progress-circular indeterminate size="28" />
        </div>

        <div v-else-if="!isTextFile" class="reader-empty">
          <v-icon size="48" class="empty-icon">mdi-file-find-outline</v-icon>
          <p class="empty-title">{{ fileName }}</p>
          <p class="empty-subtitle">该格式暂不支持内嵌预览，可使用系统应用打开</p>
          <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-open-in-new" @click="openExternal">
            打开文件
          </v-btn>
        </div>

        <div v-else-if="failure" class="reader-empty reader-empty-error">
          <v-icon size="48" class="empty-icon">
            {{ failure === "no-library-root" ? "mdi-folder-key-outline" : "mdi-alert-circle-outline" }}
          </v-icon>
          <p class="empty-title">{{ failureMessage }}</p>
          <p v-if="failureDetail" class="empty-detail">{{ failureDetail }}</p>
          <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-refresh" @click="retryTextLoad">
            重试
          </v-btn>
        </div>

        <div v-else class="reader-content">
          <div v-if="truncated" class="truncate-hint">文件过大，仅显示前 2 MB 内容</div>
          <!-- eslint-disable-next-line vue/no-v-html — markdown is sanitized by renderMarkdown -->
          <div class="reader-body" v-html="renderedHtml" />
        </div>
      </div>
    </div>

    <PdfSelectionQuickAsk />
    <ShortcutOverview />
  </div>
</template>

<style scoped>
.reader-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.reader-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 6px;
}

.header-icon {
  color: var(--pix-text-secondary);
}

.reader-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: var(--pix-text-primary);
}

.reader-stage {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
}

/* Shrinkable with a real min-width 0 so a narrow center pane hides the map instead of crushing the page. */
.knowledge-map-slot {
  display: flex;
  flex-direction: column;
  flex: 0 1 26%;
  min-width: 0;
  max-width: 240px;
  overflow: hidden;
  border-right: 1px solid var(--pix-border-light, #e3eaf0);
  background: var(--pix-bg-subtle, #f7f9fb);
}

.map-toggle {
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
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  font-family: var(--pix-font-ui);
}

.map-toggle:hover {
  background: var(--pix-bg-hover, #eef2f6);
  color: var(--pix-text-primary);
}

.map-toggle.active {
  background: var(--pix-accent, #31424f);
  color: #ffffff;
}

.map-toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.reader-discuss {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 240px;
  margin-left: 2px;
  padding: 1px 8px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 999px;
  background: var(--pix-bg-elevated, #ffffff);
  color: var(--pix-text-secondary);
  font-family: var(--pix-font-ui);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
}

.reader-discuss-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reader-discuss:hover {
  background: var(--pix-bg-hover, #eef2f6);
  color: var(--pix-text-primary);
}

.reader-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.reader-pdf {
  flex: 1;
  min-height: 0;
}

.reader-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
}

.empty-icon {
  color: var(--pix-text-muted);
}

.empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--pix-text-primary);
}

.reader-resume {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  margin-top: 2px;
  padding: 6px 12px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 999px;
  background: var(--pix-bg-elevated, #ffffff);
  box-shadow: var(--pix-shadow-xs);
  color: var(--pix-text-secondary);
  font-family: var(--pix-font-ui);
  font-size: 12px;
  cursor: pointer;
}

.reader-resume:hover {
  background: var(--pix-bg-hover, #eef2f6);
  color: var(--pix-text-primary);
}

.empty-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--pix-text-muted);
  max-width: 320px;
}

.empty-detail {
  max-width: 360px;
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--pix-text-muted);
  word-break: break-word;
}

.reader-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 28px 32px;
}

.truncate-hint {
  padding: 8px 10px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: var(--pix-bg-code, #f4f6f9);
  color: var(--pix-text-secondary);
  font-size: 12px;
}

.reader-body {
  max-width: 860px;
  margin: 0 auto;
  font-size: 14px;
  line-height: 1.7;
  color: var(--pix-text-primary);
  overflow-wrap: break-word;
}

.reader-body :deep(h1),
.reader-body :deep(h2),
.reader-body :deep(h3) {
  margin: 1.2em 0 0.5em;
  line-height: 1.3;
}

.reader-body :deep(pre) {
  padding: 12px;
  border-radius: 8px;
  background: var(--pix-bg-code, #f4f6f9);
  overflow-x: auto;
  font-size: 13px;
}

.reader-body :deep(code) {
  font-family: var(--pix-font-mono, monospace);
}

.reader-body :deep(img) {
  max-width: 100%;
}

.reader-body :deep(blockquote) {
  margin: 0.6em 0;
  padding: 0.2em 1em;
  border-left: 3px solid var(--pix-border-light, #e3eaf0);
  color: var(--pix-text-secondary);
}

.reader-body :deep(a) {
  color: var(--pix-accent, #31424f);
}
</style>
