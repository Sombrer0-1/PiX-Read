<script setup lang="ts">
/**
 * Workspace Page — the three-pane reading workspace.
 *
 * ┌──────────┬──────────────────────┬────────────┐
 * │ Library  │ Reader               │ Chat       │
 * │ 资料库    │ 阅读区                │ Agent 对话  │
 * └──────────┴──────────────────────┴────────────┘
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "../stores/session-store";
import { useReaderStore } from "../stores/reader-store";
import { useProjectStore } from "../stores/project-store";
import { useNotesStore } from "../stores/notes-store";
import { useReaderStateStore } from "../stores/reader-state-store";
import { useRpc } from "../composables/useRpc";
import AppLayout from "../components/layout/AppLayout.vue";
import LibraryPanel from "../components/workspace/LibraryPanel.vue";
import NotesPanel from "../components/workspace/NotesPanel.vue";
import ReaderPanel from "../components/workspace/ReaderPanel.vue";
import ChatPanel from "../components/workspace/ChatPanel.vue";
import type { AgentMessage, RequestUserInputRequest } from "@/types/rpc";
import type { SessionInfo } from "@/types/session";
import type { ReaderNote } from "@shared/types";
import { deriveSessionTitle } from "../utils/session-title";
import { absoluteDocPath, docPathKey } from "../utils/notes-path";

const router = useRouter();
const sessionStore = useSessionStore();
const readerStore = useReaderStore();
const projectStore = useProjectStore();
const notesStore = useNotesStore();
const readerStateStore = useReaderStateStore();
const rpc = useRpc();

const selectedFilePath = ref<string | null>(null);
const pendingUserInput = ref<RequestUserInputRequest | null>(null);
const leftCollapsed = ref(false);
/** 左栏双标签：资料库文件树 / 笔记面板（两个面板都常挂载，切标签不丢展开态）。 */
const leftTab = ref<"library" | "notes">("library");

let unsubscribeEvent: (() => void) | null = null;
let unsubscribeUserInput: (() => void) | null = null;
/** 卸载标志：onMounted 的 await 继续体在页面已卸载后不得再往 window 上挂订阅（迟到注册泄漏）。 */
let disposed = false;

const rootDir = computed(() => projectStore.currentProject?.path ?? "");
const currentSessionPath = computed(() => projectStore.currentSession?.path);
const selectedFileName = computed(() => selectedFilePath.value?.split(/[/\\]/).pop() ?? "");
const noteTabLabel = computed(() => (notesStore.totalCount > 0 ? `笔记 ${notesStore.totalCount}` : "笔记"));
const currentSessionTitle = computed(() => {
  const named = rpc.sessionState.value?.sessionName?.trim();
  if (named) return named;
  return deriveSessionTitle(projectStore.currentSession);
});

async function syncWorkspaceState(options: { loadMessagesIfEmpty?: boolean } = {}): Promise<void> {
  await rpc.refreshState();
  await rpc.refreshModels();
  await rpc.refreshSessionStats();
  await projectStore.listSessions();
  projectStore.syncCurrentSession(
    rpc.sessionState.value?.sessionFile,
    rpc.sessionState.value?.sessionId,
  );

  if (options.loadMessagesIfEmpty && sessionStore.displayBlocks.length === 0) {
    const messages = await rpc.getMessages();
    if (Array.isArray(messages) && messages.length > 0) {
      sessionStore.loadMessages(messages as AgentMessage[]);
    }
  }
}

onMounted(async () => {
  if (!projectStore.currentProject) {
    router.push("/");
    return;
  }

  if (!rpc.isConnected.value) {
    const started = await rpc.startSession(projectStore.currentProject.path);
    if (disposed) return;
    if (!started) {
      const error = encodeURIComponent(rpc.lastError.value || "工作区启动失败");
      router.push({ path: "/", query: { error } });
      return;
    }
    const newSessionResult = await rpc.newSession();
    if (disposed) return;
    if (!newSessionResult || newSessionResult.cancelled === true) {
      const error = encodeURIComponent(rpc.lastError.value || "新建对话失败");
      router.push({ path: "/", query: { error } });
      return;
    }
  }

  await syncWorkspaceState({ loadMessagesIfEmpty: true });
  if (disposed) return;

  // 跨工作区残留防护：先清空本地状态，再读当前工作区的笔记与阅读现场
  notesStore.resetNotes();
  await notesStore.loadNotes();
  if (disposed) return;
  readerStateStore.resetState();
  await readerStateStore.loadReaderState();
  if (disposed) return;
  // 安全点 d：监听生命周期与工作区页面严格对齐；窗口可能只是被隐藏，所以只 flush 不 reset
  document.addEventListener("visibilitychange", onDocumentVisibilityChange);
  window.addEventListener("pagehide", onWindowPageHide);

  unsubscribeEvent = window.pixApi.onAgentEvent((event) => {
    sessionStore.addEvent(event);
    // A new agent turn started; any stale clarification request is obsolete.
    if (event.type === "agent_start" && pendingUserInput.value) {
      pendingUserInput.value = null;
    }
    const shouldRefreshSessions =
      event.type === "agent_start" ||
      event.type === "agent_end" ||
      event.type === "session_info_changed" ||
      (event.type === "message_end" && event.message.role === "user");
    if (shouldRefreshSessions) {
      void syncWorkspaceState();
    }
  });

  unsubscribeUserInput = window.pixApi.onUserInputRequest((request) => {
    pendingUserInput.value = request;
  });
});

onUnmounted(() => {
  disposed = true;
  // 安全点 c：顺序固定 flush → resetState（resetState 会清掉快照，反了会丢最后一次现场）
  readerStateStore.flush();
  document.removeEventListener("visibilitychange", onDocumentVisibilityChange);
  window.removeEventListener("pagehide", onWindowPageHide);
  unsubscribeEvent?.();
  unsubscribeEvent = null;
  unsubscribeUserInput?.();
  unsubscribeUserInput = null;
  readerStateStore.resetState();
  notesStore.resetNotes();
});

function onDocumentVisibilityChange(): void {
  if (document.hidden === true) readerStateStore.flush();
}

function onWindowPageHide(): void {
  readerStateStore.flush();
}

function onUserInputDone(): void {
  pendingUserInput.value = null;
}

async function onNewSession(): Promise<void> {
  sessionStore.clearSession();
  pendingUserInput.value = null;
  const result = await rpc.newSession();
  if (!result || result.cancelled === true) {
    sessionStore.appendError("新建对话失败，请重试", "system");
  }
  await syncWorkspaceState();
}

async function onSwitchSession(session: SessionInfo): Promise<void> {
  sessionStore.clearSession();
  pendingUserInput.value = null;
  await rpc.switchSession(session.path);
  projectStore.setCurrentSession(session);
  await syncWorkspaceState({ loadMessagesIfEmpty: true });
}

async function onDeleteSession(session: SessionInfo): Promise<void> {
  // The active conversation's file belongs to the running session; only
  // history entries expose the delete action, so this is a belt-and-braces guard.
  if (sessionStore.isStreaming || session.path === currentSessionPath.value) return;
  const result = await window.pixApi.deleteSession(session.path, projectStore.currentProject?.path);
  if (!result.success) {
    sessionStore.appendError(`删除对话失败：${result.error ?? "未知错误"}`, "system");
    return;
  }
  if (projectStore.currentSession?.path === session.path) {
    projectStore.setCurrentSession(null);
  }
  await projectStore.listSessions();
}

function onSelectFile(path: string): void {
  openDocumentFromLibrary(path);
}

/** 树行与续读入口共用的打开路径：同一性判定用比较键，命中才登记现场恢复意图。 */
function openDocumentFromLibrary(path: string): void {
  if (docPathKey(selectedFilePath.value ?? "") === docPathKey(path)) return;
  readerStateStore.requestRestoreFor(path);
  selectedFilePath.value = path;
}

function selectLeftTab(tab: "library" | "notes"): void {
  if (leftTab.value === tab) return;
  leftTab.value = tab;
  // 离开笔记标签即清空选择集（R8 设计档 §2 情形 4）：面板被树替换后无法核对「本次注入哪几条」；折叠左栏不清空
  if (tab === "library") notesStore.clearNoteSelection();
  // 打开面板是允许的读取时机；失败由面板错误态的「重试」处理
  if (tab === "notes") void notesStore.loadNotes();
}

// 地图徽标 → 笔记面板：切标签的唯一触发条件是 token 变化这一次事件（复位 0 不是聚焦请求，
// 否则 goHome/卸载的 resetNotes 会伪触发）；不得存在读过滤状态来切标签的路径。
watch(
  () => notesStore.chapterFocusToken,
  (token, previous) => {
    if (token <= 0 || token <= previous) return;
    leftCollapsed.value = false;
    selectLeftTab("notes");
  },
);

// 页标记 → 笔记面板：与章节聚焦逐字同构的守卫；不读任何过滤状态，也不发额外 IPC
// （打开面板的读盘来自既有 selectLeftTab("notes")）。
watch(
  () => notesStore.pageFocusToken,
  (token, previous) => {
    if (token <= 0 || token <= previous) return;
    leftCollapsed.value = false;
    selectLeftTab("notes");
  },
);

function onOpenNote(note: ReaderNote): void {
  const target = absoluteDocPath(rootDir.value, note.docPath);
  readerStore.requestJump(target, note.page);
  // 位置走显式跳转；缩放取目标文档的恢复值（跳转页覆盖恢复页，无记录回默认缩放）
  readerStateStore.requestRestoreFor(target);
  // 同文档不重载：比较必须与 requestJump 同口径，否则会整篇重载并落回第 1 页
  if (docPathKey(selectedFilePath.value ?? "") !== docPathKey(target)) {
    selectedFilePath.value = target;
  }
}

/** 笔记组头跳转（组头载荷是工作区相对路径）：复用树行的打开路径，不切标签、不写盘。 */
function onOpenNoteDoc(docPath: string): void {
  openDocumentFromLibrary(absoluteDocPath(rootDir.value, docPath));
}

async function goHome(): Promise<void> {
  // 安全点 b：必须是第一条语句。session-stop 的 handler 末尾会 clearLibraryRoot()，
  // 之后发出的 save 只会拿到 no-root 并把最后现场静默丢掉。
  readerStateStore.flush();
  await rpc.stopSession();
  sessionStore.clearSession();
  pendingUserInput.value = null;
  // Reading pane state must not leak into the next library.
  readerStore.openDocument(null);
  readerStore.setMapOpen(false);
  readerStore.setCaptureMode(false);
  readerStore.setScale(1);
  notesStore.resetNotes();
  readerStateStore.resetState();
  router.push("/");
}
</script>

<template>
  <div class="workspace-page">
    <AppLayout class="workspace-layout" :left-collapsed="leftCollapsed">
      <template #left>
        <div class="pane-shell">
          <div class="pane-pill">
            <button class="pill-icon-btn" title="返回首页" @click="goHome">
              <v-icon size="16">mdi-home-outline</v-icon>
            </button>
            <button
              type="button"
              class="pill-tab"
              :class="{ active: leftTab === 'library' }"
              data-tab="library"
              :title="rootDir || '资料库'"
              @click="selectLeftTab('library')"
            >
              资料库
            </button>
            <button
              type="button"
              class="pill-tab"
              :class="{ active: leftTab === 'notes' }"
              data-tab="notes"
              :title="notesStore.notesFilePath || '笔记'"
              @click="selectLeftTab('notes')"
            >
              {{ noteTabLabel }}
            </button>
            <button class="pill-icon-btn" title="折叠资料库" @click="leftCollapsed = true">
              <v-icon size="16">mdi-chevron-left</v-icon>
            </button>
          </div>
          <LibraryPanel
            v-show="leftTab === 'library'"
            class="pane-body"
            :root-dir="rootDir"
            :selected-path="selectedFilePath"
            @select-file="onSelectFile"
          />
          <NotesPanel
            v-show="leftTab === 'notes'"
            class="pane-body"
            :clarifying="pendingUserInput !== null"
            :document-open="readerStore.filePath !== null"
            @open-note="onOpenNote"
            @open-note-doc="onOpenNoteDoc"
          />
        </div>
      </template>
      <template #center>
        <div class="pane-shell">
          <div class="pane-pill center-pill">
            <button
              v-if="leftCollapsed"
              class="pill-icon-btn"
              title="显示资料库"
              @click="leftCollapsed = false"
            >
              <v-icon size="16">mdi-chevron-right</v-icon>
            </button>
            <span class="pill-label">{{ selectedFileName || "阅读区" }}</span>
          </div>
          <ReaderPanel
            class="pane-body reader-under-pill"
            :file-path="selectedFilePath"
            @open-document="openDocumentFromLibrary"
          />
        </div>
      </template>
      <template #right>
        <ChatPanel
          :pending-user-input="pendingUserInput"
          :sessions="projectStore.sessions"
          :current-session-path="currentSessionPath"
          :session-title="currentSessionTitle"
          @new-session="onNewSession"
          @switch-session="onSwitchSession"
          @delete-session="onDeleteSession"
          @user-input-done="onUserInputDone"
        />
      </template>
    </AppLayout>
  </div>
</template>

<style scoped>
.workspace-page {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: var(--pix-bg-app, #f3f6f9);
  overflow: hidden;
}

.workspace-layout {
  flex: 1;
  min-height: 0;
}

.pane-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.pane-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  max-width: calc(100% - 20px);
  height: var(--pix-pane-pill-height);
  margin: 8px 10px 0;
  padding: 0 8px 0 6px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: var(--pix-pane-pill-radius);
  background: var(--pix-bg-elevated, #ffffff);
  box-shadow: var(--pix-shadow-xs);
  flex-shrink: 0;
  z-index: 2;
}

.center-pill {
  position: absolute;
  top: 0;
  left: 0;
}

.pill-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--pix-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
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

.pill-icon-btn:hover {
  background: var(--pix-bg-hover, #eef2f6);
  color: var(--pix-text-primary);
}

.pill-tab {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--pix-text-secondary);
  font-family: var(--pix-font-ui);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  flex-shrink: 0;
}

.pill-tab:hover {
  background: var(--pix-bg-hover, #eef2f6);
  color: var(--pix-text-primary);
}

.pill-tab.active {
  background: var(--pix-bg-active, #dfeaf4);
  color: var(--pix-text-primary);
}

.pane-body {
  flex: 1;
  min-height: 0;
}

.reader-under-pill :deep(.reader-header) {
  display: none;
}

.reader-under-pill :deep(.reader-empty),
.reader-under-pill :deep(.reader-content) {
  padding-top: 36px;
}
</style>
