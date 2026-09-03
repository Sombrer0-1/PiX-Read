<script setup lang="ts">
/**
 * KnowledgeMap — PDF outline as a colored chapter tree in the reader sidebar.
 *
 * Nodes come from readerStore.outline (pdf.js bookmarks). Clicking a node
 * with a page writes readerStore.gotoPage. No LLM-generated structure.
 */
import { computed, ref, watch } from "vue";
import { useReaderStore } from "../../stores/reader-store";
import type { ReaderOutlineNode } from "@shared/types";

const BRANCH_COLORS = ["#5b8def", "#2a9d8f", "#c4891a", "#7c6bc4", "#c45c6a", "#3d8ea0"];

interface MapRow {
  key: string;
  title: string;
  page: number | null;
  pageLabel: string | null;
  color: string;
  depth: number;
  hasChildren: boolean;
}

interface ChapterGroup {
  chapter: MapRow;
  descendants: MapRow[];
}

const readerStore = useReaderStore();
const expanded = ref<Set<string>>(new Set());
const treeEl = ref<HTMLElement | null>(null);
// 点击地图节点后的抑制窗口：期间发生的 page 变化属于程序性跳转，不触发自动滚动
const suppressScrollUntil = ref(0);

const bookTitle = computed(() => titleFromPath(readerStore.filePath));
const nodeCount = computed(() => countOutlineNodes(readerStore.outline));
const pageLabels = computed(() => buildPageLabels(readerStore.outline, readerStore.pageCount));
const rows = computed(() =>
  flattenVisible(readerStore.outline, 0, "root", null, expanded.value, pageLabels.value),
);
const groups = computed(() => groupByChapter(rows.value));
const hasOutline = computed(() => readerStore.outline.length > 0);
// 各节点页码范围上界（预序中下一个更大页码节点的前一页，口径对齐 buildPageLabels）
const rangeEnds = computed(() => buildRangeEnds(readerStore.outline, readerStore.pageCount));

watch(
  () => readerStore.outline,
  (nodes) => {
    const next = new Set<string>();
    collectExpandable(nodes, "root", next, 0);
    expanded.value = next;
  },
  { immediate: true },
);

// 仅用户翻页时滚动跟随（flush: post 保证 .current 类已写入 DOM）；程序性跳转在抑制窗口内跳过
watch(
  () => readerStore.page,
  () => {
    if (Date.now() < suppressScrollUntil.value) return;
    const currentRows = treeEl.value?.querySelectorAll(".map-row.current");
    if (!currentRows || currentRows.length === 0) return;
    currentRows[currentRows.length - 1].scrollIntoView({ block: "nearest" });
  },
  { flush: "post" },
);

function titleFromPath(filePath: string | null): string {
  if (!filePath) return "当前文档";
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const base = slash >= 0 ? filePath.slice(slash + 1) : filePath;
  if (!base) return "当前文档";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem || "当前文档";
}

function countOutlineNodes(nodes: ReaderOutlineNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1 + countOutlineNodes(node.items);
  }
  return count;
}

function collectPreorder(
  nodes: ReaderOutlineNode[],
  parentKey: string,
  into: { key: string; page: number | null }[],
): void {
  nodes.forEach((node, index) => {
    const key = `${parentKey}/${index}`;
    into.push({ key, page: node.page });
    collectPreorder(node.items, key, into);
  });
}

function buildPageLabels(nodes: ReaderOutlineNode[], pageCount: number): Map<string, string> {
  const flat: { key: string; page: number | null }[] = [];
  collectPreorder(nodes, "root", flat);
  const labels = new Map<string, string>();
  for (let i = 0; i < flat.length; i++) {
    const start = flat[i].page;
    if (start == null) continue;
    let end: number | null = null;
    for (let j = i + 1; j < flat.length; j++) {
      const next = flat[j].page;
      if (next != null && next > start) {
        end = next - 1;
        if (pageCount > 0) end = Math.min(end, pageCount);
        break;
      }
    }
    if (end == null || end === start || end < start) {
      labels.set(flat[i].key, String(start));
    } else {
      labels.set(flat[i].key, `${start}-${end}`);
    }
  }
  return labels;
}

/**
 * 计算每个节点的页码范围上界：预序遍历中下一个更大页码节点的前一页，无后继时取总页数。
 * 与 buildPageLabels 使用同一份全量预序（含未展开节点），保证高亮范围与页码徽标一致。
 */
function buildRangeEnds(nodes: ReaderOutlineNode[], pageCount: number): Map<string, number> {
  const flat: { key: string; page: number | null }[] = [];
  collectPreorder(nodes, "root", flat);
  const ends = new Map<string, number>();
  for (let i = 0; i < flat.length; i++) {
    const start = flat[i].page;
    if (start == null) continue;
    let end = pageCount > 0 ? pageCount : Number.POSITIVE_INFINITY;
    for (let j = i + 1; j < flat.length; j++) {
      const next = flat[j].page;
      if (next != null && next > start) {
        end = next - 1;
        if (pageCount > 0) end = Math.min(end, pageCount);
        break;
      }
    }
    ends.set(flat[i].key, end);
  }
  return ends;
}

function collectExpandable(
  nodes: ReaderOutlineNode[],
  parentKey: string,
  into: Set<string>,
  depth: number,
): void {
  nodes.forEach((node, index) => {
    const key = `${parentKey}/${index}`;
    if (node.items.length > 0 && depth === 0) into.add(key);
    if (node.items.length > 0) collectExpandable(node.items, key, into, depth + 1);
  });
}

function flattenVisible(
  nodes: ReaderOutlineNode[],
  depth: number,
  parentKey: string,
  parentColor: string | null,
  open: Set<string>,
  labels: Map<string, string>,
): MapRow[] {
  const result: MapRow[] = [];
  nodes.forEach((node, index) => {
    const key = `${parentKey}/${index}`;
    const color = parentColor ?? BRANCH_COLORS[index % BRANCH_COLORS.length];
    const title = node.title.trim() || "未命名";
    result.push({
      key,
      title,
      page: node.page,
      pageLabel: labels.get(key) ?? null,
      color,
      depth,
      hasChildren: node.items.length > 0,
    });
    if (node.items.length > 0 && open.has(key)) {
      result.push(...flattenVisible(node.items, depth + 1, key, color, open, labels));
    }
  });
  return result;
}

function groupByChapter(list: MapRow[]): ChapterGroup[] {
  const next: ChapterGroup[] = [];
  for (const row of list) {
    if (row.depth === 0) {
      next.push({ chapter: row, descendants: [] });
    } else if (next.length > 0) {
      next[next.length - 1].descendants.push(row);
    }
  }
  return next;
}

function isExpanded(key: string): boolean {
  return expanded.value.has(key);
}

// 范围命中：start <= 当前页 <= 范围上界；无页码节点不命中
function isCurrent(row: MapRow): boolean {
  if (row.page == null) return false;
  const end = rangeEnds.value.get(row.key);
  if (end == null) return false;
  return row.page <= readerStore.page && readerStore.page <= end;
}

function toggleExpand(key: string): void {
  const next = new Set(expanded.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expanded.value = next;
}

function onChevronClick(row: MapRow, event: MouseEvent): void {
  event.stopPropagation();
  toggleExpand(row.key);
}

function onNodeClick(row: MapRow): void {
  if (row.page != null) {
    // 记录程序性跳转窗口，随后的 page 变化不再触发地图自动滚动
    suppressScrollUntil.value = Date.now() + 600;
    readerStore.gotoPage = row.page;
    return;
  }
  if (row.hasChildren) toggleExpand(row.key);
}
</script>

<template>
  <div class="knowledge-map">
    <div class="map-header">
      <span class="map-heading" :title="`${bookTitle} 知识地图`">{{ bookTitle }} 知识地图</span>
      <span class="map-count">{{ nodeCount }}</span>
    </div>

    <div v-if="!hasOutline" class="map-empty">
      <v-icon size="32" class="empty-icon">mdi-bookmark-off-outline</v-icon>
      <p class="empty-title">当前文档没有书签</p>
      <p class="empty-subtitle">知识地图只展示 PDF 目录，不会自动生成节点</p>
    </div>

    <div v-else ref="treeEl" class="map-tree">
      <div
        v-for="group in groups"
        :key="group.chapter.key"
        class="chapter-block"
        :style="{ '--branch': group.chapter.color }"
      >
        <div class="map-row chapter" :class="{ current: isCurrent(group.chapter) }">
          <button
            v-if="group.chapter.hasChildren"
            type="button"
            class="row-chevron"
            :title="isExpanded(group.chapter.key) ? '折叠' : '展开'"
            @click="onChevronClick(group.chapter, $event)"
          >
            <v-icon size="14">
              {{ isExpanded(group.chapter.key) ? "mdi-chevron-down" : "mdi-chevron-right" }}
            </v-icon>
          </button>
          <span v-else class="row-chevron-spacer"></span>

          <button
            type="button"
            class="map-node"
            :title="group.chapter.title"
            @click="onNodeClick(group.chapter)"
          >
            <span class="dot" aria-hidden="true"></span>
            <span class="label">{{ group.chapter.title }}</span>
            <span v-if="group.chapter.pageLabel" class="page-badge">{{ group.chapter.pageLabel }}</span>
          </button>
        </div>

        <div v-if="group.descendants.length" class="map-children">
          <div
            v-for="row in group.descendants"
            :key="row.key"
            class="map-row child-row"
            :class="{ current: isCurrent(row) }"
            :style="{ '--indent': `${(row.depth - 1) * 14}px` }"
          >
            <button
              v-if="row.hasChildren"
              type="button"
              class="row-chevron"
              :title="isExpanded(row.key) ? '折叠' : '展开'"
              @click="onChevronClick(row, $event)"
            >
              <v-icon size="14">
                {{ isExpanded(row.key) ? "mdi-chevron-down" : "mdi-chevron-right" }}
              </v-icon>
            </button>
            <span v-else class="row-chevron-spacer"></span>

            <button type="button" class="map-node" :title="row.title" @click="onNodeClick(row)">
              <span class="dot" aria-hidden="true"></span>
              <span class="label">{{ row.title }}</span>
              <span v-if="row.pageLabel" class="page-badge">{{ row.pageLabel }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.knowledge-map {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 40px 8px 12px;
}

.map-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  padding: 0 8px 10px;
}

.map-heading {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--pix-text-muted);
}

.map-count {
  flex-shrink: 0;
  min-width: 18px;
  height: 16px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--pix-text-muted) 12%, transparent);
  color: var(--pix-text-muted);
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.map-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 12px;
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

.map-tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 2px 8px;
}

.chapter-block {
  margin: 0 2px 12px;
  padding-bottom: 2px;
}

.map-row {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: 8px;
}

.map-row.chapter {
  position: relative;
  z-index: 1;
  padding: 3px 4px 3px 2px;
  background: color-mix(in srgb, var(--branch) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--branch) 24%, transparent);
  border-left: 3px solid var(--branch);
}

.map-row.chapter.current,
.map-row.child-row.current {
  background: color-mix(in srgb, var(--branch) 18%, transparent);
}

.map-children {
  position: relative;
  margin: 0 0 0 14px;
  padding: 0 0 2px 0;
}

.child-row {
  position: relative;
  padding-left: calc(18px + var(--indent));
}

.child-row::before {
  content: "";
  position: absolute;
  left: 8px;
  top: 0;
  width: 2px;
  height: 50%;
  background: color-mix(in srgb, var(--branch) 62%, transparent);
}

.child-row:not(:last-child)::before {
  height: 100%;
}

.child-row::after {
  content: "";
  position: absolute;
  left: 8px;
  top: 50%;
  width: calc(12px + var(--indent));
  height: 2px;
  background: color-mix(in srgb, var(--branch) 62%, transparent);
  transform: translateY(-50%);
}

.row-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--pix-text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.row-chevron:hover {
  background: var(--pix-bg-hover);
  color: var(--pix-text-primary);
}

.row-chevron-spacer {
  width: 16px;
  flex-shrink: 0;
}

.map-node {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  padding: 4px 6px 4px 2px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: var(--pix-text-primary);
}

.map-node:hover {
  background: var(--pix-bg-hover);
}

.map-row.chapter .map-node:hover {
  background: color-mix(in srgb, var(--branch) 12%, #fff);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--branch);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--branch) 18%, transparent);
  flex-shrink: 0;
}

.map-row.chapter .dot {
  width: 9px;
  height: 9px;
}

.label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.35;
}

.map-row.chapter .label {
  font-weight: 600;
  font-size: 12.5px;
}

.page-badge {
  flex-shrink: 0;
  min-width: 18px;
  height: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--branch) 16%, #fff);
  color: var(--branch);
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
