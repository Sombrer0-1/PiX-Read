# PiX-Read R10 设计档 · 规模可用（N63–N72）

> 上游：`docs/pm/R10-req.md`（需求，N63–N72 与 §0 冻结值）、`docs/pm/R10-review.md`（需求评审：must-fix 8 条 + 次级项 8 条 + 已核对前提 8 条）、`docs/pm/PRD-V0.4.md` §2/§4/§7.5、`docs/pm/R9-design.md`（章节过滤与空态二分，本轮只在其**之后**追加视图维度）。
> 本档是「可直接开工的定稿设计」：IPC 与槽语义、store 字段与动作、纯函数签名与返回结构、DOM 类名与逐字文案、时序与竞态守卫、复制模板、failures 表、场景与断言、分工与回退全部写死到可判定粒度。**本档不改任何代码**，只新增这一份文档。
> 判定工具（与需求档一致）：【走查】只读 `git diff` / `git status` / `git show` 与文件内容；【check】`cd pix && npm run check`（唯一工程门）；【烟测】仓库外临时 tsconfig 编译后 node 直驱（跑完删除临时目录）；【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs`（退出码 0 + `MANIFEST.json.failure === null` + `MEASUREMENTS.json` 新增 4 组全绿 + 新增 18 张截图齐备）。
> 事实基线（本档引用的位置均为只读核对结果）：`pix/src/main/notes-store.ts` 的 `notesPaths` / `readNotesFile` / `writeFileAtomic` / `serializeNotes` / `duplicateKey` / `deleteNote` / `resetCorruptNotes`；`pix/src/main/ipc-handlers.ts:243`（`isNoteId`）、`:252`（`invalidNotesInput`）、`:465-481`（notes 六通道）；`pix/src/main/preload.ts:69-74` 与 `:156-162`；`pix/src/shared/types.ts:331-417`（`ReaderNote` / `ReaderNoteKind` / `ReaderNotesMutationResult.note?` / `ReaderNotesErrorCode`）；`pix/src/renderer/stores/notes-store.ts`（`groups` / `applyNotes` / `resetNotes` / `removeNote` / `runMutation`）；`pix/src/renderer/components/workspace/NotesPanel.vue`（`countLabel` / `filteredEmpty` / `setNotice` / `confirmDelete` / `DELETE_CONFIRM_MS` / `NOTICE_MS` / 空态 `v-else-if` 链）；`pix/src/renderer/utils/notes-path.ts`（`docPathKey` / `docDisplayName` / `rangeContains` / `matchesChapterFilter` / `groupNotesByDocument` / `sortNotesForContext`）；`pix/scripts/ui-shot.mjs:46`（`SEL`）、`:290`（`seedNotes`）、`:370`（`buildStub`）、`:1274`（`record`）、`:1955`（`notesHash`）、`:2120`（`typeAndSend`）、`:2542`（`rowFinder`）、`:4690-4706`（窗口配置）、`:4672`（`main`）。
> 窗口/剪贴板与写失败注入的实测结论直接引用需求评审 §0-7 / §0-8（同机同版本 Electron 33.4.11 已复现），本档不重复实验，只把结论写成可复跑步骤。

---

## 0. 口径修订（10 条，均为「需求档字面与可实现/可判定现状冲突」，本档就地对齐）

**修订 1（对应 must-fix 2）—— 归一化 query 的唯一来源 = `normalizeQuery`（`notes-view.ts`）+ store 的 `activeQuery`。**
§0.1 定「生效 ⇔ `rawQuery.trim() !== ""`」，但 §0.3 计数优先级 1、§0.4 空态 4a/4b/4c、§0.8 清空按钮 `v-if="query !== ''"` 四处都写成「`query`」，而 N63-2 又禁止面板二次 `trim`、§0.10 冻结的导出表里没有归一化函数 ⇒ 面板拿不到该值。
本档写死：`notes-view.ts` 增导出 `normalizeQuery(rawQuery: string): string`（**唯一 `trim` 判定点**，`matchesSearch` 内部亦调它，幂等）；store 增 `activeQuery = computed(() => normalizeQuery(searchQuery))` 与 `searchActive = computed(() => activeQuery !== "")`；上述四处条件**逐处改写**为 `notesStore.searchActive` / `notesStore.activeQuery`。面板与 store 内不得出现 `searchQuery.trim()`（面板仅允许既有的 `commentDraft.trim()`）。

**修订 2（对应 must-fix 3 第二半）—— `undoDelete()` 增第三种返回：`{ ok: false; stale: true }`。**
§0.6 冻结 `{ ok: true } | { ok: false; message: string }`，无法表达「响应所属的撤销目标已被替换 / 已复位」这一必须零副作用的结局；按「其它失败保留行到原到期时刻」处理会把新撤销行提前收掉，并把旧列表 `applyNotes` 回去（复活刚删除的新条目）。本档写死三态联合类型与三条守卫（§3.3）。

**修订 3（对应 must-fix 3 第一半）—— 撤销行的定时器挂在 `watch(pendingUndo)` 上，而不是挂载/进入时折算一次。**
`v-if` 元素在 `pendingUndo` A→B 时不卸载 DOM（复用同一元素），只在 `onMounted` 折算会让行按 A 的到期时刻消失。本档写死：单个 `watch(() => notesStore.pendingUndo, …)`（源取 **ref 本体**，store 每次删除都赋新对象字面量 ⇒ 覆盖 A→B 且不受同毫秒 `deletedAt` 相等影响），`immediate: true`，每次触发都先清旧定时器再按新对象重算。

**修订 4（对应 must-fix 4）—— N64-3 空态矩阵第 4/5 步改为「先删空该范围」。**
徽标仅在该范围 `count > 0` 时渲染（`KnowledgeMap.vue` 的 `v-if` 与 `countNotesByChapter` 只写 `total > 0`），点徽标后清空查询必然 `V ≥ 1`。本档把第 4 步写成「清空查询 → 删空该章节范围内两条 → `本章暂无笔记`」（照 R9 52f2 的手法），第 5 步写成「清除章节过滤 → 再删空当前文档唯一条目 → `当前文档暂无笔记`」，第 6 步随之改写为「关开关 → 剩 1 行（`n-other-1`）→ 无空态」（§8.4 场景 60-7 逐步写死）。

**修订 5（对应 must-fix 5）—— 烟测脚本是 `%TEMP%` 临时文件，不落仓库、不进白名单。**
N70-1/2 要编译驱动烟测，§4 白名单却无脚本条目。本档写死：全部脚本、tsconfig、编译产物在 `%TEMP%/pix-r10-smoke/**` 下生成，跑完 `rm -rf`；仓库内不留脚本、不改 `pix/package.json`（不新增 npm scripts）；复跑方式见 §8.2/§8.3 的逐字命令。

**修订 6（对应 must-fix 6）—— 写失败注入的唯一确定性手法 = 把 `notes.json.tmp` 预置为目录。**
Windows 上 `chmod` 目录 `0o444` 后仍可写、同进程持读句柄时 `renameSync` 仍成功。本档写死注入：`mkdirSync(join(root, ".pix-read", "notes.json.tmp"))` ⇒ `writeFileSync` 抛 `EISDIR` ⇒ `write-failed`；恢复：`rmSync(tmp, { recursive: true, force: true })` 后重试成功。**注意**：`writeFileAtomic` 失败路径的 `removeTemp` 用 `rmSync(tmp, { force: true })`（无 `recursive`）删目录会再抛并被空 catch 吞掉 ⇒ 注入目录在整个失败窗口内保持存在，可反复断言。

**修订 7（对应 must-fix 7）—— 去重键冲突与 id 冲突同码不同文，两条都写死。**
删 A 后重摘录同文（新 id、同 `docPath/page/kind/text`）再撤销，§0.5 只看 id ⇒ 文件会出现两条同去重键条目（`parseNotesFile` 不报损坏，但破坏 `addNote` 的「同键唯一」不变量）。本档写死两类占用检查与两条逐字中文：同 id ⇒ `invalid-input` + `该笔记已重新存在，无法撤销`（§0.5 原文）；同去重键但不同 id ⇒ `invalid-input` + `该笔记内容已重新存在，无法撤销`（本档新增，逐字冻结）；两者都**不覆盖、不合并、不改文件字节、保留槽**。

**修订 8（对应 must-fix 8）—— N68-11 改为「先删除 → 再输入查询」；N65-4 断言范围 = 当前文档组。**
0 行态没有 `.note-delete` 可点；`.note-row` 在该视图下共 4 行（含 `n-other-1` 组）。本档写死两处场景（§8.4 场景 63-8、62-2）。

**修订 9（对应 must-fix 1、次级项 6）—— 复制成功路径冻结「show + focus」前置；失败路径冻结脚本侧注入。**
实测 `show:false + offscreen` 下两条链路都失败、`clipboard.readText()` 恒空。本档写死：65 段开头 `win.show() → win.focus() → win.webContents.focus()` 后 `waitFor("document.hasFocus()")`，`hasFocus === true` 作为该组失败判据；失败路径由脚本侧 `executeJavaScript`（页面主世界）改写 `Clipboard.prototype.writeText`（reject）与 `Document.prototype.execCommand`（返回 false）制造，**不改产品代码、不在 stub 里加钩子**（`contextIsolation: true` 下 stub 位于隔离世界，改原型不影响页面世界，故不能走 stub）。

**修订 10 —— `removeNote` 成功但缺 `note` 必须非静默（次级项 4）。**
主进程成功删除**必回传** `note`（槽载荷同源）。渲染层取不到时：仍以主进程返回的全量列表覆盖本地（删除已真实落盘），随后返回 `{ ok: false, message: "删除已生效，但未收到撤销数据（内部不一致）" }`，面板按既有前缀显示 `删除失败：删除已生效，但未收到撤销数据（内部不一致）`。该分支是缺陷探测器（走查可枚举），不是产品态。

**证据面更正（随修订一并冻结，两条）**
1. `COPY_FEEDBACK_MS = 1200` 的落点是 `NotesPanel.vue` 内的同名常量（§0.7 的「照抄 ChatPanel」+ §3.12 的「不抽公共模块」），N68-1 一类「数字只出现一处」的走查**不覆盖** `1200`（ChatPanel 内另有一份，属既有非本轮文件）。
2. `MEASUREMENTS.json` 里 `list-current-doc-filter-off/on`、`after-filter-off-settled` 三组是**纯数据记录**（无 failures），但 `.notes-header` 新增两行会使其盒模型 `y/h` 变化：本档把「逐字段等于基线」收敛为「行内元素尺寸/字号/配色逐字相等，纵坐标允许位移」（§8.6）。

---

## 1. 契约冻结表

### 1.1 共享类型与 IPC（`pix/src/shared/types.ts` 零改动、错误码不扩）

| 通道 / 方法 | 形状（冻结） |
| --- | --- |
| IPC 通道 | `notes-restore`：`ipcMain.handle("notes-restore", (_event, id: unknown) => (isNoteId(id) ? restoreNote(id) : invalidNotesInput()))` |
| preload | `PixApi` 增 `notesRestore: (id: string) => Promise<ReaderNotesMutationResult>`；实现 `ipcRenderer.invoke("notes-restore", id) as Promise<ReaderNotesMutationResult>` |
| 入参校验 | 只接受非空字符串 id（复用 `isNoteId`）；守卫失败 ⇒ `invalidNotesInput()` = `{ success: false, notes: [], code: "invalid-input", error: "笔记数据不合法" }`（既有） |
| 出参 | 复用 `ReaderNotesMutationResult`：成功 `{ success: true, notes, note }`；失败 `{ success: false, notes: [], code, error }`（失败回传空列表，与既有六个通道同形） |
| 类型面 | **不新增**类型、**不扩** `ReaderNotesErrorCode`（`ERROR_TITLES` 一一对应关系不变）；专有文案按调用点写死（先例 `ANSWER_TOO_LONG_MESSAGE`） |
| 错误码与逐字中文（`restoreNote`） | `no-root` → `尚未选择资料库根目录`；`not-found` → `没有可撤销的删除`（无槽 / id 不符 / 跨工作区三种共用）；`invalid-input` → 同 id 占用 `该笔记已重新存在，无法撤销`、同去重键占用 `该笔记内容已重新存在，无法撤销`；`corrupt` / `version-unsupported` / `read-failed` → 既有 `ERROR_MESSAGES` 原文；`write-failed` → `笔记写入失败`；`too-long` / `empty` / `not-corrupt` / `outside` → 本调用点不可达（不写分支） |
| 载荷安全 | 通道载荷只有 `id`：还原内容完全来自主进程槽，渲染层无法伪造 `text/page/docPath`（N67-9 的结构性保证） |

### 1.2 主进程 `pix/src/main/notes-store.ts`（槽语义写死）

```ts
/** 撤销槽：只存最近一次成功删除；内存态、不落盘、不跨重启、不参与序列化。 */
let undoSlot: { root: string; note: ReaderNote; index: number } | null = null;

export function restoreNote(id: string): ReaderNotesMutationResult;   // 新导出
export function deleteNote(id: string): ReaderNotesMutationResult;    // 语义变更：成功时设槽 + 回传 note
export function resetCorruptNotes(): ReaderNotesResetResult;          // 语义变更：成功时清槽
```

| 项 | 冻结值 |
| --- | --- |
| 槽只存最近一条 | 成功的 `deleteNote` **覆盖式**设槽（不存在栈、不存在第二个槽）；`notes-restore` 只作用于槽内那一条 |
| 设槽 | `deleteNote` 写盘成功后：`undoSlot = { root: getLibraryRoot(), note: 被删条目原对象, index: 它在删除前数组中的下标 }`；`index` 由 `read.file.notes.findIndex((n) => n.id === id)` 得出（与 `filter` 同一份读结果） |
| 清槽 | 只有「成功的 `restoreNote`」与「成功的 `resetCorruptNotes`」清槽（后者理由：重建语义 = 从空库开始，把重建前删除的条目悄悄写回会让用户以为重建失败） |
| 不清槽 | `loadNotes` / `addNote` / `updateNoteComment` / `exportNotesMarkdown` / 任何**失败**的删除与还原（失败不能把上一次撤销权冲掉、写失败保留槽以便剩余时限内重试） |
| 校验顺序（自上而下，第一条命中即返回） | ① `notesPaths() === null` ⇒ `no-root`；② `undoSlot === null` ⇒ `not-found`；③ `id !== undoSlot.note.id` ⇒ `not-found`；④ `docPathKey(undoSlot.root) !== docPathKey(getLibraryRoot())` ⇒ `not-found`（**跨工作区防护：绝不写别的库**）；⑤ `readNotesFile` 失败 ⇒ 既有码原样透传；⑥ 文件里已有同 `id` 条目 ⇒ `invalid-input` + `该笔记已重新存在，无法撤销`；⑦ 文件里已有同去重键（`duplicateKey(docPath, page, kind, text)` 相等、id 不同）条目 ⇒ `invalid-input` + `该笔记内容已重新存在，无法撤销` |
| 写回 | 逐字 `const index = Math.min(undoSlot.index, notes.length);` → `notes.splice(index, 0, undoSlot.note);`（被删条目原下标插回，末尾删除时钳到数组长度）；**原对象原样写回**（`id` / `kind` / `docPath` / `page` / `text` / `comment` / `createdAt` / `updatedAt` 全部不变、不刷新 `updatedAt`） |
| 原子写 | 复用 `writeFileAtomic(paths.file, serializeNotes({ version: SCHEMA_VERSION, notes }))`；失败 ⇒ `write-failed` 且**槽保留** |
| 字节回复 | 槽存的是 `readNotesFile` 解析出的原对象 ⇒ 键序与文件一致 ⇒ `serializeNotes`（`JSON.stringify(file, null, 2) + "\n"`）逐字节等于删除前文件（N67-3 的判据来源） |
| 时间窗口 | 主进程**不引入时钟**：无 `Date.now()` 过期判定、无定时器；只保证「最近一次 + 归属 + 占用」三条数据面约束 |
| 失效条件（槽在什么情况下不可用） | ① 无槽（从未删除 / 已被成功还原 / 已被成功重建清空）；② 槽属于另一个工作区根（换库后 `not-found`，且另一库零改动）；③ 槽已被更晚的成功删除覆盖（旧 id ⇒ `not-found`）；④ 进程重启（内存态天然失效） |
| 同步约束 | 读-改-写仍全同步、同一函数体内无 `await`（既有约束不变；槽只多两次赋值） |

### 1.3 渲染层 `pix/src/renderer/stores/notes-store.ts`（视图状态与动作）

```ts
export type UndoDeleteResult = { ok: true } | { ok: false; message: string } | { ok: false; stale: true };
export interface PendingUndo { id: string; page: number; text: string; deletedAt: number }
```

| 项 | 冻结值 |
| --- | --- |
| 字段 | `searchQuery = ref("")` —— 用户输入**原串**（不做 trim、不做归一化存值） |
| 派生 | `activeQuery = computed(() => normalizeQuery(searchQuery.value))`；`searchActive = computed(() => activeQuery.value !== "")` |
| 字段 | `sortMode = ref<NotesSortMode>("page")` |
| 字段 | `pendingUndo = ref<PendingUndo \| null>(null)` —— 只存展示与时限四项；**还原载荷完全由主进程槽提供** |
| 派生 | `visibleCount = computed(() => groups.value.reduce((sum, group) => sum + group.notes.length, 0))`（`V` 的唯一定点，供 `countLabel` 与空态判别共用） |
| 派生（唯一管道） | `groups = computed(() => applyViewToGroups(groupNotesByDocument(notes.value, currentDocKey.value, currentDocOnly.value, chapterRange.value), activeQuery.value, sortMode.value))` |
| 动作 | `setSearchQuery(value: string): void`（原样存）；`clearSearchQuery(): void`（置 `""`）；`setSortMode(mode: NotesSortMode): void`（不落盘、不发 IPC） |
| 动作（切换） | 面板的 `onToggleSort()` 调 `setSortMode(notesStore.sortMode === "page" ? "created" : "page")`（不新增第二个 setter、不新增 action） |
| 动作 | `removeNote(id)`：`bridge().notesDelete(id)` → 失败 `{ ok: false, message: result.error ?? "删除失败" }`；成功先 `applyNotes(result.notes)`，再 `if (!result.note) return { ok: false, message: "删除已生效，但未收到撤销数据（内部不一致）" }`，否则 `pendingUndo.value = { id, page, text, deletedAt: Date.now() }` 并 `{ ok: true }`（try/catch 抛错走既有 `rejectMessage`）。**不再走 `runMutation`** |
| 动作 | `undoDelete(): Promise<UndoDeleteResult>`（函数体顺序冻结，见 §3.3）：`pendingUndo === null` ⇒ `{ ok:false, message: UNDO_EXPIRED_MESSAGE }` 且**不发 IPC**；`isUndoExpired(deletedAt, Date.now())` ⇒ 同前；否则 `notesRestore(pendingUndo.id)`；成功 ⇒ `applyNotes(result.notes)` + `pendingUndo = null` + `{ ok: true }`；失败 ⇒ `pendingUndo` 保留（不改）+ `{ ok:false, message: result.error ?? "撤销失败" }`；`stale` 两分支与守卫顺序见 §3.3（返回 `{ ok:false, stale: true }`，调用方零副作用） |
| 动作 | `clearPendingUndo(): void` —— 置 `null`；**全仓库恰好 2 处调用点，两处都在面板**：`scheduleUndoRow()` 的到期定时器回调、`onUndoClick()` 的过期分支（§3.2 / §3.3、§8.5 的走查判据按 2 处写死） |
| 作用域令牌 | `let undoScope = 0;`，`resetNotes()` 内 `undoScope += 1`（用于丢弃跨工作区的在途响应，§3.3） |
| `resetNotes()` | 追加：`searchQuery.value = ""`、`sortMode.value = "page"`、`pendingUndo.value = null`、`undoScope += 1`（既有清空项与 `loadSeq` 逻辑不动） |
| 不变 | 选择集语义（id 集合 / 上限 / `selectedNotes` / `replaceSelectionWith`）、`applyNotes` 覆盖式写入、`loadNotes` 的 `loadSeq/writeSeq` 竞态、`errorMessage` 全部零改动 |

### 1.4 纯函数模块 `pix/src/renderer/utils/notes-view.ts`（新建，签名与返回结构冻结）

```ts
import type { ReaderNote } from "@shared/types";                 // 仅类型，编译后擦除
import { docDisplayName, type NoteGroup } from "./notes-path";    // 唯一值依赖

export type NotesSortMode = "page" | "created";
export type ListEmptyReason = "search-chapter" | "search-current-doc" | "search" | "chapter" | "current-doc";
export interface ListEmptyInput {
  query: string;              // 传 notesStore.activeQuery（内部仍 normalizeQuery，幂等）
  visibleCount: number;       // V：groups 内条目总数
  chapterFilterActive: boolean;
  currentDocOnly: boolean;
}

export const UNDO_WINDOW_MS = 5000;
export const UNDO_ROW_MS = 8000;
export const UNDO_EXPIRED_MESSAGE = "撤销窗口已过期（超过 5 秒），笔记未能还原";

export function normalizeQuery(rawQuery: string): string;
export function matchesSearch(note: ReaderNote, query: string): boolean;
export function sortNotesForView(notes: ReaderNote[], mode: NotesSortMode): ReaderNote[];
export function applyViewToGroups(groups: NoteGroup[], query: string, mode: NotesSortMode): NoteGroup[];
export function buildNoteCopyFragment(note: ReaderNote): string;
export function resolveListEmptyReason(input: ListEmptyInput): ListEmptyReason | null;
export function isUndoExpired(deletedAt: number, now: number): boolean;
```

| 函数 | 返回结构 / 语义（冻结） |
| --- | --- |
| `normalizeQuery` | `rawQuery.trim()`（唯一 `trim` 判定点，幂等；不做大小写/全半角/空白折叠） |
| `matchesSearch` | `const needle = normalizeQuery(query).toLowerCase();` `needle === "" ? true : (note.text.toLowerCase().includes(needle) \|\| note.comment.toLowerCase().includes(needle))`。只用 `toLowerCase`（不用 `toLocaleLowerCase`）、不用 `RegExp`、不匹配 `id`/`kind`/`docPath`/`page`/`createdAt`、`comment` 原样比较（不折叠换行） |
| `sortNotesForView` | 返回**新数组**（`[...notes]` 后 `sort`），不原地修改入参：`"page"` ⇒ `a.page - b.page \|\| a.createdAt - b.createdAt`；`"created"` ⇒ `b.createdAt - a.createdAt \|\| a.id.localeCompare(b.id)` |
| `applyViewToGroups` | 返回**新数组**：逐组 `{ ...group, notes: sortNotesForView(group.notes.filter((note) => matchesSearch(note, query)), mode) }`；`notes.length === 0` 的组整组丢弃；**组数组顺序原样**（当前文档组置顶 → key 升序的 R9 语义不变）；入参数组与入参组对象/`notes` 数组一律不被修改 |
| `buildNoteCopyFragment` | 见 §4.1 的逐字模板 |
| `resolveListEmptyReason` | 自上而下第一条命中：`query !== "" && V === 0 && chapterFilterActive` ⇒ `"search-chapter"`；`query !== "" && V === 0 && !chapterFilterActive && currentDocOnly` ⇒ `"search-current-doc"`；`query !== "" && V === 0` ⇒ `"search"`；`chapterFilterActive && V === 0` ⇒ `"chapter"`；`currentDocOnly && V === 0` ⇒ `"current-doc"`；否则 `null`。**`!hasNotes` 不进该函数**（由模板的分支 3 承担）；`query` 判定用 `normalizeQuery` 后的值（空白串 = 未生效） |
| `isUndoExpired` | `now - deletedAt >= UNDO_WINDOW_MS`：`+4999` false、`+5000` true、`+5001` true |
| 依赖纪律 | 不 import Vue / Pinia / 组件 / store；无 `any`；无内联动态 import；`toLowerCase` 在本模块是笔记链路的唯一命中 |

### 1.5 DOM、类名与常量（离屏断言依赖，不得改名）

| 选择器 / 常量 | 位置与门控 |
| --- | --- |
| `.notes-search` / `.notes-search-input` / `.notes-search-clear` | `.notes-header` 内、`.notes-header-top` 之后、`.notes-sort` 之前；`.notes-search` 的 `v-if="notesStore.status === 'ready' && notesStore.hasNotes"`；`.notes-search-clear` 的 `v-if="notesStore.searchActive"`（未生效时**不进 DOM**）；焦点契约：Esc ⇒ 清空 + `blur()`、清空按钮 ⇒ 清空 + `input.focus()`（§2.1） |
| `.notes-sort` / `.notes-sort-btn` | `.notes-search` 之后、`.notes-filter` 之前；同一 `v-if` |
| `.notes-undo` / `.undo-text` / `.notes-undo-btn` | `.notes-notice` 之后、`.notes-export-row` 之前；`v-if="notesStore.pendingUndo"`；**与 status 和三个过滤维度都无关** |
| `.notes-search-empty` | 搜索类空态（4a/4b/4c 共用；原因由文本区分）；样式逐字抄 `.notes-filtered-empty` |
| `.note-copy` / `.note-copy.is-copied` | `.note-actions` 内、`.note-ask-wrap` **之前**；常驻（与 `.note-ask` 同级） |
| `notes-view.ts` 的模块路径与 13 个导出名 | 冻结（供烟测 `require`）：`NotesSortMode` / `ListEmptyReason` / `ListEmptyInput` / `UNDO_WINDOW_MS` / `UNDO_ROW_MS` / `UNDO_EXPIRED_MESSAGE` / `normalizeQuery` / `matchesSearch` / `sortNotesForView` / `applyViewToGroups` / `buildNoteCopyFragment` / `resolveListEmptyReason` / `isUndoExpired` |
| `UNDO_WINDOW_MS = 5000` / `UNDO_ROW_MS = 8000` / `UNDO_EXPIRED_MESSAGE` | `notes-view.ts` 唯一定义 |
| `COPY_FEEDBACK_MS = 1200` | `NotesPanel.vue` 内声明（与 ChatPanel 同值，不抽模块） |
| `notes-restore` / `notesRestore` | IPC 通道名 / preload 方法名 |
| `SEL` 新增 7 项 | `searchInput` / `searchClear` / `sortBtn` / `searchEmpty` / `undoRow` / `undoBtn` / `noteCopy` |

---

## 2. 组合语义与文案表

### 2.1 三维过滤的 AND 展开式（写死）

一条笔记可见 ⇔ `matchesSearch(note, activeQuery)` ∧ `matchesChapterFilter(note, currentDocKey, chapterRange)` ∧（`currentDocOnly → docPathKey(note.docPath) === currentDocKey`），再经 `sortNotesForView` 重排。

- `chapterRange !== null` 时 `groupNotesByDocument` 的章节分支已蕴含文档归属（R9 §0.4）⇒ 判定式实际为「搜索 ∧ 章节（若生效）」；`chapterRange === null` 时退化为 R9 既有语义，**逐条等价于今天**。
- 管道唯一：`groups = applyViewToGroups(groupNotesByDocument(...), activeQuery, sortMode)`；`NotesPanel.vue` 模板内**不得出现** `filter(` / `sort(`；store 内不得出现第二处 `docPathKey(note.docPath) === currentDocKey`。
- 排序与复制**不是**过滤维度：不改可见集合，只改顺序与剪贴板内容。
- 维度可见性三处同时成立：`.notes-search-input` 的值 = `searchQuery` 原串；`.notes-chapter-filter-text` = `章节：{title} · 第 {label} 页`；`.notes-filter input.checked` = 开关真值（**不得被程序改写**）。
- 搜索与排序**不触发** `loadNotes`（`notesLoadCalls()` 在输入/清空/切换排序前后不变）；三维度都不得互相改写。
- 焦点与 Escape 契约（N64-1 / N64-2，冻结）：`.notes-search-input` 的 `@keydown.esc` 只做「清空查询 + `blur()`」；点 `.notes-search-clear` 后查询置空且 `input.focus()`（焦点交还输入框）；两者都**不** `stopPropagation`。
  - 后果（既有语义，开发期**不得**当缺陷修掉）：Escape 继续冒泡到 `PdfViewer.vue` 的 window 级 `keydown`（该处处理位于 `isEditableTarget` 判定之前）⇒ 在笔记搜索框里按 Esc 会顺带退出框选模式 / 关闭 PDF 搜索面板；需求 §0.8/N64-2 明确不拦截，本轮不改阅读区。
  - 面板内不存在第二处 Escape 监听（走查 `grep -rn "Escape" NotesPanel.vue` 无命中）；`.notes-search-input` 的 `value` 与焦点是 60-3 / 60-4 的判据来源。

### 2.2 计数文案取值优先级（`.notes-count`，唯一实现 `countLabel`，四分叉）

| 优先级 | 生效条件（自上而下第一条命中） | 逐字 |
| --- | --- | --- |
| 0 | `status === "error"` | `""`（空串，既有） |
| 1 | `notesStore.searchActive` | `命中 {V} 条 / 共 {T} 条` |
| 2 | `notesStore.chapterFilter !== null` | `本章 {V} 条 / 共 {T} 条`（既有逐字） |
| 3 | `notesStore.currentDocOnly` | `当前 {V} 条 / 共 {T} 条`（既有逐字） |
| 4 | 以上都不生效 | `共 {T} 条`（既有逐字） |

- `V = notesStore.visibleCount`（列表实际渲染行数之和）、`T = notesStore.totalCount`；面板不再自行求和（单一来源）。
- 计数**只表达搜索维度**；章节与文档两个维度由 `.notes-chapter-filter-text` 与开关自身状态表达，**不新增第二处计数**（搜索框内不重复计数）。
- 组头 `.group-count` 逐字 `共 {N} 条`，`N` = 该组可见条数（搜索与排序之后）；`N === 0` 的组整组不渲染（既有行为）。

### 2.3 列表空态：分支顺序、类名与逐字文案（六分支 + 面板映射）

模板顺序逐字冻结（自上而下第一条命中者渲染）：

| # | 条件 | 元素与类名 | 逐字 |
| --- | --- | --- | --- |
| 1 | `status === "loading"` | `.notes-loading`（既有） | 既有 spinner，无文本 |
| 2 | `status === "error"` | `.notes-error`（既有） | 既有错误面板 |
| 3 | `!hasNotes` | `.notes-empty`（既有） | `还没有摘录` / `在 PDF 中选中文字，点「摘录」保存到这里`（搜索状态不影响本分支） |
| 4a | `emptyReason === "search-chapter"` | `.notes-search-empty` | `本章内没有匹配「{q}」的笔记` |
| 4b | `emptyReason === "search-current-doc"` | `.notes-search-empty` | `当前文档内没有匹配「{q}」的笔记` |
| 4c | `emptyReason === "search"` | `.notes-search-empty` | `没有匹配「{q}」的笔记` |
| 5 | `emptyReason === "chapter"` | `.notes-chapter-empty`（既有） | `本章暂无笔记`（既有逐字） |
| 6 | `emptyReason === "current-doc"` | `.notes-filtered-empty`（既有） | `当前文档暂无笔记`（既有逐字） |
| 7 | `emptyReason === null` | `.notes-list`（既有） | —— |

面板实现（**只做判别值 → 字面量的映射，不重写条件**）：

```html
<div v-else-if="emptyReason" :class="emptyClass">{{ emptyText }}</div>
<div v-else class="notes-list">…</div>
```

```ts
const LIST_EMPTY_CLASS: Record<ListEmptyReason, string> = {
  "search-chapter": "notes-search-empty",
  "search-current-doc": "notes-search-empty",
  search: "notes-search-empty",
  chapter: "notes-chapter-empty",
  "current-doc": "notes-filtered-empty",
};
const emptyReason = computed(() => resolveListEmptyReason({
  query: notesStore.activeQuery,
  visibleCount: notesStore.visibleCount,
  chapterFilterActive: notesStore.chapterFilter !== null,
  currentDocOnly: notesStore.currentDocOnly,
}));
```

`emptyText` 用五条显式分支（搜索类三条含 `{q} = notesStore.activeQuery`，`{q}` 原样插入、不转义）。

- 4 分支优先于 5/6：搜索无匹配**永不**被报成「本章暂无笔记 / 当前文档暂无笔记」。
- `{q}` 是 `activeQuery`（已 trim 的用户串）；输入仅空白时搜索维度未生效 ⇒ 走 5/6/7 或 `共 T 条`。
- 既有 R9 断言逐条保持：无查询时 `chapter`/`current-doc` 两分支的类名与文案与今天逐字相同。

---

## 3. 撤销时序与状态机

### 3.1 时序（点击删除 → 二次确认 → 主进程删除 → 面板撤销行 → 撤销/超时/介入）

```
用户点 .note-delete（第一次）
→ startDeleteConfirm(id)：confirmingDeleteId = id + 3s 定时器 + document capture pointerdown 监听（既有，零改动）
用户点 .note-delete（第二次，同一行）
→ confirmDelete(id)：
   clearDeleteConfirm()（既有）
   deletingId = id
   await notesStore.removeNote(id)
        ├─ bridge().notesDelete(id)  ── 主进程：读文件 → filter 掉该条 → 原子写 → 成功则设槽 { root, note, index }
        │                              失败：写盘失败/不存在 ⇒ 不设槽、不写盘、文件字节不变
        ├─ 成功：applyNotes(result.notes)（全量覆盖，不做乐观合并）
        └─ pendingUndo = { id, page, text 取自主进程回传的 note, deletedAt: Date.now() }
   deletingId = null
   成功 ⇒ 不弹 notice（撤销行即反馈）；失败 ⇒ setNotice("error", `删除失败：${message}`)
面板：watch(pendingUndo) 触发 ⇒ 清旧定时器 ⇒ 按 deletedAt 折算剩余（UNDO_ROW_MS - (now - deletedAt)）装新定时器
     渲染 .notes-undo（.undo-text = `已删除「{snippet}」· 第 {page} 页`，snippet = text.slice(0, 12) + (text.length > 12 ? "…" : "")）
点 .notes-undo-btn
→ onUndoClick()（面板侧函数体冻结，见 §3.3 第二段代码）
   ├─ restoring === true ⇒ 直接 return（防重复）
   ├─ try { const result = await notesStore.undoDelete(); …分支… } finally { restoring = false }   ← 复位的唯一位置
   ├─ 成功：applyNotes(notes) + pendingUndo = null（store 内）+ setNotice("success", "已还原该条笔记")
   ├─ 过期（未发 IPC；判据 = result.message === UNDO_EXPIRED_MESSAGE）：setNotice("error", `撤销失败：${UNDO_EXPIRED_MESSAGE}`) + 立即 clearPendingUndo()（第 2 处调用点）
   ├─ stale（目标已被替换 / 已复位）：零副作用（不弹提示、不动行、不覆盖列表）——但 finally 仍复位 restoring
   └─ 其它失败：setNotice("error", `撤销失败：${message}`)，行保留到原到期时刻（不延长计时，可重试）
```

### 3.2 撤销行定时器（面板唯一实现，冻结）

```ts
let undoRowTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleUndoRow(): void {
  if (undoRowTimer) { clearTimeout(undoRowTimer); undoRowTimer = null; }
  const pending = notesStore.pendingUndo;
  if (!pending) return;
  // 剩余 ≤ 0 时钳到 0：到期处理只有定时器回调一处（不写早退分支，故 clearPendingUndo 可枚举为 2 处）
  undoRowTimer = setTimeout(() => {
    undoRowTimer = null;
    notesStore.clearPendingUndo();          // 第 1 处调用点
  }, Math.max(0, UNDO_ROW_MS - (Date.now() - pending.deletedAt)));
}

watch(() => notesStore.pendingUndo, scheduleUndoRow, { immediate: true });
```

- 计时基准是 `deletedAt`：切标签/重挂载后行**不复活也不续命**（折算后剩余 ≤ 0 ⇒ 0 延时定时器在下一个 tick 收行，走同一条到期路径）。
- watch 源取 ref 本体：`removeNote` 每次赋新对象字面量 ⇒ A→B 必然触发（不依赖 `deletedAt` 是否同毫秒）；`pendingUndo → null`（成功还原/复位）也触发 ⇒ 旧定时器被清。
- `onBeforeUnmount` 中与既有 `noticeTimer` / `confirmTimer` 同处清理 `undoRowTimer`（**只清定时器，不调 `clearPendingUndo`**）。
- 不使用 `:key` 强制重挂（watch 已覆盖，DOM 保持单元素复用，`.notes-undo` 数量恒 ≤ 1）。

### 3.3 三条竞态守卫（写死，`undoDelete` 函数体顺序即判据）

```ts
async function undoDelete(): Promise<UndoDeleteResult> {
  const pending = pendingUndo.value;
  if (pending === null) return { ok: false, message: UNDO_EXPIRED_MESSAGE };                       // ① 不发 IPC
  if (isUndoExpired(pending.deletedAt, Date.now())) return { ok: false, message: UNDO_EXPIRED_MESSAGE };  // ① 不发 IPC
  const scope = undoScope;                                                                        // 作用域令牌
  try {
    const result = await bridge().notesRestore(pending.id);
    if (scope !== undoScope) return { ok: false, stale: true };                                    // ② 已复位（离开工作区）
    if (pendingUndo.value !== null && pendingUndo.value.id !== pending.id) return { ok: false, stale: true };  // ③ 已被替换
    if (!result.success) return { ok: false, message: result.error ?? "撤销失败" };
    applyNotes(result.notes);
    pendingUndo.value = null;
    return { ok: true };
  } catch (err) {
    if (scope !== undoScope) return { ok: false, stale: true };
    return { ok: false, message: rejectMessage(err) };
  }
}
```

- 守卫②（`undoScope`）：`resetNotes()` 后到达的响应一律丢弃 ⇒ 不会把上一个工作区的列表写进已复位的 store。
- 守卫③（目标 id）：新删除已把 `pendingUndo` 换成 B 时丢弃 A 的响应 ⇒ **不 `applyNotes` 旧列表**（否则会把刚删掉的 B 复活）、不弹提示、不改槽（B 的行继续是唯一反馈）。
- `pendingUndo === null`（行已到期被收掉、`undoScope` 未变）时**不丢弃**：成功照常 `applyNotes` + 面板 `已还原该条笔记`，失败照常 `撤销失败：{message}`（失败路径不得静默）。

面板侧（`NotesPanel.vue`，函数体冻结；`restoring` 是面板本地 `ref`，不入 store）：

```ts
const restoring = ref(false);

async function onUndoClick(): Promise<void> {
  if (restoring.value) return;                        // 在途守卫：不读 store、不发 IPC
  restoring.value = true;
  try {
    const result = await notesStore.undoDelete();
    if ("stale" in result) return;                    // 零副作用：不弹提示、不动行、不覆盖列表
    if (result.ok) { setNotice("success", "已还原该条笔记"); return; }
    setNotice("error", `撤销失败：${result.message}`);
    if (result.message === UNDO_EXPIRED_MESSAGE) notesStore.clearPendingUndo();   // 第 2 处调用点
  } finally {
    restoring.value = false;                          // 唯一复位点
  }
}
```

- `restoring` 只在 `finally` 复位这一处：成功 / 过期 / `stale` / 其它失败 / `undoDelete` 抛错五条路径全部复位 ⇒ 不存在「stale 之后 `.notes-undo-btn` 永久 `disabled`」的实现空隙（64c / 64d / 64e 各有一条断言盖住）。
- 过期分支的判据是 `result.message === UNDO_EXPIRED_MESSAGE`（常量来自 `notes-view.ts`；不做前缀匹配、不用正则）；`pendingUndo` 已为 `null` 时该分支的 `clearPendingUndo()` 是 `null → null` 的幂等写。
- `stale` 判定写在 `setNotice` 之前，且 `applyNotes` 在 store 内、两守卫之后 ⇒ 迟到响应既不改列表也不改提示。

### 3.4 状态机表（每步的确切结果）

| # | 事件 | 主进程 | 渲染层 store | 面板 DOM / 文案 |
| --- | --- | --- | --- | --- |
| 1 | 点删除（第一次） | 无 IPC | 无 | 行加 `.confirming`、按钮文本 `确认删除`、3 s 或外部 pointerdown 复位（既有） |
| 2 | 点删除（第二次） | 读-改-写同步；成功设槽；失败不写盘、不设槽 | `applyNotes(result.notes)`；成功 `pendingUndo = {…}` | 行消失；`.notes-undo` 出现（文案含 `snippet` 与页码）；无额外 notice |
| 3 | 5 s 内点撤销 | 槽校验 → 原下标插回 → 原子写 → 清槽 | `applyNotes`；`pendingUndo = null` | 行消失；`.notes-notice.is-success` = `已还原该条笔记` |
| 4 | 5–8 s 之间点撤销 | **零 IPC**（渲染层提前返回） | `pendingUndo` 不变 → 面板立即 `clearPendingUndo()` | `.notes-notice.is-error` = `撤销失败：撤销窗口已过期（超过 5 秒），笔记未能还原`；`.notes-undo` 立即消失 |
| 5 | 8 s 之后（行已消失） | 无 | `pendingUndo === null` | 无任何撤销入口（无快捷键、无历史面板、无第二入口） |
| 6 | 连删两条（A→B） | 槽被 B 覆盖（A 不可还原） | `pendingUndo` → B（`deletedAt` 刷新） | `.notes-undo` 数量恒 `1`、文案为 B；面板定时器按 B 重建（不按 A 到期） |
| 7 | 撤销途中（B 删除介入） | A 的请求在 B 之后到达 ⇒ `not-found` | A 响应命中守卫③ ⇒ `stale` | 零变化：B 的行仍在、无新增提示、列表不覆盖 |
| 8 | 离开工作区（`goHome`）/ 卸载 | 槽保留（内存态，跨库被校验④拒绝） | `resetNotes()`：`pendingUndo = null`、`undoScope += 1`、`searchQuery = ""`、`sortMode = "page"` | 面板卸载；在途响应命中守卫② ⇒ `stale` 丢弃 |
| 9 | 切文档 | 无 | `watch(currentDocKey)` 清章节过滤（既有）；**`pendingUndo` 保留**、`searchQuery` 保留、`sortMode` 保留 | 撤销行照常渲染（与三维过滤无关）；还原后条目按当前三维重新派生可见性 |
| 10 | 重载（`loadNotes` / 切标签往返） | 不清槽 | `notes` 被主进程全量覆盖；`pendingUndo` 保留 | 撤销行按 `deletedAt` 折算剩余时长（不续命、不复活） |
| 11 | 写失败（`write-failed`） | 槽保留、文件字节不变 | `pendingUndo` 保留、行不消失 | `.notes-notice.is-error` = `撤销失败：笔记写入失败`；可在剩余时限内重试 |
| 12 | 槽失效（无槽 / 跨库） | `not-found` | `pendingUndo` 保留 | `.notes-notice.is-error` = `撤销失败：没有可撤销的删除`；文件字节不变 |
| 13 | 同 id / 同去重键已存在 | `invalid-input`、不写盘 | 同 12 | `撤销失败：该笔记已重新存在，无法撤销` / `撤销失败：该笔记内容已重新存在，无法撤销` |

---

## 4. 复制片段模板与失败降级

### 4.1 `buildNoteCopyFragment(note)` 逐字模板

```ts
const lines = note.text.split("\n").map((line) => `> ${line}`);
const suffix = note.kind === "answer" ? " · AI 结论" : "";
return `${lines.join("\n")}\n\n—— ${docDisplayName(note.docPath)} · 第 ${note.page} 页${suffix}`;
```

| 项 | 冻结规则 |
| --- | --- |
| 引用块 | 原文**逐行**加 `> ` 前缀（与导出 `renderMarkdownEntry` 同规则），行与行之间不留空行 |
| 空行 | 引用块与出处行之间恰好一个空行（`\n\n`） |
| 出处行前缀 | `—— `（两个 U+2014 + 一个半角空格） |
| 文档显示名 | `docDisplayName(note.docPath)`（与 `.group-name` 同一字符串）；**不含**目录段、绝对路径与 id |
| 页码 | 十进制整数、1-based |
| 类型后缀 | 仅 `note.kind === "answer"` 追加 ` · AI 结论`（半角空格 + `·` + 半角空格）；`excerpt` 无后缀 |
| 不含 | `comment`、`id`、`kind` 原值、文档相对路径、时间戳（备注只随导出出现，是 §0.7 的有意取舍） |
| 末尾 | **无**尾随换行 |
| 实现唯一 | 只在 `notes-view.ts` 一份；面板不拼 `>` 前缀 / `——` / `AI 结论` |

逐字样例（夹具 `seedNotes()`，断言直接引用同一字面量）：

```
> Table 2 reports the ablation over the sparse mask budget. Removing the positional prior costs 2.4 points of recall, which confirms the mask is doing more than sparsification alone; the effect persists when the retrieval corpus is truncated to the first 8k tokens, so the gain cannot be attributed to longer effective context windows.

—— sample-paper.pdf · 第 2 页
```

```
> 结论：稀疏注意力在三分之一的预算下保持召回，位置先验是关键。

—— sample-paper.pdf · 第 2 页 · AI 结论
```

```
> Section 4. Reproducibility: all runs use three seeds and report the median.

—— older-paper.pdf · 第 7 页
```

### 4.2 行内按钮与反馈时序

| 项 | 冻结值 |
| --- | --- |
| 位置 | `.note-actions` 内、`.note-ask-wrap` **之前**；`<button class="note-copy">` → `<span class="note-ask-wrap">`；`.note-actions` 仍是 `.note-body` 最后一个子节点、右对齐单行（`flex-wrap` 默认 nowrap） |
| 属性 | `type="button"`、`@click.stop="onCopyNote(note)"`（**必须 stop**，否则冒泡触发 `open-note`）、`title` 默认 `复制为 Markdown`、反馈态 `已复制` |
| 文本 | 默认 `复制`；反馈态 `已复制`（1200 ms） |
| 类名 | 反馈态加 `.is-copied`（同一时刻至多一个按钮处于反馈态，键 = `copiedNoteId`） |
| 样式 | 逐字抄 `.note-ask`（`padding: 1px 6px`、`border-radius: var(--pix-radius-sm)`、`background: transparent`、`color: var(--pix-text-link, #314b5f)`、`font-size: 11px`、`line-height: 1.4`、hover `var(--pix-bg-hover)`）；`.note-copy.is-copied { color: var(--pix-accent, #31424f); }` |
| 反馈实现 | `const copiedNoteId = ref<string \| null>(null)` + `let copyTimer`，`COPY_FEEDBACK_MS = 1200`（`NotesPanel.vue` 内）；每次复制先清旧定时器再置新键；`onBeforeUnmount` 清理 |
| 反馈不足 | 复制失败时**不**置 `copiedNoteId`（按钮保持 `复制`） |

### 4.3 剪贴板链路与失败降级

```ts
async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return copyViaExecCommand(text); }
}
function copyViaExecCommand(text: string): boolean { /* 临时 textarea + document.execCommand("copy")，照抄 ChatPanel */ }

async function onCopyNote(note: ReaderNote): Promise<void> {
  if (!(await copyToClipboard(buildNoteCopyFragment(note)))) {
    setNotice("error", "复制失败：无法访问剪贴板");   // 两链路都失败：唯一的用户可见出口，非静默
    return;
  }
  copiedNoteId.value = note.id;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => { copiedNoteId.value = null; copyTimer = null; }, COPY_FEEDBACK_MS);
}
```

- 两个函数在 `NotesPanel.vue` 内**照抄** ChatPanel 写法（`ChatPanel.vue` 零 diff），不新建剪贴板模块。
- 复制是只读操作：不写盘、不改 store 的过滤/选择/排序状态（除 `copiedNoteId` 反馈态）、不触发 `open-note`。
- 离屏可判定性（修订 9）：65 段在 `win.show() + win.focus() + win.webContents.focus()` 且 `document.hasFocus() === true` 之后才点击；失败路径由脚本侧注入两条链路失败。

---

## 5. 文件级清单（动作 + 具体改动点 + 不变量）

| 文件 | 动作 | 具体改动点 | 不变量 |
| --- | --- | --- | --- |
| `pix/src/renderer/utils/notes-view.ts` | **新建** | §1.4 的 3 个常量 + 7 个函数 + 3 个类型；`normalizeQuery` 是唯一 `trim` 点；`matchesSearch` 是唯一匹配实现；`applyViewToGroups` 是唯一「搜索 + 排序」管道且不改写入参 | 不 import Vue/Pinia/组件/store；无 `any`；无内联动态 import |
| `pix/src/renderer/stores/notes-store.ts` | 修改 | `searchQuery`/`activeQuery`/`searchActive`/`sortMode`/`pendingUndo`/`visibleCount`/`undoScope`；`setSearchQuery`/`clearSearchQuery`/`setSortMode`/`undoDelete`/`clearPendingUndo`；`groups` 改走 `applyViewToGroups`；`removeNote` 自定义（回传 `note` → `pendingUndo`）；`resetNotes()` 追加四项复位 | 选择集语义、`applyNotes`、`loadNotes` 竞态、`ERROR_TITLES`、`focusChapter`/`clearChapterFilter`/`chapterFocusToken` 全部零改动；不拼存储路径 |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | `.notes-search`（原生 input + Esc（清空 + `blur()`）+ 清空按钮（清空 + `input.focus()`），两者都不 `stopPropagation`）、`.notes-sort`（单按钮切换）、`countLabel` 四分叉（用 `visibleCount`）、空态链改为 `emptyReason/emptyClass/emptyText`、`.notes-undo`（文案/定时器/撤销/`restoring` 的 try/finally）、`.note-copy`（两函数 + 1200 ms 反馈）、`onBeforeUnmount` 增清 `undoRowTimer`/`copyTimer`（只清定时器） | 分组渲染、组头、删除二次确认（3 s + capture pointerdown）、notice（4 s + × 关闭）、导出契约、跳回原文、备注编辑、展开全文、AI 徽标、R8 选择控件与选择条、R9 章节过滤条与两态计数、错误态与逃生口：DOM 与文案零改动 |
| `pix/src/main/notes-store.ts` | 修改 | `undoSlot` 与 §1.2 的校验顺序、`restoreNote` 新导出、`deleteNote` 设槽 + 回传 `note`、`resetCorruptNotes` 成功清槽 | 既有读/写/导出/去重/损坏判定语义与文案不动；全同步、无 `await`；只有三处槽赋值点 |
| `pix/src/main/ipc-handlers.ts` | 修改 | 新增 `notes-restore` 通道（复用 `isNoteId` / `invalidNotesInput`） | 其余通道零改动；无 `any`；无内联动态 import |
| `pix/src/main/preload.ts` | 修改 | `PixApi.notesRestore` + `ipcRenderer.invoke("notes-restore", id)` | notes 系列 6 个方法（`notesLoad`/`notesAdd`/`notesUpdate`/`notesDelete`/`notesExport`/`notesReset`）签名零改动 |
| `pix/scripts/ui-shot.mjs` | 修改 | stub：`notesDelete` 设槽 + 回传 `note`、`notesRestore`（含 id/去重键占用与跨 root 分支；`setNotesRestoreDelay(ms)` 的延迟落在**读-改-写之后、返回之前**，§8.4 场景 64e）、`notesReset` 成功清槽、控制口 `notesRestoreCalls()`/`clearDeleteSlot()`/`setNotesRestoreFailure(code)`/`setNotesRestoreDelay(ms)`；`SEL` 增 7 项；60–65 场景 + 18 张截图 + 4 组断言；65 段 `win.show()+focus()`；`setSearch` 先 `focus()` | stub 的 `pixApi` 面必须与 `preload.ts` 一致；不写仓库（只写 `%TEMP%/pix-r5`）；不新增产品代码开关 |
| `pix/src/renderer/utils/notes-path.ts` | **不改** | 分组入口与章节判定式保持 R9 契约（搜索/排序在其之后） | 零 diff |
| `pix/src/shared/types.ts` / `pix/src/main/library-root.ts` / `ChatPanel.vue` / 其余渲染层 | **不改** | —— | 零 diff（见 §8.5 走查） |

---

## 6. 失败路径表

| # | 情形 | 主进程 | 渲染层 | 证据 |
| --- | --- | --- | --- | --- |
| 1 | `notes-restore` 无槽 | `not-found` + `没有可撤销的删除`，零写盘 | `.notes-notice.is-error` = `撤销失败：没有可撤销的删除`；行保留 | 烟测 `undo-failures`；离屏 64c |
| 2 | id 与槽不匹配（旧槽被覆盖） | 同 1 | 同 1（若该响应对应的目标已被替换 ⇒ `stale`，见 #3） | 烟测 `undo-slot-lifecycle`；离屏 64d |
| 3 | 撤销在途 + 新删除介入 | 先到的写生效 | 守卫③：`stale` ⇒ 零副作用（无提示、不覆盖列表、不动行） | 走查（`undoDelete` 顺序）+ 离屏 64e |
| 4 | 离开工作区后在途响应到达 | 已写的保留 | 守卫②：`stale` ⇒ 零副作用 | 走查 + 离屏 64b（`goHome` 路径） |
| 5 | 跨工作区（换库后撤销） | 校验④ `not-found`；**另一库零改动** | 同 1 | 烟测 `undo-failures`（换 `setLibraryRoot`） |
| 6 | 同 id 已存在（重摘录后撤销） | `invalid-input` + `该笔记已重新存在，无法撤销`，不覆盖不合并 | `撤销失败：该笔记已重新存在，无法撤销` | 走查 + 烟测 `undo-failures` + 离屏 64c-2（独立场景：删 → `restoreStandardSeed()` 写回同 id → 点仍在 8 s 内的撤销行） |
| 7 | 同去重键已存在（新 id 同内容） | `invalid-input` + `该笔记内容已重新存在，无法撤销` | `撤销失败：该笔记内容已重新存在，无法撤销` | 烟测 `undo-failures`（must-fix 7 的专门断言） |
| 8 | 读文件失败（`corrupt` / `version-unsupported` / `read-failed`） | 既有码与文案原样透传，不写盘、槽保留 | `撤销失败：{主进程消息}` | 烟测 `undo-failures` + 走查 |
| 9 | 写失败（`notes.json.tmp` 被预置为目录 ⇒ EISDIR） | `write-failed`，槽**保留**，原文件字节不变 | `撤销失败：笔记写入失败`；行保留到原到期时刻（不延长），可重试 | 烟测 `undo-failures`（注入 + 恢复 + 重试成功） |
| 10 | 删除成功但缺 `note` 载荷 | 契约上不可能（回传是冻结项） | `删除失败：删除已生效，但未收到撤销数据（内部不一致）`；列表仍按主进程返回覆盖；**不静默** | 走查（修订 10）+ 主进程烟测 `undo-roundtrip` 断言 `note` 必在 |
| 11 | 复制两链路都失败 | 无 | `.notes-notice.is-error` = `复制失败：无法访问剪贴板`；按钮仍 `复制`；不写盘 | 离屏 65-4（脚本侧注入） |
| 12 | 离屏窗口未获焦点时点复制 | 无 | 同 11（真实链路失败） | 65 段的 `document.hasFocus()` 判据（false ⇒ 该组失败，不静默通过） |
| 13 | `status === "error"` 期间的搜索/排序 | 无（读取失败既有语义） | `.notes-count` = `""`；`.notes-search`/`.notes-sort` 不渲染；`searchQuery`/`sortMode` 保留；恢复后按原查询过滤 | 离屏 60-6 末段 |
| 14 | `status === "loading"` 期间 | 无 | 搜索/排序行不渲染（`ready && hasNotes` 门），状态保留；`.notes-undo` 照常渲染 | 走查 + 离屏 60-6 |
| 15 | 笔记被删到 0 条（搜索生效中） | 删除照常写盘 | 分支 3 `.notes-empty`「还没有摘录」；计数走优先级 1（`命中 0 条 / 共 0 条`）；`.notes-search` 不渲染 | 离屏 60-7-7 |
| 16 | `currentDocKey === null`（资料库外文档） | 无 | 三维中章节与文档维度结构上不生效（开关 `disabled`、无徽标可点）；搜索照常 | 走查（R9 既有闸门） |
| 17 | 撤销行与过滤叠加 | 无 | 撤销行与三维过滤**无关**（`v-if="pendingUndo"`）；还原后可见性按当前三维重新派生（可能仍不可见，成功通知照常） | 离屏 63-8 |
| 18 | 搜索无匹配（0 行）时删除 | 无 | 删除入口可在 0 行前使用（修订 8：先删除再输入查询）；撤销行仍渲染 | 离屏 63-8 |

---

## 7. must-fix 处理表（评审 §2 八条逐条落点）

| # | must-fix | 处置（写死） | 落点 |
| --- | --- | --- | --- |
| 1 | N69 剪贴板判据在离屏面不可达 | 65 段前置 `win.show()/focus()/webContents.focus()` + `document.hasFocus() === true` 作为失败判据（成功路径真实读回 `clipboard.readText()`）；失败路径由脚本侧改写 `Clipboard.prototype.writeText` 与 `Document.prototype.execCommand` 注入，不碰产品代码与 stub | §0 修订 9、§4.3、§8.4 场景 65 |
| 2 | 归一化 query 无单一来源 | `normalizeQuery` 进 `notes-view.ts`（唯一 `trim`）；store 出 `activeQuery`/`searchActive`；四处条件（清空按钮、计数优先级 1、空态 4a/4b/4c 入参、`{q}` 文案）全部改写为 `searchActive`/`activeQuery` | §0 修订 1、§1.3、§1.4、§2.2、§2.3、§8.5 |
| 3 | 撤销行时序缺重挂点 + 在途竞态 | `watch(() => pendingUndo, …, { immediate: true })` 每次重建定时器（源取 ref 本体）；`undoDelete` 增 `stale` 三态与两条守卫（`undoScope`、目标 id），且 `stale` 在 `applyNotes` 之前返回 | §0 修订 2/3、§1.3、§3.2、§3.3、§8.4 场景 64d/64e |
| 4 | N64-3 空态矩阵第 4/5 步不可达 | 第 4 步改为「清空查询 → 删空该章节范围两条 → `本章暂无笔记` `本章 0 条 / 共 2 条`」；第 5 步改为「清除章节过滤 → 再删当前文档唯一条目 → `当前文档暂无笔记` `当前 0 条 / 共 1 条`」；第 6 步改为「关开关 → 1 行（`n-other-1`）无空态」 | §0 修订 4、§8.4 场景 60-7 |
| 5 | 烟测脚本形式与落点未冻结 | 全部脚本/tsconfig/产物在 `%TEMP%/pix-r10-smoke/**`，跑完 `rm -rf`；仓库不留脚本、不新增 npm scripts；白名单不含脚本条目 | §0 修订 5、§8.2、§8.3、§9 |
| 6 | N67-4 写失败注入在 Windows 不成立 | 注入 = `mkdirSync(<root>/.pix-read/notes.json.tmp)` ⇒ EISDIR；恢复 = `rmSync(tmp, { recursive: true, force: true })` 后重试成功；断言槽保留、原文件字节不变 | §0 修订 6、§6 第 9 行、§8.3 组 `undo-failures` |
| 7 | 撤销与去重键的交叉语义空缺 | 占用校验两级：同 id ⇒ `该笔记已重新存在，无法撤销`；同去重键不同 id ⇒ `该笔记内容已重新存在，无法撤销`；两者都 `invalid-input`、不覆盖不合并、保留槽；烟测一条专门断言 | §0 修订 7、§1.2 校验⑦、§6 第 7 行、§8.3 组 `undo-failures` |
| 8 | N68-11 自相矛盾、N65-4 作用域不明 | N68-11 改为「无过滤态删除 → 输入 `zzz`（0 行）→ 断言 `.notes-undo` 仍渲染且文案为该条 → 点撤销 → 行数仍 0、成功通知出现 → 清空查询后 4 行」；N65-4 断言范围写死为**当前文档组**（DOM 首个 `.notes-group`，用 `.note-text` 全串与种子逐条比对） | §0 修订 8、§8.4 场景 62-2、63-8 |

**次级项（评审 §3）落点**：①`COPY_FEEDBACK_MS` 落 `NotesPanel.vue` 内、值 1200（§0 证据面更正 1、§1.5）；②N63-5 即时性写成「一次 `js` 输入 → 下一次 `js` 直接读行数与计数」，中间**不得**有 `sleep`/`waitFor`/`repaint`（§8.4 场景 60-2）；③`grep` 判据给出允许命中清单（§8.5）；④缺 `note` 载荷非静默（§0 修订 10、§6 第 10 行）；⑤`.note-copy` 的 `@click.stop` 与 title/类名写进 DOM 契约（§4.2）；⑥复制失败路径的可判定性二选一：**成功 = show+focus 真读回；失败 = 脚本侧注入**（§0 修订 9、§8.4 场景 65-4）；⑦「片段不含 `comment`」的理由写进设计（§4.1：备注只随导出出现）；⑧计数只表达搜索维度、另两维度由控件自身状态表达（§2.2）。

---

## 8. 验证方案

### 8.1 命令

```bash
# 唯一工程门
cd pix && npm run check

# 改前基线（必须先跑，留档到独立目录；用于 §8.6 的截图数与测量比对）
cd pix && PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-r10-base" \
  PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs

# 改后取证
cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
```

### 8.2 主进程数据面烟测（`%TEMP%` 临时 tsconfig，跑完删除）

```bash
TMP="/c/Users/86157/AppData/Local/Temp/pix-r10-smoke"; mkdir -p "$TMP"
# tsconfig.main.json：{ compilerOptions: { module: "commonjs", target: "es2022", moduleResolution: "node",
#   strict: true, skipLibCheck: true,
#   rootDir: "E:/develop/PiX-Read/pix/src",   # 显式冻结（产物目录 = 本节的 require 字面量；不依赖 tsc 推导）
#   outDir: "C:/Users/86157/AppData/Local/Temp/pix-r10-smoke/out-main" },
#   include: ["E:/develop/PiX-Read/pix/src/main/notes-store.ts",
#             "E:/develop/PiX-Read/pix/src/main/library-root.ts"] }
cd pix && ./node_modules/.bin/tsc -p "$TMP/tsconfig.main.json"
node "$TMP/smoke-main.cjs"
# smoke-main.cjs 的 require 路径（逐字冻结，不得简写成 out-main/notes-store.js）：
#   require("$TMP/out-main/main/notes-store.js")
#   require("$TMP/out-main/main/library-root.js")
rm -rf "$TMP"
```

要点：两个源文件都不 import electron（`library-root.ts` 只 import `fs`/`path`；`notes-store.ts` 只 import `node:*`、`./library-root.js` 与 type-only 的 `../shared/types.js`）；`import type` 在 emit 时被擦除，但 `shared/types.ts` 仍是 program 成员 ⇒ **产出 3 个文件**：`out-main/main/notes-store.js`、`out-main/main/library-root.js`、`out-main/shared/types.js`（驱动脚本只 `require` 前两个；第三份存在但不必引）。`rootDir` 显式写成 `pix/src` 后才能让 `main/` 与 `renderer/utils/` 两段目录名稳定出现（不写 `rootDir` 时 tsc 会自行推出 `pix/src`，与实测一致，但不要依赖推导）；临时工作区用 `setLibraryRoot(<临时目录>)` 后走真实文件系统。

| 组 | 步骤 | 断言 |
| --- | --- | --- |
| `undo-roundtrip` | `setLibraryRoot(tmpA)` → `addNote` ×3（不同 page/kind）→ 记录文件字节与哈希 → `deleteNote(中间那条)` | 删除即时落盘（字节 ≠ 之前、文件里该 id 不存在）；返回值 `note.id/page/text` 与目标一致；`note` 字段**必在**（否则直接失败） |
| | 接着 `restoreNote(该 id)` | `success === true`；文件**逐字节等于删除前**（哈希相等 ⇒ 同下标插回、`updatedAt` 未刷新、键序未变）；`note` 回传逐字段等于删除前对象；再调 `restoreNote(同 id)` ⇒ `not-found` |
| `undo-failures` | 无槽时 `restoreNote(任意 id)`；设槽后传不匹配 id；`setLibraryRoot(tmpB)` 后还原（槽属 A） | 三种都 `not-found` + 逐字 `没有可撤销的删除`；B 库文件不存在/未被创建（跨库零改动）；A 库字节不变 |
| | 同 id 占用：`deleteNote(X)` → 手工把 X（同 id 同字段）写回文件 → `restoreNote(X.id)` | `invalid-input` + 逐字 `该笔记已重新存在，无法撤销`；文件字节不变；槽保留（随后移除该条目 → 再次 `restoreNote` 成功） |
| | 同去重键占用（**must-fix 7**）：`deleteNote(X)` → 用同 `docPath/page/kind/text` 但新 id 的条目写入文件 → `restoreNote(X.id)` | `invalid-input` + 逐字 `该笔记内容已重新存在，无法撤销`；文件字节不变；**不出现两条同键条目** |
| | 写失败注入（**must-fix 6**）：`mkdirSync(join(root, ".pix-read", "notes.json.tmp"))` → `restoreNote` | `write-failed`；原文件字节不变（哈希同删除后）；槽保留；`restoreNote` 再次调用仍是 `write-failed`（注入仍在） |
| | 恢复：`rmSync(tmp, { recursive: true, force: true })` → `restoreNote` | `success === true`；文件逐字节回到删除前 |
| | 外部删除夹具（`rmSync(notes.json)` 后调 `restoreNote`） | `readNotesFile` 把 ENOENT 当空库（既有语义）⇒ 还原会写出「只含该条」的文件；这是既有 `addNote` 同语义、**非本轮回归**，但必须在烟测里点名一次（断言还原成功且新文件只含该 id） |
| `undo-slot-lifecycle` | 设槽后 `updateNoteComment(另一条)`、再 `addNote` | 槽仍可还原（成功且新条目保留） |
| | 第二次成功 `deleteNote`（B） | 槽被覆盖：`restoreNote(A.id)` ⇒ `not-found`；`restoreNote(B.id)` ⇒ 成功 |
| | 成功 `resetCorruptNotes`（先写坏文件） | 成功返回后槽为空；`restoreNote(重建前删掉的 id)` ⇒ `not-found`（重建前删除的条目不得被悄悄写回） |

### 8.3 纯函数烟测（`notes-view.ts` + `notes-path.ts`，跑完删除）

```bash
TMP="/c/Users/86157/AppData/Local/Temp/pix-r10-smoke"
# tsconfig.view.json：{ compilerOptions: { module: "commonjs", target: "es2022", moduleResolution: "node",
#   strict: true, skipLibCheck: true,
#   rootDir: "E:/develop/PiX-Read/pix/src",   # 与主进程侧同一个 rootDir
#   outDir: ".../out-view",
#   paths: { "@shared/*": ["E:/develop/PiX-Read/pix/src/shared/*"] } },
#   include: ["E:/develop/PiX-Read/pix/src/renderer/utils/notes-view.ts",
#             "E:/develop/PiX-Read/pix/src/renderer/utils/notes-path.ts"] }
cd pix && ./node_modules/.bin/tsc -p "$TMP/tsconfig.view.json"
node "$TMP/smoke-view.cjs"
# smoke-view.cjs 的 require 路径（逐字冻结，不得简写成 out-view/notes-view.js）：
#   require("$TMP/out-view/renderer/utils/notes-view.js")
#   require("$TMP/out-view/renderer/utils/notes-path.js")      # 只用于对照参照，不重导 notes-view 的导出
# 产出 3 个文件：out-view/renderer/utils/notes-view.js、out-view/renderer/utils/notes-path.js、out-view/shared/types.js
```

样本用夹具 `seedNotes()` 的四条（`n-current-1` p1 备注「与第 3 节消融实验对照」、`n-current-2` p2 长文、`n-current-3` p2 `answer` 正文含「稀疏注意力」、`n-other-1` `archive/older-paper.pdf` p7）。

| 组 | 用例 → 期望 |
| --- | --- |
| `search-basic` | `TABLE 2` 命中 `n-current-2`；`消融` 命中 `n-current-1`（备注）；`Table 2 reports` 命中原文；`""` 与 `"   "` 恒真（含 `"\t\n"`）；`消融 实验` **不**命中（内部空白不折叠）；`稀疏注意力` 命中 `n-current-3`；`sample-paper.pdf` / `n-current-2` / `7` 一律不命中（docPath/id/page 不参与）；`normalizeQuery("  a b  ") === "a b"` |
| `search-and-filter` | 4 条样本 × (query ∈ {`""`, `Table`, `zzz`}) × (chapterRange ∈ {null, `[2,2]`, `[1,1]`}) × (onlyCurrent ∈ {false, true}) 的可见集合恒等于「`matchesSearch` ∧ `matchesChapterFilter` ∧ 文档归属」的交集（与逐条朴素参照逐字段相等）；`applyViewToGroups` 不修改入参（组数组、组对象、`notes` 数组调用前后快照相等）；0 可见组整组丢弃；组顺序与入参逐键相同 |
| `sort-default` | `sortNotesForView(list, "page")` 与烟测内独立手写的朴素参照（page→createdAt）逐字段相等，且与不传 `sortMode` 的旧行为（`groupNotesByDocument` 组内顺序）逐字段相等；调用前后入参数组顺序不变 |
| `sort-created` | 降序正确（`n-current-3` → `n-current-2` → `n-current-1`）；`createdAt` 相同时按 id 升序；分组顺序与 `"page"` 模式逐键相同；不原地修改入参 |
| `empty-reason` | 五个判别值逐条（含「4 分支优先于 5/6」：`query="z"`、`V=0`、`chapterFilterActive=true` ⇒ `"search-chapter"`）；`query="   "` 且 `V=0` 且 `chapterFilterActive` ⇒ `"chapter"`（空白不算搜索生效）；`V>0` ⇒ `null`；`!hasNotes` 不进该函数（输入面不含 `hasNotes`） |
| `copy-fragment` | 四种输入逐字（excerpt 单行 / excerpt 多行每行 `> ` 前缀且行间无空行 / answer 末尾 ` · AI 结论` / `docPath = "archive/older-paper.pdf"` ⇒ 显示名 `older-paper.pdf`）；末尾无 `\n`；片段不含 `comment` 与 `id` |
| `undo-expiry` | `isUndoExpired(t, t + 4999) === false`、`+5000`、`+5001` 均 `true`；`UNDO_WINDOW_MS === 5000`、`UNDO_ROW_MS === 8000`、`UNDO_EXPIRED_MESSAGE` 逐字等于 `撤销窗口已过期（超过 5 秒），笔记未能还原` |

失败即非零退出码，每条断言输出可读中文（沿用既有烟测脚本风格）。

### 8.4 离屏场景（60–65，追加在 `runReaderStateScenarios` 末尾，复用该函数内的 helper 闭包）

新增 `SEL`：`searchInput: ".notes-search-input"`、`searchClear: ".notes-search-clear"`、`sortBtn: ".notes-sort-btn"`、`searchEmpty: ".notes-search-empty"`、`undoRow: ".notes-undo"`、`undoBtn: ".notes-undo-btn"`、`noteCopy: ".note-copy"`。

新增场景内 helper（语义冻结、命名自由）：`setSearch(text)`（**先 `input.focus()`**，再 `HTMLInputElement.prototype` 的 value setter + `new Event("input", { bubbles: true })`，**一次 `js` 往返**）、`searchProbe()`（下一次 `js` 读 `{ value, focused: document.activeElement === input, clearInDom, rows, countText }`）、`readRowsAndCount()`（下一次 `js` 读 `.note-row` 数量与 `.notes-count` 文本）、`pressSearchEsc()`（`input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`）、`currentGroupProbe()`（首个 `.notes-group` 内每行 `{ text, pageBadge, ai }`）、`deleteRowByText(prefix)`（`clickInRow(prefix, ".note-delete")` 两次，中间等 `.confirming`）、`clickCopyByText(prefix)`、`undoText()`、`undoRowCount()`、`restoreDelay(ms)`。

| 场景 | 步骤 | 截图 | 断言组（失败即抛错） |
| --- | --- | --- | --- |
| `60-1` | `enterMapWorkspace(seedNotes())` → 打开 `sample-paper.pdf` → `waitPage(1,3)` → 切「笔记」→ 等 4 行 → 记录 `notesHash()` 基线 → 逐次 `setSearch` | `60-notes-search.png`、`60b-notes-search-left-pane.png`（左栏）、`60c-notes-search-zoom.png`（头部） | `notes-search`：`TABLE 2` ⇒ 1 行 + `命中 1 条 / 共 4 条`；`消融` ⇒ 1 行；`消融 实验` ⇒ 0 行 + `.notes-search-empty` 逐字 `没有匹配「消融 实验」的笔记`；`sample-paper.pdf` ⇒ 0 行；**输入/清空前后 `notesHash()` 与 `notesLoadCalls()` 均不变** |
| `60-2` | 同 60-1，但「输入 → 立即读行数/计数」两步之间不插任何等待 | 复用 60 | `notes-search`：即时性判据（无防抖）——若读到的仍是旧行数即失败，失败信息写明「输入与读取之间只允许一次 IPC 往返」 |
| `60-3` | 三维都不生效的起始态：`setSearch("消融")` → `searchProbe()`（Esc **前**）→ `pressSearchEsc()` → `searchProbe()`（Esc **后**） | `60d-notes-search-cleared.png` | `notes-search`：**Esc 前 `focused === true`**（空断言防护：不成立即该组失败并打印现场）；Esc 后 `value === ""`、`document.activeElement !== input`、`.note-row` 回到 `4`、`.notes-search-clear` 不在 DOM |
| `60-4` | 同起始态：`setSearch("消融")` → 点 `.notes-search-clear` | 复用 60 | `notes-search`：`value === ""` 且 `document.activeElement === input`（清空按钮把焦点交还输入框，N64-1）、行数 `4`、`notesHash()` 不变 |
| `60-5` | 开开关 ON → **先 `openMap()` 并等 7 行**（同 `enterSampleMap` 后半；徽标点击用既有 `clickMapBadge("2. Method Overview")`，点徽标会自己切到笔记标签）→ 等 `章节：2. Method Overview · 第 2 页` → `setSearch("Table 2")` | `60e-notes-search-three-dimensions.png` | `notes-search`：行数 `1`；`.notes-search-input`.value === `Table 2`；`.notes-chapter-filter-text` 逐字 `章节：2. Method Overview · 第 2 页`；`.notes-filter input.checked === true`；计数 `命中 1 条 / 共 4 条`；本相位再关/开开关 ⇒ 行数都是 `1`（AND 的数值证据） |
| `60-6` | 计数真值表六态（逐态读取） + 错误态 | 复用 60 | `notes-search`：`共 4 条` / `当前 3 条 / 共 4 条` / `本章 2 条 / 共 4 条` / `命中 1 条 / 共 4 条` / 三维同时 `命中 1 条 / 共 4 条` / 无匹配 `命中 0 条 / 共 4 条`；`setLoadFailure("corrupt")` + 切标签 ⇒ `.notes-count` 文本为**空串**、`.notes-search`/`.notes-sort` 不在 DOM；`setLoadFailure(null)` + 切回 ⇒ 输入框 value 仍为 `Table 2`（查询未丢） |
| `60-7` | 空态矩阵（修订 4）：搜索 `zzz` → 开开关 → **`openMap()` 等 7 行** → `clickMapBadge("2. Method Overview")` → 清空查询 → **删空该范围两条** → 清除章节过滤 → **删空当前文档唯一条目** → 关开关 → 无维度 | `61-notes-search-empty.png`、`61b-notes-search-empty-doc.png`、`61c-notes-search-empty-chapter.png` | `notes-search`：4a 文本 `本章内没有匹配「zzz」的笔记`；4b `当前文档内没有匹配「zzz」的笔记`；4c `没有匹配「zzz」的笔记`（三者类名都是 `.notes-search-empty`，`.notes-filtered-empty`/`.notes-chapter-empty` 均不在 DOM）；清空查询后（章节过滤生效）先 `本章 2 条 / 共 4 条`，删空后 `.notes-chapter-empty` 逐字 `本章暂无笔记` + `本章 0 条 / 共 2 条`；清除章节过滤后 `当前 1 条 / 共 2 条`，删空后 `.notes-filtered-empty` 逐字 `当前文档暂无笔记` + `当前 0 条 / 共 1 条`；关开关后行数 `1`（`n-other-1`）且无空态元素 |
| `60-8` | 边界：查询只含空白——**独立复位**：`enterMapWorkspace(seedNotes())` → 打开 `sample-paper.pdf` → `waitPage(1,3)` → 切「笔记」→ 等 4 行 → `setSearch("   ")` | 复用 61 | `notes-search`：`.notes-search-clear` 不在 DOM、行数 `4`、计数 `共 4 条`（空白串不算搜索生效；起始态由本场景自己构造，**不复用** 60-7 末态） |
| `60-9` | 边界（N64-7）：**独立复位** `enterMapWorkspace(seedNotes())` → 打开 `sample-paper.pdf` → `waitPage(1,3)` → 切「笔记」→ 4 行 → 依次用「命中该条的查询」删空全 4 条：`setSearch("Table 2 reports")` + `deleteRowByText("Table 2 repo")` → `setSearch("稀疏注意力")` + 删该行 → `setSearch("Reproducibility")` + 删该行 → `setSearch("消融")` + `deleteRowByText("We study ret")` → 在 PDF 文本层造选区（page 1，选中文本**不含 `消融`**）点「摘录」 | 复用 61 | `notes-search`：每步删除后的计数依次为 `命中 0 条 / 共 3 条`、`命中 0 条 / 共 2 条`、`命中 0 条 / 共 1 条`；删到 **0** 条时 `.notes-empty`（`还没有摘录`）+ 计数 `命中 0 条 / 共 0 条` + `.notes-search`/`.notes-sort` 不在 DOM（`hasNotes === false`）；摘录一条不含 `消融` 的原文后：`.notes-search` 回到 DOM、`.notes-search-input`.value === `消融`（查询原样保留）、计数 `命中 0 条 / 共 1 条`、空态 `.notes-search-empty` 逐字 `没有匹配「消融」的笔记`；随后 `setSearch("")` 清空查询 → `restoreStandardSeed()`（查询是视图状态，`restoreStandardSeed` 不复位它；不清查询会卡在 1 行） |
| `62-1` | `enterMapWorkspace(seedNotes())` → 打开 `sample-paper.pdf` → 切「笔记」→ 等 4 行 | `62b-notes-sort-default.png` | `notes-sort`：按钮文本 `排序：页码`、title 逐字 `当前按页码排序，点击改为「最新优先」`；**当前文档组**（首个 `.notes-group`）行序 = `[n-current-1, n-current-2, n-current-3]`（`.note-text` 全串与种子逐条相等，修订 8）；`.notes-group-head` 的 title 序 = `["sample-paper.pdf", "archive/older-paper.pdf"]`；`.group-count` = `["共 3 条", "共 1 条"]` |
| `62-2` | 点 `.notes-sort-btn` | `62-notes-sort-latest.png`（命名对齐需求档 N71-3） | `notes-sort`：按钮文本 `排序：最新`、title `当前按最新优先排序，点击改为「页码」`；当前文档组行序 `[n-current-3, n-current-2, n-current-1]`；组顺序与 `.group-count` 逐字不变；`notesHash()` 不变；再点一次回到默认序 |
| `62-3` | 排序 × 搜索：`setSearch("稀疏注意力")` → 切换排序 | 复用 62 | `notes-sort`：两种排序下行数都 `1`、计数 `命中 1 条 / 共 4 条`；清空查询 |
| `62-4` | 排序 × 章节过滤：**`openMap()` 等 7 行** → `clickMapBadge("2. Method Overview")`（标签会自动切回笔记）→ 切换排序 | 复用 62 | `notes-sort`：`.notes-group` 数 `1`、可见集合（行文本集合）不变，仅组内顺序变化 |
| `62-5` | 导出与注入顺序：点 `.notes-export-btn` → 关章节过滤 → 切到 `created` 排序 → 勾选 `n-current-1` 与 `n-current-3`（`已选 2 条`）→ 点选择条「问 AI」→ `typeAndSend("62：排序不改注入顺序")` | 复用 62 | `notes-sort`：`.export-text` 逐字 `已导出 4 条 → .pix-read/notes.md`；`lastSend().message` 同时含两条的 text 且 `indexOf(n-current-1.text) < indexOf(n-current-3.text)`（doc→page→createdAt，与屏幕顺序相反 ⇒ 排序不参与注入） |
| `62-6` | 文档切换保留、离开复位：打开 `archive/older-paper.pdf` → 切「笔记」 → 断言按钮文本 | 复用 62 | `notes-sort`：切换文档后按钮仍 `排序：最新`；`goHome` → `enterWorkspace` → 打开 `sample-paper.pdf` → 切「笔记」→ 按钮 `排序：页码`（`resetNotes()` 复位）；随后 `restoreStandardSeed()` |
| `63-1` | `enterMapWorkspace(seedNotes())` → 打开 `sample-paper.pdf` → 切「笔记」→ 记录 `hashBefore` 与文件 ids 序列 → `deleteRowByText("Table 2 repo")` | `63-notes-undo.png` | `notes-undo`：文件里该 id 已消失、`notesHash() !== hashBefore`（界面所见 = 文件所存）；`.notes-undo` 存在且数量 `1`；`.undo-text` 逐字 `已删除「Table 2 repo…」· 第 2 页`；`.notes-undo-btn` 文本 `撤销`、title 逐字 `还原这条笔记`；`.note-row` = `3` |
| `63-2` | 点 `.notes-undo-btn` | `63b-notes-undo-restored.png` | `notes-undo`：行数回 `4`；`.notes-notice.is-success` 逐字 `已还原该条笔记`；`.notes-undo` 不在 DOM；`notesHash() === hashBefore`；文件里 `n-current-2.createdAt` === 种子值；文件 ids 序列 === 删除前序列 |
| `63-3` | 还原后参与三维过滤：`setSearch("Table 2")`（1 行）→ 清空查询 → **`openMap()` 等 7 行** → `clickMapBadge("1. Abstract")`（`ui-shot.mjs:215` 的 `noteNum = 1` ⇒ 该章范围内只有 `n-current-1`，页码范围 `[1,1]`；同 R9 的 52 段：行数 `1`、计数 `本章 1 条 / 共 4 条`） | 复用 63b | `notes-undo`：搜索命中 1 行；点徽标后行数 `1` 且该行是 `n-current-1`（`.note-text` 全串与种子相等）、`n-current-2` / `n-current-3` / `n-other-1` 不在列表、计数 `本章 1 条 / 共 4 条`、**`.notes-chapter-empty` 与 `.notes-filtered-empty` 均不在 DOM**；点清除（`SEL.chapterFilterClear`）后回 4 行、计数 `共 4 条` |
| `63-4` | 撤销与选择集/注入（N67-8）：勾选 `n-current-2`（`已选 1 条`）→ 删除 → 撤销 → `typeAndSend("63：还原后注入")` | 复用 63 | `notes-undo`：删除后 `已选 0 条`、chip 消失；撤销后 `已选 1 条`、chip `摘录 1 条` 回来；`lastSend().message` 含该条 text |
| `63-5` | 连续删除（N68-8）：删除 `n-current-1` → 断言 → 删除 `n-current-2` → 断言 → 点撤销 | `63c-notes-undo-consecutive.png` | `notes-undo`：`.notes-undo` 数量恒 `1`；第一次文案为 `已删除「We study ret…」· 第 1 页`，第二次为 n-current-2 的文案；撤销只还原 n-current-2（文件里 `n-current-1` 仍不存在、`n-current-2` 存在、行数 `3`） |
| `63-6` | 撤销成功后再删同一条（N68-9）：`restoreStandardSeed()` → 删 `n-current-2` → 撤销 → 再删同一行 → 再撤销 | 复用 63 | `notes-undo`：两次都出现新的撤销行、两次都还原成功、两次 `notesHash()` 都等于 `hashBefore` |
| `63-7` | 写失败可重试（可选取证，stub 注入 `setNotesRestoreFailure("write-failed")`）：删除 → 点撤销 | 不新增 | `notes-undo`：`.notes-notice.is-error` 逐字 `撤销失败：笔记写入失败`；`.notes-undo` 仍在（未延长计时）；`setNotesRestoreFailure(null)` 后再点 ⇒ 还原成功、行消失 |
| `63-8` | 撤销行与过滤无关（修订 8 / N68-11，**独立复位**）：`enterMapWorkspace(seedNotes())` → 打开 `sample-paper.pdf` → 切「笔记」→ 4 行 → **本场景开头记 `hashBefore`** → 删 `n-current-2` → `setSearch("zzz")` | 不新增 | `notes-undo`：行数 `0`、`.notes-search-empty` 渲染；`.notes-undo` 仍存在且文案为 n-current-2；点撤销 ⇒ 行数仍 `0`、`.notes-notice.is-success` = `已还原该条笔记`、`notesHash() === hashBefore`；清空查询 ⇒ 行数 `4`（`hashBefore` 在本场景内采集，不引用其它场景的变量） |
| `64` | 过期窗口：删除 `n-current-2` → 记 `hashAfterDelete` 与 `notesRestoreCalls()` 基线 → `sleep(5200)` → 点撤销 | `64-notes-undo-expired.png` | `notes-undo`：`sleep` 后 `.notes-undo` 仍存在；点击后 `.notes-notice.is-error` 逐字 `撤销失败：撤销窗口已过期（超过 5 秒），笔记未能还原`；`.notes-undo` 立即消失；`notesRestoreCalls()` 增量 `0`；`notesHash() === hashAfterDelete`；行数 `3` |
| `64b` | 行到期 + 重挂不复活（承接 64 的末态：`n-current-2` 已在 64 删除且过期不可还原）→ 删 `n-current-1` → `sleep(8200)` → 切「资料库」→ 切回「笔记」 | `64b-notes-undo-row-gone.png` | `notes-undo`：`.notes-undo` 不在 DOM；切标签往返后仍不在 DOM（计时基准未被重挂载重置）；行数 `2`（= 4 − 64 删除的 `n-current-2` − 本场景删除的 `n-current-1`）；随后 `restoreStandardSeed()`（回 4 行） |
| `64c` | 槽失效：删除 `n-current-2` → `clearDeleteSlot()` → 点撤销 | 不新增 | `notes-undo`：`.notes-notice.is-error` 逐字 `撤销失败：没有可撤销的删除`；`notesHash()` 保持删除后；行数不变；`.notes-undo` 保留且 `.notes-undo-btn` **未** `disabled`（失败路径也复位 `restoring`） |
| `64c-2` | 同 id 占用（**独立场景，不复用 64c 的 stub 状态**）：`enterMapWorkspace(seedNotes())` → 打开 `sample-paper.pdf` → 切「笔记」→ 删 `n-current-2`（设槽）→ `restoreStandardSeed()`（把含同 id 的种子写回文件；**不得**调 `clearDeleteSlot()`）→ 断言 `.notes-undo` 仍在 DOM（8 s 内）→ 点 `.notes-undo-btn` | 不新增 | `notes-undo`：清槽发生在 64c、与同 id 占用互斥 ⇒ 本场景自带新槽（校验②不会先命中）；`.notes-notice.is-error` 逐字 `撤销失败：该笔记已重新存在，无法撤销`；`notesRestoreCalls()` 增量 `1`；`notesHash() === hashAfterReseed`（`restoreStandardSeed()` 刚写完的字节，`invalid-input` 不写盘）；行数 `4`；`.notes-undo` 保留 |
| `64d` | 在途防重复（N68-12，**独立复位**）：`enterMapWorkspace(seedNotes())` → 打开 `sample-paper.pdf` → 切「笔记」→ 4 行 → **记基线** → `setNotesRestoreDelay(400)` → 删 `n-current-2` → 点 `.notes-undo-btn` → 下一次往返读 `.notes-undo-btn.disabled === true` → 再点一次 → 等响应落地 → **再删 `n-current-3` 构成新行** | 不新增 | `notes-undo`：`.notes-undo-btn` 在途 `disabled`；`notesRestoreCalls()` 增量 `1`；行数回 `4`、`notesHash()` 等于基线；成功收行 ⇒ `.notes-undo` 不在 DOM；**新行（`n-current-3`）的 `.notes-undo-btn` 未 `disabled`**（`restoring` 已在 `finally` 复位）；`setNotesRestoreDelay(0)` + `restoreStandardSeed()` |
| `64e` | 新删除介入竞态（**独立复位**）：`enterMapWorkspace(seedNotes())` → 打开 `sample-paper.pdf` → 切「笔记」→ 4 行 → `setNotesRestoreDelay(1200)` → 删 `n-current-2` → 点 `.notes-undo-btn`（在途）→ 立即删 `n-current-1` → 等两个响应落地 | 不新增 | `notes-undo`：`.notes-undo` 数量 `1` 且 `.undo-text` 为 `n-current-1` 的文案（`已删除「We study ret…」· 第 1 页`）；`.note-row` = `3` 且 **`n-current-1` 不在列表**（去掉守卫③ 就会被 A 的迟到列表复活）、行集合 = {`n-current-2`、`n-current-3`、`n-other-1`}；`.notes-notice` 不存在或既不含 `已还原该条笔记` 也不含 `撤销失败：`（stale = 零副作用）；`.notes-undo-btn` **未** `disabled`（`restoring` 已复位）；文件里 `n-current-1` 不存在且 `n-current-2` 存在（= 真实 FIFO 的落盘结果）；随后 `setNotesRestoreDelay(0)` + `restoreStandardSeed()` |
| `65-0` | 复制前置（修订 9）：`win.show()` → `win.focus()` → `win.webContents.focus()` → `waitFor("document.hasFocus()")` | 不新增 | `notes-copy`：`document.hasFocus() === true`（false ⇒ 该组失败并打印现场，不得静默通过）；本步只在 65 段执行一次 |
| `65-1` | 点 `n-current-2` 行的 `.note-copy` | `65-note-copy-feedback.png` | `notes-copy`：主进程 `clipboard.readText()` 逐字等于 §4.1 的第一段样例（含 `> ` 前缀、空行、`—— sample-paper.pdf · 第 2 页`、无尾随换行）；按钮文本 `已复制`、`classList` 含 `is-copied`、title `已复制`；`.page-label` 不变（未触发 `open-note`）；`notesHash()` 不变 |
| `65-2` | `sleep(1400)` 后读按钮 | 复用 65 | `notes-copy`：文本回 `复制`、无 `.is-copied`、title 回 `复制为 Markdown` |
| `65-3` | 点 `n-current-3` 的复制 → 立即点 `n-other-1` 的复制（不等待） | `65b-note-copy-fragment.png`（把三条片段写入场景日志） | `notes-copy`：两次 `clipboard.readText()` 分别逐字等于第二段（含 ` · AI 结论`）与第三段（`—— older-paper.pdf · 第 7 页`，不含目录段）；`.notes-copy` 反馈态数量恒 `1` 且属最后点击的行 |
| `65-4` | 注入失败：脚本侧改写 `Clipboard.prototype.writeText`（reject）与 `Document.prototype.execCommand`（返回 false）→ 点 `.note-copy` → 恢复原型 | `65c-note-copy-failure.png` | `notes-copy`：`.notes-notice.is-error` 逐字 `复制失败：无法访问剪贴板`；按钮文本仍 `复制`、无 `.is-copied`；`notesHash()` 不变 |
| `65-5` | 行内动作几何：读 `.note-actions` / `.note-copy` / `.note-ask` 的盒 | 复用 65 | `notes-copy`：`.note-copy` 在 `.note-ask-wrap` 之前（`compareDocumentPosition`）；两者 `top` 差 ≤ 1px（同一行）；`.note-actions` 右边界与 `.note-body` 右边界差 ≤ 2px（右对齐）且 `scrollWidth <= clientWidth + 1`（不换行、不溢出） |

**64e 的 stub 语义（冻结）**：`setNotesRestoreDelay(ms)` 的延迟作用于 `notesRestore` 的「槽/占用校验与读-改-写**之后**、返回**之前**」——即落盘按请求到达顺序（真实 FIFO）完成并快照结果，只有响应被推迟。因此 A（还原 `n-current-2`）的结局是**成功且真写回**（不是 `not-found`），B（删 `n-current-1`）的删除响应里会带上 A 刚写回的 `n-current-2`（数据面与真实主进程一致），而「`n-current-1` 不被复活」只能由守卫③ 保证 ⇒ 去掉守卫③ 该组必红。注意：若改为「延迟把落盘也推后」（校验后、写盘前），B 的响应就不含 `n-current-2`、行数会变成 `2`——那种排布会让数据面偏离真实 FIFO，本档不采用（理由见「定稿修订（R10）」·must-fix 4）。

`MEASUREMENTS.json` 新增四组：`notes-search`、`notes-sort`、`notes-undo`、`notes-copy`；每组含 ≥1 条「文件字节或剪贴板」级判据（`notes-search` 的 hash 不变、`notes-sort` 的 hash 不变与注入载荷、`notes-undo` 的删除/还原字节、`notes-copy` 的 `clipboard.readText()`），全部沿用 `record(label, data, failures)`（先落测量再抛错）。

### 8.5 代码级核对点（走查）

| 核对 | 命令 / 位置 | 期望 |
| --- | --- | --- |
| 匹配唯一实现 | `grep -rn "includes(" pix/src/renderer/components/workspace/NotesPanel.vue pix/src/renderer/stores/notes-store.ts` | 无命中（搜索匹配只在 `notes-view.ts`） |
| 归一化唯一 | `grep -rn "searchQuery" pix/src/renderer` | 只命中 `notes-view.ts`（形参名）、`notes-store.ts`（字段/动作）、`NotesPanel.vue`（`searchModel` 绑定）；无第二处 `.trim()` |
| `trim` 允许清单 | `grep -rn "\.trim()" pix/src/renderer/components/workspace/NotesPanel.vue pix/src/renderer/stores/notes-store.ts` | 只允许既有的 `commentDraft.value.trim()`（备注保存）；搜索链路零命中 |
| 常量唯一 | `grep -rn "5000\|8000" pix/src/renderer/utils/notes-view.ts pix/src/renderer/stores/notes-store.ts pix/src/renderer/components/workspace/NotesPanel.vue` | `notes-view.ts` 各 1（`UNDO_WINDOW_MS`/`UNDO_ROW_MS`）；另两文件零命中（1200 是 `COPY_FEEDBACK_MS`，不在本判据内） |
| `toLowerCase` 允许清单 | `grep -rn "toLowerCase()" pix/src/renderer` | 笔记链路只命中 `notes-view.ts`；其余命中仅限既有非本轮文件（`PdfSearchPanel.vue`、`ChatPanel.vue`、`reader-state-store.ts`、`notes-path.ts` 的 `docPathKey`） |
| 排序唯一 | `grep -rn "sortMode" pix/src` | 写入点只有 `notes-store.ts`（`setSortMode`）与 `NotesPanel.vue`（`onToggleSort`）；无落盘路径（不出现 `settings`/`notes.json`/`reader-state`） |
| 管道唯一 | `grep -n "filter(\|sort(" pix/src/renderer/components/workspace/NotesPanel.vue` | 无命中 |
| 撤销入口唯一 | `grep -rn "undoDelete\|clearPendingUndo" pix/src` | `undoDelete`：store 定义 + 面板 1 处调用（`onUndoClick`）；`clearPendingUndo`：store 定义 + 面板**恰好 2 处**（`scheduleUndoRow()` 的到期定时器回调、`onUndoClick()` 的过期分支）；出现第 3 处（含 `onBeforeUnmount` 路径）即失败 |
| 槽赋值点唯一 | `grep -n "undoSlot" pix/src/main/notes-store.ts` | 恰好 3 处赋值（成功删除设、成功还原清、成功重建清）+ 校验读取处若干；无第四处赋值 |
| IPC 唯一 | `grep -rn "notes-restore\|notesRestore" pix/src` | `ipc-handlers.ts` 1 处、`preload.ts` 2 处（类型 + 实现）；渲染层只经 `bridge().notesRestore` |
| 渲染层不拼路径 | `grep -rn "notes.json\|\.pix-read" pix/src/renderer/components/workspace/NotesPanel.vue pix/src/renderer/stores/notes-store.ts` | 只允许既有显示串 `.pix-read/notes.md`（导出提示文案） |
| 开关唯一写入 | `grep -rn "setCurrentDocOnly" pix/src` | 仍只有 store 定义 + 面板绑定（无第三处） |
| 无 any / 无内联动态 import | `grep -rn ": any\|await import(\|import(" pix/src/renderer/utils/notes-view.ts pix/src/renderer/stores/notes-store.ts pix/src/renderer/components/workspace/NotesPanel.vue pix/src/main/notes-store.ts pix/src/main/ipc-handlers.ts pix/src/main/preload.ts` | 无命中 |
| 剪贴板不抽模块 | `git diff -- pix/src/renderer/components/workspace/ChatPanel.vue` | 空；`grep -n "ChatPanel" pix/src/renderer/components/workspace/NotesPanel.vue` 无命中 |
| 白名单 | `git status --short` + `git diff --stat` | 仅 `docs/pm/R10-design.md` + §9 白名单 7 个文件；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置零改动 |
| 冻结文件零 diff | `git diff -- pix/src/shared/types.ts pix/src/main/library-root.ts pix/src/renderer/utils/notes-path.ts pix/src/renderer/utils/outline-notes.ts pix/src/renderer/components/workspace/KnowledgeMap.vue pix/src/renderer/pages/WorkspacePage.vue` | 全部为空 |
| 未触发即无痕 | `NotesPanel.vue` 的 `v-if` 清单 | `.notes-search`/`.notes-sort` = `ready && hasNotes`；`.notes-search-clear` = `searchActive`；`.notes-undo` = `pendingUndo`；`.note-copy` 是常驻行内按钮 |
| `types.ts` 不扩 | `grep -n "ReaderNotesMutationResult" pix/src/shared/types.ts` | 定义处唯一；本轮零 diff |

### 8.6 回归与基线比对（N72）

1. 改前跑一次基线（`PIX_SHOT_ROOT=…/pix-r10-base`）留档 `MANIFEST.json` + `MEASUREMENTS.json`。
2. 改后：既有 00–11、20–24、30–36、40–46、50–55 场景全部通过；`MANIFEST.json.failure === null`；退出码 0。
3. `MEASUREMENTS.json` 的既有组：`noteRow` / `groupHead` / `pageBadge` / `noteTime` / `deleteBtn` / `noteText` / `commentTrigger` / `chip` / `exportBtn` 的 `w` / `h` / `fontSize` / `color` / `background` 必须与基线逐字相等；**允许的唯一差异**是纵坐标 `y` 与 `panelScroll.clientH`（头部新增 `.notes-search` + `.notes-sort` 两行导致的整体下移与可视高度变化），以及 `trackBox` / `thumbBox` / `controlBox` / `labelBox` 的 `y`。该差异是设计预期，不得被当成回归；反过来，若行内元素的 `w/h/fontSize/color/background` 出现差异即为回归。
4. 截图数只增不减：改后 = 基线 + 18（60/60b/60c/60d/60e、61/61b/61c、62/62b、63/63b/63c、64/64b、65/65b/65c），其中 `60b`/`60c` 依赖 `.layout-left` 与 `.notes-header` 的非空 rect（两元素在 60–65 段始终存在 ⇒ 无条件产出）。文件名以 §8.4 为准（`62-notes-sort-latest.png` / `62b-notes-sort-default.png`，与需求档 N71-3 逐字对齐；数量不变）。
5. `notes.json` 格式不变：本轮不新增字段、不写 tombstone、不写 `deletedAt`；夹具文件在「搜索 / 排序 / 复制 / 章节过滤 / 文档切换」前后字节不变，只有删除与撤销会改它（哈希判据逐场景断言）。
   - **60-7 / 60-9 是例外（真实删掉 3–4 条笔记，会消耗夹具）**：其后的字节/行数类判据必须先复位（`restoreStandardSeed()` 或下一次 `enterMapWorkspace(seedNotes())`），不得复用它们的末态；每条哈希基线的采集点写在各场景自己开头（63-8 的 `hashBefore` 即属此类），不跨场景引用变量。
   - 60-9 末段已把查询清空后再 `restoreStandardSeed()`（搜索词是视图状态，种子复位不复位它；不清查询会卡在 1 行）。
6. 既有画面唯一可预期的差异：面板头部多两行控件、每条笔记的行内动作区多一个 `复制` 按钮；其余像素级断言（含 `.note-row` 头部横向溢出、`headOverflow`、右对齐单行）全部保持。

---

## 9. 开发分工（白名单，互不重叠）

### A：契约与数据面（3 个文件 + 临时烟测）

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `pix/src/main/notes-store.ts` | 修改 | §1.2 全部：`undoSlot`、`restoreNote`、`deleteNote` 设槽 + 回传 `note`、`resetCorruptNotes` 成功清槽、三类专有文案常量 |
| `pix/src/main/ipc-handlers.ts` | 修改 | `notes-restore` 通道（`isNoteId` 守卫） |
| `pix/src/main/preload.ts` | 修改 | `PixApi.notesRestore` + `invoke` |
| `%TEMP%/pix-r10-smoke/**` | 临时 | §8.2 的主进程烟测（tsconfig.main + smoke-main.cjs + 临时工作区），跑完删除；**不入仓库** |

### B：界面与取证面（4 个文件 + 临时烟测）

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `pix/src/renderer/utils/notes-view.ts` | **新建** | §1.4 全部（3 常量 + 7 函数 + 3 类型） |
| `pix/src/renderer/stores/notes-store.ts` | 修改 | §1.3 全部（字段/派生/动作/`resetNotes` 追加/`removeNote` 自定义） |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | §1.5 DOM 契约、§2.2 计数四分叉、§2.3 空态映射、§3.2 定时器、§3.4 状态机、§4.2/§4.3 复制 |
| `pix/scripts/ui-shot.mjs` | 修改 | stub（`notesRestore` + 槽 + 4 个控制口 + `notesReset` 清槽）、`SEL` 7 项、60–65 场景、18 张截图、4 组断言、65 段 `show/focus` |
| `%TEMP%/pix-r10-smoke/**` | 临时 | §8.3 的纯函数烟测（tsconfig.view + smoke-view.cjs），跑完删除；**不入仓库** |

**接口冻结（两侧只通过这三处耦合）**：①`notes-view.ts` 的 13 个导出名与三处签名（§1.4）；②store 的 `searchQuery`/`activeQuery`/`searchActive`/`sortMode`/`pendingUndo`/`visibleCount`/`setSearchQuery`/`clearSearchQuery`/`setSortMode`/`undoDelete`/`clearPendingUndo`（§1.3）；③IPC `notes-restore` 的入参 `id: string` 与出参 `ReaderNotesMutationResult`（含成功必回传 `note`）+ 七类错误码与逐字中文（§1.1）。

**落地顺序（冻结）**：A 先落 `pix/src/main/{notes-store,ipc-handlers,preload}.ts`，B 再开工——B 侧 `npm run check` 依赖 `PixApi.notesRestore` 已存在（否则 `tsconfig.json` 与 `tsconfig.preload.json` 都会报「缺少方法」）。A 未落地前 B 只能写 `notes-view.ts` 与 `notes-store.ts` 中不引用该类型的部分。

**并行纪律**：A 与 B 不共享文件；B 依赖 A 的契约（`PixApi` 类型由 A 提供，B 只消费 `window.pixApi.notesRestore`，不写 preload）。除各自白名单外，双方一律不改：`pix/src/shared/types.ts`、`pix/src/main/library-root.ts`、`pix/src/renderer/utils/{notes-path,outline-notes,reading-context}.ts`、`pix/src/renderer/components/workspace/{ChatPanel,KnowledgeMap,ReaderPanel,PdfViewer,PdfSearchPanel,PdfSelectionQuickAsk}.vue`、`pix/src/renderer/pages/WorkspacePage.vue`、其余 store/composable/样式文件、`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置。

---

## 10. 需求回退建议（若负责人不接受以下任一条，需回改需求档字面）

1. **`notes-view.ts` 的导出面比 §0.10 多 4 项**（`normalizeQuery`、`ListEmptyReason`、`ListEmptyInput`、`applyViewToGroups` 的适配签名）：这是 must-fix 2 的直接后果；若必须逐字保留 §0.10 清单，则归一化只能回到面板（与 N63-2 冲突），需二选一。
2. **`undoDelete()` 的返回类型由两态变三态**（§0 修订 2）：must-fix 3 的「响应 id 不符即丢弃」在 `{ ok:false; message }` 上无法表达「零副作用」语义。若坚持两态，则必须接受「旧响应按失败处理 ⇒ 新撤销行被提前收掉、旧列表可能被 `applyNotes` 覆盖」。
3. **占用校验拆成两级、多出一条中文文案**（§0 修订 7）：§0.5 只冻结了一条 `该笔记已重新存在，无法撤销`。若要求复用同一条文案，则「同内容不同 id」的失败原因不可从文案区分（烟测仍可判、用户不可判）。
4. **N64-3 的第 4/5/6 步改写**（§0 修订 4）：原字面状态不可达；本档选择了「用删除构造 0 行」的路径，代价是该矩阵会改 `notes.json`（因此字节判据必须在矩阵之前断言）。
5. **N69 的成功判据需要 `win.show()/focus()`**（§0 修订 9）：离屏窗口在取证期间会真实显示在桌面上；若运行环境不允许显示窗口，则复制只能退化为「stub 记录载荷」的间接判据（无法证明系统剪贴板真的写成功）。
6. **N70 的烟测不落仓库**（§0 修订 5）：脚本只在 `%TEMP%` 存在，仓库内**不能复跑**（需要重新按 §8.2/§8.3 生成）。若要求可复跑，需要新增脚本白名单条目（与 §4 白名单、N72-3 冲突，需另行决策）。
7. **`MEASUREMENTS.json` 的「逐字段等于基线」在本轮不可能成立**（§8.6 第 3 条）：面板头部多两行必然改变纵坐标与可视高度；本档把它收敛为「行内元素尺寸/字号/配色相等 + 纵坐标允许位移」。若要求零差异，需先落一版「只加空容器」的基线 run 再改造。

---

## 定稿修订（R10）

> 上游：`docs/pm/R10-review.md` 的「设计评审（R10）」节（must-fix 8 条 + 次级项 8 条 + 已核对前提 8 条）。
> 本节是**定稿口径**：与正文冲突时以本节为准；正文已就地同步（每条都给出同步位置）。
> 结论：8 条 must-fix 全部消解，设计进入可开工状态；**一条偏离**（must-fix 4 的断言组，理由写在该条内），其余 7 条按评审字面落地。

### must-fix 1 —— `clearPendingUndo()` 冻结 2 处调用点

- 冻结：`clearPendingUndo()` 全仓库**恰好 2 处**调用点，两处都在 `NotesPanel.vue`：① `scheduleUndoRow()` 的到期定时器回调；② `onUndoClick()` 的过期分支。§1.3 的「唯一调用点是定时器」是旧口径，已删除。
- 为实现「恰好 2 处」（可 grep 判定），§3.2 原先的 `remaining <= 0` 早退分支改为把延时钳到 `Math.max(0, UNDO_ROW_MS - (Date.now() - pending.deletedAt))`：**行为等价**（剩余 ≤ 0 时在下一个 tick 收行，仍不复活不续命），但到期处理只剩回调一处；`onBeforeUnmount` **只** `clearTimeout(undoRowTimer)`，不调 `clearPendingUndo()`。
- 过期分支的判据同时冻结为 `result.message === UNDO_EXPIRED_MESSAGE`（不做前缀匹配/正则），这是面板能区分「过期」与「其它失败」的唯一手段（返回类型的三态里没有 `expired` 判别位）。
- 同步位置：§1.3（字段表）、§3.1（面板时序）、§3.2（定时器代码）、§3.3（面板 `onUndoClick` 代码）、§8.5（`撤销入口唯一` 的走查期望由 1 处改为 2 处）。

### must-fix 2 —— 60-8 / 60-9 各自复位，删空改用「命中该条的查询」

- 60-7 的末态是「查询已清空、只剩 `n-other-1`」（1 行），不能作为后两个场景的起始态。冻结：**两个场景各自带 `enterMapWorkspace(seedNotes())` 复位**（该入口经 `goHome` ⇒ `resetNotes()` 把 `searchQuery`/`sortMode`/`currentDocOnly`/`chapterFilter` 一并复位），再打开 `sample-paper.pdf` → `waitPage(1,3)` → 切「笔记」→ 等 4 行。
- 60-9 的「搜索生效 + 已删到 0 条」改为逐条构造：`setSearch("Table 2 reports")` 删 `n-current-2` → `setSearch("稀疏注意力")` 删 `n-current-3` → `setSearch("Reproducibility")` 删 `n-other-1` → `setSearch("消融")` 删 `n-current-1`；每步删除前必有 1 行可点（0 行态没有 `.note-delete`）。
- 末条删除后 T=0：`.notes-empty`（`还没有摘录`）、计数 `命中 0 条 / 共 0 条`、`.notes-search`/`.notes-sort` 不在 DOM（`hasNotes === false`，但 `searchQuery` 仍在 store）。随后摘录一条**不含当前查询串**的原文 ⇒ `.notes-search` 回到 DOM、输入框 value 仍为末条查询串、计数 `命中 0 条 / 共 1 条`、空态 4c 文案。
- `{q}` 的改写：评审原文用 `zzz`；本档把末条查询定为 `消融`（命中 `n-current-1` 的**备注**，而 PDF 英文原文不含该子串）⇒ 空态文案逐字 `没有匹配「消融」的笔记`。这样「删空」与「摘录后 0 命中」两个条件在夹具下同时成立。
- 收尾：先 `setSearch("")` 再 `restoreStandardSeed()`——搜索词与排序是视图状态，种子复位不复位它们，不清查询会卡在 1 行。
- 同步位置：§8.4 场景 60-8 / 60-9。

### must-fix 3 —— 64c-2 拆为独立场景（不再复用 64c 的 stub 状态）

- 旧写法「接 64c 的 `clearDeleteSlot()` 之后点残留撤销行」必红：校验顺序②（无槽 ⇒ `not-found`）先于⑥（同 id ⇒ `invalid-input`）。冻结：64c-2 **自带复位与自己的工作区状态**——`enterMapWorkspace(seedNotes())` → 打开 `sample-paper.pdf` → 切「笔记」→ 删 `n-current-2`（设槽）→ `restoreStandardSeed()` 把含同 id 条目的种子写回文件 → 断言 `.notes-undo` 仍在 DOM（8 s 内）→ 点 `.notes-undo-btn`。
- 该场景**不得**调 `clearDeleteSlot()`；`restoreStandardSeed()` 会切标签触发 `loadNotes`（按 §3.4 第 10 行：重载不清槽、不清 `pendingUndo`），故点击时槽仍在、行仍在。
- 断言：`notesRestoreCalls()` 增量 1（确实发了 IPC）、`invalid-input` + 逐字 `该笔记已重新存在，无法撤销`、`notesHash() === hashAfterReseed`（本场景开头、`restoreStandardSeed()` 之后采集）、行数 4、`.notes-undo` 保留。
- 同步位置：§8.4 场景 64c-2、§6 第 6 行的证据列。

### must-fix 4 —— 64e 的 stub 延迟位置与断言（本档唯一偏离）

- 冻结：`setNotesRestoreDelay(ms)` = **响应延迟**，作用点是「槽/占用校验与读-改-写**之后**、返回**之前**」；结果快照取自写盘那一刻。于是：A（还原 `n-current-2`）的结局是**成功且真写回**（旧写法把它判成 `not-found`，与真实 FIFO 不符）；B（删 `n-current-1`）的删除响应里会带上 A 刚写回的 `n-current-2`（数据面与真实主进程一致）。
- 场景：复位 → `setNotesRestoreDelay(1200)` → 删 `n-current-2` → 点 `.notes-undo-btn`（在途）→ 立即删 `n-current-1` → 等两个响应落地 → `setNotesRestoreDelay(0)` + `restoreStandardSeed()`。
- 断言收敛为：`.notes-undo` 数量 1 且 `.undo-text` 为 `n-current-1` 的文案；`.note-row = 3` 且 **`n-current-1` 不在列表**；`.notes-notice` 无成功文案也无 `撤销失败：`（stale = 零副作用）；`.notes-undo-btn` 未 `disabled`（`restoring` 已复位）；文件里 `n-current-1` 不存在、`n-current-2` 存在。
- **偏离**：评审建议的「行数 2 且无 `n-current-2` 行」只在「延迟把落盘也推后（校验后、写盘前）」的排布下成立；那种排布会让 stub 的写盘顺序偏离真实 FIFO（A 的还原落到 B 的删除之后），属于新的「绑定 stub 副作用」。本档以「stub 数据面必须与真实主进程一致」为准，断言按真实 FIFO 的落盘结果写。
- 判别力核对（不弱于评审建议）：去掉守卫③ 后，A 的迟到列表（含 `n-current-1`）会被 `applyNotes` 回去并弹出 `已还原该条笔记` ⇒ 「`n-current-1` 不在列表」与「无成功文案」两条同时变红。
- 同步位置：§8.4 场景 64e 与场景表下方的「64e 的 stub 语义（冻结）」、§6 第 3 行、§5 的 `ui-shot.mjs` 行。

### must-fix 5 —— 63-3 的断言按 `1. Abstract`（`[1,1]`）的真实结果写

- 事实（`ui-shot.mjs:215` + R9 52 段实测）：`1. Abstract` 的 `noteNum = 1`，页码范围 `[1,1]` 内含 `n-current-1`（p1）⇒ 点该徽标后**不是**空态，列表 1 行。
- 冻结断言：行数 `1` 且该行为 `n-current-1`（`.note-text` 全串与种子相等）、`n-current-2` / `n-current-3` / `n-other-1` 不在列表、计数 `本章 1 条 / 共 4 条`、`.notes-chapter-empty` 与 `.notes-filtered-empty` 均**不在 DOM**；点清除（`SEL.chapterFilterClear`）后回 4 行、计数 `共 4 条`。
- 同步位置：§8.4 场景 63-3。

### must-fix 6 —— `stale` 路径的 `restoring` 复位（try/finally）

- 冻结 `onUndoClick()` 函数体（§3.3 第二段代码）：`restoring` 是面板本地 `ref`，`finally { restoring.value = false; }` 是**唯一**复位点，覆盖成功 / 过期 / `stale` / 其它失败 / 抛错五条路径；`"stale" in result` 时 `return` 前不弹提示、不动行、不覆盖列表。
- 断言补位：64c（失败路径保留行 ⇒ `.notes-undo-btn` 未 `disabled`）、64d（成功收行 ⇒ 再删一条构成新行，新按钮未 `disabled`）、64e（stale ⇒ 响应后按钮未 `disabled`）。
- 同步位置：§3.1、§3.3、§8.4 场景 64c / 64d / 64e。

### must-fix 7 —— 烟测产物路径冻结（`rootDir` + 逐字 `require`）

- 实测：`include` 两个/三个源文件时，tsc 的公共源目录是 `pix/src` ⇒ 产物是 `out-main/main/{notes-store,library-root}.js` + `out-main/shared/types.js`（view 侧为 `out-view/renderer/utils/{notes-view,notes-path}.js` + `out-view/shared/types.js`）；档内旧写的 `out-main/notes-store.js` 会 `MODULE_NOT_FOUND`。
- 冻结：两个临时 tsconfig 都显式写 `rootDir: "E:/develop/PiX-Read/pix/src"`，并把 `require` 路径按上面的字面量写死（§8.2/§8.3 的注释块即为判据）；不依赖 tsc 的公共目录推导。
- 同步位置：§8.2、§8.3（含「产出 3 个文件」的要点说明）。

### must-fix 8 —— 60-3 的失焦断言不再为空断言

- 冻结 `setSearch(text)` 语义：**先 `input.focus()`**，再用 `HTMLInputElement.prototype` 的 value setter + `new Event("input", { bubbles: true })`（仍是一次 `js` 往返，N63-5 的即时性判据不受影响）。
- 新增探针 `searchProbe()`：一次 `js` 读 `{ value, focused: document.activeElement === input, clearInDom, rows, countText }`。
- 60-3 的同一断言组：Esc **前** `focused === true`（不成立即该组失败并打印现场），Esc **后** `value === ""` 且 `document.activeElement !== input`（对应 §2.1 的「清空 + `blur()`」）。
- 连带冻结（原档只在断言里隐含）：点 `.notes-search-clear` 后查询置空且 `input.focus()`（N64-1「列表回到 4 条且输入框仍聚焦」），否则 60-4 的 `activeElement === input` 不可达；Esc 与清空按钮都**不** `stopPropagation`。
- 同步位置：§8.4 helper 段与场景 60-3 / 60-4、§1.5、§2.1、§5。

### 次级项逐条落点（评审 §3 八条）

1. **Esc 冒泡后果** → §2.1 新增「焦点与 Escape 契约」：`PdfViewer.vue` 的 window 级 `keydown` 位于 `isEditableTarget` 判定之前 ⇒ 在搜索框按 Esc 会顺带退出框选模式 / 关闭 PDF 搜索面板；这是需求 §0.8/N64-2 保留的既有语义，开发期不得当缺陷修掉。
2. **烟测产物是三个** → §8.2 / §8.3 的要点已写明 `shared/types.js` 也产出。
3. **63-8 的 `hashBefore`** → 场景内采集（§8.4），并在 §8.6 第 5 条声明「哈希基线不跨场景复用」。
4. **A/B 并行时序** → §9 新增「落地顺序（冻结）」：A 先落 `main/{notes-store,ipc-handlers,preload}.ts`，B 的 `npm run check` 依赖 `PixApi.notesRestore` 存在。
5. **外部删除 `notes.json` 后的还原语义** → §8.2 新增一行烟测：ENOENT 按空库处理 ⇒ 还原写出「只含该条」的文件（既有 `addNote` 同语义，非本轮回归，但点名一次）。
6. **§5 的 preload 措辞** → 由「既有 11 个方法签名零改动」改为「notes 系列 6 个方法签名零改动」（`PixApi` 共 78 个成员）。
7. **截图命名漂移** → §8.4 的 `62-latest.png` 改为 `62-notes-sort-latest.png`（对齐需求档 N71-3），§8.6 第 4 条注明按 §8.4 命名、数量不变（仍 18 张）。
8. **60-7 的副作用** → §8.6 第 5 条新增例外条款：60-7 / 60-9 真实删除 3–4 条笔记，其后的字节与行数判据必须先复位再采集。

### 场景可执行性补注（不改契约）

- 徽标点击的前置：60-5 / 60-7 / 62-4 / 63-3 都先 `openMap()` 并等 7 行（徽标只存在于 `.knowledge-map-slot` 内）；点击徽标本身会把活动标签切回「笔记」（R9 52 段已冻结的行为），场景不得再补一次切标签动作。
- 64b 承接 64 的末态（`n-current-2` 已删除且过期不可还原），故其「行数 2」= 4 − 1（64）− 1（64b 自删的 `n-current-1`）；场景末尾 `restoreStandardSeed()` 复位。
- 60-9 的末条查询取 `消融`（命中 `n-current-1` 的备注，而 PDF 英文原文不含该子串），保证「删空最后一条后 0 命中」与「摘录后仍 0 命中」两个条件在夹具下同时成立。
- 撤销行的到期路径在本档是「钳到 0 的定时器」而非早退分支：`64b` 的「行不复活」断言仍然成立（切标签往返后不在 DOM），因为它依赖的是 `deletedAt` 折算而不是返回值时机。

### 残余项（不阻塞开工）

- 无阻塞项。§10 的 7 条回退建议维持原状（第 7 条已被 §8.6 第 3 条的「行内元素逐字相等 + 纵坐标允许位移」收敛）。
- 唯一需要批准的口径变动是 must-fix 4 的偏离（64e 断言组）；若负责人坚持评审字面，则改回「延迟推后到校验之后、写盘之前」，并把 64e 断言换成「行数 2 且无 `n-current-2` 行」——代价是 stub 的写盘顺序不再等价于真实主进程。
