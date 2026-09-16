/**
 * smoke-notes.mjs — 主进程数据面烟测（仓库内可复跑，零依赖）
 *
 * 运行：
 *   cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes
 *   cd pix && PATH="/c/Program Files/nodejs:$PATH" node scripts/smoke-notes.mjs
 *
 * 做法：用仓库内 typescript 编译仓库内源文件（不复制源码）到 %TEMP% 下的临时 outDir，
 * 再用 createRequire 加载编译产物，对真实文件系统驱动 notes-store 的撤销 / 失败 / 槽生命周期 / 导出面。
 * 退出码：全部通过 0；编译失败、产物缺失、任一断言失败 1。
 * 约束：只读仓库源文件，只写 os.tmpdir() 下的临时目录，运行结束自清理（仓库零残留）。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PIX_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(PIX_DIR, "..");
const TSC_JS = join(PIX_DIR, "node_modules", "typescript", "lib", "tsc.js");
const TMP = join(tmpdir(), "pix-smoke-notes-" + Date.now());
const OUT_DIR = join(TMP, "out");
const TSCONFIG = join(TMP, "tsconfig.smoke.json");
const WS_A = join(TMP, "ws-a");
const WS_B = join(TMP, "ws-b");
const PIX_READ_A = join(WS_A, ".pix-read");
const PIX_READ_B = join(WS_B, ".pix-read");
const NOTES_A = join(PIX_READ_A, "notes.json");
const NOTES_MD_A = join(PIX_READ_A, "notes.md");
const TMP_INJECT = join(PIX_READ_A, "notes.json.tmp");
/** 库内文档路径统一走该绝对路径；文件无需真实存在（缺失时 isLibraryFilePath 仍按在库内处理）。 */
const DOC_A = join(WS_A, "sample-paper.pdf");
const TEXT_A1 = "We study retrieval over long documents where the attention budget is the binding constraint.";
const TEXT_A2 = "结论：稀疏注意力在三分之一的预算下保持召回。";
const TEXT_A3 = "Section 4. Reproducibility: all runs use three seeds and report the median.";
const DOC_ARCHIVE = join(WS_A, "archive", "older-paper.pdf");
const REPORTS_A = join(PIX_READ_A, "reports");
const REPORTS_ARCHIVE_A = join(REPORTS_A, "archive");
const REPORT_A = join(REPORTS_A, "sample-paper.pdf.md");
const REPORT_ARCHIVE_A = join(REPORTS_ARCHIVE_A, "older-paper.pdf.md");
const REPORT_COMMENT = "与第 3 节消融实验对照";
const ARCHIVE_TEXT = "Archive excerpt for the subdirectory report.";
const OUT_OF_RANGE_TEXT = "Out-of-range excerpt: this page is beyond the document page count.";
/** R14：notes-stat 的外部改写正文（手写常量，与既有夹具正文不重复）。 */
const STAT_NOTE_TEXT = "external append for stat";
/** 唯一非确定性字段的归一化（与离屏脚本逐字同一条表达式）。 */
const STAMP_RE = /生成时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;
const normalizeStamp = (text) => text.replace(STAMP_RE, "生成时间：<STAMP>");
/** 报告入参的章节夹具（3 项；顺序即分组顺序；手写，不由 buildChapterRanges 生成）。 */
const SAMPLE_CHAPTERS = [
  { title: "1. Abstract", start: 1, end: 1, label: "1" },
  { title: "2. Method Overview", start: 2, end: 2, label: "2" },
  { title: "2.2 Positional prior", start: 3, end: 3, label: "3" },
];
const PROGRESS_3 = { page: 1, pageCount: 3 };
/** 夹具时间戳步长：同页两条的 `createdAt` 显式相隔 1 分钟（不依赖 addNote 的毫秒级时钟）。 */
const REPORT_STAMP_STEP_MS = 60_000;

let passed = 0;
let failed = 0;
let notesStore = null;
let libraryRoot = null;
let readerStateStore = null;

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
  console.error(`[smoke-notes] ${message}`);
  process.exitCode = 1;
}

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const serialize = (notes) => `${JSON.stringify({ version: 1, notes }, null, 2)}\n`;
const idsOf = (notes) => notes.map((note) => note.id);
const sameIds = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function writeNotesFile(notes) {
  mkdirSync(PIX_READ_A, { recursive: true });
  writeFileSync(NOTES_A, serialize(notes), "utf8");
}

function readFileNotes() {
  return JSON.parse(readFileSync(NOTES_A, "utf8")).notes;
}

/** 「主进程回传列表 === 文件所存」：id 序列逐条相等。 */
function relayMatchesFile(result) {
  return result.success === true && sameIds(idsOf(result.notes), idsOf(readFileNotes()));
}

function draft(docFilePath, page, text, kind = "excerpt") {
  return { kind, docFilePath, page, text };
}

/**
 * 3 条报告夹具（p1 摘录带备注 / p2 摘录 / p2 AI 结论），返回时保证文件与目录为「无报告」初态。
 * 落盘后按文件序把 `createdAt` / `updatedAt` 显式钉住（步长 `REPORT_STAMP_STEP_MS`）：
 * 报告组内次序只依赖 `page` → `createdAt`，不得托付给 addNote 的毫秒级 `Date.now()`。
 */
function seedReportNotes(docPath) {
  rmSync(NOTES_A, { force: true });
  rmSync(REPORTS_A, { recursive: true, force: true });
  const n1 = notesStore.addNote(draft(docPath, 1, TEXT_A1));
  notesStore.updateNoteComment(n1.note.id, REPORT_COMMENT);
  notesStore.addNote(draft(docPath, 2, TEXT_A3));
  notesStore.addNote(draft(docPath, 2, TEXT_A2, "answer"));
  const base = Date.now();
  writeNotesFile(
    readFileNotes().map((note, index) => ({
      ...note,
      createdAt: base + index * REPORT_STAMP_STEP_MS,
      updatedAt: base + index * REPORT_STAMP_STEP_MS,
    })),
  );
  return n1.note.id;
}

/** 手写期望串（三章入参 + 进度；逐字面量，不由被测函数生成）。 */
function expectedRenderA() {
  return [
    "# 阅读报告 · sample-paper.pdf",
    "",
    `> 由 PiX-Read 生成，每次导出都会覆盖。资料库：ws-a；文档：sample-paper.pdf；生成时间：<STAMP>；阅读进度：第 1 / 3 页；共 3 条（摘录 2 · AI 结论 1）。`,
    "",
    "## 1. Abstract · 第 1 页（1 条）",
    "",
    "### 第 1 页",
    "",
    `> ${TEXT_A1}`,
    "",
    `备注：${REPORT_COMMENT}`,
    "",
    "## 2. Method Overview · 第 2 页（2 条）",
    "",
    "### 第 2 页",
    "",
    `> ${TEXT_A3}`,
    "",
    "---",
    "",
    "### 第 2 页 · AI 结论",
    "",
    `> ${TEXT_A2}`,
  ].join("\n") + "\n";
}

/** 子目录 + 无章节 + 无进度的手写期望串。 */
function expectedArchiveA() {
  return [
    "# 阅读报告 · older-paper.pdf",
    "",
    `> 由 PiX-Read 生成，每次导出都会覆盖。资料库：ws-a；文档：archive/older-paper.pdf；生成时间：<STAMP>；共 1 条（摘录 1 · AI 结论 0）。`,
    "",
    "## 第 7 页（1 条）",
    "",
    "### 第 7 页",
    "",
    `> ${ARCHIVE_TEXT}`,
  ].join("\n") + "\n";
}

function runUndoRoundtrip() {
  const G = "undo-roundtrip";
  group(G);
  libraryRoot.setLibraryRoot(WS_A);

  const addOk = [];
  const relayFlags = [];
  const added = [];
  for (const item of [draft(DOC_A, 1, TEXT_A1), draft(DOC_A, 2, TEXT_A2, "answer"), draft(DOC_A, 7, TEXT_A3)]) {
    const result = notesStore.addNote(item);
    addOk.push(result.success === true);
    relayFlags.push(relayMatchesFile(result));
    added.push(result.note);
  }
  const loaded1 = notesStore.loadNotes();
  const orderOk = loaded1.notes.length === 3 && sameIds(idsOf(loaded1.notes), idsOf(added));
  const relOk = loaded1.notes.every((note) => note.docPath === "sample-paper.pdf");
  check(
    G,
    1,
    "addNote ×3 成功、回传 3 条、id 序 = 新增顺序、docPath 存为相对路径",
    addOk.every(Boolean) && orderOk && relOk,
    JSON.stringify({ addOk, loaded: idsOf(loaded1.notes), added: idsOf(added), docPaths: loaded1.notes.map((note) => note.docPath) }),
  );

  const beforeDeleteBytes = readFileSync(NOTES_A);
  const beforeDeleteHash = sha256(beforeDeleteBytes);
  const a2 = added[1];
  const del = notesStore.deleteNote(a2.id);
  relayFlags.push(relayMatchesFile(del));
  const delFieldsOk =
    !!del.note &&
    del.note.id === a2.id &&
    del.note.page === a2.page &&
    del.note.text === a2.text &&
    del.note.kind === a2.kind &&
    del.note.docPath === a2.docPath;
  check(G, 2, "deleteNote 成功后回传条目逐字段等于目标", del.success === true && delFieldsOk, JSON.stringify(del));

  const afterDeleteNotes = readFileNotes();
  check(
    G,
    3,
    "删除后文件无该 id、条数 2、sha256 ≠ 删除前",
    !idsOf(afterDeleteNotes).includes(a2.id) && afterDeleteNotes.length === 2 && sha256(readFileSync(NOTES_A)) !== beforeDeleteHash,
    JSON.stringify({ ids: idsOf(afterDeleteNotes), same: sha256(readFileSync(NOTES_A)) === beforeDeleteHash }),
  );

  const restore = notesStore.restoreNote(a2.id);
  relayFlags.push(relayMatchesFile(restore));
  check(G, 4, "restoreNote 成功", restore.success === true, JSON.stringify(restore));

  check(
    G,
    5,
    "还原后文件逐字节等于删除前（原下标插回、时间戳未刷新）",
    sha256(readFileSync(NOTES_A)) === beforeDeleteHash,
    JSON.stringify({ before: beforeDeleteHash, after: sha256(readFileSync(NOTES_A)) }),
  );

  const loaded6 = notesStore.loadNotes();
  const seqBack = sameIds(idsOf(loaded6.notes), idsOf(added));
  relayFlags.push(relayMatchesFile(loaded6));
  check(G, 6, "还原后回传列表 id 序回复删除前序列", seqBack, JSON.stringify(idsOf(loaded6.notes)));

  const again = notesStore.restoreNote(a2.id);
  check(
    G,
    7,
    "再次还原同一 id ⇒ not-found + 逐字「没有可撤销的删除」（槽已清）",
    again.success === false && again.code === "not-found" && again.error === "没有可撤销的删除",
    JSON.stringify(again),
  );

  check(
    G,
    8,
    "每一步「主进程回传列表 === 文件所存」（新增 / 删除 / 还原逐条相等）",
    relayFlags.every(Boolean) && relayFlags.length === 6,
    JSON.stringify({ relayFlags, file: idsOf(readFileNotes()) }),
  );
}

function runUndoFailures() {
  const G = "undo-failures";
  group(G);
  libraryRoot.setLibraryRoot(WS_A);

  const beforeBytes1 = readFileSync(NOTES_A);
  const noSlot = notesStore.restoreNote("missing-id");
  check(
    G,
    1,
    "无槽时还原 ⇒ not-found + 逐字「没有可撤销的删除」+ 零写盘",
    noSlot.success === false &&
      noSlot.code === "not-found" &&
      noSlot.error === "没有可撤销的删除" &&
      sha256(readFileSync(NOTES_A)) === sha256(beforeBytes1),
    JSON.stringify(noSlot),
  );

  const fileNotes = readFileNotes();
  const a1 = fileNotes[0];
  const lastId = fileNotes[fileNotes.length - 1].id;
  const bytesBeforeDelete = readFileSync(NOTES_A);
  const hashBeforeDelete = sha256(bytesBeforeDelete);
  const delA1 = notesStore.deleteNote(a1.id);
  const bytesAfterDelete = readFileSync(NOTES_A);
  const wrongId = notesStore.restoreNote(lastId);
  check(
    G,
    2,
    "槽内 id 不符 ⇒ not-found + 逐字文案 + 零写盘",
    delA1.success === true &&
      wrongId.success === false &&
      wrongId.code === "not-found" &&
      wrongId.error === "没有可撤销的删除" &&
      sha256(readFileSync(NOTES_A)) === sha256(bytesAfterDelete),
    JSON.stringify(wrongId),
  );

  libraryRoot.setLibraryRoot(WS_B);
  const crossRoot = notesStore.restoreNote(a1.id);
  const bDirExists = existsSync(PIX_READ_B);
  check(
    G,
    3,
    "跨工作区还原 ⇒ not-found + 逐字文案 + A 库字节不变 + B 库 .pix-read 不存在",
    crossRoot.success === false &&
      crossRoot.code === "not-found" &&
      crossRoot.error === "没有可撤销的删除" &&
      sha256(readFileSync(NOTES_A)) === sha256(bytesAfterDelete) &&
      bDirExists === false,
    JSON.stringify({ crossRoot, bDirExists }),
  );

  libraryRoot.setLibraryRoot(WS_A);
  const backRestore = notesStore.restoreNote(a1.id);
  check(
    G,
    4,
    "切回 A 库后同一槽仍可还原且字节回复删除前（失败不清槽）",
    backRestore.success === true && sha256(readFileSync(NOTES_A)) === hashBeforeDelete,
    JSON.stringify({ restore: backRestore.success, bytes: sha256(readFileSync(NOTES_A)) }),
  );

  // 同 id 已被写回：invalid-input + 「该笔记已重新存在，无法撤销」
  notesStore.deleteNote(a1.id);
  const occupied = readFileNotes();
  occupied.splice(0, 0, a1);
  writeNotesFile(occupied);
  const bytesBefore5 = readFileSync(NOTES_A);
  const exists = notesStore.restoreNote(a1.id);
  const sameIdCount = readFileNotes().filter((note) => note.id === a1.id).length;
  check(
    G,
    5,
    "同 id 已存在 ⇒ invalid-input + 逐字「该笔记已重新存在，无法撤销」+ 零写盘 + 该 id 恰 1 条",
    exists.success === false &&
      exists.code === "invalid-input" &&
      exists.error === "该笔记已重新存在，无法撤销" &&
      sha256(readFileSync(NOTES_A)) === sha256(bytesBefore5) &&
      sameIdCount === 1,
    JSON.stringify({ exists, sameIdCount }),
  );

  // 同去重键被占：invalid-input + 「该笔记内容已重新存在，无法撤销」
  notesStore.deleteNote(a1.id);
  const dup = readFileNotes();
  dup.splice(0, 0, { ...a1, id: "smoke-dup-id" });
  writeNotesFile(dup);
  const bytesBefore6 = readFileSync(NOTES_A);
  const dupKey = notesStore.restoreNote(a1.id);
  const keyCount = readFileNotes().filter(
    (note) => note.docPath === a1.docPath && note.page === a1.page && note.kind === a1.kind && note.text === a1.text,
  ).length;
  check(
    G,
    6,
    "同去重键被占 ⇒ invalid-input + 逐字「该笔记内容已重新存在，无法撤销」+ 零写盘 + 该键恰 1 条",
    dupKey.success === false &&
      dupKey.code === "invalid-input" &&
      dupKey.error === "该笔记内容已重新存在，无法撤销" &&
      sha256(readFileSync(NOTES_A)) === sha256(bytesBefore6) &&
      keyCount === 1,
    JSON.stringify({ dupKey, keyCount }),
  );

  // 写入失败注入：notes.json.tmp 预置为目录 ⇒ write-failed + 槽保留 + 原字节不变
  rmSync(NOTES_A, { force: true });
  const fresh7 = notesStore.addNote(draft(DOC_A, 9, "smoke-write-failed-entry"));
  const bytesBeforeDelete7 = readFileSync(NOTES_A);
  notesStore.deleteNote(fresh7.note.id);
  const bytesAfterDelete7 = readFileSync(NOTES_A);
  mkdirSync(TMP_INJECT, { recursive: true });
  const writeFailed = notesStore.restoreNote(fresh7.note.id);
  const injectKept = existsSync(TMP_INJECT);
  const bytesDuringFailure = readFileSync(NOTES_A);
  rmSync(TMP_INJECT, { recursive: true, force: true });
  const retry7 = notesStore.restoreNote(fresh7.note.id);
  const restoredBytes7 = readFileSync(NOTES_A);
  check(
    G,
    7,
    "写失败注入 ⇒ write-failed + 逐字「笔记写入失败」+ 原字节不变 + 槽保留；清理后重试成功且字节回复删除前",
    writeFailed.success === false &&
      writeFailed.code === "write-failed" &&
      writeFailed.error === "笔记写入失败" &&
      sha256(bytesDuringFailure) === sha256(bytesAfterDelete7) &&
      injectKept === true &&
      retry7.success === true &&
      sha256(restoredBytes7) === sha256(bytesBeforeDelete7),
    JSON.stringify({
      writeFailed,
      injectKept,
      bytesSame: sha256(bytesDuringFailure) === sha256(bytesAfterDelete7),
      retry: retry7.success,
      retryBytesSame: sha256(restoredBytes7) === sha256(bytesBeforeDelete7),
    }),
  );

  // 外部删除 notes.json：还原成功并写出「只含该条」的文件（既有语义）
  rmSync(NOTES_A, { force: true });
  const fresh8 = notesStore.addNote(draft(DOC_A, 11, "smoke-missing-file-entry"));
  notesStore.deleteNote(fresh8.note.id);
  rmSync(NOTES_A, { force: true });
  const missingRestore = notesStore.restoreNote(fresh8.note.id);
  const afterMissing = existsSync(NOTES_A) ? readFileNotes() : [];
  check(
    G,
    8,
    "外部删文件后还原 ⇒ 成功且写出只含该条的文件（既有语义，非本轮回归）",
    missingRestore.success === true && afterMissing.length === 1 && afterMissing[0].id === fresh8.note.id,
    JSON.stringify({ restore: missingRestore.success, afterMissing: idsOf(afterMissing) }),
  );
}

function runUndoSlotLifecycle() {
  const G = "undo-slot-lifecycle";
  group(G);
  libraryRoot.setLibraryRoot(WS_A);

  rmSync(NOTES_A, { force: true });
  const n1 = notesStore.addNote(draft(DOC_A, 1, "lifecycle-1-a")).note;
  const n2 = notesStore.addNote(draft(DOC_A, 2, "lifecycle-1-b")).note;
  notesStore.deleteNote(n1.id);
  const comment = notesStore.updateNoteComment(n2.id, "smoke-comment");
  const n3 = notesStore.addNote(draft(DOC_A, 3, "lifecycle-1-c")).note;
  const restore1 = notesStore.restoreNote(n1.id);
  const file1 = readFileNotes();
  check(
    G,
    1,
    "备注 + 新增都不清槽；还原后新条目与备注保留、按原下标插回",
    restore1.success === true &&
      comment.success === true &&
      idsOf(file1)[0] === n1.id &&
      file1.some((note) => note.id === n2.id && note.comment === "smoke-comment") &&
      file1.some((note) => note.id === n3.id),
    JSON.stringify({ restore: restore1.success, comment: comment.success, order: idsOf(file1) }),
  );

  const n4 = notesStore.addNote(draft(DOC_A, 4, "lifecycle-2-a")).note;
  notesStore.deleteNote(n4.id);
  const delMissing = notesStore.deleteNote("missing-id");
  const restore2 = notesStore.restoreNote(n4.id);
  check(
    G,
    2,
    "失败的 deleteNote ⇒ not-found 且不清槽（随后原槽还原成功）",
    delMissing.success === false && delMissing.code === "not-found" && restore2.success === true,
    JSON.stringify({ delMissing, restore2: restore2.success }),
  );

  const n5 = notesStore.addNote(draft(DOC_A, 5, "lifecycle-3-a")).note;
  const n6 = notesStore.addNote(draft(DOC_A, 6, "lifecycle-3-b")).note;
  notesStore.deleteNote(n5.id);
  notesStore.deleteNote(n6.id);
  const restoreA = notesStore.restoreNote(n5.id);
  const restoreB = notesStore.restoreNote(n6.id);
  check(
    G,
    3,
    "连删 A、B 后先还原 A ⇒ not-found；还原 B ⇒ 成功（覆盖式只存最近一条）",
    restoreA.success === false && restoreA.code === "not-found" && restoreB.success === true,
    JSON.stringify({ restoreA, restoreB }),
  );

  const n7 = notesStore.addNote(draft(DOC_A, 7, "lifecycle-4-a")).note;
  notesStore.deleteNote(n7.id);
  writeFileSync(NOTES_A, "not json", "utf8");
  const reset = notesStore.resetCorruptNotes();
  const backups = readdirSync(PIX_READ_A).filter((name) => /^notes\.json\.corrupt-\d{8}-\d{6}(-\d+)?$/.test(name));
  const rebuiltText = readFileSync(NOTES_A, "utf8");
  const slotCleared = notesStore.restoreNote(n7.id);
  check(
    G,
    4,
    "resetCorruptNotes 成功 ⇒ 槽已清 + 备份存在 + 重建为 2 空格缩进的空库",
    reset.success === true &&
      backups.length === 1 &&
      basename(backups[0]).startsWith("notes.json.corrupt-") &&
      rebuiltText === serialize([]) &&
      slotCleared.success === false &&
      slotCleared.code === "not-found",
    JSON.stringify({ reset: reset.success, backups, rebuiltText, slotCleared: slotCleared.code }),
  );

  const n8 = notesStore.addNote(draft(DOC_A, 8, "lifecycle-5-a")).note;
  notesStore.deleteNote(n8.id);
  const notCorrupt = notesStore.resetCorruptNotes();
  const restore5 = notesStore.restoreNote(n8.id);
  check(
    G,
    5,
    "文件未损坏时 resetCorruptNotes ⇒ not-corrupt + 逐字「笔记文件未损坏，无需重建」+ 不清槽",
    notCorrupt.success === false &&
      notCorrupt.code === "not-corrupt" &&
      notCorrupt.error === "笔记文件未损坏，无需重建" &&
      restore5.success === true,
    JSON.stringify({ notCorrupt, restore5: restore5.success }),
  );

  const finalLoad = notesStore.loadNotes();
  check(
    G,
    6,
    "组内每一步「主进程回传列表 === 文件所存」（收尾复查）",
    relayMatchesFile(finalLoad),
    JSON.stringify({ result: idsOf(finalLoad.notes), file: idsOf(readFileNotes()) }),
  );

  // F9（新增，追加在 #1–#6 之后；既有断言逐字未动）：copy-first 逃生口
  writeFileSync(NOTES_A, "not json", "utf8");
  const corruptBytes7 = readFileSync(NOTES_A);
  const resetCopy = notesStore.resetCorruptNotes();
  const backupPath7 = resetCopy.backupPath;
  const backupExists7 = typeof backupPath7 === "string" && backupPath7.length > 0 && existsSync(backupPath7);
  check(
    G,
    7,
    "F9 成功路径：backupPath 非空 + 备份存在且字节 === 损坏前字节 + 备份名合规 + 原路径重建为空库",
    resetCopy.success === true &&
      backupExists7 &&
      readFileSync(backupPath7).equals(corruptBytes7) &&
      /^notes\.json\.corrupt-\d{8}-\d{6}(-\d+)?$/.test(basename(backupPath7)) &&
      readFileSync(NOTES_A, "utf8") === serialize([]),
    JSON.stringify({
      success: resetCopy.success,
      backupPath: backupPath7,
      backupExists: backupExists7,
      rebuilt: readFileSync(NOTES_A, "utf8"),
    }),
  );

  // 写失败注入（notes.json.tmp 预置为目录）：copy 语义下原文件必须仍在、备份必须存在
  writeFileSync(NOTES_A, "not json again", "utf8");
  const corruptBytes8 = readFileSync(NOTES_A);
  mkdirSync(TMP_INJECT, { recursive: true });
  const resetWriteFail = notesStore.resetCorruptNotes();
  const keptBytes8 = readFileSync(NOTES_A);
  const injectExists8 = existsSync(TMP_INJECT);
  rmSync(TMP_INJECT, { recursive: true, force: true });
  const failBackupPath = resetWriteFail.backupPath;
  const failBackupExists = typeof failBackupPath === "string" && existsSync(failBackupPath);
  check(
    G,
    8,
    "F9 写失败路径：success:false + 原文件仍在且字节不变（copy 语义）+ backupPath 非空且存在",
    resetWriteFail.success === false &&
      resetWriteFail.code === "write-failed" &&
      injectExists8 === true &&
      keptBytes8.equals(corruptBytes8) &&
      failBackupExists &&
      readFileSync(failBackupPath).equals(corruptBytes8),
    JSON.stringify({
      resetWriteFail,
      injectExists: injectExists8,
      keptBytesSame: keptBytes8.equals(corruptBytes8),
      backupExists: failBackupExists,
    }),
  );
  // 收尾：把文件恢复为空库，后续组的夹具写入不受本次注入影响
  writeNotesFile([]);
}

function runExportAndEmpty() {
  const G = "export-and-empty";
  group(G);

  libraryRoot.setLibraryRoot(WS_B);
  const emptyExport = notesStore.exportNotesMarkdown();
  check(
    G,
    1,
    "空库导出 ⇒ success=false + code=empty + 逐字「暂无笔记可导出」+ notes.md 不存在",
    emptyExport.success === false &&
      emptyExport.code === "empty" &&
      emptyExport.error === "暂无笔记可导出" &&
      existsSync(join(PIX_READ_B, "notes.md")) === false,
    JSON.stringify(emptyExport),
  );

  libraryRoot.setLibraryRoot(WS_A);
  rmSync(NOTES_A, { force: true });
  notesStore.addNote(draft(DOC_A, 1, "export-entry-1"));
  notesStore.addNote(draft(DOC_A, 2, "export-entry-2", "answer"));
  const beforeExportBytes = readFileSync(NOTES_A);
  const exported = notesStore.exportNotesMarkdown();
  const mdText = existsSync(NOTES_MD_A) ? readFileSync(NOTES_MD_A, "utf8") : "";
  const pathOk = exported.success === true && relative(PIX_READ_A, exported.filePath) === "notes.md";
  const titleOk = mdText.includes("## sample-paper.pdf（2 条）");
  const quotesOk = mdText.includes("> export-entry-1") && mdText.includes("> export-entry-2");
  check(
    G,
    2,
    "2 条导出 ⇒ success + count=2 + 路径以 .pix-read/notes.md 结尾 + 组标题与两条引用行",
    pathOk && exported.count === 2 && titleOk && quotesOk,
    JSON.stringify({ exported, pathOk, titleOk, quotesOk }),
  );

  check(
    G,
    3,
    "导出不改 notes.json 字节",
    sha256(readFileSync(NOTES_A)) === sha256(beforeExportBytes),
    JSON.stringify({ before: sha256(beforeExportBytes), after: sha256(readFileSync(NOTES_A)) }),
  );

  check(
    G,
    4,
    ".pix-read/ 之外零写盘（ws-a 一级条目只有 .pix-read；ws-b 为空）",
    JSON.stringify(readdirSync(WS_A)) === JSON.stringify([".pix-read"]) && JSON.stringify(readdirSync(WS_B)) === JSON.stringify([]),
    JSON.stringify({ wsA: readdirSync(WS_A), wsB: readdirSync(WS_B) }),
  );
}

function runReportRender() {
  const G = "report-render";
  group(G);
  libraryRoot.setLibraryRoot(WS_A);
  seedReportNotes(DOC_A);

  const first = notesStore.exportDocumentReport({ docFilePath: DOC_A, chapters: SAMPLE_CHAPTERS, progress: PROGRESS_3 });
  const raw1 = existsSync(REPORT_A) ? readFileSync(REPORT_A, "utf8") : "";
  const text1 = normalizeStamp(raw1);
  const stampHits = raw1.match(new RegExp(STAMP_RE.source, "g")) || [];
  const stampValue = stampHits.length === 1 ? stampHits[0].replace("生成时间：", "") : "";
  check(
    G,
    1,
    "3 条 + 三章入参 + 进度 ⇒ 成功且全文（时间戳归一化）逐字节等于手写期望串；生成时间段恰 1 次且形如 YYYY-MM-DD HH:mm:ss",
    first.success === true &&
      text1 === expectedRenderA() &&
      stampHits.length === 1 &&
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stampValue),
    JSON.stringify({ result: first, stampHits: stampHits.length, stampValue, text: text1 }),
  );

  const lines1 = text1.split("\n");
  const meta1 = lines1[2] || "";
  check(
    G,
    2,
    "头部逐字段：第 1 行逐字；元信息行含 资料库：ws-a / 文档：sample-paper.pdf / 阅读进度：第 1 / 3 页 / 共 3 条（摘录 2 · AI 结论 1）",
    lines1[0] === "# 阅读报告 · sample-paper.pdf" &&
      meta1.includes("资料库：ws-a") &&
      meta1.includes("文档：sample-paper.pdf") &&
      meta1.includes("阅读进度：第 1 / 3 页") &&
      meta1.includes("共 3 条（摘录 2 · AI 结论 1）"),
    JSON.stringify({ line1: lines1[0], meta: meta1 }),
  );

  const heads1 = lines1.filter((line) => line.startsWith("## "));
  check(
    G,
    3,
    "空组不渲染：无 2.2 Positional prior；^## 行恰 2 条且逐字为两个章节组标题",
    text1.includes("## 2.2 Positional prior") === false &&
      JSON.stringify(heads1) ===
        JSON.stringify(["## 1. Abstract · 第 1 页（1 条）", "## 2. Method Overview · 第 2 页（2 条）"]),
    JSON.stringify({ heads: heads1 }),
  );

  notesStore.addNote(draft(DOC_A, 9, OUT_OF_RANGE_TEXT));
  const withRange = notesStore.exportDocumentReport({ docFilePath: DOC_A, chapters: SAMPLE_CHAPTERS, progress: PROGRESS_3 });
  const text4 = normalizeStamp(readFileSync(REPORT_A, "utf8"));
  const lines4 = text4.split("\n");
  const heads4 = lines4.filter((line) => line.startsWith("## "));
  const meta4 = lines4[2] || "";
  check(
    G,
    4,
    "兜底组：p9 笔记 ⇒ ^## 最后一条逐字「未归入章节（1 条）」；正文出现恰 1 次；统计 共 4 条（摘录 3 · AI 结论 1）；既有两个组不变",
    withRange.success === true &&
      heads4.length === 3 &&
      heads4[heads4.length - 1] === "## 未归入章节（1 条）" &&
      text4.split(OUT_OF_RANGE_TEXT).length - 1 === 1 &&
      meta4.includes("共 4 条（摘录 3 · AI 结论 1）") &&
      JSON.stringify(heads4.slice(0, 2)) ===
        JSON.stringify(["## 1. Abstract · 第 1 页（1 条）", "## 2. Method Overview · 第 2 页（2 条）"]),
    JSON.stringify({ result: withRange, heads: heads4, outOfRangeHits: text4.split(OUT_OF_RANGE_TEXT).length - 1, meta: meta4 }),
  );

  seedReportNotes(DOC_A);
  const noChapters = notesStore.exportDocumentReport({ docFilePath: DOC_A, chapters: [], progress: PROGRESS_3 });
  const text5 = normalizeStamp(readFileSync(REPORT_A, "utf8"));
  const lines5 = text5.split("\n");
  const heads5 = lines5.filter((line) => line.startsWith("## "));
  check(
    G,
    5,
    "chapters: [] ⇒ ^## 行集合逐字为两个按页组（页升序）；全文不含「未归入章节」、不含「 · 第 」",
    noChapters.success === true &&
      JSON.stringify(heads5) === JSON.stringify(["## 第 1 页（1 条）", "## 第 2 页（2 条）"]) &&
      text5.includes("未归入章节") === false &&
      text5.includes(" · 第 ") === false,
    JSON.stringify({ result: noChapters, heads: heads5 }),
  );

  const seps = text5.split("\n\n---\n\n").length - 1;
  check(
    G,
    6,
    "条目与分隔：同页先摘录后结论；`### 第 2 页` / `### 第 2 页 · AI 结论` 各 1 次；恰 1 处空行分隔线；末尾恰一个换行；无行尾空格",
    text5.indexOf(TEXT_A3) >= 0 &&
      text5.indexOf(TEXT_A3) < text5.indexOf(TEXT_A2) &&
      lines5.filter((line) => line === "### 第 2 页").length === 1 &&
      lines5.filter((line) => line === "### 第 2 页 · AI 结论").length === 1 &&
      seps === 1 &&
      text5.endsWith("\n") &&
      !text5.endsWith("\n\n") &&
      lines5.every((line) => !/ $/.test(line)),
    JSON.stringify({
      idxExcerpt: text5.indexOf(TEXT_A3),
      idxAnswer: text5.indexOf(TEXT_A2),
      seps,
      tail: JSON.stringify(text5.slice(-4)),
      trailingSpaces: lines5.filter((line) => / $/.test(line)).length,
    }),
  );

  const reversed = notesStore.exportDocumentReport({
    docFilePath: DOC_A,
    chapters: [...SAMPLE_CHAPTERS, { title: "Beyond", start: 5, end: 3, label: "5" }],
    progress: PROGRESS_3,
  });
  const text7 = normalizeStamp(readFileSync(REPORT_A, "utf8"));
  const heads7 = text7.split("\n").filter((line) => line.startsWith("## "));
  check(
    G,
    7,
    "倒序范围不拒绝：追加 {start:5,end:3} ⇒ success（不是 invalid-input）、无「## Beyond」、^## 行与 #3 逐字相同",
    reversed.success === true &&
      reversed.code === undefined &&
      text7.includes("## Beyond") === false &&
      JSON.stringify(heads7) ===
        JSON.stringify(["## 1. Abstract · 第 1 页（1 条）", "## 2. Method Overview · 第 2 页（2 条）"]),
    JSON.stringify({ result: reversed, heads: heads7 }),
  );
}

function runReportFiles() {
  const G = "report-files";
  group(G);
  libraryRoot.setLibraryRoot(WS_A);
  seedReportNotes(DOC_A);

  const first = notesStore.exportDocumentReport({ docFilePath: DOC_A, chapters: SAMPLE_CHAPTERS, progress: PROGRESS_3 });
  const text1 = normalizeStamp(readFileSync(REPORT_A, "utf8"));
  check(
    G,
    1,
    "返回面：filePath 逐字等于 REPORT_A（relative 为 sample-paper.pdf.md）+ displayPath 逐字 + count === 3",
    first.success === true &&
      first.filePath === REPORT_A &&
      relative(REPORTS_A, first.filePath) === "sample-paper.pdf.md" &&
      first.displayPath === ".pix-read/reports/sample-paper.pdf.md" &&
      first.count === 3,
    JSON.stringify(first),
  );

  const addArchive = notesStore.addNote(draft(DOC_ARCHIVE, 7, ARCHIVE_TEXT));
  const sub = notesStore.exportDocumentReport({ docFilePath: DOC_ARCHIVE, chapters: [], progress: null });
  const text2 = normalizeStamp(existsSync(REPORT_ARCHIVE_A) ? readFileSync(REPORT_ARCHIVE_A, "utf8") : "");
  check(
    G,
    2,
    "子目录 + 无章节 + 无进度：displayPath 逐字、reports/archive 被创建、全文逐字节、元信息行不含阅读进度",
    addArchive.success === true &&
      sub.success === true &&
      sub.displayPath === ".pix-read/reports/archive/older-paper.pdf.md" &&
      existsSync(REPORTS_ARCHIVE_A) === true &&
      text2 === expectedArchiveA() &&
      text2.includes("阅读进度：") === false,
    JSON.stringify({ sub, text: text2 }),
  );

  writeFileSync(REPORT_A, "STALE-CONTENT\n", "utf8");
  const again1 = notesStore.exportDocumentReport({ docFilePath: DOC_A, chapters: SAMPLE_CHAPTERS, progress: PROGRESS_3 });
  const text3a = normalizeStamp(readFileSync(REPORT_A, "utf8"));
  const again2 = notesStore.exportDocumentReport({ docFilePath: DOC_A, chapters: SAMPLE_CHAPTERS, progress: PROGRESS_3 });
  const text3b = normalizeStamp(readFileSync(REPORT_A, "utf8"));
  check(
    G,
    3,
    "幂等覆盖：预置垃圾内容 ⇒ 两次导出都成功、内容逐字节等于期望、不含 STALE-CONTENT、两次归一化内容互等",
    again1.success === true &&
      again2.success === true &&
      text3a === expectedRenderA() &&
      text3b === text3a &&
      text3a.includes("STALE-CONTENT") === false,
    JSON.stringify({ first: again1.success, second: again2.success, same: text3b === text3a, text: text3a }),
  );

  rmSync(REPORTS_A, { recursive: true, force: true });
  const notesBefore = sha256(readFileSync(NOTES_A));
  const mdBefore = existsSync(NOTES_MD_A) ? sha256(readFileSync(NOTES_MD_A)) : null;
  const entriesBefore = readdirSync(PIX_READ_A).sort();
  const sideEffectFree = notesStore.exportDocumentReport({ docFilePath: DOC_A, chapters: SAMPLE_CHAPTERS, progress: PROGRESS_3 });
  const notesAfter = sha256(readFileSync(NOTES_A));
  const mdAfter = existsSync(NOTES_MD_A) ? sha256(readFileSync(NOTES_MD_A)) : null;
  const entriesAfter = readdirSync(PIX_READ_A).sort();
  const addedEntries = entriesAfter.filter((name) => !entriesBefore.includes(name));
  const removedEntries = entriesBefore.filter((name) => !entriesAfter.includes(name));
  check(
    G,
    4,
    "零副作用：notes.json / notes.md 哈希不变；.pix-read 顶级条目差恰为新增 [reports]",
    sideEffectFree.success === true &&
      notesAfter === notesBefore &&
      mdAfter === mdBefore &&
      JSON.stringify(addedEntries) === JSON.stringify(["reports"]) &&
      removedEntries.length === 0,
    JSON.stringify({
      result: sideEffectFree,
      notesSame: notesAfter === notesBefore,
      mdSame: mdAfter === mdBefore,
      addedEntries,
      removedEntries,
    }),
  );

  rmSync(REPORTS_A, { recursive: true, force: true });
  const load5 = notesStore.loadNotes();
  const add5 = notesStore.addNote(draft(DOC_ARCHIVE, 3, "post-delete add"));
  const export5 = notesStore.exportNotesMarkdown();
  const rebuilt = notesStore.exportDocumentReport({ docFilePath: DOC_A, chapters: SAMPLE_CHAPTERS, progress: PROGRESS_3 });
  const text5 = normalizeStamp(readFileSync(REPORT_A, "utf8"));
  check(
    G,
    5,
    "目录可删：删 reports 后 loadNotes / addNote（另一文档）/ exportNotesMarkdown / 报告导出全部成功，重建内容与 #1 首次逐字节相同",
    load5.success === true &&
      add5.success === true &&
      export5.success === true &&
      rebuilt.success === true &&
      text5 === text1,
    JSON.stringify({
      load: load5.success,
      add: add5.success,
      export: export5.success,
      report: rebuilt.success,
      sameAsFirst: text5 === text1,
    }),
  );
}

function runReportFailures() {
  const G = "report-failures";
  group(G);
  libraryRoot.setLibraryRoot(WS_A);
  rmSync(REPORTS_A, { recursive: true, force: true });
  seedReportNotes(DOC_A);

  libraryRoot.clearLibraryRoot();
  const noRoot = notesStore.exportDocumentReport({ docFilePath: DOC_A, chapters: [], progress: null });
  const noRootReportsExist = existsSync(REPORTS_A);
  libraryRoot.setLibraryRoot(WS_A);
  check(
    G,
    1,
    "无工作区根 ⇒ no-root + 逐字「尚未选择资料库根目录」+ 零写盘（reports 不存在）",
    noRoot.success === false &&
      noRoot.code === "no-root" &&
      noRoot.error === "尚未选择资料库根目录" &&
      noRootReportsExist === false,
    JSON.stringify({ result: noRoot, reportsExist: noRootReportsExist }),
  );

  const outside = notesStore.exportDocumentReport({ docFilePath: join(TMP, "outside", "x.pdf"), chapters: [], progress: null });
  check(
    G,
    2,
    "库外绝对路径 ⇒ outside + 逐字「该文档不在当前资料库内」+ reports 未新增条目",
    outside.success === false &&
      outside.code === "outside" &&
      outside.error === "该文档不在当前资料库内" &&
      existsSync(REPORTS_A) === false,
    JSON.stringify({ result: outside, reportsExist: existsSync(REPORTS_A) }),
  );

  const emptyDoc = notesStore.exportDocumentReport({ docFilePath: join(WS_A, "empty-doc.pdf"), chapters: [], progress: null });
  check(
    G,
    3,
    "该文档 0 条 ⇒ empty + 逐字「当前文档暂无笔记，未生成报告」+ 目录未被创建",
    emptyDoc.success === false &&
      emptyDoc.code === "empty" &&
      emptyDoc.error === "当前文档暂无笔记，未生成报告" &&
      existsSync(REPORTS_A) === false,
    JSON.stringify({ result: emptyDoc, reportsExist: existsSync(REPORTS_A) }),
  );

  const baseline = notesStore.exportDocumentReport({ docFilePath: DOC_A, chapters: SAMPLE_CHAPTERS, progress: PROGRESS_3 });
  const reportHashBefore = sha256(readFileSync(REPORT_A));
  mkdirSync(REPORT_A + ".tmp", { recursive: true });
  const tmpBlocked = notesStore.exportDocumentReport({ docFilePath: DOC_A, chapters: SAMPLE_CHAPTERS, progress: PROGRESS_3 });
  const reportHashDuring = sha256(readFileSync(REPORT_A));
  rmSync(REPORT_A + ".tmp", { recursive: true, force: true });
  const tmpRetry = notesStore.exportDocumentReport({ docFilePath: DOC_A, chapters: SAMPLE_CHAPTERS, progress: PROGRESS_3 });
  const tmpRetryText = normalizeStamp(readFileSync(REPORT_A, "utf8"));

  const addArchive = notesStore.addNote(draft(DOC_ARCHIVE, 7, ARCHIVE_TEXT));
  rmSync(REPORTS_ARCHIVE_A, { recursive: true, force: true });
  writeFileSync(REPORTS_ARCHIVE_A, "x", "utf8");
  const dirBlocked = notesStore.exportDocumentReport({ docFilePath: DOC_ARCHIVE, chapters: [], progress: null });
  rmSync(REPORTS_ARCHIVE_A, { force: true });
  const dirRetry = notesStore.exportDocumentReport({ docFilePath: DOC_ARCHIVE, chapters: [], progress: null });
  const dirRetryText = normalizeStamp(readFileSync(REPORT_ARCHIVE_A, "utf8"));
  check(
    G,
    4,
    "写失败两条注入：<报告>.tmp 预置为目录 / 目标父级预置为同名文件 ⇒ 均 write-failed + 逐字「报告写入失败」；既有报告字节不变；清理后重试成功且内容正确",
    baseline.success === true &&
      tmpBlocked.success === false &&
      tmpBlocked.code === "write-failed" &&
      tmpBlocked.error === "报告写入失败" &&
      reportHashDuring === reportHashBefore &&
      tmpRetry.success === true &&
      tmpRetryText === expectedRenderA() &&
      addArchive.success === true &&
      dirBlocked.success === false &&
      dirBlocked.code === "write-failed" &&
      dirBlocked.error === "报告写入失败" &&
      dirRetry.success === true &&
      dirRetryText === expectedArchiveA(),
    JSON.stringify({
      baseline: baseline.success,
      tmpBlocked,
      reportBytesSame: reportHashDuring === reportHashBefore,
      tmpRetry: { success: tmpRetry.success, contentOk: tmpRetryText === expectedRenderA() },
      dirBlocked,
      dirRetry: { success: dirRetry.success, contentOk: dirRetryText === expectedArchiveA() },
    }),
  );

  const reportsEntries5 = readdirSync(REPORTS_A).sort();
  const reportHash5 = sha256(readFileSync(REPORT_A));
  const bytesBefore5 = readFileSync(NOTES_A);
  writeFileSync(NOTES_A, "not json", "utf8");
  const brokenHash5 = sha256(readFileSync(NOTES_A));
  const corrupt = notesStore.exportDocumentReport({ docFilePath: DOC_A, chapters: SAMPLE_CHAPTERS, progress: PROGRESS_3 });
  const reportsEntries5After = readdirSync(REPORTS_A).sort();
  check(
    G,
    5,
    "损坏库 ⇒ corrupt + 逐字「笔记文件无法读取（文件已损坏，未被修改）」+ notes.json 字节不变 + 既有报告与目录条目集合均不变",
    corrupt.success === false &&
      corrupt.code === "corrupt" &&
      corrupt.error === "笔记文件无法读取（文件已损坏，未被修改）" &&
      sha256(readFileSync(NOTES_A)) === brokenHash5 &&
      sha256(readFileSync(REPORT_A)) === reportHash5 &&
      JSON.stringify(reportsEntries5After) === JSON.stringify(reportsEntries5),
    JSON.stringify({ result: corrupt, entries: reportsEntries5After, expectedEntries: reportsEntries5 }),
  );
  writeFileSync(NOTES_A, bytesBefore5);

  const reportsEntries6 = readdirSync(REPORTS_A).sort();
  writeFileSync(NOTES_A, '{"version": 2, "notes": []}', "utf8");
  const versionHash6 = sha256(readFileSync(NOTES_A));
  const versionUnsupported = notesStore.exportDocumentReport({ docFilePath: DOC_A, chapters: SAMPLE_CHAPTERS, progress: PROGRESS_3 });
  check(
    G,
    6,
    "版本不支持 ⇒ version-unsupported + 逐字「笔记文件版本不支持」+ notes.json 字节不变 + 零写盘",
    versionUnsupported.success === false &&
      versionUnsupported.code === "version-unsupported" &&
      versionUnsupported.error === "笔记文件版本不支持" &&
      sha256(readFileSync(NOTES_A)) === versionHash6 &&
      JSON.stringify(readdirSync(REPORTS_A).sort()) === JSON.stringify(reportsEntries6),
    JSON.stringify({ result: versionUnsupported, entries: readdirSync(REPORTS_A).sort() }),
  );
}

/**
 * notes-stat（R14，7 条）：只读指纹的返回面五情形 + 只读/幂等 + 不解析内容。
 * 前置：compileAndLoad() 收尾已 clearLibraryRoot() ⇒ #1 直接断言无根；#2 起先 setLibraryRoot(WS_A)。
 */
function runNotesStat() {
  const G = "notes-stat";
  group(G);

  libraryRoot.clearLibraryRoot();
  const noRoot = notesStore.statNotesFile();
  check(
    G,
    1,
    "无根 ⇒ no-root + 逐字「尚未选择资料库根目录」+ 事实字段全零",
    noRoot.success === false &&
      noRoot.code === "no-root" &&
      noRoot.error === "尚未选择资料库根目录" &&
      noRoot.exists === false &&
      noRoot.size === 0 &&
      noRoot.mtimeMs === 0 &&
      noRoot.hash === "",
    JSON.stringify(noRoot),
  );

  libraryRoot.setLibraryRoot(WS_A);
  rmSync(NOTES_A, { force: true });
  const missing = notesStore.statNotesFile();
  check(
    G,
    2,
    "文件缺失 ⇒ exists:false 的成功统计（hash 空、事实字段归零）且不建文件",
    missing.success === true &&
      missing.exists === false &&
      missing.hash === "" &&
      missing.size === 0 &&
      missing.mtimeMs === 0 &&
      existsSync(NOTES_A) === false,
    JSON.stringify({ result: missing, fileExists: existsSync(NOTES_A) }),
  );

  seedReportNotes(DOC_A);
  const bytes3 = readFileSync(NOTES_A);
  const stat3 = notesStore.statNotesFile();
  check(
    G,
    3,
    "正常文件 ⇒ exists:true + size = 真实字节数 + mtimeMs > 0 + hash = 原始字节 sha256",
    stat3.success === true &&
      stat3.exists === true &&
      stat3.size === bytes3.length &&
      stat3.mtimeMs > 0 &&
      stat3.hash === sha256(bytes3),
    JSON.stringify({ result: stat3, size: bytes3.length, hash: sha256(bytes3) }),
  );

  const appended = [
    ...readFileNotes(),
    {
      id: "n-stat-1",
      kind: "excerpt",
      docPath: "sample-paper.pdf",
      page: 1,
      text: STAT_NOTE_TEXT,
      comment: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
  writeFileSync(NOTES_A, serialize(appended), "utf8");
  const bytes4 = readFileSync(NOTES_A);
  const stat4 = notesStore.statNotesFile();
  check(
    G,
    4,
    "外部改写 ⇒ hash 逐字等于新字节 sha256、与改写前不同、size 随新字节变化",
    stat4.success === true &&
      stat4.exists === true &&
      stat4.hash === sha256(bytes4) &&
      stat4.hash !== stat3.hash &&
      stat4.size === bytes4.length &&
      stat4.size !== stat3.size,
    JSON.stringify({ hash: stat4.hash, hashBefore: stat3.hash, size: stat4.size, sizeBefore: stat3.size }),
  );

  const snapshot5 = () => ({
    notesJson: sha256(readFileSync(NOTES_A)),
    notesMd: existsSync(NOTES_MD_A) ? sha256(readFileSync(NOTES_MD_A)) : null,
    entries: readdirSync(PIX_READ_A).sort(),
  });
  const before5 = snapshot5();
  const stat5a = notesStore.statNotesFile();
  const stat5b = notesStore.statNotesFile();
  const after5 = snapshot5();
  check(
    G,
    5,
    "只读与幂等：连续两次 hash 相同，且 notes.json / notes.md（若存在）/ .pix-read 条目集合逐字不变",
    stat5a.hash === stat5b.hash &&
      stat5a.hash === stat4.hash &&
      after5.notesJson === before5.notesJson &&
      after5.notesMd === before5.notesMd &&
      JSON.stringify(after5.entries) === JSON.stringify(before5.entries),
    JSON.stringify({ first: stat5a, second: stat5b, before: before5, after: after5 }),
  );

  writeFileSync(NOTES_A, "not-json\n", "utf8");
  const notJsonBytes = Buffer.from("not-json\n");
  const stat6 = notesStore.statNotesFile();
  check(
    G,
    6,
    "内容损坏（非 JSON）⇒ 照常 success:true + exists:true + 原始字节 sha256（不返回 corrupt / version-unsupported）",
    stat6.success === true &&
      stat6.exists === true &&
      stat6.hash === sha256(notJsonBytes) &&
      stat6.size === notJsonBytes.length &&
      stat6.code === undefined &&
      stat6.error === undefined,
    JSON.stringify(stat6),
  );

  rmSync(NOTES_A, { force: true });
  const deleted = notesStore.statNotesFile();
  check(
    G,
    7,
    "删除后 ⇒ exists:false 的成功统计（hash 空、事实字段归零）且不重建文件",
    deleted.success === true &&
      deleted.exists === false &&
      deleted.hash === "" &&
      deleted.size === 0 &&
      deleted.mtimeMs === 0 &&
      existsSync(NOTES_A) === false,
    JSON.stringify({ result: deleted, fileExists: existsSync(NOTES_A) }),
  );
}

function runLibraryRootContainment() {
  const G = "library-root-containment";
  group(G);
  const realDir = join(TMP, "root-real");
  const linkDir = join(TMP, "root-link");
  const otherDir = join(TMP, "root-other");
  rmSync(linkDir, { recursive: true, force: true });
  mkdirSync(join(realDir, "sub"), { recursive: true });
  mkdirSync(otherDir, { recursive: true });
  writeFileSync(join(realDir, "doc.pdf"), "%PDF smoke\n", "utf8");
  // 目录联接（Windows 免管理员；与 %TEMP% 探针的 mklink /J 同物）
  symlinkSync(realDir, linkDir, "junction");

  // F4-a/b：库根 = 目录联接时，联接路径与真实路径两种访问都必须判为库内
  libraryRoot.setLibraryRoot(linkDir);
  check(
    G,
    1,
    "F4-a/b 联接根：经联接路径访问已存在文件 = true，经真实路径访问 = true",
    libraryRoot.isLibraryFilePath(join(linkDir, "doc.pdf")) === true &&
      libraryRoot.isLibraryFilePath(join(realDir, "doc.pdf")) === true,
    JSON.stringify({
      viaLink: libraryRoot.isLibraryFilePath(join(linkDir, "doc.pdf")),
      viaReal: libraryRoot.isLibraryFilePath(join(realDir, "doc.pdf")),
    }),
  );
  check(
    G,
    2,
    "F4-c 联接根：兄弟目录与 ../ 逃逸 = false",
    libraryRoot.isLibraryFilePath(join(otherDir, "x.pdf")) === false &&
      libraryRoot.isLibraryFilePath(join(linkDir, "..", "root-other", "x.pdf")) === false &&
      libraryRoot.isLibraryFilePath(join(linkDir, "..", "..", "escape.pdf")) === false,
    JSON.stringify({
      sibling: libraryRoot.isLibraryFilePath(join(otherDir, "x.pdf")),
      dotdot: libraryRoot.isLibraryFilePath(join(linkDir, "..", "root-other", "x.pdf")),
      escape: libraryRoot.isLibraryFilePath(join(linkDir, "..", "..", "escape.pdf")),
    }),
  );
  check(
    G,
    3,
    "F4-d 联接根：不存在的库内路径（字面/联接根下）= true",
    libraryRoot.isLibraryFilePath(join(linkDir, "missing.pdf")) === true &&
      libraryRoot.isLibraryFilePath(join(linkDir, "sub", "missing.pdf")) === true,
    JSON.stringify({
      top: libraryRoot.isLibraryFilePath(join(linkDir, "missing.pdf")),
      sub: libraryRoot.isLibraryFilePath(join(linkDir, "sub", "missing.pdf")),
    }),
  );

  // F19：isLibraryDirAllowed（library-list 专用，额外放行库根自身）与 isLibraryFilePath 的严格语义
  check(
    G,
    4,
    "F19-1 isLibraryDirAllowed：库根/根内子目录/真实路径 = true，兄弟与 ../ 逃逸 = false",
    libraryRoot.isLibraryDirAllowed(linkDir) === true &&
      libraryRoot.isLibraryDirAllowed(join(linkDir, "sub")) === true &&
      libraryRoot.isLibraryDirAllowed(realDir) === true &&
      libraryRoot.isLibraryDirAllowed(otherDir) === false &&
      libraryRoot.isLibraryDirAllowed(join(linkDir, "..", "root-other")) === false,
    JSON.stringify({
      root: libraryRoot.isLibraryDirAllowed(linkDir),
      sub: libraryRoot.isLibraryDirAllowed(join(linkDir, "sub")),
      real: libraryRoot.isLibraryDirAllowed(realDir),
      sibling: libraryRoot.isLibraryDirAllowed(otherDir),
      dotdot: libraryRoot.isLibraryDirAllowed(join(linkDir, "..", "root-other")),
    }),
  );
  check(
    G,
    5,
    "F19-2 isLibraryFilePath 保留严格语义：库根自身 = false（普通根与联接根均如此）",
    libraryRoot.isLibraryFilePath(linkDir) === false &&
      libraryRoot.isLibraryFilePath(join(linkDir, "doc.pdf")) === true,
    JSON.stringify({
      selfViaLink: libraryRoot.isLibraryFilePath(linkDir),
      docViaLink: libraryRoot.isLibraryFilePath(join(linkDir, "doc.pdf")),
    }),
  );
  libraryRoot.setLibraryRoot(realDir);
  check(
    G,
    6,
    "F4-e 普通目录根行为不变：内含 true / 根自身与兄弟 false / 不存在的库内路径 true",
    libraryRoot.isLibraryFilePath(join(realDir, "doc.pdf")) === true &&
      libraryRoot.isLibraryFilePath(join(realDir, "sub", "inner.pdf")) === true &&
      libraryRoot.isLibraryFilePath(realDir) === false &&
      libraryRoot.isLibraryFilePath(otherDir) === false &&
      libraryRoot.isLibraryFilePath(join(realDir, "..", "escape.pdf")) === false &&
      libraryRoot.isLibraryDirAllowed(realDir) === true,
    JSON.stringify({
      doc: libraryRoot.isLibraryFilePath(join(realDir, "doc.pdf")),
      inner: libraryRoot.isLibraryFilePath(join(realDir, "sub", "inner.pdf")),
      self: libraryRoot.isLibraryFilePath(realDir),
      other: libraryRoot.isLibraryFilePath(otherDir),
      escape: libraryRoot.isLibraryFilePath(join(realDir, "..", "escape.pdf")),
      dirAllowed: libraryRoot.isLibraryDirAllowed(realDir),
    }),
  );
  libraryRoot.clearLibraryRoot();
  check(
    G,
    7,
    "F19-3 无根：isLibraryDirAllowed / isLibraryFilePath 均恒 false",
    libraryRoot.isLibraryDirAllowed(realDir) === false && libraryRoot.isLibraryFilePath(join(realDir, "doc.pdf")) === false,
    JSON.stringify({
      dirAllowed: libraryRoot.isLibraryDirAllowed(realDir),
      fileAllowed: libraryRoot.isLibraryFilePath(join(realDir, "doc.pdf")),
    }),
  );
  // 恢复为 A 库根：后续组自行设根，这里只保证不把「无根」留给别人
  libraryRoot.setLibraryRoot(WS_A);
}

function runReaderStateStore() {
  const G = "reader-state-store";
  group(G);
  libraryRoot.setLibraryRoot(WS_A);
  const STATE_A = join(PIX_READ_A, "reader-state.json");
  const warns = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const line = args.map((value) => String(value)).join(" ");
    if (line.includes("[reader-state]")) warns.push(line);
  };
  try {
    // F12-a：missing 不再是降级，不得产生任何 [reader-state] warn
    rmSync(STATE_A, { recursive: true, force: true });
    warns.length = 0;
    const missing = readerStateStore.loadReaderState();
    check(
      G,
      1,
      "F12-a missing ⇒ success:true + degraded:false + 无 reason/error + warn 计数 0",
      missing.success === true &&
        missing.degraded === false &&
        missing.reason === undefined &&
        Object.keys(missing.state.documents).length === 0 &&
        warns.length === 0,
      JSON.stringify({ result: missing, warns }),
    );

    // F12-b/e：corrupt ⇒ load 降级恰 1 条 warn；save 先 copy-first 备份再重建（成功）
    writeFileSync(STATE_A, '{\n  "version": 1,\n  "lastDocPath": "sample-paper.pdf",\n  "documents": {', "utf8");
    const corruptBytes = readFileSync(STATE_A);
    warns.length = 0;
    const corrupt = readerStateStore.loadReaderState();
    const corruptWarns = warns.length;
    const savedCorrupt = readerStateStore.saveReaderState({ docFilePath: DOC_A, page: 2, scale: 1.5 });
    const backups = readdirSync(PIX_READ_A).filter((name) => name.startsWith("reader-state.json.corrupt-"));
    check(
      G,
      2,
      "F12-b corrupt ⇒ degraded:true + warn 1 + 备份字节 === 损坏前字节 + save 成功且条目已重建",
      corrupt.success === true &&
        corrupt.degraded === true &&
        corrupt.reason === "corrupt" &&
        corruptWarns === 1 &&
        backups.length === 1 &&
        readFileSync(join(PIX_READ_A, backups[0])).equals(corruptBytes) &&
        savedCorrupt.success === true &&
        savedCorrupt.state.documents["sample-paper.pdf"].page === 2,
      JSON.stringify({ corrupt, corruptWarns, backups, saved: savedCorrupt.success }),
    );
    check(
      G,
      3,
      "F12-e 备份名匹配 /^reader-state\.json\.corrupt-\d{8}-\d{6}(-\d+)?$/",
      backups.length === 1 && /^reader-state\.json\.corrupt-\d{8}-\d{6}(-\d+)?$/.test(backups[0]),
      JSON.stringify(backups),
    );

    // F12-c：version:2 ⇒ load 降级；save 拒写且原文件字节不变
    writeFileSync(STATE_A, `${JSON.stringify({ version: 2, lastDocPath: null, documents: {} }, null, 2)}\n`, "utf8");
    const v2Bytes = readFileSync(STATE_A);
    warns.length = 0;
    const v2Load = readerStateStore.loadReaderState();
    const v2Save = readerStateStore.saveReaderState({ docFilePath: DOC_A, page: 3, scale: 1.1 });
    check(
      G,
      4,
      "F12-c version:2 ⇒ load degraded + save 拒写（success:false、error 逐字「阅读状态文件版本不支持（未写入）」）且文件 sha256 不变",
      v2Load.success === true &&
        v2Load.degraded === true &&
        v2Load.reason === "version-unsupported" &&
        v2Save.success === false &&
        v2Save.code === undefined &&
        v2Save.error === "阅读状态文件版本不支持（未写入）" &&
        sha256(readFileSync(STATE_A)) === sha256(v2Bytes),
      JSON.stringify({ v2Load, v2Save, same: sha256(readFileSync(STATE_A)) === sha256(v2Bytes) }),
    );

    // F12-d：read-failed 注入（文件位置预置为目录）⇒ load 降级 + save 拒写（回归）
    rmSync(STATE_A, { force: true });
    mkdirSync(STATE_A, { recursive: true });
    warns.length = 0;
    const rfLoad = readerStateStore.loadReaderState();
    const rfSave = readerStateStore.saveReaderState({ docFilePath: DOC_A, page: 1, scale: 1 });
    check(
      G,
      5,
      "F12-d read-failed ⇒ load degraded:true + save 拒写（code=read-failed，回归）",
      rfLoad.success === true && rfLoad.degraded === true && rfLoad.reason === "read-failed" && rfSave.success === false && rfSave.code === "read-failed",
      JSON.stringify({ rfLoad, rfSave }),
    );
    rmSync(STATE_A, { recursive: true, force: true });
  } finally {
    console.warn = originalWarn;
  }
}

function compileAndLoad() {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(WS_A, { recursive: true });
  mkdirSync(WS_B, { recursive: true });
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
    },
    files: [
      join(REPO_DIR, "pix", "src", "main", "notes-store.ts"),
      join(REPO_DIR, "pix", "src", "main", "library-root.ts"),
      join(REPO_DIR, "pix", "src", "main", "reader-state-store.ts"),
    ],
  };
  writeFileSync(TSCONFIG, JSON.stringify(config, null, 2), "utf8");

  const compile = spawnSync(process.execPath, [TSC_JS, "-p", TSCONFIG], { cwd: PIX_DIR, encoding: "utf8" });
  if (compile.status !== 0) {
    fail(`typescript 编译失败（status=${compile.status}），不进入断言`);
    console.error(compile.stdout || "");
    console.error(compile.stderr || "");
    return false;
  }

  const require = createRequire(import.meta.url);
  const required = ["main/notes-store.js", "main/library-root.js", "main/reader-state-store.js"];
  const allowed = new Set([...required, "shared/types.js"]);
  const emitted = readdirSync(OUT_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(OUT_DIR, join(entry.parentPath, entry.name)).split("\\").join("/"));
  const missing = required.filter((item) => !emitted.includes(item));
  const extra = emitted.filter((item) => !allowed.has(item));
  if (missing.length || extra.length) {
    fail(`编译产物异常：缺失 [${missing.join(", ")}] / 多出 [${extra.join(", ")}]；实际 [${emitted.join(", ")}]，不进入断言`);
    return false;
  }

  // 两侧必须解析到同一绝对路径（否则 root 切换不会对 notes-store 生效）
  const viaNotesStoreDir = require.resolve("./library-root.js", { paths: [join(OUT_DIR, "main")] });
  const viaScript = require.resolve(join(OUT_DIR, "main", "library-root.js"));
  if (viaNotesStoreDir !== viaScript) {
    fail(`library-root 模块实例不一致：${viaNotesStoreDir} vs ${viaScript}`);
    return false;
  }

  notesStore = require(join(OUT_DIR, "main", "notes-store.js"));
  libraryRoot = require(join(OUT_DIR, "main", "library-root.js"));
  readerStateStore = require(join(OUT_DIR, "main", "reader-state-store.js"));
  libraryRoot.clearLibraryRoot();
  return true;
}

function main() {
  console.log(`[smoke-notes] 临时目录：${TMP}`);
  console.log(`[smoke-notes] typescript：${TSC_JS}`);
  try {
    if (compileAndLoad()) {
      runUndoRoundtrip();
      runUndoFailures();
      runUndoSlotLifecycle();
      runExportAndEmpty();
      runReportRender();
      runReportFiles();
      runReportFailures();
      runNotesStat();
      runLibraryRootContainment();
      runReaderStateStore();
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
