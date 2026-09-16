# 需求评审（R12）

- 评审对象：`docs/pm/R12-req.md`（本轮新增、尚未跟踪：`git status --short` ⇒ `?? docs/pm/R12-req.md`；其余工作树干净，HEAD `c16135d`）。
- 评审方式：只读代码 + 只读命令（`grep` / `git`）+ 按真实代码规则手工推演夹具；本步按约定不跑离屏取证。
- 本步实跑复核的事实基线（与档内声明一致）：
  - `C:/Users/86157/AppData/Local/Temp/pix-v05-r11-lead/shots/MANIFEST.json` ⇒ `shots.length = 120`、`failure = null`；`MEASUREMENTS.json` ⇒ 169 条、37 种 label（含 `r11-esc-scope` / `r11-quick-ask-scroll-scope` / `r11-undo-after-empty` / `r11-note-actions-narrow` / `r11-undo-scope-stale`）。
  - `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（输出仅脚本横幅）。
  - `pix/package.json`：`scripts` 有 `smoke:notes`、无 `smoke:view`；`check` = `vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit`。

## 1. N77 命中规则：唯一性 / 可判性 / 夹具推演

结论：规则唯一、可判，在夹具上无歧义；N78-1 表的三页期望与档内 §0.3 表逐字可复现。仅「§0.3 理由①」在夹具自身上不成立（must-fix 4）。

规则落在真实代码上是清楚的：候选 = `buildChapterRanges(outline, pageCount)`（`outline-notes.ts:50`）的 `Map` 插入序 = 有页码节点的预序；`end` = 预序中第一个页码严格更大的节点页码 − 1，无后继取 `pageCount` 并 `Math.min` 钳制；`label` = `end > start` 时 `start-end`，否则 `start`。`Map` 键为 `${parentKey}/${index}`，不可能重复，故「值序列」等价于「有页码节点的预序」，无第二种顺序来源。

夹具 `SAMPLE_OUTLINE`（`ui-shot.mjs:260`）预序与推演出的 ranges（pageCount = 3）：

| 预序 | key | title | start | end | label |
| --- | --- | --- | --- | --- | --- |
| 1 | `root/0` | `1. Abstract` | 1 | 1 | `1` |
| 2 | `root/1` | `2. Method Overview` | 2 | 2 | `2` |
| 3 | `root/1/0` | `2.1 Sparse mask budget` | 2 | 2 | `2` |
| 4 | `root/1/1` | `2.2 Positional prior` | 3 | 3 | `3` |
| 5 | `root/2` | `3. Ablation Study` | 3 | 3 | `3` |
| — | `root/2/0` | `Appendix A`（`page: null`） | 不进 `ranges` | — | — |
| 6 | `root/2/0/0` | `Appendix A.1` | 3 | 3 | `3` |
| 7 | `root/2/1` | `Appendix B` | 2 | 3 | `2-3` |

`ranges.size = 7` = 有页码节点数（与 N81-1 `section-hit` #8 的对账口径一致）。

逐页命中（`start ≤ page` 且 `start` 最大；同 `start` 取序列中最早者）：

| 页码 | 候选（start ≤ page） | `start` 最大并列集 | 命中 key / 文本 |
| --- | --- | --- | --- |
| 1 | `root/0` | 仅 `root/0` | `root/0` ⇒ `1. Abstract · 第 1 页` |
| 2 | `root/0`(1)、`root/1`(2)、`root/1/0`(2)、`root/2/1`(2) | `{root/1, root/1/0, root/2/1}` | 最早 = `root/1` ⇒ `2. Method Overview · 第 2 页`（不是 `2.1`、不是 `Appendix B`） |
| 3 | 全部 7 项 | `{root/1/1, root/2, root/2/0/0}` | 最早 = `root/1/1` ⇒ `2.2 Positional prior · 第 3 页`（不是 `3. Ablation Study`、不是 `Appendix A.1`） |
| 越界 4 / 0 / −3 / 1.5 / `pageCount ≤ 0` | — | — | `null`（§0.3 六情形；不四舍五入、不钳制） |

「恒在范围内」（`start ≤ page ≤ end`）可从真实 `end` 定义直接证明：设命中项 `start = a` 为最大且 `a ≤ page`；若 `end < page`，则 `end + 1` 是预序中某个页码严格大于 `a` 的节点（`end = pageCount` 时不可能，因为 `page ≤ pageCount`），该节点自身是 `start' = end + 1 > a` 的候选且 `start' ≤ page`，与「`a` 最大」矛盾。故 N77-3 的总不变量在 `1 ≤ page ≤ pageCount` 上成立，与地图 `isCurrent`（`KnowledgeMap.vue:168`）同一集合。

不依赖我读代码的交叉验证：用上表 ranges 复算既有声明表（`SAMPLE_MAP_EXPECT`，`ui-shot.mjs:230`），四个字段逐一相等 —— 页码徽标 `["1","2","2","3","3","2-3"]`（`Appendix A.1` 因 `collectExpandable` 只展开深度 0 节点而不进 DOM：`KnowledgeMap.vue:105`）、第 1 页 current 1 / read 0、第 2 页 current 3 / read 1、第 3 页 current 3 / read 3。这也验证了 `r12-1` invariance 相位 ⑬ 的两项包含断言在第 3 页成立（`.map-row.current` = `2.2 Positional prior` / `3. Ablation Study` / `Appendix B`，`.label` 在 chapter 与 child 两种行上都存在：`KnowledgeMap.vue:253` / `:292`）。

附注（不是缺陷）：命中项恒在 in-range 集合内，但可能落在默认折叠、未渲染的地图行上（父节点未展开的 depth ≥ 2 行）；档内 §0.3 性质 3 只声明「命中计算不依赖地图可见性」，措辞正确。另外「越界页 ⇒ null」这条分支在 UI 侧不可达（`commitPageDraft` 的 `1..pageCount` 校验把输入钳制，`PdfViewer.vue:328`），因此只由烟测覆盖，`r12-1` 的 page-input 相位验的是既有钳制语义 —— 这一点档内已按「既有钳制 + 章节不漂移」表述，无需改。

## 2. N78 零占位与不位移：可判性一半成立

- 零占位：**可判**。容器条件被冻结为 `v-if`（§0.5），`sectionProbe().containerInDom === false` 等价于「不在 DOM」，也就等价于「不留占位高度」；`r12-2` ①③ 直接断言，无需额外测量。
- 不位移：**只有一部分可判**。N78-3 冻结了 4 个选择器（`.pdf-page-indicator` / `.page-label` / `.pdf-toolbar` / `.pdf-capture-fab`），但唯一冻结的测量判据（`r12-2` ⑤ ±1px）与 `pillProbe()`（§0.5）只覆盖 `.pdf-page-indicator`（+ `.page-label` 文本）。§0.6 的零缺失判据是「basename / label 集合 ⊆」的**存在性**判据，不含基线读数与验收读数的数值 diff ⇒ `.pdf-toolbar` / `.pdf-capture-fab` 的几何在整轮里没有任何判据。见 must-fix 2。
- 重叠与占宽：`r12-1` ⑤ 只判「与 `.pdf-page-indicator` 矩形不相交」，而 N78-1 / §0.5 描述的是「页码 pill **上方**居中」，N78-3 又要求「只占内容宽度、不得铺满整宽、不得覆盖 `.pdf-scroll`」—— 这两条都没有判据（容器放在任意不重叠位置、或铺满整宽都能全绿）。见 must-fix 2。
- 设计自由度（可接受，不必再冻结）：`bottom` 具体值、`gap` / 阴影 / 圆角（在加上「上方」判据后由几何判据封口）；chip 的省略号截断（`title` 属性已冻结为同文本，可判）；图标与 `title` 文案已逐字冻结。
- 名称无冲突：`grep -rn "reader-section" src/` 无命中；既有 `.reader-*` 类名全在 `ReaderPanel.vue` 且为 scoped 样式 ⇒ 新容器放 `PdfViewer.vue` 根节点内不产生碰撞。v-btn 的 class 落在根 `button`（既有 `.notes-search-clear` 就是 v-btn 带 class 的用法，`NotesPanel.vue:440`，且 R11 的 `zoomInBtn: '.pdf-toolbar button[title="放大"]'` 选择器能选中 v-btn）⇒ `.reader-section-prev/.next` 的类名与 `disabled` 读法可行。

## 3. N79 边界与键位

结论：边界与「当前页不在任何章节内」的规则**已写死**且与代码自洽；`[` / `]` 与既有键位**无冲突**；仅规则 3 的措辞与真实代码不符（must-fix 3）。

- 边界写死情况：§0.4 定义（next = `start > page` 中 `start` 最小、并列取预序最早；prev = `end < page` 中 `end` 最大、并列取预序最晚）+ 四条性质 + 六行边界表（首页 / 中间页 / 末页 / 无 outline / 单节内 / 早于第一节）+ N79-3 显式要求「早于第一节 ⇒ 上一节禁用、下一节 = 第一节」。与真实代码口径自洽：由 `end` 定义可证「不在任何章节内 ⇔ `page < min(start)`」（覆盖区间之外无空洞），所以该表无漏行；`prev.start ≤ prev.end < page` 恒成立，`next.start > page` 恒成立。
- 既有键位全集（`grep -rn "event.key"` + `keydown` 全量命中，只读）：
  - `PdfViewer.vue:356` 是**唯一**的窗口级 `keydown`（注册点恰 1 处：`:424`；`setKeydownListener` 只在 `pageCount > 0` 时挂载）：`:357-372` 修饰键早退（内含 `:358-370` 的 `Ctrl+F`）、`:375` `Escape`+captureMode、`:380` `Escape`+searchOpen、`:385` 守卫、`:386-390` `/`、`:393-417` `switch`（`PageUp`/`ArrowLeft`、`PageDown`/`ArrowRight`、`Home`、`End`）。
  - 其它组件级 keydown（都不在冒泡链上竞争 `[` / `]`）：`InputArea.vue:28`（Enter 发送）、`ChatPanel.vue:1135`（Enter 改名）、`NotesPanel.vue:201/436`（搜索框 Esc）、`PdfSearchPanel.vue:307/407`（Enter）、`PdfViewer.vue:939/940`（页码输入框 Enter/Esc）、`SettingsPage.vue:482`（Enter）。
  - ⇒ 仓库内**不存在**任何 `[` / `]` 绑定；`isEditableTarget` 定义恰 1 处（`:341`）、唯一使用点恰 `:385` ⇒ 输入控件内不会误触发，也无键位抢占。
  - 行号小偏差（不影响判据可执行性）：档内「`:388-419` switch：`/` / PageUp…」不精确 —— 真实行号为 `/` 在 `:386-390`、`switch` 在 `:393-417`（函数收于 `:418`）。冻结约束「`:385` 之后、`switch` 之前」本身无歧义。
- 规则 3 的措辞问题见 must-fix 3：它声称四条不生效条件「全部复用既有判断，不得重写」，但真实守卫只有两条。`captureMode` 是**新增**条件（今天 `PageUp`/`ArrowLeft` 等在框选模式下仍然生效，代码里 captureMode 只拦 `Escape`）——这是本轮刻意的行为差异，必须写成新规则，否则按字面实现会让 `r12-3` ⑰ 变红。

## 4. N80 格式冻结与既有断言影响

结论：格式**逐字可判**（前缀 `section: `、值 `${title} · 第 ${label} 页`、位置在 `pageCount:` 行之后、命中为 `null` 时整行不出现、无 `filePath` 时原样早退）；逐条核对后，**没有既有断言会因插入该行变红**。档内 §0.2 第 2 条的结论正确，只漏登记一处无影响的老断言。

| 既有断言 | 实际位置 | 是否受影响 | 依据（只读核对） |
| --- | --- | --- | --- |
| 42d「无文档时载荷逐字等于输入」 | `ui-shot.mjs:3633-3645` | 否 | `!ctx.filePath` 时 `buildReadingUserMessage` 原样返回 `userText`（`reading-context.ts:78`） |
| 42c r7「清空选择」骨架行与 `path:` 行 | `ui-shot.mjs:3559-3588` | 否 | 全是 `includes(...)` + 以 `path: ` 前缀 `find` 行；**全文件无行序/行数判据**（唯一 `split("\n")` 只用于该前缀查找） |
| 43 载荷骨架 + 条目字面量 + 顺序 + steer | `ui-shot.mjs:3647-3711`（`missingLines` 在 `:2953`，包含式） | 否（只增行） | 档内要追加的 needle `section: 2. Method Overview · 第 2 页` 与 §1 推演一致（第 2 页命中 `root/1`、`label = 2`）⇒ 追加后必绿；追加不改变该 record 条数，`169 条零缺失` 判据不受影响 |
| 35 的 `confirmed35B` | `ui-shot.mjs:2829` / `:2831` | 否（同步与不同步都绿） | 锚点在发送时刻登记（`ChatPanel.vue:363-367`），回答块经 `session-store.readingAnchorFor`（`session-store.ts:305-315`）回溯；stub 把 `displayText: confirmText` 传出，`matchOptimisticUserMessage`（`session-store.ts:118-130`）用「确认 text === 乐观键入文本」判定 ⇒ 与载荷内容无关 ⇒ `:2838-2841` 三条断言恒成立。档内开放问题 4 的「零断言影响」经复核**成立** |
| 44 / 45 / 52 / 62 / 63 与 R11 各组载荷判据 | 略 | 否 | 均为 `includes("reader_notes:")` / `includes(<条目文本>)` 形式 |
| 系统提示词 | — | 无断言存在 | `READING_ASSISTANT_SYSTEM_PROMPT` 仅被 `session-bridge.ts:1245` 引用，`scripts/` 与 `src/` 内无脚本断言其文本 ⇒ N80-4 加行不会撞既有断言 |

补充：`ReadingSendContext.outline` 设必填带来的编译期护栏成立 —— 全仓库唯一调用点是 `ChatPanel.vue:377`（`grep -rn buildReadingUserMessage` 仅命中 `ChatPanel.vue:17/111/377` 与定义处 `reading-context.ts:77`）。N80-2 要求「`section:` 在 `selectedText:` 之前」不只靠走查：烟测 `section-format` #3 用 `indexOf` 三元序断言，可判。

## 5. N81 烟测与离屏可构造性

`smoke-view.mjs`（Windows 可行性，对照 `smoke-notes.mjs`）：**可行**。要点已逐条核实：`spawnSync(process.execPath, [node_modules/typescript/lib/tsc.js, "-p", tsconfig])` 的写法与 `smoke-notes.mjs` 同款（后者即当前可跑通范式）；三个目标文件只 import `@shared/types`（type-only）与 `./notes-path`（`outline-notes.ts:11-12`、`notes-path.ts:8`、`reading-context.ts:9-10`），运行时不依赖 vue/pinia；`src/shared/types.ts` 顶部零 import ⇒ 允许产物集合就是 3 + `out/shared/types.js`，与档内期望一致；`tsconfig.json` 的映射正是 `baseUrl: "."` + `"@shared/*": ["src/shared/*"]` ⇒ 档内给的等价写法可行；`target: ES2022` 默认 lib 含 DOM（`reading-context.ts:150` 用 `window`），`types: ["node"]` / `typeRoots` 沿用 `smoke-notes.mjs`；`scripts.smoke:view` 无键名冲突；`tsconfig.json` 的 `include` 只含 `src/renderer/**`、`src/shared/**` ⇒ 新脚本不进唯一工程门（与 `ui-shot.mjs` 同待遇）。

断言不空转：4 组都含正反控制（`section-hit`/`section-nav`/`section-format` 有手写期望的正例；`section-null` 8 条全为 `null` + #8 的 `didNotThrow`）⇒ 「恒返回 null」或「结果乱来」的两种假实现都会红。`section-hit` #5/#8 是对同一份 `ranges` 的复算不变量，不能单独作为并列取值口径的证据，但 #1-#3/#6/#7 的手写期望已经封住口径 ⇒ 可接受。

离屏场景：可构造，前提是几个隐含依赖都成立（本步已核实）：`enterCleanWorkspace` → `goHome()` 会把地图关掉（`WorkspacePage.vue:236` `setMapOpen(false)`）、选区清空（`:235` `openDocument(null)`）、笔记选择集清空（`:239` `resetNotes()` → `clearNoteSelection()`，`notes-store.ts:287`），所以 `r12-1` invariance 里**未加保护**的 `openMap()` 是安全的（注意：仓库内既有范式是带保护的 `ensureMapOpen`，`ui-shot.mjs:4825`，并注明「已开时不得再点」；新场景依赖的是 `goHome` 复位，若日后相位顺序调整会静默把地图关掉并超时）；`.reader-main` / `.input-area` / `.page-input` 三个选择器都唯一且分别为容器、原生 `<textarea>`（`InputArea.vue:52`，全仓库仅 `ChatPanel.vue:1096` 使用该组件）与原生 `<input type=number>`（`PdfViewer.vue:931-942`）⇒ `isEditableTarget` 口径与 `tagName === "TEXTAREA"` 防空断言可判；缩放往返 ±0.1 经 `setScale` 两位取整回到 `1.00`（`PdfViewer.vue:731`、`reader-store.ts:136-139`、`zoom-label` 在 `PdfViewer.vue:845`）⇒ ⑫ 非空转；`pressReaderKey` 在 `document.body` 上派发 `KeyboardEvent(..., { bubbles: true })` 能到达窗口监听（既有 `pressBodyEsc` 即此范式，`ui-shot.mjs:5220`）；`record()` 失败即抛（`ui-shot.mjs:1381-1384`）、失败落 `MANIFEST.failure`（`:6820-6864`）⇒ 「16 条 record / 7 张截图 / `failure === null` / 退出码 0」的配额可执行。

发现的问题（见 must-fix 1）：章节控件与 `outline` 的装载**不同步于** `waitPage`（`setPageCount`/页码出现在 `PdfViewer.vue:650-664`，`setOutline` 在 `:669-673`，中间隔着 `measurePages` + `getOutline()` + 逐节点 `getPageIndex`），而 `waitFor` 的轮询间隔是 120ms（`ui-shot.mjs:1370-1378`）⇒ `r12-1` ①⑥⑧、`r12-2` ⑦、`r12-3` ②⑤⑧、`r12-4` ① 有竞态风险；反向地，`r12-2` ①③ 的「容器不在 DOM」在 outline 未装载时会**静默为真**（空断言）。既有范式已经给了正确做法：50c 场景先 `openMap()` 再等 `.map-empty` + `.map-progress` 才判无书签（`ui-shot.mjs:4155-4165`）。

未覆盖项（记录为已接受的缺口，不阻塞）：命中为 `null` 而导航非 `null`（「早于第一节」）在 ui-shot 夹具里不存在（sample-paper / long-book 都从第 1 页起，older-paper 无书签），只有烟测覆盖；容器只渲染部分子元素（缺 chip）的形态同理。若要离屏覆盖需新增夹具，超出本轮白名单。

## 6. 白名单与改动对应

结论：9 行白名单与 N77–N81 的改动**一一对应，无遗漏**；「地图侧零改动」等声明可达（已核实所需状态与宿主都在白名单内）。

- 新控件宿主：`.pdf-page-indicator` 是 `PdfViewer.vue` 根 `.pdf-viewer` 内的绝对定位兄弟（`:922`，样式 `:1129-1143`）⇒ 新 `.reader-section` 同宿主即可，**不需要** `ReaderPanel.vue`（与该档开放问题 2 的提示一致）。
- `reader-store.ts` 零 diff 可达：`outline` / `page` / `pageCount` / `gotoPage`（可写 ref）/ `captureMode` 都已存在（`reader-store.ts:29-35`），`gotoPage` 由 `PdfViewer.vue:800-807` 的 watcher 消费 ⇒ 跳转不必新增通道，也不必改 store。
- 地图侧零 diff 可达：`PdfViewer` 只是 `buildChapterRanges` 的**第二个调用者**（同一函数、同一输入），不是第二份算法；`KnowledgeMap.vue` 只被新的断言 helper 只读。
- 范围外文件全部未被要求改动：`packages/**`、`package-lock.json`、`pix/tsconfig*.json`、`vite.config.ts`、`src/renderer/stores/**`、`src/main/{ipc-handlers,preload,notes-store,...}.ts`、`src/shared/types.ts`（`ReaderOutlineNode` 已存在，`outline-notes.ts:11` 已在用）⇒ 均可零 diff。
- 新建只有 `pix/scripts/smoke-view.mjs` + 本轮文档；`pix/package.json` 只增 `scripts.smoke:view`（键名当前不存在，命令形态与 `smoke:notes` 一致）；`.gitignore` 无需改（脚本只写 `os.tmpdir()`）。
- 唯一建议的措辞补充（并入 must-fix 8）：白名单第 1 行说新函数「只读 `ChapterRange` 的 `start`/`end`/`title`/`label`」，容易被读成禁止遍历 `ranges`，而 §0.3 明确要求「按 `Map` 插入序」取候选 ⇒ 建议补一句「允许按 `Map` 插入序遍历（顺序来源本身也是冻结面）」。

## must-fix 清单

1. **【可构造性，最高】新增离屏场景缺少「outline 已装载」同步点，同时造成竞态红与空断言。**
   证据：页码可见早于章节派生（`PdfViewer.vue:650` `setPageCount` → `:665` `scrollToPage` vs `:669-673` `getOutline()` + `convertOutline` + `setOutline`）；`waitFor` 轮询 120ms（`ui-shot.mjs:1370-1378`）⇒ `r12-1` ①⑥⑧、`r12-2` ⑦、`r12-3` ②⑤⑧、`r12-4` ① 可能在 outline 落地前读到「无控件」；反向地在 `r12-2` ①③，控件缺席会**无条件为真**，断言空转。
   要求：在 `r12-1` / `r12-2`（第二相位）/ `r12-3` / `r12-4` 的前置里冻结就绪等待（有书签文档：等 `.reader-section` 出现；无书签文档：按既有 50c 范式先 `openMap()` 并等 `.map-empty` + `.map-progress`，证明解析结果为「空 outline」）后再断言。

2. **【判据不完整】N78-3 的「不位移 / 不重叠 / 只占内容宽度」只有部分可判。**
   证据：冻结面列 4 个选择器，而 `r12-2` ⑤ 与 `pillProbe()`（§0.5）只覆盖 `.pdf-page-indicator`（+ `.page-label` 文本）；§0.6 的零缺失是 basename/label 集合 ⊆ 判据，无基线-vs-验收数值 diff；`r12-1` ⑤ 只判「不相交」，未判「在上方」；「只占内容宽度 / 不覆盖 `.pdf-scroll`」无判据。
   要求：把 `pillProbe()` 扩到 4 个选择器并冻结 ±1px 字段比较（或把 N78-3 的选择器清单收窄到 pill 并在 dev 档写明其余为人工 diff）；补 `section.bottom ≤ pill.top`（带容差）的「上方」判据；对「只占内容宽度」给出可判形式（建议冻结容器 `pointer-events: none`、仅按钮/不需要交互的元素例外，并断言之，或给出宽度上限判据）。

3. **【规则与代码不符】N79-2 规则 3 的「四条不生效条件全部复用既有判断，不得重写」与 `PdfViewer.vue` 真实守卫不一致。**
   证据：`:385` 的既有守卫只有两条（`pageCount <= 0`、`isEditableTarget`）；`captureMode` 在既有代码里只服务于 `Escape`（`:375`），因此 `PageUp`/`ArrowLeft` 等今天在框选模式下**仍然生效**。所以「captureMode」与「目标为 null」是本轮新增条件。
   要求：改写为「守卫沿用 `:385` 的两条；新分支自检 `readerStore.captureMode`；按钮 `disabled` 由「目标为 null」派生」，并注明这是本轮引入的行为差异（不是既有语义），否则按字面实现会让 `r12-3` ⑰ 变红。

4. **【理由错误，影响开放问题 1 的判断】§0.3 理由①「同 `start` 并列时预序最早者 = 该页最外层标题」在夹具第 3 页不成立。**
   证据：第 3 页并列集 = `2.2 Positional prior`（child 行）、`3. Ablation Study`（chapter 行）、`Appendix A.1`；「最早」取到的是 child 行，而 chapter 行也在 in-range 集合内（SAMPLE_MAP_EXPECT 第 3 页 current = 3 印证）。该理由只对第 2 页成立。
   要求：把理由改为「同 `start` 并列取预序最早 = 取最靠前分支（同一分支内祖先恒早于后代）」，并明确这是**分支优先**而非**层级优先**；若负责人本意是「最外层章节优先」，则并列口径应改为「深度最小」并同步更新 `smoke-view` `section-hit` #2/#3/#7、`r12-1` 第 2/3 页 chip 期望与 `r12-3` 跳转期望。

5. **【前置未冻结】`r12-4` 的字节相等断言依赖「无选区、无勾选笔记」，但该前置只在 §8 次级风险①里。**
   证据：`selectedText` 来自 `readerStore.selectedText`（`ChatPanel.vue:360`）、`reader_notes` 来自选择集（`ChatPanel.vue:355`）；现实中由 `enterCleanWorkspace`（`goHome` → `openDocument(null)` `WorkspacePage.vue:235`、`resetNotes` → `clearNoteSelection` `:239`）与 `openRow` 时的 `openDocument` 复位（`reader-store.ts:54-59`）保证，但场景表里没写、也没在 `data` 留现场。
   要求：在 `r12-4` 前置加一条明文（选择集与选区为空），并在两个相位的 `data` 里带上 `selectedText` / `notesCount`。

6. **【档内自相矛盾】「主进程零改动」与白名单第 5 行（改 `pix/src/main/reading-prompt.ts`）冲突。**
   证据：`pix/src/main/reading-prompt.ts` 属主进程；§0 判定工具表与 §5 验收都写「本轮不涉及（主进程零改动）」「本轮零改动的回归确认」。而实际上数据面无改动成立：`smoke-notes.mjs` 只驱动 `notes-store` / `library-root`，且全仓库无脚本读取提示词（仅 `session-bridge.ts:1245` 引用）⇒ 26 条回归结论本身不受影响。
   要求：改为「主进程**数据面**零改动；`reading-prompt.ts` 为唯一主进程改动」，避免走查判据被判红。

7. **【计数/位置口径错误，走查判据不可逐字执行】**
   证据：(a) N80-4 与白名单第 5 行的「其余 9 行逐字不动」：`reading-prompt.ts` 实际是 8 个数组元素（行 2-7、9、10；文件共 11 行，行 8 是注释），即除插入锚点行外是 **7** 个元素 / **10** 个物理行；(b) N80-2 「固定在 `pageCount: <n>` 之后、`selectedText:` 之前（即既有行序里的第 4 行）」：`pageCount:` 本身才是第 4 行，插入后的 `section:` 行是**第 5** 行。
   要求：改成可数口径（「数组元素 8 → 9，除 `:5` 外零 diff」「`section:` 恒为载荷第 5 行」）；顺带把 N79 的 `:388-419 switch` 更正为「`/` 在 `:386-390`、`switch` 在 `:393-417`」。

8. **【冻结完整性】新导出的签名与「禁用写法」判据不闭合。**
   证据：(a) N77-1 只给了 `resolveCurrentChapter` 的逐字签名；`resolveChapterNav`（N79 / 白名单第 1 行 / 烟测 `section-nav` 都在用）没有冻结签名或返回形状（`{ prev, next }` 还是二元组未定），`formatChapterHeading` 也只有模板没写参数/返回类型；(b) N77-1 的走查判据「`start <=` / `<= page` 形式的区间比较均为 0 处」抓不到 `page >= range.start`、`range.end >= page` 的写法或换名变量。
   要求：冻结 `resolveChapterNav(ranges, page, pageCount): { prev: ChapterRange | null; next: ChapterRange | null }`（或选定形状）与 `formatChapterHeading(range: ChapterRange): string`；把禁用写法改为语义判据（组件内除既有 `KnowledgeMap.isCurrent` 外不得出现 `ChapterRange` 的 `start`/`end` 比较，`PdfViewer` 必须消费 `outline-notes.ts` 的纯函数）。

## 设计评审（R12）

- 评审对象：`docs/pm/R12-design.md`（本轮新增，`git status --short` ⇒ `?? docs/pm/R12-design.md`；另 `?? docs/pm/R12-req.md` / `?? docs/pm/R12-review.md`；HEAD `c16135d`，工作树其余干净）。
- 评审方式：只读文件与只读命令（`grep` / `git`）+ 按真实代码复算夹具 + 只跑唯一工程门；本步不跑离屏取证与烟测。
- 本步实跑复核（全部为本次真实读数）：
  - `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（输出仅 `vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit` 横幅）。
  - 基线目录 `C:/Users/86157/AppData/Local/Temp/pix-v05-r11-lead/shots`：`MANIFEST.json` ⇒ `shots.length = 120`、`failure = null`；`MEASUREMENTS.json` ⇒ 长度 `169`、`label` 去重 `37`（设计档 §0.1 / §5.1 步骤 0b 的读数逐字成立；`shots/` 一级 122 条 = 120 png + MANIFEST + MEASUREMENTS）。
  - 设计档给出的行号抽样核对：`outline-notes.ts:37/50/84`、`PdfViewer.vue:341/356/357-372/375/380/385/386-390/393/414/415/424/650/651/664/669/671/673/800-807/922/931-941/943/1048/1051/1078/1082/1129/1145`、`ui-shot.mjs:212/230/260/293/368/373/375/1363/1364-1391/1442/1443/1483/1492/1493/2060/2062/2227/2250/2939-2952/3078/3091/3097/3947/4159-4162/4825/5220/6727/6728` 全部与实读一致；两处不符见 must-fix 5。

### 1. N77 命中规则在真实夹具上的推演（含 ties 与「页不在任何章节内」）

结论：**规则唯一、可判，逐页期望与设计档 §1.1.4 表逐字一致；ties 与边界均被真实数据覆盖，无需修**。

`SAMPLE_OUTLINE`（`ui-shot.mjs:260`，8 节点）按 `buildChapterRanges`（`outline-notes.ts:50`：只收 `page != null`；`end` = 预序中第一个页码严格更大的节点页码 − 1，无后继取 `pageCount`，再 `Math.min(end, pageCount)`；`label` = `end > start` 时 `${start}-${end}` 否则 `String(start)`；键 `${parentKey}/${index}`）复算，插入序 = 预序：

| 序 | key | title | start | end | label |
| --- | --- | --- | --- | --- | --- |
| 1 | `root/0` | `1. Abstract` | 1 | 1 | `1` |
| 2 | `root/1` | `2. Method Overview` | 2 | 2 | `2` |
| 3 | `root/1/0` | `2.1 Sparse mask budget` | 2 | 2 | `2` |
| 4 | `root/1/1` | `2.2 Positional prior` | 3 | 3 | `3` |
| 5 | `root/2` | `3. Ablation Study` | 3 | 3 | `3` |
| — | `root/2/0` | `Appendix A`（`page: null`） | 不进 `ranges` | — | — |
| 6 | `root/2/0/0` | `Appendix A.1` | 3 | 3 | `3` |
| 7 | `root/2/1` | `Appendix B` | 2 | 3 | `2-3` |

逐页命中（`start ≤ page` 且 `start` 最大，同 `start` 取插入序最早）：

- 第 1 页：候选 `{root/0}` ⇒ 命中 `root/0` ⇒ `1. Abstract · 第 1 页`；`prev = null`（无 `end 1 < 1` 的项）；`next` = `start > 1` 中 `start` 最小者 = `2`，并列 `{root/1, root/1/0, root/2/1}` 取最早 ⇒ `root/1` `2. Method Overview`（第 2 页）。
- 第 2 页：候选 `{root/0(1), root/1(2), root/1/0(2), root/2/1(2)}`，最大 `start = 2`，并列取最早 ⇒ `root/1` `2. Method Overview · 第 2 页`（不是 `2.1`、不是逆序书签 `Appendix B`）；`prev` = `end < 2` 中 `end` 最大者 = `root/0`（`1. Abstract`）；`next` = `start > 2` 中 `start` 最小者 = `3`，并列 `{root/1/1, root/2, root/2/0/0}` 取最早 ⇒ `root/1/1` `2.2 Positional prior`。
- 第 3 页：7 项全为候选，最大 `start = 3`，并列 `{root/1/1, root/2, root/2/0/0}` 取最早 ⇒ `root/1/1` `2.2 Positional prior · 第 3 页`（chapter 行 `3. Ablation Study` 在 in-range 集合内但非最早；`SAMPLE_MAP_EXPECT.read.page3.current = 3`（`ui-shot.mjs:230`）印证）；`prev` = `end < 3` 中 `end` 最大者 = `2`，并列 `{root/1, root/1/0}` 取最晚 ⇒ `root/1/0` `2.1 Sparse mask budget`（第 2 页）；`next = null`。
- `long-book.pdf` 第 1 页（`LONG_BOOK_OUTLINE`，`ui-shot.mjs:293`，`page = 1 + 3k`，章/节/子节同页）：`start ≤ 1` 的项为 `root/0`（`Chapter 01`）与其 10 节 + 10 子节（同 `start = 1`），取插入序最早 ⇒ `Chapter 01`；`next` = `start > 1` 中最小 `start = 4`（第 2 章及其 20 个后代）⇒ 最早 = `Chapter 02`（第 4 页）。
- 边界「页不在任何章节内」：由 `end` 定义可证它等价于 `page < min(start)`（区间之间无空洞），设计档 §1.3.4 的「早于第一节 ⇒ 上一节禁用、下一节 = 第一节」正好覆盖；`SINGLE`（`start = end = 3`）第 3 页 ⇒ `prev = next = null`；第 1 页 ⇒ 命中 `null`、`next = 该节`。全部由烟测 + §1.1.4 表封住。
- 命中项恒满足 `start ≤ page ≤ end`（设计档 §1.1.5 性质②）在真实 `buildChapterRanges` 上可直接证明：设命中项 `start = a` 为满足 `start ≤ page` 的最大者，若 `end < page`，则 `end + 1` 必是某节点的页码（否则 `end = pageCount` 而 `page ≤ pageCount` 矛盾），该节点自身是 `start' = end + 1 > a` 且 `start' ≤ page` 的候选，与 `a` 最大矛盾。
- 反向判据可用：实跑 `grep -rnE "\.(start|end)[[:space:]]*(<=|>=|<|>)|(<=|>=|<|>)[[:space:]]*[a-zA-Z_.]*\.(start|end)" pix/src/renderer/components/` 命中恰为 `KnowledgeMap.vue:167`（注释）/ `:169`（`isCurrent`）/ `:174`（`isRead` 函数体）/ `PdfSearchPanel.vue:268`（搜索分段）⇒ 设计档 §1.1.6 #3 的集合逐字正确（§5.4 #3 有笔误，见 must-fix 3）。

已接受的观察项（非缺陷，不必修）：`buildChapterRanges` 的 `label` 用 `String(start)`（`end > start` 为假时），因此逆序书签 `Appendix B` 得到 `2-3` 而不是 `2`——与地图 `.page-badge` 同源，符合 §0.2 第 5 条；书签页码理论上大于 `pageCount` 时（真实 pdf.js 不会发生）`next` 会给出域外目标，`gotoPage` 消费端 `scrollToPage` 找不到页元素即静默不动，与地图节点点击同通道同表现，不需要额外判据。

### 2. N78 的 DOM 与样式（位移 / 门控 / 截断）

结论：**宿主选择与门控正确、零位移可达；截断策略未写死为固定阈值之外的东西（chip `max-width: 360px` + 单行省略 + `min-width: 0`），一处归因措辞需改（must-fix 5c）**。

- 真实类名与 CSS（不得改写，设计档引用正确）：`PdfViewer.vue:922` 容器 `.pdf-page-indicator`（`v-if="readerStore.pageCount > 0"`）、`:943` `.page-label`（`title="点击输入页码"`）、`:935` `.page-input`、CSS `:1129`（`position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 3; display: inline-flex; gap: 2px; padding: 2px 6px; border-radius: 999px; background: rgba(31,41,51,0.78); font-size: 12px`）、`:1145` 禁用态 `opacity: 0.45`；`.pdf-toolbar:968`（`z-index: 3`）、`.pdf-capture-fab:1078`（`z-index: 6`）、`.capture-layer:1048`（`z-index: 5`）。设计档 §0.3 冻结的 `z-index: 3` 与「低于 capture-layer」成立（框选拖拽层照旧压在控件之上）。
- 不挤位移：`.pdf-viewer:959` 是 `position: relative` 的 flex 列容器，新容器作为 `.pdf-page-indicator` 之前的兄弟节点且 `position: absolute` ⇒ **不入 flex 流**，`.pdf-page-indicator` / `.page-label` / `.pdf-toolbar` / `.pdf-capture-fab` 四个选择器几何不变（§5.2 的 `±1px` 判据可达；`r12-2` ⑤ 用 `pillProbe()` 四选择器跨文档读数，比较前提「两次 `.zoom-label` 均 `100%`」在两个新开文档上都成立，因为 `enterCleanWorkspace` 已清 `reader-state.json`）。
- 垂直不重叠：`.page-label` 12px × `--pix-leading-base: 1.6`（`variables.css:82`、`main.css:22` 挂在 `html, body` 上）= 19.2 + `padding 2px×2` = 23.2；`v-btn` 侧 `VBtn.css:27-33` 的 `--v-btn-height: 20px`（x-small）+ `:71` 的 comfortable `+0px` ⇒ pill 高 ≈ 23.2 + 容器 padding 4 ≈ 27.2，`bottom: 12px` ⇒ pill 顶 ≈ viewer 高 − 39.2；新容器 `bottom: 46px` ⇒ 底边 ≈ viewer 高 − 46，间隙 ≈ 6.8px ⇒ `section.bottom ≤ indicator.rect.y + 1` 在 pill 高至 ≈ 34px 时仍成立。设计档的算术与判据自洽。
- 宽度：「容器宽度 < `.pdf-viewer` 宽度」结构上成立，但**不是** `max-width: calc(100% - 24px)` 的功劳：绝对定位 + `left: 50%; right: auto` 的可用宽已 = 容器宽 − 50% = 50%·viewer，故实际宽度 ≤ 50%·viewer。判据不受影响，措辞按 must-fix 5c 修正。另：`.v-btn { flex-shrink: 0 }`（`VBtn.css:22`）保证按钮不被压缩，chip 的 `min-width: 0` 是省略号生效的必要条件，设计档 §1.2.3 已冻结，正确。
- 可见性门控三态一致：① 无 outline（`older-paper.pdf`，`writeFixtures()` 不写书签 ⇒ `getOutline()` 空 ⇒ `PdfViewer.vue:671` 走 `: []`，且 `openDocument`（`reader-store.ts:59`）复位 `outline`）⇒ `ranges.size = 0` ⇒ 三值皆 `null` ⇒ 容器不进 DOM（不是 `display:none`）；② 文本文件：`ReaderPanel.vue:222` 的 `<div v-else-if="isPdf && filePath" class="reader-pdf">` 只在 PDF 时挂 `PdfViewer`，`.md`/`.txt` 走 markdown 分支 ⇒ 新控件不可能出现；③ 无文档：`ReaderPanel.vue` 的 `v-if="!filePath"` 分支同理不挂 `PdfViewer`，且 `pageCount = 0` 时 `onWindowKeydown` 在 `:385` 早退。
- 截断：chip 文本 = `title` 属性 = `formatChapterHeading` 同源（设计档冻结），CSS 只影响像素；`pointer-events: none` 使 chip 的 hover tooltip 不可弹，设计档 §1.2.3 已登记为既有冻结（要求档 §0.5 同样冻结 chip 继承 `none`）⇒ 判据仍只判 `textContent === title`，一致。
- 长标题不撑满：`overflow: hidden; white-space: nowrap; text-overflow: ellipsis` + `max-width: 360px` 是写死的（不是按内容自适应）；`r12-1` `invariance` 相位只判文本（开地图后中心栏变窄），与 §6 次级风险 3 一致。

### 3. N79 快捷键与既有键位全集

结论：**`[` / `]` 与既有键位零冲突；输入框与框选模式的守卫成立；PDF 搜索面板不设守卫是要求档冻结的刻意行为（与既有七键位一致），不是缺陷**。

- 全仓 `keydown` 面（实读 `grep`）：窗口级仅 `PdfViewer.vue:424` 一处 `window.addEventListener("keydown", onWindowKeydown)`（注册由 `:430-434` 的 `watch(pageCount > 0)` 驱动，卸载时 `:834` `setKeydownListener(false)`），分支顺序为 `:357-372` 修饰键早退（内含 `:360-370` `Ctrl+F`）、`:375` `Escape && captureMode`、`:380` `Escape && searchOpen`、`:385` 守卫（`pageCount <= 0 || isEditableTarget(event.target)`）、`:386-390` `/`、`:393-414` `switch(event.key)`（`PageUp`/`ArrowLeft`、`PageDown`/`ArrowRight`、`Home`、`End`），函数于 `:415` 收口。组件级（均不在冒泡链上抢 `[`/`]`）：`InputArea.vue:29`（Enter）、`ChatPanel.vue:1135`（Enter）、`NotesPanel.vue:436`（Esc）、`PdfSearchPanel.vue:407`（Enter）、`PdfViewer.vue:939/940`（页码输入框 Enter/Esc）、`SettingsPage.vue:482`（Enter）；全仓无 `key === "["` / `"["` 绑定（`grep` 无命中）⇒ 新键位不会覆盖或劫持任何既有行为，既有七键位分支零 diff 可达。
- 守卫覆盖：输入框/文本域/下拉/`contenteditable` 由 `:341` `isEditableTarget`（全文件唯一使用点 `:385`）覆盖；`.page-input`（`PdfViewer.vue:931-941`）与 composer `.input-area`（`InputArea.vue:52` 的原生 `<textarea>`）都在其内。框选模式由新分支自检 `readerStore.captureMode`——既有 `:375` 只拦 `Escape`，故「既有七键位在框选模式仍生效、`[`/`]` 不生效」的差异登记（§2.1）与真实代码一致。PDF 搜索面板（`PdfSearchPanel.vue:401` 的 `.search-input` 是原生 `<input>`）：输入框获焦时被 `isEditableTarget` 拦下；面板打开但焦点不在输入框时 `[`/`]` 会生效——这与既有七键位（`PageUp` 等）在 `searchOpen` 下的行为完全一致，设计档 §1.3.2 规则 3 已明文禁止新增 `searchOpen` 条件 ⇒ 结论：已登记的一致行为。
- 落点与副作用：新分支位于 `:385` 之后、`:393` 之前（`/` 分支在 `:386-390`，插在它之前或之后都满足冻结表述，按键空间不重叠，无需二选一），`preventDefault` + 单一写入点 `jumpToChapter`（§1.3.3）与既有 `gotoPage` watcher（`:800-807`）闭环，`reader-store.ts` 零 diff 可达（`gotoPage`/`outline`/`captureMode`/`pageCount` 均已存在，`reader-store.ts:29-35`、`:125`、`:59`）。

### 4. N80 逐字格式与既有载荷断言的破坏面

结论：**格式逐字可判、插入点与现有实现一致；既有断言**无一条**会因新行变红；但设计档把 43 的「骨架」硬断言也追加了新行，引入了一个未登记的就绪依赖（must-fix 1）**。

- 逐字格式与现状（`reading-context.ts:77-96`）：`lines` 初始数组 4 行 + 可选 `selectedText:` 块 + 可选 `reader_notes:` 块 + `</reading_context>` + `""` + `userText`；`!ctx.filePath` 早退在 `:78`。设计档 §1.4.3 的插入点（`lines` 初始化之后、`selected` 之前）确实只新增 `if (chapter) lines.push(...)` 一行 ⇒ 既有 push 字面零 diff，「不可解析时逐字节等于旧格式」成立；`section:` 恒为载荷第 5 行（`pageCount:` 的行号固定为 4）与要求档修订 7 一致。
- 既有断言清单（实读，判定见右列）：

| 断言 | 位置 | 是否受影响 | 依据 |
| --- | --- | --- | --- |
| 42d「无文档 ⇒ 载荷逐字等于输入」 | `ui-shot.mjs:3642`（`noDocPayload.message === T42D`） | 否 | `!ctx.filePath` 早退，与 `<reading_context>` 无关 |
| 42c r7 骨架 / `path:` 行 | `:3556-3589`，唯一 `split("\n")` 在 `:3560` | 否 | 全为 `includes` + `path: ` 前缀 `find` |
| 42c 级联（排除文档 chip） | `:3505` / `:3546-3553` | 否 | `includes("<reading_context>") === false` |
| 43 record `missing`（12 条 needle） | `:3673-3686` | 否（只增字段内容） | `missingLines`（`:2953`）是包含式，且 `missing` 只是 record 字段 |
| 43 骨架硬断言（4 条 needle） | `:3698` 条件 + `:3700` 失败文案 | **条件会多依赖 outline 就绪**（设计档要追加第 5 条） | 见 must-fix 1 |
| 35 `confirmed35B` 模拟确认串 | `:2829`（`runTurn` 第 3 参，`:2832`） | 否（同步 / 不同步都不改变断言） | 锚点在发送时刻登记（`ChatPanel.vue:355/356/377`），`displayText` 与载荷无关 |
| 44/45/52/62/63 与 r11-* 载荷判据 | — | 否 | 均为 `includes` 形式；全文件 `grep -n "message ==="` 只在 `:3642` 命中（另 `:538` 是 stub 里 `command.message === "string"` 的无关命中） |
| 系统提示词文本 | 无脚本断言 | 否 | `grep` 全仓该字面只在 `reading-prompt.ts`（`session-bridge.ts:53` import、`:1245` 使用） |

- `reading-prompt.ts` 实读：11 行、8 个数组元素（行 2–7、9、10；行 8 是注释），`:5` 逐字 `\t"Use pdf_outline for bookmarks and page numbers.",`（缩进为制表符），插入后 `].join("\n")` 后移至 `:12` ⇒ 设计档 §1.4.5 的「数组元素 8 → 9 / 单 hunk / 行号后移」逐字可实现。
- `ChatPanel.vue`：`readContext` 在 `:356-362`（`filePath`/`page`/`pageCount`/`selectedText`/`notes`），唯一调用点 `:377`，`outline` 由 `reader-store.ts:29` 的 ref 与 `:125` `setOutline` 写入、`:59` 复位 ⇒ 「新增一行 `outline: readerStore.outline`」链路闭环，必填字段的编译期护栏成立（全仓 `buildReadingUserMessage` 仅此一个调用点）。

### 5. N81 可构造性（helper / 烟测编译入口与产物 require 路径）

结论：**离屏场景引用的既有原语逐一存在（照抄原名可用），烟测编译面与产物路径逐字可用；缺一个点击原语的口径冻结（must-fix 4）**。

- 既有原语实读：`enterCleanWorkspace:3078`、`openRow:1483`、`waitPdfLoaded:1442`、`waitPage:1443`、`clickNext:1492`、`clickPrev:1493`、`typeAndSend:2227`、`setDraft:2216`、`notesHash:2062`、`clearSendCalls:2940`、`lastSend:2945`、`waitSendCalls:2952`、`rectOfSelector:2250`、`openNotesPanel:3091`、`restoreStandardSeed:3097`、`openMap:3947`、`ensureMapOpen:4825`（「已开时不得再点」的原注释在 `:4824`）、`pressBodyEsc:5220`、`capturePage:1040`、`record:1381`、`waitFor:1368`（`sleep(120)` 在 `:1376`）、`has:1390` / `countOf:1391` / `textOf:1386`、`js:1364`；`SEL.zoomInBtn:83`、`SEL.captureFabBtn:87`、`SEL.captureLayer:88`、`SEL.mapSlot/mapToggle/mapEmpty/mapProgress`、`SEL.tabLibrary`、`SEL.noteRow`；`LIBRARY_DIR:36`。`SEL` 插入点 `:91 noteText` / `:92 };` 与设计档一致，新增 8 项与既有键名零重名（既有 SEL 无 `readerSection*` / `pageIndicator` / `pageInput` / `readerMain` / `composerInput`）。函数收口 `:6728`、最后一条语句 `:6727` 逐字一致（r11-6 末的 `await restoreStandardSeed();`）。
- 缺项：设计档步骤里的「点 `SEL.readerSectionNext` / `SEL.zoomInBtn` / `.page-label` / `SEL.captureFabBtn`」没有可选原语——`click` 只定义在另一个函数 `runScenario`（`ui-shot.mjs:1062`），`runReaderStateScenarios`（`:1363-6743`）内没有该名字；且 §1.6.4 相位①的 `js('document.querySelector(SEL.composerInput).focus(), true')` 写法把 Node 侧常量 `SEL` 直接写进页面上下文（既有范式一律 `JSON.stringify` 插值，如 `:6197-6204`、`:2230-2236`）。⇒ must-fix 4。
- 烟测编译面（对照 `smoke-notes.mjs:478-523`）：`TSC_JS = node_modules/typescript/lib/tsc.js` + `spawnSync(process.execPath, [TSC_JS, "-p", TSCONFIG], { cwd: PIX_DIR })` + `createRequire(import.meta.url)` + `readdirSync(OUT_DIR, { recursive: true, withFileTypes: true })`（用 `entry.parentPath` 归一化）的范式可照抄；`rootDir = pix/src` ⇒ 三个源文件的产物路径 `out/renderer/utils/{outline-notes,notes-path,reading-context}.js` 与设计档逐字一致（`out/shared/types.js` 为允许附带）；`pix/node_modules/@types/node` 存在（`types: ["node"]` + `typeRoots` 可用）；三文件依赖仅 `@shared/types`（type-only，`outline-notes.ts:11`、`notes-path.ts:8`、`reading-context.ts:9`）与 `./notes-path`（`outline-notes.ts:12`）⇒ `baseUrl` + `paths` 的 `@shared/*` 映射是必需的，设计档已写；`reading-context.ts:142` 用 `window`（`target: ES2022` 默认含 DOM lib）不阻塞；`pix/tsconfig.json` 的 `include` 只含 `src/renderer/**` 与 `src/shared/**` ⇒ 新脚本与 `ui-shot.mjs` 同待遇，不进唯一工程门；`pix/package.json` 现有 `smoke:notes`（`node scripts/smoke-notes.mjs`）且无 `smoke:view` ⇒ 新增键名不冲突。
- 配额自洽：`record` 组数 5/2/7/2 = 16、截图 3+1+2+1 = 7、烟测 8/8/8/5 = 29；基线 120/169/37（本步实测）⇒ 设计档的验收读数 127/185/41 逐字可达；`smoke-notes.mjs` 的 `check(` 实读 26 处，与「26 条」一致。

### 6. 白名单一致性与受影响文件面

结论：**§4 的九项与要求档 §7 一一对应，无遗漏；`KnowledgeMap.vue` 零 diff 可达；ChatPanel → reading-context 的取值链路闭环**。

- 新控件宿主在 `PdfViewer.vue` 内 ⇒ 不需要 `ReaderPanel.vue`（其 `.reader-main:346` 只作为截图区域选择器被只读引用）；`KnowledgeMap.vue` 只被新 helper 只读（`.map-row.current` × `.label` 在 chapter 行 `:253` 与 child 行 `:292` 都存在，故 `mapCurrentLabels()` 可用；第 3 页 `.current` 行恰 3 行 = `2.2 Positional prior` / `3. Ablation Study` / `Appendix B`，与 `r12-1` ⑬ 的两项包含断言一致）；`reader-store.ts` 零 diff 可达（无需新字段）。
- 范围外文件均未被要求改动：`packages/**`、`package-lock.json`、`pix/tsconfig*.json`（实读 `tsconfig.main.json` 的 `include` = `src/main/**` + `src/shared/**`、`tsconfig.preload.json` 的 `files` = `src/main/preload.ts`，均不含 `scripts/**`）、`src/main/{ipc-handlers,preload,notes-store,library-root,reader-state-store,session-bridge}.ts`、`src/shared/types.ts`（`ReaderOutlineNode` 已存在，`:318-322`）。
- 未列入但应登记的既有面（非阻断，见 must-fix 6）：既有 120 张截图里凡含 `sample-paper.pdf` 阅读器画面者，内容都会多出这一行控件；§5.2 的零缺失判据是 basename / label 集合，不覆盖内容差异。
- 稳定性观察（非缺陷）：设计档把 4 个新场景的 helper 全部追加在 `runReaderStateScenarios` 末尾（`:6727` 之后），而既有 43 场景位于此前 —— 同一函数体内后置 `const` 存在 TDZ，任何想「顺手」在 43 里调用 `waitSectionReady()` 的写法都会抛 `ReferenceError`（must-fix 1 的修法已按此约束给出）。

## must-fix 清单（设计档）

1. **【竞态，最高】43 场景的骨架**硬断言**追加 `section:` 之前必须补就绪同步（或不动骨架列表）。**
   证据：页码可见严格早于章节派生（`PdfViewer.vue:650` `setPageCount` → `:664` `scrollToPage`，之后才有 `:669` `getOutline` → `:671` `convertOutline` → `:673` `setOutline`），`waitFor` 轮询 120ms（`ui-shot.mjs:1376`）；43 场景（`:3647-3711`）在 `waitPage(2, 3)` 之后只做 composer 写值 / 选区 / 笔记面板动作就发送，没有任何 outline 就绪等待。§2.2 #3 把 `"section: 2. Method Overview · 第 2 页"` 追加进 `:3698` / `:3700` 的两份 **4 项硬断言列表**（四处文本），一旦 outline 落地晚于发送，该既有断言会因新行缺失而判红——这违反设计档自己在 §0 定稿修订 1 立下的「四个场景前置必须区分两条就绪路径」纪律。
   要求（二选一，并在档内写死）：(a) 在 43 的 `clickNext()` / `waitPage(2, 3)` 之后追加一条就地等待，用既有 `waitFor` + `JSON.stringify(SEL.readerSection)`（不得调用后置定义的 `waitSectionReady()`——同一函数体内后置 `const` 存在 TDZ）；或 (b) 只把新 needle 追加到 `:3674-3685` 的 record `missing` 字段，`:3698` / `:3700` 的骨架列表保持 4 项（要求档只要求「各追加一条」，若取 (b) 须在档内登记与要求档的偏差）。

2. **【空断言】§1.6.2 `invariance` ⑫ 的「防空断言」不成立，需给出真实证据。**
   证据：只在「放大 → 缩小」两次点击**之后**读一次 `pillProbe().zoomText` 并断言 `100%`，在两次点击均未生效时读数同样是 `100%` ⇒ 无法「证明缩放确实发生过」。既有范式（22 号场景 `:1714-1731`）是用 `.pdf-page` 宽度 ≈ `595 × scale` 反证缩放生效。
   要求：在 `SEL.zoomInBtn` 点击后、缩小点击前补一次读数并断言（`reader-store.ts:136-139` 的 `setScale` 两位取整 ⇒ 期望 `110%`），或改判 `.pdf-page[data-page="1"]` 的宽度；`data` 字段相应补 `zoomAfterIn`。

3. **【判据假红】§5.4 走查 #3 的 `KnowledgeMap.vue` 行号集合与实读（及 §1.1.6 #3）不符。**
   证据：实跑 `grep -rnE "\.(start|end)[[:space:]]*(<=|>=|<|>)" pix/src/renderer/components/` ⇒ `KnowledgeMap.vue:167` / `:169` / `:174` 与 `PdfSearchPanel.vue:268`（`:173` 是 `function isRead(row: MapRow)` 签名行，不含比较）。§5.4 #3 写成 `{167/169/173}` 并按「任何其它新增命中即判红」执行时，会把真实命中 `:174` 判成新命中。
   要求：把 §5.4 #3 的集合统一为 `167/169/174` + `PdfSearchPanel.vue:268`（与 §1.1.6 #3 逐字一致）。

4. **【实现口径】冻结一个点击原语并统一 `SEL` 插值写法。**
   证据：`click` 只定义在 `runScenario`（`ui-shot.mjs:1062`），不在 `runReaderStateScenarios`（`:1363-6743`）作用域内，而 §1.6.2–§1.6.5 多处以「点 `SEL.readerSectionNext` / `SEL.zoomInBtn` / `.page-label` / `SEL.captureFabBtn`」描述步骤；§1.6.4 相位①又把 `js('document.querySelector(SEL.composerInput).focus(), true')` 写成字面 `SEL`（页面上下文不存在该标识符，`ReferenceError`）。既有范式一律 `JSON.stringify` 插值（`:6197-6204`、`:2230-2236`）。
   要求：在 §0.3 / §1.6.1 冻结 `clickEl(selector)`（`js(\`document.querySelector(${JSON.stringify(selector)}).click(), true\`)`）；把 §1.6.4 的字面 `SEL` 改为插值写法；并在 §1.6 明写「新 helper 一律 `JSON.stringify` 传选择器/文本，不得把 Node 侧常量名写进页面字符串」。

5. **【档内口径不一致】三处文档级错误需更正（否则走查会假红或多算一行）。**
   (a) §0.1 行号：`runReaderStateScenarios` 起 = `ui-shot.mjs:1363`（档内写 1341，与同行的 `:1364 js` 自相矛盾；要求档写 1363 正确）；`KnowledgeMap.vue` 的 `chapterRanges` computed = `:48`（档内写 `:64`，`:64` 实为 `progressText` 里的 `const { page, pageCount } = readerStore;`）。
   (b) `ChapterRange` 类型 import：§1.2.5 #1 期望 diff「import 一行」，§1.3.3 又写「与 `buildChapterRanges` 同一个 `import` 语句内的 `import type`」；`jumpToChapter(target: ChapterRange | null)` 需要该类型，仓库既有范式是**独立一行** `import type { … } from "../../utils/outline-notes"`（`KnowledgeMap.vue:15-16`）⇒ 应冻结为「value import 一行 + `import type { ChapterRange }` 一行」，并把 §1.2.5 #1 的期望改为「import 两行」。
   (c) §1.2.3 「`max-width: calc(100% - 24px)` 是宽度严格小于 `.pdf-viewer` 宽度的结构性保证」归因不准：abspos + `left: 50%; right: auto` 的可用宽已 = 50%·viewer，真正的结构保证来自 `left: 50%` + `transform`，`max-width` 只是补充上界（结论——判据成立——不变）。

6. **【登记项】既有截图的内容变化与一处措辞需在档内写明。**
   证据：新增控件会出现在所有含 `sample-paper.pdf` 阅读器的既有截图中，而 §5.2 的零缺失判据只比 basename / label 集合，`§8` 只要求目视 7 张新图；另 §0.1 写「`grep -n "message ===" 仅命中 :3642`」，实读还有 `:538`（stub 内 `typeof command.message === "string"`，与本轮无关）。
   要求：§5.2 / §8 增一句「既有截图内容新增一行控件属预期，dev 档按文档分类抽样登记（或逐张登记）确认无重叠/截断/遮挡」；§0.1 该行改为「章节载荷判据处仅 `:3642`；另 `:538` 为 stub 内部的无关命中」。

**结论：revise**（设计主体可用：N77 规则与夹具逐页可复现、N78/N79 的落点与守卫与真实代码自洽、N80 的逐字格式与插入点正确且不撞既有断言、N81 的既有原语与编译产物路径逐字可用；但 must-fix 1（新硬断言的竞态）、2（空断言）、3（判据假红）会直接影响本轮判定的正确性，4–6 为实现/登记口径，宜在开工前一并修正后再进入开发步）。

## 代码审查（R12）

- 审查对象：R12 交付的工作树（`HEAD c16135d` 上的未提交改动）+ `docs/pm/R12-dev.md`；对照 `docs/pm/R12-req.md`（含 §0 定稿修订 8 条）与 `docs/pm/R12-design.md`（含定稿修订 6 条）。
- 审查方式：冷启动独立复验，不复用交付方结论与产物 —— 只读文件 / `git status|diff|show`（只读）、自带临时目录的离屏取证、自带编译面与自带夹具抽取的纯函数脚本、仓库内两个烟测、以及**只落在 `%TEMP%` 副本上**的故障注入（仓库文件未改）。本步唯一写操作是追加本档；一次性脚本与故障副本均已删除。
- 一句话结论：**功能面在我方独立复验中全绿（16 条新 record 逐条复算、7 张新图齐备、既有 120 张 / 169 条零缺失、两个烟测 29+26 全绿、`check` 0 error）；唯一必须修的是 `ReadingSendContext.outline` 仍为可选字段、与冻结契约不符（修法一行）。**

### C1. 实跑证据（全部为本次真实读数）

| # | 命令 | 读数 |
| --- | --- | --- |
| 1 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` | `CHECK_EXIT=0`（输出仅 `> pix-read@0.1.0 check` 与三行 tsc 横幅） |
| 2 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r12-review" ./node_modules/.bin/electron scripts/ui-shot.mjs` | `[ui-shot] 结束：产出 127 张截图`、`UI_SHOT_REVIEW_EXIT=0`；`MANIFEST.json` ⇒ `shots.length = 127`、`failure = null`；`MEASUREMENTS.json` ⇒ 185 条、label 去重 41；`shots/` 一级 129 项 = 127 png + `MANIFEST.json` + `MEASUREMENTS.json`（另做磁盘↔清单双向比对：`missingFromDisk = 0`、`missingFromManifest = 0`） |
| 3 | 零缺失比对（基线 `C:/Users/86157/AppData/Local/Temp/pix-v05-r11-lead`） | `{"base":120,"after":127,"missing":[],"added":[7 张]}`，`added` 逐字 = `r12-1-section-chip-page1.png` / `r12-1b-section-chip-page2.png` / `r12-1c-section-chip-page3.png` / `r12-2-no-outline-degrade.png` / `r12-3-section-nav-after-next.png` / `r12-3b-section-nav-shortcut-prev.png` / `r12-4-section-context-sent.png`；`{"baseLabels":37,"afterLabels":41,"missingLabels":[]}`（按 label 计次，逐 label 不减少） |
| 4 | 16 条新 record 逐条独立复算（直接从自有 `MEASUREMENTS.json` 的 `data` 复算，不看交付方断言实现） | 42 条子检查全绿：chip 文本 = `title` 且三页逐字命中；`prevDisabled/nextDisabled` 三页为 `true/false → false/false → false/true`；容器与 pill 同一居中轴（中心差 ≤1px）、间距 7px（`containerBottom 943 ≤ indicatorTop 950 + 1`）；容器宽 165 < viewer 宽 912；`pointer-events` = `none` / `auto` / `auto`；`invariance` 五次读数逐字节相等、`zoomAfterIn 110%` → `zoomBack 100%`、`currentLabels = ["2.2 Positional prior","3. Ablation Study","Appendix B"]`；`page-input` 提交 99 后仍 `第 3 / 3 页` 且 chip 不漂移、提交 2 后 chip 同步；`no-outline` 派发前/后容器与 chip 均不在 DOM、页码前后均 `第 1 / 2 页`、`hashSame = true`；`zero-displacement` 四选择器 `x/y/width/height` **全 0**（≤1px 判据）、两端 `zoomText` 均 `100%`、`pageTexts` 为 `第 1 / 2 页 ↔ 第 1 / 3 页`；导航/快捷键六相位的落页与禁用态逐条命中；`guard-editable` 的 `targets = {INPUT, TEXTAREA}`、`pageInputValue = "1"`；`guard-capture` 模式内 `第 1 / 3 页`、退出后 `第 2 / 3 页`；`with-section` 载荷 8 行且 `section:` 恒为第 5 行、删行后等于由同一载荷逐行重建的旧格式；`without-outline` 载荷 7 行、不含 `section:` |
| 5 | 独立纯函数脚本（自建 tsconfig 编译**仓库内** `outline-notes.ts` / `notes-path.ts` / `reading-context.ts` 到自己的 `%TEMP%` 目录；`SAMPLE_OUTLINE` 由 `pix/scripts/ui-shot.mjs` 源码文本抽取，`LONG_BOOK_OUTLINE` 按 `:303-317` 的定义重建） | 52 条断言全绿：`ranges.size = 7` 与七项字段手写期望逐项相等；三页命中 = `1. Abstract` / `2. Method Overview` / `2.2 Positional prior` 且 `start ≤ page ≤ end`、`ranges.get(hit.key) === hit`、命中的 `start` = 候选集最大 `start`；第 3 页并列集 = `[root/1/1, root/2, root/2/0/0]`（取最早 ⇒ child 行 `2.2`；反证：取「更晚者」会得到 `Appendix A.1`）、第 3 页 in-range 集合 = `[root/1/1, root/2, root/2/0/0, root/2/1]`（命中 ∈ 该集合）；三页导航 = `null/2. Method Overview`、`1. Abstract/2.2 Positional prior`、`2.1 Sparse mask budget/null` + 两条不变量；`long-book` 第 1 页 = `Chapter 01`、next = `Chapter 02`；六种不可解析（+非整数/越界）恒 `null` 且不抛错；**载荷字节等价**四例（`outline = []`、全 `page === null`、`pageCount = 0`、`page = 9`）在 `selectedText` 与 `reader_notes` **同时存在**时逐字节等于手写旧格式；可解析时恰多一行、位置第 5 行、删行后 `===` 旧格式；`filePath: null` 原样早退 |
| 6 | `node pix/scripts/smoke-view.mjs`（连续两次） | `通过 29 / 失败 0`，退出码 0（两次一致） |
| 7 | `node pix/scripts/smoke-notes.mjs` | `通过 26 / 失败 0`，退出码 0 |
| 8 | 故障注入（`%TEMP%` 副本，仓库文件零改动；副本已删） | ① 把 `section-hit` #2 的手写期望改成 `2.1 Sparse mask budget` ⇒ `[失败] section-hit #2 …：{"key":"root/1","title":"2. Method Overview",…}` + `通过 28 / 失败 1` + 退出码 1；② `TSC_JS` 指向不存在路径 ⇒ `typescript 编译失败（status=1），不进入断言` + `通过 0 / 失败 0` + 退出码 1 ⇒ 烟测对命中规则确有判别力、失败打印实际值、编译面失败不进入断言 |
| 9 | `sha256sum pix/scripts/smoke-view.mjs` | `c9d18797bd4041e49dd4a4630e9234d4c496f6e44acd5bd901254a750bdc0c86`（与 dev 档 §4.5 登记值逐字一致 ⇒ 交付方「注入后按字节还原」可被独立确认） |
| 10 | 稳定性 | 本次单次离屏绿；日志 `r11-3 相位 4 入口前置：ok=true attempts=1`、相位 5 `attempts=2`（R11 的有界重取真实触发一次、未变红） |

### C2. 验收逐条结论（对照 R12-req N77–N81 与 §0.5 / §0.6）

| 条目 | 判据（需求档） | 本次结论 |
| --- | --- | --- |
| N77-1 唯一实现与签名 | 三个导出、`buildChapterRanges` / `countNotesByChapter` / `collectPreorder` 零 diff、组件不得出现第二份区间比较 | 通过：`git diff` 纯新增（`+64 / −0`）；`grep -c "^export function"` ⇒ 5；正向 grep 命中 `PdfViewer.vue`（`:72/:74/:77`）+ 既有 `KnowledgeMap.vue:48`；反向区间比较命中集合恰为 `KnowledgeMap.vue:167/169/174` + `PdfSearchPanel.vue:268`（⊆ 允许集合）；三个签名逐字与设计档 §1.1.1 一致 |
| N77-2 命中规则（含 ties） | 见 §0.3；夹具三页逐字 | 通过：见 C1#5（含并列取最早、逆序书签不劫持、非最早项反证） |
| N77-3 不可解析与总不变量 | 六情形 `null`、非 `null` 时恒 `start ≤ page ≤ end` | 通过：六情形逐一实测 `null` 且不抛错；三页 + `long-book` 的不变量成立 |
| N78-1 控件与字面 | 类名 / 顺序 / `title` / 图标 / chip 文本 = `title` | 通过：模板逐字落地（`.reader-section-prev` → `.reader-section-chip`（`v-if`） → `.reader-section-next`；`title` 逐字 `上一节（快捷键 [）` / `下一节（快捷键 ]）`；`mdi-chevron-double-left/right`）；实测 `chipText === chipTitle` 逐字 |
| N78-2 实时一致 | 翻页 / 切文档 / 缩放 / 面板开关 | 通过：三页 chip 逐字随页变化；跨文档往返（有书签 ↔ 无书签）存在性随之切换；`invariance` 五次读数（地图开 / 关 / 缩放往返 / 面板切标签）chip 逐字节相等；缩放证据 `110% → 100%`；`reader-store.ts` 零 diff |
| N78-3 零占位、不截断与不位移 | 三者皆 `null` ⇒ 不进 DOM；四选择器 `±1px`；不重叠且在其上方；宽度严格小于 viewer；`pointer-events` 判据 | 通过：`no-outline` 相位派发前/后 `containerInDom === false`；`zero-displacement` 四选择器 **差值全 0**；`section.bottom 943 ≤ pill.top 950 + 1`；`165 < 912`；`none / auto / auto`；chip 的 `textContent === title` |
| N79-1 两个按钮 | 目标来自 `resolveChapterNav`；跳转 = `gotoPage = start`；`disabled ⇔ null` | 通过：`next-jump` / `prev-jump` 真实落页；末节 next 禁用、首节 prev 禁用；`grep -n "readerStore.gotoPage = "` 新增恰 1 处（`:334` `jumpToChapter` 内，函数体为 `if (!target) return;` + 赋值），既有 `:831` 未动 |
| N79-2 快捷键 | 键位 `[` / `]`、落点在守卫之后、四条不生效条件、副作用恰为 `preventDefault + gotoPage` | 通过：`PdfViewer.vue:403` 新分支位于 `:402` 守卫之后、`:420` `switch` 之前；`captureMode` 自检 + 目标 `null` 早退（不 `preventDefault`）；`addEventListener("keydown"` 仍恰 1 处；`isEditableTarget` 恰 1 个定义；输入框与框选模式两组守卫实测生效（C1#4） |
| N79-3 边界与确定目标 | §0.4 表 | 通过：单节内 / 早于第一节 / 无 outline 三行由我方脚本与烟测双向覆盖 |
| N80-1 契约字段 | `outline` 必填（**本项不符**，见 C6 must-fix 1） | **不符**：`outline?:` + `?? []`；运行期已接线（`ChatPanel.vue` 传 `outline: readerStore.outline`），功能判据全绿，但编译期护栏缺失 |
| N80-2 行格式与位置 | `section: <标题> · 第 <label> 页`，恒为第 5 行 | 通过：烟测 `section-format` #1–#4 与离屏 `r12-4` 双覆盖；实测第 5 行逐字 |
| N80-3 不可解析零字节差 | 逐字节等于旧格式 | 通过：我方脚本在「`selectedText` + `reader_notes` 同时存在」等四种不可解析情形下逐字节等于手写旧格式；离屏 `without-outline` 载荷 7 行不含 `section:` |
| N80-4 提示词补一句 | `:5` 之后插入一行，单 hunk，元素 8 → 9 | 通过：`git diff` 单 hunk `1 insertion(+)`；`cat -A` 证实制表符缩进；现 9 个数组元素、`].join("\n")` 逐字未动 |
| N81-1 烟测 | 4 组 29 条、连续两次绿、零残留 | 通过：`29 / 失败 0`（两次）+ 故障注入双向验证（C1#8）；`ls -d "$TEMP"/pix-smoke-view-*` 无匹配（`EXIT=2`）；`pix/scripts/smoke-view.mjs` 不在 `tsconfig.json` 的 `include` 内（三份 tsconfig 零 diff） |
| N81-2 离屏场景 | 4 场景 / 16 条 / 7 张 | 通过：见 C1#2–#4；`SEL` 新增恰 8 项、新 helper 恰 9 个（`grep -cE "const (clickEl|pressReaderKey|pressKeyOn|sectionProbe|pillProbe|waitSectionReady|closeMap|settleEmptyOutline|mapCurrentLabels) = "` ⇒ 9）；既有 43 的 13 条 needle / 两处 5 项骨架列表 / 35 的 `confirmed35B` / 43 的就地就绪等待（`:3666`，不调用后置 helper）四处逐字落地 |
| N81-3 基线与零缺失 | 120 张 / 169 条零缺失、`failure === null`、退出码 0 | 通过：见 C1#2–#3 |
| §0.1 冻结面（R9 / R10 / R11 / R6 / 全局类名与键位） | 零改动 | 通过：`git diff` 对 `KnowledgeMap.vue` / `ReaderPanel.vue` / `NotesPanel.vue` / `PdfSearchPanel.vue` / `PdfSelectionQuickAsk.vue` / `reader-store.ts` / `notes-path.ts` / `notes-view.ts` / `src/main/{ipc-handlers,preload,notes-store,library-root,reader-state-store,session-bridge}.ts` / `src/shared/types.ts` / `package-lock.json` / `packages/**` / `tsconfig*.json` / `README.md` **全部为空**；`PdfViewer.vue` 的 diff 为 `+87 / −0`（`.pdf-page-indicator` 内部模板与 Esc 两分支零删除）；既有场景的删除行仅 3 行（35 夹具串 1 行 + 43 骨架列表 2 行，均属设计档 §2.2 授权的改写） |
| §0.6 回归基线 | 只允许新增绝对定位控件导致的位移 | 通过：`zero-displacement` 四选择器差全 0，无任何「非预期位移」需登记；`.page-label` 文本与 `waitPage` 等待式在既有场景中继续成立（既有 120 张 / 169 条零缺失） |
| 反需求（不新增 IPC / 不写盘 / 不加依赖 / 不删既有断言） | — | 通过：主进程数据面零 diff（唯一主进程改动 = `reading-prompt.ts` 一行常量）；`package.json` 仅 `scripts` 增 `smoke:view`；无新依赖、无 `any`、无内联动态 import；既有 `record(` / `capturePage(` / label 删除数为 0 |

### C3. 专项反证（按派单四项）

1. **命中规则的 ties 与地图 `.current` 集合的关系**：我方脚本在同一夹具上复算得 —— 第 3 页并列集（`start` 相同）= `[root/1/1, root/2, root/2/0/0]`（`2.2 Positional prior` / `3. Ablation Study` / `Appendix A.1`），命中取**预序最早** = `root/1/1`；地图 in-range（`isCurrent`）集合 = 并列集 + `root/2/1`（`Appendix B`，`2 ≤ 3 ≤ 3`），故「命中项 ∈ 地图认为是当前的集合」成立；DOM 上可见的 `.map-row.current` 恰 3 行（`Appendix A.1` 因 `collectExpandable` 只展开深度 0 父节点而不在 DOM），与我方取证读数 `["2.2 Positional prior","3. Ablation Study","Appendix B"]` 一致。反证：并列取「更晚者」会命中 `Appendix A.1`、取「深度最小」会命中 `3. Ablation Study` —— 两套错误口径在夹具上都会与本轮期望不同，故该夹具对并列口径确有判别力。
2. **无 outline 降级（零占位 + 快捷键零副作用）**：离屏 `r12-2` 相位在 `settleEmptyOutline()` 之后读 `containerInDom = false`、派发 `]` / `[` 后再读仍 `false`、`.page-label` 前后均 `第 1 / 2 页`、`notesHash` 不变；同相位随后切到 `sample-paper.pdf` 读到 `containerInDom = true`（正向对照，防空转），切回后 `false`；代码侧新分支在 `target === null` 时 `return`（不 `preventDefault`），与按钮 `disabled` 同源。
3. **载荷在不可解析时逐字节等于旧格式**：我方脚本用**仓库源码重新编译**的真实 `buildReadingUserMessage`，在四组不可解析上下文（`outline = []` / 全 `page === null` / `pageCount = 0` / `page = 9`）且 **`selectedText` 与 `reader_notes` 同时存在**时，输出逐字节等于手写旧格式串（含 3 空格缩进的条目块与 `comment:` 行）；可解析时恰多一行且位置固定为第 5 行；`filePath: null` 原样早退。离屏侧 `without-outline` 相位以真实发送链路复现同一结论（7 行、无 `section:`）。
4. **快捷键在输入框聚焦时不生效**：`r12-3` 相位实测 —— `.page-input` 内派发 `]` 后 `value` 仍 `1`，取消编辑后 `.page-label` 仍 `第 1 / 3 页`（若新分支跑到 `:402` 守卫之前，取消后页码会变成 `第 2 / 3 页`，该后半句是真正的守卫证据）；composer（`TEXTAREA`）内派发后页码与 chip 均不变；防空断言 `activeElement.tagName` 分别为 `INPUT` / `TEXTAREA`。

### C4. 目视结论（新图 + 窄栏既有帧）

| 截图 | 观察与结论 |
| --- | --- |
| `r12-1-section-chip-page1.png`（放大 3× 复核） | 章节胶囊 `« 1. Abstract · 第 1 页 »` 与页码胶囊 `^ 第 1 / 3 页 v` **同一居中轴**、垂直间距 7px（不重叠、不遮挡 pill 点击区）；左侧双箭头明显置灰（禁用）、右侧正常；文本完整无截断 |
| `r12-1b-section-chip-page2.png` | `2. Method Overview · 第 2 页`；两按钮均正常（无灰化） |
| `r12-1c-section-chip-page3.png` | `2.2 Positional prior · 第 3 页`；右侧双箭头置灰（末节禁用）、左侧正常；与 pill 仍不重叠 |
| `r12-2-no-outline-degrade.png` | 章节行**整行不存在**（无空壳 / 无占位高度 / 无残影），pill `第 1 / 2 页` 与有书签帧同位置 |
| `r12-3-section-nav-after-next.png` | 与 `r12-1b` 同框一致（`第 2 / 3 页` + `2. Method Overview · 第 2 页`，两按钮可点） |
| `r12-4-section-context-sent.png`（整窗） | 气泡为纯用户输入 `12：这一节的假设是什么？`（无上下文行）；chip 行与页码 pill 布局正常；左栏树 / 右栏 composer 无重叠、无截断 |
| 既有帧 `50-map-outline.png`（窄栏，**窄宽观察项**） | 地图打开、中心栏变窄时 chip 按内容收缩完整显示，**不换行、不溢出、不截断**，不与地图分隔线或 pill 重叠 |
| 既有帧 `20b-resume-opened.png`（110% + 第 3 页） | chip = `2.2 Positional prior · 第 3 页`、右侧置灰，与 pill 不重叠；缩放不改变 chip 文本（与 `invariance` 读数一致） |

未发现任何非预期差异（控件重叠 / 文字截断 / 按钮不可辨识 / 既有控件位移 > 1px）。观察（非缺陷）：`sample-paper.pdf` 第 2 页正文首行是 `3. Ablation Study`（`SAMPLE_PAGES[1]`，`ui-shot.mjs:209`），而书签口径第 2 页是 `2. Method Overview` ⇒ 截图里 chip 与画面正文看似不一致，属夹具填充文本的既有特征（R9 地图同口径），但会给后续目视复核带来误读，建议在下一轮夹具维护时点名。

### C5. 红线走查

- `git diff --stat`：`pix/package.json (+1)` / `pix/scripts/ui-shot.mjs (+542/−3)` / `pix/src/main/reading-prompt.ts (+1)` / `ChatPanel.vue (+1)` / `PdfViewer.vue (+87)` / `outline-notes.ts (+64)` / `reading-context.ts (+11/−1)`；未跟踪：`pix/scripts/smoke-view.mjs`（新）、`docs/pm/R12-{req,design,dev,review}.md` ⇒ **全部在白名单内，白名单外 0 处改动**。
- 禁项：无 `any`、无 `await import` / 内联动态 import、无新增依赖，`package-lock.json` / `packages/**` / `README.md` / `.gitignore` 零 diff；`pix/src/main` 下唯一改动是 `reading-prompt.ts`（一行常量）。
- 冻结文件零 diff（逐条实跑 `git diff --`）：`KnowledgeMap.vue` / `notes-path.ts` / `notes-view.ts` / `reader-store.ts` / `notes-store.ts` / `library-root.ts` / `ipc-handlers.ts` / `preload.ts` / `reader-state-store.ts` / `session-bridge.ts` / `src/shared/types.ts` / `PdfSearchPanel.vue` / `NotesPanel.vue` / `ReaderPanel.vue` / `LibraryPanel.vue` / `PdfSelectionQuickAsk.vue` 全部为空；`notes.json` 相关主进程文件（`notes-store.ts` / `ipc-handlers.ts`）零 diff，且离屏 `no-outline` 相位的 `notesHash()` 前后相等。
- 无临时产物残留：`git status --short` 只有上列条目；`$TEMP` 下无 `pix-smoke-view-*` / `pix-smoke-notes-*` 残留；一次性脚本与故障副本只落 `%TEMP%` 且已删除；离屏产物只落我自带的 `PIX_SHOT_ROOT`。

### C6. must-fix 清单（代码审查，1 条）

1. **【契约不符，编译期护栏失效】`ReadingSendContext.outline` 仍为可选字段，且源码里留下与终态不符的偏差注释。**
   证据：`pix/src/renderer/utils/reading-context.ts:16-25` 为 `outline?: ReaderOutlineNode[]`（含 4 行注释「本步 ChatPanel.vue（B 面）尚未接线 ⇒ 暂时可选」），`:93` 为 `buildChapterRanges(ctx.outline ?? [], …)`；而 `ChatPanel.vue:362` 已逐字接线 `outline: readerStore.outline` ⇒ 注释所述状态与终态矛盾。需求档 §0.2 第 3 条与设计档 §1.4.1 冻结为「**第 6 个必填字段**、不给默认值、漏传即 `npm run check` 报错」；A 面 D1 / B 面 B-D1 自认这是与定稿口径的偏差（A/B 分工是内部拆分，不构成对冻结契约的豁免 —— `ChatPanel.vue` 在本轮白名单内，A 面落 B 面前 `check` 短暂变红不是长期留存的理由）。
   影响：运行期语义完整（C1#4–#5 已全绿），但漏传不再编译期报错、且引入了设计档明文要避免的「第二套向后兼容分支」（`?? []`）。
   修法（一行 + 删注释块）：`:24` 改回 `outline: ReaderOutlineNode[];`、`:93` 改回 `ctx.outline`、删除 `:16-23` 的偏差注释；随后必须复跑 `npm run check` / `npm run smoke:view` / `npm run smoke:notes` / 离屏（`r12-section-context` 两条 + 43 号载荷断言是主要回归面）。

### C7. 次级项（登记与建议，不阻塞）

1. **既有 `r11-3` 相位 4/5 入口竞态未处置**（R-B1）。本次我方单次实跑为绿（相位 4 `attempts=1`、相位 5 `attempts=2`），交付方登记 3 次实跑 1 红 2 绿。该相位代码与 quick-ask 判定式逐字未动（`ui-shot.mjs` 的删除行仅 35/43 三行）⇒ 属既有问题、非本轮引入；但它会让「退出码 0」的验收读数偶发变红，建议负责人另起一轮按 R11 的有界重取范式加固 `selectPageSpan` 的入口前置（本轮已按纪律只登记、不改既有断言）。
2. **烟测编译面与设计档有一处偏差**（D2）：`files` 变为 4 项（补一份只写 `%TEMP%` 的 `window-global.d.ts`）。产物集合仍合规（3 个必需 + 允许的 `shared/types.js`），被测纯函数不经过该声明覆盖的分支；风险是 shim 与 `renderer/types/ipc.ts` 的真实 `pixApi` 类型长期漂移时不报错（dev 档已登记）。建议在 shim 注释里点名「该面变化不构成烟测红灯」，或后续改为窄类型导入。
3. **`outline-notes.ts` 头注释 +2 行导致既有 `^export` 行号整体 +2**（R1）。内容零 diff、`grep -c "^export function" = 5` 成立，判据不受影响；登记项。
4. **chip 省略号（> 360px）无截图证据**（R-B4）：本轮 7 张新图与既有 127 张中无「chip 文本宽 > 360px」的帧，该视觉分支只由 CSS 逐字保证。属已接受的覆盖缺口。
5. **chip 悬停原生 tooltip 不弹**（容器 / chip 继承 `pointer-events: none`）：设计档 §1.2.3 已登记为可接受后果，判据为 `textContent === title`，本次实测通过；如产品侧要 hover tooltip，需回改需求档 §0.5 并同步 `r12-1` ⑤ 的指针事件判据。
6. **代码卫生（可与 must-fix 1 合并处理）**：`reading-context.ts` 的偏差注释块（同 must-fix 1）；`smoke-view.mjs` `section-hit` #5 的 `candidates.includes(ranges.get(hit.key))` 属自反判据（同源已由 #8 的 `===` 覆盖），可删可留；R-B3 的 `data` 字段在冻结清单外只增不减（`overlap` 拆分 / `sectionBefore` / `zoomTexts` / `sectionOnSample` / `displayText`），复核通过、非缺陷。

### C8. 审查结论

**结论：revise**（唯一阻塞项 = C6 的 must-fix 1：`outline` 必填契约未落地 + 源码注释与终态矛盾，修法一行；其余全部验收面在我方独立复验中通过 —— `check` 0 error、离屏 127 张 / `failure === null` / 退出码 0、既有 120 张与 169 条 label 零缺失、新增 7 张与 4 组 16 条齐备且逐条复算全绿、两个烟测 29+26 全绿且故障注入可判红、四选择器零位移、红线走查无越界）。若负责人书面接受「`outline` 暂为可选」作为登记偏差，则本交付在功能面可直接 accept；不接受时应以「一行修复 + 复跑」闭环后再验收，不得以「A/B 分工」为由静默保留。
