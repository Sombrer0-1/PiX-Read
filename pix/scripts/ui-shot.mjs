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
import { createHash } from "node:crypto";
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
  mapToggle: ".map-toggle",
  mapSlot: ".knowledge-map-slot",
  mapEmpty: ".map-empty",
  mapRow: ".map-row",
  mapNode: ".map-node",
  mapBadge: ".note-count-badge",
  mapProgress: ".map-progress",
  chapterFilter: ".notes-chapter-filter",
  chapterFilterClear: ".notes-chapter-filter-clear",
  chapterEmpty: ".notes-chapter-empty",
};

// ---------------------------------------------------------------------------
// fixture：最小可用 PDF（pdf.js 需要真实 xref，文本用 Helvetica/WinAnsi，仅 ASCII）
// ---------------------------------------------------------------------------

function escapePdfText(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * 最小 PDF 生成（pdf.js 需要真实 xref，文本用 Helvetica/WinAnsi，仅 ASCII）。
 * outline（声明表 { title, page, items }）非空时追加 /Outlines:
 *   书签根 = 4+2*pages.length，节点按声明表预序连续编号（先子树后兄弟——按层次分配
 *   会把 /First /Next 串成 BFS 序、pdf.js 解析出的目录结构与声明表不一致）。
 *   /First 必须是间接引用，否则 pdf.js 直接判「无书签」；page === null 时不输出 /Dest。
 * outline 缺省为空数组：既有调用点的对象编号与字节布局逐字不变。
 */
function buildPdf(pages, outline = []) {
  const objBodies = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  const contentIds = pages.map((_, index) => 5 + index * 2);
  const outlineRootId = 4 + 2 * pages.length;
  objBodies.push(
    outline.length
      ? `<< /Type /Catalog /Pages 2 0 R /Outlines ${outlineRootId} 0 R >>`
      : "<< /Type /Catalog /Pages 2 0 R >>",
  );
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

  if (outline.length) {
    const itemsOf = (node) => (Array.isArray(node.items) ? node.items : []);
    const countSubtree = (nodes) => nodes.reduce((sum, node) => sum + 1 + countSubtree(itemsOf(node)), 0);
    const ids = new Map();
    let nextId = outlineRootId + 1;
    const allocate = (nodes) => {
      nodes.forEach((node) => {
        ids.set(node, nextId);
        nextId += 1;
        allocate(itemsOf(node));
      });
    };
    allocate(outline);
    const nodeBodies = [];
    const emit = (nodes, parentId) => {
      nodes.forEach((node, index) => {
        const items = itemsOf(node);
        const fields = [`/Title (${escapePdfText(node.title)})`, `/Parent ${parentId} 0 R`];
        if (node.page != null) fields.push(`/Dest [${pageIds[node.page - 1]} 0 R /XYZ null null null]`);
        if (index > 0) fields.push(`/Prev ${ids.get(nodes[index - 1])} 0 R`);
        if (index < nodes.length - 1) fields.push(`/Next ${ids.get(nodes[index + 1])} 0 R`);
        if (items.length) {
          fields.push(
            `/First ${ids.get(items[0])} 0 R`,
            `/Last ${ids.get(items[items.length - 1])} 0 R`,
            `/Count ${countSubtree(items)}`,
          );
        }
        nodeBodies.push(`<< ${fields.join(" ")} >>`);
        emit(items, ids.get(node));
      });
    };
    emit(outline, outlineRootId);
    objBodies.push(
      `<< /Type /Outlines /First ${ids.get(outline[0])} 0 R /Last ${ids.get(outline[outline.length - 1])} 0 R /Count ${countSubtree(outline)} >>`,
    );
    objBodies.push(...nodeBodies);
  }

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

/**
 * sample-paper.pdf 的声明期望值（pageCount 3 + 标准种子 seedNotes()）：场景断言直接引用本表字面量。
 * rows 按 DOM 顺序：label / pageText / noteNum / noteTitle（null = 该行无对应元素）。
 */
const SAMPLE_MAP_EXPECT = {
  nodeCount: 8,
  visibleRows: 7,
  badges: 4,
  badgeTexts: ["1", "2", "2", "3", "3", "2-3"],
  rows: [
    { label: "1. Abstract", pageText: "1", noteNum: "1", noteTitle: "1 条笔记 · 摘录 1 · AI 结论 0；点击只看该章节笔记" },
    { label: "2. Method Overview", pageText: "2", noteNum: "2", noteTitle: "2 条笔记 · 摘录 1 · AI 结论 1；点击只看该章节笔记" },
    { label: "2.1 Sparse mask budget", pageText: "2", noteNum: "2", noteTitle: "2 条笔记 · 摘录 1 · AI 结论 1；点击只看该章节笔记" },
    { label: "2.2 Positional prior", pageText: "3", noteNum: null, noteTitle: null },
    { label: "3. Ablation Study", pageText: "3", noteNum: null, noteTitle: null },
    { label: "Appendix A", pageText: null, noteNum: null, noteTitle: null },
    { label: "Appendix B", pageText: "2-3", noteNum: "2", noteTitle: "2 条笔记 · 摘录 1 · AI 结论 1；点击只看该章节笔记" },
  ],
  read: {
    page1: { read: 0, current: 1 },
    page2: { read: 1, current: 3 },
    page3: { read: 3, current: 3 },
  },
  progress: {
    page1: "第 1 / 3 页 · 33%",
    page2: "第 2 / 3 页 · 67%",
    page3: "第 3 / 3 页 · 100%",
  },
};

/**
 * sample-paper.pdf（3 页）的书签声明表：{ title, page, items } 喂给 buildPdf 生成 /Outlines；
 * label 只是断言期望值（手写，不参与 PDF 生成）——「无更大后继且 page < pageCount」的唯一文案变化落在 Appendix B。
 */
const SAMPLE_OUTLINE = [
  { title: "1. Abstract", page: 1, label: "1", items: [] },
  {
    title: "2. Method Overview",
    page: 2,
    label: "2",
    items: [
      { title: "2.1 Sparse mask budget", page: 2, label: "2", items: [] },
      { title: "2.2 Positional prior", page: 3, label: "3", items: [] },
    ],
  },
  {
    title: "3. Ablation Study",
    page: 3,
    label: "3",
    items: [
      // 无页码节点：不进 ranges（无页码徽标、无笔记徽标、不参与已读/当前判定）
      {
        title: "Appendix A",
        page: null,
        label: null,
        items: [{ title: "Appendix A.1", page: 3, label: "3", items: [] }],
      },
      { title: "Appendix B", page: 2, label: "2-3", items: [] },
    ],
  },
];

/** long-book.pdf（60 页）：20 章 × 10 节 × 1 子节 = 420 节点；page(Chapter k) = page(Section k.*) = page(Note k.*) = 1+3k。 */
const LONG_BOOK_PAGES = Array.from({ length: 60 }, (_, index) => [
  { text: `Long Book Page ${index + 1}`, size: 16 },
  { text: `Chapter ${Math.floor(index / 3) + 1} body text for the outline scale fixture.`, size: 12 },
]);
const LONG_BOOK_OUTLINE = Array.from({ length: 20 }, (_, chapter) => {
  const chapterLabel = String(chapter + 1).padStart(2, "0");
  const page = 1 + chapter * 3;
  return {
    title: `Chapter ${chapterLabel}`,
    page,
    items: Array.from({ length: 10 }, (_, section) => {
      const sectionLabel = String(section + 1).padStart(2, "0");
      return {
        title: `Section ${chapterLabel}.${sectionLabel}`,
        page,
        items: [{ title: `Note ${chapterLabel}.${sectionLabel}`, page, items: [] }],
      };
    }),
  };
});

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
    // N39 验收 3 的排序样本：与 n-current-2 同页，createdAt 更晚 ⇒ 排在其后并带「AI」徽标
    {
      id: "n-current-3",
      kind: "answer",
      docPath: "sample-paper.pdf",
      page: 2,
      text: "结论：稀疏注意力在三分之一的预算下保持召回，位置先验是关键。",
      comment: "由一次提问总结",
      createdAt: now - 1 * MINUTE,
      updatedAt: now - 1 * MINUTE,
    },
  ];
}

function writeFixtures() {
  mkdirSync(join(LIBRARY_DIR, "archive"), { recursive: true });
  mkdirSync(join(LIBRARY_DIR, ".pix-read"), { recursive: true });
  mkdirSync(join(LIBRARY_B_DIR, ".pix-read"), { recursive: true });
  mkdirSync(SHOTS_DIR, { recursive: true });
  // A/B 两个工作区的 sample-paper.pdf 同字节；B 不预置 reader-state.json（首启 missing）
  const samplePdf = buildPdf(SAMPLE_PAGES, SAMPLE_OUTLINE);
  writeFileSync(join(LIBRARY_DIR, "sample-paper.pdf"), samplePdf);
  writeFileSync(join(LIBRARY_B_DIR, "sample-paper.pdf"), samplePdf);
  // 上一轮遗留的状态文件会让「首启 missing」不可复现：fixture 冻结为两个工作区都没有它
  rmSync(join(LIBRARY_DIR, ".pix-read", "reader-state.json"), { force: true });
  rmSync(join(LIBRARY_B_DIR, ".pix-read", "reader-state.json"), { force: true });
  writeFileSync(join(LIBRARY_DIR, "archive", "older-paper.pdf"), buildPdf(OLDER_PAGES));
  // long-book.pdf:420 节点规模场景的夹具（与 sample-paper 同格式，无页码声明表以外的内容依赖）
  writeFileSync(join(LIBRARY_DIR, "long-book.pdf"), buildPdf(LONG_BOOK_PAGES, LONG_BOOK_OUTLINE));
  writeFileSync(
    join(LIBRARY_DIR, "reading-notes.md"),
    "# 阅读清单\n\n- [x] sample-paper.pdf\n- [ ] archive/older-paper.pdf\n",
  );
  writeFileSync(
    join(LIBRARY_DIR, ".pix-read", "notes.json"),
    // 空空：空态截图（场景 B）必须先于种子出现；种子由场景 C 的 seedNotes 写穿同一个文件
    JSON.stringify({ version: 1, notes: [] }, null, 2) + "\n",
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

let loadDelayMs = 0;
let loadFailure = null;
// PDF 字节读取的注入延迟：只为「加载窗口内连点」场景造出确定的在途加载窗口
let libraryReadDelayMs = 0;
// 笔记：五个口（load/add/update/delete/reset + seed）共用同一个 fixture 文件，内存数组不再是事实源
let notesAddDelayMs = 0;
let notesAddFailure = null;
let notesDeleteFailure = null;
const notesAddCalls = [];
// notesLoad 计数器：52h 的「goHome 不得触发加载」判据（只计数，不影响返回）
let notesLoadCalls = 0;
// 发送类命令（prompt/steer）的记录：notes-context / notes-chip 断言的事实源（N50 验收 1）
const sendCalls = [];
let sendFailure = null;
let agentEventHandlers = [];
// onUserInputRequest 的保留回调（与 onAgentEvent 同形）：emitUserInputRequest 逐个投递
let userInputHandlers = [];
let stubMessages = [];

function clone(list) {
  return list.map(function (note) { return Object.assign({}, note); });
}

function sleep(ms) {
  return new Promise(function (done) { setTimeout(done, ms); });
}

// --- 笔记文件：真读真写 -------------------------------------------------------
// 解析失败/缺文件按空数组降级（stub 专用；主进程同情形判 corrupt，差异见开发档）。
function readNotesFile() {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(NOTES_FILE, "utf8"));
  } catch (err) {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.notes)) return [];
  return clone(parsed.notes);
}

function writeNotesFile(list) {
  fs.mkdirSync(path.dirname(NOTES_FILE), { recursive: true });
  fs.writeFileSync(NOTES_FILE, JSON.stringify({ version: 1, notes: list }, null, 2) + "\\n", "utf8");
}

function normalizeNoteText(value) {
  return String(value == null ? "" : value).replace(/\\s+/g, " ").trim();
}

/** 越界判据与 library-root 的前缀归属口径一致（不校验文件是否存在，场景 36 依赖这一点）。 */
function isInsideNotesRoot(target) {
  const root = String(CONFIG.root).replace(/\\\\/g, "/").replace(/\\/+$/, "").toLowerCase();
  const full = String(target == null ? "" : target).replace(/\\\\/g, "/").toLowerCase();
  return full.indexOf(root + "/") === 0;
}

const NOTES_ERRORS = {
  "no-root": "尚未选择资料库根目录",
  outside: "该文档不在当前资料库内",
  "invalid-input": "笔记数据不合法",
  "too-long": "选中内容过长（超过 4000 字），请分段摘录",
  corrupt: "笔记文件无法读取（文件已损坏，未被修改）",
  "version-unsupported": "笔记文件版本不支持",
  "read-failed": "笔记文件读取失败",
  "write-failed": "笔记写入失败",
};

const ANSWER_TOO_LONG_MESSAGE = "回答过长（超过 4000 字），无法存为笔记";

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
  // prompt/steer：记录 + 三种发送结果注入（throw/fail/null 复位），其余命令不受影响
  if (type === "prompt" || type === "steer") {
    sendCalls.push({
      type: type,
      message: typeof command.message === "string" ? command.message : "",
      displayText: typeof command.displayText === "string" ? command.displayText : "",
    });
    if (sendCalls.length > 8) sendCalls.shift();
    if (sendFailure === "throw") throw new Error("stub 发送注入异常");
    if (sendFailure === "fail") return { success: false, error: "stub 发送被拒绝" };
    return { success: true, data: {} };
  }
  if (type === "get_state") return { success: true, data: SESSION_STATE };
  if (type === "get_available_models") return { success: true, data: { models: MODELS } };
  if (type === "get_commands") return { success: true, data: { commands: [] } };
  if (type === "get_session_stats") return { success: true, data: SESSION_STATS };
  if (type === "get_messages") return { success: true, data: stubMessages };
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
  // 追加在末行：既有行位置不变（waitTreeRows 用 >=，既有场景不受影响）
  { name: "long-book.pdf", path: path.join(CONFIG.root, "long-book.pdf"), type: "file" },
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

  onAgentEvent: function (handler) {
    agentEventHandlers.push(handler);
    return function () {
      agentEventHandlers = agentEventHandlers.filter(function (item) { return item !== handler; });
    };
  },
  onAgentReady: function () { return function () {}; },
  onAgentExit: function () { return function () {}; },
  onAgentError: function () { return function () {}; },
  onUserInputRequest: function (handler) {
    userInputHandlers.push(handler);
    return function () {
      userInputHandlers = userInputHandlers.filter(function (item) { return item !== handler; });
    };
  },

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
    notesLoadCalls += 1;
    if (loadDelayMs) await sleep(loadDelayMs);
    if (loadFailure) {
      return { success: false, notes: [], filePath: NOTES_FILE, code: loadFailure.code, error: loadFailure.error };
    }
    return { success: true, notes: readNotesFile(), filePath: NOTES_FILE };
  },
  notesAdd: async function (draft) {
    const payload = {
      docFilePath: draft ? draft.docFilePath : null,
      page: draft ? draft.page : null,
      text: draft ? draft.text : null,
      kind: draft ? draft.kind : null,
    };
    notesAddCalls.push(payload);
    if (notesAddDelayMs) await sleep(notesAddDelayMs);
    if (notesAddFailure === "throw") throw new Error("stub notesAdd 注入异常");
    if (notesAddFailure) {
      return {
        success: false,
        notes: [],
        code: notesAddFailure,
        error: NOTES_ERRORS[notesAddFailure] || notesAddFailure,
      };
    }
    if (payload.kind !== "excerpt" && payload.kind !== "answer") {
      return { success: false, notes: [], code: "invalid-input", error: NOTES_ERRORS["invalid-input"] };
    }
    if (!isInsideNotesRoot(payload.docFilePath)) {
      return { success: false, notes: [], code: "outside", error: NOTES_ERRORS.outside };
    }
    const text = normalizeNoteText(payload.text);
    if (!text) return { success: false, notes: [], code: "invalid-input", error: NOTES_ERRORS["invalid-input"] };
    if (text.length > 4000) {
      return {
        success: false,
        notes: [],
        code: "too-long",
        error: payload.kind === "answer" ? ANSWER_TOO_LONG_MESSAGE : NOTES_ERRORS["too-long"],
      };
    }
    const docPath = relativeDocPath(payload.docFilePath);
    const current = readNotesFile();
    const existing = current.filter(function (note) {
      return note.docPath === docPath && note.page === payload.page && note.kind === payload.kind && note.text === text;
    })[0];
    if (existing) return { success: true, notes: clone(current), duplicateOf: existing.id };
    const now = Date.now();
    const note = {
      id: "n-" + now + "-" + Math.random().toString(36).slice(2, 7),
      kind: payload.kind,
      docPath: docPath,
      page: payload.page,
      text: text,
      comment: "",
      createdAt: now,
      updatedAt: now,
    };
    const next = current.concat([note]);
    writeNotesFile(next);
    return { success: true, notes: clone(next), note: Object.assign({}, note) };
  },
  notesUpdate: async function (id, comment) {
    const next = readNotesFile().map(function (note) {
      return note.id === id ? Object.assign({}, note, { comment: comment, updatedAt: Date.now() }) : note;
    });
    writeNotesFile(next);
    return { success: true, notes: clone(next) };
  },
  notesDelete: async function (id) {
    // 失败注入：只影响返回/抛出，不写盘（与 notesAdd 同形）
    if (notesDeleteFailure === "throw") throw new Error("stub notesDelete 注入异常");
    if (notesDeleteFailure) {
      return {
        success: false,
        notes: [],
        code: notesDeleteFailure,
        error: NOTES_ERRORS[notesDeleteFailure] || notesDeleteFailure,
      };
    }
    const next = readNotesFile().filter(function (note) { return note.id !== id; });
    writeNotesFile(next);
    return { success: true, notes: clone(next) };
  },
  notesExport: async function () {
    // 与 notesLoad 同源（文件），避免「内存数组 vs 文件」两套事实源；stub 不生成 notes.md 内容
    return { success: true, filePath: path.join(CONFIG.root, ".pix-read", "notes.md"), count: readNotesFile().length };
  },
  notesReset: async function () {
    writeNotesFile([]);
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
  seedNotes: function (list) {
    writeNotesFile(clone(list));
    return NOTES_FILE;
  },
  notesAddCalls: function () {
    return { count: notesAddCalls.length, payloads: notesAddCalls.slice(-8) };
  },
  notesLoadCalls: function () { return notesLoadCalls; },
  setNotesAddFailure: function (code) { notesAddFailure = code || null; },
  setNotesDeleteFailure: function (code) { notesDeleteFailure = code || null; },
  sendCalls: function () {
    return { count: sendCalls.length, payloads: sendCalls.slice(-8) };
  },
  clearSendCalls: function () { sendCalls.length = 0; },
  setSendFailure: function (mode) { sendFailure = mode || null; },
  emitUserInputRequest: function (request) {
    userInputHandlers.slice().forEach(function (handler) {
      handler(request);
    });
  },
  setNotesAddDelay: function (ms) { notesAddDelayMs = ms || 0; },
  setMessages: function (list) {
    stubMessages = Array.isArray(list) ? list.map(function (message) { return Object.assign({}, message); }) : [];
  },
  emitAgentEvent: function (event) {
    agentEventHandlers.slice().forEach(function (handler) {
      handler(event);
    });
  },
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

  // -------------------------------------------------------------------------
  // 场景 30–36：回答块「存为笔记」（R7 / N35–N42）
  //
  // 挂载位置：本函数末尾。record / removeState / waitPage / goHome / enterWorkspace /
  // openRow / clickNext / openNotesTab 只在本作用域内，换到 runScenario 会引入第二份口径。
  // 资源顺序：36 末段的 rmSync(archive/older-paper.pdf) 是该文件的最后一次使用；
  // 30–36 里所有打开或断言它的步骤都在 rmSync 之前。
  // -------------------------------------------------------------------------

  const NOTES_FILE = join(LIBRARY_DIR, ".pix-read", "notes.json");
  const readNotes = () => JSON.parse(readFileSync(NOTES_FILE, "utf8")).notes;
  const notesHash = () => createHash("sha256").update(readFileSync(NOTES_FILE)).digest("hex");
  const notesAddCalls = () => js("window.__pixStub.notesAddCalls()");
  const emit = (event) => js(`window.__pixStub.emitAgentEvent(${JSON.stringify(event)}), true`);
  const clearStateA = () => removeState(STATE_FILE_A);
  const userBlocks = () => countOf(".chat-messages .message-block");

  /** 末尾第 n 个回答块的保存提示（n = 1 即最后一块）；唯一写法，不留第二份定位口径。 */
  const answerTitleFromEnd = (n) => js(`(() => {
    const blocks = Array.from(document.querySelectorAll(".agent-message"));
    const block = blocks.length >= ${n} ? blocks[blocks.length - ${n}] : null;
    const wrap = block ? block.querySelector(".answer-save-wrap") : null;
    return wrap ? wrap.getAttribute("title") : null;
  })()`);
  const titleOfLastAnswer = () => answerTitleFromEnd(1);
  const textOfLastAnswer = () => js(`(() => {
    const blocks = Array.from(document.querySelectorAll(".agent-message"));
    const block = blocks[blocks.length - 1];
    const body = block ? block.querySelector(".agent-markdown") : null;
    return body ? body.textContent.trim() : null;
  })()`);
  const feedbackOfLast = () => js(`(() => {
    const nodes = Array.from(document.querySelectorAll(".answer-note-feedback"));
    const el = nodes[nodes.length - 1];
    return el ? { state: el.getAttribute("data-state"), text: el.textContent.replace(/\\s+/g, " ").trim() } : null;
  })()`);
  /** 反馈期按钮被 v-if/v-else 移除：同一块第二次点击前必须等按钮回位（2500ms 上限内）。 */
  const waitFeedbackGone = () => waitFor("反馈回位", `(() => {
    if (document.querySelectorAll(".answer-note-feedback").length !== 0) return false;
    const blocks = document.querySelectorAll(".agent-message");
    const last = blocks[blocks.length - 1];
    return !!last && !!last.querySelector(".answer-save-btn");
  })()`);

  // --- 驱动原语（设计档 §7.4.1）：hover 与 composer 都走真驱动 ---

  /** 指针移动首选 CDP：走浏览器输入管线，:hover 必然更新；attach 一次复用，不 per-call detach。 */
  const cdpMove = async (x, y) => {
    if (!win.webContents.debugger.isAttached()) await win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
      clickCount: 0,
      modifiers: 0,
    });
  };

  const pointOf = (selector, index, probe) => js(`(() => {
    const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    const el = ${index} < 0 ? nodes[nodes.length + ${index}] : nodes[${index}];
    if (!el) return null;
    const inView = (point) => point.x > 0 && point.x < window.innerWidth && point.y > 0 && point.y < window.innerHeight;
    const centerOf = (node) => {
      const box = node.getBoundingClientRect();
      return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    };
    const scrollTo = (node) => {
      node.scrollIntoView({ block: "center" });
      return centerOf(node);
    };
    // 动作区所在行优先：整块滚到居中时动作区会被滚出视口（超长回答），所以先滚动作区自身
    const target = ${probe ? `el.querySelector(${JSON.stringify(probe)})` : "el"};
    if (target) {
      const point = scrollTo(target);
      if (inView(point)) return point;
    }
    // 回落：块内首行（再不行就整块）
    const body = el.querySelector(".agent-markdown");
    const first = body ? (body.firstElementChild || body) : el;
    const fallback = scrollTo(first);
    return inView(fallback) ? fallback : scrollTo(el);
  })()`);

  const readProbe = (selector, index, probe) => js(`(() => {
    const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    const el = ${index} < 0 ? nodes[nodes.length + ${index}] : nodes[${index}];
    const target = ${probe ? `el && el.querySelector(${JSON.stringify(probe)})` : "el"};
    if (!target) return null;
    const box = target.getBoundingClientRect();
    return {
      opacity: getComputedStyle(target).opacity,
      rect: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
    };
  })()`);

  /**
   * 真 hover：scrollIntoView + 落点校验 + 指针移动 + 等过渡（0.15s）后返回 probe 的 opacity。
   * 判定顺序（must-fix 8）：CDP 首选 → sendInputEvent 兜底（CDP 抛错或复读仍非 1）→ forced。
   * index 默认 -1：一个会话里可能有多个回答块，默认取最后一个（本轮新块）。
   */
  const moveMouse = async (selector, index = -1, probe = null) => {
    const point = await pointOf(selector, index, probe);
    if (!point) throw new Error(`moveMouse 找不到落点：${selector}${probe ? " / " + probe : ""}`);
    const hit = await js(`(() => {
      const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      const el = ${index} < 0 ? nodes[nodes.length + ${index}] : nodes[${index}];
      const found = document.elementFromPoint(${point.x}, ${point.y});
      return { inTarget: !!el && !!found && el.contains(found), found: found ? String(found.className) : null };
    })()`);
    if (!hit.inTarget) throw new Error(`moveMouse 落点不在目标元素内：${hit.found}`);
    let driver = "forced";
    let cdpError = null;
    let sendInputError = null;
    let state = null;
    try {
      await cdpMove(point.x, point.y);
      await sleep(250);
      state = await readProbe(selector, index, probe);
      if (state && state.opacity === "1") driver = "cdp";
    } catch (err) {
      cdpError = String(err).slice(0, 200);
    }
    if (driver !== "cdp") {
      try {
        win.webContents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
        await sleep(250);
        state = await readProbe(selector, index, probe);
        if (state && state.opacity === "1") driver = "sendInputEvent";
      } catch (err) {
        sendInputError = String(err).slice(0, 200);
      }
    }
    return { driver, opacity: state ? state.opacity : null, point, cdpError, sendInputError };
  };

  /** 中性落点：读「未 hover」的 opacity 之前必须先把指针移出动作区，否则读到的是上一次的 hover 态。 */
  const moveNeutral = async () => {
    const point = await js(`(() => {
      const el = document.querySelector(".chat-header");
      if (!el) return { x: 8, y: 8 };
      const box = el.getBoundingClientRect();
      return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + 6) };
    })()`);
    try {
      await cdpMove(point.x, point.y);
    } catch {
      win.webContents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
    }
    await sleep(250);
    return point;
  };

  /** 同理：一个会话里可能有多个同类元素，默认点最后一个（本轮新块）。 */
  const clickLast = (selector, index = -1) => js(`(() => {
    const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    const el = ${index} < 0 ? nodes[nodes.length + ${index}] : nodes[${index}];
    if (!el) throw new Error("clickLast 找不到元素：" + ${JSON.stringify(selector)});
    el.click();
    return true;
  })()`);

  /** composer 写值原语：原生 setter + 派发 input；typeAndSend 与 sendViaEnter 共用，不留第二份写法。 */
  const setDraft = async (text) => {
    await js(`(() => {
      const input = document.querySelector(".input-area");
      if (!input) throw new Error("composer input not found");
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(text)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
  };

  /** composer 驱动：写值 → 等 .composer-send 可点 → click（不依赖键盘与焦点）。 */
  const typeAndSend = async (text) => {
    await setDraft(text);
    await waitFor("发送按钮可点", `(() => { const b = document.querySelector(".composer-send"); return !!b && !b.disabled; })()`);
    await js(`document.querySelector(".composer-send").click(), true`);
  };

  /** 流式中（isStreaming）`.composer-send` 被 `.composer-stop` 替换：steer 路径只能走 Enter。 */
  const sendViaEnter = async (text) => {
    await setDraft(text);
    await js(`document.querySelector(".input-area").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })), true`);
  };

  /** 一轮事件序列：确认用户消息 → agent_start → 回答流 → message_end → agent_end。 */
  const runTurn = async (userText, answerText, confirmText = userText) => {
    const now = Date.now();
    await emit({ type: "message_start", message: { role: "user", content: confirmText, displayText: confirmText, timestamp: now } });
    await emit({ type: "agent_start" });
    await emit({ type: "message_start", message: { role: "assistant", content: answerText, timestamp: now + 1 } });
    await emit({ type: "message_update", message: { role: "assistant", content: answerText, timestamp: now + 2 } });
    await emit({ type: "message_end", message: { role: "assistant", content: answerText, timestamp: now + 3 } });
    await emit({ type: "agent_end", messages: [] });
  };

  const rectOfSelector = async (selector, pad = 0) => {
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

  /** 行定位子串：空白归一化后仍保留，DOM 与 fixture 两侧共用。 */
  const ANSWER1_TEXT = [
    "## 结论",
    "",
    "- 稀疏注意力在 1/3 预算下保持召回",
    "- 位置先验是消融中的关键变量",
    "",
    "```python",
    "def sparse_attention(tokens, budget):",
    "    return tokens[:budget]",
    "```",
  ].join("\n");
  const ROW_FROM_31 = "def sparse_attention";

  // --- 30 情形 (a)：锚点优先（hover 双动作 + 标题指向发送时页码）------------------
  log("30 情形 (a)：第 2 页发送 → 翻页与换文档后目标仍是第 2 页");
  const TURN1_TEXT = "这篇论文的结论是什么？";
  await goHome();
  clearStateA();
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await clickNext();
  await waitPage(2, 3);
  const userBase30 = await userBlocks();
  await typeAndSend(TURN1_TEXT);
  await emit({ type: "message_start", message: { role: "user", content: TURN1_TEXT, displayText: TURN1_TEXT, timestamp: Date.now() } });
  await emit({ type: "agent_start" });
  await emit({ type: "message_start", message: { role: "assistant", content: "结论：", timestamp: Date.now() } });
  await emit({ type: "message_update", message: { role: "assistant", content: ANSWER1_TEXT, timestamp: Date.now() } });
  await sleep(250);
  const streaming = { btnCount: await countOf(".answer-save-btn"), wrapCount: await countOf(".answer-save-wrap") };
  await capturePage(win, "30b-answer-streaming.png");
  record("answer-save", { phase: "streaming", ...streaming }, [
    ...(streaming.btnCount === 0 ? [] : [`流式中不应渲染保存按钮：${streaming.btnCount}`]),
  ]);
  await emit({ type: "message_end", message: { role: "assistant", content: ANSWER1_TEXT, timestamp: Date.now() } });
  await emit({ type: "agent_end", messages: [] });
  await sleep(200);
  const idle = { btnCount: await countOf(".answer-save-btn") };
  record("answer-save", { phase: "idle", ...idle }, [
    ...(idle.btnCount === 1 ? [] : [`回答完成后应有 1 个保存按钮：${idle.btnCount}`]),
  ]);
  await moveNeutral();
  const beforeHover = await readProbe(".agent-message", -1, ".answer-save-wrap");
  const hover = await moveMouse(".agent-message", -1, ".answer-save-wrap");
  const hoverState = await js(`(() => {
    const blocks = Array.from(document.querySelectorAll(".agent-message"));
    const block = blocks[blocks.length - 1];
    const wrap = block ? block.querySelector(".answer-save-wrap") : null;
    const copy = block ? block.querySelector(".message-copy-btn") : null;
    const a = wrap ? wrap.getBoundingClientRect() : null;
    const b = copy ? copy.getBoundingClientRect() : null;
    const overlap = !!a && !!b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    return {
      wrapOpacity: wrap ? getComputedStyle(wrap).opacity : null,
      title: wrap ? wrap.getAttribute("title") : null,
      copyBtnCount: block ? block.querySelectorAll(".message-copy-btn").length : 0,
      saveBtnCount: block ? block.querySelectorAll(".answer-save-btn").length : 0,
      overlap,
    };
  })()`);
  const forced = hover.driver === "forced";
  if (forced) {
    // 降级（must-fix 8）：两级驱动都拿不到 opacity 1 时才走这里，只影响截图与 opacity 断言
    await js(`(() => {
      const blocks = Array.from(document.querySelectorAll(".agent-message"));
      const wrap = blocks.length ? blocks[blocks.length - 1].querySelector(".answer-save-wrap") : null;
      if (wrap) wrap.style.opacity = "1";
      return true;
    })()`);
  }
  record(
    "answer-save",
    {
      phase: "hover-before",
      wrapOpacity: beforeHover ? beforeHover.opacity : null,
      hoverDriver: hover.driver,
      cdpError: hover.cdpError,
      sendInputError: hover.sendInputError,
    },
    [...(beforeHover && beforeHover.opacity === "0" ? [] : [`未 hover 时动作区应隐藏：${JSON.stringify(beforeHover)}`])],
  );
  record(
    "answer-save",
    { phase: "hover", hoverDriver: hover.driver, forcedVisible: forced, ...hoverState },
    [
      ...(forced || hoverState.wrapOpacity === "1" ? [] : [`hover 后动作区应显形：${hoverState.wrapOpacity}`]),
      ...(hoverState.copyBtnCount === 1 && hoverState.saveBtnCount === 1
        ? []
        : ["hover 后应同时出现复制与存为笔记两个动作"]),
      ...(hoverState.overlap === false ? [] : ["动作区与复制按钮重叠"]),
      ...(hoverState.title && hoverState.title.includes("sample-paper.pdf") && hoverState.title.includes("第 2 页")
        ? []
        : [`提示未指向发送时的文档与页码：${hoverState.title}`]),
    ],
  );
  await capturePage(win, "30-answer-save-btn.png");
  const userAfter30 = await userBlocks();
  record("answer-save", { phase: "confirm", base: userBase30, userBlocks: userAfter30 }, [
    ...(userAfter30 === userBase30 + 1 ? [] : [`确认命中不应新增无锚点用户块：${userBase30} → ${userAfter30}`]),
  ]);
  await clickNext();
  await waitPage(3, 3);
  await sleep(150);
  const afterFlip = await titleOfLastAnswer();
  record("answer-anchor", { phase: "flip-page", title: afterFlip }, [
    ...(afterFlip && afterFlip.includes("第 2 页") ? [] : [`翻页后提示应仍指向第 2 页：${afterFlip}`]),
  ]);
  await openRow("older-paper.pdf");
  await waitPage(1, 2);
  await sleep(150);
  const afterSwitch = await titleOfLastAnswer();
  record("answer-anchor", { phase: "switch-doc", title: afterSwitch }, [
    ...(afterSwitch && afterSwitch.includes("sample-paper.pdf") && afterSwitch.includes("第 2 页")
      ? []
      : [`换文档后锚点目标应不变：${afterSwitch}`]),
  ]);

  // --- 31 保存成功 ------------------------------------------------------------
  log("31 保存成功：payload 带锚点页码与 kind，入库文本是回答原文");
  const callsBase31 = (await notesAddCalls()).count;
  await moveMouse(".agent-message", -1, ".answer-save-wrap");
  await clickLast(".answer-save-btn");
  await waitFor("保存成功反馈", `document.querySelector('.answer-note-feedback[data-state="ok"]')`);
  const hash31 = notesHash();
  const calls31 = await notesAddCalls();
  const payload31 = calls31.payloads.slice(-1)[0];
  const feedback31 = await feedbackOfLast();
  const file31 = readNotes();
  const saved31 = file31.filter((note) => note.kind === "answer" && note.docPath === "sample-paper.pdf" && note.page === 2).slice(-1)[0];
  const tabLabel31 = await textOf('.pill-tab[data-tab="notes"]');
  await capturePage(win, "31-answer-save-ok.png");
  record(
    "answer-anchor",
    {
      phase: "payload",
      delta: calls31.count - callsBase31,
      lastPayload: payload31,
      saved: saved31
        ? {
            docPath: saved31.docPath,
            page: saved31.page,
            kind: saved31.kind,
            hasFence: saved31.text.includes("```python"),
            hasRenderArtifact: /<div|<p |class=/.test(saved31.text),
          }
        : null,
    },
    [
      ...(calls31.count - callsBase31 === 1 ? [] : [`一次点击应恰好发 1 次 notesAdd：+${calls31.count - callsBase31}`]),
      ...(payload31 && payload31.kind === "answer" && payload31.page === 2 && String(payload31.docFilePath).endsWith("sample-paper.pdf")
        ? []
        : [`payload 异常：${JSON.stringify(payload31)}`]),
      ...(saved31 ? [] : ["fixture 内缺少 sample-paper 第 2 页的 answer 条目"]),
      ...(saved31 && saved31.text.includes("```python") ? [] : ["入库文本应是回答原文（保留 markdown 围栏）"]),
      ...(saved31 && !/<div|<p |class=/.test(saved31.text) ? [] : ["入库文本混入了渲染产物"]),
    ],
  );
  record(
    "answer-feedback",
    { phase: "ok", state: feedback31 ? feedback31.state : null, text: feedback31 ? feedback31.text : null, tabLabel: tabLabel31 },
    [
      ...(feedback31 && feedback31.state === "ok" && feedback31.text.includes("已存为笔记") && feedback31.text.includes("第 2 页")
        ? []
        : [`成功反馈异常：${JSON.stringify(feedback31)}`]),
      ...(tabLabel31 === `笔记 ${file31.length}` ? [] : [`左栏计数应与文件自洽：${tabLabel31} vs ${file31.length}`]),
    ],
  );

  // --- 31b 重复保存（先等反馈过期再点，反馈期按钮被 v-if 移除）------------------
  log("31b 重复保存：去重命中、零写入");
  await waitFeedbackGone();
  const hash31b = notesHash();
  const callsBase31b = (await notesAddCalls()).count;
  await moveMouse(".agent-message", -1, ".answer-save-wrap");
  await clickLast(".answer-save-btn");
  await waitFor("去重反馈", `document.querySelector('.answer-note-feedback[data-state="duplicate"]')`);
  const feedback31b = await feedbackOfLast();
  const calls31b = (await notesAddCalls()).count;
  await capturePage(win, "31b-answer-save-duplicate.png");
  record(
    "answer-feedback",
    {
      phase: "duplicate",
      state: feedback31b ? feedback31b.state : null,
      text: feedback31b ? feedback31b.text : null,
      callsDelta: calls31b - callsBase31b,
      bytesUnchanged: notesHash() === hash31b && hash31b === hash31,
    },
    [
      ...(feedback31b && feedback31b.state === "duplicate" && feedback31b.text === "已在笔记中"
        ? []
        : [`去重反馈异常：${JSON.stringify(feedback31b)}`]),
      ...(calls31b - callsBase31b === 1 ? [] : [`重复保存也应只有 1 次 IPC：+${calls31b - callsBase31b}`]),
      ...(notesHash() === hash31b ? [] : ["重复保存改动了 notes.json 字节"]),
      ...(hash31b === hash31 ? [] : ["跨 31/31b 的字节基线不一致"]),
    ],
  );

  // --- 31b2 在途连点（同一同步段两次点击 → pending 守卫只放一次）----------------
  log("31b2 在途连点：setNotesAddDelay(600) 造窗口，两次点击只发一次 notesAdd");
  const TURN2_TEXT = "换一篇文档再问一次";
  await waitFeedbackGone();
  await typeAndSend(TURN2_TEXT);
  await runTurn(TURN2_TEXT, "第二轮回答");
  await waitFor("第二轮回答块", `document.querySelectorAll(".agent-message").length >= 2`);
  await sleep(200);
  const callsBase31b2 = (await notesAddCalls()).count;
  await js("window.__pixStub.setNotesAddDelay(600), true");
  await js(`(() => {
    const nodes = document.querySelectorAll(".answer-save-btn");
    const target = nodes[nodes.length - 1];
    target.click();
    target.click();
    return true;
  })()`);
  await waitFor("在途反馈", `document.querySelector(".answer-note-feedback")`);
  await js("window.__pixStub.setNotesAddDelay(0), true");
  const calls31b2 = await notesAddCalls();
  const payload31b2 = calls31b2.payloads.slice(-1)[0];
  const file31b2 = readNotes();
  record(
    "answer-save",
    {
      phase: "reentrant",
      delta: calls31b2.count - callsBase31b2,
      payloads: calls31b2.payloads.slice(-2),
      inFile: file31b2.some((note) => note.docPath === "archive/older-paper.pdf" && note.page === 1 && note.text === "第二轮回答"),
    },
    [
      ...(calls31b2.count - callsBase31b2 === 1 ? [] : [`在途连点应只发 1 次：+${calls31b2.count - callsBase31b2}`]),
      ...(payload31b2 &&
      payload31b2.kind === "answer" &&
      payload31b2.page === 1 &&
      String(payload31b2.docFilePath).endsWith("older-paper.pdf") &&
      payload31b2.text === "第二轮回答"
        ? []
        : [`payload 异常：${JSON.stringify(payload31b2)}`]),
      ...(file31b2.some((note) => note.docPath === "archive/older-paper.pdf" && note.page === 1 && note.text === "第二轮回答")
        ? []
        : ["fixture 内缺少第二轮的 answer 条目"]),
    ],
  );

  // --- 31c 超长拒绝 + 空白回答不渲染按钮 ---------------------------------------
  log("31c 超长回答：answer 文案逐字、零写入；空白回答不渲染动作");
  const TURN3_TEXT = "给一段超长的回答";
  const TURN4_TEXT = "再给一段空白回答";
  await waitFeedbackGone();
  await typeAndSend(TURN3_TEXT);
  await runTurn(TURN3_TEXT, "长".repeat(4001));
  await waitFor("第三轮回答块", `document.querySelectorAll(".agent-message").length >= 3`);
  await sleep(200);
  const title31c = await titleOfLastAnswer();
  record("answer-save", { phase: "turn-3", title: title31c }, [
    ...(title31c && title31c.includes("older-paper.pdf") && title31c.includes("第 1 页")
      ? []
      : [`本轮锚点应为 older-paper.pdf 第 1 页：${title31c}`]),
  ]);
  const hash31c = notesHash();
  const callsBase31c = (await notesAddCalls()).count;
  await moveMouse(".agent-message", -1, ".answer-save-wrap");
  await clickLast(".answer-save-btn");
  await waitFor("超长反馈", `document.querySelector('.answer-note-feedback[data-state="error"]')`);
  const feedback31c = await feedbackOfLast();
  await capturePage(win, "31c-answer-save-too-long.png");
  record(
    "answer-feedback",
    {
      phase: "too-long",
      state: feedback31c ? feedback31c.state : null,
      text: feedback31c ? feedback31c.text : null,
      calls: (await notesAddCalls()).count - callsBase31c,
      bytesUnchanged: notesHash() === hash31c,
    },
    [
      ...(feedback31c && feedback31c.text === "保存失败：回答过长（超过 4000 字），无法存为笔记"
        ? []
        : [`超长文案异常：${JSON.stringify(feedback31c)}`]),
      ...(notesHash() === hash31c ? [] : ["超长拒绝不应写盘"]),
    ],
  );
  await waitFeedbackGone();
  await typeAndSend(TURN4_TEXT);
  await runTurn(TURN4_TEXT, "   ");
  await waitFor("第四轮回答块", `document.querySelectorAll(".agent-message").length >= 4`);
  await sleep(200);
  const blank = {
    // 与设计档同名的 saveBtnCount 定位在「最后一个 .agent-message」（前面几轮的按钮仍在，故不用全局计数）
    saveBtnCount: await js(`(() => {
      const blocks = document.querySelectorAll(".agent-message");
      const last = blocks[blocks.length - 1];
      return last ? last.querySelectorAll(".answer-save-btn").length : -1;
    })()`),
    globalSaveBtnCount: await countOf(".answer-save-btn"),
    lastBlockSaveWrapCount: await js(`(() => {
      const blocks = document.querySelectorAll(".agent-message");
      const last = blocks[blocks.length - 1];
      return last ? last.querySelectorAll(".answer-save-wrap").length : -1;
    })()`),
    lastBlockTextTrim: await textOfLastAnswer(),
  };
  record("answer-save", { phase: "blank-content", ...blank }, [
    ...(blank.saveBtnCount === 0 ? [] : [`空白回答不应有保存按钮：${blank.saveBtnCount}`]),
    ...(blank.lastBlockSaveWrapCount === 0 ? [] : [`空白回答不应渲染动作容器：${blank.lastBlockSaveWrapCount}`]),
    ...(blank.lastBlockTextTrim === "" ? [] : [`最后一块应为空白：${JSON.stringify(blank.lastBlockTextTrim)}`]),
  ]);

  // --- 32 徽标与排序 + answer 行的备注/删除/跳回 ---------------------------------
  log("32 徽标与排序（answer 与 excerpt 同组混排）");
  await openNotesTab();
  await waitFor("笔记列表", `document.querySelectorAll(".note-row").length >= 3`);
  await js(`document.querySelector(".notes-panel").scrollTop = 0, true`);
  const file32 = readNotes();
  const badgeProbe = await js(`(() => {
    const badges = Array.from(document.querySelectorAll(".note-ai-badge"));
    const groupHead = Array.from(document.querySelectorAll(".notes-group-head")).find((el) =>
      (el.getAttribute("title") || "").includes("sample-paper.pdf"));
    const groupRows = groupHead ? Array.from(groupHead.parentElement.querySelectorAll(".note-row")) : [];
    const page2 = groupRows.filter((row) => {
      const badge = row.querySelector(".note-page-badge");
      return !!badge && badge.textContent.replace(/\\s+/g, " ").trim() === "第 2 页";
    });
    const textOfRow = (row) => {
      const el = row.querySelector(".note-text");
      return el ? el.textContent : null;
    };
    return {
      badgeCount: badges.length,
      badgeTexts: badges.map((el) => el.textContent.replace(/\\s+/g, " ").trim()),
      page2Texts: page2.map(textOfRow),
      page2BadgeCounts: page2.map((row) => row.querySelectorAll(".note-ai-badge").length),
      excerptRowHasNoBadge: groupRows.some((row) => {
        const text = textOfRow(row);
        return !!text && text.includes("attention budget is the binding constraint") && row.querySelectorAll(".note-ai-badge").length === 0;
      }),
      headOverflow: groupRows.map((row) => {
        const head = row.querySelector(".note-head");
        return head ? head.scrollWidth <= head.clientWidth : null;
      }),
    };
  })()`);
  const fileAnswerCount = file32.filter((note) => note.kind === "answer").length;
  const page2Texts = badgeProbe ? badgeProbe.page2Texts : [];
  const page2Ids = page2Texts.map((text) => {
    const hit = file32.find((note) => note.text === text);
    return hit ? hit.id : null;
  });
  const excerptIndex = page2Ids.indexOf("n-current-2");
  const answerIndex = page2Ids.indexOf("n-current-3");
  await capturePage(win, "32-answer-note-badge.png");
  const leftRect = await rectOfSelector(".layout-left", 2);
  if (leftRect) await capturePage(win, "32b-answer-note-badge-left-pane.png", leftRect);
  record(
    "answer-notes-list",
    {
      phase: "badges",
      badgeCount: badgeProbe ? badgeProbe.badgeCount : null,
      fileAnswerCount,
      badgeTexts: badgeProbe ? badgeProbe.badgeTexts : null,
      page2Ids,
      page2BadgeCounts: badgeProbe ? badgeProbe.page2BadgeCounts : null,
      excerptRowHasNoBadge: badgeProbe ? badgeProbe.excerptRowHasNoBadge : null,
      headOverflow: badgeProbe ? badgeProbe.headOverflow : null,
    },
    [
      ...(badgeProbe && badgeProbe.badgeCount === fileAnswerCount
        ? []
        : [`徽标数应等于文件内 answer 条数：${badgeProbe ? badgeProbe.badgeCount : null} vs ${fileAnswerCount}`]),
      ...(badgeProbe && badgeProbe.badgeTexts.every((text) => text === "AI") ? [] : ["徽标文本应为 AI"]),
      ...(excerptIndex >= 0 && answerIndex >= 0 && excerptIndex < answerIndex
        ? []
        : [`同页顺序异常（excerpt 应在 answer 之前）：${JSON.stringify(page2Ids)}`]),
      ...(badgeProbe && badgeProbe.excerptRowHasNoBadge ? [] : ["excerpt 行不应有 AI 徽标"]),
      ...(badgeProbe && badgeProbe.headOverflow.every((value) => value === true) ? [] : ["answer 行头部横向溢出"]),
    ],
  );

  const rowFinder = (needle, exact) => `Array.from(document.querySelectorAll(".note-row")).find((row) => {
    const el = row.querySelector(".note-text");
    if (!el) return false;
    return ${exact ? `el.textContent.trim() === ${JSON.stringify(needle)}` : `el.textContent.includes(${JSON.stringify(needle)})`};
  })`;

  // (a) 备注：等价断言的另一半是 fixture 文件的 comment 字段
  await js(`(() => {
    const row = ${rowFinder(ROW_FROM_31, false)};
    if (!row) throw new Error("31 写入的 answer 行未找到");
    const trigger = row.querySelector(".comment-trigger");
    if (!trigger) throw new Error("备注入口未找到");
    trigger.click();
    return true;
  })()`);
  await waitFor("备注编辑态", `document.querySelector(".note-comment textarea")`);
  await js(`(() => {
    const area = document.querySelector(".note-comment textarea");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(area, "由回答入库");
    area.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await js(`(() => {
    const actions = Array.from(document.querySelectorAll(".comment-actions .v-btn"));
    const save = actions.find((el) => (el.textContent || "").includes("保存"));
    if (!save) throw new Error("备注保存按钮未找到");
    save.click();
    return true;
  })()`);
  await waitFor("备注回显", `(() => {
    const row = ${rowFinder(ROW_FROM_31, false)};
    const text = row ? row.querySelector(".comment-text") : null;
    return !!text && text.textContent.trim() === "由回答入库";
  })()`);
  const comment31 = readNotes().filter((note) => note.kind === "answer" && note.text.includes(ROW_FROM_31)).slice(-1)[0];
  record(
    "answer-note-row",
    { phase: "comment", domComment: "由回答入库", fileComment: comment31 ? comment31.comment : null },
    [...(comment31 && comment31.comment === "由回答入库" ? [] : [`fixture 内的备注未写入：${comment31 ? comment31.comment : null}`])],
  );

  // (b) 删除二次确认
  const rowsBefore32 = await countOf(".note-row");
  const fileBefore32 = readNotes().length;
  await js(`(() => {
    const row = ${rowFinder("第二轮回答", true)};
    if (!row) throw new Error("31b2 写入的 answer 行未找到");
    row.querySelector(".note-delete").click();
    return true;
  })()`);
  await waitFor("删除二次确认", `(() => {
    const row = ${rowFinder("第二轮回答", true)};
    return !!row && row.classList.contains("confirming");
  })()`);
  await js(`(() => {
    const row = ${rowFinder("第二轮回答", true)};
    if (!row) throw new Error("确认行已消失");
    row.querySelector(".note-delete").click();
    return true;
  })()`);
  await waitFor("删除完成", `(() => {
    const row = ${rowFinder("第二轮回答", true)};
    return !row && document.querySelectorAll(".note-ai-badge").length === ${file32.filter((note) => note.kind === "answer").length - 1};
  })()`);
  const deleteState = {
    confirming: true,
    rowsDelta: (await countOf(".note-row")) - rowsBefore32,
    fileDelta: readNotes().length - fileBefore32,
    badgeCountEqFile: (await countOf(".note-ai-badge")) === readNotes().filter((note) => note.kind === "answer").length,
  };
  record("answer-note-row", { phase: "delete-confirm", ...deleteState }, [
    ...(deleteState.rowsDelta === -1 ? [] : [`删除后行数应 -1：${deleteState.rowsDelta}`]),
    ...(deleteState.fileDelta === -1 ? [] : [`删除后文件条数应 -1：${deleteState.fileDelta}`]),
    ...(deleteState.badgeCountEqFile ? [] : ["删除后徽标数应与文件自洽"]),
  ]);

  // (c) 跳回原文（跳转后停在 sample-paper.pdf 第 2 页）
  await js(`(() => {
    const row = ${rowFinder(ROW_FROM_31, false)};
    if (!row) throw new Error("跳回行的定位失败");
    row.click();
    return true;
  })()`);
  await waitPdfLoaded();
  await waitPage(2, 3);
  const jump32 = { pageLabel: await pageLabel() };
  record("answer-note-row", { phase: "jump", ...jump32 }, [
    ...(jump32.pageLabel === "第 2 / 3 页" ? [] : [`跳回原文页异常：${jump32.pageLabel}`]),
  ]);

  // --- 33 情形 (b)：历史消息无锚点 → 按当前阅读位置 -----------------------------
  log("33 情形 (b)：历史会话 + 当前阅读位置回退");
  await js(
    `window.__pixStub.setMessages(${JSON.stringify([
      { role: "user", content: "这篇论文的结论是什么？", timestamp: Date.now() - 60000 },
      { role: "assistant", content: [{ type: "text", text: "结论：稀疏注意力在 1/3 预算下保持召回。" }], timestamp: Date.now() - 50000 },
    ])}), true`,
  );
  await goHome();
  clearStateA();
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await waitFor("历史回答块", `document.querySelector(".agent-message")`);
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await clickNext();
  await waitPage(2, 3);
  await clickNext();
  await waitPage(3, 3);
  await moveMouse(".agent-message", -1, ".answer-save-wrap");
  const title33 = await titleOfLastAnswer();
  const callsBase33 = (await notesAddCalls()).count;
  await clickLast(".answer-save-btn");
  await waitFor("回退保存反馈", `document.querySelector('.answer-note-feedback[data-state="ok"]')`);
  await capturePage(win, "33-answer-history-fallback.png");
  const calls33 = await notesAddCalls();
  const payload33 = calls33.payloads.slice(-1)[0];
  const inFile33 = readNotes().some((note) => note.docPath === "sample-paper.pdf" && note.page === 3 && note.kind === "answer");
  record("answer-save", { phase: "fallback", title: title33 }, [
    ...(title33 && title33.includes("（按当前阅读位置）") && title33.includes("sample-paper.pdf") && title33.includes("第 3 页")
      ? []
      : [`回退提示异常：${title33}`]),
  ]);
  record(
    "answer-anchor",
    { phase: "fallback-payload", delta: calls33.count - callsBase33, lastPayload: payload33, inFile: inFile33 },
    [
      ...(payload33 && payload33.page === 3 ? [] : [`回退目标页码异常：${JSON.stringify(payload33)}`]),
      ...(inFile33 ? [] : ["fixture 内缺少第 3 页的 answer 条目"]),
    ],
  );

  // --- 34 情形 (c)：无锚点且未打开文档 → 禁用 -----------------------------------
  log("34 情形 (c)：无锚点 + 无打开文档 → 按钮禁用，点击不产生 IPC");
  await goHome();
  await enterWorkspace(LIBRARY_NAME);
  await waitFor("历史回答块", `document.querySelector(".agent-message")`);
  await moveMouse(".agent-message", -1, ".answer-save-wrap");
  const disabled34 = await js(`(() => {
    const blocks = Array.from(document.querySelectorAll(".agent-message"));
    const block = blocks[blocks.length - 1];
    const btn = block ? block.querySelector(".answer-save-btn") : null;
    const wrap = block ? block.querySelector(".answer-save-wrap") : null;
    return { disabled: btn ? btn.disabled : null, title: wrap ? wrap.getAttribute("title") : null };
  })()`);
  const callsBase34 = (await notesAddCalls()).count;
  await js(`document.querySelector(".answer-save-btn").click(), true`);
  await sleep(300);
  await capturePage(win, "34-answer-save-disabled.png");
  record(
    "answer-save",
    { phase: "disabled", ...disabled34, deltaAfterClick: (await notesAddCalls()).count - callsBase34 },
    [
      ...(disabled34.disabled === true ? [] : ["无目标时按钮应禁用"]),
      ...(disabled34.title && disabled34.title.includes("无法存为笔记") && disabled34.title.includes("当前没有打开文档")
        ? []
        : [`不可用提示异常：${disabled34.title}`]),
      ...((await notesAddCalls()).count - callsBase34 === 0 ? [] : ["禁用按钮点击不应产生 IPC"]),
    ],
  );

  // --- 35 锚点不跨轮：确认不匹配 → 无锚点（不许回溯上一轮）----------------------
  log("35 锚点不跨轮：确认不匹配 ⇒ 回答块显示「按当前阅读位置」的第 2 页");
  await js("window.__pixStub.setMessages([]), true");
  await goHome();
  clearStateA();
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  const userBase35 = await userBlocks();
  const TURN35A = "第一次提问";
  const TURN35B = "第二次提问";
  await typeAndSend(TURN35A);
  await runTurn(TURN35A, "第一轮回答");
  await sleep(200);
  // 第二轮故意让确认文本与乐观文本不同 ⇒ 追加一条无锚点用户块
  const confirmed35B = `<reading_context>\npath: ${join(LIBRARY_DIR, "sample-paper.pdf")}\npage: 1\npageCount: 3\n</reading_context>\n\n${TURN35B}`;
  await typeAndSend(TURN35B);
  await runTurn(TURN35B, "第二轮回答", confirmed35B);
  await sleep(200);
  await clickNext();
  await waitPage(2, 3);
  await sleep(200);
  const title35 = await titleOfLastAnswer();
  const users35 = await userBlocks();
  await capturePage(win, "35-answer-anchor-strict.png");
  record("answer-save", { phase: "strict", title: title35, base: userBase35, userBlocks: users35 }, [
    ...(title35 && title35.includes("（按当前阅读位置）") && title35.includes("第 2 页")
      ? []
      : [`应回退到当前阅读位置：${title35}`]),
    ...(title35 && !title35.includes("第 1 页") ? [] : [`不应回落到上一轮锚点：${title35}`]),
    ...(users35 === userBase35 + 3 ? [] : [`用户块应为基线 + 3：${userBase35} → ${users35}`]),
  ]);

  // --- 36 失败注入（三种 error state）+ 锚点文档已删除仍成功 --------------------
  log("36 失败注入：outside / corrupt / throw 三态与原位回位");
  await moveMouse(".agent-message", -1, ".answer-save-wrap");
  const target36 = await titleOfLastAnswer();
  if (!(target36 && target36.includes("（按当前阅读位置）") && target36.includes("第 2 页"))) {
    throw new Error(`36 的靶子不是 35 的第二轮回答块（无锚点 + 第 2 页）：${target36}`);
  }
  const hash36 = notesHash();
  const callsBase36 = (await notesAddCalls()).count;
  await js('window.__pixStub.setNotesAddFailure("outside"), true');
  await clickLast(".answer-save-btn");
  await waitFor("outside 反馈", `document.querySelector('.answer-note-feedback[data-state="error"]')`);
  const outside36 = await feedbackOfLast();
  await capturePage(win, "36-answer-save-failure.png");
  record(
    "answer-feedback",
    {
      phase: "outside",
      state: outside36 ? outside36.state : null,
      text: outside36 ? outside36.text : null,
      callsDelta: (await notesAddCalls()).count - callsBase36,
      bytesUnchanged: notesHash() === hash36,
    },
    [
      ...(outside36 && outside36.text === "保存失败：该文档不在当前资料库内"
        ? []
        : [`outside 反馈异常：${JSON.stringify(outside36)}`]),
      ...(notesHash() === hash36 ? [] : ["outside 不应写盘"]),
      ...((await notesAddCalls()).count - callsBase36 === 1 ? [] : ["outside 应恰好 1 次 IPC"]),
    ],
  );
  await waitFeedbackGone();
  await js('window.__pixStub.setNotesAddFailure("corrupt"), true');
  await clickLast(".answer-save-btn");
  await waitFor("corrupt 反馈", `document.querySelector('.answer-note-feedback[data-state="error"]')`);
  const corrupt36 = await feedbackOfLast();
  record("answer-feedback", { phase: "corrupt", state: corrupt36 ? corrupt36.state : null, text: corrupt36 ? corrupt36.text : null }, [
    ...(corrupt36 && corrupt36.text === "保存失败：笔记文件无法读取（文件已损坏，未被修改）"
      ? []
      : [`corrupt 反馈异常：${JSON.stringify(corrupt36)}`]),
  ]);
  await waitFeedbackGone();
  await js('window.__pixStub.setNotesAddFailure("throw"), true');
  await clickLast(".answer-save-btn");
  await waitFor("throw 反馈", `document.querySelector('.answer-note-feedback[data-state="error"]')`);
  const throw36 = await feedbackOfLast();
  record("answer-feedback", { phase: "throw", state: throw36 ? throw36.state : null, text: throw36 ? throw36.text : null }, [
    ...(throw36 && throw36.text && throw36.text.startsWith("保存失败：主进程调用异常：")
      ? []
      : [`throw 反馈异常：${JSON.stringify(throw36)}`]),
  ]);
  await waitFeedbackGone();
  await js("window.__pixStub.setNotesAddFailure(null), true");
  await clickLast(".answer-save-btn");
  await waitFor("恢复后的成功反馈", `document.querySelector('.answer-note-feedback[data-state="ok"]')`);
  const recovered36 = await feedbackOfLast();
  record("answer-feedback", { phase: "recovered", state: recovered36 ? recovered36.state : null, text: recovered36 ? recovered36.text : null }, [
    ...(recovered36 && recovered36.text && recovered36.text.includes("已存为笔记") ? [] : ["失败后按钮应回到可点"]) ,
  ]);
  // 末段：锚点文档已被删除但仍在资料库路径内 ⇒ 保存成功（§5 第 3 行；该文件最后一次使用）
  await waitFeedbackGone();
  await openRow("older-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 2);
  await typeAndSend("第三次提问");
  await runTurn("第三次提问", "第三轮回答");
  await waitFor("第三轮回答块", `document.querySelectorAll(".agent-message").length >= 3`);
  await sleep(200);
  rmSync(join(LIBRARY_DIR, "archive", "older-paper.pdf"), { force: true });
  await moveMouse(".agent-message", -1, ".answer-save-wrap");
  await clickLast(".answer-save-btn");
  await waitFor("删除文档后的成功反馈", `document.querySelector('.answer-note-feedback[data-state="ok"]')`);
  const deletedDoc36 = await feedbackOfLast();
  const inFile36 = readNotes().some((note) => note.docPath === "archive/older-paper.pdf" && note.page === 1 && note.text === "第三轮回答");
  record(
    "answer-feedback",
    { phase: "deleted-doc", state: deletedDoc36 ? deletedDoc36.state : null, text: deletedDoc36 ? deletedDoc36.text : null, inFile: inFile36 },
    [
      ...(deletedDoc36 && deletedDoc36.text && deletedDoc36.text.includes("已存为笔记") ? [] : ["文件被删除不影响入库（前缀归属校验）"]),
      ...(inFile36 ? [] : ["fixture 内缺少第三轮的 answer 条目"]),
    ],
  );

  // -------------------------------------------------------------------------
  // 场景 40–46：笔记作为对话上下文（R8 / N43–N50）
  //
  // 挂载位置：本函数末尾（R7 场景 36 之后）。36 末段已 rmSync(archive/older-paper.pdf)
  // ⇒ 40–46 一律不打开该文件，它只经 seedNotes 出现在笔记清单里（场景 43 的跨文档条目）。
  // 数据准备一律「seedNotes 写穿 + 切标签触发 loadNotes」，不新增刷新入口；
  // 每个场景先切标签再选（切标签会按生命周期清空选择集）。
  // -------------------------------------------------------------------------

  const sendCalls = () => js("window.__pixStub.sendCalls()");
  const clearSendCalls = () => js("window.__pixStub.clearSendCalls(), true");
  const setSendFailure = (mode) => js(`window.__pixStub.setSendFailure(${JSON.stringify(mode)}), true`);
  const setNotesDeleteFailure = (code) => js(`window.__pixStub.setNotesDeleteFailure(${JSON.stringify(code)}), true`);
  const emitUserInputRequest = (request) =>
    js(`window.__pixStub.emitUserInputRequest(${JSON.stringify(request)}), true`);
  const lastSend = async () => (await sendCalls()).payloads.slice(-1)[0] ?? null;
  /** 最后一个错误块的正文（发送失败两种模式共用）。 */
  const lastErrorText = () => js(`(() => {
    const nodes = Array.from(document.querySelectorAll(".error-block .error-message"));
    const el = nodes[nodes.length - 1];
    return el ? el.textContent.replace(/\\s+/g, " ").trim() : null;
  })()`);
  const waitSendCalls = (count) => waitFor(`sendCalls ≥ ${count}`, `window.__pixStub.sendCalls().count >= ${count}`);
  const missingLines = (text, needles) => needles.filter((needle) => text.indexOf(needle) < 0);

  /** 行内控件点击：按 .note-text 子串定位行（跨组可用），再点行内选择器。 */
  const clickInRow = (needle, selector) => js(`(() => {
    const row = ${rowFinder(needle, false)};
    if (!row) throw new Error("note row not found: " + ${JSON.stringify(needle)});
    const target = row.querySelector(${JSON.stringify(selector)});
    if (!target) throw new Error("row control not found: " + ${JSON.stringify(selector)});
    target.click();
    return true;
  })()`);

  /** 选择条 / 行态 / 两个追问入口的快照（选择器均为设计档 §1.5 冻结值）。 */
  const selectionSnapshot = () => js(`(() => {
    const text = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
    const bar = document.querySelector(".notes-selection-bar");
    const header = document.querySelector(".notes-header");
    const filter = document.querySelector(".notes-filter");
    const ask = bar ? bar.querySelector(".notes-ask-btn") : null;
    const askWrap = bar ? bar.querySelector(".notes-ask-btn-wrap") : null;
    const clear = bar ? bar.querySelector(".notes-selection-clear") : null;
    const rowAsk = document.querySelector(".note-row .note-ask");
    const rowAskWrap = document.querySelector(".note-row .note-ask-wrap");
    const rowSelect = document.querySelector(".note-row .note-select");
    const rowSelectWrap = document.querySelector(".note-row .note-select-wrap");
    return {
      barCount: document.querySelectorAll(".notes-selection-bar").length,
      countText: text(bar ? bar.querySelector(".notes-selection-count") : null),
      askText: text(ask),
      askDisabled: ask ? ask.disabled : null,
      askWrapTitle: askWrap ? askWrap.getAttribute("title") : null,
      clearText: text(clear),
      clearDisabled: clear ? clear.disabled : null,
      rowAskDisabled: rowAsk ? rowAsk.disabled : null,
      rowAskWrapTitle: rowAskWrap ? rowAskWrap.getAttribute("title") : null,
      rowSelectDisabled: rowSelect ? rowSelect.disabled : null,
      rowSelectWrapTitle: rowSelectWrap ? rowSelectWrap.getAttribute("title") : null,
      barInHeader: !!bar && !!header && header.contains(bar),
      barAfterFilter: !!bar && !!filter && (filter.compareDocumentPosition(bar) & 4) === 4,
      selectedRows: document.querySelectorAll(".note-row.selected").length,
    };
  })()`);

  /** chip 行快照：labels / 摘录 chip 的 label 与 title / 首个移除按钮的 title。 */
  const chipSnapshot = () => js(`(() => {
    const labelOf = (el) => {
      const label = el.querySelector(".context-chip-label");
      return label ? label.textContent.replace(/\\s+/g, " ").trim() : null;
    };
    const chips = Array.from(document.querySelectorAll(".context-chip"));
    const notes = chips.find((el) => {
      const value = labelOf(el);
      return !!value && value.indexOf("摘录") === 0;
    });
    const remove = chips.length ? chips[0].querySelector(".context-chip-remove") : null;
    return {
      count: chips.length,
      labels: chips.map(labelOf),
      notesLabel: notes ? labelOf(notes) : null,
      notesTitle: notes ? notes.getAttribute("title") : null,
      removeTitle: remove ? remove.getAttribute("title") : null,
    };
  })()`);

  /** composer / 选择条计数 / 提示行的联读（追问场景共用）。 */
  const composerSnapshot = () => js(`(() => {
    const input = document.querySelector(".input-area");
    const bar = document.querySelector(".notes-selection-bar");
    const count = bar ? bar.querySelector(".notes-selection-count") : null;
    const chip = Array.from(document.querySelectorAll(".context-chip-label")).find((el) => (el.textContent || "").indexOf("摘录") === 0);
    const notice = document.querySelector(".notes-ask-notice");
    return {
      value: input ? input.value : null,
      activeHasInputArea: document.activeElement === input,
      countText: count ? count.textContent.replace(/\\s+/g, " ").trim() : null,
      chip: chip ? chip.textContent.replace(/\\s+/g, " ").trim() : null,
      hasNotice: !!notice,
      noticeText: notice ? notice.textContent.replace(/\\s+/g, " ").trim() : null,
    };
  })()`);

  /** 阅读区联读：中间 pill 的文档名与页码徽标（点追问不得跳回原文）。 */
  const readerSnapshot = () => js(`(() => {
    const text = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
    return {
      pillLabel: text(document.querySelector(".center-pill .pill-label")),
      pageLabel: text(document.querySelector(".page-label")),
    };
  })()`);

  /** 条数上限样本：12 条同文档、page 唯一升序 ⇒ 面板行序 = 1..12，第 11 条恒为「容量样本 11」。 */
  const capSeed = () => {
    const now = Date.now();
    return Array.from({ length: 12 }, (_, index) => {
      const page = index + 1;
      return {
        id: "cap-" + page,
        kind: "excerpt",
        docPath: "sample-paper.pdf",
        page: page,
        text: "容量样本 " + page,
        comment: "",
        createdAt: now - (13 - page) * MINUTE,
      };
    });
  };

  /** 字符上限样本：骨架 ≈61 字符/条 ⇒ 2 条 ≤ 8000、3 条 > 8000 ⇒ 恰好丢 1 条。 */
  const overflowSeed = () => {
    const now = Date.now();
    return Array.from({ length: 3 }, (_, index) => {
      const page = index + 1;
      return {
        id: "big-" + page,
        kind: "excerpt",
        docPath: "sample-paper.pdf",
        page: page,
        text: "摘".repeat(3000),
        comment: "",
        createdAt: now - (4 - page) * MINUTE,
      };
    });
  };

  /** 40–46 共用入口序列：清会话与三个失败注入 → 回首页 → 清 A 现场 → 进工作区 → 写种子（停在资料库标签）。 */
  const enterCleanWorkspace = async (seed) => {
    await js("window.__pixStub.setMessages([]), true");
    await setSendFailure(null);
    await js("window.__pixStub.setNotesAddFailure(null), true");
    await setNotesDeleteFailure(null);
    await goHome();
    await clearStateA();
    await enterWorkspace(LIBRARY_NAME);
    await waitTreeRows(4);
    await js(`window.__pixStub.seedNotes(${JSON.stringify(seed)}), true`);
  };

  /** 切到笔记标签并等行数就绪（每次切标签都会触发 loadNotes）。 */
  const openNotesPanel = async (rows) => {
    await js(`document.querySelector('.pill-tab[data-tab="notes"]').click(), true`);
    await waitFor("笔记列表就绪", `document.querySelectorAll(".note-row").length === ${rows}`);
  };

  /** 恢复标准种子（40c / 42b 末段）：写穿 + 切标签切回，行数回到 4。 */
  const restoreStandardSeed = async () => {
    await js(`window.__pixStub.seedNotes(${JSON.stringify(seedNotes())}), true`);
    await js(`document.querySelector('.pill-tab[data-tab="library"]').click(), true`);
    await openNotesPanel(4);
  };

  const T42 = "42：这条提问带上摘录。";
  const T42B = "42b：文档 chip 被移除后发送。";
  const T42C = "42c：清空选择后发送。";
  const T42D = "42d：无文档时发送。";
  const ASK43 = "请对比这两处的结论。";
  const ASK43_STEER = "43：steer 相位再补一句。";
  const ASK44 = "44：删除后按剩余选择注入。";
  const ASK45 = "45：发送注入异常。";
  const ASK45B = "45b：发送被拒绝。";
  const ASK45C = "45c：恢复后重发。";
  const T46A = "46A：第 2 页提问。";
  const T46B = "46B：第 3 页提问。";
  const T46C = "46C：失败一轮。";
  const T46D = "46D：回滚后重发。";

  // --- 40 选择条：点复选框本体与包裹元素各一次（不打开文档） ----------------------
  log("40 选择条：勾选两条（无文档 ⇒ 无摘录 chip）");
  await enterCleanWorkspace(seedNotes());
  await openNotesPanel(4);
  const base40 = { addCalls: (await notesAddCalls()).count, hash: notesHash() };
  // must-fix 3 判别：点 .note-select 本体（本体 0 处 @click，靠冒泡命中包裹元素的唯一处理器）
  await js(`(() => {
    const input = document.querySelectorAll(".note-row")[0].querySelector(".note-select");
    if (!input) throw new Error("note-select not found");
    input.click();
    return true;
  })()`);
  const nativeCheck40 = await js(`(() => {
    const input = document.querySelectorAll(".note-row")[0].querySelector(".note-select");
    const bar = document.querySelector(".notes-selection-bar");
    const count = bar ? bar.querySelector(".notes-selection-count") : null;
    return {
      countText: count ? count.textContent.replace(/\\s+/g, " ").trim() : null,
      checked: input ? input.checked : null,
    };
  })()`);
  await js(`(() => {
    const wrap = document.querySelectorAll(".note-row")[1].querySelector(".note-select-wrap");
    if (!wrap) throw new Error("note-select-wrap not found");
    wrap.click();
    return true;
  })()`);
  const bar40 = await selectionSnapshot();
  const chips40 = await chipSnapshot();
  const noWrite40 = {
    addCallsSame: (await notesAddCalls()).count === base40.addCalls,
    hashSame: notesHash() === base40.hash,
  };
  await capturePage(win, "40-notes-select-bar.png");
  const leftPane40 = await rectOfSelector(".layout-left", 2);
  if (leftPane40) await capturePage(win, "40-notes-select-bar-left-pane.png", leftPane40);
  record(
    "notes-select",
    {
      phase: "bar",
      nativeCheck: nativeCheck40,
      countText: bar40.countText,
      askText: bar40.askText,
      clearText: bar40.clearText,
      selectedRows: bar40.selectedRows,
      chipCount: chips40.count,
      hasNotesChip: chips40.notesLabel !== null,
      barInHeader: bar40.barInHeader,
      barAfterFilter: bar40.barAfterFilter,
      noWrite: noWrite40,
    },
    [
      ...(nativeCheck40.countText === "已选 1 条" && nativeCheck40.checked === true
        ? []
        : [`点复选框本体应恰好选中 1 条：${JSON.stringify(nativeCheck40)}`]),
      ...(bar40.countText === "已选 2 条" ? [] : [`计数异常：${bar40.countText}`]),
      ...(bar40.askText === "问 AI" ? [] : [`「问 AI」文案异常：${bar40.askText}`]),
      ...(bar40.clearText === "清空" ? [] : [`「清空」文案异常：${bar40.clearText}`]),
      ...(bar40.selectedRows === 2 ? [] : [`选中行数异常：${bar40.selectedRows}`]),
      ...(chips40.count === 0 ? [] : [`无文档时不应有 chip：${JSON.stringify(chips40.labels)}`]),
      ...(chips40.notesLabel === null ? [] : [`无文档时不应有摘录 chip：${chips40.notesLabel}`]),
      ...(bar40.barInHeader ? [] : ["选择条不在 .notes-header 内"]),
      ...(bar40.barAfterFilter ? [] : ["选择条未渲染在 .notes-filter 之后"]),
      ...(noWrite40.addCallsSame && noWrite40.hashSame ? [] : ["选择不得写盘"]),
    ],
  );

  // --- 40b 清空选择条 ---------------------------------------------------------
  log("40b 清空：选择条 / 行态 / chip 一起归零");
  await js(`document.querySelector(".notes-selection-clear").click(), true`);
  const cleared40 = await selectionSnapshot();
  const chips40b = await chipSnapshot();
  await capturePage(win, "40b-notes-select-clear.png");
  record(
    "notes-select",
    {
      phase: "cleared",
      barCount: cleared40.barCount,
      selectedRows: cleared40.selectedRows,
      notesChipCount: chips40b.count,
      noWrite: {
        addCallsSame: (await notesAddCalls()).count === base40.addCalls,
        hashSame: notesHash() === base40.hash,
      },
    },
    [
      ...(cleared40.barCount === 0 ? [] : [`清空后不应渲染选择条：${JSON.stringify(cleared40)}`]),
      ...(cleared40.selectedRows === 0 ? [] : [`清空后不应有选中行：${cleared40.selectedRows}`]),
      ...(chips40b.count === 0 ? [] : [`清空后不应有 chip：${chips40b.count}`]),
    ],
  );

  // --- 40c 条数上限：第 11 条不可选（同文档 page 1..12 升序，文本定位不依赖索引） -----
  log("40c 条数上限：第 11 条禁用 + 上限 title + 取消后可再选");
  await enterCleanWorkspace(capSeed());
  await openNotesPanel(12);
  await js(`(() => {
    const rows = Array.from(document.querySelectorAll(".note-row"));
    if (rows.length < 10) throw new Error("cap 样本不足 10 行");
    for (let index = 0; index < 10; index += 1) {
      const wrap = rows[index].querySelector(".note-select-wrap");
      if (!wrap) throw new Error("note-select-wrap not found");
      wrap.click();
    }
    return true;
  })()`);
  await waitFor("计数到 10", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.indexOf("已选 10 条") >= 0; })()`);
  const cap10 = await selectionSnapshot();
  const capRow11 = await js(`(() => {
    const row = ${rowFinder("容量样本 11", true)};
    if (!row) return null;
    const input = row.querySelector(".note-select");
    const wrap = row.querySelector(".note-select-wrap");
    return {
      disabled: input ? input.disabled : null,
      wrapTitle: wrap ? wrap.getAttribute("title") : null,
    };
  })()`);
  await clickInRow("容量样本 11", ".note-select-wrap");
  const afterCapClick = (await selectionSnapshot()).countText;
  await clickInRow("容量样本 1", ".note-select-wrap");
  await waitFor("计数回到 9", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.indexOf("已选 9 条") >= 0; })()`);
  const capRow11After = await js(`(() => {
    const row = ${rowFinder("容量样本 11", true)};
    if (!row) return null;
    const input = row.querySelector(".note-select");
    const wrap = row.querySelector(".note-select-wrap");
    return {
      disabled: input ? input.disabled : null,
      wrapTitle: wrap ? wrap.getAttribute("title") : null,
    };
  })()`);
  await capturePage(win, "40c-notes-select-cap.png");
  const leftPane40c = await rectOfSelector(".layout-left", 2);
  if (leftPane40c) await capturePage(win, "40c-notes-select-cap-left-pane.png", leftPane40c);
  await restoreStandardSeed();
  const restoredRows40c = await countOf(".note-row");
  record(
    "notes-select",
    {
      phase: "cap",
      countText: cap10.countText,
      selectedRows: cap10.selectedRows,
      row11: capRow11,
      afterCapClick,
      afterUncheck: capRow11After,
      restoredRows: restoredRows40c,
    },
    [
      ...(cap10.countText === "已选 10 条" ? [] : [`上限计数异常：${cap10.countText}`]),
      ...(cap10.selectedRows === 10 ? [] : [`上限选中行数异常：${cap10.selectedRows}`]),
      ...(capRow11 && capRow11.disabled === true ? [] : [`第 11 条应禁用：${JSON.stringify(capRow11)}`]),
      ...(capRow11 && capRow11.wrapTitle === "最多可注入 10 条笔记，请先取消其它选择"
        ? []
        : [`上限 title 异常：${JSON.stringify(capRow11)}`]),
      ...(afterCapClick === "已选 10 条" ? [] : [`第 11 条点击应零效果：${afterCapClick}`]),
      ...(capRow11After && capRow11After.disabled === false && capRow11After.wrapTitle === null
        ? []
        : [`取消一条后第 11 条应可用：${JSON.stringify(capRow11After)}`]),
      ...(restoredRows40c === 4 ? [] : [`恢复标准种子后行数异常：${restoredRows40c}`]),
    ],
  );

  // --- 41 行内追问：替换为 1 条 + 模板填入（另一篇文档的行不得跳回原文） ----------
  log("41 行内追问：n-other-1 的 .note-ask ⇒ 模板填入且阅读区不动");
  await enterCleanWorkspace(seedNotes());
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await openNotesPanel(4);
  await setDraft("");
  await clickInRow("Section 4. Reproducibility", ".note-ask");
  const ask41 = await composerSnapshot();
  const reader41 = await readerSnapshot();
  await capturePage(win, "41-note-ask.png");
  record(
    "note-ask",
    {
      phase: "template",
      value: ask41.value,
      activeHasInputArea: ask41.activeHasInputArea,
      chip: ask41.chip,
      pillLabel: reader41.pillLabel,
      pageLabel: reader41.pageLabel,
    },
    [
      ...(ask41.value === "请结合我选中的摘录回答：" ? [] : [`模板文案异常：${JSON.stringify(ask41.value)}`]),
      ...(ask41.activeHasInputArea ? [] : ["追问后焦点应在 .input-area"]),
      ...(ask41.chip === "摘录 1 条" ? [] : [`摘录 chip 异常：${ask41.chip}`]),
      ...(reader41.pillLabel === "sample-paper.pdf" ? [] : [`点追问不得换文档：${reader41.pillLabel}`]),
      ...(reader41.pageLabel === "第 1 / 3 页" ? [] : [`点追问不得跳页：${reader41.pageLabel}`]),
    ],
  );

  // --- 41b 草稿非空：替换为 1 条 + 草稿保留 + 提示行 -----------------------------
  log("41b 草稿非空：先选 2 条再点第 3 行的追问 ⇒ 已选 1 条 + 草稿一字不改");
  await setDraft("我的草稿");
  await clickInRow("attention budget is the binding constraint", ".note-select-wrap");
  await waitFor("计数到 2", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.indexOf("已选 2 条") >= 0; })()`);
  await clickInRow("结论：稀疏注意力", ".note-ask");
  const keep41b = await composerSnapshot();
  await capturePage(win, "41b-note-ask-keep-draft.png");
  await sleep(2600);
  const noticeGone41b = await js(`!document.querySelector(".notes-ask-notice")`);
  record(
    "note-ask",
    {
      phase: "keep-draft",
      value: keep41b.value,
      countText: keep41b.countText,
      chip: keep41b.chip,
      noticeText: keep41b.noticeText,
      noticeGone: noticeGone41b,
    },
    [
      ...(keep41b.value === "我的草稿" ? [] : [`草稿必须一字不改：${JSON.stringify(keep41b.value)}`]),
      ...(keep41b.countText === "已选 1 条" ? [] : [`替换语义异常（应替换不追加）：${keep41b.countText}`]),
      ...(keep41b.chip === "摘录 1 条" ? [] : [`chip 未同步替换：${keep41b.chip}`]),
      ...(keep41b.noticeText === "已加入 1 条摘录，草稿已保留" ? [] : [`提示行异常：${JSON.stringify(keep41b.noticeText)}`]),
      ...(noticeGone41b ? [] : ["提示行应在 2500ms 后消失"]),
    ],
  );

  // --- 41c 澄清待答：两个入口都禁用（含选择条入口） -----------------------------
  log("41c 澄清待答：两个追问入口禁用 + 点击零副作用 + 复位后恢复");
  await js(`document.querySelector(".notes-selection-clear").click(), true`);
  await clickInRow("attention budget is the binding constraint", ".note-select-wrap");
  await clickInRow("Table 2 reports", ".note-select-wrap");
  await waitFor("计数到 2", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.indexOf("已选 2 条") >= 0; })()`);
  await setDraft("我的草稿");
  await emitUserInputRequest({ id: "clarify-1", questions: [{ id: "q1", header: "澄清", question: "请选择方向" }] });
  await waitFor("澄清卡片", `document.querySelector(".clarification-card")`);
  const clarifying41c = await selectionSnapshot();
  await js(`(() => {
    const ask = document.querySelector(".note-row .note-ask");
    if (!ask) throw new Error("note-ask not found");
    ask.click();
    return true;
  })()`);
  const afterClick41c = await composerSnapshot();
  await capturePage(win, "41c-note-ask-clarifying.png");
  await emitUserInputRequest(null);
  await waitFor("澄清卡片消失", `!document.querySelector(".clarification-card")`);
  const reenabled41c = await selectionSnapshot();
  record(
    "note-ask",
    {
      phase: "clarifying",
      noteAsk: { disabled: clarifying41c.rowAskDisabled, wrapTitle: clarifying41c.rowAskWrapTitle },
      barAsk: { disabled: clarifying41c.askDisabled, wrapTitle: clarifying41c.askWrapTitle },
      clearDisabled: clarifying41c.clearDisabled,
      afterClick: { value: afterClick41c.value, countText: afterClick41c.countText, hasNotice: afterClick41c.hasNotice },
      reenabled: { noteAskDisabled: reenabled41c.rowAskDisabled },
    },
    [
      ...(clarifying41c.rowAskDisabled === true && clarifying41c.rowAskWrapTitle === "等待澄清回答时无法发起追问"
        ? []
        : [`行内入口禁用态异常：${JSON.stringify(clarifying41c.rowAskDisabled)} / ${JSON.stringify(clarifying41c.rowAskWrapTitle)}`]),
      ...(clarifying41c.askDisabled === true && clarifying41c.askWrapTitle === "等待澄清回答时无法发起追问"
        ? []
        : [`选择条入口禁用态异常：${JSON.stringify(clarifying41c.askDisabled)} / ${JSON.stringify(clarifying41c.askWrapTitle)}`]),
      ...(clarifying41c.clearDisabled === false ? [] : ["清空不受 clarifying 影响"]),
      ...(afterClick41c.value === "我的草稿" ? [] : [`禁用态点击不得改草稿：${JSON.stringify(afterClick41c.value)}`]),
      ...(afterClick41c.countText === "已选 2 条" ? [] : [`禁用态点击不得改选择集：${afterClick41c.countText}`]),
      ...(afterClick41c.hasNotice === false ? [] : ["禁用态点击不得出提示行"]),
      ...(reenabled41c.rowAskDisabled === false ? [] : ["澄清复位后入口应恢复可用"]),
    ],
  );

  // --- 41d 选择条「问 AI」：原样使用当前选择集 -------------------------------
  log("41d 选择条入口：空草稿 ⇒ 模板填入且选择集保持 2 条");
  await setDraft("");
  await js(`(() => {
    const ask = document.querySelector(".notes-ask-btn");
    if (!ask) throw new Error("notes-ask-btn not found");
    ask.click();
    return true;
  })()`);
  const barAsk41d = await composerSnapshot();
  await capturePage(win, "41d-note-ask-bar.png");
  record(
    "note-ask",
    {
      phase: "bar-ask",
      value: barAsk41d.value,
      activeHasInputArea: barAsk41d.activeHasInputArea,
      countText: barAsk41d.countText,
      chip: barAsk41d.chip,
    },
    [
      ...(barAsk41d.value === "请结合我选中的摘录回答：" ? [] : [`模板文案异常：${JSON.stringify(barAsk41d.value)}`]),
      ...(barAsk41d.activeHasInputArea ? [] : ["追问后焦点应在 .input-area"]),
      ...(barAsk41d.countText === "已选 2 条" ? [] : [`选择条入口路径选择集异常：${barAsk41d.countText}`]),
      ...(barAsk41d.chip === "摘录 2 条" ? [] : [`chip 未同步：${barAsk41d.chip}`]),
    ],
  );

  // --- 42 摘录 chip：与文档 chip 并排 + title 写明注入条数 ------------------------
  log("42 摘录 chip：已选 2 条 ⇒ chip 文案与 title");
  await enterCleanWorkspace(seedNotes());
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await openNotesPanel(4);
  await clickInRow("attention budget is the binding constraint", ".note-select-wrap");
  await clickInRow("Table 2 reports", ".note-select-wrap");
  await waitFor("计数到 2", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.indexOf("已选 2 条") >= 0; })()`);
  const chips42 = await chipSnapshot();
  await capturePage(win, "42-notes-chip.png");
  const composer42 = await rectOfSelector(".composer", 2);
  if (composer42) await capturePage(win, "42-notes-chip-composer.png", composer42);
  record(
    "notes-chip",
    {
      phase: "basic",
      labels: chips42.labels,
      notesChipTitle: chips42.notesTitle,
      removeTitle: chips42.removeTitle,
    },
    [
      ...(JSON.stringify(chips42.labels) === JSON.stringify(["当前文档：sample-paper.pdf · 第 1 页", "摘录 2 条"])
        ? []
        : [`chip 行异常：${JSON.stringify(chips42.labels)}`]),
      ...(chips42.notesTitle === "本次注入 2 条笔记" ? [] : [`chip title 异常：${chips42.notesTitle}`]),
      ...(chips42.removeTitle === "本次发送不使用" ? [] : [`移除按钮 title 异常：${chips42.removeTitle}`]),
    ],
  );

  // --- 42b 字符上限：3 条 3000 字 ⇒ 恰好丢 1 条 ---------------------------------
  log("42b 字符上限：chip 写明丢弃条数（逐字比较）");
  await enterCleanWorkspace(overflowSeed());
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await openNotesPanel(3);
  await js(`(() => {
    const wraps = Array.from(document.querySelectorAll(".note-row .note-select-wrap"));
    if (wraps.length !== 3) throw new Error("overflow 样本应为 3 行");
    wraps.forEach((wrap) => wrap.click());
    return true;
  })()`);
  await waitFor("计数到 3", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.indexOf("已选 3 条") >= 0; })()`);
  const chips42b = await chipSnapshot();
  await capturePage(win, "42b-notes-chip-overflow.png");
  record(
    "notes-chip",
    { phase: "overflow", label: chips42b.notesLabel, title: chips42b.notesTitle },
    [
      ...(chips42b.notesLabel === "摘录 3 条 · 超出上限未注入 1 条" ? [] : [`溢出 label 异常：${chips42b.notesLabel}`]),
      ...(chips42b.notesTitle === "本次注入 2 条笔记；1 条因超过 8000 字符上限未注入"
        ? []
        : [`溢出 title 异常：${chips42b.notesTitle}`]),
    ],
  );
  await restoreStandardSeed();
  const restoredRows42b = await countOf(".note-row");
  record("notes-chip", { phase: "overflow-restored", rows: restoredRows42b }, [
    ...(restoredRows42b === 4 ? [] : [`恢复标准种子后行数异常：${restoredRows42b}`]),
  ]);

  // --- 42c chip 移除与级联（42b 的种子恢复会清空选择集，故此处重建「42 结束态」） ---
  log("42c 移除摘录 chip ⇒ 本次不注入；移除文档 chip ⇒ 摘录 chip 级联消失");
  await enterCleanWorkspace(seedNotes());
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await openNotesPanel(4);
  await clickInRow("attention budget is the binding constraint", ".note-select-wrap");
  await clickInRow("Table 2 reports", ".note-select-wrap");
  await waitFor("计数到 2", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.indexOf("已选 2 条") >= 0; })()`);
  await clearSendCalls();
  await js(`(() => {
    const chips = Array.from(document.querySelectorAll(".context-chip"));
    const notes = chips.find((el) => {
      const label = el.querySelector(".context-chip-label");
      return !!label && label.textContent.indexOf("摘录") === 0;
    });
    if (!notes) throw new Error("摘录 chip not found");
    notes.querySelector(".context-chip-remove").click();
    return true;
  })()`);
  const removed42c = await chipSnapshot();
  await typeAndSend(T42);
  await waitSendCalls(1);
  const payload42c = await lastSend();
  await capturePage(win, "42c-notes-chip-removed.png");
  const removedPayload = {
    hasReadingContext: payload42c.message.includes("<reading_context>"),
    hasReaderNotes: payload42c.message.includes("reader_notes:"),
    displayText: payload42c.displayText,
  };
  record("notes-chip", { phase: "removed", chips: removed42c.labels, payload: removedPayload }, [
    ...(JSON.stringify(removed42c.labels) === JSON.stringify(["当前文档：sample-paper.pdf · 第 1 页"])
      ? []
      : [`移除后 chip 行异常：${JSON.stringify(removed42c.labels)}`]),
    ...(removedPayload.hasReadingContext ? [] : ["移除摘录 chip 只应停用 reader_notes"]),
    ...(removedPayload.hasReaderNotes === false ? [] : ["本次发送不得注入 reader_notes"]),
    ...(removedPayload.displayText === T42 ? [] : [`气泡文案应逐字等于输入：${removedPayload.displayText}`]),
  ]);
  await waitFor("摘录 chip 恢复", `(() => {
    const chips = Array.from(document.querySelectorAll(".context-chip-label"));
    return chips.some((el) => el.textContent.replace(/\\s+/g, " ").trim() === "摘录 2 条");
  })()`);
  const restored42c = await chipSnapshot();
  record("notes-chip", { phase: "restored", chip: restored42c.notesLabel }, [
    ...(restored42c.notesLabel === "摘录 2 条" ? [] : [`发送后 chip 应恢复：${restored42c.notesLabel}`]),
  ]);
  await js(`(() => {
    const chips = Array.from(document.querySelectorAll(".context-chip"));
    const doc = chips.find((el) => {
      const label = el.querySelector(".context-chip-label");
      return !!label && label.textContent.indexOf("当前文档") === 0;
    });
    if (!doc) throw new Error("document chip not found");
    doc.querySelector(".context-chip-remove").click();
    return true;
  })()`);
  const cascade42c = await chipSnapshot();
  await typeAndSend(T42B);
  await waitSendCalls(2);
  const cascadePayload = await lastSend();
  record(
    "notes-chip",
    {
      phase: "doc-cascade",
      hasNotesChip: cascade42c.notesLabel !== null,
      chipCount: cascade42c.count,
      payload: {
        hasReadingContext: cascadePayload.message.includes("<reading_context>"),
        hasReaderNotes: cascadePayload.message.includes("reader_notes:"),
      },
    },
    [
      ...(cascade42c.notesLabel === null ? [] : [`文档 chip 被移除时摘录 chip 必须一起消失：${cascade42c.notesLabel}`]),
      ...(cascade42c.count === 0 ? [] : [`文档 chip 被移除后 chip 行应为空：${JSON.stringify(cascade42c.labels)}`]),
      ...(cascadePayload.message.includes("<reading_context>") === false ? [] : ["排除文档 chip 后不得发 <reading_context>"]),
    ],
  );
  await js(`document.querySelector(".notes-selection-clear").click(), true`);
  await typeAndSend(T42C);
  await waitSendCalls(3);
  const r7Payload = await lastSend();
  const r7Lines = r7Payload.message.split("\n");
  record(
    "notes-context",
    {
      phase: "r7-regression",
      lines: {
        "<reading_context>": r7Payload.message.includes("<reading_context>"),
        "page: 1": r7Payload.message.includes("page: 1"),
        "pageCount: 3": r7Payload.message.includes("pageCount: 3"),
        "</reading_context>": r7Payload.message.includes("</reading_context>"),
        pathSuffix: r7Lines.find((line) => line.indexOf("path: ") === 0) ? /sample-paper\.pdf$/.test(r7Lines.find((line) => line.indexOf("path: ") === 0)) : false,
        selectedTextLine: r7Payload.message.includes("selectedText:"),
      },
      hasReaderNotes: r7Payload.message.includes("reader_notes:"),
      displayText: r7Payload.displayText,
    },
    [
      ...(r7Payload.message.includes("<reading_context>") ? [] : ["清空选择后仍应输出 <reading_context>"]),
      ...(r7Payload.message.includes("page: 1") ? [] : ["页码行缺失"]),
      ...(r7Payload.message.includes("pageCount: 3") ? [] : ["总页数行缺失"]),
      ...(r7Payload.message.includes("</reading_context>") ? [] : ["收尾行缺失"]),
      ...(r7Lines.find((line) => line.indexOf("path: ") === 0) && /sample-paper\.pdf$/.test(r7Lines.find((line) => line.indexOf("path: ") === 0))
        ? []
        : [`path 行应为绝对路径且以文件名结尾：${r7Lines.find((line) => line.indexOf("path: ") === 0)}`]),
      ...(r7Payload.message.includes("selectedText:") === false ? [] : ["无选区时不应输出 selectedText: 行"]),
      ...(r7Payload.message.includes("reader_notes:") === false ? [] : ["清空选择后不应输出 reader_notes:"]),
      ...(r7Payload.displayText === T42C ? [] : [`气泡文案应逐字等于输入：${r7Payload.displayText}`]),
    ],
  );

  // --- 42d 无文档：两个追问入口禁用 + 不渲染摘录 chip + 载荷无 reading_context -----
  log("42d 无文档：入口禁用（可见反馈）而非静默空转");
  await enterCleanWorkspace(seedNotes());
  await openNotesPanel(4);
  await js(`(() => {
    const wraps = Array.from(document.querySelectorAll(".note-row .note-select-wrap")).slice(0, 2);
    wraps.forEach((wrap) => wrap.click());
    return true;
  })()`);
  await waitFor("计数到 2", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.indexOf("已选 2 条") >= 0; })()`);
  await setDraft("");
  const noDoc42d = await selectionSnapshot();
  await js(`document.querySelector(".notes-ask-btn").click(), true`);
  const afterClick42d = await composerSnapshot();
  const chips42d = await chipSnapshot();
  await capturePage(win, "42d-notes-chip-no-doc.png");
  record(
    "note-ask",
    {
      phase: "no-doc",
      barAsk: { disabled: noDoc42d.askDisabled, wrapTitle: noDoc42d.askWrapTitle },
      rowAsk: { disabled: noDoc42d.rowAskDisabled, wrapTitle: noDoc42d.rowAskWrapTitle },
      afterClick: { value: afterClick42d.value, countText: afterClick42d.countText, hasNotice: afterClick42d.hasNotice },
    },
    [
      ...(noDoc42d.askDisabled === true && noDoc42d.askWrapTitle === "请先打开文档，摘录才会随提问注入"
        ? []
        : [`选择条入口无文档态异常：${JSON.stringify(noDoc42d.askDisabled)} / ${JSON.stringify(noDoc42d.askWrapTitle)}`]),
      ...(noDoc42d.rowAskDisabled === true && noDoc42d.rowAskWrapTitle === "请先打开文档，摘录才会随提问注入"
        ? []
        : [`行内入口无文档态异常：${JSON.stringify(noDoc42d.rowAskDisabled)} / ${JSON.stringify(noDoc42d.rowAskWrapTitle)}`]),
      ...(afterClick42d.value === "" ? [] : [`禁用态点击不得改草稿：${JSON.stringify(afterClick42d.value)}`]),
      ...(afterClick42d.countText === "已选 2 条" ? [] : [`禁用态点击不得改选择集：${afterClick42d.countText}`]),
      ...(afterClick42d.hasNotice === false ? [] : ["禁用态点击不得出提示行"]),
    ],
  );
  record("notes-chip", { phase: "no-doc", chipCount: chips42d.count, hasNotesChip: chips42d.notesLabel !== null }, [
    ...(chips42d.count === 0 ? [] : [`无文档时 chip 行应为空：${JSON.stringify(chips42d.labels)}`]),
    ...(chips42d.notesLabel === null ? [] : [`无文档时不得渲染摘录 chip：${chips42d.notesLabel}`]),
  ]);
  await typeAndSend(T42D);
  await waitSendCalls(1);
  const noDocPayload = await lastSend();
  record(
    "notes-context",
    {
      phase: "no-doc",
      message: noDocPayload.message,
      hasReadingContext: noDocPayload.message.includes("<reading_context>"),
      hasReaderNotes: noDocPayload.message.includes("reader_notes:"),
    },
    [
      ...(noDocPayload.message === T42D ? [] : [`无文档时载荷应逐字等于输入：${noDocPayload.message}`]),
      ...(noDocPayload.message.includes("<reading_context>") === false ? [] : ["无文档时不得输出 <reading_context>"]),
    ],
  );

  // --- 43 注入载荷：跨文档两条 + 选区 + steer 相位 ------------------------------
  log("43 注入载荷：reader_notes 逐行字面量 + 顺序判据 + steer 相位");
  await enterCleanWorkspace(seedNotes());
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await clickNext();
  await waitPage(2, 3);
  // 选区必须晚于 textarea 写值：向聚焦中的 .input-area 写入值会把 document 选区收进输入框，
  // readerStore.selectedText 随之被 PdfViewer 的 selectionchange 清空（既有行为，R8 不改）。
  await setDraft(ASK43);
  await selectPageSpan(2);
  await openNotesPanel(4);
  await clickInRow("Section 4. Reproducibility", ".note-select-wrap");
  await clickInRow("attention budget is the binding constraint", ".note-select-wrap");
  await waitFor("计数到 2", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.indexOf("已选 2 条") >= 0; })()`);
  await clearSendCalls();
  await js(`document.querySelector(".composer-send").click(), true`);
  await waitSendCalls(1);
  const prompt43 = await lastSend();
  await capturePage(win, "43-notes-context-payload.png");
  const entryBlock43 = prompt43.message.slice(prompt43.message.indexOf("reader_notes:"));
  record(
    "notes-context",
    {
      phase: "prompt",
      missing: missingLines(prompt43.message, [
        "<reading_context>",
        "page: 2",
        "selectedText:",
        "reader_notes:",
        "1. doc: archive/older-paper.pdf",
        "   page: 7",
        "   kind: excerpt",
        "   text: Section 4. Reproducibility: all runs use three seeds and report the median.",
        "2. doc: sample-paper.pdf",
        "   page: 1",
        "   text: We study retrieval over long documents where the attention budget is the binding constraint.",
        "   comment: 与第 3 节消融实验对照",
      ]),
      orderOk: prompt43.message.indexOf("1. doc: archive/older-paper.pdf") < prompt43.message.indexOf("2. doc: sample-paper.pdf"),
      entryBlockNoBackslash: entryBlock43.indexOf("\\") < 0,
      entryBlockNoIds:
        entryBlock43.indexOf("n-other-1") < 0 &&
        entryBlock43.indexOf("n-current-1") < 0 &&
        entryBlock43.indexOf("createdAt") < 0 &&
        entryBlock43.indexOf("updatedAt") < 0,
      displayText: prompt43.displayText,
      endsWithUserText: prompt43.message.endsWith("\n\n" + ASK43),
    },
    [
      ...(missingLines(prompt43.message, ["<reading_context>", "page: 2", "selectedText:", "reader_notes:"]).length === 0
        ? []
        : [`载荷缺少骨架行：${missingLines(prompt43.message, ["<reading_context>", "page: 2", "selectedText:", "reader_notes:"]).join(" / ")}`]),
      ...(prompt43.message.indexOf("1. doc: archive/older-paper.pdf") < prompt43.message.indexOf("2. doc: sample-paper.pdf")
        ? []
        : "注入顺序应为 docPathKey 升序（archive 在前）"),
      ...(prompt43.message.includes("   page: 7") && prompt43.message.includes("   kind: excerpt")
        ? []
        : "条目字段行缺失或缩进异常"),
      ...(prompt43.message.includes("   text: Section 4. Reproducibility: all runs use three seeds and report the median.")
        ? []
        : "跨文档条目的 text 行异常"),
      ...(prompt43.message.includes("   comment: 与第 3 节消融实验对照") ? [] : "comment 行缺失"),
      ...(entryBlock43.indexOf("\\") < 0 ? [] : "条目块不得含反斜杠（绝对路径）"),
      ...(entryBlock43.indexOf("n-other-1") < 0 && entryBlock43.indexOf("n-current-1") < 0 ? [] : "条目块不得注入 id"),
      ...(prompt43.displayText === ASK43 ? [] : `气泡文案应逐字等于输入：${prompt43.displayText}`),
      ...(prompt43.message.endsWith("\n\n" + ASK43) ? [] : "载荷应以空行 + 用户输入收尾"),
    ],
  );
  await clearSendCalls();
  await emit({ type: "agent_start" });
  await sendViaEnter(ASK43_STEER);
  await waitSendCalls(1);
  const steer43 = await lastSend();
  await emit({ type: "agent_end", messages: [] });
  record(
    "notes-context",
    { phase: "steer", type: steer43.type, hasReaderNotes: steer43.message.includes("reader_notes:") },
    [
      ...(steer43.type === "steer" ? [] : [`流式中发送应走 steer：${steer43.type}`]),
      ...(steer43.message.includes("reader_notes:") ? [] : ["steer 载荷同样应注入 reader_notes"]),
    ],
  );

  // --- 44 删除已选笔记：收敛为 1 条 + 载荷同步 ---------------------------------
  log("44 删除已选笔记 ⇒ 计数 / chip / 载荷三处同步收敛");
  await enterCleanWorkspace(seedNotes());
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await openNotesPanel(4);
  await clickInRow("attention budget is the binding constraint", ".note-select-wrap");
  await clickInRow("Table 2 reports", ".note-select-wrap");
  await waitFor("计数到 2", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.indexOf("已选 2 条") >= 0; })()`);
  await clickInRow("Table 2 reports", ".note-delete");
  await waitFor("删除确认态", `(() => { const row = ${rowFinder("Table 2 reports", false)}; return !!row && row.classList.contains("confirming"); })()`);
  await clickInRow("Table 2 reports", ".note-delete");
  await waitFor("删除完成", `document.querySelectorAll(".note-row").length === 3`);
  const del44 = await selectionSnapshot();
  const chips44 = await chipSnapshot();
  await capturePage(win, "44-notes-select-delete.png");
  record(
    "notes-select",
    {
      phase: "delete-converge",
      countText: del44.countText,
      selectedRows: del44.selectedRows,
      chip: chips44.notesLabel,
      rows: await countOf(".note-row"),
    },
    [
      ...(del44.countText === "已选 1 条" ? [] : [`删除后计数应收敛：${del44.countText}`]),
      ...(del44.selectedRows === 1 ? [] : [`删除后选中行应剩 1：${del44.selectedRows}`]),
      ...(chips44.notesLabel === "摘录 1 条" ? [] : [`删除后 chip 应同步：${chips44.notesLabel}`]),
      ...((await countOf(".note-row")) === 3 ? [] : ["删除后应剩 3 行"]),
    ],
  );
  await clearSendCalls();
  await typeAndSend(ASK44);
  await waitSendCalls(1);
  const payload44 = await lastSend();
  const notesCount44 = (payload44.message.match(/^\d+\. doc: /gm) || []).length;
  record(
    "notes-context",
    {
      phase: "delete-converge",
      hasReaderNotes: payload44.message.includes("reader_notes:"),
      notesCount: notesCount44,
      excludesDeleted: payload44.message.includes("Table 2 reports") === false,
    },
    [
      ...(payload44.message.includes("reader_notes:") ? [] : ["删除后仍应注入剩下的条目"]),
      ...(notesCount44 === 1 ? [] : [`注入条数应与选择集一致：${notesCount44}`]),
      ...(payload44.message.includes("Table 2 reports") === false ? [] : ["被删条目不得出现在载荷里"]),
    ],
  );

  // --- 44b 删除失败：清单 / 选择集 / chip 都不动 + 文件哈希不变 --------------------
  log("44b 删除失败：错误通知 + 计数与 chip 原样");
  const hash44b = notesHash();
  await setNotesDeleteFailure("write-failed");
  await clickInRow("attention budget is the binding constraint", ".note-delete");
  await waitFor("删除确认态", `(() => { const row = ${rowFinder("attention budget is the binding constraint", false)}; return !!row && row.classList.contains("confirming"); })()`);
  await clickInRow("attention budget is the binding constraint", ".note-delete");
  await waitFor("删除失败通知", `document.querySelector(".notes-notice.is-error")`);
  const fail44b = await selectionSnapshot();
  const chips44b = await chipSnapshot();
  const notice44b = await textOf(".notes-notice.is-error");
  await capturePage(win, "44b-notes-select-delete-failure.png");
  await setNotesDeleteFailure(null);
  record(
    "notes-select",
    {
      phase: "delete-failure",
      notice: notice44b,
      countText: fail44b.countText,
      chip: chips44b.notesLabel,
      rows: await countOf(".note-row"),
      hashSame: notesHash() === hash44b,
    },
    [
      ...(notice44b === "删除失败：笔记写入失败" ? [] : [`失败通知异常：${JSON.stringify(notice44b)}`]),
      ...(fail44b.countText === "已选 1 条" ? [] : [`失败时计数不得变：${fail44b.countText}`]),
      ...(chips44b.notesLabel === "摘录 1 条" ? [] : [`失败时 chip 不得变：${chips44b.notesLabel}`]),
      ...((await countOf(".note-row")) === 3 ? [] : ["失败时行数不得变"]),
      ...(notesHash() === hash44b ? [] : ["失败时不得写盘"]),
    ],
  );

  // --- 45 发送失败：选择集与 chip 保留；恢复后重发仍注入 -------------------------
  log("45 发送失败（throw / fail）：选择集与 chip 保留，重发仍注入");
  await clickInRow("结论：稀疏注意力", ".note-select-wrap");
  await waitFor("计数到 2", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.indexOf("已选 2 条") >= 0; })()`);
  const base45 = await userBlocks();
  await setSendFailure("throw");
  await typeAndSend(ASK45);
  await waitFor("发送异常错误块", `document.querySelector(".error-block")`);
  const throw45 = await selectionSnapshot();
  const chips45 = await chipSnapshot();
  const throw45State = {
    errorText: await textOf(".error-block .error-message"),
    userBlocksRolledBack: (await userBlocks()) === base45,
    countText: throw45.countText,
    chip: chips45.notesLabel,
  };
  await capturePage(win, "45-notes-select-send-failure.png");
  record("notes-context", { phase: "send-failure", ...throw45State }, [
    ...(throw45State.errorText === "stub 发送注入异常" ? [] : [`IPC 异常文案异常：${JSON.stringify(throw45State.errorText)}`]),
    ...(throw45State.userBlocksRolledBack ? [] : ["失败后乐观用户块应回滚"]),
    ...(throw45State.countText === "已选 2 条" ? [] : [`失败时选择集不得变：${throw45State.countText}`]),
    ...(throw45State.chip === "摘录 2 条" ? [] : [`失败时 chip 不得变：${throw45State.chip}`]),
  ]);
  await setSendFailure("fail");
  await typeAndSend(ASK45B);
  await waitFor("第二次发送失败", `document.querySelectorAll(".error-block").length >= 2`);
  const reject45 = await lastErrorText();
  const chips45b = await chipSnapshot();
  record("notes-context", { phase: "send-reject", errorText: reject45, chip: chips45b.notesLabel }, [
    ...(reject45 === "stub 发送被拒绝" ? [] : [`success:false 文案异常：${JSON.stringify(reject45)}`]),
    ...(chips45b.notesLabel === "摘录 2 条" ? [] : [`拒绝时 chip 不得变：${chips45b.notesLabel}`]),
  ]);
  await setSendFailure(null);
  await clearSendCalls();
  await typeAndSend(ASK45C);
  await waitSendCalls(1);
  const resend45 = await lastSend();
  const notesCount45 = (resend45.message.match(/^\d+\. doc: /gm) || []).length;
  record(
    "notes-context",
    { phase: "resend", hasReaderNotes: resend45.message.includes("reader_notes:"), notesCount: notesCount45, type: resend45.type },
    [
      ...(resend45.message.includes("reader_notes:") ? [] : ["恢复后重发仍应注入"]),
      ...(notesCount45 === 2 ? [] : [`重发注入条数异常：${notesCount45}`]),
      ...(resend45.type === "prompt" ? [] : [`重发应走 prompt：${resend45.type}`]),
    ],
  );

  // --- 46 锚点缓存：两轮不同页 + 失败回滚后重发 --------------------------------
  log("46 锚点：第 2 页一轮 / 第 3 页一轮 / 回滚后重发");
  await enterCleanWorkspace(seedNotes());
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await clickNext();
  await waitPage(2, 3);
  await typeAndSend(T46A);
  await runTurn(T46A, "第 2 页回答");
  await waitFor("第 2 页回答块", `document.querySelectorAll(".agent-message").length >= 1`);
  await clickNext();
  await waitPage(3, 3);
  await typeAndSend(T46B);
  await runTurn(T46B, "第 3 页回答");
  await waitFor("第 3 页回答块", `document.querySelectorAll(".agent-message").length >= 2`);
  await sleep(200);
  const titles46 = [await answerTitleFromEnd(2), await answerTitleFromEnd(1)];
  await capturePage(win, "46-anchor-cache.png");
  record("anchor-cache", { phase: "two-turns", titles: titles46 }, [
    ...(titles46[0] && titles46[0].includes("第 2 页") ? [] : [`第 2 页回答锚点异常：${titles46[0]}`]),
    ...(titles46[1] && titles46[1].includes("第 3 页") ? [] : [`第 3 页回答锚点异常：${titles46[1]}`]),
    ...(titles46.every((title) => !!title && !title.includes("（按当前阅读位置）"))
      ? []
      : [`两轮锚点都不应回退：${JSON.stringify(titles46)}`]),
  ]);
  await setSendFailure("throw");
  await typeAndSend(T46C);
  await waitFor("失败错误块", `document.querySelector(".error-block")`);
  const rollback46 = await textOf(".error-block .error-message");
  await setSendFailure(null);
  await typeAndSend(T46D);
  await runTurn(T46D, "回滚后回答");
  await waitFor("回滚后回答块", `document.querySelectorAll(".agent-message").length >= 3`);
  await sleep(200);
  const lastTitle46 = await answerTitleFromEnd(1);
  record("anchor-cache", { phase: "rollback", errorText: rollback46, lastTitle: lastTitle46 }, [
    ...(rollback46 === "stub 发送注入异常" ? [] : [`回滚错误文案异常：${JSON.stringify(rollback46)}`]),
    ...(lastTitle46 && lastTitle46.includes("第 3 页") ? [] : [`回滚后重发的锚点应为第 3 页：${lastTitle46}`]),
    ...(lastTitle46 && !lastTitle46.includes("（按当前阅读位置）") ? [] : [`回滚后重发不得回退到当前阅读位置：${lastTitle46}`]),
  ]);

  // -------------------------------------------------------------------------
  // 场景 50-55：结构可见（R9 / N52-N62）
  //
  // 挂载位置：本函数末尾（R8 场景 46 之后）。36 末段 rmSync 了 archive/older-paper.pdf,
  // 50c/52g 需要该文件 ⇒ 本节开头按原字节重建（00-46 的断言已全部执行完毕）。
  // 入口序列与 R8 一致：goHome → clearStateA → enterWorkspace → 写种子（停在资料库标签）。
  // 页脚徽标 / 进度 / 已读全部来自 utils/outline-notes 的唯一派生；断言只引用声明表字面量。
  // -------------------------------------------------------------------------

  writeFileSync(join(LIBRARY_DIR, "archive", "older-paper.pdf"), buildPdf(OLDER_PAGES));

  const setLoadFailure = (code) => js(`window.__pixStub.setLoadFailure(${JSON.stringify(code)}), true`);
  const setLoadDelay = (ms) => js(`window.__pixStub.setLoadDelay(${ms}), true`);
  const setLibraryReadDelay = (ms) => js(`window.__pixStub.setLibraryReadDelay(${ms}), true`);
  const loadCalls = () => js("window.__pixStub.notesLoadCalls()");
  const fileHash = (file) => {
    try {
      return createHash("sha256").update(readFileSync(file)).digest("hex");
    } catch (err) {
      return null;
    }
  };
  const activeTab = () => js(`(() => {
    const el = document.querySelector(".pill-tab.active");
    return el ? el.getAttribute("data-tab") : null;
  })()`);
  const filterChecked = () => js(`(() => {
    const el = document.querySelector(${JSON.stringify(SEL.notesFilterInput)});
    return el ? el.checked : null;
  })()`);
  const groupPaths = () => js(`Array.from(document.querySelectorAll(".notes-group-head")).map((el) => el.getAttribute("title"))`);
  /** 过滤器开关：与既有场景同一落点（input 本体），再等状态生效。 */
  const toggleCurrentDocOnly = async (value) => {
    await js(`document.querySelector(${JSON.stringify(SEL.notesFilterInput)}).click(), true`);
    await waitFor(
      `仅看当前文档 ${value ? "ON" : "OFF"}`,
      `document.querySelector(${JSON.stringify(SEL.notesFilterInput)}).checked === ${value}`,
    );
  };
  /** 打开知识地图：只等槽位--无书签与加载窗口下只有 .map-empty,.map-row 结构性不存在。 */
  const openMap = async () => {
    await js(`document.querySelector(${JSON.stringify(SEL.mapToggle)}).click(), true`);
    await waitFor("知识地图槽位", `document.querySelector(${JSON.stringify(SEL.mapSlot)})`);
  };
  /** 地图行定位表达式：按 .label 逐字匹配（与声明表同源）。 */
  const mapRowExpr = (name) => `Array.from(document.querySelectorAll(".map-row")).find((row) => {
    const label = row.querySelector(".label");
    return !!label && label.textContent.trim() === ${JSON.stringify(name)};
  })`;
  /** 地图快照：行、页码徽标、笔记徽标与每行几何/状态（断言直接引用本结构字段）。 */
  const mapSnapshot = () => js(`(() => {
    const text = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
    const rows = Array.from(document.querySelectorAll(".map-row"));
    return {
      count: text(document.querySelector(".map-count")),
      rowCount: rows.length,
      pageBadges: Array.from(document.querySelectorAll(".map-row .page-badge")).map((el) => text(el)),
      progress: text(document.querySelector(".map-progress")),
      badgeCount: document.querySelectorAll(".note-count-badge").length,
      rows: rows.map((row) => {
        const page = row.querySelector(".page-badge");
        const node = row.querySelector(".map-node");
        const badge = row.querySelector(".note-count-badge");
        const pageStyle = page ? getComputedStyle(page) : null;
        const badgeStyle = badge ? getComputedStyle(badge) : null;
        return {
          label: text(row.querySelector(".label")),
          pageText: text(page),
          pageHeight: pageStyle ? pageStyle.height : null,
          pageFontSize: pageStyle ? pageStyle.fontSize : null,
          pageRadius: pageStyle ? pageStyle.borderTopLeftRadius : null,
          pageFits: page ? page.scrollWidth <= page.clientWidth : null,
          noteNum: text(row.querySelector(".note-count-num")),
          noteTitle: badge ? badge.getAttribute("title") : null,
          noteHeight: badgeStyle ? badgeStyle.height : null,
          noteFontSize: badgeStyle ? badgeStyle.fontSize : null,
          noteRadius: badgeStyle ? badgeStyle.borderTopLeftRadius : null,
          noteBorderWidth: badgeStyle ? badgeStyle.borderTopWidth : null,
          read: row.classList.contains("read"),
          current: row.classList.contains("current"),
          opacity: getComputedStyle(row).opacity,
          rowFits: row.scrollWidth <= row.clientWidth,
          nodeFits: node ? node.scrollWidth <= node.clientWidth : null,
          childCount: row.children.length,
        };
      }),
    };
  })()`);
  const mapRowSummary = (name) => js(`(() => {
    const row = ${mapRowExpr(name)};
    if (!row) return null;
    const text = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
    const badge = row.querySelector(".note-count-badge");
    return {
      label: text(row.querySelector(".label")),
      pageText: text(row.querySelector(".page-badge")),
      noteNum: text(row.querySelector(".note-count-num")),
      noteTitle: badge ? badge.getAttribute("title") : null,
      read: row.classList.contains("read"),
      current: row.classList.contains("current"),
      opacity: getComputedStyle(row).opacity,
      childCount: row.children.length,
    };
  })()`);
  const mapRowCount = (name) => js(`Array.from(document.querySelectorAll(".map-row")).filter((row) => {
    const label = row.querySelector(".label");
    return !!label && label.textContent.trim() === ${JSON.stringify(name)};
  }).length`);
  const badgePairs = () => js(`(() => {
    const text = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
    return Array.from(document.querySelectorAll(".map-row")).map((row) => {
      const badge = row.querySelector(".note-count-badge");
      return {
        label: text(row.querySelector(".label")),
        num: text(row.querySelector(".note-count-num")),
        title: badge ? badge.getAttribute("title") : null,
      };
    }).filter((row) => row.num !== null);
  })()`);
  const clickMapBadge = (name) => js(`(() => {
    const row = ${mapRowExpr(name)};
    if (!row) throw new Error("map row not found: " + ${JSON.stringify(name)});
    const badge = row.querySelector(".note-count-badge");
    if (!badge) throw new Error("note badge not found: " + ${JSON.stringify(name)});
    badge.click();
    return true;
  })()`);
  const clickMapNode = (name) => js(`(() => {
    const row = ${mapRowExpr(name)};
    if (!row) throw new Error("map row not found: " + ${JSON.stringify(name)});
    row.querySelector(".map-node").click();
    return true;
  })()`);
  const chapterFilterText = () => js(`(() => {
    const el = document.querySelector(${JSON.stringify(SEL.chapterFilter)});
    if (!el) return null;
    const label = el.querySelector(".notes-chapter-filter-text");
    return label ? label.textContent.replace(/\\s+/g, " ").trim() : null;
  })()`);
  const chapterFilterTitle = () => js(`(() => {
    const el = document.querySelector(${JSON.stringify(SEL.chapterFilter)});
    return el ? el.getAttribute("title") : null;
  })()`);
  /** 过滤条就绪：文本逐字相等 + 面板行数达标（切标签会触发 loadNotes，两者都要等）。 */
  const waitChapterFilter = (text, rows) =>
    waitFor(
      `章节过滤条「${text}」+ ${rows} 行`,
      `(() => {
        const el = document.querySelector(${JSON.stringify(SEL.chapterFilter)});
        if (!el) return false;
        const label = el.querySelector(".notes-chapter-filter-text");
        return !!label && label.textContent.replace(/\\s+/g, " ").trim() === ${JSON.stringify(text)}
          && document.querySelectorAll(".note-row").length === ${rows};
      })()`,
    );
  /** R9 场景入口：回首页 → 清 A 现场 → 进工作区（long-book 已入树 ⇒ 5 行）→ 写种子。 */
  const enterMapWorkspace = async (seed) => {
    await enterCleanWorkspace(seed);
    await waitTreeRows(5);
  };
  /** 打开 sample-paper.pdf（第 1 页）→ 切笔记标签（触发 loadNotes）→ 开地图并等 7 行。 */
  const enterSampleMap = async (rows = 4) => {
    await openRow("sample-paper.pdf");
    await waitPdfLoaded();
    await waitPage(1, 3);
    await js(`document.querySelector('.pill-tab[data-tab="notes"]').click(), true`);
    await waitFor("笔记列表就绪", `document.querySelectorAll(".note-row").length === ${rows}`);
    await openMap();
    await waitFor("地图行就绪", `document.querySelectorAll(".map-row").length === 7`);
  };
  const backToLibraryTab = async () => {
    await js(`document.querySelector(${JSON.stringify(SEL.tabLibrary)}).click(), true`);
    await waitFor("活动标签切到资料库", `document.querySelector(".pill-tab.active").getAttribute("data-tab") === "library"`);
  };
  const waitNotesTab = () =>
    waitFor("活动标签切到笔记", `document.querySelector(".pill-tab.active").getAttribute("data-tab") === "notes"`);
  const readCounts = (snap) => ({
    read: snap.rows.filter((row) => row.read).length,
    current: snap.rows.filter((row) => row.current).length,
    both: snap.rows.filter((row) => row.read && row.current).length,
  });
  /** 进度行与页码指示器联读：两处的 N / M 必须同源同值。 */
  const progressSnapshot = async () => {
    const progress = await textOf(SEL.mapProgress);
    const label = await pageLabel();
    const match = /第 (\d+) \/ (\d+) 页/.exec(label || "");
    return {
      progress,
      pageLabel: label,
      pagePair: match ? `第 ${match[1]} / ${match[2]} 页` : null,
      current: await countOf(".map-row.current"),
    };
  };
  /** 55 段场景局部种子：写穿同一 notes.json（标准种子由 restoreStandardSeed 复位）。 */
  const longBookSeed = () => {
    const now = Date.now();
    return [
      { id: "lb-1", kind: "excerpt", docPath: "long-book.pdf", page: 1, text: "长书夹具的摘录", comment: "", createdAt: now - 2 * MINUTE, updatedAt: now - 2 * MINUTE },
      { id: "lb-2", kind: "answer", docPath: "long-book.pdf", page: 58, text: "长书夹具的 AI 结论", comment: "", createdAt: now - MINUTE, updatedAt: now - MINUTE },
    ];
  };
  /** long-book 的朴素参照：按声明表（章节起页 = 1+3k，范围 = 起页..min（起页 + 2, 60））逐页扫描种子。 */
  const longBookExpected = (title) => {
    const seed = longBookSeed();
    const inRange = (start) => seed.filter((note) => note.page >= start && note.page <= Math.min(start + 2, 60)).length;
    const chapter = /^Chapter (\d+)$/.exec(title);
    if (chapter) return inRange(1 + 3 * (Number(chapter[1]) - 1));
    const section = /^Section (\d+)\.(\d+)$/.exec(title);
    if (section) return inRange(1 + 3 * (Number(section[1]) - 1));
    return null;
  };

  // --- 50a 有书签文档：节点数 / 可见行 / 页码徽标序列 / 跳页零回归 ---------------
  log("50a 地图结构：sample-paper.pdf 8 节点 / 7 可见行");
  await enterMapWorkspace(seedNotes());
  await enterSampleMap();
  await capturePage(win, "50-map-outline.png");
  const mapRect50 = await rectOfSelector(SEL.mapSlot, 2);
  if (mapRect50) await capturePage(win, "50b-map-outline-zoom.png", mapRect50);
  const snap50 = await mapSnapshot();
  const appendixA50 = await mapRowSummary("Appendix A");
  const appendixA1Rows50 = await mapRowCount("Appendix A.1");
  record(
    "map-outline",
    { phase: "sample", count: snap50.count, rows: snap50.rowCount, pageBadges: snap50.pageBadges, appendixA: appendixA50, appendixA1Rows: appendixA1Rows50 },
    [
      ...(snap50.count === String(SAMPLE_MAP_EXPECT.nodeCount) ? [] : [`节点数异常：${snap50.count}`]),
      ...(snap50.rowCount === SAMPLE_MAP_EXPECT.visibleRows ? [] : [`可见行异常：${snap50.rowCount}`]),
      ...(JSON.stringify(snap50.pageBadges) === JSON.stringify(SAMPLE_MAP_EXPECT.badgeTexts)
        ? []
        : [`页码徽标序列异常：${JSON.stringify(snap50.pageBadges)}`]),
      ...(appendixA50 && appendixA50.pageText === null ? [] : [`无页码节点不该有页码徽标：${JSON.stringify(appendixA50)}`]),
      ...(appendixA1Rows50 === 0 ? [] : ["未展开的孙节点不应渲染"]),
    ],
  );
  await clickMapNode("2.2 Positional prior");
  await waitPage(3, 3);
  const jump50 = await pageLabel();
  await clickMapNode("1. Abstract");
  await waitPage(1, 3);
  const back50 = await pageLabel();
  record("map-outline", { phase: "jump", toThird: jump50, backToFirst: back50 }, [
    ...(jump50 && jump50.includes("第 3 / 3 页") ? [] : [`点节点应跳页：${jump50}`]),
    ...(back50 && back50.includes("第 1 / 3 页") ? [] : [`回点首章应落到第 1 页：${back50}`]),
  ]);

  // --- 50c 无书签文档：空态 + 进度仍在 -----------------------------------------
  log("50c 无书签文档：地图空态 + 进度行");
  await enterMapWorkspace(seedNotes());
  await openRow("older-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 2);
  await openMap();
  await waitFor(
    "地图空态与进度就绪",
    `document.querySelector(${JSON.stringify(SEL.mapEmpty)}) && document.querySelector(${JSON.stringify(SEL.mapProgress)})`,
  );
  await capturePage(win, "50c-map-outline-empty.png");
  const empty50c = {
    empty: await has(SEL.mapEmpty),
    emptyTitle: await textOf(".map-empty .empty-title"),
    count: await textOf(".map-count"),
    rows: await countOf(SEL.mapRow),
    progress: await textOf(SEL.mapProgress),
  };
  record("map-outline", { phase: "no-outline", ...empty50c }, [
    ...(empty50c.empty && empty50c.emptyTitle === "当前文档没有书签" ? [] : [`空态异常：${JSON.stringify(empty50c)}`]),
    ...(empty50c.count === "0" ? [] : [`空态节点数异常：${empty50c.count}`]),
    ...(empty50c.rows === 0 ? [] : ["空态不得渲染任何行"]),
    ...(empty50c.progress === "第 1 / 2 页 · 50%" ? [] : [`空态进度异常：${empty50c.progress}`]),
  ]);

  // --- 51 笔记数徽标：计数 / 文案 / 几何 / 与开关无关 ---------------------------
  log("51 笔记数徽标：标准种子下的四行");
  await enterMapWorkspace(seedNotes());
  await enterSampleMap();
  await capturePage(win, "51-map-note-badges.png");
  const badgeRect51 = await rectOfSelector(SEL.mapBadge, 5);
  if (badgeRect51) await capturePage(win, "51b-map-badge-zoom.png", badgeRect51);
  const snap51 = await mapSnapshot();
  const expect51 = SAMPLE_MAP_EXPECT.rows;
  const mismatch51 = expect51.filter((expect, index) => {
    const row = snap51.rows[index];
    return (
      !row ||
      row.label !== expect.label ||
      row.pageText !== expect.pageText ||
      row.noteNum !== expect.noteNum ||
      row.noteTitle !== expect.noteTitle
    );
  });
  const badgeRow51 = snap51.rows.find((row) => row.label === "1. Abstract") ?? null;
  const plainRow51 = snap51.rows.find((row) => row.label === "2.2 Positional prior") ?? null;
  record(
    "map-note-badges",
    { phase: "standard-seed", rows: snap51.rows, badgeCount: snap51.badgeCount, pageBadges: snap51.pageBadges },
    [
      ...(snap51.badgeCount === SAMPLE_MAP_EXPECT.badges ? [] : [`徽标数异常：${snap51.badgeCount}`]),
      ...(snap51.rowCount === SAMPLE_MAP_EXPECT.visibleRows ? [] : [`行数异常：${snap51.rowCount}`]),
      ...(mismatch51.length === 0 ? [] : [`行徽标不符：${JSON.stringify(mismatch51)}`]),
      ...(badgeRow51 &&
      badgeRow51.noteHeight === "16px" &&
      badgeRow51.noteRadius === "999px" &&
      badgeRow51.noteFontSize === "10px" &&
      badgeRow51.noteBorderWidth === "1px"
        ? []
        : [`徽标几何异常：${JSON.stringify(badgeRow51)}`]),
      ...(snap51.rows.filter((row) => row.noteNum === null).every((row) => row.childCount === 2)
        ? []
        : ["无徽标行只应有 chevron/spacer + .map-node"]),
      ...(plainRow51 &&
      plainRow51.pageText === "3" &&
      plainRow51.pageHeight === "16px" &&
      plainRow51.pageFontSize === "10px" &&
      plainRow51.pageRadius === "999px"
        ? []
        : [`无徽标行页码徽标几何异常：${JSON.stringify(plainRow51)}`]),
      ...(snap51.rows.every((row) => row.rowFits && row.nodeFits !== false && (row.pageText === null || row.pageFits === true))
        ? []
        : ["地图行存在溢出"]),
    ],
  );
  const badgesBefore51 = await badgePairs();
  await toggleCurrentDocOnly(true);
  await sleep(200);
  const badgesOn51 = await badgePairs();
  await toggleCurrentDocOnly(false);
  await sleep(200);
  const badgesOff51 = await badgePairs();
  record("map-note-badges", { phase: "current-doc-toggle", on: badgesOn51, off: badgesOff51 }, [
    ...(JSON.stringify(badgesOn51) === JSON.stringify(badgesBefore51) ? [] : ["开关 ON 不得改变徽标"]),
    ...(JSON.stringify(badgesOff51) === JSON.stringify(badgesBefore51) ? [] : ["开关 OFF 不得改变徽标"]),
    ...((await filterChecked()) === false ? [] : ["开关应回到 OFF"]),
  ]);

  // --- 52 徽标点击 → 章节过滤（切标签 / 过滤条 / 不落盘） ----------------------
  log("52 徽标点击：切标签 + 章节过滤条 + 字节不变");
  await enterMapWorkspace(seedNotes());
  await enterSampleMap();
  await backToLibraryTab();
  await sleep(900); // reader-state 去抖窗口：基线必须在静置后取（must-fix 5）
  const hash52 = { notes: notesHash(), state: fileHash(STATE_FILE_A) };
  const before52 = { page: await pageLabel(), current: await countOf(".map-row.current") };
  await clickMapBadge("1. Abstract");
  await waitChapterFilter("章节：1. Abstract · 第 1 页", 1);
  await waitNotesTab();
  await capturePage(win, "52-map-chapter-filter.png");
  const leftRect52 = await rectOfSelector(".layout-left", 2);
  if (leftRect52) await capturePage(win, "52b-map-chapter-filter-left-pane.png", leftRect52);
  const barRect52 = await rectOfSelector(SEL.chapterFilter, 4);
  if (barRect52) await capturePage(win, "52c-map-chapter-filter-zoom.png", barRect52);
  const click52 = {
    tab: await activeTab(),
    text: await chapterFilterText(),
    title: await chapterFilterTitle(),
    rows: await countOf(SEL.noteRow),
    groups: await countOf(".notes-group"),
    count: await textOf(".notes-count"),
    page: await pageLabel(),
    current: await countOf(".map-row.current"),
    notesBytesSame: notesHash() === hash52.notes,
    stateBytesSame: fileHash(STATE_FILE_A) === hash52.state,
  };
  record("map-chapter-filter", { phase: "badge-click", ...click52 }, [
    ...(click52.tab === "notes" ? [] : [`点徽标应切到笔记标签：${click52.tab}`]),
    ...(click52.text === "章节：1. Abstract · 第 1 页" ? [] : [`过滤条文本异常：${click52.text}`]),
    ...(click52.title === "仅显示当前文档「sample-paper.pdf」该章节范围内的笔记；点「清除」恢复全部笔记"
      ? []
      : [`过滤条 title 异常：${click52.title}`]),
    ...(click52.rows === 1 && click52.groups === 1 ? [] : [`过滤后行/组异常：${click52.rows}/${click52.groups}`]),
    ...(click52.count === "本章 1 条 / 共 4 条" ? [] : [`计数第三态异常：${click52.count}`]),
    ...(click52.page === before52.page && click52.current === before52.current
      ? []
      : [`点徽标不得改阅读位置：${click52.page}/${click52.current}`]),
    ...(click52.notesBytesSame ? [] : ["点徽标不得改写 notes.json"]),
    ...(click52.stateBytesSame ? [] : ["点徽标不得改写 reader-state.json"]),
  ]);

  // 52-子行：子行徽标与父行同范围 ⇒ 行数同为 2（重叠口径的可见证据）
  await clickMapBadge("2.1 Sparse mask budget");
  await waitChapterFilter("章节：2.1 Sparse mask budget · 第 2 页", 2);
  const child52 = { text: await chapterFilterText(), rows: await countOf(SEL.noteRow), groups: await countOf(".notes-group") };
  record("map-chapter-filter", { phase: "child-badge", ...child52 }, [
    ...(child52.text === "章节：2.1 Sparse mask budget · 第 2 页" ? [] : [`子行过滤条异常：${child52.text}`]),
    ...(child52.rows === 2 && child52.groups === 1 ? [] : [`子行过滤行数异常：${child52.rows}/${child52.groups}`]),
  ]);

  // 52-重复：先切回资料库再点同一徽标（不存在同内容 no-op）
  await backToLibraryTab();
  await clickMapBadge("2.1 Sparse mask budget");
  await waitNotesTab();
  await waitChapterFilter("章节：2.1 Sparse mask budget · 第 2 页", 2);
  const repeat52 = { text: await chapterFilterText(), rows: await countOf(SEL.noteRow), tab: await activeTab() };
  record("map-chapter-filter", { phase: "repeat-click", ...repeat52 }, [
    ...(repeat52.tab === "notes" ? [] : [`重复点击应切标签：${repeat52.tab}`]),
    ...(repeat52.text === "章节：2.1 Sparse mask budget · 第 2 页" ? [] : [`重复点击文本异常：${repeat52.text}`]),
    ...(repeat52.rows === 2 ? [] : [`重复点击行数异常：${repeat52.rows}`]),
  ]);

  // 52-替换：换一章不累积（chapterFilter 单值）
  await clickMapBadge("Appendix B");
  await waitChapterFilter("章节：Appendix B · 第 2-3 页", 2);
  const replace52 = { text: await chapterFilterText(), rows: await countOf(SEL.noteRow) };
  record("map-chapter-filter", { phase: "replace", ...replace52 }, [
    ...(replace52.text === "章节：Appendix B · 第 2-3 页" ? [] : [`替换过滤条异常：${replace52.text}`]),
    ...(replace52.rows === 2 ? [] : [`替换过滤行数异常：${replace52.rows}`]),
  ]);

  // 52d 折叠态点徽标：折叠必须被展开（否则过滤生效但看不到结果）
  await js(`(() => {
    const btn = Array.from(document.querySelectorAll(".pill-icon-btn")).find((el) => el.getAttribute("title") === "折叠资料库");
    if (!btn) throw new Error("折叠按钮未找到");
    btn.click();
    return true;
  })()`);
  await waitFor("左栏折叠", `(() => { const el = document.querySelector(".layout-left"); return !el || el.offsetWidth === 0; })()`);
  await clickMapBadge("1. Abstract");
  await waitFor("左栏展开", `(() => { const el = document.querySelector(".layout-left"); return !!el && el.offsetWidth > 0; })()`);
  await waitChapterFilter("章节：1. Abstract · 第 1 页", 1);
  await capturePage(win, "52d-map-chapter-filter-collapsed.png");
  const collapsed52 = {
    tab: await activeTab(),
    bar: await has(SEL.chapterFilter),
    leftWidth: await js(`document.querySelector(".layout-left").offsetWidth`),
  };
  record("map-chapter-filter", { phase: "collapsed", ...collapsed52 }, [
    ...(collapsed52.tab === "notes" ? [] : [`折叠态点徽标应切到笔记标签：${collapsed52.tab}`]),
    ...(collapsed52.bar ? [] : ["折叠态点徽标后过滤条应可见"]),
    ...(collapsed52.leftWidth > 0 ? [] : ["折叠态点徽标必须展开左栏"]),
  ]);

  // 52e/52e2：「仅看当前文档」两态逐条相同 + 过滤条 DOM 顺序
  await toggleCurrentDocOnly(true);
  await clickMapBadge("2. Method Overview");
  await waitChapterFilter("章节：2. Method Overview · 第 2 页", 2);
  await capturePage(win, "52e-map-chapter-filter-current-doc-on.png");
  const on52e = { checked: await filterChecked(), rows: await countOf(SEL.noteRow), groups: await countOf(".notes-group"), count: await textOf(".notes-count") };
  record("map-chapter-filter", { phase: "and-combination-on", ...on52e }, [
    ...(on52e.checked === true ? [] : ["起始态开关应为 ON"]),
    ...(on52e.rows === 2 && on52e.groups === 1 ? [] : [`ON 态行/组异常：${on52e.rows}/${on52e.groups}`]),
    ...(on52e.count === "本章 2 条 / 共 4 条" ? [] : [`ON 态计数异常：${on52e.count}`]),
  ]);
  await toggleCurrentDocOnly(false);
  await clickMapBadge("2. Method Overview");
  await waitChapterFilter("章节：2. Method Overview · 第 2 页", 2);
  await js(`(() => {
    Array.from(document.querySelectorAll(".note-row .note-select")).forEach((el) => el.click());
    return true;
  })()`);
  await waitFor("已选 2 条", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.includes("已选 2 条"); })()`);
  const order52e2 = await js(`(() => {
    const filter = document.querySelector(".notes-filter");
    const bar = document.querySelector(".notes-chapter-filter");
    const selection = document.querySelector(".notes-selection-bar");
    const follows = (a, b) => !!a && !!b && (a.compareDocumentPosition(b) & 4) === 4;
    return { hasAll: !!filter && !!bar && !!selection, filterBar: follows(filter, bar), barSelection: follows(bar, selection) };
  })()`);
  await capturePage(win, "52e2-map-chapter-filter-current-doc-off.png");
  const off52e = { checked: await filterChecked(), rows: await countOf(SEL.noteRow), groups: await countOf(".notes-group"), count: await textOf(".notes-count") };
  record("map-chapter-filter", { phase: "and-combination-off", ...off52e, order: order52e2, selection: await textOf(".notes-selection-count") }, [
    ...(off52e.checked === false ? [] : ["OFF 态开关不得被程序改写"]),
    ...(off52e.rows === 2 && off52e.groups === 1 ? [] : [`OFF 态行/组异常：${off52e.rows}/${off52e.groups}`]),
    ...(off52e.count === "本章 2 条 / 共 4 条" ? [] : [`OFF 态计数异常：${off52e.count}`]),
    ...(order52e2.hasAll && order52e2.filterBar && order52e2.barSelection ? [] : [`DOM 顺序异常：${JSON.stringify(order52e2)}`]),
  ]);

  // 52f 清除：条消失 / 列表回全量 / 开关与阅读位置不变
  const pageBefore52f = await pageLabel();
  await js(`document.querySelector(${JSON.stringify(SEL.chapterFilterClear)}).click(), true`);
  await waitFor("过滤条消失", `!document.querySelector(${JSON.stringify(SEL.chapterFilter)})`);
  await waitFor("列表回全量", `document.querySelectorAll(".note-row").length === 4`);
  await capturePage(win, "52f-map-chapter-filter-cleared.png");
  const clear52f = { rows: await countOf(SEL.noteRow), count: await textOf(".notes-count"), checked: await filterChecked(), tab: await activeTab(), page: await pageLabel() };
  record("map-chapter-filter", { phase: "clear", ...clear52f }, [
    ...(clear52f.rows === 4 ? [] : [`清除后行数异常：${clear52f.rows}`]),
    ...(clear52f.count === "共 4 条" ? [] : [`清除后计数异常：${clear52f.count}`]),
    ...(clear52f.checked === false ? [] : ["清除不得改开关"]),
    ...(clear52f.tab === "notes" ? [] : ["清除不得切标签"]),
    ...(clear52f.page === pageBefore52f ? [] : ["清除不得改阅读位置"]),
  ]);

  // 52f2 过滤生效后删空该范围：章节空态（分支优先于「当前文档暂无笔记」）
  await clickMapBadge("1. Abstract");
  await waitChapterFilter("章节：1. Abstract · 第 1 页", 1);
  await js(`document.querySelector(".note-row .note-delete").click(), true`);
  await waitFor("删除确认态", `document.querySelector(".note-row").classList.contains("confirming")`);
  await js(`document.querySelector(".note-row .note-delete").click(), true`);
  await waitFor("章节空态", `document.querySelector(${JSON.stringify(SEL.chapterEmpty)})`);
  await capturePage(win, "52f2-notes-chapter-empty.png");
  const empty52f2 = {
    text: await textOf(SEL.chapterEmpty),
    bar: await has(SEL.chapterFilter),
    count: await textOf(".notes-count"),
    rows: await countOf(SEL.noteRow),
    abstract: await mapRowSummary("1. Abstract"),
  };
  record("map-chapter-filter", { phase: "chapter-empty", ...empty52f2 }, [
    ...(empty52f2.text === "本章暂无笔记" ? [] : [`章节空态文案异常：${empty52f2.text}`]),
    ...(empty52f2.bar ? [] : ["过滤不得被计数归零连带清除"]),
    // 共 {total} = notesStore.totalCount：删掉范围内唯一条目后 totalCount 为 3
    ...(empty52f2.count === "本章 0 条 / 共 3 条" ? [] : [`删空后计数异常：${empty52f2.count}`]),
    ...(empty52f2.rows === 0 ? [] : ["章节空态不得渲染行"]),
    ...(empty52f2.abstract && empty52f2.abstract.noteNum === null ? [] : [`范围清空后徽标应消失：${JSON.stringify(empty52f2.abstract)}`]),
  ]);
  await js(`document.querySelector(${JSON.stringify(SEL.chapterFilterClear)}).click(), true`);
  await waitFor("清除后列表回 3 条", `!document.querySelector(${JSON.stringify(SEL.chapterFilter)}) && document.querySelectorAll(".note-row").length === 3`);
  record("map-chapter-filter", { phase: "chapter-empty-cleared", rows: await countOf(SEL.noteRow) }, [
    ...((await countOf(SEL.noteRow)) === 3 ? [] : ["清除后应显示剩余 3 条"]),
  ]);
  await restoreStandardSeed();

  // 52g 文档作用域：切文档清除过滤（notes.json 不写；reader-state 属 R6 既有语义，不纳入）
  log("52g 切文档：过滤清除、标签不变、字节不变");
  await enterMapWorkspace(seedNotes());
  await enterSampleMap();
  await backToLibraryTab();
  await sleep(900);
  const hash52g = notesHash();
  await clickMapBadge("1. Abstract");
  await waitChapterFilter("章节：1. Abstract · 第 1 页", 1);
  await backToLibraryTab();
  await openRow("older-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 2);
  await js(`document.querySelector('.pill-tab[data-tab="notes"]').click(), true`);
  await waitFor("笔记列表就绪", `document.querySelectorAll(".note-row").length === 4`);
  const switched52g = { bar: await has(SEL.chapterFilter), groups: await countOf(".notes-group"), paths: await groupPaths() };
  await capturePage(win, "52g-map-chapter-filter-doc-switch.png");
  record("map-chapter-filter", { phase: "doc-switch", ...switched52g }, [
    ...(switched52g.bar === false ? [] : ["切文档必须清除章节过滤"]),
    ...(switched52g.groups === 2 ? [] : [`切文档后组数异常：${switched52g.groups}`]),
    ...(switched52g.paths[0] === "archive/older-paper.pdf" ? [] : [`当前文档组应置顶：${JSON.stringify(switched52g.paths)}`]),
  ]);
  await backToLibraryTab();
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await js(`document.querySelector('.pill-tab[data-tab="notes"]').click(), true`);
  await waitFor("笔记列表就绪", `document.querySelectorAll(".note-row").length === 4`);
  const back52g = { bar: await has(SEL.chapterFilter), groups: await countOf(".notes-group"), paths: await groupPaths(), notesBytesSame: notesHash() === hash52g };
  record("map-chapter-filter", { phase: "doc-switch-back", ...back52g }, [
    ...(back52g.bar === false ? [] : ["切回原文档不得恢复过滤（已清除）"]),
    ...(back52g.groups === 2 ? [] : [`切回后组数异常：${back52g.groups}`]),
    ...(back52g.paths[0] === "sample-paper.pdf" ? [] : [`切回后当前文档组应置顶：${JSON.stringify(back52g.paths)}`]),
    ...(back52g.notesBytesSame ? [] : ["切文档不得改写 notes.json"]),
  ]);

  // 52h 一次性聚焦：goHome 不触发加载、重进工作区不复现过滤
  log("52h 一次性聚焦：goHome 前后 notesLoad 计数不变");
  await enterMapWorkspace(seedNotes());
  await enterSampleMap();
  await backToLibraryTab();
  await clickMapBadge("1. Abstract");
  await waitNotesTab();
  await backToLibraryTab();
  await openRow("older-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 2);
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  const middle52h = { tab: await activeTab(), bar: await has(SEL.chapterFilter) };
  await capturePage(win, "52h-map-chapter-filter-focus-once.png");
  record("map-chapter-filter", { phase: "focus-once-middle", ...middle52h }, [
    ...(middle52h.tab === "library" ? [] : [`切文档不得改标签：${middle52h.tab}`]),
    ...(middle52h.bar === false ? [] : ["切文档应清除过滤"]),
  ]);
  await clickMapBadge("1. Abstract");
  await waitChapterFilter("章节：1. Abstract · 第 1 页", 1);
  await waitNotesTab();
  record("map-chapter-filter", { phase: "focus-once-repeat", tab: await activeTab() }, [
    ...((await activeTab()) === "notes" ? [] : ["再点徽标应切到笔记标签"]),
  ]);
  const loadBefore52h = await loadCalls();
  await goHome();
  const loadAfter52h = await loadCalls();
  record("map-chapter-filter", { phase: "focus-once-home", before: loadBefore52h, after: loadAfter52h }, [
    ...(loadAfter52h === loadBefore52h ? [] : [`goHome 不得触发 notesLoad:${loadBefore52h} → ${loadAfter52h}`]),
  ]);
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(5);
  const remount52h = {
    tab: await activeTab(),
    panelVisible: await js(`(() => { const el = document.querySelector(".notes-panel"); return !!el && el.offsetParent !== null; })()`),
  };
  record("map-chapter-filter", { phase: "focus-once-remount", ...remount52h }, [
    ...(remount52h.tab === "library" ? [] : [`重进工作区活动标签应为资料库：${remount52h.tab}`]),
    ...(remount52h.panelVisible === false ? [] : ["重进工作区笔记面板不应可见"]),
  ]);

  // 52-err 错误态：过滤条不渲染、状态保留（恢复后清除仍可用）
  log("52-err 错误态：过滤条不渲染，恢复后清除可用");
  await enterMapWorkspace(seedNotes());
  await enterSampleMap();
  await backToLibraryTab();
  await clickMapBadge("1. Abstract");
  await waitChapterFilter("章节：1. Abstract · 第 1 页", 1);
  await backToLibraryTab();
  await setLoadFailure("corrupt");
  await js(`document.querySelector('.pill-tab[data-tab="notes"]').click(), true`);
  await waitFor("笔记错误态", `document.querySelector(".notes-error")`);
  const error52 = { bar: await has(SEL.chapterFilter), title: await textOf(".notes-error .error-title") };
  record("map-chapter-filter", { phase: "error", ...error52 }, [
    ...(error52.bar === false ? [] : ["错误态不得渲染过滤条"]),
    ...(error52.title === "笔记文件无法读取" ? [] : [`错误态标题异常：${error52.title}`]),
  ]);
  await setLoadFailure(null);
  await js(`(() => {
    const btn = Array.from(document.querySelectorAll(".notes-error button")).find((el) => el.textContent.trim() === "重试");
    if (!btn) throw new Error("重试按钮未找到");
    btn.click();
    return true;
  })()`);
  await waitChapterFilter("章节：1. Abstract · 第 1 页", 1);
  await js(`document.querySelector(${JSON.stringify(SEL.chapterFilterClear)}).click(), true`);
  await waitFor("恢复后清除可用", `!document.querySelector(${JSON.stringify(SEL.chapterFilter)}) && document.querySelectorAll(".note-row").length === 4`);
  record("map-chapter-filter", { phase: "error-recovered", rows: await countOf(SEL.noteRow), bar: await has(SEL.chapterFilter) }, [
    ...((await countOf(SEL.noteRow)) === 4 ? [] : ["恢复后清除应回到全量列表"]),
    ...((await has(SEL.chapterFilter)) === false ? [] : ["恢复后过滤条应已被清除"]),
  ]);

  // 52-load 加载窗口：过滤条暂不渲染、加载完成后原样出现
  log("52-load 加载窗口：过滤状态保留");
  await enterMapWorkspace(seedNotes());
  await enterSampleMap();
  await backToLibraryTab();
  await clickMapBadge("2. Method Overview");
  await waitChapterFilter("章节：2. Method Overview · 第 2 页", 2);
  await backToLibraryTab();
  await setLoadDelay(4000);
  await js(`document.querySelector('.pill-tab[data-tab="notes"]').click(), true`);
  await waitFor("笔记加载态", `document.querySelector(".notes-loading")`);
  const loading52 = { bar: await has(SEL.chapterFilter), loading: await has(".notes-loading") };
  record("map-chapter-filter", { phase: "loading", ...loading52 }, [
    ...(loading52.loading ? [] : ["应处于加载态"]),
    ...(loading52.bar === false ? [] : ["加载态不得渲染过滤条"]),
  ]);
  await setLoadDelay(0);
  await waitChapterFilter("章节：2. Method Overview · 第 2 页", 2);
  const restored52 = await chapterFilterText();
  record("map-chapter-filter", { phase: "loading-restored", text: restored52 }, [
    ...(restored52 === "章节：2. Method Overview · 第 2 页" ? [] : [`加载完成后过滤不得丢失：${restored52}`]),
  ]);
  await js(`document.querySelector(${JSON.stringify(SEL.chapterFilterClear)}).click(), true`);

  // 52-inject 注入口径：被隐藏条目仍在选择集（发送不受过滤影响）
  log("52-inject 过滤与选择集独立：发送仍注入 2 条");
  await enterMapWorkspace(seedNotes());
  await enterSampleMap();
  await js(`(() => {
    const inputs = Array.from(document.querySelectorAll(".note-select"));
    if (inputs.length < 2) throw new Error("选择控件不足");
    inputs[0].click();
    inputs[1].click();
    return true;
  })()`);
  await waitFor("已选 2 条", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.includes("已选 2 条"); })()`);
  const stateHash52i = fileHash(STATE_FILE_A);
  await clickMapBadge("1. Abstract");
  await waitChapterFilter("章节：1. Abstract · 第 1 页", 1);
  await typeAndSend("52-inject：过滤后仍按选择集注入。");
  await runTurn("52-inject：过滤后仍按选择集注入。", "过滤注入回答");
  await waitFor("回答块", `document.querySelectorAll(".agent-message").length >= 1`);
  const send52i = await lastSend();
  const selection52i = await selectionSnapshot();
  const chips52i = await chipSnapshot();
  const notesCount52i = send52i ? (send52i.message.match(/^\d+\. doc: /gm) || []).length : 0;
  record(
    "map-chapter-filter",
    {
      phase: "injection",
      countText: selection52i.countText,
      chip: chips52i.notesLabel,
      notesCount: notesCount52i,
      hasReaderNotes: !!send52i && send52i.message.includes("reader_notes:"),
      stateBytesSame: fileHash(STATE_FILE_A) === stateHash52i,
    },
    [
      ...(selection52i.countText === "已选 2 条" ? [] : [`选择集异常：${selection52i.countText}`]),
      ...(chips52i.notesLabel === "摘录 2 条" ? [] : [`chip 异常：${chips52i.notesLabel}`]),
      ...(notesCount52i === 2 ? [] : [`注入条数异常：${notesCount52i}`]),
      ...(send52i && send52i.message.includes("reader_notes:") ? [] : ["发送载荷缺少 reader_notes"]),
      ...(fileHash(STATE_FILE_A) === stateHash52i ? [] : ["发送不得改写 reader-state.json"]),
    ],
  );

  // --- 53 进度行：三页文案与页码指示器同源 -------------------------------------
  log("53 进度行：第 1 / 2 / 3 页三态");
  await enterMapWorkspace(seedNotes());
  await enterSampleMap();
  const p1 = await progressSnapshot();
  await capturePage(win, "53-map-progress.png");
  await clickNext();
  await waitPage(2, 3);
  await sleep(150);
  const p2 = await progressSnapshot();
  await capturePage(win, "53b-map-progress-p2.png");
  await clickNext();
  await waitPage(3, 3);
  await sleep(150);
  const p3 = await progressSnapshot();
  record("map-progress", { phase: "three-pages", p1, p2, p3 }, [
    ...(p1.progress === SAMPLE_MAP_EXPECT.progress.page1 && p1.current === SAMPLE_MAP_EXPECT.read.page1.current
      ? []
      : [`第 1 页进度异常：${JSON.stringify(p1)}`]),
    ...(p2.progress === SAMPLE_MAP_EXPECT.progress.page2 ? [] : [`第 2 页进度异常：${JSON.stringify(p2)}`]),
    ...(p3.progress === SAMPLE_MAP_EXPECT.progress.page3 ? [] : [`第 3 页进度异常：${JSON.stringify(p3)}`]),
    ...([p1, p2, p3].every((item) => !!item.progress && !!item.pagePair && item.progress.startsWith(item.pagePair))
      ? []
      : ["进度页码与 .page-label 不同源"]),
  ]);

  // --- 53c 加载窗口内点开地图：pageCount 未就绪 ⇒ 无进度行 ---------------------
  log("53c 加载窗口：地图无进度行，加载完成后出现");
  await enterMapWorkspace(seedNotes());
  await setLibraryReadDelay(900);
  await openRow("sample-paper.pdf");
  await openMap();
  const during53c = { slot: await has(SEL.mapSlot), progress: await has(SEL.mapProgress), rows: await countOf(SEL.mapRow) };
  await setLibraryReadDelay(0);
  await waitPage(1, 3);
  await waitFor("地图行就绪", `document.querySelectorAll(".map-row").length === 7`, 30000);
  const after53c = { progress: await textOf(SEL.mapProgress) };
  record("map-progress", { phase: "loading-guard", during: during53c, after: after53c }, [
    ...(during53c.slot ? [] : ["加载窗口内应有点开的地图槽位"]),
    ...(during53c.progress === false ? [] : ["pageCount 未就绪时不得渲染进度行"]),
    ...(after53c.progress === "第 1 / 3 页 · 33%" ? [] : [`加载完成后进度异常：${after53c.progress}`]),
  ]);

  // --- 54 已读/未读：三页计数、透明度、无页码节点豁免 -------------------------
  log("54 已读弱化：三页 read/current 计数");
  await enterMapWorkspace(seedNotes());
  await enterSampleMap();
  const read1 = readCounts(await mapSnapshot());
  await clickNext();
  await waitPage(2, 3);
  await sleep(150);
  const snap2 = await mapSnapshot();
  const read2 = readCounts(snap2);
  const abstract2 = snap2.rows.find((row) => row.label === "1. Abstract") ?? null;
  const currentRow2 = snap2.rows.find((row) => row.current) ?? null;
  await capturePage(win, "54-map-read-dim.png");
  const readRect54 = await rectOfSelector(".map-row.read", 4);
  if (readRect54) await capturePage(win, "54b-map-read-zoom.png", readRect54);
  const appendixA54 = await mapRowSummary("Appendix A");
  await clickNext();
  await waitPage(3, 3);
  await sleep(150);
  const read3 = readCounts(await mapSnapshot());
  record(
    "map-read",
    {
      phase: "three-pages",
      read1,
      read2,
      read3,
      abstractOpacity: abstract2 ? abstract2.opacity : null,
      currentOpacity: currentRow2 ? currentRow2.opacity : null,
      appendixA: appendixA54,
    },
    [
      ...(read1.read === SAMPLE_MAP_EXPECT.read.page1.read && read1.current === SAMPLE_MAP_EXPECT.read.page1.current
        ? []
        : [`第 1 页计数异常：${JSON.stringify(read1)}`]),
      ...(read2.read === SAMPLE_MAP_EXPECT.read.page2.read && read2.current === SAMPLE_MAP_EXPECT.read.page2.current
        ? []
        : [`第 2 页计数异常：${JSON.stringify(read2)}`]),
      ...(read3.read === SAMPLE_MAP_EXPECT.read.page3.read && read3.current === SAMPLE_MAP_EXPECT.read.page3.current
        ? []
        : [`第 3 页计数异常：${JSON.stringify(read3)}`]),
      ...([read1, read2, read3].every((item) => item.both === 0) ? [] : ["read 与 current 必须互斥"]),
      ...(abstract2 && abstract2.opacity === "0.55" ? [] : [`已读行透明度异常：${abstract2 ? abstract2.opacity : null}`]),
      ...(currentRow2 && currentRow2.opacity === "1" ? [] : [`当前行不应弱化：${currentRow2 ? currentRow2.opacity : null}`]),
      ...(appendixA54 &&
      appendixA54.read === false &&
      appendixA54.current === false &&
      appendixA54.noteNum === null &&
      appendixA54.pageText === null
        ? []
        : [`无页码行不应参与已读/当前判定：${JSON.stringify(appendixA54)}`]),
    ],
  );
  // 展开无页码节点：其有页码的孙行随后进入可见行集（计数域只随可见行变化）
  await clickMapNode("Appendix A");
  await waitFor("孙节点出现", `document.querySelectorAll(".map-row").length === 8`);
  const appendixA1Rows54 = await mapRowCount("Appendix A.1");
  const appendixA1_54 = await mapRowSummary("Appendix A.1");
  record("map-read", { phase: "expand-null-page", rows: await countOf(SEL.mapRow), childRows: appendixA1Rows54, child: appendixA1_54 }, [
    ...(appendixA1Rows54 === 1 && appendixA1_54 && appendixA1_54.pageText === "3"
      ? []
      : [`展开后孙节点异常：${JSON.stringify(appendixA1_54)}`]),
  ]);
  await clickMapBadge("1. Abstract");
  await waitChapterFilter("章节：1. Abstract · 第 1 页", 1);
  record("map-chapter-filter", { phase: "read-row-badge", rows: await countOf(SEL.noteRow) }, [
    ...((await countOf(SEL.noteRow)) === 1 ? [] : ["已读行徽标仍应触发过滤"]),
  ]);
  await js(`document.querySelector(${JSON.stringify(SEL.chapterFilterClear)}).click(), true`);
  await waitFor("清除后回 4 行", `!document.querySelector(${JSON.stringify(SEL.chapterFilter)}) && document.querySelectorAll(".note-row").length === 4`);

  // --- 55 规模：420 节点 / 220 可见行 / 22 徽标 + 展开耗时 ---------------------
  log("55 规模：long-book 420 节点 / 220 可见行");
  await enterMapWorkspace(longBookSeed());
  await openRow("long-book.pdf");
  await waitPdfLoaded();
  await waitPage(1, 60);
  await js(`document.querySelector('.pill-tab[data-tab="notes"]').click(), true`);
  await waitFor("笔记列表就绪", `document.querySelectorAll(".note-row").length === 2`);
  // 耗时起点冻结为「点 .map-toggle 到 .map-row 数达标」；3000ms 兜底返回现场值（断言仍按 800ms 判）
  const timing55 = await js(`(() => new Promise((resolve) => {
    const start = performance.now();
    const toggle = document.querySelector(${JSON.stringify(SEL.mapToggle)});
    if (!toggle) throw new Error("map toggle not found");
    toggle.click();
    const poll = () => {
      const rows = document.querySelectorAll(".map-row").length;
      if (rows >= 220 || performance.now() - start > 3000) {
        resolve({ ms: Math.round(performance.now() - start), rows, mode: rows >= 220 ? "ready" : "timeout" });
        return;
      }
      setTimeout(poll, 10);
    };
    poll();
  }))()`);
  await waitFor("地图行就绪", `document.querySelectorAll(".map-row").length === 220`, 30000);
  await capturePage(win, "55-map-scale-200.png");
  const snap55 = await mapSnapshot();
  const samples55 = ["Chapter 01", "Chapter 20", "Section 11.05"].map((name) => {
    const row = snap55.rows.find((item) => item.label === name) ?? null;
    const count = longBookExpected(name);
    // 0 条不进 DOM ⇒ 声明的期望文本为 null（与 51 段的声明表同口径）
    return { name, count, expected: count > 0 ? String(count) : null, actual: row ? row.noteNum : null };
  });
  const overflow55 = snap55.rows.every(
    (row) => row.rowFits && row.nodeFits !== false && (row.noteNum !== null || row.pageText === null || row.pageFits === true),
  );
  record(
    "map-scale",
    {
      phase: "long-book",
      timing: timing55,
      count: snap55.count,
      rows: snap55.rowCount,
      badges: snap55.badgeCount,
      progress: snap55.progress,
      samples: samples55,
      overflowFree: overflow55,
    },
    [
      ...(timing55.rows === 220 ? [] : [`可见行数异常：${timing55.rows}`]),
      ...(timing55.ms <= 800 ? [] : [`展开耗时超限：${timing55.ms}ms(mode=${timing55.mode})`]),
      ...(snap55.count === "420" ? [] : [`节点数异常：${snap55.count}`]),
      ...(snap55.rowCount === 220 ? [] : [`可见行数异常：${snap55.rowCount}`]),
      ...(snap55.badgeCount === 22 ? [] : [`徽标数异常：${snap55.badgeCount}`]),
      ...(snap55.progress === "第 1 / 60 页 · 2%" ? [] : [`进度异常：${snap55.progress}`]),
      ...(samples55.every((item) => item.expected === item.actual) ? [] : [`抽样不符：${JSON.stringify(samples55)}`]),
      ...(overflow55 ? [] : ["存在行溢出"]),
    ],
  );
  await restoreStandardSeed();
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
