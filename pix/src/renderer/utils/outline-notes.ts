/**
 * 章节页码范围与笔记计数（渲染层唯一派生点，纯函数）。
 *
 * 口径约束：页码徽标文本、章节过滤范围、已读判定上界、笔记计数范围全部来自本文件
 * 同一份 `buildChapterRanges`；过滤判定式（rangeContains / matchesChapterFilter）实现
 * 落在 notes-path.ts，本文件只 re-export，不写第二份区间比较。
 * 范围是「页码范围」，不是「子树范围」：父节点范围不保证覆盖后代（预序中第一个更大
 * 页码的节点可能是自己的后代），因此所有文案与注释都按「页码范围内的笔记数」表述。
 */

import type { ReaderNote, ReaderOutlineNode } from "@shared/types";
import { docPathKey, matchesChapterFilter, rangeContains } from "./notes-path";

export { matchesChapterFilter, rangeContains };

export interface ChapterRange {
  key: string;
  title: string;
  start: number;
  end: number;
  label: string;
}

export interface ChapterNoteCount {
  total: number;
  excerpt: number;
  answer: number;
}

interface OutlineEntry {
  key: string;
  title: string;
  page: number | null;
}

/** 全量预序（含未展开节点）：键规则与地图行派生（KnowledgeMap 的 flattenVisible）逐字相同。 */
function collectPreorder(nodes: ReaderOutlineNode[], parentKey: string, into: OutlineEntry[]): void {
  nodes.forEach((node, index) => {
    const key = `${parentKey}/${index}`;
    into.push({ key, title: node.title.trim() || "未命名", page: node.page });
    collectPreorder(node.items, key, into);
  });
}

/**
 * 每个有页码节点的页码范围：end = 预序中第一个页码严格更大的节点的页码 - 1，
 * 无后继时取总页数（pageCount === 0 时取 +∞，仅防御、不参与渲染），并做 Math.min(end, pageCount) 钳制。
 * label 与 end 同源：无后继且 pageCount > start 的节点输出 `start-pageCount` 区间文本。
 */
export function buildChapterRanges(nodes: ReaderOutlineNode[], pageCount: number): Map<string, ChapterRange> {
  const flat: OutlineEntry[] = [];
  collectPreorder(nodes, "root", flat);

  const ranges = new Map<string, ChapterRange>();
  for (let i = 0; i < flat.length; i++) {
    const entry = flat[i];
    if (entry.page == null) continue;
    const start = entry.page;
    let end = pageCount > 0 ? pageCount : Number.POSITIVE_INFINITY;
    for (let j = i + 1; j < flat.length; j++) {
      const next = flat[j].page;
      if (next != null && next > start) {
        end = next - 1;
        if (pageCount > 0) end = Math.min(end, pageCount);
        break;
      }
    }
    ranges.set(entry.key, {
      key: entry.key,
      title: entry.title,
      start,
      end,
      label: Number.isFinite(end) && end > start ? `${start}-${end}` : String(start),
    });
  }
  return ranges;
}

/**
 * 当前文档在每个章节范围内的笔记数：对 notes 恰好一次遍历（按页分桶）→ 前缀和 O(1) 区间求和。
 * 只写 total > 0 的键；start > maxPage / end < start / end 非有限三种越域键不写（不让下标越界产生 NaN）。
 * kind 只有 excerpt | answer 两态（越域 kind 由主进程读侧白名单闭合），total === excerpt + answer 恒等。
 */
export function countNotesByChapter(
  ranges: Map<string, ChapterRange>,
  notes: ReaderNote[],
  docKey: string | null,
): Map<string, ChapterNoteCount> {
  const counts = new Map<string, ChapterNoteCount>();
  if (docKey === null || ranges.size === 0) return counts;

  // 前缀和长度以所有有限 end 的最大值为上界：有限范围不可能超出该值
  let maxPage = 0;
  for (const range of ranges.values()) {
    if (Number.isFinite(range.end)) maxPage = Math.max(maxPage, range.end);
  }

  const prefixTotal = new Array<number>(maxPage + 1).fill(0);
  const prefixAnswer = new Array<number>(maxPage + 1).fill(0);
  for (const note of notes) {
    if (docPathKey(note.docPath) !== docKey) continue;
    const page = note.page;
    if (!Number.isInteger(page) || page < 1 || page > maxPage) continue;
    prefixTotal[page] += 1;
    if (note.kind === "answer") prefixAnswer[page] += 1;
  }
  for (let page = 1; page <= maxPage; page++) {
    prefixTotal[page] += prefixTotal[page - 1];
    prefixAnswer[page] += prefixAnswer[page - 1];
  }

  for (const [key, range] of ranges) {
    const { start, end } = range;
    if (!Number.isFinite(end) || start > maxPage || end < start) continue;
    const total = prefixTotal[end] - prefixTotal[start - 1];
    if (total > 0) {
      const answer = prefixAnswer[end] - prefixAnswer[start - 1];
      counts.set(key, { total, excerpt: total - answer, answer });
    }
  }
  return counts;
}
