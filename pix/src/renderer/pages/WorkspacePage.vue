<script setup lang="ts">
/**
 * Workspace Page — the three-pane reading workspace.
 *
 * ┌──────────┬──────────────────────┬────────────┐
 * │ Library  │ Reader               │ Chat       │
 * │ 资料库    │ 阅读区                │ Agent 对话  │
 * └──────────┴──────────────────────┴────────────┘
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "../stores/session-store";
import { useReaderStore } from "../stores/reader-store";
import { useProjectStore } from "../stores/project-store";
import { useRpc } from "../composables/useRpc";
import AppLayout from "../components/layout/AppLayout.vue";
import LibraryPanel from "../components/workspace/LibraryPanel.vue";
import ReaderPanel from "../components/workspace/ReaderPanel.vue";
import ChatPanel from "../components/workspace/ChatPanel.vue";
import type { AgentMessage, RequestUserInputRequest } from "@/types/rpc";
import type { SessionInfo } from "@/types/session";
import { deriveSessionTitle } from "../utils/session-title";

const router = useRouter();
const sessionStore = useSessionStore();
const readerStore = useReaderStore();
const projectStore = useProjectStore();
const rpc = useRpc();

const selectedFilePath = ref<string | null>(null);
const pendingUserInput = ref<RequestUserInputRequest | null>(null);
const leftCollapsed = ref(false);

let unsubscribeEvent: (() => void) | null = null;
let unsubscribeUserInput: (() => void) | null = null;

const rootDir = computed(() => projectStore.currentProject?.path ?? "");
const workspaceName = computed(() => projectStore.currentProject?.name || "PiX-Read");
const currentSessionPath = computed(() => projectStore.currentSession?.path);
const selectedFileName = computed(() => selectedFilePath.value?.split(/[/\\]/).pop() ?? "");
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
    if (!started) {
      const error = encodeURIComponent(rpc.lastError.value || "工作区启动失败");
      router.push({ path: "/", query: { error } });
      return;
    }
    const newSessionResult = await rpc.newSession();
    if (!newSessionResult || newSessionResult.cancelled === true) {
      const error = encodeURIComponent(rpc.lastError.value || "新建对话失败");
      router.push({ path: "/", query: { error } });
      return;
    }
  }

  await syncWorkspaceState({ loadMessagesIfEmpty: true });

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
  unsubscribeEvent?.();
  unsubscribeEvent = null;
  unsubscribeUserInput?.();
  unsubscribeUserInput = null;
});

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
  selectedFilePath.value = path;
}

async function goHome(): Promise<void> {
  await rpc.stopSession();
  sessionStore.clearSession();
  pendingUserInput.value = null;
  // Reading pane state must not leak into the next library.
  readerStore.openDocument(null);
  readerStore.setMapOpen(false);
  readerStore.setCaptureMode(false);
  readerStore.setScale(1);
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
            <span class="pill-label" :title="`${workspaceName} — ${rootDir}`">
              资料库 / {{ workspaceName }}
            </span>
            <button class="pill-icon-btn" title="折叠资料库" @click="leftCollapsed = true">
              <v-icon size="16">mdi-chevron-left</v-icon>
            </button>
          </div>
          <LibraryPanel
            class="pane-body"
            :root-dir="rootDir"
            :selected-path="selectedFilePath"
            @select-file="onSelectFile"
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
          <ReaderPanel class="pane-body reader-under-pill" :file-path="selectedFilePath" />
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
