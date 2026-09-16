# PiX-Read R12 开发档 · A 面（契约面：N77 / N79-3 / N80 / N81-1）

> 上游：`docs/pm/R12-req.md`（需求 N77–N81 + §0 定稿修订 8 条）、`docs/pm/R12-design.md`（设计档 + 定稿修订 6 条）、`docs/pm/R12-review.md`、`docs/pm/R11-dev.md`（范式与基线读数）。
> 本档**只记录 A 面**（契约面）的交付：`pix/src/renderer/utils/outline-notes.ts`、`pix/src/renderer/utils/reading-context.ts`、`pix/scripts/smoke-view.mjs`（新建）、`pix/package.json`、本档。
> B 面（`ChatPanel.vue` / `PdfViewer.vue` / `ui-shot.mjs`）不在本档、也不在本轮 A 面改动内；按派单口径这三个文件由 B 面负责。
> 本档只记录**真实文件内容与真实命令输出**；所有命令于 2026-09-16 在 `E:/develop/PiX-Read`（Windows + git bash）实跑，无一条手工构造。全程未运行 git 写命令、未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`，未改 `packages/**`、未增删依赖、未改 `package-lock.json`。
> 结论：**`npm run check` 0 error；`npm run smoke:view` 连续两次 29/29、退出码 0；`npm run smoke:notes` 26/26、退出码 0；两项失败路径注入均按预期变红并已按 sha256 证明脚本零残留；白名单外零改动。**
> **2 条偏差（D1：`ReadingSendContext.outline` 本步按可选声明；D2：烟测编译面补一份只写 `%TEMP%` 的 ambient 声明）与 3 条登记项（R1–R3）需负责人确认**；其余逐条按设计档落地。

---

## 1. 交付摘要（数字先给）

| 项 | 数值 | 来源 |
| --- | --- | --- |
| `cd pix && npm run check`（动工前） | `CHECK_EXIT=0` | §4.1 |
| `cd pix && npm run check`（A 面落地后） | `CHECK_EXIT=0` | §4.3 |
| `smoke:view` 连续两次 | `通过 29 / 失败 0`、`SMOKE_VIEW_EXIT=0`（两次一致） | §4.4 |
| `smoke:notes` 回归 | `通过 26 / 失败 0`、`SMOKE_NOTES_EXIT=0` | §4.4 |
| 失败路径抽样 | 注入 ①（TSC 入口缺失）`INJECT1_EXIT=1` 且**不进入断言**；注入 ②（手写期望改错）`通过 28 / 失败 1` + `INJECT2_EXIT=1` | §4.5 |
| 抽样还原 | 脚本 sha256 三点一致（备份 = 两次还原后 = `c9d18797…`）⇒ 零残留；真实证据为哈希（`git diff --exit-code` 对未跟踪文件是空判据，见 R2） | §4.5 |
| 基线交叉核对（R11 交付目录） | `{"shots":120,"failure":null,"measurements":169,"labels":37}`（与设计档 §5.1 冻结读数一致） | §2 |
| `%TEMP%` 残留 | `ls -d "$TEMP"/pix-smoke-view-*` / `pix-smoke-notes-*` 均无输出（`EXIT=2`，无匹配） | §4.7 |
| 白名单外改动 | 0（`git status --short` 只列白名单文件 + 既有未跟踪文档） | §9 |

改动文件（4 个已修改/新建源码 + 1 个新建文档，全部在白名单内）：

| 文件 | 动作 | 规模（`git diff --stat` 实测） | 对应需求 |
| --- | --- | --- | --- |
| `pix/src/renderer/utils/outline-notes.ts` | 修改 | `64 ++++++`（纯新增，0 删除） | N77-1 / N77-2 / N77-3、N79-3、N80-2 的文本渲染 |
| `pix/src/renderer/utils/reading-context.ts` | 修改 | `10 +++++-`（1 处既有 import 行改写 + 9 行新增） | N80-1 / N80-2 / N80-3 |
| `pix/scripts/smoke-view.mjs` | **新建** | 492 行、4 组 29 条断言 | N81-1 |
| `pix/package.json` | 修改 | `1 +`（`scripts.smoke:view`） | N81-1 |
| `docs/pm/R12-dev.md` | **新建** | 本档 | —— |

---

## 2. 基线（动工前读数，全部为本次实跑）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"     # ⇒ 0
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes | tail -1            # ⇒ 通过 26 / 失败 0
node -e "…读取 C:/Users/86157/AppData/Local/Temp/pix-v05-r11-lead/shots/{MANIFEST,MEASUREMENTS}.json…"
```

```text
CHECK_EXIT=0
通过 26 / 失败 0
{"shots":120,"failure":null,"measurements":169,"labels":37}
```

⇒ 与设计档 §0.1 / §5.1 步骤 0b 的冻结读数**逐字一致**（120 张 / 169 条 / 37 种 label / `failure === null`）；A 面未跑离屏（离屏为 B 面验收面，且 A 面不得改 `ui-shot.mjs`），该基线在本档只作交叉核对。

---

## 3. 改动清单（文件 + 具体改动）

### 3.1 `pix/src/renderer/utils/outline-notes.ts`（+64 / −0，纯新增）

| 位置（改后行号） | 内容 |
| --- | --- |
| `:9-:10` | 文件头注释**追加** 2 行：「章节命中（resolveCurrentChapter）与上一节 / 下一节导航（resolveChapterNav）同样来自本文件的同一份 ranges（buildChapterRanges 的产出），组件层只读、不写第二份区间比较。」既有段落逐字未动 |
| `:126-:128` | 新块横幅注释（章节命中与导航，候选与顺序来源 = 本文件同一份 ranges 的 `Map` 插入序） |
| `:131-:133` | `function inlineTitle(value: string): string`（私有：`\s+` → 单空格 + `trim`，与 `reading-context.inlineNoteText` 同口径） |
| `:136-:138` | `export function formatChapterHeading(range: ChapterRange): string` ⇒ `` `${inlineTitle(range.title)} · 第 ${range.label} 页` `` |
| `:140-:159` | `export function resolveCurrentChapter(ranges: Map<string, ChapterRange>, page: number, pageCount: number): ChapterRange \| null`（定义行 `:145`） |
| `:161-:186` | `export function resolveChapterNav(ranges: Map<string, ChapterRange>, page: number, pageCount: number): { prev: ChapterRange \| null; next: ChapterRange \| null }`（定义行 `:166`） |

三个签名与设计档 §1.1.1 逐字相同；参考实现按设计档 §1.1.3 落地，三处比较符方向为 `hit` 用 `>`、`prev` 用 `>=`、`next` 用 `<`（注释已在代码内逐条标注）。

零 diff（实测：`git diff -- pix/src/renderer/utils/outline-notes.ts | grep -E "^[-]" | grep -v "^---"` ⇒ 无输出）：`collectPreorder` / `buildChapterRanges` / `countNotesByChapter`、既有 re-export（`matchesChapterFilter` / `rangeContains`）与两个 interface。无新 import、无 `any`、无内联动态 import（实测：`grep -n "\bany\b\|await import\|import(" …` ⇒ 无输出）。

`grep -c "^export function"` ⇒ **5**（设计档 §1.1.6 #4 的期望值：改前 2 ⇒ 改后 5）；`grep -n "^export"` 的 5 条既有条目内容逐字不变（因头部追加 2 行，行号 +2 ⇒ `:16` / `:18` / `:26` / `:52` / `:86`，见登记项 R1）。

### 3.2 `pix/src/renderer/utils/reading-context.ts`（+10 / −1）

```diff
-import type { LibraryFileResult, ReaderNote } from "@shared/types";
+import type { LibraryFileResult, ReaderNote, ReaderOutlineNode } from "@shared/types";
+import { buildChapterRanges, formatChapterHeading, resolveCurrentChapter } from "./outline-notes";
 import { sortNotesForContext } from "./notes-path";
@@ ReadingSendContext（notes 之后）
+  /**
+   * 书签树快照（发送瞬间的派生结果）。定稿口径的必填字段；本步 ChatPanel.vue（B 面）尚未接线
+   * ⇒ 暂时可选（`?? []` 单点降级），B 面补 `outline: readerStore.outline` 后恢复必填（见 R12-dev.md）。
+   */
+  outline?: ReaderOutlineNode[];
@@ buildReadingUserMessage（pageCount 行之后、selectedText 之前）
+  // 命中可解析 ⇒ pageCount 之后、selectedText 之前插入 section 行；不可解析 ⇒ 一行都不 push（逐字节等于旧格式）
+  const chapter = resolveCurrentChapter(buildChapterRanges(ctx.outline ?? [], ctx.pageCount), ctx.page, ctx.pageCount);
+  if (chapter) lines.push(`section: ${formatChapterHeading(chapter)}`);
```

行为（与设计档 §1.4.2 / §1.4.3 同口径）：

- 命中可解析 ⇒ 载荷第 5 行固定为 `section: <标题> · 第 <label> 页`（`<reading_context>` / `path:` / `page:` / `pageCount:` 恒在其前）。
- 不可解析（六种情形）⇒ **一行都不 push**（无 `skip`、无空串、无占位），整条消息逐字节等于旧格式 —— 由 `section-format` #1 与 #2 逐字节断言双向钉住。
- 取值与 chip 文本共用同一份 `formatChapterHeading` ⇒ 两处逐字节相同（B 面 chip 落地后由 `r12-1` / `r12-4` 交叉覆盖）。

零 diff（实测）：既有 7 行 push 的顺序与字面、`selectNotesForContext` 的排序与两级裁剪、`renderNoteEntry` 模板、`MAX_CONTEXT_NOTES` / `MAX_CONTEXT_NOTES_CHARS`、`!ctx.filePath` 早退、Library 失败面全部未动；`git diff … reading-context.ts | grep -E "^[-]"` 的删除行**恰 1 条**（既有 `import type` 行改写，设计档 §1.4.6 #1 允许）。

### 3.3 `pix/scripts/smoke-view.mjs`（新建，492 行）

| 项 | 落地 |
| --- | --- |
| 入口 | `cd pix && npm run smoke:view` 与 `cd pix && node scripts/smoke-view.mjs` 等价 |
| 顶层 import | 只有 `node:child_process`（`spawnSync`）/ `node:fs`（`mkdirSync` / `readdirSync` / `rmSync` / `writeFileSync`）/ `node:module`（`createRequire`）/ `node:os`（`tmpdir`）/ `node:path`（`dirname` / `join` / `relative` / `resolve`）/ `node:url`（`fileURLToPath`）；无 electron、无渲染层组件、无 `packages/**` |
| 常量 | `PIX_DIR` / `REPO_DIR` / `TSC_JS` / `TMP = <tmp>/pix-smoke-view-<Date.now()>` / `OUT_DIR` / `TSCONFIG` |
| 编译面 | 仓库内 `typescript/lib/tsc.js` 编译**仓库内**三个源文件（不复制源码）到 `%TEMP%`；`module: commonjs` / `target: ES2022` / `rootDir: <repo>/pix/src` / `strict` / `baseUrl: <repo>/pix` + `paths: {"@shared/*": ["src/shared/*"]}`（三个文件都 `import type … from "@shared/types"`）；`files` = `outline-notes.ts` / `notes-path.ts` / `reading-context.ts`（+ 一份只写 `%TEMP%` 的 ambient 声明，见 D2） |
| 产物校验 | 必需 `out/renderer/utils/{outline-notes,notes-path,reading-context}.js`；允许附带 `out/shared/types.js`；缺失、多出或 `tsc` 退出码 ≠ 0 ⇒ 打印实际目录树并**直接退出 1，不进入断言** |
| 夹具 | `SAMPLE_LIKE`（3 页 + 无页码节点 `Appendix A` + 逆序书签 `Appendix B`（page 2））/ `CHAIN`（start 1/3/5）/ `SINGLE`（单节 start 3）/ `EMPTY`（全 `page === null`）+ `section-format` 的 `FOLDED`（`SAMPLE_LIKE` 深拷贝后把 `root/1` 标题改成 `"2. Method\n  Overview"`） |
| 断言 | 4 组 29 条（§5 逐条列出），期望值**手写**，无一条由被测函数生成 |
| 输出协议 | 组横幅 `== 组 <名> ==`；每条 `[通过] <组> #<序号> <说明>` / `[失败] <组> #<序号> <说明>：<实际值>`；末行逐字 `通过 {passed} / 失败 {failed}`；退出码 0/1 |
| 自清理 | `finally` 内 `rmSync(TMP, { recursive: true, force: true })`，失败只打印 `[警告] 临时目录未清理：<path>`、不改退出码；只读仓库源文件、只写 `os.tmpdir()` |

### 3.4 `pix/package.json`（+1 行）

```diff
     "smoke:notes": "node scripts/smoke-notes.mjs",
+    "smoke:view": "node scripts/smoke-view.mjs",
```

其余字段（含 `check` / `build` / `dependencies` / `devDependencies` / `build`）逐字零改动（`git diff -- pix/package.json` 只有上述一处）；`package-lock.json` 零改动（§4.6）。

### 3.5 `docs/pm/R12-dev.md`（本档）

---

## 4. 真实命令与关键输出

### 4.1 动工前唯一工程门

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
```

```text
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0
```

### 4.2 D1 的现场证据：定稿「必填」口径与「A 面不得接线」不可兼得（实测）

按设计档 §1.4.1 的逐字字段（`outline: ReaderOutlineNode[]`，无默认值）落地并**不动 `ChatPanel.vue`**（该文件不在 A 面白名单）时：

```text
src/renderer/components/workspace/ChatPanel.vue(377,85): error TS2345: Argument of type '{ filePath: string | null; page: number; pageCount: number; selectedText: string; notes: ReaderNote[]; }' is not assignable to parameter of type 'ReadingSendContext'.
  Property 'outline' is missing in type '{ filePath: string | null; page: number; pageCount: number; selectedText: string; notes: ReaderNote[]; }' but required in type 'ReadingSendContext'.
CHECK_EXIT=2
```

⇒ 该错误**只能**由 `ChatPanel.vue:377` 补一行 `outline: readerStore.outline` 消解，而该文件由 B 面负责。处置见 §7 D1（本步按「既有调用点保持类型可编译 + `npm run check` 0 error」落地，B 面接线后一行恢复必填）。

### 4.3 唯一工程门（A 面落地后）

```text
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0
```

### 4.4 烟测（连续两次 + 主进程数据面回归）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:view; echo "SMOKE_VIEW_EXIT=$?"   # ×2
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes; echo "SMOKE_NOTES_EXIT=$?"
```

```text
[smoke-view] 临时目录：C:\Users\86157\AppData\Local\Temp\pix-smoke-view-1789557852848
[smoke-view] typescript：E:\develop\PiX-Read\pix\node_modules\typescript\lib\tsc.js
== 组 section-hit ==      [通过] #1..#8
== 组 section-null ==     [通过] #1..#8
== 组 section-nav ==      [通过] #1..#8
== 组 section-format ==   [通过] #1..#5
通过 29 / 失败 0
SMOKE_VIEW_EXIT=0        （连续两次一致）

== 组 undo-roundtrip / undo-failures / undo-slot-lifecycle / export-and-empty ==
通过 26 / 失败 0
SMOKE_NOTES_EXIT=0
```

### 4.5 失败路径抽样（设计档 §1.5.4 最后一行：两项注入实测 + 还原）

只临时改 `pix/scripts/smoke-view.mjs` 本身；改动前先把原文件复制到 `$TEMP/r12-a-backup/` 并记 sha256，注入跑完后按字节还原。

```text
# 还原前的脚本 sha256（= 备份 = 两次还原后）
c9d18797bd4041e49dd4a4630e9234d4c496f6e44acd5bd901254a750bdc0c86  pix/scripts/smoke-view.mjs
```

**注入 ①：`TSC_JS` 指向不存在路径**

```text
[smoke-view] typescript：E:\develop\PiX-Read\pix\node_modules\typescript\lib\tsc-missing.js
[smoke-view] typescript 编译失败（status=1），不进入断言
Error: Cannot find module 'E:\develop\PiX-Read\pix\node_modules\typescript\lib\tsc-missing.js' … code: 'MODULE_NOT_FOUND'
通过 0 / 失败 0        （`[通过]` / `[失败]` 行数均为 0 ⇒ 确未进入断言）
INJECT1_EXIT=1
```

**注入 ②：把 `section-hit` #2 的手写期望改成 `2.1 Sparse mask budget`**

```text
[失败] section-hit #2 SAMPLE_LIKE 第 2 页 ⇒ 2. Method Overview / label 2（同 start 取预序最早，不是 2.1、不是 Appendix B）：{"key":"root/1","title":"2. Method Overview","start":2,"end":2,"label":"2"}
通过 28 / 失败 1       （其余 28 条照常执行，失败项打印实际值）
INJECT2_EXIT=1
```

**还原证据**

```text
HASH_IDENTICAL_1=yes   # 注入 ① 还原后 sha256 与备份一致
HASH_IDENTICAL_2=yes   # 注入 ② 还原后 sha256 与备份一致
git diff --exit-code -- pix/scripts/smoke-view.mjs   ⇒ 0（两个注入点各自还原后）
node pix/scripts/smoke-view.mjs | tail -1 ⇒ 通过 29 / 失败 0（还原后复跑）
```

⚠️ 登记项 R2：`pix/scripts/smoke-view.mjs` 是**未跟踪新文件**，`git diff --exit-code` 对未跟踪路径恒为空判据（无输出、退出码 0，**不因内容变化而变红**）⇒ 本档以 sha256 三次一致作为「零残留」的真实证据，不要把该命令当作有效判据。

### 4.6 走查（A 面适用条目）

```bash
cd E:/develop/PiX-Read
grep -c "^export function" pix/src/renderer/utils/outline-notes.ts            # ⇒ 5（改前 2）
git diff -- pix/src/renderer/utils/outline-notes.ts | grep -E "^[-]" | grep -v "^---"   # ⇒ 无输出（纯新增）
git diff -- pix/src/renderer/utils/reading-context.ts | grep -E "^[-]" | grep -v "^---" # ⇒ 恰 1 条（既有 import type 行改写）
grep -n "\bany\b\|await import\|import(" pix/src/renderer/utils/{outline-notes,reading-context}.ts   # ⇒ 无输出
git diff -- package-lock.json packages README.md pix/tsconfig.json pix/tsconfig.main.json \
  pix/tsconfig.preload.json pix/src/renderer/stores pix/src/shared/types.ts pix/src/main   # ⇒ 全部为空
git diff --stat -- pix/src/renderer/utils/outline-notes.ts pix/src/renderer/utils/reading-context.ts pix/package.json
# ⇒ 3 files changed, 75 insertions(+), 1 deletion(-)
```

B 面条目（§1.1.6 #2/#3、§1.2.5、§1.3.5、§5.4 #4–#9/#12/#13）不属本档，A 面未执行、也未代 B 面执行。

### 4.7 零残留

```bash
ls -d "$TEMP"/pix-smoke-view-* 2>/dev/null ; echo "EXIT=$?"     # ⇒ 无输出、EXIT=2
ls -d "$TEMP"/pix-smoke-notes-* 2>/dev/null ; echo "EXIT=$?"    # ⇒ 无输出、EXIT=2
cd E:/develop/PiX-Read && git status --short                     # ⇒ 只列白名单 + 既有未跟踪文档（§9）
```

---

## 5. 断言清单（4 组 29 条，逐条为本次实跑的 `[通过]` 文本）

### 组 `section-hit`（8 条）

| # | 断言（实测全绿） |
| --- | --- |
| 1 | `SAMPLE_LIKE` 第 1 页 ⇒ key/title/start/end/label 逐字段为 `1. Abstract`（`root/0` / 1 / 1 / `1`） |
| 2 | `SAMPLE_LIKE` 第 2 页 ⇒ `2. Method Overview` / label `2`（同 `start` 取预序最早，不是 `2.1`、不是 `Appendix B`） |
| 3 | `SAMPLE_LIKE` 第 3 页 ⇒ `2.2 Positional prior` / label `3`（不是 `3. Ablation Study`、不是 `Appendix A.1`） |
| 4 | 全页不变量（1..3 页逐页）：命中非 `null` 且 `start ≤ page ≤ end` |
| 5 | 「`start` 最大且 ≤ page」：逐页独立复算候选集，命中的 `start` = 集合最大值且命中项属于该集合 |
| 6 | `CHAIN`：第 2 页 ⇒ `start` 1；第 3 页 ⇒ `start` 3（边界含等于）；第 5 页 ⇒ `start` 5 |
| 7 | 逆序书签不劫持：第 3 页命中 `key !== "root/2/1"`（`Appendix B`，`start 2 < 3`）且 `title !== "Appendix A.1"` |
| 8 | 同源：命中项 `=== ranges.get(hit.key)` 且 `ranges.size === 7`（= 有页码节点数，手写字面量） |

### 组 `section-null`（8 条）

| # | 断言 |
| --- | --- |
| 1 | `outline = []`（空数组）⇒ `null` |
| 2 | `EMPTY`（两个节点全 `page === null` ⇒ `ranges.size === 0`）⇒ `null` |
| 3 | 有页码节点但 `pageCount = 0` ⇒ `null` |
| 4 | `page = 0` ⇒ `null` |
| 5 | `page = -3` ⇒ `null` |
| 6 | `page = pageCount + 1`（4，越界）⇒ `null` |
| 7 | `page = 1.5`（非整数，不四舍五入）⇒ `null` |
| 8 | `SINGLE` 首节点 `page = 3` 且 `page = 1`（早于第一节）⇒ `null` 且 `didNotThrow === true` |

### 组 `section-nav`（8 条）

| # | 断言 |
| --- | --- |
| 1 | `SAMPLE_LIKE` 第 1 页 ⇒ `prev === null`、`next = 2. Method Overview` |
| 2 | 第 2 页 ⇒ `prev = 1. Abstract`（`end 1 < 2`）、`next = 2.2 Positional prior`（`start 3 > 2`） |
| 3 | 第 3 页 ⇒ `prev = 2.1 Sparse mask budget`（`end` 并列取预序最晚者）、`next === null` |
| 4 | 不变量（1..3 页逐页）：`prev === null \|\| prev.end < page`；`next === null \|\| next.start > page` |
| 5 | `CHAIN` 第 3 页 ⇒ `prev.start = 1`、`next.start = 5`（相邻且页码单调） |
| 6 | `SINGLE` 第 3 页（节内）⇒ 两者皆 `null`（单节禁用） |
| 7 | `SINGLE` 第 1 页（早于该节）⇒ `prev === null`、`next.start = 3`（确定目标） |
| 8 | 域外（`pageCount = 0` / `page = 4` / `page = 1.5`）⇒ 两者皆 `null`（与命中函数同一守卫） |

### 组 `section-format`（5 条）

| # | 断言 |
| --- | --- |
| 1 | 无 outline ⇒ 载荷逐字节等于旧格式 `` `<reading_context>\npath: C:/ws/sample-paper.pdf\npage: 2\npageCount: 3\n</reading_context>\n\nQ` `` |
| 2 | `SAMPLE_LIKE` 第 2 页 ⇒ 逐字节等于「旧格式在 `pageCount: 3` 之后插入 `section: 2. Method Overview · 第 2 页\n`」 |
| 3 | 行序：三个 `indexOf` 均 ≥ 0 且 `pageCount: 3 < section: < selectedText:`（同时传 `selectedText: "选中"` 与一条备注） |
| 4 | 标题空白折叠：`"2. Method\n  Overview"` 被命中 ⇒ `2. Method Overview · 第 2 页`，且 `section:` 整行不含换行 |
| 5 | `filePath: null` ⇒ 返回 `userText` 原样（既有早退语义） |

---

## 6. 接口冻结（A 提供、B 消费）

| 项 | 冻结值（本步真实落地） |
| --- | --- |
| 签名 1 | `export function resolveCurrentChapter(ranges: Map<string, ChapterRange>, page: number, pageCount: number): ChapterRange \| null` |
| 签名 2 | `export function resolveChapterNav(ranges: Map<string, ChapterRange>, page: number, pageCount: number): { prev: ChapterRange \| null; next: ChapterRange \| null }` |
| 签名 3 | `export function formatChapterHeading(range: ChapterRange): string`（= `` `${空白折叠 + trim 后的 title} · 第 ${label} 页` ``，chip 文本 / chip `title` / `section:` 行三处共用） |
| 契约字段 | `ReadingSendContext.outline`（本步为 `outline?: ReaderOutlineNode[]`，见 D1；B 面接线后恢复必填） |
| 顺序来源 | `ranges.values()` 的 `Map` 插入序（= `buildChapterRanges` 的预序），A 面未另建排序 / 过滤表 |
| 分组口径 | 命中 = `start ≤ page` 且 `start` 最大，同 `start` 取预序最早；上一节 = `end < page` 且 `end` 最大，同 `end` 取预序最晚；下一节 = `start > page` 且 `start` 最小，同 `start` 取预序最早 |

B 面消费点提示（不属本档改动）：`ChatPanel.vue` 需补 `outline: readerStore.outline`；`PdfViewer.vue` 的三个 computed 与 `jumpToChapter` 直接消费本文件导出，**组件内不得再写第二份区间比较**。

---

## 7. 偏差表（逐条登记 + 证据 + 处置）

### D1（需负责人裁决）：`ReadingSendContext.outline` 本步按**可选**声明

| 项 | 内容 |
| --- | --- |
| 定稿口径 | 需求 §0.2 第 3 条 / 设计档 §1.4.1：`outline` 为**第 6 个必填字段**，`不给默认值（漏传即编译期报错）` |
| 本轮冲突 | 派单口径把 `ChatPanel.vue` 划给 B 面并禁止 A 面改动；而必填字段会让 `ChatPanel.vue:377` 立即编译失败（§4.2 实测 `CHECK_EXIT=2` + `TS2345`），与「既有调用点保持类型可编译」「`npm run check` 必须 0 error」互斥 |
| 本步处置 | 按派单的分工声明（设计档 §7.1 第 3 条「A 先落：`npm run check` 绿 + `smoke:view` 连续两次绿」）优先保证**落地即绿**：字段声明为 `outline?: ReaderOutlineNode[]`，`buildReadingUserMessage` 内**单点**降级 `ctx.outline ?? []`；字段名 / 类型 / 插入位置与定稿一致 |
| 代价 | 编译期护栏暂时失效（漏传不再报错），改由运行期断言兜底：`section-format` #1–#3 与 B 面 `r12-4` 的逐字节断言都会在「未接线」时判红 |
| 恢复方式（一行） | `ChatPanel.vue` 接线落地后，把 `outline?:` 改回 `outline:` 并删除 `?? []`（同时删掉该字段上方那 4 行偏差注释块）；A 面文件的一处改动即可，无其它连带 |
| 证据 | §4.2 的 `TS2345` 实测；`section-format` #1–#5 当前全绿（§4.4） |

### D2（需负责人确认）：烟测编译面补一份只写 `%TEMP%` 的 ambient 声明

| 项 | 内容 |
| --- | --- |
| 设计档 §1.5.1 口径 | `files` 恰为 `outline-notes.ts` / `notes-path.ts` / `reading-context.ts`；允许附带产物只有 `out/shared/types.js` |
| 实测障碍 | `reading-context.ts` 的 `hasLibraryReadApi` 读全局 `window.pixApi`，该声明在 `pix/src/renderer/types/ipc.ts`（`import type { PixApi } from "../../main/preload"`）。把该文件加入编译面会沿类型依赖牵入 `src/main/preload.ts` / `pix-paths.ts` 等**主进程模块图**，产物集合与设计档表不符（且引入 electron 类型面） |
| 实际证据 | 只按设计档 `files` 编译 ⇒ `src/renderer/utils/reading-context.ts(155,57): error TS2339: Property 'pixApi' does not exist on type 'Window & typeof globalThis'.`（行号为实验当时读数，该行现位于 `:153`：`return typeof window !== "undefined" && typeof window.pixApi?.libraryReadFile === "function";`），脚本按设计正确判失败并退出 1（不进入断言） |
| 本步处置 | 在 `%TEMP%/pix-smoke-view-<ts>/window-global.d.ts` 写入**最小 ambient 声明**（`interface Window { pixApi?: { libraryReadFile?: (...args: unknown[]) => Promise<unknown> } }`）并加入 `files`；该文件只存在于临时目录、随 `finally` 一并清理，**仓库零新增文件、三个源文件仍原样编译**；被测纯函数不经过该声明覆盖的分支 |
| 风险 | 该声明若与 `renderer/types/ipc.ts` 的真实类型长期漂移，可能掩盖 `pixApi` 面变化；本轮被测面为纯函数（`resolve*` / `formatChapterHeading` / `buildReadingUserMessage`），不受影响 |

### R1（登记项）：`outline-notes.ts` 既有 `^export` 行号整体 +2

设计档把既有 `^export` 行读作 `:14 / :16 / :24 / :50 / :84`（改动前读数），并要求「内容逐字不变」。本步按设计档 §4 第 1 行「文件头注释补一句」在头部**追加 2 行**，故既有条目移到 `:16 / :18 / :26 / :52 / :86`：内容逐字一致，行号整体 +2（若负责人要求行号也不动，需要把头部说明挪到文件尾或并入既有段落，属文档级取舍）。

### R2（登记项）：`git diff --exit-code -- pix/scripts/smoke-view.mjs` 对未跟踪文件是空判据

设计档 §1.5.4 用该命令判「失败路径抽样后零残留」。本步实测：该文件为 `?? ` 未跟踪新文件 ⇒ 命令恒输出为空、退出码 0，**改与不改都绿**。故本档以 sha256（备份 / 两次还原三点一致）作为真实证据（§4.5），并建议 B 面/负责人复核同类「未跟踪文件」判据时改用哈希或 `git status --porcelain` 比对。

### R3（登记项）：`reading-context.ts` 的 diff 行数高于设计档 §1.4.6 #1 的行预算

设计档给的是「字段 + 注释 +2 行 / import 净 +1 行 / builder +3 行」（约 +7），实际为 `+10 / −1`：净多出的 3 行是 D1 的偏差注释块（4 行注释替代定稿的 1 行说明）。行为面与设计档一致，差异只在注释体积。

---

## 8. 未验证事项 / 未决项（逐条给原因与归属）

| # | 未验证项 | 原因 / 归属 |
| --- | --- | --- |
| 1 | 离屏取证（`ui-shot.mjs` 的 `r12-1`…`r12-4`、7 张截图、零缺失比对 127/185/41） | A 面不得改 `ui-shot.mjs`、B 面尚未落地；由 B 面验收，A 面已把载荷逐字节断言前移到 `section-format`（#1–#3）以降低 B 面红/绿判读成本 |
| 2 | chip 渲染、快捷键（`[` / `]`）、按钮 `disabled`、`jumpToChapter` 唯一写入点 | `PdfViewer.vue` 为 B 面白名单；A 面只提供纯函数与签名（§6） |
| 3 | `ChatPanel.vue` 的 `outline: readerStore.outline` 接线 + D1 的必填恢复 | B 面（该文件不在 A 面白名单）；恢复方式见 D1 表格最后一行 |
| 4 | `r12-4` 的载荷字节断言（离屏侧） | 依赖 B 面接线与 `waitSectionReady()` 就绪同步；A 面已用 `section-format` 在纯函数层覆盖同一判据 |
| 5 | `npm run build` / `npm test` / `npm run package` / `npm run dev` | 派单明文禁止，未运行 |
| 6 | 43 号既有场景的两处 `missingLines` 追加与就地就绪等待 | `ui-shot.mjs` 为 B 面（设计档 §2.2 四处既有面改动全部属 B 面） |

---

## 9. 收尾核对（白名单 / 零 diff）

```bash
cd E:/develop/PiX-Read && git status --short
# ⇒  M pix/package.json
#     M pix/src/renderer/utils/outline-notes.ts
#     M pix/src/renderer/utils/reading-context.ts
#    ?? docs/pm/R12-design.md      （既有未跟踪档，本轮未改）
#    ?? docs/pm/R12-req.md         （既有未跟踪档，本轮未改）
#    ?? docs/pm/R12-review.md      （既有未跟踪档，本轮未改）
#    ?? docs/pm/R12-dev.md         （本档，新建）
#    ?? pix/scripts/smoke-view.mjs （新建）
```

`git diff --stat`：`pix/package.json 1 +` / `pix/src/renderer/utils/outline-notes.ts 64 +++…` / `pix/src/renderer/utils/reading-context.ts 11 ±`（逐文件：package.json +1 / outline-notes.ts +64 −0 / reading-context.ts +10 −1 ⇒ 合计 **75 insertions / 1 deletion**）。

零 diff 清单（逐条实测为空，§4.6）：

```text
package-lock.json / packages/** / README.md / pix/tsconfig.json / pix/tsconfig.main.json / pix/tsconfig.preload.json
pix/src/renderer/stores/** / pix/src/shared/types.ts / pix/src/main/** / pix/resources/** / pix/build/**
pix/src/renderer/components/**（ChatPanel.vue / PdfViewer.vue / KnowledgeMap.vue / NotesPanel.vue / ReaderPanel.vue /
  LibraryPanel.vue / PdfSearchPanel.vue / PdfSelectionQuickAsk.vue 全部未改，A 面白名单外）
pix/scripts/ui-shot.mjs / pix/src/renderer/utils/notes-path.ts / pix/src/renderer/utils/notes-view.ts
```

B 面待改（本档只登记，未代改）：`pix/src/renderer/components/workspace/ChatPanel.vue`（+1 行）、`PdfViewer.vue`、`pix/scripts/ui-shot.mjs`；`pix/src/main/reading-prompt.ts`（设计档 §4 第 5 行，一行）在本轮派单中同样不属 A 面白名单，A 面未改动（若负责人把它划给 A 面，请回单确认后单独执行）。

---

# PiX-Read R12 开发档 · B 面（UI 面：N78 / N79-1 / N79-2 / N81-2）

> 上游：`docs/pm/R12-design.md`（含定稿修订 6 条）、`docs/pm/R12-req.md`、`docs/pm/R12-review.md`、本档上半（A 面契约面交付与 D1/D2/R1–R3 登记项）。
> 本档只追加 **B 面**（UI 面）交付：`pix/src/renderer/components/workspace/PdfViewer.vue`（N78 / N79-1 / N79-2）、`pix/scripts/ui-shot.mjs`（N81-2 + §2.2 四处既有面改动）、`pix/src/renderer/components/workspace/ChatPanel.vue`（N80-1 接线，一行）、`pix/src/main/reading-prompt.ts`（N80-4，一行）、本档。
> 派单口径：`ChatPanel.vue` 与 `reading-prompt.ts` 在本轮派单中划给 B 面；A 面档 §9 已声明这两项不在 A 面白名单。
> 本档只记录**真实文件内容与真实命令输出**；所有命令于 2026-09-16 在 `E:/develop/PiX-Read`（Windows + git bash）实跑。全程未运行 git 写命令、未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`，未改 `packages/**`、未增删依赖、未改 `package-lock.json`；白名单外零改动。
> 结论：**`npm run check` 0 error；`smoke:view` 连续两次 `通过 29 / 失败 0`；`smoke:notes` `通过 26 / 失败 0`；离屏验收 `UI_SHOT_AFTER_EXIT=0` + `MANIFEST.failure === null` + 127 张 / 185 条 / 41 种 label；既有 120 张 / 169 条 label 零缺失、新增 7 张截图与 4 组 16 条 record 齐备；四选择器跨文档几何位移 0/0/0/0。**
> **1 项偏差（B-D1：`ReadingSendContext.outline` 仍为可选，修复需改 A 面白名单外文件）与 1 项红灯登记（R-B1：既有 `r11-3` 相位 4 入口的既有竞态，3 次实跑 1 红 2 绿）需负责人裁决**；其余逐条按设计档落地。

## B1. 交付摘要（数字先给）

| 项 | 数值 | 来源 |
| --- | --- | --- |
| `cd pix && npm run check`（B 面落地后） | `CHECK_EXIT=0` | §B4.1 |
| `npm run smoke:view` 连续两次 | `通过 29 / 失败 0`（退出码 0） | §B4.1 |
| `npm run smoke:notes` | `通过 26 / 失败 0`（退出码 0） | §B4.1 |
| 离屏验收（`pix-v05-r12-after`） | `UI_SHOT_AFTER_EXIT=0`、`shots.length = 127`、`failure = null`、`MEASUREMENTS.length = 185`、label 去重 **41** | §B4.2 |
| 零缺失比对（对 `pix-v05-r11-lead`） | `{base:120, after:127, missing:[], added:<7 张新图>}`；label `{baseLabels:37, afterLabels:41, missing:[]}` | §B4.3 |
| 新增截图 / record | 7 张 / 4 组 16 条（5 / 2 / 7 / 2） | §B4.4 |
| 产物目录白名单 | `shots/` 一级只有 `*.png` / `MANIFEST.json` / `MEASUREMENTS.json`（无白名单外条目） | §B4.3 |
| 稳定性复跑（`pix-v05-r12-stab`） | `UI_SHOT_STAB_EXIT=0`、127 张、`failure = null`、零缺失（第二次连续绿） | §B4.2 |
| 首次离屏实跑（红灯，登记项 R-B1） | `UI_SHOT_AFTER_EXIT=1`，失败点 = 既有 `r11-3` 相位 4 入口 `selectPageSpan` 的既有等待（**在任一 `r12-*` 场景之前**），118 张后中断 | §B4.2 / §B7 R-B1 |
| 目视验收 | 7 张新图 + 6 张既有图抽样，无重叠 / 截断 / 遮挡 / 位移 | §B5 |
| 白名单外改动 | 0（`git status --short` 只列白名单文件 + 既有未跟踪文档） | §B8 |

B 面改动文件（4 个源码 + 本档，全部在白名单内）：

| 文件 | 动作 | 规模（`git diff --stat` 实测） | 对应需求 |
| --- | --- | --- | --- |
| `pix/src/renderer/components/workspace/PdfViewer.vue` | 修改 | `87 +`（纯新增，0 删除） | N78-1/2/3、N79-1、N79-2 |
| `pix/scripts/ui-shot.mjs` | 修改 | `539 + / 3 -`（3 处既有断言的显式改写见 §B3.2，其余纯新增） | N81-2、§2.2 四处 |
| `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改 | `1 +`（`outline: readerStore.outline,`） | N80-1 |
| `pix/src/main/reading-prompt.ts` | 修改 | `1 +`（制表符缩进，单 hunk） | N80-4 |
| `docs/pm/R12-dev.md` | 追加（本档下半） | —— | —— |

## B2. 基线（动工前读数，本次实跑）

```bash
node -e "…读 C:/Users/86157/AppData/Local/Temp/pix-v05-r11-lead/shots/{MANIFEST,MEASUREMENTS}.json…"
ls -A "C:/Users/86157/AppData/Local/Temp/pix-v05-r11-lead/shots" | grep -v -E '\.png$'
```

```text
{"shots":120,"failure":null,"measurements":169,"labels":37}
MANIFEST.json
MEASUREMENTS.json          ⇒ 122 个一级条目 = 120 png + 2 json，无白名单外文件
```

⇒ 与设计档 §0.1 / §5.1 步骤 0b 的冻结读数**逐字一致**（120 张 / 169 条 / 37 种 label / `failure === null`），作为本轮零缺失比对基线。

## B3. 改动清单（文件 + 具体改动）

### B3.1 `PdfViewer.vue`（+87 / −0）

| 位置（改后行号） | 内容 |
| --- | --- |
| `:30-:31` | import **两行**：value 行 `buildChapterRanges, formatChapterHeading, resolveChapterNav, resolveCurrentChapter`（`../../utils/outline-notes`）+ 独立一行 `import type { ChapterRange }`（与 `KnowledgeMap.vue:13-14` 范式一致，类型不混进 value 列表） |
| `:70-:78` | 3 个新 computed（逐字按设计档 §1.2.2）：`chapterRanges` / `currentChapter`（形状 `{ range, text } \| null`）/ `chapterNav` |
| `:331-:336` | `jumpToChapter(target: ChapterRange \| null): void`（函数体只有 `if (!target) return;` + `readerStore.gotoPage = target.start;`）⇒ 章节跳转唯一写入点 |
| `:403-:412` | `onWindowKeydown` 内 `[` / `]` 分支：位置在 `:402` 既有守卫（`pageCount <= 0 \|\| isEditableTarget(event.target)`）**之后**、`:420` 的 `switch (event.key)` **之前**；两条沿用守卫 + 两条新增（`captureMode` 自检、目标 `null` 时 `return` 不 `preventDefault`） |
| `:949-:972` | `.reader-section` 模板块（`.reader-section-prev` → `.reader-section-chip`（`v-if="currentChapter"`）→ `.reader-section-next`），插在 `.pdf-page-indicator` **之前**；`title` 逐字 `上一节（快捷键 [）` / `下一节（快捷键 ]）` |
| `:1181-:1215` | scoped 样式块（`bottom: 46px` / `z-index: 3` / `max-width: calc(100% - 24px)` / 容器 `pointer-events: none` + 两按钮 `auto` / chip `max-width: 360px` + 省略号 / `:deep(.v-btn--disabled) { opacity: 0.45 }`），放在 `.pdf-page-indicator` 规则之前 |

零 diff（实测）：`.pdf-page-indicator` 模板（`:975-1002`）逐字未动；`:402` 守卫、Esc 两分支、`/`、`PageUp/PageDown/ArrowLeft/ArrowRight/Home/End` 与 `Ctrl+F` 早退分支逐字未动；`isEditableTarget` 无第二份。

### B3.2 `ui-shot.mjs`（`539 + / 3 -`）

① `SEL` 追加 **8 项**（§1.6.1 逐字）：`readerSection` / `readerSectionChip` / `readerSectionPrev` / `readerSectionNext` / `pageIndicator` / `pageInput` / `readerMain` / `composerInput`（实测 `git diff` 该块新增 8 行条目）。

② 新增 **9 个 helper**（§1.6.1 逐字语义，实测 `grep -cE "const (clickEl|pressReaderKey|pressKeyOn|sectionProbe|pillProbe|waitSectionReady|closeMap|settleEmptyOutline|mapCurrentLabels) = "` ⇒ `9`）：`clickEl` / `pressReaderKey` / `pressKeyOn` / `sectionProbe` / `pillProbe` / `waitSectionReady` / `closeMap` / `settleEmptyOutline` / `mapCurrentLabels`；插值纪律按设计档（选择器 / 文本一律 `${JSON.stringify(...)}`，页面字符串内不出现 `SEL` 等 Node 侧标识符）。

③ 4 个场景 `r12-1` … `r12-4`（§1.6.2–§1.6.5 逐相位），组名 / 相位名 / `record` label / 截图名逐字；块末仍以 `await restoreStandardSeed();` 收尾（`runReaderStateScenarios` 的最后一条语句）。

④ §2.2 四处既有面改动（旧值 / 新值逐字）：

| # | 位置 | 旧值 | 新值 |
| --- | --- | --- | --- |
| 1 | `:2838`（原 `:2829`） | `<reading_context>\npath: <LIB>/sample-paper.pdf\npage: 1\npageCount: 3\n</reading_context>\n\n<TURN35B>` | 同串在 `pageCount: 3` 后插入 `section: 1. Abstract · 第 1 页\n` |
| 2 | `:3695-:3707`（原 `:3673-3686`） | `missing` 的 12 条 needle | 同一数组**追加第 13 条** `section: 2. Method Overview · 第 2 页`（既有 12 条逐字保留） |
| 3 | `:3708` / `:3710`（原 `:3698` / `:3700`） | 两处 `missingLines(...)` 的 4 项列表 | **两处同步追加**同一 needle（4 项 → 5 项，条件与失败文案文本一致） |
| 4 | `:3664-:3666`（原 `:3654` 之后） | 无 | **纯追加**就地等待 `await waitFor("章节控件就绪", document.querySelector(SEL.readerSection) !== null);`（不调用后置 helper，规避 TDZ） |

实测删除行仅 3 行（`git diff … | grep -E "^[-]" | grep -v "^---"`）：即上表 #1 的 1 行与 #3 的 2 行；#4 为纯追加、**无删除**；既有 `record(` / `capturePage(` / label 删除数 = **0**。

### B3.3 `ChatPanel.vue`（+1 行）

```diff
     notes: notesSnapshot,
+    outline: readerStore.outline,
   };
```

`readContext` 与 `page` / `pageCount` 同位（同一发送瞬间快照）；`:111` 注释、`:377` 调用点、既有 5 行与全部 chip 行为零改动。

### B3.4 `reading-prompt.ts`（+1 行，单 hunk）

在 `:5` 逐字 `\t"Use pdf_outline for bookmarks and page numbers.",` 之后插入（含行首**制表符**，`cat -A` 实测 `^I`）：

```text
	"The reading context may carry a section line: the section the user is currently reading and its page range. Trust it instead of inferring the section from the page number.",
```

既有 8 个数组元素与顺序逐字未动；数组元素 8 → 9；`].join("\n")` 内容逐字未动（仅行号后移）。

## B4. 真实命令与关键输出

### B4.1 工程门与烟测（B 面落地后）

```text
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0
通过 29 / 失败 0        （smoke:view 第 1 次，SMOKE_VIEW_1=0）
通过 29 / 失败 0        （smoke:view 第 2 次，SMOKE_VIEW_2=0）
通过 26 / 失败 0        （smoke:notes，SMOKE_NOTES=0）
```

### B4.2 离屏取证（三次实跑，串行、无并发）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" \
  PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r12-after" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_AFTER_EXIT=$?"
```

| 次 | 目录 | 退出码 | 结果 | 备注 |
| --- | --- | --- | --- | --- |
| 第 1 次 | `pix-v05-r12-after` | **1** | 失败于既有 `r11-3` 相位 4 入口的 `selectPageSpan`（`等待超时：摘录浮层`），产出 118 张后中断 | 登记项 R-B1（§B7）；失败点在**任一 `r12-*` 场景之前** |
| 第 2 次 | `pix-v05-r12-after` | **0** | `结束：产出 127 张截图`，`failure = null` | 验收读数（本次耗时 `real 2m21.676s`） |
| 第 3 次 | `pix-v05-r12-stab` | **0** | `结束：产出 127 张截图`，`failure = null`，零缺失复算一致 | 稳定性复跑；日志 `r11-3 相位 4 入口前置：ok=true attempts=2` |

### B4.3 零缺失比对（设计档 §5.2 逐字命令）

```text
{"base":120,"after":127,"missing":[],"added":["r12-1-section-chip-page1.png","r12-1b-section-chip-page2.png","r12-1c-section-chip-page3.png","r12-2-no-outline-degrade.png","r12-3-section-nav-after-next.png","r12-3b-section-nav-shortcut-prev.png","r12-4-section-context-sent.png"]}
AFTER_FAILURE=null
{"baseLabels":37,"afterLabels":41,"missing":[],"added":[["r12-section-visible",5],["r12-section-degrade",2],["r12-section-nav",7],["r12-section-context",2]]}
AFTER_MEASUREMENTS=185 BASE=169
STRAYS_EXIT=1        （无输出 ⇒ shots/ 一级无白名单外条目）
```

第 3 次实跑（`pix-v05-r12-stab`）的同一比对：`{"shots":127,"failure":null,"missingShots":[],"measurements":185,"labels":41,"missingLabels":[]}`。

### B4.4 四选择器几何（r12-2 相位 `zero-displacement` 现场读数）

```text
delta = {"indicator":{"x":0,"y":0,"width":0,"height":0},"pageLabel":{"x":0,"y":0,"width":0,"height":0},"toolbar":{"x":0,"y":0,"width":0,"height":0},"captureFab":{"x":0,"y":0,"width":0,"height":0}}
pageTexts = {"without":"第 1 / 2 页","with":"第 1 / 3 页"}      （换文档防空证据）
zoomTexts = {"without":"100%","with":"100%"}                    （±1px 判据的比较前提）
sectionOnSample.containerInDom = true / sectionAfterReturn.containerInDom = false
```

⇒ 四个既有选择器跨文档（控件缺席 ↔ 控件在场）**逐字段差 0px**（判据 ≤ 1px），无需登记任何偏差。

### B4.5 章节控件现场读数（r12-1 相位 `page-1`）

```text
section.containerRect = {x:660, y:919, width:165, height:24}   indicator.rect = {x:671, y:950, width:144, height:27}
overlap = {containerBottom:943, indicatorTop:950, containerWidth:165, viewerWidth:912}
containerPointerEvents = "none" / prevPointerEvents = "auto" / nextPointerEvents = "auto"
chipText = chipTitle = "1. Abstract · 第 1 页"；prevDisabled = true / nextDisabled = false
```

⇒ 垂直间距 7px（设计档 §0.3 预估 6–8px）、宽度 165 < 912、同一居中轴（容器中心 742.5 / pill 中心 743）。三页读数：`165`（第 1 页）/ `221`（第 2 页）/ `212`（第 3 页），均随内容收缩。

### B4.6 16 条 record 的判据现场（`MEASUREMENTS.json` 摘录）

| 组 | 相位 | 关键读数 |
| --- | --- | --- |
| `r12-section-visible` | `page-1` / `page-2` / `page-3` | chip 逐字 `1. Abstract · 第 1 页` / `2. Method Overview · 第 2 页` / `2.2 Positional prior · 第 3 页`；禁用态 `true/false` → `false/false` → `false/true`；`.page-label` 恒为 `第 n / 3 页` |
| `r12-section-visible` | `invariance` | 5 次读数（地图开 / 关 / 缩放往返 / 面板切标签）chip 逐字节相等且容器全程在 DOM；`zoomAfterIn = "110%"`、`zoomBack = "100%"`；`currentLabels = ["2.2 Positional prior","3. Ablation Study","Appendix B"]`（含设计档要求的两项） |
| `r12-section-visible` | `page-input` | 提交 `99` ⇒ `.page-label` 仍 `第 3 / 3 页`、chip 不漂移；提交 `2` ⇒ `第 2 / 3 页` + `2. Method Overview · 第 2 页` |
| `r12-section-degrade` | `no-outline` | `containerInDom=false`（派发前 / 后各一次）、`.page-label` 前后均 `第 1 / 2 页`（零副作用）、`hashSame=true` |
| `r12-section-degrade` | `zero-displacement` | 见 §B4.4 |
| `r12-section-nav` | `next-jump` / `next-last-disabled` / `prev-jump` | `第 2 / 3 页`（两按钮可点）→ `第 3 / 3 页`（next 禁用 / prev 可点）→ `第 2 / 3 页`（上一节 = `2.1`，真实后退一页） |
| `r12-section-nav` | `shortcut-next` / `shortcut-prev` | 派发前 `第 1 / 3 页` + prev 禁用（防空）→ `]` 落 `第 2 / 3 页` + `2. Method Overview · 第 2 页`；`[` 回 `第 1 / 3 页` + `1. Abstract · 第 1 页` + prev 禁用 |
| `r12-section-nav` | `shortcut-guard-editable` | `targets = {pageInput:"INPUT", composer:"TEXTAREA"}`、`pageInputValue = "1"`、取消编辑后 / composer 派发后 `.page-label` 均 `第 1 / 3 页`（守卫证据） |
| `r12-section-nav` | `shortcut-guard-capture` | 框选层在 DOM 时 `第 1 / 3 页`（不生效）；退出后同一按键落 `第 2 / 3 页` |
| `r12-section-context` | `with-section` | 载荷含逐字行 `section: 2. Method Overview · 第 2 页`（第 5 行）；`withoutSectionEqualsOld = true`；`selectedTextInPayload = false`；`notesInPayload = 0`；`displayText = "12：这一节的假设是什么？"` |
| `r12-section-context` | `without-outline` | 载荷**逐字节**等于旧格式（`exact = true`，`path: …\library\archive\older-paper.pdf` / `page: 1` / `pageCount: 2` / `13：没有书签的文档也要能正常提问。`）；不含 `section:` |

§2.2 改写的现场证据：43 号 `notes-context` 相位 `prompt` 的 `missing = []`（13 条 needle 含新增的 `section: 2. Method Overview · 第 2 页` 全在场）；35 号 `answer-save` 相位 `strict` 照常产出 `title = "存为笔记 · sample-paper.pdf 第 2 页（按当前阅读位置）"`。

## B5. 目视验收（§8 逐张登记）

| 截图 | 观察项与结论 |
| --- | --- |
| `r12-1-section-chip-page1.png` | 章节胶囊 `« 1. Abstract · 第 1 页 »` 与页码胶囊 `^ 第 1 / 3 页 v` **同一居中轴**、垂直间距 7px（不重叠、不遮挡 pill 点击区）；左侧双箭头明显置灰（禁用）、右侧正常；文本完整无截断 |
| `r12-1b-section-chip-page2.png` | 两按钮均正常（无灰化）；chip 随页更新为 `2. Method Overview · 第 2 页` |
| `r12-1c-section-chip-page3.png` | 右侧双箭头置灰（末节禁用）、左侧正常；chip 为 `2.2 Positional prior · 第 3 页`；与 pill 仍不重叠 |
| `r12-2-no-outline-degrade.png` | 章节行**整行不存在**（无空壳 / 无占位高度 / 无半截控件）；pill `第 1 / 2 页` 位置与宽度与有书签帧逐像素一致（`delta` 全 0） |
| `r12-3-section-nav-after-next.png` | 与 `r12-1b` 同框一致：`第 2 / 3 页` + `2. Method Overview · 第 2 页`，两按钮可点 |
| `r12-3b-section-nav-shortcut-prev.png` | 与 `r12-1` 同框一致：`第 1 / 3 页` + `1. Abstract · 第 1 页`，左箭头置灰 ⇒ 快捷键与按钮结果视觉无差异 |
| `r12-4-section-context-sent.png`（整窗） | 气泡文案为纯用户输入 `12：这一节的假设是什么？`（无上下文行）；chip 行与页码 pill 布局正常；左栏树、右栏 chip 行均无重叠 / 截断 |

**既有截图的抽样登记（§8 第 8 条：新增控件会出现在既有帧内）**：

| 抽样截图 | 观察项与结论 |
| --- | --- |
| `35-answer-anchor-strict.png` | 第 2 页：章节胶囊与 pill 居中且不重叠；仿真确认文本按 §2.2 第 1 行同步带 `section: 1. Abstract · 第 1 页`（与真实载荷格式一致） |
| `43-notes-context-payload.png` | 第 2 页：同上，无遮挡笔记面板 / 无截断 |
| `50-map-outline.png` | **地图打开 ⇒ 中心栏变窄（≈605px）**：胶囊按内容收缩完整显示、不换行、不溢出、不与地图分隔线或 pill 重叠 |
| `52e2-map-chapter-filter-current-doc-off.png` | 窄栏 + 第 1 页：同上，无截断 |
| `20b-resume-opened.png` | 110% + 第 3 页：chip `2.2 Positional prior · 第 3 页`、右箭头置灰，与 pill 不重叠、无遮挡 |
| `31c-answer-save-too-long.png` | 无书签文档（older-paper.pdf）：仅 pill、无章节行（零占位在既有帧中同样成立） |

**目视判红规则（§8 第 7 条）**：未发现任何非预期差异（控件重叠 / 文字截断 / 按钮不可辨识 / 既有控件位移 > 1px）。

## B6. 走查判据（设计档 §1.2.5 / §1.3.5 / §5.4，逐条实测）

| # | 命令 | 实测结果 |
| --- | --- | --- |
| 1 | `grep -c 'addEventListener("keydown"' PdfViewer.vue` | `1`（唯一注册点） |
| 2 | `grep -n 'event.key === "\["' PdfViewer.vue` | 恰 1 处 `:403`，且 `:402` 守卫 < `:403` < `:420` `switch` |
| 3 | `grep -c "function isEditableTarget" PdfViewer.vue` | `1` |
| 4 | `grep -n "readerStore.gotoPage = " PdfViewer.vue` | `:334`（新增，`jumpToChapter` 内）+ `:831`（既有 watcher 复位）⇒ 新增恰 1 处 |
| 5 | `grep -rnE "\.(start\|end)[[:space:]]*(<=\|>=\|<\|>)" pix/src/renderer/components/` | 仅 `KnowledgeMap.vue:169` / `:174`（⊆ 允许集合 {`:167` 注释 / `:169` / `:174`、`PdfSearchPanel.vue:268`}） |
| 6 | `grep -rnE "buildChapterRanges\(\|resolveCurrentChapter\(\|resolveChapterNav\(" pix/src/renderer/components/` | 命中 `PdfViewer.vue` + `KnowledgeMap.vue`（正向：消费唯一派生） |
| 7 | `git diff -- pix/src/renderer/stores pix/src/renderer/components/workspace/{ReaderPanel,KnowledgeMap}.vue` | 空 |
| 8 | `git diff -- ui-shot.mjs \| grep -E "^[-]" \| grep -v "^---"` | 恰 3 行，全部落在 §2.2 允许的改写点；既有 `record(` / `capturePage(` / label 删除数 `0` |
| 9 | `git diff -- ui-shot.mjs \| awk '/^\+  readerSection:/,/^\+  composerInput:/' \| wc -l` | `8`（`SEL` 恰 8 项） |
| 10 | 新 helper 计数（§B3.2 ②） | `9` |
| 11 | `git diff -- package-lock.json packages README.md pix/tsconfig.json pix/tsconfig.main.json pix/tsconfig.preload.json pix/vite.config.ts pix/resources pix/build pix/src/main pix/src/shared` | 空（退出码 0、无输出） |
| 12 | `git status --short` | 只列白名单：`M pix/package.json` / `M pix/scripts/ui-shot.mjs` / `M pix/src/main/reading-prompt.ts` / `M …/ChatPanel.vue` / `M …/PdfViewer.vue` / `M …/outline-notes.ts` / `M …/reading-context.ts` / `?? docs/pm/R12-{design,dev,req,review}.md` / `?? pix/scripts/smoke-view.mjs` |

> 走查命令的例外说明：上表 #11 的 `pix/src/main` 覆盖整个主进程目录，唯一改动是 `reading-prompt.ts`（本档 §B3.4）；#12 中 `M …/outline-notes.ts`、`M …/reading-context.ts`、`M pix/package.json`、`?? pix/scripts/smoke-view.mjs` 属 A 面。

## B7. 偏差与登记项

### B-D1（需负责人裁决）：`ReadingSendContext.outline` 仍为**可选**（A 面 D1 未解）

| 项 | 内容 |
| --- | --- |
| 定稿口径 | 设计档 §1.4.1：`outline` 为第 6 个**必填**字段、不给默认值（漏传即编译期报错） |
| 本轮状态 | A 面交付为 `outline?: ReaderOutlineNode[]` + `buildReadingUserMessage` 内单点降级 `?? []`（A 面档 D1，附 4 行偏差注释块） |
| 行为面 | **已完全接线**：`ChatPanel.vue` 的 `readContext` 逐字传入 `outline: readerStore.outline`（§B3.3）⇒ 运行期与定稿语义一致，由 `r12-section-context` 两条逐字节断言 + 烟测 `section-format` #1–#3 兜底 |
| 仍缺 | 编译期护栏（漏传不再报错） |
| 修复方式（一行 + 注释块，**不在 B 面白名单**） | `pix/src/renderer/utils/reading-context.ts`：`outline?:` → `outline:`，删除 `?? []`（改 `ctx.outline`）并删除该字段上方 4 行偏差注释 |
| 归属 | 该文件为 A 面白名单；B 面派单明确「改白名单之外的任何文件」为禁止项 ⇒ 本档只登记，不代改 |

### R-B1（登记项）：既有 `r11-3` 相位 4 入口的既有竞态（3 次实跑 1 红 2 绿）

| 项 | 内容 |
| --- | --- |
| 现象（第 1 次实跑） | `场景失败：等待超时：摘录浮层（… .quick-ask … offsetParent !== null）`；栈 = `waitFor` → `selectPageSpan`（既有 `:1550`）→ `runReaderStateScenarios`（相位 4 入口）；产出 118 张后中断，`UI_SHOT_AFTER_EXIT=1` |
| 与 B 面的关系 | 失败点在**任一 `r12-*` 场景执行之前**（`r12-*` 全部挂在本函数末尾）；该 phase 的断言、截图、label 与代码路径**逐字未被 B 面改动**（B 面在 `ui-shot.mjs` 的删除行仅 3 行，均在 35 / 43 号场景内） |
| 同代码复跑证据 | 第 2 次实跑同相位 `入口前置：ok=true attempts=1`（绿）；第 3 次实跑 `attempts=2`（绿，即 R11 加固的有界重取真实触发过一次）⇒ 该入口存在真实时间窗竞态；R11 档已登记同类风险（「同一代码 3 次实跑 1 绿 2 红」为加固前读数、「相位 4 的时序余量…在显著更慢的环境下可能变红」） |
| 未处置原因 | `selectPageSpan` 的既有硬等待不在本轮 §2.2 的四处允许改写点内；加固既有断言会越出设计档授权（派单同时禁止删除既有断言）⇒ 只登记，交由负责人裁决是否另起一轮加固（处方与 R11「有界重取」同款） |
| 影响面 | 既有 120 张 / 169 条零缺失与新增 7 张 / 16 条判据**不受影响**；绿灯实跑（第 2、3 次）已产出全部产物 |

### R-B2（登记项）：场景私有的局部箭头函数不计入「恰 9 个 helper」

`r12-1` 的 `reading12a` / `setPageDraft12a`、`r12-2` 的 `rectDelta12b` / `rectSame12b` 为**场景私有**（只在同组断言内使用，命名带场景后缀），与 R11 的 `widthOk11e` / `rowData11e` 同范式；设计档冻结的 9 个为**共用 helper**（§B3.2 ② 实测 9 个）。

### R-B3（登记项）：`data` 字段在冻结清单之外补了少量现场证据（只增不减）

- `r12-1` 相位 `page-1`：`overlap` 拆成 `{containerBottom, indicatorTop, containerWidth, viewerWidth}` 四个可判值（对应设计档 ⑤ 的三条子判据）。
- `r12-2` 相位 `no-outline`：增 `sectionBefore`（派发前读数）；相位 `zero-displacement`：增 `zoomTexts` / `sectionOnSample`（比较前提与防空证据）。
- `r12-4` 相位 `with-section`：增 `displayText`（对应 ④ 气泡文案断言）。
- 冻结清单内的字段（`phase` / `section` / `pill` / `readings` / `zoomAfterIn` / `zoomBack` / `currentLabels` / `afterOutOfRange` / `afterValid` / `pageTextBefore` / `pageTextAfter` / `hashSame` / `pillWithout` / `pillWith` / `delta` / `pageTexts` / `sectionAfterReturn` / `pageText` / `targets` / `pageInputValue` / `inCapture` / `afterExit` / `message` / `sectionLine` / `withoutSectionEqualsOld` / `selectedTextInPayload` / `notesInPayload` / `exact`）**逐条在场**，无一条判据被删减或改写。

### R-B4（登记项）：chip 的省略号（ellipsis）路径无截图覆盖

设计档 §0.3 冻结 `chip max-width: 360px` + `overflow: hidden; white-space: nowrap; text-overflow: ellipsis`（已逐字落地，§B3.1）。本轮冻结的 7 张截图与既有 127 张中无「chip 文本宽 > 360px」的帧（`sample-paper.pdf` 最长 chip = `2. Method Overview · 第 2 页`，实测容器宽 221px；窄栏相位只判文本、不判矩形）⇒ 该视觉分支**只由 CSS 逐字保证**，未取得截图证据（需要新增长标题夹具或长书签帧，属下一轮范围）。

## B8. 未验证事项 / 未决项

| # | 未决项 | 原因 / 归属 |
| --- | --- | --- |
| 1 | `ReadingSendContext.outline` 恢复必填（编译期护栏） | 需改 `pix/src/renderer/utils/reading-context.ts`（A 面白名单）；见 §B7 B-D1，请负责人指派 |
| 2 | `r11-3` 相位 4 入口竞态是否加固（`selectPageSpan` 的硬等待） | 既有一行，不在 §2.2 授权范围内；见 §B7 R-B1，请负责人裁决 |
| 3 | chip 悬停原生 tooltip 不弹（容器 / chip 继承 `pointer-events: none`） | 设计档 §1.2.3 已登记为可接受后果（只判 `chipText === chipTitle`）；要 hover tooltip 需回改需求档 §0.5 |
| 4 | 长标题省略号（> 360px）无截图证据 | 见 §B7 R-B4（本轮 7 张截图冻结，夹具无长标题帧） |
| 5 | `npm run build` / `npm test` / `npm run package` / `npm run dev` | 派单明文禁止，未运行 |
| 6 | 提交 | 派单明文禁止任何 git 写命令；白名单文件的提交由负责人执行 |

## 修复轮（R12）

- 依据：`docs/pm/R12-review.md`「代码审查（R12）」must-fix 清单 C6 第 1 条（本轮唯一 must-fix）。
- 修复条数：**1**，落点 = `pix/src/renderer/utils/reading-context.ts`（R12 白名单文件，无白名单外改动）。

### 修复内容（R12-F1：`outline` 恢复必填契约）

| 项 | 内容 |
| --- | --- |
| 缺陷 | `ReadingSendContext.outline` 为可选字段（`outline?: ReaderOutlineNode[]`）+ `buildChapterRanges(ctx.outline ?? [], …)` 单点降级 + 字段上方 4 行偏差注释（「B 面尚未接线 ⇒ 暂时可选」）；与需求档 §0.2 第 3 条 / 设计档 §1.4.1 冻结的「第 6 个必填字段、不给默认值」不符 ⇒ 漏传不再编译期报错 |
| 修法（3 处，与审查给出的确切位置逐字一致） | ① `outline?: ReaderOutlineNode[];` → `outline: ReaderOutlineNode[];`；② 删除 4 行偏差注释，替换为设计档 §1.4.1 冻结注释 `/** 必填：书签树快照（发送瞬间的派生结果）；不给默认值（漏传即编译期报错）。 */`；③ `resolveCurrentChapter(buildChapterRanges(ctx.outline ?? [], ctx.pageCount), …)` → `resolveCurrentChapter(buildChapterRanges(ctx.outline, ctx.pageCount), …)` |
| 残留检查 | `grep -n "outline?"` 与 `grep -n "?? \[\]"` 在 `reading-context.ts` 内零命中（兜底与偏差注释均已不存在） |
| 影响面 | 全仓库唯一调用点 `ChatPanel.vue:362` 已逐字传 `outline: readerStore.outline` ⇒ 运行期语义不变；漏传即 `npm run check` 报错（编译期护栏恢复） |

### 复跑命令与原样结果

| # | 命令 | 原样读数 |
| --- | --- | --- |
| 1 | `cd /e/develop/PiX-Read/pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` | 输出仅 `> pix-read@0.1.0 check` + `> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit`；`CHECK_EXIT=0`（0 error） |
| 2 | `cd /e/develop/PiX-Read && PATH="/c/Program Files/nodejs:$PATH" node pix/scripts/smoke-view.mjs` | `通过 29 / 失败 0`；`SMOKE_VIEW_EXIT=0` |
| 3 | `cd /e/develop/PiX-Read && PATH="/c/Program Files/nodejs:$PATH" node pix/scripts/smoke-notes.mjs` | `通过 26 / 失败 0`；`SMOKE_NOTES_EXIT=0` |
| 4 | `cd /e/develop/PiX-Read/pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r12-after" ./node_modules/.bin/electron scripts/ui-shot.mjs` | 末两行 `[ui-shot] 结束：产出 127 张截图`；`UI_SHOT_AFTER_EXIT=0`（失败数 0） |

复跑 #4 产物核对（`pix-v05-r12-after/shots`，全部为本次真实读数）：

| 项 | 读数 |
| --- | --- |
| `MANIFEST.json` | `shots.length = 127`、`failure = null` |
| 磁盘 ↔ 清单双向比对 | 一级 129 项 = 127 png + `MANIFEST.json` + `MEASUREMENTS.json`；`missingFromDisk = []`、`missingFromManifest = []` |
| 零缺失比对（基线 `C:/Users/86157/AppData/Local/Temp/pix-v05-r11-lead`） | `{"base":120,"after":127,"missing":[],"added":[7 张]}`；`added` 逐字 = `r12-1-section-chip-page1.png` / `r12-1b-section-chip-page2.png` / `r12-1c-section-chip-page3.png` / `r12-2-no-outline-degrade.png` / `r12-3-section-nav-after-next.png` / `r12-3b-section-nav-shortcut-prev.png` / `r12-4-section-context-sent.png` |
| `MEASUREMENTS.json` | `169 条 / 37 label`（基线）→ `185 条 / 41 label`（复跑）；`missingLabels = []`（逐 label 计次不减少） |
| 重点回归：43 号载荷断言 | `notes-context` 相位 `prompt` ⇒ `missing = []`、`orderOk = true`、`endsWithUserText = true`、`displayText = "请对比这两处的结论。"`（与基线逐字相同）；骨架硬断言列表 5 项含 `section: 2. Method Overview · 第 2 页`（`ui-shot.mjs:3698`/`:3700`），`failure === null` + 退出码 0 ⇒ 该断言通过 |
| 重点回归：`r12-section-context` | 相位 `with-section`：载荷逐字 = `<reading_context>\npath: <…>\\library\\sample-paper.pdf\npage: 2\npageCount: 3\nsection: 2. Method Overview · 第 2 页\n</reading_context>\n\n12：这一节的假设是什么？`，`sectionLine = "section: 2. Method Overview · 第 2 页"`（恒为第 5 行）、`withoutSectionEqualsOld = true`、`selectedTextInPayload = false`、`notesInPayload = 0`、`displayText = "12：这一节的假设是什么？"`；相位 `without-outline`：`exact = true`（无 `section:` 行） |
| 白名单 | `git status --short` 无新增条目；本修复只改 `pix/src/renderer/utils/reading-context.ts`（`git diff --numstat` = `7 插入 / 1 删除`：import 面 +2/−1、接口字段 +2、section 行组装 +3），另有本档追加 |

---

# 终验（R12）

> 角色：R12 终验（冷启动，独立于设计档与 A / B 面开发角色）。授权范围：读文件、`cd pix && npm run check`、两个烟测、一次离屏取证、只读 git；白名单内只改本档。未运行任何 git 写命令，未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`，未改 `packages/**`、未增删依赖、未改白名单外文件，未删除任何既有场景或断言。
> 全部结论来自本次真实命令输出与真实文件内容；命令于 2026-09-16 在 `E:/develop/PiX-Read`（Windows + git bash）实跑。取证目录 `C:/Users/86157/AppData/Local/Temp/pix-v05-r12-final`（全新目录），基线 `C:/Users/86157/AppData/Local/Temp/pix-v05-r11-lead`（R11 交付目录，只读比对）。
> 一句话结论：**`check` 0 error、两个烟测全绿、离屏 127 张 / `failure === null` / 退出码 0、既有 120 张与 169 条 label 零缺失、新增 7 张与 4 组 16 条齐备且 38 条独立复算 0 失败、目视无重叠 / 无占位 / 无截断、PRD §7.2 与 N77–N81 逐条有「已实现 + 有判据」；未销账 must-fix = 0，可提交。**

## T1 白名单与零 diff 核对

```bash
cd E:/develop/PiX-Read && git status --porcelain=v1
git diff --numstat
git diff --exit-code -- package-lock.json packages README.md pix/tsconfig.json pix/tsconfig.main.json \
  pix/tsconfig.preload.json pix/vite.config.ts pix/resources pix/build pix/src/renderer/stores \
  pix/src/shared/types.ts pix/src/renderer/components/workspace/KnowledgeMap.vue \
  pix/src/renderer/components/workspace/ReaderPanel.vue
```

```text
 M pix/package.json
 M pix/scripts/ui-shot.mjs
 M pix/src/main/reading-prompt.ts
 M pix/src/renderer/components/workspace/ChatPanel.vue
 M pix/src/renderer/components/workspace/PdfViewer.vue
 M pix/src/renderer/utils/outline-notes.ts
 M pix/src/renderer/utils/reading-context.ts
?? docs/pm/R12-design.md
?? docs/pm/R12-dev.md
?? docs/pm/R12-req.md
?? docs/pm/R12-review.md
?? pix/scripts/smoke-view.mjs

1	0	pix/package.json
539	3	pix/scripts/ui-shot.mjs
1	0	pix/src/main/reading-prompt.ts
1	0	pix/src/renderer/components/workspace/ChatPanel.vue
87	0	pix/src/renderer/components/workspace/PdfViewer.vue
64	0	pix/src/renderer/utils/outline-notes.ts
7	1	pix/src/renderer/utils/reading-context.ts

ZERO_DIFF_EXIT=0        （零 diff 清单无输出）
```

逐条结论：

| # | 项 | 结论 |
| --- | --- | --- |
| 1 | 改动集合 | 7 个已修改文件 + `pix/scripts/smoke-view.mjs` + 4 个 `docs/pm/R12-*.md`，与需求档 §7 白名单 #1–#9 一一对应；无第 10 个路径，无意外文件 |
| 2 | `packages/**` / lockfile / 依赖字段 | 零 diff（`ZERO_DIFF_EXIT=0`）；`pix/package.json` 唯一 hunk = `+    "smoke:view": "node scripts/smoke-view.mjs",` |
| 3 | 范围外文件 | `tsconfig*.json` / `vite.config.ts` / `stores/**` / `shared/types.ts` / `KnowledgeMap.vue` / `ReaderPanel.vue` / `resources` / `build` / `README.md` 全空 |
| 4 | `ui-shot.mjs` 删除面 | 删除行恰 3 行，逐字为 35 号夹具串与 43 号骨架断言的两条列表（需求 §2.2 #1/#3 允许点）；`grep -cE "^[-][[:space:]]*(record|capturePage|label)"` ⇒ 0；`SEL` 追加 8 项 |
| 5 | 纯新增文件 | `outline-notes.ts` / `PdfViewer.vue` 删除行 0；`ChatPanel.vue` 恰 `+1`（`outline: readerStore.outline,`）；`reading-prompt.ts` 单 hunk `+1`（`cat -A` 确认行首 `^I`；新增行位于既有 `:5` 之后，成新 `:6`；数组元素 8 → 9，`].join("\n")` 逐字未动） |
| 6 | 新导出签名 | `outline-notes.ts:136` `formatChapterHeading(range: ChapterRange): string` / `:145` `resolveCurrentChapter(` / `:166` `resolveChapterNav(`；`grep -c "^export function"` ⇒ 5（改前 2 + 3） |
| 7 | 控件字面 | `PdfViewer.vue:955/965` `mdi-chevron-double-left` / `-right`；`:958` `title="上一节（快捷键 [）"`；`:968` `title="下一节（快捷键 ]）"`；`:1196` 容器 `pointer-events: none`；`:1213` 两按钮 `pointer-events: auto`；元素顺序 prev → chip(`v-if`) → next（`:954` / `:962` / `:964`） |
| 8 | 键盘面 | `addEventListener("keydown"` 恰 1 处（`:451`）；`isEditableTarget` 恰 1 个定义；新分支 `:403` 位于守卫 `:402` 之后、`switch (event.key)` `:420` 之前；`readerStore.gotoPage =` 新增恰 1 处（`:334`，另 `:831` 为既有 watcher 复位） |
| 9 | 唯一派生（反向） | 组件层区间比较命中集合 = `KnowledgeMap.vue:167`（注释）/ `:169`（`isCurrent`）/ `:174`（`isRead`）+ `PdfSearchPanel.vue:268`（搜索分段）⊆ 需求档 N77-1 允许集合；正向消费点 = `PdfViewer.vue:72/74/77`（+ 既有 `KnowledgeMap.vue:48`） |
| 10 | `outline` 必填契约 | `reading-context.ts`：`/outline?/` 与 `/\?\? \[\]/` 均零命中；字段为 `outline: ReaderOutlineNode[]`（含冻结注释），组装行为 `buildChapterRanges(ctx.outline, …)` ⇒ 修复轮 C6#1 已闭环 |
| 11 | 禁用写法 | `outline-notes.ts` / `reading-context.ts` / `reading-prompt.ts` 的 `\bany\b` / `await import` / `import(` 零命中 |
| 12 | 仓库残留 | 全部实跑后 `git status --short` 与动工前逐字相同；`ls -d "$TEMP"/pix-smoke-view-* "$TEMP"/pix-smoke-notes-*` ⇒ 无输出（exit 2） |

## T2 工程门与烟测

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
cd E:/develop/PiX-Read && PATH="/c/Program Files/nodejs:$PATH" node pix/scripts/smoke-view.mjs; echo "SMOKE_VIEW_EXIT=$?"
cd E:/develop/PiX-Read && PATH="/c/Program Files/nodejs:$PATH" node pix/scripts/smoke-notes.mjs; echo "SMOKE_NOTES_EXIT=$?"
```

```text
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0

[smoke-view] 临时目录：C:\Users\86157\AppData\Local\Temp\pix-smoke-view-1789560179698
== 组 section-hit == / == 组 section-null == / == 组 section-nav == / == 组 section-format ==   （29 条全 [通过]）
通过 29 / 失败 0
SMOKE_VIEW_EXIT=0

== 组 undo-roundtrip == / undo-failures / undo-slot-lifecycle / export-and-empty                （26 条全 [通过]）
通过 26 / 失败 0
SMOKE_NOTES_EXIT=0
```

结论：唯一工程门 0 error；`smoke-view` 4 组 29 条全绿（`section-hit` 8 / `section-null` 8 / `section-nav` 8 / `section-format` 5）；`smoke-notes` 主进程数据面 26 条全绿（回归）；两脚本自清理，`%TEMP%` 零残留。

## T3 全新离屏取证与零缺失比对

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r12-final" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_FINAL_EXIT=$?"
```

```text
[ui-shot] 测量 r12-section-visible: {"phase":"page-1",…"chipText":"1. Abstract · 第 1 页","containerRect":{"x":660,"y":919,"width":165,"height":24},"viewerWidth":912}…
[ui-shot] 测量 r12-section-context: {"phase":"without-outline","message":"<reading_context>\npath: …\\archive\\older-paper.pdf\npage: 1\npageCount: 2\n</reading_context>\n\n13：没有书签的文档也要能正常提问。","exact":true,…}
[ui-shot] 结束：产出 127 张截图
UI_SHOT_FINAL_EXIT=0
```

比对（独立脚本只读两份 `MANIFEST.json` / `MEASUREMENTS.json` 与磁盘目录；该脚本写在 `%TEMP%`）：

```text
[OK] final.failure === null ⇒ null
[OK] shots base=120 final=127 missing=[] ⇒ []
      added(7) = ["r12-1-section-chip-page1.png","r12-1b-section-chip-page2.png","r12-1c-section-chip-page3.png","r12-2-no-outline-degrade.png","r12-3-section-nav-after-next.png","r12-3b-section-nav-shortcut-prev.png","r12-4-section-context-sent.png"]
[OK] 新增截图恰为冻结的 7 张
[OK] 磁盘 png 数 = 清单数 ⇒ 127 vs 127
[OK] shots/ 一级无白名单外条目 ⇒ ["MANIFEST.json","MEASUREMENTS.json"]
[OK] labels base=37 final=41 missing=[] 且逐 label 计次不减少 ⇒ {"missingLabels":[],"shortCounts":[]}
      addedLabels = [["r12-section-visible",5],["r12-section-degrade",2],["r12-section-nav",7],["r12-section-context",2]]
[OK] 基线 169 / 验收 185（+16） ⇒ 169 → 185
```

⇒ 既有 120 张截图 / 169 条 label / 37 种 label 零缺失、零改写；新增截图恰为冻结 7 张；新增 record 恰 4 组 5/2/7/2 = 16 条；`failure === null`、退出码 0；产物目录一级只有白名单条目。本次冷启动单次实跑即绿，B 面登记的既有 `r11-3` 相位 4 入口竞态**未复现**（`r11-*` 测量全部产出）。

## T4 新场景断言逐条复算（38 项，0 失败）

复算口径：不采信场景自报的 `ok` 字段，按需求档 N78/N79/N80 的冻结期望，从 `MEASUREMENTS.json` 原始读数**独立重建**判定（chip 文本 / `title` 逐字、`disabled` 一一对应、矩形不相交且在下方、指针语义、跨文档 ≤1px、消息逐字节重建）。

| 组 | 复算项 | 原样读数（本次终验） |
| --- | --- | --- |
| `r12-section-visible`（5 条） | page-1：在 DOM + chip = `title` = `1. Abstract · 第 1 页` + prev 禁用 / next 可点 + pill 仍 `第 1 / 3 页` + `containerBottom 943 ≤ indicatorTop 950 + 1` + 容器宽 165 < viewer 912 + 容器 `none` / 双按钮 `auto` | 全部 [OK] |
| | page-2 / page-3：`2. Method Overview · 第 2 页`（双可点）/ `2.2 Positional prior · 第 3 页`（next 禁用） | 全部 [OK] |
| | invariance：5 次读数逐字节相等且容器恒在 DOM；`zoomAfterIn=110%` → `zoomBack=100%`；`currentLabels = ["2.2 Positional prior","3. Ablation Study","Appendix B"]`（含 chip 标题与逆序书签） | 全部 [OK] |
| | page-input：越界 `99` ⇒ 页码与 chip 不漂移；提交 `2` ⇒ `第 2 / 3 页` + chip 同步 | 全部 [OK] |
| `r12-section-degrade`（2 条） | no-outline：容器与 chip 均不在 DOM（前后各一次）+ 两次快捷键派发后页码仍 `第 1 / 2 页` + `hashSame=true` | 全部 [OK] |
| | zero-displacement：四选择器（`indicator` / `pageLabel` / `toolbar` / `captureFab`）跨文档 `x/y/width/height` 逐字段差 = 0；前提 `zoomTexts` 均 `100%`、`pageTexts` 为 `第 1 / 2 页` ↔ `第 1 / 3 页`；存在性往返（sample 在 / 切回后不在） | 全部 [OK] |
| `r12-section-nav`（7 条） | next-jump ⇒ `第 2 / 3 页`；next-last-disabled ⇒ `第 3 / 3 页` + next 禁用 / prev 可点；prev-jump ⇒ 真实后退 `第 2 / 3 页` + chip 同步 | 全部 [OK] |
| | shortcut-next：防空（`第 1 / 3 页` + prev 禁用）→ `]` 落 `第 2 / 3 页` 且与按钮同目标；shortcut-prev：`[` 回 `第 1 / 3 页` + chip `1. Abstract · 第 1 页` + prev 禁用 | 全部 [OK] |
| | shortcut-guard-editable：`targets = {pageInput:INPUT, composer:TEXTAREA}`、`.page-input` 值仍 `1`、两次派发后页码与 chip 不动；shortcut-guard-capture：模式内 `第 1 / 3 页`、退出后同键落 `第 2 / 3 页` | 全部 [OK] |
| `r12-section-context`（2 条） | with-section：`section: 2. Method Overview · 第 2 页` 恒为第 5 行；`pageCount: 3 < section: < </reading_context>`；**删该行后与手工重建的旧格式逐字节相等**；气泡 = 用户原文；`selectedTextInPayload=false` / `notesInPayload=0` | 全部 [OK] |
| | without-outline：载荷逐字节等于手工重建的旧格式（`archive/older-paper.pdf` / `page: 1` / `pageCount: 2`），且不含 `section:` | 全部 [OK] |

复算脚本末行：`复算失败项：0`。

## T5 目视结论（read 工具逐张）

目视 4 张：`r12-1-section-chip-page1.png` / `r12-1c-section-chip-page3.png` / `r12-2-no-outline-degrade.png` / `r12-3-section-nav-after-next.png`（后三张覆盖 3 个新场景与降级帧）。

| 判据 | 结论 |
| --- | --- |
| chip 与 pill 同轴 | 成立。几何：容器中心 `660+165/2 = 742.5`，pill 中心 `671+144/2 = 743`（第 1 页）；第 2 / 3 页容器宽 221 / 212 亦居中；目视四帧同轴居中 |
| 无 overlap | 成立。容器 `bottom = 943`，pill `top = 950`（间隙 7px）；目视无遮挡 pill 文本与两侧翻页按钮 |
| 零占位 | 成立。`r12-2-no-outline-degrade.png` 整帧无章节行、无空壳、无半截控件、无残留间距；pill 位置与带控件帧逐像素一致（`delta` 全 0） |
| 无截断 | 成立。三帧 chip 文本完整（`1. Abstract · 第 1 页` / `2. Method Overview · 第 2 页` / `2.2 Positional prior · 第 3 页`），未触发 `max-width: 360px` 省略号 |
| 禁用态可辨识 | 成立。第 1 页左双箭头呈浅灰（`disabled`）、第 3 页右双箭头呈浅灰；可点侧为实色，两侧均在位、不塌陷 |
| 非预期差异 | 无。三帧内左栏文档 chip、右栏缩放控件、底部 pill 的版式与位置一致，未见重叠 / 遮挡 / 抖动 |

## T6 PRD-V0.5 §7.2 与 N77–N81 逐条核对

### PRD §7 成功判据 2（结构语义贯通，逐句）

| 判据句 | 状态 | 判据证据 |
| --- | --- | --- |
| 阅读器能看出当前章节 | 已实现 + 有判据 | 实现 `PdfViewer.vue:70-78`（3 个 computed）+ `:949-972`（`.reader-section` 模板块）；判据 `r12-1` 5 条（三页 chip 逐字 / 禁用态 / 实时一致 / page-input）+ `r12-2` 2 条 + 4 张截图 + 本次目视 |
| `<reading_context>` 可解析时含 section | 已实现 + 有判据 | 实现 `reading-context.ts:89-91`；判据 `r12-section-context#with-section`（第 5 行、位置、逐字节）+ 烟测 `section-format` #2 / #3 / #4 |
| 不可解析时逐字节等于旧格式 | 已实现 + 有判据 | 同上文件（不可解析时一行都不 push）；判据 `r12-section-context#without-outline`（`exact=true`，与手工重建旧格式 `===`）+ 烟测 `section-format` #1 |
| 上一节 / 下一节可用且与翻页互不干扰 | 已实现 + 有判据 | 实现 `PdfViewer.vue:331-336`（唯一写入点 `:334`）+ `:403-412`；判据 `r12-3` 7 条（含真实后退一页、末节禁用、快捷键与按钮同目标、输入框 / 框选守卫）+ 烟测 `section-nav` 8 条；既有七键位与 Esc 场景零缺失 |
| 地图、阅读器、AI 三处同一份派生 | 已实现 + 有判据 | 唯一派生 `outline-notes.ts`（三签名 `:136/:145/:166`）；消费点 `PdfViewer.vue:72/74/77`、`reading-context.ts:90`、既有 `KnowledgeMap.vue:48`；判据 烟测 `section-hit#8`（同一对象引用）+ `r12-1#invariance` 的 `currentLabels` 交叉（含 chip 标题 `2.2 Positional prior` 与逆序书签 `Appendix B`）+ T1#9 反向 grep |

### N77–N81 逐条

| 需求 | 已实现 | 有判据（本次实跑读数） |
| --- | --- | --- |
| N77-1 唯一实现与签名 | 是（3 个新导出，既有 3 个函数零 diff，5 个 `^export function`，无新依赖 / 无 `any`） | 烟测 `section-hit` 8 条全绿；反向 grep 命中 ⊆ 允许集合；`CHECK_EXIT=0` |
| N77-2 命中规则（同 `start` 取预序最早） | 是 | `section-hit` #2 / #3 / #7（第 2 页 `2. Method Overview`、第 3 页 `2.2 Positional prior`、逆序书签不劫持）；`r12-1` 三页 chip 逐字 |
| N77-3 六种不可解析 + 总不变量 | 是 | `section-null` 8 条（含 `pageCount=0` / `page=0` / `-3` / 越界 / `1.5` / 早于第一节 / `ranges.size=0`）+ `section-hit#4` 逐页不变量 |
| N78-1 控件与字面 | 是（类名 / `title` / 图标 / 顺序逐字，`v-if` 门控三态） | `r12-1` ①②③ + 目视三帧；`.page-label` 仍 `第 1 / 3 页` |
| N78-2 实时一致 | 是（全部来自 computed，无 `ref` 缓存；`reader-store.ts` 零 diff） | `r12-1` `page-2` / `page-3` / `invariance`（5 次读数相等、缩放往返、面板开关）/ `page-input` |
| N78-3 零占位 / 不截断 / 不位移 / 不重叠 | 是 | `r12-2` 两条（容器不在 DOM、四选择器 `delta` 全 0、`title === textContent` 由 `sectionProbe` 逐字相等覆盖、容器宽 < viewer 宽、`pointer-events` 三值）+ 目视 |
| N79-1 两个按钮 | 是（`disabled ⇔ 目标 === null`，跳转复用唯一通道） | `r12-3` next-jump / next-last-disabled / prev-jump；烟测 `section-nav#1/#2/#3` |
| N79-2 快捷键与冲突规则（6 条） | 是（`:403` 分支落点正确、无第二处监听、`captureMode` 自检为新增规则） | `r12-3` shortcut-next / shortcut-prev / guard-editable（INPUT + TEXTAREA）/ guard-capture；T1#8 走查 |
| N79-3 边界与确定目标 | 是 | 烟测 `section-nav#6/#7/#8`（单节禁用、早于第一节给确定目标、域外皆 `null`）；`r12-3` 落页读数 |
| N80-1 契约字段 | 是（必填 `outline: ReaderOutlineNode[]`，`ChatPanel.vue` 单行接线） | `CHECK_EXIT=0`（漏传即编译期报错；`outline?` / `?? []` 零命中）+ `r12-4` 两相位 |
| N80-2 格式与位置 | 是 | `r12-section-context#with-section`（第 5 行、`pageCount: 3 < section: < </reading_context>`、`sectionLine` 逐字）；烟测 `section-format#3` |
| N80-3 不可解析零字节差 | 是 | `r12-section-context#without-outline`（与手工重建的旧格式串 `===`）；烟测 `section-format#1` |
| N80-4 提示词补一句 | 是（`:6` 逐字、制表符缩进、单 hunk、既有 8 元素与 `join` 未动） | 走查（T1#5；该常量无运行期断言面，需求档已声明） |
| N81-1 `smoke-view.mjs`（新建 4 组 29 条） | 是（492 行、只写 `%TEMP%`、自清理；`package.json` 仅增 `scripts.smoke:view`） | 本次实跑 `通过 29 / 失败 0`、退出码 0；`%TEMP%` 零残留 |
| N81-2 离屏 4 场景 / 16 条 / 7 张 | 是 | 本次实跑 `UI_SHOT_FINAL_EXIT=0`、127 张、4 组 5/2/7/2、7 张齐备、T4 复算 0 失败 |
| N81-3 基线与零缺失 | 是 | 120 ⊆ 127（`missing=[]`）、37 ⊆ 41（`missingLabels=[]`）、169 → 185、`failure === null`；对比脚本 T3 |

## T7 未销账项（逐条给出性质、影响与归属）

| # | 项 | 性质 | 影响与归属 |
| --- | --- | --- | --- |
| 1 | R-B1 既有 `r11-3` 相位 4 入口（`selectPageSpan` 硬等待）的既有时间窗竞态 | 既有一行代码的竞态，**非本轮引入**；本次冷启动 1 次实跑未复现 | 不阻断本轮：`r12-*` 全部内联等待已按定稿加入，零缺失与新增判据均不受影响；是否另起一轮加固由负责人裁决 |
| 2 | R-B4 chip 省略号（> 360px）路径无截图证据 | 视觉分支仅由 CSS 逐字保证 | 本轮 7 张截图冻结、夹具最长 chip 实测 221px；需长标题夹具，属下一轮范围 |
| 3 | chip 悬停原生 tooltip 不弹（容器 / chip 继承 `pointer-events: none`） | 设计档已登记为可接受后果（只判 `chipText === chipTitle`） | 要 hover tooltip 需回改需求档 §0.5，非本轮缺陷 |
| 4 | D2 烟测编译面在 `%TEMP%` 补一份 ambient 声明（`window.pixApi`） | 需负责人确认的口径偏差；只写临时目录、随 `finally` 清理 | 不影响被测纯函数面；仓库零新增文件（本次已复核） |
| 5 | R1（`outline-notes.ts` 既有 `^export` 行号 +2）/ R2（未跟踪文件的 `git diff` 为空判据）/ R-B2（场景私有箭头函数）/ R-B3（`data` 字段只增不减） | 登记项，均非缺陷 | 复核通过，无需处置（R2 的正确证据是 sha256，B 面已记录） |
| 6 | `npm run build` / `npm test` / `npm run package` / `npm run dev` 未运行 | 派单明文禁止 | 本轮交付面为类型检查 + 烟测 + 离屏取证，不涉及打包链路 |
| 7 | 提交动作未执行 | 派单禁止任何 git 写命令 | 由负责人在流水线末端执行 |

**未销账 must-fix 数：0。** 评审档 C6 的唯一 must-fix（`outline` 必填契约）已由修复轮闭环，并在本次冷启动独立复验（T1#10）。

## T8 终验结论

| 项 | 读数 |
| --- | --- |
| `check` 退出码 | `0`（0 error） |
| 烟测 | `smoke-view` 29/29（退出码 0）、`smoke-notes` 26/26（退出码 0） |
| 截图数 | 127（基线 120 零缺失 + 冻结新增 7 张齐备） |
| 断言数 | 新场景 16 条（4 组 5/2/7/2）全绿，独立复算 38 项 0 失败；烟测 29 + 26 条全绿 |
| 测量条数 | 185（基线 169 + 16），37 种 label 零缺失 |
| 目视结论 | chip 与 pill 同轴、无 overlap（间隙 7px）、零占位、无截断、禁用态可辨识、无非预期差异 |
| 未销账 must-fix | 0 |
| 是否可提交 | **可提交**（白名单内改动齐备、范围外零外溢、工程门与全部判据绿）；git 写命令由负责人执行 |

