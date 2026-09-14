# DEV-R5-notes：R5（V0.3）技术设计 — 关键段落 → 笔记 → 回跳 → 导出

> 上游：`docs/pm/PRD-V0.3.md`（N17–N25；契约冻结见 §4 N18 与 §8）。
> 本档是**可执行技术设计**：A（数据面）与 B（UI 面）两个开发包以本档为输入，落地文件、类型、函数名、错误码、排序规则、UI 结构都以本档为准。
> 本档只覆盖笔记主线；不改 `packages/*`、`ChatPanel.vue`、`reading-prompt.ts`、`resources/skills/**`。

## 0. 前置核对（写本档前实际读过的代码与三个结论）

已完整读：`pix/src/shared/types.ts`、`pix/src/main/preload.ts`、`pix/src/main/ipc-handlers.ts`、`pix/src/main/pix-paths.ts`、`pix/src/main/library-root.ts`、`pix/src/main/pdf-tools.ts`（前 60 行，看主进程守卫风格）、`pix/src/renderer/types/ipc.ts`、`pix/src/renderer/types/rpc.ts`、`stores/reader-store.ts`、`stores/project-store.ts`、`composables/useRpc.ts`、`composables/useQuickAsk.ts`、`composables/useRegionCapture.ts`、`utils/reading-context.ts`、`components/workspace/PdfSelectionQuickAsk.vue`、`PdfViewer.vue`、`ReaderPanel.vue`、`LibraryPanel.vue`、`PdfSearchPanel.vue`（前 120 行）、`KnowledgeMap.vue`（关键行）、`ChatPanel.vue`（发送链路与气泡关键段）、`components/layout/AppLayout.vue`、`pages/WorkspacePage.vue`、`components/session/MessageBlock.vue`、`assets/styles/variables.css`、`main.ts`、`tsconfig*.json`、`package.json`、`docs/pm/DEV-R4-capture.md`、`.gitignore`。

写档依据的关键事实（避免下游凭印象设计）：

1. **`vuetify_guide/` 在本 checkout 不存在**（仓库根 `.gitignore` 明确忽略 `vuetify_guide/`）。按 AGENTS.md 的意图改为等价核对：本档所有 Vuetify 结论来自 `pix/node_modules/vuetify@3.12.7` 的 `lib/components/**/*.d.ts` 与仓库既有用法（`main.ts` 的全局 `defaults`）。**特别提醒：`vuetify/components` 顶层不导出 `VExpandTransition`**，`<v-expand-transition>` 不可用（§4.5 列了可用集）。
2. **落页竞态点已定位**：`PdfViewer.loadPdf()` 在文档加载成功后固定 `scrollToPage(1)`（`PdfViewer.vue:646-647`，紧接 `observePages()`），而 `reader-store.openDocument()` 会重置 `page/pageCount/gotoPage`。跨文档跳转必须在这两行处消费意图，不能靠外部观察 `pageCount > 0`。
3. **`.pix-read` 天然对资料库树不可见**：`ipc-handlers.ts` 的 `listLibraryChildren()` 有 `if (entry.name.startsWith(".")) continue;`。本轮不改该函数，只做回归核对。
4. **主进程写操作必须整段同步**：`ipcMain.handle` 的回调可以同步返回；`notes-*` 的读-改-写之间不得出现 `await`，否则两次 IPC 交错会丢写（§2.5）。
5. 渲染层已有可复用的路径/失败语义工具：`utils/reading-context.ts` 的 `preflightLibraryPath / normalizePath 约定`、`utils/image-capture.ts` 的风格、`project-store.normalizePath` 的大小写约定。

## 1. 数据模型与存储契约（冻结）

### 1.1 共享类型（`pix/src/shared/types.ts` 追加一节 `Reader Notes Types`，位置在 `Library Types` 之后、`Gui Settings Types` 之前）

```ts
export type ReaderNoteKind = "excerpt" | "answer";

/** 一条阅读笔记。docPath 为相对工作区根的正斜杠路径；page 为 1-based。 */
export interface ReaderNote {
  id: string;
  kind: ReaderNoteKind;
  docPath: string;
  page: number;
  text: string;
  comment: string;
  createdAt: number;
  updatedAt: number;
}

/** 渲染层提交的草稿：文档用绝对路径，相对化与归一化都在主进程完成。 */
export interface ReaderNoteDraft {
  docFilePath: string;
  page: number;
  text: string;
}

export interface ReaderNotesFile {
  version: 1;
  notes: ReaderNote[];
}

export type ReaderNotesErrorCode =
  | "no-root"
  | "outside"
  | "invalid-input"
  | "too-long"
  | "not-found"
  | "corrupt"
  | "version-unsupported"
  | "read-failed"
  | "write-failed"
  | "empty"
  | "not-corrupt";

export interface ReaderNotesLoadResult {
  success: boolean;
  notes: ReaderNote[];
  filePath: string;
  code?: ReaderNotesErrorCode;
  error?: string;
}

export interface ReaderNotesMutationResult {
  success: boolean;
  notes: ReaderNote[];
  note?: ReaderNote;
  duplicateOf?: string;
  code?: ReaderNotesErrorCode;
  error?: string;
}

export interface ReaderNotesExportResult {
  success: boolean;
  filePath?: string;
  count?: number;
  code?: ReaderNotesErrorCode;
  error?: string;
}

export interface ReaderNotesResetResult {
  success: boolean;
  notes: ReaderNote[];
  backupPath?: string;
  code?: ReaderNotesErrorCode;
  error?: string;
}
```

字段语义（写死）：

| 字段 | 约束 |
| --- | --- |
| `id` | `crypto.randomUUID()`（`node:crypto`），全局唯一，永不复用 |
| `kind` | 本轮只产出 `"excerpt"`；读取必须容忍 `"answer"`（P2 唯一消费者是 ChatPanel） |
| `docPath` | 相对工作区根、**正斜杠**、保留原始大小写；必须非空、不以 `/` 开头、不含 `..` 段（否则按损坏处理，见 §1.4） |
| `page` | 1-based 整数（不校验是否超出该文档页数——主进程不解析 PDF，越界页在跳转时由 `setPage` 钳制） |
| `text` | **主进程归一化后**的原文：去首尾 + 连续空白（含换行）折叠为单个空格；长度 ≤ 4000；超限拒绝保存 |
| `comment` | 纯文本，默认 `""`（P1 才可编辑） |
| `createdAt` / `updatedAt` | 毫秒整数；新增时相等；改备注时只更新 `updatedAt` |

命名纪律（防串味）：`docPath` = 相对路径（存储、分组、展示）；`docFilePath` = 绝对路径（仅出现在草稿与跳转入参）；`docPathKey` = 比较键（小写 + 正斜杠 + 去尾斜杠）。

### 1.2 落盘位置

`<工作区根>` = 主进程 `getLibraryRoot()`（由 `session-start` 设置、`session-stop` 清空）。渲染层**永不**传存储路径。

| 路径 | 性质 |
| --- | --- |
| `<工作区根>/.pix-read/notes.json` | 唯一事实源 |
| `<工作区根>/.pix-read/notes.md` | 导出产物（全量覆盖），非事实源 |
| `<工作区根>/.pix-read/notes.json.tmp` | 写入中间态；rename 后不得残留 |
| `<工作区根>/.pix-read/notes.md.tmp` | 导出中间态；rename 后不得残留 |
| `<工作区根>/.pix-read/notes.json.corrupt-<yyyyMMdd-HHmmss>` | 仅 N25 显式触发的备份 |

`pix-paths.ts` / `library-root.ts` **零改动**：笔记不进 `%APPDATA%`，不进会话目录。

### 1.3 文件格式（version 1）

```json
{
  "version": 1,
  "notes": [
    {
      "id": "b1f3c0a2-5e6d-4c8f-9a1b-0d2e3f4a5b6c",
      "kind": "excerpt",
      "docPath": "papers/attention.pdf",
      "page": 5,
      "text": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.",
      "comment": "",
      "createdAt": 1757860000000,
      "updatedAt": 1757860000000
    }
  ]
}
```

序列化：`JSON.stringify(file, null, 2) + "\n"`（2 空格缩进 + 尾换行，便于人工核对与将来纳入版本管理）。

### 1.4 读取判定表（唯一权威，逐条实现）

| 情况 | 行为 |
| --- | --- |
| 文件不存在（`ENOENT`） | 空库 `{ version: 1, notes: [] }`，`notes-load` 返回 `success: true, notes: []`（不写盘，首次保存时创建） |
| 读取抛非 `ENOENT` 错误 | `success: false, code: "read-failed"` |
| 文本有 BOM | 读取时剥掉首字符 `\uFEFF`（对齐 `library-read-text` 的既有处理） |
| `JSON.parse` 失败 | `code: "corrupt"` |
| 顶层非对象 / `notes` 非数组 / `version` 缺失 | `code: "corrupt"` |
| `version !== 1`（含更高版本） | `code: "version-unsupported"` |
| 任一条目非对象、缺必需字段、类型不符（含 `kind` 非上述两值、`page` 非正整数、时间戳非有限数） | `code: "corrupt"` |
| 任一条目 `docPath` 为绝对路径 / 含 `\` / 含 `..` 段 / 空串 | `code: "corrupt"`（这条同时是跳转路径拼接的安全前提，见 §5.1） |
| **损坏态下的 add / update / delete / export** | 一律 `success: false` + 对应 `code`，**原文件字节不变**，不写 tmp |
| `notes-reset`（用户显式）：文件损坏 | 备份改名 + 写空库，`success: true` |
| `notes-reset`：文件未损坏 | `success: false, code: "not-corrupt"`，不做任何改名 |

不做自动备份、不做静默降级为空库、不做旧格式兼容层（本格式是全新的）。

### 1.5 并发写与耐久性（写死取舍）

- **唯一写者**：主进程。每次变更 = 全量重写（笔记量级为单篇个位数、单文件 4000×N 字符，重写成本可忽略）。
- **同步 fs**：`readFileSync` / `writeFileSync` / `renameSync` / `rmSync` / `mkdirSync` 全同步，handler 回调为同步函数（返回值为普通对象，不返回 Promise）。同步调用在 Node 单线程内天然串行，因此**不需要写队列**；签名为同步函数也让「RMW 之间无 await」成为编译期可见的约束。
- **原子替换**：写 `notes.json.tmp` → `renameSync(tmp, target)`。Windows 上 `rename` 走 `MoveFileEx(MOVEFILE_REPLACE_EXISTING)`，可覆盖已存在文件；失败时 `rmSync(tmp, { force: true })` 清理，原文件不动。
- **不做 fsync**：掉电最多丢失最后一次写；**不会**出现截断文件或半条数据（rename 是原子的）。这是记录在案的边界，不是遗漏。
- **rename 可能瞬时失败**：Windows 上杀毒/索引器短暂占用目标文件时 `renameSync` 会抛 `EPERM`/`EBUSY`。本轮**不做重试**（同步主进程内无法优雅等待），按 `write-failed` 中文报错返回，原文件不动、tmp 清理；用户重试一次即可。若真机频繁出现，再补「失败重试 1 次」并记入开发档。
- **多实例（两个 PiX 窗口打开同一工作区）**：最后写入者覆盖前者。理由：产品只在单窗口工作区内使用；引入文件锁的收益低于成本，且与「不经用户确认不引入复杂度」一致。

## 2. 主进程能力

### 2.1 新模块 `pix/src/main/notes-store.ts`

导入纪律：只 `node:fs` / `node:path` / `node:crypto` + `./library-root.js` + `../shared/types.js`（**不 import electron**，与 `library-root.ts` 同为叶子模块，便于将来被 agent 侧复用）。

对外导出（恰好 6 个，与 PRD §10.1 一致）：

```ts
export function loadNotes(): ReaderNotesLoadResult;
export function addNote(draft: ReaderNoteDraft): ReaderNotesMutationResult;
export function updateNoteComment(id: string, comment: string): ReaderNotesMutationResult;
export function deleteNote(id: string): ReaderNotesMutationResult;
export function exportNotesMarkdown(): ReaderNotesExportResult;
export function resetCorruptNotes(): ReaderNotesResetResult;
```

入参形态由 `ipc-handlers.ts` 的守卫保证（§2.2），因此这里的参数是**已窄化的类型**，不用 `unknown`、不用 `any`。

内部函数（每个都有唯一调用点，不留未调用代码）：

| 函数 | 职责 |
| --- | --- |
| `notesDir(): string \| null` | `getLibraryRoot() ? join(root, ".pix-read") : null` |
| `notesFile(): string \| null` | `join(notesDir(), "notes.json")` |
| `ensureNotesDir(dir: string): void` | `mkdirSync(dir, { recursive: true })` |
| `normalizeNoteText(raw: string): string` | `raw.replace(/\s+/g, " ").trim()`（写入前唯一归一化点） |
| `toRelativeDocPath(filePath: string, root: string): string \| null` | `resolve` + `isLibraryFilePath` 通过后 `path.relative(root, resolved).split(sep).join("/")`；为空或含 `..` 返回 `null` |
| `isReaderNote(value: unknown): value is ReaderNote` | 逐字段类型 + §1.4 的 `docPath` 合法性 + `kind` 白名单 |
| `parseNotesFile(raw: string): NotesRead` | 解析 + 结构校验，返回 `{ ok: true, file }` 或 `{ ok: false, code, error }` |
| `readNotesFile(): NotesRead` | `notesDir()/notesFile()` 为空 → `no-root`；`ENOENT` → 空库；其余按 §1.4 |
| `writeNotesFile(file: ReaderNotesFile): { ok: true } \| { ok: false; error: string }` | §1.5 的原子写 |
| `renderNotesMarkdown(file: ReaderNotesFile, workspaceName: string, now: number): string` | §2.6 模板（纯函数） |
| `formatStamp(ms: number, dashed: boolean): string` | `YYYY-MM-DD HH:mm:ss` / `yyyyMMdd-HHmmss`（本地时间，手写 pad，不依赖 locale） |
| `duplicateOf(file: ReaderNotesFile, key: string): string \| undefined` | `key` = `docPathKey + "\u0000" + page + "\u0000" + 归一化 text`（§5.2），命中返回既有 `id` |

错误码 → 中文 `error` 文案（主进程产出，渲染层可直接展示，也可按 `code` 覆写）：

| code | 中文 error |
| --- | --- |
| `no-root` | 尚未选择资料库根目录 |
| `outside` | 该文档不在当前资料库内 |
| `invalid-input` | 笔记数据不合法 |
| `too-long` | 选中内容过长（超过 4000 字），请分段摘录 |
| `not-found` | 笔记不存在（可能已被删除） |
| `corrupt` | 笔记文件无法读取（文件已损坏，未被修改） |
| `version-unsupported` | 笔记文件版本不支持 |
| `read-failed` | 笔记文件读取失败 |
| `write-failed` | 笔记写入失败 |
| `empty` | 暂无笔记可导出 |
| `not-corrupt` | 笔记文件未损坏，无需重建 |

### 2.2 IPC 契约（A 周期一次冻结，六条）

通道名、预加载方法、返回值严格如下（PRD §4 N18 冻结版）：

| 通道 | preload 方法 | 入参 | 成功返回 | 失败码 |
| --- | --- | --- | --- | --- |
| `notes-load` | `notesLoad()` | — | `{ success: true, notes, filePath }` | `no-root` / `read-failed` / `corrupt` / `version-unsupported`（`notes: []`，`filePath` 仍给出绝对路径，供「在文件夹里显示」） |
| `notes-add` | `notesAdd(draft)` | `ReaderNoteDraft` | `{ success: true, notes, note }`；重复时 `{ success: true, notes, duplicateOf }`（不新增条目） | `no-root` / `outside` / `too-long` / `invalid-input` / `corrupt` / `version-unsupported` / `read-failed` / `write-failed` |
| `notes-update` | `notesUpdate(id, comment)` | `id: string`, `comment: string` | `{ success: true, notes, note }` | `not-found` / 上述读写类 |
| `notes-delete` | `notesDelete(id)` | `id: string` | `{ success: true, notes }` | `not-found` / 上述读写类 |
| `notes-export` | `notesExport()` | — | `{ success: true, filePath, count }` | `no-root` / `empty`（0 条）/ `corrupt` / `version-unsupported` / `write-failed` |
| `notes-reset` | `notesReset()` | — | `{ success: true, notes: [], backupPath }` | `no-root` / `not-corrupt` / `write-failed` / `read-failed` |

统一规则（渲染层必须照此消费）：

1. **变更类通道（add/update/delete）成功时返回「最新全量列表」**，渲染层用它整体覆盖本地 `notes`。
2. **`success: false` 时 `notes` 恒为 `[]`，渲染层不得用返回值覆盖本地列表**（避免一次失败把面板清空）。
3. `notes-load` 失败时同样返回 `notes: []`，渲染层进入**错误态**而不是空态。
4. `notes-export` 不返回列表（不改变笔记数据），只返回产物路径与条数。
5. 所有 `error` 为中文；渲染层按 `code` 决定是否展示逃生口按钮（仅 `corrupt` / `version-unsupported`）。

`ipc-handlers.ts` 的守卫与注册（与既有 `guardLibraryPath` 同风格，`unknown` → 窄化，失败返回中文错误）：

```ts
function isNoteDraft(value: unknown): value is ReaderNoteDraft;   // 三字段类型检查（形状）
function isNoteId(value: unknown): value is string;               // 非空字符串
function isNoteComment(value: unknown): value is string;          // 允许空串
function invalidNotesInput(): ReaderNotesMutationResult;          // { success: false, notes: [], code: "invalid-input", error: "笔记数据不合法" }
```

注册位置：`registerIpcHandlers()` 内新增一节 `// Reader notes`，紧接 `Library` 一节之后：

```ts
ipcMain.handle("notes-load", () => loadNotes());
ipcMain.handle("notes-add", (_event, draft: unknown) => (isNoteDraft(draft) ? addNote(draft) : invalidNotesInput()));
ipcMain.handle("notes-update", (_event, id: unknown, comment: unknown) =>
  isNoteId(id) && isNoteComment(comment) ? updateNoteComment(id, comment) : invalidNotesInput());
ipcMain.handle("notes-delete", (_event, id: unknown) => (isNoteId(id) ? deleteNote(id) : invalidNotesInput()));
ipcMain.handle("notes-export", () => exportNotesMarkdown());
ipcMain.handle("notes-reset", () => resetCorruptNotes());
```

守卫只做「形状」，语义校验（路径归属、归一化、限额、去重）全部在 `notes-store.ts`——**两层职责不重叠**。

### 2.3 preload 变更（`pix/src/main/preload.ts`）

接口新增（`PixApi` 内新起 `// Reader notes` 注释段，放在 Library 段之后）：

```ts
notesLoad: () => Promise<ReaderNotesLoadResult>;
notesAdd: (draft: ReaderNoteDraft) => Promise<ReaderNotesMutationResult>;
notesUpdate: (id: string, comment: string) => Promise<ReaderNotesMutationResult>;
notesDelete: (id: string) => Promise<ReaderNotesMutationResult>;
notesExport: () => Promise<ReaderNotesExportResult>;
notesReset: () => Promise<ReaderNotesResetResult>;
```

实现一律 `ipcRenderer.invoke("notes-…", …) as Promise<…>`（显式 `as` 与既有 `libraryReadFile` 同风格，避免 `any` 外溢）。类型名追加进文件顶部既有的 `import type { … } from "../shared/types.js";` 块。

### 2.4 路径越界校验（复用 `library-root.ts`，不改它）

- `notes-add` 的 `docFilePath`：`resolve()` 后必须通过 `isLibraryFilePath()`（该函数已处理大小写归一、`..` 逃逸与 symlink 的 `realpath` 复核）。不通过 → `code: "outside"`。
- **不校验文件是否存在**：文档被移动/删除是跳转期的问题（§5.1），按内容摘录时文件必然存在。
- 渲染层不传任何存储路径；`notes.json` 的绝对路径只在返回值里出现，仅用于展示与 `libraryShowInFolder`。

### 2.5 原子写（`writeNotesFile` / 导出共用）

```
ensureNotesDir(dir)                       // 目录被用户删掉也能自愈（N18 验收 5）
writeFileSync(tmp, json, "utf-8")         // 失败 → return { ok:false, error }
renameSync(tmp, target)                   // 失败 → rmSync(tmp,{force:true}) + return { ok:false }
```

- 读-改-写全在一个同步函数体内，**中间不允许 `await`**（编译期约束 + 代码评审项）。
- 导出用同一协议写 `notes.md.tmp` → `notes.md`。

### 2.6 导出 Markdown（模板冻结）

文档顺序：**按 `docPath` 比较键升序**，组内按 `page` 升序、再按 `createdAt` 升序。注意：**导出不依赖「当前文档」**（面板的「当前文档组置顶」是视图规则，导出必须与打开哪个文档无关，保证幂等与可 diff）。

```markdown
# 阅读笔记 · <工作区目录名>

> 由 PiX-Read 导出生成，每次导出都会覆盖。资料库：<工作区目录名>；生成时间：2026-09-14 20:31:07；共 6 条。

## papers/attention.pdf（3 条）

### 第 5 页

> The dominant sequence transduction models are based on complex recurrent or
> convolutional neural networks.

备注：这一页给出了全篇的出发点。

### 第 12 页

> We call our model the Transformer.

---

## notes/survey.pdf（3 条）
...
```

规则：原文按 `text` 原样输出、每行前缀 `> `（归一化后通常单行）；`comment` 为空时**整行不输出**；组之间用空行分隔，条目之间用 `---`；工作区名取 `basename(getLibraryRoot())`；时间戳用 `formatStamp`（本地时间，无 locale 依赖）。

## 3. 渲染层状态归属

### 3.1 结论

**新建 `pix/src/renderer/stores/notes-store.ts`（pinia setup store，`defineStore("notes", …)`）；`reader-store` 只加 N20 的 3 项落页意图，不改既有字段语义。**

理由（对照实际代码，不是原则性说辞）：

1. `reader-store.ts` 的文件头写死了它自己的范围：「Single source of truth for the center reading pane … Later agents should read/write these fields instead of changing this file」。笔记是**工作区级、跨文档**资产，生命周期与「当前打开的文档」不同（切换文档不重置笔记，返回首页才重置）。
2. `reader-store` 由 `ReaderPanel` 的 `watch(filePath)` 通过 `openDocument()` 驱动重置；把持久化与 IO 塞进去会让「打开文档」这个高频动作带上写盘风险面。
3. N20 的契约只要求 `reader-store` 增 `pendingJump` 三件套；把笔记数据放进去会迫使 B 的落页改动与 A 的数据层改动落在同一文件，破坏 A/B 文件集不相交的并行前提。
4. 面板只读 `readerStore.filePath`（当前文档判定与置顶），单向依赖，无循环（reader-store 不反向依赖 notes-store）。

### 3.2 `notes-store.ts` 字段与方法清单

```ts
// 状态
notes: Ref<ReaderNote[]>;                       // 主进程返回的全量列表，本地不做乐观合并
status: Ref<"idle" | "loading" | "ready" | "error">;
errorCode: Ref<ReaderNotesErrorCode | null>;    // 仅 load 级失败使用
errorDetail: Ref<string>;                       // 主进程 error 原文（错误态第二行）
notesFilePath: Ref<string>;                     // notes.json 绝对路径，来自 notes-load
lastExport: Ref<{ filePath: string; count: number; at: number } | null>;
currentDocOnly: Ref<boolean>;                   // N24 开关（视图状态，不持久化）

// 计算
totalCount: ComputedRef<number>;
currentDocKey: ComputedRef<string | null>;      // currentDocKey(readerStore.filePath, projectStore.currentProject?.path)
groups: ComputedRef<NoteGroup[]>;               // groupNotesByDocument(notes, currentDocKey, currentDocOnly)
errorMessage: ComputedRef<string>;              // code → 中文（见 §2.1 表），空 code 回落到 errorDetail
hasNotes: ComputedRef<boolean>;                 // 面板头部与导出按钮的禁用条件

// 动作（返回值为「瞬时结果」，load 级错误只由 loadNotes/recoverCorruptNotes 写）
loadNotes(): Promise<void>;
addNote(draft: ReaderNoteDraft): Promise<AddNoteResult>;
updateNoteComment(id: string, comment: string): Promise<NotesActionResult>;
removeNote(id: string): Promise<NotesActionResult>;
exportMarkdown(): Promise<ExportNotesResult>;
recoverCorruptNotes(): Promise<NotesActionResult>;   // P1 UI 消费；与 N25 按钮同批交付
resetNotes(): void;                                  // 清空全部本地状态（含 lastExport）
setCurrentDocOnly(value: boolean): void;
```

本文件导出的类型：`AddNoteResult`、`ExportNotesResult`（跨文件被组件消费）。`NotesActionResult` 等只在本文件使用，不导出（不留未使用导出）。

```ts
export type AddNoteResult = { ok: true; duplicate: boolean; page: number } | { ok: false; message: string };
export type ExportNotesResult = { ok: true; filePath: string; count: number } | { ok: false; message: string };
```

不变式（实现时必须满足，评审逐条核对）：

1. **只有 `success === true` 的变更返回才覆盖 `notes`**；`success === false` 只产生瞬时结果（面板提示），不动列表。
2. **`status/errorCode/errorDetail` 只由 `loadNotes()` 成功/失败与 `recoverCorruptNotes()` 写**；导出失败、删除失败等**不**把整个面板推入错误态（它们可能只是目录只读或条目已被删）。
3. **跨工作区残留防护**：`resetNotes()` 在 `WorkspacePage.goHome()` 与 `onUnmounted` 各调一次；`loadNotes()` 覆盖式写入。
4. **读写竞态防护**：模块内 `let writeSeq = 0`，每次变更成功后 `writeSeq++`；`loadNotes()` 记录起点的 `writeSeq`，返回时若已变化则**丢弃该次结果**（防止「先发起的 load 覆盖后完成的 mutation」）。这是唯一需要显式竞态处理的地方。
5. **当前文档判定集中在 store**：面板不接收 `currentDocPath` prop，避免第二真相源；`currentDocKey` 由 `readerStore.filePath` + `projectStore.currentProject.path` 派生（`useProjectStore()`/`useReaderStore()` 在 setup 内调用，单向依赖）。
6. `notes-store.ts` 不 import `fs`/`path`，不拼接任何存储路径。

### 3.3 纯工具 `pix/src/renderer/utils/notes-path.ts`

渲染层唯一的路径/分组规则点（与 `project-store.normalizePath` 的大小写约定一致）：

```ts
export interface NoteGroup {
  key: string;            // docPathKey
  docPath: string;        // 展示用（保留大小写）
  displayName: string;    // 末段文件名
  isCurrentDoc: boolean;
  notes: ReaderNote[];
}

export function docPathKey(path: string): string;                       // 小写 + 正斜杠 + 去尾斜杠
export function currentDocKey(filePath: string | null, root: string): string | null;  // 绝对 → 相对比较键，越界返回 null
export function docDisplayName(docPath: string): string;
export function absoluteDocPath(root: string, docPath: string): string; // 去尾斜杠 + "/" + docPath（正斜杠，Windows 可用）
export function groupNotesByDocument(notes: ReaderNote[], currentKey: string | null, onlyCurrent: boolean): NoteGroup[];
```

- `currentDocKey` 全部运算在**小写域**内完成（`abs` 与 `root` 都过 `docPathKey` 再取前缀差），避免大小写变换导致的下标错位。
- `groupNotesByDocument` 的**排序规则（写死，N19 验收 1）**：当前文档组置顶 → 其余按 `key` 升序（`localeCompare`）→ 组内 `page` 升序 → 同页 `createdAt` 升序。`onlyCurrent === true` 时只返回当前文档组（`currentKey === null` 时返回空数组）。
- 该文件是纯函数模块（除类型外无 import），可被临时脚本直接跑（§8.3）。

## 4. UI 结构与挂载点

### 4.1 面板位置结论：**左栏 pill 双标签（`资料库 | 笔记 N`）**

理由：阅读区宽度是主路径资源（已有 `.knowledge-map-slot` 在抢 26% 宽并带 `MIN_STAGE_WIDTH_FOR_MAP = 620` 守卫，再加一栏会触发第二套宽度守卫）；笔记是工作区级资产，与「资料库」同级语义正确；左栏已有 pill + 面板槽位，双标签的改动面只有 `WorkspacePage.vue` 一处 pill 与一个 `v-show`。

### 4.2 `WorkspacePage.vue` 改动（挂载点）

- 新增 `const leftTab = ref<"library" | "notes">("library");`
- `.pane-pill`（现 175–193 行）结构改为：`返回首页按钮 | 两个标签按钮 | 折叠按钮`：
  - 标签按钮复用现有 `pill-icon-btn`/`pill-label` 的视觉语言，新增 `.pill-tab` / `.pill-tab.active` 两个 class；`title` 分别放工作区绝对路径与 `notes.json` 绝对路径。
  - 笔记标签文案：`笔记`；`notesStore.totalCount > 0` 时追加 ` {{ totalCount }}`（0 条不显示数字）。
  - 按钮加 `data-tab="library"` / `data-tab="notes"`（离屏走查与人工定位的稳定钩子，见 §8.5）。
- 面板主体：

```html
<LibraryPanel v-show="leftTab === 'library'" class="pane-body" … />
<NotesPanel v-show="leftTab === 'notes'" class="pane-body" @open-note="onOpenNote" />
```

  **两个组件都常挂载**（`v-show` 而非 `v-if`）：资料库文件树的展开状态必须跨标签保留（N19 验收 2），`NotesPanel` 也无需重建。

- 生命周期：`onMounted` 的 `syncWorkspaceState(...)` 之后 `await notesStore.loadNotes()`；切到笔记标签时 `void notesStore.loadNotes()`（PRD 反需求 11：「打开面板」是允许的读取时机）；`goHome()` 末尾 `notesStore.resetNotes()`；`onUnmounted` 末尾再调一次 `resetNotes()`（覆盖「回首页 → 打开另一工作区」时不经过 `goHome` 的路径）。
- 跳转入口 `onOpenNote` 见 §5.1。

### 4.3 新组件 `pix/src/renderer/components/workspace/NotesPanel.vue`

职责（一段话）：左栏「笔记」标签的主体面板——把 `notes-store` 的全量笔记按文档分组展示，提供条目级跳转、删除二次确认、P1 的备注编辑与「仅看当前文档」过滤，承载导出 Markdown 的入口与结果行，并区分加载态/空态/错误态三态；自身**不做任何存储路径拼接与 IO**，全部经 store。

结构（class 名冻结，供离屏走查与后续样式收敛）：

```
.notes-panel
├─ .notes-header            「共 N 条」+ 「导出 Markdown」按钮 +（P1）「仅看当前文档」v-switch
├─ .notes-notice            瞬时行内提示（删除失败/导出失败/已备份）；4s 自动消失或点 × 关闭
├─ .notes-export-row        导出成功后：已导出 N 条 → .pix-read/notes.md + 「在文件夹中显示」
├─ .notes-loading           v-progress-circular
├─ .notes-error             错误态：图标 + 中文原因 + errorDetail + 「重试」+「在文件夹中显示」+（P1）「备份原文件并新建空库」
├─ .notes-empty             空态：图标 + 「还没有摘录」+「在 PDF 中选中文字，点「摘录」保存到这里」
└─ .notes-group (v-for groups)
   ├─ .notes-group-head     displayName（主）+ docPath（次，title 全路径）+ 「共 N 条」+（当前文档）v-chip
   └─ .note-row (v-for notes)
      ├─ .note-page-badge   「第 N 页」
      ├─ .note-text         v-show 折叠时 3 行截断；具体规则见 §5.5
      ├─ .note-expand       展开全文 / 收起（仅长文本渲染）
      ├─ .note-comment      P1 备注展示 / 行内编辑（v-textarea auto-grow）
      ├─ .note-time         相对时间（本地内联函数，唯一调用点，不新建 util）
      └─ .note-delete       删除（二次确认，见 §5.3）
```

组件契约：`defineEmits<{ "open-note": [note: ReaderNote] }>()`，**无 props**（当前文档与数据都来自 store，避免双真相源；与 `PRD §4 N24` 的「WorkspacePage 传入当前文档路径」相比改为 store 内派生，属实现层等价简化，见 §10 决策 5）。

行点击语义：`.note-row` 本体是跳转目标（`@click` → `emit("open-note", note)`）；`.note-delete`、`.note-expand`、备注编辑区一律 `@click.stop`。

### 4.4 与 `PdfSelectionQuickAsk.vue` 的关系（N17）

- 浮层由单按钮变双动作横排：`[问 AI] [摘录]`，整条浮层沿用 `@pointerdown.prevent`（点击不丢选区）。
- 「问 AI」链路**零改动**：仍走 `emitQuickAsk(text)` 的 module-level seam。
- 「摘录」**不新增 seam**：直接调 `notesStore.addNote(draft)`。理由：seam 的存在理由是生产者在 A 组件、消费者在 B 组件（ChatPanel）；这里 Store 就是消费者，加一层转发只是噪音。
- 摘录按钮的出现条件（写死）：`readerStore.pageCount > 0`（PDF 已加载；文本预览下 `openDocument()` 会把 `pageCount` 清 0）**且** `resolveSelectionPage(range, stage) !== null`。条件不满足时**只显示「问 AI」**（N17 验收 3：不出现可点击但必然失败的入口）。
- 浮层状态机（三态原位反馈，不弹对话框）：`mode = "actions" | "feedback"`；`feedback = { kind: "ok" | "duplicate" | "error"; text: string }`。
  - 点「摘录」期间 `pending === true`，两个按钮 `:disabled`（同时主进程去重兜底，连点也不会产生两条）。
  - 成功 → `已摘录 · 第 N 页`（N 用本地解析出的页码，与写入值一致）；重复 → `已在笔记中`；失败 → `摘录失败：<中文原因>`。
  - 约 2.5s 后回到 `actions`（选区仍在则继续可用；选区已被清空则隐藏）。
  - 浮层原有的「滚动即隐藏」规则**保持不变**（含反馈期间）：浮层是瞬时控件，持久证据是面板计数；新增第二条可见性规则会让三处状态互相打架。
- 页码解析放新文件 `pix/src/renderer/utils/note-capture.ts`（纯函数、无 store 依赖），只导出**一个**函数：

```ts
/** 选区锚点所在的 [data-page] 页节点 → 页码；失败时按选区矩形命中的页节点回退；跨页取起始页。 */
export function resolveSelectionPage(range: Range, stage: HTMLElement): number | null;
```

  实现要点：`range.startContainer` 向上找最近的 `[data-page]` 且必须仍在 `stage` 内 → 读 `dataset.page` 得正整数；失败则取 `range.getBoundingClientRect()` 的 `top + 1` 做纵向命中（命中失败取垂直距离最近的页节点）；仍失败返回 `null`。**不接受**「当前滚动页」作为来源（N17 验收 2 的构造场景就是「滚动标记页 ≠ 选中页」）。
  `note-capture.ts` **不含** 原文归一化与绝对路径拼接：归一化是主进程单点职责（§2.1），绝对路径直接取 `readerStore.filePath`（避免同一规则两处实现漂移，也避免未调用代码）。

### 4.5 Vuetify 选型（逐条已核实存在与属性名）

核对来源：`pix/node_modules/vuetify@3.12.7/lib/components/**` 类型定义 + `pix/src/renderer/main.ts` 的全局注册与 `defaults`。

| 用途 | 组件与属性 | 依据 |
| --- | --- | --- |
| 头部按钮（导出/重试/在文件夹中显示/展开） | `<v-btn size="small" variant="text/tonal" prepend-icon="mdi-…">` | 全仓库既有用法；`main.ts` 默认 `variant: text, density: comfortable, rounded: sm` |
| 图标 | `<v-icon size="12..48">mdi-…</v-icon>` | 既有用法，`@mdi/font` 已装 |
| 加载态 | `<v-progress-circular indeterminate size="24" />` | `ReaderPanel.vue` / `PdfViewer.vue` 既有用法 |
| 「仅看当前文档」 | `<v-switch density="compact" hide-details color="primary" />` | `VSwitch` 有 `hideDetails: "auto" \| boolean`、`density`；默认色已是 primary |
| 备注编辑 | `<v-textarea v-model="draft" auto-grow rows="2" density="compact" hide-details />` | `VTextarea` 有 `autoGrow`（`VTextarea.d.ts:65`）；默认 `variant: outlined` |
| 「当前文档」标记 | `<v-chip size="x-small" variant="tonal" color="primary">当前文档</v-chip>` | `VChip` 有 `size`；`ChatPanel` 有 chip 视觉先例 |
| 页码徽标 / 路径 / 计数 | 自绘 `span` + CSS 变量 | 与 `KnowledgeMap` 行样式一致；避免引入第二套视觉语言 |
| **禁用** | `<v-expand-transition>`、`<v-tabs>` | `vuetify/components` 顶层**不导出** `VExpandTransition`（仅 `lib/components/transitions`）；pill 标签沿用自绘按钮以贴合 `.pane-pill` 既有半径/高度变量，`v-tabs` 会破坏 pill 视觉 |

样式一律用 `variables.css` 既有变量（`--pix-text-xs/sm`、`--pix-accent`、`--pix-bg-hover`、`--pix-error`、`--pix-radius-md/lg`、`--pix-shadow-xs/md`）。左栏可用宽度约 268px（`--pix-left-width`），正文用 `--pix-text-xs/sm`。

### 4.6 空态 / 错误态 / 反馈（含「是否用 snackbar」的结论）

**结论：本功能不使用全局 snackbar，全部行内反馈。** 理由：PRD 已为摘录明确否决全局 toast（反馈贴动作）；面板内同理——导出结果行、错误态、`.notes-notice` 三者都能在用户视线内原位呈现，且避免与阅读区的浮层/Esc 抢注意力。`v-snackbar` 只在 `HomePage.vue` 用于首页级提示，笔记面板不新增第二条提示通道。

文案表（中文，冻结）：

| 场景 | 文案 |
| --- | --- |
| 面板标题 | `笔记`（标签）、`共 N 条`（头部） |
| 空态 | 图标 `mdi-notebook-outline` + `还没有摘录` + `在 PDF 中选中文字，点「摘录」保存到这里` |
| 错误态标题 | 按 §2.1 表；`corrupt` = `笔记文件无法读取` |
| 错误态动作 | `重试`、`在文件夹中显示`、（P1）`备份原文件并新建空库` |
| 导出按钮 | `导出 Markdown`；0 条时按钮文案改为 `暂无笔记` 且禁用 |
| 导出成功行 | `已导出 N 条 → .pix-read/notes.md` + `在文件夹中显示` |
| 导出失败 | `导出失败：<中文原因>`（`.notes-notice`，error 配色） |
| 删除待确认 | 按钮变 `确认删除`（3s 超时复位） |
| 删除失败 | `删除失败：<中文原因>` |
| P1 备份成功 | `已备份原文件为 notes.json.corrupt-<时间戳>，并新建空库` |
| 浮层 | `摘录` / `已摘录 · 第 N 页` / `已在笔记中` / `摘录失败：<原因>` |

## 5. 交互细节与边界

### 5.1 跳回原文（N20，含跨文档时序）

`reader-store.ts` 新增（**只加这三项**，既有字段语义不动）：

```ts
const pendingJump = ref<{ filePath: string; page: number } | null>(null);

function requestJump(filePath: string, page: number): void {
  const current = filePath.value;
  if (current && pageCount.value > 0 && samePath(current, filePath)) {
    gotoPage.value = page;                 // 同文档已加载：直接走既有落页通道
    return;
  }
  pendingJump.value = { filePath, page };
}

function takePendingJump(filePath: string): number | null {
  const intent = pendingJump.value;
  if (!intent || !samePath(intent.filePath, filePath)) return null;
  pendingJump.value = null;
  return intent.page;
}
```

`samePath(a, b)` 为文件内 3 行私有函数：`toLowerCase().replace(/\\/g, "/")` 后比较（与 `project-store.normalizePath` 同约定；单调用点场景内联，不新建 util）。

`openDocument(path)` 末尾追加清理（N20 契约）：

```ts
if (!path || !pendingJump.value || !samePath(path, pendingJump.value.filePath)) {
  pendingJump.value = null;
}
```

`PdfViewer.loadPdf()` 变更（`PdfViewer.vue:646-647` 两行处）：

```ts
observePages();
scrollToPage(readerStore.takePendingJump(filePath) ?? 1);   // 原为 scrollToPage(1)
rendered = true;
```

失败路径（`catch (err)` 内、判过 `generation` 之后）：`readerStore.takePendingJump(filePath);`（丢弃结果即清除意图，保持 API 仍是「消费式」三件套，不新增 `clearPendingJump`）。

`WorkspacePage.onOpenNote(note)`（跳转入口，页面持有 `selectedFilePath`）：

```ts
function onOpenNote(note: ReaderNote): void {
  const root = projectStore.currentProject?.path ?? "";
  const target = absoluteDocPath(root, note.docPath);
  readerStore.requestJump(target, note.page);   // 同文档已加载 → 内部直接 gotoPage
  if (selectedFilePath.value !== target) selectedFilePath.value = target;  // 否则触发 openDocument + 加载
}
```

意图全生命周期（写死，评审对照）：

| 时刻 | pendingJump |
| --- | --- |
| `requestJump` 命中当前已加载文档 | 不写（直接 `gotoPage`） |
| `requestJump` 未命中（未打开/仍在加载/非 PDF） | 写入 `{filePath, page}` |
| `openDocument(x)`：`x` 与意图路径相同 | **保留**（跨文档跳转的关键：`ReaderPanel.watch` 先于加载调用） |
| `openDocument(x)`：不同路径或 `null` | 清除（防旧意图劫持后续打开；N20 验收 5） |
| `PdfViewer` 加载成功 | `takePendingJump(filePath)` 消费并清除 |
| `PdfViewer` 加载失败 | `takePendingJump(filePath)` 丢弃并清除 |

竞态核对（N20 验收 3「A 数据加载中再点第二条不同页」）：第一次点击写 `{A,5}` → `selectedFilePath = A` → `openDocument(A)` 保留意图 → `loadPdf(A)` 进行中；第二次点击 `pageCount` 仍为 0 → 覆盖为 `{A,9}`；加载完成时消费到 9 → 停在最后一条（符合验收）。若加载在两次点击之间完成，则第二次点击走「已加载」分支直接 `gotoPage(9)`，结果一致。

其它边界：

| 情况 | 行为 |
| --- | --- |
| 未打开任何文档 | `selectedFilePath = A` → PDF 加载 → 消费意图落页 |
| 目标文件被移动/删除 | `libraryReadFile` 失败 → 阅读区既有中文失败态 + 意图被清除（验收 5） |
| 目标不是 PDF（被改名/替换成 `.txt`） | `ReaderPanel` 走文本预览；`openDocument` 已按路径匹配保留意图，但无 PDF 消费方；下一次 `openDocument(其它路径)` 因不匹配而清除（验收 6：不报错、不误跳） |
| 意图路径不在资料库内（手工改坏 `docPath` 会被 §1.4 判损坏，这里只兜底 UI） | `absoluteDocPath` 产物会被 `preflightLibraryPath` 拦下，阅读区显示「该文件不在当前资料库内」 |

### 5.2 重复摘录去重（N23，判定在主进程）

- 键 = `docPathKey(docPath)` + `"\u0000" + page` + `"\u0000" + 归一化 text`（主进程内比较；`docPath` 比较键小写、正斜杠 —— 验收 4）。
- 命中 → **不新增条目**，`notes-add` 返回 `{ success: true, notes, duplicateOf: <既有 id> }`；浮层显示 `已在笔记中`；标签计数不变（验收 1：连点也只有一条）。
- 同页重复、跨页同文本 = 两条（页码参与键，验收 3）。
- 归一化只此一处（`normalizeNoteText`），改动只影响新写入；已存数据不做迁移。

### 5.3 删除确认（不做撤销）

- 第一次点击 `.note-delete` → 该行进入待确认：按钮文案变 `确认删除`、行加 `.confirming` 淡红底；同时启动 3s 定时器，超时复位。
- 第二次点击（3s 内）→ 调 `removeNote(id)`；成功由主进程返回的全量列表驱动列表刷新。
- 「点其它位置取消」：待确认期间在 `document` 上挂 `pointerdown` 监听（capture 阶段）取消；`.note-delete` 自身 `@pointerdown.stop` 屏蔽自身触发（`pointerdown` 先于 `click`，不加 `stop` 会「先取消再确认」）。
- 撤销（5s）本轮不做（PRD P2）：需要主进程恢复语义 + 渲染缓冲，5s 二次确认已覆盖误触。

### 5.4 排序规则（多文档）

| 场景 | 规则 |
| --- | --- |
| 面板分组顺序 | 当前文档组置顶 → 其余按 `docPathKey` 升序 |
| 组内 | `page` 升序 → `createdAt` 升序 |
| 导出 Markdown | 全部按 `docPathKey` 升序 → `page` → `createdAt`（**不看当前文档**，保证幂等与可 diff） |
| 空组 | 不产生（分组由数据派生） |

### 5.5 其它边界

- **长文本**：`.note-text` 折叠态用 CSS 三行截断（`display:-webkit-box; -webkit-line-clamp:3; overflow:hidden`）；`note.text.length > 180` 时渲染 `.note-expand`（启发式阈值，避免每行测量 DOM 宽度）。展开只改本地视图状态，不写盘。
- **空/超长**：归一化后为空 → `invalid-input`（UI 不会产生，浮层要求 ≥2 字符）；>4000 → `too-long`，浮层显示中文原因，**不静默截断**。
- **非 PDF**：无「摘录」按钮（§4.4 条件）；笔记面板仍可展示已存在的 PDF 笔记。
- **跨工作区**：`loadNotes` 覆盖 + `resetNotes`（`goHome` / `onUnmounted`）→ B 工作区不显示 A 的笔记（N18 验收 6）。
- **`.pix-read` 可见性**：资料库树不显示（既有 `startsWith(".")` 规则），唯一发现入口是导出行与错误态的「在文件夹中显示」（`libraryShowInFolder`，`ipc-handlers.ts` 既有实现）。
- **不加监听**：不 watch `notes.json` 外部改动（PRD 反需求 11）；读取时机只有：进工作区、切到笔记标签、保存、删除、导出。

## 6. 与 agent 的联动预留（只留 seam，不写 stub）

| 扩展点 | 本轮已冻结（实现层） | 将来接入位置（本轮不写） |
| --- | --- | --- |
| 笔记作为 agent 上下文 | `ReaderNote` 的 `id / docPath / page / text / comment`；主进程已有 `loadNotes()` 可按文档过滤 | `utils/reading-context.ts` 的 `ReadingSendContext` 增 `notes` 字段；`ChatPanel.vue` 的 `ContextChipKind`（现为 `"document" \| "selection"`）增 `"notes"` chip；发送前显式勾选，绝不静默注入 |
| 基于笔记追问/复习 | 每条笔记自带定位三要素 | 面板行内「追问」动作复用 `useQuickAsk` 的 module-level seam（`registerQuickAskConsumer` 在 ChatPanel 侧已存在） |
| 笔记与知识地图联动 | 跳页统一走 `readerStore.gotoPage` / `pendingJump`（地图与笔记同一条通道） | `KnowledgeMap.vue` 节点显示「本章 N 条笔记」 |
| AI 结论入库 | `kind: "excerpt" \| "answer"` + 读取容忍；导出的「AI 回答」小节留待 P2 | `ChatPanel.vue` 答案气泡：在 `.agent-message` 内、`.message-copy-btn` 旁新增第二个 hover 按钮「存为笔记」→ 调 `notesStore.addNote({ docFilePath: readerStore.filePath, page: readerStore.page, text })`；届时 `ReaderNoteDraft` 增加**可选** `kind`（新增可选字段不算契约变更） |
| 备份恢复 | `notes-reset` 产出 `notes.json.corrupt-<时间戳>` | 面板内「从备份恢复」 |

**明确不写**：不新增 `readNotesForDocument()` 之类未被调用的内部函数（将来注入直接复用 `loadNotes()` 后在内存里按 `docPathKey` 过滤）；不新增未使用的类型、占位组件、注释代码。

## 7. 开发包拆分（两个可独立验收的交付）

### 7.1 包 A：数据面 + 契约冻结（周期 1）

文件白名单（只允许改这些，逐条给出改什么）：

| 文件（绝对路径） | 动作 | 内容 |
| --- | --- | --- |
| `E:/develop/PiX-Read/pix/src/shared/types.ts` | 改 | §1.1 全部类型（新增 `Reader Notes Types` 一节；不改既有类型） |
| `E:/develop/PiX-Read/pix/src/main/notes-store.ts` | 新建 | §2.1 六个导出 + 内部函数；不 import electron |
| `E:/develop/PiX-Read/pix/src/main/ipc-handlers.ts` | 改 | §2.2 六条 handler + 三个守卫 + `invalidNotesInput()`；新增 import |
| `E:/develop/PiX-Read/pix/src/main/preload.ts` | 改 | §2.3 六个方法 + `import type` 追加 |
| `E:/develop/PiX-Read/pix/src/renderer/stores/notes-store.ts` | 新建 | §3.2 全部字段/计算/动作 |
| `E:/develop/PiX-Read/pix/src/renderer/utils/notes-path.ts` | 新建 | §3.3 五个函数 + `NoteGroup` |
| `E:/develop/PiX-Read/docs/pm/DEV-R5a-notes.md` | 新建 | 开发档：改动清单、`npm run check` 结果、契约对照自评 |

**A 不做**：任何组件（`NotesPanel.vue` / `PdfSelectionQuickAsk.vue` / `PdfViewer.vue` / `WorkspacePage.vue` / `reader-store.ts` 属 B）、`ChatPanel.vue`、`packages/*`、`pix-paths.ts`、`library-root.ts`、`types/rpc.ts`、`package.json`/lockfile、`.gitignore`。

A 的验收点：

1. `cd pix && npm run check` = 0 error（vue-tsc + 主进程 tsc + preload tsc）。
2. 六条通道名、preload 方法名、返回结构与 §2.2 表逐字一致；`notes-reset` 已交付但 UI 未消费（契约冻结项）。
3. `grep -n "notes-" pix/src/main/ipc-handlers.ts` 恰好 6 条 `ipcMain.handle`；`preload.ts` 恰好 6 处 `ipcRenderer.invoke("notes-…")`。
4. `notes-store.ts`（渲染层）无 `fs`/`path` import、无路径拼接；`pix/src/main/notes-store.ts` 无 `electron` import。
5. 无 `any`、无 `await import(`、无 `import("…")`；新增导出全部被调用（无死代码）。
6. `notes-path.ts` 可被临时 Node 脚本直接导入并跑通 §8.3 断言。
7. `notes.json` 的 schema/版本/限额/归一化/去重/原子写逐条对应 §1、§2.5、§2.6。

### 7.2 包 B：UI 与交互（周期 2）

文件白名单：

| 文件（绝对路径） | 动作 | 内容 |
| --- | --- | --- |
| `E:/develop/PiX-Read/pix/src/renderer/utils/note-capture.ts` | 新建 | §4.4 `resolveSelectionPage` |
| `E:/develop/PiX-Read/pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 改 | 双动作浮层 + 三态原位反馈 + 摘录按钮出现条件 |
| `E:/develop/PiX-Read/pix/src/renderer/components/workspace/NotesPanel.vue` | 新建 | §4.3 全量面板 + P1（备注编辑、仅看当前文档、逃生口按钮） |
| `E:/develop/PiX-Read/pix/src/renderer/pages/WorkspacePage.vue` | 改 | §4.2 双标签、`v-show`、`loadNotes` 时机、`goHome`/`onUnmounted` reset、`@open-note` |
| `E:/develop/PiX-Read/pix/src/renderer/stores/reader-store.ts` | 改 | §5.1 `pendingJump` / `requestJump` / `takePendingJump` + `openDocument` 清理（仅新增，不改既有字段语义） |
| `E:/develop/PiX-Read/pix/src/renderer/components/workspace/PdfViewer.vue` | 改 | §5.1 消费落页 + 失败清除（`loadPdf()` 的 `scrollToPage(1)` 一行 + catch 一行） |
| `E:/develop/PiX-Read/docs/pm/DEV-R5b-notes.md` | 新建 | 开发档：改动清单、`npm run check` 结果、逐条验收自评、未验证事项 |
| `E:/develop/PiX-Read/.gitignore`（P1） | 改 | 追加一行 `.pix-read/` |
| `E:/develop/PiX-Read/README.md`（P1） | 改 | 功能特性补一行（摘录/笔记/导出） |

**B 预期不改**：`ReaderPanel.vue`、`LibraryPanel.vue`、`AppLayout.vue`、`ChatPanel.vue`、`reading-prompt.ts`、`packages/*`。如确需改动，先回报理由。

B 的验收点：

1. `cd pix && npm run check` = 0 error；`npm run check` 之外不跑 build/test/package。
2. N17 验收 1–7（浮层、页码来源、无解析则无按钮、写入字段、连续摘录、文本预览无摘录、失败提示）。
3. N19 验收 1–7（分组/排序/计数即时、切标签保留文件树展开、空态三要素、错误态可区分、删除二次确认、长文本展开、切面板不动阅读区）。
4. N20 验收 1–6（同文档上跳、跨文档落目标页、加载中连点取最后一条、未打开文档、文件缺失、目标非 PDF）。
5. N21 验收 1–7（产物与模板、幂等覆盖、0 条禁用 + 主进程拒绝、失败不静默、`notes.json` 字节不变、文件头声明、在文件夹中显示）。
6. P1（尽量）：N22 备注编辑、N23 重复识别、N24 仅看当前文档、N25 逃生口按钮。
7. 无回归：文本预览无「摘录」、「问 AI」行为不变、资料库树不显示 `.pix-read`、知识地图/会话/错误兜底/框选截图链路不受影响。

### 7.3 顺序与交接

1. A 先交付并冻结契约（类型 + 六条通道 + 渲染层数据层），B 以冻结契约为输入开工；B 不得改通道名/返回结构，不得私改 `shared/types.ts` 既有字段语义（可加字段，不可改含义）。
2. A/B 文件集不相交（唯一共享面是 `shared/types.ts` 的**只读消费**与 store 的既有字段读取），可安全并行；`reader-store.ts` 仅 B 改。
3. 契约不足（例如缺必要字段）→ 回 PM 决策，不在 B 内私改。
4. 完成报告必须列：改动文件清单、`npm run check` 结果、逐条验收自评（P0 全部 + 已完成 P1）、未验证事项。

## 8. 风险与验证

### 8.1 风险清单

| # | 风险 | 概率/影响 | 应对（已内建在本设计中） | 判定手段 |
| --- | --- | --- | --- | --- |
| R1 | **写盘一致性**：全量重写被中断/并发破坏 → 截断文件、丢全部笔记；损坏文件被后续写覆盖 → 不可恢复 | 中/极高 | 主进程唯一写者；同步 fs；RMW 无 `await`；tmp+rename；损坏只报错不覆盖；`success:false` 不覆盖本地列表 | §8.2 静态核对 + §8.4 fixture 校验 + 人工破坏文件（PM） |
| R2 | **跨文档落页竞态**：`openDocument()` 重置 + `loadPdf()` 固定 `scrollToPage(1)`，外部观察者写 `gotoPage` 会「停在第一页」 | 高/高 | 消费式 `pendingJump` 三件套；`openDocument` 只在路径不匹配时清除；失败路径清除 | §8.5 只能人工/离屏走查；代码走查对照 §5.1 生命周期表 |
| R3 | **笔记身份分裂**：路径大小写/分隔符/盘符差异导致同文档裂成两组或跳转失配 | 中/中 | 主进程派生 POSIX 相对路径；比较统一走 `docPathKey`；`docPath` 非法（绝对/`..`）按损坏处理 | `grep -n "docPathKey\|currentDocKey\|absoluteDocPath" pix/src/renderer` 只应出现在 `notes-path.ts` 与消费点；跨工作区人工核对（§8.6 第 6 条） |
| R4 | **A/B 并行越界改文件**（典型：B 顺手改 `shared/types.ts` 语义或 `ChatPanel.vue`） | 中/中 | 白名单 + 冻结契约 + 「A 做完再开 B」的交接 | `git status` / `git diff --stat` 只读核对白名单；`grep` 检查 `ChatPanel.vue`/`reading-prompt.ts`/`packages` 零改动 |
| R5 | **主进程与渲染层归一化规则漂移**（两处实现 → 去重失效、上限不一致） | 中/中 | 归一化与限额只在 `notes-store.ts`（主进程）实现；渲染层 `note-capture.ts` 只做几何解析 | `grep -n "replace(/\\\\s" pix/src/renderer` 应为空；`grep -n "4000" pix/src` 只出现在主进程 §2.1 |
| R6 | **本轮无自动化测试**，时序类验收（2.5s 反馈、3s 二次确认、加载中连点）在静态检查下不可证 | 高/中 | 把不可自动化项集中列成 PM 走查清单（§8.6）；代码侧用确定性的状态机与单一来源替代观察式实现 | PM 真机走查；`npm run check` 保证类型与模板层不炸 |
| R7 | **左栏改动伤及既有布局**：双标签挤占 pill 宽度、文件树展开态丢失、面板宽度溢出 | 中/中 | `v-show` 而非 `v-if`（保留展开态）；标签沿用 pill 变量与既有字号；不改 `AppLayout.vue` | `npm run check` + 离屏截图（§8.5）+ 人工切换核对 |
| R8 | **`notes-reset` 在本轮未被 UI 消费（P1 顺延）** → 未调用方法（与「禁止死代码」冲突） | 中/低 | `recoverCorruptNotes()` 与 N25 按钮**同批交付或同批删除**；若 P1 顺延，B 的开发档必须写明该 store 方法随按钮顺延（A 侧通道保留，P1 恢复时零返工） | B 的开发档自评 + `grep -n "recoverCorruptNotes" pix/src/renderer` 出现次数 ≥2（store 定义 + 面板调用）或=0 且已记录顺延 |
| R9 | **导出内容与面板排序不一致被误判为 bug** | 低/低 | 设计上写死差异：导出不依赖当前文档（幂等/可 diff），面板当前文档置顶 | 导出两次比对字节相同；离线 diff 抽查 |

### 8.2 工程门（唯一强制命令）

```
cd pix && npm run check
```

必须 0 error。附加只读核对：

```
grep -n "notes-" pix/src/main/ipc-handlers.ts                       # 6 条 handle
grep -n "notesLoad\|notesAdd\|notesUpdate\|notesDelete\|notesExport\|notesReset" pix/src/main/preload.ts
grep -rn ": any\b\|as any\|<any>" pix/src/main/notes-store.ts pix/src/renderer/stores/notes-store.ts \
        pix/src/renderer/utils/notes-path.ts pix/src/renderer/utils/note-capture.ts \
        pix/src/renderer/components/workspace/NotesPanel.vue       # 应为空
grep -rn "await import(\|import(\"" pix/src/renderer pix/src/main   # 应为空
grep -rn "from \"electron\"" pix/src/main/notes-store.ts             # 应为空
grep -rn "notes.json" pix/src/renderer                               # 只允许出现在展示文案（如有）
git status --short && git diff --stat                                # 只读：核对白名单外零改动
```

### 8.3 纯函数烟测（可行，Node v24.19.0）

`notes-path.ts` 除类型外无 import，可直接被 Node 的类型剥离运行。临时脚本写到 `E:/tmp/r5-notes-smoke.mjs`（放仓库外，跑完删除）：

```js
import { docPathKey, currentDocKey, absoluteDocPath, groupNotesByDocument } from "file:///E:/develop/PiX-Read/pix/src/renderer/utils/notes-path.ts";
// 断言：当前文档组置顶；其余按 key 升序；组内 page 升序、同页 createdAt 升序；
//      onlyCurrent 过滤；currentDocKey 对越界路径返回 null；absoluteDocPath 用正斜杠拼接。
```

运行：`PATH="/c/Program Files/nodejs:$PATH" node --experimental-strip-types E:/tmp/r5-notes-smoke.mjs`。
（`import type { … } from "@shared/types"` 是纯类型导入，会被剥离，不触发别名解析；若 Node 报错，把该行删掉后改为本地 `jsdoc` 类型再跑，并把这一处偏差记录到开发档。）

### 8.4 落盘 fixture 校验（跑过真机后执行）

```bash
PATH="/c/Program Files/nodejs:$PATH" node -e "
const fs=require('fs');const p=process.argv[1];
const f=JSON.parse(fs.readFileSync(p,'utf8'));
const ok = f.version===1 && Array.isArray(f.notes) && f.notes.every(n=>
  typeof n.id==='string' && (n.kind==='excerpt'||n.kind==='answer') &&
  typeof n.docPath==='string' && !n.docPath.startsWith('/') && !n.docPath.includes('..') &&
  Number.isInteger(n.page) && n.page>=1 && typeof n.text==='string' && n.text.length>0 && n.text.length<=4000 &&
  typeof n.comment==='string' && Number.isFinite(n.createdAt) && Number.isFinite(n.updatedAt));
const ids=new Set(f.notes.map(n=>n.id));
console.log('schema ok:', ok, 'count:', f.notes.length, 'ids unique:', ids.size===f.notes.length, 'bytes:', fs.statSync(p).size);
" "<工作区根>/.pix-read/notes.json"
```

### 8.5 离屏截图走查（视觉三态，需 PM 授权启动 dev 服务）

前提：离屏截图能力已验证（`app.commandLine.appendSwitch("disable-gpu")` + `BrowserWindow({ show:false, webPreferences:{ offscreen:true } })` + `webContents.capturePage().toPNG()`）；`read` 工具可直接查看 png。**本轮禁止 `npm run dev` / `npm run build`**，因此走查脚本按「临时脚本」方式自建（跑完删除，全部落在仓库外）：

1. `E:/tmp/r5-shot/serve.mjs`：用 Vite 的 Node API 起 dev server（`import { createServer } from "file:///E:/develop/PiX-Read/pix/node_modules/vite/dist/node/index.js"`，`root: "E:/develop/PiX-Read/pix"`，端口 5178）。等价于 dev 服务，但不执行 npm 脚本、不改仓库文件。
2. `E:/tmp/r5-shot/main.cjs`：Electron 主进程 harness —— `disable-gpu`、offscreen `BrowserWindow(1280×820)`、`webPreferences.preload` 指向一个 **stub preload**（`contextBridge.exposeInMainWorld("pixApi", …)`，其中 `notesLoad` 返回 3 组共 6 条固定笔记、`libraryList` 返回固定树、`getSettings` 返回一个 recent project，其余方法返回最小合法值）。`loadURL("http://localhost:5178/")`。
3. 驱动：`webContents.executeJavaScript` 依次点击首页项目卡 → `document.querySelector('[data-tab="notes"]').click()` → 截空态；再让 stub 的 `notesLoad` 改为返回数据（或先点导出触发 reload）→ 截有数据态；再让 stub 返回 `{ success:false, code:"corrupt", error:"…", filePath:"<假路径>" }` → 截错误态。每态 `capturePage().toPNG()` 写 `E:/tmp/r5-shot/notes-<state>.png`。
4. 用 `read` 查看三张 png，核对：三态互不混淆、分组头/页码徽标/计数/导出按钮禁用态、无溢出与错位。

依赖本设计提供的稳定钩子：`[data-tab="library"]` / `[data-tab="notes"]`（§4.2）与 §4.3 的 class 名。**时序类与真实 IPC 类验收（R2/R6）离屏截图不能替代**，仍由 §8.6 的人工清单覆盖。

### 8.6 需人工（PM）判定的清单

1. 选中第 5 页文字时阅读器当前页指示为第 6 页 → 摘录页码仍为 5（N17 验收 2）。
2. 提示 2.5s 后恢复、删除 3s 二次确认超时复位、「点其它位置取消待确认」。
3. 跨文档跳转三时序（未打开 / 打开 B 时点 A / A 加载中连点两条）。
4. 「在文件夹中显示」能定位到 `.pix-read/notes.md`（隐藏目录，唯一发现入口）。
5. 重启一致性、手工改坏 `notes.json` 后写操作全部失败且文件字节不变、删除 `.pix-read` 后再摘录自愈。
6. 无回归：文本预览无「摘录」、资料库树不显示 `.pix-read`、文件树展开态跨标签保留、知识地图/会话/框选链路正常。

## 9. 验收对照表

| 需求 | 实现点 | 主要验收手段 |
| --- | --- | --- |
| N17 摘录 | `PdfSelectionQuickAsk.vue` + `note-capture.ts` + `notes-store.addNote` + `notes-add` | 人工 1/3/6；工程门；fixture 校验（字段） |
| N18 持久化 + 契约 | `shared/types.ts` + `main/notes-store.ts` + `ipc-handlers.ts` + `preload.ts` + `renderer/stores/notes-store.ts` + `notes-path.ts` | `npm run check`；§8.2 grep；§8.4 fixture；人工 5 |
| N19 面板 | `NotesPanel.vue` + `WorkspacePage.vue` 双标签 | 离屏三态截图；人工切换/空态/错误态/删除确认 |
| N20 跳回原文 | `reader-store` 三件套 + `PdfViewer.loadPdf` + `WorkspacePage.onOpenNote` | 人工 3；代码走查对照 §5.1 生命周期表 |
| N21 导出 | `exportNotesMarkdown` + 面板导出行 | 人工 4（幂等 + 字节不变 + 在文件夹中显示）；`node -e` 比对两次导出字节 |
| N22 备注（P1） | `notes-update` + 面板行内编辑 | 人工 + fixture（`comment`/`updatedAt`） |
| N23 去重（P1） | 主进程去重键 + 浮层文案 | 人工连点两次；fixture 条数 |
| N24 仅看当前文档（P1） | store `currentDocOnly` + `groups` | 人工开关；离屏截图 |
| N25 逃生口（P1） | `notes-reset` + `recoverCorruptNotes` + 错误态按钮 | 人工：备份文件存在且字节为原始内容；未损坏时拒绝 |

## 10. 决策记录（写死，防反复；含对 PRD 的实现层等价简化）

1. **面板放左栏双标签**（非右栏/抽屉）：阅读区宽度是主路径资源，已有知识地图在抢宽。
2. **导出为 `.pix-read/notes.md` 全量覆盖**（非 `exports/notes-<时间戳>.md`）：可外带、幂等、不产生目录垃圾；`notes.json` 仍是唯一事实源。
3. **删除用 3s 二次确认，不做撤销**：撤销需主进程恢复语义，收益边际。
4. **反馈全部行内，不引入全局 snackbar**：与「浮层原位反馈」的产品判断一致。
5. **`notes-store` 派生当前文档（读 `readerStore.filePath`）而非接收 prop**：单一真相源，避免镜像字段不同步；`WorkspacePage` 仅负责跳转入口（与 PRD §4 N24「传入当前文档路径」等价，落地更少状态）。
6. **`note-capture.ts` 只导出 `resolveSelectionPage`**：归一化与限额收敛到主进程单点，渲染层不做第二份规则（原 PRD §10.2 的「原文归一化预览」取消，因浮层展示只需要页码）。
7. **新增 `ReaderNotesResetResult` 类型名**（PRD 只点了四个结果类型）：`notes-reset` 的返回含 `backupPath`，与 `ReaderNotesMutationResult` 形状不同，单独命名更诚实。
8. **`takePendingJump` 承担「失败清除」**（加载失败路径调用并丢弃返回值），API 保持三件套，不新增 `clearPendingJump`。
9. **导出顺序不含「当前文档置顶」**：导出产物必须与打开哪个文档无关（幂等、可 diff）。
10. **不做 fsync、不做文件锁、不做多实例合并**：见 §1.5 的取舍理由与后果（掉电最多丢最后一次写；多窗口后写覆盖）。
11. **不新增 agent 侧未调用函数**：`loadNotes()` 已是将来按文档读取的复用点。

## 11. 交付说明（R5 收敛修复）

范围：只修验收阶段必须修的项——1 条代码评审 must-fix（渲染层读写竞态） + 1 条正确性项（备份覆盖） + 8 条视觉走查缺陷。`should-fix`/`info` 项留给下轮，逐条列在 §11.2 末尾。

### 11.1 改动文件清单

| 文件 | 改动 |
| --- | --- |
| `pix/src/renderer/stores/notes-store.ts` | `applyNotes()` 覆盖列表后补状态机复位：`status !== "ready"` 时置 `ready` 并清 `errorCode`/`errorDetail`；`loadNotes()` 丢弃分支在 `seq === loadSeq` 时仍写 `notesFilePath` |
| `pix/src/main/notes-store.ts` | 新增 `uniqueBackupPath()`（`existsSync` 判冲、冲突追 `-2`/`-3`…），`resetCorruptNotes()` 改用它；`node:fs` 导入追加 `existsSync` |
| `pix/src/renderer/components/workspace/PdfViewer.vue` | `renderPage()` 里对页容器 `style.setProperty("--scale-factor", String(viewport.scale))`；`.textLayer ::selection` 显式 `color: transparent` |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 头部 `countLabel` 计算（错误态为空、筛选态复合文案）；导出按钮错误态禁用 + `.notes-export-btn` 字号 11px；当前文档 chip `x-small` → `small`；`.notes-filter` 去掉 `-6px` 负左边距；空态/错误态 `flex: 1` + 垂直居中；组头加分隔线、路径行与文件名重复时不渲染；确认删除改为实底红按钮 |

未改动：`shared/types.ts`、`ipc-handlers.ts`、`preload.ts`、`reader-store.ts`、`WorkspacePage.vue`、`notes-path.ts`、`note-capture.ts`、`PdfSelectionQuickAsk.vue`、`pix/scripts/ui-shot.mjs`（走查脚本由并行会话维护，本次只读复用）。

### 11.2 关键实现决策

1. **竞态收敛在 `applyNotes()`，而不是在丢弃分支补状态**：写操作成功即证明数据可用，在覆盖列表的同一步把面板从 `loading`/`error` 复位，同一处覆盖两个同源症状（变更先于 load 落地导致永久 loading；`read-failed` 错误态下写入成功后面板仍停在错误态）。丢弃分支只丢数据、保留 `notesFilePath`，错误态仍能「在文件夹中显示」。
2. **备份名沿用记录格式 + 计数后缀**：PRD §8.1 写死 `notes.json.corrupt-<yyyyMMdd-HHmmss>`，改毫秒会让文档、文案与既有备份不一致，因此首份保持原格式，仅在同秒冲突时追加 `-N`（`renameSync` 在 Windows 上会静默覆盖同名目标，原文件是用户唯一副本）。
3. **文字层按 pdf.js 官方做法设 `--scale-factor`**：与 `PDFPageView` 一致设在页容器上，不去改 pdf.js 写入 span 的内联样式；`::selection` 显式透明前景，保证可见字形只有 canvas 一份，文字层只贡献选区几何。
4. **错误态头部保留结构、只清内容**：`countLabel` 在错误态返回空串（本地列表是读取失败前的旧值，不可信），导出按钮置灰而非隐藏——头部高度与筛选开关位置在三态间保持稳定。
5. **筛选态计数为复合文案**：`当前 N 条 / 共 M 条`（不是「当前文档 N 条 / 共 M 条」——实测后者在 268px 栏内会被导出按钮挤成两行，头部高度从 68px 跳到 83px；见 §11.3 第 2 项的 wrap 复现与修复后测量）。
6. **本轮未修（记录理由）**：`writeFileAtomic` 不做 fsync——技术设计 §1.5 已把「掉电最多丢最后一次写、不做 fsync」记为设计取舍而非遗漏；切标签时 `loadNotes` 入口置 `loading` 导致的闪一下（验证结论标为 info，非缺陷）；错误态下 tab pill 仍显示上次成功加载的计数（不在本次缺陷清单，且改它要动 `WorkspacePage.vue` 的 pill，超出收敛范围）；缺通道名常量源、`vuetify_guide/` 不存在、`ipc-handlers.ts` 的 `console.log` 等历史遗留。

### 11.3 真实验证

1. **工程门**：`cd pix && npm run check` → 退出码 0。

```
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

EXIT=0
```

2. **离屏走查**（`cd pix && electron scripts/ui-shot.mjs`，`PIX_SHOT_ROOT` 指向独立临时目录，脚本未改动）：28 张截图 + MANIFEST/MEASUREMENTS，退出码 0。修复后关键测量：
   - `pdf-text-layer-geometry`：`spanFontSize: "20px"`（修复前 14px）、`scaleFactorVar: "1"`、`canvasStyle.w: "595px"`、标题 span 宽 387px。
   - `list-current-doc-filter-on`：`count.h: 18`（单行；头部 68px，与关闭筛选一致）、`chip.fontSize: "10.5px"`（修复前 8.75px）、`exportBtn.fontSize: "11px"`（修复前 10.5px）。
   - 对齐：`trackBox.x: 19`、`thumbBox.x: 17`(OFF)/`37`(ON)（修复前 13/11/31），`count.x: 23`、`noteRow.x: 17`。
   - 筛选开启时 `groupPath: null`（当前文档在根目录，重复路径行不再渲染）。
   - 截图复核：`01b` 空态与 `10b` 错误态已垂直居中；`10b` 头部不再出现旧计数且「导出 Markdown」置灰；`05b` 确认删除为实底红按钮；`02b/02d` 组头有分隔线。
   - `09-notes-loading` 的头部仍展示上一次成功的计数且导出按钮可用：这是有意保留的（刷新中而非数据不可信；置空会让每次切标签都闪一下计数，与走查中「刷新期间保留旧列表」的 info 项同向）。
3. **文字层 A/B**（同一份代码只切 `--scale-factor`，仓库外探针）：`ab-with-fix.png` vs `ab-without-fix.png`。并排几何——修复后字号 `["20px","12px","12px","12px"]`、标题 span 宽 387px；清掉变量后 `["14px","14px","14px","14px"]`、标题 span 宽 271px（短于标题字形）而正文 span 宽 370px（长过正文）——即走查看到的「标题高亮框短一截、正文糊成一片」。
4. **主进程备份命名**（把 `notes-store.ts` 复制到仓库外，仅 `./library-root.js` → `.ts` 一处 specifier 差异；冻结 `Date.now()` 复现「同一秒内二次重建」）：

```
reset#1 → notes.json.corrupt-20260915-120301
reset#2 → notes.json.corrupt-20260915-120301-2
reset#3 → notes.json.corrupt-20260915-120301-3
PASS 三次重建都成功 / 备份名各不相同 / 三个备份文件都在 / 第一份备份内容未被覆盖 /
     第二份备份内容正确 / 备份名沿用记录的格式（首份无后缀） / 冲突时追加计数后缀 /
     空库拒绝重建且不改名 / 拒绝时目录无变化 / 重建后仍是可用空库
[probe] 全部通过（退出码 0）
```

5. **渲染层竞态**（离屏 Electron 里直接驱动真实 pinia store，stub 注入 `notesAdd`/`notesLoad` 延迟制造交错）：

```
交错结果：{"addAt":1212,"addOk":true,"loadStart":105,"loadAt":2311,"statusAfterLoad":"ready","noteCount":2}
面板状态：{"status":"ready","loadingVisible":false,"rowCount":2,"text":true}
错误态：{"status":"error","countText":"","exportDisabled":true} → 写入成功后 {"status":"ready","errorVisible":false,"rowCount":3,"countText":"共 3 条"}
PASS 变更先落地 / load 后落地（丢弃分支被命中） / 面板不停在 loading / 新摘录可见 /
     错误态写入成功后可恢复 / 错误态头部已无旧计数 / 写入成功后面板展示条目
[race] 全部通过（退出码 0）
```

   变更 1.212s 落地、load 2.311s 落地，旧实现此处会把 `status` 永久留在 `loading`（面板只剩 spinner，「重试」也不可见）。
6. **仓库卫生**：`git status --short` / `git diff --stat` 只读核对，改动仅落在上表 4 个文件；未执行任何 git 写命令、未跑 `npm run build`/`test`/`package`、未新增依赖；四个改动文件内无 `any`、无内联动态 import。

### 11.4 未验证项与原因

1. **需要真机指针/人手节奏的交互**：摘录后 2.5s 原位反馈、删除 3s 二次确认超时复位与「点其它位置取消」、`.notes-notice` 4s 消失。离屏走查走的是真实 DOM 与真实 store，但点击由脚本以固定间隔发出，不覆盖人手节奏与鼠标移动。
2. **真实主进程的写失败路径**：`write-failed`（目录只读、杀毒/索引器占用目标文件导致 `renameSync` 失败）、`notes-export` 产物与 `libraryShowInFolder` 定位 `.pix-read/notes.md` 未在本次修复中重跑（本轮改动未触及这两条链路，且需要真实主进程与文件系统权限构造）。
3. **高 DPI 取证**：`--force-device-scale-factor=2` 会把 CSS 视口压到 960×516 并切到 <960px 窄布局，文字层 A/B 与面板测量全部在 dpr=1 下取得；高 DPI 下文字层与 canvas 是否仍逐像素对齐未验证。
4. **备份命名修复的等价性**：行为验证跑在仓库外的复制件上（与仓库文件只差一处 import specifier），仓库内的正确性由 `npm run check` 类型检查与代码走查保证；未在真实资料库上跑 `notes-reset`。
5. **错误态下切库/重开工作区**：`resetNotes()` 与 `recoverCorruptNotes()` 的状态迁移未重新走一遍（本轮只改了 `applyNotes()` 的复位条件，二者仍按原契约写状态）。
