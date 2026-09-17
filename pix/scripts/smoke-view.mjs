/**
 * smoke-view.mjs — 渲染层纯函数烟测（仓库内可复跑，零依赖）
 *
 * 运行：
 *   cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:view
 *   cd pix && PATH="/c/Program Files/nodejs:$PATH" node scripts/smoke-view.mjs
 *
 * 做法：用仓库内 typescript 编译仓库内源文件（不复制源码）到 %TEMP% 下的临时 outDir，
 * 再用 createRequire 加载编译产物，对真实文件断言章节命中 / 不可解析降级 / 上一节下一节导航 /
 * <reading_context> 载荷组装（4 组 29 条）；期望值一律手写，不由被测函数生成。
 * 退出码：全部通过 0；编译失败、产物缺失或异常、任一断言失败 1。
 * 约束：只读仓库源文件，只写 os.tmpdir() 下的临时目录，运行结束自清理（仓库零残留）。
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PIX_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(PIX_DIR, "..");
const TSC_JS = join(PIX_DIR, "node_modules", "typescript", "lib", "tsc.js");
const TMP = join(tmpdir(), "pix-smoke-view-" + Date.now());
const OUT_DIR = join(TMP, "out");
const TSCONFIG = join(TMP, "tsconfig.smoke.json");
/**
 * 编译面补丁（只写到 %TEMP%，不改仓库）：reading-context.ts 的 hasLibraryReadApi 读全局 `window.pixApi`，
 * 该声明在 pix/src/renderer/types/ipc.ts（`import type { PixApi } from "../../main/preload"`）——
 * 若把它加入编译面，主进程 preload / pix-paths 等会被一并 emit，产物集合与设计档表不符；
 * 因此这里只补最小 ambient 声明（被测纯函数不经过该分支）。
 */
const WINDOW_SHIM = join(TMP, "window-global.d.ts");
const WINDOW_SHIM_SOURCE = `// smoke-view 专用 ambient 声明：仅补 Window.pixApi（真实声明在 pix/src/renderer/types/ipc.ts）
interface Window {
  pixApi?: { libraryReadFile?: (...args: unknown[]) => Promise<unknown> };
}
`;

// ── 夹具（与 ui-shot.mjs 的 SAMPLE_OUTLINE 同构：3 页 + 无页码节点 + 逆序书签 Appendix B）──

const SAMPLE_LIKE = [
  { title: "1. Abstract", page: 1, items: [] },
  {
    title: "2. Method Overview",
    page: 2,
    items: [
      { title: "2.1 Sparse mask budget", page: 2, items: [] },
      { title: "2.2 Positional prior", page: 3, items: [] },
    ],
  },
  {
    title: "3. Ablation Study",
    page: 3,
    items: [
      { title: "Appendix A", page: null, items: [{ title: "Appendix A.1", page: 3, items: [] }] },
      { title: "Appendix B", page: 2, items: [] },
    ],
  },
];
const CHAIN = [
  { title: "Step 01", page: 1, items: [] },
  { title: "Step 02", page: 3, items: [] },
  { title: "Step 03", page: 5, items: [] },
];
const SINGLE = [{ title: "Only Chapter", page: 3, items: [] }];
const EMPTY = [{ title: "No Page", page: null, items: [{ title: "Child", page: null, items: [] }] }];
/** section-format 附加夹具：命中节点 root/1 的标题改为「换行 + 连续空格」（其余字段不变）。 */
const FOLDED = JSON.parse(JSON.stringify(SAMPLE_LIKE));
FOLDED[1].title = "2. Method\n  Overview";

const SAMPLE_PAGE_COUNT = 3;
const CHAIN_PAGE_COUNT = 6;
const SINGLE_PAGE_COUNT = 3;
const FILE_PATH = "C:/ws/sample-paper.pdf";
const LEGACY_TAIL = "</reading_context>\n\nQ";
/** 旧格式（无 section 行）的逐字期望。 */
const legacyPayload = () => `<reading_context>\npath: ${FILE_PATH}\npage: 2\npageCount: ${SAMPLE_PAGE_COUNT}\n${LEGACY_TAIL}`;

// ── badge-counts 夹具（手写；期望值不由被测函数生成） ────────────────────

/** 标准 4 条（与 ui-shot 的 seedNotes 同构：sample 3 = 摘录 2 + AI 结论 1；archive 1 = 摘录 1）。 */
const BADGE_SEED = [
  { id: "n-current-1", kind: "excerpt", docPath: "sample-paper.pdf", page: 1, text: "badge seed p1", comment: "", createdAt: 1, updatedAt: 1 },
  { id: "n-current-2", kind: "excerpt", docPath: "sample-paper.pdf", page: 2, text: "badge seed p2", comment: "", createdAt: 2, updatedAt: 2 },
  { id: "n-current-3", kind: "answer", docPath: "sample-paper.pdf", page: 2, text: "badge seed answer", comment: "", createdAt: 3, updatedAt: 3 },
  { id: "n-other-1", kind: "excerpt", docPath: "archive/older-paper.pdf", page: 7, text: "badge seed archive", comment: "", createdAt: 4, updatedAt: 4 },
];
/** 比较键归一：大小写不同与尾反斜杠必须合并为同一键。 */
const BADGE_CASE = [
  { id: "c-1", kind: "excerpt", docPath: "sample-paper.pdf", page: 1, text: "case 1", comment: "", createdAt: 5, updatedAt: 5 },
  { id: "c-2", kind: "excerpt", docPath: "Sample-Paper.PDF", page: 2, text: "case 2", comment: "", createdAt: 6, updatedAt: 6 },
  { id: "c-3", kind: "answer", docPath: "sample-paper.pdf\\", page: 3, text: "case 3", comment: "", createdAt: 7, updatedAt: 7 },
];

// ── notes-by-page 夹具（R16；手写，期望值不由被测函数生成） ───────────────

/** 页标记夹具：与 BADGE_SEED 同构（4 条），用于 notes-by-page 的计数口径。 */
const PIN_SEED = [
  { id: "p-1", kind: "excerpt", docPath: "sample-paper.pdf", page: 1, text: "pin 1", comment: "", createdAt: 1, updatedAt: 1 },
  { id: "p-2", kind: "excerpt", docPath: "sample-paper.pdf", page: 2, text: "pin 2", comment: "", createdAt: 2, updatedAt: 2 },
  { id: "p-3", kind: "answer", docPath: "sample-paper.pdf", page: 2, text: "pin 3", comment: "", createdAt: 3, updatedAt: 3 },
  { id: "p-4", kind: "excerpt", docPath: "archive/older-paper.pdf", page: 7, text: "pin 4", comment: "", createdAt: 4, updatedAt: 4 },
];
/** 比较键归一：大小写不同 / 尾反斜杠三种写法必须合并为同一个页号键（与 BADGE_CASE 同口径）。 */
const PIN_CASE = [
  { id: "pc-1", kind: "excerpt", docPath: "Sample-Paper.PDF", page: 2, text: "pin case 1", comment: "", createdAt: 5, updatedAt: 5 },
  { id: "pc-2", kind: "answer", docPath: "sample-paper.pdf\\", page: 2, text: "pin case 2", comment: "", createdAt: 6, updatedAt: 6 },
  { id: "pc-3", kind: "excerpt", docPath: "sample-paper.pdf", page: 2, text: "pin case 3", comment: "", createdAt: 7, updatedAt: 7 },
];
/** 非法页号四条（0 / -2 / 1.5 / NaN）：不产生任何键。 */
const PIN_BAD_PAGE = [
  { id: "pb-1", kind: "excerpt", docPath: "sample-paper.pdf", page: 0, text: "pin bad page 0", comment: "", createdAt: 8, updatedAt: 8 },
  { id: "pb-2", kind: "excerpt", docPath: "sample-paper.pdf", page: -2, text: "pin bad page -2", comment: "", createdAt: 9, updatedAt: 9 },
  { id: "pb-3", kind: "excerpt", docPath: "sample-paper.pdf", page: 1.5, text: "pin bad page 1.5", comment: "", createdAt: 10, updatedAt: 10 },
  { id: "pb-4", kind: "answer", docPath: "sample-paper.pdf", page: Number.NaN, text: "pin bad page NaN", comment: "", createdAt: 11, updatedAt: 11 },
];

// ── excerpt-match 夹具（R16；手写，期望值不由被测函数生成） ───────────────

/** 跨片段夹具（页 1 的前两个文本项，逐字取自 ui-shot 的 SAMPLE_PAGES）。 */
const ANCHOR_PARTS = [
  "Abstract. We study retrieval over long documents where the",
  "attention budget is the binding constraint. Our method keeps",
];
/** 手写期望串：片段边界折叠为恰一个空格 + 末尾小写（大写的 ANCHOR_NEEDLE 对 page.text 直接 indexOf 恒为 -1）。 */
const ANCHOR_NEEDLE = "We study retrieval over long documents where the attention budget is the binding constraint.";
const ANCHOR_NEEDLE_FOLDED = "we study retrieval over long documents where the attention budget is the binding constraint.";
const ANCHOR_MISS = "Table 2 reports the ablation over the sparse mask budget. Removing the positional prior costs 2.4 points of recall, which confirms the mask is doing more than sparsification alone.";
/** 中文夹具：两片段（片段边界同受折叠规则约束 ⇒ 折叠串在「，」后带恰一个空格，摘录须同样带该空格才命中）。 */
const ANCHOR_CN_PAGE = ["稀疏注意力在三分之一的预算下保持召回，", "位置先验是关键。"];
const ANCHOR_CN_NEEDLE = "稀疏注意力在三分之一的预算下保持召回， 位置先验是关键。";
/** 超长夹具（边界含等于：400 参与匹配、401 跳过）。 */
const LONG_400 = "x".repeat(400);
const LONG_401 = "x".repeat(401);

let passed = 0;
let failed = 0;
let outlineNotes = null;
let readingContext = null;
let notesPath = null;
let pageAnchor = null;
let shortcutHelp = null;
let quickAskTemplates = null;

function group(name) {
  console.log(`== 组 ${name} ==`);
}

/** 每条一行；断言之间互不影响（失败继续跑，末尾统一汇总）。 */
function check(groupName, index, desc, ok, actual) {
  if (ok) {
    passed += 1;
    console.log(`[通过] ${groupName} #${index} ${desc}`);
  } else {
    failed += 1;
    console.log(`[失败] ${groupName} #${index} ${desc}：${actual}`);
  }
}

function fail(message) {
  console.error(`[smoke-view] ${message}`);
  process.exitCode = 1;
}

/** 失败时的实际值快照：命中项逐字段、导航逐方向、布尔/数组原样。 */
const brief = (range) =>
  range === null || range === undefined
    ? String(range)
    : JSON.stringify({ key: range.key, title: range.title, start: range.start, end: range.end, label: range.label });
const navBrief = (nav) => JSON.stringify({ prev: brief(nav.prev), next: brief(nav.next) });

// ── 组 section-hit（8 条）：命中规则 + 同 start 取预序最早 ────────────────────

function runSectionHit() {
  const G = "section-hit";
  group(G);
  const ranges = outlineNotes.buildChapterRanges(SAMPLE_LIKE, SAMPLE_PAGE_COUNT);

  const hit1 = outlineNotes.resolveCurrentChapter(ranges, 1, SAMPLE_PAGE_COUNT);
  check(
    G,
    1,
    "SAMPLE_LIKE 第 1 页 ⇒ key/title/start/end/label 逐字段为 1. Abstract",
    hit1 !== null && hit1.key === "root/0" && hit1.title === "1. Abstract" && hit1.start === 1 && hit1.end === 1 && hit1.label === "1",
    brief(hit1),
  );

  const hit2 = outlineNotes.resolveCurrentChapter(ranges, 2, SAMPLE_PAGE_COUNT);
  check(
    G,
    2,
    "SAMPLE_LIKE 第 2 页 ⇒ 2. Method Overview / label 2（同 start 取预序最早，不是 2.1、不是 Appendix B）",
    hit2 !== null && hit2.title === "2. Method Overview" && hit2.label === "2",
    brief(hit2),
  );

  const hit3 = outlineNotes.resolveCurrentChapter(ranges, 3, SAMPLE_PAGE_COUNT);
  check(
    G,
    3,
    "SAMPLE_LIKE 第 3 页 ⇒ 2.2 Positional prior / label 3（不是 3. Ablation Study、不是 Appendix A.1）",
    hit3 !== null && hit3.title === "2.2 Positional prior" && hit3.label === "3",
    brief(hit3),
  );

  const inRangeFlags = [1, 2, 3].map((page) => {
    const hit = outlineNotes.resolveCurrentChapter(ranges, page, SAMPLE_PAGE_COUNT);
    return hit !== null && hit.start <= page && page <= hit.end;
  });
  check(G, 4, "全页不变量（1..3 页逐页）：命中非 null 且 start ≤ page ≤ end", inRangeFlags.every(Boolean), JSON.stringify(inRangeFlags));

  const maxStartFlags = [1, 2, 3].map((page) => {
    const hit = outlineNotes.resolveCurrentChapter(ranges, page, SAMPLE_PAGE_COUNT);
    const candidates = [...ranges.values()].filter((range) => range.start <= page);
    const maxStart = Math.max(...candidates.map((range) => range.start));
    return hit !== null && hit.start === maxStart && candidates.includes(ranges.get(hit.key));
  });
  check(
    G,
    5,
    "「start 最大且 ≤ page」：逐页独立复算候选集，命中的 start = 集合最大值且命中项属于该集合",
    maxStartFlags.every(Boolean),
    JSON.stringify(maxStartFlags),
  );

  const chainRanges = outlineNotes.buildChapterRanges(CHAIN, CHAIN_PAGE_COUNT);
  const chain = [2, 3, 5].map((page) => outlineNotes.resolveCurrentChapter(chainRanges, page, CHAIN_PAGE_COUNT));
  check(
    G,
    6,
    "CHAIN：第 2 页 ⇒ start 1；第 3 页 ⇒ start 3（边界含等于）；第 5 页 ⇒ start 5",
    chain[0] !== null && chain[0].start === 1 && chain[1] !== null && chain[1].start === 3 && chain[2] !== null && chain[2].start === 5,
    JSON.stringify(chain.map((hit) => (hit === null ? null : hit.start))),
  );

  check(
    G,
    7,
    "逆序书签不劫持：第 3 页命中 key ≠ root/2/1（Appendix B，start 2 < 3）且 title ≠ Appendix A.1",
    hit3 !== null && hit3.key !== "root/2/1" && hit3.title !== "Appendix A.1",
    brief(hit3),
  );

  const sameObject = hit3 !== null && ranges.get(hit3.key) === hit3;
  check(
    G,
    8,
    "同源：命中项 === ranges.get(hit.key)（同一对象引用）且 ranges.size === 7（有页码节点数）",
    sameObject && ranges.size === 7,
    JSON.stringify({ sameObject, size: ranges.size }),
  );
}

// ── 组 section-null（8 条）：六种不可解析情形一律 null、不抛错 ────────────────

function runSectionNull() {
  const G = "section-null";
  group(G);

  const emptyRanges = outlineNotes.buildChapterRanges([], SAMPLE_PAGE_COUNT);
  const emptyHit = outlineNotes.resolveCurrentChapter(emptyRanges, 1, SAMPLE_PAGE_COUNT);
  check(G, 1, "outline = []（空数组）⇒ null", emptyHit === null, brief(emptyHit));

  const noPageRanges = outlineNotes.buildChapterRanges(EMPTY, SAMPLE_PAGE_COUNT);
  const noPageHit = outlineNotes.resolveCurrentChapter(noPageRanges, 1, SAMPLE_PAGE_COUNT);
  check(
    G,
    2,
    "EMPTY（两个节点全 page === null ⇒ ranges.size === 0）⇒ null",
    noPageRanges.size === 0 && noPageHit === null,
    JSON.stringify({ size: noPageRanges.size, hit: brief(noPageHit) }),
  );

  const ranges = outlineNotes.buildChapterRanges(SAMPLE_LIKE, SAMPLE_PAGE_COUNT);
  const zeroPageCountHit = outlineNotes.resolveCurrentChapter(ranges, 1, 0);
  check(G, 3, "有页码节点但 pageCount = 0（SAMPLE_LIKE 第 1 页）⇒ null", zeroPageCountHit === null, brief(zeroPageCountHit));

  const pageZeroHit = outlineNotes.resolveCurrentChapter(ranges, 0, SAMPLE_PAGE_COUNT);
  check(G, 4, "page = 0 ⇒ null", pageZeroHit === null, brief(pageZeroHit));

  const pageNegativeHit = outlineNotes.resolveCurrentChapter(ranges, -3, SAMPLE_PAGE_COUNT);
  check(G, 5, "page = -3 ⇒ null", pageNegativeHit === null, brief(pageNegativeHit));

  const pageOverHit = outlineNotes.resolveCurrentChapter(ranges, SAMPLE_PAGE_COUNT + 1, SAMPLE_PAGE_COUNT);
  check(G, 6, "page = pageCount + 1（4，越界）⇒ null", pageOverHit === null, brief(pageOverHit));

  const pageFractionHit = outlineNotes.resolveCurrentChapter(ranges, 1.5, SAMPLE_PAGE_COUNT);
  check(G, 7, "page = 1.5（非整数，不四舍五入）⇒ null", pageFractionHit === null, brief(pageFractionHit));

  const singleRanges = outlineNotes.buildChapterRanges(SINGLE, SINGLE_PAGE_COUNT);
  let earlyHit = null;
  let didNotThrow = true;
  try {
    earlyHit = outlineNotes.resolveCurrentChapter(singleRanges, 1, SINGLE_PAGE_COUNT);
  } catch {
    didNotThrow = false;
  }
  check(
    G,
    8,
    "SINGLE 首节点 page = 3 且 page = 1（早于第一节）⇒ null 且不抛错（didNotThrow === true）",
    earlyHit === null && didNotThrow === true,
    JSON.stringify({ hit: brief(earlyHit), didNotThrow }),
  );
}

// ── 组 section-nav（8 条）：上一节 / 下一节目标 + 两条不变量 ─────────────────

function runSectionNav() {
  const G = "section-nav";
  group(G);
  const ranges = outlineNotes.buildChapterRanges(SAMPLE_LIKE, SAMPLE_PAGE_COUNT);

  const nav1 = outlineNotes.resolveChapterNav(ranges, 1, SAMPLE_PAGE_COUNT);
  check(
    G,
    1,
    "SAMPLE_LIKE 第 1 页 ⇒ prev === null、next = 2. Method Overview",
    nav1.prev === null && nav1.next !== null && nav1.next.title === "2. Method Overview",
    navBrief(nav1),
  );

  const nav2 = outlineNotes.resolveChapterNav(ranges, 2, SAMPLE_PAGE_COUNT);
  check(
    G,
    2,
    "SAMPLE_LIKE 第 2 页 ⇒ prev = 1. Abstract（end 1 < 2）、next = 2.2 Positional prior（start 3 > 2）",
    nav2.prev !== null && nav2.prev.title === "1. Abstract" && nav2.next !== null && nav2.next.title === "2.2 Positional prior",
    navBrief(nav2),
  );

  const nav3 = outlineNotes.resolveChapterNav(ranges, 3, SAMPLE_PAGE_COUNT);
  check(
    G,
    3,
    "SAMPLE_LIKE 第 3 页 ⇒ prev = 2.1 Sparse mask budget（end 并列取预序最晚者）、next === null",
    nav3.prev !== null && nav3.prev.title === "2.1 Sparse mask budget" && nav3.next === null,
    navBrief(nav3),
  );

  const invariants = [1, 2, 3].map((page) => {
    const nav = outlineNotes.resolveChapterNav(ranges, page, SAMPLE_PAGE_COUNT);
    return (nav.prev === null || nav.prev.end < page) && (nav.next === null || nav.next.start > page);
  });
  check(G, 4, "不变量（1..3 页逐页）：prev === null || prev.end < page；next === null || next.start > page", invariants.every(Boolean), JSON.stringify(invariants));

  const chainRanges = outlineNotes.buildChapterRanges(CHAIN, CHAIN_PAGE_COUNT);
  const nav5 = outlineNotes.resolveChapterNav(chainRanges, 3, CHAIN_PAGE_COUNT);
  check(
    G,
    5,
    "CHAIN 第 3 页 ⇒ prev.start = 1、next.start = 5（相邻且页码单调）",
    nav5.prev !== null && nav5.prev.start === 1 && nav5.next !== null && nav5.next.start === 5,
    navBrief(nav5),
  );

  const singleRanges = outlineNotes.buildChapterRanges(SINGLE, SINGLE_PAGE_COUNT);
  const nav6 = outlineNotes.resolveChapterNav(singleRanges, 3, SINGLE_PAGE_COUNT);
  check(G, 6, "SINGLE 第 3 页（节内）⇒ prev === null && next === null（单节禁用）", nav6.prev === null && nav6.next === null, navBrief(nav6));

  const nav7 = outlineNotes.resolveChapterNav(singleRanges, 1, SINGLE_PAGE_COUNT);
  check(
    G,
    7,
    "SINGLE 第 1 页（早于该节）⇒ prev === null、next.start = 3（确定目标）",
    nav7.prev === null && nav7.next !== null && nav7.next.start === 3,
    navBrief(nav7),
  );

  const outOfDomain = [
    outlineNotes.resolveChapterNav(ranges, 1, 0),
    outlineNotes.resolveChapterNav(ranges, SAMPLE_PAGE_COUNT + 1, SAMPLE_PAGE_COUNT),
    outlineNotes.resolveChapterNav(ranges, 1.5, SAMPLE_PAGE_COUNT),
  ];
  check(
    G,
    8,
    "域外（pageCount = 0 / page = 4 / page = 1.5）⇒ prev === null && next === null（与命中函数同一守卫）",
    outOfDomain.every((nav) => nav.prev === null && nav.next === null),
    JSON.stringify(outOfDomain.map(navBrief)),
  );
}

// ── 组 section-format（5 条）：<reading_context> 的 section 行与旧格式字节等价 ──

function runSectionFormat() {
  const G = "section-format";
  group(G);

  const noOutline = readingContext.buildReadingUserMessage("Q", {
    filePath: FILE_PATH,
    page: 2,
    pageCount: SAMPLE_PAGE_COUNT,
    selectedText: "",
    notes: [],
    outline: [],
  });
  check(G, 1, "无 outline ⇒ 逐字节等于旧格式（无 section 行、无空行占位）", noOutline === legacyPayload(), JSON.stringify(noOutline));

  const withSection = readingContext.buildReadingUserMessage("Q", {
    filePath: FILE_PATH,
    page: 2,
    pageCount: SAMPLE_PAGE_COUNT,
    selectedText: "",
    notes: [],
    outline: SAMPLE_LIKE,
  });
  const expectedWithSection = `<reading_context>\npath: ${FILE_PATH}\npage: 2\npageCount: ${SAMPLE_PAGE_COUNT}\nsection: 2. Method Overview · 第 2 页\n${LEGACY_TAIL}`;
  check(G, 2, "SAMPLE_LIKE 第 2 页 ⇒ 逐字节等于「旧格式在 pageCount: 3 之后插入 section 行」", withSection === expectedWithSection, JSON.stringify(withSection));

  const orderNote = {
    id: "smoke-view-order-note",
    kind: "excerpt",
    docPath: "sample-paper.pdf",
    page: 2,
    text: "smoke-view order probe",
    comment: "",
    createdAt: 1,
    updatedAt: 1,
  };
  const ordered = readingContext.buildReadingUserMessage("Q", {
    filePath: FILE_PATH,
    page: 2,
    pageCount: SAMPLE_PAGE_COUNT,
    selectedText: "选中",
    notes: [orderNote],
    outline: SAMPLE_LIKE,
  });
  const pageCountAt = ordered.indexOf("pageCount: 3");
  const sectionAt = ordered.indexOf("section: ");
  const selectedAt = ordered.indexOf("selectedText:");
  check(
    G,
    3,
    "行序：三个 indexOf 均 ≥ 0 且 pageCount: 3 < section: < selectedText:（section 恒为第 5 行）",
    pageCountAt >= 0 && sectionAt >= 0 && selectedAt >= 0 && pageCountAt < sectionAt && sectionAt < selectedAt,
    JSON.stringify({ pageCountAt, sectionAt, selectedAt, payload: ordered }),
  );

  const foldedRanges = outlineNotes.buildChapterRanges(FOLDED, SAMPLE_PAGE_COUNT);
  const foldedHit = outlineNotes.resolveCurrentChapter(foldedRanges, 2, SAMPLE_PAGE_COUNT);
  const foldedHeading = foldedHit === null ? null : outlineNotes.formatChapterHeading(foldedHit);
  const foldedPayload = readingContext.buildReadingUserMessage("Q", {
    filePath: FILE_PATH,
    page: 2,
    pageCount: SAMPLE_PAGE_COUNT,
    selectedText: "",
    notes: [],
    outline: FOLDED,
  });
  const sectionLine = foldedPayload.split("\n").find((line) => line.startsWith("section: ")) ?? null;
  check(
    G,
    4,
    "标题空白折叠：换行 + 连续空格 ⇒ 2. Method Overview · 第 2 页，且 section 整行不含换行",
    foldedHeading === "2. Method Overview · 第 2 页" && sectionLine === "section: 2. Method Overview · 第 2 页" && !sectionLine.includes("\n"),
    JSON.stringify({ foldedHeading, sectionLine }),
  );

  const noFilePath = readingContext.buildReadingUserMessage("Q", {
    filePath: null,
    page: 2,
    pageCount: SAMPLE_PAGE_COUNT,
    selectedText: "",
    notes: [],
    outline: SAMPLE_LIKE,
  });
  check(G, 5, "filePath: null ⇒ 返回 userText 原样（既有早退语义，不注入任何上下文）", noFilePath === "Q", JSON.stringify(noFilePath));
}

/**
 * 组 badge-counts（R14）：树徽标唯一派生 countNotesByDocument 的计数口径。
 * 每条的期望值均手写（不由被测函数生成）；入参夹具在 §断言#6 后复核逐字未变。
 */
function runBadgeCounts() {
  const G = "badge-counts";
  group(G);

  const seedCounts = notesPath.countNotesByDocument(BADGE_SEED);
  const sample = seedCounts.get("sample-paper.pdf");
  const older = seedCounts.get("archive/older-paper.pdf");
  check(
    G,
    1,
    "标准种子 ⇒ 2 个文档键；sample-paper.pdf {total:3, excerpt:2, answer:1}、archive/older-paper.pdf {total:1, excerpt:1, answer:0}",
    seedCounts.size === 2 &&
      !!sample && sample.total === 3 && sample.excerpt === 2 && sample.answer === 1 &&
      !!older && older.total === 1 && older.excerpt === 1 && older.answer === 0,
    JSON.stringify({ size: seedCounts.size, sample, older }),
  );

  const emptyCounts = notesPath.countNotesByDocument([]);
  check(G, 2, "空数组 ⇒ 空 Map（size === 0、不抛错）", emptyCounts.size === 0, JSON.stringify({ size: emptyCounts.size }));

  const fiveCounts = notesPath.countNotesByDocument([
    ...BADGE_SEED,
    { id: "n-current-4", kind: "answer", docPath: "sample-paper.pdf", page: 3, text: "badge seed extra", comment: "", createdAt: 5, updatedAt: 5 },
  ]);
  check(
    G,
    3,
    "只产出 total > 0 的文档：5 条 / 2 个文档 ⇒ size === 2 且 reading-notes.md 无键",
    fiveCounts.size === 2 && fiveCounts.get("reading-notes.md") === undefined,
    JSON.stringify({ size: fiveCounts.size, keys: [...fiveCounts.keys()] }),
  );

  const caseCounts = notesPath.countNotesByDocument(BADGE_CASE);
  const caseSample = caseCounts.get("sample-paper.pdf");
  check(
    G,
    4,
    "比较键归一：大小写不同 / 尾反斜杠合并为同一键 ⇒ size === 1、total 3、excerpt 2、answer 1",
    caseCounts.size === 1 && !!caseSample && caseSample.total === 3 && caseSample.excerpt === 2 && caseSample.answer === 1,
    JSON.stringify({ size: caseCounts.size, sample: caseSample, keys: [...caseCounts.keys()] }),
  );

  const mixedCounts = notesPath.countNotesByDocument([
    { id: "m-1", kind: "excerpt", docPath: "sample-paper.pdf", page: 1, text: "m1", comment: "", createdAt: 1, updatedAt: 1 },
    { id: "m-2", kind: "excerpt", docPath: "sample-paper.pdf", page: 2, text: "m2", comment: "", createdAt: 2, updatedAt: 2 },
    { id: "m-3", kind: "excerpt", docPath: "sample-paper.pdf", page: 3, text: "m3", comment: "", createdAt: 3, updatedAt: 3 },
    { id: "m-4", kind: "answer", docPath: "sample-paper.pdf", page: 4, text: "m4", comment: "", createdAt: 4, updatedAt: 4 },
    { id: "m-5", kind: "answer", docPath: "sample-paper.pdf", page: 5, text: "m5", comment: "", createdAt: 5, updatedAt: 5 },
  ]);
  const mixed = mixedCounts.get("sample-paper.pdf");
  check(
    G,
    5,
    "恒等式：同一文档 3 摘录 + 2 结论 ⇒ total === 5 === excerpt + answer",
    !!mixed && mixed.total === 5 && mixed.excerpt === 3 && mixed.answer === 2 && mixed.total === mixed.excerpt + mixed.answer,
    JSON.stringify(mixed),
  );

  const inputBefore = JSON.stringify(BADGE_SEED);
  const first = notesPath.countNotesByDocument(BADGE_SEED);
  const second = notesPath.countNotesByDocument(BADGE_SEED);
  first.get("sample-paper.pdf").total = 99;
  const inputAfter = JSON.stringify(BADGE_SEED);
  check(
    G,
    6,
    "输入零改动 + 每次返回新 Map：入参 JSON 逐字不变、first !== second、改第一次结果不影响第二次",
    inputBefore === inputAfter && first !== second && second.get("sample-paper.pdf").total === 3,
    JSON.stringify({ inputSame: inputBefore === inputAfter, distinct: first !== second, secondTotal: second.get("sample-paper.pdf").total }),
  );
}

/**
 * 组 notes-by-page（R16）：页标记唯一派生 countNotesByPage 的计数口径。
 * 每条的期望值均手写（不由被测函数生成）；入参夹具在第 6 条后复核逐字未变。
 */
function runNotesByPage() {
  const G = "notes-by-page";
  group(G);
  /** 逐字段比对（不用 JSON.stringify：字段缺失时也能给出可读的失败信息）。 */
  const sameCount = (value, total, excerpt, answer) =>
    value !== undefined && value !== null && value.total === total && value.excerpt === excerpt && value.answer === answer;

  const seedCounts = notesPath.countNotesByPage(PIN_SEED, "sample-paper.pdf");
  check(
    G,
    1,
    "标准页种子 ⇒ 2 个页键；第 1 页 {total:1, excerpt:1, answer:0}、第 2 页 {total:2, excerpt:1, answer:1}、第 3 页 undefined",
    seedCounts.size === 2 && sameCount(seedCounts.get(1), 1, 1, 0) && sameCount(seedCounts.get(2), 2, 1, 1) && seedCounts.get(3) === undefined,
    JSON.stringify({ size: seedCounts.size, p1: seedCounts.get(1), p2: seedCounts.get(2), p3: seedCounts.get(3) }),
  );

  const nullCounts = notesPath.countNotesByPage(PIN_SEED, null);
  check(
    G,
    2,
    "docKey === null ⇒ 空 Map（size === 0、不抛错；与 matchesChapterFilter 的空键守卫同口径）",
    nullCounts.size === 0,
    JSON.stringify({ size: nullCounts.size }),
  );

  const badCounts = notesPath.countNotesByPage(PIN_BAD_PAGE, "sample-paper.pdf");
  check(
    G,
    3,
    "非法页号（0 / -2 / 1.5 / NaN）四条 ⇒ 不产生任何键（size === 0）",
    badCounts.size === 0,
    JSON.stringify({ size: badCounts.size, keys: [...badCounts.keys()] }),
  );

  const caseCounts = notesPath.countNotesByPage(PIN_CASE, "sample-paper.pdf");
  check(
    G,
    4,
    "比较键归一：大小写 / 尾反斜杠三种写法同页合并 ⇒ size === 1、第 2 页 {total:3, excerpt:2, answer:1}；其它文档的 p7 不产生键",
    caseCounts.size === 1 && sameCount(caseCounts.get(2), 3, 2, 1) && seedCounts.get(7) === undefined,
    JSON.stringify({ size: caseCounts.size, p2: caseCounts.get(2), keys: [...caseCounts.keys()], seedP7: seedCounts.get(7) }),
  );

  const identity = seedCounts.get(2);
  check(
    G,
    5,
    "恒等式：同页 1 摘录 + 1 结论 ⇒ total === excerpt + answer === 2（逐值断言；kind 只有两态）",
    identity !== undefined && identity.total === 2 && identity.excerpt === 1 && identity.answer === 1 && identity.total === identity.excerpt + identity.answer,
    JSON.stringify(identity),
  );

  const inputBefore = JSON.stringify(PIN_SEED);
  const first = notesPath.countNotesByPage(PIN_SEED, "sample-paper.pdf");
  const second = notesPath.countNotesByPage(PIN_SEED, "sample-paper.pdf");
  first.get(2).total = 99;
  const inputAfter = JSON.stringify(PIN_SEED);
  check(
    G,
    6,
    "输入零改动 + 每次返回新 Map：入参 JSON 逐字不变、first !== second、改第一次结果不影响第二次",
    inputBefore === inputAfter && first !== second && second.get(2).total === 2,
    JSON.stringify({ inputSame: inputBefore === inputAfter, distinct: first !== second, secondTotal: second.get(2).total }),
  );
}

/**
 * 组 excerpt-match（R16）：折叠与匹配的口径（中英文 / 空白差异 / 跨行 / 重复 / 重叠 / 超长 / 空 / 纯性）。
 * 期望值一律手写；page.text 已是折叠后的全小写串，故手写期望串按折叠规则预先给出。
 */
function runExcerptMatch() {
  const G = "excerpt-match";
  group(G);

  const page = pageAnchor.foldText(ANCHOR_PARTS);
  const first = pageAnchor.matchExcerpts(page, [{ key: "k1", text: ANCHOR_NEEDLE }]);
  const needleFolded = pageAnchor.foldText([ANCHOR_NEEDLE]).text;
  check(
    G,
    1,
    "跨片段命中：恰 1 条区间 [10,102)、slice 逐字等于手写折叠串，且 indexOf(折叠串) === start",
    needleFolded === ANCHOR_NEEDLE_FOLDED &&
      first.length === 1 && first[0].key === "k1" && first[0].start === 10 && first[0].end === 102 &&
      page.text.slice(first[0].start, first[0].end) === ANCHOR_NEEDLE_FOLDED &&
      page.text.indexOf(ANCHOR_NEEDLE_FOLDED) === first[0].start,
    JSON.stringify({ needleFolded, ranges: first, slice: first.length === 1 ? page.text.slice(first[0].start, first[0].end) : null }),
  );

  const cnPage = pageAnchor.foldText(ANCHOR_CN_PAGE);
  const cnRanges = pageAnchor.matchExcerpts(cnPage, [{ key: "cn", text: ANCHOR_CN_NEEDLE }]);
  const htmlLower = pageAnchor.matchExcerpts(pageAnchor.foldText(["HTML basics"]), [{ key: "u", text: "html" }]);
  const htmlUpper = pageAnchor.matchExcerpts(pageAnchor.foldText(["html basics"]), [{ key: "u", text: "HTML" }]);
  check(
    G,
    2,
    "中文与大小写：中文页面（片段边界折叠为恰一个空格）⇒ 命中 [0,末)；HTML/html 双向命中 ⇒ [0,4)（大小写折叠对称）",
    cnPage.text === ANCHOR_CN_NEEDLE &&
      cnRanges.length === 1 && cnRanges[0].start === 0 && cnPage.text.slice(cnRanges[0].start, cnRanges[0].end) === ANCHOR_CN_NEEDLE &&
      htmlLower.length === 1 && htmlLower[0].start === 0 && htmlLower[0].end === 4 &&
      htmlUpper.length === 1 && htmlUpper[0].start === 0 && htmlUpper[0].end === 4,
    JSON.stringify({ cnText: cnPage.text, cn: cnRanges, htmlLower, htmlUpper }),
  );

  const wsTab = pageAnchor.foldText(["a\tb", "c   d"]);
  const wsNewline = pageAnchor.foldText(["a\nb\nc d"]);
  const wsPlain = pageAnchor.foldText(["a b c d"]);
  const wsNeedle = pageAnchor.matchExcerpts(pageAnchor.foldText(["a", "b"]), [{ key: "ws", text: "a  b" }]);
  check(
    G,
    3,
    "空白差异等价：制表 / 换行 / 多空格 / 片段边界四种写法折叠后逐字相等（恰一个空格、不丢字符）；含空白摘录命中短片段页 [0,3)",
    wsTab.text === "a b c d" && wsNewline.text === "a b c d" && wsPlain.text === "a b c d" &&
      wsNeedle.length === 1 && wsNeedle[0].start === 0 && wsNeedle[0].end === 3,
    JSON.stringify({ tab: wsTab.text, newline: wsNewline.text, plain: wsPlain.text, wsNeedle }),
  );

  const joined = pageAnchor.foldText(["alpha", "beta"]);
  const at = page.at;
  const increasing = at.filter((value) => value !== -1).every((value, index, list) => index === 0 || value > list[index - 1]);
  const trimmed = pageAnchor.matchExcerpts(page, [{ key: "trim", text: " \n " + ANCHOR_NEEDLE + "  " }]);
  check(
    G,
    4,
    "跨行与 trim：alpha/beta ⇒ \"alpha beta\"（边界恰一个空格）；at.length === text.length、非 -1 下标严格递增、片段边界记 -1（at[10] = 10 / at[58] = -1 / at[101] = 101）；摘录首尾带空白仍命中 [10,102)",
    joined.text === "alpha beta" && joined.text.length === 10 && joined.at.length === joined.text.length &&
      at.length === page.text.length && increasing &&
      at[10] === 10 && at[58] === -1 && at[101] === 101 &&
      trimmed.length === 1 && trimmed[0].start === 10 && trimmed[0].end === 102,
    JSON.stringify({ joined: joined.text, atLen: at.length, textLen: page.text.length, at10: at[10], at58: at[58], at101: at[101], increasing, trimmed }),
  );

  const missRanges = pageAnchor.matchExcerpts(pageAnchor.foldText(["short page"]), [{ key: "k", text: ANCHOR_MISS }]);
  check(
    G,
    5,
    "不可匹配：摘录比页面文本更长 / 页面缺少该子串 ⇒ 返回 []（不抛错、不返回近似区间）",
    missRanges.length === 0,
    JSON.stringify(missRanges),
  );

  const dupPage = pageAnchor.foldText(["alpha beta", "alpha beta"]);
  const dupRanges = pageAnchor.matchExcerpts(dupPage, [{ key: "dup", text: "alpha beta" }]);
  check(
    G,
    6,
    "重复文本：同一子串出现两次（0 / 11）⇒ 恰 1 条区间且 start 指向第一次出现（[0,10)）",
    dupPage.text === "alpha beta alpha beta" && dupPage.text.indexOf("alpha beta") === 0 && dupPage.text.lastIndexOf("alpha beta") === 11 &&
      dupRanges.length === 1 && dupRanges[0].start === 0 && dupRanges[0].end === 10 && dupRanges[0].start === dupPage.text.indexOf("alpha beta"),
    JSON.stringify({ text: dupPage.text, first: dupPage.text.indexOf("alpha beta"), last: dupPage.text.lastIndexOf("alpha beta"), ranges: dupRanges }),
  );

  const overlapPage = pageAnchor.foldText(["the quick brown fox"]);
  const bigFirst = pageAnchor.matchExcerpts(overlapPage, [{ key: "B", text: "the quick brown fox" }, { key: "A", text: "quick brown" }]);
  const smallFirst = pageAnchor.matchExcerpts(overlapPage, [{ key: "A", text: "quick brown" }, { key: "B", text: "the quick brown fox" }]);
  check(
    G,
    7,
    "多段重叠：A ⊂ B 时先到者获胜（B 先 ⇒ 只留 B[0,19)；A 先 ⇒ 只留 A[4,15)），后来者整体丢弃不截断",
    bigFirst.length === 1 && bigFirst[0].key === "B" && bigFirst[0].start === 0 && bigFirst[0].end === 19 &&
      smallFirst.length === 1 && smallFirst[0].key === "A" && smallFirst[0].start === 4 && smallFirst[0].end === 15,
    JSON.stringify({ bigFirst, smallFirst }),
  );

  const overLong = pageAnchor.matchExcerpts(pageAnchor.foldText([LONG_401 + " tail"]), [{ key: "k", text: LONG_401 }]);
  const atLimit = pageAnchor.matchExcerpts(pageAnchor.foldText([LONG_400]), [{ key: "k", text: LONG_400 }]);
  check(
    G,
    8,
    "超长边界：折叠后 401 字符 ⇒ 跳过（[]）；恰 400 字符 ⇒ 参与匹配（[0,400)）",
    overLong.length === 0 && atLimit.length === 1 && atLimit[0].start === 0 && atLimit[0].end === 400,
    JSON.stringify({ overLong, atLimit }),
  );

  const detPage = pageAnchor.foldText(["alpha beta gamma"]);
  const emptyNeedle = pageAnchor.matchExcerpts(detPage, [{ key: "e", text: "" }]);
  const blankNeedle = pageAnchor.matchExcerpts(detPage, [{ key: "w", text: "  \t\n  " }]);
  const detRanges = pageAnchor.matchExcerpts(detPage, [
    { key: "k1", text: "alpha" },
    { key: "k2", text: "zeta" },
    { key: "k3", text: "gamma" },
  ]);
  check(
    G,
    9,
    "空 / 全空白摘录 ⇒ []；三条摘录第 2 条不可匹配 ⇒ 返回顺序 === 被接受输入的子序（k1[0,5) / k3[11,16)）",
    emptyNeedle.length === 0 && blankNeedle.length === 0 &&
      detRanges.length === 2 && detRanges[0].key === "k1" && detRanges[0].start === 0 && detRanges[0].end === 5 &&
      detRanges[1].key === "k3" && detRanges[1].start === 11 && detRanges[1].end === 16,
    JSON.stringify({ emptyNeedle, blankNeedle, detRanges }),
  );

  const purePage = pageAnchor.foldText(ANCHOR_PARTS);
  const pureExcerpts = [{ key: "p1", text: ANCHOR_NEEDLE }];
  const purePageBefore = JSON.stringify(purePage);
  const pureExcerptsBefore = JSON.stringify(pureExcerpts);
  const runA = pageAnchor.matchExcerpts(purePage, pureExcerpts);
  const runB = pageAnchor.matchExcerpts(purePage, pureExcerpts);
  const purePageAfter = JSON.stringify(purePage);
  const pureExcerptsAfter = JSON.stringify(pureExcerpts);
  const emptyFold = pageAnchor.foldText([]);
  const blankFold = pageAnchor.foldText(["   "]);
  check(
    G,
    10,
    "纯性 + 新对象：入参逐字不变；两次调用 JSON 相等但对象不同；foldText([]) ⇒ { text: \"\", at: [] }（全空白同理）",
    purePageBefore === purePageAfter && pureExcerptsBefore === pureExcerptsAfter &&
      runA !== runB && JSON.stringify(runA) === JSON.stringify(runB) &&
      emptyFold.text === "" && emptyFold.at.length === 0 &&
      blankFold.text === "" && blankFold.at.length === 0,
    JSON.stringify({ pageSame: purePageBefore === purePageAfter, excerptsSame: pureExcerptsBefore === pureExcerptsAfter, distinct: runA !== runB, equal: JSON.stringify(runA) === JSON.stringify(runB), emptyFold, blankFold }),
  );
}

// ── 组 shortcut-table（R17 N96；12 条）：键位总览数据源（3 组 / 18 行，逐字） ──────

/** 手写期望常量（不由被测数据生成）：3 个组标题 + 18 行 { keys, desc } + 说明行。 */
const SHORTCUT_EXPECT_TITLES = ["阅读区（打开文档后）", "输入框", "工作区"];
const SHORTCUT_EXPECT_ROWS_READER = [
  { keys: ["/"], desc: "打开文档搜索" },
  { keys: ["Ctrl+F"], desc: "打开文档搜索" },
  { keys: ["PageUp", "←"], desc: "上一页" },
  { keys: ["PageDown", "→"], desc: "下一页" },
  { keys: ["Home"], desc: "跳到第一页" },
  { keys: ["End"], desc: "跳到最后一页" },
  { keys: ["["], desc: "上一节" },
  { keys: ["]"], desc: "下一节" },
  { keys: ["Esc"], desc: "退出框选模式或关闭文档搜索" },
];
const SHORTCUT_EXPECT_ROWS_INPUT = [
  { keys: ["Enter"], desc: "发送消息（对话输入框）" },
  { keys: ["Shift+Enter"], desc: "换行（对话输入框）" },
  { keys: ["Enter"], desc: "下一处（文档搜索框）" },
  { keys: ["Shift+Enter"], desc: "上一处（文档搜索框）" },
  { keys: ["Enter"], desc: "跳转到该页（页码输入框）" },
  { keys: ["Esc"], desc: "取消页码输入（页码输入框）" },
  { keys: ["Esc"], desc: "清空搜索并移出焦点（笔记搜索框）" },
  { keys: ["Enter"], desc: "提交重命名（对话名称输入框）" },
];
const SHORTCUT_EXPECT_ROWS_WORKSPACE = [{ keys: ["?"], desc: "打开或关闭本总览" }];
const SHORTCUT_EXPECT_NOTE = "选区浮层（选中文本后出现，无键位）：问 AI / 解释 / 翻译 / 摘录";

function runShortcutTable() {
  const G = "shortcut-table";
  group(G);
  const sections = shortcutHelp.SHORTCUT_SECTIONS;

  check(G, 1, "组数 === 3", sections.length === 3, String(sections.length));

  const titles = sections.map((section) => section.title);
  check(
    G,
    2,
    "三个组标题逐字（顺序敏感）",
    JSON.stringify(titles) === JSON.stringify(SHORTCUT_EXPECT_TITLES),
    JSON.stringify(titles),
  );

  const totalRows = sections.reduce((sum, section) => sum + section.rows.length, 0);
  check(G, 3, "总行数 === 18（9 + 8 + 1）", totalRows === 18, String(totalRows));

  check(
    G,
    4,
    "第 1 组 9 行逐字深等（含 PageUp / ← 与两行重复文案「打开文档搜索」）",
    JSON.stringify(sections[0]?.rows) === JSON.stringify(SHORTCUT_EXPECT_ROWS_READER),
    JSON.stringify(sections[0]?.rows),
  );

  check(
    G,
    5,
    "第 2 组 8 行逐字深等（含「提交重命名（对话名称输入框）」）",
    JSON.stringify(sections[1]?.rows) === JSON.stringify(SHORTCUT_EXPECT_ROWS_INPUT),
    JSON.stringify(sections[1]?.rows),
  );

  check(
    G,
    6,
    "第 3 组 1 行逐字深等（[\"?\"] / 打开或关闭本总览）",
    JSON.stringify(sections[2]?.rows) === JSON.stringify(SHORTCUT_EXPECT_ROWS_WORKSPACE),
    JSON.stringify(sections[2]?.rows),
  );

  const allRows = sections.flatMap((section) => section.rows);
  const keysAllNonEmpty = allRows.every(
    (row) => Array.isArray(row.keys) && row.keys.length > 0 && row.keys.every((key) => typeof key === "string" && key.length > 0),
  );
  const combos = allRows.map((row) => row.keys.join(shortcutHelp.SHORTCUT_KEY_JOIN) + row.desc);
  const combosUnique = new Set(combos).size === combos.length;
  check(
    G,
    7,
    "全表 keys 元素均为非空字符串；keys.join(JOIN) + desc 组合无重复",
    keysAllNonEmpty && combosUnique,
    JSON.stringify({ keysAllNonEmpty, combosUnique, duplicates: combos.filter((combo, index) => combos.indexOf(combo) !== index) }),
  );

  check(G, 8, "SHORTCUT_KEY_JOIN 逐字 \" / \"", shortcutHelp.SHORTCUT_KEY_JOIN === " / ", JSON.stringify(shortcutHelp.SHORTCUT_KEY_JOIN));

  check(
    G,
    9,
    "SHORTCUT_NOTE 逐字等于冻结串且含「摘录」",
    shortcutHelp.SHORTCUT_NOTE === SHORTCUT_EXPECT_NOTE && shortcutHelp.SHORTCUT_NOTE.includes("摘录"),
    JSON.stringify(shortcutHelp.SHORTCUT_NOTE),
  );

  const serialized = JSON.stringify(sections);
  check(
    G,
    10,
    "全表不含 ArrowUp / ArrowDown",
    !serialized.includes("ArrowUp") && !serialized.includes("ArrowDown"),
    JSON.stringify({ arrowUp: serialized.includes("ArrowUp"), arrowDown: serialized.includes("ArrowDown") }),
  );

  const ctrlHits = serialized.split("Ctrl+").length - 1;
  check(
    G,
    11,
    "修饰键白名单：Ctrl+ 恰 1 次（Ctrl+F），且不含 Ctrl+Shift / Alt+ / Meta+",
    ctrlHits === 1 && !serialized.includes("Ctrl+Shift") && !serialized.includes("Alt+") && !serialized.includes("Meta+"),
    JSON.stringify({ ctrlHits, ctrlShift: serialized.includes("Ctrl+Shift"), alt: serialized.includes("Alt+"), meta: serialized.includes("Meta+") }),
  );

  const groupsWellFormed = sections.every(
    (section) => typeof section.title === "string" && section.title.length > 0 && section.rows.length > 0,
  );
  check(
    G,
    12,
    "每组 title 为非空字符串且 rows.length > 0（防空断言防护）",
    groupsWellFormed,
    JSON.stringify(sections.map((section) => ({ title: section.title, rows: section.rows.length }))),
  );
}

// ── 组 template-draft（R17 N97；11 条）：选区模板动作纯函数（逐字 / 三分支） ──────

/** 手写期望常量（不由被测函数生成）：两个新模板 + 两个既有模板 + 可替换集合。 */
const QUICK_ASK = "请解释选中的这段话：";
const NOTES_ASK = "请结合我选中的摘录回答：";
const EXPLAIN = "请解释选中的这段话在论文中的含义与作用：";
const TRANSLATE = "请把选中的这段话翻译成中文：";
const KNOWN = [QUICK_ASK, EXPLAIN, TRANSLATE];

function runTemplateDraft() {
  const G = "template-draft";
  group(G);
  const templates = quickAskTemplates;

  check(G, 1, "EXPLAIN_TEMPLATE 逐字", templates.EXPLAIN_TEMPLATE === EXPLAIN, JSON.stringify(templates.EXPLAIN_TEMPLATE));

  check(G, 2, "TRANSLATE_TEMPLATE 逐字", templates.TRANSLATE_TEMPLATE === TRANSLATE, JSON.stringify(templates.TRANSLATE_TEMPLATE));

  check(
    G,
    3,
    "templateForAction：explain ⇒ EXPLAIN_TEMPLATE、translate ⇒ TRANSLATE_TEMPLATE",
    templates.templateForAction("explain") === EXPLAIN && templates.templateForAction("translate") === TRANSLATE,
    JSON.stringify({ explain: templates.templateForAction("explain"), translate: templates.templateForAction("translate") }),
  );

  check(
    G,
    4,
    "空草稿 ⇒ 返回 template",
    templates.resolveTemplateDraft("", EXPLAIN, KNOWN) === EXPLAIN,
    JSON.stringify(templates.resolveTemplateDraft("", EXPLAIN, KNOWN)),
  );

  check(
    G,
    5,
    "纯空白草稿 ⇒ 按空处理",
    templates.resolveTemplateDraft("   ", TRANSLATE, KNOWN) === TRANSLATE,
    JSON.stringify(templates.resolveTemplateDraft("   ", TRANSLATE, KNOWN)),
  );

  check(
    G,
    6,
    "既有模板（问 AI 的草稿）可被替换",
    templates.resolveTemplateDraft(QUICK_ASK, EXPLAIN, KNOWN) === EXPLAIN,
    JSON.stringify(templates.resolveTemplateDraft(QUICK_ASK, EXPLAIN, KNOWN)),
  );

  check(
    G,
    7,
    "模板互替：EXPLAIN ⇒ TRANSLATE",
    templates.resolveTemplateDraft(EXPLAIN, TRANSLATE, KNOWN) === TRANSLATE,
    JSON.stringify(templates.resolveTemplateDraft(EXPLAIN, TRANSLATE, KNOWN)),
  );

  check(
    G,
    8,
    "自定义草稿 ⇒ null（一字不改）",
    templates.resolveTemplateDraft("我的问题", EXPLAIN, KNOWN) === null,
    JSON.stringify(templates.resolveTemplateDraft("我的问题", EXPLAIN, KNOWN)),
  );

  check(
    G,
    9,
    "笔记模板不在替换集合 ⇒ null",
    templates.resolveTemplateDraft(NOTES_ASK, EXPLAIN, KNOWN) === null,
    JSON.stringify(templates.resolveTemplateDraft(NOTES_ASK, EXPLAIN, KNOWN)),
  );

  check(
    G,
    10,
    "两模板互不相等、且都不等于既有模板（期望值手写）",
    EXPLAIN !== TRANSLATE && EXPLAIN !== QUICK_ASK && TRANSLATE !== QUICK_ASK,
    JSON.stringify({ explainVsTranslate: EXPLAIN !== TRANSLATE, explainVsQuickAsk: EXPLAIN !== QUICK_ASK, translateVsQuickAsk: TRANSLATE !== QUICK_ASK }),
  );

  check(
    G,
    11,
    "首尾空白差异即不匹配（\" \" + EXPLAIN ⇒ null）",
    templates.resolveTemplateDraft(" " + EXPLAIN, TRANSLATE, KNOWN) === null,
    JSON.stringify(templates.resolveTemplateDraft(" " + EXPLAIN, TRANSLATE, KNOWN)),
  );
}

/** 编译仓库内三个源文件到 %TEMP%（不复制源码），校验产物集合后加载。 */
function compileAndLoad() {
  mkdirSync(TMP, { recursive: true });
  const config = {
    compilerOptions: {
      module: "commonjs",
      target: "ES2022",
      rootDir: join(REPO_DIR, "pix", "src"),
      outDir: OUT_DIR,
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      types: ["node"],
      typeRoots: [join(REPO_DIR, "pix", "node_modules", "@types")],
      baseUrl: join(REPO_DIR, "pix"),
      paths: { "@shared/*": ["src/shared/*"] },
    },
    files: [
      join(REPO_DIR, "pix", "src", "renderer", "utils", "outline-notes.ts"),
      join(REPO_DIR, "pix", "src", "renderer", "utils", "notes-path.ts"),
      join(REPO_DIR, "pix", "src", "renderer", "utils", "reading-context.ts"),
      join(REPO_DIR, "pix", "src", "renderer", "utils", "page-anchor.ts"),
      join(REPO_DIR, "pix", "src", "renderer", "utils", "shortcut-help.ts"),
      join(REPO_DIR, "pix", "src", "renderer", "utils", "quick-ask-templates.ts"),
      WINDOW_SHIM,
    ],
  };
  writeFileSync(WINDOW_SHIM, WINDOW_SHIM_SOURCE, "utf8");
  writeFileSync(TSCONFIG, JSON.stringify(config, null, 2), "utf8");

  const compile = spawnSync(process.execPath, [TSC_JS, "-p", TSCONFIG], { cwd: PIX_DIR, encoding: "utf8" });
  if (compile.status !== 0) {
    fail(`typescript 编译失败（status=${compile.status}），不进入断言`);
    console.error(compile.stdout || "");
    console.error(compile.stderr || "");
    return false;
  }

  const required = ["renderer/utils/outline-notes.js", "renderer/utils/notes-path.js", "renderer/utils/reading-context.js", "renderer/utils/page-anchor.js", "renderer/utils/shortcut-help.js", "renderer/utils/quick-ask-templates.js"];
  const allowed = new Set([...required, "shared/types.js"]);
  let emitted = [];
  try {
    emitted = readdirSync(OUT_DIR, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(OUT_DIR, join(entry.parentPath, entry.name)).split("\\").join("/"));
  } catch (err) {
    fail(`编译产物目录不可读（${OUT_DIR}）：${err instanceof Error ? err.message : String(err)}，不进入断言`);
    return false;
  }
  const missing = required.filter((item) => !emitted.includes(item));
  const extra = emitted.filter((item) => !allowed.has(item));
  if (missing.length || extra.length) {
    fail(`编译产物异常：缺失 [${missing.join(", ")}] / 多出 [${extra.join(", ")}]；实际 [${emitted.join(", ")}]，不进入断言`);
    return false;
  }

  const require = createRequire(import.meta.url);
  outlineNotes = require(join(OUT_DIR, "renderer", "utils", "outline-notes.js"));
  readingContext = require(join(OUT_DIR, "renderer", "utils", "reading-context.js"));
  notesPath = require(join(OUT_DIR, "renderer", "utils", "notes-path.js"));
  pageAnchor = require(join(OUT_DIR, "renderer", "utils", "page-anchor.js"));
  shortcutHelp = require(join(OUT_DIR, "renderer", "utils", "shortcut-help.js"));
  quickAskTemplates = require(join(OUT_DIR, "renderer", "utils", "quick-ask-templates.js"));
  return true;
}

function main() {
  console.log(`[smoke-view] 临时目录：${TMP}`);
  console.log(`[smoke-view] typescript：${TSC_JS}`);
  try {
    if (compileAndLoad()) {
      runSectionHit();
      runSectionNull();
      runSectionNav();
      runSectionFormat();
      runBadgeCounts();
      runNotesByPage();
      runExcerptMatch();
      runShortcutTable();
      runTemplateDraft();
    }
    console.log(`通过 ${passed} / 失败 ${failed}`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    try {
      rmSync(TMP, { recursive: true, force: true });
    } catch {
      // 清理失败只告警，不改变退出码
      console.log(`[警告] 临时目录未清理：${TMP}`);
    }
  }
}

main();
