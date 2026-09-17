# PiX-Read R17 需求档 · 操作可达性（N96–N99）

> 上游：`docs/pm/PRD-V0.6.md` §1 缺口 2（「能力存在但不可发现」：章节导航 `[` `]`、翻页、`/`、Ctrl+F、摘录、问 AI 都已可用，但界面不告诉用户；选中一段英文后，最常用的两个动作（解释、翻译）需要用户自己组织问法。效率与可发现性应当被显式设计）、§2（R17 = 操作可达性：快捷键总览浮层；选区模板动作（解释 / 翻译 → 只预填草稿，不自动发送）；依赖 —）、§4 反需求 2（**R17 的模板动作只允许预填 composer 草稿，绝不自动发送**）、§4 反需求 5（不引入新运行时依赖、不改 `packages/*`）、§4 反需求 6（不改 `.pix-read/notes.json` 的格式与写入协议）、§4 反需求 7（不做向后兼容层、不写未被调用的死代码、不为「看起来高级」加动画）、§4 反需求 8（R16 的页面标记与高亮不得被本轮任何改动波及）、§5 工程红线（唯一工程门 `npm run check`、禁 any / 内联动态 import、中文文案、冻结字面显式登记、离屏串行与零缺失、临时产物零残留）、§7 判据 2（**存在一处可发现、可关闭、可键盘操作的快捷键总览；选区模板动作只预填草稿（可编辑、可清除、不自动发送）**）。
> 依赖：`docs/pm/R11-req.md` §0（**`.quick-ask` 浮层契约**：类名 / 三态反馈 / `FEEDBACK_MS = 2500` / 隐藏规则；Esc 语义边界）、`docs/pm/R12-req.md` §0（章节键位 `[` `]` 与框选模式屏蔽、`.reader-section` 字面）、`docs/pm/R14-req.md` §0（冻结字面登记范式、既有场景零改写纪律、窄栏手法）、`docs/pm/R16-req.md` §0（取证脚本契约：`SEL` 与既有场景 / 截图 / label 零删除、`record` 的「先落测量再抛错」语义、r16 场景的追加位置）。
> 本轮唯一主线（负责人已冻结，不得扩张）：**让既有操作可发现、让常用选区动作一步可达** —— ① 一处可发现的「快捷键总览」（列出全部真实键位，可开关、可键盘操作、不侵扰）；② 选区模板动作（解释 / 翻译 → **只预填 composer 草稿，绝不自动发送**）；③ 入口的发现性（不遮挡、不弹窗式打扰）。
> 范围约束：不做可配置键位、不做命令面板（command palette）、不做「首次使用自动弹窗」、不新增长期占位提示条、不新增 LLM 调用、不改主进程（`pix/src/main/**` 与 `pix/src/shared/types.ts` 零 diff）、不改 `notes.json`、不改 `.quick-ask` 既有两动作与反馈态、不改既有键位语义与阅读区 Esc 优先级、不引入依赖。需求编号 **N96–N99**，共 **16** 个子条（N96 6 / N97 4 / N98 2 / N99 4）。

**判定工具（本档所有验收只能由这五种证据判定，逐条已标注）**

| 记号 | 含义 |
| --- | --- |
| 【走查】 | 只读代码与 `git status` / `git diff` / `git show`（只读可用）；含 `grep -c` / `grep -rn` 计数类判据 |
| 【check】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error（唯一工程门） |
| 【烟测-渲染】 | 纯函数离线烟测 `pix/scripts/smoke-view.mjs`（本轮由 7 组 51 条 **扩到 9 组 74 条**，见 N99-2） |
| 【烟测-主进程】 | 数据面烟测 `pix/scripts/smoke-notes.mjs`（**本轮零改动**：10 组 65 条只作回归） |
| 【离屏】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + 既有截图/测量零缺失 + 新增断言组全绿 + 新增截图齐备 |

**本档事实基线（写档当天核对过的真实结果，供后续角色复核）**

| 事实 | 证据 |
| --- | --- |
| 工作树受控、分支 `main`、HEAD = `8850c9c`（R16 已提交交付） | 本档修订前实读：`git status --short` ⇒ 仅 `?? docs/pm/R17-req.md` / `?? docs/pm/R17-review.md`（两个流程档均未跟踪）；`git log --oneline -1` ⇒ `8850c9c feat(reader): 原文锚点（页面笔记标记、本页摘录高亮与面板定位）（V0.6 R16）` |
| 唯一工程门当前 0 error | 2026-09-17 实跑 `cd pix && npm run check` ⇒ `CHECK_EXIT=0`（`vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit`） |
| 既有烟测面（本轮基线） | `smoke-view.mjs`：组 7（`runSectionHit` `:173` / `runSectionNull` `:255` / `runSectionNav` `:308` / `runSectionFormat` `:385` / `runBadgeCounts` `:474` / `runNotesByPage` `:550` / `runExcerptMatch` `:620`），`grep -c "  check("` 实读 = **51**；编译面 `files` = `outline-notes.ts` / `notes-path.ts` / `reading-context.ts` / `page-anchor.ts` + `WINDOW_SHIM`（`:780-786`）、产物白名单 `required`（`:799`）/ `allowed`（`:800`）——**新增被测文件必须同步这三处**；`smoke-notes.mjs`：10 组 65 条（R16 档件登记；本轮零改动） |
| R16 零缺失比对基线（R17 的参照） | 目录 `C:/Users/86157/AppData/Local/Temp/pix-v06-r16-review/shots`：`MANIFEST.json` ⇒ `shots.length = 166`、`failure = null`；`MEASUREMENTS.json` ⇒ 长度 **237**、`label` 去重 **64** 种；目录内 png **166**（本次 `node -e` 复读）；`r16` 前缀 label **14** 条（`r16-page-badge` 3 / `r16-page-anchor` 3 / `r16-note-highlight` 3 / `r16-highlight-coexist` 2 / `r16-degrade` 3）、`r16` 前缀截图 **13** 张 |
| 阅读区键位（`pix/src/renderer/components/workspace/PdfViewer.vue`，`onWindowKeydown` `:415-484`，实读守卫顺序） | ① `:416` 修饰键分支起手（`ctrlKey \|\| altKey \|\| metaKey`）；② `:418-427` **Ctrl+F**（`ctrlKey && !shiftKey && !altKey && !metaKey && pageCount > 0 && key.toLowerCase() === "f"` ⇒ `preventDefault` + `openSearch()`，且**允许在任何输入框聚焦时生效**——注释逐字「allowed even while typing elsewhere because the panel steals focus from any field」）；③ `:434-437` **Esc + `captureMode`** ⇒ `exitCaptureMode()`（注释逐字「Capture mode owns Esc first」）；④ `:439-442` **Esc + `searchOpen`** ⇒ 关闭搜索；⑤ `:444` 守卫 `pageCount <= 0 \|\| isEditableTarget(event.target)` ⇒ return（谓词在 `:400-407`：`isContentEditable \|\| INPUT \|\| TEXTAREA \|\| SELECT`）；⑥ `:445-454` **`[` / `]`** ⇒ 章节上/下一节（框选模式屏蔽；目标为 null 时零副作用）；⑦ `:455-458` **`/`** ⇒ `openSearch()`；⑧ `:463-483` switch：**PageUp / ArrowLeft** 上一页（第 1 页 no-op）、**PageDown / ArrowRight** 下一页（末页 no-op）、**Home** 第一页、**End** 最后一页。**没有 ArrowUp / ArrowDown 分支**（本轮不得写入键位表） |
| 组件级键位（实读） | `PdfSearchPanel.vue` `onInputEnter` `:307-311`：`isComposing` 守卫 → `shiftKey` ⇒ 上一处（`goToPrev`）、否则下一处（`goToNext`）；输入框模板 `:407` `@keydown.enter="onInputEnter"`。`NotesPanel.vue` `onSearchEsc` `:222-226`：清空查询 + `blur()` + `stopPropagation()`（注释逐字：本输入框内的 Esc 不触发阅读区 Escape 语义）；`:631` `@keydown.esc="onSearchEsc"`。`PdfViewer.vue` 页码输入框 `:1209-1210`：`@keydown.enter.prevent="commitPageDraft"` / `@keydown.esc.prevent="cancelPageEdit"`。`InputArea.vue` `onKeydown` `:28-36`：`isComposing` 守卫 → `Enter && !shiftKey` ⇒ `preventDefault` + `emit("send")`（`Shift+Enter` 走浏览器默认换行）；`defineExpose({ focus })` `:48`。`ChatPanel.vue` 重命名对话框输入框 `:1166` `@keydown.enter="onRenameEnter"` ⇒ `onRenameEnter` `:708-711`（`isComposing` 守卫 `:709` → `void saveRename()`）——**本轮新增入表**（§0 修订 M4）。`SettingsPage.vue:491` `@keydown.enter="onSaveKeyEnter"`（设置页 API Key 输入框）**工作区外 ⇒ 范围外**（§0.3 注 5）。全仓实读：`@keydown` 模板挂点共 7 处（上列 6 处 + `SettingsPage.vue:491`）、window 级 `keydown` 监听 1 处（`PdfViewer.vue:493`），`grep -rn` 无其他挂点 |
| `.quick-ask` 现状（`pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`，285 行） | `MIN_SELECTION_CHARS = 2` `:18`、`BUTTON_GAP = 6` `:19`、`STAGE_PADDING = 4` `:20`、`FEEDBACK_MS = 2500` `:22`；`mode` 三态（`actions` ↔ `feedback`）`showFor` `:56-90`（几何 clamp `:80-89`）；`onButtonClick` `:148-152`；`onExcerptClick` `:154-…`（`notesStore.addNote` + 三态反馈）；模板 `:196-225`：`.quick-ask`（`v-show="visible"` `:198`，`class` `:200`，`@pointerdown.prevent` `:202`）→ 「问 AI」按钮 `:205-208`（`mdi-comment-question-outline`）→ 「摘录」按钮 `:209-218`（`mdi-notebook-plus-outline`，`v-if="canExcerpt"` `:210`）→ 反馈 `:220-223`；`hide()` `:92-102`（置 `visible=false` + **清空 `cachedText`** + `selectionPage=null` + `mode="actions"`）；`onButtonClick` `:148-152`（**先取 `const text = cachedText` 再 `hide()`**）；`.quick-ask` CSS `:228-242`（`z-index: 6` `:230`）；`.quick-ask-btn` `:244-264`（含 `:hover` `:257-259` / `:disabled` `:261-264`）。`canExcerpt` = `pageCount > 0 && selectionPage !== null`（`resolveSelectionPage` 在 `utils/note-capture.ts:16-36`，含「最近页兜底」⇒ 夹具内选区恒可定位到页） |
| `.quick-ask` 按钮数的既有断言（本轮必须登记更新） | `pix/scripts/ui-shot.mjs` 三处 `btnCount === 2`：`:5518`（`ensureQuickAskExcerptReady` 的 `ready` 判据）、`:6987`（r11-3 相位 4 到期回落断言）、`:7059`（r11-3 相位 5b 不同文本回落断言）；既有「按文本找摘录按钮」写法（`:1479`、`:5537`、`:6791`）不受新增按钮影响（见 §0.9） |
| seam 与 composer 现状（实读） | `useQuickAsk.ts`：`QuickAskHandler = (text: string) => void` `:10`、`registerQuickAskConsumer` `:14`、`emitQuickAsk(text)` `:18`（唯一发射方 = `PdfSelectionQuickAsk.vue:151`，唯一消费方 = `ChatPanel.vue` 的 `registerQuickAskConsumer(onQuickAsk)` `:848`）。`ChatPanel.vue`：`draft` `:163`、`composerInput` `:166`、`QUICK_ASK_TEMPLATE = "请解释选中的这段话："` `:304`、`onQuickAsk` `:306-310`（**草稿非空时一个字符都不改**）、`NOTES_ASK_TEMPLATE = "请结合我选中的摘录回答："` `:314`；composer 模板 `:1123-1148`（`.composer-box` / `InputArea` / `.composer-send`） |
| 布局事实（本轮定位与几何判据的坐标系） | 窗口 `1600 × 1000`（`ui-shot.mjs:44`）；`.pix-drag-bar` 高 = `--pix-window-controls-height` = 34px（`assets/styles/main.css:38-44`、`variables.css:122`）；`.app-layout` padding `4px 12px 10px 10px`（`AppLayout.vue:112`）；`--pix-left-width: 268px` / `--pix-right-width: 380px` / `--pix-pane-pill-height: 28px`（`variables.css:112-114`）；`.pane-pill` 为 `position: absolute`（`.center-pill` `:395-399`）⇒ 阅读栏顶边与中间栏 `.pane-shell` 顶边对齐（`top = 34 + 4 = 38`）；R16 基线实读：`.pdf-viewer` 宽 **912**（`r12-section-visible.viewerWidth`）、`.pdf-toolbar` 矩形 `{x:1067, y:79, w:120, h:26}`、`.pdf-page-indicator` `{x:671, y:950}`、`.reader-section` `{x:660, y:919}`、`.pdf-capture-fab` `{x:299, y:949}`（`r16-page-badge` 与 `r12-section-visible` 测量）⇒ 阅读栏 x∈[287,1199] 的三块「控件禁区」= 右上工具条 / 底部居中两组 / 左下 FAB。`.reader-stage` 为 `display: flex`（`ReaderPanel.vue:292-298`），其左列 = `.knowledge-map-slot`（`flex: 0 1 26%; min-width: 0; max-width: 240px; overflow: hidden`，`:300-309`；`v-if="showMap"` `:207`）；`showMap = mapOpen && isPdf && mapFits`（`:62`），`mapOpen` 默认 `false`（`reader-store.ts:30`）⇒ 地图列宽 = min(26% × stage 宽, 240px)（默认 912 宽下 ≈ 237），x≈[287, 524]、贯穿 stage 全高。`.pane-shell` 为 `position: relative`（`WorkspacePage.vue:369-376`）且 `.pane-pill` 带 `margin: 8px 10px 0`（`:377-392`）⇒ pill 盒 y∈[46,74]（高 28px），浮层 `top: 40px`（绝对 y=78）与该盒**只剩 4px 余量**（§0.4 登记依赖） |
| 入口候选落点的既有事实 | 工作区阅读区标题栏被隐藏：`.reader-under-pill :deep(.reader-header) { display: none }`（`WorkspacePage.vue:464-467`）⇒ 入口不得放 `reader-header`；`.center-pill` 模板 `WorkspacePage.vue:321-331`（子元素 = 可选折叠按钮 / `.pill-label`），既有「pill 内小圆按钮」范式 = `.map-toggle`（`ReaderPanel.vue:192-204` Teleport + `:311-344` 样式 + `mapToggleReady` 就绪判定 `:42`/`:159`，且 `v-if="mapToggleReady && isPdf"` ⇒ 只在 PDF 打开时存在）；`.layout-center` 为 `z-index: 1`（`AppLayout.vue:139`） |
| 窄栏既有手法（R11 / R14 已验证） | `document.documentElement.style.setProperty("--pix-left-width", "220px")` + `repaint(win)`（`ui-shot.mjs:7148-7150`、`:8628`），断言后复位（`:8675` 判据 `Math.abs(restoredLeft - 268) <= 2`）⇒ 本轮「窄栏」沿用同一手法，改作用在 `--pix-right-width` |
| 夹具与既有 helper（r17 复用清单） | `selectPageSpan(page)` `:1757`（选中目标页首个 span 并等浮层可见）、`setDraft(text)` `:2534`（原生 setter + `input` 事件）、`sendCalls()` / `clearSendCalls()` / `lastSend()` / `waitSendCalls()` `:3258-3271`、`userBlocks()` `:2385`、`quickAskStateProbe()` `:5459-5469`（`btnCount` `:5467`）、`composerSnapshot()` `:3337`、`chipSnapshot()` `:3316`、`pressReaderKey(key)` `:7276-7279`、`pressKeyOn(selector, key)` `:7282-7287`、`clickEl` `:7273`、`rectOfSelector` `:2569`、`repaint(win)` `:1263-1266`、`record(label, data, failures)` `:1609-1612`（「先落测量再抛错」）、`restoreStandardSeed()` `:3416`；`SEL`（`:47-118`）当前 **64** 项（本次脚本计数）；场景追加位置 = `runReaderStateScenarios` 末尾（`r16-5` 之后、`:10234` 的 `restoreStandardSeed()` + `:10235` 收口 `}` 之前） |
| 命名预检（本轮全部为**新增**名字，`pix/src` 内当前 0 命中） | `shortcut-overview` / `shortcut-toggle` / `shortcut-help` / `SHORTCUT_SECTIONS` / `SHORTCUT_NOTE` / `SHORTCUT_KEY_JOIN` / `ShortcutOverview` / `resolveTemplateDraft` / `templateForAction` / `EXPLAIN_TEMPLATE` / `TRANSLATE_TEMPLATE` / `QuickAskAction` / `quick-ask-templates` / 文案 `快捷键总览` 各 0 命中（`grep -rn` 实读） |
| 图标存在性（逐字冻结前的实读） | `pix/node_modules/@mdi/font/css/materialdesignicons.css` 内 `mdi-keyboard-outline` / `mdi-lightbulb-on-outline` / `mdi-translate` / `mdi-close` / `mdi-comment-question-outline` / `mdi-notebook-plus-outline` 均存在（`grep -o` 实读） |

---

## 0. 定稿修订（R17）

> 上游：`docs/pm/R17-review.md`「需求评审（R17）」的 must-fix 清单 **M1–M9**。
> 结论：**9 条全部接受、0 条拒绝**；每条给出「评审问题（本次实读核对）」与「本档修订落点」。正文已按本节就地同步（表内逐行给出同步位置）；本节是**定稿口径**：与正文冲突时以本节为准。
> 复核方式：本节全部结论来自本步真实文件实读（`grep` / `sed` / `node -e` 只读）、只读 `git` 命令（`git status --short` ⇒ 仅 `?? docs/pm/R17-req.md` / `?? docs/pm/R17-review.md`；HEAD `8850c9c`）与一次真实命令输出（`cd pix && npm run check` ⇒ `CHECK_EXIT=0`）；**本步不跑离屏取证与烟测**（留给设计 / 开发 / 审查步）。行号与计数一律以本次实读为准。
> 编号说明：本节是修订记录，不参与冻结契约编号；下文 §0.0–§0.9 与 §1–§7 的编号逐字不变。
> 配额影响汇总（登记）：§0.3 键位表 17 行 → **18 行**（M4）；烟测-渲染 73 条 → **74 条**（非阻塞建议已采纳）；离屏配额**不变**（4 场景 / 4 组 label / 11 条 record / 7 张截图）；`SEL` 增量**不变**（+6 ⇒ 70）；新增 helper 4 个 → **5 个**（M6）。

| # | 评审问题（事实核对） | 本档修订落点（同步位置） |
| --- | --- | --- |
| M1 | N97-3 判据 3 的 `quickAskStateProbe().btnCount === 0` **不可满足**（同一函数不可能同时 `display:none` 与计数 0）。实读：`hide()`（`PdfSelectionQuickAsk.vue:92-102`）只置 `visible=false` + 清 `cachedText` + `selectionPage=null` + `mode="actions"`；模板 `v-show="visible"`（`:198`）⇒ 按钮仍在 DOM；`canExcerpt`（`:42`）因 `selectionPage=null` 为 false ⇒ 「摘录」掉落；探针按 DOM 计数（`ui-shot.mjs:5467`）⇒ 点「解释」后实际 = `display === "none"` 且 **`btnCount === 3`** | 判据改为 `display === "none"` + `btnCount === 3`（并写明摘录掉落的成因）⇒ N97-3 判据 3；N99-3 相位表 `r17-2 / explain` 行同步；§0.6「三动作分支」登记保留（与 `hide()` 后的形态一致） |
| M2 | N96-6 判据 3 与 N99-4 判据 3 用 `r15-f16` 覆盖「卸载后不残留 window 监听」**不成立**。实读：`ui-shot.mjs:9202-9245` 的 counts 全部来自 `window.__pixStub.agentEventListenerCount()`（`:9207` / `:9223` / `:9242-9244`），只统计 stub 侧 agent 事件订阅数，与 DOM `window.addEventListener("keydown")` 无关 | 删去该表述；N96-6 判据 3 改为**加强走查**（`grep -c -F 'window.addEventListener("keydown"'` = 1 与 `... removeEventListener("keydown" ...` = 1 的配对）；N99-4 判据 3 改写为「限制登记」（DOM 监听泄漏在离屏无可观测面），并声明本轮不改这两个既有场景 |
| M3 | 浮层与 `.knowledge-map-slot` **重叠且未登记**。实读：`.reader-panel` = `position: relative`（`ReaderPanel.vue:263-268`）⇒ 浮层 `left: 8px / top: 40px` 的包含块；`.knowledge-map-slot` 是 `.reader-stage`（`display: flex`，`:292-298`）的左列（`flex: 0 1 26%; min-width: 0; max-width: 240px`，`:300-309`；`v-if="showMap"` `:207`），`showMap = mapOpen && isPdf && mapFits`（`:62`，`mapOpen` 默认 `false` `reader-store.ts:30`）⇒ 地图打开时浮层 x∈[阅读栏左 + 8, +328] 与该列（默认宽 ≈ 237）相交 | 采纳**处置②**：§0.4 新增「与知识地图的关系（登记，修订 M3）」行（明确接受该重叠 + 替代口径登记）；N96-5 判据 1/2 的入口步新增断言 `.knowledge-map-slot` **不在 DOM**（地图关闭态取值）；§0.1 新增知识地图冻结行；§5 新增反需求 10；§7 新增开放问题 5。**未采用**处置①（浮层按地图列右移，会连带改 §0.4 定位与 r17-1b 判据）⇒ 登记为须负责人改判 |
| M4 | 键位表**遗漏真实键位**且交互口径缺口：① `ChatPanel.vue:1166` `@keydown.enter="onRenameEnter"` ⇒ `onRenameEnter` `:708-711`（`isComposing` 守卫 `:709`），在工作区内；② `SettingsPage.vue:491`（设置页 API Key 输入框）**工作区外**但未登记；③ `?` = Shift+`/` 与 `PdfViewer.vue:455` 的 `/` 互不误触未写清；④ `?` 的 IME 口径缺失（R15 已把 `isComposing` 早退写成纪律）。全仓实读：`@keydown` 模板挂点共 7 处、window 级 `keydown` 监听 1 处（`PdfViewer.vue:493`） | ① §0.3 新增第 17 行 `["Enter"]` / `提交重命名（对话名称输入框）`（依据 `ChatPanel.vue:1166` + `:708-711`）⇒ 全表 17 → **18 行**（§0.0 第 1 条、§0.2 第 1 条、§0.3 表与注 1/注 4、N96-2、§6 第 1 行、§7 开放问题 3 同步）；② 新增 §0.3 注 5（收录口径 + 设置页范围外）；③ 新增 §0.3 注 6；④ §0.5 新增「分支顺序（逐字冻结）」行（含 `isComposing` 早退）⇒ §0.2 第 3 条、§0.5「打开（键位）」行、N96-3 判据 4 同步。**未采用**「只登记排除理由」口径（表内会出现「有监听却不列」的空洞），替代口径登记为 §7 开放问题 6 |
| M5 | **档内自相矛盾**：§0.3 注 4 禁止「守卫细节塞进 `desc`」，而第 17 行 `desc` = `打开或关闭本总览（不在输入框内时）` 正是守卫细节；又「全局」组名与「仅工作区可用」（组件挂在工作区 `ReaderPanel`）不符 | 第 18 行（原第 17 行）`desc` 改为纯主语义 `打开或关闭本总览`（守卫细节由 §0.5 承载）；组名 `全局` → **`工作区`**；注 4 保留原规则并加一句「第 18 行已按本条改字」⇒ N96-2 判据 2 的组标题期望字面与 N99-2 `shortcut-table` 判据 2 同步 |
| M6 | **四类判据不可判 / 不完整**（helper 名配额与之冲突）：① N96-4 判据 1 的 body 分支缺前置（合成 keydown 不改焦点，`lastFocused` 会是 `.input-area` ⇒ 断言不可能成立）；② N98-2 判据 1「工作区内不存在任何新增常驻元素」不可判；③ 「不 `preventDefault`」与 INPUT / SELECT 分支无判据（合成事件不产生文本 ⇒「草稿值不变」是空断言）；④「浮层内恰 1 个可聚焦控件」无计数判据 | ① §0.5「关闭后焦点归还」行冻结 body 前置步（`blur()` + 自检 `activeElement === document.body`）⇒ N96-4 判据 1；② N98-2 判据 1 改为「`.shortcut-overview` / `.shortcut-row` / `.shortcut-key` / `.shortcut-note` 计数全 0 + `.shortcut-toggle` 计数恰 1」；③ §0.5「不劫持」行给出可判口径 + **新增 helper `pressKeyOnReturning`**（§0.9 第 6 条；既有 `pressKeyOn` 零改写）⇒ N96-3 判据 1 的 TEXTAREA / INPUT 两支（`dispatchEvent` 返回 **true**）+ 判据 4（分支顺序走查）；④ `shortcutProbe()` 增 `focusableCount` ⇒ N96-4 判据 3（`=== 2`）。`SELECT` / `contenteditable` 在 `pix/src/renderer` 内**无实例**（`grep` 实读）⇒ 该两分支只由逐字同构副本 + 走查保证，不写不可达断言 |
| M7 | `QUICK_TEMPLATE_REPLACEABLE` 的**内容不可判**：`ChatPanel.vue` 是 `.vue`，`smoke-view.mjs` 编译面只含 `utils/*.ts` ⇒ `known` 是测试内自写常量，原判据只数出现次数（不能证明集合内容） | §0.7 新增「可替换集合的判定（走查，修订 M7）」行 + N97-2 判据 5 改为**逐字单行** grep（`grep -c -F 'const QUICK_TEMPLATE_REPLACEABLE: readonly string[] = [QUICK_ASK_TEMPLATE, EXPLAIN_TEMPLATE, TRANSLATE_TEMPLATE];'` = 1，且该行不得出现 `NOTES_ASK_TEMPLATE`）⇒「笔记模板不参与替换」不再是空验证面 |
| M8 | §0.6 冻结的「`hide()` → `emitQuickAsk(cachedText, action)`」与实现**冲突**：`hide()` `:94` 清空 `cachedText`，既有 `onButtonClick` `:148-152` 是**先取后用** ⇒ 按原字面实现会发射空串 | §0.6「点击语义」行改为「先取 `const text = cachedText` → `hide()` → `if (text) emitQuickAsk(text, action)`」（与既有 `onButtonClick` 逐字同构）+ 新增「`onTemplateClick` 形状（逐字冻结，修订 M8）」行；N97-3 新增判据 4（形状走查，兼作「发射文本非空」依据）；§0.2 第 4 条同步 |
| M9 | **事实表行号失真**。本次实读刷新：`repaint` `:1263-1266`（原 `:1258`）、`record` `:1609-1612`（原 `:1604`）、`restoreStandardSeed` `:3416`（原 `:3411`）、场景收口 `:10234` / `:10235`（原 `:10230`）、`clickEl` `:7273`（原 `:7268`）、`pressReaderKey` `:7276-7279`（原 `:7272-7275`）、`pressKeyOn` `:7282-7287`（原 `:7277-7283`） | 事实表逐条改字（夹具与既有 helper 行、`.quick-ask` 现状行、入口候选落点行、N99-3 追加位置行、§0.9 第 4 条）；另修 `.quick-ask` 行段（模板 `:196-225`、「问 AI」`:205-208`、「摘录」`:209-218`、`.quick-ask-btn` `:244-264`，原 `:200-222` / `:205-210` / `:212-219` / `:244-266`）、补 `hide()` `:92-102` 与 `onButtonClick` 顺序、`.map-toggle` `:192-204` / `:311-344`（原 `:192-205` / `:311-345`）与 N97-1 判据 2 的模板行段。经复核**不变**：`selectPageSpan` `:1757`、`setDraft` `:2534`、`rectOfSelector` `:2569`、`userBlocks` `:2385`、`sendCalls` `:3258`、`chipSnapshot` `:3316`、`composerSnapshot` `:3337`、`quickAskStateProbe` `:5459-5469`、`SEL` `:47-118`（64 项）、`ui-shot.mjs:44`、三处 `btnCount === 2`（`:5518` / `:6987` / `:7059`） |

**非阻塞项一并处理（评审建议，本步已采纳）**

1. 评审 §3 第 5 条（§0.7 的「空白差异即不匹配」半句无断言）：`template-draft` 增第 11 条（`" " + EXPLAIN` ⇒ `null`）⇒ 烟测 73 → **74** 条；§0.2 第 5 条、§0.9 第 5 条、N99-1 判据 2、N99-2 标题、§6 第 8 行同步。
2. 评审 §4「pill 与浮层的垂直关系（数值口径偏差）」：§0.4 新增「定位依赖（登记）」行（`.pane-pill` `margin: 8px 10px 0` + `height: 28px` ⇒ pill 盒 y∈[46,74]，浮层 y=78 ⇒ **余 4px**），并把「不改 pill 几何」写进 §0.4「约束」行与 §5 反需求 10；事实基线表的布局行同步登记 `.pane-shell` 的 `position: relative`（`WorkspacePage.vue:369-376`）。
3. 评审 §4「既有截图面登记不全（非阻塞）」：§0.9 第 4 条补登 3 张以 `rectOf(SEL.quickAsk, 30)` 裁切的既有截图（`06c-excerpt-entry-zoom.png` `:1402` / `07b-excerpt-feedback-zoom.png` `:1457` / `07c-excerpt-duplicate-zoom.png` `:1487`，裁切来源 `:1401` / `:1456` / `:1486`），与 r11-3 两张合并 = **5 张「像素会变、无像素比对断言」**的登记。
4. 评审 §5 遗漏 b（helper 名配额冲突）：裁决为**补名**（不削弱判据）⇒ 新增 `pressKeyOnReturning`，§0.9 第 6 条写死 5 个 helper 名与各自字段。
5. 评审 §5 遗漏 c（流程口径：白名单第 10 行含 `R17-req.md` 而冻结条目「不得改写」）：本轮冻结字面的变更由 PM 角色**就地改字并在本节逐条留痕**（§0.2 / §0.3 / §0.5 / §0.6 / §0.7 / §0.9 的变更点均在上表可见）；需负责人裁决的替代口径一律登记在 §7（开放问题 5/6），评审与开发不得自行改字。

**登记为不采纳 / 延后（不阻塞本轮，不削弱判据）**

1. M3 的处置①（浮层改为避开地图列的定位）与 M4 的「只登记排除理由」口径 ⇒ 见上表与 §7 开放问题 5/6，须负责人改判后另立轮次。
2. 离屏覆盖 `SELECT` / `contenteditable` 分支：应用内无实例（`grep` 实读）⇒ 不写不可达断言，登记在 §0.5「不劫持」行与 N96-3 判据 1。
3. 「用真实按键（`sendInputEvent`）造输入以验证未 `preventDefault`」：本轮采用 `dispatchEvent` 返回值口径（`pressKeyOnReturning`），理由是既有离屏夹具全部使用合成 `KeyboardEvent`（`r15-ime` `:4234` 同范式）、不开真实输入通道；若后续需要真实键入，另立场景。

## 0. 定稿登记与冻结契约（设计档、开发档、评审档均不得改写）

### 0.0 本档三项定稿判断（登记；评审可复核，负责人可裁决改判）

1. **键位总览的数据源 = 纯数据模块，组件只做渲染。** 18 行键位表冻结在 `pix/src/renderer/utils/shortcut-help.ts`（零 import 的纯数据 + 类型），`ShortcutOverview.vue` 只 `v-for` 渲染。**收录口径（本步冻结）**：只登记「工作区内应用代码显式注册 `keydown` 监听的键位」+「composer 的 `Shift+Enter` 换行（浏览器默认，因未拦截）」；框架级默认（Vuetify 对话框 Esc 关闭等）与工作区外页面（`SettingsPage.vue`）不入表（§0.3 注 5）。理由：①「必须与代码一致」这件事需要一个可被离线烟测逐字断言的唯一事实源（组件里手写字符串无法在 smoke-view 面验证）；② 与 R13/R16 的纯函数范式一致（`page-anchor.ts` / `notes-path.ts` 先行）。备选（键位表写在 `.vue` 内）未采用：它把「键位事实」锁死在渲染层，smoke 面只能靠离屏 DOM 文本，证据层级更弱。若负责人改判，需同时改 §0.2 第 1 条、N96-2、N99-2 与 §6 第 1 条。
2. **入口放中间栏 pill（`.center-pill` 追加一个图标按钮），不放阅读区标题栏。** 事实依据：`.reader-header` 在工作区被 `display: none`（`WorkspacePage.vue:464-467`）；`.center-pill` 已有「pill 内小圆按钮」的既有范式（`.map-toggle`）。入口与浮层由**同一个新组件** `ShortcutOverview.vue` 提供：入口经 `Teleport` 追加进 `.center-pill`（与 `.map-toggle` 同范式），浮层渲染在组件自身位置（挂在 `ReaderPanel.vue` 内，`.reader-panel` 是 `position: relative` ⇒ 绝对定位的包含块明确）。副作用登记：`Teleport` 的追加顺序由挂载顺序决定（子组件 `onMounted` 先于父组件 ⇒ `.shortcut-toggle` 可能落在 `.map-toggle` 之前），因此**不**对两者相对顺序写断言，只断言「两者都在、`.pill-label` 仍是 `.center-pill` 的第一个非按钮子元素、既有子元素零改写」。
3. **浮层不劫持既有键位语义（含 Esc）。** 打开期间的 `/` `[` `]` 翻页 `Ctrl+F` `Enter` 照常生效；Esc 关闭浮层的同时**不阻断**阅读区既有顺序（R11/R16 冻结的「capture 优先 / 关闭搜索」照常处理，浮层不做 `stopPropagation`、不做捕获阶段拦截）；`?` 在输入框内（`INPUT` / `TEXTAREA` / `SELECT` / `contenteditable`）**不触发**（不劫持打字）且**不 `preventDefault`**。备选（打开期间用捕获阶段吞掉 Esc，做成「Esc 只关浮层」）未采用：它与 R16 §0.1 冻结的「capture mode owns Esc first」直接冲突，且会制造第二种 Esc 优先级；若负责人改判，需同时改 §0.5、N96-3 与 r17-1 的 `close-paths-and-focus-return` 相位断言。**同一次 Esc 的双响应已冻结为可判断言**（修订 M6）：浮层与文档搜索同时打开时，一次 Esc 同时关闭两者（r17-1 相位 `key-toggle-and-typing-guard` 收尾断言两者均离开 DOM）；`?` 的守卫按 §0.5 冻结的**分支顺序**（`isEditableTarget` 早退在 `preventDefault()` 之前，`isComposing` 早退与 R15 的 IME 纪律同口径）。

### 0.1 本轮不得改写的既有冻结项

| 来源 | 冻结内容 | 本轮为什么不得动 |
| --- | --- | --- |
| R11 / R15 / R16 | **`.quick-ask` 既有两动作与反馈态**：`.quick-ask` / `.quick-ask-btn` / `.quick-ask-feedback`（`.is-ok` / `.is-duplicate` / `.is-error`）类名，`问 AI` / `摘录` 文案与图标，`canExcerpt` 门控，`@pointerdown.prevent`（点击不塌选区），`mode` 三态与 `FEEDBACK_MS = 2500`、`showFeedback` 的「同文本保态」分支、滚动 / 选区变化 / 文档切换的隐藏规则、`MIN_SELECTION_CHARS = 2` 与 clamp 几何（`STAGE_PADDING` / `BUTTON_GAP`） | PRD §4.2 只允许**新增**模板动作；既有两动作是 `r11-quick-ask-scroll-scope`（基线 5 条 record）与三处按钮数断言的直接对象，零改写即零回归 |
| R8 / R9 | **composer 语义**：`draft` 的读写、`InputArea` 的 Enter 发送 / Shift+Enter 换行 / IME 组合态守卫、发送失败还原快照（`sentDraft` 还原）、`QUICK_ASK_TEMPLATE` 与 `NOTES_ASK_TEMPLATE` 的两个字面、`onQuickAsk`（action = `ask` 时「草稿非空一字不改」）与 `onNotesAsk` 的既有分支 | 模板动作是**新增动作**，不得借机改动既有动作与既有模板 |
| R9 / R10 / R13 | **chips 与载荷语义**：`.context-chip*` 结构与文案、`send()` 内的快照 / 排除集 / `<reading_context>` 实参装配、`utils/reading-context.ts` 与 `notes-path.ts` | 模板动作只写草稿，不碰注入与载荷；「不清空选区」正是既有 chip 注入链路的输入 |
| R11 / R12 / R16 | **阅读区键位与守卫顺序**：`onWindowKeydown` 的八个分支与顺序（Ctrl+F → capture Esc → search Esc → `isEditableTarget` 守卫 → `[` `]` → `/` → 翻页 switch）、`NotesPanel` 搜索框 Esc 的 `stopPropagation` 范式、页码输入框 Enter / Esc | 总览是既有键位的**只读清单**；任何键位语义改动都会连带改写 §0.3 的事实源 |
| R11 / R16 | **PDF 文字层与高亮**：`.textLayer` DOM、`pix-search` / `pix-search-current` / `pix-note-anchor` 注册表与 `::highlight()` 三条规则、`.pdf-page` 子元素结构 | 本轮在这些区域**零改动**（不新增第四条规则、不碰注册表） |
| 全局（本次登记） | **知识地图**：`.knowledge-map-slot` 的结构与几何（`flex: 0 1 26%; min-width: 0; max-width: 240px`）、`KnowledgeMap.vue`、`readerStore.mapOpen` / `setMapOpen` / `mapFits` 语义 | 浮层是**可选 overlay**，本轮登记「地图打开时允许压住地图列顶部」（§0.4）⇒ 不得因此改地图列或 `.reader-stage` 布局；r17-1b 两相位在**地图关闭态**取值（N96-5） |
| R14 / R15 / R16 | 取证脚本契约：`ui-shot.mjs` 启动守卫、产物自净、结束自检、`SEL` 与既有场景 / 截图 / label **零删除零改写**（§0.9 登记的三处按钮数断言除外）、`record` 的「先落测量再抛错」语义 | 本轮只**追加**：`SEL` 6 项、新 helper、`r17-*` 场景；既有 166 张 / 237 条 / 64 种 label 零缺失 |
| 全局 | 既有类名与中文文案；`--pix-*` 变量表（**不新增变量**）；`pix/src/main/**` 与 `pix/src/shared/types.ts`（零 IPC，两个文件零 diff）；`pix/package.json`（沿用既有 `smoke:view`，不新增 script）；`.pix-read/**` 资产格式 | 取证断言建立在既有字面上；新样式只允许复用既有变量 |

### 0.2 本轮新增冻结项（设计档、开发档、评审档均不得改写）

| # | 项 | 冻结内容 |
| --- | --- | --- |
| 1 | 键位总表（N96） | §0.3 全表：新文件 `pix/src/renderer/utils/shortcut-help.ts` 导出 `ShortcutRow` / `ShortcutSection` 类型、`SHORTCUT_SECTIONS`（3 组 / 18 行）、`SHORTCUT_KEY_JOIN = " / "`、`SHORTCUT_NOTE`（逐字）；组件按 `keys.join(SHORTCUT_KEY_JOIN)` 与 `desc` 渲染，**不得**在组件内手写任何键位文案 |
| 2 | 总览浮层与入口（N96 / N98） | §0.4 全表：入口类名 `.shortcut-toggle`、图标 `mdi-keyboard-outline`、`title` / `aria-label` / `:aria-expanded` 逐字；浮层类名 `.shortcut-overview`（`role="dialog"` / `aria-label` / `tabindex="-1"`）、内部 `.shortcut-header` / `.shortcut-title` / `.shortcut-close` / `.shortcut-section` / `.shortcut-section-title` / `.shortcut-row` / `.shortcut-key` / `.shortcut-desc` / `.shortcut-note` 与全部样式逐字（`top: 40px; left: 8px; width: 320px; z-index: 7`） |
| 3 | 开关与焦点契约（N96） | §0.5 全表：`?` 打开/关闭（守卫**分支顺序** = `key !== "?"` → 修饰键 / `isComposing` → `isEditableTarget(event.target)` → 才 `preventDefault()` + `toggle()`）、Esc 关闭（不阻断既有语义；与搜索面板同时打开时同一次 Esc 双响应）、点击浮层外关闭、再次点击入口关闭；打开后焦点 → 浮层容器（`nextTick` 后 `.focus()`）、关闭后焦点归还（打开前 `activeElement` 若 `isConnected` 则聚焦之，否则聚焦入口按钮）；**浮层内可聚焦控件 = 2**（容器 `tabindex="-1"` + `.shortcut-close`，无焦点陷阱）；关闭即 `v-if` 真删除 DOM；打开 / 关闭全程零 IPC、零持久化 |
| 4 | 选区模板动作（N97） | §0.6 全表：DOM 顺序 `问 AI` / `解释` / `翻译` / `摘录`；新按钮文案 `解释`（`mdi-lightbulb-on-outline`）/ `翻译`（`mdi-translate`），`size="12"`，无 `title`；`EXPLAIN_TEMPLATE` / `TRANSLATE_TEMPLATE` 两个模板逐字；`templateForAction` / `resolveTemplateDraft` 签名与语义（§0.7）；`emitQuickAsk` 的第二参数 `QuickAskAction`；`onTemplateClick` 的**取文本 → `hide()` → 发射**顺序与逐字形状（§0.6） |
| 5 | 反需求与配额 | §5 反需求全表；新增配额 = 离屏 **4 场景 / 4 组 label / 11 条 record / 7 张截图**、烟测-渲染 **+2 组 23 条**（7 组 51 条 → 9 组 74 条）、烟测-主进程 **零改动**（10 组 65 条回归）（§0.9） |

### 0.3 键位总表（逐字冻结）

数据源：`pix/src/renderer/utils/shortcut-help.ts`

```ts
export interface ShortcutRow { keys: string[]; desc: string; }
export interface ShortcutSection { title: string; rows: ShortcutRow[]; }
export const SHORTCUT_KEY_JOIN = " / ";
export const SHORTCUT_SECTIONS: readonly ShortcutSection[] = [ /* 3 组 18 行，逐字见下表 */ ];
export const SHORTCUT_NOTE = "选区浮层（选中文本后出现，无键位）：问 AI / 解释 / 翻译 / 摘录";
```

| # | 组 | `keys`（逐字） | 渲染文本（`keys.join(" / ")`） | `desc`（逐字） | 代码依据（写档时实读） |
| --- | --- | --- | --- | --- | --- |
| 1 | `阅读区（打开文档后）` | `["/"]` | `/` | `打开文档搜索` | `PdfViewer.vue:455-458` |
| 2 | 同上 | `["Ctrl+F"]` | `Ctrl+F` | `打开文档搜索` | `PdfViewer.vue:418-427` |
| 3 | 同上 | `["PageUp", "←"]` | `PageUp / ←` | `上一页` | `PdfViewer.vue:463-468`（`PageUp` / `ArrowLeft`） |
| 4 | 同上 | `["PageDown", "→"]` | `PageDown / →` | `下一页` | `PdfViewer.vue:469-474`（`PageDown` / `ArrowRight`） |
| 5 | 同上 | `["Home"]` | `Home` | `跳到第一页` | `PdfViewer.vue:475-478` |
| 6 | 同上 | `["End"]` | `End` | `跳到最后一页` | `PdfViewer.vue:479-482` |
| 7 | 同上 | `["["]` | `[` | `上一节` | `PdfViewer.vue:445-454` |
| 8 | 同上 | `["]"]` | `]` | `下一节` | 同上 |
| 9 | 同上 | `["Esc"]` | `Esc` | `退出框选模式或关闭文档搜索` | `PdfViewer.vue:434-442` |
| 10 | `输入框` | `["Enter"]` | `Enter` | `发送消息（对话输入框）` | `InputArea.vue:28-36` |
| 11 | 同上 | `["Shift+Enter"]` | `Shift+Enter` | `换行（对话输入框）` | 同上（未拦截 ⇒ 浏览器默认换行） |
| 12 | 同上 | `["Enter"]` | `Enter` | `下一处（文档搜索框）` | `PdfSearchPanel.vue:307-311` |
| 13 | 同上 | `["Shift+Enter"]` | `Shift+Enter` | `上一处（文档搜索框）` | 同上 |
| 14 | 同上 | `["Enter"]` | `Enter` | `跳转到该页（页码输入框）` | `PdfViewer.vue:1209` |
| 15 | 同上 | `["Esc"]` | `Esc` | `取消页码输入（页码输入框）` | `PdfViewer.vue:1210` |
| 16 | 同上 | `["Esc"]` | `Esc` | `清空搜索并移出焦点（笔记搜索框）` | `NotesPanel.vue:222-226` |
| 17 | 同上 | `["Enter"]` | `Enter` | `提交重命名（对话名称输入框）` | `ChatPanel.vue:1166` + `onRenameEnter` `:708-711`（`isComposing` 守卫 `:709`） |
| 18 | `工作区` | `["?"]` | `?` | `打开或关闭本总览` | 本轮新增（§0.5） |

**键位表的注册纪律**

1. 行数与分组数写死：**3 组 / 18 行**；`desc` 与 `keys` 逐字冻结（评审与开发阶段不得改字、不得增删行）。
2. 表内**不得**出现以下不存在于代码的键位：`ArrowUp` / `ArrowDown`（`PdfViewer.vue` 的 switch 无此分支）、任何「摘录键位」（无）、任何「缩放键位」（缩放只有 `Ctrl+滚轮`，属 wheel 手势而非键位 ⇒ 不入表；登记为事实）、**框架级默认键位**（Vuetify 对话框的 Esc 关闭等：无应用侧 `keydown` 监听，按注 5 口径不入表）。
3. `SHORTCUT_NOTE` 是唯一登记「摘录」的位置（选区浮层动作没有键位这一事实的显式说明）；**不得**为摘录编造键位，也**不得**删除该行（负责人指令「总览含摘录」按此条兑现）。
4. 说明行只写主语义：各键位的守卫细节（框选模式下 `[`/`]` 不生效、首/末页翻页 no-op、`?` 在输入框内不触发）由 §0.5 与本表注 2/注 3 承载，**不得**把守卫细节塞进 `desc`（否则 18 行文案无法逐字收敛）；第 18 行已按本条改字（修订 M5）。
5. **收录口径（冻结）**：只登记「工作区内应用代码显式注册 `keydown` 监听的键位」+「composer 的 `Shift+Enter` 换行（浏览器默认，因未拦截）」；`SettingsPage.vue:491` 的 Enter（设置页 API Key 输入框）为**工作区外 ⇒ 范围外**；Vuetify 对话框默认（Esc 关闭）与浏览器全局默认不入表。该口径与 §0.3 全表逐行对应（修订 M4）。
6. **`?` 与 `/` 互不误触（冻结）**：`PdfViewer.vue:455` 判 `event.key === "/"`、本轮 `?` 分支判 `event.key === "?"`（US 布局下 `?` = Shift+`/`）⇒ 两者按 `event.key` 天然分离；`PdfViewer.vue` 本轮**零 diff** ⇒ `/` 语义不变（登记为事实）。

### 0.4 总览浮层与入口（逐字冻结）

| 项 | 逐字值 |
| --- | --- |
| 组件 | 新文件 `pix/src/renderer/components/workspace/ShortcutOverview.vue`（`<script setup lang="ts">`，无 props / 无 emits） |
| 挂载点 | `ReaderPanel.vue` 模板内、`<PdfSelectionQuickAsk />`（`:258`）之后新增 `<ShortcutOverview />` 一行 |
| 入口元素 | `<button type="button" class="shortcut-toggle" :title="…" aria-label="快捷键总览" :aria-expanded="open">`，内容 = `<v-icon size="14">mdi-keyboard-outline</v-icon>` |
| 入口 `title` | `快捷键总览（?）`（全角括号；例同既有 `.reader-section-prev` 的 `上一节（快捷键 [）` 风格） |
| 入口 `aria-label` | `快捷键总览`（不带键位提示：title 承载可发现性、aria 承载名称） |
| 入口挂载方式 | `Teleport` 到 `.center-pill`（与 `.map-toggle` 同范式）；就绪判定 = 组件 `onMounted` 时 `document.querySelector(".center-pill")` 非空（`pillReady` ref，`false` 时不渲染入口）；**只追加**：不插入既有子元素之间、不改 `pill-label` / `.pill-tab` / 折叠按钮 / `.map-toggle` 的任何属性 |
| 入口样式 | `.shortcut-toggle { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; margin-left: 2px; padding: 0; border: none; border-radius: 999px; background: transparent; color: var(--pix-text-secondary); cursor: pointer; flex-shrink: 0; }`；`.shortcut-toggle:hover { background: var(--pix-bg-hover, #eef2f6); color: var(--pix-text-primary); }`；`.shortcut-toggle[aria-expanded="true"] { background: var(--pix-bg-active, #dfeaf4); color: var(--pix-text-primary); }` |
| 浮层元素 | `<div v-if="open" ref="panelEl" class="shortcut-overview" role="dialog" aria-label="快捷键总览" tabindex="-1">` |
| 浮层内部结构（DOM 顺序） | `.shortcut-header`（内 `.shortcut-title` 文本 `快捷键总览` + `.shortcut-close`）→ 3 × `.shortcut-section`（内 `.shortcut-section-title` 文本 = 组标题 + N × `.shortcut-row`）→ `.shortcut-note`（文本 = `SHORTCUT_NOTE`）；`.shortcut-row` 内 = `<kbd class="shortcut-key">{{ keys.join(SHORTCUT_KEY_JOIN) }}</kbd>` + `<span class="shortcut-desc">{{ desc }}</span>` |
| 关闭按钮 | `<button type="button" class="shortcut-close" title="关闭" aria-label="关闭" @click="close">` + `<v-icon size="14">mdi-close</v-icon>`；浮层内**恰 1 个按钮级**可聚焦控件（即它；容器自身 `tabindex="-1"` 不参与 Tab 顺序；无焦点陷阱，Tab 可离开 —— 计数口径见下行「可聚焦控件计数」） |
| 浮层定位 | `position: absolute; top: 40px; left: 8px; z-index: 7;`（相对 `.reader-panel`；`top: 40px` 使浮层顶边落在 pill 底边之下、且与右上工具条无 x 交集 ⇒ 见 N96-5 的零相交判据） |
| 浮层尺寸 | `width: 320px; max-height: calc(100% - 104px); overflow-y: auto;`；`display: flex; flex-direction: column; gap: 6px;` |
| 浮层样式（逐字） | `padding: 10px 12px; border: 1px solid var(--pix-border-light, #e3eaf0); border-radius: 12px; background: var(--pix-bg-elevated, #ffffff); box-shadow: var(--pix-shadow-md); color: var(--pix-text-primary); font-family: var(--pix-font-ui); font-size: 12px; line-height: 1.5; outline: none;` |
| 内部样式（逐字） | `.shortcut-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }`；`.shortcut-title { font-size: 12px; font-weight: 600; }`；`.shortcut-close { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0; border: none; border-radius: 999px; background: transparent; color: var(--pix-text-secondary); cursor: pointer; }` + `:hover` 复用 `--pix-bg-hover` / `--pix-text-primary`；`.shortcut-section-title { margin: 0; font-size: 11px; font-weight: 600; color: var(--pix-text-muted); }`；`.shortcut-row { display: flex; align-items: baseline; gap: 8px; }`；`.shortcut-key { flex: 0 0 auto; min-width: 88px; padding: 1px 6px; border: 1px solid var(--pix-border-light, #e3eaf0); border-radius: 4px; background: var(--pix-bg-code, #f4f6f9); color: var(--pix-text-secondary); font-family: var(--pix-font-mono, monospace); font-size: 11px; line-height: 1.4; white-space: nowrap; }`；`.shortcut-desc { color: var(--pix-text-secondary); }`；`.shortcut-note { margin: 0; padding-top: 4px; border-top: 1px solid var(--pix-border-light, #e3eaf0); color: var(--pix-text-muted); font-size: 11px; }` |
| 定位依赖（登记） | 浮层绝对 y = 阅读栏顶（`34 + 4 = 38`）+ `top: 40px` = **78**；`.center-pill` 盒（含 `.pane-pill` 的 `margin: 8px 10px 0` 与 `--pix-pane-pill-height: 28px`）为 y∈[46,74] ⇒ 与浮层**只剩 4px 余量**。本轮**不得**改 `.pane-pill` 的 `margin` / `height` / `--pix-pane-pill-height`（N96-5 判据 1 的 `.center-pill` 零相交依赖这 4px） |
| 与知识地图的关系（登记，修订 M3） | `.knowledge-map-slot` 是 `.reader-stage` 的左列（宽 = min(26% × stage 宽, 240px)，默认 ≈ 237）⇒ 地图打开时浮层矩形（x∈[阅读栏左 + 8, +328]）与该列相交。**本轮接受**「地图打开时浮层压住地图列顶部」：浮层是可选、可 Esc / 外点关闭的临时 overlay，地图开关是用户显式动作；`.knowledge-map-slot` **不**加入 N96-5 的零相交清单。替代口径（浮层改为相对 `.reader-stage` 且按地图列宽避开）连带改本节定位与 r17-1b 判据 ⇒ 登记为「须负责人改判、本轮不采用」（§7 开放问题 5） |
| 可聚焦控件计数（冻结） | 浮层内可聚焦控件**恰 2 个**：容器自身（`tabindex="-1"`，不参与 Tab 顺序）+ `.shortcut-close`；无焦点陷阱（Tab 可离开）；探测口径 = N99-3 的 `shortcutProbe().focusableCount`（选择器列表 `button, a[href], input, select, textarea, [tabindex]`） |
| 约束 | 不新增 `--pix-*` 变量；不加动画 / 不加过渡；不做背景遮罩（非模态）；浮层内无输入框、无开关、无「可配置」入口（反需求 §5.3）；不改 `.pane-pill` / `.center-pill` 既有几何（见上「定位依赖」行） |

### 0.5 开关与焦点契约（逐字冻结）

| 项 | 逐字值 |
| --- | --- |
| 打开（入口） | 点击 `.shortcut-toggle` ⇒ `toggle()`（已开则关闭） |
| 打开（键位） | `?`（`event.key === "?"`）；守卫与分支顺序逐字冻结见下行；命中时 `toggle()`（已开则关闭） |
| 分支顺序（逐字冻结，修订 M4/M6） | ① `if (event.key !== "?") return;` ② `if (event.ctrlKey \|\| event.altKey \|\| event.metaKey \|\| event.isComposing) return;`（`isComposing` 与 R15 的 IME 纪律同口径：组合态不触发） ③ `if (isEditableTarget(event.target)) return;`（**早退在 `preventDefault()` 之前**：该分支不得 `preventDefault`） ④ `event.preventDefault(); toggle();`。监听注册在 `window` 的 **bubble** 阶段（不加捕获） |
| `isEditableTarget` | 组件内**刻意重复**一份本地副本（与 `PdfViewer.vue:400-407` 谓词逐字同构：`isContentEditable \|\| tagName === "INPUT" \|\| tagName === "TEXTAREA" \|\| tagName === "SELECT"`）；理由 = 本轮 `PdfViewer.vue` 零改动、抽共享 util 属重构（另立轮次）——登记为**有意重复**，评审不得按「重复代码」判红 |
| 键位监听生命周期 | `onMounted` 注册 `window` 的 `keydown`（bubble 阶段；**不**使用捕获阶段）；`onBeforeUnmount` 注销；监听器**常驻**（组件随工作区存在），`?` 在浮层关闭时同样可用 |
| 关闭（Esc） | 浮层打开时，`Escape` ⇒ `close()`；**不** `stopPropagation`、**不** `preventDefault` ⇒ 阅读区既有 Esc 语义（框选退出 / 关闭搜索）不受影响（§0.0 第 3 条）；浮层关闭后同一次 Esc 已消费在阅读区侧属既有行为；浮层与文档搜索同开时，一次 Esc **同时**关闭两者（可判断言见 N96-3 判据 1 步 ⑤） |
| 关闭（点击外部） | 浮层打开时，`document` 的 `pointerdown` 监听：目标不在 `.shortcut-overview` 且不在 `.shortcut-toggle` 子树内 ⇒ `close()`；监听随 `open` 挂/卸（`watch(open)` + `onBeforeUnmount` 兜底） |
| 关闭（入口 / 关闭按钮） | 再次点击入口 ⇒ `close()`；点击 `.shortcut-close` ⇒ `close()` |
| 打开后焦点 | 打开瞬间记录 `lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null`；`nextTick` 后 `panelEl.focus()`（`tabindex="-1"`，不抢 Tab 顺序、不设焦点陷阱） |
| 关闭后焦点归还 | `close()` 时：若 `lastFocused?.isConnected` ⇒ `lastFocused.focus()`；否则 ⇒ `toggleEl?.focus()`（入口按钮）；**body 聚焦态的可判分支（修订 M6）**：打开前把焦点置于 `document.body`（前置步 = 对当前 `document.activeElement` 调 `blur()`，入口自检 `document.activeElement === document.body`），关闭后 `document.activeElement === document.body`（无论 `body.focus()` 是否生效，浮层 DOM 被 `v-if` 删除后活动焦点均回落 `body`）——N96-4 判据 1 的前置步按此冻结 |
| 关闭即清理 | 浮层用 `v-if`（真删除 DOM，非 `v-show`）：关闭后 `document.querySelector(".shortcut-overview") === null`；`aria-expanded === "false"`；无遗留监听（走查）；无任何持久化状态（无 `localStorage` / 无 `reader-state` 字段 / 无 IPC） |
| 不劫持 | 打开期间既有键位全部照常：`/`、`Ctrl+F`、`[`、`]`、PageUp/PageDown/←/→/Home/End、composer 的 Enter 发送（浮层内既有语义不被改写）；`?` 在输入框内不触发、不 preventDefault、不改写输入内容。**可判口径（修订 M6）**：在 `.input-area`（TEXTAREA）与 `.pdf-search-panel .search-input`（INPUT）上派发 `?` 时 `dispatchEvent` 返回 **true**（未 preventDefault）且浮层开关态不变（N96-3 判据 1）；`SELECT` / `contenteditable` 在 `pix/src/renderer` 内**无实例**（`grep` 实读）⇒ 该两分支只由 `isEditableTarget` 的逐字同构副本与本档走查保证 |

### 0.6 选区模板动作（逐字冻结）

| 项 | 逐字值 |
| --- | --- |
| DOM 顺序（`mode === "actions"`） | `问 AI`（既有，`mdi-comment-question-outline`）→ `解释`（新增，`mdi-lightbulb-on-outline`）→ `翻译`（新增，`mdi-translate`）→ `摘录`（既有，`mdi-notebook-plus-outline`，`v-if="canExcerpt"`） |
| 新按钮元素 | `<button type="button" class="quick-ask-btn" :disabled="pending" @click="onTemplateClick('explain')"><v-icon size="12">mdi-lightbulb-on-outline</v-icon> 解释</button>`（`翻译` 同构，图标 `mdi-translate`）；**不新增** `title`、不新增类名、不新增样式（复用 `.quick-ask-btn` 逐字） |
| 点击语义 | 先取 `const text = cachedText` → `hide()`（既有：点击即隐藏浮层，**`hide()` 会清空 `cachedText`**）→ `if (text) emitQuickAsk(text, action)`（`action ∈ {"explain","translate"}`）——与既有 `onButtonClick` `:148-152` **逐字同构**（**顺序不可颠倒**：按「先 `hide()` 后读 `cachedText`」实现会发射空串）；**不**调用 `notesStore`、**不**发送、**不**改选区、**不**改 `readerStore` |
| `onTemplateClick` 形状（逐字冻结，修订 M8） | 函数体恰好三行且次序写死（签名 `function onTemplateClick(action: TemplateAction): void`）：`const text = cachedText;` → `hide();` → `if (text) emitQuickAsk(text, action);`；`if (text)` 守卫兼作「发射文本非空」的可判依据（N97-3 判据 4 走查：`grep -n -A3 "function onTemplateClick"` 三行逐字对位） |
| 模板字面（冻结） | `EXPLAIN_TEMPLATE = "请解释选中的这段话在论文中的含义与作用："`；`TRANSLATE_TEMPLATE = "请把选中的这段话翻译成中文："`（两串均以全角冒号 `：` 结尾；与既有 `QUICK_ASK_TEMPLATE` 同风格） |
| 与既有模板的关系（登记） | 既有 `QUICK_ASK_TEMPLATE = "请解释选中的这段话："` 属 R8 冻结项，**本轮不得改字、不得改归属**；「问 AI」与「解释」的语义重叠（均属解释类问法）由负责人冻结的主线（「新增解释 / 翻译」而非改名既有动作）必然产生，本档按「新动作必须有可辨析的产物」处理：`解释` 使用更具体的模板 + 模板感知替换规则（§0.7），与「问 AI」的产物逐字不同；**不得**为消除重叠而改名 / 删除既有动作 |
| 三动作分支（登记） | `canExcerpt === false` 时 DOM 为 3 个动作（无 `摘录`）：`问 AI` / `解释` / `翻译`。夹具内选区恒可定位到页（`resolveSelectionPage` 含最近页兜底）⇒ 离屏只断言 4 动作形态；3 动作形态由 `canExcerpt` 既有门控保证（走查，不写不可达的离屏断言） |

### 0.7 seam 与草稿规则（逐字冻结）

| 项 | 逐字值 |
| --- | --- |
| 模板纯函数文件 | 新文件 `pix/src/renderer/utils/quick-ask-templates.ts`（零 import）：`export type TemplateAction = "explain" \| "translate";`、`EXPLAIN_TEMPLATE`、`TRANSLATE_TEMPLATE`、`export function templateForAction(action: TemplateAction): string`、`export function resolveTemplateDraft(current: string, template: string, replaceableTemplates: readonly string[]): string \| null` |
| `resolveTemplateDraft` 语义（冻结） | ① `current.trim() === ""` ⇒ 返回 `template`；② `replaceableTemplates.includes(current)`（**逐字**比较，含首尾空白差异即不匹配）⇒ 返回 `template`；③ 其余 ⇒ 返回 `null`（调用方一字不改） |
| seam 扩展（`useQuickAsk.ts`） | `export type QuickAskAction = "ask" \| "explain" \| "translate";`；`export type QuickAskHandler = (text: string, action: QuickAskAction) => void;`；`export function emitQuickAsk(text: string, action: QuickAskAction = "ask"): void { currentHandler?.(text, action); }`；`registerQuickAskConsumer` 签名不变 |
| 消费端（`ChatPanel.vue`） | `function onQuickAsk(text: string, action: QuickAskAction = "ask"): void`：`action === "ask"` ⇒ **既有两行逐字不变**（`if (!draft.value) draft.value = QUICK_ASK_TEMPLATE;` + `composerInput.value?.focus();` + `return;`）；否则 ⇒ `const next = resolveTemplateDraft(draft.value, templateForAction(action), QUICK_TEMPLATE_REPLACEABLE); if (next !== null) draft.value = next;` → `composerInput.value?.focus();`（**不发送**、**不弹提示**、**不写 notice**） |
| 可替换集合（冻结） | `const QUICK_TEMPLATE_REPLACEABLE: readonly string[] = [QUICK_ASK_TEMPLATE, EXPLAIN_TEMPLATE, TRANSLATE_TEMPLATE];`（**不含** `NOTES_ASK_TEMPLATE`：笔记追问模板的既有语义冻结，不参与替换）；`text` 参数仍不被使用（原文由「选中文本」chip 注入，与既有逐字一致） |
| 可替换集合的判定（走查，修订 M7） | `grep -c -F 'const QUICK_TEMPLATE_REPLACEABLE: readonly string[] = [QUICK_ASK_TEMPLATE, EXPLAIN_TEMPLATE, TRANSLATE_TEMPLATE];' pix/src/renderer/components/workspace/ChatPanel.vue` = **1**（声明必须写在这一行内、逐字相等）；集合内容不进 smoke 面（`smoke-view.mjs` 的编译面只含 `utils/*.ts`）⇒ 这是「笔记模板不参与替换」唯一可判的口径（N97-2 判据 5） |
| 空白差异（评审建议，已采纳） | `resolveTemplateDraft(" " + EXPLAIN_TEMPLATE, TRANSLATE_TEMPLATE, known) === null`：把「逐字比较（含首尾空白差异即不匹配）」的后半句钉住（smoke `template-draft` 第 11 条） |
| 规则动机（登记） | 备选「只在草稿为空时填入」（与既有 `onQuickAsk` 一致）未采用：用户在「解释」后想改「翻译」时必须手动全清草稿，违背 R17「一步可达」；本规则只替换**机器生成的模板**，用户手写内容一字不改（r17-2 的 `custom-draft-kept` 相位断言逐字相等）。若负责人改判，需同时改本节、N97-2 与 `template-draft` 烟测组的 7 条断言 |

### 0.8 四动作几何与不溢出（逐字冻结）

| 项 | 逐字值 |
| --- | --- |
| 盒模型 | `.quick-ask` 的既有盒模型逐字不变（`display: inline-flex; gap: 2px; padding: 2px 4px; border-radius: 999px;`）⇒ 4 个按钮天然同一行（`inline-flex` 默认 `flex-wrap: nowrap`）；**不新增** wrap / 换行 / 缩放规则；`.quick-ask-btn` 逐字不变 |
| 定位 | `showFor` 的 clamp 逐字不变（`STAGE_PADDING = 4` / `BUTTON_GAP = 6`）：浮层**在构造上**被钳制在 `.reader-stage` 视口内（`left ∈ [stageLeft + 4, stageRight - width - 4]`，`top ∈ [stageTop + 4, stageBottom - height - 4]`） |
| 几何判据（r17-2b 断言） | ① 浮层矩形 ⊆ `.reader-stage` 矩形（含 `STAGE_PADDING = 4` 内缩）；② `scrollWidth - clientWidth <= 1`（不横向溢出）；③ 4 个按钮矩形按 DOM 顺序从左到右、两两不相交、每个按钮 `clientWidth > 0`（不塌陷）；④ 浮层与 `.composer-box` 零相交；⑤ 浮层与 `.reader-section` / `.pdf-page-indicator` 零相交（夹具内选区在页顶，浮层悬于选区上方） |
| 环境覆盖（冻结） | 默认宽度、窄栏（`--pix-right-width` 380 → 560）、窄栏 + 200% 缩放（页宽 1190 溢出容器、选区右缘 ≈ 1189 > stage 右缘 ≈ 1019 ⇒ 触发既有右缘钳制分支）三相位；末相位结束前缩放回 100% 并复位变量 |
| 不可达分支（登记） | 默认宽度与窄栏（100%）下选区右缘距 stage 右缘 ≥ 160px，clamp 的上界分支不触发 ⇒ 前两相位只断言「浮层 ⊆ stage + 不横向溢出」；钳制分支的**生效断言**只落在缩放相位（`float.right == stage.right - 4`） |

### 0.9 配额、SEL 增量与既有断言更新登记

1. **离屏新增配额（冻结）**：`r17-*` 场景 **4** 个 / record label **4** 组 / record **11** 条 / 截图 **7** 张：
   - `r17-1`（组 `r17-shortcut-overview`）：3 条 record（`open-by-click` / `key-toggle-and-typing-guard` / `close-paths-and-focus-return`），2 张截图（`r17-1-shortcut-overview.png`、`r17-1b-shortcut-overview-entry.png`）；
   - `r17-1b`（组 `r17-shortcut-geometry`）：2 条 record（`default` / `narrow`），1 张截图（`r17-1c-shortcut-overview-narrow.png`）；
   - `r17-2`（组 `r17-template-actions`）：3 条 record（`explain` / `translate-replace` / `custom-draft-kept`），3 张截图（`r17-2-quick-ask-four-actions.png`、`r17-2b-template-explain-draft.png`、`r17-2c-template-translate-draft.png`）；
   - `r17-2b`（组 `r17-template-geometry`）：3 条 record（`four-buttons-default` / `four-buttons-narrow` / `four-buttons-zoom-clamp`），1 张截图（`r17-2d-quick-ask-four-buttons-zoom.png`）。
   合计：4 场景 / 4 组 / 11 条 record / **7** 张截图（r17-1 2 + r17-1b 1 + r17-2 3 + r17-2b 1）。
2. **验收目标的产物读数（冻结）**：`MANIFEST.json.shots.length = 173`（166 + 7）、`failure === null`、目录内 png = 173；`MEASUREMENTS.json` 长度 = **248**（237 + 11）、`label` 去重 = **68**（64 + 4）。
3. **`SEL` 增量（冻结，+6 ⇒ 70 项）**：`shortcutToggle: ".shortcut-toggle"`、`shortcutOverview: ".shortcut-overview"`、`shortcutRow: ".shortcut-row"`、`shortcutKey: ".shortcut-key"`、`shortcutNote: ".shortcut-note"`、`composerBox: ".composer-box"`；既有 64 项**零改写/零删除**。浮层按钮沿用既有写法（`document.querySelectorAll(".quick-ask-btn")` 字面量，不新增 SEL 项）；PDF 搜索输入框沿用字面量 `.pdf-search-panel .search-input`（N96-3 判据 1）。
4. **既有断言更新（唯一一处，逐字登记）**：`ui-shot.mjs` 的三处 `btnCount === 2` ⇒ 改为 `btnCount === 4`：`:5518`（`ensureQuickAskExcerptReady`）、`:6987`（相位 4 到期回落）、`:7059`（相位 5b 不同文本回落）。原因 = 本轮在 `.quick-ask` 新增两个动作；`canExcerpt` 门控与夹具选区不变 ⇒ 4 个动作。**其余既有场景 / 断言 / 截图名 / label 零改写零删除**；**像素会变但无像素比对断言的既有截图（共 5 张，登记）**：`r11-3-excerpt-feedback-visible.png`（`:6810`）/ `r11-3b-feedback-after-spurious-selectionchange.png`（`:6920`）——`.quick-ask` 变宽使像素变化；`06c-excerpt-entry-zoom.png`（`:1402`）/ `07b-excerpt-feedback-zoom.png`（`:1457`）/ `07c-excerpt-duplicate-zoom.png`（`:1487`）——三张以 `rectOf(SEL.quickAsk, 30)`（`:1401` / `:1456` / `:1486`）裁切 ⇒ 裁切矩形随浮层宽度变化。仓内无 `pixelmatch` / 图像 diff ⇒ 均不判红，由开发档在目视比对中登记。
5. **烟测配额（冻结）**：`smoke-view.mjs` 7 组 51 条 → **9 组 74 条**（新增 `shortcut-table` 12 条 + `template-draft` 11 条）；`smoke-notes.mjs` 10 组 65 条**零改动**；`pix/package.json` 零改动（`smoke:view` 已存在）。
6. **新增 helper（冻结名，共 5 个）**：`shortcutProbe()`（字段含 `focusableCount`，见 §0.4）、`quickAskActionsProbe()`、`layoutVar(name, value | null)`、`intersects(a, b)`、`pressKeyOnReturning(selector, key)`（返回 `el.dispatchEvent(new KeyboardEvent("keydown", …))` 的布尔值，用于判定「未 preventDefault」；既有的 `pressKeyOn` 零改写）。`grep -c` 实读：上述 5 个名字在 `ui-shot.mjs` 内当前均 0 命中。

---

## 1. N96 快捷键总览浮层（6 子条）

### N96-1 入口（鼠标可发现）

**用户可见行为**：工作区中间栏左上角 pill 内始终有一个键盘图标小按钮（不依赖是否打开文档）；悬停出现提示 `快捷键总览（?）`；点击打开浮层，再点关闭。

**逐字冻结**：§0.4 的「入口元素 / title / aria-label / 挂载方式 / 样式」全部逐字；`.shortcut-toggle` 只追加、不插入。

**验收判据**
1. 【走查】`grep -c "shortcut-toggle" pix/src/renderer/components/workspace/ShortcutOverview.vue` ≥ 1；`grep -c "快捷键总览（?）"` ≥ 1（title 字面）；`grep -n "ShortcutOverview" pix/src/renderer/components/workspace/ReaderPanel.vue` 命中 ≥ 2（import 1 + 模板标签 1）。
2. 【离屏】`r17-1` 相位 `open-by-click`：`.center-pill` 内 `.shortcut-toggle` 存在，`title` / `aria-label` 逐字相等，`aria-expanded === "false"`；点击后 `aria-expanded === "true"`、`.shortcut-overview` 在 DOM；再点击后回 `"false"` 且浮层离开 DOM。截图 `r17-1b-shortcut-overview-entry.png`（裁 `.center-pill`）。

**白名单**：第 3 条（新组件）、第 7 条（挂载点）。

### N96-2 浮层与键位表（逐字）

**用户可见行为**：打开后出现一块 320px 宽的白底浮层，标题 `快捷键总览`，其下按 3 组列出 18 行「键位 + 说明」，末尾一行说明选区浮层动作（含「摘录」）；浮层内只有右上角一个关闭按钮可聚焦（容器自身 `tabindex="-1"` 不参与 Tab 顺序）。

**逐字冻结**：§0.3 的 3 组 / 18 行 / `SHORTCUT_KEY_JOIN` / `SHORTCUT_NOTE`；§0.4 的类名、结构顺序与「可聚焦控件计数」行。

**验收判据**
1. 【烟测-渲染】`shortcut-table` 组（12 条，见 N99-2）逐字断言 18 行与 3 组标题。
2. 【离屏】`r17-1` 相位 `open-by-click`：读 DOM 得 `.shortcut-section-title` 文本数组 = `["阅读区（打开文档后）", "输入框", "工作区"]`、`.shortcut-row` 数 = 18、每行 `{ key: .shortcut-key 文本, desc: .shortcut-desc 文本 }` 与 §0.3 表逐字相等、`.shortcut-note` 文本 = `SHORTCUT_NOTE` 逐字。
3. 【走查】`grep -c "keys.join(SHORTCUT_KEY_JOIN)\|SHORTCUT_SECTIONS" pix/src/renderer/components/workspace/ShortcutOverview.vue` ≥ 2；组件内 `grep -c "上一页\|下一节\|发送消息"` = 0（无手写键位文案）。

**白名单**：第 1 条（纯数据）、第 3 条（渲染）。

### N96-3 打开与关闭（键位 + Esc + 点击外部 + 入口）

**用户可见行为**：`?` 打开 / 关闭；Esc 关闭；点击浮层外部关闭；点击关闭按钮关闭；再次点击入口关闭。关闭后没有任何残留（见 N96-6）。

**逐字冻结**：§0.5 的打开 / 关闭四条路径与守卫；`v-if` 真删除。

**验收判据**
1. 【离屏】`r17-1` 相位 `key-toggle-and-typing-guard`（修订 M6：补 INPUT 分支、`preventDefault` 判据与 Esc 双响应）：① 前置 `setDraft("草稿守卫")` + 聚焦 `.input-area`（TEXTAREA）→ `pressKeyOnReturning(".input-area", "?")` ⇒ 返回 **true**（未 preventDefault）、浮层**不**出现、`.input-area` 的 `value` 逐字 = `"草稿守卫"`（非空草稿使「不变」不再是空断言）；② 对 `.input-area` 调 `blur()`（焦点离开输入框，自检 `document.activeElement === document.body`）后 `pressReaderKey("?")` ⇒ 出现；③ 再 `pressReaderKey("?")` ⇒ 关闭（toggle）；④ 再打开后 `pressReaderKey("/")` ⇒ `.pdf-search-panel` 出现（既有键位未被劫持），且 `openSearch()` 会把焦点交给 `.pdf-search-panel .search-input`（`PdfViewer.vue:410-413`）⇒ 在该元素上 `pressKeyOnReturning(".pdf-search-panel .search-input", "?")` ⇒ 返回 **true**、浮层**仍打开**（INPUT 分支不 toggle、不 preventDefault）；⑤ 收尾在该输入框上派发 `Escape` ⇒ `.pdf-search-panel` **与** `.shortcut-overview` 同时离开 DOM（§0.0 第 3 条的同一次 Esc 双响应，登记为既定行为）。
2. 【离屏】`r17-1` 相位 `close-paths-and-focus-return`：`pressKeyOn(SEL.shortcutOverview, "Escape")` ⇒ 关闭；再打开后 `document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))` ⇒ 关闭；再打开后点 `.shortcut-close` ⇒ 关闭；每条路径都断言 `document.querySelector(SEL.shortcutOverview) === null`、`.shortcut-row` 计数 = 0 与 `aria-expanded === "false"`。
3. 【走查】捕获阶段未被使用：组件内 `grep -c "addEventListener(\"keydown\", .*, true)"` = 0；`grep -c "stopPropagation" pix/src/renderer/components/workspace/ShortcutOverview.vue` = 0（§0.0 第 3 条）。
4. 【走查】分支顺序（修订 M6）：`grep -n -A4 'event.key !== "?"' pix/src/renderer/components/workspace/ShortcutOverview.vue` 的命中片段中，`isEditableTarget` 的 `return` 必须在 `preventDefault()` **之前**（§0.5「分支顺序」行的冻结次序），且 `isComposing` 早退存在（`grep -c "isComposing"` = 1）。

**白名单**：第 3 条。

### N96-4 焦点管理

**用户可见行为**：打开后键盘焦点进入浮层（Esc 立即可用）；关闭后焦点回到打开前的元素（通常就是入口按钮）。

**逐字冻结**：§0.5 的「打开后焦点」「关闭后焦点归还」。

**验收判据**
1. 【离屏】`r17-1` 相位 `close-paths-and-focus-return`：打开后 `document.activeElement === .shortcut-overview`；用入口按钮打开并 Esc 关闭后 `document.activeElement === .shortcut-toggle`；**body 分支的前置步（修订 M6）**：先对当前 `document.activeElement` 调 `blur()` 并自检 `document.activeElement === document.body`，再用 `?` 打开并关闭 ⇒ `document.activeElement === document.body`（合成 `?` 不改焦点 ⇒ 无此前置步时 `lastFocused` 是上一相位遗留的焦点元素（如 `.input-area` 或搜索框）⇒ 原断言不可满足）。
2. 【走查】组件内 `grep -c "tabindex=\"-1\""` = 1；`grep -c "\.focus()"` ≥ 2（打开 1 处 + 归还 1–2 处）；`grep -ci "focusin\|focusout\|trap"` = 0（无焦点陷阱）。
3. 【离屏】`r17-1` 相位 `open-by-click`（修订 M6）：`shortcutProbe().focusableCount === 2`（选择器列表 `button, a[href], input, select, textarea, [tabindex]` 在浮层内命中 = 容器自身 `tabindex="-1"` + `.shortcut-close`）；浮层内**无其他**可聚焦控件（`=== 2` 为双向约束）。

**白名单**：第 3 条。

### N96-5 不遮挡与窄栏

**用户可见行为**：浮层出现在中间栏左上、pill 之下；不压住对话输入框、不压住阅读区的工具条 / 页码指示器 / 章节 chip / 框选 FAB；窄栏下同样成立；打开与关闭不改变阅读区几何与滚动位置。

**逐字冻结**：§0.4 的定位与尺寸、§0.4「定位依赖」行（pill 盒 y∈[46,74] 与浮层只剩 4px 余量）、§0.4「与知识地图的关系」行（修订 M3）；`.layout-center` 的 `z-index: 1` 与浮层 `z-index: 7`（浮层在阅读区内部件之上；对话栏在另一栏，不构成遮挡）。

**验收判据**
1. 【离屏】`r17-1b` 相位 `default`：**入口步断言 `.knowledge-map-slot` 不在 DOM**（地图关闭态取值，修订 M3；`showMap = mapOpen && isPdf && mapFits`，`mapOpen` 默认 `false` ⇒ 未点 `.map-toggle` 即成立）；浮层矩形 ⊆ `.reader-panel` 矩形；与 `.composer-box`、`.pdf-toolbar`、`.pdf-page-indicator`、`.reader-section`、`.pdf-capture-fab`、`.center-pill` 全部零相交（`rect` 相交判定，任一处相交即判红）；打开前 / 关闭后 `.pdf-scroll.scrollTop` 与 `.pdf-page[data-page="1"]` 矩形逐字不变（零侵扰）。
2. 【离屏】`r17-1b` 相位 `narrow`：`setProperty("--pix-right-width", "560px")` + `repaint(win)` 后重复判据 1（含 `.knowledge-map-slot` 不在 DOM 与零相交仍成立），截图 `r17-1c-shortcut-overview-narrow.png`；随后 `removeProperty("--pix-right-width")` + `repaint(win)`，断言 `.layout-right` 宽度回到 **380 ± 2**。
3. 【走查】`.shortcut-overview` 不设 `position: fixed`；组件内 `grep -c "overflow: hidden"` = 0（浮层自身只用 `max-height` + `overflow-y: auto`）。

**白名单**：第 3 条、第 9 条（判据的测量代码）。

### N96-6 关闭后零残留

**用户可见行为**：关闭后浮层完全消失，界面与本轮改动前一致；不留下任何「已看过 / 已展开」痕迹。

**逐字冻结**：§0.5 的「关闭即清理」。

**验收判据**
1. 【离屏】`r17-1` 相位 `close-paths-and-focus-return`：关闭后 `.shortcut-overview` 不在 DOM、`.shortcut-row` 计数 = 0、`aria-expanded === "false"`；打开→关闭全程 `notesAddCalls` / `readerStateSaveCalls` / `sendCalls` 增量均为 0。
2. 【走查】组件内 `grep -ci "localstorage\|sessionstorage"` = 0；`grep -rn "shortcut" pix/src/renderer/stores pix/src/main pix/src/shared` = 0（无状态落点、无新 IPC）。
3. 【走查】`onBeforeUnmount` 内注销 `keydown`：`grep -c -F 'window.addEventListener("keydown"'` = 1、`grep -c -F 'window.removeEventListener("keydown"'` = 1（同一具名 handler 引用；注册 / 注销配对）。**修订 M2（证据链更正）**：原「由 `r15-f16` 既有场景回归覆盖」的表述**删除**——`ui-shot.mjs:9202-9245` 的 r15-f16 只统计 `window.__pixStub.agentEventListenerCount()`（stub 侧 agent 事件订阅数），与 DOM 的 `window.addEventListener("keydown")` 无关；DOM 监听泄漏在离屏**无可观测面**（页面上下文读不到监听器注册表，且卸载后的死监听器不产生可见效果）⇒ 本项只由上述走查判定，限制登记在 N99-4 判据 3。

**白名单**：第 3 条、第 9 条。

---

## 2. N97 选区模板动作（4 子条）

### N97-1 两个动作（文案与图标逐字）

**用户可见行为**：选中一段文字后浮层出现 4 个动作：`问 AI` / `解释` / `翻译` / `摘录`（无页码可定位时为 3 个）；解释与翻译在既有两动作之间，样式与既有按钮完全一致。

**逐字冻结**：§0.6 的 DOM 顺序、按钮元素、图标、无 title。

**验收判据**
1. 【离屏】`r17-2` 相位 `explain`：选中页 1 首个 span（`selectPageSpan(1)`）后，浮层 4 个 `.quick-ask-btn` 的文本数组逐字 = `["问 AI", "解释", "翻译", "摘录"]`；各按钮内图标按既有断言范式（`ui-shot.mjs:5734` 的 `.v-icon.mdi-close` 写法）逐字为 `.v-icon.mdi-comment-question-outline` / `.v-icon.mdi-lightbulb-on-outline` / `.v-icon.mdi-translate` / `.v-icon.mdi-notebook-plus-outline`（四者各命中恰 1）；`btnCount === 4`。
2. 【走查】`grep -c "mdi-lightbulb-on-outline\|mdi-translate" pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` = 2；既有两按钮的模板片段（「问 AI」`:205-208`、「摘录」`:209-218`）除插入点外零改写（`git diff -U0` 判定：`问 AI` 与 `摘录` 两行不作为 `-` 行出现）。

**白名单**：第 4 条。

### N97-2 草稿填入规则

**用户可见行为**：点「解释」⇒ composer 草稿出现 `请解释选中的这段话在论文中的含义与作用：` 且输入框获得焦点（**不发送**）；点「翻译」⇒ 草稿为 `请把选中的这段话翻译成中文：`；草稿非空且不是既有快捷模板时，点任一模板动作都**一字不改**（只聚焦）；草稿是快捷模板之一时被替换（`解释 ↔ 翻译 ↔ 问 AI 的模板` 之间可来回切换）。

**逐字冻结**：§0.7 的 `resolveTemplateDraft` 三分支、`QUICK_TEMPLATE_REPLACEABLE` 三项、消费端分支结构、`action === "ask"` 的既有两行逐字不变。

**验收判据**
1. 【烟测-渲染】`template-draft` 组（11 条，见 N99-2）：空 / 纯空白 / 模板替换 / 既有模板可替换 / 自定义草稿返回 `null` / `NOTES_ASK_TEMPLATE` 不在替换集合内返回 `null` / **首尾空白差异（`" " + EXPLAIN_TEMPLATE`）返回 `null`** / 两个模板字面逐字 / 两模板互不相同且不等于既有模板。
2. 【离屏】`r17-2` 相位 `explain`：点「解释」后 `.input-area` 的 `value` 逐字 = `EXPLAIN_TEMPLATE`、`document.activeElement === .input-area`、浮层隐藏（`display === "none"`）。
3. 【离屏】`r17-2` 相位 `translate-replace`：草稿为 `EXPLAIN_TEMPLATE` 时重新选区 → 点「翻译」⇒ `value` 逐字 = `TRANSLATE_TEMPLATE`；随后用 `setDraft("")` 清空（模拟用户清除）→ 再选区 → 点「翻译」⇒ 仍为 `TRANSLATE_TEMPLATE`（空草稿填入分支）。
4. 【离屏】`r17-2` 相位 `custom-draft-kept`：`setDraft("我的问题：请给出结论")` → 重新选区 → 点「解释」⇒ `value` 逐字不变、输入框聚焦；`setDraft(NOTES_ASK_TEMPLATE)` → 点「翻译」⇒ `value` 逐字不变（笔记模板不参与替换）。
5. 【走查】`QUICK_TEMPLATE_REPLACEABLE` 的**内容**（修订 M7；集合内容不进 smoke 面 —— `smoke-view.mjs` 的编译面只含 `utils/*.ts`）：`grep -c -F 'const QUICK_TEMPLATE_REPLACEABLE: readonly string[] = [QUICK_ASK_TEMPLATE, EXPLAIN_TEMPLATE, TRANSLATE_TEMPLATE];' pix/src/renderer/components/workspace/ChatPanel.vue` = **1**（声明必须写在这一行内、逐字；出现 `NOTES_ASK_TEMPLATE` 即判红）；`grep -c "QUICK_TEMPLATE_REPLACEABLE"` = 2（定义 1 + 使用 1）；`QUICK_ASK_TEMPLATE` / `NOTES_ASK_TEMPLATE` 两行 `git diff -U0` 不作为 `-` 行出现。

**白名单**：第 2 条（纯函数）、第 4 条（发射）、第 5 条（seam）、第 6 条（消费）。

### N97-3 选区、chips 与载荷不变（不发送）

**用户可见行为**：点模板动作后选区仍在、原文照旧随「选中文本」chip 注入；消息不会被自动发出；浮层的隐藏 / 反馈等既有行为完全不变。

**逐字冻结**：§0.6 的点击语义；`.quick-ask` 既有 `hide()` / 反馈态零改动；`ChatPanel.send()` 与 `reading-context.ts` 零 diff。

**验收判据**
1. 【离屏】`r17-2` 三个相位：每次点击后 `clearSendCalls()` 基线到读数的 `sendCalls().count` 增量 = 0、`.chat-messages .message-block` 计数不变（无乐观用户块）；`document.getSelection().toString()` 与点击前逐字相等、`collapsed === false`；`chipSnapshot()` 的 `count` / `labels` / `notesLabel` 与点击前逐字相等。
2. 【走查】`git diff --stat -- pix/src/renderer/utils/reading-context.ts` 为空；`ChatPanel.vue` 的 `function send(` 函数体不出现 `-` 行（`git diff -U0` 判定）。
3. 【离屏】`r17-2` 相位 `explain`（**修订 M1：原 `btnCount === 0` 与 `v-show` 自相矛盾、不可满足**）：点「解释」后 `quickAskStateProbe()` 的 `display === "none"`（既有 `hide()` 置 `visible=false`）且 `btnCount === **3**`——`hide()` 同时把 `selectionPage` 置 `null`（`:92-102`）⇒ `canExcerpt === false`（`:42`）⇒ 「摘录」按钮从 DOM 掉落，而 `.quick-ask` 由 `v-show`（`:198`）留在 DOM ⇒ 探针按 DOM 计数（`ui-shot.mjs:5467`）读到 `问 AI / 解释 / 翻译` 三个。语义仍锁「既有 `hide()` 未被新增分支破坏」（读数需在 `nextTick` 后取，即既有 `await sleep` 间隔）。
4. 【走查】`onTemplateClick` 的发射顺序与形状（**修订 M8**）：`grep -n -A3 "function onTemplateClick" pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` 的输出必须逐字包含 `const text = cachedText;` → `hide();` → `if (text) emitQuickAsk(text, action);` 三行且次序一致（§0.6 冻结形状）；`if (text)` 守卫同时保证「发射文本非空」（`hide()` 会清 `cachedText`，顺序颠倒则发射空串）。

**白名单**：第 4 条、第 5 条、第 6 条。

### N97-4 键盘可达与四动作几何

**用户可见行为**：四个动作都是原生按钮（Tab 可达、Enter / Space 激活）；4 个按钮排在同一行且不会被裁切；窄栏与放大后依然不溢出。

**逐字冻结**：§0.8 全部；`.quick-ask-btn` 的既有样式与 `:disabled` 语义不变。

**验收判据**
1. 【离屏】`r17-2` 相位 `explain`：4 个 `.quick-ask-btn` 的 `tagName === "BUTTON"`、`disabled === false`、`tabIndex >= 0`；对 `解释` 按钮 `focus()` 后 `document.activeElement === 该按钮`（可聚焦）。**不写**「合成 `Enter` 触发点击」的断言：合成 `KeyboardEvent` 不触发原生按钮的默认动作（与 `r15-ime` 的既有做法不同——那里测的是组件自己的 keydown 监听）；Enter / Space 激活属原生元素语义，按【走查】判定（`<button>` 而非 `<div>` / `<span>`）。
2. 【离屏】`r17-2b` 相位 `four-buttons-default`：① 浮层矩形 ⊆ `.reader-stage` 矩形（含 `STAGE_PADDING` 内缩）；② `scrollWidth - clientWidth <= 1`；③ 4 个按钮矩形按 DOM 顺序递增、两两不相交、`clientWidth > 0`；④ 与 `.composer-box` / `.reader-section` / `.pdf-page-indicator` 零相交。
3. 【离屏】`r17-2b` 相位 `four-buttons-narrow`（`--pix-right-width: 560px`）：重复判据 2 的四条，按钮文案逐字不变；结束前 `removeProperty` 并在末相位断言恢复。
4. 【离屏】`r17-2b` 相位 `four-buttons-zoom-clamp`：`--pix-right-width: 560px` + 点「放大」至 **200%**（`.zoom-label` 逐字 `200%`；`--pix-right-width: 560px` ⇒ `.reader-stage` 右缘 ≈ 1019，页宽 595 × 2 = 1190 溢出容器 ⇒ 页左缘进入滚动内容左端，页 1 首个 span 右缘 ≈ `303 + 443 × 2 = 1189` > 1019 ⇒ 右缘钳制分支必然触发）+ `.pdf-scroll.scrollLeft = 0` → 重新选区 → 断言 `Math.abs(float.right - (stage.right - 4)) <= 1.5`（钳制生效）、浮层 ⊆ stage、4 按钮仍单行不溢出；截图 `r17-2d-quick-ask-four-buttons-zoom.png`；收尾点「缩小」10 次回 100%（`.zoom-label` 逐字 `100%`）并 `removeProperty` 恢复变量。（几何为**推算**：`--pix-right-width` / padding / gap 取自事实表的布局读数，页 1 首个 span 的 `dx = 56` / `w = 387` 取自 R16 基线测量；实际读数以 r17-2b 落下的 `stage` / `float` 矩形为准。）

**白名单**：第 4 条、第 9 条。

---

## 3. N98 可发现性（2 子条）

### N98-1 入口的 title / aria 逐字与可见条件

**用户可见行为**：只要在工作区（不要求打开 PDF），就能看到入口按钮；提示文字里写明实际键位 `?`。

**逐字冻结**：§0.4 的 `title` / `aria-label` / 就绪判定。

**验收判据**
1. 【离屏】`r17-1` 相位 `open-by-click` 的两步：① **未打开任何文档**时（进入工作区后的第一步）断言入口存在且 `title === "快捷键总览（?）"`、`aria-label === "快捷键总览"`；② 打开 `sample-paper.pdf` 后再次断言两者逐字相等（入口不依赖 `pageCount > 0`）。
2. 【走查】就绪判定与 `.map-toggle` 同范式：`grep -n "mapToggleReady\|pillReady" pix/src/renderer/components/workspace/ReaderPanel.vue pix/src/renderer/components/workspace/ShortcutOverview.vue` 各 ≥ 1；`grep -c "reader-header" pix/src/renderer/components/workspace/ShortcutOverview.vue` = 0（不把入口放进被隐藏的标题栏）。
3. 【走查】入口的就绪判定与文档无关：组件内 `grep -c "pageCount\|readerStore"` = 0（不读取阅读器状态）。

**白名单**：第 3 条、第 7 条。

### N98-2 不打扰（无提示条 / 无首次弹窗 / 无持久化）

**用户可见行为**：界面上不新增任何常驻提示条；首次使用不弹窗；浮层永不自动打开。

**逐字冻结**：§0.5 的「关闭即清理」；本轮不新增任何 `localStorage` / 资产字段 / IPC。

**验收判据**
1. 【离屏】`r17-1` 相位 `open-by-click` 进入工作区后的第一帧快照（**修订 M6：改为可判形式**）：`.shortcut-overview` / `.shortcut-row` / `.shortcut-key` / `.shortcut-note` 计数**全为 0**（无自动打开）、`aria-expanded === "false"`、`SEL.shortcutToggle` 计数**恰 1**（唯一新增常驻入口；`.shortcut-note` 只在浮层内部 ⇒ 关闭态必为 0）。
2. 【走查】`grep -rin "shortcut" pix/src/renderer --include=*.ts --include=*.vue` 的命中行中 `grep -ci "localstorage\|sessionstorage"` = 0（无持久化）；`grep -rn "shortcut" pix/src/main pix/src/shared` = 0；`pix/src/shared/types.ts` 与 `pix/src/main/**` 的 `git diff --stat` 为空。
3. 【走查】组件内不存在首次运行分支：`grep -ci "first\|seen\|dismiss" pix/src/renderer/components/workspace/ShortcutOverview.vue` = 0。

**白名单**：第 3 条。

---

## 4. N99 验证面（4 子条）

### N99-1 工程门与烟测回归

**验收判据**
1. 【check】`cd pix && npm run check` ⇒ 0 error（写档时基线 `CHECK_EXIT=0`；本步修订后再跑一次仍 `CHECK_EXIT=0`）。
2. 【烟测-渲染】`smoke-view.mjs` 末尾逐字 `通过 74 / 失败 0`（9 组）；既有 7 组 51 条的断言文本零改写（`git diff -U0` 判定：`smoke-view.mjs` 内既有 `check(` 行不作为 `-` 行出现）。
3. 【烟测-主进程】`smoke-notes.mjs` 文件零 diff、末尾逐字 `通过 65 / 失败 0`（10 组）。
4. 【离屏】退出码 0 + `MANIFEST.json.failure === null` + 166 张既有截图零缺失 + 237 条既有测量零缺失 + §0.9 的读数目标达成。

**白名单**：第 8 条、第 9 条。

### N99-2 烟测-渲染新增两组（`shortcut-table` 12 条 / `template-draft` 11 条）

**`shortcut-table`（12 条，期望值手写、不由被测数据生成）**
1. `SHORTCUT_SECTIONS.length === 3`；2. 三个组标题逐字（§0.3：`阅读区（打开文档后）` / `输入框` / `工作区`）；3. 总行数 `=== 18`；
4. 第 1 组 9 行的 `{keys, desc}` 深等手写期望；5. 第 2 组 8 行深等（含新增的「提交重命名（对话名称输入框）」行）；6. 第 3 组 1 行深等；
7. 全表 `keys` 元素全为非空字符串、无重复 `(keys.join(" / ") + desc)` 组合；
8. `SHORTCUT_KEY_JOIN === " / "`；9. `SHORTCUT_NOTE` 逐字且包含 `摘录`；
10. 表内不出现 `ArrowUp` / `ArrowDown`（`JSON.stringify(SHORTCUT_SECTIONS)` 不含该子串）；
11. 表内不出现 `Shift+` 之外的修饰键组合（如 `Ctrl+Shift` / `Alt+`）——只允许 `Ctrl+F` 与 `Shift+Enter`；
12. 每组 `rows.length > 0`、`title` 非空（防空断言防护）。

**`template-draft`（11 条）**
1. `EXPLAIN_TEMPLATE` 逐字；2. `TRANSLATE_TEMPLATE` 逐字；3. `templateForAction("explain")` / `("translate")` 分别等于两模板；
4. `resolveTemplateDraft("", EXPLAIN, [QUICK, EXPLAIN, TRANSLATE]) === EXPLAIN`；
5. `resolveTemplateDraft("   ", TRANSLATE, known) === TRANSLATE`（纯空白按空处理）；
6. `resolveTemplateDraft(QUICK, EXPLAIN, known) === EXPLAIN`（既有模板可被替换）；
7. `resolveTemplateDraft(EXPLAIN, TRANSLATE, known) === TRANSLATE`（模板互替）；
8. `resolveTemplateDraft("我的问题", EXPLAIN, known) === null`（自定义草稿一字不改）；
9. `resolveTemplateDraft(NOTES_ASK, EXPLAIN, known) === null`（不在替换集合内）；
10. 两模板互不相等、且都不等于 `QUICK_ASK_TEMPLATE`（`"请解释选中的这段话："`，期望值手写）；
11. `resolveTemplateDraft(" " + EXPLAIN, TRANSLATE, known) === null`（首尾空白差异即不匹配 —— 把 §0.7 的「逐字比较」后半句钉住；评审建议已采纳）。

**编译面同步（冻结）**：`compileAndLoad()` 的 `files` 追加 `renderer/utils/shortcut-help.ts` 与 `renderer/utils/quick-ask-templates.ts`；`required` 追加对应相对路径；`allowed` 由 `new Set([...required, "shared/types.js"])` 推导（若被测文件产生额外的 emit 产物，必须登记进 `allowed` 且给出理由）。模块句柄：`shortcutHelp` / `quickAskTemplates`。

**白名单**：第 1 条、第 2 条、第 8 条。

### N99-3 离屏场景与配额（`r17-1` / `r17-1b` / `r17-2` / `r17-2b`）

**追加位置（冻结）**：`runReaderStateScenarios` 末尾（`r16-5` 的最后一条 record 之后、`:10234` 的 `restoreStandardSeed()` 与 `:10235` 收口 `}` 之前）；每场景以自己的状态复位收尾（`restoreStandardSeed()` / `removeProperty` / 缩放回 100%）。

**新增 helper（冻结名，共 5 个）**：`shortcutProbe()`（一次 js 读：入口 `{inDom, title, ariaLabel, ariaExpanded, rect}`、浮层 `{inDom, rect, sectionTitles[], rows[{key, desc}], noteText, closeCount, activeInsidePanel, scrollOverflow, focusableCount}`）、`quickAskActionsProbe()`（`{display, rect, buttons: [{text, icon, rect, disabled}], scrollOverflow, btnCount}`）、`layoutVar(name, value \| null)`（`setProperty` / `removeProperty` + `repaint(win)`）、`intersects(a, b)`（Node 侧矩形相交判定）、`pressKeyOnReturning(selector, key)`（返回 `dispatchEvent` 布尔值；`pressKeyOn` 零改写）。

**场景与断言要点（逐相位）**

| 场景 / 相位 | 步骤 | 断言（判红项） | 截图 |
| --- | --- | --- | --- |
| `r17-1` / `open-by-click` | 进入工作区（**未打开文档**）→ 读入口 → 打开 `sample-paper.pdf` → 再读入口 → 点击入口 | 入口 `title` / `aria-label` 逐字（两次）、`aria-expanded` false→true；浮层在 DOM；**18** 行键位与 3 个组标题逐字（§0.3，含 `SHORTCUT_NOTE`）；`.shortcut-close` 计数 = 1；`focusableCount === 2`；`activeInsidePanel === true`；进入工作区首帧 `.shortcut-overview` / `.shortcut-row` / `.shortcut-key` / `.shortcut-note` 计数全 0 且 `.shortcut-toggle` 计数 1（N98-2） | `r17-1-shortcut-overview.png`、`r17-1b-shortcut-overview-entry.png` |
| `r17-1` / `key-toggle-and-typing-guard` | `setDraft("草稿守卫")` + 聚焦 `.input-area` → `?`（TEXTAREA）→ `blur()` 后 body `?` → 再 body `?` → 再 body `?` 打开 → 派发 `/` → 在 `.pdf-search-panel .search-input` 上派发 `?` → 在搜索框上派发 `Escape` | TEXTAREA 内 `?`：`pressKeyOnReturning` 返回 true（未 preventDefault）、浮层不出现、`value` 逐字 = `"草稿守卫"`；body `?` 打开；再 `?` 关闭；期间 `/` 打开 `.pdf-search-panel`（既有键位不被劫持）；INPUT 内 `?`：返回 true 且浮层**仍打开**；收尾一次 Esc ⇒ `.pdf-search-panel` **与** `.shortcut-overview` 同时离开 DOM（登记的双响应） | — |
| `r17-1` / `close-paths-and-focus-return` | Esc / 外部 pointerdown / `.shortcut-close` 三条路径 + 焦点归还（含 body 前置步） | 每条路径后浮层离开 DOM、`.shortcut-row` 计数 0、`aria-expanded === "false"`；焦点归还（入口按钮 / body 两分支，body 分支需 `blur()` 前置并自检 `activeElement === document.body`）；`sendCalls` / `notesAddCalls` / `readerStateSaveCalls` 零增量；关闭后 `.pdf-scroll.scrollTop` 与页 1 矩形不变 | — |
| `r17-1b` / `default` | 断言 `.knowledge-map-slot` 不在 DOM（地图关闭态）→ 打开浮层 → 几何读 | 地图列不在 DOM；浮层 ⊆ `.reader-panel`；与 `.composer-box` / `.pdf-toolbar` / `.pdf-page-indicator` / `.reader-section` / `.pdf-capture-fab` / `.center-pill` 零相交 | — |
| `r17-1b` / `narrow` | `--pix-right-width` → 560px → 复读 → 复位 | 同上零相交 + 浮层在 stage 内（地图仍关闭）；复位后 `.layout-right` 宽 380 ± 2 | `r17-1c-shortcut-overview-narrow.png` |
| `r17-2` / `explain` | `selectPageSpan(1)` → 读 4 动作 → 点「解释」 | 4 动作文本与图标逐字；`value === EXPLAIN_TEMPLATE`；聚焦；`sendCalls` 增量 0；`.message-block` 不变；选区文本不变；`chipSnapshot()` 不变；浮层 `display === "none"` 且 `btnCount === 3`（修订 M1） | `r17-2-quick-ask-four-actions.png`、`r17-2b-template-explain-draft.png` |
| `r17-2` / `translate-replace` | 重新选区 → 点「翻译」→ 清空 → 再选区 → 点「翻译」 | 草稿逐字 `TRANSLATE_TEMPLATE`（两分支）；`sendCalls` 增量 0 | `r17-2c-template-translate-draft.png` |
| `r17-2` / `custom-draft-kept` | `setDraft("我的问题：请给出结论")` → 点「解释」；`setDraft(NOTES_ASK_TEMPLATE)` → 点「翻译」 | 两次草稿逐字不变；聚焦；`sendCalls` 增量 0 | — |
| `r17-2b` / `four-buttons-default` | `selectPageSpan(1)` → 几何读 | 浮层 ⊆ stage（含 4px）；`scrollWidth - clientWidth <= 1`；4 按钮矩形递增且两两不相交；与 `.composer-box` / `.reader-section` / `.pdf-page-indicator` 零相交 | — |
| `r17-2b` / `four-buttons-narrow` | `--pix-right-width` → 560px → 复读 | 同 `four-buttons-default` 四条 + 按钮文案逐字 | — |
| `r17-2b` / `four-buttons-zoom-clamp` | 560px + **200%**（10 次「放大」，`.zoom-label` 逐字 `200%`）+ `scrollLeft = 0` → 重新选区 | 钳制分支确实生效：`Math.abs(float.right - (stage.right - 4)) <= 1.5`；浮层仍在 stage 内；4 按钮单行不溢出；末段缩放回 100% + 变量复位 | `r17-2d-quick-ask-four-buttons-zoom.png` |

**零缺失**：既有 166 张截图 / 237 条测量 / 64 种 label 不得缺失；新增后读数目标见 §0.9 第 2 条。

**白名单**：第 9 条。

### N99-4 既有断言的登记更新与回归

**验收判据**
1. 【走查】`ui-shot.mjs` 内 `grep -c "btnCount === 2"` = **0**、`grep -c "btnCount === 4"` = **3**（`:5518` / `:6987` / `:7059` 三处逐条对位，见 §0.9 第 4 条）；除这三处外，既有场景 / 断言 / 截图名 / label 的 `git diff -U0` 不出现 `-` 行。
2. 【离屏】r11-3 两个既有场景（相位 4 到期回落、相位 5b 不同文本回落）在 4 动作下全绿；`.quick-ask` 的反馈态既有断言（`is-ok` / `is-duplicate` / 反馈期 `btnCount === 0`）零变化。
3. 【走查】监听器泄漏的限制（**修订 M2**）：DOM `keydown` 监听的注册 / 注销只能由走查判定（N96-6 判据 3 的 `grep` 对位）；`r15-f16`（工作区卸载后的迟到注册）与 `r16-5`（降级）保持绿作为既有回归，但**不**覆盖本项 —— `r15-f16`（`ui-shot.mjs:9202-9245`）只统计 `window.__pixStub.agentEventListenerCount()`（stub 侧 agent 事件订阅数），与 DOM `window.addEventListener("keydown")` 无关；本轮新增组件不得改动这两个既有场景。

**白名单**：第 9 条。

---

## 5. 反需求（本轮，跨子条写死）

1. **不自动发送**：模板动作只写草稿；`send()` / `lastSend()` 零调用（r17-2 三相位断言 `sendCalls` 增量为 0）；不做「回车即发」「一键提问」。
2. **不新增 LLM 调用、不改主进程**：`pix/src/main/**` 与 `pix/src/shared/types.ts` 零 diff；stub 面（42 方法）零改动；不改任何 IPC 通道。
3. **不做可配置键位**：键位表是只读数据，不写入任何存储、不提供映射编辑、不做「自定义快捷键」入口。
4. **不做命令面板（command palette）**：浮层是只读清单，无搜索框、无执行动作、无跳转（点击行不做任何事）。
5. **不引入依赖**：`pix/package.json` 与 lockfile 零改动；不改 `packages/*`；不改 electron-builder 配置。
6. **不打扰**：不新增长期占位提示条；不做首次弹窗 / 自动打开；不写「已读」状态（无 `localStorage`、无资产字段、无 IPC）。
7. **不改既有键位语义与 Esc 优先级**：浮层不阻断、不劫持（§0.0 第 3 条）；`onWindowKeydown` 的八个分支与守卫顺序零 diff；`NotesPanel` 搜索框 Esc 的 `stopPropagation` 范式零改动。
8. **不改资产与笔记**：不动 `.pix-read/**` 格式与写入协议；不动 `notes.json`；不动 `notes.md` / `reports/**`。
9. **不写死代码**：模板动作与键位表都必须被真实 UI 调用（组件渲染 + 消费端分支）；不留未使用的导出。
10. **不碰知识地图与 pill 几何**：`.knowledge-map-slot` / `KnowledgeMap.vue` / `readerStore.mapOpen` 零改动；`.pane-pill` 的 `margin` / `height` 与 `--pix-pane-pill-height` 零改动（§0.4「定位依赖」的 4px 余量依赖它们）；不改 `SettingsPage.vue`。

---

## 6. 文件白名单（逐文件；其余文件一律零改动）

| # | 文件 | 允许的改动 |
| --- | --- | --- |
| 1 | `pix/src/renderer/utils/shortcut-help.ts`（**新增**） | §0.3 的类型 + `SHORTCUT_SECTIONS`（3 组 / 18 行）+ `SHORTCUT_KEY_JOIN` + `SHORTCUT_NOTE`；零 import |
| 2 | `pix/src/renderer/utils/quick-ask-templates.ts`（**新增**） | `TemplateAction` / `EXPLAIN_TEMPLATE` / `TRANSLATE_TEMPLATE` / `templateForAction` / `resolveTemplateDraft`（§0.7）；零 import |
| 3 | `pix/src/renderer/components/workspace/ShortcutOverview.vue`（**新增**） | 入口（Teleport + 就绪判定）、浮层（`v-if` + `role="dialog"` + 键位表渲染 + 关闭按钮）、开关 / 焦点 / 外部点击 / `?` 监听（分支顺序见 §0.5）、`isEditableTarget` 本地副本、样式（§0.4）；不新增 `--pix-*` 变量 |
| 4 | `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 仅：新增 `onTemplateClick(action)`；模板内插入「解释」「翻译」两个 `.quick-ask-btn`（位置在既有两按钮之间）；既有 `问 AI` / `摘录` / 反馈 / 几何 clamp / 常量逐字零改写 |
| 5 | `pix/src/renderer/composables/useQuickAsk.ts` | 仅：新增 `QuickAskAction` 类型；`QuickAskHandler` 第二参数；`emitQuickAsk(text, action = "ask")`；`registerQuickAskConsumer` / 笔记 seam 零改动 |
| 6 | `pix/src/renderer/components/workspace/ChatPanel.vue` | 仅：`onQuickAsk` 增加 `action` 分支（`ask` 分支逐字不变）、新增 `QUICK_TEMPLATE_REPLACEABLE`、导入两个模板与 `resolveTemplateDraft`；`send()` / chips / `<reading_context>` / `NOTES_ASK_TEMPLATE` 分支零改动 |
| 7 | `pix/src/renderer/components/workspace/ReaderPanel.vue` | 仅：导入 + 一行 `<ShortcutOverview />`（`<PdfSelectionQuickAsk />` 之后）；既有 Teleport / `.map-toggle` / 结构零改动 |
| 8 | `pix/scripts/smoke-view.mjs` | 仅：`files` / `required` / `allowed` 同步 + 两个模块句柄 + `shortcut-table`（12 条）+ `template-draft`（11 条）+ `main()` 两行调用；既有 51 条零改写 |
| 9 | `pix/scripts/ui-shot.mjs` | 仅：`SEL` +6（§0.9 第 3 条）、**五个**新 helper（§0.9 第 6 条）、`r17-*` 场景与 7 张截图、§0.9 第 4 条的**三处** `btnCount` 更新；其余既有内容（含 `pressKeyOn` 等既有 helper）零改写 |
| 10 | `docs/pm/R17-req.md`（本档）/ `docs/pm/R17-review.md` / `docs/pm/R17-design.md` / `docs/pm/R17-dev.md` | 本轮流程档件 |

**显式不在白名单（零 diff）**：`pix/src/renderer/components/workspace/PdfViewer.vue`、`pix/src/renderer/components/workspace/PdfSearchPanel.vue`、`pix/src/renderer/components/workspace/NotesPanel.vue`、`pix/src/renderer/components/workspace/KnowledgeMap.vue`、`pix/src/renderer/components/input/InputArea.vue`、`pix/src/renderer/pages/WorkspacePage.vue`、`pix/src/renderer/pages/SettingsPage.vue`、`pix/src/renderer/stores/**`、`pix/src/renderer/utils/reading-context.ts`、`pix/src/main/**`、`pix/src/shared/types.ts`、`pix/package.json`、`packages/*`。
（`InputArea.vue` 说明：composer 预填走既有 `draft` ref + `composerInput.value?.focus()`，**不需要**新的 seam ⇒ 该文件零改动；`PdfViewer.vue` 零改动是「键位表与代码一致性」比对的对象，不是被改对象；`SettingsPage.vue` 零改动是§0.3 注 5 的「工作区外」登记对象。）

---

## 7. 开放问题（登记，不阻塞本轮）

1. **三动作形态（`canExcerpt === false`）在离屏不可达**：夹具内选区恒可定位到页（`resolveSelectionPage` 最近页兜底）⇒ 只做走查。若后续要离屏覆盖，需要造「选区在 `.reader-stage` 内但没有 `[data-page]` 节点」的场景（例如知识地图区的选区），属新场景设计。
2. **浮层与阅读区 Esc 的「同一次按键双响应」**：框选模式开启且浮层打开时按 Esc，会同时退出框选并关闭浮层（§0.0 第 3 条的既定行为）；浮层与文档搜索同开时同理（现已冻结为可判断言，见 N96-3 判据 1 步 ⑤）。若负责人希望「Esc 只关浮层」，需改 §0.5 与 §0.0 第 3 条，并与 R11/R16 的 Esc 顺序契约一起裁决。
3. **`Ctrl+滚轮` 缩放未入总览**：它是真实存在的用户操作（`onWheelZoom`）但不是键位；若负责人要求列出手势，应新增一行「滚轮」分区（需同时改 §0.3 的 18 行配额与 smoke 断言）。
4. **`.map-toggle` 与 `.shortcut-toggle` 的 pill 内相对顺序**由挂载顺序决定（§0.0 第 2 条），本档不写断言；若要求固定顺序，需要在 `ReaderPanel` 内统一 teleport 或改用 flex `order`（都会触碰既有 `.map-toggle` 语义，另立轮次）。
5. **浮层与知识地图的重叠（修订 M3 的未采用口径）**：本轮接受「地图打开时浮层压住地图列顶部」（§0.4）；若负责人要求改为「永不重叠」，需把浮层定位改为「相对 `.reader-stage` 且按地图列宽避开」（在 `showFor` 之外另做变换）并同步改 §0.4 定位、r17-1b 判据与新增的「地图打开态」相位（另立轮次）。
6. **键位表的收录口径（修订 M4 的未采用口径）**：本轮按「应用自有监听 + composer 换行」收录 18 行（含 `ChatPanel.vue:1166` 的重命名输入框）；若负责人要求更窄的「只列阅读区 + composer」口径，需删回 17 行并同步改 §0.3 注 1/注 4、N96-2 判据 2 与 N99-2 的 `shortcut-table` 三条（另立轮次）。

---

## 追加冻结（R17 · 负责人裁决）

> 上游（本追加的唯一依据）：`docs/pm/R17-review.md`「代码审查（R17）」must-fix **D-1** —— N97-3 判据 1 的两条冻结断言（点击后选区逐字不变 + chips 不变）与冻结实现互斥。根因链与真实读数：`docs/pm/R17-dev.md` §B8 **D-B1**（首次验收轮真实判红：点击后 `collapsed true`、chips 2→1）、N97-2 冻结的 `composerInput.value?.focus()` 行、`docs/pm/R8-dev.md` **D6** 与 B 面「未验证 1」（该行为是**既有产品缺陷**：聚焦中的 composer 在真实键入路径上会把 document 选区收进输入框 ⇒ `readerStore.selectedText` 清空 ⇒「选中文本」chip 与 `<reading_context>` 的 `selectedText:` 在真实使用中断掉：用户选中一段话 → 点「问 AI / 解释 / 翻译」→ 键入问题 → 发送，AI 收不到那段话）。
> 裁决（负责人，逐字不可改写）：**本轮修掉**（属缺陷修复，不是新功能）——冻结一条新需求，把「点击问 AI / 解释 / 翻译时用户看到的那段选区文本」快照到 composer 状态，使真实键入路径下 chip 与载荷都不丢。
> 编号消歧：既有 **N97-4（键盘可达与四动作几何）** 逐字不动；本节是同一号段下的**追加冻结项**，标识为「N97-4（追加 · 负责人裁决）」，后续引用一律写全「N97-4（追加）」。
> 基线（本次实读）：HEAD `8850c9c`；`git status --short` ⇒ 6 `M` + 7 `??`（与代码审查一致）。本次只**追加**本节，本档既有字面（§0.0–§0.9 / N96–N99 / §5–§7）逐字不动。

### N97-4（追加 · 负责人裁决）选区快照

**用户可见行为**：用户选中一段话 → 点「问 AI / 解释 / 翻译」→ 浮层消失、composer 聚焦并预填草稿；**随后真实键入问题**（焦点在 composer 内）时，「选中文本」chip **仍在**且文本逐字等于点击时的那段选区文本；发送后 AI 收到的 `<reading_context>` 含 `selectedText:` 行（逐字等于该段选区文本）；同一段话可以连续追问（发送不清空快照）。用户建立**新选区**时 chip 立即改为新选区文本；**切换文档**或**点 chip 上的移除**时 chip 消失，且移除后不再复活。

**冻结语义（逐字；设计档 / 开发档 / 评审档均不得改写）**

| # | 条 | 逐字字面 |
| --- | --- | --- |
| A | 快照来源 | 快照来源：`PdfSelectionQuickAsk` 点击任一侧选动作时传给 `emitQuickAsk` 的文本（`cachedText`，即浮层出现时捕获的选区文本）；ChatPanel 在任何 action 下都必须把它记为 pendingSelection。 |
| B | 唯一来源 | chip 与载荷的唯一来源：`选中文本` chip 的可见性与文本、以及 `send()` 传给 `buildReadingUserMessage` 的 `selectedText` 实参，共用同一个派生（pendingSelection 优先，回落 `readerStore.selectedText`）；不得出现第二份来源。 |
| C | 失效规则 | ① 出现新的非空选区（`readerStore.selectedText` 变为非空且与快照不同）⇒ 快照失效（以新选区为准）；② 文档切换（`readerStore.filePath` 变化）⇒ 清空；③ 用户在 chip 上点移除 ⇒ 清空（移除后不得复活）；④ 发送不改变快照（同一段话可以连续追问）；⑤ 切会话不清空（与会话无关）。 |
| D | 不得改动 | `readerStore.selectedText` 的实时镜像语义（PdfViewer 侧零改动）、`excludedContexts` 的既有排除机制、chips 的既有类名与文案、`<reading_context>` 的格式、模板动作的既有字面与「不自动发送」。 |

**冻结语义条数**：**4 条主条**（A 来源 / B 唯一来源 / C 失效规则 / D 不得改动），其中 C 展开为 **C①–C⑤ 五条子条**、D 为 **5 类不得改动项** ⇒ 逐字字面共 **9 条**（4 主条 + 5 子条；D 的 5 类是同一主条内的清单，不另计主条）。

**验收判据**（必须可离屏构造；落点逐条见设计档「追加设计（R17 · N97-4）」§3；全部按「失败即判红」落地，不得降级为跳过）

（a）**真实键入路径下的 chip 与草稿** —— 新场景 `r17-3` 相位 `snapshot-survives-typing`（9 条断言）：离屏选区（`selectPageSpan(1)` + 既有 `ensureQuickAskExcerptReady(1)` 复核就绪）→ 点「解释」→ **用合成键入追加若干字符**（`typeIntoComposer`；键入前自检焦点已在 composer 内 = 真实键入路径）→ 断言 `.context-chip` 中「选中文本」chip **仍在**、其 label 逐字等于点击时刻的 label（= `选中文本：` + 选区前缀 24 字 + `…`）、composer 草稿逐字 = `EXPLAIN_TEMPLATE` + 键入内容、`sendCalls().count` 增量 0 且 `.message-block` 计数不变；并 pin 住非真空证据（键入后 `document.getSelection().isCollapsed === true`，即缺陷触发条件确实发生）。

（b）**载荷含 `selectedText:`** —— 相位 `send-payload`（6 条断言）：随后发送（点 `.composer-send` + `waitSendCalls(1)`）→ 断言 stub 收到的载荷含 `selectedText:` 行、其**下一行逐字等于该选区文本**（点击时刻读下的 `document.getSelection().toString().trim()`），且载荷其余骨架与既有格式一致（`<reading_context>` / `path: …` / `page: 1` / `pageCount: 3` / `</reading_context>` / 空行 + 用户文本逐字）。

（c）**失效路径** —— 三个相位：`new-selection`（3 条）建立新选区 ⇒ chip 文本更新为新选区（`选中文本：` + 新选区前缀）且不再等于旧快照；`chip-removed`（4 条）点 chip 移除 ⇒ chip 消失，且既有 `resetExcludedContexts()` 触发后**仍不复活**（判别性：若快照未清空，移除后 chip 会以旧快照复活）；`doc-switch`（3 条）切换文档（`openRow("long-book.pdf")`）⇒ chip 消失。

（d）**零回归**：既有 166 张截图（R16 基线）与既有 64 种 label **零缺失**；既有 `42*` / `43*` / `r17-*` 场景全绿 —— 其中 `r17-2/explain` 的 chips 断言按本追加**更新 1 处**（由「净差异恰为『选中文本』一项」改回 N97-3 判据 1 的冻结字面「与点击前逐字相等」），其余既有断言**零删除、零放宽**。

**失效路径登记（逐条对位设计档 §4）**：快照未记录 / 载荷未共用派生 / 优先级反转 / 空选区误清 / 新选区不失效 / 移除后复活 / 切文档不清空 / 越界改动既有冻结面 ⇒ 每条都有独立判红读数。

**N97-4（追加）白名单条目（§6 的增量口径；未列出的文件保持 §6 的零改动口径）**

| # | 文件 | N97-4 允许的增量 |
| --- | --- | --- |
| 6+ | `pix/src/renderer/components/workspace/ChatPanel.vue` | 新增 `pendingSelection` ref、`effectiveSelectedText` computed、两个失效 watch；`onQuickAsk` 首行记录 1 行；`selectionChip` 取值行与 `send()` 的 `selectedText` 实参行各 1 行替换；`excludeContext` 追加 1 行清空。其余逐字零改动 |
| 9+ | `pix/scripts/ui-shot.mjs` | `SEL` **+2**（`contextChip` / `contextChipRemove`）；新增 helper `typeIntoComposer(text)`（第 6 个）；新增 `r17-3` 场景（5 条 record / 25 条断言 / 1 张新截图 / 新 label `r17-selection-snapshot`）；更新既有 `r17-2/explain` 的 chips 断言 1 处（本次实读 `:10904-10909`） |
| 10+ | `docs/pm/R17-req.md`（本档）/ `R17-design.md` / `R17-review.md` | 本追加的流程档件 |
| 零 diff（逐条） | `PdfSelectionQuickAsk.vue` / `useQuickAsk.ts` / `PdfViewer.vue` / `reader-store.ts` / `InputArea.vue` / `reading-context.ts` / `WorkspacePage.vue` / `AppLayout.vue` / 全部样式文件 / `pix/package.json` / `pix/src/main/**` / `pix/src/shared/types.ts` / `packages/*` / `smoke-view.mjs` / `smoke-notes.mjs` | 快照来源文本已由既有 `emitQuickAsk(text, action)` 送达消费端 ⇒ **不改 seam**；镜像链路、chips 类名与文案、排除机制、载荷格式一律不动 |

**配额登记（在 R17 基线之上）**：离屏新增 **1** 场景 / **1** 组 label / **5** 条 record / **25** 条断言 / **1** 张新截图；`SEL` 64→70（R17）→ **72**（追加 +2）；新增 helper 5（R17）→ **6**；更新既有断言 **1** 处。目标读数：`MANIFEST.json.shots.length` = **174**、`MEASUREMENTS` 长度 **253**、`label` 去重 **69**（R17 基线 173 / 248 / 68 全部保留、零缺失）。
