# R15 全量代码审计：渲染层（PDF 阅读链路）

> 审计面：`pix/src/renderer/components/workspace/{PdfViewer,PdfSearchPanel,PdfSelectionQuickAsk,ReaderPanel,KnowledgeMap}.vue`、`pix/src/renderer/composables/useRegionCapture.ts`、`pix/src/renderer/utils/{image-capture,note-capture}.ts`。
> 方式：只读。本轮**未修改任何源码或脚本**，**未执行任何 git 写命令**，**未运行** `npm run build` / `npm test` / `npm run package` / `npm run dev`，**未跑离屏 `ui-shot.mjs`**（按分片纪律留给后续步骤，避免并发）。
> 编号约定：`S-PDF-NN` = 问题项（P0/P1/P2），`D-PDF-NN` = 登记不修项。所有行号来自本轮真实读取的 HEAD `e5dc001` 版本文件；pdf.js 行号来自仓库内 `pix/node_modules/pdfjs-dist/build/pdf.mjs`（4.10.38）。
> 判据来源：`docs/pm/PRD-V0.5.md` §5（工程红线）、`docs/pm/R11-design.md`（键位与 Esc 语义矩阵）、`docs/pm/R11-req.md` / `R12-design.md` / `R14-review.md`（冻结面）、`pix/scripts/ui-shot.mjs`（既有断言面）。

## 0. 基线与复跑证据

| 命令 | 真实结果 |
| --- | --- |
| `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` | `CHECK_EXIT=0`，无 error 输出（`vue-tsc` + 主进程 `tsc` + preload `tsc` 全绿） |
| `cd pix && node scripts/smoke-view.mjs` | `通过 35 / 失败 0`（`SMOKE_VIEW_EXIT=0`） |
| `cd pix && node scripts/smoke-notes.mjs` | `通过 51 / 失败 0` |
| `git status --short` / `git log --oneline -1` / `git branch --show-current` | `?? docs/pm/R15-audit-main-stores.md` / `?? docs/pm/R15-audit-render-panels.md`（并行分片产物）；HEAD `e5dc001`；分支 `main` |
| `node --version` | `v24.19.0` |

源码事实核对（本轮实读，非转述）：`PdfViewer.vue` 1283 行、`PdfSearchPanel.vue` 484 行、`PdfSelectionQuickAsk.vue` 285 行、`ReaderPanel.vue` 476 行、`KnowledgeMap.vue` 588 行、`useRegionCapture.ts` 20 行、`image-capture.ts` 44 行、`note-capture.ts` 36 行。

## 1. 结论分布与总表

**P0 = 1，P1 = 5，P2 = 8，D = 4**（合计 18 条；另有「已核对、确认非缺陷」11 项见 §6）。

| 编号 | 分级 | 位置 | 一句话 |
| --- | --- | --- | --- |
| S-PDF-01 | P0 | `PdfViewer.vue:290-315`（`294`/`314`）、`317-324`、`420-441` | 缩放 <1 或窗口足够高时末页永远无法成为「当前页」：页码/章节 chip/`End` 键/AI 上下文/现场落盘全部错成 N−1 |
| S-PDF-02 | P1 | `PdfViewer.vue:248-262`（`260`）、`269-287`、`805-816` | 释放路径用 `querySelector` 逐页查节点，且对全部观察页调用 ⇒ 大文档缩放/加载出现 O(N²) 主线程扫描 |
| S-PDF-03 | P1 | `PdfViewer.vue:196-217`（`196`/`197`/`217`）、`275-277`、`805-816` | `renderedPages.add` 与 `renderTasks.set` 之间存在 `await` 窗口 ⇒ 同一 canvas 并发渲染，pdf.js 抛 `Cannot use the same canvas…` |
| S-PDF-04 | P1 | `PdfViewer.vue:531-544`、`556-623`（`559/588/590/592/602/617/620`） | 框选截图 7 处静默早退且无条件退出框选模式：拖拽成功但无附件、无任何提示 |
| S-PDF-05 | P1 | `PdfViewer.vue:109-116`、`643`、`670`、`861-862` + `pdf.mjs:11553/11557/12406` | 文档切换/卸载与共享 `workerPort` 的 destroy 竞态 ⇒ 偶发假「解析失败」面板（真实原因是 pdf.js 反并发守卫） |
| S-PDF-06 | P1 | `PdfSearchPanel.vue:363-381` + `PdfViewer.vue:805-816` | 缩放后搜索高亮静默消失（文本层被整体重建，registry 里留下悬空 Range，无人重绘） |
| S-PDF-07 | P2 | `PdfViewer.vue:165-177`、`678` + `pdf.mjs:12438/12439/12858`、`12954-12962` | 加载期对全部页 `getPage`，pdf.js 的两个页缓存无淘汰，且从不调用 `cleanup()` ⇒ 大文档常驻内存随页数线性增长 |
| S-PDF-08 | P2 | `PdfViewer.vue:915-919`（`917-919`）、`1087-1092`、`1094-1098` | `<slot name="overlay">` 与 `.pdf-overlay` 无任何消费者（死代码） |
| S-PDF-09 | P2 | `PdfViewer.vue:865` + `ReaderPanel.vue:41,223` | `defineExpose({ gotoPage })` 与 `ref="pdfViewer"` 均无消费者（死导出 / 死绑定） |
| S-PDF-10 | P2 | `PdfViewer.vue:757-759`、`870-874` | 缩放按钮在 `MIN_SCALE`/`MAX_SCALE` 处无禁用态：点击静默无效 |
| S-PDF-11 | P2 | `KnowledgeMap.vue:105-116`、`118-150` + `outline-notes.ts:38-45` | 目录键规则 `${parentKey}/${index}` 三处重复实现，无交叉断言 ⇒ 单侧改动会静默清空笔记徽标/章节过滤 |
| S-PDF-12 | P2 | `image-capture.ts:21-44`（`39-43`）+ `ChatPanel.vue:406-412` | 粘贴图不可解码时调用方无法区分「跳过」与「无图」，全程静默 |
| S-PDF-13 | P2 | `ReaderPanel.vue:126-141`（watcher）、`90-115`（`loadTextFile`） | 文本加载在途时切到 PDF，过期响应仍写 `content`/`failure`（状态抹除不彻底，当前不可见） |
| S-PDF-14 | P2 | `PdfSelectionQuickAsk.vue:104-115`、`56-90` | 反馈态 2.5s 后复位为双按钮时重算尺寸但不重算几何 ⇒ 浮层与选区错位 |
| D-PDF-01 | D | `PdfViewer.vue:204-208` | `MAX_SCALE × devicePixelRatio` 无上限的 canvas 后备存储（量级公式给出），改动需产品决策 |
| D-PDF-02 | D | `PdfViewer.vue:165-177`、`678-683` | 首屏前全量测量页尺寸（大文档加载窗口变长）；修法（懒测/占位尺寸）会撞冻结的页盒几何断言 |
| D-PDF-03 | D | `PdfViewer.vue:923-935`（`931`）、`402-441` | 框选模式内滚轮被拦截、分页键仍生效（滚轮为 R4 设计明示，键位为 R11/R12 冻结） |
| D-PDF-04 | D | `KnowledgeMap.vue:42-43`、`199-207` | 地图自动滚动抑制窗口用 `Date.now() + 600` 的时长假设，慢渲染下程序性跳转晚到会触发自动滚动 |

## 2. P0 条目

### S-PDF-01：末页页码跟踪失准（缩放 <1 或窗口足够高时，末页永远不会成为「当前页」）

| 项 | 内容 |
| --- | --- |
| 分级 | P0（用户可见的功能缺陷；错误状态外溢到 AI 上下文与落盘现场） |
| 位置 | `PdfViewer.vue:290-315`（判据在 `294`，写回在 `314`）、`317-324`（`scrollToPage`）、`420-441`（`End`/`Home`/PageUp/PageDown 键） |
| 证据 | `const marker = rootRect.top + Math.min(120, root.clientHeight * 0.2);`（`:294`）＋二分「最后一个顶边 ≤ marker 的页」（`:302-313`）＋ `readerStore.setPage(current + 1)`（`:314`）。末页在**最大滚动位**上的顶边相对容器为 `clientHeight − 48(下内边距) − 末页高`，故「末页被判为当前页」的条件是 `末页高 ≥ clientHeight − 168`（`<.pdf-scroll>` 的 `padding: 48px 16px` + `overflow: auto`，`PdfViewer.vue:1042-1047`）。夹具实算（3 页 842pt、1600×1000 窗口、`clientHeight ≈ 880`，与 R11-design §0.1 记录的「缩放只改页盒尺寸」同源）：`scale = 0.5` 时末页高 `round(842×0.5) = 421`，最大滚动位下末页顶边 ≈ `880 − 485 = 395 > 120` ⇒ 二分命中**倒数第二页**。既有断言 `ui-shot.mjs:1794/1925/1980/2031` 的 `第 3 / 3 页` 全部在 100% 缩放下成立（此时末页顶边 ≈ −26 ≤ 120），因此它们不是反例，也不构成覆盖。 |
| 为什么是问题 | `readerStore.page` 是阅读位置的唯一事实源：页码指示器（`PdfViewer.vue:974-1006`）、章节 chip 与 `[`/`]` 目标（`PdfViewer.vue:72-77`、`403-412`）、`KnowledgeMap` 的进度行（`KnowledgeMap.vue:59-63`）、AI `<reading_context> page:` 与发送锚点（`ChatPanel.vue:351-359`）、现场落盘（`PdfViewer.vue:820-825` → `reader-state-store.noteChange`）全部读它。于是：停在文档末尾时用户看到「第 2 / 3 页」（缩放 50%）或高窗口 100% 下的同类错值；`End` 键按下后先写 `pageCount`、随后被滚动回调改回 N−1，表现为「End 键无效」；章节 chip 停在倒数第二节；用户下次「继续阅读」与 agent 拿到的页码都少一页。 |
| 建议修法 | 只改 `updateCurrentPage`，在二分之后加「触底钳制」：`if (root.scrollTop + root.clientHeight >= root.scrollHeight - 1) { readerStore.setPage(readerStore.pageCount); return; }`（用 `pageSizes.value.length`/`pageCount` 兜底）。该式在中部滚动时为零副作用，在 100% 缩放下与现结果一致（末页顶边已在 marker 之上），故既有断言不受影响。若想更普适，可改为「marker 落在某页区间内取该页；不在任何页内时取垂直距离最近者」，但会改变中部滚动（页间 16px 间隙）的既有取页口径，风险更大，不推荐本轮做。 |
| 修复风险 | 触碰 `updateCurrentPage` = 页跟踪唯一写入点（非冻结面）。既有断言中不存在「停在底部却断言非末页」的场景（`ui-shot.mjs` 的翻页/跳页场景全部在 100% 缩放且目标页非末页或在末页），故无既有断言被改写。不涉及 `reader-state.json` 协议与 store 字段语义。 |
| 判据 | ① 走查：`grep -n "scrollHeight - 1" PdfViewer.vue` 命中 1 处且在 `updateCurrentPage` 内。② 离屏新增场景：打开 3 页夹具 → 点新增选择器 `zoomOutBtn: '.pdf-toolbar button[title="缩小"]'`（既有 `SEL` 只有 `zoomInBtn`，需新增 1 项）到 `.zoom-label` 逐字 `50%` → `pressReaderKey("End")` → 断言 `.page-label` 逐字 `第 3 / 3 页`（修复前必红）；再 `pressReaderKey("PageDown")` 不改变页码；随后点 `SEL.zoomInBtn` 回 100% 复跑既有翻页场景确认零回归。③ 反向保护：断言 `scale = 0.5` 下把 `.pdf-scroll` 的 `scrollTop` 设为 `0` 时页码回到 `第 1 / 3 页`。 |

## 3. P1 条目

### S-PDF-02：释放路径 O(N²) 的 DOM 扫描（大文档缩放/加载卡顿）

| 项 | 内容 |
| --- | --- |
| 分级 | P1（性能热点：与页数平方相关的主线程开销） |
| 位置 | `PdfViewer.vue:248-262`（`const pageEl = pageElement(pageNumber);` 在 `260`，`clearPageLayers` 在 `179-187`）、调用来源 `269-284`（IO 回调，`278-279` 触发释放）与 `805-816`（缩放 watcher） |
| 证据 | `pageElement()` 每次调用都做一次全量属性选择器查询：`return scrollEl.value?.querySelector(`[data-page="${pageNumber}"]`) ?? null;`（`:105-107`）；`releasePage` 无条件调用它（`:260`），`clearPageLayers` 内再各查一次 `canvas` / `.textLayer`（`:180/185`）；`observePages()` 对**全部**页注册观察者（`:285-287`），而 IntersectionObserver 对每个新观察目标都会投递一次初始条目 ⇒ 每当 `observePages()` 重建（每次缩放、每次加载）就会对「不在视口且距当前页 > 4」（`:278`）的每一页调用 `releasePage`。推导量级：N 页文档每次缩放 ≈ (N−5) 次 `releasePage` × 3 次选择器扫描 ⇒ O(N²) 元素访问；1000 页文档即约 300 万次元素比较，且其中绝大多数页从未渲染（`clearPageLayers` 纯属浪费）。 |
| 为什么是问题 | 连续 Ctrl+滚轮缩放与打开大文档都会走这条路径；`observePages` 在每次 `readerStore.scale` 变化时都会被调用（`:805-816`），而滚轮缩放允许连续触发（`ZOOM_COALESCE_MS = 150`，`:764`）。这与「可观测的卡顿 / 无界增长」同属 P1 口径；同时 `pageNodes`（`:268`、`296`）已经持有全部页节点，当前实现却弃之不用。 |
| 建议修法 | 在 `observePages()` 里顺手建 `const pageNodeMap = new Map<number, HTMLElement>()`（或直接用已有 `pageNodes[pageNumber - 1]`），把 `releasePage`/`pageElement` 的查询改为查表；并让 `releasePage` 先判 `renderedPages.has(pageNumber) || textLayers.has(pageNumber) || renderTasks.has(pageNumber)`，全假时直接返回（未渲染页无需清理 DOM）。语义零变化。 |
| 修复风险 | 只动渲染簿记与查询方式，不改任何类名/文案/几何；既有离屏断言（`.pdf-page`、`.textLayer span` 计数、`canvas.style.width`）不受影响。唯一注意点：`pageNodes` 在 `destroyDocument` 被清空（`:121`），表必须在 `observePages` 内重建而非跨文档复用。 |
| 判据 | ① 走查：`releasePage` 内不再出现 `pageElement(`/`querySelector(`（`grep -n "querySelector" PdfViewer.vue` 命中集合只剩 `observePages` 的建表查询 `:285` 与 `captureRegion` 的 `root.querySelectorAll` `:571`）。② 离屏新增场景（用现场 `buildPdf` 生成 200 页夹具）：记录 `openDocument` → `.pdf-page` 出现的主线程耗时，以及连续 5 次点击「放大」的累计耗时；修复前后同机对比（如实测差值 < 10ms 则该条降级为登记项，需在 dev 档写明读数）。 |

### S-PDF-03：`renderedPages` 与 `renderTasks` 之间的 await 窗口导致同 canvas 并发渲染

| 项 | 内容 |
| --- | --- |
| 分级 | P1（竞态 + 错误路径；可见后果有限但错误会进 console 并浪费一次渲染） |
| 位置 | `PdfViewer.vue:196-217`（`renderedPages.add(pageNumber)` 在 `196`，`await pdfDoc.getPage(...)` 在 `197`，`renderTasks.set(...)` 在 `217`）、释放侧 `248-262`、触发侧 IO 回调 `275-277` 与缩放 watcher `805-816` |
| 证据 | 窗口内不存在任何可取消句柄：`releasePage` 只处理 `renderTasks`/`textLayers` 里已有的条目（`:249-257`），而 `getPage` 的 await 期间两者皆空，于是它只删 `renderedPages` 并清空 canvas（`:259-261`）。`observePages()`（缩放后必走，`:813`）会立刻为同一页再发起一次 `renderPage`，此时 `renderedPages.has(...)` 已被删除 ⇒ 第二次进入并把同页再渲染一遍，与第一次的在途任务并发。pdf.js 对此有显式守卫：`if (InternalRenderTask.#canvasInUse.has(this._canvas)) { throw new Error("Cannot use the same canvas during multiple render() operations. …") }`（`pdf.mjs:13116-13119`）。抛错路径由 IO 回调兜住并打日志：`console.error("[pdf-viewer] Failed to render page", …)`（`:275-277`）；失败任务还会执行 `renderedPages.delete(pageNumber)`（`:221`），簿记被抹一次。 |
| 为什么是问题 | 竞态本身即 P1；实际损失是「一次多余渲染 + 一条 console 错误 + 簿记丢失一次（后续需再渲染）」。在慢渲染（大页 + 高缩放）与连续缩放叠加时窗口被放大，属于可在真机偶发的路径；同时它使 `renderedPages` 不再可信，后续 `releasePage` 判定（`S-PDF-02`）会跟着偏差。 |
| 建议修法 | 在 `getPage` 之后补一行「所有权复核」：`if (generation !== loadGeneration || !renderedPages.has(pageNumber)) return;`（位置紧接 `:198` 的 generation 判定）。这样 `releasePage` 一旦撤销该页，在途任务在 `getPage` 返回后立即退出，第二次调用成为唯一渲染者；再在 `renderTasks.set(pageNumber, renderTask)` 前复查一次 `renderedPages.has(pageNumber)`（同步区间，无 await，天然安全）。 |
| 修复风险 | 触碰唯一渲染入口；不涉及类名/文案/几何断言。需复跑 R1/R6/R12 的页渲染与跳页场景（缩放后可见页必须仍全部渲染：`.textLayer span` 计数断言可覆盖）。 |
| 判据 | ① 走查：`:197` 之后存在对 `renderedPages.has(pageNumber)` 的复核。② 离屏新增场景：大页夹具（把夹具页内容放大或把 `scale` 推到 `MAX_SCALE`）→ 连续 6 次快速点击「放大/缩小」→ 断言 (a) 当前可见页 `canvas.width > 0 && canvas.height > 0`、(b) `.textLayer span` 计数 > 0。③ 在离屏脚本里监听 `webContents` 的 `console-message`，断言窗口内不出现 `Failed to render page`（修复前可复现则必红；若 10 次复跑仍不可复现，降级为登记项并在 dev 档写明「未能复现」）。 |

### S-PDF-04：框选截图失败路径全静默 + 无条件退出框选模式

| 项 | 内容 |
| --- | --- |
| 分级 | P1（静默失败：用户动作无结果、无提示） |
| 位置 | `PdfViewer.vue:531-544`（指针抬起：`captureRegion(rect)` 在 `541`，`exitCaptureMode()` 在 `543`）、`captureRegion` 的 7 处早退 `559/588/590/592/602/617/620` |
| 证据 | 全部为裸 `return`，无返回值、无日志、无 UI：`if (!root \|\| !layer) return;`（`:559`）、`if (!target) return;`（`:588`）、`if (!source \|\| source.width <= 0 \|\| source.height <= 0) return;`（`:590`）、`if (canvasRect.width <= 0 \|\| canvasRect.height <= 0) return;`（`:592`）、`if (cssWidth <= 0 \|\| cssHeight <= 0) return;`（`:602`）、`if (!ctx) return;`（`:617`）、`if (!base64) return;`（`:620`）。而 `onCapturePointerUp` 在调用后**无条件**退出框选模式（`:543`，`exitCaptureMode()` 内还会 `resetCaptureDrag()`，`:494-497`）。 |
| 为什么是问题 | 目标是「松手 → composer 出现『截图 N』chip」（`docs/pm/DEV-R4-capture.md` 第二部分「松手」与验收清单第 3 条）。当目标页 canvas 尚未绘制（刚缩放后 `releasePage` 清空过画布、或渲染未完成）、或该页 canvas 为 0×0 时，用户的拖拽被静默吞掉：模式退出、无附件、无提示——用户只能靠「chip 没出现」自己推断，且无法区分「我拖太小」与「程序失败」。同类静默在 `MIN_CAPTURE_PX` 误触分支（`:540`）是**有意**的（R4 明示），但失败分支没有对应的自有语义。 |
| 建议修法 | 让 `captureRegion` 返回 `boolean`（成功 = 已 `emitRegionCapture`），`onCapturePointerUp` 改为 `const ok = rect && rect.width >= MIN_CAPTURE_PX && rect.height >= MIN_CAPTURE_PX ? captureRegion(rect) : true; if (ok) exitCaptureMode();`；失败时保留框选模式并在 `.capture-hint` 位置追加一行中文提示（如「该区域尚未渲染完成，请稍后重试」），复用既有 `FEEDBACK_MS` 式短提示范式。 |
| 修复风险 | 这是**交互语义的改动**（R4 设计写的是「松手后退出模式」），按 PRD-V0.5 §5.7「冻结字面的有意变更必须在本轮需求档显式登记」需先登记再改；新增提示文案会引入新 DOM 节点，若与既有截图目视基线冲突需同步。不涉及任何既有断言选择器（`SEL.captureLayer` / `captureFabBtn` 不变）。 |
| 判据 | ① 走查：`captureRegion` 的 7 处裸 `return` 全部变为 `return false`，且 `onCapturePointerUp` 依据返回值决定是否退出。② 离屏新增场景：进入框选模式 → `js` 把当前页 `canvas` 宽高置 0 → 派发 `pointerdown/move/up`（≥6px）→ 断言 `.capture-layer` **仍在 DOM** 且出现失败提示文案、`.pdf-capture-fab` 仍为激活态；修复前该断言必红。③ 反向：正常拖拽仍退出模式且 composer 出现「截图 1」chip（既有场景不改）。 |

### S-PDF-05：文档切换/卸载与共享 `workerPort` 的 destroy 竞态（假「解析失败」面板）

| 项 | 内容 |
| --- | --- |
| 分级 | P1（竞态；结果是用户可见的错误面板，需手动「重试」） |
| 位置 | `PdfViewer.vue:109-116`（`discardLoadingTask` 先把 `loadingTask = null` 再 `await task.destroy()`）、`643`（`await destroyDocument()`）、`670-672`（`getDocument` 紧随其后）、`850-863`（卸载时 `void destroyDocument()`）；pdf.js 侧 `PDFDocumentLoadingTask.destroy()`（`pdf.mjs:11553-11570`，`_pendingDestroy = true` 在 `11557`）与 `PDFWorker.fromPort` 守卫（`throw … the worker is being destroyed …`，`pdf.mjs:12406`） |
| 证据 | 共享 worker 只创建一次：`GlobalWorkerOptions.workerPort = new PdfJsWorker();`（`PdfViewer.vue:39-41`）。`PDFDocumentLoadingTask.destroy()` 在 `await this._transport.destroy()` **之前**给共享 worker 打上 `_pendingDestroy`（`pdf.mjs:11553-11557`），直到 `this._worker?.destroy()`（`pdf.mjs:11567`）才清除；期间任何 `getDocument` 走 `PDFWorker.fromPort(port)` 都会直接抛错。本地代码把 `loadingTask` 在 destroy 之前置空（`:110`），因此**第三个**加载在同一 tick 窗口内启动时看不到在途的 destroy：`destroyDocument()` 因 `loadingTask === null` 立即返回（`:131-133`），随后 `getDocument` 抛错，被 `catch`（`:701-713`）按「解析失败」渲染（`failureFromParseError` + `technicalDetail`），而它并不是解析失败。触发序列：连续快速打开 A→B→C（或 A→B→A），B 的 destroy 尚在 IPC 往返中，C 已进入 `getDocument`。卸载路径同理：`onBeforeUnmount` 用 `void destroyDocument()`（`:862`）不 await，紧接重开 PDF 可能撞上同一窗口。 |
| 为什么是问题 | 失败结果与真实原因不符（用户看到「无法解析该 PDF 文件」而文件完好），需要手动重试；technical detail 会把 pdf.js 的英文内部提示暴露给用户。窗口窄（需两次切换之间的 IPC 往返内再发起一次），因此本条不改判为 P0，但它是确定性竞态而非理论猜想：守卫与置位都是 pdf.js 源码级事实。 |
| 建议修法 | 把 destroy 串成一条链并让 `getDocument` 之前一定等到链尾：新增模块级 `let destroyChain: Promise<void> = Promise.resolve();`，`destroyDocument()` 内部改为 `destroyChain = destroyChain.then(() => discardLoadingTask(task))` 并在函数末尾 `await destroyChain`；`loadPdf` 在 `getDocument` 之前补 `await destroyChain;`。备选（更小）：保留 `loadingTask` 引用直到 destroy 完成（不要在 `discardLoadingTask` 里提前置空，而是置为「在途」标记），使后续调用能复用在途 promise。 |
| 修复风险 | 触碰加载时序 = R6 的落点/现场消费链（`takePendingJump`/`takeRestore` 必须在 `getDocument` 之前结算，`:650-652`），改法必须保持这两次调用在任何 await 之前的相对顺序；不得引入新的「等待期间吞掉意图」路径。既有断言（N20 系列跳页/恢复）必须复跑。 |
| 判据 | ① 走查：`getDocument` 之前存在对在途 destroy 的等待（`grep -n "destroyChain\|await destroy" PdfViewer.vue`）。② 离屏新增场景：用 stub 的读文件延迟把 A 的加载拉长 → 依次触发 `openRow(A)` → `openRow(B)` → `openRow(A)`（间隔 ≤ 1 个 IPC 往返，用 `js` 连发三次选择）→ 断言 `.pdf-error` **不在 DOM**、`.pdf-page[data-page="1"]` 在 DOM、且 `.page-label` 为 `第 1 / 3 页`；修复前若复现该面板即判红（若 10 次复跑无法复现，则把场景改为断言「无 `Failed to load PDF` 控制台日志」，并在 dev 档写明复现率）。 |

### S-PDF-06：缩放后搜索高亮静默消失（悬空 Range 无人重绘）

| 项 | 内容 |
| --- | --- |
| 分级 | P1（状态未复位；可见挫败但非阻断） |
| 位置 | `PdfSearchPanel.vue:363-381`（唯一的页面变化重绘 watcher）、`179-191`（重绘入口 `revealCurrentMatch`）、`95-98`（`clearHighlights`）+ `PdfViewer.vue:805-816`（缩放会释放并重建文本层） |
| 证据 | 缩放 watcher 对每个已渲染页调用 `releasePage`（`:809-811`），而 `releasePage` → `clearPageLayers` 会 `textLayerDiv.replaceChildren()`（`PdfViewer.vue:185-186`）并让页面重新走 `renderPage` 生成**新的**文本节点（`:229-244`）。`paintHighlights` 注册的 `Highlight` 持有的是旧 `Range`（`PdfSearchPanel.vue:248` / `252`），节点被替换后高亮不再绘制；面板只监听 `props.filePath` / `props.pdfDocument` / `query` / `readerStore.page`（`:340-381`），**不监听 `scale`**，因此不会重绘。用户操作序列：搜索 → 跳到匹配（高亮出现）→ Ctrl+滚轮缩放 → 高亮消失，状态栏仍显示「第 k / N 处」。 |
| 为什么是问题 | 属「状态未复位 + 陈旧引用常驻」：registry 里留着指向已脱离文档的 Range（重复缩放不会累积，因为 `paintHighlights` 用 `registry.set` 覆盖，但旧 Range 会保留到最后一次 `clearHighlights`），且用户在缩放后无法判断匹配位置。修复成本极低（一遍重绘路径已存在）。 |
| 建议修法 | 面板新增 `watch(() => readerStore.scale, () => repaint())`：`repaint` 复用 `revealCurrentMatch` 的「等文本层 → `paintHighlights(layer, match, false)`」两行（不写第二份匹配逻辑，不重新滚动）。也可在 `clearHighlights` 之前判 `currentMatch` 是否存在以避免无谓重建。 |
| 修复风险 | 纯新增 watcher；`::highlight(pix-search)` / `pix-search-current` 名称与样式（`PdfViewer.vue:1271-1282`，规则在 `:1275`/`:1279`）不动。注意缩放期间 `waitForTextLayer` 的 5s 轮询上限（`:43`、`:193-217`）在极端慢渲染下会放弃，属可接受行为。 |
| 判据 | ① 走查：`grep -n "readerStore.scale" PdfSearchPanel.vue` 命中 1 处且在新增 watcher 内。② 离屏新增场景（R1 搜索场景后追加相位）：搜索命中 → 断言 `CSS.highlights.has("pix-search-current")` → 点「放大」一次 → 等待 ≤ 1500ms → 断言 (a) `CSS.highlights.get("pix-search-current").size === 1`、(b) 该 Range 的 `startContainer.isConnected === true`；修复前 (b) 必假。 |

## 4. P2 条目

| 编号 | 位置 | 证据 | 为什么是问题 | 建议修法 | 修复风险 | 判据 |
| --- | --- | --- | --- | --- | --- | --- |
| S-PDF-07 | `PdfViewer.vue:165-177`、`678`；`pdf.mjs:12438/12439/12858/12954-12962` | `measurePages` 对 `i = 1..doc.numPages` 逐个 `await doc.getPage(i)`（`:170-175`），结果在首屏前返回（`:678` 之后才 `isLoading = false`，`:683`）；主线程 `WorkerTransport` 的 `#pageCache`/`#pagePromises` 是**无淘汰**的 Map（`pdf.mjs:12438-12439`，写入在 `12858`），只由 `loadingTask.destroy()` 清空；pdf.js 提供的 `startCleanup()`（`pdf.mjs:12954`，逐页 `cleanup()`）在本仓库从未被调用（实测 `grep -rn "pdfDoc.cleanup\|startCleanup\|pdfDocument.cleanup" pix/src` = 0 命中、`grep -c "cleanup" PdfViewer.vue` = 0） | 大文档下「每个曾取过的页」常驻主线程（页代理 + 页信息 + 渲染期缓存），且没有任何释放通道被使用；属资源常驻偏 P2（有界于单篇文档，切文档即释放） | ① 不改变「加载后立刻可跳页」的语义前提下，改为在空闲时（`requestIdleCallback`）或滚动稳定后调用 `await pdfDoc.cleanup()`；必须 try/catch 并接受 pdf.js 的拒绝（`startCleanup: Page N is currently rendering.`，`pdf.mjs:12962`）。（② 全量测量的取舍见 D-PDF-02） | 只新增清理调用，不动尺寸/渲染路径；`cleanup()` 会清字体缓存与 `commonObjs`，若在渲染中调用会抛错，必须包 catch 且不得在 `renderPage` 在途时调用（建议加 `renderTasks.size === 0` 守卫） | 走查：存在带 `renderTasks.size === 0` 守卫的 `cleanup()` 调用与 catch；离屏：翻页若干次后 `task manager` 内存读数（或 `performance.memory.usedJSHeapSize`）不随翻页次数线性上升（修复前 200 页夹具连续翻 100 页后读数应显著高于修复后） |
| S-PDF-08 | `PdfViewer.vue:915-919`（`918`）、`1087-1092`、`1094-1098` | 模板保留 `<div class="pdf-overlay"><slot name="overlay" :page="index + 1" /></div>`（`:917-919`），全仓库无调用点：`grep -rn "v-slot:overlay\|#overlay" pix/src` 仅命中 AppLayout 自己的同名 slot 与 `.pdf-overlay` 样式（`grep -rn "pdf-overlay" pix/src/renderer` = 3 处，全在本文件，其中 1 处为 `.capture-mode` 的 pointer-events 规则） | 仓库红线「不写未被调用的死代码」（PRD-V0.5 §4.8）；同时 `.capture-mode :deep(.textLayer), .capture-mode .pdf-overlay { … }` 这条规则也随之变成只对 textLayer 生效 | 删除该 slot 与 `.pdf-overlay` 规则（`z-index: 2`、`pointer-events: none`），并同步 `.capture-mode` 选择器列表 | `docs/pm/DEV-R1a-reader.md` 把 overlay 写成既有 DOM 契约（「内含 canvas + .textLayer + overlay」），删除属文档漂移，需同步改档；`ui-shot.mjs` 无任何断言引用 `.pdf-overlay`（实测 `grep -c "pdf-overlay" ui-shot.mjs` = 0），故无离屏风险 | `grep -rn "pdf-overlay\|name=\"overlay\"" pix/src/renderer` = 0；`cd pix && npm run check` 仍 0 error |
| S-PDF-09 | `PdfViewer.vue:865`；`ReaderPanel.vue:41,223` | `defineExpose({ gotoPage });`（`:865`）；`const pdfViewer = ref<InstanceType<typeof PdfViewer> \| null>(null);`（`ReaderPanel.vue:41`）+ `ref="pdfViewer"`（`:223`）——全仓库无 `pdfViewer.value` 读取点（`grep -rn "pdfViewer" pix/src` 仅这两行 + 模板绑定），也无任何 `.gotoPage(` 的模板 ref 调用（跳页一律走 `readerStore.gotoPage`：`KnowledgeMap.vue:203`、`PdfSearchPanel.vue:185`、`ChatPanel.vue:638`） | 死导出 + 死绑定；`docs/pm/DEV-R4-capture.md`「defineExpose 清理」段声称「KnowledgeMap/ReaderPanel 只用 gotoPage」，与实际不符（ReaderPanel 连 ref 都不用） | 删除 `defineExpose` 与 `ReaderPanel` 的 `ref="pdfViewer"` / `pdfViewer` 声明 | 无行为影响；若未来要用 `gotoPage` 公开方法需重新加回（非向后兼容要求，符合 §4.8） | `grep -rn "pdfViewer" pix/src/renderer` = 0；`npm run check` 0 error；既有跳页场景（`ui-shot.mjs` 22d/30/31）仍绿 |
| S-PDF-10 | `PdfViewer.vue:757-759`、`870-874`；`reader-store.ts:136-139` | 工具栏两键无禁用态：`<v-btn icon="mdi-minus" … @click="zoomBy(-0.1)" />` / `<v-btn icon="mdi-plus" … @click="zoomBy(0.1)" />`（`:871`/`:873`）；`zoomBy` 直接把值丢给 `setScale`，而 `setScale` 在 `MIN_SCALE = 0.5` / `MAX_SCALE = 3`（`reader-store.ts:20-21`）处静默钳制 | 到达上下限后按钮仍可点击且无任何反馈（含键盘外的鼠标重复点击），用户无法判断「已到极限」还是「坏了」 | 加 `:disabled="readerStore.scale <= MIN_SCALE"` / `>= MAX_SCALE`（从 `reader-store` 顶层 import 两个常量，遵循「字面量只此一份」的既有约束） | R11 的 `r11-3` 相位会连点「放大」直到可滚动；`clickEl` 用 `el.click()`（`ui-shot.mjs:6942`），禁用按钮点击静默无效，不抛错 ⇒ 该相位行为不变；但若将来断言点击次数/禁用态需同步 | 走查：两处 `:disabled` 命中；离屏：缩小到 50% 后「缩小」按钮 computed `disabled === true`，「放大」可点（新增 1 条 record） |
| S-PDF-11 | `KnowledgeMap.vue:105-116`、`118-150`；`outline-notes.ts:38-45` | 同一键规则三处实现：`collectPreorder` 的 `const key = `${parentKey}/${index}`;`（`outline-notes.ts:41`）、`flattenVisible` 的 `const key = `${parentKey}/${index}`;`（`KnowledgeMap.vue:129`）、`collectExpandable` 的 `const key = `${parentKey}/${index}`;`（`:112`）；而 `noteCounts`/`chapterRanges` 以 `ranges.get(key)` / `counts.get(key)` 取用（`:132`、`:142`），键不匹配即静默无徽标 | 契约漂移（多处实现同一规则）：任一侧改动（例如改为「含标题的复合键」）都会让笔记徽标与「只看该章节」过滤**静默失效**，且当前没有任何断言跨侧比较（`smoke-view.mjs` 只覆盖 `outline-notes` 的纯函数，`.vue` 行派生不在编译面内） | 由 `outline-notes.ts` 导出 `outlineKey(parentKey, index)`（或 `collectPreorder` 附带「键 → 行」映射）供组件复用，把三处字面量收敛为一处 | R12-design 把地图行派生与 `collectPreorder` 的「同口径」写成了冻结事实，本改动只换实现来源、不改键值 ⇒ 键值必须逐字不变；`KnowledgeMap.vue` 的模板与类名不动 | 走查：`grep -c '\${parentKey}/\${index}' pix/src/renderer` 由 3 降为 1；离屏：既有徽标场景（场景 50/60 系列）与 `smoke-view` 的 `badge-counts` 5 条全绿 |
| S-PDF-12 | `image-capture.ts:21-44`（`39-43`）；调用方 `ChatPanel.vue:406-412` | `preparePastedImage` 在不可解码时 `console.error` 后 `return null`（`:39-43`），返回值只有「成功对象 / null」两态；调用方 `if (prepared) { …push… }`（`ChatPanel.vue:409-411`）在 null 时不做任何事，也没有「跳过 n 张」类提示 | 失败路径无用户信号（剪贴板粘贴 svg/heic/损坏位图时表现为「粘贴没反应」），且调用方无法区分「没有图片」与「解码失败」 | 让 util 返回判别结果（如 `{ ok: true, image } \| { ok: false, reason }`），由调用方决定是否提示（提示文案落在 ChatPanel，属另一分片） | 改的是跨分片接口契约（`ChatPanel` 非本面文件），需与 `R15-audit-render-panels` 分片协调；不涉及类型 `any`、不引入依赖 | 走查：`preparePastedImage` 的返回类型含失败分支且被调用方消费；离屏：粘贴不可解码文件后出现提示文案（新增 1 条 record） |
| S-PDF-13 | `ReaderPanel.vue:126-141`（watcher）、`90-115`（`loadTextFile`，取号 `:91`、token 判定 `:101`/`:109`/`:113`） | 切文档时 watcher 只重置 `content/truncated/failure/failureDetail`（`:133-136`），**不递增** `textLoadToken`；`loadTextFile` 仅在**文本文件**目标上被调用（`:137-138`），因此「文本加载在途 → 切到 PDF」时旧请求的 `token === textLoadToken` 仍成立，`:100-107` 会把旧文件内容与失败态重新写回 `content`/`failure` | 状态抹除不彻底（陈旧文档的读结果写回当前文档的槽位）。当前模板分支（`:212-256`）在 PDF/非文本文件下不读这两个字段，所以用户不可见；但任何未来分支调整（例如统一空态/错误态复用 `failure`）都会把它变成可见脏状态 | watcher 内补 `textLoadToken += 1;`（与 `loadTextFile` 的取号语义一致：切文档即作废在途请求），或把 `isLoading/failure` 的复位与 token 作废集中到一处 | 纯状态机收紧，不改模板、不改既有文案；需确认 `retryTextLoad`（`:117-124`）仍能正常取号 | 走查：watcher 内存在 `textLoadToken += 1`；离屏：用 stub 延迟打开大文本文件后立即切 PDF，再切回原文本文件，断言内容与目标一致（新增大文本夹具场景） |
| S-PDF-14 | `PdfSelectionQuickAsk.vue:104-115`（`showFeedback` 的复位计时器）、`56-90`（`showFor` 的几何计算） | 反馈态计时器把 `mode` 复位为 `"actions"` 并清空 `feedback`（`:109-113`），但**不重算** `pos`；`pos` 只在 `showFor` 里依据当时 `el.offsetWidth/offsetHeight` 计算（`:77-89`），而两种模式的浮层宽度不同（`.quick-ask-btn` 与 `.quick-ask-feedback` 的文本长度差异明显，样式在 `:244-287`） | 反馈结束后浮层可能不再贴齐选区右缘/上方（视觉错位），且窗口缩放或阅读区尺寸变化时也不会重算 | 反馈复位时（以及 `mode` 变化时）触发一次几何重算：把 `showFor` 的几何段落抽成 `layout()`，在 `mode` 变化后 `await nextTick()` 调用（不重新解析选区页码） | 只改渲染层定位；不涉及类名与文案；注意 `offsetParent` 判定（`:72-73`）在 `v-show` 隐藏态下不可用（`display: none` ⇒ `offsetParent === null`），重算必须在 `visible === true` 后执行 | 走查：存在对 `layout()` 的复用（`grep -n "function layout"`）；离屏：摘录成功后等待 2600ms，断言 `.quick-ask` 的 `x/y/width/height` 与「反馈态」相比位置不越界（新 1 条 record） |

## 5. 登记不修（D）

### D-PDF-01：`MAX_SCALE × devicePixelRatio` 无上限的 canvas 后备存储

| 项 | 内容 |
| --- | --- |
| 分级 | D（登记不修：改动涉及清晰度取舍，需产品决策与真机内存读数；本轮无判据） |
| 位置 | `PdfViewer.vue:204-208`（`outputScale = window.devicePixelRatio \|\| 1`；`canvas.width = Math.floor(viewport.width * outputScale)`） |
| 事实与量级 | 单页后备存储 = `(round(W·scale)·DPR) × (round(H·scale)·DPR) × 4B`。A4/Letter 夹具页（595×842pt）在 `scale = 3`、`DPR = 2` 时为 `3570 × 5052 ≈ 1800 万像素 ≈ 72 MB`；同一时刻保留的页数由 `rootMargin: "1200px"`（`:283`）与「距当前页 > 4 才释放」（`:278`）共同决定，高缩放下通常 3~5 页 ⇒ 峰值可达数百 MB 量级。`CAPTURE_MAX_EDGE = 2000`（`:80`）只约束截图产物，不约束显示画布。 |
| 不修的理由与代价 | 修法通常是「给渲染 DPR 设上限（如 `min(DPR, 2)`）」或「页高超过阈值时按降采样渲染」，代价是高分屏 + 高缩放下的清晰度下降；本项目无相关需求（PRD-V0.5 §4 反需求未涉及），且缺真机内存读数（本轮不允许跑 ui-shot / 真机）。代价：极端窗口（4K + 屏缩放 200% + 300% 缩放）下内存偏高，可能触发 Chromium 的画布内存回收（表现为某页空白，需滚动重渲染）。 |
| 若将来处理 | 判据：`scale = 3`、`DPR = 2` 下打开 3 页夹具，`performance.memory.usedJSHeapSize` 与 `canvas` 像素总量写入 `MEASUREMENTS.json`；修后同机对比并断言清晰度不降（截图逐张目视）。 |

### D-PDF-02：首屏前全量测量页尺寸（大文档加载窗口变长）

| 项 | 内容 |
| --- | --- |
| 分级 | D（登记不修：修法撞冻结几何断言，需先改需求档） |
| 位置 | `PdfViewer.vue:165-177`（`measurePages` 串行 `await doc.getPage(i)`）、`678-683`（测完才 `isLoading = false`）、`691`（落页发生在测量之后） |
| 事实 | 打开 N 页文档要先完成 N 次 `getPage` 往返才渲染第一页；同一时段内 `pendingJump`/`pendingRestore` 的落页也被推后（`:689-691`）。对 1000 页级别文档这是秒级等待，且用户此时的跳页意图只能等测量完成。 |
| 不修的理由与代价 | 惰性测量的可行做法是「先用首页尺寸占位、每页进入观察器时再校正」，但那会让 `.pdf-page` 的 `width/height` 在首帧后变化——`ui-shot.mjs` 直接读页盒尺寸与 `canvas.style.width`（如 `:1382-1395` 的 `canvasWidth` 与 `:273` 的 `第 3 / 3 页 · 100%` 组合），且 R11-design §0.1 把 `cssSize = round(base × scale)` 写成冻结判据 ⇒ 必须先改需求档与离屏判据。代价：大文档首屏等待与「跳页意图延迟结算」。 |
| 若将来处理 | 判据：200 页夹具下 `openDocument` → 首个 `.pdf-page` 可见耗时（当前应为全部页测量完成）；修后断言该耗时 < 500ms 且 `.pdf-page` 尺寸最终与 `MEASUREMENTS.json` 冻结值逐字段一致。 |

### D-PDF-03：框选模式内滚轮被拦截、分页键仍生效

| 项 | 内容 |
| --- | --- |
| 分级 | D（登记不修：一侧为设计明示，一侧为冻结语义，语义不一致但不构成缺陷判定） |
| 位置 | `PdfViewer.vue:923-935`（`.capture-layer` 的 `@wheel.prevent` 在 `:931`）、`402-441`（`[`/`]` 在框选模式下被屏蔽，PageUp/PageDown/Home/End 未被屏蔽） |
| 事实 | 框选模式下滚轮被捕捉层吞掉（`:931`），因此无法滚动到其它页再框选；而分页键仍可翻页（`:418-441`，仅 `[` / `]` 被显式屏蔽于 `:405`）。`docs/pm/DEV-R4-capture.md`「保留能力」明示「截图模式下 Ctrl+滚轮缩放不允许（捕捉层拦截 wheel 即可）」；`docs/pm/R11-design.md` §2.1 明示「既有七键位在框选模式下仍生效」。 |
| 不修的理由与代价 | 两条语义各有冻结出处，改任一侧都要回改需求/设计档并新增断言。代价：用户想框选远页需先 Esc 退出、滚动、再进入框选模式；能力不一致（滚轮禁、分页键放）会让习惯滚轮的用户困惑。 |
| 若将来处理 | 判据：框选模式下 `scrollTop` 可被动滚动 + 分页键仍生效（或两者同时改为禁用），二者必须一致，且新增 record 覆盖。 |

### D-PDF-04：地图自动滚动抑制窗口的时长假设

| 项 | 内容 |
| --- | --- |
| 分级 | D（登记不修：影响面小、无判据；修法需先定义「程序性跳转」的可观测判据） |
| 位置 | `KnowledgeMap.vue:42-43`（`suppressScrollUntil`）、`199-207`（点击写 `Date.now() + 600`）、`75-85`（page watcher 依赖该时间戳） |
| 事实 | 抑制窗口是「时长」而非「一次跳转的因果标记」：节点点击后 600ms 内的任何 `readerStore.page` 变化都被视为程序性跳转（不自动滚动），反之慢渲染下程序性跳转若晚于 600ms 落地，地图仍会自动滚动（把用户手动滚动的树视图带走）。 |
| 不修的理由与代价 | 影响限于地图树自身滚动位置（不会错页、不会写盘）；改法（例如由 `gotoPage` 写入时打的一次性 token，或由 PdfViewer 在落页后回调）会新增跨组件耦合面，收益低于风险。代价：极端慢渲染（大文档首屏 > 600ms）下地图会跳一下。 |
| 若将来处理 | 判据：慢渲染夹具（stub 延迟）下点击地图节点，断言 `.map-tree` 的 `scrollTop` 在跳页前后不变。 |

## 6. 已核对、确认非缺陷（含冻结依据）

| # | 核对项 | 依据（真实文件/行号） | 结论 |
| --- | --- | --- | --- |
| 1 | Esc 在页码输入框 / 聊天 composer 内仍会关闭 PDF 搜索面板 | `PdfViewer.vue:392-401`（Escape 分支位于 `:402` 的 `isEditableTarget` 之前） | **非缺陷**：`R11-design.md` §1.1.1 行为矩阵把「非 `.notes-search-input` 目标按下 Esc ⇒ 关闭面板」写成冻结的既有语义，本轮不得改 |
| 2 | 章节 chip 原生 tooltip 不弹（容器与 chip 继承 `pointer-events: none`） | `PdfViewer.vue:1181-1213`（容器 `none`、两按钮 `auto`、chip 无覆盖） | **已登记**：`R12-design.md` §1.2.3 明示为可接受后果，判据只要求 `chipText === chipTitle`；若不要 hover tooltip 需回改需求档 §0.5 |
| 3 | 框选模式拦截滚轮/缩放 | `PdfViewer.vue:931` | **已登记**：`DEV-R4-capture.md` 明示「不允许」，理由降低边界复杂度 |
| 4 | `[`/`]` 在框选模式下被屏蔽、其余七键位仍生效 | `PdfViewer.vue:403-412` | **已登记**：`R11-design.md` §2.1（本轮为 `[`/`]` 新增的屏蔽），既有七键位语义逐字不变 |
| 5 | `KnowledgeMap` 自带区间比较（`isCurrent`/`isRead`） | `KnowledgeMap.vue:167-175` | **允许集合**：`R12-review.md` §N77-1 把反向区间比较的允许命中集合写为 `KnowledgeMap.vue:167/169/174` + `PdfSearchPanel.vue:268` |
| 6 | 搜索计数口径（`getTextContent` 拼接）与高亮口径（DOM 文本）可能不等 | `PdfSearchPanel.vue:110-124`、`219-254`（`localIndex` 夹逼在 `:249-252`） | **已登记**：文件头注释与 `:249` 注释写明差异与夹逼策略，不构成缺陷 |
| 7 | 跨页选区取起始页 | `note-capture.ts:15-22`（锚点优先，跨页取起始页）、`:24-35`（几何回退） | **已冻结**：注释写明「跨页取起始页」，与 `PdfSelectionQuickAsk.vue:128-133` 的 `stage.contains(anchor)` 守卫一致 |
| 8 | 文本层 `--scale-factor` 的写法与 pdf.js 4.10 配套 | `PdfViewer.vue:200-203`（`:203` 设 `--scale-factor`）；pdf.js 侧 span 字号与位移均用 `calc(var(--scale-factor)*…)`（`pdf.mjs:11088-11097`），且 4.10 不读取容器上的 `--total-scale-factor`（实测 `grep -c "total-scale-factor" pdf.mjs` = 0） | **正确**：容器（`.pdf-page`）上设 `--scale-factor`，由 `.textLayer` 继承，字号/高亮几何因此与 canvas 对齐 |
| 9 | 事件监听的注册/移除对称 | window keydown：`PdfViewer.vue:447-461`（按 `pageCount > 0` 开关）＋ `:852`；document selectionchange：`:846-848` / `:851`；document scroll（capture）：`PdfSelectionQuickAsk.vue:180-193`；ResizeObserver：`ReaderPanel.vue:158-172`（`observe` 在 `:166`）；rAF：`PdfViewer.vue:734-740` / `:853-856`；定时器：`PdfViewer.vue:786-795` / `:857-860`、`PdfSearchPanel.vue:357-360` / `:390-393`、`PdfSelectionQuickAsk.vue:109-113` / `:189-192` | **通过**：全部成对，无泄漏；`waitForTextLayer` 的 rAF 轮询以 token 自终止（`PdfSearchPanel.vue:196-200`），`revealRaf` 被后一次调用覆盖时最多多跑 1 帧 |
| 10 | `ReaderPanel` 的 `v-html` 渲染路径（注入面） | `ReaderPanel.vue:250-253`；`utils/markdown.ts:16`（原始 HTML 全量转义）、`:26-31`（`sanitizeHref` 白名单 http(s)/mailto/相对）、`:76-86`、非 Markdown 分支 `escapeText`（`ReaderPanel.vue:81-83`） | **通过**：无 `javascript:`/`data:` 注入面；`<pre>` 分支已转义 `& < >` |
| 11 | `readerStore.gotoPage` 单通道多写者（地图 / 搜索 / 笔记跳页） | `PdfViewer.vue:827-834`（消费即置 null）、`KnowledgeMap.vue:203`、`PdfSearchPanel.vue:184-186`、`ChatPanel.vue:638` | **通过**：同一 tick 内多次写只会跳最后一次，语义与 `reader-store.ts:9` 的约定一致；越界由 `setPage` 钳制（`reader-store.ts:109-111`） |

## 7. 本面最值得修的 3 条

| 序 | 编号 | 一句话 | 排序理由 |
| --- | --- | --- | --- |
| 1 | **S-PDF-01** | 缩放 <1 或窗口足够高时末页永远不是「当前页」，页码/章节/AI 上下文/现场落盘全错成 N−1，`End` 键视觉回跳 | 唯一 P0：错的是**状态事实源**（`readerStore.page`）而非局部视觉，错误会外溢到 agent 上下文、落盘现场与续读入口；触发条件对真实用户很常见（50% 缩放看版式，或高分辨率屏上最大化窗口），而现有 100% 缩放的既有断言结构上覆盖不到；修法是一处 2 行钳制，代价最小、风险最低 |
| 2 | **S-PDF-04** | 框选截图在目标页尚未绘制时被静默吞掉，模式照退、无附件无提示 | 用户主动动作完全无反馈，属「静默失败」里体验最差的一类；`captureRegion` 的 7 处早退都是同一根因，一处返回布尔值即可收敛；风险点只是「需先在需求档登记交互语义改动」，改动本身不碰任何冻结类名 |
| 3 | **S-PDF-03** | `renderedPages.add` 与 `renderTasks.set` 之间的 `await` 窗口让同一 canvas 被并发渲染，pdf.js 抛 `Cannot use the same canvas…` | 确定性竞态且修法只需在 `getPage` 返回后补一行所有权复核；被 pdf.js 源码级守卫（`pdf.mjs:13119`）证明存在，代价是多余渲染 + console 错误 + 簿记丢失。排在 S-PDF-02（纯性能，无真机读数）与 S-PDF-05（竞态窗口更窄）之前，因为它的失败路径已由既有 `console.error` 显式暴露、判据最好写 |

## 8. 未覆盖 / 未验证事项（供负责人判断）

| # | 事项 | 原因 |
| --- | --- | --- |
| 1 | 任何真机/离屏可观测性判据（S-PDF-01/02/03/04/05/06 的判据均为「设计的新场景」，本轮未执行） | 分片纪律禁止跑 `ui-shot.mjs`（避免与并行的取证进程争用端口 5199）；亦不许跑 `npm run dev` |
| 2 | S-PDF-01 的 `clientHeight` 绝对值、S-PDF-02 的耗时量级、D-PDF-01 的内存峰值 | 均为代码推导（已在各条标注「推导/量级」），无真机读数；需要一支离屏场景才能落成硬数字 |
| 3 | S-PDF-05 的实际复现率 | 窗口取决于 `transport.destroy()` 的 IPC 往返时长，只能用 stub 延迟放大后实测 |
| 4 | `pdf.js` 工作线程侧的页数据淘汰策略 | 本轮只核实了主线程 `WorkerTransport.#pageCache/#pagePromises` 无淘汰与 `startCleanup` 的存在（`pdf.mjs:12438/12439/12954`），未追踪 worker 内部缓存（与 S-PDF-07 的结论无冲突：主线程侧「从不调用 cleanup」已足以成立） |
