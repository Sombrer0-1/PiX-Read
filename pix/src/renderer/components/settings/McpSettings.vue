<script setup lang="ts">
/**
 * MCP Settings Panel
 *
 * Displays connected MCP server status, tools, errors, and config paths.
 * Read-only; PiX-Read loads servers from its own agent/mcp.json only.
 */
import { ref, computed, onMounted } from "vue";
import type { McpServerInfo, McpConfigInfo } from "../../../shared/types";
import { useSettingsStore } from "../../stores/settings-store";

const settingsStore = useSettingsStore();
const loading = ref(true);
const servers = ref<McpServerInfo[]>([]);
const configInfo = ref<McpConfigInfo>({ configPaths: [], errors: [] });
const error = ref("");

/** PiX-Read 唯一的 MCP 配置文件；路径由主进程的 pix-paths 提供。 */
const mcpConfigPath = computed(() => settingsStore.storagePaths?.mcpJsonFile ?? "");

const statusColor: Record<string, string> = {
  connected: "success",
  connecting: "warning",
  failed: "error",
  disconnected: "",
};

const statusLabel: Record<string, string> = {
  connected: "已连接",
  connecting: "连接中",
  failed: "失败",
  disconnected: "未连接",
};

async function load(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const [s, c] = await Promise.all([
      window.pixApi.mcpGetServers(),
      window.pixApi.mcpGetConfig(),
    ]);
    servers.value = s;
    configInfo.value = c;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function refresh(): Promise<void> {
  try {
    await window.pixApi.sendCommand({ type: "reload_resources" });
    // Wait briefly for MCP servers to reconnect
    await new Promise((r) => setTimeout(r, 500));
  } catch {
    // reload may throw if session not ready; that's ok
  }
  await load();
}

function truncatedStderr(stderr: string): string {
  const max = 2000;
  return stderr.length > max ? stderr.slice(-max) + "\n... (truncated)" : stderr;
}

onMounted(async () => {
  if (!settingsStore.storagePaths) {
    await settingsStore.load();
  }
  await load();
});
</script>

<template>
  <div class="section-panel">
    <div class="d-flex align-center justify-space-between mb-4">
      <div>
        <h2 class="section-title">MCP 服务器</h2>
        <p class="section-desc">
          MCP 服务器状态与诊断。
          通过编辑
          <code>{{ mcpConfigPath || "PiX-Read 数据目录/agent/mcp.json" }}</code>
          来配置服务器；工作区的 <code>.mcp.json</code> 与 <code>.pi/mcp.json</code> 不会被读取。
        </p>
      </div>
      <v-btn
        variant="outlined"
        prepend-icon="mdi-refresh"
        :loading="loading"
        @click="refresh"
      >
        刷新
      </v-btn>
    </div>

    <v-alert
      v-if="error"
      type="error"
      closable
      class="mb-4"
      density="compact"
    >
      {{ error }}
    </v-alert>

    <!-- Loading skeleton -->
    <div v-if="loading && servers.length === 0" class="mb-4">
      <v-skeleton-loader
        v-for="i in 2"
        :key="i"
        type="card"
        class="mb-3"
      />
    </div>

    <!-- No servers -->
    <v-alert
      v-else-if="servers.length === 0"
      type="info"
      density="compact"
      class="mb-4"
    >
      未配置 MCP 服务器。
      把服务器写入 <code>{{ mcpConfigPath || "PiX-Read 数据目录/agent/mcp.json" }}</code>
      后点击“刷新”。
    </v-alert>

    <!-- Server list -->
    <v-expansion-panels
      v-if="servers.length > 0"
      variant="accordion"
      class="mb-4"
    >
      <v-expansion-panel
        v-for="server in servers"
        :key="server.name"
      >
        <v-expansion-panel-title>
          <div class="d-flex align-center ga-3 flex-wrap">
            <span class="font-weight-medium">{{ server.name }}</span>
            <v-chip
              :color="statusColor[server.status]"
              :text="statusLabel[server.status]"
              size="x-small"
              label
            />
            <v-chip
              v-if="server.required"
              text="必需"
              size="x-small"
              color="warning"
              variant="tonal"
            />
            <span class="text-caption text-medium-emphasis">
              {{ server.transport }} &middot; {{ server.toolCount }} 个工具
            </span>
          </div>
        </v-expansion-panel-title>

        <v-expansion-panel-text>
          <!-- Error -->
          <v-alert
            v-if="server.error"
            type="error"
            density="compact"
            class="mb-3"
          >
            {{ server.error }}
          </v-alert>

          <!-- 工具列表 -->
          <div class="mb-3">
            <div class="text-caption font-weight-bold mb-1" style="color: var(--pix-text-primary)">
              工具
            </div>
            <div v-if="server.tools.length === 0" class="text-caption text-medium-emphasis">
              未暴露工具
            </div>
            <div v-else class="d-flex flex-wrap ga-1">
              <v-chip
                v-for="tool in server.tools"
                :key="tool"
                :text="tool"
                size="x-small"
                variant="tonal"
                color="secondary"
              />
            </div>
          </div>

          <!-- 标准错误输出（仅 stdio） -->
          <div v-if="server.stderr">
            <div class="text-caption font-weight-bold mb-1" style="color: var(--pix-text-primary)">
              标准错误
            </div>
            <pre class="stderr-block text-caption">{{ truncatedStderr(server.stderr) }}</pre>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- 配置文件 -->
    <div class="mb-2">
      <div class="text-caption font-weight-bold mb-1" style="color: var(--pix-text-primary)">
        配置文件
      </div>
      <div v-if="configInfo.configPaths.length === 0" class="text-caption text-medium-emphasis">
        未找到 MCP 配置文件。PiX-Read 只读取：
        <code>{{ mcpConfigPath || "PiX-Read 数据目录/agent/mcp.json" }}</code>
      </div>
      <v-list v-else density="compact" bg-color="transparent" class="config-list">
        <v-list-item
          v-for="path in configInfo.configPaths"
          :key="path"
          :title="path"
          density="compact"
        >
          <template #prepend>
            <v-icon size="small" icon="mdi-file-cog-outline" />
          </template>
        </v-list-item>
      </v-list>
    </div>

    <!-- Global errors -->
    <v-alert
      v-for="(err, i) in configInfo.errors"
      :key="'cfg-err-' + i"
      type="warning"
      density="compact"
      class="mb-2"
    >
      {{ err }}
    </v-alert>
  </div>
</template>

<style scoped>
.stderr-block {
  background: rgb(var(--v-theme-surface-variant));
  padding: 8px 12px;
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.config-list {
  border: 1px solid rgb(var(--v-theme-border-light));
  border-radius: 4px;
}
</style>
