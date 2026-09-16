# PiX-Read R12 设计档 · 章节语义贯通（N77–N81）

> 上游：`docs/pm/R12-req.md`（需求 N77–N81，含 §0 定稿修订 8 条）、`docs/pm/R12-review.md`（需求评审 must-fix 1–8）、`docs/pm/PRD-V0.5.md` §1 / §2 / §4 / §5 / §7.2、`docs/pm/R9-*.md`（`buildChapterRanges` 唯一派生）、`docs/pm/R10-design.md`（章节结构范本：§1 契约冻结表 / §5 文件级清单 / §6 失败路径表 / §8 验证方案 / §9 分工）、`docs/pm/R11-design.md`（helper / 场景 / 取证范式）、`docs/pm/R11-dev.md`（R11 交付终态与基线读数）。
> 本档是「可直接开工、可判定」的定稿设计：把 N77 的命中与导航函数签名、N78 的 DOM 与类名门控、N79 的键位与守卫、N80 的逐字行格式与「不可解析时逐字节等于旧格式」的实现方式、N81 的烟测断言与离屏场景/相位/断言 label 写到实现层粒度。
> **本档不改任何代码**，只新增这一份文档；本轮允许的写操作仅 `docs/pm/R12-design.md`。
> **编号映射（供读 R10/R11 档的人对齐）**：本档按任务书编号 —— §1 契约冻结表 / §2 与既有冻结面的关系 / §3 失败路径表 / §4 文件级清单 / §5 验证方案 / §6 风险 Top3 / §7 开发分工 / §8 视觉验收；与 `R10-design.md` 的 §1 / §2 / §6 / §5 / §8 / — / §9 语义一一对应（R12 无「需求回退建议」，改由 §6 次级风险承担）。
> 判定工具（与需求档一致）：【走查】只读 `git status` / `git diff` / `git show` 与文件内容；【check】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error；【烟测-渲染】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:view`（本轮新建，4 组 29 条）；【烟测-主进程】`npm run smoke:notes`（26 条，数据面零改动的回归确认）；【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`（退出码 0 + `MANIFEST.json.failure === null` + 既有 120 张 / 169 条零缺失 + 新增 7 张 / 16 条齐备）。

---

## 0. 口径与证据面

### 0.1 本档事实基线（写档当天：只读核对 + 本步允许的实跑）

| 事实 | 证据（全部为本次真实读数） |
| --- | --- |
| 工作树状态 | `git status --short` ⇒ `?? docs/pm/R12-req.md` / `?? docs/pm/R12-review.md`（本档写完后同样以 `?? docs/pm/R12-design.md` 出现）；`git branch --show-current` ⇒ `main`；`git log --oneline -1` ⇒ `c16135d fix(reader): Esc 语义越界与摘录反馈可见性修复；取证自净与数据面烟测入口（V0.5 R11）` |
| 唯一工程门当前 0 error | 2026-09-16 实跑 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（输出仅 `> pix-read@0.1.0 check` + `vue-tsc … && tsc … && tsc …` 两行横幅） |
| 本机工具链 | `node --version` ⇒ `v24.19.0`；`pix/node_modules/typescript/package.json`.version ⇒ `5.8.3`；`pix/node_modules/typescript/lib/tsc.js` 存在（`smoke-notes.mjs:31` 的 `TSC_JS` 即指向它） |
| R12 的零缺失比对基线（本档已核对） | 目录 `C:/Users/86157/AppData/Local/Temp/pix-v05-r11-lead`：`shots/MANIFEST.json` ⇒ `shots.length = 120`、`failure = null`；`shots/MEASUREMENTS.json` ⇒ 数组、长度 **169**、`label` 去重后 **37** 种（含 R11 五组 `r11-esc-scope` / `r11-quick-ask-scroll-scope` / `r11-undo-after-empty` / `r11-note-actions-narrow` / `r11-undo-scope-stale`）；该目录 `shots/` 一级条目为零白名单外文件 |
| 唯一区间派生点（真实行号） | `pix/src/renderer/utils/outline-notes.ts`：`collectPreorder` `:37`（全量预序，键 `${parentKey}/${index}`，`title.trim() \|\| "未命名"`）、`buildChapterRanges` `:50`（只收 `page != null`；`end` = 预序中第一个页码严格更大的节点页码 − 1，无后继取 `pageCount`，`Math.min(end, pageCount)` 钳制；`label` = `end > start` 时 `` `${start}-${end}` `` 否则 `String(start)`）、`countNotesByChapter` `:84`；文件 `:11` 仅 `import type` `@shared/types`，`:12` 从 `./notes-path` 取 `docPathKey` / `matchesChapterFilter` / `rangeContains` 并 re-export |
| 地图侧语义（R9 冻结，本轮不得改） | `KnowledgeMap.vue:168` `isCurrent`（`row.range != null && row.range.start <= page && page <= row.range.end`）、`:174` `isRead`（`end < page`；签名行 `:173`）、`:48` `chapterRanges` computed（`buildChapterRanges(readerStore.outline, readerStore.pageCount)`）、`:105-116` `collectExpandable` 只把深度 0 的父节点放进初始展开集、`:118-150` `flattenVisible`（行 `title = node.title.trim() \|\| "未命名"`，与 `collectPreorder` 同口径）、`:80-83` 翻页自动滚动取 `currentRows[currentRows.length - 1]`、`:203` 节点点击写 `readerStore.gotoPage = row.page` |
| 注入链路（R8/R10 冻结） | `reading-context.ts:77` `buildReadingUserMessage`（`:78` `if (!ctx.filePath) return userText;`，`:` 80-96 行序 `<reading_context>` / `path:` / `page:` / `pageCount:` / 可选 `selectedText:` 块 / 可选 `reader_notes:` 块 / `</reading_context>`）；`ChatPanel.vue:356-361` 的 `readContext` 快照（`filePath` / `page` / `pageCount` / `selectedText` / `notes`）、`:377` 唯一调用点；`grep -rn "ReadingSendContext\|buildReadingUserMessage" pix/src` ⇒ 组件侧仅 `ChatPanel.vue:17 / :111 / :377` |
| 页码 pill 的真实类名与内容 | `PdfViewer.vue:922` 容器 `.pdf-page-indicator`（`v-if="readerStore.pageCount > 0"`）；`:943` `<button class="page-label" title="点击输入页码">第 {{ page }} / {{ pageCount }} 页</button>`；两侧 `v-btn icon="mdi-chevron-up" title="上一页"` / `mdi-chevron-down title="下一页"`；编辑态 `.page-input`（`PdfViewer.vue:931-941`，`@keydown.enter.prevent="commitPageDraft"` / `@keydown.esc.prevent="cancelPageEdit"`）；CSS `:1129-1143`（`position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 3; display: inline-flex; gap: 2px; padding: 2px 6px; border-radius: 999px; background: rgba(31,41,51,0.78); font-size: 12px`）、`:1145-1147` `.v-btn--disabled { opacity: 0.45 }` |
| 键盘面（本轮新增快捷键的落点，实读行号） | `PdfViewer.vue:341` `isEditableTarget`（`isContentEditable` / `INPUT` / `TEXTAREA` / `SELECT`，全文件唯一使用点 `:385`）；`:356` `onWindowKeydown`：`:357-372` 修饰键早退（含 `:360-370` 的 `Ctrl+F` 分支）、`:375` `Escape && captureMode`、`:380` `Escape && searchOpen`、`:385` 守卫 `pageCount <= 0 \|\| isEditableTarget(event.target)`、`:386-390` `/`、`:393` `switch (event.key)`、`:414` `}` 收口、`:415` 函数收尾；`:424` 唯一注册点 `window.addEventListener("keydown", onWindowKeydown)`（`setKeydownListener` 只由 `:427-431` 的 `watch(pageCount > 0)` 驱动） |
| 跳页唯一通道 | `reader-store.ts`：`gotoPage`（ref，写值后由 `PdfViewer.vue:800-807` 的 watcher 消费并清空 `:804`、`nextTick` 后 `scrollToPage`）、`openDocument` 内 `gotoPage.value = null`（换文档即作废）；`scrollToPage` `PdfViewer.vue:306`、`gotoPage(pageNumber)` `:315` |
| 章节派生早于页码之外的时序 | `PdfViewer.vue:650` `setPageCount(doc.numPages)` → `:651` `measurePages` → `:664` `scrollToPage`（此时页码 pill 已可读）→ `:669` `getOutline()` → `:671` `convertOutline`（逐节点解析，内含 async）→ `:673` `setOutline(nodes)`；`waitFor` 轮询间隔 120ms（`ui-shot.mjs:1370-1378`，`sleep(120)` 在 `:1376`）⇒ 页码可见严格早于章节可用 |
| 离屏夹具事实 | `ui-shot.mjs:212` `OLDER_PAGES`（2 页，`writeFixtures()` 内无书签写入 ⇒ `getOutline()` 空 ⇒ `readerStore.outline = []`）、`:260` `SAMPLE_OUTLINE`（3 页 / 8 节点：含无页码节点 `Appendix A` 与逆序书签 `Appendix B`(page 2)）、`:230` `SAMPLE_MAP_EXPECT`（`read.page1/2/3.current = 1 / 3 / 3`，第 3 页的 `.map-row.current` 3 行）、`:293` `LONG_BOOK_OUTLINE`（20 章 × 10 节 × 1 子节，章/节/子节同页）；`writeFixtures()` 落盘 `sample-paper.pdf` / `archive/older-paper.pdf` / `long-book.pdf`（`:368` / `:373` / `:375`） |
| 场景与 helper 面（真实行号） | `ui-shot.mjs:1363` `runReaderStateScenarios` 起、`:1364-1391`（`js:1364` / `sleep:1365` / `waitFor:1370`（`sleep(120)` 在 `:1376`）/ `record:1381` / `textOf:1386` / `has:1390` / `countOf:1391`）、`:1442` `waitPdfLoaded`、`:1443` `waitPage`、`:1483` `openRow`、`:1492` `clickNext`、`:1493` `clickPrev`、`:2060` `NOTES_FILE`、`:2062` `notesHash`、`:2227` `typeAndSend`、`:2250` `rectOfSelector`、`:2939-2952` `sendCalls` / `clearSendCalls` / `lastSend` / `waitSendCalls`、`:3078` `enterCleanWorkspace`、`:3091` `openNotesPanel`、`:3097` `restoreStandardSeed`、`:3947` `openMap`、`:4155-4165` 50c 的空态+进度等待范式、`:4825` `ensureMapOpen`（已开时不得再点）、`:5220` `pressBodyEsc`；函数收口 `:6728`，最后一条语句 `:6727` `await restoreStandardSeed();` |
| 既有载荷断言的形状（决定 N80 的破坏面） | 42d（`:3642`）断言「无文档时载荷逐字等于输入」（`!filePath` 早退，与 `<reading_context>` 无关）；43（`:3673` 数据 `missing` 列表、`:3698` 骨架断言）与 42c r7（`:3559-3588`，按 `path: ` 前缀 `find` 行）均为**包含式**，全文件**无**行数 / 全串相等判据（`grep -n "message ==="` 在载荷判据处仅命中 `:3642`；另 `:538` 为 stub 内部的无关命中 `typeof command.message === "string"`）；35 的 `confirmed35B`（`:2829`）是模拟确认文本的夹具串，锚点在发送时刻登记（`ChatPanel.vue:356-364`），不由该串解析 |
| 提示词位置 | `pix/src/main/reading-prompt.ts`：数组元素 8 个（行 2–7、9、10），行 8 是注释，行 11 `].join("\n");`；数组元素缩进为**制表符**（`sed -n '1,11p' … \| cat -A` 逐行 `^I`），锚点行 `:5` 逐字 `\t"Use pdf_outline for bookmarks and page numbers.",`；全仓库无脚本断言该文本（唯一引用点 `session-bridge.ts:1245`） |
| 既有场景未覆盖的空白 | `.reader-section` 全仓库 0 命中（`grep -rn "reader-section" pix/src` 无输出）；`pix/package.json` 的 `scripts` 有 `smoke:notes`、无 `smoke:view`（`grep -c "smoke:view" pix/package.json` ⇒ `0`） |

### 0.2 R12-req 定稿修订（8 条）与需求评审 must-fix（8 条）在本档的实现级落点

| 编号 | 需求档处置（逐条对应） | 本档实现级落点 |
| --- | --- | --- |
| 修订 1 / 评审 must-fix 1（就绪同步点） | 四个场景前置必须区分「有书签文档 / 无书签文档」两条就绪路径 | §1.6.1 冻结 `waitSectionReady()`（有书签唯一就绪点）与 `settleEmptyOutline()`（无书签，含限额声明）；§1.6.2–1.6.5 逐场景写进前置与相位；43 号既有场景在 `waitPage(2, 3)` 后就地内联就绪等待（§2.2 第 4 行；不得调用后置 helper，TDZ 见 §1.6.1） |
| 修订 2 / must-fix 2（判据补全） | `pillProbe()` 扩到四选择器；`r12-1` ⑤ 增「在上方」；「只占内容宽度 / 不拦截选区」改为可判形式 | §1.2.3 冻结容器 `pointer-events: none` + 两按钮 `auto` + `max-width: calc(100% - 24px)`；§1.6.1 `pillProbe()` / `sectionProbe()` 字段逐字；§1.6.2 ⑤ 三条子判据 |
| 修订 3 / must-fix 3（守卫口径） | 守卫沿用 `:385` 两条；`captureMode` 由新分支自检；按钮 `disabled` 由目标 `null` 派生；差异登记 | §1.3.2 逐字代码块（守卫顺序、两条沿用 + 两条新增）；§2.1 登记「既有七键位在框选模式仍生效，`[` / `]` 不生效」为本轮新行为 |
| 修订 4（理由修正） | 并列取预序最早 = **分支优先**，非层级优先；维持冻结口径 | §1.1.2 / §1.1.4 逐字写成分支优先，并以 `sample-paper.pdf` 第 2/3 页并列集佐证 |
| 修订 5 / must-fix 5（前置冻结） | `r12-4` 前置明文「选区为空、选择集为空」+ 两个相位 `data` 带现场 | §1.6.5 前置 + 相位 `data` 字段（`selectedTextInPayload` / `notesInPayload`） |
| 修订 6 / must-fix 6（主进程口径） | 全文改为「主进程**数据面**零改动；`reading-prompt.ts` 为唯一主进程改动」 | §0.1 / §2.3 / §4 / §5 逐处使用该口径 |
| 修订 7（计数 / 位置口径） | 提示词数组元素 8 → 9；`section:` 恒为载荷第 5 行；键盘面按实读行号 | §1.4.3（第 5 行）、§1.4.5（8 → 9）、§0.1 行号表、§1.3.2 落点 |
| 修订 8 / must-fix 8（签名闭合） | 三个导出签名冻结；禁用写法改语义判据 | §1.1.1 / §1.1.6（正向 + 反向判据） |
| must-fix 4 / 7（评审的其余两条） | 理由表述与位置计数 | 已并入上表，无独立落点 |
| must-fix 2（补强项：`.pdf-toolbar` / `.pdf-capture-fab` 整轮无几何判据） | 本轮给四选择器判据 | §1.6.3 相位 `zero-displacement` ⑤ |

设计评审（R12，针对本档）的 must-fix 1–6 已逐条处置，处置表见文末「## 定稿修订（R12）」；本档正文已按该表逐处修订，**判据集合不因修订减少**。

### 0.3 本档新增的显式冻结（只补实现层命名与常量，不改任何判据）

| 项 | 冻结值 | 理由 |
| --- | --- | --- |
| 新容器 `bottom` | `46px`（逐字写进 scoped 样式） | 由真实 CSS 推得的 pill 盒高：`.pdf-page-indicator` 子项 20px（`v-btn--size-x-small` × `density-comfortable` ⇒ `VBtn.css:27-33` 的 `--v-btn-height: 20px` 加 `.v-btn--icon.v-btn--density-comfortable` 的 `+0px`）与 `.page-label`（12px × `--pix-leading-base: 1.6` = 19.2px + `padding 2px` ×2 = 23.2px）取大 ⇒ pill 高 ≈ 23.2 + 4 ≈ 27.2px，`bottom: 12px` ⇒ pill 顶 ≈ 视口高 − 39.2px；`46px` 留 ≈ 6.8px 间隙且容差到 pill 高 ≤ 35px 仍满足判据 `section.bottom ≤ pill.top + 1`。**实测读数必须由开发档登记**（本档不跑离屏，故只冻结取值与判据） |
| 新容器 `z-index` | `3`（与 `.pdf-page-indicator` / `.pdf-toolbar` 同层，**低于** `.capture-layer` 的 `:1051` `z-index: 5`） | 框选模式下拖拽层必须继续压在控件之上（既有 pill 同待遇）；不得用更高 z-index 抢指针 |
| 新容器宽度上界 | `max-width: calc(100% - 24px)` + chip `max-width: 360px` + `overflow: hidden; white-space: nowrap; text-overflow: ellipsis` | 「宽度严格小于 `.pdf-viewer` 宽度」的结构性保证来自 `left: 50%` + `right: auto` + `translateX(-50%)`（绝对定位的可用宽 = 50%·viewer，与标题长度无关）；`max-width` 只是补充上界，chip 的 `max-width: 360px` 防长标题撑满 |
| 指针事件 | 容器 `pointer-events: none`；`.reader-section-prev` / `.reader-section-next` 显式 `pointer-events: auto`；chip 继承 `none` | 不引入拦截选区的透明层；两按钮可真实点击 |
| 离屏新 helper 名（语义冻结、命名自由，本档统一给出） | `clickEl(selector)` / `pressReaderKey(key)` / `pressKeyOn(selector, key)` / `sectionProbe()` / `pillProbe()` / `waitSectionReady()` / `closeMap()` / `settleEmptyOutline()` / `mapCurrentLabels()`（**恰 9 个**） | §1.6.1；全部为 `runReaderStateScenarios` 闭包内的一次 `js` 往返或 `waitFor` 包装 |
| 离屏点击原语（写法逐字） | ``const clickEl = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click(), true`);`` | 既有 `click` 只定义在 `runScenario`（`ui-shot.mjs:1062`），`runReaderStateScenarios`（`:1363`）作用域内不存在 ⇒ 新场景必须走本原语；写法与 `:1062` 逐字同款（`JSON.stringify` 插值，禁止把 Node 侧 `SEL` 名写进页面字符串） |
| 缩略号选择器（不进 `SEL`） | 缩小按钮用内联字面 `'.pdf-toolbar button[title="缩小"]'`；`.page-label` / `.pdf-toolbar` / `.pdf-capture-fab` 在 `pillProbe()` 内用内联字面 | `SEL` 的新增项被需求档 §0.5 冻结为**恰 8 项**，不得多增 |
| 章节跳转的唯一写入点 | 组件内新增一个私有函数 `jumpToChapter(target: ChapterRange \| null): void`，其函数体**只有** `if (!target) return;` + `readerStore.gotoPage = target.start;` | 满足需求档 N79 走查「`grep -c "readerStore.gotoPage = "` 的新增命中恰 1 处」：按钮与快捷键共用这一个写入点 |

### 0.4 本轮不得改动的既有冻结面

见 §2.1（与需求档 §0.1 同口径，本档只补判据命令）。

---

## 1. 契约冻结表

### 1.1 N77 —— 唯一派生：签名、命中规则、返回结构

#### 1.1.1 三个新导出（逐字签名）

| 项 | 冻结值 |
| --- | --- |
| 落点 | `pix/src/renderer/utils/outline-notes.ts`（唯一派生点；组件层不得出现任何区间比较） |
| 签名 1（逐字） | `export function resolveCurrentChapter(ranges: Map<string, ChapterRange>, page: number, pageCount: number): ChapterRange \| null` |
| 签名 2（逐字） | `export function resolveChapterNav(ranges: Map<string, ChapterRange>, page: number, pageCount: number): { prev: ChapterRange \| null; next: ChapterRange \| null }` |
| 签名 3（逐字） | `export function formatChapterHeading(range: ChapterRange): string` |
| 返回结构 | 签名 1 返回 `ranges` 中的**同一对象**（`key` / `title` / `start` / `end` / `label` 五字段原样，不二次改写）；签名 2 返回一个**新对象字面量**（只含 `prev` / `next` 两个字段，值为 `ranges` 中的同一对象或 `null`）；签名 3 返回 `` `${空白折叠 + trim 后的 range.title} · 第 ${range.label} 页` `` |
| 顺序来源 | `ranges.values()` 的**插入序**（= `buildChapterRanges` 的预序遍历序）；允许按 `Map` 插入序遍历 `ranges`（顺序来源本身也是冻结面）；**不得**另建排序 / 过滤表、不得改写 `buildChapterRanges` |
| 无关函数 | `buildChapterRanges` / `countNotesByChapter` / `collectPreorder` 与既有导出（`matchesChapterFilter` / `rangeContains` / 类型）**零 diff** |
| 新增 import | 无（只新增导出，不新增依赖、不写 `any`） |

#### 1.1.2 命中规则（逐字冻结）与 ties 规则

> 候选 = `buildChapterRanges(outline, pageCount)` 的**值序列**（`Map` 插入序 = 有页码节点的预序；这是唯一顺序来源，不得另建排序表）。
> **命中项 = 候选中满足 `start ≤ page` 且 `start` 最大的项；若有多项 `start` 相同，取该序列中最早出现者。**
> 返回该 `ChapterRange` 原样（`key` / `title` / `start` / `end` / `label` 五字段不二次改写）；无命中 ⇒ `null`。

**ties 规则的准确表述（定稿口径，替代本轮草案的「取更晚者」）**：并列时取**预序最早** = 书签文档顺序最靠前的那一条 —— 同一分支内祖先恒早于后代出现，因此它是**分支优先**而非**层级优先**（跨分支时不保证层级最浅；`sample-paper.pdf` 第 3 页即取到 child 行的 `2.2 Positional prior`，而 chapter 行的 `3. Ablation Study` 同样在 in-range 集合内）。不得实现为「同 `start` 取预序更晚者」，也不得实现为「深度最小」。

#### 1.1.3 参考实现（语义冻结；等价写法允许，逐条判据不变）

```ts
/** 行内归一化：`\s+` → 单空格 + trim（与 reading-context.inlineNoteText 同口径）。 */
function inlineTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** chip 文本 / chip 的 title / <reading_context> 的 section 行三处共用同一份渲染。 */
export function formatChapterHeading(range: ChapterRange): string {
  return `${inlineTitle(range.title)} · 第 ${range.label} 页`;
}

export function resolveCurrentChapter(
  ranges: Map<string, ChapterRange>,
  page: number,
  pageCount: number,
): ChapterRange | null {
  if (pageCount <= 0 || ranges.size === 0) return null;
  if (!Number.isInteger(page) || page < 1 || page > pageCount) return null;
  let hit: ChapterRange | null = null;
  for (const range of ranges.values()) {
    if (range.start > page) continue;
    // 严格大于才替换 ⇒ 同 start 并列时保留先出现者（预序最早）
    if (hit === null || range.start > hit.start) hit = range;
  }
  return hit;
}

export function resolveChapterNav(
  ranges: Map<string, ChapterRange>,
  page: number,
  pageCount: number,
): { prev: ChapterRange | null; next: ChapterRange | null } {
  if (pageCount <= 0 || ranges.size === 0) return { prev: null, next: null };
  if (!Number.isInteger(page) || page < 1 || page > pageCount) return { prev: null, next: null };
  let prev: ChapterRange | null = null;
  let next: ChapterRange | null = null;
  for (const range of ranges.values()) {
    if (range.end < page) {
      // 大于等于才替换 ⇒ 上一节的 end 并列时取预序最晚者
      if (prev === null || range.end >= prev.end) prev = range;
    }
    if (range.start > page) {
      // 严格小于才替换 ⇒ 下一节的 start 并列时取预序最早者
      if (next === null || range.start < next.start) next = range;
    }
  }
  return { prev, next };
}
```

**三处比较符的方向即判据（逐字）**：`hit` 用 `>`（同 `start` 取最早）、`prev` 用 `>=`（同 `end` 取最晚）、`next` 用 `<`（同 `start` 取最早）。改任何一个方向都会让 §1.5.3 的手写期望变红。

#### 1.1.4 夹具判定表（`sample-paper.pdf`，`pageCount = 3`）

`SAMPLE_OUTLINE` 复算出的 `ranges`（7 项，插入序 = 预序）：

| 序 | key | title | start | end | label |
| --- | --- | --- | --- | --- | --- |
| 1 | `root/0` | `1. Abstract` | 1 | 1 | `1` |
| 2 | `root/1` | `2. Method Overview` | 2 | 2 | `2` |
| 3 | `root/1/0` | `2.1 Sparse mask budget` | 2 | 2 | `2` |
| 4 | `root/1/1` | `2.2 Positional prior` | 3 | 3 | `3` |
| 5 | `root/2` | `3. Ablation Study` | 3 | 3 | `3` |
| 6 | `root/2/0/0` | `Appendix A.1` | 3 | 3 | `3` |
| 7 | `root/2/1` | `Appendix B` | 2 | 3 | `2-3` |

（`root/2/0` = `Appendix A` 的 `page === null` ⇒ 不进 `ranges`；`ranges.size = 7` = 有页码节点数。）

逐页命中 / 导航（`start ≤ page` 且 `start` 最大、同 `start` 取最早；`prev` = `end < page` 且 `end` 最大、同 `end` 取最晚；`next` = `start > page` 且 `start` 最小、同 `start` 取最早）：

| 当前页 | 命中（chip / section 行） | 上一节目标 | 下一节目标 |
| --- | --- | --- | --- |
| 1 | `1. Abstract · 第 1 页` | `null`（按钮禁用） | `2. Method Overview`（第 2 页） |
| 2 | `2. Method Overview · 第 2 页` | `1. Abstract`（第 1 页） | `2.2 Positional prior`（第 3 页） |
| 3 | `2.2 Positional prior · 第 3 页` | `2.1 Sparse mask budget`（第 2 页；`end` 并列取预序最晚者 ⇒ 不是 `2. Method Overview`） | `null`（按钮禁用） |
| 无 outline（`archive/older-paper.pdf`） | 不渲染、不注入 | `null` | `null` |
| 单节且在节内 | 命中该节 | `null` | `null` |
| 单节且早于该节（节 `start = 3`、当前页 1） | `null` | `null` | 该节（`start = 3`） |
| `long-book.pdf` 第 1 页（同页 30 个节点） | `Chapter 01`（并列取预序最早） | `null` | `Chapter 02` |

#### 1.1.5 三条冻结性质与不可解析六情形

**三条性质（走查 + 烟测双判）**：① **同源** —— 命中项恒为 `ranges` 中的同一对象（`ranges.get(hit.key) === hit`）；② **恒在范围内** —— 命中项恒满足 `start ≤ page ≤ end`（与地图 `isCurrent` 同一集合；对 `pageCount > 0` 且 `1 ≤ page ≤ pageCount` 的整个定义域成立）；③ **不依赖地图可见性** —— 地图展开态不影响命中结果。

**不可解析（六种情形一律 `null` / `{ prev: null, next: null }`，不抛错、不写任何状态、不四舍五入、不钳制）**：

| # | 情形 | 判据表达式 |
| --- | --- | --- |
| 1 | `pageCount ≤ 0` | 总页数未知（加载窗口 / 文本预览） |
| 2 | `ranges.size === 0` | 无 outline，或 outline 内没有任何有页码节点（全部 `page === null`） |
| 3 | `page` 非整数（含 `NaN`） | `!Number.isInteger(page)` |
| 4 | `page < 1` | 域外 |
| 5 | `page > pageCount` | 页越界（UI 侧 `setPage` 已钳制，此处为纯函数守卫） |
| 6 | 所有候选的 `start > page` | 当前页早于第一节 ⇒ 循环结束 `hit === null`（返回 `null`） |

#### 1.1.6 走查判据（正向 + 反向，命令级）

| # | 命令 | 期望 |
| --- | --- | --- |
| 1 | `git diff -- pix/src/renderer/utils/outline-notes.ts` | 只有**新增块**（1 个 `inlineTitle` + 3 个导出 + 必要的注释）；`buildChapterRanges` / `countNotesByChapter` / `collectPreorder` 与既有导出零 diff；无新 import、无 `any` |
| 2 | `grep -rnE "buildChapterRanges\(|resolveCurrentChapter\(|resolveChapterNav\(" pix/src/renderer/components/` | 命中集合含 `PdfViewer.vue`（正向：`PdfViewer.vue` 必须消费 `outline-notes.ts` 的导出） |
| 3 | `grep -rnE "\.(start\|end)[[:space:]]*(<=\|>=\|<\|>)\|(<=\|>=\|<\|>)[[:space:]]*[a-zA-Z_.]*\.(start\|end)" pix/src/renderer/components/` | 命中集合 ⊆ 既有的 `KnowledgeMap.vue:167`（注释）/ `:169`（`isCurrent`）/ `:174`（`isRead`，实读 `:173` 起函数）与 `PdfSearchPanel.vue:268`（搜索分段区间，非章节）；**任何其它新增命中即判红** |
| 4 | `grep -c "^export function" pix/src/renderer/utils/outline-notes.ts` | 改前 **2**（`:50` `buildChapterRanges`、`:84` `countNotesByChapter`）⇒ 改后 **5**（新增恰 3 个：`formatChapterHeading` / `resolveCurrentChapter` / `resolveChapterNav`）；`grep -n "^export" …` 的既有行（`:14` / `:16` / `:24` / `:50` / `:84`）内容逐字不变 |

### 1.2 N78 —— 阅读器可见：DOM、类名、门控、文本模板、几何

#### 1.2.1 模板（逐字，插在 `.pdf-viewer` 根节点内、`.pdf-page-indicator` **之前**）

```html
    <div
      v-if="currentChapter || chapterNav.prev || chapterNav.next"
      class="reader-section"
    >
      <v-btn
        class="reader-section-prev"
        icon="mdi-chevron-double-left"
        size="x-small"
        variant="text"
        title="上一节（快捷键 [）"
        :disabled="chapterNav.prev === null"
        @click="jumpToChapter(chapterNav.prev)"
      />
      <span v-if="currentChapter" class="reader-section-chip" :title="currentChapter.text">{{ currentChapter.text }}</span>
      <v-btn
        class="reader-section-next"
        icon="mdi-chevron-double-right"
        size="x-small"
        variant="text"
        title="下一节（快捷键 ]）"
        :disabled="chapterNav.next === null"
        @click="jumpToChapter(chapterNav.next)"
      />
    </div>
```

**逐条冻结**：

| 项 | 值 |
| --- | --- |
| 宿主与位置 | `PdfViewer.vue` 模板内、`class="pdf-viewer"` 根节点内、`.pdf-page-indicator`（`:922`）**之前**的兄弟节点；绝对定位 ⇒ **不进入 flex 布局流** |
| 容器类名 | `.reader-section`（`grep -rn "reader-section" pix/src` 改前 0 命中，无冲突） |
| 元素顺序 | `.reader-section-prev` → `.reader-section-chip`（`v-if`） → `.reader-section-next` |
| 容器 `v-if` | 当且仅当「命中 ≠ `null` **或** 上一节 ≠ `null` **或** 下一节 ≠ `null`」；三者皆 `null` ⇒ 不进 DOM、不留空位（不是 `display:none`、不是空容器） |
| chip `v-if` | 当且仅当命中 ≠ `null`；chip 是 `<span>`、**无子元素** |
| chip 文本与 `title` | 同一份 `currentChapter.text`（= `formatChapterHeading(命中项)`）逐字写入 `textContent` 与 `title` 属性 ⇒ 二者恒相等（视觉省略只影响像素） |
| 按钮 | `v-btn`，class 落到根 `button`；`title` 逐字 `上一节（快捷键 [）` / `下一节（快捷键 ]）`；图标逐字 `mdi-chevron-double-left` / `mdi-chevron-double-right`（与页码翻页的单箭头区分） |
| `disabled` | `:disabled="<方向目标> === null"`（禁用 ⇔ 目标为 `null`，一一对应，无第三种状态） |
| 点击副作用 | 恰为 `readerStore.gotoPage = <目标>.start`（经 `jumpToChapter`，§1.3.3）；**不**调用 `scrollToPage`、不改 `page` / `pageCount` / `outline` / 缩放 / 现场文件 |
| 不动的既有面 | `.pdf-page-indicator` 内部模板（`:922-950`）**零 diff**：不追加元素、不改 `title`、不改文本模板、不改 `v-if` |

#### 1.2.2 三个新 computed（逐字；不得用 `ref` 缓存、不得在 `watch` 里增量修补）

```ts
const chapterRanges = computed(() => buildChapterRanges(readerStore.outline, readerStore.pageCount));
const currentChapter = computed(() => {
  const hit = resolveCurrentChapter(chapterRanges.value, readerStore.page, readerStore.pageCount);
  return hit ? { range: hit, text: formatChapterHeading(hit) } : null;
});
const chapterNav = computed(() => resolveChapterNav(chapterRanges.value, readerStore.page, readerStore.pageCount));
```

- 依赖恰为 `readerStore.outline` / `page` / `pageCount` ⇒ 翻页、切文档、面板开关、缩放（不改页码）都自动带上新值；缩放不改页码 ⇒ chip 文本不变。
- `currentChapter` 的形状冻结为 `{ range, text } | null`：`range` 保留命中项本身（可观测、供后续版本复用），`text` = `formatChapterHeading(range)`；模板只消费 `text`。`title` 永不为空串（`collectPreorder` 已 `trim() || "未命名"`）⇒ `currentChapter !== null` 与「命中存在」等价。
- `readerStore.ts` **零 diff**（不得为 chip 新增字段）。
- 新增 import（**两行**，置于既有 utils import 区；与 `KnowledgeMap.vue:15-16` 的 value import + `import type` 两行范式一致）：`import { buildChapterRanges, formatChapterHeading, resolveChapterNav, resolveCurrentChapter } from "../../utils/outline-notes";` + 独立一行 `import type { ChapterRange } from "../../utils/outline-notes";`

#### 1.2.3 样式（逐字新增到 `<style scoped>`；放在 `.pdf-page-indicator` 规则之前）

```css
.reader-section {
  position: absolute;
  left: 50%;
  bottom: 46px;
  transform: translateX(-50%);
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: calc(100% - 24px);
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(31, 41, 51, 0.78);
  color: #fff;
  font-size: 12px;
  pointer-events: none;
}

.reader-section :deep(.v-btn--disabled) {
  opacity: 0.45;
}

.reader-section-chip {
  min-width: 0;
  max-width: 360px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.reader-section-prev,
.reader-section-next {
  pointer-events: auto;
}
```

| 冻结属性 | 值 | 判据（§1.6 现场字段） |
| --- | --- | --- |
| `position` / `bottom` / `left` / `transform` | `absolute` / `46px` / `50%` / `translateX(-50%)` | `containerRect.bottom ≤ indicator.rect.y + 1`（在上方）且水平居中（目视 §8） |
| `z-index` | `3`（< `.capture-layer` 的 `5`） | 框选模式下拖拽层仍压在控件之上（既有 pill 同待遇） |
| `display` | `inline-flex`（宽度按内容收缩，非 `block`） | `containerRect.width < viewerWidth` |
| `max-width` | `calc(100% - 24px)` | 补充上界（真正的结构保证在上行：`left: 50%` + `right: auto` ⇒ 可用宽 = 50%·viewer）；判据仍为 `containerRect.width < viewerWidth` |
| `pointer-events` | 容器 `none`；两按钮 `auto`；chip 继承 `none` | `containerPointerEvents === "none"`、`prevPointerEvents === "auto"`、`nextPointerEvents === "auto"` |
| 视觉语系 | `border-radius: 999px` / `background: rgba(31, 41, 51, 0.78)` / `color: #fff` / `font-size: 12px` / `gap: 2px` / `padding: 2px 6px`（与 `.pdf-page-indicator:1129-1143` 逐字同值） | 目视 §8；不新增全局 CSS 变量 / 主题色 / 动画 |
| 禁用态 | `.reader-section :deep(.v-btn--disabled) { opacity: 0.45 }`（与 `:1145-1147` 同值） | 目视 §8 |

**已登记的后果（不阻塞）**：chip 继承 `pointer-events: none`（§0.5 冻结）时，悬停不会命中 chip 元素，原生 `title` tooltip 无法弹出。冻结判据只要求 `textContent === title`（§1.6.1 的 `sectionProbe()` 字段），**不得**因此把 chip 改成 `auto`（那会破坏「不引入拦截选区的透明层」）。若负责人要 hover tooltip，需回改需求档 §0.5 并同步 `r12-1` ⑤ 的指针事件判据。

#### 1.2.4 文本模板与三页期望（逐字）

`formatChapterHeading(range)` = `${空白折叠 + trim 后的 range.title} · 第 ${range.label} 页`；chip 文本 / chip 的 `title` / `<reading_context>` 的 `section:` 行**逐字节相同**（三处共用同一份渲染）。

| 页（`sample-paper.pdf`） | chip 文本 = `title` 属性（逐字） | prev | next |
| --- | --- | --- | --- |
| 1 | `1. Abstract · 第 1 页` | `disabled` | 可点 |
| 2 | `2. Method Overview · 第 2 页` | 可点 | 可点 |
| 3 | `2.2 Positional prior · 第 3 页` | 可点 | `disabled` |

#### 1.2.5 走查判据

| # | 命令 / 位置 | 期望 |
| --- | --- | --- |
| 1 | `git diff -- pix/src/renderer/components/workspace/PdfViewer.vue` | 只含：import **两行**（value 一行 + `import type { ChapterRange }` 一行）、3 个新 computed、`jumpToChapter`、`.reader-section` 模板块、N79 快捷键分支块、样式块 |
| 2 | `git diff -- pix/src/renderer/components/workspace/PdfViewer.vue \| grep -E "^[-]" \| grep -v "^---"` | 只允许出现「`.pdf-page-indicator` 模板前置插入点相邻行」与「样式插入点相邻行」的行位移；**不得**出现 `.pdf-page-indicator` 内部任何行的删除或改写 |
| 3 | `git diff -- pix/src/renderer/stores/reader-store.ts pix/src/renderer/components/workspace/{ReaderPanel,KnowledgeMap}.vue` | 全部为空 |
| 4 | `grep -c "\.reader-section\b" pix/src/renderer/components/workspace/PdfViewer.vue` | 命中为新块与样式（人工确认无重复定义） |
| 5 | `grep -n "readerStore.gotoPage = " pix/src/renderer/components/workspace/PdfViewer.vue` | 新增命中**恰 1 处**（在 `jumpToChapter` 内） |

### 1.3 N79 —— 章节导航：按钮与快捷键

#### 1.3.1 按钮

| 项 | 冻结 |
| --- | --- |
| 目标来源 | `chapterNav`（= `resolveChapterNav(chapterRanges, page, pageCount)`），与 chip 同一次派生 |
| 跳转 | `jumpToChapter(chapterNav.prev / .next)` ⇒ 写 `readerStore.gotoPage = <目标>.start`（复用既有唯一跳页通道，由 `PdfViewer.vue:800-807` 的 watcher 消费） |
| `disabled` | 目标 `null` ⇔ 禁用（一一对应）；禁用态点击不得有任何副作用（`jumpToChapter` 首行 `if (!target) return;`） |
| 与快捷键同源 | 同一页上按钮与 `[` / `]` 计算出的目标 `start` 必须相等（`r12-3` 与烟测 `section-nav` 双覆盖） |

#### 1.3.2 快捷键分支（逐字；插入位置冻结）

**落点**：`onWindowKeydown` 内，`:385` 守卫（`if (readerStore.pageCount <= 0 || isEditableTarget(event.target)) return;`）**之后**、`:393` 的 `switch (event.key)` **之前**。

```ts
  if (event.key === "[" || event.key === "]") {
    // 框选模式：本轮为 [ / ] 新增的屏蔽（既有七键位在框选模式下仍生效，见设计档 §2.1）
    if (readerStore.captureMode) return;
    const target = event.key === "[" ? chapterNav.value.prev : chapterNav.value.next;
    // 目标为 null 时不 preventDefault、零副作用（与按钮 disabled 一一对应）
    if (!target) return;
    event.preventDefault();
    jumpToChapter(target);
    return;
  }
```

| # | 规则（逐字） |
| --- | --- |
| 1 | 键位 `[` = 上一节、`]` = 下一节（**无修饰键**；`event.key` 逐字比较）。不得引入带修饰键的组合，不得改既有 `Ctrl/Alt/Meta` 早退分支（`:357-372`） |
| 2 | **不得**新增第二处 `addEventListener("keydown"`（`:424` 仍是唯一注册点）；不得删除 / 改写既有七个键位分支（`/` `:386-390`、`PageUp`/`ArrowLeft`、`PageDown`/`ArrowRight`、`Home`、`End` `:393-414`） |
| 3 | 不生效条件分两类：**沿用 `:385` 既有守卫两条**（`readerStore.pageCount <= 0`；`isEditableTarget(event.target)` 为真）；**本轮新增两条**（`readerStore.captureMode === true` 由新分支自检；目标为 `null` ⇔ 按钮 `disabled`，由 `resolveChapterNav` 的返回值派生）。除这四条外**不得**添加其它条件（例如 `searchOpen`） |
| 4 | 生效时的副作用**恰为** `event.preventDefault()` + `readerStore.gotoPage = <目标>.start`（不写 `page` / `pageCount` / `outline` / 缩放 / 现场文件） |
| 5 | 目标为 `null` 时不 `preventDefault`、零副作用（不发 IPC、不写状态、不改页码） |
| 6 | 与按钮同源：同一页上二者目标 `start` 相等 |

**规则 3 的行为差异（必读）**：既有七键位在框选模式（`readerStore.captureMode === true`）下**仍然生效**（`PdfViewer.vue:375` 的 `captureMode` 分支只拦 `Escape`）；`[` / `]` 在框选模式下**不生效**，这是**本轮新增**的规则，不是既有语义的复用。

#### 1.3.3 唯一写入点（`jumpToChapter`）

```ts
function jumpToChapter(target: ChapterRange | null): void {
  if (!target) return;
  readerStore.gotoPage = target.start;
}
```

- 点击与快捷键共用这一个写入点 ⇒ `grep -c "readerStore.gotoPage = "` 的新增命中恰 1 处。
- 目标在**同一同步帧**由 `chapterNav.value` 取当前值 ⇒ 不存在跨 tick 的目标缓存；跳转只写数字 `start` ⇒ 不存在「陈旧对象被消费」的路径。
- `ChapterRange` 类型需新增**独立一行** `import type { ChapterRange } from "../../utils/outline-notes";`（既有范式 = `KnowledgeMap.vue:15-16` 的 value import 与 `import type` 两行并列；**不得**把类型混进 value import 列表）。

#### 1.3.4 目标算法与边界（逐字）

> 候选同 §1.1.2。
> **下一节 = 候选中满足 `start > page` 的项里 `start` 最小者（`start` 相同取预序最早者）**；
> **上一节 = 候选中满足 `end < page` 的项里 `end` 最大者（`end` 相同取预序最晚者）**；
> 无满足项 ⇒ 对应方向为 `null`。域外（与 §1.1.5 同一守卫，含 `ranges.size === 0`）⇒ 两者皆 `null`。

**四条冻结性质**：① `prev !== null ⇒ prev.end < page`（且 `prev.start < page`）；② `next !== null ⇒ next.start > page`；③ 两个方向**各自独立派生**，都不依赖命中项；④ 只读 `ranges` 的 `start` / `end`，不写任何状态、不抛错。

**「当前页不在任何章节内」必须给出确定目标**：早于第一节 ⇒ 上一节禁用、下一节 = 第一节；无书签 / 单节内 ⇒ 两者皆禁用。

#### 1.3.5 走查判据

| # | 命令 | 期望 |
| --- | --- | --- |
| 1 | `grep -c 'addEventListener("keydown"' pix/src/renderer/components/workspace/PdfViewer.vue` | `1`（`:424` 唯一注册点） |
| 2 | `grep -n "event.key === \"\[\" \|\| event.key === \"\]\"" …` | 恰 1 处，且行号 ∈ (`:385` 守卫行, `:393` `switch` 行) |
| 3 | `grep -c "function isEditableTarget" …` | `1`（无第二份） |
| 4 | `grep -n 'readerStore.gotoPage = ' …` | 新增恰 1 处（`jumpToChapter` 内） |
| 5 | `git diff -- pix/src/renderer/stores/reader-store.ts` | 空 |
| 6 | `grep -n "case \"PageUp\"\|case \"PageDown\"\|case \"Home\"\|case \"End\"\|event.key === \"/\"" …` | 与改前逐字相同（行号可后移，内容零 diff） |

### 1.4 N80 —— 上下文注入

#### 1.4.1 `ReadingSendContext`（第 6 个必填字段）

```ts
export interface ReadingSendContext {
  filePath: string | null;
  page: number;
  pageCount: number;
  selectedText: string;
  /** 必填：选择集快照（发送瞬间的派生结果）；不给默认值，避免第二套向后兼容分支。 */
  notes: ReaderNote[];
  /** 必填：书签树快照（发送瞬间的派生结果）；不给默认值（漏传即编译期报错）。 */
  outline: ReaderOutlineNode[];
}
```

- 既有 5 个字段的名字、类型与必填性**逐字不变**；`outline` **不给默认值** ⇒ 漏传即 `npm run check` 报错（全仓库唯一调用点是 `ChatPanel.vue:377`）。
- 新增 import：`ReaderOutlineNode` 加入既有的 `import type { … } from "@shared/types";`；`buildChapterRanges` / `formatChapterHeading` / `resolveCurrentChapter` 从 `./outline-notes` 顶层 import（无循环依赖：`outline-notes.ts` 只依赖 `./notes-path` 与 `@shared/types`）。

#### 1.4.2 `section:` 行的格式与位置（逐字）

| 项 | 冻结 |
| --- | --- |
| 行名 | `section: `（前缀逐字，冒号后**一个**半角空格） |
| 值 | `formatChapterHeading(命中项)` = `<标题> · 第 <label> 页`（与 chip 文本逐字节相同） |
| 位置 | 固定在 `pageCount: <n>` 行之后、`selectedText:` 块之前；⇒ 命中可用时 `section:` 恒为载荷**第 5 行**（`<reading_context>` / `path:` / `page:` / `pageCount:` 恒在其前），可选块不受影响 |
| 出现条件 | 当且仅当 `resolveCurrentChapter(buildChapterRanges(ctx.outline, ctx.pageCount), ctx.page, ctx.pageCount) !== null` |
| 示例（`sample-paper.pdf` 第 2 页） | `section: 2. Method Overview · 第 2 页` |

#### 1.4.3 「不可解析时逐字节等于旧格式」的实现方式（逐字）

```ts
export function buildReadingUserMessage(userText: string, ctx: ReadingSendContext): string {
  if (!ctx.filePath) return userText;

  const lines = [
    "<reading_context>",
    `path: ${ctx.filePath}`,
    `page: ${ctx.page}`,
    `pageCount: ${ctx.pageCount}`,
  ];
  const chapter = resolveCurrentChapter(buildChapterRanges(ctx.outline, ctx.pageCount), ctx.page, ctx.pageCount);
  if (chapter) lines.push(`section: ${formatChapterHeading(chapter)}`);
  const selected = ctx.selectedText.trim();
  if (selected) {
    lines.push("selectedText:");
    lines.push(selected);
  }
  // …（reader_notes 块与 </reading_context> / 空行 / userText 收尾逐字不变）
}
```

| 冻结点 | 内容 |
| --- | --- |
| 实现方式 | `chapter === null` ⇒ **一行都不 push**（没有 `skip`、没有空串、没有占位）；既有 7 行的 push 顺序与字面零 diff ⇒ 整条消息逐字节等于旧格式 |
| 判据 | 与手工构造的旧格式串 `===`（本次烟测 `section-format` #1、离屏 `r12-4` 相位 `without-outline`）；「删掉该行后与旧格式逐字节相等」（离屏 `r12-4` 相位 `with-section` ③） |
| 旧格式（逐字） | `<reading_context>\npath: <filePath>\npage: <page>\npageCount: <pageCount>\n[selectedText: … 既有块]\n[reader_notes: … 既有块]\n</reading_context>\n\n<用户输入>` |
| 不改 | `selectNotesForContext` 的排序与两级裁剪、`reader_notes:` 条目块模板、chips 与 chip 排除语义（排除文档 chip 时不输出上下文）、无 `filePath` 时原样早退 |

#### 1.4.4 `ChatPanel.vue`（一行）

```ts
  const readContext = {
    filePath: readFilePath,
    page: readPage,
    pageCount: readerStore.pageCount,
    selectedText: excluded.has("selection") ? "" : readerStore.selectedText,
    notes: notesSnapshot,
    outline: readerStore.outline,
  };
```

- 与 `page` / `pageCount` 同一次「发送瞬间」快照；不深拷贝、不新增第二次读取窗口；不加 chip 排除分支（`outline` 无对应 chip）。
- 其余（`:111` 的注释、`:377` 的调用、`:356-361` 的既有 5 行）零改动。

#### 1.4.5 `reading-prompt.ts`（一行；数组元素 8 → 9）

| 项 | 值 |
| --- | --- |
| 位置 | 在 `:5` 逐字 `\t"Use pdf_outline for bookmarks and page numbers.",` **之后**插入一行（成为新 `:6`） |
| 新增行（逐字，含行首制表符） | `\t"The reading context may carry a section line: the section the user is currently reading and its page range. Trust it instead of inferring the section from the page number.",` |
| 不改 | 既有 8 个数组元素与顺序逐字不动；行 8 的注释顺移到新 `:9`；`].join("\n");` 仅行号后移（新 `:12`）、内容逐字不动 ⇒ `git diff` 单 hunk、只多一行 |
| 缩进 | 与相邻元素一致：**制表符**（该文件全部元素行为 `^I`，不得用 4 空格） |
| 不新增 | 不新增工具、不改 `session-bridge.ts` 的 `appendSystemPromptOverride`（`:1245`） |

#### 1.4.6 走查判据

| # | 命令 | 期望 |
| --- | --- | --- |
| 1 | `git diff --stat -- pix/src/renderer/utils/reading-context.ts` | 只有三处：`ReadingSendContext` 内字段 + 文档注释（+2 行）、import 面净 +1 行（新增 1 行 `./outline-notes`、既有 `import type` 行改写）、`buildReadingUserMessage` 内 +3 行 |
| 2 | `git diff -- pix/src/renderer/utils/reading-context.ts \| grep -E "^[-]" \| grep -v "^---"` | 只允许 `ReadingSendContext` 内 `notes` 行后插入处的相邻行位移与 import 行改写；既有 7 行 push、`selectNotesForContext` / `MAX_CONTEXT_*` 零删除 |
| 3 | `git diff --stat -- pix/src/main/reading-prompt.ts` | `1 insertion(+)`（单 hunk） |
| 4 | `git diff --stat -- pix/src/renderer/components/workspace/ChatPanel.vue` | `1 insertion(+)` |
| 5 | `grep -c "outline: readerStore.outline" pix/src/renderer/components/workspace/ChatPanel.vue` | `1` |

### 1.5 N81-1 —— 烟测（新建 `pix/scripts/smoke-view.mjs`，4 组 29 条）

#### 1.5.1 文件布局、入口、编译面、产物期望、自清理（逐字）

| 项 | 冻结 |
| --- | --- |
| 文件 | 新建 `pix/scripts/smoke-view.mjs`（顶层静态 import；零依赖，只用 Node 内建；与 `smoke-notes.mjs` 同范式） |
| 主入口 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:view` |
| 等价入口 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" node scripts/smoke-view.mjs` |
| `package.json` | **只**在 `scripts` 增一键 `"smoke:view": "node scripts/smoke-view.mjs"`（紧邻既有 `"smoke:notes"`）；其余字段、`dependencies` / `devDependencies` / `build` / `check` 逐字零改动；`package-lock.json` 零改动 |
| 顶层 import | `node:child_process`（`spawnSync`）/ `node:fs`（`mkdirSync` / `readdirSync` / `rmSync` / `writeFileSync`）/ `node:module`（`createRequire`）/ `node:os`（`tmpdir`）/ `node:path`（`dirname` / `join` / `relative` / `resolve`）/ `node:url`（`fileURLToPath`）；**不得** import electron / 渲染层组件 / `packages/**` |
| 常量 | `PIX_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..")`；`REPO_DIR = resolve(PIX_DIR, "..")`；`TSC_JS = join(PIX_DIR, "node_modules", "typescript", "lib", "tsc.js")`；`TMP = join(tmpdir(), "pix-smoke-view-" + Date.now())`；`OUT_DIR = join(TMP, "out")`；`TSCONFIG = join(TMP, "tsconfig.smoke.json")` |
| 临时 tsconfig | `{ compilerOptions: { module: "commonjs", target: "ES2022", rootDir: join(REPO_DIR,"pix","src"), outDir: OUT_DIR, strict: true, skipLibCheck: true, esModuleInterop: true, types: ["node"], typeRoots: [join(REPO_DIR,"pix","node_modules","@types")], baseUrl: join(REPO_DIR,"pix"), paths: { "@shared/*": ["src/shared/*"] } }, files: [join(REPO_DIR,"pix","src","renderer","utils","outline-notes.ts"), join(REPO_DIR,"pix","src","renderer","utils","notes-path.ts"), join(REPO_DIR,"pix","src","renderer","utils","reading-context.ts")] }`；`JSON.stringify(config, null, 2)` 后写入 |
| paths 的理由 | 三个文件都 `import type … from "@shared/types"`（`outline-notes.ts:11` / `notes-path.ts:8` / `reading-context.ts:9`）⇒ 不配 `baseUrl` + `paths` 会 TS2307 |
| 编译命令 | `spawnSync(process.execPath, [TSC_JS, "-p", TSCONFIG], { cwd: PIX_DIR, encoding: "utf8" })`；**禁止**先把源文件复制到临时目录再编译 |
| 必需产物 | `out/renderer/utils/outline-notes.js`、`out/renderer/utils/notes-path.js`、`out/renderer/utils/reading-context.js` |
| 允许附带 | `out/shared/types.js`（`import type` 的类型依赖，R10 实测的同类形态） |
| 判失败（直接退出 1，不进入断言） | `tsc` 退出码 ≠ 0（打印 stdout / stderr）；必需产物缺失；`readdirSync(OUT_DIR, { recursive: true, withFileTypes: true })` 归一化后出现上表之外的文件（`*.tsbuildinfo` / `*.d.ts` 等一律判失败） |
| 加载 | `const require = createRequire(import.meta.url);` → `require(join(OUT_DIR, "renderer", "utils", "outline-notes.js"))`、`require(join(OUT_DIR, "renderer", "utils", "reading-context.js"))`（`notes-path.js` 为间接依赖，不单独 require） |
| 输出协议 | 与 `smoke-notes.mjs` 同款：组横幅 `== 组 <名> ==`；每条 `[通过] <组> #<序号> <说明>` / `[失败] <组> #<序号> <说明>：<实际值>`；末行逐字 `通过 {passed} / 失败 {failed}`；退出码 0/1（失败含编译失败、产物异常、断言失败） |
| 自清理与零残留 | `finally` 内 `rmSync(TMP, { recursive: true, force: true })`；清理失败只打印 `[警告] 临时目录未清理：<path>`，**不改退出码**；脚本只读仓库内源文件、只写 `os.tmpdir()` 下目录；运行后 `git status --short` 只出现白名单文件 |

#### 1.5.2 夹具（4 个，逐字；期望值按 §1.1 手写，**不得**用被测函数生成期望值）

```js
const SAMPLE_LIKE = [
  { title: "1. Abstract", page: 1, items: [] },
  { title: "2. Method Overview", page: 2, items: [
      { title: "2.1 Sparse mask budget", page: 2, items: [] },
      { title: "2.2 Positional prior", page: 3, items: [] },
  ] },
  { title: "3. Ablation Study", page: 3, items: [
      { title: "Appendix A", page: null, items: [{ title: "Appendix A.1", page: 3, items: [] }] },
      { title: "Appendix B", page: 2, items: [] },
  ] },
];
const CHAIN = [
  { title: "Step 01", page: 1, items: [] },
  { title: "Step 02", page: 3, items: [] },
  { title: "Step 03", page: 5, items: [] },
];
const SINGLE = [{ title: "Only Chapter", page: 3, items: [] }];
const EMPTY = [{ title: "No Page", page: null, items: [{ title: "Child", page: null, items: [] }] }];
```

| 夹具 | `pageCount` | 手写期望的 ranges |
| --- | --- | --- |
| `SAMPLE_LIKE` | 3 | 7 项（§1.1.4 表；`ranges.size === 7` 为手写字面量） |
| `CHAIN` | 6 | `Step 01` 1–2 label `1-2`；`Step 02` 3–4 label `3-4`；`Step 03` 5–6 label `5-6` |
| `SINGLE` | 3 | `Only Chapter` 3–3 label `3` |
| `EMPTY` | 3 | 0 项（`ranges.size === 0`） |

`section-format` 的附加夹具（不新增第 5 个顶层夹具）：`FOLDED` = `JSON.parse(JSON.stringify(SAMPLE_LIKE))`，把命中节点 `root/1` 的 `title` 替换为 `"2. Method\n  Overview"`（其余字段不变）⇒ 第 2 页命中 label 仍为 `2`。

#### 1.5.3 断言清单（4 组 29 条，冻结，不得减少）

**组 `section-hit`（8 条）**

| # | 断言（逐条为真） |
| --- | --- |
| 1 | `SAMPLE_LIKE` 第 1 页 ⇒ `key === "root/0"`、`title === "1. Abstract"`、`start === 1`、`end === 1`、`label === "1"` |
| 2 | `SAMPLE_LIKE` 第 2 页 ⇒ `title === "2. Method Overview"`、`label === "2"`（同 `start` 取预序最早者 ⇒ 不是 `2.1`、不是 `Appendix B`） |
| 3 | `SAMPLE_LIKE` 第 3 页 ⇒ `title === "2.2 Positional prior"`、`label === "3"`（不是 `3. Ablation Study`、不是 `Appendix A.1`） |
| 4 | 全页不变量（1..3 页）：命中非 `null` 且 `start ≤ page ≤ end` |
| 5 | 「`start` 最大且 ≤ page」：对每页独立复算候选集（`ranges.values()` 过滤 `start <= page`）⇒ 命中项的 `start` 等于该集合最大值，且命中项（按 `key`）属于该集合 |
| 6 | `CHAIN` 第 2 页 ⇒ 命中 `start === 1`；第 3 页 ⇒ `start === 3`（边界含等于）；第 5 页 ⇒ `start === 5` |
| 7 | 逆序书签不劫持：`SAMPLE_LIKE` 第 3 页的命中 `key !== "root/2/1"`（`Appendix B`，`start = 2 < 3` 天然出局）且 `title !== "Appendix A.1"` |
| 8 | 同源：命中项与 `ranges.get(hit.key)` 为同一对象引用（`===`）；`ranges.size === 7`（= 有页码节点数，手写字面量） |

**组 `section-null`（8 条）**

| # | 断言 |
| --- | --- |
| 1 | `outline = []`（空数组）⇒ `resolveCurrentChapter(...) === null` |
| 2 | `EMPTY`（两个节点全 `page === null` ⇒ `ranges.size === 0`）⇒ `null` |
| 3 | 有页码节点但 `pageCount = 0`（`SAMPLE_LIKE`, page 1）⇒ `null` |
| 4 | `page = 0` ⇒ `null` |
| 5 | `page = -3` ⇒ `null` |
| 6 | `page = pageCount + 1`（`SAMPLE_LIKE`, 4）⇒ `null` |
| 7 | `page = 1.5` ⇒ `null` |
| 8 | 首节点 `page = 3`（`SINGLE`）且 `page = 1` ⇒ `null`，且 `try/catch` 包裹时 `didNotThrow === true`（未抛错） |

（需求档组 `section-null` 的 #1 / #2 分别对应「空数组」与「全 `page === null` 节点」两种不可解析来源；本表按 `outline = []` 在前落地，两条都在、条数不变。`section-null` 组只判返回值为 `null` 与 #8 的 `didNotThrow`，不涉及其它字段。）

**组 `section-nav`（8 条）**

| # | 断言 |
| --- | --- |
| 1 | `SAMPLE_LIKE` 第 1 页 ⇒ `prev === null`、`next.title === "2. Method Overview"` |
| 2 | `SAMPLE_LIKE` 第 2 页 ⇒ `prev.title === "1. Abstract"`（`end 1 < 2`）、`next.title === "2.2 Positional prior"`（`start 3 > 2`） |
| 3 | `SAMPLE_LIKE` 第 3 页 ⇒ `prev.title === "2.1 Sparse mask budget"`（`end` 并列取预序最晚者）、`next === null` |
| 4 | 不变量（`SAMPLE_LIKE` 1..3 页逐页）：`prev === null \|\| prev.end < page`；`next === null \|\| next.start > page` |
| 5 | `CHAIN` 第 3 页 ⇒ `prev.start === 1`、`next.start === 5`（相邻且页码单调） |
| 6 | `SINGLE` 第 3 页 ⇒ `prev === null && next === null`（单节禁用） |
| 7 | `SINGLE` 第 1 页（早于该节）⇒ `prev === null`、`next.start === 3`（确定目标） |
| 8 | 域外（`pageCount = 0` / `page = 4` / `page = 1.5`）⇒ `prev === null && next === null`（与 `resolveCurrentChapter` 同一守卫） |

**组 `section-format`（5 条）**

| # | 断言 |
| --- | --- |
| 1 | 无 outline：`buildReadingUserMessage("Q", { filePath: "C:/ws/sample-paper.pdf", page: 2, pageCount: 3, selectedText: "", notes: [], outline: [] })` **逐字节**等于 `` `<reading_context>\npath: C:/ws/sample-paper.pdf\npage: 2\npageCount: 3\n</reading_context>\n\nQ` `` |
| 2 | `SAMPLE_LIKE` 第 2 页 + 同一 `filePath` ⇒ 逐字节等于旧格式串在 `pageCount: 3` 之后插入 `` `section: 2. Method Overview · 第 2 页\n` `` 的结果 |
| 3 | 行序：同一载荷里三个 `indexOf` 均 ≥ 0 且 `indexOf("pageCount: 3") < indexOf("section: ") < indexOf("selectedText:")`（= 既有行序里的第 5 行；同时传 `selectedText: "选中"` 与一条备注） |
| 4 | 标题空白折叠：`FOLDED` 第 2 页 ⇒ `formatChapterHeading(hit) === "2. Method Overview · 第 2 页"`（无换行、无连续空格），且该载荷内以 `section: ` 开头的整行不含 `\n` |
| 5 | 无 `filePath`（`filePath: null`）⇒ 返回 `userText` 原样（既有早退语义，点名一次） |

#### 1.5.4 验收判据

| 面 | 判据 |
| --- | --- |
| 【烟测-渲染】 | 连续两次 `npm run smoke:view` 均退出码 0；输出 4 组共 29 条 `[通过]`、0 条 `[失败]`；末行逐字 `通过 29 / 失败 0` |
| 【check】 | `CHECK_EXIT=0` |
| 【走查】 | 新脚本不在 `pix/tsconfig.json` 的 `include`（`["src/renderer/**/*.ts", "src/renderer/**/*.vue", "src/shared/**/*.ts"]`）内 ⇒ 与 `ui-shot.mjs` 同待遇；`pix/package.json` 除 `scripts.smoke:view` 外零 diff；运行后仓库零残留 |
| 失败路径抽样（必须实测并留档；只临时改脚本本身，改完立即还原并 `git diff --exit-code -- pix/scripts/smoke-view.mjs`） | ① 把 `TSC_JS` 指向不存在路径 ⇒ 非 0 退出、输出含失败原因、**不进入断言**；② 把一条断言的手写期望改错 ⇒ 该条 `[失败] …：<实际值>`、其余条目照常、退出码 1 |

### 1.6 N81-2 —— 离屏（`pix/scripts/ui-shot.mjs`）

#### 1.6.1 `SEL` 新增 8 项 + 新 helper（语义冻结、命名自由）

| 项 | 值 |
| --- | --- |
| `SEL` 新增（逐字，追加在 `:91` `noteText` 之后、`:92` `};` 之前） | `readerSection: ".reader-section"`、`readerSectionChip: ".reader-section-chip"`、`readerSectionPrev: ".reader-section-prev"`、`readerSectionNext: ".reader-section-next"`、`pageIndicator: ".pdf-page-indicator"`、`pageInput: ".page-input"`、`readerMain: ".reader-main"`、`composerInput: ".input-area"`（**恰 8 项，不得多增**） |
| 追加位置（块级） | 全部新增 helper 与 4 个场景追加在 `runReaderStateScenarios` 末尾：`:6727` `await restoreStandardSeed();` **之后**、`:6728` `}` **之前**；顺序 = helper 块 → `r12-1` → `r12-2` → `r12-3` → `r12-4`，每个场景末尾自带复位，块的最后一条语句仍是 `await restoreStandardSeed();`（保持「函数以标准种子复位收尾」的既有性质） |
| `clickEl(selector)` | ``js(`document.querySelector(${JSON.stringify(selector)}).click(), true`)``（与既有 `runScenario:1062` 的 `click` 同写法；本函数作用域内**不存在** `click`，不得直接调用） |
| `pressReaderKey(key)` | 在 `document.body` 上派发 `new KeyboardEvent("keydown", { key, bubbles: true })`（与 `pressBodyEsc:5220` 同范式） |
| `pressKeyOn(selector, key)` | 在 `document.querySelector(selector)` 上派发同款 `keydown`；元素不存在即抛错（守卫面判据必须打在真实输入元素上） |
| `sectionProbe()` | 一次 `js` 读 `{ containerInDom, chipInDom, chipText, chipTitle, prevDisabled, nextDisabled, containerRect, containerPointerEvents, prevPointerEvents, nextPointerEvents, viewerWidth }`；`chipText` = `chip.textContent.replace(/\s+/g," ").trim()`；`chipTitle` = `chip.getAttribute("title")`；`prevDisabled` / `nextDisabled` = `el.disabled`（布尔，元素缺失为 `null`）；三个 rect 与 `viewerWidth` 一律 `getBoundingClientRect()` + `Math.round`（与 `rectOfSelector:2250` 同口径，字段 `x/y/width/height`）；三个 `pointerEvents` = computed 值 |
| `pillProbe()` | 一次 `js` 读 `{ indicator: { text, rect }, pageLabel: { text, rect }, toolbar: { rect }, captureFab: { rect }, zoomText }`；选择器逐字 `SEL.pageIndicator` / `.page-label` / `.pdf-toolbar` / `.pdf-capture-fab`；文本选择器逐字 `SEL.pageIndicator` / `.page-label` / `SEL.zoomLabel`；rect 口径同上 |
| `waitSectionReady()` | `waitFor` 等 `SEL.readerSection` 进 DOM（**有书签文档的唯一就绪点**；无书签文档不得使用——永不出现会超时） |
| `closeMap()` | 若 `SEL.mapSlot` 不在 DOM 直接返回（幂等）；否则再点一次 `SEL.mapToggle` 并 `waitFor` `.knowledge-map-slot` **退出 DOM**（`ReaderPanel.vue:62` 的 `showMap` 转假即卸载） |
| `settleEmptyOutline()` | `ensureMapOpen()` → `waitFor` `.map-empty` 与 `.map-progress`（与既有 50c 同口径，`ui-shot.mjs:4155-4165`）→ `closeMap()`（含等槽位退出）；**只用于无书签文档**；限额声明见 §3 第 1 行 |
| `mapCurrentLabels()` | 一次 `js` 读全部 `.map-row.current` 的 `.label` 文本数组（空白归一化；元素缺失项为 `null`） |

**新 helper 与场景的插值纪律（冻结）**：凡是进入页面上下文的字符串，一律 `${JSON.stringify(...)}` 插值传选择器 / 文本（同函数内既有范式 `:1386-1391`，跨场景范式 `:6197-6204`）；**不得**把 Node 侧常量名（`SEL` / `LIBRARY_DIR` / `T13` 等）直接写进页面字符串 —— 页面上下文不存在这些标识符，运行即 `ReferenceError`。

**43 号既有场景的就地就绪等待（冻结）**：在 `ui-shot.mjs:3654` `await waitPage(2, 3);` 之后追加一条就地内联等待 ``await waitFor("章节控件就绪", `document.querySelector(${JSON.stringify(SEL.readerSection)}) !== null`);``；**不得**调用 `waitSectionReady()` —— 新增 helper 定义在 `:6727` 之后（同函数体内后置 `const`，存在 TDZ），43 号运行期先于声明执行会抛 `ReferenceError`。放置理由：其后还有 `setDraft` / `selectPageSpan` / 笔记面板操作等多个异步往返，本等待落地后即可覆盖 §2.2 第 3 行的骨架 needle。

#### 1.6.2 场景 `r12-1`（组 `r12-section-visible`，5 条 record，3 张截图）

前置：`enterCleanWorkspace(seedNotes())` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 3)` → `waitSectionReady()`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `page-1` | `sectionProbe()` + `pillProbe()` → 截图 `r12-1-section-chip-page1.png`（`rectOfSelector(SEL.readerMain)`） | ① `.reader-section` 与 `.reader-section-chip` 都在 DOM；② `chipText === chipTitle === "1. Abstract · 第 1 页"`；③ `prevDisabled === true`、`nextDisabled === false`；④ `.page-label` 文本仍逐字 `第 1 / 3 页`；⑤ `containerRect.bottom ≤ indicator.rect.y + 1`（在上方）、`containerRect.width < viewerWidth`、`containerPointerEvents === "none"`、`prevPointerEvents === "auto"`、`nextPointerEvents === "auto"` | `{ phase, section, pill, overlap }` |
| `page-2` | `clickNext()` → `waitPage(2, 3)` → `sectionProbe()` → 截图 `r12-1b-section-chip-page2.png` | ⑥ `chipText === "2. Method Overview · 第 2 页"`；⑦ 两按钮均可点（`prevDisabled === false && nextDisabled === false`） | `{ phase, section }` |
| `page-3` | `clickNext()` → `waitPage(3, 3)` → `sectionProbe()` → 截图 `r12-1c-section-chip-page3.png` | ⑧ `chipText === "2.2 Positional prior · 第 3 页"`；⑨ `nextDisabled === true`（最后一节的下一节禁用） | `{ phase, section }` |
| `invariance` | ① 记 `chipText`；② `ensureMapOpen()`（已开不得再点）→ `waitFor(".map-row.current" 计数 === 3)` → 记 `chipText` 与 `currentLabels = mapCurrentLabels()`；③ `closeMap()`（幂等）→ 记 `chipText`；④ `clickEl(SEL.zoomInBtn)`（`title="放大"`）→ `repaint(win)`（模块级 `:1035`；点缩放后读标签的既有范式 `:6322`）→ 记 `zoomAfterIn = pillProbe().zoomText`（**放大后读数**）→ `clickEl('.pdf-toolbar button[title="缩小"]')` → `repaint(win)` → 记 `chipText` 与 `zoomBack = pillProbe().zoomText`；⑤ `openNotesPanel(4)` 后 `clickEl(SEL.tabLibrary)`（与 `restoreStandardSeed:3097` 同款）→ 记 `chipText` | ⑩ 五次读数的 `chipText` 逐字节相等且都等于 `2.2 Positional prior · 第 3 页`；⑪ 容器全程在 DOM（`containerInDom === true`）；⑫ 缩放证据（两次读数都在 `repaint(win)` 之后、缺一不可，只判一次 `100%` 属空断言）：放大后 `zoomAfterIn` 逐字 `110%`（`zoomBy(0.1)` → `setScale` 两位取整 → `.zoom-label` 的 `Math.round(scale × 100)`；`PdfViewer.vue:730-732` / `:845`、`reader-store.ts:136-139`），缩小后 `zoomBack` 逐字 `100%`（往返回到默认）；⑬ 地图同源：`currentLabels` **包含** `2.2 Positional prior` 与 `Appendix B`（两者都在地图的 in-range 集合内；chip 取「`start` 最大且预序最早」的一个） | `{ phase, readings: [...], zoomAfterIn, zoomBack, currentLabels }` |
| `page-input` | ① `clickEl('.page-label')` → `waitFor(SEL.pageInput)` → 原生 setter 写 `99` + `input` 事件 → `pressKeyOn(SEL.pageInput, "Enter")` → `waitFor(".page-input" 退出 DOM)` → 读 `.page-label` 与 `sectionProbe()`；② `clickEl('.page-label')` → 写 `2` + `pressKeyOn(SEL.pageInput, "Enter")` → `waitPage(2, 3)` → 读 `sectionProbe()` | ⑭ 越界 `99` 提交后 `.page-label` 仍逐字 `第 3 / 3 页`、`chipText` 仍逐字 `2.2 Positional prior · 第 3 页`（既有钳制语义 + 章节不漂移）；⑮ 合法页 `2` 提交后 `waitPage(2, 3)` 成立、`chipText === "2. Method Overview · 第 2 页"` | `{ phase, afterOutOfRange: {...}, afterValid: {...} }` |

#### 1.6.3 场景 `r12-2`（组 `r12-section-degrade`，2 条 record，1 张截图）

前置：`enterCleanWorkspace(seedNotes())` → `openRow("older-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 2)` → `settleEmptyOutline()`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `no-outline` | 记 `pageTextBefore` / `hashBefore` → `sectionProbe()` → `pressReaderKey("]")` → `pressReaderKey("[")` → 复读 `sectionProbe()` 与 `.page-label` → 截图 `r12-2-no-outline-degrade.png`（`rectOfSelector(SEL.readerMain)`） | ① `containerInDom === false` 且 `chipInDom === false`（零占位；前提 = 前置 `settleEmptyOutline()` 已把「空 outline 已落地」钉住，限额见 §3 第 1 行）；② 两次派发后 `.page-label` 仍逐字 `第 1 / 2 页`（无目标 ⇒ 零副作用）；③ `containerInDom` 仍为 `false`；④ `notesHash()` 与 `hashBefore` 相等 | `{ phase, section, pageTextBefore, pageTextAfter, hashSame }` |
| `zero-displacement` | ① `pillProbe()`（无书签文档，控件不在）；② `openRow("sample-paper.pdf")` → `waitPage(1, 3)` → `waitSectionReady()` → `pillProbe()`（控件在）；③ 逐字段比较；④ `openRow("older-paper.pdf")` → `waitPage(1, 2)` → `settleEmptyOutline()` → `sectionProbe()` | ⑤ `indicator` / `pageLabel` / `toolbar` / `captureFab` 四个 rect 的 `x/y/width/height` 两次读数逐字段差 ≤ 1px（跨文档：控件不在 vs 控件在；比较前提 = 两次 `zoomText` 均逐字 `100%`）；⑥ 防空断言：两次 `pageLabel.text` 分别为逐字 `第 1 / 2 页` 与 `第 1 / 3 页`（证明确实换了文档）；⑦ 存在性随文档往返：`sample-paper.pdf` 上 `containerInDom === true`、切回并 `settleEmptyOutline()` 后 `containerInDom === false`（缺席断言不再空转） | `{ phase, pillWithout, pillWith, delta, pageTexts, sectionAfterReturn }` |

#### 1.6.4 场景 `r12-3`（组 `r12-section-nav`，7 条 record，2 张截图）

前置：`enterCleanWorkspace(seedNotes())` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 3)` → `waitSectionReady()`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `next-jump` | `clickEl(SEL.readerSectionNext)` → `waitPage(2, 3)` → `sectionProbe()` → 截图 `r12-3-section-nav-after-next.png` | ① `.page-label` 逐字 `第 2 / 3 页`；② `chipText === "2. Method Overview · 第 2 页"`；③ 两按钮均可点 | `{ phase, pageText, section }` |
| `next-last-disabled` | `clickEl(SEL.readerSectionNext)` → `waitPage(3, 3)` → `sectionProbe()` | ④ 页码逐字 `第 3 / 3 页`；⑤ `nextDisabled === true`；⑥ `prevDisabled === false` | `{ phase, pageText, section }` |
| `prev-jump` | `clickEl(SEL.readerSectionPrev)` → `waitPage(2, 3)` → `sectionProbe()` | ⑦ 页码逐字 `第 2 / 3 页`（上一节目标 = `2.1`（`start 2`）⇒ 真实后退一页）；⑧ `chipText === "2. Method Overview · 第 2 页"` | `{ phase, pageText, section }` |
| `shortcut-next` | `clickPrev()` → `waitPage(1, 3)` →（防空断言：`prevDisabled === true`）→ `pressReaderKey("]")` → `waitPage(2, 3)` | ⑨ 派发前确在第 1 页且上一节禁用；⑩ 派发后落第 2 页、`chipText === "2. Method Overview · 第 2 页"`（与按钮同目标） | `{ phase, before, after }` |
| `shortcut-prev` | `pressReaderKey("[")` → `waitPage(1, 3)` → 截图 `r12-3b-section-nav-shortcut-prev.png` | ⑪ 落第 1 页；⑫ `chipText === "1. Abstract · 第 1 页"`；⑬ `prevDisabled === true` | `{ phase, pageText, section }` |
| `shortcut-guard-editable` | ① `clickEl('.page-label')` → `waitFor(SEL.pageInput)` → `pressKeyOn(SEL.pageInput, "]")` → 读 `.page-input` 的 `value` 与 `document.activeElement.tagName` → `pressKeyOn(SEL.pageInput, "Escape")` → 读 `.page-label`；② ``js(`document.querySelector(${JSON.stringify(SEL.composerInput)}).focus(), true`)`` → 记 `activeElement.tagName` → `pressKeyOn(SEL.composerInput, "]")` → 读 `.page-label` 与 `sectionProbe()` | ⑭ 页码输入框内派发后 `value` 仍逐字 `1`，且取消编辑后 `.page-label` 仍逐字 `第 1 / 3 页`（后半句是真正的守卫证据：若新分支跑到守卫之前，取消后页码会是 `第 2 / 3 页`）；⑮ composer 内派发后 `.page-label` 仍逐字 `第 1 / 3 页`、`chipText === "1. Abstract · 第 1 页"`；⑯ 防空断言：两次派发时 `activeElement.tagName` 分别为 `INPUT` 与 `TEXTAREA` | `{ phase, targets, pageInputValue, pageText, section }` |
| `shortcut-guard-capture` | ① `clickEl(SEL.captureFabBtn)`（未开才点，同 `r11-2` 范式）→ `waitFor(SEL.captureLayer)` → `pressReaderKey("]")` → 读 `.page-label`；② `pressBodyEsc()` → `waitFor(SEL.captureLayer 退出 DOM)` → `pressReaderKey("]")` → `waitPage(2, 3)` | ⑰ 框选模式内派发后页码仍 `第 1 / 3 页`（新分支自检 `captureMode` 生效）；⑱ 退出后同一按键落第 2 页（证明守卫只在模式内生效，不是按键被吞） | `{ phase, inCapture, afterExit }` |

#### 1.6.5 场景 `r12-4`（组 `r12-section-context`，2 条 record，1 张截图）

前置：`enterCleanWorkspace(seedNotes())` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 3)` → `waitSectionReady()` → `clickNext()` → `waitPage(2, 3)` → `clearSendCalls()`。
**前置不变量（逐字冻结）**：选区为空（`readerStore.selectedText === ""`，由 `goHome()` → `openDocument(null)`（`WorkspacePage.vue:235`、`reader-store.ts:58` 复位 `selectedText`）与 `openRow` 的 `openDocument` 保证）、选择集为空（`WorkspacePage.vue:239` `resetNotes()` → `notes-store.ts:287` `clearNoteSelection()`）。
两条用户文本逐字冻结（不得与既有场景文本重复，保证 `lastSend()` 取到本场景载荷）：`T12 = "12：这一节的假设是什么？"`、`T13 = "13：没有书签的文档也要能正常提问。"`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `with-section` | `typeAndSend(T12)` → `waitSendCalls(1)` → `lastSend()` → 截图 `r12-4-section-context-sent.png`（整窗） | ① 载荷含逐字行 `section: 2. Method Overview · 第 2 页`；② `indexOf("pageCount: 3") < indexOf("section: ") < indexOf("</reading_context>")`；③ **删掉该行后与旧格式逐字节相等**：`payload.message.replace("section: 2. Method Overview · 第 2 页\n", "") === \`<reading_context>\npath: ${join(LIBRARY_DIR, "sample-paper.pdf")}\npage: 2\npageCount: 3\n</reading_context>\n\n${T12}\``；④ 气泡 `displayText === T12`；⑤ 防空：`selectedTextInPayload === false`（= `payload.message.includes("selectedText:")`）且 `notesInPayload === 0`（= `"reader_notes:"` 不出现） | `{ phase, message, sectionLine, withoutSectionEqualsOld, selectedTextInPayload, notesInPayload }` |
| `without-outline` | `openRow("older-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 2)` → `settleEmptyOutline()` → `clearSendCalls()` → `typeAndSend(T13)` → `waitSendCalls(1)` → `lastSend()` | ⑥ 载荷**逐字节**等于 `` `<reading_context>\npath: ${join(LIBRARY_DIR, "archive", "older-paper.pdf")}\npage: 1\npageCount: 2\n</reading_context>\n\n${T13}` ``；⑦ 载荷不含子串 `section:`；⑧ 防空：`selectedTextInPayload === false` 且 `notesInPayload === 0` | `{ phase, message, exact, selectedTextInPayload, notesInPayload }` |

场景末：`restoreStandardSeed()`（与 R11 收尾同纪律）。

#### 1.6.6 配额与截图清单（冻结，不得减少）

| 组（`record` label） | 条数 | 场景 | 相位（顺序） | 截图（逐字） |
| --- | --- | --- | --- | --- |
| `r12-section-visible` | 5 | `r12-1` | `page-1` / `page-2` / `page-3` / `invariance` / `page-input` | `r12-1-section-chip-page1.png`、`r12-1b-section-chip-page2.png`、`r12-1c-section-chip-page3.png` |
| `r12-section-degrade` | 2 | `r12-2` | `no-outline` / `zero-displacement` | `r12-2-no-outline-degrade.png` |
| `r12-section-nav` | 7 | `r12-3` | `next-jump` / `next-last-disabled` / `prev-jump` / `shortcut-next` / `shortcut-prev` / `shortcut-guard-editable` / `shortcut-guard-capture` | `r12-3-section-nav-after-next.png`、`r12-3b-section-nav-shortcut-prev.png` |
| `r12-section-context` | 2 | `r12-4` | `with-section` / `without-outline` | `r12-4-section-context-sent.png` |

合计：**4 组 16 条 record、7 张截图**；末态 `restoreStandardSeed()`；既有 120 张 / 169 条 / 37 种 label 零缺失、零改写（验收读数：**127 张 / 185 条 / 41 种 label**）。

### 1.7 N81-3 —— 基线与零缺失

见 §5.1（命令）与 §5.2（比对方法与期望读数）。

---

## 2. 与既有冻结面的关系

### 2.1 本轮不得改动的既有类名 / 文案 / 场景 / 断言

| 面 | 冻结内容 |
| --- | --- |
| R9 地图 | `isCurrent` / `isRead` 的判定式与 CSS（`.map-row.current` / `.map-row.read`）、章节块与子行结构、`.page-badge` / `.note-count-badge` / `.map-progress` / `.map-empty` / `.map-count`、节点点击写 `gotoPage`、翻页自动滚动（含最后一个 `.current` 行的取法）——本轮只**读取**同一份 `ChapterRange`，地图侧零 diff |
| R10 注入 | `<reading_context>` 既有行的**字面与顺序**、`selectNotesForContext` 的排序与两级裁剪、chips 与 chip 排除语义（排除文档 chip 时不输出上下文）、42c r7 与 43 的既有断言文本 |
| R11 四处 | 笔记搜索框 Esc 的阻断冒泡（`NotesPanel.vue`）、浮层滚动来源判定（`PdfSelectionQuickAsk.vue`）、`ui-shot.mjs` 的启动守卫与产物自净/结束自检；`PdfViewer.vue` 的 Esc 两分支（`:375` / `:380`）与守卫顺序（`:385`）逐字不动 |
| R6 现场 | `reader-state.json` 的写入时机与 `MIN_SCALE` / `MAX_SCALE` / `DEFAULT_SCALE` 取值域；章节跳转只写 `readerStore.gotoPage`，不写现场文件 |
| 全局类名与文案 | `.pdf-page-indicator` / `.page-label` / `.page-input` / `.zoom-label` / `.pdf-capture-fab` / `.capture-layer` / `.quick-ask*` / `.notes-*` / `.map-*` / `.tree-*` / `.pill-*` / `.reader-main` / `.input-area` 的类名与文本模板 |
| 既有键位 | `/` / `PageUp` / `PageDown` / `ArrowLeft` / `ArrowRight` / `Home` / `End` / `Ctrl+F` / `Escape`（两个分支）/ 输入区 `Enter` 的行为逐字不变；**框选模式下既有七键位仍生效**（本轮新行为只落在 `[` / `]`） |
| 场景面 | 既有全部场景（`00`–`11` / `20`–`24` / `30`–`36` / `40`–`46` / `50`–`55` / `60`–`65` / `r11-1`–`r11-6`）的全部 label、相位名、截图名与断言文本零改动（例外见 §2.2：43 号场景的就绪等待 + 两处 needle 追加、35 号夹具串同步；label / 相位名 / 截图名与其它断言文本仍零改动） |
| 类型与协议 | `pix/src/shared/types.ts`（`ReaderOutlineNode` 已存在）、`reader-store.ts`、`ipc-handlers.ts` / `preload.ts` / `session-bridge.ts` 零 diff |

### 2.2 本轮对既有场景 / 断言的显式改动（逐字：文件 / 行 / 旧值 / 新值 / 理由）

| # | 文件 : 行 | 旧值（逐字） | 新值（逐字） | 理由 |
| --- | --- | --- | --- | --- |
| 1 | `pix/scripts/ui-shot.mjs:2829`（35 号场景的 `confirmed35B` 夹具串） | ``const confirmed35B = `<reading_context>\npath: ${join(LIBRARY_DIR, "sample-paper.pdf")}\npage: 1\npageCount: 3\n</reading_context>\n\n${TURN35B}`;`` | ``const confirmed35B = `<reading_context>\npath: ${join(LIBRARY_DIR, "sample-paper.pdf")}\npage: 1\npageCount: 3\nsection: 1. Abstract · 第 1 页\n</reading_context>\n\n${TURN35B}`;`` | 该串是**模拟确认文本**的夹具（`:2831` 传给 `runTurn`），锚点在发送时刻登记、断言不解析该串 ⇒ 加行对全部断言零影响；同步只为保持「仿真文本 === 真实载荷」的等价（需求 §0.2 第 2 条 / 开放问题 4）。**不同步也全绿**，但必须二选一并留档 |
| 2 | `pix/scripts/ui-shot.mjs:3673-3686`（43 号 record 的 `missing` 必需行列表：`:3673` `missing: missingLines(prompt43.message, [`、needle 在 `:3674-3685`、`:3686` `]),`；共 **12** 条 needle，包含式） | 逐字 12 条：`"<reading_context>"`、`"page: 2"`、`"selectedText:"`、`"reader_notes:"`、`"1. doc: archive/older-paper.pdf"`、`"   page: 7"`、`"   kind: excerpt"`、`"   text: Section 4. Reproducibility: all runs use three seeds and report the median."`、`"2. doc: sample-paper.pdf"`、`"   page: 1"`、`"   text: We study retrieval over long documents where the attention budget is the binding constraint."`、`"   comment: 与第 3 节消融实验对照"` | 同一数组**追加第 13 条** `"section: 2. Method Overview · 第 2 页"`；既有 12 条逐字保留 | 现场 43 号停在 `sample-paper.pdf` 第 2 页 ⇒ 新行必然出现；追加后 `data.missing` 与断言口径同源（`missing` 是记录字段，不构成强制断言） |
| 3 | `pix/scripts/ui-shot.mjs:3698` 与 `:3700`（43 号骨架断言：同一 `missingLines(...)` 表达式的两处 4 项 needle 列表） | `missingLines(prompt43.message, ["<reading_context>", "page: 2", "selectedText:", "reader_notes:"])`（`:3698` 的 `.length === 0` 条件与 `:3700` 的失败文案各一处） | 两个列表**同步追加** `"section: 2. Method Overview · 第 2 页"`（四处文本一致：两处列表各 5 项）；既有 4 项逐字保留 | 让「骨架行」断言覆盖本轮新增的必需行；`missingLines` 是包含式 ⇒ **不追回也不会变红**，追加属主动补强（需求 N81-2 冻结） |
| 4 | `pix/scripts/ui-shot.mjs:3654`（43 号场景：`waitPage(2, 3)` 之后） | 无（既有场景无此语句） | 追加一条就地就绪等待：``await waitFor("章节控件就绪", `document.querySelector(${JSON.stringify(SEL.readerSection)}) !== null`);`` | 页码可见严格早于章节派生（`PdfViewer.vue:650-664` vs `:669-673`，`waitFor` 轮询 120ms）⇒ 第 3 行的骨架 needle 若在 outline 落地前发送必判红；就地内联而非 `waitSectionReady()`（TDZ，见 §1.6.1）；**纯追加、无删除**，不改变 43 号其余语句 |

**未改写的既有断言（已核对，不得动）**：42d（`:3642` 逐字等于输入 —— `!filePath` 早退，与 `<reading_context>` 无关）、42c r7（`ui-shot.mjs:3559` 起，`includes` + `path: ` 前缀 `find`）、43 的其余 10 条 `failures`、44 / 45 / 52 / 62 / 63 与 `r11-*` 各组的载荷判据（全部为 `includes` / 前缀 `find` 形式；`grep -n "message ==="` 在载荷判据处仅命中 `:3642`，另 `:538` 为 stub 内部的无关命中）。系统提示词文本全仓库无断言（唯一引用点 `session-bridge.ts:1245`）⇒ N80-4 加行不撞既有断言。

### 2.3 零 diff 清单与判据

```bash
git status --short
git diff --stat
git diff -- pix/src/renderer/stores pix/src/renderer/utils/notes-path.ts pix/src/renderer/utils/notes-view.ts \
          pix/src/shared/types.ts pix/src/main/ipc-handlers.ts pix/src/main/preload.ts pix/src/main/notes-store.ts \
          pix/src/main/library-root.ts pix/src/main/reader-state-store.ts pix/src/main/session-bridge.ts \
          pix/src/renderer/components/workspace/KnowledgeMap.vue pix/src/renderer/components/workspace/NotesPanel.vue \
          pix/src/renderer/components/workspace/ReaderPanel.vue pix/src/renderer/components/workspace/LibraryPanel.vue \
          pix/src/renderer/components/workspace/PdfSearchPanel.vue pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue \
          README.md .gitignore package-lock.json packages pix/tsconfig.json pix/tsconfig.main.json \
          pix/tsconfig.preload.json pix/vite.config.ts pix/resources pix/build
```

- 期望：上面这条 `git diff --` 的**全部路径逐条为空**。
- `git status --short` 只列白名单：`M pix/src/renderer/utils/outline-notes.ts`、`M pix/src/renderer/utils/reading-context.ts`、`M pix/src/renderer/components/workspace/ChatPanel.vue`、`M pix/src/renderer/components/workspace/PdfViewer.vue`、`M pix/src/main/reading-prompt.ts`、`M pix/scripts/ui-shot.mjs`、`?? pix/scripts/smoke-view.mjs`、`M pix/package.json`、`?? docs/pm/R12-*.md`。
- `README.md` **不在本轮白名单**（R11 的白名单条目在 R12 不适用）⇒ 它的 diff 必须为空。
- **主进程口径**：本轮主进程**数据面**零改动；`pix/src/main/reading-prompt.ts`（提示词常量）是唯一的主进程改动，不经过 `smoke-notes.mjs`（该脚本只驱动 `notes-store` / `library-root`）。

---

## 3. 失败路径表

| # | 情形 | 期望表现 | 证据 / 判据 |
| --- | --- | --- | --- |
| 1 | **`settleEmptyOutline()` 的限额**（无书签文档的「解析完成」不是严格证明） | `KnowledgeMap.vue:57` 的 `hasOutline = readerStore.outline.length > 0` 在加载窗口内同为假 ⇒ `settleEmptyOutline()` 只证明「地图已渲染空态」。因此 `r12-2` ①③ 的缺席断言**必须**由同场景 ⑦ 的正向对照（`sample-paper.pdf` 上 `waitSectionReady()` 后控件确在 DOM）+ 跨文档往返兜底；dev 档按此口径留档 | §1.6.3 ①③⑦ + 需求 §0.6 定稿修订第 1 条的限额声明 |
| 2 | **无 outline**（`readerStore.outline = []`） | 命中 `null`、nav 两者 `null` ⇒ 容器不进 DOM（零占位）；`section:` 行不注入；`[` / `]` 零副作用、不 `preventDefault`（目标 `null`） | 烟测 `section-null` #2 + `r12-2` ①②③④ + `r12-4` 相位 `without-outline` ⑥⑦ |
| 3 | **无页码节点**（outline 非空但全部 `page === null`） | `ranges.size === 0` ⇒ 与第 2 行同表现（不渲染、不注入、零副作用） | 烟测 `section-null` #1（`EMPTY`）+ `navigate` 组 #8（域外同守卫） |
| 4 | **`pageCount = 0`**（加载窗口 / 文本预览） | 纯函数守卫第一分支 ⇒ `null` / 两者 `null`；UI 侧容器 `v-if` 为假（不渲染）；快捷键在 `:385` 既有守卫处早退（`pageCount <= 0`）⇒ **不进入**新分支、不 `preventDefault` | 烟测 `section-null` #3 + `section-nav` #8；走查 §1.3.2 规则 3 的守卫顺序 |
| 5 | **页越界**（`page < 1` / `page > pageCount` / 非整数 / `NaN`） | 纯函数**不四舍五入、不钳制**，直接 `null` / 两者 `null`。UI 侧 `setPage`（`clampPage`）已把 `page` 钳在 `1..pageCount` ⇒ 该分支在 UI 侧不可达，只由烟测覆盖；`r12-1` 相位 `page-input` 验的是**既有钳制语义 + 章节不漂移**（提交 `99` 后页码与 chip 都不变） | 烟测 `section-null` #4–#7；`r12-1` 相位 `page-input` ⑭ |
| 6 | **单节文档**（`SINGLE`：`start = end = 3`） | 节内：命中该节（chip 显示）、nav 两者 `null` ⇒ 两按钮均禁用、容器**仍渲染**（因命中非 `null`）；早于该节（`page = 1`）：命中 `null`（chip 缺席）、`prev = null`、`next = 该节` ⇒ 容器渲染（prev 禁用 / next 可点，点后跳到第 3 页） | 烟测 `section-nav` #6 / #7；容器 `v-if` 的三选一条件（§1.2.1） |
| 7 | **跳转目标已过期**（点击 / 按键后、消费前文档切换或 outline 重算） | 不引入任何跨 tick 的目标缓存：`jumpToChapter` 在**同一同步帧**读 `chapterNav.value`，只写数字 `target.start`。文档切换时 `openDocument` 把 `gotoPage` 置 `null`（`reader-store.ts:66`）⇒ 旧意图自动作废；`PdfViewer.vue:800-807` 的 watcher 消费后立刻清空 ⇒ 不重复消费。outline 重算最坏结果是「跳到旧目标页号」，不抛错、不留陈旧对象 | 走查：`jumpToChapter` 是唯一写入点、无 `ref` 缓存（§1.2.2 / §1.3.3）；`r12-3` 的按钮跳转在 `waitPage` 后逐页判定 |
| 8 | **快捷键在输入框聚焦时**（`.page-input` / `.input-area` / 任何 `INPUT` / `TEXTAREA` / `SELECT` / `contenteditable`） | `:385` 的 `isEditableTarget(event.target)` 早退 ⇒ 不进入新分支、不 `preventDefault`、页码与 chip 均不变；`r12-3` 的 ⑭ 后半句（取消编辑后页码仍 `第 1 / 3 页`）是**真正的守卫证据**（若新分支跑到守卫之前，取消编辑后页码会变成 `第 2 / 3 页`） | `r12-3` 相位 `shortcut-guard-editable` ⑭⑮⑯；走查 §1.3.5 #1–#3 |
| 9 | **框选模式下按 `[` / `]`** | 新分支自检 `readerStore.captureMode` 后 `return`（不 `preventDefault`、不改页码）；退出框选模式后同一按键恢复生效。既有七键位在框选模式下的既有行为**不得**改变 | `r12-3` 相位 `shortcut-guard-capture` ⑰⑱；走查：`:375` 的 Esc 分支零 diff |
| 10 | **按钮 `disabled` 与目标 `null` 脱钩**（例如引入第三种条件、或禁用态点击仍写 `gotoPage`） | 判红：`r12-1` ①③⑨、`r12-3` ⑤⑥⑬（禁用态与页码同时判定）；`jumpToChapter` 的 `if (!target) return;` 保证禁用态点击零副作用 | §1.3.1 / §1.6.4 各相位的 `prevDisabled` / `nextDisabled` 字段 |
| 11 | **chip 文本与 `section:` 行不一致**（两处各写一份模板） | 判红：`r12-1` ②⑥⑧ 与 `r12-4` ①③ 交叉比对（chip 文本逐字等于上下文行值）；烟雾 `section-format` #2 逐字节 | §1.1.1 签名 3 + §1.2.1 chip 绑定（同一份 `formatChapterHeading`） |
| 12 | **新控件挤动既有控件** | 判红：`r12-1` ⑤（不相交 + 在上方 + 宽度 + 指针事件）、`r12-2` ⑤（四选择器 ±1px）、零缺失比对（§5.2） | §1.6.2 / §1.6.3；任何偏差必须逐项登记在 dev 档，不得静默 |
| 13 | **新脚本产物异常 / 编译失败（N81-1）** | 打印 `tsc` 输出与实际目录树 ⇒ **不进入断言**，直接退出 1 | §1.5.1 产物期望；失败路径抽样（§1.5.4） |
| 14 | **烟测脚本清理失败 / 仓库残留** | 只打印 `[警告] 临时目录未清理：<path>`，不改退出码；`git status --short` 出现白名单外文件即判失败 | §1.5.1 自清理与零残留 |
| 15 | **43 号骨架断言的就绪依赖**（新增 needle 后） | 页码 pill 可见 ≠ 章节派生完成 ⇒ 若发送早于 `setOutline`（`PdfViewer.vue:669-673`），载荷缺 `section:` 行 ⇒ `:3698` / `:3700` 的硬断言判红 | §2.2 第 4 行的就地等待（`ui-shot.mjs:3654`）+ 走查 §5.4 #12（只增行）；红灯时先查就绪等待是否落地，不得删 needle |

---

## 4. 文件级清单（动作 + 具体改动点 + 不变量）

| # | 文件 | 动作 | 具体改动点 | 不变量 |
| --- | --- | --- | --- | --- |
| 1 | `pix/src/renderer/utils/outline-notes.ts` | 修改 | 新增 `inlineTitle`（私有）+ `formatChapterHeading` + `resolveCurrentChapter` + `resolveChapterNav`（逐字见 §1.1.1 / §1.1.3）；文件头注释补一句「章节命中与导航也来自本文件的同一份 ranges」（追加，不改既有段落） | `buildChapterRanges` / `countNotesByChapter` / `collectPreorder` / 既有 re-export 零 diff；无新依赖；无 `any`；只读 `ChapterRange` 的 `title` / `label` / `start` / `end` 字段，不改写字段 |
| 2 | `pix/src/renderer/utils/reading-context.ts` | 修改 | `ReadingSendContext` 增必填 `outline: ReaderOutlineNode[]`；`buildReadingUserMessage` 在 `pageCount:` 之后插入可选 `section:` 行（§1.4.3 逐字）；import 面增 1 行（`./outline-notes` 的三个函数）+ `ReaderOutlineNode` 类型 | 既有 7 行的 push 顺序与字面零 diff；`!filePath` 早退；`selectNotesForContext` / `MAX_CONTEXT_NOTES` / `MAX_CONTEXT_NOTES_CHARS` / 条目块模板零 diff；`<reading_context>` 逐字节等于旧格式（不可解析时） |
| 3 | `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改（一行） | `readContext` 字面量增 `outline: readerStore.outline,` | 其余零改动（`:111` 注释、`:377` 调用、`:356-361` 既有 5 行、所有 chips 行为） |
| 4 | `pix/src/renderer/components/workspace/PdfViewer.vue` | 修改 | import **两行**（value 一行 + `import type { ChapterRange }` 一行）；3 个新 computed（§1.2.2）；`jumpToChapter`；`.reader-section` 模板块（§1.2.1，插在 `.pdf-page-indicator` 之前）；`onWindowKeydown` 内新增 `[` / `]` 分支块（§1.3.2）；scoped 样式块（§1.2.3） | `.pdf-page-indicator` 模板零 diff；Esc 两分支与 `:385` 守卫顺序零 diff；既有七键位分支零 diff；`isEditableTarget` 恰 1 个定义；`addEventListener("keydown"` 恰 1 处；`readerStore.gotoPage =` 新增恰 1 处；`reader-store.ts` / `ReaderPanel.vue` / `KnowledgeMap.vue` 零 diff |
| 5 | `pix/src/main/reading-prompt.ts` | 修改（一行） | 数组元素 8 → 9：`:5` 后插入 §1.4.5 的逐字行（含制表符缩进） | 既有 8 个元素与顺序逐字不动；`].join("\n")` 内容逐字不动（仅行号后移）；`git diff` 单 hunk |
| 6 | `pix/scripts/ui-shot.mjs` | 修改 | `SEL` 增 8 项；新增 9 个 helper（§1.6.1，含 `clickEl`）；43 号场景就地就绪等待（§2.2 第 4 行）；追加 `r12-1`…`r12-4` 与 4 组 16 条 record、7 张截图；§2.2 的四处既有面改动（35 夹具串 / 43 必需行 / 43 骨架行 / 43 就地等待） | 既有场景 / 相位 / label / 截图名零改动；`SEL` 只增 8 项；只写 `OUT_ROOT`；`record` 语义（先落测量再抛错）不变；块末仍以 `restoreStandardSeed()` 收尾 |
| 7 | `pix/scripts/smoke-view.mjs` | **新建** | §1.5 全表：编译面 / 产物校验 / 加载 / 4 个夹具 / 4 组 29 条 / 输出协议 / 退出码 / 自清理 | 只读仓库内源文件、只写 `os.tmpdir()` 下临时目录；零依赖；无 electron / 渲染层 import；期望值手写（不得由被测函数生成） |
| 8 | `pix/package.json` | 修改（最小） | `scripts` 增 `"smoke:view": "node scripts/smoke-view.mjs"` | `dependencies` / `devDependencies` / `build` / `check` / 其它字段逐字零改动；不新增第二个脚本 |
| 9 | `docs/pm/R12-design.md` | 新建（本档） | —— | 不改源码 |

**范围外（任何情况下不动）**：`packages/**`、`package-lock.json`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/src/renderer/stores/**`、`pix/src/renderer/components/workspace/{KnowledgeMap,NotesPanel,ReaderPanel,LibraryPanel,PdfSearchPanel,PdfSelectionQuickAsk}.vue`、`pix/src/renderer/utils/{notes-path,notes-view}.ts`、`pix/src/main/{ipc-handlers,preload,notes-store,library-root,reader-state-store,session-bridge}.ts`、`pix/src/shared/types.ts`、`pix/resources/**`、`docs/pm/**` 的历史档件、`.gitignore`、`README.md`。

---

## 5. 验证方案

### 5.1 命令（按执行顺序）

```bash
# 步骤 0：动工前（未改任何文件）—— 唯一工程门
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"          # 期望 0

# 步骤 0b：交叉核对本轮的零缺失比对基线（已冻结读数：120 张 / 169 条 / 37 种 label / failure null）
node -e "const fs=require('fs');const L=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));const B='C:/Users/86157/AppData/Local/Temp/pix-v05-r11-lead/shots';const m=L(B+'/MANIFEST.json');const x=L(B+'/MEASUREMENTS.json');console.log(JSON.stringify({shots:m.shots.length,failure:m.failure,measurements:x.length,labels:new Set(x.map(e=>e.label)).size}))"
# ⇒ 必须逐字得到 {"shots":120,"failure":null,"measurements":169,"labels":37}；不一致则停线排查，不得带病开发

# 步骤 0c：如需自证（可选，需求 §0.6 冻结）—— 用全新目录实跑一次基线，读数应与步骤 0b 同为 120 / 169
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r12-base" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_BASE_EXIT=$?"

# 步骤 1：A 面落地（纯函数 + 契约 + 载荷 + 提示词 + 烟测）
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:view; echo "SMOKE_VIEW_EXIT=$?"     # 连续两次

# 步骤 2：B 面落地（UI + 离屏）后的验收取证（与基线目录不同）
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r12-after" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_AFTER_EXIT=$?"
# 期望：UI_SHOT_AFTER_EXIT=0 + MANIFEST.json.failure === null + 4 个新场景全绿 + 7 张新截图齐备

# 步骤 3：主进程数据面回归（零改动确认）
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes; echo "SMOKE_NOTES_EXIT=$?"   # 期望 0，26 条全绿

# 步骤 4：零残留
cd E:/develop/PiX-Read && git status --short
```

**验收读数（冻结）**：`pix-v05-r12-after/shots/MANIFEST.json` ⇒ `shots.length = 127`、`failure = null`；`MEASUREMENTS.json` ⇒ 长度 **185**、`label` 去重 **41** 种（既有 37 种 ⊆ 41；新增恰为 `r12-section-visible` / `r12-section-degrade` / `r12-section-nav` / `r12-section-context`）；`shots/` 一级条目只有 `*.png` / `MANIFEST.json` / `MEASUREMENTS.json`。

### 5.2 零缺失比对（逐字命令 + 期望）

```bash
BASE="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-lead"
AFTER="C:/Users/86157/AppData/Local/Temp/pix-v05-r12-after"

# ① 截图 basename 零缺失 + 新增张数 + failure 字段
node -e "const fs=require('fs');const L=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));const b=L(process.argv[1]),a=L(process.argv[2]);const S=(x)=>new Set(x.shots.map(s=>s.name));const bs=S(b),as=S(a);console.log(JSON.stringify({base:b.shots.length,after:a.shots.length,missing:[...bs].filter(n=>!as.has(n)),added:[...as].filter(n=>!bs.has(n))}));console.log('AFTER_FAILURE='+JSON.stringify(a.failure))" "$BASE/shots/MANIFEST.json" "$AFTER/shots/MANIFEST.json"
# ⇒ missing: []、base: 120、after: 127、added 为 §1.6.6 的 7 张、AFTER_FAILURE=null

# ② 测量 label 零缺失（按 label 计次，基线每 label 的条数不得减少）
node -e "const fs=require('fs');const L=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));const cnt=(x)=>{const m=new Map();for(const e of x)m.set(e.label,(m.get(e.label)||0)+1);return m};const cb=cnt(L(process.argv[1])),ca=cnt(L(process.argv[2]));console.log(JSON.stringify({baseLabels:cb.size,afterLabels:ca.size,missing:[...cb].filter(([k,v])=>(ca.get(k)||0)<v).map(([k,v])=>k+':'+v+'->'+(ca.get(k)||0))}))" "$BASE/shots/MEASUREMENTS.json" "$AFTER/shots/MEASUREMENTS.json"
# ⇒ baseLabels: 37、afterLabels: 41、missing: []

# ③ 产物目录白名单（脚本内已自检；此处人工复核）
ls -A "$AFTER/shots" | grep -v -E '\.png$' | grep -v -E '^(MANIFEST|MEASUREMENTS)\.json$' ; echo "STRAYS_EXIT=$?"   # 期望无输出、STRAYS_EXIT=1

# ④ 四选择器几何的现场读数（r12-2 ⑤ 的 `delta` 字段，供人工复核）
node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const e=x.find(r=>r.label==='r12-section-degrade'&&r.data.phase==='zero-displacement');console.log(JSON.stringify(e.data.delta))" "$AFTER/shots/MEASUREMENTS.json"
# ⇒ 四选择器的 x/y/width/height 逐字段差 ≤ 1；任何 >1 的字段必须逐项登记在 dev 档
```

**允许的位移（冻结）**：只允许「新增绝对定位控件导致的位移」；`.pdf-page-indicator` / `.page-label` / `.pdf-toolbar` / `.pdf-capture-fab` 四个选择器的几何必须**零位移**（±1px 容差），`w/h/fontSize/color/background` 不得出现非预期差异；任何偏差逐项登记在 dev 档，不得静默。

**既有截图的内容变化（登记项，冻结）**：新增控件会出现在所有含 `sample-paper.pdf` 阅读器画面的既有截图中（示例：42c / 43 / 35 号场景的阅读器帧）；本节的零缺失判据只比 basename / label 集合，**不覆盖内容差异** ⇒ dev 档须按文档分类抽样登记（或逐张登记）并确认无「非预期的控件重叠 / 截断 / 遮挡」（与 §8 目视要点第 8 条同一登记项）。

### 5.3 烟测实跑（命令 + 预期）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:view; echo "SMOKE_VIEW_EXIT=$?"    # ×2，期望 0
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes; echo "SMOKE_NOTES_EXIT=$?"  # 期望 0
```

预期输出（形状冻结）：

```
[smoke-view] 临时目录：<TMP>
[smoke-view] typescript：<repo>/pix/node_modules/typescript/lib/tsc.js
== 组 section-hit ==        # 8 条 [通过]
== 组 section-null ==       # 8 条 [通过]
== 组 section-nav ==        # 8 条 [通过]
== 组 section-format ==     # 5 条 [通过]
通过 29 / 失败 0
SMOKE_VIEW_EXIT=0
```

- 末行汇总逐字 `通过 {passed} / 失败 {failed}`；连续两次都 `SMOKE_VIEW_EXIT=0`。
- `smoke:notes` 仍逐字输出 `通过 26 / 失败 0`（数据面零改动的回归确认）。
- **失败注入抽样（必须实测并留档；只临时改 `pix/scripts/smoke-view.mjs`，改完立即还原并 `git diff --exit-code -- pix/scripts/smoke-view.mjs`）**：① `TSC_JS` 指向不存在路径 ⇒ 非 0 退出、输出含失败原因、不进入断言；② 把 `section-hit` #2 的手写期望改成 `2.1 Sparse mask budget` ⇒ 该条 `[失败] …：<实际值>`、其余 28 条照常、退出码 1。
- 跑完核对：`cd E:/develop/PiX-Read && git status --short` 只出现白名单文件；`ls -d "$TEMP"/pix-smoke-view-* 2>/dev/null` 无残留。

### 5.4 走查清单（一次跑完，逐条对人）

| # | 核对 | 命令 / 位置 | 期望 |
| --- | --- | --- | --- |
| 1 | 命中 / 导航唯一实现 | `git diff -- pix/src/renderer/utils/outline-notes.ts` | 只有新增块；`buildChapterRanges` / `countNotesByChapter` / `collectPreorder` 零 diff |
| 2 | 组件消费（正向） | `grep -rnE "buildChapterRanges\(\|resolveCurrentChapter\(\|resolveChapterNav\(" pix/src/renderer/components/` | 命中含 `PdfViewer.vue` |
| 3 | 组件内无第二份区间比较（反向） | `grep -rnE "\.(start\|end)[[:space:]]*(<=\|>=\|<\|>)" pix/src/renderer/components/` | 命中 ⊆ {`KnowledgeMap.vue:167`（注释）/`:169` /`:174`、`PdfSearchPanel.vue:268`}（与 §1.1.6 #3 逐字一致；`:173` 是 `function isRead(...)` 签名行，**不含比较**） |
| 4 | 快捷键唯一注册点 | `grep -c 'addEventListener("keydown"' pix/src/renderer/components/workspace/PdfViewer.vue` | `1` |
| 5 | 新分支落点 | `grep -n 'event.key === "\["' …` | 恰 1 处，行号 ∈ (`:385` 守卫, `:393` `switch`) |
| 6 | `isEditableTarget` 唯一定义 | `grep -c "function isEditableTarget" …` | `1` |
| 7 | 跳转唯一写入点 | `grep -n "readerStore.gotoPage = " …` | 新增恰 1 处（`jumpToChapter` 内） |
| 8 | pill 模板零 diff | `git diff -- pix/src/renderer/components/workspace/PdfViewer.vue \| grep -n "page-label\|page-input\|pdf-page-indicator"` | 只允许插入点上下文行（`+++` 侧不出现 pill 内部改写） |
| 9 | 需要零 diff 的组件 / store | `git diff -- pix/src/renderer/stores pix/src/renderer/components/workspace/{ReaderPanel,KnowledgeMap}.vue` | 空 |
| 10 | 载荷面最小 | `git diff --stat -- pix/src/renderer/utils/reading-context.ts pix/src/renderer/components/workspace/ChatPanel.vue` | 分别为 `+7` 量级与 `1 insertion(+)`（以人工逐行确认为准） |
| 11 | 提示词最小 | `git diff --stat -- pix/src/main/reading-prompt.ts` | `1 insertion(+)`，单 hunk |
| 12 | 既有断言只追加 | `git diff -- pix/scripts/ui-shot.mjs \| grep -E "^[-]" \| grep -v "^---"` | 只允许 §2.2 四处（`:2829` / `:3673-3686` / `:3698`+`:3700` / `:3654` 就地等待）的相邻行位移；其中 `:3654` 处为**纯追加**；**不得**出现既有 `record(` / 既有 `capturePage(` / 既有 label 的删除 |
| 13 | `SEL` 恰 8 项 | `git diff -- pix/scripts/ui-shot.mjs \| grep -E "^\+.*(readerSection\|pageIndicator\|pageInput\|readerMain\|composerInput)"` | 恰 8 行 |
| 14 | package.json 最小 | `git diff -- pix/package.json` | 只有 `scripts` 一行的增补 |
| 15 | 零依赖 / 范围外零 diff | `git diff -- package-lock.json packages README.md pix/tsconfig.json` | 空 |
| 16 | 新脚本不进工程门 | `git diff -- pix/tsconfig.json pix/tsconfig.main.json pix/tsconfig.preload.json` | 空 |

---

## 6. 风险 Top3 与判定方式

**风险 1「命中或导航规则把用户指到错误的章节」**

- 触发面：并列取值写错（`hit` 用了 `>=`、`next` 用了 `<=`、`prev` 用了 `>`）；把「上一节」实现成 `start` 最小而非 `end` 最大；忘了域外守卫；用「预序最后命中」或「深度最小」替代冻结口径。
- 判定：烟测 `section-hit`（#1–#3 手写三页期望 + #4 恒在范围内 + #5 最大 `start` 复算 + #7 逆序书签不劫持）与 `section-nav`（#3 `end` 并列取最晚 + #4 两条不变量 + #6/#7 单节与早于第一节）+ `r12-1` 三页 chip 逐字（②⑥⑧）+ `r12-3` 三个跳转落页（①④⑦⑩⑪）+ 走查 §5.4 #1–#3。
- 失败信号：第 3 页 chip 显示 `3. Ablation Study` / `Appendix A.1` / `Appendix B`；第 2 页「上一节」跳到第 2 页之外的页；烟测 `section-hit` #3 或 `section-nav` #3 红。

**风险 2「新控件挤动既有控件 / 与 pill 重叠 / 铺满整宽」**

- 触发面：把章节控件塞进 `.pdf-page-indicator` 或 `.reader-header` 的 flex 行；用 `display: block` / `left: 0; right: 0` 铺满；`z-index` 过高抢指针；`bottom` 取值过小导致与 pill 重叠。
- 判定：`r12-1` ⑤（不相交 + 在上方 + 宽度 < viewer 宽 + 三个 `pointer-events`）+ `r12-2` ⑤（四选择器 ±1px 跨文档）+ §5.2 ①②③ + 7 张新截图逐张目视（§8）。
- 失败信号：`.page-label` 文本或矩形变化；`waitPage` 等待式失效；`containerRect.bottom > indicator.rect.y + 1`；`containerPointerEvents !== "none"`；既有 120 张 / 169 条出现缺失。

**风险 3「快捷键劫持输入或越界到框选模式」**

- 触发面：把 `[` / `]` 分支插到 `:385` 守卫**之前**（输入框内会跳页）；新增第二处 `keydown` 监听；改写既有七键位分支；漏掉 `captureMode` 自检。
- 判定：`r12-3` 的 `shortcut-guard-editable`（⑭ 后半句是硬判据 + ⑯ 的 `activeElement` 防空）与 `shortcut-guard-capture`（⑰ 模式内不生效 + ⑱ 退出后生效）+ 走查 §5.4 #4–#6 + 既有键位场景（`PageUp` / `PageDown` / `ArrowLeft` / `ArrowRight` / `Home` / `End` / `/` / `Ctrl+F` / `Escape`）全绿。
- 失败信号：输入框内派发后页码变化或取消编辑后页码变成 `第 2 / 3 页`；框选模式内页码变化；`grep` 出现第二处 `keydown` 监听；既有 Esc 场景（`r11-1` / `r11-2`）红。

**次级风险（不占 Top3，逐条登记并给判定）**

1. **就绪竞态**：页码可见早于章节派生（`:650-664` vs `:669-673`，`waitFor` 轮询 120ms）⇒ 四个新场景一律先 `waitSectionReady()` / `settleEmptyOutline()`；43 号既有场景用就地 `waitFor`（§2.2 第 4 行）；判定 = `r12-1`①⑥⑧、`r12-2`⑦、`r12-3`②⑤⑧、`r12-4`① 的红灯 **+ 43 号 `notes-context` record 的红灯**；若红灯出现在「控件尚未进 DOM」，先查是否漏了就绪等待，**不得**把断言放宽成「有空再判」。
2. **`settleEmptyOutline()` 的限额**：它只证明「地图已渲染空态」，不是「解析完成」的严格证明（§3 第 1 行）⇒ 判定 = `r12-2` ⑦ 的正向对照 + 跨文档往返必须绿；dev 档须按此口径留档。
3. **`r12-1` `invariance` 相位会改变中心栏宽度**（开关地图）⇒ 只判 chip 文本与容器存在性、**不判矩形**；判定 = ⑩ 的五次读数逐字节相等 + ⑫ 的两次 `zoomText` 读数（`110%` / `100%`）。
4. **`r12-3` `prev-jump` 的视觉幅度**：`2.1 Sparse mask budget` 的 `start = 2` 与当前页同为第 2 页的一步（3 → 2 是真实后退），按钮语义正确但视觉上只闪一下 ⇒ 已在 §1.1.4 表登记为预期行为，不得为此改判据。
5. **chip 的 `pointer-events: none` ⇒ 原生 tooltip 不弹**（§1.2.3 已登记）⇒ 判定 = 只判 `chipText === chipTitle`；若要 hover tooltip 需回改需求档 §0.5（超出本轮）。
6. **单次离屏运行时长上升**（+7 张截图 / +4 场景）⇒ 判定 = 若逼近超时，优先复用同一次 `sectionProbe()` 结果（不得删断言、不得降级为跳过）；实测耗时写入 dev 档。
7. **§2.2 的四处既有面改动**：若只改了一处（例如只改了 `:3698` 漏了 `:3700`），`missingLines` 的失败文案会与条件不一致；若漏了 `:3654` 的 43 号就地等待，新增 needle 会在 outline 未就绪时判红 ⇒ 判定 = 走查 §5.4 #12；四处改动必须逐字留档（旧值 / 新值），其中 43 号就绪等待是纯追加、不得顺手删除既有语句。
8. **`r12-2` ⑤ 的比较前提**：跨文档读数要求两端缩放同为 `100%` 且地图均关闭 ⇒ 判定 = ⑥ 的两次 `.page-label` 文本（证明换了文档）+ ⑫ 之外的 `zoomText` 字段；若几何差 > 1px 且可归因于页码文本长度（而非新控件），须逐项登记在 dev 档，**不得**静默放行。

**风险条数：3 条 Top + 8 条次级 = 11 条登记。**

---

## 7. 开发分工

### 7.1 建议 A / B 两面（白名单互不重叠）

| 面 | 白名单（6 + 2 = 8 个文件） | 内容 |
| --- | --- | --- |
| **A：纯函数 + 契约 + 烟测** | `pix/src/renderer/utils/outline-notes.ts`、`pix/src/renderer/utils/reading-context.ts`、`pix/src/renderer/components/workspace/ChatPanel.vue`、`pix/src/main/reading-prompt.ts`、`pix/scripts/smoke-view.mjs`（新建）、`pix/package.json` | N77（三个导出）、N79-3 的纯函数侧（`resolveChapterNav`）、N80（字段 + section 行 + 提示词 + 一行快照）、N81-1（新建烟测脚本 + 一键） |
| **B：UI + 离屏** | `pix/src/renderer/components/workspace/PdfViewer.vue`、`pix/scripts/ui-shot.mjs` | N78（控件 + computed + 样式）、N79-1/N79-2（按钮 + 快捷键分支 + `jumpToChapter`）、N81-2（`SEL` + helper（含 `clickEl`）+ 43 号就地等待 + 4 场景 + 16 条 record + 7 张截图 + §2.2 四处改动） |

**接口冻结（两侧必须逐字遵守）**

1. A 提供、B 消费：`resolveCurrentChapter` / `resolveChapterNav` / `formatChapterHeading` 三个导出（签名逐字见 §1.1.1）与 `ReadingSendContext.outline` 字段。
2. A **不得**改 `PdfViewer.vue` / `ui-shot.mjs`；B **不得**改 `outline-notes.ts` / `reading-context.ts` / `ChatPanel.vue` / `reading-prompt.ts` / `smoke-view.mjs` / `package.json`。
3. **落地顺序（冻结）**：**A 先落**（`npm run check` 绿 + `smoke:view` 连续两次绿）→ 再落 B。理由：B 的 `check` 依赖 A 的三个导出与 `outline` 必填字段存在；B 的 `r12-4` 字节断言依赖 A 的载荷实现。若并行，B 只能写模板 / 样式 / 场景骨架，**不得**在 A 落地前跑验收（`check` 会红、`r12-4` 会红，读数不可用）。
4. 两侧共用 `record` 语义与 `MANIFEST` / `MEASUREMENTS` 字段（零改动），无需额外接口。

### 7.2 备选：单代理（推荐当只有一名开发者时）

执行顺序（冻结）：

1. **动工前**：`npm run check`（`CHECK_EXIT=0`）+ §5.1 步骤 0b 的基线读数核对（120 / 169 / 37 / `null`）。
2. **N77**：`outline-notes.ts` 三处新增 → `npm run check`。
3. **N80**：`reading-context.ts` + `ChatPanel.vue` + `reading-prompt.ts` → `npm run check`。
4. **N81-1**：`smoke-view.mjs` 新建 + `package.json` 一键 → 连续两次 `npm run smoke:view` + 两项失败注入抽样（§5.3）。
5. **N78 / N79**：`PdfViewer.vue`（import → computed → `jumpToChapter` → 模板 → 样式 → 快捷键分支）→ `npm run check`。
6. **N81-2**：`ui-shot.mjs`（`SEL` 8 项 → 9 个 helper（含 `clickEl`）→ 43 号就地等待（§2.2 第 4 行）→ `r12-1` … `r12-4` → §2.2 其余三处既有面改动）。
7. **验收**：`PIX_SHOT_ROOT=<tmp>/pix-v05-r12-after` 实跑 → §5.2 零缺失比对（127 / 185 / 41 / `missing: []`）→ §8 的 7 张目视登记 → `r12-2` ⑤ 的 `delta` 人工复核。
8. **收尾**：`git status --short` 只出现白名单；`git add <具体路径>`（绝不 `git add .` / `-A`）。

**纪律**：只提交本会话改动的文件；不跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；不改白名单外任何文件；不引入或升级依赖；不改 `packages/**` 与 `package-lock.json`。

---

## 8. 视觉验收（新增 UI 的目视要点）

**新增 7 张截图（逐张目视登记，结论写入 `R12-dev.md`；登记模板：截图名 / 路径 / 观察项 / 结论）**

| 截图 | 观察项（逐条） | 预期 |
| --- | --- | --- |
| `r12-1-section-chip-page1.png` | chip 与 pill 的水平对齐（同一居中轴）、垂直间距（≈6–8px，不重叠）、禁用态箭头透明度、chip 文本完整可见 | 三页同框一致；`1. Abstract · 第 1 页` 逐字可读；prev 明显置灰 |
| `r12-1b-section-chip-page2.png` | 两按钮均可点（无灰化）、chip 文本随页更新 | `2. Method Overview · 第 2 页` |
| `r12-1c-section-chip-page3.png` | next 置灰、chip 文本更新、与 pill 仍不重叠 | `2.2 Positional prior · 第 3 页` |
| `r12-2-no-outline-degrade.png` | **整行不存在**（不出现空壳 / 占位高度 / 半截控件）；pill 位置与有书签文档帧一致 | 与 50c 同框对比：pill 位置与宽度无变化 |
| `r12-3-section-nav-after-next.png` | 点「下一节」后的页码与 chip | 第 2 / 3 页 + `2. Method Overview · 第 2 页` |
| `r12-3b-section-nav-shortcut-prev.png` | 快捷键结果与按钮结果视觉一致 | 第 1 / 3 页 + `1. Abstract · 第 1 页` |
| `r12-4-section-context-sent.png`（整窗） | 气泡文案为纯用户输入（`12：这一节的假设是什么？`，不带上下文行）、chip 行与页码 pill 布局正常 | 无重叠 / 无截断 |

**目视要点（冻结）**

1. **与既有控件的对齐**：`.reader-section` 与 `.pdf-page-indicator` 视觉同语系（同为 `border-radius: 999px` 的深色胶囊、同 `12px` / 白字 / `padding: 2px 6px` / `gap: 2px`）且**水平居中对齐**（同一 `left: 50%` + `translateX(-50%)` 轴）；垂直方向恒定在 pill 上方，间距目视约 6–8px，不遮挡 pill 的点击区。
2. **不与既有控件抢空间**：`.pdf-toolbar`（右上）与 `.pdf-capture-fab`（左下）在新控件出现 / 消失两帧中位置**逐像素一致**（判据 = `r12-2` ⑤ 的 `delta`）；长标题时容器按内容收缩并出现 `…` 省略号，chip 的 `title` 属性仍携带完整文本（hover 不弹 tooltip 属已登记后果）。
3. **窄栏下的表现**：打开知识地图（`r12-1` 相位 `invariance`）时中心栏变窄 ⇒ chip 应显示省略号而**不换行、不溢出**、不与 pill 或地图分隔线重叠；关地图后恢复完整文本。该相位只判文本（`textContent`）不判矩形。
4. **无 outline 时不占位**：`r12-2-no-outline-degrade.png` 中编号控件区域应与「有书签文档但章节控件被禁用」的形态**不同** —— 整行完全不存在（无空壳、无残影、无占位高度），页码 pill 与原基线帧一致；7 张图逐张确认无「非预期的控件重叠 / 截断 / 遮挡」。
5. **禁用态一致性**：首 / 末页的置灰箭头与既有 `.page-label` 两侧翻页按钮的置灰程度目视一致（`.v-btn--disabled` 同 `opacity: 0.45`）。
6. **图标区分度**：章节按钮用双箭头（`mdi-chevron-double-left` / `mdi-chevron-double-right`），与页码翻页的单箭头（`mdi-chevron-up` / `mdi-chevron-down`）在同一屏内可一眼区分。
7. **结论判红规则**：出现任何**非预期**差异（控件重叠、文字截断、按钮不可辨识、既有控件位移 > 1px）⇒ 记录截图路径 + 差异描述并停线排查；**不得**以「目视误差」结案（与 R11 §2.3 同纪律）。
8. **既有截图的内容变化（登记项）**：本轮新增控件会出现在所有含 `sample-paper.pdf` 阅读器画面的既有截图中 ⇒ dev 档按文档分类抽样登记（或逐张登记）并确认无「非预期的控件重叠 / 截断 / 遮挡」；§5.2 的零缺失判据只比 basename / label 集合，**不覆盖内容差异**，不得以「零缺失全绿」替代本项登记。

---

## 定稿修订（R12）

- 修订依据：`docs/pm/R12-review.md` 的「设计评审（R12）」must-fix 1–6（评审对象 = 本档）。本步**只改本档正文**（未跑离屏取证、未改任何源码）；技术性更正一律用真实文件内容与只读命令核实（核实读数见下）。
- 本步实跑（唯一工程门）：`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（输出仅 `> pix-read@0.1.0 check` 与 `vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit` 两条横幅）。
- 本步只读核实读数：`grep -n "const click = " pix/scripts/ui-shot.mjs` ⇒ 唯一命中 `:1062`（在 `runScenario` 内，`runReaderStateScenarios` 作用域不可见）；`grep -n "runReaderStateScenarios" pix/scripts/ui-shot.mjs` ⇒ `:1363`；43 号场景的 `await waitPage(2, 3);` 在 `:3654`（`awk 'NR>=3647 && NR<=3660'`）；`grep -n "message ===" pix/scripts/ui-shot.mjs` ⇒ `:538`（stub 内 `typeof command.message === "string"`）与 `:3642`；`grep -n "chapterRanges" pix/src/renderer/components/workspace/KnowledgeMap.vue` ⇒ `:48`；`grep -rnE "\.(start|end)[[:space:]]*(<=|>=|<|>)" pix/src/renderer/components/` ⇒ 恰 `KnowledgeMap.vue:167`（注释）/`:169`/`:174` + `PdfSearchPanel.vue:268`；`reader-store.ts:136-139` ⇒ `setScale` 两位取整；`PdfViewer.vue:730-732` / `:845` ⇒ `zoomBy` 与 `.zoom-label` 的 `Math.round(scale × 100)`。
- **处理 6 条 / 拒绝 0 条**；修订后本档自洽，判据集合不因修订减少。

| # | must-fix（设计评审摘要） | 处置 | 本档落点 |
| --- | --- | --- | --- |
| 1 | 43 号骨架硬断言追加 `section:` 之前缺就绪同步（竞态；会让既有断言假红） | **采纳（方案 a）**：保留 `:3698` / `:3700` 骨架列表的两处追加（与需求档 N81-2「各追加一条」一致），并在 `:3654` 后追加就地内联等待 `waitFor(…SEL.readerSection…)`；**不**调用 `waitSectionReady()`（后置 `const` 的 TDZ） | §0.2 修订 1 行、§1.6.1 末段、§2.2 新增第 4 行、§3 第 15 行、§4 第 6 行、§5.4 #12、§6 次级风险 1/7、§7.1 B 面、§7.2 步骤 6 |
| 2 | `invariance` ⑫ 空断言：两次点击后只读一次 `zoomText`，缩放未生效也全绿 | **采纳（第一种修法）**：放大点击后（缩小点击前）、`repaint(win)` 后增读 `zoomAfterIn` 并断言逐字 `110%`；缩小后 `zoomBack` 逐字 `100%`；`data` 增 `zoomAfterIn` | §1.6.2 相位 `invariance` 步骤 ④ / 断言 ⑫ / `data`；§6 次级风险 3 |
| 3 | §5.4 #3 行号集合 `{167/169/173}` 与实读不符（`:173` 是函数签名行，真实命中是 `:174`） | **采纳**：改为 `KnowledgeMap.vue:167`（注释）/`:169`/`:174` + `PdfSearchPanel.vue:268`，与 §1.1.6 #3 逐字一致 | §5.4 #3；§0.1 地图侧语义行同步改为「`:174` `isRead`（签名行 `:173`）」 |
| 4 | 新场景引用的 `click` 原语不在 `runReaderStateScenarios` 作用域；§1.6.4 把 Node 侧 `SEL` 写进页面字符串 | **采纳**：§0.3 / §1.6.1 冻结 `clickEl(selector)`（写法与 `:1062` 逐字同款）；§1.6.1 增「插值纪律」段；`r12-1` / `r12-3` 步骤全部改写为 `clickEl(...)`；§1.6.4 ② 改为 `JSON.stringify` 插值 | §0.3 两行（helper 名 9 项 + 点击原语）、§1.6.1、§1.6.2、§1.6.4、§4 第 6 行、§7.1、§7.2 |
| 5 | 三处文档级错误：(a) `runReaderStateScenarios` = `:1363`（非 1341）、`chapterRanges` = `:48`（非 `:64`）；(b) `ChapterRange` 类型 import 应独立一行、§1.2.5 #1 应写「import 两行」；(c) `max-width` 的宽度归因不准 | **采纳**：(a) §0.1 两处行号更正，helper 行号改为逐函数标注（`:1364-1391`）；(b) §1.2.2 冻结两行 import、§1.2.5 #1 改「import 两行」、§1.3.3 改「独立一行 `import type`」；(c) §0.3 宽度行与 §1.2.3 `max-width` 判据归因改为 `left: 50%` + `transform`（可用宽 = 50%·viewer） | §0.1、§0.3、§1.2.2、§1.2.3、§1.2.5 #1、§1.3.3、§4 第 4 行 |
| 6 | 登记项：既有截图内容会多出控件（零缺失判据不覆盖内容差异）；§0.1 的 `grep "message ==="` 措辞漏 `:538` 无关命中 | **采纳**：§5.2 与 §8 增「既有截图内容变化属预期，dev 档按文档分类抽样登记（或逐张登记）」；§0.1 与 §2.2 的 grep 措辞改为「载荷判据处仅 `:3642`；另 `:538` 为 stub 内无关命中」 | §5.2「既有截图的内容变化」段、§8 目视要点第 8 条、§0.1、§2.2 |
