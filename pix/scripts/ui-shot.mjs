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
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PIX_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_ROOT = process.env.PIX_SHOT_ROOT || "C:/Users/86157/AppData/Local/Temp/pix-r5";
const SHOTS_DIR = join(OUT_ROOT, "shots");
const LIBRARY_DIR = join(OUT_ROOT, "library");
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
  mkdirSync(SHOTS_DIR, { recursive: true });
  writeFileSync(join(LIBRARY_DIR, "sample-paper.pdf"), buildPdf(SAMPLE_PAGES));
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
    samplePath: join(LIBRARY_DIR, "sample-paper.pdf"),
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

const LIBRARY_TREE = [
  { name: "archive", path: path.join(CONFIG.root, "archive"), type: "directory", children: [
    { name: "older-paper.pdf", path: CONFIG.olderPath, type: "file" },
  ] },
  { name: "reading-notes.md", path: path.join(CONFIG.root, "reading-notes.md"), type: "file" },
  { name: "sample-paper.pdf", path: CONFIG.samplePath, type: "file" },
];

function libraryList(dir) {
  const key = String(dir).replace(/\\\\/g, "/").toLowerCase();
  if (key === CONFIG.root.replace(/\\\\/g, "/").toLowerCase()) return { success: true, nodes: LIBRARY_TREE };
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

  startSession: async function () { return { success: true }; },
  stopSession: async function () { return { success: true }; },
  isAgentRunning: async function () { return true; },
  sendCommand: async function (command) { return handleCommand(command); },

  getSettings: async function () {
    return {
      theme: "light",
      recentProjects: [{ path: CONFIG.root, name: "pix-r5-library", lastOpened: Date.now(), sessionCount: 0 }],
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
  libraryReadFile: async function (target) { return readBinary(target); },

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
  setLoadFailure: function (code, error) { loadFailure = code ? { code: code, error: error } : null; },
  relativeDocPath: function (target) { return relativeDocPath(target); },
});
`;
}

// ---------------------------------------------------------------------------
// 场景驱动
// ---------------------------------------------------------------------------

const shots = [];
const measurements = [];

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
