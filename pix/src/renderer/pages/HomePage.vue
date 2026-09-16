<script setup lang="ts">
/**
 * Home Page — workspace selection.
 *
 * Open a folder as the reading library root, or pick a recent workspace.
 */
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSettingsStore } from "../stores/settings-store";
import { useProjectStore } from "../stores/project-store";
import { useSessionStore } from "../stores/session-store";
import { useRpc } from "../composables/useRpc";
import type { ProjectInfo } from "@/types/session";

const router = useRouter();
const route = useRoute();
const settingsStore = useSettingsStore();
const projectStore = useProjectStore();
const sessionStore = useSessionStore();
const rpc = useRpc();

const feedbackOpen = ref(false);
const feedbackText = ref("");
const feedbackColor = ref<"error" | "info" | "success">("error");
/** 在途守卫：双击最近打开不得并发走两次 startSession（第二次由主进程串行门幂等吸收，但前端不发）。 */
const opening = ref(false);

function showFeedback(text: string, color: "error" | "info" | "success" = "error"): void {
  feedbackText.value = text;
  feedbackColor.value = color;
  feedbackOpen.value = true;
}

onMounted(async () => {
  await projectStore.loadSettings();
  const bootError = typeof route.query.error === "string" ? route.query.error : null;
  if (bootError) {
    showFeedback(decodeURIComponent(bootError));
    void router.replace({ query: {} });
  }
});

const recentProjects = computed(() => projectStore.recentProjects);

async function openWorkspace(dirPath: string): Promise<void> {
  if (opening.value) return;
  opening.value = true;
  try {
    if (await rpc.startSession(dirPath)) {
      await projectStore.openProject(dirPath);
      const result = await rpc.newSession();
      if (!result || result.cancelled) {
        showFeedback(`无法创建新会话：${rpc.lastError.value || "未知错误"}`);
        return;
      }
      sessionStore.clearSession();
      await projectStore.listSessions();
      projectStore.syncCurrentSession(
        rpc.sessionState.value?.sessionFile,
        rpc.sessionState.value?.sessionId,
      );
      router.push("/workspace");
    } else {
      showFeedback(rpc.lastError.value || "启动失败");
    }
  } finally {
    opening.value = false;
  }
}

async function openFolder(): Promise<void> {
  if (!window.pixApi) return;
  const dirPath = await window.pixApi.selectProject();
  if (!dirPath) return;
  await openWorkspace(dirPath);
}

async function openRecentProject(project: ProjectInfo): Promise<void> {
  await openWorkspace(project.path);
}

async function removeRecentProject(project: ProjectInfo): Promise<void> {
  await projectStore.removeRecentProject(project.path);
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return "今天";
  if (diff < 172800000) return "昨天";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
</script>

<template>
  <div class="home-page">
    <div class="pix-drag-bar"></div>
    <div class="home-container-wrapper">
      <div class="home-container">
        <header class="home-header">
          <div class="home-logo">PiX</div>
          <div class="home-heading">
            <h1 class="home-title">PiX-Read</h1>
            <p class="home-subtitle">智能阅读工作区</p>
          </div>
        </header>

        <div class="home-card">
          <div class="home-actions">
            <v-btn
              variant="flat"
              color="primary"
              size="large"
              block
              prepend-icon="mdi-folder-open-outline"
              @click="openFolder"
            >
              打开资料库文件夹
            </v-btn>
          </div>
        </div>

        <section v-if="recentProjects.length > 0" class="home-section">
          <h2 class="section-title">最近打开</h2>
          <v-card class="recent-card" variant="flat">
            <v-list density="default" bg-color="transparent">
              <v-list-item
                v-for="project in recentProjects"
                :key="project.path"
                :title="project.name"
                :subtitle="formatDate(project.lastOpened)"
                :disabled="opening"
                class="project-list-item"
                @click="openRecentProject(project)"
              >
                <template #append>
                  <div class="project-list-actions">
                    <span class="project-path-mono">{{ project.path }}</span>
                    <button
                      class="project-delete-btn"
                      type="button"
                      title="从最近打开中移除"
                      aria-label="从最近打开中移除"
                      @click.stop="removeRecentProject(project)"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </template>
              </v-list-item>
            </v-list>
          </v-card>
        </section>

        <section v-else class="home-section home-empty">
          <p class="empty-text">从一个本地文件夹开始：把论文、讲义、笔记放进同一个文件夹，PiX-Read 会把它作为资料库。</p>
          <p class="empty-text">所有内容只保存在本机，提问时自动附带当前文档与页码。</p>
        </section>

        <footer class="home-footer">
          <router-link to="/settings" class="footer-link">设置</router-link>
        </footer>
      </div>
    </div>

    <v-snackbar
      v-model="feedbackOpen"
      :color="feedbackColor"
      :timeout="5200"
      location="bottom end"
      variant="tonal"
    >
      {{ feedbackText }}
      <template #actions>
        <v-btn variant="text" @click="feedbackOpen = false">关闭</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<style scoped>
.home-page {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--pix-bg-app);
}

.home-container-wrapper {
  flex: 1;
  display: flex;
  justify-content: center;
  overflow-y: auto;
  padding: 24px 16px 40px;
}

.home-container {
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.home-header {
  display: flex;
  align-items: center;
  gap: 14px;
}

.home-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: var(--pix-accent, #31424f);
  color: #ffffff;
  font-weight: 700;
  font-size: 16px;
}

.home-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--pix-text-primary, #1f2933);
}

.home-subtitle {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--pix-text-secondary, #52606d);
}

.home-card {
  padding: 18px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 14px;
  background: var(--pix-bg-content, #ffffff);
}

.home-section .section-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--pix-text-muted, #8a959e);
}

.project-list-item {
  cursor: pointer;
}

.project-list-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.project-path-mono {
  font-family: var(--pix-font-mono, monospace);
  font-size: 11px;
  color: var(--pix-text-muted, #8a959e);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-delete-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--pix-text-muted, #8a959e);
  padding: 4px;
  border-radius: 6px;
}

.project-delete-btn:hover {
  background: var(--pix-bg-hover, #eef2f6);
  color: var(--pix-error, #b75a55);
}

.home-empty .empty-text {
  margin: 0;
  font-size: 13px;
  color: var(--pix-text-muted, #8a959e);
}

.home-empty .empty-text + .empty-text {
  margin-top: 6px;
}

.home-footer {
  text-align: center;
}

.footer-link {
  font-size: 12px;
  color: var(--pix-text-secondary, #52606d);
  text-decoration: none;
}

.footer-link:hover {
  text-decoration: underline;
}
</style>
