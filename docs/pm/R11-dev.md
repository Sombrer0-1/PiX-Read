# PiX-Read R11 开发档 · 收口修复（N73–N76）

> 上游：`docs/pm/R11-req.md`（需求 + §0 定稿修订 M1–M6）、`docs/pm/R11-design.md`（设计档 + 定稿修订 F1–F4）、`docs/pm/R11-review.md`（需求评审）。
> 本档只记录**真实文件内容与真实命令输出**；所有命令均在 2026-09-16 于 `E:/develop/PiX-Read`（Windows + git bash）实跑，无一条手工构造。
> 取证口径：基线按派单口径**复用** `C:/Users/86157/AppData/Local/Temp/pix-v05-r11-base` 的既有 `MANIFEST.json`（该目录已有实验产物）；验收离屏、烟测、走查、守卫负向控制、残留复核、M6 比对全部为本次实跑。
> 结论：**唯一工程门 0 error；验收离屏退出码 0、119 张截图 / 167 条测量、`failure === null`；基线 112 张截图与 153 条 label 零缺失（新增恰 7 张 / 14 条）；烟测连续两次 26/26 通过；守卫负向控制与预置残留复核通过**。
> **1 条设计档要求未落地（D1：60-9 追加反馈断言，机制与本轮修复无关，已由本次插桩实测证伪其前提，给出升级路径，需负责人裁决）**；其余 3 条为口径级偏差（D2/D3/D4），1 条为注释类改动（D5）。

---

## 1. 交付摘要（数字先给）

| 项 | 数值 | 来源 |
| --- | --- | --- |
| `cd pix && npm run check` | `CHECK_EXIT=0` | 本次实跑（§4.1） |
| 基线（`pix-v05-r11-base`，复用既有 MANIFEST.json） | `shots=112` / `measurements=153` / `failure=null` / `generatedAt=2026-09-16T04:49:08.848Z` | §2 |
| 验收离屏（`pix-v05-r11-after`，本次实跑） | 退出码 `0`、截图 **119** 张、测量 **167** 条、`failure === null`、`generatedAt=2026-09-16T05:28:03.665Z` | §4.2 |
| 截图零缺失 | 基线 112 张 **一张不少**；新增恰 **7** 张 | §4.3 |
| 测量零缺失 | 基线 label 集合零缺失（32 → 37 个 label）；新增 `r11-esc-scope` 4 / `r11-quick-ask-scroll-scope` 3 / `r11-undo-after-empty` 3 / `r11-note-actions-narrow` 3 / `r11-undo-scope-stale` 1 = **14** 条 | §4.3 / §4.4 |
| 冻结断言逐字一致 | `notes-search\|esc` / `notes-search\|clear-button` / `notes-copy\|geometry` / `notes-search\|search-row-form` 的 `data` 与基线**字符串级相等**；`notes-search` 10 / `notes-undo` 14 / `notes-sort` 7 / `notes-copy` 6 条数不变 | §4.3 |
| 烟测（N75） | 连续两次 `SMOKE_NOTES_EXIT=0`，末行逐字 `通过 26 / 失败 0`；`%TEMP%` 无 `pix-smoke-notes-*` 残留 | §4.7 |
| 守卫负向控制（N73-3） | `EXIT=1` + 逐字文案 + 目标目录**未被创建**（`PROBE_ABSENT=yes` / `PROBE_ABSENT_AFTER=yes`） | §4.5 |
| 预置残留复核（N73-3） | 预置的 `99-failure-state.png` / `zz-stale.png` 运行后均不存在；`shots/` 无白名单外条目（`STRAYS_EXIT=1`） | §4.5 |
| M6 目视比对 | 4 张逐一登记；2 张字节级一致、1 张仅亚像素抗锯齿、1 张另有运行时刻时间戳（同代码两次运行亦可复现） | §9 |
| 白名单外改动 | 0（`git status --short` 只列本轮白名单文件） | §6 |

改动文件（5 个已修改 + 1 个新建，全部在白名单内）：

| 文件 | 动作 | 对应需求 |
| --- | --- | --- |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | N73-1 |
| `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 修改 | N73-2 |
| `pix/scripts/ui-shot.mjs` | 修改 | N73-3 / N73-1 与 N73-2 场景 / N74 |
| `pix/scripts/smoke-notes.mjs` | **新建** | N75 |
| `pix/package.json` | 修改（仅 `scripts` 一键） | N75 |
| `README.md` | 修改（7 处行内更正） | N76 |

`docs/pm/R11-dev.md`（本档）为本轮文档交付；`R11-req.md` / `R11-design.md` / `R11-review.md` 原样未动。提交由负责人执行，本档全程未运行任何 git 写命令。

---

## 2. 基线（复用既有实跑，唯一口径）

派单口径：基线目录已有 `MANIFEST.json` ⇒ 直接复用为基线并记录（本档不重跑基线；基线与验收使用**不同** `PIX_SHOT_ROOT`，符合设计档 §5.1 与 N73-3 的启动清理语义）。

```bash
BASE="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-base"
node -e "…读取 $BASE/shots/MANIFEST.json + MEASUREMENTS.json…"
```

基线读数：

```text
generatedAt=2026-09-16T04:49:08.848Z  shots=112  failure=null  measurements=153  labels=32（去重）
```

⇒ 与 R10 交付档记录的 112 / 153 **一致**（`R10-dev.md:359/375`），设计档 §0.1 的 M1 口径成立；本轮零缺失比对以该次实跑为唯一基线。

---

## 3. 改动清单（文件 + 具体改动）

### 3.1 `pix/src/renderer/components/workspace/NotesPanel.vue`（N73-1）

```diff
-/** Esc 只清空查询并交出焦点；不 stopPropagation（既有 window 级 Esc 语义保留）。 */
-function onSearchEsc(): void {
+/** Esc 只清空查询并交出焦点，并阻断冒泡：本输入框内的 Esc 不触发阅读区的 Escape 语义（框选模式 / PDF 搜索面板）。 */
+function onSearchEsc(event: KeyboardEvent): void {
   notesStore.clearSearchQuery();
   searchInputRef.value?.blur();
+  event.stopPropagation();
 }
```

- 注释逐字采用需求 §0.3 / 设计档 §1.1.2 的冻结文案；`clearSearchQuery()` → `blur()` 的**顺序不变**；不 `preventDefault`；不新增键盘监听；模板 `@keydown.esc="onSearchEsc"` 逐字不变。
- 共 `+3 / -2` 行（`git diff --stat` 记 5 行变更）；样式面零改动（N74-2 判定为「不修」，见 §4.4 / §5.4）。

### 3.2 `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`（N73-2）

```diff
-function onStageScroll(): void {
-  if (visible.value) hide();
+function onStageScroll(event: Event): void {
+  const stage = resolveStage();
+  if (!stage) return;                          // 阅读区不存在 ⇒ 不隐藏
+  if (!(event.target instanceof Node)) return; // 非节点目标 ⇒ 不隐藏
+  if (!stage.contains(event.target)) return;   // 目标不在 stage 子树内 ⇒ 不隐藏
+  if (visible.value) hide();                   // 阅读区滚动 ⇒ 隐藏（既有语义）
 }
```

- 判定式与设计档 §1.2.1 逐字一致；**新增判定只出现在该函数内**；无 `closest(` 类按类名枚举的例外；监听仍是 `document.addEventListener("scroll", onStageScroll, true)`（`:180`）+ `onBeforeUnmount` 对称移除；`hide()` / `showFeedback` / `FEEDBACK_MS` / 类名零改动。
- 共 `+6 / -2` 行（`git diff --stat` 记 8 行变更）；`PdfViewer.vue` 零 diff。

### 3.3 `pix/scripts/ui-shot.mjs`（N73-3 + N73-1/N73-2 场景 + N74）

**a) N73-3：启动守卫 / 启动清理 / 结束自检**

| 位置 | 改动 |
| --- | --- |
| `:28` | `import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";`（追加 `readdirSync`） |
| `:29` | `import { tmpdir } from "node:os";`（新增内建导入，**不新增依赖**） |
| `:30` | `import { basename, dirname, join, resolve, sep } from "node:path";`（追加 `basename` / `sep`） |
| `:6380-6396` | 新增 `assertOutRootSafe()`：`resolve(OUT_ROOT)` 必须**严格位于** `resolve(tmpdir())` 之下（`child !== parent && child.startsWith(parent + sep)`，等号被拒），且与 `resolve(PIX_DIR)` 互不包含；win32 两侧 `toLowerCase()` 归一；失败 ⇒ `console.error(逐字文案 + resolve 后绝对路径)` + `app.exit(1)`（`:6394`）+ `return`（零副作用） |
| `:6400` | `main()` 首条语句 `assertOutRootSafe();`（在一切 `app.setPath` / `mkdirSync` / `rmSync` 之前） |
| `:6405` | 启动清理唯一清理点：`rmSync(SHOTS_DIR, { recursive: true, force: true });`（位于 `mkdirSync(OUT_ROOT)` `:6402` 之后、`writeFixtures()` 之前） |
| `:6477-6495` | 结束自检（`MEASUREMENTS.json` `:6474` 之后、`server.close()` `:6498` 之前）：① `shots/*.png` basename 集合 === `shots[].file` basename 集合（双向）；② `SHOTS_DIR` 一级条目除 `*.png` / `MANIFEST.json` / `MEASUREMENTS.json` 外为 0 个；失败只 `errors.push(...)`（逐字文案），**不覆盖 `failure`** |

清理范围仅 `join(OUT_ROOT, "shots")`；本次验收运行后 `OUT_ROOT` 仍含 `library` / `library-b` / `electron-userdata` / `vite-cache` / `stub-preload.cjs` / `shots`（§4.5 实测）。

**b) N73-1 / N73-2 的取证面**

- `SEL` 新增 11 项（设计档 §0.4 冻结值）：`pdfSearchBtn` / `pdfSearchPanel` / `zoomInBtn` / `zoomLabel` / `pdfScroll` / `pdfViewer` / `captureFabBtn` / `captureLayer` / `layoutLeft` / `noteActions` / `noteText`。
- 新增 helper（语义冻结、命名自由）：`quickAskProbe()`、`waitFeedbackOk(timeoutMs)`、`notesEmptyProbe()`、`stageScrollProbe()`、`pressBodyEsc()`、`narrowProbe()`。
- 新增场景 `r11-1` / `r11-2`（组 `r11-esc-scope`）、`r11-3`（组 `r11-quick-ask-scroll-scope`），追加在 `runReaderStateScenarios` 末尾（既有 65 段之后）。
- `excerptFirstSpan` 的注释按 R11 口径改写（面板滚动不再隐藏浮层），其行为（文件条数 + 面板回位）不变。

**c) N74 的取证面**

- 新增场景 `r11-4`（组 `r11-undo-after-empty`）、`r11-5`（组 `r11-note-actions-narrow`）、`r11-6`（组 `r11-undo-scope-stale`，可选 N74-3 已落地）。
- stub 的 `notesRestore` 增记 `resolvedAt`（响应回到渲染层的时刻，`ui-shot.mjs:860-861` 写 `call.resolvedAt`、`:904` 记时刻），供 `r11-6` 的「迟到响应」空断言防护使用。
- `r11-3` 相位 3 的兜底方向按 M2 为**放大**（`SEL.zoomInBtn`），达上限仍不可滚动即判失败（不降级为跳过）。

### 3.4 `pix/scripts/smoke-notes.mjs`（新建，N75）

- 顶层静态 import；零依赖，只用 Node 内建（`node:fs` / `node:os` / `node:path` / `node:crypto` / `node:child_process` / `node:module` / `node:url`）；不 import electron / 渲染层 / `packages/**`；无动态 `import(`。
- 编译面：`TSC_JS = <repo>/pix/node_modules/typescript/lib/tsc.js` 编译**仓库内源文件** `src/main/notes-store.ts` + `src/main/library-root.ts`（`rootDir=<repo>/pix/src`、`outDir=<TMP>/out`、commonjs / ES2022 / strict / skipLibCheck / esModuleInterop / `types:["node"]` / `typeRoots=<repo>/pix/node_modules/@types`），tsconfig 写在 `%TEMP%/pix-smoke-notes-<时间戳>/tsconfig.smoke.json`。
- 产物校验：必需 `out/main/notes-store.js` + `out/main/library-root.js`，允许附带 `out/shared/types.js`；出现其它文件或缺必需产物 ⇒ 直接退出 1，不进入断言。
- 加载：`createRequire(import.meta.url)`，并用 `require.resolve` 断言两侧解析到同一绝对路径（同一模块实例）。
- 驱动面：只用真实文件系统（`setLibraryRoot` / 真实写坏 `notes.json` / 把 `.pix-read/notes.json.tmp` 预置为目录造 EISDIR）；库内文档路径 `<TMP>/ws-a/sample-paper.pdf`（无需真实文件）。
- 4 组 26 条断言（8/8/6/4）、输出协议、退出码、`finally` 自清理与零仓库残留按需求 §0.6 实现。

### 3.5 `pix/package.json`（N75）与 `README.md`（N76）

```diff
     "check": "vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit",
+    "smoke:notes": "node scripts/smoke-notes.mjs",
     "package": "npm run build && electron-builder"
```

`dependencies` / `devDependencies` / `build` 零改动；`package-lock.json` / `packages/**` 零 diff。

`README.md`：**3 个 hunk / 16 变更行（7 删 9 增）**，恰为需求 §4 的 7 个子条：会话管理（N76-1）、`src/main/` 补 2 行（N76-2）、`components/workspace/`（N76-3）、`stores/`（N76-4）、`components/session/` 与 `composables/`（N76-5）、`utils/`（N76-6）、`ipc-handlers.ts`（N76-7）。

---

## 4. 真实命令与关键输出

### 4.1 唯一工程门

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
# ⇒ vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
# ⇒ CHECK_EXIT=0
```

### 4.2 验收离屏实跑（含预置残留）

```bash
# 预置两个假残留（设计档 §1.3.5【离屏·预置残留复核】）
AFTER="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-after"
rm -rf "$AFTER/shots" && mkdir -p "$AFTER/shots"
printf 'fakepng' > "$AFTER/shots/99-failure-state.png"; printf 'fakepng' > "$AFTER/shots/zz-stale.png"

cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-after" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_AFTER_EXIT=$?"
# ⇒ [ui-shot] 结束：产出 119 张截图
# ⇒ UI_SHOT_AFTER_EXIT=0
```

运行结束核对（本次实跑）：

```text
generatedAt=2026-09-16T05:28:03.665Z  shots=119  failure=null  measurements=167
OUT_ROOT 一级条目：electron-userdata / library / library-b / shots / stub-preload.cjs / vite-cache（清理只删了 shots/）
RESIDUE_GONE=yes（99-failure-state.png 与 zz-stale.png 均不存在）
STRAYS_EXIT=1（shots/ 除 119 张 png + MANIFEST.json + MEASUREMENTS.json 外零条目）
```

### 4.3 零缺失比对与冻结断言逐字一致（设计档 §5.2 口径）

```text
# ① 截图集合（按 name）+ failure
{"base":112,"after":119,"missing":[],"added":7,
 "addedNames":["r11-1-esc-pdf-search-panel.png","r11-2-esc-capture-mode.png","r11-3-excerpt-feedback-visible.png",
               "r11-4-undo-row-after-empty.png","r11-5-note-actions-narrow.png","r11-5b-note-actions-narrow-row.png",
               "r11-6-stale-scope.png"]}
AFTER_FAILURE=null

# ② 测量 label 集合（按 label 计次，基线每 label 条数不得减少）
{"baseLabels":32,"afterLabels":37,"missing":[]}

# ③ 既有断言字段逐字一致（本次追加核对）
notes-search|esc          baseCount=1 afterCount=1 IDENTICAL
notes-search|clear-button baseCount=1 afterCount=1 IDENTICAL
notes-copy|geometry       baseCount=1 afterCount=1 IDENTICAL
notes-search|search-row-form baseCount=1 afterCount=1 IDENTICAL
label notes-search: base=10 after=10   label notes-undo: base=14 after=14
label notes-sort:   base=7  after=7    label notes-copy: base=6  after=6
```

⇒ `missing` 为空、`AFTER_FAILURE=null`、新增恰 7 张；60-3（`notes-search|esc`）与 60-4（`notes-search|clear-button`）的 `data` 与基线**字符串级相等**（R10 的旧断言逐字保留），65-5（`notes-copy|geometry`）与搜索行盒模型（`notes-search|search-row-form`）同样逐字不变。

### 4.4 新增 5 组 14 条 record 的实测值（`MEASUREMENTS.json` 原文节选）

```text
r11-esc-scope :: {"phase":"pdf-search-open","before":{"value":"Table","focused":true,"clearInDom":true,"rows":1,"countText":"命中 1 条 / 共 4 条","emptyText":null},"after":{"value":"","focused":false,"clearInDom":false,"rows":4,"countText":"共 4 条","emptyText":null},"panelInDom":true,"hashSame":true}
r11-esc-scope :: {"phase":"pdf-search-close-control","panelInDom":false}
r11-esc-scope :: {"phase":"capture-mode","entry":{"layerInDom":true,"viewerCapture":true},"before":{"value":"Table","focused":true,…},"after":{"value":"","focused":false,"rows":4,…},"layerInDom":true,"viewerCapture":true,"hashSame":true}
r11-esc-scope :: {"phase":"capture-mode-exit-control","layerInDom":false,"viewerCapture":false,"hashSame":true}
r11-quick-ask-scroll-scope :: {"phase":"excerpt-into-empty-panel","rows":1,"searchInDom":true,"quickAsk":{"inDom":true,"display":"flex","feedbackClass":"quick-ask-feedback is-ok","feedbackText":"已摘录 · 第 1 页"},"waitMs":248}
r11-quick-ask-scroll-scope :: {"phase":"notes-panel-scroll","quickAsk":{"…同左，仍 display:flex + 逐字反馈…"},"fileCount":1,"hashSame":true,"elapsedSinceFeedbackMs":249}
r11-quick-ask-scroll-scope :: {"phase":"reader-scroll-control","scroll":{"before":48,"after":200,"scrollHeight":2670,"clientHeight":950,"scrollHeightAfterZoom":2670},"zoom":{"text":"100%","clicks":0},"quickAskBeforeScroll":{"…display:flex…"},"quickAskAfterScroll":{"inDom":true,"display":"none","feedbackClass":null,"feedbackText":null},"fileCount":1,"hashSame":true}
r11-undo-after-empty :: {"phase":"before-delete","rows":1,"countText":"共 1 条","emptyInDom":false}
r11-undo-after-empty :: {"phase":"after-delete-empty","rows":0,"countText":"共 0 条","empty":{"inDom":true,"title":"还没有摘录","subtitle":"在 PDF 中选中文字，点「摘录」保存到这里"},"undo":{"rowCount":1,"text":"已删除「We study ret…」· 第 1 页","btnText":"撤销","btnTitle":"还原这条笔记","btnDisabled":false},"hashChanged":true}
r11-undo-after-empty :: {"phase":"restored","rows":1,"emptyInDom":false,"undoRowInDom":false,"notice":{"isError":false,"isSuccess":true,"text":"已还原该条笔记"},"searchInDom":true,"hashSame":true}
r11-note-actions-narrow :: {"phase":"default-width","layoutLeftWidth":268,"rows":[{"scrollOverflow":0,…},…]}
r11-note-actions-narrow :: {"phase":"narrow-220","layoutLeftWidth":220,"threshold":{"node":".note-text","fontSize":12,"T":27},"rows":[{"scrollOverflow":0,"actionsLeft":45,"actionsRight":214,"actionsHeight":17.390625,"bodyLeft":45,"copyLeft":142,"copyRight":176,"askWrapLeft":180,"askWrapRight":214,"copyY":338.171875,"askWrapY":338.171875,"dom":{"copyFirst":true,"askAfterCopy":true,"actionsLast":true}},{"…同上（第二行）…"}]}
r11-note-actions-narrow :: {"phase":"restored-width","layoutLeftWidth":268,"rows":[…]}
r11-undo-scope-stale :: {"phase":"stale-scope","restoreCallsDelta":1,"resolvedAt":1789536482877,"panelReadyAt":1789536473908,"rows":2,"countText":"共 2 条","texts":["We study retrieval over long documents where the attention budget is the binding constraint.","结论：稀疏注意力在三分之一的预算下保持召回，位置先验是关键。"],"notice":null,"hashSame":true,"delayMs":9000,"sinceUndoClickMs":35}
```

**N74-2 判定（设计档 §1.4.4「修 or 不修」边界）**：220px 下 5 类判据**全绿** —— `scrollOverflow=0`（end 侧）、`actionsLeft(45) >= bodyLeft(45)` 且 `copyLeft(142)/askWrapLeft(180) >= actionsLeft(45)`（start 侧）、三者 `right <= .layout-left.right + 1`（214 ≤ 221）、同行（`copyY == askWrapY`）且 `actionsHeight 17.39 <= T = 27`（`T = 1.5 × (12 × 1.5)`，节点 `.note-text`）、DOM 关系全真；`restored-width` 回到 268。
⇒ 按冻结边界登记为「**测定不溢出，不修**」：`NotesPanel.vue` 本轮**不含任何样式面改动**。160px 及更窄为产品不可达 ⇒ 不判不修（§8）。

### 4.5 N73-3 的正/负向控制

**守卫负向控制（仓库外、非临时目录；本次实跑）**

```bash
cd E:/develop/PiX-Read && test ! -e "E:/develop/pix-shot-guard-probe" && echo "PROBE_ABSENT=yes"
# ⇒ PROBE_ABSENT=yes
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="E:/develop/pix-shot-guard-probe" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "EXIT=$?"
# ⇒ [ui-shot] 拒绝启动：PIX_SHOT_ROOT 必须位于系统临时目录内，且不得与仓库路径互相包含（当前：E:\develop\pix-shot-guard-probe）
# ⇒ EXIT=1
test ! -e "E:/develop/pix-shot-guard-probe" && echo "PROBE_ABSENT_AFTER=yes"
# ⇒ PROBE_ABSENT_AFTER=yes（零副作用：目录未被创建）
```

**预置残留复核 + 自检判据**：见 §4.2 / §4.3（本次验收运行前预置的两份假残留运行后均不存在；`RESIDUE_GONE=yes`、`STRAYS_EXIT=1`、`failure === null`、退出码 0）。

### 4.6 走查清单（设计档 §5.4）逐条命中

| # | 命令 | 本次实测 |
| --- | --- | --- |
| 1 | `grep -c "stopPropagation" NotesPanel.vue` | `1`（位于 `onSearchEsc` 函数体内） |
| 2 | `grep -c "preventDefault" NotesPanel.vue` | `0` |
| 3 | `grep -c 'addEventListener("keydown"'` / `grep -c "@keydown"` | `0` / `1` |
| 4 | `git diff --stat -- PdfViewer.vue` | 空 |
| 5 | `grep -n "resolveStage()\|instanceof Node\|stage.contains(\|closest(" PdfSelectionQuickAsk.vue` | `resolveStage()` 4 处（`:48` 定义 / `:57` / `:129` 既有 / `:138` 新增）、`instanceof Node` 1 处（`:140` 新增）、`stage.contains(` 2 处（`:130` 既有 / `:141` 新增）、`closest(` **0** 处（按增量口径判，见 D4） |
| 6 | `grep -n 'addEventListener("scroll"' PdfSelectionQuickAsk.vue` | 1 处（`:180`，带 `true`） |
| 7 | `grep -c "rmSync(SHOTS_DIR" ui-shot.mjs` | `1`（`:6405`） |
| 8 | `grep -n "assertOutRootSafe()\|rmSync(SHOTS_DIR\|mkdirSync(OUT_ROOT\|app.setPath(\"userData\""` | 守卫定义 `:6380` / `main()` 首条语句 `:6400` / `app.setPath` `:6401` / `mkdirSync(OUT_ROOT)` `:6402` / `rmSync(SHOTS_DIR` `:6405`；守卫失败分支 `app.exit(1)` `:6394` < `:6405` |
| 9 | `grep -n "MEASUREMENTS.json\|…不一致\|…白名单外条目\|server.close()"` | 自检 `:6477-6495` 在 `MEASUREMENTS.json` `:6474` 之后、`server.close()` `:6498` 之前 |
| 10 | `grep -n "node:fs\|node:path\|node:os"` | `:28` 含 `readdirSync`、`:29` `tmpdir`、`:30` 含 `basename` / `sep`；无新依赖 |
| 11 | `grep -n 'v-if="notesStore.pendingUndo"' NotesPanel.vue` | 命中且不含 `hasNotes` / `status` |
| 12 | `git diff -- ui-shot.mjs \| grep -E "^-"` | 仅 5 行删除：2 行 import 扩写、1 行 stub `notesRestoreCalls.push` 扩写（N74-3 的 `resolvedAt`）、2 行 `excerptFirstSpan` 注释；**无**既有 `record(` / `capturePage(` / label 删除 |
| 13 | `git diff -- pix/tsconfig*.json` | 空 |
| 14 | `git diff -- pix/package.json` | 仅 `+    "smoke:notes": "node scripts/smoke-notes.mjs",` 一行 |
| 15 | `git diff -- README.md` | 3 hunk / 16 变更行（7 删 9 增），对应需求 §4 的 7 个子条 |
| 16 | `git diff -- package-lock.json` / `git diff -- packages` | 空 |

### 4.7 烟测（N75）连续两次

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes; echo "SMOKE_NOTES_EXIT=$?"   # ×2
```

输出（两次一致，节选）：

```text
[smoke-notes] 临时目录：C:\Users\86157\AppData\Local\Temp\pix-smoke-notes-1789536336866
[smoke-notes] typescript：E:\develop\PiX-Read\pix\node_modules\typescript\lib\tsc.js
== 组 undo-roundtrip ==      [通过] #1..#8
== 组 undo-failures ==       [通过] #1..#8
== 组 undo-slot-lifecycle == [通过] #1..#6
== 组 export-and-empty ==    [通过] #1..#4
通过 26 / 失败 0
SMOKE_NOTES_EXIT=0
```

零残留：`ls -d "$TEMP"/pix-smoke-notes-*` ⇒ 无输出（`NO_SMOKE_RESIDUE`），`git status --short` 只列白名单文件（§6）。

**失败路径抽样（本次实跑，两项注入都只临时改 `pix/scripts/smoke-notes.mjs`，改完即还原）**

```text
# 注入 1：TSC_JS 指向不存在路径
INJECT1_EXIT=1
[smoke-notes] typescript：E:\develop\PiX-Read\pix\node_modules\typescript\lib\tsc-DOES-NOT-EXIST.js
[smoke-notes] typescript 编译失败（status=1），不进入断言
Error: Cannot find module '…\tsc-DOES-NOT-EXIST.js'
通过 0 / 失败 0        （`[通过]` / `[失败]` 行数均 0）

# 注入 2：把 undo-roundtrip #7 的期望文案改成「没有可撤销的删除X（注入）」
INJECT2_EXIT=1
[失败] undo-roundtrip #7 再次还原同一 id ⇒ not-found + 逐字「没有可撤销的删除」（槽已清）：{"success":false,"notes":[],"code":"not-found","error":"没有可撤销的删除"}
通过 25 / 失败 1      （其余 25 条照常执行）
```

⇒ 注入 1：非 0 退出、输出含失败原因、**未进入断言**；注入 2：该条打 `[失败] …：<实际值>`、其余 25 条照常、汇总行与退出码均正确。

**还原证明**：`smoke-notes.mjs` 本轮为新建文件（`git status --short` 中为 `??`，`git diff --exit-code` 对未跟踪文件无效），故用 sha256 比对：

```text
sha256（注入前）= da3c8c41f283643b8b48ddfc6932d5e8d2989011d56495c7df18997fe1da67d5
cp <备份> pix/scripts/smoke-notes.mjs && sha256sum -c <记录> ⇒ OK
收尾再跑一次：通过 26 / 失败 0（FINAL_SMOKE_EXIT=0）
```

两次注入均未改 `pix/src/**`（`git status --short` 只有 N73-1 / N73-2 的两个组件文件，`pix/src/main` 零 diff），也未引入仓库残留（§6）。

### 4.8 D1 的本次插桩实测（60-9 组合的浮层状态转移）

为独立复核 D1（§7）的前提，本次**临时**在 `ui-shot.mjs` 的 60-9 段插入一段页内 `MutationObserver` + `selectionchange` 记录（运行到独立 `OUT_ROOT=pix-v05-r11-diag`），随后**逐字节还原**：

```text
[r11-diag] 60-9 浮层状态转移：[[0,"install","hidden"],…[35,"selectionchange","(state unchanged) hidden"],
 [38,"mutation","actions"],[38,"selectionchange","(state unchanged) actions"],
 [42,"mutation","feedback:quick-ask-feedback is-ok:已摘录·第1页"],
 [42,"selectionchange","(state unchanged) feedback:quick-ask-feedback is-ok:已摘录·第1页"],
 [43,"mutation","actions"]]
```

时间线（ms，相对安装）：`+35` `selectPageSpan(1)` 的合成 selectionchange → `+38` 浮层进 actions → `+42` 反馈态 `已摘录 · 第 1 页` 出现 → **`+43` 被重置回 actions**。
⇒ 该组合下反馈态仅存在 **约 1 ms**，随后被原生 `selectionchange` → `onSelectionChange` → `showFor()`（`PdfSelectionQuickAsk.vue` 的 `showFor` 首几行即 `mode = "actions"; feedback.value = null`）重置；与 N73-2 的滚动规则无关。

还原证明：

```text
sha256（插桩前）= 9e5993d59f4d3b9838951b26c6712c0f3f9c30db4aeeaa00e9e96f5b52b0f33c
cp <备份> pix/scripts/ui-shot.mjs && sha256sum -c <记录> ⇒ pix/scripts/ui-shot.mjs: OK
git diff --stat -- pix/scripts/ui-shot.mjs ⇒ 582（= 577 增 / 5 删），与插桩前一致
```

插桩只出现在 `%TEMP%/pix-v05-r11-diag` 的产物里，未进入验收产物；验收运行（§4.2）使用的脚本与当前工作树逐字节一致。

---

## 5. 逐条自评（N73–N76）

### 5.1 N73-1 笔记搜索框内 Esc 的语义越界

| 验收面 | 结果 | 证据 |
| --- | --- | --- |
| 【走查】`stopPropagation` 恰 1 处且在 `onSearchEsc` 内 | 通过 | §4.6 #1 |
| 【走查】不抢默认行为 / 无第二处键盘监听 | 通过 | §4.6 #2/#3 |
| 【走查】阅读区零改动 | 通过 | §4.6 #4（`PdfViewer.vue` 零 diff） |
| 【check】 | 通过 | §4.1 |
| 【离屏·新断言】组 `r11-esc-scope` 4 条 + 2 张截图 | 通过 | §4.4：搜索面板开启下 Esc 只清空 + 失焦、面板仍在（`panelInDom:true`）、笔记零变化（`hashSame:true`）；框选模式同理（`layerInDom:true` / `viewerCapture:true`）；两个对照相位证明阅读区既有 Escape 语义未坏（`panelInDom:false` / `layerInDom:false`、`viewerCapture:false`） |
| 【离屏·旧断言保留】60-3 / 60-4 逐字不变且通过 | 通过 | §4.3 ③（`notes-search\|esc` 与 `notes-search\|clear-button` 与基线字符串级相等；`notes-search` 组 10 条不变） |
| 行为矩阵 5 行 | 全部由场景断言覆盖 | 行 2/3 = `r11-1` / `r11-2` 的主相位；行 4/5 = 两个 `*-control` 相位 |

### 5.2 N73-2 摘录反馈被无关滚动吞掉

| 验收面 | 结果 | 证据 |
| --- | --- | --- |
| 【走查】唯一规则与 8 行判定表 | 通过（含 D4 口径） | §4.6 #5：`closest(` 0 处；`onStageScroll` 内三条守卫各 1 处 |
| 【走查】滚动监听不变 | 通过 | §4.6 #6（1 处 capture） |
| 【走查】`hide()` / `showFeedback` / `FEEDBACK_MS` / 类名零改动 | 通过 | §3.2（diff 只有 `onStageScroll` 函数体） |
| 【check】 | 通过 | §4.1 |
| 【离屏·新断言】组 `r11-quick-ask-scroll-scope` 3 条 + 截图 | 通过 | §4.4：空态 → 列表后反馈仍 `display:flex` + 逐字 `已摘录 · 第 1 页`（`waitMs:248`）；`.notes-panel` 上派发合成 scroll 后浮层**不隐藏**且反馈文本不变、数据不变（`elapsedSinceFeedbackMs:249`）；`.pdf-scroll` 真实滚动后 `display:none`（既有语义未放松；`scroll.before=48 → after=200`，`scrollHeight 2670 > clientHeight 950 + 40`，无需放大） |
| 【离屏·旧断言保留】60-9 全部既有断言逐字保留 | 通过 | 60-9 的 `record(...)` 与 `failures` 列表本轮未增删（见 D1）；`notes-search` 组 10 条与基线一致 |
| 【离屏·追加】60-9 追加 1 条反馈断言 | **未落地** | 见偏差 **D1**（本次插桩实测证伪其前提，给出升级路径） |
| 【离屏·内容目视】4 张截图改前/改后 | 通过 | §9（`08-notes-after-excerpt.png` 的浮层「已在笔记中」改前改后均可见） |

### 5.3 N73-3 取证脚本启动清理、越界守卫与产物自检

| 验收面 | 结果 | 证据 |
| --- | --- | --- |
| 【走查】清理点唯一 | 通过 | §4.6 #7（`:6405`，位于 `mkdirSync(OUT_ROOT)` 之后、`writeFixtures()` 之前） |
| 【走查】守卫先于清理 | 通过 | §4.6 #8（`main()` 首条语句；守卫失败 `app.exit(1)` 行号 < 清理点行号） |
| 【走查】自检落点与 import 面 | 通过 | §4.6 #9/#10 |
| 【check】 | 通过 | §4.1 |
| 【离屏·守卫负向控制】 | 通过 | §4.5（`EXIT=1` + 逐字文案 + 前后 `test ! -e` 均真） |
| 【离屏·自检判据】 | 通过 | §4.2/§4.3（集合双向相等、零白名单外条目、退出码 0、`failure === null`） |
| 【离屏·预置残留复核】 | 通过 | §4.2/§4.5（两份假残留运行后不存在） |
| 【离屏·零缺失】 | 通过 | §4.3（112 张零缺失、153 条 label 零缺失） |

### 5.4 N74 回归断言补齐

| 子项 | 结果 | 证据 |
| --- | --- | --- |
| N74-1（`r11-undo-after-empty` 3 条） | 通过 | §4.4：删空后 `.notes-empty` 在 DOM 且 `.empty-title` / `.empty-subtitle` 逐字、计数 `共 0 条`、`.notes-undo` 仍在（文案 `已删除「We study ret…」· 第 1 页`、按钮 `撤销` / title `还原这条笔记`）；撤销后 1 行、通知逐字 `已还原该条笔记`、字节回复（`hashSame:true`）、`.notes-search` 回到 DOM |
| N74-2（`r11-note-actions-narrow` 3 条） | 通过 | §4.4 + 「不修」判定（220px 五类判据全绿；`--pix-left-width` 复位回到 268） |
| N74-3（`r11-undo-scope-stale` 1 条，可选） | 已落地并通过 | §4.4：`restoreCallsDelta:1`、`resolvedAt(…482877) > panelReadyAt(…473908)`（迟到 8969 ms）、`rows:2` + 行文本 = 第 ④ 步写入的两条、`countText:"共 2 条"`、`notice:null`、`hashSame:true` |

### 5.5 N75 可复跑数据面烟测入口

| 验收面 | 结果 | 证据 |
| --- | --- | --- |
| 【烟测-主进程】连续两次 0 退出 + 逐条 `[通过]` + 汇总行 | 通过 | §4.7（`通过 26 / 失败 0`，两次均 `SMOKE_NOTES_EXIT=0`） |
| 【走查】编译面只引用仓库内文件、临时目录在 `os.tmpdir()` 下 | 通过 | §3.4 + §4.7 的临时目录输出 |
| 【走查】`pix/package.json` 只增一键 | 通过 | §4.6 #14；`package-lock.json` / `packages/**` 零 diff（#16） |
| 【走查】仓库零残留 | 通过 | §4.7 + §6 |
| 【check】 | 通过 | §4.1（`pix/scripts/**` 不在 `tsconfig.json` 的 include 内） |
| 失败路径抽样 2 项 | 通过 | §4.7（注入 1：编译失败 ⇒ 非 0 退出、不进入断言；注入 2：单条 `[失败] …：<实际值>`、其余 25 条照常、退出码 1；两项均逐字节还原） |

### 5.6 N76 README 事实性更正

| 验收面 | 结果 | 证据 |
| --- | --- | --- |
| 【走查】diff 只含 7 个子条、无其它 hunk | 通过 | §3.5 / §4.6 #15（3 hunk / 16 变更行） |
| 更正文案可在仓库内找到依据 | 通过 | 逐条对照实际目录列表（`src/main` 14 文件 / `components/workspace` 8 / `components/session` 4 / `stores` 7 / `composables` 4 / `utils` 8）与 `ipc-handlers.ts` 的注册面 |
| 不改动清单（阅读笔记 10/8000 上限、构建/打包章节等） | 通过 | 未触碰（diff 范围之外） |

---

## 6. 收尾核对（白名单 / 零 diff）

```bash
cd E:/develop/PiX-Read && git status --short
# ⇒  M README.md
#     M pix/package.json
#     M pix/scripts/ui-shot.mjs
#     M pix/src/renderer/components/workspace/NotesPanel.vue
#     M pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue
#    ?? docs/pm/R11-design.md
#    ?? docs/pm/R11-dev.md
#    ?? docs/pm/R11-req.md
#    ?? docs/pm/R11-review.md
#    ?? pix/scripts/smoke-notes.mjs
```

`git diff --stat`：`README.md 16 ±` / `pix/package.json 1 +` / `pix/scripts/ui-shot.mjs 582 ±` / `NotesPanel.vue 5 ±` / `PdfSelectionQuickAsk.vue 8 ±`（共 596 insertions / 16 deletions）。

零 diff 清单（逐条为空）：`pix/src/main`、`pix/src/shared/types.ts`、`pix/src/renderer/{utils,stores,composables,pages,assets}`、`PdfViewer.vue`、`PdfSearchPanel.vue`、`ChatPanel.vue`、`KnowledgeMap.vue`、`LibraryPanel.vue`、`ReaderPanel.vue`、`package-lock.json`、`pix/build`、`pix/resources`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`packages/**`。

---

## 7. 偏差表（逐条登记 + 证据 + 处置）

### D1（**唯一未落地的设计档要求**）：60-9 追加的 `.quick-ask-feedback.is-ok` 文本断言

| 项 | 内容 |
| --- | --- |
| 设计档要求 | §1.2.3 / §1.4.1【离屏·追加】：`60-9` 内**追加**（不替换）一条「摘录完成后 `.quick-ask-feedback.is-ok` 文本逐字 `已摘录 · 第 1 页`（有界等待 ≤1500 ms）」；前提是「R11 起面板滚动不再隐藏浮层 ⇒ 反馈可在 60-9 之后被断言」 |
| 本次实测（证伪前提） | §4.8：该组合下反馈态只存在 **约 1 ms**（`+42` 出现 → `+43` 被原生 `selectionchange` → `showFor()` 重置为 actions），随后浮层以 actions 态继续存在；**任何「事后有界等待」都采不到**，且该重置**与 N73-2 的滚动规则无关**（`showFor` 重置在前，滚动规则不参与） |
| 为什么不落一条「观察器版」断言 | 用页内 `MutationObserver` 可采到那 1 ms，但用户不可见 ⇒ 属设计档同一原则明确禁止的**假绿**（设计档对同款情形写过「不得让 ⑧ 建立在此种假绿上」）；且它不区分改前/改后，无回归判别力 |
| 为什么不改产品代码 | 触发点是既有「选区变化 ⇒ 重算浮层」语义（`onSelectionChange` → `showFor`），改动它属于 §2.1 冻结的浮层/锚点面与 §5 反需求 2，越出本轮白名单 |
| 处置 | **60-9 的 `record(...)` 与 `failures` 逐字保持 R10 原样**（不新增、不替换、不降级）；`excerptFirstSpan` 的注释按 R11 口径改写并登记该结论；**同一用户可见属性由 `r11-3` 相位 1 承担**（本次实测反馈持续窗口内稳定可采：`waitMs:248`、反馈文本逐字、`display:flex`） |
| 需负责人裁决 | ① 接受「r11-3 承担该判据、60-9 不追加」；或 ② 另开一条需求修「面板 DOM 更新触发的原生 `selectionchange` 会重置反馈」这一既有缺陷（需扩白名单到 `PdfSelectionQuickAsk.vue` 的选区/反馈面） |

### D2：`r11-3` 相位 3 的 `scrollTopBefore === 0` 在夹具下不成立（实测 48）

| 项 | 内容 |
| --- | --- |
| 设计档要求 | §1.2.4 相位 `reader-scroll-control` ③「记录 `scrollTopBefore === 0` → `scrollTop = 200`」；断言 ⑦「`scrollTop` 确实由 0 变为 > 0」 |
| 实测 | `scroll.before = 48`（sample-paper.pdf 第 1 页、100% 下 `.pdf-scroll` 自带 48px 偏移）、`scroll.after = 200`、`scrollHeight 2670 / clientHeight 950` |
| 处置 | ⑦ 按「**确实发生了真实滚动**」判定：`after > 0 且 after !== before`（48 → 200）；`before` / `after` / `scrollHeight` / `clientHeight` / `scaleText` 全部入 `data`。**未**在断言前强制 `scrollTop = 0`：那会自身产生一次 scroll 事件、把浮层隐藏，直接破坏 ② 的前置防空断言 |
| 影响 | 无（判别力不降：`after !== before` 比「由 0 变正」更强地排除了「未滚动却隐藏」的假绿） |

### D3：`r11-6` 的 `NOTES_RESTORE_DELAY_MS` 由建议值 6000 上浮到 9000

| 项 | 内容 |
| --- | --- |
| 设计档要求 | §1.4.5「冻结建议值 `NOTES_RESTORE_DELAY_MS = 6000`（…该建议值可由设计 / 开发按实测上浮，上浮不影响判据）」 |
| 处置 | 取 `9000`（写死在场景内并写入 `data.delayMs`）；本次实测「撤销点击 → 面板就绪」= 35 ms（`sinceUndoClickMs`），余量 ≫ 2000 ms ⇒ 判据满足 |
| 观测异常登记 | 该 35 ms 远小于直觉预期，故未直接采信：交叉证据是面板两行文本只能来自第 ④ 步重写的文件（`texts` 逐字等于写入值）且 `resolvedAt > panelReadyAt`（迟到 8969 ms）⇒ 迟到响应确实落在面板就绪之后。未再单独插桩测量该往返，列入 §8 |

### D4：设计档 §5.4 第 5 项「各恰 1 处」按字面不可满足（存量命中）

| 项 | 内容 |
| --- | --- |
| 设计档要求 | §5.4 #5：`grep -n "resolveStage()\|instanceof Node\|stage.contains(\|closest("` ⇒「前三条各 1 处、`closest(` 0 处」 |
| 实测 | `resolveStage()` 4 处（`:48` 定义、`:57` `showFor` 既有、`:129` `onSelectionChange` 既有、`:138` 本轮新增）；`instanceof Node` 1 处（`:140` 新增）；`stage.contains(` 2 处（`:130` 既有、`:141` 新增）；`closest(` **0 处** |
| 原因 | 前两条判据在 R11 动工前就已有存量命中（`grep` 是全文计数），要凑成「各 1 处」必须改既有代码（越界） |
| 处置 | 按**增量口径**判：三者在 `onStageScroll` 内**各恰 1 处**、`closest(` 全文件 0 处、滚动监听恰 1 处且 capture |

### D5：注释类小改动（设计档显式允许的「更新注释」范围内）

| 位置 | 改动 |
| --- | --- |
| `ui-shot.mjs` 的 `excerptFirstSpan` 注释 | 按 R11 口径改写（面板滚动不再隐藏浮层；行为不变）——设计档 §1.2.3 显式要求 |
| `ui-shot.mjs` 60-9 段内 | 追加 3 行注释登记 D1 的结论（不改任何 `record` / 判据） |
| `ui-shot.mjs` `SEL` / helper / 场景锚点 | 追加分隔注释 |

### D6：无其它偏差

断言条数与归属（4 组 + 可选 1 组 = 14 条 record、7 张截图）、相位名、`data` 字段、失败文案样式（`...(cond ? [] : [\`描述：${JSON.stringify(现场)}\`])`）、场景顺序与复位纪律、`SEL` 11 项、helper 语义、`T = 27px` 阈值与 `node: ".note-text"` 记录、`.notes-empty` 的 M3 读取节点、撤销契约与逐字文案、既有 65 段与 112 张截图名，均按设计档字面实现，无其它偏差。

---

## 8. 未验证事项 / 已知限制

1. **D1 的改前侧未重测**：本次插桩只测了 R11 代码在 60-9 组合下的时序；改前是否同样被 `showFor` 重置、还是先被 `hide()` 抑制，未插桩复测（R10-dev.md B.2 D1 给的是当时的目视结论）。⇒ 但两端结论一致（反馈在 60-9 组合下均不可稳定观测），不影响本轮任何判据。
2. **D3 的 35 ms 往返耗时**只由 `Date.now()` 差值给出，未用独立探针（如渲染层挂载钩子）二次确认。
3. **`.reader-content` / `.map-tree` / `document` 级滚动源**（N73-2 判定表 #2/#3/#7）本轮只有走查结论，无专门场景；`.pdf-search-panel` 内部（#8）无滚动源，同样只有走查。
4. **`.note-actions` 在 160px 及更窄**（产品不可达）不判不修，登记为已知限制（设计档 §1.4.4 边界表）。
5. **像素级 diff 不作为回归判据**（PRD §5 反需求 5）。§9 的像素统计仅作诊断证据；本轮未把任何像素阈值写进脚本断言。
6. **`32-answer-note-badge.png` 的运行时刻时间戳差异**（§9）在 M6 冻结规则的字面下属「其它内容差异」，本轮已定位到唯一来源（fixture 的 `timestamp: Date.now()` + `MessageBlock.formatTime`）并用「同代码两次运行」复现证明其为环境驱动；若评审要求更严口径，应把 fixture 的消息时间戳冻结为固定值（属取证脚本面，非本轮范围）。
7. **stub 的 `resolvedAt` 只在成功路径记录**（失败路径保持 `null`）；`r11-6` 只用成功路径。
8. **`r11-5` 的 `--pix-left-width` 复位**由 `restored-width` 相位硬判据保证（实测回到 268），其对后续场景的污染面未单独验证（`r11-5` 之后仅 `r11-6`，且 `r11-6` 自带 `enterNotesProbe` 复位）。
9. **`r11-3` 会把 reader 缩放留在 100%**（`zoom.clicks = 0`）⇒ 无需回退缩放；场景末态由 `restoreStandardSeed()` 复位（不含缩放）。
10. **上一轮实跑记录过的 `map-scale` 偶发性能红灯**（`展开耗时超限`）本轮**未复现**：本次两次 `ui-shot` 完整运行（验收 + 插桩诊断）退出码均为 0、`failure === null`。保留为既有 flakiness 备注。

---

## 9. M6 的 4 张截图改前 / 改后目视比对留档

范围（需求 §0.7 / 设计档 §2.3）：面板复位（`scrollTop = 0`）后随即截图的 4 处。比对方式：同尺寸（1600×1000）1:1 打开两图目视 + 逐像素统计（诊断用，`nativeImage.createFromPath().toBitmap()` 逐 BGRA 字节比对；脚本写在 `%TEMP%`，未留在仓库）。

| 截图 | 基线文件（`pix-v05-r11-base/shots/…`） | 验收文件（`pix-v05-r11-after/shots/…`） | 差异（逐项） | 结论 |
| --- | --- | --- | --- | --- |
| `02-notes-list.png` | 同路径；sha256 前缀 `4954ca7ece480d86`，84495 B | sha256 前缀 `4954ca7ece480d86`，84495 B | **0 px**（`diffPixels:0`、`clusters=0`） | **预期**：字节级一致；两图**均无浮层**（阅读区为「选择左侧文件开始阅读」空态） |
| `03-notes-current-doc.png` | 同路径；`40c1a8f3e92b35a2`，107113 B | 同前缀、同字节数 | **0 px** | **预期**：字节级一致；两图**均无浮层** |
| `08-notes-after-excerpt.png`（必看，含 duplicate 反馈态） | 同路径；`d7aa171ef451a02d`，120870 B | `f02d691c16cc83e5`，120838 B | `diffPixels:95`、`clusters=4`、全部 `maxD=2`（亚像素抗锯齿），bbox 分别 `[192,51,197,68]` / `[21,51,26,68]` / `[24,69,34,74]` / `[184,69,194,74]`（左栏顶部 tab 药丸圆角边缘） | **预期 / 无内容差异**：目视两图完全一致 —— 浮层在**两张图中均可见**且为「已在笔记中」（duplicate 反馈态）；笔记列表（资料库/笔记 5、共 5 条、当前文档 共 4 条）、正文、页码指示器、上下文 chip 行全部一致 |
| `32-answer-note-badge.png` | 同路径；`c81557b9cae3d879`，104576 B | `f3974226c04d0426`，104595 B | `diffPixels:223`、`clusters=6`：① `90 px` / `maxD=111` @ `[1543,838,1555,845]` 与 ② `38 px` / `maxD=111` @ `[1530,838,1536,845]` = 右侧对话最后一条消息的 HH:mm；③~⑥ 为与 `08` 同款的 4 个 tab 药丸抗锯齿簇（合计 95 px，`maxD=2`） | **非回归 / 环境驱动**：两图浮层状态一致（均不显示浮层）；唯一内容差异是**运行时刻**（基线 `12:48` → 验收 `13:26`）。根因链：`ui-shot.mjs` fixture 用 `timestamp: Date.now()` 构造消息，`MessageBlock.vue:18-23/56` 的 `formatTime` 渲染 `new Date(ts).toLocaleTimeString` ⇒ 任何两次运行都不同。**交叉证据**：把上一轮在本工作树的实跑产物（产品代码文件 mtime 均早于该次运行的 `generatedAt=13:15:58`，即两次运行的聊天渲染代码相同）与本次比对 ⇒ `32-answer-note-badge.png` 只有 1 个簇 `82 px` / `maxD=111` @ `[1543,838,1555,845]`（同一时间戳区域），同一对比下 `08-notes-after-excerpt.png` 只有 `maxD=2` 的抗锯齿簇 ⇒ 时间戳差异可在同代码两次运行间复现 |

**M6 判定规则复核（设计档 §2.3 冻结）**：差异只允许是「浮层是否可见」。本轮实测：4 张的**浮层可见性均无差异**（`08` 两图均为可见的 duplicate 反馈，其余三张两图均无浮层）；另有两类非内容差异 ——（a）左栏 tab 药丸边缘的**亚像素抗锯齿**（`maxD ≤ 2`，在 20 张基线截图上同样出现，与 R11 无关）；（b）`32` 的**运行时刻时间戳**（已定位根因并用同代码两次运行复现）。两者都不是布局 / 文案 / 元素可见性变化（`w/h/fontSize/color/background` 类差异由 `MEASUREMENTS.json` 的几何断言判定，本轮全绿，含 `notes-search|search-row-form` 与 `notes-copy|geometry`）。**若负责人按字面要求「零非浮层差异」，则需先冻结 fixture 的消息时间戳（§8 第 6 条）**。

**回归面全量诊断（超出 M6 要求，仅作证据）**：对基线 112 张全部逐像素统计 ⇒ **76 张字节/像素级一致、36 张有差异**；差异分为两类并全部落在（a）聊天消息 HH:mm 时间戳簇（16 张，`maxD` 111~210）与（b）元素边缘/字形抗锯齿（20 张，`maxD ≤ 21`，多为 1~120 px）。无任何 `w/h/fontSize/color/background` 类差异。

---

## 10. 交付物清单与未销账问题

| 类型 | 路径 |
| --- | --- |
| 产品代码 | `pix/src/renderer/components/workspace/NotesPanel.vue`、`pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` |
| 取证脚本 | `pix/scripts/ui-shot.mjs`、`pix/scripts/smoke-notes.mjs`（新建） |
| 配置 | `pix/package.json`（仅 `scripts.smoke:notes`） |
| 文档 | `README.md`（7 处行内更正）、`docs/pm/R11-dev.md`（本档） |
| 取证产物（仓库外） | `%TEMP%/pix-v05-r11-base/shots/{MANIFEST,MEASUREMENTS}.json`（复用）、`%TEMP%/pix-v05-r11-after/shots/{MANIFEST,MEASUREMENTS}.json`（本次） |

**未销账问题（需负责人处置）**

1. **D1**：设计档要求的「60-9 内追加一条 `.quick-ask-feedback.is-ok` 文本断言」未落地 —— 本次插桩实测证明该组合下反馈仅存在约 1 ms 且被与 N73-2 无关的 `selectionchange → showFor` 重置；已由 `r11-3` 覆盖同一用户可见属性。裁决选项见 §7 D1。
2. **M6 字面口径**：`32-answer-note-badge.png` 的运行时刻时间戳差异（§9）需负责人确认按「环境驱动、非回归」结案，或先冻结 fixture 时间戳后按字面复跑。

---

## 修复轮（R11 代码审查 must-fix 处置）

> 本步权限：只读文件 + `npm run check` + 离屏取证 + `node pix/scripts/smoke-notes.mjs` + 追加本节；未执行任何 git 写命令，未改白名单外文件，未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`。
> 对象：`docs/pm/R11-review.md`「代码审查（R11）」§3 must-fix 清单（**1 条**：D1；评审已注明「需负责人裁决；无代码面 must-fix」）。
> 结论：**修复条数 0** —— D1 判为**不接受**（技术理由见修复轮.1，含两次独立实跑证据）；交付面**代码零改动**（`pix/scripts/ui-shot.mjs` 已逐字节回归交付态，见修复轮.1 末「复原证明」）。三条复跑全绿：`CHECK_EXIT=0` / `UI_SHOT_EXIT=0`（离屏失败 0）/ `SMOKE_NOTES_EXIT=0`（烟测失败 0）。

### 修复轮.1 D1：不接受落地（60-9 保持 R10 原样），需负责人按评审 ①/② 裁决

**must-fix 原文（评审 §3 逐字）**：「D1 —— 需求 N73-2「【离屏·追加】60-9 加一条 `.quick-ask-feedback.is-ok` 逐字断言（有界等待 ≤1500 ms）」按字面未通过。」

**本步做法（先修后判，避免不当拒绝）**：按需求 §N73-2 的【离屏·追加】字面**真的实现**了该断言 —— 60-9 内追加「`.quick-ask-feedback.is-ok` 逐字 `已摘录 · 第 1 页`、有界等待 ≤1500 ms」，并额外加「+400 ms 复采」拦 ~1 ms 闪现造成的假绿；同时加页内「选区事件时钟」（`document` 级 capture `selectionchange` 计数 + 最近时刻）写进 `data`，并把点击前的有界等待用作对照实验。两次实跑均红灯：

| 实跑 | 点击前静默窗 | `selectionClock`（点击前 → 点击后） | 反馈探测（`data` 原样值） | 退出码 |
| --- | --- | --- | --- | --- |
| 1 | 150 ms | `{count:2, sinceLastMs:161}` → `{count:3, sinceLastMs:2}` | `feedbackWaitMs:1565`；`feedback {inDom:true, display:"flex", feedbackClass:null, feedbackText:null}`；`feedbackAfter400ms` 同值 | `UI_SHOT_EXIT=1` |
| 2 | 600 ms（总等待 ≤3000 ms） | `{count:2, sinceLastMs:633}` → `{count:3, sinceLastMs:1}` | `feedbackWaitMs:1544`；同上（两处 `feedbackClass` 均为 `null`，浮层停在 `display:flex` 的 actions 态） | `UI_SHOT_EXIT=1` |

⇒ 实跑 2 把静默窗放宽到 600 ms 后，第 3 次 `selectionchange` 仍然落在**点击之后**（点击前已静默 633 ms），**排除了**「程序化选区补派的原生事件与点击竞态」这一假设：该事件与摘录入库引发的 DOM 更新同刻（两处探测到的都是「浮层停在 `display:flex` 的 actions 态」），不是点击前遗留的补派事件；它与 N73-2 的滚动规则无关。复现路径（一次离屏，约 4 分钟）：在 `excerptFirstSpan` 内点击前加「连续 600 ms 无 `selectionchange` 才点击」的有界等待与页内计数，并在 60-9 的 `record` 前加 `waitFeedbackOk(1500)` + `sleep(400)` 复采 —— 即可复现上表第 2 行。

**不接受的技术理由**

1. **触发链与 N73-2 无关**：`onSelectionChange`（`PdfSelectionQuickAsk.vue:117`）→ `showFor()`（`:56`）进入即 `mode.value = "actions"`（`:61`）+ `feedback.value = null`（`:62`）⇒ 任何晚于反馈出现的 `selectionchange` 都会把「已摘录」抹回双按钮。N73-2 修的是「哪些滚动来源会隐藏浮层」，这是**第二个独立入口**，二者不可互相覆盖。
2. **本轮冻结面不允许改**：需求 §5 反需求 2 逐字「本轮只改『哪些滚动来源会隐藏浮层』这一条判定，不碰 `showFor` 的几何钳制与反馈时长」；评审 D1 也把「改产品」定义为 **② 另开一条需求**（需扩白名单到该组件的选区/反馈面）。本步无此授权。
3. **不能用观察器救判据**：页内 `MutationObserver` 能采到那 ~1 ms 的闪现，但用户不可见 ⇒ 属设计档明令禁止的假绿，且对改前/改后无判别力。
4. **同一用户可见属性已有承担者**：`r11-3` 相位 1（`excerpt-into-empty-panel`）在**同一「面板空态 → 列表」过渡**下实测稳定可采 —— 本次实跑 `quickAsk {display:"flex", feedbackClass:"quick-ask-feedback is-ok", feedbackText:"已摘录 · 第 1 页"}`、`waitMs:252`；相位 2（`notes-panel-scroll`）在面板滚动之后 `elapsedSinceFeedbackMs:253` 仍是同一反馈文本且 `hashSame:true`。
5. **回归安全**：60-9 的 `record(...)` 与判据逐字保持 R10 原样（本次实跑 `notes-search|delete-all-then-excerpt` 的 `data` 与基线**字符串级相等**，逐字段 `JSON.stringify` 比较为 `true`），既不新增也不降级、不改写。

**建议裁决：②**（另开一条需求处理「非滚动来源的 `selectionchange` 会重置摘录反馈」）。① 只是把「判据不可满足」写进档件；本步两次实跑的机制证据表明该行为在真实使用中同样可能触发（摘录入库引发的面板 DOM 更新带出 `selectionchange`），按 ② 修掉才能让该反馈在用户侧稳定可见。

**复原证明（代码零改动）**

```text
sha256sum pix/scripts/ui-shot.mjs
# ⇒ 9e5993d59f4d3b9838951b26c6712c0f3f9c30db4aeeaa00e9e96f5b52b0f33c（与 §4.8 记录的「插桩前」哈希逐字一致）
git diff --stat -- pix/scripts/ui-shot.mjs
# ⇒ 1 file changed, 577 insertions(+), 5 deletions(-)（与交付态一致）
node --check pix/scripts/ui-shot.mjs ⇒ SYNTAX_OK
```

### 修复轮.2 复跑（命令 + 原样结果）

| # | 命令 | 结果 |
| --- | --- | --- |
| 1 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"` | `CHECK_EXIT=0`（0 error） |
| 2 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-after" ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_EXIT=$?"` | 末两行 `[ui-shot] 结束：产出 119 张截图` / `UI_SHOT_EXIT=0` |
| 3 | 仓库根 `node pix/scripts/smoke-notes.mjs; echo "SMOKE_NOTES_EXIT=$?"` | 末行 `通过 26 / 失败 0` / `SMOKE_NOTES_EXIT=0` |

（2 的原始日志：`%TEMP%/pi-bg-bg_ba843234-d0239c4345a95d14.log`，第 477-478 行逐字如上；失败截图 `99-failure-state.png` 未产生。）

### 修复轮.3 离屏产物核对（对基线 `pix-v05-r11-base`）

| 项 | 基线 | 本次 | 判定 |
| --- | --- | --- | --- |
| 截图（按 basename） | 112 | 119 | 基线 112 张**零缺失**（`MISSING_SHOTS []`）；新增 7 张均为 `r11-*`（`r11-1/2/3/4/5/5b/6`） |
| 目录条目 | — | 磁盘 119 = 清单 119 | 零白名单外条目（`STRAYS []`） |
| 测量 | 153 | 167 | label 计数**零减少**（`LABEL_DROPS []`）；既有 record 一条不缺（`ONLY_IN_BASE []`）；新增 14 条 `r11-*` record |
| `MANIFEST.failure` | `null` | `null` | 两侧一致；无 `99-failure-state.png` |
| 60-9 记录 | — | — | `notes-search|delete-all-then-excerpt` 的 `data` 与基线字符串级相等 |

> 核对脚本写在 `%TEMP%`（`pix-r11-fix-compare.mjs` / `pix-r11-fix-compare2.mjs`），跑完即删；未落进仓库。两次红灯实跑因与本次共用同一 `PIX_SHOT_ROOT`，其产物已被本次运行按设计覆盖（§0.5 的目录自净语义），证据以上表引用的控制台原样值 + 复现路径为准。

### 修复轮.4 未处置项（非 must-fix，建议随 D1 裁决一并处置）

- 评审 §4 次级项 1：`R11-req.md` 的 `notes-*` 注册面事实行（现写 6 个，实测 7 个：`ipc-handlers.ts` 的 `:468/:470/:472/:476/:478/:480/:482`）需更正；本步未改需求档（冻结契约面）。
- 评审 §4 次级项 2-6：D2/D4 的「增量口径」措辞、D3 上浮、`32-answer-note-badge.png` 的运行时刻差异（M6 字面口径）、`r11-3` 相位 2 的 `elapsedSinceFeedbackMs` 留档、`.reader-content` / `.map-tree` / `document` 级滚动源的走查覆盖面 —— 均为登记 / 口径类，无代码面动作。

**修复轮终值：修复条数 0 / `CHECK_EXIT=0` / 离屏失败 0 / 烟测失败 0。**

---

## 终验（R11）

> 执行时间：2026-09-16 14:05–14:30（Windows + git bash，仓库根 `E:/develop/PiX-Read`）；冷启动代理，未参与本轮开发。
> 本步权限：只读文件 / 追加本节 / `cd pix && npm run check` / 离屏 `ui-shot.mjs`（指定 `PIX_SHOT_ROOT`）/ `node pix/scripts/smoke-notes.mjs` / 只读 `git status|diff|log|show`。
> 未执行任何 git 写命令；未运行 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未改 `packages/**`；未引入或升级依赖；未改白名单外任何文件（本节除外）。
> 全部结论来自真实文件内容与真实命令输出；一次性核对脚本写在 `%TEMP%`（`pix-r11-final-verify.mjs` / `pix-r11-final-fielddiff.mjs` / `pix-pngdiff.mjs` / `pix-pngsweep.mjs` / `pix-pngregion.mjs` / `pix-crop.mjs` / `pix-mask-debug.mjs`），跑完已删除，仓库零残留。

### 终验.1 白名单与零 diff

```bash
cd E:/develop/PiX-Read && git status --short
git diff --stat
git status --porcelain -- packages/ package-lock.json pix/package-lock.json
git diff -U0 -- pix/package.json | grep -E '^[-+]' | grep -Ev '^[-+]{3}'
```

原样结果：

```text
 M README.md
 M pix/package.json
 M pix/scripts/ui-shot.mjs
 M pix/src/renderer/components/workspace/NotesPanel.vue
 M pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue
?? docs/pm/R11-design.md
?? docs/pm/R11-dev.md
?? docs/pm/R11-req.md
?? docs/pm/R11-review.md
?? pix/scripts/smoke-notes.mjs

 README.md                                          |  16 +-
 pix/package.json                                   |   1 +
 pix/scripts/ui-shot.mjs                            | 582 ++++++++++++++++++++-
 .../renderer/components/workspace/NotesPanel.vue   |   5 +-
 .../components/workspace/PdfSelectionQuickAsk.vue  |   8 +-
 5 files changed, 596 insertions(+), 16 deletions(-)

package-lock.json / packages/** ⇒ 输出为空（零 diff）
+pix/package.json 唯一新增行：    "smoke:notes": "node scripts/smoke-notes.mjs",
```

结论：改动文件与需求档 §6 白名单一致（10 项：5 改 + 4 文档 + 1 新建）；`packages/**`、lockfile、`pix/package.json` 的依赖字段零 diff（`dependencies` / `devDependencies` / `build` 均未出现在 diff 中）。终验运行后复跑 `git status --short` 仍只有上述 10 项（见终验.6）。

### 终验.2 唯一工程门

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
```

```text
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0
```

结论：**0 error（CHECK_EXIT=0）**。

### 终验.3 全新离屏取证

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-final" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_FINAL_EXIT=$?"
```

（跑前 `tasklist | grep -i -E "electron|ui-shot"` 为空 ⇒ 无第二个取证进程并发；目标目录 `pix-v05-r11-final` 事先不存在，由脚本自建。）

原样结果（关键行）：

```text
[ui-shot] 截图目录：C:\Users\86157\AppData\Local\Temp\pix-v05-r11-final\shots
[ui-shot] r11-1 笔记搜索框内的 Esc 不关闭 PDF 搜索面板
[ui-shot] r11-1 对照：body 上的 Esc 仍关闭 PDF 搜索面板
[ui-shot] r11-2 笔记搜索框内的 Esc 不退出框选模式
[ui-shot] r11-2 对照：body 上的 Esc 仍退出框选模式
[ui-shot] r11-3 摘录反馈不被面板滚动吞掉 + 阅读区滚动仍隐藏
[ui-shot] r11-3 面板滚动不隐藏浮层
[ui-shot] r11-3 阅读区滚动仍隐藏浮层（对照）
[ui-shot] r11-4 删空最后一条后撤销行仍在且撤销成功
[ui-shot] r11-5 左栏 220px 下 .note-actions 不溢出（M4 判定表）
[ui-shot] r11-6 跨工作区迟到撤销响应零副作用（undoScope 守卫）
[ui-shot] 结束：产出 119 张截图
UI_SHOT_FINAL_EXIT=0
```

（完整日志：`%TEMP%/pi-bg-bg_5f3bea90-696ee798c52878f8.log`，478 行；6 个 r11 场景与 2 个对照相位全部执行。）

产物与基线比对（`%TEMP%/pix-r11-final-verify.mjs` 读两侧真实 JSON）：

```text
final.generatedAt=2026-09-16T06:12:16.731Z failure=null shots=119
base.generatedAt=2026-09-16T04:49:08.848Z  failure=null shots=112
[OK] MANIFEST.failure === null
[OK] 基线截图零缺失（missing=[]）
新增 7 张：r11-1-esc-pdf-search-panel.png / r11-2-esc-capture-mode.png / r11-3-excerpt-feedback-visible.png /
          r11-4-undo-row-after-empty.png / r11-5-note-actions-narrow.png /
          r11-5b-note-actions-narrow-row.png / r11-6-stale-scope.png
[OK] 新增截图恰 7 张且均为 r11-*
base 总条数=153 labels=32；final 总条数=167 labels=37
[OK] 基线 label 零缺失（missingLabels=[]）
[OK] 基线每 label 条数零减少（dropped=[]）
新增 label：r11-esc-scope / r11-quick-ask-scroll-scope / r11-undo-after-empty / r11-note-actions-narrow / r11-undo-scope-stale
r11-* record 数=14
[OK] shots 目录无白名单外条目（strays=[]）
[OK] 磁盘 png 集合 === 清单集合（双向，119 = 119）
[OK] shots 目录仅本次产物（无 99-failure-state.png）
OUT_ROOT 一级条目：electron-userdata / library / library-b / shots / stub-preload.cjs / vite-cache
```

结论：**退出码 0、`MANIFEST.json.failure === null`、既有 112 张截图与 153 条既有测量零缺失、新增 7 张截图与 14 条 r11 record 齐备**；启动清理只删 `shots/`（`OUT_ROOT` 其它 5 个子项保留），结束自检未追加任何 `errors`。

既有冻结 record 的字符串级核对（`label|data.phase` 为键）：

```text
[OK] notes-search|esc / notes-search|clear-button / notes-copy|geometry / notes-search|search-row-form
     字符串级相等（|data| 逐字符，与基线完全一致）
[OK] notes-search|delete-all-then-excerpt（60-9 的 3 条 record 全量）/ notes-search|hits /
     notes-search|counts / notes-sort|default / notes-undo|repeat / notes-sort|scope 字符串级相等
字符串级变化 record：17 / 153
[OK] 变化的 record 集合 === 已逐字段核对为环境驱动的 17 条
[OK] 屏蔽环境字段（绝对路径 / createdAt·seedCreatedAt·updatedAt / 生成 id n-<epoch>-<rand> / elapsedMs·ms）后
     基线 153 条 record 内容级零变化
```

17 条环境驱动的差异字段（`pix-r11-final-fielddiff.mjs` 逐字段输出）：`tree-progress|static|live-page|trim` 与 `workspace-switch|*`、`reader-state-writes|*`、`answer-anchor|*`、`answer-save|reentrant` 的 `title` / `docFilePath` = 两个 `PIX_SHOT_ROOT` 的路径前缀（R11 §0.5 要求基线与验收用不同目录）；`notes-undo|restore` 的 `createdAt` / `seedCreatedAt`、`reader-state-degrade|rebuilt` 的 `updatedAt`、`answer-notes-list|badges` 的 `page2Ids[*]` = 运行时刻；`thirty-changes.elapsedMs`（75 → 67）与 `map-scale|long-book.timing.ms`（90 → 84） = 毫秒计时抖动。**无任一内容是计数 / 文案 / 布局 / 可见性字段。**

### 终验.4 新场景断言逐条复算

方法：不采信脚本自身的判定，直接从本次 `MEASUREMENTS.json` 的 `data` 重算 N73-1/N73-2/N74 的每一条失败即红条件（含空断言防护），共 **66 条**：

```text
[OK] r11-1/pdf-search-open ①–⑦、pdf-search-close-control ⑧
[OK] r11-2/capture-mode ①–⑧、capture-mode-exit-control ⑨–⑪
[OK] r11-3/excerpt-into-empty-panel ①–③（含反馈窗口 261 ms < 2500 ms）
[OK] r11-3/notes-panel-scroll ④–⑥（滚动后 display=flex、反馈仍逐字、文件 1 条 + 字节不变；elapsedSinceFeedbackMs=262）
[OK] r11-3/reader-scroll-control 可滚动前提 / 放大前防空 / ⑦ after=200 > 0 且 ≠ before=48 / ⑧ display=none / ⑨ 数据不变
[OK] r11-4/before-delete ①–③、after-delete-empty ④–⑩（.notes-undo 仍在 + 文案逐字 已删除「We study ret…」· 第 1 页）、restored ⑪–⑯
[OK] r11-5/default-width ①②、narrow-220 ③–⑦、restored-width ⑧⑨
[OK] r11-6 ①–⑥
== 汇总：复算条目 90 条（另 24 条为集合 / 目录 / 条数类核对），失败 0 条 ==
```

关键实测值（`data` 原文节选，本次运行）：

```text
r11-esc-scope :: pdf-search-open  before.focused=true → after {value:"", focused:false, rows:4, countText:"共 4 条"}, panelInDom=true, hashSame=true
r11-esc-scope :: capture-mode     entry {layerInDom:true, viewerCapture:true} → after 仍 {layerInDom:true, viewerCapture:true}, hashSame=true
r11-esc-scope :: 两个对照相位     panelInDom=false / layerInDom=false + viewerCapture=false
r11-quick-ask :: excerpt-into-empty-panel {rows:1, searchInDom:true, quickAsk:{display:"flex", feedbackClass:"quick-ask-feedback is-ok", feedbackText:"已摘录 · 第 1 页"}, waitMs:261}
r11-quick-ask :: notes-panel-scroll     {quickAsk:{display:"flex", feedbackText:"已摘录 · 第 1 页"}, fileCount:1, hashSame:true}
r11-quick-ask :: reader-scroll-control  {scroll:{before:48, after:200, scrollHeight:2670, clientHeight:950}, zoom:{text:"100%", clicks:0}, quickAskAfterScroll:{display:"none"}}
r11-undo-after-empty :: after-delete-empty {rows:0, countText:"共 0 条", empty:{title:"还没有摘录"}, undo:{rowCount:1, text:"已删除「We study ret…」· 第 1 页", btnText:"撤销", btnTitle:"还原这条笔记"}, hashChanged:true}
r11-undo-after-empty :: restored {rows:1, undoRowInDom:false, notice:{isSuccess:true, text:"已还原该条笔记"}, hashSame:true, searchInDom:true}
r11-note-actions-narrow :: narrow-220 {layoutLeftWidth:220, threshold:{node:".note-text", fontSize:12, T:27}, rows[0..1]: scrollOverflow=0,
                          actionsLeft=45 ≥ bodyLeft=45, copyLeft=142 / askWrapLeft=180 ≥ 45, right 214 ≤ pane.right+1,
                          copyY==askWrapY, actionsHeight=17.390625 ≤ 27, dom 三项=true}
r11-undo-scope-stale :: {restoreCallsDelta:1, resolvedAt:1789539135930 > panelReadyAt:1789539126960（迟到 8969 ms）, rows:2,
                         countText:"共 2 条", notice:null, hashSame:true}
```

`r11-5` 的 `pane.right` 未持久化在 `data` 中，本轮用该相位截图 `rect`（`{"x":8,"y":36,"width":224,"height":956}`，`rectOfSelector(...,2)`）反推 `pane.left=10 / width=220 / right=230`（与 `layoutLeftWidth=220` 自洽），据此复算右侧不越界为绿（判据容差 ±2 覆盖 rect 取整）。

### 终验.5 像素级补充核对（超出 PRD §7.1 的字面要求，作为诊断证据）

方法：`%TEMP%` 下零依赖 PNG 解码（zlib + 逐行反滤波），对基线 112 张、审查运行 119 张、本次 119 张做逐像素统计（`pix-pngsweep.mjs` / `pix-pngdiff.mjs`）。

```text
字节级一致：本次 vs 基线 62 / 112；本次 vs 审查运行 75 / 119
差异分类（对全部非一致项逐簇统计 bbox/px/maxD）：
 (a) 右栏对话的运行时刻文本（HH:mm / 相对时间）：maxD 111–224，簇均落在 x ≥ 1348 的对话列
 (b) 元素边缘 / 字形抗锯齿：maxD ≤ 8（多数 ≤ 3），簇 ≤ 95 px
 (c) 单像素宽的列分隔 / 滚动条边缘：18 px（如 [1266,946]-[1266,963]，maxD 224）
无任一类为内容级差异（无计数 / 文案 / 布局 / 元素可见性变化；与终验.3 的 DOM 级 153 条零变化互证）。
M6 4 张（本次实际核对）：
  02-notes-list.png / 03-notes-current-doc.png  ⇒ 与基线字节级一致
  08-notes-after-excerpt.png                   ⇒ 107 px / 7 簇 / maxD=2（左栏 tab 药丸与标题栏边缘），
                                                  浮层在两侧均可见且均为 duplicate 反馈 ⇒ 无浮层可见性差异
  32-answer-note-badge.png                     ⇒ 单一对话 HH:mm 时间戳簇（139 px / maxD=111）⇒ 环境驱动
```

结论：与开发档 §9、评审档 §4.4 的分类一致；M6 的「差异只允许是浮层是否可见」在本次运行的 4 张上为**无差异**，另有两类非内容差异（抗锯齿 / 运行时刻文本）。沿用开发档的登记，不新增判据。

### 终验.6 数据面烟测

```bash
cd E:/develop/PiX-Read && PATH="/c/Program Files/nodejs:$PATH" node pix/scripts/smoke-notes.mjs; echo "SMOKE_NOTES_EXIT=$?"
```

```text
[smoke-notes] 临时目录：C:\Users\86157\AppData\Local\Temp\pix-smoke-notes-1789539442309
[smoke-notes] typescript：E:\develop\PiX-Read\pix\node_modules\typescript\lib\tsc.js
== 组 undo-roundtrip == / == 组 undo-failures == / == 组 undo-slot-lifecycle == / == 组 export-and-empty ==
[通过] 26 条（#1..#8 各组成对出现，无 [失败] 行）
通过 26 / 失败 0
SMOKE_NOTES_EXIT=0
```

收尾核对（全部实跑）：

```text
ls -d "$TEMP"/pix-smoke-notes-*              ⇒ NO_SMOKE_RESIDUE
ls "$TEMP/pix-v05-r11-final/shots" | wc -l  ⇒ 121（119 png + MANIFEST.json + MEASUREMENTS.json）
git status --short                          ⇒ 只有白名单 10 项（终验.1 的清单，逐条比对一致）
非白名单条目过滤                            ⇒ NO_NON_WHITELIST_ENTRIES
```

### 终验.7 N73–N76 与 PRD-V0.5 §7.1 逐条结论

| 项 | 已实现（真实文件内容） | 有判据（本次实跑/复算） | 结论 |
| --- | --- | --- | --- |
| PRD §7.1 三个缺陷各有独立断言 | — | `r11-esc-scope` 4 条 + 2 张截图 / `r11-quick-ask-scroll-scope` 3 条 + 1 张截图 / N73-3 的脚本内守卫 + 结束自检（退出码 0、集合双向相等、零白名单外条目） | 满足（N73-2 另有「60-9 追加断言」字面未落地，见终验.8） |
| PRD §7.1 112 张截图 / 153 条测量零缺失 | — | 112 ⊆ 119（missing=[]）；153 条 label 零缺失、每 label 条数零减少、屏蔽环境字段后内容级零变化 | 满足 |
| PRD §7.1 `npm run check` 0 error | — | `CHECK_EXIT=0` | 满足 |
| N73-1 | `NotesPanel.vue`：`onSearchEsc(event: KeyboardEvent)` + `event.stopPropagation()`（唯一 1 处，函数内）+ 冻结注释逐字；`preventDefault` 0 处、`addEventListener("keydown"` 0 处、模板 `@keydown` 1 处（`:436`）；`PdfViewer.vue` 零 diff | 4 条 record 全绿（含两个对照相位）+ 2 张截图齐备 + 60-3/60-4 与基线字符串级相等 | **已实现 + 有判据** |
| N73-2 | `PdfSelectionQuickAsk.vue`：`onStageScroll(event)` 的三条守卫（`resolveStage()` / `instanceof Node` / `stage.contains(`）逐字与 §0.4 判定式一致，`closest(` 0 处，`document` 级 capture 滚动监听仍恰 1 处（`:180`），`hide()` / `showFeedback` 零改动 | 3 条 record 全绿（面板滚动不隐藏 / 阅读区滚动隐藏 / 数据不变）+ 1 张截图 + 60-9 全部既有断言与基线字符串级相等 | **已实现 + 有判据**；需求档 N73-2【离屏·追加】的 60-9 断言按字面未落地（D1，见终验.8） |
| N73-3 | `ui-shot.mjs`：`assertOutRootSafe()`（`:6380`）为 `main()` 首条语句（`:6400`，早于 `app.setPath` `:6401` / `mkdirSync(OUT_ROOT)` `:6402` / `rmSync(SHOTS_DIR` `:6405`）；`rmSync(SHOTS_DIR` 恰 1 处；结束自检 `:6477-6495`（两个 JSON 写完、`server.close()` `:6498` 之前）；`readdirSync` / `node:os.tmpdir` / `basename` / `sep` 已导入 | 本次运行独立复现：退出 0 + `failure=null` + 磁盘集合 === 清单集合 + 零白名单外条目；`OUT_ROOT` 其它子项保留。守卫负向控制与预置残留复核**本轮未重跑**（超出本步命令面），以开发档 §4.5 与评审档 §1.5 的实跑记录 + 上述静态走查为证据 | **已实现 + 有判据**（负向控制沿用既有实跑留档） |
| N74-1 | 产品代码零改动（`r11-undo-after-empty` 只补断言） | 3 条 record 全绿：删空后 `.notes-undo` 仍在、`.undo-text` 逐字、点击后字节级回复（`hashSame:true`）+ 1 张截图 | **已实现 + 有判据** |
| N74-2 | 220px 下五类判据全绿 ⇒ 按冻结边界**不修**；`NotesPanel.vue` 本轮无样式面 diff | 3 条 record 全绿 + 2 张截图 + 阈值 `T=27` / 节点 `.note-text` / 字号 12 逐字登记 | **已实现 + 有判据** |
| N74-3（可选） | 已落地（stub 记 `resolvedAt`） | 1 条 record 全绿：迟到 8969 ms、行恒为第 ④ 步写入的两条、`notice:null`、字节不变 | **已实现 + 有判据** |
| N75 | `pix/scripts/smoke-notes.mjs` 存在（553 行）；`pix/package.json` 仅 `scripts.smoke:notes` 一键；lockfile / `packages/**` 零 diff | 本次实跑 `通过 26 / 失败 0`、退出 0；4 组 26 条逐条 `[通过]`；`%TEMP%` 无残留；仓库零残留 | **已实现 + 有判据** |
| N76 | `README.md` diff 恰 3 hunk / 16 变更行（7 删 9 增），内容与需求 §4 的 7 子条逐条对应 | 事实核对（本次实跑 `ls`）：`pix/src/main` 14 个 `.ts`（含 `notes-store.ts` / `reader-state-store.ts`）；`components/workspace` 8（含 `NotesPanel` / `PdfSearchPanel` / `PdfSelectionQuickAsk`）；`components/session` 4（含 `GuideBlock`）；`stores` 7（含两者）；`composables` 4（含 `useQuickAsk`）；`utils` 8；`ipc-handlers.ts` 的 `notes-*` 7 处（`:468/470/472/476/478/480/482`）、`window-*` 4（`:589/593/603/607`）、`reader-state-*` 2（`:488/490`） | **已实现 + 有判据** |

### 终验.8 未销账项 / 未复核项

1. **D1（唯一实质未销账项，需负责人裁决）**：需求档 N73-2 的【离屏·追加】「60-9 内追加 `.quick-ask-feedback.is-ok` 逐字断言（有界等待 ≤1500 ms）」按字面**未落地** —— 本次独立复核：60-9 的 `notes-search|delete-all-then-excerpt` 三条 record 与基线**字符串级相等**（无新增 / 无替换 / 无降级）；同一用户可见属性由 `r11-3` 相位 1 承担且本次复算全绿（`feedbackText:"已摘录 · 第 1 页"`、`display:flex`、`waitMs:261`）。评审 §3 已登记为 must-fix 1、开发档修复轮判为「不接受落地（机制与本轮修复无关）」并给出两条裁决路径；本终验**维持该未销账标记**，不代负责人裁决。
2. **N73-3 的守卫负向控制（`PIX_SHOT_ROOT` 指向仓库外非临时目录 ⇒ 期望 EXIT=1 + 逐字文案 + 目录未被创建）与预置残留复核本轮未重跑**：超出本步命令面（本步只允许以指定 `PIX_SHOT_ROOT` 运行一次 ui-shot）。证据为开发档 §4.5 / 评审档 §1.5 的实跑留档 + 本次静态走查（守卫为 `main()` 首条语句、`app.exit(1)` 分支 `:6394` 早于清理点 `:6405`）。
3. **M6 字面口径（`32-answer-note-badge.png` 的运行时刻 HH:mm 差异）**：本次独立复核为环境驱动（同一比对中 `02` / `03` 与基线字节级一致，`08` 仅 maxD=2 的抗锯齿簇；对话列时间戳簇在本轮多张截图上以 maxD 111–224 复现）。若负责人要求「零非浮层差异」的字面口径，须先冻结 fixture 的消息时间戳（属取证脚本面，非本轮范围）。
4. **未复核项**：`r11-5` 的 `pane.right` 判据依赖未持久化的 `leftRight`（本轮用截图 rect 反推复算，见终验.4）；`.reader-content` / `.map-tree` / `document` 级滚动源仍只有走查结论（与开发档 §8.3 一致）；像素级差异未作为任何断言（仅诊断）。

### 终验.9 终验判词

- `npm run check` = **0 error**；离屏取证 **退出码 0**、`failure === null`、**119 张截图 / 167 条测量**；基线 **112 张截图零缺失、153 条既有测量零缺失**（屏蔽路径/时刻/计时字段后 153/153 内容级相等）；新增 **7 张截图 / 14 条 record** 齐备且逐条复算（66 条）全绿；烟测 **26/26 通过、退出 0**；白名单、零 diff、零残留三条红线全清。
- **可提交**：是。唯一需负责人先行处置的是 **D1 的裁决**（不影响代码正确性与回归安全，属「需求判据字面 vs 同一用户可见属性由 r11-3 承担」的口径问题）。

---

### 修复轮.4 N73-2b 落地（追加裁决 ②）

> 执行：2026-09-16（Windows + git bash，仓库根 `E:/develop/PiX-Read`）；负责人裁决 = **② 把 N73-2b 作为 N73-2 的组成部分修掉**（`R11-review.md`「## 追加裁决（R11）」）。
> 依据：`R11-req.md`「### N73-2b（追加 · 负责人裁决）」的冻结语义 S1–S7 与验收判据 (a)(b)(c)；`R11-design.md`「## 追加设计（R11 · N73-2b）」追加-1…追加-7。
> 本步权限：只读文件 / 追加本节 / `cd pix && npm run check` / 离屏 `ui-shot.mjs`（指定 `PIX_SHOT_ROOT`）/ `node pix/scripts/smoke-notes.mjs` / 只读 `git status|diff|log|show`。
> 未执行任何 git 写命令；未运行 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未改 `packages/**`；未引入依赖；未改白名单外任何文件（本轮白名单 = `PdfSelectionQuickAsk.vue` / `ui-shot.mjs` / 本档；`NotesPanel.vue` 本轮零改动）。
> 一次性核对脚本写在 `%TEMP%`（`pix-r11-n732b-verify.mjs` / `pix-r11-n732b-pngdiff.mjs`），跑完即删，仓库零残留。
> **结论：已落地。** 组件早退分支按字面实现（净 +3 行；`showFor` / `hide` / `showFeedback` / `onStageScroll` / 监听注册零 diff）；60-9 恢复需求原字面的 A1–A3（含 `data.excerptFeedback`）；`r11-3` 追加相位 4（B1–B5）/ 相位 5（C1–C4）；`CHECK_EXIT=0`、离屏 `UI_SHOT_EXIT=0`（120 张截图 / 169 条测量 / `failure === null`）、烟测 `SMOKE_NOTES_EXIT=0`（26 通过 / 0 失败）；既有 112 张截图与 153 条既有 label **零缺失**。

#### 一、改动（行号为改后真实行号）

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | `onSelectionChange` 内新增 2 行注释（`:134-135`）+ 1 行早退分支（`:136`）：`if (mode.value === "feedback" && visible.value && text.trim() === cachedText) return;`，位置在守卫 3（`:130-133`）之后、`void showFor(...)`（`:137`）之前；其余行逐字不变 |
| 2 | `pix/scripts/ui-shot.mjs` | ① `excerptFirstSpan` docstring（`:4970-4976`）改写为 N73-2b 口径；② 新增 helper 6 个：`quickAskStateProbe`（`:5025`）/ `selectionProbe`（`:5038`）/ `pageSpanText`（`:5050`）/ `focusPage`（`:5056`）/ `excerptViaQuickAsk`（`:5066`，相位 4/5 公共前置）/ `waitFeedbackCleared`（`:5089`）；③ 60-9 注释改写 + 追加 A1–A3 与 `data.excerptFeedback`（`:5459-5485`）；④ `r11-3` 追加相位 4 `spurious-selectionchange`（`:6265-6327`）与相位 5 `different-text-reset`（`:6329-6377`）+ 截图 `r11-3b-feedback-after-spurious-selectionchange.png`；⑤ 既有场景 07 的 G2 段（`:1245-1250`）追加 1 个有界等待（**偏差 ②**） |

**组件走查判据（设计档追加-1 §1.4 逐条实测）**

```text
grep -n 'mode.value === "feedback"' PdfSelectionQuickAsk.vue  ⇒ 1 处：:136（守卫 3 与 showFor 调用之间）
grep -c "mode.value"        ⇒ 5   （改前 4 + 新增 1）
grep -c "closest("          ⇒ 0
grep -c "FEEDBACK_MS"       ⇒ 2   （:22 定义 + :114 使用，不变）
grep -c "setTimeout("       ⇒ 1   / grep -c "clearTimeout(" ⇒ 4（均不变）
grep -c "instanceof Node"   ⇒ 1   （N73-2 既有，不变）
git diff --numstat -- PdfSelectionQuickAsk.vue ⇒ 9 / 2（含 R11 既有 N73-2 的 6+/2-；本追加 = 净 +3 行 = 2 行注释 + 1 行分支）
git diff --stat -- PdfViewer.vue ⇒ 空（零 diff）
```

早退分支内只有 `return`：无 `hide()` / `showFor(` / `showFeedback(` / `setTimeout(` / `clearTimeout(` / `pos` 写入（`git diff` 逐字核对通过）；三个 `hide()` 守卫与 `showFor` 调用零 diff；比较式两侧均 `trim()`（未用 `startsWith` / `includes` / `localeCompare` / 空白归一化）。

#### 二、真实命令与原样结果（按执行顺序）

| # | 命令 | 原样结果 |
| --- | --- | --- |
| 1 | `node --check pix/scripts/ui-shot.mjs` | `SYNTAX_OK` |
| 2 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"` | 三行 tsc 输出后 `CHECK_EXIT=0`（0 error） |
| 3 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-after2" ./node_modules/.bin/electron scripts/ui-shot.mjs`（实跑 1，加场景 07 等待**之前**） | `UI_SHOT_EXIT=1`；`:57 [renderer:3] Uncaught Error: excerpt button not found`、`:58 场景失败：Script failed to execute, this normally means an error was thrown.`、`[shot] 99-failure-state.png`（现场 = 场景 07 G2） |
| 4 | 同上（实跑 2，加等待之后） | `UI_SHOT_EXIT=1`；`场景失败：断言失败 map-scale：展开耗时超限：966ms(mode=ready)`（阈值 800 ms，与本次改动无关，**偏差 ③**） |
| 5 | 同上（实跑 3） | `UI_SHOT_EXIT=0`；`[ui-shot] 结束：产出 120 张截图`；`MANIFEST.json.failure === null`（`generatedAt=2026-09-16T06:41:48.038Z`） |
| 6 | `node pix/scripts/smoke-notes.mjs; echo "SMOKE_NOTES_EXIT=$?"` | 末行 `通过 26 / 失败 0`；`SMOKE_NOTES_EXIT=0`（`[失败]` 计数 0，`[通过]` 计数 26） |

离屏新相位日志（实跑 3 原样）：

```text
[ui-shot] r11-3 摘录反馈不被面板滚动吞掉 + 阅读区滚动仍隐藏
[shot] r11-3-excerpt-feedback-visible.png
[ui-shot] r11-3 面板滚动不隐藏浮层
[ui-shot] r11-3 阅读区滚动仍隐藏浮层（对照）
[ui-shot] r11-3 相位 4：同文本 selectionchange 后反馈保持（N73-2b）
[shot] r11-3b-feedback-after-spurious-selectionchange.png
[ui-shot] r11-3 相位 5：不同文本 selectionchange 重置为 actions（对照）
[ui-shot] 结束：产出 120 张截图
```

两次取证未并发（跑前 `tasklist | grep -i electron` 为空）。受检代码状态（实跑 3 后未再改动代码）：

```text
sha256  PdfSelectionQuickAsk.vue  bff06eb2ddfb27b9cdf3a235e09af87b870320a0c6556efcbf2838f2dc1131e7
sha256  pix/scripts/ui-shot.mjs    6843c8bd76286f4a4de9368c931cd6a7006c0097da21c22dc0f2d74935a7b4b3
```

#### 三、截图与测量核对表（基线 `pix-v05-r11-base` vs 本次 `pix-v05-r11-after2`）

| 项 | 基线 | 本次 | 判定 |
| --- | --- | --- | --- |
| `shots/*.png` | 112 | **120** | 基线 112 张**零缺失**（`missingShots=[]`）；新增 8 张均为 `r11-*`（R11 既有 7 张 + `r11-3b-feedback-after-spurious-selectionchange.png`） |
| `MEASUREMENTS.json` | 153 | **169** | 既有 label 零缺失（`missingLabels=[]`）、每 label 条数零减少（`labelCountDropped=[]`）；既有 5 个新 label 不变，`r11-*` record 14 → **16** |
| `MANIFEST.failure` | `null` | `null` | 两侧一致；无 `99-failure-state.png` |
| 目录自检 | — | 磁盘 120 = 清单 120；白名单外条目 `strays=[]` | 双向集合相等 |
| `r11-quick-ask-scroll-scope` | 3 条 record | **5 条**（新增 `spurious-selectionchange` / `different-text-reset`） | 5 条 `failures` 全为 `undefined`（全绿） |
| 60-9 `notes-search|delete-all-then-excerpt` | `data` 4 键、无反馈字段 | `data` 增 `excerptFeedback`；既有字段字符串级相等 | `base excerpted/steps/empty 一致 = true`；`failures` 未追加（A1–A3 全通过） |
| 冻结 record（`notes-search|esc` / `clear-button` / `search-row-form` / `notes-copy|geometry` / `notes-sort|default` / `notes-undo|repeat`） | — | `data` 与 `failures` 均**字符串级相等** | 6/6 通过 |

**补充诊断（超出本轮字面要求，仅作证据）**：`%TEMP%/pix-r11-n732b-pngdiff.mjs` 逐像素解码比对 112 张既存截图（zlib 解压 + 逐行反滤波 + 差异簇聚类）：

```text
字节级一致 66 / 112；有差异 46 张，全部归为两类环境驱动差异：
 (a) 右栏对话运行时刻文本（簇如 [1554,125,1560,132] / [1535,125,1541,132]，maxD 84–111；35/36 另含一行 x≥1348 的相对时间文本，maxD 210）
 (b) 元素边缘 / 字形抗锯齿（maxD ≤ 3，簇 ≤ 55 px）
M6 四张：02-notes-list.png / 03-notes-current-doc.png / 08-notes-after-excerpt.png ⇒ 0 px（字节级一致）；
          32-answer-note-badge.png ⇒ 188 px / 6 簇（两类环境驱动，无内容差异）
场景 07 三张：07-excerpt-feedback.png / 07c-excerpt-duplicate-zoom.png ⇒ 0 px（加等待后截图内容未变）
```

无任一差异簇落在阅读区列（x ∈ [430, 1348]）的浮层区域；与 `R11-dev.md` §9 / 终验.5 的分类一致 ⇒ M6 口径下**无浮层可见性差异**。

#### 四、新断言实测值（由 `MEASUREMENTS.json` 的 `data` 独立复算，不看脚本自身判定）

```text
== 60-9 追加（判据 (a)，A1–A3） ==
excerptFeedback = {"waitMs":1,
  "first":{"inDom":true,"display":"flex","feedbackClass":"quick-ask-feedback is-ok","feedbackText":"已摘录 · 第 1 页"},
  "after400ms":{"inDom":true,"display":"flex","feedbackClass":"quick-ask-feedback is-ok","feedbackText":"已摘录 · 第 1 页","btnCount":0}}
A1 = true | A2 = true | A3 = true | 既有 excerpted/steps/empty 与基线字符串级相等 = true | failures = undefined

== 相位 4 spurious-selectionchange（判据 (b)，B1–B5） ==
B1 = true | B2 = true | B3 = true | B4 = true | B5 = true
waitMs = 1 | dispatchAtMs = 948 | feedbackGoneAtMs = 2569
before        = {"display":"flex","feedbackClass":"quick-ask-feedback is-ok","feedbackText":"已摘录 · 第 2 页","btnCount":0}
afterDispatch = 同上（同文本 selectionchange 后仍在反馈态，动作行未渲染）
after600ms    = 同上（+600 ms 复采仍为反馈态）
atExpiry      = {"display":"flex","feedbackClass":null,"feedbackText":null,"btnCount":2}（回落 actions 态）
selectionBefore = {"text":"3. Ablation Study","collapsed":false,"anchorInStage":true} | spanText2 = "3. Ablation Study"
selectionAfter  = {"text":"3. Ablation Study","collapsed":false,"anchorInStage":true} | fileCount = 2 | hashSame = true

== 相位 5 different-text-reset（对照组，C1–C4） ==
C1 = true | C2 = true | C3 = true | C4 = true
feedbackBefore = {"display":"flex","feedbackClass":"quick-ask-feedback is-ok","feedbackText":"已摘录 · 第 3 页"}
spanText2 = "3. Ablation Study" | spanText3 = "4. Conclusion"（「不同文本」前提成立）
afterDifferentText        = {"display":"flex","feedbackClass":null,"feedbackText":null,"btnCount":2}
afterDifferentTextRecheck = 同上（复采）
selectionAfter = {"text":"3. Ablation Study","collapsed":false,"anchorInStage":true} | fileCount = 3 | hashSame = true
```

判别力核对：`B4` 上界 = `dispatchAtMs + 2200 = 3148` > 实测 `2569`；若计时被重开（≥ `dispatchAtMs + 2500 = 3448`）⇒ 上界必红；`B4` 下界 = 1900 < 2569。相位 4 截图为整窗截图（`rect = null`），画面同框可见：浮层「已摘录 · 第 2 页」（绿勾）、第 2 页选区高亮、左栏 2 行笔记。

#### 五、偏差（逐条登记 + 证据 + 处置）

| # | 偏差 | 证据（真实输出） | 处置 |
| --- | --- | --- | --- |
| ① | 设计档建议的 helper 名 `waitFeedbackGone` 与既有同名 helper（`ui-shot.mjs:2082`，**同一函数作用域**，用于 `.answer-note-feedback`）重名 ⇒ 改用 `waitFeedbackCleared` | 设计档追加-2 §2.4 明示「命名自由」；同作用域重复 `const` 声明会直接 SyntaxError | 改名，语义与返回形状 `{ probe, at }` 不变；已在 helper docstring 内注明改名原因 |
| ② | **既有场景 07 G2（重复摘录）此前隐式依赖 D1 的行为**：它重造同文本选区后直接点「摘录」，靠那次同文本 `selectionchange` 把反馈重置回 actions 才有点击目标 | 实跑 1：`:57 Uncaught Error: excerpt button not found`（`UI_SHOT_EXIT=1`） | 在既有点击前**只补 1 个有界等待**（`waitFor` 默认 20 s，实测等待 ≤ 2500 ms + 120 ms 轮询粒度）：`:1245-1250`。未改任何 `record` / 判据 / `capturePage` / 截图名；07 与 07c 截图与基线**逐字节一致**（0 px） |
| ③ | `map-scale | long-book` 展开耗时抖动：实跑 2 读到 966 ms（阈值 800 ms） | 实跑 2 原始行：`场景失败：断言失败 map-scale：展开耗时超限：966ms(mode=ready)` | 与本次改动无关（知识地图面，本步零改动；R11 交付与终验批次同口径读数为 84–90 ms）⇒ 判为环境负载抖动，实跑 3 同命令通过（退出码 0） |
| ④ | 设计档追加-3 第 6 行的处方（「把相位 1 截图移到相位 4 之后」）**未触发** | `dispatchAtMs = 948`（下限 900 ✅ / 上限 2100 ✅，余量充足；`feedbackGoneAtMs = 2569` 亦在上界 3148 内） | 不需要调整次序，相位 1/2/3 与截图位置逐字未动 |
| ⑤ | 新增 helper 为 **6 个**（设计档字面列 5 个） | `excerptViaQuickAsk` 把相位 4/5 的公共前置（点「摘录」+ 轮询文件条数 + 等面板回位）收成 1 处，避免三段重复代码 | 登记；未改 `quickAskProbe` / `waitFeedbackOk` 的既有返回形状（设计档明示的约束） |
| ⑥ | 60-9 的 A3 复采窗口取设计档字面值 400 ms（`sleep(400)`） | 追加段总等待 = `waitFeedbackOk`（实测 1 ms）+ 400 ms < `FEEDBACK_MS` 2500 ms；实测 A3 绿 | 无偏差，登记实测值 |

#### 六、未验证事项 / 已知限制

1. **未运行** `npm run build` / `npm test` / `npm run package` / `npm run dev`（超出本步命令面，且项目规范禁止子代理运行）。
2. **N73-3 的守卫负向控制与预置残留复核本轮未重跑**（超出本步命令面）；沿用 `R11-dev.md` §4.5 与评审档 §1.5 的实跑留档 + 本次成功运行的结束自检（磁盘集合 === 清单集合、零白名单外条目）。
3. **相位 4 的时序余量**：B3（`dispatch + 600 ms` 复采）依赖「反馈窗口 2500 ms 内完成派发与复采」；本次实测派发 948 ms、到期 2569 ms，均有余量，但在显著更慢的环境下可能变红（设计档已把它列为风险并给出处方 ④）。相位 5 无时间窗依赖。
4. **`r11-3` 相位 4/5 依赖目标页已渲染**：由 `focusPage` 先 `scrollIntoView({ block: "center" })` 再 `waitFor` 文本层兜底；若 20 s 内未渲染 ⇒ 场景硬失败（不降级为跳过）。
5. **M6 的 4 张截图为逐像素诊断（非断言）**：本次结论 = 无浮层可见性差异；其中 `32-answer-note-badge.png` 的运行时刻时间戳差异仍存在（与 §9 / 终验.8 第 3 条同口径）。
6. **未复核项**：`r11-5` 的 `pane.right` 未持久化、`.reader-content` / `.map-tree` / `document` 级滚动源仍只有走查结论（与 `R11-dev.md` §8.3 一致）——均属既有登记，本追加未改变其状态。

**修复轮.4 终值：代码净 +3 行 / `CHECK_EXIT=0` / 离屏 `UI_SHOT_EXIT=0`（120 张截图、失败 0）/ 烟测 `SMOKE_NOTES_EXIT=0`（失败 0）/ 既有 112 张截图与 153 条 label 零缺失 / 新增断言 A1–A3、B1–B5、C1–C4 共 12 条全绿。**

---

### 修复轮.5 取证面稳定性修复（滚动静默前置）

> 执行：2026-09-16（Windows + git bash，仓库根 `E:/develop/PiX-Read`）；对象 = `R11-review.md`「## 代码审查（R11 · N73-2b）」§6 must-fix 1（相位 4/5 对「反馈窗口内出现阅读区滚动」不可判别，同一代码 3 次实跑 1 绿 2 红）。
> 本步权限：只读文件 / 追加本节 / `cd pix && npm run check` / 离屏 `ui-shot.mjs`（各自 `PIX_SHOT_ROOT`，两次不并发）/ `node pix/scripts/smoke-notes.mjs` / 只读 `git status|diff|log|show`。
> 未执行任何 git 写命令；未运行 `npm run build` / `npm test` / `npm run package` / `npm run dev`；**`pix/src/**` 本轮零改动**（`PdfSelectionQuickAsk.vue` sha256 = `bff06eb2ddfb27b9cdf3a235e09af87b870320a0c6556efcbf2838f2dc1131e7`，与修复轮.4 留档值逐字相同）；未引入依赖；未改白名单外文件（本轮白名单 = `ui-shot.mjs` + 本档）。
> 一次性核对脚本写在 `%TEMP%`（`pix-r11-stab-verify.mjs`），跑完即删，仓库零残留。
> **结论：must-fix 1 已处置。** 连续两次离屏实跑 `UI_SHOT_EXIT=0`、`MANIFEST.failure === null`、**120 张截图 / 169 条测量**、既有 **112 张截图零缺失**、既有 **153 条 label 零缺失**、相位 4/5 **窗口内阅读区滚动计数两次均为 0**；`CHECK_EXIT=0`；烟测 `通过 26 / 失败 0`。

#### 一、改动（只动 `pix/scripts/ui-shot.mjs`，净 +155 行；行号为改后真实行号）

| # | 位置 | 改动 |
| --- | --- | --- |
| 1 | `:5158-5217` 新增 helper 3 个 | ① `installStageScrollWatch`（`:5169`）：`document` 级 **capture** `scroll` 监听，只统计 `target` 落在 `.reader-stage` 子树内的事件，累计 `count` 与最近时刻 `lastAt`（幂等，跨相位累积，与产品 `PdfSelectionQuickAsk.onStageScroll` 的 hide 判据同源）；② `stageScrollWatchProbe`（`:5185`）：一次读回 `scrollTop` + `count` + `lastAt`；③ `waitStageScrollQuiet`（`:5195`）：**有界静默**——连续 `quietMs=400` 无新增事件才 `ok:true`，上限 `timeoutMs=6000`，超时 `ok:false`（由调用方判前置失败，不静默降级） |
| 2 | `:5065-5093` 新增 helper `ensureQuickAskExcerptReady` | 入口前置加固：`有界静默 → 复核「浮层可见 actions 态（display ≠ none / feedbackClass=null / btnCount=2）+ 选区仍非折叠且锚点在 stage 且文本等于该页首个 span」`；不成立则**有界重取**（重建选区 `selectPageSpan(page)`，最多 3 次）后再静默复核；超限返回 `ok:false` + 全量 `trail`（不降级为跳过） |
| 3 | `:5095-5119` `excerptViaQuickAsk` 诊断增强 | 点击前在页内回传现场（`clicked/inDom/display/btnCount`），按钮缺失时抛 Node 侧可读错误「摘录按钮不可点击（入口前置被破坏）：{…}」，不再抛渲染层裸错误（`Script failed to execute`）；点击与等待语义（文件条数 +1、面板回位）逐字未变 |
| 4 | `:6363-6456` 相位 4（`spurious-selectionchange`） | 入口接入 `ensureQuickAskExcerptReady(2)` + 入口日志；观测窗在 **t0 / 派发时刻 / +600 ms 复采 / 到期复采** 四处采 `stageScroll`（`scrollTop`/`count`/`lastAt`）；新增 3 条**独立失败文案**前置判据 + 1 条 B4 独立前置；B1/B2/B3/B5 语义判据逐字未改 |
| 5 | `:6458-6532` 相位 5（`different-text-reset`） | 入口接入 `ensureQuickAskExcerptReady(3)` + 入口日志；新增 `t0P5` 与 `stageScroll` 三处采样；新增 3 条独立失败文案前置判据；C1–C4 语义判据逐字未改 |
| 6 | `data`（两条 record） | 新增 `stageScroll`（`t0`/`dispatch`/`after600ms`/`resample`/`windowCount`/`windowLastEventMs`/`sinceLastEventAtT0Ms`）与 `preQuiet`（`ok`/`attempts`/`quiet`/`trail`）；既有字段逐字未动 |

**冻结要求逐条落地**

| 要求 | 落地 |
| --- | --- |
| 1 计数器 + 有界静默（quietMs 400 / 上限 6000，超时判前置失败） | helper 3 个（`#1`）；超时路径 `ok:false` → 独立失败文案 |
| 2 三处采数（t0 / 派发 / 复采），窗口内计数增加 ⇒ 独立文案判红 | 相位 4 四处、相位 5 三处采样；失败文案逐字含「**环境噪声：窗口内发生阅读区滚动**」（并带次数、最近一次相对 t0 的时刻、两处 `scrollTop`） |
| 3 B4 独立前置（派发前与复采时刻都须为反馈态，否则空断言） | `:6446-6448` 新增前置判据，失败文案「B4 前置不成立（派发前与复采时刻均须为反馈态）：…」；B4 本体（`goneAt` 上下界）逐字未动 |
| 4 相位进入点（t0 之前）先做有界滚动静默 | 相位 4/5 均在 `selectPageSpan` 之后、`excerptViaQuickAsk` 之前执行；并把「t0 前 400 ms 内不得再有阅读区滚动」写为前置判据 |
| 5 只改 `ui-shot.mjs`（与本档） | `git diff --numstat`：`ui-shot.mjs` 942/6（改前 787/6，净 +155 行），`pix/src/**` 本轮零改动，`packages/**` 零 diff |

**语义判据零放松核对**：`git diff` 逐字核对确认 B1（`is-ok` + `已摘录 · 第 2 页` + `display !== "none"`）、B1b（`collapsed === false` / `anchorInStage === true` / `text === spanText2`）、B1c（`900 ≤ dispatchAtMs < 2100`）、B2/B3（派发后与 +600 ms 仍为反馈态且 `btnCount === 0`）、B4（`>= 1900` 且 `<= dispatchAtMs + 2200`）、B5（到期回落 `btnCount === 2` + 数据不变）、C1–C4 全部**未改一字**；新增的只有**前置读数**与**独立判红**两项。

#### 二、两次实跑（命令 + 原样结果；两次未并发，跑前 `tasklist | grep -ci electron` = 0）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-stab1" ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_EXIT=$?"
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-stab2" ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_EXIT=$?"
```

| 跑次 | 起止（本地） | `UI_SHOT_EXIT` | `MANIFEST.failure` | `generatedAt` | 截图 | 测量 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A（stab1） | 17:59:57 → 18:02:16 | **0** | `null` | `2026-09-16T10:02:16.251Z` | **120**（磁盘 120 = 清单 120） | **169** | 绿 |
| B（stab2） | 18:02:27 → 18:04:45 | **0** | `null` | `2026-09-16T10:04:45.339Z` | **120**（磁盘 120 = 清单 120） | **169** | 绿 |

零缺失核对（对基线 `pix-v05-r11-base`，独立脚本按 basename / label 集合复算）：两次均 `missingShots=[]`、`missingLabels=[]`、`labelCountDropped=[]`、`diskNotInManifest=[]`、`manifestNotOnDisk=[]`、带 `failures` 的 record = **0 条**、无 `99-failure-state.png`；新增 8 张仍全为 `r11-*`。

**相位读数（两次逐字）**

```text
跑 A（stab1）相位 4 spurious-selectionchange：
  waitMs=0 dispatchAtMs=929 feedbackGoneAtMs=2536
  before/afterDispatch/after600ms = {"display":"flex","feedbackClass":"quick-ask-feedback is-ok","feedbackText":"已摘录 · 第 2 页","btnCount":0}
  atExpiry = {"display":"flex","feedbackClass":null,"feedbackText":null,"btnCount":2}｜fileCount=2｜hashSame=true
  selectionBefore/After = {"text":"3. Ablation Study","collapsed":false,"anchorInStage":true}｜spanText2="3. Ablation Study"
  stageScroll = t0/dispatch/after600ms/resample 全为 {"scrollTop":852,"count":0,"lastAt":null}
  preQuiet = {"ok":true,"attempts":1,"quiet":{"quietMs":400,"timeoutMs":6000,"waitedMs":426,"absorbed":0,"lastAt":null}}
跑 A 相位 5 different-text-reset：
  feedbackBefore = is-ok + 已摘录 · 第 3 页｜spanText2="3. Ablation Study" ≠ spanText3="4. Conclusion"
  afterDifferentText / afterDifferentTextRecheck = {"display":"flex","feedbackClass":null,"feedbackText":null,"btnCount":2}
  selectionAfter = {"text":"3. Ablation Study","collapsed":false,"anchorInStage":true}｜fileCount=3｜hashSame=true
  stageScroll = t0/dispatch/resample 全为 {"scrollTop":1710,"count":1,"lastAt":1789552923638}
  preQuiet = {"ok":true,"attempts":2, trail[1]={"state":{"display":"none","btnCount":1},"ready":false,"quiet":{"waitedMs":486,"absorbed":1}},
              trail[2]={"state":{"display":"flex","btnCount":2},"ready":true,"quiet":{"waitedMs":417,"absorbed":0}}}

跑 B（stab2）相位 4：
  waitMs=1 dispatchAtMs=969 feedbackGoneAtMs=2516｜before/after600 同跑 A（is-ok / btnCount 0）｜atExpiry 同上
  stageScroll 全为 {"scrollTop":852,"count":0,"lastAt":null}
  preQuiet = {"ok":true,"attempts":1,"quiet":{"waitedMs":403,"absorbed":0,"lastAt":null}}
跑 B 相位 5：
  afterDifferentText / Recheck = {"display":"flex","feedbackClass":null,"btnCount":2}｜fileCount=3｜hashSame=true
  stageScroll 全为 {"scrollTop":1710,"count":1,"lastAt":1789553073240}
  preQuiet = {"ok":true,"attempts":1,"quiet":{"waitedMs":416,"absorbed":0,"lastAt":1789553073240}}
```

#### 三、「窗口内滚动计数恒为 0」实测值（本次修复的核心判据）

| 跑次 | 相位 | t0 计数 | 派发计数 | +600 ms 计数 | 复采计数 | **窗口内新增（windowCount）** | 距最近一次滚动（t0） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | `spurious-selectionchange` | 0 | 0 | 0 | 0 | **0** | 无事件（`null`） |
| A | `different-text-reset` | 1 | 1 | — | 1 | **0** | 914 ms（事件在开窗前） |
| B | `spurious-selectionchange` | 0 | 0 | 0 | 0 | **0** | 无事件（`null`） |
| B | `different-text-reset` | 1 | 1 | — | 1 | **0** | 416 ms（事件在开窗前） |

⇒ 两次实跑、两个相位共 **4 个观测窗**的窗口内计数全部为 0；相位 5 的 `count=1` 是同一次开窗前的阅读区滚动（`sinceLastEventAtT0Ms` 914 / 416 ms ≥ 静默窗 400 ms），已由入口静默吸收，未污染观测窗。

#### 四、入口前置的实测行为（修复生效证据）

- 修复前的实跑（工作树为改前状态，日志/产物已被后续实跑覆盖）：17:56:01 → 17:58:05，`UI_SHOT_EXIT=1`，现场为 `[renderer:3] Uncaught Error: excerpt button not found` + `场景失败：Script failed to execute…` + `99-failure-state.png` —— 即「相位 4 点击前浮层已被一条迟到的阅读区滚动隐藏（hide 路径，`selectionPage` 被清 ⇒ `canExcerpt=false` ⇒ 摘录按钮不存在）」。该失败在观测窗**之前**，属入口前置破坏，与 B/C 语义无关。
- 修复后跑 A 相位 5 的入口前置**实际触发了一次重取**：attempt 1 静默窗内 `absorbed=1`、复核读到 `{"display":"none","btnCount":1}`（`ready=false`）⇒ 重建选区并再次静默；attempt 2 读到 `{"display":"flex","btnCount":2}` ⇒ `ready=true`，随后 C1–C4 全绿。同一失败模式在跑 B 未出现（attempts=1）。⇒ 入口噪声不再表现为红/裸错误，而是被「静默 + 复核 + 有界重取」吸收并留档。
- `waitStageScrollQuiet` 的静默读数：4 次调用实测 `waitedMs` 403–486 ms（= `quietMs` 400 + 轮询粒度 60 ms 内），`absorbed` ∈ {0, 1}，超时路径（`timeoutMs=6000`）两次实跑均未触发。

#### 五、唯一工程门与烟测（均为改后状态）

```text
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"  ⇒ CHECK_EXIT=0（2026-09-16，改动后）
node pix/scripts/smoke-notes.mjs; echo "SMOKE_NOTES_EXIT=$?"                            ⇒ 末行「通过 26 / 失败 0」；SMOKE_NOTES_EXIT=0（[通过] 26 行 / [失败] 0 行）
node --check pix/scripts/ui-shot.mjs                                                    ⇒ SYNTAX_OK
sha256  pix/scripts/ui-shot.mjs  17c77b42d550a97f0ff671fed7cb6afd1092a8060c2a6f69ec8c47a8666c3e2d（= 两次实跑所测状态；跑 A/B 之间无任何代码改动）
sha256  PdfSelectionQuickAsk.vue bff06eb2ddfb27b9cdf3a235e09af87b870320a0c6556efcbf2838f2dc1131e7（本轮零改动）
git status --porcelain ⇒ 10 项（5 改 + 5 未跟踪，与修复轮.4 相同，无白名单外条目）
```

#### 六、偏差 / 未验证事项

1. **超出字面要求的两处加固（登记）**：① `ensureQuickAskExcerptReady` 的「静默 + 可摘录态复核 + 有界重取（≤3 次）」；② `excerptViaQuickAsk` 的按钮缺失现场回传。两者都只作用于**观测窗之前**的前置，不参与 B/C 判据，也不改变任何既有语义判据的字面；依据 = must-fix 1 的处置建议「或按设计档 §追加-3 第 6 行的同类处方做有界重取」。
2. **窗口内滚动仍按冻结要求判红**（不重取、不降级）：若窗口内计数增加，抛出的是独立文案「环境噪声：窗口内发生阅读区滚动（…）」，与 B/C 的产品行为判据在同一条 record 的 `failures` 中并列；本次两次实跑该分支未触发（windowCount 恒为 0）。
3. **未运行** `npm run build` / `npm test` / `npm run package` / `npm run dev`（超出本步命令面）。
4. **红现场的滚动源仍未定位到具体元素**（`.pdf-scroll` / `.map-tree` / `.reader-content` / document 级）：本步新增的读数可判别「发生了滚动、时刻、`scrollTop`」，但未记录 `event.target` 的类名（冻结要求未要求）；与 `R11-dev.md` §8.3 同口径，仍为未销账项。
5. **相位 4 的时序余量**：本次 `dispatchAtMs` 929 / 969，`feedbackGoneAtMs` 2536 / 2516（上界 `dispatchAtMs + 2200` = 3129 / 3169），与修复轮.4 同级；入口前置新增的静默等待（约 0.4–0.5 s）位于 `t0` 之前，不占用 2500 ms 反馈窗口（实测 `feedbackGoneAtMs` 未下移）。

**修复轮.5 终值：`CHECK_EXIT=0` / 两次离屏 `UI_SHOT_EXIT=0`（120 张截图 / 169 条测量 / `failure===null` / 既有 112 张与 153 条 label 零缺失）/ 窗口内阅读区滚动计数 4/4 观测窗 = 0 / 烟测 `SMOKE_NOTES_EXIT=0`（26 通过 0 失败）/ `pix/src/**` 零改动。**
