<script setup lang="ts">
/**
 * Settings Page
 *
 * 五个分区：模型与密钥 / MCP / 外观 / 存储位置 / 关于。
 * 只保留 PiX-Read 作为阅读工作台真正生效的开关；pi CLI 的终端、Shell、资源路径等
 * 对本产品无意义的旋钮不再暴露，路径全部来自 PiX 自有目录。
 */
import { computed, ref, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSettingsStore } from "../stores/settings-store";
import { useAuthStore, authSourceLabel } from "../stores/auth-store";
import { useRpc } from "../composables/useRpc";
import type { ModelInfo, ThinkingLevel } from "@/types/rpc";
import McpSettings from "../components/settings/McpSettings.vue";

const router = useRouter();
const route = useRoute();
const settingsStore = useSettingsStore();
const authStore = useAuthStore();
const rpc = useRpc();

// ---- Navigation ----
type SettingsSection = "models" | "mcp" | "appearance" | "storage" | "about";
const activeSection = ref<SettingsSection>("models");
const sections: { key: SettingsSection; label: string; icon: string }[] = [
  { key: "models", label: "模型与密钥", icon: "mdi-cube-outline" },
  { key: "mcp", label: "MCP", icon: "mdi-puzzle-outline" },
  { key: "appearance", label: "外观", icon: "mdi-palette-outline" },
  { key: "storage", label: "存储位置", icon: "mdi-folder-cog-outline" },
  { key: "about", label: "关于", icon: "mdi-information-outline" },
];
const sectionKeys = new Set<SettingsSection>(sections.map((section) => section.key));

// ---- Form state ----
const defaultProvider = ref("");
const defaultModel = ref("");
const defaultThinkingLevel = ref<ThinkingLevel>("xhigh");
const steeringMode = ref<"all" | "one-at-a-time">("one-at-a-time");
const followUpMode = ref<"all" | "one-at-a-time">("one-at-a-time");
const executionMode = ref<"read-only" | "approval" | "unattended">("approval");
const autoCompact = ref(true);
const enabledModels = ref("");
const retryEnabled = ref(true);
const imageAutoResize = ref(true);
const blockImages = ref(false);
const takeHerEyesEnabled = ref(false);
const takeHerEyesModel = ref("");

const saving = ref(false);
const saved = ref(false);
const saveError = ref<string | null>(null);

// ---- Update state ----
const checkingUpdate = ref(false);
const downloading = ref(false);
const updateInfo = ref<{
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
} | null>(null);
const updateError = ref<string | null>(null);

// ---- Auth editing state ----
const editingProvider = ref<string | null>(null);
const editingKeys = ref<Record<string, string>>({});
const authError = ref<string | null>(null);

function toggleEditProvider(provider: string): void {
  authError.value = null;
  if (editingProvider.value === provider) {
    editingProvider.value = null;
  } else {
    editingProvider.value = provider;
    if (!(provider in editingKeys.value)) {
      editingKeys.value[provider] = "";
    }
  }
}

async function saveKey(provider: string): Promise<void> {
  const key = editingKeys.value[provider]?.trim();
  if (!key) return;
  try {
    await rpc.setApiKey(provider, key);
    editingKeys.value[provider] = "";
    editingProvider.value = null;
    await authStore.refreshStatus();
  } catch (err) {
    console.error("[SettingsPage] Failed to save API key:", err);
    authError.value = err instanceof Error ? err.message : "保存 API 密钥失败";
  }
}

async function deleteKey(provider: string): Promise<void> {
  try {
    await rpc.removeAuth(provider);
    editingKeys.value[provider] = "";
    editingProvider.value = null;
    await authStore.refreshStatus();
  } catch (err) {
    console.error("[SettingsPage] Failed to remove API key:", err);
    authError.value = err instanceof Error ? err.message : "删除 API 密钥失败";
  }
}

/** IME 组合态回车不提交密钥（与发送框同口径）。 */
function onSaveKeyEnter(provider: string, e: KeyboardEvent): void {
  if (e.isComposing) return;
  void saveKey(provider);
}

// ---- Option lists ----
const thinkingLevelItems = [
  { title: "关闭", value: "off" },
  { title: "极简", value: "minimal" },
  { title: "低", value: "low" },
  { title: "中", value: "medium" },
  { title: "高", value: "high" },
  { title: "极高", value: "xhigh" },
] as const satisfies { title: string; value: ThinkingLevel }[];

const steeringModeItems = [
  { title: "全部合并注入", value: "all" },
  { title: "逐条注入", value: "one-at-a-time" },
] as const satisfies { title: string; value: "all" | "one-at-a-time" }[];

const followUpModeItems = [
  { title: "全部合并跟进", value: "all" },
  { title: "逐条跟进", value: "one-at-a-time" },
] as const satisfies { title: string; value: "all" | "one-at-a-time" }[];

const executionModeItems = [
  { title: "只读模式", value: "read-only", icon: "mdi-eye-outline", subtitle: "只允许读取和搜索，禁止修改文件。" },
  { title: "审批模式", value: "approval", icon: "mdi-shield-check-outline", subtitle: "高风险操作需要确认。" },
  { title: "无监管模式", value: "unattended", icon: "mdi-lightning-bolt-outline", subtitle: "工具调用不弹出审批。" },
] as const;

const storageRows = computed(() => {
  const paths = settingsStore.storagePaths;
  if (!paths) return [];
  return [
    { label: "PiX-Read 数据根目录", value: paths.rootDir },
    { label: "内核配置目录", value: paths.agentDir },
    { label: "界面设置", value: paths.guiSettingsFile },
    { label: "内核设置", value: paths.kernelSettingsFile },
    { label: "API 密钥", value: paths.authJsonFile },
    { label: "自定义模型", value: paths.modelsJsonFile },
    { label: "MCP 服务器", value: paths.mcpJsonFile },
    { label: "会话历史", value: paths.sessionsRootDir },
    { label: "日志", value: paths.logsDir },
  ];
});

const visionModelItems = computed(() =>
  rpc.availableModels.value
    .filter((model: ModelInfo) => model.input?.includes("image") && authStore.authStatus[model.provider]?.configured)
    .map((model: ModelInfo) => ({
      title: `${model.provider}/${model.id}`,
      value: modelKey(model),
      props: {
        subtitle: model.contextWindow ? `上下文 ${formatContextWindow(model.contextWindow)}` : undefined,
      },
    }))
);

function modelKey(model: { provider: string; id: string }): string {
  return `${model.provider}/${model.id}`;
}

function parseModelKey(key: string): { provider: string; modelId: string } | undefined {
  const slash = key.indexOf("/");
  if (slash <= 0 || slash >= key.length - 1) return undefined;
  return {
    provider: key.slice(0, slash),
    modelId: key.slice(slash + 1),
  };
}

function formatContextWindow(contextWindow: number): string {
  if (contextWindow >= 1_000_000) return `${(contextWindow / 1_000_000).toFixed(1)}M`;
  if (contextWindow >= 1000) return `${Math.round(contextWindow / 1000)}K`;
  return String(contextWindow);
}

async function revealPath(path: string): Promise<void> {
  if (!window.pixApi) return;
  await window.pixApi.libraryShowInFolder(path);
}

function syncSectionFromRoute(): void {
  const section = route.query.section;
  if (typeof section === "string" && sectionKeys.has(section as SettingsSection)) {
    activeSection.value = section as SettingsSection;
  }
}

function selectSection(section: SettingsSection): void {
  activeSection.value = section;
  void router.replace({ query: { ...route.query, section } });
}

// ---- Load ----
onMounted(async () => {
  syncSectionFromRoute();
  await settingsStore.load();
  defaultProvider.value = settingsStore.settings.defaultProvider || "";
  defaultModel.value = settingsStore.settings.defaultModel || "";
  defaultThinkingLevel.value = settingsStore.settings.defaultThinkingLevel || "xhigh";
  takeHerEyesEnabled.value = settingsStore.settings.takeHerEyes?.enabled ?? false;
  takeHerEyesModel.value =
    settingsStore.settings.takeHerEyes?.provider && settingsStore.settings.takeHerEyes?.modelId
      ? `${settingsStore.settings.takeHerEyes.provider}/${settingsStore.settings.takeHerEyes.modelId}`
      : "";

  if (rpc.isConnected.value) {
    try {
      const s = await rpc.getPiSettings();
      if (s) applyPiSettings(s);
    } catch { /* use defaults */ }
    try { await rpc.refreshModels(); } catch { /* unavailable */ }
    try { await authStore.refreshStatus(); } catch { /* unavailable */ }
  }
});

watch(() => route.query.section, syncSectionFromRoute);

function applyPiSettings(s: Record<string, unknown>): void {
  steeringMode.value = (s.steeringMode as "all" | "one-at-a-time") ?? "one-at-a-time";
  followUpMode.value = (s.followUpMode as "all" | "one-at-a-time") ?? "one-at-a-time";
  const execution = (s.execution && typeof s.execution === "object" ? s.execution : {}) as Record<string, unknown>;
  executionMode.value = execution.mode === "read-only" || execution.mode === "unattended" ? execution.mode : "approval";
  const compaction = (s.compaction && typeof s.compaction === "object" ? s.compaction : {}) as Record<string, unknown>;
  autoCompact.value = (s.compactionEnabled ?? compaction.enabled ?? true) as boolean;
  if (s.enabledModels && Array.isArray(s.enabledModels)) enabledModels.value = s.enabledModels.join(", ");
  const retry = (s.retry && typeof s.retry === "object" ? s.retry : {}) as Record<string, unknown>;
  retryEnabled.value = (retry.enabled ?? true) as boolean;
  const images = (s.images && typeof s.images === "object" ? s.images : {}) as Record<string, unknown>;
  imageAutoResize.value = (images.autoResize ?? true) as boolean;
  blockImages.value = (images.blockImages ?? false) as boolean;
}

function optionalCommaList(value: string): string[] | undefined {
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

async function saveSettings(): Promise<void> {
  saving.value = true;
  saved.value = false;
  saveError.value = null;
  try {
    const selectedEyeModel = parseModelKey(takeHerEyesModel.value);
    await settingsStore.save({
      defaultModel: defaultModel.value || undefined,
      defaultProvider: defaultProvider.value || undefined,
      defaultThinkingLevel: defaultThinkingLevel.value,
      takeHerEyes: {
        enabled: takeHerEyesEnabled.value,
        provider: selectedEyeModel?.provider,
        modelId: selectedEyeModel?.modelId,
      },
    });
    if (rpc.isConnected.value) {
      const setters: [string, unknown][] = [
        ["steeringMode", steeringMode.value],
        ["followUpMode", followUpMode.value],
        ["executionMode", executionMode.value],
        ["compactEnabled", autoCompact.value],
        ["enabledModels", optionalCommaList(enabledModels.value)],
        ["retryEnabled", retryEnabled.value],
        ["autoResizeImages", imageAutoResize.value],
        ["blockImages", blockImages.value],
      ];
      await rpc.setPiSettings(setters.map(([key, value]) => ({ key, value })));
      await Promise.all([rpc.refreshState(), rpc.refreshModels(), rpc.refreshCommands()]);
    }
    saved.value = true;
    setTimeout(() => (saved.value = false), 2000);
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : "保存设置失败";
  } finally { saving.value = false; }
}

function goBack(): void { router.back(); }

async function checkForUpdates(): Promise<void> {
  checkingUpdate.value = true;
  updateError.value = null;
  updateInfo.value = null;
  try {
    const result = await window.pixApi.checkForUpdates();
    if (result.success) {
      updateInfo.value = {
        hasUpdate: result.hasUpdate ?? false,
        currentVersion: result.currentVersion ?? "",
        latestVersion: result.latestVersion,
        releaseNotes: result.releaseNotes,
      };
    } else {
      updateError.value = result.error ?? "检查更新失败";
    }
  } catch (err) {
    updateError.value = err instanceof Error ? err.message : String(err);
  } finally {
    checkingUpdate.value = false;
  }
}

async function downloadAndInstall(): Promise<void> {
  downloading.value = true;
  updateError.value = null;
  try {
    const result = await window.pixApi.downloadUpdate();
    if (result.success) {
      const installed = await window.pixApi.installUpdate();
      if (!installed.success) {
        updateError.value = installed.error ?? "安装更新失败";
      }
    } else {
      updateError.value = result.error ?? "下载更新失败";
    }
  } catch (err) {
    updateError.value = err instanceof Error ? err.message : String(err);
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <div class="settings-page">
    <div class="pix-drag-bar"></div>
    <div class="settings-layout">
      <!-- Sidebar -->
      <nav class="settings-sidebar">
        <div class="sidebar-header">
          <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="goBack">返回</v-btn>
        </div>
        <v-list density="default" nav bg-color="transparent">
          <v-list-item
            v-for="section in sections"
            :key="section.key"
            :title="section.label"
            :prepend-icon="section.icon"
            :active="activeSection === section.key"
            color="primary"
            @click="selectSection(section.key)"
            class="sidebar-item"
            rounded="lg"
          />
        </v-list>
      </nav>

      <!-- Content -->
      <v-form class="settings-content" @submit.prevent="saveSettings">
        <!-- ============ 模型与密钥 ============ -->
        <div v-show="activeSection === 'models'" class="section-panel">
          <h2 class="section-title">模型与密钥</h2>
          <p class="section-desc">新会话的默认模型、流式期间的排队行为，以及各提供商的 API 密钥。</p>

          <div class="form-fields">
            <v-text-field v-model="defaultProvider" label="默认提供商" placeholder="例如 anthropic, openai" hint="新会话使用的提供商名称。" persistent-hint class="mb-4" />
            <v-text-field v-model="defaultModel" label="默认模型" placeholder="例如 claude-sonnet-4-6" hint="新会话使用的模型 ID。" persistent-hint class="mb-4" />
            <v-select
              v-model="defaultThinkingLevel"
              label="默认思考级别"
              :items="thinkingLevelItems"
              item-title="title"
              item-value="value"
              class="mb-4"
            />
            <v-select
              v-model="steeringMode"
              label="操控消息"
              :items="steeringModeItems"
              item-title="title"
              item-value="value"
              hint="回答过程中插入的操控消息如何处理。"
              persistent-hint
              class="mb-4"
            />
            <v-select
              v-model="followUpMode"
              label="跟进消息"
              :items="followUpModeItems"
              item-title="title"
              item-value="value"
              hint="回答结束后排队的跟进消息如何处理。"
              persistent-hint
              class="mb-4"
            />
            <v-select
              v-model="executionMode"
              label="执行模式"
              :items="executionModeItems"
              item-title="title"
              item-value="value"
              hint="只读模式禁止修改；审批模式拦截高风险操作；无监管模式不弹出审批。"
              persistent-hint
              class="mb-4"
            >
              <template #item="{ props, item }">
                <v-list-item v-bind="props" :prepend-icon="item.raw.icon" :subtitle="item.raw.subtitle" />
              </template>
              <template #selection="{ item }">
                <div class="execution-selection">
                  <v-icon size="18" :icon="item.raw.icon" />
                  <span>{{ item.raw.title }}</span>
                </div>
              </template>
            </v-select>
            <v-switch v-model="autoCompact" label="自动压缩" hint="达到阈值时自动压缩上下文。" persistent-hint class="mb-4" />
            <v-text-field
              v-model="enabledModels"
              label="限定可用模型（glob）"
              placeholder="anthropic/*, openai/gpt-5*"
              hint="逗号分隔的 glob 模式，只影响模型选择列表；留空表示全部。"
              persistent-hint
              class="mb-4"
            />
            <v-switch v-model="retryEnabled" label="自动重试" hint="自动重试失败的 API 请求。" persistent-hint class="mb-4" />
            <v-switch v-model="imageAutoResize" label="自动调整图片大小" hint="发送给模型前自动压缩过大的图片。" persistent-hint class="mb-4" />
            <v-switch v-model="blockImages" label="不发送图片" hint="阻止把图片发送给任何模型，用于隐私敏感的资料。" persistent-hint class="mb-4" />

            <div class="eye-model-config">
              <div class="setting-subheader">
                <v-icon size="20" icon="mdi-eye-outline" />
                <div>
                  <div class="setting-subtitle">视觉辅助模型</div>
                  <div class="setting-caption">当主模型不能看图时，先用视觉模型把页面截图转成文字描述。</div>
                </div>
              </div>
              <v-switch
                v-model="takeHerEyesEnabled"
                label="启用视觉辅助"
                hint="主模型支持图片，或已开启“不发送图片”时不会调用。"
                persistent-hint
                class="mb-4"
              />
              <v-select
                v-model="takeHerEyesModel"
                label="选择视觉模型"
                :items="visionModelItems"
                item-title="title"
                item-value="value"
                no-data-text="没有可用的视觉模型"
                :disabled="!takeHerEyesEnabled || blockImages"
                hint="这里只显示已配置且支持图片输入的模型。"
                persistent-hint
                class="mb-4"
              />
              <div v-if="blockImages && takeHerEyesEnabled" class="inline-hint">
                已开启“不发送图片”，视觉辅助不会把图片发送给任何模型。
              </div>
            </div>

            <v-divider class="my-6" />

            <div class="setting-subheader">
              <v-icon size="20" icon="mdi-shield-key" />
              <div>
                <div class="setting-subtitle">API 密钥</div>
                <div class="setting-caption">
                  密钥只写入 PiX-Read 自有目录：<code>{{ settingsStore.storagePaths?.authJsonFile || "内核配置目录/auth.json" }}</code>。
                  PiX-Read 不读取也不迁移 <code>~/.pi/</code>，也不使用系统环境变量里的密钥。
                </div>
              </div>
            </div>
            <v-alert v-if="authError" type="error" variant="tonal" density="compact" closable class="settings-feedback" @click:close="authError = null">
              {{ authError }}
            </v-alert>
            <div v-if="!rpc.isConnected.value" class="auth-notice"><p>请先在项目内启动会话，再配置 API 密钥。</p></div>
            <div v-else-if="authStore.providerCount === 0" class="auth-notice"><p>未检测到模型提供商。</p></div>
            <div v-else class="auth-list">
              <v-card v-for="(status, provider) in authStore.authStatus" :key="provider" :border="status.configured ? 'success' : undefined" variant="outlined" class="auth-card mb-3">
                <div class="auth-provider-row" @click="toggleEditProvider(provider)">
                  <div class="auth-provider-info">
                    <span class="auth-provider-name">{{ provider }}</span>
                    <span v-if="status.label" class="auth-provider-label">{{ status.label }}</span>
                  </div>
                  <div class="auth-status-info">
                    <v-icon size="small" :color="status.configured ? 'success' : undefined" :icon="status.configured ? 'mdi-check-circle' : 'mdi-circle-outline'" />
                    <span class="auth-status-text">{{ status.configured ? '已配置' : '未配置' }}</span>
                    <span v-if="status.source" class="auth-source">来源：{{ authSourceLabel(status.source) }}</span>
                    <v-icon size="small" class="ml-2">{{ editingProvider === provider ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
                  </div>
                </div>
                <div v-if="editingProvider === provider" class="auth-edit-row">
                  <v-text-field v-model="editingKeys[provider]" type="password" :placeholder="status.configured ? '输入新密钥以替换…' : '粘贴 API 密钥…'" hide-details density="comfortable" @keydown.enter="onSaveKeyEnter(provider, $event)" class="mb-3" />
                  <div class="auth-btn-group">
                    <v-btn size="small" color="primary" variant="tonal" :disabled="!editingKeys[provider]?.trim()" @click="saveKey(provider)">保存</v-btn>
                    <v-btn v-if="status.configured" size="small" color="error" variant="text" @click="deleteKey(provider)">删除</v-btn>
                  </div>
                </div>
              </v-card>
            </div>
          </div>
        </div>

        <!-- ============ MCP ============ -->
        <div v-show="activeSection === 'mcp'">
          <McpSettings />
        </div>

        <!-- ============ 外观 ============ -->
        <div v-show="activeSection === 'appearance'" class="section-panel">
          <h2 class="section-title">外观</h2>
          <p class="section-desc">界面外观目前不提供可选项；阅读相关的显示控制放在阅读器工具栏里。</p>
          <div class="info-panel">
            <div class="info-row"><span>主题</span><code>浅色（当前唯一主题）</code></div>
            <div class="info-row"><span>界面语言</span><code>中文</code></div>
            <div class="info-row"><span>页面缩放、框选截图</span><code>阅读器工具栏</code></div>
          </div>
        </div>

        <!-- ============ 存储位置 ============ -->
        <div v-show="activeSection === 'storage'" class="section-panel">
          <h2 class="section-title">存储位置</h2>
          <p class="section-desc">PiX-Read 的全部配置与历史都在自己的数据目录内，与 pi CLI 的 <code>~/.pi/</code> 完全分开。</p>

          <div v-if="storageRows.length === 0" class="auth-notice">
            <p>主进程尚未提供存储路径（缺少 get-storage-paths 通道）。</p>
          </div>
          <div v-else class="info-panel">
            <div v-for="row in storageRows" :key="row.label" class="info-row">
              <span>{{ row.label }}</span>
              <div class="info-path">
                <code :title="row.value">{{ row.value }}</code>
                <v-btn icon="mdi-folder-open-outline" size="x-small" variant="text" title="在文件夹中显示" @click="revealPath(row.value)" />
              </div>
            </div>
          </div>

          <div class="storage-notes">
            <div class="inline-hint">工作区里的 <code>.pi/</code>、<code>.agents/</code>、<code>.mcp.json</code> 不会被 PiX-Read 读取。</div>
            <div class="inline-hint">首次启动不会导入 <code>~/.pi/agent</code> 的密钥与模型，请在本页填写 API 密钥。</div>
          </div>
        </div>

        <!-- ============ 关于 ============ -->
        <div v-show="activeSection === 'about'" class="section-panel">
          <h2 class="section-title">关于</h2>
          <p class="section-desc">PiX-Read：本地文档阅读与 AI 问答工作台。</p>

          <div class="form-fields">
            <div class="info-panel">
              <div class="info-row"><span>产品</span><code>PiX-Read</code></div>
              <div class="info-row"><span>当前版本</span><code>{{ updateInfo?.currentVersion || "点击“检查更新”后显示" }}</code></div>
              <div class="info-row"><span>Agent 内核</span><code>内置 pi 编码内核（只读使用，不修改其配置）</code></div>
              <div class="info-row"><span>运行方式</span><code>进程内 AgentSession</code></div>
            </div>

            <v-divider class="my-4" />

            <div class="update-section">
              <div class="setting-subheader">
                <v-icon size="20" icon="mdi-update" />
                <div>
                  <div class="setting-subtitle">应用更新</div>
                  <div class="setting-caption">检查并安装最新版本。</div>
                </div>
              </div>
              <div class="update-actions">
                <v-btn variant="outlined" :loading="checkingUpdate" :disabled="downloading" @click="checkForUpdates">
                  检查更新
                </v-btn>
                <v-btn
                  v-if="updateInfo?.hasUpdate"
                  color="primary"
                  variant="tonal"
                  :loading="downloading"
                  :disabled="checkingUpdate"
                  @click="downloadAndInstall"
                >
                  下载并安装
                </v-btn>
              </div>
              <div v-if="updateInfo && !updateInfo.hasUpdate" class="update-status success">
                <v-icon size="small" icon="mdi-check-circle" />
                <span>当前已是最新版本 ({{ updateInfo.currentVersion }})</span>
              </div>
              <div v-if="updateInfo?.hasUpdate" class="update-status info">
                <v-icon size="small" icon="mdi-information" />
                <span>发现新版本 {{ updateInfo.latestVersion }} (当前: {{ updateInfo.currentVersion }})</span>
              </div>
              <div v-if="updateError" class="update-status error">
                <v-icon size="small" icon="mdi-alert-circle" />
                <span>{{ updateError }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Save -->
        <v-alert v-if="saveError" type="error" variant="tonal" density="compact" closable class="settings-feedback" @click:close="saveError = null">
          {{ saveError }}
        </v-alert>
        <div v-show="activeSection === 'models'" class="settings-actions">
          <v-btn type="submit" color="primary" variant="flat" size="large" :loading="saving">
            {{ saved ? '已保存！' : '保存设置' }}
          </v-btn>
        </div>
      </v-form>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--pix-bg-app);
}

.pix-drag-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--pix-bg-app);
}

.settings-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
  gap: var(--pix-space-lg);
  padding: 0 var(--pix-space-lg) var(--pix-space-lg);
}

/* Sidebar */
.settings-sidebar {
  width: 220px;
  min-width: 220px;
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-lg);
  background: var(--pix-bg-card);
  display: flex;
  flex-direction: column;
  padding: var(--pix-space-sm);
  box-shadow: none;
}

.sidebar-header {
  padding: var(--pix-space-sm) var(--pix-space-sm) var(--pix-space-md);
}

.sidebar-item {
  border-radius: var(--pix-radius-lg);
  margin-bottom: 4px;
}

.settings-sidebar :deep(.v-list-item--active) {
  background: var(--pix-accent-light);
  color: var(--pix-accent);
  box-shadow: inset 3px 0 0 var(--pix-accent);
}

/* Content */
.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.section-panel {
  width: min(760px, 100%);
  background: var(--pix-bg-content);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-lg);
  box-shadow: none;
  padding: var(--pix-space-xl);
}

.section-title {
  font-size: var(--pix-text-xl);
  font-weight: 600;
  margin-bottom: var(--pix-space-xs);
}

.section-desc {
  font-size: var(--pix-text-sm);
  color: var(--pix-text-secondary);
  margin-bottom: var(--pix-space-xl);
}

.form-fields {
  display: flex;
  flex-direction: column;
}

.execution-selection {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.eye-model-config {
  display: flex;
  flex-direction: column;
  gap: var(--pix-space-xs);
}

.setting-subheader {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: var(--pix-space-sm);
  color: var(--pix-text-primary);
}

.setting-subtitle {
  font-size: var(--pix-text-md);
  font-weight: 600;
  line-height: 1.3;
}

.setting-caption {
  margin-top: 2px;
  font-size: var(--pix-text-xs);
  color: var(--pix-text-secondary);
}

.mb-3 { margin-bottom: 12px; }
.mb-4 { margin-bottom: 20px; }

.inline-hint {
  font-size: var(--pix-text-xs);
  color: var(--pix-text-secondary);
}

.info-panel {
  margin-top: var(--pix-space-xl);
  padding: var(--pix-space-lg);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-lg);
  background: var(--pix-bg-code);
}

.info-panel:first-child {
  margin-top: 0;
}

.info-panel h3 {
  font-size: var(--pix-text-md);
  font-weight: 600;
  margin-bottom: var(--pix-space-md);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--pix-space-md);
  padding: 4px 0;
  font-size: var(--pix-text-sm);
  color: var(--pix-text-secondary);
}

.info-path {
  display: flex;
  align-items: center;
  gap: var(--pix-space-xs);
  min-width: 0;
}

.info-path code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 380px;
}

.storage-notes {
  margin-top: var(--pix-space-md);
  display: flex;
  flex-direction: column;
  gap: var(--pix-space-xs);
}

code {
  font-family: var(--pix-font-mono);
  font-size: var(--pix-text-xs);
  background: var(--pix-bg-code);
  padding: 2px 6px;
  border-radius: var(--pix-radius-sm);
}

.auth-notice {
  padding: var(--pix-space-2xl);
  text-align: center;
  color: var(--pix-text-secondary);
  font-size: var(--pix-text-sm);
  border: 1px dashed var(--pix-border);
  border-radius: var(--pix-radius-lg);
  background: var(--pix-bg-code);
}

.auth-list {
  display: flex;
  flex-direction: column;
}

.auth-card {
  padding: var(--pix-space-sm);
  border-radius: var(--pix-radius-lg) !important;
  background: var(--pix-bg-card);
}

.auth-provider-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  padding: var(--pix-space-sm) 0;
}

.auth-provider-info {
  display: flex;
  align-items: center;
  gap: var(--pix-space-sm);
}

.auth-provider-name {
  font-weight: 600;
  font-size: var(--pix-text-md);
  font-family: var(--pix-font-ui);
}

.auth-provider-label {
  font-size: var(--pix-text-xs);
  color: var(--pix-text-secondary);
}

.auth-status-info {
  display: flex;
  align-items: center;
  gap: var(--pix-space-xs);
}

.auth-status-text {
  font-size: var(--pix-text-sm);
  font-weight: 500;
}

.auth-source {
  font-size: var(--pix-text-xs);
  color: var(--pix-text-secondary);
}

.auth-edit-row {
  margin-top: var(--pix-space-md);
  padding-top: var(--pix-space-md);
  border-top: 1px solid var(--pix-border-light);
  display: flex;
  flex-direction: column;
}

.update-section {
  display: flex;
  flex-direction: column;
  gap: var(--pix-space-sm);
}

.update-actions {
  display: flex;
  gap: var(--pix-space-md);
  align-items: center;
}

.update-status {
  display: flex;
  align-items: center;
  gap: var(--pix-space-sm);
  font-size: var(--pix-text-sm);
  padding: var(--pix-space-sm) var(--pix-space-md);
  border-radius: var(--pix-radius-md);
}

.update-status.success {
  color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.1);
}

.update-status.info {
  color: rgb(var(--v-theme-info));
  background: rgba(var(--v-theme-info), 0.1);
}

.update-status.error {
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.1);
}

.auth-btn-group {
  display: flex;
  gap: var(--pix-space-sm);
  justify-content: flex-end;
}

.settings-actions {
  position: sticky;
  bottom: 0;
  margin-top: var(--pix-space-lg);
  width: min(760px, 100%);
  padding: var(--pix-space-md) 0 var(--pix-space-sm);
  display: flex;
  justify-content: flex-end;
  background: var(--pix-bg-app);
  border-top: 1px solid var(--pix-border-subtle);
}

.settings-feedback {
  width: min(760px, 100%);
  margin-top: var(--pix-space-lg);
}

.settings-content :deep(.v-field) {
  border-radius: var(--pix-radius-md);
}

.settings-content :deep(.v-input) {
  color: var(--pix-text-primary);
}

/* Keep secondary help available without making every form row permanently tall. */
.settings-content :deep(.v-input:not(:focus-within):not(.v-input--error) .v-messages) {
  height: 0;
  min-height: 0;
  margin: 0;
  overflow: hidden;
  opacity: 0;
}

.settings-content :deep(.v-input:focus-within .v-messages) {
  opacity: 1;
}

.ml-2 { margin-left: var(--pix-space-sm); }

@media (max-width: 900px) {
  .settings-layout {
    gap: var(--pix-space-md);
    padding-left: var(--pix-space-md);
    padding-right: var(--pix-space-md);
  }

  .settings-sidebar {
    width: 188px;
    min-width: 188px;
  }

  .section-panel {
    padding: var(--pix-space-lg);
  }
}

@media (max-width: 640px) {
  .settings-layout {
    flex-direction: column;
    overflow-y: auto;
  }

  .settings-sidebar {
    width: 100%;
    min-width: 0;
    flex-shrink: 0;
  }

  .settings-sidebar :deep(.v-list) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--pix-space-xs);
  }

  .settings-content {
    overflow: visible;
  }

  .settings-actions {
    position: sticky;
    bottom: 0;
    padding-bottom: var(--pix-space-md);
  }
}
</style>
