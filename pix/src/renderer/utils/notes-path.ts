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

/** 分组顺序：当前文档组置顶 → 其余按 key 升序；组内 page 升序 → 同页 createdAt 升序。 */
export function groupNotesByDocument(
  notes: ReaderNote[],
  currentKey: string | null,
  onlyCurrent: boolean
): NoteGroup[] {
  const groups = new Map<string, NoteGroup>();
  for (const note of notes) {
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
  // currentKey 为 null 时所有 isCurrentDoc 均为 false，过滤结果为空数组
  return onlyCurrent ? list.filter((group) => group.isCurrentDoc) : list;
}
