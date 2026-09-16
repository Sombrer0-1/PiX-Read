# PiX-Read R13 设计档 · 阅读报告（N82–N86）

> 上游：`docs/pm/R13-req.md`（需求 N82–N86，含 §0 定稿修订 M1–M6）、`docs/pm/R13-review.md`（需求评审 must-fix MF-1…MF-6）、`docs/pm/PRD-V0.5.md` §1 / §2 / §3 / §4 / §5 / §7.3、`docs/pm/R10-design.md`（`renderMarkdownEntry` / `writeFileAtomic` / `notesPaths` 冻结面与 §1 契约冻结表 / §5 文件级清单 / §6 失败路径表 / §8 验证方案 / §9 分工范本）、`docs/pm/R12-design.md`（`SEL` / helper / 场景 / 取证范式与 §1.6 / §5.2 / §8 结构范本）、`docs/pm/R12-dev.md`（R12 交付终态与基线读数 127/185/41）。
> 本档是「可直接开工、可判定」的定稿设计：把 R13-req §0.2/§0.3/§0.5/§0.6 的冻结契约落到实现层粒度 —— 新通道与新类型的逐字形状、主进程入参守卫的逐条判定式、报告渲染纯函数的签名与参考实现、路径派生（含越界判定式）、渲染层动作的守卫顺序与返回三态、面板的 DOM/类名/文案/门控/样式、以及烟测 18 条与离屏 5 场景 13 条 record / 8 张截图的逐条判据。
> **本档不改任何代码**，只新增这一份文档；本轮允许的写操作仅 `docs/pm/R13-design.md`。
> **编号映射**：本档按任务书编号 —— §1 契约冻结表 / §2 与既有冻结面的关系 / §3 失败路径表 / §4 文件级清单 / §5 验证方案 / §6 风险 Top3 / §7 开发分工 / §8 视觉验收。
> 判定工具（与需求档一致）：【走查】只读 `git status` / `git diff` / `git show` 与文件内容（含 `grep -c` / `grep -rn` 计数）；【check】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error；【烟测-渲染】`npm run smoke:view`（4 组 29 条，本轮**零改动**，只作回归）；【烟测-主进程】`npm run smoke:notes`（既有 4 组 26 条 + 新增 3 组 18 条 = **44 条**）；【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + 既有 127 张 / 185 条 / 41 种 label 零缺失 + 新增 5 组 13 条 record 全绿 + 8 张新截图齐备。

---

## 0. 口径与证据面

### 0.1 本档事实基线（写档当天的真实读数：只读核对 + 本步允许的实跑）

| 事实 | 证据（全部为本次真实读数） |
| --- | --- |
| 工作树状态 | `git status --short` ⇒ `?? docs/pm/R13-req.md` / `?? docs/pm/R13-review.md`（本档写完后同样以 `?? docs/pm/R13-design.md` 出现）；`git log --oneline -1` ⇒ `fdad504 feat(reader): 章节语义贯通（当前章节 chip、上/下一节导航与 reading_context section 行）（V0.5 R12）` |
| 唯一工程门当前 0 error | 2026-09-16 实跑 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（输出仅 `> pix-read@0.1.0 check` 与 `vue-tsc --noEmit … && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit` 两行） |
| R13 的零缺失比对基线 | 目录 `C:/Users/86157/AppData/Local/Temp/pix-v05-r12-final/shots`：`MANIFEST.json` ⇒ `shots.length = 127`、`failure = null`；`MEASUREMENTS.json` ⇒ 长度 **185**、`label` 去重 **41** 种（含 `r12-section-visible:5` / `r12-section-degrade:2` / `r12-section-nav:7` / `r12-section-context:2`）；磁盘一级 **131** 项 = **129** png + `MANIFEST.json` + `MEASUREMENTS.json`，其中 `zoom-pill-p1.png` / `zoom-pill-p3.png` **不在清单内** ⇒ 零缺失比对一律以 `MANIFEST.shots[].name` 与 `MEASUREMENTS.json` 的 label 为准，不以磁盘 png 数为准 |
| 主进程数据面（`pix/src/main/notes-store.ts`，442 行） | `NOTES_DIR_NAME = ".pix-read"`（`:26`）/ `NOTES_FILE_NAME = "notes.json"`（`:27`）/ `NOTES_MARKDOWN_NAME = "notes.md"`（`:28`）；`ERROR_MESSAGES` 11 键（`:33`）；`interface NotesPaths { file; markdown }`（`:61`，**未导出**）；`notesPaths(): NotesPaths \| null`（`:70-75`，`join(root, ".pix-read")`）；`docPathKey`（`:99`）、`normalizeNoteText`（`:104`）、`toRelativeDocPath(filePath, root)`（`:109`）、`isStoredDocPath`（`:118`）、`isReaderNote`（`:124`）、`parseNotesFile`（`:145`）、`readNotesFile`（`:167`）、`writeFileAtomic(target, content)`（`:180`：`mkdirSync(dirname(target), { recursive: true })` → 写 `${target}.tmp` → `renameSync` → 失败 `removeTemp`）、`serializeNotes`（`:207`）、`duplicateKey`（`:212`）、`formatStampHuman(ms)`（`:221`）、`workspaceName(root)`（`:248`）、`renderMarkdownEntry(note)`（`:253`）、`renderNotesMarkdown(file, name, now)`（`:267`：`sections.join("\n\n") + "\n"`）、`exportNotesMarkdown()`（`:404`）、`resetCorruptNotes()`（`:418`） |
| 主进程 IPC 面（`pix/src/main/ipc-handlers.ts`，845 行） | `import { addNote, deleteNote, exportNotesMarkdown, loadNotes, resetCorruptNotes, restoreNote, updateNoteComment } from "./notes-store.js";`（`:21`）；`isNoteId`（`:243`）、`isNoteComment`（`:247`）、`invalidNotesInput()`（`:252-254`，错误码 `invalid-input` + 文案 `笔记数据不合法`）；笔记通道 7 个：`notes-load`（`:468`）/ `notes-add`（`:470`）/ `notes-update`（`:472`）/ `notes-delete`（`:476`）/ `notes-restore`（`:478`）/ `notes-export`（`:480`）/ `notes-reset`（`:482`） |
| preload 面（`pix/src/main/preload.ts`，188 行） | `export interface PixApi`（`:32`）与 `const api: PixApi`（`:106`）各 **40** 个方法（本次程序化计数：`:33-103` ⇒ 40、`:106-186` ⇒ 40）；`libraryShowInFolder`（接口 `:64`、实现 `:153`）；笔记七通道（接口 `:69-75`、实现 `:157-164`） |
| 共享类型（`pix/src/shared/types.ts`） | `ReaderNote`（`docPath` 工作区相对、保原大小写、page 1-based）/ `ReaderNoteDraft` / `ReaderNotesFile` / `ReaderNotesErrorCode`（恰 **11** 键）/ `ReaderNotesLoadResult` / `ReaderNotesMutationResult` / `ReaderNotesExportResult`（只有 `filePath` / `count`）/ `ReaderNotesResetResult`；`reports` 串在 `pix/src` 内 **0** 命中（`grep -rn "reports" pix/src \| wc -l` = 0）、`阅读报告` 串 **0** 命中 |
| 渲染层 store（`pix/src/renderer/stores/notes-store.ts`，395 行） | `exporting` 类状态在面板侧；store 侧竞态令牌 `loadSeq` / `writeSeq`（`:101-102`）、`undoScope`（`:104`，`resetNotes()` 内 `+= 1`，`:274`）；`lastExport`（`:77`）；`exportMarkdown()`（`:244`，`grep -n "exportMarkdown"` ⇒ 2 处：`:244` 定义 / `:379` return 暴露）；`resetNotes()`（`:272-289`，含 `lastExport.value = null`）；`watch(currentDocKey, () => { chapterFilter.value = null; })`（`:126-128`）；`groupNotesByDocument` 已 import（`:16`），唯二调用点 `:117`（视图管道）与 utils 内 |
| 面板（`pix/src/renderer/components/workspace/NotesPanel.vue`，1387 行） | `exporting` ref（`:65`）、`exportLabel`（`:92`）、`onExport()`（`:360-366`，首行 `if (exporting.value \|\| !notesStore.hasNotes) return;`）、`revealPath(path)`（`:380`）、`onUndoClick()`（`:233-248`，`if ("stale" in result) return;` 在 `try` 内、`restoring.value = false` 在 `finally` 内 —— 本轮 `onExportReport` 的同款范式）；模板：`.notes-header-top`（`:415-428`，`.notes-count` + `.notes-export-btn`）、`.notes-search`（`:429`）、`.notes-export-row`（`:514-525`，`.export-text` 逐字 `已导出 {{ count }} 条 → .pix-read/notes.md` + 「在文件夹中显示」）、`.notes-loading`（`:526`）；样式：`.notes-header`（`:699-708`，`padding: 8px 12px 6px`）、`.notes-header-top`（`:710-715`）、`.notes-search`（`:718-722`）、`.notes-count`（`:762-767`）、`.notes-export-btn`（`:774-776`）、`.notes-export-row`（`:971-981`）、`.export-text`（`:983-990`） |
| Vuetify 能力核对（真实 node_modules 类型） | `pix/node_modules/vuetify/lib/components/VBtn/VBtn.d.ts:49` ⇒ `block?: unknown;`（`VBtn.js:45` ⇒ `block: Boolean`）；`VBtn.css:211` ⇒ `.v-btn--block { display: flex; flex: 1 0 auto; min-width: 100% }` ⇒ 「占满容器行宽」有真实实现（不用自定义 CSS） |
| 章节派生（R12 冻结，本轮只读复用） | `pix/src/renderer/utils/outline-notes.ts`：`buildChapterRanges(nodes, pageCount): Map<string, ChapterRange>`（`:52`，**Map 插入序 = 有页码节点的预序**）、`countNotesByChapter`（`:86`）、`resolveCurrentChapter`（`:145`）、`resolveChapterNav`（`:166`）、`formatChapterHeading`（`:136`）、`inlineTitle`（`:131`，私有）；`notes-path.ts`：`docPathKey`（`:18`）、`currentDocKey`（`:23`）、`docDisplayName`（`:32`）、`absoluteDocPath`、`PageRange`、`rangeContains`（`:52`）、`matchesChapterFilter`（`:60`）、`groupNotesByDocument`（`:67`）、`sortNotesForContext`（`:110`） |
| 库根与包含判定（`pix/src/main/library-root.ts`，50 行） | `getLibraryRoot()`（`:12`）、`setLibraryRoot`（`:16`）、`clearLibraryRoot`（`:20`）、`isPathInsideDirectory(candidate, directory)`（`:24`：`relative !== "" && !startsWith("..") && !isAbsolute`）、`normalizeFsPath`（`:32`）、`isLibraryFilePath`（`:38`，含 `realpathSync` 兜底） |
| 夹具复算（用于本档全部期望值） | `buildChapterRanges(SAMPLE_OUTLINE, 3)` ⇒ **7 项**（插入序）：`1. Abstract`[1,1]`1`；`2. Method Overview`[2,2]`2`；`2.1 Sparse mask budget`[2,2]`2`；`2.2 Positional prior`[3,3]`3`；`3. Ablation Study`[3,3]`3`；`Appendix A.1`[3,3]`3`；`Appendix B`[2,3]`2-3`（`Appendix A` 无页码 ⇒ 不进 ranges） |
| 离屏夹具（`ui-shot.mjs` 真实常量） | `OUT_ROOT`（`:34`，`PIX_SHOT_ROOT`）/ `SHOTS_DIR`（`:35`）/ `LIBRARY_DIR = <OUT_ROOT>/library`（`:36`）/ `LIBRARY_NAME = "pix-r5-library"`（`:39`，**界面显示名**）/ `MINUTE`（`:232`）/ `SAMPLE_OUTLINE`（`:269-295`）/ `seedNotes()`（`:320-368`，4 条：`n-current-1` p1 摘录 + 备注「与第 3 节消融实验对照」、`n-current-2` p2 摘录长文 + 空备注、`n-other-1` `archive/older-paper.pdf` **p7** 摘录、`n-current-3` p2 **AI 结论** + 备注「由一次提问总结」）/ `writeFixtures()`（`:370-392`，建 `library/archive`、`library/.pix-read`、`library-b/.pix-read`、`SHOTS_DIR`，写 4 个文档与空 `notes.json`）/ `relativeDocPath(target)`（`:566`，`CONFIG.root` 前缀、保原大小写）/ `activeRoot`（`:580`，`startSession(dir)` 写，`:714`）/ `NOTES_FILE`（stub 内 `:421` = `<LIBRARY_DIR>/.pix-read/notes.json`，Node 侧 `:2069` 同路径） |
| 离屏 stub 面（`ui-shot.mjs` 的真实行号） | `buildStub()`（`:400`）；`NOTES_ERRORS`（`:494-502`，**无** `empty` / `not-corrupt`，`write-failed` = `笔记写入失败`）；`libraryShowInFolder: async function () { return { success: true }; }`（`:767`，**当前不记录参数**）；`notesExport`（`:916-919`，只返回路径与条数、**不写** `notes.md`）；`notesRestore` 的 `resolvedAt` 范式（`:873-916`：调用即入队、延迟只推迟响应、`call.resolvedAt = Date.now()` 在返回前）；`contextBridge.exposeInMainWorld("__pixStub", {…})`（`:974-1040`，既有控制口 `notesAddCalls` / `notesLoadCalls` / `setNotesAddFailure` / `notesRestoreCalls` / `setNotesRestoreDelay` / `setLoadFailure` / `setLibraryReadDelay` / `relativeDocPath` / `setReaderStateDelay` / `setReaderStateFailure` / `readerStateSaveCalls` 等） |
| 离屏 helper 面（`runReaderStateScenarios`，函数体 `:1372`–`:7264`） | `js`（`:1373`）/ `sleep`（`:1374`）/ `waitFor`（`:1379`，轮询 120ms）/ `record(label, data, failures)`（`:1390`，先落测量再抛错）/ `textOf`（`:1395`）/ `has`（`:1399`）/ `countOf`（`:1400`）/ `waitPdfLoaded`（`:1451`）/ `waitPage`（`:1452`）/ `openRow`（`:1492`）/ `clickNext` / `clickPrev`（`:1501-1502`）/ `notesHash`（`:2071`）/ `rectOfSelector`（`:2259`）/ `enterCleanWorkspace`（`:3087`）/ `openNotesPanel(rows)`（`:3100`）/ `restoreStandardSeed`（`:3106`）/ `backToLibraryTab`（`:4090`）/ `enterNotesProbe(seed, rows)`（`:4795`）/ `enterMapWorkspace` / `notesNotice()`（`:4940`）/ `pressBodyEsc`（`:5233`）/ `clickEl(selector)`（`:6752`，R12 新增）/ `pressReaderKey`（`:6755`）/ `pressKeyOn`（`:6761`）/ `sectionProbe`（`:6769`）/ `pillProbe`（`:6796`）/ `waitSectionReady`（`:6817`）/ `closeMap`（`:6821`）/ `settleEmptyOutline`（`:6828`）/ `mapCurrentLabels`（`:6838`） |
| 离屏挂载点与收尾 | `runReaderStateScenarios` 的最后一条语句 = `await restoreStandardSeed();`（`:7263`），函数收口 `}`（`:7264`）；R12 块（helper + `r12-1`…`r12-4`）整段结束于 `:7263` ⇒ R13 块追加在 `:7263` 之后、`:7264` 之前 |
| 既有烟测面 | `pix/scripts/smoke-notes.mjs`（553 行）= 4 组 26 条（`undo-roundtrip` 8 / `undo-failures` 8 / `undo-slot-lifecycle` 6 / `export-and-empty` 4），`main()`（`:518-537`）调用序 `runUndoRoundtrip → runUndoFailures → runUndoSlotLifecycle → runExportAndEmpty`，临时目录 `%TEMP%/pix-smoke-notes-<ts>`（`:27`）、`finally` 内 `rmSync`；`pix/scripts/smoke-view.mjs` = 4 组 29 条（`runSectionHit` 8 / `runSectionNull` 8 / `runSectionNav` 8 / `runSectionFormat` 5，程序化计数）；`pix/package.json` 的 `scripts` 已有 `smoke:notes`（`:16`）/ `smoke:view`（`:17`） |
| 报告目标路径的现场（离屏） | `<LIBRARY_DIR>/.pix-read/reports/sample-paper.pdf.md`（根文档）、`…/reports/archive/older-paper.pdf.md`（子目录文档）、`…/reports/reading-notes.md.md`（文本文档）；`{资料库名}` = `path.basename(CONFIG.root)` = `library`（**不得**取 `CONFIG.name = "pix-r5-library"`，它是界面显示名） |

### 0.2 R13-req 定稿修订（M1–M6）与需求评审 must-fix 在本档的实现级落点

| 编号 | 需求档处置 | 本档实现级落点 |
| --- | --- | --- |
| M1 / MF-1（在途与竞态） | 归属守卫 + `setNotesReportDelay` + 两条断言 | §1.6.4（`reportScope` 与守卫顺序）、§1.7.3（面板首行守卫 + `try/finally`）、§5.2 stub 控制口 `setNotesReportDelay(ms)`、`r13-5` 相位 `inflight-guard`（⑩⑪） |
| M2 / MF-2（`{文档相对路径}` 双来源） | 冻结唯一来源与归属判定 | §1.4.2「docPath（唯一来源）」行、§1.5.3 字段表、`r13-2` 相位 `payload`（⑤⑥）、§1.8 走查 #9 |
| M3 / MF-3（`{显示名}` 大小写） | 改为保原大小写来源 | §1.6.4 `displayName = docDisplayName(readerStore.filePath)`、§1.7.4 状态行文本、§1.8 走查 #10 |
| M4 / MF-4（守卫与倒序范围） | 守卫容忍 `end < start` + 一条断言 | §1.2.2 `chapters` 行（**不要求** `start ≤ end`）、§5.1 `report-render` #7、§1.5.2 归组谓词恒不命中 |
| M5 / MF-5（不可达走查判据） | 改写为可判定式 | §1.8 #9 / #11 / #13（`grep -c "chapters:"` = 1；`grep -rn "exportCurrentDocReport" … \| grep -v stores/notes-store.ts \| wc -l` = 1；`lastReport.value = null` 恰 2 处） |
| M6 / MF-6（路径边界兜底） | 兜底口径 + 两条注入 | §1.4.2（入参相对路径 / 失败兜底口径）、§5.1 `report-failures` #4（两条注入）、§3 第 2 / 6 / 7 行 |
| 评审 S-4（`阅读报告` 走查口径） | 命中集合 ⊆ 面板 | §1.7.2 文案唯一性判据（`grep -rn "阅读报告" pix/src \| wc -l` 的新增命中 ⊆ `NotesPanel.vue`） |
| 评审 S-5（`.pix-read` 顶级条目时序） | 两次快照紧贴点击前后 | §5.2 `r13-2` 相位 `export-success` 步骤 ①（点击前快照）与相位 `content-verbatim` ⑪（只比条目名集合） |
| 评审 S-6（入口行宽无判据） | 补几何判据 | §1.7.5 `reportProbe()` 的 `entryWidthOk`（与 `.notes-search` 行宽 ±1px）与 `entryBelowHeader`（不压 `.notes-count`） |
| 评审 S-7（`long-book.pdf` 420 项入参） | 参数面避开该文档 | §5.2 场景夹具只用 `sample-paper.pdf` / `archive/older-paper.pdf` / `reading-notes.md`；`r13-*` 不打开 `long-book.pdf` |
| 评审 S-2（上游口径差） | 登记「进度口径收窄」 | §2.1 末段（本档明确：只取渲染层实时内存值，不读不写 `reader-state.json`；与 PRD §1 的落盘来源在正常路径下等值） |

### 0.3 本档新增的显式冻结（只补实现层命名与常量，不改任何判据）

| 项 | 冻结值 | 理由 |
| --- | --- | --- |
| 主进程渲染三函数（内部命名，语义冻结） | `renderDocumentReport(entries, docPath, name, chapters, progress, now): string` / `sortReportEntries(entries): ReaderNote[]` / `reportChapterTitle(title): string` | 与 `renderNotesMarkdown` / `renderMarkdownEntry` 同层（private function），不新增导出 |
| 渲染层动作与结果类型 | `exportCurrentDocReport(): Promise<ExportDocReportResult>`；`export type ExportDocReportResult = { ok: true; filePath: string; displayPath: string; count: number } \| { ok: false; stale: true } \| { ok: false; empty: true } \| { ok: false; message: string }` | 三态判据与 `UndoDeleteResult` 同范式（`stale` 键即守卫判据）；`empty` 独立成态才能让面板渲染**无前缀**的冻结文案 |
| 渲染层作用域令牌 | `let reportScope = 0;`（紧邻 `undoScope`），`resetNotes()` 内 `reportScope += 1;` | 与 `undoScope` 同一处、同一语义（跨工作区/跨文档在途残留防护） |
| 归组谓词唯一实现点 | 主进程 `renderDocumentReport` 内的 `chapters.findIndex((chapter) => chapter.start <= note.page && note.page <= chapter.end)`（**全文件唯一一处 `start <= … && … <= end`**） | 满足走查「归组谓词只有一处」（§1.8 #1），且主进程不引入第二份区间算法 |
| 离屏新增 helper（恰 4 个，命名自由、语义冻结） | `reportProbe()` / `readReport(relPath)` / `reportExists(relPath)` / `normalizeStamp(text)` | §5.2.1；其余（`clickEl` / `notesNotice` / `enterNotesProbe` / `restoreStandardSeed` / `backToLibraryTab` / `rectOfSelector` / `capturePage` / `record` / `openRow` / `waitPage` / `waitPdfLoaded` / `waitSectionReady` / `settleEmptyOutline` / `notesHash` / `openNotesPanel`）**全部复用**既有，R13 不重声明 |
| 离屏 stub 报告根 | `CONFIG.root`（工作区 A）；`displayPath` = `.pix-read/reports/<rel>.md` | stub 的 `NOTES_FILE` / `relativeDocPath` 同为 A 根（既有简化，与 `activeRoot` 无关）；`r13-*` 场景全部在工作区 A ⇒ 进入断言面无差异；该口径在 dev 档登记 |
| 离屏新场景名 / 组名 / 相位 | 场景 `r13-1`…`r13-5`；组 `r13-report-entry` 3 / `r13-report-content` 3 / `r13-report-fallback` 2 / `r13-report-degrade` 2 / `r13-report-failure` 3 = **13 条**；截图 8 张（名单见 §5.2.6） | 与需求 §0.7 逐字一致；既有 41 种 label 之上新增 **5** 种 |

### 0.4 本轮不得改动的既有冻结面

见 §2.1（与需求档 §0.1 同口径，本档只补判据命令）。

---

## 1. 契约冻结表

### 1.1 新 IPC 三件套（通道 / 入参 / 返回 / preload）

#### 1.1.1 通道与 handler（逐字）

| 项 | 冻结值 |
| --- | --- |
| 通道名 | `notes-export-report` |
| 落点 | `pix/src/main/ipc-handlers.ts` 的 `registerIpcHandlers()` 内，**紧接** `ipcMain.handle("notes-reset", () => resetCorruptNotes());`（`:482`）之后、`Reader state` 分节注释（`:484-486`）之前；分节归属 = 既有的 `Reader notes (workspace .pix-read/notes.json)` 段 |
| handler（逐字） | `ipcMain.handle("notes-export-report", (_event, input: unknown) => (isReaderNotesReportInput(input) ? exportDocumentReport(input) : invalidReportInput()));` |
| 新增 import | `ipc-handlers.ts:21` 的既有 import 行追加 `exportDocumentReport`（同一行、字母序位置自由）；`import type { ReaderNotesReportChapter, ReaderNotesReportInput, ReaderNotesReportResult }` 加进既有 `@shared/types` 的 `import type` 列表 |
| 既有 7 个笔记 handler | `notes-load` / `notes-add` / `notes-update` / `notes-delete` / `notes-restore` / `notes-export` / `notes-reset` 与 `invalidNotesInput()`（`:252-254`）**零 diff** |

#### 1.1.2 类型（`pix/src/shared/types.ts`，名字与字段逐字冻结）

```ts
/** 单个章节范围：只带渲染所需事实（不传 key；顺序即分组顺序）。 */
export interface ReaderNotesReportChapter {
  title: string;
  start: number;
  end: number;
  label: string;
}

/** 单文档阅读报告入参：文档绝对路径 + 已算好的章节范围 + 阅读进度（不可得为 null）。 */
export interface ReaderNotesReportInput {
  docFilePath: string;
  chapters: ReaderNotesReportChapter[];
  progress: { page: number; pageCount: number } | null;
}

/** 报告导出结果：成功时 filePath 为绝对路径、displayPath 为 `.pix-read/reports/<docPath>.md`（工作区相对）。 */
export interface ReaderNotesReportResult {
  success: boolean;
  filePath?: string;
  displayPath?: string;
  count?: number;
  code?: ReaderNotesErrorCode;
  error?: string;
}
```

| 项 | 冻结 |
| --- | --- |
| 落点 | 紧接 `ReaderNotesExportResult`（`types.ts:401-407`）之后、`ReaderNotesResetResult`（`:410-416`）之前；三个接口**连续放置**（类型面新块） |
| 错误码 | **不扩** `ReaderNotesErrorCode`（既有 11 键）：报告复用 `no-root` / `outside` / `invalid-input` / `corrupt` / `version-unsupported` / `read-failed` / `write-failed` / `empty` |
| 专有文案 | 三条按调用点写死（同 `ANSWER_TOO_LONG_MESSAGE` / `RESTORE_EMPTY_MESSAGE` 先例）：`报告参数不合法`（守卫）/ `当前文档暂无笔记，未生成报告`（空库）/ `报告写入失败`（写失败） |
| 既有类型 | `ReaderNotesExportResult` / `ReaderNotesErrorCode` / `ReaderNote` 等**零 diff** |

#### 1.1.3 preload（两处，逐字）

| 位置 | 逐字新增 |
| --- | --- |
| `PixApi` 接口（`preload.ts:74` `notesExport` 之后） | `  notesExportReport: (input: ReaderNotesReportInput) => Promise<ReaderNotesReportResult>;` |
| `api` 实现（`preload.ts:163` `notesExport` 之后） | `  notesExportReport: (input: ReaderNotesReportInput) => ipcRenderer.invoke("notes-export-report", input) as Promise<ReaderNotesReportResult>,` |
| 新增 import | 两个名字加进既有 `@shared/types` 的 `import type` 列表（`ReaderNotesReportInput` / `ReaderNotesReportResult`） |
| 不变量 | 既有 40 个方法逐字不动（改后 `PixApi` = **41**、`api` = **41**）；无内联动态 import、无 `any` |

### 1.2 入参守卫（唯一实现点 = `ipc-handlers.ts` 的 `isReaderNotesReportInput`）

#### 1.2.1 参考实现（语义冻结；等价写法允许，逐条判据不变）

```ts
function isReportChapter(value: unknown): value is ReaderNotesReportChapter {
  if (!value || typeof value !== "object") return false;
  const chapter = value as Record<string, unknown>;
  return (
    typeof chapter.title === "string" &&
    typeof chapter.label === "string" &&
    chapter.label.length > 0 &&
    typeof chapter.start === "number" &&
    Number.isInteger(chapter.start) &&
    chapter.start >= 1 &&
    typeof chapter.end === "number" &&
    Number.isInteger(chapter.end) &&
    chapter.end >= 1
  );
}

/** 守卫只做形状：路径归属、空库判定、渲染与写盘都在 notes-store 内完成。 */
function isReaderNotesReportInput(value: unknown): value is ReaderNotesReportInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  if (typeof input.docFilePath !== "string" || input.docFilePath.length === 0) return false;
  if (!Array.isArray(input.chapters) || !input.chapters.every(isReportChapter)) return false;
  const progress = input.progress;
  if (progress === null) return true;
  if (!progress || typeof progress !== "object") return false;
  const pair = progress as Record<string, unknown>;
  return (
    typeof pair.page === "number" &&
    Number.isInteger(pair.page) &&
    typeof pair.pageCount === "number" &&
    Number.isInteger(pair.pageCount) &&
    pair.page >= 1 &&
    pair.page <= pair.pageCount
  );
}

const REPORT_INVALID_MESSAGE = "报告参数不合法";

function invalidReportInput(): ReaderNotesReportResult {
  return { success: false, code: "invalid-input", error: REPORT_INVALID_MESSAGE };
}
```

#### 1.2.2 逐字段判定表（冻结）

| 字段 | 冻结校验 | 说明 |
| --- | --- | --- |
| `docFilePath` | 非空字符串（不要求 `isAbsolute`） | 绝对路径归属由 `toRelativeDocPath` 判定 ⇒ 越界 `outside`；相对路径按主进程 CWD 解析（`resolve`）后通常落在库外 ⇒ `outside` |
| `chapters` | 数组（**可为空数组**）；每项为非空对象，`title` 为字符串（**可为空串**，渲染时折叠为空 ⇒ `未命名`）、`start` / `end` 为整数且 `1 ≤ start`、`1 ≤ end`（`Number.isInteger` 同时排除 `Infinity` / `NaN`）、`label` 为非空字符串 | **不要求 `start ≤ end`**：倒序范围（`buildChapterRanges` 在书签页码超过 `pageCount` 时的合法产出，如 `{start:5,end:3,label:"5"}`）不整体拒绝，该组因闭区间谓词恒不命中而不出现在报告中；**不设长度上限** |
| `progress` | `null`，或对象 `{ page: number, pageCount: number }` 且两值整数、`1 ≤ page ≤ pageCount` | `null` 与「对象」是仅有的两种合法态；不设默认值（漏传即编译期报错） |
| 守卫失败 | `{ success: false, code: "invalid-input", error: "报告参数不合法" }`，**零写盘**（不建目录、不建文件） | `invalidReportInput()`；不调用 `exportDocumentReport` |
| 守卫是纯函数 | 只 `typeof` / `Array.isArray` / `Number.isInteger`，不做 I/O、不抛错、不读写状态 | 走查判据 §1.8 #3 |

### 1.3 主进程导出与返回面

#### 1.3.1 `exportDocumentReport(input): ReaderNotesReportResult`（参考实现，语义冻结）

```ts
export function exportDocumentReport(input: ReaderNotesReportInput): ReaderNotesReportResult {
  const paths = notesPaths();
  if (!paths) return { success: false, code: "no-root", error: ERROR_MESSAGES["no-root"] };
  const root = getLibraryRoot();
  const docPath = toRelativeDocPath(input.docFilePath, root);
  if (!docPath) return { success: false, code: "outside", error: ERROR_MESSAGES.outside };
  const target = join(paths.reports, ...docPath.split("/")) + ".md";
  // 双重防护：toRelativeDocPath 已保证在库内，这里再对「报告根」复核一次
  if (!isPathInsideDirectory(target, paths.reports)) {
    return { success: false, code: "outside", error: ERROR_MESSAGES.outside };
  }
  const read = readNotesFile(paths.file);
  if (!read.ok) return { success: false, code: read.code, error: read.error };
  const key = docPathKey(docPath);
  const entries = read.file.notes.filter((note) => docPathKey(note.docPath) === key);
  if (entries.length === 0) return { success: false, code: "empty", error: REPORT_EMPTY_MESSAGE };
  const markdown = renderDocumentReport(entries, docPath, workspaceName(root), input.chapters, input.progress, Date.now());
  const write = writeFileAtomic(target, markdown);
  if (!write.ok) return { success: false, code: "write-failed", error: REPORT_WRITE_FAILED_MESSAGE };
  return {
    success: true,
    filePath: target,
    displayPath: `${NOTES_DIR_NAME}/${REPORTS_DIR_NAME}/${docPath}.md`,
    count: entries.length,
  };
}
```

新增常量（`notes-store.ts` 顶部常量区，紧接 `NOTES_MARKDOWN_NAME`）：

```ts
const REPORTS_DIR_NAME = "reports";
/** 空库与写失败专有文案（错误码复用既有码表，文案按调用点写死）。 */
const REPORT_EMPTY_MESSAGE = "当前文档暂无笔记，未生成报告";
const REPORT_WRITE_FAILED_MESSAGE = "报告写入失败";
```

#### 1.3.2 返回面六情形（逐字）

| 情形 | 返回 |
| --- | --- |
| 成功 | `{ success: true, filePath: <绝对路径>, displayPath: ".pix-read/reports/<docPath>.md", count: N }` |
| 无工作区根 | `{ success: false, code: "no-root", error: "尚未选择资料库根目录" }`（复用既有码与文案） |
| 文档不在库内 / 报告目标路径越界 | `{ success: false, code: "outside", error: "该文档不在当前资料库内" }` |
| 该文档无笔记 | `{ success: false, code: "empty", error: "当前文档暂无笔记，未生成报告" }`（**专有文案**；**不创建目录、不创建文件**） |
| `notes.json` 损坏 / 版本不支持 / 读取失败 | 既有码 `corrupt`（`笔记文件无法读取（文件已损坏，未被修改）`）/ `version-unsupported`（`笔记文件版本不支持`）/ `read-failed`（`笔记文件读取失败`） |
| 写盘失败（含目录创建失败） | `{ success: false, code: "write-failed", error: "报告写入失败" }`（**专有文案**） |

**判定顺序（冻结，自上而下第一条命中即返回）**：`no-root` → `outside`（`toRelativeDocPath`）→ `outside`（`isPathInsideDirectory` 复核）→ `readNotesFile` 失败码 → `empty` → 渲染 → `write-failed`。⇒ 「无工作区根时的 `empty`」与「损坏库时的 `empty`」都不可能发生（前序分支先命中）。

### 1.4 路径派生与写入

#### 1.4.1 目录常量与 `notesPaths()` 扩字段

| 项 | 冻结 |
| --- | --- |
| `interface NotesPaths`（`notes-store.ts:61`，未导出） | 增第三个字段 `reports: string;` |
| `notesPaths()`（`:70-75`） | 返回 `{ file, markdown, reports }`，其中 `reports = join(join(root, NOTES_DIR_NAME), REPORTS_DIR_NAME)`；`file` / `markdown` 两行的字面与语义逐字不动（纯新增一行 + 返回对象加一个键） |
| 既有调用点 | `paths.file` / `paths.markdown` 的 7 处既有访问零改动（`loadNotes` / `addNote` / `updateNoteComment` / `deleteNote` / `restoreNote` / `exportNotesMarkdown` / `resetCorruptNotes`） |

#### 1.4.2 路径派生规则（逐字）

| 项 | 冻结 |
| --- | --- |
| **docPath（唯一来源）** | `docPath = toRelativeDocPath(input.docFilePath, getLibraryRoot())`（复用既有 `:109`：`resolve` + `isLibraryFilePath` + `relative(root, resolved).split(sep).join("/")` + 拒绝空/`..`/绝对）⇒ **正斜杠、保原大小写**；产出 `null` ⇒ 见 §1.3.2 `outside` |
| 该字符串的三个用途 | ① 目标路径；② meta 行 `文档：` 段；③ `displayPath` —— **同一个字符串**，不二次派生 |
| **归属判定（唯一定义）** | `docPathKey(note.docPath) === docPathKey(docPath)`（复用既有比较键：小写 + 正斜杠 + 去尾斜杠）。**不从笔记条目取 `docPath` 作展示**（存储态 `docPath` 由入库那次调用决定，与本次入参可在大写/拼写上不同） |
| 目标路径 | `target = join(paths.reports, ...docPath.split("/")) + ".md"` ⇒ `<工作区根>/.pix-read/reports/<文档相对路径>.md`；子目录层级**完整复刻**文档相对路径（`archive/older-paper.pdf` ⇒ `reports/archive/older-paper.pdf.md`） |
| **越界校验的判定式（双层）** | ① `toRelativeDocPath` 内 `isLibraryFilePath(resolved)`（`library-root.ts:38`：`normalizeFsPath` 前缀包含 + `realpathSync` 兜底）与 `relativePath` 不以 `..` 开头；② 写盘前 `isPathInsideDirectory(target, paths.reports)`（`library-root.ts:24`：`relative !== "" && !startsWith("..") && !isAbsolute`）复核。任一层不过 ⇒ **一律 `outside`**（不新增错误码、不区分层级） |
| 入参相对路径 | 守卫不要求 `isAbsolute`；相对路径在 `toRelativeDocPath` 内由 `resolve()` 按**主进程 CWD** 解析，解析结果不在库内 ⇒ `outside` |
| 原子写 | 复用既有 `writeFileAtomic(target, content)`（零改动）：`mkdirSync(dirname(target), { recursive: true })` + 写 `${target}.tmp` + `renameSync(tmp, target)`；失败清理 tmp、原文件不动 |
| 幂等 | 整文件覆盖（无追加、无「已存在则跳过」、无增量合并）；同一 `notes.json` + 同一入参 ⇒ 除 `生成时间` 外**逐字节相同** |
| 目录/文件缺失 | 目录缺失即创建（含任意层级子目录）；文件缺失即创建；两者都不报错 |
| 失败兜底口径 | 除 `no-root` 与 `outside` 外的**一切路径类与写入类失败**（非法字符 / 超长路径 / Windows 保留名、目标父级被同名**文件**占用导致 `mkdirSync` 抛错、写 tmp 或 `renameSync` 失败、tmp 清理失败等）统归 `write-failed`（`报告写入失败`）：**不新增错误码、不新增分支文案**，也不保证失败后的目录状态（可能留下已创建的空目录） |
| 只写一个文件 | 一次导出恰好一次 `writeFileAtomic`，目标恒在 `reports/` 内；不写 `notes.json`、不写 `notes.md`、不写现场文件 |

### 1.5 报告渲染纯函数（签名 + 逐字模板 + 字段来源）

#### 1.5.1 签名（`pix/src/main/notes-store.ts` 内，private；语义冻结）

| 函数（逐字签名） | 语义 |
| --- | --- |
| `function sortReportEntries(entries: ReaderNote[]): ReaderNote[]` | 三键排序：`page` 升序 → `createdAt` 升序 → `id` 升序（`localeCompare`）；**不依赖 `Array.prototype.sort` 的稳定性** ⇒ 字节级可复现 |
| `function reportChapterTitle(title: string): string` | `normalizeNoteText(title) \|\| "未命名"`（复用既有折叠：`\s+` → 单空格 + `trim`；与 `collectPreorder` 的空标题口径一致） |
| `function renderDocumentReport(entries: ReaderNote[], docPath: string, name: string, chapters: ReaderNotesReportChapter[], progress: { page: number; pageCount: number } \| null, now: number): string` | 唯一非确定性输入 = `now`（`Date.now()`）；输出整份报告字符串（含末尾恰一个 `\n`） |

#### 1.5.2 参考实现（语义冻结；等价写法允许，逐条判据不变）

```ts
function reportBlocks(entries: ReaderNote[], chapters: ReaderNotesReportChapter[]): string[] {
  const heading = (title: string, list: ReaderNote[]) => `## ${title}（${list.length} 条）`;
  const block = (title: string, list: ReaderNote[]) =>
    `${heading(title, list)}\n\n${list.map(renderMarkdownEntry).join("\n\n---\n\n")}`;
  const blocks: string[] = [];
  if (chapters.length === 0) {
    // 退化：按页分组（entries 已按 page 升序 ⇒ Map 插入序即页升序，不写第二份区间比较）
    const byPage = new Map<number, ReaderNote[]>();
    for (const note of entries) {
      const bucket = byPage.get(note.page);
      if (bucket) bucket.push(note);
      else byPage.set(note.page, [note]);
    }
    for (const [page, list] of byPage) blocks.push(block(`第 ${page} 页`, list));
    return blocks;
  }
  const buckets = chapters.map(() => [] as ReaderNote[]);
  const fallback: ReaderNote[] = [];
  for (const note of entries) {
    // 归组谓词：闭区间、含两端；findIndex 返回最早命中者 ⇒「第一条命中获胜」
    const index = chapters.findIndex((chapter) => chapter.start <= note.page && note.page <= chapter.end);
    if (index >= 0) buckets[index].push(note);
    else fallback.push(note);
  }
  chapters.forEach((chapter, index) => {
    const list = buckets[index];
    if (list.length === 0) return; // 空组不渲染
    blocks.push(block(`${reportChapterTitle(chapter.title)} · 第 ${chapter.label} 页`, list));
  });
  if (fallback.length > 0) blocks.push(block("未归入章节", fallback));
  return blocks;
}

/** 报告正文渲染（纯函数；唯一非确定性输入 = now）。 */
function renderDocumentReport(
  entries: ReaderNote[],
  docPath: string,
  name: string,
  chapters: ReaderNotesReportChapter[],
  progress: { page: number; pageCount: number } | null,
  now: number,
): string {
  const ordered = sortReportEntries(entries);
  const excerpt = ordered.filter((note) => note.kind === "excerpt").length;
  const progressPart = progress ? `阅读进度：第 ${progress.page} / ${progress.pageCount} 页；` : "";
  const meta =
    `> 由 PiX-Read 生成，每次导出都会覆盖。资料库：${name}；文档：${docPath}；` +
    `生成时间：${formatStampHuman(now)}；${progressPart}共 ${ordered.length} 条（摘录 ${excerpt} · AI 结论 ${ordered.length - excerpt}）。`;
  return [`# 阅读报告 · ${workspaceName(docPath)}`, meta, ...reportBlocks(ordered, chapters)].join("\n\n") + "\n";
}
```

**逐条冻结的性质**：① 每条笔记在报告中**恰出现一次**（章节组互斥 + 兜底组完备）；② 条数为 0 的章节组整组不出现；③ `chapters === []` ⇒ 只有按页组（页升序），不出现任何章节标题、不出现 `未归入章节`；④ 兜底组**恒排在所有章节组之后**，且**至多一个**；⑤ 组间**恰一个空行**、同组条目间**恰** `\n\n---\n\n`；⑥ 文件末尾**恰一个** `\n`（不以 `---` 结尾、不以空行结尾）；⑦ `N === 报告条目数`，`A + B === N`。

#### 1.5.3 逐字模板（骨架 + 字段来源 + 转义规则）

**骨架**（`<空行>` = 两个 `\n`；文件末尾恰一个 `\n`）

```text
# 阅读报告 · {文档显示名}
<空行>
> 由 PiX-Read 生成，每次导出都会覆盖。资料库：{资料库名}；文档：{文档相对路径}；生成时间：{YYYY-MM-DD HH:mm:ss}；阅读进度：第 {page} / {pageCount} 页；共 {N} 条（摘录 {A} · AI 结论 {B}）。
<空行>
{组 1}
<空行>
{组 2}
…
```

| 字段 | 来源（实现级） | 转义 / 归一化规则 |
| --- | --- | --- |
| `{文档显示名}` | `workspaceName(docPath)`（复用既有 `:248`：按 `[\\/]` 切分取末段） | **保原大小写**；不做 Markdown 转义；与渲染层 `docDisplayName` 同结果（`archive/older-paper.pdf` ⇒ `older-paper.pdf`） |
| `{资料库名}` | `workspaceName(getLibraryRoot())`（复用既有唯一实现，与 `notes.md` 同源） | 不转义；夹具下为 `library`（**不得**取界面显示名 `pix-r5-library`） |
| `{文档相对路径}` | `docPath`（§1.4.2 唯一来源） | 正斜杠、保原大小写、非绝对路径、非显示名；不从笔记条目取值 |
| `{YYYY-MM-DD HH:mm:ss}` | `formatStampHuman(now)`（复用既有 `:221`，本地时间、无 locale） | 全文件**唯一的非确定性字段**；`now` 只由 `exportDocumentReport` 内的 `Date.now()` 提供 |
| `阅读进度：第 {page} / {pageCount} 页；` | `progress.page` / `progress.pageCount` | **整段**只在 `progress !== null` 时出现；`null` 时该段与紧随的 `；` 一律不出现，其余字段顺序不变 |
| `{N}` / `{A}` / `{B}` | 该 `docPath` 的条目数 / `kind === "excerpt"` 数 / `kind === "answer"` 数 | 恒有 `A + B === N`（`kind` 只有两态，由读侧 `isReaderNote` 白名单闭合） |
| `{章节标题}` | `reportChapterTitle(chapter.title)` | `\s+` → 单空格 + `trim`（等价 `normalizeNoteText`）；折叠后为空 ⇒ 逐字 `未命名` |
| `{label}` | `chapter.label` **原样** | 不二次格式化（`1` / `2-3` 这类既有产出） |
| `{M}` | 该组条目数 | 章节组 = 落入该组的笔记数；兜底组 = 未命中任何章节的笔记数；按页组 = 该页笔记数 |
| 组标题三形态 | 章节组 `` `## {章节标题} · 第 {label} 页（{M} 条）` ``；兜底组 `` `## 未归入章节（{M} 条）` ``（无页码范围）；按页组 `` `## 第 {page} 页（{M} 条）` `` | 逐字，全角括号与 `·` |
| 条目 | **逐字复用** `renderMarkdownEntry(note)`（`:253`，零改动）：`### 第 {page} 页` / `### 第 {page} 页 · AI 结论` → 空行 → 正文逐行加 `> ` →（`comment` 非空）空行 + `备注：{comment}` | 不新增标题产出（`grep -c "### 第 "` 的新增命中为 0） |
| **通篇转义规则** | **不做任何 Markdown / HTML 转义**（`*` `_` `#` `\|` 原样输出）；不做 HTML 实体编码；正文入库前已由 `normalizeNoteText` 归一化为单行，渲染仍按 `\n` 逐行加 `> `（兼容手工写入的多行，与 `notes.md` 同口径） | 行尾不产生行尾空格（**限于主进程写入的条目**：`normalizeNoteText` 保证正文单行无首尾空白；手工写入的条目沿用既有 `> ` 前缀逐行输出，其空行的 `> ` 属既有语义） |

#### 1.5.4 夹具判定表（`sample-paper.pdf`，标准种子，`pageCount = 3`，`chapters` = 7 项 §0.1 表）

| 页 / kind | 命中章节（第一条命中获胜） | 组标题 |
| --- | --- | --- |
| p1 摘录（`n-current-1`） | `1. Abstract`[1,1] | `## 1. Abstract · 第 1 页（1 条）` |
| p2 摘录（`n-current-2`） | `2. Method Overview`[2,2]（同页的 `2.1`[2,2] / `Appendix B`[2,3] 因「第一条命中」落选） | `## 2. Method Overview · 第 2 页（2 条）` |
| p2 结论（`n-current-3`） | 同上 | 组内 `page` 升序 → `createdAt` 升序 ⇒ 摘录在前、结论在后 |
| p9 摘录（越界页，仅 `r13-3` 夹具） | 不命中任何章节（最大 `end = 3`） | `## 未归入章节（1 条）`，恒排在最后 |
| `2.2 Positional prior`[3,3] / `3. Ablation Study`[3,3] / `Appendix A.1`[3,3] | 无笔记 | **整组不出现**（不写 `（0 条）`、不留空占位） |

**无章节文档（`archive/older-paper.pdf`，1 条 p7 摘录）**：`chapters = []` ⇒ `^## ` 行只有 `## 第 7 页（1 条）`；不出现 ` · 第 `、不出现 `未归入章节`。

**文本文档 / PDF 未就绪（`reading-notes.md`，1 条 p1 摘录）**：`chapters = []` 且 `progress = null` ⇒ 按页分组 + 元信息行**不含** `阅读进度：`。

### 1.6 渲染层 store（状态、动作、守卫顺序）

#### 1.6.1 新增状态与派生

| 项 | 逐字（`pix/src/renderer/stores/notes-store.ts`） |
| --- | --- |
| 报告结果类型（导出的类型别名，紧邻既有 `ExportNotesResult`） | `export type ExportDocReportResult = { ok: true; filePath: string; displayPath: string; count: number } \| { ok: false; stale: true } \| { ok: false; empty: true } \| { ok: false; message: string };` |
| `lastReport`（ref，紧邻 `lastExport`） | `const lastReport = ref<{ filePath: string; displayPath: string; displayName: string; count: number } \| null>(null);` |
| `currentDocNoteCount`（computed） | ```const currentDocNoteCount = computed(() => { const key = currentDocKey.value; if (key === null) return 0; const groups = groupNotesByDocument(notes.value, key, true); return groups.length > 0 ? groups[0].notes.length : 0; });``` |
| `reportScope`（let，紧邻 `undoScope`） | `let reportScope = 0;` |

`currentDocNoteCount` 的三条冻结性质：① **与视图维度无关**（只读 `notes.value` 与 `currentDocKey`，不经 `groups` 视图管道）⇒ 搜索词 / 排序 / 章节过滤 / 「仅看当前文档」都不改变它；② **不写第二处文档归属比较**（复用 `groupNotesByDocument(..., onlyCurrent = true)`）；③ `currentDocKey === null` ⇒ 恒 `0`（无当前文档）。

#### 1.6.2 动作 `exportCurrentDocReport()`（守卫顺序即判据）

```ts
async function exportCurrentDocReport(): Promise<ExportDocReportResult> {
  const docKey = currentDocKey.value;
  const filePath = readerStore.filePath;
  // ① 归属缺失（无当前文档 / 库外文件）：按钮已禁用；动作级防御，与在途归属守卫同语义（丢弃、零副作用）
  if (docKey === null || !filePath) return { ok: false, stale: true };
  // ② N83-4：当前文档 0 条 ⇒ 不发 IPC、不写任何文件（文案由面板渲染，store 不持有字面）
  if (currentDocNoteCount.value === 0) return { ok: false, empty: true };
  // ③ 发起瞬间快照：归属令牌 + 显示名（保原大小写）
  const scope = reportScope;
  const displayName = docDisplayName(filePath);
  const pageCount = readerStore.pageCount;
  // ④ 章节入参只取自既有唯一派生；pageCount === 0 ⇒ 不派生章节（避免 Infinity end 外泄）
  const chapters =
    pageCount > 0
      ? [...buildChapterRanges(readerStore.outline, pageCount).values()].map((range) => ({
          title: range.title,
          start: range.start,
          end: range.end,
          label: range.label,
        }))
      : [];
  const progress = pageCount > 0 ? { page: readerStore.page, pageCount } : null;
  try {
    const result = await bridge().notesExportReport({ docFilePath: filePath, chapters: chapters, progress: progress });
    // ⑤ 在途归属守卫：文档已切换或 store 已 reset ⇒ 丢弃结果（成功与失败同一处理）
    if (scope !== reportScope || currentDocKey.value !== docKey) return { ok: false, stale: true };
    if (!result.success || !result.filePath || !result.displayPath) {
      return { ok: false, message: result.error ?? "生成报告失败" };
    }
    const count = result.count ?? 0;
    lastReport.value = { filePath: result.filePath, displayPath: result.displayPath, displayName, count };
    return { ok: true, filePath: result.filePath, displayPath: result.displayPath, count };
  } catch (err) {
    if (scope !== reportScope || currentDocKey.value !== docKey) return { ok: false, stale: true };
    return { ok: false, message: rejectMessage(err) };
  }
}
```

**冻结性质**：① 章节数组顺序 = `buildChapterRanges` 的 `Map` 插入序（= 有页码节点的预序）⇒ 分组顺序的**唯一来源**；② 映射后剥掉 `key`（IPC 形状只有 `title` / `start` / `end` / `label`）；③ `displayName` 取**发起那一刻**的 `docDisplayName(readerStore.filePath)`（保原大小写），**不得**用 `currentDocKey` 派生；④ 不拼接任何存储路径（`filePath` / `displayPath` 一律取主进程回传值）；⑤ 同一时刻最多一个在途（由面板 `exportingReport` 保证）；⑥ 失败不写 `lastReport`、不污染 `status` / `errorCode`。

**§1.8 #9 的判据前提（实现纪律，逐字）**：本文件内带冒号的 `chapters` 字面只允许出现在入参对象字面量那一行（逐字写 `chapters: chapters`，**不得用简写 `chapters`**）；章节数组的声明**不得写类型注解**（否则多一行命中）；代码注释同样不得包含该字面（注释里的同名写法也会让 `grep -c` 的行计数变 2）。

#### 1.6.3 清理点（两处，逐字）

| 位置 | 改动 |
| --- | --- |
| `watch(currentDocKey, …)`（`:126-128`） | 函数体由一行变两行：`chapterFilter.value = null;` + `lastReport.value = null;`（文档作用域切换即清除报告行） |
| `resetNotes()`（`:272-289`） | 增两行：`reportScope += 1;`（紧邻 `undoScope += 1;`）与 `lastReport.value = null;`（紧邻 `lastExport.value = null;`） |
| `return { … }`（`:335-394`） | 暴露 `lastReport`、`currentDocNoteCount`、`exportCurrentDocReport` 三个名字（Pinia setup store 的成员暴露；`grep` 计数口径见 §1.8 #11/#13） |

### 1.7 面板（`NotesPanel.vue`）：DOM / 类名 / 文案 / 门控 / 样式

#### 1.7.1 入口行（模板逐字；插在 `.notes-header-top` 之后、`.notes-search` 之前）

```html
      <div v-if="notesStore.status === 'ready'" class="notes-report-actions">
        <v-btn
          class="notes-report-btn"
          size="small"
          variant="tonal"
          prepend-icon="mdi-file-document-outline"
          block
          title="导出当前文档的阅读报告（Markdown）"
          :disabled="!notesStore.currentDocKey || exportingReport"
          :loading="exportingReport"
          @click="onExportReport"
        >
          导出当前文档报告
        </v-btn>
      </div>
```

| 项 | 逐字值 |
| --- | --- |
| 容器类名 / 渲染条件 | `.notes-report-actions`；`v-if="notesStore.status === 'ready'"`（错误态与加载态整行不渲染 ⇒ 「错误态下整行不进 DOM」由该条件承担） |
| 按钮类名与属性 | `.notes-report-btn`（`v-btn`，`size="small"`、`variant="tonal"`、`prepend-icon="mdi-file-document-outline"`、`block`）；`title` 逐字 `导出当前文档的阅读报告（Markdown）` 落在根 `button` 元素 |
| 按钮文本 | `导出当前文档报告`（**恒定**，不随状态变化；不出现 `暂无笔记` 类变体） |
| 禁用 / 在途 | `:disabled="!notesStore.currentDocKey \|\| exportingReport"`、`:loading="exportingReport"` |
| 行宽 | `block` 属性（Vuetify 真实实现：`.v-btn--block { min-width: 100% }`）⇒ 占满容器行宽，**不自定义 CSS 宽度** |

#### 1.7.2 状态行（模板逐字；插在 `.notes-export-row` 之后、`.notes-loading` 之前）

```html
    <div v-if="notesStore.lastReport" class="notes-report-row">
      <span class="report-text">报告：{{ notesStore.lastReport.displayName }}（{{ notesStore.lastReport.count }} 条）→ {{ notesStore.lastReport.displayPath }}</span>
      <v-btn
        class="report-reveal"
        size="x-small"
        variant="text"
        prepend-icon="mdi-open-in-new"
        @click="revealPath(notesStore.lastReport.filePath)"
      >
        在文件夹中显示
      </v-btn>
    </div>
```

| 项 | 逐字值 |
| --- | --- |
| 容器类名 / 渲染条件 | `.notes-report-row`；`v-if="notesStore.lastReport"` |
| 行文本 | `.report-text` = `报告：{显示名}（{N} 条）→ {displayPath}`（`{显示名}` = `lastReport.displayName`、`{N}` = `lastReport.count`、`{displayPath}` = `lastReport.displayPath`） |
| 夹具实例 | `报告：sample-paper.pdf（3 条）→ .pix-read/reports/sample-paper.pdf.md`；`报告：older-paper.pdf（1 条）→ .pix-read/reports/archive/older-paper.pdf.md`；`报告：reading-notes.md（1 条）→ .pix-read/reports/reading-notes.md.md` |
| 行按钮 | `.report-reveal`（`v-btn`，`size="x-small"`、`variant="text"`、`prepend-icon="mdi-open-in-new"`）文本 `在文件夹中显示`，点击 `revealPath(notesStore.lastReport.filePath)`（复用既有函数，零改动） |
| 成功反馈 | **只有**这一行：不弹 `.notes-notice`（一次动作只给一处反馈） |

#### 1.7.3 handler（逐字；范式 = 既有 `onUndoClick`）

```ts
const exportingReport = ref(false);

async function onExportReport(): Promise<void> {
  if (exportingReport.value) return;
  exportingReport.value = true;
  try {
    const result = await notesStore.exportCurrentDocReport();
    if ("stale" in result) return; // 归属守卫：零副作用（不弹提示、不动行）
    if ("empty" in result) {
      setNotice("error", "当前文档暂无笔记，未生成报告");
      return;
    }
    if (!result.ok) setNotice("error", `生成报告失败：${result.message}`);
  } finally {
    exportingReport.value = false;
  }
}
```

| 项 | 逐字值 |
| --- | --- |
| 首行守卫 | `if (exportingReport.value) return;`（与 `onExport` 的 `exporting` 守卫同范式）⇒ 在途重复点击**不发第二次 IPC** |
| 在途翻转 | 只在 `try/finally` 内翻转（`finally` 复位）⇒ 失败 / `stale` / `empty` 都不会把按钮留在 loading |
| 无笔记提示 | `.notes-notice.is-error` 逐字 `当前文档暂无笔记，未生成报告`（**无前缀**；与主进程 `empty` 文案逐字相同） |
| 失败提示 | `.notes-notice.is-error` 逐字 `生成报告失败：{主进程 error}`（如 `生成报告失败：报告写入失败`） |
| `stale` | 零副作用（不弹提示、不改 `lastReport`、不改按钮文案） |

#### 1.7.4 样式（逐字新增到 `<style scoped>`；与既有行同盒模型）

```css
/* 报告入口行：位于头部首行之后、搜索行之前；未就绪时整行不进 DOM */
.notes-report-actions {
  display: flex;
  align-items: center;
}

.notes-report-btn {
  font-size: 11px;
}

/* 报告状态行：盒模型逐字对齐既有 .notes-export-row / .export-text */
.notes-report-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 10px 6px;
  padding: 6px 8px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: var(--pix-radius-md);
  background: var(--pix-bg-elevated, #ffffff);
}

.report-text {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--pix-text-secondary);
  word-break: break-word;
}
```

| 项 | 冻结 |
| --- | --- |
| 插入位置 | `.notes-report-actions` / `.notes-report-btn` 两条规则放在既有 `.notes-search` 规则（`:718`）之前；`.notes-report-row` / `.report-text` 两条规则放在既有 `.export-text` 规则（`:983-990`）之后 |
| 不新增 | 不新增全局 CSS 变量、不新增主题色、不加过渡动画 |
| 不变量 | `.notes-header-top` / `.notes-export-row` / `.export-text` 的规则零 diff；`.notes-export-btn` 的规则零 diff |

#### 1.7.5 面板走查判据（命令级）

| # | 命令 | 期望 |
| --- | --- | --- |
| 1 | `grep -n "notes-report-actions\|notes-report-btn\|notes-report-row\|report-text\|report-reveal" pix/src/renderer/components/workspace/NotesPanel.vue` | **9 行** = 模板 **5** 行（`class="notes-report-actions"` / `class="notes-report-btn"` / `class="notes-report-row"` / `class="report-text"` / `class="report-reveal"`，见 §1.7.1 / §1.7.2）+ 样式 **4** 行（`.notes-report-actions` / `.notes-report-btn` / `.notes-report-row` / `.report-text`，见 §1.7.4）；面板不出现选择器字面量（`.report-reveal` 只有模板与按钮谓词，无样式规则、无选择器字符串） |
| 2 | `grep -rn "阅读报告" pix/src` | 命中集合 ⊆ {`NotesPanel.vue`（按钮 `title`，1 处）、`pix/src/main/notes-store.ts`（`# 阅读报告 · ` 模板行，1 处）} ⇒ 共 **2** 处；`grep -rn "阅读报告" pix/src/renderer \| wc -l` = **1**（渲染层只有 title 一处字面，不得出现第二份报告模板） |
| 3 | `grep -rn "导出当前文档报告" pix/src` | 恰 1 处（面板模板） |
| 4 | `grep -rn "reports/\|\.pix-read" pix/src/renderer` | **0**（渲染层不拼存储路径、不出现 `reports/` 前缀） |
| 5 | `git diff -- pix/src/renderer/components/workspace/NotesPanel.vue \| grep -E "^[-]" \| grep -v "^---"` | 只允许 `.notes-header-top` 与 `.notes-export-row` 插入点的相邻行位移（`v-if` 行前缀变化为 `+` 侧）；**不得**出现 `.notes-header-top` 内部任何行的删除或改写 |

### 1.8 走查判据（命令级，正反双向）

| # | 命令 | 期望 |
| --- | --- | --- |
| 1 | `grep -n "start <= \|<= chapter.end\|rangeContains" pix/src/main/notes-store.ts` | 恰 1 处（报告渲染的闭区间谓词）；`pix/src/main/**` 内 `buildChapterRanges` / outline 解析 **0** 命中（`grep -rn "buildChapterRanges\|ReaderOutlineNode" pix/src/main` = 0） |
| 2 | `grep -c "writeFileAtomic(" pix/src/main/notes-store.ts` | 改前 **7** ⇒ 改后 **8**（新增恰 1 处，目标为报告路径）；`git diff` 不显示 `writeFileAtomic` 函数体 |
| 3 | `grep -c "报告参数不合法" pix/src/main/ipc-handlers.ts` | `1`；`grep -c "function isReaderNotesReportInput" pix/src/main/ipc-handlers.ts` = `1` |
| 4 | `grep -rn "notes-export-report" pix/src` | 恰 2 处（`ipc-handlers.ts` 的 `ipcMain.handle`、`preload.ts` 的 `ipcRenderer.invoke`），通道名逐字一致 |
| 5 | `grep -n "renderNotesMarkdown\|renderMarkdownEntry\|exportNotesMarkdown\|notes-export\b" pix/src/main/notes-store.ts pix/src/main/ipc-handlers.ts` | 与改前逐字相同（行号可后移）；`git diff -- pix/src/main/notes-store.ts` 不显示 `renderNotesMarkdown` / `renderMarkdownEntry` 函数体 |
| 6 | `grep -c "### 第 " pix/src/main/notes-store.ts` | 改前 **1** ⇒ 改后 **1**（新报告不产出 `### ` 标题） |
| 7 | `grep -rn "reports" pix/src` | 命中集合 ⊆ {`pix/src/main/notes-store.ts` 的路径常量与模板、`pix/src/shared/types.ts` 的 `displayPath` 注释}；`grep -rn "reports" pix/src/renderer` = 0 |
| 8 | `grep -rn "Date.now()" pix/src/main/notes-store.ts` | 报告路径只新增 1 处（`renderDocumentReport` 的 `now` 实参） |
| 9 | `grep -c "chapters:" pix/src/renderer/stores/notes-store.ts` | `1`（入参对象字面量恰一处；**不以类型名计数**——`ReaderNotesReportInput` 允许只出现在 `import type` 行或完全不出现） |
| 10 | `grep -rn "docDisplayName(currentDocKey)" pix/src/renderer` | `0`（显示名不得由小写比较键派生） |
| 11 | `grep -rn "exportCurrentDocReport" pix/src \| grep -v "stores/notes-store.ts" \| wc -l` | `1`（只有面板一处调用；store 内的定义与 `return` 暴露不计入口） |
| 12 | `grep -c "notesExportReport" pix/src/main/preload.ts` | `2`（接口 + 实现各 1） |
| 13 | `grep -c "lastReport.value = null" pix/src/renderer/stores/notes-store.ts` | `2`（`watch(currentDocKey)` 与 `resetNotes()` 各一处）；`grep -c "lastReport.value = {" pix/src/renderer/stores/notes-store.ts` = `1`（成功写入恰 1 处） |
| 14 | `grep -rn "lastReport" pix/src` | 命中集合 ⊆ {渲染层 store、`NotesPanel.vue`}；不出现落盘路径（不写 settings / `notes.json` / `reader-state.json`） |
| 15 | `grep -rn "当前文档暂无笔记，未生成报告" pix/src` | 恰 **2** 处（`notes-store.ts` 的 `REPORT_EMPTY_MESSAGE`、`NotesPanel.vue` 的 `setNotice` 行） |
| 16 | `grep -rn "报告写入失败" pix/src` | 恰 **1** 处（`notes-store.ts` 的 `REPORT_WRITE_FAILED_MESSAGE`） |
| 17 | `git diff -- pix/src/renderer/utils/outline-notes.ts pix/src/renderer/utils/notes-path.ts` | 全部为空（R12 章节语义零改动） |
| 18 | `git diff -- pix/package.json package-lock.json packages pix/tsconfig.json pix/tsconfig.main.json pix/tsconfig.preload.json pix/vite.config.ts README.md .gitignore pix/scripts/smoke-view.mjs` | 全部为空 |
| 19 | `git status --short` | 只出现白名单：`M` **八个**源码/脚本（= §4 第 1–8 行：`shared/types.ts`、`main/notes-store.ts`、`main/ipc-handlers.ts`、`main/preload.ts`、`scripts/smoke-notes.mjs`、`renderer/stores/notes-store.ts`、`workspace/NotesPanel.vue`、`scripts/ui-shot.mjs`）+ `?? docs/pm/R13-*.md`（`M` 行的计数不含 `?? docs/pm/R13-*.md`） |
| 20 | `grep -n "toLowerCase" pix/src/main/notes-store.ts pix/src/main/library-root.ts` | 命中集合 = {`notes-store.ts:100`（`docPathKey` 比较键）、`library-root.ts:35`（`normalizeFsPath` 平台归一）}：报告面**不出现第三种**大小写变换（`target` / meta 行 `文档：` 段 / `displayPath` 一律用 `toRelativeDocPath` 的原串） |
| 21 | `grep -c "normalizeNoteText" pix/src/main/notes-store.ts` | 改前 **2**（`:104` 定义、`:302` 写入归一化）⇒ 改后 **3**（新增 `reportChapterTitle` 一处）；不写第二份空白折叠 |

---

## 2. 与既有冻结面的关系

### 2.1 本轮不得改动的既有类名 / 文案 / 场景 / 断言

| 面 | 冻结内容 |
| --- | --- |
| R10 `notes.md` 导出 | 模板与文案逐字不动：`# 阅读笔记 · {工作区名}`、元信息行 `> 由 PiX-Read 导出生成，每次导出都会覆盖。资料库：{名}；生成时间：{YYYY-MM-DD HH:mm:ss}；共 {N} 条。`、组标题 `## {docPath}（{N} 条）`、条目 `renderMarkdownEntry`、条目间 `\n\n---\n\n`、文件末尾 `\n`；`renderNotesMarkdown` / `exportNotesMarkdown` / `notesPaths().markdown` / `notes-export` 通道 / `notesExport` 方法名零 diff |
| R10 面板既有字面 | `导出 Markdown` / `暂无笔记`（`exportLabel`）、`.notes-export-btn` 的 `:disabled` 与 `:loading`、`.notes-export-row` + `.export-text` 逐字 `已导出 {N} 条 → .pix-read/notes.md`、失败 `导出失败：{message}`、`.notes-header-top` 内既有元素的内容与顺序、`.notes-count` 的四分叉文案 |
| R8 / R9 / R10 视图维度 | 选择集（id 集合、上限 10、注入顺序 `sortNotesForContext`）、章节过滤（`matchesChapterFilter` 唯一判定式、`groupNotesByDocument` 第四参）、搜索/排序（`matchesSearch` / `sortNotesForView` / `applyViewToGroups`）—— 报告**不受**任何视图维度影响 |
| R12 章节语义 | `buildChapterRanges` 的区间算法与 `Map` 插入序、`resolveCurrentChapter` / `resolveChapterNav` / `formatChapterHeading` 的签名与语义、`.reader-section` 与 `<reading_context>` 的 `section:` 行 —— 报告只**读**这一份产出（主进程不解析 outline、不重算区间） |
| R12 取证契约 | `ui-shot.mjs` 的启动守卫（`PIX_SHOT_ROOT` 必须在系统临时目录内且与仓库互不包含）、产物自净（只删 `<OUT_ROOT>/shots`）、结束自检（截图集合与清单双向相等 + 白名单外条目即失败）、`SEL` 与既有场景/截图/label **零删除** |
| 全局类名与文案 | `.notes-*` / `.pdf-*` / `.map-*` / `.tree-*` / `.reader-section*` / `.page-label` / `.zoom-label`；主进程 `ReaderNotesErrorCode` 与 `ERROR_MESSAGES` 的既有 11 键 |
| 口径收窄（评审 S-2 登记） | 阅读进度**只取**渲染层实时内存值（`readerStore.page` / `readerStore.pageCount`），**不读也不写** `reader-state.json`：与 `PRD-V0.5.md` §1「进度来自 `reader-state.json` 与渲染层 `pageCount`」在正常路径下等值（落盘的 `page` 与内存值同源），本轮为消歧而收窄，属**登记项**而非漂移 |
| 既有烟测面 | `smoke-view.mjs` 整文件零 diff（4 组 29 条只作回归）；`smoke-notes.mjs` 既有 4 组 26 条与输出协议零改动（只追加 3 组与 `main()` 三行调用） |

### 2.2 本轮对既有面的显式改动（逐字：文件 / 行 / 旧值 / 新值 / 理由）

| # | 文件 : 行 | 旧值（逐字） | 新值（逐字） | 理由 |
| --- | --- | --- | --- | --- |
| 1 | `pix/scripts/ui-shot.mjs:767`（stub 的 `libraryShowInFolder`） | `  libraryShowInFolder: async function () { return { success: true }; },` | `  libraryShowInFolder: async function (targetPath) { libraryShowPaths.push(String(targetPath === null \|\| targetPath === undefined ? "" : targetPath)); return { success: true }; },`（另在 stub 顶部 `const sendCalls = [];` 邻区新增 `const libraryShowPaths = [];`） | 「在文件夹中显示」此前只有返回值无记录 ⇒ `r13-5` 相位 `reveal-and-clear` 的 ⑥ 无判据；行为（返回值、无副作用）逐字不变，只增记录 |
| 2 | `pix/scripts/ui-shot.mjs:372`（`writeFixtures()` 内，`.pix-read` 目录创建之后） | 无（既有 8 行没有 reports 相关语句） | 追加一行 `  rmSync(join(LIBRARY_DIR, ".pix-read", "reports"), { recursive: true, force: true });` | 每次运行从「无报告目录」开始 ⇒ `r13-1` 的「报告文件不存在」与 `r13-5` 的「删掉目录不影响功能」两类断言才可复现（**纯追加，不改既有行**） |

**其余既有面改动 = 0**：`smoke-notes.mjs` 的既有 4 组 26 条、`smoke-view.mjs` 整文件、`ui-shot.mjs` 的既有场景函数体 / 既有 `record` 调用 / 既有 `capturePage` / 既有 label / 既有截图名 / `SEL` 既有 40 项 / 既有 stub 方法（`notesExport` 等）**全部零 diff、零删除**。

**本轮改写的既有断言（逐字列出）**：**无**。`grep -E "^[-]"` 过滤后的 `ui-shot.mjs` diff 只允许出现 §2.2 两处的相邻行位移与新增块；`smoke-notes.mjs` 的 diff 只允许出现新增常量/helper/函数与 `main()` 的三行调用追加。

### 2.3 零 diff 判据命令

```bash
cd E:/develop/PiX-Read
git diff -- pix/src/renderer/utils pix/src/renderer/stores/reader-store.ts pix/src/renderer/stores/project-store.ts \
           pix/src/renderer/components/workspace/PdfViewer.vue pix/src/renderer/components/workspace/KnowledgeMap.vue \
           pix/src/renderer/components/workspace/ReaderPanel.vue pix/src/renderer/components/workspace/LibraryPanel.vue \
           pix/src/renderer/components/workspace/ChatPanel.vue pix/src/main/library-root.ts pix/src/main/reader-state-store.ts \
           pix/src/main/session-bridge.ts pix/src/main/reading-prompt.ts pix/scripts/smoke-view.mjs \
           pix/package.json package-lock.json packages pix/tsconfig.json pix/tsconfig.main.json pix/tsconfig.preload.json \
           pix/vite.config.ts pix/resources README.md .gitignore
# ⇒ 全部路径逐条为空（含 pix/src/renderer/utils/outline-notes.ts 与 notes-path.ts）

git diff -- pix/scripts/ui-shot.mjs | grep -E "^[-]" | grep -v "^---"
# ⇒ 只允许 §2.2 #1 / #2 的相邻行位移；不得出现既有 record / capturePage / label / SEL 项的删除
```

---

## 3. 失败路径表

| # | 情形 | 期望表现（逐字） | 证据 / 判据 |
| --- | --- | --- | --- |
| 1 | **无工作区根**（`getLibraryRoot() === ""`） | `notesPaths()` 返回 `null` ⇒ `{ success: false, code: "no-root", error: "尚未选择资料库根目录" }`；零写盘（不建 `.pix-read/reports`） | 烟测 `report-failures` #1；§1.3.1 首分支 |
| 2 | **文档不在库内**（库外绝对路径、含 `..` 的相对路径、解析后落在库外的相对路径） | `toRelativeDocPath` ⇒ `null` ⇒ `{ code: "outside", error: "该文档不在当前资料库内" }`；零写盘 | 烟测 `report-failures` #2；§1.4.2 越界判定式 |
| 3 | **报告目标路径越界**（理论上不可达的第二层防护） | `isPathInsideDirectory(target, paths.reports)` 为假 ⇒ 同 `outside`（不新增码、不新增文案） | §1.4.2「双重防护」；走查 §1.8 #1 |
| 4 | **该文档无笔记** | `{ code: "empty", error: "当前文档暂无笔记，未生成报告" }`，**不创建目录、不创建文件**；渲染层侧同判 ⇒ 不发 IPC、不写文件，面板 `.notes-notice.is-error` 逐字同一句 | 烟测 `report-failures` #3；离屏 `r13-1` 相位 `no-notes-notice`（④⑤⑥）；§1.6.2 ② |
| 5 | **`notes.json` 读取失败 / 损坏 / 版本不支持** | 分别 `read-failed`（`笔记文件读取失败`）/ `corrupt`（`笔记文件无法读取（文件已损坏，未被修改）`）/ `version-unsupported`（`笔记文件版本不支持`）；三者都零写盘（`notes.json` 字节不变 + `reports` 目录条目集合不变） | 烟测 `report-failures` #5 / #6；§1.3.1 的 `readNotesFile` 分支 |
| 6 | **写盘失败**（tmp 写入或 `renameSync` 失败） | `{ code: "write-failed", error: "报告写入失败" }`；既有报告文件字节不变；`notes.json` / `notes.md` 字节不变 | 烟测 `report-failures` #4 注入 ①（`<报告>.tmp` 预置为**目录**） |
| 7 | **目录创建失败**（目标父级被同名**文件**占用，`mkdirSync(dirname(target), { recursive: true })` 抛错） | 由 `writeFileAtomic` 的既有 `catch` 统一返回 `{ code: "write-failed", error: "报告写入失败" }`（**不新增码、不新增文案**）；不保证失败后的目录状态（可能留下已创建的空目录） | 烟测 `report-failures` #4 注入 ②（`.pix-read/reports/archive` 预置为同名文件） |
| 8 | **并发点击（同一同步段内连点两次）** | 第二次点击被两处守卫**任一**拦下（DOM `disabled` 或 handler 首行 `if (exportingReport.value) return;`）⇒ **只发 1 次 IPC**；按钮保持在 loading；`finally` 复位 | 离屏 `r13-5` 相位 `inflight-guard` ⑩（`notesReportCalls().count` 增量恰 1）；§1.7.3 |
| 9 | **在途切文档 / 在途离开工作区** | 迟到的响应落地时 `scope !== reportScope \|\| currentDocKey !== docKey` ⇒ **丢弃**：不写 `lastReport`、不弹 `.notes-notice`（成功与失败同一处理）、动作返回 `{ ok: false, stale: true }`；`exportingReport` 仍由 `finally` 收口 | 离屏 `r13-5` 相位 `inflight-guard` ⑪（行不在 DOM、notice 为 `null`）；§1.6.2 ⑤、§1.6.3 |
| 10 | **章节数组含倒序范围**（`{start:5,end:3}`，`buildChapterRanges` 在书签页码超过 `pageCount` 时的合法产出） | **不整体拒绝**（不是 `invalid-input`）：该组因闭区间谓词恒不命中而不出现在报告中，导出**成功**且其余组逐字不变 | 烟测 `report-render` #7；§1.2.2 `chapters` 行、§1.5.2 归组谓词 |
| 11 | **`chapters === []`（无 outline / 文档未传章节 / `pageCount === 0`）** | 退化按页分组（页升序）；不渲染任何章节组与兜底组；不伪造章节标题 | 烟测 `report-render` #5、`report-files` #2；离屏 `r13-4` 两相位 |
| 12 | **笔记页超出 `pageCount`**（p9 笔记） | 不钳制、不改写 `notes.json`、不丢条：该条不命中任何章节 ⇒ 归入 `未归入章节`（恒最后） | 烟测 `report-render` #4；离屏 `r13-3` 相位 `fallback` |
| 13 | **报告目录被删 / 用户手工清空** | 下次导出自愈重建（`mkdirSync({ recursive: true })`），内容与首次相同（时间戳归一化）；`loadNotes` / `addNote` / `exportNotesMarkdown` 不受影响 | 烟测 `report-files` #5；离屏 `r13-5` 前置（删目录） |
| 14 | **入口在不该出现时出现**（错误态 / 加载态渲染了入口行） | 判红：`r13-1` 相位 `disabled-no-doc` 的前置是「面板 ready 且有 4 条笔记」；`v-if="notesStore.status === 'ready'"` 是唯一条件（§1.7.1） | §1.7.1；既有场景 01 / 52 的错误态截图零缺失即为反向证据 |
| 15 | **入口挤动既有版面**（按钮换行 / 计数文本被压 / 导出按钮被挤走） | 判红：`r13-1` 相位 `enabled-with-doc` ③（`.notes-count` = `共 4 条`、`.notes-export-btn` = `导出 Markdown`）+ `reportProbe()` 的 `entryWidthOk` / `entryBelowHeader` | §1.7.5、§5.2.2 |

---

## 4. 文件级清单（动作 + 具体改动点 + 不变量）

| # | 文件 | 动作 | 具体改动点 | 不变量 |
| --- | --- | --- | --- | --- |
| 1 | `pix/src/shared/types.ts` | 修改 | 新增 `ReaderNotesReportChapter` / `ReaderNotesReportInput` / `ReaderNotesReportResult` 三接口（逐字见 §1.1.2，连续放置于 `ReaderNotesExportResult` 之后） | `ReaderNotesErrorCode` **不扩**（11 键不变）；既有类型零 diff；无 `any` |
| 2 | `pix/src/main/notes-store.ts` | 修改 | 新增 `REPORTS_DIR_NAME` / `REPORT_EMPTY_MESSAGE` / `REPORT_WRITE_FAILED_MESSAGE`；`interface NotesPaths` 增 `reports`；`notesPaths()` 增 `reports` 计算；新增 `sortReportEntries` / `reportChapterTitle` / `reportBlocks` / `renderDocumentReport`（§1.5.2）与导出函数 `exportDocumentReport`（§1.3.1）；import 面加三个类型 | `renderNotesMarkdown` / `renderMarkdownEntry` / `exportNotesMarkdown` / `resetCorruptNotes` / 其余既有函数与常量零 diff；`writeFileAtomic` 调用点增量恰 1（§1.8 #2）；不新增写盘函数；不 import outline 相关模块；无内联动态 import |
| 3 | `pix/src/main/ipc-handlers.ts` | 修改 | 新增 `isReportChapter` / `isReaderNotesReportInput` / `REPORT_INVALID_MESSAGE` / `invalidReportInput()`（§1.2.1）与 `ipcMain.handle("notes-export-report", …)`（§1.1.1）；import 加 `exportDocumentReport` + 三个类型 | 既有 7 个笔记 handler 与 `invalidNotesInput()` 零 diff；守卫纯函数（不做 I/O、不抛错）；既有 11 键码表零改动 |
| 4 | `pix/src/main/preload.ts` | 修改 | `PixApi` 与 `api` 各新增 1 处 `notesExportReport`（§1.1.3）；import 加两个类型 | 既有 40 个方法逐字不动（改后各 41）；`libraryShowInFolder` 等零 diff |
| 5 | `pix/src/renderer/stores/notes-store.ts` | 修改 | 新增 `ExportDocReportResult`（类型）/ `lastReport` / `currentDocNoteCount` / `reportScope` / `exportCurrentDocReport()`（§1.6.1 / §1.6.2）；`watch(currentDocKey)` 与 `resetNotes()` 各增清理行；`return` 暴露三个名字；import 加 `ReaderNotesReportChapter`、`buildChapterRanges` 与 `docDisplayName`（`../utils/notes-path` 既有导出，§1.6.2 ③ 用到；三条都是顶层 import） | 不拼接任何存储路径；既有动作（`loadNotes` / `addNote` / `removeNote` / `undoDelete` / `exportMarkdown` / `recoverCorruptNotes` / `resetNotes` 的既有行）/ 派生（`groups` / `visibleCount` / `countLabel` 输入）/ 注入顺序零改动；不写第二处文档归属比较；无 `any` |
| 6 | `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | 新增 `exportingReport` ref、`onExportReport()`（§1.7.3）、`.notes-report-actions` 模板块（§1.7.1）、`.notes-report-row` 模板块（§1.7.2）、两组 scoped 样式（§1.7.4） | `.notes-header-top` 模板零 diff；`.notes-export-row` / `.export-text` 零 diff；既有 handlers（`onExport` / `revealPath` / `onUndoClick` 等）与既有样式零 diff；不出现 `.pix-read` / `reports/` 字面 |
| 7 | `pix/scripts/smoke-notes.mjs` | 修改 | 新增常量（`DOC_ARCHIVE` / `REPORTS_A` / `REPORTS_ARCHIVE_A` / `REPORT_A` / `REPORT_ARCHIVE_A` / `STAMP_RE` / `normalizeStamp` / `SAMPLE_CHAPTERS` / `REPORT_STAMP_STEP_MS` / 三条报告夹具文本）与三个函数 `runReportRender` / `runReportFiles` / `runReportFailures`（§5.1）；`main()` 追加三行调用 | 既有 4 组 26 条与输出协议零改动；期望值手写（不得由被测函数生成）；只读仓库源文件、只写 `%TEMP%`；运行后零残留 |
| 8 | `pix/scripts/ui-shot.mjs` | 修改 | stub：新增 `notesExportReport`（真写 + 记录 + 失败/延迟注入）、`libraryShowInFolder` 增记录（§2.2 #1）、`__pixStub` 增四个控制口；`writeFixtures()` 增一行 reports 清理（§2.2 #2）；`SEL` 增 4 项；新增 4 个 helper（§0.3 / §5.2.1）；新增 `r13-1`…`r13-5`（5 组 13 条 record / 8 张截图） | 既有场景 / 相位 / label / 截图名零改动、零删除；`SEL` 只增 4 项；只写 `OUT_ROOT`；`record` 语义（先落测量再抛错）不变；R13 块末仍以 `restoreStandardSeed()` 收尾 |
| 9 | `pix/package.json` | **不改**（登记为不动） | 报告烟测就地扩展 `smoke-notes.mjs` ⇒ 不新增 script | `dependencies` / `devDependencies` / `scripts` 逐字零改动；`package-lock.json` 零改动 |
| 10 | `docs/pm/R13-design.md` | 新建（本档） | —— | 不改源码 |

**范围外（任何情况下不动）**：`packages/**`、`package-lock.json`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/src/renderer/utils/**`（含 `outline-notes.ts` / `notes-path.ts` / `notes-view.ts` / `reading-context.ts`）、`pix/src/renderer/stores/{reader-store,reader-state-store,project-store,chat-store}.ts`、`pix/src/renderer/components/workspace/{PdfViewer,KnowledgeMap,ReaderPanel,LibraryPanel,PdfSearchPanel,PdfSelectionQuickAsk,ChatPanel}.vue`、`pix/src/main/{library-root,reader-state-store,session-bridge,reading-prompt}.ts`、`pix/scripts/smoke-view.mjs`、`pix/resources/**`、`docs/pm/**` 的历史档件、`.gitignore`、`README.md`。

---

## 5. 验证方案

### 5.1 主进程数据面烟测（`pix/scripts/smoke-notes.mjs`，3 组 18 条）

**冻结的组与条数（不得减少）**：`report-render` **7** / `report-files` **5** / `report-failures` **6** = **18 条**；追加在既有 4 组（26 条）之后，`main()` 调用顺序固定为 `runUndoRoundtrip → runUndoFailures → runUndoSlotLifecycle → runExportAndEmpty → runReportRender → runReportFiles → runReportFailures`；末行仍逐字 `通过 {passed} / 失败 {failed}`（改后期望 `通过 44 / 失败 0`）。

#### 5.1.1 新增常量与 helper（逐字）

```js
const DOC_ARCHIVE = join(WS_A, "archive", "older-paper.pdf");
const REPORTS_A = join(PIX_READ_A, "reports");
const REPORTS_ARCHIVE_A = join(REPORTS_A, "archive");
const REPORT_A = join(REPORTS_A, "sample-paper.pdf.md");
const REPORT_ARCHIVE_A = join(REPORTS_ARCHIVE_A, "older-paper.pdf.md");
const REPORT_COMMENT = "与第 3 节消融实验对照";
const ARCHIVE_TEXT = "Archive excerpt for the subdirectory report.";
const OUT_OF_RANGE_TEXT = "Out-of-range excerpt: this page is beyond the document page count.";
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

/** 3 条夹具笔记（p1 摘录带备注 / p2 摘录 / p2 AI 结论），返回时保证文件与目录为「无报告」初态。
 *  落盘后按文件序把 `createdAt` / `updatedAt` 显式钉住（步长 `REPORT_STAMP_STEP_MS`）：
 *  报告组内次序只依赖 `page` → `createdAt`，不得托付给 addNote 的毫秒级 `Date.now()`
 *  （两次调用落在同一毫秒时第二键相等，次序会落到随机 id 的 `localeCompare` ⇒ §5.1.2 #1/#6 与 §5.1.3 #3 会偶发红）。 */
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

/** §1.5.3 的手写期望串（TEXT_A1/TEXT_A2/TEXT_A3 为既有夹具常量；其余逐字面量）。 */
function expectedRenderA() {
  return [
    "# 阅读报告 · sample-paper.pdf",
    "",
    `> 由 PiX-Read 生成，每次导出都会覆盖。资料库：ws-a；文档：sample-paper.pdf；生成时间：<STAMP>；阅读进度：第 1 / 3 页；共 3 条（摘录 2 · AI 结论 1）。`,
    "",
    "## 1. Abstract · 第 1 页（1 条）",
    "",
    "### 第 1 页",
    `> ${TEXT_A1}`,
    "",
    `备注：${REPORT_COMMENT}`,
    "",
    "## 2. Method Overview · 第 2 页（2 条）",
    "",
    "### 第 2 页",
    `> ${TEXT_A3}`,
    "",
    "---",
    "",
    "### 第 2 页 · AI 结论",
    `> ${TEXT_A2}`,
  ].join("\n") + "\n";
}

/** 子目录 + 无章节 + 无进度的逐字期望串。 */
function expectedArchiveA() {
  return [
    "# 阅读报告 · older-paper.pdf",
    "",
    `> 由 PiX-Read 生成，每次导出都会覆盖。资料库：ws-a；文档：archive/older-paper.pdf；生成时间：<STAMP>；共 1 条（摘录 1 · AI 结论 0）。`,
    "",
    "## 第 7 页（1 条）",
    "",
    "### 第 7 页",
    `> ${ARCHIVE_TEXT}`,
  ].join("\n") + "\n";
}
```

#### 5.1.2 组 `report-render`（7 条）

前置：`libraryRoot.setLibraryRoot(WS_A)`；`seedReportNotes(DOC_A)`（3 条）；读 `REPORT_A` 一律经 `normalizeStamp`。

| # | 断言（失败即红） |
| --- | --- |
| 1 | `exportDocumentReport({ docFilePath: DOC_A, chapters: SAMPLE_CHAPTERS, progress: PROGRESS_3 })` ⇒ `success === true`；`normalizeStamp(readFileSync(REPORT_A, "utf8"))` **逐字节等于** `expectedRenderA()`；且未归一化文本里 `STAMP_RE` 恰命中 **1** 次；把命中串**去掉 `生成时间：` 前缀**（`STAMP_RE` 的命中含该前缀，锚定正则须打在值段上：用捕获组或 `replace("生成时间：", "")`）后匹配 `/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/` |
| 2 | 头部逐字段：第 1 行逐字 `# 阅读报告 · sample-paper.pdf`；元信息行含 `资料库：ws-a`、`文档：sample-paper.pdf`、`阅读进度：第 1 / 3 页`、`共 3 条（摘录 2 · AI 结论 1）` |
| 3 | 空组不渲染：`report.includes("## 2.2 Positional prior") === false`；`^## ` 行**恰好 2 条**且逐字为 `## 1. Abstract · 第 1 页（1 条）` / `## 2. Method Overview · 第 2 页（2 条）` |
| 4 | 兜底组：追加一条 `page = 9` 的摘录（`OUT_OF_RANGE_TEXT`）后重新导出 ⇒ `^## ` 行**最后一条**逐字 `## 未归入章节（1 条）`；`OUT_OF_RANGE_TEXT` 全文出现次数 **1**；统计段逐字 `共 4 条（摘录 3 · AI 结论 1）`；该条不改变既有两个组的内容 |
| 5 | 无章节退化：`chapters: []`（用相同的 3 条夹具，重新 `seedReportNotes`）⇒ `^## ` 行集合逐字 `["## 第 1 页（1 条）", "## 第 2 页（2 条）"]`（页升序）；全文不含 `未归入章节`、不含 ` · 第 ` |
| 6 | 条目与分隔：同页先摘录后结论（`report.indexOf(TEXT_A3) < report.indexOf(TEXT_A2)`）；`### 第 2 页` 与 `### 第 2 页 · AI 结论` 各出现 1 次；全文 `\n\n---\n\n` 恰 **1** 处；`report.endsWith("\n") && !report.endsWith("\n\n")`；逐行 `!/ $/.test(line)`（无行尾空格） |
| 7 | 倒序范围不拒绝：三章入参追加 `{ title: "Beyond", start: 5, end: 3, label: "5" }` ⇒ `success === true`（不是 `invalid-input`）、`report.includes("## Beyond") === false`、`^## ` 行集合与 #3 逐字相同 |

#### 5.1.3 组 `report-files`（5 条）

前置：`libraryRoot.setLibraryRoot(WS_A)`；`seedReportNotes(DOC_A)`（3 条，时间戳按 §5.1.1 钉住）。`REPORTS_A` 由 #1 创建、由 #4 开头删回「无报告」态、由 #5 结尾重建 ⇒ 各条自带现场，不依赖前一组残留。

| # | 断言 |
| --- | --- |
| 1 | 返回面：`filePath` **逐字等于** `REPORT_A`，且 `relative(REPORTS_A, result.filePath) === "sample-paper.pdf.md"`（与 `smoke-notes.mjs:445` 的 `relative(PIX_READ_A, exported.filePath) === "notes.md"` 同口径；**不用** `endsWith("/reports/…")`——`path.join` 在 win32 产 `\`，该式恒 false）、`displayPath` 逐字 `.pix-read/reports/sample-paper.pdf.md`、`count === 3` |
| 2 | 子目录 + 无章节 + 无进度：`addNote(draft(DOC_ARCHIVE, 7, ARCHIVE_TEXT))` ⇒ `exportDocumentReport({ docFilePath: DOC_ARCHIVE, chapters: [], progress: null })` ⇒ `success === true`、`displayPath` 逐字 `.pix-read/reports/archive/older-paper.pdf.md`、`existsSync(REPORTS_ARCHIVE_A) === true`、`normalizeStamp(readFileSync(REPORT_ARCHIVE_A, "utf8"))` 逐字节等于 `expectedArchiveA()`（元信息行**不含** `阅读进度：`） |
| 3 | 幂等覆盖：先 `writeFileSync(REPORT_A, "STALE-CONTENT\n")`，再连续导出两次（同一入参） ⇒ 两次都 `success === true`；文件内容 `normalizeStamp` 后逐字节等于 `expectedRenderA()`、不含 `STALE-CONTENT`；两次的归一化内容**互等** |
| 4 | 零副作用：先 `rmSync(REPORTS_A, { recursive: true, force: true })`（回到「无报告」态，#1–#3 已创建过它）→ 快照 `sha256(NOTES_A)`、`notes.md` 的（存在性 + `sha256`）、`readdirSync(PIX_READ_A).sort()`（**不写死快照内容**：#1–#3 之前该目录已含 `notes.json` / `notes.md` 与既有 `notes.json.corrupt-*` 备份）→ 再导出一次 ⇒ 取同一组快照 ⇒ 三者分别不变、不变、**集合差恰为 `["reports"]`** |
| 5 | 目录可删：`rmSync(REPORTS_A, { recursive: true, force: true })` 后 ⇒ `loadNotes().success === true`、`addNote(draft(DOC_ARCHIVE, 3, "post-delete add")).success === true`（**必须属于另一文档**，否则样本报告内容会变）、`exportNotesMarkdown().success === true`、再次 `exportDocumentReport(sample-paper)` 成功且 `normalizeStamp` 内容与 #1 首次结果**逐字节相同**（目录被重建） |

#### 5.1.4 组 `report-failures`（6 条）

前置：`libraryRoot.setLibraryRoot(WS_A)`；`rmSync(REPORTS_A, { recursive: true, force: true })`（保证组内四条「零写盘」判据非空转）；`seedReportNotes(DOC_A)`。

| # | 断言 |
| --- | --- |
| 1 | 无根：`libraryRoot.clearLibraryRoot()` ⇒ `exportDocumentReport({ docFilePath: DOC_A, chapters: [], progress: null })` ⇒ `code === "no-root"`、`error` 逐字 `尚未选择资料库根目录`、`existsSync(REPORTS_A) === false`；随后 `setLibraryRoot(WS_A)` 复位 |
| 2 | 越界：`docFilePath = join(TMP, "outside", "x.pdf")` ⇒ `code === "outside"`、`error` 逐字 `该文档不在当前资料库内`、`existsSync(REPORTS_A) === false`（`reports` 未新增条目） |
| 3 | 空文档：`docFilePath = join(WS_A, "empty-doc.pdf")`（该文档 0 条） ⇒ `code === "empty"`、`error` 逐字 `当前文档暂无笔记，未生成报告`、`existsSync(REPORTS_A) === false`（目录**未被创建**） |
| 4 | 写失败（两条注入，各判一次）：先以 `{ chapters: SAMPLE_CHAPTERS, progress: PROGRESS_3 }` 成功导出 `sample-paper.pdf` 并记 `sha256(REPORT_A)`；① `mkdirSync(REPORT_A + ".tmp", { recursive: true })` ⇒ 同一入参再导出 ⇒ `code === "write-failed"`、`error` 逐字 `报告写入失败`、`sha256(REPORT_A)` 不变；`rmSync(REPORT_A + ".tmp", { recursive: true, force: true })` 清理后重试 ⇒ `success === true` 且 `normalizeStamp` 内容逐字节等于 `expectedRenderA()`。② **先补夹具** `notesStore.addNote(draft(DOC_ARCHIVE, 7, ARCHIVE_TEXT))`（否则 `DOC_ARCHIVE` 0 条 ⇒ 按 §1.3.2 的判定顺序先命中 `empty`，永远拿不到 `write-failed`），再 `rmSync(REPORTS_ARCHIVE_A, { recursive: true, force: true })` + `writeFileSync(REPORTS_ARCHIVE_A, "x")`（同名**文件**占位）⇒ `exportDocumentReport({ docFilePath: DOC_ARCHIVE, chapters: [], progress: null })` ⇒ `code === "write-failed"`、`error` 逐字 `报告写入失败`；`rmSync(REPORTS_ARCHIVE_A, { force: true })`（删掉占位**文件**，与既有 `rmSync(NOTES_A, { force: true })` 同写法）清理后重试 ⇒ `success === true` 且 `normalizeStamp` 内容逐字节等于 `expectedArchiveA()`（写失败不留半截文件） |
| 5 | 损坏库：快照 `bytesBefore = readFileSync(NOTES_A)` 与 `readdirSync(REPORTS_A).sort()`；`writeFileSync(NOTES_A, "not json")` ⇒ 导出 ⇒ `code === "corrupt"`、`error` 逐字 `笔记文件无法读取（文件已损坏，未被修改）`、`sha256(NOTES_A)` 不变、`REPORT_A` 的 `sha256` 与目录条目集合均不变（无报告文件产生）；随后把 `bytesBefore` 写回 |
| 6 | 版本不支持：`writeFileSync(NOTES_A, '{"version": 2, "notes": []}')` ⇒ 导出 ⇒ `code === "version-unsupported"`、`error` 逐字 `笔记文件版本不支持`、`notes.json` 字节不变、`reports` 目录条目集合不变（零写盘） |

#### 5.1.5 验收判据

| 面 | 判据 |
| --- | --- |
| 【烟测-主进程】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes` 连续两次 ⇒ 退出码 0、末行逐字 `通过 44 / 失败 0` |
| 【走查】 | 既有 4 组 26 条零改动（`git diff` 只显示新增常量/helper/函数与 `main()` 三行调用）；脚本只读仓库源文件、只写 `%TEMP%`、运行后仓库零残留 |
| 失败注入抽样（必须实测并留档；只临时改脚本本身，改完立即还原并 `git diff --exit-code -- pix/scripts/smoke-notes.mjs`） | ① 把 `expectedRenderA()` 的第 1 行改成 `# 阅读报告 · sample-paper` ⇒ 依赖该期望串的三处变红（`report-render` #1、`report-files` #3、`report-failures` #4① 的重试，逐字 `[失败] …：<实际值>`），`report-render` #2–#7 与其余条目照常、退出码 1；② 把 `expectedArchiveA()` 元信息行的 `文档：archive/older-paper.pdf` 改成 `文档：older-paper.pdf` ⇒ 恰好两处变红（`report-files` #2 与 `report-failures` #4② 的重试），**`report-render` 组不受影响**（错误隔离可见）、退出码 1 |

### 5.2 离屏（`pix/scripts/ui-shot.mjs`）：5 场景 / 5 组 / 13 条 record / 8 张截图

#### 5.2.1 `SEL` 新增 4 项 + 新增 4 个 helper（语义冻结、命名自由）

| 项 | 值 |
| --- | --- |
| `SEL` 新增（逐字，追加在既有 `composerInput: ".input-area",`（`:100`）之后、`};`（`:101`）之前） | `reportBtn: ".notes-report-btn"`、`reportRow: ".notes-report-row"`、`reportText: ".notes-report-row .report-text"`、`reportReveal: ".notes-report-row .report-reveal"`（**恰 4 项，不得多增**） |
| 追加位置（块级） | R13 块追加在 `runReaderStateScenarios` 的最后一条语句 `await restoreStandardSeed();`（`:7263`）**之后**、函数收口 `}`（`:7264`）**之前**；顺序 = helper 块 → `r13-1` → `r13-2` → `r13-3` → `r13-4` → `r13-5`，块的最后一条语句仍是 `await restoreStandardSeed();` |
| `reportProbe()` | 一次 `js` 读 `{ btnInDom, btnText, btnTitle, btnDisabled, btnRect, searchRect, headerTopRect, rowInDom, rowText, revealText, countText, exportLabel }`（字段集合封闭，不得携带无断言语义的字段）；文本一律 `textContent.replace(/\s+/g, " ").trim()`；rect 一律 `getBoundingClientRect()` + `Math.round`（与 `rectOfSelector:2259` 同口径，字段 `x/y/width/height`）；`btnDisabled = btn.disabled`（布尔，元素缺失为 `null`）；`searchRect` 取 `.notes-search` 容器（比对行宽）、`headerTopRect` 取 `.notes-header-top` |
| `readReport(relPath)` | `readFileSync(join(LIBRARY_DIR, ".pix-read", "reports", ...relPath.split("/")), "utf8")`（Node 侧；元素缺失即抛错，不静默返回空串） |
| `reportExists(relPath)` | `existsSync(join(LIBRARY_DIR, ".pix-read", "reports", ...relPath.split("/")))` |
| `normalizeStamp(text)` | `text.replace(/生成时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/, "生成时间：<STAMP>")`（与烟测 `STAMP_RE` 逐字同一条表达式） |
| 复用（不得重声明） | `clickEl` / `textOf` / `has` / `countOf` / `notesNotice` / `openNotesPanel` / `restoreStandardSeed` / `enterCleanWorkspace` / `enterNotesProbe` / `backToLibraryTab` / `waitPdfLoaded` / `waitPage` / `waitSectionReady` / `openRow` / `settleEmptyOutline` / `rectOfSelector` / `capturePage` / `record` / `notesHash` / `js` / `waitFor` / `sleep` |
| 插值纪律（冻结） | 进入页面上下文的字符串一律 `${JSON.stringify(...)}` 插值；Node 侧常量名（`SEL` / `LIBRARY_DIR` 等）不得写进页面字符串 |

#### 5.2.2 stub 契约（`buildStub()` 内新增，逐字）

| 项 | 冻结 |
| --- | --- |
| 报告根与目标 | `reportRoot = CONFIG.root`（与 `NOTES_FILE` / `relativeDocPath` 同根，工作区 A）；`rel = relativeDocPath(input.docFilePath)`；`file = path.join(reportRoot, ".pix-read", "reports", rel + ".md")`；`fs.mkdirSync(path.dirname(file), { recursive: true })` 后 `fs.writeFileSync(file, content, "utf8")` |
| `notesExportReport(input)` 记录 | `const call = { docFilePath: input.docFilePath, chapters: input.chapters, progress: input.progress, resolvedAt: null }; notesReportCalls.push(call);` —— **调用进入 stub 即计数与记账**；`notesReportCalls()` ⇒ `{ count, payloads: notesReportCalls.slice(-8) }` |
| 失败注入 | `setNotesReportFailure(code)` ⇒ 调用时不写盘，`call.resolvedAt = Date.now()` 后返回 `{ success: false, code: code, error: REPORT_ERRORS[code] \|\| code }`；`REPORT_ERRORS = { "write-failed": "报告写入失败", empty: "当前文档暂无笔记，未生成报告" }`（**独立映射，不复用 `NOTES_ERRORS`**——后者的 `write-failed` 是 `笔记写入失败`） |
| 延迟注入 | `setNotesReportDelay(ms)`：**只推迟响应** —— 落盘、计数与 payload 记录在**调用时**完成，`await sleep(ms)` 之后才 `call.resolvedAt = Date.now()` 并返回（与 `notesRestore` 的 `resolvedAt` 范式逐字同款） |
| 模板镜像 | **逐字镜像**主进程 `renderDocumentReport`：同分组规则（闭区间、第一条命中获胜、空组不渲染、兜底组恒最后、`chapters === []` 退化按页）、同排序三键、同条目渲染（`### 第 N 页` / `### 第 N 页 · AI 结论` / `> ` 逐行 / 可选 `备注：`）、同 `\n\n---\n\n` 与组间空行、文件末尾一个 `\n`、元信息行含 `资料库：path.basename(CONFIG.root)`（**不得**取 `CONFIG.name`） |
| 字符串拼接纪律 | stub 是 JS **字符串模板**（由 `buildStub()` 用反引号生成）⇒ 内部**不得出现反引号**：报告模板与分组文本一律用 `+` 与数组 `join` 拼接 |
| 空文档 | 该文档 0 条 ⇒ 返回 `{ success: false, code: "empty", error: "当前文档暂无笔记，未生成报告" }`（与主进程同形；`r13-*` 不触发该分支，仅为镜像完整） |
| 返回值 | `{ success: true, filePath: file, displayPath: ".pix-read/reports/" + rel + ".md", count: <该文档条目数> }` |
| `libraryShowInFolder` | 记录参数（`libraryShowPaths.push(...)`）、返回 `{ success: true }`、行为不变（§2.2 #1）；`libraryShowCalls()` ⇒ `{ count, paths: libraryShowPaths.slice(-8) }` |
| 控制口（4 个，逐字名） | `__pixStub.notesReportCalls()` / `__pixStub.setNotesReportFailure(code)` / `__pixStub.setNotesReportDelay(ms)` / `__pixStub.libraryShowCalls()` |
| 模板一致性的对齐机制 | 主进程模板由烟测逐字节钉住（§5.1.2 #1）、stub 输出由离屏与**同一份手写期望串**比对 ⇒ 两侧任何偏离都会让对方变红（stub 只是取证夹具，**不是**第二实现）；stub 只是夹具，差异一律在 dev 档登记 |

#### 5.2.3 场景 `r13-1`（组 `r13-report-entry`，3 条 record，2 张截图）

前置：`enterCleanWorkspace(seedNotes())` → `openNotesPanel(4)`（**不打开文档**）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `disabled-no-doc` | `reportProbe()` → 截图 `r13-1-report-disabled.png`（`rectOfSelector(SEL.layoutLeft)`） | ① `btnInDom === true`、`btnText` 逐字 `导出当前文档报告`、`btnTitle` 逐字 `导出当前文档的阅读报告（Markdown）`、`btnDisabled === true`（无当前文档）；② 几何：`entryWidthOk`（`btnRect.width` 与 `searchRect.width` 差 ≤ 1）且 `entryBelowHeader`（`btnRect.y ≥ headerTopRect.y + headerTopRect.height - 1`）；③ 防空：`rowInDom === false`（未导出前不得有状态行） | `{ phase, probe, entryWidthOk, entryBelowHeader, leftWidth }` |
| `enabled-with-doc` | `backToLibraryTab()` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 3)` → `openNotesPanel(4)`（**顺序不可颠倒**：资料库树在笔记标签下不可见）→ `reportProbe()` | ④ `btnDisabled === false` 且 `btnText` / `btnTitle` 逐字不变；⑤ 防空：`countText` 逐字 `共 4 条`、`exportLabel` 逐字 `导出 Markdown`（`.notes-header-top` 内既有元素未被挤动） | `{ phase, probe, countText, exportLabel }` |
| `no-notes-notice` | `backToLibraryTab()` → `openRow("reading-notes.md")` → `waitFor(".reader-body")` → `openNotesPanel(4)` → 记 `notesMdHash` / `notesReportCalls().count` / `reportExists("reading-notes.md.md")` → `clickEl(SEL.reportBtn)` → 读 notice 与计数 → 截图 `r13-1b-report-no-notes-notice.png`（左栏） | ⑥ `.notes-notice.is-error` 文本逐字 `当前文档暂无笔记，未生成报告`（**无前缀**）；⑦ `notesReportCalls().count` 增量 **0**（不发 IPC）；⑧ `reportExists("reading-notes.md.md") === false` 且 `rowInDom === false`；⑨ `notes.md` 哈希前后不变（不存在时 `null === null`） | `{ phase, notice, callsDelta, reportExists, rowInDom, notesMdHashSame }` |

#### 5.2.4 场景 `r13-2`（组 `r13-report-content`，3 条 record，2 张截图）

前置：`enterNotesProbe()`（`sample-paper.pdf` 第 1 页 + 笔记面板 4 行）→ `await waitSectionReady();`（有书签文档的唯一就绪点：页码 pill 可见严格早于章节派生，见 `ui-shot.mjs:6746-6747` 的既有纪律）→ 记 `notesHash()` 与 `notes.md` 哈希（不存在记 `null`）→ 记 `notesReportCalls().count`；点击前不重置现场。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `export-success` | ① 快照 `.pix-read` 顶级条目名（`readdirSync`，**紧贴点击前**）→ ② `clickEl(SEL.reportBtn)` → ③ `waitFor(SEL.reportRow)` → ④ `reportProbe()` → ⑤ 截图 `r13-2-report-row.png`（整窗）+ `r13-2b-report-row-left-pane.png`（`rectOfSelector(SEL.layoutLeft)`） | ① `rowText` 逐字 `报告：sample-paper.pdf（3 条）→ .pix-read/reports/sample-paper.pdf.md`；② `revealText` 逐字 `在文件夹中显示`；③ `notesNotice() === null`（成功只给一处反馈）；④ `reportExists("sample-paper.pdf.md") === true` | `{ phase, rowText, revealText, notice, fileExists, pixReadBefore }` |
| `payload` | 读 `notesReportCalls().payloads` 最后一项 | ⑤ `docFilePath` 逐字 `join(LIBRARY_DIR, "sample-paper.pdf")`；⑥ `chapters` **逐字段**等于夹具 7 项（顺序 + `title`/`start`/`end`/`label` 全部逐字，见 §0.1 表）；⑦ `progress` 逐字 `{ page: 1, pageCount: 3 }`；⑧ 一次点击只发 1 次调用（`callsDelta === 1`） | `{ phase, callsDelta, docFilePath, chapters, progress }` |
| `content-verbatim` | `readReport("sample-paper.pdf.md")` → `normalizeStamp` → 与手写期望串比对 → 复读 `notesHash()` 与 `notes.md` 哈希与 `.pix-read` 条目 | ⑨ 全文（`生成时间：<STAMP>` 占位后）**逐字节等于** §0.3 的手写期望串（同 §5.1.2 `expectedRenderA()` 的构造法：三条正文取 `seedNotes()` 的 `[0].text` / `[1].text` / `[3].text`，其余逐字面量）；⑩ `生成时间` 段匹配 `YYYY-MM-DD HH:mm:ss` 且恰 1 次；⑪ `notesHash()` 不变、`notes.md` 哈希不变、`.pix-read` 顶级**条目名集合**的变化恰为新增 `reports`（只比集合，允许 `reader-state.json` 内容变化） | `{ phase, reportText, stampOk, notesHashSame, notesMdHashSame, pixReadAdded }` |

#### 5.2.5 场景 `r13-3`（组 `r13-report-fallback`，2 条 record，1 张截图）

前置：`enterNotesProbe([...seedNotes(), outOfRangeNote()], 5)` → `await waitSectionReady();`（同 §5.2.4）。**相位间不重置现场**：`fallback` 的搜索词 `Table 2` 与既有导出行在两个相位之间保持（`idempotent` 之前不得插入复位，否则 ⑨ 的期望值改变）。

```js
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
```

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `fallback` | ① `clickEl(".notes-export-btn")` → `waitFor(".notes-export-row .export-text")` → ② `setSearch("Table 2")`（复用既有 `setSearch` 原语） → ③ `clickEl(SEL.reportBtn)` → ④ `waitFor(SEL.reportRow)` → ⑤ `readReport("sample-paper.pdf.md")` → ⑥ 截图 `r13-3-report-fallback-row.png`（左栏） | ① `^## ` 行逐字 `["## 1. Abstract · 第 1 页（1 条）", "## 2. Method Overview · 第 2 页（2 条）", "## 未归入章节（1 条）"]`（兜底组恒最后）；② 越界条正文全文出现恰 1 次；③ 第 2 页组内先摘录后 AI 结论；④ 统计逐字 `共 4 条（摘录 3 · AI 结论 1）`；⑤ **搜索生效不影响报告**：`.notes-search-input` 的 `value` 逐字 `Table 2` 且 `.note-row` 行数 = 1（读取方式：既有 `searchProbe()`（`ui-shot.mjs:4815`）的 `value` / `rows`），而报告仍 4 条；⑥ **与既有导出行互不干扰**：`rowInDom === true` 且 `.notes-export-row` 同在 DOM、`.export-text` 逐字 `已导出 5 条 → .pix-read/notes.md` | `{ phase, groups, outOfRangeCount, stats, searchValue, visibleRows, exportText, bothRows, reportText }` |
| `idempotent` | ① `writeFileSync(<报告绝对路径>, "STALE-CONTENT\n")` → ② `clickEl(SEL.reportBtn)` → ③ `waitFor` 行仍在 → ④ 复读文件与 `reportProbe()` | ⑦ 文件 `normalizeStamp` 后与本场景 `fallback` 相位的归一化内容**逐字节相同**、不含 `STALE-CONTENT`；⑧ `notesReportCalls().count` 增量恰 2（同一文档两次导出）；⑨ `rowText` 与 `fallback` 相位逐字相同（`报告：sample-paper.pdf（4 条）→ .pix-read/reports/sample-paper.pdf.md`） | `{ phase, sameAsFirst, staleGone, callsDelta, rowText }` |

#### 5.2.6 场景 `r13-4`（组 `r13-report-degrade`，2 条 record，2 张截图）

前置：`enterCleanWorkspace(seedNotes())` → `openRow("older-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 2)` → `settleEmptyOutline()`（无书签文档的就绪点，与 `r12-2` 同口径）→ `openNotesPanel(4)`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `no-chapter-subdir` | `clickEl(SEL.reportBtn)` → `waitFor(SEL.reportRow)` → `reportProbe()` → `readReport("archive/older-paper.pdf.md")` → 截图 `r13-4-report-degrade-subdir.png`（左栏） | ① `rowText` 逐字 `报告：older-paper.pdf（1 条）→ .pix-read/reports/archive/older-paper.pdf.md`；② `^## ` 行逐字 `["## 第 7 页（1 条）"]`（按页退化，无章节标题、无 `未归入章节`、全文不含 ` · 第 `）；③ 元信息行含 `文档：archive/older-paper.pdf` 与 `阅读进度：第 1 / 2 页`；④ 子目录 `reports/archive` 被创建（`reportExists` 为真即证明）；⑤ 入参 `chapters` 为 `[]`（读 `payloads` 最后一项） | `{ phase, rowText, groups, meta, chapters }` |
| `text-doc` | ① `js("window.__pixStub.seedNotes(" + JSON.stringify([...seedNotes(), textDocNote()]) + "), true")` → ② `backToLibraryTab()` → ③ `openRow("reading-notes.md")` → ④ `waitFor(".reader-body")` → ⑤ 记 `rowCleared = !(await has(SEL.reportRow))` → ⑥ `openNotesPanel(5)` → ⑦ `clickEl(SEL.reportBtn)` → ⑧ `waitFor(SEL.reportRow)` → ⑨ `readReport("reading-notes.md.md")` → ⑩ 截图 `r13-4b-report-degrade-text-doc.png`（左栏） | ⑥ `^## ` 行逐字 `["## 第 1 页（1 条）"]`；⑦ 元信息行**不含** `阅读进度：`、含 `文档：reading-notes.md`；⑧ 入参 `chapters === []` 且 `progress === null`；⑨ `rowText` 逐字 `报告：reading-notes.md（1 条）→ .pix-read/reports/reading-notes.md.md`；⑩ **切文档清行**：`rowCleared === true`（`older-paper.pdf` 的报告行不得残留到本相位） | `{ phase, groups, meta, payload, rowText, rowCleared }` |

```js
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
```

#### 5.2.7 场景 `r13-5`（组 `r13-report-failure`，3 条 record，1 张截图）

前置：`rmSync(join(LIBRARY_DIR, ".pix-read", "reports"), { recursive: true, force: true })`（同时构成「删掉报告目录不影响功能」的现场）→ `enterNotesProbe()`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `write-failed-retry` | ① `setNotesReportFailure("write-failed")` → ② `clickEl(SEL.reportBtn)` → ③ 读 notice / `reportProbe()` / `reportExists("sample-paper.pdf.md")` / 计数 → ④ 截图 `r13-5-report-failure-notice.png`（左栏） → ⑤ `setNotesReportFailure(null)` → ⑥ `clickEl(SEL.reportBtn)` → ⑦ `waitFor(SEL.reportRow)` | ① notice 文本逐字 `生成报告失败：报告写入失败`；② `rowInDom === false`；③ `reportExists("sample-paper.pdf.md") === false`；④ 注入期间计数增量恰 1（确有一次真实调用）；⑤ 清理注入后再点 ⇒ 行出现、文件存在（目录被重建）、计数增量恰 2 | `{ phase, notice, rowInDom, fileExists, callsDelta, retryRow, retryFile }` |
| `reveal-and-clear` | ① 记 `sha256(readReport(...))` → ② `clickEl(SEL.reportReveal)` → ③ 读 `libraryShowCalls()` 与哈希 → ④ `backToLibraryTab()` → ⑤ `openRow("older-paper.pdf")` → ⑥ `waitPdfLoaded()` → ⑦ 读 `rowInDom` → ⑧ `openRow("sample-paper.pdf")` → ⑨ `waitPage(1, 3)` → ⑩ `openNotesPanel(4)` → ⑪ `clickEl(SEL.reportBtn)` → ⑫ `waitFor(SEL.reportRow)` | ⑥ `libraryShowCalls().paths` 最后一项逐字 `join(LIBRARY_DIR, ".pix-read", "reports", "sample-paper.pdf.md")`；⑦ 点击前后报告文件哈希不变（reveal 只读）；⑧ 切文档后 `rowInDom === false`；⑨ 切回并再导出 ⇒ 行回来且 `rowText` 逐字 `报告：sample-paper.pdf（3 条）→ .pix-read/reports/sample-paper.pdf.md` | `{ phase, showPaths, hashSame, rowAfterSwitch, rowText }` |
| `inflight-guard` | ① `enterNotesProbe()` → ② 记 `notesReportCalls().count` 与 `payloads.length` → ③ `setNotesReportDelay(1200)` → ④ `clickEl(SEL.reportBtn)` → ⑤ 紧跟同步段内再 `clickEl(SEL.reportBtn)` → ⑥ 读计数 → ⑦ `backToLibraryTab()` → ⑧ `openRow("older-paper.pdf")` → ⑨ `waitPdfLoaded()` → ⑩ `openNotesPanel(4)` → ⑪ 轮询至「计数 = 基线 + 1 且最后一条 payload 的 `resolvedAt !== null`」→ ⑫ 读 `reportProbe()` 与 `notesNotice()` → ⑬ `setNotesReportDelay(0)` 复位 | ⑩ 计数增量**恰 1**（在途第二次点击被两处守卫**任一**拦下：DOM `disabled` 或 handler 首行 `if (exportingReport.value) return;` ⇒ 不发第二次 IPC）；⑪ 在途切文档后迟到的成功响应落地 ⇒ `rowInDom === false`（结果被 §1.6.2 ⑤ 的归属守卫丢弃）且 `notesNotice() === null`（成功与失败都不弹） | `{ phase, callsDelta, rowInDom, notice }` |

**场景末**：`restoreStandardSeed()`（与 R11/R12 收尾同纪律）。

#### 5.2.8 配额与截图清单（冻结，不得减少）

| 组（`record` label） | 条数 | 场景 | 相位（顺序） | 截图（逐字） |
| --- | --- | --- | --- | --- |
| `r13-report-entry` | 3 | `r13-1` | `disabled-no-doc` / `enabled-with-doc` / `no-notes-notice` | `r13-1-report-disabled.png`、`r13-1b-report-no-notes-notice.png` |
| `r13-report-content` | 3 | `r13-2` | `export-success` / `payload` / `content-verbatim` | `r13-2-report-row.png`、`r13-2b-report-row-left-pane.png` |
| `r13-report-fallback` | 2 | `r13-3` | `fallback` / `idempotent` | `r13-3-report-fallback-row.png` |
| `r13-report-degrade` | 2 | `r13-4` | `no-chapter-subdir` / `text-doc` | `r13-4-report-degrade-subdir.png`、`r13-4b-report-degrade-text-doc.png` |
| `r13-report-failure` | 3 | `r13-5` | `write-failed-retry` / `reveal-and-clear` / `inflight-guard` | `r13-5-report-failure-notice.png` |

合计：**5 组 13 条 record、8 张截图**；末态 `restoreStandardSeed()`；既有 127 张 / 185 条 / 41 种 label 零缺失、零改写。

### 5.3 基线与零缺失

| 项 | 冻结口径 |
| --- | --- |
| 零缺失比对基线 | `C:/Users/86157/AppData/Local/Temp/pix-v05-r12-final`（`shots.length = 127`、`failure = null`、`MEASUREMENTS.json` 185 条 / 41 种 label；磁盘另有 2 张**不在清单内**的历史 PNG ⇒ 一律以清单为准） |
| 动工前自证基线（可选，新目录） | `PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v05-r13-base` 实跑一次 ⇒ 期望与 R12 交付读数同为 `127 / 185 / 41 / failure null`（本轮动工前源码未变，读数应完全一致；不一致即停线排查） |
| 验收运行目录 | `PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v05-r13-after` |
| 验收期望读数 | `MANIFEST.shots.length = 135`（127 + 8）、`failure = null`、退出码 0；`MEASUREMENTS.json` 长度 **198**（185 + 13）、label 去重 **46** 种（41 + 5，新增恰为 `r13-report-entry` / `r13-report-content` / `r13-report-fallback` / `r13-report-degrade` / `r13-report-failure`） |
| 零缺失判据 | 基线 `MANIFEST.shots[].name`（127）⊆ 验收集合（`missing: []`）；基线 label 逐 label 计数**不减少**（`missingLabels: []`）；`shots/` 一级条目只有 `*.png` / `MANIFEST.json` / `MEASUREMENTS.json`（脚本内自检 + 人工复核） |
| 允许的位移与内容变更 | **仅** ① `.notes-header` 容器**高度增大**（`h` 增大，`x/width` 不变；新增两行都在它内部）；② `.notes-search` 及其后各行 `y` 增大（`x/width/height` 与文本不变）；③ 既有截图里出现新增两行本身的可见内容。**不允许**：`.notes-header-top` 内既有元素（`.notes-count` 文本、`.notes-export-btn` 文本/几何）的任何变化；`.notes-search` / `.notes-sort` / `.notes-filter` / `.notes-chapter-filter` / `.notes-selection-bar` / `.note-row` 的 `x/width/height` 与文本变化；任何 `w/h/fontSize/color/background` 的非预期差异（`.notes-header` 的 `h` 除外，见 ①） |
| 内容目视比对 | 8 张新截图必须逐张登记在 dev 档（是否出现非预期的重叠 / 截断 / 换行）；报告入口行不得与 `.notes-count` 文本重叠、不得把导出按钮挤出左栏 |
| 烟测回归 | `smoke-view.mjs`（4 组 29 条，零 diff）与 `smoke-notes.mjs`（既有 26 条 + 新增 18 条 = 44 条）都必须可复跑且全绿（退出码 0） |

### 5.4 命令（按执行顺序）

```bash
# 步骤 0：动工前（未改任何文件）—— 唯一工程门
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"          # 期望 0

# 步骤 0b：交叉核对零缺失基线（已冻结读数）
node -e "const fs=require('fs');const L=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));const B='C:/Users/86157/AppData/Local/Temp/pix-v05-r12-final/shots';const m=L(B+'/MANIFEST.json');const x=L(B+'/MEASUREMENTS.json');console.log(JSON.stringify({shots:m.shots.length,failure:m.failure,measurements:x.length,labels:new Set(x.map(e=>e.label)).size}))"
# ⇒ 必须逐字得到 {"shots":127,"failure":null,"measurements":185,"labels":41}；不一致则停线排查

# 步骤 1：A 面落地（类型 + 主进程 + preload + 烟测）
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes; echo "SMOKE_NOTES_EXIT=$?"   # ×2，期望「通过 44 / 失败 0」

# 步骤 2：B 面落地（store + 面板）后的工程门（离屏脚本可后落）
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"

# 步骤 3：离屏验收（与基线目录不同）
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r13-after" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_AFTER_EXIT=$?"
# 期望：UI_SHOT_AFTER_EXIT=0 + MANIFEST.json.failure === null + 5 组 13 条 record 全绿 + 8 张新截图齐备

# 步骤 4：零缺失比对（逐字命令见下）
BASE="C:/Users/86157/AppData/Local/Temp/pix-v05-r12-final"
AFTER="C:/Users/86157/AppData/Local/Temp/pix-v05-r13-after"
node -e "const fs=require('fs');const L=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));const b=L(process.argv[1]),a=L(process.argv[2]);const S=(x)=>new Set(x.shots.map(s=>s.name));const bs=S(b),as=S(a);console.log(JSON.stringify({base:b.shots.length,after:a.shots.length,missing:[...bs].filter(n=>!as.has(n)),added:[...as].filter(n=>!bs.has(n))}));console.log('AFTER_FAILURE='+JSON.stringify(a.failure))" "$BASE/shots/MANIFEST.json" "$AFTER/shots/MANIFEST.json"
# ⇒ {"base":127,"after":135,"missing":[],"added":[8 张]}
node -e "const fs=require('fs');const L=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));const cnt=(x)=>{const m=new Map();for(const e of x)m.set(e.label,(m.get(e.label)||0)+1);return m};const cb=cnt(L(process.argv[1])),ca=cnt(L(process.argv[2]));console.log(JSON.stringify({baseLabels:cb.size,afterLabels:ca.size,missing:[...cb].filter(([k,v])=>(ca.get(k)||0)<v).map(([k,v])=>k+':'+v+'->'+(ca.get(k)||0))}))" "$BASE/shots/MEASUREMENTS.json" "$AFTER/shots/MEASUREMENTS.json"
# ⇒ baseLabels:41、afterLabels:46、missing:[]
ls -A "$AFTER/shots" | grep -v -E '\.png$' | grep -v -E '^(MANIFEST|MEASUREMENTS)\.json$'; echo "STRAYS_EXIT=$?"   # 期望无输出、STRAYS_EXIT=1

# 步骤 5：渲染层纯函数回归（零改动确认）
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:view; echo "SMOKE_VIEW_EXIT=$?"       # 期望「通过 29 / 失败 0」

# 步骤 6：零残留
cd E:/develop/PiX-Read && git status --short
```

### 5.5 烟测实跑（命令 + 预期输出形状）

```
[smoke-notes] 临时目录：<TMP>
[smoke-notes] typescript：<repo>/pix/node_modules/typescript/lib/tsc.js
== 组 undo-roundtrip ==        # 8 条 [通过]（既有，零改动）
== 组 undo-failures ==         # 8 条 [通过]（既有，零改动）
== 组 undo-slot-lifecycle ==   # 6 条 [通过]（既有，零改动）
== 组 export-and-empty ==      # 4 条 [通过]（既有，零改动）
== 组 report-render ==         # 7 条 [通过]（新增）
== 组 report-files ==          # 5 条 [通过]（新增）
== 组 report-failures ==       # 6 条 [通过]（新增）
通过 44 / 失败 0
SMOKE_NOTES_EXIT=0
```

### 5.6 走查清单（一次跑完，逐条对人）

| # | 核对 | 命令 / 位置 | 期望 |
| --- | --- | --- | --- |
| 1 | 新通道两处逐字 | §1.8 #4 | `notes-export-report` 恰 2 处 |
| 2 | 守卫唯一 | §1.8 #3 | `isReaderNotesReportInput` 恰 1 定义、`报告参数不合法` 恰 1 处 |
| 3 | 归组谓词唯一 | §1.8 #1 | 主进程内闭区间比较恰 1 处；主进程不解析 outline |
| 4 | 写盘点增量 | §1.8 #2 | `writeFileAtomic(` 7 → 8 |
| 5 | 既有导出零 diff | §1.8 #5、§2.3 | `renderNotesMarkdown` / `renderMarkdownEntry` / `exportNotesMarkdown` / `notes-export` 零 diff |
| 6 | 模板不入渲染层 | §1.8 #7、§1.7.5 #4 | `pix/src/renderer` 无 `.pix-read` / `reports/` 字面 |
| 7 | 面板字面唯一 | §1.7.5 #2 / #3 | `阅读报告` 命中 ⊆ {title, 主进程模板}；`导出当前文档报告` 恰 1 处 |
| 8 | 报告入口唯一 | §1.8 #11 | 面板恰 1 处调用 |
| 9 | 状态清理与写入点 | §1.8 #13 | `lastReport.value = null` 恰 2 处、成功写入恰 1 处 |
| 10 | 显示名大小写 | §1.8 #10 | `docDisplayName(currentDocKey)` 0 命中 |
| 11 | 文案不重复定义 | §1.8 #15 / #16 | 空库文案恰 2 处、写失败文案恰 1 处 |
| 12 | R12 零改动 | §1.8 #17 | `outline-notes.ts` / `notes-path.ts` diff 为空 |
| 13 | 依赖与配置零改动 | §1.8 #18 | `package.json` / lockfile / `packages` / tsconfig / `smoke-view.mjs` 全空 |
| 14 | 离屏只追加 | §2.3 | `ui-shot.mjs` 的 `-` 侧只允许 §2.2 两处相邻行位移 |
| 15 | `SEL` 恰 4 项 | `git diff -U0 -- pix/scripts/ui-shot.mjs \| grep -cE "^\+\s+report(Btn\|Row\|Text\|Reveal): \""` | 恰 **4**（锚定 SEL 声明行；**不得**用 `^\+.*(reportBtn\|…)`：新增场景里的 `clickEl(SEL.reportBtn)` / `waitFor(SEL.reportRow)` / `clickEl(SEL.reportReveal)` 等引用行会让计数恒 > 4） |
| 16 | 零残留 | `git status --short` | 只出现白名单（§1.8 #19） |

---

## 6. 风险 Top3 与判定方式

**风险 1「报告与事实源不一致（丢条 / 重复 / 顺序漂移）」**

- 触发面：把「第一条命中获胜」写成「最后一条命中」（夹具里第 2 页同时命中 `2. Method Overview`[2,2]、`2.1 Sparse mask budget`[2,2]、`Appendix B`[2,3]）；把兜底组插在章节组中间或产出两个兜底组；越界页（p9）被静默丢弃或钳制；组内排序漏掉第 3 键（`id`）导致字节级不可复现；`chapters === []` 时仍渲染章节标题。
- 判定：烟测 `report-render` #1（逐字节）+ #3（`^## ` 行集合与空组不渲染）+ #4（兜底组恒最后 + 正文出现次数 = 1）+ #5（退化不伪造章节）+ #6（组内序与分隔）+ #7（倒序范围恒不命中）；`report-files` #3（幂等覆盖无残留、两次归一化内容互等）；离屏 `r13-2` 相位 `content-verbatim`（逐字节）+ `r13-3` 相位 `fallback`（兜底组、搜索生效时仍 4 条）+ `idempotent`（两次逐字节相同）。
- 失败信号：某条正文出现 0 次或 ≥ 2 次；`共 N 条` 与条目数不等；兜底组不在最后或出现两个；`r13-3` 的 `^## ` 行数组与冻结值不等；`idempotent` 归一化内容与首次不等。

**风险 2「报告导出破坏既有资产或既有导出」**

- 触发面：报告写盘误用 `notesPaths().file` 或写了 `notes.md`；渲染层自拼 `.pix-read/reports/...` 并回传路径；`writeFileAtomic` 被改写或新增第二个写盘函数；失败路径留下半截报告。
- 判定：烟测 `report-files` #4（`notes.json` / `notes.md` sha256 不变、`.pix-read` 顶级变化恰为新增 `reports`）与 `report-failures` #4/#5/#6（写失败 / 损坏 / 版本不支持三例零写盘）；离屏 `r13-2` 相位 `content-verbatim` ⑪（`notesHashSame` + `.pix-read` 条目集合 +1）；走查 §1.8 #2 / #7 / #14。
- 失败信号：`notes.json` 哈希变化；`.pix-read` 出现第三个新条目；`renderNotesMarkdown` 出现 diff；`writeFileAtomic` 调用点增量 ≠ 1。

**风险 3「新入口挤动面板既有版面」**

- 触发面：把报告按钮塞进 `.notes-header-top` 的 flex 行（左侧 268px 宽 ⇒ 计数文本被压、导出按钮换行）；用自定义 CSS 宽度替代 `block`；报告状态行的盒模型与既有导出行不一致（左栏高度跳档）。
- 判定：走查（`.notes-header-top` 模板零 diff、新行插在它之后）；离屏 `r13-1` 相位 `enabled-with-doc` ⑤（`.notes-count` 逐字 `共 4 条`、`.notes-export-btn` 逐字 `导出 Markdown`）与 `reportProbe()` 的 `entryWidthOk` / `entryBelowHeader`；§5.3 的允许位移白名单；8 张新截图逐张目视登记（§8）。
- 失败信号：`.notes-header-top` 出现 diff；`entryWidthOk === false`；`.notes-count` 文本变化；`.notes-export-btn` 换行/被截断。

**次级风险（不占 Top3，逐条登记并给判定）**

1. **stub 镜像与主进程模板偏离**：两侧都与同一份**手写**期望串比对（§5.1.2 / §5.2.4 ⑨），任一侧偏离都会变红，不会静默通过；代价是一次额外的修复往返。判定 = `report-render` #1 与 `r13-2` 相位 `content-verbatim` 的 ⑨ 必须同时绿；若只有离屏红，先查 stub 的镜像（分组 / 元信息行 / 尾换行）。
2. **`.notes-report-row` 与 `.notes-export-row` 同时存在时左栏高度增长**：面板可滚动，`r13-3` 断言两行共存（⑥），**不做几何冻结**；判定 = `r13-3` 的 `bothRows === true` + 截图目视无重叠。
3. **文本文档与「PDF 未就绪」窗口共用退化分支**：`r13-4` 把「无章节 + 无进度」钉在文本文档上；PDF 未就绪窗口不在本轮断言面（同一分支已由 `chapters === []` / `progress === null` 覆盖）。判定 = `r13-4` 相位 `text-doc` 的 ⑥⑦⑧。
4. **`.pix-read` 顶级条目断言时序敏感**（评审 S-5）：判据只比**条目名集合**、两次快照紧贴点击前后；判定 = `r13-2` 相位 `content-verbatim` ⑪（`pixReadAdded` 逐字 `["reports"]`）；若因 `reader-state.json` 的写盘落在两次快照之间而误红，**不得**放宽成「至少包含 reports」，只允许把快照改为「点击前后各取一次并在 ⑪ 处一并比较」。
5. **面板无笔记文案与主进程文案漂移**：两处必须逐字相同；判定 = 走查 §1.8 #15（恰 2 处）+ `r13-1` 相位 `no-notes-notice` ⑥ 与烟测 `report-failures` #3 的 `error` 逐字相等。
6. **`setNotesReportDelay` 的在途窗口过短导致 `inflight-guard` 空转**：判定 = `r13-5` ⑩ 的 `callsDelta === 1`（若延迟未生效，第二次点击会真的发出第二次 IPC ⇒ 该条必红）；延迟值 1200ms 与既有 `setNotesRestoreDelay` / `setNotesAddDelay` 同量级。
7. **既有截图的内容变化（登记项）**：新入口行与状态行会出现在所有含笔记面板的既有截图中（例如 01 / 52 / 63 系列）⇒ 零缺失判据（只比 basename / label 集合）**不覆盖内容差异**，dev 档须按面板截图分类抽样登记（或逐张登记）并确认无重叠 / 截断；不得以「零缺失全绿」替代该登记。
8. **入口行宽判据的口径**（评审 S-6）：`entryWidthOk` 比的是 `.notes-report-btn` 与 `.notes-search` 容器的宽度差 ≤ 1px（后者同为 `.notes-header` 的直接子元素、同受 `padding: 8px 12px 6px` 约束）；若将来 `.notes-search` 被隐藏（无笔记态），该字段记 `null` 且**不**构成失败条件（本轮的三个相位都有笔记）。

**风险条数：3 条 Top + 8 条次级 = 11 条登记。**

---

## 7. 开发分工

### 7.1 建议 A / B 两面（白名单互不重叠）

| 面 | 白名单（5 + 3 = 8 个文件） | 内容 |
| --- | --- | --- |
| **A：契约与数据面** | `pix/src/shared/types.ts`、`pix/src/main/notes-store.ts`、`pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`、`pix/scripts/smoke-notes.mjs` | §1.1（类型 / preload / 通道）、§1.2（守卫）、§1.3（导出与返回面）、§1.4（路径与写入）、§1.5（渲染纯函数与模板）、§5.1（3 组 18 条烟测） |
| **B：UI 与离屏** | `pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue`、`pix/scripts/ui-shot.mjs` | §1.6（store 状态 / 动作 / 守卫）、§1.7（面板 DOM / 文案 / 门控 / 样式）、§5.2（stub + 4 个 helper + 5 场景 13 条 record / 8 张截图） |

**接口冻结（两侧必须逐字遵守）**

1. A 提供、B 消费：通道名 `notes-export-report`、preload 方法 `notesExportReport`、类型 `ReaderNotesReportInput` / `ReaderNotesReportResult`（§1.1.2 逐字）、返回面六情形（§1.3.2 逐字）与三条专有文案。
2. A **不得**改 `notes-store.ts`（渲染层）/ `NotesPanel.vue` / `ui-shot.mjs`；B **不得**改 `types.ts` / `main/**` 四个文件 / `smoke-notes.mjs`。
3. **落地顺序（冻结）**：**A 先落**（`npm run check` 绿 + `smoke:notes` 连续两次「通过 44 / 失败 0」）→ 再落 B。理由：B 的 `check` 依赖 A 的类型与 preload 方法存在；B 的离屏 stub 返回值形状必须与 A 的 IPC 结果一致。若并行，B 只能先写模板 / 样式 / 场景骨架，**不得**在 A 落地前跑验收（`check` 会红、`r13-*` 的 `payload` 相位会红，读数不可用）。
4. 两侧共用 `record` 语义与 `MANIFEST` / `MEASUREMENTS` 字段（零改动），无需额外接口。

### 7.2 备选：单代理（推荐当只有一名开发者时）

执行顺序（冻结）：

1. **动工前**：`npm run check`（`CHECK_EXIT=0`）+ §5.4 步骤 0b 的基线读数核对（127 / 185 / 41 / `null`）。
2. **A1 类型面**：`types.ts` 三接口 → `npm run check`。
3. **A2 数据面**：`notes-store.ts`（常量 → `notesPaths` 扩字段 → 渲染三函数 → `exportDocumentReport`）→ `ipc-handlers.ts`（守卫 + handler）→ `preload.ts`（两处）→ `npm run check`。
4. **A3 烟测**：`smoke-notes.mjs`（常量 / helper / 三组 → `main()` 三行）→ 连续两次 `npm run smoke:notes`（`通过 44 / 失败 0`）+ §5.1.5 的两项失败注入抽样。
5. **B1 store**：`notes-store.ts`（渲染层）→ `npm run check`。
6. **B2 面板**：`NotesPanel.vue`（ref + handler → 两处模板 → 两处样式）→ `npm run check`。
7. **B3 离屏**：`ui-shot.mjs`（stub 报告面 + `libraryShowInFolder` 记录 + 四个控制口 → `writeFixtures()` 一行 → `SEL` 4 项 → 4 个 helper → `r13-1`…`r13-5`）→ `npm run check`（脚本不在工程门内，此步只为确认未破坏源码）。
8. **验收**：`PIX_SHOT_ROOT=<tmp>/pix-v05-r13-after` 实跑 → §5.4 步骤 4 的零缺失比对（135 / 198 / 46 / `missing: []` / `added` = 8 张）→ §8 的 8 张目视登记 → 面板类既有截图的内容抽样登记。
9. **收尾**：`git status --short` 只出现白名单；`git add <具体路径>`（绝不 `git add .` / `-A`）；提交由负责人完成。

**纪律**：只提交本会话改动的文件；不跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；不改白名单外任何文件；不引入或升级依赖；不改 `packages/**` 与 `package-lock.json`。

---

## 8. 视觉验收（新增 UI 的目视要点）

**新增 8 张截图（逐张目视登记，结论写入 `R13-dev.md`；登记模板：截图名 / 路径 / 观察项 / 结论）**

| 截图 | 观察项（逐条） | 预期 |
| --- | --- | --- |
| `r13-1-report-disabled.png`（左栏） | 入口行位置（在头行之下、搜索行之上）、按钮文本完整、禁用态（灰化）可辨识、与 `.notes-count` **不重叠** | 文本 `导出当前文档报告` 完整一行，按钮整宽，无换行、无截断 |
| `r13-1b-report-no-notes-notice.png`（左栏） | `.notes-notice.is-error` 文本完整、无截断；无报告状态行 | `当前文档暂无笔记，未生成报告` |
| `r13-2-report-row.png`（整窗） | 报告状态行与既有导出行**不同时出现**（本相位只导出报告）、左栏与中栏布局正常 | 行文本 `报告：sample-paper.pdf（3 条）→ .pix-read/reports/sample-paper.pdf.md` 单行可读 |
| `r13-2b-report-row-left-pane.png`（左栏） | 状态行盒模型与既有 `.notes-export-row` 一致（同圆角 / 同内边距 / 同 11px 字号）、「在文件夹中显示」按钮未换行 | 两行同语系；无重叠、无溢出 |
| `r13-3-report-fallback-row.png`（左栏） | 搜索生效时（搜索框有值）报告行与导出行**同屏共存**、面板可滚动、无重叠 | 两行都在，且 `.export-text` 与 `.report-text` 各自单行 |
| `r13-4-report-degrade-subdir.png`（左栏） | 无章节文档的报告行文本含子目录相对路径、单行可读 | `报告：older-paper.pdf（1 条）→ .pix-read/reports/archive/older-paper.pdf.md` |
| `r13-4b-report-degrade-text-doc.png`（左栏） | 文本文档的报告行、入口按钮可用、无残留的上一文档报告行 | `报告：reading-notes.md（1 条）→ .pix-read/reports/reading-notes.md.md` |
| `r13-5-report-failure-notice.png`（左栏） | 失败提示文本完整、无报告行 | `生成报告失败：报告写入失败` |

**目视要点（冻结）**

1. **入口行的位置与宽度**：`.notes-report-actions` 是 `.notes-header` 的第二个直接子元素（在 `.notes-header-top` 之后、`.notes-search` 之前），按钮整宽（`block`）、文本 `导出当前文档报告` 单行；入口行**不得**与 `.notes-count` 文本重叠，也**不得**把 `.notes-export-btn` 挤出或挤到换行。
2. **两个按钮的视觉层级**：报告按钮（`mdi-file-document-outline`）与既有导出按钮（`mdi-export-variant`）同为 `size="small"` + `variant="tonal"`，图标可一眼区分；禁用态灰化程度与既有 `.v-btn--disabled` 一致。
3. **状态行的语系一致**：`.notes-report-row` 与 `.notes-export-row` 同盒模型（同边距 / 同圆角 / 同内边距 / 同背景），`.report-text` 与 `.export-text` 同字号与颜色；两行同时出现时纵向间距目视均匀、不重叠。
4. **无报告时不占位**：未导出时 `.notes-report-row` **不进 DOM**（无空壳、无占位高度、无残影）；切文档后同一实例消失（`r13-5` ⑧ 的判据 + `r13-4` ⑩）。
5. **禁用态语义**：无当前文档时按钮可见但灰化（`r13-1-report-disabled.png`）；有文档时立即可点（`r13-1` 相位 `enabled-with-doc`）；不出现第三条禁用条件。
6. **失败反馈形态**：失败只走 `.notes-notice.is-error`（与既有 `导出失败：…` 同一处、同一形态），不出现同时弹提示与状态行的情况。
7. **既有截图的内容变化（登记项）**：新入口行会出现在所有含笔记面板的既有截图中 ⇒ dev 档按文档分类抽样登记（或逐张登记）并确认无「非预期的控件重叠 / 截断 / 遮挡」；§5.3 的零缺失判据只比 basename / label 集合，**不覆盖内容差异**，不得以「零缺失全绿」替代本项登记。
8. **结论判红规则**：出现任何**非预期**差异（控件重叠、文字截断、按钮不可辨识、`.notes-count` 被压、既有控件位移超出「纵向位移」白名单）⇒ 记录截图路径 + 差异描述并停线排查；**不得**以「目视误差」结案（与 R11 / R12 §8 同纪律）。

---

## 附：本档自检（交付面）

| 项 | 值 |
| --- | --- |
| 涉及文件数 | **8 个源码 / 脚本被修改**（A 面 5：`shared/types.ts`、`main/notes-store.ts`、`main/ipc-handlers.ts`、`main/preload.ts`、`scripts/smoke-notes.mjs`；B 面 3：`renderer/stores/notes-store.ts`、`workspace/NotesPanel.vue`、`scripts/ui-shot.mjs`）+ **1 份文档新建**（本档）；另有 **2 个文件登记为不动**：`pix/package.json`、`pix/scripts/smoke-view.mjs` |
| 新增断言组 | **8** 组（烟测 3 组 18 条：`report-render` 7 / `report-files` 5 / `report-failures` 6；离屏 5 组 13 条 record：`r13-report-entry` 3 / `r13-report-content` 3 / `r13-report-fallback` 2 / `r13-report-degrade` 2 / `r13-report-failure` 3） |
| 新增场景 | **5**（`r13-1`…`r13-5`）+ 新增截图 **8** 张 + `SEL` 新增 **4** 项 + stub 新增控制口 **4** 个 + 离屏新增 helper **4** 个 |
| 风险条数 | **11** 条（Top3 + 次级 8） |
| 验收期望读数 | 离屏 135 张 / 198 条测量 / 46 种 label（基线 127 / 185 / 41 零缺失）；`smoke:notes` 通过 44 / 失败 0；`smoke:view` 通过 29 / 失败 0 不变；`check` 0 error |

---

## 定稿修订（R13）

对照：`docs/pm/R13-review.md` 的「设计评审（R13）」must-fix **D-1 … D-9** 与次级观察 **S-d1 … S-d9**。本轮只改本档正文：**未改任何源码 / 脚本 / 配置**，未跑离屏取证与烟测脚本，未执行任何 git 写命令（唯一写操作 = 本档）。

**处理条数：must-fix 9 / 9（D-1 … D-9）；另销账次级观察 9 条（S-d1 … S-d9）。拒绝条数：0（两条清单逐条采纳，无驳回、无降级为登记）。**

### R13-1 must-fix 销账表

| 编号 | must-fix（摘要） | 处置 | 正文落点（修订后） | 核实证据（本轮真实读数） |
| --- | --- | --- | --- | --- |
| D-1 | `report-failures` #4② 必先命中 `empty`，且重试前未删占位文件 | 采纳：② 前补 `notesStore.addNote(draft(DOC_ARCHIVE, 7, ARCHIVE_TEXT))`；① / ② 的重试分别与 `expectedRenderA()` / `expectedArchiveA()` 逐字节比对；② 的清理改为 `rmSync(REPORTS_ARCHIVE_A, { force: true })`（删占位**文件**） | §5.1.4 #4 | 本档 §1.3.1 的判定顺序「…→ `readNotesFile` 失败码 → `empty` → 渲染 → `write-failed`」；§5.1.1 的 `seedReportNotes` 只为入参文档写条目（3 次 `addNote`，全程 `DOC_A`）⇒ `DOC_ARCHIVE` 0 条；`pix/scripts/smoke-notes.mjs:84` 的 `draft(docFilePath, page, text, kind)` 同形；`rmSync(<文件>, { force: true })` 有同文件先例（`rmSync(NOTES_A, { force: true })`） |
| D-2 | `report-files` #4「集合差恰为 `["reports"]`」不可满足 | 采纳：§5.1.3 补组前置（`setLibraryRoot(WS_A)` + `seedReportNotes(DOC_A)`）；#4 改为「先 `rmSync(REPORTS_A, …)` 回到无报告态 → 快照 → 导出 → 再快照」，且快照内容不写死 | §5.1.3 前置 + #4 | #1 的导出与 #3 的 `writeFileSync(REPORT_A, …)` 都以 `REPORTS_A` 已存在为前提 ⇒ 原快照必含 `reports`；`runExportAndEmpty` 已写出 `notes.md`、`runUndoSlotLifecycle` 留下 `notes.json.corrupt-*` 备份（`smoke-notes.mjs:380` 的 `readdirSync(PIX_READ_A)` 过滤）⇒ 只判集合差 |
| D-3 | `r13-2` / `r13-3` 缺「有书签文档的唯一就绪点」 | 采纳：两处前置各补 `await waitSectionReady();`；`waitSectionReady` 加进 §5.2.1 复用清单与 §0.3 复用清单 | §5.2.4 前置、§5.2.5 前置、§5.2.1、§0.3 | `pix/scripts/ui-shot.mjs:6817`（定义）、`:6849` / `:7019` / `:7075` / `:7196`（R12 既有调用）、`:6746-6747`（就绪纪律注释）；`enterNotesProbe`（`:4795`）内部只做 `enterMapWorkspace` → `openRow` → `waitPdfLoaded` → `waitPage` → `openNotesPanel`，无该门 |
| D-4 | 同页次序依赖 `createdAt` 严格递增（同毫秒竞态） | 采纳：`seedReportNotes` 落盘后按文件序把 `createdAt` / `updatedAt` 显式钉住（新增常量 `REPORT_STAMP_STEP_MS = 60_000`），不再托付 `addNote` 的毫秒级时钟 | §5.1.1、§4 第 7 行 | `pix/src/main/notes-store.ts` 的 `addNote` 用常量 `const now = Date.now();` 同时写 `createdAt` / `updatedAt`（两次调用可落同一毫秒）；§1.5.1 的 `sortReportEntries` 第三键 = `id.localeCompare`（随机 UUID）⇒ 同毫秒即字节级不可复现；脚本内既有 `writeNotesFile`（`smoke-notes.mjs:70`）与 `readFileNotes`（`:75`）可直接落盘 |
| D-5 | §1.8 #19 的文件数与 §4 / §7.1 / 自检矛盾 | 采纳：#19 改为「`M` **八个**源码/脚本（= §4 第 1–8 行：`shared/types.ts`、`main/notes-store.ts`、`main/ipc-handlers.ts`、`main/preload.ts`、`scripts/smoke-notes.mjs`、`renderer/stores/notes-store.ts`、`workspace/NotesPanel.vue`、`scripts/ui-shot.mjs`）+ `?? docs/pm/R13-*.md`」 | §1.8 #19 | §4 列 8 个修改文件（第 1–8 行）；§7.1「白名单（5 + 3 = 8 个文件）」；自检「8 个源码 / 脚本被修改」 |
| D-6 | §5.6 #15 的 `SEL` 计数在真实 diff 上恒 > 4 | 采纳：命令改为锚定声明行的 `git diff -U0 -- pix/scripts/ui-shot.mjs \| grep -cE "^\+\s+report(Btn\|Row\|Text\|Reveal): \""` = **4** | §5.6 #15 | 本轮实测同形样本：`^\+\s+report(Btn\|Row\|Text\|Reveal): "` 只命中 `+  reportBtn: ".notes-report-btn",` / `+  reportRow: ".notes-report-row",` 两条声明行，`+    await clickEl(SEL.reportBtn);` 与 `+  const x = SEL.reportText;` 均不命中（旧 `^\+.*(reportBtn\|…)` 会把后两类引用行一并计数）；`SEL` 既有项为 2 空格缩进的 `key: "selector",`（`ui-shot.mjs:100` `composerInput: ".input-area",`） |
| D-7 | `endsWith("/reports/sample-paper.pdf.md")` 在 Windows 上恒 false | 采纳：#1 的主判据仍为「`filePath` 逐字等于 `REPORT_A`」，括注改为 `relative(REPORTS_A, result.filePath) === "sample-paper.pdf.md"` | §5.1.3 #1 | 本轮实测 `["C:","ws-a",".pix-read","reports"].join(path.sep)` 后 `path.join(reports, "sample-paper.pdf") + ".md"` ⇒ `C:\ws-a\.pix-read\reports\sample-paper.pdf.md`、`endsWith("/reports/sample-paper.pdf.md") === false`、`path.relative(reports, target) === "sample-paper.pdf.md"`；同口径先例 `pix/scripts/smoke-notes.mjs:445`（`relative(PIX_READ_A, exported.filePath) === "notes.md"`） |
| D-8 | §1.7.5 #1 的命中集合计数与逐字模板不一致 | 采纳：改写为「**9 行** = 模板 **5** 行 + 样式 **4** 行」，并点明 `.report-reveal` 只有模板与按钮谓词、无样式规则 | §1.7.5 #1 | §1.7.1 模板 2 行类名（`notes-report-actions` / `notes-report-btn`）+ §1.7.2 模板 3 行类名（`notes-report-row` / `report-text` / `report-reveal`）= 5；§1.7.4 样式 4 条规则（`.notes-report-actions` / `.notes-report-btn` / `.notes-report-row` / `.report-text`） |
| D-9 | §5.3 的「允许的位移」白名单自相矛盾，且未覆盖 `.notes-header` 容器高度 | 采纳：改写为「允许 ① `.notes-header` 的 `h` 增大（`x/width` 不变）；② `.notes-search` 及其后各行 `y` 增大（`x/width/height` 与文本不变）；③ 新行自身的可见内容。不允许既有元素的 `x/width/height` 与文本变化（`.notes-header` 的 `h` 除外）」 | §5.3 | `pix/src/renderer/components/workspace/NotesPanel.vue:699-708` 的 `.notes-header` 是 `position: sticky` 的 flex 列容器（`padding: 8px 12px 6px`）、`:429` 的 `.notes-search` 是其直接子元素；新增两行都插在 `.notes-header` 内部 ⇒ 容器高度必增；既有测量含 `header: box(".notes-header")`（`ui-shot.mjs:1324`） |

### R13-2 次级观察销账表

| 编号 | 处置 | 落点 | 核实证据 |
| --- | --- | --- | --- |
| S-d1 `reportProbe()` 的 `emptyOk` 无语义 | 采纳：从字段集合中删除，并冻结「字段集合封闭，不得携带无断言语义的字段」 | §5.2.1 | 本档 §5.2.3–§5.2.7 无任何断言引用 `emptyOk`（改前 `grep -c "emptyOk" docs/pm/R13-design.md` = 1，即该字段本身；改后 = 0） |
| S-d2 §4 第 5 行 import 增量只列两个名字 | 采纳：补列 `docDisplayName` | §4 第 5 行 | `pix/src/renderer/stores/notes-store.ts:16` 现只 import `currentDocKey as toDocKey` / `groupNotesByDocument` / `NoteGroup` / `PageRange`，**未含** `docDisplayName`（`pix/src/renderer/utils/notes-path.ts:32` 已导出）；§1.6.2 ③ 用到它 |
| S-d3 时间戳正则措辞歧义 | 采纳：改成「把命中串去掉 `生成时间：` 前缀（捕获组或 `replace`）后匹配锚定正则」 | §5.1.2 #1 | `STAMP_RE = /生成时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/` 的命中串含 `生成时间：` 前缀 ⇒ 直接对命中串用 `^` 锚定恒 false |
| S-d4 在途拦截点措辞 | 采纳：改为「两处守卫**任一**拦下（DOM `disabled` 或 handler 首行）」 | §5.2.7 ⑩、§3 第 8 行 | §1.7.1 的 `:disabled="!notesStore.currentDocKey \|\| exportingReport"` 与 §1.7.3 的 `if (exportingReport.value) return;` 并存，`clickEl` 是 `js` 往返（`ui-shot.mjs:6752`）⇒ 第二次点击大概率打在 `disabled` 上 |
| S-d5 失败注入抽样②的预期与实际不符 | 采纳：两条抽样的预期按真实依赖面重写（① 3 处、② 2 处，② 保持「`report-render` 组不受影响」的错误隔离可见性） | §5.1.5 | `expectedRenderA()` 被 §5.1.2 #1、§5.1.3 #3 与 §5.1.4 #4① 的重试引用；`expectedArchiveA()` 被 §5.1.3 #2 与 §5.1.4 #4② 的重试引用；原②「`REPORTS_A` 指向不存在盘符」会连坐 `REPORT_A` 的派生 ⇒ 不再使用 |
| S-d6 大小写保真只有显示名走查 | 采纳：新增走查 #20 | §1.8 #20 | 本轮实测 `grep -n "toLowerCase" pix/src/main/notes-store.ts pix/src/main/library-root.ts` ⇒ {`notes-store.ts:100`（`docPathKey`）、`library-root.ts:35`（`normalizeFsPath`）}，共 2 处 |
| S-d7 `reportChapterTitle` 的折叠无走查命令 | 采纳：新增走查 #21 | §1.8 #21 | 本轮实测 `grep -c "normalizeNoteText" pix/src/main/notes-store.ts` = **2**（`:104` 定义、`:302` `addNote` 的写入归一化）⇒ 改后 = **3** |
| S-d8 r13-3 相位共享现场未写明 | 采纳：前置写明「相位间不重置现场（`idempotent` 之前不得插入复位）」，并在 ⑤ 点明读取方式 | §5.2.5 | 既有 `searchProbe()`（`ui-shot.mjs:4815`）返回 `value` / `rows`，可直接承载 ⑤ 的判据 |
| S-d9 两处行号偏差 | 采纳：`invalidNotesInput()` `:253` ⇒ `:252-254`（2 处）；`Reader state` 分节注释 `:484` ⇒ `:484-486` | §0.1、§1.1.1 | 本轮实读 `pix/src/main/ipc-handlers.ts:252`（定义）与 `:253`（return 语句）、`:484-486`（三行分隔注释，`// Reader state …` 在 `:485`） |

### R13-3 本轮实跑证据（只读 / 唯一工程门）

| 命令 / 读取 | 读数 |
| --- | --- |
| `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo $?` | `CHECK_EXIT=0`（仅 `> pix-read@0.1.0 check` 与三段 tsc 命令行） |
| `node -e`（`path.join` / `path.relative` 口径，见 D-7 证据） | `{"sep":"\\","target":"C:\\ws-a\\.pix-read\\reports\\sample-paper.pdf.md","endsWithSlashForm":false,"relativeForm":"sample-paper.pdf.md"}` |
| `grep -n "waitSectionReady" pix/scripts/ui-shot.mjs` | 定义 `:6817`；调用 `:6849` / `:7019` / `:7075` / `:7196` |
| `grep -n "toLowerCase" pix/src/main/notes-store.ts pix/src/main/library-root.ts` | `:100` / `:35` |
| `grep -c "normalizeNoteText" pix/src/main/notes-store.ts` | `2`（+ §1.8 #21 的改写基数） |
| `grep -n "seedNotes\|writeFixtures\|NOTES_ERRORS\|libraryShowInFolder" pix/scripts/ui-shot.mjs` | `seedNotes:320` / `writeFixtures:370`（无 reports 清理行）/ `NOTES_ERRORS:494-502`（无 `empty`，`write-failed` = `笔记写入失败`）/ `libraryShowInFolder:767`（不记参数） |
| `grep -n "seedReportNotes\|REPORTS_A\|draft" pix/scripts/smoke-notes.mjs` | `writeNotesFile:70` / `readFileNotes:75` / `draft:84` / `relative(…) === "notes.md"` 先例 `:445` / `readdirSync(PIX_READ_A)` 过滤 `:380` |
| `git status --short` | 仅 `?? docs/pm/R13-design.md` / `?? docs/pm/R13-req.md` / `?? docs/pm/R13-review.md`；无 `M` 侧改动（本轮未改任何源码 / 脚本 / 配置） |

### R13-4 本轮未改动的边界（登记，不构成 must-fix 未销账）

1. `r13-5` 的三个相位（`write-failed-retry` / `reveal-and-clear` / `inflight-guard`）不断言 `chapters` 与章节组（只断言计数、notice、行文本与文件哈希，行文本的条数来自 stub 的 `count`）⇒ 按最小变更**不**加 `waitSectionReady()`；若 dev 阶段观察到行文本受 `chapters === []` 影响，再补该门。
2. `r13-1` 的两个探针相位与 `r13-4` 的 `text-doc` 同理：不断言 `chapters` 入参（`r13-4` 用 `settleEmptyOutline()` 的既有口径）。
3. `report-failures` 的组前置「四条『零写盘』判据」措辞沿用原档（#1 / #2 / #3 的 `existsSync(REPORTS_A) === false` + #5 / #6 的目录条目集合不变），不影响任一断言的判定（登记项）。
