# PiX-Read R17 设计档 · 操作可达性（N96–N99）

> 上游：`docs/pm/R17-req.md`（需求 N96–N99，含 §0 定稿修订 M1–M9 与 §0.0–§0.9 冻结契约；共 16 个子条 / 18 行键位表 / 4+4 场景配额）、`docs/pm/R17-review.md`（需求评审 must-fix M1–M9，已全部被需求档采纳）、`docs/pm/PRD-V0.6.md` §1 缺口 2 / §2（R17 = 操作可达性）/ §4 反需求 2、5、6、7、8 / §5 工程红线 / §7 判据 2、`docs/pm/R16-design.md` 与 `docs/pm/R14-design.md`（**本档的结构范本**：§0 口径与证据面 / §1 契约冻结表 / §2 与既有冻结面的关系 / §3 失败路径表 / §4 文件级清单 / §5 验证方案 / §6 风险 Top3 / §7 开发分工 / §8 视觉验收要点）、`docs/pm/R11-design.md` 与 `docs/pm/R15-dev.md`（`.quick-ask` 契约与 R15 交付终态）。
> 本档是「可直接开工、可判定」的定稿设计：把 R17-req §0.2–§0.9 的冻结契约落到**实现层粒度** —— `shortcut-help.ts` 的逐字数据、`ShortcutOverview.vue` 的参考实现（入口 Teleport / 浮层 DOM / 开关与焦点 / 关闭路径）、`quick-ask-templates.ts` 的纯函数、seam 与消费端的新签名、4 按钮的插入位次与几何、以及烟测 23 条与离屏 4 场景 11 条 record / 7 张截图的逐条判据。
> **本档不改任何代码**，只新增这一份文档；本轮允许的写操作仅 `docs/pm/R17-design.md`。
> **编号映射**：本档按任务书编号 —— §1 契约冻结表 / §2 与既有冻结面的关系 / §3 失败路径表 / §4 文件级清单 / §5 验证方案 / §6 风险 Top3 / §7 开发分工 / §8 视觉验收要点；§0 为本档的证据面与实现层补充冻结，§9 为登记性开放问题（不改任何判据）。
> **定稿修订（R17）**：正文已按 `docs/pm/R17-review.md`「设计评审（R17）」的 must-fix D1–D6 与三条非阻塞建议逐条修订；其中 **D1 经真实代码核实后拒绝**（前提被证伪），D2–D6 与三条建议全部采纳；逐条落点与证据见末尾「## 定稿修订（R17）」。
> 判定工具（与需求档一致）：【走查】只读 `git status` / `git diff` / `git show` 与文件内容（含 `grep -c` / `grep -rn` 计数）；【check】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error（唯一工程门）；【烟测-渲染】`npm run smoke:view`（既有 7 组 51 条 + 新增 2 组 23 条 = **74 条**）；【烟测-主进程】`npm run smoke:notes`（10 组 65 条，**零改动**，只作回归）；【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + 既有 166 张 / 237 条 / 64 种 label 零缺失 + 新增 4 组 11 条 record 全绿 + 7 张新截图齐备。

---

## 0. 口径与证据面

### 0.1 本档事实基线（写档当天的真实读数）

| 事实 | 证据（全部为本次真实命令输出 / 文件实读） |
| --- | --- |
| 工作树与 HEAD | `git status --short` ⇒ 仅 `?? docs/pm/R17-req.md` / `?? docs/pm/R17-review.md`（本档落盘后追加 `?? docs/pm/R17-design.md`）；`git branch --show-current` ⇒ `main`；`git log --oneline -1` / `git rev-parse --short HEAD` ⇒ `8850c9c feat(reader): 原文锚点（页面笔记标记、本页摘录高亮与面板定位）（V0.6 R16）` |
| 文件规模（`wc -l` 实读） | `PdfSelectionQuickAsk.vue` **285** / `PdfViewer.vue` **1548** / `ReaderPanel.vue` **476** / `ChatPanel.vue` **1765** / `InputArea.vue` **93** / `PdfSearchPanel.vue` **484** / `NotesPanel.vue` **1703** / `ui-shot.mjs` **10392** / `smoke-view.mjs` **850** |
| 阅读区键位（`PdfViewer.vue`，逐段实读） | `isEditableTarget` `:400-407`（`isContentEditable \|\| INPUT \|\| TEXTAREA \|\| SELECT`）；`openSearch` `:410-413`（`searchPanel.value?.focusInput()`）；`onWindowKeydown` `:415-484`：修饰键分支 `:416`，**Ctrl+F** `:419-427`（`pageCount > 0 && key.toLowerCase() === "f"`，输入框聚焦时仍生效）；**capture Esc** `:434-437`；**search Esc** `:439-442`；`isEditableTarget` 守卫 `:444`；**`[` / `]`** `:445-454`（447 行 `captureMode` 屏蔽、450 行目标 `null` 零副作用）；**`/`** `:455-458`；`switch (event.key)` `:462`：`PageUp`/`ArrowLeft` `:463-468`、`PageDown`/`ArrowRight` `:469-474`、`Home` `:475-478`、`End` `:479-482`。**无 `ArrowUp` / `ArrowDown` 分支**（`:462-483` 全读） |
| 阅读区监听生命周期（`PdfViewer.vue`） | `keydownRegistered` `:487`、`setKeydownListener` `:489-497`、`watch(() => readerStore.pageCount > 0, …, { immediate: true })` `:499-503`；注册 / 注销对 `window.addEventListener("keydown", onWindowKeydown)` `:493` / `removeEventListener` `:495`（**只在打开文档时注册**） |
| 组件级键位（实读） | `PdfSearchPanel.vue`：`onInputEnter` 起于 `:307`、`isComposing` 守卫 `:308`、模板 `:404` `class="search-input"` + `:407` `@keydown.enter="onInputEnter"`、`focusInput` `:313` + `defineExpose` `:317`；`NotesPanel.vue`：`onSearchEsc` `:222-226`（`clearSearchQuery()` + `blur()` + `stopPropagation()`）、模板 `:631` `@keydown.esc="onSearchEsc"`；`PdfViewer.vue` 页码输入框 `:1209` `@keydown.enter.prevent="commitPageDraft"` / `:1210` `@keydown.esc.prevent="cancelPageEdit"`（`commitPageDraft` `:387`、`cancelPageEdit` `:396`）；`InputArea.vue`：`onKeydown` `:28-35`（`isComposing` 守卫 `:30`；`Enter && !shiftKey` ⇒ `preventDefault` + `emit("send")` `:31-34`）、`focus` `:44-46`、`defineExpose({ focus })` `:48`、模板 `:52-62`（`class="input-area"` `:54`、`@keydown="onKeydown"` `:59`）；`ChatPanel.vue`：`onRenameEnter` `:708-711`（`isComposing` 守卫 `:709`）、重命名输入框 `:1166` `@keydown.enter="onRenameEnter"`；`SettingsPage.vue:491`（工作区外，本轮范围外） |
| `.quick-ask` 现状（`PdfSelectionQuickAsk.vue`，全文件实读） | `MIN_SELECTION_CHARS = 2` `:18` / `BUTTON_GAP = 6` `:19` / `STAGE_PADDING = 4` `:20` / `FEEDBACK_MS = 2500` `:22`；`showFor` `:56-90`（clamp `:80-89`）；`hide()` `:92-102`（`visible=false` + **清 `cachedText`** + `selectionPage=null` + `mode="actions"` + 清 `feedback` 与定时器）；`showFeedback` `:104-115`；`onSelectionChange` `:117-138`（同文本保态分支 `:136`）；`onStageScroll` `:140-146`；`onButtonClick` `:148-152`（**先取 `const text = cachedText` 再 `hide()`**；`if (text) emitQuickAsk(text)`）；`onExcerptClick` `:154-170`；`watch(filePath) → hide()` `:175-179`；`onMounted` `:180-185` / `onBeforeUnmount` `:186-196`；模板 `:196-225`（`v-show="visible"` `:198`、`class="quick-ask"` `:200`、`@pointerdown.prevent` `:202`、「问 AI」`:205-208`、`v-if="canExcerpt"` 的「摘录」`:209-218`、反馈 `:220-223`）；CSS `.quick-ask` `:228-242`（`z-index: 6` `:230`、`display: inline-flex` / `gap: 2px` / `padding: 2px 4px` / `border-radius: 999px`）、`.quick-ask-btn` `:244-264`、`.quick-ask-feedback` `:266-284` |
| seam 现状（`useQuickAsk.ts` 全文件实读） | `QuickAskHandler = (text: string) => void`；`currentHandler`；`registerQuickAskConsumer`；`emitQuickAsk(text)`；笔记 seam（`NotesAskHandler` / `registerNotesAskConsumer` / `emitNotesAsk`）与其后 |
| composer 现状（`ChatPanel.vue` 实读） | `draft` `:163`、`composerInput` `:166`、`QUICK_ASK_TEMPLATE = "请解释选中的这段话："` `:304`、`onQuickAsk()`（**无参数**）`:306-310`（注释 `:307` + `if (!draft.value) draft.value = QUICK_ASK_TEMPLATE;` `:308` + `composerInput.value?.focus();` `:309`，**无 `return`**）、`NOTES_ASK_TEMPLATE = "请结合我选中的摘录回答："` `:314`、`onNotesAsk` `:324-331`、`send()` `:352`、`registerQuickAskConsumer(onQuickAsk)` `:848` / 注销 `:855`、`.composer-box` `:1123`、`<InputArea ref="composerInput" … @send="send" />` `:1127-1136`、`.composer-send` `:1139-1145`、重命名 `<v-text-field>` `:1157-1166`；`.composer-box` CSS `:1703`、`.composer-send` `:1729-1737` |
| 入口候选落点（`ReaderPanel.vue` / `WorkspacePage.vue` 实读） | `ReaderPanel.vue`：`.reader-panel` 模板 `:176` / CSS `:263-268`（`position: relative` ⇒ 绝对定位包含块）；`.map-toggle` 的 Teleport 范式 `:192-204`（`v-if="mapToggleReady && isPdf"`、`:title` / `:aria-pressed` / `:disabled` / `@click`）与样式 `:311-344`；`mapToggleReady` `:42`、就绪判定 `:159`（`!!document.querySelector(".center-pill")`）；`.reader-stage` `:206` / CSS `:292-298`（`display: flex`）；`.knowledge-map-slot` `:207` / CSS `:300-309`（`flex: 0 1 26%; min-width: 0; max-width: 240px; overflow: hidden`）；`<PdfSelectionQuickAsk />` `:258`。`WorkspacePage.vue`：`.center-pill` 模板 `:321-331`（子元素 = 可选 `.pill-icon-btn` + `.pill-label` `:330`）、`.pane-shell` `:369-375`（`position: relative`）、`.pane-pill` `:377-392`（`height: var(--pix-pane-pill-height)` `:383`、`margin: 8px 10px 0` `:382`、`z-index: 2` `:393`）、`.center-pill` `:394-398`（`position: absolute; top: 0; left: 0`）、`.pill-label` `:400-403`、`.pane-body` `:459-462`、`.reader-under-pill :deep(.reader-header) { display: none }` `:464-466` |
| 层级与几何（实读 + 基线测量） | `AppLayout.vue`：`.app-layout` `:105-114`（`padding: 4px 12px 10px 10px` `:112`）、`.layout-center` `:128-140`（`overflow: hidden` + `position: relative` + `z-index: 1` ⇒ **自成层叠上下文**）、`.layout-right` `:142-152`（`width/min-width: var(--pix-right-width)`）、narrow 媒体查询 `@media (max-width: 959px)` `:169`（窗口 1600 ⇒ 不命中）。基线 `MEASUREMENTS.json`（本次 `node -e` 复读 `C:/Users/86157/AppData/Local/Temp/pix-v06-r16-review/shots`）：`r12-section-visible.viewerWidth = 912`；`r12-section-degrade` 相位 `zero-displacement` 的 `toolbar.rect = {x:1067, y:79, width:120, height:26}`、`captureFab.rect = {x:299, y:949, width:28, height:28}`；`r12-section-visible` 的 `indicator.rect = {x:671, y:950, width:144, height:27}`、`containerRect = {x:660, y:919, width:165, height:24}` |
| 缩放与滚动（实读） | `PdfViewer.vue`：`zoomBy(delta)` `:807-809`（`readerStore.setScale(scale + delta)`）、工具栏 `:1081` `title="缩小"` / `:1082` `.zoom-label` / `:1083` `title="放大"`（±0.1）；`reader-store.ts`：`MIN_SCALE = 0.5` `:20` / `MAX_SCALE = 3` `:21` / `DEFAULT_SCALE = 1` `:22` / `setScale` `:136-139`（四舍五入两位 + 钳制）⇒ 10 次「放大」= **200%** |
| 零缺失基线（R16 交付终态，本次实读） | 目录 `C:/Users/86157/AppData/Local/Temp/pix-v06-r16-review/shots`：`MANIFEST.json` ⇒ `shots.length = 166`、`failure = null`；`MEASUREMENTS.json` 长度 **237**、`label` 去重 **64** 种；目录内 png **166** |
| 离屏脚本锚点（`ui-shot.mjs`，本次实读行号） | `OUT_ROOT` `:34`（env `PIX_SHOT_ROOT`）、`SHOTS_DIR` `:35`、`SEL` `:47-118`（**64** 项，末项 `notePageBadge`）、`WINDOW = { width: 1600, height: 1000 }` `:44`、`LIBRARY_NAME` `:39`；`repaint(win)` `:1263-1266`；`capturePage(win, name, rect)` `:1268-1276`；`textOf` `:1614` / `has` `:1618` / `countOf` `:1619` / `stateBytes` `:1620`；`waitFor` `:1598-1606`、`record(label, data, failures)` `:1609-1612`（**先 `measurements.push` 再抛错**）、`goHome` `:1686-1694`、`enterWorkspace(name)` `:1696-1709`、`waitTreeRows` `:1668`、`waitPdfLoaded` `:1670`、`waitPage(page, count)` `:1671`、`openRow(suffix)` `:1711-1719`、`selectPageSpan(page)` `:1757-1770`、`userBlocks()` `:2385`、`setDraft(text)` `:2534-2543`、`rectOfSelector(selector, pad)` `:2569-2585`、`sendCalls()` `:3258` / `clearSendCalls()` `:3259` / `lastSend()` `:3264` / `waitSendCalls(n)` `:3271`、`chipSnapshot()` `:3316-3334`、`composerSnapshot()` `:3337-3351`、`enterCleanWorkspace(seed)` `:3397-3407`、`openNotesPanel(rows)` `:3410-3413`、`restoreStandardSeed()` `:3416-3420`、`notesAddCalls()` `:2382`、`quickAskStateProbe()` `:5459-5469`（`inDom` / `display` / `feedbackClass` / `feedbackText` / `btnCount` `:5467`）、`selectionProbe()` `:5472-5481`、`clickEl(selector)` `:7273`、`pressReaderKey(key)` `:7276-7279`、`pressKeyOn(selector, key)` `:7282-7287`；`runReaderStateScenarios` 收口 = `:10234` 的 `await restoreStandardSeed();` + `:10235` 的 `}` |
| 既有按钮数断言（本轮唯一改写面，逐字实读） | 三处 `btnCount === 2`：`:5518`（`ensureQuickAskExcerptReady` 的 `ready` 判据，`state.btnCount === 2 &&`）、`:6987`（`...(goneP4.probe.feedbackClass === null && goneP4.probe.btnCount === 2 && goneP4.probe.display !== "none" && …`）、`:7059`（`...(afterDifferentTextP5b.display !== "none" && afterDifferentTextP5b.btnCount === 2`）；反馈期 `btnCount === 0` 的既有断言在 `:6975` / `:6978`（feedback 分支不渲染按钮 ⇒ 不受影响） |
| 既有「按文本找按钮」写法（不受新增按钮影响，实读） | `ui-shot.mjs` 内 6 处：`:1448`（06c 摘录）、`:1479`（07c 去重摘录）、`:1982`（08 摘录）、`:5416`（`excerptFirstSpan`）、`:5537`（`excerptViaQuickAsk`）、`:6791`（r11-3 摘录）；`:1476` 的「动作按钮回位」等待同样按 `文本包含「摘录」` 判定 ⇒ **全部与按钮下标无关** |
| 像素会变的既有截图（登记，无像素比对断言） | 两张整窗截图 `r11-3-excerpt-feedback-visible.png`（`:6810`）/ `r11-3b-feedback-after-spurious-selectionchange.png`（`:6920`）；三张以 `rectOf(SEL.quickAsk, 30)` 裁切的截图 `06c-excerpt-entry-zoom.png`（`:1402`）/ `07b-excerpt-feedback-zoom.png`（`:1457`）/ `07c-excerpt-duplicate-zoom.png`（`:1487`）；本次确认仓内 `grep -c "pixelmatch" scripts/ui-shot.mjs` = **0**（无像素比对） |
| `aria-*` 布尔绑定的渲染先例（本次实读） | `PdfViewer.vue:1162` `:aria-pressed="readerStore.captureMode"`；`ui-shot.mjs:6747` 既有断言 `…fabPressed === "true"`（R15 场景常绿）⇒ Vue 3 将 `aria-*` 上的布尔渲染为字符串 `"true"` / `"false"` ⇒ `:aria-expanded="open"` 可用 `getAttribute("aria-expanded")` 逐字比对 |
| 命名预检（本轮全部为**新增**名字） | `grep -rn "shortcut\|ShortcutOverview\|resolveTemplateDraft\|templateForAction\|EXPLAIN_TEMPLATE\|TRANSLATE_TEMPLATE\|QuickAskAction\|快捷键总览" pix/src` ⇒ 仅 1 处英文注释命中（`ClarificationCard.vue:5` 的 "shortcut options"），上述 8 个标识符与文案 `快捷键总览` 在 `pix/src` 内 **0 命中**；`SEL` 内 `shortcutToggle` / `shortcutOverview` / `shortcutRow` / `shortcutKey` / `shortcutNote` / `composerBox` 均 0 命中（`composerInput: ".input-area"` 已存在，新键为 `composerBox`） |
| 图标存在性（逐字冻结前的实读） | `pix/node_modules/@mdi/font/css/materialdesignicons.css` 内 `grep -o`：`mdi-keyboard-outline` / `mdi-lightbulb-on-outline` / `mdi-translate` 均存在；既有 `mdi-comment-question-outline` / `mdi-notebook-plus-outline` / `mdi-close` 亦在 |
| 变量存在性（不新增变量的前提） | `variables.css` 实读：`--pix-bg-hover` `:15` / `--pix-bg-active` `:16` / `--pix-bg-code` `:18` / `--pix-bg-elevated` `:20` / `--pix-border-light` `:25` / `--pix-text-primary` `:30` / `--pix-text-secondary` `:31` / `--pix-text-muted` `:32` / `--pix-font-ui` `:68` / `--pix-font-mono` `:69` / `--pix-shadow-xs` `:100` / `--pix-shadow-md` `:102` / `--pix-left-width` `:112` / `--pix-right-width` `:113` / `--pix-pane-pill-height` `:114` |
| 烟测面现状（`smoke-view.mjs` 实读） | `WINDOW_SHIM` `:33-34`；`compileAndLoad()` `:764`，`files` `:780-786`（`outline-notes.ts` / `notes-path.ts` / `reading-context.ts` / `page-anchor.ts` + `WINDOW_SHIM`）、`required` `:799`（4 个 `.js`）、`allowed = new Set([...required, "shared/types.js"])` `:800`；模块句柄 `outlineNotes` / `readingContext` / `notesPath` / `pageAnchor` `:139-142`；`group(name)`、`check(groupName, index, desc, ok, actual)` `:149-158`、`fail(message)` `:159`；组函数 `runSectionHit` `:173` / `runSectionNull` `:255` / `runSectionNav` `:308` / `runSectionFormat` `:385` / `runBadgeCounts` `:474` / `runNotesByPage` `:550` / `runExcerptMatch` `:620`；`main()` `:825-846`（7 行调用 + `console.log(\`通过 ${passed} / 失败 ${failed}\`)`）；`grep -c "  check(" scripts/smoke-view.mjs` = **51** |
| 工程配置（决定实现写法） | `pix/tsconfig.json`：`strict: true`、`isolatedModules: true`、**未开** `noUnusedParameters` / `noUnusedLocals` ⇒ 消费端签名可保留未被使用的 `text` 形参；`import type { … }` 在仓内已是既有写法（`ChatPanel.vue:20-22`、`KnowledgeMap.vue:14-15` 等） |
| 唯一工程门（本步实跑一次） | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（`vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit`）；与 R17-req 事实表一致 |
| 本轮未执行（本步禁止 / 不必要） | 离屏 `ui-shot.mjs`、基线复跑、`npm run build` / `npm test` / `npm run package` / `npm run dev`；烟测两文件均未跑（`smoke-view.mjs` / `smoke-notes.mjs`） |

### 0.2 R17-req 定稿修订（M1–M9）在本档的实现级落点

| 编号 | 需求档结论（已冻结） | 本档实现级落点 |
| --- | --- | --- |
| M1（`btnCount === 0` 不可满足） | 判据改为 `display === "none"` + `btnCount === 3` | §5.4 `r17-2` 相位 `explain` 的读数项 `quickAskAfterExplain`（**定稿 D4**：已落进该相位 `data`，读数 = 步骤 ⑥ 的 `quickAskStateProbe()`）；§3 第 14 行 |
| M2（`r15-f16` 证据链更正） | 删去该表述；改走查 + 限制登记 | §5.6 走查 #9 / #10；§5.4 `r17-1` 相位 `close-paths-and-focus-return` 只判「零增量」不判监听泄漏 |
| M3（浮层与地图列重叠） | 采纳处置②：接受重叠 + 地图关闭态取值 | §1.2「与知识地图的关系」行；§5.4 `r17-1b` 相位 ① 的 `has(SEL.mapSlot) === false` 断言（**定稿 D1**：地图关闭由场景前置 `enterCleanWorkspace → goHome()` 的 `setMapOpen(false)`（`WorkspacePage.vue:260`）显式保证；不新增 `assertNoMapSlot()` / `closeMap()`）；§8.1 第 2 行的限定口径 |
| M4（键位表补全与交互口径） | 18 行（含重命名输入框）；`SettingsPage` 范围外；`?` 与 `/` 天然分离；`isComposing` 早退 | §1.3 全表 + 注册纪律 5/6；§1.4 分支顺序 |
| M5（档内自相矛盾） | 第 18 行 `desc` = `打开或关闭本总览`；组名 `工作区` | §1.3 表第 18 行 + 注册纪律 4 |
| M6（四类不可判判据） | body 前置步 / 关闭态计数 / `preventDefault` 口径 / 可聚焦计数 | §1.4「焦点管理」「不劫持」；§5.4 `r17-1` 三相位；§5.4 的 `shortcutProbe().focusableCount` 口径（§5.4.2 的「容器自身计数」坑） |
| M7（可替换集合不可证明） | 逐字单行 `grep -F` 判据 | §5.6 走查 #7 |
| M8（点击顺序） | 先取 `text` → `hide()` → 发射 | §1.5「点击语义」+ `onTemplateClick` 逐字形状 |
| M9（行号失真） | 按实读刷新 | §0.1 全表按本次实读登记（`repaint` `:1263`、`record` `:1609`、`restoreStandardSeed` `:3416`、`clickEl` `:7273`、`pressReaderKey` `:7276`、`pressKeyOn` `:7282`、场景收口 `:10234` / `:10235`） |

### 0.3 本档新增的显式冻结（只补实现层命名与常量，不改任何判据）

| 项 | 冻结值 | 理由 |
| --- | --- | --- |
| `ShortcutOverview.vue` 内部命名 | `open` / `pillReady` / `panelEl` / `toggleEl` / `lastFocused` / `isEditableTarget` / `close()` / `toggle()` / `onWindowKeydown(event)` / `onDocumentPointerdown(event)` | 需求档只冻结 DOM 与语义；命名收敛到「一个开关 ref + 两个元素 ref + 一个焦点暂存 + 两个处理器」 |
| 键位表模块内部命名 | `ShortcutRow` / `ShortcutSection` / `SHORTCUT_KEY_JOIN` / `SHORTCUT_SECTIONS` / `SHORTCUT_NOTE` | 需求档 §0.3 / §0.2 第 1 条逐字冻结 |
| 模板模块内部命名 | `TemplateAction` / `EXPLAIN_TEMPLATE` / `TRANSLATE_TEMPLATE` / `templateForAction` / `resolveTemplateDraft` | 需求档 §0.7 逐字冻结 |
| 消费端内部命名 | `QuickAskAction`（seam 类型）/ `QUICK_TEMPLATE_REPLACEABLE`（`ChatPanel.vue` 常量） | 需求档 §0.7 逐字冻结（含单行声明形状） |
| 离屏脚本的新常量（**不进 `SEL`**，写死在 R17 块内） | `SHORTCUT_SECTION_TITLES`（3 项）/ `SHORTCUT_ROWS`（18 项 `{key, desc}`）/ `SHORTCUT_NOTE_TEXT` / `EXPLAIN_TEMPLATE` / `TRANSLATE_TEMPLATE` / `NOTES_ASK_TEMPLATE` / `QUICK_ASK_ACTIONS`（4 项）/ `QUICK_ASK_ICONS`（4 项）/ `RIGHT_WIDTH`（`"560px"`） | 「期望值手写、不由被测数据生成」纪律：页面上下文里的字面量一律由 Node 侧常量 `JSON.stringify` 插值 |
| 离屏新增的复用选择 | 几何读数一律走既有 `rectOfSelector(sel, 0)`（存在性 + 视口矩形）与三个新探针；**不新增第 6 个 helper 名**（需求档冻结 5 个） | 需求档 §0.9 第 6 条的 helper 配额 |
| 实现纪律（登记，不写进组件） | `PdfSelectionQuickAsk.vue` 的两个新按钮插入在「问 AI」与「摘录」之间、**同级同缩进**；`ChatPanel.vue` 的 `onQuickAsk` 采用「先判非 `ask` 分支并提前 `return`」的写法，使 `:308` / `:309` 两行的字节与缩进**零变化** | 让 N97-1 判据 2 / N97-2 判据 5 的 `git diff -U0` 「既有行不得作为 `-` 行出现」判据可满足（若把既有两行包进 `if (action === "ask") { … }` 会因缩进变化被 `git diff` 记为 `-` 行 ⇒ 判红） |

---

## 1. 契约冻结表

### 1.1 N96 入口：DOM、类名、就绪与样式（逐字）

| 项 | 逐字值 |
| --- | --- |
| 组件文件 | `pix/src/renderer/components/workspace/ShortcutOverview.vue`（`<script setup lang="ts">`，**无 props / 无 emits**） |
| 挂载点 | `ReaderPanel.vue` 模板 `<PdfSelectionQuickAsk />`（`:258`）**之后**追加一行 `<ShortcutOverview />`；`import ShortcutOverview from "./ShortcutOverview.vue";` 落在既有 import 区（`PdfSelectionQuickAsk` `:25` 之后） |
| 入口元素 | `<button ref="toggleEl" type="button" class="shortcut-toggle" title="快捷键总览（?）" aria-label="快捷键总览" :aria-expanded="open" @click="toggle">` + `<v-icon size="14">mdi-keyboard-outline</v-icon>`（`ref` 只是实现细节，不参与判据） |
| `title` | `快捷键总览（?）`（全角括号；与既有 `.reader-section-prev` 的 `上一节（快捷键 [）` 同风格） |
| `aria-label` | `快捷键总览` |
| `aria-expanded` | `:aria-expanded="open"` ⇒ 关闭态读得字符串 `"false"`、打开态 `"true"`（依据 §0.1 的 `aria-pressed` 先例） |
| 挂载方式 | `<Teleport v-if="pillReady" to=".center-pill">`（与 `.map-toggle` `:192-204` 同范式）；`pillReady` 在 `onMounted` 置为 `!!document.querySelector(".center-pill")`；**只追加**：不插入既有子元素之间、不改 `.pill-label` / `.pill-tab` / 折叠按钮 / `.map-toggle` 的任何属性 |
| 入口样式（逐字） | `.shortcut-toggle { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; margin-left: 2px; padding: 0; border: none; border-radius: 999px; background: transparent; color: var(--pix-text-secondary); cursor: pointer; flex-shrink: 0; }`；`.shortcut-toggle:hover { background: var(--pix-bg-hover, #eef2f6); color: var(--pix-text-primary); }`；`.shortcut-toggle[aria-expanded="true"] { background: var(--pix-bg-active, #dfeaf4); color: var(--pix-text-primary); }` |
| 可见条件 | 只依赖 `pillReady`（工作区挂载 ⇒ 恒真）；**不**读 `readerStore.pageCount` / 不读文件路径 ⇒ 未打开文档时入口同样存在（N98-1） |
| 样式作用域 | `<style scoped>`：`Teleport` 的内容仍带 scoped 属性（既有 `.map-toggle` `:311-344` 为同款先例）⇒ 无需改 `WorkspacePage.vue` |
| 副作用登记 | 新增 1 个常驻元素（`.shortcut-toggle`，宽 20px）⇒ `.center-pill` 变宽约 22px（`gap: 6px` 已含间距，`margin-left: 2px` 为冻结值）；`.pill-label` 的 `textContent` 与既有文本断言零变化（`:3357` / `:9044` / `:9088` 只读文本） |

### 1.2 N96 浮层：DOM、结构、层级与几何（逐字）

| 项 | 逐字值 |
| --- | --- |
| 浮层元素 | `<div v-if="open" ref="panelEl" class="shortcut-overview" role="dialog" aria-label="快捷键总览" tabindex="-1">`（**`v-if` 真删除 DOM**，非 `v-show`） |
| DOM 顺序 | `.shortcut-header`（`.shortcut-title` 文本 `快捷键总览` + `.shortcut-close`）→ 3 × `.shortcut-section`（`.shortcut-section-title` = 组标题 + N × `.shortcut-row`）→ `.shortcut-note`（文本 = `SHORTCUT_NOTE`） |
| 行元素 | `<div class="shortcut-row"><kbd class="shortcut-key">{{ row.keys.join(SHORTCUT_KEY_JOIN) }}</kbd><span class="shortcut-desc">{{ row.desc }}</span></div>`（`v-for` = `section.rows`） |
| 关闭按钮 | `<button type="button" class="shortcut-close" title="关闭" aria-label="关闭" @click="close">` + `<v-icon size="14">mdi-close</v-icon>` |
| 组件内文本来源 | **只有** `SHORTCUT_SECTIONS` 的 `title` / `keys.join(SHORTCUT_KEY_JOIN)` / `desc` 与 `SHORTCUT_NOTE`、浮层标题 `快捷键总览`、关闭按钮的 `关闭`；不得在组件内手写任何键位说明（走查 #3） |
| 定位（逐字） | `position: absolute; top: 40px; left: 8px; z-index: 7;`（包含块 = `.reader-panel`，`position: relative` `ReaderPanel.vue:263-268`） |
| 尺寸（逐字） | `width: 320px; max-height: calc(100% - 104px); overflow-y: auto;` + `display: flex; flex-direction: column; gap: 6px;` |
| 浮层样式（逐字） | `padding: 10px 12px; border: 1px solid var(--pix-border-light, #e3eaf0); border-radius: 12px; background: var(--pix-bg-elevated, #ffffff); box-shadow: var(--pix-shadow-md); color: var(--pix-text-primary); font-family: var(--pix-font-ui); font-size: 12px; line-height: 1.5; outline: none;` |
| 内部样式（逐字） | `.shortcut-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }`；`.shortcut-title { font-size: 12px; font-weight: 600; }`；`.shortcut-close { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0; border: none; border-radius: 999px; background: transparent; color: var(--pix-text-secondary); cursor: pointer; }` + `:hover { background: var(--pix-bg-hover, #eef2f6); color: var(--pix-text-primary); }`；`.shortcut-section-title { margin: 0; font-size: 11px; font-weight: 600; color: var(--pix-text-muted); }`；`.shortcut-row { display: flex; align-items: baseline; gap: 8px; }`；`.shortcut-key { flex: 0 0 auto; min-width: 88px; padding: 1px 6px; border: 1px solid var(--pix-border-light, #e3eaf0); border-radius: 4px; background: var(--pix-bg-code, #f4f6f9); color: var(--pix-text-secondary); font-family: var(--pix-font-mono, monospace); font-size: 11px; line-height: 1.4; white-space: nowrap; }`；`.shortcut-desc { color: var(--pix-text-secondary); }`；`.shortcut-note { margin: 0; padding-top: 4px; border-top: 1px solid var(--pix-border-light, #e3eaf0); color: var(--pix-text-muted); font-size: 11px; }` |
| 层级（实读依据） | `.layout-center` `z-index: 1` + `overflow: hidden`（`AppLayout.vue:128-140`）⇒ 阅读栏自成层叠上下文，浮层的 `z-index: 7` **不可能**覆盖右侧对话栏（不同栏位）；同栏内既有层级：`.pdf-capture-fab` 6 / `.quick-ask` 6（`PdfViewer.vue` / `PdfSelectionQuickAsk.vue`）、搜索面板 4、`.reader-section` 3、`.pane-pill` 2 ⇒ 浮层（7）压住阅读栏内全部既有控件，但**几何上不相交**（见下行） |
| 几何（默认 1600×1000，实读推算） | `.reader-panel` x ∈ [287, 1199]、y ∈ [38, 990]；浮层 x ∈ [295, 615]、y ∈ [78, ≤526]（内容高 ≈ 448px，`max-height` = 952 − 104 = 848 上限）；`.center-pill` 盒 y ∈ [46, 74]（`.pane-pill` `margin: 8px 10px 0` + 高 28 + `.app-layout` padding-top 4 + 拖拽条 34）⇒ 与浮层**剩 4px 余量**；`.pdf-toolbar` `{x:1067, y:79, w:120, h:26}`、`.pdf-page-indicator` `{x:671, y:950}`、`.reader-section` `{x:660, y:919}`、`.pdf-capture-fab` `{x:299, y:949}`（基线测量）⇒ 与浮层**零相交**；`.composer-box` 在右栏（x ≥ 1207）⇒ 零相交 |
| 定位依赖（登记） | 浮层绝对 y = 38 + 40 = **78**；`.center-pill` 盒底 = **74** ⇒ 4px 余量。本轮**不得**改 `.pane-pill` 的 `margin` / `height` / `--pix-pane-pill-height` / `.center-pill` 的 `top`（N96-5 判据 1 的零相交靠这 4px） |
| 与知识地图的关系（修订 M3 的处置②） | `.knowledge-map-slot`（`.reader-stage` 左列，宽 = min(26% × stage 宽, 240px)，默认 ≈ 237px）⇒ 地图打开时浮层矩形与之相交。**本轮接受**：`.knowledge-map-slot` **不**进零相交清单；`r17-1b` 两相位在**地图关闭态**取值（前置断言 `.knowledge-map-slot` 不在 DOM） |
| 可聚焦控件计数（冻结） | 浮层内可聚焦控件**恰 2 个** = 容器自身（`tabindex="-1"`）+ `.shortcut-close`；**无焦点陷阱**（Tab 可离开）；探测口径见 §5.4.2（含「`querySelectorAll` 不含元素自身」的落地写法） |
| 约束 | 不新增 `--pix-*` 变量；不加动画 / 过渡；不做背景遮罩（非模态）；浮层内无输入框 / 无开关 / 无「可配置」入口；点击 `.shortcut-row` / `.shortcut-key` / `.shortcut-desc` **不做任何事**（纯清单） |

### 1.3 N96 键位表：数据源与逐字文案（18 行）

数据源文件 `pix/src/renderer/utils/shortcut-help.ts`（**零 import**），逐字内容：

```ts
/**
 * 快捷键总览的只读数据源（R17 N96）。
 * 冻结：3 组 / 18 行；组件只按 keys.join(SHORTCUT_KEY_JOIN) 与 desc 渲染，不得手写键位文案。
 * 本文件零 import（与 page-anchor.ts / notes-path.ts 同范式）。
 */

export interface ShortcutRow {
  keys: string[];
  desc: string;
}

export interface ShortcutSection {
  title: string;
  rows: ShortcutRow[];
}

export const SHORTCUT_KEY_JOIN = " / ";

export const SHORTCUT_SECTIONS: readonly ShortcutSection[] = [
  {
    title: "阅读区（打开文档后）",
    rows: [
      { keys: ["/"], desc: "打开文档搜索" },
      { keys: ["Ctrl+F"], desc: "打开文档搜索" },
      { keys: ["PageUp", "←"], desc: "上一页" },
      { keys: ["PageDown", "→"], desc: "下一页" },
      { keys: ["Home"], desc: "跳到第一页" },
      { keys: ["End"], desc: "跳到最后一页" },
      { keys: ["["], desc: "上一节" },
      { keys: ["]"], desc: "下一节" },
      { keys: ["Esc"], desc: "退出框选模式或关闭文档搜索" },
    ],
  },
  {
    title: "输入框",
    rows: [
      { keys: ["Enter"], desc: "发送消息（对话输入框）" },
      { keys: ["Shift+Enter"], desc: "换行（对话输入框）" },
      { keys: ["Enter"], desc: "下一处（文档搜索框）" },
      { keys: ["Shift+Enter"], desc: "上一处（文档搜索框）" },
      { keys: ["Enter"], desc: "跳转到该页（页码输入框）" },
      { keys: ["Esc"], desc: "取消页码输入（页码输入框）" },
      { keys: ["Esc"], desc: "清空搜索并移出焦点（笔记搜索框）" },
      { keys: ["Enter"], desc: "提交重命名（对话名称输入框）" },
    ],
  },
  {
    title: "工作区",
    rows: [{ keys: ["?"], desc: "打开或关闭本总览" }],
  },
];

export const SHORTCUT_NOTE = "选区浮层（选中文本后出现，无键位）：问 AI / 解释 / 翻译 / 摘录";
```

**逐行代码依据（本档实读行号）与渲染文本**

| # | 组 | `keys` | 渲染文本（`join(" / ")`） | `desc` | 代码依据 |
| --- | --- | --- | --- | --- | --- |
| 1 | 阅读区（打开文档后） | `["/"]` | `/` | 打开文档搜索 | `PdfViewer.vue:455-458` |
| 2 | 同上 | `["Ctrl+F"]` | `Ctrl+F` | 打开文档搜索 | `PdfViewer.vue:419-427` |
| 3 | 同上 | `["PageUp", "←"]` | `PageUp / ←` | 上一页 | `PdfViewer.vue:463-468` |
| 4 | 同上 | `["PageDown", "→"]` | `PageDown / →` | 下一页 | `PdfViewer.vue:469-474` |
| 5 | 同上 | `["Home"]` | `Home` | 跳到第一页 | `PdfViewer.vue:475-478` |
| 6 | 同上 | `["End"]` | `End` | 跳到最后一页 | `PdfViewer.vue:479-482` |
| 7 | 同上 | `["["]` | `[` | 上一节 | `PdfViewer.vue:445-454` |
| 8 | 同上 | `["]"]` | `]` | 下一节 | 同上 |
| 9 | 同上 | `["Esc"]` | `Esc` | 退出框选模式或关闭文档搜索 | `PdfViewer.vue:434-442` |
| 10 | 输入框 | `["Enter"]` | `Enter` | 发送消息（对话输入框） | `InputArea.vue:28-35` |
| 11 | 同上 | `["Shift+Enter"]` | `Shift+Enter` | 换行（对话输入框） | 同上（未拦截 ⇒ 浏览器默认换行） |
| 12 | 同上 | `["Enter"]` | `Enter` | 下一处（文档搜索框） | `PdfSearchPanel.vue:307-311` |
| 13 | 同上 | `["Shift+Enter"]` | `Shift+Enter` | 上一处（文档搜索框） | 同上 |
| 14 | 同上 | `["Enter"]` | `Enter` | 跳转到该页（页码输入框） | `PdfViewer.vue:1209`（`.prevent`） |
| 15 | 同上 | `["Esc"]` | `Esc` | 取消页码输入（页码输入框） | `PdfViewer.vue:1210`（`.prevent`） |
| 16 | 同上 | `["Esc"]` | `Esc` | 清空搜索并移出焦点（笔记搜索框） | `NotesPanel.vue:222-226` + 模板 `:631` |
| 17 | 同上 | `["Enter"]` | `Enter` | 提交重命名（对话名称输入框） | `ChatPanel.vue:1166` + `onRenameEnter` `:708-711`（`isComposing` 守卫 `:709`） |
| 18 | 工作区 | `["?"]` | `?` | 打开或关闭本总览 | 本轮新增（§1.4） |

**注册纪律**

1. 行数与分组数写死：**3 组 / 18 行**（9 + 8 + 1）；`keys` / `desc` / 组标题 / `SHORTCUT_KEY_JOIN` / `SHORTCUT_NOTE` 逐字冻结，评审与开发不得改字、不得增删行。
2. 表内**不得**出现：`ArrowUp` / `ArrowDown`（`:462-483` 无分支）、任何「摘录键位」、任何「缩放键位」（缩放只有 `Ctrl+滚轮` 手势，`zoomBy` 只有按钮 `:1081-1083`）、框架级默认键位（Vuetify 对话框 Esc 等，无应用侧监听）。
3. `SHORTCUT_NOTE` 是唯一登记「摘录」的位置（选区浮层动作没有键位这一事实的显式说明）；不得为摘录编造键位，也不得删除该行。
4. 说明行只写主语义；守卫细节（框选模式下 `[`/`]` 不生效、首末页翻页 no-op、`?` 在输入框内不触发）由 §1.4 与本文承载，**不塞进 `desc`**；第 18 行 `desc` 已按此改字（M5）。
5. **收录口径**：只登记「工作区内应用代码显式注册 `keydown` 监听的键位」+「composer 的 `Shift+Enter` 换行（浏览器默认，因未拦截）」。`SettingsPage.vue:491` 为**工作区外 ⇒ 范围外**（登记）；Vuetify 对话框默认与浏览器全局默认不入表。
6. **`?` 与 `/` 互不误触**：`PdfViewer.vue:455` 判 `event.key === "/"`，本轮 `?` 分支判 `event.key === "?"`（US 布局下 `?` = Shift+`/`）⇒ 两者按 `event.key` 天然分离；`PdfViewer.vue` 本轮**零 diff** ⇒ `/` 语义不变。

### 1.4 N96 开关、关闭路径与焦点管理（实现级顺序）

**参考实现（`ShortcutOverview.vue` 的 `<script setup>`，逐字冻结）**

```vue
<script setup lang="ts">
/**
 * ShortcutOverview — 「快捷键总览」入口（Teleport 进 .center-pill）与只读浮层（R17 N96/N98）。
 * 键位文案全部来自 utils/shortcut-help.ts；不读取阅读器状态、不做持久化、不改既有键位语义。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { SHORTCUT_KEY_JOIN, SHORTCUT_NOTE, SHORTCUT_SECTIONS } from "../../utils/shortcut-help";

const open = ref(false);
const pillReady = ref(false);
const panelEl = ref<HTMLDivElement | null>(null);
const toggleEl = ref<HTMLButtonElement | null>(null);
/** 打开前的焦点元素；关闭时优先归还（不可连接则退回入口按钮）。 */
let lastFocused: HTMLElement | null = null;

/** 与 PdfViewer.vue:400-407 的谓词逐字同构（有意重复：本轮 PdfViewer.vue 零 diff）。 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function close(): void {
  if (!open.value) return;
  open.value = false;
  if (lastFocused?.isConnected) lastFocused.focus();
  else toggleEl.value?.focus();
  lastFocused = null;
}

async function toggle(): Promise<void> {
  if (open.value) {
    close();
    return;
  }
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  open.value = true;
  await nextTick();
  panelEl.value?.focus();
}

/** 点击浮层与入口之外 ⇒ 关闭（浮层打开期间挂载）。 */
function onDocumentPointerdown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (panelEl.value?.contains(target)) return;
  if (toggleEl.value?.contains(target)) return;
  close();
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    // 关闭浮层但绝不阻断阅读区既有 Esc 语义（不 preventDefault、不 stopPropagation）。
    if (open.value) close();
    return;
  }
  if (event.key !== "?") return;
  if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  // 输入框 / 可编辑目标内不触发，且不得 preventDefault（早退在 preventDefault 之前）。
  if (isEditableTarget(event.target)) return;
  event.preventDefault();
  void toggle();
}

watch(open, (value) => {
  if (value) document.addEventListener("pointerdown", onDocumentPointerdown);
  else document.removeEventListener("pointerdown", onDocumentPointerdown);
});

onMounted(() => {
  pillReady.value = !!document.querySelector(".center-pill");
  window.addEventListener("keydown", onWindowKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onWindowKeydown);
  document.removeEventListener("pointerdown", onDocumentPointerdown);
});
</script>
```

| 项 | 逐字值 / 判据 |
| --- | --- |
| 打开（入口） | `@click="toggle"`（已开则关闭） |
| 打开（键位） | `event.key === "?"` 且通过三分支守卫后 `preventDefault()` + `toggle()` |
| 分支顺序（冻结） | ① `Escape` 分支提前 `return`（只处理关闭，不碰其它语义）→ ② `if (event.key !== "?") return;` → ③ `if (event.ctrlKey \|\| event.altKey \|\| event.metaKey \|\| event.isComposing) return;` → ④ `if (isEditableTarget(event.target)) return;` → ⑤ `event.preventDefault(); void toggle();`。**`isEditableTarget` 的 `return` 必须在 `preventDefault()` 之前**（走查 #5 逐字对位） |
| `isEditableTarget` | 组件内本地副本，与 `PdfViewer.vue:400-407` 逐字同构（**有意重复**：本轮 `PdfViewer.vue` 零 diff、不抽共享 util） |
| 监听生命周期 | `onMounted` 注册 `window` 的 `keydown`（**bubble 阶段**，不加捕获）；`onBeforeUnmount` 注销；监听器常驻（组件随工作区存在）⇒ `?` 在浮层关闭时同样可用 |
| 关闭（Esc） | 浮层打开时 `Escape` ⇒ `close()`；不 `stopPropagation`、不 `preventDefault` ⇒ 阅读区既有顺序（capture Esc `:434-437` / search Esc `:439-442`）不受影响；浮层与文档搜索同开时**一次 Esc 双响应**（浮层离开 DOM + `.pdf-search-panel` 离开 DOM，`r17-1` 判据） |
| 关闭（点击外部） | 浮层打开期间监听 `document` 的 `pointerdown`：目标不在 `.shortcut-overview` 且不在 `.shortcut-toggle` 子树内 ⇒ `close()`；监听随 `open` 挂 / 卸（`watch`）+ `onBeforeUnmount` 兜底 |
| 关闭（入口 / 关闭按钮） | 再点入口 ⇒ `close()`；点 `.shortcut-close` ⇒ `close()` |
| 打开后焦点 | 记录 `lastFocused = document.activeElement`（`HTMLElement` 才记录）；`nextTick` 后 `panelEl.focus()`（`tabindex="-1"`，不进 Tab 顺序、无陷阱） |
| 关闭后焦点归还 | `lastFocused?.isConnected` ⇒ `lastFocused.focus()`；否则 `toggleEl?.focus()`；**body 分支**：打开前把焦点置于 `document.body`（前置步 = 对当前 `activeElement` 调 `blur()`，自检 `activeElement === document.body`）⇒ 关闭后仍为 `document.body`（`body.focus()` 无副作用）；**入口分支的可判前置（定稿 D2）**：`clickEl` = `el.click()`（`ui-shot.mjs:7273`），程序化点击**不移动焦点** ⇒ 断言必须先在入口上 `focus()` 并自检 `activeElement === .shortcut-toggle` 再打开（否则 `lastFocused` 仍为 `document.body`、关闭后焦点回落 body，该断言不可满足） |
| 关闭即清理 | `v-if` 真删除 ⇒ `document.querySelector(".shortcut-overview") === null`；`aria-expanded === "false"`；无持久化（无 `localStorage` / 无状态落点 / 无 IPC）；监听成对注销（走查 #9） |
| 不劫持 | 打开期间 `/`、`Ctrl+F`、`[`、`]`、翻页键、composer 的 `Enter` 全部照常；`?` 在 `INPUT` / `TEXTAREA` / `SELECT` / `contenteditable` 上不触发、不 `preventDefault`、不改输入内容（`r17-1` 相位 ②④ 判 `dispatchEvent` 返回 `true`） |
| 登记行为（非缺陷） | ① 浮层打开时在 composer（TEXTAREA）内按 `Esc` 会关闭浮层（按 §1.4 关闭路径②，不拦截按键、不改草稿）；② 点击 `.map-toggle` / `.pill-tab` 等浮层外元素时先关闭浮层，随后该控件自身动作照常（关闭路径不含 `preventDefault`），单击一次即可完成其本意；③ 笔记搜索框（`.notes-search-input`）内按 `Esc` **不会**关闭浮层：`NotesPanel.vue:225` 的 `stopPropagation()` 阻断冒泡 ⇒ 不触达 window 监听（本轮无判据依赖，登记；**定稿采纳评审 §2.3**） |

### 1.5 N97 模板动作：DOM、文案、图标与几何（逐字）

| 项 | 逐字值 |
| --- | --- |
| DOM 顺序（`mode === "actions"`） | `问 AI`（既有 `:205-208`）→ `解释`（新增）→ `翻译`（新增）→ `摘录`（既有 `:209-218`，`v-if="canExcerpt"`） |
| 「解释」按钮 | `<button type="button" class="quick-ask-btn" :disabled="pending" @click="onTemplateClick('explain')">` + `<v-icon size="12">mdi-lightbulb-on-outline</v-icon>` + 文本 `解释` |
| 「翻译」按钮 | 同构：`@click="onTemplateClick('translate')"` + `<v-icon size="12">mdi-translate</v-icon>` + 文本 `翻译` |
| 不新增 | 不新增 `title`、不新增类名、不新增样式（复用 `.quick-ask-btn` `:244-264` 逐字）、不动 `:disabled="pending"` 语义（摘录入库期间四个按钮一并禁用） |
| 插入纪律（登记） | 两个新按钮与既有按钮**同级同缩进**插入 ⇒ 既有 `问 AI` / `摘录` 两段模板的字节零变化（N97-1 判据 2 的 `git diff -U0` 判据） |
| 点击语义 | `onTemplateClick(action)`：**先取** `const text = cachedText;` → `hide();` → `if (text) emitQuickAsk(text, action);`（与既有 `onButtonClick` `:148-152` **逐字同构**；顺序不可颠倒 —— `hide()` `:94` 会清空 `cachedText`，颠倒则发射空串） |
| `onTemplateClick` 形状（逐字冻结） | 函数体恰三行且次序写死：`const text = cachedText;` → `hide();` → `if (text) emitQuickAsk(text, action);`；签名 `function onTemplateClick(action: TemplateAction): void`；新增 import：`import type { TemplateAction } from "../../utils/quick-ask-templates";` |
| 不做 | 不调 `notesStore`、不发送、不改选区、不改 `readerStore`、不新增反馈态、不改 `hide()` / `showFor` / clamp / 常量 |
| 几何（复用既有盒模型） | `.quick-ask` 逐字不变（`display: inline-flex` / `gap: 2px` / `padding: 2px 4px` / `border-radius: 999px`；`flex-wrap` 默认 `nowrap`）⇒ 4 按钮天然单行；clamp 逐字不变（`STAGE_PADDING = 4` / `BUTTON_GAP = 6`）⇒ 浮层构造上被钳制在 `.reader-stage` 视口内 |
| 几何推算（本档实算，作判据参考） | 4 按钮 + 3 个 2px 间隙 + 8px 内边距 + 2px 边框 ⇒ 浮层宽 ≈ 300px（< 320px 的浮层配额不存在，此处是 `.quick-ask`）；默认宽度下选区右缘 = 443 + 56 + 387 = **886**（基线：页 x 443、页 1 首 span `dx 56` / `w 387`）⇒ 右缘钳制不触发；窄栏（`--pix-right-width: 560px`）下 `.reader-stage` 右缘 ≈ **1019**、选区右缘仍 886 ⇒ 不触发；200% 缩放下首个 span 右缘 ≈ 303 + (56 + 387) × 2 = **1189** > 1019 ⇒ **右缘钳制必然触发**（`float.right = stage.right − 4`） |
| 三动作形态 | `canExcerpt === false` 时 DOM 为 3 个动作（`问 AI` / `解释` / `翻译`）；夹具内选区恒可定位到页 ⇒ 离屏只断言 4 动作形态，3 动作形态由既有 `canExcerpt` 门控保证（走查，不写不可达断言） |

### 1.6 N97 预填 seam：签名、调用链与消费端（逐字）

**`pix/src/renderer/composables/useQuickAsk.ts`（本轮改动面）**

```ts
export type QuickAskAction = "ask" | "explain" | "translate";

export type QuickAskHandler = (text: string, action: QuickAskAction) => void;

export function registerQuickAskConsumer(handler: QuickAskHandler | null): void {
  currentHandler = handler;
}

export function emitQuickAsk(text: string, action: QuickAskAction = "ask"): void {
  currentHandler?.(text, action);
}
```

`registerQuickAskConsumer` 签名与笔记 seam（`registerNotesAskConsumer` / `emitNotesAsk`）**零改动**。

**`pix/src/renderer/utils/quick-ask-templates.ts`（新建，零 import，逐字内容）**

```ts
/**
 * 选区模板动作的纯函数与字面（R17 N97）。
 * 零 import：只被 PdfSelectionQuickAsk.vue / ChatPanel.vue 引用，并被 smoke-view 直驱。
 */

export type TemplateAction = "explain" | "translate";

export const EXPLAIN_TEMPLATE = "请解释选中的这段话在论文中的含义与作用：";
export const TRANSLATE_TEMPLATE = "请把选中的这段话翻译成中文：";

export function templateForAction(action: TemplateAction): string {
  return action === "explain" ? EXPLAIN_TEMPLATE : TRANSLATE_TEMPLATE;
}

/**
 * 草稿替换规则（三分支，冻结）：
 * ① current 为空或纯空白 ⇒ 返回 template；
 * ② current 逐字等于 replaceableTemplates 之一（含首尾空白差异即不匹配）⇒ 返回 template；
 * ③ 其余 ⇒ null（调用方一字不改）。
 */
export function resolveTemplateDraft(
  current: string,
  template: string,
  replaceableTemplates: readonly string[],
): string | null {
  if (current.trim() === "") return template;
  if (replaceableTemplates.includes(current)) return template;
  return null;
}
```

**调用链（唯一链路，逐字）**

```text
PdfSelectionQuickAsk.vue  onTemplateClick("explain" | "translate")
   → emitQuickAsk(text, action)                     // composables/useQuickAsk.ts（默认值 "ask" 只服务既有调用）
   → currentHandler(text, action)
   → ChatPanel.vue  onQuickAsk(text, action)        // 唯一消费方（注册点 :848）
   → resolveTemplateDraft(draft.value, templateForAction(action), QUICK_TEMPLATE_REPLACEABLE)
   → 非 null 才 draft.value = next
   → composerInput.value?.focus()                   // 既有 InputArea 的 defineExpose({ focus })（:48）
```

**`ChatPanel.vue` 的消费端（逐字，含缩进纪律）**

```ts
const QUICK_ASK_TEMPLATE = "请解释选中的这段话：";
const QUICK_TEMPLATE_REPLACEABLE: readonly string[] = [QUICK_ASK_TEMPLATE, EXPLAIN_TEMPLATE, TRANSLATE_TEMPLATE];

function onQuickAsk(text: string, action: QuickAskAction = "ask"): void {
  // 原文已由「选中文本」chip 注入发送链路，这里只补模板文案并聚焦，不覆盖输入。
  if (action !== "ask") {
    const next = resolveTemplateDraft(draft.value, templateForAction(action), QUICK_TEMPLATE_REPLACEABLE);
    if (next !== null) draft.value = next;
    composerInput.value?.focus();
    return;
  }
  if (!draft.value) draft.value = QUICK_ASK_TEMPLATE;
  composerInput.value?.focus();
}
```

| 项 | 逐字值 / 判据 |
| --- | --- |
| `action === "ask"` 分支 | 既有 `if (!draft.value) draft.value = QUICK_ASK_TEMPLATE;` 与 `composerInput.value?.focus();` **两行字节与缩进零变化**；`ask` 的非空草稿语义（一字不改）逐字保持 |
| 新动作分支 | `explain` / `translate`：命中 ①② 才写草稿（`next !== null`）、其余一字不改；**不发送、不弹提示、不写 notice**；`text` 形参不被使用（`tsconfig` 未开 `noUnusedParameters`，见 §0.1） |
| 可替换集合 | `const QUICK_TEMPLATE_REPLACEABLE: readonly string[] = [QUICK_ASK_TEMPLATE, EXPLAIN_TEMPLATE, TRANSLATE_TEMPLATE];`（**单行、逐字、不含** `NOTES_ASK_TEMPLATE`）；`grep -c` 该标识符 = 2（定义 1 + 使用 1） |
| 新增 import | `import { EXPLAIN_TEMPLATE, TRANSLATE_TEMPLATE, resolveTemplateDraft } from "../../utils/quick-ask-templates";` + `import type { QuickAskAction } from "../../composables/useQuickAsk";`（后者与既有 `useQuickAsk` 值导入并列；仓内 `import type` 已有先例） |
| 规则动机（登记） | 备选「只在草稿为空时填入」未采用（用户在「解释」后想改「翻译」必须手动全清）⇒ 只替换**机器生成的模板**，用户手写内容一字不改 |

### 1.7 N97 与既有 chips / 载荷的关系（不发送，零改动）

| 面 | 结论 | 判据 |
| --- | --- | --- |
| 选区 | 点击不清塌：`.quick-ask` 的 `@pointerdown.prevent`（`:202`）逐字不变 | `r17-2` 三相位：点击后 `getSelection().toString()` 与点击前逐字相等、`collapsed === false` |
| chips | `.context-chip*` 结构 / 文案 / 生成时机零改动；模板动作不调用任何 chip 相关代码 | `chipSnapshot()` 的 `count` / `labels` / `notesLabel` 与点击前逐字相等 |
| 载荷装配 | `send()` / `notes-path` / `reading-context.ts` 零 diff；模板动作不写 `<reading_context>` 实参 | `git diff --stat -- pix/src/renderer/utils/reading-context.ts` 为空；`send(` 函数体无 `-` 行 |
| 不发送 | 不调用 `send()`、不产生乐观用户块 | `sendCalls().count` 增量 = 0 且 `.chat-messages .message-block` 计数不变（三相位各判） |
| 浮层落位 | 点击后既有 `hide()` 生效：`display === "none"`、`btnCount === 3`（`selectionPage` 被置 `null` ⇒ 摘录因 `canExcerpt` 掉落）、`mode === "actions"` 复位 | `quickAskStateProbe()`（`:5459-5469`）+ `r17-2` 断言 |

### 1.8 N98 title / aria 逐字与可见条件（不打扰）

| 项 | 逐字值 |
| --- | --- |
| 入口 `title` | `快捷键总览（?）` |
| 入口 `aria-label` | `快捷键总览` |
| 入口 `aria-expanded` | `"false"`（关闭）/ `"true"`（打开） |
| 浮层 `role` / `aria-label` / `tabindex` | `role="dialog"` / `aria-label="快捷键总览"` / `tabindex="-1"` |
| 关闭按钮 `title` / `aria-label` | `关闭` / `关闭` |
| 可见条件 | 只看 `pillReady`（工作区 + `.center-pill` 存在）⇒ 未打开文档时同样可见；组件内 `grep -c "pageCount\|readerStore"` = 0 |
| 不打扰 | 不新增常驻提示条；不自动打开（进入工作区首帧 `.shortcut-overview` / `.shortcut-row` / `.shortcut-key` / `.shortcut-note` 计数全 0）；无首次运行分支（`grep -ci "first\|seen\|dismiss"` = 0）；无 `localStorage` / 资产字段 / IPC |

### 1.9 N99 断言与场景清单（冻结配额）

| 面 | 冻结内容 | 落点 |
| --- | --- | --- |
| 烟测-渲染 | `smoke-view.mjs` 新增 2 组 **23** 条：`shortcut-table` **12** + `template-draft` **11**（既有 7 组 51 条 ⇒ 9 组 **74** 条） | §5.1（末行逐字 `通过 74 / 失败 0`） |
| 编译面 | `files` / `required` 各追加 2 项；`allowed` 由 `required + "shared/types.js"` 推导；新增模块句柄 `shortcutHelp` / `quickAskTemplates` | §5.2 |
| 烟测-主进程 | `smoke-notes.mjs` **零改动**（10 组 65 条只作回归） | §5.3 |
| 离屏场景 | `r17-1` / `r17-1b` / `r17-2` / `r17-2b` 四场景 / 四组 / **11** 条 `record` / **7** 张截图 / 新增 **4** 种 label | §5.4 |
| `SEL` 增量 | **6** 项（64 → **70**）：`shortcutToggle` / `shortcutOverview` / `shortcutRow` / `shortcutKey` / `shortcutNote` / `composerBox` | §5.4.1 |
| 新增 helper | 冻结 **5** 个：`shortcutProbe()` / `quickAskActionsProbe()` / `layoutVar(name, value)` / `intersects(a, b)` / `pressKeyOnReturning(selector, key)` | §5.4.2 |
| 既有断言改写 | **唯一一处**：三处 `btnCount === 2` ⇒ `=== 4`（`:5518` / `:6987` / `:7059`） | §2.2 |
| 目标读数 | `MANIFEST.json.shots.length = 173`（166 + 7）、`failure === null`、目录内 png = 173；`MEASUREMENTS.json` 长度 = **248**（237 + 11）、`label` 去重 = **68**（64 + 4） | §5.5 |

---

## 2. 与既有冻结面的关系

### 2.1 本轮不得改动的既有类名 / 文案 / 场景 / 断言（零改动清单）

| 面 | 冻结内容 |
| --- | --- |
| R3 / R11 / R16 `.quick-ask` | 类名 `.quick-ask` / `.quick-ask-btn` / `.quick-ask-feedback`（含 `.is-ok` / `.is-duplicate` / `.is-error`）；`问 AI` / `摘录` 文案与图标（`mdi-comment-question-outline` / `mdi-notebook-plus-outline`）；`canExcerpt` 门控；`@pointerdown.prevent`；`mode` 三态、`FEEDBACK_MS = 2500`、同文本保态分支 `:136`、`onSelectionChange` / `onStageScroll` / `watch(filePath)` 隐藏规则、`MIN_SELECTION_CHARS` / `BUTTON_GAP` / `STAGE_PADDING` / clamp 块 `:80-89`；`hide()` / `showFeedback()` / `onExcerptClick()` / `onButtonClick()` 现有语句 |
| R8 / R9 composer | `draft` 读写、`InputArea` 的 Enter 发送 / Shift+Enter 换行 / IME 守卫、发送失败还原、`QUICK_ASK_TEMPLATE` 与 `NOTES_ASK_TEMPLATE` 两个字面与 `onNotesAsk` 分支、`send()` |
| R9 / R10 / R13 chips 与载荷 | `.context-chip*` 结构 / 文案、`send()` 内的快照 / 排除集 / `<reading_context>` 装配、`utils/reading-context.ts`、`utils/notes-path.ts` |
| R11 / R12 / R16 阅读区键位 | `onWindowKeydown` `:415-484` 八个分支与顺序、`isEditableTarget` `:400-407`、`setKeydownListener` `:489-497`、`PdfSearchPanel` 输入框 Enter、`NotesPanel` 搜索框 Esc 的 `stopPropagation`、页码输入框 Enter / Esc |
| R11 / R16 PDF 文字层与高亮 | `.textLayer` DOM、`pix-search` / `pix-search-current` / `pix-note-anchor` 注册表与三条 `::highlight()` 规则、`.pdf-page` 子元素结构 |
| R16 取证契约 | `ui-shot.mjs` 启动守卫、产物自净、结束自检、`SEL` 既有 64 项（**零改写零删除**）、既有场景 / 相位 / label / 截图名 / helper 零改写（§2.2 登记的三处按钮数断言除外）、`record` 的「先落测量再抛错」 |
| 全局 | `.pdf-*` / `.map-*` / `.tree-*` / `.reader-*` / `.notes-*` / `.pill-*` / `.pane-*` 既有类名与中文文案；`--pix-*` 变量表（**不新增变量**）；`.pane-pill` 的 `margin` / `height` / `--pix-pane-pill-height`（浮层 4px 余量依赖它们）；知识地图（`.knowledge-map-slot` / `KnowledgeMap.vue` / `readerStore.mapOpen`）；`pix/src/main/**` 与 `pix/src/shared/types.ts`（零 diff）；`pix/package.json`（不新增 script）；`packages/**`、lockfile、electron-builder 配置；`docs/pm/**` 的历史档件 |
| 既有烟测 | `smoke-view.mjs` 既有 7 组 51 条与 `files` / `required` / `allowed` 的既有项零改动（只各追加 2 项）；`smoke-notes.mjs` 整文件零 diff |

### 2.2 本轮对既有面的显式改动（逐字：文件 / 旧值 / 新值 / 理由）

| # | 文件 : 位置 | 旧值（逐字 / 现状） | 新值（逐字） | 理由 |
| --- | --- | --- | --- | --- |
| 1 | `pix/src/renderer/utils/shortcut-help.ts` | 文件不存在 | **新建**：§1.3 的类型 + `SHORTCUT_SECTIONS`（3 组 18 行）+ `SHORTCUT_KEY_JOIN` + `SHORTCUT_NOTE`（零 import） | N96 / N99-2 |
| 2 | `pix/src/renderer/utils/quick-ask-templates.ts` | 文件不存在 | **新建**：§1.6 的 `TemplateAction` / 两个模板 / `templateForAction` / `resolveTemplateDraft`（零 import） | N97 / N99-2 |
| 3 | `pix/src/renderer/components/workspace/ShortcutOverview.vue` | 文件不存在 | **新建**：§1.4 的参考实现 + §1.1 / §1.2 的模板与样式 | N96 / N98 |
| 4 | `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` : import 区（`:12` 附近） | `import { emitQuickAsk } from "../../composables/useQuickAsk";` | 追加一行 `import type { TemplateAction } from "../../utils/quick-ask-templates";` | §1.5 的 `onTemplateClick` 签名 |
| 5 | 同上 : `onButtonClick` 之后（`:153` 附近） | 无 `onTemplateClick` | 新增 `function onTemplateClick(action: TemplateAction): void { … }`（§1.5 三行形状） | N97-2 / N97-3 |
| 6 | 同上 : 模板 `:204-219`（`mode === "actions"` 块内） | 「问 AI」`:205-208` → 「摘录」`:209-218` | 在两者**之间**插入两个 `.quick-ask-btn`（解释 / 翻译）；既有两段字节零变化 | N97-1 / N97-4 |
| 7 | `pix/src/renderer/composables/useQuickAsk.ts` : `:10-19` 段 | `QuickAskHandler = (text: string) => void` / `emitQuickAsk(text)` | §1.6 的四行新签名（新增 `QuickAskAction`、第二参数、默认值 `"ask"`） | N97-2 |
| 8 | `pix/src/renderer/components/workspace/ChatPanel.vue` : import 区 | 无模板 util 导入 | 追加 `import { EXPLAIN_TEMPLATE, TRANSLATE_TEMPLATE, resolveTemplateDraft } from "../../utils/quick-ask-templates";` 与 `import type { QuickAskAction } from "../../composables/useQuickAsk";` | §1.6 |
| 9 | 同上 : `:306-310` | `function onQuickAsk(): void {` + 注释 + `if (!draft.value) draft.value = QUICK_ASK_TEMPLATE;` + `composerInput.value?.focus();` | 改为 §1.6 的五段式函数体（签名带 `text` / `action`；非 `ask` 分支提前 `return`；既有两行**缩进与字节零变化**） | N97-2 的 `git diff -U0` 判据（§0.3 纪律） |
| 10 | 同上 : `:304` 之后 | 无 `QUICK_TEMPLATE_REPLACEABLE` | 新增单行 `const QUICK_TEMPLATE_REPLACEABLE: readonly string[] = [QUICK_ASK_TEMPLATE, EXPLAIN_TEMPLATE, TRANSLATE_TEMPLATE];` | N97-2 判据 5（M7） |
| 11 | `pix/src/renderer/components/workspace/ReaderPanel.vue` : import 区（`:25` 附近）与模板（`:258`） | 无 `ShortcutOverview` | 追加 `import ShortcutOverview from "./ShortcutOverview.vue";` + 一行 `<ShortcutOverview />`（`<PdfSelectionQuickAsk />` 之后） | §1.1 挂载点 |
| 12 | `pix/scripts/smoke-view.mjs` : 句柄声明（`:139-142`） | 4 个句柄 | 追加 `let shortcutHelp = null;` 与 `let quickAskTemplates = null;` | §5.2 |
| 13 | 同上 : `files`（`:780-786`）与 `required`（`:799`） | 4 个源文件 / 4 个产物 | 各追加 `renderer/utils/shortcut-help.ts` / `renderer/utils/quick-ask-templates.ts` 与其 `.js` | §5.2 |
| 14 | 同上 : `compileAndLoad()` 尾部 `require` 段（`:817-822`） | 4 个 `require` | 追加两个 `require`（句柄见 #12） | §5.2 |
| 15 | 同上 : `main()`（`:830-836`） | 7 行组调用 | 末尾追加 `runShortcutTable();` 与 `runTemplateDraft();` | §5.1 |
| 16 | 同上 : 新增两函数 | —— | 新增 `runShortcutTable()`（12 条）与 `runTemplateDraft()`（11 条）及手写期望常量 | §5.1 |
| 17 | `pix/scripts/ui-shot.mjs` : `SEL`（`:47-118`，末项 `notePageBadge`） | **64** 项 | 追加 6 项（§5.4.1）；既有 64 项逐字不动 | §5.4.1 |
| 18 | 同上 : R17 块（`runReaderStateScenarios` 内，`:10234` 之后 / `:10235` 之前） | r16-5 收尾以 `await restoreStandardSeed();` 结束 | 追加 R17 块：5 个 helper + 手写常量 + 4 个场景（4 组 11 条 record / 7 张截图） | §5.4 |
| 19 | 同上 : `:5518` | `state.btnCount === 2 &&` | `state.btnCount === 4 &&` | 本轮新增两个动作（`ensureQuickAskExcerptReady` 的 `ready` 判据） |
| 20 | 同上 : `:6987` | `...(goneP4.probe.feedbackClass === null && goneP4.probe.btnCount === 2 && goneP4.probe.display !== "none" && …` | 同处 `btnCount === 2` ⇒ `btnCount === 4`（其余条件逐字不变） | 同上（r11-3 相位 4 到期回落） |
| 21 | 同上 : `:7059` | `...(afterDifferentTextP5b.display !== "none" && afterDifferentTextP5b.btnCount === 2` | 同处 `btnCount === 2` ⇒ `btnCount === 4`（其余条件逐字不变） | 同上（r11-3 相位 5b 不同文本回落） |

**本轮改写的既有断言（逐字列出，仅此三处）**

```text
ui-shot.mjs:5518   state.btnCount === 2 &&                                              ⇒ state.btnCount === 4 &&
ui-shot.mjs:6987   ...goneP4.probe.btnCount === 2 && goneP4.probe.display !== "none"... ⇒ ...goneP4.probe.btnCount === 4 && goneP4.probe.display !== "none"...
ui-shot.mjs:7059   ...afterDifferentTextP5b.display !== "none" && afterDifferentTextP5b.btnCount === 2  ⇒ ...btnCount === 4
```

**允许的内容变化（非 diff，登记）**：① `.quick-ask` 变宽约 114px（4 按钮）⇒ 两张整窗截图与三张 `rectOf(SEL.quickAsk, 30)` 裁切截图的像素变化（§0.1，仓内无像素比对 ⇒ 不判红，由 dev 档目视登记）；② `.center-pill` 内新增 20px 入口按钮 ⇒ pill 变宽约 22px（`textContent` 断言不受影响）；③ 有浮层打开的相位内，阅读栏左上出现 320px 白底浮层。

**允许的行位移（判据口径）**：`git diff -U0 -- pix/scripts/ui-shot.mjs | grep -E "^[-]"` 只允许出现 §2.2 #17 / #18 / #19 / #20 / #21 五处的相邻行位移（`SEL` 末项后的 `};` 行、`:10235` 的 `}` 行前缀、以及三处 `btnCount` 行本身）；`git diff -U0 -- pix/scripts/smoke-view.mjs | grep -E "^[-]"` 只允许出现 §2.2 #12–#16 的相邻行位移。

### 2.3 零 diff 判据命令

```bash
cd E:/develop/PiX-Read
# 既有冻结面（本轮必须零 diff）
git diff -- pix/src/main pix/src/shared/types.ts pix/src/renderer/components/workspace/PdfViewer.vue \
           pix/src/renderer/components/workspace/PdfSearchPanel.vue pix/src/renderer/components/workspace/NotesPanel.vue \
           pix/src/renderer/components/workspace/KnowledgeMap.vue pix/src/renderer/components/input/InputArea.vue \
           pix/src/renderer/pages/WorkspacePage.vue pix/src/renderer/pages/SettingsPage.vue \
           pix/src/renderer/stores pix/src/renderer/utils/reading-context.ts pix/src/renderer/utils/notes-path.ts \
           pix/src/renderer/utils/outline-notes.ts pix/src/renderer/utils/page-anchor.ts \
           pix/src/renderer/assets/styles pix/package.json package-lock.json packages pix/scripts/smoke-notes.mjs
# ⇒ 全部路径逐条为空

# 既有 .quick-ask 规则名不得作为 + / - 行出现（只允许新增按钮与 onTemplateClick）
git diff -U0 -- pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue | grep -E "^[+-].*\.(quick-ask|quick-ask-btn|quick-ask-feedback)" | grep -v "^+++" | grep -v "^---"
# ⇒ 空

# 「问 AI」/「摘录」两段与 composer 既有模板行不得作为 - 行出现
git diff -U0 -- pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue | grep -E "^-" | grep -E "问 AI|摘录|mdi-notebook-plus-outline|mdi-comment-question-outline"
git diff -U0 -- pix/src/renderer/components/workspace/ChatPanel.vue | grep -E "^-" | grep -E "QUICK_ASK_TEMPLATE|NOTES_ASK_TEMPLATE"
# ⇒ 两条均空

# 既有阅读区键位面零 diff（本轮键位表是只读清单，不是被改对象）
git diff -- pix/src/renderer/components/workspace/PdfViewer.vue
# ⇒ 空
```

---

## 3. 失败路径表

| # | 情形 | 期望表现（逐字） | 证据 / 判据 |
| --- | --- | --- | --- |
| 1 | `?` 落在 TEXTAREA / INPUT（composer、文档搜索框、笔记搜索框、页码输入框、重命名输入框） | **不打开 / 不关闭浮层**、**不 `preventDefault`**、输入内容零变化 | `r17-1` 相位 `key-toggle-and-typing-guard` ①②④（`pressKeyOnReturning` 返回 `true`）；走查 #5 |
| 2 | `?` 处于 IME 组合态 | 早退：不 toggle、不 `preventDefault`（与 R15 纪律同口径） | 走查 #5（`grep -c "isComposing"` = 1）；组合态无法在离屏构造（登记） |
| 3 | `?` 带 `Ctrl` / `Alt` / `Meta` | 早退：不 toggle（不干扰 `Ctrl+F` 等既有分支） | 走查 #5；`PdfViewer` 的 `Ctrl+F` 分支零 diff |
| 4 | 浮层已打开时按 `?` | 关闭（toggle 语义），`aria-expanded` 回 `"false"` | `r17-1` 相位 `key-toggle-and-typing-guard` ③ |
| 5 | 浮层关闭时按 `Esc` | **零副作用**：不 toggle、`close()` 因 `open === false` 直接返回、不改焦点、不 `preventDefault`、不阻断阅读区语义 | 走查 #5（Escape 分支带 `open.value` 守卫）；`r17-1` 相位 `key-toggle-and-typing-guard` ⑤ 前的既有语义判据 |
| 6 | 浮层打开时按 `Esc`（同期文档搜索也开） | 浮层与 `.pdf-search-panel` **同时**离开 DOM（同一次按键双响应，登记为既定行为） | `r17-1` 相位 `key-toggle-and-typing-guard` ⑤ |
| 7 | 浮层打开时按 `Esc`（框选模式开启） | 浮层关闭且框选模式照常退出（先 `hide()` 后 `exitCaptureMode()` 或反之，二者都不被阻断） | 走查 #5（无 `stopPropagation`）；R11/R16 的 capture Esc 既有场景零变更 |
| 8 | 点击浮层内部非按钮区域（`.shortcut-row` / `.shortcut-key` / `.shortcut-note`） | **不关闭**、零动作（纯清单） | 关闭路径①（`panelEl.contains(target)` 早退）；点行不做任何事（反需求 4） |
| 9 | 点击 `.shortcut-close` | 关闭 + 焦点归还 | `r17-1` 相位 `close-paths-and-focus-return` |
| 10 | 点击入口（已打开） | 关闭（同一按钮 toggle） | `r17-1` 相位 `open-by-click` 第三步 |
| 11 | 点击浮层与入口之外（含 `.map-toggle` / `.pill-tab` / 阅读区） | 关闭；被点元素自身动作**照常生效**（关闭不 `preventDefault`） | `r17-1` 相位 `close-paths-and-focus-return`（`document.body` 上派发 `pointerdown`） |
| 12 | `.center-pill` 不在 DOM（`pillReady === false`） | 入口不渲染（`Teleport v-if`），浮层仍可由 `?` 打开（占位）+ 关闭；离屏不可达 ⇒ 走查 | 走查 #1（`pillReady` 判定） |
| 13 | 关闭后再次打开 | 每次打开重新记录 `lastFocused`；无残留（DOM 真删除 + 监听成对） | `r17-1` 相位 `close-paths-and-focus-return` 的反复开关 |
| 14 | 点击模板动作后读浮层状态 | `display === "none"` + **`btnCount === 3`**（摘录因 `selectionPage = null` 掉落，`v-show` 留在 DOM）——**不得**断言 `btnCount === 0` | `r17-2` 相位 `explain`（M1）；`quickAskStateProbe()` `:5459-5469` |
| 15 | `cachedText` 已被清空却点击模板动作 | `if (text)` 守卫 ⇒ **不发射**（`emitQuickAsk` 零调用）；浮层仍 `hide()`（与既有 `onButtonClick` 同构） | `r17-2` 相位 `explain`（`sendCalls` 零增量）；走查 #8 |
| 16 | `ChatPanel` 未挂载（无消费者） | `emitQuickAsk` 的 `currentHandler?.()` 空操作：不抛错、不发送、不改草稿 | 既有 seam 语义（`useQuickAsk.ts` 零消费者分支不变） |
| 17 | 草稿为空 / 纯空白 + 点「解释」 | 草稿 = `EXPLAIN_TEMPLATE`，输入框聚焦 | `r17-2` 相位 `explain`；烟测 `template-draft` #4 / #5 |
| 18 | 草稿是 `QUICK_ASK_TEMPLATE` / `EXPLAIN_TEMPLATE` / `TRANSLATE_TEMPLATE` + 点另一模板动作 | 被替换为目标模板（`解释 ↔ 翻译 ↔ 问 AI 的模板` 可来回切换） | `r17-2` 相位 `translate-replace`；烟测 #6 / #7 |
| 19 | 草稿是自定义文本 | **一字不改**，仅聚焦 | `r17-2` 相位 `custom-draft-kept`；烟测 #8 |
| 20 | 草稿是 `NOTES_ASK_TEMPLATE` | **一字不改**（笔记模板不参与替换） | `r17-2` 相位 `custom-draft-kept`；烟测 #9；走查 #7 |
| 21 | 草稿是 `" " + EXPLAIN_TEMPLATE`（首尾空白差异） | 视为自定义 ⇒ 一字不改（**不是**「近似匹配」） | 烟测 #11（`resolveTemplateDraft` 逐字比较） |
| 22 | 4 按钮在默认 / 窄栏 / 200% 缩放 | 单行、不溢出、两两不相交、每个按钮 `clientWidth > 0`；缩放下右缘钳制生效 | `r17-2b` 三相位 |
| 23 | 摘录入库在途（`pending === true`） | 四个按钮一并 `disabled`，点击零效果（既有 `:disabled` 语义，不新增分支） | 既有 `onExcerptClick` 语义零改动（走查） |
| 24 | `canExcerpt === false`（选区无法定位到页） | DOM 为 3 个动作（`问 AI` / `解释` / `翻译`），模板动作照常可用 | 走查（夹具内不可达；`canExcerpt` `:42` 零改动） |
| 25 | 18 行内容超出浮层高度 | 浮层内部滚动（`max-height` + `overflow-y: auto`），不撑破 `.reader-panel`、不 `position: fixed` | `shortcutProbe().scrollOverflow`；走查 #4（`grep -c "overflow: hidden"` = 0） |

---

## 4. 文件级清单（动作 + 具体改动点 + 不变量）

| # | 文件 | 动作 | 具体改动点 | 不变量 |
| --- | --- | --- | --- | --- |
| 1 | `pix/src/renderer/utils/shortcut-help.ts` | **新建** | §1.3 逐字内容：两个接口 + `SHORTCUT_KEY_JOIN` + `SHORTCUT_SECTIONS`（3 组 18 行）+ `SHORTCUT_NOTE` | **零 import**、零 DOM、零全局读取；无 `any`；`grep -c "上一页\|下一节\|发送消息"` 的禁用对象是**组件**而非本文件（本文件是唯一允许出现这些字面的地方）；`ArrowUp` / `ArrowDown` 零命中 |
| 2 | `pix/src/renderer/utils/quick-ask-templates.ts` | **新建** | §1.6 逐字内容：`TemplateAction` / `EXPLAIN_TEMPLATE` / `TRANSLATE_TEMPLATE` / `templateForAction` / `resolveTemplateDraft` | **零 import**、零 DOM、不抛错、不改入参；无 `any`；`grep -c "trim()"` = 1；`grep -c "includes("` = 1 |
| 3 | `pix/src/renderer/components/workspace/ShortcutOverview.vue` | **新建** | §1.4 的 `<script setup>`（含 `isEditableTarget` 本地副本、两个监听、焦点契约）+ §1.1 / §1.2 的模板与 `<style scoped>` 逐字样式 | 无 props / 无 emits；`grep -c "stopPropagation"` = 0；`grep -c "addEventListener(\"keydown\", .*, true)"` = 0；`window.addEventListener("keydown"` / `removeEventListener("keydown"` 各 1；`grep -ci "localstorage\|sessionstorage"` = 0；`grep -ci "first\|seen\|dismiss"` = 0；`grep -c "pageCount\|readerStore"` = 0；`tabindex="-1"` 恰 1；不新增 `--pix-*` 变量；`overflow: hidden` 零命中 |
| 4 | `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 修改 | §1.5 / §2.2 #4–#6：新增 `onTemplateClick`、两个 `.quick-ask-btn`、一行 `import type` | 既有常量 / `showFor` / `hide` / `showFeedback` / `onSelectionChange` / `onStageScroll` / `onButtonClick` / `onExcerptClick` / `watch` / 生命周期 / 模板既有两按钮与反馈块 / 全部 CSS 逐字零改动；`.quick-ask-btn:hover` / `:disabled` 规则零 diff；「问 AI」「摘录」不作为 `-` 行出现 |
| 5 | `pix/src/renderer/composables/useQuickAsk.ts` | 修改 | §1.6：新增 `QuickAskAction`；`QuickAskHandler` 加第二参数；`emitQuickAsk` 加参数与默认值 | `registerQuickAskConsumer` 签名与 `currentHandler` 语义零 diff；笔记 seam（`registerNotesAskConsumer` / `emitNotesAsk`）逐字不动；`grep -c "QuickAskAction"` = 3（类型 + 形参 + 返回无关处） |
| 6 | `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改 | §1.6 / §2.2 #8–#10：两行 import、`QUICK_TEMPLATE_REPLACEABLE` 单行、`onQuickAsk` 新函数体 | `QUICK_ASK_TEMPLATE` / `NOTES_ASK_TEMPLATE` 两行与 `onNotesAsk` / `send()` / chips / `<reading_context>` / `.composer-*` 零 diff；`QUICK_TEMPLATE_REPLACEABLE` 声明逐字单行且不含 `NOTES_ASK_TEMPLATE` |
| 7 | `pix/src/renderer/components/workspace/ReaderPanel.vue` | 修改 | §2.2 #11：一行 import + 一行 `<ShortcutOverview />`（`:258` 之后） | 既有 Teleport / `.map-toggle` / `.reader-stage` / `.knowledge-map-slot` / `.reader-header` / 结构与样式零改动；`grep -c "ShortcutOverview"` = 2（import 1 + 标签 1） |
| 8 | `pix/scripts/smoke-view.mjs` | 修改 | §5.1 / §5.2：两个句柄、`files`/`required` 各 +2、两个 `require`、`main()` 两行、`runShortcutTable()`（12 条）+ `runTemplateDraft()`（11 条）+ 手写期望常量 | `WINDOW_SHIM` 与编译选项零改动；既有 7 组 51 条断言文本零改写；`allowed` 仍由 `required + "shared/types.js"` 推导且**不新增白名单外产物**；运行后 `%TEMP%` 自建目录被删除 |
| 9 | `pix/scripts/ui-shot.mjs` | 修改 | §5.4：`SEL` +6；R17 块（5 helper + 手写常量 + 4 场景 / 11 record / 7 截图）；三处 `btnCount === 2` ⇒ `4` | 既有 64 项 `SEL` / 既有场景 / 相位 / label / 截图名 / helper 逐字不动（三处按钮数断言除外）；stub 面（42 方法）零改动；`record` 语义不变；R17 场景各自以自己的复位收尾（`restoreStandardSeed()` / `removeProperty` / 缩放回 100%） |
| 10 | `docs/pm/R17-design.md` | 新建（本档） | —— | 不改源码；本轮流程档件 |

**范围外（任何情况下不动）**：`pix/src/renderer/components/workspace/PdfViewer.vue`、`PdfSearchPanel.vue`、`NotesPanel.vue`、`KnowledgeMap.vue`、`pix/src/renderer/components/input/InputArea.vue`、`pix/src/renderer/pages/**`、`pix/src/renderer/stores/**`、`pix/src/renderer/utils/{reading-context,notes-path,outline-notes,page-anchor,note-capture}.ts`、`pix/src/renderer/assets/styles/**`、`pix/src/main/**`、`pix/src/shared/types.ts`、`pix/package.json`、`package-lock.json`、`packages/**`、`pix/scripts/smoke-notes.mjs`、`pix/resources/**`、`docs/pm/**` 的历史档件、`README.md`、`.gitignore`。

---

## 5. 验证方案

### 5.1 烟测-渲染新增两组（`pix/scripts/smoke-view.mjs`，12 + 11 = 23 条）

**冻结的组与条数（不得减少）**：`shortcut-table` **12** / `template-draft` **11**；追加在既有 7 组（51 条）之后，`main()` 调用顺序固定为 `runSectionHit → runSectionNull → runSectionNav → runSectionFormat → runBadgeCounts → runNotesByPage → runExcerptMatch → runShortcutTable → runTemplateDraft`；末行仍逐字 `通过 {passed} / 失败 {failed}`（改后期望 `通过 74 / 失败 0`）。**期望值一律手写，不由被测数据生成**。

#### 5.1.1 组 `shortcut-table`（12 条）

前置：`shortcutHelp` 句柄可直驱；`check(groupName, index, desc, ok, actual)` 签名（`:149-158`）；失败输出用 `JSON.stringify` 快照。

| # | 断言（失败即红） |
| --- | --- |
| 1 | `SHORTCUT_SECTIONS.length === 3` |
| 2 | 三个组标题逐字 `["阅读区（打开文档后）", "输入框", "工作区"]`（顺序敏感） |
| 3 | 总行数 `reduce((sum, s) => sum + s.rows.length, 0) === 18` |
| 4 | 第 1 组 9 行 `{ keys, desc }` 与 §1.3 表逐字深等（含 `PageUp / ←` 的两个 keys 元素与 `打开文档搜索` 的两行重复文案） |
| 5 | 第 2 组 8 行逐字深等（**含第 17 行** `提交重命名（对话名称输入框）`） |
| 6 | 第 3 组 1 行逐字深等（`["?"]` / `打开或关闭本总览`） |
| 7 | 全表 `keys` 元素均为非空字符串；`keys.join(SHORTCUT_KEY_JOIN) + desc` 组合**无重复** |
| 8 | `SHORTCUT_KEY_JOIN === " / "` |
| 9 | `SHORTCUT_NOTE` 逐字等于冻结串且 `includes("摘录")` |
| 10 | `JSON.stringify(SHORTCUT_SECTIONS)` 不含 `ArrowUp` / `ArrowDown` |
| 11 | 表内不出现 `Shift+` 之外的修饰键组合：`JSON.stringify` 命中 `Ctrl+` 恰 1 次（`Ctrl+F`）、不含 `Ctrl+Shift` / `Alt+` / `Meta+` |
| 12 | 每组 `rows.length > 0` 且 `title` 为非空字符串（防空断言防护） |

#### 5.1.2 组 `template-draft`（11 条）

前置：`quickAskTemplates` 句柄；手写常量 `const QUICK_ASK = "请解释选中的这段话：";`、`const NOTES_ASK = "请结合我选中的摘录回答：";`、`const KNOWN = [QUICK_ASK, EXPLAIN, TRANSLATE];`。

| # | 断言（失败即红） |
| --- | --- |
| 1 | `EXPLAIN_TEMPLATE` 逐字 `请解释选中的这段话在论文中的含义与作用：` |
| 2 | `TRANSLATE_TEMPLATE` 逐字 `请把选中的这段话翻译成中文：` |
| 3 | `templateForAction("explain") === EXPLAIN_TEMPLATE` 且 `templateForAction("translate") === TRANSLATE_TEMPLATE` |
| 4 | `resolveTemplateDraft("", EXPLAIN, KNOWN) === EXPLAIN`（空草稿填入） |
| 5 | `resolveTemplateDraft("   ", TRANSLATE, KNOWN) === TRANSLATE`（纯空白按空处理） |
| 6 | `resolveTemplateDraft(QUICK_ASK, EXPLAIN, KNOWN) === EXPLAIN`（既有模板可被替换） |
| 7 | `resolveTemplateDraft(EXPLAIN, TRANSLATE, KNOWN) === TRANSLATE`（模板互替） |
| 8 | `resolveTemplateDraft("我的问题", EXPLAIN, KNOWN) === null`（自定义草稿一字不改） |
| 9 | `resolveTemplateDraft(NOTES_ASK, EXPLAIN, KNOWN) === null`（不在替换集合内） |
| 10 | 两模板互不相等、且都不等于 `QUICK_ASK`（期望值手写） |
| 11 | `resolveTemplateDraft(" " + EXPLAIN, TRANSLATE, KNOWN) === null`（首尾空白差异即不匹配；M7 的非阻塞项） |

### 5.2 编译面同步（`smoke-view.mjs` 的三处冻结点）

| 项 | 现状（实读） | 改后 |
| --- | --- | --- |
| `files`（`:780-786`） | 4 个 `.ts` + `WINDOW_SHIM` | 追加 `join(REPO_DIR, "pix", "src", "renderer", "utils", "shortcut-help.ts")` 与 `join(REPO_DIR, "pix", "src", "renderer", "utils", "quick-ask-templates.ts")` |
| `required`（`:799`） | 4 个 `.js` | 追加 `"renderer/utils/shortcut-help.js"` 与 `"renderer/utils/quick-ask-templates.js"` |
| `allowed`（`:800`） | `new Set([...required, "shared/types.js"])` | **不改**（两个新文件零 import ⇒ 不产生额外 emit 产物）；若出现白名单外产物必须登记理由后并入，否则 `compileAndLoad` 判红 |
| 模块句柄（`:139-142`） | 4 个 | 追加 `shortcutHelp` / `quickAskTemplates` 两个 `let` 与两个 `require` |

### 5.3 主进程数据面烟测（`smoke-notes.mjs`）

| 项 | 冻结 |
| --- | --- |
| 文件 | **整文件零 diff**（10 组 65 条：`runUndoRoundtrip` / `runUndoFailures` / `runUndoSlotLifecycle` / `runExportAndEmpty` / `runReportRender` / `runReportFiles` / `runReportFailures` / `runNotesStat` / `runLibraryRootContainment` / `runReaderStateStore`） |
| 理由 | 本轮零 IPC、零 `notes.json` 改动、零主进程改动（反需求 2 / 8） |
| 判据 | `npm run smoke:notes` 末行逐字 `通过 65 / 失败 0`；连续两次运行结果相同 |

### 5.4 离屏场景 `r17-*`（4 场景 / 4 组 / 11 条 record / 7 张截图）

**追加位置（冻结）**：`runReaderStateScenarios` 内、`:10234` 的 `await restoreStandardSeed();`（r16-5 收尾）**之后**、`:10235` 的函数收口 `}` **之前**；每场景以自己的复位收尾（`restoreStandardSeed()` / `layoutVar("--pix-right-width", null)` / 缩放回 100%）。

#### 5.4.1 `SEL` 增量（恰 6 项，64 → 70）

| 键 | 值 | 用途 |
| --- | --- | --- |
| `shortcutToggle` | `.shortcut-toggle` | 入口：存在性 / `title` / `aria-label` / `aria-expanded` / 矩形 |
| `shortcutOverview` | `.shortcut-overview` | 浮层：存在性 / 矩形 / 关闭路径的 `querySelector === null` 判定 |
| `shortcutRow` | `.shortcut-row` | 18 行计数与逐行读数 |
| `shortcutKey` | `.shortcut-key` | 键位文本（`<kbd>`） |
| `shortcutNote` | `.shortcut-note` | 说明行文本 |
| `composerBox` | `.composer-box` | 浮层与 composer 的零相交判定 |

既有 64 项**零改写 / 零删除**；浮层与 composer 的其它选择器沿用既有字面量（`.input-area` = `SEL.composerInput` `:100`、`.pdf-search-panel .search-input`、`.quick-ask-btn`、`.layout-right`）。

#### 5.4.2 新增 helper（5 个，命名按需求档冻结；语义如下）

| helper | 语义（实现要点逐字） |
| --- | --- |
| `shortcutProbe()` | 一次 `js` 读回：入口 `{ inDom, title, ariaLabel, ariaExpanded, rect }`；浮层 `{ inDom, rect, sectionTitles: string[], rows: [{ key, desc }], noteText, closeCount, activeInsidePanel, scrollOverflow, focusableCount }`。**`focusableCount` 的实现要点（坑）**：`panel.querySelectorAll(...)` **不含容器自身** ⇒ 必须写成 `Array.from(document.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")).filter((el) => el === panel \|\| panel.contains(el)).length`（期望 **2** = 容器 `tabindex="-1"` + `.shortcut-close`）；`activeInsidePanel` = `panel.contains(document.activeElement)`；`scrollOverflow` = `panel.scrollWidth - panel.clientWidth`；`rect` 一律 `getBoundingClientRect` 取整（视口坐标） |
| `quickAskActionsProbe()` | 一次读回：`{ display, rect, buttons: [{ text, icon, rect, disabled }], scrollOverflow, btnCount }`。`text` = `textContent` 归一化空白 + `trim`（与既有 `:5540` 同口径）；`icon` = `btn.querySelector(".v-icon")` 的 classList 中首个 `^mdi-` 开头的类名（既有 `.v-icon.mdi-close` 写法 `:5734` 的同款）；`scrollOverflow` = `el.scrollWidth - el.clientWidth`。**定稿 D3**：字段清单按需求档 §0.9 冻结（不增字段）；`tagName` / `tabIndex` 与「对「解释」按钮 `focus()` 后 `activeElement` 是否即该按钮」由 `r17-2` 相位内联 `js()` 读取 |
| `layoutVar(name, value)` | 写 / 清 CSS 变量并 `repaint(win)`：`value === null` ⇒ `removeProperty`，否则 `setProperty`；返回 `style.getPropertyValue(name)`（便于把读数写进 `data`） |
| `intersects(a, b)` | Node 侧矩形相交：`!!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height`（两侧 rect 必须同为视口坐标；`null` 一律判 `false`）。**调用点前置（定稿 D6）**：判相交前必须已确认两侧 rect 非 `null`（见 §5.4.3 `r17-1b` 两相位的防空前置）—— 否则 `null` 会静默判 `false`、零相交断言假通过 |
| `pressKeyOnReturning(selector, key)` | `el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))` 的**布尔返回**：`false` = 被 `preventDefault`；元素不存在即抛错（与 `pressKeyOn` `:7282-7287` 同守卫）。既有 `pressKeyOn` **零改写** |

**复用 helper（既有，零改写）**：`waitFor` `:1598-1606`、`record` `:1609-1612`、`textOf` `:1614`、`has` `:1618`、`countOf` `:1619`、`goHome` `:1686`、`enterWorkspace` `:1696`、`waitTreeRows` `:1668`、`waitPdfLoaded` `:1670`、`waitPage` `:1671`、`openRow` `:1711`、`selectPageSpan` `:1757`、`setDraft` `:2534`、`rectOfSelector` `:2569`、`sendCalls` `:3258` / `clearSendCalls` `:3259`、`chipSnapshot` `:3316`、`composerSnapshot` `:3337`、`enterCleanWorkspace` `:3397`、`restoreStandardSeed` `:3416`、`notesAddCalls` `:2382`、`saveCalls` `:1631`（**定稿 D4**：既有本地 helper 名是 `saveCalls`；`readerStateSaveCalls` 只是 stub 方法名 `:1247`）、`userBlocks` `:2385`、`quickAskStateProbe` `:5459`、`selectionProbe` `:5472`、`clickEl` `:7273`、`pressReaderKey` `:7276`、`capturePage` `:1268`、`repaint` `:1263`。

#### 5.4.3 场景矩阵（逐相位：步骤 / 失败即红的断言 / 截图）

**场景 `r17-1`（组 `r17-shortcut-overview`，3 条 record，2 张截图）**

前置：`enterCleanWorkspace(seedNotes())`（清会话与失败注入 → 回首页 → 清 A 现场 → 进工作区 → 写标准种子；**不打开文档**）。

| 相位 | 步骤 | 断言（失败即红） | 截图 / `data` |
| --- | --- | --- | --- |
| `open-by-click` | ① 未打开任何文档时 `shortcutProbe()` → ② `openRow("sample-paper.pdf")` + `waitPdfLoaded()` + `waitPage(1, 3)` → ③ 再 `shortcutProbe()` → ④ `clickEl(SEL.shortcutToggle)` → ⑤ 读浮层（`shortcutProbe()`）→ ⑥ 截图 → ⑦ 再 `clickEl(SEL.shortcutToggle)` | ① 首帧：`.shortcut-overview` / `.shortcut-row` / `.shortcut-key` / `.shortcut-note` 计数**全 0**、`countOf(SEL.shortcutToggle) === 1`、`ariaExpanded === "false"`（N98-2）；② 未打开文档与打开文档后 `title === "快捷键总览（?）"` 且 `ariaLabel === "快捷键总览"`（两次，N98-1）；③ 点击后 `ariaExpanded === "true"`、浮层在 DOM；④ `sectionTitles` 逐字 `["阅读区（打开文档后）", "输入框", "工作区"]`、`rows.length === 18` 且逐行 `{key, desc}` 与 §1.3 表逐字相等、`noteText === SHORTCUT_NOTE_TEXT`、`closeCount === 1`、`focusableCount === 2`、`activeInsidePanel === true`；⑤ 再点击后 `ariaExpanded === "false"` 且 `document.querySelector(SEL.shortcutOverview) === null` | `r17-1-shortcut-overview.png`（整窗）、`r17-1b-shortcut-overview-entry.png`（`rectOfSelector(SEL.shortcutToggle, 12)` 或 `.center-pill` 裁切）；`data` = `{ phase, entryBeforeDoc, entryAfterDoc, panel, rowCount, sectionTitles }` |
| `key-toggle-and-typing-guard` | ① `setDraft("草稿守卫")` + 聚焦 `.input-area` → `pressKeyOnReturning(".input-area", "?")` → 读草稿与浮层 → ② 对当前 `activeElement` 调 `blur()` + 自检 `activeElement === document.body` → `pressReaderKey("?")` → 读浮层与 `has(SEL.pdfSearchPanel)` → ③ `pressReaderKey("?")` → ④ `pressReaderKey("?")` 再打开 → `pressReaderKey("/")` + `waitFor` `.pdf-search-panel` → `pressKeyOnReturning(".pdf-search-panel .search-input", "?")` → ⑤ 在搜索输入框上派发 `Escape` + 等两处离开 | ① 返回 **true**（未 `preventDefault`）、浮层**不**出现（`inDom === false`）、`.input-area` 的 `value` 逐字 `"草稿守卫"`；② body 上 `?` ⇒ 浮层出现**且** `has(SEL.pdfSearchPanel) === false`（**定稿采纳评审 §2.1**：`?` 不得触发 `/` 语义，把「互不误触」从走查升级为可判）；③ 再 `?` ⇒ 离开 DOM；④ `.pdf-search-panel` 出现（既有键位未被劫持）+ `.pdf-search-panel .search-input` 上 `?` 返回 **true** 且浮层**仍打开**（INPUT 分支不 toggle）；⑤ 一次 `Escape` ⇒ `.pdf-search-panel` **与** `.shortcut-overview` **同时**离开 DOM（登记的双响应） | 无；`data` = `{ phase, textareaGuard: { returns, inDom, value }, opened, bodyGuard: { opened, searchPanel }, closed, searchOpen, inputGuard: { returns, stillOpen } }` |
| `close-paths-and-focus-return` | ① 点入口打开 → 读 `activeElement`（应为容器）→ `pressKeyOn(SEL.shortcutOverview, "Escape")` → ② 点入口打开 → 在 `document.body` 上派发 `new PointerEvent("pointerdown", { bubbles: true })` → ③ 点入口打开 → `clickEl(".shortcut-close")` → ④ **入口分支**：先 `js("document.querySelector('.shortcut-toggle').focus(), true")` + 自检 `activeElement === .shortcut-toggle`（**定稿 D2**：`clickEl` = `el.click()`（`:7273`）不移动焦点）→ `clickEl(SEL.shortcutToggle)` 打开 → `pressKeyOn(SEL.shortcutOverview, "Escape")` 关闭 → 读 `activeElement`（应为 `.shortcut-toggle`）→ ⑤ **body 分支**：对当前 `activeElement` 调 `blur()` + 自检 `activeElement === document.body` → `pressReaderKey("?")` 打开 → `pressKeyOn(SEL.shortcutOverview, "Escape")` 关闭 → 读 `activeElement`（应为 `document.body`） | 每条关闭路径后：`document.querySelector(SEL.shortcutOverview) === null`、`countOf(SEL.shortcutRow) === 0`、`ariaExpanded === "false"`；打开后 `activeElement === .shortcut-overview`（容器 `tabindex="-1"`）；**入口分支**：先 `focus()` 入口并自检（不成立即判红）→ 用入口打开、Esc 关闭后 `activeElement === .shortcut-toggle`；**body 分支**：`blur()` 前置自检 `activeElement === document.body` 后，用 `?` 打开并关闭 ⇒ `activeElement === document.body`；`sendCalls` / `notesAddCalls` / `saveCalls`（既有本地 helper `:1631`，**定稿 D4**）全程零增量；开关前后 `.pdf-scroll.scrollTop` 与页 1（`.pdf-page[data-page="1"]`）矩形逐字不变 | 无；`data` = `{ phase, esc: { gone, rows, expanded, active }, outside: …, closeBtn: …, focusReturn: { byEntry, byBody }, writes: { send, notesAdd, stateSave }, quiet: { scrollTop, pageBox } }`（`stateSave` = `saveCalls().count` 增量） |

**场景 `r17-1b`（组 `r17-shortcut-geometry`，2 条 record，1 张截图）**

前置：`enterCleanWorkspace(seedNotes())` + `openRow("sample-paper.pdf")` + `waitPdfLoaded()` + `waitPage(1, 3)`；本场景两相位都以**地图关闭态**取值（**定稿 D1**：关闭态由前置 `enterCleanWorkspace → goHome()` 显式保证 —— `ui-shot.mjs:1686-1694` 的 `goHome` 点击 `title="返回首页"` 的 `.pill-icon-btn`（`WorkspacePage.vue:275`）⇒ `WorkspacePage.vue:251-266` 的 `goHome()` 内 `:260` 调 `readerStore.setMapOpen(false)`；r16-2 在 `ui-shot.mjs:9820` 遗留的打开态在 R17 场景进入时已被该复位清掉，故**不新增** `closeMap()` / `assertNoMapSlot()`；`mapOpen` 另有默认 `false`（`reader-store.ts:30`））。

| 相位 | 步骤 | 断言（失败即红） | 截图 / `data` |
| --- | --- | --- | --- |
| `default` | ① 断言 `.knowledge-map-slot` 不在 DOM（地图关闭态，修订 M3；由前置 `goHome()` 复位保证）**且** `shortcutProbe().rect` 与六个对照 rect 均非 `null`（**定稿 D6**：`intersects` 对 `null` 静默判 `false`，不先防空则零相交断言假通过）→ ② 记录 `.pdf-scroll.scrollTop` 与页 1 矩形 → ③ `clickEl(SEL.shortcutToggle)` → ④ 读浮层 / 入口 / 四个既有控件 / `.composer-box` / `.center-pill` 的矩形 → ⑤ 关闭 → ⑥ 复读滚动与页 1 矩形 | ① `has(SEL.mapSlot) === false`（**定稿 D1**：由前置 `enterCleanWorkspace → goHome()` 的 `setMapOpen(false)`（`WorkspacePage.vue:260`）保证；`showMap = mapOpen && isPdf && mapFits`，`mapOpen` 默认 `false`）；**且** `shortcutProbe().rect` 与六个对照 rect 均非 `null`（任一为 `null` 即判红，**定稿 D6**）；② 浮层矩形 ⊆ `.reader-panel` 矩形（由 `rectOfSelector` 取）；③ 与 `.composer-box` / `.pdf-toolbar` / `.pdf-page-indicator` / `.reader-section` / `.pdf-capture-fab` / `.center-pill` **全部零相交**（`intersects` 逐对判，任一处相交即判红）；④ 打开前后 `.pdf-scroll.scrollTop` 与 `.pdf-page[data-page="1"]` 矩形逐字不变（零侵扰） | 无；`data` = `{ phase, mapSlotInDom, rectsPresent, panel, entry, controls, composer, pill, intersect: { composer, toolbar, indicator, section, fab, pill }, quiet }` |
| `narrow` | ① `layoutVar("--pix-right-width", RIGHT_WIDTH)`（560px）→ ② 复读同一组矩形 → ③ 截图 → ④ `layoutVar("--pix-right-width", null)` → ⑤ 读 `.layout-right` 宽度 | ① `.knowledge-map-slot` 仍不在 DOM、各 rect 仍非 `null`（沿用定稿 D6 防空前置）；② 重复上一相位的 ②③④③（含零相交与 ⊆ 判定）；④ 复位后 `.layout-right` 宽度回到 **380 ± 2**（`Math.abs(w - 380) <= 2`） | `r17-1c-shortcut-overview-narrow.png`（`rectOfSelector(SEL.shortcutOverview, 12)`）；`data` = `{ phase, rightWidth, rectsPresent, panel, intersect, quiet, restoredRightWidth }` |

**场景 `r17-2`（组 `r17-template-actions`，3 条 record，3 张截图）**

前置：`enterCleanWorkspace(seedNotes())` + `openRow("sample-paper.pdf")` + `waitPdfLoaded()` + `waitPage(1, 3)`；`readNotes().length` 与 `notesHash()` 作为零写入基线。

| 相位 | 步骤 | 断言（失败即红） | 截图 / `data` |
| --- | --- | --- | --- |
| `explain` | ① `selectPageSpan(1)` → ② `quickAskActionsProbe()` + 内联 `js()` 读四按钮 `{ tagName, tabIndex }`、并对「解释」按钮 `focus()` 后读 `activeElement`（**定稿 D3**）→ ③ 截图 → ④ `clearSendCalls()` + 记录选区文本 / `chipSnapshot()` / `userBlocks()` → ⑤ 点「解释」按钮（按文本定位 `.quick-ask-btn` 中含 `解释` 者）→ ⑥ 读 `composerSnapshot()` / `quickAskStateProbe()` → ⑦ 截图 | ① 4 个按钮文本逐字 `["问 AI", "解释", "翻译", "摘录"]`、图标逐字 `["mdi-comment-question-outline", "mdi-lightbulb-on-outline", "mdi-translate", "mdi-notebook-plus-outline"]`、`btnCount === 4`、`disabled === false` 全员、`tagName === "BUTTON"`、`tabIndex >= 0`（后两项取自步骤 ② 的内联 `js()` 读数 —— **定稿 D3**：`quickAskActionsProbe()` 字段按需求档 §0.9 冻结，不增字段）；② `.input-area` 的 `value` 逐字 `EXPLAIN_TEMPLATE` 且 `activeHasInputArea === true`；③ `sendCalls().count` 增量 0、`.chat-messages .message-block` 计数不变、选区文本与 `collapsed === false` 不变、`chipSnapshot()` 三字段不变；④ 浮层 `display === "none"` 且 `btnCount === 3`（**M1**）；⑤ `notesHash()` 与文件条数不变；⑥ 在步骤 ② 的浮层可见态内对「解释」按钮 `focus()` 后 `document.activeElement === 该按钮`（取值时点在步骤 ⑤ 的点击之前；需求档 N97-4 判据 1 的落点，**定稿 D3**） | `r17-2-quick-ask-four-actions.png`（`rectOfSelector(SEL.quickAsk, 30)`，与既有裁切范式一致）、`r17-2b-template-explain-draft.png`（`.composer-box` 或整窗）；`data` = `{ phase, actions, buttonsMeta, focusable, draft, focused, quickAskAfterExplain, quiet: { send, blocks, selection, chips, notes } }`（`buttonsMeta` / `focusable` = 步骤 ② 的内联 `js()` 读数；`quickAskAfterExplain` = 步骤 ⑥ 的 `quickAskStateProbe()` 读数 —— **定稿 D4** 的 M1 落点） |
| `translate-replace` | ① 在草稿为 `EXPLAIN_TEMPLATE` 时 `selectPageSpan(1)` → 点「翻译」→ 读草稿 → ② `setDraft("")` → `selectPageSpan(1)` → 点「翻译」→ 读草稿 → ③ 截图 | ① 草稿逐字 `TRANSLATE_TEMPLATE`（机器模板被替换）；② 仍逐字 `TRANSLATE_TEMPLATE`（空草稿分支）；③ 两次 `sendCalls().count` 增量均为 0、`.input-area` 聚焦 | `r17-2c-template-translate-draft.png`；`data` = `{ phase, afterReplace, afterEmpty, send }` |
| `custom-draft-kept` | ① `setDraft("我的问题：请给出结论")` → `selectPageSpan(1)` → 点「解释」→ 读草稿/焦点 → ② `setDraft(NOTES_ASK_TEMPLATE)` → `selectPageSpan(1)` → 点「翻译」→ 读草稿 | ① 草稿逐字 `"我的问题：请给出结论"`（一字不改）+ 聚焦；② 草稿逐字 `NOTES_ASK_TEMPLATE`（笔记模板不参与替换）+ 聚焦；两次 `sendCalls().count` 增量 0 | 无；`data` = `{ phase, customKept, notesTemplateKept, focused, send }` |

**场景 `r17-2b`（组 `r17-template-geometry`，3 条 record，1 张截图）**

| 相位 | 步骤 | 断言（失败即红） | 截图 / `data` |
| --- | --- | --- | --- |
| `four-buttons-default` | `selectPageSpan(1)` → `quickAskActionsProbe()` + 读 `.reader-stage` / `.composer-box` / `.reader-section` / `.pdf-page-indicator` 矩形 | ① 浮层矩形 ⊆ `.reader-stage` 矩形（含 `STAGE_PADDING = 4` 内缩）；② `scrollOverflow <= 1`；③ 4 个按钮矩形按 DOM 顺序 `x` 严格递增、两两不相交、每个 `width > 0`、四个 `y` 相同（`max - min <= 1`，**定稿采纳评审 §2.2**：把「单行」从 `x` 递增的隐含推理升级为直判）；④ 与 `.composer-box` / `.reader-section` / `.pdf-page-indicator` 零相交 | 无；`data` = `{ phase, stage, float, buttons, intersect }` |
| `four-buttons-narrow` | ① `layoutVar("--pix-right-width", RIGHT_WIDTH)` → ② `selectPageSpan(1)` → ③ 复读 → ④ `layoutVar("--pix-right-width", null)` + 读 `.layout-right` 宽度（本相位自行复位，末相位再按需设置） | 同上一相位四条（含四个 `y` 相同 ±1）+ 4 个按钮文本逐字 `QUICK_ASK_ACTIONS`；复位后 `.layout-right` 宽 380 ± 2 | 无；`data` = `{ phase, stage, float, buttons, intersect, restoredRightWidth }` |
| `four-buttons-zoom-clamp` | ① `layoutVar("--pix-right-width", RIGHT_WIDTH)`（上一相位已复位 ⇒ 本相位重设）→ ② 点 `SEL.zoomInBtn` **10 次** + `waitFor` `.zoom-label` 逐字 `200%` → ③ `js("document.querySelector('.pdf-scroll').scrollLeft = 0, true")` + `sleep` → ④ `selectPageSpan(1)` → ⑤ 读浮层 / stage / 按钮 → ⑥ 截图 → ⑦ 点 `.pdf-toolbar button[title="缩小"]` **10 次** + `waitFor` `.zoom-label` 逐字 `100%` → ⑧ `layoutVar("--pix-right-width", null)` + 读 `.layout-right` 宽度 | ① `.zoom-label` 逐字 `200%`；② **钳制分支生效**：`Math.abs(float.right - (stage.right - 4)) <= 1.5`；③ 浮层仍 ⊆ stage；④ 4 按钮仍单行不溢出（`scrollOverflow <= 1` + 两两不相交 + 四个 `y` 相同 ±1）；⑤ 收尾 `.zoom-label` 逐字 `100%` 且 `.layout-right` 宽 380 ± 2（变量已复位） | `r17-2d-quick-ask-four-buttons-zoom.png`（`rectOfSelector(SEL.pdfViewer, 0)` 或整窗）；`data` = `{ phase, zoom, stageRight, floatRight, buttons, restored }` |

**登记：几何为推算**（`--pix-right-width` 560 ⇒ `.reader-stage` 右缘 ≈ 1019；页 1 首 span 右缘 ≈ 1189；`MAX_SCALE = 3` 允许 200%）⇒ 实际读数以 `r17-2b` 落下的 `stage` / `float` 矩形为准；若实测未触发钳制（`float.right` 明显小于 `stage.right - 4`），判红并回查 stage 宽度与滚动位置（不得放宽阈值）。

**零缺失**：既有 166 张截图 / 237 条测量 / 64 种 label 不得缺失；新增后读数目标见 §5.5。

### 5.5 基线与零缺失（`C:/Users/86157/AppData/Local/Temp/pix-v06-r16-review`）

| 项 | 基线（本次实读） | 改后目标 |
| --- | --- | --- |
| 比对目录 | `C:/Users/86157/AppData/Local/Temp/pix-v06-r16-review/shots` | 验收轮新建独立目录（例如 `pix-v06-r17-final`），**不得**覆盖基线目录 |
| `MANIFEST.json` | `shots.length = 166`、`failure = null` | `shots.length = 173`、`failure = null` |
| 目录内 png | 166 | 173 |
| `MEASUREMENTS.json` 长度 | 237 | 248（+11） |
| `label` 去重 | 64 | 68（+4：`r17-shortcut-overview` / `r17-shortcut-geometry` / `r17-template-actions` / `r17-template-geometry`） |
| 新增截图（7 张，命名冻结） | —— | `r17-1-shortcut-overview.png` / `r17-1b-shortcut-overview-entry.png` / `r17-1c-shortcut-overview-narrow.png` / `r17-2-quick-ask-four-actions.png` / `r17-2b-template-explain-draft.png` / `r17-2c-template-translate-draft.png` / `r17-2d-quick-ask-four-buttons-zoom.png` |
| 零缺失判据 | —— | 既有 166 张 / 237 条 / 64 种 label **逐条存在**（按 `MEASUREMENTS.json` 的 label 集合与 `MANIFEST.json` 的 shots 名单双向比对） |

### 5.6 走查判据（命令级，正反双向）

| # | 命令 | 期望 |
| --- | --- | --- |
| 1 | `grep -c "shortcut-toggle" pix/src/renderer/components/workspace/ShortcutOverview.vue`；`grep -c "快捷键总览（?）" …/ShortcutOverview.vue`；`grep -n "ShortcutOverview" pix/src/renderer/components/workspace/ReaderPanel.vue` | ≥ 1 / ≥ 1 / ≥ 2（import 1 + 标签 1） |
| 2 | `grep -c "keys.join(SHORTCUT_KEY_JOIN)\|SHORTCUT_SECTIONS" …/ShortcutOverview.vue`；`grep -c "上一页\|下一节\|发送消息" …/ShortcutOverview.vue` | ≥ 2 / **0**（组件内无手写键位文案） |
| 3 | `grep -c "mdi-lightbulb-on-outline\|mdi-translate" …/PdfSelectionQuickAsk.vue` | **2**（各 1） |
| 4 | `grep -c "position: fixed" …/ShortcutOverview.vue`；`grep -c "overflow: hidden" …/ShortcutOverview.vue` | 0 / 0 |
| 5 | `grep -n -A4 'event.key !== "?"' …/ShortcutOverview.vue`；`grep -c "isComposing" …/ShortcutOverview.vue`；`grep -c "stopPropagation" …/ShortcutOverview.vue`；`grep -c "addEventListener(\"keydown\", .*, true)" …/ShortcutOverview.vue` | 命中片段中 `isEditableTarget` 的 `return` 在 `preventDefault()` **之前** / = 1 / **0** / **0** |
| 6 | `grep -n -A3 "function onTemplateClick" …/PdfSelectionQuickAsk.vue` | 三行逐字且次序为 `const text = cachedText;` → `hide();` → `if (text) emitQuickAsk(text, action);` |
| 7 | `grep -c -F 'const QUICK_TEMPLATE_REPLACEABLE: readonly string[] = [QUICK_ASK_TEMPLATE, EXPLAIN_TEMPLATE, TRANSLATE_TEMPLATE];' pix/src/renderer/components/workspace/ChatPanel.vue`；`grep -c "QUICK_TEMPLATE_REPLACEABLE" …/ChatPanel.vue` | **1**（逐字单行，出现 `NOTES_ASK_TEMPLATE` 即判红）/ **2**（定义 1 + 使用 1） |
| 8 | `git diff -U0 -- …/PdfSelectionQuickAsk.vue \| grep -E "^-" \| grep -E "问 AI\|摘录\|mdi-notebook-plus-outline\|mdi-comment-question-outline"`；`git diff -U0 -- …/ChatPanel.vue \| grep -E "^-" \| grep -E "QUICK_ASK_TEMPLATE\|NOTES_ASK_TEMPLATE"` | 两条均**空**（既有动作与既有模板行零改写） |
| 9 | `grep -c -F 'window.addEventListener("keydown"' …/ShortcutOverview.vue`；`grep -c -F 'window.removeEventListener("keydown"' …/ShortcutOverview.vue` | 各 **1**（注册 / 注销配对；M2 的证据链限制登记：DOM 监听泄漏在离屏无可观测面） |
| 10 | `grep -ci "localstorage\|sessionstorage" …/ShortcutOverview.vue`；`grep -rn "shortcut" pix/src/renderer/stores pix/src/main pix/src/shared`；`grep -ci "first\|seen\|dismiss" …/ShortcutOverview.vue` | 0 / 0 / 0 |
| 11 | `grep -c "tabindex=\"-1\"" …/ShortcutOverview.vue`；`grep -c "\.focus()" …/ShortcutOverview.vue`；`grep -ci "focusin\|focusout\|trap" …/ShortcutOverview.vue` | **1** / ≥ **2**（打开 1 + 归还 1）/ **0**（无焦点陷阱） |
| 12 | `grep -c "pageCount\|readerStore" …/ShortcutOverview.vue` | **0**（入口就绪与文档无关） |
| 13 | `grep -c "ArrowUp\|ArrowDown" pix/src/renderer/utils/shortcut-help.ts`；`grep -c "SettingsPage\|onSaveKeyEnter" pix/src/renderer/utils/shortcut-help.ts` | 0 / 0 |
| 14 | `grep -c "  check(" pix/scripts/smoke-view.mjs` | **74**（51 + 23） |
| 15 | `grep -c "btnCount === 2" pix/scripts/ui-shot.mjs`；`grep -c "btnCount === 4" pix/scripts/ui-shot.mjs` | **0** / **3**（`:5518` / `:6987` / `:7059` 三处逐条对位） |
| 16 | `grep -c "pixelmatch" pix/scripts/ui-shot.mjs`；`sed -n '47,124p' pix/scripts/ui-shot.mjs \| grep -cE "^\s+[A-Za-z][A-Za-z0-9]*:\s"` | **0**（无像素比对）/ **70**（64 + 6） |
| 17 | `git diff --stat -- pix/src/main pix/src/shared/types.ts pix/package.json package-lock.json packages pix/scripts/smoke-notes.mjs pix/src/renderer/components/workspace/PdfViewer.vue` | 全部为空 |
| 18 | `git status --short` | 只出现白名单：`M` **7** 个源码 / 脚本（§4 第 4–9 行中的 6 个 + 本档）+ `??` 两个新 util 与 `?? docs/pm/R17-*.md`；不出现临时脚本 / 临时产物 / 调试日志 |

### 5.7 工程门

| 项 | 判据 |
| --- | --- |
| `npm run check` | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ 0 error（`vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit`）；新增两个 `.ts` 与组件的类型全链路必填；无 `any`、无内联动态 import、全部顶层 import |
| 烟测 | `npm run smoke:view` 末行逐字 `通过 74 / 失败 0`；`npm run smoke:notes` 末行逐字 `通过 65 / 失败 0`（零改动） |
| 合并门（B 完成后、提交前） | `npm run check` 0 error + 烟测两条全绿 + 离屏退出码 0 + `failure === null` + 166 张 / 237 条 / 64 种 label 零缺失 + 7 张新增齐备 + §2.3 零 diff 判据全过 + `git status --short` 只出现 §4 白名单内的文件 |

---

## 6. 风险 Top3

### R1「键位表与真实代码漂移」（判定面最宽，且是「可发现性」这一轮的核心产物）

**失败模式**：① 为「好看的完整性」补进不存在的键位（`ArrowUp` / `ArrowDown`、缩放键位、摘录键位）⇒ 用户按了没反应，功能可信度反转；② 漏掉真实键位（重命名输入框的 Enter、笔记搜索框的 Esc）⇒ 总览与代码不一致，N96-2 的「逐字相等」判据也无法说明「完整」；③ 把手势（`Ctrl+滚轮`）或框架级默认（Vuetify 对话框 Esc）混入表内，导致 18 行配额被稀释；④ 把守卫细节塞进 `desc`（`?（不在输入框内时）`）⇒ 文案无法收敛、N99-2 的逐字断言必然失败；⑤ 组件内手写键位文案（绕过数据源）⇒ 表改成两份事实源。

**判定**：烟测 `shortcut-table` 12 条（3 组 / 18 行 / 逐字深等 / 无 `ArrowUp` / 修饰键白名单）；离屏 `r17-1` 相位 `open-by-click` 的 `rows` 与 `sectionTitles` 逐字比对；走查 #2 / #13；§2.1「`PdfViewer.vue` 零 diff」保证表与代码的一致性以「代码未动」为前置。

**失败信号**：总览行数 ≠ 18；出现 `ArrowUp`；`desc` 里出现括号内的条件说明；组件内出现 `上一页` 字面；按总览里的键位无反应。

### R2「`?` / `Esc` 监听与既有阅读区键位互相打架」

**失败模式**：① 用捕获阶段或 `stopPropagation` 实现「Esc 只关浮层」⇒ 直接砸掉 R11/R16 冻结的「capture mode owns Esc first」与搜索关闭顺序；② `?` 在输入框内触发 ⇒ 中文输入法 / 搜索框里打不出问号（并且若顺手 `preventDefault` 会吞掉输入）；③ 打开后不归还焦点 ⇒ 关闭后键盘用户「丢焦点」，Esc 连按语义错乱；④ 监听注销缺失 ⇒ 工作区卸载后残留 window `keydown`（离屏无可观测面，只能走查）；⑤ 外部点击监听在关闭后未卸 ⇒ 页面任意点击触发多余的 `close()`。

**判定**：`r17-1` 三相位（TEXTAREA / INPUT 双守卫 + `dispatchEvent` 布尔返回、Esc 双响应、三条关闭路径与两种焦点归还、写入零增量）；走查 #5 / #9 / #11；§2.3 的 `PdfViewer.vue` 零 diff；§3 的失败路径表 1–13 逐行对位。

**失败信号**：`?` 在 composer 内打开浮层或草稿变形；Esc 一次只关一个（与冻结的双响应不一致）或把框选模式一起吞掉；关闭后 `activeElement` 仍在浮层（已被删除的节点）；`grep` 出现 `stopPropagation` / 捕获阶段；连续开关出现两个浮层或残留 `pointerdown` 行为。

### R3「模板动作破坏既有浮层 / composer / chips 语义」

**失败模式**：① 按「先 `hide()` 后读 `cachedText`」实现 ⇒ 发射空串（`hide()` `:94` 清空缓存）；② 把 composer 既有两行包进新的 `if` 块 ⇒ 缩进变化使 `git diff -U0` 记为 `-` 行，N97-2 判据 5 判红（本档 §0.3 已用「非 `ask` 分支提前 `return`」的写法规避）；③ 未同步三处 `btnCount === 2` ⇒ r11-3 既有场景与 `ensureQuickAskExcerptReady` 直接判红；④ 用下标（`buttons[1]`）而不是文本定位既有按钮 ⇒ 插入中间按钮后点错对象（本档 §0.1 已核实既有 6 处全部按文本定位，插入位次不受影响）；⑤ 自动发送 / 顺手清空草稿 / 顺手清空选区 ⇒ 反需求 1 与 chips 链路被破坏。

**判定**：`r17-2` 三相位（草稿逐字 / 聚焦 / `sendCalls` 零增量 / `.message-block` 不变 / 选区与 chips 不变 / `btnCount === 3`）；烟测 `template-draft` 11 条；走查 #6 / #7 / #15；§2.3 的两条 `grep -E "^-"` 判据。

**失败信号**：点「解释」后草稿为空或仍是旧模板；消息被自动发出（出现新的 `.message-block`）；选区塌陷（chip 消失）；`btnCount === 2` 仍留在脚本里；`git diff -U0` 出现 `-` 形态的 `QUICK_ASK_TEMPLATE` 行。

**次级风险（不占 Top3，登记）**：① 4 按钮使 `.quick-ask` 变宽约 114px ⇒ 五张既有截图像素变化（§0.1 已登记，仓内无像素比对，不判红）；② 浮层与知识地图列重叠（上游 M3 采纳处置②：接受，且 `r17-1b` 只在地图关闭态取值）；③ `.shortcut-toggle` 与 `.map-toggle` 在 pill 内的相对顺序由挂载顺序决定（上游 §0.0 第 2 条：不写断言）；④ 非 US 键盘布局下 `?` 需要按出 `event.key === "?"` 才触发（登记，不新增映射）；⑤ `--pix-right-width: 560px` 的窄栏手法以 `removeProperty` 复原，若某相位中途抛错会污染后续场景 —— 由「每场景自己复位」与 `restoreStandardSeed()` 收尾兜底。

---

## 7. 开发分工

### 7.1 A：数据源与纯函数 + 烟测（**不碰任何 Vue 文件**）

| 序 | 交付物 | 具体工作 | 完成判据 |
| --- | --- | --- | --- |
| A1 | `pix/src/renderer/utils/shortcut-help.ts`（新建） | §1.3 逐字内容 | 零 import；3 组 18 行；`ArrowUp` / `ArrowDown` 零命中 |
| A2 | `pix/src/renderer/utils/quick-ask-templates.ts`（新建） | §1.6 逐字内容 | 零 import；`resolveTemplateDraft` 三分支与四个边界（空 / 空白 / 模板 / 自定义 / 空白差异）自测通过 |
| A3 | `pix/scripts/smoke-view.mjs` | 两句柄 + `files` / `required` 各 +2 + 两个 `require` + `main()` 两行 + `runShortcutTable()`（12 条）+ `runTemplateDraft()`（11 条） | `npm run smoke:view` 末行逐字 `通过 74 / 失败 0`；连续两次运行结果相同；既有 7 组 51 条零改写；`%TEMP%` 目录被删除 |
| A4 | 回归 | `npm run smoke:notes` | 末行逐字 `通过 65 / 失败 0`（零改动） |

**A 完成时点**：A1–A4 全绿 + `npm run check` 0 error。**A 不触碰** `ShortcutOverview.vue` / `PdfSelectionQuickAsk.vue` / `useQuickAsk.ts` / `ChatPanel.vue` / `ReaderPanel.vue` / `ui-shot.mjs`。

### 7.2 B：UI、seam 与离屏（依赖 A 的签名与字面冻结）

| 序 | 交付物 | 具体工作 | 完成判据 |
| --- | --- | --- | --- |
| B1 | `ShortcutOverview.vue`（新建） | §1.4 参考实现 + §1.1 / §1.2 模板与样式 | 走查 #1 / #2 / #4 / #5 / #9 / #10 / #11 / #12；`npm run check` 0 error |
| B2 | `ReaderPanel.vue` | 一行 import + 一行 `<ShortcutOverview />`（`:258` 之后） | 走查 #1（`grep -c "ShortcutOverview"` ≥ 2）；既有 Teleport / `.map-toggle` 零 diff |
| B3 | `useQuickAsk.ts` + `PdfSelectionQuickAsk.vue` | §1.6 seam 扩展；`onTemplateClick` + 两个按钮（§1.5 / §2.2 #4–#6） | 走查 #3 / #6 / #8；`npm run check` 0 error |
| B4 | `ChatPanel.vue` | 两行 import + `QUICK_TEMPLATE_REPLACEABLE` + `onQuickAsk` 新函数体（§1.6，缩进纪律见 §0.3） | 走查 #7 / #8；既有两行与 `onNotesAsk` / `send()` 零 diff |
| B5 | `pix/scripts/ui-shot.mjs` | `SEL` +6 + 5 个 helper + 手写常量 + 4 个场景（4 组 11 条 record / 7 张截图）+ 三处 `btnCount === 2` ⇒ `4` | 走查 #15 / #16；既有 166 张 / 237 条 / 64 种 label 零缺失 |
| B6 | 离屏验收 | 先跑基线（独立目录，例如 `pix-v06-r17-base`），再跑验收（`pix-v06-r17-final`，`PIX_SHOT_ROOT` 指定） | 退出码 0、`failure === null`、§5.5 读数目标达成（173 / 248 / 68）、新增 7 张齐备 |
| B7 | 目视比对 | 7 张新截图逐张登记结论（§8.2 清单） | dev 档逐张写明「4 按钮是否单行不裁切 / 浮层是否遮挡 / 窄栏与缩放是否成立」 |

**并行纪律**：A 先冻结 `shortcut-help.ts` 与 `quick-ask-templates.ts` 的字面与签名（§1.3 / §1.6 逐字）⇒ B 才能写组件与消费端。A 与 B 的写文件集合**零交集**（A：两个 `utils/*.ts` + `smoke-view.mjs`；B：三个 Vue / TS 源文件 + `ui-shot.mjs`）。B5 的三处 `btnCount` 更新与 B3 的按钮插入必须同批提交（否则 r11-3 既有场景在中间态判红）。

**合并门**：见 §5.7。

---

## 8. 视觉验收要点

### 8.1 必查三项

| # | 要点 | 判据 / 观察方法 |
| --- | --- | --- |
| 1 | **4 按钮单行且不裁切**（本轮唯一的既有控件形态变化） | `r17-2-quick-ask-four-actions.png` 上从左到右依次为 `问 AI` / `解释` / `翻译` / `摘录`，四者同一行、间距均匀（`gap: 2px`）、圆角胶囊完整、无换行 / 无省略号 / 无 `disabled` 灰态；离屏判据：`r17-2b` 三相位（矩形递增 + 两两不相交 + `scrollOverflow <= 1` + `clientWidth > 0`） |
| 2 | **浮层不遮挡**（入口与浮层的「不侵扰」承诺） | `r17-1-shortcut-overview.png` / `r17-1c-shortcut-overview-narrow.png` 上：浮层落在中间栏左上、pill 之下（与 pill 有可见缝隙）、不压阅读区右上工具条 / 底部页码指示器 / 章节 chip / 左下框选 FAB、不越出中间栏；离屏判据：`r17-1b` 两相位的 ⊆ + 六处零相交（`.composer-box` / `.pdf-toolbar` / `.pdf-page-indicator` / `.reader-section` / `.pdf-capture-fab` / `.center-pill`）。**限定口径**：地图打开时允许压住知识地图列顶部（上游 M3 处置②，不判红） |
| 3 | **窄栏与缩放仍成立** | `r17-1c-shortcut-overview-narrow.png`（`--pix-right-width: 560px`）与 `r17-2d-quick-ask-four-buttons-zoom.png`（560px + 200%）上：浮层与 4 按钮均完整、不横向溢出、不与既有控件重叠；离屏判据：`r17-1b` 相位 `narrow` 与 `r17-2b` 相位 `four-buttons-zoom-clamp`（含 `float.right === stage.right - 4` ± 1.5 与变量 / 缩放复位判据） |

### 8.2 逐张登记清单（7 张，dev 档必须逐张写结论）

| # | 截图 | 要看的点 |
| --- | --- | --- |
| 1 | `r17-1-shortcut-overview.png` | 浮层标题 `快捷键总览`、3 个组标题、18 行「键位胶囊 + 说明」、末尾说明行含「摘录」；右上关闭按钮；白底圆角、无遮罩、无动画残留；不与 pill / 工具条 / 页码 / 章节 chip / FAB 重叠 |
| 2 | `r17-1b-shortcut-overview-entry.png` | pill 内键盘图标按钮：20px 圆、与 `.map-toggle`（若在）风格一致、位置在 pill 右侧、`pill-label` 文本未被挤压出省略号（文档名可辨） |
| 3 | `r17-1c-shortcut-overview-narrow.png` | 窄栏（右栏 560px）下浮层仍在中间栏左上、宽度 320px 完整、18 行未换行错位、右上关闭按钮未被挤出可视区 |
| 4 | `r17-2-quick-ask-four-actions.png` | 4 个动作单行、图标与文案对齐（`mdi-comment-question-outline` / `mdi-lightbulb-on-outline` / `mdi-translate` / `mdi-notebook-plus-outline`）、胶囊未裁切、选区仍在（高亮可见） |
| 5 | `r17-2b-template-explain-draft.png` | composer 草稿逐字 `请解释选中的这段话在论文中的含义与作用：`；输入框聚焦（边框高亮）；未发送（无新消息块、发送按钮状态正常）；`.quick-ask` 已隐藏 |
| 6 | `r17-2c-template-translate-draft.png` | 草稿逐字 `请把选中的这段话翻译成中文：`（替换而非追加）；`.context-chip` 的「选中文本」chip 仍在 |
| 7 | `r17-2d-quick-ask-four-buttons-zoom.png` | 200% 缩放 + 窄栏下 4 按钮仍单行、浮层右缘贴住阅读区右缘内缩 4px（钳制生效）、无横向滚动条、无按钮重叠 |

### 8.3 反例清单（出现即判红）

| # | 反例 | 判定 |
| --- | --- | --- |
| 1 | 总览行数 ≠ 18 / 组数 ≠ 3 / 出现 `ArrowUp` 或编造的摘录键位 | `shortcut-table` 12 条 / `r17-1` 判据判红 |
| 2 | `desc` 里出现守卫细节（如 `（不在输入框内时）`） | `r17-1` 逐字比对判红 |
| 3 | `?` 在 composer / 搜索框内打开浮层或吞掉输入 | `r17-1` 相位 `key-toggle-and-typing-guard` ①④ 判红（返回 false 或浮层出现） |
| 4 | 点模板动作后消息被自动发送（出现新的 `.message-block`） | `r17-2` 三相位 `sendCalls` / `.message-block` 判据判红（反需求 1） |
| 5 | 点模板动作后草稿被追加而非替换 / 自定义草稿被覆盖 | `r17-2` 相位 `translate-replace` / `custom-draft-kept` 逐字判红 |
| 6 | 点模板动作后选区塌陷或 chip 消失 | `r17-2` 相位 `explain` 的选区与 `chipSnapshot()` 判据判红 |
| 7 | 4 按钮换行 / 被裁切 / 相互重叠 | `r17-2b` 三相位几何判据判红 |
| 8 | 浮层压住 pill / 工具条 / 页码 / 章节 chip / FAB / composer | `r17-1b` 两相位零相交判据判红（地图列除外，见 §8.1 限定口径） |
| 9 | 关闭后浮层仍留在 DOM / `aria-expanded` 仍为 `"true"` / 焦点丢失 | `r17-1` 相位 `close-paths-and-focus-return` 判红 |
| 10 | 打开或关闭过程中出现写盘 / 发消息 / 存状态（任一增量非 0） | `r17-1` / `r17-2` 的写入零增量判据判红 |

---

## 9. 开放问题（登记，不阻塞本档定稿）

1. **键位表的数据源位置**：本轮冻结在 `utils/shortcut-help.ts`（可被 smoke 直驱）。若负责人改判为「写在组件内」，需同步改需求档 §0.2 第 1 条、N96-2 与 N99-2 的 12 条断言（本档 §5.1.1 全部作废重写）。
2. **`?` 的键盘布局前提**：只认 `event.key === "?"`（US 布局 = Shift+`/`）。其他布局若产出别的 `key` 则不触发；若要求全布局可达，需新增键位映射与一条断言（另立轮次）。
3. **Esc 在 composer 内也会关闭浮层**：按冻结的关闭路径②实现（不拦截按键）。若要求「输入框内 Esc 不关浮层」，需改 §1.4 与 `r17-1` 判据（并与 R11/R15 的 Esc 纪律一起裁决）。
4. **无焦点陷阱**：浮层内只有 2 个可聚焦控件、Tab 可离开（上游冻结）。若要求「Tab 循环留在浮层内」，需新增 `focusin` / `focusout` 逻辑与断言（本档按上游冻结不实现）。
5. **浮层与知识地图的重叠**：按上游 M3 处置②接受（仅地图关闭态取值）。若负责人改判为「永不重叠」，需改 §1.2 定位与 `r17-1b` 判据（另立轮次）。
6. **`.map-toggle` 与 `.shortcut-toggle` 的相对顺序**：由挂载顺序决定，不写断言（上游 §0.0 第 2 条）。若要求固定顺序，需在 `ReaderPanel` 内统一 teleport 或改 flex `order`（会触碰既有 `.map-toggle` 语义）。
7. **`.quick-ask` 宽度增长**：4 按钮使浮层变宽约 114px，五张既有截图（两张整窗 + 三张裁切）像素变化且无像素比对（仓内无 `pixelmatch`）。若后续引入图像比对，需把这五张纳入「允许变化」白名单（另立轮次）。

---

## 定稿修订（R17）

- 修订依据：`docs/pm/R17-review.md`「设计评审（R17）」的 must-fix **D1–D6** + 非阻塞建议 **§2.1–§2.3**。
- 写面（本次）：只改 `docs/pm/R17-design.md`（末尾本表 + 正文改字）；未动任何源码 / 脚本 / 其它档件。基线：`git status --short` ⇒ `?? docs/pm/R17-design.md` / `?? docs/pm/R17-req.md` / `?? docs/pm/R17-review.md`；`git log --oneline -1` ⇒ `8850c9c`。
- 证据纪律：下表行号与结论全部来自本次**实读**（`read` / `grep` / `awk`，只读）与本次**实跑**；本步**未跑**离屏（`ui-shot.mjs` 未执行）⇒ `r17-*` 场景的运行时读数仍由开发档在离屏落账。
- 本次实跑工程门（唯一工程门）：`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（`vue-tsc --noEmit` + 两个 `tsc --noEmit`）。

### 1 逐条裁定

| # | 来源 | 裁定 | 正文落点 | 证据（本次实读 / 实跑） |
| --- | --- | --- | --- | --- |
| 1 | D1（`r17-1b` 两相位「地图关闭态」前置必然判红） | **拒绝**（前提被真实代码证伪；保留相位 ① 的防空断言口径） | §5.4.3 `r17-1b` 前置行与 `default` 相位断言 ① 改字（关闭态由 `enterCleanWorkspace → goHome()` 显式保证；**不新增** `closeMap()` / `assertNoMapSlot()`）；§0.2 M3 行同步 | `ui-shot.mjs:1686-1694`：`goHome` helper 点击 `title="返回首页"` 的 `.pill-icon-btn`（`:1688`）= `WorkspacePage.vue:275` 的 `@click="goHome"` ⇒ `WorkspacePage.vue:251-266` 的 `goHome()` 内 **`:260` `readerStore.setMapOpen(false)`**；`ui-shot.mjs:3397-3407` 的 `enterCleanWorkspace` 在 `:3402` 调 `await goHome()`；`reader-store.ts:30` `mapOpen` 默认 `false` ⇒ r16-2 在 `ui-shot.mjs:9820` 遗留的打开态在 R17 场景进入时**已被该复位清掉**，断言可满足 |
| 2 | D2（入口分支焦点归还断言不可满足） | 采纳（处置①：补 `focus()` 前置） | §1.4「关闭后焦点归还」行新增「入口分支的可判前置（定稿 D2）」；§5.4.3 相位 `close-paths-and-focus-return` 步骤 ④ 与断言 | `ui-shot.mjs:7273` `clickEl = js("document.querySelector(...).click(), true")`（程序化 `click()` 不移动焦点）；§1.4 参考实现的 `toggle()` 在 `open` 前记录 `lastFocused = document.activeElement` ⇒ 不前置 `focus()` 时 `lastFocused` 为 `document.body`（`isConnected` 恒真、永不走入口兜底） |
| 3 | D3（判据无数据源 / 缺落点） | 采纳（处置②：相位内联 `js()`；处置①「扩展探针字段」未采用） | §5.4.2 `quickAskActionsProbe()` 行加注；§5.4.3 `explain` 相位步骤 ② / 断言 ①⑥ / `data` | 需求档 `R17-req.md:451` **冻结** `quickAskActionsProbe()` 字段清单 `{display, rect, buttons:[{text, icon, rect, disabled}], scrollOverflow, btnCount}`（改字段会抵触冻结字面 ⇒ 走内联 `js()`）；需求档 N97-4 判据 1（`R17-req.md:370`）要求 `tagName` / `tabIndex` /「`focus()` 后 `activeElement` 即该按钮」，设计档原本无落点 |
| 4 | D4（档内自相矛盾 / 名字不可用） | 采纳（三条） | ① §0.2 M3 行的 `assertNoMapSlot()` 删除（改用 `has(SEL.mapSlot)`）；② `quickAskAfterExplain` 落进 `explain` 的 `data`（§0.2 M1 行同步）；③ §5.4.2 复用 helper 行 + §5.4.3 断言 / `data` 的 `readerStateSaveCalls` ⇒ `saveCalls` | ① §0.3 冻结「不新增第 6 个 helper 名」（需求档 §0.9 第 6 条冻结 5 个）；② 原 `data` 无该字段；③ `ui-shot.mjs:1631` `const saveCalls = () => js("window.__pixStub.readerStateSaveCalls()")`（本地 helper 名），`:1247` 的 `readerStateSaveCalls` 只是 stub 方法名 |
| 5 | D5（事实表行号失真） | 采纳（表 7 行 + 尾界 4 项 + 附加核实 4 项） | §0.1 三行、§1.3 表行 2/10/16、§2.1、§2.2 #14、§5.4.1、§5.4.2 复用 helper 行 | 见下表「D5 逐项实读对照」 |
| 6 | D6（零相交断言在 rect 缺失时静默通过） | 采纳 | §5.4.2 `intersects` 行加调用点前置；§5.4.3 `r17-1b` 两相位步骤 ① / 断言 ① 与 `data` 增 `rectsPresent` | §5.4.2 冻结语义「`null` 一律判 `false`」（本档）⇒ 浮层或对照控件取不到矩形时，六处零相交断言会全部「通过」 |
| 7 | 非阻塞 §2.1（`?` / `/` 互不误触升级为可判） | 采纳 | §5.4.3 相位 `key-toggle-and-typing-guard` 步骤 ② / 断言 ② / `data` 增 `bodyGuard` | `SEL.pdfSearchPanel` = `.pdf-search-panel`（`ui-shot.mjs:82`）；`PdfViewer.vue:455` 判 `event.key === "/"`（本轮零 diff） |
| 8 | 非阻塞 §2.2（「单行」直判） | 采纳 | §5.4.3 `four-buttons-*` 三相位断言（四个 `y` 相同 ±1） | `.quick-ask` 是 `display: inline-flex` 且未设 `flex-wrap`（默认 `nowrap`，`PdfSelectionQuickAsk.vue:228-242`） |
| 9 | 非阻塞 §2.3（笔记搜索框 Esc 登记） | 采纳 | §1.4「登记行为（非缺陷）」新增 ③ | `NotesPanel.vue:222-226`（`:225` `event.stopPropagation()`）⇒ 该框内 Esc 不冒泡到 window，浮层不随之关闭 |
| 10 | 连带（不在本档可写范围） | 登记（不阻塞） | 需求档 N96-4 判据 1「入口分支」的同一 `focus()` 前置步需由负责人 / 需求档维护者同步；本轮白名单只允许写 `docs/pm/R17-design.md` | 本步允许清单：读文件 + 写本轮指定文档 + `cd pix && npm run check` + 只读 git |

### 2 D5 逐项实读对照（只读命令，未跑离屏）

| 档内位置 | 改前 | 改后（本次实读，含关键行） |
| --- | --- | --- |
| §0.1 组件级键位行 / §1.3 表第 16 行 | `NotesPanel.vue` `onSearchEsc` `:224-227` | `:222-226`（`:222` 签名 / `:223` `clearSearchQuery()` / `:224` `blur()` / `:225` `stopPropagation()`） |
| §0.1 组件级键位行 / §1.3 表第 10 行 | `InputArea.vue` `onKeydown` `:28-36` | `:28-35`（`:30` `isComposing`；`:36` 为空行） |
| §0.1 阅读区键位行 / §1.3 表第 2 行 | `PdfViewer.vue` `Ctrl+F` `:418-427` | `:419-427`（`:419` `if (` 起，`:427` `event.preventDefault();`） |
| §0.1 阅读区监听生命周期行 / §2.1 | `setKeydownListener` `:489-503`、`watch(…)` `:505-509` | `:489-497`（函数体）、`:499-503`（`watch` 块；`:487` `keydownRegistered`） |
| §0.1 composer 现状行 | `onNotesAsk` `:318-331` | `:324-331`（`:320-323` 为文档注释；`:315` `NOTES_ASK_NOTICE_MS`） |
| §0.1 离屏脚本锚点行 / §5.4.2 | `waitFor` `:1593` | `:1598-1606`（`:1593` 是 `sleep` helper；`:1595-1596` 为 `STATE_FILE_A/B`） |
| 同上 | `goHome` `:1681-1689`、`enterWorkspace` `:1691-1704` | `:1686-1694`、`:1696-1709` |
| 同上 | `openRow` `:1711-1720` | `:1711-1719` |
| 同上 | `selectPageSpan` `:1757-1772` | `:1757-1770` |
| 同上 | `rectOfSelector` `:2569-2582` | `:2569-2585`（`:2585` 为函数收口） |
| 同上 | `chipSnapshot` `:3316-3335` | `:3316-3334`（`:3335` 为空行，`:3337` 为 `composerSnapshot`） |
| 同上 | `enterCleanWorkspace` `:3392-3402`、`openNotesPanel` `:3405-3408` | `:3397-3407`、`:3410-3413`（`:3416-3420` 为 `restoreStandardSeed`） |
| §0.1 `.quick-ask` 行 / §2.1 | clamp 块 `:80-88` | `:80-89`（`:80` `const minX` / `:89` `};`；`showFor` 为 `:56-90`） |
| §2.2 #14 | `require` 段 `:812-816` | `:817-822`（`:813-815` 是产物缺失 / 多出的 `fail` 分支） |
| §5.4.1 | `.input-area` = `SEL.composerInput` `:86` | `:100`（`:86` 是 `SEL.pdfViewer`；`:117` 是 `SEL` 末项 `notePageBadge`，`:118` `};`） |
| §5.4.2 复用 helper | `readerStateSaveCalls`（既有） | `saveCalls` `:1631`（`readerStateSaveCalls` = stub 方法名 `:1247`） |

### 3 登记（本轮未采信 / 未改动）

1. 评审「本步未跑离屏取证」⇒ 本表全部结论以文件实读 + `npm run check`（`CHECK_EXIT=0`）为准；`r17-*` 的几何 / 焦点 / 零相交读数一律由开发档在离屏（独立目录）落账，本表不替代离屏判据。
2. D1 的拒绝只否证两点：「两相位**必然判红**」与「需新增 `closeMap()`」。「相位入口必须在**地图关闭态**取值」的口径本身保留（§5.4.3 断言 ① 即防空前置；若后续场景顺序被改到可能带打开态进入，该断言会立即判红，这正是其作用）。
3. §5.6 走查 #14（`grep -c "  check(" = 74`）与 #15（三处 `btnCount === 4`）是**改后目标值**，本轮不改脚本 ⇒ 不复核；两组新烟测（`shortcut-table` 12 + `template-draft` 11）与 4 个离屏场景均为待开发落地点。
4. 评审一致项（登记；其中关键项本次已实读复核，其余沿用评审实读结论、本档不改字）：`repaint :1263-1266`、`capturePage :1268-1276`、`record :1609-1612`、`textOf :1614` / `has :1618` / `countOf :1619` / `stateBytes :1620`、`waitTreeRows :1668` / `waitPdfLoaded :1670` / `waitPage :1671`、`setDraft :2534-2543`、`sendCalls :3258` / `clearSendCalls :3259` / `lastSend :3264` / `waitSendCalls :3271`、`composerSnapshot :3337-3351`、`notesAddCalls :2382` / `userBlocks :2385`、`quickAskStateProbe :5459-5469`（`btnCount :5467`）、`selectionProbe :5472-5481`、`clickEl :7273`、`pressReaderKey :7276-7279`、`pressKeyOn :7282-7287`、场景收口 `:10234` / `:10235`、`SEL :47-118`（64 项，末项 `notePageBadge`）、三处 `btnCount === 2`（`:5518` / `:6987` / `:7059`）与反馈期 `:6975` / `:6978`、6 处按文本定位与 3 处 `rectOf(SEL.quickAsk, 30)` 裁切（`:1448` / `:1479` / `:1982` / `:5416` / `:5537` / `:6791`、`:1402` / `:1457` / `:1487`）、`smoke-view.mjs` 的 `check :149-158` / 7 组函数 / `files :780-786` / `required :799` / `allowed :800`（`grep -c "  check("` = 51，`wc -l` = 850）、`PdfSelectionQuickAsk.vue` 行段、`ChatPanel.vue` 行段、`ReaderPanel.vue` / `WorkspacePage.vue` / `AppLayout.vue` / `variables.css` / `main.css` 行段（评审一致项）。

---

## 追加设计（R17 · N97-4）

> 上游：需求档 `R17-req.md`「追加冻结（R17 · 负责人裁决）」→「N97-4（追加 · 负责人裁决）选区快照」的冻结语义 **A–D**；处置依据见 `R17-review.md`「追加裁决（R17）」与 `R17-dev.md` §B8 **D-B1**、`R8-dev.md` **D6**。
> 口径：本节是**追加设计**，不改本档 §0–§9 的任何既有字面；与既有字面冲突处（仅三处：§1.7「chips … 零改动」的**来源**、§1.7「载荷装配 … 零 diff」的**实参操作数**、§5.4.3 `r17-2/explain` 的 chips 断言）以本节为准并逐条登记（§1 末两行 + §3.3）。
> 白名单：只放开 `pix/src/renderer/components/workspace/ChatPanel.vue` 与 `pix/scripts/ui-shot.mjs`（+ 三个流程档件）；其余路径零 diff（§5）。
> 证据纪律：本节行号 / 计数全部来自本次实读（`read` / `grep` / `awk`，只读）；**本次实读的工作树已含 R17 已交付改动，故既有 helper 行号相对本档 §5.4.2 / §9 的记录整体位移 +6~7**（`SEL` +6 所致），本节一律按实读值引用。锚点：`ChatPanel.vue` 现行 `:84-94`（`excludedContexts` / `excludeContext` / `resetExcludedContexts`）、`:104-111`（`selectionChip`）、`:145-154`（既有两个 watch）、`:307-319`（`QUICK_TEMPLATE_REPLACEABLE` / `onQuickAsk`）、`:378`（`selectedText` 实参）；`PdfSelectionQuickAsk.vue:149-153` / `:155-159`（`onButtonClick` / `onTemplateClick`）、`:57-60` 与 `:138`（`cachedText` 的赋值与调用点 `text.trim()`）；`PdfViewer.vue:792-805`（`onSelectionChange` 镜像；清空分支 `:795-798` / `:800-803`）；`reader-store.ts:54` / `:58`（`openDocument` 清 `selectedText`）；`ui-shot.mjs:10904-10909`（待更新的 chips 断言）、`:10903-10904`（既有 `selectionAfter17f` 断言）、`:11197` / `:11198`（追加位置）、`:117-124`（`SEL` R17 六项，末项 `composerBox`）、`:3815-3824`（既有「按 label 找 chip 再点移除」范式）、`:10120-10124`（`openRow("long-book.pdf")` + 页盒就绪范式）。本步**未跑**离屏与烟测。

### 1. 与既有冻结面的关系（逐条：本追加不得改的项）

| 不得改的项（冻结源） | 本追加的处置 | 判据（命令 / 读数） |
| --- | --- | --- |
| `readerStore.selectedText` 的实时镜像语义（`PdfViewer.onSelectionChange` `:792-805`：非空且在 stage 内 ⇒ `setSelectedText(selection.toString())`（`:804`）；塌陷（`:795-798`）/ 锚点不在阅读区（`:800-803`）⇒ `setSelectedText("")`） | **零 diff**（快照只加在消费端，镜像链一个字不改） | `git diff -- pix/src/renderer/components/workspace/PdfViewer.vue` 为空 |
| `stores/reader-store.ts`（`selectedText` 的 ref / `setSelectedText` / `openDocument` 清空） | **零 diff** | `git diff -- pix/src/renderer/stores` 为空 |
| `excludedContexts` 的既有排除机制（`:84` ref / `:86-90` `excludeContext` / `:92-94` `resetExcludedContexts` / `:139-141` `contextChips` 过滤 / `:115` 文档 chip 门控 / `:378` 发送时的 `excluded.has("selection")` 分支） | 仅 `excludeContext` **追加 1 行**（C③ 清空）；既有 7 处标识符与 3 个函数体逐字不变 | `grep -c "excludedContexts" ChatPanel.vue` = **7**（不变）；`git diff -U0 -- ChatPanel.vue \| grep -E "^-"` 不含 `excludeContext` / `resetExcludedContexts` / `excludedContexts` / `contextChips` |
| chips 的既有类名与文案（`.context-chip` / `.context-chip-icon` / `.context-chip-label` / `.context-chip-remove`、`title="本次发送不使用"`、`选中文本：` 前缀、`SELECTED_TEXT_PREVIEW_MAX = 24` 与 `…` 截断） | **零改动**（只换 `selected` 的取值来源） | `grep -c "context-chip" ChatPanel.vue` = **9**（不变）；样式段无 `-` 行 |
| `<reading_context>` 的格式（`utils/reading-context.ts` 的 `selectedText:` 行 / 行序 / trim / 空值不输出） | **零 diff**（只换实参的值，不改装配） | `git diff -- pix/src/renderer/utils/reading-context.ts` 为空 |
| 模板动作的既有字面与「不自动发送」（`onTemplateClick` 三行、`QUICK_ASK_TEMPLATE` / `NOTES_ASK_TEMPLATE` / `QUICK_TEMPLATE_REPLACEABLE`、`send()` 触发点） | **零改动**（快照只在 `onQuickAsk` 入口加 1 行） | `git diff -- pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue pix/src/renderer/composables/useQuickAsk.ts` 为空；`git diff -U0 -- ChatPanel.vue \| grep -E "^-" \| grep -E "QUICK_ASK_TEMPLATE\|NOTES_ASK_TEMPLATE\|QUICK_TEMPLATE_REPLACEABLE"` 为空 |
| composer 语义（`InputArea.vue`、`draft` 读写、Enter / IME 守卫、发送失败还原） | **零 diff**（快照不碰 `draft`） | `git diff -- pix/src/renderer/components/input/InputArea.vue` 为空；`grep -c "draft" ChatPanel.vue` 的增量为 0（新增代码不读写 `draft`） |
| 既有 `.quick-ask` 面（`cachedText` / `hide()` / `onButtonClick` / `onTemplateClick` / 几何 clamp / 反馈态） | **零 diff**（快照来源就是既有 `cachedText`，无需改造） | 同上（`PdfSelectionQuickAsk.vue` 为空） |
| 本档 §1.7「chips … 零改动」（**来源**） | 登记为本追加的**明文放宽**：`.context-chip*` 的结构 / 文案 / 类名 / 生成时机（`contextChips` 的组装与过滤）零改动；**仅**「选中文本」一项的文本来源改为 `effectiveSelectedText`（§2.3） | §3 相位 `snapshot-survives-typing` / `new-selection` 逐字判红 |
| 本档 §1.7「载荷装配 … 零 diff」（**实参操作数**） | 登记为本追加的**明文放宽**：`send()` 的 `excluded.has("selection") ? "" : …` 分支（排除机制）逐字保留，仅**三元表达式另一侧的操作数**由 `readerStore.selectedText` 换为 `effectiveSelectedText.value` | §3 相位 `send-payload` 逐字判红 + `reading-context.ts` 零 diff |
| R17 既有配额（4 场景 / 11 条 record / 7 张截图 / `SEL` 70 / 5 helper） | **不改**：本追加是**新场景 + 新 label + 新 SEL 项 + 新 helper**，既有四项配额的字面与产物全部保留 | §6 |

### 2. 确切改法（`pix/src/renderer/components/workspace/ChatPanel.vue`，共 6 个改动点）

#### 2.1 状态与派生（新增 2 行；落点：`:104` 的 `selectionChip` 之前，与 chip 同一语义域）

```ts
// --- 选区快照（N97-4 追加）：点击侧选动作时用户看到的那段文本 ---
const pendingSelection = ref("");

/** 「选中文本」chip 与 <reading_context> 的 selectedText 实参的唯一来源（冻结语义 B）。 */
const effectiveSelectedText = computed(() => pendingSelection.value || readerStore.selectedText);
```

- 派生语义：`pendingSelection` 非空 ⇒ 用它；为空 ⇒ 逐字回落 `readerStore.selectedText`（**回落分支与既有行为逐字等价**，故未点击过模板动作的会话零行为变化）。
- `pendingSelection` 是**组件级** ref（不是 store）：文档切换 / 会话切换不重建 `ChatPanel`（`WorkspacePage.vue:340-349` 无 `:key`，实测无按文档重建），故失效必须由显式 watch / 显式清空表达（§2.4 / §2.5）。

#### 2.2 记录落点（`onQuickAsk` 首行，追加 1 行；其余逐字不变）

```ts
function onQuickAsk(text: string, action: QuickAskAction = "ask"): void {
  if (text) pendingSelection.value = text;   // 冻结语义 A：任何 action 都记录
  if (action !== "ask") {
    const next = resolveTemplateDraft(draft.value, templateForAction(action), QUICK_TEMPLATE_REPLACEABLE);
    if (next !== null) draft.value = next;
    composerInput.value?.focus();
    return;
  }
  if (!draft.value) draft.value = QUICK_ASK_TEMPLATE;
  composerInput.value?.focus();
}
```

- 「任何 action 下都记录」= 放在两个分支**之前**（`ask` / `explain` / `translate` 三条路径共用同一行）。
- 空串不覆盖：发射侧 `onButtonClick` / `onTemplateClick`（`PdfSelectionQuickAsk.vue:149-153` / `:155-159`）都有 `if (text)` 守卫 ⇒ 到达消费端的 `text` 恒非空；`if (text)` 只是防 seam 被无参调用时把既有快照误清（登记，不是新增语义）。
- `text` = `cachedText` = `showFor(range, text.trim())` 传入的**已 trim** 选区文本（`PdfSelectionQuickAsk.vue:57-60` 赋值、`:138` 调用点 trim）⇒ 与 chip 的 `trim()` 口径同源。

#### 2.3 chip 与 send 的共用点（替换 2 行，其余逐字不变）

```ts
const selectionChip = computed<ContextChip | null>(() => {
  const selected = effectiveSelectedText.value.trim();   // 原：readerStore.selectedText.trim()
  …（其余逐字不变：空值 ⇒ null、24 字截断 + `…`、类名与 label 前缀）
});
```

```ts
    selectedText: excluded.has("selection") ? "" : effectiveSelectedText.value,   // 原：readerStore.selectedText
```

- 两者只看 `effectiveSelectedText` ⇒ 冻结语义 B 的「不得出现第二份来源」在代码层表现为：`grep -c "readerStore.selectedText" ChatPanel.vue` = **1**（仅派生内部 1 处）。
- 排除分支 `excluded.has("selection") ? "" : …` 逐字保留（移除 chip 后仍发送「无 selectedText 的载荷」），且**发送不清空快照**（C④：`send()` 内不出现 `pendingSelection`）。

#### 2.4 失效 watch 的落点与条件（新增 2 个 watch；落点：既有两个 watch（`:145-154`）之后）

```ts
// N97-4 C①：出现新的非空选区且与快照不同 ⇒ 快照失效（以新选区为准）。
watch(
  () => readerStore.selectedText,
  (next) => {
    const trimmed = next.trim();
    if (trimmed && trimmed !== pendingSelection.value.trim()) pendingSelection.value = "";
  },
);
// N97-4 C②：文档切换（含关闭文档 ⇒ null）⇒ 清空。
watch(
  () => readerStore.filePath,
  () => {
    pendingSelection.value = "";
  },
);
```

| 条 | 条件 | 落点与理由 |
| --- | --- | --- |
| C① | `readerStore.selectedText` 的**新值** trim 后非空**且**与快照 trim 值不同 | 落在 ChatPanel：唯一可观察的「新选区」信号就是 store（PdfViewer 镜像零改动）；比较用 trim（与 chip / 快照同口径，避免尾随空白制造假失效） |
| C② | `readerStore.filePath` 的**任何**变化（含 `null`） | 落在 ChatPanel：`openDocument()`（`reader-store.ts:54-68`）只改 store、不重建组件；`watch` 不带 `immediate`（挂载时无快照可清） |
| C③ | 用户在「选中文本」chip 上点移除 | 落在既有 `excludeContext`（§2.5）——**不是** watch |
| C④ | 发送**不改变**快照 | 负向约束：`send()` 内不出现 `pendingSelection`（`grep -c 'pendingSelection.value = ""'` = **3**：C①/C②/C③ 各 1） |
| C⑤ | 切会话**不清空** | 负向约束：既有 `watch(() => props.currentSessionPath, () => resetExcludedContexts())`（`:145-148`）内不得出现 `pendingSelection`（既有会话切换仍只重置排除集） |

#### 2.5 chip 移除动作的处置（`excludeContext` 追加 1 行，既有 3 行逐字不变）

```ts
function excludeContext(kind: ContextChipKind): void {
  if (kind === "selection") pendingSelection.value = "";   // N97-4 C③：移除后不得复活
  const next = new Set(excludedContexts.value);
  next.add(kind);
  excludedContexts.value = next;
}
```

- 既有排除机制（`next.add(kind)` + 整体替换 + `contextChips` 过滤）零改写；`document` / `notes` 两类 chip 的移除路径**不受影响**（条件只命中 `"selection"`）。
- 「不复活」的两层保证（缺一不可）：① 快照清空（本行）；② 既有排除集（`excludedContexts`）。两者叠加后，即使后续触发既有 `resetExcludedContexts()`（切会话 / `displayBlocks.length === 0`），派生的两份来源（快照 + store）都为空 ⇒ chip 不会以旧文本复活（§3 相位 `chip-removed` 的判别性判据）。

### 3. 新增 / 更新的离屏断言

**追加位置（冻结）**：`ui-shot.mjs` 的 `runReaderStateScenarios` 内、R17 块收尾的 `await restoreStandardSeed();`（本次实读 `:11197`）**之后**、函数收口 `}`（`:11198`）**之前**；本场景以自己的 `await restoreStandardSeed();` 收尾（与既有 14 个场景同口径）。

#### 3.1 `SEL` 增量（恰 2 项，70 → 72）

| 键 | 值 | 用途 |
| --- | --- | --- |
| `contextChip` | `.context-chip` | 存在性 / 计数（与 `chipSnapshot()` 同选择器字面） |
| `contextChipRemove` | `.context-chip-remove` | 移除动作的定位与点击 |

既有 70 项**零改写零删除**；既有 3 处 `btnCount === 4`、`:10904-10909` 的 chips 断言等既有读数不受增量影响。

#### 3.2 新增 helper（1 个：`typeIntoComposer(text)`；R17 冻结 5 个 + 追加 1 个）

| helper | 语义（实现要点逐字） |
| --- | --- |
| `typeIntoComposer(text)` | 追加键入原语（N97-4）：读 `.input-area` 当前值 → 原生 setter 写入 `value + text` → 派发 `new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })`，返回写入后的 `value`。元素不存在即抛错（与 `setDraft` `:2541-2550` 同守卫）。**口径登记**：沿用既有合成通道（与 `setDraft` 的原生 setter + `input` 事件同范式，只多带 `inputType` / `data`），不新开真实输入通道（R17 §0.5 已登记的理由）；真实引擎侧的键入差异不在本轮验证面。 |

复用 helper（既有，零改写；行号为本工作树实读值）：`enterCleanWorkspace` `:3404-3414`、`openRow` `:1718-1726`、`waitPdfLoaded` `:1677`、`waitPage` `:1678`、`clickNext` `:1727`、`selectPageSpan` `:1764-1777`、`ensureQuickAskExcerptReady` `:5513-5534`、`quickAskStateProbe` `:5466-5476`、`selectionProbe` `:5479-5488`、`pageSpanText` `:5491-5494`、`chipSnapshot` `:3323-3341`、`composerSnapshot` `:3344-3358`、`sendCalls` `:3265` / `clearSendCalls` `:3266` / `lastSend` `:3271` / `waitSendCalls` `:3278`、`userBlocks` `:2392`、`missingLines` `:3279`、`restoreStandardSeed` `:3423-3427`、`capturePage` `:1275-1283` / `repaint` `:1270-1274`、`rectOfSelector` `:2576-2592`、`js` / `sleep` / `waitFor` `:1605-1613`、`record` `:1616-1619`。

#### 3.3 场景 `r17-3`（组 `r17-selection-snapshot`，5 条 record / **25** 条断言 / 1 张截图）

> 判别性设计：本场景的两条来源必须**同时**被验证才能锁死语义 —— 相位 `snapshot-survives-typing` 构造「**store 已空**、chip 仍在」（= 快照来源）；相位 `new-selection` 构造「**store 非空且与快照不同**、chip 换成新文本」（= 新选区优先）。两者合起来排除「chip 只看 store」与「chip 只看快照」两种错实现。
> 非真空证据（登记：渲染层无 dev hook ⇒ 无法直接读 `readerStore.selectedText`）：以 ① `selectionProbe().collapsed === true && anchorInStage === false`（document 选区确实被收进输入框）+ ② 走查 `git diff -- pix/src/renderer/components/workspace/PdfViewer.vue` 为空（清空分支 `:795-798` / `:800-803` 逐字未动）共同钉住「store 已空」；相位 `new-selection` 再以「chip 跟随 store 的新值」反向钉住镜像链仍活。

**相位 `snapshot-survives-typing`（判据 a）**

| 步 | 动作 |
| --- | --- |
| 1 | `enterCleanWorkspace(seedNotes())` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 3)` |
| 2 | `selectPageSpan(1)` → `ensureQuickAskExcerptReady(1)`；`clearSendCalls()`；读 `selectionProbe()`、`pageSpanText(1)`、`chipSnapshot()`（点击时刻基准）、`userBlocks()`；读原始选区文本 `selectionText17j = js("document.getSelection().toString().trim()")` |
| 3 | 点「解释」（按文本定位 `.quick-ask-btn`）→ `waitFor` 浮层 `display === "none"` → 读 `quickAskStateProbe()`、`activeElement` 是否 `.input-area` |
| 4 | `typeIntoComposer(TYPED17)`（`TYPED17` 为本块内手写常量，例如 `"（追问）它在第二节的作用是什么？"`）→ 读 `composerSnapshot()`、`chipSnapshot()`、`selectionProbe()`、`userBlocks()`、`sendCalls().count` |
| 5 | 截图 `r17-3-snapshot-survives-typing.png`（`rectOfSelector(".composer", 0)`：chip 行 + 草稿同框可见；`.composer` 是 `.context-row` 与 `.composer-box` 的共同父容器，`ChatPanel.vue:1122` / `:1134` / `:1155`） |

失败即红的断言（9 条）：

1. 前置就绪：`ensureQuickAskExcerptReady(1).ok === true`（不成立即判红，不跳过）；
2. 点击**时刻**选区完好：`selectionBefore.collapsed === false && selectionBefore.anchorInStage === true && selectionBefore.text === pageSpanText(1)`；
3. 点击后浮层沿用既有 `hide()` 形态：`display === "none"`；
4. 键入前焦点已在 composer：`activeElement === SEL.composerInput`（真实键入路径的必要条件）；
5. 键入后「选中文本」chip **仍在**：`chipSnapshot().labels` 中存在以 `选中文本：` 开头的一项；
6. 该 label 逐字等于点击时刻的 label（`labels` 中该字段前后全等；= `选中文本：` + 选区前 24 字 + `…`）；
7. composer 草稿逐字 = `EXPLAIN_TEMPLATE + TYPED17`；
8. 零发送：`sendCalls().count` 增量 0 **且** `userBlocks()` 不变；
9. 非真空证据（pin 既有行为）：键入后 `selectionProbe().collapsed === true && anchorInStage === false`。

**相位 `send-payload`（判据 b）**

| 步 | 动作 |
| --- | --- |
| 1 | `clearSendCalls()` → `js("document.querySelector('.composer-send').click(), true")` → `waitSendCalls(1)`（既有场景 43 的驱动范式）→ `lastSend()` |
| 2 | 把载荷按 `split("\n")` 拆行落进 `data`（`lines` / `skeleton` / `selectedTextLine` / `nextLine` / `tail`） |

失败即红的断言（6 条）：

1. `sendCalls().count` 增量恰 1；
2. `payload.displayText` 逐字 = `EXPLAIN_TEMPLATE + TYPED17`（键入内容原样送达）；
3. 载荷含 `selectedText:` 行（`missingLines` 判）；
4. `selectedText:` 的**下一行**逐字 = `selectionText17j`（点击时刻的选区文本；两者都是 trim 后的值）；
5. 骨架行齐备且顺序正确：`lines[0] === "<reading_context>"`、`path:` 行以 `sample-paper.pdf` 结尾、含 `page: 1` 与 `pageCount: 3`、`selectedText:` 之后紧接文本行与 `</reading_context>`（允许 `pageCount:` 与 `selectedText:` 之间有既有 `section:` 行）；
6. 载荷尾部 = 空行 + 草稿逐字（`payload.message.endsWith("\n\n" + draft)`）。

**相位 `new-selection`（判据 c①）**

| 步 | 动作 |
| --- | --- |
| 1 | `clickNext()` → `waitPage(2, 3)` → `selectPageSpan(2)` → `ensureQuickAskExcerptReady(2)` → 读 `pageSpanText(2)` 与 `chipSnapshot()` |

失败即红的断言（3 条）：

1. 前置：`pageSpanText(2)` 非空且 ≠ `selectionText17j`（新选区确实不同）；
2. `labels` 中存在 `选中文本：` + `pageSpanText(2)` 前 24 字 + `…`（新选区覆盖旧快照，逐字）；
3. 该 label ≠ 点击时刻的 label（若仍显示旧快照文本即判红）。

**相位 `chip-removed`（判据 c②）**

| 步 | 动作 |
| --- | --- |
| 1 | `selectPageSpan(2)` + 就绪复核 → 点「问 AI」（任一 action 均可，取既有「问 AI」以覆盖 `ask` 分支）→ 等浮层隐藏 → 读 `selectionProbe()`、`chipSnapshot()`（移除前） |
| 2 | 按既有范式（`:3815-3824` 同款）在该 chip 内点 `SEL.contextChipRemove` → 读 `chipSnapshot()` |
| 3 | 触发既有 `resetExcludedContexts()`（`js("window.__pixStub.setMessages([]), true")`，与 `enterCleanWorkspace` 同原语；监听点 = `ChatPanel.vue:149-154` 的 `watch(() => sessionStore.displayBlocks.length === 0, …)`）；触发前置自检 `.message-block` 计数 **> 0**（保证 `非空 → 空` 的变化真实发生）→ `sleep` → 读 `chipSnapshot()`、`composerSnapshot()` |

失败即红的断言（4 条）：

1. 移除前：chip 存在**且** `selectionProbe().collapsed === true`（非真空：此刻 chip 只能由快照支撑）；
2. 移除后：`labels` 中不再有 `选中文本：` 项，`count` 较移除前 -1；
3. 既有 `resetExcludedContexts()` 触发后**仍无** `选中文本：` 项（不复活；若快照未清空，此处会以旧快照复活 ⇒ 判红）；**触发前置自检**：触发前 `.message-block` 计数 > 0（否则 `displayBlocks.length` 未发生 `非空 → 空` 变化、监听器不触发 ⇒ 判红为前置失败，不得降级为通过）；
4. composer 草稿在移除前后逐字不变（移除 chip 不改 composer）。

**相位 `doc-switch`（判据 c③）**

| 步 | 动作 |
| --- | --- |
| 1 | `selectPageSpan(1)` + 就绪复核 → 点「解释」→ 等浮层隐藏 → 读 `chipSnapshot()`、`selectionProbe()`（切换前：chip 由快照支撑） |
| 2 | `openRow("long-book.pdf")` → `waitFor("long-book 页盒 60 页", 'document.querySelectorAll(".pdf-page").length === 60')`（既有范式 `:10120-10124`）→ 读 `chipSnapshot()`、`sendCalls().count` |
| 3 | 收尾 `await restoreStandardSeed();` |

失败即红的断言（3 条）：

1. 切换前：`labels` 中存在 `选中文本：` 项 **且** `selectionProbe().collapsed === true`（快照支撑）；
2. 切换后：`labels` 中不存在 `选中文本：` 项（`filePath` 变化 ⇒ C② 清空）；
3. 切换全程 `sendCalls().count` 零增量（切文档不发送）。

#### 3.4 更新的既有断言（恰 1 处）

| 位置 | 现字面（本次实读） | 更新为 | 理由 |
| --- | --- | --- | --- |
| `ui-shot.mjs:10904-10909`（`r17-2` 相位 `explain`） | `chipsAfter17f.count === chipsBefore17f.count - 1 && labels === before.labels.filter((label) => !label.startsWith("选中文本")) && notesLabel / removeTitle 不变`，失败文案「chips 的净差异应恰为「选中文本」一项」 | `JSON.stringify(chipsAfter17f) === JSON.stringify(chipsBefore17f)`（`count` / `labels` / `notesLabel` / `notesTitle` / `removeTitle` 五字段逐字相等），失败文案「点击后 chips 应与点击前逐字相等（含「选中文本」项）」 | N97-4 使 N97-3 判据 1 的冻结字面（`chipSnapshot()` 与点击前逐字相等）在真实路径下**重新成立**；交付期的等价形态（净差异恰 1）随之退出 |

**不动的既有断言（逐条登记）**：`:10903-10904` 的「点击后选区应被收进输入框（既有 R8-dev D6 行为）」保留（N97-4 不修镜像链，只让 chip / 载荷不再依赖它）；`:10910-10916` 的三步控制实验保留（其判据只针对 document 选区，与快照无关；`:10917-10920` 的浮层形态与零写盘断言同样保留）；`r17-2` 其余相位、`r17-2b` 三相位、`r17-1*` 全部零改动。

### 4. 失败路径表（错实现 ⇒ 哪条判据先红）

| # | 错实现 | 判据（先红点） |
| --- | --- | --- |
| 1 | `pendingSelection` 恒空（未在 `onQuickAsk` 记录 / 只记 `ask` 分支） | `snapshot-survives-typing` 断言 5/6 红（chip 消失）；`doc-switch` / `chip-removed` 断言 1 红 |
| 2 | chip 仍读 `readerStore.selectedText`（只改了载荷） | `snapshot-survives-typing` 断言 5 红；`new-selection` 断言 2 通过但与实现无关（无法判别）⇒ 故必须有 `snapshot-survives-typing` |
| 3 | 载荷仍读 `readerStore.selectedText`（只改了 chip） | `send-payload` 断言 3/4 红（缺 `selectedText:` 行） |
| 4 | 优先级反转（store 优先、快照兜底） | `snapshot-survives-typing` 断言 5 红（store 已空 ⇒ 兜底也空） |
| 5 | 把「store 变空」也当失效 | 同上（`snapshot-survives-typing` 断言 5 红）——这是本轮最易犯的错（`watch` 条件漏 `trimmed &&`） |
| 6 | 新选区不使快照失效（C① 未落地） | `new-selection` 断言 2/3 红（chip 仍显示旧快照文本） |
| 7 | 移除 chip 不清快照（C③ 未落地） | `chip-removed` 断言 3 红（既有 `resetExcludedContexts()` 后旧文本复活） |
| 8 | 切文档不清快照（C② 未落地） | `doc-switch` 断言 2 红 |
| 9 | 发送时清空快照（C④ 违反） | `chip-removed` 断言 1 前置可满足但 `send-payload` 之后的相位读数异常；走查 `grep -c 'pendingSelection.value = ""'` = 4 即红 |
| 10 | 切会话清空（C⑤ 违反） | 走查：`grep -n -A3 "props.currentSessionPath" ChatPanel.vue` 的输出含 `pendingSelection` 即红 |
| 11 | 改动镜像链（`PdfViewer` / `reader-store`）或 chip 类名 / 文案 / 载荷格式 | 零 diff 判据红（§1 表 + §5 走查） |
| 12 | 改动既有排除机制（删 `excluded.has("selection")` 分支、改 `contextChips` 过滤、移除后不清排除集） | 既有 `42*` / `43*` 场景红（document / notes / selection 的移除语义）+ `grep -c "excludedContexts"` ≠ 7 |
| 13 | 在「无选区」路径上把既有 `selectedText:` 行为改掉（例如派生带空格 / 未 trim） | 既有 `r12-section-context` 两相位的 `selectedTextInPayload === false` 判红 |

### 5. 走查判据（命令级，正反双向；在 R17 §5.6 之上追加）

| # | 命令 | 期望 |
| --- | --- | --- |
| N1 | `grep -c "readerStore.selectedText" pix/src/renderer/components/workspace/ChatPanel.vue` | **1**（唯一来源 = 派生内部；反例 ≥ 2 即出现第二份来源） |
| N2 | `grep -c "effectiveSelectedText" …/ChatPanel.vue` | **3**（声明 1 + chip 1 + 载荷实参 1） |
| N3 | `grep -c 'pendingSelection.value = ""' …/ChatPanel.vue` | **3**（C① / C② / C③ 各 1；4 = 发送或切会话越界清空） |
| N4 | `grep -n -A3 "props.currentSessionPath" …/ChatPanel.vue` | 输出**不含** `pendingSelection`（C⑤） |
| N5 | `grep -c -F 'if (text) pendingSelection.value = text;' …/ChatPanel.vue` | **1**（C① 的记录点唯一；`grep -n -A1 "function onQuickAsk"` 的下一非空行即该行） |
| N6 | `grep -c -F 'if (kind === "selection") pendingSelection.value = "";' …/ChatPanel.vue` | **1**（C③ 的唯一清空点） |
| N7 | `grep -c -F 'selectedText: excluded.has("selection") ? "" : effectiveSelectedText.value,' …/ChatPanel.vue` | **1**（载荷实参逐字；既有排除分支保留） |
| N8 | `grep -c "excludedContexts" …/ChatPanel.vue`；`grep -c "context-chip" …/ChatPanel.vue` | **7** / **9**（与本次实读一致 ⇒ 既有排除机制与 chips 结构 / 文案零改写） |
| N9 | `git diff -- pix/src/renderer/components/workspace/PdfViewer.vue pix/src/renderer/stores pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue pix/src/renderer/composables/useQuickAsk.ts pix/src/renderer/components/input/InputArea.vue pix/src/renderer/utils/reading-context.ts pix/src/renderer/components/workspace/WorkspacePage.vue pix/src/renderer/assets/styles pix/package.json packages pix/scripts/smoke-notes.mjs pix/scripts/smoke-view.mjs` | 全部为空 |
| N10 | `git diff -U0 -- …/ChatPanel.vue \| grep -E "^-"` | 只允许 R17 已登记的 1 行（`function onQuickAsk(): void {`）+ N97-4 的 **2** 行（chip 取值行 `const selected = readerStore.selectedText.trim();`、载荷实参行 `selectedText: excluded.has("selection") ? "" : readerStore.selectedText,`）；不得出现 `QUICK_ASK_TEMPLATE` / `NOTES_ASK_TEMPLATE` / `QUICK_TEMPLATE_REPLACEABLE` / `excludeContext` / `resetExcludedContexts` / `context-chip` / `notesLabel` / `buildReadingUserMessage` 相关行 |
| N11 | `grep -c 'pendingSelection' …/ChatPanel.vue` | ≥ **6**（声明 / 派生 / 记录 / C① 读写 / C② 清空 / C③ 清空） |
| N12 | `sed -n '47,127p' pix/scripts/ui-shot.mjs \| grep -cE "^\s+[A-Za-z][A-Za-z0-9]*:\s"`；`grep -c "r17-3\|r17-selection-snapshot" pix/scripts/ui-shot.mjs` | **72**（70 + 2）；≥ 2（场景名 + label 各 ≥ 1，含场景内引用） |
| N13 | `grep -c "chipsAfter17f.count === chipsBefore17f.count - 1" pix/scripts/ui-shot.mjs`；`grep -c "JSON.stringify(chipsAfter17f) === JSON.stringify(chipsBefore17f)" pix/scripts/ui-shot.mjs` | **0** / **1**（§3.4 的唯一更新） |
| N14 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` | 0 error（`vue-tsc --noEmit` + 两个 `tsc --noEmit`） |

### 6. 配额与零缺失（在 R17 目标读数之上）

| 项 | R17 改后目标（本次实读基线） | N97-4 追加目标 |
| --- | --- | --- |
| `MANIFEST.json.shots.length` | 173 | **174**（+1） |
| 目录内 png | 173 | **174** |
| `MEASUREMENTS.json` 长度 | 248 | **253**（+5） |
| `label` 去重 | 68 | **69**（+1：`r17-selection-snapshot`） |
| 新增截图 | 7（`r17-1*` / `r17-2*`） | + **1**：`r17-3-snapshot-survives-typing.png` |
| `SEL` | 70 | **72** |
| 新增 helper | 5 | **6**（`typeIntoComposer`） |
| 零缺失 | 166 张 / 237 条 / 64 种 label（R16 基线） | **不变**：R16 基线 + R17 的 7 张 / 11 条 / 4 种 label 全部保留 |

### 7. 开放问题（登记，不阻塞本追加定稿）

1. **「真实键入」的口径**：本追加用 `typeIntoComposer`（原生 setter 追加 + `InputEvent(inputType: "insertText")`），与既有 `setDraft` 同通道；若要求真实引擎输入（`webContents.sendInputEvent`），需另立场景与通道（R17 §0.5 已登记同类口径）。
2. **`readerStore.selectedText` 不可直接读**：渲染层无 dev hook ⇒ 非真空证据走「document 选区 collapsed + 镜像链零 diff」（§3.3 注）；若后续加 dev hook，应把该间接证据升级为直接读数（另立轮次）。
3. **快照的生存期口径**：本追加按冻结语义取「与发送 / 会话无关，只随新选区 / 切文档 / 移除 chip 失效」；若负责人要求「发送后清空」或「切会话清空」，需改需求档 C④ / C⑤ 与本节 §2.4 / §4 #9#10（另立轮次）。
4. **连续追问只判「发送不清空」**：`send-payload` 相位只验证第一问后快照仍在（断言 1 的前置）；第二问不另立 record（成本 / 收益不足），登记为口径。

### 8. 收口修订（R17b · N97-4 收口）

> 依据：`R17-review.md`「代码审查（R17 · N97-4）」mustFix ①②③。本节是**对追加设计自身的更正与登记**：不改本档 §0–§9 的任何字面，也不改本追加 §1–§7 的判据 / 配额；唯一改字 = §3.3 相位 `snapshot-survives-typing` 步骤 5 括号内的裁切选择器（原字面与同括号列出的目的互斥，必须就地更正）。

| # | 修订 | 原字面 / 问题 | 现字面 | 登记 |
| --- | --- | --- | --- | --- |
| 1 | §3.3 相位 `snapshot-survives-typing` 步骤 5 的裁切选择器 | `rectOfSelector(SEL.composerBox, 0)`（= `.composer-box`）与同括号的「chip 行 + 草稿同框可见」互斥：`.context-row` 是 `.composer-box` 的**前一个兄弟**（`ChatPanel.vue:1134` / `:1155`）⇒ chip 行恒在框外 | `rectOfSelector(".composer", 0)`：`.composer`（`:1122`）同含 chip 行与 composer 盒 ⇒ 承诺的「chip 行 + 草稿同框」成立 | `R17-review.md`「代码审查（R17 · N97-4）」mustFix ① 处置①；`ui-shot.mjs` 同步改字（本表即登记） |
| 2 | §3.3 四个含选区的相位（`snapshot-survives-typing` / `new-selection` / `chip-removed` / `doc-switch`）的选区步 | 各相位只写 `selectPageSpan(page)`（+ `ensureQuickAskExcerptReady`）：迟到的阅读区滚动会在 `selectPageSpan` 的「摘录浮层」等待内按既有语义隐藏浮层并抛超时（收口复现 1 次判红） | 选区步前各调用一次**既有** `waitStageScrollQuiet()`（有界静默 400ms / 上限 6s，零改写）：有界静默等待把环境性滚动吸收掉；读数落进各相位 `data.scrollGuard`（追加字段） | 同上 mustFix ②；判据与断言（25 条）零新增零删除，`SEL` 72 项 / helper 6 个 / 截图与 record 配额均不变 |
| 3 | §8.2 #6 的目视口径（`r17-2c-template-translate-draft.png`） | 原「chip 仍在」在 `.composer-box` 裁切内无法目视（N97-4 后 chip 不再掉落，属裁切范围问题） | 不改本档字面；由 `R17-dev.md` 的目视登记重写结论（裁切不含 chip 行，chip 存活性以数据面 + `r17-3` 逐字断言为准） | `R17-review.md`「追加裁决（R17）」`(c)③` + 「代码审查（R17 · N97-4）」mustFix ③ |

