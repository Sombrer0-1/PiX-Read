# PiX-Read R12 需求档 · 章节语义贯通（N77–N81）

> 上游：`docs/pm/PRD-V0.5.md` §1 断层 1（结构与阅读位置脱节：AI 不知道你在哪一节）、§2（R12 = 章节语义贯通：当前章节在阅读器可见、进 `<reading_context>`、可上一节/下一节跳转；无 outline 时全程静默降级）、§4（版本级反需求）、§5（工程红线：§5.1 唯一工程门、§5.2 禁 `any`/内联动态 import、§5.7 取证纪律与冻结字面变更登记、§5.8 依赖零改动、§5.9 离屏脚本是唯一 UI 基线、§5.10 无临时产物）、§7.2（结构语义贯通：阅读器能看出当前章节；可解析时 `<reading_context>` 含 section、不可解析时逐字节等于旧格式；上一节/下一节与翻页互不干扰；地图、阅读器、AI 三处来自同一份派生）。
> 依赖：`docs/pm/R9-*.md`（`buildChapterRanges` 唯一派生与 `.map-row.current` / `.map-row.read` 语义）、`docs/pm/R10-req.md` §0（`<reading_context>` 逐字格式与注入链路）、`docs/pm/R11-req.md` §0（Esc 语义与滚动来源判定、取证脚本契约、`smoke-notes.mjs` 范式）、`docs/pm/R11-dev.md`（R11 交付终态与基线读数）。
> 本轮唯一主线：**让「用户当前在第几节」这件事贯通三处** —— 阅读器可见（无需打开知识地图）、进入 `<reading_context>`、可上一节/下一节跳转；**无 outline 时全程静默降级**（不渲染控件、不注入行、快捷键零副作用）。
> 范围约束：不做 LLM 生成/推断章节结构（结构只来自 PDF 书签）；不改知识地图既有交互与视觉；不改 `notes.json`；不新增主进程 IPC（本轮 = 纯渲染层 + 提示词常量）。需求编号 **N77–N81**，共 **16** 个子条。

**判定工具（本档所有验收只能由这五种证据判定，逐条已标注）**

| 记号 | 含义 |
| --- | --- |
| 【走查】 | 只读代码与 `git status` / `git diff` / `git show`（只读可用）；含 `grep -c` 计数类判据 |
| 【check】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error（唯一工程门） |
| 【烟测-渲染】 | 纯函数离线烟测：**本轮新建仓库内可复跑脚本** `pix/scripts/smoke-view.mjs`（N81-1），编译 `pix/src/renderer/utils/*.ts` 到 `%TEMP%` 后断言 |
| 【烟测-主进程】 | 数据面烟测 `pix/scripts/smoke-notes.mjs`（R11 起可复跑）；**本轮不涉及**（主进程**数据面**零改动；唯一主进程改动是 `reading-prompt.ts` 的提示词常量，不经过本烟测），但必须继续可跑通（回归） |
| 【离屏】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + 既有截图/测量零缺失 + 新增断言组全绿 + 新增截图齐备 |

**本档事实基线（写档当天核对过的真实结果，供后续角色复核）**

| 事实 | 证据 |
| --- | --- |
| 工作树干净、分支 `main`、HEAD = `c16135d`（R11 已提交交付） | `git status --short` ⇒ 空；`git branch --show-current` ⇒ `main`；`git log --oneline -1` ⇒ `c16135d fix(reader): Esc 语义越界与摘录反馈可见性修复；取证自净与数据面烟测入口（V0.5 R11）` |
| 唯一工程门当前 0 error | 2026-09-16 实跑 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0` |
| R11 交付基线产物（R12 的零缺失比对基线） | 目录 `C:/Users/86157/AppData/Local/Temp/pix-v05-r11-lead`：`shots/MANIFEST.json` 的 `shots.length = 120`、`failure = null`；`shots/MEASUREMENTS.json` 为数组、长度 **169**、label 共 37 种（含 R11 五组：`r11-esc-scope:4` / `r11-quick-ask-scroll-scope:5` / `r11-undo-after-empty:3` / `r11-note-actions-narrow:3` / `r11-undo-scope-stale:1`） |
| 唯一区间派生点 | `pix/src/renderer/utils/outline-notes.ts`：`collectPreorder`（`:37`，全量预序，含未展开节点，键 `${parentKey}/${index}`）、`buildChapterRanges`（`:50`，只放**有页码节点**，`end` = 预序中第一个页码严格更大的节点页码 − 1，无后继取 `pageCount`，并 `Math.min(end, pageCount)` 钳制；`label` = `end > start` 时 `start-end`，否则 `start`）、`countNotesByChapter`（`:84`） |
| 地图侧「当前/已读」语义（R9 冻结，本轮不得改） | `KnowledgeMap.vue:168` `isCurrent(row) = row.range != null && row.range.start <= page && page <= row.range.end`；`:173` `isRead(row) = row.range != null && row.range.end < page`；`:82` 用户翻页时的自动滚动取 `currentRows[currentRows.length - 1]`（**最后一个** `.current` 行） |
| 注入链路（R8/R10 冻结） | `ChatPanel.vue:49-50`（`notesStore` / `readerStore`）、`:355-362`（发送瞬间快照：notes 副本 + `pageCount` / `selectedText`）、`:377`（`buildReadingUserMessage(text, readContext)`）；`reading-context.ts:77`（唯一组装函数）、`:80-96`（逐字行序 `<reading_context>` / `path:` / `page:` / `pageCount:` / 可选 `selectedText:` / 可选 `reader_notes:` / `</reading_context>`） |
| 页码 pill 的真实类名与内容（不得误记为 `.pdf-page-pill`） | `PdfViewer.vue:922` 容器 `.pdf-page-indicator`（`v-if="readerStore.pageCount > 0"`）；`:943` 页码按钮 `.page-label` 文本逐字 `第 {page} / {pageCount} 页`（`title="点击输入页码"`）；两侧按钮 `title="上一页"` / `"下一页"`；编辑态为 `.page-input`（`:935`，`@keydown.enter.prevent` / `@keydown.esc.prevent`） |
| 键盘面（本轮新增快捷键的落点） | `PdfViewer.vue:341` `isEditableTarget`（`isContentEditable` / `INPUT` / `TEXTAREA` / `SELECT`）；`:356` `onWindowKeydown`（`:357-372` 修饰键早退、含 `:360-370` 的 `Ctrl+F` 分支；`:375` / `:380` Esc 两分支；`:385` 守卫 `pageCount <= 0 \|\| isEditableTarget(event.target)`；`:386-390` `/` 分支；`:393-414` `switch (event.key)`（`PageUp` / `ArrowLeft` / `PageDown` / `ArrowRight` / `Home` / `End`），函数收于 `:415`）；`:424` 唯一注册点 `window.addEventListener("keydown", onWindowKeydown)`；`:315` `gotoPage(pageNumber)` / `:306` `scrollToPage` |
| 跳页唯一通道 | `reader-store.ts`：`gotoPage`（写值后由 `PdfViewer` 消费，`:801-806` 的 watcher）、`requestJump` / `takePendingJump`；地图节点点击写 `readerStore.gotoPage`（`KnowledgeMap.vue:199-205`） |
| 系统提示词位置 | `pix/src/main/reading-prompt.ts:5` 逐字 `"Use pdf_outline for bookmarks and page numbers.",`；`:10` 逐字 `"Answer in the user's language.",`；`:11` `].join("\n")` |
| 夹具事实（离屏） | `ui-shot.mjs`：`SAMPLE_OUTLINE`（`:260`，3 页、8 节点，含**无页码节点** `Appendix A` 与**逆序书签** `Appendix B`（page 2、label `2-3`））；`SAMPLE_MAP_EXPECT`（`:230`，`read` 表：第 1 页 current 1 / 第 2 页 current 3 / 第 3 页 current 3）；`OLDER_PAGES`（`:212`，2 页 **无书签** ⇒ `getOutline()` 为空 ⇒ `readerStore.outline = []`，见 `PdfViewer.vue:669-673` 的 `outline?.length ? … : []`）；`LONG_BOOK_OUTLINE`（`:293`，20 章 × 10 节 × 1 子节，章/节/子节同页） |
| 新增场景挂载点 | `runReaderStateScenarios`（`ui-shot.mjs:1363`）末尾：函数体在 `:6728` 收口，最后一条语句是 `:6727` 的 `await restoreStandardSeed();` ⇒ 新场景追加在 `:6727` 之后、`:6728` 之前 |
| 既有载荷断言的形状（决定 N80 的破坏面） | 42d（`ui-shot.mjs:3642`）断言「无文档时载荷逐字等于输入」（与 `<reading_context>` 无关）；43（`:3673-3703`）用 `missingLines`（`:2953`，**包含式**）断言若干必需行 ⇒ **只增行不会破坏既有断言**；35（`:2829`）的 `confirmed35B` 是**模拟确认文本的夹具串**（锚点由发送时刻登记，见 `ChatPanel.vue:356-364`，不由该串解析），非断言 |

---

## 0. 定稿修订（R12）

本节是 `docs/pm/R12-review.md`「must-fix 清单」1–8 的逐条处置记录：**8 条全部处理，0 条整条不接受**；正文已按本节同步改动。凡涉及代码行号与计数的结论均按定稿日在当前工作树（HEAD `c16135d`）实读核对，与评审档给出的行号/计数有出入处以本节为准（第 7 条 (c) 即一例），处置性质不变。编号说明：本节是修订记录，不参与冻结契约编号；下文 §0.1–§0.6 与 §1–§9 的编号逐字不变（评审档与后续设计/开发档按此编号引用）。

1. **【就绪同步点】处理。** 在 §0.5 增「就绪同步」helper 并写入四个场景（r12-1 / r12-2 / r12-3 / r12-4）的前置与相位步骤：有书签文档 `waitSectionReady()`（等 `.reader-section` 进 DOM）；无书签文档 `settleEmptyOutline()`（`ensureMapOpen()` → 等 `.map-empty` + `.map-progress` → `closeMap()` → 等槽位退出）。理由：实读确认**页码派生先于章节派生**（`PdfViewer.vue:650` `setPageCount` → `:651` `measurePages` → `:664` `scrollToPage`；`:669` `getOutline` → `:671` `convertOutline` → `:673` `setOutline`），而 `waitFor` 的轮询间隔是 120ms（`ui-shot.mjs:1370-1378`，`sleep(120)` 在 `:1376`）⇒ 原前置在「控件已出现」与「控件缺席」两侧都可能在派生落地前读取。限额声明：`settleEmptyOutline()` 与既有 50c 场景同口径（`ui-shot.mjs:4159-4163`），只证明「地图已渲染空态」——`KnowledgeMap.vue:57` 的 `hasOutline = readerStore.outline.length > 0` 在加载窗口内同为假，故它**不是**「解析完成」的严格证明；`r12-2` 的缺席断言以同场景 `zero-displacement` 相位对 `sample-paper.pdf` 的正向对照（`waitSectionReady()` 后控件确在 DOM）与跨文档往返兜底，dev 档须按此口径留档。
2. **【N78-3 判据补全】处理。** `pillProbe()` 扩到四个选择器（`.pdf-page-indicator` / `.page-label` / `.pdf-toolbar` / `.pdf-capture-fab`），`r12-2` ⑤ 冻结为四选择器 `x/y/width/height` 逐字段差 ≤1px（附「两次 `.zoom-label` 均 `100%`」的比较前提）；`r12-1` ⑤ 增「在上方」判据（`section.bottom ≤ pill.top + 1`）；「只占内容宽度 / 不拦截选区」改为可判形式：容器宽度严格小于 `.pdf-viewer` 宽度、容器 computed `pointer-events === "none"`、两个按钮为 `"auto"`（chip 继承 `none`、不可交互）。理由：原判据只覆盖 pill，`.pdf-toolbar` / `.pdf-capture-fab` 整轮无几何判据；「只占内容宽度」无判据时，容器铺满整宽也能全绿。
3. **【N79-2 规则 3 措辞】处理（含行为差异登记）。** 规则 3 改写为：守卫沿用 `:385` 的两条（`pageCount <= 0`、`isEditableTarget(event.target)`）；`readerStore.captureMode` 由新分支自检；按钮 `disabled` 由「目标为 `null`」派生。并在 §0.2 新增第 6 条登记：既有七键位在框选模式下**仍生效**（`captureMode` 现仅拦 `Escape`，`PdfViewer.vue:375`），`[` / `]` 在框选模式下不生效——这是本轮**新增**的规则，不是既有语义。理由：原文「四条不生效条件全部复用既有判断」与真实代码不符（`:385` 的既有守卫只有两条），按字面实现会让 `r12-3` ⑰ 变红。
4. **【§0.3 理由① 事实错误】处理（改写理由；并列口径维持「预序最早」）。** 实读 `SAMPLE_OUTLINE`（`ui-shot.mjs:260`）按 `buildChapterRanges`（`outline-notes.ts:50`）复算：`sample-paper.pdf` 第 3 页的并列集 = `2.2 Positional prior`（`root/1/1`，预序第 4）/ `3. Ablation Study`（`root/2`，预序第 5）/ `Appendix A.1`（`root/2/0/0`，预序第 7），命中的是 child 行的 `2.2 Positional prior`，而 chapter 行的 `3. Ablation Study` 也在 in-range 集合内（`SAMPLE_MAP_EXPECT.read.page3.current = 3` 印证）⇒ 原文「预序最早者 = 该页最外层标题」只对第 2 页成立。已改为「并列取预序最早 = 书签文档顺序最靠前的一条；同一分支内祖先恒早于后代」，并明确这是**分支优先**而非**层级优先**。不采纳备选「深度最小」：它会把第 3 页命中改到 `3. Ablation Study`（需同步改 `smoke-view` `section-hit` #2/#3/#7、`r12-1` 第 2/3 页 chip 期望与 `r12-3` 跳转期望），且同页多个同深度 chapter 时仍需二级并列键；本轮维持冻结口径、期望值不变。
5. **【r12-4 前置与现场】处理。** `r12-4` 前置明文冻结「选区为空、选择集为空」及依据（`enterCleanWorkspace` → `goHome()`：`WorkspacePage.vue:235` `openDocument(null)`、`:239` `resetNotes()` → `notes-store.ts:287` `clearNoteSelection()`；`openRow` 再 `openDocument` 复位，`reader-store.ts:58` 清 `selectedText`）；两个相位的 `data` 各增 `selectedTextInPayload`（`payload.message.includes("selectedText:")`）与 `notesInPayload`（`reader_notes:` 是否出现 + 条目数）并断言为 `false` / `0`。理由：原前置只写在 §8 次级风险里，逐字节断言的前提不可现场核查。
6. **【主进程口径矛盾】处理。** 全文改为「主进程**数据面**零改动；`reading-prompt.ts` 为唯一主进程改动」：判定工具表「烟测-主进程」行、§1 N77-3 判据行、§5 N81-3 判据行。理由：`reading-prompt.ts` 属主进程，与「主进程零改动」字面冲突；数据面结论不受影响（`smoke-notes.mjs` 只驱动 `notes-store` / `library-root`，全仓库无脚本断言提示词文本，唯一引用点 `session-bridge.ts:1245`）。
7. **【计数 / 位置口径】处理（行号以实读为准）。** (a) `reading-prompt.ts` 实读为 8 个数组元素（行 2–7、9、10；行 8 是注释，文件共 11 行）⇒ 改为「数组元素 8 → 9；除 `:5` 之后的插入外零 diff，既有 8 个元素与顺序逐字不动；`].join("\n")` 仅行号后移（新 `:12`）、内容逐字不动」，N80-4 与白名单第 5 行同步改。(b) `section:` 恒为载荷**第 5 行**（`<reading_context>` / `path:` / `page:` / `pageCount:` 恒在其前），N80-2 的「第 4 行」改。(c) 键盘面实读行号：`/` 在 `:386-390`、`switch (event.key)` 在 `:393-414`、`onWindowKeydown` 收于 `:415` —— 评审建议值「`:393-417` / 函数收于 `:418`」与实读不符（多算 3 行），本档按实读值写。
8. **【签名与禁用写法闭合】处理。** N77-1 冻结三个新导出签名：`resolveCurrentChapter(ranges: Map<string, ChapterRange>, page: number, pageCount: number): ChapterRange | null`、`resolveChapterNav(ranges: Map<string, ChapterRange>, page: number, pageCount: number): { prev: ChapterRange | null; next: ChapterRange | null }`、`formatChapterHeading(range: ChapterRange): string`；「禁用写法」改为语义判据（正向：章节判定必须经 `outline-notes.ts` 的导出且 `PdfViewer.vue` 命中；反向：端点比较 `grep` 的命中集合 ⊆ 既有 `KnowledgeMap.vue:167/169/174` 与 `PdfSearchPanel.vue:268`（搜索分段，非章节））；白名单第 1 行补「允许按 `Map` 插入序遍历 `ranges`（顺序来源本身也是冻结面）」。理由：原档只冻结一个签名（`resolveChapterNav` / `formatChapterHeading` 的返回形状未定），且「`start <=` / `<= page` 形式」判据抓不住换名变量写法。

---

## 0. 冻结契约（设计档、开发档、评审档均不得改写）

### 0.1 本轮不得改写的既有冻结项

| 来源 | 冻结内容 | 本轮为什么不得动 |
| --- | --- | --- |
| R9 | 知识地图的判定与交互：`isCurrent` / `isRead` 的判定式与 CSS（`.map-row.current` / `.map-row.read`）、章节块与子行结构、`.page-badge` / `.note-count-badge` / `.map-progress`、节点点击写 `gotoPage`、翻页时的 `.current` 自动滚动（含最后一个 `.current` 行的取法） | 本轮只**读取**同一份 `ChapterRange`；地图侧的判定集合、行序、视觉与交互一律不变（PRD §7.2 要求三处同源，不要求地图增加新标记） |
| R10 | `<reading_context>` 既有行的**字面与顺序**（`<reading_context>` / `path:` / `page:` / `pageCount:` / `selectedText:` 块 / `reader_notes:` 块 / `</reading_context>`）、`selectNotesForContext` 的排序与两级裁剪、chips 与 chip 排除语义（排除文档 chip 时不输出上下文） | 本轮只在 `pageCount:` 之后**插入一行**（N80），既有行逐字不动；不可解析时整条载荷逐字节等于旧格式 |
| R11 | 笔记搜索框 Esc 的阻断冒泡（`NotesPanel.vue`）、浮层滚动来源判定（`PdfSelectionQuickAsk.vue` 的 `onStageScroll` 判定式与监听注册）、`ui-shot.mjs` 的启动守卫与产物自净/结束自检 | 本轮不碰这四处；`PdfViewer.vue` 的 Esc 两分支（`:375` / `:380`）与守卫顺序（`:385`）逐字不动（R11 §0.3 第 4 条的冻结面在 R12 继续有效） |
| R6 | 阅读现场（`reader-state.json` 的写入时机与 `MIN_SCALE` / `MAX_SCALE` / `DEFAULT_SCALE` 取值域） | 章节跳转只写 `readerStore.gotoPage`，不写现场文件、不改现场协议 |
| 全局 | 既有类名与文案：`.pdf-page-indicator` / `.page-label` / `.page-input` / `.zoom-label` / `.pdf-capture-fab` / `.quick-ask*` / `.notes-*` / `.map-*` / `.tree-*` / `.pill-*`；既有键位（`/` / `PageUp` / `PageDown` / `ArrowLeft` / `ArrowRight` / `Home` / `End` / `Ctrl+F` / `Escape` / 输入区 `Enter`） | 取证基线与断言面全部建立在这些字面与键位上 |

### 0.2 本轮显式改写的冻结面（逐条登记；设计/开发/评审档必须逐字引用本表）

| # | 项 | 旧口径 | R12 新口径 | 影响面与更新方式 |
| --- | --- | --- | --- | --- |
| 1 | 命中规则的并列（tie）取值 | 本轮需求草案**建议**「`start` 相同时取预序中**更晚**者」 | **取预序中最早者**（§0.3 的逐字定义） | 仅影响新函数与新控件；对既有代码/断言零影响。理由与夹具证据见 §0.3 末表；dev 档必须把两套口径在夹具上的差异逐页留档 |
| 2 | `<reading_context>` 的行集合 | R8/R10 的 7 行（含两个可选块） | **新增一行** `section: <标题> · 第 <label> 页`，位置固定在 `pageCount:` 之后、`selectedText:` 之前；不可解析时该行不出现 | 43 号载荷断言（`ui-shot.mjs:3673`）为包含式判据 ⇒ **既有行逐字保留、只追加一条必需行**（N81-2 冻结为 `section: 2. Method Overview · 第 2 页`）；35 号场景的夹具串 `confirmed35B`（`:2829`）按新格式**同步**（非断言，同步后仍逐字等于真实发送内容）；新增**逐字节**断言落在 `r12-4` 与 `smoke-view.mjs`（N81-1） |
| 3 | `ReadingSendContext` 字段集 | R10 冻结：`filePath` / `page` / `pageCount` / `selectedText` / `notes`（`notes` 必填、无默认值） | **新增第 6 个必填字段 `outline: ReaderOutlineNode[]`**（发送瞬间快照，不给默认值）；既有 5 个字段的名字、类型与必填性逐字不变 | 唯一调用点是 `ChatPanel.vue:377`；无默认值 ⇒ 漏传即 `npm run check` 报错（编译期护栏） |
| 4 | 页码 pill 的结构 | `.pdf-page-indicator`（上一页 / `.page-label` 或 `.page-input` / 下一页） | **零改动**：本轮不向 pill 内追加任何元素；章节控件是**独立容器** `.reader-section`（§0.5） | 因此 pill 相关既有判据（`clickNext` / `clickPrev` 的 `title` 选择器、`.page-label` 文本、`waitPage` 等待式）**全部逐字保留、无需更新**；`r12-1` / `r12-2` 只**追加**「pill 文本与矩形不变」的断言 |
| 5 | 章节的「页码范围」呈现 | 地图 `.page-badge` 显示 `label`（如 `2-3`） | chip 与 section 行按 `${title} · 第 ${label} 页` 呈现（**同一份渲染** `formatChapterHeading`） | 不触碰地图徽标；新增字面只落在新控件与上下文行 |
| 6 | 框选模式下的快捷键覆盖面 | 既有七个键位（`/` / `PageUp` / `PageDown` / `ArrowLeft` / `ArrowRight` / `Home` / `End`）在框选模式（`readerStore.captureMode === true`）下**仍然生效**（`captureMode` 现仅拦 `Escape`，`PdfViewer.vue:375`） | 本轮**新增**的 `[` / `]` 两键在框选模式下**不生效**（由新分支自检 `readerStore.captureMode`，见 N79-2 规则 3） | 既有七键位行为零改动（`:375` 的 Esc 分支不动）；差异只落在这两个新键位上；`r12-3` 的 `shortcut-guard-capture` 相位判定 |

### 0.3 N77 命中规则（逐字冻结）与夹具判定表

**定义（逐字）**

> 候选 = `buildChapterRanges(outline, pageCount)` 的**值序列**（`Map` 插入序 = 有页码节点的预序；这是唯一顺序来源，不得另建排序表）。
> **命中项 = 候选中满足 `start ≤ page` 且 `start` 最大的项；若有多项 `start` 相同，取该序列中最早出现者。**
> 返回该 `ChapterRange` 原样（`key` / `title` / `start` / `end` / `label` 五字段不二次改写）；无命中 ⇒ `null`。

**三条冻结性质（走查 + 烟测双判）**

1. **同源**：命中项恒为 `ranges` 中的同一对象（`ranges.get(hit.key) === hit`），不构造新对象、不重算区间。
2. **恒在范围内**：命中项恒满足 `start ≤ page ≤ end` —— 与地图 `isCurrent` 的判定条件同一集合，因此阅读器/上下文**永不**指向一个地图不认为是「当前」的章节。
3. **不依赖地图可见性**：地图的展开态（`.map-row` 是否在 DOM）不影响命中结果。

**与草案建议的差异（登记，见 §0.2 第 1 条）**

| 口径 | `sample-paper.pdf` 第 1 页 | 第 2 页 | 第 3 页 | `long-book.pdf` 第 1 页 |
| --- | --- | --- | --- | --- |
| 草案建议（同 `start` 取**更晚**者） | `1. Abstract` | `Appendix B` | `Appendix A.1` | `Note 01.10`（同页最后一个叶子节点） |
| **R12 冻结（同 `start` 取**最早**者）** | `1. Abstract` | **`2. Method Overview`** | **`2.2 Positional prior`** | **`Chapter 01`** |

理由（逐条，均为夹具可判事实）：① 同 `start` 并列时，**预序最早者 = 书签文档顺序最靠前的那一条**（同一分支内祖先恒早于后代出现），即**分支优先**而非**层级优先** —— 跨分支时它不保证层级最浅：`sample-paper.pdf` 第 3 页的并列集 = `2.2 Positional prior`（`root/1/1`）/ `3. Ablation Study`（`root/2`）/ `Appendix A.1`（`root/2/0/0`），命中 child 行的 `2.2 Positional prior`，而 chapter 行的 `3. Ablation Study` 同样落在 in-range 集合内（`SAMPLE_MAP_EXPECT.read.page3.current = 3` 印证）；不采纳「深度最小」备选（第 3 页会改命中 `3. Ablation Study`，且同页多个同深度 chapter 时仍需二级并列键），本轮维持「预序最早」；「更晚者」则会把命中推到同页更靠后的条目（第 2 页的逆序书签 `Appendix B`、第 3 页的 `Appendix A.1`、`long-book.pdf` 第 1 页的 `Note 01.10`）——对 AI 与用户都不是「你在哪一节」的好答案；② 逆序书签（`Appendix B`：预序靠后但 `start` 更小）**不会**劫持命中（第 3 页的候选里 `start` 最大是 3，`Appendix B` 的 `start = 2` 天然出局）；③ 两套口径的差异只在「同 `start` 并列」时出现，对单调轮廓（正常论文）逐页等价。

**不可解析（逐字冻结，六种情形一律 `null` 且不抛错、不写任何状态）**

| 情形 | 判据 |
| --- | --- |
| `pageCount ≤ 0` | 总页数未知（加载窗口 / 文本预览） |
| `ranges.size === 0` | 无 outline，或 outline 内**没有任何有页码节点**（全部 `page === null`） |
| `page` 非整数（含 `NaN`） | 不四舍五入、不钳制 |
| `page < 1` | 域外 |
| `page > pageCount` | 页越界（UI 侧 `setPage` 已钳制，此处为纯函数守卫） |
| （追加）所有候选的 `start > page` | 当前页早于第一节（典型：首页 / 封面 / 目录尚未到第一节）⇒ `null` |

### 0.4 N79 导航规则（逐字冻结）与边界表

**定义（逐字）**

> 候选同 §0.3。
> **下一节 = 候选中满足 `start > page` 的项里 `start` 最小者（`start` 相同取预序最早者）**；
> **上一节 = 候选中满足 `end < page` 的项里 `end` 最大者（`end` 相同取预序最晚者）**；
> 无满足项 ⇒ 对应方向为 `null`。域外（与 §0.3 同一守卫，含 `ranges.size === 0`）⇒ 两者皆 `null`。

**四条冻结性质（走查 + 烟测双判）**

1. `prev !== null ⇒ prev.end < page`（**上一节的目标页恒在当前页之前**，且 `prev.start < page`）。
2. `next !== null ⇒ next.start > page`（**下一节的目标页恒在当前页之后**）。
3. 两个方向**各自独立派生**，都不依赖命中项（因此「命中规则」与「导航规则」互不耦合；两者只共享 `ranges`）。
4. 只读 `ranges` 的 `start` / `end` 字段，不写任何状态、不抛错。

**边界与确定目标表（`sample-paper.pdf` 为判定夹具）**

| 当前页 | 命中（chip / section 行） | 上一节目标 | 下一节目标 | 说明 |
| --- | --- | --- | --- | --- |
| 第 1 页 | `1. Abstract · 第 1 页` | `null`（禁用） | `2. Method Overview`（第 2 页） | 第一节的上一节禁用；下一节 = `start` 最小的后继 |
| 第 2 页 | `2. Method Overview · 第 2 页` | `1. Abstract`（第 1 页） | `2.2 Positional prior`（第 3 页） | 双向都可跳，且都是**真实翻页** |
| 第 3 页 | `2.2 Positional prior · 第 3 页` | `2.1 Sparse mask budget`（第 2 页；`end` 并列取预序更晚者） | `null`（禁用） | 最后一节的下一节禁用 |
| 无 outline（`archive/older-paper.pdf`） | 不渲染、不注入 | `null` | `null` | 全程静默降级 |
| 单节且在节内 | 命中该节 | `null` | `null` | 单节禁用（无相邻节） |
| 单节且早于该节（如节 `start = 3`、当前页 1） | `null` | `null` | 该节（`start = 3`） | 「当前页不在任何章节内」也必须给出**确定目标** |

**跳转契约**：一律写 `readerStore.gotoPage = <目标>.start`（复用既有唯一跳页通道；由 `PdfViewer.vue:801-806` 的 watcher 消费）。**不得**调用 `scrollToPage`、不得新增跳页通道、不得改 `reader-store.ts`。

### 0.5 新增 UI 与取证字面（逐字冻结）

| 项 | 值 |
| --- | --- |
| 新容器类名 | `.reader-section`（宿主：`PdfViewer.vue` 的 `.pdf-viewer` 根节点内的绝对定位兄弟行，与 `.pdf-page-indicator` 同级、位于其**上方**（判据 `sectionRect.bottom ≤ pillRect.top + 1`）；**不进入任何 flex 布局流**；宽度按内容收缩且严格小于 `.pdf-viewer` 宽度（不得铺满整宽）；容器 `pointer-events: none`） |
| 新元素类名 | `.reader-section-chip`（`<span>`，无子元素，不可交互 ⇒ 继承容器的 `pointer-events: none`）、`.reader-section-prev` / `.reader-section-next`（`v-btn`，class 落到根 `button`；须显式 `pointer-events: auto`，否则真实指针不可点） |
| 按钮 `title`（逐字） | `上一节（快捷键 [）` / `下一节（快捷键 ]）` |
| 按钮图标（逐字） | `mdi-chevron-double-left` / `mdi-chevron-double-right`（与页码翻页的单箭头区分） |
| 元素顺序 | `.reader-section-prev` → `.reader-section-chip`（`v-if`） → `.reader-section-next` |
| 容器 `v-if` | 当且仅当「命中项 ≠ null **或** 上一节 ≠ null **或** 下一节 ≠ null」时渲染（三者皆 null ⇒ 不进 DOM、不留空位） |
| chip `v-if` | 当且仅当命中项 ≠ null；`title` 属性 = chip 文本逐字（视觉省略时 tooltip 仍完整） |
| 按钮 `disabled` | `:disabled="<目标> === null"`（禁用 ⇔ 目标为 null，一一对应） |
| 文本渲染（三处共用一份） | `formatChapterHeading(range)` = `${空白折叠 + trim 后的 range.title} · 第 ${range.label} 页`；chip 文本 / chip 的 `title` / `<reading_context>` 的 `section:` 行**逐字节相同** |
| 快捷键（逐字） | `[` = 上一节、`]` = 下一节（无修饰键；`event.key` 逐字比较） |
| 新 helper（离屏，语义冻结、命名自由） | `pressReaderKey(key)`：在 `document.body` 上派发 `new KeyboardEvent("keydown", { key, bubbles: true })`；`mapCurrentLabels()`：读全部 `.map-row.current` 的 `.label` 文本数组 |
| 新 helper（就绪同步，语义冻结、命名自由） | `waitSectionReady()`：`waitFor` 等 `SEL.readerSection` 进 DOM（**有书签文档**的唯一就绪点；无书签文档不得使用——永不出现会超时）；`closeMap()`：若 `SEL.mapSlot` 在 DOM 中则再点一次 `SEL.mapToggle` 并等 `.knowledge-map-slot` 退出 DOM（`ReaderPanel.vue:62` `showMap` 转假即卸载），不在 DOM 则直接返回（幂等）；`settleEmptyOutline()`：`ensureMapOpen()` → 等 `.map-empty` 与 `.map-progress`（与既有 50c 同口径，`ui-shot.mjs:4159-4163`）→ `closeMap()` → 等槽位退出（**只用于无书签文档**） |
| 新 helper（离屏探测） | `sectionProbe()`：一次 `js` 读 `{ containerInDom, chipInDom, chipText, chipTitle, prevDisabled, nextDisabled, containerRect, containerPointerEvents, prevPointerEvents, nextPointerEvents, viewerWidth }`（rect = `Math.round` 后的 `x/y/width/height`，与 `rectOfSelector` 同口径）；`pillProbe()`：一次 `js` 读四个选择器的 rect（`SEL.pageIndicator` / `.page-label` / `.pdf-toolbar` / `.pdf-capture-fab`）与文本（`.pdf-page-indicator` / `.page-label` / `.zoom-label`），返回 `{ indicator: { text, rect }, pageLabel: { text, rect }, toolbar: { rect }, captureFab: { rect }, zoomText }` |
| `SEL` 新增（逐字） | `readerSection: ".reader-section"`、`readerSectionChip: ".reader-section-chip"`、`readerSectionPrev: ".reader-section-prev"`、`readerSectionNext: ".reader-section-next"`、`pageIndicator: ".pdf-page-indicator"`、`pageInput: ".page-input"`、`readerMain: ".reader-main"`、`composerInput: ".input-area"` |
| 新场景名 | `r12-1`、`r12-2`、`r12-3`、`r12-4`（追加在 `ui-shot.mjs:6727` 之后、`:6728` 之前；每个场景自带复位，末态 `restoreStandardSeed()`） |
| 新 record 组与条数（冻结，不得减少） | `r12-section-visible` **5** / `r12-section-degrade` **2** / `r12-section-nav` **7** / `r12-section-context` **2** = **16 条** |
| 新截图（冻结，7 张） | `r12-1-section-chip-page1.png`、`r12-1b-section-chip-page2.png`、`r12-1c-section-chip-page3.png`、`r12-2-no-outline-degrade.png`、`r12-3-section-nav-after-next.png`、`r12-3b-section-nav-shortcut-prev.png`、`r12-4-section-context-sent.png` |

### 0.6 回归基线与新增配额

| 项 | R12 冻结口径 |
| --- | --- |
| 基线 | 动工前在**新目录**（`PIX_SHOT_ROOT=<临时目录>/pix-v05-r12-base`）实跑一次，读数即本轮唯一基线；R11 交付目录 `C:/Users/86157/AppData/Local/Temp/pix-v05-r11-lead`（120 张 / 169 条，本档已核对）作为交叉参考 |
| 零缺失判据 | 基线 `shots` 的 basename 集合 ⊆ 验收运行集合；基线 `MEASUREMENTS.json` 的 `label` 集合 ⊆ 验收运行集合（既有 37 种 label、169 条测量一条不少）；`MANIFEST.json.failure === null`、退出码 0 |
| 新增配额 | 截图 **7 张**、record **16 条**（4 组）；既有 120 张 / 169 条零缺失、零改写 |
| 允许的位移 | 只允许「新增绝对定位控件导致的位移」；**`.pdf-page-indicator` / `.page-label` / `.pdf-toolbar` / `.pdf-capture-fab` 的几何必须零位移**（`r12-2` ⑤ 用 `pillProbe()` 的四选择器跨文档读数 + `±1px` 逐字段差判据兜底）；`w/h/fontSize/color/background` 不得出现非预期差异；任何偏差必须逐项登记在 dev 档，不得静默 |
| 内容目视比对 | 新增 7 张截图必须在 dev 档逐张登记结论（是否出现非预期的控件重叠 / 截断 / 遮挡）；新增控件不得与 `.pdf-page-indicator` 重叠（`r12-1` 判据⑤）；`.quick-ask` 浮层只在有选区时出现，由既有 06/07 场景的目视覆盖，本轮不新增其断言 |
| 烟测回归 | `pix/scripts/smoke-notes.mjs`（26 条）与新建 `pix/scripts/smoke-view.mjs`（29 条）都必须可复跑且全绿（退出码 0） |

---

## 1. N77 当前章节的单一派生

**用户可见行为**：不打字、不点按钮也能确定「用户当前在第几节」—— 阅读器的章节 chip、`<reading_context>` 的 section 行、对话与地图三处对「当前章节」的答案来自**同一份派生**（同一函数、同一份 `ChapterRange`）；无 outline 或页码不可解析时答案不存在（`null`），系统安静降级。

### N77-1 唯一实现与签名

**逐字冻结字面**

| 项 | 值 |
| --- | --- |
| 落点 | `pix/src/renderer/utils/outline-notes.ts`（唯一派生点；组件内不得出现任何区间比较） |
| 新导出（逐字签名） | `export function resolveCurrentChapter(ranges: Map<string, ChapterRange>, page: number, pageCount: number): ChapterRange \| null` |
| 新导出（逐字签名） | `export function resolveChapterNav(ranges: Map<string, ChapterRange>, page: number, pageCount: number): { prev: ChapterRange \| null; next: ChapterRange \| null }` |
| 新导出（逐字签名） | `export function formatChapterHeading(range: ChapterRange): string`（返回值 = `${空白折叠 + trim 后的 range.title} · 第 ${range.label} 页`，chip / chip `title` / section 行三处共用） |
| 顺序来源 | `ranges.values()` 的**插入序**（= `buildChapterRanges` 的预序遍历序）；不得另建排序/过滤表 |
| 返回 | `ranges` 中的同一对象（`ChapterRange`：`key` / `title` / `start` / `end` / `label`）；不做字段改写 |
| 禁用写法 | 组件层不得出现第二份区间算法：章节判定必须经 `outline-notes.ts` 的导出（`buildChapterRanges` / `resolveCurrentChapter` / `resolveChapterNav`），不得内联 `ChapterRange` 的 `start` / `end` 与页码的比较。判据（可跑）：① 正向 `grep -rnE "buildChapterRanges\(\|resolveCurrentChapter\(\|resolveChapterNav\(" pix/src/renderer/components/` 必须命中 `PdfViewer.vue`；② 反向 `grep -rnE "\.(start\|end)[[:space:]]*(<=\|>=\|<\|>)\|(<=\|>=\|<\|>)[[:space:]]*[a-zA-Z_.]*\.(start\|end)" pix/src/renderer/components/` 的命中集合必须 ⊆ 既有的 `KnowledgeMap.vue:167`（注释）/ `:169`（`isCurrent`）/ `:174`（`isRead`）与 `PdfSearchPanel.vue:268`（搜索分段区间，非章节）；任何其它新增命中即判红 |

### N77-2 命中规则

逐字定义与三条冻结性质见 §0.3；夹具判定表（含与草案建议的差异对照）见 §0.3。

### N77-3 不可解析与总不变量

六种 `null` 情形见 §0.3 表；**总不变量**：返回值非 `null` 时恒有 `start ≤ page ≤ end`（对 `pageCount > 0` 且 `1 ≤ page ≤ pageCount` 的整个定义域成立）。

**验收判据**

| 面 | 判据 |
| --- | --- |
| 【走查】 | `outline-notes.ts` 新增导出恰 2 个（`resolveCurrentChapter` + N79 的 `resolveChapterNav`）与 1 个文本渲染（`formatChapterHeading`）；`buildChapterRanges` / `countNotesByChapter` / `collectPreorder` **零 diff**（`git diff` 只显示新增块）；无新依赖 import；无 `any` |
| 【check】 | `CHECK_EXIT=0` |
| 【烟测-渲染】 | 组 `section-hit`（8 条）与 `section-null`（8 条）全绿；其中「恒在范围内」不变量对夹具 1..pageCount 每一页判定一次 |
| 【离屏】 | `r12-section-visible` 的 chip 文本在三个页面上逐字命中 §0.3 的期望值（见 N78 场景表） |
| 【烟测-主进程】 | 不涉及（主进程**数据面**零改动；唯一主进程改动是 `reading-prompt.ts` 的提示词常量，不经过数据面烟测） |

**文件白名单条目**：`pix/src/renderer/utils/outline-notes.ts`（修改：新增 `resolveCurrentChapter`，文件头注释按 R12 口径补一句「章节命中与导航也来自本文件的同一份 ranges」）。

---

## 2. N78 阅读器可见

**用户可见行为**：在 PDF 阅读器里**无需打开知识地图**就能看出「我现在在哪一节」：底部页码 pill 上方出现一行章节控件（上一节 · 章节标题 + 页码范围 · 下一节）；翻页、切换文档、缩放、开关面板时它实时一致；文档没有书签时，这一行完全不存在（不出现空壳、不占位、不残留半截控件）。

### N78-1 控件与字面

字面与结构见 §0.5；chip 文本 = `formatChapterHeading(命中项)`；`sample-paper.pdf` 的三页期望（逐字）：

| 页 | chip 文本（逐字） | `title` 属性 | prev | next |
| --- | --- | --- | --- | --- |
| 1 | `1. Abstract · 第 1 页` | 同文本 | `disabled` | 可点 |
| 2 | `2. Method Overview · 第 2 页` | 同文本 | 可点 | 可点 |
| 3 | `2.2 Positional prior · 第 3 页` | 同文本 | 可点 | `disabled` |

### N78-2 实时一致（翻页 / 切文档 / 缩放 / 面板开关）

**逐字冻结字面**

| 项 | 冻结 |
| --- | --- |
| 派生方式 | chip 与两个按钮的可用性全部来自 computed（依赖 `readerStore.outline` / `page` / `pageCount`）；**不得**用 `ref` 缓存命中结果、不得在 `watch` 里做增量修补 |
| 翻页 | 页码变化后 chip 文本立即等于新页的期望值（同一次渲染周期内；判据 = `waitPage` 之后读到的文本逐字相等） |
| 切换文档 | 换到无书签文档 ⇒ 容器退出 DOM；换回 ⇒ 恢复（不残留旧文档的章节） |
| 缩放 | 放大 / 缩小不改变 chip 文本与容器存在性（缩放不改页码） |
| 面板开关 | 知识地图开/关、左栏「资料库 / 笔记」标签切换不改变 chip 文本与按钮可用性 |
| 不新增状态 | `reader-store.ts` 零 diff（不得为 chip 新增字段） |

### N78-3 零占位、不截断与不位移

| 项 | 冻结判据 |
| --- | --- |
| 零占位 | 命中、上一节、下一节三者皆 `null` 时 `.reader-section` **不在 DOM**（不是 `display:none`、不是空容器、不留占位高度） |
| 不截断关键信息 | chip 的 DOM 文本必须是完整标题 + 页码标签（CSS 允许单行省略号，但 `title` 属性必须携带同一完整文本；判据 = `textContent` 与 `title` 属性逐字相等且等于期望串） |
| 不位移既有控件 | `.pdf-page-indicator` / `.page-label` / `.pdf-toolbar` / `.pdf-capture-fab` 四个选择器的 `x/y/width/height` 在「有书签文档（控件在）」与「无书签文档（控件不在）」两次读数下逐字段差 ≤ 1px；判据 = `r12-2` ⑤ 的 `pillProbe()` 四选择器读数（比较前提：两次 `.zoom-label` 均逐字 `100%`，缩放不同则几何不可比） |
| 不重叠与只占内容宽度 | ① `.reader-section` 与 `.pdf-page-indicator` 矩形不相交**且在其上方**（`sectionRect.bottom ≤ pillRect.top + 1`）；② 容器宽度严格小于 `.pdf-viewer` 宽度（不得铺满整宽）；③ 容器 computed `pointer-events === "none"` 且 `.reader-section-prev` / `.reader-section-next` 均为 `"auto"`（不引入拦截选区的透明层；chip 继承 `none`、不可交互）；判据 = `r12-1` ⑤ 与 `sectionProbe()` 的现场字段 |
| 允许的位移登记 | 若实现需要微调上述任一几何，dev 档必须逐项登记（改哪一项、为什么、基线读数与改后读数） |

**验收判据**

| 面 | 判据 |
| --- | --- |
| 【走查】 | `PdfViewer.vue` 的 diff 只含：新 computed（3 项）、新模板块（`.reader-section`）、N79 的快捷键分支块、样式（含容器 `pointer-events: none` 与两按钮 `auto`）；`.pdf-page-indicator` 内部模板**零 diff**（§0.2 第 4 条）；`reader-store.ts` / `ReaderPanel.vue` / `KnowledgeMap.vue` 零 diff |
| 【check】 | `CHECK_EXIT=0` |
| 【离屏】 | 组 `r12-section-visible`（5 条，场景 `r12-1`）+ `r12-section-degrade`（2 条，场景 `r12-2`）全绿；4 张截图齐备（3 张逐页 chip + 1 张降级） |
| 【离屏·零缺失】 | 既有 120 张截图 / 169 条 label 零缺失（§0.6） |

**场景 `r12-1`（组 `r12-section-visible`，5 条 record）**

前置：`enterCleanWorkspace(seedNotes())` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 3)` → `waitSectionReady()`（有书签文档的就绪点：等 `.reader-section` 进 DOM；页码可见早于章节派生，见 §0.5 与定稿修订第 1 条）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `page-1` | `sectionProbe()` + `pillProbe()` → 截图 `r12-1-section-chip-page1.png`（`rectOfSelector(SEL.readerMain)`） | ① `.reader-section` 与 `.reader-section-chip` 都在 DOM；② chip 文本与 `title` 属性逐字 `1. Abstract · 第 1 页`；③ `.reader-section-prev` 的 `disabled === true`、`.reader-section-next` 的 `disabled === false`；④ `.page-label` 文本仍逐字 `第 1 / 3 页`（既有控件未被破坏）；⑤ `.reader-section` 与 `.pdf-page-indicator` 矩形不相交且在其上方（`section.bottom ≤ pill.top + 1`）、容器宽度 < `.pdf-viewer` 宽度、容器 `pointer-events === "none"` 且两按钮为 `"auto"` | `{ phase, section, pill, overlap }` |
| `page-2` | `clickNext()` → `waitPage(2, 3)` → `sectionProbe()` → 截图 `r12-1b-section-chip-page2.png` | ⑥ chip 文本逐字 `2. Method Overview · 第 2 页`；⑦ 两个按钮都可点（`disabled === false`） | `{ phase, section }` |
| `page-3` | `clickNext()` → `waitPage(3, 3)` → `sectionProbe()` → 截图 `r12-1c-section-chip-page3.png` | ⑧ chip 文本逐字 `2.2 Positional prior · 第 3 页`；⑨ `.reader-section-next` 的 `disabled === true`（最后一节的下一节禁用） | `{ phase, section }` |
| `invariance` | ① 记 `chipText`；② `ensureMapOpen()`（已开时不得再点，`ui-shot.mjs:4825` 范式）→ 等 `.map-row.current` 就绪（`countOf(".map-row.current") === 3`，第 3 页的 in-range 集合）→ 记 `chipText` 与 `currentLabels = mapCurrentLabels()`；③ `closeMap()`（幂等）→ 记 `chipText`；④ 点 `title="放大"` 再点 `title="缩小"`（缩放一拍）→ 记 `chipText` 与 `.zoom-label`；⑤ `openNotesPanel(4)`（切「笔记」标签）再切回资料库标签 → 记 `chipText` | ⑩ 五次读数的 chip 文本**逐字节相等**且都等于 `2.2 Positional prior · 第 3 页`；⑪ 容器全程在 DOM（面板开关不影响可见性）；⑫ 缩放后 `.zoom-label` 回到逐字 `100%`（防空断言：证明缩放确实发生过）；⑬ **地图同源**：`.map-row.current` 的 `.label` 集合包含 chip 的标题 `2.2 Positional prior` 与逆序书签 `Appendix B`（两者都在地图的 in-range 集合内；chip 取其中「`start` 最大且预序最早」的一个） | `{ phase, readings: [...], zoomBack, currentLabels }` |
| `page-input` | ① 点 `.page-label` 进编辑态 → 用原生 setter 把 `.page-input` 写成 `99` + `input` 事件 → 派发 `Enter`；② 读 `sectionProbe()` 与 `.page-label`；③ 再点 `.page-label` → 写成 `2` + `Enter` → `waitPage(2, 3)` → 读 `sectionProbe()` | ⑭ 越界页码 `99` 提交后：页码仍为 `第 3 / 3 页`、chip 仍逐字 `2.2 Positional prior · 第 3 页`（既有钳制语义 + 章节不漂移）；⑮ 提交合法页码 `2` 后 `waitPage(2, 3)` 成立、chip 逐字 `2. Method Overview · 第 2 页`（chip 与页码同步） | `{ phase, afterOutOfRange: {...}, afterValid: {...} }` |

**场景 `r12-2`（组 `r12-section-degrade`，2 条 record）**

前置：`enterCleanWorkspace(seedNotes())` → `openRow("older-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 2)` → `settleEmptyOutline()`（无书签文档的就绪点：`ensureMapOpen()` → 等 `.map-empty` + `.map-progress` → `closeMap()` → 等 `.knowledge-map-slot` 退出；与既有 50c 同口径）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `no-outline` | `sectionProbe()` → `pressReaderKey("]")` → `pressReaderKey("[")` → 复读 `sectionProbe()` 与 `.page-label` → 截图 `r12-2-no-outline-degrade.png`（`rectOfSelector(SEL.readerMain)`） | ① `.reader-section` 与 `.reader-section-chip` 都**不在 DOM**（零占位；就绪前提 = 前置 `settleEmptyOutline()` 已把「空 outline 已落地」钉住，见定稿修订第 1 条的限额声明）；② 两次快捷键派发后 `.page-label` 仍逐字 `第 1 / 2 页`（无目标 ⇒ 零副作用）；③ `.reader-section` 仍不在 DOM；④ `notesHash()` 不变 | `{ phase, section, pageTextBefore, pageTextAfter, hashSame }` |
| `zero-displacement` | ① 读 `pillProbe()`（无书签文档，在前置 `settleEmptyOutline()` 之后）→ ② `openRow("sample-paper.pdf")` → `waitPage(1, 3)` → `waitSectionReady()` → 复读 `pillProbe()`（章节控件在）→ ③ 逐字段比较 → ④ `openRow("older-paper.pdf")` → `waitPage(1, 2)` → `settleEmptyOutline()` → `sectionProbe()`（回到基准文档） | ⑤ `.pdf-page-indicator` / `.page-label` / `.pdf-toolbar` / `.pdf-capture-fab` 四个选择器的 `x/y/width/height` 两次读数逐字段差 ≤ 1px（跨文档：控件不在 vs 控件在；前提 = 两次 `.zoom-label` 均逐字 `100%`）；⑥ 防空断言：两次 `.page-label` 文本分别为逐字 `第 1 / 2 页` 与 `第 1 / 3 页`（证明确实换了文档）；⑦ 章节控件的存在性随文档切换往返：`sample-paper.pdf` 上 `.reader-section` 在 DOM，切回并 `settleEmptyOutline()` 后不在 DOM（缺席断言不再空转） | `{ phase, pillWithout, pillWith, delta, pageTexts, sectionAfterReturn }` |

**文件白名单条目**：`pix/src/renderer/components/workspace/PdfViewer.vue`（修改：新增控件与 computed、样式）；`pix/scripts/ui-shot.mjs`（新增场景、`SEL` 与 helper）。

---

## 3. N79 章节导航

**用户可见行为**：在阅读器里点「上一节 / 下一节」（或按 `[` / `]`）就能在章节之间跳转；到了第一节的上一节、最后一节的下一节时按钮置灰；文档没有书签或只有一节时按钮置灰；在输入框里打字或处于框选模式时，快捷键一律不生效。

### N79-1 两个按钮

字面见 §0.5；两个方向的目标来自 `resolveChapterNav`（签名见 N77-1 表）；跳转 = `readerStore.gotoPage = <目标>.start`；`disabled ⇔ 目标 === null`（一一对应，无第三种状态）。

### N79-2 快捷键与冲突规则（逐字冻结）

| # | 规则（逐字） |
| --- | --- |
| 1 | 键位：`[` = 上一节、`]` = 下一节（`event.key` 逐字比较；**不得**引入带修饰键的组合，不得改既有 `Ctrl/Alt/Meta` 早退分支） |
| 2 | 落点：`PdfViewer.vue` 既有 `onWindowKeydown` 内、`:385` 守卫（`pageCount <= 0 \|\| isEditableTarget(event.target)`）**之后**、既有 `switch (event.key)`（`:393-414`）**之前**新增一个独立分支块；**不得**新增第二处 `addEventListener("keydown"`，不得删除/改写既有七个键位分支 |
| 3 | 不生效条件（分两类，互不混同）：**沿用 `:385` 的既有守卫两条**（`readerStore.pageCount <= 0`；`isEditableTarget(event.target)` 为真——输入框/文本域/下拉/`contenteditable`）；**本轮新增两条**（`readerStore.captureMode === true` 由新分支自检；目标为 `null` ⇔ 按钮 `disabled`，由 `resolveChapterNav` 的返回值派生）。注：`captureMode` 屏蔽是本轮为 `[` / `]` 引入的**新行为**（`captureMode` 现仅拦 `Escape`，`PdfViewer.vue:375`），不得写成「复用既有语义」——既有七键位在框选模式下仍生效（§0.2 第 6 条） |
| 4 | 生效时的副作用：恰为 `event.preventDefault()` + `readerStore.gotoPage = <目标>.start`（**不**改 `page` / `pageCount` / `outline` / 缩放 / 现场文件） |
| 5 | 目标为 `null` 时不 `preventDefault`、零副作用（不发 IPC、不写状态） |
| 6 | 快捷键与按钮**同源**：同一页上二者计算出的目标 `start` 必须相等（判据在 `r12-3` 与烟测的 `section-nav` 组同时覆盖） |

### N79-3 边界与确定目标

边界与确定目标见 §0.4 表；四条冻结性质见 §0.4。**「当前页不在任何章节内」时必须给出确定目标**：早于第一节 ⇒ 上一节禁用、下一节 = 第一节；无 bookmarks / 单节内 ⇒ 两者皆禁用。

**验收判据**

| 面 | 判据 |
| --- | --- |
| 【走查】 | `addEventListener("keydown"` 仍恰 1 处（`:424`）；新增分支块位于 `:385` 守卫之后、`switch` 之前；`isEditableTarget` 仍恰 1 个定义（无第二份）；`grep -c "readerStore.gotoPage = "` 的新增命中恰 1 处（跳转复用既有通道）；`reader-store.ts` 零 diff |
| 【check】 | `CHECK_EXIT=0` |
| 【烟测-渲染】 | 组 `section-nav`（8 条）全绿：三条夹具（`SAMPLE_LIKE` / `CHAIN` / 单节）的目标与两条不变量逐条命中 |
| 【离屏】 | 组 `r12-section-nav`（7 条，场景 `r12-3`）全绿 + 2 张截图 |
| 【离屏·既有键位回归】 | 既有场景里依赖 `PageUp` / `PageDown` / `ArrowLeft` / `ArrowRight` / `Home` / `End` / `/` / `Ctrl+F` / `Escape` 的断言全部继续绿（零缺失判据的子集） |

**场景 `r12-3`（组 `r12-section-nav`，7 条 record）**

前置：`enterCleanWorkspace(seedNotes())` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 3)` → `waitSectionReady()`（有书签文档的就绪点，见 §0.5）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `next-jump` | 点 `SEL.readerSectionNext` → `waitPage(2, 3)` → `sectionProbe()` → 截图 `r12-3-section-nav-after-next.png` | ① `.page-label` 逐字 `第 2 / 3 页`；② chip 文本逐字 `2. Method Overview · 第 2 页`；③ 两按钮都可点 | `{ phase, pageText, section }` |
| `next-last-disabled` | 点 `SEL.readerSectionNext` → `waitPage(3, 3)` → `sectionProbe()` | ④ 页码逐字 `第 3 / 3 页`；⑤ `.reader-section-next` 的 `disabled === true`；⑥ `.reader-section-prev` 的 `disabled === false` | `{ phase, pageText, section }` |
| `prev-jump` | 点 `SEL.readerSectionPrev` → `waitPage(2, 3)` → `sectionProbe()` | ⑦ 页码逐字 `第 2 / 3 页`（上一节目标 = `2.1`（start 2）⇒ 真实后退一页）；⑧ chip 逐字 `2. Method Overview · 第 2 页` | `{ phase, pageText, section }` |
| `shortcut-next` | 点 `title="上一页"` → `waitPage(1, 3)` →（防空断言：`.reader-section-prev.disabled === true`）→ `pressReaderKey("]")` → `waitPage(2, 3)` | ⑨ 派发前确在第 1 页且上一节禁用（防空断言）；⑩ 派发后落第 2 页、chip 逐字 `2. Method Overview · 第 2 页`（与按钮同目标） | `{ phase, before, after }` |
| `shortcut-prev` | `pressReaderKey("[")` → `waitPage(1, 3)` → 截图 `r12-3b-section-nav-shortcut-prev.png` | ⑪ 落第 1 页；⑫ chip 逐字 `1. Abstract · 第 1 页`；⑬ `.reader-section-prev.disabled === true` | `{ phase, pageText, section }` |
| `shortcut-guard-editable` | ① 点 `.page-label` → `waitFor(SEL.pageInput)` → 在 `.page-input` 上派发 `]` → 读 `.page-input` 的 `value` → 派发 `Escape` 取消编辑 → 读 `.page-label`；② 聚焦 composer（`.input-area`）→ 在其上派发 `]` → 读 `.page-label` 与 chip | ⑭ 页码输入框内派发后 `value` 仍逐字 `1`（未被快捷键改动），取消编辑后 `.page-label` 仍逐字 `第 1 / 3 页`；⑮ composer 内派发后 `.page-label` 仍逐字 `第 1 / 3 页`、chip 仍逐字 `1. Abstract · 第 1 页`（`isEditableTarget` 口径生效）；⑯ 防空断言：两次派发时 `document.activeElement` 的 `tagName` 分别为 `INPUT` 与 `TEXTAREA` | `{ phase, targets, pageInputValue, pageText, section }` |
| `shortcut-guard-capture` | ① 点 `SEL.captureFabBtn` 进框选模式（`waitFor(SEL.captureLayer)`）→ 派发 `]` → 读 `.page-label`；② `pressBodyEsc()` 退出框选模式 → 派发 `]` → `waitPage(2, 3)` | ⑰ 框选模式内派发后页码仍 `第 1 / 3 页`（守卫生效）；⑱ 退出后同一按键落第 2 页（证明守卫只在模式内生效，不是按键被吞） | `{ phase, inCapture, afterExit }` |

**文件白名单条目**：`pix/src/renderer/components/workspace/PdfViewer.vue`（修改：新增快捷键分支块 + 两个按钮）；`pix/scripts/ui-shot.mjs`（新增场景与断言组）。

---

## 4. N80 上下文注入

**用户可见行为**：向 agent 提问时，只要当前文档有书签且当前页可解析，agent 就会在阅读上下文里看到一行 `section:`（标题 + 页码范围）；文档没有书签、或页码不可解析时，载荷**逐字节**与 R11 之前完全一致（agent 不会看到任何空行或占位）。

### N80-1 契约字段

`ReadingSendContext` 新增必填字段 `outline: ReaderOutlineNode[]`（§0.2 第 3 条）；`ChatPanel.vue` 在既有 `readContext` 对象字面量内新增 `outline: readerStore.outline`（同一次发送快照；不深拷贝、不新增第二次读取窗口）。

### N80-2 section 行的格式与位置

| 项 | 冻结 |
| --- | --- |
| 行名 | `section: `（前缀逐字，冒号后一个空格） |
| 值 | `formatChapterHeading(命中项)` = `<标题> · 第 <label> 页`（与 chip 逐字节相同） |
| 位置 | 固定在 `pageCount: <n>` 之后、`selectedText:` 之前；`section:` 恒为载荷**第 5 行**（`<reading_context>` / `path:` / `page:` / `pageCount:` 恒在其前），可选块不受影响 |
| 出现条件 | 当且仅当 `resolveCurrentChapter(buildChapterRanges(ctx.outline, ctx.pageCount), ctx.page, ctx.pageCount) !== null` |
| 示例（`sample-paper.pdf` 第 2 页） | `section: 2. Method Overview · 第 2 页` |

### N80-3 不可解析时零字节差

不可解析（§0.3 的六种情形）⇒ **整行不出现**；整条消息**逐字节**等于旧格式：

```
<reading_context>
path: <filePath>
page: <page>
pageCount: <pageCount>
[selectedText: … 既有块]
[reader_notes: … 既有块]
</reading_context>

<用户输入>
```

判据 = 与手工构造的旧格式串 `===`（`r12-4` 的 `without-outline` 相位 + 烟测 `section-format` #1）。

### N80-4 系统提示词补一句（逐字冻结）

| 项 | 值 |
| --- | --- |
| 文件与位置 | `pix/src/main/reading-prompt.ts`：在 `:5` 逐字 `"Use pdf_outline for bookmarks and page numbers.",` **之后**插入一行（成为新 `:6`） |
| 新增行（逐字） | `"The reading context may carry a section line: the section the user is currently reading and its page range. Trust it instead of inferring the section from the page number.",` |
| 不改 | 数组元素 8 → 9（新增元素在 `:5` 之后）：既有 8 个元素与顺序逐字不动；`].join("\n")` 仅行号后移（新 `:12`）、内容逐字不动 |
| 不新增 | 不新增工具、不改 `session-bridge.ts` 的 `appendSystemPromptOverride`（`session-bridge.ts:1245`） |

**验收判据**

| 面 | 判据 |
| --- | --- |
| 【走查】 | `reading-context.ts` 的 diff 只含：`ReadingSendContext.outline` 字段、section 行组装与 import；既有 7 行的 push 顺序与字面零 diff；`reading-prompt.ts` 只多一行（数组元素 8 → 9，`git diff` 单 hunk）；`ChatPanel.vue` 只多 `outline:` 一行 |
| 【check】 | `CHECK_EXIT=0`（`outline` 必填 ⇒ 漏传即编译期报错） |
| 【烟测-渲染】 | 组 `section-format`（5 条）全绿：旧格式逐字节相等（无 outline）、新格式逐字节相等（有 outline）、行序（section 在 `pageCount:` 之后、`selectedText:` 之前）、标题空白折叠、无 `filePath` 时原样早退 |
| 【离屏】 | 组 `r12-section-context`（2 条，场景 `r12-4`）全绿 + 1 张截图 |
| 【离屏·既有载荷回归】 | 43 号载荷断言追加一条必需行后全绿；42d（无文档 ⇒ 载荷逐字等于输入）、42c / 43 的既有行与顺序判据、steer 相位判据全部继续绿 |

**场景 `r12-4`（组 `r12-section-context`，2 条 record）**

前置：`enterCleanWorkspace(seedNotes())` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 3)` → `waitSectionReady()` → `clickNext()` → `waitPage(2, 3)`（命中 `2. Method Overview`）→ `clearSendCalls()`。前置不变量（逐字冻结）：选区为空（`readerStore.selectedText === ""`；由 `goHome` → `openDocument(null)`（`WorkspacePage.vue:235`，`reader-store.ts:58` 复位）与 `openRow` 的 `openDocument` 保证）、选择集为空（`WorkspacePage.vue:239` `resetNotes()` → `notes-store.ts:287` `clearNoteSelection()`）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `with-section` | `typeAndSend(T12)` → `waitSendCalls(1)` → `lastSend()` → 截图 `r12-4-section-context-sent.png`（整窗） | ① 载荷含逐字行 `section: 2. Method Overview · 第 2 页`；② 位置：`indexOf("pageCount: 3") < indexOf("section: ") < indexOf("</reading_context>")`；③ **删掉该行后与旧格式逐字节相等**：`payload.message.replace("section: 2. Method Overview · 第 2 页\n", "") === \`<reading_context>\npath: ${join(LIBRARY_DIR, "sample-paper.pdf")}\npage: 2\npageCount: 3\n</reading_context>\n\n${T12}\``；④ 气泡 `displayText === T12`；⑤ 防空：`selectedTextInPayload === false` 且 `notesInPayload === 0`（字节相等断言的前提现场可查） | `{ phase, message, sectionLine, withoutSectionEqualsOld, selectedTextInPayload, notesInPayload }` |
| `without-outline` | `openRow("older-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 2)` → `settleEmptyOutline()`（与 r12-2 同口径）→ `clearSendCalls()` → `typeAndSend(T13)` → `waitSendCalls(1)` → `lastSend()` | ⑥ 载荷**逐字节**等于旧格式串 `` `<reading_context>\npath: ${join(LIBRARY_DIR, "archive", "older-paper.pdf")}\npage: 1\npageCount: 2\n</reading_context>\n\n${T13}` ``；⑦ 载荷不含子串 `section:`；⑧ 防空：`selectedTextInPayload === false` 且 `notesInPayload === 0` | `{ phase, message, exact, selectedTextInPayload, notesInPayload }` |

场景末：`restoreStandardSeed()`（与 R11 收尾同纪律）。两条用户文本逐字冻结：`T12 = "12：这一节的假设是什么？"`、`T13 = "13：没有书签的文档也要能正常提问。"`（不得与既有场景的文本重复，保证 `lastSend()` 取到的是本场景的载荷）。

**文件白名单条目**：`pix/src/renderer/utils/reading-context.ts`（修改）；`pix/src/renderer/components/workspace/ChatPanel.vue`（修改，一行）；`pix/src/main/reading-prompt.ts`（修改，一行）；`pix/scripts/ui-shot.mjs`（新增场景与断言组；35 号 `confirmed35B` 夹具串同步加 `section: 1. Abstract · 第 1 页`）。

---

## 5. N81 验证面（仓库内可复跑）

### N81-1 新建 `pix/scripts/smoke-view.mjs`（渲染层纯函数烟测，4 组 29 条）

| 项 | 冻结 |
| --- | --- |
| 文件与入口 | 新建 `pix/scripts/smoke-view.mjs`；主入口 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:view`；等价入口 `node scripts/smoke-view.mjs` |
| `package.json` | **只**在 `scripts` 增一键 `"smoke:view": "node scripts/smoke-view.mjs"`；其余字段逐字零改动；`package-lock.json` / `packages/**` 零改动 |
| 编译面 | 仓库内 typescript（`node_modules/typescript/lib/tsc.js`）编译**仓库内**源文件到 `%TEMP%/pix-smoke-view-<时间戳>/out`（不复制源码）；`files` = `pix/src/renderer/utils/outline-notes.ts`、`pix/src/renderer/utils/notes-path.ts`、`pix/src/renderer/utils/reading-context.ts`；`compilerOptions` 在 `smoke-notes.mjs` 同款基础上增 `"baseUrl": "<repo>/pix"` + `"paths": { "@shared/*": ["src/shared/*"] }`（三个文件都 `import type … from "@shared/types"`，不配 paths 会 TS2307） |
| 产物期望 | 必需 `out/renderer/utils/outline-notes.js`、`out/renderer/utils/notes-path.js`、`out/renderer/utils/reading-context.js`；允许附带 `out/shared/types.js`；出现其它产物或必需产物缺失、或 `tsc` 退出码 ≠ 0 ⇒ 直接判失败退出 1 |
| 夹具 | 脚本内构造 4 个夹具：`SAMPLE_LIKE`（与 `ui-shot.mjs` 的 `SAMPLE_OUTLINE` 同构：3 页 + 无页码节点 + 逆序书签 `Appendix B`（page 2））、`CHAIN`（单层 start 1/3/5）、`SINGLE`（单节 start 3）、`EMPTY`（无页码节点）；期望值按 §0.3 / §0.4 的规则手写，**不得**用被测函数生成期望值 |
| 断言组与条数（冻结，不得减少） | `section-hit` **8** / `section-null` **8** / `section-nav` **8** / `section-format` **5** = **29 条** |
| 输出协议 | 与 `smoke-notes.mjs` 同款：组横幅 + 每条 `[通过] <组> #<序号> <说明>` / `[失败] <组> #<序号> <说明>：<实际值>`；末行逐字 `通过 {passed} / 失败 {failed}`；退出码 0/1 |
| 自清理与零残留 | `finally` 内 `rmSync(TMP, { recursive: true, force: true })`；清理失败只告警、不改退出码；运行后 `git status --short` 只出现白名单文件 |

**`section-hit`（8 条）**

| # | 断言 |
| --- | --- |
| 1 | `SAMPLE_LIKE` 第 1 页 ⇒ `key === "root/0"`、`title === "1. Abstract"`、`start === 1`、`end === 1`、`label === "1"` |
| 2 | `SAMPLE_LIKE` 第 2 页 ⇒ `title === "2. Method Overview"`、`label === "2"`（同 `start` 取预序最早者 ⇒ 不是 `2.1`、不是 `Appendix B`） |
| 3 | `SAMPLE_LIKE` 第 3 页 ⇒ `title === "2.2 Positional prior"`、`label === "3"`（不是 `3. Ablation Study`、不是 `Appendix A.1`） |
| 4 | 全页不变量（`SAMPLE_LIKE` 的 1..3 页）：命中非 `null` 时恒有 `start ≤ page ≤ end`（与地图 `isCurrent` 同一条件） |
| 5 | 「`start` 最大且 ≤ page」口径：对每页独立复算满足 `start ≤ page` 的候选集，命中项的 `start` 等于该集合的最大值，且命中项属于该集合 |
| 6 | `CHAIN` 第 2 页 ⇒ 命中 `start === 1` 的节；第 3 页 ⇒ 命中 `start === 3` 的节（边界含等于）；第 5 页 ⇒ 命中 `start === 5` 的节 |
| 7 | 逆序书签不劫持：`SAMPLE_LIKE` 第 3 页的命中不是 `Appendix B`（其 `start = 2 < 3`），也不是预序最后一项 |
| 8 | 同源：命中项与 `ranges.get(hit.key)` 为同一对象引用（`===`），且 `ranges.size` 等于有页码节点数（与 `buildChapterRanges` 的产出直接对账） |

**`section-null`（8 条）**

| # | 断言 |
| --- | --- |
| 1 | `EMPTY`（`outline = []`）⇒ `resolveCurrentChapter` 返回 `null` |
| 2 | 全部节点 `page === null`（`ranges.size === 0`）⇒ `null` |
| 3 | 有页码节点但 `pageCount = 0` ⇒ `null` |
| 4 | `page = 0` ⇒ `null` |
| 5 | `page = -3` ⇒ `null` |
| 6 | `page = pageCount + 1` ⇒ `null` |
| 7 | `page = 1.5` ⇒ `null` |
| 8 | 首节点 `page = 3`、`page = 1`（早于第一节）⇒ `null`，且调用被 `try/catch` 包裹时**未抛错**（`didNotThrow === true`） |

**`section-nav`（8 条）**

| # | 断言 |
| --- | --- |
| 1 | `SAMPLE_LIKE` 第 1 页 ⇒ `prev === null`、`next.title === "2. Method Overview"` |
| 2 | `SAMPLE_LIKE` 第 2 页 ⇒ `prev.title === "1. Abstract"`（`end 1 < 2`）、`next.title === "2.2 Positional prior"`（`start 3 > 2`） |
| 3 | `SAMPLE_LIKE` 第 3 页 ⇒ `prev.title === "2.1 Sparse mask budget"`（`end` 并列取预序最晚者）、`next === null` |
| 4 | 不变量（逐页）：`prev === null \|\| prev.end < page`；`next === null \|\| next.start > page` |
| 5 | `CHAIN` 第 3 页 ⇒ `prev` 为 `start 1` 的节、`next` 为 `start 5` 的节（相邻且页码单调） |
| 6 | `SINGLE`（单节 `start = 3`、`end = 3`）第 3 页 ⇒ `prev === null && next === null`（单节禁用） |
| 7 | `SINGLE` 且 `page = 1`（早于该节）⇒ `prev === null`、`next.start === 3`（确定目标） |
| 8 | 域外（`pageCount = 0` / `page = pageCount + 1` / `page = 1.5`）⇒ 两者皆 `null`（与 `resolveCurrentChapter` 同一守卫） |

**`section-format`（5 条）**

| # | 断言 |
| --- | --- |
| 1 | 无 outline：`buildReadingUserMessage("Q", { filePath: "C:/ws/sample-paper.pdf", page: 2, pageCount: 3, selectedText: "", notes: [], outline: [] })` **逐字节**等于 `` `<reading_context>\npath: C:/ws/sample-paper.pdf\npage: 2\npageCount: 3\n</reading_context>\n\nQ` `` |
| 2 | `SAMPLE_LIKE` 第 2 页 + 同一 `filePath` ⇒ 逐字节等于旧格式串在 `pageCount: 3` 之后插入 `` `section: 2. Method Overview · 第 2 页\n` `` 的结果 |
| 3 | 行序：同一载荷里 `indexOf("pageCount: 3") < indexOf("section: ") < indexOf("selectedText:")`（同时传 `selectedText: "选中"` 与一条备注） |
| 4 | 标题空白折叠：夹具中标题为 `"2. Method\n  Overview"` 的节被命中时，`formatChapterHeading` 输出 `"2. Method Overview · 第 2 页"`（无换行、无连续空格），且该 section 行内不含 `\n` |
| 5 | 无 `filePath`（`filePath: null`）⇒ 返回 `userText` 原样（既有早退语义，点名一次） |

### N81-2 新增离屏场景（`r12-*`，4 场景 / 16 条 record / 7 张截图）

场景与断言见 N78（`r12-1` / `r12-2`）、N79（`r12-3`）、N80（`r12-4`）各表；覆盖矩阵：

| 要求覆盖点 | 落点 |
| --- | --- |
| 可见性（无需打开地图） | `r12-1` 相位 `page-1`（地图默认关闭） |
| 翻页一致 | `r12-1` 相位 `page-2` / `page-3` / `page-input` |
| 缩放 / 面板开关一致 | `r12-1` 相位 `invariance` |
| 无 outline 降级 + 零占位 | `r12-2` 相位 `no-outline` |
| 既有控件零位移 | `r12-2` 相位 `zero-displacement`（`±1px`） |
| 导航跳页（按钮） | `r12-3` 相位 `next-jump` / `next-last-disabled` / `prev-jump` |
| 快捷键与守卫 | `r12-3` 相位 `shortcut-next` / `shortcut-prev` / `shortcut-guard-editable` / `shortcut-guard-capture` |
| 越界页 | `r12-1` 相位 `page-input`（提交 `99` 无效果、章节不漂移） |
| 注入载荷逐字与旧格式字节一致 | `r12-4`（两个相位） |
| 43 号既有载荷断言更新 | 在 `ui-shot.mjs:3673` 的 `missingLines` 必需行列表与 `:3698` 的骨架断言列表各**追加**一条 `"section: 2. Method Overview · 第 2 页"`（不替换任何既有行；行号以定稿日实读为准） |
| 地图 / 阅读器同源 | `r12-1` 相位 `invariance` 内**追加**一次只读断言（不做状态变更）：`ensureMapOpen()`（已开时不得再点）并等 `.map-row.current` 就绪（`countOf(".map-row.current") === 3`）后，`mapCurrentLabels()` 必含 chip 的标题 `2.2 Positional prior`，且必含逆序书签 `Appendix B`（两者都在地图的 in-range 集合内） |

### N81-3 基线与零缺失

动工前先跑基线（新目录 `pix-v05-r12-base`）→ 开发后跑验收（另一目录）；判据见 §0.6（既有 120 张 / 169 条零缺失、新增 7 张 / 16 条齐备、退出码 0、`failure === null`）。

**验收判据**

| 面 | 判据 |
| --- | --- |
| 【烟测-渲染】 | 连续两次 `npm run smoke:view` 均退出码 0；输出 4 组共 29 条 `[通过]`、0 条 `[失败]`；末行逐字 `通过 29 / 失败 0` |
| 【烟测-主进程】 | `npm run smoke:notes` 仍退出码 0、26 条全绿（主进程**数据面**零改动的回归确认） |
| 【check】 | `CHECK_EXIT=0` |
| 【走查】 | 新脚本不在 `tsconfig.json` 的 include 内（`pix/scripts/**` 与 `ui-shot.mjs` 同待遇）；仓库内零残留（`git status --short` 只出现白名单文件）；`package.json` 除 `scripts.smoke:view` 外零 diff |
| 【离屏】 | 4 个新场景全绿；7 张新截图齐备；`MANIFEST.json.failure === null`、退出码 0 |

**文件白名单条目**：`pix/scripts/smoke-view.mjs`（新建）；`pix/package.json`（仅 `scripts` 增一键）；`pix/scripts/ui-shot.mjs`（新增 4 场景 / 4 组 / 16 条 record / 7 张截图 / `SEL` 与 helper / 43 号必需行 / 35 号夹具串同步）。

---

## 6. 反需求（本轮明确不做）

1. **不引入 LLM 生成或推断章节结构**：章节只来自 PDF 书签（`getOutline`）；不做自动摘要、不做标题识别、不做页码纠错（PRD §4.2 / §4.3）。
2. **不改知识地图的既有交互与视觉**：`isCurrent` / `isRead` 判定式、`.map-row.current` / `.read` 的 CSS、自动滚动、节点点击、徽标、进度行全部零改动；地图不参与新控件的渲染。
3. **不改 `notes.json` 与任何 `.pix-read/**` 产物**：本轮零写盘、零新文件；`notes.md` / `reports/**`（R13）不在本轮范围。
4. **不新增主进程 IPC、不改 preload 面**：本轮 = 纯渲染层 + 一个提示词常量（`reading-prompt.ts`）；`preload.ts` / `ipc-handlers.ts` / 离屏 stub 的 `pixApi` 面零改动。
5. **不做自动滚动到当前章节之外的新行为**：不因命中变化而滚动阅读区、不自动打开知识地图、不让 chip 成为跳转/展开控件（chip 不可交互）。
6. **不改页码 pill 结构**：不向 `.pdf-page-indicator` 内追加元素；不把章节控件放进 pill；不接管现有页内翻页按钮的语义。
7. **不改既有键位与 Esc 语义**：`/` / `PageUp` / `PageDown` / `ArrowLeft` / `ArrowRight` / `Home` / `End` / `Ctrl+F` / `Escape` 与 `PdfViewer.vue:375/380/385` 的分支顺序逐字不动；不为新快捷键引入修饰键组合。
8. **不新增依赖、不改 lockfile、不改 `packages/**`、不改 electron-builder 配置**；`pix/package.json` 只允许 `scripts` 增 `smoke:view` 一键。
9. **不删除、不重命名、不改写既有离屏场景与截图**（PRD §5.7）：既有 120 张截图 / 169 条 label 零缺失；只允许追加。
10. **不做章节与笔记的联动扩展**（章节笔记入口、按章节导出、章节级过滤）——属 R13 / R14 范围。
11. **不给 `<reading_context>` 增加除 `section:` 之外的任何行**，不改既有行字面与顺序，不做「章节不可解析时输出空 section 行」这类占位写法。
12. **不引入新全局 CSS 变量 / 主题色 / 动画**，不为新控件加过渡动画。

---

## 7. 文件白名单（逐文件 + 改动点）

| # | 文件 | 动作 | 对应需求 | 改动点（不得越界） |
| --- | --- | --- | --- | --- |
| 1 | `pix/src/renderer/utils/outline-notes.ts` | 修改 | N77 / N79 / N80 | 新增 `resolveCurrentChapter`、`resolveChapterNav`、`formatChapterHeading`（纯函数：按 `Map` 插入序遍历 `ranges`——顺序来源本身也是冻结面；只读 `ChapterRange` 的 `title` / `label` / `start` / `end`，不改写字段）；`buildChapterRanges` / `countNotesByChapter` / `collectPreorder` 与既有导出零改动；文件头注释补一句来源说明 |
| 2 | `pix/src/renderer/utils/reading-context.ts` | 修改 | N80 | `ReadingSendContext` 增必填 `outline: ReaderOutlineNode[]`；`buildReadingUserMessage` 在 `pageCount:` 行之后插入可选 `section:` 行（调用 `buildChapterRanges` + `resolveCurrentChapter` + `formatChapterHeading`）；既有行字面与顺序零改动 |
| 3 | `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改 | N80 | `readContext` 对象字面量增 `outline: readerStore.outline` 一行；其余零改动 |
| 4 | `pix/src/renderer/components/workspace/PdfViewer.vue` | 修改 | N78 / N79 | 新增 3 个 computed（ranges / 命中 / 导航）、`.reader-section` 模板块与样式、`onWindowKeydown` 内新增 `[` / `]` 分支块；`.pdf-page-indicator` 模板、Esc 两分支、既有七键位、`isEditableTarget`、监听注册、`gotoPage` / `scrollToPage` 零改动 |
| 5 | `pix/src/main/reading-prompt.ts` | 修改 | N80-4 | 数组元素 8 → 9：`:5` 后插入一行（逐字见 N80-4）；既有 8 个元素与 `join("\n")` 逐字零改动（唯一 diff = 该插入） |
| 6 | `pix/scripts/ui-shot.mjs` | 修改 | N81-2 | `SEL` 增 8 项；新增 helper（§0.5，含就绪同步 `waitSectionReady` / `closeMap` / `settleEmptyOutline`）；追加 `r12-1`…`r12-4` 与 4 组共 16 条 record、7 张截图；43 的在 `:3673` 的 `missingLines` 列表与 `:3698` 的断言列表各追加 1 条必需行；35 的 `confirmed35B` 同步 1 处；既有场景/截图/label 零改动 |
| 7 | `pix/scripts/smoke-view.mjs` | **新建** | N81-1 | 仓库内可复跑渲染层纯函数烟测（4 组 29 条）；只读仓库内源文件、只写 `os.tmpdir()` 下临时目录、自清理 |
| 8 | `pix/package.json` | 修改（最小） | N81-1 | `scripts` 增 `"smoke:view": "node scripts/smoke-view.mjs"`；依赖/其它字段逐字零改动 |
| 9 | `docs/pm/R12-*.md` | 新建 | — | 本档（`R12-req.md`）与后续 `R12-design.md` / `R12-review.md` / `R12-dev.md` |

**范围外（任何情况下不动）**：`packages/**`、`package-lock.json`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/src/renderer/stores/**`、`pix/src/renderer/components/workspace/{KnowledgeMap,NotesPanel,ReaderPanel,LibraryPanel,PdfSearchPanel,PdfSelectionQuickAsk}.vue`、`pix/src/main/{ipc-handlers,preload,notes-store,library-root,reader-state-store,session-bridge}.ts`、`pix/src/shared/types.ts`、`pix/resources/**`、`docs/pm/**` 的历史档件、`.gitignore`、`README.md`。

---

## 8. 风险 Top3 与判定方式

**R1「命中规则把用户指到一个错误的章节」** —— 规则与夹具的对抗面（无页码节点、逆序书签、同页多层）很容易写出「预序最后命中」或「区间嵌套最后命中」之类的实现，导致 chip 与地图高亮矛盾、或把「上一节/下一节」写成同页空跳/反向跳。

- 判定：烟测 `section-hit`（含「命中项恒满足 `start ≤ page ≤ end`」「同 `start` 取预序最早者」逐页断言）+ `section-nav` 的两条不变量（`prev.end < page` / `next.start > page`）+ `r12-1` 三页 chip 逐字 + `r12-3` 三个跳转落页。
- 失败信号：chip 在第 3 页显示 `3. Ablation Study` 系列同 start 的非最早项、或显示 `Appendix B` / `Appendix A.1`；「上一节」把页码推到更大值。

**R2「新控件挤动既有控件，基线出现非预期差异」** —— 把章节控件塞进 `.reader-header` 或 pill 的行内 flex，会改变 `.reader-title` / `.page-label` 的几何甚至文本读取口径。

- 判定：`r12-2` 的 `±1px` 跨文档读数 + `r12-1` 的 pill 文本与不相交断言 + 既有 120 张截图 / 169 条 label 零缺失 + 7 张新截图逐张目视登记。
- 失败信号：`.page-label` 文本或矩形变化；既有 `waitPage` 等待式失效；既有场景截图内容出现非控件相关的差异。

**R3「快捷键劫持输入或越界到框选模式」** —— 在 `onWindowKeydown` 的守卫**之前**插入新分支（或新监听），会让输入框内 `[` / `]` 触发跳页、框选模式下丢页。

- 判定：`r12-3` 的 `shortcut-guard-editable`（两个输入控件）与 `shortcut-guard-capture`（模式内不生效、退出后生效）+ 走查（`addEventListener("keydown"` 恰 1 处、`isEditableTarget` 恰 1 个定义、新分支在 `:385` 之后）+ 既有键位场景全绿。
- 失败信号：输入框内派发后页码变化；框选模式下页码变化；`grep` 出现第二处 keydown 监听。

**次级风险（不占 Top3）**：① `r12-4` 的逐字节断言依赖「没有选中文本、没有勾选笔记」——该前置已在 r12-4 前置冻结（依据 `WorkspacePage.vue:235/239`、`reader-store.ts:58`、`notes-store.ts:287`），且两个相位的 `data` 各带 `selectedTextInPayload` / `notesInPayload` 现场（定稿修订第 5 条）；② `r12-1` 的 `invariance` 相位里 `ensureMapOpen()` / `closeMap()` 会改变中心栏宽度，只判 chip 文本、不判矩形；③ 7 张新截图会让单次离屏运行的时长上升，若超时优先复用同一次 `sectionProbe()`（不得删断言）；④ `r12-3` 的 `.reader-section-prev` 目标 `2.1` 与当前页同为第 2 页的一步（按钮语义正确但视觉上只闪一下），已在 §0.4 表登记为预期行为。

---

## 9. 开放问题（需负责人确认，不阻塞本档定稿）

1. **命中规则的并列取值偏离本轮草案建议**（§0.2 第 1 条：建议「预序更晚者」，本档冻结为「预序最早者」）。理由与夹具证据见 §0.3（定稿修订第 4 条已修正其中「最外层标题」的错误表述：本口径是**分支优先**、非层级优先）。评审提出的备选「深度最小（最外层章节优先）」未采纳；若负责人另行决定切换，需同步改 `smoke-view` 的 `section-hit` #2/#3/#7、`r12-1` 的第 2/3 页 chip 期望与 `r12-3` 的跳转期望（改前请先确认，避免两套口径并存）。
2. **章节控件的宿主与位置**：本档冻结为 `PdfViewer.vue` 内、页码 pill 上方居中的独立绝对定位行（`bottom` 具体值由设计定稿）。若设计希望放进 `.reader-header`（`ReaderPanel.vue`），需登记读取节点、白名单加 `ReaderPanel.vue`，并重做「零位移」判据（`.reader-title` 会变窄）。
3. **提示词是否加这句**：本档冻结为「加一句」（N80-4 逐字）。若负责人倾向不加，删除 N80-4 与对应走查判据即可，不影响其余任何判据。
4. **35 号场景的 `confirmed35B` 夹具串**：本档冻结为「同步加上 `section:` 行」（零断言影响；不同步则仿真文本与真实载荷不再逐字一致，但所有断言仍绿）。
5. **新增配额**（7 张截图 / 16 条 record / 29 条烟测断言）是否超出本轮容量：如需压缩，优先保留 `r12-section-visible`（可见性 + 翻页一致）、`r12-section-degrade`（降级 + 零位移）、`r12-section-context`（载荷字节一致）三组，`r12-section-nav` 可减为 4 条 record（合并 `shortcut-next` / `shortcut-prev` 为一组断言）——但**不得**删除按键守卫与边界禁用两项判据。
