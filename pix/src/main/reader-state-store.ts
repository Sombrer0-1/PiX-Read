/**
 * Reader state storage: <workspace root>/.pix-read/reader-state.json
 *
 * 叶子模块（不 import electron，与 notes-store.ts 同），数据只进工作区目录。
 * 主进程是唯一写者：读-改-写全用同步 fs，同一函数体内不得出现 await，
 * 因此两次 IPC 交错不会丢写；不需要写队列。
 * 写入协议：mkdir → 写 <target>.tmp → renameSync 覆盖；失败清理 tmp、原文件不动。
 * 读侧只回报原因（missing/corrupt/version-unsupported/read-failed），任何分支都不改写文件。
 * 不 import notes-store：它的原子写与备份策略不适用于本文件（无备份、无逃生口）。
 */

import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { getLibraryRoot, isLibraryFilePath } from "./library-root.js";
import type {
  ReaderDocState,
  ReaderStateDegradeReason,
  ReaderStateErrorCode,
  ReaderStateFile,
  ReaderStateLoadResult,
  ReaderStateSaveDraft,
  ReaderStateSaveResult,
} from "../shared/types.js";

const STATE_DIR_NAME = ".pix-read";
const STATE_FILE_NAME = "reader-state.json";
const SCHEMA_VERSION = 1;
/** 与渲染层 reader-store 的 MIN_SCALE/MAX_SCALE 同域：主进程独立判，渲染层不做第二套校验。 */
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

const ERROR_MESSAGES: Record<ReaderStateErrorCode, string> = {
  "no-root": "尚未选择资料库根目录",
  outside: "该文档不在当前资料库内",
  "invalid-input": "阅读状态数据不合法",
  "read-failed": "阅读状态文件读取失败（未写入）",
  "write-failed": "阅读状态写入失败",
};

/** 四条降级原因的中文短句：只进日志与结果字段，不进 UI（文案本轮不冻结）。 */
const DEGRADE_MESSAGES: Record<ReaderStateDegradeReason, string> = {
  missing: "阅读状态文件不存在（尚无阅读现场记录）",
  corrupt: "阅读状态文件已损坏（未被修改）",
  "version-unsupported": "阅读状态文件版本不支持",
  "read-failed": "阅读状态文件读取失败",
};

type StateRead = { ok: true; file: ReaderStateFile } | { ok: false; reason: ReaderStateDegradeReason };

type StateWrite = { ok: true } | { ok: false };

/** 状态类失败对用户完全不可见：一条失败恰好一行日志（degraded ⇔ 恰一行 warn）。 */
function warn(message: string): void {
  console.warn(`[reader-state] ${message}`);
}

/** 状态文件绝对路径的唯一派生点；无工作区根时返回 null。 */
function stateFilePath(): string | null {
  const root = getLibraryRoot();
  if (!root) return null;
  return join(root, STATE_DIR_NAME, STATE_FILE_NAME);
}

function emptyState(): ReaderStateFile {
  return { version: SCHEMA_VERSION, lastDocPath: null, documents: {} };
}

function failure(code: ReaderStateErrorCode): ReaderStateSaveResult {
  warn(`save rejected (${code}): ${ERROR_MESSAGES[code]}`);
  return { success: false, state: emptyState(), code, error: ERROR_MESSAGES[code] };
}

/** 比较键：小写 + 正斜杠 + 去尾斜杠（与渲染层 docPathKey 同约定）。 */
function docPathKey(docPath: string): string {
  return docPath.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function isEnoent(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 存储态相对路径必须能安全拼回工作区根：非空、非绝对、正斜杠、无 .. 段。 */
function isStoredDocPath(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  if (isAbsolute(value) || value.includes("\\")) return false;
  return !value.split("/").some((segment) => segment === "..");
}

function isValidPage(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isValidScale(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_SCALE && value <= MAX_SCALE;
}

/** 草稿的绝对路径 → 工作区相对正斜杠路径；越界或落在根上返回 null。 */
function toRelativeDocPath(filePath: string, root: string): string | null {
  const resolved = resolve(filePath);
  if (!isLibraryFilePath(resolved)) return null;
  const relativePath = relative(root, resolved).split(sep).join("/");
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return null;
  return relativePath;
}

/** 条目级裁剪：任一字段非法只丢该条，其余条目照常生效（N26 只增不改）。 */
function parseDocState(value: unknown): ReaderDocState | null {
  if (!isRecord(value)) return null;
  if (!isValidPage(value.page) || !isValidScale(value.scale)) return null;
  // updatedAt 非关键字段：读不出就记 0，不因它丢现场
  const updatedAt = typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : 0;
  return { page: value.page, scale: value.scale, updatedAt };
}

/**
 * lastDocPath 交叉过滤：越界/绝对/解析后不存在或非文件 → 按无记录；
 * 有效但 documents 无对应条目 → 无条目等同无记录（不产生「无页码的半截入口」）。
 */
function resolveLastDoc(root: string, value: unknown, documents: Record<string, ReaderDocState>): string | null {
  if (!isStoredDocPath(value)) return null;
  const resolved = resolve(root, value);
  if (!isLibraryFilePath(resolved)) return null;
  try {
    if (!statSync(resolved).isFile()) return null;
  } catch {
    // 解析后不存在（或不可访问）：续读入口不显示
    return null;
  }
  // documents 的键域是相对路径比较键；绝对路径不得用查表
  return documents[docPathKey(value)] ? value : null;
}

/** 结构校验 + 条目裁剪 + lastDocPath 交叉过滤；任一硬错误只回报原因，不迁移、不修复。 */
function parseReaderState(raw: string, root: string): StateRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (!isRecord(parsed)) return { ok: false, reason: "corrupt" };
  if (typeof parsed.version !== "number") return { ok: false, reason: "corrupt" };
  if (parsed.version !== SCHEMA_VERSION) return { ok: false, reason: "version-unsupported" };
  if (!isRecord(parsed.documents)) return { ok: false, reason: "corrupt" };

  const documents: Record<string, ReaderDocState> = {};
  for (const [key, value] of Object.entries(parsed.documents)) {
    // 键不归一化即丢该条：模型里的键一律等于自己的比较键，读写才只有一个键域
    if (!isStoredDocPath(key) || docPathKey(key) !== key) continue;
    const entry = parseDocState(value);
    if (entry) documents[key] = entry;
  }

  return { ok: true, file: { version: SCHEMA_VERSION, lastDocPath: resolveLastDoc(root, parsed.lastDocPath, documents), documents } };
}

function readStateFile(filePath: string, root: string): StateRead {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    // 文件不存在按首启处理：不写盘，首次保存时创建
    return { ok: false, reason: isEnoent(err) ? "missing" : "read-failed" };
  }
  // BOM 会让 JSON.parse 失败；与 library-read-text / notes-store 一样先剥掉
  return parseReaderState(raw.replace(/^\uFEFF/, ""), root);
}

function removeTemp(tmp: string): void {
  try {
    rmSync(tmp, { force: true });
  } catch {
    // 清理失败不该覆盖真正的失败原因：原文件未被触碰
  }
}

function writeFileAtomic(target: string, content: string): StateWrite {
  const tmp = `${target}.tmp`;
  try {
    // 目录被用户删掉也能自愈
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(tmp, content, "utf-8");
  } catch {
    removeTemp(tmp);
    return { ok: false };
  }
  try {
    renameSync(tmp, target);
  } catch {
    removeTemp(tmp);
    return { ok: false };
  }
  return { ok: true };
}

function serializeState(file: ReaderStateFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** 读入口：降级只回报原因（success 仍为 true），无根时 success:false 且静默（不记 warn、不写盘）。 */
export function loadReaderState(): ReaderStateLoadResult {
  const root = getLibraryRoot();
  const filePath = stateFilePath();
  if (!root || !filePath) {
    return { success: false, state: emptyState(), filePath: "", degraded: false, code: "no-root", error: ERROR_MESSAGES["no-root"] };
  }
  const read = readStateFile(filePath, root);
  if (!read.ok) {
    warn(`load degraded (${read.reason}): ${DEGRADE_MESSAGES[read.reason]}`);
    return { success: true, state: emptyState(), filePath, degraded: true, reason: read.reason, error: DEGRADE_MESSAGES[read.reason] };
  }
  return { success: true, state: read.file, filePath, degraded: false };
}

/**
 * 写入口：只改目标条目（page/scale/updatedAt）+ lastDocPath，其它条目字段一字不动。
 * 读到 missing/corrupt/version-unsupported 允许以空模型整体覆盖重建；
 * 读到 read-failed 直接拒写且原文件字节不变——读不到就不知道其它文档的现场，
 * 覆盖 = 一次瞬时占用清空全部文档的阅读位置（与 notes-store.addNote 同口径）。
 */
export function saveReaderState(draft: ReaderStateSaveDraft): ReaderStateSaveResult {
  const root = getLibraryRoot();
  const filePath = stateFilePath();
  if (!root || !filePath) {
    // 无根：静默（不记 warn、不写盘）
    return { success: false, state: emptyState(), code: "no-root", error: ERROR_MESSAGES["no-root"] };
  }
  if (typeof draft.docFilePath !== "string" || !draft.docFilePath) return failure("invalid-input");
  const docPath = toRelativeDocPath(draft.docFilePath, root);
  if (!docPath) return failure("outside");
  if (!isValidPage(draft.page) || !isValidScale(draft.scale)) return failure("invalid-input");

  const read = readStateFile(filePath, root);
  if (!read.ok && read.reason === "read-failed") return failure("read-failed");
  const current = read.ok ? read.file : emptyState();

  const key = docPathKey(docPath);
  const next: ReaderStateFile = {
    version: SCHEMA_VERSION,
    lastDocPath: docPath,
    // 键顺序沿用读入顺序：已有键原位覆盖，新条目追加在末尾
    documents: { ...current.documents, [key]: { page: draft.page, scale: draft.scale, updatedAt: Date.now() } },
  };

  const write = writeFileAtomic(filePath, serializeState(next));
  if (!write.ok) return failure("write-failed");
  return { success: true, state: next };
}
