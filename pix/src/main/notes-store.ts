/**
 * Reader notes storage: <workspace root>/.pix-read/notes.json
 *
 * 叶子模块（不 import electron，与 library-root.ts 同），数据只进工作区目录。
 * 主进程是唯一写者：读-改-写全用同步 fs，同一函数体内不得出现 await，
 * 因此两次 IPC 交错不会丢写；不需要写队列。
 * 写入协议：mkdir → 写 <target>.tmp → renameSync 覆盖；失败清理 tmp、原文件不动。
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { getLibraryRoot, isLibraryFilePath, isPathInsideDirectory } from "./library-root.js";
import type {
  ReaderNote,
  ReaderNoteDraft,
  ReaderNoteKind,
  ReaderNotesErrorCode,
  ReaderNotesExportResult,
  ReaderNotesFile,
  ReaderNotesLoadResult,
  ReaderNotesMutationResult,
  ReaderNotesReportChapter,
  ReaderNotesReportInput,
  ReaderNotesReportResult,
  ReaderNotesResetResult,
  ReaderNotesStatResult,
} from "../shared/types.js";

const NOTES_DIR_NAME = ".pix-read";
const NOTES_FILE_NAME = "notes.json";
const NOTES_MARKDOWN_NAME = "notes.md";
const REPORTS_DIR_NAME = "reports";
/** 空库与写失败专有文案（错误码复用既有码表，文案按调用点写死）。 */
const REPORT_EMPTY_MESSAGE = "当前文档暂无笔记，未生成报告";
const REPORT_WRITE_FAILED_MESSAGE = "报告写入失败";
const SCHEMA_VERSION = 1;
/** 单条原文上限（N18 验收 7）：超限拒绝保存，不静默截断。 */
const MAX_NOTE_TEXT_LENGTH = 4000;

const ERROR_MESSAGES: Record<ReaderNotesErrorCode, string> = {
  "no-root": "尚未选择资料库根目录",
  outside: "该文档不在当前资料库内",
  "invalid-input": "笔记数据不合法",
  "too-long": "选中内容过长（超过 4000 字），请分段摘录",
  "not-found": "笔记不存在（可能已被删除）",
  corrupt: "笔记文件无法读取（文件已损坏，未被修改）",
  "version-unsupported": "笔记文件版本不支持",
  "read-failed": "笔记文件读取失败",
  "write-failed": "笔记写入失败",
  empty: "暂无笔记可导出",
  "not-corrupt": "笔记文件未损坏，无需重建",
};

/** answer 超长文案；不能按 kind 给 ERROR_MESSAGES 加键（码表与 ReaderNotesErrorCode 一一对应，N35 验收 7）。 */
const ANSWER_TOO_LONG_MESSAGE = "回答过长（超过 4000 字），无法存为笔记";

/** restoreNote 专有文案（R10）：错误码复用既有码表，文案按调用点写死（同 ANSWER_TOO_LONG_MESSAGE 先例）。 */
const RESTORE_EMPTY_MESSAGE = "没有可撤销的删除";
const RESTORE_EXISTS_MESSAGE = "该笔记已重新存在，无法撤销";
const RESTORE_DUPLICATE_MESSAGE = "该笔记内容已重新存在，无法撤销";

/**
 * 撤销槽：只存最近一次成功删除的条目。内存态、不落盘、不跨重启、不参与序列化。
 * 只有成功的 deleteNote 设槽，只有成功的 restoreNote 与 resetCorruptNotes 清槽；失败一律保留（可重试）。
 */
let undoSlot: { root: string; note: ReaderNote; index: number } | null = null;

interface NotesPaths {
  file: string;
  markdown: string;
  reports: string;
}

type NotesRead = { ok: true; file: ReaderNotesFile } | { ok: false; code: ReaderNotesErrorCode; error: string };

type NotesWrite = { ok: true } | { ok: false; error: string };

function notesPaths(): NotesPaths | null {
  const root = getLibraryRoot();
  if (!root) return null;
  const dir = join(root, NOTES_DIR_NAME);
  return {
    file: join(dir, NOTES_FILE_NAME),
    markdown: join(dir, NOTES_MARKDOWN_NAME),
    reports: join(join(root, NOTES_DIR_NAME), REPORTS_DIR_NAME),
  };
}

function emptyNotesFile(): ReaderNotesFile {
  return { version: SCHEMA_VERSION, notes: [] };
}

function failure(code: ReaderNotesErrorCode): ReaderNotesMutationResult {
  return { success: false, notes: [], code, error: ERROR_MESSAGES[code] };
}

/** 失败回传空列表，与既有六通道同形；文案不走码表（撤销有三类专有文案）。 */
function restoreFailure(code: ReaderNotesErrorCode, error: string): ReaderNotesMutationResult {
  return { success: false, notes: [], code, error };
}

function corruptRead(): NotesRead {
  return { ok: false, code: "corrupt", error: ERROR_MESSAGES.corrupt };
}

function isEnoent(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT";
}

/** 比较键：小写 + 正斜杠 + 去尾斜杠（与渲染层 docPathKey 同约定）。 */
function docPathKey(docPath: string): string {
  return docPath.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** 写入前的唯一归一化点：去首尾 + 连续空白（含换行）折叠为单个空格。 */
function normalizeNoteText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** 草稿的绝对路径 → 工作区相对正斜杠路径；越界或落在根上返回 null。 */
function toRelativeDocPath(filePath: string, root: string): string | null {
  const resolved = resolve(filePath);
  if (!isLibraryFilePath(resolved)) return null;
  const relativePath = relative(root, resolved).split(sep).join("/");
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return null;
  return relativePath;
}

/** 存储态 docPath 必须能安全拼回工作区根：非空、非绝对、正斜杠、无 .. 段。 */
function isStoredDocPath(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  if (isAbsolute(value) || value.includes("\\")) return false;
  return !value.split("/").some((segment) => segment === "..");
}

function isReaderNote(value: unknown): value is ReaderNote {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note.id === "string" &&
    note.id.length > 0 &&
    (note.kind === "excerpt" || note.kind === "answer") &&
    isStoredDocPath(note.docPath) &&
    typeof note.page === "number" &&
    Number.isInteger(note.page) &&
    note.page >= 1 &&
    typeof note.text === "string" &&
    note.text.length > 0 &&
    note.text.length <= MAX_NOTE_TEXT_LENGTH &&
    typeof note.comment === "string" &&
    Number.isFinite(note.createdAt) &&
    Number.isFinite(note.updatedAt)
  );
}

/** 结构校验；任一条目不合法即判损坏：宁可报错，不静默丢条目。 */
function parseNotesFile(raw: string): NotesRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return corruptRead();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return corruptRead();
  const file = parsed as Record<string, unknown>;
  if (typeof file.version !== "number") return corruptRead();
  if (file.version !== SCHEMA_VERSION) {
    return { ok: false, code: "version-unsupported", error: ERROR_MESSAGES["version-unsupported"] };
  }
  const candidate: unknown = file.notes;
  if (!Array.isArray(candidate)) return corruptRead();
  const notes: unknown[] = candidate;
  if (!notes.every(isReaderNote)) return corruptRead();
  // id 重复会让 update/delete 语义歧义，按损坏处理
  if (new Set(notes.map((note) => note.id)).size !== notes.length) return corruptRead();
  return { ok: true, file: { version: SCHEMA_VERSION, notes } };
}

function readNotesFile(filePath: string): NotesRead {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    // 文件不存在按空库处理：不写盘，首次保存时创建
    if (isEnoent(err)) return { ok: true, file: emptyNotesFile() };
    return { ok: false, code: "read-failed", error: ERROR_MESSAGES["read-failed"] };
  }
  // BOM 会让 JSON.parse 失败；与 library-read-text 一样先剥掉
  return parseNotesFile(raw.replace(/^\uFEFF/, ""));
}

function writeFileAtomic(target: string, content: string): NotesWrite {
  const tmp = `${target}.tmp`;
  try {
    // 目录被用户删掉也能自愈（N18 验收 5）
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(tmp, content, "utf-8");
  } catch {
    removeTemp(tmp);
    return { ok: false, error: ERROR_MESSAGES["write-failed"] };
  }
  try {
    renameSync(tmp, target);
  } catch {
    removeTemp(tmp);
    return { ok: false, error: ERROR_MESSAGES["write-failed"] };
  }
  return { ok: true };
}

function removeTemp(tmp: string): void {
  try {
    rmSync(tmp, { force: true });
  } catch {
    // 清理失败不该覆盖真正的失败原因：原文件未被触碰
  }
}

function serializeNotes(file: ReaderNotesFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** N23 去重键扩一维 kind：同一段文字既摘录又存为结论时是两条独立资产（需求 §0.2）。 */
function duplicateKey(docPath: string, page: number, kind: ReaderNoteKind, text: string): string {
  return `${docPathKey(docPath)}\u0000${page}\u0000${kind}\u0000${text}`;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** 本地时间、无 locale 依赖：YYYY-MM-DD HH:mm:ss。 */
function formatStampHuman(ms: number): string {
  const date = new Date(ms);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** 备份文件后缀用紧凑格式：yyyyMMdd-HHmmss。 */
function formatStampDashed(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * 备份名必须唯一：Windows 上 renameSync 会静默覆盖同名目标，
 * 同一秒内二次重建不能覆盖上一份备份（原文件是用户唯一副本）。
 */
function uniqueBackupPath(filePath: string, now: number): string {
  const base = `${filePath}.corrupt-${formatStampDashed(now)}`;
  if (!existsSync(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existsSync(candidate)) return candidate;
  }
}

function workspaceName(root: string): string {
  const segments = root.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? root;
}

function renderMarkdownEntry(note: ReaderNote): string {
  // 原文写入前已归一化为单行；按行加前缀以兼容手工写入的换行
  const title = note.kind === "answer" ? `### 第 ${note.page} 页 · AI 结论` : `### 第 ${note.page} 页`;
  const lines = [title, "", ...note.text.split("\n").map((line) => `> ${line}`)];
  if (note.comment) {
    lines.push("", `备注：${note.comment}`);
  }
  return lines.join("\n");
}

/**
 * 导出模板（N21）：文档按比较键升序、组内页码升序再创建时间升序。
 * 不依赖「当前文档」——导出必须与打开哪个文档无关（幂等、可 diff）。
 */
function renderNotesMarkdown(file: ReaderNotesFile, name: string, now: number): string {
  const groups = new Map<string, ReaderNote[]>();
  for (const note of file.notes) {
    const key = docPathKey(note.docPath);
    const bucket = groups.get(key);
    if (bucket) bucket.push(note);
    else groups.set(key, [note]);
  }
  const sections = [
    `# 阅读笔记 · ${name}`,
    `> 由 PiX-Read 导出生成，每次导出都会覆盖。资料库：${name}；生成时间：${formatStampHuman(now)}；共 ${file.notes.length} 条。`,
  ];
  for (const [, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = [...group].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
    sections.push(`## ${ordered[0].docPath}（${ordered.length} 条）\n\n${ordered.map(renderMarkdownEntry).join("\n\n---\n\n")}`);
  }
  return `${sections.join("\n\n")}\n`;
}

/** 报告组内排序三键：page 升序 → createdAt 升序 → id 升序（不依赖 sort 稳定性）。 */
function sortReportEntries(entries: ReaderNote[]): ReaderNote[] {
  return [...entries].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** 章节标题：复用写入前的唯一空白折叠（不写第二份）；折叠后为空 ⇒ 逐字「未命名」。 */
function reportChapterTitle(title: string): string {
  return normalizeNoteText(title) || "未命名";
}

/**
 * 报告正文分组：章节组按入参顺序、第一条命中获胜、空组不渲染、兜底组恒最后；
 * 章节数组为空时退化为按页分组（页升序），不伪造章节标题。
 */
function reportBlocks(entries: ReaderNote[], chapters: ReaderNotesReportChapter[]): string[] {
  const heading = (title: string, list: ReaderNote[]) => `## ${title}（${list.length} 条）`;
  const block = (title: string, list: ReaderNote[]) =>
    `${heading(title, list)}\n\n${list.map(renderMarkdownEntry).join("\n\n---\n\n")}`;
  const blocks: string[] = [];
  if (chapters.length === 0) {
    // 退化：按页分组（entries 已按 page 升序 ⇒ Map 插入序即页升序，不写第二份区间比较）
    const byPage = new Map<number, ReaderNote[]>();
    for (const note of entries) {
      const bucket = byPage.get(note.page);
      if (bucket) bucket.push(note);
      else byPage.set(note.page, [note]);
    }
    for (const [page, list] of byPage) blocks.push(block(`第 ${page} 页`, list));
    return blocks;
  }
  const buckets = chapters.map(() => [] as ReaderNote[]);
  const fallback: ReaderNote[] = [];
  for (const note of entries) {
    // 归组谓词：闭区间、含两端；findIndex 返回最早命中者 ⇒「第一条命中获胜」
    const index = chapters.findIndex((chapter) => chapter.start <= note.page && note.page <= chapter.end);
    if (index >= 0) buckets[index].push(note);
    else fallback.push(note);
  }
  chapters.forEach((chapter, index) => {
    const list = buckets[index];
    if (list.length === 0) return; // 空组不渲染
    blocks.push(block(`${reportChapterTitle(chapter.title)} · 第 ${chapter.label} 页`, list));
  });
  if (fallback.length > 0) blocks.push(block("未归入章节", fallback));
  return blocks;
}

/** 报告正文渲染（纯函数；唯一非确定性输入 = now）。 */
function renderDocumentReport(
  entries: ReaderNote[],
  docPath: string,
  name: string,
  chapters: ReaderNotesReportChapter[],
  progress: { page: number; pageCount: number } | null,
  now: number,
): string {
  const ordered = sortReportEntries(entries);
  const excerpt = ordered.filter((note) => note.kind === "excerpt").length;
  const progressPart = progress ? `阅读进度：第 ${progress.page} / ${progress.pageCount} 页；` : "";
  const meta =
    `> 由 PiX-Read 生成，每次导出都会覆盖。资料库：${name}；文档：${docPath}；` +
    `生成时间：${formatStampHuman(now)}；${progressPart}共 ${ordered.length} 条（摘录 ${excerpt} · AI 结论 ${ordered.length - excerpt}）。`;
  return [`# 阅读报告 · ${workspaceName(docPath)}`, meta, ...reportBlocks(ordered, chapters)].join("\n\n") + "\n";
}

export function loadNotes(): ReaderNotesLoadResult {
  const paths = notesPaths();
  if (!paths) return { success: false, notes: [], filePath: "", code: "no-root", error: ERROR_MESSAGES["no-root"] };
  const read = readNotesFile(paths.file);
  if (!read.ok) return { success: false, notes: [], filePath: paths.file, code: read.code, error: read.error };
  return { success: true, notes: read.file.notes, filePath: paths.file };
}

export function addNote(draft: ReaderNoteDraft): ReaderNotesMutationResult {
  const paths = notesPaths();
  if (!paths) return failure("no-root");
  // kind 白名单必须在一切读写盘之前：非法取值一旦落盘，读侧的 isReaderNote 会把整库判成损坏
  if (draft.kind !== "excerpt" && draft.kind !== "answer") return failure("invalid-input");
  const root = getLibraryRoot();
  const docPath = toRelativeDocPath(draft.docFilePath, root);
  if (!docPath) return failure("outside");
  const text = normalizeNoteText(draft.text);
  if (!text || !Number.isInteger(draft.page) || draft.page < 1) return failure("invalid-input");
  if (text.length > MAX_NOTE_TEXT_LENGTH) {
    // 超限按 kind 分叉文案，但不截断
    return {
      success: false,
      notes: [],
      code: "too-long",
      error: draft.kind === "answer" ? ANSWER_TOO_LONG_MESSAGE : ERROR_MESSAGES["too-long"],
    };
  }

  const read = readNotesFile(paths.file);
  if (!read.ok) return failure(read.code);
  const key = duplicateKey(docPath, draft.page, draft.kind, text);
  const existing = read.file.notes.find((note) => duplicateKey(note.docPath, note.page, note.kind, note.text) === key);
  if (existing) {
    // 重复摘录不新增、不写盘，直接回传既有条目 id（N23 验收 1）
    return { success: true, notes: read.file.notes, duplicateOf: existing.id };
  }

  const now = Date.now();
  const note: ReaderNote = {
    id: randomUUID(),
    kind: draft.kind,
    docPath,
    page: draft.page,
    text,
    comment: "",
    createdAt: now,
    updatedAt: now,
  };
  const next: ReaderNotesFile = { version: SCHEMA_VERSION, notes: [...read.file.notes, note] };
  const write = writeFileAtomic(paths.file, serializeNotes(next));
  if (!write.ok) return failure("write-failed");
  return { success: true, notes: next.notes, note };
}

export function updateNoteComment(id: string, comment: string): ReaderNotesMutationResult {
  const paths = notesPaths();
  if (!paths) return failure("no-root");
  const read = readNotesFile(paths.file);
  if (!read.ok) return failure(read.code);
  const index = read.file.notes.findIndex((note) => note.id === id);
  if (index < 0) return failure("not-found");

  const updated: ReaderNote = { ...read.file.notes[index], comment, updatedAt: Date.now() };
  const next: ReaderNotesFile = {
    version: SCHEMA_VERSION,
    notes: read.file.notes.map((note, i) => (i === index ? updated : note)),
  };
  const write = writeFileAtomic(paths.file, serializeNotes(next));
  if (!write.ok) return failure("write-failed");
  return { success: true, notes: next.notes, note: updated };
}

export function deleteNote(id: string): ReaderNotesMutationResult {
  const paths = notesPaths();
  if (!paths) return failure("no-root");
  const read = readNotesFile(paths.file);
  if (!read.ok) return failure(read.code);
  const index = read.file.notes.findIndex((note) => note.id === id);
  if (index < 0) return failure("not-found");
  const notes = read.file.notes.filter((note) => note.id !== id);

  const write = writeFileAtomic(paths.file, serializeNotes({ version: SCHEMA_VERSION, notes }));
  if (!write.ok) return failure("write-failed");
  // 写盘成功才设槽（覆盖式，只存最近一条）：删除失败不能把上一次撤销权冲掉
  undoSlot = { root: getLibraryRoot(), note: read.file.notes[index], index };
  return { success: true, notes, note: read.file.notes[index] };
}

/**
 * 撤销最近一次成功删除（R10）：槽内原对象按删除前下标插回，不刷新 updatedAt ⇒ 文件字节回复。
 * 校验顺序自上而下第一条命中即返回；归属校验只读，绝不写别的库的目录。
 */
export function restoreNote(id: string): ReaderNotesMutationResult {
  const paths = notesPaths();
  if (!paths) return failure("no-root");
  const slot = undoSlot;
  if (!slot) return restoreFailure("not-found", RESTORE_EMPTY_MESSAGE);
  if (id !== slot.note.id) return restoreFailure("not-found", RESTORE_EMPTY_MESSAGE);
  if (docPathKey(slot.root) !== docPathKey(getLibraryRoot())) return restoreFailure("not-found", RESTORE_EMPTY_MESSAGE);
  const read = readNotesFile(paths.file);
  if (!read.ok) return restoreFailure(read.code, read.error);
  if (read.file.notes.some((note) => note.id === slot.note.id)) {
    return restoreFailure("invalid-input", RESTORE_EXISTS_MESSAGE);
  }
  // 去重键占用（同内容不同 id）：不覆盖不合并，否则会写出两条同键条目
  const key = duplicateKey(slot.note.docPath, slot.note.page, slot.note.kind, slot.note.text);
  if (read.file.notes.some((note) => duplicateKey(note.docPath, note.page, note.kind, note.text) === key)) {
    return restoreFailure("invalid-input", RESTORE_DUPLICATE_MESSAGE);
  }

  const notes = [...read.file.notes];
  notes.splice(Math.min(slot.index, notes.length), 0, slot.note);
  const write = writeFileAtomic(paths.file, serializeNotes({ version: SCHEMA_VERSION, notes }));
  if (!write.ok) return failure("write-failed");
  undoSlot = null;
  return { success: true, notes, note: slot.note };
}

export function exportNotesMarkdown(): ReaderNotesExportResult {
  const paths = notesPaths();
  if (!paths) return { success: false, code: "no-root", error: ERROR_MESSAGES["no-root"] };
  const read = readNotesFile(paths.file);
  if (!read.ok) return { success: false, code: read.code, error: read.error };
  if (read.file.notes.length === 0) return { success: false, code: "empty", error: ERROR_MESSAGES.empty };

  const markdown = renderNotesMarkdown(read.file, workspaceName(getLibraryRoot()), Date.now());
  const write = writeFileAtomic(paths.markdown, markdown);
  if (!write.ok) return { success: false, code: "write-failed", error: ERROR_MESSAGES["write-failed"] };
  return { success: true, filePath: paths.markdown, count: read.file.notes.length };
}

/**
 * 单文档阅读报告导出（R13）：只写一个报告文件，不碰 notes.json / notes.md。
 * 判定顺序：no-root → outside（相对化）→ outside（目标路径复核）→ 读取失败码 → empty → 渲染 → write-failed。
 */
export function exportDocumentReport(input: ReaderNotesReportInput): ReaderNotesReportResult {
  const paths = notesPaths();
  if (!paths) return { success: false, code: "no-root", error: ERROR_MESSAGES["no-root"] };
  const root = getLibraryRoot();
  const docPath = toRelativeDocPath(input.docFilePath, root);
  if (!docPath) return { success: false, code: "outside", error: ERROR_MESSAGES.outside };
  const target = join(paths.reports, ...docPath.split("/")) + ".md";
  // 双重防护：toRelativeDocPath 已保证在库内，这里再对「报告根」复核一次
  if (!isPathInsideDirectory(target, paths.reports)) {
    return { success: false, code: "outside", error: ERROR_MESSAGES.outside };
  }
  const read = readNotesFile(paths.file);
  if (!read.ok) return { success: false, code: read.code, error: read.error };
  const key = docPathKey(docPath);
  const entries = read.file.notes.filter((note) => docPathKey(note.docPath) === key);
  if (entries.length === 0) return { success: false, code: "empty", error: REPORT_EMPTY_MESSAGE };

  const markdown = renderDocumentReport(entries, docPath, workspaceName(root), input.chapters, input.progress, Date.now());
  const write = writeFileAtomic(target, markdown);
  if (!write.ok) return { success: false, code: "write-failed", error: REPORT_WRITE_FAILED_MESSAGE };
  return {
    success: true,
    filePath: target,
    displayPath: `${NOTES_DIR_NAME}/${REPORTS_DIR_NAME}/${docPath}.md`,
    count: entries.length,
  };
}

/** 损坏逃生口（N25）：仅用户显式触发；版本不支持与内容损坏同等对待。 */
export function resetCorruptNotes(): ReaderNotesResetResult {
  const paths = notesPaths();
  if (!paths) return { success: false, notes: [], code: "no-root", error: ERROR_MESSAGES["no-root"] };
  const read = readNotesFile(paths.file);
  if (read.ok) return { success: false, notes: [], code: "not-corrupt", error: ERROR_MESSAGES["not-corrupt"] };
  // read-failed 可能是临时占用或权限问题：改名会丢掉仍可恢复的文件，必须拒绝
  if (read.code !== "corrupt" && read.code !== "version-unsupported") {
    return { success: false, notes: [], code: read.code, error: read.error };
  }

  const backupPath = uniqueBackupPath(paths.file, Date.now());
  try {
    renameSync(paths.file, backupPath);
  } catch {
    return { success: false, notes: [], code: "write-failed", error: ERROR_MESSAGES["write-failed"] };
  }
  const write = writeFileAtomic(paths.file, serializeNotes(emptyNotesFile()));
  if (!write.ok) {
    // 备份已存在，必须把路径报给渲染层，否则用户无从找回原文件
    return { success: false, notes: [], backupPath, code: "write-failed", error: ERROR_MESSAGES["write-failed"] };
  }
  // 重建语义 = 从空库开始：把重建前删除的条目悄悄写回会让用户以为重建失败
  undoSlot = null;
  return { success: true, notes: [], backupPath };
}

/**
 * 笔记文件指纹（R14）：只读的最小事实 —— 不解析内容、不建目录/文件、不改 mtime、永不抛错。
 * 判定顺序：无根 → 读文件（ENOENT ⇒ exists:false 的成功统计；其余失败 ⇒ read-failed）→ sha256 原始字节。
 */
export function statNotesFile(): ReaderNotesStatResult {
  const paths = notesPaths();
  if (!paths) {
    return { success: false, exists: false, size: 0, mtimeMs: 0, hash: "", code: "no-root", error: ERROR_MESSAGES["no-root"] };
  }
  try {
    const bytes = readFileSync(paths.file);
    const stat = statSync(paths.file);
    return {
      success: true,
      exists: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      hash: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (err) {
    if (isEnoent(err)) return { success: true, exists: false, size: 0, mtimeMs: 0, hash: "" };
    return { success: false, exists: false, size: 0, mtimeMs: 0, hash: "", code: "read-failed", error: ERROR_MESSAGES["read-failed"] };
  }
}
