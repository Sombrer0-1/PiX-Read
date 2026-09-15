/**
 * ui-shot.mjs — 离屏 Electron 截图取证（自包含脚本）
 *
 * 运行（git bash 下 node 不在 PATH，需前置）：
 *   cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
 * 退出码 0 = 全部场景与截图成功；失败会落在 shots/99-failure-state.png 并打印错误原文。
 *
 * 产物（全部在临时目录，不写仓库）：
 *   <OUT_ROOT>/shots/*.png           截图（全景 + 组件级裁切）
 *   <OUT_ROOT>/shots/MANIFEST.json   截图清单 + 失败信息
 *   <OUT_ROOT>/shots/MEASUREMENTS.json 几何/样式采样（字号、对齐、文字层变量）
 *   <OUT_ROOT>/library               fixture 资料库（含脚本生成的最小 PDF）
 *   <OUT_ROOT>/stub-preload.cjs      session 级 stub pixApi
 *
 * 职责：本文件既是 Electron 主进程入口也是编排器。
 *  1. 在临时目录（默认 %TEMP%/pix-r5）生成 fixture 资料库、假 PDF 与 stub preload（.cjs）。
 *  2. 用仓库自身的 vite.config.ts 在同一进程内起 5199 端口开发服务器（缓存写临时目录）。
 *  3. 以 show:false + offscreen 窗口加载 http://localhost:5199，用 stub 进入工作区，
 *     按场景点击真实 DOM 并 capturePage() 出图。
 *
 * 约束：只写临时目录，不写仓库；stub 的 pixApi 必须与 src/main/preload.ts 的 API 面一致。
 * 离屏窗口只在 DOM 变更时出帧，capturePage() 会拿到上一帧，因此每张图前必须 invalidate() 并等一拍。
 * 注意：脚本内不得使用 inline dynamic import；stub 是字符串模板，内部不能出现反引号。
 */
import { app, BrowserWindow } from "electron";
import { createServer } from "vite";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PIX_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_ROOT = process.env.PIX_SHOT_ROOT || "C:/Users/86157/AppData/Local/Temp/pix-r5";
const SHOTS_DIR = join(OUT_ROOT, "shots");
const LIBRARY_DIR = join(OUT_ROOT, "library");
/** 第二工作区：同名文件（同字节）是「跨工作区不串现场」的最强判据。 */
const LIBRARY_B_DIR = join(OUT_ROOT, "library-b");
const LIBRARY_NAME = "pix-r5-library";
const LIBRARY_B_NAME = "pix-r5-library-b";
const STUB_PATH = join(OUT_ROOT, "stub-preload.cjs");
const PORT = 5199;
const URL = `http://localhost:${PORT}/`;
const WINDOW = { width: 1600, height: 1000 };

/** 场景点击的落点选择器（与产品 DOM 约定一致：pill 标签、笔记面板、quick-ask）。 */
const SEL = {
  recentProject: ".project-list-item",
  workspace: ".workspace-page",
  tabNotes: '.pill-tab[data-tab="notes"]',
  tabLibrary: '.pill-tab[data-tab="library"]',
  notesPanel: ".notes-panel",
  notesEmpty: ".notes-empty",
  noteRow: ".note-row",
  notesGroupHead: ".notes-group-head",
  currentDocChip: ".notes-group-head .v-chip",
  notesFilterInput: ".notes-filter input",
  treeRow: ".tree-row",
  pdfPageOne: '.pdf-page[data-page="1"] .textLayer span',
  quickAsk: ".quick-ask",
  quickAskFeedbackOk: ".quick-ask-feedback.is-ok",
};

// ---------------------------------------------------------------------------
// fixture：最小可用 PDF（pdf.js 需要真实 xref，文本用 Helvetica/WinAnsi，仅 ASCII）
// ---------------------------------------------------------------------------

function escapePdfText(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(pages) {
  const objBodies = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  const contentIds = pages.map((_, index) => 5 + index * 2);
  objBodies.push("<< /Type /Catalog /Pages 2 0 R >>");
  objBodies.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  objBodies.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  pages.forEach((lines, index) => {
    objBodies.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[index]} 0 R >>`,
    );
    // 每行自带字号（pt）：真实论文的标题/正文/脚注字号不同，文字层字号回退因此可被判读
    let stream = "BT\n";
    lines.forEach((line, lineIndex) => {
      stream += `/F1 ${line.size} Tf\n`;
      stream += `1 0 0 1 56 ${740 - lineIndex * 20} Tm\n`;
      stream += `(${escapePdfText(line.text)}) Tj\n`;
    });
    stream += "ET";
    objBodies.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  let out = "%PDF-1.4\n";
  const offsets = [];
  objBodies.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = out.length;
  const size = objBodies.length + 1;
  out += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const SAMPLE_PAGES = [
  [
    { text: "Sparse Attention for Long-Context Retrieval", size: 20 },
    { text: "Abstract. We study retrieval over long documents where the", size: 12 },
    { text: "attention budget is the binding constraint. Our method keeps", size: 12 },
    { text: "linear complexity while improving recall to 91.3% on the", size: 12 },
    { text: "LongBench suite, matching dense baselines at one third cost.", size: 12 },
    { text: "Keywords: retrieval, sparse attention, ablation", size: 10 },
  ],
  [
    { text: "3. Ablation Study", size: 16 },
    { text: "Table 2 reports the ablation over the sparse mask budget.", size: 12 },
    { text: "Removing the positional prior costs 2.4 points of recall,", size: 12 },
    { text: "which confirms the mask is doing more than sparsification.", size: 12 },
  ],
  [
    { text: "4. Conclusion", size: 16 },
    { text: "Sparse attention keeps recall at one third of the dense budget,", size: 12 },
    { text: "and the ablation holds across all three random seeds.", size: 12 },
  ],
];

const OLDER_PAGES = [
  [
    { text: "Earlier Work on Dense Passage Retrieval", size: 18 },
    { text: "Section 2 reviews dense dual-encoder retrieval baselines.", size: 12 },
  ],
  [
    { text: "Section 4. Reproducibility", size: 16 },
    { text: "All runs use three seeds and report the median.", size: 12 },
  ],
];

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** 种子笔记：覆盖「多文档分组 / 当前文档标记 / 长文折叠 / 备注空与非空」。 */
function seedNotes() {
  const now = Date.now();
  return [
    {
      id: "n-current-1",
      kind: "excerpt",
      docPath: "sample-paper.pdf",
      page: 1,
      text: "We study retrieval over long documents where the attention budget is the binding constraint.",
      comment: "与第 3 节消融实验对照",
      createdAt: now - 4 * MINUTE,
      updatedAt: now - 4 * MINUTE,
    },
    {
      id: "n-current-2",
      kind: "excerpt",
      docPath: "sample-paper.pdf",
      page: 2,
      text:
        "Table 2 reports the ablation over the sparse mask budget. Removing the positional prior costs 2.4 points of recall, " +
        "which confirms the mask is doing more than sparsification alone; the effect persists when the retrieval corpus is " +
        "truncated to the first 8k tokens, so the gain cannot be attributed to longer effective context windows.",
      comment: "",
      createdAt: now - 2 * MINUTE,
      updatedAt: now - 2 * MINUTE,
    },
    {
      id: "n-other-1",
      kind: "excerpt",
      docPath: "archive/older-paper.pdf",
      page: 7,
      text: "Section 4. Reproducibility: all runs use three seeds and report the median.",
      comment: "",
      createdAt: now - 26 * HOUR,
      updatedAt: now - 26 * HOUR,
    },
  ];
}

function writeFixtures() {
  mkdirSync(join(LIBRARY_DIR, "archive"), { recursive: true });
  mkdirSync(join(LIBRARY_DIR, ".pix-read"), { recursive: true });
  mkdirSync(join(LIBRARY_B_DIR, ".pix-read"), { recursive: true });
  mkdirSync(SHOTS_DIR, { recursive: true });
  // A/B 两个工作区的 sample-paper.pdf 同字节；B 不预置 reader-state.json（首启 missing）
  const samplePdf = buildPdf(SAMPLE_PAGES);
  writeFileSync(join(LIBRARY_DIR, "sample-paper.pdf"), samplePdf);
  writeFileSync(join(LIBRARY_B_DIR, "sample-paper.pdf"), samplePdf);
  // 上一轮遗留的状态文件会让「首启 missing」不可复现：fixture 冻结为两个工作区都没有它
  rmSync(join(LIBRARY_DIR, ".pix-read", "reader-state.json"), { force: true });
  rmSync(join(LIBRARY_B_DIR, ".pix-read", "reader-state.json"), { force: true });
  writeFileSync(join(LIBRARY_DIR, "archive", "older-paper.pdf"), buildPdf(OLDER_PAGES));
  writeFileSync(
    join(LIBRARY_DIR, "reading-notes.md"),
    "# 阅读清单\n\n- [x] sample-paper.pdf\n- [ ] archive/older-paper.pdf\n",
  );
  writeFileSync(
    join(LIBRARY_DIR, ".pix-read", "notes.json"),
    JSON.stringify({ version: 1, notes: seedNotes() }, null, 2),
  );
}

// ---------------------------------------------------------------------------
// stub preload：pixApi 全量 API 面 + window.__pixStub 控制口
// ---------------------------------------------------------------------------

function buildStub() {
  const config = {
    root: LIBRARY_DIR,
    rootB: LIBRARY_B_DIR,
    name: LIBRARY_NAME,
    nameB: LIBRARY_B_NAME,
    samplePath: join(LIBRARY_DIR, "sample-paper.pdf"),
    samplePathB: join(LIBRARY_B_DIR, "sample-paper.pdf"),
    olderPath: join(LIBRARY_DIR, "archive", "older-paper.pdf"),
    notesFilePath: join(LIBRARY_DIR, ".pix-read", "notes.json"),
  };
  const configJson = JSON.stringify(config, null, 2);
  return `/**
 * stub-preload.cjs — ui-shot.mjs 生成的假 pixApi（CJS，sandbox 关闭）。
 * API 面与 pix/src/main/preload.ts 对齐；无真实主进程、无网络、无密钥。
 */
const { contextBridge } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const CONFIG = ${configJson};
const NOTES_FILE = CONFIG.notesFilePath;

// 起始为空：空态截图必须先于 seedNotes 出现（种子数据由场景显式写入）
let notes = [];
let loadDelayMs = 0;
let loadFailure = null;
// PDF 字节读取的注入延迟：只为「加载窗口内连点」场景造出确定的在途加载窗口
let libraryReadDelayMs = 0;

function clone(list) {
  return list.map(function (note) { return Object.assign({}, note); });
}

function sleep(ms) {
  return new Promise(function (done) { setTimeout(done, ms); });
}

const MODELS = [
  { provider: "anthropic", id: "claude-sonnet-4-20250514", contextWindow: 200000, reasoning: true, thinkingLevels: ["off", "low", "medium", "high"], input: ["text", "image"] },
  { provider: "openai", id: "gpt-5", contextWindow: 400000, reasoning: true, thinkingLevels: ["off", "low", "medium", "high"], input: ["text", "image"] },
];

const SESSION_STATE = {
  model: MODELS[0],
  thinkingLevel: "medium",
  isStreaming: false,
  isCompacting: false,
  executionMode: "unattended",
  steeringMode: "all",
  followUpMode: "one-at-a-time",
  sessionFile: path.join(CONFIG.root, ".pix-read", "session-demo.jsonl"),
  sessionId: "sess-demo",
  sessionName: "摘录与笔记走查",
  autoCompactionEnabled: true,
  messageCount: 0,
  pendingMessageCount: 0,
};

const SESSION_STATS = {
  sessionFile: SESSION_STATE.sessionFile,
  sessionId: "sess-demo",
  userMessages: 0,
  assistantMessages: 0,
  toolCalls: 0,
  toolResults: 0,
  totalMessages: 0,
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  cost: 0,
  contextUsage: { tokens: 0, contextWindow: 200000, percent: 0 },
};

function handleCommand(command) {
  const type = command ? command.type : "";
  if (type === "get_state") return { success: true, data: SESSION_STATE };
  if (type === "get_available_models") return { success: true, data: { models: MODELS } };
  if (type === "get_commands") return { success: true, data: { commands: [] } };
  if (type === "get_session_stats") return { success: true, data: SESSION_STATS };
  if (type === "get_messages") return { success: true, data: [] };
  if (type === "new_session" || type === "switch_session" || type === "clone" || type === "fork") {
    return { success: true, data: { cancelled: false } };
  }
  return { success: true, data: {} };
}

function relativeDocPath(target) {
  const root = CONFIG.root.replace(/\\\\/g, "/").replace(/\\/+$/, "");
  const full = String(target).replace(/\\\\/g, "/");
  const prefix = root + "/";
  return full.toLowerCase().startsWith(prefix.toLowerCase()) ? full.slice(prefix.length) : full;
}

// --- 阅读现场：按 activeRoot 真读真写，判据与 src/main/reader-state-store.ts 同口径 ---
const STATE_DIR = ".pix-read";
const STATE_FILE_NAME = "reader-state.json";
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

// startSession(dir) 记录；stopSession 不清（与真实主进程的已知差异，已在开发档声明）
let activeRoot = CONFIG.root;
let stateLoadDelayMs = 0;
// 只影响 save 的返回，不影响 load 的读文件语义
let stateSaveFailure = null;
const readerStateCalls = [];

function normalizePath(value) {
  return String(value).replace(/\\\\/g, "/").replace(/\\/+$/, "").toLowerCase();
}

function stateFilePath() {
  return path.join(activeRoot, STATE_DIR, STATE_FILE_NAME);
}

function emptyState() {
  return { version: 1, lastDocPath: null, documents: {} };
}

function docPathKey(value) {
  return String(value).replace(/\\\\/g, "/").replace(/\\/+$/, "").toLowerCase();
}

function isStoredDocPath(value) {
  if (typeof value !== "string" || !value) return false;
  if (path.isAbsolute(value) || value.indexOf("\\\\") >= 0) return false;
  return value.split("/").indexOf("..") < 0;
}

function isValidPage(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isValidScale(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_SCALE && value <= MAX_SCALE;
}

function parseDocState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!isValidPage(value.page) || !isValidScale(value.scale)) return null;
  const updatedAt = typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : 0;
  return { page: value.page, scale: value.scale, updatedAt: updatedAt };
}

// 条目级裁剪 + lastDocPath 交叉过滤（与主进程同口径；裁剪必须实现，否则 21b 无法判别）
function normalizeState(raw) {
  const documents = {};
  const source = raw && typeof raw === "object" && !Array.isArray(raw) && raw.documents && typeof raw.documents === "object" && !Array.isArray(raw.documents) ? raw.documents : {};
  Object.keys(source).forEach(function (key) {
    if (!isStoredDocPath(key) || docPathKey(key) !== key) return;
    const parsed = parseDocState(source[key]);
    if (parsed) documents[key] = parsed;
  });
  let lastDocPath = null;
  const candidate = raw && typeof raw === "object" ? raw.lastDocPath : null;
  if (isStoredDocPath(candidate) && documents[docPathKey(candidate)]) {
    try {
      lastDocPath = fs.statSync(path.resolve(activeRoot, candidate)).isFile() ? candidate : null;
    } catch (err) {
      lastDocPath = null;
    }
  }
  return { version: 1, lastDocPath: lastDocPath, documents: documents };
}

// 真读文件 + 真解析：missing / corrupt / version-unsupported / read-failed
function readStateFile() {
  let text;
  try {
    text = fs.readFileSync(stateFilePath(), "utf8");
  } catch (err) {
    return { ok: false, reason: err && err.code === "ENOENT" ? "missing" : "read-failed" };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, reason: "corrupt" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "corrupt" };
  if (typeof parsed.version !== "number") return { ok: false, reason: "corrupt" };
  if (parsed.version !== 1) return { ok: false, reason: "version-unsupported" };
  if (!parsed.documents || typeof parsed.documents !== "object" || Array.isArray(parsed.documents)) {
    return { ok: false, reason: "corrupt" };
  }
  return { ok: true, state: normalizeState(parsed) };
}

function writeStateFile(state) {
  const file = stateFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\\n", "utf8");
}

const LIBRARY_TREE = [
  { name: "archive", path: path.join(CONFIG.root, "archive"), type: "directory", children: [
    { name: "older-paper.pdf", path: CONFIG.olderPath, type: "file" },
  ] },
  { name: "reading-notes.md", path: path.join(CONFIG.root, "reading-notes.md"), type: "file" },
  { name: "sample-paper.pdf", path: CONFIG.samplePath, type: "file" },
];

// B 树只返回同名的那一行：场景 24 的 B 侧断言必须有真实的树可断言
const LIBRARY_TREE_B = [
  { name: "sample-paper.pdf", path: CONFIG.samplePathB, type: "file" },
];

function libraryList(dir) {
  const key = normalizePath(dir);
  if (key === normalizePath(CONFIG.root)) return { success: true, nodes: LIBRARY_TREE };
  if (key === normalizePath(CONFIG.rootB)) return { success: true, nodes: LIBRARY_TREE_B };
  if (key.endsWith("/archive")) return { success: true, nodes: LIBRARY_TREE[0].children };
  return { success: true, nodes: [] };
}

function readBinary(target) {
  try {
    return { success: true, data: new Uint8Array(fs.readFileSync(target)) };
  } catch (err) {
    return { success: false, code: "read-failed", error: String(err && err.message ? err.message : err) };
  }
}

function readText(target) {
  const result = readBinary(target);
  if (!result.success) return result;
  return { success: true, data: result.data, content: Buffer.from(result.data).toString("utf8") };
}

const api = {
  selectProject: async function () { return CONFIG.root; },
  selectChatFiles: async function () { return []; },

  startSession: async function (dir) { if (dir) activeRoot = dir; return { success: true }; },
  stopSession: async function () { return { success: true }; },
  isAgentRunning: async function () { return true; },
  sendCommand: async function (command) { return handleCommand(command); },

  getSettings: async function () {
    return {
      theme: "light",
      recentProjects: [
        { path: CONFIG.root, name: CONFIG.name, lastOpened: Date.now(), sessionCount: 0 },
        { path: CONFIG.rootB, name: CONFIG.nameB, lastOpened: Date.now() - 60000, sessionCount: 0 },
      ],
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4-20250514",
      defaultThinkingLevel: "medium",
    };
  },
  setSettings: async function () { return { success: true }; },
  getStoragePaths: async function () {
    return {
      rootDir: CONFIG.root,
      agentDir: path.join(CONFIG.root, "agent"),
      guiSettingsFile: path.join(CONFIG.root, "pix-settings.json"),
      kernelSettingsFile: path.join(CONFIG.root, "agent", "settings.json"),
      authJsonFile: path.join(CONFIG.root, "agent", "auth.json"),
      modelsJsonFile: path.join(CONFIG.root, "agent", "models.json"),
      mcpJsonFile: path.join(CONFIG.root, "agent", "mcp.json"),
      sessionsRootDir: path.join(CONFIG.root, "agent", "sessions"),
      logsDir: path.join(CONFIG.root, "logs"),
    };
  },

  onAgentEvent: function () { return function () {}; },
  onAgentReady: function () { return function () {}; },
  onAgentExit: function () { return function () {}; },
  onAgentError: function () { return function () {}; },
  onUserInputRequest: function () { return function () {}; },

  listSessions: async function () { return []; },
  deleteSession: async function () { return { success: true }; },

  libraryList: async function (dir) { return libraryList(dir); },
  libraryOpenPath: async function () { return { success: true }; },
  libraryShowInFolder: async function () { return { success: true }; },
  libraryReadText: async function (target) { return readText(target); },
  libraryReadFile: async function (target) {
    if (libraryReadDelayMs) await sleep(libraryReadDelayMs);
    return readBinary(target);
  },

  notesLoad: async function () {
    if (loadDelayMs) await sleep(loadDelayMs);
    if (loadFailure) {
      return { success: false, notes: [], filePath: NOTES_FILE, code: loadFailure.code, error: loadFailure.error };
    }
    return { success: true, notes: clone(notes), filePath: NOTES_FILE };
  },
  notesAdd: async function (draft) {
    const docPath = relativeDocPath(draft.docFilePath);
    const existing = notes.find(function (note) {
      return note.docPath === docPath && note.page === draft.page && note.text === draft.text;
    });
    if (existing) return { success: true, notes: clone(notes), duplicateOf: existing.id };
    const note = {
      id: "n-" + Date.now(),
      kind: "excerpt",
      docPath: docPath,
      page: draft.page,
      text: draft.text,
      comment: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    notes = notes.concat([note]);
    return { success: true, notes: clone(notes), note: note };
  },
  notesUpdate: async function (id, comment) {
    notes = notes.map(function (note) {
      return note.id === id ? Object.assign({}, note, { comment: comment, updatedAt: Date.now() }) : note;
    });
    return { success: true, notes: clone(notes) };
  },
  notesDelete: async function (id) {
    notes = notes.filter(function (note) { return note.id !== id; });
    return { success: true, notes: clone(notes) };
  },
  notesExport: async function () {
    return { success: true, filePath: path.join(CONFIG.root, ".pix-read", "notes.md"), count: notes.length };
  },
  notesReset: async function () {
    notes = [];
    return { success: true, notes: [], backupPath: NOTES_FILE + ".bak" };
  },

  readerStateLoad: async function () {
    if (stateLoadDelayMs) await sleep(stateLoadDelayMs);
    const file = stateFilePath();
    const read = readStateFile();
    if (!read.ok) {
      return { success: true, state: emptyState(), filePath: file, degraded: true, reason: read.reason, error: read.reason };
    }
    return { success: true, state: read.state, filePath: file, degraded: false };
  },
  readerStateSave: async function (draft) {
    const docFilePath = draft && typeof draft.docFilePath === "string" ? draft.docFilePath : "";
    readerStateCalls.push({ docFilePath: docFilePath, page: draft ? draft.page : null, scale: draft ? draft.scale : null });
    if (stateSaveFailure) {
      return { success: false, state: emptyState(), code: stateSaveFailure, error: stateSaveFailure };
    }
    const read = readStateFile();
    if (!read.ok && read.reason === "read-failed") {
      return { success: false, state: emptyState(), code: "read-failed", error: "read-failed" };
    }
    const current = read.ok ? read.state : emptyState();
    const prefix = normalizePath(activeRoot) + "/";
    const full = String(docFilePath).replace(/\\\\/g, "/");
    const relative = full.toLowerCase().indexOf(prefix) === 0 ? full.slice(prefix.length) : full;
    const key = docPathKey(relative);
    const documents = Object.assign({}, current.documents);
    documents[key] = { page: draft.page, scale: draft.scale, updatedAt: Date.now() };
    const next = { version: 1, lastDocPath: relative, documents: documents };
    writeStateFile(next);
    return { success: true, state: next };
  },

  windowMinimize: async function () {},
  windowMaximize: async function () {},
  windowClose: async function () {},
  windowIsMaximized: async function () { return false; },
  onWindowMaximizeChange: function () { return function () {}; },

  mcpGetServers: async function () { return []; },
  mcpGetConfig: async function () { return { path: "", servers: [] }; },

  checkForUpdates: async function () { return { success: true, hasUpdate: false, currentVersion: "0.1.0" }; },
  downloadUpdate: async function () { return { success: true }; },
  installUpdate: function () {},
};

contextBridge.exposeInMainWorld("pixApi", api);

contextBridge.exposeInMainWorld("__pixStub", {
  seedNotes: function (list) { notes = list.map(function (note) { return Object.assign({}, note); }); },
  setLoadDelay: function (ms) { loadDelayMs = ms; },
  setLibraryReadDelay: function (ms) { libraryReadDelayMs = ms; },
  setLoadFailure: function (code, error) { loadFailure = code ? { code: code, error: error } : null; },
  relativeDocPath: function (target) { return relativeDocPath(target); },
  setReaderState: function (state) {
    if (state === null) {
      try {
        fs.rmSync(stateFilePath(), { force: true });
      } catch (err) {
        // 已不存在
      }
      return stateFilePath();
    }
    writeStateFile(state);
    return stateFilePath();
  },
  setReaderStateDelay: function (ms) { stateLoadDelayMs = ms; },
  setReaderStateFailure: function (code) { stateSaveFailure = code || null; },
  readerStateSaveCalls: function () { return { count: readerStateCalls.length, payloads: readerStateCalls.slice(-8) }; },
  readerStateFilePath: function () { return stateFilePath(); },
});
`;
}

// ---------------------------------------------------------------------------
// 场景驱动
// ---------------------------------------------------------------------------

const shots = [];
const measurements = [];
/** 渲染层 console 全集：[reader-state] warn 断言一律取增量基线（同一会话会累计）。 */
const rendererLogs = [];

/** 离屏 capturePage() 只返回上一帧；先 invalidate 再等一拍，否则会拍到差一个状态帧。 */
async function repaint(win) {
  win.webContents.invalidate();
  await new Promise((done) => setTimeout(done, 200));
}

async function capturePage(win, name, rect) {
  await repaint(win);
  const image = rect ? await win.webContents.capturePage(rect) : await win.webContents.capturePage();
  const file = join(SHOTS_DIR, name);
  writeFileSync(file, image.toPNG());
  shots.push({ name, file, rect: rect || null });
  console.log(`[shot] ${name}${rect ? ` (${rect.width}x${rect.height} @ ${rect.x},${rect.y})` : ""}`);
  return file;
}

async function runScenario(win, log) {
  const js = (code) => win.webContents.executeJavaScript(code, true);

  const waitFor = async (label, expression, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const ok = await js(`Boolean(${expression})`).catch(() => false);
      if (ok) return;
      if (Date.now() > deadline) throw new Error(`等待超时：${label}（${expression}）`);
      await new Promise((done) => setTimeout(done, 120));
    }
  };
  const click = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click(), true`);
  const rectOf = async (selector, pad = 0) => {
    const rect = await js(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
    })()`);
    if (!rect) return null;
    const x = Math.max(0, rect.x - pad);
    const y = Math.max(0, rect.y - pad);
    return {
      x,
      y,
      width: Math.min(WINDOW.width - x, rect.width + pad * 2),
      height: Math.min(WINDOW.height - y, rect.height + pad * 2),
    };
  };

  // A. 首页 → 工作区（stub 的 recentProjects 提供假资料库根）
  await waitFor("首页最近项目卡片", `document.querySelector(${JSON.stringify(SEL.recentProject)})`);
  log("点击最近项目卡片进入工作区");
  await click(SEL.recentProject);
  await waitFor("工作区三栏", `document.querySelector(${JSON.stringify(SEL.workspace)})`);
  await waitFor("左侧 pill 标签", `document.querySelector(${JSON.stringify(SEL.tabNotes)})`);
  await capturePage(win, "00-workspace-enter.png");

  // B. 笔记面板空态
  await click(SEL.tabNotes);
  await waitFor("笔记空态", `document.querySelector(${JSON.stringify(SEL.notesEmpty)})`);
  await capturePage(win, "01-notes-empty.png");
  const leftPane = await rectOf(".layout-left", 2);
  if (leftPane) await capturePage(win, "01b-notes-empty-left-pane.png", leftPane);

  // C. 笔记列表态
  log("写入种子笔记并重新加载面板");
  await js(`window.__pixStub.seedNotes(${JSON.stringify(seedNotes())}), true`);
  await click(SEL.tabLibrary);
  await click(SEL.tabNotes);
  await waitFor("笔记列表", `document.querySelectorAll(${JSON.stringify(SEL.noteRow)}).length >= 3`);
  await js(`document.querySelector(${JSON.stringify(SEL.notesPanel)}).scrollTop = 0, true`);
  await capturePage(win, "02-notes-list.png");
  if (leftPane) await capturePage(win, "02b-notes-list-left-pane.png", leftPane);
  const headerRect = await rectOf(".notes-header", 2);
  if (headerRect) await capturePage(win, "02c-notes-header-zoom.png", headerRect);
  const groupRect = await rectOf(SEL.notesGroupHead, 6);
  if (groupRect) await capturePage(win, "02d-notes-group-head-zoom.png", groupRect);
  const rowRect = await rectOf(SEL.noteRow, 6);
  if (rowRect) await capturePage(win, "02e-notes-row-zoom.png", rowRect);

  // D. 打开 PDF → 当前文档态（chip / 开关可用 / 分组置顶）
  log("从资料库树打开 sample-paper.pdf");
  await click(SEL.tabLibrary);
  await js(`(() => {
    const rows = Array.from(document.querySelectorAll(${JSON.stringify(SEL.treeRow)}));
    const row = rows.find((el) => (el.getAttribute("title") || "").includes("sample-paper.pdf"));
    if (!row) throw new Error("library row not found");
    row.click();
    return true;
  })()`);
  await waitFor("PDF 文本层", `document.querySelector(${JSON.stringify(SEL.pdfPageOne)})`, 30000);
  await click(SEL.tabNotes);
  await waitFor("当前文档标记", `document.querySelector(${JSON.stringify(SEL.currentDocChip)})`);
  await js(`document.querySelector(${JSON.stringify(SEL.notesPanel)}).scrollTop = 0, true`);
  await capturePage(win, "03-notes-current-doc.png");
  if (leftPane) await capturePage(win, "03b-notes-current-doc-left-pane.png", leftPane);

  // E. 仅看当前文档筛选
  log("打开「仅看当前文档」筛选");
  await click(SEL.notesFilterInput);
  await waitFor("筛选后仅剩当前文档分组", `document.querySelectorAll(${JSON.stringify(SEL.notesGroupHead)}).length === 1`);
  await capturePage(win, "04-notes-filtered-current-doc.png");
  const filterRect = await rectOf(".notes-header", 2);
  if (filterRect) await capturePage(win, "04b-notes-filter-on-zoom.png", filterRect);
  await click(SEL.notesFilterInput);
  await waitFor("筛选复位", `document.querySelectorAll(${JSON.stringify(SEL.notesGroupHead)}).length === 2`);
  // Vuetify switch 有过渡动画，展开/确认态截图前等它收尾
  await new Promise((done) => setTimeout(done, 350));

  // E2. 展开全文 / 删除二次确认：两个瞬时行内状态
  log("展开长摘录 + 删除二次确认");
  await js(`(() => {
    const expand = Array.from(document.querySelectorAll(".note-expand"))[0];
    if (expand) expand.click();
    return !!expand;
  })()`);
  await capturePage(win, "05-note-expanded.png");
  await js(`document.querySelector(${JSON.stringify(SEL.noteRow)}).querySelector(".note-delete").click(), true`);
  await waitFor("删除确认态", `document.querySelector(${JSON.stringify(SEL.noteRow)}).classList.contains("confirming")`);
  await capturePage(win, "05b-note-delete-confirm.png");
  await js(`document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), true`);
  await waitFor("删除确认复位", `!document.querySelector(${JSON.stringify(SEL.noteRow)}).classList.contains("confirming")`);

  // F. 摘录入口：在 PDF 文本层造一个真实选区
  log("在 PDF 首页文本层构造选区");
  await js(`(() => {
    const span = document.querySelector(${JSON.stringify(SEL.pdfPageOne)});
    if (!span) throw new Error("text layer span not found");
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return selection.toString();
  })()`);
  await waitFor("摘录浮层", `document.querySelector(${JSON.stringify(SEL.quickAsk)}).offsetParent !== null`);
  // 首帧与稳定帧分批取证：showFor 先可见、后测量定位
  await capturePage(win, "06-excerpt-entry-first-frame.png");
  await new Promise((done) => setTimeout(done, 700));
  await capturePage(win, "06b-excerpt-entry-settled.png");
  const quickAskRect = await rectOf(SEL.quickAsk, 30);
  if (quickAskRect) await capturePage(win, "06c-excerpt-entry-zoom.png", quickAskRect);
  // 隐藏文字层后重拍同一区域：判定选中时的重影是文字层还是 canvas
  await js(`document.querySelectorAll(".textLayer").forEach((el) => { el.style.opacity = "0"; }), true`);
  if (quickAskRect) await capturePage(win, "06e-text-layer-hidden-zoom.png", quickAskRect);
  await js(`document.querySelectorAll(".textLayer").forEach((el) => { el.style.opacity = ""; }), true`);
  // A/B：同一区域在「有选区」与「无选区」下的文字层渲染对比
  measurements.push({
    label: "pdf-text-layer-geometry",
    data: await js(`(() => {
      const page = document.querySelector('.pdf-page[data-page="1"]');
      const spans = Array.from(page.querySelectorAll('.textLayer span'));
      const pageBox = page.getBoundingClientRect();
      const first = spans[0] ? spans[0].getBoundingClientRect() : null;
      const style = spans[0] ? getComputedStyle(spans[0]) : null;
      const layer = page.querySelector('.textLayer');
      return {
        pageBox: { x: Math.round(pageBox.x), y: Math.round(pageBox.y), w: Math.round(pageBox.width), h: Math.round(pageBox.height) },
        spanCount: spans.length,
        firstSpan: first ? { dx: Math.round(first.x - pageBox.x), dy: Math.round(first.y - pageBox.y), w: Math.round(first.width), h: Math.round(first.height) } : null,
        firstSpanText: spans[0] ? spans[0].textContent : null,
        spanFontSize: style ? style.fontSize : null,
        spanFontFamily: style ? style.fontFamily : null,
        spanColor: style ? style.color : null,
        scaleFactorVar: layer ? getComputedStyle(layer).getPropertyValue("--scale-factor") : null,
        canvasWidth: (() => { const c = page.querySelector("canvas"); return c ? c.style.width : null; })(),
      };
    })()`),
  });
  await js(`window.getSelection().removeAllRanges(), document.dispatchEvent(new Event("selectionchange")), true`);
  await waitFor("浮层隐藏", `document.querySelector(${JSON.stringify(SEL.quickAsk)}).offsetParent === null`);
  if (quickAskRect) await capturePage(win, "06d-selection-cleared-zoom.png", quickAskRect);
  await js(`(() => {
    const span = document.querySelector(${JSON.stringify(SEL.pdfPageOne)});
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return true;
  })()`);
  await waitFor("摘录浮层复现", `document.querySelector(${JSON.stringify(SEL.quickAsk)}).offsetParent !== null`);

  // G. 摘录动作 → 原位反馈
  log("点击「摘录」按钮");
  await js(`(() => {
    const buttons = Array.from(document.querySelectorAll(".quick-ask-btn"));
    const target = buttons.find((el) => (el.textContent || "").includes("摘录"));
    if (!target) throw new Error("excerpt button not found");
    target.click();
    return true;
  })()`);
  await waitFor("摘录成功反馈", `document.querySelector(${JSON.stringify(SEL.quickAskFeedbackOk)})`);
  await capturePage(win, "07-excerpt-feedback.png");
  const feedbackRect = await rectOf(SEL.quickAsk, 30);
  if (feedbackRect) await capturePage(win, "07b-excerpt-feedback-zoom.png", feedbackRect);

  // G2. 同文本重复摘录 → duplicate 反馈
  log("重复摘录（去重反馈）");
  await js(`(() => {
    const span = document.querySelector(${JSON.stringify(SEL.pdfPageOne)});
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return true;
  })()`);
  await waitFor("摘录浮层重现", `document.querySelector(${JSON.stringify(SEL.quickAsk)}).offsetParent !== null`);
  await js(`(() => {
    const buttons = Array.from(document.querySelectorAll(".quick-ask-btn"));
    const target = buttons.find((el) => (el.textContent || "").includes("摘录"));
    if (!target) throw new Error("excerpt button not found");
    target.click();
    return true;
  })()`);
  await waitFor("去重反馈", `document.querySelector(".quick-ask-feedback.is-duplicate")`);
  const duplicateRect = await rectOf(SEL.quickAsk, 30);
  if (duplicateRect) await capturePage(win, "07c-excerpt-duplicate-zoom.png", duplicateRect);

  // H. 回到笔记面板：摘录结果进入列表（去重 + 计数）
  await click(SEL.tabLibrary);
  await click(SEL.tabNotes);
  await waitFor("笔记计数增加", `document.querySelectorAll(${JSON.stringify(SEL.noteRow)}).length >= 4`);
  await js(`document.querySelector(${JSON.stringify(SEL.notesPanel)}).scrollTop = 0, true`);
  await capturePage(win, "08-notes-after-excerpt.png");
  if (leftPane) await capturePage(win, "08b-notes-after-excerpt-left-pane.png", leftPane);

  // I. 加载态：延迟 notesLoad 后立刻出图
  log("抓取加载态");
  await js(`window.__pixStub.setLoadDelay(4000), true`);
  await click(SEL.tabLibrary);
  await click(SEL.tabNotes);
  await new Promise((done) => setTimeout(done, 250));
  await capturePage(win, "09-notes-loading.png");
  await js(`window.__pixStub.setLoadDelay(0), true`);
  await waitFor("加载态结束", `document.querySelector(${JSON.stringify(SEL.noteRow)})`);

  // J. 错误态：corrupt 编码 → 标题 + 逃生口按钮
  log("抓取错误态");
  await js(
    `window.__pixStub.setLoadFailure("corrupt", "notes.json 第 3 行解析失败：Unexpected token } in JSON at position 148"), true`,
  );
  await click(SEL.tabLibrary);
  await click(SEL.tabNotes);
  await waitFor("错误态", `document.querySelector(".notes-error")`);
  await capturePage(win, "10-notes-error.png");
  if (leftPane) await capturePage(win, "10b-notes-error-left-pane.png", leftPane);
  await js(`window.__pixStub.setLoadFailure(null, ""), true`);

  // K. 几何/样式采样：截图给现象，测量给数值
  await click(SEL.tabLibrary);
  await click(SEL.tabNotes);
  await waitFor("恢复列表", `document.querySelectorAll(${JSON.stringify(SEL.noteRow)}).length >= 4`);
  const measure = () =>
    js(`(() => {
      const box = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          fontSize: style.fontSize, color: style.color, background: style.backgroundColor,
        };
      };
      const filter = document.querySelector(".notes-filter input");
      const thumb = document.querySelector(".notes-filter .v-switch__thumb");
      const track = document.querySelector(".notes-filter .v-switch__track");
      const control = document.querySelector(".notes-filter .v-selection-control");
      const trackBox = track ? track.getBoundingClientRect() : null;
      const thumbBox = thumb ? thumb.getBoundingClientRect() : null;
      const panel = document.querySelector(${JSON.stringify(SEL.notesPanel)});
      return {
        header: box(".notes-header"),
        count: box(".notes-count"),
        filterSwitch: box(".notes-filter"),
        filterChecked: filter ? filter.checked : null,
        filterDisabled: filter ? filter.disabled : null,
        trackColor: track ? getComputedStyle(track).backgroundColor : null,
        thumbTransform: thumb ? getComputedStyle(thumb).transform : null,
        trackBox: trackBox ? { x: Math.round(trackBox.x), y: Math.round(trackBox.y), w: Math.round(trackBox.width), h: Math.round(trackBox.height) } : null,
        thumbBox: thumbBox ? { x: Math.round(thumbBox.x), y: Math.round(thumbBox.y), w: Math.round(thumbBox.width), h: Math.round(thumbBox.height) } : null,
        controlBox: control ? (() => { const r = control.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })() : null,
        labelBox: box(".notes-filter .v-label"),
        groupHead: box(${JSON.stringify(SEL.notesGroupHead)}),
        groupName: box(".group-name"),
        groupPath: box(".group-path"),
        chip: box(${JSON.stringify(SEL.currentDocChip)}),
        noteRow: box(${JSON.stringify(SEL.noteRow)}),
        pageBadge: box(".note-page-badge"),
        noteTime: box(".note-time"),
        deleteBtn: box(".note-delete"),
        noteText: box(".note-text"),
        commentTrigger: box(".comment-trigger"),
        exportBtn: box(".notes-header-top .v-btn"),
        panelScroll: panel ? { clientH: panel.clientHeight, scrollH: panel.scrollHeight } : null,
        quickAsk: box(${JSON.stringify(SEL.quickAsk)}),
        paneLeft: box(".layout-left"),
      };
    })()`);
  measurements.push({ label: "list-current-doc-filter-off", data: await measure() });
  await click(SEL.notesFilterInput);
  await waitFor("筛选开启", `document.querySelectorAll(${JSON.stringify(SEL.notesGroupHead)}).length === 1`);
  await new Promise((done) => setTimeout(done, 350));
  measurements.push({ label: "list-current-doc-filter-on", data: await measure() });
  await click(SEL.notesFilterInput);
  await waitFor("筛选关闭", `document.querySelectorAll(${JSON.stringify(SEL.notesGroupHead)}).length === 2`);
  await new Promise((done) => setTimeout(done, 350));
  measurements.push({ label: "after-filter-off-settled", data: await measure() });
  const headerOffRect = await rectOf(".notes-header", 2);
  if (headerOffRect) await capturePage(win, "11-notes-header-filter-off-zoom.png", headerOffRect);
}

// ---------------------------------------------------------------------------
// 场景 20-*：阅读现场（R6 / N26–N34）
//
// 节奏固定为：goHome（安全点 b：flush 先于 stopSession）→ 注入状态文件 →
// 从首页项目卡重回工作区 → 断言。注入必须在「已返回首页之后、进入工作区之前」，
// 否则安全点 flush 会覆盖注入内容；同一场景需要两次不同注入时重复一遍这个循环。
// ---------------------------------------------------------------------------

async function runReaderStateScenarios(win, log) {
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

  const STATE_FILE_A = join(LIBRARY_DIR, ".pix-read", "reader-state.json");
  const STATE_FILE_B = join(LIBRARY_B_DIR, ".pix-read", "reader-state.json");

  const waitFor = async (label, expression, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const ok = await js(`Boolean(${expression})`).catch(() => false);
      if (ok) return;
      if (Date.now() > deadline) throw new Error(`等待超时：${label}（${expression}）`);
      await sleep(120);
    }
  };

  /** 断言语义：先落测量再抛错，失败时 MEASUREMENTS.json 里能看到现场值。 */
  const record = (label, data, failures) => {
    measurements.push({ label, data });
    if (failures.length) throw new Error(`断言失败 ${label}：${failures.join("；")} | ${JSON.stringify(data)}`);
  };

  const textOf = (selector) => js(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    return el ? el.textContent.replace(/\\s+/g, " ").trim() : null;
  })()`);
  const has = (selector) => js(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  const countOf = (selector) => js(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  const stateBytes = (file) => readFileSync(file);
  const readState = (file) => JSON.parse(readFileSync(file, "utf8"));
  const writeState = (file, state) => writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  const removeState = (file) => {
    try {
      rmSync(file, { force: true });
    } catch {
      // 已不存在
    }
  };
  const entry = (page, scale) => ({ page, scale, updatedAt: Date.now() });
  const saveCalls = () => js("window.__pixStub.readerStateSaveCalls()");
  const lastPayload = async () => (await saveCalls()).payloads.slice(-1)[0] ?? null;
  const warnCount = () => rendererLogs.filter((line) => line.includes("[reader-state]")).length;

  const pageLabel = () => textOf(".page-label");
  const zoomLabel = () => textOf(".zoom-label");
  const currentPage = () =>
    js(`(() => {
      const el = document.querySelector(".page-label");
      if (!el) return null;
      const match = el.textContent.match(/第\\s*(\\d+)\\s*\\//);
      return match ? Number(match[1]) : null;
    })()`);

  /** 徽标 + 溢出判定同一次读完：.row-progress / .row-label 的 scrollWidth 与 clientWidth。 */
  const rowProbe = (expr) => js(`(() => {
    const rows = Array.from(document.querySelectorAll(".tree-row"));
    const row = rows.find(${expr});
    if (!row) return null;
    const badge = row.querySelector(".row-progress");
    const label = row.querySelector(".row-label");
    return {
      title: row.getAttribute("title"),
      progress: badge ? badge.textContent.replace(/\\s+/g, " ").trim() : null,
      progressCount: row.querySelectorAll(".row-progress").length,
      rowScrollWidth: row.scrollWidth,
      rowClientWidth: row.clientWidth,
      labelScrollWidth: label ? label.scrollWidth : null,
      labelClientWidth: label ? label.clientWidth : null,
    };
  })()`);
  const rowByTitle = (suffix) => rowProbe(`(el) => (el.getAttribute("title") || "").endsWith(${JSON.stringify(suffix)})`);
  const rowByLabel = (name) =>
    rowProbe(`(el) => { const l = el.querySelector(".row-label"); return !!l && l.textContent.trim() === ${JSON.stringify(name)}; }`);
  const overflowFree = (probe) =>
    !!probe && probe.rowScrollWidth <= probe.rowClientWidth && probe.labelScrollWidth <= probe.labelClientWidth;

  const waitTreeRows = (min) => waitFor(`资料库树行 ≥ ${min}`, `document.querySelectorAll(".tree-row").length >= ${min}`);
  /** 就绪信号用页码指示器：落页到第 3 页时第 1 页的文字层不在渲染窗口内。 */
  const waitPdfLoaded = () => waitFor("PDF 就绪（页码指示器）", `document.querySelector(".page-label")`);
  const waitPage = (page, count) =>
    waitFor(
      `落点 第 ${page} / ${count} 页`,
      `document.querySelector(".page-label") && document.querySelector(".page-label").textContent.replace(/\\s+/g, " ").includes("第 ${page} / ${count} 页")`,
    );
  const waitResumeEntry = () => waitFor("续读入口", `document.querySelector(".reader-resume")`);
  const waitWarnIncrement = async (base, label, timeoutMs = 6000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (warnCount() - base >= 1) return;
      if (Date.now() > deadline) throw new Error(`等待超时：${label}（[reader-state] warn 未增加）`);
      await sleep(60);
    }
  };

  const goHome = async () => {
    await js(`(() => {
      const btn = Array.from(document.querySelectorAll(".pill-icon-btn")).find((el) => el.getAttribute("title") === "返回首页");
      if (!btn) throw new Error("home button not found");
      btn.click();
      return true;
    })()`);
    await waitFor("首页最近项目卡片", `document.querySelector(".project-list-item")`);
  };

  const enterWorkspace = async (name) => {
    // v-list-item 的 title 是 props（渲染为 .v-list-item-title 文本），不是 HTML title 属性，故按文本定位
    await js(`(() => {
      const cards = Array.from(document.querySelectorAll(".project-list-item"));
      const card = cards.find((el) => {
        const title = el.querySelector(".v-list-item-title");
        return !!title && title.textContent.trim() === ${JSON.stringify(name)};
      });
      if (!card) throw new Error("project card not found: " + ${JSON.stringify(name)});
      card.click();
      return true;
    })()`);
    await waitFor("工作区三栏", `document.querySelector(".workspace-page")`);
  };

  const openRow = async (suffix) => {
    await js(`(() => {
      const rows = Array.from(document.querySelectorAll(".tree-row"));
      const row = rows.find((el) => (el.getAttribute("title") || "").endsWith(${JSON.stringify(suffix)}));
      if (!row) throw new Error("tree row not found: " + ${JSON.stringify(suffix)});
      row.click();
      return true;
    })()`);
  };
  const clickNext = () => js(`document.querySelector('.pdf-page-indicator button[title="下一页"]').click(), true`);
  const clickPrev = () => js(`document.querySelector('.pdf-page-indicator button[title="上一页"]').click(), true`);

  const openNotesTab = async () => {
    await js(`document.querySelector('.pill-tab[data-tab="notes"]').click(), true`);
    await waitFor("笔记列表", `document.querySelectorAll(".note-row").length >= 3`);
  };

  const clickNoteInGroup = async (docPathFragment) => {
    await js(`(() => {
      const heads = Array.from(document.querySelectorAll(".notes-group-head"));
      const head = heads.find((el) => (el.getAttribute("title") || "").includes(${JSON.stringify(docPathFragment)}));
      if (!head) throw new Error("note group not found: " + ${JSON.stringify(docPathFragment)});
      const row = head.parentElement.querySelector(".note-row");
      if (!row) throw new Error("note row not found in group");
      row.click();
      return true;
    })()`);
  };

  /** 同组内按页码徽标点行：加载窗口内连点场景要的是「同一个文档的两条不同页码意图」。 */
  const clickNoteRowAtPage = async (docPathFragment, pageText) => {
    await js(`(() => {
      const heads = Array.from(document.querySelectorAll(".notes-group-head"));
      const head = heads.find((el) => (el.getAttribute("title") || "").includes(${JSON.stringify(docPathFragment)}));
      if (!head) throw new Error("note group not found: " + ${JSON.stringify(docPathFragment)});
      const rows = Array.from(head.parentElement.querySelectorAll(".note-row"));
      const row = rows.find((el) => {
        const badge = el.querySelector(".note-page-badge");
        return !!badge && badge.textContent.replace(/\\s+/g, " ").trim() === ${JSON.stringify(pageText)};
      });
      if (!row) throw new Error("note row not found: " + ${JSON.stringify(pageText)});
      row.click();
      return true;
    })()`);
  };

  const selectPageSpan = async (page) => {
    await waitFor(`第 ${page} 页文本层`, `document.querySelector('.pdf-page[data-page="${page}"] .textLayer span')`);
    await js(`(() => {
      const span = document.querySelector('.pdf-page[data-page="${page}"] .textLayer span');
      const range = document.createRange();
      range.selectNodeContents(span);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return true;
    })()`);
    await waitFor("摘录浮层", `document.querySelector(".quick-ask") && document.querySelector(".quick-ask").offsetParent !== null`);
  };

  // --- 20c 续读入口：加载中不渲染，加载完成后出现 ---------------------------------
  log("20c 续读入口加载中（setReaderStateDelay(1500)）");
  await goHome();
  writeState(STATE_FILE_A, {
    version: 1,
    lastDocPath: "sample-paper.pdf",
    documents: { "sample-paper.pdf": entry(3, 1.1) },
  });
  await js("window.__pixStub.setReaderStateDelay(1500), true");
  await enterWorkspace(LIBRARY_NAME);
  await waitFor("阅读区空态", `document.querySelector(".reader-empty")`);
  await sleep(150);
  const loadingState = {
    resume: await has(".reader-resume"),
    title: await textOf(".empty-title"),
    emptyError: await has(".reader-empty-error"),
  };
  await capturePage(win, "20c-resume-loading.png");
  record("resume-entry", { phase: "loading", ...loadingState }, [
    ...(loadingState.resume === false ? [] : ["状态未加载完时不应出现续读入口"]),
    ...(loadingState.title === "选择左侧文件开始阅读" ? [] : [`空态文案异常：${loadingState.title}`]),
  ]);
  await js("window.__pixStub.setReaderStateDelay(0), true");
  await waitResumeEntry();
  await sleep(150);
  const loadedState = { text: await textOf(".reader-resume") };
  await capturePage(win, "20c-resume-loaded.png");
  record("resume-entry", { phase: "loaded", ...loadedState }, [
    ...(loadedState.text && loadedState.text.includes("第 3 页") ? [] : [`加载完成后入口异常：${loadedState.text}`]),
  ]);

  // --- 20 续读入口点击：落页 + 缩放 ---------------------------------------------
  log("20 续读入口存在且点击后落第 3 页 / 110%");
  await goHome();
  writeState(STATE_FILE_A, {
    version: 1,
    lastDocPath: "sample-paper.pdf",
    documents: { "sample-paper.pdf": entry(3, 1.1) },
  });
  await enterWorkspace(LIBRARY_NAME);
  await waitResumeEntry();
  const hitState = { text: await textOf(".reader-resume") };
  await capturePage(win, "20-resume-entry.png");
  record("resume-entry", { phase: "hit", ...hitState }, [
    ...(hitState.text && hitState.text.includes("sample-paper.pdf") ? [] : ["入口未显示文档名"]),
    ...(hitState.text && hitState.text.includes("第 3 页") ? [] : ["入口未显示第 3 页"]),
  ]);
  await js(`document.querySelector(".reader-resume").click(), true`);
  await waitPdfLoaded();
  await waitPage(3, 3);
  const openedState = { page: await pageLabel(), zoom: await zoomLabel() };
  await capturePage(win, "20b-resume-opened.png");
  record("resume-entry", { phase: "after-click", ...openedState }, [
    ...(openedState.page === "第 3 / 3 页" ? [] : [`页码异常：${openedState.page}`]),
    ...(openedState.zoom === "110%" ? [] : [`缩放异常：${openedState.zoom}`]),
  ]);

  // --- 20b 无记录 --------------------------------------------------------------
  log("20b 无记录：入口不存在");
  await goHome();
  removeState(STATE_FILE_A);
  const warnBase20b = warnCount();
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(2);
  await waitWarnIncrement(warnBase20b, "missing 降级 warn");
  const emptyState = {
    resume: await has(".reader-resume"),
    title: await textOf(".empty-title"),
    emptyError: await has(".reader-empty-error"),
  };
  await capturePage(win, "20b-resume-empty.png");
  record("resume-entry", { phase: "no-record", ...emptyState }, [
    ...(emptyState.resume === false ? [] : ["无记录时不应有入口"]),
    ...(emptyState.title === "选择左侧文件开始阅读" ? [] : [`空态文案异常：${emptyState.title}`]),
  ]);

  // --- 20d 加载窗口内连点笔记：落点取最后一次点击 --------------------------------
  // 代码审查 must-fix：意图消费前移到 loadPdf 序言后，「加载中连点取最后一条」（N20 验收 3 / N28 验收 4）
  // 依赖落页点的补消费。用 setLibraryReadDelay 造确定的在途加载窗口，两次点击落在同一文档的两条笔记上。
  log("20d 加载窗口内连点笔记 → 落点取最后一次点击（第 2 / 3 页）");
  await goHome();
  removeState(STATE_FILE_A);
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await openNotesTab();
  await js("window.__pixStub.setLibraryReadDelay(900), true");
  await clickNoteRowAtPage("sample-paper.pdf", "第 1 页");
  await waitFor("PDF 加载态", `document.querySelector(".pdf-status-center .v-progress-circular")`);
  const loadingAtClick = await has(".pdf-status-center .v-progress-circular");
  await clickNoteRowAtPage("sample-paper.pdf", "第 2 页");
  await js("window.__pixStub.setLibraryReadDelay(0), true");
  await waitPdfLoaded();
  await waitPage(2, 3);
  const lateClick = { page: await pageLabel(), zoom: await zoomLabel(), loadingAtClick };
  await capturePage(win, "20d-note-jump-late-click.png");
  record("note-jump", { phase: "late-click-wins", ...lateClick }, [
    ...(loadingAtClick ? [] : ["第二次点击时不在加载窗口（场景失去判别力）"]),
    ...(lateClick.page === "第 2 / 3 页" ? [] : [`落点应为最后一次点击的第 2 页：${lateClick.page}`]),
    ...(lateClick.zoom === "100%" ? [] : [`无记录时缩放应回落 100%：${lateClick.zoom}`]),
  ]);

  // --- 21 树进度徽标 ------------------------------------------------------------
  log("21 树进度徽标（含 page=1024 边界）");
  await goHome();
  writeState(STATE_FILE_A, {
    version: 1,
    lastDocPath: "sample-paper.pdf",
    documents: { "sample-paper.pdf": entry(3, 1.1), "archive/older-paper.pdf": entry(1024, 1.1) },
  });
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await waitFor("树徽标", `document.querySelectorAll(".row-progress").length >= 2`);
  const badges = {
    sample: await rowByTitle("sample-paper.pdf"),
    older: await rowByTitle("older-paper.pdf"),
    notes: await rowByLabel("reading-notes.md"),
    archive: await rowByLabel("archive"),
  };
  await capturePage(win, "21-tree-progress.png");
  record("tree-progress", { phase: "static", ...badges }, [
    ...(badges.sample && badges.sample.progress === "第 3 页" ? [] : [`sample 徽标异常：${JSON.stringify(badges.sample)}`]),
    ...(badges.older && badges.older.progress === "第 1024 页" ? [] : [`older 徽标异常：${JSON.stringify(badges.older)}`]),
    ...(badges.notes && badges.notes.progressCount === 0 ? [] : ["reading-notes.md 行不应有徽标"]),
    ...(badges.archive && badges.archive.progressCount === 0 ? [] : ["目录行不应有徽标"]),
    ...(overflowFree(badges.sample) ? [] : ["sample-paper 行横向溢出"]),
    ...(overflowFree(badges.older) ? [] : ["长页码（1024）导致行横向溢出"]),
  ]);
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(3, 3);
  await clickPrev();
  await waitPage(2, 3);
  const liveBadge = await rowByTitle("sample-paper.pdf");
  record("tree-progress", { phase: "live-page", row: liveBadge }, [
    ...(liveBadge && liveBadge.progress === "第 2 页" ? [] : [`当前文档的实时徽标异常：${JSON.stringify(liveBadge)}`]),
  ]);

  // --- 21b 条目级裁剪 -----------------------------------------------------------
  log("21b 条目级裁剪（非法 page 整条丢弃）");
  await goHome();
  writeState(STATE_FILE_A, {
    version: 1,
    lastDocPath: "sample-paper.pdf",
    documents: { "sample-paper.pdf": entry(3, 1.1), "archive/older-paper.pdf": entry(0, 1.1) },
  });
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await waitFor("树徽标", `document.querySelectorAll(".row-progress").length >= 1`);
  const trimmed = { sample: await rowByTitle("sample-paper.pdf"), older: await rowByTitle("older-paper.pdf") };
  await capturePage(win, "21b-trim-invalid-entry.png");
  record("tree-progress", { phase: "trim", ...trimmed }, [
    ...(trimmed.sample && trimmed.sample.progress === "第 3 页" ? [] : [`合法条目应保留：${JSON.stringify(trimmed.sample)}`]),
    ...(trimmed.older && trimmed.older.progressCount === 0 ? [] : ["非法条目未被裁剪"]),
  ]);

  // --- 22 缩放恢复 + 写入节流 ① ------------------------------------------------
  log("22 缩放恢复（经资料库树打开，110%）");
  await goHome();
  writeState(STATE_FILE_A, {
    version: 1,
    lastDocPath: "sample-paper.pdf",
    documents: { "sample-paper.pdf": entry(3, 1.1) },
  });
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await waitResumeEntry();
  const base22 = (await saveCalls()).count;
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(3, 3);
  const restored = await js(`(() => {
    const page = document.querySelector('.pdf-page[data-page="1"]');
    return {
      zoom: document.querySelector(".zoom-label") ? document.querySelector(".zoom-label").textContent.trim() : null,
      pageLabel: document.querySelector(".page-label") ? document.querySelector(".page-label").textContent.replace(/\\s+/g, " ").trim() : null,
      pageWidth: page ? Math.round(page.getBoundingClientRect().width) : null,
    };
  })()`);
  await capturePage(win, "22-scale-restored.png");
  record(
    "scale-restored",
    { phase: "tree-row", ...restored, expectedWidth: Math.round(595 * 1.1) },
    [
      ...(restored.zoom === "110%" ? [] : [`缩放标签异常：${restored.zoom}`]),
      ...(restored.pageLabel === "第 3 / 3 页" ? [] : [`页码异常：${restored.pageLabel}`]),
      ...(Math.abs((restored.pageWidth ?? 0) - Math.round(595 * 1.1)) <= 1 ? [] : [`首页宽度异常：${restored.pageWidth}`]),
    ],
  );
  // ① 打开「有记录且页码/缩放一致」的文档：2 秒内 0 次 IPC，再等 1 秒仍为 0
  await sleep(2000);
  const calls22 = (await saveCalls()).count;
  await sleep(1000);
  const calls23 = (await saveCalls()).count;
  record("reader-state-writes", { phase: "restore-no-write", base: base22, after2s: calls22, after3s: calls23 }, [
    ...(calls22 - base22 === 0 ? [] : [`恢复后 2s 内出现写入：+${calls22 - base22}`]),
    ...(calls23 - base22 === 0 ? [] : [`恢复后 3s 内出现写入：+${calls23 - base22}`]),
  ]);

  // --- 22b 1.1 缩放下翻页 + 摘录 ------------------------------------------------
  log("22b 110% 下翻页 + 摘录");
  await clickPrev();
  await waitPage(2, 3);
  await selectPageSpan(2);
  await sleep(700);
  await js(`(() => {
    const buttons = Array.from(document.querySelectorAll(".quick-ask-btn"));
    const target = buttons.find((el) => (el.textContent || "").includes("摘录"));
    if (!target) throw new Error("excerpt button not found");
    target.click();
    return true;
  })()`);
  await waitFor("摘录成功反馈", `document.querySelector(".quick-ask-feedback.is-ok")`);
  const excerptState = { page: await pageLabel(), spanCount: await countOf('.pdf-page[data-page="2"] .textLayer span') };
  await capturePage(win, "22b-scale-excerpt.png");
  record("scale-restored", { phase: "excerptAt110", ...excerptState }, [
    ...(excerptState.page === "第 2 / 3 页" ? [] : [`页码异常：${excerptState.page}`]),
    ...(excerptState.spanCount > 0 ? [] : ["当前页文本层缺失"]),
  ]);

  // --- 22c 写失败注入：DOM 零变化 + 文件字节不变 ---------------------------------
  log("22c 写失败注入（write-failed）后 DOM 零变化");
  await js('window.__pixStub.setReaderStateFailure("write-failed"), true');
  await sleep(800);
  const bytesBefore22c = stateBytes(STATE_FILE_A);
  const base22c = (await saveCalls()).count;
  await clickNext();
  await waitPage(3, 3);
  await sleep(900);
  const failureState = {
    page: await pageLabel(),
    delta: (await saveCalls()).count - base22c,
    lastPayload: await lastPayload(),
    emptyError: await has(".reader-empty-error"),
    snackbar: await countOf(".v-snackbar"),
    notice: await countOf(".notes-notice"),
    bytesUnchanged: Buffer.compare(bytesBefore22c, stateBytes(STATE_FILE_A)) === 0,
  };
  await capturePage(win, "22c-throttle-no-ui-change.png");
  record("reader-state-writes", { phase: "save-failure", ...failureState }, [
    ...(failureState.page === "第 3 / 3 页" ? [] : [`阅读链路受影响：${failureState.page}`]),
    ...(failureState.delta >= 1 ? [] : ["失败注入下未发起 save（payload 无记录）"]),
    ...(failureState.emptyError === false && failureState.snackbar === 0 && failureState.notice === 0
      ? []
      : ["状态失败出现了 UI 反馈"]),
    ...(failureState.bytesUnchanged ? [] : ["失败写入改动了状态文件字节"]),
  ]);
  await js("window.__pixStub.setReaderStateFailure(null), true");
  const base22cRetry = (await saveCalls()).count;
  await clickPrev();
  await waitPage(2, 3);
  await sleep(900);
  const retryState = {
    delta: (await saveCalls()).count - base22cRetry,
    lastPayload: await lastPayload(),
    filePage: readState(STATE_FILE_A).documents["sample-paper.pdf"].page,
  };
  record("reader-state-writes", { phase: "save-recovered", ...retryState }, [
    ...(retryState.delta === 1 ? [] : [`恢复后应恰好 +1，实际 +${retryState.delta}`]),
    ...(retryState.lastPayload && retryState.lastPayload.page === 2 ? [] : ["末次 payload 页码异常"]),
    ...(retryState.filePage === 2 ? [] : [`文件页码异常：${retryState.filePage}`]),
  ]);

  // --- ② 30 次页码变化：真实变化计数 + 写入上界 -----------------------------------
  log("② 30 次真实页码变化 → 写入上界");
  await clickPrev();
  await waitPage(1, 3);
  await sleep(800);
  const base30 = (await saveCalls()).count;
  let changes = 0;
  let previousPage = await currentPage();
  const step = async (direction) => {
    await (direction > 0 ? clickNext() : clickPrev());
    const now = await currentPage();
    if (now !== previousPage) changes += 1;
    previousPage = now;
  };
  const startedAt = Date.now();
  for (let i = 0; i < 14; i++) {
    await step(1);
    await step(-1);
  }
  await step(1);
  await step(1);
  const elapsedMs = Date.now() - startedAt;
  await sleep(1200);
  const thirty = { changes, elapsedMs, delta: (await saveCalls()).count - base30, page: await pageLabel(), lastPayload: await lastPayload() };
  record("reader-state-writes", { phase: "thirty-changes", ...thirty }, [
    ...(thirty.changes === 30 ? [] : [`真实页码变化应为 30，实际 ${thirty.changes}`]),
    ...(thirty.delta <= 5 ? [] : [`写入次数超过上界：+${thirty.delta}`]),
    ...(thirty.lastPayload && thirty.lastPayload.page === 3 ? [] : [`末次 payload 页码异常：${JSON.stringify(thirty.lastPayload)}`]),
    ...(thirty.page === "第 3 / 3 页" ? [] : [`结束页异常：${thirty.page}`]),
  ]);

  // --- ③ 去抖窗口内切换文档：落盘的是切换前文档 ---------------------------------
  log("③ 去抖窗口内切换文档 → 落盘切换前的页码");
  await goHome();
  writeState(STATE_FILE_A, {
    version: 1,
    lastDocPath: "sample-paper.pdf",
    documents: { "sample-paper.pdf": entry(1, 1) },
  });
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await waitResumeEntry();
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await clickNext();
  await clickNext();
  await openRow("older-paper.pdf");
  await waitPage(1, 2);
  const switched = { lastPayload: await lastPayload() };
  record("reader-state-writes", { phase: "switch-before-debounce", ...switched }, [
    ...(switched.lastPayload && switched.lastPayload.docFilePath.endsWith("sample-paper.pdf")
      ? []
      : [`末次 payload 应为切换前文档：${JSON.stringify(switched.lastPayload)}`]),
    ...(switched.lastPayload && switched.lastPayload.page === 3 ? [] : ["末次 payload 页码应为 3"]),
  ]);
  await sleep(900);

  // --- ④ hidden / pagehide 事件驱动 flush --------------------------------------
  log("④ visibilitychange(hidden) + pagehide → 恰好 +1");
  const base4 = (await saveCalls()).count;
  await clickNext();
  await waitPage(2, 2);
  await js(`Object.defineProperty(document, "hidden", { configurable: true, get: function () { return true; } }), true`);
  await js(`document.dispatchEvent(new Event("visibilitychange")), true`);
  await sleep(150);
  const afterHidden = (await saveCalls()).count - base4;
  await js(`window.dispatchEvent(new Event("pagehide")), true`);
  await sleep(150);
  const afterPageHide = (await saveCalls()).count - base4;
  await js(`document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("pagehide")); true`);
  await sleep(250);
  const afterExtra = (await saveCalls()).count - base4;
  record("reader-state-writes", { phase: "hidden-pagehide", afterHidden, afterPageHide, afterExtra }, [
    ...(afterHidden === 1 ? [] : [`visibilitychange(hidden) 应 +1，实际 +${afterHidden}`]),
    ...(afterPageHide === 1 ? [] : [`pagehide 后不应再次写入，实际 +${afterPageHide}`]),
    ...(afterExtra === 1 ? [] : [`重复 dispatch 不应增长，实际 +${afterExtra}`]),
  ]);

  // --- ⑤ 非 PDF 不落盘 ---------------------------------------------------------
  log("⑤ 非 PDF（reading-notes.md）全程 0 次 save");
  await openRow("reading-notes.md");
  await waitFor("Markdown 预览", `document.querySelector(".reader-body")`);
  await sleep(800);
  const base5 = (await saveCalls()).count;
  await sleep(1500);
  const fileAfterMd = readState(STATE_FILE_A);
  const nonPdf = {
    delta: (await saveCalls()).count - base5,
    lastDocPath: fileAfterMd.lastDocPath,
    mdEntries: Object.keys(fileAfterMd.documents).filter((key) => key.includes("reading-notes")),
  };
  record("reader-state-writes", { phase: "non-pdf", ...nonPdf }, [
    ...(nonPdf.delta === 0 ? [] : [`打开 md 后出现写入：+${nonPdf.delta}`]),
    ...(nonPdf.mdEntries.length === 0 ? [] : ["非 PDF 不应进入状态文件"]),
    ...(nonPdf.lastDocPath === "archive/older-paper.pdf" ? [] : [`lastDocPath 应仍指向 PDF：${nonPdf.lastDocPath}`]),
  ]);

  // --- 22d 笔记跳转到无记录文档 -------------------------------------------------
  log("22d 笔记跳转到无记录文档（第 2 / 2 页 + 100%）");
  await goHome();
  writeState(STATE_FILE_A, {
    version: 1,
    lastDocPath: "sample-paper.pdf",
    documents: { "sample-paper.pdf": entry(3, 1.1) },
  });
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await waitResumeEntry();
  await openNotesTab();
  await clickNoteInGroup("older-paper.pdf");
  await waitPdfLoaded();
  await waitPage(2, 2);
  const jumpPlain = { page: await pageLabel(), zoom: await zoomLabel() };
  await capturePage(win, "22d-note-jump.png");
  record("note-jump", { phase: "no-record-target", ...jumpPlain }, [
    ...(jumpPlain.page === "第 2 / 2 页" ? [] : [`越界钳制异常：${jumpPlain.page}`]),
    ...(jumpPlain.zoom === "100%" ? [] : [`无记录时缩放应回落 100%：${jumpPlain.zoom}`]),
  ]);

  // --- 22e 笔记跳转到有记录文档 -------------------------------------------------
  log("22e 笔记跳转 + 目标文档缩放恢复（150%）");
  await goHome();
  writeState(STATE_FILE_A, {
    version: 1,
    lastDocPath: "archive/older-paper.pdf",
    documents: { "sample-paper.pdf": entry(3, 1.1), "archive/older-paper.pdf": entry(1, 1.5) },
  });
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await waitResumeEntry();
  await openNotesTab();
  await clickNoteInGroup("older-paper.pdf");
  await waitPdfLoaded();
  await waitPage(2, 2);
  const jumpRestored = { page: await pageLabel(), zoom: await zoomLabel() };
  await capturePage(win, "22e-note-jump-restored.png");
  record("note-jump", { phase: "recorded-target", ...jumpRestored }, [
    ...(jumpRestored.page === "第 2 / 2 页" ? [] : [`跳转页应覆盖恢复页：${jumpRestored.page}`]),
    ...(jumpRestored.zoom === "150%" ? [] : [`缩放应取目标文档恢复值：${jumpRestored.zoom}`]),
  ]);

  // --- 23 损坏状态下的阅读与重建 -------------------------------------------------
  log("23 损坏状态：降级 + 重建");
  await goHome();
  writeFileSync(
    STATE_FILE_A,
    '{\n  "version": 1,\n  "lastDocPath": "sample-paper.pdf",\n  "documents": { "sample-paper.pdf": { "page": 3,',
    "utf8",
  );
  const warnBase23 = warnCount();
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await waitWarnIncrement(warnBase23, "corrupt 降级 warn");
  await sleep(300);
  const degraded = {
    emptyError: await has(".reader-empty-error"),
    retryButtons: await js(`Array.from(document.querySelectorAll(".reader-empty button"))
      .filter((el) => (el.textContent || "").includes("重试")).length`),
    resume: await has(".reader-resume"),
    progressCount: await countOf(".row-progress"),
    title: await textOf(".empty-title"),
    warnDelta: warnCount() - warnBase23,
  };
  await capturePage(win, "23-corrupt-state-reading.png");
  record("reader-state-degrade", { phase: "corrupt-empty", ...degraded }, [
    ...(degraded.emptyError === false ? [] : ["正常空态不应带错误态 class"]),
    ...(degraded.retryButtons === 0 ? [] : ["正常空态不应有重试按钮"]),
    ...(degraded.resume === false ? [] : ["损坏状态下不应出现续读入口"]),
    ...(degraded.progressCount === 0 ? [] : ["损坏状态下不应有树徽标"]),
    ...(degraded.title === "选择左侧文件开始阅读" ? [] : [`空态文案异常：${degraded.title}`]),
  ]);
  record("reader-state-console", { phase: "corrupt", warnDelta: degraded.warnDelta }, [
    ...(degraded.warnDelta === 1 ? [] : [`[reader-state] warn 增量应为 1，实际 ${degraded.warnDelta}`]),
  ]);
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await clickNext();
  await clickNext();
  await waitPage(3, 3);
  await sleep(1000);
  const rebuilt = readState(STATE_FILE_A);
  record("reader-state-degrade", { phase: "rebuilt", rebuilt }, [
    ...(rebuilt.version === 1 ? [] : ["重建后的 version 异常"]),
    ...(rebuilt.lastDocPath === "sample-paper.pdf" ? [] : [`重建后的 lastDocPath 异常：${rebuilt.lastDocPath}`]),
    ...(rebuilt.documents["sample-paper.pdf"] && rebuilt.documents["sample-paper.pdf"].page === 3
      ? []
      : ["重建后的条目页码异常"]),
  ]);

  // --- 24 跨工作区无残留 --------------------------------------------------------
  log("24 跨工作区切换：树徽标与入口均无残留");
  await goHome();
  writeState(STATE_FILE_A, {
    version: 1,
    lastDocPath: "sample-paper.pdf",
    documents: { "sample-paper.pdf": entry(1, 1.1) },
  });
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await waitResumeEntry();
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await clickNext();
  await waitPage(2, 3);
  await goHome();
  const homeFile = readState(STATE_FILE_A);
  record("workspace-switch", { phase: "a-left-home", file: homeFile }, [
    ...(homeFile.lastDocPath === "sample-paper.pdf" ? [] : [`goHome 未落盘 lastDocPath：${homeFile.lastDocPath}`]),
    ...(homeFile.documents["sample-paper.pdf"] && homeFile.documents["sample-paper.pdf"].page === 2
      ? []
      : ["goHome 的 flush 未落盘第 2 页"]),
  ]);
  await enterWorkspace(LIBRARY_B_NAME);
  await waitTreeRows(1);
  const bRow = await rowByTitle("sample-paper.pdf");
  const bSide = {
    row: bRow,
    progressCount: await countOf(".row-progress"),
    resume: await has(".reader-resume"),
    title: await textOf(".empty-title"),
  };
  await capturePage(win, "24-workspace-switch.png");
  record("workspace-switch", { phase: "b-workspace", ...bSide }, [
    ...(bRow ? [] : ["B 树里缺少 sample-paper 行（断言会空跑）"]),
    ...(bSide.progressCount === 0 ? [] : ["B 侧出现了 A 的进度徽标"]),
    ...(bSide.resume === false ? [] : ["B 侧出现了 A 的续读入口"]),
    ...(bSide.title === "选择左侧文件开始阅读" ? [] : [`B 侧空态文案异常：${bSide.title}`]),
  ]);
  await goHome();
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await waitResumeEntry();
  const backEntry = await textOf(".reader-resume");
  const backRow = await rowByTitle("sample-paper.pdf");
  await capturePage(win, "24b-back-to-a.png");
  record("workspace-switch", { phase: "back-to-a", entry: backEntry, row: backRow }, [
    ...(backEntry && backEntry.includes("sample-paper.pdf") && backEntry.includes("第 2 页")
      ? []
      : [`续读入口未恢复：${backEntry}`]),
    ...(backRow && backRow.progress === "第 2 页" ? [] : [`树徽标未恢复：${JSON.stringify(backRow)}`]),
  ]);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

app.commandLine.appendSwitch("disable-gpu");
// 可选高 DPI 取证：只改变像素密度，不改 CSS 布局（1600x1000 窗口 → 2x 像素图）
if (process.env.PIX_SHOT_SCALE) {
  app.commandLine.appendSwitch("force-device-scale-factor", process.env.PIX_SHOT_SCALE);
}

async function main() {
  app.setPath("userData", join(OUT_ROOT, "electron-userdata"));
  mkdirSync(OUT_ROOT, { recursive: true });
  writeFixtures();
  writeFileSync(STUB_PATH, buildStub());
  console.log(`[ui-shot] fixture 资料库：${LIBRARY_DIR}`);
  console.log(`[ui-shot] 截图目录：${SHOTS_DIR}`);

  const server = await createServer({
    configFile: join(PIX_DIR, "vite.config.ts"),
    root: PIX_DIR,
    cacheDir: join(OUT_ROOT, "vite-cache"),
    logLevel: "warn",
    server: { port: PORT, strictPort: true },
  });
  await server.listen();
  console.log(`[ui-shot] vite dev server 就绪：${URL}`);

  const win = new BrowserWindow({
    width: WINDOW.width,
    height: WINDOW.height,
    show: false,
    frame: false,
    useContentSize: true,
    backgroundColor: "#f3f6f9",
    webPreferences: {
      preload: STUB_PATH,
      offscreen: true,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  win.webContents.setBackgroundThrottling(false);

  const errors = [];
  win.webContents.on("console-message", (_event, level, message) => {
    rendererLogs.push(String(message));
    if (level >= 2) console.log(`[renderer:${level}] ${message}`);
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    errors.push(`renderer gone: ${details.reason}`);
  });

  await win.loadURL(URL);
  const density = await win.webContents.executeJavaScript(
    "({ dpr: window.devicePixelRatio, w: window.innerWidth, h: window.innerHeight })",
    true,
  );
  console.log(`[ui-shot] 渲染层已加载（dpr=${density.dpr}, 视口=${density.w}x${density.h}），开始场景`);

  let failure = null;
  try {
    await runScenario(win, (line) => console.log(`[ui-shot] ${line}`));
    await runReaderStateScenarios(win, (line) => console.log(`[ui-shot] ${line}`));
  } catch (err) {
    failure = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    console.error(`[ui-shot] 场景失败：${failure}`);
    try {
      await capturePage(win, "99-failure-state.png");
    } catch {
      // 失败截图不是必需产物
    }
  }

  writeFileSync(
    join(SHOTS_DIR, "MANIFEST.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), url: URL, library: LIBRARY_DIR, shots, failure }, null, 2),
  );
  writeFileSync(join(SHOTS_DIR, "MEASUREMENTS.json"), JSON.stringify(measurements, null, 2));
  for (const entry of measurements) console.log(`[ui-shot] 测量 ${entry.label}: ${JSON.stringify(entry.data)}`);

  await server.close();
  win.destroy();
  if (failure || errors.length) {
    console.error(`[ui-shot] 结束：失败（${errors.join("; ") || "场景断言未通过"}）`);
    app.exit(1);
    return;
  }
  console.log(`[ui-shot] 结束：产出 ${shots.length} 张截图`);
  app.exit(0);
}

process.on("unhandledRejection", (reason) => {
  console.error("[ui-shot] unhandledRejection:", reason);
  app.exit(1);
});

app.whenReady().then(() =>
  main().catch((err) => {
    console.error("[ui-shot] 启动失败：", err);
    app.exit(1);
  }),
);

app.on("window-all-closed", () => app.exit(0));
