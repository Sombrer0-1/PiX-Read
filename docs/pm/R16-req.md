# PiX-Read R16 需求档 · 原文锚点（N91–N95）

> 上游：`docs/pm/PRD-V0.6.md` §1 缺口 1（「笔记与原文在空间上失联」：笔记有页码锚点、能跳回，但**在 PDF 页面上看不见**——读到第 7 页时没有任何线索告诉你「这一页你摘过两句话」，更看不到「摘的是哪一句」；笔记必须回到它诞生的位置上）、§2（R16 = 原文锚点：每页可见笔记标记；当前页的摘录文本若能在文字层匹配则以独立高亮标出（best-effort，失败静默降级）；标记可定位到笔记面板；依赖 R7、R9、R13）、§4 反需求 4（**不做 OCR、不做跨页文本重建**）、§4 反需求 5（不引入新运行时依赖、不改 `packages/*`、不改 electron-builder 配置）、§4 反需求 6（不改 `.pix-read/notes.json` 的格式与写入协议）、§4 反需求 7（不做向后兼容层、不写未被调用的死代码、不为「看起来高级」加动画）、§4 反需求 8（**R16 的页面标记与高亮不得改变 PDF 文字层 DOM 结构、不得拦截文本选择与既有搜索高亮 `::highlight(pix-search)`**）、§5 工程红线（唯一工程门、禁 any / 内联动态 import、中文文案、冻结字面显式登记、离屏串行与零缺失、临时产物零残留、性能判据必须可复跑且带阈值）、§7 判据 1（任意一页能看出「本页有几条笔记」；当前页的摘录在文字层可匹配时高亮、不可匹配时静默；标记点击能到达对应笔记，且不与既有过滤/跳转打架；选择、搜索与翻页行为零回归）。
> 依赖：`docs/pm/R10-req.md` §0（笔记面板既有类名 / 文案 / 编辑态语义）、`docs/pm/R11-req.md` §0（**PDF 搜索高亮的注册表与样式入口**：`pix-search` / `pix-search-current`、`LAYER_WAIT_TIMEOUT_MS = 5000`、等比缩放下文字层 `--scale-factor` 口径）、`docs/pm/R12-req.md` §0（取证脚本契约：启动守卫 / 产物自净 / 结束自检 / `SEL` 与既有场景零删除、`.reader-section` 与页码 pill 字面）、`docs/pm/R13-req.md` §0（`.notes-report-*` 字面与 `reportScope` 范式）、`docs/pm/R14-req.md` §0（**冻结字面登记范式**、`countNotesByDocument` 的单次遍历 + memo 纪律、`notes-path.ts` 为渲染层派生唯一落点、`ui-shot.mjs` 的 r14 helper 与「既有场景零改写」硬约束）。
> 本轮唯一主线（负责人已冻结，不得扩张）：**让笔记回到它诞生的页面上** —— 每页可见「本页笔记数」标记；当前页的摘录文本若能在文字层匹配则以独立高亮标出（best-effort，失败静默降级）；标记可到达对应笔记。
> 范围约束：不做 OCR、不做跨页文本重建、不改文字层 DOM 结构、不拦截选择与既有搜索高亮、不做「点击高亮跳转到笔记」以外的交互、**不做自动滚动**（见 §6 反需求 1 的例外登记）、**不做任何主进程改动**（本轮零新 IPC、`pix/src/main/**` 与 `pix/src/shared/types.ts` 零 diff）、不改 `notes.json`、不引入依赖。需求编号 **N91–N95**，共 **23** 个子条（N91 5 / N92 3 / N93 5 / N94 6 / N95 4）。

**判定工具（本档所有验收只能由这五种证据判定，逐条已标注）**

| 记号 | 含义 |
| --- | --- |
| 【走查】 | 只读代码与 `git status` / `git diff` / `git show`（只读可用）；含 `grep -c` / `grep -rn` 计数类判据 |
| 【check】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error（唯一工程门） |
| 【烟测-渲染】 | 纯函数离线烟测 `pix/scripts/smoke-view.mjs`（本轮由 5 组 35 条 **扩到 7 组 51 条**，见 N95-1） |
| 【烟测-主进程】 | 数据面烟测 `pix/scripts/smoke-notes.mjs`（**本轮零改动**：10 组 65 条只作回归，理由见 §0.0 第 3 条） |
| 【离屏】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + 既有截图/测量零缺失 + 新增断言组全绿 + 新增截图齐备 |

**本档事实基线（写档当天核对过的真实结果，供后续角色复核）**

| 事实 | 证据 |
| --- | --- |
| 工作树干净、分支 `main`、HEAD = `dbc2a58`（V0.6 路线与 PRD 已提交；R16 尚未开工） | `git status --short` ⇒ 空（本档落盘前）；`git log --oneline -1` ⇒ `dbc2a58 docs: V0.6 迭代路线与 PRD（R16-R20）` |
| 唯一工程门当前 0 error | 2026-09-17 实跑 `cd pix && npm run check` ⇒ `CHECK_EXIT=0`（`vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit`） |
| 既有烟测面（本轮基线） | 实跑 `npm run smoke:view` ⇒ 末尾逐字 `通过 35 / 失败 0`（5 组：`section-hit` 8 / `section-null` 8 / `section-nav` 8 / `section-format` 5 / `badge-counts` 6）；实跑 `npm run smoke:notes` ⇒ 末尾逐字 `通过 65 / 失败 0`（10 组：`runUndoRoundtrip` / `runUndoFailures` / `runUndoSlotLifecycle` / `runExportAndEmpty` / `runReportRender` / `runReportFiles` / `runReportFailures` / `runNotesStat` / `runLibraryRootContainment` / `runReaderStateStore`） |
| 零缺失比对基线（R15 交付终态，R16 的参照） | 目录 `C:/Users/86157/AppData/Local/Temp/pix-v05-r15-final/shots`：`MANIFEST.json` ⇒ `shots.length = 153`、`failure = null`；`MEASUREMENTS.json` ⇒ 长度 **223**、`label` 去重 **59** 种（含 R14 五组 `r14-tree-badge:3` / `r14-tree-badge-scope:2` / `r14-notes-stale:3` / `r14-notes-stale-failure:3` / `r14-group-jump:2` 与 R15 三组 `r15-notes-recover:1` / `r15-vision-fallback:1` / `r15-workspace-late-register:1`）；目录内 png 数与清单一致（153）。本次复读命令：`node -e` 读两个 json 后打印长度 / label 去重 / png 计数 |
| `.pdf-page` 结构（`pix/src/renderer/components/workspace/PdfViewer.vue`，1311 行） | 模板 `:920` `<div v-else ref="scrollEl" class="pdf-scroll" …>` → `:924-926` `<div v-for="(size, index) in pageSizes" :key="index + 1" class="pdf-page" :data-page="index + 1" :style="{ width: cssSize(size.width), height: cssSize(size.height) }">` → 子元素恰三个：`:928` `<canvas />`、`:929` `<div class="textLayer" />`、`:930-932` `<div class="pdf-overlay"><slot name="overlay" :page="index + 1" /></div>`；CSS：`.pdf-scroll` `:1056`（`padding: 48px 16px 48px`）、`.pdf-page` `:1063`（`position: relative; margin: 0 auto 16px; background: #fff`）、`.pdf-page canvas` `:1070`（`position: absolute; inset: 0`）、`.pdf-page :deep(.textLayer)` `:1076`（`position: absolute; inset: 0; overflow: hidden; line-height: 1; z-index: 1`）、`.pdf-overlay` `:1101`（`position: absolute; inset: 0; z-index: 2; pointer-events: none`）、`.capture-layer` `:1114`（`z-index: 5`）、`.pdf-capture-fab` `:1158`（`left: 12px; bottom: 12px`）、`.reader-section` `:1209`（`bottom: 46px`，水平居中）、`.pdf-page-indicator` `:1244`（`bottom: 12px`，水平居中）、`.pdf-toolbar` `:1034`（`top: 40px; right: 12px`）；`pageElement` `:107-109`、`clearPageLayers` `:181`、`renderPage` `:191`（`--scale-factor` 写在 `:205`）、`releasePage` `:250`、`observePages` `:262-289`（`rootMargin: "1200px 0px"`、离开视口 > 4 页即 release）、`updateCurrentPage` `:292`（二分 + 触底钳制）、`cssSize` `:103`（`Math.max(1, Math.round(base * scale))`） |
| 夹具页几何与文字层（R15 基线 `MEASUREMENTS.json` 的 `pdf-text-layer-geometry`，本次复读） | `pageBox = { x: 443, y: 39, w: 595, h: 842 }`（100% 缩放下的 `.pdf-page[data-page="1"]`，即 MediaBox 595×842）；`spanCount = 6`；`firstSpan = { dx: 56, dy: 86, w: 387, h: 20 }`、`firstSpanText = "Sparse Attention for Long-Context Retrieval"`、`spanColor = "rgba(0, 0, 0, 0)"`、`scaleFactorVar = "1"`、`canvasWidth = "595px"` |
| 夹具正文（`ui-shot.mjs` 的 `SAMPLE_PAGES`，逐字） | 页 1 **6** 个文字项：`Sparse Attention for Long-Context Retrieval`(20) / `Abstract. We study retrieval over long documents where the` / `attention budget is the binding constraint. Our method keeps` / `linear complexity while improving recall to 91.3% on the` / `LongBench suite, matching dense baselines at one third cost.` / `Keywords: retrieval, sparse attention, ablation`(10)；页 2 **4** 项：`3. Ablation Study`(16) / `Table 2 reports the ablation over the sparse mask budget.` / `Removing the positional prior costs 2.4 points of recall,` / `which confirms the mask is doing more than sparsification.`（**到此为止**）；页 3 **3** 项：`4. Conclusion`(16) / `Sparse attention keeps recall at one third of the dense budget,` / `and the ablation holds across all three random seeds.` |
| 标准种子与 R16 的匹配事实（`ui-shot.mjs:332` `seedNotes()`，逐字） | 4 条：`n-current-1`（`sample-paper.pdf` p1 摘录 `We study retrieval over long documents where the attention budget is the binding constraint.`，备注 `与第 3 节消融实验对照`）⇒ **可匹配**（页 1 的两个文字项在片段边界被折叠分隔符补齐空格后，该句是页 1 折叠文本的连续子串）；`n-current-2`（p2 摘录，正文比页 2 文本**更长**：页 2 只到 `…more than sparsification.`）⇒ **不可匹配**；`n-other-1`（`archive/older-paper.pdf` p7 摘录）⇒ 非当前文档；`n-current-3`（p2 **AI 结论**）⇒ `kind !== "excerpt"`，不参与原文锚点 |
| PDF 搜索高亮的既有实现（`pix/src/renderer/components/workspace/PdfSearchPanel.vue`，484 行） | `HIGHLIGHT_ALL = "pix-search"` `:39`、`HIGHLIGHT_CURRENT = "pix-search-current"` `:40`、`LAYER_WAIT_TIMEOUT_MS = 5000` `:43`、`textCache = new Map<number, string>()` `:85`、「按 DOM 文本重匹配后绘画」`paintHighlights` `:219-256`（`document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)` 收集片段 → `indexOf` 循环 → `rangeForSpan` 建 Range → `registry.set(HIGHLIGHT_ALL, new Highlight(...ranges))`）、`clearHighlights()` `:95-98` **只删除自己的两个注册表**、`waitForTextLayer()` `:193`（rAF 轮询到 `.textLayer` 出现首个 `span`）；`readerStore.page` watcher 在离开命中页时清空高亮 |
| 全局高亮样式落点（`PdfViewer.vue` 的非 scoped style 块，逐字） | `:1299-1310`：注释（`::highlight()` 不能 scoped；字面 `--pix-accent (#31424f)`）+ `::highlight(pix-search) { background-color: rgba(49, 66, 79, 0.12); }` `:1303` + `::highlight(pix-search-current) { background-color: #31424f; color: #ffffff; }` `:1307`（`grep -rn "pix-search" pix/src` 现 **4** 命中） |
| 渲染层笔记 store（`pix/src/renderer/stores/notes-store.ts`，535 行） | `chapterFocusToken` `:122`（`ref(0)`，复位 `:418`，`focusChapter` 内 `+= 1` `:452`，return `:502`）；`currentDocKey` `:146`（`toDocKey(readerStore.filePath, projectStore.currentProject?.path ?? "")`）；`focusChapter` `:449-453`（守卫 `currentDocKey === null` ⇒ no-op）；`clearChapterFilter` `:456`；`resetNotes()` `:402`（含 `chapterFilter` / `chapterFocusToken` / 选择集 / 搜索 / 排序复位）；`sortNotesForContext` 由 `notes-path.ts` 提供 |
| 笔记面板（`pix/src/renderer/components/workspace/NotesPanel.vue`，1572 行） | 滚动容器 = `.notes-panel` 自身（CSS `:803-809` `display:flex; flex-direction:column; height:100%; min-height:0; overflow-y:auto`）；`.notes-header` 为 `position: sticky; top: 0; z-index: 2`（CSS `:811-820`）；`.notes-chapter-filter` 块（模板 `:536-553`，文本 `章节：{title} · 第 {label} 页`、按钮 `清除` / title `清除章节过滤，恢复全部笔记`）；`NOTICE_MS = 4000` `:29`；瞬时提示 `.notes-notice`（模板 `:574`，类 `is-error` / `is-success`）；行结构 `.note-row`（CSS `:1326`，`border: 1px solid var(--pix-border-light, #e3eaf0)`、`cursor: pointer`）、页徽标 `.note-page-badge` 文本逐字 `第 {N} 页`（模板 `:715`，CSS `:1384`）；`onBeforeUnmount` `:452`（定时器与监听成对清理） |
| 工作区页（`pix/src/renderer/pages/WorkspacePage.vue`） | `selectLeftTab` `:204-212`（切到 `notes` 即 `void notesStore.loadNotes()`）；`chapterFocusToken` watcher `:215-224`（判据 `token <= 0 \|\| token <= previous` ⇒ return；命中则 `leftCollapsed.value = false` + `selectLeftTab("notes")`） |
| 笔记路径工具（`pix/src/renderer/utils/notes-path.ts`，138 行） | `docPathKey` `:18`、`currentDocKey` `:23`、`docDisplayName` `:32`、`absoluteDocPath` `:41`、`rangeContains` `:52`、`matchesChapterFilter` `:60`、`NotesBadgeCount` `:66`、`countNotesByDocument` `:73`（R14 的「单次遍历 + 只产出 > 0 + 每次返回新 Map」范式）、`groupNotesByDocument` `:87`、`sortNotesForContext` `:130`；**文件当前 `for (` 恰 3 处**（`:75` / `:94` / `:118`） |
| 离屏脚本（`pix/scripts/ui-shot.mjs`，9407 行） | `SEL` `:47-113`（**60** 项；复读方式 = `sed -n '47,113p'` 后对 `键名:` 形式的条目行计数）；`SAMPLE_PAGES` 见上表；`seedNotes()` `:332`；`writeFixtures()` `:382`；`buildStub()` `:420`（stub 的 `api` 面 **42** 方法与 `PixApi` **42** 方法逐字相等）；`NOTES_FILE`（A 根）`:442` / `:2374`；`repaint(win)` `:1258`；`capturePage(win, name, rect)` `:1263`；`runScenario` `:1273`；`runReaderStateScenarios` `:1586-9250`（**R16 场景的挂载点 = 该函数末尾，`r15-f16` 之后、收口 `}` 之前**）；`record(label, data, failures)` `:1604`（先落测量再抛错）；`enterWorkspace` `:1691`；`openRow` `:1706`；`readNotes` `:2375`；`notesHash` `:2376`；`rectOfSelector` `:2564`；`rowFinder` `:2963`；`enterCleanWorkspace` `:3392`；`openNotesPanel(rows)` `:3405`；`restoreStandardSeed` `:3411`；`loadCalls` `:4350`；`openMap` `:4376`；`clickMapBadge(name)` `:4455`；`enterMapWorkspace` `:4492`；`backToLibraryTab` `:4506`；`waitNotesTab` `:4510`；`enterNotesProbe(seed, rows)` `:5211`；`setSearch(text)` `:5220`；`groupHeads()` `:5294`；`deleteRowByText(needle)` `:5309`；`clickUndo()` `:5349`；`notesNotice()` `:5356`；`narrowProbe()` `:5655`；`r15-f18`（框选成败）`:6675-6760`；`clickEl` `:7268`；R14 块 `:8394-9100`（`triggerWindowFocus` `:8404`、`appendExternalNote` `:8489`、`writeNotesOutside` / `readNotes` 同域）；`r15-f16` `:9199-9249` |
| 命名预检（本轮全部为**新增**名字，`pix/src` 内当前 0 命中） | `page-notes` / `pix-note-anchor` / `countNotesByPage` / `PageNoteCount` / `foldText` / `matchExcerpts` / `MAX_ANCHOR_TEXT_LENGTH` / `ANCHOR_LAYER_WAIT_MS` / `ANCHOR_HIGHLIGHT_MS` / `LOCATE_WAIT_MS` / `focusPageNotes` / `pageFocusToken` / `pageFocusPage` / `pageBoxOne` / `pdfSearchSet` / `pdfSearchNext` / `pdfSearchClose` / `is-anchored` / 文案 `本页 {N} 条` 与 `本页笔记不在当前筛选结果中` 各 0 命中；`page-anchor.ts` 文件不存在；`pix/scripts/ui-shot.mjs` 内 `r16` 前缀截图 0 张（复读命令 `grep -c "r16"` / `node -e` 扫 `capturePage(win, "…")`）。**例外（M11）**：`HighlightRegistryWriter` 不是 0 命中项——它是既有的本地类型别名（`PdfSearchPanel.vue:20`，该文件内共 3 处），`PdfViewer.vue` 顶层将刻意再声明一份（见 §0.2 第 4 条） |

---

## 0. 定稿修订（R16）

本节是 `docs/pm/R16-review.md` 的 must-fix（M1–M12）逐条修订记录；以下每条均已落实到正文（§0.0–§0.9 的编号与「不得改写」约束不变）。事实核对全部来自本步真实读取的代码与命令输出。

| # | 评审问题（事实） | 本档修订落点 |
| --- | --- | --- |
| M1 | `selectLeftTab("notes")` 必发 `void notesStore.loadNotes()`（`WorkspacePage.vue:210`）⇒ `locate-panel-closed` 相位必然经过 `status === "loading"` 窗口，而该状态把整个 `.notes-list`（含全部 `.note-row`）移出 DOM（`NotesPanel.vue:638` 起的 `v-if / v-else` 链）⇒ 原「单次 `await nextTick()` 后查行」必落空，且把 loading 算作退化理由会说错 | §0.4「定位动作」改为**有界等待**（等 `status === "ready"` 且目标行入 DOM，上限 `LOCATE_WAIT_MS = 3000`；新常量登记在 §0.8），§0.4「不可达退化」把 loading 摘出退化理由；N92-2 判据 1/2、N92-3 判据 3/5 与 `r16-2` 相位 `locate-panel-closed` 同步 |
| M2 | 拟新增 `SEL.pdfPageOne` 与既有键同名不同义（`:59` 现为 `.pdf-page[data-page="1"] .textLayer span`，4 处既有使用 `:1345` / `:1381` / `:1429` / `:1457`）⇒ 页级截图会裁到首个 span | 新键改名 `pageBoxOne`（§0.8 的 `SEL` 行、N95-2 判据 3 与 `r16-*` 截图取法同步改名）；既有 `pdfPageOne` 逐字不动、`SEL` 增量仍为 4 |
| M3 | 「`releasePage` 函数体零 diff」与清空时机③（在 `releasePage` 内清注册表）互斥；且 `releasePage` 的调用点只有缩放 watcher（`PdfViewer.vue:822`，watcher `:817-828` 内）与 IO 回调（`:281`，属 `observePages` 函数体）⇒ 不存在「不动这些函数体」的落点 | §0.3「与既有页结构的关系」与 N91-4 判据 2 改为「既有分支语义不变」+ 明确四个允许新增调用点（`releasePage` / `loadPdf` 起始段 / 缩放 watcher / `onBeforeUnmount`），与 §7 白名单第 3 行同口径 |
| M4 | `r16-4` 原写 `setSearch("retrieval")`，但 `setSearch`（`ui-shot.mjs:5220`）只操作 `.notes-search-input`（笔记面板）；PDF 搜索面板的输入是 `.search-input`（`PdfSearchPanel.vue:404`）、「下一处」（`:421`）/「关闭搜索」（`:425`）是 `button[title="下一处"]` / `button[title="关闭搜索"]` ⇒ 按现文不可执行 | N95-2 新增 helper `pdfSearchSet(text)` / `pdfSearchNext()` / `pdfSearchClose()`（容器 `SEL.pdfSearchPanel` + 字面量后代选择器，**不新增 `SEL` 键**）；`r16-4` 两个相位与 N93-2 判据 1/2 同步；复用名单里 `setSearch` 标注为「仅笔记面板」 |
| M5 | `seedR16Focus()` 条数自相矛盾（14 ≠ 4 + 10 + 1），且「`docPath` 全部为 `sample-paper.pdf`」与标准种子第 4 条 `n-other-1` 的 `docPath = archive/older-paper.pdf`（`ui-shot.mjs:361`）冲突 | N95-2「夹具增量」写死**恰 14 条** = 标准 `seedNotes()` 4 条（含 `n-other-1`——`setSearch("Reproducibility")` 唯一命中行的前提）+ 9 条页 2 填充摘录 + 1 条页 3 摘录（`sample-paper.pdf` 13 条 + `archive/older-paper.pdf` 1 条）；`r16-2` 前置与章节过滤行数（11）随之写死 |
| M6 | §0.3 位置约束③ 与 §0.1「不覆盖 `.textLayer` 可选择区域」的全局措辞不可实现（`.textLayer` 是 `inset: 0` 整页层；右下角常驻标记在正文铺满的页面上必然覆盖部分文字层；标记固定 `right/bottom` 与居中控件是否重叠取决于页面在视口内的位置） | §0.3 把②③限定为**夹具相位内的几何判据**；§0.1 R3/R11 行改为「不改变文字层 DOM 与几何、允许在标记自身面积内覆盖文字层（登记取舍）」并登记「同 `z-index` 同层按 DOM 顺序绘制」的既有层叠事实 |
| M7 | 「返回路径 = 列表可见集合零变化」与「点击页标记清除章节过滤」互斥；被清除的章节过滤没有一键回退 | §0.0 第 1 条改写为「唯一被改动的视图状态 = 章节过滤被**单向清除**（可由地图徽标重建）」，「零变化」只对搜索 / 排序 / 仅看当前文档 / 选择集 / 阅读位置 / 缩放成立；§0.4「零副作用」「一次性」两行同步 |
| M8 | `degrade-filters` 相位直接用 `clickMapBadge`，但 `.map-row` 只在 `showMap` 为真时渲染（`ReaderPanel.vue:62` / `:207`），且相位入口 `enterCleanWorkspace` → `goHome` 会 `setMapOpen(false)`（`WorkspacePage.vue` 内）⇒ 按现文 `clickMapBadge` 必 throw | N92-1 判据 3 与该相位步骤前置补 `ensureMapOpen()`（`ui-shot.mjs:5254`）+ `waitChapterFilter("章节：2. Method Overview · 第 2 页", 11)`（`:4480`）；复用 helper 名单登记两者 |
| M9 | N93-4 的「连续点下一页 / 上一页 10 次」不可执行：3 页夹具下单调连点会卡在末页（`PdfViewer.vue` 的 `.pdf-page-indicator` 在首页 / 末页把按钮置 `:disabled`，禁用 `<button>` 不派发 click） | N93-4 判据 1/2 与 `r16-3` 相位 `unmatched-silent` 的续段写死**交替序列**（第 1 页起 next/prev 交替 10 次，每次点击前断言目标按钮 `disabled === false`），`revisitMs` 的读数点与序列对齐 |
| M10 | §0.5 等待窗口缺「本次等待作废」语义 ⇒ 旧页的等待可能在翻页后写出注册表，违反「只画当前页」 | §0.5「等待文字层」补作废语义（页 / 文档 / 缩放变化即丢弃、不写注册表；一次性令牌同 R11 `revealToken` 范式，`PdfSearchPanel.vue:193-218`）；N93-3 新增判据 6（快速连点后的可判定式）；`r16-3` 相位续段与 `data` 字段同步 |
| M11 | `CSS.highlights` 的写接口（`set` / `delete`）在 `typescript@5.8.3` 的 `lib.dom.d.ts:14320` 未声明（`HighlightRegistry` 只有 `forEach`），既有实现靠本地别名绕过，本档未登记 | §0.0 第 3 条补「刻意重复」说明；§0.2 第 4 条 / §0.8 名字表 / §7 白名单第 3 行登记 `HighlightRegistryWriter`（`PdfViewer.vue` 顶层，不新建文件、不改 `env.d.ts`）；N93-2 判据 3 补走查式 |
| M12 | N93-2 判据 4 的「`::highlight(` 规则数 = 3」按字面 grep 为 4（注释行 `:1301` 也命中 `::highlight(`），且未给命令 | N93-2 判据 4 给出可复跑命令 `grep -cE "^::highlight\\("`（现值 **2**、改后 **3**），并说明注释行不参与计数 |

**非阻塞项一并处理**：评审 §3 第 5 条（§0.4「行序由 `groupNotesByDocument` 的 page 升序决定」不准确——实际管道是 `groupNotesByDocument` 分组 → `applyViewToGroups` 的搜索过滤 + `sortNotesForView`，`sortMode = "created"` 会重排组内行序）已按建议改为「判定只看 DOM 顺序」；§3 第 6 条（`pageFocusToken` 不得在注释中出现）已并入 N92-1 判据 5。

**未纳入本步的非阻塞建议（登记，不改档件自洽性）**：`pageNotesProbe` 逐页补 `spanCount > 0` 防空、N94-4 表第 3 行的判定式、外部刷新后「重新出现可匹配摘录 ⇒ 重画」的正向断言、`ANCHOR_LAYER_WAIT_MS` 计数口径放宽（本档只对新增常量 `LOCATE_WAIT_MS` 采用「定义 1 + 使用 ≥ 1」）。

## 0. 定稿登记与冻结契约（设计档、开发档、评审档均不得改写）

### 0.0 本档三项定稿判断（登记；评审可复核，负责人可裁决改判）

1. **N92 的定位方式 = 一次性定位（滚动 + 瞬时高亮），不引入任何过滤维度。** 备选「过滤到该页」未采用：它会新增第二种持久范围过滤（与 R12 的章节过滤互斥、与搜索 / 排序 / 仅看当前文档形成第四维交互），并在「过滤后该页笔记被删空」时强迫新增第四种空态文案；一次性定位的代价更小、语义更直白（「带我去看这一页」而不是「只给我看这一页」）；「返回路径」= 列表**可见集合只可能变宽**：唯一被本动作改动的视图状态是既有章节过滤被**单向清除**（不可一键回退，可由地图徽标重建；`chapterFocusToken` 是一次性信号），搜索 / 排序 / 仅看当前文档 / 选择集 / 阅读位置 / 缩放**零变化**（见 N92-1 判据 2 / 判据 3 与 §0.4「零副作用」「一次性」两行）。若负责人改判为过滤方案，须同时改 §0.4、N92 全节、§0.8 的配额与 `r16-2` 三个相位，并新增「空态文案 + 清除入口」两项需求。
2. **点击页标记会清除既有章节过滤（有且仅有这一项视图状态被改动）。** 理由：页标记是**直接寻址**（用户明确指向某一页），而章节过滤是**范围限制**，两者冲突时直接寻址优先；清除是**可见的**（`.notes-chapter-filter` 整块从 DOM 消失、用户可随时用地图徽标重建），不是隐性状态变化。反向口径（保留章节过滤 + 只给提示）登记为备选：UX 上会让用户「点了没反应」，仅在用户正在搜索时保留输入不动（搜索词属于用户正在进行的输入，不代为清空）。若负责人改判：改 §0.4 第 4 行、N92-3 判据 3 与 `r16-2` 相位 `degrade-filters`。
3. **不与 `PdfSearchPanel.vue` 共用实现、本轮不改该文件。** 两处共用的是**约定**而不是**代码**：CSS Custom Highlight API、注册表命名纪律（各自只删自己的名字）、`::highlight()` 样式统一声明在 `PdfViewer.vue` 的全局 style 块内、片段收集 + Range 构造的手法。理由是风险对冲：搜索高亮是 R11 起 223 条测量与多条既有断言的直接对象，本轮零改动即零回归；把 `paintHighlights` / `waitForTextLayer` 抽成共享模块属于重构，应另立轮次（登记为 §9 开放问题 3）。同理，本轮**没有主进程改动**（零新 IPC、`notes.json` 与 `PixApi` 面零改动）⇒ `smoke-notes.mjs`（10 组 65 条）与 stub 面（42 方法）**零改动**，只作回归。另：第二份 `CSS.highlights` 写类型是**刻意重复**——`PdfViewer.vue` 顶层将声明与 `PdfSearchPanel.vue:20` 同名同形的本地别名 `HighlightRegistryWriter`（TS 5.8.3 dom lib 的 `HighlightRegistry` 只声明了 `forEach`，写接口 `set` / `delete` 未声明；工程红线禁 `any`），理由同「不抽 `paintHighlights`」：不新建共享模块、不改 `env.d.ts`。

### 0.1 本轮不得改写的既有冻结项

| 来源 | 冻结内容 | 本轮为什么不得动 |
| --- | --- | --- |
| R11 | **文字层 DOM 结构**：`.pdf-page` 的直接子元素恰三个（`canvas` / `.textLayer` / `.pdf-overlay`，新增标记排在其后）、`.textLayer` 内的 span 集合与文本（pdf.js `TextLayer.render()` 的产出）、`.pdf-page :deep(.textLayer span)` 的 `color: transparent`、`--scale-factor` 的写入时机与取值 | PRD §4.8 明文禁止；文字层是选区几何、搜索高亮与选中即问锚点的共同事实源，任何包裹 / 拆分 / 插入节点都会连带破坏既有断言与读数 |
| R11 | **搜索高亮**：`pix-search` / `pix-search-current` 两个注册表名、`::highlight(pix-search)` / `::highlight(pix-search-current)` 两条样式、`clearHighlights()` 的删除范围、搜索面板的输入 / 上一处 / 下一处 / 关闭控件与其文案、`LAYER_WAIT_TIMEOUT_MS = 5000` | 本轮只允许在**同一全局 style 块内追加**第三条 `::highlight()` 规则；不得改既有两条规则、不得调用 / 清空既有注册表 |
| R3 / R11 | **选区浮层**：`.quick-ask` 及其浮层定位（`emitNotesAsk` / `PdfSelectionQuickAsk.vue` 零改动）、文本选择链路（`document` 的 `selectionchange` → `readerStore.setSelectedText`）、`.capture-mode` 下文字层与 overlay 的 `pointer-events: none` | 标记与高亮都不得拦截选择与点击、不得改变文字层 DOM 与几何：高亮不得插入任何节点；标记是绝对定位的独立 `<button>`（不参与流布局），**允许在自身面积内覆盖 `.textLayer`**（`.textLayer` 是 `inset: 0` 整页层，真实 PDF 正文可铺满页面 ⇒ 右下角常驻标记必然压住部分文字层，登记为取舍）。**既有层叠事实（登记）**：`.page-notes` 与 `.pdf-page-indicator`（`:1244`，`bottom: 12px` 居中）/ `.reader-section`（`:1209`，`bottom: 46px` 居中）/ `.pdf-toolbar`（`:1034`）同为 `z-index: 3` 且 `.pdf-page` 未创建层叠上下文 ⇒ 同层按 DOM 顺序绘制；`.pdf-page-indicator` 与 `.reader-section` 的模板位次在 `.pdf-scroll` 之后 ⇒ 与标记重叠时会压住标记并拦截点击（`.pdf-toolbar` 在 `.pdf-scroll` 之前，不构成「控制件必然在上」）。二者是否重叠取决于页面在视口内的位置与页宽，**不是**可由固定 `right/bottom` 保证的不变量 ⇒ 几何判据只在夹具相位内成立（见 §0.3） |
| R12 | **章节 chip 与上/下一节**：`.reader-section` / `.reader-section-chip` / `.reader-section-prev` / `.reader-section-next` 的字面、位置（`bottom: 46px` 居中）与 `[` `]` 键位语义；`.reader-section` 的 `pointer-events: none` + 子元素 `auto` 模式 | 新增标记的位置必须避开这一块（`r16-1` 的几何判据：标记矩形与 `.reader-section` 不相交） |
| R6 / R11 | **页码 pill**：`.pdf-page-indicator` / `.page-label` / `.page-input` 的文本与 `第 {N} / {M} 页` 格式、`gotoPage` 语义、触底钳制 | 同上（几何不相交判据）；本轮不得改任何跳页行为的既有调用点 |
| R8 / R9 / R10 / R13 / R14 | **笔记面板既有类名与文案**：`.notes-header(-top)` / `.notes-count` / `.notes-export-btn` / `.notes-search*` / `.notes-sort*` / `.notes-filter` / `.notes-chapter-filter*`（含 `清除` 与其 title）/ `.notes-selection-bar` / `.notes-notice` + `.notice-text` / `.notes-undo` / `.notes-export-row` / `.notes-report-*` / `.notes-group*` / `.note-*`（含 `.note-page-badge` 文本 `第 {N} 页`）、`LIST_EMPTY_CLASS` 的映射与五条空态文案、`startCommentEdit` / `saveComment` 的编辑态语义、`countLabel` 四分叉 | 本轮对面板只做**两件加法**：新增 `is-anchored` 类（几何零变化，只改边框色与背景）与一条定位退化提示（复用既有 `.notes-notice.is-error` 容器）；既有文案、DOM 顺序与计数口径逐字不动 |
| R13 / R14 | 取证脚本契约：`ui-shot.mjs` 启动守卫、产物自净（只删 `<OUT_ROOT>/shots`）、结束自检（清单与磁盘双向相等 + 白名单外条目即失败）、`SEL` 与既有场景 / 截图 / label **零删除零改写**、`record` 的「先落测量再抛错」语义 | 本轮只**追加**：`SEL` 4 项、新 helper、`r16-1`…`r16-5`；既有 153 张 / 223 条 / 59 种 label 零缺失 |
| 全局 | 既有类名 `.notes-*` / `.pdf-*` / `.map-*` / `.tree-*` / `.reader-*` 与既有中文文案；`--pix-*` 变量表（**不新增变量**）；`pix/src/main/**` 与 `pix/src/shared/types.ts`（本轮零 IPC，两个文件零 diff）；`pix/package.json`（沿用既有 `smoke:view`，不新增 script） | 取证断言建立在既有字面上；新样式只允许复用既有变量 |

### 0.2 本轮新增冻结项（设计档、开发档、评审档均不得改写）

| # | 项 | 冻结内容 |
| --- | --- | --- |
| 1 | 页面笔记标记（N91） | §0.3 全表：类名 `.page-notes`（`<button type="button">`）、DOM 位次（`.pdf-page` 的直接子元素，排在 `.pdf-overlay` 之后）、文本逐字 `本页 {N} 条`、title 逐字 `本页 {N} 条笔记（摘录 {A} · AI 结论 {B}）；点击定位到笔记面板`、绝对定位（`right: 6px; bottom: 6px; z-index: 3`）、样式逐字、只在计数 > 0 的页渲染，`.pdf-page` / `.textLayer` / `.pdf-overlay` 与既有控件零改动 |
| 2 | 页级计数派生 | `pix/src/renderer/utils/notes-path.ts` 新增唯一纯函数 `countNotesByPage(notes: ReaderNote[], docKey: string \| null): Map<number, PageNoteCount>`：**单次遍历**、键 = 页号（`Number.isInteger(page) && page >= 1`，否则跳过）、只产出 `total > 0` 的页、每次返回新 Map；`PageNoteCount = { total: number; excerpt: number; answer: number }`；组件侧唯一调用点在 `PdfViewer.vue` 的 `computed`（memo），模板每页最多 2 次 `Map` 读取（`has` + `get` 或一次 `get` 两字段），**不得**在模板里调用聚合函数 |
| 3 | 标记点击与定位（N92） | §0.4 全表：store 新增 `pageFocusToken`（单调递增，`resetNotes()` 归 0）/ `pageFocusPage`（一次性载荷，`resetNotes()` 置 null）/ 动作 `focusPageNotes(page)`（守卫 `currentDocKey === null` ⇒ no-op；清除 `chapterFilter`；写载荷后 `pageFocusToken += 1`）；`WorkspacePage.vue` 新增第二个 token watcher（判据与 `chapterFocusToken` 逐字同构）⇒ `leftCollapsed = false` + `selectLeftTab("notes")`；`NotesPanel.vue` 新增 token watcher ⇒ **有界等待**（等 `status === "ready"` 且目标行入 DOM，上限 `LOCATE_WAIT_MS = 3000`；等待窗口覆盖既有 `selectLeftTab("notes")` 触发的 `loadNotes()` loading——该状态把 `.notes-list` 整体移出 DOM；等待期间新一次定位 / 卸载即作废）后定位当前文档组内 `第 {N} 页` 的首行、`scrollIntoView({ block: "center" })`、加 `is-anchored` 类 `ANCHOR_HIGHLIGHT_MS = 2000`；不可达（等待超时 / `status === "error"` / 目标行确实不在 DOM）时 `.notes-notice.is-error` 逐字 `本页笔记不在当前筛选结果中`（loading 不是退化理由） |
| 4 | 原文高亮（N93） | §0.5 全表：注册表名 `pix-note-anchor`（常量 `HIGHLIGHT_NOTE_ANCHOR`）、样式规则逐字（第三条 `::highlight()`，与既有两条同块并存）、**只画当前页**、等待窗口 `ANCHOR_LAYER_WAIT_MS = 2000` + **等待作废语义**（等待期内当前页 / 文档 / 缩放任一变化即丢弃，不写注册表）、清空时机四条、`color: transparent` 必须显式给出；`CSS.highlights` 写接口用本地别名 `HighlightRegistryWriter`（`PdfViewer.vue` 顶层，与 `PdfSearchPanel.vue:20` 同名同形，刻意重复、不抽共享模块） |
| 5 | 匹配规则（N93-1） | §0.6 全表：片段间假分隔符 ⇒ 折叠为单空格；两侧 `\s+` → 单空格 + `trim` + `toLowerCase`；子串匹配；每条摘录每页**最多一处**（首个命中）；重叠按「先到者获胜、后来者整体丢弃」；折叠后长度 > `MAX_ANCHOR_TEXT_LENGTH = 400` 或为空 ⇒ 跳过；不跨页 |
| 6 | 纯函数契约（N95-1） | §0.7 的 `foldText` / `matchExcerpts` 签名、返回结构与 `at` 回溯表语义；新文件 `pix/src/renderer/utils/page-anchor.ts`（零 import 的纯字符串逻辑） |
| 7 | 反需求与配额 | §6 反需求全表；新增配额 = 离屏 **5 场景 / 5 组 / 14 条 record / 13 张截图**、烟测-渲染 **+2 组 16 条**（5 组 35 条 → 7 组 51 条）、烟测-主进程 **零改动**（10 组 65 条回归）（§0.8） |

### 0.3 页面笔记标记（逐字冻结）

| 项 | 逐字值 |
| --- | --- |
| 触发面 | `PdfViewer.vue` 的 `.pdf-page`（模板 `:924-926` 的 `v-for`），对**每一页**判定 |
| 渲染条件 | 该页计数 > 0：计数 = `countNotesByPage(notesStore.notes, notesStore.currentDocKey)` 的 `Map.get(页号)`；`notesStore.currentDocKey === null`（资料库外文件 / 未选库）⇒ 整篇不渲染任何标记；`pageCount === 0` / 文档加载失败 / 非 PDF ⇒ 无 `.pdf-page`，自然无标记 |
| 统计口径 | 「当前文档 + 该页」的全部笔记（`excerpt + answer`），与 R14 树徽标同为**全量口径**：不跟搜索 / 排序 / 章节过滤 / 「仅看当前文档」走（与 `NotesPanel` 的 `.group-count` 过滤后口径**本来就可以不等**，不是缺陷）；笔记页号越界（例如一条 p9 笔记而文档只有 3 页）不渲染任何标记、不钳制、不改写 `notes.json` |
| 类名 | `.page-notes` |
| 元素形态 | `<button type="button" class="page-notes" :title="…" @click="…">`（`<button>` 而非 `<span>`：键盘可聚焦、语义为动作） |
| 文本 | `本页 {{ total }} 条`（例：`本页 2 条`；数字与「条」之间恰一个半角空格；无图标、无「笔记」前缀、无背景色块） |
| `title`（tooltip） | `本页 {{ total }} 条笔记（摘录 {{ excerpt }} · AI 结论 {{ answer }}）；点击定位到笔记面板`（三段恒给，为 0 也写；分隔符 = 半角空格 + `·`(U+00B7) + 半角空格；括号为全角 `（）`；例：`本页 1 条笔记（摘录 1 · AI 结论 0）；点击定位到笔记面板`） |
| DOM 位次 | `.pdf-page` 的**直接子元素**，排在 `.pdf-overlay` **之后**（第 4 个子元素）；只在计数 > 0 的页出现 ⇒ 「有标记的页」子元素数为 4、「无标记的页」仍为 3（既有断言口径） |
| 盒模型与样式（冻结；不新增 `--pix-*` 变量） | `position: absolute; right: 6px; bottom: 6px; z-index: 3; padding: 1px 6px; border: 1px solid var(--pix-border-light, #e3eaf0); border-radius: 999px; background: var(--pix-bg-elevated, #ffffff); box-shadow: var(--pix-shadow-xs); color: var(--pix-text-secondary); font-family: var(--pix-font-ui); font-size: 11px; line-height: 1.4; white-space: nowrap; cursor: pointer;` + 悬停规则 `.page-notes:hover { border-color: var(--pix-border, #d5dfe8); color: var(--pix-text-primary); }` |
| 位置约束（本轮硬约束） | ① 必须**绝对定位**（不参与流布局）：`.pdf-page` 与 `.textLayer` 的盒几何与 R15 基线逐字相同；②③ 是**夹具相位内的几何判据**（`r16-1` 对页 1 / 页 2 / 页 3 逐页判定，不是全局不变量）：标记矩形不得与 `.textLayer` 的任一 span 矩形相交，也不得与 `.pdf-toolbar` / `.pdf-page-indicator` / `.reader-section` / `.pdf-capture-fab` / `.pdf-search-panel`（面板打开时）的矩形相交——本夹具正文全部落在页面顶部区域、页底距阅读区底 ≥ 48px（`.pdf-scroll` 的 `padding-bottom: 48px`）、指示器与章节 chip 水平居中，故该判据成立；真实文档正文可铺满页面、页面贴底或宽于视口时标记可能与同层控件重叠（此时按 §0.1 R3/R11 行登记的层叠事实绘制，指示器 / 章节 chip 会压住标记并拦截点击——登记为取舍）；④ 框选模式：标记仍在（视觉），点击命中被 `.capture-layer`（`z-index: 5`）拦截 —— 不新增任何分支代码 |
| 不渲染的页 | 0 条笔记的页（**零占位**：无空胶囊、无 `0 条`、无占位元素）；`pageCount === 0` 的文档（无页元素）；非当前文档的页 |
| 与既有页结构的关系 | `.pdf-page` / `.pdf-scroll` / `.pdf-page canvas` / `.pdf-page :deep(.textLayer)` / `.pdf-overlay` 的 CSS 与 DOM 前三个子元素零改动；`pageElement` / `observePages` / `updateCurrentPage` / `clearPageLayers` / `captureRegion` / `toLayerPoint` / `onCapturePointerDown` **函数体零 diff**；`releasePage` / `loadPdf` 起始段 / 缩放 watcher / `onBeforeUnmount` **允许各新增 1 处「清空注册表」调用**（既有语句零改写，= §0.5 清空时机 ①②③④ 的唯一落点；`.page-notes` 不进 `querySelectorAll("canvas")` 的查找结果，也不改任何页面矩形的读数） |

### 0.4 标记点击 → 定位笔记（逐字冻结）

| 项 | 逐字值 |
| --- | --- |
| 点击语义 | 点 `.page-notes` ⇒ `notesStore.focusPageNotes(页号)`（唯一入口）；**不跳页、不改缩放、不清文本选择、不切文档、不发任何 IPC、不写盘** |
| store 新增状态 | `pageFocusToken: ref<number>`（单调递增；`resetNotes()` 归 0）、`pageFocusPage: ref<number \| null>`（一次性载荷；`resetNotes()` 置 null）；两者都在 store 的返回对象上暴露 |
| 动作 `focusPageNotes(page)` | ① `currentDocKey === null` ⇒ **no-op**（零副作用；此时标记本就不渲染）；② `chapterFilter.value = null`（见 §0.0 第 2 条；**不清** `searchQuery` / `sortMode` / `currentDocOnly` / 选择集 / `chapterFocusToken`）；③ `pageFocusPage.value = page`；④ `pageFocusToken.value += 1` |
| 面板未打开 / 左栏折叠时的结果（不静默） | `WorkspacePage.vue` 新增 watcher（`pageFocusToken`；判据与既有 `chapterFocusToken` watcher `:215-224` 同构：`token <= 0 \|\| token <= previous` ⇒ return）⇒ `leftCollapsed.value = false` + `selectLeftTab("notes")`（切标签会触发既有 `void notesStore.loadNotes()` ⇒ 定位必须穿过 loading 窗口，见「定位动作」行）；因此「点标记 ⇒ 左栏展开并停在笔记标签、目标行被定位」是**唯一**的可观测结果，不存在「点了没反应」 |
| 目标行 | 面板 DOM 中**当前文档分组**（`group.isCurrentDoc === true`，即该组含「当前文档」chip）内、`.note-page-badge` 文本逐字 `第 {N} 页`（N = `pageFocusPage`）的**第一行**（DOM 顺序）；搜索 / 排序不改变「第一行」的判定（判定只看 DOM 顺序；实际管道 = `groupNotesByDocument` 分组 → `applyViewToGroups` 的搜索过滤 + `sortNotesForView`，`sortMode = "created"` 会重排组内行序，本档不依赖具体行序） |
| 定位动作（**有界等待**，取代原「单次 `await nextTick()`」） | token watcher 命中后：① 取本次 `pageFocusToken` 作为令牌，`deadline = performance.now() + LOCATE_WAIT_MS`（`LOCATE_WAIT_MS = 3000`）；② 按帧轮询（`requestAnimationFrame`）等待「`status === "ready"` 且目标行在 DOM」——必须穿过 `selectLeftTab("notes")` 触发的 `loadNotes()` loading 窗口（`status === "loading"` 时整个 `.notes-list`（含全部 `.note-row`）不在 DOM）；③ 等待期内 `pageFocusToken` 再次变化（新一次定位）或组件卸载 ⇒ **作废本次等待**（丢弃、不滚动、不加类、不提示）；④ `status === "ready"` 且目标行在 DOM ⇒ 执行 `row.scrollIntoView({ block: "center", behavior: prefersReducedMotion ? "auto" : "smooth" })`（`behavior` 判据与 R11 搜索 `scrollToRange` 同款，读 `window.matchMedia("(prefers-reduced-motion: reduce)")`），随后加 `is-anchored` 类；`status === "ready"` 后连续 2 帧仍找不到目标行（搜索 / 章节过滤掉、分组不存在、该页笔记已删除、外部刷新后消失、空态）或 `status === "error"` ⇒ **立即**走退化（不空等满 3s）；⑤ 上限到期（`loadNotes` 长时间不返回）⇒ 走退化 |
| 瞬时高亮 | 类名 `is-anchored`（挂在该行 `.note-row` 上）；样式**只有两条**：`.note-row.is-anchored { border-color: var(--pix-accent, #31424f); background: var(--pix-bg-hover, #eef2f6); }`（不改几何、不加动画 / 过渡 / 变量）；`ANCHOR_HIGHLIGHT_MS = 2000` 后自动移除；下一次定位替换目标行；定时器在 `onBeforeUnmount` 内成对清理 |
| 不可达退化（非静默） | 有界等待结束仍拿不到目标行（目标行不在 DOM：搜索 / 章节过滤掉 / 当前文档分组不存在 / 该页笔记已被删除 / 外部刷新后消失 / 空态 / `status === "error"`；或 `loadNotes` 超 `LOCATE_WAIT_MS` 未返回）⇒ **不滚动、不加类**，弹既有 `.notes-notice.is-error`，文本逐字 `本页笔记不在当前筛选结果中`（复用 `NOTICE_MS = 4000` 的自动消失与既有即时提示语义；不新增第二种提示容器、不新增空态文案、不改 `resolveListEmptyReason`）。**面板 loading 不再列入退化理由**（它在等待窗口内被吸收） |
| 零副作用（可判定式） | 定位前后 `.notes-search-input` 的值 / `.notes-sort-btn` 文本 / `.notes-filter input` 的 `checked` / `.notes-selection-bar` 的存在性与文本 / `.page-label` 文本 / `.zoom-label` 文本 / `notesHash()` 逐字不变；`.notes-chapter-filter` **必须**从「在场」变为「不在 DOM」（唯一被改动的视图状态）。**例外登记**：章节过滤被清除后列表可见集合只可能变宽（行集合与组集合允许随之变化，见 §0.0 第 1 条）；`locate-panel-open` 相位无章节过滤 ⇒ 行集合也零变化 |
| 一次性 | 定位不引入任何持久过滤状态：列表的可见集合由点击后的既有四维（搜索 / 排序 / 章节过滤 / 仅看当前文档）唯一决定；本动作从不收窄列表（唯一变化是既有章节过滤被**单向清除** ⇒ 可见集合只可能变宽；不可一键回退，可由地图徽标重建），可判定式 = 搜索 / 排序 / 仅看当前文档 / 选择集零变化 + `.notes-chapter-filter` 的在场 → 不在 DOM（§0.0 第 1 条） |

### 0.5 原文高亮（逐字冻结）

| 项 | 逐字值 |
| --- | --- |
| 注册表名 | `pix-note-anchor`（`PdfViewer.vue` 内常量 `HIGHLIGHT_NOTE_ANCHOR = "pix-note-anchor"`） |
| 样式规则（新增第三条，落点 = `PdfViewer.vue` 非 scoped style 块内既有两条 `::highlight()` 之后） | `::highlight(pix-note-anchor) { color: transparent; background-color: rgba(49, 66, 79, 0.07); text-decoration-line: underline; text-decoration-style: solid; text-decoration-thickness: 2px; text-decoration-color: rgba(49, 66, 79, 0.75); }` |
| 与搜索高亮的可区分性 | 语义判据（不用计算样式内省）：① 两者注册表名不同、互不删除；② 同屏并存时各自 `size > 0` 且区间文本集合不相同（搜索词 ≠ 摘录）；③ 样式声明不同：`pix-search` 只有背景色、`pix-note-anchor` 有背景色（更浅）+ 下划线 + `color: transparent`（既有两条规则逐字不动） |
| `color: transparent` 的理由 | 文字层 span 本身 `color: transparent`（可见字形由 canvas 提供）；高亮的 `color` 会覆盖该继承值 ⇒ 若不显式给 `transparent`，命中区文字会被真正画出来（与 canvas 字形重影）；`pix-search-current` 的白字是有意的「当前命中」读法，本轮不复制该行为 |
| 绘画范围 | **只画当前页**（`readerStore.page`）；同一时刻注册表最多一组 Range（该页的全部锚点区间合并为一个 `Highlight` 对象）；其它可见页不画（登记为不采用：扩大范围会同时扩大与搜索高亮的层叠面积与性能面，留给后续轮次） |
| 文本来源 | 该页 `.textLayer` 内**按 DOM 顺序**的全部文本节点（与 R11 `paintHighlights` 的取法一致：DOM 是几何事实源）；片段 = 文本节点的 `nodeValue`，片段间插入假分隔符（见 §0.6） |
| 匹配入口 | 每页一次：`foldText(parts)` → 该页摘录集合 → `matchExcerpts(folded, excerpts)`；匹配失败 / 无摘录 / 无文字层 ⇒ **删除**注册表（`CSS.highlights.delete("pix-note-anchor")`），即 `CSS.highlights.has("pix-note-anchor") === false` 为「无高亮」的唯一判据 |
| 等待文字层 | 页面文字层尚未出现首个 `span` 时按帧轮询等待，上限 `ANCHOR_LAYER_WAIT_MS = 2000`（`performance.now()` 判据）；超时即放弃本次绘画（静默：不报错、不弹提示、不写日志、不重试、不阻塞滚动）；等待期间不做任何 DOM 写入；**作废语义（M10）**：等待期内当前页 / 文档 / 缩放任一变化（或发了新一次重画）⇒ 本次等待**作废**（丢弃结果、不写注册表、不重试）——实现 = 每次「重画当前页」自增一次性令牌，等待轮询与回调先核对令牌（与 R11 `revealToken` 同款，`PdfSearchPanel.vue:193-218`）；无此语义会让旧页的等待在翻页后写出注册表，违反「只画当前页」 |
| 清空时机（四条，逐条可判定） | ① 文档切换（`loadPdf` 开始处）；② 缩放变化（页面重渲染前，与 `releasePage` 同一批）；③ 页面被 release（离开视口 > 4 页，与既有 `releasePage` 同步清注册表，幂等）；④ 组件卸载（`onBeforeUnmount`）；另加 ⑤ 每次重新绘画前先删后画（幂等）。①②③④ 的实现点 = `loadPdf` 起始段 / 缩放 watcher / `releasePage` / `onBeforeUnmount` **各新增 1 处调用**（见 §0.3「与既有页结构的关系」） |
| 绘画触发 | 当前页变化（`readerStore.page`）、笔记列表变化（`notesStore.notes`）、缩放变化、以及该页文字层渲染完成 —— 均收敛到同一个「重画当前页」函数；实现不得为翻页新增定时器或轮询（等待窗口除外） |
| 零结构改动 | 不向 `.textLayer` 插入 / 包裹 / 拆分任何节点；不写内联样式到文字层；不改 `--scale-factor`；不注册任何事件监听到文字层（高亮本身不可点击：本轮不做「点击高亮跳转到笔记」） |
| 性能 | ① 页文本归一结果按页缓存（同一文档内复用；**缩放变化不失效**，与 R11 `textCache` 同口径），文档切换时清空；② 每次翻页最多归一 **1** 页（新当前页）+ 该页每条摘录一次 `indexOf`；③ 离屏阈值见 N93-4（10 次翻页总计 ≤ 6000ms、单次 ≤ 1000ms） |

### 0.6 匹配规则（逐字冻结，best-effort）

| 项 | 规则 |
| --- | --- |
| 折叠（两侧同一份实现） | ① 片段列表以 `"\n"` 连接（**片段间假分隔符**，用于补齐 PDF 文本在行 / 片段边界的断行）；② 对连接后的串做 `\s+` → 单空格 + `trim()`；③ `toLowerCase()`；④ `at[i]` = 折叠文本第 `i` 个字符在**连接后未折叠串**中的下标（假分隔符记 `-1`；折叠掉的空白不占位）；⑤ 空串折叠后为空串 |
| 大小写 | 两侧都 `toLowerCase()`（与 R11 搜索 `needle = term.toLowerCase()` 同口径）；对中文无影响（幂等） |
| 子串 | 折叠域内 `indexOf` 命中（不要求词边界、不做分词、不做模糊匹配、不做正则） |
| 每条摘录的出现次数 | 同一页内**最多标一处** = 首个命中（`indexOf` 的第一次命中）；同一摘录在页内重复出现时不重复标记（避免视觉噪声与重复开销） |
| 多条摘录 | 处理顺序 = `sortNotesForContext` 的产出顺序（既有唯一排序实现：docPathKey → page → createdAt → id；同一页同一文档下即 createdAt → id 升序），先到者获胜；候选区间与已接受区间**重叠**（`start < accEnd && end > accStart`）⇒ **整体丢弃**（不截断、不拼接、不合并） |
| 超长 | 折叠后字符数 > `MAX_ANCHOR_TEXT_LENGTH = 400` ⇒ 跳过该条（不匹配、不报错） |
| 空 / 全空白 | 折叠后为空 ⇒ 跳过 |
| 跨页 | **不跨页**：只在「该摘录所属页 == 被画的页」时参与匹配（本轮只画当前页 ⇒ 等价于「只匹配 `note.page === readerStore.page` 的摘录」） |
| 不可匹配 | 静默降级：不抛错、不弹提示、不写日志、不重试、不占位（该页的其它可匹配摘录照常标出） |
| 已知取舍（登记） | 假分隔符会**引入**原文中不存在的空格 ⇒ 理论上可能造成「跨片段拼接出的伪命中」；同时它也是「页 1 摘录跨两行仍能命中」的唯一手段（本夹具的 `n-current-1` 正是这种情形）。若负责人后续要求更严格，须另立轮次引入 `getTextContent` 的 `transform` 几何判定（本轮不做） |

### 0.7 纯函数契约（逐字冻结，`pix/src/renderer/utils/page-anchor.ts` 新建）

```ts
/** 折叠文本与回溯表：text = 折叠域；at[i] = 折叠文本第 i 个字符在「连接后未折叠串」中的下标；假分隔符记 -1。 */
export interface FoldedText {
  text: string;
  at: number[];
}

/** 折叠域内的命中区间（start 含、end 不含，单位 = 折叠域下标）。 */
export interface AnchorRange {
  key: string;
  start: number;
  end: number;
}

/** 一条待匹配的摘录：key 由调用方给出（本轮 = note.id），text = 摘录原文。 */
export interface AnchorExcerpt {
  key: string;
  text: string;
}

/** 折叠后字符数上限：超过即跳过该条摘录。 */
export const MAX_ANCHOR_TEXT_LENGTH = 400;

/** 片段列表 → 折叠文本 + 回溯表（§0.6 第 1 行五条规则的唯一实现点）。 */
export function foldText(parts: string[]): FoldedText;

/** 页面折叠文本 × 摘录列表 → 已接受的命中区间（§0.6 的全部规则：首个命中、重叠丢弃、超长 / 空跳过）。 */
export function matchExcerpts(page: FoldedText, excerpts: AnchorExcerpt[]): AnchorRange[];
```

| 项 | 冻结 |
| --- | --- |
| 依赖 | 该文件**零 import**（纯字符串逻辑，不依赖 `@shared/types`、不依赖 DOM、不依赖 `pdfjs-dist`） |
| 纯性 | 不改入参、不读全局、不抛错；同一入参两次调用返回等值但**不同对象**（`foldText` 的 `text` / `at` 每次新建） |
| 折叠域 → 原文域的映射 | 由调用方（`PdfViewer.vue`）用 `page.at` 完成：起点 = `at[start]`，终点 = `at[end - 1] + 1`（`start` / `end - 1` 处必为真实字符，因为两侧都 `trim` 过 ⇒ 假分隔符不可能落在区间端点）；再按片段表换算成 `{ node, offset }` 并建 `Range` |
| 归属 | 这是「原文锚点」的**唯一**匹配实现点；`pix/src` 内不得出现第二份空白折叠 / 子串匹配（`grep -rn "matchExcerpts"` 与 `grep -rn "foldText"` 各只命中本文件 + `PdfViewer.vue` + 烟测脚本） |

### 0.8 冻结的类名 / 常量 / 名字清单与新增配额

| 选择器 / 名字 | 含义 |
| --- | --- |
| `.page-notes` | 页面笔记标记（§0.3；`<button>`、绝对定位右下角、文本 `本页 {N} 条`） |
| `.note-row.is-anchored` | 定位到的笔记行（§0.4；只改边框色与背景，几何零变化） |
| `pix-note-anchor` | 原文锚点高亮注册表名（§0.5；常量 `HIGHLIGHT_NOTE_ANCHOR`） |
| `countNotesByPage` / `PageNoteCount` | 页级计数派生唯一实现点与返回元素类型（`notes-path.ts`） |
| `foldText` / `matchExcerpts` / `FoldedText` / `AnchorRange` / `AnchorExcerpt` / `MAX_ANCHOR_TEXT_LENGTH` | 匹配纯函数与类型（`page-anchor.ts`，§0.7） |
| `focusPageNotes` / `pageFocusToken` / `pageFocusPage` | 定位动作与一次性信号（`notes-store.ts`；两个 ref 必须在 store 返回对象上暴露） |
| `ANCHOR_LAYER_WAIT_MS` | 等待文字层的上限（`PdfViewer.vue`，值 **2000**） |
| `ANCHOR_HIGHLIGHT_MS` | 定位行瞬时高亮的时长（`NotesPanel.vue`，值 **2000**） |
| `LOCATE_WAIT_MS` | 定位动作的有界等待上限（`NotesPanel.vue`，值 **3000**；计入规则 = 定义 1 + 使用 ≥ 1） |
| `HighlightRegistryWriter` | `CSS.highlights` 写接口的本地类型别名（`PdfViewer.vue` 顶层；与 `PdfSearchPanel.vue:20` 同名同形，刻意重复；不新建文件、不改 `env.d.ts`） |
| 文案（逐字） | `本页 {N} 条` / `本页 {N} 条笔记（摘录 {A} · AI 结论 {B}）；点击定位到笔记面板` / `本页笔记不在当前筛选结果中` |
| `ui-shot.mjs` 的 `SEL` 新增 **4** 项（60 → 64） | `pageNotes: ".page-notes"` / `noteRowAnchored: ".note-row.is-anchored"` / **`pageBoxOne: '.pdf-page[data-page="1"]'`** / `notePageBadge: ".note-page-badge"`；既有 `pdfPageOne`（`:59` = `.pdf-page[data-page="1"] .textLayer span`）**逐字不动**（4 处既有使用 `:1345` / `:1381` / `:1429` / `:1457`） |
| `ui-shot.mjs` 的 stub | **零改动**（不新增方法 / 不新增控制口；`api` 面恒 42 方法）；复用既有 `triggerWindowFocus()` `:8404`、`appendExternalNote(note)` `:8489`、`writeNotesOutside(list)`、`readNotes()`、`notesHash()`、`notesLoadCalls()`、`enterNotesProbe(seed, rows)`、`clickNext/clickPrev`、`clickMapBadge(name)`、`setSearch(text)`（**仅笔记面板** `.notes-search-input`）、`deleteRowByText(needle)`、`clickUndo()`、`notesNotice()`；PDF 搜索面新增 3 个 helper（`pdfSearchSet` / `pdfSearchNext` / `pdfSearchClose`，字面量选择器，见 N95-2） |
| 新场景名 / 组名 / 条数 | `r16-1`…`r16-5`；`r16-page-badge` **3** / `r16-page-anchor` **3** / `r16-note-highlight` **3** / `r16-highlight-coexist` **2** / `r16-degrade` **3** = **14 条** |
| 新截图（冻结，13 张） | `r16-1-page-badges.png`、`r16-1b-page-badges-other-doc.png`、`r16-2-page-anchor.png`、`r16-2b-page-anchor-tab-switch.png`、`r16-2c-page-anchor-filter-degrade.png`、`r16-3-note-anchor.png`、`r16-3b-note-anchor-unmatched.png`、`r16-3c-note-anchor-after-zoom.png`、`r16-4-anchor-with-search.png`、`r16-4b-anchor-after-search-closed.png`、`r16-5-zero-page-notes.png`、`r16-5b-no-text-layer.png`、`r16-5c-after-external-refresh.png` |
| 新烟测组与条数（冻结，不得减少） | `notes-by-page` **6** / `excerpt-match` **10**（追加在既有 5 组 35 条之后 ⇒ 7 组 51 条）；`smoke-notes.mjs` 零改动 |

### 0.9 回归基线、零缺失与允许的位移

| 项 | R16 冻结口径 |
| --- | --- |
| 零缺失参照基线 | `C:/Users/86157/AppData/Local/Temp/pix-v05-r15-final/shots`：153 张 png（`MANIFEST.shots[].name`）、223 条测量、59 种 label（本档已逐项复读） |
| 动工前自建基线 | 在新目录 `PIX_SHOT_ROOT=<临时目录>/pix-v05-r16-base` 实跑一次（PRD §5.1：每轮动工前跑基线离屏取证）；本档不跑离屏，读数留给设计 / 开发步 |
| 零缺失判据 | 基线 `MANIFEST.shots[].name` 集合 ⊆ 验收运行集合；基线 `MEASUREMENTS.json` 的 label 集合 ⊆ 验收运行集合（59 种一条不少）；`MANIFEST.json.failure === null`、退出码 0；截图目录与清单双向相等、无白名单外条目 |
| 新增配额 | 截图 **13 张**（153 → 166）、record **14 条**（223 → 237）、新 label **5 种**（59 → 64） |
| 允许的位移与内容变更 | **仅** ① 有笔记的页新增一枚 `.page-notes`（既有截图里出现新元素 = 预期内容变化）；② 定位后目标行短暂出现 `is-anchored`（只改边框色与背景，不改几何，2s 后消失）；③ 定位退化时出现 4s 瞬时 `.notes-notice`；④ 高亮出现 / 消失（不改 DOM、不改几何）；⑤ 点击页标记清空章节过滤后 `.notes-chapter-filter` 块消失（仅 `r16-2` 相位内；既有场景不会出现）；⑥ 标记在自身面积内覆盖 `.textLayer` 的像素、遮住局部文字（`.textLayer` 的 DOM 与几何不变；登记取舍，见 §0.1 R3/R11 行）。**不允许**：`.pdf-page` / `.textLayer` / `.pdf-overlay` / `.pdf-scroll` 的任何几何与文本（DOM）变化；`.reader-section` / `.pdf-page-indicator` / `.pdf-toolbar` / `.pdf-capture-fab` 的 `w/h/fontSize/color/background` 任何非预期差异；笔记面板既有元素（含 `.group-count` / `.note-page-badge` / `.notes-count`）的文本与几何变化；既有 measurement 的任何差异；文字层 span 集合的任何变化 |
| 内容目视比对 | 新增 13 张截图必须在 dev 档逐张登记结论（标记是否压住正文 / 是否与既有控件重叠 / 是否出现空胶囊或换行；高亮是否与正文重影、是否与搜索高亮互相破坏） |
| 烟测回归 | `smoke-view.mjs`（既有 5 组 35 条 + 新增 2 组 16 条 = 7 组 51 条）与 `smoke-notes.mjs`（10 组 65 条，零改动）都必须可复跑且全绿（退出码 0）；连续两次运行结果相同 |

---

## 1. N91 页面笔记标记（5 子条）

**用户可见行为**：打开一篇有笔记的 PDF，每一页的右下角（不压正文、不压任何既有控件）多一枚浅色小药丸，写着 `本页 2 条`；鼠标悬停显示「本页 2 条笔记（摘录 1 · AI 结论 1）；点击定位到笔记面板」；没有笔记的页什么都不显示（连占位都没有）；在笔记面板里删掉 / 撤销一条、外部改文件后刷新、切换到另一篇文档，页面上的数字立刻跟着变；缩放、翻页、滚动都不改变这枚标记的位置规则与读数。

### N91-1 标记的字面、位次与渲染条件

**逐字冻结**：§0.3 的「触发面 / 渲染条件 / 统计口径 / 类名 / 元素形态 / 文本 / `title` / DOM 位次 / 不渲染的页」。

**验收判据**

1. 【离屏】`r16-1` 相位 `badges`：`sample-paper.pdf`（3 页）下，页 1 的 `.page-notes` `textContent` 逐字 `本页 1 条`、`title` 逐字 `本页 1 条笔记（摘录 1 · AI 结论 0）；点击定位到笔记面板`；页 2 逐字 `本页 2 条` / `本页 2 条笔记（摘录 1 · AI 结论 1）；点击定位到笔记面板`；页 3 `querySelector` 返回 `null`（**零占位**）；全文 `.page-notes` 计数恰 **2**，且 `.pdf-page` 计数恰 **3**（防空：断言确实在 3 页 DOM 上执行）。
2. 【离屏】`r16-1` 相位 `badges`：有标记的页（页 1 / 页 2）`.pdf-page` 直接子元素类名序列逐字 `["", "textLayer", "pdf-overlay", "page-notes"]`（`<canvas>` 的类名为空串）、无标记的页（页 3）逐字 `["", "textLayer", "pdf-overlay"]`；标记 `position === "absolute"` 且页矩形与 R15 基线读数逐字相同（`w = 595`、`h = 842`；缩放 100%）。
3. 【离屏】`r16-1` 相位 `badges`：三页的标记矩形与 `.textLayer` 内任一 span 矩形**均不相交**（本夹具对每页逐页判定；页 3 无标记则只判页 1 / 页 2），且与 `.pdf-toolbar` / `.pdf-page-indicator` / `.reader-section` / `.pdf-capture-fab` 的矩形均不相交（**夹具口径**：正文集中在页面顶部、页底距阅读区底 ≥ 48px、控件水平居中；不是全局不变量，见 §0.3 位置约束行与 §0.1 R3/R11 行）。
4. 【走查】类名与文案唯一：`grep -rn "page-notes" pix/src | wc -l` = **3**（`PdfViewer.vue` 的模板 1 处 + 样式 `::hover` 两条规则 2 处）；`grep -rn "本页 " pix/src | wc -l` = **2**（文本模板 1 + title 模板 1，同文件）；`grep -rn "page-notes" pix/src/renderer/components/workspace/NotesPanel.vue | wc -l` = **0**。

**文件白名单条目**：`pix/src/renderer/components/workspace/PdfViewer.vue`（修改）。

### N91-2 计数口径与唯一派生（单次遍历 + memo）

**逐字冻结**：§0.2 第 2 条与 §0.3 的「统计口径」。

**验收判据**

1. 【烟测-渲染】组 `notes-by-page` #1：标准种子 + `docKey = "sample-paper.pdf"` ⇒ `Map.size === 2`；`get(1)` 逐字段 `{ total: 1, excerpt: 1, answer: 0 }`；`get(2)` 逐字段 `{ total: 2, excerpt: 1, answer: 1 }`；`get(3) === undefined`。
2. 【烟测-渲染】组 `notes-by-page` #3：越界 / 非法的页号（`page = 0`、`page = -2`、`page = 1.5`、`page = NaN`）**不产生任何键**（与 `countNotesByChapter` 的 `Number.isInteger` 守卫同口径）。
3. 【烟测-渲染】组 `notes-by-page` #4：文档归属与比较键归一 —— `Sample-Paper.PDF` / `sample-paper.pdf\\` 与 `sample-paper.pdf` 合并计入同一 `docKey`；`archive/older-paper.pdf` 的 p7 在 `docKey = "sample-paper.pdf"` 下**不产生键**。
4. 【烟测-渲染】组 `notes-by-page` #5：恒等式 —— 同页 1 摘录 + 1 结论 ⇒ `total === excerpt + answer === 2`，逐值断言（`kind` 只有两态）。
5. 【走查】唯一实现点与单次遍历：`grep -rn "countNotesByPage" pix/src | wc -l` = **3**（`notes-path.ts` 定义 1 + `PdfViewer.vue` 的 import 1 与 `computed` 内调用 1）；`sed -n '/countNotesByPage/,/^}/p' pix/src/renderer/utils/notes-path.ts | grep -c "for ("` = **1**（函数体内无嵌套循环）；`grep -c "for (" pix/src/renderer/utils/notes-path.ts` = **4**（既有 3：`:75` / `:94` / `:118`；新增 1）。
6. 【走查】memo 与 O(1) 取数：`PdfViewer.vue` 内 `countNotesByPage` 的唯一出现处是 `computed` 的回调（`grep -n "countNotesByPage" -A 2 …PdfViewer.vue` 命中 `computed(`），模板对每页最多 2 次 `Map` 读取（`has` + `get`），模板内不出现对 `countNotesByPage` 的调用。

**文件白名单条目**：`pix/src/renderer/utils/notes-path.ts`（新增纯函数）、`pix/src/renderer/components/workspace/PdfViewer.vue`（修改）、`pix/scripts/smoke-view.mjs`（新增断言组）。

### N91-3 更新时机与实时一致

**逐字冻结**：§0.2 第 2 条（数据来源 = `notesStore.notes`；不读盘、不发 IPC、不轮询）。

**验收判据**

1. 【离屏】`r16-1` 相位 `live`：在面板删除 `sample-paper.pdf` 第 2 页的摘录（`deleteRowByText("Table 2 repo")`）⇒ 页 2 标记文本变 `本页 1 条`、title 变 `本页 1 条笔记（摘录 0 · AI 结论 1）；点击定位到笔记面板`；点 `clickUndo()` ⇒ 回到 `本页 2 条` / `摘录 1 · AI 结论 1`；两次读数之间 `.note-row` 计数按 4 / 3 / 4 变化（列表真实变化，标记不是空断言）。
2. 【离屏】`r16-1` 相位 `live`：搜索过滤态（`setSearch("Reproducibility")`，只命中 `archive` 那条）⇒ 页 1 / 页 2 标记的 `textContent` 与 title **逐字不变**（与 R14 树徽标同口径：标记恒示全量，不跟过滤走）；面板 `.notes-count` 与 `.group-count` 确实进入过滤态（防空：两者读数与过滤前不同）；`setSearch("")` 复原。
3. 【离屏】`r16-1` 相位 `other-doc`：切到 `archive/older-paper.pdf`（2 页；该文档唯一的笔记在 p7）⇒ 页 1 / 页 2 均无标记、`.page-notes` 计数 **0**、`.pdf-page` 计数 **2**（防空）；切回 `sample-paper.pdf` 并回到第 1 页 ⇒ 标记恢复 `本页 1 条`（跨文档不残留、回切可恢复）。
4. 【离屏】`r16-1` 相位 `badges`：滚动到第 2 页、再滚回第 1 页、再点两次「放大」（缩放 100% → 120%）⇒ 标记计数与两页文本逐字不变，且标记矩形始终满足 N91-1 判据 3（不压正文 / 不压控件）——缩放与滚动都不改变读数。
5. 【走查】数据面纪律：`grep -rn "notesStat\\|notesLoad\\|notesAdd\\|ipcRenderer" pix/src/renderer/components/workspace/PdfViewer.vue | wc -l` = **0**（PDF 组件不直接调任何笔记 IPC；标记数据只来自 store 的列表），`grep -rniE "setInterval|setTimeout" …PdfViewer.vue` 的新增命中只允许出现在既有缩放合并（`ZOOM_COALESCE_MS`）与文字层等待（`ANCHOR_LAYER_WAIT_MS`）两处。

**文件白名单条目**：`pix/src/renderer/components/workspace/PdfViewer.vue`（修改）。

### N91-4 与既有页结构、框选 / 截图链路零冲突

**逐字冻结**：§0.3 的「位置约束」与「与既有页结构的关系」。

**验收判据**

1. 【离屏】`r16-1` 相位 `badges`：页 1 的 `.textLayer` 的 `span` 计数逐字 **6**（夹具声明值），`pageEl.children.length === 4`（有标记）且 `.pdf-overlay` 仍在位（第 3 个子元素）；`document.querySelector('.pdf-page[data-page="1"] canvas').style.width` 逐字 `595px`。
2. 【走查】既有分支语义不变（判定式）：`git diff -U0 pix/src/renderer/components/workspace/PdfViewer.vue` 中，`.pdf-page` / `.pdf-scroll` / `.pdf-page canvas` / `.pdf-page :deep(.textLayer)` / `.pdf-overlay` / `.capture-layer` 这些**规则名不作为 `+` / `-` 行出现**；`pageElement` / `observePages` / `updateCurrentPage` / `clearPageLayers` / `captureRegion` / `toLayerPoint` / `onCapturePointerDown` 的函数体零 diff；`releasePage` / `loadPdf` 起始段 / 缩放 watcher / `onBeforeUnmount` 内既有语句零改写、只允许**各新增 1 处**「清空注册表」调用（清空时机 ①②③④ 的落点；由既有分支语义不变 + 新增调用点闭合推导框选链路与既有截图零回归）。
3. 【离屏】`r16-1` 相位 `badges`：读 `.page-notes` 的 `z-index` 逐字 `"3"`、`.capture-layer` 的 `z-index` 逐字 `"5"`（框选层仍在上面 ⇒ 框选模式下标记不夺焦）；`readerStore.captureMode` 为真时 `.page-notes` 仍在 DOM（不新增分支）。
4. 【离屏】既有框选场景 `r15-f18`（`:6675-6760`，成功与失败两相位）继续全绿：既有 153 张截图零缺失（标记新增只改变内容、不改几何；`.pdf-page` 的矩形读数由判据 1 钉住）。

**文件白名单条目**：`pix/src/renderer/components/workspace/PdfViewer.vue`（修改）。

### N91-5 边界：0 笔记 / 越界页 / 未选库 / 非 PDF

**逐字冻结**：§0.3 的「不渲染的页」与 §0.1 的既有冻结项。

**验收判据**

1. 【离屏】`r16-5` 相位 `zero-page`：切到 `long-book.pdf`（60 页；该文档 0 条笔记）⇒ `.pdf-page` 计数 **60**（防空）且 `.page-notes` 计数 **0**；点两次「下一页」后再读，仍为 0（不是「只查了第 1 页」的假绿）。
2. 【离屏】`r16-1` 相位 `other-doc`：`archive/older-paper.pdf`（2 页）上 p7 的笔记不渲染任何标记（越界页不钳制、不报错）——`readNotes()` 中该条仍逐字为 `page: 7`（事实源零改写）。
3. 【走查】非 PDF / 无文档路径零新代码：`grep -c "page-notes" pix/src/renderer/components/workspace/ReaderPanel.vue` = **0**、`grep -c "page-notes" pix/src/renderer/pages/WorkspacePage.vue` = **0**（标记只在 `PdfViewer.vue` 内存在；文本文档走 `reader-content` 分支，天然无标记与高亮）。
4. 【离屏】`r16-5` 相位 `zero-page`：`long-book.pdf` 下当前页无任何摘录 ⇒ `CSS.highlights.has("pix-note-anchor") === false`（标记与高亮同为静默），且 `.notes-notice` 为 `null`（不弹提示）。

**文件白名单条目**：`pix/src/renderer/components/workspace/PdfViewer.vue`（修改）。

---

## 2. N92 标记点击 → 到达笔记（3 子条）

**用户可见行为**：点某一页上的 `本页 2 条`，左侧自动展开并停在「笔记」标签，列表滚到这一页的那些摘录上，其中第一行被描上高亮边框（2 秒后恢复常态）；整个列表没有因此被过滤——你还是能看到全部笔记；如果当时左栏是折叠的或停在资料库标签，也一样会被带到笔记面板；如果这一页的笔记正被搜索词挡住，会明确告诉你「本页笔记不在当前筛选结果中」，而不是静默无反应。

### N92-1 点击语义与一次性定位（不新增过滤维度）

**逐字冻结**：§0.4 的「点击语义 / store 新增状态 / 动作 `focusPageNotes` / 一次性 / 零副作用」。

**验收判据**

1. 【离屏】`r16-2` 相位 `locate-panel-open`：`readNotes()` 与 `notesHash()` 在点击前后不变；`.pill-tab.active` 的 `data-tab` 逐字 `notes`（点击前已是）；`.center-pill .pill-label` 逐字 `sample-paper.pdf`、`.page-label` 文本逐字 `第 3 / 3 页`、`.zoom-label` 逐字 `100%`（**不跳页、不改缩放、不切文档**）。
2. 【离屏】`r16-2` 相位 `locate-panel-open`：`.notes-search-input` 的 `value` 逐字 `""`、`.notes-sort-btn` 文本逐字 `排序：页码`、`.notes-filter input.checked === false`、`.notes-selection-bar` 不在 DOM（四维视图状态零变化；**本相位无章节过滤 ⇒ 行集合也零变化**）；`.notes-chapter-filter` 不在 DOM（点击前也没有 ⇒ 未新增状态）。
3. 【离屏】`r16-2` 相位 `degrade-filters`：先 `ensureMapOpen()`（相位入口 `enterCleanWorkspace` 会 `goHome()`，而 `goHome` 会 `setMapOpen(false)` ⇒ 相位开始时地图必关；`.map-row` 只在 `showMap`（`mapOpen && isPdf && mapFits`）为真时渲染；开图后舞台变窄，对本相位其它断言无影响（本章只读列表与标记））→ `clickMapBadge("2. Method Overview")` → `waitChapterFilter("章节：2. Method Overview · 第 2 页", 11)`（防空：过滤确实生效——`11 = 2 条页 2 标准笔记 + 9 条页 2 填充摘录`，不等于全量 14）⇒ 点页 1 的 `.page-notes` ⇒ `.notes-chapter-filter` **不在 DOM**（唯一被改动的视图状态，且是可见的）；目标行（第 1 页行）被定位（`.note-row.is-anchored` 在场）。
4. 【走查】无第二个过滤状态：`grep -rn "pageFilter\\|pageOnly\\|pageRange" pix/src | wc -l` = **0**（本轮的页定位不引入任何持久范围过滤）；`git diff -U0 pix/src/renderer/stores/notes-store.ts` 中新增行含 `chapterFilter.value = null` 恰 **1** 行（在 `focusPageNotes` 内），既有 `focusChapter` / `clearChapterFilter` / `chapterFilter` 的 watcher 逐字不动。
5. 【走查】一次性信号的复位：`resetNotes()` 内出现 `pageFocusToken.value = 0` 与 `pageFocusPage.value = null` 各 1 处（跨工作区不残留）；`grep -c "pageFocusToken" pix/src/renderer/stores/notes-store.ts` = **4**（声明 / 复位 / 递增 / return 各 1）；`grep -rn "pageFocusToken" pix/src | wc -l` = **6 或 7**（`notes-store.ts` 恒 4；`WorkspacePage.vue` 恒 1；`NotesPanel.vue` = 1（仅 watcher 源）或 2（watcher 源 + 等待令牌捕获）——有界等待的令牌实现自由）。（实现内不得在注释中写出该标识符。）

**文件白名单条目**：`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/PdfViewer.vue`（均修改）。

### N92-2 面板未打开 / 左栏折叠时的明确结果（不静默）

**逐字冻结**：§0.4 的「面板未打开 / 左栏折叠时的结果」。

**验收判据**

1. 【离屏】`r16-2` 相位 `locate-panel-closed`：先 `backToLibraryTab()`（活动标签 = `library`）→ 点 `[title="折叠资料库"]` 的 `.pill-icon-btn`（防空：`.layout-left` 的宽度读数与展开时不同）→ 点页 3 的 `.page-notes` ⇒ `waitNotesTab()` 通过（`.pill-tab.active` 的 `data-tab` 逐字 `notes`）且 `.layout-left` 重新有可用宽度（> 200）、无「折叠态残留」。点击后先经过一次既有 `selectLeftTab("notes")` 触发的 `loadNotes()`：`status === "loading"` 期间 `.notes-list` 与全部 `.note-row` 不在 DOM，随后恢复——定位动作在等待窗口内等待（见 N92-3 判据 1），不得假设列表已在 DOM。
2. 【离屏】`r16-2` 相位 `locate-panel-closed`：定位生效（`.note-row.is-anchored` 在场且命中当前文档组内 `第 3 页` 的第一行；定位在既有 `loadNotes()` 的 loading 窗口之后完成）；`notesLoadCalls()` 相对点击前增量 ≤ **1**（允许的增量来自既有 `selectLeftTab("notes")` 的读盘，不是本动作新增的 IPC）；`notesHash()` 不变、`notesAddCalls()` / `notesReportCalls()` 增量为 **0**。
3. 【走查】watcher 与既有同构：`WorkspacePage.vue` 内 `pageFocusToken` 的 watcher 判据逐字为 `token <= 0 || token <= previous`（`grep -c "token <= 0 || token <= previous"` 的增量恰 **1**，即既有 `chapterFocusToken` watcher 那 1 处之外新增 1 处），回调体逐字 `leftCollapsed.value = false; selectLeftTab("notes");`（不出现读过滤状态的路径）。

**文件白名单条目**：`pix/src/renderer/pages/WorkspacePage.vue`、`pix/src/renderer/components/workspace/NotesPanel.vue`（均修改）。

### N92-3 目标行定位、瞬时高亮与不可达退化

**逐字冻结**：§0.4 的「目标行 / 定位动作 / 瞬时高亮 / 不可达退化」。

**验收判据**

1. 【离屏】`r16-2` 相位 `locate-panel-open`（前置：14 条场景种子 ⇒ 目标行初始不在可视区）：定位前读目标行几何 ⇒ `row.top > panel.bottom`（**不在可视区**，防空：证明后面的「可见」不是本来就成立）；点页 3 的 `.page-notes` 后 `waitFor` 到目标行完整可见 ⇒ `row.top ≥ header.bottom - 1` 且 `row.bottom ≤ panel.bottom + 1`（滚动确实发生且不被 sticky 头部遮挡）；`.note-row.is-anchored` 恰 **1** 个且 `is-anchored` 的行 = 当前文档组内 `第 3 页` 的第一行。
2. 【离屏】`r16-2` 相位 `locate-panel-open`：`sleep(2500)` 后 `.note-row.is-anchored` 计数 **0**（`ANCHOR_HIGHLIGHT_MS = 2000` 生效）；期间 `.notes-notice` 为 `null`（定位成功不弹提示）；`getComputedStyle(目标行).borderColor` 与 `background-color` 在 `is-anchored` 期间与之后**不同**（类确实生效且被移走）。
3. 【离屏】`r16-2` 相位 `degrade-filters`：`setSearch("Reproducibility")`（只命中 `archive` 那条 ⇒ `.note-row` 计数 1）后点页 1 的 `.page-notes` ⇒ `.notes-notice.is-error` 在场且 `.notice-text` 逐字 `本页笔记不在当前筛选结果中`、`.note-row.is-anchored` 计数 **0**（不滚动、不加类）、面板滚动位置与搜索过滤后的读数不变（此时 `status === "ready"` 且目标行确实不在 DOM ⇒ **立即**退化，不等满 `LOCATE_WAIT_MS`）；`setSearch("")` 复原后再次点击 ⇒ 定位成功（**退化不是永久失效**）。
4. 【走查】文案唯一且复用既有容器：`grep -rn "本页笔记不在当前筛选结果中" pix/src | wc -l` = **1**；`grep -c "is-anchored" pix/src/renderer/components/workspace/NotesPanel.vue` ≥ **2**（`:class` 绑定 1 + `.note-row.is-anchored` 样式 1；实现自由、语义冻结）；`NotesPanel.vue` 不新增第二种提示容器（`grep -c "notes-notice" …NotesPanel.vue` 的增量 = 0）。
5. 【走查】定时器与等待句柄成对清理：`ANCHOR_HIGHLIGHT_MS` 的 `setTimeout` 在 `onBeforeUnmount`（`:452`）内有对应的 `clearTimeout`；定位等待的 rAF 句柄 / 定时器同样在 `onBeforeUnmount` 内清理（`cancelAnimationFrame` / `clearTimeout`）；既有 `noticeTimer` / `undoRowTimer` / `copyTimer` / `confirmTimer` 的清理逐字不动。
6. 【离屏】`r16-2` 三个相位各自的 `.notes-notice` 断言成立（成功相位 `null`、退化相位逐字文本），且三个相位结束时 `.notes-notice` 均在 4s 内消失（复用既有 `NOTICE_MS`，不新增时长常量）。

**文件白名单条目**：`pix/src/renderer/components/workspace/NotesPanel.vue`（修改）。

---

## 3. N93 原文高亮（best-effort）（5 子条）

**用户可见行为**：停在第 1 页时，这一页上被你摘出来的那句话被一条浅色下划线标出来（与搜索命中的实心灰块明显不同）；改用搜索找同一个词，两种标记同时存在、互不影响；把这句话摘到第 2 页（文档换了位置）、或摘的句子在页面上根本找不到（跨页、被改写）时，什么都不画、什么都不提示；缩放、翻页、切换文档后，标记要么按新的页重新出现，要么安静地消失。

### N93-1 匹配规则（唯一实现点）

**逐字冻结**：§0.6 全表 + §0.7 的 `foldText` / `matchExcerpts` 契约。

**验收判据**

1. 【烟测-渲染】组 `excerpt-match` #1：英文摘录跨两个片段（`["...where the", "attention budget..."]`）⇒ 命中且 `start` / `end` 落在折叠域内，`slice(start, end)` 逐字等于折叠后的摘录（夹具期望值手写）。
2. 【烟测-渲染】组 `excerpt-match` #2：中文摘录（`稀疏注意力在三分之一的预算下保持召回。`）在含中文的页面文本中命中；大小写（`HTML` / `html`）与中英混排同理命中。
3. 【烟测-渲染】组 `excerpt-match` #3：空白差异 —— 摘录与页面两侧分别是「多空格 / 制表 / 换行」的不同写法 ⇒ 结果等价（折叠后同一条命中区间）；`\s+` 只折叠为一个空格，不丢字符、不跨行合并成空。
4. 【烟测-渲染】组 `excerpt-match` #4：跨行（片段边界）与 `trim` —— 摘录首尾带空白、页面片段之间无空格 ⇒ 命中；`at` 回溯表长度 === `text.length`，且 `at` 中非 `-1` 的下标严格递增（结构性不变量）。
5. 【烟测-渲染】组 `excerpt-match` #5：不可匹配（摘录比页面文本更长 / 页面缺少该子串）⇒ 返回空数组（不抛错、不返回近似区间）。
6. 【烟测-渲染】组 `excerpt-match` #6：重复文本 —— 同一摘录在页面出现两次 ⇒ 只返回 **1** 个区间，且 `start` 指向**第一次**出现。
7. 【烟测-渲染】组 `excerpt-match` #7：重叠 —— 两条摘录互为子串（`A` ⊂ `B`，且 `B` 先给）⇒ 保留 `B`、丢弃 `A`；交换输入顺序 ⇒ 保留 `A`、丢弃 `B`（先到者获胜、后来者整体丢弃）。
8. 【烟测-渲染】组 `excerpt-match` #8：超长 —— 折叠后长度 401 的摘录 ⇒ 跳过（不返回区间）；长度恰 400 ⇒ 参与匹配（边界含等于）。
9. 【烟测-渲染】组 `excerpt-match` #9：空 / 全空白摘录 ⇒ 空数组；`matchExcerpts` 返回的顺序 === 输入顺序中被接受的子序（确定性）。
10. 【烟测-渲染】组 `excerpt-match` #10：纯性 —— 入参（`page.text` / `page.at` / 摘录数组）在调用前后逐字不变；两次调用结果 `JSON.stringify` 相等但对象不同；`foldText([])` ⇒ `{ text: "", at: [] }`。
11. 【走查】唯一实现点：`grep -rn "matchExcerpts\|foldText" pix/src | wc -l` = **4**（`page-anchor.ts` 定义 2 + `PdfViewer.vue` import 1 + 调用 1）；`grep -rn "toLowerCase" pix/src/renderer/utils/page-anchor.ts | wc -l` = **1**（大小写折叠只在折叠函数内一处）；`grep -c "for (" pix/src/renderer/utils/page-anchor.ts` ≤ **2**（折叠 1 + 匹配 1，匹配内无嵌套循环）。

**文件白名单条目**：`pix/src/renderer/utils/page-anchor.ts`（新建）、`pix/src/renderer/components/workspace/PdfViewer.vue`（修改）、`pix/scripts/smoke-view.mjs`（新增断言组）。

### N93-2 注册表、样式与「与搜索高亮可区分」

**逐字冻结**：§0.5 的「注册表名 / 样式规则 / 可区分性 / `color: transparent`」。

**验收判据**

1. 【离屏】`r16-4` 相位 `coexist`：同时存在时读 `CSS.highlights`：`get("pix-note-anchor").size ≥ 1`（页 1 恰 **1**）与 `get("pix-search").size ≥ 1`（`retrieval` 全文档仅命中页 1 的 **2** 处 ⇒ 扫描后当前页仍是页 1）**同时成立**；两者的区间文本集合不相同（`Array.from(h, r => r.toString())` 逐元素比较）；`pix-note-anchor` 的区间去空白后逐字等于第 1 页摘录（手写期望串）。
2. 【离屏】`r16-4` 相位 `coexist` + `search-closed`：搜索面板的「下一处」（`pdfSearchNext()`）点击后（搜索高亮更新）`pix-note-anchor` 的 `size` 与区间文本**逐字不变**；关闭搜索面板（`pdfSearchClose()`）后 `pix-search` / `pix-search-current` 被搜索面板自己清空、`pix-note-anchor` 仍在（**互不破坏**：各自的 `clearHighlights` 只删自己的名字）。
3. 【走查】注册表纪律与写接口类型：`grep -rn "pix-note-anchor" pix/src | wc -l` = **2**（`PdfViewer.vue` 的常量 1 + 样式规则 1）；`grep -rn "pix-search" pix/src | wc -l` 仍为 **4**（既有两条样式 + `PdfSearchPanel.vue` 的两个常量，**零增量**）；`git diff -U0 pix/src/renderer/components/workspace/PdfSearchPanel.vue` 为空；`CSS.highlights` 写接口用本地别名 `HighlightRegistryWriter`（`PdfViewer.vue` 顶层声明，形式与 `PdfSearchPanel.vue:20` 逐字同形），`grep -c "HighlightRegistryWriter" …PdfViewer.vue` ≥ **2**（声明 1 + `set` / `delete` 的断言处 ≥ 1）；**不新建文件、不改 `env.d.ts`**（TS 5.8.3 dom lib 的 `HighlightRegistry` 只有 `forEach`）。
4. 【走查】样式入口唯一且既有两条逐字不动：可复跑计数命令 `grep -cE "^::highlight\\(" pix/src/renderer/components/workspace/PdfViewer.vue` = **3**（行首规则；**现值 2**、改后 3；注释行 `:1301` 的 `::highlight() cannot be scoped` 不参与计数；若用字面量 `grep -c "::highlight("` 则改后为 **4**，差 1 = 该注释行）；新增规则的 `cssText` 含 `rgba(49, 66, 79, 0.07)` / `underline` / `rgba(49, 66, 79, 0.75)` / `transparent`（`git diff -U0` 中既有两条规则不作为 `+` / `-` 行出现）。
5. 【离屏】`r16-3` 相位 `anchor-painted`：`pix-search` / `pix-search-current` 均**不在** `CSS.highlights` 中（未开搜索时不产生空注册表），`pix-note-anchor` 的区间 `startContainer` 所属 `.pdf-page` 的 `data-page` 逐字 `"1"`。

**文件白名单条目**：`pix/src/renderer/components/workspace/PdfViewer.vue`（修改）。

### N93-3 绘画时机、等待窗口与清空

**逐字冻结**：§0.5 的「绘画范围 / 文本来源 / 匹配入口 / 等待文字层 / 清空时机 / 绘画触发」。

**验收判据**

1. 【离屏】`r16-3` 相位 `anchor-painted`：进入 `sample-paper.pdf` 第 1 页后（`waitPage(1, 3)`）`waitFor` 到 `CSS.highlights.has("pix-note-anchor")` ⇒ `size === 1`；页 1 的 `.textLayer` 的 `span` 计数仍为 **6**（文字层 DOM 未被插入 / 包裹 / 拆分）；`.textLayer` 内 `mark` 元素计数 **0**；`pageEl.style.getPropertyValue("--scale-factor")` 逐字 `"1"`（未被高亮改动）。
2. 【离屏】`r16-3` 相位 `unmatched-silent`：点「下一页」到第 2 页（该页唯一摘录比页文本更长）⇒ `CSS.highlights.has("pix-note-anchor") === false`、`.notes-notice` 为 `null`、`rendererLogs` 中 `[pdf-viewer]` 前缀的行数相对本相位前**无增量**（不报错、不写日志）；再点「上一页」回第 1 页 ⇒ 注册表恢复 `size === 1` 且区间文本不变（翻页一致性）。
3. 【离屏】`r16-3` 相位 `scale-stable`：点两次「缩小」（100% → 90% → 80%）⇒ `waitFor` 到注册表再次非空 ⇒ 区间文本（去空白）逐字不变、区间仍在页 1、`--scale-factor` 逐字 `"0.8"`、页 1 的 `canvas.style.width` 逐字 `476px`（595 × 0.8，几何独立复算）。
4. 【走查】清空时机四条各有唯一实现点：`css.highlights` 的删除调用在 `PdfViewer.vue` 内汇聚到**一个**函数（`grep -c "HIGHLIGHT_NOTE_ANCHOR" pix/src/renderer/components/workspace/PdfViewer.vue` ≥ **3**：常量、`set`、`delete`），且释放路径（`releasePage`）、文档切换路径（`loadPdf` 起始段）与缩放路径（缩放 watcher）各有 1 处调用；`onBeforeUnmount` 内有 1 处（与既有 `destroyDocument()` 同段）。
5. 【走查】等待窗口的唯一常量与不重试：`grep -rn "ANCHOR_LAYER_WAIT_MS" pix/src | wc -l` = **2**（定义 1 + 使用 1）；`grep -c "LAYER_WAIT_TIMEOUT_MS" pix/src/renderer/components/workspace/PdfSearchPanel.vue` 仍与基线相同（搜索侧的 5000ms 零改动）；实现内不得出现 `setInterval` 或第二次 rAF 重启（`grep -c "setInterval" …PdfViewer.vue` = 0）。
6. 【离屏】`r16-3` 相位 `unmatched-silent` 续段：快速连点 4 次（`clickNext()` / `clickPrev()` / `clickNext()` / `clickPrev()`，两次点击之间**不等待** `.page-label` 更新）⇒ 等 `.page-label` 连续两帧相同（滚动与重画收敛）⇒ 若 `pix-note-anchor` 非空，其区间所属 `.pdf-page` 的 `data-page` 逐字等于当前页号；若当前页无可匹配摘录则 `has === false`；**都不得出现「区间指向非当前页」**（等待作废语义的可判定式）。

**文件白名单条目**：`pix/src/renderer/components/workspace/PdfViewer.vue`（修改）。

### N93-4 性能与缓存（阈值可复跑）

**逐字冻结**：§0.5 的「性能」三条。

**验收判据**

1. 【离屏】`r16-3` 相位 `unmatched-silent` 的续段（性能采样，不新增截图）：以第 1 页为起点，重复 5 轮「点『下一页』→ 等 `.page-label` 逐字 `第 2 / 3 页` → 点『上一页』→ 等 `.page-label` 逐字 `第 1 / 3 页`」= 共 **10** 次点击；每次点击前断言目标按钮 `disabled === false`（3 页夹具下首页 / 末页的按钮会被禁用，禁用 `<button>` 不派发 click ⇒ 不得单调连点）；逐次记录「翻页点击 → 页面 pill 更新」的毫秒数：`maxMs ≤ 1000` 且 `totalMs ≤ 6000`（阈值宽松：夹具页文本 ≤ 6 个片段、摘录 ≤ 2 条，真实值预期 < 100ms；`data` 必须登记 `turns` / `maxMs` / `totalMs`）。
2. 【离屏】`r16-3` 相位 `unmatched-silent` 的续段：该交替序列的 10 次点击**全部**是「回到已访问页」（访问历史已在前面建立：第 1 页 → 第 2 页），逐次读数登记进 `data.revisitMs` 且 `max(revisitMs) ≤ 300ms`（「两次进入同一页」的读数点与序列对齐；离屏只钉住「翻页没有可感知卡顿」的可观测上界，「同一页不重新归一」的存在性由判据 3 的走查判定）。
3. 【走查】O(有界) 工作量：`matchExcerpts` 内每条摘录只调用 1 次 `indexOf`（`grep -c "indexOf" pix/src/renderer/utils/page-anchor.ts` = **1**）；超长门在匹配之前（`MAX_ANCHOR_TEXT_LENGTH` 的使用点早于 `indexOf`）；页文本缓存是 `Map`（键 = 页号，随文档切换清空），`grep -c "textCache.clear\\|new Map<number" …PdfViewer.vue` ≥ 1。
4. 【check】`CHECK_EXIT=0`（新纯函数与组件的类型面全链路必填、无 `any`、无内联动态 import）。

**文件白名单条目**：`pix/src/renderer/components/workspace/PdfViewer.vue`、`pix/src/renderer/utils/page-anchor.ts`（均修改 / 新建）。

### N93-5 零结构改动与零拦截

**逐字冻结**：§0.5 的「零结构改动」与 §0.1 的 R11 两条冻结项。

**验收判据**

1. 【离屏】`r16-3` 相位 `anchor-painted`：页 1 的 `.textLayer` 的 `childNodes` 类型序列与文本集合与高亮出现前逐字相同（探针在同一相位内做「先读基线（该页刚 ready 时）、等锚点就绪、再读」两次读数；因高亮不改 DOM，两个快照必须逐字相等）。
2. 【离屏】`r16-3` 相位 `anchor-painted` 的续段：在页 1 上执行一次真实文本选择（在 `.textLayer` 上用 `Range` + `Selection` 选中一段）⇒ `document.getSelection().toString()` 非空、`.quick-ask` 出现（既有选区浮层链路未被打断）；随后清空选择（防空：两条断言都在同一相位内、同一页上执行）。
3. 【走查】无监听 / 无内联样式注入：`grep -c "addEventListener" pix/src/renderer/components/workspace/PdfViewer.vue` 的增量 = **0**（既有 `selectionchange` / `keydown` 两处不变）；高亮实现内不出现 `style.` 赋值到 `.textLayer`（`getComputedStyle` / `setProperty` 只允许出现在既有的 `--scale-factor` 一处）。
4. 【走查】`PdfSearchPanel.vue` 零 diff、`::highlight(pix-search)` / `::highlight(pix-search-current)` 两条规则零 diff（`git diff -U0` 判定：这两行不作为 `+` / `-` 行出现）。

**文件白名单条目**：`pix/src/renderer/components/workspace/PdfViewer.vue`（修改）。

---

## 4. N94 边界与降级（6 子条，行为必须写死）

> 本节是「静态边界表 + 逐条可判定」：每一条都给出触发方式与期望结果，避免出现「某种情况下产品不说话也不画」的模糊地带。除明确写「提示」的三处外，**一律静默**（不报错、不写日志、不弹提示、不重试）。

### N94-1 无笔记的页 / 无笔记的文档 / 越界页

| 情形 | 写死的行为 |
| --- | --- |
| 某一页 0 条笔记 | 不渲染 `.page-notes`（零占位、零空胶囊）；该页不参与高亮 |
| 整个文档 0 条笔记 | 所有页均无标记；注册表不存在；不弹任何提示 |
| 笔记页号越界（文档被换成更短版本后留下的 p9 笔记） | 不渲染任何标记、不钳制、不改写 `notes.json`；面板照常显示该条（既有行为） |

**验收判据**

1. 【离屏】`r16-5` 相位 `zero-page`：`long-book.pdf`（60 页 / 0 条笔记）下 `.page-notes` 计数 **0**、`CSS.highlights.has("pix-note-anchor") === false`、`.notes-notice` 为 `null`；`data` 登记 `.pdf-page` 计数（防空 = 60）。
2. 【离屏】`r16-1` 相位 `other-doc`：`older-paper.pdf` 的 p7 越界笔记不产生标记，且 `readNotes()` 中该条的 `page` 逐字仍为 `7`。
3. 【走查】零占位：模板内 `.page-notes` 只有 `v-if` 单分支（`grep -c "page-notes" pix/src/renderer/components/workspace/PdfViewer.vue` = 3 = 模板 1 + 样式 2；**不得**出现 `v-else` 占位节点或 `0 条` 分支文案）。

### N94-2 非 PDF 文档 / 文档加载中 / 加载失败 / `pageCount === 0`

| 情形 | 写死的行为 |
| --- | --- |
| 非 PDF（`.md` / `.txt` 等） | `PdfViewer` 不挂载 ⇒ 无标记、无高亮、无新增代码路径 |
| 文档加载中（`isLoading`） | 无 `.pdf-page` ⇒ 无标记；不新增加载态占位文案 |
| 加载失败（错误态） | 无 `.pdf-page` ⇒ 无标记；错误态由既有 `.pdf-error` 承担，本轮不新增文案 |
| `readerStore.pageCount === 0` | 无页元素 ⇒ 标记与高亮均不存在；`countNotesByPage` 仍可被调用但不产生渲染 |

**验收判据**

1. 【走查】`grep -c "page-notes\|pix-note-anchor" pix/src/renderer/components/workspace/ReaderPanel.vue` = **0**、`…/pages/WorkspacePage.vue` = **0**（标记只在 PDF 组件内）。
2. 【离屏】`r16-5` 相位 `zero-page` 的切换路径（从 `sample-paper.pdf` 切到 `long-book.pdf`）覆盖「文档切换」两端的卸载 / 挂载：切走后 `pix-note-anchor` 不存在（文档切换清空），切回后按新文档重算。
3. 【离屏】既有场景零缺失：加载中 / 加载失败 / 文本文档的既有截图（`reader-empty` / `reader-content` / `.pdf-error` 相关场景）在 R16 验收运行中逐张续存、`failure === null`（由零缺失判据判定，不新增断言）。

### N94-3 无文字层（扫描件）与文字层未就绪

| 情形 | 写死的行为 |
| --- | --- |
| 无文字层（扫描件 / 纯图片页） | 标记照常显示（计数不依赖文字层）；高亮**静默降级**：不报错、不弹提示、不写日志、不空转重试；等待窗口 `ANCHOR_LAYER_WAIT_MS = 2000` 到期即放弃本次绘画 |
| 文字层未就绪（加载 / 渲染中） | 高亮**等待**（按帧轮询，最多 2000ms），不阻塞滚动；就绪后补画 |

**验收判据**

1. 【离屏】`r16-5` 相位 `no-text-layer`：第 1 页上先等锚点就绪（防空：`has === true`）→ 用探针清空该页 `.textLayer` 的子节点（模拟扫描件无文字层）→ 点「下一页」再点「上一页」（触发两次重画尝试）→ `sleep(2300)`（> `ANCHOR_LAYER_WAIT_MS`）⇒ `has("pix-note-anchor") === false`、`.notes-notice` 为 `null`、`[pdf-viewer]` 前缀日志增量为 **0**、`.page-notes` 计数仍为 **2**（标记不受文字层影响）。
2. 【离屏】`r16-5` 相位 `no-text-layer` 的续段：点两次「放大」再点两次「缩小」（缩放回到 100% 会 release 并重渲染页面 ⇒ 文字层重建）⇒ `waitFor` 到 `has("pix-note-anchor") === true` 且区间文本（去空白）逐字不变（**降级不是永久失效**）。
3. 【走查】等待实现不写 DOM、不阻塞：等待期间只做 `requestAnimationFrame` 轮询与 `querySelector` 读取；`grep -c "setInterval" …PdfViewer.vue` = **0**；等待上限只有一个常量（判据见 N93-3 #5）。

### N94-4 缩放切换与页面 release

| 情形 | 写死的行为 |
| --- | --- |
| 缩放变化（含 Ctrl+滚轮与工具栏按钮） | 先清空注册表（不留下指向旧节点的区间），页面重渲染完成后按新的文字层重画；匹配结果与缩放**无关**（页文本不随缩放变化） |
| 页面被 release（离开视口 > 4 页） | 该页的文字层被清空 ⇒ 一并清掉注册表（不残留）；回到该页时重画 |
| 缩放级联（滚轮合并窗口 `ZOOM_COALESCE_MS`） | 不在合并窗口内做重复绘画（同一次缩放只画一次） |

**验收判据**

1. 【离屏】`r16-3` 相位 `scale-stable`：缩放 80% 下断言（N93-3 判据 3）成立；`zoomLabel` 逐字 `80%`（防空：确认缩放真的发生）。
2. 【离屏】`r16-3` 相位 `scale-stable` 的续段：点两次「放大」回到 100% ⇒ 注册表区间文本仍逐字不变、`--scale-factor` 逐字 `"1"`、`canvas.style.width` 逐字 `595px`。
3. 【走查】清空点收敛：注册表删除只在一处实现（`HIGHLIGHT_NOTE_ANCHOR` 的 `delete` 调用点唯一），四个新增调用点（`releasePage` / `loadPdf` 起始段 / 缩放 watcher / `onBeforeUnmount`）各调用它 1 次（`grep -c "HIGHLIGHT_NOTE_ANCHOR" …PdfViewer.vue` ≥ 3），既有缩放合并逻辑（`ZOOM_COALESCE_MS` / `pendingZoomDelta`）零 diff。

### N94-5 笔记被外部改动并刷新 / 增删改 / 撤销

| 情形 | 写死的行为 |
| --- | --- |
| 外部改动 + 面板显式刷新（R14 通道） | 标记与高亮按**新列表**重算：被移动页的笔记改变标记所在页；被删除的笔记其高亮消失；新增的摘录在当前页若可匹配则出现高亮；刷新本身只读（不改 `notes.json` 字节） |
| 面板内删除 / 撤销 / 新建摘录 | 标记与高亮实时跟随（同一份 `notesStore.notes`），无额外 IPC |
| 检测失败（R14 失败静默） | 与本轮无关的既有语义保持不变；本轮不新增任何检测或提示 |

**验收判据**

1. 【离屏】`r16-5` 相位 `external-refresh`：用 `writeNotesOutside(标准种子但把 n-current-1 的 page 由 1 改为 3，其余三条逐字不变)` 造外部改动 → `triggerWindowFocus()` → 等 `.notes-stale` → 点 `.stale-refresh` ⇒ ① `.note-row` 计数 **4** 且 `readNotes().length === 4`；② 页 1 **无**标记、页 3 出现 `本页 1 条`（title `本页 1 条笔记（摘录 1 · AI 结论 0）；点击定位到笔记面板`）、页 2 仍 `本页 2 条`；③ 当前页（第 1 页）`has("pix-note-anchor") === false`（那条摘录已不属于本页）；④ 刷新只读：`notesHash()` 在点刷新前后相同、`notesAddCalls()` / `notesReportCalls()` 增量为 0；⑤ `.notes-notice` 为 `null`。
2. 【离屏】`r16-1` 相位 `live`：面板内删除 / 撤销的实时跟随（N91-3 判据 1）。
3. 【走查】不新增数据面：`grep -rn "ipcMain\\|ipcRenderer\\|pixApi" pix/src/renderer/components/workspace/PdfViewer.vue | wc -l` 与 R15 基线相同（仍只有 `libraryReadFile` / `libraryOpenPath` 两处既有调用）；`pix/src/main/**` 与 `pix/src/shared/types.ts` 零 diff。

### N94-6 不可匹配、超长文本、资料库外文件与框选模式

| 情形 | 写死的行为 |
| --- | --- |
| 摘录不可匹配（被改写 / 跨页 / 页文本缺失） | 静默降级（无高亮、无提示、无重试）；该页其它可匹配摘录照常标出 |
| 折叠后长度 > 400 | 跳过该条（不匹配、不报错） |
| `currentDocKey === null`（资料库外文件） | 不渲染任何标记（不猜测归属）；高亮不参与 |
| 框选模式 | 标记仍在（视觉）；点击被 `.capture-layer` 拦截；高亮仍在（不因进入框选而清除） |

**验收判据**

1. 【烟测-渲染】组 `excerpt-match` #5 / #8：不可匹配与超长两条边界（不抛错、返回空数组）。
2. 【离屏】`r16-3` 相位 `unmatched-silent`：第 2 页不可匹配 ⇒ 静默（N93-3 判据 2）；页 1 的可匹配摘录在第 1 页仍被标出（同一文档内「一条匹配一条不匹配」不是全有或全无）。
3. 【离屏】`r16-5` 相位 `no-text-layer` 的续段：恢复后可匹配摘录重新出现（降级不粘滞）。
4. 【走查】`MAX_ANCHOR_TEXT_LENGTH` 定义与使用各 1 处；`grep -rn "MAX_ANCHOR_TEXT_LENGTH" pix/src | wc -l` = **2**（不得在组件内写第二份 400）。

---

## 5. N95 验证面（仓库内可复跑）

### N95-1 渲染层纯函数烟测：扩展 `smoke-view.mjs`（2 组 16 条）

**为什么扩展而不是新建脚本（决策与理由，评审档不得改写本决策）**

1. `countNotesByPage` 落在 `pix/src/renderer/utils/notes-path.ts` —— 该文件**已在**编译面与产物校验集合内，新函数只依赖同文件的 `docPathKey` 与 `@shared/types`（与 R14 的 `countNotesByDocument` 完全同构）。
2. `page-anchor.ts` 是**新文件**，必须同时进入 `files` / `required` / `allowed`（否则编译产物校验会判「多出」）；这是本轮对 R14「编译面零改动」约束的**显式登记变更**（见 §7 白名单第 7 条），不是放松纪律：`required` 与 `allowed` 的**逐项校验逻辑**、`window-global.d.ts` 补丁、`%TEMP%` 自清理、退出码协议全部零改动。
3. 不新建 `smoke-anchor.mjs`：脚手架（tsc 编译、产物集合校验、`check` 计数、自清理）在 `smoke-view.mjs` 已完整，复制它需要新增 npm script ⇒ 触发 `pix/package.json` 改动（本轮登记为不动）。

**冻结的组与条数（不得减少）**：`notes-by-page` **6** 条 + `excerpt-match` **10** 条；追加在既有 5 组（35 条）之后，`main()` 调用顺序固定为 `runSectionHit → runSectionNull → runSectionNav → runSectionFormat → runBadgeCounts → runNotesByPage → runExcerptMatch`。

| 组 | # | 断言（失败即红） |
| --- | --- | --- |
| `notes-by-page` | 1 | 标准 4 条夹具（与 `BADGE_SEED` 同构）+ `docKey = "sample-paper.pdf"` ⇒ `size === 2`；`get(1) = { total: 1, excerpt: 1, answer: 0 }`；`get(2) = { total: 2, excerpt: 1, answer: 1 }`；`get(3) === undefined` |
| | 2 | `docKey === null` ⇒ 空 Map（size 0，不抛错；与 `matchesChapterFilter` 的空键守卫同口径） |
| | 3 | 非法页号跳过：`page = 0` / `-2` / `1.5` / `NaN` 四条笔记 ⇒ 不产生任何键（`size === 0`） |
| | 4 | 归属与比较键：`Sample-Paper.PDF` / `sample-paper.pdf\\` 计入同一 `docKey`；`archive/older-paper.pdf` 的 p7 在 `docKey = "sample-paper.pdf"` 下不产生键 |
| | 5 | 恒等式：同页 1 摘录 + 1 结论 ⇒ `total === excerpt + answer === 2`，逐值断言 |
| | 6 | 输入零改动 + 每次返回新 Map：入参 JSON 逐字不变；`first !== second`；改第一次结果不影响第二次 |
| `excerpt-match` | 1 | 英文摘录跨片段命中：`foldText(["Abstract. We study retrieval over long documents where the", "attention budget is the binding constraint."])` + 摘录 `We study retrieval over long documents where the attention budget is the binding constraint.` ⇒ `matchExcerpts` 返回 1 条区间，`text.slice(start, end)` 逐字等于折叠后的摘录（期望值手写） |
| | 2 | 中文与大小写：中文页文本 + 中文摘录命中；`HTML` / `html` 双向命中（`toLowerCase` 对称） |
| | 3 | 空白差异：摘录与页面分别用多空格 / 制表 / 换行写法 ⇒ 命中区间等价；`\s+` 折叠为恰一个空格 |
| | 4 | 跨行与 `trim`：页面片段之间无空格、摘录首尾带空白 ⇒ 仍命中；`at.length === text.length` 且非 `-1` 的 `at` 严格递增 |
| | 5 | 不可匹配：摘录比页面文本长 ⇒ 返回 `[]`（不抛错、不返回近似区间） |
| | 6 | 重复文本：同一摘录在页面出现两次 ⇒ 恰 1 条区间且 `start` 指向第一次出现 |
| | 7 | 重叠：`A ⊂ B`、B 先给 ⇒ 保留 B 丢弃 A；A 先给 ⇒ 保留 A 丢弃 B（输入顺序决定，确定性） |
| | 8 | 超长边界：折叠后 401 字符 ⇒ 跳过；恰 400 字符 ⇒ 参与匹配（含等于） |
| | 9 | 空 / 全空白摘录 ⇒ `[]`；返回顺序 === 被接受的输入子序 |
| | 10 | 纯性：入参逐字不变；两次调用结果 JSON 相等但对象不同；`foldText([])` ⇒ `{ text: "", at: [] }` |

**验收判据**

1. 【烟测-渲染】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:view` ⇒ 退出码 0、末行逐字 `通过 51 / 失败 0`；连续两次运行结果相同；既有 5 组 35 条零改动。
2. 【走查】只新增：`notes-by-page` / `excerpt-match` 两组函数、常量、夹具（手写期望值）、模块句柄 `noteAnchor` 与其 `require(join(OUT_DIR, "renderer", "utils", "page-anchor.js"))`、`main()` 一行调用；`files` / `required` / `allowed` **只各追加 1 项**（`renderer/utils/page-anchor.ts` 与其编译产物），`allowed` 的其余项、`WINDOW_SHIM`、编译选项、产物逐项校验逻辑、输出与自清理协议零改动。
3. 期望值一律**手写**（不由被测函数生成）；每条失败信息可读（含实际值）。

**文件白名单条目**：`pix/scripts/smoke-view.mjs`（修改）。

### N95-2 离屏场景 `r16-*`（5 场景 / 5 组 / 14 条 record / 13 张截图）

**stub 契约（`ui-shot.mjs`）**

| 项 | 冻结 |
| --- | --- |
| stub `api` | **零改动**（恒 42 方法，与 `PixApi` 42 方法逐字相等）；本轮不新增任何控制口 / 失败注入口 |
| 复用 helper（零改动） | `triggerWindowFocus()` `:8404`、`appendExternalNote(note)` `:8489`、`writeNotesOutside(list)`、`readNotes()`、`notesHash()`、`notesLoadCalls()` / `notesAddCalls()` / `notesReportCalls()`、`enterNotesProbe(seed, rows)` `:5211`、`openRow` `:1706`、`clickNext` / `clickPrev` `:1715-1716`、`clickMapBadge(name)` `:4455`、`waitChapterFilter(text, rows)` `:4480`、`openMap()` `:4376`、`ensureMapOpen()` `:5254`、`has(selector)` `:1613`、`setSearch(text)` `:5220`（**仅笔记面板** `.notes-search-input`；`r16-4` 的 PDF 搜索不得复用它）、`deleteRowByText(needle)` `:5309`、`clickUndo()` `:5349`、`notesNotice()` `:5356`、`backToLibraryTab()` `:4506`、`waitNotesTab()` `:4510`、`rectOfSelector` `:2564`、`groupHeads()` `:5294` |
| 新 helper（命名自由、语义冻结） | `pageNotesProbe(page)`：`.pdf-page[data-page=N]` 的页矩形、`.page-notes` 的文本 / `title` / 矩形 / `position` / `z-index` / 是否存在、该页 `.textLayer` 的 span 矩形集合与 `span` 计数、`.pdf-page` 直接子元素类名序列、既有四个控件（`.pdf-toolbar` / `.pdf-page-indicator` / `.reader-section` / `.pdf-capture-fab`）的矩形、正文相交判定（标记矩形与任一 span 矩形是否有交集）；`anchorProbe()`：`CSS.highlights` 三个名字的 `size` 与区间文本（`Array.from(h, r => r.toString())`）、区间的 `data-page`、当前 `.page-label` 文本、页 1 的 `span` 计数、`--scale-factor`、`canvas.style.width`、`.textLayer` 的文本节点快照、`.notes-notice` 文本、`[pdf-viewer]` 日志行数；`panelRowProbe(page)`：当前文档组（含 `.v-chip` 的组）内 `第 {page} 页` 首行的矩形 / `is-anchored` / 行数 / 打开文档名 / `.notes-panel` 与 `.notes-header` 的矩形；`emptyTextLayer(page)`：清空该页 `.textLayer` 子节点（模拟扫描件）；`pdfSearchSet(text)`：在 `.pdf-search-panel .search-input` 上 focus → 原生 setter 写值 → 派发 `input` 事件（与 `setSearch` 同手法，但**不是**复用 `setSearch`——后者只操作 `.notes-search-input`；写值后由面板自身 300ms debounce 触发全文档扫描）；`pdfSearchNext()`：点 `.pdf-search-panel button[title="下一处"]`（`totalHits === 0` 时该按钮 `disabled`，由相位保证已命中）；`pdfSearchClose()`：点 `.pdf-search-panel button[title="关闭搜索"]`（面板卸载 ⇒ 搜索侧自清注册表）。三者用容器 `SEL.pdfSearchPanel` + 字面量后代选择器 ⇒ **不新增 `SEL` 键** |
| 场景挂载点 | `runReaderStateScenarios` 末尾（`r15-f16` 之后、函数收口 `}` 之前，现 `:9250`）；每个场景自带复位并以其自己的 `restoreStandardSeed()` 收尾 |
| 夹具增量 | ① 现有夹具与 `seedNotes()` **零改动**；② 新增**场景局部种子** `seedR16Focus()`（见 `r16-2`；**恰 14 条** = 标准 `seedNotes()` 4 条**原样保留**（含 `archive/older-paper.pdf` 的 `n-other-1`——`setSearch("Reproducibility")` 唯一命中行的前提）+ 9 条页 2 填充摘录（`id` 前缀 `n-r16-f1`…`n-r16-f9`，`kind: "excerpt"`，`docPath = "sample-paper.pdf"`，`page = 2`，文本不参与本档任何断言）+ 1 条页 3 摘录 `Sparse attention keeps recall at one third of the dense budget,`（`id` 前缀 `n-r16-p3`，`docPath = "sample-paper.pdf"`，`page = 3`）⇒ `sample-paper.pdf` 13 条 + `archive/older-paper.pdf` 1 条 = 14 行）；③ 外部改写仅用既有 `writeNotesOutside(list)` 写「标准种子但 `n-current-1` 的 `page` 由 1 改为 3」（`r16-5`） |
| 既有面 | `SEL` 只**追加** 4 项（60 → 64）；既有场景 / 截图 / label / helper 零删除零改写；新增 5 种 label（59 → 64） |

**场景 `r16-1`（组 `r16-page-badge`，3 条 record，2 张截图）**

前置：`enterNotesProbe()`（标准种子 4 条、`sample-paper.pdf` 第 1 页、面板 4 行）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `badges` | 等 `.page-notes` 计数 2 → 读 `pageNotesProbe(1)` / `(2)` / `(3)` → 截图 `r16-1-page-badges.png`（`rectOfSelector(SEL.pageBoxOne, 8)`） | ① 页 1 / 页 2 文本与 title 逐字（§0.3）；② 页 3 无标记且 `.pdf-page` 计数 3（防空）；③ 子元素类名序列（有标记页 4 个、无标记页 3 个）、标记 `position === "absolute"`、页矩形 `595×842`；④ 标记矩形与三页 `.textLayer` 的 span 矩形均不相交（页 3 无标记只判前两页）、与四个既有控件均不相交；⑤ `.textLayer` 的 `span` 计数页 1 = 6 | `{ phase, pages: { p1, p2, p3 }, controls, spans, overlayIndex }` |
| `live` | `deleteRowByText("Table 2 repo")` → 等页 2 标记变 `本页 1 条` → `clickUndo()` → 等回 `本页 2 条` → `setSearch("Reproducibility")` → 读标记与 `.notes-count` / `.group-count` → `setSearch("")` | ⑥ 删除后 / 撤销后页 2 的文本与 title 逐字；⑦ 两次之间 `.note-row` 计数 4 → 3 → 4（防空）；⑧ 过滤态下标记逐字不变而 `.notes-count` / `.group-count` 确实进入过滤态；⑨ 滚动到第 2 页再回第 1 页后标记读数不变 | `{ phase, afterDelete, afterUndo, rows, filtered, badgeUnderFilter }` |
| `other-doc` | `openRow("older-paper.pdf")` → `waitPdfLoaded()` + `waitPage(1, 2)` → 读 `.page-notes` 计数与 `readNotes()` → 截图 `r16-1b-page-badges-other-doc.png`（整窗）→ 切回 `sample-paper.pdf` + `waitPage(1, 3)` | ⑩ `older-paper.pdf` 下 `.page-notes` 计数 **0** 且 `.pdf-page` 计数 **2**（防空）；⑪ `readNotes()` 中 `n-other-1` 的 `page` 逐字 `7`（越界页零改写）；⑫ 切回后页 1 标记恢复 `本页 1 条` | `{ phase, notesCount, pageCount, outOfRangePage, restored }` |

**场景 `r16-2`（组 `r16-page-anchor`，3 条 record，3 张截图）**

前置：`enterNotesProbe(seedR16Focus(), 14)`（14 行 = 标准 4 条 + 9 条页 2 填充摘录 + 1 条页 3 摘录；页 3 恰 1 条 ⇒ 目标行唯一且初始不在可视区）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `locate-panel-open` | 读页 3 行的初始 `panelRowProbe(3)`（防空：不可见）→ `clickNext()` ×2 + `waitPage(3, 3)` → 点 `.pdf-page[data-page="3"] .page-notes` → `waitFor` 目标行完整可见 → 读 `panelRowProbe(3)` → `sleep(2500)` → 复盘 → 截图 `r16-2-page-anchor.png`（左栏 `rectOfSelector(SEL.layoutLeft)`） | ① 点击前 `row.top > panel.bottom`（防空）；② 点击后 `row.top ≥ header.bottom - 1` 且 `row.bottom ≤ panel.bottom + 1`；③ `.note-row.is-anchored` 恰 1 个且命中当前文档组内 `第 3 页` 的首行；④ 位置 / 缩放 / 文档名不变（`.page-label` 逐字 `第 3 / 3 页`、`.zoom-label` 逐字 `100%`、`.center-pill .pill-label` 逐字 `sample-paper.pdf`）；⑤ 四维视图状态零变化；⑥ `notesHash()` 不变、`notesAddCalls()` / `notesReportCalls()` 增量 0；⑦ 2.5s 后 `is-anchored` 计数 0、期间 `.notes-notice` 为 `null` | `{ phase, before, after, anchored, view, label, hashSame, noticeAfter }` |
| `locate-panel-closed` | `backToLibraryTab()` → 点 `[title="折叠资料库"]` → 读左栏宽度 → 点页 3 的 `.page-notes` → `waitNotesTab()` → 等定位完成（先经过既有 `loadNotes()` 的 loading 窗口：`.note-row` 短暂为 0、`.notes-list` 随后恢复；有界等待上限 `LOCATE_WAIT_MS = 3000`，不得假设列表已在 DOM）→ 读左栏宽度 / 目标行 / 调用计数 → 截图 `r16-2b-page-anchor-tab-switch.png`（整窗） | ⑧ 折叠时左栏宽度读数与展开时不同（防空）；⑨ 点击后活动标签逐字 `notes` 且左栏重新可用（宽度 > 200）；⑩ 目标行被定位（同 ③，且发生在 loading 窗口之后）；⑪ `notesLoadCalls()` 增量 ≤ 1、`notesHash()` 不变、`notesAddCalls()` / `notesReportCalls()` 增量 0 | `{ phase, collapsedWidth, tab, expandedWidth, anchored, loadDelta, hashSame }` |
| `degrade-filters` | `ensureMapOpen()`（相位入口会 `goHome()` ⇒ 地图必关）→ `clickMapBadge("2. Method Overview")` → `waitChapterFilter("章节：2. Method Overview · 第 2 页", 11)` → 点页 1 的 `.page-notes` → 复读章节过滤与目标行 → `setSearch("Reproducibility")` → 点页 1 的 `.page-notes` → 读 `.notes-notice` 与行状态 → 截图 `r16-2c-page-anchor-filter-degrade.png`（左栏）→ `setSearch("")` → 再点一次页 1 标记 | ⑫ 章节过滤在场时点标记 ⇒ `.notes-chapter-filter` 不在 DOM 且目标行（第 1 页行）被定位；⑬ 搜索遮挡时 ⇒ `.notes-notice.is-error` 且 `.notice-text` 逐字 `本页笔记不在当前筛选结果中`、`is-anchored` 计数 0、面板滚动位置不变（`status === "ready"` 且无目标行 ⇒ 立即退化，不等满 3s）；⑭ 清空搜索后再点 ⇒ 定位成功（退化不粘滞） | `{ phase, filterBefore, filterCleared, anchored, notice, anchoredAfter }` |

**场景 `r16-3`（组 `r16-note-highlight`，3 条 record，3 张截图）**

前置：`enterNotesProbe()`（`sample-paper.pdf` 第 1 页；`n-current-1` 可匹配、`n-current-2` 不可匹配、`n-current-3` 为 AI 结论）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `anchor-painted` | 读页 1 的 `.textLayer` 文本快照与 `span` 计数 → `waitFor` 注册表非空 → 读 `anchorProbe()` 与文本快照 → 做一次真实选区 → 清空选择 → 截图 `r16-3-note-anchor.png`（`rectOfSelector(SEL.pageBoxOne, 8)`） | ① `pix-note-anchor` 区间恰 1 条，去空白后逐字等于页 1 摘录（手写期望串）；② 区间所属页 `"1"`；③ `.textLayer` 的 `span` 计数 6、`mark` 计数 0、两次文本快照逐字相同（零结构改动）；④ `--scale-factor` 逐字 `"1"`、`canvas.style.width` 逐字 `595px`；⑤ `pix-search` / `pix-search-current` 不在注册表；⑥ 选区非空且 `.quick-ask` 出现（选择链路未被拦截） | `{ phase, anchor, page, spans, snapshotSame, scaleFactor, search, selection }` |
| `unmatched-silent` | `clickNext()` + `waitPage(2, 3)` → `sleep(400)` 读注册表与日志 → 截图 `r16-3b-note-anchor-unmatched.png`（页 2 区域）→ `clickPrev()` + `waitPage(1, 3)` → `waitFor` 注册表非空 → 读注册表 → **续段（性能采样 + 作废语义，不新增截图）**：① 交替序列：以第 1 页为起点重复 5 轮「点『下一页』→ 等 `.page-label` 逐字 `第 2 / 3 页` → 点『上一页』→ 等 `.page-label` 逐字 `第 1 / 3 页`」= 10 次点击，每次点击前断言目标按钮 `disabled === false`，逐次计时；② 快速连点 4 次（`clickNext()` / `clickPrev()` / `clickNext()` / `clickPrev()`，两次之间不等待）→ 等 `.page-label` 连续两帧相同 | ⑦ 第 2 页（摘录比页文本长）⇒ `has === false`、`.notes-notice` 为 `null`、`[pdf-viewer]` 日志增量 0；⑧ 回第 1 页后区间恢复且文本不变（翻页一致性）；⑨ 10 次翻页 `maxMs ≤ 1000` 且 `totalMs ≤ 6000`，`revisitMs`（= 该 10 次读数，全部为「回到已访问页」）≤ **300ms**（读数一律登记）；⑩ 快速连点后锚点区间的 `data-page` === 当前页（当前页不可匹配时 `has === false`），不得残留旧页区间 | `{ phase, unmatchedRegistry, notice, logDelta, restored, turns, maxMs, totalMs, revisitMs, rapid }` |
| `scale-stable` | 点「缩小」×2 → 等 `.zoom-label` 逐字 `80%` → `waitFor` 注册表非空 → 读 `anchorProbe()` → 截图 `r16-3c-note-anchor-after-zoom.png`（页 1 区域）→ 点「放大」×2 → 等 `100%` → `waitFor` 注册表非空 → 复读 | ⑨ 80% 下区间文本不变、仍在页 1、`--scale-factor` 逐字 `"0.8"`、`canvas.style.width` 逐字 `476px`；⑩ 回到 100% 后逐字回到基线读数（`"1"` / `595px`）；⑪ 两次缩放之间注册表始终指向当前文字层（不残留旧区间） | `{ phase, zoom, scaleFactor, canvasWidth, anchor, restored }` |

**场景 `r16-4`（组 `r16-highlight-coexist`，2 条 record，2 张截图）**

前置：`enterNotesProbe()`，且 `waitFor` 到 `pix-note-anchor` 非空（防空）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `coexist` | 点 `.pdf-toolbar button[title="在文档中搜索"]`（`SEL.pdfSearchBtn`）→ 等 `SEL.pdfSearchPanel` 在场 → `pdfSearchSet("retrieval")`（写 `.pdf-search-panel .search-input`，面板自身 300ms debounce 后全文档扫描）→ 等 `pix-search` 非空 → 读两个注册表 → `pdfSearchNext()`（点 `.pdf-search-panel button[title="下一处"]`）→ 复读 → 截图 `r16-4-anchor-with-search.png`（页 1 区域；`retrieval` 仅命中页 1 的 2 处 ⇒ 当前页不跳） | ① 两个注册表**同时**非空；② 区间文本集合不相同（搜索词 ≠ 摘录）；③ 锚点区间文本去空白后逐字等于摘录；④ 点「下一处」后锚点 `size` 与区间文本逐字不变（搜索更新不破坏锚点）；⑤ 文字层 `span` 计数仍 6（搜索与锚点都不改结构） | `{ phase, anchor, search, current, anchorAfterNext, spans }` |
| `search-closed` | `pdfSearchSet("")`（面板自身 `runSearch` 清空高亮）→ `pdfSearchClose()`（点 `.pdf-search-panel button[title="关闭搜索"]`，面板卸载）→ 等 `SEL.pdfSearchPanel` 不在 DOM → 读注册表 → 截图 `r16-4b-anchor-after-search-closed.png`（页 1 区域） | ⑥ `pix-search` / `pix-search-current` 不在注册表（搜索面板自己清空）；⑦ `pix-note-anchor` 仍非空且区间文本不变；⑧ `.notes-notice` 为 `null` | `{ phase, searchGone, anchorKept }` |

**场景 `r16-5`（组 `r16-degrade`，3 条 record，3 张截图）**

前置：`enterNotesProbe()`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `zero-page` | `openRow("long-book.pdf")` → `waitPdfLoaded()` + `waitPage(1, 60)` → 读 `.page-notes` 计数与 `.pdf-page` 计数 → `clickNext()` ×2 → 复读 → 截图 `r16-5-zero-page-notes.png`（整窗）→ 切回 `sample-paper.pdf` + `waitPage(1, 3)` | ① `.page-notes` 计数 0 且 `.pdf-page` 计数 60（防空）；② 翻两页后仍为 0（不是只查第 1 页）；③ `has("pix-note-anchor") === false`、`.notes-notice` 为 `null`；④ 切回后页 1 标记与锚点恢复（文档切换两端都清得干净、回得来） | `{ phase, notesCount, pageCount, afterTurn, registry, notice, restored }` |
| `no-text-layer` | 等锚点就绪 → `emptyTextLayer(1)` → `clickNext()` + `clickPrev()` → `sleep(2300)` → 读注册表 / 提示 / 日志 / 标记 → 截图 `r16-5b-no-text-layer.png`（页 1 区域）→ 点「放大」×2 + 「缩小」×2（缩放回到 100%，页面重渲染重建文字层）→ `waitFor` 锚点非空 | ⑤ 超时窗口后 `has === false`、`.notes-notice` 为 `null`、`[pdf-viewer]` 日志增量 0（静默、不重试）；⑥ `.page-notes` 计数仍 2（标记不依赖文字层）；⑦ 文字层重建后锚点恢复且区间文本不变（降级不粘滞） | `{ phase, registryAfterTimeout, notice, logDelta, notesCount, restored }` |
| `external-refresh` | `writeNotesOutside(标准种子但 n-current-1 的 page 由 1 改为 3)` → `triggerWindowFocus()` → 等 `.notes-stale` → `notesHash()` 基线 → 点 `.stale-refresh` → 等 `.note-row` 计数 4 → 读页 1 / 页 2 / 页 3 标记 + 注册表 + 计数 | ⑧ 刷新后 `.note-row` 4 行且 `readNotes().length === 4`；⑨ 页 1 无标记、页 3 逐字 `本页 1 条`（title `本页 1 条笔记（摘录 1 · AI 结论 0）；点击定位到笔记面板`）、页 2 逐字 `本页 2 条`；⑩ 当前页（1）`has("pix-note-anchor") === false`；⑪ 刷新只读：`notesHash()` 前后相同、`notesAddCalls()` / `notesReportCalls()` 增量 0；⑫ `.notes-notice` 为 `null` | `{ phase, rows, fileRows, markerP1, markerP2, markerP3, registry, hashSame, notice }` |

**场景末**：每个场景以自己的 `restoreStandardSeed()` 收尾（与 R11 / R12 / R13 / R14 同纪律）。

**验收判据**

1. 【离屏】5 组 record 全绿、13 张截图齐备（少一张即红）；新增 5 种 label 的条数与 §0.8 逐字一致（`r16-page-badge:3` / `r16-page-anchor:3` / `r16-note-highlight:3` / `r16-highlight-coexist:2` / `r16-degrade:3`）。
2. 【走查】既有场景函数体零改动（`git diff` 只显示：`SEL` 4 项、新 helper、`r16-1`…`r16-5`、以及（如需）场景内引用的常量）；既有 153 张截图 / 223 条测量 / 59 种 label 零缺失。
3. 【离屏】新增截图的矩形取法与 R14 一致（整窗无 rect；页级用 `rectOfSelector(SEL.pageBoxOne, 8)` 或整窗；左栏用 `rectOfSelector(SEL.layoutLeft)`；既有 `SEL.pdfPageOne` 保留原义不得用于页级截图）。
4. 【走查】stub 面零改动（`api` 恒 42 方法、无新控制口、无新失败注入口）；`pix/package.json` 零 diff。

### N95-3 基线与零缺失

动工前先跑基线（新目录 `pix-v05-r16-base`）→ 开发后跑验收（另一目录）；判据见 §0.9（R15 交付目录 153 张 / 223 条 / 59 种 label 零缺失、新增 13 张 / 14 条 / 5 种 label 齐备、退出码 0、`failure === null`、允许的位移逐项登记）。

**验收判据**

1. 【离屏】基线目录与验收目录各自的 `MANIFEST.json` / `MEASUREMENTS.json` 读数按 §0.9 逐项比对（`missingShots = []`、`missingLabels = []`）。
2. 【离屏】对页标记与高亮最有判别力的既有场景继续通过：`pdf-text-layer-geometry`（页框与文字层读数）、`page-tracking`（翻页 / 触底钳制）、`scale-restored`（缩放）、R11 的搜索场景（`pix-search` 相关断言）、R12 的 `.reader-section` 与 `r15-f18` 的框选两相位、R13 / R14 的面板与报告场景。
3. 【走查】任何非预期差异（尤其 §0.9 白名单外的位移与样式）必须在 dev 档逐项登记（改哪一项、为什么、基线读数与改后读数）。

### N95-4 工程门与零残留

**验收判据**

1. 【check】`CHECK_EXIT=0`（无 `any`、无内联动态 import、全部顶层 import；新增函数 / 类型全链路必填）。
2. 【走查】`pix/src/main/**` 与 `pix/src/shared/types.ts` **零 diff**（本轮零 IPC）；`pix/package.json`、`package-lock.json`、`pix/build/**`、`packages/**`、electron-builder 配置零 diff；`pix/src/renderer/assets/styles/variables.css` 零 diff（不新增 `--pix-*` 变量）。
3. 【走查】`git status --short` 只出现 §7 白名单内的文件（新建的 `docs/pm/R16-*.md` 与修改的源码 / 脚本）。
4. 【走查】仓库内无临时脚本、无临时产物、无调试日志（PRD §5.10）；`ui-shot.mjs` 的结束自检（截图集合与清单双向相等 + 白名单外条目即失败）继续生效；`smoke-view.mjs` 运行后 `%TEMP%` 自建目录被删除。

---

## 6. 反需求（本轮明确不做）

1. **不做自动滚动**：不得在**没有用户动作**的情况下滚动阅读区或笔记面板（打开文档后不自动滚到某条笔记、笔记变化时不自动滚动、检测到未匹配摘录时不自动滚动）。**登记为允许的例外**：用户显式点击页标记后的面板定位滚动（N92-3）与既有跳转 / 搜索行为；这不是自动滚动，而是对显式点击的直接响应。
2. **不做 OCR、不做跨页文本重建**：不接 OCR / 不调 LLM / 不做版面分析；匹配输入只有该页文字层的现成文本节点，一条摘录只在其所属页内匹配（不跨页拼接、不重建换行、不推断阅读顺序）。
3. **不做「点击高亮跳转到笔记」以外的交互**：高亮**不可点击**（不注册任何监听、不改变 `cursor`、不弹浮层）；不做拖拽编辑、不做右键菜单、不做 hover 卡片、不做「高亮 → 跳页」。N92 的点击面只有页标记这一枚元素。
4. **不改文字层 DOM 结构**：不插入 / 包裹 / 拆分 / 替换文字层的任何节点；不写内联样式到文字层；不改 `--scale-factor` 的写入点与取值。
5. **不拦截选择与既有交互**：标记与高亮都不得抢占 `.textLayer` 的选择手势、不得拦截点击、不得禁用既有控件；进入框选模式不新增任何分支逻辑（点击被既有 `.capture-layer` 拦截即为正确行为）。
6. **不破坏既有搜索高亮**：不改 `pix-search` / `pix-search-current` 的注册表名、样式与删除范围；不改 `PdfSearchPanel.vue`（本轮零 diff）；不把两处实现抽成共享模块（登记为开放问题）。
7. **不改 `notes.json`**：不新增字段、不改 `version`、不改序列化字节、不在本轮的渲染 / 匹配 / 定位路径里写盘（`.pix-read` 的唯一写者纪律不变：写盘只在主进程，本轮主进程零改动）。
8. **不引入依赖、不改 lockfile、不改 `packages/**`、不改 `pix/package.json`、不改 electron-builder 配置**：不引入虚拟滚动库 / 高亮库 / 文本匹配库；匹配与绘画只用仓库内既有能力（CSS Custom Highlight API + 自写纯函数）。
9. **不做主进程改动**：零新 IPC、零新类型、零新 preload 方法（`PixApi` / `api` / stub 面恒 42）；不做文件监听、不做持久化缓存、不写任何索引文件。
10. **不做第二个标记 / 第二种高亮**：页面上只有 `.page-notes` 一枚标记；注册表只有 `pix-note-anchor` 一个；不新增「本页有几条 AI 结论」的第二枚徽标、不做多色笔、不做章节级锚点。
11. **不给标记与高亮加动画 / 过渡 / 新变量**：不新增 `--pix-*` 变量、不加 `transition` / `animation` / 淡入淡出；`is-anchored` 的显示与移除都是瞬时切换（`scrollIntoView` 的 `behavior` 跟随系统 `prefers-reduced-motion`，与 R11 同款，不算动画）。
12. **不改既有面板与既有文案**：不改 `.notes-*` 既有类名与文案、不改 `countLabel` 四分叉、不改空态映射、不新增空态文案、不新增第二种提示容器；本轮对面板只有两处加法（`is-anchored` 类 + 一条复用 `.notes-notice.is-error` 的提示）。
13. **不删除、不重命名、不改写既有离屏场景与截图**（PRD §5.7）：既有 153 张 / 223 条 / 59 种 label 零缺失，只允许追加；`smoke-notes.mjs` 零改动。
14. **不做「每页都算一遍」的实现**：标记计数必须是单次遍历 + `computed`（memo）+ 每页 O(1) 取数；高亮必须是只画当前页 + 按页缓存归一；禁止在模板 / 渲染函数里对每页调用聚合函数或对全量笔记做扫描。

---

## 7. 文件白名单（逐文件 + 改动点）

| # | 文件 | 动作 | 对应需求 | 改动点（不得越界） |
| --- | --- | --- | --- | --- |
| 1 | `pix/src/renderer/utils/notes-path.ts` | 修改 | N91-2 | 新增纯函数 `countNotesByPage(notes, docKey): Map<number, PageNoteCount>` 与接口 `PageNoteCount`（单次遍历、键 = 页号、非法页号跳过、只产出 `total > 0` 的页、每次返回新 Map）；既有 `countNotesByDocument` / `groupNotesByDocument` / `sortNotesForContext` / `matchesChapterFilter` / `rangeContains` / `docPathKey` / `currentDocKey` / `docDisplayName` / `absoluteDocPath` **零改动** |
| 2 | `pix/src/renderer/utils/page-anchor.ts` | **新建** | N93-1 / N93-4 / N95-1 | 只放 §0.7 的纯函数与类型（`foldText` / `matchExcerpts` / `FoldedText` / `AnchorRange` / `AnchorExcerpt` / `MAX_ANCHOR_TEXT_LENGTH`）；**零 import**、零 DOM、不抛错、不改入参 |
| 3 | `pix/src/renderer/components/workspace/PdfViewer.vue` | 修改 | N91-1…N91-5 / N92-1 / N93-2…N93-5 / N94-1…N94-4 / N94-6 | 新增：`useNotesStore` 引入、`pageNotes`（`computed`，唯一 `countNotesByPage` 调用点）、模板 `.page-notes`（`.pdf-page` 第 4 个子元素、`v-if` 单分支）、两条 `.page-notes` 样式、`HIGHLIGHT_NOTE_ANCHOR` 常量 + 第三条 `::highlight()` 规则、`ANCHOR_LAYER_WAIT_MS`、`HighlightRegistryWriter` 本地别名（顶层，不新建文件 / 不改 `env.d.ts`）、锚点绘画实现（页文本缓存 `Map<number, FoldedText>`、等待含作废令牌、清空、重画）、标记点击处理器（调 `notesStore.focusPageNotes`）；**零改动（既有分支语义不变）**：`.pdf-page` / `.pdf-scroll` / `.textLayer` / `.pdf-overlay` / `.capture-layer` 的 CSS、`pageElement` / `observePages` / `updateCurrentPage` / `clearPageLayers` / `captureRegion` / `toLayerPoint` / `onCapturePointerDown` 的函数体、`releasePage` / `loadPdf` / 缩放 watcher / `onBeforeUnmount` 的既有语句（**允许各新增 1 处**清空调用，见 §0.3 / §0.5 清空时机）、`::highlight(pix-search)` 与 `::highlight(pix-search-current)` 两条规则、既有键盘 / 缩放 / 框选 / 页码逻辑 |
| 4 | `pix/src/renderer/stores/notes-store.ts` | 修改 | N92-1 | 新增 `pageFocusToken` / `pageFocusPage`（ref，均在返回对象暴露）与动作 `focusPageNotes(page)`（守卫 + 清 `chapterFilter` + 写载荷 + 递增）；`resetNotes()` 追加两行复位；既有 `focusChapter` / `clearChapterFilter` / `chapterFilter` / `chapterFocusToken` / `groups` / 指纹逻辑 / 竞态令牌语义零改动 |
| 5 | `pix/src/renderer/pages/WorkspacePage.vue` | 修改 | N92-2 | 新增 `pageFocusToken` watcher（与既有 `chapterFocusToken` watcher 同构：判据 + `leftCollapsed.value = false` + `selectLeftTab("notes")`）；`selectLeftTab` / `onOpenNote` / `openDocumentFromLibrary` / 既有 watcher 零改动 |
| 6 | `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | N92-3 | 新增：`pageFocusToken` watcher（**有界等待** `LOCATE_WAIT_MS = 3000`：等 `status === "ready"` 且目标行入 DOM，含 loading 窗口；等待期内新 token / 卸载即作废 + 目标行查找 + `scrollIntoView` + `is-anchored` + `ANCHOR_HIGHLIGHT_MS` 定时器 + 不可达提示）、`is-anchored` 两条样式、`onBeforeUnmount` 内的定时器 / rAF 清理；既有 `.notes-*` 文案与 DOM 顺序、`LIST_EMPTY_CLASS` / `emptyText` / `countLabel` / `setNotice` 语义、编辑态与撤销 / 导出 / 报告逻辑零改动 |
| 7 | `pix/scripts/smoke-view.mjs` | 修改 | N95-1 | 新增 2 组 16 条（`notes-by-page` / `excerpt-match`）、夹具常量、模块句柄 `noteAnchor` 与其 `require`、`main()` 一行调用；`files` / `required` / `allowed` **各追加 1 项**（`page-anchor.ts` 与产物 `renderer/utils/page-anchor.js`）——R14 的「编译面零改动」在此**显式登记变更**：其余校验逻辑、`WINDOW_SHIM`、编译选项、输出与自清理协议、既有 5 组 35 条零改动 |
| 8 | `pix/scripts/ui-shot.mjs` | 修改 | N95-2 | `SEL` 追加 4 项（60 → 64，含 `pageBoxOne`；既有 `pdfPageOne` 逐字不动）；新增 helper（`pageNotesProbe` / `anchorProbe` / `panelRowProbe` / `emptyTextLayer` / `selectionOnPageOne` / `pdfSearchSet` / `pdfSearchNext` / `pdfSearchClose`）与场景局部种子 `seedR16Focus()`（14 条，见「夹具增量」）；新增 `r16-1`…`r16-5`（5 组 14 条 record、13 张截图）；**零改动**：stub 面（42 方法）、既有场景函数体、既有 helper、既有截图与 label |
| 9 | `pix/src/renderer/components/workspace/PdfSearchPanel.vue` | **不改**（登记为不动） | N93-2 / N93-5 | 见 §0.0 第 3 条：本轮不与搜索面板共用实现（零 diff），搜索高亮的注册表 / 样式 / 等待逻辑逐字不动 |
| 10 | `pix/src/main/**`、`pix/src/shared/types.ts`、`pix/scripts/smoke-notes.mjs`、`pix/package.json` | **不改**（登记为不动） | N95-4 | 本轮零 IPC、零类型、零 script：`PixApi` / `api` / stub 面恒 42 方法；`smoke-notes.mjs` 10 组 65 条只作回归 |
| 11 | `docs/pm/R16-*.md` | 新建 | — | 本档（`R16-req.md`）与后续 `R16-design.md` / `R16-review.md` / `R16-dev.md` |

**范围外（任何情况下不动）**：`packages/**`、`package-lock.json`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/src/renderer/assets/styles/**`（含 `variables.css`）、`pix/src/renderer/utils/{outline-notes.ts,notes-view.ts,reading-context.ts}`、`pix/src/renderer/components/workspace/{ReaderPanel,KnowledgeMap,ChatPanel,PdfSelectionQuickAsk,LibraryPanel}.vue`、`pix/src/renderer/stores/{reader-store,reader-state-store,project-store,chat-store}.ts`、`pix/src/main/**`、`pix/resources/**`、`docs/pm/**` 的历史档件、`.gitignore`、`README.md`。

---

## 8. 风险 Top3 与判定方式

**R1「标记计数与笔记事实源 / 页号口径漂移」** —— 最容易出错的是：把「文档级」计数画到每一页（每页都 `3 条`）、把过滤后的可见条数当全量（搜索时数字变小）、忘记排除其它文档的同页号笔记（`archive/older-paper.pdf` 的 p7 画到当前文档）、或用 `===` 直接比较绝对路径而不是 `docPathKey`（大小写 / 斜杠差异导致「笔记在页面上消失」）。

- 判定：烟测-渲染 `notes-by-page` #1/#3/#4/#5（逐页逐字段、非法页号、比较键归一、恒等式）；离屏 `r16-1` 相位 `badges`（三页读数 + 零占位）、相位 `live`（过滤态下标记逐字不变）、相位 `other-doc`（跨文档不串页、越界页零标记）、`r16-5` 相位 `external-refresh`（外部改动 + 刷新后按新列表重算）。
- 失败信号：页 1 与页 2 显示同一个数字；搜索后标记变小；`older-paper.pdf` 的 p7 出现在该文档第 1 页上；删掉一条摘录后页 2 数字不变。

**R2「高亮匹配与文字层 / 搜索高亮互相破坏」** —— 风险集中在三处：向 `.textLayer` 插节点（破坏选区几何与既有断言）、用 `color` 覆盖成非透明（与 canvas 字形重影）、把自己的注册表与 `pix-search` 混用（一侧 `clearHighlights` 清掉另一侧）；此外「等待文字层」若写成定时器轮询或重复重试会造成卡顿与空转。

- 判定：离屏 `r16-3` 相位 `anchor-painted`（区间文本 / 页归属 / `span` 计数 6 / 两次文本快照相同 / 选区与 `.quick-ask` 仍在）、相位 `unmatched-silent`（静默 + 日志增量 0 + 回页恢复）、相位 `scale-stable`（80% 下 `--scale-factor` 与 canvas 宽度独立复算）；`r16-4` 两个相位（注册表并存、区间文本不同、点「下一处」后锚点不变、关闭搜索后锚点仍在）；烟测-渲染 `excerpt-match` 全 10 条。
- 失败信号：命中区文字被画出来（重影）；文字层出现 `mark` / 新增 `span`；关闭搜索后锚点一起消失；第 2 页出现「第 1 页的摘录」高亮；翻页后注册表残留指向旧节点。

**R3「定位与既有过滤 / 面板状态打架」** —— 三种典型翻车：定位被搜索 / 章节过滤挡住却什么都发生（静默失败）；定位顺手清掉了不该清的状态（搜索词 / 排序 / 仅看当前文档 / 选择集）；面板未打开或左栏折叠时点了没反应（用户以为坏掉了）。

- 判定：离屏 `r16-2` 三个相位（目标行完整可见、搜索 / 排序 / 仅看当前文档 / 选择集零变化、章节过滤被清除且是唯一被改动项、搜索遮挡时逐字提示、清空搜索后重试成功、折叠 + 资料库标签下自动切标签且穿过 loading 窗口）；走查 `pageFilter` 零命中与 `chapterFilter` 增量恰 1；`notesHash()` / 调用计数（零写盘、零新增 IPC）。
- 失败信号：点了标记没有任何可见变化；搜索词或排序被顺手清空；面板在资料库标签时点了只改变一个不可见状态；定位后目标行仍被 sticky 头部遮住一半。

**次级风险（不占 Top3）**：① `scrollIntoView` 在面板未切显或列表仍在 loading（`.notes-list` 不在 DOM）时执行会无效 —— 已在 §0.4 写死「有界等待 `status === "ready"` 且目标行在 DOM，上限 `LOCATE_WAIT_MS = 3000`」，并由 `r16-2` 的「目标行完整可见」与 `locate-panel-closed` 的 loading 窗口断言兜住；② 瞬时高亮与 4s 瞬时提示同屏（`is-anchored` 2s / `.notes-notice` 4s，语义不同、都非阻塞，`r16-2` 不断言互斥）；③ `foldText` 的假分隔符引入伪命中（登记在 §0.6 的「已知取舍」，若要收紧须另立轮次引入几何判定）；④ 60 页文档下每页都渲染标记（60 个 `<button>` 的渲染成本极低，且计数是 O(1) 取数 —— 本轮以 `r16-5` 相位 `zero-page` 的 60 页读数与 N93-4 的耗时阈值共同覆盖）；⑤ 高亮等待窗口 `ANCHOR_LAYER_WAIT_MS = 2000` 在极慢机器上可能先到时（结果只是「这一次没画」，回到该页或缩放后会重画，不构成功能缺陷，`r16-5` 相位 `no-text-layer` 的续段正是这条兜底）。

---

## 9. 开放问题（需负责人确认，不阻塞本档定稿）

1. **N92 的定位方式是否改为「过滤到该页」**：本档冻结为一次性定位（滚动 + 瞬时高亮，§0.0 第 1 条）。改成过滤需要新增第二种持久范围过滤、清除入口与空态文案，并重写 §0.4、N92、`r16-2` 三个相位与 §0.8 配额。
2. **点击页标记是否应清除章节过滤**：本档冻结为「清除（有且仅有这一项）」（§0.0 第 2 条），理由是直接寻址优先且清除可见。若改判为「保留过滤 + 只给提示」，改 §0.4 第 4 行、N92-3 判据 3 与 `r16-2` 相位 `degrade-filters`；若改判为「清除章节过滤与搜索词」，需在 N92-1 判据 2 的零副作用清单中删除搜索项。
3. **是否把「片段收集 + Range 构造 + 等文字层」抽成搜索与锚点共用的模块**：本档冻结为**不抽**（`PdfSearchPanel.vue` 零 diff，§0.0 第 3 条）。若要抽，属重构轮次：需 `git diff` 证明搜索高亮行为等价（既有 153 张截图与全部搜索断言零缺失）并新增共用的单元级断言。
4. **高亮是否扩展到「当前可见页」而不只是当前页**：本档冻结为只画当前页（§0.5）。扩到多页需引入可见页判定与多页注册表管理，并新增「同屏两种摘录同时高亮」的断言。
5. **摘录匹配是否要求「词边界」（避免子串误命中）**：本档冻结为纯子串（§0.6），理由是摘录通常成句、误命中概率低且降级代价小；若要词边界，需改 §0.6 与 `excerpt-match` 的 3 条用例（并新增中英文的词边界规则）。
6. **标记的常驻性**：本档冻结为「有笔记即常驻（无关闭开关、不自动隐藏）」。若希望可关闭（例如设置项或一次性隐藏），需新增状态与断言，且不得落在 `notes.json` 或 `reader-state.json` 之外的新文件里。
7. **新增配额**（13 张截图 / 14 条 record / 5 组 + 烟测 2 组 16 条）是否超出本轮容量：如需压缩，优先保留 `r16-1`（标记字面与零占位）、`r16-2`（定位与退化）、`r16-3`（高亮与静默）、`r16-4`（搜索共存）；`r16-5` 的三个相位可各合并为 1 条 record（合并后仍**不得**删除「无文字层静默」「外部刷新后重算」「降级不粘滞」三项判据）。
