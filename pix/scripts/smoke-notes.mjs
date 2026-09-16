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
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

let passed = 0;
let failed = 0;
let notesStore = null;
let libraryRoot = null;

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
  const required = ["main/notes-store.js", "main/library-root.js"];
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
