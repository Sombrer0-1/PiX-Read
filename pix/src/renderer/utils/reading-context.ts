/**
 * Reading-path helpers shared by the reader panes.
 *
 * - Chat context injection for the reading agent.
 * - Library read failures: every read failure is bucketed into a fixed set of
 *   Chinese messages so a raw browser/IPC exception never reaches the UI.
 */

import type { LibraryFileResult, ReaderNote, ReaderOutlineNode } from "@shared/types";
import { buildChapterRanges, formatChapterHeading, resolveCurrentChapter } from "./outline-notes";
import { sortNotesForContext } from "./notes-path";

export interface ReadingSendContext {
  filePath: string | null;
  page: number;
  pageCount: number;
  selectedText: string;
  /** 必填：选择集快照（发送瞬间的派生结果）；不给默认值，避免第二套向后兼容分支。 */
  notes: ReaderNote[];
  /** 必填：书签树快照（发送瞬间的派生结果）；不给默认值（漏传即编译期报错）。 */
  outline: ReaderOutlineNode[];
}

/** 条数上限：选择期拒绝第 11 条（R8 需求 §0.2 / 设计档 §1.2）。 */
export const MAX_CONTEXT_NOTES = 10;
/** reader_notes 段的字符上限，判据 = entries.join("\n").length（R8 需求 §0.2 / 设计档 §1.2）。 */
export const MAX_CONTEXT_NOTES_CHARS = 8000;

export interface NotesContextSelection {
  /** 已装入的条目块文本，顺序 = 注入顺序，entries.join("\n") 不超过字符上限。 */
  entries: string[];
  /** 与 entries 同序同长，供 chip 的 P 取数。 */
  injected: ReaderNote[];
  /** 整条丢弃（超字符上限，或防御式超条数上限），供 chip 的 M 取数。 */
  dropped: ReaderNote[];
}

/** 行内归一化：读侧不变量不可依赖（stub 与手工编辑的 notes.json 都可能带换行）。 */
function inlineNoteText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** 条目块 = 序号行（含 doc 字段）+ page/kind/text（+非空 comment）字段行，字段行 3 空格缩进。 */
function renderNoteEntry(index: number, note: ReaderNote): string {
  const lines = [
    `${index}. doc: ${note.docPath}`,
    `   page: ${note.page}`,
    `   kind: ${note.kind}`,
    `   text: ${inlineNoteText(note.text)}`,
  ];
  const comment = inlineNoteText(note.comment);
  if (comment) lines.push(`   comment: ${comment}`);
  return lines.join("\n");
}

/** 组装 reader_notes 条目：排序 → 条数上限 → 逐条尝试字符上限（超限整条丢弃并继续尝试）。 */
export function selectNotesForContext(notes: ReaderNote[]): NotesContextSelection {
  const sorted = sortNotesForContext(notes);
  const entries: string[] = [];
  const injected: ReaderNote[] = [];
  const dropped: ReaderNote[] = [];
  for (const [index, note] of sorted.entries()) {
    // 防御式条数裁剪：选择期已按派生计数硬拒第 11 条，本分支只在烟测可达
    if (index >= MAX_CONTEXT_NOTES) {
      dropped.push(note);
      continue;
    }
    // 序号按已装入条数续编 ⇒ 序号从 1 连续，被丢弃的条目不占号；不做字符级截断
    const block = renderNoteEntry(entries.length + 1, note);
    if ([...entries, block].join("\n").length > MAX_CONTEXT_NOTES_CHARS) {
      dropped.push(note);
      continue;
    }
    entries.push(block);
    injected.push(note);
  }
  return { entries, injected, dropped };
}

export function buildReadingUserMessage(userText: string, ctx: ReadingSendContext): string {
  if (!ctx.filePath) return userText;

  const lines = [
    "<reading_context>",
    `path: ${ctx.filePath}`,
    `page: ${ctx.page}`,
    `pageCount: ${ctx.pageCount}`,
  ];
  // 命中可解析 ⇒ pageCount 之后、selectedText 之前插入 section 行；不可解析 ⇒ 一行都不 push（逐字节等于旧格式）
  const chapter = resolveCurrentChapter(buildChapterRanges(ctx.outline, ctx.pageCount), ctx.page, ctx.pageCount);
  if (chapter) lines.push(`section: ${formatChapterHeading(chapter)}`);
  const selected = ctx.selectedText.trim();
  if (selected) {
    lines.push("selectedText:");
    lines.push(selected);
  }
  const picked = selectNotesForContext(ctx.notes);
  if (picked.entries.length > 0) {
    lines.push("reader_notes:");
    lines.push(...picked.entries);
  }
  lines.push("</reading_context>");
  if (userText) {
    lines.push("");
    lines.push(userText);
  }
  return lines.join("\n");
}

// ============================================================================
// Library read failures
// ============================================================================

export type LibraryReadFailure =
  | "renderer-unavailable"
  | "no-library-root"
  | "outside-library"
  | "read-failed"
  | "file-too-large"
  | "corrupt-document";

const FAILURE_MESSAGES: Record<LibraryReadFailure, string> = {
  "renderer-unavailable": "渲染进程不可用",
  "no-library-root": "请先在左侧选择资料库根目录",
  "outside-library": "该文件不在当前资料库内",
  "read-failed": "文件读取失败",
  "file-too-large": "文件过大，无法内嵌打开",
  "corrupt-document": "PDF 文件已损坏或格式不支持",
};

export function libraryReadFailureMessage(failure: LibraryReadFailure): string {
  return FAILURE_MESSAGES[failure];
}

/** A read failure that already knows which bucket the UI should show. */
export class LibraryReadError extends Error {
  readonly failure: LibraryReadFailure;
  readonly detail: string;

  constructor(failure: LibraryReadFailure, detail: string) {
    super(FAILURE_MESSAGES[failure]);
    this.name = "LibraryReadError";
    this.failure = failure;
    this.detail = detail;
  }
}

/** preload 未注入或版本不匹配时给出“渲染进程不可用”，而不是 fetch 报错。 */
export function hasLibraryReadApi(): boolean {
  return typeof window !== "undefined" && typeof window.pixApi?.libraryReadFile === "function";
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * Renderer-side containment pre-check: the UI already knows which project it
 * opened, so a missing root is reported without paying an IPC round trip.
 */
export function preflightLibraryPath(
  filePath: string,
  libraryRoot: string | null | undefined,
): LibraryReadFailure | null {
  if (!filePath) return "read-failed";
  if (!libraryRoot?.trim()) return "no-library-root";
  const root = normalizePath(libraryRoot);
  return normalizePath(filePath).startsWith(`${root}/`) ? null : "outside-library";
}

const IPC_PATTERNS: Array<[RegExp, LibraryReadFailure]> = [
  [
    /root\s+is\s+not\s+set|no\s+library\s+root|library\s+root\s+is\s+(empty|missing|unset)|尚未选择资料库|未设置资料库/i,
    "no-library-root",
  ],
  [/outside\s+the\s+library|not\s+inside\s+the\s+library|forbidden|\b403\b|不在当前资料库/i, "outside-library"],
  [/too\s+large|文件过大/i, "file-too-large"],
  [/invalid\s+pdf|missing\s+pdf|not\s+a\s+pdf|password|unexpected\s+response|损坏|格式/i, "corrupt-document"],
];

/** Map the `error` string returned by library* IPC handlers into a UI bucket. */
export function failureFromIpcError(error: string | null | undefined): LibraryReadFailure {
  const text = (error ?? "").trim();
  if (!text) return "read-failed";
  for (const [pattern, failure] of IPC_PATTERNS) {
    if (pattern.test(text)) return failure;
  }
  return "read-failed";
}

/** Prefer the machine-readable code from libraryReadFile; fall back to its message. */
export function failureFromLibraryResult(result: LibraryFileResult): LibraryReadFailure {
  switch (result.code) {
    case "no-root":
      return "no-library-root";
    case "outside":
      return "outside-library";
    case "too-large":
      return "file-too-large";
    case "invalid":
    case "not-found":
    case "read-failed":
      return "read-failed";
    default:
      return failureFromIpcError(result.error);
  }
}

const PDF_EXCEPTION_NAME = /^(InvalidPDFException|MissingPDFException|UnexpectedResponseException|PasswordException|UnknownErrorException|NotImplementedException)$/;

/** Map a pdf.js parse/render rejection into a UI bucket. */
export function failureFromParseError(err: unknown): LibraryReadFailure {
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (PDF_EXCEPTION_NAME.test(name)) return "corrupt-document";
  if (/invalid\s+pdf|incorrect\s+header|file\s+is\s+damaged|password|missing\s+table/i.test(message)) {
    return "corrupt-document";
  }
  return "read-failed";
}

/** Technical line kept under the Chinese message; never the only thing shown. */
export function technicalDetail(err: unknown): string {
  const text =
    err instanceof Error ? `${err.name}: ${err.message}` : typeof err === "string" ? err : String(err ?? "");
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 240 ? `${cleaned.slice(0, 240)}…` : cleaned;
}
