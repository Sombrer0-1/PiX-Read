<script setup lang="ts">
/**
 * LibraryPanel — left pane of the reading workspace.
 *
 * Recursive, lazily expanded file tree for the current workspace (资料库).
 * Session history lives in ChatPanel, not here.
 */
import { computed, ref, watch } from "vue";
import type { LibraryNode } from "@/types/rpc";
import { useReaderStateStore } from "../../stores/reader-state-store";

const props = defineProps<{
  rootDir: string;
  selectedPath?: string | null;
}>();

const emit = defineEmits<{
  "select-file": [path: string];
}>();

interface FlatRow {
  node: LibraryNode;
  depth: number;
}

const tree = ref<LibraryNode[]>([]);
const expanded = ref<Set<string>>(new Set());
const isLoading = ref(false);
const errorText = ref<string | null>(null);

const readerStateStore = useReaderStateStore();

const rows = computed(() => flattenVisible(tree.value, 0, expanded.value));
/** 行徽标：只有 PDF 行有阅读现场；键用树节点自己的 path（不引入第二套键实现）。 */
const progressMap = computed(() => {
  const map = new Map<string, number>();
  for (const row of rows.value) {
    if (row.node.type !== "file" || !row.node.name.toLowerCase().endsWith(".pdf")) continue;
    const page = readerStateStore.progressPageFor(row.node.path);
    if (page !== null) map.set(row.node.path, page);
  }
  return map;
});

watch(
  () => props.rootDir,
  () => {
    void reload();
  },
  { immediate: true },
);

function flattenVisible(nodes: LibraryNode[], depth: number, open: Set<string>): FlatRow[] {
  const result: FlatRow[] = [];
  for (const node of nodes) {
    result.push({ node, depth });
    if (node.type === "directory" && open.has(node.path) && node.children?.length) {
      result.push(...flattenVisible(node.children, depth + 1, open));
    }
  }
  return result;
}

function replaceExpanded(next: Set<string>): void {
  expanded.value = next;
}

async function reload(): Promise<void> {
  if (!props.rootDir) return;
  isLoading.value = true;
  errorText.value = null;
  try {
    const result = await window.pixApi.libraryList(props.rootDir, 3);
    if (result.success) {
      tree.value = result.nodes;
      replaceExpanded(new Set(result.nodes.filter((n) => n.type === "directory").map((n) => n.path)));
    } else {
      tree.value = [];
      errorText.value = result.error || "无法读取目录";
    }
  } catch (err) {
    tree.value = [];
    errorText.value = err instanceof Error ? err.message : "无法读取目录";
  } finally {
    isLoading.value = false;
  }
}

async function toggle(node: LibraryNode): Promise<void> {
  if (node.type === "file") {
    emit("select-file", node.path);
    return;
  }

  const next = new Set(expanded.value);
  if (next.has(node.path)) {
    next.delete(node.path);
    replaceExpanded(next);
    return;
  }

  if (!node.children || node.children.length === 0) {
    const result = await window.pixApi.libraryList(node.path, 1);
    if (result.success) {
      node.children = result.nodes;
    }
  }
  next.add(node.path);
  replaceExpanded(next);
}

function iconFor(node: LibraryNode): string {
  if (node.type === "directory") {
    return expanded.value.has(node.path) ? "mdi-folder-open-outline" : "mdi-folder-outline";
  }
  const lower = node.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "mdi-file-pdf-box";
  if (/\.(md|txt)$/.test(lower)) return "mdi-file-document-outline";
  if (/\.(png|jpe?g|gif|webp)$/.test(lower)) return "mdi-file-image-outline";
  if (/\.(json|jsonl|csv)$/.test(lower)) return "mdi-file-code-outline";
  return "mdi-file-outline";
}

function isSelected(node: LibraryNode): boolean {
  return !!props.selectedPath && node.path === props.selectedPath;
}

function chevronFor(node: LibraryNode): string {
  if (node.type !== "directory") return "";
  return expanded.value.has(node.path) ? "mdi-chevron-down" : "mdi-chevron-right";
}
</script>

<template>
  <div class="library-panel">
    <div class="panel-header">
      <span class="panel-title">根目录</span>
      <v-btn
        icon="mdi-refresh"
        size="x-small"
        variant="text"
        :loading="isLoading"
        title="刷新"
        @click="reload"
      />
    </div>

    <div class="panel-scroll">
      <div class="tree-section">
        <button
          v-for="row in rows"
          :key="row.node.path"
          class="tree-row"
          :class="{ selected: isSelected(row.node) }"
          :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
          :title="row.node.path"
          @click="toggle(row.node)"
        >
          <v-icon v-if="row.node.type === 'directory'" size="14" class="row-chevron">
            {{ chevronFor(row.node) }}
          </v-icon>
          <span v-else class="row-chevron-spacer"></span>
          <v-icon size="16" class="row-icon">{{ iconFor(row.node) }}</v-icon>
          <span class="row-label">{{ row.node.name }}</span>
          <span v-if="progressMap.has(row.node.path)" class="row-progress">
            第 {{ progressMap.get(row.node.path) }} 页
          </span>
        </button>

        <div v-if="errorText && !isLoading" class="empty-hint">
          {{ errorText }}
        </div>
        <div v-else-if="tree.length === 0 && !isLoading" class="empty-hint">
          目录为空
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.library-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 4px;
}

.panel-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--pix-text-muted);
}

.panel-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 6px 12px;
}

.tree-section {
  padding: 0 4px;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 5px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: var(--pix-text-primary);
  font-size: 13px;
}

.tree-row:hover {
  background: var(--pix-bg-hover);
}

.tree-row.selected {
  background: var(--pix-bg-active);
  font-weight: 500;
}

.row-chevron {
  flex-shrink: 0;
  color: var(--pix-text-muted);
}

.row-chevron-spacer {
  width: 14px;
  flex-shrink: 0;
}

.row-icon {
  flex-shrink: 0;
  color: var(--pix-text-secondary);
}

.row-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 进度徽标不参与收缩（min-width + flex-shrink），否则窄栏下会被行名挤没 */
.row-progress {
  min-width: 46px;
  flex-shrink: 0;
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--pix-bg-active, #dfeaf4);
  color: var(--pix-text-secondary);
  font-size: 11px;
  text-align: center;
  white-space: nowrap;
}

.empty-hint {
  padding: 8px 6px;
  font-size: 12px;
  color: var(--pix-text-muted);
}
</style>
