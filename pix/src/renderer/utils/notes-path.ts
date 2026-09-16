/**
 * 笔记的路径与分组规则（渲染层唯一实现点，纯函数）。
 *
 * 命名纪律：docPath = 相对工作区根（存储/分组/展示）；docFilePath = 绝对路径（仅草稿与跳转）；
 * 比较键 = 小写 + 正斜杠 + 去尾斜杠，与 project-store.normalizePath 同约定。
 */

import type { ReaderNote } from "@shared/types";

export interface NoteGroup {
  key: string;
  docPath: string;
  displayName: string;
  isCurrentDoc: boolean;
  notes: ReaderNote[];
}

export function docPathKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** 绝对文档路径 → 相对比较键；不在资料库内或为空时返回 null。 */
export function currentDocKey(filePath: string | null, root: string): string | null {
  if (!filePath || !root) return null;
  // 全部运算在小写域内完成，避免大小写变换导致下标错位
  const fileKey = docPathKey(filePath);
  const prefix = `${docPathKey(root)}/`;
  if (!fileKey.startsWith(prefix)) return null;
  return fileKey.slice(prefix.length) || null;
}

export function docDisplayName(docPath: string): string {
  const segments = docPath.replace(/\\/g, "/").split("/").filter(Boolean);
  return segments[segments.length - 1] ?? docPath;
}

/**
 * 相对路径 → 绝对路径。分隔符跟随 root：资料库树节点由 path.join 生成，
 * 跳转目标必须与它同形，否则字符串比较会把同文档当成换文档并整篇重载。
 */
export function absoluteDocPath(root: string, docPath: string): string {
  const sep = root.includes("\\") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${sep}${docPath.replace(/[\\/]+/g, sep)}`;
}

export interface PageRange {
  start: number;
  end: number;
}

/** 闭区间命中：页码非有限或小于 1 时不命中（不抛错）。 */
export function rangeContains(range: PageRange, page: number): boolean {
  return Number.isFinite(page) && page >= range.start && page <= range.end;
}

/**
 * 章节过滤的唯一判定式：docKey 为空恒 false；range === null 时只做文档归属判定
 * ——不是恒真，否则「仅看当前文档」的回退语义会被吞掉。
 */
export function matchesChapterFilter(note: ReaderNote, docKey: string | null, range: PageRange | null): boolean {
  if (docKey === null) return false;
  if (docPathKey(note.docPath) !== docKey) return false;
  return range === null || rangeContains(range, note.page);
}

export interface NotesBadgeCount {
  total: number;
  excerpt: number;
  answer: number;
}

/** 按文档聚合的笔记计数（R14 树徽标唯一派生）：单次遍历、键 = docPathKey、只产出 total > 0 的文档、每次返回新 Map。 */
export function countNotesByDocument(notes: ReaderNote[]): Map<string, NotesBadgeCount> {
  const counts = new Map<string, NotesBadgeCount>();
  for (const note of notes) {
    const key = docPathKey(note.docPath);
    const current = counts.get(key) ?? { total: 0, excerpt: 0, answer: 0 };
    current.total += 1;
    if (note.kind === "answer") current.answer += 1;
    else current.excerpt += 1;
    counts.set(key, current);
  }
  return counts;
}

export interface PageNoteCount {
  total: number;
  excerpt: number;
  answer: number;
}

/** 按页聚合的笔记计数（R16 页标记唯一派生）：单次遍历、键 = 页号、非法页号跳过、只产出 total > 0 的页、每次返回新 Map。 */
export function countNotesByPage(notes: ReaderNote[], docKey: string | null): Map<number, PageNoteCount> {
  const counts = new Map<number, PageNoteCount>();
  if (docKey === null) return counts;
  for (const note of notes) {
    if (docPathKey(note.docPath) !== docKey) continue;
    if (!Number.isInteger(note.page) || note.page < 1) continue;
    const current = counts.get(note.page) ?? { total: 0, excerpt: 0, answer: 0 };
    current.total += 1;
    if (note.kind === "answer") current.answer += 1;
    else current.excerpt += 1;
    counts.set(note.page, current);
  }
  return counts;
}

/** 分组顺序：当前文档组置顶 → 其余按 key 升序；组内 page 升序 → 同页 createdAt 升序。 */
export function groupNotesByDocument(
  notes: ReaderNote[],
  currentKey: string | null,
  onlyCurrent: boolean,
  chapterRange: PageRange | null = null
): NoteGroup[] {
  const groups = new Map<string, NoteGroup>();
  for (const note of notes) {
    // 章节过滤生效时逐条等于唯一判定式（含文档归属）；未生效时退回 onlyCurrent 判定：
    // 章节分支直调该判定式，同文件内不写第二份区间谓词，也不引入中间组合变量
    const visible =
      chapterRange !== null
        ? matchesChapterFilter(note, currentKey, chapterRange)
        : !onlyCurrent || docPathKey(note.docPath) === currentKey;
    if (!visible) continue;
    const key = docPathKey(note.docPath);
    const group = groups.get(key);
    if (group) {
      group.notes.push(note);
      continue;
    }
    groups.set(key, {
      key,
      docPath: note.docPath,
      displayName: docDisplayName(note.docPath),
      isCurrentDoc: key === currentKey,
      notes: [note],
    });
  }

  const list = [...groups.values()];
  for (const group of list) {
    group.notes.sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
  }
  list.sort((a, b) => (a.isCurrentDoc === b.isCurrentDoc ? a.key.localeCompare(b.key) : a.isCurrentDoc ? -1 : 1));
  // 可见性已在入组前逐条判定；currentKey 为 null 时无组通过（chapterRange 非空时同理，判定式恒 false）
  return list;
}

/**
 * 注入顺序（R8 需求 §0.2 / 设计档 §1.2）：docPathKey 升序 → page 升序 → createdAt 升序 → id 升序，
 * 与面板分组顺序（groupNotesByDocument）无关；排序实现点唯一在此（reading-context 顶层 import）。
 */
export function sortNotesForContext(notes: ReaderNote[]): ReaderNote[] {
  return [...notes].sort(
    (a, b) =>
      docPathKey(a.docPath).localeCompare(docPathKey(b.docPath)) ||
      a.page - b.page ||
      a.createdAt - b.createdAt ||
      a.id.localeCompare(b.id)
  );
}
