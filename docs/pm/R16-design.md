# PiX-Read R16 设计档 · 原文锚点（N91–N95）

> 上游：`docs/pm/R16-req.md`（需求 N91–N95，含 §0 定稿修订 M1–M12 与 §0.0–§0.9 冻结契约）、`docs/pm/R16-review.md`（需求评审 must-fix M1–M12）、`docs/pm/PRD-V0.6.md` §1 缺口 1 / §2 / §4 反需求 4–8 / §5 工程红线 / §7 判据 1、`docs/pm/R13-design.md` 与 `docs/pm/R14-design.md`（**本档的结构范本**：§0 口径与证据面 / §1 契约冻结表 / §2 与既有冻结面的关系 / §3 失败路径表 / §4 文件级清单 / §5 验证方案 / §6 风险 Top3 / §7 开发分工 / §8 视觉验收要点）、`docs/pm/R15-dev.md`（R15 交付终态与基线读数 153 / 223 / 59）。
> 本档是「可直接开工、可判定」的定稿设计：把 R16-req §0.2–§0.9 的冻结契约落到实现层粒度 —— 页标记的逐字 DOM 与样式、页级计数的单次遍历派生、定位动作的 token/载荷/有界等待与退化、匹配纯函数的签名与参考实现（含折叠回溯表与 Range 重建）、`CSS.highlights` 第三注册表的生命周期与作废语义、N94 的十一行分支表、以及烟测 16 条与离屏 5 场景 14 条 record / 13 张截图的逐条判据。
> **本档不改任何代码**，只新增这一份文档；本轮允许的写操作仅 `docs/pm/R16-design.md`。
> **编号映射**：本档按任务书编号 —— §1 契约冻结表 / §2 与既有冻结面的关系 / §3 失败路径表 / §4 文件级清单 / §5 验证方案 / §6 风险 Top3 / §7 开发分工 / §8 视觉验收要点。
> 判定工具（与需求档一致）：【走查】只读 `git status` / `git diff` / `git show` 与文件内容（含 `grep -c` / `grep -rn` 计数）；【check】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error（唯一工程门）；【烟测-渲染】`npm run smoke:view`（既有 5 组 35 条 + 新增 2 组 16 条 = **51 条**）；【烟测-主进程】`npm run smoke:notes`（10 组 65 条，**零改动**，只作回归）；【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + 既有 153 张 / 223 条 / 59 种 label 零缺失 + 新增 5 组 14 条 record 全绿 + 13 张新截图齐备。

---

## 0. 口径与证据面

### 0.1 本档事实基线（写档当天的真实读数：只读核对 + 本步允许的实跑）

| 事实 | 证据（全部为本次真实读数） |
| --- | --- |
| 工作树与 HEAD | `git status --short` ⇒ `?? docs/pm/R16-req.md` / `?? docs/pm/R16-review.md`（本档落盘后追加 `?? docs/pm/R16-design.md`）；`git log --oneline -1` ⇒ `dbc2a58 docs: V0.6 迭代路线与 PRD（R16-R20）` |
| 文件规模（本步 `wc -l`） | `PdfViewer.vue` **1311** / `notes-path.ts` **138** / `stores/notes-store.ts` **535** / `NotesPanel.vue` **1572** / `WorkspacePage.vue` **461** / `PdfSearchPanel.vue` **484** / `ui-shot.mjs` **9407** / `smoke-view.mjs` **587** / `smoke-notes.mjs` **1411** |
| 命名预检（本轮全部为**新增**名字） | `grep -rn … pix/src \| wc -l`：`page-notes` **0** / `pix-note-anchor` **0** / `pageFocusToken` **0** / `pageFocusPage` **0** / `focusPageNotes` **0** / `is-anchored` **0**（`NotesPanel.vue` 内亦 0）；`src/renderer/utils/page-anchor.ts` **不存在**（`ls` 报 `No such file or directory`）；`ui-shot.mjs` 内 `r16` **0** 命中 |
| 既有判据现状值 | `grep -cE "^::highlight\(" PdfViewer.vue` = **2**（改后 **3**）；`grep -c "::highlight(" PdfViewer.vue` = **3**（含注释行，改后 **4**）；`grep -rn "pix-search" pix/src \| wc -l` = **4**；`grep -c "addEventListener" PdfViewer.vue` = **2**；`grep -c "setInterval" PdfViewer.vue` = **0**；`grep -c "notes-notice" NotesPanel.vue` = **1**；`grep -c "is-anchored" NotesPanel.vue` = **0**；`grep -c "for (" notes-path.ts` = **3**（`:75` / `:94` / `:118`） |
| `.pdf-page` 结构（`PdfViewer.vue`，本次逐段实读） | 模板 `:920` `<div v-else ref="scrollEl" class="pdf-scroll" …>` → `:924-926` `<div v-for="(size, index) in pageSizes" :key="index + 1" class="pdf-page" :data-page="index + 1" :style="{ width: cssSize(size.width), height: cssSize(size.height) }">` → 子元素恰三个：`:928` `<canvas />`、`:929` `<div class="textLayer" />`、`:930-932` `<div class="pdf-overlay"><slot name="overlay" :page="index + 1" /></div>` |
| 视图层控件（模板位次与 CSS，本次实读逐字） | `.pdf-toolbar` 模板 `:883` / CSS `:1034`（`top: 40px; right: 12px; z-index: 3`，本步复核）；`.pdf-capture-fab` 模板 `:951` / CSS `:1158`（`position: absolute; left: 12px; bottom: 12px; z-index: 6`）；`.reader-section` 模板 `:964-984` / CSS `:1209`（`bottom: 46px`、水平居中、`z-index: 3`、`pointer-events: none` + 子元素 `auto`）；`.pdf-page-indicator` 模板 `:988` / CSS `:1244`（`bottom: 12px`、水平居中、`z-index: 3`）；`.capture-layer` 模板 `:937-949` / CSS `:1114`（`inset: 0; z-index: 5`） |
| `.pdf-page` / `.textLayer` / `.pdf-overlay` CSS（本次实读逐字） | `.pdf-page` `:1063`（`position: relative; margin: 0 auto 16px; background: #fff; box-shadow: …`）；`.pdf-page canvas` `:1070`（`display: block; position: absolute; inset: 0`）；`.pdf-page :deep(.textLayer)` `:1076`（`position: absolute; inset: 0; overflow: hidden; line-height: 1; opacity: 1; z-index: 1`）；`.pdf-page :deep(.textLayer span)` `:1086-1087`（`position: absolute; color: transparent; white-space: pre; cursor: text; transform-origin: 0 0`）；`.pdf-scroll` `:1056`（`flex: 1; min-height: 0; overflow: auto; padding: 48px 16px 48px`） |
| 全局高亮样式块（本次实读逐字） | `PdfViewer.vue` `:1297-1311` 的非 scoped `<style>`：注释 `:1300-1302`（含 `::highlight() cannot be scoped;`）→ `:1303-1305` `::highlight(pix-search) { background-color: rgba(49, 66, 79, 0.12); }` → `:1307-1310` `::highlight(pix-search-current) { background-color: #31424f; color: #ffffff; }` |
| `PdfViewer.vue` 关键函数与常量（本次实读行号） | `cssSize` `:103`；`pageElement` `:107`；`clearPageLayers` `:181`；`renderPage` `:191`（`--scale-factor` 写在 `:205`，`canvas.style.width` 写在 `:211`）；`releasePage` `:250`；`observePages` `:266`（`rootMargin: "1200px 0px"`、`:280` 离开视口 > 4 页即 `releasePage`）；`updateCurrentPage` `:292`；`scrollToPage` `:324`；`gotoPage` `:333`；`captureRegion` `:567`；`loadPdf` `:637`（起始段 `:637-651`）；`ZOOM_COALESCE_MS = 150` `:776`；scale watcher `:817-828`（`for (const pageNumber of [...renderedPages]) releasePage(pageNumber)` 在 `:820-822`）；`onBeforeUnmount` `:855-874`（`void destroyDocument()` 在 `:873`）；`defineExpose({ gotoPage })` `:876`；`addEventListener` 两处在 `:458`（`selectionchange`）与 `:860`（keydown 经 `setKeydownListener`） |
| 搜索高亮既有实现（`PdfSearchPanel.vue`，本次实读逐字） | `type HighlightRegistryWriter = HighlightRegistry & { set(name: string, highlight: Highlight): HighlightRegistry; delete(name: string): boolean; };` `:18-22`；`HIGHLIGHT_ALL = "pix-search"` `:39`；`HIGHLIGHT_CURRENT = "pix-search-current"` `:40`；`DEBOUNCE_MS = 300` `:41`；`LAYER_WAIT_TIMEOUT_MS = 5000` `:43`；`textCache = new Map<number, string>()` `:85`；`revealToken` `:88`；`highlightRegistry()` `:92`；`clearHighlights()` `:95-98`（只删自己两个名字）；`waitForTextLayer(pageNumber, token)` `:193-218`（`token !== revealToken ⇒ resolve(null)`）；`paintHighlights` `:219-256`（`createTreeWalker(layer, NodeFilter.SHOW_TEXT)` + `indexOf` 循环 + `registry.set`）；模板 `.search-input` `:404`、`button[title="上一处"]` `:411`、`button[title="下一处"]` `:419`、`button[title="关闭搜索"]` `:426`；`onBeforeUnmount` `:389-401`（`clearHighlights()` 在 `:400`） |
| 渲染层笔记 store（`stores/notes-store.ts`，本次实读行号） | `notes` `:97`；`status` `:98`；`chapterFilter` `:120`（`ref<{ title; label; start; end } \| null>`）；`chapterFocusToken` `:122`；`undoScope` `:129` / `reportScope` `:131` / `notesFileSeq` `:133`；`currentDocKey` `:146`；`groups` `:152-158`；`currentDocNoteCount` `:160-168`；`watch(currentDocKey, …)` `:172-175`；`syncNotesFile` `:186-215`；`loadNotes` `:217`（`status.value = "loading"` 在 `:231`；成功分支 `:243` 置 `ready`；失败 `:250` / `:256` 置 `error`）；`resetNotes()` `:402-424`（`chapterFilter.value = null` `:416`、`chapterFocusToken.value = 0` `:418`）；`focusChapter` `:449-453`（守卫 `currentDocKey.value === null` 在 `:450`）；`clearChapterFilter` `:456-458`；`return { … }` `:485-535`（`chapterFilter` 在 `:501`、`chapterFocusToken` 在 `:502`、`resetNotes` 在 `:521`、`focusChapter` 在 `:522`、`clearChapterFilter` 在 `:523`） |
| 笔记面板（`NotesPanel.vue`，本次实读行号） | `NOTICE_MS = 4000` `:29`；`setNotice` `:154`（自动消失定时器 `:162`）；`.notes-panel` CSS `:803`（`overflow-y: auto`）；`.notes-header` CSS `:811-820`（`position: sticky; top: 0; z-index: 2`）；`.notes-count` 模板 `:475`；`.notes-search-input` 模板 `:508`（进入即 `nextTick` focus）；`.notes-sort-btn` 模板 `:523`；`.notes-filter`（`v-switch`）模板 `:528-535`；`.notes-chapter-filter` 块模板 `:537-551`（文本 `章节：{title} · 第 {label} 页`、按钮 `清除` / title `清除章节过滤，恢复全部笔记`）；`.notes-selection-bar` 模板 `:554-571`；`.notes-notice` 模板 `:574` / CSS `:1006`（`.is-error` `:1022`）；`.notes-stale` 模板 `:590-605`；`.notes-loading` 模板 `:638-640`（`status === 'loading'` 分支）；`.notes-list` 模板 `:682` / CSS `:1267`；`.notes-group-head` 模板 `:684`（`group.isCurrentDoc` chip 在 `:689`）；`.note-row` 模板 `:696-702` / CSS `:1326-1337`（`cursor: pointer`）+ `.note-row.selected` `:1360-1363` + `.note-row.confirming` `:1365-1368`；`.note-page-badge` 模板 `:715` / CSS `:1384`；`onMounted` `:448-450`；`onBeforeUnmount` `:452-468`（`noticeTimer` / `undoRowTimer` / `copyTimer` 的成对清理 + `clearDeleteConfirm()`） |
| 工作区页（`WorkspacePage.vue`，本次实读行号） | `openDocumentFromLibrary` `:197-201`；`selectLeftTab` `:204-211`（`if (tab === "library") notesStore.clearNoteSelection();` 在 `:209`；`if (tab === "notes") void notesStore.loadNotes();` 在 `:211`）；`chapterFocusToken` watcher `:215-221`（判据逐字 `if (token <= 0 \|\| token <= previous) return;`，回调体逐字 `leftCollapsed.value = false;` + `selectLeftTab("notes");`）；`onOpenNote` `:224-234`；`onOpenNoteDoc` `:236-238`；`goHome` `:240` 起 |
| 笔记路径工具（`notes-path.ts`，本次实读行号） | `docPathKey` `:18`；`currentDocKey` `:23`；`docDisplayName` `:32`；`absoluteDocPath` `:40`；`PageRange` `:47`；`rangeContains` `:52`；`matchesChapterFilter` `:60`；`NotesBadgeCount` `:66`（`{ total; excerpt; answer }`）；`countNotesByDocument` `:73-84`（R14 范式：单次遍历、只产出 `total > 0`、每次新 Map）；`groupNotesByDocument` `:87`；`sortNotesForContext` `:130-137` |
| 离屏脚本关键锚点（`ui-shot.mjs`，本次实读行号） | `WINDOW = { width: 1600, height: 1000 }` `:44`；`const SEL = {` `:47` … `};` `:113`（**60** 项：基础 24 + R10 7 + R11 11 + R12 8 + R13 4 + R14 6；其中 `pdfPageOne` 在 `:59` = `.pdf-page[data-page="1"] .textLayer span`，`pdfSearchPanel` 在 `:82`，`layoutLeft` 在 `:89`，`pageIndicator` / `pageInput` / `readerSection` 在 R12 段）；`SAMPLE_PAGES` `:211-232`；`OLDER_PAGES` `:234` 起；`SAMPLE_OUTLINE` `:269` 起；`seedNotes()` `:332-379`（4 条）；`writeFixtures()` `:382-400`；`sleep` `:497`；`readNotesFile` `:503`；`buildStub()` `:407` 起（`api` 面 **42** 方法）；`repaint(win)` `:1258`；`capturePage(win, name, rect)` `:1263-1271`；`runReaderStateScenarios` `:1586` 起；`waitFor` `:1593`（轮询 120ms）；`record(label, data, failures)` `:1604-1608`（**先落测量再抛错**）；`textOf` `:1609`；`has` `:1613`；`countOf` `:1614`；`waitPdfLoaded` `:1665`；`waitPage(page, count)` `:1666`；`goHome` `:1681`；`enterWorkspace` `:1691`；`openRow` `:1706`；`clickNext` `:1715` / `clickPrev` `:1716`；`readNotes` `:2375`；`notesHash` `:2376`；`rectOfSelector(selector, pad)` `:2564-2580`；`rowFinder` `:2963`；`enterCleanWorkspace` `:3392`；`openNotesPanel` `:3405`；`restoreStandardSeed` `:3411`；`loadCalls` `:4350`；`openMap` `:4376`；`clickMapBadge` `:4455`；`waitChapterFilter(text, rows)` `:4480`；`enterMapWorkspace` `:4492`；`backToLibraryTab` `:4506`；`waitNotesTab` `:4510`；折叠按钮的既有相位内字面选择器 `Array.from(document.querySelectorAll(".pill-icon-btn")).find((el) => el.getAttribute("title") === "折叠资料库")` `:4746-4748`；`enterNotesProbe(seed, rows)` `:5211`；`setSearch` `:5220`（只写 `.notes-search-input`）；`ensureMapOpen` `:5254`；`groupHeads` `:5294`；`deleteRowByText` `:5309`；`clickUndo` `:5349`；`notesNotice` `:5356`；`clickEl` `:7268`；`triggerWindowFocus` `:8404`；`writeNotesOutside` `:8487`；`appendExternalNote` `:8489`；`r15-f16` `:9199-9249`；`runReaderStateScenarios` 收口 `}` 在 `:9250`（**R16 场景挂载点 = `:9249` 之后、`:9250` 之前**） |
| 既有场景 1 的夹具几何读数（R15 基线 `MEASUREMENTS.json` 的 `pdf-text-layer-geometry`，label `:1404`；本次复读） | `pageBox = { x: 443, y: 39, w: 595, h: 842 }`；`spanCount = 6`；`firstSpan = { dx: 56, dy: 86, w: 387, h: 20 }`；`firstSpanText = "Sparse Attention for Long-Context Retrieval"`；`spanColor = "rgba(0, 0, 0, 0)"`；`scaleFactorVar = "1"`；`canvasWidth = "595px"` |
| 夹具页面文本项（`SAMPLE_PAGES`，逐字） | 页 1 **6** 项：`Sparse Attention for Long-Context Retrieval`(20) / `Abstract. We study retrieval over long documents where the` / `attention budget is the binding constraint. Our method keeps` / `linear complexity while improving recall to 91.3% on the` / `LongBench suite, matching dense baselines at one third cost.` / `Keywords: retrieval, sparse attention, ablation`(10)；页 2 **4** 项：`3. Ablation Study`(16) / `Table 2 reports the ablation over the sparse mask budget.` / `Removing the positional prior costs 2.4 points of recall,` / `which confirms the mask is doing more than sparsification.`；页 3 **3** 项：`4. Conclusion`(16) / `Sparse attention keeps recall at one third of the dense budget,` / `and the ablation holds across all three random seeds.` |
| 文字层片段的真实成因（`pdfjs-dist` 真实源码，本次实读） | `node_modules/pdfjs-dist/build/pdf.mjs:11057-11060` `#appendText(geom)` 内 `const textDiv = document.createElement("span")`（**每个文本项一个 `span`**）；`:11058` `canvasWidth: 0`；`:11129-11132` `if (textDivProperties.hasEOL) { const br = document.createElement("br"); … this.#container.append(br); }`（**`<br>` 只在 `hasEOL` 时插入**）⇒ 夹具的片段结构 = `span(text)` 与 `span(text) + br` 交替，**不依赖任何未被验证的 pdf.js 行为推断** |
| 标准种子与匹配事实（`seedNotes()`，逐字） | 4 条：`n-current-1`（`sample-paper.pdf` p1 摘录 `We study retrieval over long documents where the attention budget is the binding constraint.`，备注 `与第 3 节消融实验对照`）⇒ **可匹配**（折叠后长度 **92**：页 1 的前两个文本项以假分隔符 `"\n"` 连接后，该句是页 1 折叠文本的连续子串；本步离线复算：`indexOf = 54`、命中区间 `[54,146)`，`slice` 逐字等于折叠摘录）；`n-current-2`（p2 摘录，折叠后长度 **333** > 页 2 折叠文本长度 **192**）⇒ **不可匹配**；`n-other-1`（`archive/older-paper.pdf` p7）⇒ 非当前文档；`n-current-3`（p2 **AI 结论**）⇒ `kind !== "excerpt"`，不参与锚点 |
| stub 面与数据面 | stub `api` 面 **42** 方法（`ui-shot.mjs` 的 `buildStub()` 模板串内）；`PixApi` 42 方法（`pix/src/main/preload.ts`）⇒ 两处逐字相等；`pix/package.json` 沿用既有 `smoke:view`（不新增 script） |
| 零缺失比对基线（R15 交付终态） | `C:/Users/86157/AppData/Local/Temp/pix-v05-r15-final/shots`：`MANIFEST.json` ⇒ `shots.length = 153`、`failure = null`；`MEASUREMENTS.json` ⇒ 长度 **223**、`label` 去重 **59** 种；目录内 png **153**（与清单一致） |
| 本轮未执行（本步禁止 / 不必要） | 离屏 `ui-shot.mjs`、基线复跑、`npm run build` / `npm test` / `npm run package` / `npm run dev`；本步**未实跑** `npm run check`（§5.4 的 check 判据留给开发步，本档不代跑） |

### 0.2 R16-req 定稿修订（M1–M12）在本档的实现级落点

| 编号 | 需求档结论 | 本档实现级落点 |
| --- | --- | --- |
| M1（loading 窗口下定位不可达） | 定位动作改为**有界等待** `LOCATE_WAIT_MS = 3000`；loading 摘出退化理由 | §1.3.4「定位动作（有界等待）」+ §1.3.6「等待结果四态」+ `r16-2` 相位 `locate-panel-closed` 步骤（§5.3）+ §3 第 6 行 |
| M2（`SEL` 键名冲突） | 新键改名 `pageBoxOne`；`pdfPageOne` 逐字不动 | §5.3.1 `SEL` 增量四项（含 `pageBoxOne: '.pdf-page[data-page="1"]'`）+ §5.3.4 判据 3（页级截图取法） |
| M3（`releasePage` 零 diff 互斥） | 改为「既有分支语义不变」+ 四个允许新增调用点 | §1.2.4「与既有页结构的关系」+ §1.4.6「清空时机」+ §2.2 登记 |
| M4（PDF 搜索入口） | 新增 helper `pdfSearchSet` / `pdfSearchNext` / `pdfSearchClose`（字面量选择器，不进 `SEL`） | §5.3.1 helper 表 + `r16-4` 相位（§5.3） |
| M5（夹具条数矛盾） | 写死**恰 14 条** = 标准 4 条（含 `n-other-1`）+ 9 条页 2 填充摘录 + 1 条页 3 摘录 | §5.3.1 `seedR16Focus()` 逐条表 + `r16-2` 前置 |
| M6（几何约束不可实现） | ②③ 限定为**夹具相位内的几何判据**；登记层叠事实 | §1.1.4「层级与层叠顺序」（含 `.pdf-search-panel` 的 `z-index: 4` 登记）+ §1.1.6 的零改动口径 + §5.3.2 的 `pageNotesProbe`（含 `.pdf-search-panel` 相交判定） |
| M7（返回路径互斥） | 「唯一被改动的视图状态 = 章节过滤被单向清除」 | §1.3.3 动作表 + §1.3.7「零副作用 / 一次性」判定式 |
| M8（缺开地图步骤） | 相位前置补 `ensureMapOpen()` + `waitFor("地图行就绪", ".map-row === 7")` + `waitChapterFilter(...)` | `r16-2` 相位 `degrade-filters` 步骤（§5.3） |
| M9（采样序列不可执行） | 写死**交替序列** + 每次点击前断言 `disabled === false` | `r16-3` 相位 `unmatched-silent` 续段（§5.3） |
| M10（等待作废语义） | 补「本次等待作废」+ 可判定式 | §1.4.7「等待与作废」+ `r16-3` 相位 `unmatched-silent` 续段末段（§5.3）与 §5.4 走查 #10 |
| M11（写接口类型未登记） | 登记 `HighlightRegistryWriter`（`PdfViewer.vue` 顶层，刻意重复） | §0.3 + §1.4.2 + §5.1 走查 #7（§5.4） |
| M12（`::highlight(` 计数口径） | 给出可复跑命令 `grep -cE "^::highlight\("`（现值 2、改后 3） | §1.4.2 的「计数判据」行（§5.4 走查 #6） |

### 0.3 本档新增的显式冻结（只补实现层命名与常量，不改任何判据）

| 项 | 冻结值 | 理由 |
| --- | --- | --- |
| 页标记派生的组件侧命名 | `pageNotes`（`computed`，唯一 `countNotesByPage` 调用点）/ `pageNotesForRender`（模板取数列表 `computed<(PageNoteCount \| null)[]>`：`pageSizes × pageNotes` 一次 `map`，每页恰 1 次 `Map.get`）/ `onPageNotesClick(page)`（点击处理器） | §0.2 第 2 条冻结「模板每页最多 2 次 `Map` 读取」⇒ 把读取收敛到 `pageNotesForRender` 的 `map`、模板只做数组下标读取（0 次 `Map` 读取）；取数列表不做聚合（纯 `Map.get` + `?? null`） |
| 锚点绘画的内部命名（`PdfViewer.vue`） | `HIGHLIGHT_NOTE_ANCHOR`（常量）/ 本地别名 `HighlightRegistryWriter`（顶层，与 `PdfSearchPanel.vue:18-22` 同名同形）/ `anchorRegistry()` / `clearNoteAnchor()`（**唯一**删除点）/ `anchorTextCache`（`Map<number, FoldedText>`；**只缓存折叠结果，不缓存 `Text` 节点引用** —— 片段表每次重画重取）/ `anchorToken`（一次性令牌）/ `ANCHOR_LAYER_WAIT_MS = 2000` / `scheduleNoteAnchor()`（重画入口）/ `paintNoteAnchor()`（内部） | §0.5 冻结「清空时机四条 + 重建」的语义，命名自由；`clearNoteAnchor()` 是把四条清空时机收敛成**一个**删除点的实现手段（§1.4.6 判据 3） |
| 定位动作的面板侧命名（`NotesPanel.vue`） | `ANCHOR_HIGHLIGHT_MS = 2000` / `LOCATE_WAIT_MS = 3000` / `locateWaitId`（在途等待句柄）/ `anchorTimer`（瞬时高亮定时器）/ `ANCHOR_MISS_MESSAGE`（退化文案常量） | §5.4 走查 #8 要求 `LOCATE_WAIT_MS` 定义 1 + 使用 ≥ 1；`ANCHOR_HIGHLIGHT_MS` 判据见 §5.4 走查 #8 |
| Range 重建的局部类型与函数（`PdfViewer.vue` 顶层，**不进 `page-anchor.ts`**） | `interface AnchorSegment { node: Text; start: number }`（`start` = 该片段首字符在「连接后未折叠串」中的下标）与 `anchorRangeFor(segments: AnchorSegment[], page: FoldedText, range: AnchorRange): Range \| null`（内部 `document.createRange()`，含片段 `locate` 扫描） | req §0.7 明文「折叠域 → 原文域的映射由调用方（`PdfViewer.vue`）用 `page.at` 完成」+ req §7 第 2 行「`page-anchor.ts` 只放纯函数与类型、零 import / 零 DOM」⇒ 该实现不占 `page-anchor.ts` 的 `for (` ≤ 2 上限（它属组件侧）；不抽共享模块（理由同 §0.0 第 3 条：搜索侧零 diff） |
| 离屏新增 helper（**10** 个，命名自由、语义冻结） | ①`pageNotesProbe(page)` ②`anchorProbe()` ③`panelRowProbe(page)` ④`textLayerSnapshot(page)` ⑤`emptyTextLayer(page)` ⑥`selectionOnPageOne()` ⑦`pdfSearchSet(text)` ⑧`pdfSearchNext()` ⑨`pdfSearchClose()` ⑩`pageLabelProbe()` | ①–⑨ 与 N95-2 逐字对应；⑩ 供性能采样（一次读回 `.page-label` 文本 + 两个翻页按钮的 `disabled` 状态），避免在相位里反复 `js` 往返 |
| 本档不引入的新常量（登记） | `ANCHOR_HIGHLIGHT_MS` 与 `LOCATE_WAIT_MS` 都留在 `NotesPanel.vue` 内、`ANCHOR_LAYER_WAIT_MS` 留在 `PdfViewer.vue` 内；**不抽常量模块**（避免为三个数字新建文件） | 与「不新建 `env.d.ts`、不改共享面」同纪律 |
| 夹具几何判据的成立条件（登记） | 夹具下 `.pdf-scroll` 的 `padding-bottom: 48px` + 3 页文档 + 控件水平居中 ⇒ 页面底边与视口控件不重叠；该口径只用于 `r16-1` 相位内的几何判据，不作为全局不变量 | M6 的收敛落点 |
| `Highlight` 构造函数的全局可用性（登记） | `Highlight` 与 `HighlightRegistry` 由 TS 5.8.3 的 `lib.dom.d.ts` 声明（`Highlight` 构造函数可 `new Highlight(...ranges)`）；缺的只是 `HighlightRegistry` 的 `set` / `delete` 写方法 ⇒ 只用本地别名补写方法，**不新建全局声明文件、不改 `env.d.ts`** | M11 的收敛落点；既有 `PdfSearchPanel.vue:18-22` 为同款先例 |

---

## 1. 契约冻结表

### 1.1 N91 页面笔记标记：DOM、层级与门控

#### 1.1.1 渲染条件与门控（自上而下第一条命中即定）

| 序 | 条件 | 结果 | 判定落点 |
| --- | --- | --- | --- |
| 1 | `notesStore.currentDocKey === null`（资料库外文件 / 未选库） | **整篇不渲染任何标记**（不猜测归属；`countNotesByPage` 也返回空 Map） | 组件模板 `v-if` 的第一分量 |
| 2 | `readerStore.pageCount === 0` / 加载中 / 加载失败 / 非 PDF | 无 `.pdf-page` ⇒ 自然无标记（**不新增加载态或错误态占位**） | 既有 `v-if / v-else-if` 链（§0.1 模板读数） |
| 3 | 该页 `countNotesByPage(...).get(页号)` 不存在或 `total === 0` | 该页不渲染标记（**零占位**：无空胶囊、无 `0 条`、无占位元素） | 每页的 `v-if` 第二分量 |
| 4 | 笔记页号越界（例如 p9 而文档只有 3 页） | 不渲染任何标记、**不钳制**、**不改写 `notes.json`**（面板照常显示该条） | 计数派生天然不产出该键；无第二处页号校验 |
| 5 | 其余 | 该页渲染**一枚** `.page-notes` | —— |

#### 1.1.2 DOM 形状与位次（逐字冻结）

```html
<div v-for="(size, index) in pageSizes" :key="index + 1" class="pdf-page" :data-page="index + 1" :style="{ … }">
  <canvas />
  <div class="textLayer" />
  <div class="pdf-overlay">
    <slot name="overlay" :page="index + 1" />
  </div>
  <button
    v-if="pageNotesForRender[index]"
    type="button"
    class="page-notes"
    :title="`本页 ${pageNotesForRender[index]?.total} 条笔记（摘录 ${pageNotesForRender[index]?.excerpt} · AI 结论 ${pageNotesForRender[index]?.answer}）；点击定位到笔记面板`"
    @click="onPageNotesClick(index + 1)"
  >本页 {{ pageNotesForRender[index]?.total }} 条</button>
</div>
```

| 项 | 逐字值 |
| --- | --- |
| 元素形态 | `<button type="button" class="page-notes">`（`<button>` 而非 `<span>`：键盘可聚焦、语义为动作；不改 `pointer-events`、不加 `tabindex`） |
| 位次 | `.pdf-page` 的**直接子元素**，排在 `.pdf-overlay` **之后**（有标记的页 = 第 4 个子元素） |
| 文本 | `本页 {{ total }} 条`（数字与 `条` 之间**恰一个半角空格**；无图标、无「笔记」前缀、无背景色块、不换行） |
| `title`（tooltip） | `本页 {{ total }} 条笔记（摘录 {{ excerpt }} · AI 结论 {{ answer }}）；点击定位到笔记面板`（三段**恒给**，为 0 也写；分隔符 = 半角空格 + `·`(U+00B7) + 半角空格；括号为全角 `（）`；分号后的引导语逐字 `点击定位到笔记面板`） |
| 夹具实例 | 页 1 = `本页 1 条` / `本页 1 条笔记（摘录 1 · AI 结论 0）；点击定位到笔记面板`；页 2 =（标准种子）`本页 2 条` / `本页 2 条笔记（摘录 1 · AI 结论 1）；点击定位到笔记面板`；页 3 = 无标记 |
| 计数口径 | 「当前文档 + 该页」全部 `excerpt + answer`；单次遍历 + `computed` memo + 每页 O(1) 取数（§1.2） |
| 模板取数 | 每页 **0** 次 `Map` 读取（`Map.get` 收敛在 `pageNotesForRender` 的一次 `map` 内，每页恰 1 次；模板只读 `pageNotesForRender[index]` 的数组下标）；`?.` 是唯一工程门（`strict`）下的必选写法（`v-if` 不对下标访问做窄化）；**模板内不得出现 `countNotesByPage(` 调用** |

#### 1.1.3 样式（逐字冻结；不新增 `--pix-*` 变量）

```css
/* 页面笔记标记：绝对定位在页面右下角，不参与流布局 ⇒ 页盒与文字层几何零变化 */
.page-notes {
  position: absolute;
  right: 6px;
  bottom: 6px;
  z-index: 3;
  padding: 1px 6px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 999px;
  background: var(--pix-bg-elevated, #ffffff);
  box-shadow: var(--pix-shadow-xs);
  color: var(--pix-text-secondary);
  font-family: var(--pix-font-ui);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
}

.page-notes:hover {
  border-color: var(--pix-border, #d5dfe8);
  color: var(--pix-text-primary);
}
```

| 项 | 冻结 |
| --- | --- |
| 插入位置 | 两条规则放在既有 `.pdf-page :deep(.textLayer ::selection)`（`:1095`）之后、`.pdf-overlay`（`:1101`）之前（`scoped` 块内；`.page-notes` 是组件自身模板节点 ⇒ **不需要** `:deep()`） |
| `z-index: 3` 的理由 | 与 `.pdf-page-indicator` / `.reader-section` 同层；比 `.textLayer`（`1`）/ `.pdf-overlay`（`2`）高 ⇒ 标记可点；比 `.capture-layer`（`5`）低 ⇒ 框选模式下点击被既有层拦截 ⇒ **不新增任何分支代码** |
| 不新增 | 不加 `transition` / `animation`、不加新变量、不改 `.pdf-page` / `.textLayer` / `.pdf-overlay` 的规则 |

#### 1.1.4 层级与层叠顺序（登记事实，供评审复核）

| 层 | `z-index` | DOM 位次（在 `.pdf-scroll` 内的先后） | 与标记重叠时谁在上 |
| --- | --- | --- | --- |
| `.textLayer` | 1 | `.pdf-page` 内第 2 个子元素 | 标记在文字层之上（标记可点，但**不拦截**文字选择：`.textLayer span { cursor: text }` 仍在；标记自身面积内可点不到下层文字，登记为取舍） |
| `.pdf-overlay` | 2 | 第 3 个子元素 | 标记在上；overlay 是 `pointer-events: none` ⇒ 无冲突 |
| `.page-notes` | **3** | `.pdf-page` 内第 4 个子元素（新增） | —— |
| `.pdf-page-indicator` | 3 | `.pdf-scroll` **之后** | 同层按 DOM 顺序 ⇒ **指示器压住标记并拦截点击**（页面贴底时） |
| `.reader-section` | 3 | `.pdf-scroll` 之后（指示器之前） | 同上（页面贴底且水平居中范围内重叠时） |
| `.pdf-toolbar` | 3 | `.pdf-scroll` **之前** | 标记在上（同层 + DOM 靠后；且工具栏在右上角、标记在页右下角，实际不重叠） |
| `.pdf-search-panel` | 4 | `.pdf-scroll` **之前**（`.pdf-toolbar` 之后；`PdfSearchPanel.vue:432-436`：`position: absolute; top: 78px; right: 12px; width: 300px`） | 搜索面板在上（`4 > 3`）⇒ 面板矩形内拦截点击；夹具内面板在右上角、标记在页右下角 ⇒ 不相交（`r16-4` 相位 `coexist` 判据⑥） |
| `.capture-layer` | 5 | `.pdf-scroll` 之后、指示器之前 | 框选层在上 ⇒ 框选模式下标记不可点（**设计意图**） |
| `.pdf-capture-fab` | 6 | `.pdf-scroll` 之后 | 框选按钮在上（左侧 `left: 12px`，与右下角标记不重叠） |

**登记取舍（M6）**：标记固定 `right/bottom: 6px`，页面无 `overflow` 裁剪；真实 PDF 正文可铺满页面、页面贴底或宽于视口时，标记可能与同层控件重叠并被拦截点击。本轮不改这一事实，只把「不相交」写成**夹具相位内的几何判据**（§5.3.2 的 `pageNotesProbe`）。

#### 1.1.5 框选模式（零分支）

| 项 | 冻结 |
| --- | --- |
| 标记是否仍在 | **在**（视觉不变：`.page-notes` 不在 `.capture-mode` 的屏蔽名单内） |
| 点击行为 | 被 `.capture-layer`（`z-index: 5`）拦截 ⇒ 不触发 `focusPageNotes`；**不新增任何分支代码**（不写 `readerStore.captureMode` 判断） |
| 高亮是否清除 | **不清除**（框选模式不进入任何清空时机，§1.4.6 四条不含它） |
| 既有选择链路 | `.capture-mode :deep(.textLayer), .capture-mode .pdf-overlay { pointer-events: none; user-select: none }`（`:1108-1111`）逐字不动 |

#### 1.1.6 与既有页结构的关系（判据口径）

| 项 | 冻结 |
| --- | --- |
| **零改动**（既有分支语义不变） | `.pdf-page` / `.pdf-scroll` / `.pdf-page canvas` / `.pdf-page :deep(.textLayer)` / `.pdf-page :deep(.textLayer span, br)` / `.pdf-overlay` / `.capture-layer` 的 CSS 规则名不作为 `git diff -U0` 的 `+` / `-` 行出现；`pageElement` / `observePages` / `updateCurrentPage` / `clearPageLayers` / `captureRegion` / `toLayerPoint` / `onCapturePointerDown` 的**函数体零 diff** |
| **允许新增调用**（各恰 1 处，既有语句零改写） | `releasePage` 函数体（清注册表）、`loadPdf` 起始段（文档切换）、scale watcher（缩放）、`onBeforeUnmount`（卸载）—— 四者的唯一用途是调用 `clearNoteAnchor()`（§1.4.6） |
| 读数的独立性 | `.page-notes` **不进** `querySelectorAll("canvas")`（`captureRegion` 只取 canvas 节点）、**不进** `querySelectorAll("[data-page]")`（`observePages` 只取页容器）、**不改** 任何页面矩形的读数（绝对定位 ⇒ 不参与流布局） |
| 既有场景零回归的推导 | `.pdf-page` 矩形读数由 §5.3.2 的 `pageNotesProbe` 逐项钉在 R15 基线（`w = 595`、`h = 842`）；`.textLayer span` 计数钉在夹具声明值（页 1 = 6）⇒ 153 张既有截图的几何零变化（内容变化 = 页面上多了一枚标记，§2.2 登记） |

### 1.2 N91-2 页级计数派生（`notes-path.ts`）

#### 1.2.1 类型与签名（逐字冻结）

```ts
export interface PageNoteCount {
  total: number;
  excerpt: number;
  answer: number;
}

/** 按页聚合的笔记计数（R16 页标记唯一派生）：单次遍历、键 = 页号、非法页号跳过、只产出 total > 0 的页、每次返回新 Map。 */
export function countNotesByPage(notes: ReaderNote[], docKey: string | null): Map<number, PageNoteCount> {
  const counts = new Map<number, PageNoteCount>();
  if (docKey === null) return counts;
  for (const note of notes) {
    if (docPathKey(note.docPath) !== docKey) continue;
    if (!Number.isInteger(note.page) || note.page < 1) continue;
    const current = counts.get(note.page) ?? { total: 0, excerpt: 0, answer: 0 };
    current.total += 1;
    if (note.kind === "answer") current.answer += 1;
    else current.excerpt += 1;
    counts.set(note.page, current);
  }
  return counts;
}
```

| 项 | 冻结 |
| --- | --- |
| 落点 | `pix/src/renderer/utils/notes-path.ts`，紧接 `countNotesByDocument`（`:73-84`）之后、`groupNotesByDocument`（`:87`）之前（与 R14 的计数函数同块） |
| 单次遍历 | 函数体内**恰 1 个 `for (`**（`grep -c "for (" notes-path.ts` 由 **3** 增至 **4**） |
| 比较键 | 复用 `docPathKey`（小写 + 正斜杠 + 去尾斜杠）⇒ `Sample-Paper.PDF` / `sample-paper.pdf\\` / `sample-paper.pdf` 合并计入同一篇 |
| `docKey === null` | 空 Map（不抛错；与 `matchesChapterFilter` 的空键守卫同口径） |
| 页号守卫 | `Number.isInteger(note.page) && note.page >= 1`（`Number.isInteger` 同时排除 `NaN` / `Infinity` / `1.5`；`0` / `-2` 被 `>= 1` 排除；**不钳制、不改写入参**） |
| 只产出 `total > 0` | 与 `countNotesByDocument` 同范式；越界页（p9 而文档 3 页）**天然产出键**，是否渲染由组件侧的页号判定决定（不渲染任何标记） |
| 不变量 | 入参零改动（`notes` 数组与其元素逐字不变）；每次调用返回**新 Map**、元素为**新对象**；`notes` 为空 ⇒ 空 Map（`size === 0`） |
| 与既有函数的差异 | `countNotesByDocument` 的键是 `docKey` 且不含分页；`countNotesByPage` 的键是页号且**先按 `docKey` 过滤**（不产出其它文档的页号） |

#### 1.2.2 组件侧消费（memo + O(1)）

| 项 | 冻结 |
| --- | --- |
| 唯一调用点 | `PdfViewer.vue` 的 `const pageNotes = computed(() => countNotesByPage(notesStore.notes, notesStore.currentDocKey));`（依赖恰为 `notesStore.notes` 与 `notesStore.currentDocKey`） |
| 模板取数列表 | `const pageNotesForRender = computed<(PageNoteCount \| null)[]>(() => pageSizes.value.map((_, index) => pageNotes.value.get(index + 1) ?? null));`（一次 `map` 覆盖全部页；每页恰 1 次 `Map.get`；只做取数，**不是**聚合调用） |
| 模板读取次数 | **0** 次 `Map` 读取（模板只读 `pageNotesForRender[index]`；`v-if` + `title` 三处 + 文本一处全部用 `?.`，见 §1.1.2 的逐字模板） |
| 禁止 | 模板内不出现 `countNotesByPage`；不写第二个按页计数实现（`grep -rn "countNotesByPage" pix/src \| wc -l` = **3**：定义 1 + import 1 + `computed` 调用 1） |
| 依赖 | `useNotesStore` 顶层 import（`PdfViewer.vue` 新增一行 import，与既有 `useReaderStore` / `useReaderStateStore` / `useProjectStore` 同区） |

### 1.3 N92 标记点击 → 到达笔记

#### 1.3.1 点击语义（唯一入口）

| 项 | 冻结 |
| --- | --- |
| 处理器 | `function onPageNotesClick(pageNumber: number): void { notesStore.focusPageNotes(pageNumber); }`（若实现用单行箭头，则直接写 `@click="notesStore.focusPageNotes(index + 1)"`；两种写法语义等价） |
| 不做什么 | **不跳页**（不写 `readerStore.gotoPage` / 不调 `gotoPage` / 不写 `pendingJump`）、**不改缩放**、**不清文本选择**（不写 `setSelectedText("")`）、**不切文档**、**不发任何 IPC**、**不写盘** |
| 可判定式 | 点击前后 `readNotes()` 与 `notesHash()` 逐字不变；`.page-label` / `.zoom-label` / `.center-pill .pill-label` 逐字不变 |

#### 1.3.2 store 新增状态（`stores/notes-store.ts`）

| 项 | 逐字 |
| --- | --- |
| 载荷 ref | `const pageFocusPage = ref<number \| null>(null);`（放在 `chapterFocusToken`（`:122`）之后） |
| 令牌 ref | `const pageFocusToken = ref(0);`（单调递增；紧邻 `pageFocusPage`） |
| 复位（`resetNotes()` `:402-424`） | 新增两行：`pageFocusPage.value = null;` 与 `pageFocusToken.value = 0;`（紧邻既有 `chapterFocusToken.value = 0;` `:418` 之后） |
| 暴露（`return { … }` `:485-535`） | 新增 `pageFocusPage,` 与 `pageFocusToken,` 两个成员（放在 `chapterFocusToken,` `:502` 之后） |
| 计数口径 | `grep -c "pageFocusToken" stores/notes-store.ts` = **4**（声明 / 复位 / 递增 / return 各 1）；实现内**不得**在注释中写出该标识符 |

#### 1.3.3 动作 `focusPageNotes(page)`（守卫顺序即判据）

```ts
/**
 * 页标记点击入口：一次性定位（滚动 + 瞬时高亮），不新增任何持久过滤维度。
 * 唯一被改动的视图状态 = 既有章节过滤被单向清除（直接寻址优先于范围限制）；
 * 搜索 / 排序 / 仅看当前文档 / 选择集 / 阅读位置 / 缩放零变化。
 */
function focusPageNotes(page: number): void {
  if (currentDocKey.value === null) return;
  chapterFilter.value = null;
  pageFocusPage.value = page;
  pageFocusToken.value += 1;
}
```

| 序 | 语句 | 语义（逐条判定） |
| --- | --- | --- |
| ① | `if (currentDocKey.value === null) return;` | **no-op**（零副作用）；此时标记本就不渲染（§1.1.1 门控 1）；**不清** `chapterFilter`、**不递增** token |
| ② | `chapterFilter.value = null;` | 唯一被改动的**视图**状态：章节过滤被**单向清除**（可直接寻址优先；清除是可见的——`.notes-chapter-filter` 整块从 DOM 消失；不可一键回退，可由地图徽标重建） |
| ③ | `pageFocusPage.value = page;` | 一次性载荷（面板 watcher 读取的目标页号） |
| ④ | `pageFocusToken.value += 1;` | 一次性信号（单调递增；复位 0 不构成定位请求，与 `chapterFocusToken` 同纪律） |
| 不清的东西 | `searchQuery` / `sortMode` / `currentDocOnly` / 选择集 / `chapterFocusToken` / `pendingUndo` / `lastReport` / `notes` 全部不动 |
| 无过滤维度 | 不新增 `pageFilter` / `pageOnly` / `pageRange`（`grep -rn "pageFilter\|pageOnly\|pageRange" pix/src \| wc -l` = **0**） |

#### 1.3.4 面板未打开 / 左栏折叠（`WorkspacePage.vue`）

| 项 | 逐字 |
| --- | --- |
| 新增 watcher（放在 `chapterFocusToken` watcher `:215-221` 之后） | ```watch(() => notesStore.pageFocusToken, (token, previous) => { if (token <= 0 \|\| token <= previous) return; leftCollapsed.value = false; selectLeftTab("notes"); });``` |
| 判据逐字同构 | `if (token <= 0 \|\| token <= previous) return;`（与既有 `chapterFocusToken` watcher 逐字相同；`grep -c "token <= 0 \|\| token <= previous" WorkspacePage.vue` 的增量恰 **1**） |
| 回调体逐字 | `leftCollapsed.value = false;` + `selectLeftTab("notes");`（**不出现**任何读过滤状态的路径） |
| 为什么必须穿过 loading | `selectLeftTab("notes")` 内既有 `if (tab === "notes") void notesStore.loadNotes();`（`:211`）⇒ `status.value = "loading"`（`notes-store.ts:231`）⇒ 面板 `:638-640` 的 `v-if="notesStore.status === 'loading'"` 分支把整个 `.notes-list`（含全部 `.note-row`）移出 DOM ⇒ **定位必须在等待窗口内穿过它**（§1.3.5） |
| 结果唯一 | 「点标记 ⇒ 左栏展开并停在笔记标签、目标行被定位」是**唯一**可观测结果（不存在「点了没反应」） |

#### 1.3.5 目标行定义（判定只看 DOM 顺序）

| 项 | 冻结 |
| --- | --- |
| 所在组 | 面板 DOM 中 `group.isCurrentDoc === true` 的组（即含 `.notes-group-head .v-chip`「当前文档」的组） |
| 目标行 | 该组内 `.note-page-badge` 的文本逐字 `第 {N} 页`（`N === pageFocusPage`）的**第一行**（DOM 顺序） |
| 行序不参与判定 | 实际管道 = `groupNotesByDocument`（分组）→ `applyViewToGroups`（搜索过滤 + `sortNotesForView`）；`sortMode = "created"` 会重排组内行序 ⇒ 本档**不依赖**具体行序（判定只看「DOM 顺序的第一行」） |
| 模板 ref | `NotesPanel.vue` 新增 `const panelEl = ref<HTMLElement \| null>(null);`（与 `searchInputRef` `:75` 同区）并把 `ref="panelEl"` 挂在模板根 `.notes-panel`（`:472`）上；下一条参考实现的 `panelEl.value` 依赖它（原稿缺此 ref，F13 的收敛） |
| 取值实现（参考） | ```ts
function targetRow(): HTMLElement | null {
  const list = panelEl.value?.querySelector<HTMLElement>(".notes-list") ?? null;
  if (!list) return null;
  const group = Array.from(list.querySelectorAll<HTMLElement>(".notes-group"))
    .find((el) => !!el.querySelector(".notes-group-head .v-chip"));
  if (!group) return null;
  const want = `第 ${notesStore.pageFocusPage} 页`;
  return Array.from(group.querySelectorAll<HTMLElement>(".note-row"))
    .find((row) => row.querySelector(".note-page-badge")?.textContent?.trim() === want) ?? null;
}``` |
| 多行同页 | 取第一行（同一页有多条笔记时只高亮第一条） |
| 组不存在 | 视为不可达（§1.3.6 第 4 态） |

#### 1.3.6 定位动作（有界等待，取代「单次 `await nextTick()`」）

| 项 | 冻结 |
| --- | --- |
| 常量 | `LOCATE_WAIT_MS = 3000`（`NotesPanel.vue` 顶部常量区，紧邻 `NOTICE_MS` `:29` / `DELETE_CONFIRM_MS` / `COPY_FEEDBACK_MS`） |
| 令牌 | 本次 `pageFocusToken` 的值；等待期内 token 再次变化（新一次定位）或组件卸载 ⇒ **作废本次等待**（丢弃、不滚动、不加类、不提示） |
| 等待条件 | 「`notesStore.status === 'ready'` **且** `targetRow() !== null`」⇒ 成功 |
| 三个终端态 | ① 成功 ② **立即退化**：`status === 'ready'` 后连续 2 帧仍拿不到目标行（搜索 / 章节过滤掉、分组不存在、该页笔记已删、外部刷新后消失、空态）或 `status === 'error'` ③ **超时退化**：`deadline = performance.now() + LOCATE_WAIT_MS` 到期（`loadNotes` 长时间不返回） |
| 轮询方式 | `requestAnimationFrame` 按帧轮询（与 R11 `waitForTextLayer` 同款；**不新增长期 `setInterval`**）；句柄存 `locateWaitId`，在 `onBeforeUnmount` 内 `cancelAnimationFrame` |
| 为什么需要「连续 2 帧」 | 首帧即判「找不到」会在 loading 与 ready 的边界上误判 ⇒ 只在 `status === 'ready'` 之后才开始计数，避免把 loading 窗口算作退化 |
| 成功动作 | `row.scrollIntoView({ block: "center", behavior: prefersReducedMotion ? "auto" : "smooth" })`（`prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches`，与 R11 搜索 `scrollToRange` 同款）+ 加 `.is-anchored` 类 + 起 `ANCHOR_HIGHLIGHT_MS = 2000` 的定时器（**新一次定位替换目标行**：先移除上一行的类与定时器） |
| 退化动作 | **不滚动、不加类**：`setNotice("error", ANCHOR_MISS_MESSAGE)`，`ANCHOR_MISS_MESSAGE` 逐字 `本页笔记不在当前筛选结果中`（复用既有 `.notes-notice.is-error` 容器与 `NOTICE_MS = 4000` 的自动消失；**不新增第二种提示容器、不新增空态文案、不改 `resolveListEmptyReason`**） |
| `loading` 不是退化理由 | 它在等待窗口内被吸收；退化文案只描述「筛选结果里没有这一页」（M1 的收敛口径） |

#### 1.3.7 `.is-anchored` 瞬时高亮（逐字样式）

| 项 | 冻结 |
| --- | --- |
| 挂载点 | 目标行 `.note-row`（下一次定位**替换**目标行：先移除上一行的类与 `anchorTimer`） |
| 样式（**只有两条声明**，放在既有 `.note-row.confirming` 规则之后） | `.note-row.is-anchored { border-color: var(--pix-accent, #31424f); background: var(--pix-bg-hover, #eef2f6); }` |
| 不新增 | 不改几何（`padding` / `margin` / 高度 / 字号 / `gap` 全不动）、不加 `transition` / `animation`、不新增变量；与 `.note-row.selected` / `.note-row.confirming` 的既有配色按样式表顺序共存 |
| 时长 | `ANCHOR_HIGHLIGHT_MS = 2000` 后自动移除（定时器句柄 `anchorTimer`，在 `onBeforeUnmount` 内 `clearTimeout`） |
| 判据 | `grep -c "is-anchored" pix/src/renderer/components/workspace/NotesPanel.vue` ≥ **2**（`:class` 绑定 1 + 样式 1；实现自由、语义冻结）；`r16-2` 相位 `locate-panel-open` ⑧ |

#### 1.3.8 零副作用与一次性（可判定式）

| 项 | 判定式 |
| --- | --- |
| 搜索零变化 | `.notes-search-input` 的 `value` 逐字不变（示例：`""`） |
| 排序零变化 | `.notes-sort-btn` 文本逐字不变（示例：`排序：页码`） |
| 仅看当前文档零变化 | `.notes-filter input` 的 `checked` 逐字不变（示例：`false`） |
| 选择集零变化 | `.notes-selection-bar` 的存在性与文本逐字不变（示例：不在 DOM） |
| 阅读位置 / 缩放 / 文档零变化 | `.page-label` / `.zoom-label` / `.center-pill .pill-label` 逐字不变（示例：`第 3 / 3 页` / `100%` / `sample-paper.pdf`） |
| 数据面零变化 | `notesHash()` 逐字不变；`notesAddCalls()` / `notesReportCalls()` 增量 **0**；`loadCalls()` 增量 ≤ **1**（场景内既有 helper `ui-shot.mjs:4350`，内部读 `window.__pixStub.notesLoadCalls()`；允许的唯一来源 = 既有 `selectLeftTab("notes")` 的读盘，**不是**本动作新增） |
| 唯一被改动的视图状态 | `.notes-chapter-filter` **从在场变为不在 DOM**（有过滤时）；无过滤时也不在场（`r16-2` 的 `locate-panel-open` 即此情形 ⇒ 行集合也零变化） |
| 一次性 | 不引入任何持久过滤状态：点击后列表的可见集合由既有四维（搜索 / 排序 / 章节过滤 / 仅看当前文档）唯一决定；本动作**从不收窄**列表（唯一变化是既有章节过滤被单向清除 ⇒ 可见集合只可能变宽） |

### 1.4 N93 原文高亮：注册表、生命周期与匹配

#### 1.4.1 注册表与常量（逐字冻结）

| 项 | 逐字值 |
| --- | --- |
| 注册表名 | `pix-note-anchor`（常量 `const HIGHLIGHT_NOTE_ANCHOR = "pix-note-anchor";`，`PdfViewer.vue` 顶层常量区，紧邻 `ZOOM_COALESCE_MS` `:776` 之前的常量块） |
| 等待上限 | `const ANCHOR_LAYER_WAIT_MS = 2000;`（`grep -rn "ANCHOR_LAYER_WAIT_MS" pix/src \| wc -l` = **2**：定义 1 + 使用 1；使用点可在等待函数内） |
| 瞬时高亮时长 | `const ANCHOR_HIGHLIGHT_MS = 2000;`（`NotesPanel.vue`，与 `NOTICE_MS` 同区） |
| 定位等待上限 | `const LOCATE_WAIT_MS = 3000;`（`NotesPanel.vue`，与 `NOTICE_MS` 同区） |
| 注册表写接口 | 本地类型别名（**刻意重复**，与 `PdfSearchPanel.vue:18-22` 同名同形）：```ts
type HighlightRegistryWriter = HighlightRegistry & {
  set(name: string, highlight: Highlight): HighlightRegistry;
  delete(name: string): boolean;
};
``` |
| 取注册表 | `function anchorRegistry(): HighlightRegistryWriter { return CSS.highlights as HighlightRegistryWriter; }` |
| 只在当前页 | 同一时刻注册表最多一组 Range（该页的全部锚点区间合并为**一个** `Highlight` 对象） |

#### 1.4.2 样式规则（新增第三条，逐字）

```css
::highlight(pix-note-anchor) {
  color: transparent;
  background-color: rgba(49, 66, 79, 0.07);
  text-decoration-line: underline;
  text-decoration-style: solid;
  text-decoration-thickness: 2px;
  text-decoration-color: rgba(49, 66, 79, 0.75);
}
```

| 项 | 冻结 |
| --- | --- |
| 落点 | `PdfViewer.vue` 的**非 scoped** `<style>` 块（`:1297` 起）内，既有两条 `::highlight()` 之后（即 `:1310` 的 `}` 之后） |
| 计数判据 | `grep -cE "^::highlight\(" PdfViewer.vue`：现值 **2** ⇒ 改后 **3**；字面 `grep -c "::highlight("`：现值 **3** ⇒ 改后 **4**（差 1 = 注释行 `:1301`） |
| `color: transparent` 的理由 | 文字层 span 自身 `color: transparent`（`:1086-1087`，可见字形由 canvas 提供）；`::highlight()` 的 `color` 会**覆盖**该继承值 ⇒ 不显式给 `transparent` 会让命中区文字被真正画出来（与 canvas 字形重影） |
| 既有两条 | `::highlight(pix-search)` / `::highlight(pix-search-current)` 逐字不动（不作为 `git diff -U0` 的 `+` / `-` 行出现） |
| 可区分性（语义判据，不做计算样式内省） | ① 注册表名不同、互不删除；② 同屏并存时各自 `size > 0` 且区间文本集合不相同（搜索词 ≠ 摘录）；③ 样式声明不同：`pix-search` 只有背景色、`pix-note-anchor` 有更浅的背景色 + 下划线 + `transparent` |
| 视觉效果 | 浅色下划线（`2px`、`rgba(49, 66, 79, 0.75)`）+ 极浅底纹（`0.07`）⇒ 与搜索命中的实心灰块（`0.12`）与当前命中的反白（`#31424f` / 白字）在观感上明显可分 |

#### 1.4.3 匹配纯函数（`pix/src/renderer/utils/page-anchor.ts`，**新建**，零 import / 零 DOM）

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

**参考实现（语义冻结；等价写法允许，逐条判据不变）**

```ts
/** ASCII 空白与常见 Unicode 空白（近似 `\s`；不含 `U+FEFF`/ZWNBSP，夹具与中文不受影响；逐字符判定，不用正则以免把注释里的正则面弄乱）。 */
function isSpace(code: number): boolean {
  return (
    code === 32 || (code >= 9 && code <= 13) || code === 160 || code === 5760 ||
    (code >= 8192 && code <= 8202) || code === 8232 || code === 8233 ||
    code === 8239 || code === 8287 || code === 12288
  );
}

export function foldText(parts: string[]): FoldedText {
  const joined = parts.map((part) => (typeof part === "string" ? part : "")).join("\n");
  const text: string[] = [];
  const at: number[] = [];
  let pendingSpace = false;
  for (let index = 0; index < joined.length; index += 1) {
    const code = joined.charCodeAt(index);
    if (isSpace(code)) {
      pendingSpace = text.length > 0;
      continue;
    }
    if (pendingSpace) {
      text.push(" ");
      at.push(-1); // 折叠出来的空格：回溯到相邻的真实字符（起点侧取后一个，终点侧用 at[end - 1] 取前一个）
      pendingSpace = false;
    }
    text.push(joined[index]);
    at.push(index);
  }
  return { text: text.join("").toLowerCase(), at };
}
```

| 折叠规则（逐条判定） | 语义 |
| --- | --- |
| ① 片段间假分隔符 | `parts.join("\n")`（`index` 依赖该连接串 ⇒ 假分隔符在下标里占 1 位，若被折叠则记 `-1`） |
| ② `\s+` → 单空格 | 连续空白折叠为**恰一个**空格（保留首个非空字符之前不产出空格 ⇒ 起点不可能是折叠出来的空格） |
| ③ `trim()` | 两侧空白都不产出（等价于连接后 trim；实现用「`text.length > 0`」守卫起点） |
| ④ `toLowerCase()` | 在**最后**一次做（`grep -c "toLowerCase" page-anchor.ts` = **1**：折叠函数内唯一一处） |
| ⑤ 空串 | `foldText([])` ⇒ `{ text: "", at: [] }`；全空白片段 ⇒ `text === ""`、`at === []` |
| 结构性不变量 | `at.length === text.length`（**注意**：`text` 已小写，长度与折叠前的字符序列相等——`toLowerCase` 对 ASCII 与中文都保持长度，夹具与断言只用手写期望串核对）；`at` 中非 `-1` 的下标**严格递增** |

```ts
export function matchExcerpts(page: FoldedText, excerpts: AnchorExcerpt[]): AnchorRange[] {
  const accepted: AnchorRange[] = [];
  for (const excerpt of excerpts) {
    const needle = foldText([excerpt.text]).text;
    if (needle === "" || needle.length > MAX_ANCHOR_TEXT_LENGTH) continue;
    const start = page.text.indexOf(needle); // 每页最多一处 = 首个命中
    if (start < 0) continue;
    const end = start + needle.length;
    if (accepted.some((range) => start < range.end && end > range.start)) continue; // 重叠 ⇒ 整体丢弃
    accepted.push({ key: excerpt.key, start, end });
  }
  return accepted;
}

// Range 重建（`anchorRangeFor` + 片段 `locate` 扫描）按 req §0.7 移入调用方 `PdfViewer.vue`，参考实现见 §1.4.4；本文件保持纯字符串逻辑。
```

| 匹配规则（逐条判定） | 语义 |
| --- | --- |
| 大小写 | 两侧都走 `foldText` ⇒ 两侧都 `toLowerCase`（对中文幂等） |
| 子串 | 折叠域内 `indexOf` 命中（不要求词边界、不做分词、不做模糊匹配、不做正则）；`grep -c "indexOf" page-anchor.ts` = **1** |
| 每条摘录每页最多一处 | 只取 `indexOf` 的第一次命中（重复出现不重复标记） |
| 超长 / 空 | `needle.length > MAX_ANCHOR_TEXT_LENGTH` 或 `""` ⇒ 跳过（**不报错**）；折叠后长度恰 400 ⇒ 参与匹配（含等于） |
| 多条与重叠 | 处理顺序 = 调用方给的顺序（= `sortNotesForContext` 产出序：docPathKey → page → createdAt → id）；候选区间与已接受区间**重叠**（`start < accEnd && end > accStart`）⇒ **整体丢弃**（不截断、不拼接、不合并） |
| 确定性 | 返回顺序 === 输入顺序中被接受的**子序**（`accepted.push` 只追加） |
| 纯性 | 不改入参（`parts` / `page` / `excerpts` 逐字不变）、不读全局、不抛错；两次调用结果 `JSON.stringify` 相等但对象不同 |
| 复杂度 | `matchExcerpts` 内层无嵌套循环；`grep -c "for ("` 在 `page-anchor.ts` 内 ≤ **2**（折叠 1 + 匹配 1；Range 重建的片段 `locate` 扫描在 `PdfViewer.vue` 内，不占此上限） |
| 依赖 | 该文件**零 import**、**零 DOM**（不依赖 `@shared/types`、不依赖 `pdfjs-dist`、不 import 任何渲染层模块、不引用 `document` / `Text` / `Range`）⇒ `smoke-view.mjs` 的编译面可无 DOM shim 直接加载（req §0.7） |

#### 1.4.4 折叠域 → 原文域 → DOM Range（调用方纪律）

| 序 | 步骤 | 冻结 |
| --- | --- | --- |
| ① | 片段收集 | 该页 `.textLayer` 内按 **DOM 顺序**的全部**非空**文本节点：`document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)`（与 R11 `paintHighlights` 的取法一致：DOM 是几何事实源）；`nodeValue` 为空串的节点**不参与**（否则它会产出多余片段边界） |
| ② | 片段表 | `segments: AnchorSegment[]`（`start` = 前序片段长度之和，含假分隔符）；**不缓存 `Text` 节点引用**（缩放 / 重渲染会重建节点 ⇒ 每次重画都重取，见 §1.4.7 的作废语义） |
| ③ | 折叠 | `foldText(parts)`（`parts` 按 DOM 顺序）；结果按**页号**缓存进 `anchorTextCache`（缩放变化**不失效**；文档切换清空） |
| ④ | 匹配 | 该页摘录集合 = `sortNotesForContext(notesStore.notes.filter((note) => note.kind === "excerpt" && docPathKey(note.docPath) === currentDocKey && note.page === pageNumber))`；`matchExcerpts(folded, excerpts)`（**不跨页**：只在「摘录所属页 == 被画的页」时参与匹配；本轮只画当前页 ⇒ 等价于只匹配 `note.page === readerStore.page`） |
| ⑤ | 建 Range（调用方实现） | 逐区间调用 `PdfViewer.vue` 内的局部函数 `anchorRangeFor(segments, folded, range)`（用 `page.at[range.start]` / `page.at[range.end - 1] + 1` 得到原文域下标，再按片段表换算 `{ node, offset }` 并 `document.createRange()` —— **req §0.7 明文该映射由调用方完成**）；返回 `null` 即丢弃该区间（不重试、不报错） |
| ⑥ | 写注册表 | `ranges.length === 0` ⇒ `clearNoteAnchor()`；否则 `anchorRegistry().set(HIGHLIGHT_NOTE_ANCHOR, new Highlight(...ranges))`（**同一时刻一个注册表、一组 Range**） |
| ⑦ | 「无高亮」的唯一判据 | `CSS.highlights.has("pix-note-anchor") === false`（匹配失败 / 无摘录 / 无文字层 / 超时 ⇒ **删除**注册表，不保留空对象） |

**参考实现（`PdfViewer.vue` 内；语义冻结，等价写法允许）**

```ts
interface AnchorSegment { node: Text; start: number; }

function anchorRangeFor(segments: AnchorSegment[], page: FoldedText, range: AnchorRange): Range | null {
  const startIndex = page.at[range.start];
  const lastIndex = page.at[range.end - 1];
  if (startIndex === undefined || lastIndex === undefined || startIndex < 0 || lastIndex < 0) return null;
  const from = locate(segments, startIndex);
  const to = locate(segments, lastIndex);
  if (!from || !to) return null;
  const result = document.createRange();
  result.setStart(from.node, from.offset);
  result.setEnd(to.node, to.offset + 1);
  return result;
}

function locate(segments: AnchorSegment[], index: number): { node: Text; offset: number } | null {
  for (let position = segments.length - 1; position >= 0; position -= 1) {
    const segment = segments[position];
    if (index >= segment.start) return { node: segment.node, offset: index - segment.start };
  }
  return null;
}
```

#### 1.4.5 绘画范围与触发

| 项 | 冻结 |
| --- | --- |
| 范围 | **只画当前页**（`readerStore.page`）；其它可见页不画（登记为不采用：扩大范围会同时扩大与搜索高亮的层叠面积与性能面） |
| 触发（全部收敛到一个「重画当前页」函数 `scheduleNoteAnchor()`） | ① 当前页变化（`watch(() => readerStore.page, …)`）② 笔记列表变化（`watch(() => notesStore.notes, …)`）③ 缩放变化（与 scale watcher 同一批）④ 该页文字层渲染完成（`renderPage` 的 `textLayer.render()` 之后；**允许在该函数末尾新增 1 处调用** —— 它是 req §7 第 3 行四个清空调用点之外的**第 5 个**新增调用点，依据 = req §0.5「绘画触发④」；见 §1.4.6 的落点纪律） |
| 不新增 | 不为翻页新增定时器或轮询（唯一等待窗口 = §1.4.7；`grep -c "setInterval" PdfViewer.vue` = **0**） |
| 工作量上界 | 每次翻页最多归一 **1** 页（新当前页）+ 该页每条摘录 1 次 `indexOf`；页文本归一结果按页缓存（`anchorTextCache`，同一文档内复用） |

#### 1.4.6 清空时机（四条 + 一个删除点）

| # | 时机 | 落点（各恰 1 处新增调用） | 现有语句 |
| --- | --- | --- | --- |
| ① | 文档切换 | `loadPdf` **起始段**（`:637-651`，`pageSizes.value = []` 邻区；**不**放进 `destroyDocument`，避免与 ③ 重复） | 既有语句零改写 |
| ② | 缩放变化（页面重渲染前） | scale watcher（`:817-828`，`for (const pageNumber of [...renderedPages]) releasePage(pageNumber);` 之后） | 既有语句零改写 |
| ③ | 页面被 release（离开视口 > 4 页） | `releasePage` 函数体末尾（`:250-264`） | 既有语句零改写 |
| ④ | 组件卸载 | `onBeforeUnmount`（`:855-874`，与 `destroyDocument()` 同段） | 既有语句零改写 |
| ⑤（幂等补充） | 每次重新绘画前先删后画 | `paintNoteAnchor()` 的首行 | —— |

| 项 | 冻结 |
| --- | --- |
| 唯一删除点 | `function clearNoteAnchor(): void { anchorRegistry().delete(HIGHLIGHT_NOTE_ANCHOR); }`（`grep -c "HIGHLIGHT_NOTE_ANCHOR" PdfViewer.vue` ≥ **3**：常量声明、`set`、`delete`） |
| 只删自己的名字 | 不调用 `CSS.highlights.delete("pix-search")` / `("pix-search-current")`；不改 `PdfSearchPanel.vue`（**零 diff**） |
| 幂等 | 删除不存在的注册表不抛错（`delete` 返回布尔值，忽略返回值） |

#### 1.4.7 等待与作废（M10）

| 项 | 冻结 |
| --- | --- |
| 等待条件 | 目标页 `.textLayer` 内出现首个 `span`（`layer?.querySelector("span")`；与 R11 `waitForTextLayer` 同判据）—— 首个 `span` 只保证首个 chunk 落 DOM，**片段完整性由 §1.4.5 ④ 的 `renderPage` 末尾重画兜底**（见本表「收敛」行） |
| 等待方式 | `requestAnimationFrame` 按帧轮询（句柄存模块级 `anchorWaitId`），上限 `ANCHOR_LAYER_WAIT_MS = 2000`（`performance.now()` 判据）；**等待期间不做任何 DOM 写入** |
| 超时 | 放弃本次绘画（**静默**：不报错、不弹提示、不写日志、不重试、不阻塞滚动） |
| **作废语义** | 每次「重画当前页」自增一次性令牌 `anchorToken`；等待轮询与回调先核对 `token !== anchorToken ⇒ 丢弃`（不写注册表）；当前页 / 文档 / 缩放任一变化都会发起新的重画 ⇒ 旧等待自然作废 |
| 收敛（流式文字层） | 若本次绘画发生在片段未完整时，`renderPage` 末尾的触发（§1.4.5 ④）会在 `await textLayer.render()` 之后**再重画一次** ⇒ 以完整片段集收敛，不依赖 chunk 时序（`TextLayer.render()` 的 `pump()` 是流式，`pdf.mjs:10964-10983`） |
| 可判定式 | 快速连点 4 次翻页后（不等待 `.page-label` 更新）：若注册表非空，其区间所属 `.pdf-page` 的 `data-page` **必须**等于当前页号；若当前页无可匹配摘录则 `has === false`；**不得出现「区间指向非当前页」** |
| 不新增 | 不新增第二个等待实现（与搜索面板的 `waitForTextLayer` 各自独立；不抽共享模块，登记为开放问题） |

### 1.5 N94 分支表（十一行，逐行可判定）

> 判定工具：除明确写「提示」的两处（定位退化、无）外，**一律静默**（不报错、不写日志、不弹提示、不重试）。每一行都给出真实分支名（既有代码的判定点）与真实判据相位。

| # | 分支（触发条件） | 真实判定点 | 标记行为 | 高亮行为 | 判据相位 |
| --- | --- | --- | --- | --- | --- |
| 1 | `.pdf-page` 上该页计数为 0 | `pageNotes` 的 `Map.get(页号) === undefined` | 不渲染（零占位） | 不参与（该页摘录集合为空 ⇒ 删注册表） | `r16-1` 相位 `badges`（页 3）；`r16-5` 相位 `zero-page` |
| 2 | 整篇 0 条笔记 / 非当前文档 | `currentDocKey === null` 或 `docPathKey` 不匹配 | 全部页不渲染 | 注册表不存在（`has === false`） | `r16-1` 相位 `other-doc`；`r16-5` 相位 `zero-page` |
| 3 | 笔记页号越界（p9 而文档 3 页） | `countNotesByPage` 的页号守卫（只拒 `Number.isInteger` 与 `< 1`） | 不钳制、不报错、不改写 `notes.json`；该键**不落任何页** | 不参与（摘录页 ≠ 当前页） | `r16-1` 相位 `other-doc` ⑬ |
| 4 | 非法页号（`0` / `-2` / `1.5` / `NaN`） | 同上 | 不产生任何键（不抛错） | 不参与 | 烟测 `notes-by-page` #3 |
| 5 | 非 PDF（`.md` / `.txt`） | `ReaderPanel` 的文档类型分支（`PdfViewer` 不挂载） | 组件不存在 ⇒ 无标记 | 组件不存在 ⇒ 无高亮 | §5.4 走查 #2（`page-notes` 在 `ReaderPanel.vue` / `WorkspacePage.vue` 零命中） |
| 6 | 文档加载中（`isLoading`）/ 加载失败（`failure`） | 模板 `v-if="isLoading"` / `v-else-if="failure"` 两个分支 | 无 `.pdf-page` ⇒ 无标记（**不新增加载态或错误态文案**） | 无 `.pdf-page` / 无文字层 ⇒ 无注册表 | §1.1.1 门控 2；既有 `reader-empty` / `.pdf-error` 截图零缺失 |
| 7 | `pageCount === 0` | `v-if="readerStore.pageCount > 0"` 与 `v-for="(size, index) in pageSizes"` | 无页元素 ⇒ 无标记（计数函数仍可被调用，但不产生渲染） | 无页元素 ⇒ 无注册表 | §1.1.1 门控 2 |
| 8 | 无文字层（扫描件 / 纯图片页） | 等待条件 `layer?.querySelector("span")` 永不成立 | **标记照常显示**（计数不依赖文字层） | 等待 `ANCHOR_LAYER_WAIT_MS = 2000` 到期 ⇒ 放弃（静默：不报错、不弹提示、不写日志、不重试） | `r16-5` 相位 `no-text-layer` ⑤⑥ |
| 9 | 文字层未就绪（加载 / 渲染中） | 同上（等待窗口） | 标记不依赖文字层 ⇒ 立即显示 | 按帧轮询等待，就绪后补画（不阻塞滚动；等待期内页 / 文档 / 缩放变化即作废） | `r16-3` 相位 `anchor-painted`；`r16-5` 相位 `no-text-layer` 续段 |
| 10 | 摘录不可匹配（被改写 / 跨页 / 页文本缺失 / 超长 / 空） | `matchExcerpts` 的 `indexOf < 0` / 长度门 / 空门 | 标记不受影响 | **静默降级**：该页其它可匹配摘录照常标出；整页全不可匹配 ⇒ 删注册表 | `r16-3` 相位 `unmatched-silent` ⑦；烟测 `excerpt-match` #5 / #8 / #9 |
| 11 | 缩放变化 / 页面被 release / 文档切换 / 组件卸载 | scale watcher（`:817-828`）、IO 回调（`:280` ⇒ `releasePage`）、`loadPdf` 起始段、`onBeforeUnmount` | 标记随页盒几何重排（`right/bottom` 与页盒尺寸无耦合） | 先清注册表（旧节点失效）⇒ 重渲染完成后按新文字层重画（匹配结果与缩放无关） | `r16-3` 相位 `scale-stable` ⑪⑫⑬；`r16-5` 相位 `no-text-layer` 续段 |
| 12 | 笔记被外部改动 + 面板刷新 / 面板内增删改 / 撤销 | `notesStore.notes`（唯一事实源）变化 ⇒ `pageNotes` 与重画各自重算 | 按新列表实时重算（被移动页的笔记改变标记所在页） | 按新列表重算（被删笔记的高亮消失；新增摘录可匹配则出现） | `r16-1` 相位 `live`；`r16-5` 相位 `external-refresh` |
| 13 | 资料库外文件（`currentDocKey === null`，含「未选库」） | `toDocKey(readerStore.filePath, projectStore.currentProject?.path ?? "")` | **不渲染任何标记**（不猜测归属）；点击动作 no-op | 不参与 | §1.1.1 门控 1；§1.3.3 ①；烟测 `notes-by-page` #2 |
| 14 | 框选模式（`readerStore.captureMode`） | 模板 `:class="{ 'capture-mode': readerStore.captureMode }"` + `.capture-layer` 的 `z-index: 5` | 标记仍在（视觉）；点击被 `.capture-layer` 拦截（**不新增分支代码**） | 高亮仍在（不因进入框选而清除） | `r16-1` 相位 `badges` ⑦（`.capture-layer` 的 `zIndex` 逐字 `"5"`）；§1.1.5 |
| 15 | 面板内删除 / 撤销 / 新建摘录 | 同第 12 行（`applyNotes` 覆盖本地列表） | 实时跟随（**无额外 IPC**） | 实时跟随 | `r16-1` 相位 `live` ⑧⑨ |

#### 1.5.1 分支表的实现纪律（两条）

| 纪律 | 判据 |
| --- | --- |
| 不新增第二种「无高亮」状态 | 判定一律落到 `CSS.highlights.has(HIGHLIGHT_NOTE_ANCHOR)`（§1.4.4 ⑦），不引入「空注册表 = 已画但为空」的中间态 | §1.4.4 ⑥⑦；走查 #7 |
| 不新增第二种提示容器 | 定位退化复用既有 `.notes-notice.is-error`（`NotesPanel.vue` 的 `grep -c "notes-notice"` 增量 **0**）；高亮侧**不弹任何提示** | §5.4 走查 #12 / #13 |

### 1.6 N95 断言与场景清单（冻结配额）

| 面 | 冻结内容 | 判据 |
| --- | --- | --- |
| 烟测-渲染 | `smoke-view.mjs` 新增 2 组 **16** 条：`notes-by-page` **6** + `excerpt-match` **10**（既有 5 组 35 条 ⇒ 7 组 **51** 条） | §5.1（末行逐字 `通过 51 / 失败 0`） |
| 烟测-主进程 | `smoke-notes.mjs` **零改动**（10 组 65 条只作回归） | §5.2 |
| 离屏场景 | `r16-1`…`r16-5` 五场景 / 五组 / **14** 条 `record` / **13** 张截图 / 新增 **5** 种 label | §5.3 |
| label 与条数 | `r16-page-badge:3` / `r16-page-anchor:3` / `r16-note-highlight:3` / `r16-highlight-coexist:2` / `r16-degrade:3` = **14**（label 去重 59 ⇒ **64**） | §5.3.4 判据 1 |
| `SEL` 增量 | **4** 项（60 → **64**）：`pageNotes: ".page-notes"` / `noteRowAnchored: ".note-row.is-anchored"` / `pageBoxOne: '.pdf-page[data-page="1"]'` / `notePageBadge: ".note-page-badge"` | §5.3.1 |
| stub 面 | **零改动**（`api` 恒 42 方法、无新控制口、无失败注入口） | §5.3.4 判据 4；§5.4 走查 #11 |
| 越界判定 | 本次**不跑**离屏；所有读数为步骤/判据声明，留给开发步 | §5.3.5 |

---

## 2. 与既有冻结面的关系

### 2.1 本轮不得改动的既有类名 / 文案 / 场景 / 断言（零改动清单）

| 面 | 冻结内容 |
| --- | --- |
| R11 文字层 | `.pdf-page` 的直接子元素前三个（`canvas` / `.textLayer` / `.pdf-overlay`）与 `--scale-factor` 的写入时机（`renderPage` `:205`）与取值；`.textLayer` 内 span 集合与文本；`color: transparent`；`.textLayer` 的 `inset: 0` / `z-index: 1` |
| R11 搜索高亮 | `pix-search` / `pix-search-current` 两个注册表名、两条 `::highlight()` 规则（`:1303-1305` / `:1307-1310`）、`PdfSearchPanel.vue` 的 `clearHighlights()` 删除范围（只删自己两个名字）、搜索面板的输入 / 上一处 / 下一处 / 关闭控件与文案、`LAYER_WAIT_TIMEOUT_MS = 5000`、`DEBOUNCE_MS = 300` |
| R3 / R11 选区浮层 | `.quick-ask` 与其浮层定位（`emitNotesAsk` / `PdfSelectionQuickAsk.vue` 零改动）、`selectionchange` → `readerStore.setSelectedText` 链路、`.capture-mode` 下文字层与 overlay 的 `pointer-events: none` |
| R12 章节 chip 与上/下一节 | `.reader-section` / `.reader-section-chip` / `.reader-section-prev` / `.reader-section-next` 的字面、位置（`bottom: 46px` 居中）与 `[` `]` 键位语义；`.reader-section` 的 `pointer-events: none` + 子元素 `auto` |
| R6 / R11 页码 pill | `.pdf-page-indicator` / `.page-label` / `.page-input` 的文本与 `第 {N} / {M} 页` 格式、`gotoPage` 语义、触底钳制（`updateCurrentPage` `:292-322`） |
| R8 / R9 / R10 / R13 / R14 面板 | `.notes-*` 既有类名与文案（含 `.notes-count` / `countLabel` 四分叉、`.notes-chapter-filter*` 与 `清除`/title、`.notes-notice` + `.notice-text`、`.notes-stale*`、`.notes-report-*`、`.notes-undo*`、`.notes-export-row`、五条空态文案与 `LIST_EMPTY_CLASS` 映射）、`.note-*` 结构与文案（含 `.note-page-badge` 逐字 `第 {N} 页`、`.note-row.selected` / `.confirming` 的配色）、编辑态语义（`startCommentEdit` / `saveComment`） |
| 全局 | `.pdf-*` / `.map-*` / `.tree-*` / `.reader-*` 既有类名与中文文案；`--pix-*` 变量表（**不新增变量**）；`pix/src/main/**` 与 `pix/src/shared/types.ts`（**两个文件零 diff**）；`pix/package.json`（沿用既有 `smoke:view`，不新增 script）、`package-lock.json`、`packages/**`、`electron-builder` 配置 |
| R12 / R13 / R14 取证契约 | `ui-shot.mjs` 的启动守卫、产物自净（只删 `<OUT_ROOT>/shots`）、结束自检（清单与磁盘双向相等 + 白名单外条目即失败）、`record` 的「先落测量再抛错」、`SEL` 与既有 153 张截图 / 223 条测量 / 59 种 label **零删除零改写** |
| 既有烟测 | `smoke-view.mjs` 既有 5 组 35 条与 `files` / `required` / `allowed` 的既有项零改动（只各追加 1 项）；`smoke-notes.mjs` 整文件零 diff |

### 2.2 本轮对既有面的显式改动（逐字：文件 / 旧值 / 新值 / 理由）

| # | 文件 : 位置 | 旧值（逐字 / 现状） | 新值（逐字） | 理由 |
| --- | --- | --- | --- | --- |
| 1 | `pix/src/renderer/components/workspace/PdfViewer.vue` : `releasePage`（`:250-264`） | 函数体止于 `if (pageEl) clearPageLayers(pageEl);` | 末尾追加一行 `clearNoteAnchor();`（既有语句零改写） | §1.4.6 清空时机 ③（M3 的口径修正：允许各新增 1 处调用，而非「函数体零 diff」） |
| 2 | `PdfViewer.vue` : `loadPdf` 起始段（`:637-651`） | `readerStore.setOutline([])` / `readerStore.setSelectedText("")` / `await destroyDocument();` 等既有行 | 起始段追加一行 `clearNoteAnchor();` + `anchorTextCache.clear();`（文档切换清缓存） | §1.4.6 清空时机 ① 与 §1.4.4 ③ 的缓存纪律 |
| 3 | `PdfViewer.vue` : scale watcher（`:817-828`） | watcher 体内 `for (const pageNumber of [...renderedPages]) releasePage(pageNumber);` + `await nextTick();` + `observePages();` + `scrollToPage(readerStore.page);` | 追加一行 `clearNoteAnchor();`（放在 `releasePage` 循环之后、`await nextTick()` 之前） | §1.4.6 清空时机 ②（页面重渲染前清掉指向旧节点的区间） |
| 4 | `PdfViewer.vue` : `onBeforeUnmount`（`:855-874`） | 既有解绑与 `destroyDocument()` | 追加一行 `clearNoteAnchor();` 与 `if (anchorWaitId !== null) { cancelAnimationFrame(anchorWaitId); anchorWaitId = null; }` | §1.4.6 清空时机 ④ + 等待句柄清理（§5.4 走查 #10） |
| 5 | `PdfViewer.vue` : `renderPage` 末尾（`:246-247` 之后） | `try { await textLayer.render(); } catch { … } finally { textLayers.delete(pageNumber); }` | 追加一行 `scheduleNoteAnchor();`（**唯一新增的调用点**；既有语句零改写） | §1.4.5 触发 ④（文字层渲染完成后补画） |
| 6 | `pix/scripts/smoke-view.mjs` : `files`（`:428` 起的数组） | 3 个源文件（`outline-notes.ts` / `notes-path.ts` / `reading-context.ts`） | 追加 `join(REPO_DIR, "pix", "src", "renderer", "utils", "page-anchor.ts")` | R16-req §7 白名单第 7 条**显式登记的变更**：新文件必须进入编译面，否则产物校验判「多出」 |
| 7 | `pix/scripts/smoke-view.mjs` : `required` | 生产物清单 | 追加 `"renderer/utils/page-anchor.js"` | 同上（`allowed` 由 `required + "shared/types.js"` 派生，自动覆盖） |
| 8 | `pix/scripts/smoke-view.mjs` : `main()` 调用序（`:560-566`） | `runSectionHit → runSectionNull → runSectionNav → runSectionFormat → runBadgeCounts` | 追加 `runNotesByPage();` 与 `runExcerptMatch();`（追加在末尾） | §5.1 |
| 9 | `pix/scripts/ui-shot.mjs` : `SEL`（`:47-113`） | **60** 项（含 `pdfPageOne` `:59` = `.pdf-page[data-page="1"] .textLayer span`） | 追加 4 项（`pageNotes` / `noteRowAnchored` / `pageBoxOne` / `notePageBadge`）；**`pdfPageOne` 逐字不动**（4 处既有使用 `:1345` / `:1381` / `:1429` / `:1457`） | §5.3.1（M2） |
| 10 | `pix/scripts/ui-shot.mjs` : `runReaderStateScenarios` 末尾（`:9249` 之后、`:9250` 之前） | 函数收口 `}` 前最后一条语句是 `r15-f16` 的 `record(...)` | 追加 R16 块：10 个 helper + `seedR16Focus()` + 5 个场景（5 组 14 条 record / 13 张截图），每场景以自己的 `restoreStandardSeed()` 收尾 | §5.3 |

**允许的内容变化（非 diff，登记）**：① 有笔记的页新增一枚 `.page-notes`（既有截图里出现新元素）；② 定位后目标行短暂出现 `is-anchored`（只改边框色与背景，2s 后消失）；③ 定位退化时出现 4s 瞬时 `.notes-notice`；④ 高亮出现 / 消失（不改 DOM、不改几何）；⑤ 点击页标记清空章节过滤后 `.notes-chapter-filter` 块消失（**仅 `r16-2` 相位内**）；⑥ 标记在自身面积内覆盖 `.textLayer` 的像素（DOM 与几何不变，§1.1.4 登记取舍）。

**本轮改写的既有断言（逐字列出）**：**无**。`git diff -- pix/scripts/ui-shot.mjs | grep -E "^[-]" | grep -v "^---"` 只允许出现 §2.2 #9 / #10 两处的相邻行位移（`SEL` 尾部的 `};` 行与函数收口 `}` 行的前缀变化）；`git diff -- pix/scripts/smoke-view.mjs | grep -E "^[-]"` 只允许出现 §2.2 #6 / #7 / #8 三处的相邻行位移。

### 2.3 零 diff 判据命令

```bash
cd E:/develop/PiX-Read
# 既有冻结面（本轮必须零 diff）
git diff -- pix/src/main pix/src/shared/types.ts pix/src/renderer/components/workspace/PdfSearchPanel.vue \
           pix/src/renderer/components/workspace/ReaderPanel.vue pix/src/renderer/components/workspace/KnowledgeMap.vue \
           pix/src/renderer/components/workspace/LibraryPanel.vue pix/src/renderer/components/workspace/ChatPanel.vue \
           pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue \
           pix/src/renderer/utils/outline-notes.ts pix/src/renderer/utils/notes-view.ts pix/src/renderer/utils/reading-context.ts \
           pix/src/renderer/stores/reader-store.ts pix/src/renderer/stores/reader-state-store.ts \
           pix/src/renderer/stores/project-store.ts pix/src/renderer/stores/chat-store.ts \
           pix/src/renderer/assets/styles pix/package.json package-lock.json packages \
           pix/tsconfig.json pix/tsconfig.main.json pix/tsconfig.preload.json pix/vite.config.ts \
           pix/scripts/smoke-notes.mjs pix/resources README.md .gitignore
# ⇒ 全部路径逐条为空

# 既有 .pdf-page / .textLayer / .pdf-overlay 规则名不得作为 + / - 行出现
git diff -U0 -- pix/src/renderer/components/workspace/PdfViewer.vue | grep -E "^[+-].*\.(pdf-page|pdf-scroll|textLayer|pdf-overlay|capture-layer)" | grep -v "^+++" | grep -v "^---"
# ⇒ 空（R16 只新增 .page-notes 两条规则与第三条 ::highlight 规则）

# 既有两条 ::highlight 规则零 diff
git diff -U0 -- pix/src/renderer/components/workspace/PdfViewer.vue | grep -E "^[+-].*::highlight\(" | grep -v "^+++" | grep -v "^---"
# ⇒ 只允许出现第三条规则的 + 行（含 pix-note-anchor 字样）
```

---

## 3. 失败路径表

| # | 情形 | 期望表现（逐字） | 证据 / 判据 |
| --- | --- | --- | --- |
| 1 | **`currentDocKey === null`**（资料库外文件 / 未选库） | 整篇不渲染任何标记；`countNotesByPage` 返回空 Map；点击动作（若被调用）**no-op**（零副作用）；高亮不参与 | 烟测 `notes-by-page` #2；§1.1.1 门控 1；§1.3.3 ① |
| 2 | **无笔记的页码**（`Map.get(页号) === undefined`） | 该页**不渲染**标记（零占位：无空胶囊、无 `0 条`、无 `v-else` 占位节点） | §1.1.1 门控 3；`r16-1` 相位 `badges`（页 3 `querySelector` 为 `null`）；`r16-5` 相位 `zero-page`（60 页全无标记） |
| 3 | **整个文档 0 条笔记** | 所有页无标记；注册表不存在；不弹任何提示 | `r16-5` 相位 `zero-page` ①②③（防空：`.pdf-page` 计数 60） |
| 4 | **笔记页号越界**（文档被换成更短版本后留下的 p9 笔记） | 不渲染任何标记、**不钳制**、**不改写 `notes.json`**；面板照常显示该条 | §1.2.1 页号守卫；`r16-1` 相位 `other-doc`（`readNotes()` 中该条 `page` 逐字仍为 `7`） |
| 5 | **非法页号**（`0` / `-2` / `1.5` / `NaN`） | `countNotesByPage` 不产生任何键（不抛错、不占位） | 烟测 `notes-by-page` #3（四条夹具 ⇒ `size === 0`） |
| 6 | **定位时面板处于 `loading`**（`loadNotes` 在途，`.notes-list` 整体不在 DOM） | **等待窗口内吸收**（按帧轮询到 `status === 'ready'` 且目标行入 DOM）；**不**弹退化提示；上限 `LOCATE_WAIT_MS = 3000` 到期才退化 | §1.3.6；`r16-2` 相位 `locate-panel-closed` ⑩（发生在 loading 窗口之后） |
| 7 | **`status === 'error'`**（`notes.json` 读取失败，面板错误态） | 立即退化（`status === 'ready'` 之后连续 2 帧判据不适用错误态）：不滚动、不加类、弹既有 `.notes-notice.is-error` 逐字 `本页笔记不在当前筛选结果中` | §1.3.6 终端态②；§3 第 9 行（错误态下标记的数据来源 = 失败前的 `notesStore.notes`，见下） |
| 8 | **目标行确实不在 DOM**（搜索 / 章节过滤掉、当前文档分组不存在、该页笔记已删除、外部刷新后消失、空态） | `status === 'ready'` 后**立即**退化（不空等满 3s）：不滚动、不加类、弹同一条提示；`setSearch("")` 复原后**再次点击可成功**（退化不粘滞） | §1.3.6；`r16-2` 相位 `degrade-filters` ⑬⑭ |
| 9 | **`notesLoad` 长时间不返回**（超 `LOCATE_WAIT_MS`） | 上限到期 ⇒ 退化提示（同上）；等待句柄在 `onBeforeUnmount` 内被 `cancelAnimationFrame` 清理 | §1.3.6 终端态③ |
| 10 | **等待期内新一次定位 / 组件卸载** | **作废本次等待**：丢弃、不滚动、不加类、不提示（不留下指向旧目标的写入） | §1.3.6 令牌；`r16-2` 相位 `locate-panel-open` 与 `degrade-filters` 连续点击切换时不产生双高亮 |
| 11 | **无文字层（扫描件 / 纯图片页）** | 标记**照常显示**（计数不依赖文字层）；高亮**静默降级**：等待 `ANCHOR_LAYER_WAIT_MS = 2000` 到期即放弃（不报错、不弹提示、不写日志、不重试、不阻塞滚动） | §1.4.7；`r16-5` 相位 `no-text-layer` ⑤⑥⑦（清空文字层子节点模拟扫描件） |
| 12 | **摘录不可匹配**（被改写 / 跨页 / 页文本缺失 / 摘录比页文本更长） | 静默降级：不抛错、不弹提示、不写日志、不重试、不占位；该页其它可匹配摘录**照常标出** | §1.4.3；`r16-3` 相位 `unmatched-silent` ⑦（`n-current-2` 比页 2 文本长） |
| 13 | **折叠后长度 > `MAX_ANCHOR_TEXT_LENGTH = 400`** | 跳过该条（不匹配、不报错）；长度恰 400 ⇒ 参与匹配 | 烟测 `excerpt-match` #8 |
| 14 | **区间不可重建**（`at` 命中假分隔符、节点已不在当前文档） | `anchorRangeFor`（`PdfViewer.vue` 内）返回 `null` ⇒ 丢弃该区间（不重试）；其余区间照常绘画；整页全丢 ⇒ `has === false` | §1.4.4 ⑤；§1.4.4 的调用方参考实现 |
| 15 | **该页摘录集合为空**（0 条 / 全是 AI 结论 / 全属其它文档） | 删除注册表（`CSS.highlights.has("pix-note-anchor") === false` 为「无高亮」的唯一判据）；标记不受影响 | §1.4.4 ⑥⑦ |
| 16 | **匹配失败后回到可匹配页** | 注册表恢复（`size ≥ 1`、区间文本不变）——**降级不是永久失效** | `r16-3` 相位 `unmatched-silent` ⑧；`r16-5` 相位 `no-text-layer` ⑦（缩放回来后重建文字层） |
| 17 | **快速连续翻页**（两次点击之间不等待） | 等待作废语义生效：`pix-note-anchor` 非空时其区间所属 `.pdf-page` 的 `data-page` **恒等于**当前页号；不得残留旧页区间 | §1.4.7 可判定式；`r16-3` 相位 `unmatched-silent` 续段 ⑩ |
| 18 | **翻页性能**（10 次交替翻页） | 逐次「点击 → 页面 pill 更新」读数：`maxMs ≤ 1000`、`totalMs ≤ 6000`、`revisitMs` 的 `max ≤ 300ms`（读数一律登记进 `data`） | `r16-3` 相位 `unmatched-silent` 续段 ⑨（§5.3） |
| 19 | **框选模式** | 标记仍在（视觉）；点击被 `.capture-layer`（`z-index: 5`）拦截（**不新增分支**）；高亮仍在（不因进入框选而清除） | §1.1.5；`r16-1` 相位 `badges` 判据 ③（`.capture-layer` 的 `z-index` 逐字 `"5"`） |
| 20 | **载入中 / 载入失败 / 非 PDF** | 无 `.pdf-page` ⇒ 无标记、无高亮、**无新增代码路径**（不新增加载态或错误态文案；错误态由既有 `.pdf-error` 承担） | §1.1.1 门控 2；`grep -c "page-notes" ReaderPanel.vue` = 0、`grep -c "page-notes" WorkspacePage.vue` = 0 |
| 21 | **外部改动 + 面板刷新（R14 通道）** | 标记与高亮按**新列表**重算：被移动页的笔记改变标记所在页；被删除笔记的高亮消失；新增摘录在当前页可匹配则出现；刷新本身**只读**（不改 `notes.json` 字节） | `r16-5` 相位 `external-refresh` ⑧⑨⑩⑪⑫ |
| 22 | **面板内删除 / 撤销 / 新建摘录** | 标记与高亮实时跟随（同一份 `notesStore.notes`），**无额外 IPC** | `r16-1` 相位 `live` ⑥⑦⑧⑨；§5.4 走查 #1（`PdfViewer.vue` 内 `notesStat\|notesLoad\|notesAdd\|ipcRenderer` 零命中） |

---

## 4. 文件级清单（动作 + 具体改动点 + 不变量）

| # | 文件 | 动作 | 具体改动点 | 不变量 |
| --- | --- | --- | --- | --- |
| 1 | `pix/src/renderer/utils/notes-path.ts` | 修改 | 新增 `PageNoteCount` 接口与 `countNotesByPage(notes, docKey): Map<number, PageNoteCount>`（§1.2.1，单次遍历 + 非法页号跳过 + 只产出 `total > 0` + 每次新 Map）；落点紧接 `countNotesByDocument`（`:73-84`）之后 | 既有 9 个导出零 diff；`for (` 由 3 → 4；不写第二份文档归属比较（复用 `docPathKey`） |
| 2 | `pix/src/renderer/utils/page-anchor.ts` | **新建** | 只放 §1.4.3 的类型与纯函数（`FoldedText` / `AnchorRange` / `AnchorExcerpt` / `MAX_ANCHOR_TEXT_LENGTH` / `foldText` / `matchExcerpts`）；Range 重建（`AnchorSegment` / `anchorRangeFor`）按 req §0.7 归调用方 `PdfViewer.vue` | **零 import**、**零 DOM**、零全局读取、不抛错、不改入参；`grep -c "for ("` ≤ **2**；无 `any`；无内联动态 import |
| 3 | `pix/src/renderer/components/workspace/PdfViewer.vue` | 修改 | 新增：`useNotesStore` import、`pageNotes`（`computed`，唯一 `countNotesByPage` 调用点）、`pageNotesForRender` 模板取数列表（每页 1 次 `Map.get`；模板用 `?.` 取值）、模板 `.page-notes`（`.pdf-page` 第 4 个子元素、`v-if` 单分支）、两条 `.page-notes` 样式、`onPageNotesClick(page)`、`HIGHLIGHT_NOTE_ANCHOR` / `ANCHOR_LAYER_WAIT_MS`、`HighlightRegistryWriter` 本地别名 + `anchorRegistry()`、`clearNoteAnchor()`、`anchorTextCache` / `anchorToken` / `anchorWaitId`、`scheduleNoteAnchor()` / `paintNoteAnchor()`、局部 `AnchorSegment` / `anchorRangeFor()`（DOM Range 重建，§1.4.4）、第三条 `::highlight()` 规则、四个清空调用点与一个触发调用点（§1.4.6 / §1.4.5） | `.pdf-page` / `.pdf-scroll` / `.textLayer` / `.pdf-overlay` / `.capture-layer` 的 CSS 规则名零 diff；`pageElement` / `observePages` / `updateCurrentPage` / `clearPageLayers` / `captureRegion` / `toLayerPoint` / `onCapturePointerDown` 函数体零 diff；`releasePage` / `loadPdf` 起始段 / scale watcher / `onBeforeUnmount` / `renderPage` 末尾**各新增 1 处调用**（既有语句零改写）；既有两条 `::highlight()` 零 diff；既有键盘 / 缩放 / 框选 / 页码逻辑零 diff；`addEventListener` 增量 0；`setInterval` 仍为 0 |
| 4 | `pix/src/renderer/stores/notes-store.ts` | 修改 | 新增 `pageFocusPage` / `pageFocusToken` 两个 ref（`:122` 之后）、`focusPageNotes(page)` 动作（§1.3.3，放在 `clearChapterFilter` `:456` 之后）、`resetNotes()` 两行复位、`return` 两个成员 | 既有 `focusChapter` / `clearChapterFilter` / `chapterFilter` / `chapterFocusToken` / `groups` / 指纹逻辑 / 竞态令牌语义零 diff；`grep -c "pageFocusToken"` = 4；`chapterFilter.value = null` 的新增行恰 1 处（在 `focusPageNotes` 内） |
| 5 | `pix/src/renderer/pages/WorkspacePage.vue` | 修改 | 新增 `pageFocusToken` watcher（§1.3.4，放在 `:215-221` 之后） | `selectLeftTab` / `onOpenNote` / `onOpenNoteDoc` / `openDocumentFromLibrary` / 既有 `chapterFocusToken` watcher 零 diff；`grep -c "token <= 0 \|\| token <= previous"` 增量恰 1 |
| 6 | `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | 新增：`ANCHOR_HIGHLIGHT_MS` / `LOCATE_WAIT_MS` / `ANCHOR_MISS_MESSAGE` 常量、`pageFocusToken` watcher（有界等待 + 目标行 + `scrollIntoView` + `is-anchored` + 退化提示）、`locateWaitId` / `anchorTimer`、`panelEl` 模板 ref（挂 `.notes-panel`，供目标行查找）、目标行与等待的辅助函数、`.note-row.is-anchored` 两条样式（§1.3.7，放在既有 `.note-row.confirming` 之后）、`onBeforeUnmount` 的定时器 / rAF 清理 | 既有 `.notes-*` 文案与 DOM 顺序零 diff；`.note-row` / `.note-row.selected` / `.note-row.confirming` 规则零 diff；`LIST_EMPTY_CLASS` / `emptyText` / `countLabel` / `setNotice` 语义零 diff；编辑态与撤销 / 导出 / 报告逻辑零 diff；不新增第二种提示容器（`grep -c "notes-notice"` 增量 0）；既有四个定时器清理逐字不动 |
| 7 | `pix/scripts/smoke-view.mjs` | 修改 | 新增 `PIN_SEED` / `ANCHOR_PARTS` 等夹具常量、`runNotesByPage`（6 条）/ `runExcerptMatch`（10 条）、`init` 的 `pageAnchor` 句柄与 `require(join(OUT_DIR, "renderer", "utils", "page-anchor.js"))`、`main()` 两行调用；`files` / `required` 各追加 1 项（§2.2 #6 / #7） | 既有 5 组 35 条与 `WINDOW_SHIM` / 编译选项 / 产物逐项校验 / 输出与自清理协议零 diff；期望值一律**手写**（不由被测函数生成）；运行后 `%TEMP%` 自建目录被删除 |
| 8 | `pix/scripts/ui-shot.mjs` | 修改 | `SEL` 追加 4 项（§5.3.1）；新增 10 个 helper（§0.3）与 `seedR16Focus()`；新增 `r16-1`…`r16-5`（5 组 14 条 record / 13 张截图），追加在 `:9249` 之后、`:9250` 之前 | stub 面零改动（42 方法、无新控制口）；既有场景 / 相位 / label / 截图名 / helper 零删除零改写；`SEL` 只增 4 项且 `pdfPageOne` 逐字不动；`record` 语义不变；每个新场景以自己的 `restoreStandardSeed()` 收尾 |
| 9 | `pix/src/renderer/components/workspace/PdfSearchPanel.vue` | **不改**（登记为不动） | —— | §0.0 第 3 条：不与搜索面板共用实现；搜索高亮的注册表 / 样式 / 等待逻辑逐字不动 |
| 10 | `pix/src/main/**`、`pix/src/shared/types.ts`、`pix/scripts/smoke-notes.mjs`、`pix/package.json` | **不改**（登记为不动） | —— | 本轮零 IPC、零类型、零 script：`PixApi` / `api` / stub 面恒 **42** 方法；`smoke-notes.mjs` 10 组 65 条只作回归 |
| 11 | `docs/pm/R16-design.md` | 新建（本档） | —— | 不改源码 |

**范围外（任何情况下不动）**：`packages/**`、`package-lock.json`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/src/renderer/assets/styles/**`（含 `variables.css`）、`pix/src/renderer/utils/{outline-notes.ts,notes-view.ts,reading-context.ts}`、`pix/src/renderer/components/workspace/{ReaderPanel,KnowledgeMap,ChatPanel,PdfSelectionQuickAsk,LibraryPanel}.vue`、`pix/src/renderer/stores/{reader-store,reader-state-store,project-store,chat-store}.ts`、`pix/src/main/**`、`pix/resources/**`、`docs/pm/**` 的历史档件、`.gitignore`、`README.md`。

---

## 5. 验证方案

### 5.1 渲染层纯函数烟测（`pix/scripts/smoke-view.mjs`，2 组 16 条）

**冻结的组与条数（不得减少）**：`notes-by-page` **6** / `excerpt-match` **10** = **16 条**；追加在既有 5 组（35 条）之后，`main()` 调用顺序固定为 `runSectionHit → runSectionNull → runSectionNav → runSectionFormat → runBadgeCounts → runNotesByPage → runExcerptMatch`；末行仍逐字 `通过 {passed} / 失败 {failed}`（改后期望 `通过 51 / 失败 0`）。

#### 5.1.1 新增常量与夹具（逐字）

```js
/** 页标记夹具：与 BADGE_SEED 同构（4 条），用于 notes-by-page 的计数口径。 */
const PIN_SEED = [
  { id: "p-1", kind: "excerpt", docPath: "sample-paper.pdf", page: 1, text: "pin 1", comment: "", createdAt: 1, updatedAt: 1 },
  { id: "p-2", kind: "excerpt", docPath: "sample-paper.pdf", page: 2, text: "pin 2", comment: "", createdAt: 2, updatedAt: 2 },
  { id: "p-3", kind: "answer", docPath: "sample-paper.pdf", page: 2, text: "pin 3", comment: "", createdAt: 3, updatedAt: 3 },
  { id: "p-4", kind: "excerpt", docPath: "archive/older-paper.pdf", page: 7, text: "pin 4", comment: "", createdAt: 4, updatedAt: 4 },
];
/** 比较键归一：大小写与尾反斜杠合并（与 BADGE_CASE 同口径）。 */
const PIN_CASE = [ /* Sample-Paper.PDF / 尾反斜杠 / 同页合法页号，三条 */ ];
/** 非法页号四条（0 / -2 / 1.5 / NaN）。 */
const PIN_BAD_PAGE = [ /* … */ ];
/** 跨片段夹具（页 1 的前两个文本项，逐字取自 SAMPLE_PAGES）。 */
const ANCHOR_PARTS = [
  "Abstract. We study retrieval over long documents where the",
  "attention budget is the binding constraint. Our method keeps",
];
/** 手写期望串（不由被测函数生成）。 */
const ANCHOR_NEEDLE = "We study retrieval over long documents where the attention budget is the binding constraint.";
const ANCHOR_MISS = "Table 2 reports the ablation over the sparse mask budget. Removing the positional prior costs 2.4 points of recall, which confirms the mask is doing more than sparsification alone.";
/** 中文夹具与超长夹具。 */
const ANCHOR_CN_PAGE = ["稀疏注意力在三分之一的预算下保持召回，", "位置先验是关键。"];
const ANCHOR_CN_NEEDLE = "稀疏注意力在三分之一的预算下保持召回，位置先验是关键。";
const LONG_400 = "x".repeat(400);
const LONG_401 = "x".repeat(401);
```

#### 5.1.2 组 `notes-by-page`（6 条）

前置：`notesPath.countNotesByPage` 可直驱（`notesPath` 句柄已加载）；期望值一律手写。

| # | 断言（失败即红） |
| --- | --- |
| 1 | `countNotesByPage(PIN_SEED, "sample-paper.pdf")` ⇒ `size === 2`；`get(1)` 逐字段 `{ total: 1, excerpt: 1, answer: 0 }`；`get(2)` 逐字段 `{ total: 2, excerpt: 1, answer: 1 }`；`get(3) === undefined`（与 `BADGE_SEED` 的文档级口径 #1 同构、逐字段比对。） |
| 2 | `countNotesByPage(PIN_SEED, null)` ⇒ 空 Map（`size === 0`，不抛错；与 `matchesChapterFilter` 的空键守卫同口径） |
| 3 | `countNotesByPage(PIN_BAD_PAGE, "sample-paper.pdf")` ⇒ `size === 0`（四条非法页号 `0` / `-2` / `1.5` / `NaN` **不产生任何键**） |
| 4 | 归属与比较键：`countNotesByPage(PIN_CASE, "sample-paper.pdf")` ⇒ `size === 1` 且同页合并计数正确；`countNotesByPage(PIN_SEED, "sample-paper.pdf").get(7) === undefined`（`archive/older-paper.pdf` 的 p7 在 `docKey = "sample-paper.pdf"` 下**不产生键**） |
| 5 | 恒等式：同页 1 摘录 + 1 结论 ⇒ `total === excerpt + answer === 2`（逐值断言；`kind` 只有两态） |
| 6 | 纯性 + 新对象：入参 `JSON.stringify(PIN_SEED)` 调用前后逐字不变；`first !== second`；改第一次结果（`first.get(2).total = 99`）不影响第二次（`second.get(2).total === 2`） |

#### 5.1.3 组 `excerpt-match`（10 条）

前置：`pageAnchor.foldText` / `matchExcerpts` 可直驱（`pageAnchor` 句柄；Range 重建属调用方 DOM 实现，不在烟测直驱面，见 §5.1.4）。

| # | 断言（失败即红） |
| --- | --- |
| 1 | 跨片段命中：`matchExcerpts(foldText(ANCHOR_PARTS), [{ key: "k1", text: ANCHOR_NEEDLE }])` ⇒ 恰 1 条区间，`page.text.slice(start, end)` 逐字等于 `foldText([ANCHOR_NEEDLE]).text`（手写期望串；`page.text` 已小写），且 `page.text.indexOf(foldText([ANCHOR_NEEDLE]).text) === start`（**折叠域内**的严格子串；手写大写的 `ANCHOR_NEEDLE` 直接 `indexOf` 恒为 `-1`） |
| 2 | 中文与大小写：`foldText(ANCHOR_CN_PAGE)` + `ANCHOR_CN_NEEDLE` ⇒ 命中；`foldText(["HTML basics"])` + `"html"` ⇒ 命中；`foldText(["html basics"])` + `"HTML"` ⇒ 命中（`toLowerCase` 对称） |
| 3 | 空白差异等价：页面用制表 / 多空格 / 换行三种写法 `foldText(["a\tb", "c   d"])` / `foldText(["a b c d"])` ⇒ 折叠文本逐字相等；含空白摘录 `"a  b"` 与页面 `["a", "b"]` ⇒ 命中；`\s+` 折叠为恰一个空格（不丢字符、不跨行合并成空） |
| 4 | 跨行与 `trim` + 回溯表不变量：`foldText(["alpha", "beta"])` ⇒ `text === "alpha beta"`（片段边界折叠为**恰一个空格** —— 该空格同时是 #1 跨片段命中的唯一手段）；`foldText(ANCHOR_PARTS)` 的 `at.length === text.length` 且非 `-1` 的下标严格递增；摘录首尾带空白 ⇒ 仍命中 |
| 5 | 不可匹配：`matchExcerpts(foldText(["short page"]), [{ key: "k", text: ANCHOR_MISS }])` ⇒ `[]`（不抛错、不返回近似区间） |
| 6 | 重复文本：页面含同一子串两次 ⇒ 恰 1 条区间且 `start` 指向**第一次**出现（`start === page.text.indexOf(needle)`） |
| 7 | 重叠：`A ⊂ B` 且 B 先给 ⇒ 保留 B、丢弃 A；交换顺序 ⇒ 保留 A、丢弃 B（先到者获胜、后来者整体丢弃） |
| 8 | 超长边界：`matchExcerpts(foldText([LONG_401 + " tail"]), [{ key: "k", text: LONG_401 }])` ⇒ `[]`（401 跳过）；`LONG_400` ⇒ 参与匹配（恰 400 命中，`start === 0`、`end === 400`） |
| 9 | 空 / 全空白与确定性：空串摘录 ⇒ `[]`；全空白摘录 ⇒ `[]`；三条摘录中第 2 条不可匹配 ⇒ 返回顺序 === 被接受输入的子序（`["k1", "k3"]`） |
| 10 | 纯性 + 新对象：入参 `JSON.stringify` 逐字不变；两次调用 `JSON.stringify` 相等但对象不同（`first !== second`）；`foldText([])` ⇒ `{ text: "", at: [] }` |

#### 5.1.4 组 `page-anchor-range`（**不新增组**：并入 `excerpt-match` 的 #1 / #4 内联核对）

Range 重建（`PdfViewer.vue` 内局部函数 `anchorRangeFor`）的判据落在离屏（§5.3 的 `r16-3` 相位 `anchor-painted` ①）与 `excerpt-match` #4 的 `at` 结构性不变量上；`page-anchor.ts` 本体完全无 DOM ⇒ 烟测只直驱 `foldText` / `matchExcerpts`，**不**在烟测里构造 DOM（`smoke-view.mjs` 的 `WINDOW_SHIM` 只补 `window.pixApi`，不补 `Text` / `Range` / `document`）⇒ 条数配额不变。**登记为设计取舍**：DOM Range 级断言在离屏（真实 DOM）里更可靠。

### 5.2 主进程数据面烟测（`pix/scripts/smoke-notes.mjs`）

| 项 | 冻结 |
| --- | --- |
| 文件 | **整文件零 diff**（10 组 65 条：`runUndoRoundtrip` / `runUndoFailures` / `runUndoSlotLifecycle` / `runExportAndEmpty` / `runReportRender` / `runReportFiles` / `runReportFailures` / `runNotesStat` / `runLibraryRootContainment` / `runReaderStateStore`） |
| 理由 | 本轮零 IPC、零 `notes.json` 改动、零主进程改动（§0.0 第 3 条） |
| 判据 | `npm run smoke:notes` 末行逐字 `通过 65 / 失败 0`；连续两次运行结果相同 |

### 5.3 离屏场景 `r16-*`（5 场景 / 5 组 / 14 条 record / 13 张截图）

#### 5.3.1 `SEL` 增量、新 helper 与夹具增量

**`SEL` 增量（恰 4 项，60 → 64）**

| 键 | 值 | 说明 |
| --- | --- | --- |
| `pageNotes` | `.page-notes` | 标记（文本 / title / 矩形 / `position` / `z-index` / 是否存在） |
| `noteRowAnchored` | `.note-row.is-anchored` | 定位后的目标行 |
| `pageBoxOne` | `.pdf-page[data-page="1"]` | **页级截图**的取点（**新键**；既有 `pdfPageOne` `:59` = `.pdf-page[data-page="1"] .textLayer span` **逐字不动**，其 4 处既有使用 `:1345` / `:1381` / `:1429` / `:1457` 零改写） |
| `notePageBadge` | `.note-page-badge` | 目标行的页徽标文本（逐字 `第 {N} 页`） |

**新 helper（10 个，命名自由、语义冻结）**

| helper | 语义（一次 `js` 往返读回；**写操作仅限 ⑤ / ⑥ / ⑦ / ⑧ / ⑨**：⑤ 清空文字层、⑥ 建选区、⑦–⑨ 驱动 PDF 搜索面板） |
| --- | --- |
| `pageNotesProbe(page)` | 读回：`.pdf-page[data-page=N]` 的页矩形；该页 `.page-notes` 的 `{ exists, text, title, rect, position, zIndex }`；页容器 `children` 的类名序列（`<canvas>` 的类名为 `""`）；该页 `.textLayer` 的 `span` 计数与矩形集合；既有控件（`.pdf-toolbar` / `.pdf-page-indicator` / `.reader-section` / `.pdf-capture-fab` **恒读**；`.pdf-search-panel` **在场时读、不在场记 `null`**）的矩形；标记矩形与任一 span 矩形是否相交（该页 `span` 计数一并读回，供逐页 `> 0` 防空）；标记矩形与上述控件矩形（非 `null` 者）是否相交 |
| `anchorProbe()` | 读回：`CSS.highlights` 三个名字（`pix-note-anchor` / `pix-search` / `pix-search-current`）的存在性、`size`、`Array.from(h, (r) => r.toString())`；锚点区间的 `startContainer` 所在 `.pdf-page` 的 `data-page`；当前 `.page-label` 文本；页 1 的 `span` 计数与 `mark` 计数；`--scale-factor`；`canvas.style.width`；`.notes-notice` 的文本与类名；`[pdf-viewer]` 日志行数 |
| `panelRowProbe(page)` | 读回：`.notes-panel` 与 `.notes-header` 的矩形与 `.notes-panel` 的 `scrollTop`；当前文档组（含 `.notes-group-head .v-chip`）内 `第 {page} 页` 首行的矩形 / 是否含 `is-anchored` / 首行的 `getComputedStyle` 读值（`borderColor` / `backgroundColor`）/ 组内行数；`.notes-list` 是否存在；`.note-row` 总行数；`.notes-search-input` 的 `value`、`.notes-sort-btn` 文本、`.notes-filter input.checked`、`.notes-selection-bar` 是否存在、`.notes-chapter-filter` 是否存在 |
| `textLayerSnapshot(page)` | 读回该页 `.textLayer` 的 `childNodes` 的 `nodeName` 类型序列与各节点文本（零结构改动的两次快照比对） |
| `emptyTextLayer(page)` | **唯一写 DOM 的 helper**：清空该页 `.textLayer` 的子节点（`replaceChildren()`；模拟扫描件无文字层） |
| `selectionOnPageOne()` | 在页 1 的 `.textLayer` 上用 `Range` + `Selection` 选中首个 span 的一段文本（与既有 `:1429` 段的建 Range 手法同款），返回选中的字符串 |
| `pdfSearchSet(text)` | 在 `.pdf-search-panel .search-input` 上：`focus()` → 原生 `HTMLInputElement.prototype.value` setter 写值 → 派发 `input` 事件（与既有 `setSearch` `:5220` 同手法，但**不是**复用 —— 后者只写 `.notes-search-input`）；写值后由面板自身 `DEBOUNCE_MS = 300` 触发全文档扫描 |
| `pdfSearchNext()` | 点 `.pdf-search-panel button[title="下一处"]`（`totalHits === 0` 时该按钮 `disabled`，由相位保证已命中） |
| `pdfSearchClose()` | 点 `.pdf-search-panel button[title="关闭搜索"]`（面板卸载 ⇒ 搜索侧自清注册表） |
| `pageLabelProbe()` | 一次读回 `.page-label` 文本 + `.pdf-page-indicator button[title="下一页"]` / `[title="上一页"]` 的 `disabled`（性能采样用） |

**复用 helper（既有，零改写；R16 块直接引用）**：`loadCalls()` `:4350`（**唯一**读盘计数入口，内部读 `window.__pixStub.notesLoadCalls()`；req N92-2 判据 2 的 `notesLoadCalls()` 按场景内 `loadCalls()` 读）、`notesAddCalls()` `:2377`、`notesReportCalls()` `:7806`、`readNotes()` `:2375`、`notesHash()` `:2376`、`enterNotesProbe(seed, rows)` `:5211`、`backToLibraryTab()` `:4506`、`waitNotesTab()` `:4510`、`clickNext()` / `clickPrev()` `:1715-1716`、`openRow` `:1706`、`waitPdfLoaded()` `:1665`、`waitPage(page, count)` `:1666`、`openMap()` `:4376`、`ensureMapOpen()` `:5254`、`clickMapBadge(name)` `:4455`、`waitChapterFilter(text, rows)` `:4480`、`groupHeads()` `:5294`、`deleteRowByText(needle)` `:5309`、`clickUndo()` `:5349`、`notesNotice()` `:5356`、`triggerWindowFocus()` `:8404`、`writeNotesOutside(list)` `:8487`、`appendExternalNote(note)` `:8489`、`clickEl(selector)` `:7268`、`rectOfSelector` `:2564`、`waitFor` `:1593`、`record` `:1604`、`sleep` `:497`。

**缩放按钮（登记）**：放大 = 既有 `SEL.zoomInBtn`（`:83`）；**缩小无既有 `SEL` 键** ⇒ 用字面量选择器 `.pdf-toolbar button[title="缩小"]`（与既有相位 `:2187` 同手法）—— **不新增 `SEL` 键**（`SEL` 增量冻结为 4）。

**地图行就绪等待（登记）**：`ensureMapOpen()` 只等 `.knowledge-map-slot`；`clickMapBadge()` 找不到 `.map-row` 会 throw ⇒ 开图后必须先 `waitFor("地图行就绪", "document.querySelectorAll('.map-row').length === 7")`（既有 5 处用法同款）。

**夹具增量（`seedR16Focus()`，恰 14 条，逐条写死 —— 只用于 `r16-2`）**

| # | id | kind | docPath | page | 文本 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `n-current-1` | excerpt | `sample-paper.pdf` | 1 | 标准种子逐字（§0.1） | 页 1 标记 + 目标行 |
| 2 | `n-current-2` | excerpt | `sample-paper.pdf` | 2 | 标准种子逐字 | 页 2 标记 |
| 3 | `n-other-1` | excerpt | `archive/older-paper.pdf` | 7 | 标准种子逐字 | `setSearch("Reproducibility")` 的**唯一**命中行（退化相位前置） |
| 4 | `n-current-3` | answer | `sample-paper.pdf` | 2 | 标准种子逐字 | 页 2 的 AI 结论计数 |
| 5–13 | `n-r16-f1` … `n-r16-f9` | excerpt | `sample-paper.pdf` | 2 | 填充摘录（`id` 顺序递增，正文不参与任何断言。**恰 9 条**：`n-r16-f1` … `n-r16-f9`） | 把 `.note-row` 总数拉到 14 ⇒ 目标行初始不在可视区（防空）；章节过滤后行数 = 11 |
| 14 | `n-r16-p3` | excerpt | `sample-paper.pdf` | 3 | `Sparse attention keeps recall at one third of the dense budget,` | **页 3 唯一一条** ⇒ 目标行唯一 |

⇒ `sample-paper.pdf` **13** 条 + `archive/older-paper.pdf` **1** 条 = **14** 行；`waitChapterFilter("章节：2. Method Overview · 第 2 页", 11)` 的**11** = 2 条页 2 标准笔记 + 9 条填充摘录（M5 的收敛口径）。

#### 5.3.2 场景矩阵（逐相位：步骤 / 失败即红的断言 / `data` 字段）

**场景 `r16-1`（组 `r16-page-badge`，3 条 record，2 张截图）**

前置：`enterNotesProbe()`（标准种子 4 条、`sample-paper.pdf` 第 1 页、面板 4 行）。

| 相位 | 步骤 | 断言（失败即红） | `data` 字段 |
| --- | --- | --- | --- |
| `badges` | `waitFor` 到 `.page-notes` 计数 2 → `pageNotesProbe(1)` / `(2)` / `(3)` → 截图 `r16-1-page-badges.png`（`rectOfSelector(SEL.pageBoxOne, 8)`） | ① 页 1 逐字 `本页 1 条` / `本页 1 条笔记（摘录 1 · AI 结论 0）；点击定位到笔记面板`；页 2 逐字 `本页 2 条` / `本页 2 条笔记（摘录 1 · AI 结论 1）；点击定位到笔记面板`；② 页 3 无标记（`exists === false`）且 `.pdf-page` 计数 **3**（防空）；③ 子元素类名序列：有标记页逐字 `["", "textLayer", "pdf-overlay", "page-notes"]`、无标记页逐字 `["", "textLayer", "pdf-overlay"]`；④ 标记 `position === "absolute"`、`zIndex === "3"`；页矩形逐字 `w = 595` / `h = 842`；⑤ 标记矩形与页 1 / 页 2 的任一 span 矩形**不相交**（页 3 只判页 1 / 页 2；页 1 / 页 2 的 `span` 计数 > 0 防空 ⇒ 相交判定非空断言），且与既有控件矩形**不相交**（`.pdf-search-panel` 此时不在场 ⇒ 记 `null` 跳过）；⑥ 页 1 的 `.textLayer` 的 `span` 计数逐字 **6**、`.pdf-page canvas` 的 `style.width` 逐字 `595px`、`.pdf-overlay` 仍是第 3 个子元素；⑦ `.capture-layer` 的 `zIndex` 逐字 `"5"`（框选层仍在上） | `{ phase, pages: { p1, p2, p3 }, controls, spans, overlayIndex, zIndex }` |
| `live` | `deleteRowByText("Table 2 repo")` → `waitFor` 页 2 标记变 `本页 1 条` → `clickUndo()` → `waitFor` 回 `本页 2 条` → `setSearch("Reproducibility")` → 读标记与面板 → `setSearch("")` → 滚动到第 2 页再回第 1 页 → `clickEl(SEL.zoomInBtn)` ×2 + `waitFor` `.zoom-label` 逐字 `120%` → `waitFor` 页 1 / 页 2 文字层重渲染（各 `.textLayer span` 计数 > 0）→ 复读 `pageNotesProbe(1)` / `(2)` → 用字面量 `.pdf-toolbar button[title="缩小"]` ×2 + `waitFor` `.zoom-label` 逐字 `100%`（缩放复位） | ⑧ 删除后页 2 逐字 `本页 1 条` / `本页 1 条笔记（摘录 0 · AI 结论 1）；点击定位到笔记面板`；撤销后逐字回 `本页 2 条` / `摘录 1 · AI 结论 1`；⑨ 两次之间 `.note-row` 计数按 **4 → 3 → 4** 变化（防空：列表真的动了）；⑩ 过滤态下页 1 / 页 2 标记的 `textContent` 与 `title` **逐字不变**（与 R14 树徽标同口径：标记恒示全量），而 `.notes-count` 与 `.group-count` 的读数与过滤前**不同**（防空：过滤确实生效）；⑪ 滚动到第 2 页再回第 1 页后，页 1 / 页 2 的文本与 title 逐字不变；⑫ 120% 下页 1 / 页 2 标记的 `textContent` 与 `title` 逐字不变，且标记矩形与页 1 / 页 2 的任一 span 矩形（`span` 计数 > 0 防空）及既有控件矩形均不相交；回到 100% 后逐字回基线（req N91-3 判据 4：滚动 + 缩放都不改变读数） | `{ phase, afterDelete, afterUndo, rows, filtered, badgeUnderFilter, scrollStable, zoomStable }` |
| `other-doc` | `openRow("older-paper.pdf")` → `waitPdfLoaded()` + `waitPage(1, 2)` → 读 `.page-notes` 计数与 `readNotes()` → 截图 `r16-1b-page-badges-other-doc.png`（整窗）→ 切回 `sample-paper.pdf` + `waitPage(1, 3)` | ⑬ `older-paper.pdf` 下 `.page-notes` 计数 **0** 且 `.pdf-page` 计数 **2**（防空）；⑭ `readNotes()` 中 `n-other-1` 的 `page` 逐字 `7`（越界页零改写）；⑮ 切回后页 1 标记恢复 `本页 1 条`（跨文档不残留、回切可恢复） | `{ phase, notesCount, pageCount, outOfRangePage, restored }` |

**场景 `r16-2`（组 `r16-page-anchor`，3 条 record，3 张截图）**

前置：`enterNotesProbe(seedR16Focus(), 14)`（14 行，见 §5.3.1；页 3 恰 1 条 ⇒ 目标行唯一）。

| 相位 | 步骤 | 断言（失败即红） | `data` 字段 |
| --- | --- | --- | --- |
| `locate-panel-open` | 读 `panelRowProbe(3)`（防空：目标行初始不可见）→ `clickNext()` ×2 + `waitPage(3, 3)` → 点 `.pdf-page[data-page="3"] .page-notes` → `waitFor` 目标行完整可见 → 读 `panelRowProbe(3)` → 截图 `r16-2-page-anchor.png`（`rectOfSelector(SEL.layoutLeft, 2)`；**在 `is-anchored` 的 2s 窗口内**，§8.2 第 3 行目视据此）→ `sleep(2500)` → 复读 | ① 点击前 `row.top > panel.bottom`（防空：证明「可见」不是本来就成立）；② 点击后 `row.top ≥ header.bottom - 1` 且 `row.bottom ≤ panel.bottom + 1`（滚动确实发生且不被 sticky 头部遮挡）；③ `.note-row.is-anchored` 恰 **1** 个且命中当前文档组内 `第 3 页` 的第一行；④ `.page-label` 逐字 `第 3 / 3 页`、`.zoom-label` 逐字 `100%`、`.center-pill .pill-label` 逐字 `sample-paper.pdf`（不跳页、不改缩放、不切文档）；⑤ 四维视图状态零变化（搜索 `""` / 排序 `排序：页码` / 只读当前文档未勾 / 选择条不在 DOM）；⑥ `notesHash()` 逐字不变、`notesAddCalls()` / `notesReportCalls()` 增量 **0**；⑦ `.notes-chapter-filter` 点击前后**都不在 DOM**（本相位无过滤 ⇒ 未新增状态）；⑧ `sleep(2500)` 后 `is-anchored` 计数 **0**（`ANCHOR_HIGHLIGHT_MS = 2000` 生效）且期间 `.notes-notice` 为 `null`（成功不弹提示）；`is-anchored` 期间与之后的 `borderColor` / `backgroundColor` 读值**不同**（类确实生效且被移走） | `{ phase, before, after, anchored, view, label, hashSame, noticeAfter, borderDuring, borderAfter }` |
| `locate-panel-closed` | `backToLibraryTab()` → 点 `[title="折叠资料库"]`（沿用既有相位内字面选择器 `:4746-4748`）→ 读左栏宽度 → 点页 3 的 `.page-notes` → `waitNotesTab()` → 等定位完成（先穿过既有 `loadNotes()` 的 loading 窗口：`.note-row` 短暂为 0、`.notes-list` 随后恢复）→ 读左栏宽度 / 目标行 / 调用计数 → 截图 `r16-2b-page-anchor-tab-switch.png`（整窗） | ⑨ 折叠时 `.layout-left` 的 `offsetWidth === 0`（防空：证明确实折叠了）；⑩ 点击后 `.pill-tab.active` 的 `data-tab` 逐字 `notes`、`.layout-left` 的 `offsetWidth > 200`（重新可用、无折叠残留）；⑪ 目标行被定位（同 ③，且发生在 loading 窗口之后）；⑫ `loadCalls()` 增量 ≤ **1**（场景内既有 helper `:4350`，内部读 `window.__pixStub.notesLoadCalls()`；允许的来源 = 既有 `selectLeftTab("notes")` 的读盘）、`notesHash()` 逐字不变、`notesAddCalls()` / `notesReportCalls()` 增量 **0** | `{ phase, collapsedWidth, tab, expandedWidth, anchored, loadDelta, hashSame, rowAfterLoading }` |
| `degrade-filters` | `ensureMapOpen()`（相位入口 `enterCleanWorkspace` → `goHome()` 会 `setMapOpen(false)`，`.map-row` 只在 `showMap` 为真时渲染 ⇒ 必须先开图）→ `waitFor("地图行就绪", ".map-row === 7")` → `clickMapBadge("2. Method Overview")` → `waitChapterFilter("章节：2. Method Overview · 第 2 页", 11)` → 点页 1 的 `.page-notes` → 复读章节过滤与目标行 → `setSearch("Reproducibility")` → 点页 1 的 `.page-notes` → 读 `.notes-notice` 与行状态 → 截图 `r16-2c-page-anchor-filter-degrade.png`（`rectOfSelector(SEL.layoutLeft, 2)`）→ `setSearch("")` → 再点一次页 1 标记 | ⑬ 章节过滤在场时点标记 ⇒ `.notes-chapter-filter` **不在 DOM**（唯一被改动的视图状态，可见）且目标行（第 1 页行）被定位（`is-anchored` 在场）；⑭ 搜索遮挡时（`.note-row` 计数 1）⇒ `.notes-notice.is-error` 在场且 `.notice-text` 逐字 `本页笔记不在当前筛选结果中`（`.notes-notice.is-error` 与 `.notice-text` 均复用既有类）、`.note-row.is-anchored` 计数 **0**、面板滚动位置不变（`panelRowProbe` 的 `scrollTop` 与退化前读值逐字相同；`status === 'ready'` 且目标行确实不在 DOM ⇒ **立即**退化，不等满 `LOCATE_WAIT_MS`）；⑮ 清空搜索后再点 ⇒ 定位成功（**退化不是永久失效**） | `{ phase, filterBefore, filterCleared, anchored, notice, anchoredAfter, rowCountUnderFilter }` |

**场景 `r16-3`（组 `r16-note-highlight`，3 条 record，3 张截图）**

前置：`enterNotesProbe()`（标准种子 4 条；`n-current-1` 可匹配、`n-current-2` 不可匹配、`n-current-3` 是 AI 结论）。

| 相位 | 步骤 | 断言（失败即红） | `data` 字段 |
| --- | --- | --- | --- |
| `anchor-painted` | 读页 1 `textLayerSnapshot(1)` 与 `span` 计数 → `waitFor` `CSS.highlights.has("pix-note-anchor")` → 读 `anchorProbe()` 与第二次快照 → `selectionOnPageOne()` → 清空选择 → 截图 `r16-3-note-anchor.png`（`rectOfSelector(SEL.pageBoxOne, 8)`） | ① `pix-note-anchor` 的 `size === 1`，区间文本去空白后逐字等于页 1 摘录（手写期望串）；② 区间所属 `.pdf-page` 的 `data-page` 逐字 `"1"`；③ 页 1 的 `.textLayer` 的 `span` 计数 **6**、`mark` 计数 **0**；两次文本快照（节点类型序列 + 文本）逐字相同（零结构改动）；④ `--scale-factor` 逐字 `"1"`、`canvas.style.width` 逐字 `595px`；⑤ `pix-search` / `pix-search-current` **不在** `CSS.highlights` 中（未开搜索时不产生空注册表）；⑥ 选区非空且 `.quick-ask` 出现（选择链路未被打断；两条断言在同一相位内同一页上执行） | `{ phase, anchor, page, spans, snapshotSame, scaleFactor, canvasWidth, search, selection }` |
| `unmatched-silent` | `clickNext()` + `waitPage(2, 3)` → `sleep(400)` 读注册表与日志 → 截图 `r16-3b-note-anchor-unmatched.png`（`rectOfSelector('.pdf-page[data-page="2"]', 8)`，字面量选择器）→ `clickPrev()` + `waitPage(1, 3)` → `waitFor` 注册表非空 → 读注册表 → **续段（性能采样 + 作废语义，不新增截图）**：① 交替序列 = 以第 1 页为起点重复 5 轮「点『下一页』→ 等 `.page-label` 逐字 `第 2 / 3 页` → 点『上一页』→ 等 `.page-label` 逐字 `第 1 / 3 页`」= **10** 次点击，每次点击前用 `pageLabelProbe()` 断言目标按钮 `disabled === false`，逐次计时；② 快速连点 4 次（`clickNext()` / `clickPrev()` / `clickNext()` / `clickPrev()`，两次之间**不等待**）→ 等 `.page-label` 连续两帧相同 | ⑦ 第 2 页（摘录比页文本长）⇒ `has === false`、`.notes-notice` 为 `null`、`[pdf-viewer]` 前缀日志增量 **0**；⑧ 回第 1 页后注册表恢复 `size === 1` 且区间文本不变（翻页一致性）；⑨ 10 次翻页 `maxMs ≤ 1000` 且 `totalMs ≤ 6000`；`revisitMs` 为该 10 次读数（**全部是「回到已访问页」**：第 1 页 → 第 2 页）逐次登记且 `max(revisitMs) ≤ 300ms`；⑩ 快速连点后：若注册表非空，其区间所属 `.pdf-page` 的 `data-page` 逐字等于当前页号；若当前页不可匹配则 `has === false`（**不得残留旧页区间**） | `{ phase, unmatchedRegistry, unmatchedSpans, notice, logDelta, restored, turns, maxMs, totalMs, revisitMs, rapid }` |
| `scale-stable` | 点「缩小」×2 → `waitFor` `.zoom-label` 逐字 `80%` 且注册表非空 → 读 `anchorProbe()` → 截图 `r16-3c-note-anchor-after-zoom.png`（`rectOfSelector(SEL.pageBoxOne, 8)`）→ 点「放大」×2 → `waitFor` `.zoom-label` 逐字 `100%` 且注册表非空 → 复读 | ⑪ 80% 下区间文本（去空白）逐字不变、仍在页 1、`--scale-factor` 逐字 `"0.8"`、`canvas.style.width` 逐字 `476px`（595 × 0.8，几何独立复算）、`.zoom-label` 逐字 `80%`（防空：缩放真的发生）；⑫ 回到 100% 后逐字回基线：`--scale-factor` 逐字 `"1"`、`canvas.style.width` 逐字 `595px`、区间文本不变；⑬ 两次缩放之间注册表始终指向**当前文字层**（不残留指向旧节点的区间） | `{ phase, zoom, scaleFactor, canvasWidth, anchor, restored }` |

**场景 `r16-4`（组 `r16-highlight-coexist`，2 条 record，2 张截图）**

前置：`enterNotesProbe()` + `waitFor` 到 `pix-note-anchor` 非空（防空：锚点先就绪）。

| 相位 | 步骤 | 断言（失败即红） | `data` 字段 |
| --- | --- | --- | --- |
| `coexist` | 点 `SEL.pdfSearchBtn`（`.pdf-toolbar button[title="在文档中搜索"]`）→ `waitFor` `SEL.pdfSearchPanel` 在场 → `pdfSearchSet("retrieval")`（面板自身 300ms debounce 后全文档扫描）→ `waitFor` `pix-search` 非空 → 读 `anchorProbe()` 与 `pageNotesProbe(1)`（标记矩形 / `.pdf-search-panel` 矩形）→ `pdfSearchNext()` → 复读 → 截图 `r16-4-anchor-with-search.png`（`rectOfSelector(SEL.pageBoxOne, 8)`） | ① `get("pix-note-anchor").size ≥ 1`（页 1 恰 **1**）与 `get("pix-search").size ≥ 1`（`retrieval` 全文档命中 **3** 处、全部在页 1（本步离线复算：页 1 = 3、页 2 / 页 3 = 0）⇒ 扫描后当前页仍是页 1）**同时成立**；② 两者区间文本集合**不相同**（逐元素比较 `Array.from(h, (r) => r.toString())`）；③ 锚点区间去空白后逐字等于第 1 页摘录（手写期望串）；④ `pdfSearchNext()` 后锚点 `size` 与区间文本**逐字不变**（搜索更新不破坏锚点）；⑤ 页 1 的 `.textLayer` 的 `span` 计数仍 **6**（搜索与锚点都不改结构）；⑥ 页 1 的标记矩形与 `.pdf-search-panel` 矩形**不相交**（面板在场；`pageNotesProbe(1)` 读回）—— req §0.3 位置约束②③ 的第五个控件 | `{ phase, anchor, search, current, anchorAfterNext, spans, markerPanel }` |
| `search-closed` | `pdfSearchSet("")`（面板自身 `runSearch` 清空高亮）→ `pdfSearchClose()`（面板卸载）→ `waitFor` `SEL.pdfSearchPanel` 不在 DOM → 读注册表 → 截图 `r16-4b-anchor-after-search-closed.png`（`rectOfSelector(SEL.pageBoxOne, 8)`） | ⑦ `pix-search` / `pix-search-current` **不在** `CSS.highlights`（搜索面板自己清空）；⑧ `pix-note-anchor` 仍非空且区间文本不变（**互不破坏**：各自的清理只删自己的名字）；⑨ `.notes-notice` 为 `null` | `{ phase, searchGone, anchorKept, notice }` |

**场景 `r16-5`（组 `r16-degrade`，3 条 record，3 张截图）**

前置：`enterNotesProbe()`。

| 相位 | 步骤 | 断言（失败即红） | `data` 字段 |
| --- | --- | --- | --- |
| `zero-page` | `openRow("long-book.pdf")` → `waitPdfLoaded()` + `waitPage(1, 60)` → 读 `.page-notes` / `.pdf-page` 计数与注册表 → `clickNext()` ×2 → 复读 → 截图 `r16-5-zero-page-notes.png`（整窗）→ 切回 `sample-paper.pdf` + `waitPage(1, 3)` | ① `.page-notes` 计数 **0** 且 `.pdf-page` 计数 **60**（防空：断言确实在 60 页 DOM 上执行）；② 翻两页后仍为 0（不是「只查了第 1 页」的假绿）；③ `has("pix-note-anchor") === false`、`.notes-notice` 为 `null`；④ 切回后页 1 标记（`本页 1 条`）与锚点恢复（文档切换两端都清得干净、回得来） | `{ phase, notesCount, pageCount, afterTurn, registry, notice, restored }` |
| `no-text-layer` | `waitFor` 锚点就绪（防空：`has === true`）→ `emptyTextLayer(1)` → `clickNext()` + `clickPrev()` → `sleep(2300)`（> `ANCHOR_LAYER_WAIT_MS`）→ 读注册表 / 提示 / 日志 / 标记 → 截图 `r16-5b-no-text-layer.png`（`rectOfSelector(SEL.pageBoxOne, 8)`）→ 点「放大」×2 + 「缩小」×2（缩放回到 100% ⇒ 页面 release 并重渲染 ⇒ 文字层重建）→ `waitFor` 注册表非空 | ⑤ 超时窗口后 `has === false`、`.notes-notice` 为 `null`、`[pdf-viewer]` 日志增量 **0**（静默、不重试）；⑥ `.page-notes` 计数仍 **2**（标记不依赖文字层）；⑦ 文字层重建后锚点恢复且区间文本不变（**降级不粘滞**） | `{ phase, registryAfterTimeout, notice, logDelta, notesCount, restored }` |
| `external-refresh` | `writeNotesOutside(标准种子但把 n-current-1 的 page 由 1 改为 3，其余三条逐字不变)` → `triggerWindowFocus()` → `waitFor` `SEL.staleRow` → `notesHash()` 基线 → 点 `SEL.staleRefresh` → `waitFor` `.note-row` 计数 4 → 读三页标记 / 注册表 / 计数 → 截图 `r16-5c-after-external-refresh.png`（整窗） | ⑧ 刷新后 `.note-row` 计数 **4** 且 `readNotes().length === 4`；⑨ 页 1 **无**标记、页 3 逐字 `本页 1 条` / `本页 1 条笔记（摘录 1 · AI 结论 0）；点击定位到笔记面板`、页 2 逐字 `本页 2 条`；⑩ 当前页（第 1 页）`has("pix-note-anchor") === false`（那条摘录已不属于本页）；⑪ 刷新只读：`notesHash()` 前后逐字相同、`notesAddCalls()` / `notesReportCalls()` 增量 **0**；⑫ `.notes-notice` 为 `null` | `{ phase, rows, fileRows, markerP1, markerP2, markerP3, registry, hashSame, notice }` |

**场景末**：每个场景以自己的 `restoreStandardSeed()` 收尾（与 R11 / R12 / R13 / R14 同纪律）。

#### 5.3.3 截图清单（13 张，冻结）

| # | 文件名 | 取法 | 归属 |
| --- | --- | --- | --- |
| 1 | `r16-1-page-badges.png` | `rectOfSelector(SEL.pageBoxOne, 8)` | `r16-1` |
| 2 | `r16-1b-page-badges-other-doc.png` | 整窗 | `r16-1` |
| 3 | `r16-2-page-anchor.png` | `rectOfSelector(SEL.layoutLeft, 2)` | `r16-2` |
| 4 | `r16-2b-page-anchor-tab-switch.png` | 整窗 | `r16-2` |
| 5 | `r16-2c-page-anchor-filter-degrade.png` | `rectOfSelector(SEL.layoutLeft, 2)` | `r16-2` |
| 6 | `r16-3-note-anchor.png` | `rectOfSelector(SEL.pageBoxOne, 8)` | `r16-3` |
| 7 | `r16-3b-note-anchor-unmatched.png` | `rectOfSelector('.pdf-page[data-page="2"]', 8)`（字面量选择器；**不新增 `SEL` 键**） | `r16-3` |
| 8 | `r16-3c-note-anchor-after-zoom.png` | `rectOfSelector(SEL.pageBoxOne, 8)` | `r16-3` |
| 9 | `r16-4-anchor-with-search.png` | `rectOfSelector(SEL.pageBoxOne, 8)` | `r16-4` |
| 10 | `r16-4b-anchor-after-search-closed.png` | `rectOfSelector(SEL.pageBoxOne, 8)` | `r16-4` |
| 11 | `r16-5-zero-page-notes.png` | 整窗 | `r16-5` |
| 12 | `r16-5b-no-text-layer.png` | `rectOfSelector(SEL.pageBoxOne, 8)` | `r16-5` |
| 13 | `r16-5c-after-external-refresh.png` | 整窗 | `r16-5` |

#### 5.3.4 场景级验收判据

1. 【离屏】5 组 record 全绿、13 张截图齐备（少一张即红）；新增 5 种 label 的条数与 §1.6 逐字一致（`r16-page-badge:3` / `r16-page-anchor:3` / `r16-note-highlight:3` / `r16-highlight-coexist:2` / `r16-degrade:3`）。
2. 【走查】既有场景函数体零改动（`git diff` 只显示：`SEL` 4 项、10 个 helper、`seedR16Focus()`、`r16-1`…`r16-5` 块）；既有 153 张截图 / 223 条测量 / 59 种 label 零缺失。
3. 【离屏】新增截图的矩形取法与 R13 / R14 一致：页级用 `rectOfSelector(SEL.pageBoxOne, 8)`（**新键**）、左栏用 `rectOfSelector(SEL.layoutLeft, 2)`、整窗无 rect；**既有 `SEL.pdfPageOne` 保留原义，不得用于页级截图**。
4. 【走查】stub 面零改动（`api` 恒 42 方法、无新控制口、无新失败注入口）；`pix/package.json` 零 diff。

#### 5.3.5 基线与零缺失（`C:/Users/86157/AppData/Local/Temp/pix-v05-r15-final`）

| 项 | 冻结口径 |
| --- | --- |
| 零缺失参照基线 | `C:/Users/86157/AppData/Local/Temp/pix-v05-r15-final/shots`：**153** 张 png（`MANIFEST.shots[].name`）、**223** 条测量、**59** 种 label |
| 动工前自建基线 | 在新目录 `PIX_SHOT_ROOT=<临时目录>/pix-v05-r16-base` 实跑一次（PRD §5.1：每轮动工前跑基线离屏取证） |
| 零缺失判据 | 基线 `MANIFEST.shots[].name` 集合 ⊆ 验收运行集合；基线 `MEASUREMENTS.json` 的 label 集合 ⊆ 验收运行集合（59 种一条不少）；`MANIFEST.json.failure === null`、退出码 **0**；截图目录与清单**双向相等**、无白名单外条目 |
| 新增配额 | 截图 **13** 张（153 → 166）、record **14** 条（223 → 237）、新 label **5** 种（59 → 64） |
| 对标记与高亮最有判别力的既有场景（必须继续通过） | `pdf-text-layer-geometry`（页框与文字层读数）、`page-tracking`（翻页 / 触底钳制）、`scale-restored`（缩放）、R11 的搜索场景（`pix-search` 相关断言）、R12 的 `.reader-section` 与 `r15-f18` 的框选两相位（`:6675-6760`）、R13 / R14 的面板与报告场景 |
| 验收命令 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录>/pix-v05-r16-final ./node_modules/.bin/electron scripts/ui-shot.mjs` ⇒ 退出码 0；随后 `node -e` 读两个 json 打印长度 / label 去重 / png 计数并做集合包含比对 |
| 内容目视比对 | 新增 13 张截图必须在 dev 档**逐张登记结论**（见 §8 的检查清单） |
| 本步状态 | **本档不跑离屏**；上表读数为 R15 交付基线与步骤声明，留给开发步 |

### 5.4 走查判据（命令级，正反双向）

| # | 命令 | 期望 |
| --- | --- | --- |
| 1 | `grep -rn "notesStat\\|notesLoad\\|notesAdd\\|ipcRenderer" pix/src/renderer/components/workspace/PdfViewer.vue \| wc -l` | **0**（PDF 组件不直接调任何笔记 IPC；标记与锚点的数据只来自 store）。**注意**：既有 `pixApi` 面两处（`libraryReadFile` / `libraryOpenPath`）不计入本式 |
| 2 | `grep -rn "page-notes" pix/src \| wc -l` | **3**（`PdfViewer.vue` 的模板 1 处 + 样式 2 处：规则 + `:hover`）；`grep -rn "page-notes" pix/src/renderer/components/workspace/NotesPanel.vue \| wc -l` = **0** |
| 3 | `grep -rn "本页 " pix/src \| wc -l` | **2**（文本模板 1 + title 模板 1，同文件） |
| 4 | `grep -rn "countNotesByPage" pix/src \| wc -l` | **3**（`notes-path.ts` 定义 1 + `PdfViewer.vue` 的 import 1 与 `computed` 内调用 1）；`sed -n '/countNotesByPage/,/^}/p' pix/src/renderer/utils/notes-path.ts \| grep -c "for ("` = **1**；`grep -c "for (" pix/src/renderer/utils/notes-path.ts` = **4**（既有 3 + 新增 1） |
| 5 | `grep -n "countNotesByPage" -A 2 pix/src/renderer/components/workspace/PdfViewer.vue` | 命中行的下一行含 `computed(`（唯一调用点在 `computed` 回调内）；模板内 0 处调用 |
| 6 | `grep -cE "^::highlight\\(" pix/src/renderer/components/workspace/PdfViewer.vue` | 现值 **2** ⇒ 改后 **3**；字面 `grep -c "::highlight("` 改后 **4**（注释行 `:1301` 不参与行首计数） |
| 7 | `grep -rn "pix-note-anchor" pix/src \| wc -l` | **2**（常量 1 + 样式规则 1）；`grep -rn "pix-search" pix/src \| wc -l` 仍为 **4**（零增量）；`git diff -- pix/src/renderer/components/workspace/PdfSearchPanel.vue` 为空 |
| 8 | `grep -rn "ANCHOR_HIGHLIGHT_MS" pix/src \| wc -l` = **2**、`grep -rn "LOCATE_WAIT_MS" pix/src \| wc -l` = **2**、`grep -rn "ANCHOR_LAYER_WAIT_MS" pix/src \| wc -l` = **2** | 三者都是「定义 1 + 使用 1」；若实现需要在使用点引用两次，允许改为「定义 1 + 使用 ≥ 1」（登记者：本档只对 `LOCATE_WAIT_MS` 采用「定义 1 + 使用 ≥ 1」） |
| 9 | `grep -c "HighlightRegistryWriter" pix/src/renderer/components/workspace/PdfViewer.vue` | ≥ **2**（声明 1 + `set` / `delete` 的断言处 ≥ 1）；`grep -rn "HighlightRegistryWriter" pix/src \| wc -l` = **≥ 5**（`PdfSearchPanel.vue` 既有 **3**（`:19` / `:91` / `:92`）+ `PdfViewer.vue` 新增 ≥ 2；刻意重复，不抽共享模块） |
| 10 | `grep -c "addEventListener" pix/src/renderer/components/workspace/PdfViewer.vue` = **2**（零增量）；`grep -c "setInterval" pix/src/renderer/components/workspace/PdfViewer.vue` = **0**；`git diff -- pix/src/renderer/stores/notes-store.ts` 中新增行含 `chapterFilter.value = null` 恰 **1** 行（在 `focusPageNotes` 内） | 高亮不注册任何监听；不为等待引入 `setInterval`；定位动作不新增第二个过滤状态 |
| 11 | `grep -rn "pageFilter\\|pageOnly\\|pageRange" pix/src \| wc -l` = **0**；`grep -c "pageFocusToken" pix/src/renderer/stores/notes-store.ts` = **4**；`grep -rn "pageFocusToken" pix/src \| wc -l` = **6 或 7**（`notes-store.ts` 恒 4；`WorkspacePage.vue` 恒 1；`NotesPanel.vue` = 1 或 2） | 无第二个过滤状态；一次性信号复位完整；实现内不得在注释中写出该标识符 |
| 12 | `grep -c "notes-notice" pix/src/renderer/components/workspace/NotesPanel.vue` | 增量 **0**（现值 **4**：`:574` / `:1006` / `:1017` / `:1022` ⇒ 改后仍 4；不新增第二种提示容器） |
| 13 | `grep -rn "本页笔记不在当前筛选结果中" pix/src \| wc -l` | **1** |
| 14 | `grep -rn "matchExcerpts\\|foldText" pix/src \| wc -l` | **4**（`page-anchor.ts` 定义 2 + `PdfViewer.vue` import 1 + 调用 1）；`grep -rn "toLowerCase" pix/src/renderer/utils/page-anchor.ts \| wc -l` = **1**；`grep -c "indexOf" pix/src/renderer/utils/page-anchor.ts` = **1** |
| 15 | `grep -rn "MAX_ANCHOR_TEXT_LENGTH" pix/src \| wc -l` | **2**（定义 1 + 使用 1；不得在组件内写第二份 400） |
| 16 | `grep -rn "notesStat\\|notesLoad\\|notesAdd\\|ipcRenderer\\|pixApi" pix/src/renderer/components/workspace/PdfViewer.vue` | 与 R15 基线相同（仍只有 `libraryReadFile` / `libraryOpenPath` 两处既有调用；本轮零新增IPC） |
| 17 | `git diff --stat -- pix/src/main pix/src/shared/types.ts pix/package.json package-lock.json packages` | 全部为空（本轮零 IPC、零类型、零 script、零依赖） |
| 18 | `git status --short` | 只出现白名单：`M` **8** 个源码 / 脚本（§4 第 1–8 行）+ `?? docs/pm/R16-*.md`；不出现临时脚本 / 临时产物 / 调试日志 |
| 19 | `npm run check` | `CHECK_EXIT=0`（新增纯函数、`PdfViewer.vue` 局部 `AnchorSegment` / `HighlightRegistryWriter` 等类型全链路必填；无 `any`、无内联动态 import；全部顶层 import） |
| 20 | `git diff --stat -- pix/scripts/smoke-notes.mjs` | 空（主进程数据面烟测零改动） |

---

## 6. 风险 Top3

### R1「标记计数与笔记事实源 / 页号口径漂移」（最容易出错，判定面最宽）

**失败模式**：① 把「文档级」计数画到每一页（每页都显示 `3 条`）；② 把过滤后的可见条数当全量（搜索时数字变小）；③ 忘记排除其它文档的同页号笔记（`archive/older-paper.pdf` 的 p7 画到当前文档的第 7 页，或在 2 页文档上凭空多出一枚标记）；④ 用 `===` 直接比较绝对路径而不是 `docPathKey`（大小写 / 斜杠差异导致「笔记在页面上消失」）；⑤ 在模板里对每页调用聚合函数（60 页文档下 60 次全量扫描）。

**判定**：烟测 `notes-by-page` #1 / #3 / #4 / #5 / #6（逐页逐字段、非法页号、比较键归一、恒等式、纯性）；离屏 `r16-1` 相位 `badges`（三页读数 + 零占位 + 子元素位次）、`live` ⑨⑩（列表真的动了而标记不动）、`other-doc` ⑫⑬⑭（跨文档不串页、越界页零标记）、`r16-5` 相位 `external-refresh` ⑨⑩（外部改动后按新列表重算）；走查 #4 / #5（唯一调用点在 `computed`、模板 0 处调用）。

**失败信号**：页 1 与页 2 显示同一个数字；搜索后标记变小；`older-paper.pdf` 的 p7 出现在该文档第 1 页上；删掉一条摘录后页 2 数字不变；60 页文档首次渲染明显卡顿。

### R2「高亮匹配与文字层 / 搜索高亮互相破坏」

**失败模式**：① 向 `.textLayer` 插节点（`mark` / 包裹 / 拆分 ⇒ 破坏选区几何与既有 153 张截图的读数）；② 用 `color` 覆盖成非透明（与 canvas 字形重影）；③ 与 `pix-search` 混用注册表（一侧的 `clearHighlights` 清掉另一侧）；④ 等待文字层写成定时器轮询或重复重试（卡顿、空转、翻页后写出旧页区间）；⑤ 把折叠出来的假分隔符当成真实字符去建 Range（区间偏移 1 位或整体丢失）。

**判定**：离屏 `r16-3` 相位 `anchor-painted`（区间文本 / 页归属 / `span` 计数 6 / `mark` 计数 0 / 两次文本快照相同 / 选区与 `.quick-ask` 仍在）、`unmatched-silent`（静默 + 日志增量 0 + 回页恢复 + 快速连点后不残留旧页区间）、`scale-stable`（80% 下 `--scale-factor` 与 canvas 宽度独立复算）；`r16-4` 两相位（注册表并存 / 区间文本不同 / 点「下一处」后锚点不变 / 关闭搜索后锚点仍在）；烟测 `excerpt-match` 全 10 条（含 `at` 回溯表不变量与边界 400 / 401）；走查 #6 / #7 / #14。

**失败信号**：命中区文字被画出来（重影）；文字层出现 `mark` 或新增 `span`；关闭搜索后锚点一起消失；第 2 页出现「第 1 页的摘录」高亮；翻页后注册表残留指向旧节点；`--scale-factor` 与 `canvas.style.width` 的复算不符。

### R3「定位与既有过滤 / 面板状态打架」

**失败模式**：① 定位被搜索 / 章节过滤挡住却什么都不发生（静默失败）；② 定位顺手清掉了不该清的状态（搜索词 / 排序 / 仅看当前文档 / 选择集）；③ 面板未打开或左栏折叠时点了没反应；④ 面板停在 loading 时就把「找不到行」当退化（M1 的原始翻车点）；⑤ 目标行被 sticky 头部遮住一半（「滚了但看不见」）。

**判定**：离屏 `r16-2` 三相位（① 目标行完整可见 + 不被头部遮挡；② 四维视图状态零变化 + 章节过滤被清除且是唯一被改动项；③ 搜索遮挡时逐字提示 + 清空搜索后重试成功；④ 左栏折叠 + 资料库标签下自动展开并切标签、穿过 loading 窗口、`loadCalls()` 增量 ≤ 1）；走查 #10 / #11（`pageFilter` 零命中、`chapterFilter.value = null` 新增恰 1 行）；`notesHash()` / 调用计数（零写盘、零新增 IPC）。

**失败信号**：点了标记没有任何可见变化；搜索词或排序被顺手清空；面板在资料库标签时只改变一个不可见状态；定位后目标行仍被头部遮住一半；`locate-panel-closed` 相位里出现 `.notes-notice.is-error`（loading 被误判为退化）。

**次级风险（不占 Top3）**：① `foldText` 的假分隔符会**引入**原文中不存在的空格 ⇒ 理论上可能造成「跨片段拼接出的伪命中」（同时它是「页 1 摘录跨两行仍能命中」的唯一手段，登记为取舍；若要收紧须另立轮次引入 `getTextContent` 的 `transform` 几何判定）；② 标记固定 `right/bottom: 6px` 与同层控件重叠时被拦截点击（真实文档页面贴底 / 更宽时，登记取舍，§1.1.4）；③ 瞬时高亮（`is-anchored` 2s）与既有瞬时提示（`.notes-notice` 4s）同屏时语义叠加（两者都不阻塞，本档不断言互斥）；④ 高亮等待窗口 `ANCHOR_LAYER_WAIT_MS = 2000` 在极慢机器上可能先到时（结果只是「这一次没画」，回到该页或缩放后会重画；`r16-5` 相位 `no-text-layer` 的续段正是这条兜底）；⑤ 60 页文档下每页都渲染标记（60 个 `<button>` 的成本极低且计数是 O(1) 取数 —— 由 `r16-5` 相位 `zero-page` 的 60 页读数与 `r16-3` 的耗时阈值共同覆盖）。

---

## 7. 开发分工

### 7.1 A：派生与匹配纯函数 + 烟测（**不碰任何 Vue 文件**）

| 序 | 交付物 | 具体工作 | 完成判据 |
| --- | --- | --- | --- |
| A1 | `pix/src/renderer/utils/notes-path.ts` | 新增 `PageNoteCount` + `countNotesByPage`（§1.2.1） | 既有导出零 diff；`for (` 3 → 4；`sed -n '/countNotesByPage/,/^}/p' … \| grep -c "for ("` = 1 |
| A2 | `pix/src/renderer/utils/page-anchor.ts`（新建） | 放 §1.4.3 的类型与纯函数（`foldText` / `matchExcerpts`；Range 重建不在此文件） | 零 import / 零 DOM；`grep -c "for ("` ≤ 2、`grep -c "toLowerCase"` = 1、`grep -c "indexOf"` = 1；无 `any`；`npm run check` 0 error |
| A3 | `pix/scripts/smoke-view.mjs` | 新增 `notes-by-page`（6 条）与 `excerpt-match`（10 条）、夹具常量、`pageAnchor` 句柄与 `require`、`main()` 两行调用、`files` / `required` 各 1 项 | `npm run smoke:view` 末行逐字 `通过 51 / 失败 0`；连续两次运行结果相同；既有 5 组 35 条零改动；`%TEMP%` 目录被删除 |
| A4 | 回归 | `npm run smoke:notes` | 末行逐字 `通过 65 / 失败 0`（零改动） |

**A 完成时点**：A1–A4 全绿 + `npm run check` 0 error。**A 不触碰** `PdfViewer.vue` / `stores/notes-store.ts` / `WorkspacePage.vue` / `NotesPanel.vue` / `ui-shot.mjs`。

### 7.2 B：UI 与离屏（依赖 A 的纯函数签名冻结）

| 序 | 交付物 | 具体工作 | 完成判据 |
| --- | --- | --- | --- |
| B1 | `pix/src/renderer/stores/notes-store.ts` | `pageFocusPage` / `pageFocusToken` + `focusPageNotes` + `resetNotes` 两行 + `return` 两项（§1.3.2 / §1.3.3） | `grep -c "pageFocusToken"` = 4；`chapterFilter.value = null` 新增恰 1 行；既有动作零 diff |
| B2 | `pix/src/renderer/pages/WorkspacePage.vue` | `pageFocusToken` watcher（§1.3.4） | 判据逐字同构；`grep -c "token <= 0 \|\| token <= previous"` 增量恰 1 |
| B3 | `pix/src/renderer/components/workspace/NotesPanel.vue` | 常量 + watcher（有界等待）+ 目标行 + `is-anchored` + 退化提示 + 清理（§1.3.5–§1.3.7） | 走查 #8 / #12 / #13；既有文案与 DOM 顺序零 diff；四个既有定时器清理逐字不动 |
| B4 | `pix/src/renderer/components/workspace/PdfViewer.vue` | 标记（模板 + 样式 + 计数消费 + 点击）+ 锚点高亮（常量 / 本地别名 / 缓存 / 令牌 / 四个清空调用点 / 一个触发调用点 / 第三条 `::highlight()` 规则）（§1.1 / §1.2.2 / §1.4） | 走查 #2 / #3 / #5 / #6 / #7 / #9 / #10 / #14 / #15；既有分支语义不变（§2.3 的两条 `git diff -U0` 判据）；`npm run check` 0 error |
| B5 | `pix/scripts/ui-shot.mjs` | `SEL` 4 项 + 10 个 helper + `seedR16Focus()` + `r16-1`…`r16-5`（5 组 14 条 / 13 张截图） | §5.3.4 判据 1–4；既有 153 张 / 223 条 / 59 种 label 零缺失 |
| B6 | 离屏验收 | 先跑基线（`pix-v05-r16-base`），再跑验收（`pix-v05-r16-final`） | 退出码 0、`failure === null`、零缺失判据全过、新增 13 张 / 14 条 / 5 种 label 齐备（§5.3.5） |
| B7 | 目视比对 | 13 张新截图逐张登记结论（§8 清单） | dev 档逐张写明「标记是否压住正文 / 是否与既有控件重叠 / 是否出现空胶囊或换行；高亮是否与正文重影、是否与搜索高亮互相破坏」 |

**并行纪律**：A 先冻结纯函数签名（§1.2.1 / §1.4.3 逐字）⇒ B 才能写 `PdfViewer.vue` 的 import 与调用。A 与 B 的写文件集合**零交集**（A: `notes-path.ts` / `page-anchor.ts` / `smoke-view.mjs`；B: 四个 Vue / TS 文件 + `ui-shot.mjs`）。

**合并门（B 完成后、提交前）**：`npm run check` 0 error + `npm run smoke:view` `通过 51 / 失败 0` + `npm run smoke:notes` `通过 65 / 失败 0` + 离屏 153 张零缺失 + 13 张新增齐备 + §2.3 的零 diff 判据全过 + `git status --short` 只出现 §4 白名单内的文件。

---

## 8. 视觉验收要点

### 8.1 必查三项（PRD §7 判据 1 的观感面）

| # | 要点 | 判据 / 观察方法 |
| --- | --- | --- |
| 1 | **标记不遮正文** | 夹具相位内标记矩形与任一 span 矩形不相交（`r16-1` 判据 ⑤）；目视：`r16-1-page-badges.png` / `r16-5b-no-text-layer.png` 上标记落在页面右下角空白区，不压任何字形；真实文档允许覆盖（登记取舍） |
| 2 | **高亮与搜索高亮可区分** | `r16-4-anchor-with-search.png` 同屏可见：锚点 = 浅底纹 + 2px 深下划线；搜索全部命中 = `rgba(49, 66, 79, 0.12)` 底纹；当前命中 = 反白（`#31424f` + 白字）；三者互不遮挡字形（`color: transparent` 生效 ⇒ 不出现重影） |
| 3 | **缩放 / 翻页稳定** | `r16-3-note-anchor.png`（100%）与 `r16-3c-note-anchor-after-zoom.png`（80%）对比：区间位置随页面等比变化、宽度随缩放变化、下划线粗细保持 2px；`r16-3b-note-anchor-unmatched.png`（第 2 页）无任何残影 |

### 8.2 逐张登记清单（13 张，dev 档必须逐张写结论）

| # | 截图 | 要看的点 |
| --- | --- | --- |
| 1 | `r16-1-page-badges.png` | 页 1 / 页 2 各一枚药丸（文本 `本页 N 条`）；页 3 无任何占位；药丸不压正文、不压页码 pill / 章节 chip；无换行、无「0 条」 |
| 2 | `r16-1b-page-badges-other-doc.png` | `older-paper.pdf` 整窗无标记（越界 p7 不画）；页面与既有控件位置正常 |
| 3 | `r16-2-page-anchor.png` | 目标行完整可见（不被 sticky 头部遮挡）、边框色变深 + 背景变浅（`is-anchored`）、列表未被过滤（行数仍 14） |
| 4 | `r16-2b-page-anchor-tab-switch.png` | 左栏已展开且停在「笔记」标签；目标行被定位；无折叠残留（左栏宽度正常） |
| 5 | `r16-2c-page-anchor-filter-degrade.png` | 退化提示行（`.notes-notice.is-error` 文本逐字 `本页笔记不在当前筛选结果中`）与既有提示同款外观；列表仍是被搜索过滤的状态 |
| 6 | `r16-3-note-anchor.png` | 页 1 摘录被浅底下划线标记；与正文无重影；`.textLayer` 无新节点（DOM 结构不变，肉眼表现为字形仍是 canvas 绘制） |
| 7 | `r16-3b-note-anchor-unmatched.png` | 第 2 页**无**任何高亮；无提示；标记仍显示 `本页 2 条` |
| 8 | `r16-3c-note-anchor-after-zoom.png` | 80% 下高亮仍在页 1 的同一句话上；下划线粗细 2px 不变；文字不重影 |
| 9 | `r16-4-anchor-with-search.png` | 同屏两种高亮：锚点（浅底下划线）与搜索命中（灰块）叠加区不糊成一片；当前命中反白可见 |
| 10 | `r16-4b-anchor-after-search-closed.png` | 搜索面板关闭后锚点仍在、外观不变；无搜索高亮残留 |
| 11 | `r16-5-zero-page-notes.png` | 60 页文档首页无标记；页面与控件正常 |
| 12 | `r16-5b-no-text-layer.png` | 无文字层时无高亮、无提示；标记仍在 |
| 13 | `r16-5c-after-external-refresh.png` | 页 3 出现标记（`本页 1 条`）、页 1 无标记；当前页无高亮；无提示残留 |

### 8.3 反例清单（出现即判红）

| # | 反例 | 判定 |
| --- | --- | --- |
| 1 | 标记把正文压住（夹具相位内） | `r16-1` 判据 ⑤ 判红 |
| 2 | 页面上出现 `本页 0 条` 或空胶囊 | `r16-1` 判据 ②（页 3 `exists === false`）判红 |
| 3 | 标记文本换行 / 出现第二枚标记 | 判据 ①（逐字文本）+ `.page-notes` 计数 2 判红 |
| 4 | 高亮把命中区文字真正画出来（与 canvas 字形重影） | `r16-3` 判据 ①③ 与目视判红（`color: transparent` 未生效） |
| 5 | 文字层出现 `mark` / 新增 `span` / 结构变化 | `r16-3` 判据 ③ 判红 |
| 6 | 关闭搜索后锚点一起消失 | `r16-4` 判据 ⑦ 判红（一侧清理误删另一侧注册表） |
| 7 | 翻页后高亮指向非当前页 | `r16-3` 判据 ⑩ 判红（等待作废语义失效） |
| 8 | 定位后目标行被 sticky 头部遮住一半 | `r16-2` 判据 ② 判红 |
| 9 | 定位把搜索词 / 排序 / 仅看当前文档 / 选择集改掉 | `r16-2` 判据 ⑤ 判红 |

---

## 9. 开放问题（需负责人确认，不阻塞本档定稿）

1. **是否把「片段收集 + Range 构造 + 等文字层」抽成搜索与锚点共用的模块**：本档冻结为**不抽**（`PdfSearchPanel.vue` 零 diff，§0.0 第 3 条）。抽出的收益是去掉第二份 `HighlightRegistryWriter` 与第二份等待实现；代价是搜索侧回归面（R11 起 223 条测量 + 多条既有断言）全部重新验证 ⇒ 属重构轮次。
2. **Range 重建（`PdfViewer.vue` 的局部 `anchorRangeFor`）是否应进入烟测**：本档把它放在离屏（真实 DOM）判定（§5.1.4），理由 = `page-anchor.ts` 本体零 DOM、而 `smoke-view.mjs` 的 `WINDOW_SHIM` 不补 `Text` / `Range` / `document`（补它们等于给烟测加半个 DOM 环境，超出本轮配额）。若要烟测覆盖，需新增第三个组并改 `WINDOW_SHIM`（登记为变更）。
3. **高亮是否扩展到「当前可见页」而不只是当前页**：本档冻结为只画当前页（§1.4.5）。扩到多页需引入可见页判定与多页注册表管理，并新增「同屏多页摘录同时高亮」的断言。
4. **摘录匹配是否要求词边界**（避免子串误命中）：本档冻结为纯子串（§1.4.3），理由是摘录通常成句、误命中概率低且降级代价小。
5. **标记的常驻性**：本档冻结为「有笔记即常驻（无关闭开关、不自动隐藏）」。若希望可关闭，需新增状态与断言，且不得落在 `notes.json` 或 `reader-state.json` 之外的新文件里。
6. **`LOCATE_WAIT_MS = 3000` 是否偏短**（慢盘 / 大库场景）：本档沿用需求档冻结值；若要放宽，只改 `NotesPanel.vue` 一个常量，但需同步 `r16-2` 相位 `locate-panel-closed` 的等待语义说明（本档不断言具体毫秒数，只用「发生在 loading 窗口之后」的可判定式）。

---

## 定稿修订（R16）

本节是 `docs/pm/R16-review.md`（设计评审）的 must-fix **F1–F16** 逐条修订记录：**16 条全部处理、0 条拒绝**；以下每条均已落实到正文（正文的编号与冻结语义不变）。事实核对全部来自本步真实读取的代码与真实命令输出（含仓外 `vue-tsc` 探针与 `foldText` 参考实现的离线复算）。

### 本步复核读数（全部为真实命令输出）

| 复核项 | 真实读数 |
| --- | --- |
| `SEL` 现值 | `sed -n '47,113p' scripts/ui-shot.mjs \| grep -cE "^\s+[A-Za-z][A-Za-z0-9]*:\s"` ⇒ **60**（分项 24 + 7 + 11 + 8 + 4 + 6 之和亦为 60） |
| `HighlightRegistryWriter` | `grep -rn "HighlightRegistryWriter" pix/src \| wc -l` ⇒ **3**（全在 `PdfSearchPanel.vue`：`:19` / `:91` / `:92`） |
| `notes-notice` | `grep -c "notes-notice" NotesPanel.vue` ⇒ **4**（`:574` / `:1006` / `:1017` / `:1022`） |
| 层级两处 | `PdfViewer.vue:1038` ⇒ `.pdf-toolbar` `z-index: 3`；`PdfSearchPanel.vue:432-436` ⇒ `.pdf-search-panel` `z-index: 4`（`top: 78px; right: 12px; width: 300px`） |
| 读盘计数 helper | `ui-shot.mjs:4350` ⇒ `const loadCalls = () => js("window.__pixStub.notesLoadCalls()")`（`notesLoadCalls` 只出现在 stub 内部，无同名场景 helper） |
| 地图行等待 | `grep -n "地图行就绪" ui-shot.mjs` ⇒ 7 处（含既有 `ensureMapOpen()` → `waitFor` → `clickMapBadge()` 同款序列 5 处） |
| `foldText` 离线复算（按 §1.4.3 参考实现逐字复刻） | `foldText(["alpha","beta"]).text === "alpha beta"`；`n-current-1` 折叠长 **92**、`indexOf = 54`、区间 `[54,146)`；页 1 折叠长 **329**；`retrieval` 全文档 **3** 处（全在页 1）；页 3 `n-r16-p3` 区间 `[14,77)`；`page.text.indexOf(ANCHOR_NEEDLE) === -1`（大写 needle 对已小写文本） |
| F1 类型探针（仓外临时工程 + 仓库 `node_modules/vue-tsc` 2.1.6 + `strict` 口径） | 旧模板 ⇒ **4 × TS2532**（三处 `title` + 一处文本）；新模板 ⇒ **0 error**（探针工程本步已删除） |

### 逐条处理

| # | 评审问题（事实） | 本档修订落点 |
| --- | --- | --- |
| F1 | `PdfViewer.vue` 冻结模板在唯一工程门下必红（4 × TS2532） | §1.1.2 模板改为消费 `pageNotesForRender[index]` 列表 + `?.`（`v-if` 不参与窄化）；§1.2.2 增「模板取数列表」并改写「模板读取次数」（模板 0 次 `Map` 读取）；§0.3 命名同步；探针核实新旧模板的 4 错 / 0 错 |
| F2 | `page-anchor.ts` 越界进 DOM（破 req §0.7 / §7 第 2 行）且 `for (` = 3 > 2 | 采修法①：`AnchorSegment` / `anchorRangeFor` / `locate` 移入 `PdfViewer.vue`（§1.4.4 新增调用方参考实现；§1.4.3 签名块只留纯函数、`for (` ≤ 2；§0.3 / §4 #2 #3 / §5.1.3 #4 / §5.1.4 / §5.4 #19 / §7 A2 / §9.2 同步） |
| F3 | 烟测 `excerpt-match` #4 期望值 `"alphabet"` 与折叠实现矛盾（必红） | §5.1.3 #4 期望值改为 `"alpha beta"`（片段边界折叠为恰一个空格；同一条空格是 #1 跨片段命中的唯一手段） |
| F4 | 烟测 `excerpt-match` #1 子断言按字面恒 `-1` | §5.1.3 #1 改为 `page.text.indexOf(foldText([ANCHOR_NEEDLE]).text) === start`（折叠域内严格子串；注明大写 `ANCHOR_NEEDLE` 直接 `indexOf` 恒 `-1`） |
| F5 | `r16-5` 相位 `external-refresh` 缺第 13 张截图 | §5.3.2 该相位步骤末尾补 `截图 r16-5c-after-external-refresh.png（整窗）` |
| F6 | `degrade-filters` 缺 `.map-row` 就绪等待 | §5.3.2 该相位前置补 `waitFor("地图行就绪", ".map-row === 7")`；§0.2 M8 行与 §5.3.1 新增「地图行就绪等待」登记 |
| F7 | 缺 `.pdf-search-panel`（面板在场）的几何判定 | `pageNotesProbe` 增读该面板矩形（不在场记 `null`）；§5.3.2 `r16-4` 相位 `coexist` 新增判据⑥（标记矩形与该面板矩形不相交）；§1.1.4 表新增该层行（`z-index: 4`） |
| F8 | req N91-3 判据 4（滚动 + 100%→120%）在设计档无落点 | §5.3.2 `r16-1` 相位 `live` 续段补「放大 ×2 → `waitFor` 120% 与文字层重渲染 → 复读 `pageNotesProbe(1)/(2)` → 缩小 ×2 回 100%」与判据⑫；§5.3.1 增「缩放按钮」登记（放大 = `SEL.zoomInBtn`；缩小 = 字面量选择器，不新增 `SEL` 键） |
| F9 | 两处走查基线数值错 | §5.4 #9 改为「`PdfSearchPanel.vue` 既有 **3**（`:19` / `:91` / `:92`）⇒ 全仓 ≥ **5**」；§5.4 #12 改为「现值 **4**（`:574` / `:1006` / `:1017` / `:1022`）⇒ 增量 0」 |
| F10 | `SEL` 现值自相矛盾（§0.1 / §2.2 #9 写 64） | 两处改为「**60** 项 ⇒ 改后 64」 |
| F11 | 相位引用不存在的 helper `notesLoadCalls()` | §1.3.8 / §5.3.2 `locate-panel-closed` ⑫ / §6 R3 统一改为场景内既有 `loadCalls()`（`:4350`）；§5.3.1 增「复用 helper」登记（stub 方法名只出现在 `loadCalls` 内部） |
| F12 | `anchorSegments` 与「不缓存 `Text` 节点引用」互斥且类型名不一致 | §0.3 命名表删除 `anchorSegments`，改写为「`anchorTextCache` 只缓存折叠结果、不缓存节点引用」；类型统一为 `AnchorSegment`（随 F2 落 `PdfViewer.vue`） |
| F13 | `NotesPanel.vue` 参考实现用了不存在的 `panelEl`；`panelRowProbe` 缺字段 | §1.3.5 增「模板 ref」行（新增 `const panelEl` + 挂 `.notes-panel`；落点入 §4 #6）；§5.3.1 `panelRowProbe` 增读 `.notes-panel` 的 `scrollTop` 与首行 `getComputedStyle`（`borderColor` / `backgroundColor`）；`degrade-filters` ⑭ 注明按 `scrollTop` 判定 |
| F14 | 三处事实数值错 | §0.1 折叠长改为 **92**（补 `indexOf = 54` / `[54,146)`）；§5.3.2 `r16-4` ① `retrieval` 改为 **3** 处（全在页 1）；§0.1 与 §1.1.4 的 `.pdf-toolbar` 改为 `z-index: 3` |
| F15 | `r16-2-page-anchor.png` 时序与 §8.2 #3 目视要点互斥 | §5.3.2 `locate-panel-open` 把截图移到 `sleep(2500)` **之前**（`is-anchored` 的 2s 窗口内），并注明 §8.2 第 3 行的目视依据 |
| F16 | §0.3 占位常量 `ANCHOR_MARKER_MS` 是死代码 | 删除该行（PRD §4 反需求 7） |

### 非阻塞建议的采纳情况（设计评审 §3）

采纳 5 条（均为不改变阻塞口径的表述 / 防空收敛）：§3.1 收敛论证（写入 §1.4.7「收敛（流式文字层）」行，并收紧「等待条件」行）；§3.4 `isSpace` 措辞改为「近似 `\s`、不含 `U+FEFF`」；§3.5 helper 表头改为「写操作仅限 ⑤/⑥/⑦/⑧/⑨」；§3.6 `renderPage` 末尾调用显式登记为「第 5 个新增调用点」（§1.4.5 ④）；§3.8 逐页 `spanCount > 0` 防空（`r16-1` 判据⑤与 `pageNotesProbe`）。

未采纳（登记，不影响本档自洽性）：§3.2 交叠绘制次序（保持「观测可区分、不写死谁压谁」）；§3.3 与 §3.7（req 侧计数 / 措辞，本轮不改需求档）；§3.9 目标行初始不可见防空（保留 `row.top > panel.bottom` 失败即红 + `scrollTop` 读数兜底）；§3.10 / §3.11（无需改档）。
