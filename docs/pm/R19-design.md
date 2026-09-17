# PiX-Read R19 设计档 · 规模与性能（N104–N109）

> 上游：`docs/pm/R19-req.md`（需求档，含 §0 定稿修订 MF-01…MF-13 与 §0.0–§0.10 冻结契约）、`docs/pm/R19-review.md`（需求评审 13 条 must-fix + **设计评审 §2 的 MF-D1…MF-D10**，含 3 条阻塞级）、`docs/pm/PRD-V0.6.md` §2（R19 行）§4（反需求 5/7）§5（工程红线 1/2/3）§7 判据 4（规模不塌）、`docs/pm/R18-design.md` 与 `docs/pm/R16-design.md`（**本档的结构范本**：§0 口径与证据面 / §1 契约冻结表 / §2 与既有冻结面的关系 / §3 失败路径表 / §4 文件级清单 / §5 验证方案 / §6 风险 Top3 / §7 开发分工 / §8 报告与登记要求 / §9 开放问题）、`docs/pm/R15-audit-scripts-docs.md` §S-SD-02（P1，flake 销账对象）、`docs/pm/R9-req.md` §0 / `docs/pm/R10-req.md` §0 / `docs/pm/R13-req.md` §0 / `docs/pm/R14-req.md` §0（本轮只读的既有派生与报告契约）。
> 本档是「可直接开工、可判定」的定稿设计：把 R19-req §0.2–§0.9 的冻结契约落到**实现层粒度** —— 探针脚本与共享模块的落点、大夹具的逐字声明与生成方式、17 条时序指标与 10 条恒等断言的逐条测量实现（计时点 / 采样 / 统计 / 预热 / 复位 / 防空）、27 条阈值与实现常量、N108 守卫的参考实现与重试边界、以及 ui-shot / smoke-notes 的逐行改动白名单与断言强度论证。
> **本档不改任何代码**；本步（设计定稿）允许的写操作仅 `docs/pm/R19-design.md` 与 `docs/pm/R19-req.md` 文末的「## 0. 定稿修订（R19-定稿）」最小同步。本步实跑：`cd pix && npm run check`（`CHECK_EXIT=0`）、`git status --short` / `git log --oneline -1`、以及对 `ui-shot.mjs` / `PdfSelectionQuickAsk.vue` / `WorkspacePage.vue` / `PdfViewer.vue` / `reader-state-store.ts` / `HomePage.vue` / `PdfSearchPanel.vue` 相关段的 `read` 与全部 `grep` / `wc` / `sed` / `awk` / `node -e` 读数。
> **设计定稿**：设计评审的 MF-D1…MF-D10 已在正文逐条落定（阻塞级 MF-D1 / MF-D2 / MF-D3 的处置见 §1.3.0 / §1.5.4 / §1.5.5），逐条对照表在**文末「## 定稿修订（R19）」**（未销账 must-fix：0）。
> **未跑**：离屏 `ui-shot.mjs`、`perf-probe.mjs`（尚不存在）、`smoke-notes.mjs` / `smoke-view.mjs`、`npm run build` / `npm test` / `npm run package` / `npm run dev`（§0.4）。
> 判定工具（与需求档一致）：【走查】只读 `git status` / `git diff` / `git show` 与文件内容（含 `grep -c` / `grep -rn` 计数）；【check】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error（唯一工程门）；【烟测-主进程】`node scripts/smoke-notes.mjs`（10 组 71 条 → **11 组 74 条**）；【烟测-渲染】`node scripts/smoke-view.mjs`（9 组 74 条，**零改动**）；【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`；【性能】`pix/scripts/perf-probe.mjs` 的命令 1 / 命令 2 / 命令 3（§1.1）。

---

## 0. 口径与证据面

### 0.1 本档事实基线（写档当天的真实读数：只读核对 + 本步允许的实跑）

| 事实 | 证据（全部为本次真实读数） |
| --- | --- |
| 分支与 HEAD | `git log --oneline -1` ⇒ `bd4a189 feat(reader): 文档与会话锚定（继续讨论入口、现场记录最近会话）（V0.6 R18）`；`git status --short` ⇒ `?? docs/pm/R19-req.md` / `?? docs/pm/R19-review.md`（本档落盘后追加 `?? docs/pm/R19-design.md`，无其它改动） |
| 唯一工程门当前 0 error（**本步实跑**） | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（`vue-tsc --noEmit` + `tsc -p tsconfig.main.json --noEmit` + `tsc -p tsconfig.preload.json --noEmit`） |
| 工具链（实跑） | `node -v` ⇒ `v24.19.0`；`./node_modules/.bin/electron --version` ⇒ `v33.4.11` |
| 零缺失参照基线（本轮唯一基线） | `C:/Users/86157/AppData/Local/Temp/pix-v06-r18c-review/shots`：实跑 `node -e` ⇒ `{"shots":186,"failure":null,"measurements":264,"labels":74,"png":186}` |
| 离屏脚本规模与关键锚点（`pix/scripts/ui-shot.mjs`，`wc -l` = **12483**） | `SEL` `:47-131`（实跑 `sed -n '47,140p' \| grep -cE '^  [a-zA-Z]+: '` = **74**；末两项 `readerDiscuss` `:129` / `sessionDocMark` `:130`；`};` `:131`）；`escapePdfText` `:137-139`；`buildPdf` `:149-227`（`trailer`/`%%EOF` 收口 `:225-226`）；`SAMPLE_PAGES` `:229`（**3 页**，实跑 `node -e` 计数 = 3）；`SAMPLE_OUTLINE` `:299-325`；`LONG_BOOK_PAGES` `:328`；`LONG_BOOK_OUTLINE` `:332-351`（**20 章 × 10 节 × 1 子节 = 420 节点**的声明表范式）；`writeFixtures` `:400-432`；`buildStub` `:438-1320`（`config` 字面量 `:439-448`、`configJson` `:449`、模板唯一插值点 `:459`、模板内 `${` 计数实跑 = **1**）；`shots` `:1326`、`measurements` `:1327`；`capturePage` `:1337-1345`（`shots.push` `:1342`）；`runScenario` `:1347`；`runReaderStateScenarios` `:1660-12326`（收口 `}` `:12326`）；`record` `:1678-1681`（先落测量再抛错）；`goHome` `:1767-1776`；`enterWorkspace` `:1777-1791`；`openRow` `:1792-1800`；**`selectPageSpan` `:1838-1851`（裸等待 `:1850`）**；`restoreStandardSeed` `:3513-3517`；`excerptFirstSpan` `:5517`；`quickAskProbe` `:5539`；`waitFeedbackOk` `:5551`；`quickAskStateProbe` `:5564`；`selectionProbe` `:5577`；`pageSpanText` `:5589`；`focusPage` `:5595-5602`；**`ensureQuickAskExcerptReady` `:5611-5633`**；`excerptViaQuickAsk` `:5638-5658`；`waitFeedbackCleared` `:5665`；`stageScrollProbe` `:5686`；**`installStageScrollWatch` `:5708` / `stageScrollWatchProbe` `:5724` / `waitStageScrollQuiet` `:5734-5756`**（三者连同前置注释头 `:5697-5701` 构成待位移块 `:5697-5756`，**60 行**；默认 `quietMs = 400` / `timeoutMs = 6000`、`sleep(60)` 轮询）；`app.commandLine.appendSwitch("disable-gpu")` `:12332`；`assertOutRootSafe` `:12342-12359`；`main` `:12361`；`createServer` `:12373-12379`（`port: PORT` / `strictPort: true`）；`new BrowserWindow` `:12383-12399`（`useContentSize: true` / `preload: STUB_PATH` / `offscreen: true` / `backgroundThrottling: false`）；`loadURL` `:12411`；`MEASUREMENTS.json` 落盘 `:12436`；结束自检 `:12439-12458` |
| 离屏脚本的常量与输出面（实跑 `grep -n`） | `OUT_ROOT` `:34`（`process.env.PIX_SHOT_ROOT \|\| "C:/Users/86157/AppData/Local/Temp/pix-r5"`）、`SHOTS_DIR` `:35`、`LIBRARY_DIR` `:36`、`LIBRARY_B_DIR` `:38`、`LIBRARY_NAME` `:39`、`LIBRARY_B_NAME` `:40`、`STUB_PATH` `:41`（`join(OUT_ROOT, "stub-preload.cjs")`）、`PORT = 5199` `:42`、`WINDOW = { width: 1600, height: 1000 }` `:44` |
| 抽取面向的三处模板行（实跑 `awk`） | 模板内 `const LIBRARY_TREE = [...]` `:839-847`（**9 行**）、`const LIBRARY_TREE_B = [...]` `:850-852`（**3 行**）、`libraryList(dir)` `:854-860`（archive 分支 `:858` 为 `key.endsWith("/archive")`）；模板纪律模式 `listSessions\|readerStateSave\|switchSessionCalls\|setSessions\|readerStateSaveCalls` 实跑：`ui-shot.mjs` 全文件 **31** 行命中（模板区 `:438-1320` 内 **10** 行、模板外 **21** 行） |
| `selectPageSpan` 调用点（实跑 `grep -n` + 去注释，**21** 处） | `:2060`、`:4077`、`:5518`（`excerptFirstSpan` 内）、`:5629`（`ensureQuickAskExcerptReady` 重取路径内）、`:6893`、`:7005`（r11-3 相位 4，前一行 `:7004` 是 `focusPage(2)`）、`:7102`、`:7113`、`:10927`、`:10969`、`:11044`、`:11059`、`:11097`、`:11112`、`:11152`、`:11202`、`:11264`、`:11330`、`:11463`、`:11491`、`:11570` |
| `waitStageScrollQuiet` / `ensureQuickAskExcerptReady` 调用点（实跑 `grep -n` + 去注释） | `waitStageScrollQuiet(` **5** 处：`:5615`（`ensureQuickAskExcerptReady` 内）、`:11329`、`:11462`、`:11490`、`:11569`（4 处显式前置静默，均在对应 `selectPageSpan` 的上一行）；`ensureQuickAskExcerptReady(` **14** 个调用点：`:7008` / `:7105` / `:10928` / `:11045` / `:11060` / `:11098` / `:11113` / `:11153` / `:11203` / `:11265` / `:11331` / `:11464` / `:11492` / `:11571` |
| r19-1 挂点与既有末态（实跑 `awk`） | `runReaderStateScenarios` 末段：`record("r18-session-mark", …)` 收口 `:12322`、`await restoreStandardSeed();` `:12323`、`await setSendFailure(null);` `:12324`、`await js("window.__pixStub.setSessions([]), true");` `:12325`、函数收口 `}` `:12326` ⇒ **r19-1 插在 `:12325` 与 `:12326` 之间**；进入 r19-1 时的工作区状态 = A 库、`leftTab` 停在 `notes`（`restoreStandardSeed` 的 `:3515-3516` 先切 library 再 `openNotesPanel(4)` 切回 notes） |
| 产品侧：PDF 与搜索（实读） | `PdfViewer.vue`：`ANCHOR_LAYER_WAIT_MS = 2000` `:60`；`measurePages` `:197-209`（对全部页串行 `getPage` + `getViewport`）；`renderPage` `:221-281`（`canvas.style.width = \`${viewport.width}px\`` `:239`、文字层 `textLayerDiv.replaceChildren()` + `TextLayer` `:261-277`）；`clearPageLayers` `:211-219`（**只清 `canvas.width/height` 与 `.textLayer` 子节点，不复位 `canvas.style.width`** ⇒ 终点必须用「canvas 非空 style.width **且** `.textLayer span` 在场」的合取）；`observePages` `:301`；`updateCurrentPage` `:327`；`gotoPage` `:368`；`loadPdf` `:672`；`onScroll` `:784-790`；`anchorExcerpts` `:833-841`；`paintNoteAnchor` `:925`；模板：`.pdf-scroll`（`@scroll.passive="onScroll"`）`:1117`、`v-for="(size, index) in pageSizes"` `.pdf-page` `:1118-1123`（`:data-page="index + 1"`）、`<canvas />` `:1125`、`.textLayer` `:1126`、页指示器 `:1192-1224`（上一页 `:1193-1200`、`.page-label` `:1213-1215` 文本 `第 {{ readerStore.page }} / {{ readerStore.pageCount }} 页`、下一页 `:1216-1223`）、工具条搜索入口 `:1084`（`title="在文档中搜索"`）、`PdfSearchPanel` 挂点 `:1087-1093`（`v-if` 逐字在 `:1088`，条件 `searchOpen && readerStore.pageCount > 0`） |
| | `PdfSearchPanel.vue`：`DEBOUNCE_MS = 300` `:41`；`LAYER_WAIT_TIMEOUT_MS = 5000` `:43`；`query` `:58`；`statusText` `:74-82`（`已扫 x / y 页` / `第 i / n 处 · 第 P 页` / `未找到 “…”`）；`textCache = new Map<number, string>()` `:85`（**setup 作用域 ⇒ 随面板实例创建**）；`getPageText` `:110-124`；`idleYield` `:126-130`（`requestIdleCallback(cb, { timeout: 32 })`——`timeout` 是**上限**）；`runSearch` `:132-175`（逐页 `getTextContent` → 计数 → `await idleYield()`；命中集合在循环结束后 `:167-169` 一次落地）；`resetAll` `:319-337`（`textCache.clear()` `:330`、`query.value = ""` `:336`）；`watch([filePath, pdfDocument])` `:340-347`（`resetAll()` `:343`）；`watch(query)` `:348-361`（清空 ⇒ 立即 `runSearch()`；非空 ⇒ `DEBOUNCE_MS` 后 `runSearch()`）；模板：`.pdf-search-panel` `:394`、`.search-input` `:404`（class 行）、`.search-status` `:429` |
| 产品侧：笔记 / 地图 / 树（实读） | `NotesPanel.vue`：`currentDocSwitch` computed（`get/set → notesStore.currentDocOnly`）`:103-106`；模板 `.notes-search-input` `:629`、`.notes-sort-btn` `:644`、`<v-switch class="notes-filter" label="仅看当前文档">` `:648-656`（`:disabled="!notesStore.currentDocKey"` `:654`）、互斥链 `:759`（loading）/ `:763`（error）/ `:795`（empty）/ `:801`（filtered empty）/ `:803`（`.notes-list`）；`.notes-group-head` `:805`；`.note-row` `:814-817` |
| | `KnowledgeMap.vue`：`nodeCount` `:46`；`chapterRanges` `:48`；`noteCounts`（memo）`:50-52`；`rows` `:53-55`；`groups` `:56`；`watch(outline)` 默认展开 `:65-73`；`collectExpandable` `:105-116`（只展开 `depth === 0` 且有子节点者）；`flattenVisible` `:118-149`；模板 `.map-tree`（滚动容器）`:225`、`.map-row`（chapter / child-row）`:232` / `:273`、`.row-chevron` `:236` / `:280`（`title` = `折叠` / `展开`） |
| | `LibraryPanel.vue`：`rows` `:36`；`noteCountMap` `:49`；`rowsWithBadge` `:51-57`；`libraryList(root, 3)` `:86`；模板 `v-for="row in rowsWithBadge"` `:164`、`class="tree-row"` `:166`（`:title="row.node.path"`）、`.row-notes` `:178-179`（文本 `{{ row.badge.total }} 条` + `title` 逐字 `` `摘录 ${row.badge.excerpt} 条 · AI 结论 ${row.badge.answer} 条` ``） |
| | `WorkspacePage.vue`：`leftTab` 默认 `"library"` `:41`；工作区挂载即 `notesStore.resetNotes()` + `await notesStore.loadNotes()` `:103-104`；`openDocumentFromLibrary` `:207-211`（`docPathKey` 同键**早退**）；`selectLeftTab` `:213-220`（同标签 `return` `:214`）；`goHome` `:260-275`（`flush` → `stopSession` → `clearSession` → `openDocument(null)` → `setMapOpen(false)` → `setCaptureMode(false)` → `setScale(1)` → `resetNotes` → `resetState` → `router.push("/")`）；首页项目卡片 `.project-list-item` 在 `HomePage.vue:134`（样式 `:258`） |
| 产品侧：渲染层 store 与主进程报告（实读） | `stores/notes-store.ts`：`groups` `:155-161`（`applyViewToGroups(groupNotesByDocument(...))`）；`visibleCount` `:163`；`currentDocNoteCount` `:168-173`（**第二次 `groupNotesByDocument`**）；`utils/notes-view.ts`：`matchesSearch` `:37-41`（只匹配 `text` / `comment`，`toLowerCase` + `includes`）、`sortNotesForView` `:44-52`、`applyViewToGroups` `:55-59`；`utils/notes-path.ts`：`countNotesByDocument` `:73` 等（本轮只读） |
| | `src/main/notes-store.ts`（`wc -l` = 578）：`MAX_NOTE_TEXT_LENGTH = 4000` `:39`；`isReaderNote` `:137`；`parseNotesFile` `:158`；`readNotesFile` `:180`；`writeFileAtomic` `:193`；`renderMarkdownEntry` `:266`；`sortReportEntries` `:300-302`（page → createdAt → id）；`reportChapterTitle` `:305-307`；`reportBlocks` `:313-344`（章节组按入参顺序、空组不渲染、兜底组恒最后）；`renderDocumentReport` `:347-362`（meta 逐字含 `阅读进度：第 P / N 页；` 与 `共 N 条（摘录 X · AI 结论 Y）。`）；`exportDocumentReport` `:499-525`（`readNotesFile` → 过滤本文件 → `renderDocumentReport` → `writeFileAtomic`，返回 `{ success, filePath, displayPath, count }`） |
| 产品侧：flake 根因（实读） | `PdfSelectionQuickAsk.vue`：`FEEDBACK_MS = 2500` `:23`；`hide()` `:93-95`；`onStageScroll` `:141-147`（`:146` `if (visible.value) hide();`）；`onMounted` 以 **capture** 监听 `document` 的 `scroll` `:190`；`onBeforeUnmount` `:193-200`（对称解绑 `:194-195`）；`.reader-stage` 容器在 `ReaderPanel.vue:235`（`ref="readerStage"` `:52`）、样式 `:322` |
| 烟测面（实读） | `pix/scripts/smoke-notes.mjs`（`wc -l` = **1624**）：`check()` `:73-81`；`STAMP_RE = /生成时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/` `:50`；`normalizeStamp` `:51`；`SAMPLE_CHAPTERS` `:53-57`；`PROGRESS_3` `:58`；`runReportRender` `:616-…`（`exportDocumentReport` `:622`、`^## ` 行统计 `:652`）；`runReportFiles` `:741-…`；编译与加载 `:1560-1593`（`required = ["main/notes-store.js", "main/library-root.js", "main/reader-state-store.js"]`、`allowed = required + "shared/types.js"`）；`main()` `:1596-1622`（组调用 `:1601-1610`、`rmSync(TMP)` 自净 `:1616`）；`grep -c "  check("` 实跑 = **71**；`pix/scripts/smoke-view.mjs` 实跑 = **74** |
| 命名预检（本轮新增的名字在 `pix/scripts` + `pix/src` 内的当前命中） | `grep -rn "perf-probe\|PIX_PERF_ROOT" pix/scripts pix/src` ⇒ **0**；`pix/scripts/lib/` **不存在**（`ls pix/scripts` 实读 = `assert-main-esm.mjs` / `dev-electron.mjs` / `smoke-notes.mjs` / `smoke-view.mjs` / `ui-shot.mjs`）；`grep -c "big-book\|doc-01" pix/scripts/ui-shot.mjs` ⇒ **0**（大夹具零交叉）；`grep -c "function buildPdf" pix/scripts/ui-shot.mjs` ⇒ **1**；`grep -c "function buildPdf" pix/scripts/perf-probe.mjs` ⇒ 文件不存在 |
| **需登记的事实纠偏**（评审与本档口径差异） | ① `R19-req.md` 的命名预检称 `readerStage` 在 `pix/src` 内 0 命中；**实读** `grep -rn "readerStage" pix/src` ⇒ **3** 处（`ReaderPanel.vue:52` / `:182` / `:235`，是组件内模板 ref 名）。新 `SEL` 键 `readerStage` 位于 `ui-shot.mjs` 自己的命名空间 ⇒ **不构成冲突**，但该预检结论按实读更正（本档 §1.5 登记唯一的真实消费者）。② `R19-req` §0.0 引用的 `PdfSearchPanel.vue:330`（`resetAll` 清缓存）实际是 `textCache.clear()` 的行；`resetAll` 的定义在 `:319`、`watch([filePath, pdfDocument])` 在 `:340-347`。本档一律按实读行号引用 |
| 本步未执行（禁止 / 不必要） | 离屏 `ui-shot.mjs`（本步禁止）、`perf-probe.mjs` 两条命令（脚本尚不存在）、`smoke-notes.mjs` / `smoke-view.mjs`、动工前基线、`npm run build` / `npm test` / `npm run package` / `npm run dev` |

### 0.2 R19-req 定稿修订（MF-01…MF-13）在本档的实现级落点

| 编号 | 需求档结论（摘要） | 本档实现级落点 |
| --- | --- | --- |
| MF-01 | ④ 复位/起点改为「重新挂载 → 520 行首次入 DOM」，`rowsBefore === 0` 硬断言 | §1.3 #10（终点 = `.note-row` 520 且 `.notes-group-head` 41；起点 = 首页项目卡片 `click()`；`data.rowsBefore` = t0 时刻 `.note-row` 计数 = 0 硬断言） |
| MF-02 | ⑦ 复位/起点同路径；终点追加行高 > 0 | §1.3 #16（终点 = `.tree-row` 41 ∧ `big-book.pdf` 行 `.row-notes` 文本 `480 条` ∧ `getBoundingClientRect().height > 0`；`rowsBefore === 0` 硬断言） |
| MF-03 | ① 复位冻结为「无打开文档」+ 点击前读数 | §1.3 #1（复位 = `goHome()` → 点项目卡片；起点 = `.tree-row[title$="big-book.pdf"]` 的 `click()`；`data.pageLabelBefore` 应为 `null`、`data.pdfPagesBefore` = 0；三次采样 = 三次「重新挂载 + `openRow`」；复位子步骤含「删 `reader-state.json`」（§1.3.0 复位纪律，MF-D1）；**禁止**同文档重复点树行——`WorkspacePage.vue:207-211` 早退） |
| MF-04 | ③ 冷/暖口径冻结为可判证据；禁止同值重写 | §1.3 #7 / #8（冷：打开浮层前 `document.querySelector(".pdf-search-panel") === null` 的原样读数；暖：`clear-then-retype`，清空后等状态行回到空串再重输同一词，触发 `PdfSearchPanel.vue:348` 的 `watch(query)`） |
| MF-05 | 注入顺序冻结 + 断言改为注入一次 + `scrollTopDelta === 160` + 与基线快照差 ≥ 1；只确定性覆盖「首轮静默窗口吸收」 | §1.5.5（`r19-1` 相位的注入顺序 = `installStageScrollWatch()` → `stageScrollWatchProbe()` 取基线 → **同一个 js 段**内读余量并挂一次性定时器 → 调用守卫；`data.injected.count === 1`、`data.injected.scrollTopDelta === 160`、`data.watchCountAfter - data.baselineCount >= 1`；`data.branch` = `absorbed-first-window` / `retried`，只确定性覆盖前者；相位 1 另加可见前置与隐藏采样（`data.stateBefore` / `data.hiddenSeen`）与 `trail[0].quiet.absorbed >= 1` 的硬断言，MF-D3） |
| MF-06 | 尝试预算优先级：全局 deadline 20000ms 自首次尝试前起算，先到即以已有轨迹抛错 | §1.5.2（`R19_SELECT_DEADLINE_MS = 20000`；每轮 `quiet ≤ min(6000, remaining)`、`ready ≤ min(4000, remaining)`；deadline 先到 ⇒ 以同一文案抛错，轨迹取已完成部分） |
| MF-07 | 两条 record 共用 label `r19-selection-guard`，相位落 `data.phase`；配额 74 → 75 | §1.5.5 / §1.5.6（label 逐字 `r19-selection-guard`，`data.phase` ∈ {`late-scroll-recovered`, `precondition-hard-fail`}；截图 1 张 `r19-guard-recovered.png`） |
| MF-08 | 抽取判据改为逐行归类 + `${` = 1 + 纪律计数之和 = 31 | §1.2.4（差异白名单 5 类形态、逐行归类、不设行数上限；`grep -c '\${'` = 1；纪律模式两文件计数之和 = 31） |
| MF-09 | ④/⑦ 的证明力限定为「stub 读侧接受」+ 渲染层规模不变量；dev 档给字段对照表 | §1.2.2「证据边界」（离屏不经主进程 `isReaderNote` / `parseNotesFile`）；§5.5（dev 档逐字段对照表）；**另**：§5.2 的 `perf-report-export` 组用**真实主进程模块**加载同一字段形状的 480 条夹具 ⇒ 主进程读侧对该字段形状的接受是**执行证据**（形状同源的登记见 §5.2） |
| MF-10 | ≤ 80 行只约束 §8.2 条件性白名单内的产品文件；`pix/scripts/*.mjs` 单列允许清单 | §4（脚本面按块登记行数：搬出 965 行 = `:137-139` 3 行 + `:149-227` 79 行 + `:438-1320` 883 行；`ui-shot.mjs` / `smoke-notes.mjs` / 两个 new 模块不套用 80 行上限） |
| MF-11 | 删除 `search.cold.ms` 的「结构性下界」推理，重述为灾难性回退护栏 | §1.4 #7（判据 = ≤ 20000 绝对，**护栏口径**；回归检测由 #8 `search.warm.ms` 承担）；§8.2 硬要求 ③（dev 档必须写「不得据该条宣称性能回归」） |
| MF-12 | 白名单外热点 ⇒ 阻塞 + 上报，不得自行扩权 | §4 「白名单外热点的处置」与 §6 R3（`PdfSearchPanel.vue` / `LibraryPanel.vue` 在「不改（登记为不动）」清单内） |
| MF-13 | ④ 键入查询词改 `Conclusion 13`（13 键）+ 防空断言 | §1.3 #11（逐键写 13 键；`data.keyCounts` 三轮各 13 个读数；断言「至少一键使计数变化」+「末键计数 < 首键计数」） |

### 0.3 本档新增的显式冻结（只补实现层命名与常量，不改任何判据）

| 项 | 冻结值 | 理由 |
| --- | --- | --- |
| 探针根目录 | `PIX_PERF_ROOT`（环境变量）或 `join(tmpdir(), "pix-v06-r19-perf")`；`ROOT` 常量名 `PERF_ROOT` | 与 req §0.3 逐字一致 |
| 探针端口与引导 | `PERF_PORT = 5200`（`strictPort: true`）、vite `cacheDir = join(PERF_ROOT, "vite-cache")`、stub 落盘 `join(PERF_ROOT, "stub-preload.cjs")`、`configFile = join(PIX_DIR, "vite.config.ts")`、`root = PIX_DIR` | req §0.7 冻结 5200；其余参数与 `ui-shot.mjs:12373-12400` 同款（登记为可接受的第二份引导实现） |
| 窗口引导参数（逐字） | `width: 1600`、`height: 1000`、`show: false`、`frame: false`、`useContentSize: true`、`backgroundColor: "#f3f6f9"`、`webPreferences: { preload: <stub>, offscreen: true, sandbox: false, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false }`、`app.commandLine.appendSwitch("disable-gpu")`、`win.webContents.setBackgroundThrottling(false)` | 与 `ui-shot.mjs:12332` / `:12383-12400` 逐字对齐（读数可比的前提） |
| 采样常量（全部写死，不可配置） | `PERF_K = 3`、`PERF_WARMUP = 1`、`PAGING_STEPS = 30`、`MAP_SCROLL_STEPS = 30`、`SEARCH_KEYS = "Conclusion 13"`（13 键）、`SEARCH_QUERY = "Chapter 13 body"`、`STALL_TICK_MS = 16`、`POLL_MS = 16` | req §0.4 / §0.5 冻结 |
| 单项超时常量 | `T_OPEN_MS = 20000`、`T_PAGING_STEP_MS = 5000`、`T_SEARCH_COLD_MS = 60000`、`T_SEARCH_WARM_MS = 20000`、`T_NOTES_MS = 20000`、`T_MAP_MS = 20000`、`T_TREE_MS = 20000`、`PERF_TOTAL_BUDGET_MS = 240000` | req §0.4「单项超时」行 |
| 阈值常量（绝对判据共 5 条，由 4 个常量承担：`LIMIT_STALL_MS` 覆盖 #6 / #9 / #15） | `LIMIT_OPEN_BIGDOC_MS = 3000`、`LIMIT_STALL_MS = 1000`、`LIMIT_SEARCH_COLD_MS = 20000`（均为 `perf-probe.mjs`）、`LIMIT_REPORT_EXPORT_MS = 2000`（在 `smoke-notes.mjs`） | req §0.5 #1 / #6 / #7 / #9 / #15 / #17 |
| 容差常量（相对 11 条） | `TOLERANCE_MEDIAN = 1.5`、`TOLERANCE_MAX = 2.0`（`paging.turn.median` / `paging.render.median` / `search.warm` / `notes.firstscreen` / `map.open` / `map.expand` / `map.scroll` / `tree.badge` 用 1.5；`paging.turn.max` / `paging.render.max` / `notes.search.key.max` 用 2.0） | req §0.5 相对阈值列 |
| 证据输出行（**本档新增的行类别**） | 每条指标在其 `[perf] metric` 行之后紧跟一行 `[perf] data <id> <单行 JSON>`（键集逐条冻结见 §1.3 末表） | req 的 N105-1 判据 3 / N105-3 判据 4 / N105-4 判据 4 要求登记 `data.*` 读数，而 §0.6 的 `[perf] JSON` 键名逐字冻结 ⇒ 证据不落 JSON、落独立行；`[perf] JSON` 仍是**最后一行**，N104-4 判据 1 不受影响 |
| `writeFileSync` 的唯一命中 | `perf-probe.mjs` 内 `writeFileSync` **恰 1 处**，位于 `--save-baseline` 的写盘行；夹具（PDF / notes.json）与 stub 落盘一律走 `node:fs/promises` 的 `writeFile`（顶层 import） | N104-4 判据 4 要求 `grep -c "writeFileSync"` 的命中仅为 `--save-baseline` 一处；本冻结是该判据的唯一可满足实现 |
| `ui-shot.mjs` 新增常量 | `R19_GUARD_INJECT_DELTA = 160`（**全文恰 2 处**：定义 1 + 注入段插值 1）、`R19_SELECT_DEADLINE_MS = 20000`、`R19_SELECT_MAX_ATTEMPTS = 3`、`R19_SELECT_QUIET_MS = 400`、`R19_SELECT_QUIET_TIMEOUT_MS = 6000`、`R19_SELECT_READY_TIMEOUT_MS = 4000` | req §0.8 与 N108-2 判据 3（`grep -c` = 2） |
| `ui-shot.mjs` 新增 helper | `waitSelectionReady(page, timeoutMs)`（**不抛错**的有界轮询：返回 `{ ok, hasSpan, visible, collapsed, anchorInStage, selectionText, spanText, waitedMs }`） | req §0.8「就绪谓词 (a)(b)(c)」；N108-3 判据 2 要求 `selectPageSpan` 定义体内 `catch` = 0 ⇒ 就绪等待必须是非抛错的轮询 helper（与既有 `waitFeedbackOk` / `waitFeedbackCleared` 同范式） |
| 探针复位纪律常量（本档补齐，MF-D1） | `PERF_STATE_FILE = join(PERF_ROOT, "library", ".pix-read", "reader-state.json")`；`resetToWorkspace()` 在**工作区挂载之前** `rmSync(PERF_STATE_FILE, { force: true })` | 阅读现场会持久化页码（`PdfViewer.vue:744` / `:1027` → `reader-state-store.ts:242` / `:250`），不删会让「第 1 页」的复位读数随上一趟落点漂移（`ui-shot.mjs:412-413` 是同一处置的既有先例） |
| `ui-shot.mjs` 相位 1/2 的新增常量与字段（本档补齐，MF-D2 / MF-D3） | `R19_HIDDEN_SAMPLE_MS = 16`（相位 1 的隐藏采样间隔）；相位 1 的 `data.stateBefore` / `data.hiddenSeen` / `data.hiddenFirstAt`；相位 2 的 `data.precondition = { selectionCleared, displayBeforeGuard, layerHidden }` | 把「浮层曾被隐藏」与「调守卫前浮层不可见」变成实测读数（而非推断） |
| `smoke-notes.mjs` 新增组与常量 | 组名 `perf-report-export`；`runPerfReportExport()`；`PERF_BIG_DOC = join(WS_A, "big-book.pdf")`、`PERF_BIG_PAGES = 304`、`PERF_CHAPTERS = 30`、`PERF_NOTES_PER_CHAPTER = 16`、`PERF_REPORT = join(REPORTS_A, "big-book.pdf.md")`、`PERF_ID_BASE = 1758000000000`、`PERF_ID_STEP_MS = 60000` | req §8.1 行 5 + N105-6；常量名本档补齐 |
| 本档不引入的东西（登记） | 不新增 npm script、不新增 IPC、不改依赖 / lockfile、不改 `packages/**`、不改 electron-builder、不改 `pix/package.json`、不新增 `--pix-*` 变量、不新增产品类名 / 文案 | req §7 反需求 5 / 7 / 11 |

### 0.4 本步未执行项（与本档证据面边界）

- 未跑离屏 `ui-shot.mjs`：`r19-1` 场景、守卫实现、抽取差异的**运行级**结论一律标注为「代码路径推导」；`r19-1` 的分支与读数（`attempts` / `branch` / `injected.*`）是**预期形态**，实测值由 dev 档登记。
- 未跑 `perf-probe.mjs`（脚本不存在）：24 条指标的实测值、单轮总耗时、夹具体积与生成耗时全部为**预期/推导**，§1.3 只冻结口径与判据。
- 未跑 `smoke-notes.mjs` / `smoke-view.mjs`：71 / 74 条来自本步 `grep -c "  check("` 计数（实跑），新增 3 条的正确性由 dev 步实跑判定。
- 本步实跑：`npm run check`（`CHECK_EXIT=0`）、`git log` / `git status --short`、`wc -l`、`grep -c` / `grep -n` / `sed -n` / `awk` / `node -e` 的全部读数、以及对 `ui-shot.mjs` / `smoke-notes.mjs` / `PdfViewer.vue` / `PdfSearchPanel.vue` / `NotesPanel.vue` / `KnowledgeMap.vue` / `LibraryPanel.vue` / `WorkspacePage.vue` / `notes-store.ts`（渲染 + 主进程）/ `PdfSelectionQuickAsk.vue` / `ReaderPanel.vue` / `PdfSearchPanel.vue` 相关段落的 `read`。

---

## 1. 契约冻结表

### 1.1 脚本、命令与输出面（逐字）

#### 1.1.1 文件与命令

| 项 | 逐字值 |
| --- | --- |
| 探针 | `pix/scripts/perf-probe.mjs`（Electron 主进程入口 + 编排器；**不新增 npm script**） |
| 共享模块 | `pix/scripts/lib/pdf-fixture.mjs`（导出 `escapePdfText` / `buildPdf`）、`pix/scripts/lib/stub-preload.mjs`（导出 `buildStub(config)`） |
| 命令 1（基线，只报告 + 落基线） | `cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/perf-probe.mjs --save-baseline <仓库外绝对路径>/perf-base.json` ⇒ 退出码 0 |
| 命令 2（验收，断言） | `cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/perf-probe.mjs --baseline <仓库外绝对路径>/perf-base.json --assert` ⇒ 退出码 0（越界 1） |
| 命令 3（只报告，不写基线） | `cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/perf-probe.mjs` ⇒ 退出码 0 |
| 基线文件形态 | 单行 JSON `{ "generatedAt": <ISO>, "metrics": [ { "id": <string>, "value": <number> } … ] }`；**不含** `limit` / `kind` / `samples`（容差只在脚本常量里，防「改基线即放水」） |
| 禁止 | 不得被 `ui-shot.mjs` 导入（`grep -rn "perf-probe" pix/scripts/ui-shot.mjs` = 0）；不得新增/改 npm script（`pix/package.json` 零 diff）；不得在仓库内写任何文件 |

#### 1.1.2 输出行与退出码（逐字）

| 项 | 规范 |
| --- | --- |
| 指标行 | `[perf] metric <id> value=<number\|null> unit=<ms\|count\|text> stat=<median\|max\|single> samples=<n>` |
| 证据行（本档新增类别） | `[perf] data <id> <单行 JSON>`（键集见 §1.3 末表；不含换行） |
| 判定行 | `[perf] verdict <pass\|fail\|skip> <id> kind=<absolute\|relative\|invariant> baseline=<number\|-> limit=<number\|->` |
| 超标行（仅 `--assert` 且越界） | `[perf] FAIL <id> value=<v> limit=<l> kind=<absolute\|relative> baseline=<b> samples=[<…>]` |
| 基线缺失行 | `[perf] warn no-baseline <id>`（该条 `verdict: "skip"`，**不改退出码**） |
| 机器可读（**最后一行**） | `[perf] JSON ` + 单行 JSON，键名与键序逐字：`{"script":"perf-probe","mode":"report"\|"assert","ok":<bool>,"root":"<abs>","startedAt":"<ISO>","baseline":"<abs\|null>","metrics":[{"id":…,"value":…,"unit":…,"stat":…,"samples":[…],"baseline":…,"limit":…,"kind":…,"verdict":"pass"\|"fail"\|"skip"}],"fixture":{"pages":<n>,"outlineNodes":<n>,"notesTotal":<n>,"notesBigBook":<n>,"docs":<n>,"pdfBytes":<n>},"summary":{"total":<n>,"pass":<n>,"fail":<n>,"skip":<n>},"failures":[{"id":…,"reason":…}]}` |
| 退出码 | **0** = 全部指标采样完成且（`--assert` 下）无越界；**1** = 任一指标采样失败（超时 / 异常 / 单项判 fail）或 `--assert` 下任一阈值 / 恒等断言越界，或总预算耗尽（`failures[]` 增加 `{ "id": "budget", "reason": … }`）；**2** = 用法或环境错误（根目录安全守卫失败、`--baseline` 缺失或不可解析、`--assert` 未带 `--baseline`、目标路径落在仓库内、端口占用） |
| 默认模式 | 无开关 = `mode: "report"`：不因阈值越界失败（只打印 `verdict fail`），仅采样失败退出 1 |
| 输出面 | stdout 是唯一输出面；除 `--save-baseline` 与临时根外不写文件；`finally` 内删除 `PIX_PERF_ROOT`（异常路径同样删除） |

#### 1.1.3 启动顺序与守卫（本档补齐执行顺序）

| 序 | 步骤 | 失败语义 |
| --- | --- | --- |
| 1 | 解析参数（`--save-baseline <path>` / `--baseline <path>` / `--assert`） | 用法错误 ⇒ 打印原因 ⇒ 退出码 **2**（**不建目录、不删路径**） |
| 2 | 路径守卫：`--baseline` / `--save-baseline` 目标**必须** `!isInsideRepo(resolve(target))`（仓库根 = `resolve(PIX_DIR, "..")`） | 违例 ⇒ 退出码 **2**，仓库内零新增文件 |
| 3 | 根目录守卫：`resolve(PIX_PERF_ROOT)` 必须严格位于 `os.tmpdir()` 之下、且与 `PIX_DIR` / 仓库根互不包含（与 `ui-shot.assertOutRootSafe()` `:12342-12359` 同款判定，文案另写） | 违例 ⇒ 退出码 **2**；**根目录尚未创建**，零副作用 |
| 4 | 建根 + 生成夹具（`rmSync(root, {recursive:true, force:true})` → `mkdirSync` → 写夹具与 stub） | 生成失败 ⇒ 打印原样错误 ⇒ 退出码 **1**，`finally` 删根 |
| 5 | 起 vite（`PERF_PORT = 5200`，`strictPort`）、创建窗口、`loadURL` | 端口占用 / 引导失败 ⇒ 退出码 **2**；因第 4 步已建根，**`finally` 必须删除根**（本条是评审观察 7 的处置：端口占用发生在建根之后 ⇒ 由 `finally` 兜住） |
| 6 | 预热 + 采样 + 判定 + 输出 | 采样异常 ⇒ 退出码 1；阈值越界 ⇒ 仅 `--assert` 下退出码 1 |
| 7 | 收尾 | `finally`：`server.close()`（若已起）→ `win.destroy()`（若已建）→ `rmSync(root, {recursive:true, force:true})` |

### 1.2 大夹具（逐字 + 生成方式 + 与 ui-shot 的共用方式）

#### 1.2.1 夹具逐字表（与 req §0.3 一致，本档补生成实现）

| 项 | 逐字值 | 生成实现（本档冻结） |
| --- | --- | --- |
| 根目录 | `PERF_ROOT = process.env.PIX_PERF_ROOT \|\| join(tmpdir(), "pix-v06-r19-perf")` | 第 4 步建根；第 7 步删根 |
| 资料库 | `<PERF_ROOT>/library`（`CONFIG.root`）；`<PERF_ROOT>/library/.pix-read/notes.json` | `mkdirSync(join(PERF_ROOT, "library", ".pix-read"), { recursive: true })` |
| `big-book.pdf` | **304 页**；每页两行文本：`Big Book Page {N}`（size 16，N = 1..304）与 `Chapter {KK} body text for the scale fixture.`（size 12，KK = `ceil(N / 10)`） | `buildPdf(BIG_PAGES)`（`BIG_PAGES = Array.from({ length: 304 }, (_, i) => [...])`，声明表在 `perf-probe.mjs`，**不搬进 lib**） |
| `big-book.pdf` 大纲 | 30 个顶层 `Chapter {KK}`（两位补零 `01`..`30`），每个 10 个叶子 `Section {KK}.{jj}`（`01`..`10`）；`page = 1 + 10 * (KK - 1)`（章与叶同页）；节点数 = 30 + 300 = **330** | `buildPdf(BIG_PAGES, BIG_OUTLINE)`；`BIG_OUTLINE` 用 `ui-shot.mjs:332-351` 的 `LONG_BOOK_OUTLINE` 同款 `Array.from` 形态（章 → `items: 10 × Section` → `items: []`） |
| 边界页 | 第 **301–304** 页无章（`ceil(301/10) = 31` > 30）⇒ 无章节徽标、无笔记 | 由生成公式天然产生；dev 档登记 `.map-row` 与笔记分组读数佐证 |
| 小文档 | `doc-01.pdf` … `doc-40.pdf`（**40 篇**）：每篇 2 页（`Doc {NN} page {1\|2} for the scale fixture.`），**无大纲** | `buildPdf(DOC_PAGES)`（不传 outline） |
| `notes.json` | `{ version: 1, notes: [...] }`，**520 条**：① **480 条** `big-book.pdf`（KK = 1..30、j = 1..16：`page = 1 + 10 * (KK - 1) + floor((j - 1) / 2)`、`kind = j % 2 === 0 ? "answer" : "excerpt"`、正文 `Excerpt {KK}.{j} for the scale fixture` / `Conclusion {KK}.{j} for the scale fixture`）；② **40 条** `doc-NN.pdf`（`page: 1`、`kind: "excerpt"`、正文 `Doc {NN} excerpt for the scale fixture`） | 生成器 `buildPerfNotes()` 返回数组，`JSON.stringify({ version: 1, notes }, null, 2) + "\n"` 写入（与 `ui-shot.mjs:538` 的 `writeNotesFile` 同款序列化） |
| 字段与取值 | `id = perf-{NNN}`（逐条唯一，NNN = 1..520 三位补零）、`comment = ""`、`createdAt = updatedAt = 1758000000000 + 60000 * index`（index 从 0 起）、`docPath` = 库内相对路径（`big-book.pdf` / `doc-NN.pdf`） | 索引序：先 480 条大文档（KK 外层、j 内层），后 40 条小文档 |
| 规模不变量（供断言） | 全部文档笔记 = **520**；`big-book.pdf` = **480**（摘录 240 / 结论 240）；`.notes-group-head` = **41**；`.tree-row` = **41**；地图默认行 = **330**；`fixture.docs` = **41**（树内文件行数 = `big-book.pdf` + 40 篇小文档，**不是小文档篇数**） | §1.3 的 #18–#27 恒等断言 |
| 搜索用词 | `Chapter 13 body`：命中 `big-book.pdf` 第 **121**–**130** 页（每页 1 处）⇒ 命中总数 **10**、首个结果页 **121** | 由 `BIG_PAGES` 的正文公式与 `PdfSearchPanel.countOccurrences`（`:100-107`，`indexOf` 循环计数）决定；dev 档登记实测状态行 |
| 生成时机 | 起 vite 与窗口**之前**一次完成；生成耗时**不计入**任何指标 | 第 4 步；dev 档登记 `[perf] data fixture` 与生成耗时（外部 `time` 读数） |
| 体积上限 | `fixture.pdfBytes`（= `statSync(big-book.pdf).size`）`> 0 && < 5 * 1024 * 1024`；**另**登记整库体积 < 5 MB（dev 档 `du` 读数） | `[perf] JSON.fixture.pdfBytes` + `[perf] data fixture` |

#### 1.2.2 证据边界（MF-09，逐字登记）

| 项 | 内容 |
| --- | --- |
| 离屏能证什么 | ① stub 读侧对 `notes.json` 的接受（`ui-shot.mjs:525-534` 的 `readNotesFile` 自带宽松解析，`:523-524` 注释逐字「stub 专用」）；② 渲染层规模不变量（520 / 41 / 480 / 330 / `480 条`）与三条 `stall.max.ms` 的**渲染层**代价 |
| 离屏证不了什么 | 主进程读侧（`isReaderNote` `src/main/notes-store.ts:137` / `parseNotesFile` `:158` / `readNotesFile` `:180`）在离屏运行中**不执行** ⇒ 不得声称覆盖主进程白名单 |
| 替代证据（走查 + 烟测） | ① dev 档给出逐字段对照表（字段集 ⊆ `isReaderNote` 接受域：`id` 非空串 / `kind` ∈ `excerpt`\|`answer` / `docPath` 非空非绝对、无 `\` 与 `..` 段 / `page` 整数 ≥ 1 / `text` 长度 1..4000 / `comment` 字符串 / `createdAt`・`updatedAt` 有限数），并注明该表是**走查**；② §5.2 的 `perf-report-export` 组用**真实** `notes-store.ts`（编译产物）加载 480 条同形状夹具 ⇒ 该形状经主进程读侧**执行**验证（40 条小文档笔记与 480 条同构，登记为同源形状） |

#### 1.2.3 与 `ui-shot.mjs` 的共用方式（抽取白名单，逐字）

| 项 | 冻结 |
| --- | --- |
| 抽出的模块 1 | `pix/scripts/lib/pdf-fixture.mjs`：从 `ui-shot.mjs:137-139`（`escapePdfText` 3 行）与 `:149-227`（`buildPdf` 79 行）**逐字搬移**并 `export`；不新增调用者 |
| 抽出的模块 2 | `pix/scripts/lib/stub-preload.mjs`：从 `ui-shot.mjs:438-1320`（`buildStub` 883 行）逐字搬移并改为 `export function buildStub(config)`；**唯一允许的模板差异**为 5 处：① 文件头注释补来源行（可选，≤ 1 行）；② `const LIBRARY_TREE = [...]`（`:839-847`，9 行）→ `const LIBRARY_TREE = CONFIG.tree;`；③ `const LIBRARY_TREE_B = [...]`（`:850-852`，3 行）→ `const LIBRARY_TREE_B = CONFIG.treeB;`；④ `libraryList` 的 archive 分支（`:858`）→ `if (key === normalizePath(CONFIG.archiveDir)) return { success: true, nodes: CONFIG.archiveChildren };`；⑤ `config` 新增键 `tree` / `treeB` / `archiveDir` / `archiveChildren`。其余行逐字不动（含既有 API 面方法数、控制口名、类名与错误文案） |
| `ui-shot.mjs` 侧的重建 | 顶层 import 两个模块；在**模块作用域**（建议紧随 `LONG_BOOK_OUTLINE` `:351` 之后）重新声明 `LIBRARY_TREE` / `LIBRARY_TREE_B`（内容与语义等价：`path.join(LIBRARY_DIR, …)` / `path.join(LIBRARY_B_DIR, …)`），并在 `main()` 的 `writeFileSync(STUB_PATH, buildStub({…}))` 处传入 config：`root` / `rootB` / `name` / `nameB` / `samplePath` / `samplePathB` / `olderPath` / `notesFilePath`（逐字取自既有 `:439-448`）+ `tree` / `treeB` / `archiveDir`（`join(LIBRARY_DIR, "archive")`）/ `archiveChildren`（`LIBRARY_TREE[0].children`） |
| `perf-probe.mjs` 侧的使用（**12 键同形**，MF-D7；本档补齐逐键表） | 同一 `buildStub(config)` 构建 `<PERF_ROOT>/stub-preload.cjs`；`config` 逐键冻结：`root` = `join(PERF_ROOT, "library")`；`rootB` = **同 `root`**（探针只用一个工作区）；`name` = `pix-v06-r19-perf`（**复位命中键**）；`nameB` = `pix-v06-r19-perf-b`（**必须给值**：`JSON.stringify` 会丢掉 `undefined` 键 ⇒ 不给值会让首页第二张卡片名为空串）；`samplePath` = `join(root, "sample-paper.pdf")`；`samplePathB` = `join(rootB, "sample-paper.pdf")`；`olderPath` = `join(root, "archive", "older-paper.pdf")`；`notesFilePath` = `join(root, ".pix-read", "notes.json")`；`tree` = 41 个文件行（`big-book.pdf` + `doc-01.pdf`…`doc-40.pdf`，绝对路径）；`treeB` = `[]`；`archiveDir` = `join(root, "archive")`；`archiveChildren` = `[]` |
| `samplePath` / `samplePathB` / `olderPath` 的登记（MF-D7） | 抽取后模板**不再引用**这三个键（树行全部来自 `CONFIG.tree` / `CONFIG.treeB`）⇒ 登记为「**键面保留、无模板消费者**」；保留的理由 = 两侧 config 同形是 §1.2.3 差异白名单的前提（模板 `CONFIG` 字面量的差异只允许「新增 4 键」），删键会把差异面扩出白名单（非死代码：它们是共享模块的 config 形参面） |
| `recentProjects` 的可见结果与复位命中（MF-D7） | 模板 `:888-890` 固定返回**两条** `recentProjects`（`CONFIG.name` 与 `CONFIG.nameB`，均指向 `root`）⇒ 首页出现**两张**卡片（`HomePage.vue:124-134` 的 `v-for`）；`resetToWorkspace()` 按 `.v-list-item-title` 文本**逐字等于 `CONFIG.name`**（`pix-v06-r19-perf`）命中卡片（`ui-shot.mjs:1781-1784` 的既有定位同款）⇒ 第二张卡片不参与命中，无歧义；dev 档登记首页卡片数与命中键 |
| 等价性论证（archive 分支） | 既有分支 `key.endsWith("/archive")` 在既有场景中只被 A 库的 `archive` 目录命中（B 树无 archive 节点；无嵌套 archive）⇒ 改为等值匹配 `CONFIG.archiveDir` 后**行为等价**；差异属白名单 ④ |

#### 1.2.4 抽取的机械判据（逐字，MF-08）

| 判据 | 命令与期望 |
| --- | --- |
| ① 差异白名单（逐行归类，**不设行数上限**） | 用同一 `PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v06-r19-stubsha` 跑改前 / 改后各一次 `ui-shot.mjs`，`diff <改前>/stub-preload.cjs <改后>/stub-preload.cjs` 的**每一行**必须落在 §1.2.3 的 5 类形态内（`CONFIG` 键展开行 / `LIBRARY_TREE` 块 → 1 行 / `LIBRARY_TREE_B` 块 → 1 行 / archive 分支 1 行 / 头注释 ≤ 1 行）；**出现无法归类的行即不通过**；行数作为读数登记（原「≤ 6 行」作废） |
| ② 唯一插值点不变 | `grep -c '\${' pix/scripts/lib/stub-preload.mjs` = **1**（= 改前 `sed -n '438,1320p' pix/scripts/ui-shot.mjs \| grep -c '\${'` 的实测值）；新增的 `CONFIG.tree` / `CONFIG.treeB` / `CONFIG.archiveDir` / `CONFIG.archiveChildren` 引用**不含** `${` |
| ③ 模板纪律零改写 | `grep -c "listSessions\|readerStateSave\|switchSessionCalls\|setSessions\|readerStateSaveCalls"` 在两文件的计数**之和 = 31**（模板区 10 + 模板外 21）；另 `grep -c "contextBridge.exposeInMainWorld" pix/scripts/lib/stub-preload.mjs` ≥ 1 |
| ④ 引擎搬移不复制 | `grep -c "function buildPdf" pix/scripts/lib/pdf-fixture.mjs` = **1**；`grep -c "function buildPdf" pix/scripts/ui-shot.mjs` = **0**；`grep -c "function buildPdf" pix/scripts/perf-probe.mjs` = **0**；`grep -c "function buildStub" pix/scripts/lib/stub-preload.mjs` = **1**、`pix/scripts/ui-shot.mjs` = **0**、`pix/scripts/perf-probe.mjs` = **0** |
| ⑤ 既有面零缺失 | 改后 `ui-shot.mjs` 一轮：退出码 0、`failure === null`、既有 186 张 / 264 条 / 74 种 label 零缺失（抽取不得改变任何读数） |

### 1.3 测量实现（逐条：计时点 / 采样 / 统计 / 预热 / 复位 / 防空）

#### 1.3.0 公共口径（逐字，req §0.4）

| 项 | 冻结 |
| --- | --- |
| 计时器 | 渲染层路径一律在**同一次** `executeJavaScript` 内用 `performance.now()`：`t0 = performance.now()` 与触发动作（`.click()` / 输入写入 / `scrollTop` 赋值）在同一同步段；`t1` = 轮询判定成立的时刻；一次测量 = 一次 `executeJavaScript`（不含 IPC 往返） |
| 轮询 | `setTimeout(poll, 16)`；判定表达式在渲染层求值；有界超时 ⇒ 该项 `value: null` + `verdict: "fail"` + `data.timeout: true`（不记 0） |
| 心跳 | 测量窗口内 `setInterval(tick, 16)` 的相邻 tick 间隔最大值 = `stall.max.ms`；窗口内 tick < 2 ⇒ 该指标判 fail |
| 预热 | 每条指标在正式采样前执行**一次完整流程**并丢弃结果（`PERF_WARMUP = 1`，写死不可配置）；预热轮**不打印** `[perf] metric` / `[perf] data` |
| 采样与统计 | `PERF_K = 3`，报告 median 与 `samples` 全量；`search.cold.ms` 为**单次**（`stat: "single"`）；`②` 为 3 趟 × 30 次翻页（`samples` 长度 90，median / max 按全量算）；三条 `stall.max.ms` = 各轮窗口 max 的 max |
| 交互节奏 | ② 每次点击前必须等上一步的 `turn` 与 `render` **两个**终点都成立（无排队，写死）；④ 的逐键输入每键之间等「行数稳定」（连续 2 次 16ms 心跳计数不变） |
| 复位纪律（**含 reader-state 删除，MF-D1**） | 复位 = 删阅读现场 → **重新挂载工作区** →（需要文档的路径）`openRow`。顺序逐字冻结：① 在**工作区挂载之前**删除 `PERF_STATE_FILE`（= `<PERF_ROOT>/library/.pix-read/reader-state.json`，探针自有临时夹具，`force: true`），时点 = `goHome()` 成功之后、点项目卡片之前；② `goHome()`（`ui-shot.mjs:1767-1776` 同款：点 `.pill-icon-btn[title="返回首页"]` → 等 `.project-list-item`）；③ 点项目卡片（等 `.workspace-page`）。复位本身**不计入**任何指标。理由：阅读现场在打开文档后即被持久化（`PdfViewer.vue:744` 的 `noteLanding` 与 `:1027` 的 `noteChange` → `reader-state-store.ts:242` / `:250`），而树行点击会登记恢复意图（`WorkspacePage.vue:207-211` → `reader-state-store.ts:229-235` → `PdfViewer.vue:700-702` / `:740` 的 `initialPage = lateJump ?? jumpPage ?? restore?.page ?? 1`）⇒ 不删会让「第 1 页」的复位读数随上一趟落点漂移；`ui-shot.mjs:412-413` 是同一处置的既有先例 |
| 复位态 | ① = 无打开文档（`.page-label` 不在场、`.pdf-page` 计数 = 0）+ `data.reset` 逐字 `no-document`；②③⑤ = `big-book.pdf` 第 1 页（`.page-label` 逐字 `第 1 / 304 页` ⇒ 该文本即 `data.resetPage`，**硬断言**），③ 额外要求 `.pdf-search-panel` 不在 DOM；④⑦ = 刚挂载（`.note-row` = 0 / `.tree-row` = 0）；⑤ = `big-book.pdf` 第 1 页 + `scale = 100%` + 地图闭合 |
| 复位的实现（本档补齐，MF-D1） | 探针内 `async function resetToWorkspace()` = **`rmSync(PERF_STATE_FILE, { force: true })`（必须在工作区挂载之前）** → `goHome()` → 点项目卡片（与 `ui-shot.mjs:1777-1791` 的 `enterWorkspace` 同款：按 `.v-list-item-title` 文本 `pix-v06-r19-perf` 命中卡片）→ 等 `.workspace-page`；需要打开文档的路径（②③⑤）在复位之后各自 `openRow("big-book.pdf")` + 等 `.page-label` 逐字 `第 1 / 304 页`（即 `data.resetPage` 的硬断言值；文档未打开时点树行会被 `WorkspacePage.vue:207-211` 接受并加载）；④⑦ 的复位后**不得**改写任何控件值（搜索框 / 排序 / 仅看当前文档一律靠重新挂载回到初值） |
| 统计读法与解释边界（登记，MF-D10） | ① req §0.5 #2–#5 的「**30 次 median**」= **每趟** 30 次翻页的纪律（防空：`samples.length === 30` 每趟）；本档的统计样本量 = K=3 趟合计 **90**，median / max 按**全量 90** 计算，`data.passes = [30,30,30]` 保留逐趟长度证据。② ④ 与 ⑪ 的测量发生在 `leftTab = "library"` 的**隐藏**笔记面板上（`WorkspacePage.vue:41` 默认值、`:319` 的 `v-show`）⇒ DOM 会照建（`v-if` 链与可见性无关），但 **layout / paint 不计入**：读数是「store 管道 + DOM 构建」，**不是「可见首屏」**（req §0.5 #10 只声明了不含 `v-show` 翻转）。③ ⑤ 的 `map.scroll.ms` 是**节流代理量**：`scrollTop` 赋值同帧即达标 ⇒ 读数 ≈ 30 个 16ms 心跳的常数级（约 480ms 量级），判别力落在 `map.scroll.stall.max.ms` |

**逐条测量表**（`#` 与 req §0.5 的编号一致；实现的指标 id 逐字）

| # | 指标 id | 规模不变量 / 恒等 | 起点（同一同步段取 t0） | 终点谓词（渲染层表达式要点） | 统计 / 超时 | 预热 | 复位与防空读数 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `open.bigdoc.ms` | — | `.tree-row[title$="big-book.pdf"]` 的 `click()` | `.pdf-page[data-page="1"] canvas` 的 `style.width` 非空 **∧** 该页 `.textLayer span` 在场 **∧** `.page-label` 文本（`\s+` 归一化 + trim）逐字 `第 1 / 304 页` | K=3 median / 20s | 1 次完整流程 | 复位 = 无打开文档（§1.3.0 复位纪律：删 `reader-state.json` → `goHome()` → 点卡片，**不** `openRow`）且 `data.reset` 逐字 `no-document`；`data.pageLabelBefore` = t0 时刻 `.page-label` 文本（期望 `null`）、`data.pdfPagesBefore` = `.pdf-page` 计数（期望 0）；**禁止**同文档重复点树行 |
| 2–5 | `paging.turn.median.ms` / `paging.turn.max.ms` / `paging.render.median.ms` / `paging.render.max.ms` | — | `.pdf-page-indicator button[title="下一页"]` 的 `click()` | `turn` 终点 = `.page-label` 文本逐字 `第 {K} / 304 页`（K = 2..31）；`render` 终点 = 第 K 页 `canvas` 非空 `style.width` **∧** 第 K 页 `.textLayer span` 在场；**两个终点都成立后才点下一次** | 3 趟 × 30 次；`samples` = 90；median / max 全量 / 单次 5s | 1 趟 30 次（丢弃） | 复位 = `big-book.pdf` 第 1 页（**每趟前**走完整复位纪律：删 `reader-state.json` → 重新挂载 → `openRow("big-book.pdf")` → 等 `.page-label`；删文件必须先于挂载 ⇒ 无恢复意图登记）；`data.resetPages` = 三趟各自复位后的 `.page-label`，**硬断言逐字 `第 1 / 304 页`**；防空：`samples.length === 30` **每趟**、第一趟首个 `turn` 终点原始文本逐字 `第 2 / 304 页` |
| 6 | `paging.stall.max.ms` | — | 同 #2 | 心跳窗口 = 每趟 30 次翻页的连续窗口 | 3 趟窗口 max 的 max / 绝对 1000 | 同 #2 | 每趟 tick ≥ 2（否则 fail） |
| 7 | `search.cold.ms` | `search.hits` = `第 1 / 10 处 · 第 121 页`；`search.firsthit.page` = 121 | 打开浮层**之后**：向 `.pdf-search-panel .search-input` 用原生 setter 写 `Chapter 13 body` 并派发 `input`（与 `ui-shot.mjs:9557` 的 `pdfSearchSet` 同款；打开浮层动作不计时） | `.pdf-search-panel .search-status` 文本逐字 `第 1 / 10 处 · 第 121 页` | **单次** / 60s | 1 次完整冷流程（丢弃） | 复位 = 完整复位纪律（删 `reader-state.json` → 重新挂载）→ `openRow("big-book.pdf")` → 等 `.page-label` 逐字 `第 1 / 304 页`（`data.resetPage` 硬断言）；冷证据：打开浮层**前** `document.querySelector(".pdf-search-panel") === null` 的原样读数（`data.panelAbsentBeforeOpen`） |
| 8 | `search.warm.ms` | — | 同一面板实例内：清空 `.search-input` 并派发 `input` → 等 `.search-status` 回到**不在场**（`statusText === ""`）→ 再写同一词并派发 `input`（**禁止**同值重写：`PdfSearchPanel.vue:348` 的 `watch(query)` 需真值变化） | 同一文本 `第 1 / 10 处 · 第 121 页` | K=3 median / 20s | 1 次完整流程 | `data.warmSteps` 逐字 `clear-then-retype`、`data.query` 逐字 `Chapter 13 body`；三次采样的 `statusText` 逐字相同 |
| 9 | `search.scan.stall.max.ms` | — | 同 #7 | 心跳窗口 = 冷窗口 + 3 次暖窗口 | 各窗口 max 的 max / 绝对 1000 | 同 #7 | 每窗口 tick ≥ 2 |
| 10 | `notes.firstscreen.ms` | `notes.rows.alldocs` = 520；`notes.rows.groups` = 41 | 首页项目卡片的 `click()`（同段取 t0） | `.note-row` 计数 = **520** **∧** `.notes-group-head` 计数 = **41** | K=3 median / 20s | 1 次完整流程 | 复位 = 刚挂载（复位纪律含删 `reader-state.json`）；防空：`data.rowsBefore`（t0 时刻 `.note-row` 计数）= **0**（硬断言） |
| 11 | `notes.search.key.max.ms` | — | 逐键写入 `.notes-search-input`（13 键逐字 `Conclusion 13`）并派发 `input`（每键：写一个前缀 → 等行数稳定） | `.note-row` 计数稳定（连续 2 次 16ms 心跳不变） | 3 轮 × 13 键；`samples` = 39；value = max / 20s（每轮） | 1 轮 13 键（丢弃） | 复位 = 刚挂载（同 #10，复位纪律含删 `reader-state.json`；搜索框空、排序 = 页码、未开仅看当前文档）；防空：`data.keyCounts` = 3 × 13 原样读数；断言「至少一键使计数相对上一键变化」且「末键计数 < 首键计数」 |
| 12 | `map.open.ms` | — | `.map-toggle` 的 `click()` | `.map-row` 计数 = **330** | K=3 median / 20s | 1 次完整流程 | 复位 = 完整复位纪律（删 `reader-state.json` → 重新挂载 → `openRow("big-book.pdf")` → 等 `.page-label` 逐字 `第 1 / 304 页`）+ 地图闭合（每次采样前闭合：点 `.map-toggle` 关闭并等 `.map-row` 计数回到 0，关闭动作不计时） |
| 13 | `map.expand.ms` | `map.rows` 折叠中间态 = 320 | `Chapter 01` 行的 `.row-chevron` 的 `click()`（折叠） | 第一阶段 = `.map-row` 计数 = **320**；随后再点展开 ⇒ = **330**；指标 = **两次点击的合计** | K=3 median / 20s | 1 次完整流程 | 复位同 #12；防空 = 320 → 330 的中间态断言 |
| 14 | `map.scroll.ms` | — | `.map-tree` 的 `scrollTop = 0` 后分 **30** 步递增（每步等一个 16ms 心跳）到 `scrollHeight - clientHeight` | `scrollTop` 达到目标值（**节流代理量**：赋值同帧即达标 ⇒ 读数 ≈ 30 个 16ms 心跳的常数级） | K=3 median / 20s | 1 次完整流程 | 复位同 #12；`data.scrollTargetPx` 原样登记 |
| 15 | `map.scroll.stall.max.ms` | — | 同 #14 | 心跳窗口 = 3 轮滚动 | 3 轮窗口 max 的 max / 绝对 1000 | 同 #14 | 每轮 tick ≥ 2 |
| 16 | `tree.badge.ms` | `tree.rows` = 41；`tree.badge.bigbook` = `480 条` + `title` 逐字 `摘录 240 条 · AI 结论 240 条` | 首页项目卡片的 `click()`（同段取 t0） | `.tree-row` 计数 = **41** **∧** `big-book.pdf` 行的 `.row-notes` 文本逐字 `480 条` **∧** 该行 `getBoundingClientRect().height > 0` | K=3 median / 20s | 1 次完整流程 | 复位 = 刚挂载（复位纪律含删 `reader-state.json`；`leftTab` 默认 `library` ⇒ 树在屏）；防空：`data.rowsBefore` = **0**（硬断言）；`data.rowHeightPx`、`data.progressBadge`（reader-state 被删时的进度徽标读数，`LibraryPanel.vue:38-47` / `progressPageFor` `:218`）原样登记 |
| 17 | `report.export500.ms` | `report.head`；`report.chapters` | （主进程面）`exportDocumentReport(...)` 调用前的 `performance.now()` | 同一次同步调用返回后的 `performance.now()` | K=3 median / 绝对 2000 | 1 次（组内先跑一次丢弃） | 夹具 = 480 条 `big-book.pdf` 笔记；`progress = { page: 1, pageCount: 304 }` |

**恒等断言（无阈值，判错即红）**

| # | 断言 id | 落点 | 恒等值 |
| --- | --- | --- | --- |
| 18 | `notes.rows.alldocs` | #10 终点 | `.note-row` = **520** |
| 19 | `notes.rows.groups` | #10 终点 | `.notes-group-head` = **41** |
| 20 | `notes.rows.currentdoc` | #10 之后的一次性读数：`openRow("big-book.pdf")` + 等 `.page-label` `第 1 / 304 页` → 点 `.notes-filter input`（`<v-switch label="仅看当前文档">`；定位方式 = 既有 `SEL.notesFilterInput` = `.notes-filter input`，与 `ui-shot.mjs:4470-4476` 的 `toggleCurrentDocOnly` 同款）→ 等 `.note-row` = **480** → 再点一次复位为 **520** | 480（并登记 `data.rowsAfterOff` = 520） |
| 21 | `map.rows` | #13 | 默认展开 **330** / 折叠 **320** / 展开 **330** |
| 22 | `tree.rows` | #16 | `.tree-row` = **41** |
| 23 | `tree.badge.bigbook` | #16 | `480 条` + `title` 逐字 `摘录 240 条 · AI 结论 240 条` |
| 24 | `search.hits` | #7 | 状态行逐字 `第 1 / 10 处 · 第 121 页` |
| 25 | `search.firsthit.page` | #7 | **121**（防空：首个结果页不是第 1 页） |
| 26 | `report.head` | #17 | 归一化后逐字含 `阅读进度：第 1 / 304 页；共 480 条（摘录 240 · AI 结论 240）。` |
| 27 | `report.chapters` | #17 | `^## ` 行数 = **30**，每行含逐字 `（16 条）` |

**证据行键集（§0.3 冻结的 `[perf] data` 行，逐条）**

| id | 键 |
| --- | --- |
| `open.bigdoc.ms` | `{ reset, pageLabelBefore, pdfPagesBefore, endpointLabel }` |
| `paging.*`（4 条共用一行） | `{ resetPages, firstTurnLabel, passes: [30,30,30] }`（`resetPages` = 三趟各自复位后打开时的 `.page-label`，硬断言逐字 `第 1 / 304 页`） |
| `search.cold.ms` | `{ resetPage, panelAbsentBeforeOpen, instanceOpened, query, statusText, firstHitPage, hits }` |
| `search.warm.ms` | `{ warmSteps, query, statusText, samplesText }` |
| `notes.firstscreen.ms` | `{ reset, rowsBefore, rows, groups }` |
| `notes.search.key.max.ms` | `{ query, keyCounts: [[13], [13], [13]] }` |
| `notes.rows.currentdoc` | `{ switchLabel, rowsAfterOn, rowsAfterOff }` |
| `map.*` | `{ resetPage, rowsDefault, rowsCollapsed, rowsExpanded, scrollSteps, scrollTargetPx }` |
| `tree.badge.ms` | `{ reset, rowsBefore, rows, badgeText, badgeTitle, rowHeightPx, progressBadge }` |
| `fixture` | `{ pages, outlineNodes, notesTotal, notesBigBook, docs, pdfBytes }` |

#### 1.3.1 单轮预算分解（240s，req 的开放问题 9 与评审观察 9 的处置）

| 路径 | 预热 + 采样次数 | 预期耗时（正常机器） | 由单项超时推导的上界 |
| --- | --- | --- | --- |
| ① 打开 | 4 ×（304 页打开 + `measurePages`） | 2–6s | 4 × 20s = 80s |
| ② 翻页 | 4 趟 × 30 次 × 2 终点 | 6–20s | 120 × 5s = 600s（首破预算项，故单步 5s 必须真正生效） |
| ③ 搜索 | 1 预热冷 + 1 冷 + 3 暖 | 冷 2 次 × 2–8s + 暖 ≈ 0 | 60 + 60 + 3 × 20 = 180s |
| ④ 首屏 + 键入 | 4 × 首屏 + 4 × 13 键 | 4–12s | 4 × 20 + 4 × 20 = 160s |
| ⑤ 地图 | 4 ×（open + expand + scroll） | 4–10s | 4 × 3 × 20 = 240s |
| ⑦ 树徽标 | 4 × 重新挂载 | 2–6s | 4 × 20 = 80s |
| 合计（预期） | — | **≈ 20–60s** | 上界远超 240s ⇒ 由 `PERF_TOTAL_BUDGET_MS` 与单项超时共同兜住 |

**预算口径**：240s 只覆盖探针自己的采样窗口（①–⑤ / ⑦）；⑥ 的读数在 `smoke-notes.mjs` 内（不进探针预算）；夹具生成、vite 与窗口引导、收尾均**不计入**（dev 档另行用 `time` 登记整进程 wall-clock）。

冻结：`PERF_TOTAL_BUDGET_MS = 240000` **自首次预热开始计**（不含夹具生成 / vite / 窗口引导 / 收尾），超出 ⇒ 停止采样（已采指标照常输出并参与判定）、`ok: false`、`failures[]` 增 `{ id: "budget", reason: "采样窗口超出 240s 预算" }`、退出码 **1**；预热轮同样计入预算。

### 1.4 阈值表（27 条逐字 + 实现落点）

`B` = 基线读数（`--baseline` 文件内同名指标值）。**绝对 6 / 相对 11 / 恒等 10**；实现落点：perf-probe **24** 条（时序 16 = 绝对 5 + 相对 11；恒等 8）、smoke-notes **3** 条（时序 1 绝对 + 恒等 2）。

| # | 指标 id | 实现落点 | 单位 | 统计 | 判据 | 阈值 | 实现常量 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `open.bigdoc.ms` | perf-probe | ms | K=3 median | 绝对 | ≤ **3000** | `LIMIT_OPEN_BIGDOC_MS` |
| 2 | `paging.turn.median.ms` | perf-probe | ms | 90 samples median | 相对 | ≤ **1.5 × B** | `TOLERANCE_MEDIAN` |
| 3 | `paging.turn.max.ms` | perf-probe | ms | 90 samples max | 相对 | ≤ **2.0 × B** | `TOLERANCE_MAX` |
| 4 | `paging.render.median.ms` | perf-probe | ms | 90 samples median | 相对 | ≤ **1.5 × B** | `TOLERANCE_MEDIAN` |
| 5 | `paging.render.max.ms` | perf-probe | ms | 90 samples max | 相对 | ≤ **2.0 × B** | `TOLERANCE_MAX` |
| 6 | `paging.stall.max.ms` | perf-probe | ms | 心跳 max | 绝对 | ≤ **1000** | `LIMIT_STALL_MS` |
| 7 | `search.cold.ms` | perf-probe | ms | 单次 | 绝对（**灾难性回退护栏**，非回归主判据） | ≤ **20000** | `LIMIT_SEARCH_COLD_MS` |
| 8 | `search.warm.ms` | perf-probe | ms | K=3 median | 相对（③ 的**回归检测主判据**） | ≤ **1.5 × B** | `TOLERANCE_MEDIAN` |
| 9 | `search.scan.stall.max.ms` | perf-probe | ms | 心跳 max | 绝对 | ≤ **1000** | `LIMIT_STALL_MS` |
| 10 | `notes.firstscreen.ms` | perf-probe | ms | K=3 median | 相对 | ≤ **1.5 × B** | `TOLERANCE_MEDIAN` |
| 11 | `notes.search.key.max.ms` | perf-probe | ms | 39 samples max | 相对 | ≤ **2.0 × B** | `TOLERANCE_MAX` |
| 12 | `map.open.ms` | perf-probe | ms | K=3 median | 相对 | ≤ **1.5 × B** | `TOLERANCE_MEDIAN` |
| 13 | `map.expand.ms` | perf-probe | ms | K=3 median | 相对 | ≤ **1.5 × B** | `TOLERANCE_MEDIAN` |
| 14 | `map.scroll.ms` | perf-probe | ms | K=3 median | 相对（**节流代理量**） | ≤ **1.5 × B** | `TOLERANCE_MEDIAN` |
| 15 | `map.scroll.stall.max.ms` | perf-probe | ms | 心跳 max | 绝对 | ≤ **1000** | `LIMIT_STALL_MS` |
| 16 | `tree.badge.ms` | perf-probe | ms | K=3 median | 相对 | ≤ **1.5 × B** | `TOLERANCE_MEDIAN` |
| 17 | `report.export500.ms` | smoke-notes | ms | K=3 median | 绝对 | ≤ **2000** | `LIMIT_REPORT_EXPORT_MS` |
| 18–27 | 见 §1.3 恒等表 | perf-probe 8（#18–#25）/ smoke-notes 2（#26–#27） | count / text | — | 恒等（`kind: "invariant"`） | 恒等值 | — |

**阈值纪律（逐字）**：阈值只存在于脚本常量（`grep -n "LIMIT_\|TOLERANCE_"` 可列全）；基线 JSON 只有 `metrics[].value`；相对指标缺基线 ⇒ `verdict: "skip"` + `[perf] warn no-baseline <id>`；验收运行的 `skip` 计数 = **0**。

**抖动纪律与读数登记（逐字，MF-D9）**

| 项 | 冻结 |
| --- | --- |
| 抖动幅度依据（R18 同源数据，评审实读） | 同一相位「`.map-toggle` → 220 行 ≤ 800ms」在四个干净轮次读 **80 / 87 / 95 / 119 ms**，在机器被外部进程占用（`PiX.exe` ×4 + `MsMpEng`）的轮次读 **966 / 973 ms**（`docs/pm/R18-dev.md:131` / `:224` / `:273`）⇒ **同一份代码在负载下的放大系数 ≈ 8–12×**。据此：① 三条 `LIMIT_STALL_MS = 1000` 与 `LIMIT_OPEN_BIGDOC_MS = 3000` 在同等负载下会误报（绝对判据的代价，本轮无相对伴随判据）；② 相对判据里的 `paging.render.max.ms` / `paging.turn.max.ms`（`max(90)` 比值 ≤ 2.0）在重尾分布上本身噪声大，负载轮次可轻松破 2.0× |
| 运行纪律（写死） | ① **串行**：`ui-shot.mjs` 与 `perf-probe.mjs` 不得并发（5199 / 5200 与机器负载互相污染）；② **空闲前提**：采样前登记当时的重负载进程与空闲内存（dev 档逐轮登记）；③ **负载红轮不判回退**：出现红时先核对当轮负载读数；若当轮存在外部重负载 ⇒ 在**同一份代码、同一命令**下于空闲时段复跑一次，取**空闲绿轮**作为验收读数（R18 的既有处置先例）；④ **不得改阈值**：任何情况下不允许以「机器慢」为由放宽本表的阈值或删断言（改判只走 N106-2 判据 1 的登记流程） |
| 离散度登记（dev 档硬要求） | `samples ≥ 30` 的指标（② 的 4 条 + ⑪ + 三条 `stall.max.ms` 的窗口读数）除 median / max 外登记 **p95**；K=3 的指标登记**三个原始读数**（等价 min / median / max）；全部数值取自 `[perf] JSON` 的 `samples` 全量，不得手写 |
| 已登记的检出盲区（本轮接受） | `open.bigdoc.ms` 是本轮唯一只有绝对阈值、**无相对伴随判据**的指标（§6 R2 / §9#3）：机器整体变慢 2–3× 或 `measurePages`（`PdfViewer.vue:197-209`）劣化时不会转红 ⇒ dev 档必须写明实测余量倍数；补伴随判据需新增第 28 条指标并同步配额（§9#3） |

### 1.5 N108 加固的确切改法（统一 helper 与重试边界）

#### 1.5.1 `SEL` 增量（唯一）

`SEL` 末尾（现 `:130` 的 `sessionDocMark` 之后、`};` `:131` 之前）追加 1 项 ⇒ **74 → 75**：

```js
  // R19 新增 1 项（设计档 §1.5）
  readerStage: ".reader-stage",
```

消费者（避免制造死键，参照 S-SD-04 的既有教训）：`r19-1` 的注入段用它断言「注入目标位于 `.reader-stage` 子树内」——即产品 `onStageScroll` 的 hide 判据成立（`data.injected.stageContainsScroll === true`）。既有 74 项逐字不动。

#### 1.5.2 定义位移（唯一允许的既有行改动）

| 项 | 逐字 |
| --- | --- |
| 位移对象 | `installStageScrollWatch`（今 `:5708`）、`stageScrollWatchProbe`（今 `:5724`）、`waitStageScrollQuiet`（今 `:5734-5756`）三处 `const` 定义，连同其前置注释头（`:5697-5701`）与空行分隔 —— 实读整块 `:5697-5756`，**60 行** |
| 移入位置 | 同闭包内 `selectPageSpan` 定义（今 `:1838`）**之前**（建议紧随 `openRow` `:1800` 之后、`selectPageSpan` 注释之前） |
| 位移形态 | **纯位移**：函数体逐字不变、默认参数不变（`quietMs = 400` / `timeoutMs = 6000`）、`sleep(60)` 轮询节奏不变；行号变化本身是允许项 |
| 唯一允许的字面改动 | `waitStageScrollQuiet` 的 docstring 第 2 行：把「到 timeoutMs 仍有新增 ⇒ ok:false —— 调用方按『前置失败』判红（不得静默降级为通过）」改为**新语义**「到 timeoutMs 仍有新增 ⇒ ok:false —— 守卫内该结果**只作证据**（照常进入下一步重建与就绪等待），硬失败由全局 deadline 内的 3 次尝试兜住；既有 4 处显式调用点仍按原语义解读」 |
| 为什么必须位移 | `selectPageSpan` 的既有调用点 `:2060` / `:4077` 在同闭包内**早于** `:5697-5756` 执行，`const` 的 TDZ 会使守卫内引用这三处 helper 抛 `ReferenceError`（既有事实已在 `:4071-4072` 的注释中登记） |
| 幂等性 | 位移后三处 helper 仍只有 1 处定义；既有 4 处显式 `waitStageScrollQuiet()` 调用点（`:11329` / `:11462` / `:11490` / `:11569`）保留原样 ⇒ 不产生第二次语义 |

#### 1.5.3 `selectPageSpan` 守卫化（逐字参考实现）

```js
  /**
   * R19 守卫（N108）：静默前置 + 有界重试；就绪谓词 (a)(b)(c) 只增不减。
   * 失败语义：全局 deadline（20000ms，自首次尝试前起算）内 3 次尝试仍未就绪 ⇒ 抛错（不得降级为通过）。
   */
  const selectPageSpan = async (page) => {
    const startedAt = Date.now();
    const deadline = startedAt + R19_SELECT_DEADLINE_MS;
    const trail = [];
    for (let attempt = 1; attempt <= R19_SELECT_MAX_ATTEMPTS; attempt += 1) {
      // ① 有界静默（受全局 deadline 约束；超时只作证据，不判红）
      const quiet = await waitStageScrollQuiet(
        R19_SELECT_QUIET_MS,
        Math.max(0, Math.min(R19_SELECT_QUIET_TIMEOUT_MS, deadline - Date.now())),
      );
      // ② 重建选区（既有 6 行 DOM 段逐字不动；span 不在场时返回 rebuilt:false，不抛错）
      const rebuilt = await js(`(() => {
        const span = document.querySelector('.pdf-page[data-page="${page}"] .textLayer span');
        if (!span) return false;
        const range = document.createRange();
        range.selectNodeContents(span);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
        return true;
      })()`);
      // ③ 有界等待就绪谓词（单项 ≤ 4000ms，受全局 deadline 约束）
      const ready = await waitSelectionReady(
        page,
        Math.max(0, Math.min(R19_SELECT_READY_TIMEOUT_MS, deadline - Date.now())),
      );
      trail.push({ attempt, quiet, rebuilt, ready });
      if (ready.ok) return { attempts: attempt, quiet, trail };
      if (Date.now() >= deadline) break;
    }
    throw new Error(`选择前置失败（attempts=${trail.length}）：${JSON.stringify(trail)}`);
  };
```

| 项 | 冻结 |
| --- | --- |
| 就绪谓词（**只增不减**；既有判据逐字保留） | **(a)** `document.querySelector(".quick-ask")` 在场 **且** `offsetParent !== null`（**既有 `:1850` 的判据，逐字保留**）；**(b)** `getSelection()` 非 collapsed 且锚点在 `.reader-stage` 子树内；**(c)** 选区文本（`\s+` 归一化 + trim）逐字等于 `.pdf-page[data-page="{page}"] .textLayer span` 的首个 span 文本（与 `ensureQuickAskExcerptReady` `:5611-5633` 同一条比较） |
| 就绪等待的实现 | `waitSelectionReady(page, timeoutMs)` = 非抛错有界轮询（`setTimeout(poll, 16)`），返回 `{ ok, hasSpan, visible, collapsed, anchorInStage, selectionText, spanText, waitedMs }`；**不得**用抛错的 `waitFor`（否则 N108-3 判据 2 的「定义体内 `catch` = 0」不可满足）。**两条附加冻结（MF-D3 / MF-D4）**：① **不早退**——`hasSpan === false` 也轮询到谓词成立或 `timeoutMs` 到期（文字层可能迟到，等价于既有首行 `waitFor('第 N 页文本层')` 的语义；同时使 N108-3 的失败路径代价可预期 ≈ 3 × 4000ms）；② 等待标签与证据字段保留 `摘录浮层` 字面（如 `摘录浮层（选择前置）`），它是 §1.6 字面计数判据的一环 |
| `waitSelectionReady` 的定义位置 | 紧随 `selectPageSpan` 之后、同一闭包内（两者同属闭包初始化阶段，`main()` 调用场景前已全部就绪 ⇒ 无 TDZ 风险）；与 §1.5.2 的三处 helper 一样必须先于首个调用点 `:2060` 的**执行时点** |
| 尝试预算 | ≤ **3** 次；每次尝试前重新静默；全局 deadline = **20000ms** 自首次尝试前起算；每轮 `quiet ≤ min(6000, remaining)`、`ready ≤ min(4000, remaining)`（先到者生效，MF-06） |
| 失败语义 | 抛错；文案逐字含 `选择前置失败` 与 `attempts=<已完成轮数>` 与每轮 `{ attempt, quiet, rebuilt, ready }` 轨迹（`JSON.stringify`）；deadline 先到 ⇒ 同一文案 + 已完成部分轨迹；**不得**返回 `ok:false`、不得跳过相位、不得删任何既有断言 |
| 既有「第 N 页文本层」等待的归属 | 既有首行 `await waitFor('第 ${page} 页文本层', …)` 的语义被 ②/③ 覆盖：span 缺席 ⇒ ② 返回 `rebuilt:false`、③ 判 `hasSpan:false`；累计等待 = 3 × 4000 = **≤12s**（原为 20s）——本条是 §0.8「单项 ≤ 4000ms」的直接后果，**登记**为接受的覆盖变化（§6 次级风险 1） |
| 计时 | 守卫自身的 `waitedMs` 只作证据（进 `trail` 与 `r19-1` 的 `data`）；守卫**不改变**任何既有相位的计时基准（既有相位用 `Date.now()` 记的是各自观测窗，见 `ui-shot.mjs:7012` 的 `t0P4`） |

#### 1.5.4 覆盖清单：家族成员零改写 + 4 处残余裸等待的登记（MF-D3）

**覆盖口径（写死）**：N108 的裸等待目标是**全文件 5 处** `摘录浮层` 系裸 `waitFor`（本步 `grep -n "摘录浮层" pix/scripts/ui-shot.mjs` = **6** 行：`:1465` / `:1512` / `:1540` / `:1850` / `:9552` + `:11327` 注释）。其中**只有 `:1850` 被守卫化**（在 `selectPageSpan` 内）；其余 4 处**不在守卫覆盖内**，逐条登记如下（不扩权改既有相位）。

| 成员 | 行 | 冻结 |
| --- | --- | --- |
| `excerptFirstSpan` | `:5517-5534` | 函数体零改写；其 `selectPageSpan(1)`（`:5518`）自动获得守卫 |
| `excerptViaQuickAsk` | `:5638-5658` | 零改写（不调用 `selectPageSpan`） |
| `ensureQuickAskExcerptReady` | `:5611-5633` | 零改写（含 `attempts = 3`、`:5615` 的 `waitStageScrollQuiet()`、`:5629` 的重取调用）；其重取路径现在进入**守卫化**的 `selectPageSpan`（多一层静默 + 就绪等待，仍受守卫自身 deadline 约束） |
| `focusPage` | `:5595-5602` | 零改写（不改用守卫：它的 `waitFor` 是既有语义，且它在选区之前） |
| 既有 4 处显式静默前置 | `:11329` / `:11462` / `:11490` / `:11569` | 保留原样（幂等；不产生第二次语义）；其紧邻的 `selectPageSpan` 仍按守卫执行 |
| 残余裸等待（**登记，本轮不改**） | `:1465` / `:1512` / `:1540` / `:9552` | 逐条理由见下表；它们的字面**保留原样**（§1.6 的字面计数判据据此可算） |

**四处残余的逐条理由与命中处置（MF-D3）**

| # | 位置（闭包 / 标签） | 为什么本轮不改 | 命中时的处置 |
| --- | --- | --- | --- |
| 1 | `:1465`（`runScenario` 06 段；标签逐字 `摘录浮层`） | 该处紧跟「全文层选区 + `selectionchange`」的既有 6 行 DOM 段；改走守卫会在等待前插入 ≈ 0.45s 静默 + 重建，**改变 `06-excerpt-entry-first-frame.png` / `06b-…-settled.png` 的「首帧 / 稳定帧」时序语义**（req §0.9 禁止既有截图像素变化）；且近三轮 S-SD-02 的中断点固定在 `:1850`，未命中该处 | `MANIFEST.json.failure` 文案含 `等待超时：摘录浮层（…）` 且中断点在 `runScenario` ⇒ dev 档原样登记 + 上报负责人；是否把这处纳入授权由负责人裁决（§9#7） |
| 2 | `:1512`（`runScenario` 07 段；标签逐字 `摘录浮层复现`） | 该处的等待直接决定后续「摘录 → 原位反馈（`FEEDBACK_MS = 2500`）」相位的起始时刻；+≈0.45s 会移动 `07-excerpt-feedback.png` / `07b-…-zoom.png` 与反馈态判据（`waitFeedbackCleared`）的时序面 ⇒ 不扩权改 | 同上（文案含 `摘录浮层复现`） |
| 3 | `:1540`（`runScenario` 07 段；标签逐字 `摘录浮层重现`） | 该处是「同文本重复选区」的控制步：产品在该形态下**不重置反馈态**（`PdfSelectionQuickAsk.vue:135-137` 的早退，浮层在等待开始前已在场）；改走守卫会引入一次 `selectionchange` 重建 + ≈0.45s 静默，可能越过 `FEEDBACK_MS = 2500` 的回落窗口，改变 `:1543-1546` 的既有判据面 ⇒ 不扩权改 | 同上（文案含 `摘录浮层重现`） |
| 4 | `:9552`（`selectionOnPageOne`；标签逐字 `摘录浮层（选择链路）`） | 同闭包内本可复用守卫，但该 helper 造的是**部分选区**（`range.setStart(node, 0)` / `setEnd(node, Math.min(12, …))`，`:9543-9545`）：守卫的重建会把选区还原为**全 span**，改变下游 `:9998` → `:10013` / `:10029` 读到的选区语义（`selection16c`）与紧随的 `r16-3-note-anchor.png` 时点 ⇒ 不扩权改 | 同上（文案含 `摘录浮层（选择链路）`）；**如果负责人同意改这处**，正确形式是「静默前置 + 保留部分选区」，不是直接走守卫 |

**销账口径（收窄，MF-D3）**：S-SD-02 本轮的销账范围 = **`selectPageSpan` 家族**（守卫内 `:1850` 的裸等待 + 21 处调用点 + 家族 helper 的重取路径）；上表 4 处残余裸等待**不计入销账**，处置 = 登记 + 上报（命中即上报，不得自行扩权）。

#### 1.5.5 新增场景 `r19-1`（挂点与逐相位判据）

**挂点**：`runReaderStateScenarios` 内 `:12325`（`await js("window.__pixStub.setSessions([]), true");`）与 `:12326`（函数收口 `}`）之间；组名 `r19-selection-guard`；**2 条 record**、**1 张截图**（`r19-guard-recovered.png`，在相位 1 末尾 `capturePage`）。

**相位 1 `late-scroll-recovered`**

| 步 | 逐字步骤 |
| --- | --- |
| 1 | 前置：`await restoreStandardSeed();` → `await goHome();` → **`removeState(STATE_FILE_A);`**（既有 helper，`ui-shot.mjs:1704`；常量 `STATE_FILE_A` `:1664`——与 §1.3.0 的探针复位纪律**同一处方**：r19-1 之前的 r18 相位会写 A 库阅读现场 ⇒ 不删时 `openRow` 会登记恢复意图、`waitPage(1, 3)` 不可复现）→ `await enterWorkspace(LIBRARY_NAME);` → `await openRow("sample-paper.pdf");` → `await waitPdfLoaded();` → `await waitPage(1, 3);`（**登记**：req §N108-2 的步列表写作 `restoreStandardSeed()` + `enterWorkspace(...)`；进入 r19-1 时的现场在 **A 工作区内部**（`:12323` 的 `restoreStandardSeed` 需要 `.pill-tab` 在场），故必须插入 `goHome()` 才能 `enterWorkspace`，并补 `removeState(STATE_FILE_A)` 保「第 1 / 3 页」可复现——均为实现级必需步骤，判据不变） |
| 2 | **可见前置（本档补齐，MF-D3）**：先 `const warmGuard = await selectPageSpan(1);` 让浮层**确实可见**（该次调用走既有守卫，其自身读取只作 `data.warmGuard` 登记），再 `const stateBefore = await quickAskStateProbe();` ⇒ **硬断言 `stateBefore.display !== "none"`**。理由：没有这一环，注入发生在「尚无可见态」的窗口里（旧写法）⇒ `display !== "none"` 与 `attempts === 1` 都只是「避开」而非「恢复」，相位退化为假绿（评审 §1.3） |
| 3 | 基线快照（**必须先于注入**）：`await installStageScrollWatch();` → `const baselineCount = (await stageScrollWatchProbe()).count;`（`data.baselineCount`）；**不得**用 `quiet.absorbed` 作防空证据（它是相对**该次调用**的 `from` 差值，`ui-shot.mjs:5738-5741`） |
| 4 | 注入 + **隐藏采样器**（**一个** `js()` 段）：读 `.pdf-scroll` 的 `marginBefore = scrollHeight - clientHeight - scrollTop` 与 `.reader-stage` 包含关系（`SEL.readerStage`）；挂一次性 `setTimeout(…, 60)`：`el.scrollTop = before + R19_GUARD_INJECT_DELTA`，并写 `window.__pixR19Injected = { count, before, after, scrollTopDelta: after - before, at: Date.now() }`；同段挂 `setInterval(…, R19_HIDDEN_SAMPLE_MS = 16)`：每拍读 `.quick-ask` 的 `inDom` / `getComputedStyle().display`，一旦观察到「不在场或 `display === "none"`」即置 `window.__pixR19Hidden = { seen: true, firstHiddenAt, samples }`。同一段返回 `{ marginBefore, marginOk: marginBefore >= R19_GUARD_INJECT_DELTA, stageContainsScroll }`（**余量读数先于写入**；余量不足时 `scrollTop` 被钳制 ⇒ `scrollTopDelta !== 160` 判红） |
| 5 | 调用守卫：`const guard = await selectPageSpan(1);`（守卫首轮静默窗口最短 ≈ 7 × 60ms sleep + `quietMs = 400` ⇒ **60ms 的注入确定落在窗口内**，同时此刻浮层已可见 ⇒ 注入确实触发一次「隐藏」，再由重建选区恢复） |
| 6 | 记录（同一个 `js()` 段先停采样器）：`clearInterval` 并返回 `window.__pixR19Hidden` → `data = { phase: "late-scroll-recovered", baselineCount, marginBefore, marginOk, stageContainsScroll, injected, hiddenSeen: hidden.seen, hiddenFirstAt: hidden.firstHiddenAt, watchCountAfter, stateBefore, warmGuard: warmGuard.attempts, attempts: guard.attempts, branch: guard.attempts === 1 ? "absorbed-first-window" : "retried", quiet: guard.quiet, trail: guard.trail, state, selection, spanText, warnDelta }`（`watchCountAfter` = 守卫返回后一次 `stageScrollWatchProbe().count`；`state` = `quickAskStateProbe()`、`selection` = `selectionProbe()`、`spanText` = `pageSpanText(1)`、`warnDelta = warnCount() - warnBase`） |

失败即红的断言（逐条，**预期代价 ≈ 1.0s**：可见前置 ≈ 0.5s + 守卫 ≈ 0.5s）：

① **可见前置成立**：`stateBefore.display !== "none"`（「隐藏前可见」的硬断言）；
② 守卫成功返回（未抛错）；
③ `injected.count === 1` **且** `injected.scrollTopDelta === 160`（`before` / `after` 原样登记）；
④ `marginOk === true` 且 `stageContainsScroll === true`；
⑤ **`hiddenSeen === true`**（注入后浮层曾被**实测**为不可见 ⇒ 「隐藏」是读数而不是推断）；
⑥ **`trail[0].quiet.absorbed >= 1`**（注入落在守卫**首轮**静默窗口内并被吸收 ⇒ 证明不是「静默窗口过短的空转」；MF-D3）；
⑦ 恢复：`state.display !== "none"` 且 `selection.collapsed === false` 且 `selection.anchorInStage === true` 且 `selection.text === spanText`；
⑧ `watchCountAfter - baselineCount >= 1`（对**基线快照**取差）；
⑨ `warnDelta === 0`；
⑩ `branch` 逐字登记：`absorbed-first-window` 是**唯一被确定性覆盖**的分支；`retried`（`attempts ≥ 2`）本轮**不被确定性覆盖**（确定性覆盖需在就绪窗口内再注入一次，会额外增加 ≈4.5s 并威胁 N109-3 的 +10% 红线 ⇒ 按残余登记，裁决项见 §9#4）——**不得**把本相位表述为「两条分支都被证明」。

**相位 2 `precondition-hard-fail`**

| 步 | 逐字步骤 |
| --- | --- |
| 1 | **确定性前置（本档补齐，MF-D2）**：先**收起选区**：`window.getSelection().removeAllRanges(); document.dispatchEvent(new Event("selectionchange"));`（与既有 DOM 段同源；产品的 `onSelectionChange`（`PdfSelectionQuickAsk.vue:118-123`）在 `rangeCount === 0` 时走 `hide()`）⇒ 有界轮询（`setTimeout(poll, 16)`，≤ 2000ms）直到 `quickAskProbe()` 的 `display === "none"` 或 `inDom === false`；登记 `data.precondition = { selectionCleared: true, displayBeforeGuard, layerHidden: <bool> }`。理由：相位 1 结束时浮层必然可见（判据 ⑦）；不带前置直接调 `selectPageSpan(999)` 时，守卫会因 span 缺失而 `rebuilt: false` **且不派发 `selectionchange`** ⇒ 浮层保持可见 ⇒ 「抛错后不可见」永假，相位 2 不可能绿（评审 MF-D2 的阻塞项） |
| 2 | `let thrown = false; let message = ""; try { await selectPageSpan(999); } catch (err) { thrown = true; message = err instanceof Error ? err.message : String(err); }`（**唯一允许的场景级 `catch`**；预期代价 ≈ 13.5s = 3 × (静默 ≈ 0.45s + 就绪 ≈ 4s)） |
| 3 | 读现场：`quickAskProbe()` 的 `inDom` / `display` |
| 4 | `record("r19-selection-guard", { phase: "precondition-hard-fail", precondition, threw, message, quickAskDisplay, quickAskInDom, warnDelta }, [...])` |

失败即红的断言：① **`precondition.layerHidden === true`**（前置成立：调守卫前浮层已不可见）；② `threw === true`；③ `message` 逐字包含 `选择前置失败`（或 `第 999 页文本层`）；④ **前置已不可见 ∧ 守卫抛错后仍不可见**：`precondition.layerHidden === true` **且**（`quickAskInDom === false` 或 `quickAskDisplay === "none"`）；⑤ `warnDelta === 0`。

#### 1.5.6 配额与零缺失（与 req §0.8 / §0.9 一致）

| 项 | 值 |
| --- | --- |
| 截图 | 既有 186 + **1** = **187**（`r19-guard-recovered.png`） |
| `MEASUREMENTS.json` 长度 | 既有 264 + **2** = **266** |
| label 去重 | 既有 74 + **1** = **75**（`r19-selection-guard` 两条 record 共用同一 label，相位落 `data.phase`） |
| `SEL` | 既有 74 + **1** = **75**（`readerStage`） |
| 烟测-主进程 | 既有 **71** + 3 = **74**；烟测-渲染零改动（9 组 74 条） |

### 1.6 走查判据（命令级，正反双向）

```bash
cd E:/develop/PiX-Read

# ① 文件存在且唯一
test -f pix/scripts/perf-probe.mjs && test -f pix/scripts/lib/pdf-fixture.mjs && test -f pix/scripts/lib/stub-preload.mjs ; echo "FILES_EXIT=$?"   # 0
grep -rn "perf-probe" pix/scripts/ui-shot.mjs | wc -l            # 0
git diff --stat pix/package.json                                 # 无输出

# ② 顶层导入纪律 + 零写仓库
grep -c "await import(\|import(" pix/scripts/perf-probe.mjs      # 0
grep -c "require(" pix/scripts/perf-probe.mjs                    # 0
grep -n "writeFileSync" pix/scripts/perf-probe.mjs               # 恰 1 行（--save-baseline）
grep -c "5200" pix/scripts/perf-probe.mjs                        # >= 1
grep -c "tmpdir()" pix/scripts/perf-probe.mjs                    # >= 1

# ③ 抽取面
grep -c "function buildPdf" pix/scripts/lib/pdf-fixture.mjs      # 1
grep -c "function buildPdf" pix/scripts/ui-shot.mjs              # 0
grep -c "function buildStub" pix/scripts/lib/stub-preload.mjs    # 1
grep -c '\${' pix/scripts/lib/stub-preload.mjs                   # 1
grep -c "listSessions\|readerStateSave\|switchSessionCalls\|setSessions\|readerStateSaveCalls" pix/scripts/lib/stub-preload.mjs pix/scripts/ui-shot.mjs   # 两文件计数之和 = 31

# ④ N108 面
grep -n "const installStageScrollWatch\|const stageScrollWatchProbe\|const waitStageScrollQuiet\|const selectPageSpan\|const waitSelectionReady" pix/scripts/ui-shot.mjs
#   定义顺序逐字：installStageScrollWatch < stageScrollWatchProbe < waitStageScrollQuiet < selectPageSpan（waitSelectionReady 紧随其后）
grep -c "R19_GUARD_INJECT_DELTA" pix/scripts/ui-shot.mjs         # 2
grep -n "  readerStage: " pix/scripts/ui-shot.mjs                # 1（SEL 内）
grep -c "r19-selection-guard" pix/scripts/ui-shot.mjs            # >= 2（两个 record）
grep -c "r19-guard-recovered.png" pix/scripts/ui-shot.mjs        # 1
awk '/const selectPageSpan = async/,/^  };$/' pix/scripts/ui-shot.mjs | grep -c "catch"   # 0
grep -c "选择前置失败" pix/scripts/ui-shot.mjs                    # >= 1
grep -n "摘录浮层" pix/scripts/ui-shot.mjs                        # 恰 6 行，逐行归类：`:1465` / `:1512` / `:1540` / `:9552` 四处残余（§1.5.4）+ `:11327` 注释 + `waitSelectionReady` 的等待标签（替代旧 `:1850`）——MF-D4
grep -c "__pixR19Hidden" pix/scripts/ui-shot.mjs                 # >= 2（相位 1 隐藏采样器：写入 1 + 读取 1）
grep -c "layerHidden" pix/scripts/ui-shot.mjs                    # >= 2（相位 2 前置读数 + 硬断言）

# ⑤ 既有面零改写（MF-D6：不设合计等式，改为「按 hunk 旧行号区间逐块归类」）
#    5 个登记区间（均为改前行号）：`137-139` / `149-227` / `438-1320`（搬出块 965 行）· `5697-5756`（位移块 60 行）· `1838-1851`（旧 `selectPageSpan` 体 14 行）
#    判据：每个 hunk 按头部 `@@ -a,b +c,d @@` 算出旧行号区间，区间内的 `-` 行必须整体属于上述 5 块之一；出现区间外的 `-` 行即停线
git diff -U0 -- pix/scripts/ui-shot.mjs | grep -cE "^-[^-]"      # 只作读数登记（预期量级 ≈ 965 + 60 + 14；hunk 合并会使该值与合计不等 ⇒ 不作判据）
git diff -U0 -- pix/scripts/smoke-notes.mjs | grep -cE "^-[^-]"  # 0（纯追加）
git diff -U0 -- pix/scripts/smoke-view.mjs | grep -cE "^-[^-]"   # 0（零改动）
grep -c "big-book\|doc-01" pix/scripts/ui-shot.mjs               # 0（夹具零交叉）

# ⑦ 探针复位纪律与字面（MF-D1，命令级走查）
grep -c "reader-state.json" pix/scripts/perf-probe.mjs           # >= 1（复位删除的路径常量）
grep -c "PERF_STATE_FILE" pix/scripts/perf-probe.mjs             # >= 2（常量定义 + `resetToWorkspace()` 内删除）
grep -c "rmSync" pix/scripts/perf-probe.mjs                      # >= 2（复位删除 + 收尾删根）

# ⑥ 阈值与恒等
grep -c "LIMIT_OPEN_BIGDOC_MS\|LIMIT_STALL_MS\|LIMIT_SEARCH_COLD_MS" pix/scripts/perf-probe.mjs   # >= 3
grep -c "TOLERANCE_MEDIAN\|TOLERANCE_MAX" pix/scripts/perf-probe.mjs                             # >= 2
grep -c "  check(" pix/scripts/smoke-notes.mjs                   # 74
grep -c "  check(" pix/scripts/smoke-view.mjs                    # 74
```

---

## 2. 与既有冻结面的关系

### 2.1 本轮不得改动的既有冻结面（零改动清单）

| 来源 | 冻结内容（本轮零改动） |
| --- | --- |
| R14 / R16 / R17 / R18 | **`ui-shot.mjs` 的既有面**：`SEL` 既有 **74** 项（`:47-131`）逐字不动（唯一允许的改动 = 末尾追加 1 项）；既有场景函数体（`runScenario` `:1347-…`、`runReaderStateScenarios` `:1660-12326`）不改（唯一例外 = `:12325` 与 `:12326` 之间插入 `r19-1`）；既有 186 张截图名与像素内容、既有 264 条 `record` 数据字段、既有 74 种 label 零改写；`record` 的「先落测量再抛错」（`:1678-1681`）；启动守卫 `assertOutRootSafe()`（`:12342-12359`）；产物自净（只删 `<OUT_ROOT>/shots`）；结束自检（`:12439-12458`） |
| R14 / R18 | **烟测面**：`smoke-notes.mjs` 既有 10 组 71 条（`runUndoRoundtrip` … `runReaderStateStore`）、`files` / `required` / `allowed` / 编译选项 / 自清理协议；`smoke-view.mjs` 9 组 74 条（本轮零改动）；`npm run check` 的三段 tsc/vue-tsc 口径 |
| R13 | **报告格式**：`renderDocumentReport`（`src/main/notes-store.ts:347-362`）的标题行、meta 行字段顺序与逐字文案、`reportBlocks`（`:313-344`）的排序三键（`sortReportEntries` `:300-302`）、`## 章节（N 条）` / `### 第 N 页` 层级、`---` 分隔、尾换行 |
| R10 / R14 | **笔记数据面与派生**：`notes.json` 格式（`version: 1`、`isReaderNote` 白名单、id 唯一性、`MAX_NOTE_TEXT_LENGTH = 4000`）、原子写、`.pix-read/notes.md` 与 `reports/**` 路径规则；`countNotesByDocument` / `countNotesByPage` / `groupNotesByDocument` / `countNotesByChapter` 的语义与结果 |
| R6 / R18 | **`reader-state.json` 与现场记录**：格式、四键语义、R18 两键与成对不变量、主进程唯一写者与原子写 |
| 全局 | 既有类名与文案（`.notes-*` / `.pdf-*` / `.map-*` / `.pill-*` / `.reader-*` / `.tree-row` / `.row-notes` / `.map-row` / `.note-row` / `.note-count-badge`）、`--pix-*` 变量表（不新增）、`pix/src/main/{ipc-handlers,preload}.ts`、`pix/package.json`、`package-lock.json`、`pix/build/**`、`packages/**`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/resources/**`、`README.md`、`.gitignore` |
| 反需求 | R19-req §7 全表（不做虚拟滚动库 / 不做 Worker 迁移 / 不做磁盘缓存 / 不做重构 / 不改依赖 / 不做无判据优化 / 不改冻结字面 / 不降断言强度 / 不把大夹具塞进既有取证 / 不做跨轮基线存储 / 不动产品 UI / 不做死代码） |

### 2.2 本轮对既有面的显式改动（逐字：文件 / 位置 / 旧值 / 新值 / 理由）

| # | 文件 : 位置 | 旧值 | 新值 | 理由 |
| --- | --- | --- | --- | --- |
| 1 | `ui-shot.mjs:131`（`SEL` 收口前） | （无） | 追加 `readerStage: ".reader-stage",`（74 → 75） | N108：r19-1 的注入段需要断言目标在 `.reader-stage` 子树内 |
| 2 | `ui-shot.mjs:1838-1851`（`selectPageSpan` 定义体） | 「裸 `waitFor("第 N 页文本层")` → 6 行 DOM 段 → 裸 `waitFor("摘录浮层")`」 | §1.5.3 的守卫实现（静默前置 + 3 次尝试 + 就绪谓词 (a)(b)(c) + deadline 内硬失败）；**6 行 DOM 段逐字保留** | N108-1 / N108-3（flake 销账；失败不降级） |
| 3 | `ui-shot.mjs:5697-5756`（三处 helper 定义 + 前置注释头，60 行） | 位于闭包末段 | **原样搬**到 `selectPageSpan` 之前（函数体逐字；仅 `waitStageScrollQuiet` 的 docstring 第 2 行改写为新语义） | TDZ：`:2060` / `:4077` 的调用早于原定义位置 |
| 4 | `ui-shot.mjs:12325` 与 `:12326` 之间 | （无） | 新增 `r19-1`（2 条 record / 1 张截图 / `R19_GUARD_INJECT_DELTA` 的注入段） | N108-2：注入式复现 |
| 5 | `ui-shot.mjs:137-139` / `:149-227` | `escapePdfText` / `buildPdf` 定义 | 删除定义，改为 `import { escapePdfText, buildPdf } from "./lib/pdf-fixture.mjs";` | N104-3：共享生成引擎 |
| 6 | `ui-shot.mjs:438-1320` | `buildStub()`（内含 `LIBRARY_TREE` / `LIBRARY_TREE_B` / `libraryList` 三处树声明） | 改为 `import { buildStub } from "./lib/stub-preload.mjs";` + 模块作用域重建 `LIBRARY_TREE` / `LIBRARY_TREE_B` + `main()` 内 `buildStub({...config, tree, treeB, archiveDir, archiveChildren})` | N104-3：stub 构建器共用（模板差异仅 5 处，§1.2.3） |
| 7 | `smoke-notes.mjs`（`runReaderStateStore` 之后、`main()` `:1610` 之后） | （无） | 新增 `runPerfReportExport()`（3 条）与 `main()` 内一行调用（追加在 `runReaderStateStore();` `:1610` 之后） | N105-6：⑥ 的判据落在主进程数据面 |
| 8 | `docs/pm/R19-design.md` | （无） | 本档 | — |

**允许的内容变化（非 diff，登记）**：① `ui-shot.mjs` 的模块作用域新增 `LIBRARY_TREE` / `LIBRARY_TREE_B`（值等价，绝对路径由 `LIBRARY_DIR` / `LIBRARY_B_DIR` 拼出）；② 新增 1 张截图 / 2 条测量 / 1 种 label；③ `stub-preload.cjs` 的 5 处模板差异（§1.2.3）；④ `r19-1` 相位内出现摘录浮层、选区与一次注入的阅读区滚动（`scrollTop` 增量 160）；⑤ **零改动登记**：§1.5.4 的 4 处残余裸等待（`:1465` / `:1512` / `:1540` / `:9552`）与其所在相位（`runScenario` / `selectionOnPageOne`）**不进本轮 diff**（仅登记与命中上报）。

### 2.3 N108 对既有 helper 调用点的影响（逐条列出 + 断言强度不变论证）

`selectPageSpan` 的**签名与返回面不变**（旧：`Promise<void>`；新：`Promise<{ attempts, quiet, trail }>`——多出的返回值只被 `r19-1` 消费，既有调用点忽略返回值 ⇒ 调用点零改写）。以下 21 处调用点**全部零改写**，逐条论证：

| # | 调用点 | 相位语境 | 断言强度论证 |
| --- | --- | --- | --- |
| 1 | `:2060` | 早于 `selectPageSpan` 定义处的既有相位 | 失败从「裸 20s 超时抛错」变为「≤20s deadline 内 3 次尝试后抛错」⇒ **仍是硬失败**；就绪条件 = 旧 (a) **加** (b)(c) ⇒ 只增；静默前置只延迟动作时刻 |
| 2 | `:4077` | 同上 | 同上 |
| 3 | `:5518`（`excerptFirstSpan` 内） | 摘录入库前置 | 同上；下游 `readNotes().length + 1` 的等待逻辑零改动 |
| 4 | `:5629`（`ensureQuickAskExcerptReady` 重取路径内） | 修复轮.5 前置 | 重取调用现在也走守卫（多一层静默 + 就绪）；`ensureQuickAskExcerptReady` 自身的 3 次尝试与返回 `ok:false` 语义零改动 |
| 5 | `:6893` | 既有选区相位 | 同 #1 |
| 6 | `:7005`（r11-3 相位 4，前一行 `focusPage(2)`） | **S-SD-02 的最近命中点**（`R18-review.md:476` 的 `:7005`） | 该处正是守卫的收益点：迟到滚动被首轮静默吸收 ⇒ 由「整轮中断」变为「正常通过」；就绪条件只增；若仍不可满足 ⇒ 硬失败，与今日同 |
| 7 | `:7102` | 既有相位 | 同 #1 |
| 8 | `:7113` | 既有相位（真实 DOM 选区变更） | 同 #1；其后的 `selectionchange` 派发不受守卫影响 |
| 9–17 | `:10927`、`:10969`、`:11044`、`:11059`、`:11097`、`:11112`、`:11152`、`:11202`、`:11264` | R17 的选区快照 / 模板动作相位 | 同 #1；这些相位随后都调用 `ensureQuickAskExcerptReady`（`:10928` 等），其判据与断言零改动 |
| 18 | `:11330`（前置静默在 `:11329`） | r17-3 选区快照 | 显式静默保留 ⇒ 守卫内再加一次静默（幂等：静默窗口无事件时 ~0.46s）；断言零改动 |
| 19–21 | `:11463`、`:11491`、`:11570`（前置静默分别在 `:11462` / `:11490` / `:11569`） | r17 后续相位 | 同 #18 |

**结论**：21 处调用点零改写；断言强度在每处都是「只增不减」（失败仍是硬失败；就绪条件 (a) 逐字保留 + (b)(c) 追加；静默前置只把动作推迟到无最近滚动的窗口）。**唯一登记的强度变化**：逐页文字层的累计等待由 20s 降为 ≤12s（3 × 4000ms，见 §1.5.3 与 §6 次级风险 1）。

### 2.4 零 diff 判据命令

```bash
cd E:/develop/PiX-Read

# ① 产品侧零 diff（条件性白名单内文件未使用时报文为空）
git diff --stat -- pix/src/renderer/components/workspace/NotesPanel.vue pix/src/renderer/components/workspace/PdfViewer.vue \
  pix/src/renderer/components/workspace/KnowledgeMap.vue pix/src/renderer/stores/notes-store.ts \
  pix/src/renderer/utils/notes-view.ts pix/src/renderer/utils/notes-path.ts pix/src/renderer/utils/outline-notes.ts pix/src/main/notes-store.ts
# ② 边界文件零 diff
git diff --stat -- pix/package.json package-lock.json packages pix/build pix/tsconfig.json pix/tsconfig.main.json pix/tsconfig.preload.json pix/vite.config.ts pix/resources README.md .gitignore
# ③ 既有字面零改写（下三条都必须是「无输出」）
git diff -U0 -- pix/scripts/ui-shot.mjs | grep -E "^[+-].*(data-tab=|quick-ask-btn|notes-group-head|row-notes|map-toggle|page-label)" ; echo "LITERAL_EXIT=$?"
git diff -U0 -- pix/scripts/ui-shot.mjs | grep -E "^[+-].*const (js|waitFor|sleep|record|textOf|has|countOf) =" ; echo "HELPER_EXIT=$?"
git diff -U0 -- pix/scripts/ui-shot.mjs | grep -E "^[+-].*readerStage"   # 期望恰 1 行（`+  readerStage: ".reader-stage",`）
# ④ 既有 186 张与既有 label 零缺失见 §5.4
```

---

## 3. 失败路径表（夹具生成失败 / 测量超时 / 环境抖动 / 阈值越界）

| # | 失败情形 | 症状 | 首个变红的判据 | 期望行为（冻结） |
| --- | --- | --- | --- | --- |
| 1 | 夹具生成失败（磁盘满 / 权限 / `buildPdf` 抛错） | 未起 vite 即中止 | 脚本 stdout 的原样错误 + 退出码 | 退出码 **1**；`finally` 删根；仓库零残留（`git status --short` 不变） |
| 2 | 夹具规模不符（页数 / 节点 / 笔记数写错） | 规模不变量在终点处判红 | `[perf] JSON.fixture` 六键断言（N104-2 判据 1） | `pages=304` / `outlineNodes=330` / `notesTotal=520` / `notesBigBook=480` / `docs=41` / `0 < pdfBytes < 5MiB`；不符 ⇒ 该次运行的 `summary.fail` ≥ 1、退出码（`--assert`）1 |
| 3 | 搜索用词算术不符（命中数 / 首命中页错） | `search.hits` / `search.firsthit.page` 判红 | #24 / #25 | 命中 `10`、首命中页 `121`；不符 ⇒ 硬红，登记并排查夹具正文公式 |
| 4 | 测量超时（单项） | 某指标 `value: null` | 该条 `verdict: "fail"` + `data.timeout: true` | 不记 0；该轮继续采其余指标；`summary.fail ≥ 1`；`--assert` 下退出码 1 |
| 5 | 心跳不足（tick < 2） | `stall.max.ms` 无意义 | #6 / #9 / #15 | 该条判 fail（不得记 0/缺失）；错误文案含 tick 计数 |
| 6 | 总预算耗尽（> 240s） | 采样中途停止 | `failures[]` 的 `{ id: "budget" }` | 已采指标照常输出；`ok: false`；退出码 **1**；dev 档登记超出项与其单项超时读数 |
| 7 | 环境抖动（同机噪声 / 忙机器） | 相对指标越界或两次连跑判定翻转 | N106-2 判据 1（两次连跑比值 ≤ 1.5）+ §1.4 的当轮负载读数 | 比值 > 1.5 ⇒ 该条容差判为不足 ⇒ **登记 + 申请改判**（走 §0.0#5 流程），**不得静默放宽**；**负载红轮**（当轮存在外部重负载进程）⇒ 不判回退，在**同代码同命令**下于空闲时段复跑取绿轮（§1.4 抖动纪律） |
| 8 | 阈值越界（真实回退） | `[perf] FAIL <id>` | 该条 `verdict: "fail"`、`summary.fail ≥ 1` | `--assert` ⇒ 退出码 1 + 超标行逐字；report 模式 ⇒ 只打印、退出码 0（默认模式语义不得被打破） |
| 9 | 基线缺失 / 不可解析 / `--assert` 未带 `--baseline` | 用法错误 | 退出码 | 退出码 **2**；不得降级为「全 skip 通过」 |
| 10 | 根目录 / 基线路径落在仓库内 | 安全守卫拒绝 | 退出码 | 退出码 **2**；仓库零新增文件；不建目录 |
| 11 | 端口 5200 被占用（`strictPort`） | vite 启动失败 | 退出码 | 退出码 **2**；`finally` 必须删除已建的 `PIX_PERF_ROOT`（§1.1.3 第 5 步）；提示「端口占用，请串行运行」 |
| 12 | 夹具残留（异常路径未删根） | `%TEMP%/pix-v06-r19-perf` 仍在 | N104-5 判据 1 / 2 | `finally` 内删除；不得只删 `library` 子目录（整根删） |
| 13 | ④ 的复位不干净（`rowsBefore !== 0` 或行数 ≠ 520 / 41）或复位后页码不是 `第 1 / 304 页`（阅读现场未删 / 删除时点晚于挂载） | 「量到了上一份状态」 | #10 的硬断言 + #18 / #19；②③⑤ 的 `data.resetPages` / `data.resetPage` | 判红；**不得**把 `rowsBefore` / `resetPage` 从断言里去掉；修复方向 = §1.3.0 的复位纪律（删阅读现场必须先于挂载） |
| 14 | ③ 的冷/暖口径被静默混淆（同值重写 / 面板未重建） | 冷读数退化到暖量级 | #7 / #8 的 `data` 证据（`panelAbsentBeforeOpen` / `warmSteps` / `query`） | 判红；**不得**只比对数值（必须在 `data` 里留证据链） |
| 15 | ④ 键入不可判别（查询词全命中 ⇒ 终点在按键前成立） | 键入读数 ≈ 0 | #11 的防空断言（逐键计数 + 至少一键变化 + 末键 < 首键） | 判红；查询词逐字 `Conclusion 13`（不得回退到 `fixtur`） |
| 16 | ⑤ 滚动为空断言（`.map-tree` 不可滚动） | `scrollTargetPx === 0` | #14 的 `data.scrollTargetPx` 断言（> 0） | 判红并登记（330 行在既有窗口下必须可滚动） |
| 17 | ⑥ 的报告规模不符（章节数 / 每条 16 条） | #26 / #27 判红 | 【烟测-主进程】`perf-report-export` #2 / #3 | 判红；格式与分组规则不得改（反需求 7） |
| 18 | `r19-1` 注入被钳制（余量不足 / 目标不在 stage 子树内） | `scrollTopDelta !== 160` 或 `stageContainsScroll === false` | `r19-1` 相位 1 判据 ② / ③ | 判红（不得静默通过）；先修前置（`waitPage(1, 3)` 已保证可滚动余量） |
| 19 | `r19-1` 相位 2 未抛错（守卫被降级为 `ok:false`） | `threw === false` | 相位 2 判据 ① | 判红；守卫内**不得**出现 `catch`、不得返回 `ok:false` |
| 20 | 守卫强化导致既有相位新增红（就绪谓词 (c) 严格于旧判据） | 某既有相位在 `选择前置失败` 处中断 | 既有断言面（该相位的 record 未落） | 登记式处置：dev 档给出该相位现场读数与理由；**允许**把 (c) 降级为「选区非空」，**不得**移除 (a)(b)、不得跳过相位（req §9 次级风险 2） |
| 21 | ui-shot 单轮时长顶穿 +10% | `time(after)/time(base) > 1.10` | N109-3 判据 1 | 按 §6 R2 的归因预案逐项登记（21 处静默前置 ≥ ≈9.7s + `r19-1` ≈ 14.5s）；**不得**靠删断言 / 缩短就绪超时换绿；超线由评审裁定 |
| 22 | 复位后页码不是第 1 页（阅读现场残留 / 删除时点晚于挂载） | `.page-label` ≠ `第 1 / 304 页` | ② 的 `data.resetPages`（硬断言）、③ / ⑤ 的 `data.resetPage` | 判红；修复位 = §1.3.0（删 `PERF_STATE_FILE` 必须在点项目卡片之前）；**不得**靠放宽终点换绿（MF-D1） |
| 23 | 相位 1 的可见前置失效（调守卫前浮层不可见） | 「隐藏 → 恢复」缺第一环 | 相位 1 判据 ①（`stateBefore.display !== "none"`） | 判红；**不得**删该前置或改判「不经可见前置也算复现」（MF-D3） |
| 24 | 相位 2 的前置未收起（调守卫前浮层仍可见） | 判据「抛错后不可见」不可满足（MF-D2 的原阻塞形态） | 相位 2 判据 ①（`precondition.layerHidden === true`） | 判红；**不得**把判据改成弱化形式（如「与相位 1 末态相比未变得更可见」） |
| 25 | §1.5.4 的 4 处残余裸等待命中（`runScenario` 06/07 段或 `selectionOnPageOne`） | `MANIFEST.failure` 文案含 `摘录浮层复现` / `摘录浮层重现` / `摘录浮层（选择链路）` / `摘录浮层` 且中断点不在 `selectPageSpan` | 该次运行的 `MANIFEST.json.failure` | 原样登记 + **上报负责人**（§9#7）；**不得**自行扩权改既有相位，也不得记为 S-SD-02 已销账 |

---

## 4. 文件级清单（动作 + 具体改动点 + 不变量）

| # | 文件 | 动作 | 需求 | 具体改动点（不得越界） | 不变量 |
| --- | --- | --- | --- | --- | --- |
| 1 | `pix/scripts/lib/pdf-fixture.mjs` | 新建 | N104-3 | 从 `ui-shot.mjs:137-139` 与 `:149-227` 逐字搬移 `escapePdfText` / `buildPdf` 并 `export`（**79 + 3 = 82 行**，登记） | 不新增调用者；不改 `buildPdf` 的对象编号 / 字节布局（既有调用点逐字不变） |
| 2 | `pix/scripts/lib/stub-preload.mjs` | 新建 | N104-3 | 从 `ui-shot.mjs:438-1320` 搬移 `buildStub(config)`（**883 行**，登记）；模板差异仅 §1.2.3 的 5 处 | 既有 API 面方法数、`__pixStub` 控制口名、类名与错误文案逐字不变 |
| 3 | `pix/scripts/perf-probe.mjs` | 新建 | N104-1…N104-5 / N105-1…N105-5、N105-7 / N106-1…N106-3 / N107-3 | 大夹具声明表与生成、窗口与 vite 引导（5200）、24 条指标的测量与判定、基线读写、stdout 输出与三态退出码、自清理与安全守卫；`writeFileSync` 恰 1 处（`--save-baseline`） | 不新增 npm script；不写仓库；不引入依赖；不 import `ui-shot.mjs` |
| 4 | `pix/scripts/ui-shot.mjs` | 修改 | N104-3 / N108-1…N108-4 / N109-1 | ① 顶层 import 两个共享模块 + 模块作用域重建 `LIBRARY_TREE` / `LIBRARY_TREE_B` + `main()` 的 `buildStub(config)` 调用；② `SEL` 追加 1 项（74 → 75）；③ §1.5.2 的三处 helper 纯位移（登记：`:5697-5756` 共 **60 行**，含前置注释头与空行分隔）；④ `selectPageSpan` 守卫化（`:1838-1851` 的 **14 行**被替换为 `waitSelectionReady` + 守卫实现，净新增块由 dev 档登记）；⑤ 新增 `r19-1`（2 record / 1 截图 / 1 常量 + 相位 1 的可见前置与隐藏采样器 + 相位 2 的收起前置） | 既有 74 个 `SEL` 键、既有场景函数体（**§1.5.4 的 4 处残余裸等待零改动**）、既有 helper 语义、既有截图与 label、启动守卫与结束自检；搬出 965 行（`:137-139` 3 + `:149-227` 79 + `:438-1320` 883） |
| 5 | `pix/scripts/smoke-notes.mjs` | 修改 | N105-6 / N109-2 | 新增 `runPerfReportExport()`（组 `perf-report-export`，3 条断言）+ `main()` 内一行调用（追加在 `:1610` 之后）；新增常量 `PERF_*`（§0.3） | 既有 10 组 71 条、`files` / `required` / `allowed` / 编译选项 / 自清理协议 / `main()` 既有调用顺序 |
| 6 | `docs/pm/R19-design.md` | 新建 | — | 本档 | — |
| 7 | `docs/pm/R19-req.md` / `docs/pm/R19-review.md` | 已存在（本步不改） | — | — | 冻结契约不改写 |
| 8 | `docs/pm/R19-dev.md` | 新建（dev 步） | N107-1…N107-4 / N109 / §8 | 改动清单 / 原样输出 / 逐条自评 / 偏差表 / 未验证事项 / 热点结论 / **改前改后读数对照表** | — |

**改动量登记（不套用 80 行上限，MF-10）**：`ui-shot.mjs` 搬出 **965** 行（`:137-139` 3 + `:149-227` 79 + `:438-1320` 883）；位移块 **60** 行（`:5697-5756`）；守卫净新增 ≈ 60 行（`waitSelectionReady` + 守卫）；`r19-1` 净新增 ≈ 90 行（含相位 1 的可见前置与 16ms 隐藏采样器、相位 2 的收起前置）；`smoke-notes.mjs` 净新增 ≈ 80 行；`perf-probe.mjs` / 两个 lib 模块为新建（行数由 dev 档登记）。**条件性白名单内的产品文件单文件 ≤ 80 行**（N107-2 判据 1）。

**不改（登记为不动）**：`pix/package.json`、`package-lock.json`、`pix/build/**`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/src/main/{ipc-handlers,preload,session-bridge,pix-paths}.ts`、`pix/src/renderer/stores/{reader-store,reader-state-store,project-store,session-store,settings-store,auth-store}.ts`、`pix/src/renderer/utils/{reading-context,page-anchor,session-title,shortcut-help,quick-ask-templates,markdown,image-capture,note-capture}.ts`、`pix/src/renderer/pages/WorkspacePage.vue`、`pix/src/renderer/components/workspace/{ReaderPanel,PdfSearchPanel,LibraryPanel,ChatPanel,PdfSelectionQuickAsk,ShortcutOverview}.vue`、`pix/src/renderer/assets/styles/**`、`pix/scripts/{smoke-view,assert-main-esm,dev-electron}.mjs`、`pix/resources/**`。

**条件性白名单（8 个，仅在实测热点落在该文件时才可改；每处使用必须附「fail 指标 id + 改前/改后读数」）**：`NotesPanel.vue` / `PdfViewer.vue` / `KnowledgeMap.vue` / `stores/notes-store.ts` / `utils/notes-view.ts` / `utils/notes-path.ts` / `utils/outline-notes.ts` / `src/main/notes-store.ts`（允许的手段限于 memo / 索引化 / 减少重复计算 / 按需渲染——逐文件细则见 R19-req §8.2）。

**按指标的手段边界（MF-D8，写死）**：④ / ⑪ 的可用手段 = **memo / 减少重复计算**（可选的 `content-visibility: auto` 一类**不改 DOM 计数**的手段须单独登记）；`NotesPanel.vue` 的 **DOM 行数（`.note-row` = 520、`.notes-group-head` = 41）与行序是不可压缩的终点点**——④ 的测量时刻面板处于 `display: none`，任何「只构建可见部分」的实现都会让终点永不成立 ⇒ **按需渲染对 ④ 事实上不可用**，本轮不得作为 ④ 的手段；⑤ 的 `KnowledgeMap.vue` 限于 memo / 索引化（DOM 行数 330 / 320 同样不可压缩）。

**白名单外热点的处置**：③ 的 `PdfSearchPanel.vue`、⑦ 的 `LibraryPanel.vue` 与其余「不改」清单内文件 ⇒ 按 N107-1 判据 4 **登记为阻塞 + 上报负责人**，不得自行扩权。

**范围外（任何情况下不动）**：`packages/**`、`docs/pm/**` 的历史档件（R6–R18）、`.gitignore`、`README.md`、`.pix-read/notes.json` 与其写入链。

**候选热点（待实测判定，不预先承诺修复）**（行号为本步实读）：C1 `NotesPanel.vue:814-817`（`v-for` 全量 520 行）+ `stores/notes-store.ts:155-161`（`groups` 每次视图变化重算）⇒ ④；C2 `stores/notes-store.ts:168-173`（`currentDocNoteCount` 第二次分组）⇒ ④；C3 `PdfViewer.vue:197-209`（304 页串行 `getPage`）⇒ ①；C4 `PdfViewer.vue:833-841`（`anchorExcerpts` 每次重画全量 filter + sort，480 条）⇒ ②；C5 `KnowledgeMap.vue:53-55`（展开态变化整表重建 330 行）⇒ ⑤；C6 `utils/notes-view.ts:55-59`（每键全量 filter + sort）⇒ ④。**纪律**：一次只落一条手段；每条必须绑定 fail 指标 id 与改前/改后读数（N107-3）；无 fail 指标 ⇒ 不修（登记「实测未见热点」）。

---

## 5. 验证方案

### 5.1 命令（按执行顺序）

```bash
cd E:/develop/PiX-Read/pix
export PATH="/c/Program Files/nodejs:$PATH"

# 步骤 0：动工前 —— 唯一工程门（本步已实跑：CHECK_EXIT=0）
npm run check

# 步骤 0b：交叉核对零缺失比对基线（R18 交付目录，只读）
node -e "const fs=require('fs');const d='C:/Users/86157/AppData/Local/Temp/pix-v06-r18c-review/shots';const m=JSON.parse(fs.readFileSync(d+'/MANIFEST.json','utf8'));const me=JSON.parse(fs.readFileSync(d+'/MEASUREMENTS.json','utf8'));console.log(JSON.stringify({shots:m.shots.length,failure:m.failure,measurements:me.length,labels:new Set(me.map(x=>x.label)).size,png:fs.readdirSync(d).filter(f=>f.endsWith('.png')).length}))"
# ⇒ 必须逐字得到 {"shots":186,"failure":null,"measurements":264,"labels":74,"png":186}

# 步骤 0c：抽取差异的「改前」取样（改造 ui-shot 之前，**同一 PIX_SHOT_ROOT**）
mkdir -p /c/Users/86157/AppData/Local/Temp/r19-pre
PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v06-r19-stubsha" ./node_modules/.bin/electron scripts/ui-shot.mjs ; echo "PRE_EXIT=$?"
cp "C:/Users/86157/AppData/Local/Temp/pix-v06-r19-stubsha/stub-preload.cjs" /c/Users/86157/AppData/Local/Temp/r19-pre/stub-preload.cjs

# 步骤 0d：动工前自建基线（读数即本轮唯一基线；同时 `time` 记 wall-clock）
time PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v06-r19-base" ./node_modules/.bin/electron scripts/ui-shot.mjs ; echo "BASE_EXIT=$?"
# ⇒ 期望 BASE_EXIT=0、186 张 / 264 条 / 74 种 label、failure === null

# 步骤 1：A 面落地（共享模块 + 探针 + 烟测）后的工程门与烟测
npm run check && node scripts/smoke-notes.mjs      # ⇒ 通过 74 / 失败 0（连跑两次）
node scripts/smoke-view.mjs                        # ⇒ 通过 74 / 失败 0（零改动回归）

# 步骤 2：性能面（命令 1 / 命令 2 / 命令 3；基线落在仓库外）
./node_modules/.bin/electron scripts/perf-probe.mjs --save-baseline "C:/Users/86157/AppData/Local/Temp/pix-v06-r19-perf-base.json" ; echo "P1_EXIT=$?"
./node_modules/.bin/electron scripts/perf-probe.mjs --baseline "C:/Users/86157/AppData/Local/Temp/pix-v06-r19-perf-base.json" --assert ; echo "P2_EXIT=$?"
./node_modules/.bin/electron scripts/perf-probe.mjs ; echo "P3_EXIT=$?"

# 步骤 3：B 面落地（ui-shot 抽取 + 守卫 + r19-1）后的工程门
npm run check

# 步骤 4：离屏验收（不同目录；同时 `time` 记 wall-clock）
time PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v06-r19-after" ./node_modules/.bin/electron scripts/ui-shot.mjs ; echo "AFTER_EXIT=$?"
# ⇒ 期望 AFTER_EXIT=0、187 张 / 266 条 / 75 种 label、failure === null、r19-1 两条 record 全绿

# 步骤 5：抽取差异的「改后」取样（与步骤 0c 同一根）
rm -rf "C:/Users/86157/AppData/Local/Temp/pix-v06-r19-stubsha"
PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v06-r19-stubsha" ./node_modules/.bin/electron scripts/ui-shot.mjs ; echo "POST_EXIT=$?"
diff /c/Users/86157/AppData/Local/Temp/r19-pre/stub-preload.cjs "C:/Users/86157/AppData/Local/Temp/pix-v06-r19-stubsha/stub-preload.cjs" | tee /c/Users/86157/AppData/Local/Temp/r19-pre/stub.diff
# ⇒ 每一行必须归入 §1.2.3 的 5 类；dev 档原样贴出并逐行标注

# 步骤 6：零缺失 / 干净纪律（§5.4 / §5.5）
```

### 5.2 烟测-主进程：`pix/scripts/smoke-notes.mjs` 新增组 `perf-report-export`（3 条逐字）

**落地位置**：新函数 `runPerfReportExport()`（建议紧随 `runReaderStateStore` 之后定义），`main()` 内在 `runReaderStateStore();`（`:1610`）之后追加一行 `runPerfReportExport();`。

**夹具（组内自建，确定性）**：

```js
const G = "perf-report-export";
libraryRoot.setLibraryRoot(WS_A);
const PERF_BIG_DOC = join(WS_A, "big-book.pdf");
const PERF_REPORT = join(REPORTS_A, "big-book.pdf.md");
const PERF_CHAPTERS = Array.from({ length: 30 }, (_, k) => {
  const nn = String(k + 1).padStart(2, "0");
  return { title: `Chapter ${nn}`, start: 1 + k * 10, end: 10 * (k + 1), label: nn };
});
const perfNotes = [];
let index = 0;
for (let k = 1; k <= 30; k += 1) {
  for (let j = 1; j <= 16; j += 1) {
    const page = 1 + 10 * (k - 1) + Math.floor((j - 1) / 2);
    const kind = j % 2 === 0 ? "answer" : "excerpt";
    const word = kind === "answer" ? "Conclusion" : "Excerpt";
    const stamp = 1758000000000 + 60000 * index;
    perfNotes.push({ id: `perf-${String(index + 1).padStart(3, "0")}`, kind, docPath: "big-book.pdf", page, text: `${word} ${k}.${j} for the scale fixture`, comment: "", createdAt: stamp, updatedAt: stamp });
    index += 1;
  }
}
rmSync(NOTES_A, { force: true });
rmSync(PERF_REPORT, { force: true });
mkdirSync(PIX_READ_A, { recursive: true });
writeFileSync(NOTES_A, serialize(perfNotes), "utf8");
```

**三条断言**：

| # | desc | 判据（失败即红） |
| --- | --- | --- |
| 1 | 「480 条 + 30 章 + 304 页进度 ⇒ `success === true` 且三次导出耗时中位数 ≤ 2000ms」 | 先跑一次丢弃（预热），再连跑 3 次：`const samples = []; for (let i = 0; i < 3; i += 1) { const t0 = performance.now(); const r = notesStore.exportDocumentReport({ docFilePath: PERF_BIG_DOC, chapters: PERF_CHAPTERS, progress: { page: 1, pageCount: 304 } }); samples.push(performance.now() - t0); if (!r.success) … }`；`median = samples.slice().sort((a,b)=>a-b)[1]`；`median <= 2000`；`last.success === true`、`last.count === 480`；`actual` 打印 `{ samples, median }` |
| 2 | 「报告头逐字含进度与两类计数」 | `normalizeStamp(readFileSync(PERF_REPORT, "utf8")).includes("阅读进度：第 1 / 304 页；共 480 条（摘录 240 · AI 结论 240）。")`；`STAMP_RE` 命中恰 1 次（沿用既有常量与 `normalizeStamp`） |
| 3 | 「30 个章节块，每块 `（16 条）`」 | `const lines = normalizeStamp(readFileSync(PERF_REPORT, "utf8")).split("\n"); const heads = lines.filter((l) => l.startsWith("## "));` 判据：`heads.length === 30 && heads.every((h) => h.startsWith("## Chapter ") && h.includes("（16 条）"))`；`actual` 原样登记 `{ heads0: heads[0], heads29: heads[29], count: heads.length }`（逐字期望例：`## Chapter 01 · 第 01 页（16 条）`；`heads[0]` / `heads[29]` 的逐字值由 dev 档原样登记，形态不符即判红） |

**自净**：组末 `rmSync(NOTES_A, { force: true })`、`rmSync(PERF_REPORT, { force: true })`（与既有组的自净同款；本组是 `main()` 的最后一组）。

**证据边界登记（MF-09 的执行面升级）**：本组用**真实主进程模块**（`main/notes-store.js`）读取 480 条同形状夹具 ⇒ 主进程读侧对该字段形状的接受是**执行证据**；离屏侧的 520 条夹具与该 480 条**形状同源**（同一组字段与取值域；40 条小文档笔记仅差 `docPath` / 正文），该同源关系由 dev 档的字段对照表登记。

**验收**：`node scripts/smoke-notes.mjs` ⇒ 退出码 0、末行逐字 `通过 74 / 失败 0`；连续两次结果相同；既有 10 组 71 条零改写（`git diff -U0` 无 `-` 行）。

### 5.3 烟测-渲染：`pix/scripts/smoke-view.mjs`（9 组 74 条，零改动）

本轮不新建渲染层纯函数 ⇒ 该脚本零改动，只作回归（`node scripts/smoke-view.mjs` ⇒ 退出码 0、末行逐字 `通过 74 / 失败 0`；`grep -c "  check("` 保持 **74**）。

### 5.4 基线与零缺失比对（基线 = `C:/Users/86157/AppData/Local/Temp/pix-v06-r18c-review`）

```bash
cd E:/develop/PiX-Read/pix

# ① 截图集合零缺失 + 新增张数 + failure（基线 186 → 验收 187）
node -e "const fs=require('fs');const b='C:/Users/86157/AppData/Local/Temp/pix-v06-r18c-review/shots';const a='C:/Users/86157/AppData/Local/Temp/pix-v06-r19-after/shots';const bm=JSON.parse(fs.readFileSync(b+'/MANIFEST.json','utf8'));const am=JSON.parse(fs.readFileSync(a+'/MANIFEST.json','utf8'));const bn=bm.shots.map(s=>s.name);const an=am.shots.map(s=>s.name);console.log(JSON.stringify({base:bn.length,after:an.length,missing:bn.filter(n=>!an.includes(n)),r19:an.filter(n=>n.startsWith('r19-')).length,added:an.filter(n=>!bn.includes(n)).length,failure:am.failure}))"
# ⇒ base:186、after:187、missing:[]、r19:1、added:1、failure:null

# ② label 零缺失 + 新增 1 种 + 配额（基线 74 → 验收 75；264 → 266）
node -e "const fs=require('fs');const b='C:/Users/86157/AppData/Local/Temp/pix-v06-r18c-review/shots';const a='C:/Users/86157/AppData/Local/Temp/pix-v06-r19-after/shots';const cnt=(p)=>{const m=JSON.parse(fs.readFileSync(p+'/MEASUREMENTS.json','utf8'));const x={};for(const e of m)x[e.label]=(x[e.label]||0)+1;return x};const bc=cnt(b),ac=cnt(a);console.log(JSON.stringify({baseLabels:Object.keys(bc).length,afterLabels:Object.keys(ac).length,baseMeasurements:Object.values(bc).reduce((s,v)=>s+v,0),afterMeasurements:Object.values(ac).reduce((s,v)=>s+v,0),missing:Object.keys(bc).filter(k=>!ac[k]||ac[k]<bc[k]),r19:ac['r19-selection-guard']||0}))"
# ⇒ baseLabels:74、afterLabels:75、baseMeasurements:264、afterMeasurements:266、missing:[]、r19:2

# ③ 本轮基线目录（步骤 0d）与验收目录交叉核对：本轮基线的每个 label 条数不得减少
#    命令同 ②，把 b 换成 pix-v06-r19-base ⇒ 期望 missing: []

# ④ 产物目录白名单（脚本内已自检；此处人工复核）
ls "C:/Users/86157/AppData/Local/Temp/pix-v06-r19-after/shots" | grep -vE '\.png$|^(MANIFEST|MEASUREMENTS)\.json$' ; echo "STRAY_EXIT=$?"   # 无输出

# ⑤ r19-1 的两条现场读数（供 dev 档登记）
node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('C:/Users/86157/AppData/Local/Temp/pix-v06-r19-after/shots/MEASUREMENTS.json','utf8'));console.log(JSON.stringify(m.filter(e=>e.label==='r19-selection-guard'),null,2))"

# ⑥ 时长红线（步骤 0d 与步骤 4 的 time 读数）
#    ratio = afterWallClock / baseWallClock ≤ 1.10；超出按 §6 R2 归因
```

### 5.5 性能面命令与读数登记

```bash
cd E:/develop/PiX-Read/pix
# 命令 1（基线，只报告）与命令 2（断言）的 stdout 逐字留存到 dev 档（含 24 条 [perf] metric / [perf] data / [perf] verdict 行与末行 [perf] JSON）
./node_modules/.bin/electron scripts/perf-probe.mjs --save-baseline "C:/Users/86157/AppData/Local/Temp/pix-v06-r19-perf-base.json" | tee /c/Users/86157/AppData/Local/Temp/r19-pre/p1.txt
./node_modules/.bin/electron scripts/perf-probe.mjs --baseline "C:/Users/86157/AppData/Local/Temp/pix-v06-r19-perf-base.json" --assert | tee /c/Users/86157/AppData/Local/Temp/r19-pre/p2.txt
./node_modules/.bin/electron scripts/perf-probe.mjs | tee /c/Users/86157/AppData/Local/Temp/r19-pre/p3.txt
# 连跑两次（N106-2 判据 1）：两次 verdict 全同，且相对指标两次读数之比 ≤ 1.5
# 抖动纪律（§1.4，MF-D9）：登记当轮负载（重负载进程 / 空闲内存）；若出现红且当轮有外部重负载 ⇒ 空闲时段复跑一次取绿轮（**不得改阈值**）
# 离散度（§1.4）：`samples >= 30` 的指标登记 p95；K=3 的指标登记三个原始读数（均取自 `[perf] JSON` 的 `samples`）
# 零仓库写入：`git status --short` 在命令前后完全相同
# 自清理：`test -d "/c/Users/86157/AppData/Local/Temp/pix-v06-r19-perf"` ⇒ 不存在
```

**dev 档必须登记的字段对照表（MF-09 / N104-2 判据 3）**：`perf-probe.mjs` 生成条目的字段集（`id` / `kind` / `docPath` / `page` / `text` / `comment` / `createdAt` / `updatedAt`）↔ `isReaderNote`（`src/main/notes-store.ts:137-155`）的接受域逐项对照，并标注「该对照是走查、不是执行证据」；同时登记 §5.2 的执行级补充。

### 5.6 零残留与工程门

| # | 判据 |
| --- | --- |
| 1 | `cd pix && npm run check` ⇒ `CHECK_EXIT=0` |
| 2 | `git status --short` 只出现 §4 白名单内的文件（3 新建 + 2 改脚本 + 4 个 `docs/pm/R19-*.md`）+ 条件性白名单内实际使用到的产品文件；仓库内无临时脚本 / 探针 / 日志 |
| 3 | `git diff` 中 `package.json` / `package-lock.json` / `packages/**` / `pix/build/**` / `pix/tsconfig*.json` / `pix/vite.config.ts` / `pix/src/main/**`（条件性条目除外）/ `pix/src/renderer/**`（条件性条目除外）全为空 |
| 4 | 两次离屏**串行**执行；`ui-shot.mjs` 的结束自检继续生效（截图集合与清单双向相等 + 白名单外条目即失败）；`smoke-notes.mjs` 的 `rmSync(TMP)` 自净 |
| 5 | `%TEMP%` 侧：`pix-v06-r19-perf`（探针）运行后不存在；`pix-smoke-notes-*`（烟测）运行后不存在 |

---

## 6. 风险 Top3 与判定方式

### R1「量到的不是被测对象（探针自证绿）」 —— 最高风险

三种典型：① 终点在动作前即成立（④⑦ 的原缺陷形态）；② 冷/暖混淆或同值重写（③）；③ 键入阶段不可判别（④ 的 `fixtur` 形态）；④ 复位不干净（沿用上一份状态）。

- 判定：`resetToWorkspace()` 的重新挂载纪律；`data.rowsBefore === 0`（④ / ⑦ 硬断言）；`data.panelAbsentBeforeOpen === true` + `data.warmSteps === "clear-then-retype"`（③）；`data.keyCounts` 的「至少一键变化 + 末键 < 首键」（④）；`samples.length` 逐条（② 每趟 30、④ 每轮 13）；`data.firstTurnLabel` 逐字 `第 2 / 304 页`；心跳 tick ≥ 2；⑤ 的 `scrollTargetPx > 0`。
- 失败信号：某指标显著优于常识（例如 304 页搜索 200ms、520 行首屏 < 50ms）、`rowsBefore !== 0`、`samples` 长度不足、恒等断言与指标同时「异常地好」。
- 收敛手段：§1.3 的复位 / 终点 / 防空三列 + §3 的失败路径 #13–#16（四条负向控制）。

### R2「阈值误报 / 漏报 与 时长红线」 —— 次高风险

① 相对判据依赖同机基线（忙机器基线偏高会掩盖回退；空闲机器基线偏低会把正常抖动变红）；② 绝对阈值（6 条）若实测远低于阈值则丧失区分度（`open.bigdoc.ms` 是唯一无相对伴随判据的检出盲区）；③ `search.cold.ms` 是护栏口径（**不得**据它宣称性能回归）；④ **ui-shot 单轮 +10% 红线**：守卫给 21 处调用点各加 ≥ ≈0.46s（合计 ≥ ≈9.7s；req 预置的估算为 ≥ ≈8.8s），`r19-1` 另加 ≈ 14.5s（相位 1 ≈ 1s + 相位 2 ≈ 13.5s = 3 × (静默 ≈ 0.46s + 就绪 4s)）⇒ 预计新增 ≈ 24s；在 180–300s 基线下 +10% = 18–30s ⇒ **贴线**。

- 判定：N106-2 判据 1（同命令连跑两次、相对指标比值 ≤ 1.5、两次 verdict 全同）；`skip` 计数 = 0；绝对阈值逐条登记实测值与余量倍数（余量 < 2× 必须登记）；§5.4 判据 ⑥ 的 `time` 双读数与比值；每轮的负载读数（重负载进程 / 空闲内存）与 `samples ≥ 30` 指标的 p95 离散度（§1.4 抖动纪律）
- 失败信号：两次连跑判定翻转、`skip > 0`、`ratio > 1.10`；`open.bigdoc.ms` 实测 > 1500ms（余量 < 2×）。
- 处置预案：`ratio > 1.10` ⇒ dev 档按「21 处静默前置（≥ ≈9.7s）+ `r19-1` 两相位（相位 1 ≈ 1.0s + 相位 2 ≈ 13.5s）」逐项归因并上报。**预置的允许动作（非削弱）**：① 复用调用方已做的显式静默（§1.5.4 的 4 处显式前置与 `ensureQuickAskExcerptReady` 内的静默使守卫内静默幂等，已计入估算）；② 严格串行 + 空闲机器前提（§1.4 抖动纪律）；③ 由负责人裁决是否收紧**失败路径**的就绪超时（§9#4）。**不允许**：删断言 / 跳过相位 / 把守卫失败降级为 `ok:false` / 放宽阈值换绿；阈值改判只走 §0.0#5 的登记流程。

### R3「为了达标改产品语义 / 守卫改坏既有取证面」

① 把 520 行「按需渲染」成「只渲染前 N 行且不提示」；② 把搜索改成「提前返回首个结果」；③ 把报告改流式写盘 / 改 `countNotesByChapter` 口径；④ 守卫把失败降级为 `ok:false`、吞错、或删既有断言；⑤ 抽取 `buildStub` 引入 stub 行为漂移（既有 186 张读数的假绿）；⑥ 落到条件性白名单外的产品文件（`PdfSearchPanel.vue` / `LibraryPanel.vue`）。

- 判定：§2.1 零改动清单 + §2.4 的零 diff 命令；N107-2 的白名单与「单文件 ≤ 80 行」；`selectPageSpan` 定义体内 `catch` = 0（§1.6 的 ④）；`r19-1` 相位 2 的 `threw === true`；§5.4 的 186 张零缺失与 74 种 label 零缺失；§5.2 / §5.3 的 74 / 74 条；§4 的「白名单外热点 ⇒ 阻塞 + 上报」。
- 失败信号：`.note-row` ≠ 520、报告章块 ≠ 30、搜索状态行不是 `第 1 / 10 处 · 第 121 页`、既有 label 出现差异、`git diff` 触及「不动」清单文件、`ui-shot.mjs` 的 `-` 行超出登记面。

### 次级风险（不占 Top3，登记）

1. **逐页文字层的累计等待由 20s 降为 ≤12s**（3 × 4000ms，§1.5.3 的直接后果）：慢环境下「文字层迟到 13–20s」的极端形态会由绿转红。缓解：失败是**硬失败 + 完整轨迹**（不可能假绿）；dev 档必须登记 21 处调用点在验收运行中的实际 `attempts` 与 `waitedMs`（出现 `attempts ≥ 2` 即原样登记）。
2. **`r19-1` 的重试分支（`attempts ≥ 2`）不被确定性覆盖**：相位 1 的注入固定落在**首轮静默窗口内** ⇒ 确定性覆盖的分支是 `absorbed-first-window`（已用 `trail[0].quiet.absorbed >= 1` + `hiddenSeen` 把「吸收」与「隐藏 → 恢复」变成硬断言）；`retried` 的确定性覆盖需要在就绪窗口内再注入一次（相位 1 从 ≈1.0s 涨到 ≈5.0s，直接威胁 N109-3 的 +10% 红线）⇒ 本轮按残余登记（§9#4 的裁决项），dev 档**不得**声称两条分支都被证明（req §0.10 残余风险 ② 同源）。
3. **守卫返回后的迟到滚动不在保护范围内**：守卫只覆盖到「就绪谓词成立」时刻；后续相位若因新的迟到滚动而隐藏浮层，仍按既有断言失败（不属本轮修复面）。
4. **抽取 `buildStub` 的 stub 行为漂移**：由「186 张零缺失 + 74 label 零缺失」与 §1.2.4 的差异白名单双向兜住；dev 档必须原样贴出 `diff` 并逐行归类。
5. **vite 5200 端口冲突**（`strictPort`）：与 `ui-shot.mjs` 的 5199 分离；并行运行会由退出码 2 暴露；本轮纪律 = 两次离屏 / 两次探针**串行**。
6. **304 页夹具的生成耗时与体积**（预期 < 1s / `big-book.pdf` < 300 KB）：若超预期，登记并说明；整库体积上限 5 MB 由 dev 档 `du` 读数佐证。
7. **⑥ 不在离屏面（口径差异）**：`report.export500.ms` 只覆盖数据面（分组 + 字符串拼接 + 原子写），**不含** IPC 往返与提示渲染；dev 档必须原样登记该边界。
8. **`[perf] data` 行是设计档新增的输出行类别**：若评审不接受，替代方案（JSON 内新增 `evidence` 键）会破坏 §0.6 的「键名逐字」⇒ 需负责人裁决；本档维持「独立证据行 + JSON 键名不变」。

---

## 7. 开发分工（A 数据面与探针 / B 取证面，白名单互不重叠）

### 7.1 A：共享模块 + 探针 + 烟测（不碰 `ui-shot.mjs`）

| 序 | 文件 | 改动 | 完成判据 |
| --- | --- | --- | --- |
| A1 | `pix/scripts/lib/pdf-fixture.mjs` | 新建（`escapePdfText` / `buildPdf` 逐字搬移） | §1.6 的 ③（四条计数）|
| A2 | `pix/scripts/lib/stub-preload.mjs` | 新建（`buildStub(config)` + 5 处模板差异） | `grep -c '\${'` = 1；API 面无缺 |
| A3 | `pix/scripts/perf-probe.mjs` | 新建（夹具 / 引导 / 24 条指标 / 三态退出码 / 自清理 / **复位纪律**） | 命令 3 退出 0、`summary.total === 24`、`summary.fail === 0`、`fixture` 六键断言通过；`git status` 前后不变；§1.6 的 ⑦（`reader-state.json` >= 1 / `PERF_STATE_FILE` >= 2）且 ②③⑤ 的 `data.resetPage(s)` 均逐字 `第 1 / 304 页` |
| A4 | `pix/scripts/smoke-notes.mjs` | 追加 `runPerfReportExport()` 与一行调用 | `node scripts/smoke-notes.mjs` ⇒ `通过 74 / 失败 0`（连跑两次） |
| A5 | `npm run check` | — | `CHECK_EXIT=0` |

**A 不碰 `ui-shot.mjs`**（`git diff --stat pix/scripts/ui-shot.mjs` 为空）；A3 落地后立即跑命令 1 / 命令 2 取得**改前读数**（此时产品侧零改动 ⇒ 该读数即热点判定的依据）。

### 7.2 B：验证据面（抽取 + 守卫 + 新场景），依赖 A 的模块接口

| 序 | 文件 | 改动 | 完成判据 |
| --- | --- | --- | --- |
| B1 | `pix/scripts/ui-shot.mjs` | 顶层 import 两个模块 + 模块作用域重建两棵树 + `buildStub(config)` 调用 | 步骤 0c / 步骤 5 的 `diff` 逐行归类通过；一轮离屏 186 / 264 / 74 零缺失 |
| B2 | `pix/scripts/ui-shot.mjs` | `SEL` +1；三处 helper 纯位移；`waitSelectionReady` + `selectPageSpan` 守卫化 | §1.6 的 ④；相位 1 的 `hiddenSeen === true` 且 `trail[0].quiet.absorbed >= 1`；相位 2 的 `threw === true` 且 `precondition.layerHidden === true` |
| B3 | `pix/scripts/ui-shot.mjs` | `r19-1`（2 record / 1 截图 / 相位 1 可见前置与隐藏采样器 / 相位 2 收起前置） | 步骤 4 的 187 / 266 / 75 + `failure === null` + `r19-selection-guard` 两条全绿 |
| B4 | 时长与零缺失复核 | — | §5.4 的 ①②④⑤ + §5.6 |

**串行纪律**：步骤 0c（改前取样）必须在 B1 之前；B1 与 B2/B3 之间各跑一次 `npm run check`；步骤 4 的验收离屏与步骤 5 的改后取样**串行**执行（不并发，避免 5199 / 5200 争用）。

### 7.3 备选：单代理

A1 → A2 → A3（跑命令 1 / 命令 3 取基线读数）→ A4 → A5 → 步骤 0c / 0d → B1（跑一轮离屏确认抽取零缺失）→ B2 → B3 → 步骤 1…6。**建议按 A/B 分工**：A 面的产物（探针读数）是 B 面「热点是否修」的输入，但两者文件面完全不重叠。

---

## 8. 报告与登记要求（dev 档必须包含「改前/改后」对照表）

### 8.1 必备章节（缺任一项即视为未完成）

| # | 章节 | 内容 |
| --- | --- | --- |
| 1 | 改动清单 | 逐文件「动作 / 行数 / 段落」；脚本面按块登记（搬出 965 行、位移 **60** 行（`:5697-5756`）、守卫与 `r19-1` 的净新增行数）；条件性白名单使用与否逐条声明 |
| 2 | 原样输出 | 命令 1 / 命令 2 / 命令 3 的 stdout（含 `[perf] metric` / `[perf] data` / `[perf] verdict` / 末行 `[perf] JSON`）逐字粘贴；`smoke-notes` 两轮末行；离屏两次的 `time` 数值与比值；**每轮的负载读数（重负载进程 / 空闲内存）与 `samples >= 30` 指标的 p95 离散度（§1.4）** |
| 3 | **改前/改后对照表（硬要求）** | 见 §8.2 |
| 4 | 夹具与体积 | `[perf] data fixture` 原样 + 夹具生成耗时 + 整库体积 |
| 5 | 热点结论 | C1–C6 逐条「热点（修）/ 非热点（不修，附实测读数）」；每条修复附 §8.3 的四行证据；无热点也要登记全 pass |
| 6 | N108 登记 | `r19-1` 两条 record 的 `data` 原样（相位 1 含 `stateBefore` / `hiddenSeen` / `hiddenFirstAt` / `injected` / `attempts` / `branch` / `quiet` / `trail` / `state` / `selection`；相位 2 含 `precondition`）；是否再次命中 S-SD-02（**含 §1.5.4 的 4 处残余是否被命中**）；`waitStageScrollQuiet` 新语义的登记；21 处调用点的 `attempts` / `waitedMs` 汇总；`branch` 逐字登记与「`retried` 未被确定性覆盖」的声明 |
| 7 | 抽取差异 | `diff` 原样 + 逐行归类 + 两文件纪律计数（和 = 31） |
| 8 | 零缺失 / 配额 | §5.4 的 ①②③④ 读数；187 / 266 / 75 / 74 / 74 |
| 9 | 偏差与未验证事项 | 与设计档的每处偏差（含「文字层累计等待 12s」的实际影响）、未跑项、开放问题 |

### 8.2 「改前/改后」对照表模板（逐条 27 指标）

| # | 指标 id | kind | 判据 | limit | 改前 value（命令 1） | 改前 verdict | 改后 value（命令 2） | 改后 verdict | 比值 | 余量倍数（绝对阈值）/ 基线（相对阈值） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `open.bigdoc.ms` | absolute | ≤ 3000 | 3000 | <实测> | pass | <实测> | pass | <v2/v1> | `<3000 / value>` |
| … | …（17 条时序 + 10 条恒等逐行） | … | … | … | … | … | … | … | … | … |
| 27 | `report.chapters` | invariant | = 30 且每块 `（16 条）` | — | <读数> | pass | <读数> | pass | — | — |

**硬要求**：① 表中的每个数值必须是真实 stdout 的粘贴，不得手写；② 恒等断言行填实际读数（520 / 41 / 480 / 330 / 41 / `480 条` / `第 1 / 10 处 · 第 121 页` / 121 / 报告头 / 30）；③ `search.cold.ms` 必须附「**不得**据该条宣称性能回归（护栏口径，回归检测由 `search.warm.ms` 承担）」一句；④ 任何「改后不达标」的指标必须给出归因与处置（修 / 登记阻塞 / 上报）。

### 8.3 每条热点修复的四行证据（N107-3，缺任一行即未完成）

| 项 | 要求 |
| --- | --- |
| 热点 id | §1.4 表的指标 id（一条修复可对应多条，逐条列出） |
| 改前读数 | 命令 1 的 `[perf] metric <id>` 原样行 + `[perf] JSON` 内 `samples` 全量 |
| 改后读数 | 改后同一条命令的同一行 + `samples` 全量；相对指标必须同时给出基线值与比值 |
| 差值归因 | 一句技术归因（哪个派生 / 遍历被消除、为什么等价）；差异 < 10% 必须写「无显著差异，登记不修」 |

**附加纪律**：① 一次只落一条手段（C1 / C6 与 C2 在同一指标上叠加时，分开登记两次读数）；② 修复触及 `pix/src/renderer/**` ⇒ 必须复跑离屏并复核 186 张 / 264 条 / 74 label 零缺失 + `r19-1` 全绿（不允许「只跑探针就宣布安全」）；③ 修后同一次运行的其余 23 条不得转 fail（无此消彼长）。

---

## 9. 开放问题（登记，不阻塞本档定稿）

1. **`[perf] data` 行类别**（§0.3 / §6 次级风险 8）：本档以「独立证据行」承载 req 明确要求的 `data.*` 登记；若负责人要求证据进 `[perf] JSON`，需同步改 §0.6 的键集口径与 N104-4 判据 1。
2. **`search.cold.ms` 的绝对阈值 20000**：护栏口径（§1.4 #7）。若实测余量过大（例如实测数百毫秒 ⇒ 无区分度），可申请改为相对判据或收紧数值——两种改法都要同步 req §0.0#5 / §0.5 #7 / §0.9 与本档 §1.4。
3. **`open.bigdoc.ms` 的检出盲区**（无相对伴随判据）：本轮接受并登记（N105-1 判据 1）；是否补一条同基线 ≤ 2.0× 的伴随判据由负责人裁决（补则需新增第 28 条指标并同步配额）。
4. **`r19-1` 的相位 2 代价**（≈ 13.5s）与 +10% 时长红线：若实测顶穿，可选处置 = ① 原样登记并上报；② 由负责人决定是否把「就绪 ≤ 4000ms」在**失败路径**上收紧（会缩短单次尝试的容忍窗口）。本档不预设。**新增子项（MF-D3）**：`retried` 分支的确定性覆盖（在首轮就绪窗口内再注入一次）会使相位 1 从 ≈1.0s 涨到 ≈5.0s，与本红线直接冲突 ⇒ 本轮按残余登记（§1.5.5 判据 ⑩ / §6 次级风险 2），是否覆盖由负责人裁决。
5. **③/⑦ 的潜在热点落在「不改」清单**（`PdfSearchPanel.vue` / `LibraryPanel.vue`）：按 N107-1 判据 4 阻塞 + 上报；是否扩条件性白名单由负责人裁决（本档不扩）。
6. **文字层累计等待 20s → ≤12s**（§1.5.3 / §6 次级风险 1）：是否接受该覆盖变化由负责人确认；若不接受，需要把「就绪 ≤ 4000ms」改为「就绪 ≤ 4000ms 且首轮文字层等待独立 ≤ 20000ms」——代价是 `r19-1` 相位 2 涨到 ≈ 20s、+10% 红线更紧。
7. **§1.5.4 的 4 处残余裸等待**（`runScenario` 06/07 段 `:1465` / `:1512` / `:1540` 与 `selectionOnPageOne` `:9552`）：本轮登记为残余（理由与命中处置见 §1.5.4）；是否追加授权改这三处相位 / 该 helper 由负责人裁决——代价是 `06-*` / `07-*` / `r16-3-note-anchor.png` 的时序与像素风险，以及 `selectionOnPageOne` 的部分选区语义。

---

## 附：本档自检（交付面）

| 项 | 结果 |
| --- | --- |
| 交付文件 | `docs/pm/R19-design.md`（唯一新增；未改任何源码 / 脚本 / 其它文档） |
| 结构 | §0 口径与证据面 / §1 契约冻结表 / §2 与既有冻结面的关系 / §3 失败路径表 / §4 文件级清单 / §5 验证方案 / §6 风险 Top3 / §7 开发分工 / §8 报告与登记要求 / §9 开放问题（与 R16-design / R18-design 同构）/ **§定稿修订（R19）**（末尾，含 3 条阻塞级的处置表） |
| 冻结覆盖 | N104（脚本 / 命令 / 夹具 / 抽取判据）· N105（7 条路径的计时点 / 采样 / 统计 / 预热 / 复位 / 防空）· N106（27 条阈值与实现常量 / 抖动抑制 / 输出面）· N107（热点判定与四行证据）· N108（`SEL` 增量 / 位移 / 守卫参考实现 / `r19-1` 两相位 / 配额）· N109（零缺失 / 工程门 / 时长 / 配额） |
| 指标与阈值 | 指标 **27** 条（时序 17 + 恒等 10；perf-probe 24 / smoke-notes 3）；阈值 **17** 条（绝对 6 + 相对 11）+ 恒等 **10** 条 |
| 风险 | Top3（R1 / R2 / R3）+ 次级 8 条 |
| 行号纪律 | 本档全部行号 / 计数来自本步真实命令输出（§0.1），并含两条对 req 的**事实纠偏**（`readerStage` 在 `pix/src` 的 3 处命中；`resetAll` / `textCache.clear()` 的行号）+ 四处**评审观察 1 的行号精度修正**（`statusText` `:74-82` / `countOccurrences` `:100-107` / 挂点 `v-if` 逐字 `:1088` / `onBeforeUnmount` `:193-200`）+ 位移块行数统一为 `:5697-5756` = **60** 行（MF-D5） |
| 定稿修订 | **设计评审 MF-D1…MF-D10 全部处理（10 / 10）**，含 3 条阻塞级（MF-D1 复位纪律与 reader-state 删除 / MF-D2 相位 2 的确定性前置与判据重述 / MF-D3 5 处裸等待全量覆盖与失败即红断言补强）；逐条处置见文末「## 定稿修订（R19）」表，**未销账 must-fix：0** |
| 残余项（非 must-fix，已登记） | ① `r19-1` 的 `retried` 分支不被确定性覆盖（§9#4）；② §1.5.4 的 4 处残余裸等待（§9#7）；③ `waitStageScrollQuiet` 新语义与「文字层等待 20s → ≤12s」的覆盖变化（§9#6）；④ 本步只写本档 + `R19-req.md` 的定稿修订节，**未改任何源码 / 脚本**；所有运行级读数仍为**预期形态**，实测由 dev 档登记（§0.4） |
| 未执行 | 离屏 / 基线 / 探针 / 两条烟测 / build / package / dev（§0.4） |

---

## 定稿修订（R19）

> 依据：`docs/pm/R19-review.md` 的「## 设计评审（R19）」§2 must-fix 清单（MF-D1…MF-D10，含 3 条阻塞级）。本步允许的写操作 = 本档 + `docs/pm/R19-req.md` 的「## 0. 定稿修订（R19-定稿）」最小同步；**未改任何源码 / 脚本**。本步实跑：`cd pix && npm run check`（`CHECK_EXIT=0`）、只读 `git log --oneline -1` / `git status --short`，以及对 `ui-shot.mjs` / `PdfSelectionQuickAsk.vue` / `WorkspacePage.vue` / `PdfViewer.vue` / `reader-state-store.ts` / `HomePage.vue` 对应段的 `read` 与全部 `grep` / `sed` / `awk` / `wc` 读数。

| # | 级别 | 评审问题（摘要） | 处置：改哪一节 → 改成什么 | 本步实读证据 |
| --- | --- | --- | --- | --- |
| MF-D1 | **阻塞** | 复位「回到第 1 页」不可控（阅读现场持久化页码） | ① §1.3.0「复位纪律」「复位的实现」→ 复位子步骤冻结为「**删 `PERF_STATE_FILE`（必须在工作区挂载之前）** → `goHome()` → 点项目卡片」，并写明理由链；② §1.3 的 #1 / #2–#5 / #7 / #10 / #11 / #12 / #16 复位列全部补「删 `reader-state.json`」，② 增 `data.resetPages`（**硬断言逐字 `第 1 / 304 页`**）、③⑤ 增 `data.resetPage`、⑦ 增 `data.progressBadge`；③ §0.3 新增复位纪律常量行；④ §1.6 新增走查块 ⑦（`reader-state.json` ≥ 1 / `PERF_STATE_FILE` ≥ 2 / `rmSync` ≥ 2）；⑤ §3 新增 #22，§3 #13 扩口径 | 实读 `PdfViewer.vue:700-702` / `:740`（`initialPage = lateJump ?? jumpPage ?? restore?.page ?? 1`）、`:744`（`noteLanding`）、`:1027`（`noteChange`）、`reader-state-store.ts:229-235` / `:242` / `:250`、`WorkspacePage.vue:207-211`、`ui-shot.mjs:412-413`（同一处置的既有先例） |
| MF-D2 | **阻塞** | `r19-1` 相位 2 的判据 ③ 与相位 1 末态互斥（永假） | §1.5.5 相位 2 → 新增**确定性前置**（`getSelection().removeAllRanges()` + 派发 `selectionchange` → 有界轮询至 `display === "none"` → `data.precondition = { selectionCleared, displayBeforeGuard, layerHidden }`，**硬断言 `layerHidden === true`**）；判据 ③ 重述为「前置已不可见 ∧ 守卫抛错后仍不可见」（单列判据 ① 与 ④）；§3 新增 #24 | 实读 `PdfSelectionQuickAsk.vue:118-123`（`rangeCount === 0` ⇒ `hide()`）、`ui-shot.mjs:1838-1851`（守卫重建段 `if (!span) return false` **不**派发 `selectionchange` ⇒ 旧判据永假） |
| MF-D3 | **阻塞** | N108 只改 1 / 5 处裸等待；相位 1 无「隐藏 → 恢复」证据（假绿） | ① §1.5.4 重写为**覆盖清单**：全文件 6 行 `摘录浮层` 逐行归类 + 4 处残余逐条理由与命中处置 + **销账口径收窄为「`selectPageSpan` 家族」**；② §1.5.5 相位 1 新增步骤 2「可见前置」与步骤 4 的 16ms「隐藏采样器」⇒ 硬断言 ①（`stateBefore.display !== "none"`）/ ⑤（`hiddenSeen === true`）/ ⑥（`trail[0].quiet.absorbed >= 1`）；③ 判据 ⑩ 明示 `retried` **不被确定性覆盖**（替代分支的登记要求）；④ §3 新增 #23 / #25；⑤ §6 次级风险 2 / §9#4 / §8.1 行 6 同步 | 实读 `ui-shot.mjs:5734-5756`（`from` 快照 + `absorbed = seen - from` + `sleep(60)` 轮询 ⇒ 首轮静默 ≥ ≈420ms）、`:1465` / `:1512` / `:1540` / `:9552`（4 处残余字面）、`:5604-5632`（既有「静默 + 复核 + 有界重取」范式）、`grep -n "摘录浮层"` = 6 行 |
| MF-D4 | 中 | `grep -c "摘录浮层"` 判据必假 | §1.6 ④ → 改为 `grep -n "摘录浮层"` **恰 6 行**的逐行归类（4 处残余 + `:11327` 注释 + `waitSelectionReady` 的等待标签）；§1.5.3 冻结「等待标签与证据字段保留 `摘录浮层` 字面」 | 本步 `grep -n` 实读 6 行：`:1465` / `:1512` / `:1540` / `:1850` / `:9552` / `:11327` |
| MF-D5 | 中 | 位移块行数自相矛盾（60 vs 51 / 「124 行级」） | 统一为 `:5697-5756` = **60 行**：§1.5.2「为什么必须位移」行、§4 行 4（含「124 行级」措辞）、§8.1 行 1 全部改写并互相对齐 | 实读 `sed -n '5697,5756p' \| wc -l` = 60；`:5756` = `  };`（`waitStageScrollQuiet` 收口） |
| MF-D6 | 中 | `git diff -U0 \| grep -cE "^-[^-]"` 的合计等式不可算 | §1.6 ⑤ → 删除等式判据，改为「按 hunk 头 `@@ -a,b +c,d @@` 算旧行号区间，`-` 行必须**整体**落在 5 个登记区间内（`:137-139` / `:149-227` / `:438-1320` / `:5697-5756` / `:1838-1851`），区间外的 `-` 行即停线；合计只作读数」 | 三块区间即 §1.2.3 的 965 行 + §1.5.2 的 60 行 + §2.2 行 2 的 14 行 |
| MF-D7 | 中 | 探针 `buildStub(config)` 配置表不完整 | §1.2.3 → 新增「**12 键同形**」逐键表、`nameB` 必给值的理由（`JSON.stringify` 丢 `undefined` 键）、`samplePath` / `samplePathB` / `olderPath` 的「键面保留、无模板消费者」登记，以及 `recentProjects` 的**双卡片**可见结果与复位命中键（`CONFIG.name`） | 实读模板 `:888-890`（`CONFIG.name` / `CONFIG.nameB`）；`sed -n '438,1320p' \| grep -o "CONFIG\.[a-zA-Z]*"` 逐键计数（`root` 26 / `rootB` 2 / `name` `nameB` `samplePath` `samplePathB` `olderPath` `notesFilePath` 各 1）；`HomePage.vue:124-134` |
| MF-D8 | 中 | ④ 的手段与恒等 #18 冲突（按需渲染对 ④ 不可用） | §4 条件性白名单后新增「按指标的手段边界」段：④ / ⑪ = memo / 减少重复计算（`content-visibility` 一类不改 DOM 计数的手段须单独登记）；`NotesPanel.vue` 的 **520 / 41 行是不可压缩的终点点** ⇒ 按需渲染不得作为 ④ 的手段；⑤ 的 330 / 320 同理 | 实读 `WorkspacePage.vue:319`（`v-show` ⇒ ④ 的测量时刻面板 `display: none`）、`NotesPanel.vue:803-817`、`KnowledgeMap.vue:105-149` |
| MF-D9 | 低 | 抖动纪律缺登记 | §1.4 新增「抖动纪律与读数登记」四行（R18 同源幅度依据 **8–12×** / 串行 + 空闲前提 / 负载红轮取空闲绿轮且**不得改阈值** / `samples ≥ 30` 登记 p95、K=3 登记三个原始读数）+ `open.bigdoc.ms` 检出盲区行；§3 #7、§5.5、§6 R2、§8.1 行 2 同步 | 评审实读的 R18 同源数据（干净轮 80 / 87 / 95 / 119 ms vs 负载轮 966 / 973 ms），出处 `docs/pm/R18-dev.md:131` / `:224` / `:273`（本步未复跑，标为登记） |
| MF-D10 | 低 | 口径歧义未登记 | §1.3.0 新增「统计读法与解释边界」行：①「30 次 median」= **每趟**纪律、样本量 **90** 的读法；② ④ / ⑪ 在 `leftTab = library` 的**隐藏**面板上量 ⇒ **不含 layout / paint**；③ ⑤ `map.scroll.ms` 的常数级口径；§1.3 #14 → 补「≈ 30 个 16ms 心跳的常数级」 | 实读 `WorkspacePage.vue:41`（默认 `library`）/ `:319`（`v-show`）、`PdfViewer.vue:784-790`（`onScroll` 的 rAF 节流） |

**评审 §3 观察项的处置**：观察 1（行号精度）已按本步实读修正四处（`PdfSearchPanel.vue` 的 `statusText` `:74-82` / `countOccurrences` `:100-107`、`PdfViewer.vue` 挂点 `v-if` 逐字 `:1088`、`PdfSelectionQuickAsk.vue` `onBeforeUnmount` `:193-200` 且解绑 `:194-195`）；观察 2（按需渲染的机制冲突）由 MF-D8 处置；观察 3（`map.scroll.ms` 为节流代理量）已在 §1.3 #14 / §1.3.0 登记；观察 4（每处 `selectPageSpan` +≈420ms ≈ +9.7s 的归因）已在 §6 R2 / §3 #21 / §9#4 预置；观察 5（`waitStageScrollQuiet` 的新语义）在 §0.2 MF-05 与 §1.5.2 登记；观察 6（`open.bigdoc.ms` 无相对伴随判据）在 §1.4 / §6 R2 / §9#3 登记；观察 7（端口占用发生在建根之后 ⇒ `finally` 兼底）在 §1.1.3 第 5 步冻结；观察 8（`[perf] data` 行需负责人确认）维持 §9#1（证据行为**追加**输出，不影响 `[perf] JSON` 的键名与键序）。

**未销账 must-fix：0。** 残余项（**非 must-fix；均为评审给出的替代分支要求登记，或已登记待负责人确认的项**）：

1. `r19-1` 的 `retried` 分支不被确定性覆盖（§1.5.5 判据 ⑩ / §6 次级风险 2 / §9#4 的裁决项）；
2. §1.5.4 的 4 处残余裸等待（登记 + 命中上报，§3 #25 / §9#7）；
3. `waitStageScrollQuiet` 的守卫内新语义与「逐页文字层累计等待 20s → ≤12s」的覆盖变化（§9#6 的负责人确认项）；
4. 本步**未跑**离屏 / 探针 / 两条烟测 / build / package / dev：所有运行级读数（`hiddenSeen` / `quiet.absorbed` / `resetPage` / 27 条指标实测值）仍为**预期形态**，实测由 dev 档登记（§0.4）；
5. 对需求档的同步 = `docs/pm/R19-req.md` 文末「## 0. 定稿修订（R19-定稿）」七条（相位 2 前置 / 相位 1 的两条硬断言 / 残余裸等待与销账口径 / 复位纪律的探针实现语义 / 统计读法 / `摘录浮层` 计数归类 / 抖动纪律）。
