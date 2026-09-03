/**
 * Reading-path helpers shared by the reader panes.
 *
 * - Chat context injection for the reading agent.
 * - Library read failures: every read failure is bucketed into a fixed set of
 *   Chinese messages so a raw browser/IPC exception never reaches the UI.
 */

import type { LibraryFileResult } from "@shared/types";

export interface ReadingSendContext {
  filePath: string | null;
  page: number;
  pageCount: number;
  selectedText: string;
}

export function buildReadingUserMessage(userText: string, ctx: ReadingSendContext): string {
  if (!ctx.filePath) return userText;

  const lines = [
    "<reading_context>",
    `path: ${ctx.filePath}`,
    `page: ${ctx.page}`,
    `pageCount: ${ctx.pageCount}`,
  ];
  const selected = ctx.selectedText.trim();
  if (selected) {
    lines.push("selectedText:");
    lines.push(selected);
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
