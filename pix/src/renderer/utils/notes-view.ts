/**
 * 笔记列表的视图纯函数（R10）：搜索匹配、排序与复制片段的唯一实现点。
 *
 * 不 import Vue / Pinia / 组件 / store：只做数据变换，便于仓库外烟测直驱。
 * 归一化只有 normalizeQuery 一个 trim 判定点（matchesSearch 内部亦调它，幂等）。
 */

import type { ReaderNote } from "@shared/types";
import { docDisplayName, type NoteGroup } from "./notes-path";

export type NotesSortMode = "page" | "created";

/** 空态判别值：无过滤维度或列表非空时为 null（!hasNotes 由模板分支承担，不进本函数）。 */
export type ListEmptyReason = "search-chapter" | "search-current-doc" | "search" | "chapter" | "current-doc";

export interface ListEmptyInput {
  /** 传 store 的 activeQuery（内部仍 normalizeQuery，幂等）。 */
  query: string;
  /** V：groups 内条目总数。 */
  visibleCount: number;
  chapterFilterActive: boolean;
  currentDocOnly: boolean;
}

/** 撤销窗口：主进程槽的时限判据；UNDO_ROW_MS 是撤销行本身在界面上存活多久。 */
export const UNDO_WINDOW_MS = 5000;
export const UNDO_ROW_MS = 8000;

export const UNDO_EXPIRED_MESSAGE = "撤销窗口已过期（超过 5 秒），笔记未能还原";

/** 唯一 trim 判定点：只去首尾空白，不折叠内部空白、不做大小写与全半角变换。 */
export function normalizeQuery(rawQuery: string): string {
  return rawQuery.trim();
}

/** 只用 toLowerCase（不用 toLocaleLowerCase）、不用 RegExp；id/kind/docPath/page 不参与匹配。 */
export function matchesSearch(note: ReaderNote, query: string): boolean {
  const needle = normalizeQuery(query).toLowerCase();
  if (needle === "") return true;
  return note.text.toLowerCase().includes(needle) || note.comment.toLowerCase().includes(needle);
}

/** 返回新数组，不原地修改入参。 */
export function sortNotesForView(notes: ReaderNote[], mode: NotesSortMode): ReaderNote[] {
  const list = [...notes];
  if (mode === "page") {
    list.sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
    return list;
  }
  list.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  return list;
}

/** 搜索 + 排序的唯一管道：组数组顺序原样（当前文档置顶 → key 升序）、空组整组丢弃、入参不被修改。 */
export function applyViewToGroups(groups: NoteGroup[], query: string, mode: NotesSortMode): NoteGroup[] {
  return groups
    .map((group) => ({ ...group, notes: sortNotesForView(group.notes.filter((note) => matchesSearch(note, query)), mode) }))
    .filter((group) => group.notes.length > 0);
}

/**
 * 复制片段：原文逐行加引用前缀 → 空行 → 出处行（docDisplayName + 1-based 页码，answer 追加类型后缀）。
 * 不含 comment/id：备注只随导出出现，复制是只读的即时动作。
 */
export function buildNoteCopyFragment(note: ReaderNote): string {
  const lines = note.text.split("\n").map((line) => `> ${line}`);
  const suffix = note.kind === "answer" ? " · AI 结论" : "";
  return `${lines.join("\n")}\n\n—— ${docDisplayName(note.docPath)} · 第 ${note.page} 页${suffix}`;
}

/** 自上而下第一条命中：搜索类三态优先于章节/文档两态（搜索无匹配永不报成「本章暂无笔记」）。 */
export function resolveListEmptyReason(input: ListEmptyInput): ListEmptyReason | null {
  if (input.visibleCount !== 0) return null;
  const query = normalizeQuery(input.query);
  if (query !== "") {
    if (input.chapterFilterActive) return "search-chapter";
    if (input.currentDocOnly) return "search-current-doc";
    return "search";
  }
  if (input.chapterFilterActive) return "chapter";
  if (input.currentDocOnly) return "current-doc";
  return null;
}

/** 过期判据：窗口边界含端点（+5000 即过期）。 */
export function isUndoExpired(deletedAt: number, now: number): boolean {
  return now - deletedAt >= UNDO_WINDOW_MS;
}
