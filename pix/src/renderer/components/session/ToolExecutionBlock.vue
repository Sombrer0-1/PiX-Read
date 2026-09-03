<script setup lang="ts">
/**
 * ToolExecutionBlock - Foldable tool execution display
 *
 * Shows a Chinese summary in the header; raw args/result stay in the details.
 */
import { ref, computed } from "vue";

const props = defineProps<{
  toolName: string;
  args: unknown;
  result: unknown;
  isError: boolean;
  isStreaming: boolean;
  timestamp: number;
}>();

const expanded = ref(false);

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pageCountFromArgs(args: unknown): number {
  if (!isRecord(args)) return 0;
  const pages = args.pages;
  if (Array.isArray(pages)) {
    return pages.filter((page) => typeof page === "number" && Number.isFinite(page)).length;
  }
  if (typeof pages === "number" && Number.isFinite(pages)) return 1;
  if (typeof args.page === "number" && Number.isFinite(args.page)) return 1;
  return 0;
}

function friendlyToolName(name: string, args: unknown): string {
  const short = name.includes("__") ? (name.split("__").pop() || name) : name;
  switch (short) {
    case "pdf_read_pages":
      return `已查看 ${pageCountFromArgs(args)} 页 PDF`;
    case "pdf_outline":
      return "已读取 PDF 目录";
    case "read":
      return "已读取文件";
    case "ls":
      return "已列出目录";
    case "grep":
      return "已搜索";
    case "find":
      return "已查找文件";
    default:
      return "已完成一项操作";
  }
}

const summary = computed(() => friendlyToolName(props.toolName, props.args));

const resultText = computed(() => {
  if (props.result === null || props.result === undefined) {
    return props.isStreaming ? "运行中…" : "无结果";
  }

  if (typeof props.result === "string") {
    return props.result;
  }

  if (typeof props.result === "object" && props.result !== null) {
    const r = props.result as Record<string, unknown>;
    if (typeof r.output === "string") {
      return r.output;
    }
    if (typeof r.content === "string") {
      return r.content;
    }
    return JSON.stringify(props.result, null, 2);
  }

  return String(props.result);
});

const argsSummary = computed(() => {
  if (!props.args || typeof props.args !== "object") {
    return "";
  }

  const a = props.args as Record<string, unknown>;
  const keys = Object.keys(a);
  if (keys.length === 0) return "";

  const stringArgs = keys.filter((k) => typeof a[k] === "string");
  if (stringArgs.length === 1) {
    const val = a[stringArgs[0]] as string;
    return val.length > 80 ? val.slice(0, 80) + "..." : val;
  }

  const first = stringArgs[0] || keys[0];
  const val = String(a[first]);
  return `${first}: ${val.length > 60 ? val.slice(0, 60) + "..." : val}`;
});

function toggleExpand(): void {
  expanded.value = !expanded.value;
}
</script>

<template>
  <div class="tool-block" :class="{ error: isError, streaming: isStreaming }">
    <button
      type="button"
      class="tool-header"
      :aria-expanded="expanded"
      :aria-label="`${expanded ? '收起' : '展开'} ${summary} 详情`"
      @click="toggleExpand"
    >
      <span class="tool-icon">
        <span v-if="isStreaming" class="spinner"></span>
        <span v-else-if="isError" class="status-mark error-mark" aria-label="失败"></span>
        <span v-else class="status-mark success-mark" aria-label="成功"></span>
      </span>
      <span class="tool-name">{{ summary }}</span>
      <span v-if="argsSummary" class="tool-args">{{ argsSummary }}</span>
      <span class="tool-time">{{ formatTime(timestamp) }}</span>
      <span
        class="tool-toggle mdi"
        :class="expanded ? 'mdi-chevron-down' : 'mdi-chevron-right'"
        aria-hidden="true"
      ></span>
    </button>

    <div v-if="expanded" class="tool-body">
      <div v-if="args" class="tool-section">
        <div class="tool-section-label">参数</div>
        <pre class="tool-code">{{ JSON.stringify(args, null, 2) }}</pre>
      </div>

      <div class="tool-section">
        <div class="tool-section-label">结果</div>
        <pre class="tool-code">{{ resultText }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-block {
  margin-bottom: var(--pix-space-md);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-lg);
  overflow: hidden;
  background: var(--pix-bg-content);
  box-shadow: var(--pix-shadow-xs);
}

.tool-block.error {
  border-color: var(--pix-error-light);
  background: var(--pix-error-bg);
}

.tool-block.streaming {
  border-color: var(--pix-border-focus);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: var(--pix-space-sm);
  width: 100%;
  padding: var(--pix-space-sm) var(--pix-space-md);
  text-align: left;
  font-size: var(--pix-text-sm);
  background: var(--pix-bg-code);
  transition: background var(--pix-transition-fast);
}

.tool-header:hover {
  background: var(--pix-bg-hover);
}

.tool-icon {
  font-size: 11px;
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.status-mark {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.success-mark {
  background: var(--pix-success);
}

.error-mark {
  background: var(--pix-error);
}

.tool-block.error .tool-icon {
  color: var(--pix-error);
}

.tool-block:not(.error) .tool-icon {
  color: var(--pix-success);
}

.tool-name {
  font-size: var(--pix-text-xs);
  font-weight: 600;
  color: var(--pix-accent);
  flex-shrink: 0;
}

.tool-args {
  font-family: var(--pix-font-mono);
  font-size: var(--pix-text-xs);
  color: var(--pix-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.tool-time {
  font-size: var(--pix-text-xs);
  color: var(--pix-text-muted);
  font-family: var(--pix-font-mono);
}

.tool-toggle {
  font-size: 15px;
  color: var(--pix-text-muted);
  flex-shrink: 0;
}

.tool-body {
  padding: var(--pix-space-md);
  border-top: 1px solid var(--pix-border-light);
  background: var(--pix-bg-content);
}

.tool-section {
  margin-bottom: var(--pix-space-md);
}

.tool-section:last-child {
  margin-bottom: 0;
}

.tool-section-label {
  font-size: var(--pix-text-xs);
  font-weight: 600;
  color: var(--pix-text-muted);
  letter-spacing: 0.5px;
  margin-bottom: var(--pix-space-xs);
}

.tool-code {
  font-family: var(--pix-font-mono);
  font-size: var(--pix-text-xs);
  line-height: var(--pix-leading-tight);
  background: var(--pix-bg-code);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-md);
  padding: var(--pix-space-sm) var(--pix-space-md);
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--pix-text-primary);
}
</style>
