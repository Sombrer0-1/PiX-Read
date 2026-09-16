# PiX-Read R11 设计档 · 收口修复（N73–N76）

> 上游：`docs/pm/R11-req.md`（需求，N73–N76 与 §0 定稿修订 M1–M6 已就地同步）、`docs/pm/R11-review.md`（需求评审：must-fix 6 条 + 非阻塞 6 条）、`docs/pm/PRD-V0.5.md` §2/§4/§5/§7.1、`docs/pm/R10-design.md`（章节结构范本：§1 契约冻结表 / §5 文件级清单 / §6 失败路径表 / §8 验证方案 / §9 分工）、`docs/pm/R10-req.md`（§0 冻结字面）、`docs/pm/R10-dev.md`（终 1 / 终 4 / 终 6、B.2 D1、B.6）。
> 本档是「可直接开工、可判定」的定稿设计：把 N73-1 的事件层语义、N73-2 的滚动来源判定、N73-3 的清理时机与越界守卫、N74 三条回归断言（场景名 / 相位名 / 断言 label / DOM 判据）、N75 的脚本结构（文件布局 / tsc 入口逐字路径 / 临时 tsconfig 字段 / 断言分组与条数 / 输出格式 / 退出码语义）写到实现层粒度。
> **本档不改任何代码**，只新增这一份文档；本轮允许的写操作仅 `docs/pm/R11-design.md`。
> 判定工具（与需求档一致）：【走查】只读 `git status` / `git diff` / `git show` 与文件内容；【check】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error；【烟测-主进程】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes`（N75 起为仓库内可复跑脚本）；【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`（退出码 0 + `MANIFEST.json.failure === null` + 新增断言组全绿 + 新增截图齐备）。

---

## 0. 口径与证据面

### 0.1 本档事实基线（写档当天：只读核对 + 唯一允许的实跑）

| 事实 | 证据（全部为本轮真实核对结果） |
| --- | --- |
| 工作树状态：仅两份未跟踪文档；分支 `main`，HEAD `752a6d2` | `git status --short` ⇒ `?? docs/pm/R11-req.md` / `?? docs/pm/R11-review.md`（本档写完后同样以 `??` 出现） |
| 唯一工程门当前 0 error | 2026-09-16 实跑 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0` |
| N73-1 改动点 | `NotesPanel.vue:200`（旧注释）/`:201-204`（`onSearchEsc` 无参、只清空 + `blur()`）/`:435`（`@keydown.esc="onSearchEsc"`）；`grep -n "stopPropagation" NotesPanel.vue` 现网**仅 1 命中**（`:200` 的旧注释文本），`preventDefault` 0 命中，`addEventListener("keydown"` 0 命中 |
| N73-1 越界来源 | `PdfViewer.vue:375-378`（`Escape && captureMode` 分支）、`:380-383`（`Escape && searchOpen` 分支）都在 `:385` 的 `isEditableTarget(event.target)` 判定**之前**；监听注册为 `window.addEventListener("keydown", onWindowKeydown)`（非 capture，`:424`）⇒ 元素级 `stopPropagation()` 足以阻断 |
| N73-2 改动点 | `PdfSelectionQuickAsk.vue:137-139`（`onStageScroll(): void { if (visible.value) hide(); }`）、`:176`（`document.addEventListener("scroll", onStageScroll, true)`）、`:181`（对称移除）、`:48-50`（`resolveStage()` 已存在）、`:105`（`showFeedback` 的 `if (!visible.value) return`） |
| N73-3 改动点 | `ui-shot.mjs:28`（`import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"`）、`:29`（`import { dirname, join, resolve } from "node:path"`）、`:32`（`PIX_DIR`）、`:33`（`OUT_ROOT` 无校验）、`:34`（`SHOTS_DIR`）、`:352`（`writeFixtures()` 内 `mkdirSync(SHOTS_DIR, { recursive: true })`）、`:5852-5856`（`main()` 首两句：`app.setPath("userData", …)` / `mkdirSync(OUT_ROOT, { recursive: true })`）、`:5919-5923`（两个 JSON 写入）、`:5926`（`await server.close()`）、`grep -c "rmSync(SHOTS_DIR" scripts/ui-shot.mjs` = 0 |
| 本机 `os.tmpdir()` | 实跑 `node -e "console.log(require('os').tmpdir())"` ⇒ `C:\Users\86157\AppData\Local\Temp`；`:33` 默认值位于其下 ⇒ 不设 `PIX_SHOT_ROOT` 时守卫可过（其它机器若 tmpdir 不同，必须显式设置） |
| 本机 node / typescript | `node --version` ⇒ `v24.19.0`；`pix/node_modules/typescript/package.json`.version ⇒ `5.8.3`；`pix/node_modules/typescript/lib/tsc.js` 存在（CJS shim，`module.exports = require("./_tsc.js")`） |
| 数据面锚点 | `pix/src/main/notes-store.ts` 导出：`loadNotes`(:286) / `addNote`(:294) / `updateNoteComment`(:340) / `deleteNote`(:358) / `restoreNote`(:378) / `exportNotesMarkdown`(:404) / `resetCorruptNotes`(:418)；`library-root.ts` 导出 `getLibraryRoot`/`setLibraryRoot`/`clearLibraryRoot`/`isLibraryFilePath`；逐字文案 `没有可撤销的删除`/`该笔记已重新存在，无法撤销`/`该笔记内容已重新存在，无法撤销`/`笔记写入失败`/`笔记文件未损坏，无需重建`/`暂无笔记可导出`（`:42-53`） |
| 夹具与页面 | `ui-shot.mjs:177-197` `SAMPLE_PAGES` = **3 页**、每页 MediaBox 595×842（`:111`）⇒ `cssSize`（`PdfViewer.vue:90`）= `round(base × scale)` ⇒ 缩放只改页盒尺寸；`.pdf-scroll`（`PdfViewer.vue:880`，CSS `:990-995` `overflow: auto`）在 1600×1000 下自带滚动 |
| 新增场景挂载点 | `runReaderStateScenarios`（`ui-shot.mjs:1341-5840`）末尾（现以 65 段结尾，`:5839`）；该作用域内已有 `record`(:1359) / `where` 系列 helper / `notesHash`(:2040) / `readNotes`(:2039) / `enterNotesProbe`(:4760) / `setSearch`(:4769) / `pressSearchEsc`(:4808) / `deleteRowByText`(:4858) / `excerptFirstSpan`(:4954) / `rectOfSelector`(:2228) |
| R10 交付终态口径 | `R10-dev.md:359` 逐字「MEASUREMENTS.json：153 条（上一交付 152 + 本轮 search-row-form 1）」、`:375` 逐字「唯一新增条目是本轮补强的 `search-row-form`；修复前 152 条一条不缺。」；`R10-review.md:206` 的 152 为「搜索行冻结字面修复前」的时间点读数 ⇒ 不构成未解释差额（M1 结论） |

### 0.2 需求评审 M1–M6 在本档的落点（逐条登记，不改任何判据）

| # | 处置 | 本档落点 |
| --- | --- | --- |
| M1 | 基线以「R11 动工前实跑」为唯一口径 | §0.1 事实基线条目、§5.1 步骤 0、§5.2 |
| M2 | `r11-3` 相位 `reader-scroll-control` 兜底方向改为**放大**（`title="放大"`），到上限仍不可滚动即判失败 | §1.2.4 相位表第 3 行 |
| M3 | `.notes-empty` 的文案读取节点冻结为 `.notes-empty .empty-title` / `.notes-empty .empty-subtitle`，容器本体只判「在 DOM」 | §1.4.3 断言⑤、§2.1 冻结清单 |
| M4 | 动作区补 start 侧判据；「未换行」阈值冻结为 `T = 1.5 × max(fontSize × 1.5)`，本轮取 `.note-text`（12px）⇒ `27px`，节点 / fontSize / T 必须写入 `data` | §1.4.4 判定表 |
| M5 | 守卫取加强版：tmpdir 归属 **∧** 与 `PIX_DIR` 互不包含；失败路径零副作用 | §1.3.2 / §1.3.5 |
| M6 | 4 张截图的改前 / 改后目视比对必须逐张登记；差异只允许「浮层是否可见」 | §2.3（含留档表模板） |

### 0.3 本轮不得改动的既有冻结面（与需求档 §0.1 同口径，本档只补判据命令）

R9 / R10 冻结的类名、文案、计数四分叉、空态六分支、撤销契约与逐字文案、搜索行字面与盒模型、DOM 门控、几何断言、场景 00–11 / 20–24 / 30–36 / 40–46 / 50–55 / 60–65 的全部 label 与 18 张 R10 截图名 —— 本轮**一律不得改动**（逐条清单见 §2.1）。本轮**唯一**被显式改写的既有冻结字面是 R10 的「笔记搜索框 Esc 不 `stopPropagation`」（改写方式见 §2.2）。

### 0.4 本档新增的显式冻结（不改判据，只补实现层命名）

| 项 | 冻结值 | 理由 |
| --- | --- | --- |
| `SEL` 新增 11 项 | `pdfSearchBtn: '.pdf-toolbar button[title="在文档中搜索"]'`、`pdfSearchPanel: ".pdf-search-panel"`、`zoomInBtn: '.pdf-toolbar button[title="放大"]'`、`zoomLabel: ".zoom-label"`、`pdfScroll: ".pdf-scroll"`、`pdfViewer: ".pdf-viewer"`、`captureFabBtn: ".pdf-capture-fab button"`、`captureLayer: ".capture-layer"`、`layoutLeft: ".layout-left"`、`noteActions: ".note-actions"`、`noteText: ".note-text"` | 全部为既有类名 / 既有 `title` 字面；`v-btn` 的 `title` 落到根 `button` 上，与既有 `clickNext()`（`:1470`）同手法 |
| 新增 helper（语义冻结、命名自由） | `pressBodyEsc()`：在 `document.body` 上派发 `new KeyboardEvent("keydown", { key: "Escape", bubbles: true })`；`quickAskProbe()`：一次 `js` 读 `{ inDom, display, feedbackClass, feedbackText }`（`display = getComputedStyle(el).display`）；`notesEmptyProbe()`：一次 `js` 读 `{ inDom, title, subtitle }`；`narrowProbe()`：一次 `js` 读 `r11-5` 的全量几何（§1.4.4）；`stageScrollProbe()`：一次 `js` 读 `{ scrollHeight, clientHeight, scrollTop, scaleText }` | 避免每个相位多次往返；读数口径统一 |
| 场景顺序与复位纪律 | 新增场景追加在 `runReaderStateScenarios` 末尾，顺序 `r11-1` → `r11-2` → `r11-3` → `r11-4` → `r11-5` →（可选 `r11-6`）；每个场景自带复位（`enterNotesProbe(...)` / `enterCleanWorkspace(...)`），末态恢复标准种子（`restoreStandardSeed()`） | 与 R10「不引用其它场景的局部变量」同纪律 |

---

## 1. 契约面（可实现 + 可判定）

### 1.1 N73-1 · 笔记搜索框内 Esc 的语义越界

#### 1.1.1 事件层语义（行为矩阵，逐字照抄需求 §0.3）

| 焦点位置 | 阅读区状态 | 按 Esc 之后（R11 冻结） |
| --- | --- | --- |
| `.notes-search-input` | 空闲 | 查询清空、输入框失焦；阅读区零变化 |
| `.notes-search-input` | 框选模式开启（`.capture-layer` 在 DOM） | 查询清空、输入框失焦；**`.capture-layer` 仍在 DOM、`.pdf-viewer` 仍含 `capture-mode`** |
| `.notes-search-input` | PDF 搜索面板开启（`.pdf-search-panel` 在 DOM） | 查询清空、输入框失焦；**`.pdf-search-panel` 仍在 DOM** |
| 非 `.notes-search-input`（阅读区 / body / PDF 搜索框） | 框选模式开启 | 退出框选模式（既有语义，逐字不变） |
| 非 `.notes-search-input` | PDF 搜索面板开启 | 关闭 PDF 搜索面板（既有语义，逐字不变） |

**机制说明（本档补，用于判定为什么 `stopPropagation` 够用）**：`PdfViewer` 的 Esc 处理挂在 `window` 上且**非 capture**（`:424`）；笔记输入框上的 Vue 监听是元素级、非 capture。合成事件以 `.notes-search-input` 为 target 时，事件路径为 `window → document → … → input`；元素级监听在目标阶段执行，此时调用 `event.stopPropagation()` 会阻止后续冒泡阶段（`input → … → document → window`）的监听被调用 ⇒ window 上的 `onWindowKeydown` 不被触发。反过来，以 `document.body` 为 target 派发的事件不经过 input，元素级监听不执行 ⇒ 阅读区既有语义不受影响。

#### 1.1.2 代码改法（`pix/src/renderer/components/workspace/NotesPanel.vue`）

| 项 | 改前（逐字） | 改后（逐字） |
| --- | --- | --- |
| 注释（`:200`） | `/** Esc 只清空查询并交出焦点；不 stopPropagation（既有 window 级 Esc 语义保留）。 */` | `/** Esc 只清空查询并交出焦点，并阻断冒泡：本输入框内的 Esc 不触发阅读区的 Escape 语义（框选模式 / PDF 搜索面板）。 */` |
| 方法（`:201-204`） | `function onSearchEsc(): void {` + `notesStore.clearSearchQuery();` + `searchInputRef.value?.blur();` + `}` | `function onSearchEsc(event: KeyboardEvent): void {` + `notesStore.clearSearchQuery();` + `searchInputRef.value?.blur();` + `event.stopPropagation();` + `}` |
| 模板（`:435`） | `@keydown.esc="onSearchEsc"` | **逐字不变**（Vue 传原生事件对象；`@keydown.esc.prevent` 之类修饰符**不得**添加） |

**不变量（逐字保留）**：`clearSearchQuery()` 与 `blur()` 的**顺序**；`.notes-search-input` 的类名 / `placeholder="搜索原文或备注"` / 盒模型；`.notes-search` 的 `v-if="notesStore.status === 'ready' && notesStore.hasNotes"`；`.notes-search-clear` 的 `v-if="notesStore.searchActive"` 与 `onSearchClear`（清空 + `input.focus()`，**不** `stopPropagation`）。

#### 1.1.3 可观测判据

**走查（5 条，逐条可计数）**

| # | 命令 | 期望 |
| --- | --- | --- |
| 1 | `grep -c "stopPropagation" pix/src/renderer/components/workspace/NotesPanel.vue` | `1`（且该命中位于 `onSearchEsc` 函数体内；新注释不含该词） |
| 2 | `grep -c "preventDefault" pix/src/renderer/components/workspace/NotesPanel.vue` | `0` |
| 3 | `grep -c 'addEventListener("keydown"' pix/src/renderer/components/workspace/NotesPanel.vue` | `0` |
| 4 | `grep -c "@keydown" pix/src/renderer/components/workspace/NotesPanel.vue` | `1`（唯一绑定在 `.notes-search-input`） |
| 5 | `git diff -- pix/src/renderer/components/workspace/PdfViewer.vue` | 空（`onWindowKeydown` 的分支顺序与内容零 diff） |

**离屏（场景 `r11-1` / `r11-2`，断言组 `r11-esc-scope`，4 条 record）**：见 §1.4.1 的组表与 §1.4.2 的相位表；【check】`CHECK_EXIT=0`。

---

### 1.2 N73-2 · 摘录反馈被无关滚动吞掉

#### 1.2.1 判定式（语义冻结，写法可细化但判别结果必须逐条一致）

```
onStageScroll(event: Event): void {
  const stage = resolveStage();
  if (!stage) return;                        // 阅读区不存在 ⇒ 不隐藏
  if (!(event.target instanceof Node)) return; // 非节点目标 ⇒ 不隐藏
  if (!stage.contains(event.target)) return;   // 目标不在 stage 子树内 ⇒ 不隐藏
  if (visible.value) hide();                   // 阅读区滚动 ⇒ 隐藏（既有语义）
}
```

**不得出现的写法**：按类名枚举的例外（`target.closest(".notes-panel")` 一类）、把监听改挂到 `.reader-stage` 上、新增第二个 `scroll` 监听、给 `document`/`html`/`body` 写专门分支（不可达路径不写分支）。`hide()` / `showFeedback` / 监听注册与移除逐字不变。

#### 1.2.2 逐元素判定表（每个滚动源的结论必须逐条一致）

| # | 滚动容器 | 真实位置 | 在 `.reader-stage` 子树内 | 滚动时是否隐藏 | 判据落点 |
| --- | --- | --- | --- | --- | --- |
| 1 | `.pdf-scroll` | `PdfViewer.vue:880`；CSS `:990-995` `overflow: auto` | 是 | **隐藏** | §1.2.4 相位 `reader-scroll-control`（⑧） |
| 2 | `.reader-content` | `ReaderPanel.vue:250`；CSS `:419-423` `overflow-y: auto` | 是 | **隐藏** | 走查（同一规则，无新场景） |
| 3 | `.map-tree` | `KnowledgeMap.vue:225`；CSS `:400-404`；`.knowledge-map-slot` 是 `.reader-stage` 直接子节点（`ReaderPanel.vue:206`） | 是 | **隐藏** | 走查（不为地图列开第二处例外） |
| 4 | `.notes-panel` | `NotesPanel.vue:690-696`（`:695` `overflow-y: auto`），挂 `.layout-left` 内 | 否 | **不隐藏（本轮修复目标）** | §1.2.4 相位 `notes-panel-scroll`（④⑤⑥） |
| 5 | `.panel-scroll` | `LibraryPanel.vue:205` `overflow-y: auto` | 否 | **不隐藏** | 走查 |
| 6 | `.chat-messages` | `ChatPanel.vue:1287-1294`（`:1289` `overflow-y: auto`） | 否 | **不隐藏** | 走查 |
| 7 | `document` / `html` / `body` | `main.css:16-20`、`WorkspacePage.vue:336`、`AppLayout.vue:109` 均 `overflow: hidden` | 否（且不可达） | **不隐藏** | 走查（`stage.contains(document)` 天然为假） |
| 8 | `.pdf-search-panel` 内部 | `PdfSearchPanel.vue:432` `position: absolute`（在 `.pdf-viewer` 内 ⇒ 属 stage 子树） | 是 | 不适用（文件内无滚动源） | 走查 |

**其余冻结项**：监听仍为 `document.addEventListener("scroll", onStageScroll, true)` + `onBeforeUnmount` 对称移除；`hide()` 的五项清理不变；`showFeedback` 的 `if (!visible.value) return` 不变；`FEEDBACK_MS = 2500` 与 `.quick-ask` / `.quick-ask-feedback` / `.is-ok` / `.is-duplicate` / `.is-error` 类名零改动；浮层仍挂 `.reader-stage` 之外（`ReaderPanel.vue:258`，与 `.reader-stage` 同级）⇒ 规则不会自隐藏。

#### 1.2.3 可观测判据

| 面 | 判据 |
| --- | --- |
| 【走查】 | 对 `PdfSelectionQuickAsk.vue`：`scroll` 监听恰 1 处且仍为 capture（`grep -n 'addEventListener("scroll"'` ⇒ 1 命中，带 `true`）；`resolveStage()` / `instanceof Node` / `stage.contains(` 各恰 1 处；**无** `closest(` 命中 |
| 【check】 | `CHECK_EXIT=0` |
| 【离屏·新】 | 组 `r11-quick-ask-scroll-scope`（3 条 record，场景 `r11-3`，相位表见 §1.2.4）全绿 + 截图 `r11-3-excerpt-feedback-visible.png` |
| 【离屏·旧断言保留】 | 60-9 的全部既有断言逐字保留并通过；`excerptFirstSpan`（`ui-shot.mjs:4954-4971`）的**注释**改写为 R11 口径（说明「面板滚动不再隐藏浮层，反馈态可在 60-9 之后被断言」），其行为（文件条数 + 面板回位）不变；面板滚动的**新**断言只落在 `r11-3` |
| 【离屏·追加】 | 60-9 内**追加**（不替换）一条：摘录完成后 `.quick-ask-feedback.is-ok` 文本逐字 `已摘录 · 第 1 页`（有界等待 ≤1500 ms） |
| 【离屏·内容目视】 | §2.3 的 4 张截图改前 / 改后目视登记 |

#### 1.2.4 场景 `r11-3`（组 `r11-quick-ask-scroll-scope`，3 条 record）

前置：`enterNotesProbe([], 0)` → **显式有界等待空态就绪**：等 `.notes-empty` 进 DOM（`waitFor("笔记空态就绪", "<SEL.notesEmpty 的 document.querySelector 表达式>")`，同款用法见 `ui-shot.mjs:1075`；依据：`openNotesPanel(0)` 的等待式 `document.querySelectorAll(".note-row").length === 0`（`ui-shot.mjs:3069-3072`）在 0 条时恒真、不构成就绪判据；切标签同步置 `status = "loading"`（`WorkspacePage.vue:202` → `notes-store.ts:147-150`），其期间 `.notes-empty` 不在 DOM（`NotesPanel.vue:525` 的 loading 分支优先于 `:561` 的空态分支））→ 再核对空断言防护：`.notes-empty` 在 DOM、`.notes-search` 行**不在** DOM、`rows === 0`。

| 相位（`phase`） | 步骤 | 断言（逐条为真） | `data` 字段 |
| --- | --- | --- | --- |
| `excerpt-into-empty-panel` | `selectPageSpan(1)` → 点 `.quick-ask-btn` 中文本含「摘录」的按钮 → 轮询 `readNotes().length` 由 0 变 1（≤20 s）→ `waitFor(".notes-search-input" 回到 DOM)` → 有界等待（≤1500 ms）`.quick-ask-feedback.is-ok` → 立即 `quickAskProbe()` → 立即截图 `r11-3-excerpt-feedback-visible.png` | ① 面板确已从空态切到列表（`.notes-search` 行在 DOM、`rows === 1`）；② `.quick-ask` 的 computed `display !== "none"`；③ `.quick-ask-feedback` 元素带 `is-ok` 类、文本逐字 `已摘录 · 第 1 页` | `{ phase, rows, searchInDom, quickAsk, waitMs }` |
| `notes-panel-scroll` | 在 `.notes-panel` 上派发合成 `scroll` 事件（`new Event("scroll")`，**不冒泡**；`document` 级 capture 监听可收到，`event.target` = `.notes-panel`）→ 立即 `quickAskProbe()` | ④ 派发后 `.quick-ask` 仍 `display !== "none"`；⑤ 反馈文本仍逐字 `已摘录 · 第 1 页`；⑥ 文件条数仍 1、`notesHash()` 不变（滚动不改数据） | `{ phase, quickAsk, fileCount, hashSame, elapsedSinceFeedbackMs }` |
| `reader-scroll-control` | ① `stageScrollProbe()` 读 `.pdf-scroll` 的 `scrollHeight` / `clientHeight`；达不到 `scrollHeight > clientHeight + 40` 时点 `SEL.zoomInBtn`（`title="放大"`，`zoomBy(+0.1)`）**逐档放大**、达到可滚动即停止、**不得超过** `MAX_SCALE = 3`（`reader-store.ts:21`）；放大到上限仍不可滚动 ⇒ 该相位**直接判失败**（不得降级为跳过）；实际 `scrollHeight` / `clientHeight` 与 `.zoom-label` 文本写入 `data`。② 放大完成后复读一次 `.quick-ask` 的 computed `display`（防空断言；若此时已被隐藏，说明放大动作触发了 scroll 事件 ⇒ 开发档必须登记原因，并把放大时机改到反馈出现之前，**不得**让 ⑧ 建立在此种假绿上）。③ 记录 `scrollTopBefore === 0` → `scrollTop = 200` → `waitFor(".quick-ask" 隐藏)` | ⑦ `scrollTop` 确实由 0 变为 > 0（防空断言）；⑧ `.quick-ask` 的 computed `display === "none"`（既有语义未放松）；⑨ 文件条数仍 1、`notesHash()` 不变 | `{ phase, scroll: { before, after, scrollHeight, clientHeight, scrollHeightAfterZoom }, zoom: { text, clicks }, quickAskBeforeScroll, quickAskAfterScroll, fileCount, hashSame }` |

**时序注记（次级风险 1 的落点）**：相位 1 与相位 2 之间**不得**插入 `sleep`、不得重拍截图；相位 2 的 `elapsedSinceFeedbackMs`（从反馈出现到相位 2 读探针的实测毫秒）必须写进 `data`。若实测 > 2400 ms，允许把顺序微调为「先派发面板滚动、再截图」（只改次序，**不得**改任何判据、不得把 ⑤ 降级为跳过），并在开发档登记实测值。

---

### 1.3 N73-3 · 取证脚本启动清理、越界守卫与产物自检（`pix/scripts/ui-shot.mjs`）

#### 1.3.1 `main()` 语句顺序（冻结，before → after）

| 序 | 改前 | 改后 |
| --- | --- | --- |
| 1 | `app.setPath("userData", join(OUT_ROOT, "electron-userdata"));`（`:5853`） | **`assertOutRootSafe();`**（新函数调用；`main()` 的第一条语句） |
| 2 | `mkdirSync(OUT_ROOT, { recursive: true });`（`:5854`） | `app.setPath("userData", join(OUT_ROOT, "electron-userdata"));` |
| 3 | `writeFixtures();` | `mkdirSync(OUT_ROOT, { recursive: true });` |
| 4 | — | `rmSync(SHOTS_DIR, { recursive: true, force: true });`（**唯一清理点**） |
| 5 | — | `writeFixtures();`（其内 `:352` 的 `mkdirSync(SHOTS_DIR, { recursive: true })` 负责重建） |
| … | 场景编排 | 场景编排（不动） |
| 末尾 | 写 `MANIFEST.json` / `MEASUREMENTS.json` → `server.close()` | 写两个 JSON → **结束自检**（§1.3.3）→ `server.close()` |

`writeFixtures()` 还会在 `OUT_ROOT` 下建 `library` / `library-b` / `.pix-read` 等；清理**只**删 `join(OUT_ROOT, "shots")`，不删 `OUT_ROOT` 本身、不碰 `library` / `library-b` / `electron-userdata` / `vite-cache` / `stub-preload.cjs`。

#### 1.3.2 启动守卫（冻结；逐字文案 + 零副作用）

```
function assertOutRootSafe(): void {
  const outRoot = resolve(OUT_ROOT);
  const tmpRoot = resolve(tmpdir());
  const norm = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
  const o = norm(outRoot), t = norm(tmpRoot), pix = norm(resolve(PIX_DIR));
  const inside = (child, parent) => child !== parent && child.startsWith(parent + sep);
  const inTmp = inside(o, t);                            // ① 严格位于 tmpdir 之下（等于 tmpdir 也拒绝）
  const crossesRepo = inside(o, pix) || inside(pix, o) || o === pix;  // ② 与仓库互不包含
  if (!inTmp || crossesRepo) {
    console.error(
      "[ui-shot] 拒绝启动：PIX_SHOT_ROOT 必须位于系统临时目录内，且不得与仓库路径互相包含（当前：" + outRoot + "）",
    );
    app.exit(1);
    return;
  }
}
```

- 冻结口径：① 严格要求 `resolve(OUT_ROOT)` 位于 `resolve(tmpdir())` **之下** —— 以 `tmpRoot + path.sep` 为前缀且**不等于** `tmpRoot` ⇒ 实现即 `inside(o, t)`，无 `o === t` 分支；② `resolve(OUT_ROOT)` 与 `resolve(PIX_DIR)` 互不包含 —— 不在 `PIX_DIR` 子树内、不是其祖先、也不与其相等（`PIX_DIR` = `:32` 的 `resolve(dirname(fileURLToPath(import.meta.url)), "..")`）。
- win32 两侧先 `toLowerCase()` 归一（用既有的 `resolve` + 新增 `sep`；不引入新依赖）。
- **零副作用**：守卫是 `main()` 第一条语句，失败路径不执行 `app.setPath`、不 `mkdirSync`、不 `rmSync` ⇒ 目标目录不被创建、不被删除。失败分支在 `app.exit(1)` 处终止进程（`return` 仅为可读性）。
- 文案逐字：`[ui-shot] 拒绝启动：PIX_SHOT_ROOT 必须位于系统临时目录内，且不得与仓库路径互相包含（当前：<resolve 后的绝对路径>）`。

#### 1.3.3 结束自检（位置：两个 JSON 写完之后、`server.close()` 之前；结果追加到 `errors`）

```js
{
  const disk = readdirSync(SHOTS_DIR, { withFileTypes: true });
  const diskPng = disk.filter((e) => e.isFile() && e.name.endsWith(".png")).map((e) => e.name).sort();
  const manifestPng = shots.map((s) => basename(s.file)).sort();
  const missingFromDisk = manifestPng.filter((n) => !diskPng.includes(n));
  const missingFromManifest = diskPng.filter((n) => !manifestPng.includes(n));
  if (missingFromDisk.length || missingFromManifest.length) {
    errors.push(`截图目录与清单不一致：磁盘 ${diskPng.length} 张 / 清单 ${manifestPng.length} 张，差集 [${[...missingFromDisk, ...missingFromManifest].join(", ")}]`);
  }
  const strays = disk.filter((e) => !(e.isFile() && (e.name.endsWith(".png") || e.name === "MANIFEST.json" || e.name === "MEASUREMENTS.json"))).map((e) => e.name);
  if (strays.length) errors.push(`截图目录存在白名单外条目：[${strays.join(", ")}]`);
}
```

- 两条判据：① `shots/*.png` 的 **basename 集合 === `MANIFEST.json.shots[].file` 的 basename 集合**（双向相等）；② `SHOTS_DIR` 的一级条目中，除 `*.png` / `MANIFEST.json` / `MEASUREMENTS.json` 之外为 **0 个**。
- 失败处理：只 `errors.push(...)`（**不覆盖** `failure` 文本）；既有的 `if (failure || errors.length) app.exit(1)` 分支自然带出退出码 1（`:5928-5931`）。
- 失败截图 `99-failure-state.png` 仍由失败路径产出并被 `capturePage` 正常登记进 `shots`（`:1029`）⇒ 自检不会误报。
- `readdirSync(dir, { withFileTypes: true })` 为既有稳定接口（Node 10.10 起）；本机实跑 `node --version` ⇒ `v24.19.0`。

#### 1.3.4 import 面改动（冻结）

| 行 | 改前 | 改后 |
| --- | --- | --- |
| `:28` | `import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";` | 追加 `readdirSync`（保留原四项与顺序） |
| `:29` | `import { dirname, join, resolve } from "node:path";` | 追加 `basename, sep`（保留原三项与顺序） |
| 新增 | — | `import { tmpdir } from "node:os";`（Node 内建，不新增依赖、不改 `package.json` 依赖面） |

#### 1.3.5 可观测判据

| 面 | 判据 |
| --- | --- |
| 【走查】 | `grep -c "rmSync(SHOTS_DIR" pix/scripts/ui-shot.mjs` === `1` 且该行位于 `mkdirSync(OUT_ROOT` 之后、`writeFixtures()` 之前；`grep -n "app.exit(1)"` 中守卫分支的行号**小于** `rmSync(SHOTS_DIR` 的行号；自检代码位于 `MEASUREMENTS.json` 写入行之后、`server.close()` 之前；`assertOutRootSafe` 是 `main()` 首条语句；除 `SHOTS_DIR` 外零 `rmSync` 新增 |
| 【离屏·守卫负向控制】 | `test ! -e "E:/develop/pix-shot-guard-probe" && echo "PROBE_ABSENT=yes"` ⇒ `PROBE_ABSENT=yes`；`cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="E:/develop/pix-shot-guard-probe" ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "EXIT=$?"` ⇒ `EXIT=1` 且输出含 §1.3.2 逐字文案；再 `test ! -e …` ⇒ 目录**未被创建** |
| 【离屏·自检判据】 | 成功运行（退出码 0、`failure === null`）后：`shots/*.png` basename 集合 === `MANIFEST.json.shots[].file` basename 集合；`ls -A <OUT_ROOT>/shots` 只含 `*.png` / `MANIFEST.json` / `MEASUREMENTS.json` |
| 【离屏·预置残留复核】 | 在全新 `OUT_ROOT/shots/` 预置 `99-failure-state.png` 与 `zz-stale.png` 两个假残留 ⇒ 运行一次 ⇒ 两文件均不存在，且上述两条判据仍成立（原始命令与输出留档到 R11-dev.md） |
| 【离屏·零缺失】 | 基线截图 / 既有 label 零缺失（§5.2） |

---

### 1.4 N74 · 回归断言补齐（场景名 / 相位名 / 断言 label / DOM 判据）

#### 1.4.1 label 与条数总表（冻结，不得减少）

| 组（`record` label） | record 条数 | 场景 | 相位名（顺序） | 截图 |
| --- | --- | --- | --- | --- |
| `r11-esc-scope` | 4 | `r11-1`、`r11-2` | `pdf-search-open` / `pdf-search-close-control` / `capture-mode` / `capture-mode-exit-control` | `r11-1-esc-pdf-search-panel.png`、`r11-2-esc-capture-mode.png` |
| `r11-quick-ask-scroll-scope` | 3 | `r11-3` | `excerpt-into-empty-panel` / `notes-panel-scroll` / `reader-scroll-control` | `r11-3-excerpt-feedback-visible.png` |
| `r11-undo-after-empty` | 3 | `r11-4` | `before-delete` / `after-delete-empty` / `restored` | `r11-4-undo-row-after-empty.png` |
| `r11-note-actions-narrow` | 3 | `r11-5` | `default-width` / `narrow-220` / `restored-width` | `r11-5-note-actions-narrow.png`、`r11-5b-note-actions-narrow-row.png` |
| `r11-undo-scope-stale`（**可选**，N74-3） | 1 | `r11-6` | `stale-scope` | `r11-6-stale-scope.png`（可选） |

合计：**4 组 13 条 record**（可选再 +1 组 1 条）；新增截图 **6 张**（可选再 +1 张）。每条 `record(label, data, failures)` 沿用既有语义：**先落测量、再抛错**。

**failures 文案样式（冻结）**：`failures` 数组的每个元素是一句可读中文，带现场值；实现形态统一为 `...(cond ? [] : [\`<描述>：\${JSON.stringify(现场)}\`])`，与 `ui-shot.mjs` 既有写法一致（例：`:5273` 的 `\`第 1 步计数异常：${d1_60.countText}\``）。下面的表逐条给出**必须为真的条件**（括号内是需要落进 `data` 的字段）。

#### 1.4.2 场景 `r11-1` / `r11-2`（组 `r11-esc-scope`）

**`r11-1`（PDF 搜索面板开启态）**

前置：`enterNotesProbe()`（4 条种子、sample-paper.pdf 第 1 页、面板就绪）→ 记 `hashR11 = notesHash()` → 点 `SEL.pdfSearchBtn` → `waitFor(".pdf-search-panel")`。

| 相位（`phase`） | 步骤 | 断言（逐条为真） | `data` 字段 |
| --- | --- | --- | --- |
| `pdf-search-open` | `setSearch("Table")` → `probeA = searchProbe()` → `pressSearchEsc()` → `probeB = searchProbe()` → `panelInDom = has(SEL.pdfSearchPanel)` → 截图 `r11-1-esc-pdf-search-panel.png` | ① `probeA.focused === true`（空断言防护）；② `panelInDom === true`；③ `probeB.value === ""`；④ `probeB.focused === false`；⑤ `probeB.rows === 4`；⑥ `probeB.countText === "共 4 条"`；⑦ `notesHash() === hashR11` | `{ phase, before: probeA, after: probeB, panelInDom, hashSame }` |
| `pdf-search-close-control` | `pressBodyEsc()` → `waitFor(".pdf-search-panel" 不在 DOM)` | ⑧ `.pdf-search-panel` 退出 DOM（证明 `PdfViewer` 既有语义未改坏） | `{ phase, panelInDom }` |

**`r11-2`（框选模式开启态）**

前置：`enterNotesProbe()` → 记 `hashR11b = notesHash()` → 进入框选模式：读 `.capture-layer` 是否在 DOM，**未开才点** `SEL.captureFabBtn`（二态控件不得重复点）→ `waitFor(".capture-layer")`。

| 相位（`phase`） | 步骤 | 断言（逐条为真） | `data` 字段 |
| --- | --- | --- | --- |
| `capture-mode` | 读进入态 → `setSearch("Table")` → `probeA` → `pressSearchEsc()` → `probeB` → `layerInDom = has(SEL.captureLayer)`、`viewerCapture = .pdf-viewer 含 capture-mode` → 截图 `r11-2-esc-capture-mode.png` | ① 进入后 `layerInDom === true` 且 `viewerCapture === true`（空断言防护）；② `probeA.focused === true`；③ Esc 后 `.capture-layer` **仍在 DOM**；④ `.pdf-viewer` **仍含** `capture-mode`；⑤ `probeB.value === ""`；⑥ `probeB.focused === false`；⑦ `probeB.rows === 4`；⑧ `notesHash() === hashR11b` | `{ phase, entry: { layerInDom, viewerCapture }, before: probeA, after: probeB, layerInDom, viewerCapture, hashSame }` |
| `capture-mode-exit-control` | `setSearch("")` → `pressBodyEsc()` → `waitFor(".capture-layer" 不在 DOM)` | ⑨ `.capture-layer` 退出 DOM；⑩ `.pdf-viewer` 不再含 `capture-mode`；⑪ `notesHash() === hashR11b` | `{ phase, layerInDom, viewerCapture, hashSame }` |

#### 1.4.3 场景 `r11-4`（组 `r11-undo-after-empty`，N74-1）

前置：`enterNotesProbe(seedNotes().slice(0, 1), 1)`（**只有 `n-current-1`**：`docPath = "sample-paper.pdf"`、`page = 1`、`text = "We study retrieval over long documents where the attention budget is the binding constraint."`）→ 记 `hashBefore = notesHash()`。

| 相位（`phase`） | 步骤 | 断言（逐条为真） | `data` 字段 |
| --- | --- | --- | --- |
| `before-delete` | 读 `readRowsAndCount()`、`has(SEL.notesEmpty)` | ① `rows === 1`；② `countText === "共 1 条"`；③ `.notes-empty` **不在** DOM（空断言防护） | `{ phase, rows, countText, emptyInDom }` |
| `after-delete-empty` | `deleteRowByText("We study retrieval")`（既有两次点击手法）→ 读探针 → 截图 `r11-4-undo-row-after-empty.png` | ④ `rows === 0`；⑤ **`.notes-empty` 在 DOM**，且 **M3 冻结读取节点**：`.notes-empty .empty-title` 文本逐字 `还没有摘录`、`.notes-empty .empty-subtitle` 文本逐字 `在 PDF 中选中文字，点「摘录」保存到这里`（`.notes-empty` 本体只判「在 DOM」，**不判它的 `textContent`**）；⑥ `countText === "共 0 条"`；⑦ **`.notes-undo` 仍在 DOM**（本轮核心断言）；⑧ `.undo-text` 逐字 `已删除「We study ret…」· 第 1 页`；⑨ `.notes-undo-btn` 文本逐字 `撤销`、`title` 逐字 `还原这条笔记`；⑩ `notesHash() !== hashBefore`（删除已真实落盘） | `{ phase, rows, countText, empty: notesEmptyProbe(), undo: undoSnapshot(), hashChanged }` |
| `restored` | `clickUndo()` → `waitFor("还原后行数回到 1", rows === 1)` → 立刻读通知与面板状态 | ⑪ `rows === 1`；⑫ `.notes-empty` 退出 DOM；⑬ `.notes-undo` 退出 DOM；⑭ `.notes-notice.is-success` 文本逐字 `已还原该条笔记`；⑮ `notesHash() === hashBefore`（字节级回复）；⑯ `.notes-search` 行回到 DOM（`ready && hasNotes` 的自然结果） | `{ phase, rows, emptyInDom, undoRowInDom, notice: notesNotice(), searchInDom, hashSame }` |

**时序要求（次级风险③）**：撤销通知 4 s 自动消失、撤销行受 `UNDO_ROW_MS = 8000` 约束 ⇒ 第 ⑭ 条必须在 `waitFor` 行数之后**立即**读取，中间不得插入 `sleep`；`r11-4` 全场耗时必须 < 8 s。场景末 `restoreStandardSeed()`。

**走查判据**：`.notes-undo` 的 `v-if="notesStore.pendingUndo"` 与 `hasNotes` / `status` 无耦合（本轮不得新增耦合）；`git diff -- pix/src/renderer/components/workspace/NotesPanel.vue` 只含 N73-1 的 3 处（若 N74-2 判定为「修」另加样式面）。

#### 1.4.4 场景 `r11-5`（组 `r11-note-actions-narrow`，N74-2）

前置：`enterNotesProbe(seedNotes().slice(0, 2), 2)`（两个 `.note-actions`，每个含一个 `.note-copy` 与一个 `.note-ask-wrap`）。

**判定式（M4 定稿，逐条冻结）**

| 待测项 | 判定式 |
| --- | --- |
| 窄宽已生效（防空断言） | `.layout-left` 的 `getBoundingClientRect().width` ∈ `[218, 222]`（场景用 `document.documentElement.style.setProperty("--pix-left-width", "220px")` 施加） |
| 动作区不溢出（end 侧） | `actions.scrollWidth - actions.clientWidth <= 1` |
| 动作区不溢出（start 侧，M4 新增） | `actions.left >= body.left - 1`，且 `.note-copy` / `.note-ask-wrap` **各判一次** `left >= actions.left - 1`（矩形一律 `getBoundingClientRect()`；`body` = 该行 `.note-body`，CSS 无内边距） |
| 动作区右侧不越界 | `.note-copy` / `.note-ask-wrap` / `.note-actions` 三者 `right <= layoutLeft.right + 1` |
| 未换行（M4 定稿阈值） | `.note-copy` 与 `.note-ask-wrap` 的 `y` 差 `<= 1`；且 `actions.h <= T`，其中 **`T = 1.5 × max(fontSize × 1.5)`**，`fontSize` 取行内文本节点（`.note-text` / `.note-copy`）的 computed 值 ⇒ 本轮取 `.note-text`（12px / line-height 1.5）⇒ `12 × 1.5 = 18` ⇒ **`T = 27px`**；**实际取的节点名、`fontSize` 与 `T` 必须写入 `data`** |
| DOM 关系不变 | `.note-copy` 是 `.note-actions` 的第一个元素子节点、`.note-ask-wrap` 在其后；`.note-actions` 仍是 `.note-body` 的最后一个元素子节点 |
| 复位 | 场景结束时 `document.documentElement.style.removeProperty("--pix-left-width")`，并断言 `.layout-left` 宽回到 `268 ± 2`（默认值） |

| 相位（`phase`） | 步骤 | 断言（逐条为真） | `data` 字段 |
| --- | --- | --- | --- |
| `default-width` | 读 `narrowProbe()` | ① `.layout-left` 宽 = `268 ± 2`；② 两个动作区 `scrollWidth - clientWidth <= 1` | `{ phase, layoutLeftWidth, rows: [...] }` |
| `narrow-220` | `setProperty("--pix-left-width", "220px")` → `repaint` → 读 `narrowProbe()` → 截图 `r11-5-note-actions-narrow.png`（`rectOfSelector(SEL.layoutLeft, 2)`）+ `r11-5b-note-actions-narrow-row.png`（`rectOfSelector(".note-row", 2)`） | ③ 窄宽已生效 `218 ≤ w ≤ 222`；④ end 侧 + **start 侧**（每行：`actions.left >= body.left - 1`、`.note-copy` 与 `.note-ask-wrap` 各 `left >= actions.left - 1`）；⑤ 三者 `right <= layoutLeft.right + 1`；⑥ 未换行（`y` 差 ≤ 1 且 `actions.h <= T`，`T` 由 `.note-text` 的 fontSize 现算）；⑦ DOM 关系不变 | `{ phase, layoutLeftWidth, threshold: { node, fontSize, T }, rows: [ { scrollOverflow, actionsLeft, actionsRight, actionsHeight, bodyLeft, copyLeft, copyRight, askWrapLeft, askWrapRight, copyY, askWrapY, dom: {...} } ] }` |
| `restored-width` | `removeProperty("--pix-left-width")` → `repaint` → 读 `narrowProbe()` | ⑧ 宽度回到 `268 ± 2`；⑨ 两个动作区 `scrollWidth - clientWidth <= 1` | `{ phase, layoutLeftWidth, rows: [...] }` |

**「修 or 不修」边界（冻结，逐字照需求）**

| 条件 | 处理 |
| --- | --- |
| 220px 下**任一**判定项为红 | **必须修**：最小改法限定在 `NotesPanel.vue` 样式面，且**必须保持单行**——首选保持单行的收缩写法：收窄 `.note-actions` 的 `gap`（4px → 2px）与/或 `.note-copy` / `.note-ask` 的 `padding`（`1px 6px` → `0 4px`）；**只允许调整 `padding` / `gap`**，不得改 `font-size`（否则触发 §5.2 的 `fontSize` 非预期差异判据）；**`flex-wrap`（换行策略）与判定项 ⑥「未换行」互斥、不作为候选**（换行后两按钮 `y` 差 ≈ 21.4px > 1、`actions.h` ≈ 39px > `T = 27px` ⇒ ⑥ 恒红，「修后全绿」不可达）；若收缩到下限仍红 ⇒ **升级路径：回到需求档改判据**（本轮不得自行放宽 / 删除 ⑥）。不得改类名 / 文案 / DOM 顺序，不得删 `复制` 或 `追问`；修完重跑 §5.2 零缺失比对（位移允许，`w/h/fontSize/color/background` 非预期差异不得出现），且既有 65-5（默认 268px 下 `actionsOverflow <= 1` + 同一行 + 右对齐 + 最后一个子节点）必须仍绿 |
| 220px 下全部为绿 | **不修**：保留断言作为回归护栏，开发档登记「测定不溢出，不修」 |
| 160px 及更窄（产品不可达） | **不判、不修**：登记为已知限制 |
| 场景不可达（如窄栏下 `.note-actions` 不渲染） | 视为判据不可判定 ⇒ 开发档写明原因，**不得**改用其它元素降级断言 |

**注**：窄宽相位的失败截图为 99-failure-state 全景（故意不前置复位），以便失败现场可见 220px 状态。

#### 1.4.5 场景 `r11-6`（组 `r11-undo-scope-stale`，可选 / N74-3）

前置条件（不满足则本轮不做，并在开发档登记理由）：stub 的 `setNotesRestoreDelay(ms)` 能造出「响应晚于重新进入工作区后面板就绪」的时序，且 stub 增记 `resolvedAt`（白名单允许），用 `NOTES_RESTORE_DELAY_MS = 6000`（≥ 实测「goHome → 重回工作区 → 面板就绪」耗时 + 2000 ms 余量；该建议值可由设计 / 开发按实测上浮，上浮不影响判据）。

| 相位（`phase`） | 步骤 | 断言（逐条为真） | `data` 字段 |
| --- | --- | --- | --- |
| `stale-scope` | ① 面板就绪 4 条 → 删 1 条（文件 3 条、撤销行出现）；② `setNotesRestoreDelay(6000)` → 点 `.notes-undo-btn`；③ 立刻 `goHome()`；④ 直接改写库内 `notes.json` 为另两条；⑤ 重回工作区并打开笔记面板（2 行）；⑥ `await sleep(6500)` | ① `restoreCalls` 增量恰 1（空断言防护）；② stub 记录的 `resolvedAt` > ⑤ 完成时刻；③ ⑥ 之后 `rows === 2` 且行文本等于第 ④ 步写入的两条；④ `countText === "共 2 条"`；⑤ 无任何 `.notes-notice`；⑥ `notesHash()` 与第 ④ 步写完后相等 | `{ phase, restoreCallsDelta, resolvedAt, panelReadyAt, rows, countText, notice: notesNotice(), hashSame }` |

**若不做**：开发档登记「不覆盖 + 理由」，保留走查结论；不影响任何其它需求的验收。

---

### 1.5 N75 · 可复跑数据面烟测入口（`pix/scripts/smoke-notes.mjs`）

#### 1.5.1 文件布局与常量（逐字冻结）

| 项 | 值 |
| --- | --- |
| 文件 | 新建 `pix/scripts/smoke-notes.mjs`（顶层静态 import；零依赖，只用 Node 内建；与 `ui-shot.mjs` 同范式，`.mjs` 不受 `"type": "module"` 影响） |
| 主入口 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes` |
| 等价入口 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" node scripts/smoke-notes.mjs` |
| `pix/package.json` | **只**在 `scripts` 增一键：`"smoke:notes": "node scripts/smoke-notes.mjs"`；其余字段零改动；`package-lock.json` 零改动 |
| 顶层 import | `node:fs`（`existsSync` / `mkdirSync` / `readdirSync` / `readFileSync` / `rmSync` / `writeFileSync`）、`node:os`（`tmpdir`）、`node:path`（`basename` / `dirname` / `join` / `relative` / `resolve`）、`node:crypto`（`createHash`）、`node:child_process`（`spawnSync`）、`node:module`（`createRequire`）、`node:url`（`fileURLToPath`）；**不得** import electron、渲染层或 `packages/**` |
| `PIX_DIR` | `resolve(dirname(fileURLToPath(import.meta.url)), "..")`（= `<repo>/pix`） |
| `TSC_JS` | `join(PIX_DIR, "node_modules", "typescript", "lib", "tsc.js")`（逐字；实测 5.8.3 存在） |
| `TMP` | `join(tmpdir(), "pix-smoke-notes-" + Date.now())`（时间戳目录，仓库外；`mkdirSync(..., { recursive: true })`） |
| `OUT_DIR` | `join(TMP, "out")` |
| `TSCONFIG` | `join(TMP, "tsconfig.smoke.json")` |
| `WS_A` / `WS_B` | `join(TMP, "ws-a")` / `join(TMP, "ws-b")`（两个工作区根；`WS_B` 目录建但**内部零条目**） |
| 库内文档路径 | `join(WS_A, "sample-paper.pdf")`（**无需真实文件**：`isLibraryFilePath` 对缺失文件按在库内处理 ⇒ 存为相对路径 `sample-paper.pdf`，断言字面因此稳定） |

#### 1.5.2 临时 tsconfig 字段（逐字，写入 `<TMP>/tsconfig.smoke.json`）

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "rootDir": "<repo>/pix/src",
    "outDir": "<TMP>/out",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "types": ["node"],
    "typeRoots": ["<repo>/pix/node_modules/@types"]
  },
  "files": ["<repo>/pix/src/main/notes-store.ts", "<repo>/pix/src/main/library-root.ts"]
}
```

- `<repo>` = `resolve(PIX_DIR, "..")` 运行期现算，写进 JSON 前用 `JSON.stringify(..., null, 2)`。
- **禁止**先把源文件复制到临时目录再编译（编译对象必须与工作树源文件同一份）。
- 编译命令：`spawnSync(process.execPath, [TSC_JS, "-p", TSCONFIG], { cwd: PIX_DIR, encoding: "utf8" })`。

#### 1.5.3 编译产物期望与加载方式

| 项 | 冻结 |
| --- | --- |
| 必需产物 | `out/main/notes-store.js`、`out/main/library-root.js`（`rootDir = <repo>/pix/src` ⇒ `main/…` 路径保持） |
| 允许附带 | `out/shared/types.js`（`import type "../shared/types.js"` 的类型依赖；R10 A.4 实测的 3 文件形态） |
| 判失败（直接退出 1，不进入断言） | `tsc` 退出码 ≠ 0；必需产物缺失；`readdirSync(OUT_DIR, { recursive: true })`（Node ≥ 20.1 能力；本机实测 `node --version` ⇒ `v24.19.0`）返回的路径集合出现上表之外的文件（`*.tsbuildinfo` / `*.d.ts` 等均判失败） |
| 加载 | `const require = createRequire(import.meta.url);` → `require(join(OUT_DIR, "main", "notes-store.js"))`、`require(join(OUT_DIR, "main", "library-root.js"))`；两处解析到**同一绝对路径** ⇒ `setLibraryRoot` / `clearLibraryRoot` 对 `notes-store` 内部同一模块实例生效 |

#### 1.5.4 驱动面（只用真实文件系统）

| 项 | 冻结 |
| --- | --- |
| 根切换 | `setLibraryRoot(WS_A)` / `setLibraryRoot(WS_B)`（真调用，不 mock） |
| 写坏文件 | 直接 `writeFileSync(<WS_A>/.pix-read/notes.json, "not json")` 造 `corrupt` |
| 写失败注入 | `mkdirSync(join(WS_A, ".pix-read", "notes.json.tmp"), { recursive: true })` ⇒ `writeFileSync` 抛 EISDIR（`writeFileAtomic` 的 `removeTemp` 无 `recursive`，注入目录在整个失败窗口内保持存在）；清理 = `rmSync(tmp, { recursive: true, force: true })` |
| 空库 | `WS_B`（目录存在、`.pix-read` 从未创建）⇒ 读侧按空库 |
| 禁止 | mock `node:fs`；引入任何依赖；import electron / 渲染层 / `packages/**`；在仓库内写任何文件 |

#### 1.5.5 断言分组与 26 条（冻结，不得减少；可追加且必须在开发档登记）

**组 `undo-roundtrip`（8 条）**

| # | 步骤 | 断言 |
| --- | --- | --- |
| 1 | `setLibraryRoot(WS_A)`；`addNote` ×3：`A1 = { kind:"excerpt", docFilePath:<WS_A>/sample-paper.pdf, page:1, text:"We study retrieval over long documents where the attention budget is the binding constraint." }`、`A2 = { kind:"answer", … page:2, text:"结论：稀疏注意力在三分之一的预算下保持召回。" }`、`A3 = { kind:"excerpt", … page:7, text:"Section 4. Reproducibility: all runs use three seeds and report the median." }` | 三次 `success === true`；`loadNotes().notes.length === 3`；文件 id 序列 = 新增顺序（`[A1.id, A2.id, A3.id]`）；每条 `docPath === "sample-paper.pdf"`（相对路径形态） |
| 2 | 每一步 | `result.notes` 的 id 序列 === 直接读文件解析出的 id 序列（逐条相等） |
| 3 | `deleteNote(A2.id)` | `success === true`；`note` 必在；`note.id/page/text/kind/docPath` 与 A2 逐字段相等 |
| 4 | 删除后立即读文件 | 文件内无 `A2.id`；条数 2；sha256 ≠ 删除前 |
| 5 | `restoreNote(A2.id)` | `success === true` |
| 6 | 还原后读文件 | 逐字节等于删除前（sha256 相等 ⇒ 原下标插回、`createdAt` / `updatedAt` 未刷新） |
| 7 | 同上 | `result.notes` 的 id 序列回复为 `[A1.id, A2.id, A3.id]` |
| 8 | 再次 `restoreNote(A2.id)` | `not-found` + 逐字 `没有可撤销的删除`（槽已清） |

**组 `undo-failures`（8 条）**

| # | 步骤 | 断言 |
| --- | --- | --- |
| 1 | 无槽时 `restoreNote("missing-id")` | `not-found` + 逐字 `没有可撤销的删除` + 零写盘（sha256 不变） |
| 2 | `deleteNote(A1.id)` 设槽后，`restoreNote(A3.id)` | `not-found` + 同逐字文案 + 零写盘 |
| 3 | `setLibraryRoot(WS_B)` 后 `restoreNote(A1.id)` | `not-found` + 同逐字文案 + A 库 sha256 不变 + `join(WS_B, ".pix-read")` **不存在** |
| 4 | `setLibraryRoot(WS_A)` 后再还原 | 同一槽仍可成功还原且字节回复删除前（失败不清槽） |
| 5 | 删 X 后手工把同 id 条目写回文件 → `restoreNote(X.id)` | `invalid-input` + 逐字 `该笔记已重新存在，无法撤销` + 零写盘 + 文件内该 id 恰 1 条 |
| 6 | 删 X 后写入「新 id、同 `docPath/page/kind/text`」条目 → `restoreNote(X.id)` | `invalid-input` + 逐字 `该笔记内容已重新存在，无法撤销` + 零写盘 + 文件内该去重键恰 1 条 |
| 7 | 预置 `notes.json.tmp` 为目录 → `restoreNote` | `write-failed` + 逐字 `笔记写入失败` + 原字节不变 + **槽保留**；清理注入口后重试 ⇒ `success === true` 且字节回复删除前 |
| 8 | 外部 `rmSync(notes.json)` 后 `restoreNote` | `success === true` 且写出「只含该条」的文件（既有语义，**非本轮回归**，点名一次） |

**组 `undo-slot-lifecycle`（6 条）**

| # | 步骤 | 断言 |
| --- | --- | --- |
| 1 | 设槽后 `updateNoteComment(另一条)` + `addNote(新条)` | 二者都**不清槽**：随后仍可还原；新条目与备注保留；按原下标插回 |
| 2 | 失败的 `deleteNote("missing-id")` | `not-found` 且**不清槽**（随后原槽还原成功） |
| 3 | 连删 A、B | 先还原 A ⇒ `not-found`（覆盖式只存最近一条）；还原 B ⇒ 成功 |
| 4 | 写坏 `notes.json` → `resetCorruptNotes()` | 成功 ⇒ 槽已清（旧 id 还原 ⇒ `not-found`）+ 备份文件存在（`notes.json.corrupt-<yyyyMMdd-HHmmss>`）+ 重建后为 `version: 1` 且 `notes: []`，**按 2 空格缩进格式**（不是单行 JSON） |
| 5 | `addNote` 1 条 → `deleteNote` 该条（**重新设槽**；文件保持合法）→ 文件未损坏时 `resetCorruptNotes()` | `not-corrupt` + 逐字 `笔记文件未损坏，无需重建` + 不清槽（随后仍可还原） |
| 6 | 组内每一步 | 「主进程回传列表 === 文件所存」（收尾复查） |

**修订说明（F1）**：#4 成功后槽已被清空（`notes-store.ts:440` 成功分支 `undoSlot = null`；`:422` 的 `not-corrupt` 在任何槽操作之前早返回）⇒ #5 必须先显式**重建槽**（`addNote` + `deleteNote`）才能验证「不清槽」；判据文字与条数不变（仍 6 条；需求 §3 组 3 的同款字面缺口按本步骤执行即可满足）。

**组 `export-and-empty`（4 条）**

| # | 步骤 | 断言 |
| --- | --- | --- |
| 1 | `setLibraryRoot(WS_B)` → `exportNotesMarkdown()` | `success === false` + `code === "empty"` + 逐字 `暂无笔记可导出` + `join(WS_B, ".pix-read", "notes.md")` 不存在 |
| 2 | `setLibraryRoot(WS_A)`，写 2 条笔记 → `exportNotesMarkdown()` | `success === true` + `count === 2` + `filePath` 以 `.pix-read/notes.md` 结尾（用 `endsWith` 或 `join` 归一后比较）+ 产物文本含 `## sample-paper.pdf（2 条）` 且含两条的 `> ` 引用行（`renderMarkdownEntry` 逐行前缀） |
| 3 | 同上 | 导出不改 `notes.json` 字节（前后 sha256 相等） |
| 4 | 同上 | `.pix-read/` 之外零写盘：`readdirSync(WS_A)` === `[".pix-read"]`；`readdirSync(WS_B)` === `[]` |

#### 1.5.6 输出协议与退出码（逐字冻结）

- 每条一行：`[通过] <组名> #<序号> <一句话说明>` / `[失败] <组名> #<序号> <一句话说明>：<实际值>`。
- 组内首行打印组名横幅（例：`== 组 undo-roundtrip ==`）。
- 末尾汇总一行**逐字**：`通过 {passed} / 失败 {failed}`。
- 退出码：全部通过 ⇒ `0`；任一失败 ⇒ `1`（**含**编译失败、产物缺失、断言失败）。

#### 1.5.7 自清理与零残留

- `finally` 内 `rmSync(TMP, { recursive: true, force: true })`；清理失败只打印 `[警告] 临时目录未清理：<path>`，**不改退出码**，也不得把断言失败掩盖为成功。
- 运行结束后 `git status --short` 只能看到本轮白名单文件；脚本不在仓库内写任何文件（含 `.pix-read/**` / `notes.md` / 日志）。
- 与工程门的关系：`pix/scripts/**` 不在 `pix/tsconfig.json` 的 `include`（`["src/renderer/**/*.ts", "src/renderer/**/*.vue", "src/shared/**/*.ts"]`）内 ⇒ 与 `ui-shot.mjs` 同待遇，不进 `npm run check` 的类型面，正确性由「实跑 + 退出码」判定。

---

## 2. 与既有冻结面的关系

### 2.1 本轮不得改动的清单（逐条冻结）

| 面 | 冻结内容 |
| --- | --- |
| 搜索 / 排序 / 撤销 / 复制的语义 | `notes-view.ts` 的全部导出与 `matchesSearch` / `sortNotesForView` / `applyViewToGroups` 的实现（本轮零改动）；面板内不得出现第二份 `includes(` / `filter(` / `sort(` |
| 计数四分叉 | `共 {T} 条` / `本章 {V} 条 / 共 {T} 条` / `当前 {V} 条 / 共 {T} 条` / `命中 {V} 条 / 共 {T} 条`；错误态 `.notes-count` 空串；`.group-count` 逐字 `共 {N} 条` |
| 空态六分支与逐字文案 | `.notes-empty` + **`.notes-empty .empty-title` 逐字 `还没有摘录`** + **`.notes-empty .empty-subtitle` 逐字 `在 PDF 中选中文字，点「摘录」保存到这里`**（M3 冻结读取节点；容器本体只判「在 DOM」）、`.notes-search-empty` 三态、`.notes-chapter-empty`、`.notes-filtered-empty`、`.notes-loading`、`.notes-error` |
| 撤销契约 | 主进程内存槽 + 校验顺序 + 逐字文案；渲染层 `UNDO_WINDOW_MS=5000` / `UNDO_ROW_MS=8000` / `UNDO_EXPIRED_MESSAGE`；`.notes-undo`（`v-if="notesStore.pendingUndo"`，在 `.notes-notice` 之后、`.notes-export-row` 之前） |
| 搜索行字面 | `placeholder="搜索原文或备注"`；`.notes-search-input` 盒模型（26px / 圆角 6 / 12px）；`.notes-search-clear` 为 `<v-btn icon="mdi-close" title="清空搜索">`；`.notes-search-clear` 不 `stopPropagation`，仍 `input.focus()` |
| DOM 门控 | `.notes-search` / `.notes-sort` 的 `v-if="status === 'ready' && hasNotes"`；`.notes-search-clear` 的 `v-if="searchActive"`；`.notes-undo` 的 `v-if="pendingUndo"` |
| 类名 | 需求 §0.1 列出的 28 个类名（`.notes-panel` … `.notes-filtered-empty`）与 N74 新断言触及的 `.note-actions` / `.note-copy` / `.note-ask-wrap` / `.note-body` / `.notes-empty .empty-title` / `.empty-subtitle` |
| 几何 | `.note-copy` 在 `.note-ask-wrap` 之前、两者同行、`.note-actions` 右对齐且是 `.note-body` 最后子节点（65-5）：新增断言**只能追加**，不得替换 |
| 场景面 | 场景 00–11 / 20–24 / 30–36 / 40–46 / 50–55 / 60–65 的全部 label 与 18 张 R10 截图名；`notes-search|esc`（60-3）与 `notes-search|clear-button`（60-4）的全部字段（`value` / `focused` / `rows` / `countText` / `clearInDom` 与「Esc 前 `focused:true`」的空断言防护） |
| R6 / R9 面 | 阅读现场（`reader-state.json`）与知识地图的类名 / 文案 / token；`.reader-stage` 只被 N73-2 **只读**引用 |
| 浮层面 | `.quick-ask` / `.quick-ask-btn` / `.quick-ask-feedback` / `.is-ok` / `.is-duplicate` / `.is-error` / `FEEDBACK_MS = 2500` / `showFor` 的定位钳制 |
| 产品源码面 | `pix/src/main/**`、`pix/src/shared/types.ts`、stores、utils、其它 `.vue`、样式变量文件本轮零 diff（除 N73-1 / N73-2 两个 `.vue` 与 N74-2 条件式样式面） |

### 2.2 N73-1 显式改写的唯一一条旧冻结字面（改哪一条 → 改成什么）

| 项 | 内容 |
| --- | --- |
| 被改写的旧字面（逐字） | `R10-req.md:190`「Esc：清空查询并 `blur()`（不加 `stopPropagation`，阅读区既有的全局 Esc 处理不在本轮改动范围）」；`R10-req.md:272`「`@keydown.esc` 只做「清空 + `blur()`」，不 `stopPropagation`、不做别的副作用」；`R10-design.md:180`（同款冻结）、`R10-design.md:456`（文件级清单内的同款表述）、`R10-design.md:777`（「Esc 与清空按钮都**不** `stopPropagation`」）；代码侧旧注释 `NotesPanel.vue:200` |
| R11 起的新字面（逐字） | 「笔记搜索框内的 Esc 只清空查询并失焦；**该输入框内的 Esc 不触发阅读区任何 Escape 语义**（框选模式保持开启、PDF 搜索面板保持打开）」 |
| 旧断言的更新方式 | ① **60-3（`notes-search|esc`）与 60-4（`notes-search|clear-button`）的全部字段逐字保留**、继续通过（它们只读 `value` / `focused` / `rows` / `countText` / `clearInDom`，不含 `stopPropagation` 相关判据）；`pressSearchEsc` 全脚本唯一调用点在 60-3（`:5068`）⇒ 该改动不触碰其它既有断言；② 走查判据从 R10 的「面板内不出现 `stopPropagation`」改为 §1.1.3 的 5 条；③ 新的 capability 断言只落在 `r11-esc-scope` 组；④ 开发 / 评审 / 走查读到 R10 旧档的该条时，**以本表为准**（旧档字面已由 R11 需求 §0.2 显式改写） |
| 不受影响 | PDF 搜索框、页码输入框、chat composer 等其它输入框内的 Esc 一律保持既有语义（`PdfViewer` 的 `captureMode` 优先分支对它们仍然生效） |

### 2.3 M6 的 4 张截图目视比对留档方式（改前 / 改后）

**范围（逐字照需求 §0.7）**：面板复位（`scrollTop = 0`，幂等写、不产生 scroll 事件）后随即截图的 4 处 —— `02-notes-list.png`、`03-notes-current-doc.png`、`08-notes-after-excerpt.png`（前一拍 `:1235` 起为「已在笔记中」duplicate 反馈，浮层处于 `mode="feedback"`）、`32-answer-note-badge.png`。浮层滚动隐藏来源即 `PdfSelectionQuickAsk.vue:137-138` 的 `onStageScroll`（N73-2 的改动点）。**预期**无差异，但必须留档。

**留档方式（R11-dev.md 内逐张登记，表模板如下）**

| 截图 | 基线文件（`<pix-v05-r11-base>/shots/…`） | 验收文件（`<pix-v05-r11-after>/shots/…`） | 差异（逐项写） | 结论 |
| --- | --- | --- | --- | --- |
| `02-notes-list.png` | 实跑路径 | 实跑路径 | 逐项（浮层是否可见 / 其它） | 预期 / 非预期 |
| `03-notes-current-doc.png` | 同上 | 同上 | 同上 | 同上 |
| `08-notes-after-excerpt.png`（**必看**，含 duplicate 反馈态） | 同上 | 同上 | 同上 | 同上 |
| `32-answer-note-badge.png` | 同上 | 同上 | 同上 | 同上 |

**判定规则（冻结）**：差异**只允许**是「浮层是否可见」；若只出现浮层差异 ⇒ 登记为 N73-2 的预期结果；**出现任何其它内容差异 ⇒ 判回归失败**（记录两张原图路径 + 差异描述，停线排查，不得以「目视误差」结案）。比对方式：同尺寸（1600×1000）下 1:1 打开两图并排目视（本轮不做像素级 diff，PRD 反需求 5）。

### 2.4 零 diff 清单与判据

**零 diff 清单（下列 `git diff --` 的输出必须为空；`README.md` / `pix/package.json` 不在其中）**

```bash
git status --short
git diff --stat
git diff -- pix/src/main pix/src/shared/types.ts pix/src/renderer/utils pix/src/renderer/stores pix/src/renderer/composables \
          pix/src/renderer/pages pix/src/renderer/assets pix/src/renderer/components/workspace/PdfViewer.vue \
          pix/src/renderer/components/workspace/PdfSearchPanel.vue pix/src/renderer/components/workspace/ChatPanel.vue \
          pix/src/renderer/components/workspace/KnowledgeMap.vue pix/src/renderer/components/workspace/LibraryPanel.vue \
          pix/src/renderer/components/workspace/ReaderPanel.vue \
          package-lock.json pix/build pix/resources pix/tsconfig.json \
          pix/tsconfig.main.json pix/tsconfig.preload.json pix/vite.config.ts
```

期望：`git status --short` 只列本轮白名单文件（`M pix/src/renderer/components/workspace/NotesPanel.vue`、`M pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`、`M pix/scripts/ui-shot.mjs`、`?? pix/scripts/smoke-notes.mjs`、`M pix/package.json`、`M README.md`、`?? docs/pm/R11-*.md`）；`git diff --stat` 只含白名单内的已修改文件（`NotesPanel.vue` / `PdfSelectionQuickAsk.vue` / `ui-shot.mjs` / `pix/package.json` / `README.md`）；上面 `git diff --` 的**全部路径逐条为空**。**注意**：`README.md` 与 `pix/package.json` **不在零 diff 清单内**——它们预期有 diff（见下表），不得把它们的 diff 判为越界。

**预期有 diff 的两个文件（逐字判据 = §5.4 第 14/15 项）**

| 文件 | 命令 | 期望 |
| --- | --- | --- |
| `pix/package.json` | `git diff -- pix/package.json` | 只有 `scripts` 增 `"smoke:notes": "node scripts/smoke-notes.mjs"` 一行的 hunk（人工逐行确认只含该键；`+++` / `---` 头行除外）；`dependencies` / `devDependencies` / `build` / `check` 零改动 |
| `README.md` | `git diff -- README.md` | 只有 N76 的 7 处行内更正（保留行首 `- ` 与既有列表结构），其它内容逐字不动 |

---

## 3. 失败路径表

| # | 情形 | 期望表现 | 证据 / 判据 |
| --- | --- | --- | --- |
| 1 | **启动守卫拒绝**（`PIX_SHOT_ROOT` 不在 `tmpdir()` 下，或与仓库互相包含） | `console.error` 逐字守卫文案 + `app.exit(1)`；**零副作用**（不建目录、不删路径、不设 `userData`） | §1.3.5【离屏·守卫负向控制】（`EXIT=1` + `test ! -e` 两次） |
| 2 | **清理失败**（`rmSync(SHOTS_DIR, { recursive: true, force: true })` 抛错：目录被占用 / 权限） | 未捕获异常冒到 `main()` 的 `.catch`（`:5943-5946`）⇒ `[ui-shot] 启动失败：…` + `app.exit(1)`；**不进入场景**，不进断言、不写清单 | 【走查】清理点在 `writeFixtures()` 之前、无 try/catch 包裹（与既有 `mkdirSync` 同风格）；实跑时目录被占用 ⇒ `EXIT=1` |
| 3 | **结束自检不一致 ①（截图集合 ≠ 清单集合）** | `errors.push("截图目录与清单不一致：磁盘 {N} 张 / 清单 {M} 张，差集 […]")`；退出码 1；`failure` 文本若存在则**原样保留**（不覆盖） | §1.3.3；跑完 `echo "UI_SHOT_EXIT=$?"` ⇒ 1，输出含该文案 |
| 4 | **结束自检不一致 ②（白名单外条目）** | `errors.push("截图目录存在白名单外条目：[…]")`；退出码 1 | §1.3.5【离屏·预置残留复核】的残留必须被清掉 ⇒ 该分支在正常路径恒不命中（负向演练可用临时改脚本造一次，改完 `git diff --exit-code` 还原） |
| 5 | **编译失败（N75）**：`TSC_JS` 路径不存在、tsconfig 非法、源文件类型错误 | `spawnSync.status !== 0` ⇒ 打印 `tsc` 的 stdout/stderr ⇒ **不进入断言**，直接退出 1；输出含失败原因 | 需求 §3「失败路径抽样」1（临时改 `tscJs` 指向不存在路径 ⇒ 非 0 退出） |
| 6 | **产物缺失 / 多出（N75）**：必需两个 `.js` 缺失，或 `out/**` 出现额外路径，或出现 `*.tsbuildinfo` | 打印实际目录树 ⇒ 退出 1 | §1.5.3；负向演练同上（改脚本后 `git diff --exit-code` 还原） |
| 7 | **断言失败（N75）**：任一条不成立 | 该条打 `[失败] …：<实际值>`，其余条目**照常执行**；末尾汇总行照打；退出 1 | 需求 §3「失败路径抽样」2 |
| 8 | **窄栏 220px 溢出判定失败（N74-2）** | 该相位红灯 ⇒ 按「修 or 不修」边界**必须修**（只动样式面）⇒ 修完重跑 `check` + `after` 取证 + §5.2 零缺失比对（含 65-5 仍绿） | §1.4.4 边界表；`git diff` 只落在 `NotesPanel.vue` 样式面 |
| 9 | **窄栏场景不可达**（`.note-actions` 未渲染 / `.layout-left` 取不到 rect） | 视为判据不可判定 ⇒ 开发档写明原因，**不得**改用其它元素降级；不得判绿 | §1.4.4 注 |
| 10 | **stub 面与 `preload.ts` 不一致** | 现象：`window.pixApi.<方法>` 未定义 ⇒ 面板动作抛错或静默失败 ⇒ 场景红灯（`waitFor` 超时）/ 断言红灯。**本轮 stub 面零新增方法**（N74-3 只增 `resolvedAt` 记录与控制口读取，不改 API 面）⇒ 正常路径不会命中；若命中，按 `preload.ts` 的方法名与返回形状逐字校正 stub（`ui-shot.mjs` 的注释已冻结「stub 的 pixApi 必须与 preload.ts 一致」） | 【走查】`grep -n "notesRestore\|notesAdd\|notesDelete\|notesReset" pix/scripts/ui-shot.mjs pix/src/main/preload.ts` 两侧方法名与形状逐字对齐；【离屏】r11-4 的撤销成功（`.notes-notice.is-success` 逐字 `已还原该条笔记`）即是 stub 契约在线的证据 |
| 11 | **N73-1 越界未阻断**（忘了 `stopPropagation` 或写成 capture） | `r11-1` ②红灯（`.pdf-search-panel` 消失）、`r11-2` ③④红灯（`.capture-layer` 被移除 / `capture-mode` 类消失） | §1.4.2 断言表 |
| 12 | **N73-2 收得太窄 / 太宽** | 太窄（按类名枚举例外）：走查 `grep -c "closest(" PdfSelectionQuickAsk.vue` 非 0；太宽（任何滚动都不隐藏）：`r11-3` 相位 `reader-scroll-control` ⑧红灯（`.pdf-scroll` 滚动后浮层仍在） | §1.2.2 + §1.2.4 |
| 13 | **面板滚动仍隐藏浮层（修复未生效）** | `r11-3` 相位 `notes-panel-scroll` ④红灯；60-9 追加的反馈断言也可能红灯（面板滚动不再吞掉反馈是同一根因） | §1.2.4 |
| 14 | **M6 目视发现非预期差异** | 判回归失败：登记两张原图路径 + 差异描述，停线排查（不得结案为「目视误差」） | §2.3 判定规则 |
| 15 | **烟测脚本清理失败** | 只打印 `[警告] 临时目录未清理：<path>`，**不改退出码**；不得把断言失败掩盖为成功 | §1.5.7 |
| 16 | **烟测脚本在仓库内留下产物** | 判失败：`git status --short` 出现白名单外文件（含 `pix-smoke-notes-*` / `.pix-read/**`） | §1.5.7 + §5.1 收尾核对 |

---

## 4. 文件级清单（动作 + 具体改动点 + 不变量）

| 文件 | 动作 | 具体改动点 | 不变量 |
| --- | --- | --- | --- |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | N73-1：`onSearchEsc(event: KeyboardEvent)` 增 `event.stopPropagation()`；注释逐字改写（§1.1.2）；模板绑定逐字不变 | 清空 + `blur()` 的顺序；搜索行字面与盒模型；计数四分叉；空态六分支与逐字文案；`.notes-undo` 文案 / 定时器 / 门控；复制与追问的类名 / DOM 顺序 / `FEEDBACK` 常量；`@keydown` 仍恰 1 处；无 `preventDefault`；无第二处键盘监听 |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改（**条件**，仅当 220px 实测溢出） | N74-2 样式面最小修复：**保持单行**的收缩写法（首选收窄 `.note-actions` 的 `gap` 与/或 `.note-copy` / `.note-ask` 的 `padding`；只允许调整 `padding` / `gap`）；**`flex-wrap` 与判定项 ⑥ 互斥、不得使用**；收缩到下限仍红 ⇒ 按 §1.4.4 的升级路径回到需求档 | 不改类名 / 文案 / DOM 顺序；默认 268px 下既有 65-5 几何断言仍绿；`w/h/fontSize/color/background` 无非预期差异 |
| `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 修改 | N73-2：`onStageScroll(event: Event)` 增三条守卫（§1.2.1）；新增判定只允许出现在该函数内，且不含按类名枚举的例外分支 | 监听注册与移除；`hide()` 五项清理；`showFeedback` 的首行守卫；`FEEDBACK_MS`；浮层类名 / 模板 / 定位算法 |
| `pix/scripts/ui-shot.mjs` | 修改 | N73-3：`assertOutRootSafe()`（`main()` 首条语句）+ `rmSync(SHOTS_DIR, …)`（唯一清理点）+ 结束自检两条 + import 三项（`readdirSync` / `basename` / `sep` / `tmpdir`）；N73-1 / N73-2：`SEL` 增 11 项 + helper（§0.4）+ 场景 `r11-1` / `r11-2` / `r11-3` + 60-9 追加 1 条反馈断言 + `excerptFirstSpan` 注释改写；N74：场景 `r11-4` / `r11-5`（+ 可选 `r11-6` 与 stub 的 `resolvedAt`） | 既有场景 / label / 截图名零改动；`writeFixtures()` 的 OUT_ROOT 子项保留；`MANIFEST.json` / `MEASUREMENTS.json` 字段不变；只写 `OUT_ROOT`；不新增产品代码开关 |
| `pix/scripts/smoke-notes.mjs` | **新建** | §1.5 全表：编译面 / 产物校验 / 加载 / 驱动面 / 4 组 26 条 / 输出协议 / 退出码 / 自清理 | 只读仓库源文件、只写 `os.tmpdir()` 下临时目录；零依赖；无 electron / 渲染层 import；无 `any`（`.mjs` 无类型面，但不得写动态 `import(`） |
| `pix/package.json` | 修改（最小） | `scripts` 增 `"smoke:notes": "node scripts/smoke-notes.mjs"` | `dependencies` / `devDependencies` / `build` / `check` 逐字零改动；不新增第二个脚本 |
| `README.md` | 修改 | N76 的 7 行更正（§4 表格逐字，保留行首 `- ` 与既有列表结构） | 其它内容逐字不动；不得顺手重排 / 扩写 |
| `docs/pm/R11-design.md` | 新建（本档） | —— | 不改源码 |

**范围外（任何情况下不动）**：`pix/src/main/**`、`pix/src/shared/types.ts`、`pix/src/renderer/{stores,utils,composables,pages,assets}/**`、其它 `.vue`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/build/**`、`pix/resources/**`、`packages/**`、`package-lock.json`、`.gitignore`、历史档件（`R6–R10-*.md` / `PRD-*.md` / `REMAINING.md` / `AGENTS.md`）。

---

## 5. 验证方案

### 5.1 命令（按执行顺序）

```bash
# 步骤 0：动工前（未改任何文件）—— 唯一工程门 + 改前基线实跑
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-base" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_BASE_EXIT=$?"
# ⇒ 基线必须用「全新目录」首次运行（旧脚本不清理 shots/，历史残留会污染读数）
# ⇒ 把该次 MANIFEST.json 的 shots 张数 / MEASUREMENTS.json 条数写进 R11-dev.md（R10 交付档记录为 112 / 153）

# 步骤 1：实现 N73-1 / N73-2 / N73-3 / N74 / N75 / N76 后
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"

# 步骤 2：改后取证（与基线不同的 OUT_ROOT）
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-after" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_AFTER_EXIT=$?"
# 期望：UI_SHOT_AFTER_EXIT=0 + MANIFEST.json.failure === null + 新增 4 组（可选 5 组）全绿 + 新增 6 张（可选 7 张）截图齐备

# 步骤 3：烟测（连续两次）
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes; echo "SMOKE_NOTES_EXIT=$?"   # ×2

# 步骤 4：零残留
cd E:/develop/PiX-Read && git status --short
```

### 5.2 既有断言零缺失的比对方法（逐字命令）

```bash
BASE="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-base"
AFTER="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-after"

# ① 截图 basename 集合零缺失 + failure 字段
node -e "const fs=require('fs');const L=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));const b=L(process.argv[1]),a=L(process.argv[2]);const S=(x)=>new Set(x.shots.map(s=>s.name));const bs=S(b),as=S(a);const miss=[...bs].filter(n=>!as.has(n));const extra=[...as].filter(n=>!bs.has(n));console.log(JSON.stringify({base:b.shots.length,after:a.shots.length,missing:miss,added:extra.length}));console.log('AFTER_FAILURE='+JSON.stringify(a.failure))" "$BASE/shots/MANIFEST.json" "$AFTER/shots/MANIFEST.json"

# ② 测量 label 集合零缺失（按 label 计次，基线每 label 的条数不得减少）
node -e "const fs=require('fs');const L=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));const cnt=(x)=>{const m=new Map();for(const e of x)m.set(e.label,(m.get(e.label)||0)+1);return m};const cb=cnt(L(process.argv[1])),ca=cnt(L(process.argv[2]));const miss=[...cb].filter(([k,v])=>(ca.get(k)||0)<v).map(([k,v])=>k+':'+v+'->'+(ca.get(k)||0));console.log(JSON.stringify({baseLabels:cb.size,afterLabels:ca.size,missing:miss}))" "$BASE/shots/MEASUREMENTS.json" "$AFTER/shots/MEASUREMENTS.json"

# ③ 结束自检判据（脚本内已自动判；此处人工复核）
ls -A "$AFTER/shots" | grep -v -E '\.png$' | grep -v -E '^(MANIFEST|MEASUREMENTS)\.json$' ; echo "STRAYS_EXIT=$?"   # 期望 STRAYS_EXIT=1（无输出）
```

**判定**：① `missing` 为空数组、`AFTER_FAILURE=null`、`added` 恰为 6（或 7）；② `missing` 为空数组；③ 无白名单外条目。**允许位移**：与 R10 同口径 —— 只允许「因新增行 / 新增控件导致的纵坐标位移」（本轮预期 0 位移，因为 N73-1 / N73-2 不改布局）；`w/h/fontSize/color/background` 不得出现非预期差异（R10 审查 §4.1 的搜索行盒模型断言继续作为护栏）。

### 5.3 烟测实跑命令与预期输出（N75）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes; echo "SMOKE_NOTES_EXIT=$?"
```

**预期输出（形状冻结，条数与文案为真值）**

```
== 组 undo-roundtrip ==
[通过] undo-roundtrip #1 …
…（8 条）
== 组 undo-failures ==
[通过] undo-failures #1 …
…（8 条）
== 组 undo-slot-lifecycle ==
[通过] undo-slot-lifecycle #1 …
…（6 条）
== 组 export-and-empty ==
[通过] export-and-empty #1 …
…（4 条）
通过 26 / 失败 0
SMOKE_NOTES_EXIT=0
```

- 末行汇总逐字 `通过 {passed} / 失败 {failed}`；连续两次运行都 `SMOKE_NOTES_EXIT=0`。
- **失败路径抽样（必须实测并留档；两项注入都只临时修改 `pix/scripts/smoke-notes.mjs`，改完立即还原并以 `git diff --exit-code -- pix/scripts/smoke-notes.mjs` 证明；不得为验证去改 `pix/src/**`）**：
  1. 临时把 `spawnSync` 的 `TSC_JS` 指向不存在路径 ⇒ 非 0 退出、输出含失败原因、**不进入断言**；
  2. 临时把一条断言里的期望文案改错 ⇒ 该条 `[失败] …：<实际值>`、其余条目不受影响、退出码 1。
- **跑完核对**：`cd E:/develop/PiX-Read && git status --short` 只出现白名单文件；`ls -d "$TEMP"/pix-smoke-notes-* 2>/dev/null` 无残留。

### 5.4 走查清单（一次跑完，逐条对人）

| # | 核对 | 命令 / 位置 | 期望 |
| --- | --- | --- | --- |
| 1 | Esc 阻断唯一 | `grep -c "stopPropagation" pix/src/renderer/components/workspace/NotesPanel.vue` | `1` |
| 2 | 不抢默认行为 | `grep -c "preventDefault" pix/src/renderer/components/workspace/NotesPanel.vue` | `0` |
| 3 | 无第二处键盘监听 | `grep -c 'addEventListener("keydown"' pix/src/renderer/components/workspace/NotesPanel.vue` / `grep -c "@keydown" …` | `0` / `1` |
| 4 | 阅读区零 diff | `git diff -- pix/src/renderer/components/workspace/PdfViewer.vue` | 空 |
| 5 | 滚动判定唯一且无枚举 | `grep -n "resolveStage()\|instanceof Node\|stage.contains(\|closest(" pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 前三条各 1 处、`closest(` 0 处 |
| 6 | 滚动监听不变 | `grep -n 'addEventListener("scroll"' pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 1 处且带 `true` |
| 7 | 清理点唯一 | `grep -c "rmSync(SHOTS_DIR" pix/scripts/ui-shot.mjs` | `1` |
| 8 | 守卫先于清理 | `grep -n "assertOutRootSafe()\|rmSync(SHOTS_DIR\|mkdirSync(OUT_ROOT\|app.setPath(\"userData\"" pix/scripts/ui-shot.mjs` | `assertOutRootSafe` 行号 < `rmSync(SHOTS_DIR` 行号，且 `assertOutRootSafe` 是 `main()` 首条语句 |
| 9 | 自检落点 | `grep -n "MEASUREMENTS.json\|截图目录与清单不一致\|白名单外条目\|server.close()" pix/scripts/ui-shot.mjs` | 自检两条在 `MEASUREMENTS.json` 写入之后、`server.close()` 之前 |
| 10 | import 面 | `grep -n "node:fs\|node:path\|node:os" pix/scripts/ui-shot.mjs \| head` | 含 `readdirSync` / `basename` / `sep` / `tmpdir`；无新依赖 |
| 11 | 面板零新增耦合 | `grep -n 'v-if="notesStore.pendingUndo"' pix/src/renderer/components/workspace/NotesPanel.vue` | 命中且不含 `hasNotes` / `status` |
| 12 | 新增断言只追加 | `git diff -- pix/scripts/ui-shot.mjs \| grep -E "^-" \| grep -v "^---"` | 只允许删改：`excerptFirstSpan` 的注释块、`SEL` 对象插入处的相邻行、`main()` 的行位移；**不得**出现既有 `record(` / 既有 `capturePage(` / 既有 label 的删除 |
| 13 | 烟测不进类型面 | `git diff -- pix/tsconfig.json pix/tsconfig.main.json pix/tsconfig.preload.json` | 空 |
| 14 | package.json 最小 | `git diff -- pix/package.json` | 只有 `scripts` 一行的增补 |
| 15 | README 最小 | `git diff -- README.md` | 只有 N76 的 7 处行内改动 |
| 16 | 零依赖 | `git diff -- package-lock.json` / `git diff -- packages` | 空 |

---

## 6. 风险 Top3 与判定方式

**风险 1「Esc 修好了越界，却把阅读区的 Esc 弄坏了」**

- 触发面：为了阻止冒泡把监听改成 capture、把 `onSearchEsc` 挂到 `window`、或顺手在 `PdfViewer` 里加输入框白名单 ⇒ 「焦点不在笔记搜索框时 Esc 不再退出框选模式 / 不再关闭 PDF 搜索面板」。
- 判定：`r11-1` 相位 `pdf-search-close-control`（⑧）+ `r11-2` 相位 `capture-mode-exit-control`（⑨⑩）+ §5.4 第 1~4 项走查 + 60-3 / 60-4 仍绿。
- 失败信号：`PdfViewer.vue` 出现任何 diff；`.notes-search-input` 之外的 Esc 行为改变；面板内出现第二个 `keydown` 监听；`stopPropagation` 计数 ≠ 1。

**风险 2「滚动隐藏规则收得太窄或太宽」**

- 触发面：太窄（只排除 `.notes-panel` 这一个选择器）⇒ 下一个滚动容器复发；太宽（改成「任何滚动都不隐藏」）⇒ 浮层停在已滚走的选区上。
- 判定：§1.2.2 表格 8 行逐条走查 + `r11-3` 的三个相位（§1.2.4：`notes-panel-scroll` ④⑤⑥ / `reader-scroll-control` ⑦⑧⑨）+ 既有 06 / 07 场景（选区与反馈）全绿。
- 失败信号：实现里出现按类名枚举的第二份判断（`target.closest(".notes-panel")`）；`.pdf-scroll` 滚动后浮层仍在（⑧ 红）；`document` 级滚动被当成隐藏条件。

**风险 3「烟测脚本只跑 happy path 或被环境漂移带偏」**

- 触发面：断言条数被裁剪（只留 add/delete 成功路径）；把仓库内源文件复制到仓库外再编译（编译对象与工作树脱钩）；临时目录写在仓库内留下产物。
- 判定：实跑输出必须逐条打印 4 组共 ≥26 条 `[通过]` 且无 `[失败]`；连续两次 `SMOKE_NOTES_EXIT=0`；运行后 `git status --short` 只出现白名单文件；走查编译命令只引用 `<repo>/pix/src/main/{notes-store,library-root}.ts` 与 `<repo>/pix/node_modules/typescript/lib/tsc.js`。
- 失败信号：输出里出现「跳过」/「仅 happy path」类分支；产物落在仓库内；`package.json` 除 `scripts` 之外出现 diff；断言条数少于 26。

**次级风险（不占 Top3，逐条登记并给判定）**

1. `r11-3` 的反馈断言落在 2500 ms 窗口内 ⇒ 判定：`data` 记录实测 `elapsedSinceFeedbackMs`；相位 2 与相位 1 之间不得插入 `sleep` / 截图重拍；若实测 > 2400 ms，按 §1.2.4 时序注记微调次序（先派发面板滚动再截图）并在开发档登记。
2. `r11-5` 的 `--pix-left-width` 忘记复位会污染后续画面 ⇒ 判定：`restored-width` 相位是**硬判据**（⑧⑨），非可选项。
3. `r11-4` 的撤销通知 4 s、撤销行 8 s 双窗口 ⇒ 判定：`restored` 相位的 ⑭ 紧跟 `waitFor` 采集（§1.4.3 时序要求）；全场耗时 < 8 s。
4. 启动清理会丢弃同一 `OUT_ROOT` 上一次运行的截图 ⇒ 判定：基线与验收必须用**不同** `PIX_SHOT_ROOT`（§5.1）；同目录重复运行属预期行为，不作为缺陷。

**风险条数：3 条 Top + 4 条次级 = 7 条登记。**

---

## 7. 开发分工

### 7.1 R11 单代理（推荐；白名单 + 执行顺序）

**白名单（6 个文件 + 本档）**

| # | 文件 | 动作 |
| --- | --- | --- |
| 1 | `pix/src/renderer/components/workspace/NotesPanel.vue` | N73-1（必改）+ N74-2 样式面（条件改） |
| 2 | `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | N73-2 |
| 3 | `pix/scripts/ui-shot.mjs` | N73-3 + N73-1/N73-2 场景 + N74 场景 |
| 4 | `pix/scripts/smoke-notes.mjs` | N75（新建） |
| 5 | `pix/package.json` | N75（仅 `scripts` 一键） |
| 6 | `README.md` | N76 |
| 7 | `docs/pm/R11-design.md`（本档）/ `R11-dev.md`（后续） | 文档（本轮只允许新建 `R11-design.md`） |

**执行顺序（冻结）**

1. **动工前基线**：`npm run check`（`CHECK_EXIT=0`）→ 基线 ui-shot 实跑（全新 `pix-v05-r11-base`）→ 记录实测截图张数与测量条数（写入 R11-dev.md，作为唯一基线；R10 的 112 / 153 仅作参考）。
2. **N73-1**：`NotesPanel.vue` 三处改动 → `npm run check`。
3. **N73-2**：`PdfSelectionQuickAsk.vue` 一处函数改写 → `npm run check`。
4. **N73-3**：`ui-shot.mjs` 守卫 / 清理 / 自检 + import → 单独验证守卫负向控制（此步之后才允许在任意 `PIX_SHOT_ROOT` 上实跑基线以外的目录）。
5. **N73-1 / N73-2 的场景**：`SEL` 增补 + helper + `r11-1` / `r11-2` / `r11-3` + 60-9 追加断言 + `excerptFirstSpan` 注释改写。
6. **N74 的场景**：`r11-4` / `r11-5`（可选 `r11-6` 与 stub `resolvedAt`）。
7. **N75**：`smoke-notes.mjs` 新建 + `package.json` 一键 → 连续两次实跑 + 两项失败注入抽样。
8. **N76**：`README.md` 7 行更正。
9. **N74-2 判定**：跑 `r11-5`；红 ⇒ 修样式面 ⇒ 重跑 `check` 与 `after` 取证；绿 ⇒ 登记「测定不溢出，不修」。
10. **验收**：`after` 取证（`pix-v05-r11-after`）→ §5.2 零缺失比对 + §1.3.5 自检判据 + 预置残留复核 + §2.3 的 4 张目视比对 → 全部留档到 R11-dev.md。

**纪律**：只提交本会话改动的文件（`git add <具体路径>`）；不跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；不改白名单外任何文件；不引入依赖。

### 7.2 备选切分（若拆两代理）

| 代理 | 白名单 | 内容 |
| --- | --- | --- |
| **A：界面与事件面** | `NotesPanel.vue`、`PdfSelectionQuickAsk.vue`、`ui-shot.mjs`（**仅** `SEL` 与 `runReaderStateScenarios` 末尾区块） | N73-1、N73-2、`r11-1` ~ `r11-5`（+ 可选 `r11-6`）、60-9 追加断言、`excerptFirstSpan` 注释、N74-2 条件式样式面 |
| **B：基建与文档面** | `ui-shot.mjs`（**仅** 顶部 import 区 / `main()` 首末）、`smoke-notes.mjs`（新建）、`pix/package.json`、`README.md` | N73-3（守卫 / 清理 / 自检）、N75、N76 |

**冲突点与冻结**：`ui-shot.mjs` 被两侧同时改 ⇒ 必须**串行**执行 —— **B 先落**（守卫与自检），A 再落（场景），理由：A 的验收（`after` 实跑）需要 B 的启动守卫允许启动；若并行，A 的实跑会被「无守卫」的中间态污染。**接口冻结**：B 不得改 `SEL` 与 `runReaderStateScenarios`；A 不得改顶部 import 与 `main()`。两侧共用 `record` 语义与 `MANIFEST` / `MEASUREMENTS` 字段（零改动），无需额外接口。

---

## 定稿修订（R11）

> 依据：`docs/pm/R11-review.md`「设计评审（R11）」§2 must-fix 4 条（F1–F4）。本节是**本档的定稿口径**：正文已就地同步，与正文冲突时以本节所列处理为准；逐条结论均来自真实文件内容（只读核对）与实跑 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（2026-09-16；非构建 / 测试 / 离屏）。
> 评审 §3 的 7 条**非阻塞**建议不在 must-fix 范围，本档不据此改动正文（其中 F3 的配套项「只允许调整 `padding` / `gap`」已随 F3 落进正文）。

| must-fix（评审 §2） | 结论 | 核实（真实文件 / 位置） | 处理（本档落点） |
| --- | --- | --- | --- |
| **F1** 组 `undo-slot-lifecycle` #4 → #5 之间缺「重建槽」步骤，按字面不可满足 | 接受 | `pix/src/main/notes-store.ts:440`（`resetCorruptNotes` 成功分支 `undoSlot = null`）、`:422`（`not-corrupt` 在任何槽操作之前早返回）、`:382`（`restoreNote` 无槽即 `not-found`） | §1.5.5 组 `undo-slot-lifecycle` #5 步骤列补「`addNote` 1 条 → `deleteNote` 该条（重新设槽；文件保持合法）」再调 `resetCorruptNotes()`；表下新增「修订说明（F1）」；判据文字与条数不变（仍 6 条） |
| **F2** `r11-3` 前置的 `.notes-empty` / `rows === 0` 防护是空操作（面板可能未 ready） | 接受 | `pix/scripts/ui-shot.mjs:3069-3072`（0 条时等待式恒真）、`:4760-4766`（`enterNotesProbe` 原样传 `rows`）、`pix/src/renderer/pages/WorkspacePage.vue:202`、`pix/src/renderer/stores/notes-store.ts:147-150`、`NotesPanel.vue:525/561`（loading 分支优先于空态分支） | §1.2.4 前置改为「`enterNotesProbe([], 0)` → 显式有界等待 `.notes-empty` 进 DOM → 再核对空断言防护」 |
| **F3** 「修」分支首选 `.note-actions { flex-wrap: wrap }` 与判定项 ⑥「未换行」互斥（⑥ 恒红、「修后全绿」不可达） | 接受 | `NotesPanel.vue:1336-1341`（`.note-actions{gap:4px;justify-content:flex-end}`）、`:1347-1356`（`.note-copy` `padding:1px 6px` / `font-size:11px` / `line-height:1.4`）、`:1366-1376`（`.note-ask` 同款）；本档 §1.4.4 判定表第 6 行（`T = 27px`） | §1.4.4「修 or 不修」边界第 1 行改为「保持单行的收缩写法（收窄 `gap` 与/或 `padding`；只允许调整 `padding` / `gap`）」、写明 `flex-wrap` 与 ⑥ 互斥、给出升级路径；§4 的 `NotesPanel.vue` 条件改行同步改写 |
| **F4** §2.4 把 `README.md` / `pix/package.json` 列入零 diff 路径，与 §4 / N75 / N76 / §5.4 #14/#15 矛盾 | 接受 | 本档 §2.4 原命令与期望句（中英混杂、无判别力）；§4 文件级清单（两文件均为「修改」）；本档 §5.4 第 14/15 项 | §2.4 拆为「零 diff 清单（移出两个文件）」+「预期有 diff 的两个文件（逐字判据）」；期望句改为单语言、可判 |

**处理 4 条 / 拒绝 0 条。** 未改动：白名单（§7.1）、断言条数（4 组 13 条 + 可选 1；烟测 4 组 26 条）、冻结阈值（`T = 27px`）、新增截图张数（6 张 + 可选 1）、验证方案（§5）与执行顺序（§7.1）/ 切分（§7.2）。本轮实际改动仅本文件：`docs/pm/R11-design.md`。

---

## 追加设计（R11 · N73-2b）

> 上游：`docs/pm/R11-req.md`「### N73-2b（追加 · 负责人裁决）」（本次追加；冻结语义 S1–S7 + 验收判据 (a)(b)(c)）、`docs/pm/R11-review.md`「## 追加裁决（R11）」（本次追加；裁决 = **②**）、机制证据 = `docs/pm/R11-dev.md`「## 修复轮（R11 代码审查 must-fix 处置）」修复轮.1 的**两次独立实跑**（`+42` 出现 `quick-ask-feedback is-ok` 反馈 → `+43` 被原生 `selectionchange` → `showFor` 重置为 actions；静默窗放宽到 600 ms 后仍复现）+ `docs/pm/R11-review.md`「代码审查（R11）」§3 must-fix 1（D1）。
> 本档本节**只写设计，不改任何代码**；本次追加的允许写操作 = 本文件（本节）+ `docs/pm/R11-req.md` 的 N73-2b 小节 + `docs/pm/R11-review.md` 的「追加裁决（R11）」。判定工具与主档一致（【走查】/【check】/【离屏】），不新增工具。
> 相位命名说明：负责人任务书建议命名「r11-3 相位 3（`spurious-selectionchange`）」；本档按**真实执行顺序**定名为相位 4 / 相位 5（既有第 3 个相位是 `reader-scroll-control`），避免与既有相位重名。

### 追加-0 事实基线（2026-09-16 本步实跑 + 只读核对）

| 事实 | 证据（全部为本步真实读数） |
| --- | --- |
| 唯一工程门 0 error | 实跑 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0` |
| 交付态离屏实跑（本步基线） | 实跑 `PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v05-r11-adj ./node_modules/.bin/electron scripts/ui-shot.mjs` ⇒ `UI_SHOT_EXIT=0`、**119 张截图 / 167 条测量**、`MANIFEST.json.failure === null`、`shots/` 零白名单外条目（`ls -A` 仅 `*.png` / `MANIFEST.json` / `MEASUREMENTS.json`） |
| 60-9 当前**无**反馈判据（D1 的现场） | 同次实跑 `MEASUREMENTS.json` 的 `notes-search` / `delete-all-then-excerpt` ⇒ `data` 键逐字 `["phase","steps","empty","excerpted"]`（无任何反馈字段）、`failures` 缺失（全绿） |
| `r11-3` 既有 3 相位全绿 | 同次实跑：相位 1 `waitMs:250`、`quickAsk {display:"flex", feedbackClass:"quick-ask-feedback is-ok", feedbackText:"已摘录 · 第 1 页"}`；相位 2 `elapsedSinceFeedbackMs:251`；相位 3 `scroll.before 48 → after 200`、`zoom {text:"100%", clicks:0}`、`quickAskAfterScroll.display:"none"` |
| 组 label 计数（既有） | `notes-search` 10 / `r11-esc-scope` 4 / `r11-quick-ask-scroll-scope` **3** / `r11-undo-after-empty` 3 / `r11-note-actions-narrow` 3 / `r11-undo-scope-stale` 1 |
| 零缺失比对（对照 R11 交付前基线 `pix-v05-r11-base`） | 本步实跑比对：截图 `{"base":112,"after":119,"missing":[],"added":7}` / `AFTER_FAILURE=null`；label `{"baseLabels":32,"afterLabels":37,"missing":[]}` ⇒ 既有断言与截图零缺失（本追加的改后读数应在此基础上再 +1 张截图 / +2 条 record） |
| 组件改动点（真实行号） | `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`：`:18` `MIN_SELECTION_CHARS = 2`；`:22` `FEEDBACK_MS = 2500`；`:45` `let cachedText = ""`；`:46` `feedbackTimer`；`:56-89` `showFor`（`:59` `cachedText = text` / `:61` `mode.value = "actions"` / `:62` `feedback.value = null` / `:63-66` 清计时器 / `:67` `visible.value = true`）；`:92-102` `hide()`（`:93-101` 五项清理）；`:104-115` `showFeedback`（`:105` 首行守卫 / `:107` `mode.value = "feedback"` / `:109-114` 计时器）；`:117-135` `onSelectionChange`（守卫 1 `:119-122` / `const text` `:123` / 守卫 2 `:124-127` / 锚点+stage `:128-129` / 守卫 3 `:130-133` / `showFor` 调用 `:134`）；`:137-143` `onStageScroll`（N73-2 已完成）；`:178` `selectionchange` 监听；`:180` `scroll` capture 监听；`:183-190` 卸载对称清理 |
| 组件计数基线（改前） | `mode.value` 4 / `visible.value` 7 / `cachedText` 6 / `FEEDBACK_MS` 2 / `setTimeout(` 1 / `clearTimeout(` 4 / `closest(` **0** / `instanceof Node` 1 |
| 取证脚本挂载点（真实行号） | `pix/scripts/ui-shot.mjs`：`:60-61` `SEL.quickAsk` / `SEL.quickAskFeedbackOk`；`:1375` `record`；`:1437-1441` `waitPage`；`:1523-1534` `selectPageSpan`；`:4970-4990` `excerptFirstSpan`；`:4992-5002` `quickAskProbe`；`:5004-5013` `waitFeedbackOk`；`:5354-5394` 60-9（`record` 在 `:5379`）；`:6053` 起 `r11-3` 三相位（`record` 在 `:6085` / `:6107` / `:6147`）；`:6171` `r11-4`；`:6225` `r11-5`；`:6304` `r11-6`；`:3091` `restoreStandardSeed` |
| 页面渲染窗口（相位 4/5 的前置依据） | `SAMPLE_PAGES` 3 页、每页 MediaBox 595×842（`:111`）；`.pdf-scroll` 100% 下 `scrollHeight 2670 / clientHeight 950`（本步实跑）；`observePages()` 的 `IntersectionObserver` 带 `rootMargin: "1200px 0px"`（`pix/src/renderer/components/workspace/PdfViewer.vue:272`）⇒ 目标页可用 `scrollIntoView` 带进渲染窗口 |

### 追加-1 确切改法（`pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`）

#### 1.1 插入位置与判据顺序（逐条写死）

| 项 | 冻结 |
| --- | --- |
| 位置 | `onSelectionChange` 函数体内，**守卫 3（`:130-133`）之后**、**`void showFor(selection.getRangeAt(0), text.trim())`（`:134`）之前**；函数外零改动、文件外零改动 |
| 判据顺序 | ① `mode.value === "feedback"` ② `visible.value` ③ `text.trim() === cachedText`（三条**同时成立**才早退；短路顺序照写，便于走查逐字核对） |
| 为什么不能更早 | 放到任一 `hide()` 守卫之前，会让「选区折叠 / 文本过短 / 锚点离开 stage」的同文本场景**不再隐藏** ⇒ 违反 S4 的 ②③④，并直接推翻既有场景（选区清空 / 文本过短的隐藏语义） |
| 为什么不能更晚 | 放到 `showFor` 之后已无意义（`showFor` 进入即重置 `mode` / `feedback` 并清计时器，`:61-66`） |
| 比较基准 | `cachedText` 由 `showFor`（`:59`）写入的**已 trim** 文本；比较式两侧都 `trim()` ⇒ 与 S2(a)「trim 后逐字相等」等价。**不得**改用 `startsWith` / `includes` / `localeCompare` / 空白归一化 |
| 早退分支内允许的语句 | 只有 `return`；**不得**出现 `hide()` / `showFor(` / `showFeedback(` / `setTimeout(` / `clearTimeout(` / 几何写入（`pos`） |

#### 1.2 逐字 diff（改前 → 改后）

```ts
// 改前（`:128-135`）
  const anchor = selection.anchorNode;
  const stage = resolveStage();
  if (!anchor || !stage || !stage.contains(anchor)) {
    hide();
    return;
  }
  void showFor(selection.getRangeAt(0), text.trim());
}

// 改后（同一位置；只新增注释 + 一条早退分支，其余行逐字不变）
  const anchor = selection.anchorNode;
  const stage = resolveStage();
  if (!anchor || !stage || !stage.contains(anchor)) {
    hide();
    return;
  }
  // 反馈态可见期间，入库引发的 DOM 更新会带出一次「选区未变」的 selectionchange；
  // 同文本（trim 后逐字相等）不得把反馈重置为 actions（不重置 mode / 不清 feedback / 不重算几何 / 不重开计时器）。
  if (mode.value === "feedback" && visible.value && text.trim() === cachedText) return;
  void showFor(selection.getRangeAt(0), text.trim());
}
```

**行为矩阵（改后逐条）**

| 到达的 `selectionchange` 现场 | `mode` | 结果 | 依据 |
| --- | --- | --- | --- |
| 文本与 `cachedText` 相同、未折叠、锚点在 stage | `feedback` 且 `visible` | **保持反馈态**（早退；几何、计时器、`cachedText` 全部不动） | S1+S2+S3 |
| 同上 | `actions` | 走既有 `showFor`（重置为 actions 并重算几何，结果等价但保留既有语义） | S1 |
| 文本不同、未折叠、锚点在 stage | 任意 | `showFor` ⇒ actions 态 + 重算几何（对照组 C2/C3/C4） | S4① |
| 折叠 / `rangeCount === 0` / 无 `filePath` | 任意 | `hide()`（`:119-122`） | S4② |
| 文本 trim 后 < `MIN_SELECTION_CHARS` | 任意 | `hide()`（`:124-127`） | S4③ |
| 锚点不在 stage 内 / 无锚点 / 无 stage | 任意 | `hide()`（`:130-133`） | S4④ |
| 阅读区（`.reader-stage` 子树内）滚动 | 任意 | `hide()`（`onStageScroll`，N73-2，不变） | S4⑤ |

#### 1.3 不变量（逐字保留，零 diff）

1. `showFor` 全文（含 `cachedText = text`、几何钳制 `clamp(...)`、`panel` 判定）。
2. `hide()` 的五项清理（`:93-101`，含清计时器）。
3. `showFeedback` 的首行守卫（`:105`）、`mode = "feedback"`（`:107`）与 `FEEDBACK_MS` 计时器（`:109-114`）。
4. `FEEDBACK_MS = 2500`（`:22`）与 `MIN_SELECTION_CHARS = 2`（`:18`）。
5. `onStageScroll` 的判定式（`:137-143`）与两处监听注册/移除（`:178` / `:180` / `:184-185`）。
6. 模板、类名（`.quick-ask` / `.quick-ask-btn` / `.quick-ask-feedback` / `.is-ok` / `.is-duplicate` / `.is-error`）、`FEEDBACK_ICONS`、`pending` / `canExcerpt` / `selectionPage` / `watch(filePath)` 语义。

#### 1.4 走查判据（命令级，改后逐条命中）

| # | 命令 | 期望 |
| --- | --- | --- |
| 1 | `grep -n 'mode.value === "feedback"' PdfSelectionQuickAsk.vue` | **1 处**，且行号 ∈ `(:133, :134)`（即守卫 3 与 `showFor` 调用之间） |
| 2 | `grep -c "mode.value" PdfSelectionQuickAsk.vue` | `5`（改前 4 + 新增 1） |
| 3 | `grep -c "closest(" PdfSelectionQuickAsk.vue` | `0`（不得出现按类名枚举的例外） |
| 4 | `grep -c "FEEDBACK_MS" PdfSelectionQuickAsk.vue` | `2`（`:22` 定义 + `:114` 使用，不变） |
| 5 | `grep -c "setTimeout(" PdfSelectionQuickAsk.vue` / `grep -c "clearTimeout(" …` | `1` / `4`（均不变） |
| 6 | `grep -c "instanceof Node" PdfSelectionQuickAsk.vue` | `1`（N73-2 既有，不变） |
| 7 | `git diff -- pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 只含「两行注释 + 一行早退分支」的新增；`showFor` / `hide` / `showFeedback` / `onStageScroll` / 监听注册 **零 diff** |
| 8 | `git diff -- pix/src/renderer/components/workspace/PdfViewer.vue` | 空（本追加不动阅读区） |

### 追加-2 新增 / 更新的离屏断言

#### 2.0 目标读数与归属

| 项 | 改前（本步实跑） | 改后（预期） |
| --- | --- | --- |
| `shots/*.png` | 119 | **120**（+`r11-3b-feedback-after-spurious-selectionchange.png`） |
| `MEASUREMENTS.json` 条数 | 167 | **169**（+2 条 record） |
| 组 `r11-quick-ask-scroll-scope` | 3 | **5**（+`spurious-selectionchange` +`different-text-reset`） |
| 60-9（`notes-search` / `delete-all-then-excerpt`） | `data` 键 4 个、无反馈字段 | `data` 增 `excerptFeedback` 字段；`failures` 追加 3 条（既有 10 条逐字保留） |
| 既有 112 张截图 / 153 条 label | — | **零缺失**（`missing: []`） |

#### 2.1 60-9 追加（验收判据 (a)：恢复需求原字面）

插入点：`ui-shot.mjs:5374` 的 `await excerptFirstSpan();` 之后、`:5378` 的 `const excerpted60 = await searchProbe();` 之前（**只追加，不替换**；`:5354-5394` 的既有 10 条判据与 `excerptFirstSpan` 行为逐字不动）。

```js
  await excerptFirstSpan();
  // N73-2b：反馈态必须在入库引发的 DOM 更新（带出同文本 selectionchange）之后保持可见
  const feedbackStart60 = Date.now();
  const feedback60a = await waitFeedbackOk(1500);
  const feedbackWaitMs60 = Date.now() - feedbackStart60;
  await sleep(400);                                   // 拦 ~1 ms 闪现造成的假绿
  const feedback60b = await quickAskStateProbe();
  const excerpted60 = await searchProbe();
  record("notes-search", { phase: "delete-all-then-excerpt", steps: [d1_60, d2_60, d3_60], empty: empty60, excerpted: excerpted60, excerptFeedback: { waitMs: feedbackWaitMs60, first: feedback60a, after400ms: feedback60b } }, [
    /* 既有 10 条判据逐字保留（不改一行） */
    ...(String(feedback60a.feedbackClass).includes("is-ok") && feedback60a.display !== null && feedback60a.display !== "none"
      ? [] : [`摘录后浮层未停在反馈态：${JSON.stringify(feedback60a)}`]),                                 // A1
    ...(feedback60a.feedbackText === "已摘录 · 第 1 页" ? [] : [`摘录反馈文本异常：${JSON.stringify(feedback60a)}`]),            // A2
    ...(String(feedback60b.feedbackClass).includes("is-ok") && feedback60b.feedbackText === "已摘录 · 第 1 页"
      ? [] : [`摘录反馈未保持（+400 ms 复采）：${JSON.stringify(feedback60b)}`]),                                          // A3
  ]);
```

- **A1**（≤1500 ms 有界等待）反馈态在（class 含 `is-ok` 且 `display !== "none"`）；**A2** 文本逐字 `已摘录 · 第 1 页`；**A3** 再等 400 ms 复采仍为反馈态且文本逐字（拦闪现假绿）。
- 时序预算：`waitFeedbackOk` ≤1500 ms + 复采 400 ms ≤ **1900 ms** < `FEEDBACK_MS = 2500`；追加段之后 `searchProbe` 的既有字段（`value` / `rows` / `countText` / `emptyText`）不受影响。
- 60-9 的 `excerpted` 字段值预期与基线**逐字相同**（本次追加只延后读取时刻，不改任何状态）。

#### 2.2 场景 `r11-3` 相位 4 `spurious-selectionchange`（5 条）

挂载点：`ui-shot.mjs:6169`（相位 `reader-scroll-control` 的 `record`（`:6147-6168`）之后、`r11-4` 的段注释（`:6170`）之前）。

| 步 | 代码要点 |
| --- | --- |
| 前置 | `focusPage(2)`（`scrollIntoView({ block: "center" })` → `waitFor` 文本层；该滚动会隐藏浮层 —— 既有语义，故必须在选区之前）→ `selectPageSpan(2)` → 点「摘录」→ 轮询 `readNotes().length` 由 1 变 2（≤20 s）→ `waitFor` 面板回位 → `const t0 = Date.now()` → `waitFeedbackOk(1500)` |
| 可判别性下限 | `while (Date.now() - t0 < 900) { await sleep(60); }` → `dispatchAtMs = Date.now() - t0`（实测预期 ≈ 900–960；不达 900 时该循环补齐） |
| 现场 | `quickAskStateProbe()` + `selectionProbe()` + `pageSpanText(2)` |
| 派发 | `document.dispatchEvent(new Event("selectionchange"))`（**不改选区**；处理函数 `onSelectionChange` 不读事件对象 ⇒ 与原生事件对处理函数等价；`selectPageSpan` 亦用同款合成事件）→ `repaint(win)` → `quickAskStateProbe()` → 截图 `r11-3b-feedback-after-spurious-selectionchange.png` |
| 复采 | `sleep(600)` → `quickAskStateProbe()` |
| 到期观测 | `waitFeedbackGone(t0 + FEEDBACK_MS + 700 - Date.now())` ⇒ `{ probe, at }`；`feedbackGoneAtMs = at - t0` |

| 断言 | 条件（必须为真） |
| --- | --- |
| **B1** | 派发前：`feedbackClass` 含 `is-ok` 且 `feedbackText === "已摘录 · 第 2 页"` 且 `display !== "none"`；`selection.collapsed === false`；`selection.anchorInStage === true`；`selection.text === pageSpanText(2)`（同文本现场）；`dispatchAtMs >= 900`（且调用方必须确认 `dispatchAtMs < 2100`，否则按 §追加-3 第 6 行处置） |
| **B2** | 派发后立即：`feedbackClass` 含 `is-ok`、`feedbackText === "已摘录 · 第 2 页"`、`display !== "none"`、`btnCount === 0` |
| **B3** | 再等 600 ms（< `FEEDBACK_MS`）后：同 B2 四项 |
| **B4** | `probe.feedbackClass === null`（未超时）且 `feedbackGoneAtMs >= FEEDBACK_MS - 600` 且 `feedbackGoneAtMs <= dispatchAtMs + FEEDBACK_MS - 300` |
| **B5** | 到期后：`feedbackClass === null`、`btnCount === 2`、`display !== "none"`；`readNotes().length === 2`、`notesHash()` 与相位开始时相等 |

**B4 的判别力**：计时未被重置时反馈在 `t0 + 2500` 消失（本机实测轮询粒度 ≈60 ms）；计时被重开时消失时刻 ≥ `dispatchAtMs + 2500 ≥ 3400 > dispatchAtMs + 2200` ⇒ 上界必红；提前被别的路径清掉时下界必红。`data` 必须写入 `{ dispatchAtMs, feedbackGoneAtMs, before, afterDispatch, after600ms, atExpiry, selectionBefore, selectionAfter, spanText2 }`。

#### 2.3 场景 `r11-3` 相位 5 `different-text-reset`（4 条，对照组）

| 步 | 代码要点 |
| --- | --- |
| 前置 | `focusPage(3)` → `selectPageSpan(3)` → 点「摘录」→ 轮询文件 2 → 3（≤20 s）→ `waitFor` 面板回位 → `waitFeedbackOk(1500)` |
| 派发不同文本 | `selectPageSpan(2)`（第 2 页首个 span；真实 DOM 选区变更 + 合成 `selectionchange`）→ `repaint(win)` → `quickAskStateProbe()` + `selectionProbe()` + `pageSpanText(2)` |

| 断言 | 条件（必须为真） |
| --- | --- |
| **C1** | 派发前：`feedbackClass` 含 `is-ok` 且 `feedbackText === "已摘录 · 第 3 页"`；`readNotes().length === 3`；`pageSpanText(3) !== pageSpanText(2)`（「不同文本」的前提） |
| **C2** | 派发后立即：`feedbackClass === null` 且 `feedbackText === null`（反馈被重置） |
| **C3** | 同上复采：`display !== "none"` 且 `btnCount === 2`（浮层回到 actions 态） |
| **C4** | 选区现场：`selection.text === pageSpanText(2)`、`collapsed === false`、`anchorInStage === true`；文件仍 3 条且 `notesHash()` 与 C1 时相等 |

#### 2.4 新增 helper（语义冻结、命名自由；不得改 `quickAskProbe` / `waitFeedbackOk` 的既有返回形状）

| helper | 语义 |
| --- | --- |
| `quickAskStateProbe()` | 一次 `js` 读 `{ inDom, display, feedbackClass, feedbackText, btnCount }`；`btnCount` = `.quick-ask` 内 `.quick-ask-btn` 数 |
| `selectionProbe()` | 一次 `js` 读 `{ text, collapsed, anchorInStage }`（`text` 归一化空白后再 `trim`；`anchorInStage` = `sel.anchorNode` 在 `.reader-stage` 子树内） |
| `pageSpanText(page)` | 一次 `js` 读 `.pdf-page[data-page="<page>"] .textLayer span` 的 `textContent`（归一化 + trim） |
| `focusPage(page)` | `scrollIntoView({ block: "center" })` → `waitFor` 该页文本层（保证目标页已渲染；副作用：会隐藏浮层，故必须在 `selectPageSpan` 之前） |
| `waitFeedbackGone(timeoutMs)` | 有界轮询（60 ms）直到 `quickAskStateProbe().feedbackClass === null`；返回 `{ probe, at }`（超时不抛错，由断言判红；与 `waitFeedbackOk` 同风格） |

**注释更新（同一白名单文件内）**：`ui-shot.mjs:4965-4969`（`excerptFirstSpan` 的 docstring）与 `:5375-5377`（60-9 内登记 D1 的三行注释）必须改为 N73-2b 口径——逐字写明「反馈态在入库引发的同文本 `selectionchange` 之后保持可见（N73-2b）；60-9 在本条后追加逐字反馈断言」。这两处**只改注释，不改任何 `record` / 判据 / `capturePage`**。

### 追加-3 失败路径表

| # | 情形 | 期望表现 | 判据 |
| --- | --- | --- | --- |
| 1 | 早退分支缺失或条件写漏（如漏 `visible.value`） | B2 / B3 红（派发后 `feedbackClass` 变 `null`、`btnCount` 变 2）；60-9 的 A1–A3 红 | §2.1 / §2.2 |
| 2 | 分支放错位置（放到守卫之前） | 走查 #1 行号越界；且「选区折叠 / 文本过短 / 锚点离开 stage」的既有隐藏场景红 | §1.4 #1 + 既有 06/07 段 |
| 3 | 比较写成 `includes` / 归一化（非 trim 后逐字相等） | 走查 #7（diff 逐字核对）；C2 红（不同文本被误判为同文本 ⇒ 反馈不被重置） | §2.3 |
| 4 | 在早退分支里顺手重开计时器或改 `FEEDBACK_MS` | B4 上界红（消失时刻 ≥ `dispatchAtMs + 2200`）；走查 #4/#5 计数不符 | §2.2 |
| 5 | 60-9 的追加等待 > 2500 ms 窗口（如把复采改到 900 ms） | A3 红（复采已过期）⇒ 压缩等待；**不得**把 A3 降级为跳过 | §2.1 |
| 6 | 环境过慢：相位 4 派发时 `dispatchAtMs > 2100`（B1 红） | 按次序调整处方：把相位 1 的截图（`:6083`）移到相位 4 之后（只改次序、**不改任何判据**，截图内容仍为「反馈态 + 列表」），并在开发档登记实测值 | §2.2 B1 |
| 7 | 目标页未渲染（`selectPageSpan` 的 `waitFor` 20 s 超时） | `focusPage` 已先 `scrollIntoView`；仍超时 ⇒ 场景抛错（硬失败），**不得**降级为跳过 | §2.2 / §2.3 |
| 8 | 相位 5 的第 3 页摘录命中 duplicate（文本被误判与已存在相同） | C1 红（文本不为 `已摘录 · 第 3 页`）⇒ 核对 `pageSpanText(3)` 与既有两条的现场值 | §2.3 C1 |
| 9 | 既有断言被替换 / 降级（把相位 1/2/3 或 60-9 既有判据改掉） | `git diff -- pix/scripts/ui-shot.mjs \| grep -E "^-" \| grep -v "^---"` 出现既有 `record(` / `capturePage(` / label 删除 ⇒ 判回归失败 | §5.4 #12 同口径 |

### 追加-4 与既有冻结面的关系（不得改动的项，逐条）

| # | 不得改 |
| --- | --- |
| 1 | `onStageScroll` 的判定式与注释（N73-2 / `R11-req.md` §0.4 / 本档 §1.2）与两处监听注册方式、卸载对称清理 |
| 2 | `showFor` 的几何钳制（`clamp` / `STAGE_PADDING` / `BUTTON_GAP`）与 `cachedText` 写入 |
| 3 | `hide()` 的五项清理；`showFeedback` 的首行守卫与 `FEEDBACK_MS = 2500` |
| 4 | 反馈文案（`已摘录 · 第 N 页` / `已在笔记中` / `摘录失败：…`）与类名（`.quick-ask-feedback` / `.is-ok` / `.is-duplicate` / `.is-error`） |
| 5 | 三条 `hide()` 守卫（`:119-122` / `:124-127` / `:130-133`）的顺序与内容；`MIN_SELECTION_CHARS = 2` |
| 6 | `r11-3` 既有相位 1/2/3（`excerpt-into-empty-panel` / `notes-panel-scroll` / `reader-scroll-control`）的 `record`、判据、`data` 字段——新相位只能**追加在其后** |
| 7 | 60-9 的既有 10 条判据（只允许追加 A1–A3 与 `excerptFeedback` 字段） |
| 8 | 场景 00–11 / 20–24 / 30–36 / 40–46 / 50–55 / 60–65 的全部 label、112 张既有截图名、153 条既有 label（尤其 `notes-search\|esc`、`notes-search\|clear-button`、`notes-copy\|geometry`、`notes-search\|search-row-form`） |
| 9 | N73-1 的 `NotesPanel.vue` 改动与 `PdfViewer.vue` 零 diff；N73-3 的启动守卫 / 清理点 / 结束自检面 |
| 10 | 白名单外文件（`pix/src/**` 其余、`pix/src/main/**`、`pix/src/shared/types.ts`、`packages/**`、`package-lock.json`、`pix/tsconfig*.json`、`pix/build/**`）；不新增依赖、不新增 npm 脚本 |

### 追加-5 验证方案（命令 + 零缺失口径）

```bash
# 1）唯一工程门
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"                      # 期望 0

# 2）改前基线（本步已跑过一次，可直接复用该目录产物；重跑必须先确认目录可用）
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-adj" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_BASE_EXIT=$?"                        # 期望 0 / 119 张 / 167 条

# 3）改后验收（必须换另一个 OUT_ROOT：启动清理只作用于本次 OUT_ROOT）
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-n732b" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_AFTER_EXIT=$?"                       # 期望 0 / 120 张 / 169 条 / failure null
```

- **零缺失**：沿用本档 §5.2 的两段比对（截图 basename 集合、label 计次），期望 `missing: []`、`AFTER_FAILURE=null`、`added: 8`（既有 7 张 `r11-*` + 新增 `r11-3b-*`）。
- **新判据全绿**：`MEASUREMENTS.json` 中 `r11-quick-ask-scroll-scope` 的 5 条 record 无 `failures`；`notes-search` / `delete-all-then-excerpt` 无 `failures` 且 `data.excerptFeedback` 存在。
- **白名单**：`git status --short` 只列既有白名单 + 本追加的两份档件（`docs/pm/R11-req.md` / `docs/pm/R11-design.md` / `docs/pm/R11-review.md`）。

### 追加-6 风险与判定

| 风险 | 判定方式 | 失败信号 |
| --- | --- | --- |
| 相位 4 的时序（`dispatchAtMs` 与到期观测）受环境速度影响 | 全部时间量写入 `data`；B1 的下限 + B4 的双边界同时判 | B4 上界红（计时被重开）或下界红（提前被清） |
| 相位 4/5 依赖目标页已渲染 | `focusPage` 先 `scrollIntoView`；`selectPageSpan` 的 20 s `waitFor` 为硬失败 | 场景抛错（不得降级） |
| 60-9 的追加等待吃掉反馈窗口 | A3（+400 ms 复采）必须仍为反馈态；等待总量 ≤1900 ms | A3 红 |
| 早退分支把「不同文本」也放过 | C2/C3 对照断言必红（`feedbackClass` 不为 `null`） | C2 红 |
| 改动越界到 `showFor` / `hide` / 计时器 | 走查 #7 的 `git diff` 逐字核对 + 走查 #2–#5 计数 | 出现白名单外 diff |

### 追加-7 执行边界

- **白名单**：`pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`（仅 `onSelectionChange` 一处早退分支 + 两行注释）、`pix/scripts/ui-shot.mjs`（60-9 追加、`r11-3` 追加 2 相位与 5 个 helper、两处注释更新）。
- **不提交**：提交由负责人执行（子代理不得运行任何 git 写命令）。
- **不在本追加范围**：60-9 的既有 10 条判据、`r11-3` 既有 3 相位、`notes-search\|esc` / `notes-copy\|geometry` 等冻结 record、其余历史场景与截图名。
