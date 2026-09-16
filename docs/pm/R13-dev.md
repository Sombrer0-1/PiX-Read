# PiX-Read R13 开发档 · A 面（契约与数据面：N82 / N84 / N85 / N86-1）

> 上游：`docs/pm/R13-req.md`（需求 N82–N86 + §0 定稿修订 M1–M6）、`docs/pm/R13-design.md`（设计档 + 定稿修订 D-1…D-9 / S-d1…S-d9）、`docs/pm/R13-review.md`、`docs/pm/R12-dev.md`（范式与基线读数 127 / 185 / 41）。
> 本档**只记录 A 面**（契约与数据面）的交付：`pix/src/shared/types.ts`、`pix/src/main/notes-store.ts`、`pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`、`pix/scripts/smoke-notes.mjs`、本档。
> B 面（`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue`、`pix/scripts/ui-shot.mjs`）不在本档、也不在本轮 A 面改动内；按设计档 §7.1 的分工，这三份文件由 B 面负责（A 面**未触碰**）。
> 本档只记录**真实文件内容与真实命令输出**；所有命令于 2026-09-16 在 `E:/develop/PiX-Read`（Windows + git bash，`PATH="/c/Program Files/nodejs:$PATH"`）实跑，无一条手工构造。
> 全程未运行 git 写命令、未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`，未改 `packages/**`、未增删依赖、未改 `package-lock.json`、未跑离屏（离屏属 B 面验收面）。
> 结论：**`npm run check` 0 error（动工前 / 落地后各一次）；`smoke:notes` 连续两次「通过 44 / 失败 0」、退出码 0（既有 26 条 + 新增 18 条）；`smoke:view`「通过 29 / 失败 0」、退出码 0；失败注入抽样 ①/② 各自按预期恰 3 / 2 处变红（`通过 41 / 失败 3`、`通过 42 / 失败 2`，退出码 1），脚本已按 sha256 证明还原；白名单外零改动。**
> **1 条偏差（D1：设计档 §5.1.1 的手写期望串漏了 `### 第 N 页` 之后的空行，与冻结的 `renderMarkdownEntry` 的真实输出不一致；已按真实输出写期望串）与 6 条登记项（R1–R6）需负责人确认**；其余逐条按设计档落地。

---

## 1. 交付摘要（数字先给）

| 项 | 数值 | 来源 |
| --- | --- | --- |
| `cd pix && npm run check`（动工前） | `CHECK_EXIT=0` | §4.1 |
| `cd pix && npm run check`（A 面落地后） | `CHECK_EXIT=0` | §4.2 |
| `smoke:notes` 连续两次（落地后终态） | `通过 44 / 失败 0`、退出码 0（两次一致） | §4.2 |
| `smoke:notes` 组构成 | 既有 4 组 26 条（`8/8/6/4`）+ 新增 3 组 18 条（`report-render:7` / `report-files:5` / `report-failures:6`） | §5 |
| `smoke:view` 回归（零改动文件） | `通过 29 / 失败 0`、退出码 0（`8/8/8/5`） | §4.3 |
| 失败注入抽样 ①（期望串首行改错） | `INJECT1_EXIT=1`、`通过 41 / 失败 3`（恰 `report-render #1` / `report-files #3` / `report-failures #4`） | §4.4 |
| 失败注入抽样 ②（期望串 `文档：` 段改错） | `INJECT2_EXIT=1`、`通过 42 / 失败 2`（恰 `report-files #2` / `report-failures #4`；`report-render` 组不受影响） | §4.4 |
| 抽样还原 | 脚本 sha256 三点一致（注入前 = 两次还原后 = `bc81b0c7337806cd125e0b11ac9ee936e136ea8290a6eb5a2131f365c8fc2cae`） | §4.4 |
| 基线交叉核对（R12 交付目录，只读） | `{"shots":127,"failure":null,"measurements":185,"labels":41}` | §2 |
| `%TEMP%` 残留 | `ls -d "$TEMP"/pix-smoke-notes-*` 与 `ls -d "$TEMP"/pix-r13-*` 均 0 项 | §4.7 |
| 白名单外改动 | 0（`git status --short` 只列白名单 5 个 `M` + 既有未跟踪文档） | §9 |

改动文件（5 个源码/脚本 + 1 个新建文档，全部在白名单内；`git diff --numstat` 实测）：

| 文件 | 动作 | 规模（`numstat`：+ / −） | 对应需求 |
| --- | --- | --- | --- |
| `pix/src/shared/types.ts` | 修改 | `25 / 0`（纯新增，三接口） | N84-2 / N84-4 |
| `pix/src/main/notes-store.ts` | 修改 | `111 / 2`（2 处 `−` = import 行与 `notesPaths()` 返回行的既有字面被扩写） | N82 / N84 / N85 |
| `pix/src/main/ipc-handlers.ts` | 修改 | `50 / 1`（1 处 `−` = 既有 import 行加入 `exportDocumentReport`） | N84-1 / N84-3 |
| `pix/src/main/preload.ts` | 修改 | `5 / 0`（接口 + 实现各 1 行 + import 两个类型名） | N84-1 |
| `pix/scripts/smoke-notes.mjs` | 修改 | `448 / 0`（**纯追加**：既有 26 条与输出协议零改动） | N86-1 |
| `docs/pm/R13-dev.md` | **新建** | 本档 | —— |

---

## 2. 基线（动工前读数，全部为本次实跑）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"                 # ⇒ 0
cd pix && PATH="/c/Program Files/nodejs:$PATH" node scripts/smoke-notes.mjs | tail -1              # ⇒ 通过 26 / 失败 0
node -e "…读取 C:/Users/86157/AppData/Local/Temp/pix-v05-r12-final/shots/{MANIFEST,MEASUREMENTS}.json…"
```

```text
CHECK_EXIT=0
通过 26 / 失败 0
{"shots":127,"failure":null,"measurements":185,"labels":41}
```

⇒ 与设计档 §0.1 / §5.4 步骤 0b 的冻结读数**逐字一致**（127 张 / 185 条 / 41 种 label / `failure === null`）；A 面不改 `ui-shot.mjs`、不跑离屏（离屏为 B 面验收面），该基线在本档只作交叉核对。

---

## 3. 改动清单（文件 + 具体改动）

### 3.1 `pix/src/shared/types.ts`（+25 / −0，纯新增）

| 位置（改后行号） | 内容 |
| --- | --- |
| `:409-415` | `export interface ReaderNotesReportChapter { title; start; end; label }`（逐字按设计档 §1.1.2） |
| `:417-422` | `export interface ReaderNotesReportInput { docFilePath; chapters; progress }`（`progress` 必填、可 `null`，无默认值） |
| `:424-432` | `export interface ReaderNotesReportResult { success; filePath?; displayPath?; count?; code?; error? }` |

落点 = 紧接 `ReaderNotesExportResult`（`:401-407`）、紧接 `ReaderNotesResetResult`（`:434-441`）之前，三接口连续放置（设计档 §1.1.2「落点」行）。
不变量：`ReaderNotesErrorCode` **未扩**（实测 `awk '/^export type ReaderNotesErrorCode =/,/;$/' pix/src/shared/types.ts | grep -c '| "'` ⇒ **11**）；既有类型零 diff；无 `any`。

### 3.2 `pix/src/main/notes-store.ts`（+111 / −2）

| 位置（改后行号） | 内容 |
| --- | --- |
| `:13` | 既有 import 行追加 `isPathInsideDirectory`（同一行，来自既有的 `./library-root.js`） |
| `:23-25` | 既有 `import type` 列表加入 `ReaderNotesReportChapter` / `ReaderNotesReportInput` / `ReaderNotesReportResult` |
| `:32` | `const REPORTS_DIR_NAME = "reports";`（紧接 `NOTES_MARKDOWN_NAME`） |
| `:33-35` | `REPORT_EMPTY_MESSAGE = "当前文档暂无笔记，未生成报告"` / `REPORT_WRITE_FAILED_MESSAGE = "报告写入失败"`（注释一行：错误码复用既有码表，文案按调用点写死） |
| `:68-72` | `interface NotesPaths` 增 `reports: string;` |
| `:78-87` | `notesPaths()` 返回值扩为 `{ file, markdown, reports }`，`reports = join(join(root, NOTES_DIR_NAME), REPORTS_DIR_NAME)`（`file` / `markdown` 两行的字面逐字不动） |
| `:298-301` | `function sortReportEntries(entries: ReaderNote[]): ReaderNote[]`（三键：`page` → `createdAt` → `id.localeCompare`） |
| `:303-306` | `function reportChapterTitle(title: string): string`（`normalizeNoteText(title) \|\| "未命名"`） |
| `:308-343` | `function reportBlocks(entries, chapters): string[]`（闭区间归组谓词 `:332` 是本文件唯一的 `start <= … && … <= end`；空组不渲染；兜底组恒最后；`chapters === []` 退化为按页分组） |
| `:345-361` | `function renderDocumentReport(entries, docPath, name, chapters, progress, now): string`（唯一非确定性输入 = `now`） |
| `:498-523` | `export function exportDocumentReport(input): ReaderNotesReportResult`（判定顺序：`no-root` → `outside`（相对化）→ `outside`（`isPathInsideDirectory` 复核）→ 读取失败码 → `empty` → 渲染 → `write-failed`；成功回传 `filePath` / `displayPath` / `count`） |

不变量（逐条实测见 §4.6）：`renderNotesMarkdown` / `renderMarkdownEntry` / `exportNotesMarkdown` / `resetCorruptNotes` / 既有常量零 diff（`git diff` 的 `−` 侧只有 §3.2 首两行）；`writeFileAtomic` 调用点 7 ⇒ 8（增量恰 1，函数体零 diff）；主进程不 import outline 相关模块（`grep -rn "buildChapterRanges\|ReaderOutlineNode" pix/src/main` = 0）；无 `any`、无内联动态 import。

### 3.3 `pix/src/main/ipc-handlers.ts`（+50 / −1）

| 位置（改后行号） | 内容 |
| --- | --- |
| `:21` | 既有 import 行追加 `exportDocumentReport`（字母序插在 `deleteNote` 与 `exportNotesMarkdown` 之间） |
| `:30-32` | 既有 `import type` 列表加入三个报告类型 |
| `:259-273` | `function isReportChapter(value: unknown): value is ReaderNotesReportChapter`（`title` 字符串；`label` 非空字符串；`start` / `end` 为整数且 `≥ 1`；**不要求 `start ≤ end`**） |
| `:276-293` | `function isReaderNotesReportInput(value: unknown): value is ReaderNotesReportInput`（**唯一守卫**；`progress === null` 与合法整数对是仅有的两种合法态；只 `typeof` / `Array.isArray` / `Number.isInteger`，不做 I/O、不抛错） |
| `:295` | `const REPORT_INVALID_MESSAGE = "报告参数不合法";`（全文件唯一一处字面） |
| `:297-299` | `function invalidReportInput(): ReaderNotesReportResult` ⇒ `{ success: false, code: "invalid-input", error: REPORT_INVALID_MESSAGE }`，**零写盘** |
| `:529-531` | `ipcMain.handle("notes-export-report", (_event, input: unknown) => (isReaderNotesReportInput(input) ? exportDocumentReport(input) : invalidReportInput()));`，落点 = `notes-reset` 之后、`Reader state` 分节注释之前 |

不变量：既有 7 个笔记 handler 与 `invalidNotesInput()` 零 diff；§1.1.1 的 handler 形状逐字一致（仅按项目 3 行排版换行，无多余语句）。

### 3.4 `pix/src/main/preload.ts`（+5 / −0）

| 位置（改后行号） | 内容 |
| --- | --- |
| `:23-24` | 既有 `import type` 列表加入 `ReaderNotesReportInput` / `ReaderNotesReportResult` |
| `:77` | `PixApi` 接口：`notesExportReport: (input: ReaderNotesReportInput) => Promise<ReaderNotesReportResult>;`（紧接 `notesExport`） |
| `:167-168` | `api` 实现：`notesExportReport: (input: ReaderNotesReportInput) => ipcRenderer.invoke("notes-export-report", input) as Promise<ReaderNotesReportResult>,`（紧接 `notesExport`） |

不变量：既有 40 个方法逐字不动（改后 `PixApi` = 41、`api` = 41）；无内联动态 import、无 `any`。渲染层三个 store 都 `import type { PixApi } from "../../main/preload"`（`useRpc.ts:15` / `stores/notes-store.ts:13` / `stores/reader-state-store.ts:19`）⇒ B 面的 `bridge().notesExportReport(...)` 自动获得类型，无需 A 面接线。

### 3.5 `pix/scripts/smoke-notes.mjs`（+448 / −0，**纯追加**）

| 位置（改后行号） | 内容 |
| --- | --- |
| `:39-58` | 新常量：`DOC_ARCHIVE` / `REPORTS_A` / `REPORTS_ARCHIVE_A` / `REPORT_A` / `REPORT_ARCHIVE_A` / `REPORT_COMMENT` / `ARCHIVE_TEXT` / `OUT_OF_RANGE_TEXT` / `STAMP_RE` / `normalizeStamp` / `SAMPLE_CHAPTERS`（3 项手写章节）/ `PROGRESS_3` / `REPORT_STAMP_STEP_MS` |
| `:108-129` | `function seedReportNotes(docPath)`（清 `notes.json` 与 `reports` ⇒ 3 条夹具 ⇒ 成功后按文件序钉住 `createdAt` / `updatedAt`，步长 `REPORT_STAMP_STEP_MS`；D-4 口径） |
| `:132-158` | `function expectedRenderA()`（手写期望串） |
| `:160-173` | `function expectedArchiveA()`（手写期望串） |
| `:560-683` | `function runReportRender()`（7 条） |
| `:685-789` | `function runReportFiles()`（5 条） |
| `:791-916` | `function runReportFailures()`（6 条） |
| `main()` | 追加三行调用：`runReportRender(); runReportFiles(); runReportFailures();`（调用序逐字按设计档 §5.1） |

不变量：`git diff -- pix/scripts/smoke-notes.mjs | grep -E "^[-]" | grep -v "^---"` **无输出**（**零删除、零改写**）；既有 4 组 26 条与输出协议（`== 组 … ==` / `[通过]` / `[失败] …：<实际值>` / 末行 `通过 {passed} / 失败 {failed}`）零改动；期望值全部手写（`SAMPLE_CHAPTERS` 与两条期望串都不经被测函数生成）；脚本只读仓库源文件、只写 `%TEMP%`。

### 3.6 `docs/pm/R13-dev.md`（本档，新建）

---

## 4. 真实命令与关键输出

### 4.1 动工前唯一工程门 + 基线

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
cd pix && PATH="/c/Program Files/nodejs:$PATH" node scripts/smoke-notes.mjs | tail -1
node -e "…MANIFEST/MEASUREMENTS…"
```

```text
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
CHECK_EXIT=0
通过 26 / 失败 0
{"shots":127,"failure":null,"measurements":185,"labels":41}
```

### 4.2 唯一工程门（A 面落地后）+ 烟测连续两次

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
cd pix && PATH="/c/Program Files/nodejs:$PATH" node scripts/smoke-notes.mjs | tail -1; echo "RUN1_EXIT=$?"
cd pix && PATH="/c/Program Files/nodejs:$PATH" node scripts/smoke-notes.mjs | tail -1; echo "RUN2_EXIT=$?"
```

```text
CHECK_EXIT=0
通过 44 / 失败 0
RUN1_EXIT=0
通过 44 / 失败 0
RUN2_EXIT=0
```

组构成（程序化计数，取自本次 RUN1 的完整日志）：`undo-roundtrip 8` / `undo-failures 8` / `undo-slot-lifecycle 6` / `export-and-empty 4` / `report-render 7` / `report-files 5` / `report-failures 6` = **44**（既有 26 + 新增 18，逐条文本见 §5）。

### 4.3 渲染层纯函数回归（零改动文件）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" node scripts/smoke-view.mjs | tail -1; echo "SMOKE_VIEW_EXIT=$?"
```

```text
通过 29 / 失败 0
SMOKE_VIEW_EXIT=0
```

组构成：`section-hit 8` / `section-null 8` / `section-nav 8` / `section-format 5` = 29（与 R12 交付读数一致，零改动）。

### 4.4 失败注入抽样（设计档 §5.1.5 两项；改前先备份、改后按 sha256 还原）

**脚本 sha256（注入前 = 两次还原后）**：`bc81b0c7337806cd125e0b11ac9ee936e136ea8290a6eb5a2131f365c8fc2cae`（`sha256sum -c` 两次输出 `scripts/smoke-notes.mjs: OK`）。

**注入 ①**：`expectedRenderA()` 第 1 行 `"# 阅读报告 · sample-paper.pdf",` ⇒ `"# 阅读报告 · sample-paper",`（`diff` 确认只此 1 行变化）。

```text
INJECT1_EXIT=1
[失败] report-render #1 …：{"result":{…"success":true…},"stampHits":1,"stampValue":"2026-09-16 21:45:19","text":"# 阅读报告 · sample-paper.pdf\n\n> 由 PiX-Read 生成…"}
[失败] report-files #3 幂等覆盖：…：{"first":true,"second":true,"same":true,"text":"# 阅读报告 · sample-paper.pdf\n…"}
[失败] report-failures #4 写失败两条注入：…：{"baseline":true,"tmpBlocked":{"success":false,"code":"write-failed","error":"报告写入失败"},"reportBytesSame":true,"tmpRetry":{"success":true,"contentOk":false},"dirBlocked":{"success":false,"code":"write-failed","error":"报告写入失败"},"dirRetry":{"success":true,"contentOk":true}}
通过 41 / 失败 3
```

⇒ 与设计档 §5.1.5 ① 的预期**逐条一致**：依赖该期望串的三处变红（`report-render #1`、`report-files #3`、`report-failures #4` 的重试），`report-render` 的 #2–#7 与其余条目照常通过，退出码 1。

**注入 ②**：`expectedArchiveA()` 元信息行的 `文档：archive/older-paper.pdf` ⇒ `文档：older-paper.pdf`（`diff` 确认只此 1 行变化）。

```text
INJECT2_EXIT=1
[失败] report-files #2 子目录 + 无章节 + 无进度：…：{"sub":{…"success":true…},"text":"# 阅读报告 · older-paper.pdf\n\n> …；文档：archive/older-paper.pdf；生成时间：<STAMP>；共 1 条（摘录 1 · AI 结论 0）。\n\n## 第 7 页（1 条）\n\n### 第 7 页\n\n> Archive excerpt for the subdirectory report.\n"}
[失败] report-failures #4 写失败两条注入：…：{…"dirRetry":{"success":true,"contentOk":false}}
通过 42 / 失败 2
```

⇒ 与设计档 §5.1.5 ② 的预期**逐条一致**：恰两处变红（`report-files #2` 与 `report-failures #4` 的重试），**`report-render` 组不受影响**（错误隔离可见），退出码 1。

**还原**：两次注入后各以备份覆盖回写，`sha256sum -c` 两次 `OK`，备份文件随即从 `%TEMP%` 删除；注入改动**零残留**（`git status --short` 只见白名单，见 §9）。

### 4.5 现场复核：`### 第 N 页` 之后的空行（D1 的证据）

设计档 §5.1.1 的手写期望串把条目标题与引用行写成相邻两行（`"### 第 1 页"` 紧跟 `` `> ${TEXT_A1}` ``）；而冻结的 `renderMarkdownEntry`（`notes-store.ts:265-273`，`git diff` 零 diff）产出的 `lines = [title, "", ...]` 含一个空行。本轮用 `%TEMP%` 一次性探针（编译 `notes-store.ts` + `library-root.ts` 后实调 `exportNotesMarkdown()` 与 `exportDocumentReport()`，脚本与临时目录均已删除）取真实字节：

```json
"# 阅读笔记 · ws\n\n> 由 PiX-Read 导出生成…\n\n## sample-paper.pdf（3 条）\n\n### 第 1 页\n\n> We study retrieval.\n\n备注：与第 3 节消融实验对照\n\n---\n\n### 第 2 页\n\n> Table 2 reports.\n…"
"# 阅读报告 · sample-paper.pdf\n\n> 由 PiX-Read 生成，每次导出都会覆盖。资料库：ws；文档：sample-paper.pdf；生成时间：2026-09-16 21:42:37；阅读进度：第 1 / 3 页；共 3 条（摘录 2 · AI 结论 1）。\n\n## 1. Abstract · 第 1 页（1 条）\n\n### 第 1 页\n\n> We study retrieval.\n\n备注：与第 3 节消融实验对照\n\n## 2. Method Overview · 第 2 页（2 条）\n\n### 第 2 页\n\n> Table 2 reports.\n\n---\n\n### 第 2 页 · AI 结论\n\n> 结论：稀疏注意力。\n"
```

⇒ 真实输出 = `标题` → **空行** → `> 正文`；这与设计档 §1.5.3 的字段表「`### 第 {page} 页` → **空行** → 正文逐行加 `> `」以及需求档 §0.3 的同句描述一致，与两份档的**示例块**（无空行）不一致。§5.1.1 的手写期望串按**真实输出**落地（见 D1）。

### 4.6 走查（A 面适用条目，逐条实测）

| # | 命令 | 实测输出 / 计数 | 期望 |
| --- | --- | --- | --- |
| 1 | `grep -n "start <= \|<= chapter.end\|rangeContains" pix/src/main/notes-store.ts` | `332:    const index = chapters.findIndex((chapter) => chapter.start <= note.page && note.page <= chapter.end);` | 恰 1 处 ✓ |
| 2 | `grep -rn "buildChapterRanges\|ReaderOutlineNode" pix/src/main \| wc -l` | `0` | 0 ✓ |
| 3 | `grep -c "writeFileAtomic(" pix/src/main/notes-store.ts` | `8` | 改前 7 ⇒ 改后 8 ✓ |
| 4 | `grep -c "报告参数不合法" pix/src/main/ipc-handlers.ts` / `grep -c "function isReaderNotesReportInput" …` | `1` / `1` | 各 1 ✓ |
| 5 | `grep -rn "notes-export-report" pix/src` | `ipc-handlers.ts:529`（`ipcMain.handle`）+ `preload.ts:168`（`ipcRenderer.invoke`） | 恰 2 处、通道名逐字 ✓ |
| 6 | `grep -c "### 第 " pix/src/main/notes-store.ts` | `1` | 改前 1 ⇒ 改后 1（新增 0 处 `### ` 标题）✓ |
| 7 | `grep -n "Date.now()" pix/src/main/notes-store.ts` | `:400` / `:425` / `:488` / `:515`（报告路径 = `renderDocumentReport` 的 `now` 实参）/ `:537` | 报告路径只新增 1 处 ✓ |
| 8 | `grep -rn "reports" pix/src` | `notes-store.ts:32`（常量）/ `:71`（字段）/ `:85`（派生）/ `:504` / `:506`（目标与复核）/ `types.ts:424`（`displayPath` 注释） | 命中集合 ⊆ 主进程路径常量与模板 + `types.ts` 注释 ✓ |
| 9 | `grep -rc "reports" pix/src/renderer` | 全 `0`（无输出行） | 渲染层零命中 ✓ |
| 10 | `grep -rn "当前文档暂无笔记，未生成报告" pix/src` | `notes-store.ts:34`（1 处，A 面侧） | A 面恰 1 处（第 2 处由 B 面面板补，设计档 §1.8 #15 = 2）✓ |
| 11 | `grep -rn "报告写入失败" pix/src` | `notes-store.ts:35`（1 处） | 恰 1 处 ✓ |
| 12 | `grep -n "toLowerCase" pix/src/main/notes-store.ts pix/src/main/library-root.ts` | `notes-store.ts:112`（`docPathKey`）/ `library-root.ts:35`（`normalizeFsPath`） | 恰 2 处、无第三处大小写变换 ✓ |
| 13 | `grep -c "normalizeNoteText" pix/src/main/notes-store.ts` | `3` | 改前 2 ⇒ 改后 3（`reportChapterTitle` 一处）✓ |
| 14 | `git diff -- pix/src/main/notes-store.ts \| grep -E "^[-]" \| grep -v "^---"` | 仅 2 行（import 行、`notesPaths()` 返回行） | 既有函数体零删除 ✓ |
| 15 | `grep -nE "\bany\b\|await import\|import\(" pix/src/main/notes-store.ts pix/src/main/ipc-handlers.ts pix/src/main/preload.ts pix/src/shared/types.ts` | 唯一命中 = `ipc-handlers.ts:186` 的英文注释句（`any absolute path on disk`），非类型用法 | 无 `any`、无内联动态 import ✓ |
| 16 | `git diff --numstat` | `448/0`、`50/1`、`111/2`、`5/0`、`25/0`（共 5 个文件，+639 / −3） | 与 §1 表一致 ✓ |
| 17 | `awk '/^export type ReaderNotesErrorCode =/,/;$/' pix/src/shared/types.ts \| grep -c '\| "'` | `11` | 错误码表未扩（仍 11 键）✓ |
| 18 | `git diff --stat -- pix/src/renderer pix/package.json package-lock.json packages pix/tsconfig*.json pix/vite.config.ts README.md .gitignore pix/scripts/ui-shot.mjs pix/scripts/smoke-view.mjs` | 空 | 这些路径全部零 diff ✓ |
| 19 | `grep -c "notesExportReport" pix/src/main/preload.ts` | `2` | 设计档 §1.8 #12：接口 + 实现各 1 ✓ |
| 20 | `grep -rn "docDisplayName(currentDocKey)" pix/src/renderer \| wc -l` | `0` | 设计档 §1.8 #10（B 面落地后仍须为 0；当前渲染层未接线）✓ |

### 4.7 零残留

```bash
ls -d "$TEMP"/pix-smoke-notes-* 2>/dev/null | wc -l     # ⇒ 0（脚本 finally 内自清理）
ls -d "$TEMP"/pix-r13-* 2>/dev/null | wc -l             # ⇒ 0（一次性探针目录已删除）
git status --short                                      # ⇒ 见 §9
```

---

## 5. 断言清单（新增 3 组 18 条，逐条为本次实跑的 `[通过]` 文本）

### 组 `report-render`（7 条）

```text
[通过] report-render #1 3 条 + 三章入参 + 进度 ⇒ 成功且全文（时间戳归一化）逐字节等于手写期望串；生成时间段恰 1 次且形如 YYYY-MM-DD HH:mm:ss
[通过] report-render #2 头部逐字段：第 1 行逐字；元信息行含 资料库：ws-a / 文档：sample-paper.pdf / 阅读进度：第 1 / 3 页 / 共 3 条（摘录 2 · AI 结论 1）
[通过] report-render #3 空组不渲染：无 2.2 Positional prior；^## 行恰 2 条且逐字为两个章节组标题
[通过] report-render #4 兜底组：p9 笔记 ⇒ ^## 最后一条逐字「未归入章节（1 条）」；正文出现恰 1 次；统计 共 4 条（摘录 3 · AI 结论 1）；既有两个组不变
[通过] report-render #5 chapters: [] ⇒ ^## 行集合逐字为两个按页组（页升序）；全文不含「未归入章节」、不含「 · 第 」
[通过] report-render #6 条目与分隔：同页先摘录后结论；`### 第 2 页` / `### 第 2 页 · AI 结论` 各 1 次；恰 1 处空行分隔线；末尾恰一个换行；无行尾空格
[通过] report-render #7 倒序范围不拒绝：追加 {start:5,end:3} ⇒ success（不是 invalid-input）、无「## Beyond」、^## 行与 #3 逐字相同
```

### 组 `report-files`（5 条）

```text
[通过] report-files #1 返回面：filePath 逐字等于 REPORT_A（relative 为 sample-paper.pdf.md）+ displayPath 逐字 + count === 3
[通过] report-files #2 子目录 + 无章节 + 无进度：displayPath 逐字、reports/archive 被创建、全文逐字节、元信息行不含阅读进度
[通过] report-files #3 幂等覆盖：预置垃圾内容 ⇒ 两次导出都成功、内容逐字节等于期望、不含 STALE-CONTENT、两次归一化内容互等
[通过] report-files #4 零副作用：notes.json / notes.md 哈希不变；.pix-read 顶级条目差恰为新增 [reports]
[通过] report-files #5 目录可删：删 reports 后 loadNotes / addNote（另一文档）/ exportNotesMarkdown / 报告导出全部成功，重建内容与 #1 首次逐字节相同
```

### 组 `report-failures`（6 条）

```text
[通过] report-failures #1 无工作区根 ⇒ no-root + 逐字「尚未选择资料库根目录」+ 零写盘（reports 不存在）
[通过] report-failures #2 库外绝对路径 ⇒ outside + 逐字「该文档不在当前资料库内」+ reports 未新增条目
[通过] report-failures #3 该文档 0 条 ⇒ empty + 逐字「当前文档暂无笔记，未生成报告」+ 目录未被创建
[通过] report-failures #4 写失败两条注入：<报告>.tmp 预置为目录 / 目标父级预置为同名文件 ⇒ 均 write-failed + 逐字「报告写入失败」；既有报告字节不变；清理后重试成功且内容正确
[通过] report-failures #5 损坏库 ⇒ corrupt + 逐字「笔记文件无法读取（文件已损坏，未被修改）」+ notes.json 字节不变 + 既有报告与目录条目集合均不变
[通过] report-failures #6 版本不支持 ⇒ version-unsupported + 逐字「笔记文件版本不支持」+ notes.json 字节不变 + 零写盘
```

---

## 6. 接口冻结（A 提供、B 消费；逐字可依赖）

| 项 | 冻结值（本次落地值） | 落点 |
| --- | --- | --- |
| 通道名 | `notes-export-report` | `ipc-handlers.ts:529` / `preload.ts:168` |
| preload 方法 | `notesExportReport(input: ReaderNotesReportInput): Promise<ReaderNotesReportResult>` | `preload.ts:77`（接口）/ `:167`（实现） |
| 入参形状 | `{ docFilePath: string; chapters: { title; start; end; label }[]; progress: { page; pageCount } \| null }` | `types.ts:410-422` |
| 返回面六情形 | 成功 `{ success: true, filePath, displayPath, count }`；`no-root` / `outside` / `empty` / `corrupt` / `version-unsupported` / `read-failed` / `write-failed`（后三者沿用既有码与既有文案） | `notes-store.ts:498-523` |
| 三条专有文案 | `报告参数不合法`（守卫，`ipc-handlers.ts:295`）/ `当前文档暂无笔记，未生成报告`（`notes-store.ts:34`）/ `报告写入失败`（`notes-store.ts:35`） | —— |
| `displayPath` | `.pix-read/reports/<docPath>.md`（`<docPath>` = `toRelativeDocPath` 产出：正斜杠、保原大小写） | `notes-store.ts:521` |
| 目标路径 | `<工作区根>/.pix-read/reports/<docPath>.md`（子目录完整复刻；`isPathInsideDirectory` 复核） | `notes-store.ts:504-508` |
| 渲染层契约（B 面） | 章节入参顺序 = `buildChapterRanges` 的 `Map` 插入序；`pageCount === 0` ⇒ `chapters = []` 且 `progress = null`；`displayPath` / `filePath` 一律取主进程回传值 | 设计档 §1.6.2（B 面落地） |

---

## 7. 偏差表（逐条登记 + 证据 + 处置）

### D1（需负责人确认）：设计档 §5.1.1 的手写期望串漏了 `### 第 N 页` 之后的空行

- **现象**：设计档 §5.1.1 的 `expectedRenderA()` / `expectedArchiveA()` 把条目标题与引用行写成相邻两行；本轮实测冻结的 `renderMarkdownEntry` 输出为 `标题` → 空行 → `> 正文`（§4.5 的真实字节）。
- **证据**：`notes-store.ts:265-273` 的 `const lines = [title, "", ...]`（`:268`，`git diff` 零 diff）；§4.5 的一次性探针实调输出的 JSON 逐字；需求档 §0.3 的字段表与设计档 §1.5.3 的「条目」行也都写「`### 第 {page} 页` → **空行** → 正文」（即档内自身与示例块不一致）。
- **处置**：两条手写期望串按**真实输出**落地（在 `### 第 N 页` / `### 第 N 页 · AI 结论` 之后各加一个空行），其余逐字从设计档。若负责人裁定以设计档示例块为准，则须同时改 `renderMarkdownEntry`（**违反 R10 冻结面，本轮不允许**）⇒ 本偏差按「文档示例块笔误」处理，不回改代码。
- **影响面**：仅 §5.1.1 的两条期望串；`report-render` #1/#6、`report-files` #2/#3、`report-failures` #4 的判据文本与设计档逐字一致（只是期望串内容按真实输出）。`npm run smoke:notes` 44/0 全绿。

### R1（登记项）：`report-failures` #4② 必须先补 `DOC_ARCHIVE` 夹具（已按设计档 D-1 落地）

- 设计档 §5.1.4 #4② 已写明先 `addNote(draft(DOC_ARCHIVE, 7, ARCHIVE_TEXT))`；本组前置的 `seedReportNotes(DOC_A)` 会重写 `notes.json`，因此 `DOC_ARCHIVE` 在组内为 0 条 ⇒ 不补夹具必先命中 `empty`。落地值按设计档逐字；实测 #4 拿到的是 `write-failed`（§5）。

### R2（登记项）：`report-failures` #5 的「REPORT_A 哈希不变」以前序重试成功为前提

- #5 需要 `REPORT_A` 已存在才可判「既有报告字节不变」。落地顺序（#4① 重试成功 ⇒ 生成 `REPORT_A`；#4② 重试成功 ⇒ 生成 `REPORT_ARCHIVE_A`）已满足该前提；实测 #5 的目录条目集合 = `["archive","sample-paper.pdf.md"]` 且前后相等（§5）。

### R3（登记项）：§5.1.2 #6 的现场来源在设计档中未指名

- 设计档 #6 只给判据、未指明用哪一次导出的报告。落地：用 #5 现场（3 条夹具 + `chapters: []`）的报告；该现场满足 #6 的全部 6 项判据（同页先后、两条标题各 1 次、`\n\n---\n\n` 恰 1 处、末尾恰一个 `\n`、无行尾空格）。#4 现场的 4 条报告同样满足（分组不同不影响这 6 项）。

### R4（登记项）：`report-files` #4 的 `.pix-read` 快照不写死（沿用设计档 D-2 口径）

- 快照取自运行现场（含既有 `notes.json` / `notes.md` / `notes.json.corrupt-*` 备份），只比「集合差」。实测新增 = `["reports"]`、删除 = `[]`（§5）。

### R5（登记项）：`report-files` #5 的「与 #1 首次逐字节相同」用组内首导出的归一化文本比对

- 落地为 `text5 === text1`（同组内两次导出，均 `normalizeStamp`）；#5 期间对 `DOC_ARCHIVE` 新增的条目不属于 `sample-paper.pdf` ⇒ 不影响样本报告内容（设计档要求的「必须属于另一文档」已满足）。

### R6（登记项）：失败注入抽样的证据时点

- 两项抽样的最终证据（§4.4）在 A 面代码定稿后重跑一遍；其后 `notes-store.ts` 的 `reports` 派生表达式按设计档 §1.4.1 的逐字形态收敛为 `join(join(root, NOTES_DIR_NAME), REPORTS_DIR_NAME)`（语义等价、输出不变），收敛后复跑 `npm run check`（0）与 `smoke:notes`（44/0）确认，脚本 sha256 未变。

---

## 8. 未验证事项 / 未决项（逐条给原因与归属）

| # | 项 | 原因 / 归属 |
| --- | --- | --- |
| 1 | 离屏 5 场景 13 条 record / 8 张截图 / `SEL` 4 项 / stub 报告镜像 / `libraryShowInFolder` 记录 / `writeFixtures()` 的 reports 清理 | 全部在 `pix/scripts/ui-shot.mjs`（**B 面白名单**）；A 面不得触碰，本次未跑离屏 |
| 2 | 渲染层 store（`lastReport` / `currentDocNoteCount` / `reportScope` / `exportCurrentDocReport`）与面板（入口行、状态行、`onExportReport`） | `pix/src/renderer/**`（**B 面白名单**）；A 面未接线（`npm run check` 在 A 面落地后仍 0 error ⇒ 渲染层可编译，未因类型新增而破坏） |
| 3 | 走查 §1.8 #9 / #10 / #11 / #13 / #14 / #15（第 2 处）/ #19（`M` 八个文件的 B 面三份） | 依赖 B 面的 `notes-store.ts`（渲染层）与 `NotesPanel.vue`（#10 已测得 0 命中，B 面落地后仍须保持）；A 面可判的 #12（`preload.ts` 的 2 处）已实测，见 §4.6 #19 |
| 4 | M3 的 `docDisplayName(readerStore.filePath)` 保原大小写 | 渲染层动作（B 面）；夹具文件名全小写，只能由走查判定 |
| 5 | 「章节入参 = `buildChapterRanges` 产出」的 `payload` 相位 | 依赖 B 面的 store 映射 + stub 记账 |
| 6 | `npm run build` / `npm test` / `npm run package` / `npm run dev` | 派单禁令，未跑 |
| 7 | git 写命令（提交 / 暂存） | 派单禁令，未跑；提交由负责人完成（`git add <具体路径>`） |
| 8 | 设计档 §1.8 #21 的改前基数复核 | 已实测：`grep -c "normalizeNoteText"` = 3（改后）与设计档 §1.8 #21 的基数 2 一致 ⇒ 无偏差 |

---

## 9. 收尾核对（白名单 / 零 diff）

```bash
cd E:/develop/PiX-Read && git status --short
# ⇒  M pix/scripts/smoke-notes.mjs
#     M pix/src/main/ipc-handlers.ts
#     M pix/src/main/notes-store.ts
#     M pix/src/main/preload.ts
#     M pix/src/shared/types.ts
#    ?? docs/pm/R13-design.md      （既有未跟踪档，本轮未改）
#    ?? docs/pm/R13-req.md         （既有未跟踪档，本轮未改）
#    ?? docs/pm/R13-review.md      （既有未跟踪档，本轮未改）
#    ?? docs/pm/R13-dev.md         （本档，新建）

git diff --numstat
# ⇒ 448 0  pix/scripts/smoke-notes.mjs
#    50  1  pix/src/main/ipc-handlers.ts
#   111  2  pix/src/main/notes-store.ts
#     5  0  pix/src/main/preload.ts
#    25  0  pix/src/shared/types.ts
```

- A 面 5 个白名单文件 + 本档；B 面 3 个文件（`renderer/stores/notes-store.ts` / `workspace/NotesPanel.vue` / `scripts/ui-shot.mjs`）**零改动**（设计档 §1.8 #19 的「`M` 八个」在本步尚为 5 个，待 B 面补齐 3 个）。
- 范围外路径零 diff（§4.6 #18）：`pix/src/renderer/**`、`pix/package.json`、`package-lock.json`、`packages/**`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`README.md`、`.gitignore`、`pix/scripts/ui-shot.mjs`、`pix/scripts/smoke-view.mjs`。
- 未跑 git 写命令；临时目录与一次性探针零残留；未新增/升级依赖。

---

# PiX-Read R13 开发档 · B 面（UI 与离屏：N82 / N83 / N86-2）

> 上游：`docs/pm/R13-design.md`（§1.6 / §1.7 / §5.2 + 定稿修订 D-1…D-9 / S-d1…S-d9）、`docs/pm/R13-req.md`、`docs/pm/R13-review.md`、本档 A 面（`§6 接口冻结` 与 `D1`）、`docs/pm/R12-dev.md`（离屏范式与基线读数 127 / 185 / 41）。
> 本档只补 B 面：`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue`、`pix/scripts/ui-shot.mjs`，以及本档自身。A 面五个文件（`types.ts` / `main/notes-store.ts` / `main/ipc-handlers.ts` / `main/preload.ts` / `smoke-notes.mjs`）在 B 面落地期间**零改动**。
> 所有命令于 2026-09-16 在 `E:/develop/PiX-Read`（Windows + git bash，`PATH="/c/Program Files/nodejs:$PATH"`）实跑，结论只来自真实文件内容与真实命令输出；未跑 git 写命令、未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`、未改 `packages/**`、未增删依赖、未改 `package-lock.json`。
> 结论：**`npm run check` 0 error（4 次）；离屏 135 张 / 198 条测量 / 46 种 label、退出码 0 / `failure === null`、既有 127 张与既有 41 种 label 零缺失、新增 5 组 13 条 record 全绿、8 张新截图齐备且逐张目视通过；`smoke:notes` 连续两次 44/0、`smoke:view` 29/0；白名单外零改动。**
> **两项偏差（D-B1 / D-B2）与九项登记（R-B1…R-B9）需负责人确认**；其余逐条按设计档落地。

---

## 10. 交付摘要（数字先给）

| 项 | 数值 | 来源 |
| --- | --- | --- |
| `cd pix && npm run check` | `CHECK_EXIT=0`（store 后 / 面板后 / 离屏脚本初版后 / 全部改动收尾后 共 4 次，全 0） | §12.1 |
| 基线交叉核对（R12 交付目录，只读） | `{"shots":127,"failure":null,"measurements":185,"labels":41}` | §12.2 |
| 离屏验收（`pix-v05-r13-after`，第 3 次实跑） | `UI_SHOT_AFTER_EXIT=0`、`结束：产出 135 张截图`、`MANIFEST.failure === null` | §12.3 |
| 零缺失比对 | `{"base":127,"after":135,"missing":[],"added":[8 张 r13-*]}`；label `{baseLabels:41, afterLabels:46, missing:[]}` | §12.4 |
| 新增 record | 5 组 **13** 条（`r13-report-entry:3` / `r13-report-content:3` / `r13-report-fallback:2` / `r13-report-degrade:2` / `r13-report-failure:3`） | §13 |
| 新增截图 | **8** 张（逐张目视通过） | §15 |
| `MEASUREMENTS.json` 长度 | **198**（= 185 + 13） | §12.4 |
| `smoke:notes` | `通过 44 / 失败 0`、退出码 0（连续两次） | §12.5 |
| `smoke:view`（零改动文件回归） | `通过 29 / 失败 0`、退出码 0 | §12.5 |
| 白名单外改动 | 0（`git status --short` = `M` 八个 + `?? docs/pm/R13-*.md`） | §19 |

改动文件（3 个源码/脚本 + 本档追加；`git diff --numstat` 实测）：

| 文件 | 动作 | 规模（+ / −） | 对应需求 |
| --- | --- | --- | --- |
| `pix/src/renderer/stores/notes-store.ts` | 修改 | `90 / 2`（2 处 `−` = 两条既有 import 行被展开为多行） | N82-2 / N83 / N84-4 |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | `81 / 0`（**纯新增**：`.notes-header-top` / `.notes-export-row` 与四条既有样式规则零删除） | N82-1 / N82-3 / N83-4 |
| `pix/scripts/ui-shot.mjs` | 修改 | `751 / 1`（1 处 `−` = `libraryShowInFolder` 加参数记录，设计档 §2.2 #1 唯一允许的改写行） | N86-2 |
| `docs/pm/R13-dev.md` | 追加 | 本档 B 面部分 | —— |

---

## 11. 改动清单（文件 + 具体改动）

### 11.1 `pix/src/renderer/stores/notes-store.ts`（+90 / −2）

| 位置 | 改动 |
| --- | --- |
| import 面 | `@shared/types` 的 `import type` 加 `ReaderNotesReportChapter`（多行化，与既有四名同块）；新增 `import { buildChapterRanges } from "../utils/outline-notes";`；`../utils/notes-path` 的 import 加 `docDisplayName`（多行化） |
| 类型 | 新增 `export type ExportDocReportResult`（四态：`ok` / `stale` / `empty` / `message`，紧邻 `UndoDeleteResult`） |
| 状态 | `lastReport` ref（紧邻 `lastExport`）；`reportScope` let（紧邻 `undoScope`）；`currentDocNoteCount` computed（复用 `groupNotesByDocument(notes.value, key, true)`，与视图维度无关） |
| 动作 | `exportCurrentDocReport()`：守卫顺序 = ① 归属缺失 → `stale`；② `currentDocNoteCount === 0` → `empty`（**不发 IPC**）；③ 快照 `reportScope` + `docDisplayName(readerStore.filePath)`；④ 章节只取 `buildChapterRanges` 的 Map 插入序（`pageCount === 0` 不派生）；⑤ 在途归属守卫（成功与失败同一处理）→ `stale` |
| 清理点 | `watch(currentDocKey)` 增 `lastReport.value = null;`；`resetNotes()` 增 `reportScope += 1;` 与 `lastReport.value = null;` |
| 暴露面 | `return` 增 `lastReport` / `currentDocNoteCount` / `exportCurrentDocReport` |
| 纪律 | 不拼任何存储路径；`chapters:` 带冒号字面恰 1 处（入参对象字面量，逐字 `chapters: chapters`）；章节数组声明无类型注解（类型落在 `.map` 回调的返回注解上，避免多一行命中） |

### 11.2 `pix/src/renderer/components/workspace/NotesPanel.vue`（+81 / −0）

| 位置 | 改动 |
| --- | --- |
| script | `const exportingReport = ref(false);`（紧邻 `exporting`）；`onExportReport()`（首行 `if (exportingReport.value) return;`、`try/finally` 内翻转、`stale` 零副作用、`empty` 逐字「当前文档暂无笔记，未生成报告」、失败 `生成报告失败：{message}`） |
| 模板（入口行） | `.notes-report-actions`（`v-if="notesStore.status === 'ready'"`）内含 `v-btn.notes-report-btn`（`size="small"` / `variant="tonal"` / `prepend-icon="mdi-file-document-outline"` / `block` / `title` / `:disabled` / `:loading`），文本恒为「导出当前文档报告」；插在 `.notes-header-top` 之后、`.notes-search` 之前 |
| 模板（状态行） | `.notes-report-row`（`v-if="notesStore.lastReport"`）内含 `.report-text` 逐字「报告：{显示名}（{N} 条）→ {displayPath}」与 `v-btn.report-reveal`（`size="x-small"` / `variant="text"` / `prepend-icon="mdi-open-in-new"`）「在文件夹中显示」→ 复用既有 `revealPath(lastReport.filePath)`；插在 `.notes-export-row` 之后、`.notes-loading` 之前 |
| 样式 | `.notes-report-actions` / `.notes-report-btn` 放在既有 `.notes-search` 规则之前；`.notes-report-row` / `.report-text` 放在既有 `.export-text` 规则之后（盒模型逐字对齐既有导出行）；不新增 CSS 变量、不加过渡 |

### 11.3 `pix/scripts/ui-shot.mjs`（+751 / −1）

| 位置 | 改动 |
| --- | --- |
| `SEL` | 新增恰 4 项：`reportBtn` / `reportRow` / `reportText` / `reportReveal`（追加在 `composerInput` 之后） |
| `writeFixtures()` | 追加一行 `rmSync(<LIBRARY_DIR>/.pix-read/reports, { recursive: true, force: true })`（纯追加；不删既有行） |
| stub（`buildStub()`） | 新增 `notesReportCalls` / `notesReportFailure` / `notesReportDelayMs` / `REPORT_ERRORS`（独立映射：`write-failed` = `报告写入失败`、`empty` = `当前文档暂无笔记，未生成报告`）/ `libraryShowPaths`；新增 `renderReportEntry` / `formatReportStamp` / `reportDisplayName` / `renderDocumentReport`（逐字镜像主进程，字符串拼接、无反引号）；新增 `notesExportReport`（真写 + 记账 + 失败/延迟注入；延迟只推迟响应）；`libraryShowInFolder` 加参数记录（返回值与行为不变）；`__pixStub` 新增 4 个控制口（`notesReportCalls` / `setNotesReportFailure` / `setNotesReportDelay` / `libraryShowCalls`） |
| R13 块 | 追加在 `runReaderStateScenarios` 的既有收尾 `await restoreStandardSeed();` 之后、函数收口之前：4 个 helper（`reportProbe` / `readReport` / `reportExists` / `normalizeStamp`）+ 局部常量与两个夹具（`outOfRangeNote` / `textDocNote`）+ `EXPECT_CHAPTERS_13` + 场景 `r13-1`…`r13-5`；块末仍以 `await restoreStandardSeed();` 收尾 |
| 既有面 | 既有场景 / 相位 / label / 截图名 / `record` 语义 / `capturePage` / 其余 stub 方法**零改动、零删除**；`git diff` 的 `−` 侧只有 1 行（`libraryShowInFolder`，设计档 §2.2 #1） |

---

## 12. 真实命令与关键输出

### 12.1 唯一工程门（B 面 4 次）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
# store 落地后 / 面板落地后 / 离屏脚本初版后 / 全部改动收尾后 各一次 ⇒ 四次均为 CHECK_EXIT=0
# （动工前的唯一工程门由 A 面实跑，读数同为 0；B 面自 store 起计。离屏脚本 ui-shot.mjs 不在
#  tsconfig 的 include 面内，故另以 `node --check scripts/ui-shot.mjs` = 0 单证语法）
```

```text
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
CHECK_EXIT=0
```

### 12.2 基线交叉核对（只读）

```bash
node -e "…读取 C:/Users/86157/AppData/Local/Temp/pix-v05-r12-final/shots/{MANIFEST,MEASUREMENTS}.json…"
# ⇒ {"shots":127,"failure":null,"measurements":185,"labels":41}（与设计档 §5.3 冻结读数逐字一致）
```

### 12.3 离屏验收（三次实跑，含首次红灯的处置）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" \
  PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r13-after" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_AFTER_EXIT=$?"
```

| 次 | 读数 | 说明 |
| --- | --- | --- |
| 1 | `UI_SHOT_AFTER_EXIT=1`；`场景失败：断言失败 map-scale：展开耗时超限：876ms(mode=ready)` | **既有 R9 性能断言**（阈值 800ms、本面零改动）；与 `R11-dev.md` 已登记的 866ms / 966ms 同款环境负载抖动 ⇒ 判为环境抖动，**未改既有断言**（R-B7） |
| 2 | `UI_SHOT_AFTER_EXIT=1`；`断言失败 r13-report-content：报告正文与手写期望串不等…；在 .pix-read 下应只新增 reports：{"added":["reader-state.json","reports"]}` | 暴露 3 个真实缺陷：① stub 镜像漏章节标题的 ` · 第 {label} 页` 后缀（实际产出 `## 1. Abstract（1 条）`）⇒ 已按主进程模板补齐；② 手写期望串缺 `### 第 N 页` 之后的空行（与 A 面 D1 同源）⇒ 已按真实输出改正（D-B1）；③ `reader-state.json` 的写盘落在两次快照之间 ⇒ 加去抖稳定窗（R-B2） |
| 3（验收） | `UI_SHOT_AFTER_EXIT=0`、`[ui-shot] 结束：产出 135 张截图`、`MANIFEST.failure === null` | 无任何 `场景失败` 行；13 条 `r13-*` record 全绿 |

### 12.4 零缺失比对（逐字命令 + 输出）

```bash
BASE="C:/Users/86157/AppData/Local/Temp/pix-v05-r12-final"; AFTER="C:/Users/86157/AppData/Local/Temp/pix-v05-r13-after"
node -e "…MANIFEST shots 集合差…"
# ⇒ {"base":127,"after":135,"missing":[],"added":["r13-1-report-disabled.png","r13-1b-report-no-notes-notice.png",
#      "r13-2-report-row.png","r13-2b-report-row-left-pane.png","r13-3-report-fallback-row.png",
#      "r13-4-report-degrade-subdir.png","r13-4b-report-degrade-text-doc.png","r13-5-report-failure-notice.png"]}
# ⇒ AFTER_FAILURE=null
node -e "…MEASUREMENTS label 计数差…"
# ⇒ {"baseLabels":41,"afterLabels":46,"missing":[]}（新增 5 种恰为 r13-report-entry / -content / -fallback / -degrade / -failure）
node -e "…MEASUREMENTS 长度…"   # ⇒ after measurements=198
ls -A "$AFTER/shots" | grep -v -E '\.png$' | grep -v -E '^(MANIFEST|MEASUREMENTS)\.json$'; echo "STRAYS_EXIT=$?"
# ⇒ 无输出、STRAYS_EXIT=1（`shots/` 一级只有 png + 两个 json）
```

### 12.5 烟测回归

```bash
cd E:/develop/PiX-Read && PATH="/c/Program Files/nodejs:$PATH" node pix/scripts/smoke-notes.mjs | tail -1   # ⇒ 通过 44 / 失败 0（连续两次，退出码 0）
cd E:/develop/PiX-Read && PATH="/c/Program Files/nodejs:$PATH" node pix/scripts/smoke-view.mjs  | tail -1   # ⇒ 通过 29 / 失败 0（退出码 0）
```

---

## 13. 新场景实跑读数（5 组 13 条，逐条为本次验收 run 的 `MEASUREMENTS` 原文）

| 组 | 相位 | 关键读数（截断） |
| --- | --- | --- |
| `r13-report-entry` | `disabled-no-doc` | `btnText="导出当前文档报告"`、`btnTitle="导出当前文档的阅读报告（Markdown）"`、`btnDisabled=true`、`btnRect={x:23,y:105,w:242,h:20}`、`searchRect={x:23,y:127,w:242,h:26}`、`headerTopRect={x:23,y:83,w:242,h:20}`、`rowInDom=false`、`entryWidthOk=true`、`entryBelowHeader=true`、`leftWidth=268` |
| `r13-report-entry` | `enabled-with-doc` | `btnDisabled=false`、文本与 title 逐字不变、`countText="共 4 条"`、`exportLabel="导出 Markdown"` |
| `r13-report-entry` | `no-notes-notice` | notice 逐字「当前文档暂无笔记，未生成报告」（`isError=true`）、`callsDelta=0`、`reportExists=false`、`rowInDom=false`、`notesMdHashSame=true` |
| `r13-report-content` | `export-success` | `rowText="报告：sample-paper.pdf（3 条）→ .pix-read/reports/sample-paper.pdf.md"`、`revealText="在文件夹中显示"`、`notice=null`、`fileExists=true`、`pixReadBefore=["notes.json","reader-state.json"]` |
| `r13-report-content` | `payload` | `callsDelta=1`、`docFilePath=<LIBRARY_DIR>/sample-paper.pdf`、`chapters` = 7 项（`1. Abstract[1,1]\`1\`` … `Appendix B[2,3]\`2-3\``，顺序与地图徽标同源）、`progress={page:1,pageCount:3}` |
| `r13-report-content` | `content-verbatim` | 归一化后与手写期望串**逐字节相等**（`生成时间：<STAMP>` 占位）；`stampOk=true`；`notesHashSame=true`；`notesMdHashSame=true`；`pixReadAdded=["reports"]`、`pixReadRemoved=[]` |
| `r13-report-fallback` | `fallback` | `groups=["## 1. Abstract · 第 1 页（1 条）","## 2. Method Overview · 第 2 页（2 条）","## 未归入章节（1 条）"]`、`outOfRangeCount=1`、统计段「共 4 条（摘录 3 · AI 结论 1）」、`searchValue="Table 2"`、`visibleRows=1`、`exportText="已导出 5 条 → .pix-read/notes.md"`、`bothRows=true` |
| `r13-report-fallback` | `idempotent` | `sameAsFirst=true`、`staleGone=true`、`callsDelta=2`、`rowText="报告：sample-paper.pdf（4 条）→ .pix-read/reports/sample-paper.pdf.md"` |
| `r13-report-degrade` | `no-chapter-subdir` | `rowText="报告：older-paper.pdf（1 条）→ .pix-read/reports/archive/older-paper.pdf.md"`、`groups=["## 第 7 页（1 条）"]`、meta 含 `文档：archive/older-paper.pdf` + `阅读进度：第 1 / 2 页`、`chapters=[]` |
| `r13-report-degrade` | `text-doc` | `groups=["## 第 1 页（1 条）"]`、meta **不含** `阅读进度：`、含 `文档：reading-notes.md`、`payload={chapters:[],progress:null,docFilePath:…reading-notes.md}`、`rowText="报告：reading-notes.md（1 条）→ .pix-read/reports/reading-notes.md.md"`、`rowCleared=true` |
| `r13-report-failure` | `write-failed-retry` | notice 逐字「生成报告失败：报告写入失败」、`rowInDom=false`、`fileExists=false`、`failCallsDelta=1`、`callsDelta=2`、`retryFile=true`、`retryRow` 逐字 |
| `r13-report-failure` | `reveal-and-clear` | `showPaths=[<LIBRARY_DIR>/.pix-read/reports/sample-paper.pdf.md]`、`hashSame=true`、`rowAfterSwitch=false`、切回后 `rowText` 逐字 |
| `r13-report-failure` | `inflight-guard` | `callsDelta=1`（在途连点只发 1 次 IPC）、`rowInDom=false`（迟到成功响应被归属守卫丢弃）、`notice=null` |

---

## 14. 走查（B 面适用条目，逐条实测）

| # | 命令 | 实测 | 期望 |
| --- | --- | --- | --- |
| §1.7.5 #1 | `grep -n "notes-report-actions\|notes-report-btn\|notes-report-row\|report-text\|report-reveal" NotesPanel.vue \| wc -l` | `9` | 9（模板 5 + 样式 4） |
| §1.7.5 #2 | `grep -rn "阅读报告" pix/src/renderer \| wc -l` | `1` | 1（只有按钮 `title`） |
| §1.7.5 #2 | `grep -rn "阅读报告" pix/src \| wc -l` | `4` | 2（**登记 R-B6**：多出的 2 处是 A 面注释） |
| §1.7.5 #3 | `grep -rn "导出当前文档报告" pix/src \| wc -l` | `1` | 1 |
| §1.7.5 #4 | `grep -rn "reports/" pix/src/renderer \| wc -l` | `0` | 0（**登记 R-B7**：设计档原命令含 `\.pix-read` 时实测 2，均为既有字面） |
| §1.7.5 #5 | `git diff -- NotesPanel.vue \| grep -E "^[-]" \| grep -v "^---" \| wc -l` | `0` | 0（`.notes-header-top` / `.notes-export-row` 零删除） |
| §1.8 #9 | `grep -c "chapters:" pix/src/renderer/stores/notes-store.ts` | `1` | 1 |
| §1.8 #10 | `grep -rn "docDisplayName(currentDocKey)" pix/src/renderer \| wc -l` | `0` | 0 |
| §1.8 #11 | `grep -rn "exportCurrentDocReport" pix/src \| grep -v "stores/notes-store.ts" \| wc -l` | `1` | 1（面板一处调用） |
| §1.8 #13 | `grep -c "lastReport.value = null"` / `grep -c "lastReport.value = {"` | `2` / `1` | 2 / 1 |
| §1.8 #14 | `grep -rln "lastReport" pix/src` | 只 2 文件（store + 面板） | ⊆ {渲染层 store, NotesPanel.vue} |
| §1.8 #15 | `grep -rn "当前文档暂无笔记，未生成报告" pix/src \| wc -l` | `2` | 2（主进程常量 + 面板 `setNotice` 行） |
| §1.8 #17 | `git diff --stat -- pix/src/renderer/utils \| wc -l` | `0` | 0（R12 章节语义零改动） |
| §1.8 #18 / §2.3 | `git diff --stat -- package.json package-lock.json packages tsconfig*.json vite.config.ts README.md .gitignore scripts/smoke-view.mjs \| wc -l` | `0` | 0 |
| §5.6 #15 | `git diff -U0 -- pix/scripts/ui-shot.mjs \| grep -cE "^\+\s+report(Btn\|Row\|Text\|Reveal): \""` | `4` | 4（SEL 恰 4 项） |
| §2.3 | `git diff -- pix/scripts/ui-shot.mjs \| grep -E "^[-]" \| grep -v "^---"` | 恰 1 行（`libraryShowInFolder`） | 只允许 §2.2 #1/#2 |
| §5.6 #16 | `git status --short` | `M` 八个 + `?? docs/pm/R13-*.md` | 白名单 |

---

## 15. 视觉验收（8 张逐张登记；截图目录 `C:/Users/86157/AppData/Local/Temp/pix-v05-r13-after/shots/`）

| 截图 | 观察项（实测目视） | 结论 |
| --- | --- | --- |
| `r13-1-report-disabled.png`（左栏） | 入口行位于头行之下、搜索行之上；按钮整宽、文本「导出当前文档报告」单行完整；禁用态灰化可辨；`共 4 条` 与 `导出 Markdown` 未被挤动/换行；与头行文本无重叠 | **通过**（`entryBelowHeader=true` / `entryWidthOk=true` / `leftWidth=268`） |
| `r13-1b-report-no-notes-notice.png`（左栏） | `.notes-notice.is-error` 文本「当前文档暂无笔记，未生成报告」完整单行、无截断；无报告状态行；入口按钮回到可点态 | **通过** |
| `r13-2-report-row.png`（整窗） | 只出报告状态行（本相位无既有导出行）；行文本逐字「报告：sample-paper.pdf（3 条）→ .pix-read/reports/sample-paper.pdf.md」，在 268px 栏宽内自动折 3 行（`word-break: break-word` 的设计行为），**文本完整无截断**；「在文件夹中显示」在首行右侧、未换行；中栏 PDF 与右栏对话布局正常 | **通过** |
| `r13-2b-report-row-left-pane.png`（左栏） | 状态行盒模型与既有 `.notes-export-row` 同语系（同圆角 / 同边框 / 同内边距 / 同 11px 字号）；纵向间距均匀；无重叠、无溢出 | **通过** |
| `r13-3-report-fallback-row.png`（左栏） | 搜索「Table 2」生效（`命中 1 条 / 共 5 条`、1 行笔记）时，既有导出行（2 行折行）与报告状态行（3 行折行）**同屏共存**、各自独立卡片、互不重叠；两行按钮均可见 | **通过**（`bothRows=true`） |
| `r13-4-report-degrade-subdir.png`（左栏） | 报告行含子目录相对路径 `reports/archive/older-paper.pdf.md`、折 3 行可读；入口按钮可用；`older-paper.pdf`（当前文档 1 条）与 `sample-paper.pdf`（3 条）分组完整 | **通过** |
| `r13-4b-report-degrade-text-doc.png`（左栏） | 文本文档报告行逐字「报告：reading-notes.md（1 条）→ .pix-read/reports/reading-notes.md.md」；**无上一文档报告行残留**；`笔记 5` 列表完整 | **通过**（`rowCleared=true`） |
| `r13-5-report-failure-notice.png`（左栏） | 失败提示「生成报告失败：报告写入失败」完整单行、无截断；无报告状态行；入口按钮与笔记列表不受影响 | **通过** |

**目视要点逐条**：① 入口行位置与宽度 ✓（头行之下、搜索行之上、整宽 242px = `.notes-search` 宽）；② 两按钮视觉层级 ✓（同 `size="small"` + `variant="tonal"`，图标 `mdi-file-document-outline` 与 `mdi-export-variant` 可一眼区分；禁用态灰化与既有 `.v-btn--disabled` 同语系）；③ 状态行与既有导出行同盒模型 ✓（`r13-3` 两行同屏时纵向间距均匀、不重叠）；④ 无报告时不占位 ✓（`rowInDom=false`；切文档后行消失：`r13-5` ⑧ 与 `r13-4` ⑩）；⑤ 禁用态语义 ✓（无文档灰化 / 有文档立即可点，无第三条禁用条件）；⑥ 失败只走 `.notes-notice.is-error` 一处反馈 ✓（成功时 `notice=null`）；⑦ 既有截图内容变化已按 §16 分类登记。

---

## 16. 既有截图 / 测量的内容变化（登记项，含分类与证据）

口径：零缺失判据只比 basename 与 label 集合（§12.4），**不覆盖内容差异**；本节给出基线 `pix-v05-r12-final` 与验收 `pix-v05-r13-after` 的 `MEASUREMENTS.json` 逐字段差（一次性探针，跑后删除）：同为 185 / 198 条的公共部分共 **170** 处差异，五类（逐条分类计数，合计 170）：

| 类别 | 条数 | 实例 | 判定 |
| --- | --- | --- | --- |
| ① 面板几何位移（白名单） | **65** | `list-current-doc-filter-{on,off}` / `after-filter-off-settled`：`.header.h` **115 → 137**（+22px = 新增入口行）、`filterSwitch/trackBox/thumbBox/controlBox/labelBox/groupHead/groupName/groupPath/chip/noteRow/pageBadge/noteTime/deleteBtn/noteText/commentTrigger` 的 **y 全部 +22**、`panelScroll.scrollH` 1059 → 1081；`notes-copy#5` 与 `r11-note-actions-narrow#0..#2` 的行内控件 y +22 | **预期**（设计档 §5.3 / D-9 的位移白名单：`.notes-header` 高度增大 + 其后各行纵向位移）；**x / width / height（除 `.notes-header.h`）与全部文本字段零变化** |
| ② 环境类（两个 `PIX_SHOT_ROOT`） | **19** | `tree-progress.title`、`reader-state-writes.lastPayload.docFilePath`、`answer-save.payloads[*].docFilePath`、`answer-anchor`、`workspace-switch`、`r12-section-context.message` | **预期**（§5.4 要求基线与验收用不同目录） |
| ③ 运行时刻 / 计时 | **10** | `reader-state-degrade.rebuilt…updatedAt`、`workspace-switch.file…updatedAt`、`notes-undo.createdAt/seedCreatedAt`、`map-scale.timing.ms` 126 → 77、`reader-state-writes#3.elapsedMs` 82 → 103、`notes-search#9.waitMs` 1 → 0、`r11-*` 计时字段 | **预期**（时钟 / 毫秒计时抖动） |
| ④ 随机 id | **2** | `answer-notes-list.page2Ids[2..3]`（`n-<ts>-<rand>`） | **预期**（每次运行新建笔记的 id 不同） |
| ⑤ 既有 `quick-ask` 探针的探索式计数 | **74** | `r11-quick-ask-scroll-scope#3/#4` 的 `preQuiet.attempts`（1 → 2）、`trail` 长度（1 → 2）与 `trail[*].*`、`stageScroll.t0/dispatch/resample.count`（+1） | **非本轮引入**：同码的 R12 四次运行读数分别为 `attempts 1 / 1`（`r12-final`）、`1 / 1`（`r12-after`）、`1 / 2`（`r12-review`）、`2 / 2`（`r12-stab`）；本次为 `2 / 2`，与 `pix-v05-r12-stab` 逐字段一致 |

**面板类既有截图的目视抽样**（本次实看 3 张，均在验收目录 `pix-v05-r13-after/shots/`）：

| 截图 | 观察 | 结论 |
| --- | --- | --- |
| `02b-notes-list-left-pane.png` | 头行 `共 4 条` + `导出 Markdown` 原样；新增入口行（无文档 ⇒ 灰化）插在头行与搜索行之间；搜索/排序/筛选与列表完整 | 无重叠、无截断（`notes-count` / `notes-export-btn` 文本与几何零变化） |
| `40-notes-select-bar-left-pane.png` | 入口行与搜索/排序/选择条（`已选 2 条` + `问 AI` + `清空`）自上而下顺排；两级标题、行内动作区完整 | 无重叠、无截断 |
| `10b-notes-error-left-pane.png` | 错误态（`笔记文件无法读取`）：入口行**整行不在 DOM**（`v-if="notesStore.status === 'ready'"` 生效），错误块与三按钮完整 | **反向证据**：设计档 §3 第 14 行的「入口在不该出现时出现」未发生；既有场景 01/10 截图零缺失 |

其余既有面板类截图未逐张目视（§18 未决项）；几何面已由本节 ① 的字段差覆盖（只出现纵向 +22px 与头部高度 +22px，x / width / height 与全部文本字段零变化）。

---

## 17. 偏差表（逐条登记 + 证据 + 处置）

### D-B1（需负责人确认）：确认与 A 面 D1 同源 —— 设计档 §5.2.4 ⑨ 的手写期望串漏了 `### 第 N 页` 之后的空行

- 证据：第 2 次实跑原文 `actual` 与 `expected` 的逐字差异中，`### 第 1 页\n\n> We study …` vs `### 第 1 页\n> We study …`（三条条目同型）；`renderMarkdownEntry`（`pix/src/main/notes-store.ts:253`）在标题后恒插一个空行，A 面已以 D1 登记同一问题。
- 处置：**按真实输出**写期望串（stub 逐字镜像 `renderMarkdownEntry`，两侧与**同一份**手写期望串比对）；未改任何被测逻辑。

### D-B2（登记项）：`reportExists` 用 `readFileSync` + `try/catch`，不用 `existsSync`

- 理由：`pix/scripts/ui-shot.mjs` 的 fs import 行是既有行，加名会新增一处 `−` 行，越过设计档 §2.3「`−` 侧只允许 §2.2 两处」。
- 等价性：报告文件「可读即存在」，本脚本全部 6 处调用点都只问存在性（无权限 / 锁目录的非常规现场不在断言面）；`r13-1` 之前的现场由 `writeFixtures()` 的 `rmSync` 保证为「无报告目录」。

### R-B1（登记项）：stub 报告镜像的两处真实缺陷（首跑红灯暴露，已修正）

- ① 章节标题后缀：初版漏 ` · 第 {label} 页`（实际产出 `## 1. Abstract（1 条）`）⇒ 已按主进程 `reportBlocks` 逐字补齐；
- ② 期望串空行（= D-B1）。
- 证据：第 2 次实跑 `actual` 原文；修正后第 3 次实跑 `content-verbatim` 逐字节相等。

### R-B2（登记项）：`r13-2` 快照前新增去抖稳定窗（≤3s，等待 `reader-state.json` 落盘）

- 现场：第 2 次实跑 `pixReadAdded=["reader-state.json","reports"]`（设计档次级风险 4 / 评审 S-5 已预告该时序风险）。
- 处置：**不放宽判据**（仍要求新增集合**恰为** `["reports"]`、移除集合为空），只在取「点击前」快照前等 `STATE_FILE_A` 出现（`reader-state-store` 的 `DEBOUNCE_MS = 600`；上限 30×100ms）。
- 证据：第 3 次实跑 `pixReadAdded=["reports"]`、`pixReadRemoved=[]`，且 `pixReadBefore=["notes.json","reader-state.json"]`。

### R-B3（登记项）：`r13-5` 相位 `reveal-and-clear` 的 ⑤ 之后补 `waitPage(1, 2)`

- 理由：`.page-label` 在新文档加载前已存在 ⇒ 只等 `waitPdfLoaded()` 时 ⑧（`rowInDom === false`）与「已切文档」无因果关系，可能假红。补等待后 ⑧ 才可判（读数 `rowAfterSwitch=false`）。未改断言内容。

### R-B4（登记项）：`r13-5` 相位 `write-failed-retry` 的 `data` 多一个证据字段 `failCallsDelta`

- 理由：设计档同时要求「注入期间计数增量恰 1」与「清理后计数增量恰 2」，两个读数都要入档；判据本身未变（`callsDelta=2` 与 `failCallsDelta=1` 分别断言）。

### R-B5（登记项）：`r13-*` 的相位 `data` 附加只读证据字段

- `r13-2` 的 `pixReadBefore` / `stampOk`、`r13-3` 的 `reportText`、`r13-4` 的 `payload`、`r13-1` 的 `probe` 等为原文档已列字段；另在 `r13-2` 增 `pixReadRemoved`（与 `pixReadAdded` 成对，防空断言）。

### R-B6（登记项）：`阅读报告` 字面在 `pix/src` 命中 4 处（设计档 §1.7.5 #2 期望 2 处）

- 实测：`pix/src/main/notes-store.ts:360`（模板行，合规）、`pix/src/renderer/components/workspace/NotesPanel.vue:457`（`title`，合规）、另有 **A 面注释两处**：`pix/src/main/notes-store.ts:495`、`pix/src/shared/types.ts:417`。
- 处置：渲染层判据 `grep -rn "阅读报告" pix/src/renderer | wc -l = 1` **满足**；A 面两处由 A 面处置（本面不改白名单外文件）。B 面自身的注释已改写为「报告导出」，不带该字面。

### R-B7（登记项）：§1.7.5 #4 的判据命令实测非 0

- 实测：`grep -rn "reports/\|\.pix-read" pix/src/renderer` = **2**（`NotesPanel.vue:551` 的 R10 既有导出行文案 `.pix-read/notes.md`、`reader-state-store.ts:4` 的既有注释），两者都在 R10 / R11 就存在。
- 处置：按条文原意用 `grep -rn "reports/" pix/src/renderer` = **0**（渲染层不出现 `reports/` 前缀，本轮新增零命中）；既有两处不改（属冻界面）。

### R-B8（登记项）：首跑 `map-scale` 性能红灯（876ms > 800ms）

- 证据：第 1 次实跑 `场景失败：断言失败 map-scale：展开耗时超限：876ms(mode=ready)`；该断言在 `pix/scripts/ui-shot.mjs:4908`（R9 既有、本面零改动），`R11-dev.md` 已登记同款抖动（866ms / 966ms）。
- 处置：判为环境负载抖动；第二 / 三次实跑本面读数 126ms / 77ms（与基线 `r12-final` 的 126ms 同量级）⇒ **未改既有断言**。

### R-B9（登记项）：状态行文本在 268px 左栏内自动折行

- 现场：`报告：…→ .pix-read/reports/sample-paper.pdf.md` 在左栏折 2–3 行（`.report-text` 与既有 `.export-text` 同盒模型，含 `word-break: break-word`）。
- 判定：**设计行为**（§1.7.4 逐字冻结）；文本完整无截断、「在文件夹中显示」未换行、与既有行不重叠（§15 逐张目视）。

---

## 18. 未验证事项 / 未决项（逐条给原因与归属）

| # | 项 | 原因 / 归属 |
| --- | --- | --- |
| 1 | `npm run build` / `npm test` / `npm run package` / `npm run dev`、打包面（`dist/` / `release/`） | 派单禁令，未跑；渲染层与主进程的编译面由 `npm run check`（三次 tsc/vue-tsc）覆盖 |
| 2 | git 写命令（提交 / 暂存） | 派单禁令，未跑；提交由负责人完成 |
| 3 | 左栏折叠态（`leftCollapsed`）下的入口行几何 | 本轮场景不折叠左栏（评审 S-6 的判据只在 268px 展开态取得） |
| 4 | 「PDF 未就绪」窗口的报告入口态 | 与文本文档共用 `chapters === [] + progress === null` 退化分支（`r13-4` 已钉住该分支）；未就绪窗口本身不在断言面 |
| 5 | `long-book.pdf`（420 节点）的报告入参 | 按评审 S-7 避开（`r13-*` 不打开该文档） |
| 6 | `r13-*` 之外的非当前文档报告（无「当前文档」时的归属分支） | 渲染层动作的 ① 守卫在按钮禁用态下不可达（`r13-1` 相位 1 只判禁用与几何），未造独立注入 |
| 7 | A 面 §6 的两条偏差（A 面 D1 与 §8 未决项） | A 面范围，本面只关联（D-B1 与 A 面 D1 同源） |

---

## 19. 收尾核对（白名单 / 零残留）

```bash
cd E:/develop/PiX-Read && git status --short
# ⇒  M pix/scripts/smoke-notes.mjs            （A）
#     M pix/scripts/ui-shot.mjs                （B）
#     M pix/src/main/ipc-handlers.ts           （A）
#     M pix/src/main/notes-store.ts            （A）
#     M pix/src/main/preload.ts                （A）
#     M pix/src/renderer/components/workspace/NotesPanel.vue   （B）
#     M pix/src/renderer/stores/notes-store.ts                 （B）
#     M pix/src/shared/types.ts                （A）
#    ?? docs/pm/R13-design.md / R13-dev.md / R13-req.md / R13-review.md
```

- `M` 恰 **8** 个（= 设计档 §4 第 1–8 行）+ `?? docs/pm/R13-*.md` ⇒ 与设计档 §1.8 #19 一致。
- 范围外零 diff（`git diff --stat` 为空）：`pix/src/renderer/utils/**`、`pix/src/main/library-root.ts`、`pix/src/main/reader-state-store.ts`、`pix/package.json`、`package-lock.json`、`packages/**`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`README.md`、`.gitignore`、`pix/scripts/smoke-view.mjs`。
- 离屏产物全部在 `PIX_SHOT_ROOT`（`%TEMP%/pix-v05-r13-after`）；仓库内零新增文件；一次性探针（`%TEMP%/r13-*.mjs`）与运行日志跑后删除。
- 未跑 git 写命令；未新增/升级依赖；未改 `packages/**`。
