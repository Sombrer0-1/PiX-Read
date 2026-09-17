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
import { app, BrowserWindow, clipboard } from "electron";
import { createServer } from "vite";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
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
  // R10 新增七项（设计档 §1.5）
  searchInput: ".notes-search-input",
  searchClear: ".notes-search-clear",
  sortBtn: ".notes-sort-btn",
  searchEmpty: ".notes-search-empty",
  undoRow: ".notes-undo",
  undoBtn: ".notes-undo-btn",
  noteCopy: ".note-copy",
  // R11 新增 11 项（设计档 §0.4）
  pdfSearchBtn: '.pdf-toolbar button[title="在文档中搜索"]',
  pdfSearchPanel: ".pdf-search-panel",
  zoomInBtn: '.pdf-toolbar button[title="放大"]',
  zoomLabel: ".zoom-label",
  pdfScroll: ".pdf-scroll",
  pdfViewer: ".pdf-viewer",
  captureFabBtn: ".pdf-capture-fab button",
  captureLayer: ".capture-layer",
  layoutLeft: ".layout-left",
  noteActions: ".note-actions",
  noteText: ".note-text",
  // R12 新增 8 项（设计档 §0.3 / §1.6.1）
  readerSection: ".reader-section",
  readerSectionChip: ".reader-section-chip",
  readerSectionPrev: ".reader-section-prev",
  readerSectionNext: ".reader-section-next",
  pageIndicator: ".pdf-page-indicator",
  pageInput: ".page-input",
  readerMain: ".reader-main",
  composerInput: ".input-area",
  // R13 新增 4 项（设计档 §5.2.1）
  reportBtn: ".notes-report-btn",
  reportRow: ".notes-report-row",
  reportText: ".notes-report-row .report-text",
  reportReveal: ".notes-report-row .report-reveal",
  // R14 新增 6 项（设计档 §5.4.1）
  rowNotes: ".row-notes",
  staleRow: ".notes-stale",
  staleText: ".notes-stale .stale-text",
  staleRefresh: ".notes-stale .stale-refresh",
  groupName: ".notes-group-head .group-name",
  centerDocLabel: ".center-pill .pill-label",
  // R16 新增 4 项（设计档 §5.3.1）
  pageNotes: ".page-notes",
  noteRowAnchored: ".note-row.is-anchored",
  pageBoxOne: '.pdf-page[data-page="1"]',
  notePageBadge: ".note-page-badge",
  // R17 新增 6 项（设计档 §5.4.1）
  shortcutToggle: ".shortcut-toggle",
  shortcutOverview: ".shortcut-overview",
  shortcutRow: ".shortcut-row",
  shortcutKey: ".shortcut-key",
  shortcutNote: ".shortcut-note",
  composerBox: ".composer-box",
  // N97-4 追加 2 项（设计档「追加设计」§3.1）
  contextChip: ".context-chip",
  contextChipRemove: ".context-chip-remove",
  // R18 新增 2 项（设计档 §1.5.2）
  readerDiscuss: ".reader-discuss",
  sessionDocMark: ".session-doc-mark",
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
  // R13：每次运行从「无报告目录」开始（r13-1 的「报告不存在」与 r13-5 的「删目录后自愈」才可复现）
  rmSync(join(LIBRARY_DIR, ".pix-read", "reports"), { recursive: true, force: true });
  mkdirSync(join(LIBRARY_B_DIR, ".pix-read"), { recursive: true });
  mkdirSync(SHOTS_DIR, { recursive: true });
  // A/B 两个工作区的 sample-paper.pdf 同字节；B 不预置 reader-state.json（首启 missing）
  const samplePdf = buildPdf(SAMPLE_PAGES, SAMPLE_OUTLINE);
  writeFileSync(join(LIBRARY_DIR, "sample-paper.pdf"), samplePdf);
  writeFileSync(join(LIBRARY_B_DIR, "sample-paper.pdf"), samplePdf);
  // 上一轮遗留的状态文件会让「首启 missing」不可复现：fixture 冻结为两个工作区都没有它
  rmSync(join(LIBRARY_DIR, ".pix-read", "reader-state.json"), { force: true });
  rmSync(join(LIBRARY_B_DIR, ".pix-read", "reader-state.json"), { force: true });
  // F12：corrupt 重建会留下 .corrupt-* 备份，不清会跨轮累积（13d 的 .pix-read 断言用相位内基线）
  for (const dir of [LIBRARY_DIR, LIBRARY_B_DIR]) {
    for (const name of readdirSync(join(dir, ".pix-read"))) {
      if (name.startsWith("reader-state.json.corrupt-")) rmSync(join(dir, ".pix-read", name), { force: true });
    }
  }
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
const crypto = require("node:crypto");

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
// R10 撤销槽：只存最近一次成功删除（内存态、不落盘、不跨重启），与 src/main/notes-store.ts 同语义
let deleteSlot = null;
let notesRestoreFailure = null;
// 还原响应延迟：作用于「读-改-写之后、返回之前」（落盘顺序 = 请求到达顺序）
let notesRestoreDelayMs = 0;
const notesRestoreCalls = [];
// R13 报告：根与写入都在真实夹具根内（CONFIG.root = 工作区 A，与 NOTES_FILE / relativeDocPath 同根）
const notesReportCalls = [];
let notesReportFailure = null;
// 延迟只推迟响应：落盘、计数与 payload 记录在调用时完成（与 notesRestore 的 resolvedAt 同范式）
let notesReportDelayMs = 0;
// 报告专有文案（与 src/main/notes-store.ts 逐字一致；独立映射，不复用 NOTES_ERRORS 的 write-failed）
const REPORT_ERRORS = {
  "write-failed": "报告写入失败",
  empty: "当前文档暂无笔记，未生成报告",
};
// 还原专有文案（与 src/main/notes-store.ts 逐字一致）
const RESTORE_EMPTY_MESSAGE = "没有可撤销的删除";
const RESTORE_EXISTS_MESSAGE = "该笔记已重新存在，无法撤销";
const RESTORE_DUPLICATE_MESSAGE = "该笔记内容已重新存在，无法撤销";
// notesLoad 计数器：52h 的「goHome 不得触发加载」判据（只计数，不影响返回）
let notesLoadCalls = 0;
// R14 笔记文件指纹：调用计数 + 失败注入（null / 错误码 / "throw"），只影响 notesStat 的返回
let notesStatCalls = 0;
let notesStatFailure = null;
// 发送类命令（prompt/steer）的记录：notes-context / notes-chip 断言的事实源（N50 验收 1）
const sendCalls = [];
// 「在文件夹中显示」的参数记录（r13-5 相位 reveal-and-clear 的唯一判据；行为与返回值不变）
const libraryShowPaths = [];
let sendFailure = null;
let agentEventHandlers = [];
// F16 判据：工作区卸载后的迟到注册（注册/解绑计数与在册句柄数）
let agentEventRegisterCount = 0;
let agentEventUnregisterCount = 0;
// F16 判据：agent_start 是否仍然触发工作区同步（syncWorkspaceState → listSessions）
let listSessionsCalls = 0;
// R18：会话列表种入（未种入 ⇒ listSessions 恒返回 []，与既有行为等价）
let sessionsSeed = [];
let sessionsSeedRoot = CONFIG.root;
const switchCalls = [];
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
    parsed = JSON.parse(fs.readFileSync(currentNotesFile(), "utf8"));
  } catch (err) {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.notes)) return [];
  return clone(parsed.notes);
}

function writeNotesFile(list) {
  fs.mkdirSync(path.dirname(currentNotesFile()), { recursive: true });
  fs.writeFileSync(currentNotesFile(), JSON.stringify({ version: 1, notes: list }, null, 2) + "\\n", "utf8");
}

function normalizeNoteText(value) {
  return String(value == null ? "" : value).replace(/\\s+/g, " ").trim();
}

/** 去重键（与 src/main/notes-store.ts 的 duplicateKey 同口径）：两份同键条目会破坏 addNote 的唯一性不变量。 */
function noteKey(note) {
  return [note.docPath, note.page, note.kind, note.text].join("\\u0000");
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

// --- 报告：主进程 renderDocumentReport 的逐字镜像（同一份手写期望串在烟测侧钉住两侧） -----

/** 条目：与 renderMarkdownEntry 同款（「### 第 N 页」标题 + AI 结论后缀 + 「> 」逐行 + 可选备注）。 */
function renderReportEntry(note) {
  const title = note.kind === "answer" ? "### 第 " + note.page + " 页 · AI 结论" : "### 第 " + note.page + " 页";
  const lines = [title, ""].concat(
    String(note.text).split("\\n").map(function (line) { return "> " + line; }),
  );
  if (note.comment) lines.push("", "备注：" + note.comment);
  return lines.join("\\n");
}

/** 生成时间（formatStampHuman 同款：本地时间、无 locale）。 */
function formatReportStamp(ms) {
  const pad = function (value) { return String(value).padStart(2, "0"); };
  const date = new Date(ms);
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
    " " + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
}

/** 文档显示名（workspaceName 同款：按分隔符取末段，保原大小写）。 */
function reportDisplayName(docPath) {
  const segments = String(docPath).replace(/\\\\/g, "/").split("/").filter(Boolean);
  return segments[segments.length - 1] || String(docPath);
}

/** 完整报告串（分组规则、排序三键、分隔符与尾换行与主进程逐字一致）。 */
function renderDocumentReport(entries, docPath, name, chapters, progress, now) {
  const ordered = entries.slice().sort(function (a, b) {
    return a.page - b.page || a.createdAt - b.createdAt || String(a.id).localeCompare(String(b.id));
  });
  const excerpts = ordered.filter(function (note) { return note.kind === "excerpt"; }).length;
  const progressPart = progress ? "阅读进度：第 " + progress.page + " / " + progress.pageCount + " 页；" : "";
  const meta = "> 由 PiX-Read 生成，每次导出都会覆盖。资料库：" + name + "；文档：" + docPath +
    "；生成时间：" + formatReportStamp(now) + "；" + progressPart + "共 " + ordered.length +
    " 条（摘录 " + excerpts + " · AI 结论 " + (ordered.length - excerpts) + "）。";
  const heading = function (title, list) { return "## " + title + "（" + list.length + " 条）"; };
  const block = function (title, list) {
    return heading(title, list) + "\\n\\n" + list.map(renderReportEntry).join("\\n\\n---\\n\\n");
  };
  const blocks = [];
  if (!chapters.length) {
    // 退化：按页分组（ordered 已按 page 升序 ⇒ Map 插入序即页升序）
    const byPage = new Map();
    ordered.forEach(function (note) {
      const bucket = byPage.get(note.page);
      if (bucket) bucket.push(note);
      else byPage.set(note.page, [note]);
    });
    byPage.forEach(function (list, page) { blocks.push(block("第 " + page + " 页", list)); });
  } else {
    const buckets = chapters.map(function () { return []; });
    const fallback = [];
    ordered.forEach(function (note) {
      // 闭区间、含两端；第一条命中获胜
      const index = chapters.findIndex(function (chapter) { return chapter.start <= note.page && note.page <= chapter.end; });
      if (index >= 0) buckets[index].push(note);
      else fallback.push(note);
    });
    chapters.forEach(function (chapter, index) {
      const list = buckets[index];
      if (!list.length) return;
      blocks.push(block((normalizeNoteText(chapter.title) || "未命名") + " · 第 " + chapter.label + " 页", list));
    });
    if (fallback.length) blocks.push(block("未归入章节", fallback));
  }
  return ["# 阅读报告 · " + reportDisplayName(docPath), meta].concat(blocks).join("\\n\\n") + "\\n";
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
  if (type === "switch_session") {
    const target = typeof command.sessionPath === "string" ? command.sessionPath : null;
    if (target) {
      switchCalls.push({ path: target });
      if (switchCalls.length > 8) switchCalls.shift();
      const mirror = sessionsSeed.find(function (item) { return normalizePath(item.path) === normalizePath(target); });
      if (mirror) {
        SESSION_STATE.sessionFile = mirror.path;
        SESSION_STATE.sessionId = mirror.id;
        SESSION_STATE.sessionName = mirror.name;
      }
    }
    return { success: true, data: { cancelled: false } };
  }
  if (type === "new_session" || type === "clone" || type === "fork") {
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
// R18：与 src/main/reader-state-store.ts 同值同谓词（stub 无法 import TS 源，刻意重复）
const MAX_SESSION_PATH_LENGTH = 2048;

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

/** R14：笔记文件根随 activeRoot（与 stateFilePath 同纪律）——A 侧 activeRoot 初值 = CONFIG.root ⇒ 行为与恒 A 根等价。 */
function currentNotesFile() {
  return path.join(activeRoot, ".pix-read", "notes.json");
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

function isValidSessionPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_SESSION_PATH_LENGTH &&
    value.indexOf(String.fromCharCode(0)) < 0;
}

function isValidSessionAt(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function parseDocState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!isValidPage(value.page) || !isValidScale(value.scale)) return null;
  const updatedAt = typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : 0;
  // R18：合法对 ⇒ 成对带回；任一非法 ⇒ 两键都不追加（读侧不产生 warn、不改写文件）
  if (isValidSessionPath(value.lastSessionPath) && isValidSessionAt(value.lastSessionAt)) {
    return { page: value.page, scale: value.scale, updatedAt: updatedAt, lastSessionPath: value.lastSessionPath, lastSessionAt: value.lastSessionAt };
  }
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
    agentEventRegisterCount += 1;
    return function () {
      const before = agentEventHandlers.length;
      agentEventHandlers = agentEventHandlers.filter(function (item) { return item !== handler; });
      if (agentEventHandlers.length !== before) agentEventUnregisterCount += 1;
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

  listSessions: async function (dir) {
    listSessionsCalls += 1;
    if (normalizePath(dir) !== normalizePath(sessionsSeedRoot)) return [];
    return sessionsSeed.map(function (item) { return Object.assign({}, item); });
  },
  deleteSession: async function () { return { success: true }; },

  libraryList: async function (dir) { return libraryList(dir); },
  libraryOpenPath: async function () { return { success: true }; },
  libraryShowInFolder: async function (targetPath) {
    libraryShowPaths.push(String(targetPath === null || targetPath === undefined ? "" : targetPath));
    return { success: true };
  },
  libraryReadText: async function (target) { return readText(target); },
  libraryReadFile: async function (target) {
    if (libraryReadDelayMs) await sleep(libraryReadDelayMs);
    return readBinary(target);
  },

  notesLoad: async function () {
    notesLoadCalls += 1;
    if (loadDelayMs) await sleep(loadDelayMs);
    if (loadFailure) {
      return { success: false, notes: [], filePath: currentNotesFile(), code: loadFailure.code, error: loadFailure.error };
    }
    return { success: true, notes: readNotesFile(), filePath: currentNotesFile() };
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
    const current = readNotesFile();
    const index = current.findIndex(function (note) { return note.id === id; });
    if (index < 0) {
      return { success: false, notes: [], code: "not-found", error: NOTES_ERRORS["not-found"] || "笔记不存在" };
    }
    const removed = current[index];
    const next = current.filter(function (note) { return note.id !== id; });
    writeNotesFile(next);
    // 与主进程同序：写盘成功后覆盖式设槽（下标 = 删除前的数组下标）并回传 note
    deleteSlot = { root: activeRoot, note: clone([removed])[0], index: index };
    return { success: true, notes: clone(next), note: clone([removed])[0] };
  },
  /** 还原槽内那一条：校验顺序与错误文案逐字对齐 src/main/notes-store.ts 的 restoreNote。 */
  notesRestore: async function (id) {
    // resolvedAt：响应真正回到渲染层的时刻（R11 / r11-6 的「迟到响应」空断言防护）
    const call = { id: id, resolvedAt: null };
    notesRestoreCalls.push(call);
    if (!id || typeof id !== "string") {
      return { success: false, notes: [], code: "invalid-input", error: NOTES_ERRORS["invalid-input"] };
    }
    if (!deleteSlot) {
      return { success: false, notes: [], code: "not-found", error: RESTORE_EMPTY_MESSAGE };
    }
    if (id !== deleteSlot.note.id) {
      return { success: false, notes: [], code: "not-found", error: RESTORE_EMPTY_MESSAGE };
    }
    // 跨工作区防护：槽属于另一个资料库根时绝不写盘
    if (normalizePath(deleteSlot.root) !== normalizePath(activeRoot)) {
      return { success: false, notes: [], code: "not-found", error: RESTORE_EMPTY_MESSAGE };
    }
    if (notesRestoreFailure) {
      return {
        success: false,
        notes: [],
        code: notesRestoreFailure,
        error: NOTES_ERRORS[notesRestoreFailure] || notesRestoreFailure,
      };
    }
    const current = readNotesFile();
    const slotNote = deleteSlot.note;
    if (current.some(function (note) { return note.id === slotNote.id; })) {
      return { success: false, notes: [], code: "invalid-input", error: RESTORE_EXISTS_MESSAGE };
    }
    if (
      current.some(function (note) {
        return note.id !== slotNote.id && noteKey(note) === noteKey(slotNote);
      })
    ) {
      return { success: false, notes: [], code: "invalid-input", error: RESTORE_DUPLICATE_MESSAGE };
    }
    const index = Math.min(deleteSlot.index, current.length);
    const next = current.slice();
    next.splice(index, 0, clone([slotNote])[0]);
    writeNotesFile(next);
    const snapshot = clone(next);
    deleteSlot = null;
    // 延迟只推迟响应（真实 FIFO 下后续请求的快照会包含本次写回）
    if (notesRestoreDelayMs) await sleep(notesRestoreDelayMs);
    call.resolvedAt = Date.now();
    return { success: true, notes: snapshot, note: clone([slotNote])[0] };
  },
  notesExport: async function () {
    // 与 notesLoad 同源（文件），避免「内存数组 vs 文件」两套事实源；stub 不生成 notes.md 内容
    return { success: true, filePath: path.join(CONFIG.root, ".pix-read", "notes.md"), count: readNotesFile().length };
  },
  /** 报告导出：真写 .pix-read/reports/<rel>.md；调用进入即计数与记账（延迟只推迟响应）。 */
  notesExportReport: async function (input) {
    const payload = {
      docFilePath: input ? input.docFilePath : null,
      chapters: input ? input.chapters : null,
      progress: input ? input.progress : null,
    };
    const call = {
      docFilePath: payload.docFilePath,
      chapters: payload.chapters,
      progress: payload.progress,
      resolvedAt: null,
    };
    notesReportCalls.push(call);
    if (notesReportFailure) {
      call.resolvedAt = Date.now();
      return { success: false, code: notesReportFailure, error: REPORT_ERRORS[notesReportFailure] || notesReportFailure };
    }
    const rel = relativeDocPath(payload.docFilePath);
    const file = path.join(CONFIG.root, ".pix-read", "reports", rel + ".md");
    const entries = readNotesFile().filter(function (note) { return docPathKey(note.docPath) === docPathKey(rel); });
    if (!entries.length) {
      call.resolvedAt = Date.now();
      return { success: false, code: "empty", error: REPORT_ERRORS.empty };
    }
    const content = renderDocumentReport(
      entries,
      rel,
      path.basename(CONFIG.root),
      payload.chapters || [],
      payload.progress || null,
      Date.now(),
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
    if (notesReportDelayMs) await sleep(notesReportDelayMs);
    call.resolvedAt = Date.now();
    return { success: true, filePath: file, displayPath: ".pix-read/reports/" + rel + ".md", count: entries.length };
  },
  notesReset: async function () {
    writeNotesFile([]);
    // 重建 = 从空库开始：重建前删除的条目不得被悄悄写回
    deleteSlot = null;
    return { success: true, notes: [], backupPath: NOTES_FILE + ".bak" };
  },
  /** R14 指纹：只读的最小事实（不解析内容、不建目录/文件、不改 mtime、永不抛错）。 */
  notesStat: async function () {
    notesStatCalls += 1;
    if (notesStatFailure === "throw") throw new Error("stub notesStat 注入异常");
    if (notesStatFailure) {
      return {
        success: false,
        exists: false,
        size: 0,
        mtimeMs: 0,
        hash: "",
        code: notesStatFailure,
        error: NOTES_ERRORS[notesStatFailure] || notesStatFailure,
      };
    }
    const file = currentNotesFile();
    let bytes;
    try {
      bytes = fs.readFileSync(file);
    } catch (err) {
      if (err && err.code === "ENOENT") return { success: true, exists: false, size: 0, mtimeMs: 0, hash: "" };
      return { success: false, exists: false, size: 0, mtimeMs: 0, hash: "", code: "read-failed", error: NOTES_ERRORS["read-failed"] };
    }
    const stat = fs.statSync(file);
    return {
      success: true,
      exists: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      hash: crypto.createHash("sha256").update(bytes).digest("hex"),
    };
  },

  readerStateLoad: async function () {
    if (stateLoadDelayMs) await sleep(stateLoadDelayMs);
    const file = stateFilePath();
    const read = readStateFile();
    if (!read.ok) {
      // 与真实主进程同步：missing 不是降级（degraded:false），只有 corrupt/version/read-failed 才降级
      if (read.reason === "missing") {
        return { success: true, state: emptyState(), filePath: file, degraded: false };
      }
      return { success: true, state: emptyState(), filePath: file, degraded: true, reason: read.reason, error: read.reason };
    }
    return { success: true, state: read.state, filePath: file, degraded: false };
  },
  readerStateSave: async function (draft) {
    const docFilePath = draft && typeof draft.docFilePath === "string" ? draft.docFilePath : "";
    readerStateCalls.push({
      docFilePath: docFilePath,
      page: draft ? draft.page : null,
      scale: draft ? draft.scale : null,
      lastSessionPath: draft ? draft.lastSessionPath : undefined,
      lastSessionAt: draft ? draft.lastSessionAt : undefined,
    });
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
    const previous = current.documents[key];
    // R18：有效对 ⇒ 覆盖；否则 ⇒ 保留目标条目既有对；其它条目一字不动（与主进程同规则）
    const carried = isValidSessionPath(draft.lastSessionPath) && isValidSessionAt(draft.lastSessionAt)
      ? { lastSessionPath: draft.lastSessionPath, lastSessionAt: draft.lastSessionAt }
      : previous && previous.lastSessionPath !== undefined && previous.lastSessionAt !== undefined
        ? { lastSessionPath: previous.lastSessionPath, lastSessionAt: previous.lastSessionAt }
        : {};
    documents[key] = Object.assign({ page: draft.page, scale: draft.scale, updatedAt: Date.now() }, carried);
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
  installUpdate: async function () { return { success: true }; },
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
  notesStatCalls: function () { return { count: notesStatCalls }; },
  setNotesStatFailure: function (code) { notesStatFailure = code || null; },
  setNotesAddFailure: function (code) { notesAddFailure = code || null; },
  setNotesDeleteFailure: function (code) { notesDeleteFailure = code || null; },
  notesRestoreCalls: function () {
    return { count: notesRestoreCalls.length, payloads: notesRestoreCalls.slice(-8) };
  },
  clearDeleteSlot: function () { deleteSlot = null; return true; },
  setNotesRestoreFailure: function (code) { notesRestoreFailure = code || null; },
  setNotesRestoreDelay: function (ms) { notesRestoreDelayMs = ms || 0; },
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
  notesReportCalls: function () {
    return { count: notesReportCalls.length, payloads: notesReportCalls.slice(-8) };
  },
  setNotesReportFailure: function (code) { notesReportFailure = code || null; },
  setNotesReportDelay: function (ms) { notesReportDelayMs = ms || 0; },
  libraryShowCalls: function () {
    return { count: libraryShowPaths.length, paths: libraryShowPaths.slice(-8) };
  },
  setMessages: function (list) {
    stubMessages = Array.isArray(list) ? list.map(function (message) { return Object.assign({}, message); }) : [];
  },
  emitAgentEvent: function (event) {
    agentEventHandlers.slice().forEach(function (handler) {
      handler(event);
    });
  },
  setLoadDelay: function (ms) { loadDelayMs = ms; },
  agentEventListenerCount: function () {
    return {
      handlers: agentEventHandlers.length,
      registered: agentEventRegisterCount,
      unregistered: agentEventUnregisterCount,
    };
  },
  listSessionsCalls: function () { return listSessionsCalls; },
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
  setSessions: function (list, root) {
    sessionsSeed = Array.isArray(list) ? list.map(function (item) { return Object.assign({}, item); }) : [];
    sessionsSeedRoot = root || CONFIG.root;
    return sessionsSeed.length;
  },
  switchSessionCalls: function () { return { count: switchCalls.length, paths: switchCalls.map(function (item) { return item.path; }) }; },
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
  // N73-2b（R11 追加）：同文本的重复选区不再把反馈重置为 actions ⇒ 动作按钮需等反馈自然
  // 回落（FEEDBACK_MS = 2500）后才回来；此处只补一个有界等待，既有判据与截图不变。
  await waitFor(
    "同文本重复选区后动作按钮回位（等反馈回落）",
    `Array.from(document.querySelectorAll(".quick-ask-btn")).some((el) => (el.textContent || "").includes("摘录"))`,
  );
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
  /** R18：现场投影（忽略讨论记录两键与 updatedAt）：发送成功会按设计改写这三项，其余必须逐字不变。 */
  const stateProjection = (file) => {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      const documents = Object.fromEntries(
        Object.entries(parsed.documents || {}).map(([key, entry]) => [key, { page: entry.page, scale: entry.scale }]),
      );
      return JSON.stringify({ version: parsed.version, lastDocPath: parsed.lastDocPath ?? null, documents });
    } catch (err) {
      return null;
    }
  };
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
  // missing 不再降级：有界静默后由断言判定 warn 增量为 0（真实等待窗口，不是直接读计数）
  await sleep(600);
  const emptyState = {
    resume: await has(".reader-resume"),
    title: await textOf(".empty-title"),
    emptyError: await has(".reader-empty-error"),
    warnDelta20b: warnCount() - warnBase20b,
  };
  await capturePage(win, "20b-resume-empty.png");
  record("resume-entry", { phase: "no-record", ...emptyState }, [
    ...(emptyState.resume === false ? [] : ["无记录时不应有入口"]),
    ...(emptyState.title === "选择左侧文件开始阅读" ? [] : [`空态文案异常：${emptyState.title}`]),
    ...(emptyState.warnDelta20b === 0
      ? []
      : [`missing 不得再产生 [reader-state] warn，实际增量 ${emptyState.warnDelta20b}`]),
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

  // --- 22f 触底钳制（R15-F2）-----------------------------------------------------
  // 编号说明：R15-fix 建议「22c」，但 22c 已被写失败注入相位占用（同函数内不得重号）⇒ 新相位取 22f；
  // 截图名沿用计划指定的 r15-22c-bottom-50.png。
  log("22f 触底钳制：50% 滚到底 = 第 3 / 3 页；fitted（不可滚动）不被钳到末页");
  await goHome();
  removeState(STATE_FILE_A);
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  const zoomOut22f = () => js(`document.querySelector('.pdf-toolbar button[title="缩小"]').click(), true`);
  for (let i = 0; i < 5; i++) await zoomOut22f();
  await waitFor(
    "缩放 50%",
    `document.querySelector(".zoom-label") && document.querySelector(".zoom-label").textContent.trim() === "50%"`,
  );
  const scrollProbe22f = () => js(`(() => {
    const root = document.querySelector(".pdf-scroll");
    return root
      ? { scrollTop: Math.round(root.scrollTop), scrollHeight: root.scrollHeight, clientHeight: root.clientHeight }
      : null;
  })()`);
  const zoom50 = await zoomLabel();
  const beforeBottom22f = await scrollProbe22f();
  await js(`(() => { const root = document.querySelector(".pdf-scroll"); root.scrollTop = root.scrollHeight; return true; })()`);
  await waitPage(3, 3);
  const bottom22f = { page: await pageLabel(), scroll: await scrollProbe22f() };
  await capturePage(win, "r15-22c-bottom-50.png");
  record("page-tracking", { phase: "bottom-clamp-50", zoom: zoom50, before: beforeBottom22f, after: bottom22f }, [
    ...(beforeBottom22f && beforeBottom22f.scrollHeight - beforeBottom22f.clientHeight > 1
      ? []
      : [`50% 下必须可滚动（防空断言）：${JSON.stringify(beforeBottom22f)}`]),
    ...(bottom22f.scroll && bottom22f.scroll.scrollTop > 0 ? [] : [`触底后 scrollTop 应大于 0（防空断言）：${JSON.stringify(bottom22f.scroll)}`]),
    ...(bottom22f.page === "第 3 / 3 页" ? [] : [`触底后当前页应为末页：${bottom22f.page}`]),
  ]);
  await js(`(() => { const root = document.querySelector(".pdf-scroll"); root.scrollTop = 0; return true; })()`);
  await waitPage(1, 3);
  const top22f = { page: await pageLabel() };
  record("page-tracking", { phase: "top-back-50", ...top22f }, [
    ...(top22f.page === "第 1 / 3 页" ? [] : [`回到顶部应为第 1 页：${top22f.page}`]),
  ]);
  // fitted 负向：把滚动容器拉高到内容装得下（scrollHeight - clientHeight <= 1）⇒ 不得钳到末页。
  // 合成 KeyboardEvent 不触发原生滚动，故这里直接派发 scroll 事件驱动 onScroll → rAF → updateCurrentPage。
  await js(`(() => {
    const root = document.querySelector(".pdf-scroll");
    root.style.flex = "0 0 auto";
    root.style.height = "3000px";
    root.scrollTop = 0;
    root.dispatchEvent(new Event("scroll"));
    return true;
  })()`);
  await sleep(300);
  const fitted22f = await js(`(() => {
    const root = document.querySelector(".pdf-scroll");
    const label = document.querySelector(".page-label");
    return {
      page: label ? label.textContent.replace(/\\s+/g, " ").trim() : null,
      scrollTop: Math.round(root.scrollTop),
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight,
    };
  })()`);
  await capturePage(win, "r15-22f-fitted-no-clamp.png");
  record("page-tracking", { phase: "fitted-no-clamp", ...fitted22f }, [
    ...(fitted22f.scrollHeight - fitted22f.clientHeight <= 1
      ? []
      : [`该相位要求不可滚动（防空断言）：${JSON.stringify(fitted22f)}`]),
    ...(fitted22f.page === "第 1 / 3 页" ? [] : [`不可滚动时不得钳到末页：${fitted22f.page}`]),
  ]);
  await js(`(() => { const root = document.querySelector(".pdf-scroll"); root.style.flex = ""; root.style.height = ""; return true; })()`);
  const zoomIn22f = () => js(`document.querySelector('.pdf-toolbar button[title="放大"]').click(), true`);
  for (let i = 0; i < 5; i++) await zoomIn22f();
  await waitFor(
    "缩放回 100%",
    `document.querySelector(".zoom-label") && document.querySelector(".zoom-label").textContent.trim() === "100%"`,
  );
  await waitPage(1, 3);
  const restored22f = { page: await pageLabel(), zoom: await zoomLabel() };
  record("page-tracking", { phase: "restored-100", ...restored22f }, [
    ...(restored22f.zoom === "100%" ? [] : [`相位收尾缩放应为 100%：${restored22f.zoom}`]),
    ...(restored22f.page === "第 1 / 3 页" ? [] : [`相位收尾应回到第 1 页：${restored22f.page}`]),
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
    // R14 登记修复：B 的笔记根随 activeRoot 后笔记面板进入空态（同样渲染 .empty-title）
    // ⇒ 阅读区空态文案必须限定在 .reader-empty 内，否则读到的是左栏笔记空态（与 R11 同款限定口径）
    title: await textOf(".reader-empty .empty-title"),
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

  /** R18（52-inject 与 r18-* 共用）：等现场文件达到谓词（waitFor 在渲染层求值，无法轮询文件）。 */
  const waitState = async (file, predicate, label, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      let ok = false;
      try {
        ok = Boolean(predicate(readState(file)));
      } catch (err) {
        ok = false;
      }
      if (ok) return;
      if (Date.now() > deadline) throw new Error(`等待超时：${label}（现场文件未达判据）`);
      await sleep(120);
    }
  };

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
  const confirmed35B = `<reading_context>\npath: ${join(LIBRARY_DIR, "sample-paper.pdf")}\npage: 1\npageCount: 3\nsection: 1. Abstract · 第 1 页\n</reading_context>\n\n${TURN35B}`;
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
  // 页码 pill 可见严格早于章节派生（先 setPageCount/scrollToPage，再 getOutline → setOutline）：
  // 就地内联等待，不得调用后置 helper（runReaderStateScenarios 闭包末段的 const 存在 TDZ）。
  await waitFor("章节控件就绪", `document.querySelector(${JSON.stringify(SEL.readerSection)}) !== null`);
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
        "section: 2. Method Overview · 第 2 页",
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
      ...(missingLines(prompt43.message, ["<reading_context>", "page: 2", "selectedText:", "reader_notes:", "section: 2. Method Overview · 第 2 页"]).length === 0
        ? []
        : [`载荷缺少骨架行：${missingLines(prompt43.message, ["<reading_context>", "page: 2", "selectedText:", "reader_notes:", "section: 2. Method Overview · 第 2 页"]).join(" / ")}`]),
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

  // --- 45d 发送失败还原：草稿回填 + 恢复后重发（R15 F6；45/45B/45C 不动）--------
  log("45d 发送失败还原：失败回填草稿且可重发");
  const ASK45D = "45d：失败后草稿应还原。";
  const errorBase45d = await countOf(".error-block");
  const base45d = await userBlocks();
  await clearSendCalls();
  await setSendFailure("throw");
  await setDraft(ASK45D);
  await js(`document.querySelector(".composer-send").click(), true`);
  await waitFor("45d 发送异常错误块", `document.querySelectorAll(".error-block").length > ${errorBase45d}`);
  await sleep(200);
  const restore45d = {
    value: await js(`document.querySelector(".input-area").value`),
    userBlocksRolledBack: (await userBlocks()) === base45d,
    sendDisabled: await js(`(() => { const b = document.querySelector(".composer-send"); return !!b && b.disabled; })()`),
    focused: await js(`document.activeElement === document.querySelector(".input-area")`),
  };
  await capturePage(win, "45d-send-failure-restore.png");
  await setSendFailure(null);
  await clearSendCalls();
  await js(`document.querySelector(".composer-send").click(), true`);
  await waitSendCalls(1);
  await sleep(200);
  const retry45d = {
    value: await js(`document.querySelector(".input-area").value`),
    type: (await lastSend()).type,
  };
  record(
    "composer-send",
    { phase: "failure-restore", ...restore45d, retry: retry45d },
    [
      ...(restore45d.value === ASK45D ? [] : [`失败后草稿必须还原：${JSON.stringify(restore45d.value)}`]),
      ...(restore45d.userBlocksRolledBack ? [] : ["失败后乐观用户块应回滚"]),
      ...(restore45d.sendDisabled === false ? [] : ["还原后发送按钮必须可点"]),
      ...(restore45d.focused === true ? [] : ["还原后焦点应回到输入框"]),
      ...(retry45d.value === "" ? [] : [`重发成功后草稿应清空：${JSON.stringify(retry45d.value)}`]),
      ...(retry45d.type === "prompt" ? [] : [`重发应走 prompt：${retry45d.type}`]),
    ],
  );

  // --- r15-ime 发送框 IME 组合态守卫（R15 F1）-----------------------------------
  log("r15-ime：组合态回车不发送，非组合态回车发送（成对断言）");
  await clearSendCalls();
  await setDraft("IME 测试");
  const imeValueBefore = await js(`document.querySelector(".input-area").value`);
  await js(`document.querySelector(".input-area").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true })), true`);
  await sleep(250);
  const imeComposing = {
    sendCount: (await sendCalls()).count,
    value: await js(`document.querySelector(".input-area").value`),
  };
  await capturePage(win, "r15-ime-guard.png");
  await js(`document.querySelector(".input-area").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: false })), true`);
  await waitSendCalls(1);
  await sleep(200);
  const imePlain = {
    sendCount: (await sendCalls()).count,
    value: await js(`document.querySelector(".input-area").value`),
  };
  record(
    "composer-ime",
    { phase: "enter-guard", valueBefore: imeValueBefore, composing: imeComposing, plain: imePlain },
    [
      ...(imeComposing.sendCount === 0 ? [] : [`组合态回车不得发送：${imeComposing.sendCount}`]),
      ...(imeComposing.value === "IME 测试" ? [] : [`组合态回车不得改草稿：${JSON.stringify(imeComposing.value)}`]),
      ...(imePlain.sendCount === 1 ? [] : [`非组合态回车必须发送：${imePlain.sendCount}`]),
      ...(imePlain.value === "" ? [] : [`发送后草稿应清空：${JSON.stringify(imePlain.value)}`]),
    ],
  );

  // --- r15-clarify 澄清请求替换：进度与作答必须复位（R15 F8）-------------------
  log("r15-clarify 澄清请求替换（r1 两问 → r2 一问）：进度复位到 1 / 1");
  const clarifyQ = (id, question) => ({ id: id, header: "澄清", question: question });
  await emitUserInputRequest({ id: "r15-clarify-1", questions: [clarifyQ("q1", "第一个问题"), clarifyQ("q2", "第二个问题")] });
  await waitFor("澄清卡片（r1）", `document.querySelector(".clarification-card")`);
  const progressBefore = await textOf(".question-progress");
  await js(`(() => {
    const el = document.querySelector(".clarification-card .card-textarea");
    if (!el) throw new Error("card textarea not found");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, "第一题回答");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await waitFor("继续按钮可点", `(() => { const b = document.querySelector(".clarification-card .next-btn"); return !!b && !b.disabled; })()`);
  await js(`document.querySelector(".clarification-card .next-btn").click(), true`);
  await waitFor("推进到第 2 题", `(() => { const el = document.querySelector(".question-progress"); return !!el && el.textContent.replace(/\\s+/g, " ").trim() === "2 / 2"; })()`);
  await emitUserInputRequest({ id: "r15-clarify-2", questions: [clarifyQ("q1", "替换后的唯一问题")] });
  await sleep(600);
  const replaced = {
    inDom: await has(".clarification-card"),
    progress: await textOf(".question-progress"),
    questionText: await textOf(".clarification-card .question-text"),
    textareaDisabled: await js(`(() => { const el = document.querySelector(".clarification-card .card-textarea"); return el ? el.disabled : null; })()`),
  };
  await capturePage(win, "r15-clarify-replace.png");
  await emitUserInputRequest(null);
  await sleep(400);
  const cleared = await has(".clarification-card");
  record(
    "clarify-replace",
    { phase: "replace", progressBefore: progressBefore, ...replaced, cleared: cleared },
    [
      ...(progressBefore === "1 / 2" ? [] : [`前置：r1 应停在第 1 / 2 题：${progressBefore}`]),
      ...(replaced.inDom === true ? [] : ["替换后澄清卡片必须仍在 DOM"]),
      ...(replaced.progress === "1 / 1" ? [] : [`替换后进度必须复位：${replaced.progress}`]),
      ...(replaced.textareaDisabled === false ? [] : [`替换后输入框必须可用：${replaced.textareaDisabled}`]),
      ...(cleared === false ? [] : ["撤销后卡片应消失"]),
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
  // R18：发送成功会按设计写入讨论记录（两键 + updatedAt）⇒ 不能再用字节比较；
  // 过滤 / 选择 / 发送除该记录外仍须逐字不变（点徽标的字节断言见 52 相位，不受影响）
  // 落点写盘是 600ms 去抖：先等目标条目在场再取基线，否则基线是「文件尚不存在」
  await waitState(STATE_FILE_A, (state) => state.documents["sample-paper.pdf"], "52-inject 落点写盘");
  const stateBefore52i = stateProjection(STATE_FILE_A);
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
      stateBytesChanged: fileHash(STATE_FILE_A) !== stateHash52i,
      stateSameExceptRecord: stateProjection(STATE_FILE_A) === stateBefore52i,
      stateBefore: stateBefore52i,
      stateAfter: stateProjection(STATE_FILE_A),
    },
    [
      ...(selection52i.countText === "已选 2 条" ? [] : [`选择集异常：${selection52i.countText}`]),
      ...(chips52i.notesLabel === "摘录 2 条" ? [] : [`chip 异常：${chips52i.notesLabel}`]),
      ...(notesCount52i === 2 ? [] : [`注入条数异常：${notesCount52i}`]),
      ...(send52i && send52i.message.includes("reader_notes:") ? [] : ["发送载荷缺少 reader_notes"]),
      ...(stateProjection(STATE_FILE_A) === stateBefore52i ? [] : ["过滤 / 选择 / 发送不得改写阅读现场（R18 讨论记录除外）"]),
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

  // -------------------------------------------------------------------------
  // 场景 60–65：笔记面板的搜索 / 排序 / 撤销 / 复制（R10 / N63–N72）
  //
  // 挂载位置：本函数末尾（R9 场景 55 之后）。60 段起每个场景自带复位（enterNotesProbe），
  // 不引用其它场景的局部变量；60-7 / 60-9 / 64b 会真实删空笔记，其后的字节与行数判据
  // 一律先复位再采集（设计档 §8.6 第 5 条）。
  // -------------------------------------------------------------------------

  const restoreCalls = () => js("window.__pixStub.notesRestoreCalls()");
  const clearSlot = () => js("window.__pixStub.clearDeleteSlot(), true");
  const setRestoreFailure = (code) => js(`window.__pixStub.setNotesRestoreFailure(${JSON.stringify(code)}), true`);
  const setRestoreDelay = (ms) => js(`window.__pixStub.setNotesRestoreDelay(${ms}), true`);

  /** 复位 + 打开 sample-paper.pdf 第 1 页 + 笔记面板就绪（60–65 的共用入口）。 */
  const enterNotesProbe = async (seed = seedNotes(), rows = 4) => {
    await enterMapWorkspace(seed);
    await openRow("sample-paper.pdf");
    await waitPdfLoaded();
    await waitPage(1, 3);
    await openNotesPanel(rows);
  };

  /** 搜索写值：先聚焦（供 60-3 的 Esc 断言），再用原生 setter 派发 input（一次 js 往返，不等待）。 */
  const setSearch = (text) => js(`(() => {
    const input = document.querySelector(${JSON.stringify(SEL.searchInput)});
    if (!input) throw new Error("search input not found");
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);

  /** 搜索现场：值 / 焦点 / 清空按钮 / 行数 / 计数 / 搜索类空态文本（一次 js 读完）。 */
  const searchProbe = () => js(`(() => {
    const input = document.querySelector(${JSON.stringify(SEL.searchInput)});
    const count = document.querySelector(".notes-count");
    const empty = document.querySelector(${JSON.stringify(SEL.searchEmpty)});
    return {
      value: input ? input.value : null,
      focused: document.activeElement === input,
      clearInDom: !!document.querySelector(${JSON.stringify(SEL.searchClear)}),
      rows: document.querySelectorAll(${JSON.stringify(SEL.noteRow)}).length,
      countText: count ? count.textContent.replace(/\\s+/g, " ").trim() : null,
      emptyText: empty ? empty.textContent.replace(/\\s+/g, " ").trim() : null,
    };
  })()`);

  const readRowsAndCount = () => js(`(() => {
    const count = document.querySelector(".notes-count");
    return {
      rows: document.querySelectorAll(${JSON.stringify(SEL.noteRow)}).length,
      countText: count ? count.textContent.replace(/\\s+/g, " ").trim() : null,
    };
  })()`);

  /** 地图开关是二态切换：已开时不得再点（否则把地图关掉）。 */
  const ensureMapOpen = async () => {
    if (await has(SEL.mapSlot)) return;
    await openMap();
  };

  const pressSearchEsc = () => js(`(() => {
    const input = document.querySelector(${JSON.stringify(SEL.searchInput)});
    if (!input) throw new Error("search input not found");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return true;
  })()`);

  const clickSearchClear = () => js(`(() => {
    const btn = document.querySelector(${JSON.stringify(SEL.searchClear)});
    if (!btn) throw new Error("search clear button not found");
    btn.click();
    return true;
  })()`);

  const sortButtonProbe = () => js(`(() => {
    const btn = document.querySelector(${JSON.stringify(SEL.sortBtn)});
    return btn ? { text: btn.textContent.replace(/\\s+/g, " ").trim(), title: btn.getAttribute("title") } : null;
  })()`);

  /** 当前文档组（DOM 首个 .notes-group）的行序：文本全串 + 页码徽标 + AI 徽标。 */
  const currentGroupProbe = () => js(`(() => {
    const group = document.querySelector(".notes-group");
    if (!group) return null;
    return Array.from(group.querySelectorAll(".note-row")).map((row) => {
      const text = row.querySelector(".note-text");
      const page = row.querySelector(".note-page-badge");
      return {
        text: text ? text.textContent : null,
        pageBadge: page ? page.textContent.replace(/\\s+/g, " ").trim() : null,
        ai: !!row.querySelector(".note-ai-badge"),
      };
    });
  })()`);

  /** 组头序列：title / 显示名 / 计数（跨文档组的顺序与计数判据）。 */
  const groupHeads = () => js(`(() => {
    const text = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
    return Array.from(document.querySelectorAll(".notes-group")).map((group) => {
      const head = group.querySelector(".notes-group-head");
      return {
        title: head ? head.getAttribute("title") : null,
        name: text(head ? head.querySelector(".group-name") : null),
        count: text(head ? head.querySelector(".group-count") : null),
      };
    });
  })()`);

  const rowTextSet = () => js(`Array.from(document.querySelectorAll(".note-row .note-text")).map((el) => el.textContent)`);

  /** 删除行：两次点击（中间等 .confirming），与既有场景同手法。 */
  const deleteRowByText = async (needle) => {
    await js(`(() => {
      const row = ${rowFinder(needle, false)};
      if (!row) throw new Error("delete target not found: " + ${JSON.stringify(needle)});
      row.querySelector(".note-delete").click();
      return true;
    })()`);
    await waitFor("删除确认态", `(() => { const row = ${rowFinder(needle, false)}; return !!row && row.classList.contains("confirming"); })()`);
    await js(`(() => {
      const row = ${rowFinder(needle, false)};
      if (!row) throw new Error("confirming row gone: " + ${JSON.stringify(needle)});
      row.querySelector(".note-delete").click();
      return true;
    })()`);
    await waitFor("删除完成", `!(${rowFinder(needle, false)})`);
  };

  const undoSnapshot = () => js(`(() => {
    const rows = Array.from(document.querySelectorAll(${JSON.stringify(SEL.undoRow)}));
    const row = rows[0];
    const span = row ? row.querySelector(".undo-text") : null;
    const btn = row ? row.querySelector(${JSON.stringify(SEL.undoBtn)}) : null;
    return {
      rowCount: rows.length,
      text: span ? span.textContent.replace(/\\s+/g, " ").trim() : null,
      btnText: btn ? btn.textContent.replace(/\\s+/g, " ").trim() : null,
      btnTitle: btn ? btn.getAttribute("title") : null,
      btnDisabled: btn ? btn.disabled : null,
    };
  })()`);

  /** 撤销行的 DOM 位置：在 .notes-notice 之后、.notes-export-row 之前（元素缺失时不判）。 */
  const undoOrder = () => js(`(() => {
    const row = document.querySelector(${JSON.stringify(SEL.undoRow)});
    const notice = document.querySelector(".notes-notice");
    const exportRow = document.querySelector(".notes-export-row");
    const follows = (a, b) => !!a && !!b && (a.compareDocumentPosition(b) & 4) === 4;
    return { hasNotice: !!notice, noticeBefore: follows(notice, row), hasExport: !!exportRow, beforeExport: follows(row, exportRow) };
  })()`);

  const clickUndo = () => js(`(() => {
    const btn = document.querySelector(${JSON.stringify(SEL.undoBtn)});
    if (!btn) throw new Error("undo button not found");
    btn.click();
    return true;
  })()`);

  const notesNotice = () => js(`(() => {
    const el = document.querySelector(".notes-notice");
    return el
      ? { isError: el.classList.contains("is-error"), isSuccess: el.classList.contains("is-success"), text: el.textContent.replace(/\\s+/g, " ").trim() }
      : null;
  })()`);

  const closeNotice = () => js(`(() => {
    const btn = document.querySelector(".notes-notice .notice-close");
    if (btn) btn.click();
    return true;
  })()`);

  /** 剪贴板写入是异步的：等它相对点击前的值发生变化（仍断言逐字内容，不用期望值做轮询条件）。 */
  const readClipboardChange = async (before, label) => {
    const deadline = Date.now() + 5000;
    for (;;) {
      const text = clipboard.readText();
      if (text !== before) return text;
      if (Date.now() > deadline) throw new Error(`等待超时：${label}（剪贴板未变化）`);
      await sleep(80);
    }
  };
  /** Windows 系统剪贴板会把 LF 规整成 CRLF（OS 行为，非产品行为）：逐字比较前归一化，原始值同时入库。 */
  const normalizeClipboard = (text) => String(text).replace(/\r\n/g, "\n");

  const clickCopyByText = (needle) => js(`(() => {
    const row = ${rowFinder(needle, false)};
    if (!row) throw new Error("copy target not found: " + ${JSON.stringify(needle)});
    const btn = row.querySelector(${JSON.stringify(SEL.noteCopy)});
    if (!btn) throw new Error("copy button not found in row");
    btn.click();
    return true;
  })()`);

  const rowCopyProbe = (needle) => js(`(() => {
    const row = ${rowFinder(needle, false)};
    if (!row) return null;
    const btn = row.querySelector(${JSON.stringify(SEL.noteCopy)});
    return btn
      ? { text: btn.textContent.replace(/\\s+/g, " ").trim(), title: btn.getAttribute("title"), copied: btn.classList.contains("is-copied") }
      : null;
  })()`);

  /**
   * 在 PDF 第 1 页造选区并点「摘录」。
   * 判据是「文件 + 面板」而不是浮层反馈：面板从空态切到列表会触发一次面板滚动，
   * 而 R11 起浮层只对「目标在 .reader-stage 子树内」的滚动隐藏 ⇒ 面板滚动不再吞掉反馈；
   * 入库引发的 DOM 更新会带出一次同文本 selectionchange，反馈态在该事件之后保持可见（N73-2b）；
   * 60-9 在本条后追加逐字反馈断言（A1–A3）。
   */
  const excerptFirstSpan = async () => {
    await selectPageSpan(1);
    const beforeExcerpt = readNotes().length;
    await js(`(() => {
      const buttons = Array.from(document.querySelectorAll(".quick-ask-btn"));
      const target = buttons.find((el) => (el.textContent || "").includes("摘录"));
      if (!target) throw new Error("excerpt button not found");
      target.click();
      return true;
    })()`);
    const deadline = Date.now() + 20000;
    for (;;) {
      if (readNotes().length === beforeExcerpt + 1) break;
      if (Date.now() > deadline) throw new Error(`等待超时：摘录入库（notes.json 条数未从 ${beforeExcerpt} 增加）`);
      await sleep(120);
    }
    await waitFor("摘录后面板回位", `document.querySelector(${JSON.stringify(SEL.searchInput)})`);
  };

  // --- R11 helper（设计档 §0.4：语义冻结、命名自由）----------------------------

  /** 浮层现场：一次 js 读 inDom / display（computed）/ feedbackClass / feedbackText。 */
  const quickAskProbe = () => js(`(() => {
    const el = document.querySelector(${JSON.stringify(SEL.quickAsk)});
    const feedback = document.querySelector(".quick-ask-feedback");
    return {
      inDom: !!el,
      display: el ? getComputedStyle(el).display : null,
      feedbackClass: feedback ? feedback.className : null,
      feedbackText: feedback ? feedback.textContent.replace(/\\s+/g, " ").trim() : null,
    };
  })()`);

  /** 有界等待反馈态（不以期望文案做轮询条件）：超时只回传现场，由调用方的断言判红。 */
  const waitFeedbackOk = async (timeoutMs = 1500) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const probe = await quickAskProbe();
      if (probe.feedbackClass !== null && probe.feedbackClass.includes("is-ok")) return probe;
      if (Date.now() > deadline) return probe;
      await sleep(60);
    }
  };

  // --- N73-2b helper（设计档「追加-2 §2.4」：语义冻结、命名自由）-----------------

  /** N73-2b 浮层现场：一次 js 读 inDom / display / feedbackClass / feedbackText / btnCount。 */
  const quickAskStateProbe = () => js(`(() => {
    const el = document.querySelector(${JSON.stringify(SEL.quickAsk)});
    const feedback = document.querySelector(".quick-ask-feedback");
    return {
      inDom: !!el,
      display: el ? getComputedStyle(el).display : null,
      feedbackClass: feedback ? feedback.className : null,
      feedbackText: feedback ? feedback.textContent.replace(/\\s+/g, " ").trim() : null,
      btnCount: el ? el.querySelectorAll(".quick-ask-btn").length : 0,
    };
  })()`);

  /** N73-2b 选区现场：text 归一化空白 + trim；anchorInStage = 锚点在 .reader-stage 子树内。 */
  const selectionProbe = () => js(`(() => {
    const selection = document.getSelection();
    const stage = document.querySelector(".reader-stage");
    const anchor = selection ? selection.anchorNode : null;
    return {
      text: selection ? selection.toString().replace(/\\s+/g, " ").trim() : null,
      collapsed: selection ? selection.isCollapsed : null,
      anchorInStage: !!anchor && !!stage && stage.contains(anchor),
    };
  })()`);

  /** 第 N 页文本层首个 span 的文本（归一化 + trim）：「同文本 / 不同文本」判定的现场值。 */
  const pageSpanText = (page) => js(`(() => {
    const span = document.querySelector('.pdf-page[data-page="${page}"] .textLayer span');
    return span ? span.textContent.replace(/\\s+/g, " ").trim() : null;
  })()`);

  /** 把目标页带进渲染窗口（scrollIntoView 会触发阅读区滚动 ⇒ 隐藏浮层，故必须在选区之前调用）。 */
  const focusPage = async (page) => {
    await js(`(() => {
      const target = document.querySelector('.pdf-page[data-page="${page}"]');
      if (target) target.scrollIntoView({ block: "center" });
      return true;
    })()`);
    await waitFor(`第 ${page} 页文本层`, `document.querySelector('.pdf-page[data-page="${page}"] .textLayer span')`);
  };

  /**
   * 修复轮.5 入口前置加固：有界静默 + 「可摘录态」复核（最多 attempts 次）。
   * 迟到的阅读区滚动可能在 selectPageSpan 之后才隐藏浮层（既有语义，指针落在 hide 路径）⇒
   * 静默等待本身不能证明「静默之前没被隐藏」，故静默后复核浮层是否仍为可见 actions 态且选区
   * 仍在 stage 内；不成立则重建选区（有界重取）后再静默复核。超限返回 ok:false，由调用方以
   * 独立文案判为前置失败（不得降级为跳过）。
   */
  const ensureQuickAskExcerptReady = async (page, attempts = 3) => {
    const trail = [];
    let quiet = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      quiet = await waitStageScrollQuiet();
      const state = await quickAskStateProbe();
      const selection = await selectionProbe();
      const spanText = await pageSpanText(page);
      const ready =
        state.display !== null &&
        state.display !== "none" &&
        state.feedbackClass === null &&
        state.btnCount === 4 &&
        selection.collapsed === false &&
        selection.anchorInStage === true &&
        selection.text === spanText;
      trail.push({ attempt, quiet, state, selection, spanText, ready });
      if (ready) return { ok: true, attempts: attempt, quiet, trail };
      if (attempt < attempts) await selectPageSpan(page); // 重取：选区重建后浮层回到可见 actions 态
    }
    return { ok: false, attempts, quiet, trail };
  };

  /**
   * 点浮层的「摘录」并等文件条数 +1（≤20 s），随后等面板回位：相位 4/5 的公共前置。
   * 按钮缺失时回传现场（不再抛渲染层裸错误），由调用方按前置失败判红。
   */
  const excerptViaQuickAsk = async () => {
    const before = readNotes().length;
    const clicked = await js(`(() => {
      const el = document.querySelector(${JSON.stringify(SEL.quickAsk)});
      const buttons = Array.from(document.querySelectorAll(".quick-ask-btn"));
      const target = buttons.find((item) => (item.textContent || "").includes("摘录"));
      if (!target) {
        return { clicked: false, inDom: !!el, display: el ? getComputedStyle(el).display : null, btnCount: buttons.length };
      }
      target.click();
      return { clicked: true, inDom: !!el, display: el ? getComputedStyle(el).display : null, btnCount: buttons.length };
    })()`);
    if (!clicked.clicked) throw new Error(`摘录按钮不可点击（入口前置被破坏）：${JSON.stringify(clicked)}`);
    const deadline = Date.now() + 20000;
    for (;;) {
      if (readNotes().length === before + 1) break;
      if (Date.now() > deadline) throw new Error(`等待超时：摘录入库（notes.json 条数未从 ${before} 增加）`);
      await sleep(120);
    }
    await waitFor("摘录后面板回位", `document.querySelector(${JSON.stringify(SEL.searchInput)})`);
  };

  /**
   * N73-2b 的到期观测：有界轮询（60 ms）直到 feedbackClass === null；
   * 超时不抛错，返回 { probe, at } 由调用方的断言判红（与 waitFeedbackOk 同风格）。
   * 命名说明：设计档建议的 waitFeedbackGone 与既有 helper（同作用域）重名 ⇒ 改用 waitFeedbackCleared。
   */
  const waitFeedbackCleared = async (timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const probe = await quickAskStateProbe();
      if (probe.feedbackClass === null) return { probe, at: Date.now() };
      if (Date.now() > deadline) return { probe, at: Date.now() };
      await sleep(60);
    }
  };

  /** 空态文案：容器只判「在 DOM」，文案从 .empty-title / .empty-subtitle 读（M3）。 */
  const notesEmptyProbe = () => js(`(() => {
    const el = document.querySelector(${JSON.stringify(SEL.notesEmpty)});
    const text = (selector) => {
      const node = el ? el.querySelector(selector) : null;
      return node ? node.textContent.replace(/\\s+/g, " ").trim() : null;
    };
    return { inDom: !!el, title: text(".empty-title"), subtitle: text(".empty-subtitle") };
  })()`);

  /** 阅读区滚动现场：一次 js 读 scrollHeight / clientHeight / scrollTop / scaleText。 */
  const stageScrollProbe = () => js(`(() => {
    const el = document.querySelector(${JSON.stringify(SEL.pdfScroll)});
    const zoom = document.querySelector(${JSON.stringify(SEL.zoomLabel)});
    return {
      scrollHeight: el ? el.scrollHeight : null,
      clientHeight: el ? el.clientHeight : null,
      scrollTop: el ? el.scrollTop : null,
      scaleText: zoom ? zoom.textContent.replace(/\\s+/g, " ").trim() : null,
    };
  })()`);

  // --- 修复轮.5 helper（取证面稳定性）：阅读区滚动静默观测 ---------------------
  //
  // 相位 4/5 的反馈窗口只有 2500 ms，任何 target 落在 .reader-stage 子树内的滚动都会按既有
  // 语义隐藏浮层（PdfSelectionQuickAsk.onStageScroll）⇒ 环境性前置破坏与产品行为会混为一红。
  // 这里装一个只读计数器 + 有界静默等待，把「窗口内是否有阅读区滚动」变成可判读的读数。

  /**
   * 安装阅读区滚动计数器（幂等；计数跨相位累积）。
   * document 级 capture 监听：scroll 不冒泡，但 capture 阶段能命中子树内滚动元素；
   * 只统计 target 在 .reader-stage 子树内的滚动事件与最近时刻（与产品 hide 判据同源）。
   */
  const installStageScrollWatch = () => js(`(() => {
    if (window.__pixStageScrollWatch) return true;
    const watch = { count: 0, lastAt: null };
    document.addEventListener("scroll", (event) => {
      const target = event.target;
      const stage = document.querySelector(".reader-stage");
      if (target instanceof Node && stage && stage.contains(target)) {
        watch.count += 1;
        watch.lastAt = Date.now();
      }
    }, true);
    window.__pixStageScrollWatch = watch;
    return true;
  })()`);

  /** 阅读区滚动读数：scrollTop + 累计事件计数 + 最近事件时刻（epoch ms；未发生为 null）。 */
  const stageScrollWatchProbe = () => js(`(() => {
    const watch = window.__pixStageScrollWatch || { count: null, lastAt: null };
    const el = document.querySelector(${JSON.stringify(SEL.pdfScroll)});
    return { scrollTop: el ? el.scrollTop : null, count: watch.count, lastAt: watch.lastAt };
  })()`);

  /**
   * 有界滚动静默等待（修复轮.5）：连续 quietMs 无新增阅读区滚动事件才返回 ok:true；
   * 到 timeoutMs 仍有新增 ⇒ ok:false —— 调用方按「前置失败」判红（不得静默降级为通过）。
   */
  const waitStageScrollQuiet = async (quietMs = 400, timeoutMs = 6000) => {
    await installStageScrollWatch();
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    let seen = (await stageScrollWatchProbe()).count;
    const from = seen;
    let lastChangeAt = startedAt;
    for (;;) {
      await sleep(60);
      const probe = await stageScrollWatchProbe();
      const now = Date.now();
      if (probe.count !== seen) {
        seen = probe.count;
        lastChangeAt = now;
      }
      if (now - lastChangeAt >= quietMs) {
        return { ok: true, quietMs, timeoutMs, waitedMs: now - startedAt, absorbed: seen - from, lastAt: probe.lastAt };
      }
      if (now >= deadline) {
        return { ok: false, quietMs, timeoutMs, waitedMs: now - startedAt, absorbed: seen - from, lastAt: probe.lastAt };
      }
    }
  };

  /** 在 document.body 上派发 Escape：不经过输入框 ⇒ 元素级监听不执行，用作阅读区既有语义的对照控制。 */
  const pressBodyEsc = () => js(`(() => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return true;
  })()`);

  /** 窄栏几何：一次 js 读完 .layout-left / 每行动作区（M4 判定表的全部判据）。 */
  const narrowProbe = () => js(`(() => {
    const left = document.querySelector(${JSON.stringify(SEL.layoutLeft)});
    const fontNode = document.querySelector(${JSON.stringify(SEL.noteText)});
    const fontSize = fontNode ? parseFloat(getComputedStyle(fontNode).fontSize) : null;
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, y: b.top, w: b.width, h: b.height };
    };
    const rows = Array.from(document.querySelectorAll(${JSON.stringify(SEL.noteRow)})).map((row) => {
      const actions = row.querySelector(${JSON.stringify(SEL.noteActions)});
      const body = row.querySelector(".note-body");
      const copy = row.querySelector(".note-copy");
      const wrap = row.querySelector(".note-ask-wrap");
      return {
        scrollOverflow: actions ? actions.scrollWidth - actions.clientWidth : null,
        actions: actions ? box(actions) : null,
        body: body ? box(body) : null,
        copy: copy ? box(copy) : null,
        askWrap: wrap ? box(wrap) : null,
        dom: {
          copyFirst: !!(actions && copy && actions.firstElementChild === copy),
          askAfterCopy: !!(actions && copy && wrap && (copy.compareDocumentPosition(wrap) & 4) === 4),
          actionsLast: !!(body && actions && body.lastElementChild === actions),
        },
      };
    });
    return {
      leftWidth: left ? Math.round(left.getBoundingClientRect().width) : null,
      leftRight: left ? left.getBoundingClientRect().right : null,
      threshold: { node: ${JSON.stringify(SEL.noteText)}, fontSize, T: fontSize == null ? null : 1.5 * Math.max(fontSize * 1.5) },
      rows,
    };
  })()`);

  // 三段逐字样例（设计档 §4.1）：断言直接引用这些字面量，不由产品函数生成
  const COPY_SAMPLE_1 =
    "> Table 2 reports the ablation over the sparse mask budget. Removing the positional prior costs 2.4 points of recall, " +
    "which confirms the mask is doing more than sparsification alone; the effect persists when the retrieval corpus is " +
    "truncated to the first 8k tokens, so the gain cannot be attributed to longer effective context windows.\n\n" +
    "—— sample-paper.pdf · 第 2 页";
  const COPY_SAMPLE_2 = "> 结论：稀疏注意力在三分之一的预算下保持召回，位置先验是关键。\n\n—— sample-paper.pdf · 第 2 页 · AI 结论";
  const COPY_SAMPLE_3 = "> Section 4. Reproducibility: all runs use three seeds and report the median.\n\n—— older-paper.pdf · 第 7 页";

  // --- 60-1 搜索命中态与计数（含 60-2 的即时性判据） ---------------------------
  log("60-1 搜索命中态与计数（含中文与大小写不敏感）");
  await enterNotesProbe();
  const hash60 = notesHash();
  const loadBase60 = await loadCalls();
  await setSearch("TABLE 2");
  const instant60 = await readRowsAndCount();
  await capturePage(win, "60-notes-search.png");
  const left60 = await rectOfSelector(".layout-left", 2);
  if (left60) await capturePage(win, "60b-notes-search-left-pane.png", left60);
  const header60 = await rectOfSelector(".notes-header", 2);
  if (header60) await capturePage(win, "60c-notes-search-zoom.png", header60);
  await setSearch("消融");
  const commentHit60 = await searchProbe();
  // 搜索行形态（需求 §0.8 冻结）：placeholder / 输入框盒模型（26px + 圆角 6 + 12px，照抄 PdfSearchPanel）/ 清空控件是 v-btn 图标按钮。
  const rowForm60 = await js(`(() => {
    const input = document.querySelector(${JSON.stringify(SEL.searchInput)});
    if (!input) return null;
    const clear = document.querySelector(${JSON.stringify(SEL.searchClear)});
    const ist = getComputedStyle(input);
    const irect = input.getBoundingClientRect();
    const crect = clear ? clear.getBoundingClientRect() : null;
    return {
      placeholder: input.getAttribute("placeholder"),
      height: Math.round(irect.height),
      radius: ist.borderTopLeftRadius,
      fontSize: ist.fontSize,
      clearTag: clear ? clear.tagName : null,
      clearVBtn: clear ? clear.classList.contains("v-btn") : false,
      clearIconBtn: clear ? clear.classList.contains("v-btn--icon") : false,
      clearTitle: clear ? clear.getAttribute("title") : null,
      clearIcon: clear ? !!clear.querySelector(".v-icon.mdi-close") : false,
      clearBox: crect ? { w: Math.round(crect.width), h: Math.round(crect.height) } : null,
    };
  })()`);
  record("notes-search", { phase: "search-row-form", ...rowForm60 }, [
    ...(rowForm60.placeholder === "搜索原文或备注" ? [] : [`placeholder 非冻结字面：${rowForm60.placeholder}`]),
    ...(rowForm60.height === 26 ? [] : [`输入框高度应为 26px：${rowForm60.height}`]),
    ...(rowForm60.radius === "6px" ? [] : [`输入框圆角应为 6px：${rowForm60.radius}`]),
    ...(rowForm60.fontSize === "12px" ? [] : [`输入框字号应为 12px：${rowForm60.fontSize}`]),
    ...(rowForm60.clearTag === "BUTTON" && rowForm60.clearVBtn && rowForm60.clearIconBtn
      ? []
      : [`清空控件应为 v-btn 图标按钮：${JSON.stringify(rowForm60)}`]),
    ...(rowForm60.clearTitle === "清空搜索" ? [] : [`清空控件 title 异常：${rowForm60.clearTitle}`]),
    ...(rowForm60.clearIcon ? [] : ["清空控件应含 mdi-close 图标"]),
  ]);
  await setSearch("消融 实验");
  const innerSpace60 = await searchProbe();
  await setSearch("sample-paper.pdf");
  const meta60 = await searchProbe();
  await setSearch("");
  const cleared60 = await searchProbe();
  record(
    "notes-search",
    {
      phase: "hits",
      immediate: instant60,
      comment: commentHit60,
      innerSpace: innerSpace60,
      meta: meta60,
      cleared: cleared60,
      hashSame: notesHash() === hash60,
      loadCallsSame: (await loadCalls()) === loadBase60,
    },
    [
      ...(instant60.rows === 1 ? [] : [`输入与读取之间只允许一次 IPC 往返：应见 1 行（无防抖），实为 ${instant60.rows}`]),
      ...(instant60.countText === "命中 1 条 / 共 4 条" ? [] : [`即时计数异常：${instant60.countText}`]),
      ...(commentHit60.rows === 1 ? [] : [`备注命中异常：${commentHit60.rows}`]),
      ...(commentHit60.countText === "命中 1 条 / 共 4 条" ? [] : [`备注命中计数异常：${commentHit60.countText}`]),
      ...(innerSpace60.rows === 0 ? [] : [`内部空白不折叠：应 0 行，实为 ${innerSpace60.rows}`]),
      ...(innerSpace60.emptyText === "没有匹配「消融 实验」的笔记" ? [] : [`空态文案异常：${innerSpace60.emptyText}`]),
      ...(innerSpace60.clearInDom ? [] : ["搜索生效时清空按钮应在 DOM"]),
      ...(meta60.rows === 0 ? [] : [`docPath 不参与匹配：应 0 行，实为 ${meta60.rows}`]),
      ...(cleared60.rows === 4 && cleared60.countText === "共 4 条"
        ? []
        : [`清空后应回全量：${cleared60.rows}/${cleared60.countText}`]),
      ...(cleared60.clearInDom === false ? [] : ["清空后清空按钮应移出 DOM"]),
      ...(notesHash() === hash60 ? [] : ["搜索不得改写 notes.json"]),
      ...((await loadCalls()) === loadBase60 ? [] : ["搜索不得触发 notesLoad"]),
    ],
  );

  // --- 60-3 Esc：清空 + 失焦 --------------------------------------------------
  log("60-3 Esc：清空查询并把焦点交还窗口");
  await setSearch("消融");
  const beforeEsc60 = await searchProbe();
  await pressSearchEsc();
  const afterEsc60 = await searchProbe();
  await capturePage(win, "60d-notes-search-cleared.png");
  record("notes-search", { phase: "esc", before: beforeEsc60, after: afterEsc60 }, [
    ...(beforeEsc60.focused === true ? [] : [`Esc 前输入框应聚焦（空断言防护）：${JSON.stringify(beforeEsc60)}`]),
    ...(beforeEsc60.value === "消融" && beforeEsc60.rows === 1 ? [] : [`Esc 前现场异常：${JSON.stringify(beforeEsc60)}`]),
    ...(afterEsc60.value === "" ? [] : [`Esc 后应清空：${afterEsc60.value}`]),
    ...(afterEsc60.focused === false ? [] : ["Esc 后应失焦"]),
    ...(afterEsc60.rows === 4 ? [] : [`Esc 后应回 4 行：${afterEsc60.rows}`]),
    ...(afterEsc60.clearInDom === false ? [] : ["Esc 后清空按钮应移出 DOM"]),
  ]);

  // --- 60-4 清空按钮：清空 + 焦点交还输入框 ------------------------------------
  log("60-4 清空按钮：清空并把焦点交还输入框");
  await setSearch("消融");
  await clickSearchClear();
  const clearBtn60 = await searchProbe();
  record("notes-search", { phase: "clear-button", ...clearBtn60, hashSame: notesHash() === hash60 }, [
    ...(clearBtn60.value === "" ? [] : [`清空按钮后值异常：${clearBtn60.value}`]),
    ...(clearBtn60.focused === true ? [] : ["清空按钮后焦点应在输入框"]),
    ...(clearBtn60.rows === 4 ? [] : [`清空按钮后应回 4 行：${clearBtn60.rows}`]),
    ...(notesHash() === hash60 ? [] : ["清空按钮不得改写 notes.json"]),
  ]);

  // --- 60-5 三维同时生效 ------------------------------------------------------
  log("60-5 三维同时生效：搜索 × 章节过滤 × 仅看当前文档");
  await enterNotesProbe();
  await toggleCurrentDocOnly(true);
  await ensureMapOpen();
  await waitFor("地图行就绪", `document.querySelectorAll(".map-row").length === 7`);
  await clickMapBadge("2. Method Overview");
  await waitChapterFilter("章节：2. Method Overview · 第 2 页", 2);
  await setSearch("Table 2");
  const three60 = { probe: await searchProbe(), chapterText: await chapterFilterText(), checked: await filterChecked() };
  await capturePage(win, "60e-notes-search-three-dimensions.png");
  await toggleCurrentDocOnly(false);
  const off60 = await readRowsAndCount();
  await toggleCurrentDocOnly(true);
  const on60 = await readRowsAndCount();
  record("notes-search", { phase: "three-dimensions", ...three60, off: off60, on: on60 }, [
    ...(three60.probe.rows === 1 ? [] : [`三维应只剩 1 行：${three60.probe.rows}`]),
    ...(three60.probe.value === "Table 2" ? [] : [`输入框值异常：${three60.probe.value}`]),
    ...(three60.chapterText === "章节：2. Method Overview · 第 2 页" ? [] : [`过滤条文本异常：${three60.chapterText}`]),
    ...(three60.checked === true ? [] : ["开关应为 ON"]),
    ...(three60.probe.countText === "命中 1 条 / 共 4 条" ? [] : [`三维计数异常：${three60.probe.countText}`]),
    ...(off60.rows === 1 && on60.rows === 1
      ? []
      : [`开关两态在章节区间内都应 1 行（AND 的数值证据）：${off60.rows}/${on60.rows}`]),
  ]);

  // --- 60-6 计数真值表 + 错误态 ------------------------------------------------
  log("60-6 计数真值表六态 + 错误态");
  await setSearch("");
  await js(`document.querySelector(${JSON.stringify(SEL.chapterFilterClear)}).click(), true`);
  await waitFor("过滤条消失", `!document.querySelector(${JSON.stringify(SEL.chapterFilter)})`);
  await toggleCurrentDocOnly(false);
  const c1_60 = await readRowsAndCount();
  await toggleCurrentDocOnly(true);
  const c2_60 = await readRowsAndCount();
  await ensureMapOpen();
  await waitFor("地图行就绪", `document.querySelectorAll(".map-row").length === 7`);
  await clickMapBadge("2. Method Overview");
  await waitChapterFilter("章节：2. Method Overview · 第 2 页", 2);
  const c3_60 = await readRowsAndCount();
  await setSearch("Table 2");
  const c4_60 = await readRowsAndCount();
  const c5_60 = await readRowsAndCount();
  await setSearch("zzz");
  const c6_60 = await readRowsAndCount();
  await setSearch("Table 2");
  await js(`document.querySelector(${JSON.stringify(SEL.tabLibrary)}).click(), true`);
  await setLoadFailure("corrupt");
  await js(`document.querySelector(${JSON.stringify(SEL.tabNotes)}).click(), true`);
  await waitFor("笔记错误态", `document.querySelector(".notes-error")`);
  const err60 = {
    countText: await textOf(".notes-count"),
    searchInDom: await has(SEL.searchInput),
    sortInDom: await has(SEL.sortBtn),
  };
  await setLoadFailure(null);
  await js(`document.querySelector(${JSON.stringify(SEL.tabLibrary)}).click(), true`);
  await js(`document.querySelector(${JSON.stringify(SEL.tabNotes)}).click(), true`);
  await waitFor("笔记面板回位", `document.querySelector(${JSON.stringify(SEL.searchInput)})`);
  const recovered60 = await searchProbe();
  record(
    "notes-search",
    {
      phase: "counts",
      plain: c1_60,
      currentDoc: c2_60,
      chapter: c3_60,
      hit: c4_60,
      threeDims: c5_60,
      miss: c6_60,
      error: err60,
      recovered: recovered60,
    },
    [
      ...(c1_60.countText === "共 4 条" ? [] : [`计数一态异常：${c1_60.countText}`]),
      ...(c2_60.countText === "当前 3 条 / 共 4 条" ? [] : [`计数二态异常：${c2_60.countText}`]),
      ...(c3_60.countText === "本章 2 条 / 共 4 条" ? [] : [`计数三态异常：${c3_60.countText}`]),
      ...(c4_60.countText === "命中 1 条 / 共 4 条" ? [] : [`计数四态异常：${c4_60.countText}`]),
      ...(c5_60.countText === "命中 1 条 / 共 4 条" ? [] : [`三维同时计数异常：${c5_60.countText}`]),
      ...(c6_60.countText === "命中 0 条 / 共 4 条" ? [] : [`无匹配计数异常：${c6_60.countText}`]),
      ...(err60.countText === "" ? [] : [`错误态计数应为空串：${JSON.stringify(err60.countText)}`]),
      ...(err60.searchInDom === false && err60.sortInDom === false ? [] : ["错误态不得渲染搜索/排序行"]),
      ...(recovered60.value === "Table 2" ? [] : [`错误态恢复后查询未保留：${recovered60.value}`]),
    ],
  );

  // --- 60-7 空态矩阵（修订 4）--------------------------------------------------
  log("60-7 空态矩阵：搜索类三态 + 章节/文档两态");
  await enterNotesProbe();
  await setSearch("zzz");
  const e4c60 = await searchProbe();
  await capturePage(win, "61-notes-search-empty.png");
  await toggleCurrentDocOnly(true);
  const e4b60 = await searchProbe();
  await capturePage(win, "61b-notes-search-empty-doc.png");
  await ensureMapOpen();
  await waitFor("地图行就绪", `document.querySelectorAll(".map-row").length === 7`);
  await clickMapBadge("2. Method Overview");
  await waitChapterFilter("章节：2. Method Overview · 第 2 页", 0);
  const e4a60 = await searchProbe();
  const noOtherEmpty60 = { filteredEmpty: await has(".notes-filtered-empty"), chapterEmpty: await has(SEL.chapterEmpty) };
  await capturePage(win, "61c-notes-search-empty-chapter.png");
  record(
    "notes-search",
    { phase: "empty-search", plain: e4c60, doc: e4b60, chapter: e4a60, noOther: noOtherEmpty60 },
    [
      ...(e4c60.emptyText === "没有匹配「zzz」的笔记" ? [] : [`4c 文案异常：${e4c60.emptyText}`]),
      ...(e4c60.rows === 0 ? [] : [`4c 应 0 行：${e4c60.rows}`]),
      ...(e4b60.emptyText === "当前文档内没有匹配「zzz」的笔记" ? [] : [`4b 文案异常：${e4b60.emptyText}`]),
      ...(e4a60.emptyText === "本章内没有匹配「zzz」的笔记" ? [] : [`4a 文案异常：${e4a60.emptyText}`]),
      ...(noOtherEmpty60.filteredEmpty === false && noOtherEmpty60.chapterEmpty === false
        ? []
        : [`搜索类空态不得渲染另两个空态：${JSON.stringify(noOtherEmpty60)}`]),
    ],
  );
  await setSearch("");
  const chapterRange60 = await readRowsAndCount();
  await deleteRowByText("Table 2 repo");
  await deleteRowByText("结论：稀疏注意力");
  const chapterEmpty60 = { text: await textOf(SEL.chapterEmpty), ...(await readRowsAndCount()) };
  await js(`document.querySelector(${JSON.stringify(SEL.chapterFilterClear)}).click(), true`);
  await waitFor("过滤条消失", `!document.querySelector(${JSON.stringify(SEL.chapterFilter)})`);
  const currentOnly60 = await readRowsAndCount();
  await deleteRowByText("attention budget is the binding constraint");
  const docEmpty60 = { text: await textOf(".notes-filtered-empty"), ...(await readRowsAndCount()) };
  await toggleCurrentDocOnly(false);
  const noDim60 = {
    ...(await readRowsAndCount()),
    empty: (await has(SEL.notesEmpty)) || (await has(SEL.searchEmpty)) || (await has(SEL.chapterEmpty)) || (await has(".notes-filtered-empty")),
    texts: await rowTextSet(),
  };
  record("notes-search", { phase: "empty-matrix", chapterRange: chapterRange60, chapterEmpty: chapterEmpty60, currentOnly: currentOnly60, docEmpty: docEmpty60, noDim: noDim60 }, [
    ...(chapterRange60.rows === 2 && chapterRange60.countText === "本章 2 条 / 共 4 条"
      ? []
      : [`清空查询后（章节过滤生效）异常：${JSON.stringify(chapterRange60)}`]),
    ...(chapterEmpty60.text === "本章暂无笔记" ? [] : [`章节空态文案异常：${chapterEmpty60.text}`]),
    ...(chapterEmpty60.countText === "本章 0 条 / 共 2 条" ? [] : [`章节空态计数异常：${chapterEmpty60.countText}`]),
    ...(currentOnly60.countText === "当前 1 条 / 共 2 条" ? [] : [`清除章节过滤后计数异常：${currentOnly60.countText}`]),
    ...(docEmpty60.text === "当前文档暂无笔记" ? [] : [`文档空态文案异常：${docEmpty60.text}`]),
    ...(docEmpty60.countText === "当前 0 条 / 共 1 条" ? [] : [`文档空态计数异常：${docEmpty60.countText}`]),
    ...(noDim60.rows === 1 && !noDim60.empty ? [] : [`关开关后应 1 行且无空态：${JSON.stringify(noDim60)}`]),
    ...(noDim60.texts.length === 1 && noDim60.texts[0] === seedNotes()[2].text
      ? []
      : [`关开关后应只剩跨文档条目：${JSON.stringify(noDim60.texts)}`]),
  ]);

  // --- 60-8 空白查询 ----------------------------------------------------------
  log("60-8 空白查询：不算搜索生效（独立复位）");
  await enterNotesProbe();
  await setSearch("   ");
  const blank60 = await searchProbe();
  record("notes-search", { phase: "blank-query", ...blank60 }, [
    ...(blank60.clearInDom === false ? [] : ["空白查询不应渲染清空按钮"]),
    ...(blank60.rows === 4 ? [] : [`空白查询应全量可见：${blank60.rows}`]),
    ...(blank60.countText === "共 4 条" ? [] : [`空白查询计数异常：${blank60.countText}`]),
  ]);
  await setSearch("");

  // --- 60-9 删空最后一条 + 摘录回位（N64-7）-----------------------------------
  log("60-9 删空最后一条 + 摘录回位（独立复位）");
  await enterNotesProbe();
  await setSearch("Table 2 reports");
  await deleteRowByText("Table 2 repo");
  const d1_60 = await readRowsAndCount();
  await setSearch("稀疏注意力");
  await deleteRowByText("结论：稀疏注意力");
  const d2_60 = await readRowsAndCount();
  await setSearch("Reproducibility");
  await deleteRowByText("Section 4. Reproducibility");
  const d3_60 = await readRowsAndCount();
  await setSearch("消融");
  await deleteRowByText("We study retrieval");
  const empty60 = {
    ...(await readRowsAndCount()),
    empty: await has(SEL.notesEmpty),
    searchInDom: await has(SEL.searchInput),
    sortInDom: await has(SEL.sortBtn),
  };
  await excerptFirstSpan();
  // N73-2b：反馈态在入库引发的同文本 selectionchange 之后保持可见（不重置 mode / 不清 feedback / 不重算几何 / 不重开计时器）；
  // 本条随后追加逐字反馈断言（A1–A3，需求档 N73-2 的【离屏·追加】原字面）。
  const feedbackStart60 = Date.now();
  const feedback60a = await waitFeedbackOk(1500);
  const feedbackWaitMs60 = Date.now() - feedbackStart60;
  await sleep(400); // 拦 ~1 ms 闪现造成的假绿
  const feedback60b = await quickAskStateProbe();
  const excerpted60 = await searchProbe();
  record("notes-search", { phase: "delete-all-then-excerpt", steps: [d1_60, d2_60, d3_60], empty: empty60, excerpted: excerpted60, excerptFeedback: { waitMs: feedbackWaitMs60, first: feedback60a, after400ms: feedback60b } }, [
    ...(d1_60.countText === "命中 0 条 / 共 3 条" ? [] : [`第 1 步计数异常：${d1_60.countText}`]),
    ...(d2_60.countText === "命中 0 条 / 共 2 条" ? [] : [`第 2 步计数异常：${d2_60.countText}`]),
    ...(d3_60.countText === "命中 0 条 / 共 1 条" ? [] : [`第 3 步计数异常：${d3_60.countText}`]),
    ...(empty60.countText === "命中 0 条 / 共 0 条" ? [] : [`删空后计数异常：${empty60.countText}`]),
    ...(empty60.empty ? [] : ["删空后应渲染 .notes-empty"]),
    ...(empty60.searchInDom === false && empty60.sortInDom === false ? [] : ["无笔记时搜索/排序行不得渲染"]),
    ...(excerpted60.value === "消融" ? [] : [`摘录后查询应保留原串：${excerpted60.value}`]),
    ...(excerpted60.rows === 0 ? [] : [`摘录后应 0 命中：${excerpted60.rows}`]),
    ...(excerpted60.countText === "命中 0 条 / 共 1 条" ? [] : [`摘录后计数异常：${excerpted60.countText}`]),
    ...(excerpted60.emptyText === "没有匹配「消融」的笔记" ? [] : [`摘录后空态文案异常：${excerpted60.emptyText}`]),
    // A1–A3（N73-2b）：反馈态必须在入库引发的同文本 selectionchange 之后保持可见
    ...(String(feedback60a.feedbackClass).includes("is-ok") && feedback60a.display !== null && feedback60a.display !== "none"
      ? [] : [`摘录后浮层未停在反馈态：${JSON.stringify(feedback60a)}`]),
    ...(feedback60a.feedbackText === "已摘录 · 第 1 页" ? [] : [`摘录反馈文本异常：${JSON.stringify(feedback60a)}`]),
    ...(String(feedback60b.feedbackClass).includes("is-ok") && feedback60b.feedbackText === "已摘录 · 第 1 页"
      ? [] : [`摘录反馈未保持（+400 ms 复采）：${JSON.stringify(feedback60b)}`]),
  ]);
  await setSearch("");
  await restoreStandardSeed();

  // --- 62 排序 -----------------------------------------------------------------
  log("62-1 默认按页码排序");
  const seed62 = seedNotes();
  await enterNotesProbe(seed62);
  await capturePage(win, "62b-notes-sort-default.png");
  const btn62 = await sortButtonProbe();
  const group62 = await currentGroupProbe();
  const heads62 = await groupHeads();
  const order62 = group62 ? group62.map((row) => row.text) : [];
  record("notes-sort", { phase: "default", button: btn62, group: order62, heads: heads62 }, [
    ...(btn62 && btn62.text === "排序：页码" ? [] : [`排序按钮文案异常：${JSON.stringify(btn62)}`]),
    ...(btn62 && btn62.title === "当前按页码排序，点击改为「最新优先」" ? [] : [`排序按钮 title 异常：${JSON.stringify(btn62)}`]),
    ...(JSON.stringify(order62) === JSON.stringify([seed62[0].text, seed62[1].text, seed62[3].text])
      ? []
      : [`当前文档组行序异常：${JSON.stringify(order62)}`]),
    ...(JSON.stringify(heads62.map((head) => head.title)) === JSON.stringify(["sample-paper.pdf", "archive/older-paper.pdf"])
      ? []
      : [`组头序异常：${JSON.stringify(heads62.map((head) => head.title))}`]),
    ...(JSON.stringify(heads62.map((head) => head.count)) === JSON.stringify(["共 3 条", "共 1 条"])
      ? []
      : [`组计数异常：${JSON.stringify(heads62.map((head) => head.count))}`]),
  ]);

  log("62-2 切到「最新优先」");
  const hash62 = notesHash();
  await js(`document.querySelector(${JSON.stringify(SEL.sortBtn)}).click(), true`);
  const latest62 = { btn: await sortButtonProbe(), group: await currentGroupProbe(), heads: await groupHeads() };
  await capturePage(win, "62-notes-sort-latest.png");
  const latestOrder62 = latest62.group ? latest62.group.map((row) => row.text) : [];
  record("notes-sort", { phase: "created", button: latest62.btn, group: latestOrder62, heads: latest62.heads, hashSame: notesHash() === hash62 }, [
    ...(latest62.btn && latest62.btn.text === "排序：最新" ? [] : [`排序按钮文案异常：${JSON.stringify(latest62.btn)}`]),
    ...(latest62.btn && latest62.btn.title === "当前按最新优先排序，点击改为「页码」" ? [] : [`排序按钮 title 异常：${JSON.stringify(latest62.btn)}`]),
    ...(JSON.stringify(latestOrder62) === JSON.stringify([seed62[3].text, seed62[1].text, seed62[0].text])
      ? []
      : [`最新优先组内顺序异常：${JSON.stringify(latestOrder62)}`]),
    ...(JSON.stringify(latest62.heads.map((head) => head.title)) === JSON.stringify(heads62.map((head) => head.title))
      ? []
      : ["排序不得改变组顺序"]),
    ...(JSON.stringify(latest62.heads.map((head) => head.count)) === JSON.stringify(heads62.map((head) => head.count))
      ? []
      : ["排序不得改变组计数"]),
    ...(notesHash() === hash62 ? [] : ["排序不得改写 notes.json"]),
  ]);
  await js(`document.querySelector(${JSON.stringify(SEL.sortBtn)}).click(), true`);
  const back62 = await sortButtonProbe();
  record("notes-sort", { phase: "back-to-page", button: back62 }, [
    ...(back62 && back62.text === "排序：页码" ? [] : ["再点一次应回到页码排序"]),
  ]);

  log("62-3 排序 × 搜索：可见集合不变");
  await setSearch("稀疏注意力");
  const search62 = await readRowsAndCount();
  await js(`document.querySelector(${JSON.stringify(SEL.sortBtn)}).click(), true`);
  const searchCreated62 = await readRowsAndCount();
  await js(`document.querySelector(${JSON.stringify(SEL.sortBtn)}).click(), true`);
  await setSearch("");
  record("notes-sort", { phase: "with-search", page: search62, created: searchCreated62 }, [
    ...(search62.rows === 1 && searchCreated62.rows === 1 ? [] : [`两种排序下行数都应为 1：${search62.rows}/${searchCreated62.rows}`]),
    ...(search62.countText === "命中 1 条 / 共 4 条" && searchCreated62.countText === "命中 1 条 / 共 4 条"
      ? []
      : [`搜索计数异常：${search62.countText}/${searchCreated62.countText}`]),
  ]);

  log("62-4 排序 × 章节过滤：可见集合不变、组内顺序变化");
  await ensureMapOpen();
  await waitFor("地图行就绪", `document.querySelectorAll(".map-row").length === 7`);
  await clickMapBadge("2. Method Overview");
  await waitChapterFilter("章节：2. Method Overview · 第 2 页", 2);
  const groupsBefore62 = await countOf(".notes-group");
  const setBefore62 = await rowTextSet();
  await js(`document.querySelector(${JSON.stringify(SEL.sortBtn)}).click(), true`);
  const setAfter62 = await rowTextSet();
  const createdOrder62 = await currentGroupProbe();
  await js(`document.querySelector(${JSON.stringify(SEL.sortBtn)}).click(), true`);
  record("notes-sort", { phase: "with-chapter", groups: groupsBefore62, before: setBefore62, after: setAfter62, order: createdOrder62 ? createdOrder62.map((row) => row.text) : [] }, [
    ...(groupsBefore62 === 1 ? [] : [`章节过滤后组数异常：${groupsBefore62}`]),
    ...(JSON.stringify([...setBefore62].sort()) === JSON.stringify([...setAfter62].sort()) ? [] : ["排序不得改可见集合"]),
    ...(createdOrder62 && createdOrder62[0].text === seed62[3].text ? [] : ["最新优先下组内首行应为 n-current-3"]),
  ]);

  log("62-5 导出与注入顺序：排序不参与注入");
  await js(`document.querySelector(".notes-export-btn").click(), true`);
  await waitFor("导出提示", `document.querySelector(".notes-export-row .export-text")`);
  const exportText62 = await textOf(".notes-export-row .export-text");
  await js(`document.querySelector(${JSON.stringify(SEL.chapterFilterClear)}).click(), true`);
  await waitFor("过滤条消失", `!document.querySelector(${JSON.stringify(SEL.chapterFilter)})`);
  await waitFor("回 4 行", `document.querySelectorAll(".note-row").length === 4`);
  await js(`document.querySelector(${JSON.stringify(SEL.sortBtn)}).click(), true`);
  await clickInRow(seed62[0].text, ".note-select-wrap");
  await clickInRow(seed62[3].text, ".note-select-wrap");
  await waitFor("已选 2 条", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.indexOf("已选 2 条") >= 0; })()`);
  await js(`document.querySelector(".notes-ask-btn").click(), true`);
  await clearSendCalls();
  await typeAndSend("62：排序不改注入顺序");
  await runTurn("62：排序不改注入顺序", "排序注入回答");
  await waitSendCalls(1);
  const send62 = await lastSend();
  const message62 = send62 ? send62.message : "";
  record("notes-sort", { phase: "export-and-injection", exportText: exportText62, hasBoth: message62.includes(seed62[0].text) && message62.includes(seed62[3].text), orderOk: message62.indexOf(seed62[0].text) < message62.indexOf(seed62[3].text) }, [
    ...(exportText62 === "已导出 4 条 → .pix-read/notes.md" ? [] : [`导出提示异常：${exportText62}`]),
    ...(message62.includes(seed62[0].text) && message62.includes(seed62[3].text) ? [] : ["注入载荷应同时含两条"]),
    ...(message62.indexOf(seed62[0].text) < message62.indexOf(seed62[3].text)
      ? []
      : ["注入顺序应为 doc→page→createdAt，与屏幕顺序相反"]),
  ]);
  await js(`document.querySelector(".notes-selection-clear").click(), true`);

  log("62-6 文档切换保留、离开复位");
  await backToLibraryTab();
  await openRow("older-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 2);
  await openNotesPanel(4);
  const switch62 = await sortButtonProbe();
  await goHome();
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(5);
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await openNotesPanel(4);
  const home62 = await sortButtonProbe();
  record("notes-sort", { phase: "scope", afterDocSwitch: switch62, afterReenter: home62 }, [
    ...(switch62 && switch62.text === "排序：最新" ? [] : [`切文档应保留排序：${JSON.stringify(switch62)}`]),
    ...(home62 && home62.text === "排序：页码" ? [] : [`重进工作区应复位排序：${JSON.stringify(home62)}`]),
  ]);
  await restoreStandardSeed();

  // --- 63 撤销 -----------------------------------------------------------------
  log("63-1 删除即落盘 + 撤销行");
  const seed63 = seedNotes();
  await enterNotesProbe(seed63);
  const hashBefore63 = notesHash();
  const idsBefore63 = readNotes().map((note) => note.id);
  await deleteRowByText("Table 2 repo");
  const undo63 = await undoSnapshot();
  await capturePage(win, "63-notes-undo.png");
  const afterDelete63 = { ids: readNotes().map((note) => note.id), rows: await countOf(SEL.noteRow), hashChanged: notesHash() !== hashBefore63 };
  record("notes-undo", { phase: "delete", undo: undo63, file: afterDelete63 }, [
    ...(afterDelete63.ids.indexOf("n-current-2") < 0 ? [] : ["文件里该 id 应已消失"]),
    ...(afterDelete63.hashChanged ? [] : ["删除应即时落盘"]),
    ...(undo63.rowCount === 1 ? [] : [`撤销行数量应为 1：${undo63.rowCount}`]),
    ...(undo63.text === "已删除「Table 2 repo…」· 第 2 页" ? [] : [`撤销行文案异常：${undo63.text}`]),
    ...(undo63.btnText === "撤销" && undo63.btnTitle === "还原这条笔记" ? [] : [`撤销按钮异常：${undo63.btnText}/${undo63.btnTitle}`]),
    ...(afterDelete63.rows === 3 ? [] : [`删除后应 3 行：${afterDelete63.rows}`]),
  ]);

  log("63-2 撤销：行回位 + 字节回复 + 成功通知");
  await clickUndo();
  await waitFor("成功通知", `document.querySelector(".notes-notice.is-success")`);
  const order63 = await undoOrder();
  const restored63 = {
    rows: await countOf(SEL.noteRow),
    notice: await textOf(".notes-notice.is-success"),
    undoRowCount: (await undoSnapshot()).rowCount,
    order: order63,
    hashSame: notesHash() === hashBefore63,
    ids: readNotes().map((note) => note.id),
    createdAt: (readNotes().find((note) => note.id === "n-current-2") || {}).createdAt,
  };
  await capturePage(win, "63b-notes-undo-restored.png");
  await closeNotice();
  record("notes-undo", { phase: "restore", ...restored63, seedCreatedAt: seed63[1].createdAt }, [
    ...(restored63.rows === 4 ? [] : [`还原后应回 4 行：${restored63.rows}`]),
    ...(restored63.notice === "已还原该条笔记" ? [] : [`成功通知异常：${restored63.notice}`]),
    ...(restored63.undoRowCount === 0 ? [] : ["还原成功后撤销行应消失"]),
    ...(order63.hasNotice ? [] : ["成功路径应渲染通知（撤销行已收）"]),
    ...(restored63.hashSame ? [] : ["还原应逐字节回复删除前"]),
    ...(JSON.stringify(restored63.ids) === JSON.stringify(idsBefore63) ? [] : [`文件 id 序列应回复：${JSON.stringify(restored63.ids)}`]),
    ...(restored63.createdAt === seed63[1].createdAt ? [] : ["updatedAt/createdAt 不得被刷新"]),
  ]);

  log("63-3 还原后参与三维过滤");
  await setSearch("Table 2");
  const search63 = await readRowsAndCount();
  await setSearch("");
  await ensureMapOpen();
  await waitFor("地图行就绪", `document.querySelectorAll(".map-row").length === 7`);
  await clickMapBadge("1. Abstract");
  await waitChapterFilter("章节：1. Abstract · 第 1 页", 1);
  const abstract63 = { group: await currentGroupProbe(), count: await textOf(".notes-count"), rows: await countOf(SEL.noteRow) };
  const noEmpty63 = { chapterEmpty: await has(SEL.chapterEmpty), filteredEmpty: await has(".notes-filtered-empty") };
  await js(`document.querySelector(${JSON.stringify(SEL.chapterFilterClear)}).click(), true`);
  await waitFor("清除后回 4 行", `!document.querySelector(${JSON.stringify(SEL.chapterFilter)}) && document.querySelectorAll(".note-row").length === 4`);
  const cleared63 = await readRowsAndCount();
  record("notes-undo", { phase: "three-dimensions", search: search63, abstract: abstract63, noEmpty: noEmpty63, cleared: cleared63 }, [
    ...(search63.rows === 1 ? [] : [`搜索命中异常：${search63.rows}`]),
    ...(abstract63.rows === 1 && abstract63.group && abstract63.group[0].text === seed63[0].text
      ? []
      : [`1. Abstract 章节应只剩 n-current-1：${JSON.stringify(abstract63)}`]),
    ...(abstract63.count === "本章 1 条 / 共 4 条" ? [] : [`章节计数异常：${abstract63.count}`]),
    ...(noEmpty63.chapterEmpty === false && noEmpty63.filteredEmpty === false ? [] : ["非空列表不得渲染空态元素"]),
    ...(cleared63.rows === 4 && cleared63.countText === "共 4 条" ? [] : [`清除后异常：${JSON.stringify(cleared63)}`]),
  ]);

  log("63-4 撤销与选择集：删除清选择、还原回选择");
  await clickInRow("Table 2 reports", ".note-select-wrap");
  await waitFor("已选 1 条", `(() => { const el = document.querySelector(".notes-selection-count"); return !!el && el.textContent.indexOf("已选 1 条") >= 0; })()`);
  await deleteRowByText("Table 2 repo");
  const selDelete63 = { countText: await textOf(".notes-selection-count"), bar: await has(".notes-selection-bar") };
  await clickUndo();
  await waitFor("成功通知", `document.querySelector(".notes-notice.is-success")`);
  const selRestore63 = { countText: await textOf(".notes-selection-count"), chip: (await chipSnapshot()).notesLabel };
  await closeNotice();
  await clearSendCalls();
  await typeAndSend("63：还原后注入");
  await runTurn("63：还原后注入", "还原注入回答");
  await waitSendCalls(1);
  const send63 = await lastSend();
  record("notes-undo", { phase: "selection", afterDelete: selDelete63, afterRestore: selRestore63, injected: !!send63 && send63.message.includes(seed63[1].text) }, [
    ...(selDelete63.bar === false ? [] : [`删除后选择条应消失：${JSON.stringify(selDelete63)}`]),
    ...(selRestore63.countText === "已选 1 条" ? [] : [`撤销后应回选择：${selRestore63.countText}`]),
    ...(selRestore63.chip === "摘录 1 条" ? [] : [`撤销后 chip 异常：${selRestore63.chip}`]),
    ...(send63 && send63.message.includes(seed63[1].text) ? [] : ["注入载荷应含还原条目"]),
  ]);
  await js(`document.querySelector(".notes-selection-clear").click(), true`);
  await waitFor("选择清空", `!document.querySelector(".notes-selection-bar")`);

  log("63-5 连删两条：行数量恒 1、文案为后一条");
  await deleteRowByText("We study retrieval");
  const first63_5 = await undoSnapshot();
  await deleteRowByText("Table 2 repo");
  const second63_5 = await undoSnapshot();
  await capturePage(win, "63c-notes-undo-consecutive.png");
  await clickUndo();
  await waitFor("成功通知", `document.querySelector(".notes-notice.is-success")`);
  const after63_5 = { ids: readNotes().map((note) => note.id), rows: await countOf(SEL.noteRow) };
  await closeNotice();
  record("notes-undo", { phase: "consecutive", first: first63_5, second: second63_5, after: after63_5 }, [
    ...(first63_5.rowCount === 1 && second63_5.rowCount === 1 ? [] : [`撤销行数量应恒 1：${first63_5.rowCount}/${second63_5.rowCount}`]),
    ...(first63_5.text === "已删除「We study ret…」· 第 1 页" ? [] : [`第一次文案异常：${first63_5.text}`]),
    ...(second63_5.text === "已删除「Table 2 repo…」· 第 2 页" ? [] : [`第二次文案异常：${second63_5.text}`]),
    ...(after63_5.ids.indexOf("n-current-1") < 0 ? [] : ["n-current-1 不应被还原"]),
    ...(after63_5.ids.indexOf("n-current-2") >= 0 ? [] : ["n-current-2 应被还原"]),
    ...(after63_5.rows === 3 ? [] : [`还原后应 3 行：${after63_5.rows}`]),
  ]);

  log("63-6 撤销成功后再删同一条");
  await restoreStandardSeed();
  const hash63_6 = notesHash();
  await deleteRowByText("Table 2 repo");
  const firstRow63_6 = await undoSnapshot();
  await clickUndo();
  await waitFor("第一次成功通知", `document.querySelector(".notes-notice.is-success")`);
  await closeNotice();
  const firstRestore63_6 = { hashSame: notesHash() === hash63_6, rows: await countOf(SEL.noteRow) };
  await deleteRowByText("Table 2 repo");
  const secondRow63_6 = await undoSnapshot();
  await clickUndo();
  await waitFor("第二次成功通知", `document.querySelector(".notes-notice.is-success")`);
  await closeNotice();
  const secondRestore63_6 = { hashSame: notesHash() === hash63_6, rows: await countOf(SEL.noteRow) };
  record("notes-undo", { phase: "repeat", firstRow: firstRow63_6, firstRestore: firstRestore63_6, secondRow: secondRow63_6, secondRestore: secondRestore63_6 }, [
    ...(firstRow63_6.rowCount === 1 && secondRow63_6.rowCount === 1 ? [] : ["两轮都应出现新的撤销行"]),
    ...(firstRestore63_6.hashSame && firstRestore63_6.rows === 4 ? [] : [`第一轮还原异常：${JSON.stringify(firstRestore63_6)}`]),
    ...(secondRestore63_6.hashSame && secondRestore63_6.rows === 4 ? [] : [`第二轮还原异常：${JSON.stringify(secondRestore63_6)}`]),
  ]);

  log("63-7 写失败可重试");
  await setRestoreFailure("write-failed");
  await deleteRowByText("Table 2 repo");
  await clickUndo();
  await waitFor("失败通知", `document.querySelector(".notes-notice.is-error")`);
  const fail63_7 = { notice: await textOf(".notes-notice.is-error"), undo: await undoSnapshot(), rows: await countOf(SEL.noteRow) };
  await closeNotice();
  await setRestoreFailure(null);
  await clickUndo();
  await waitFor("成功通知", `document.querySelector(".notes-notice.is-success")`);
  const retry63_7 = { undo: await undoSnapshot(), rows: await countOf(SEL.noteRow) };
  await closeNotice();
  record("notes-undo", { phase: "write-failure-retry", failure: fail63_7, retry: retry63_7 }, [
    ...(fail63_7.notice === "撤销失败：笔记写入失败" ? [] : [`写失败文案异常：${fail63_7.notice}`]),
    ...(fail63_7.undo.rowCount === 1 ? [] : ["写失败后撤销行应保留"]),
    ...(fail63_7.rows === 3 ? [] : [`写失败后行数不应变：${fail63_7.rows}`]),
    ...(retry63_7.undo.rowCount === 0 ? [] : ["恢复后重试应成功收行"]),
    ...(retry63_7.rows === 4 ? [] : [`恢复后应回 4 行：${retry63_7.rows}`]),
  ]);

  log("63-8 撤销行与过滤无关（独立复位）");
  await enterNotesProbe();
  const hash63_8 = notesHash();
  await deleteRowByText("Table 2 repo");
  await setSearch("zzz");
  const hidden63_8 = { probe: await searchProbe(), undo: await undoSnapshot() };
  await clickUndo();
  await waitFor("成功通知", `document.querySelector(".notes-notice.is-success")`);
  const after63_8 = { rows: (await readRowsAndCount()).rows, hashSame: notesHash() === hash63_8, undoRowCount: (await undoSnapshot()).rowCount };
  await closeNotice();
  await setSearch("");
  const cleared63_8 = await readRowsAndCount();
  record("notes-undo", { phase: "filter-independent", hidden: hidden63_8, afterUndo: after63_8, cleared: cleared63_8 }, [
    ...(hidden63_8.probe.rows === 0 && hidden63_8.probe.emptyText === "没有匹配「zzz」的笔记"
      ? []
      : [`查询下应 0 行 + 搜索空态：${JSON.stringify(hidden63_8.probe)}`]),
    ...(hidden63_8.undo.rowCount === 1 && hidden63_8.undo.text === "已删除「Table 2 repo…」· 第 2 页"
      ? []
      : [`撤销行应仍在且文案为该条：${JSON.stringify(hidden63_8.undo)}`]),
    ...(after63_8.rows === 0 ? [] : [`还原后仍应 0 行（查询仍生效）：${after63_8.rows}`]),
    ...(after63_8.hashSame ? [] : ["还原应回复删除前字节"]),
    ...(after63_8.undoRowCount === 0 ? [] : ["成功还原后撤销行应消失"]),
    ...(cleared63_8.rows === 4 ? [] : [`清空查询后应回 4 行：${cleared63_8.rows}`]),
  ]);

  // --- 64 过期与行生命周期 -------------------------------------------------------
  log("64 过期窗口：5s 后点撤销不发 IPC");
  await enterNotesProbe();
  await deleteRowByText("Table 2 repo");
  const hash64 = notesHash();
  const calls64 = (await restoreCalls()).count;
  await sleep(5200);
  const row64 = await undoSnapshot();
  await capturePage(win, "64-notes-undo-expired.png");
  await clickUndo();
  await waitFor("过期通知", `document.querySelector(".notes-notice.is-error")`);
  const expired64 = {
    notice: await textOf(".notes-notice.is-error"),
    undoRowCount: (await undoSnapshot()).rowCount,
    callsDelta: (await restoreCalls()).count - calls64,
    hashSame: notesHash() === hash64,
    rows: await countOf(SEL.noteRow),
  };
  await closeNotice();
  record("notes-undo", { phase: "expired", rowBefore: row64.rowCount, ...expired64 }, [
    ...(row64.rowCount === 1 ? [] : ["5.2s 时撤销行应仍在 DOM（8s 窗口）"]),
    ...(expired64.notice === "撤销失败：撤销窗口已过期（超过 5 秒），笔记未能还原" ? [] : [`过期文案异常：${expired64.notice}`]),
    ...(expired64.undoRowCount === 0 ? [] : ["过期后撤销行应立即消失"]),
    ...(expired64.callsDelta === 0 ? [] : [`过期分支不得发 IPC：+${expired64.callsDelta}`]),
    ...(expired64.hashSame ? [] : ["过期失败不得写盘"]),
    ...(expired64.rows === 3 ? [] : [`过期后行数异常：${expired64.rows}`]),
  ]);

  log("64b 行到期 + 重挂不复活");
  await deleteRowByText("We study retrieval");
  await sleep(8200);
  const gone64b = await undoSnapshot();
  await backToLibraryTab();
  await openNotesPanel(2);
  const remount64b = await undoSnapshot();
  await capturePage(win, "64b-notes-undo-row-gone.png");
  record("notes-undo", { phase: "row-expired", beforeRemount: gone64b.rowCount, afterRemount: remount64b.rowCount, rows: await countOf(SEL.noteRow) }, [
    ...(gone64b.rowCount === 0 ? [] : ["8s 后撤销行应自动消失"]),
    ...(remount64b.rowCount === 0 ? [] : ["重挂载不得复活撤销行"]),
    ...((await countOf(SEL.noteRow)) === 2 ? [] : ["行数应为 2（64 删 1 + 64b 删 1）"]),
  ]);
  await restoreStandardSeed();

  log("64c 槽失效：没有可撤销的删除");
  await deleteRowByText("Table 2 repo");
  const hash64c = notesHash();
  await clearSlot();
  await clickUndo();
  await waitFor("失败通知", `document.querySelector(".notes-notice.is-error")`);
  const fail64c = { notice: await textOf(".notes-notice.is-error"), undo: await undoSnapshot(), rows: await countOf(SEL.noteRow), hashSame: notesHash() === hash64c, order: await undoOrder() };
  await closeNotice();
  record("notes-undo", { phase: "slot-cleared", ...fail64c }, [
    ...(fail64c.notice === "撤销失败：没有可撤销的删除" ? [] : [`无槽文案异常：${fail64c.notice}`]),
    ...(fail64c.hashSame ? [] : ["槽失效不得写盘"]),
    ...(fail64c.rows === 3 ? [] : [`槽失效后行数不应变：${fail64c.rows}`]),
    ...(fail64c.undo.rowCount === 1 ? [] : ["失败后撤销行应保留"]),
    ...(fail64c.undo.btnDisabled === false ? [] : ["失败路径也必须复位 restoring"]),
    ...(fail64c.order.hasNotice && fail64c.order.noticeBefore ? [] : [`撤销行应在通知之后：${JSON.stringify(fail64c.order)}`]),
  ]);

  log("64c-2 同 id 占用：该笔记已重新存在");
  await enterNotesProbe();
  await deleteRowByText("Table 2 repo");
  const calls64c2 = (await restoreCalls()).count;
  await restoreStandardSeed();
  const hash64c2 = notesHash();
  const undo64c2 = await undoSnapshot();
  await clickUndo();
  await waitFor("失败通知", `document.querySelector(".notes-notice.is-error")`);
  const occ64c2 = { notice: await textOf(".notes-notice.is-error"), callsDelta: (await restoreCalls()).count - calls64c2, hashSame: notesHash() === hash64c2, rows: await countOf(SEL.noteRow), undo: await undoSnapshot() };
  await closeNotice();
  record("notes-undo", { phase: "same-id-occupied", before: undo64c2, ...occ64c2 }, [
    ...(undo64c2.rowCount === 1 ? [] : ["清槽发生在 64c、本场景自带新槽"]),
    ...(occ64c2.notice === "撤销失败：该笔记已重新存在，无法撤销" ? [] : [`同 id 占用文案异常：${occ64c2.notice}`]),
    ...(occ64c2.callsDelta === 1 ? [] : [`应恰发 1 次 IPC：+${occ64c2.callsDelta}`]),
    ...(occ64c2.hashSame ? [] : ["invalid-input 不得写盘"]),
    ...(occ64c2.rows === 4 ? [] : [`占用失败后行数应保持 4：${occ64c2.rows}`]),
    ...(occ64c2.undo.rowCount === 1 ? [] : ["失败后撤销行应保留"]),
  ]);

  log("64d 在途防重复：1 次 IPC + 新行按钮可用");
  await enterNotesProbe();
  const hash64d = notesHash();
  const calls64d = (await restoreCalls()).count;
  await setRestoreDelay(400);
  await deleteRowByText("Table 2 repo");
  await clickUndo();
  const inFlight64d = await undoSnapshot();
  await clickUndo();
  await waitFor("撤销行消失", `!document.querySelector(${JSON.stringify(SEL.undoRow)})`);
  const done64d = { rows: await countOf(SEL.noteRow), hashSame: notesHash() === hash64d, callsDelta: (await restoreCalls()).count - calls64d };
  await deleteRowByText("结论：稀疏注意力");
  const freshRow64d = await undoSnapshot();
  await setRestoreDelay(0);
  await restoreStandardSeed();
  record("notes-undo", { phase: "in-flight", inFlight: inFlight64d, done: done64d, fresh: freshRow64d }, [
    ...(inFlight64d.btnDisabled === true ? [] : ["在途按钮应 disabled"]),
    ...(done64d.callsDelta === 1 ? [] : [`在途连点应只发 1 次 IPC：+${done64d.callsDelta}`]),
    ...(done64d.rows === 4 && done64d.hashSame ? [] : [`在途撤销结果异常：${JSON.stringify(done64d)}`]),
    ...(freshRow64d.rowCount === 1 && freshRow64d.btnDisabled === false ? [] : ["新行按钮不应 disabled（restoring 已复位）"]),
  ]);

  log("64e 新删除介入：stale 零副作用");
  await enterNotesProbe();
  await setRestoreDelay(1200);
  await deleteRowByText("Table 2 repo");
  await clickUndo();
  await deleteRowByText("We study retrieval");
  await sleep(1800);
  const stale64e = { undo: await undoSnapshot(), rows: await countOf(SEL.noteRow), texts: await rowTextSet(), notice: await notesNotice(), file: readNotes().map((note) => note.id) };
  await setRestoreDelay(0);
  await restoreStandardSeed();
  record("notes-undo", { phase: "stale-interleave", ...stale64e }, [
    ...(stale64e.undo.rowCount === 1 && stale64e.undo.text === "已删除「We study ret…」· 第 1 页"
      ? []
      : [`撤销行应仍是 n-current-1 的文案：${JSON.stringify(stale64e.undo)}`]),
    ...(stale64e.rows === 3 ? [] : [`行数应为 3：${stale64e.rows}`]),
    ...(stale64e.texts.length === 3 && stale64e.texts.indexOf("We study retrieval over long documents where the attention budget is the binding constraint.") < 0
      ? []
      : [`迟到响应不得复活 n-current-1：${JSON.stringify(stale64e.texts)}`]),
    ...(stale64e.notice === null || (!stale64e.notice.text.includes("已还原该条笔记") && !stale64e.notice.text.includes("撤销失败："))
      ? []
      : [`stale 必须零副作用：${JSON.stringify(stale64e.notice)}`]),
    ...(stale64e.undo.btnDisabled === false ? [] : ["stale 后按钮必须复位"]),
    ...(stale64e.file.indexOf("n-current-1") < 0 && stale64e.file.indexOf("n-current-2") >= 0
      ? []
      : [`真实 FIFO 落盘结果异常：${JSON.stringify(stale64e.file)}`]),
  ]);

  // --- 65 复制（修订 9：先 show + focus）--------------------------------------
  log("65-0 复制前置：显示窗口并获焦");
  win.show();
  win.focus();
  win.webContents.focus();
  await waitFor("窗口获得焦点", "document.hasFocus()", 15000);
  // 清空系统剪贴板：让「复制是否真的写入」有确定基线（不依赖上一次运行遗留）
  clipboard.clear();
  const focused65 = await js("document.hasFocus()");
  record("notes-copy", { phase: "focus", hasFocus: focused65 }, [
    ...(focused65 === true ? [] : ["离屏窗口未获焦：复制链路判据不可达（不得静默通过）"]),
  ]);

  log("65-1 单条复制：剪贴板逐字 + 已复制反馈");
  await enterNotesProbe();
  const hash65 = notesHash();
  const pageBefore65 = await pageLabel();
  const clipBefore65 = clipboard.readText();
  await clickCopyByText("Table 2 reports");
  const clip65 = await readClipboardChange(clipBefore65, "65-1 剪贴板写入");
  const copyProbe65 = await rowCopyProbe("Table 2 reports");
  await capturePage(win, "65-note-copy-feedback.png");
  const pageAfter65 = await pageLabel();
  record("notes-copy", { phase: "copy-one", clipboard: clip65, clipboardNormalized: normalizeClipboard(clip65), button: copyProbe65, pageBefore: pageBefore65, pageAfter: pageAfter65, hashSame: notesHash() === hash65 }, [
    ...(normalizeClipboard(clip65) === COPY_SAMPLE_1 ? [] : [`剪贴板逐字不符：${JSON.stringify(clip65)}`]),
    ...(copyProbe65 && copyProbe65.text === "已复制" && copyProbe65.copied && copyProbe65.title === "已复制"
      ? []
      : [`反馈态异常：${JSON.stringify(copyProbe65)}`]),
    ...(pageAfter65 === pageBefore65 ? [] : ["复制不得触发跳回原文"]),
    ...(notesHash() === hash65 ? [] : ["复制是只读动作"]),
  ]);

  log("65-2 反馈 1.2s 后回位");
  await sleep(1400);
  const reverted65 = await rowCopyProbe("Table 2 reports");
  record("notes-copy", { phase: "feedback-reset", button: reverted65 }, [
    ...(reverted65 && reverted65.text === "复制" && reverted65.copied === false && reverted65.title === "复制为 Markdown"
      ? []
      : [`反馈回位异常：${JSON.stringify(reverted65)}`]),
  ]);

  log("65-3 两段连续复制：片段模板与唯一反馈态");
  const clipBefore65b = clipboard.readText();
  await clickCopyByText("结论：稀疏注意力");
  const clip65b = await readClipboardChange(clipBefore65b, "65-3 第二段写入");
  await clickCopyByText("Reproducibility");
  const clip65c = await readClipboardChange(clip65b, "65-3 第三段写入");
  const feedback65b = await js(`(() => {
    const copied = Array.from(document.querySelectorAll(".note-copy.is-copied"));
    const row = copied[0] ? copied[0].closest(".note-row") : null;
    const text = row ? row.querySelector(".note-text") : null;
    return { count: copied.length, rowText: text ? text.textContent : null };
  })()`);
  await capturePage(win, "65b-note-copy-fragment.png");
  log(`65-3 片段（AI 结论）：${JSON.stringify(clip65b)}`);
  log(`65-3 片段（跨文档）：${JSON.stringify(clip65c)}`);
  record("notes-copy", { phase: "two-fragments", first: clip65b, second: clip65c, feedback: feedback65b }, [
    ...(normalizeClipboard(clip65b) === COPY_SAMPLE_2 ? [] : [`第二段逐字不符：${JSON.stringify(clip65b)}`]),
    ...(normalizeClipboard(clip65c) === COPY_SAMPLE_3 ? [] : [`第三段逐字不符：${JSON.stringify(clip65c)}`]),
    ...(feedback65b.count === 1 ? [] : [`反馈态数量应恒 1：${feedback65b.count}`]),
    ...(feedback65b.rowText === "Section 4. Reproducibility: all runs use three seeds and report the median."
      ? []
      : ["反馈态应属最后点击的行"]),
  ]);

  log("65-4 两条链路都失败：非静默错误提示");
  await js(`(() => {
    window.__pixOrigWriteText = Clipboard.prototype.writeText;
    window.__pixOrigExecCommand = Document.prototype.execCommand;
    Clipboard.prototype.writeText = function () { return Promise.reject(new Error("injected")); };
    Document.prototype.execCommand = function () { return false; };
    return true;
  })()`);
  await clickCopyByText("Table 2 reports");
  await waitFor("复制失败提示", `document.querySelector(".notes-notice.is-error")`);
  const fail65 = { notice: await textOf(".notes-notice.is-error"), button: await rowCopyProbe("Table 2 reports"), hashSame: notesHash() === hash65, clipboardUnchanged: clipboard.readText() === clip65c };
  await capturePage(win, "65c-note-copy-failure.png");
  await js(`(() => {
    Clipboard.prototype.writeText = window.__pixOrigWriteText;
    Document.prototype.execCommand = window.__pixOrigExecCommand;
    return true;
  })()`);
  await closeNotice();
  record("notes-copy", { phase: "failure", ...fail65 }, [
    ...(fail65.notice === "复制失败：无法访问剪贴板" ? [] : [`失败文案异常：${fail65.notice}`]),
    ...(fail65.button && fail65.button.text === "复制" && fail65.button.copied === false ? [] : [`失败不得置反馈态：${JSON.stringify(fail65.button)}`]),
    ...(fail65.hashSame ? [] : ["复制不得写盘"]),
    ...(fail65.clipboardUnchanged ? [] : ["失败路径不得改写剪贴板"]),
  ]);

  log("65-5 行内动作几何");
  const geo65 = await js(`(() => {
    const row = ${rowFinder("Table 2 reports", false)};
    if (!row) return null;
    const actions = row.querySelector(".note-actions");
    const body = row.querySelector(".note-body");
    const copy = row.querySelector(".note-copy");
    const wrap = row.querySelector(".note-ask-wrap");
    const ask = row.querySelector(".note-ask");
    const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right }; };
    return {
      copyBeforeAsk: !!(copy && wrap && (copy.compareDocumentPosition(wrap) & 4) === 4),
      copyBox: copy ? box(copy) : null,
      askBox: ask ? box(ask) : null,
      actionsBox: actions ? box(actions) : null,
      bodyBox: body ? box(body) : null,
      actionsOverflow: actions ? actions.scrollWidth - actions.clientWidth : null,
      lastChild: body ? body.lastElementChild.className : null,
    };
  })()`);
  record("notes-copy", { phase: "geometry", ...geo65 }, [
    ...(geo65 && geo65.copyBeforeAsk ? [] : [".note-copy 应在 .note-ask-wrap 之前"]),
    ...(geo65 && geo65.copyBox && geo65.askBox && Math.abs(geo65.copyBox.y - geo65.askBox.y) <= 1
      ? []
      : ["复制与追问应在同一行"]),
    ...(geo65 && geo65.bodyBox && geo65.actionsBox && Math.abs(geo65.bodyBox.right - geo65.actionsBox.right) <= 2
      ? []
      : ["动作区应右对齐"]),
    ...(geo65 && geo65.actionsOverflow <= 1 ? [] : ["动作区不得换行/溢出"]),
    ...(geo65 && geo65.lastChild === "note-actions" ? [] : [".note-actions 应仍是 .note-body 最后一个子节点"]),
  ]);

  // ===========================================================================
  // R11 收口（N73-1 / N73-2 / N74）：新增场景一律追加在末尾，每个场景自带复位，
  // 不引用其它场景的局部变量；既有场景 / label / 截图名零改动。
  // ===========================================================================

  // --- r11-1 / r11-2：笔记搜索框内的 Esc 不得越界（组 r11-esc-scope）-----------
  log("r11-1 笔记搜索框内的 Esc 不关闭 PDF 搜索面板");
  await enterNotesProbe();
  const hashR11 = notesHash();
  await js(`(() => {
    const btn = document.querySelector(${JSON.stringify(SEL.pdfSearchBtn)});
    if (!btn) throw new Error("pdf search button not found");
    btn.click();
    return true;
  })()`);
  await waitFor("PDF 搜索面板", `document.querySelector(${JSON.stringify(SEL.pdfSearchPanel)})`);
  await setSearch("Table");
  const probeR11a = await searchProbe();
  await pressSearchEsc();
  const probeR11b = await searchProbe();
  const panelInDomR11 = await has(SEL.pdfSearchPanel);
  await capturePage(win, "r11-1-esc-pdf-search-panel.png");
  record(
    "r11-esc-scope",
    { phase: "pdf-search-open", before: probeR11a, after: probeR11b, panelInDom: panelInDomR11, hashSame: notesHash() === hashR11 },
    [
      ...(probeR11a.focused === true ? [] : [`Esc 前输入框应获焦（空断言防护）：${JSON.stringify(probeR11a)}`]),
      ...(panelInDomR11 === true ? [] : ["笔记搜索框内的 Esc 不得关闭 PDF 搜索面板"]),
      ...(probeR11b.value === "" ? [] : [`Esc 后查询应为空：${probeR11b.value}`]),
      ...(probeR11b.focused === false ? [] : ["Esc 后输入框应失焦"]),
      ...(probeR11b.rows === 4 ? [] : [`Esc 后行数应为 4：${probeR11b.rows}`]),
      ...(probeR11b.countText === "共 4 条" ? [] : [`Esc 后计数异常：${probeR11b.countText}`]),
      ...(notesHash() === hashR11 ? [] : ["Esc 不得改写 notes.json"]),
    ],
  );

  log("r11-1 对照：body 上的 Esc 仍关闭 PDF 搜索面板");
  await pressBodyEsc();
  await waitFor("PDF 搜索面板关闭", `!document.querySelector(${JSON.stringify(SEL.pdfSearchPanel)})`);
  const panelGoneR11 = await has(SEL.pdfSearchPanel);
  record("r11-esc-scope", { phase: "pdf-search-close-control", panelInDom: panelGoneR11 }, [
    ...(panelGoneR11 === false ? [] : ["body 上的 Esc 应关闭 PDF 搜索面板（阅读区既有语义不得改坏）"]),
  ]);

  log("r11-2 笔记搜索框内的 Esc 不退出框选模式");
  await enterNotesProbe();
  const hashR11b = notesHash();
  const layerPreR11b = await has(SEL.captureLayer);
  if (!layerPreR11b) {
    await js(`(() => {
      const btn = document.querySelector(${JSON.stringify(SEL.captureFabBtn)});
      if (!btn) throw new Error("capture fab button not found");
      btn.click();
      return true;
    })()`);
  }
  await waitFor("框选层", `document.querySelector(${JSON.stringify(SEL.captureLayer)})`);
  const captureState = () => js(`(() => {
    const viewer = document.querySelector(${JSON.stringify(SEL.pdfViewer)});
    return {
      layerInDom: !!document.querySelector(${JSON.stringify(SEL.captureLayer)}),
      viewerCapture: !!viewer && viewer.classList.contains("capture-mode"),
    };
  })()`);
  const entryR11b = await captureState();
  await setSearch("Table");
  const probeR11c = await searchProbe();
  await pressSearchEsc();
  const probeR11d = await searchProbe();
  const afterR11b = await captureState();
  await capturePage(win, "r11-2-esc-capture-mode.png");
  record(
    "r11-esc-scope",
    {
      phase: "capture-mode",
      entry: entryR11b,
      before: probeR11c,
      after: probeR11d,
      layerInDom: afterR11b.layerInDom,
      viewerCapture: afterR11b.viewerCapture,
      hashSame: notesHash() === hashR11b,
    },
    [
      ...(entryR11b.layerInDom === true && entryR11b.viewerCapture === true ? [] : [`进入框选模式失败（空断言防护）：${JSON.stringify(entryR11b)}`]),
      ...(probeR11c.focused === true ? [] : [`Esc 前输入框应获焦（空断言防护）：${JSON.stringify(probeR11c)}`]),
      ...(afterR11b.layerInDom === true ? [] : ["笔记搜索框内的 Esc 不得退出框选模式（.capture-layer 应仍在 DOM）"]),
      ...(afterR11b.viewerCapture === true ? [] : ["笔记搜索框内的 Esc 不得移除 .pdf-viewer 的 capture-mode 类"]),
      ...(probeR11d.value === "" ? [] : [`Esc 后查询应为空：${probeR11d.value}`]),
      ...(probeR11d.focused === false ? [] : ["Esc 后输入框应失焦"]),
      ...(probeR11d.rows === 4 ? [] : [`Esc 后行数应为 4：${probeR11d.rows}`]),
      ...(notesHash() === hashR11b ? [] : ["Esc 不得改写 notes.json"]),
    ],
  );

  log("r11-2 对照：body 上的 Esc 仍退出框选模式");
  await setSearch("");
  await pressBodyEsc();
  await waitFor("退出框选模式", `!document.querySelector(${JSON.stringify(SEL.captureLayer)})`);
  const exitR11b = await captureState();
  record("r11-esc-scope", { phase: "capture-mode-exit-control", layerInDom: exitR11b.layerInDom, viewerCapture: exitR11b.viewerCapture, hashSame: notesHash() === hashR11b }, [
    ...(exitR11b.layerInDom === false ? [] : ["body 上的 Esc 应退出框选模式（阅读区既有语义不得改坏）"]),
    ...(exitR11b.viewerCapture === false ? [] : [".pdf-viewer 不应再含 capture-mode"]),
    ...(notesHash() === hashR11b ? [] : ["Esc 不得改写 notes.json"]),
  ]);

  // --- r15-f18：框选失败保留模式 + 提示（R15-F18）--------------------------------
  log("r15-f18 框选：无可截内容时保留模式并提示；正常拖拽仍退出并给出截图 chip");
  const captureProbeR15 = () => js(`(() => {
    const viewer = document.querySelector(${JSON.stringify(SEL.pdfViewer)});
    const fab = document.querySelector(${JSON.stringify(SEL.captureFabBtn)});
    return {
      layerInDom: !!document.querySelector(${JSON.stringify(SEL.captureLayer)}),
      errorHint: !!document.querySelector(".capture-error-hint"),
      viewerCapture: !!viewer && viewer.classList.contains("capture-mode"),
      fabPressed: fab ? fab.getAttribute("aria-pressed") : null,
    };
  })()`);
  const chipTextsR15 = () => js(`Array.from(document.querySelectorAll(".attachment-chip")).map((el) => el.textContent.replace(/\\s+/g, " ").trim())`);
  /** 合成指针拖拽：起点/终点都在第 1 页画布内（clientX/clientY 由画布矩形推出，不依赖真实鼠标）。
   *  setPointerCapture 对合成事件可能抛 NotFoundError：状态在抛错前已置位，后续 pointerup 仍能收敛。 */
  const dragOnPageOneR15 = (fraction) => js(`(() => {
    const layer = document.querySelector(${JSON.stringify(SEL.captureLayer)});
    const canvas = document.querySelector('.pdf-page[data-page="1"] canvas');
    if (!layer || !canvas) throw new Error("capture layer / page canvas not found");
    const layerRect = layer.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const x1 = canvasRect.left + canvasRect.width * ${fraction};
    const y1 = canvasRect.top + canvasRect.height * ${fraction};
    const fire = (type, x, y) => layer.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 7,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
    }));
    fire("pointerdown", x1, y1);
    fire("pointermove", x1 + 120, y1 + 80);
    fire("pointerup", x1 + 120, y1 + 80);
    return { withinLayer: x1 + 120 <= layerRect.right && y1 + 80 <= layerRect.bottom, x1: Math.round(x1), y1: Math.round(y1) };
  })()`);
  const clickElR15 = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click(), true`);
  const enterCaptureR15 = async () => {
    if (!(await has(SEL.captureLayer))) await clickElR15(SEL.captureFabBtn);
    await waitFor("框选层就绪", `document.querySelector(${JSON.stringify(SEL.captureLayer)})`);
  };
  await enterCaptureR15();
  await waitFor(
    "第 1 页画布已渲染",
    `(() => { const c = document.querySelector('.pdf-page[data-page="1"] canvas'); return !!c && c.width > 0 && c.height > 0; })()`,
  );
  const zeroedCanvasR15 = await js(`(() => {
    const canvas = document.querySelector('.pdf-page[data-page="1"] canvas');
    if (!canvas) throw new Error("page canvas not found");
    window.__pixR15CanvasSize = { width: canvas.width, height: canvas.height };
    canvas.width = 0;
    canvas.height = 0;
    return { width0: canvas.width, height0: canvas.height, saved: window.__pixR15CanvasSize };
  })()`);
  const dragFailR15 = await dragOnPageOneR15(0.3);
  await sleep(200);
  const failStateR15 = await captureProbeR15();
  await capturePage(win, "r15-f18-capture-failure.png");
  record("r15-capture-region", { phase: "failure-keeps-mode", canvas: zeroedCanvasR15, drag: dragFailR15, ...failStateR15 }, [
    ...(zeroedCanvasR15.saved.width > 0 && zeroedCanvasR15.saved.height > 0 ? [] : [`置零前画布本应有尺寸（防空断言）：${JSON.stringify(zeroedCanvasR15)}`]),
    ...(dragFailR15.withinLayer === true ? [] : [`拖拽终点必须在框选层内（防空断言）：${JSON.stringify(dragFailR15)}`]),
    ...(failStateR15.layerInDom === true ? [] : ["失败时必须保留框选模式（.capture-layer 应仍在 DOM）"]),
    ...(failStateR15.errorHint === true ? [] : ["失败时应出现 .capture-error-hint 提示"]),
    ...(failStateR15.viewerCapture === true ? [] : [".pdf-viewer 应仍含 capture-mode"]),
    ...(failStateR15.fabPressed === "true" ? [] : [`框选按钮应仍激活：${failStateR15.fabPressed}`]),
  ]);
  const restoredCanvasR15 = await js(`(() => {
    const canvas = document.querySelector('.pdf-page[data-page="1"] canvas');
    const size = window.__pixR15CanvasSize;
    canvas.width = size.width;
    canvas.height = size.height;
    return { width: canvas.width, height: canvas.height };
  })()`);
  const dragOkR15 = await dragOnPageOneR15(0.5);
  await waitFor("框选退出（成功后）", `!document.querySelector(${JSON.stringify(SEL.captureLayer)})`);
  await waitFor(
    "截图 chip",
    `Array.from(document.querySelectorAll(".attachment-chip")).some((el) => (el.textContent || "").includes("截图 1"))`,
  );
  const okStateR15 = { layerInDom: await has(SEL.captureLayer), chips: await chipTextsR15(), errorHint: await has(".capture-error-hint") };
  await capturePage(win, "r15-f18-capture-success.png");
  record("r15-capture-region", { phase: "success-exits", canvas: restoredCanvasR15, drag: dragOkR15, ...okStateR15 }, [
    ...(restoredCanvasR15.width > 0 && restoredCanvasR15.height > 0 ? [] : [`还原后画布应有尺寸（防空断言）：${JSON.stringify(restoredCanvasR15)}`]),
    ...(okStateR15.layerInDom === false ? [] : ["成功后应退出框选模式（.capture-layer 应离开 DOM）"]),
    ...(okStateR15.chips.some((text) => text.includes("截图 1")) ? [] : [`composer 应出现「截图 1」chip：${JSON.stringify(okStateR15.chips)}`]),
  ]);
  // 收尾：移除截图 chip，恢复发送态的初值（后续相位会断言发送载荷）。
  await js(`(() => {
    const chip = Array.from(document.querySelectorAll(".attachment-chip")).find((el) => (el.textContent || "").includes("截图 1"));
    if (chip) {
      const remove = chip.querySelector(".attachment-remove");
      if (remove) remove.click();
    }
    return true;
  })()`);
  await waitFor("截图 chip 已移除", `!Array.from(document.querySelectorAll(".attachment-chip")).some((el) => (el.textContent || "").includes("截图 1"))`);

  // --- r11-3：面板滚动不再吞掉摘录反馈（组 r11-quick-ask-scroll-scope）----------
  log("r11-3 摘录反馈不被面板滚动吞掉 + 阅读区滚动仍隐藏");
  await enterNotesProbe([], 0);
  // F2：0 条时 openNotesPanel(0) 的等待式恒真 ⇒ 必须显式有界等待空态就绪，再核对空断言防护
  await waitFor(
    "笔记空态就绪（.notes-empty 在 DOM、无搜索行、0 行）",
    `document.querySelector(${JSON.stringify(SEL.notesEmpty)}) && !document.querySelector(${JSON.stringify(SEL.searchInput)}) && document.querySelectorAll(${JSON.stringify(SEL.noteRow)}).length === 0`,
  );
  await selectPageSpan(1);
  const beforeExcerpt11c = readNotes().length;
  await js(`(() => {
    const buttons = Array.from(document.querySelectorAll(".quick-ask-btn"));
    const target = buttons.find((el) => (el.textContent || "").includes("摘录"));
    if (!target) throw new Error("excerpt button not found");
    target.click();
    return true;
  })()`);
  const deadline11c = Date.now() + 20000;
  for (;;) {
    if (readNotes().length === beforeExcerpt11c + 1) break;
    if (Date.now() > deadline11c) throw new Error(`等待超时：摘录入库（notes.json 条数未从 ${beforeExcerpt11c} 增加）`);
    await sleep(120);
  }
  const hashAfterExcerpt11c = notesHash();
  await waitFor("摘录后面板回位", `document.querySelector(${JSON.stringify(SEL.searchInput)})`);
  // 相位 1 → 相位 2 之间不得插入 sleep、不得重拍截图（2500 ms 反馈窗口）
  const feedbackStart11c = Date.now();
  const feedback11c = await waitFeedbackOk(1500);
  const rows11c = await readRowsAndCount();
  const searchInDom11c = await has(SEL.searchInput);
  await capturePage(win, "r11-3-excerpt-feedback-visible.png");
  record(
    "r11-quick-ask-scroll-scope",
    { phase: "excerpt-into-empty-panel", rows: rows11c.rows, searchInDom: searchInDom11c, quickAsk: feedback11c, waitMs: Date.now() - feedbackStart11c },
    [
      ...(searchInDom11c === true && rows11c.rows === 1 ? [] : [`面板应从空态切到列表：${JSON.stringify(rows11c)}`]),
      ...(feedback11c.display !== null && feedback11c.display !== "none" ? [] : [`浮层应可见：${JSON.stringify(feedback11c)}`]),
      ...(feedback11c.feedbackText === "已摘录 · 第 1 页" && String(feedback11c.feedbackClass).includes("is-ok")
        ? []
        : [`反馈态异常：${JSON.stringify(feedback11c)}`]),
    ],
  );

  log("r11-3 面板滚动不隐藏浮层");
  await js(`(() => {
    const panel = document.querySelector(${JSON.stringify(SEL.notesPanel)});
    if (!panel) throw new Error("notes panel not found");
    panel.dispatchEvent(new Event("scroll"));
    return true;
  })()`);
  const afterPanelScroll11c = await quickAskProbe();
  const elapsedSinceFeedback11c = Date.now() - feedbackStart11c;
  const fileCount11c = readNotes().length;
  record(
    "r11-quick-ask-scroll-scope",
    { phase: "notes-panel-scroll", quickAsk: afterPanelScroll11c, fileCount: fileCount11c, hashSame: notesHash() === hashAfterExcerpt11c, elapsedSinceFeedbackMs: elapsedSinceFeedback11c },
    [
      ...(afterPanelScroll11c.display !== null && afterPanelScroll11c.display !== "none" ? [] : [`面板滚动不得隐藏浮层：${JSON.stringify(afterPanelScroll11c)}`]),
      ...(afterPanelScroll11c.feedbackText === "已摘录 · 第 1 页" ? [] : [`反馈文本异常：${JSON.stringify(afterPanelScroll11c)}`]),
      ...(fileCount11c === 1 && notesHash() === hashAfterExcerpt11c ? [] : [`滚动不得改数据：${fileCount11c}`]),
    ],
  );

  log("r11-3 阅读区滚动仍隐藏浮层（对照）");
  let scroll11c = await stageScrollProbe();
  let zoomClicks11c = 0;
  while (scroll11c.scrollHeight <= scroll11c.clientHeight + 40 && zoomClicks11c < 40) {
    const percent = Number(String(scroll11c.scaleText || "").replace("%", ""));
    if (Number.isFinite(percent) && percent >= 300) break; // MAX_SCALE = 3
    await js(`(() => {
      const btn = document.querySelector(${JSON.stringify(SEL.zoomInBtn)});
      if (!btn) throw new Error("zoom-in button not found");
      btn.click();
      return true;
    })()`);
    zoomClicks11c += 1;
    await repaint(win);
    scroll11c = await stageScrollProbe();
  }
  const beforeScrollQuickAsk11c = await quickAskProbe();
  const scrollTopBefore11c = scroll11c.scrollTop;
  await js(`(() => {
    const el = document.querySelector(${JSON.stringify(SEL.pdfScroll)});
    if (!el) throw new Error("pdf scroll container not found");
    el.scrollTop = 200;
    return true;
  })()`);
  await waitFor(
    "阅读区滚动后浮层隐藏",
    `(() => { const el = document.querySelector(${JSON.stringify(SEL.quickAsk)}); return !el || getComputedStyle(el).display === "none"; })()`,
  );
  const scrollAfter11c = await stageScrollProbe();
  const afterReaderScroll11c = await quickAskProbe();
  record(
    "r11-quick-ask-scroll-scope",
    {
      phase: "reader-scroll-control",
      scroll: { before: scrollTopBefore11c, after: scrollAfter11c.scrollTop, scrollHeight: scroll11c.scrollHeight, clientHeight: scroll11c.clientHeight, scrollHeightAfterZoom: scrollAfter11c.scrollHeight },
      zoom: { text: scroll11c.scaleText, clicks: zoomClicks11c },
      quickAskBeforeScroll: beforeScrollQuickAsk11c,
      quickAskAfterScroll: afterReaderScroll11c,
      fileCount: fileCount11c,
      hashSame: notesHash() === hashAfterExcerpt11c,
    },
    [
      ...(scroll11c.scrollHeight > scroll11c.clientHeight + 40 ? [] : [`阅读区放大到上限仍不可滚动（不得降级为跳过）：${JSON.stringify(scroll11c)}`]),
      ...(beforeScrollQuickAsk11c.display !== null && beforeScrollQuickAsk11c.display !== "none"
        ? []
        : [`放大不得使反馈消失（否则下文是假绿）：${JSON.stringify(beforeScrollQuickAsk11c)}`]),
      ...(scrollAfter11c.scrollTop > 0 && scrollAfter11c.scrollTop !== scrollTopBefore11c
        ? []
        : [`阅读区未真实滚动（空断言防护）：before=${scrollTopBefore11c} after=${scrollAfter11c.scrollTop}`]),
      ...(afterReaderScroll11c.display === "none" ? [] : [`阅读区滚动应隐藏浮层（既有语义不得放松）：${JSON.stringify(afterReaderScroll11c)}`]),
      ...(fileCount11c === 1 && notesHash() === hashAfterExcerpt11c ? [] : ["滚动不得改数据"]),
    ],
  );

  // --- r11-3 相位 4（N73-2b）：同一文本的 selectionchange 不得重置摘录反馈 ---------
  log("r11-3 相位 4：同文本 selectionchange 后反馈保持（N73-2b）");
  await focusPage(2); // 该滚动会隐藏浮层 —— 既有语义，故必须在选区之前
  await selectPageSpan(2);
  // 修复轮.5 入口前置：前序相位（reader-scroll-control 的放大与 scrollTop 赋值）留下的迟到
  // scroll 必须先静默再开始观测窗，否则它会在窗口内按既有语义隐藏浮层（把环境噪声记成产品行为）。
  const preQuietP4 = await ensureQuickAskExcerptReady(2);
  log(`r11-3 相位 4 入口前置：ok=${preQuietP4.ok} attempts=${preQuietP4.attempts} quiet=${JSON.stringify(preQuietP4.quiet)}${preQuietP4.ok ? "" : ` trail=${JSON.stringify(preQuietP4.trail)}`}`);
  await excerptViaQuickAsk();
  const hashAfterExcerpt11c4 = notesHash();
  const t0P4 = Date.now();
  const watchT0P4 = await stageScrollWatchProbe();
  const feedbackP4 = await waitFeedbackOk(1500);
  const waitMsP4 = Date.now() - t0P4;
  while (Date.now() - t0P4 < 900) await sleep(60); // 可判别性下限：派发必须落在反馈窗口的靠后位置
  const dispatchAtMsP4 = Date.now() - t0P4;
  const beforeDispatchP4 = await quickAskStateProbe();
  const watchDispatchP4 = await stageScrollWatchProbe();
  const selectionBeforeP4 = await selectionProbe();
  const spanText2P4 = await pageSpanText(2);
  await js(`document.dispatchEvent(new Event("selectionchange")), true`); // 不改选区：同文本的冗余事件
  await repaint(win);
  const afterDispatchP4 = await quickAskStateProbe();
  await capturePage(win, "r11-3b-feedback-after-spurious-selectionchange.png");
  await sleep(600); // < FEEDBACK_MS = 2500
  const after600P4 = await quickAskStateProbe();
  const watchAfter600P4 = await stageScrollWatchProbe();
  const goneP4 = await waitFeedbackCleared(t0P4 + 2500 + 700 - Date.now());
  const feedbackGoneAtMsP4 = goneP4.at - t0P4;
  const watchResampleP4 = await stageScrollWatchProbe();
  // 修复轮.5：观测窗 [t0, 复采] 的阅读区滚动读数（窗口内计数增加 ⇒ 环境噪声，独立判红）
  const stageScrollP4 = {
    t0: watchT0P4,
    dispatch: watchDispatchP4,
    after600ms: watchAfter600P4,
    resample: watchResampleP4,
    windowCount: watchResampleP4.count - watchT0P4.count,
    windowLastEventMs: watchResampleP4.lastAt === null ? null : watchResampleP4.lastAt - t0P4,
    sinceLastEventAtT0Ms: watchT0P4.lastAt === null ? null : t0P4 - watchT0P4.lastAt,
  };
  const fileCountP4 = readNotes().length;
  const selectionAfterP4 = await selectionProbe();
  record(
    "r11-quick-ask-scroll-scope",
    {
      phase: "spurious-selectionchange",
      waitMs: waitMsP4,
      dispatchAtMs: dispatchAtMsP4,
      feedbackGoneAtMs: feedbackGoneAtMsP4,
      feedbackAfterExcerpt: feedbackP4,
      before: beforeDispatchP4,
      afterDispatch: afterDispatchP4,
      after600ms: after600P4,
      atExpiry: goneP4.probe,
      selectionBefore: selectionBeforeP4,
      selectionAfter: selectionAfterP4,
      spanText2: spanText2P4,
      fileCount: fileCountP4,
      hashSame: notesHash() === hashAfterExcerpt11c4,
      stageScroll: stageScrollP4,
      preQuiet: preQuietP4,
    },
    [
      // 修复轮.5 前置（独立文案，不混入 B/C 判据）：观测窗入口必须先静默（超时 = 前置失败），
      // 且 t0 前 quietMs 内不得再有阅读区滚动（否则窗口起点已不可判）。
      ...(preQuietP4.ok ? [] : [`环境噪声：观测窗入口前置不成立（${preQuietP4.attempts} 次静默 + 可摘录态复核均未通过，末次静默=${JSON.stringify(preQuietP4.quiet)}）`]),
      ...(preQuietP4.ok && (stageScrollP4.sinceLastEventAtT0Ms === null || stageScrollP4.sinceLastEventAtT0Ms >= preQuietP4.quiet.quietMs)
        ? [] : [`环境噪声：观测窗开始前 ${preQuietP4.quiet.quietMs} ms 内有阅读区滚动（距上次 = ${stageScrollP4.sinceLastEventAtT0Ms} ms）`]),
      // 修复轮.5 窗口判据（独立文案）：窗口内计数增加 ⇒ 环境噪声（不放松 B1/B2/B3 的语义判据）
      ...(stageScrollP4.windowCount === 0
        ? [] : [`环境噪声：窗口内发生阅读区滚动（${stageScrollP4.windowCount} 次，最近一次 = t0${stageScrollP4.windowLastEventMs >= 0 ? "+" : ""}${stageScrollP4.windowLastEventMs} ms，scrollTop t0=${watchT0P4.scrollTop} 复采=${watchResampleP4.scrollTop}）`]),
      // B1 前置 / 防空：反馈态可见 + 「同文本」现场成立 + 派发时刻可判别
      ...(String(beforeDispatchP4.feedbackClass).includes("is-ok") && beforeDispatchP4.feedbackText === "已摘录 · 第 2 页" && beforeDispatchP4.display !== "none"
        ? [] : [`派发前应为反馈态：${JSON.stringify(beforeDispatchP4)}`]),
      ...(selectionBeforeP4.collapsed === false && selectionBeforeP4.anchorInStage === true && selectionBeforeP4.text === spanText2P4
        ? [] : [`「同文本」现场不成立：${JSON.stringify(selectionBeforeP4)} spanText2=${spanText2P4}`]),
      ...(dispatchAtMsP4 >= 900 && dispatchAtMsP4 < 2100 ? [] : [`派发时刻越界（可判别性下限 / 反馈窗口）：${dispatchAtMsP4}`]),
      // B2 派发后立即：仍为反馈态且动作行未渲染
      ...(String(afterDispatchP4.feedbackClass).includes("is-ok") && afterDispatchP4.feedbackText === "已摘录 · 第 2 页" && afterDispatchP4.display !== "none" && afterDispatchP4.btnCount === 0
        ? [] : [`同文本 selectionchange 不得重置反馈：${JSON.stringify(afterDispatchP4)}`]),
      // B3 再等 600 ms（< FEEDBACK_MS）后仍为反馈态
      ...(String(after600P4.feedbackClass).includes("is-ok") && after600P4.feedbackText === "已摘录 · 第 2 页" && after600P4.display !== "none" && after600P4.btnCount === 0
        ? [] : [`反馈未保持（+600 ms 复采）：${JSON.stringify(after600P4)}`]),
      // B4 独立前置（修复轮.5）：派发前与 +600 ms 复采时刻都必须处于反馈态，否则该条为空断言
      ...(String(beforeDispatchP4.feedbackClass).includes("is-ok") && String(after600P4.feedbackClass).includes("is-ok")
        ? [] : [`B4 前置不成立（派发前与复采时刻均须为反馈态）：before=${JSON.stringify(beforeDispatchP4)} after600ms=${JSON.stringify(after600P4)}`]),
      // B4 计时未被重置：下界 = 未被提前清掉；上界 = 早于被重置后的到期时刻
      ...(goneP4.probe.feedbackClass === null && feedbackGoneAtMsP4 >= 2500 - 600 && feedbackGoneAtMsP4 <= dispatchAtMsP4 + 2500 - 300
        ? [] : [`反馈计时被重置或提前清除：goneAt=${feedbackGoneAtMsP4} dispatchAt=${dispatchAtMsP4} probe=${JSON.stringify(goneP4.probe)}`]),
      // B5 到期后回落 actions 态且浮层仍在；数据不变
      ...(goneP4.probe.feedbackClass === null && goneP4.probe.btnCount === 4 && goneP4.probe.display !== "none" && fileCountP4 === 2 && notesHash() === hashAfterExcerpt11c4
        ? [] : [`到期后应回落 actions 态：${JSON.stringify(goneP4.probe)} fileCount=${fileCountP4}`]),
    ],
  );

  // --- r11-3 相位 5（N73-2b 对照组）：不同文本的 selectionchange 重置为 actions ----
  log("r11-3 相位 5：不同文本 selectionchange 重置为 actions（对照）");
  await focusPage(2); // 先读第 2 页现场（「不同文本」对照的前提）
  const spanText2P5 = await pageSpanText(2);
  await focusPage(3);
  await selectPageSpan(3);
  const spanText3P5 = await pageSpanText(3);
  // 修复轮.5 入口前置：同相位 4 —— focusPage / 选区引起的滚动先静默，再开始观测窗
  const preQuietP5 = await ensureQuickAskExcerptReady(3);
  log(`r11-3 相位 5 入口前置：ok=${preQuietP5.ok} attempts=${preQuietP5.attempts} quiet=${JSON.stringify(preQuietP5.quiet)}${preQuietP5.ok ? "" : ` trail=${JSON.stringify(preQuietP5.trail)}`}`);
  await excerptViaQuickAsk();
  const hashAfterExcerpt11c5 = notesHash();
  const t0P5 = Date.now();
  const watchT0P5 = await stageScrollWatchProbe();
  const feedbackP5 = await waitFeedbackOk(1500);
  const fileCountBeforeP5 = readNotes().length;
  await selectPageSpan(2); // 真实 DOM 选区变更（不同文本）+ 合成 selectionchange
  const watchDispatchP5 = await stageScrollWatchProbe();
  await repaint(win);
  const afterDifferentTextP5 = await quickAskStateProbe();
  const afterDifferentTextP5b = await quickAskStateProbe();
  const watchResampleP5 = await stageScrollWatchProbe();
  // 修复轮.5：观测窗 [t0, 复采] 的阅读区滚动读数（窗口内计数增加 ⇒ 环境噪声，独立判红）
  const stageScrollP5 = {
    t0: watchT0P5,
    dispatch: watchDispatchP5,
    resample: watchResampleP5,
    windowCount: watchResampleP5.count - watchT0P5.count,
    windowLastEventMs: watchResampleP5.lastAt === null ? null : watchResampleP5.lastAt - t0P5,
    sinceLastEventAtT0Ms: watchT0P5.lastAt === null ? null : t0P5 - watchT0P5.lastAt,
  };
  const selectionAfterP5 = await selectionProbe();
  const fileCountAfterP5 = readNotes().length;
  record(
    "r11-quick-ask-scroll-scope",
    {
      phase: "different-text-reset",
      feedbackBefore: feedbackP5,
      spanText2: spanText2P5,
      spanText3: spanText3P5,
      afterDifferentText: afterDifferentTextP5,
      afterDifferentTextRecheck: afterDifferentTextP5b,
      selectionAfter: selectionAfterP5,
      fileCount: fileCountAfterP5,
      hashSame: notesHash() === hashAfterExcerpt11c5,
      stageScroll: stageScrollP5,
      preQuiet: preQuietP5,
    },
    [
      // 修复轮.5 前置（独立文案，不混入 C 判据）：观测窗入口必须先静默（超时 = 前置失败），
      // 且 t0 前 quietMs 内不得再有阅读区滚动（否则窗口起点已不可判）。
      ...(preQuietP5.ok ? [] : [`环境噪声：观测窗入口前置不成立（${preQuietP5.attempts} 次静默 + 可摘录态复核均未通过，末次静默=${JSON.stringify(preQuietP5.quiet)}）`]),
      ...(preQuietP5.ok && (stageScrollP5.sinceLastEventAtT0Ms === null || stageScrollP5.sinceLastEventAtT0Ms >= preQuietP5.quiet.quietMs)
        ? [] : [`环境噪声：观测窗开始前 ${preQuietP5.quiet.quietMs} ms 内有阅读区滚动（距上次 = ${stageScrollP5.sinceLastEventAtT0Ms} ms）`]),
      // 修复轮.5 窗口判据（独立文案）：窗口内计数增加 ⇒ 环境噪声（不放松 C1–C4 的语义判据）
      ...(stageScrollP5.windowCount === 0
        ? [] : [`环境噪声：窗口内发生阅读区滚动（${stageScrollP5.windowCount} 次，最近一次 = t0${stageScrollP5.windowLastEventMs >= 0 ? "+" : ""}${stageScrollP5.windowLastEventMs} ms，scrollTop t0=${watchT0P5.scrollTop} 复采=${watchResampleP5.scrollTop}）`]),
      // C1 前置 / 防空：反馈态可见 + 文件 3 条 + 「不同文本」前提
      ...(String(feedbackP5.feedbackClass).includes("is-ok") && feedbackP5.feedbackText === "已摘录 · 第 3 页"
        ? [] : [`第 3 页摘录反馈异常：${JSON.stringify(feedbackP5)}`]),
      ...(fileCountBeforeP5 === 3 ? [] : [`前置文件应为 3 条：${fileCountBeforeP5}`]),
      ...(spanText2P5 !== null && spanText3P5 !== null && spanText3P5 !== spanText2P5
        ? [] : [`「不同文本」前提不成立：spanText2=${spanText2P5} spanText3=${spanText3P5}`]),
      // C2 派发后立即：反馈被重置（不同文本不得命中保态分支）
      ...(afterDifferentTextP5.feedbackClass === null && afterDifferentTextP5.feedbackText === null
        ? [] : [`不同文本应重置反馈：${JSON.stringify(afterDifferentTextP5)}`]),
      // C3 复采：浮层仍可见且回到 actions 态
      ...(afterDifferentTextP5b.display !== "none" && afterDifferentTextP5b.btnCount === 4
        ? [] : [`不同文本后应回到 actions 态：${JSON.stringify(afterDifferentTextP5b)}`]),
      // C4 选区与数据现场
      ...(selectionAfterP5.text === spanText2P5 && selectionAfterP5.collapsed === false && selectionAfterP5.anchorInStage === true
        ? [] : [`选区现场异常：${JSON.stringify(selectionAfterP5)} spanText2=${spanText2P5}`]),
      ...(fileCountAfterP5 === 3 && notesHash() === hashAfterExcerpt11c5 ? [] : [`派发不得改数据：${fileCountAfterP5}`]),
    ],
  );

  // --- r11-4：删空最后一条后撤销行仍在且撤销成功（组 r11-undo-after-empty）-------
  log("r11-4 删空最后一条后撤销行仍在且撤销成功");
  await enterNotesProbe(seedNotes().slice(0, 1), 1);
  const hashBefore11d = notesHash();
  const before11d = await readRowsAndCount();
  const emptyBefore11d = await has(SEL.notesEmpty);
  record("r11-undo-after-empty", { phase: "before-delete", rows: before11d.rows, countText: before11d.countText, emptyInDom: emptyBefore11d }, [
    ...(before11d.rows === 1 ? [] : [`前置应为 1 行：${before11d.rows}`]),
    ...(before11d.countText === "共 1 条" ? [] : [`前置计数异常：${before11d.countText}`]),
    ...(emptyBefore11d === false ? [] : ["1 行时 .notes-empty 不得在 DOM（空断言防护）"]),
  ]);

  await deleteRowByText("We study retrieval");
  const after11d = await readRowsAndCount();
  const emptyAfter11d = await notesEmptyProbe();
  const undoAfter11d = await undoSnapshot();
  await capturePage(win, "r11-4-undo-row-after-empty.png");
  record(
    "r11-undo-after-empty",
    { phase: "after-delete-empty", rows: after11d.rows, countText: after11d.countText, empty: emptyAfter11d, undo: undoAfter11d, hashChanged: notesHash() !== hashBefore11d },
    [
      ...(after11d.rows === 0 ? [] : [`删空后应 0 行：${after11d.rows}`]),
      ...(emptyAfter11d.inDom === true ? [] : [".notes-empty 应在 DOM"]),
      ...(emptyAfter11d.title === "还没有摘录" ? [] : [`.notes-empty .empty-title 文案异常：${emptyAfter11d.title}`]),
      ...(emptyAfter11d.subtitle === "在 PDF 中选中文字，点「摘录」保存到这里" ? [] : [`.notes-empty .empty-subtitle 文案异常：${emptyAfter11d.subtitle}`]),
      ...(after11d.countText === "共 0 条" ? [] : [`删空后计数异常：${after11d.countText}`]),
      ...(undoAfter11d.rowCount === 1 ? [] : [`.notes-undo 应仍在 DOM：${JSON.stringify(undoAfter11d)}`]),
      ...(undoAfter11d.text === "已删除「We study ret…」· 第 1 页" ? [] : [`撤销行文案异常：${undoAfter11d.text}`]),
      ...(undoAfter11d.btnText === "撤销" && undoAfter11d.btnTitle === "还原这条笔记" ? [] : [`撤销按钮异常：${JSON.stringify(undoAfter11d)}`]),
      ...(notesHash() !== hashBefore11d ? [] : ["删除应真实落盘"]),
    ],
  );

  await clickUndo();
  await waitFor("还原后行数回到 1", `document.querySelectorAll(${JSON.stringify(SEL.noteRow)}).length === 1`);
  // ⑭ 必须紧随 waitFor（撤销通知 4 s、撤销行 8 s）：中间不得插入 sleep
  const restored11d = {
    rows: await countOf(SEL.noteRow),
    emptyInDom: await has(SEL.notesEmpty),
    undoRowInDom: await has(SEL.undoRow),
    notice: await notesNotice(),
    searchInDom: await has(SEL.searchInput),
    hashSame: notesHash() === hashBefore11d,
  };
  record("r11-undo-after-empty", { phase: "restored", ...restored11d }, [
    ...(restored11d.rows === 1 ? [] : [`还原后应 1 行：${restored11d.rows}`]),
    ...(restored11d.emptyInDom === false ? [] : ["还原后 .notes-empty 应退出 DOM"]),
    ...(restored11d.undoRowInDom === false ? [] : ["还原后 .notes-undo 应退出 DOM"]),
    ...(restored11d.notice && restored11d.notice.isSuccess && restored11d.notice.text === "已还原该条笔记" ? [] : [`通知异常：${JSON.stringify(restored11d.notice)}`]),
    ...(restored11d.hashSame ? [] : ["还原后文件字节应回复删除前"]),
    ...(restored11d.searchInDom === true ? [] : ["还原后 .notes-search 行应回到 DOM"]),
  ]);
  await restoreStandardSeed();

  // --- r11-5：左栏 220px 下动作区不溢出（组 r11-note-actions-narrow）-------------
  log("r11-5 左栏 220px 下 .note-actions 不溢出（M4 判定表）");
  await enterNotesProbe(seedNotes().slice(0, 2), 2);
  const rowData11e = (row) => ({
    scrollOverflow: row.scrollOverflow,
    actionsLeft: row.actions ? row.actions.left : null,
    actionsRight: row.actions ? row.actions.right : null,
    actionsHeight: row.actions ? row.actions.h : null,
    bodyLeft: row.body ? row.body.left : null,
    copyLeft: row.copy ? row.copy.left : null,
    copyRight: row.copy ? row.copy.right : null,
    askWrapLeft: row.askWrap ? row.askWrap.left : null,
    askWrapRight: row.askWrap ? row.askWrap.right : null,
    copyY: row.copy ? row.copy.y : null,
    askWrapY: row.askWrap ? row.askWrap.y : null,
    dom: row.dom,
  });
  const widthOk11e = (probe) => Math.abs(probe.leftWidth - 268) <= 2;
  const default11e = await narrowProbe();
  record("r11-note-actions-narrow", { phase: "default-width", layoutLeftWidth: default11e.leftWidth, rows: default11e.rows.map(rowData11e) }, [
    ...(widthOk11e(default11e) ? [] : [`.layout-left 默认宽应为 268±2：${default11e.leftWidth}`]),
    ...(default11e.rows.every((row) => row.scrollOverflow !== null && row.scrollOverflow <= 1)
      ? []
      : [`默认宽度下动作区不得溢出：${JSON.stringify(default11e.rows.map((row) => row.scrollOverflow))}`]),
  ]);

  await js(`document.documentElement.style.setProperty("--pix-left-width", "220px"), true`);
  await repaint(win);
  const narrow11e = await narrowProbe();
  await capturePage(win, "r11-5-note-actions-narrow.png", await rectOfSelector(SEL.layoutLeft, 2));
  await capturePage(win, "r11-5b-note-actions-narrow-row.png", await rectOfSelector(SEL.noteRow, 2));
  const threshold11e = narrow11e.threshold;
  record(
    "r11-note-actions-narrow",
    { phase: "narrow-220", layoutLeftWidth: narrow11e.leftWidth, threshold: threshold11e, rows: narrow11e.rows.map(rowData11e) },
    [
      ...(narrow11e.leftWidth >= 218 && narrow11e.leftWidth <= 222 ? [] : [`窄宽未生效（空断言防护）：${narrow11e.leftWidth}`]),
      ...(narrow11e.rows.every((row) => row.scrollOverflow !== null && row.scrollOverflow <= 1)
        ? []
        : [`动作区 end 侧溢出：${JSON.stringify(narrow11e.rows.map((row) => row.scrollOverflow))}`]),
      ...(narrow11e.rows.every((row) => row.actions && row.body && row.actions.left >= row.body.left - 1)
        ? []
        : [`动作区 start 侧越界：${JSON.stringify(narrow11e.rows.map((row) => ({ a: row.actions && row.actions.left, b: row.body && row.body.left })))}`]),
      ...(narrow11e.rows.every(
        (row) => row.actions && row.copy && row.askWrap && row.copy.left >= row.actions.left - 1 && row.askWrap.left >= row.actions.left - 1,
      )
        ? []
        : [`动作区内子元素 start 侧越界：${JSON.stringify(narrow11e.rows.map((row) => ({ copy: row.copy && row.copy.left, ask: row.askWrap && row.askWrap.left, a: row.actions && row.actions.left })))}`]),
      ...(narrow11e.rows.every(
        (row) =>
          row.actions &&
          row.copy &&
          row.askWrap &&
          row.actions.right <= narrow11e.leftRight + 1 &&
          row.copy.right <= narrow11e.leftRight + 1 &&
          row.askWrap.right <= narrow11e.leftRight + 1,
      )
        ? []
        : [`动作区右侧越界：${JSON.stringify(narrow11e.rows.map((row) => ({ a: row.actions && row.actions.right, c: row.copy && row.copy.right, w: row.askWrap && row.askWrap.right })))}`]),
      ...(narrow11e.rows.every((row) => row.copy && row.askWrap && Math.abs(row.copy.y - row.askWrap.y) <= 1 && row.actions && row.actions.h <= threshold11e.T)
        ? []
        : [`动作区换行（阈值 ${threshold11e.T}px）：${JSON.stringify(narrow11e.rows.map((row) => ({ copyY: row.copy && row.copy.y, askY: row.askWrap && row.askWrap.y, h: row.actions && row.actions.h })))}`]),
      ...(narrow11e.rows.every((row) => row.dom.copyFirst && row.dom.askAfterCopy && row.dom.actionsLast)
        ? []
        : [`DOM 关系变化：${JSON.stringify(narrow11e.rows.map((row) => row.dom))}`]),
    ],
  );

  await js(`document.documentElement.style.removeProperty("--pix-left-width"), true`);
  await repaint(win);
  const restored11e = await narrowProbe();
  record("r11-note-actions-narrow", { phase: "restored-width", layoutLeftWidth: restored11e.leftWidth, rows: restored11e.rows.map(rowData11e) }, [
    ...(widthOk11e(restored11e) ? [] : [`.layout-left 复位后应为 268±2：${restored11e.leftWidth}`]),
    ...(restored11e.rows.every((row) => row.scrollOverflow !== null && row.scrollOverflow <= 1)
      ? []
      : [`复位后动作区不得溢出：${JSON.stringify(restored11e.rows.map((row) => row.scrollOverflow))}`]),
  ]);
  await restoreStandardSeed();

  // --- r11-6（可选 / N74-3）：undoScope 守卫的运行时场景 ---------------------------
  log("r11-6 跨工作区迟到撤销响应零副作用（undoScope 守卫）");
  // 建议值 6000；实测「点撤销 → goHome → 重回工作区 → 面板就绪」耗时后上浮到 9000，保证 ≥ 2000 ms 余量（上浮不影响判据）
  const NOTES_RESTORE_DELAY_MS = 9000;
  await enterNotesProbe();
  await deleteRowByText("Table 2 repo");
  const callsBefore11f = (await restoreCalls()).count;
  await setRestoreDelay(NOTES_RESTORE_DELAY_MS);
  const undoClickAt11f = Date.now();
  await clickUndo();
  await goHome();
  // ④ 直接改写库内 notes.json 为「另两条」（模拟外部改动；不含刚删除的 n-current-2）
  const staleSeed11f = [seedNotes()[0], seedNotes()[3]];
  writeFileSync(NOTES_FILE, `${JSON.stringify({ version: 1, notes: staleSeed11f }, null, 2)}\n`, "utf8");
  const hashAfterRewrite11f = notesHash();
  // ⑤ 重回工作区并打开笔记面板（2 行）
  await enterWorkspace(LIBRARY_NAME);
  await openNotesPanel(2);
  const panelReadyAt11f = Date.now();
  // ⑥ 等迟到响应到达
  await sleep(NOTES_RESTORE_DELAY_MS + 500);
  const calls11f = await restoreCalls();
  const lastCall11f = calls11f.payloads.slice(-1)[0] ?? null;
  const after11f = {
    rows: await countOf(SEL.noteRow),
    countText: (await readRowsAndCount()).countText,
    texts: await rowTextSet(),
    notice: await notesNotice(),
    hashSame: notesHash() === hashAfterRewrite11f,
  };
  await setRestoreDelay(0);
  await capturePage(win, "r11-6-stale-scope.png");
  record(
    "r11-undo-scope-stale",
    {
      phase: "stale-scope",
      restoreCallsDelta: calls11f.count - callsBefore11f,
      resolvedAt: lastCall11f ? lastCall11f.resolvedAt : null,
      panelReadyAt: panelReadyAt11f,
      rows: after11f.rows,
      countText: after11f.countText,
      texts: after11f.texts,
      notice: after11f.notice,
      hashSame: after11f.hashSame,
      delayMs: NOTES_RESTORE_DELAY_MS,
      sinceUndoClickMs: panelReadyAt11f - undoClickAt11f,
    },
    [
      ...(calls11f.count - callsBefore11f === 1 ? [] : [`restoreCalls 增量应恰 1（防空断言）：${calls11f.count - callsBefore11f}`]),
      ...(lastCall11f && typeof lastCall11f.resolvedAt === "number" && lastCall11f.resolvedAt > panelReadyAt11f
        ? []
        : [`迟到响应应晚于面板就绪：${JSON.stringify({ resolvedAt: lastCall11f && lastCall11f.resolvedAt, panelReadyAt: panelReadyAt11f })}`]),
      ...(after11f.rows === 2 && JSON.stringify(after11f.texts) === JSON.stringify(staleSeed11f.map((note) => note.text))
        ? []
        : [`行应恒为第 ④ 步写入的两条：${JSON.stringify(after11f.texts)}`]),
      ...(after11f.countText === "共 2 条" ? [] : [`计数异常：${after11f.countText}`]),
      ...(after11f.notice === null ? [] : [`迟到响应必须零副作用：${JSON.stringify(after11f.notice)}`]),
      ...(after11f.hashSame ? [] : ["迟到响应不得改写文件"]),
    ],
  );
  await restoreStandardSeed();

  // =========================================================================
  // R12 章节语义贯通（N78–N81）：helper 块 + 场景 r12-1 … r12-4
  //
  // 就绪纪律：页码 pill 可见严格早于章节派生（PdfViewer 先 setPageCount → measurePages →
  // scrollToPage，再 getOutline → setOutline）⇒ 有书签文档一律先 waitSectionReady()；无书签
  // 文档用 settleEmptyOutline()（限额见设计档 §3 第 1 行：它只证明地图已渲染空态）。
  // 插值纪律：进入页面上下文的字符串一律 JSON.stringify 插值，Node 侧常量名不得进页面。
  // =========================================================================

  /** 点击原语：既有 click（runScenario:1062）在本函数作用域不可见，故按同一写法重声明。 */
  const clickEl = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click(), true`);

  /** 在 document.body 上派发 keydown（与 pressBodyEsc 同范式：打在窗口监听上）。 */
  const pressReaderKey = (key) => js(`(() => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true }));
    return true;
  })()`);

  /** 在真实元素上派发 keydown；元素不存在即抛错（守卫判据必须打在真实输入元素上）。 */
  const pressKeyOn = (selector, key) => js(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("keydown target not found: " + ${JSON.stringify(selector)});
    el.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true }));
    return true;
  })()`);

  /** 章节控件现场：存在性 / 文本 / title / 两禁用态 / 三 rect / 三 pointer-events / viewer 宽。 */
  const sectionProbe = () => js(`(() => {
    const rect = (el) => {
      const box = el.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
    };
    const text = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
    const container = document.querySelector(${JSON.stringify(SEL.readerSection)});
    const chip = document.querySelector(${JSON.stringify(SEL.readerSectionChip)});
    const prev = document.querySelector(${JSON.stringify(SEL.readerSectionPrev)});
    const next = document.querySelector(${JSON.stringify(SEL.readerSectionNext)});
    const viewer = document.querySelector(${JSON.stringify(SEL.pdfViewer)});
    return {
      containerInDom: !!container,
      chipInDom: !!chip,
      chipText: text(chip),
      chipTitle: chip ? chip.getAttribute("title") : null,
      prevDisabled: prev ? prev.disabled : null,
      nextDisabled: next ? next.disabled : null,
      containerRect: container ? rect(container) : null,
      containerPointerEvents: container ? getComputedStyle(container).pointerEvents : null,
      prevPointerEvents: prev ? getComputedStyle(prev).pointerEvents : null,
      nextPointerEvents: next ? getComputedStyle(next).pointerEvents : null,
      viewerWidth: viewer ? Math.round(viewer.getBoundingClientRect().width) : null,
    };
  })()`);

  /** 既有四控件现场（r12-2 ⑤ 的 ±1px 判据）：页码 pill / 页码文本 / 工具栏 / 框选按钮 + 缩放文本。 */
  const pillProbe = () => js(`(() => {
    const rect = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
    };
    const text = (selector) => {
      const el = document.querySelector(selector);
      return el ? el.textContent.replace(/\\s+/g, " ").trim() : null;
    };
    return {
      indicator: { text: text(${JSON.stringify(SEL.pageIndicator)}), rect: rect(${JSON.stringify(SEL.pageIndicator)}) },
      pageLabel: { text: text(".page-label"), rect: rect(".page-label") },
      toolbar: { rect: rect(".pdf-toolbar") },
      captureFab: { rect: rect(".pdf-capture-fab") },
      zoomText: text(${JSON.stringify(SEL.zoomLabel)}),
    };
  })()`);

  /** 有书签文档的唯一就绪点（无书签文档永不出现，不得使用）。 */
  const waitSectionReady = () =>
    waitFor("章节控件就绪", `document.querySelector(${JSON.stringify(SEL.readerSection)}) !== null`);

  /** 关地图（幂等）：已关直接返回，开着则再点一次开关并等槽位退出 DOM。 */
  const closeMap = async () => {
    if (!(await has(SEL.mapSlot))) return;
    await js(`document.querySelector(${JSON.stringify(SEL.mapToggle)}).click(), true`);
    await waitFor("知识地图槽位退出", `!document.querySelector(${JSON.stringify(SEL.mapSlot)})`);
  };

  /** 无书签文档的「空 outline 已落地」信号：开地图等空态 + 进度（与 50c 同口径）后关地图。 */
  const settleEmptyOutline = async () => {
    await ensureMapOpen();
    await waitFor(
      "地图空态与进度就绪",
      `document.querySelector(${JSON.stringify(SEL.mapEmpty)}) && document.querySelector(${JSON.stringify(SEL.mapProgress)})`,
    );
    await closeMap();
  };

  /** 地图上全部 .map-row.current 的 .label 文本（空白归一化；元素缺失项为 null）。 */
  const mapCurrentLabels = () => js(`Array.from(document.querySelectorAll(".map-row.current")).map((row) => {
    const label = row.querySelector(".label");
    return label ? label.textContent.replace(/\\s+/g, " ").trim() : null;
  })`);

  // --- r12-1：有书签文档的章节 chip 与两个按钮（组 r12-section-visible，5 条 record）---------
  log("r12-1 章节 chip：三页文本 / 禁用态 / 几何与指针事件 / 翻页与缩放不变性");
  await enterCleanWorkspace(seedNotes());
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await waitSectionReady();
  const section1a = await sectionProbe();
  const pill1a = await pillProbe();
  await capturePage(win, "r12-1-section-chip-page1.png", await rectOfSelector(SEL.readerMain));
  const overlap1a = {
    containerBottom: section1a.containerRect ? section1a.containerRect.y + section1a.containerRect.height : null,
    indicatorTop: pill1a.indicator.rect ? pill1a.indicator.rect.y : null,
    containerWidth: section1a.containerRect ? section1a.containerRect.width : null,
    viewerWidth: section1a.viewerWidth,
  };
  record("r12-section-visible", { phase: "page-1", section: section1a, pill: pill1a, overlap: overlap1a }, [
    ...(section1a.containerInDom && section1a.chipInDom ? [] : [`章节控件应在 DOM：${JSON.stringify(section1a)}`]),
    ...(section1a.chipText === "1. Abstract · 第 1 页" && section1a.chipTitle === "1. Abstract · 第 1 页"
      ? []
      : [`chip 文本/title 异常：${JSON.stringify({ text: section1a.chipText, title: section1a.chipTitle })}`]),
    ...(section1a.prevDisabled === true && section1a.nextDisabled === false
      ? []
      : [`禁用态异常：${JSON.stringify({ prev: section1a.prevDisabled, next: section1a.nextDisabled })}`]),
    ...(pill1a.pageLabel.text === "第 1 / 3 页" ? [] : [`页码 pill 文本变化：${pill1a.pageLabel.text}`]),
    ...(overlap1a.containerBottom !== null && overlap1a.indicatorTop !== null && overlap1a.containerBottom <= overlap1a.indicatorTop + 1
      ? []
      : [`章节控件未在 pill 上方：${JSON.stringify(overlap1a)}`]),
    ...(overlap1a.containerWidth !== null && overlap1a.viewerWidth !== null && overlap1a.containerWidth < overlap1a.viewerWidth
      ? []
      : [`章节控件宽度应小于 viewer 宽：${JSON.stringify(overlap1a)}`]),
    ...(section1a.containerPointerEvents === "none" ? [] : [`容器 pointer-events 应为 none：${section1a.containerPointerEvents}`]),
    ...(section1a.prevPointerEvents === "auto" && section1a.nextPointerEvents === "auto"
      ? []
      : [`两按钮 pointer-events 应为 auto：${JSON.stringify({ prev: section1a.prevPointerEvents, next: section1a.nextPointerEvents })}`]),
  ]);

  await clickNext();
  await waitPage(2, 3);
  const section1b = await sectionProbe();
  await capturePage(win, "r12-1b-section-chip-page2.png", await rectOfSelector(SEL.readerMain));
  record("r12-section-visible", { phase: "page-2", section: section1b }, [
    ...(section1b.chipText === "2. Method Overview · 第 2 页" ? [] : [`第 2 页 chip 异常：${section1b.chipText}`]),
    ...(section1b.prevDisabled === false && section1b.nextDisabled === false
      ? []
      : [`第 2 页两按钮均应可点：${JSON.stringify({ prev: section1b.prevDisabled, next: section1b.nextDisabled })}`]),
  ]);

  await clickNext();
  await waitPage(3, 3);
  const section1c = await sectionProbe();
  await capturePage(win, "r12-1c-section-chip-page3.png", await rectOfSelector(SEL.readerMain));
  record("r12-section-visible", { phase: "page-3", section: section1c }, [
    ...(section1c.chipText === "2.2 Positional prior · 第 3 页" ? [] : [`第 3 页 chip 异常：${section1c.chipText}`]),
    ...(section1c.nextDisabled === true ? [] : [`末节下一节应禁用：${JSON.stringify(section1c)}`]),
  ]);

  // invariance：地图开合 / 缩放往返 / 面板切标签各读一次 chip（只判文本与存在性，不判矩形）。
  const reading12a = async (at) => {
    const probe = await sectionProbe();
    return { at, chipText: probe.chipText, containerInDom: probe.containerInDom };
  };
  const readings12a = [];
  readings12a.push(await reading12a("before-map"));
  await ensureMapOpen();
  await waitFor("地图当前行 3 条", `document.querySelectorAll(".map-row.current").length === 3`);
  readings12a.push(await reading12a("map-open"));
  const currentLabels12a = await mapCurrentLabels();
  await closeMap();
  readings12a.push(await reading12a("map-closed"));
  await clickEl(SEL.zoomInBtn);
  await repaint(win);
  const zoomAfterIn12a = (await pillProbe()).zoomText;
  await clickEl('.pdf-toolbar button[title="缩小"]');
  await repaint(win);
  const zoomBack12a = (await pillProbe()).zoomText;
  readings12a.push(await reading12a("zoom-roundtrip"));
  await openNotesPanel(4);
  await clickEl(SEL.tabLibrary);
  readings12a.push(await reading12a("notes-panel"));
  record(
    "r12-section-visible",
    {
      phase: "invariance",
      readings: readings12a,
      zoomAfterIn: zoomAfterIn12a,
      zoomBack: zoomBack12a,
      currentLabels: currentLabels12a,
    },
    [
      ...(readings12a.length === 5 && readings12a.every((entry) => entry.chipText === "2.2 Positional prior · 第 3 页")
        ? []
        : [`五次读数的 chip 文本应逐字节相等：${JSON.stringify(readings12a)}`]),
      ...(readings12a.every((entry) => entry.containerInDom === true) ? [] : [`容器应全程在 DOM：${JSON.stringify(readings12a)}`]),
      ...(zoomAfterIn12a === "110%" ? [] : [`放大后缩放读数应为 110%（防空断言）：${zoomAfterIn12a}`]),
      ...(zoomBack12a === "100%" ? [] : [`缩小后应回到 100%：${zoomBack12a}`]),
      ...(currentLabels12a.length === 3 &&
      currentLabels12a.includes("2.2 Positional prior") &&
      currentLabels12a.includes("Appendix B")
        ? []
        : [`地图 in-range 集合应与 chip 同源：${JSON.stringify(currentLabels12a)}`]),
    ],
  );

  // page-input：越界提交保持钳制 + 章节不漂移；合法页提交后 chip 跟随。
  const setPageDraft12a = (value) => js(`(() => {
    const input = document.querySelector(${JSON.stringify(SEL.pageInput)});
    if (!input) throw new Error("page input not found");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await clickEl(".page-label");
  await waitFor("页码输入框", `document.querySelector(${JSON.stringify(SEL.pageInput)})`);
  await setPageDraft12a(99);
  await pressKeyOn(SEL.pageInput, "Enter");
  await waitFor("页码输入框退出 DOM", `!document.querySelector(${JSON.stringify(SEL.pageInput)})`);
  const afterOutOfRange12a = { pageText: await pageLabel(), section: await sectionProbe() };
  await clickEl(".page-label");
  await waitFor("页码输入框（第二次）", `document.querySelector(${JSON.stringify(SEL.pageInput)})`);
  await setPageDraft12a(2);
  await pressKeyOn(SEL.pageInput, "Enter");
  await waitPage(2, 3);
  const afterValid12a = { pageText: await pageLabel(), section: await sectionProbe() };
  record("r12-section-visible", { phase: "page-input", afterOutOfRange: afterOutOfRange12a, afterValid: afterValid12a }, [
    ...(afterOutOfRange12a.pageText === "第 3 / 3 页" ? [] : [`越界提交应保持第 3 页（既有钳制语义）：${afterOutOfRange12a.pageText}`]),
    ...(afterOutOfRange12a.section.chipText === "2.2 Positional prior · 第 3 页"
      ? []
      : [`越界提交后 chip 不得漂移：${afterOutOfRange12a.section.chipText}`]),
    ...(afterValid12a.pageText === "第 2 / 3 页" ? [] : [`合法页提交应落第 2 页：${afterValid12a.pageText}`]),
    ...(afterValid12a.section.chipText === "2. Method Overview · 第 2 页" ? [] : [`合法页提交后 chip 异常：${afterValid12a.section.chipText}`]),
  ]);

  // --- r12-2：无书签文档的零占位与四选择器零位移（组 r12-section-degrade，2 条 record）-----
  log("r12-2 无书签文档：章节控件整行不存在 + 四选择器跨文档 ±1px");
  await enterCleanWorkspace(seedNotes());
  await openRow("older-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 2);
  await settleEmptyOutline();
  const pageTextBefore12b = await pageLabel();
  const hashBefore12b = notesHash();
  const sectionBefore12b = await sectionProbe();
  await pressReaderKey("]");
  await pressReaderKey("[");
  const sectionAfter12b = await sectionProbe();
  const pageTextAfter12b = await pageLabel();
  await capturePage(win, "r12-2-no-outline-degrade.png", await rectOfSelector(SEL.readerMain));
  record(
    "r12-section-degrade",
    {
      phase: "no-outline",
      section: sectionAfter12b,
      sectionBefore: sectionBefore12b,
      pageTextBefore: pageTextBefore12b,
      pageTextAfter: pageTextAfter12b,
      hashSame: notesHash() === hashBefore12b,
    },
    [
      ...(sectionBefore12b.containerInDom === false && sectionBefore12b.chipInDom === false
        ? []
        : [`无 outline 时不得渲染章节控件（零占位）：${JSON.stringify(sectionBefore12b)}`]),
      ...(pageTextBefore12b === "第 1 / 2 页" && pageTextAfter12b === "第 1 / 2 页"
        ? []
        : [`无目标按键必须零副作用：${JSON.stringify({ before: pageTextBefore12b, after: pageTextAfter12b })}`]),
      ...(sectionAfter12b.containerInDom === false && sectionAfter12b.chipInDom === false
        ? []
        : [`两次派发后仍不得渲染：${JSON.stringify(sectionAfter12b)}`]),
      ...(notesHash() === hashBefore12b ? [] : ["派发按键不得改写 notes.json"]),
    ],
  );

  const pillWithout12b = await pillProbe();
  await openRow("sample-paper.pdf");
  await waitPage(1, 3);
  await waitSectionReady();
  const sectionOnSample12b = await sectionProbe();
  const pillWith12b = await pillProbe();
  const rectDelta12b = (before, after) =>
    before && after
      ? {
          x: Math.abs(after.x - before.x),
          y: Math.abs(after.y - before.y),
          width: Math.abs(after.width - before.width),
          height: Math.abs(after.height - before.height),
        }
      : null;
  const rectSame12b = (delta) => !!delta && delta.x <= 1 && delta.y <= 1 && delta.width <= 1 && delta.height <= 1;
  const delta12b = {
    indicator: rectDelta12b(pillWithout12b.indicator.rect, pillWith12b.indicator.rect),
    pageLabel: rectDelta12b(pillWithout12b.pageLabel.rect, pillWith12b.pageLabel.rect),
    toolbar: rectDelta12b(pillWithout12b.toolbar.rect, pillWith12b.toolbar.rect),
    captureFab: rectDelta12b(pillWithout12b.captureFab.rect, pillWith12b.captureFab.rect),
  };
  await openRow("older-paper.pdf");
  await waitPage(1, 2);
  await settleEmptyOutline();
  const sectionAfterReturn12b = await sectionProbe();
  record(
    "r12-section-degrade",
    {
      phase: "zero-displacement",
      pillWithout: pillWithout12b,
      pillWith: pillWith12b,
      delta: delta12b,
      pageTexts: { without: pillWithout12b.pageLabel.text, with: pillWith12b.pageLabel.text },
      zoomTexts: { without: pillWithout12b.zoomText, with: pillWith12b.zoomText },
      sectionOnSample: sectionOnSample12b,
      sectionAfterReturn: sectionAfterReturn12b,
    },
    [
      ...(Object.values(delta12b).every((delta) => rectSame12b(delta)) ? [] : [`四选择器几何位移 > 1px：${JSON.stringify(delta12b)}`]),
      ...(pillWithout12b.pageLabel.text === "第 1 / 2 页" && pillWith12b.pageLabel.text === "第 1 / 3 页"
        ? []
        : [`换文档证据缺失（防空断言）：${JSON.stringify({ without: pillWithout12b.pageLabel.text, with: pillWith12b.pageLabel.text })}`]),
      ...(pillWithout12b.zoomText === "100%" && pillWith12b.zoomText === "100%"
        ? []
        : [`两端缩放前提应为 100%：${JSON.stringify({ without: pillWithout12b.zoomText, with: pillWith12b.zoomText })}`]),
      ...(sectionOnSample12b.containerInDom === true ? [] : [`有书签文档上控件应在 DOM（防空断言）：${JSON.stringify(sectionOnSample12b)}`]),
      ...(sectionAfterReturn12b.containerInDom === false
        ? []
        : [`切回无书签文档后控件应缺席：${JSON.stringify(sectionAfterReturn12b)}`]),
    ],
  );

  // --- r12-3：按钮与快捷键同源 + 两条守卫（组 r12-section-nav，7 条 record）----------------
  log("r12-3 章节导航：按钮 / [ ] 快捷键 / 输入框与框选模式守卫");
  await enterCleanWorkspace(seedNotes());
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await waitSectionReady();
  await clickEl(SEL.readerSectionNext);
  await waitPage(2, 3);
  const nextJump12c = { pageText: await pageLabel(), section: await sectionProbe() };
  await capturePage(win, "r12-3-section-nav-after-next.png", await rectOfSelector(SEL.readerMain));
  record("r12-section-nav", { phase: "next-jump", pageText: nextJump12c.pageText, section: nextJump12c.section }, [
    ...(nextJump12c.pageText === "第 2 / 3 页" ? [] : [`点下一节应落第 2 页：${nextJump12c.pageText}`]),
    ...(nextJump12c.section.chipText === "2. Method Overview · 第 2 页" ? [] : [`chip 异常：${nextJump12c.section.chipText}`]),
    ...(nextJump12c.section.prevDisabled === false && nextJump12c.section.nextDisabled === false
      ? []
      : [`第 2 页两按钮均应可点：${JSON.stringify(nextJump12c.section)}`]),
  ]);

  await clickEl(SEL.readerSectionNext);
  await waitPage(3, 3);
  const lastDisabled12c = { pageText: await pageLabel(), section: await sectionProbe() };
  record("r12-section-nav", { phase: "next-last-disabled", pageText: lastDisabled12c.pageText, section: lastDisabled12c.section }, [
    ...(lastDisabled12c.pageText === "第 3 / 3 页" ? [] : [`点下一节应落第 3 页：${lastDisabled12c.pageText}`]),
    ...(lastDisabled12c.section.nextDisabled === true ? [] : [`末节应禁用下一节：${JSON.stringify(lastDisabled12c.section)}`]),
    ...(lastDisabled12c.section.prevDisabled === false ? [] : [`末节上一节应仍可点：${JSON.stringify(lastDisabled12c.section)}`]),
  ]);

  await clickEl(SEL.readerSectionPrev);
  await waitPage(2, 3);
  const prevJump12c = { pageText: await pageLabel(), section: await sectionProbe() };
  record("r12-section-nav", { phase: "prev-jump", pageText: prevJump12c.pageText, section: prevJump12c.section }, [
    ...(prevJump12c.pageText === "第 2 / 3 页" ? [] : [`上一节目标 = 2.1（start 2）应真实后退一页：${prevJump12c.pageText}`]),
    ...(prevJump12c.section.chipText === "2. Method Overview · 第 2 页" ? [] : [`chip 异常：${prevJump12c.section.chipText}`]),
  ]);

  await clickPrev();
  await waitPage(1, 3);
  const beforeShortcut12c = { pageText: await pageLabel(), section: await sectionProbe() };
  await pressReaderKey("]");
  await waitPage(2, 3);
  const afterShortcut12c = { pageText: await pageLabel(), section: await sectionProbe() };
  record("r12-section-nav", { phase: "shortcut-next", before: beforeShortcut12c, after: afterShortcut12c }, [
    ...(beforeShortcut12c.pageText === "第 1 / 3 页" && beforeShortcut12c.section.prevDisabled === true
      ? []
      : [`派发前应停在第 1 页且上一节禁用（防空断言）：${JSON.stringify(beforeShortcut12c)}`]),
    ...(afterShortcut12c.pageText === "第 2 / 3 页" ? [] : [`快捷键 ] 应落第 2 页：${afterShortcut12c.pageText}`]),
    ...(afterShortcut12c.section.chipText === "2. Method Overview · 第 2 页"
      ? []
      : [`快捷键与按钮目标应同源：${afterShortcut12c.section.chipText}`]),
  ]);

  await pressReaderKey("[");
  await waitPage(1, 3);
  const prevShortcut12c = { pageText: await pageLabel(), section: await sectionProbe() };
  await capturePage(win, "r12-3b-section-nav-shortcut-prev.png", await rectOfSelector(SEL.readerMain));
  record("r12-section-nav", { phase: "shortcut-prev", pageText: prevShortcut12c.pageText, section: prevShortcut12c.section }, [
    ...(prevShortcut12c.pageText === "第 1 / 3 页" ? [] : [`快捷键 [ 应落第 1 页：${prevShortcut12c.pageText}`]),
    ...(prevShortcut12c.section.chipText === "1. Abstract · 第 1 页" ? [] : [`chip 异常：${prevShortcut12c.section.chipText}`]),
    ...(prevShortcut12c.section.prevDisabled === true ? [] : [`首节上一节应禁用：${JSON.stringify(prevShortcut12c.section)}`]),
  ]);

  // 守卫 ①：页码输入框与 composer（isEditableTarget 早退）；后半句是真正的守卫证据。
  await clickEl(".page-label");
  await waitFor("页码输入框（守卫相位）", `document.querySelector(${JSON.stringify(SEL.pageInput)})`);
  await pressKeyOn(SEL.pageInput, "]");
  const pageInputState12c = await js(`(() => {
    const input = document.querySelector(${JSON.stringify(SEL.pageInput)});
    return {
      value: input ? input.value : null,
      tag: document.activeElement ? document.activeElement.tagName : null,
    };
  })()`);
  await pressKeyOn(SEL.pageInput, "Escape");
  const pageTextAfterPageInput12c = await pageLabel();
  await js(`document.querySelector(${JSON.stringify(SEL.composerInput)}).focus(), true`);
  const composerTag12c = await js("document.activeElement ? document.activeElement.tagName : null");
  await pressKeyOn(SEL.composerInput, "]");
  const composerState12c = { pageText: await pageLabel(), section: await sectionProbe() };
  record(
    "r12-section-nav",
    {
      phase: "shortcut-guard-editable",
      targets: { pageInput: pageInputState12c.tag, composer: composerTag12c },
      pageInputValue: pageInputState12c.value,
      pageText: { afterPageInput: pageTextAfterPageInput12c, afterComposer: composerState12c.pageText },
      section: composerState12c.section,
    },
    [
      ...(pageInputState12c.value === "1" ? [] : [`页码输入框内派发不得改写草图：${pageInputState12c.value}`]),
      ...(pageTextAfterPageInput12c === "第 1 / 3 页"
        ? []
        : [`输入框守卫失效（取消编辑后页码应仍是第 1 页）：${pageTextAfterPageInput12c}`]),
      ...(composerState12c.pageText === "第 1 / 3 页" ? [] : [`composer 内派发不得翻页：${composerState12c.pageText}`]),
      ...(composerState12c.section.chipText === "1. Abstract · 第 1 页" ? [] : [`chip 不得变化：${composerState12c.section.chipText}`]),
      ...(pageInputState12c.tag === "INPUT" && composerTag12c === "TEXTAREA"
        ? []
        : [`派发目标应为真实输入元素（防空断言）：${JSON.stringify({ pageInput: pageInputState12c.tag, composer: composerTag12c })}`]),
    ],
  );

  // 守卫 ②：框选模式内 [ / ] 不生效（新分支自检 captureMode），退出后同一按键恢复。
  if (!(await has(SEL.captureLayer))) {
    await clickEl(SEL.captureFabBtn);
  }
  await waitFor("框选层就绪", `document.querySelector(${JSON.stringify(SEL.captureLayer)})`);
  await pressReaderKey("]");
  const inCapture12c = { pageText: await pageLabel(), section: await sectionProbe() };
  await pressBodyEsc();
  await waitFor("框选层退出", `!document.querySelector(${JSON.stringify(SEL.captureLayer)})`);
  await pressReaderKey("]");
  await waitPage(2, 3);
  const afterCapture12c = { pageText: await pageLabel(), section: await sectionProbe() };
  record("r12-section-nav", { phase: "shortcut-guard-capture", inCapture: inCapture12c, afterExit: afterCapture12c }, [
    ...(inCapture12c.pageText === "第 1 / 3 页" ? [] : [`框选模式内 [ / ] 不得生效：${inCapture12c.pageText}`]),
    ...(afterCapture12c.pageText === "第 2 / 3 页" ? [] : [`退出框选后同一按键应恢复生效：${afterCapture12c.pageText}`]),
    ...(afterCapture12c.section.chipText === "2. Method Overview · 第 2 页"
      ? []
      : [`退出框选后 chip 异常：${afterCapture12c.section.chipText}`]),
  ]);

  // --- r12-4：载荷 section 行与「不可解析时逐字节等于旧格式」（组 r12-section-context，2 条）---
  log("r12-4 上下文注入：section 行 / 行序 / 删行后逐字节等于旧格式");
  await enterCleanWorkspace(seedNotes());
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await waitSectionReady();
  await clickNext();
  await waitPage(2, 3);
  await clearSendCalls();
  const T12 = "12：这一节的假设是什么？";
  const T13 = "13：没有书签的文档也要能正常提问。";
  const countOccurrences = (text, needle) => text.split(needle).length - 1;
  await typeAndSend(T12);
  await waitSendCalls(1);
  const prompt12 = await lastSend();
  await capturePage(win, "r12-4-section-context-sent.png");
  const sectionLine12 = "section: 2. Method Overview · 第 2 页";
  const oldFormat12 = `<reading_context>\npath: ${join(LIBRARY_DIR, "sample-paper.pdf")}\npage: 2\npageCount: 3\n</reading_context>\n\n${T12}`;
  const withoutSection12 = prompt12.message.replace(`${sectionLine12}\n`, "");
  record(
    "r12-section-context",
    {
      phase: "with-section",
      message: prompt12.message,
      sectionLine: sectionLine12,
      withoutSectionEqualsOld: withoutSection12 === oldFormat12,
      selectedTextInPayload: prompt12.message.includes("selectedText:"),
      notesInPayload: countOccurrences(prompt12.message, "reader_notes:"),
      displayText: prompt12.displayText,
    },
    [
      ...(prompt12.message.includes(sectionLine12) ? [] : [`载荷缺少 section 行：${prompt12.message}`]),
      ...(prompt12.message.indexOf("pageCount: 3") < prompt12.message.indexOf("section: ") &&
      prompt12.message.indexOf("section: ") < prompt12.message.indexOf("</reading_context>")
        ? []
        : ["section 行位置异常"]),
      ...(withoutSection12 === oldFormat12
        ? []
        : [`删掉 section 行后应与旧格式逐字节相等：${JSON.stringify({ actual: withoutSection12, expected: oldFormat12 })}`]),
      ...(prompt12.displayText === T12 ? [] : [`气泡文案应逐字等于输入：${prompt12.displayText}`]),
      ...(prompt12.message.includes("selectedText:") === false ? [] : ["无选区时不得输出 selectedText:"]),
      ...(countOccurrences(prompt12.message, "reader_notes:") === 0 ? [] : ["无选择集时不得输出 reader_notes:"]),
    ],
  );

  await openRow("older-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 2);
  await settleEmptyOutline();
  await clearSendCalls();
  await typeAndSend(T13);
  await waitSendCalls(1);
  const prompt13 = await lastSend();
  const exactFormat13 = `<reading_context>\npath: ${join(LIBRARY_DIR, "archive", "older-paper.pdf")}\npage: 1\npageCount: 2\n</reading_context>\n\n${T13}`;
  record(
    "r12-section-context",
    {
      phase: "without-outline",
      message: prompt13.message,
      exact: prompt13.message === exactFormat13,
      selectedTextInPayload: prompt13.message.includes("selectedText:"),
      notesInPayload: countOccurrences(prompt13.message, "reader_notes:"),
    },
    [
      ...(prompt13.message === exactFormat13
        ? []
        : [`不可解析时应逐字节等于旧格式：${JSON.stringify({ actual: prompt13.message, expected: exactFormat13 })}`]),
      ...(prompt13.message.includes("section:") === false ? [] : [`无 outline 时不得输出 section 行：${prompt13.message}`]),
      ...(prompt13.message.includes("selectedText:") === false ? [] : ["无选区时不得输出 selectedText:"]),
      ...(countOccurrences(prompt13.message, "reader_notes:") === 0 ? [] : ["无选择集时不得输出 reader_notes:"]),
    ],
  );
  // =========================================================================
  // R13 阅读报告（N82–N86）：helper 块 + 场景 r13-1 … r13-5
  //
  // 就绪纪律：有书签文档沿用 waitSectionReady()（页码 pill 可见严格早于章节派生），无书签文档
  //   沿用 settleEmptyOutline()；r13-1 / r13-5 按设计档定稿修订 §R13-4 不断言章节入参，不加该门。
  // 报告根：stub 的 CONFIG.root（工作区 A），与 NOTES_FILE / relativeDocPath 同根。
  // 插值纪律：进入页面上下文的字符串一律 JSON.stringify 插值，Node 侧常量名不得进页面。
  // =========================================================================

  const REPORT_DIR = join(LIBRARY_DIR, ".pix-read", "reports");
  const REPORT_SAMPLE = join(REPORT_DIR, "sample-paper.pdf.md");
  const NOTES_MD_FILE = join(LIBRARY_DIR, ".pix-read", "notes.md");
  /** 唯一非确定性字段的归一化（与烟测 STAMP_RE 逐字同一条表达式）。 */
  const REPORT_STAMP_RE = /生成时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;
  const normalizeStamp = (text) => text.replace(REPORT_STAMP_RE, "生成时间：<STAMP>");
  /** 报告绝对路径（元素缺失即抛错，不静默返回空串）。 */
  const reportPath = (relPath) => join(REPORT_DIR, ...relPath.split("/"));
  const readReport = (relPath) => readFileSync(reportPath(relPath), "utf8");
  /** 存在性：readFileSync 成功即存在（本脚本不新增 fs import，语义与 existsSync 等价）。 */
  const reportExists = (relPath) => {
    try {
      readFileSync(reportPath(relPath));
      return true;
    } catch {
      return false;
    }
  };
  const notesReportCalls = () => js("window.__pixStub.notesReportCalls()");
  const libraryShowCalls = () => js("window.__pixStub.libraryShowCalls()");
  const setNotesReportFailure = (code) => js(`window.__pixStub.setNotesReportFailure(${JSON.stringify(code)}), true`);
  const setNotesReportDelay = (ms) => js(`window.__pixStub.setNotesReportDelay(${ms}), true`);
  const pixReadEntries = () => readdirSync(join(LIBRARY_DIR, ".pix-read")).sort();
  /** 组标题行 / 元信息行（逐字比对用；两条都是文本行的唯一取法）。 */
  const reportGroups = (text) => text.split("\n").filter((line) => line.startsWith("## "));
  const reportMetaLine = (text) => text.split("\n").find((line) => line.startsWith("> 由 PiX-Read 生成")) ?? null;
  const lastReportPayload = async () => (await notesReportCalls()).payloads.slice(-1)[0] ?? null;
  /** 报告响应落地：计数到达目标值且最后一条 payload 已 resolve（延迟注入下不靠 sleep 空转）。 */
  const waitReportSettled = (count) =>
    waitFor(`报告调用落地（count=${count}）`, `(() => {
      const calls = window.__pixStub.notesReportCalls();
      return calls.count === ${count} && calls.payloads[calls.payloads.length - 1].resolvedAt !== null;
    })()`);

  /** 入口与状态行现场：一次 js 读完（字段集合封闭；文本空白归一化，rect 与 rectOfSelector 同口径）。 */
  const reportProbe = () => js(`(() => {
    const rect = (el) => {
      const box = el.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
    };
    const text = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
    const btn = document.querySelector(${JSON.stringify(SEL.reportBtn)});
    const search = document.querySelector(".notes-search");
    const headerTop = document.querySelector(".notes-header-top");
    const row = document.querySelector(${JSON.stringify(SEL.reportRow)});
    return {
      btnInDom: !!btn,
      btnText: text(btn),
      btnTitle: btn ? btn.getAttribute("title") : null,
      btnDisabled: btn ? btn.disabled : null,
      btnRect: btn ? rect(btn) : null,
      searchRect: search ? rect(search) : null,
      headerTopRect: headerTop ? rect(headerTop) : null,
      rowInDom: !!row,
      rowText: text(document.querySelector(${JSON.stringify(SEL.reportText)})),
      revealText: text(document.querySelector(${JSON.stringify(SEL.reportReveal)})),
      countText: text(document.querySelector(".notes-count")),
      exportLabel: text(document.querySelector(".notes-export-btn")),
    };
  })()`);
  /** 行宽判据（评审 S-6）：block 属性 ⇒ 与同受 .notes-header 内边距约束的 .notes-search 同宽（±1px）。 */
  const entryWidthOk = (probe) =>
    !!probe.btnRect && !!probe.searchRect && Math.abs(probe.btnRect.width - probe.searchRect.width) <= 1;
  /** 入口行在头部首行之下（不压 .notes-count 文本）。 */
  const entryBelowHeader = (probe) =>
    !!probe.btnRect &&
    !!probe.headerTopRect &&
    probe.btnRect.y >= probe.headerTopRect.y + probe.headerTopRect.height - 1;

  /** 越界页夹具（r13-3）：该条不命中任何章节 ⇒ 归入兜底组。 */
  const outOfRangeNote = () => {
    const stamp = Date.now() - 3 * MINUTE;
    return {
      id: "n-out-of-range",
      kind: "excerpt",
      docPath: "sample-paper.pdf",
      page: 9,
      text: "Out-of-range excerpt: this page is beyond the document page count.",
      comment: "",
      createdAt: stamp,
      updatedAt: stamp,
    };
  };

  /** 文本文档夹具（r13-4）：无 outline + 无进度 ⇒ 退化按页分组。 */
  const textDocNote = () => {
    const stamp = Date.now() - 5 * MINUTE;
    return {
      id: "n-text-doc",
      kind: "excerpt",
      docPath: "reading-notes.md",
      page: 1,
      text: "阅读清单：sample-paper.pdf 已完成，archive/older-paper.pdf 待读。",
      comment: "",
      createdAt: stamp,
      updatedAt: stamp,
    };
  };

  /** sample-paper.pdf（标准种子）的章节入参期望值（手写；顺序 = 预序；与地图徽标同源）。 */
  const EXPECT_CHAPTERS_13 = [
    { title: "1. Abstract", start: 1, end: 1, label: "1" },
    { title: "2. Method Overview", start: 2, end: 2, label: "2" },
    { title: "2.1 Sparse mask budget", start: 2, end: 2, label: "2" },
    { title: "2.2 Positional prior", start: 3, end: 3, label: "3" },
    { title: "3. Ablation Study", start: 3, end: 3, label: "3" },
    { title: "Appendix A.1", start: 3, end: 3, label: "3" },
    { title: "Appendix B", start: 2, end: 3, label: "2-3" },
  ];

  // --- r13-1：入口行三分叉（组 r13-report-entry，3 条 record，2 张截图） -------------------
  log("r13-1 报告入口：无文档禁用 / 打开文档可用 / 当前文档 0 条不发 IPC");
  await enterCleanWorkspace(seedNotes());
  await openNotesPanel(4);
  const probe13a = await reportProbe();
  const leftWidth13a = await js(`document.querySelector(${JSON.stringify(SEL.layoutLeft)}).offsetWidth`);
  await capturePage(win, "r13-1-report-disabled.png", await rectOfSelector(SEL.layoutLeft));
  record(
    "r13-report-entry",
    {
      phase: "disabled-no-doc",
      probe: probe13a,
      entryWidthOk: entryWidthOk(probe13a),
      entryBelowHeader: entryBelowHeader(probe13a),
      leftWidth: leftWidth13a,
    },
    [
      ...(probe13a.btnInDom ? [] : [`无当前文档时入口应在 DOM：${JSON.stringify(probe13a)}`]),
      ...(probe13a.btnText === "导出当前文档报告" ? [] : [`按钮文本异常：${probe13a.btnText}`]),
      ...(probe13a.btnTitle === "导出当前文档的阅读报告（Markdown）" ? [] : [`按钮 title 异常：${probe13a.btnTitle}`]),
      ...(probe13a.btnDisabled === true ? [] : [`无当前文档时应禁用：${JSON.stringify(probe13a)}`]),
      ...(entryWidthOk(probe13a)
        ? []
        : [`入口按钮未占满行宽：${JSON.stringify({ btn: probe13a.btnRect, search: probe13a.searchRect })}`]),
      ...(entryBelowHeader(probe13a)
        ? []
        : [`入口行压住头部首行：${JSON.stringify({ btn: probe13a.btnRect, header: probe13a.headerTopRect })}`]),
      ...(probe13a.rowInDom === false ? [] : [`未导出前不得有状态行：${probe13a.rowText}`]),
    ],
  );

  await backToLibraryTab();
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await openNotesPanel(4);
  const probe13b = await reportProbe();
  record(
    "r13-report-entry",
    { phase: "enabled-with-doc", probe: probe13b, countText: probe13b.countText, exportLabel: probe13b.exportLabel },
    [
      ...(probe13b.btnDisabled === false ? [] : [`有当前文档时应可点：${JSON.stringify(probe13b)}`]),
      ...(probe13b.btnText === "导出当前文档报告" && probe13b.btnTitle === "导出当前文档的阅读报告（Markdown）"
        ? []
        : [`打开文档不应改变按钮文本/title：${JSON.stringify({ text: probe13b.btnText, title: probe13b.btnTitle })}`]),
      ...(probe13b.countText === "共 4 条" ? [] : [`头部计数被挤动：${probe13b.countText}`]),
      ...(probe13b.exportLabel === "导出 Markdown" ? [] : [`既有导出按钮被挤动：${probe13b.exportLabel}`]),
    ],
  );

  await backToLibraryTab();
  await openRow("reading-notes.md");
  await waitFor("Markdown 预览", `document.querySelector(".reader-body")`);
  await openNotesPanel(4);
  const notesMdHash13c = fileHash(NOTES_MD_FILE);
  const callsBase13c = (await notesReportCalls()).count;
  const exists13c = reportExists("reading-notes.md.md");
  await clickEl(SEL.reportBtn);
  await waitFor("无笔记提示", `document.querySelector(".notes-notice.is-error")`);
  const notice13c = await notesNotice();
  const callsAfter13c = (await notesReportCalls()).count;
  const probe13c = await reportProbe();
  await capturePage(win, "r13-1b-report-no-notes-notice.png", await rectOfSelector(SEL.layoutLeft));
  record(
    "r13-report-entry",
    {
      phase: "no-notes-notice",
      notice: notice13c,
      callsDelta: callsAfter13c - callsBase13c,
      reportExists: reportExists("reading-notes.md.md"),
      rowInDom: probe13c.rowInDom,
      notesMdHashSame: fileHash(NOTES_MD_FILE) === notesMdHash13c,
    },
    [
      ...(notice13c && notice13c.isError && notice13c.text === "当前文档暂无笔记，未生成报告"
        ? []
        : [`空库提示异常：${JSON.stringify(notice13c)}`]),
      ...(callsAfter13c - callsBase13c === 0 ? [] : [`空库不得发 IPC：${callsAfter13c - callsBase13c}`]),
      ...(exists13c === false && reportExists("reading-notes.md.md") === false
        ? []
        : [`空库不得写报告文件：${JSON.stringify({ before: exists13c, after: reportExists("reading-notes.md.md") })}`]),
      ...(probe13c.rowInDom === false ? [] : [`空库不得产生状态行：${probe13c.rowText}`]),
      ...(fileHash(NOTES_MD_FILE) === notesMdHash13c ? [] : ["空库导出不得改写 notes.md"]),
    ],
  );

  // --- r13-2：状态行 / 入参 / 正文逐字节（组 r13-report-content，3 条 record，2 张截图） -------
  log("r13-2 报告内容：状态行文本 / 章节入参逐字段 / 正文逐字节与零副作用");
  await enterNotesProbe();
  await waitSectionReady();
  const seed13d = seedNotes();
  const expectedReport13d = [
    "# 阅读报告 · sample-paper.pdf",
    "",
    "> 由 PiX-Read 生成，每次导出都会覆盖。资料库：library；文档：sample-paper.pdf；生成时间：<STAMP>；阅读进度：第 1 / 3 页；共 3 条（摘录 2 · AI 结论 1）。",
    "",
    "## 1. Abstract · 第 1 页（1 条）",
    "",
    "### 第 1 页",
    "",
    `> ${seed13d[0].text}`,
    "",
    `备注：${seed13d[0].comment}`,
    "",
    "## 2. Method Overview · 第 2 页（2 条）",
    "",
    "### 第 2 页",
    "",
    `> ${seed13d[1].text}`,
    "",
    "---",
    "",
    "### 第 2 页 · AI 结论",
    "",
    `> ${seed13d[3].text}`,
    "",
    `备注：${seed13d[3].comment}`,
  ].join("\n") + "\n";
  const notesHash13d = notesHash();
  const notesMdHash13d = fileHash(NOTES_MD_FILE);
  const callsBase13d = (await notesReportCalls()).count;
  // 现场稳定：等阅读现场的去抖落盘（DEBOUNCE_MS=600）结束，否则 reader-state.json 会落在两次快照之间
  for (let attempt = 0; attempt < 30 && fileHash(STATE_FILE_A) === null; attempt += 1) await sleep(100);
  const pixReadBefore13d = pixReadEntries();
  await clickEl(SEL.reportBtn);
  await waitFor("报告状态行", `document.querySelector(${JSON.stringify(SEL.reportRow)})`);
  const probe13d = await reportProbe();
  await capturePage(win, "r13-2-report-row.png");
  await capturePage(win, "r13-2b-report-row-left-pane.png", await rectOfSelector(SEL.layoutLeft));
  record(
    "r13-report-content",
    {
      phase: "export-success",
      rowText: probe13d.rowText,
      revealText: probe13d.revealText,
      notice: await notesNotice(),
      fileExists: reportExists("sample-paper.pdf.md"),
      pixReadBefore: pixReadBefore13d,
    },
    [
      ...(probe13d.rowText === "报告：sample-paper.pdf（3 条）→ .pix-read/reports/sample-paper.pdf.md"
        ? []
        : [`状态行文本异常：${probe13d.rowText}`]),
      ...(probe13d.revealText === "在文件夹中显示" ? [] : [`行按钮文本异常：${probe13d.revealText}`]),
      ...((await notesNotice()) === null ? [] : ["成功只应给状态行一处反馈（不得弹提示）"]),
      ...(reportExists("sample-paper.pdf.md") ? [] : ["导出成功后报告文件应存在"]),
    ],
  );

  const payload13d = await lastReportPayload();
  const callsAfter13d = (await notesReportCalls()).count;
  record(
    "r13-report-content",
    {
      phase: "payload",
      callsDelta: callsAfter13d - callsBase13d,
      docFilePath: payload13d ? payload13d.docFilePath : null,
      chapters: payload13d ? payload13d.chapters : null,
      progress: payload13d ? payload13d.progress : null,
    },
    [
      ...(payload13d && payload13d.docFilePath === join(LIBRARY_DIR, "sample-paper.pdf")
        ? []
        : [`入参文档路径异常：${JSON.stringify(payload13d ? payload13d.docFilePath : null)}`]),
      ...(payload13d && JSON.stringify(payload13d.chapters) === JSON.stringify(EXPECT_CHAPTERS_13)
        ? []
        : [`章节入参逐字段不符：${JSON.stringify(payload13d ? payload13d.chapters : null)}`]),
      ...(payload13d && payload13d.progress && payload13d.progress.page === 1 && payload13d.progress.pageCount === 3
        ? []
        : [`阅读进度入参异常：${JSON.stringify(payload13d ? payload13d.progress : null)}`]),
      ...(callsAfter13d - callsBase13d === 1 ? [] : [`一次点击只应发 1 次调用：${callsAfter13d - callsBase13d}`]),
    ],
  );

  const rawReport13d = readReport("sample-paper.pdf.md");
  const normalized13d = normalizeStamp(rawReport13d);
  const stampHits13d = rawReport13d.match(new RegExp(REPORT_STAMP_RE.source, "g")) ?? [];
  const stampValue13d = (stampHits13d[0] ?? "").replace("生成时间：", "");
  const pixReadAdded13d = [
    ...pixReadEntries().filter((name) => !pixReadBefore13d.includes(name)),
  ];
  const pixReadRemoved13d = pixReadBefore13d.filter((name) => !pixReadEntries().includes(name));
  record(
    "r13-report-content",
    {
      phase: "content-verbatim",
      reportText: normalized13d,
      stampOk: stampHits13d.length === 1 && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stampValue13d),
      notesHashSame: notesHash() === notesHash13d,
      notesMdHashSame: fileHash(NOTES_MD_FILE) === notesMdHash13d,
      pixReadAdded: pixReadAdded13d,
      pixReadRemoved: pixReadRemoved13d,
    },
    [
      ...(normalized13d === expectedReport13d
        ? []
        : [`报告正文与手写期望串不等：${JSON.stringify({ actual: normalized13d, expected: expectedReport13d })}`]),
      ...(stampHits13d.length === 1 && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stampValue13d)
        ? []
        : [`生成时间字段异常：${JSON.stringify({ hits: stampHits13d.length, value: stampValue13d })}`]),
      ...(notesHash() === notesHash13d ? [] : ["报告导出不得改写 notes.json"]),
      ...(fileHash(NOTES_MD_FILE) === notesMdHash13d ? [] : ["报告导出不得改写 notes.md"]),
      ...(pixReadAdded13d.length === 1 && pixReadAdded13d[0] === "reports" && pixReadRemoved13d.length === 0
        ? []
        : [`在 .pix-read 下应只新增 reports：${JSON.stringify({ added: pixReadAdded13d, removed: pixReadRemoved13d })}`]),
    ],
  );

  // --- r13-3：兜底组与幂等（组 r13-report-fallback，2 条 record，1 张截图） -----------------
  log("r13-3 兜底组：越界页恒最后 + 搜索生效时报告仍 4 条 + 二次导出幂等（不重置现场）");
  await enterNotesProbe([...seedNotes(), outOfRangeNote()], 5);
  await waitSectionReady();
  await clickEl(".notes-export-btn");
  await waitFor("既有导出行", `document.querySelector(".notes-export-row .export-text")`);
  await setSearch("Table 2");
  await waitFor("搜索生效（1 行）", `document.querySelectorAll(${JSON.stringify(SEL.noteRow)}).length === 1`);
  const callsBase13e = (await notesReportCalls()).count;
  await clickEl(SEL.reportBtn);
  await waitFor("报告状态行", `document.querySelector(${JSON.stringify(SEL.reportRow)})`);
  const report13e = readReport("sample-paper.pdf.md");
  const groups13e = reportGroups(report13e);
  const meta13e = reportMetaLine(report13e);
  const searchState13e = await searchProbe();
  const exportText13e = await textOf(".notes-export-row .export-text");
  const probe13e = await reportProbe();
  const outOfRangeText13e = outOfRangeNote().text;
  await capturePage(win, "r13-3-report-fallback-row.png", await rectOfSelector(SEL.layoutLeft));
  record(
    "r13-report-fallback",
    {
      phase: "fallback",
      groups: groups13e,
      outOfRangeCount: report13e.split(outOfRangeText13e).length - 1,
      stats: meta13e,
      searchValue: searchState13e.value,
      visibleRows: searchState13e.rows,
      exportText: exportText13e,
      bothRows: probe13e.rowInDom && exportText13e !== null,
      reportText: normalizeStamp(report13e),
    },
    [
      ...(JSON.stringify(groups13e) ===
      JSON.stringify(["## 1. Abstract · 第 1 页（1 条）", "## 2. Method Overview · 第 2 页（2 条）", "## 未归入章节（1 条）"])
        ? []
        : [`组标题集合异常：${JSON.stringify(groups13e)}`]),
      ...(report13e.split(outOfRangeText13e).length - 1 === 1 ? [] : ["越界条正文应恰好出现一次"]),
      ...(report13e.indexOf(seedNotes()[1].text) < report13e.indexOf(seedNotes()[3].text)
        ? []
        : ["第 2 页组内应先摘录后 AI 结论"]),
      ...(meta13e && meta13e.includes("共 4 条（摘录 3 · AI 结论 1）") ? [] : [`统计段异常：${meta13e}`]),
      ...(searchState13e.value === "Table 2" && searchState13e.rows === 1
        ? []
        : [`搜索应生效（1 行）：${JSON.stringify(searchState13e)}`]),
      ...(exportText13e === "已导出 5 条 → .pix-read/notes.md" ? [] : [`既有导出行文本异常：${exportText13e}`]),
      ...(probe13e.rowInDom ? [] : ["报告状态行应在 DOM（与既有导出行共存）"]),
      ...(probe13e.rowText === "报告：sample-paper.pdf（4 条）→ .pix-read/reports/sample-paper.pdf.md"
        ? []
        : [`状态行文本异常（搜索生效时条数不得变）：${probe13e.rowText}`]),
    ],
  );

  const callsBefore13e = (await notesReportCalls()).count;
  writeFileSync(REPORT_SAMPLE, "STALE-CONTENT\n");
  await clickEl(SEL.reportBtn);
  await waitReportSettled(callsBefore13e + 1);
  await waitFor("报告状态行仍在", `document.querySelector(${JSON.stringify(SEL.reportRow)})`);
  const afterIdem13e = normalizeStamp(readReport("sample-paper.pdf.md"));
  const probe13e2 = await reportProbe();
  const callsAfter13e = (await notesReportCalls()).count;
  record(
    "r13-report-fallback",
    {
      phase: "idempotent",
      sameAsFirst: afterIdem13e === normalizeStamp(report13e),
      staleGone: !afterIdem13e.includes("STALE-CONTENT"),
      callsDelta: callsAfter13e - callsBase13e,
      rowText: probe13e2.rowText,
    },
    [
      ...(afterIdem13e === normalizeStamp(report13e)
        ? []
        : [`二次导出应与首次逐字节相同：${JSON.stringify({ second: afterIdem13e, first: normalizeStamp(report13e) })}`]),
      ...(afterIdem13e.includes("STALE-CONTENT") ? ["整文件覆盖：不得残留旧内容"] : []),
      ...(callsAfter13e - callsBase13e === 2 ? [] : [`同一文档两次导出应恰 2 次调用：${callsAfter13e - callsBase13e}`]),
      ...(probe13e2.rowText === "报告：sample-paper.pdf（4 条）→ .pix-read/reports/sample-paper.pdf.md"
        ? []
        : [`二次导出的状态行文本异常：${probe13e2.rowText}`]),
    ],
  );

  // --- r13-4：退化与子目录（组 r13-report-degrade，2 条 record，2 张截图） --------------------
  log("r13-4 退化：无 outline 按页分组 + 子目录报告路径 + 文本文档无进度");
  await enterCleanWorkspace(seedNotes());
  await openRow("older-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 2);
  await settleEmptyOutline();
  await openNotesPanel(4);
  await clickEl(SEL.reportBtn);
  await waitFor("报告状态行", `document.querySelector(${JSON.stringify(SEL.reportRow)})`);
  const probe13f = await reportProbe();
  const report13f = readReport("archive/older-paper.pdf.md");
  const groups13f = reportGroups(report13f);
  const meta13f = reportMetaLine(report13f);
  const payload13f = await lastReportPayload();
  await capturePage(win, "r13-4-report-degrade-subdir.png", await rectOfSelector(SEL.layoutLeft));
  record(
    "r13-report-degrade",
    {
      phase: "no-chapter-subdir",
      rowText: probe13f.rowText,
      groups: groups13f,
      meta: meta13f,
      chapters: payload13f ? payload13f.chapters : null,
    },
    [
      ...(probe13f.rowText === "报告：older-paper.pdf（1 条）→ .pix-read/reports/archive/older-paper.pdf.md"
        ? []
        : [`状态行文本异常：${probe13f.rowText}`]),
      ...(JSON.stringify(groups13f) === JSON.stringify(["## 第 7 页（1 条）"])
        ? []
        : [`无章节退化分组异常：${JSON.stringify(groups13f)}`]),
      ...(report13f.includes(" · 第 ") ? ["无章节文档不得产出章节标题"] : []),
      ...(report13f.includes("未归入章节") ? ["chapters === [] 时不得出现兜底组"] : []),
      ...(meta13f && meta13f.includes("文档：archive/older-paper.pdf") && meta13f.includes("阅读进度：第 1 / 2 页")
        ? []
        : [`元信息行异常：${meta13f}`]),
      ...(payload13f && Array.isArray(payload13f.chapters) && payload13f.chapters.length === 0
        ? []
        : [`无 outline 时章节入参应为空数组：${JSON.stringify(payload13f ? payload13f.chapters : null)}`]),
    ],
  );

  await js(`window.__pixStub.seedNotes(${JSON.stringify([...seedNotes(), textDocNote()])}), true`);
  await backToLibraryTab();
  await openRow("reading-notes.md");
  await waitFor("Markdown 预览", `document.querySelector(".reader-body")`);
  const rowCleared13f = !(await has(SEL.reportRow));
  await openNotesPanel(5);
  await clickEl(SEL.reportBtn);
  await waitFor("报告状态行", `document.querySelector(${JSON.stringify(SEL.reportRow)})`);
  const probe13f2 = await reportProbe();
  const report13f2 = readReport("reading-notes.md.md");
  const payload13f2 = await lastReportPayload();
  await capturePage(win, "r13-4b-report-degrade-text-doc.png", await rectOfSelector(SEL.layoutLeft));
  record(
    "r13-report-degrade",
    {
      phase: "text-doc",
      groups: reportGroups(report13f2),
      meta: reportMetaLine(report13f2),
      payload: payload13f2
        ? { chapters: payload13f2.chapters, progress: payload13f2.progress, docFilePath: payload13f2.docFilePath }
        : null,
      rowText: probe13f2.rowText,
      rowCleared: rowCleared13f,
    },
    [
      ...(JSON.stringify(reportGroups(report13f2)) === JSON.stringify(["## 第 1 页（1 条）"])
        ? []
        : [`文本文档退化分组异常：${JSON.stringify(reportGroups(report13f2))}`]),
      ...(reportMetaLine(report13f2) && !reportMetaLine(report13f2).includes("阅读进度：")
        ? []
        : [`无进度时不得输出阅读进度段：${reportMetaLine(report13f2)}`]),
      ...(reportMetaLine(report13f2) && reportMetaLine(report13f2).includes("文档：reading-notes.md")
        ? []
        : [`元信息行文档段异常：${reportMetaLine(report13f2)}`]),
      ...(payload13f2 && Array.isArray(payload13f2.chapters) && payload13f2.chapters.length === 0 && payload13f2.progress === null
        ? []
        : [`文本文档入参应为（chapters [] + progress null）：${JSON.stringify(payload13f2)}`]),
      ...(probe13f2.rowText === "报告：reading-notes.md（1 条）→ .pix-read/reports/reading-notes.md.md"
        ? []
        : [`状态行文本异常：${probe13f2.rowText}`]),
      ...(rowCleared13f ? [] : ["切文档后上一份报告行不得残留"]),
    ],
  );

  // --- r13-5：失败 / 显示 / 在途（组 r13-report-failure，3 条 record，1 张截图） -------------
  log("r13-5 失败路径：写失败与重试 / 在文件夹中显示 / 在途切文档丢弃");
  rmSync(REPORT_DIR, { recursive: true, force: true });
  await enterNotesProbe();
  const callsBase13g = (await notesReportCalls()).count;
  await setNotesReportFailure("write-failed");
  await clickEl(SEL.reportBtn);
  await waitFor("写失败提示", `document.querySelector(".notes-notice.is-error")`);
  const notice13g = await notesNotice();
  const probe13g = await reportProbe();
  const failFile13g = reportExists("sample-paper.pdf.md");
  const failCalls13g = (await notesReportCalls()).count;
  await capturePage(win, "r13-5-report-failure-notice.png", await rectOfSelector(SEL.layoutLeft));
  await setNotesReportFailure(null);
  await clickEl(SEL.reportBtn);
  await waitFor("重试后报告状态行", `document.querySelector(${JSON.stringify(SEL.reportRow)})`);
  const probe13g2 = await reportProbe();
  const retryFile13g = reportExists("sample-paper.pdf.md");
  const retryCalls13g = (await notesReportCalls()).count;
  record(
    "r13-report-failure",
    {
      phase: "write-failed-retry",
      notice: notice13g,
      rowInDom: probe13g.rowInDom,
      fileExists: failFile13g,
      failCallsDelta: failCalls13g - callsBase13g,
      callsDelta: retryCalls13g - callsBase13g,
      retryRow: probe13g2.rowText,
      retryFile: retryFile13g,
    },
    [
      ...(notice13g && notice13g.isError && notice13g.text === "生成报告失败：报告写入失败"
        ? []
        : [`写失败提示异常：${JSON.stringify(notice13g)}`]),
      ...(probe13g.rowInDom === false ? [] : [`写失败不得产生状态行：${probe13g.rowText}`]),
      ...(failFile13g === false ? [] : ["写失败不得留下报告文件"]),
      ...(failCalls13g - callsBase13g === 1 ? [] : [`写失败前应恰有 1 次真实调用：${failCalls13g - callsBase13g}`]),
      ...(probe13g2.rowText === "报告：sample-paper.pdf（3 条）→ .pix-read/reports/sample-paper.pdf.md"
        ? []
        : [`重试后状态行异常：${probe13g2.rowText}`]),
      ...(retryFile13g ? [] : ["重试后报告文件应存在（目录被重建）"]),
      ...(retryCalls13g - callsBase13g === 2 ? [] : [`重试后应恰 2 次调用：${retryCalls13g - callsBase13g}`]),
    ],
  );

  const hashBeforeReveal13g = fileHash(REPORT_SAMPLE);
  const showBase13g = (await libraryShowCalls()).count;
  await clickEl(SEL.reportReveal);
  await waitFor("显示调用落地", `window.__pixStub.libraryShowCalls().count === ${showBase13g + 1}`);
  const showCalls13g = await libraryShowCalls();
  const hashAfterReveal13g = fileHash(REPORT_SAMPLE);
  await backToLibraryTab();
  await openRow("older-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 2);
  const rowAfterSwitch13g = await has(SEL.reportRow);
  await openRow("sample-paper.pdf");
  await waitPage(1, 3);
  await openNotesPanel(4);
  await clickEl(SEL.reportBtn);
  await waitFor("报告状态行回来", `document.querySelector(${JSON.stringify(SEL.reportRow)})`);
  const probe13g3 = await reportProbe();
  record(
    "r13-report-failure",
    {
      phase: "reveal-and-clear",
      showPaths: showCalls13g.paths,
      hashSame: hashAfterReveal13g === hashBeforeReveal13g,
      rowAfterSwitch: rowAfterSwitch13g,
      rowText: probe13g3.rowText,
    },
    [
      ...(showCalls13g.paths.slice(-1)[0] === REPORT_SAMPLE
        ? []
        : [`「在文件夹中显示」路径异常：${JSON.stringify(showCalls13g.paths)}`]),
      ...(hashAfterReveal13g === hashBeforeReveal13g ? [] : ["显示动作不得改写报告文件"]),
      ...(rowAfterSwitch13g === false ? [] : ["切文档后报告行应清除"]),
      ...(probe13g3.rowText === "报告：sample-paper.pdf（3 条）→ .pix-read/reports/sample-paper.pdf.md"
        ? []
        : [`切回后重新导出的状态行异常：${probe13g3.rowText}`]),
    ],
  );

  await enterNotesProbe();
  const callsBase13h = (await notesReportCalls()).count;
  await setNotesReportDelay(1200);
  await clickEl(SEL.reportBtn);
  await clickEl(SEL.reportBtn);
  const callsAfterDouble13h = (await notesReportCalls()).count;
  await backToLibraryTab();
  await openRow("older-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 2);
  await openNotesPanel(4);
  await waitReportSettled(callsBase13h + 1);
  const probe13h = await reportProbe();
  const notice13h = await notesNotice();
  await setNotesReportDelay(0);
  record(
    "r13-report-failure",
    {
      phase: "inflight-guard",
      callsDelta: callsAfterDouble13h - callsBase13h,
      rowInDom: probe13h.rowInDom,
      notice: notice13h,
    },
    [
      ...(callsAfterDouble13h - callsBase13h === 1
        ? []
        : [`在途重复点击不得发第二次 IPC：${callsAfterDouble13h - callsBase13h}`]),
      ...(probe13h.rowInDom === false ? [] : [`在途切文档后迟到的响应应被丢弃：${probe13h.rowText}`]),
      ...(notice13h === null ? [] : [`在途结果丢弃后不得弹提示：${JSON.stringify(notice13h)}`]),
    ],
  );

  await restoreStandardSeed();

  // -------------------------------------------------------------------------
  // 场景 r14-1…r14-5：资产贯通（N87–N90，设计档 §5.4）
  //
  // 挂载位置：本函数末尾（R13 场景之后）。每个场景自带复位、以自己的
  // restoreStandardSeed() 收尾；外部改动一律由 Node 侧真写真改（模拟编辑器）。
  // 命名登记：设计档 §5.4.2 的 badgeProbe / staleProbe 与本作用域既有常量重名
  // （早前场景的局部读数变量），故改名为 badgeRowProbe / staleRowProbe（语义不变）。
  // -------------------------------------------------------------------------

  const statCalls = () => js("window.__pixStub.notesStatCalls()");
  const setNotesStatFailure = (code) => js(`window.__pixStub.setNotesStatFailure(${JSON.stringify(code)}), true`);
  const triggerWindowFocus = () => js(`window.dispatchEvent(new Event("focus")), true`);

  /** 树行徽标现场：文本 / tooltip / 盒模型 / 让位判据两侧读数（一次 js 读完，字段集合封闭）。 */
  const badgeRowProbe = (expr) => js(`(() => {
    const box = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, w: b.width, h: b.height }; };
    const text = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
    const rows = Array.from(document.querySelectorAll(".tree-row"));
    const row = rows.find(${expr});
    if (!row) return null;
    const style = getComputedStyle(row);
    const notes = row.querySelector(".row-notes");
    const progress = row.querySelector(".row-progress");
    const label = row.querySelector(".row-label");
    const spacer = row.querySelector(".row-chevron-spacer");
    const icon = row.querySelector(".row-icon");
    const paddingLeft = parseFloat(style.paddingLeft);
    const paddingRight = parseFloat(style.paddingRight);
    const gap = parseFloat(style.columnGap) || 0;
    const spacerWidth = spacer ? spacer.getBoundingClientRect().width : 0;
    const iconWidth = icon ? icon.getBoundingClientRect().width : 0;
    const progressClientWidth = progress ? progress.clientWidth : 0;
    const labelFloor =
      row.clientWidth - paddingLeft - paddingRight - spacerWidth - iconWidth - progressClientWidth - 4 * gap;
    return {
      title: row.getAttribute("title"),
      text: text(notes),
      notesTitle: notes ? notes.getAttribute("title") : null,
      notesCount: row.querySelectorAll(".row-notes").length,
      notesClientWidth: notes ? notes.clientWidth : null,
      notesScrollWidth: notes ? notes.scrollWidth : null,
      notesBox: notes ? box(notes) : null,
      progress: text(progress),
      progressCount: row.querySelectorAll(".row-progress").length,
      progressClientWidth,
      progressBox: progress ? box(progress) : null,
      labelClientWidth: label ? label.clientWidth : null,
      labelScrollWidth: label ? label.scrollWidth : null,
      labelFloor,
      rowClientWidth: row.clientWidth,
      rowScrollWidth: row.scrollWidth,
      rowBox: box(row),
      spacing: { paddingLeft, paddingRight, gap, spacerWidth, iconWidth },
      domOrder: !!(label && notes && progress) && (label.compareDocumentPosition(notes) & 4) === 4 && (notes.compareDocumentPosition(progress) & 4) === 4,
    };
  })()`);

  /** 提示行现场：文本 / 按钮 / DOM 位次（.notes-panel 直接子元素的类名序列）。 */
  const staleRowProbe = () => js(`(() => {
    const panel = document.querySelector(".notes-panel");
    const names = Array.from(panel.children).map((el) => String(el.className).split(" ")[0]);
    const at = (name) => names.indexOf(name);
    const row = document.querySelector(".notes-stale");
    const text = row ? row.querySelector(".stale-text") : null;
    const btn = row ? row.querySelector(".stale-refresh") : null;
    return {
      present: !!row,
      text: text ? text.textContent.replace(/\\s+/g, " ").trim() : null,
      btnText: btn ? btn.textContent.replace(/\\s+/g, " ").trim() : null,
      btnTitle: btn ? btn.getAttribute("title") : null,
      btnHeight: btn ? Math.round(btn.getBoundingClientRect().height) : null,
      btnDisabled: btn ? btn.disabled : null,
      order: {
        names,
        header: at("notes-header"),
        notice: at("notes-notice"),
        stale: at("notes-stale"),
        undo: at("notes-undo"),
        exportRow: at("notes-export-row"),
        reportRow: at("notes-report-row"),
        list: at("notes-list"),
      },
    };
  })()`);

  /** 徽标文本轮询表达式（面板打开时树隐藏、几何为 0 ⇒ 只读 textContent；缺席返回 false）。 */
  const badgeTextWaitExpr = (suffix, expected) => `(() => {
    const rows = Array.from(document.querySelectorAll(".tree-row"));
    const row = rows.find((el) => (el.getAttribute("title") || "").endsWith(${JSON.stringify(suffix)}));
    const el = row ? row.querySelector(".row-notes") : null;
    return !!el && el.textContent.replace(/\\s+/g, " ").trim() === ${JSON.stringify(expected)};
  })()`;

  /** Node 侧笔记文件改写（与 stub 的 writeNotesFile 同字节格式）：外部改动必须真写真改。 */
  const writeNotesOutside = (list) =>
    writeFileSync(NOTES_FILE, `${JSON.stringify({ version: 1, notes: list }, null, 2)}\n`, "utf8");
  const appendExternalNote = (note) => writeNotesOutside([...readNotes(), note]);
  const removeExternalNote = (id) => writeNotesOutside(readNotes().filter((note) => note.id !== id));

  const EXTERNAL_TEXT = "External edit: this note was appended outside the app.";
  const externalNote = (id, docPath) => ({ id, kind: "excerpt", docPath, page: 1, text: EXTERNAL_TEXT, comment: "", createdAt: Date.now(), updatedAt: Date.now() });
  const EXTERNAL_1 = externalNote("n-external-1", "archive/older-paper.pdf");
  const EXTERNAL_2 = externalNote("n-external-2", "reading-notes.md");
  const EXTERNAL_3 = externalNote("n-external-3", "sample-paper.pdf");

  const SAMPLE_ROW = `(el) => (el.getAttribute("title") || "").endsWith("sample-paper.pdf")`;
  const OLDER_ROW = `(el) => (el.getAttribute("title") || "").endsWith("older-paper.pdf")`;
  const rowByLabelExpr = (name) =>
    `(el) => { const l = el.querySelector(".row-label"); return !!l && l.textContent.trim() === ${JSON.stringify(name)}; }`;
  /** 徽标让位判据（设计档 §1.4）：labelClientWidth ≥ min(labelScrollWidth, labelFloor) − 1。 */
  const badgeYieldOk = (probe) =>
    !!probe && probe.labelClientWidth >= Math.min(probe.labelScrollWidth, probe.labelFloor) - 1;
  const rowFits = (probe) => !!probe && probe.rowScrollWidth <= probe.rowClientWidth + 1;
  const progressPinnedRight = (probe) =>
    !!probe && probe.progressBox.right >= probe.rowBox.right - probe.spacing.paddingRight - 1;

  // --- r14-1 树行笔记徽标：完整 / 压缩两种形态 + 实时联动 + 窄栏让位 -------------
  log("r14-1 树行笔记徽标（默认宽度 / 实时联动 / 窄栏让位）");
  await goHome();
  await clearStateA();
  writeState(STATE_FILE_A, {
    version: 1,
    lastDocPath: "sample-paper.pdf",
    documents: { "sample-paper.pdf": entry(2, 1), "archive/older-paper.pdf": entry(1024, 1.1) },
  });
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(5);
  await js(`window.__pixStub.seedNotes(${JSON.stringify(seedNotes())}), true`);
  await waitFor("树徽标行数 = 2", `document.querySelectorAll(${JSON.stringify(SEL.rowNotes)}).length === 2`);
  const badgePhase = {
    sample: await badgeRowProbe(SAMPLE_ROW),
    older: await badgeRowProbe(OLDER_ROW),
    notes: await badgeRowProbe(rowByLabelExpr("reading-notes.md")),
    longBook: await badgeRowProbe(rowByLabelExpr("long-book.pdf")),
    archive: await badgeRowProbe(rowByLabelExpr("archive")),
  };
  await capturePage(win, "r14-1-tree-notes-badge.png", await rectOfSelector(SEL.layoutLeft));
  const badgeData = {
    phase: "badges",
    sample: badgePhase.sample,
    older: badgePhase.older,
    notesRow: badgePhase.notes,
    archiveRow: badgePhase.archive,
    longBookRow: badgePhase.longBook,
  };
  record("r14-tree-badge", badgeData, [
    ...(badgePhase.sample &&
    badgePhase.sample.text === "3 条" &&
    badgePhase.sample.notesTitle === "摘录 2 条 · AI 结论 1 条" &&
    badgePhase.sample.notesScrollWidth <= badgePhase.sample.notesClientWidth + 1
      ? []
      : [`sample 行徽标应为完整「3 条」：${JSON.stringify(badgePhase.sample)}`]),
    ...(badgePhase.older &&
    badgePhase.older.text === "1 条" &&
    badgePhase.older.notesTitle === "摘录 1 条 · AI 结论 0 条" &&
    badgePhase.older.notesClientWidth >= 9 &&
    badgePhase.older.notesClientWidth <= 11 &&
    badgePhase.older.notesScrollWidth > badgePhase.older.notesClientWidth &&
    (badgePhase.older.notesClientWidth === 0 || badgePhase.older.notesClientWidth >= 5)
      ? []
      : [`older 行徽标应为压缩态（≈10px、无空胶囊）：${JSON.stringify(badgePhase.older)}`]),
    ...(badgePhase.notes && badgePhase.longBook && badgePhase.archive &&
    [badgePhase.notes, badgePhase.longBook, badgePhase.archive].every((probe) => probe.notesCount === 0 && probe.progressCount === 0)
      ? []
      : [`无笔记行不得出现任何标记：${JSON.stringify([badgePhase.notes, badgePhase.longBook, badgePhase.archive])}`]),
    ...(badgePhase.sample && badgePhase.older &&
    badgePhase.sample.progress === "第 2 页" &&
    badgePhase.older.progress === "第 1024 页" &&
    progressPinnedRight(badgePhase.sample) &&
    progressPinnedRight(badgePhase.older) &&
    badgePhase.sample.notesBox.right <= badgePhase.sample.progressBox.left &&
    badgePhase.older.notesBox.right <= badgePhase.older.progressBox.left &&
    badgePhase.sample.domOrder === true &&
    badgePhase.older.domOrder === true
      ? []
      : [`行内两枚标记的文本 / 右缘 / 不重叠 / 位次异常：${JSON.stringify({ sample: badgePhase.sample, older: badgePhase.older })}`]),
    ...([badgePhase.sample, badgePhase.older, badgePhase.notes, badgePhase.longBook, badgePhase.archive].every(overflowFree) &&
    badgeYieldOk(badgePhase.sample) &&
    badgeYieldOk(badgePhase.older)
      ? []
      : [`行级溢出或徽标反向挤动行名：${JSON.stringify({ sample: badgePhase.sample, older: badgePhase.older })}`]),
  ]);

  await openNotesPanel(4);
  await deleteRowByText("Table 2 repo");
  await waitFor("sample 徽标 → 2 条", badgeTextWaitExpr("sample-paper.pdf", "2 条"));
  const liveAfterDelete = await badgeRowProbe(SAMPLE_ROW);
  const liveRowsAfterDelete = await countOf(SEL.noteRow);
  await clickUndo();
  await waitFor("sample 徽标 → 3 条", badgeTextWaitExpr("sample-paper.pdf", "3 条"));
  const liveAfterUndo = await badgeRowProbe(SAMPLE_ROW);
  const liveRowsAfterUndo = await countOf(SEL.noteRow);
  await setSearch("Reproducibility");
  await waitFor("搜索命中 1 条", `document.querySelectorAll(${JSON.stringify(SEL.noteRow)}).length === 1`);
  const liveFilteredCount = await textOf(".notes-count");
  const liveGroupCounts = await groupHeads();
  const liveBadgeUnderFilter = await badgeRowProbe(SAMPLE_ROW);
  await setSearch("");
  await waitFor("搜索清空后回到 4 行", `document.querySelectorAll(${JSON.stringify(SEL.noteRow)}).length === 4`);
  record(
    "r14-tree-badge",
    {
      phase: "live",
      afterDelete: liveAfterDelete,
      afterUndo: liveAfterUndo,
      rows: { afterDelete: liveRowsAfterDelete, afterUndo: liveRowsAfterUndo },
      filteredCount: liveFilteredCount,
      groupCounts: liveGroupCounts,
      badgeUnderFilter: liveBadgeUnderFilter,
    },
    [
      ...(liveAfterDelete && liveAfterDelete.text === "2 条" && liveAfterDelete.notesTitle === "摘录 1 条 · AI 结论 1 条"
        ? []
        : [`删除后徽标未联动：${JSON.stringify(liveAfterDelete)}`]),
      ...(liveAfterUndo && liveAfterUndo.text === "3 条" && liveAfterUndo.notesTitle === "摘录 2 条 · AI 结论 1 条"
        ? []
        : [`撤销后徽标未回位：${JSON.stringify(liveAfterUndo)}`]),
      ...(liveRowsAfterDelete === 3 && liveRowsAfterUndo === 4
        ? []
        : [`列表未真实变化（徽标断言会变空断言）：${liveRowsAfterDelete} → ${liveRowsAfterUndo}`]),
      ...(liveGroupCounts.length === 1 &&
      !liveGroupCounts.some((head) => head.count === "共 3 条") &&
      liveBadgeUnderFilter &&
      liveBadgeUnderFilter.text === "3 条"
        ? []
        : [`过滤态口径异常（徽标恒示全量）：${JSON.stringify({ count: liveFilteredCount, groups: liveGroupCounts, badge: liveBadgeUnderFilter })}`]),
    ],
  );

  await backToLibraryTab();
  await js(`document.documentElement.style.setProperty("--pix-left-width", "220px"), true`);
  await repaint(win);
  const narrowLeft = await js(`Math.round(document.querySelector(${JSON.stringify(SEL.layoutLeft)}).getBoundingClientRect().width)`);
  const narrowSample = await badgeRowProbe(SAMPLE_ROW);
  const narrowOlder = await badgeRowProbe(OLDER_ROW);
  await capturePage(win, "r14-1b-tree-badges-narrow.png", await rectOfSelector(SEL.layoutLeft));
  await js(`document.documentElement.style.removeProperty("--pix-left-width"), true`);
  await repaint(win);
  const restoredLeft = await js(`Math.round(document.querySelector(${JSON.stringify(SEL.layoutLeft)}).getBoundingClientRect().width)`);
  const restoredSample = await badgeRowProbe(SAMPLE_ROW);
  const restoredOlder = await badgeRowProbe(OLDER_ROW);
  const badgeWidthOk = (probe) => !!probe && (probe.notesClientWidth === 0 || probe.notesClientWidth >= 5);
  record(
    "r14-tree-badge",
    {
      phase: "narrow",
      leftWidth: narrowLeft,
      row: {
        sample: { rowScrollWidth: narrowSample.rowScrollWidth, rowClientWidth: narrowSample.rowClientWidth },
        older: { rowScrollWidth: narrowOlder.rowScrollWidth, rowClientWidth: narrowOlder.rowClientWidth },
      },
      notesBadge: { sample: narrowSample, older: narrowOlder },
      progressBadge: {
        sample: { progress: narrowSample.progress, progressClientWidth: narrowSample.progressClientWidth },
        older: { progress: narrowOlder.progress, progressClientWidth: narrowOlder.progressClientWidth },
      },
      restored: { leftWidth: restoredLeft, sample: restoredSample, older: restoredOlder },
    },
    [
      ...(narrowLeft >= 218 && narrowLeft <= 222 ? [] : [`窄栏宽度异常：${narrowLeft}`]),
      ...(narrowSample && narrowOlder && narrowSample.notesCount === 1 && narrowOlder.notesCount === 1 &&
      narrowSample.notesClientWidth !== null && narrowOlder.notesClientWidth !== null
        ? []
        : ["窄栏相位徽标缺席（防空）：选择器或渲染异常"]),
      ...(rowFits(narrowSample) && rowFits(narrowOlder) ? [] : [`窄栏下树行横向溢出：${JSON.stringify([narrowSample, narrowOlder])}`]),
      ...(narrowSample.progress === "第 2 页" &&
      narrowOlder.progress === "第 1024 页" &&
      Math.abs(narrowSample.progressClientWidth - badgePhase.sample.progressClientWidth) <= 1 &&
      Math.abs(narrowOlder.progressClientWidth - badgePhase.older.progressClientWidth) <= 1 &&
      progressPinnedRight(narrowSample) &&
      progressPinnedRight(narrowOlder)
        ? []
        : [`窄栏下进度徽标不得位移 / 变形：${JSON.stringify({ narrow: [narrowSample, narrowOlder], base: [badgePhase.sample, badgePhase.older] })}`]),
      ...(badgeYieldOk(narrowSample) && badgeYieldOk(narrowOlder)
        ? []
        : [`窄栏下徽标反向挤动行名：${JSON.stringify({ sample: narrowSample, older: narrowOlder })}`]),
      ...(badgeWidthOk(narrowSample) && badgeWidthOk(narrowOlder) ? [] : ["窄栏下徽标出现空胶囊：宽度既非 0 也小于 5"]),
      ...(Math.abs(restoredLeft - 268) <= 2 ? [] : [`窄栏变量未复位：${restoredLeft}`]),
      ...(restoredSample && restoredOlder &&
      restoredSample.notesScrollWidth <= restoredSample.notesClientWidth + 1 &&
      restoredOlder.notesClientWidth >= 9 &&
      restoredOlder.notesClientWidth <= 11 &&
      rowFits(restoredSample) &&
      rowFits(restoredOlder) &&
      badgeYieldOk(restoredSample) &&
      badgeYieldOk(restoredOlder)
        ? []
        : [`复原后徽标未回到默认读数：${JSON.stringify({ left: restoredLeft, sample: restoredSample, older: restoredOlder })}`]),
    ],
  );

  // --- r14-2 徽标作用域：B 工作区 0 徽标 + 回切 A 恢复 ---------------------------
  log("r14-2 徽标作用域（B 无徽标 / 回切 A 恢复）");
  await restoreStandardSeed();
  const loadBaseR142 = await loadCalls();
  await goHome();
  await enterWorkspace(LIBRARY_B_NAME);
  await waitTreeRows(1);
  await js(`document.querySelector('.pill-tab[data-tab="notes"]').click(), true`);
  await waitFor("B 笔记空态", `document.querySelector(".notes-empty")`);
  const bTreeRow = await rowByTitle("sample-paper.pdf");
  const bBadgeCount = await countOf(SEL.rowNotes);
  const bEmptyShown = await has(".notes-empty");
  const bStale = await has(SEL.staleRow);
  const bLoadDelta = (await loadCalls()) - loadBaseR142;
  await capturePage(win, "r14-2-tree-badge-workspace-b.png", await rectOfSelector(SEL.layoutLeft));
  record(
    "r14-tree-badge-scope",
    { phase: "b-workspace", loadDelta: bLoadDelta, rows: bTreeRow, badgeCount: bBadgeCount, emptyShown: bEmptyShown, stale: bStale },
    [
      ...(bLoadDelta >= 1 ? [] : [`进入 B 工作区未读盘：${bLoadDelta}`]),
      ...(bTreeRow !== null && bBadgeCount === 0 ? [] : [`B 侧树上不得出现徽标：rows=${JSON.stringify(bTreeRow)} badgeCount=${bBadgeCount}`]),
      ...(bEmptyShown ? [] : ["B 侧笔记空态缺失（断言可能是未加载的假绿）"]),
      ...(bStale === false ? [] : ["B 侧不得出现外部改动提示"]),
    ],
  );

  await goHome();
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(5);
  await waitFor("回切 A 后徽标 ≥ 2", `document.querySelectorAll(${JSON.stringify(SEL.rowNotes)}).length >= 2`);
  const backSample = await badgeRowProbe(SAMPLE_ROW);
  const backOlder = await badgeRowProbe(OLDER_ROW);
  record(
    "r14-tree-badge-scope",
    { phase: "back-to-a", sample: backSample, older: backOlder },
    [
      ...(backSample && backSample.text === "3 条" && backOlder && backOlder.text === "1 条"
        ? []
        : [`回切 A 后徽标异常（跨工作区残留 / 未恢复）：${JSON.stringify({ sample: backSample, older: backOlder })}`]),
    ],
  );

  // --- r14-3 外部改动感知：进入不误报 / 焦点检测 / 刷新保留草稿 -------------------
  log("r14-3 外部改动感知（进入不误报 / 焦点检测 / 刷新保留草稿）");
  await goHome();
  await clearStateA();
  writeNotesOutside([...seedNotes(), EXTERNAL_1]);
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(5);
  await waitFor("5 条种子后的徽标行数 = 2", `document.querySelectorAll(${JSON.stringify(SEL.rowNotes)}).length === 2`);
  const freshSample = await badgeRowProbe(SAMPLE_ROW);
  const freshOlder = await badgeRowProbe(OLDER_ROW);
  await openNotesPanel(5);
  const freshRows = await countOf(SEL.noteRow);
  const freshStale = await has(SEL.staleRow);
  const freshExternalVisible = await js(`Boolean(${rowFinder(EXTERNAL_TEXT, false)})`);
  record(
    "r14-notes-stale",
    { phase: "enter-fresh", rows: freshRows, stale: freshStale, sample: freshSample, older: freshOlder },
    [
      ...(freshRows === 5 && freshExternalVisible ? [] : [`外部新增未随读盘进入面板：rows=${freshRows} external=${freshExternalVisible}`]),
      ...(freshStale === false ? [] : ["进入工作区即一致，不得误报外部改动"]),
      ...(freshSample && freshSample.text === "3 条" && freshOlder && freshOlder.text === "2 条"
        ? []
        : [`树徽标与文件不一致：${JSON.stringify({ sample: freshSample, older: freshOlder })}`]),
    ],
  );

  const detectStatBase = (await statCalls()).count;
  appendExternalNote(EXTERNAL_2);
  // 只读基线必须在外部写入之后、触发检测之前取：检测本身不得改文件
  const detectHashBefore = notesHash();
  await triggerWindowFocus();
  await waitFor("外部改动提示", `document.querySelector(${JSON.stringify(SEL.staleRow)})`);
  const detectStale = await staleRowProbe();
  const detectRows = await countOf(SEL.noteRow);
  const detectCount = await textOf(".notes-count");
  const detectStatDelta = (await statCalls()).count - detectStatBase;
  await js(`(() => {
    const row = document.querySelectorAll(${JSON.stringify(SEL.noteRow)})[0];
    const wrap = row ? row.querySelector(".note-select-wrap") : null;
    if (!wrap) throw new Error("note-select-wrap not found");
    wrap.click();
    return true;
  })()`);
  await waitFor("选择条（提示期间可交互）", `document.querySelector(".notes-selection-count")`);
  const detectSelectable = await textOf(".notes-selection-count");
  await js(`document.querySelector(".notes-selection-clear").click(), true`);
  await waitFor("选择条消失", `!document.querySelector(".notes-selection-bar")`);
  await sleep(4500);
  const detectStillAfterWait = await has(SEL.staleRow);
  await capturePage(win, "r14-3-stale-row.png", await rectOfSelector(SEL.layoutLeft));
  record(
    "r14-notes-stale",
    {
      phase: "detect",
      stale: detectStale,
      rows: detectRows,
      countText: detectCount,
      hashSame: notesHash() === detectHashBefore,
      statDelta: detectStatDelta,
      selectable: detectSelectable,
      stillAfterWait: detectStillAfterWait,
    },
    [
      ...(detectStale.present &&
      detectStale.text === "笔记文件已被外部修改，面板内容可能过期" &&
      detectStale.btnText === "刷新" &&
      detectStale.btnTitle === "重新读取笔记文件"
        ? []
        : [`提示行文案 / 按钮异常：${JSON.stringify(detectStale)}`]),
      ...(detectStale.order.header >= 0 &&
      detectStale.order.stale === detectStale.order.header + 1 + (detectStale.order.notice === -1 ? 0 : 1)
        ? []
        : [`提示行位置异常：${JSON.stringify(detectStale.order)}`]),
      ...(detectRows === 5 && detectCount === "共 5 条" ? [] : [`检测不得改列表：rows=${detectRows} count=${detectCount}`]),
      ...(notesHash() === detectHashBefore && detectStatDelta >= 1
        ? []
        : [`检测必须只读（走新通道）：hashSame=${notesHash() === detectHashBefore} statDelta=${detectStatDelta}`]),
      ...(detectSelectable !== null && detectSelectable.includes("已选") ? [] : [`提示期间既有控件被阻塞：${detectSelectable}`]),
      ...(detectStillAfterWait ? [] : ["提示不得随时间自动消失"]),
    ],
  );

  await js(`(() => {
    const row = ${rowFinder("We study retrieval", false)};
    if (!row) throw new Error("draft target row not found");
    const trigger = row.querySelector(".comment-trigger");
    if (!trigger) throw new Error("comment trigger not found");
    trigger.click();
    return true;
  })()`);
  await waitFor("备注编辑态", `document.querySelector(".note-comment textarea")`);
  await js(`(() => {
    const input = document.querySelector(".note-comment textarea");
    if (!input) throw new Error("comment textarea not found");
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(input, "刷新不应丢弃这段草稿");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  const refreshHashBefore = notesHash();
  const refreshLoadBase = await loadCalls();
  const refreshAddBase = (await notesAddCalls()).count;
  const refreshReportBase = (await notesReportCalls()).count;
  await clickEl(SEL.staleRefresh);
  await waitFor("刷新后提示消失", `!document.querySelector(${JSON.stringify(SEL.staleRow)})`);
  await waitFor("刷新后列表 6 行", `document.querySelectorAll(${JSON.stringify(SEL.noteRow)}).length === 6`);
  const draft = await js(`(() => {
    const input = document.querySelector(".note-comment textarea");
    const actions = Array.from(document.querySelectorAll(".note-comment .comment-actions .v-btn")).map((el) => el.textContent.replace(/\\s+/g, " ").trim());
    return { value: input ? input.value : null, inDom: !!input, actions };
  })()`);
  const refreshRows = await countOf(SEL.noteRow);
  const refreshFileRows = readNotes().length;
  const refreshBadges = {
    reading: await badgeRowProbe(rowByLabelExpr("reading-notes.md")),
    older: await badgeRowProbe(OLDER_ROW),
    sample: await badgeRowProbe(SAMPLE_ROW),
  };
  const refreshHashSame = notesHash() === refreshHashBefore;
  const refreshLoadDelta = (await loadCalls()) - refreshLoadBase;
  const refreshAddDelta = (await notesAddCalls()).count - refreshAddBase;
  const refreshReportDelta = (await notesReportCalls()).count - refreshReportBase;
  await capturePage(win, "r14-3b-refresh-keeps-draft.png", await rectOfSelector(SEL.layoutLeft));
  await capturePage(win, "r14-3c-refresh-list-synced.png", await rectOfSelector(SEL.layoutLeft));

  removeExternalNote("n-current-1");
  await triggerWindowFocus();
  await waitFor("外部删除后提示再现", `document.querySelector(${JSON.stringify(SEL.staleRow)})`);
  const segmentLoadBase = await loadCalls();
  await clickEl(SEL.staleRefresh);
  await waitFor("续段刷新后提示消失", `!document.querySelector(${JSON.stringify(SEL.staleRow)})`);
  await waitFor("续段刷新后列表 5 行", `document.querySelectorAll(${JSON.stringify(SEL.noteRow)}).length === 5`);
  const removedRowGone = await js(`!(${rowFinder("We study retrieval", false)})`);
  const removedTextarea = await has(".note-comment textarea");
  const removedRows = await countOf(SEL.noteRow);
  const removedFileRows = readNotes().length;
  const removedStale = await has(SEL.staleRow);
  const removedNotice = await notesNotice();
  const draftNotSaved = !JSON.stringify(readNotes()).includes("刷新不应丢弃这段草稿");
  const segmentAddDelta = (await notesAddCalls()).count - refreshAddBase;
  const segmentReportDelta = (await notesReportCalls()).count - refreshReportBase;
  const segmentLoadDelta = (await loadCalls()) - segmentLoadBase;
  record(
    "r14-notes-stale",
    {
      phase: "refresh-draft",
      stale: await has(SEL.staleRow),
      draft,
      draftKept: draft.inDom && draft.value === "刷新不应丢弃这段草稿",
      rows: refreshRows,
      fileRows: refreshFileRows,
      badges: refreshBadges,
      hashSame: refreshHashSame,
      loadDelta: refreshLoadDelta,
      writeDelta: { add: refreshAddDelta, report: refreshReportDelta },
      removedRowGone,
      removedTextarea,
      removedRows,
      removedFileRows,
      removedStale,
      removedNotice,
      draftNotSaved,
      segmentDelta: { load: segmentLoadDelta, add: segmentAddDelta, report: segmentReportDelta },
    },
    [
      ...((await has(SEL.staleRow)) === false ? [] : ["刷新成功后提示应消失"]),
      ...(draft.inDom && draft.value === "刷新不应丢弃这段草稿" && draft.actions.includes("保存") && draft.actions.includes("取消")
        ? []
        : [`刷新不得丢弃草稿 / 关闭编辑框：${JSON.stringify(draft)}`]),
      ...(refreshRows === 6 && refreshFileRows === 6 ? [] : [`刷新后面板与文件不一致：rows=${refreshRows} file=${refreshFileRows}`]),
      ...(refreshBadges.sample && refreshBadges.sample.text === "3 条" &&
      refreshBadges.older && refreshBadges.older.text === "2 条" &&
      refreshBadges.reading && refreshBadges.reading.text === "1 条"
        ? []
        : [`刷新后徽标未同步：${JSON.stringify(refreshBadges)}`]),
      ...(refreshHashSame && refreshLoadDelta === 1 && refreshAddDelta === 0 && refreshReportDelta === 0
        ? []
        : [`刷新必须只读且只发一次 IPC：hashSame=${refreshHashSame} load=${refreshLoadDelta} add=${refreshAddDelta} report=${refreshReportDelta}`]),
      ...(removedRowGone && !removedTextarea ? [] : [`外部删除后行与编辑框应随数据消失：rowGone=${removedRowGone} textarea=${removedTextarea}`]),
      ...(removedRows === 5 && removedFileRows === 5 ? [] : [`续段刷新后面板与文件不一致：rows=${removedRows} file=${removedFileRows}`]),
      ...(removedStale === false && removedNotice === null ? [] : [`续段不得残留提示 / 弹错：stale=${removedStale} notice=${JSON.stringify(removedNotice)}`]),
      ...(draftNotSaved && segmentAddDelta === refreshAddDelta && segmentReportDelta === refreshReportDelta && segmentLoadDelta === 1
        ? []
        : [`草稿未自动保存 / 未自动丢弃且刷新只读：saved=${!draftNotSaved} delta=${JSON.stringify({ segmentLoadDelta, segmentAddDelta, segmentReportDelta })}`]),
    ],
  );

  // --- r14-4 外部改动检测的失败静默与在途守卫 -----------------------------------
  log("r14-4 检测失败静默与在途守卫");
  await restoreStandardSeed();
  const rebaseHashBefore = notesHash();
  appendExternalNote(EXTERNAL_1);
  await triggerWindowFocus();
  await waitFor("外部改动提示（防空）", `document.querySelector(${JSON.stringify(SEL.staleRow)})`);
  const rebaseStaleBefore = await has(SEL.staleRow);
  await deleteRowByText("Table 2 repo");
  await waitFor("写成功后提示消失", `!document.querySelector(${JSON.stringify(SEL.staleRow)})`);
  const rebaseStaleAfter = await has(SEL.staleRow);
  const rebaseRows = await countOf(SEL.noteRow);
  const rebaseFileRows = readNotes().length;
  const rebaseExternalVisible = await js(`Boolean(${rowFinder(EXTERNAL_TEXT, false)})`);
  record(
    "r14-notes-stale-failure",
    {
      phase: "write-rebaseline",
      staleBefore: rebaseStaleBefore,
      staleAfter: rebaseStaleAfter,
      rows: rebaseRows,
      fileRows: rebaseFileRows,
      externalVisible: rebaseExternalVisible,
      hashChanged: notesHash() !== rebaseHashBefore,
    },
    [
      ...(rebaseStaleBefore ? [] : ["外部改动后提示必须出现（防空）"]),
      ...(rebaseStaleAfter === false ? [] : ["写操作成功后必须重新对标（提示消失）"]),
      ...(rebaseRows === rebaseFileRows && rebaseExternalVisible ? [] : [`面板行数必须等于文件条数且不丢外部改动：rows=${rebaseRows} file=${rebaseFileRows} external=${rebaseExternalVisible}`]),
      ...(notesHash() !== rebaseHashBefore ? [] : ["删除必须真实落盘"]),
    ],
  );

  appendExternalNote(EXTERNAL_3);
  await triggerWindowFocus();
  await waitFor("置位态（防空）", `document.querySelector(${JSON.stringify(SEL.staleRow)})`);
  const silentStatBase = (await statCalls()).count;
  await setNotesStatFailure("read-failed");
  await triggerWindowFocus();
  await sleep(400);
  const silentReadFailed = { stale: await has(SEL.staleRow), notice: await notesNotice(), rows: await countOf(SEL.noteRow) };
  await setNotesStatFailure("throw");
  await triggerWindowFocus();
  await sleep(400);
  const silentThrow = { stale: await has(SEL.staleRow), notice: await notesNotice(), rows: await countOf(SEL.noteRow) };
  await capturePage(win, "r14-4-stat-failure-silent.png", await rectOfSelector(SEL.layoutLeft));
  await setNotesStatFailure(null);
  await clickEl(SEL.staleRefresh);
  await waitFor("刷新后提示消失", `!document.querySelector(${JSON.stringify(SEL.staleRow)})`);
  const silentStaleAfterClear = await has(SEL.staleRow);
  await setNotesStatFailure("read-failed");
  await triggerWindowFocus();
  await sleep(400);
  const silentAfterClear = await has(SEL.staleRow);
  await setNotesStatFailure(null);
  const silentStatDelta = (await statCalls()).count - silentStatBase;
  record(
    "r14-notes-stale-failure",
    {
      phase: "stat-failure-silent",
      staleWhileFailed: { readFailed: silentReadFailed.stale, throw: silentThrow.stale },
      notice: { readFailed: silentReadFailed.notice, throw: silentThrow.notice },
      rows: silentReadFailed.rows,
      rowsAfterThrow: silentThrow.rows,
      staleAfterClear: silentStaleAfterClear,
      silentAfterClear,
      statDelta: silentStatDelta,
    },
    [
      ...(silentReadFailed.stale && silentThrow.stale ? [] : [`检测失败不得清除已置位状态：${JSON.stringify({ readFailed: silentReadFailed, throw: silentThrow })}`]),
      ...(silentReadFailed.notice === null && silentThrow.notice === null && silentReadFailed.rows === silentThrow.rows
        ? []
        : [`检测失败必须静默且不动列表：${JSON.stringify({ readFailed: silentReadFailed, throw: silentThrow })}`]),
      ...(silentStatDelta >= 1 ? [] : [`检测必须真实走新通道：${silentStatDelta}`]),
      ...(silentStaleAfterClear === false ? [] : ["置位态下刷新成功后提示应消失"]),
      ...(silentAfterClear === false ? [] : ["未置位时检测失败不得置位"]),
    ],
  );

  await setLoadDelay(1200);
  appendExternalNote(EXTERNAL_2);
  await triggerWindowFocus();
  await waitFor("在途守卫前置提示", `document.querySelector(${JSON.stringify(SEL.staleRow)})`);
  const inflightLoadBase = await loadCalls();
  const inflightTargetRows = readNotes().length;
  await js(`(() => {
    const btn = document.querySelector(${JSON.stringify(SEL.staleRefresh)});
    if (!btn) throw new Error("stale refresh button not found");
    btn.click();
    btn.click();
    return true;
  })()`);
  const inflightLoadDelta = (await loadCalls()) - inflightLoadBase;
  await waitFor("在途刷新后提示消失", `!document.querySelector(${JSON.stringify(SEL.staleRow)})`);
  await waitFor("在途刷新后列表与文件一致", `document.querySelectorAll(${JSON.stringify(SEL.noteRow)}).length === ${inflightTargetRows}`);
  await setLoadDelay(0);
  const inflightRows = await countOf(SEL.noteRow);
  record(
    "r14-notes-stale-failure",
    { phase: "inflight-guard", loadDelta: inflightLoadDelta, staleAfter: await has(SEL.staleRow), rows: inflightRows, fileRows: readNotes().length },
    [
      ...(inflightLoadDelta === 1 ? [] : [`在途双击必须只发一次 IPC：${inflightLoadDelta}`]),
      ...((await has(SEL.staleRow)) === false && inflightRows === readNotes().length
        ? []
        : [`在途刷新落地后应清标记且列表与文件一致：stale=${await has(SEL.staleRow)} rows=${inflightRows} file=${readNotes().length}`]),
    ],
  );

  // --- r14-5 组头跳转：当前文档零副作用 / 非当前文档跳转 -------------------------
  log("r14-5 组头跳转（当前文档零副作用 / 非当前文档跳转）");
  await enterNotesProbe();
  const currentHead = await js(`(() => {
    const head = document.querySelector(".notes-group .notes-group-head");
    return head ? { openable: head.classList.contains("is-openable"), cursor: getComputedStyle(head).cursor, title: head.getAttribute("title") } : null;
  })()`);
  const noopHashBefore = notesHash();
  const noopGroupsBefore = await groupPaths();
  await js(`(() => {
    const head = document.querySelector(".notes-group .notes-group-head");
    const name = head ? head.querySelector(${JSON.stringify(SEL.groupName)}) : null;
    if (!name) throw new Error("current group name not found");
    name.click();
    return true;
  })()`);
  await sleep(300);
  const noopPill = await textOf(SEL.centerDocLabel);
  const noopPage = await pageLabel();
  const noopGroupsAfter = await groupPaths();
  const noopHashSame = notesHash() === noopHashBefore;
  record(
    "r14-group-jump",
    {
      phase: "current-noop",
      openable: currentHead.openable,
      cursor: currentHead.cursor,
      title: currentHead.title,
      pillLabel: noopPill,
      pageLabel: noopPage,
      hashSame: noopHashSame,
      groupsSame: JSON.stringify(noopGroupsAfter) === JSON.stringify(noopGroupsBefore),
    },
    [
      ...(currentHead && currentHead.openable === false && currentHead.cursor !== "pointer" && currentHead.title === "sample-paper.pdf"
        ? []
        : [`当前文档组头不得有可点暗示：${JSON.stringify(currentHead)}`]),
      ...(noopPill === "sample-paper.pdf" && (noopPage || "").includes("第 1 / 3 页") && noopHashSame && JSON.stringify(noopGroupsAfter) === JSON.stringify(noopGroupsBefore)
        ? []
        : [`点当前文档组头必须零副作用：${JSON.stringify({ pill: noopPill, page: noopPage, hashSame: noopHashSame, groups: noopGroupsAfter })}`]),
    ],
  );

  const otherHead = await js(`(() => {
    const heads = Array.from(document.querySelectorAll(".notes-group-head"));
    const head = heads.find((el) => (el.getAttribute("title") || "").includes("archive/older-paper.pdf"));
    return head ? { openable: head.classList.contains("is-openable"), cursor: getComputedStyle(head).cursor, title: head.getAttribute("title") } : null;
  })()`);
  const jumpHashBefore = notesHash();
  const jumpLoadBase = await loadCalls();
  const jumpStatBase = (await statCalls()).count;
  await js(`(() => {
    const heads = Array.from(document.querySelectorAll(".notes-group-head"));
    const head = heads.find((el) => (el.getAttribute("title") || "").includes("archive/older-paper.pdf"));
    const name = head ? head.querySelector(${JSON.stringify(SEL.groupName)}) : null;
    if (!name) throw new Error("other group name not found");
    name.click();
    return true;
  })()`);
  await waitPdfLoaded();
  await waitPage(1, 2);
  const jumpPill = await textOf(SEL.centerDocLabel);
  const jumpPage = await pageLabel();
  const jumpFirstGroup = await js(`(() => {
    const head = document.querySelector(".notes-group .notes-group-head");
    return head ? { title: head.getAttribute("title"), chip: !!head.querySelector(".v-chip"), openable: head.classList.contains("is-openable") } : null;
  })()`);
  const jumpRows = await countOf(SEL.noteRow);
  const jumpHashSame = notesHash() === jumpHashBefore;
  const jumpLoadDelta = (await loadCalls()) - jumpLoadBase;
  const jumpStatDelta = (await statCalls()).count - jumpStatBase;
  await capturePage(win, "r14-5-group-jump.png");
  record(
    "r14-group-jump",
    {
      phase: "jump-other-doc",
      openable: otherHead.openable,
      cursor: otherHead.cursor,
      pillLabel: jumpPill,
      pageLabel: jumpPage,
      firstGroup: jumpFirstGroup,
      rows: jumpRows,
      hashSame: jumpHashSame,
      loadDelta: jumpLoadDelta,
      statDelta: jumpStatDelta,
    },
    [
      ...(otherHead && otherHead.openable === true && otherHead.cursor === "pointer" ? [] : [`非当前文档组头应可点：${JSON.stringify(otherHead)}`]),
      ...(jumpPill === "older-paper.pdf" && (jumpPage || "").includes("第 1 / 2 页")
        ? []
        : [`跳转未落到目标文档：pill=${jumpPill} page=${jumpPage}`]),
      ...(jumpFirstGroup && jumpFirstGroup.title === "archive/older-paper.pdf" && jumpFirstGroup.chip === true && jumpFirstGroup.openable === false
        ? []
        : [`分组未随当前文档重排：${JSON.stringify(jumpFirstGroup)}`]),
      ...(jumpRows === 4 && jumpHashSame && jumpLoadDelta === 0 && jumpStatDelta === 0
        ? []
        : [`跳转不得读写笔记：rows=${jumpRows} hashSame=${jumpHashSame} load=${jumpLoadDelta} stat=${jumpStatDelta}`]),
    ],
  );

  // --- r15-f9 逃生口：备份路径透传 + 「在文件夹中显示」（新增记录/截图）-----------
  log("r15-f9 笔记逃生口：备份路径透传与提示入口");
  await goHome();
  // 错误态必须走 stub 注入：stub 的 readNotesFile 对坏 JSON 静默回空（与 10 / 52-err / 60-6 同口径），
  // 直接写坏文件不会产生 .notes-error（R15 复核首跑实测挂在 waitFor，记录不成立）
  await js(`window.__pixStub.setLoadFailure("corrupt", "笔记文件无法读取（文件已损坏，未被修改）"), true`);
  await enterWorkspace(LIBRARY_NAME);
  await waitTreeRows(4);
  await js(`document.querySelector('.pill-tab[data-tab="notes"]').click(), true`);
  await waitFor("笔记错误态", `document.querySelector(".notes-error")`);
  await js(`(() => {
    const btn = Array.from(document.querySelectorAll(".notes-error button")).find(
      (el) => el.textContent.trim() === "备份原文件并新建空库",
    );
    if (!btn) throw new Error("逃生口按钮未找到");
    btn.click();
    return true;
  })()`);
  await waitFor("重建提示", `document.querySelector(".notes-notice")`);
  const recoverNotice = {
    text: await textOf(".notes-notice .notice-text"),
    reveal: await has(".notes-notice .notice-reveal"),
    revealTitle: await js(`(() => {
      const el = document.querySelector(".notes-notice .notice-reveal");
      return el ? el.getAttribute("title") : null;
    })()`),
    rows: await countOf(".note-row"),
  };
  await capturePage(win, "r15-f9-recover-backup.png");
  record("r15-notes-recover", { phase: "backup-path", ...recoverNotice }, [
    ...(recoverNotice.text &&
    recoverNotice.text.startsWith("已备份原文件并新建空库：") &&
    recoverNotice.text.includes(NOTES_FILE + ".bak")
      ? []
      : [`提示未透传 backupPath：${recoverNotice.text}`]),
    ...(recoverNotice.reveal === true && recoverNotice.revealTitle === "在文件夹中显示备份文件"
      ? []
      : [`缺少「在文件夹中显示」入口：${JSON.stringify(recoverNotice)}`]),
  ]);

  await js(`window.__pixStub.setLoadFailure(null, ""), true`);
  await restoreStandardSeed();

  // --- r15-f13 渲染兜底：无 start 的 eye_model_end 仍渲染失败块（仅覆盖渲染层）-----
  // 性质说明：本记录只验证「不可用分支直接发 end（无 start）」在渲染层的可读性；
  // F13 的发射条件本身由源码走查 + 真机走查覆盖，不由本记录代表。
  log("r15-f13 vision-status：不可用分支的 eye_model_end（无 start）渲染为失败块");
  const visionRowsBefore = await js(
    `Array.from(document.querySelectorAll(".chat-messages .note-row")).map((el) => el.textContent.replace(/\\s+/g, " ").trim())`,
  );
  await emit({
    type: "eye_model_end",
    id: "r15-f13-eye",
    provider: "stub",
    modelId: "stub-vision",
    imageCount: 2,
    success: false,
    errorMessage: "配置的视觉模型不可用",
  });
  await waitFor(
    "视觉模型失败块",
    `Array.from(document.querySelectorAll(".chat-messages .note-row")).some((el) => el.textContent.includes("视觉模型读取失败"))`,
  );
  await sleep(200);
  const visionRowsAfter = await js(
    `Array.from(document.querySelectorAll(".chat-messages .note-row")).map((el) => el.textContent.replace(/\\s+/g, " ").trim())`,
  );
  await capturePage(win, "r15-f13-vision-failure-block.png");
  record("r15-vision-fallback", { phase: "unavailable-end-without-start", before: visionRowsBefore, after: visionRowsAfter }, [
    ...(visionRowsAfter.length === visionRowsBefore.length + 1
      ? []
      : [`应恰好多出一个块：${visionRowsBefore.length} → ${visionRowsAfter.length}`]),
    ...(visionRowsAfter.includes("视觉模型读取失败") ? [] : [`缺少失败块文案：${JSON.stringify(visionRowsAfter)}`]),
  ]);

  // --- r15-f16 工作区卸载后的迟到注册（R15 F16）---------------------------------
  // 慢 IPC（notesLoad 4s）造出「onMounted 未完、页面已卸载」窗口：迟到段不得再往 window 上挂订阅（无解绑即泄漏）。
  log("r15-f16 慢加载下返回首页：迟到挂载段不得再注册事件订阅");
  await goHome();
  await sleep(300);
  const evtBefore = await js("window.__pixStub.agentEventListenerCount()");
  await setLoadDelay(4000);
  await js(`(() => {
    const cards = Array.from(document.querySelectorAll(".project-list-item"));
    const card = cards.find((el) => {
      const title = el.querySelector(".v-list-item-title");
      return !!title && title.textContent.trim() === ${JSON.stringify(LIBRARY_NAME)};
    });
    if (!card) throw new Error("project card not found: " + ${JSON.stringify(LIBRARY_NAME)});
    card.click();
    return true;
  })()`);
  await waitFor("工作区三栏（慢加载）", `document.querySelector(".workspace-page")`);
  await sleep(150);
  await goHome();
  // 基线取在「已返回首页、迟到段尚未落地」的窗口内：此后新增的注册/在册句柄都属迟到段
  const evtMid = await js("window.__pixStub.agentEventListenerCount()");
  await sleep(5000);
  const evtAfter = await js("window.__pixStub.agentEventListenerCount()");
  const lateListBase = await js("window.__pixStub.listSessionsCalls()");
  await emit({ type: "agent_start" });
  await sleep(600);
  const lateListDelta = (await js("window.__pixStub.listSessionsCalls()")) - lateListBase;
  // 收尾：清掉 agent_start 留下的流式标记（useRpc 的 get_state 刷新会把它恢复为 false）
  await emit({ type: "agent_end", messages: [] });
  await sleep(300);
  await setLoadDelay(0);
  await capturePage(win, "r15-f16-late-register.png");
  record(
    "r15-workspace-late-register",
    {
      phase: "unmount-during-load",
      before: evtBefore,
      mid: evtMid,
      after: evtAfter,
      lateRegistered: evtAfter.registered - evtMid.registered,
      lateUnregistered: evtAfter.unregistered - evtMid.unregistered,
      lateHandlers: evtAfter.handlers - evtMid.handlers,
      listSessionsDelta: lateListDelta,
    },
    [
      ...(evtAfter.registered - evtMid.registered === evtAfter.unregistered - evtMid.unregistered
        ? []
        : [`迟到段注册数必须等于解绑数：${JSON.stringify(evtMid)} → ${JSON.stringify(evtAfter)}`]),
      ...(evtAfter.handlers - evtMid.handlers === 0 ? [] : [`迟到段不得留下在册句柄：+${evtAfter.handlers - evtMid.handlers}`]),
      ...(lateListDelta === 0 ? [] : [`agent_start 不得再触发工作区同步（listSessions 调用 +${lateListDelta}）`]),
    ],
  );

  // ===========================================================================
  // R16 收口（N91–N95）：页标记 / 定位 / 原文锚点 / 叠加与降级。
  // 新增场景一律追加在末尾，每个场景以自己的 restoreStandardSeed() 收尾；
  // 既有场景 / label / 截图名 / helper 零改动；stub 面零改动。
  // ===========================================================================

  /** r16-2 专用夹具：标准 4 条 + 页 2 的 9 条填充摘录 + 页 3 的 1 条摘录 = 14 行（页 2 = 11 行）。 */
  const seedR16Focus = () => {
    const now = Date.now();
    const fillers = Array.from({ length: 9 }, (_, index) => ({
      id: `n-r16-f${index + 1}`,
      kind: "excerpt",
      docPath: "sample-paper.pdf",
      page: 2,
      text: `R16 填充摘录 ${index + 1}：页 2 的列表密度样本。`,
      comment: "",
      createdAt: now - (9 - index) * MINUTE,
      updatedAt: now - (9 - index) * MINUTE,
    }));
    return [
      ...seedNotes(),
      ...fillers,
      {
        id: "n-r16-p3",
        kind: "excerpt",
        docPath: "sample-paper.pdf",
        page: 3,
        text: "Sparse attention keeps recall at one third of the dense budget,",
        comment: "",
        createdAt: now,
        updatedAt: now,
      },
    ];
  };

  /** 页 1 摘录的手写期望串（手写，不由被测函数生成）；比较一律先去掉全部空白。 */
  const R16_ANCHOR_TEXT = "We study retrieval over long documents where the attention budget is the binding constraint.";
  const stripWs = (value) => String(value ?? "").replace(/\s+/g, "");

  /**
   * 页标记现场（一次 js 读完）：页矩形 / 标记文本与 title / 子元素类名序列 / 文字层 span 计数与矩形 /
   * 既有控件矩形（搜索面板在场时读，否则 null）/ 标记与 span、与控件的相交判定。
   */
  const pageNotesProbe = (page) => js(`(() => {
    const box = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const raw = (el) => el.getBoundingClientRect();
    const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const text = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
    const pageEl = document.querySelector('.pdf-page[data-page="${page}"]');
    if (!pageEl) return null;
    const marker = pageEl.querySelector(".page-notes");
    const layer = pageEl.querySelector(".textLayer");
    const spans = layer ? Array.from(layer.querySelectorAll("span")) : [];
    const controls = {};
    const controlRects = {};
    for (const selector of [".pdf-toolbar", ".pdf-page-indicator", ".reader-section", ".pdf-capture-fab", ".pdf-search-panel"]) {
      const el = document.querySelector(selector);
      controls[selector] = el ? box(el) : null;
      controlRects[selector] = el ? raw(el) : null;
    }
    const markerRect = marker ? raw(marker) : null;
    const markerStyle = marker ? getComputedStyle(marker) : null;
    const canvas = pageEl.querySelector("canvas");
    return {
      page: ${page},
      pageBox: box(pageEl),
      pageCount: document.querySelectorAll(".pdf-page").length,
      exists: !!marker,
      text: text(marker),
      title: marker ? marker.getAttribute("title") : null,
      rect: marker ? box(marker) : null,
      position: markerStyle ? markerStyle.position : null,
      zIndex: markerStyle ? markerStyle.zIndex : null,
      children: Array.from(pageEl.children).map((el) => String(el.className).split(" ")[0]),
      spans: { count: spans.length, boxes: spans.map((el) => box(el)) },
      markerVsSpans: markerRect ? spans.some((el) => hit(markerRect, raw(el))) : null,
      markerVsControls: markerRect
        ? Object.keys(controlRects).filter((key) => controlRects[key] !== null && hit(markerRect, controlRects[key]))
        : [],
      canvas: canvas ? { styleWidth: canvas.style.width, scaleFactor: pageEl.style.getPropertyValue("--scale-factor") } : null,
      controls,
    };
  })()`);

  /** 锚点高亮现场：三个注册表的存在性 / size / 区间文本、区间所属页、当前页读数、提示与 [pdf-viewer] 日志行数。 */
  const anchorProbe = async () => {
    const probe = await js(`(() => {
      const read = (name) => {
        const highlight = CSS.highlights.get(name);
        return highlight ? { size: highlight.size, texts: Array.from(highlight, (range) => range.toString()) } : null;
      };
      const pageOf = (range) => {
        let node = range.startContainer;
        while (node && node.nodeType !== 1) node = node.parentNode;
        const el = node && node.closest ? node.closest(".pdf-page") : null;
        return el ? el.getAttribute("data-page") : null;
      };
      const anchorRanges = Array.from(CSS.highlights.get("pix-note-anchor") || []);
      const pageEl = document.querySelector('.pdf-page[data-page="1"]');
      const canvas = pageEl ? pageEl.querySelector("canvas") : null;
      const notice = document.querySelector(".notes-notice");
      const noticeText = notice ? notice.querySelector(".notice-text") : null;
      const label = document.querySelector(".page-label");
      return {
        registry: { anchor: read("pix-note-anchor"), search: read("pix-search"), current: read("pix-search-current") },
        anchorPage: anchorRanges.length ? pageOf(anchorRanges[0]) : null,
        pageLabel: label ? label.textContent.replace(/\\s+/g, " ").trim() : null,
        pageOneSpans: pageEl ? pageEl.querySelectorAll(".textLayer span").length : null,
        pageOneMarks: pageEl ? pageEl.querySelectorAll("mark").length : null,
        scaleFactor: pageEl ? pageEl.style.getPropertyValue("--scale-factor") : null,
        canvasWidth: canvas ? canvas.style.width : null,
        notice: notice
          ? { isError: notice.classList.contains("is-error"), text: noticeText ? noticeText.textContent.replace(/\\s+/g, " ").trim() : null }
          : null,
      };
    })()`);
    return { ...probe, viewerLogs: rendererLogs.filter((line) => line.includes("[pdf-viewer]")).length };
  };

  /** 面板行现场：面板/头部矩形与滚动位置、当前文档组内目标行（含瞬时态与计算样式）、四维视图状态。 */
  const panelRowProbe = (page) => js(`(() => {
    const box = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
    const text = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
    const panel = document.querySelector(".notes-panel");
    if (!panel) return null;
    const header = document.querySelector(".notes-header");
    const list = document.querySelector(".notes-list");
    const groups = list ? Array.from(list.querySelectorAll(".notes-group")) : [];
    const group = groups.find((el) => !!el.querySelector(".notes-group-head .v-chip")) || null;
    const rows = group ? Array.from(group.querySelectorAll(".note-row")) : [];
    const want = "第 ${page} 页";
    const row = rows.find((el) => text(el.querySelector(".note-page-badge")) === want) || null;
    const style = row ? getComputedStyle(row) : null;
    const input = document.querySelector(".notes-search-input");
    const sort = document.querySelector(".notes-sort-btn");
    const filter = document.querySelector(".notes-filter input");
    return {
      panel: box(panel),
      header: header ? box(header) : null,
      scrollTop: panel.scrollTop,
      listPresent: !!list,
      rowCount: document.querySelectorAll(".note-row").length,
      groupRows: rows.length,
      badges: rows.map((el) => text(el.querySelector(".note-page-badge"))),
      target: row
        ? {
            box: box(row),
            anchored: row.classList.contains("is-anchored"),
            borderColor: style.borderTopColor,
            backgroundColor: style.backgroundColor,
          }
        : null,
      search: input ? input.value : null,
      sort: text(sort),
      currentDocOnly: filter ? filter.checked : null,
      selectionBar: !!document.querySelector(".notes-selection-bar"),
      chapterFilter: !!document.querySelector(".notes-chapter-filter"),
    };
  })()`);

  /** 文字层结构快照：childNodes 的 nodeName 序列与各节点文本（两次快照逐字比对零结构改动）。 */
  const textLayerSnapshot = (page) => js(`(() => {
    const layer = document.querySelector('.pdf-page[data-page="${page}"] .textLayer');
    if (!layer) return null;
    return Array.from(layer.childNodes).map((node) => ({ type: node.nodeName, text: node.nodeValue || node.textContent || "" }));
  })()`);

  /** 清空该页文字层子节点（模拟扫描件无文字层；唯一写 DOM 的 helper）。 */
  const emptyTextLayer = (page) => js(`(() => {
    const layer = document.querySelector('.pdf-page[data-page="${page}"] .textLayer');
    if (!layer) throw new Error("text layer not found");
    layer.replaceChildren();
    return true;
  })()`);

  /** 页 1 首个 span 的部分选区（Range + Selection + selectionchange），返回选中的字符串。 */
  const selectionOnPageOne = async () => {
    await waitFor("页 1 文字层（选区）", `document.querySelector('.pdf-page[data-page="1"] .textLayer span')`);
    const selected = await js(`(() => {
      const span = document.querySelector('.pdf-page[data-page="1"] .textLayer span');
      const node = span.firstChild;
      if (!node) throw new Error("first span has no text node");
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, Math.min(12, node.nodeValue.length));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return selection.toString();
    })()`);
    await waitFor("摘录浮层（选择链路）", `document.querySelector(".quick-ask") && document.querySelector(".quick-ask").offsetParent !== null`);
    return selected;
  };

  /** PDF 搜索面板写值：原生 setter + input 事件（面板自身 300ms debounce 后全文档扫描）。 */
  const pdfSearchSet = (value) => js(`(() => {
    const input = document.querySelector(".pdf-search-panel .search-input");
    if (!input) throw new Error("pdf search input not found");
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);

  /** 搜索面板「下一处」（相位保证已命中：totalHits > 0 时按钮才可用）。 */
  const pdfSearchNext = () => js(`(() => {
    const btn = document.querySelector('.pdf-search-panel button[title="下一处"]');
    if (!btn) throw new Error("pdf search next not found");
    btn.click();
    return true;
  })()`);

  /** 搜索面板「关闭搜索」（面板卸载 ⇒ 搜索侧自清自己的两个注册表）。 */
  const pdfSearchClose = () => js(`(() => {
    const btn = document.querySelector('.pdf-search-panel button[title="关闭搜索"]');
    if (!btn) throw new Error("pdf search close not found");
    btn.click();
    return true;
  })()`);

  /** 页码指示器现场：页码文本 + 上/下一页按钮的 disabled（性能采样的防空用）。 */
  const pageLabelProbe = () => js(`(() => {
    const label = document.querySelector(".page-label");
    const prev = document.querySelector('.pdf-page-indicator button[title="上一页"]');
    const next = document.querySelector('.pdf-page-indicator button[title="下一页"]');
    return {
      label: label ? label.textContent.replace(/\\s+/g, " ").trim() : null,
      prevDisabled: prev ? prev.disabled : null,
      nextDisabled: next ? next.disabled : null,
    };
  })()`);

  // r15-f16 收尾停在首页，而 enterNotesProbe 入口序列的第一步是点工作区内的「返回首页」
  // ⇒ 先回到工作区（首页没有该按钮，直接调用会抛错）。
  if (!(await has(SEL.workspace))) {
    await enterWorkspace(LIBRARY_NAME);
  }

  // --- r16-1 页标记：文案 / 位次 / 几何 / 实时跟随 / 跨文档（组 r16-page-badge）-------
  log("r16-1 页标记：页 1 / 页 2 各一枚、页 3 零占位、不压正文与控件");
  await enterNotesProbe();
  const hashR16a = notesHash();
  await waitFor("页标记 2 枚", `document.querySelectorAll(${JSON.stringify(SEL.pageNotes)}).length === 2`);
  // 文字层就绪防空：几何与 span 计数判据必须有真实片段可读
  await waitFor(
    "页 1 / 页 2 文字层就绪",
    `document.querySelector('.pdf-page[data-page="1"] .textLayer span') && document.querySelector('.pdf-page[data-page="2"] .textLayer span')`,
  );
  const p16a1 = await pageNotesProbe(1);
  const p16a2 = await pageNotesProbe(2);
  const p16a3 = await pageNotesProbe(3);
  await capturePage(win, "r16-1-page-badges.png", await rectOfSelector(SEL.pageBoxOne, 8));
  await clickEl(SEL.captureFabBtn);
  await waitFor("框选层", `document.querySelector(${JSON.stringify(SEL.captureLayer)})`);
  const captureZ16a = await js(`(() => {
    const layer = document.querySelector(${JSON.stringify(SEL.captureLayer)});
    return layer ? getComputedStyle(layer).zIndex : null;
  })()`);
  const markerUnderCapture16a = await countOf(SEL.pageNotes);
  await pressBodyEsc();
  await waitFor("框选层退出", `!document.querySelector(${JSON.stringify(SEL.captureLayer)})`);
  record(
    "r16-page-badge",
    {
      phase: "badges",
      pages: { p1: p16a1, p2: p16a2, p3: p16a3 },
      controls: p16a1.controls,
      spans: { p1: p16a1.spans.count, p2: p16a2.spans.count, p3: p16a3.spans.count },
      overlayIndex: p16a1.children.indexOf("pdf-overlay"),
      zIndex: { p1: p16a1.zIndex, p2: p16a2.zIndex, capture: captureZ16a, markerUnderCapture: markerUnderCapture16a },
    },
    [
      ...(p16a1.text === "本页 1 条" && p16a1.title === "本页 1 条笔记（摘录 1 · AI 结论 0）；点击定位到笔记面板"
        ? []
        : [`页 1 标记异常：${JSON.stringify({ text: p16a1.text, title: p16a1.title })}`]),
      ...(p16a2.text === "本页 2 条" && p16a2.title === "本页 2 条笔记（摘录 1 · AI 结论 1）；点击定位到笔记面板"
        ? []
        : [`页 2 标记异常：${JSON.stringify({ text: p16a2.text, title: p16a2.title })}`]),
      ...(p16a3.exists === false && p16a1.pageCount === 3
        ? []
        : [`页 3 必须零占位（页数防空 3）：${JSON.stringify({ exists: p16a3.exists, pageCount: p16a1.pageCount })}`]),
      ...(JSON.stringify(p16a1.children) === JSON.stringify(["", "textLayer", "pdf-overlay", "page-notes"]) &&
      JSON.stringify(p16a2.children) === JSON.stringify(["", "textLayer", "pdf-overlay", "page-notes"]) &&
      JSON.stringify(p16a3.children) === JSON.stringify(["", "textLayer", "pdf-overlay"])
        ? []
        : [`子元素位次异常：${JSON.stringify({ p1: p16a1.children, p3: p16a3.children })}`]),
      ...(p16a1.position === "absolute" && p16a1.zIndex === "3" && p16a2.zIndex === "3"
        ? []
        : [`标记定位/层级异常：${JSON.stringify({ position: p16a1.position, p1: p16a1.zIndex, p2: p16a2.zIndex })}`]),
      ...(p16a1.pageBox.w === 595 && p16a1.pageBox.h === 842 && p16a2.pageBox.w === 595 && p16a2.pageBox.h === 842
        ? []
        : [`页盒几何漂移：${JSON.stringify({ p1: p16a1.pageBox, p2: p16a2.pageBox })}`]),
      ...(p16a1.spans.count > 0 && p16a2.spans.count > 0 && p16a1.markerVsSpans === false && p16a2.markerVsSpans === false
        ? []
        : [`标记与正文相交（夹具相位内禁止）：${JSON.stringify({ p1: [p16a1.spans.count, p16a1.markerVsSpans], p2: [p16a2.spans.count, p16a2.markerVsSpans] })}`]),
      ...(p16a1.markerVsControls.length === 0 && p16a2.markerVsControls.length === 0 && p16a1.controls[".pdf-search-panel"] === null
        ? []
        : [`标记与既有控件相交 / 搜索面板应不在场：${JSON.stringify({ p1: p16a1.markerVsControls, p2: p16a2.markerVsControls, panel: p16a1.controls[".pdf-search-panel"] })}`]),
      ...(p16a1.spans.count === 6 && p16a1.canvas.styleWidth === "595px"
        ? []
        : [`文字层 / canvas 读数漂移：${JSON.stringify({ spans: p16a1.spans.count, canvas: p16a1.canvas })}`]),
      ...(p16a1.children[2] === "pdf-overlay" ? [] : ["pdf-overlay 不再是第 3 个子元素"]),
      ...(captureZ16a === "5" && markerUnderCapture16a === 2
        ? []
        : [`框选层应在标记之上且标记仍在：${JSON.stringify({ captureZ16a, markerUnderCapture16a })}`]),
    ],
  );

  log("r16-1 页标记实时跟随：删除 / 撤销 / 过滤 / 滚动 / 缩放");
  const rowsBefore16a = await countOf(SEL.noteRow);
  await deleteRowByText("Table 2 repo");
  await waitFor(
    "页 2 标记变 1 条",
    `(() => { const el = document.querySelector('.pdf-page[data-page="2"] .page-notes'); return !!el && el.textContent.replace(/\\s+/g, " ").trim() === "本页 1 条"; })()`,
  );
  const afterDelete16a = await pageNotesProbe(2);
  const rowsAfterDelete16a = await countOf(SEL.noteRow);
  await clickUndo();
  await waitFor(
    "页 2 标记回 2 条",
    `(() => { const el = document.querySelector('.pdf-page[data-page="2"] .page-notes'); return !!el && el.textContent.replace(/\\s+/g, " ").trim() === "本页 2 条"; })()`,
  );
  const afterUndo16a = await pageNotesProbe(2);
  const rowsAfterUndo16a = await countOf(SEL.noteRow);
  const countBeforeFilter16a = await textOf(".notes-count");
  const groupCountBeforeFilter16a = await textOf(".notes-group-head .group-count");
  await setSearch("Reproducibility");
  await waitFor("搜索过滤生效（1 行）", `document.querySelectorAll(".note-row").length === 1`);
  const filterP16a1 = await pageNotesProbe(1);
  const filterP16a2 = await pageNotesProbe(2);
  const countUnderFilter16a = await textOf(".notes-count");
  const groupCountUnderFilter16a = await textOf(".notes-group-head .group-count");
  await setSearch("");
  await waitFor("搜索清空（4 行）", `document.querySelectorAll(".note-row").length === 4`);
  await clickNext();
  await waitPage(2, 3);
  await clickPrev();
  await waitPage(1, 3);
  const scrollStable16a = { p1: await pageNotesProbe(1), p2: await pageNotesProbe(2), label: await pageLabel() };
  await clickEl(SEL.zoomInBtn);
  await clickEl(SEL.zoomInBtn);
  await waitFor("缩放 120%", `document.querySelector(".zoom-label").textContent.replace(/\\s+/g, " ").trim() === "120%"`);
  await waitFor(
    "页 1 / 页 2 文字层重渲染",
    `document.querySelector('.pdf-page[data-page="1"] .textLayer span') && document.querySelector('.pdf-page[data-page="2"] .textLayer span')`,
  );
  const zoomStable16a = { p1: await pageNotesProbe(1), p2: await pageNotesProbe(2), zoom: await zoomLabel() };
  await clickEl('.pdf-toolbar button[title="缩小"]');
  await clickEl('.pdf-toolbar button[title="缩小"]');
  await waitFor("缩放回 100%", `document.querySelector(".zoom-label").textContent.replace(/\\s+/g, " ").trim() === "100%"`);
  record(
    "r16-page-badge",
    {
      phase: "live",
      afterDelete: { text: afterDelete16a.text, title: afterDelete16a.title },
      afterUndo: { text: afterUndo16a.text, title: afterUndo16a.title },
      rows: [rowsBefore16a, rowsAfterDelete16a, rowsAfterUndo16a],
      filtered: { countBefore: countBeforeFilter16a, countUnder: countUnderFilter16a, groupBefore: groupCountBeforeFilter16a, groupUnder: groupCountUnderFilter16a },
      badgeUnderFilter: { p1: { text: filterP16a1.text, title: filterP16a1.title }, p2: { text: filterP16a2.text, title: filterP16a2.title } },
      scrollStable: scrollStable16a,
      zoomStable: zoomStable16a,
      hashSame: notesHash() === hashR16a,
    },
    [
      ...(afterDelete16a.text === "本页 1 条" && afterDelete16a.title === "本页 1 条笔记（摘录 0 · AI 结论 1）；点击定位到笔记面板"
        ? []
        : [`删除后页 2 标记异常：${JSON.stringify({ text: afterDelete16a.text, title: afterDelete16a.title })}`]),
      ...(afterUndo16a.text === "本页 2 条" && afterUndo16a.title === "本页 2 条笔记（摘录 1 · AI 结论 1）；点击定位到笔记面板"
        ? []
        : [`撤销后页 2 标记异常：${JSON.stringify({ text: afterUndo16a.text, title: afterUndo16a.title })}`]),
      ...(rowsBefore16a === 4 && rowsAfterDelete16a === 3 && rowsAfterUndo16a === 4
        ? []
        : [`列表行数未真的变化（防空）：${JSON.stringify([rowsBefore16a, rowsAfterDelete16a, rowsAfterUndo16a])}`]),
      ...(filterP16a1.text === "本页 1 条" && filterP16a1.title === p16a1.title && filterP16a2.text === "本页 2 条" && filterP16a2.title === p16a2.title
        ? []
        : [`过滤态下标记不得跟随过滤：${JSON.stringify({ p1: filterP16a1.text, p2: filterP16a2.text })}`]),
      ...(countUnderFilter16a !== countBeforeFilter16a && groupCountUnderFilter16a !== groupCountBeforeFilter16a
        ? []
        : [`过滤未生效（防空）：${JSON.stringify({ countBefore: countBeforeFilter16a, countUnder: countUnderFilter16a, groupBefore: groupCountBeforeFilter16a, groupUnder: groupCountUnderFilter16a })}`]),
      ...(scrollStable16a.p1.text === "本页 1 条" && scrollStable16a.p2.text === "本页 2 条" && (scrollStable16a.label || "").includes("第 1 / 3 页")
        ? []
        : [`滚动不得改变标记读数：${JSON.stringify({ p1: scrollStable16a.p1.text, p2: scrollStable16a.p2.text, label: scrollStable16a.label })}`]),
      ...(zoomStable16a.zoom === "120%" &&
      zoomStable16a.p1.text === "本页 1 条" &&
      zoomStable16a.p2.text === "本页 2 条" &&
      zoomStable16a.p1.markerVsSpans === false &&
      zoomStable16a.p2.markerVsSpans === false &&
      zoomStable16a.p1.spans.count > 0 &&
      zoomStable16a.p2.spans.count > 0 &&
      zoomStable16a.p1.markerVsControls.length === 0 &&
      zoomStable16a.p2.markerVsControls.length === 0
        ? []
        : [`120% 下标记读数 / 几何异常：${JSON.stringify({ zoom: zoomStable16a.zoom, p1: zoomStable16a.p1.text, p2: zoomStable16a.p2.text, vsSpans: [zoomStable16a.p1.markerVsSpans, zoomStable16a.p2.markerVsSpans], vsControls: [zoomStable16a.p1.markerVsControls, zoomStable16a.p2.markerVsControls] })}`]),
      ...(notesHash() === hashR16a ? [] : ["页标记链路不得改写 notes.json"]),
    ],
  );

  log("r16-1 跨文档与越界页：不串页、不钳制、回切可恢复");
  await openRow("older-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 2);
  // 页码 pill 先于页盒落 DOM（setPageCount → measurePages 之间），几何 / 标记判据必须先等页盒
  await waitFor("older-paper 页盒 2 页", `document.querySelectorAll(".pdf-page").length === 2`);
  const otherNotesCount16a = await countOf(SEL.pageNotes);
  const otherPageCount16a = await countOf(".pdf-page");
  const otherFileNotes16a = readNotes();
  await capturePage(win, "r16-1b-page-badges-other-doc.png");
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await waitFor(
    "回切后页 1 标记恢复",
    `(() => { const el = document.querySelector('.pdf-page[data-page="1"] .page-notes'); return !!el && el.textContent.replace(/\\s+/g, " ").trim() === "本页 1 条"; })()`,
  );
  const restored16a = await pageNotesProbe(1);
  record(
    "r16-page-badge",
    {
      phase: "other-doc",
      notesCount: otherNotesCount16a,
      pageCount: otherPageCount16a,
      outOfRangePage: (otherFileNotes16a.find((note) => note.id === "n-other-1") || {}).page ?? null,
      restored: restored16a.text,
    },
    [
      ...(otherNotesCount16a === 0 && otherPageCount16a === 2
        ? []
        : [`older-paper.pdf 不得出现标记（页数防空 2）：${JSON.stringify({ notesCount: otherNotesCount16a, pageCount: otherPageCount16a })}`]),
      ...(otherFileNotes16a.some((note) => note.id === "n-other-1" && note.page === 7)
        ? []
        : [`越界页号不得被钳制/改写：${JSON.stringify(otherFileNotes16a.find((note) => note.id === "n-other-1"))}`]),
      ...(restored16a.text === "本页 1 条" ? [] : [`回切后标记未恢复：${restored16a.text}`]),
    ],
  );
  await restoreStandardSeed();

  // --- r16-2 页标记 → 笔记面板：定位 / 折叠 / 过滤退化（组 r16-page-anchor）-----------
  log("r16-2 定位：面板打开时滚动到目标行 + 2s 瞬时高亮");
  await enterNotesProbe(seedR16Focus(), 14);
  // 页盒就绪防空：页标记 / 页盒读数都不允许在 measurePages 尚未完成时采集
  await waitFor("sample-paper 页盒 3 页", `document.querySelectorAll(".pdf-page").length === 3`);
  const hashR16b = notesHash();
  const addBase16b = (await notesAddCalls()).count;
  const reportBase16b = (await notesReportCalls()).count;
  const before16b = await panelRowProbe(3);
  await clickNext();
  await clickNext();
  await waitPage(3, 3);
  await clickEl('.pdf-page[data-page="3"] .page-notes');
  await waitFor(
    "目标行完整可见",
    `(() => {
      const panel = document.querySelector(".notes-panel");
      const header = document.querySelector(".notes-header");
      const list = document.querySelector(".notes-list");
      if (!panel || !header || !list) return false;
      const group = Array.from(list.querySelectorAll(".notes-group")).find((el) => !!el.querySelector(".notes-group-head .v-chip"));
      if (!group) return false;
      const row = Array.from(group.querySelectorAll(".note-row")).find((el) => {
        const badge = el.querySelector(".note-page-badge");
        return !!badge && badge.textContent.replace(/\\s+/g, " ").trim() === "第 3 页";
      });
      if (!row) return false;
      const box = row.getBoundingClientRect();
      return box.top >= header.getBoundingClientRect().bottom - 1 && box.bottom <= panel.getBoundingClientRect().bottom + 1;
    })()`,
  );
  const after16b = await panelRowProbe(3);
  const anchoredCount16b = await countOf(SEL.noteRowAnchored);
  const anchoredBadge16b = await js(`(() => {
    const row = document.querySelector(${JSON.stringify(SEL.noteRowAnchored)});
    const badge = row ? row.querySelector(${JSON.stringify(SEL.notePageBadge)}) : null;
    return badge ? badge.textContent.replace(/\\s+/g, " ").trim() : null;
  })()`);
  const anchoredInCurrentGroup16b = await js(`(() => {
    const row = document.querySelector(${JSON.stringify(SEL.noteRowAnchored)});
    if (!row) return null;
    const group = row.closest(".notes-group");
    return !!group && !!group.querySelector(".notes-group-head .v-chip");
  })()`);
  const label16b = { page: await pageLabel(), zoom: await zoomLabel(), doc: await textOf(SEL.centerDocLabel) };
  await capturePage(win, "r16-2-page-anchor.png", await rectOfSelector(SEL.layoutLeft, 2));
  await sleep(2500);
  const afterSleep16b = await panelRowProbe(3);
  const anchoredAfterSleep16b = await countOf(SEL.noteRowAnchored);
  const noticeAfterSleep16b = await notesNotice();
  record(
    "r16-page-anchor",
    {
      phase: "locate-panel-open",
      before: before16b,
      after: after16b,
      anchored: { count: anchoredCount16b, badge: anchoredBadge16b, inCurrentGroup: anchoredInCurrentGroup16b },
      view: { search: after16b.search, sort: after16b.sort, currentDocOnly: after16b.currentDocOnly, selectionBar: after16b.selectionBar, chapterFilterBefore: before16b.chapterFilter, chapterFilterAfter: after16b.chapterFilter },
      label: label16b,
      hashSame: notesHash() === hashR16b,
      calls: { add: (await notesAddCalls()).count - addBase16b, report: (await notesReportCalls()).count - reportBase16b }, 
      noticeAfter: noticeAfterSleep16b,
      borderDuring: { color: after16b.target ? after16b.target.borderColor : null, background: after16b.target ? after16b.target.backgroundColor : null },
      borderAfter: { color: afterSleep16b.target ? afterSleep16b.target.borderColor : null, background: afterSleep16b.target ? afterSleep16b.target.backgroundColor : null },
      anchoredAfterSleep: anchoredAfterSleep16b,
    },
    [
      ...(before16b && before16b.target && before16b.target.box.top > before16b.panel.bottom
        ? []
        : [`目标行初始应不可见（防空）：${JSON.stringify({ target: before16b && before16b.target ? before16b.target.box : null, panel: before16b ? before16b.panel : null })}`]),
      ...(after16b && after16b.target && after16b.header && after16b.target.box.top >= after16b.header.bottom - 1 && after16b.target.box.bottom <= after16b.panel.bottom + 1
        ? []
        : [`目标行未被完整定位（不得被头部遮挡）：${JSON.stringify({ target: after16b && after16b.target ? after16b.target.box : null, header: after16b ? after16b.header : null, panel: after16b ? after16b.panel : null })}`]),
      ...(anchoredCount16b === 1 && anchoredBadge16b === "第 3 页" && anchoredInCurrentGroup16b === true
        ? []
        : [`瞬时高亮应恰好命中当前文档组的第 3 页行：${JSON.stringify({ anchoredCount16b, anchoredBadge16b, anchoredInCurrentGroup16b })}`]),
      ...(label16b.page === "第 3 / 3 页" && label16b.zoom === "100%" && label16b.doc === "sample-paper.pdf"
        ? []
        : [`阅读现场被改动（不得跳页 / 缩放 / 换文档）：${JSON.stringify(label16b)}`]),
      ...(after16b.search === "" && after16b.sort === "排序：页码" && after16b.currentDocOnly === false && after16b.selectionBar === false && after16b.chapterFilter === false && before16b.chapterFilter === false
        ? []
        : [`四维视图状态变化：${JSON.stringify({ search: after16b.search, sort: after16b.sort, currentDocOnly: after16b.currentDocOnly, selectionBar: after16b.selectionBar, chapterFilter: after16b.chapterFilter })}`]),
      ...(notesHash() === hashR16b && (await notesAddCalls()).count - addBase16b === 0 && (await notesReportCalls()).count - reportBase16b === 0
        ? []
        : ["定位不得写盘 / 发写 IPC"]),
      ...(noticeAfterSleep16b === null ? [] : [`成功路径不得弹提示：${JSON.stringify(noticeAfterSleep16b)}`]),
      ...(anchoredAfterSleep16b === 0 ? [] : [`瞬时高亮应在 2s 后移除：${anchoredAfterSleep16b}`]),
      ...(after16b.target && afterSleep16b.target && after16b.target.borderColor !== afterSleep16b.target.borderColor && after16b.target.backgroundColor !== afterSleep16b.target.backgroundColor
        ? []
        : [`瞬时高亮的配色读数应变化：${JSON.stringify({ during: after16b.target, after: afterSleep16b.target })}`]),
    ],
  );

  log("r16-2 定位：折叠 + 资料库标签下自动展开（穿过 loading 窗口）");
  await backToLibraryTab();
  await js(`(() => {
    const btn = Array.from(document.querySelectorAll(".pill-icon-btn")).find((el) => el.getAttribute("title") === "折叠资料库");
    if (!btn) throw new Error("collapse button not found");
    btn.click();
    return true;
  })()`);
  await waitFor("左栏折叠", `document.querySelector(${JSON.stringify(SEL.layoutLeft)}).offsetWidth === 0`);
  const collapsed16b = await js(`document.querySelector(${JSON.stringify(SEL.layoutLeft)}).offsetWidth`);
  const loadBase16b = await loadCalls();
  await clickEl('.pdf-page[data-page="3"] .page-notes');
  await waitNotesTab();
  await waitFor("重新展开后目标行被定位", `document.querySelectorAll(${JSON.stringify(SEL.noteRowAnchored)}).length === 1`);
  const tab16b = await js(`document.querySelector(".pill-tab.active").getAttribute("data-tab")`);
  const expanded16b = await js(`document.querySelector(${JSON.stringify(SEL.layoutLeft)}).offsetWidth`);
  const rowAfterLoading16b = await panelRowProbe(3);
  const loadDelta16b = (await loadCalls()) - loadBase16b;
  await capturePage(win, "r16-2b-page-anchor-tab-switch.png");
  record(
    "r16-page-anchor",
    { phase: "locate-panel-closed", collapsedWidth: collapsed16b, tab: tab16b, expandedWidth: expanded16b, anchored: rowAfterLoading16b && rowAfterLoading16b.target ? rowAfterLoading16b.target.anchored : false, loadDelta: loadDelta16b, hashSame: notesHash() === hashR16b, rowAfterLoading: rowAfterLoading16b },
    [
      ...(collapsed16b === 0 ? [] : [`左栏应确实折叠（防空）：${collapsed16b}`]),
      ...(tab16b === "notes" && expanded16b > 200 ? [] : [`应自动展开并停在笔记标签：${JSON.stringify({ tab16b, expanded16b })}`]),
      ...(rowAfterLoading16b && rowAfterLoading16b.target && rowAfterLoading16b.target.anchored === true
        ? []
        : [`目标行未被定位（应发生在 loading 窗口之后）：${JSON.stringify(rowAfterLoading16b && rowAfterLoading16b.target)}`]),
      ...(loadDelta16b <= 1 && notesHash() === hashR16b ? [] : [`读盘 / 写盘越界：${JSON.stringify({ loadDelta16b, hashSame: notesHash() === hashR16b })}`]),
    ],
  );

  log("r16-2 定位：章节过滤被单向清除 / 搜索遮挡时退化 / 退化不粘滞");
  await ensureMapOpen();
  await waitFor("地图行就绪", `document.querySelectorAll(".map-row").length === 7`);
  await clickMapBadge("2. Method Overview");
  await waitChapterFilter("章节：2. Method Overview · 第 2 页", 11);
  const filterBefore16b = await has(SEL.chapterFilter);
  await clickEl('.pdf-page[data-page="1"] .page-notes');
  await waitFor(
    "章节过滤被清除且页 1 行被定位",
    `!document.querySelector(${JSON.stringify(SEL.chapterFilter)}) && document.querySelectorAll(${JSON.stringify(SEL.noteRowAnchored)}).length === 1`,
  );
  const filterCleared16b = await has(SEL.chapterFilter);
  const anchoredUnderFilter16b = await countOf(SEL.noteRowAnchored);
  await setSearch("Reproducibility");
  await waitFor("搜索遮挡（1 行）", `document.querySelectorAll(".note-row").length === 1`);
  const rowCountUnderFilter16b = await countOf(SEL.noteRow);
  const scrollBeforeDegrade16b = await js(`document.querySelector(".notes-panel").scrollTop`);
  const degradeStart16b = Date.now();
  await clickEl('.pdf-page[data-page="1"] .page-notes');
  await waitFor("退化提示", `document.querySelector(".notes-notice.is-error")`);
  const degradeMs16b = Date.now() - degradeStart16b;
  await sleep(200);
  const degradeProbe16b = await js(`(() => {
    const el = document.querySelector(".notes-notice.is-error");
    const text = el ? el.querySelector(".notice-text") : null;
    return {
      text: text ? text.textContent.replace(/\\s+/g, " ").trim() : null,
      anchored: document.querySelectorAll(${JSON.stringify(SEL.noteRowAnchored)}).length,
      scrollTop: document.querySelector(".notes-panel").scrollTop,
    };
  })()`);
  await capturePage(win, "r16-2c-page-anchor-filter-degrade.png", await rectOfSelector(SEL.layoutLeft, 2));
  await setSearch("");
  await waitFor("搜索清空（14 行）", `document.querySelectorAll(".note-row").length === 14`);
  await clickEl('.pdf-page[data-page="1"] .page-notes');
  await waitFor("退化后重试成功", `document.querySelectorAll(${JSON.stringify(SEL.noteRowAnchored)}).length === 1`);
  const anchoredAfterDegrade16b = await countOf(SEL.noteRowAnchored);
  record(
    "r16-page-anchor",
    {
      phase: "degrade-filters",
      filterBefore: filterBefore16b,
      filterCleared: filterCleared16b,
      anchored: anchoredUnderFilter16b,
      notice: degradeProbe16b,
      degradeMs: degradeMs16b,
      rowCountUnderFilter: rowCountUnderFilter16b,
      scrollBefore: scrollBeforeDegrade16b,
      anchoredAfter: anchoredAfterDegrade16b,
    },
    [
      ...(filterBefore16b === true && filterCleared16b === false && anchoredUnderFilter16b === 1
        ? []
        : [`章节过滤应被单向清除且目标行被定位：${JSON.stringify({ filterBefore16b, filterCleared16b, anchoredUnderFilter16b })}`]),
      ...(rowCountUnderFilter16b === 1 && degradeProbe16b.text === "本页笔记不在当前筛选结果中" && degradeProbe16b.anchored === 0
        ? []
        : [`退化提示 / 行态异常：${JSON.stringify({ rowCountUnderFilter16b, degradeProbe16b })}`]),
      ...(degradeProbe16b.scrollTop === scrollBeforeDegrade16b ? [] : [`退化不得滚动面板：${JSON.stringify({ before: scrollBeforeDegrade16b, after: degradeProbe16b.scrollTop })}`]),
      ...(degradeMs16b < 2500 ? [] : [`退化应在 ready 后立即发生（不等满 3s）：${degradeMs16b}ms`]),
      ...(anchoredAfterDegrade16b === 1 ? [] : [`清空搜索后重试应成功（退化不粘滞）：${anchoredAfterDegrade16b}`]),
    ],
  );
  await restoreStandardSeed();

  // --- r16-3 原文锚点：命中 / 静默降级 / 缩放稳定（组 r16-note-highlight）-----------
  log("r16-3 原文锚点：页 1 摘录跨片段命中，文字层零结构改动");
  await enterNotesProbe();
  // 文字层就绪防空：两次结构快照必须有真实片段可读
  await waitFor("页 1 文字层 6 段", `document.querySelectorAll('.pdf-page[data-page="1"] .textLayer span').length === 6`);
  const snapshotBefore16c = await textLayerSnapshot(1);
  const spansBefore16c = await js(`document.querySelectorAll('.pdf-page[data-page="1"] .textLayer span').length`);
  await waitFor("锚点高亮就绪", `CSS.highlights.has("pix-note-anchor")`);
  const painted16c = await anchorProbe();
  const snapshotAfter16c = await textLayerSnapshot(1);
  const selection16c = await selectionOnPageOne();
  const quickAsk16c = await has(SEL.quickAsk);
  await js(`window.getSelection().removeAllRanges(), document.dispatchEvent(new Event("selectionchange")), true`);
  await capturePage(win, "r16-3-note-anchor.png", await rectOfSelector(SEL.pageBoxOne, 8));
  record(
    "r16-note-highlight",
    {
      phase: "anchor-painted",
      anchor: painted16c.registry.anchor,
      page: painted16c.anchorPage,
      spans: spansBefore16c,
      snapshotSame: JSON.stringify(snapshotBefore16c) === JSON.stringify(snapshotAfter16c),
      scaleFactor: painted16c.scaleFactor,
      canvasWidth: painted16c.canvasWidth,
      search: { all: painted16c.registry.search, current: painted16c.registry.current },
      selection: { text: selection16c, quickAsk: quickAsk16c },
    },
    [
      ...(painted16c.registry.anchor && painted16c.registry.anchor.size === 1 && stripWs(painted16c.registry.anchor.texts[0]) === stripWs(R16_ANCHOR_TEXT)
        ? []
        : [`锚点区间文本异常：${JSON.stringify(painted16c.registry.anchor)}`]),
      ...(painted16c.anchorPage === "1" ? [] : [`区间应属于第 1 页：${painted16c.anchorPage}`]),
      ...(spansBefore16c === 6 && painted16c.pageOneMarks === 0 && JSON.stringify(snapshotBefore16c) === JSON.stringify(snapshotAfter16c)
        ? []
        : [`文字层结构不得变化：${JSON.stringify({ spansBefore16c, marks: painted16c.pageOneMarks, same: JSON.stringify(snapshotBefore16c) === JSON.stringify(snapshotAfter16c) })}`]),
      ...(painted16c.scaleFactor === "1" && painted16c.canvasWidth === "595px"
        ? []
        : [`几何读数漂移：${JSON.stringify({ scaleFactor: painted16c.scaleFactor, canvasWidth: painted16c.canvasWidth })}`]),
      ...(painted16c.registry.search === null && painted16c.registry.current === null
        ? []
        : [`未开搜索时不得产生搜索注册表：${JSON.stringify(painted16c.registry)}`]),
      ...(selection16c.length > 0 && quickAsk16c === true ? [] : [`选择链路被破坏：${JSON.stringify({ selection16c, quickAsk16c })}`]),
    ],
  );

  log("r16-3 第 2 页：摘录比页文本长 ⇒ 静默无高亮，翻回即恢复");
  const logsBefore16c = (await anchorProbe()).viewerLogs;
  await clickNext();
  await waitPage(2, 3);
  await sleep(400);
  const unmatched16c = await anchorProbe();
  const unmatchedSpans16c = await js(`document.querySelectorAll('.pdf-page[data-page="2"] .textLayer span').length`);
  const unmatchedLogs16c = unmatched16c.viewerLogs;
  await capturePage(win, "r16-3b-note-anchor-unmatched.png", await rectOfSelector('.pdf-page[data-page="2"]', 8));
  await clickPrev();
  await waitPage(1, 3);
  await waitFor("回页 1 锚点恢复", `CSS.highlights.has("pix-note-anchor")`);
  const restored16c = await anchorProbe();
  const turns16c = [];
  for (let round = 0; round < 5; round += 1) {
    const preNext16c = await pageLabelProbe();
    const startNext16c = Date.now();
    await clickNext();
    await waitPage(2, 3);
    turns16c.push({ ms: Date.now() - startNext16c, disabled: preNext16c.nextDisabled, label: preNext16c.label });
    const prePrev16c = await pageLabelProbe();
    const startPrev16c = Date.now();
    await clickPrev();
    await waitPage(1, 3);
    turns16c.push({ ms: Date.now() - startPrev16c, disabled: prePrev16c.prevDisabled, label: prePrev16c.label });
  }
  const turnsTotal16c = turns16c.reduce((sum, item) => sum + item.ms, 0);
  const turnsMax16c = Math.max(...turns16c.map((item) => item.ms));
  await clickNext();
  await clickPrev();
  await clickNext();
  await clickPrev();
  let stableLabel16c = null;
  let previousLabel16c = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = await pageLabel();
    if (current === previousLabel16c) {
      stableLabel16c = current;
      break;
    }
    previousLabel16c = current;
    await sleep(80);
  }
  await sleep(400);
  const rapid16c = await anchorProbe();
  const rapidPage16c = /第 (\d+) \//.exec(stableLabel16c || "");
  record(
    "r16-note-highlight",
    {
      phase: "unmatched-silent",
      unmatchedRegistry: unmatched16c.registry.anchor,
      unmatchedSpans: unmatchedSpans16c,
      notice: unmatched16c.notice,
      logDelta: unmatchedLogs16c - logsBefore16c,
      restored: restored16c.registry.anchor,
      turns: turns16c.length,
      maxMs: turnsMax16c,
      totalMs: turnsTotal16c,
      revisitMs: turns16c.map((item) => item.ms),
      rapid: { label: stableLabel16c, page: rapidPage16c ? rapidPage16c[1] : null, registry: rapid16c.registry.anchor, anchorPage: rapid16c.anchorPage },
    },
    [
      ...(unmatched16c.registry.anchor === null ? [] : [`第 2 页摘录比页文本长 ⇒ 必须无高亮：${JSON.stringify(unmatched16c.registry.anchor)}`]),
      ...(unmatched16c.notice === null && unmatchedLogs16c - logsBefore16c === 0
        ? []
        : [`降级必须静默（无提示、无 [pdf-viewer] 日志）：${JSON.stringify({ notice: unmatched16c.notice, logDelta: unmatchedLogs16c - logsBefore16c })}`]),
      ...(restored16c.registry.anchor && restored16c.registry.anchor.size === 1 && stripWs(restored16c.registry.anchor.texts[0]) === stripWs(R16_ANCHOR_TEXT)
        ? []
        : [`翻回第 1 页应恢复同一区间：${JSON.stringify(restored16c.registry.anchor)}`]),
      ...(turns16c.length === 10 && turns16c.every((item) => item.disabled === false)
        ? []
        : [`交替序列的先决条件异常：${JSON.stringify(turns16c)}`]),
      ...(turnsMax16c <= 1000 && turnsTotal16c <= 6000 ? [] : [`翻页耗时超限：${JSON.stringify({ turnsMax16c, turnsTotal16c })}`]),
      ...(Math.max(...turns16c.map((item) => item.ms)) <= 300 ? [] : [`回访页耗时超限：${JSON.stringify(turns16c.map((item) => item.ms))}`]),
      ...(rapid16c.registry.anchor === null || (rapidPage16c && rapid16c.anchorPage === rapidPage16c[1])
        ? []
        : [`快速连点后不得残留旧页区间：${JSON.stringify({ stableLabel16c, anchorPage: rapid16c.anchorPage })}`]),
    ],
  );

  log("r16-3 缩放 80%：区间随页几何等比变化，注册表始终指向当前文字层");
  await clickEl('.pdf-toolbar button[title="缩小"]');
  await clickEl('.pdf-toolbar button[title="缩小"]');
  await waitFor(
    "缩放 80% + 锚点非空",
    `document.querySelector(".zoom-label").textContent.replace(/\\s+/g, " ").trim() === "80%" && CSS.highlights.has("pix-note-anchor")`,
  );
  const zoomOut16c = await anchorProbe();
  await capturePage(win, "r16-3c-note-anchor-after-zoom.png", await rectOfSelector(SEL.pageBoxOne, 8));
  await clickEl(SEL.zoomInBtn);
  await clickEl(SEL.zoomInBtn);
  await waitFor(
    "缩放回 100% + 锚点非空",
    `document.querySelector(".zoom-label").textContent.replace(/\\s+/g, " ").trim() === "100%" && CSS.highlights.has("pix-note-anchor")`,
  );
  const restoredZoom16c = await anchorProbe();
  record(
    "r16-note-highlight",
    {
      phase: "scale-stable",
      zoom: await zoomLabel(),
      scaleFactor: zoomOut16c.scaleFactor,
      canvasWidth: zoomOut16c.canvasWidth,
      anchor: zoomOut16c.registry.anchor,
      page: zoomOut16c.anchorPage,
      restored: restoredZoom16c,
    },
    [
      ...(zoomOut16c.scaleFactor === "0.8" && zoomOut16c.canvasWidth === "476px" && zoomOut16c.registry.anchor && zoomOut16c.registry.anchor.size === 1 && stripWs(zoomOut16c.registry.anchor.texts[0]) === stripWs(R16_ANCHOR_TEXT) && zoomOut16c.anchorPage === "1"
        ? []
        : [`80% 下锚点读数异常：${JSON.stringify({ scaleFactor: zoomOut16c.scaleFactor, canvasWidth: zoomOut16c.canvasWidth, page: zoomOut16c.anchorPage, anchor: zoomOut16c.registry.anchor })}`]),
      ...(restoredZoom16c.scaleFactor === "1" && restoredZoom16c.canvasWidth === "595px" && restoredZoom16c.registry.anchor && restoredZoom16c.registry.anchor.size === 1 && stripWs(restoredZoom16c.registry.anchor.texts[0]) === stripWs(R16_ANCHOR_TEXT)
        ? []
        : [`回到 100% 后应逐字回基线：${JSON.stringify({ scaleFactor: restoredZoom16c.scaleFactor, canvasWidth: restoredZoom16c.canvasWidth, anchor: restoredZoom16c.registry.anchor })}`]),
    ],
  );
  await restoreStandardSeed();

  // --- r16-4 锚点与搜索高亮共存（组 r16-highlight-coexist）-------------------------
  log("r16-4 同一页上锚点与搜索高亮并存，先就绪的锚点不被搜索破坏");
  await enterNotesProbe();
  await waitFor("锚点先就绪", `CSS.highlights.has("pix-note-anchor")`);
  await clickEl(SEL.pdfSearchBtn);
  await waitFor("PDF 搜索面板", `document.querySelector(${JSON.stringify(SEL.pdfSearchPanel)})`);
  await pdfSearchSet("retrieval");
  await waitFor("搜索高亮就绪", `CSS.highlights.has("pix-search") && CSS.highlights.get("pix-search").size >= 1`);
  const coexist16d = await anchorProbe();
  const marker16d = await pageNotesProbe(1);
  await pdfSearchNext();
  await sleep(300);
  const afterNext16d = await anchorProbe();
  const spans16d = await js(`document.querySelectorAll('.pdf-page[data-page="1"] .textLayer span').length`);
  await capturePage(win, "r16-4-anchor-with-search.png", await rectOfSelector(SEL.pageBoxOne, 8));
  record(
    "r16-highlight-coexist",
    {
      phase: "coexist",
      anchor: coexist16d.registry.anchor,
      search: coexist16d.registry.search,
      current: coexist16d.registry.current,
      anchorAfterNext: afterNext16d.registry.anchor,
      spans: spans16d,
      markerPanel: { marker: marker16d.rect, panel: marker16d.controls[".pdf-search-panel"], overlap: marker16d.markerVsControls },
      label: coexist16d.pageLabel,
    },
    [
      ...(coexist16d.registry.anchor && coexist16d.registry.anchor.size === 1 && coexist16d.registry.search && coexist16d.registry.search.size >= 1
        ? []
        : [`锚点与搜索高亮应并存：${JSON.stringify({ anchor: coexist16d.registry.anchor, search: coexist16d.registry.search })}`]),
      ...(JSON.stringify(coexist16d.registry.anchor.texts) !== JSON.stringify(coexist16d.registry.search.texts)
        ? []
        : ["锚点与搜索的区间文本集合不得相同"]),
      ...(stripWs(coexist16d.registry.anchor.texts[0]) === stripWs(R16_ANCHOR_TEXT) ? [] : [`锚点区间文本异常：${JSON.stringify(coexist16d.registry.anchor)}`]),
      ...(afterNext16d.registry.anchor && afterNext16d.registry.anchor.size === coexist16d.registry.anchor.size && JSON.stringify(afterNext16d.registry.anchor.texts) === JSON.stringify(coexist16d.registry.anchor.texts)
        ? []
        : [`搜索「下一处」不得改动锚点：${JSON.stringify(afterNext16d.registry.anchor)}`]),
      ...(spans16d === 6 ? [] : [`搜索与锚点都不得改结构：${spans16d}`]),
      ...(marker16d.controls[".pdf-search-panel"] !== null && marker16d.markerVsControls.length === 0
        ? []
        : [`标记与搜索面板不得相交：${JSON.stringify({ panel: marker16d.controls[".pdf-search-panel"], overlap: marker16d.markerVsControls })}`]),
    ],
  );

  log("r16-4 关闭搜索：搜索侧只清自己的名字，锚点仍在");
  await pdfSearchSet("");
  await pdfSearchClose();
  await waitFor("搜索面板卸载", `!document.querySelector(${JSON.stringify(SEL.pdfSearchPanel)})`);
  const closed16d = await anchorProbe();
  await capturePage(win, "r16-4b-anchor-after-search-closed.png", await rectOfSelector(SEL.pageBoxOne, 8));
  record(
    "r16-highlight-coexist",
    { phase: "search-closed", searchGone: { all: closed16d.registry.search, current: closed16d.registry.current }, anchorKept: closed16d.registry.anchor, notice: closed16d.notice },
    [
      ...(closed16d.registry.search === null && closed16d.registry.current === null ? [] : [`搜索侧注册表应被自己清空：${JSON.stringify({ all: closed16d.registry.search, current: closed16d.registry.current })}`]),
      ...(closed16d.registry.anchor && closed16d.registry.anchor.size === 1 && stripWs(closed16d.registry.anchor.texts[0]) === stripWs(R16_ANCHOR_TEXT)
        ? []
        : [`关闭搜索不得删除锚点：${JSON.stringify(closed16d.registry.anchor)}`]),
      ...(closed16d.notice === null ? [] : [`不得弹提示：${JSON.stringify(closed16d.notice)}`]),
    ],
  );
  await restoreStandardSeed();

  // --- r16-5 降级：零标记 / 无文字层 / 外部刷新（组 r16-degrade）-------------------
  log("r16-5 60 页零笔记文档：无标记、无高亮、无提示");
  await enterNotesProbe();
  await openRow("long-book.pdf");
  await waitPdfLoaded();
  await waitPage(1, 60);
  // 页码 pill 先于页盒落 DOM（60 页的 measurePages 更长）⇒ 必须先等 60 个页盒
  await waitFor("long-book 页盒 60 页", `document.querySelectorAll(".pdf-page").length === 60`);
  const zeroNotes16e = await countOf(SEL.pageNotes);
  const zeroPages16e = await countOf(".pdf-page");
  const zeroProbe16e = await anchorProbe();
  await clickNext();
  await clickNext();
  await waitPage(3, 60);
  const zeroAfterTurn16e = { notesCount: await countOf(SEL.pageNotes), registry: (await anchorProbe()).registry.anchor };
  await capturePage(win, "r16-5-zero-page-notes.png");
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await waitFor(
    "回切后页 1 标记 + 锚点恢复",
    `(() => { const el = document.querySelector('.pdf-page[data-page="1"] .page-notes'); return !!el && el.textContent.replace(/\\s+/g, " ").trim() === "本页 1 条" && CSS.highlights.has("pix-note-anchor"); })()`,
  );
  record(
    "r16-degrade",
    {
      phase: "zero-page",
      notesCount: zeroNotes16e,
      pageCount: zeroPages16e,
      afterTurn: zeroAfterTurn16e,
      registry: zeroProbe16e.registry.anchor,
      notice: zeroProbe16e.notice,
      restored: { marker: (await pageNotesProbe(1)).text, anchor: (await anchorProbe()).registry.anchor },
    },
    [
      ...(zeroNotes16e === 0 && zeroPages16e === 60 ? [] : [`零笔记文档不得有标记（页数防空 60）：${JSON.stringify({ zeroNotes16e, zeroPages16e })}`]),
      ...(zeroAfterTurn16e.notesCount === 0 && zeroAfterTurn16e.registry === null ? [] : [`翻页后仍应为零：${JSON.stringify(zeroAfterTurn16e)}`]),
      ...(zeroProbe16e.notice === null ? [] : [`不得弹提示：${JSON.stringify(zeroProbe16e.notice)}`]),
      ...((await anchorProbe()).registry.anchor ? [] : ["回切后锚点应恢复"]),
    ],
  );

  log("r16-5 无文字层：等待 2s 后静默放弃，缩放重渲染后恢复");
  await waitFor("锚点先就绪", `CSS.highlights.has("pix-note-anchor")`);
  const logsBefore16e = (await anchorProbe()).viewerLogs;
  await emptyTextLayer(1);
  await clickNext();
  await waitPage(2, 3);
  await clickPrev();
  await waitPage(1, 3);
  await sleep(2300);
  const timeout16e = await anchorProbe();
  const notesCount16e = await countOf(SEL.pageNotes);
  await capturePage(win, "r16-5b-no-text-layer.png", await rectOfSelector(SEL.pageBoxOne, 8));
  await clickEl(SEL.zoomInBtn);
  await clickEl(SEL.zoomInBtn);
  await clickEl('.pdf-toolbar button[title="缩小"]');
  await clickEl('.pdf-toolbar button[title="缩小"]');
  await waitFor("文字层重建后锚点恢复", `CSS.highlights.has("pix-note-anchor")`);
  const rebuilt16e = await anchorProbe();
  record(
    "r16-degrade",
    {
      phase: "no-text-layer",
      registryAfterTimeout: timeout16e.registry.anchor,
      notice: timeout16e.notice,
      logDelta: timeout16e.viewerLogs - logsBefore16e,
      notesCount: notesCount16e,
      restored: rebuilt16e.registry.anchor,
    },
    [
      ...(timeout16e.registry.anchor === null ? [] : [`超时后应放弃本次绘画：${JSON.stringify(timeout16e.registry.anchor)}`]),
      ...(timeout16e.notice === null && timeout16e.viewerLogs - logsBefore16e === 0
        ? []
        : [`降级必须静默：${JSON.stringify({ notice: timeout16e.notice, logDelta: timeout16e.viewerLogs - logsBefore16e })}`]),
      ...(notesCount16e === 2 ? [] : [`标记不依赖文字层：${notesCount16e}`]),
      ...(rebuilt16e.registry.anchor && rebuilt16e.registry.anchor.size === 1 && stripWs(rebuilt16e.registry.anchor.texts[0]) === stripWs(R16_ANCHOR_TEXT)
        ? []
        : [`文字层重建后锚点应恢复：${JSON.stringify(rebuilt16e.registry.anchor)}`]),
    ],
  );

  log("r16-5 外部改动 + 面板刷新：标记与锚点按新列表重算");
  writeNotesOutside(readNotes().map((note) => (note.id === "n-current-1" ? { ...note, page: 3 } : note)));
  await triggerWindowFocus();
  await waitFor("外部改动提示", `document.querySelector(${JSON.stringify(SEL.staleRow)})`);
  const refreshHash16e = notesHash();
  const addBase16e = (await notesAddCalls()).count;
  const reportBase16e = (await notesReportCalls()).count;
  await clickEl(SEL.staleRefresh);
  await waitFor("刷新后提示消失", `!document.querySelector(${JSON.stringify(SEL.staleRow)})`);
  await waitFor("刷新后 4 行", `document.querySelectorAll(".note-row").length === 4`);
  const refreshP16e1 = await pageNotesProbe(1);
  const refreshP16e2 = await pageNotesProbe(2);
  const refreshP16e3 = await pageNotesProbe(3);
  const refreshRegistry16e = (await anchorProbe()).registry.anchor;
  const refreshNotice16e = (await anchorProbe()).notice;
  await capturePage(win, "r16-5c-after-external-refresh.png");
  record(
    "r16-degrade",
    {
      phase: "external-refresh",
      rows: await countOf(SEL.noteRow),
      fileRows: readNotes().length,
      markerP1: refreshP16e1,
      markerP2: refreshP16e2.text,
      markerP3: refreshP16e3,
      registry: refreshRegistry16e,
      hashSame: notesHash() === refreshHash16e,
      notice: refreshNotice16e,
      writes: { add: (await notesAddCalls()).count - addBase16e, report: (await notesReportCalls()).count - reportBase16e },
    },
    [
      ...((await countOf(SEL.noteRow)) === 4 && readNotes().length === 4 ? [] : [`刷新后行数异常：${JSON.stringify({ rows: await countOf(SEL.noteRow), file: readNotes().length })}`]),
      ...(refreshP16e1.exists === false && refreshP16e3.text === "本页 1 条" && refreshP16e3.title === "本页 1 条笔记（摘录 1 · AI 结论 0）；点击定位到笔记面板" && refreshP16e2.text === "本页 2 条"
        ? []
        : [`刷新后标记未按新列表重算：${JSON.stringify({ p1: refreshP16e1.exists, p2: refreshP16e2.text, p3: refreshP16e3.text })}`]),
      ...(refreshRegistry16e === null ? [] : [`当前页（第 1 页）摘录已移走 ⇒ 不应有高亮：${JSON.stringify(refreshRegistry16e)}`]),
      ...(notesHash() === refreshHash16e && (await notesAddCalls()).count - addBase16e === 0 && (await notesReportCalls()).count - reportBase16e === 0
        ? []
        : ["刷新必须只读"]),
      ...(refreshNotice16e === null ? [] : [`不得残留提示：${JSON.stringify(refreshNotice16e)}`]),
    ],
  );
  await restoreStandardSeed();

  // =========================================================================
  // R17：操作可达性（N96–N99）——快捷键总览（r17-1 / r17-1b）与选区模板动作（r17-2 / r17-2b）
  //
  // 就绪纪律：选区类断言一律先 selectPageSpan() 再用既有 ensureQuickAskExcerptReady() 复核
  //   （R15 修复轮的既有 helper，零改写：内含「有界滚动静默 + 可摘录态复核 + 有界重取」）；
  // 几何纪律：矩形一律 rectOfSelector(sel, 0)（0 内缩 ⇒ 原始视口矩形，供 intersects 使用）；
  // 插值纪律：进入页面上下文的字符串一律 JSON.stringify 插值；期望值全部手写在本块内；
  // helper 配额：只新增设计档 §0.9 第 6 条冻结的 5 个名字（不新增第 6 个）；
  // N97-4 追加：第 6 个 helper = typeIntoComposer（「追加设计」§3.2，真实输入通道）。
  // =========================================================================

  const SHORTCUT_SECTION_TITLES = ["阅读区（打开文档后）", "输入框", "工作区"];
  const SHORTCUT_ROWS = [
    { key: "/", desc: "打开文档搜索" },
    { key: "Ctrl+F", desc: "打开文档搜索" },
    { key: "PageUp / ←", desc: "上一页" },
    { key: "PageDown / →", desc: "下一页" },
    { key: "Home", desc: "跳到第一页" },
    { key: "End", desc: "跳到最后一页" },
    { key: "[", desc: "上一节" },
    { key: "]", desc: "下一节" },
    { key: "Esc", desc: "退出框选模式或关闭文档搜索" },
    { key: "Enter", desc: "发送消息（对话输入框）" },
    { key: "Shift+Enter", desc: "换行（对话输入框）" },
    { key: "Enter", desc: "下一处（文档搜索框）" },
    { key: "Shift+Enter", desc: "上一处（文档搜索框）" },
    { key: "Enter", desc: "跳转到该页（页码输入框）" },
    { key: "Esc", desc: "取消页码输入（页码输入框）" },
    { key: "Esc", desc: "清空搜索并移出焦点（笔记搜索框）" },
    { key: "Enter", desc: "提交重命名（对话名称输入框）" },
    { key: "?", desc: "打开或关闭本总览" },
  ];
  const SHORTCUT_NOTE_TEXT = "选区浮层（选中文本后出现，无键位）：问 AI / 解释 / 翻译 / 摘录";
  const EXPLAIN_TEMPLATE = "请解释选中的这段话在论文中的含义与作用：";
  const TRANSLATE_TEMPLATE = "请把选中的这段话翻译成中文：";
  const NOTES_ASK_TEMPLATE = "请结合我选中的摘录回答：";
  const QUICK_ASK_ACTIONS = ["问 AI", "解释", "翻译", "摘录"];
  const QUICK_ASK_ICONS = [
    "mdi-comment-question-outline",
    "mdi-lightbulb-on-outline",
    "mdi-translate",
    "mdi-notebook-plus-outline",
  ];
  const RIGHT_WIDTH = "560px";
  /** 活动焦点现场（入口 / 浮层 / body 的身份比对；常量表达式，不占 helper 配额）。 */
  const ACTIVE_PROBE = `(() => {
    const el = document.activeElement;
    return {
      tag: el ? el.tagName : null,
      className: el ? el.className : null,
      isPanel: el === document.querySelector(${JSON.stringify(SEL.shortcutOverview)}),
      isToggle: el === document.querySelector(${JSON.stringify(SEL.shortcutToggle)}),
      isBody: el === document.body,
    };
  })()`;

  /** R17 helper 1/5（§5.4.2）：入口 + 浮层一次读回（入口 5 项 / 浮层 9 项）。 */
  const shortcutProbe = () => js(`(() => {
    const rect = (el) => {
      const box = el.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
    };
    const text = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
    const toggle = document.querySelector(${JSON.stringify(SEL.shortcutToggle)});
    const panel = document.querySelector(${JSON.stringify(SEL.shortcutOverview)});
    return {
      entry: toggle
        ? {
            inDom: true,
            title: toggle.getAttribute("title"),
            ariaLabel: toggle.getAttribute("aria-label"),
            ariaExpanded: toggle.getAttribute("aria-expanded"),
            rect: rect(toggle),
          }
        : { inDom: false, title: null, ariaLabel: null, ariaExpanded: null, rect: null },
      panel: panel
        ? {
            inDom: true,
            rect: rect(panel),
            sectionTitles: Array.from(panel.querySelectorAll(".shortcut-section-title")).map(text),
            rows: Array.from(panel.querySelectorAll(${JSON.stringify(SEL.shortcutRow)})).map((row) => ({
              key: text(row.querySelector(${JSON.stringify(SEL.shortcutKey)})),
              desc: text(row.querySelector(".shortcut-desc")),
            })),
            noteText: text(panel.querySelector(${JSON.stringify(SEL.shortcutNote)})),
            closeCount: panel.querySelectorAll(".shortcut-close").length,
            activeInsidePanel: panel.contains(document.activeElement),
            scrollOverflow: panel.scrollWidth - panel.clientWidth,
            focusableCount: Array.from(document.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")).filter(
              (el) => el === panel || panel.contains(el),
            ).length,
          }
        : {
            inDom: false,
            rect: null,
            sectionTitles: [],
            rows: [],
            noteText: null,
            closeCount: 0,
            activeInsidePanel: false,
            scrollOverflow: null,
            focusableCount: 0,
          },
    };
  })()`);

  /** R17 helper 2/5（§5.4.2）：选区浮层一次读回（display / rect / 4 按钮 / 溢出 / 计数）。 */
  const quickAskActionsProbe = () => js(`(() => {
    const rect = (el) => {
      const box = el.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
    };
    const text = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
    const el = document.querySelector(${JSON.stringify(SEL.quickAsk)});
    if (!el) return { display: null, rect: null, buttons: [], scrollOverflow: null, btnCount: 0 };
    return {
      display: getComputedStyle(el).display,
      rect: rect(el),
      buttons: Array.from(el.querySelectorAll(".quick-ask-btn")).map((btn) => {
        const icon = btn.querySelector(".v-icon");
        const mdi = icon ? Array.from(icon.classList).filter((name) => name.indexOf("mdi-") === 0) : [];
        return { text: text(btn), icon: mdi.length ? mdi[0] : null, rect: rect(btn), disabled: btn.disabled };
      }),
      scrollOverflow: el.scrollWidth - el.clientWidth,
      btnCount: el.querySelectorAll(".quick-ask-btn").length,
    };
  })()`);

  /** R17 helper 3/5（§5.4.2）：写 / 清 CSS 变量并重绘；返回内联值（便于落进 data）。 */
  const layoutVar = async (name, value) => {
    await js(`(() => {
      const style = document.documentElement.style;
      const next = ${JSON.stringify(value)};
      if (next === null) style.removeProperty(${JSON.stringify(name)});
      else style.setProperty(${JSON.stringify(name)}, next);
      return true;
    })()`);
    await repaint(win);
    return js(`document.documentElement.style.getPropertyValue(${JSON.stringify(name)})`);
  };

  /** R17 helper 4/5（§5.4.2）：矩形相交（null 一律 false；调用点必须先做存在性前置 —— 定稿 D6）。 */
  const intersects = (a, b) =>
    !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  /** R17 helper 5/5（§5.4.2）：在真实元素上派发 keydown 并回传 dispatchEvent 布尔（false = 被 preventDefault）。 */
  const pressKeyOnReturning = (selector, key) => js(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error("keydown target not found: " + ${JSON.stringify(selector)});
    return el.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true }));
  })()`);

  /**
   * N97-4 追加 helper 6/6（「追加设计」§3.2）：追加键入原语 —— **真实输入通道**。
   * 逐字符 win.webContents.sendInputEvent({ type: "char" })：字符经真实引擎输入管线落到聚焦的
   * `.input-area`（渲染层收到 isTrusted 的 beforeinput / input(insertText)，与程序化 setter 不同；
   * 任务书 N97-4 要求「真实键入」形态，故不在本追加里沿用 setDraft 的原生 setter 通道）。
   * 落值不符即抛错（不静默降级）；回传写入后的 value。
   */
  const typeIntoComposer = async (text) => {
    const before = await js(`(() => {
      const input = document.querySelector(${JSON.stringify(SEL.composerInput)});
      if (!input) throw new Error("composer input not found");
      return input.value;
    })()`);
    win.webContents.focus();
    for (const ch of text) win.webContents.sendInputEvent({ type: "char", keyCode: ch });
    await waitFor(
      `真实键入落进 composer（${text.length} 字符）`,
      `document.querySelector(${JSON.stringify(SEL.composerInput)}).value === ${JSON.stringify(before + text)}`,
    );
    return js(`document.querySelector(${JSON.stringify(SEL.composerInput)}).value`);
  };

  // --- r17-1 快捷键总览：入口 / 开关 / 输入框守卫 / 关闭路径与焦点（组 r17-shortcut-overview）---
  log("r17-1 入口与浮层：未开文档即可见、点击开关、18 行逐字");
  await enterCleanWorkspace(seedNotes());
  await waitFor("快捷键入口（未开文档）", `document.querySelector(${JSON.stringify(SEL.shortcutToggle)})`);
  const entryBeforeDoc17a = await shortcutProbe();
  const closedCounts17a = {
    overview: await countOf(SEL.shortcutOverview),
    rows: await countOf(SEL.shortcutRow),
    keys: await countOf(SEL.shortcutKey),
    note: await countOf(SEL.shortcutNote),
    toggle: await countOf(SEL.shortcutToggle),
  };
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  const entryAfterDoc17a = await shortcutProbe();
  await clickEl(SEL.shortcutToggle);
  await waitFor("快捷键浮层出现", `document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  await sleep(150);
  const panel17a = await shortcutProbe();
  await capturePage(win, "r17-1-shortcut-overview.png");
  await capturePage(win, "r17-1b-shortcut-overview-entry.png", await rectOfSelector(".center-pill", 12));
  await clickEl(SEL.shortcutToggle);
  await waitFor("快捷键浮层关闭", `!document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  const closed17a = { probe: await shortcutProbe(), rows: await countOf(SEL.shortcutRow) };
  record(
    "r17-shortcut-overview",
    {
      phase: "open-by-click",
      entryBeforeDoc: entryBeforeDoc17a.entry,
      entryAfterDoc: entryAfterDoc17a.entry,
      closedCounts: closedCounts17a,
      panel: panel17a.panel,
      rowCount: panel17a.panel.rows.length,
      sectionTitles: panel17a.panel.sectionTitles,
      closed: { inDom: closed17a.probe.panel.inDom, ariaExpanded: closed17a.probe.entry.ariaExpanded, rows: closed17a.rows },
    },
    [
      ...(closedCounts17a.overview === 0 && closedCounts17a.rows === 0 && closedCounts17a.keys === 0 && closedCounts17a.note === 0 && closedCounts17a.toggle === 1
        ? []
        : [`首帧读数异常（不得有常驻浮层，入口恰 1）：${JSON.stringify(closedCounts17a)}`]),
      ...(entryBeforeDoc17a.entry.inDom === true && entryBeforeDoc17a.entry.ariaExpanded === "false"
        ? []
        : [`未开文档时入口异常：${JSON.stringify(entryBeforeDoc17a.entry)}`]),
      ...(entryBeforeDoc17a.entry.title === "快捷键总览（?）" && entryBeforeDoc17a.entry.ariaLabel === "快捷键总览"
        ? []
        : [`未开文档时 title / aria-label 异常：${JSON.stringify(entryBeforeDoc17a.entry)}`]),
      ...(entryAfterDoc17a.entry.title === "快捷键总览（?）" && entryAfterDoc17a.entry.ariaLabel === "快捷键总览"
        ? []
        : [`开文档后 title / aria-label 异常：${JSON.stringify(entryAfterDoc17a.entry)}`]),
      ...(panel17a.panel.inDom === true && panel17a.entry.ariaExpanded === "true"
        ? []
        : [`点击后应展开：${JSON.stringify({ panel: panel17a.panel.inDom, expanded: panel17a.entry.ariaExpanded })}`]),
      ...(JSON.stringify(panel17a.panel.sectionTitles) === JSON.stringify(SHORTCUT_SECTION_TITLES)
        ? []
        : [`组标题异常：${JSON.stringify(panel17a.panel.sectionTitles)}`]),
      ...(JSON.stringify(panel17a.panel.rows) === JSON.stringify(SHORTCUT_ROWS) ? [] : [`18 行键位表异常：${JSON.stringify(panel17a.panel.rows)}`]),
      ...(panel17a.panel.noteText === SHORTCUT_NOTE_TEXT ? [] : [`说明行异常：${JSON.stringify(panel17a.panel.noteText)}`]),
      ...(panel17a.panel.closeCount === 1 ? [] : [`关闭按钮数异常：${panel17a.panel.closeCount}`]),
      ...(panel17a.panel.focusableCount === 2 ? [] : [`浮层内可聚焦控件应恰 2 个（容器 + 关闭）：${panel17a.panel.focusableCount}`]),
      ...(panel17a.panel.activeInsidePanel === true ? [] : ["打开后焦点应在浮层容器内"]),
      ...(closed17a.probe.panel.inDom === false && closed17a.probe.entry.ariaExpanded === "false" && closed17a.rows === 0
        ? []
        : [`再点击应关闭且清空 DOM：${JSON.stringify({ inDom: closed17a.probe.panel.inDom, expanded: closed17a.probe.entry.ariaExpanded, rows: closed17a.rows })}`]),
    ],
  );

  log("r17-1 键位开关与输入框守卫：? 不吞输入、不误触 /，Esc 一次双响应");
  await setDraft("草稿守卫");
  await js(`document.querySelector(${JSON.stringify(SEL.composerInput)}).focus(), true`);
  const guardReturns17b = await pressKeyOnReturning(SEL.composerInput, "?");
  const guardPanel17b = await shortcutProbe();
  const guardDraft17b = await js(`document.querySelector(${JSON.stringify(SEL.composerInput)}).value`);
  await js("document.activeElement.blur(), true");
  const blurSelfCheck17b = await js("document.activeElement === document.body");
  await pressReaderKey("?");
  await waitFor("body 上 ? 打开浮层", `document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  const bodyOpened17b = await shortcutProbe();
  const bodySearch17b = await has(SEL.pdfSearchPanel);
  await pressReaderKey("?");
  await waitFor("再按 ? 关闭浮层", `!document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  const bodyClosed17b = await shortcutProbe();
  await pressReaderKey("?");
  await waitFor("第三次 ? 再次打开", `document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  await pressReaderKey("/");
  await waitFor("文档搜索面板（既有 / 语义）", `document.querySelector(${JSON.stringify(SEL.pdfSearchPanel)})`);
  const searchOpen17b = await has(SEL.pdfSearchPanel);
  const inputReturns17b = await pressKeyOnReturning(".pdf-search-panel .search-input", "?");
  const inputPanel17b = await shortcutProbe();
  await pressKeyOn(".pdf-search-panel .search-input", "Escape");
  await waitFor(
    "Esc 双响应：搜索面板与浮层同时离开 DOM",
    `!document.querySelector(${JSON.stringify(SEL.pdfSearchPanel)}) && !document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`,
  );
  const afterEsc17b = {
    searchPanel: await has(SEL.pdfSearchPanel),
    overview: await countOf(SEL.shortcutOverview),
    ariaExpanded: (await shortcutProbe()).entry.ariaExpanded,
  };
  record(
    "r17-shortcut-overview",
    {
      phase: "key-toggle-and-typing-guard",
      textareaGuard: { returns: guardReturns17b, inDom: guardPanel17b.panel.inDom, value: guardDraft17b },
      blurSelfCheck: blurSelfCheck17b,
      opened: bodyOpened17b.panel.inDom,
      bodyGuard: { opened: bodyOpened17b.panel.inDom, searchPanel: bodySearch17b },
      closed: bodyClosed17b.panel.inDom,
      searchOpen: searchOpen17b,
      inputGuard: { returns: inputReturns17b, stillOpen: inputPanel17b.panel.inDom },
      afterEsc: afterEsc17b,
    },
    [
      ...(guardReturns17b === true ? [] : ["TEXTAREA 内 ? 不得被 preventDefault"]),
      ...(guardPanel17b.panel.inDom === false ? [] : ["TEXTAREA 内 ? 不得打开浮层"]),
      ...(guardDraft17b === "草稿守卫" ? [] : [`TEXTAREA 内容不得变化：${JSON.stringify(guardDraft17b)}`]),
      ...(blurSelfCheck17b ? [] : "前置失败：blur 后 activeElement 不是 document.body"),
      ...(bodyOpened17b.panel.inDom === true && bodySearch17b === false
        ? []
        : [`body 上 ? 应打开浮层且不得触发 / 语义：${JSON.stringify({ panel: bodyOpened17b.panel.inDom, search: bodySearch17b })}`]),
      ...(bodyClosed17b.panel.inDom === false ? [] : ["第二次 ? 应关闭浮层（toggle 语义）"]),
      ...(searchOpen17b === true ? [] : ["/ 应打开文档搜索（既有键位不得被劫持）"]),
      ...(inputReturns17b === true ? [] : ["INPUT 内 ? 不得被 preventDefault"]),
      ...(inputPanel17b.panel.inDom === true ? [] : ["INPUT 内 ? 不得切换浮层"]),
      ...(afterEsc17b.searchPanel === false && afterEsc17b.overview === 0 && afterEsc17b.ariaExpanded === "false"
        ? []
        : [`一次 Esc 应同时关闭搜索与浮层：${JSON.stringify(afterEsc17b)}`]),
    ],
  );

  log("r17-1 三条关闭路径与两种焦点归还：Esc / 外部点击 / 关闭按钮");
  const quietBefore17c = {
    scrollTop: await js(`document.querySelector(${JSON.stringify(SEL.pdfScroll)}).scrollTop`),
    pageBox: await rectOfSelector(SEL.pageBoxOne, 0),
  };
  const writesBase17c = {
    send: (await sendCalls()).count,
    notesAdd: (await notesAddCalls()).count,
    stateSave: (await saveCalls()).count,
  };
  // 关闭路径①：Esc（打开后焦点应落在浮层容器）
  await clickEl(SEL.shortcutToggle);
  await waitFor("浮层打开（Esc 路径）", `document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  await sleep(120);
  const escOpened17c = await js(ACTIVE_PROBE);
  await pressKeyOn(SEL.shortcutOverview, "Escape");
  await waitFor("Esc 关闭浮层", `!document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  const escClosed17c = {
    gone: !(await has(SEL.shortcutOverview)),
    rows: await countOf(SEL.shortcutRow),
    expanded: (await shortcutProbe()).entry.ariaExpanded,
    active: await js(ACTIVE_PROBE),
  };
  // 关闭路径②：点击浮层与入口之外（document 上的 pointerdown）
  await clickEl(SEL.shortcutToggle);
  await waitFor("浮层打开（外部点击路径）", `document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  await js(`document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), true`);
  await waitFor("外部点击关闭浮层", `!document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  const outsideClosed17c = {
    gone: !(await has(SEL.shortcutOverview)),
    rows: await countOf(SEL.shortcutRow),
    expanded: (await shortcutProbe()).entry.ariaExpanded,
  };
  // 关闭路径③：关闭按钮
  await clickEl(SEL.shortcutToggle);
  await waitFor("浮层打开（关闭按钮路径）", `document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  await clickEl(".shortcut-close");
  await waitFor("关闭按钮关闭浮层", `!document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  const closeBtnClosed17c = {
    gone: !(await has(SEL.shortcutOverview)),
    rows: await countOf(SEL.shortcutRow),
    expanded: (await shortcutProbe()).entry.ariaExpanded,
  };
  // 焦点归还（入口分支；定稿 D2）：程序化 click 不移动焦点 ⇒ 必须先 focus() 入口并自检
  const entryFocusSelfCheck17c = await js(`(() => {
    const el = document.querySelector(${JSON.stringify(SEL.shortcutToggle)});
    el.focus();
    return document.activeElement === el;
  })()`);
  await clickEl(SEL.shortcutToggle);
  await waitFor("浮层打开（入口焦点分支）", `document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  await pressKeyOn(SEL.shortcutOverview, "Escape");
  await waitFor("入口分支关闭浮层", `!document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  const focusByEntry17c = await js(ACTIVE_PROBE);
  // 焦点归还（body 分支）：blur 前置 + 自检
  await js("document.activeElement.blur(), true");
  const bodyFocusSelfCheck17c = await js("document.activeElement === document.body");
  await pressReaderKey("?");
  await waitFor("浮层打开（body 焦点分支）", `document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  await pressKeyOn(SEL.shortcutOverview, "Escape");
  await waitFor("body 分支关闭浮层", `!document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  const focusByBody17c = await js(ACTIVE_PROBE);
  const writesAfter17c = {
    send: (await sendCalls()).count,
    notesAdd: (await notesAddCalls()).count,
    stateSave: (await saveCalls()).count,
  };
  const quietAfter17c = {
    scrollTop: await js(`document.querySelector(${JSON.stringify(SEL.pdfScroll)}).scrollTop`),
    pageBox: await rectOfSelector(SEL.pageBoxOne, 0),
  };
  record(
    "r17-shortcut-overview",
    {
      phase: "close-paths-and-focus-return",
      esc: escClosed17c,
      outside: outsideClosed17c,
      closeBtn: closeBtnClosed17c,
      openedActive: escOpened17c,
      focusReturn: { byEntry: focusByEntry17c, byBody: focusByBody17c },
      selfChecks: { entryFocus: entryFocusSelfCheck17c, bodyFocus: bodyFocusSelfCheck17c },
      writes: {
        send: writesAfter17c.send - writesBase17c.send,
        notesAdd: writesAfter17c.notesAdd - writesBase17c.notesAdd,
        stateSave: writesAfter17c.stateSave - writesBase17c.stateSave,
      },
      quiet: { scrollTop: { before: quietBefore17c.scrollTop, after: quietAfter17c.scrollTop }, pageBox: { before: quietBefore17c.pageBox, after: quietAfter17c.pageBox } },
    },
    [
      ...(escOpened17c.isPanel === true ? [] : [`打开后焦点应在浮层容器（tabindex="-1"）：${JSON.stringify(escOpened17c)}`]),
      ...(escClosed17c.gone && escClosed17c.rows === 0 && escClosed17c.expanded === "false" ? [] : [`Esc 关闭异常：${JSON.stringify(escClosed17c)}`]),
      ...(outsideClosed17c.gone && outsideClosed17c.rows === 0 && outsideClosed17c.expanded === "false"
        ? []
        : [`外部点击关闭异常：${JSON.stringify(outsideClosed17c)}`]),
      ...(closeBtnClosed17c.gone && closeBtnClosed17c.rows === 0 && closeBtnClosed17c.expanded === "false"
        ? []
        : [`关闭按钮关闭异常：${JSON.stringify(closeBtnClosed17c)}`]),
      ...(entryFocusSelfCheck17c ? [] : "前置失败：入口 focus() 自检不成立（程序化 click 不移动焦点，定稿 D2）"),
      ...(focusByEntry17c.isToggle === true ? [] : [`入口分支关闭后焦点应回到入口：${JSON.stringify(focusByEntry17c)}`]),
      ...(bodyFocusSelfCheck17c ? [] : "前置失败：blur 后 activeElement 不是 document.body"),
      ...(focusByBody17c.isBody === true ? [] : [`body 分支关闭后焦点应留在 body：${JSON.stringify(focusByBody17c)}`]),
      ...(writesAfter17c.send - writesBase17c.send === 0 && writesAfter17c.notesAdd - writesBase17c.notesAdd === 0 && writesAfter17c.stateSave - writesBase17c.stateSave === 0
        ? []
        : [`开关浮层不得产生任何写入：${JSON.stringify({ base: writesBase17c, after: writesAfter17c })}`]),
      ...(quietBefore17c.scrollTop === quietAfter17c.scrollTop && JSON.stringify(quietBefore17c.pageBox) === JSON.stringify(quietAfter17c.pageBox)
        ? []
        : [`开关浮层不得扰动阅读现场：${JSON.stringify({ before: quietBefore17c, after: quietAfter17c })}`]),
    ],
  );

  // --- r17-1b 浮动总览几何：默认宽度 / 窄栏（组 r17-shortcut-geometry）----------------
  log("r17-1b 浮层几何：中间栏内、与既有控件零相交（默认宽度）");
  await enterCleanWorkspace(seedNotes());
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await waitFor("快捷键入口（几何场景）", `document.querySelector(${JSON.stringify(SEL.shortcutToggle)})`);
  const mapSlotInDom17d = await has(SEL.mapSlot);
  const quietBefore17d = {
    scrollTop: await js(`document.querySelector(${JSON.stringify(SEL.pdfScroll)}).scrollTop`),
    pageBox: await rectOfSelector(SEL.pageBoxOne, 0),
  };
  await clickEl(SEL.shortcutToggle);
  await waitFor("浮层打开（默认宽度）", `document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  await sleep(150);
  const probe17d = await shortcutProbe();
  const rects17d = {
    panel: probe17d.panel.rect,
    entry: probe17d.entry.rect,
    readerPanel: await rectOfSelector(".reader-panel", 0),
    toolbar: await rectOfSelector(".pdf-toolbar", 0),
    indicator: await rectOfSelector(SEL.pageIndicator, 0),
    section: await rectOfSelector(SEL.readerSection, 0),
    fab: await rectOfSelector(".pdf-capture-fab", 0),
    pill: await rectOfSelector(".center-pill", 0),
    composer: await rectOfSelector(SEL.composerBox, 0),
  };
  const rectsPresent17d = Object.fromEntries(Object.entries(rects17d).map(([key, value]) => [key, value !== null]));
  const intersect17d = {
    composer: intersects(rects17d.panel, rects17d.composer),
    toolbar: intersects(rects17d.panel, rects17d.toolbar),
    indicator: intersects(rects17d.panel, rects17d.indicator),
    section: intersects(rects17d.panel, rects17d.section),
    fab: intersects(rects17d.panel, rects17d.fab),
    pill: intersects(rects17d.panel, rects17d.pill),
  };
  const insideReaderPanel17d =
    !!rects17d.panel &&
    !!rects17d.readerPanel &&
    rects17d.panel.x >= rects17d.readerPanel.x &&
    rects17d.panel.y >= rects17d.readerPanel.y &&
    rects17d.panel.x + rects17d.panel.width <= rects17d.readerPanel.x + rects17d.readerPanel.width &&
    rects17d.panel.y + rects17d.panel.height <= rects17d.readerPanel.y + rects17d.readerPanel.height;
  await clickEl(SEL.shortcutToggle);
  await waitFor("浮层关闭（默认宽度）", `!document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  const quietAfter17d = {
    scrollTop: await js(`document.querySelector(${JSON.stringify(SEL.pdfScroll)}).scrollTop`),
    pageBox: await rectOfSelector(SEL.pageBoxOne, 0),
  };
  record(
    "r17-shortcut-geometry",
    {
      phase: "default",
      mapSlotInDom: mapSlotInDom17d,
      rectsPresent: rectsPresent17d,
      panel: rects17d.panel,
      entry: rects17d.entry,
      controls: { toolbar: rects17d.toolbar, indicator: rects17d.indicator, section: rects17d.section, fab: rects17d.fab },
      composer: rects17d.composer,
      pill: rects17d.pill,
      intersect: intersect17d,
      insideReaderPanel: insideReaderPanel17d,
      quiet: { scrollTop: { before: quietBefore17d.scrollTop, after: quietAfter17d.scrollTop }, pageBox: { before: quietBefore17d.pageBox, after: quietAfter17d.pageBox } },
    },
    [
      ...(mapSlotInDom17d === false ? [] : ["前置失败：知识地图未关闭（.knowledge-map-slot 仍在 DOM）"]),
      ...(Object.values(rectsPresent17d).every(Boolean) ? [] : [`rect 缺失（零相交断言的存在性前置，定稿 D6）：${JSON.stringify(rectsPresent17d)}`]),
      ...(insideReaderPanel17d ? [] : [`浮层应落在 .reader-panel 内：${JSON.stringify({ panel: rects17d.panel, readerPanel: rects17d.readerPanel })}`]),
      ...(JSON.stringify(intersect17d) === JSON.stringify({ composer: false, toolbar: false, indicator: false, section: false, fab: false, pill: false })
        ? []
        : [`浮层与既有控件相交：${JSON.stringify(intersect17d)}`]),
      ...(rects17d.panel && rects17d.panel.width === 320 ? [] : [`浮层宽度应为 320：${JSON.stringify(rects17d.panel)}`]),
      ...(rects17d.entry && rects17d.entry.width === 20 && rects17d.entry.height === 20 ? [] : [`入口应为 20x20：${JSON.stringify(rects17d.entry)}`]),
      ...(quietBefore17d.scrollTop === quietAfter17d.scrollTop && JSON.stringify(quietBefore17d.pageBox) === JSON.stringify(quietAfter17d.pageBox)
        ? []
        : [`浮层不得扰动阅读现场：${JSON.stringify({ before: quietBefore17d, after: quietAfter17d })}`]),
    ],
  );

  log("r17-1b 浮层几何：窄栏（--pix-right-width: 560px）仍完整且零相交");
  const rightVarNarrow17e = await layoutVar("--pix-right-width", RIGHT_WIDTH);
  const rightWidthNarrow17e = await js(`Math.round(document.querySelector(".layout-right").getBoundingClientRect().width)`);
  const quietBefore17e = {
    scrollTop: await js(`document.querySelector(${JSON.stringify(SEL.pdfScroll)}).scrollTop`),
    pageBox: await rectOfSelector(SEL.pageBoxOne, 0),
  };
  await clickEl(SEL.shortcutToggle);
  await waitFor("浮层打开（窄栏）", `document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  await sleep(150);
  const probe17e = await shortcutProbe();
  const rects17e = {
    panel: probe17e.panel.rect,
    entry: probe17e.entry.rect,
    readerPanel: await rectOfSelector(".reader-panel", 0),
    toolbar: await rectOfSelector(".pdf-toolbar", 0),
    indicator: await rectOfSelector(SEL.pageIndicator, 0),
    section: await rectOfSelector(SEL.readerSection, 0),
    fab: await rectOfSelector(".pdf-capture-fab", 0),
    pill: await rectOfSelector(".center-pill", 0),
    composer: await rectOfSelector(SEL.composerBox, 0),
  };
  const mapSlotInDom17e = await has(SEL.mapSlot);
  const rectsPresent17e = Object.fromEntries(Object.entries(rects17e).map(([key, value]) => [key, value !== null]));
  const intersect17e = {
    composer: intersects(rects17e.panel, rects17e.composer),
    toolbar: intersects(rects17e.panel, rects17e.toolbar),
    indicator: intersects(rects17e.panel, rects17e.indicator),
    section: intersects(rects17e.panel, rects17e.section),
    fab: intersects(rects17e.panel, rects17e.fab),
    pill: intersects(rects17e.panel, rects17e.pill),
  };
  const insideReaderPanel17e =
    !!rects17e.panel &&
    !!rects17e.readerPanel &&
    rects17e.panel.x >= rects17e.readerPanel.x &&
    rects17e.panel.y >= rects17e.readerPanel.y &&
    rects17e.panel.x + rects17e.panel.width <= rects17e.readerPanel.x + rects17e.readerPanel.width &&
    rects17e.panel.y + rects17e.panel.height <= rects17e.readerPanel.y + rects17e.readerPanel.height;
  await capturePage(win, "r17-1c-shortcut-overview-narrow.png", await rectOfSelector(SEL.shortcutOverview, 12));
  await clickEl(SEL.shortcutToggle);
  await waitFor("浮层关闭（窄栏）", `!document.querySelector(${JSON.stringify(SEL.shortcutOverview)})`);
  const quietAfter17e = {
    scrollTop: await js(`document.querySelector(${JSON.stringify(SEL.pdfScroll)}).scrollTop`),
    pageBox: await rectOfSelector(SEL.pageBoxOne, 0),
  };
  const rightVarRestored17e = await layoutVar("--pix-right-width", null);
  const restoredRightWidth17e = await js(`Math.round(document.querySelector(".layout-right").getBoundingClientRect().width)`);
  record(
    "r17-shortcut-geometry",
    {
      phase: "narrow",
      rightWidth: rightWidthNarrow17e,
      rightVar: rightVarNarrow17e,
      mapSlotInDom: mapSlotInDom17e,
      rectsPresent: rectsPresent17e,
      panel: rects17e.panel,
      entry: rects17e.entry,
      controls: { toolbar: rects17e.toolbar, indicator: rects17e.indicator, section: rects17e.section, fab: rects17e.fab },
      composer: rects17e.composer,
      pill: rects17e.pill,
      intersect: intersect17e,
      insideReaderPanel: insideReaderPanel17e,
      quiet: { scrollTop: { before: quietBefore17e.scrollTop, after: quietAfter17e.scrollTop }, pageBox: { before: quietBefore17e.pageBox, after: quietAfter17e.pageBox } },
      restoredRightWidth: restoredRightWidth17e,
      restoredVar: rightVarRestored17e,
    },
    [
      ...(Math.abs(rightWidthNarrow17e - 560) <= 2 ? [] : [`窄栏未生效（空断言防护）：${rightWidthNarrow17e}`]),
      ...(rightVarNarrow17e === RIGHT_WIDTH ? [] : [`CSS 变量未写入：${JSON.stringify(rightVarNarrow17e)}`]),
      ...(mapSlotInDom17e === false ? [] : ["前置失败：知识地图未关闭（.knowledge-map-slot 仍在 DOM）"]),
      ...(Object.values(rectsPresent17e).every(Boolean) ? [] : [`rect 缺失（零相交断言的存在性前置，定稿 D6）：${JSON.stringify(rectsPresent17e)}`]),
      ...(insideReaderPanel17e ? [] : [`窄栏下浮层应仍落在 .reader-panel 内：${JSON.stringify({ panel: rects17e.panel, readerPanel: rects17e.readerPanel })}`]),
      ...(JSON.stringify(intersect17e) === JSON.stringify({ composer: false, toolbar: false, indicator: false, section: false, fab: false, pill: false })
        ? []
        : [`窄栏下浮层与既有控件相交：${JSON.stringify(intersect17e)}`]),
      ...(rects17e.panel && rects17e.panel.width === 320 ? [] : [`窄栏下浮层宽度应为 320：${JSON.stringify(rects17e.panel)}`]),
      ...(quietBefore17e.scrollTop === quietAfter17e.scrollTop && JSON.stringify(quietBefore17e.pageBox) === JSON.stringify(quietAfter17e.pageBox)
        ? []
        : [`窄栏下浮层不得扰动阅读现场：${JSON.stringify({ before: quietBefore17e, after: quietAfter17e })}`]),
      ...(Math.abs(restoredRightWidth17e - 380) <= 2 ? [] : [`右栏宽度未复位：${restoredRightWidth17e}`]),
      ...(rightVarRestored17e === "" ? [] : [`CSS 变量未清除：${JSON.stringify(rightVarRestored17e)}`]),
    ],
  );

  // --- r17-2 选区模板动作：4 按钮 / 预填 / 替换 / 不发送（组 r17-template-actions）-----
  log("r17-2 四个动作：DOM 顺序 / 图标 / 可聚焦 / 点「解释」预填草稿且不发送");
  await enterCleanWorkspace(seedNotes());
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  const notesFileRows17f = readNotes().length;
  const notesHash17f = notesHash();
  await selectPageSpan(1);
  const ready17f = await ensureQuickAskExcerptReady(1);
  const spanText17f = await pageSpanText(1);
  const actions17f = await quickAskActionsProbe();
  const buttonsMeta17f = await js(`(() => {
    const buttons = Array.from(document.querySelectorAll(".quick-ask-btn"));
    const target = buttons.find((btn) => (btn.textContent || "").includes("解释"));
    if (!target) return null;
    target.focus();
    return {
      meta: buttons.map((btn) => ({ tagName: btn.tagName, tabIndex: btn.tabIndex })),
      activeIsExplain: document.activeElement === target,
      activeText: document.activeElement ? document.activeElement.textContent.replace(/\\s+/g, " ").trim() : null,
    };
  })()`);
  await capturePage(win, "r17-2-quick-ask-four-actions.png", await rectOfSelector(SEL.quickAsk, 30));
  await clearSendCalls();
  const selectionBefore17f = await selectionProbe();
  const chipsBefore17f = await chipSnapshot();
  const blocksBefore17f = await userBlocks();
  await js(`(() => {
    const target = Array.from(document.querySelectorAll(".quick-ask-btn")).find((btn) => (btn.textContent || "").includes("解释"));
    if (!target) throw new Error("解释按钮不存在");
    target.click();
    return true;
  })()`);
  await waitFor(
    "点模板动作后浮层隐藏",
    `(() => { const el = document.querySelector(${JSON.stringify(SEL.quickAsk)}); return !!el && getComputedStyle(el).display === "none"; })()`,
  );
  const composer17f = await composerSnapshot();
  const quickAskAfter17f = await quickAskStateProbe();
  const sendDelta17f = (await sendCalls()).count;
  const selectionAfter17f = await selectionProbe();
  const chipsAfter17f = await chipSnapshot();
  const blocksAfter17f = await userBlocks();
  const notesAfter17f = { fileRows: readNotes().length, hashSame: notesHash() === notesHash17f };
  await capturePage(win, "r17-2b-template-explain-draft.png", await rectOfSelector(SEL.composerBox, 0));
  // 塌陷根因控制实验（增量步骤，登记）：blur → 重建页内选区 → 写模板草稿 → 聚焦 composer。
  // 已证明（同引擎一次性探针）：focus textarea ⇒ 选区 collapsed；写值但未聚焦 ⇒ 选区完好；
  // 隐藏被聚焦按钮（hide() 路径）⇒ 选区完好；被聚焦按钮 ⇒ 选区完好。
  await js("document.activeElement.blur(), true");
  await selectPageSpan(1);
  const controlBefore17f = await selectionProbe();
  await setDraft(EXPLAIN_TEMPLATE);
  const controlAfterWrite17f = await selectionProbe();
  await js(`document.querySelector(${JSON.stringify(SEL.composerInput)}).focus(), true`);
  const controlAfterFocus17f = await selectionProbe();
  record(
    "r17-template-actions",
    {
      phase: "explain",
      actions: actions17f,
      buttonsMeta: buttonsMeta17f,
      focusable: { activeIsExplain: buttonsMeta17f ? buttonsMeta17f.activeIsExplain : null, activeText: buttonsMeta17f ? buttonsMeta17f.activeText : null },
      draft: composer17f.value,
      focused: composer17f.activeHasInputArea,
      quickAskAfterExplain: quickAskAfter17f,
      quiet: {
        send: sendDelta17f,
        blocks: { before: blocksBefore17f, after: blocksAfter17f },
        selection: { spanText: spanText17f, before: selectionBefore17f, after: selectionAfter17f },
        chips: { before: chipsBefore17f, after: chipsAfter17f },
        notes: notesAfter17f,
      },
      control: { before: controlBefore17f, afterWrite: controlAfterWrite17f, afterFocus: controlAfterFocus17f },
      ready: ready17f.ok,
    },
    [
      ...(ready17f.ok ? [] : [`前置失败：浮层未就绪 ${JSON.stringify(ready17f.trail)}`]),
      ...(actions17f.btnCount === actions17f.buttons.length && actions17f.buttons.length === QUICK_ASK_ACTIONS.length && actions17f.display !== "none"
        ? []
        : [`4 动作形态异常：${JSON.stringify({ display: actions17f.display, btnCount: actions17f.btnCount })}`]),
      ...(JSON.stringify(actions17f.buttons.map((btn) => btn.text)) === JSON.stringify(QUICK_ASK_ACTIONS)
        ? []
        : [`动作文案异常：${JSON.stringify(actions17f.buttons.map((btn) => btn.text))}`]),
      ...(JSON.stringify(actions17f.buttons.map((btn) => btn.icon)) === JSON.stringify(QUICK_ASK_ICONS)
        ? []
        : [`动作图标异常：${JSON.stringify(actions17f.buttons.map((btn) => btn.icon))}`]),
      ...(actions17f.buttons.length === 4 && actions17f.buttons.every((btn) => btn.disabled === false)
        ? []
        : [`动作不得处于禁用态：${JSON.stringify(actions17f.buttons.map((btn) => btn.disabled))}`]),
      ...(!!buttonsMeta17f && buttonsMeta17f.meta.length === 4 && buttonsMeta17f.meta.every((item) => item.tagName === "BUTTON" && item.tabIndex >= 0)
        ? []
        : [`动作控件形态异常（tagName / tabIndex）：${JSON.stringify(buttonsMeta17f)}`]),
      ...(!!buttonsMeta17f && buttonsMeta17f.activeIsExplain === true ? [] : [`「解释」按钮 focus() 后应成为 activeElement：${JSON.stringify(buttonsMeta17f)}`]),
      ...(composer17f.value === EXPLAIN_TEMPLATE ? [] : [`草稿应逐字等于解释模板：${JSON.stringify(composer17f.value)}`]),
      ...(composer17f.activeHasInputArea === true ? [] : ["模板动作后应聚焦输入框"]),
      ...(sendDelta17f === 0 && blocksAfter17f === blocksBefore17f
        ? []
        : [`模板动作不得发送：${JSON.stringify({ send: sendDelta17f, before: blocksBefore17f, after: blocksAfter17f })}`]),
      ...(selectionBefore17f.collapsed === false && selectionBefore17f.anchorInStage === true && selectionBefore17f.text === spanText17f
        ? []
        : [`点击时选区应完好（与页 1 首 span 逐字相等）：${JSON.stringify({ before: selectionBefore17f, spanText: spanText17f })}`]),
      ...(composer17f.activeHasInputArea === true ? [] : ["点击后焦点应在输入框（塌陷成因）"]),
      ...(selectionAfter17f.collapsed === true && selectionAfter17f.anchorInStage === false
        ? []
        : [`点击后选区应被收进输入框（既有 R8-dev D6 行为）：${JSON.stringify(selectionAfter17f)}`]),
      ...(JSON.stringify(chipsAfter17f) === JSON.stringify(chipsBefore17f)
        ? []
        : [`点击后 chips 应与点击前逐字相等（含「选中文本」项）：${JSON.stringify({ before: chipsBefore17f, after: chipsAfter17f })}`]),
      ...(controlBefore17f.collapsed === false && controlBefore17f.text === spanText17f ? [] : [`控制实验前置失败（选区未重建）：${JSON.stringify(controlBefore17f)}`]),
      ...(controlAfterWrite17f.text === controlBefore17f.text && controlAfterWrite17f.collapsed === false
        ? []
        : [`写入草稿本身不得清选区：${JSON.stringify(controlAfterWrite17f)}`]),
      ...(controlAfterFocus17f.collapsed === true && controlAfterFocus17f.anchorInStage === false
        ? []
        : [`控制实验应复现塌陷（focus ⇒ collapsed）：${JSON.stringify(controlAfterFocus17f)}`]),
      ...(quickAskAfter17f.display === "none" && quickAskAfter17f.btnCount === 3
        ? []
        : [`点动作后浮层形态异常（M1 口径：摘录因 selectionPage=null 掉落）：${JSON.stringify(quickAskAfter17f)}`]),
      ...(notesAfter17f.fileRows === notesFileRows17f && notesAfter17f.hashSame ? [] : [`模板动作不得写盘：${JSON.stringify(notesAfter17f)}`]),
    ],
  );

  log("r17-2 模板替换：解释模板 → 翻译、空草稿 → 翻译");
  await clearSendCalls();
  await selectPageSpan(1);
  const ready17g1 = await ensureQuickAskExcerptReady(1);
  await js(`(() => {
    const target = Array.from(document.querySelectorAll(".quick-ask-btn")).find((btn) => (btn.textContent || "").includes("翻译"));
    if (!target) throw new Error("翻译按钮不存在");
    target.click();
    return true;
  })()`);
  await waitFor(
    "翻译后浮层隐藏（替换相位）",
    `(() => { const el = document.querySelector(${JSON.stringify(SEL.quickAsk)}); return !!el && getComputedStyle(el).display === "none"; })()`,
  );
  const afterReplace17g = await js(`document.querySelector(${JSON.stringify(SEL.composerInput)}).value`);
  const focusedReplace17g = await js(`document.activeElement === document.querySelector(${JSON.stringify(SEL.composerInput)})`);
  await setDraft("");
  await selectPageSpan(1);
  const ready17g2 = await ensureQuickAskExcerptReady(1);
  await js(`(() => {
    const target = Array.from(document.querySelectorAll(".quick-ask-btn")).find((btn) => (btn.textContent || "").includes("翻译"));
    if (!target) throw new Error("翻译按钮不存在");
    target.click();
    return true;
  })()`);
  await waitFor(
    "空草稿下翻译后浮层隐藏",
    `(() => { const el = document.querySelector(${JSON.stringify(SEL.quickAsk)}); return !!el && getComputedStyle(el).display === "none"; })()`,
  );
  const afterEmpty17g = await js(`document.querySelector(${JSON.stringify(SEL.composerInput)}).value`);
  await capturePage(win, "r17-2c-template-translate-draft.png", await rectOfSelector(SEL.composerBox, 0));
  const sendDelta17g = (await sendCalls()).count;
  record(
    "r17-template-actions",
    {
      phase: "translate-replace",
      afterReplace: afterReplace17g,
      afterEmpty: afterEmpty17g,
      focused: focusedReplace17g,
      send: sendDelta17g,
      ready: { replace: ready17g1.ok, empty: ready17g2.ok },
    },
    [
      ...(ready17g1.ok ? [] : [`前置失败（替换相位）：${JSON.stringify(ready17g1.trail)}`]),
      ...(ready17g2.ok ? [] : [`前置失败（空草稿相位）：${JSON.stringify(ready17g2.trail)}`]),
      ...(afterReplace17g === TRANSLATE_TEMPLATE ? [] : [`机器模板应被替换：${JSON.stringify(afterReplace17g)}`]),
      ...(afterEmpty17g === TRANSLATE_TEMPLATE ? [] : [`空草稿应填入翻译模板：${JSON.stringify(afterEmpty17g)}`]),
      ...(focusedReplace17g === true ? [] : ["替换后应聚焦输入框"]),
      ...(sendDelta17g === 0 ? [] : [`替换相位不得发送：${sendDelta17g}`]),
    ],
  );

  log("r17-2 自定义草稿与笔记模板：一字不改");
  await clearSendCalls();
  await setDraft("我的问题：请给出结论");
  await selectPageSpan(1);
  const ready17h1 = await ensureQuickAskExcerptReady(1);
  await js(`(() => {
    const target = Array.from(document.querySelectorAll(".quick-ask-btn")).find((btn) => (btn.textContent || "").includes("解释"));
    if (!target) throw new Error("解释按钮不存在");
    target.click();
    return true;
  })()`);
  await waitFor(
    "自定义草稿下浮层隐藏",
    `(() => { const el = document.querySelector(${JSON.stringify(SEL.quickAsk)}); return !!el && getComputedStyle(el).display === "none"; })()`,
  );
  const customKept17h = await js(`document.querySelector(${JSON.stringify(SEL.composerInput)}).value`);
  const focusedCustom17h = await js(`document.activeElement === document.querySelector(${JSON.stringify(SEL.composerInput)})`);
  await setDraft(NOTES_ASK_TEMPLATE);
  await selectPageSpan(1);
  const ready17h2 = await ensureQuickAskExcerptReady(1);
  await js(`(() => {
    const target = Array.from(document.querySelectorAll(".quick-ask-btn")).find((btn) => (btn.textContent || "").includes("翻译"));
    if (!target) throw new Error("翻译按钮不存在");
    target.click();
    return true;
  })()`);
  await waitFor(
    "笔记模板下浮层隐藏",
    `(() => { const el = document.querySelector(${JSON.stringify(SEL.quickAsk)}); return !!el && getComputedStyle(el).display === "none"; })()`,
  );
  const notesTemplateKept17h = await js(`document.querySelector(${JSON.stringify(SEL.composerInput)}).value`);
  const sendDelta17h = (await sendCalls()).count;
  record(
    "r17-template-actions",
    {
      phase: "custom-draft-kept",
      customKept: customKept17h,
      notesTemplateKept: notesTemplateKept17h,
      focused: focusedCustom17h,
      send: sendDelta17h,
      ready: { custom: ready17h1.ok, notes: ready17h2.ok },
    },
    [
      ...(ready17h1.ok ? [] : [`前置失败（自定义草稿相位）：${JSON.stringify(ready17h1.trail)}`]),
      ...(ready17h2.ok ? [] : [`前置失败（笔记模板相位）：${JSON.stringify(ready17h2.trail)}`]),
      ...(customKept17h === "我的问题：请给出结论" ? [] : [`自定义草稿不得被覆盖：${JSON.stringify(customKept17h)}`]),
      ...(notesTemplateKept17h === NOTES_ASK_TEMPLATE ? [] : [`笔记模板不参与替换：${JSON.stringify(notesTemplateKept17h)}`]),
      ...(focusedCustom17h === true ? [] : ["模板动作后应聚焦输入框（含一字不改分支）"]),
      ...(sendDelta17h === 0 ? [] : [`自定义草稿相位不得发送：${sendDelta17h}`]),
    ],
  );

  // --- r17-2b 4 按钮几何：默认 / 窄栏 / 窄栏 + 200%（组 r17-template-geometry）--------
  log("r17-2b 4 按钮几何：默认宽度下同一行、浮层在 stage 内、零相交");
  await enterCleanWorkspace(seedNotes());
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await selectPageSpan(1);
  const ready17i1 = await ensureQuickAskExcerptReady(1);
  const actions17i1 = await quickAskActionsProbe();
  const stage17i1 = await rectOfSelector(".reader-stage", 0);
  const composer17i1 = await rectOfSelector(SEL.composerBox, 0);
  const section17i1 = await rectOfSelector(SEL.readerSection, 0);
  const indicator17i1 = await rectOfSelector(SEL.pageIndicator, 0);
  const insideStage17i1 =
    !!actions17i1.rect &&
    !!stage17i1 &&
    actions17i1.rect.x >= stage17i1.x + 4 - 1 &&
    actions17i1.rect.y >= stage17i1.y + 4 - 1 &&
    actions17i1.rect.x + actions17i1.rect.width <= stage17i1.x + stage17i1.width - 4 + 1 &&
    actions17i1.rect.y + actions17i1.rect.height <= stage17i1.y + stage17i1.height - 4 + 1;
  record(
    "r17-template-geometry",
    {
      phase: "four-buttons-default",
      stage: stage17i1,
      float: actions17i1.rect,
      buttons: actions17i1.buttons,
      scrollOverflow: actions17i1.scrollOverflow,
      insideStage: insideStage17i1,
      ready: ready17i1.ok,
      intersect: {
        composer: intersects(actions17i1.rect, composer17i1),
        section: intersects(actions17i1.rect, section17i1),
        indicator: intersects(actions17i1.rect, indicator17i1),
      },
    },
    [
      ...(ready17i1.ok ? [] : [`前置失败（默认宽度相位）：${JSON.stringify(ready17i1.trail)}`]),
      ...(!!actions17i1.rect && !!stage17i1 && !!composer17i1 && !!section17i1 && !!indicator17i1 ? [] : ["rect 缺失（几何断言前置）"]),
      ...(insideStage17i1 ? [] : [`浮层应钳制在 .reader-stage 内（STAGE_PADDING=4）：${JSON.stringify({ float: actions17i1.rect, stage: stage17i1 })}`]),
      ...(actions17i1.scrollOverflow !== null && actions17i1.scrollOverflow <= 1 ? [] : [`浮层横向不得溢出：${actions17i1.scrollOverflow}`]),
      ...(actions17i1.buttons.length === 4 &&
      actions17i1.buttons.every((btn, index, list) => btn.rect.width > 0 && (index === 0 || btn.rect.x > list[index - 1].rect.x)) &&
      Math.max(...actions17i1.buttons.map((btn) => btn.rect.y)) - Math.min(...actions17i1.buttons.map((btn) => btn.rect.y)) <= 1 &&
      actions17i1.buttons.every((btn, index, list) => list.every((other, otherIndex) => otherIndex <= index || !intersects(btn.rect, other.rect)))
        ? []
        : [`4 按钮应单行递增且两两不相交：${JSON.stringify(actions17i1.buttons)}`]),
      ...(JSON.stringify(actions17i1.buttons.map((btn) => btn.text)) === JSON.stringify(QUICK_ASK_ACTIONS) ? [] : [`动作文案异常：${JSON.stringify(actions17i1.buttons.map((btn) => btn.text))}`]),
      ...(!intersects(actions17i1.rect, composer17i1) && !intersects(actions17i1.rect, section17i1) && !intersects(actions17i1.rect, indicator17i1)
        ? []
        : [`浮层与既有控件相交：${JSON.stringify({ composer: intersects(actions17i1.rect, composer17i1), section: intersects(actions17i1.rect, section17i1), indicator: intersects(actions17i1.rect, indicator17i1) })}`]),
    ],
  );

  log("r17-2b 4 按钮几何：窄栏（--pix-right-width: 560px）");
  const rightVarNarrow17i2 = await layoutVar("--pix-right-width", RIGHT_WIDTH);
  await selectPageSpan(1);
  const ready17i2 = await ensureQuickAskExcerptReady(1);
  const actions17i2 = await quickAskActionsProbe();
  const stage17i2 = await rectOfSelector(".reader-stage", 0);
  const composer17i2 = await rectOfSelector(SEL.composerBox, 0);
  const section17i2 = await rectOfSelector(SEL.readerSection, 0);
  const indicator17i2 = await rectOfSelector(SEL.pageIndicator, 0);
  const insideStage17i2 =
    !!actions17i2.rect &&
    !!stage17i2 &&
    actions17i2.rect.x >= stage17i2.x + 4 - 1 &&
    actions17i2.rect.y >= stage17i2.y + 4 - 1 &&
    actions17i2.rect.x + actions17i2.rect.width <= stage17i2.x + stage17i2.width - 4 + 1 &&
    actions17i2.rect.y + actions17i2.rect.height <= stage17i2.y + stage17i2.height - 4 + 1;
  const rightVarRestored17i2 = await layoutVar("--pix-right-width", null);
  const restoredRightWidth17i2 = await js(`Math.round(document.querySelector(".layout-right").getBoundingClientRect().width)`);
  record(
    "r17-template-geometry",
    {
      phase: "four-buttons-narrow",
      stage: stage17i2,
      float: actions17i2.rect,
      buttons: actions17i2.buttons,
      scrollOverflow: actions17i2.scrollOverflow,
      insideStage: insideStage17i2,
      ready: ready17i2.ok,
      rightVar: rightVarNarrow17i2,
      restoredRightWidth: restoredRightWidth17i2,
      restoredVar: rightVarRestored17i2,
      intersect: {
        composer: intersects(actions17i2.rect, composer17i2),
        section: intersects(actions17i2.rect, section17i2),
        indicator: intersects(actions17i2.rect, indicator17i2),
      },
    },
    [
      ...(ready17i2.ok ? [] : [`前置失败（窄栏相位）：${JSON.stringify(ready17i2.trail)}`]),
      ...(rightVarNarrow17i2 === RIGHT_WIDTH ? [] : [`CSS 变量未写入：${JSON.stringify(rightVarNarrow17i2)}`]),
      ...(!!actions17i2.rect && !!stage17i2 && !!composer17i2 && !!section17i2 && !!indicator17i2 ? [] : ["rect 缺失（几何断言前置）"]),
      ...(insideStage17i2 ? [] : [`窄栏下浮层应仍钳制在 .reader-stage 内：${JSON.stringify({ float: actions17i2.rect, stage: stage17i2 })}`]),
      ...(actions17i2.scrollOverflow !== null && actions17i2.scrollOverflow <= 1 ? [] : [`窄栏下浮层横向不得溢出：${actions17i2.scrollOverflow}`]),
      ...(actions17i2.buttons.length === 4 &&
      actions17i2.buttons.every((btn, index, list) => btn.rect.width > 0 && (index === 0 || btn.rect.x > list[index - 1].rect.x)) &&
      Math.max(...actions17i2.buttons.map((btn) => btn.rect.y)) - Math.min(...actions17i2.buttons.map((btn) => btn.rect.y)) <= 1 &&
      actions17i2.buttons.every((btn, index, list) => list.every((other, otherIndex) => otherIndex <= index || !intersects(btn.rect, other.rect)))
        ? []
        : [`窄栏下 4 按钮应单行递增且两两不相交：${JSON.stringify(actions17i2.buttons)}`]),
      ...(JSON.stringify(actions17i2.buttons.map((btn) => btn.text)) === JSON.stringify(QUICK_ASK_ACTIONS) ? [] : [`动作文案异常：${JSON.stringify(actions17i2.buttons.map((btn) => btn.text))}`]),
      ...(!intersects(actions17i2.rect, composer17i2) && !intersects(actions17i2.rect, section17i2) && !intersects(actions17i2.rect, indicator17i2)
        ? []
        : [`窄栏下浮层与既有控件相交：${JSON.stringify({ composer: intersects(actions17i2.rect, composer17i2), section: intersects(actions17i2.rect, section17i2), indicator: intersects(actions17i2.rect, indicator17i2) })}`]),
      ...(Math.abs(restoredRightWidth17i2 - 380) <= 2 ? [] : [`右栏宽度未复位：${restoredRightWidth17i2}`]),
      ...(rightVarRestored17i2 === "" ? [] : [`CSS 变量未清除：${JSON.stringify(rightVarRestored17i2)}`]),
    ],
  );

  log("r17-2b 4 按钮几何：窄栏 + 200% 缩放（右缘钳制生效）");
  await layoutVar("--pix-right-width", RIGHT_WIDTH);
  for (let index = 0; index < 10; index += 1) await clickEl(SEL.zoomInBtn);
  await waitFor("缩放 200%", `document.querySelector(".zoom-label").textContent.replace(/\\s+/g, " ").trim() === "200%"`);
  await js(`document.querySelector(${JSON.stringify(SEL.pdfScroll)}).scrollLeft = 0, true`);
  await sleep(400);
  await selectPageSpan(1);
  const ready17i3 = await ensureQuickAskExcerptReady(1);
  const actions17i3 = await quickAskActionsProbe();
  const stage17i3 = await rectOfSelector(".reader-stage", 0);
  const zoom17i3 = await zoomLabel();
  const clampGap17i3 = actions17i3.rect && stage17i3 ? Math.round((stage17i3.x + stage17i3.width - 4 - (actions17i3.rect.x + actions17i3.rect.width)) * 10) / 10 : null;
  const insideStage17i3 =
    !!actions17i3.rect &&
    !!stage17i3 &&
    actions17i3.rect.x >= stage17i3.x + 4 - 1 &&
    actions17i3.rect.y >= stage17i3.y + 4 - 1 &&
    actions17i3.rect.x + actions17i3.rect.width <= stage17i3.x + stage17i3.width - 4 + 1 &&
    actions17i3.rect.y + actions17i3.rect.height <= stage17i3.y + stage17i3.height - 4 + 1;
  await capturePage(win, "r17-2d-quick-ask-four-buttons-zoom.png", await rectOfSelector(SEL.pdfViewer, 0));
  for (let index = 0; index < 10; index += 1) await clickEl('.pdf-toolbar button[title="缩小"]');
  await waitFor("缩放回 100%", `document.querySelector(".zoom-label").textContent.replace(/\\s+/g, " ").trim() === "100%"`);
  await layoutVar("--pix-right-width", null);
  const restoredRightWidth17i3 = await js(`Math.round(document.querySelector(".layout-right").getBoundingClientRect().width)`);
  record(
    "r17-template-geometry",
    {
      phase: "four-buttons-zoom-clamp",
      zoom: zoom17i3,
      stage: stage17i3,
      stageRight: stage17i3 ? stage17i3.x + stage17i3.width : null,
      float: actions17i3.rect,
      floatRight: actions17i3.rect ? actions17i3.rect.x + actions17i3.rect.width : null,
      clampGap: clampGap17i3,
      buttons: actions17i3.buttons,
      scrollOverflow: actions17i3.scrollOverflow,
      insideStage: insideStage17i3,
      ready: ready17i3.ok,
      restored: { zoom: await zoomLabel(), rightWidth: restoredRightWidth17i3 },
    },
    [
      ...(ready17i3.ok ? [] : [`前置失败（缩放相位）：${JSON.stringify(ready17i3.trail)}`]),
      ...(zoom17i3 === "200%" ? [] : [`缩放未到 200%：${zoom17i3}`]),
      ...(clampGap17i3 !== null && Math.abs(clampGap17i3) <= 1.5 ? [] : [`右缘钳制未生效（float.right 应等于 stage.right - 4）：${JSON.stringify({ clampGap: clampGap17i3, float: actions17i3.rect, stage: stage17i3 })}`]),
      ...(insideStage17i3 ? [] : [`200% 下浮层应仍钳制在 .reader-stage 内：${JSON.stringify({ float: actions17i3.rect, stage: stage17i3 })}`]),
      ...(actions17i3.scrollOverflow !== null && actions17i3.scrollOverflow <= 1 ? [] : [`200% 下浮层横向不得溢出：${actions17i3.scrollOverflow}`]),
      ...(actions17i3.buttons.length === 4 &&
      actions17i3.buttons.every((btn, index, list) => btn.rect.width > 0 && (index === 0 || btn.rect.x > list[index - 1].rect.x)) &&
      Math.max(...actions17i3.buttons.map((btn) => btn.rect.y)) - Math.min(...actions17i3.buttons.map((btn) => btn.rect.y)) <= 1 &&
      actions17i3.buttons.every((btn, index, list) => list.every((other, otherIndex) => otherIndex <= index || !intersects(btn.rect, other.rect)))
        ? []
        : [`200% 下 4 按钮应单行递增且两两不相交：${JSON.stringify(actions17i3.buttons)}`]),
      ...((await zoomLabel()) === "100%" && Math.abs(restoredRightWidth17i3 - 380) <= 2
        ? []
        : [`收尾复位异常：${JSON.stringify({ zoom: await zoomLabel(), rightWidth: restoredRightWidth17i3 })}`]),
    ],
  );
  // --- r17-3 选区快照（N97-4 追加）：点击模板动作 → 真实键入 ⇒ chip / 草稿 / 载荷仍带选区 -------
  // 判别性：本场景的两条来源必须同时被验证 —— 相位 snapshot-survives-typing 构造「store 已空、
  //   chip 仍在」（快照来源），相位 new-selection 构造「store 非空且与快照不同、chip 换成新文本」
  //   （新选区优先）；两者合起来排除「chip 只看 store」与「chip 只看快照」两种错实现。
  // 键入通道：typeIntoComposer 走真实输入通道（sendInputEvent char），非程序化 setter。
  log("r17-3 选区快照：点「解释」→ 真实键入 ⇒ 选中文本 chip 与载荷不丢");
  const TYPED17J = "（追问）它在第二节的作用是什么？";
  await enterCleanWorkspace(seedNotes());
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  // 选区步护栏（N97-4 收口 mustFix ②）：迟到的阅读区滚动会按既有语义隐藏浮层 ⇒ selectPageSpan
  // 内部的「摘录浮层」等待可能超时抛错。先用既有 waitStageScrollQuiet() 做有界静默等待，把环境性
  // 滚动吸收掉；判据与断言零改动，护栏读数落进 data.scrollGuard。
  const scrollGuard17j1 = await waitStageScrollQuiet();
  await selectPageSpan(1);
  const ready17j = await ensureQuickAskExcerptReady(1);
  await clearSendCalls();
  const selectionBefore17j = await selectionProbe();
  const spanText17j = await pageSpanText(1);
  const selectionText17j = await js("document.getSelection().toString().trim()");
  const chipsBefore17j = await chipSnapshot();
  const labelBefore17j = (chipsBefore17j.labels || []).find((label) => String(label).startsWith("选中文本：")) ?? null;
  const blocksBefore17j = await userBlocks();
  // 真实键入证据：监听 .input-area 的 input 事件（isTrusted + inputType），证明字符经真实输入管线到达
  await js(`(() => {
    const input = document.querySelector(${JSON.stringify(SEL.composerInput)});
    if (!input) throw new Error("composer input not found");
    window.__pixTypingLog17j = [];
    input.addEventListener("input", (event) => {
      window.__pixTypingLog17j.push({ trusted: event.isTrusted, inputType: event.inputType, data: event.data });
    });
    return true;
  })()`);
  await js(`(() => {
    const target = Array.from(document.querySelectorAll(".quick-ask-btn")).find((btn) => (btn.textContent || "").includes("解释"));
    if (!target) throw new Error("解释按钮不存在");
    target.click();
    return true;
  })()`);
  await waitFor(
    "点「解释」后浮层隐藏",
    `(() => { const el = document.querySelector(${JSON.stringify(SEL.quickAsk)}); return !!el && getComputedStyle(el).display === "none"; })()`,
  );
  const quickAskAfter17j = await quickAskStateProbe();
  const composerAfterClick17j = await composerSnapshot();
  const typedValue17j = await typeIntoComposer(TYPED17J);
  const typingLog17j = await js("window.__pixTypingLog17j");
  const composerAfterTyping17j = await composerSnapshot();
  const chipsAfterTyping17j = await chipSnapshot();
  const labelAfterTyping17j = (chipsAfterTyping17j.labels || []).find((label) => String(label).startsWith("选中文本：")) ?? null;
  const selectionAfterTyping17j = await selectionProbe();
  const blocksAfterTyping17j = await userBlocks();
  const sendDelta17j = (await sendCalls()).count;
  // 裁切容器（N97-4 收口 mustFix ①）：`.composer` 是 `.context-row`（chip 行）与 `.composer-box`
  // 的共同父容器（ChatPanel.vue:1122 / :1134 / :1155）⇒ chip 行 + 草稿同框；`.composer-box` 自身
  // 不含 chip 行（`.context-row` 是其前一个兄弟）。
  await capturePage(win, "r17-3-snapshot-survives-typing.png", await rectOfSelector(".composer", 0));
  record(
    "r17-selection-snapshot",
    {
      phase: "snapshot-survives-typing",
      ready: ready17j.ok,
      scrollGuard: scrollGuard17j1,
      selectionText: selectionText17j,
      selectionBefore: selectionBefore17j,
      spanText: spanText17j,
      chipsBefore: chipsBefore17j,
      quickAskAfterExplain: quickAskAfter17j,
      composerAfterClick: composerAfterClick17j,
      typed: { text: TYPED17J, value: typedValue17j, log: typingLog17j },
      composerAfterTyping: composerAfterTyping17j,
      chipsAfterTyping: chipsAfterTyping17j,
      selectionAfterTyping: selectionAfterTyping17j,
      quiet: { send: sendDelta17j, blocks: { before: blocksBefore17j, after: blocksAfterTyping17j } },
    },
    [
      ...(ready17j.ok ? [] : [`前置失败：浮层未就绪 ${JSON.stringify(ready17j.trail)}`]),
      ...(selectionBefore17j.collapsed === false && selectionBefore17j.anchorInStage === true && selectionBefore17j.text === spanText17j
        ? []
        : [`点击时选区应完好：${JSON.stringify({ selectionBefore: selectionBefore17j, spanText: spanText17j })}`]),
      ...(quickAskAfter17j.display === "none" ? [] : [`点击后浮层应沿用既有 hide() 形态（display: none）：${JSON.stringify(quickAskAfter17j)}`]),
      ...(composerAfterClick17j.activeHasInputArea === true ? [] : ["键入前焦点应在 composer 内（真实键入路径的必要条件）"]),
      ...(labelAfterTyping17j !== null ? [] : [`键入后「选中文本」chip 应仍在：${JSON.stringify(chipsAfterTyping17j)}`]),
      ...(labelAfterTyping17j !== null && labelAfterTyping17j === labelBefore17j
        ? []
        : [`chip 文本应逐字等于点击时刻：${JSON.stringify({ before: labelBefore17j, after: labelAfterTyping17j })}`]),
      ...(composerAfterTyping17j.value === EXPLAIN_TEMPLATE + TYPED17J &&
      typedValue17j === EXPLAIN_TEMPLATE + TYPED17J &&
      typingLog17j.length === TYPED17J.length &&
      typingLog17j.every((entry) => entry.trusted === true && entry.inputType === "insertText" && typeof entry.data === "string")
        ? []
        : [`草稿应逐字等于解释模板 + 键入内容，且键入须走真实输入通道：${JSON.stringify({ value: composerAfterTyping17j.value, typedValue: typedValue17j, log: typingLog17j })}`]),
      ...(sendDelta17j === 0 && blocksAfterTyping17j === blocksBefore17j
        ? []
        : [`模板动作与键入都不得发送：${JSON.stringify({ send: sendDelta17j, before: blocksBefore17j, after: blocksAfterTyping17j })}`]),
      ...(selectionAfterTyping17j.collapsed === true && selectionAfterTyping17j.anchorInStage === false
        ? []
        : [`非真空证据：键入后 document 选区应已被收进输入框：${JSON.stringify(selectionAfterTyping17j)}`]),
    ],
  );

  log("r17-3 载荷：发送后 <reading_context> 含点击时刻的 selectedText");
  await clearSendCalls();
  await js(`document.querySelector(".composer-send").click(), true`);
  await waitSendCalls(1);
  const payload17j = await lastSend();
  const lines17j = String(payload17j.message).split("\n");
  const selectedIndex17j = lines17j.indexOf("selectedText:");
  const sendCount17j = (await sendCalls()).count;
  const draft17j = EXPLAIN_TEMPLATE + TYPED17J;
  const skeleton17j = {
    head: lines17j[0] === "<reading_context>",
    path: lines17j.some((line) => line.startsWith("path: ") && line.endsWith("sample-paper.pdf")),
    pages: lines17j.includes("page: 1") && lines17j.includes("pageCount: 3"),
    tail: selectedIndex17j >= 0 && lines17j.indexOf("</reading_context>") === selectedIndex17j + 2,
  };
  record(
    "r17-selection-snapshot",
    {
      phase: "send-payload",
      sendCount: sendCount17j,
      displayText: payload17j.displayText,
      selectedIndex: selectedIndex17j,
      selectedTextLine: selectedIndex17j >= 0 ? lines17j[selectedIndex17j + 1] : null,
      expectedSelectionText: selectionText17j,
      skeleton: skeleton17j,
      lines: lines17j,
      tailMatches: String(payload17j.message).endsWith("\n\n" + draft17j),
    },
    [
      ...(sendCount17j === 1 ? [] : [`发送次数应为 1：${sendCount17j}`]),
      ...(payload17j.displayText === draft17j ? [] : [`气泡文案应逐字等于键入后的草稿：${JSON.stringify(payload17j.displayText)}`]),
      ...(selectedIndex17j >= 0 ? [] : [`载荷应含 selectedText: 行：${JSON.stringify(lines17j)}`]),
      ...(selectedIndex17j >= 0 && lines17j[selectedIndex17j + 1] === selectionText17j
        ? []
        : [`selectedText: 的下一行应逐字等于点击时刻的选区文本：${JSON.stringify({ expected: selectionText17j, actual: selectedIndex17j >= 0 ? lines17j[selectedIndex17j + 1] : null })}`]),
      ...(skeleton17j.head && skeleton17j.path && skeleton17j.pages && skeleton17j.tail
        ? []
        : [`载荷骨架行缺失或顺序异常：${JSON.stringify({ skeleton: skeleton17j, lines: lines17j })}`]),
      ...(String(payload17j.message).endsWith("\n\n" + draft17j) ? [] : ["载荷尾部应为空行 + 草稿逐字"]),
    ],
  );

  log("r17-3 新选区：chip 立即改为新选区文本（旧快照失效）");
  await clickNext();
  await waitPage(2, 3);
  const scrollGuard17j2 = await waitStageScrollQuiet();
  await selectPageSpan(2);
  const ready17j2 = await ensureQuickAskExcerptReady(2);
  const spanText17j2 = await pageSpanText(2);
  const chips17j2 = await chipSnapshot();
  const label17j2 = (chips17j2.labels || []).find((label) => String(label).startsWith("选中文本：")) ?? null;
  const expectedLabel17j2 =
    !!spanText17j2 && spanText17j2.length > 24 ? `选中文本：${spanText17j2.slice(0, 24)}…` : `选中文本：${spanText17j2}`;
  record(
    "r17-selection-snapshot",
    {
      phase: "new-selection",
      ready: ready17j2.ok,
      scrollGuard: scrollGuard17j2,
      spanText: spanText17j2,
      expectedLabel: expectedLabel17j2,
      label: label17j2,
      previousLabel: labelBefore17j,
      labels: chips17j2.labels,
    },
    [
      ...(ready17j2.ok && !!spanText17j2 && spanText17j2 !== selectionText17j ? [] : [`前置失败：新选区应就绪且与旧选区不同 ${JSON.stringify({ ready: ready17j2.ok, spanText: spanText17j2, previous: selectionText17j })}`]),
      ...(label17j2 !== null && label17j2 === expectedLabel17j2 ? [] : [`新选区应覆盖旧快照：${JSON.stringify({ expected: expectedLabel17j2, actual: label17j2 })}`]),
      ...(label17j2 !== null && label17j2 !== labelBefore17j ? [] : [`chip 不得仍显示旧快照文本：${JSON.stringify({ previous: labelBefore17j, actual: label17j2 })}`]),
    ],
  );

  log("r17-3 移除 chip：不复活（既有 resetExcludedContexts 触发后仍无「选中文本」项）");
  const scrollGuard17j3 = await waitStageScrollQuiet();
  await selectPageSpan(2);
  const ready17j3 = await ensureQuickAskExcerptReady(2);
  await js(`(() => {
    const target = Array.from(document.querySelectorAll(".quick-ask-btn")).find((btn) => (btn.textContent || "").includes("问 AI"));
    if (!target) throw new Error("问 AI 按钮不存在");
    target.click();
    return true;
  })()`);
  await waitFor(
    "点「问 AI」后浮层隐藏",
    `(() => { const el = document.querySelector(${JSON.stringify(SEL.quickAsk)}); return !!el && getComputedStyle(el).display === "none"; })()`,
  );
  const selectionAfterAsk17j = await selectionProbe();
  const chipsBeforeRemove17j = await chipSnapshot();
  const labelBeforeRemove17j = (chipsBeforeRemove17j.labels || []).find((label) => String(label).startsWith("选中文本：")) ?? null;
  const blocksBeforeReset17j = await userBlocks();
  const composerBeforeRemove17j = await composerSnapshot();
  await js(`(() => {
    const chip = Array.from(document.querySelectorAll(${JSON.stringify(SEL.contextChip)})).find((el) => {
      const label = el.querySelector(".context-chip-label");
      return !!label && label.textContent.replace(/\\s+/g, " ").trim().indexOf("选中文本：") === 0;
    });
    if (!chip) throw new Error("选中文本 chip 不存在");
    const remove = chip.querySelector(${JSON.stringify(SEL.contextChipRemove)});
    if (!remove) throw new Error("chip 移除按钮不存在");
    remove.click();
    return true;
  })()`);
  const chipsAfterRemove17j = await chipSnapshot();
  const labelAfterRemove17j = (chipsAfterRemove17j.labels || []).find((label) => String(label).startsWith("选中文本：")) ?? null;
  const composerAfterRemove17j = await composerSnapshot();
  // 触发既有 resetExcludedContexts()：走真实发送路径（send() 的 finally 调用该函数；同函数的另一触发点
  // —— displayBlocks → 0 —— 在本夹具不可达：stub 的 setMessages([]) 只改 stub 侧，不动渲染层 store）。
  await waitFor("移除 chip 后发送按钮可点", `(() => { const b = document.querySelector(".composer-send"); return !!b && !b.disabled; })()`);
  await clearSendCalls();
  await js(`document.querySelector(".composer-send").click(), true`);
  await waitSendCalls(1);
  await sleep(200);
  const sendAfterRemove17j = (await sendCalls()).count;
  const chipsAfterReset17j = await chipSnapshot();
  const labelAfterReset17j = (chipsAfterReset17j.labels || []).find((label) => String(label).startsWith("选中文本：")) ?? null;
  const composerAfterReset17j = await composerSnapshot();
  record(
    "r17-selection-snapshot",
    {
      phase: "chip-removed",
      ready: ready17j3.ok,
      scrollGuard: scrollGuard17j3,
      labelBeforeRemove: labelBeforeRemove17j,
      selectionAfterAsk: selectionAfterAsk17j,
      chipsAfterRemove: chipsAfterRemove17j,
      chipsAfterReset: chipsAfterReset17j,
      blocksBeforeReset: blocksBeforeReset17j,
      sendAfterRemove: sendAfterRemove17j,
      composer: { before: composerBeforeRemove17j.value, afterRemove: composerAfterRemove17j.value, afterReset: composerAfterReset17j.value },
    },
    [
      ...(ready17j3.ok && labelBeforeRemove17j !== null && selectionAfterAsk17j.collapsed === true
        ? []
        : [`移除前前置失败：chip 应由快照支撑且选区已收进输入框 ${JSON.stringify({ ready: ready17j3.ok, label: labelBeforeRemove17j, selection: selectionAfterAsk17j })}`]),
      ...(labelAfterRemove17j === null && chipsAfterRemove17j.count === chipsBeforeRemove17j.count - 1
        ? []
        : [`移除后「选中文本」项应消失：${JSON.stringify({ before: chipsBeforeRemove17j, after: chipsAfterRemove17j })}`]),
      ...(blocksBeforeReset17j > 0 && sendAfterRemove17j === 1 && labelAfterReset17j === null
        ? []
        : [`既有 resetExcludedContexts() 触发后不得复活：${JSON.stringify({ blocks: blocksBeforeReset17j, send: sendAfterRemove17j, labels: chipsAfterReset17j.labels })}`]),
      ...(composerBeforeRemove17j.value === composerAfterRemove17j.value
        ? []
        : [`移除 chip 不得改 composer 草稿：${JSON.stringify({ before: composerBeforeRemove17j.value, afterRemove: composerAfterRemove17j.value })}`]),
    ],
  );

  log("r17-3 切文档：快照清空（chip 消失）");
  await focusPage(1);
  let switchProbe17j4 = null;
  // 重取护栏（既有有界重取范式）：迟到滚动会按既有语义隐藏浮层并清空 cachedText，此时点击不再发射；
  // 生效信号 = 点击后 document 选区被收进 composer（焦点转移）；未生效则重建选区后重试（≤3 次）。
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const scrollGuardAttempt = await waitStageScrollQuiet();
    await selectPageSpan(1);
    const readyAttempt = await ensureQuickAskExcerptReady(1);
    const quickAskBeforeClick = await quickAskStateProbe();
    const chipsBeforeClick = await chipSnapshot();
    const labelBeforeClick = (chipsBeforeClick.labels || []).find((item) => String(item).startsWith("选中文本：")) ?? null;
    await js(`(() => {
      const target = Array.from(document.querySelectorAll(".quick-ask-btn")).find((btn) => (btn.textContent || "").includes("解释"));
      if (!target) throw new Error("解释按钮不存在");
      target.click();
      return true;
    })()`);
    await waitFor(
      "切文档前点「解释」后浮层隐藏",
      `(() => { const el = document.querySelector(${JSON.stringify(SEL.quickAsk)}); return !!el && getComputedStyle(el).display === "none"; })()`,
    );
    await sleep(150);
    const selectionAfterClick = await selectionProbe();
    const chipsAfterClick = await chipSnapshot();
    const labelAfterClick = (chipsAfterClick.labels || []).find((item) => String(item).startsWith("选中文本：")) ?? null;
    switchProbe17j4 = { attempts: attempt, ready: readyAttempt.ok, scrollGuard: scrollGuardAttempt, quickAskBeforeClick, labelBeforeClick, selectionAfterClick, labelAfterClick, chipsAfterClick };
    if (selectionAfterClick.collapsed === true) break;
  }
  await clearSendCalls();
  await openRow("long-book.pdf");
  await waitPdfLoaded();
  await waitFor("long-book 页盒 60 页", `document.querySelectorAll(".pdf-page").length === 60`);
  const chipsAfterSwitch17j = await chipSnapshot();
  const labelAfterSwitch17j = (chipsAfterSwitch17j.labels || []).find((label) => String(label).startsWith("选中文本：")) ?? null;
  const sendDeltaSwitch17j = (await sendCalls()).count;
  record(
    "r17-selection-snapshot",
    {
      phase: "doc-switch",
      ready: switchProbe17j4 ? switchProbe17j4.ready : false,
      scrollGuard: switchProbe17j4 ? switchProbe17j4.scrollGuard : null,
      attempts: switchProbe17j4 ? switchProbe17j4.attempts : 0,
      quickAskBeforeClick: switchProbe17j4 ? switchProbe17j4.quickAskBeforeClick : null,
      labelBeforeClick: switchProbe17j4 ? switchProbe17j4.labelBeforeClick : null,
      labelBeforeSwitch: switchProbe17j4 ? switchProbe17j4.labelAfterClick : null,
      selectionBeforeSwitch: switchProbe17j4 ? switchProbe17j4.selectionAfterClick : null,
      chipsBeforeSwitch: switchProbe17j4 ? switchProbe17j4.chipsAfterClick : null,
      chipsAfterSwitch: chipsAfterSwitch17j,
      sendDelta: sendDeltaSwitch17j,
    },
    [
      ...(switchProbe17j4 !== null &&
      switchProbe17j4.ready === true &&
      switchProbe17j4.labelBeforeClick !== null &&
      switchProbe17j4.labelAfterClick !== null &&
      switchProbe17j4.selectionAfterClick.collapsed === true
        ? []
        : [`切换前前置失败：chip 应由快照支撑 ${JSON.stringify(switchProbe17j4)}`]),
      ...(labelAfterSwitch17j === null ? [] : [`切换文档后不得保留旧选区 chip：${JSON.stringify({ label: labelAfterSwitch17j, labels: chipsAfterSwitch17j.labels })}`]),
      ...(sendDeltaSwitch17j === 0 ? [] : [`切文档不得发送：${sendDeltaSwitch17j}`]),
    ],
  );
  await restoreStandardSeed();

  // =========================================================================
  // R18：对话锚定（N100–N103）——入口 / 标注 / 隔离（r18-1 … r18-5）
  //
  // 会话夹具 SESSIONS_A 两条（第一条与 SESSION_STATE.sessionFile 同路径同 id）；
  // 时间夹具 PAST_AT（26 小时前 ⇒ formatSessionTime 恒「昨天」）与 SEED_AT（落点写盘防空基线）。
  // 入口与标记都只读现场文件 × 会话列表：列表变化只经既有切换链路刷新（不新增刷新入口）；
  // 「已活动会话的点击是 no-op」⇒ 需要真刷新列表的相位一律点非活动行。
  // 每个场景以自己的 restoreStandardSeed() + setSendFailure(null) + setSessions([]) 收尾。
  // =========================================================================

  const SESSIONS_A = [
    {
      path: join(LIBRARY_DIR, ".pix-read", "session-demo.jsonl"),
      id: "sess-demo",
      cwd: LIBRARY_DIR,
      name: "摘录与笔记走查",
      created: new Date(Date.now() - 60 * MINUTE).toISOString(),
      modified: new Date(Date.now() - 30 * MINUTE).toISOString(),
      messageCount: 4,
      firstMessage: "",
    },
    {
      path: join(LIBRARY_DIR, ".pix-read", "session-older.jsonl"),
      id: "sess-older",
      cwd: LIBRARY_DIR,
      name: "消融实验对照",
      created: new Date(Date.now() - 3 * HOUR).toISOString(),
      modified: new Date(Date.now() - 2 * HOUR).toISOString(),
      messageCount: 2,
      firstMessage: "",
    },
  ];
  const SESSIONS_GHOST = SESSIONS_A.concat([
    {
      path: join(LIBRARY_DIR, ".pix-read", "session-gone.jsonl"),
      id: "sess-gone",
      cwd: LIBRARY_DIR,
      name: "丢失后恢复的会话",
      created: new Date(Date.now() - 50 * HOUR).toISOString(),
      modified: new Date(Date.now() - 49 * HOUR).toISOString(),
      messageCount: 1,
      firstMessage: "",
    },
  ]);
  const PAST_AT = Date.now() - 26 * HOUR;
  const SEED_AT = Date.now() - MINUTE;
  const SESSION_B_PATH = join(LIBRARY_DIR, ".pix-read", "session-b.jsonl");
  const SESSION_GONE_PATH = join(LIBRARY_DIR, ".pix-read", "session-gone.jsonl");

  /** r18 场景统一前置：复位注入 → 回首页 → 清 A 现场 → 写现场夹具 → 进工作区 → 等树行 → 注入笔记种子。 */
  const enterWorkspaceWithState = async (state, rows = 4) => {
    await js("window.__pixStub.setMessages([]), true");
    await setSendFailure(null);
    await js("window.__pixStub.setNotesAddFailure(null), true");
    await setNotesDeleteFailure(null);
    await goHome();
    await clearStateA();
    writeState(STATE_FILE_A, state);
    await enterWorkspace(LIBRARY_NAME);
    await waitTreeRows(rows);
    await js(`window.__pixStub.seedNotes(${JSON.stringify(seedNotes())}), true`);
  };

  // 会话菜单的在场判定：VOverlay 用 v-show 关闭（内容 DOM 首次打开后常驻），
  // 所以「列表不在场」不能判存在性，必须判可见性（getClientRects 为空 = display:none）。
  const menuOpenExpr = `(() => {
    const list = document.querySelector(".v-overlay-container .v-list");
    return !!list && list.getClientRects().length > 0;
  })()`;

  /** 打开会话菜单：点 pill 并等列表可见。 */
  const openSessionMenu = async () => {
    await js(`document.querySelector(".pill-session").click(), true`);
    await waitFor("会话菜单打开", menuOpenExpr);
  };

  /** 关闭会话菜单：列表不可见 ⇒ 立即返回（幂等）；否则派发 Esc 并等不可见。 */
  const closeSessionMenu = async () => {
    if (!(await js(menuOpenExpr))) return;
    await js(`document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })), true`);
    await waitFor("会话菜单关闭", `!(${menuOpenExpr})`);
  };

  /** 菜单逐行探针：标题 / 副标题 / 活动 / 标记 / 标记 tooltip / 删除按钮。 */
  const sessionMenuProbe = () => js(`(() => {
    const rows = Array.from(document.querySelectorAll(".v-overlay-container .v-list .v-list-item")).filter((el) => el.getClientRects().length > 0);
    const t = (el, selector) => { const node = el.querySelector(selector); return node ? node.textContent.replace(/\\s+/g, " ").trim() : null; };
    return {
      open: ${menuOpenExpr},
      items: rows.map((el) => {
        const mark = el.querySelector(${JSON.stringify(SEL.sessionDocMark)});
        return {
          title: t(el, ".v-list-item-title"),
          subtitle: t(el, ".v-list-item-subtitle"),
          active: el.classList.contains("v-list-item--active"),
          marked: !!mark,
          markTitle: mark ? mark.getAttribute("title") : null,
          hasDeleteBtn: !!el.querySelector(".session-delete-btn"),
          appendCount: el.querySelectorAll(".v-list-item__append").length,
          appendWidth: (() => { const node = el.querySelector(".v-list-item__append"); return node ? Math.round(node.getBoundingClientRect().width) : null; })(),
        };
      }),
    };
  })()`);

  /** 菜单行定位：标题逐字相等（空白归一化后）。 */
  const menuItem = (probe, title) => probe.items.find((item) => item.title === title) ?? null;

  /** 按标题文本点会话行（对已是活动会话的行是幂等 no-op；点击后等菜单消失，两条路径都能过）。 */
  const clickSessionItem = async (title) => {
    await js(`(() => {
      const rows = Array.from(document.querySelectorAll(".v-overlay-container .v-list .v-list-item"));
      const row = rows.find((el) => { const node = el.querySelector(".v-list-item-title"); return !!node && node.textContent.replace(/\\s+/g, " ").trim() === ${JSON.stringify(title)}; });
      if (!row) throw new Error("session item not found: " + ${JSON.stringify(title)});
      row.click();
      return true;
    })()`);
    await closeSessionMenu();
  };

  /** 等入口文本前缀命中（时间后缀不逐字钉；确定档位下用全串调用即等价逐字相等）。 */
  const waitDiscussText = (prefix) =>
    waitFor(`讨论入口文本前缀「${prefix}」`, `(() => {
      const el = document.querySelector(${JSON.stringify(SEL.readerDiscuss)});
      if (!el) return false;
      return el.textContent.replace(/\\s+/g, " ").trim().indexOf(${JSON.stringify(prefix)}) === 0;
    })()`);

  /** 时间档位的运行时允许集：`刚刚` ∪ {N 分钟}（N ∈ {floor(Δ/60000), +1}）。 */
  const discussTimeAllowSet = (lastSessionAt, now = Date.now()) => {
    const minutes = Math.floor(Math.max(0, now - lastSessionAt) / 60000);
    return new Set(["刚刚", `${minutes} 分钟`, `${minutes + 1} 分钟`]);
  };

  const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);
  const entryTextOf = () => textOf(SEL.readerDiscuss);
  const entryTitleOf = () => js(`(() => { const el = document.querySelector(${JSON.stringify(SEL.readerDiscuss)}); return el ? el.getAttribute("title") : null; })()`);
  const deleteTitleOf = () => js(`(() => { const el = document.querySelector(".v-overlay-container .session-delete-btn"); return el ? el.getAttribute("title") : null; })()`);
  const switchCallsNow = () => js("window.__pixStub.switchSessionCalls()");
  const waitPillSession = (title) =>
    waitFor(`会话 pill 显示「${title}」`, `(() => { const el = document.querySelector(".pill-session .pill-label"); return !!el && el.textContent.replace(/\\s+/g, " ").trim() === ${JSON.stringify(title)}; })()`);

  // --- r18-1 入口：发送记录 / 入口出现与点击 / 发送失败不改写（组 r18-discuss-entry）---
  log("r18-1 发送成功记录讨论会话；活动会话 = 记录会话 ⇒ 入口隐藏");
  await js(`window.__pixStub.setSessions(${JSON.stringify(SESSIONS_A)}), true`);
  await enterWorkspaceWithState({
    version: 1,
    lastDocPath: "sample-paper.pdf",
    documents: {
      "sample-paper.pdf": { page: 1, scale: 1, updatedAt: SEED_AT },
      "archive/older-paper.pdf": { page: 1, scale: 1, updatedAt: 1758000001000, lastSessionPath: SESSION_B_PATH, lastSessionAt: 1758000001000 },
    },
  });
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await openSessionMenu();
  await clickSessionItem("摘录与笔记走查");
  await closeSessionMenu();
  const warnBase18a = warnCount();
  const entryBefore18a = readState(STATE_FILE_A).documents["sample-paper.pdf"];
  await clearSendCalls();
  await typeAndSend("R18：这篇的消融结论怎么复现？");
  await waitSendCalls(1);
  await waitState(STATE_FILE_A, (state) => state.documents["sample-paper.pdf"] && state.documents["sample-paper.pdf"].lastSessionPath, "发送后目标条目带讨论记录");
  const entryAfter18a = readState(STATE_FILE_A).documents["sample-paper.pdf"];
  const otherAfter18a = readState(STATE_FILE_A).documents["archive/older-paper.pdf"];
  const payload18a = await lastPayload();
  const entryCount18a = await countOf(SEL.readerDiscuss);
  await capturePage(win, "r18-1-send-records.png");
  record(
    "r18-discuss-entry",
    {
      phase: "send-records",
      file: entryAfter18a,
      payload: payload18a,
      page: entryAfter18a.page,
      scaleBefore: entryBefore18a.scale,
      scaleAfter: entryAfter18a.scale,
      otherEntry: otherAfter18a,
      entryCount: entryCount18a,
      warnDelta: warnCount() - warnBase18a,
      pairKeyBefore: hasOwn(entryBefore18a, "lastSessionPath"),
    },
    [
      ...(hasOwn(entryBefore18a, "lastSessionPath") === false ? [] : ["前置失败：夹具条目本不应带讨论记录"]),
      ...(entryAfter18a.lastSessionPath === SESSIONS_A[0].path ? [] : [`记录会话路径不符：${JSON.stringify(entryAfter18a.lastSessionPath)}`]),
      ...(typeof entryAfter18a.lastSessionAt === "number" && Number.isFinite(entryAfter18a.lastSessionAt) && Date.now() - entryAfter18a.lastSessionAt < 60000
        ? []
        : [`记录时刻不符：${JSON.stringify(entryAfter18a.lastSessionAt)}`]),
      ...(entryAfter18a.page === 1 && entryAfter18a.scale === 1 ? [] : [`发送不得改变既有字段：${JSON.stringify({ page: entryAfter18a.page, scale: entryAfter18a.scale })}`]),
      ...(otherAfter18a.lastSessionPath === SESSION_B_PATH && otherAfter18a.lastSessionAt === 1758000001000 ? [] : [`其它条目被波及：${JSON.stringify(otherAfter18a)}`]),
      ...(payload18a && payload18a.lastSessionPath === SESSIONS_A[0].path && payload18a.lastSessionAt === entryAfter18a.lastSessionAt ? [] : [`末条 payload 未携带两键：${JSON.stringify(payload18a)}`]),
      ...(entryCount18a === 0 ? [] : [`活动会话 = 记录会话 ⇒ 入口应隐藏：${entryCount18a}`]),
      ...(warnCount() - warnBase18a === 0 ? [] : [`不得产生警告：${warnCount() - warnBase18a}`]),
    ],
  );

  log("r18-1 切到非记录会话 ⇒ 入口出现；点入口切回记录会话（零写入）");
  await openSessionMenu();
  await clickSessionItem("消融实验对照");
  await closeSessionMenu();
  await waitDiscussText("继续讨论：摘录与笔记走查 · ");
  const entryText18a2 = await entryTextOf();
  const entryTitle18a2 = await entryTitleOf();
  const entryShape18a2 = await js(`(() => {
    const el = document.querySelector(${JSON.stringify(SEL.readerDiscuss)});
    if (!el) return null;
    const icon = el.querySelector(".v-icon");
    const docLabel = document.querySelector(${JSON.stringify(SEL.centerDocLabel)});
    return {
      count: document.querySelectorAll(${JSON.stringify(SEL.readerDiscuss)}).length,
      tag: el.tagName,
      iconClass: icon ? icon.className : null,
      mapToggle: !!document.querySelector(${JSON.stringify(SEL.mapToggle)}),
      docLabel: docLabel ? docLabel.textContent.replace(/\\s+/g, " ").trim() : null,
    };
  })()`);
  const pageBefore18a = await pageLabel();
  const zoomBefore18a = await zoomLabel();
  const pillBefore18a = await textOf(".pill-session .pill-label");
  const allow18a = discussTimeAllowSet(entryAfter18a.lastSessionAt);
  const suffix18a = entryText18a2 ? entryText18a2.slice("继续讨论：摘录与笔记走查 · ".length) : null;
  await capturePage(win, "r18-1b-discuss-entry.png", await rectOfSelector(".center-pill", 12));
  const switchBase18a = await switchCallsNow();
  const shaBefore18a = fileHash(STATE_FILE_A);
  const saveBefore18a = (await saveCalls()).count;
  await js(`document.querySelector(${JSON.stringify(SEL.readerDiscuss)}).click(), true`);
  await waitFor("入口点击后的会话切换", `window.__pixStub.switchSessionCalls().count >= ${switchBase18a.count + 1}`);
  await waitPillSession("摘录与笔记走查");
  // 终态信号：活动会话 = 记录会话 ⇒ 入口从 DOM 中消失（不用中间态断言）
  await waitFor("入口隐藏（活动会话 = 记录会话）", `!document.querySelector(${JSON.stringify(SEL.readerDiscuss)})`);
  const switchAfter18a = await switchCallsNow();
  const pillAfter18a = await textOf(".pill-session .pill-label");
  const pageAfter18a = await pageLabel();
  const zoomAfter18a = await zoomLabel();
  const entryCountAfter18a = await countOf(SEL.readerDiscuss);
  await openSessionMenu();
  const probe18a = await sessionMenuProbe();
  await closeSessionMenu();
  const activeRow18a = menuItem(probe18a, "摘录与笔记走查");
  await capturePage(win, "r18-1c-discuss-switched.png");
  record(
    "r18-discuss-entry",
    {
      phase: "entry-visible-and-click",
      entry: entryText18a2,
      entryTitle: entryTitle18a2,
      switchCalls: switchAfter18a,
      pillBefore: pillBefore18a,
      pillAfter: pillAfter18a,
      activeRow: activeRow18a,
      shaSame: fileHash(STATE_FILE_A) === shaBefore18a,
      saveDelta: (await saveCalls()).count - saveBefore18a,
      page: { before: pageBefore18a, after: pageAfter18a },
      zoom: { before: zoomBefore18a, after: zoomAfter18a },
      entryAfter: entryCountAfter18a,
    },
    [
      ...(entryText18a2 !== null && entryText18a2.indexOf("继续讨论：摘录与笔记走查 · ") === 0 ? [] : [`入口文本前缀不符：${JSON.stringify(entryText18a2)}`]),
      ...(suffix18a !== null && allow18a.has(suffix18a) ? [] : [`入口时间档位超出允许集：${JSON.stringify({ text: entryText18a2, allow: [...allow18a] })}`]),
      ...(entryText18a2 !== null && entryTitle18a2 === `${entryText18a2}；点击打开该会话` ? [] : [`tooltip 不符：${JSON.stringify(entryTitle18a2)}`]),
      ...(entryShape18a2 && entryShape18a2.count === 1 && entryShape18a2.tag === "BUTTON" && String(entryShape18a2.iconClass).includes("mdi-forum-outline")
        ? []
        : [`入口形态不符：${JSON.stringify(entryShape18a2)}`]),
      ...(entryShape18a2 && entryShape18a2.docLabel === "sample-paper.pdf" && entryShape18a2.mapToggle === true ? [] : [`pill 既有子元素被破坏：${JSON.stringify(entryShape18a2)}`]),
      ...(switchAfter18a.paths.slice(-1)[0] === SESSIONS_A[0].path ? [] : [`switch_session 载荷不符：${JSON.stringify(switchAfter18a)}`]),
      ...(pillAfter18a === "摘录与笔记走查" && activeRow18a && activeRow18a.active === true ? [] : [`活动行不符：${JSON.stringify({ pillAfter: pillAfter18a, activeRow: activeRow18a })}`]),
      ...(fileHash(STATE_FILE_A) === shaBefore18a ? [] : ["点入口不得写盘"]),
      ...((await saveCalls()).count - saveBefore18a === 0 ? [] : [`点入口不得发 IPC：${(await saveCalls()).count - saveBefore18a}`]),
      ...(pageAfter18a === pageBefore18a && zoomAfter18a === zoomBefore18a ? [] : [`点击不得切页 / 改缩放：${JSON.stringify({ page: { before: pageBefore18a, after: pageAfter18a }, zoom: { before: zoomBefore18a, after: zoomAfter18a } })}`]),
      ...(entryCountAfter18a === 0 ? [] : [`点击后活动会话 = 记录会话 ⇒ 入口应隐藏：${entryCountAfter18a}`]),
    ],
  );

  log("r18-1 发送失败：不记录，现场记录与入口文本逐字不变");
  await openSessionMenu();
  await clickSessionItem("消融实验对照");
  await closeSessionMenu();
  await waitDiscussText("继续讨论：摘录与笔记走查 · ");
  const pairBefore18a3 = readState(STATE_FILE_A).documents["sample-paper.pdf"];
  const entryTextBefore18a3 = await entryTextOf();
  const errorBase18a = await countOf(".error-block");
  await clearSendCalls();
  await setSendFailure("fail");
  await typeAndSend("R18：这条应当发不出去。");
  await waitFor("发送失败错误块", `document.querySelectorAll(".error-block").length > ${errorBase18a}`);
  const errorText18a3 = await lastErrorText();
  const pairAfter18a3 = readState(STATE_FILE_A).documents["sample-paper.pdf"];
  const entryTextAfter18a3 = await entryTextOf();
  const sendCount18a3 = (await sendCalls()).count;
  await setSendFailure(null);
  await capturePage(win, "r18-1d-send-failed.png");
  record(
    "r18-discuss-entry",
    {
      phase: "send-failed",
      errorText: errorText18a3,
      pairBefore: pairBefore18a3,
      pairAfter: pairAfter18a3,
      entryText: entryTextAfter18a3,
      sendCount: sendCount18a3,
    },
    [
      ...(errorText18a3 !== null ? [] : ["发送被拒应有错误块"]),
      ...(pairAfter18a3.lastSessionPath === pairBefore18a3.lastSessionPath && pairAfter18a3.lastSessionAt === pairBefore18a3.lastSessionAt
        ? []
        : [`失败发送不得改写记录：${JSON.stringify({ before: pairBefore18a3, after: pairAfter18a3 })}`]),
      ...(entryTextAfter18a3 !== null && entryTextAfter18a3 === entryTextBefore18a3 ? [] : [`失败后入口文本应逐字不变：${JSON.stringify({ before: entryTextBefore18a3, after: entryTextAfter18a3 })}`]),
      ...(pairAfter18a3.lastSessionAt === entryAfter18a.lastSessionAt ? [] : [`现场文件时间被改写：${JSON.stringify({ record: entryAfter18a.lastSessionAt, now: pairAfter18a3.lastSessionAt })}`]),
      ...(sendCount18a3 === 1 ? [] : [`发送计数异常：${sendCount18a3}`]),
    ],
  );
  await restoreStandardSeed();
  await setSendFailure(null);
  await js("window.__pixStub.setSessions([]), true");

  // --- r18-2 旧格式现场文件：零占位；打开 / 翻页 / 切换都不写记录（组 r18-old-format）---
  log("r18-2 旧格式：续读入口在场、讨论入口零占位、读侧不造字段");
  await js(`window.__pixStub.setSessions(${JSON.stringify(SESSIONS_A)}), true`);
  await enterWorkspaceWithState({
    version: 1,
    lastDocPath: "sample-paper.pdf",
    documents: { "sample-paper.pdf": { page: 2, scale: 1, updatedAt: SEED_AT } },
  });
  await waitResumeEntry();
  const warnBase18b = warnCount();
  const resumeText18b = await textOf(".reader-resume");
  const entryCount18b = await countOf(SEL.readerDiscuss);
  const pairKey18b = hasOwn(readState(STATE_FILE_A).documents["sample-paper.pdf"], "lastSessionPath");
  await capturePage(win, "r18-2-old-format.png");
  record(
    "r18-old-format",
    {
      phase: "old-format-silent",
      resumeText: resumeText18b,
      entryCount: entryCount18b,
      warnDelta: warnCount() - warnBase18b,
      hasPairKey: pairKey18b,
    },
    [
      ...(resumeText18b === "继续阅读：sample-paper.pdf · 第 2 页" ? [] : [`续读入口文案不符：${JSON.stringify(resumeText18b)}`]),
      ...(entryCount18b === 0 ? [] : [`无记录应零占位：${entryCount18b}`]),
      ...(warnCount() - warnBase18b === 0 ? [] : [`不得产生警告：${warnCount() - warnBase18b}`]),
      ...(pairKey18b === false ? [] : ["读侧不得凭空造键"]),
    ],
  );

  log("r18-2 打开文档 + 翻页：落点写盘只保留三字段，不新增记录键");
  await js(`document.querySelector(".reader-resume").click(), true`);
  await waitPdfLoaded();
  await waitPage(2, 3);
  await clickNext();
  await waitPage(3, 3);
  await waitState(STATE_FILE_A, (state) => state.documents["sample-paper.pdf"] && state.documents["sample-paper.pdf"].page === 3 && state.documents["sample-paper.pdf"].updatedAt > SEED_AT, "翻页后的落点写盘");
  const entry18b2 = readState(STATE_FILE_A).documents["sample-paper.pdf"];
  const entryCount18b2 = await countOf(SEL.readerDiscuss);
  await openSessionMenu();
  await clickSessionItem("消融实验对照");
  await closeSessionMenu();
  const pairKeyAfterSwitch18b = hasOwn(readState(STATE_FILE_A).documents["sample-paper.pdf"], "lastSessionPath");
  const entryCount18b3 = await countOf(SEL.readerDiscuss);
  await capturePage(win, "r18-2b-open-switch.png");
  record(
    "r18-old-format",
    {
      phase: "open-switch-no-write",
      page: entry18b2.page,
      pairKeyAfterOpen: hasOwn(entry18b2, "lastSessionPath"),
      pairKeyAfterSwitch: pairKeyAfterSwitch18b,
      entryCount: entryCount18b3,
      entryCountAfterOpen: entryCount18b2,
      warnDelta: warnCount() - warnBase18b,
    },
    [
      ...(entry18b2.page === 3 && entry18b2.scale === 1 && entry18b2.updatedAt > SEED_AT ? [] : [`落点写盘不符：${JSON.stringify(entry18b2)}`]),
      ...(hasOwn(entry18b2, "lastSessionPath") === false ? [] : ["打开 / 翻页不得写记录"]),
      ...(pairKeyAfterSwitch18b === false ? [] : ["切换会话不得写记录"]),
      ...(entryCount18b2 === 0 && entryCount18b3 === 0 ? [] : [`打开文档后仍应零占位：${JSON.stringify({ afterOpen: entryCount18b2, afterSwitch: entryCount18b3 })}`]),
      ...(warnCount() - warnBase18b === 0 ? [] : [`不得产生警告：${warnCount() - warnBase18b}`]),
    ],
  );
  await restoreStandardSeed();
  await setSendFailure(null);
  await js("window.__pixStub.setSessions([]), true");

  // --- r18-3 记录会话不在列表：静默隐藏；列表恢复后入口与标记出现（组 r18-session-missing）---
  log("r18-3 记录会话不在列表：入口与标记静默隐藏，现场记录原样保留");
  await js(`window.__pixStub.setSessions(${JSON.stringify(SESSIONS_A)}), true`);
  await enterWorkspaceWithState({
    version: 1,
    lastDocPath: "sample-paper.pdf",
    documents: {
      "sample-paper.pdf": { page: 1, scale: 1, updatedAt: PAST_AT, lastSessionPath: SESSION_GONE_PATH, lastSessionAt: PAST_AT },
    },
  });
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  const warnBase18c = warnCount();
  const entryCount18c = await countOf(SEL.readerDiscuss);
  const noticeContainers18c = { centerPill: await countOf(".center-pill .reader-discuss"), chatPanel: await countOf(".chat-panel .session-doc-mark") };
  const pairBefore18c = readState(STATE_FILE_A).documents["sample-paper.pdf"];
  await openSessionMenu();
  const markCount18c = await countOf(SEL.sessionDocMark);
  await closeSessionMenu();
  await capturePage(win, "r18-3-session-gone.png");
  record(
    "r18-session-missing",
    {
      phase: "session-gone",
      entryCount: entryCount18c,
      noticeContainers: noticeContainers18c,
      warnDelta: warnCount() - warnBase18c,
      pair: pairBefore18c,
      markCount: markCount18c,
    },
    [
      ...(entryCount18c === 0 ? [] : [`会话不在列表 ⇒ 入口应隐藏：${entryCount18c}`]),
      ...(noticeContainers18c.centerPill === 0 && noticeContainers18c.chatPanel === 0 ? [] : [`不得出现异常容器内的元素：${JSON.stringify(noticeContainers18c)}`]),
      ...(warnCount() - warnBase18c === 0 ? [] : [`不得产生警告：${warnCount() - warnBase18c}`]),
      ...(pairBefore18c.lastSessionPath === SESSION_GONE_PATH && pairBefore18c.lastSessionAt === PAST_AT ? [] : [`读侧不得改写记录：${JSON.stringify(pairBefore18c)}`]),
      ...(markCount18c === 0 ? [] : [`会话不在列表 ⇒ 标注应隐藏：${markCount18c}`]),
    ],
  );

  log("r18-3 恢复列表：入口与标记出现；列表刷新不改写现场文件");
  await js(`window.__pixStub.setSessions(${JSON.stringify(SESSIONS_GHOST)}), true`);
  const entryCountPre18c2 = await countOf(SEL.readerDiscuss);
  // 自确定（不依赖前序场景遗留的 SESSION_STATE 镜像）：先读菜单行，把活动会话显式钉为
  // 「摘录与笔记走查」（该行已是活动会话时点击是幂等 no-op：ChatPanel.onSelectSession early-return）。
  await openSessionMenu();
  const probePre18c2 = await sessionMenuProbe();
  const activePre18c2 = probePre18c2.items.find((item) => item.active) ?? null;
  const activeTitlePre18c2 = activePre18c2 ? activePre18c2.title : null;
  const pinClicked18c2 = activeTitlePre18c2 !== "摘录与笔记走查";
  if (pinClicked18c2) {
    await clickSessionItem("摘录与笔记走查");
    await waitPillSession("摘录与笔记走查");
    await openSessionMenu();
  }
  // 冻结字面（设计档 §1.5.5）：此刻「消融实验对照」必然是非活动行 ⇒ 真实 switch_session
  // （活动行会被 onSelectSession early-return ⇒ 不刷新列表、入口判据必超时）。
  const switchBase18c2 = await switchCallsNow();
  await clickSessionItem("消融实验对照");
  await closeSessionMenu();
  await waitDiscussText("继续讨论：丢失后恢复的会话 · 昨天");
  const switchAfter18c2 = await switchCallsNow();
  const entryText18c2 = await entryTextOf();
  const entryTitle18c2 = await entryTitleOf();
  const pairBefore18c2 = readState(STATE_FILE_A).documents["sample-paper.pdf"];
  await openSessionMenu();
  const probe18c2 = await sessionMenuProbe();
  await closeSessionMenu();
  const marked18c2 = probe18c2.items.filter((item) => item.marked);
  const activeAfter18c2 = menuItem(probe18c2, "消融实验对照");
  const pairAfter18c2 = readState(STATE_FILE_A).documents["sample-paper.pdf"];
  await capturePage(win, "r18-3b-session-restored.png", await rectOfSelector(".center-pill", 12));
  record(
    "r18-session-missing",
    {
      phase: "session-restored",
      entryText: entryText18c2,
      entryTitle: entryTitle18c2,
      entryCountBefore: entryCountPre18c2,
      switchBase: switchBase18c2,
      switchCalls: switchAfter18c2,
      pinClicked: pinClicked18c2,
      activeBefore: activeTitlePre18c2,
      activeAfter: activeAfter18c2 ? activeAfter18c2.active : null,
      markCount: marked18c2.length,
      markTitle: marked18c2[0] ? marked18c2[0].markTitle : null,
      pairBefore: pairBefore18c2,
      pairAfter: pairAfter18c2,
      page: pairAfter18c2.page,
    },
    [
      ...(entryCountPre18c2 === 0 ? [] : [`切换前入口应隐藏（记录会话不在列表）：${entryCountPre18c2}`]),
      ...(switchAfter18c2.count > switchBase18c2.count && switchAfter18c2.paths.slice(-1)[0] === SESSIONS_A[1].path
        ? []
        : [`真实会话切换链不符：${JSON.stringify({ base: switchBase18c2, after: switchAfter18c2 })}`]),
      ...(activeAfter18c2 && activeAfter18c2.active === true ? [] : [`切换后活动行不符：${JSON.stringify(activeAfter18c2)}`]),
      ...(entryText18c2 === "继续讨论：丢失后恢复的会话 · 昨天" ? [] : [`恢复后入口文本不符：${JSON.stringify(entryText18c2)}`]),
      ...(entryTitle18c2 === `${entryText18c2}；点击打开该会话` ? [] : [`tooltip 不符：${JSON.stringify(entryTitle18c2)}`]),
      ...(marked18c2.length === 1 && marked18c2[0].markTitle === "最近讨论：sample-paper.pdf" ? [] : [`标记不符：${JSON.stringify(marked18c2)}`]),
      ...(pairAfter18c2.lastSessionPath === SESSION_GONE_PATH && pairAfter18c2.lastSessionAt === PAST_AT && pairAfter18c2.page === 1
        ? []
        : [`现场记录被改写：${JSON.stringify(pairAfter18c2)}`]),
    ],
  );
  await restoreStandardSeed();
  await setSendFailure(null);
  await js("window.__pixStub.setSessions([]), true");

  // --- r18-4 跨工作区隔离：B 侧不见 A 的记录，A 文件不被 B 触碰（组 r18-workspace-isolation）---
  log("r18-4 A 工作区前置：记录会话 ≠ 活动会话 ⇒ 入口在场");
  await js(`window.__pixStub.setSessions(${JSON.stringify(SESSIONS_A)}), true`);
  await enterWorkspaceWithState({
    version: 1,
    lastDocPath: "sample-paper.pdf",
    documents: {
      "sample-paper.pdf": { page: 1, scale: 1, updatedAt: PAST_AT, lastSessionPath: SESSIONS_A[0].path, lastSessionAt: PAST_AT },
    },
  });
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await openSessionMenu();
  await clickSessionItem("消融实验对照");
  await closeSessionMenu();
  await waitDiscussText("继续讨论：摘录与笔记走查 · 昨天");
  const entryCountA18d = await countOf(SEL.readerDiscuss);
  const pairA18d = readState(STATE_FILE_A).documents["sample-paper.pdf"];

  log("r18-4 B 工作区：按 B 根种入会话列表，仍无入口 / 无标记；A 文件 sha 不变");
  const shaA18d = fileHash(STATE_FILE_A);
  const warnBase18d = warnCount();
  await goHome();
  await js(`window.__pixStub.setSessions(${JSON.stringify(SESSIONS_A)}, ${JSON.stringify(LIBRARY_B_DIR)}), true`);
  await enterWorkspace(LIBRARY_B_NAME);
  await waitTreeRows(1);
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await waitState(STATE_FILE_B, (state) => state.documents["sample-paper.pdf"] && state.documents["sample-paper.pdf"].page === 1, "B 落点写盘");
  await openSessionMenu();
  const probeB18d = await sessionMenuProbe();
  await closeSessionMenu();
  const entryCountB18d = await countOf(SEL.readerDiscuss);
  const bActiveRow = probeB18d.items.filter((item) => item.title === "消融实验对照")[0] ?? null;
  const bEntry18d = readState(STATE_FILE_B).documents["sample-paper.pdf"];
  await capturePage(win, "r18-4-workspace-b.png");
  record(
    "r18-workspace-isolation",
    {
      phase: "workspace-b",
      entryCount: entryCountB18d,
      entryCountA: entryCountA18d,
      bState: bEntry18d,
      menuRowCount: probeB18d.items.length,
      menuRows: probeB18d.items.map((item) => ({ title: item.title, active: item.active, marked: item.marked, hasDeleteBtn: item.hasDeleteBtn, appendCount: item.appendCount, appendWidth: item.appendWidth })),
      menuHasBoth: probeB18d.items.some((item) => item.title === "摘录与笔记走查") && probeB18d.items.some((item) => item.title === "消融实验对照"),
      markCount: probeB18d.items.filter((item) => item.marked).length,
      aShaSame: fileHash(STATE_FILE_A) === shaA18d,
      warnDelta: warnCount() - warnBase18d,
    },
    [
      ...(entryCountA18d === 1 ? [] : [`A 前置失败：入口应在场（记录会话 ≠ 活动会话）：${entryCountA18d}`]),
      ...(entryCountB18d === 0 ? [] : [`B 列表非空但无有效对 ⇒ 入口应隐藏：${entryCountB18d}`]),
      ...(hasOwn(bEntry18d, "lastSessionPath") === false ? [] : [`B 现场条目不得带记录键：${JSON.stringify(bEntry18d)}`]),
      ...(probeB18d.items.some((item) => item.title === "摘录与笔记走查") && probeB18d.items.some((item) => item.title === "消融实验对照")
        ? []
        : [`B 列表未按 B 根种入：${JSON.stringify(probeB18d.items)}`]),
      ...(probeB18d.items.filter((item) => item.marked).length === 0 ? [] : [`B 侧不得出现标记：${JSON.stringify(probeB18d.items)}`]),
      // MF10 实测口径：空 append 容器（B 侧活动行 = 无标记且无删除按钮）零宽 ⇒ 视觉零位移
      ...(bActiveRow && bActiveRow.appendCount === 1 && bActiveRow.appendWidth === 0 && bActiveRow.hasDeleteBtn === false
        ? []
        : [`空 append 容器应为零宽：${JSON.stringify(probeB18d.items.map((item) => ({ title: item.title, appendCount: item.appendCount, appendWidth: item.appendWidth, hasDeleteBtn: item.hasDeleteBtn })))}`]),
      ...(fileHash(STATE_FILE_A) === shaA18d ? [] : ["B 侧操作不得触碰 A 文件"]),
      ...(warnCount() - warnBase18d === 0 ? [] : [`不得产生警告：${warnCount() - warnBase18d}`]),
    ],
  );

  log("r18-4 回 A：入口恢复，现场记录不丢不重写");
  await goHome();
  await js(`window.__pixStub.setSessions(${JSON.stringify(SESSIONS_A)}, ${JSON.stringify(LIBRARY_DIR)}), true`);
  await enterWorkspace(LIBRARY_NAME);
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await waitDiscussText("继续讨论：摘录与笔记走查 · 昨天");
  const entryText18d2 = await entryTextOf();
  const entryTitle18d2 = await entryTitleOf();
  const pairAfter18d2 = readState(STATE_FILE_A).documents["sample-paper.pdf"];
  await capturePage(win, "r18-4b-back-to-a.png", await rectOfSelector(".center-pill", 12));
  record(
    "r18-workspace-isolation",
    {
      phase: "back-to-a",
      entryText: entryText18d2,
      entryTitle: entryTitle18d2,
      pairSame: pairAfter18d2.lastSessionPath === pairA18d.lastSessionPath && pairAfter18d2.lastSessionAt === pairA18d.lastSessionAt,
      pair: pairAfter18d2,
    },
    [
      ...(entryText18d2 === "继续讨论：摘录与笔记走查 · 昨天" ? [] : [`回 A 后入口文本不符：${JSON.stringify(entryText18d2)}`]),
      ...(entryTitle18d2 === `${entryText18d2}；点击打开该会话` ? [] : [`tooltip 不符：${JSON.stringify(entryTitle18d2)}`]),
      ...(pairAfter18d2.lastSessionPath === pairA18d.lastSessionPath && pairAfter18d2.lastSessionAt === pairA18d.lastSessionAt
        ? []
        : [`回切不得丢记录 / 重复写：${JSON.stringify({ before: pairA18d, after: pairAfter18d2 })}`]),
    ],
  );
  await restoreStandardSeed();
  await setSendFailure(null);
  await js("window.__pixStub.setSessions([]), true");

  // --- r18-5 会话列表标注：与当前文档相关的行恰一枚（组 r18-session-mark）---
  log("r18-5 标记：当前文档相关行恰一枚，活动行同样显示");
  await js(`window.__pixStub.setSessions(${JSON.stringify(SESSIONS_A)}), true`);
  await enterWorkspaceWithState({
    version: 1,
    lastDocPath: "sample-paper.pdf",
    documents: {
      "sample-paper.pdf": { page: 1, scale: 1, updatedAt: PAST_AT, lastSessionPath: SESSIONS_A[0].path, lastSessionAt: PAST_AT },
    },
  });
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  const warnBase18e = warnCount();
  await openSessionMenu();
  await clickSessionItem("摘录与笔记走查");
  await closeSessionMenu();
  await waitPillSession("摘录与笔记走查");
  await waitFor("入口隐藏（活动会话 = 记录会话）", `!document.querySelector(${JSON.stringify(SEL.readerDiscuss)})`);
  const entryCount18e = await countOf(SEL.readerDiscuss);
  await openSessionMenu();
  const probe18e = await sessionMenuProbe();
  const deleteBtnCount18e = await countOf(".v-overlay-container .session-delete-btn");
  const deleteTitle18e = await deleteTitleOf();
  const menuText18e = await textOf(".v-overlay-container .v-list");
  const activeRow18e = menuItem(probe18e, "摘录与笔记走查");
  const otherRow18e = menuItem(probe18e, "消融实验对照");
  await capturePage(win, "r18-5-session-mark.png");
  await closeSessionMenu();
  record(
    "r18-session-mark",
    {
      phase: "mark-visible",
      items: probe18e.items,
      markCount: probe18e.items.filter((item) => item.marked).length,
      markTitle: activeRow18e ? activeRow18e.markTitle : null,
      deleteCount: deleteBtnCount18e,
      deleteTitle: deleteTitle18e,
      menuText: menuText18e,
      entryCount: entryCount18e,
    },
    [
      ...(activeRow18e && activeRow18e.marked === true && activeRow18e.markTitle === "最近讨论：sample-paper.pdf" && probe18e.items.filter((item) => item.marked).length === 1
        ? []
        : [`标记不符：${JSON.stringify(probe18e.items)}`]),
      ...(otherRow18e && otherRow18e.marked === false ? [] : [`非记录会话行不应有标记：${JSON.stringify(otherRow18e)}`]),
      ...(deleteBtnCount18e === 1 && deleteTitle18e === "删除该对话" ? [] : [`删除按钮不符：${JSON.stringify({ count: deleteBtnCount18e, title: deleteTitle18e })}`]),
      // MF10 实测口径：会话行恒一枚容器（第 3 列）；命令行无该容器。容器内容 = 标记 / 删除按钮（两者都有时同行）
      ...(probe18e.items.filter((item) => item.appendCount === 1).length === 2 &&
      probe18e.items.filter((item) => item.appendCount === 0).length === 2 &&
      activeRow18e && activeRow18e.hasDeleteBtn === false &&
      otherRow18e && otherRow18e.hasDeleteBtn === true
        ? []
        : [`append 容器事实不符：${JSON.stringify(probe18e.items.map((item) => ({ title: item.title, appendCount: item.appendCount, appendWidth: item.appendWidth })))}`]),
      ...(menuText18e && ["新对话", "重命名当前对话", "历史对话"].every((text) => menuText18e.includes(text)) ? [] : [`菜单既有文案缺失：${JSON.stringify(menuText18e)}`]),
      ...(entryCount18e === 0 ? [] : [`活动会话 = 记录会话 ⇒ 入口应隐藏：${entryCount18e}`]),
    ],
  );

  log("r18-5 无记录文档：标记与入口都不在；切回后标记恢复且现场记录不丢");
  const pairBefore18e2 = readState(STATE_FILE_A).documents["sample-paper.pdf"];
  await openRow("long-book.pdf");
  await waitFor("long-book 页盒 60 页", `document.querySelectorAll(".pdf-page").length === 60`);
  await openSessionMenu();
  const probeAbsent18e = await sessionMenuProbe();
  const entryCountAbsent18e = await countOf(SEL.readerDiscuss);
  await capturePage(win, "r18-5b-mark-absent.png");
  await closeSessionMenu();
  await openRow("sample-paper.pdf");
  await waitPdfLoaded();
  await waitPage(1, 3);
  await openSessionMenu();
  const probeRestored18e = await sessionMenuProbe();
  const entryCountRestored18e = await countOf(SEL.readerDiscuss);
  await closeSessionMenu();
  const pairAfter18e2 = readState(STATE_FILE_A).documents["sample-paper.pdf"];
  record(
    "r18-session-mark",
    {
      phase: "mark-absent",
      markCount: probeAbsent18e.items.filter((item) => item.marked).length,
      entryCount: entryCountAbsent18e,
      restoredMark: (probeRestored18e.items.find((item) => item.marked) || {}).markTitle ?? null,
      restoredEntryCount: entryCountRestored18e,
      pairSame: pairAfter18e2.lastSessionPath === pairBefore18e2.lastSessionPath && pairAfter18e2.lastSessionAt === pairBefore18e2.lastSessionAt,
      warnDelta: warnCount() - warnBase18e,
    },
    [
      ...(probeAbsent18e.items.filter((item) => item.marked).length === 0 && entryCountAbsent18e === 0
        ? []
        : [`无记录文档不得有标记与入口：${JSON.stringify({ marks: probeAbsent18e.items.filter((item) => item.marked).length, entryCount: entryCountAbsent18e })}`]),
      ...((probeRestored18e.items.find((item) => item.marked) || {}).markTitle === "最近讨论：sample-paper.pdf" ? [] : [`切回后标记应恢复：${JSON.stringify(probeRestored18e.items)}`]),
      ...(entryCountRestored18e === 0 ? [] : [`活动会话仍是记录会话 ⇒ 入口应隐藏：${entryCountRestored18e}`]),
      ...(pairAfter18e2.lastSessionPath === pairBefore18e2.lastSessionPath && pairAfter18e2.lastSessionAt === pairBefore18e2.lastSessionAt
        ? []
        : [`读-改-写不得丢对：${JSON.stringify({ before: pairBefore18e2, after: pairAfter18e2 })}`]),
      ...(warnCount() - warnBase18e === 0 ? [] : [`不得产生警告：${warnCount() - warnBase18e}`]),
    ],
  );
  await restoreStandardSeed();
  await setSendFailure(null);
  await js("window.__pixStub.setSessions([]), true");
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

app.commandLine.appendSwitch("disable-gpu");
// 可选高 DPI 取证：只改变像素密度，不改 CSS 布局（1600x1000 窗口 → 2x 像素图）
if (process.env.PIX_SHOT_SCALE) {
  app.commandLine.appendSwitch("force-device-scale-factor", process.env.PIX_SHOT_SCALE);
}

/**
 * 启动守卫（N73-3）：PIX_SHOT_ROOT 必须严格位于 os.tmpdir() 之下，且与 PIX_DIR 互不包含。
 * main() 的第一条语句：失败路径零副作用（不建目录、不删路径、不设 userData）。
 */
function assertOutRootSafe() {
  const outRoot = resolve(OUT_ROOT);
  const tmpRoot = resolve(tmpdir());
  const norm = (value) => (process.platform === "win32" ? value.toLowerCase() : value);
  const o = norm(outRoot);
  const t = norm(tmpRoot);
  const pix = norm(resolve(PIX_DIR));
  const inside = (child, parent) => child !== parent && child.startsWith(parent + sep);
  const inTmp = inside(o, t);
  const crossesRepo = inside(o, pix) || inside(pix, o) || o === pix;
  if (!inTmp || crossesRepo) {
    console.error(
      "[ui-shot] 拒绝启动：PIX_SHOT_ROOT 必须位于系统临时目录内，且不得与仓库路径互相包含（当前：" + outRoot + "）",
    );
    app.exit(1);
    return;
  }
}

async function main() {
  assertOutRootSafe();
  app.setPath("userData", join(OUT_ROOT, "electron-userdata"));
  mkdirSync(OUT_ROOT, { recursive: true });
  // 产物目录自净：只删 <OUT_ROOT>/shots（library / library-b / electron-userdata / vite-cache / stub-preload.cjs 保留），
  // 随后由 writeFixtures() 内的 mkdirSync(SHOTS_DIR, { recursive: true }) 重建。
  rmSync(SHOTS_DIR, { recursive: true, force: true });
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

  // 结束自检（N73-3）：截图集合与清单双向相等 + 目录无白名单外条目；只追加 errors，不覆盖 failure。
  {
    const disk = readdirSync(SHOTS_DIR, { withFileTypes: true });
    const diskPng = disk
      .filter((entry) => entry.isFile() && entry.name.endsWith(".png"))
      .map((entry) => entry.name)
      .sort();
    const manifestPng = shots.map((shot) => basename(shot.file)).sort();
    const missingFromDisk = manifestPng.filter((name) => !diskPng.includes(name));
    const missingFromManifest = diskPng.filter((name) => !manifestPng.includes(name));
    if (missingFromDisk.length || missingFromManifest.length) {
      errors.push(
        `截图目录与清单不一致：磁盘 ${diskPng.length} 张 / 清单 ${manifestPng.length} 张，差集 [${[...missingFromDisk, ...missingFromManifest].join(", ")}]`,
      );
    }
    const strays = disk
      .filter((entry) => !(entry.isFile() && (entry.name.endsWith(".png") || entry.name === "MANIFEST.json" || entry.name === "MEASUREMENTS.json")))
      .map((entry) => entry.name);
    if (strays.length) errors.push(`截图目录存在白名单外条目：[${strays.join(", ")}]`);
  }

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
