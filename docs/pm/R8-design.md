# PiX-Read R8 设计档 · 笔记作为对话上下文（N43–N51）

> 上游：`docs/pm/R8-req.md`（需求，N43–N51 与 §0 冻结值）、`docs/pm/R8-review.md`（需求评审 must-fix 6 条与次级项）、`docs/pm/PRD-V0.4.md` §3/§4.2/§4.3/§7.2、`docs/pm/R7-design.md`（R7 锚点契约，本轮只做等价索引化）。
> 本档是「可直接开工的定稿设计」：契约、纯函数签名、注入模板、文案字面量、DOM 选择器、上限算法、失败路径、分工与验证全部写死到可判定粒度。**本档不改任何代码**，只新增这一份文档。
> 判定工具四种（与需求档一致）：【走查】只读代码 / `git diff` / `git status`；【check】`cd pix && npm run check`（改前基线已实测 **0 error**）；【烟测】`utils/{reading-context,notes-path}.ts` 用仓库外临时 tsconfig 编译后 node 直接断言；【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs`（退出码 0 + `MANIFEST.json.failure === null` + `MEASUREMENTS.json` 全绿）。

---

## 0. 口径修订与字面冲突处置（3 条，均为「需求档内部或与现状代码冲突」，本档就地对齐）

**修订 1（对应 must-fix 2）—— 删掉 §0.3 情形 7 的「`status !== "ready"` 时清空」半句，只保留「与最新清单求交」。**
事实：产品内不存在「ready + 已选 → loading/error」的可达路径。进入笔记标签即 `loadNotes` → `loading`，而进入动作本身已按情形 4 清空；`loadNotes` 的其余触发点是错误态的「重试」（此时选择集必为空）；`selectLeftTab` 同标签早退（`WorkspacePage.vue:196-201`）；stub 也无法从渲染层外部驱动 `notesStore.loadNotes()`（`__pixStub` 只有 `window.pixApi` 面，不接触 Pinia）。保留该半句即产生不可判定断言（N43-9 恒真）与 N51-7「不新增死代码」的直接冲突。
本档写死：**选择集不因 status 变化而清空**；「选择集元素派生自 `notesStore.notes ∩ selectedNoteIds`」已保证清单变化后无幽灵条目（情形 6/7 的共同机制）。可见后果只有一条且被 §2.0 冻结：`.notes-selection-bar` 仅在 `status === "ready"` 时渲染。
⇒ 该半句进入 §8 需求回退建议第 1 条。

**修订 2（字面冲突）—— chip `title` 的逐字文案取 §0.2，N45 验收 3 少写了「笔记」二字。**
§0.2（冻结值）写 `本次注入 P 条笔记；M 条因超过 8000 字符上限未注入`；N45 验收 3 写 `本次注入 1 条；1 条因超过 8000 字符上限未注入`。本档按 §0（「冻结值，设计/开发档不得改写」）取 **带「笔记」的版本**，并在 §8 要求需求档回改 N45 验收 3 的字面量。
同时采纳评审次级项 8 的处置：条数上限造成的丢弃在选择期已被硬拒（第 11 条不可选），`dropped` 中的「超条数」成分只能由防御式裁剪产生（仅烟测可达）⇒ 该 `title` 文案在**产品内每一条可达路径上**逐字成立。

**修订 3（字面冲突）—— §0.1 的真实示例把两条笔记的先后写反了，注入顺序以 §0.2 的冻结排序为准。**
§0.2 冻结：`docPathKey` 升序 → `page` 升序 → `createdAt` 升序 → `id` 升序。示例里 `sample-paper.pdf` 排在 `archive/older-paper.pdf` 之前，与 `docPathKey("archive/older-paper.pdf") < docPathKey("sample-paper.pdf")` 相反。本档 §1.2 给出的真实示例与 §6.2 烟测用例 3、§6.3 场景 43 的断言**一律按冻结排序**（`archive/...` 在前）；格式（行序、3 空格缩进、无空行、字段顺序）与 §0.1 逐字一致不变。

---

## 1. 契约冻结表

### 1.1 选择集状态（`pix/src/renderer/stores/notes-store.ts`）

| 项 | 冻结值 |
| --- | --- |
| 落点 | `useNotesStore`（渲染层笔记唯一数据源同址），**不外露原始集合** |
| 字段 | `const selectedNoteIds = ref<ReadonlySet<string>>(new Set())` |
| 响应式 | 是（`ref` + 整体替换式更新：每次动作赋一个新的 `Set`，与 `ChatPanel.excludedContexts` 同范式；**不**做 `Set.add/delete` 就地改） |
| 派生 1 | `const selectedNotes = computed<ReaderNote[]>(() => notes.value.filter((n) => selectedNoteIds.value.has(n.id)))` |
| 派生 2 | `const selectedCount = computed(() => selectedNotes.value.length)` |
| 派生 3 | `const selectionFull = computed(() => selectedNotes.value.length >= MAX_CONTEXT_NOTES)`（未选条目的控件禁用判据） |
| 读动作 | `isNoteSelected(id: string): boolean` |
| 写动作 1 | `toggleNoteSelected(id: string): void` — 已选则移除；未选且 `selectionFull` 则 **no-op**（上限守卫，用派生计数判，不用 `selectedNoteIds.size`）；否则加入 |
| 写动作 2 | `replaceSelectionWith(id: string): boolean` — `notes.value` 中不存在该 id ⇒ 返回 `false` 且**不改选择集、不触发任何副作用**；存在则 `selectedNoteIds.value = new Set([id])` 并返回 `true`（即「追问」的替换语义：替换、不追加） |
| 写动作 3 | `clearNoteSelection(): void` — 置空集合 |
| 既有动作 | `resetNotes()` **追加一行** `clearNoteSelection()`；其余（`loadNotes`/`addNote`/`runMutation`/`recoverCorruptNotes`/`setCurrentDocOnly`/`applyNotes` 覆盖策略）逐字不动 |
| 失效 id | 允许存在（删除后不清理）：计数、上限判定、注入载荷**一律取派生结果**，`selectedNoteIds` 中的失效 id 不可见、不占名额、不产生幽灵条目；不做 `watch(notes)` 手工同步、不做 prune |
| 快照口径 | 发送瞬间调用 `[...notesStore.selectedNotes]` 取**当时的派生结果**（新数组，元素为当时的 `ReaderNote` 对象；`applyNotes` 全量替换列表 ⇒ 元素对象不会被就地改写）。发送在途发生的清单/选择变化只影响下一回合，不回溯本次载荷 |
| 不落盘 | 选择集只存在于渲染层内存：不写 `notes.json`、不写 `reader-state.json`、不写 settings、不新增 IPC |

### 1.2 注入契约（`pix/src/renderer/utils/reading-context.ts`，唯一实现点）

```ts
import type { LibraryFileResult, ReaderNote } from "@shared/types";   // 同一句 import 增加 ReaderNote
import { sortNotesForContext } from "./notes-path";                    // 顶层 value import，无环

export interface ReadingSendContext {
  filePath: string | null;
  page: number;
  pageCount: number;
  selectedText: string;
  notes: ReaderNote[];          // 新增，必填（不做可选 + 默认值，避免第二套向后兼容分支）
}

/** 条数上限：选择期拒绝第 11 条（N47 与需求 §0.2）。 */
export const MAX_CONTEXT_NOTES = 10;
/** `reader_notes` 段的字符上限：判据 = entries.join("\n").length（需求 §0.2）。 */
export const MAX_CONTEXT_NOTES_CHARS = 8000;

export interface NotesContextSelection {
  entries: string[];            // 已装入的条目块文本，顺序 = 注入顺序，entries.join("\n") ≤ 8000
  injected: ReaderNote[];       // 与 entries 同序同长
  dropped: ReaderNote[];        // 整条丢弃（超字符上限，或防御式超条数上限）
}

export function selectNotesForContext(notes: ReaderNote[]): NotesContextSelection;
```

- **排序**：`selectNotesForContext` 内部第一句即 `sortNotesForContext(notes)`（实现点唯一在 `utils/notes-path.ts`，复用既有 `docPathKey`）。
- **装填算法（冻结，需求 §0.2）**：排序后 `slice(0, MAX_CONTEXT_NOTES)` 为候选、其余计入 `dropped`；随后**顺序**逐条尝试——`[...entries, block].join("\n").length > MAX_CONTEXT_NOTES_CHARS` ⇒ 该条整条丢弃并**继续尝试后续条目**；不停止、不截断、无 `slice/substring`。单条自身超限时可装入 0 条（硬上限不为「至少注入一条」开口子）。序号按**已装入条数**续编（`entries.length + 1`），被丢弃的条目不占号 ⇒ 序号从 1 连续。不变式：`injected.length + dropped.length === notes.length`。
- **字段渲染（逐字，需求 §0.1）**：每条 1 个序号行 + 4 个字段行，字段顺序 `doc` → `page` → `kind` → `text` →（有备注才）`comment`；字段行以 **3 个半角空格**缩进；条目之间**无空行**；`doc` 取 `ReaderNote.docPath` **原样**（相对路径、正斜杠、保留原大小写）；**不注入** `id` / 绝对路径 / 时间戳；`kind` 用原始取值 `excerpt` / `answer`。
- **归一化**：`text` 与 `comment` 写入条目块前一律 `value.replace(/\s+/g, " ").trim()`（读侧不变量不可依赖：`isReaderNote` 不查换行，`ui-shot` 与手工编辑的 `notes.json` 都可能带换行）；`comment` 归一化后为空 ⇒ **不渲染** `comment:` 行。
- **`kind: answer` 的后果（承认，不加例外）**：AI 结论多为 markdown（含换行、列表、代码块），行内归一化会把它们折叠成一行 —— 这是 §0.1 冻结格式（一个字段一行）的必然结果，不是缺陷；注入面**不得**按 `kind` 过滤或加例外分支。
- **段位置**：`reader_notes:` 行追加在 `selectedText` 内容之后、`</reading_context>` 之前；`entries.length === 0` ⇒ **不出现** `reader_notes:` 行（与「无选区不出现 `selectedText:` 行」同范式）。既有 `path` → `page` → `pageCount` → 可选 `selectedText:` 四/五段**逐字不动**。
- **气泡**：注入只影响发给模型的 `message`；用户气泡仍只显示 `text`（`displayText`），既有约定不变。

**真实示例**（当前文档 `sample-paper.pdf` 第 2 页、有选区、选中两条笔记：一条有备注、一条来自另一篇文档；`notes` 传入顺序与 §0.2 排序结果一致）：

```
<reading_context>
path: C:\Users\86157\AppData\Local\Temp\pix-r5\library\sample-paper.pdf
page: 2
pageCount: 3
selectedText:
which confirms the mask is doing more than sparsification.
reader_notes:
1. doc: archive/older-paper.pdf
   page: 7
   kind: excerpt
   text: Section 4. Reproducibility: all runs use three seeds and report the median.
2. doc: sample-paper.pdf
   page: 1
   kind: excerpt
   text: We study retrieval over long documents where the attention budget is the binding constraint.
   comment: 与第 3 节消融实验对照
</reading_context>

请对比这两处的结论。
```

实现形态（`lines.join("\n")`，**无结尾换行**；`userText` 非空时以「空行 + userText」收尾）：

```ts
const lines = ["<reading_context>", `path: ${ctx.filePath}`, `page: ${ctx.page}`, `pageCount: ${ctx.pageCount}`];
const selected = ctx.selectedText.trim();
if (selected) { lines.push("selectedText:"); lines.push(selected); }
const picked = selectNotesForContext(ctx.notes);
if (picked.entries.length > 0) { lines.push("reader_notes:"); lines.push(...picked.entries); }
lines.push("</reading_context>");
if (userText) { lines.push(""); lines.push(userText); }
```

**体积关系声明**：`MAX_CONTEXT_NOTES_CHARS` 只约束 `reader_notes` 段，**不构成整块 `<reading_context>` 的上下文保护总量** —— `selectedText` 无任何上限（`PdfViewer` 直接取 `selection.toString()`），`path` 长度取决于资料库路径。上游若需要总量保护，属另一轮。

### 1.3 chips 契约（`pix/src/renderer/components/workspace/ChatPanel.vue`）

| 项 | 冻结值 |
| --- | --- |
| kind | `type ContextChipKind = "document" \| "selection" \| "notes"` |
| 结构 | `interface ContextChip { kind: ContextChipKind; icon: string; label: string; title?: string }`（新增 `title`，仅 notes chip 使用；模板 `:title="chip.title"`） |
| chip | `kind: "notes"`、图标 `mdi-notebook-outline`（与面板空态同源）、label 两形态、`title` 两形态、移除按钮沿用既有 `.context-chip-remove`（`title="本次发送不使用"`）+ `excludeContext("notes")` |
| label 模板 | 无丢弃：`摘录 N 条`；有丢弃：`摘录 N 条 · 超出上限未注入 M 条`（`N` = 选择条数 = `injected + dropped`，`M` = `dropped.length`） |
| title 模板 | 无丢弃：`本次注入 P 条笔记`；有丢弃：`本次注入 P 条笔记；M 条因超过 8000 字符上限未注入`（`P = injected.length`） |
| 可见性判据（must-fix 1） | `const readingContextWillSend = computed(() => documentChip.value !== null && !excludedContexts.value.has("document"))`；`notesChip` 在该 computed 为 `false` 或 `selectedCount === 0` 时返回 `null`。即**chip 可见 ⇔ 本次会输出 `<reading_context>` 且会输出 `reader_notes:`**（`documentChip === null` 时 `buildReadingUserMessage` 早退，chip 必须一起消失） |
| 顺序 | `contextChips` 仍是 `[documentChip, selectionChip, notesChip].filter(chip => chip !== null && !excludedContexts.value.has(chip.kind))` ⇒ 顺序 `document` → `selection` → `notes`，**排除机制零改动、不新增第二个 chip 行** |
| 级联 | `"document" ∈ excludedContexts` ⇒ `readingContextWillSend === false` ⇒ notes chip 一并**不渲染**（N45-6）；既有 `selection` chip 不受影响（反需求 9：既有的「选中文本」chip 不一致本轮不修） |
| 同源 | chip 的 `N/M/P` 与注入载荷都由 `selectNotesForContext(notesStore.selectedNotes)` 产生；`ChatPanel` 内**不出现** `slice` / `join` / 长度比较 / 排序 / 上限判定；`title` 里的 `8000` 是顶层 import 的 `MAX_CONTEXT_NOTES_CHARS` **文案插值**（唯一数值引用，不参与判定 ⇒ `grep -rn "8000" pix/src/renderer` 只命中定义行） |
| 恢复 | 发送结束后 `finally` 里的 `resetExcludedContexts()` 使 chip 立即恢复（选择集保留，需求 §0.5）；用户停止注入只有面板「清空」一条路径 |

### 1.4 「追问」seam 契约（`pix/src/renderer/composables/useQuickAsk.ts`，仍是唯一 seam 文件）

```ts
/** 笔记「追问」：NotesPanel 先改 store 选择集，再投递一个无参触发信号（不携带载荷）。 */
export type NotesAskHandler = () => void;
export function registerNotesAskConsumer(handler: NotesAskHandler | null): void;
export function emitNotesAsk(): void;
```

- 模块级单槽（`let currentNotesAskHandler: NotesAskHandler | null = null`），与既有 `registerQuickAskConsumer` / `emitQuickAsk` **同文件、同范式**；文件头注释补一句说明两套 seam 并存。既有 PDF 选区 seam 的签名与行为零改动（`PdfSelectionQuickAsk.vue` 仍调 `emitQuickAsk`，模板 `请解释选中的这段话：` 逐字不变）。
- ChatPanel：`onMounted` 里 `registerNotesAskConsumer(onNotesAsk)`，`onUnmounted` 里 `registerNotesAskConsumer(null)`（与 quick-ask / region-capture 并排）。
- **写权唯一（must-fix 3）**：选择集替换只在 `notesStore.replaceSelectionWith(id)` 一处发生。行内「追问」= `replaceSelectionWith(note.id)` 返回 `true` 后 `emitNotesAsk()`；返回 `false`（id 已失效）⇒ **不改选择集、不发信号、不聚焦、不抛错**。选择条「问 AI」= 原样使用当前选择集后 `emitNotesAsk()`（模板内直接调用，不写第二个处理函数）。
- **ChatPanel 侧唯一处理函数** `onNotesAsk()`（两个入口共用，不写两条分支）：

| composer 状态 | 行为 |
| --- | --- |
| `draft.value.trim() === ""` | `draft.value = NOTES_ASK_TEMPLATE`，聚焦输入框，不显示提示行 |
| `draft.value.trim() !== ""` | draft **一个字符都不改**；聚焦输入框；显示 `.notes-ask-notice`，文案逐字 `已加入 N 条摘录，草稿已保留`（`N` = 触发时刻的 `notesStore.selectedCount`），`NOTES_ASK_NOTICE_MS = 2500` 后消失 |

- 常量：`const NOTES_ASK_TEMPLATE = "请结合我选中的摘录回答："`（全角冒号）、`const NOTES_ASK_NOTICE_MS = 2500`。硬要求：**不把笔记原文写进 textarea**、不清空/不覆盖用户输入。
- 流式中（`isStreaming`）允许追问：选择集替换照常，发送走既有 steer 分支，锚点与注入链路不变。
- **两个入口的可用性（三态，冻结；自上而下第一条命中者生效）**：

| 条件 | `.note-ask` / `.notes-ask-btn` | `.note-ask-wrap` / `.notes-ask-btn-wrap` 的 `title` |
| --- | --- | --- |
| `clarifying === true`（澄清待答） | `disabled` | `等待澄清回答时无法发起追问` |
| 无打开文档（`documentOpen === false`） | `disabled` | `请先打开文档，摘录才会随提问注入` |
| 其余 | 可用 | **无 `title` 属性** |

  理由（设计评审 must-fix 6）：无文档 ⇒ `readingContextWillSend === false` ⇒ chip 不渲染、载荷无 `reader_notes`，「追问」会静默空转；禁用把这条失败变成可见反馈。`title` 挂**包裹元素**（Chromium 对禁用控件不派发鼠标事件，与 R7 `.answer-save-wrap` 同规避）；禁用态点击零副作用（不改 draft、不改选择集、不聚焦）。
  两个判据都是 `NotesPanel` 的**新增 prop**：`clarifying: boolean` 与 `documentOpen: boolean`；`WorkspacePage` 绑定 `:clarifying="pendingUserInput !== null"`（`pendingUserInput` 是其既有单一来源）与 `:document-open="readerStore.filePath !== null"`（与 `ChatPanel.documentChip` 同源字段 ⇒ 「可用 ⇔ 会注入」与 chip 可见性同判据；`excludedContexts` 的本次排除**不**参与该判据）。面板内唯一的判定入口是 `askDisabledTitle`（三态常量 + 优先级），两个入口的 `disabled` 与两个包裹元素的 `title` 都取它。

### 1.5 面板 DOM 与文案契约（选择器冻结，实现不得改名）

| 选择器 | 含义 / 落点 |
| --- | --- |
| `.notes-selection-bar` | 选择条，渲染在 `.notes-header` 内、`.notes-filter` 之后（随头部 sticky）；渲染条件 = `status === "ready" && hasNotes && selectedCount > 0` |
| `.notes-selection-count` | 计数文案 `已选 N 条`（`N` = `selectedCount`） |
| `.notes-ask-btn-wrap` / `.notes-ask-btn` | 选择条动作，按钮文本 `问 AI`；`disabled` 落在 `.notes-ask-btn`，`title` 落在 `.notes-ask-btn-wrap` |
| `.notes-selection-clear` | 选择条动作，文本 `清空`；**不受 `clarifying` 影响**（清空不是提问） |
| `.note-row.selected` | 已选行态（与既有 `.confirming` 可叠加：`.note-row.selected.confirming` 沿用既有 confirming 配色，不新增第三种配色） |
| `.note-body` | 新增：`.note-row` 的列式内容容器（由原 `.note-row` 的 `flex-direction: column; gap: 4px` 迁移而来） |
| `.note-select-wrap` / `.note-select` | 选择控件：**原生** `<input class="note-select" type="checkbox">`（同 `.note-delete` 的原生控件范式），`disabled` 属性落在 `.note-select` 本体；包裹元素 `.note-select-wrap` 承载 `title` **与唯一处理器 `@click.stop="toggleNoteSelected(note.id)"`**（见下方三态 3） |
| `.note-actions` / `.note-ask-wrap` / `.note-ask` | 行内追问：`.note-actions` 是 `.note-body` 的**最后一个子节点**（右对齐单行），`.note-ask-wrap` 承载 `title`，`.note-ask` 是按钮本体（`:disabled` 与 `@click.stop="onAskNote(note)"` 都在本体），文本 `追问` |
| `.notes-ask-notice` | composer 内的草稿保护提示行（渲染在 `.context-row` 与 `.attachment-row` 之间），2500 ms 后消失 |
| `.context-chip` / `.context-chip-label` / `.context-chip-remove` | 既有 chip 三件套（新 chip 复用，不新增类名） |

**布局冻结（防 32 段 `headOverflow` 回归，评审次级项 5）**：`.note-row` 改为 `display: flex; flex-direction: row; gap: 6px; align-items: flex-start`；新增 `.note-select-wrap { flex: 0 0 auto; display: inline-flex; align-items: center; height: 16px }` + `.note-select { width: 13px; height: 13px; margin: 0; accent-color: var(--pix-accent); cursor: pointer }`；`.note-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px }`。**`.note-head` 内部**（`.note-page-badge` / `.note-ai-badge` / `.note-time` / `.note-delete` 的顺序、类名、DOM）**零改动**；`.note-head` 可用宽度只减少 `13 + 6 = 19px`，由既有 `.note-time { flex: 1; min-width: 0; text-overflow: ellipsis }` 吸收 ⇒ 32 段的「`.note-head` 不横向溢出」判据仍是回归门。

**上限控件三态（冻结）**：
1. 未选 且 `selectionFull` ⇒ `.note-select.disabled === true`，`.note-select-wrap[title] === "最多可注入 10 条笔记，请先取消其它选择"`（`MAX_CONTEXT_NOTES` 插值，不硬编码 10）。
2. 已选 / 未选且未满 ⇒ `.note-select.disabled === false`，`.note-select-wrap` **无 title 属性**。
3. **点击落点唯一（冻结，must-fix 3）**：`.note-select-wrap` 承担唯一处理器 `@click.stop="toggleNoteSelected(note.id)"`（同时带 `title`）；`.note-select` **只挂受控属性** `:checked` / `:disabled`，**0 处 `@click`** —— 点复选框本体靠冒泡命中包裹元素，恰好切换一次（本体再挂 handler ⇒ 双触发自相抵消；本体只挂 `.stop` ⇒ 点击失效）。`.note-ask-wrap` 只承担 `title`；`.note-ask` 承担 `:disabled` 与 `@click.stop="onAskNote(note)"`（禁用态必须挡在本体上，否则包裹元素的处理器会旁路禁用）。选择条按钮在 `.notes-header` 内、其祖先无点击处理，不要求 `.stop`（must-fix 5）。

### 1.6 stub 原语契约（`pix/scripts/ui-shot.mjs`，纯增量）

| 原语 | 语义 |
| --- | --- |
| `sendCalls()` | `{ count, payloads: 最近 8 条 { type, message, displayText } }`，只在 `command.type === "prompt" \| "steer"` 时记录（`handleCommand` 目前无这两类分支，需**新增** prompt/steer 分支并在此记录，`sendCommand` 仍直通 `handleCommand`） |
| `clearSendCalls()` | 计数与 payloads 一并清空（场景隔离） |
| `setSendFailure(mode)` | `"throw"` ⇒ `sendCommand` 对 prompt/steer 抛 `new Error("stub 发送注入异常")`；`"fail"` ⇒ 返回 `{ success: false, error: "stub 发送被拒绝" }`；`null` 复位。**只作用于 prompt/steer**，不影响 `get_state` 等既有命令 |
| `emitUserInputRequest(request \| null)` | 把 `request` 逐个投递给保留的 `onUserInputRequest` 回调（`onUserInputRequest` 由「丢弃式 no-op」改为保留回调并返回取消函数，与 `onAgentEvent` 同形）；`null` 即清空 `pendingUserInput` |
| `setNotesDeleteFailure(code \| "throw")` | `notesDelete` 直接返回该码 + 中文原文（**不写盘**）；`"throw"` 抛异常；`null` 复位（与 `setNotesAddFailure` 同形） |
| 既有 | `seedNotes` / `notesAddCalls` / `setNotesAddFailure` / `setNotesAddDelay` / `setLoadDelay` / `setLoadFailure` / `setMessages` / `emitAgentEvent` / `setLibraryReadDelay` / `setReaderState*` / `readerStateSaveCalls` 全部保持不变 |

脚本侧新增（作用域同 §6.3 前置）：`setDraft(text)`（原生 setter 写 `.input-area` + 派发 `input`；`typeAndSend` 改为复用它，不产生第二份写法）、`sendViaEnter(text)`（`setDraft` + 在 `.input-area` 上派发 `keydown Enter`，用于 `isStreaming` 时 `.composer-send` 被 `.composer-stop` 替换的 steer 路径）、`answerTitleFromEnd(n)`（末尾第 n 个回答块的 `.answer-save-wrap[title]`；既有 `titleOfLastAnswer` **泛化**为它的 `n = 1` 调用，不留第二份写法）。

---

## 2. 选择集生命周期表（七种情形，写死）

| # | 情形 | 判据（触发点） | 选择集结果 | 可见后果 / 实现落点 |
| --- | --- | --- | --- | --- |
| 1 | 发送成功 | `rpc.sendPrompt` / `rpc.sendSteer` 未抛错 | **保留** | `excludedContexts` 在 `send()` 的 `finally` 复位 ⇒ chip 立即恢复；下一回合仍注入；`send()` 内**不得**清空选择集（N48-7） |
| 2 | 发送失败 | IPC reject 或 `success:false`（`sendCommandOrThrow` 抛错），乐观块被 `failOptimisticUserMessage` 回滚 | **保留** | chip 与选择条原样；错误反馈由既有 `.error-block` 给出（不新增提示） |
| 3 | 切换文档 | `readerStore.filePath` 变化 | **保留** | 可达路径只有「点笔记行跳回另一篇」（`WorkspacePage.onOpenNote`）；从资料库树打开另一篇必须先切到 library 标签 ⇒ 已按情形 4 清空。这也是注入顺序必须独立于面板顺序的原因 |
| 4 | 离开笔记标签 | `leftTab` 由 `"notes"` 变 `"library"`（`selectLeftTab` 的非早退分支） | **清空** | 选择条消失、chip 消失、行内控件回到未选；理由：面板被树替换后用户无法核对「本次注入哪几条」。**折叠左栏（`leftCollapsed`）不清空**（写死）：chip 仍可见并写明注入/丢弃条数，折叠是临时视图动作、不改变左栏内容，清空反而毁掉「选完摘录 → 折叠腾宽度 → 提问」动线 |
| 5 | 离开工作区 | `goHome()` 或 `WorkspacePage.onUnmounted` 的 `notesStore.resetNotes()` | **清空** | 跨工作区零残留；`resetNotes()` 内追加 `clearNoteSelection()`，两个既有调用点不变 |
| 6 | 笔记被删除 | `removeNote` **成功**（主进程回传全量列表覆盖本地） | **收敛**：只丢被删那条 | 计数与 chip 同步减 1（派生自动完成）；**删除失败时选择集与 chip 都不动**（`runMutation` 失败不调 `applyNotes`） |
| 7 | 笔记被重载 | `loadNotes` 成功 / `recoverCorruptNotes` 成功（全量覆盖） | **收敛**：与最新清单求交（派生自动完成） | `status !== "ready"` **不清空**（§0 修订 1）；`.notes-selection-bar` 只在 ready 时渲染；chip 的可见性只看 `readingContextWillSend` 与 `selectedCount`，与 status 无关 —— 载荷与 chip 同源，故「加载中 chip 仍在」不构成撒谎 |

补充口径（写死）：
- 「仅看当前文档」筛选与分组（含当前文档组置顶）**不影响**选择集：被筛掉的条目仍在集合内、计数照算，「清空」入口始终可用（bar 的渲染条件不看 `groups`）。
- 移除 chip（`excludeContext("notes")` / `excludeContext("document")`）**不影响**选择集。
- 发送被早退（draft 为空且无附件、或 `clarifying` 为真）时选择集不变。
- 选择集与顺序无关：去重按 `id`（`Set` 语义），重复点击是切换。

---

## 3. 文件级清单（动作 + 具体改动点 + 不变量）

### 3.1 A 面（数据与注入面）

| 文件 | 动作 | 具体改动点 | 不变量 |
| --- | --- | --- | --- |
| `pix/src/renderer/utils/notes-path.ts` | 修改 | 新增并导出 `sortNotesForContext(notes: ReaderNote[]): ReaderNote[]`：`[...notes].sort((a,b) => docPathKey(a.docPath).localeCompare(docPathKey(b.docPath)) \|\| a.page - b.page \|\| a.createdAt - b.createdAt \|\| a.id.localeCompare(b.id))`，带注释注明「注入顺序，与面板顺序无关（R8 §0.2）」 | `docPathKey` / `currentDocKey` / `docDisplayName` / `absoluteDocPath` / `groupNotesByDocument` 逐字不动（面板分组与置顶语义不变） |
| `pix/src/renderer/utils/reading-context.ts` | 修改 | §1.2 全部：`ReadingSendContext.notes` 必填字段、`MAX_CONTEXT_NOTES` / `MAX_CONTEXT_NOTES_CHARS`（带注释注明来源与本档编号）、`NotesContextSelection`、`selectNotesForContext`、条目块渲染（含行内归一化）、`buildReadingUserMessage` 追加 `reader_notes` 段。既有四个字段与失败消息段**零改动** | `reader_notes` 的字符串拼接、排序、长度比较**只**在本文件（排序委托 `sortNotesForContext`）；无字符级截断；`notes: []` 时输出与 R7 逐字节相同；不出现第二份上限数值 |
| `pix/src/renderer/stores/notes-store.ts` | 修改 | §1.1：`selectedNoteIds` + 三个派生 + 四个动作 + `resetNotes()` 追加清空；从 `../utils/reading-context` 顶层 import `MAX_CONTEXT_NOTES`（上限守卫用派生计数判） | 既有动作语义、`applyNotes` 全量覆盖、错误码表、竞态序号（`loadSeq`/`writeSeq`）、不拼路径全部不变；`status` 变化不清空选择集 |
| `pix/src/renderer/stores/session-store.ts` | 修改 | `readingAnchorFor` 索引化：新增模块内 `blockIndexOf(blockId)`，以「数组引用变 **或** 长度变 ⇒ 整表重建」为唯一失效判据（`byId` 首现下标优先，与 `findIndex` 取第一个匹配等价）；`readingAnchorFor` 的解析循环与返回类型逐字不变 | 解析规则、签名、返回类型零改动；不得出现 `displayBlocks.value.splice/shift/unshift/sort/reverse`（当前为 0 命中，本轮维持）；`displayBlocks.value = …filter/slice/[]` 与 `.push` 是仅有的两种变更形态 |

**N49 失效覆盖表（评审 must-fix 6 要求的「全部块列表变更点」）**

| 变更点 | 代码形态 | 是否命中判据 | 结果 |
| --- | --- | --- | --- |
| 新增块（多处） | `displayBlocks.value.push(block)`（就地，尾部追加） | 长度变 | 重建 ✅ |
| 失败回滚 | `displayBlocks.value = displayBlocks.value.filter(...)`（`failOptimisticUserMessage`） | 引用变 | 重建 ✅ |
| 空 work-status 清理 | 同上 `filter`（`closeCurrentWorkStatus`） | 引用变 | 重建 ✅ |
| `MAX_DISPLAY_BLOCKS` 裁剪 | `displayBlocks.value = displayBlocks.value.slice(...)` | 引用变 | 重建 ✅ |
| `clearSession` | `displayBlocks.value = []` | 引用变 | 重建 ✅ |
| `loadMessages` | 整体赋值 | 引用变 | 重建 ✅ |
| 流式 delta / 字段就地更新 | 元素字段赋值（`block.content = …` / `isStreaming = …`） | 不命中 | 不重建（正确：id 与下标都没变） |

默认实现为「任意中段位移都由替换数组承担」这一既有事实：若将来出现就地中段删除（`splice`），必须改成替换数组，否则缓存失效判据不覆盖 —— 该约束写进代码注释并由 §6.4 的 grep 门看守。

### 3.2 B 面（UI 与取证面）

| 文件 | 动作 | 具体改动点 | 不变量 |
| --- | --- | --- | --- |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | 新增两个 prop `clarifying: boolean` 与 `documentOpen: boolean`；行模板改为 `.note-select-wrap` + `.note-body`（既有 `.note-head`/`.note-text`/`.note-expand`/`.note-comment` 原样搬入，内部零改动）+ `.note-actions`；头部新增 `.notes-selection-bar`（`.notes-selection-count` / `.notes-ask-btn-wrap` + `.notes-ask-btn` / `.notes-selection-clear`）；`onAskNote`（`replaceSelectionWith` → `emitNotesAsk`）；三个面板内常量 `SELECT_CAP_TITLE`（用 `MAX_CONTEXT_NOTES` 插值）、`ASK_DISABLED_TITLE`、`ASK_NO_DOC_TITLE` 与唯一判定 `askDisabledTitle`（§1.4 三态） | 分组键/组内排序/当前文档置顶/筛选开关/计数文案/导出/删除二次确认（3 s + capture `pointerdown`）/加载与错误态/逃生口/备注编辑/展开全文/AI 徽标**全部零改动**；`.note-row` 的行级 `@click="emit('open-note', note)"` 不变；行内新增控件按 §1.5 三态 3 的「点击落点唯一」实现 |
| `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改 | `ContextChipKind` 增 `"notes"`、`ContextChip.title?`、`readingContextWillSend` + `notesChip`、`contextChips` 数组增一项（filter 形态不变）；发送前顶层 import `MAX_CONTEXT_NOTES_CHARS` 仅用于 notes chip 的 `title` 插值（不参与判定）；`send()` 内新增唯一笔记快照并作为 `readContext.notes` 实参；`onNotesAsk` + `notesAskNotice` + 定时器（`onUnmounted` 清理）；`registerNotesAskConsumer` 注册/注销；模板 `.notes-ask-notice` 与 chip 的 `:title`；`answerActionViews`（每帧每块一次锚点解析）+ 三个访问器 | 既有「当前文档」「选中文本」chip 的行为/文案/移除逐字不变；`send()` 的既有快照、锚点登记、排除分支、`finally` 复位、`rpc.sendPrompt/sendSteer` 调用形状不变；`send()` 内不清空选择集；`answer-save-wrap` 的 title 文案与 disabled 语义逐字不变；复制 / `[[pN]]` / 滚动跟随 / mdCache 零改动 |
| `pix/src/renderer/composables/useQuickAsk.ts` | 修改 | 追加 `NotesAskHandler` / `registerNotesAskConsumer` / `emitNotesAsk` 三处（同文件、同范式），文件头注释补一句两套 seam 并存 | 既有 `QuickAskHandler` / `registerQuickAskConsumer` / `emitQuickAsk` 签名与实现逐字不动；不新增第二个 seam 文件 |
| `pix/src/renderer/pages/WorkspacePage.vue` | 修改 | `selectLeftTab`：`tab === "library"` 分支追加 `notesStore.clearNoteSelection()`；`<NotesPanel>` 增 `:clarifying="pendingUserInput !== null"` 与 `:document-open="readerStore.filePath !== null"` | `resetNotes()` 的三个调用点（挂载 / 卸载 / `goHome`）不变；`loadNotes` 触发时机不变；`onOpenNote` 跳转逻辑不变 |
| `pix/scripts/ui-shot.mjs` | 修改 | §1.6 stub 五个增量 + §6.3 的 16 个场景与 5 个断言组 | 既有 00–11、20–24、30–36 场景、`SEL`、`MANIFEST`/`MEASUREMENTS` 结构不变；stub 是**字符串模板**（内部不得出现反引号）；不写仓库内文件 |

范围外（任何情况下不动）：`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置、`pix/resources/skills/**`、`pix/src/main/**`（含 `reading-prompt.ts`）、`pix/src/shared/types.ts`、`pix/src/renderer/types/*`、其余 components/stores/utils/composables。

---

## 4. 失败路径表

| # | 情况 | 行为 | 用户可见反馈 |
| --- | --- | --- | --- |
| 1 | 未打开文档 + 已选笔记 | chip **不渲染**（`documentChip === null` ⇒ `readingContextWillSend === false`）；`buildReadingUserMessage` 早退，发送裸文本 | 无 chip；`sendCalls` 的 message 与用户输入逐字相同、无 `<reading_context>` |
| 2 | 「当前文档」chip 被移除 | notes chip 一并消失（级联）；发送走「不发 `<reading_context>`」分支 | 两个 chip 同时消失；payload 无 `reading_context`、无 `reader_notes`；发送后两者一起恢复 |
| 3 | 「摘录」chip 被移除 | 只影响本次发送（`excludeContext("notes")`）；`finally` 复位 | chip 消失 → 发送后立即恢复；payload 有 `<reading_context>`、无 `reader_notes` |
| 4 | 字符上限超限 | 整条丢弃（无字符级截断），继续尝试后续条目；全部丢弃时无 `reader_notes:` 行 | chip 文案 `摘录 N 条 · 超出上限未注入 M 条` + title 写明 P/M；P=0 时 chip 仍渲染（用户仍可移除 chip） |
| 5 | 选择第 11 条 | `.note-select.disabled === true`；即便点到包裹元素，store 上限守卫 no-op | 计数恒为 `已选 10 条`；悬停 `.note-select-wrap` 见上限文案 |
| 6 | 触发追问时该 id 已不在清单（并发删除等） | `replaceSelectionWith` 返回 `false` ⇒ 不改选择集、不发信号、不聚焦、不抛错 | 界面无变化（不出现空载荷的追问） |
| 7 | `clarifying === true` 时点追问 | 两个入口 `disabled`；点击零副作用 | 悬停包裹元素见 `等待澄清回答时无法发起追问`；draft 与选择集都不变 |
| 8 | 草稿非空时点追问 | draft 一字不改，只补提示行 | `.notes-ask-notice` = `已加入 N 条摘录，草稿已保留`，2500 ms 后消失 |
| 9 | 发送失败（IPC reject 或 `success:false`） | `failOptimisticUserMessage` 回滚乐观块 + 既有 `.error-block`；选择集与 chip 保留 | 错误块文案为 stub/主进程原文；用户可直接重发，重发仍注入同样条目 |
| 10 | 删除已选笔记失败 | `runMutation` 失败不调 `applyNotes`，清单与选择集都不动 | `.notes-notice.is-error` = `删除失败：<主进程 error 原文>`；计数与 chip 不变 |
| 11 | `notes.json` 损坏 / 版本不支持 / 读取失败 | 面板进错误态（既有）；选择集不清空、`.notes-selection-bar` 不渲染（非 ready） | 既有错误标题 + 重试/逃生口；若此时仍有选择集，chip 仍按派生结果如实显示（载荷与 chip 同源） |
| 12 | 选择集为空 | 不渲染 chip、`<reading_context>` 无 `reader_notes:` 行 | 与 R7 输出逐字节相同 |
| 13 | 发送被早退（draft 空且无附件 / clarifying） | 直接 return，不取快照、不改选择集 | 无变化 |
| 14 | 流式中（steer） | 同一 `send()` 路径，同一快照规则 | `sendCalls` 最近一条 `type === "steer"` 且 message 含 `reader_notes` |
| 15 | 笔记面板折叠 | 选择集保留 | chip 仍在（写明注入条数）；折叠/展开不改变集合 |
| 16 | 跨工作区（goHome / 卸载） | `resetNotes()` 清空选择集与笔记列表 | 新工作区零残留（无 chip、无选中行） |
| 17 | 未打开文档 + 点「追问 / 问 AI」 | 两个入口均 `disabled`（§1.4 三态，`documentOpen === false`）；点击零副作用：不改 draft、不改选择集、不聚焦、不出现提示行 | 悬停包裹元素见 `请先打开文档，摘录才会随提问注入`；draft 与选择集都不变（不再出现「填了模板但摘录不会注入」的静默空转） |

---

## 5. must-fix 处理表

| # | must-fix（评审原文要点） | 落法（可判定） | 本档落点 |
| --- | --- | --- | --- |
| 1 | N45-2/6：chip 可见性判据与注入条件不等价 | 写死 `readingContextWillSend = documentChip !== null && "document" ∉ excluded`，`notesChip` 以它为前提 ⇒ 可见 ⇔ 本次会输出 `<reading_context>`；补「未打开文档」离屏判别场景 `42d`（选 2 条 + 无文档 ⇒ 无 notes chip，payload 无 `reading_context`） | §1.3、§4 第 1/2 行、§6.3 场景 42/42c/42d |
| 2 | §0.3 情形 7「非 ready 清空」不可构造、N43-9 恒真 | 删掉该半句（只保留「与最新清单求交」）；「非 ready 不清空」写死进生命周期表；`status !== "ready"` 的唯一可见后果是 bar 不渲染（§2.0 已冻结）；不做 stub 原语、不新增死代码 | §0 修订 1、§2 情形 7、§8 第 1 条 |
| 3 | N44-2 与 N44-8/N43-1 矛盾（谁写选择集） | 替换收进 store 单一动作 `replaceSelectionWith(id): boolean`；id 不在 `notes.value` 即 no-op、不发信号、不聚焦、不抛错；seam 只传无参触发信号，签名冻结为 `registerNotesAskConsumer(handler: NotesAskHandler \| null)` / `emitNotesAsk()`，ChatPanel 侧仅一个 `onNotesAsk` | §1.1 写动作 2、§1.4、§4 第 6 行 |
| 4 | §2.0/N43-7 未冻结 `.note-select` 载体与 `disabled` 落点 | 冻结为**原生** `<input type="checkbox" class="note-select">`（同 `.note-delete` 范式）⇒ `disabled` 落在本体；标题落在 `.note-select-wrap`；`.notes-ask-btn` 不牵涉 Vuetify 控件（原生 `<button>`） | §1.5、§6.3 场景 40c |
| 5 | `.note-ask` 未要求 `@click.stop` | 写死「行内新增控件的**点击落点唯一**（§1.5 三态 3）：`.note-select-wrap` 承担 toggle 且带 `.stop`，`.note-ask` 本体承担 `:disabled` 与 `@click.stop`」；离屏判别：在**另一篇文档**的笔记行上点 `.note-ask`，断言中间 pill 文本仍是 `sample-paper.pdf`、页码仍是 `第 1 / 3 页`（若事件穿透会跳转/换文档） | §1.5 布局与三态、§6.3 场景 41 |
| 6 | N49 缓存失效判据无可判定证据、两个选项互斥 | 写死「数组引用变 **或** 长度变 ⇒ 整表重建」，并列出全部块列表变更点逐一核对（§3.1 覆盖表）；**删掉**「模板传索引」方案（与「函数签名零改动」互斥）；判别证据：`grep findIndex` 0 命中 + 场景 46 的「第 2 页一轮 / 第 3 页一轮 / 回滚后重发」三段 | §3.1（含覆盖表）、§6.3 场景 46、§6.4 no.4/no.5 |

---

## 6. 验证方案

### 6.1 命令

```bash
# 1) 唯一工程门（改前基线已实测 0 error）
cd pix && npm run check

# 2) 离屏取证
cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
# 期望：退出码 0 + MANIFEST.json.failure === null + 截图数 >= 改前（新增 16 张）+ 五个断言组全绿

# 3) 纯函数烟测（仓库外临时目录，跑完删除；已实测 exit 0）
cd pix
PIX_DIR="$(pwd -W)"
mkdir -p "$TMP/pix-r8-ctx"
cat > "$TMP/pix-r8-ctx/tsconfig.json" <<JSON
{
  "compilerOptions": {
    "outDir": "./out",
    "module": "commonjs",
    "target": "es2022",
    "moduleResolution": "node",
    "skipLibCheck": true,
    "strict": true,
    "baseUrl": "$PIX_DIR",
    "paths": { "@shared/*": ["src/shared/*"] }
  },
  "files": [
    "$PIX_DIR/src/renderer/types/ipc.ts",
    "$PIX_DIR/src/renderer/utils/reading-context.ts",
    "$PIX_DIR/src/renderer/utils/notes-path.ts"
  ]
}
JSON
./node_modules/.bin/tsc -p "$TMP/pix-r8-ctx/tsconfig.json"
# 再跑断言脚本：脚本写在 "$TMP/pix-r8-ctx/assert.cjs"，先 cd "$TMP/pix-r8-ctx" 再用相对路径
# require("./out/renderer/utils/…")；跑完删除整个 "$TMP/pix-r8-ctx"（type-only import 无运行时依赖）
```

> 三条实测约束（must-fix 8）：① `paths` 只能写在 tsconfig.json 里 —— 命令行 `--paths` 在 TypeScript 5.8.3 直接报 `error TS6064`；② `files` 必须含 `src/renderer/types/ipc.ts`（它用 `declare global` 补 `window.pixApi`），否则独立编译 `reading-context.ts` 报 `error TS2339: Property 'pixApi' does not exist`；③ tsconfig 在仓库外，`baseUrl` 用 `pwd -W` 取 Windows 形绝对路径（`paths` 相对 baseUrl 解析），断言脚本必须 `cd` 进 `$TMP/pix-r8-ctx` 再用**相对** require（MSYS 形 `/tmp/...` 不能被 Windows node 解析）。

### 6.2 纯函数烟测用例（输入 → 期望输出，逐条断言）

样本常量（脚本内冻结）：`P = "C:/lib/sample-paper.pdf"`、`A = { id:"a1", kind:"excerpt", docPath:"archive/older-paper.pdf", page:7, text:"Section 4. Reproducibility: all runs use three seeds and report the median.", comment:"", createdAt:1, updatedAt:1 }`、`B = { id:"b1", kind:"excerpt", docPath:"sample-paper.pdf", page:1, text:"We study retrieval over long documents where the attention budget is the binding constraint.", comment:"与第 3 节消融实验对照", createdAt:2, updatedAt:2 }`。

| # | 输入 | 期望输出 |
| --- | --- | --- |
| 1 | `buildReadingUserMessage("请对比这两处的结论。", { filePath:P, page:2, pageCount:3, selectedText:"which confirms the mask is doing more than sparsification.", notes:[A,B] })` | 逐字等于 §1.2 的真实示例（同一 `lines.join("\n")` 构造；**无结尾换行**；顺序 `A` 在前 = 冻结排序结果） |
| 2 | 同上但 `notes: []`、`selectedText: "which confirms …"` | 与 R7 逐字节相同（`<reading_context>` 四/五行 + 空行 + 用户输入，无 `reader_notes:`） |
| 3 | 同上但 `notes: []`、`selectedText: ""` | 与 R7 逐字节相同（无 `selectedText:` 行、无 `reader_notes:` 行） |
| 4 | `selectNotesForContext([B, A])`（入参顺序与注入顺序相反） | `injected` 顺序 = `[A, B]`（`docPathKey` 升序）；连续调用两次结果逐字相同（确定性） |
| 5 | 三条同文档笔记：`page` 相同、`createdAt` 相同、`id` 分别为 `z`/`a` | 顺序按 `id` 升序（第 4 级比较键生效） |
| 6 | 注释归一化：`comment: "第一行\n\n第二行  "` | 条目出现 `   comment: 第一行 第二行`（连续空白折叠为单个半角空格 + 去首尾） |
| 7 | `comment: ""` / `comment: "   "` | 无 `comment:` 行（不写空占位） |
| 8 | `text: "  a\n b "`（直接构造脏数据） | 条目 `text: a b`（读侧不变量不依赖） |
| 9 | 边界 8000：单条笔记，`text.length = 8000 - skeleton`（`skeleton` 由一次标定调用测出：`entries[0].length - text.length`） | `entries.join("\n").length === 8000` ⇒ `injected.length === 1`、`dropped.length === 0` |
| 10 | 同构造但长度 8001 | `dropped.length === 1`、`injected.length === 0`、无 `reader_notes:` 行；装入部分（若有）仍 ≤ 8000 |
| 11 | 三条：第 1 条可装入、第 2 条超限、第 3 条可装入（顺序装入） | 第 2 条被丢弃但**继续尝试**第 3 条 ⇒ `injected.length === 2`、`dropped.length === 1`；每个装入条目的 `text`/`comment` 与入参归一化值逐字相等（无 `slice` 产物） |
| 12 | 单条自身 > 8000 | `injected 0 / dropped 1`；`injected.length + dropped.length === notes.length`（chip 侧文案同源 ⇒ `M === N`） |
| 13 | 11 条短笔记（防御式条数上限） | `injected.length === 10`、`dropped.length === 1` |
| 14 | 条目块洁净性：`message.slice(message.indexOf("reader_notes:"))` | 不含 `\`（反斜杠）、不含 `C:`/资料库根、不含 `id` 值、不含 `createdAt`/`updatedAt`；`path:` 行的绝对路径不受该断言约束 |
| 15 | 非 PDF：`filePath: "C:/lib/reading-notes.md"`、`page: 1`、`pageCount: 0`、`notes: [A]` | `page: 1` 行照旧；`reader_notes` 段与 PDF 情形完全一致；`doc:` 取 `A.docPath`（与当前文档无关） |

### 6.3 离屏场景与断言（`pix/scripts/ui-shot.mjs`）

**前置（写死，所有 40–46 共用）**

1. **挂载位置**：全部追加在 `runReaderStateScenarios` 函数**末尾**（R7 场景 36 之后）。`record` / `textOf` / `countOf` / `has` / `goHome` / `enterWorkspace` / `waitTreeRows` / `openRow` / `clickNext` / `waitPage` / **`selectPageSpan`**（作用域内既有的 PDF 选区构造原语：真 `Range` + `selectionchange` + 等浮层）/ `clearStateA` / `emit` / `typeAndSend` / `userBlocks` / `notesHash` 只在该函数作用域内，另起一套会引入第二份口径。
2. **共用入口序列** `enterCleanWorkspace(seed)`：`setMessages([])` → `setSendFailure(null)` → `setNotesAddFailure(null)` → `setNotesDeleteFailure(null)` → `goHome()`（安全点：flush 先于 stopSession）→ `clearStateA()` → `enterWorkspace(LIBRARY_NAME)` → `waitTreeRows(4)` → `seedNotes(seed)` → `click(tabNotes)` → `waitFor(".note-row" 数量 === seed.length)`。`clearStateA()` 保证「树行打开 ⇒ 第 1 页」。
3. **资源顺序**：36 末段已 `rmSync(archive/older-paper.pdf)` ⇒ 40–46 **一律不打开该文件**（打开会落到 ReaderPanel 读取失败态）；只允许通过 `seedNotes` 让它出现在笔记清单里（场景 43 的跨文档条目）。
4. **不新增刷新入口**：数据准备一律「`seedNotes` 写穿 + 切标签触发 `loadNotes`」（回到 library 会按情形 4 清空选择集，故每个场景**先切标签再选**）。
5. **场景种子字面量冻结**：`capSeed()` = 12 条 `{ id:"cap-" + i, kind:"excerpt", docPath:"sample-paper.pdf", page:i (1..12), text:"容量样本 " + i, comment:"", createdAt: now - (13 - i) * MINUTE }`（同文档 + page 唯一升序 ⇒ 面板顺序 = 行 1..12，第 11 条恒为 `容量样本 11`，用 `.note-text` 文本定位，不依赖索引）；`overflowSeed()` = 3 条 `{ id:"big-" + i, kind:"excerpt", docPath:"sample-paper.pdf", page:i, text:"摘".repeat(3000), comment:"", createdAt: now - (4 - i) * MINUTE }`（骨架 ≈61 字符/条 ⇒ 2 条 6123 ≤ 8000、3 条 9185 > 8000 ⇒ 恰好丢 1 条）；标准种子 = 既有 `seedNotes()`（4 条）。每次 `capSeed`/`overflowSeed` 之后必须恢复标准种子并断言 `.note-row` 数量回到 4。
6. **事件序列**：沿用 R7 收尾约定（`message_start user` → `agent_start` → `message_start/update assistant` → `message_end assistant` → `agent_end`），否则 `isStreaming` 不复位、`.composer-send` 不再渲染。`isStreaming` 期间的发送只能用 `sendViaEnter`。
7. **不落盘断言落组**：N43 验收 11 的「选择/清空/追问不写盘」并入 `notes-select` 组（判据 = `notesAddCalls().count` 与 `readFileSync(NOTES_FILE)` 的 sha256 两者相对基线都不变）。
8. **焦点测量取法（冻结）**：`activeHasInputArea` = `document.activeElement` 恰为 `.input-area` 本体（`el === document.querySelector(".input-area")`）；`document.hasFocus()` 一并记入测量但**不参与判定**（离屏窗口 `show: false`，窗口焦点不可依赖）。

| 场景（截图） | 驱动序列 | 断言（`MEASUREMENTS` label → 判据） |
| --- | --- | --- |
| **40（`40-notes-select-bar.png`）** | `enterCleanWorkspace(seedNotes())`（**不打开文档**）→ 记基线（`notesAddCalls`、`notesHash`）→ 点第 1 行 `.note-select` **本体** → 读计数与勾选态 → 点第 2 行的 `.note-select-wrap` | `notes-select`：`{phase:"bar", nativeCheck:{countText:"已选 1 条", checked:true}, countText:"已选 2 条", askText:"问 AI", clearText:"清空", selectedRows:2, chipCount:0, hasNotesChip:false, barInHeader:true, barAfterFilter:true, noWrite:{addCallsSame:true, hashSame:true}}`（`nativeCheck` = must-fix 3 的判别：点复选框本体必须恰好切换一次，`已选 0 条`/`已选 2 条` 都失败；`barAfterFilter` 用 `.notes-filter` 与 `.notes-selection-bar` 的 `compareDocumentPosition` 判「后者在前者之后」；无文档 ⇒ 无 notes chip） |
| **40b（`40b-notes-select-clear.png`）** | 承接 40 → 点 `.notes-selection-clear` | `notes-select`：`{phase:"cleared", barCount:0, selectedRows:0, notesChipCount:0, noWrite:{addCallsSame:true, hashSame:true}}` |
| **40c（`40c-notes-select-cap.png`）** | `enterCleanWorkspace(capSeed())` → 点第 1..10 行的 `.note-select-wrap` → 记 `.notes-selection-count` → 定位 `容量样本 11` 行读控件 → 点它的 `.note-select-wrap` → 读计数 → 取消勾选任一条 → 再读第 11 行 → （末段）`seedNotes(seedNotes())` + 切标签切回 + 断言行数 | `notes-select`：`{phase:"cap", countText:"已选 10 条", selectedRows:10, row11:{disabled:true, wrapTitle:"最多可注入 10 条笔记，请先取消其它选择"}, afterCapClick:"已选 10 条", afterUncheck:{disabled:false, wrapTitle:null}, restoredRows:4}` |
| **41（`41-note-ask.png`）** | `enterCleanWorkspace(seedNotes())` → 树行开 `sample-paper.pdf` → `waitPage(1,3)` → 切笔记标签 → `setDraft("")` → 点 `n-other-1` 行（`.note-text` 以 `Section 4. Reproducibility` 开头）的 `.note-ask` | `note-ask`：`{phase:"template", value:"请结合我选中的摘录回答：", activeHasInputArea:true, chip:"摘录 1 条", pillLabel:"sample-paper.pdf", pageLabel:"第 1 / 3 页"}`（后两项 = must-fix 5 的「点追问不跳回原文」判别：该行的 `docPath` 是另一篇文档，事件若穿透会换文档） |
| **41b（`41b-note-ask-keep-draft.png`）** | 承接 41（已选 `n-other-1`）→ `setDraft("我的草稿")` → 再选第 1 行（`n-current-1`）⇒ `已选 2 条` → 点第 3 行（`.note-text` 以 `结论：稀疏注意力` 开头的 `n-current-3`）的 `.note-ask` → 读输入框、计数、chip 与 `.notes-ask-notice` → 等 2600 ms 再读 | `note-ask`：`{phase:"keep-draft", value:"我的草稿", countText:"已选 1 条", chip:"摘录 1 条", noticeText:"已加入 1 条摘录，草稿已保留", noticeGone:true}`（`countText`/`chip`/`noticeText` 三条合起来是 must-fix 4 的「替换、不追加」判别：若实现成追加会是 `已选 3 条`/`摘录 3 条`/`已加入 3 条摘录`） |
| **41c（`41c-note-ask-clarifying.png`）**〔本档新增，§0.4 冻结论据〕 | 承接 41b（已选 1 条）→ 点 `.notes-selection-clear` → 再选 2 条 → `setDraft("我的草稿")` → `emitUserInputRequest({ id:"clarify-1", questions:[{ id:"q1", header:"澄清", question:"请选择方向" }] })` → 读两个入口 → 点 `.note-ask` → 读 draft 与计数 → `emitUserInputRequest(null)` | `note-ask`：`{phase:"clarifying", noteAsk:{disabled:true, wrapTitle:"等待澄清回答时无法发起追问"}, barAsk:{disabled:true, wrapTitle:"等待澄清回答时无法发起追问"}, clearDisabled:false, afterClick:{value:"我的草稿", countText:"已选 2 条"}, reenabled:{noteAskDisabled:false}}` |
| **41d（`41d-note-ask-bar.png`）**〔本档新增，must-fix 5 判别〕 | 承接 41c（已选 2 条、文档已打开、`clarifying` 已复位）→ `setDraft("")` → 点 `.notes-ask-btn` | `note-ask`：`{phase:"bar-ask", value:"请结合我选中的摘录回答：", activeHasInputArea:true, countText:"已选 2 条", chip:"摘录 2 条"}`（选择条入口「原样使用当前选择集」的唯一证据：既不替换成 1 条，也不清空） |
| **42（`42-notes-chip.png`）** | `enterCleanWorkspace(seedNotes())` → 开 `sample-paper.pdf` → `waitPage(1,3)` → 切笔记标签 → 选 2 条 | `notes-chip`：`{phase:"basic", labels:["当前文档：sample-paper.pdf · 第 1 页","摘录 2 条"], notesChipTitle:"本次注入 2 条笔记", removeTitle:"本次发送不使用"}` |
| **42b（`42b-notes-chip-overflow.png`）** | `enterCleanWorkspace(overflowSeed())` → 开 `sample-paper.pdf` → 切笔记标签 → 选 3 条 | `notes-chip`：`{phase:"overflow", label:"摘录 3 条 · 超出上限未注入 1 条", title:"本次注入 2 条笔记；1 条因超过 8000 字符上限未注入"}`（`title` 用逐字相等判，不用 `includes`） |
| **42c（`42c-notes-chip-removed.png`）** | 承接 42 → 点 notes chip 的 `.context-chip-remove` → `typeAndSend(T42)` → 读 `sendCalls` → 等 chip 恢复 → 再点「当前文档」chip 的 `.context-chip-remove` → 读 chip 行 → `typeAndSend(T42B)` → 末段点 `.notes-selection-clear` → `typeAndSend(T42C)` | `notes-chip`：`{phase:"removed", chips:["当前文档：sample-paper.pdf · 第 1 页"], payload:{hasReadingContext:true, hasReaderNotes:false, displayText:T42}}`、`{phase:"restored", chip:"摘录 2 条"}`、`{phase:"doc-cascade", hasNotesChip:false, chipCount:0, payload:{hasReadingContext:false, hasReaderNotes:false}}`；`notes-context`：`{phase:"r7-regression", lines:{"<reading_context>":true,"page: 1":true,"pageCount: 3":true,"</reading_context>":true,"pathSuffix":"sample-paper.pdf","selectedTextLine":false}, hasReaderNotes:false, displayText:T42C}`（无选区时四行；`path:` 行以绝对路径结尾于 `sample-paper.pdf`；不出现 `selectedText:` 行 —— 与 R7 同形） |
| **42d（`42d-notes-chip-no-doc.png`）**〔本档新增，must-fix 1 / 6 判别〕 | `enterCleanWorkspace(seedNotes())`（**不打开任何文档**）→ 选 2 条 → `setDraft("")` → 读两个追问入口（`.notes-ask-btn` 与任一行的 `.note-ask`）→ 点 `.notes-ask-btn` → 读 draft、计数与 `.notes-ask-notice` → 读 chip 行 → `typeAndSend(T42D)` | `note-ask`：`{phase:"no-doc", barAsk:{disabled:true, wrapTitle:"请先打开文档，摘录才会随提问注入"}, rowAsk:{disabled:true, wrapTitle:"请先打开文档，摘录才会随提问注入"}, afterClick:{value:"", countText:"已选 2 条", hasNotice:false}}`；`notes-chip`：`{phase:"no-doc", chipCount:0, hasNotesChip:false}`；`notes-context`：`{phase:"no-doc", message:T42D, hasReadingContext:false, hasReaderNotes:false}`（chip 不为「摘录 2 条」撒谎；两个入口给的是禁用 + title 的可见反馈，不是静默空转） |
| **43（`43-notes-context-payload.png`）** | `enterCleanWorkspace(seedNotes())` → 开 `sample-paper.pdf` → `waitPage(1,3)` → `clickNext` → `waitPage(2,3)` → **`selectPageSpan(2)`**（构造真实 PDF 选区：合成 click 不产生 mousedown，选区不会被后续点击清掉）→ 切笔记标签 → 选 `n-current-1` 与 `n-other-1` → `typeAndSend(ASK)` → 读 `sendCalls` → `clearSendCalls()`（隔离 prompt 与 steer 两份证据）→ `emit(agent_start)` → `sendViaEnter(ASK_STEER)` → 读 `sendCalls` → `emit(agent_end)` | `notes-context`：prompt 阶段逐行 `includes`：`"<reading_context>"`、`"page: 2"`、`"selectedText:"`、`"reader_notes:"`、`"1. doc: archive/older-paper.pdf"`、`"   page: 7"`、`"   kind: excerpt"`、`"   text: Section 4. Reproducibility: all runs use three seeds and report the median."`、`"2. doc: sample-paper.pdf"`、`"   page: 1"`、`"   text: We study retrieval over long documents where the attention budget is the binding constraint."`、`"   comment: 与第 3 节消融实验对照"`；顺序判据 `indexOf("1. doc: archive") < indexOf("2. doc: sample")`；`entryBlockNoBackslash:true`、`entryBlockNoIds:true`（切片 `reader_notes:` 之后）；`displayText === ASK`、`message.endsWith("\n\n" + ASK)`；steer 阶段 `{type:"steer", hasReaderNotes:true}` |
| **44（`44-notes-select-delete.png`）** | `enterCleanWorkspace(seedNotes())` → 开 `sample-paper.pdf` → `waitPage(1,3)` → 切笔记标签 → 选 `n-current-1` 与 `n-current-2` → 定位 `n-current-2` 行 → 点 `.note-delete` 两次（二次确认）→ 读计数/chip/行数 → `typeAndSend(ASK44)` → 读 `sendCalls` | `notes-select`：`{phase:"delete-converge", countText:"已选 1 条", selectedRows:1, chip:"摘录 1 条", rows:3}`；`notes-context`：`{phase:"delete-converge", hasReaderNotes:true, notesCount:1, excludesDeleted:true}`（message 不含 `Table 2 reports`） |
| **44b（`44b-notes-select-delete-failure.png`）**〔本档新增，§4 第 10 行〕 | 承接 44（已选 1 条）→ 记 `notesHash` → `setNotesDeleteFailure("write-failed")` → 点 `.note-delete` 两次 → 读通知/计数/chip/行数/哈希 → `setNotesDeleteFailure(null)` | `notes-select`：`{phase:"delete-failure", notice:"删除失败：笔记写入失败", countText:"已选 1 条", chip:"摘录 1 条", rows:3, hashSame:true}` |
| **45（`45-notes-select-send-failure.png`）** | 承接 44b（已选 1 条）→ 再选 1 条（⇒ `已选 2 条`）→ 记 `userBlocks()` 基线 → `setSendFailure("throw")` → `typeAndSend(ASK45)` → 读错误块/计数/chip/行数 → `setSendFailure("fail")` → `typeAndSend(ASK45B)` → 读错误块 → `setSendFailure(null)` → `typeAndSend(ASK45C)` → 读 `sendCalls` | `notes-context`：`{phase:"send-failure", errorText:"stub 发送注入异常", userBlocksRolledBack:true, countText:"已选 2 条", chip:"摘录 2 条"}`、`{phase:"send-reject", errorText:"stub 发送被拒绝", chip:"摘录 2 条"}`、`{phase:"resend", hasReaderNotes:true, notesCount:2, type:"prompt"}` |
| **46（`46-anchor-cache.png`）** | `enterCleanWorkspace(seedNotes())` → 开 `sample-paper.pdf` → `waitPage(1,3)` → `clickNext` → `waitPage(2,3)` → `typeAndSend(T46A)` + `runTurn(T46A, "第 2 页回答")` → `clickNext` → `waitPage(3,3)` → `typeAndSend(T46B)` + `runTurn(T46B, "第 3 页回答")` → `setSendFailure("throw")` → `typeAndSend(T46C)` → 读错误块 → `setSendFailure(null)` → `typeAndSend(T46D)` + `runTurn(T46D, "回滚后回答")` | `anchor-cache`：`(a)` 既有 30 场景全绿（不新增断言）；`(b)` `{phase:"two-turns", titles:[<末尾第 2 个>, <末尾第 1 个>]}` ⇒ 分别含 `第 2 页` / `第 3 页`，且两者都**不含** `（按当前阅读位置）`（若缓存不随 `push` 长度变而重建，`readingAnchorFor(新块 id)` 会返回 null ⇒ 标题出现回退后缀 ⇒ 直接失败）；`(c)` `{phase:"rollback", errorText:"stub 发送注入异常", lastTitle: 含 第 3 页 且不含 （按当前阅读位置）}`（若缓存不随 `filter` 引用变而重建，回滚后的位移会让新回答块解析到上一轮锚点/空档 ⇒ 失败） |

**断言组命名（N50 验收 4 冻结五个，全部用脚本内 `throw` 落地）**：`notes-select`、`note-ask`、`notes-chip`、`notes-context`、`anchor-cache`。新增场景 `41c`/`41d`/`42d`/`44b`（共 16 场景）与新增 stub 原语 `emitUserInputRequest`/`setNotesDeleteFailure` 是**判别证据的必要条件**（§0.4 的禁用文案与选择条入口、must-fix 1/6 的无文档态、§4 第 10 行的删除失败），截图数只增不减；`sendCalls`/`clearSendCalls`/`setSendFailure` 按 N50 验收 1 冻结实现（`clearSendCalls` 在场景 43 隔离 prompt 与 steer 两份证据）。

### 6.4 代码级核对点（只读命令）

| # | 判定 | 命令 | 期望 |
| --- | --- | --- | --- |
| 1 | `reader_notes` 唯一实现点 | `grep -rn "reader_notes" pix/src/renderer` | 只命中 `utils/reading-context.ts`（ChatPanel 内 0 命中） |
| 2 | 上限数值单点定义（must-fix 7 修正计数） | `grep -rn "MAX_CONTEXT_NOTES\b" pix/src/renderer`、`grep -rn "MAX_CONTEXT_NOTES_CHARS\b" pix/src/renderer`、`grep -rn "8000" pix/src/renderer` | 前者 6 行 / 3 文件：`reading-context.ts` 2（定义 + 装填 `slice`）、`notes-store.ts` 2（import + `selectionFull` 守卫）、`NotesPanel.vue` 2（import + `SELECT_CAP_TITLE` 插值）；中者 4 行 / 2 文件：`reading-context.ts` 2（定义 + 装填比较）、`ChatPanel.vue` 2（import + chip `title` 文案插值）；后者只命中 `reading-context.ts` 的定义行（`\b` 是词界，不会把 `_CHARS` 一起命中） |
| 3 | 选择集写权唯一 | `grep -rn "selectedNoteIds" pix/src/renderer` | 只命中 `stores/notes-store.ts`（ChatPanel / NotesPanel 0 命中） |
| 4 | 无 `findIndex` | `grep -n "findIndex" pix/src/renderer/stores/session-store.ts` | 0 命中；`readingAnchorFor` 的 `sed -n '/function readingAnchorFor/,/^  }$/p'` 区间内无 `findIndex` |
| 5 | 块列表无就地中段变更 | `grep -n "displayBlocks.value.splice\|displayBlocks.value.shift\|displayBlocks.value.unshift\|displayBlocks.value.sort\|displayBlocks.value.reverse" pix/src/renderer/stores/session-store.ts` | 0 命中 |
| 6 | 缓存判据形态 | `grep -n "blockIndexOf\|byId.size !== blocks.length" pix/src/renderer/stores/session-store.ts` | 两处均命中；`has()` 首现优先写入 |
| 7 | 快照单点 | `sed -n '/^async function send(/,/^}$/p' pix/src/renderer/components/workspace/ChatPanel.vue` 上跑 3 条：`grep -c "notesStore.selectedNotes"`、`grep -c "notes: "`、`grep -c "buildReadingUserMessage("` | 分别为 `1`、`1`（`notes:` 实参一处）、`1`；区间内不出现 `clearNoteSelection`（N48-7） |
| 8 | 草稿规则 | `sed -n '/function onNotesAsk/,/^}$/p' pix/src/renderer/components/workspace/ChatPanel.vue` 上跑 `grep -c "draft.value = "` | `1`（且在空草稿分支内）；区间内无 `notesStore.selectedNotes`、无选择集写入 |
| 9 | 追问 seam 成对（must-fix 7 修正计数；修复轮按实际口径回改 import 行） | `grep -rn "registerNotesAskConsumer\|emitNotesAsk" pix/src/renderer` | `composables/useQuickAsk.ts` 2 行（两个 `export function` 定义行）、`ChatPanel.vue` 3 行（顶层 import 1 + onMounted 注册 1 + onUnmounted 置 null 1；`emitNotesAsk` 0 命中）、`NotesPanel.vue` 3 行（顶层 import 1 + `onAskNote` 内触发 1 + 选择条模板 `@click="emitNotesAsk()"` 1，按 §1.4「模板内直接调用」的必然结果）；全仓库仅 1 个 seam 文件 |
| 10 | 替换动作唯一入口 | `grep -rn "replaceSelectionWith" pix/src/renderer` | `notes-store.ts` 定义 1 处 + `NotesPanel.vue` 调用 1 处（ChatPanel 0 命中） |
| 11 | 行内控件点击落点唯一（must-fix 3） | `grep -n "note-select-wrap\|note-ask-wrap\|class=\"note-ask\"\|class=\"note-select\"" pix/src/renderer/components/workspace/NotesPanel.vue` | `toggleNoteSelected` 2 命中（`.note-select-wrap` 的 `@click.stop` 1 + 定义 1）、`onAskNote` 2 命中（`.note-ask` 的 `@click.stop` 1 + 定义 1）；`.note-select` 标签行 **0 处 `@click`**（只挂 `:checked`/`:disabled`）；`.note-ask` 本体带 `:disabled`，`.note-ask-wrap` 只带 `:title` |
| 12 | 主进程面零改动 | `git diff --stat pix/src/main pix/src/shared/types.ts` | 空（含 `reading-prompt.ts`）；`grep -c 'ipcMain.handle("notes' pix/src/main/ipc-handlers.ts` 仍为 `6` |
| 13 | 无 any / 无内联动态导入 | `grep -rn ": any\|as any\|await import(\|import(" pix/src/renderer/utils/reading-context.ts pix/src/renderer/utils/notes-path.ts pix/src/renderer/stores/notes-store.ts pix/src/renderer/stores/session-store.ts pix/src/renderer/components/workspace/{ChatPanel,NotesPanel}.vue pix/src/renderer/composables/useQuickAsk.ts` | 0 命中（`ReaderNote` 走顶层 `import type`） |
| 14 | 越界与红线 | `git diff --stat` | 只含 §3 白名单 9 个文件 + 本设计档；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置 0 改动 |
| 15 | 面板既有语义零改动 | `git diff pix/src/renderer/components/workspace/NotesPanel.vue` | 不含 `groupNotesByDocument` / `countLabel` / `startDeleteConfirm` / `onDocumentPointerDown` / 备注与展开逻辑的改动；`.note-head` 内部四元素顺序与类名未动 |
| 16 | 选择集不落盘 | `grep -rn "notesAdd\|notesUpdate\|notesDelete\|readerStateSave" pix/src/renderer/stores/notes-store.ts` | 只在既有动作内（选择集动作不调用任何 `bridge()`） |
| 17 | 锚点动作视图单点解析（N49-4；修复轮按语义口径回改「0 命中」） | `grep -n "readingAnchorFor(\|answerSaveTitle(\|answerSaveDisabled(" pix/src/renderer/components/workspace/ChatPanel.vue` | `readingAnchorFor(` **恰 1 命中**（`answerActionViews` 内的唯一调用点 —— 「0 命中」与 §3.2/§7 的「每帧每块一次解析」不可并存，已据此回改：模板 0 处直接解析）；`answerSaveTitle(` / `answerSaveDisabled(` 各 2 命中（模板 1 + 定义 1，实参取自同一 computed） |

---

## 7. 开发分工（白名单，两侧文件不得重叠）

**A 面（数据与注入面）**
- `pix/src/renderer/utils/notes-path.ts`
- `pix/src/renderer/utils/reading-context.ts`
- `pix/src/renderer/stores/notes-store.ts`
- `pix/src/renderer/stores/session-store.ts`

交付定义：§1.1 / §1.2 全部契约按字面落地（含装填算法、归一化、上限常量的单点定义与注释）；§3.1 覆盖表逐条成立（`grep` 0 命中 + 引用计数）；§6.2 烟测 15 组全绿；`npm run check` 0 error。A 面**不碰任何 `.vue`、不碰 `ui-shot.mjs`**。

**B 面（UI 与取证面）**
- `pix/src/renderer/composables/useQuickAsk.ts`
- `pix/src/renderer/components/workspace/NotesPanel.vue`
- `pix/src/renderer/components/workspace/ChatPanel.vue`
- `pix/src/renderer/pages/WorkspacePage.vue`
- `pix/scripts/ui-shot.mjs`

交付定义：§1.3 / §1.4 / §1.5 全部机制与文案落地（含 chip 可见性级联、草稿保护、两个追问入口的三态禁用与 title 落点、`.note-select` 原生控件与点击落点唯一、`.note-body` 布局冻结）；§1.6 stub 五个增量与 §6.3 的 16 场景、5 断言组自测通过（脚本内 `throw`、退出码 0、`MANIFEST.failure === null`、`headOverflow` 与既有 00–11/20–24/30–36 全绿）；`npm run check` 0 error。B 面**不碰 `utils/**` 与 `stores/**`**。

**交接约定（唯一接口面）**
1. A 先合入：`selectNotesForContext` / `NotesContextSelection` / `sortNotesForContext` / 两个上限常量 / `ReadingSendContext.notes` / store 的四个动作与三个派生（名字以本档为准）。B 的编译前置是 A 的类型面与 store 导出名。
2. B 只用 A 导出的名字与 §1 的常量，**不得**在组件内重复实现排序、裁剪、长度比较或上限数值；A **不得**改 `.vue` 与脚本。
3. N49 跨两侧：A 负责 `session-store.ts` 的索引缓存与失效判据，B 负责 `ChatPanel` 的每帧一次解析 + `ui-shot` 的 `anchor-cache` 断言；交界 = `readingAnchorFor(blockId): ReadingAnchor | null`（签名与返回类型零改动）。
4. `ui-shot.mjs` 的 stub 语义由 B 按 §1.6 实现（只需覆盖可判定子集：真写穿、`sendCalls` 记录、三种失败注入、事件投递、`emitUserInputRequest`）。

**开发档自评清单（两侧共同）**
1. §6.2 烟测 15 组逐条结果（含 8000/8001 边界与「继续尝试后续条目」的中间丢弃用例）；烟测编译按 §6.1 的三条实测约束执行（`-p` + `files` 含 `types/ipc.ts` + `cd $TMP` 后相对 require）。
2. `grep findIndex` 0 命中、块列表无就地中段变更（§6.4 no.4/no.5）与 §3.1 覆盖表逐行的实际判定。
3. 40–46 的场景顺序耦合声明：`40c`/`42b` 之后必须恢复标准种子（带行数断言）；`41`→`41b`→`41c`→`41d` 是一条状态链（选择集与 draft 逐段承接，中间段不得单独重跑）；`44b` 之后的选择集与哈希基线；`45` 依赖 `44b` 的结束态。
4. 已知差异与诚实标注：stub 的 `notesDelete` 不写 tmp+rename（原子性由主进程既有实现保证，本轮不改主进程）；`emitUserInputRequest` 是**新增取证原语**（需求 N50 冻结列表里没有它）；本轮**未实测**大列表（数千块）帧率，N49 只给出复杂度与失效判据。
5. 若 32 段 `headOverflow` 或几何采样（`list-current-doc-filter-off`）出现回归，先检查 `.note-body` 的 `min-width: 0` 与 `.note-select-wrap` 的宽度，**不得**改 `.note-head` 内部结构。
6. 次级项落地核对：`titleOfLastAnswer` 已泛化为 `answerTitleFromEnd(n)`（无第二份写法）；N49 的「每帧每块至多解析一次」按 §6.4 no.17 核对；`kind: answer` 的归一化后果按 §1.2 声明执行（不加过滤）；场景 43 在 steer 相位前显式调用 `clearSendCalls()`。

---

## 8. 需求回退建议（本档已按建议口径落地）

1. **§0.3 情形 7 的「`status !== "ready"` 时清空」不可构造**（§0 修订 1）⇒ 建议需求档删掉这半句，只保留「与最新清单求交（派生）」；N43 验收 9 的判别力改由「非 ready 时 bar 不渲染 + 选择集不清空（chip 与载荷同源）」承担。若不接受，就需要在产品内新增一个「在册重载」入口（新增死代码）——本档不建议。
2. **N45 验收 3 的 `title` 字面量少写「笔记」二字**（§0 修订 2）⇒ 建议需求档与 §0.2 对齐为 `本次注入 P 条笔记；M 条因超过 8000 字符上限未注入`。
3. **§0.1 示例的两条笔记顺序与 §0.2 冻结排序相反**（§0 修订 3）⇒ 建议需求档把示例改为 `archive/older-paper.pdf` 在前，避免实现者按示例写出与烟测/离屏断言冲突的顺序。
4. **N43 验收 7 的「第 11 条」不是稳定坐标**：本档在 §6.3 前置 no.5 冻结了 `cap-1..cap-12` 的 `docPath`/`page`/`createdAt` 与 `容量样本 11` 的文本定位；建议需求档一并写死，否则断言不可复现。
5. **N44 验收 9 引用的「既有 steer 场景」不存在**：`ui-shot.mjs` 全文无 steer 场景，且 `isStreaming` 时 `.composer-send` 被 `.composer-stop` 替换 ⇒ 本档新增 `sendViaEnter` 原语并在场景 43 内取证；建议需求档改为「由 N50 新场景取证」。
6. **`clarifying` 的 off-screen 构造需要新 stub 原语**：`__pixStub.onUserInputRequest` 现为丢弃式 no-op ⇒ 本档新增 `emitUserInputRequest`；建议需求档把「澄清禁用」的判据归到 N50 的 `note-ask` 组（而非仅走查）。
7. **N50 验收 4 的五个断言组之外新增两个判别相位**（`notes-chip.no-doc`、`notes-select.delete-failure`）：前者是 must-fix 1 的必要证据，后者是评审 §3.3 的边角；建议需求档把它们并入对应组名（本档已如此落地，不新增组名）。
8. **无文档时「追问 / 问 AI」的可见反馈要需求档补一条**（设计评审 must-fix 6）：需求 §0.4 只冻结了 `clarifying` 一种禁用原因，而 N44 验收 2 的「chip 随即显示 摘录 1 条」在未打开文档时不可达（chip 不渲染、载荷无 `reader_notes`，点击仅得到静默空转）。本档冻结为「无文档 ⇒ 两入口 `disabled` + 包裹元素 `title` = `请先打开文档，摘录才会随提问注入`」（§1.4），并补了 §4 第 17 行与场景 42d 的断言；建议需求档把这条原因并入 §0.4 的禁用行与 N44 验收 3 的断言清单。

---

## 9. 不变量自查（违反任一即为回归）

1. `buildReadingUserMessage` 的既有字段名与顺序、`excludeContext` / `excludedContexts` 的单次发送语义、`send()` 的「文档 chip 被排除 ⇒ 不发 `<reading_context>`」分支、锚点快照与 `rpc.sendPrompt/sendSteer` 调用形状**零改动**；本轮只新增一个 kind、一个字段、一个段落。
2. 笔记面板既有语义零改动（分组 / 顺序 / 置顶 / 筛选 / 计数 / 删除二次确认 / 加载错误态 / 逃生口 / 备注 / 展开 / AI 徽标）；多选控件与选择条是加法。
3. R7 锚点语义零改动：解析规则与返回类型不变，只有实现复杂度从「每帧每块两次 `findIndex`」变为「一次解析 + O(1) 查表」。
4. 用户资产与主进程面零改动：无新 IPC、无新落盘字段、`notes.json` 全程只读（选择/清空/追问/发送都不写盘）。
5. 上下文注入始终可见、可移除、有上限：任何进入 `<reading_context>` 的笔记内容都必须有对应 chip；无隐式注入、无常开开关、不写进系统提示词（`reading-prompt.ts` 零改动）。

---

## 定稿修订（R8）

> 对象：`docs/pm/R8-review.md`「设计评审（R8）」的 must-fix 8 条与次级项 8 条。**上方正文已按本节口径改齐**（§1.2 / §1.3 / §1.4 / §1.5 契约、§3.2 文件表、§4 失败表、§6.1 命令、§6.2 用例 11、§6.3 前置与场景、§6.4 核对表、§7 分工、§8 回退建议）；本节与正文若有出入，以本节为准（出入只可能来自漏改）。
> 结论：**8 条全部采纳**。must-fix 2 / 6 / 7 是评审给出的两选一处方，取舍理由见本节 §B（无「整条不采纳」项）。

### A. must-fix 8 条逐条处置

| # | 评审要点 | 处置 | 落点 | 判别证据 |
| --- | --- | --- | --- | --- |
| 1 | 场景 40/44 与 §1.3 chip 可见性规则互斥（与 42d 直接矛盾） | 采纳：40 改为断言 chip **不存在**；44 在选笔记前补「开 `sample-paper.pdf` → `waitPage(1,3)`」（与 41/42/43/46 同形） | §6.3 场景 40、44 | 40 的 `chipCount:0` + `hasNotesChip:false`；44 起手带文档 ⇒ 44/44b/45 的 chip 与 `hasReaderNotes:true` 可达 |
| 2 | 场景 43 断言 `selectedText:` 行却无构造 PDF 选区的步骤；前置 no.1 未列 `selectPageSpan` | 采纳：`waitPage(2,3)` 后插入作用域内既有原语 `selectPageSpan(2)`（合成 click 不产生 mousedown ⇒ 选区不被后续点击清掉）；并把 `selectPageSpan` 写进前置 no.1 的 helper 清单 | §6.3 前置 no.1、场景 43 | `selectedText:` 行与 `"page: 2"` 同源可达；选区文本本身不断言 |
| 3 | §1.5 三态 3 与 §6.4 no.11 矛盾：`.note-select` 点击处理不唯一 | 采纳（评审处方）：冻结 `.note-select-wrap` 为唯一处理器落点（`@click.stop="toggleNoteSelected(note.id)"`），`.note-select` 只挂受控 `:checked`/`:disabled`（0 处 `@click`）；`.note-ask` 本体承担 `:disabled` 与 `@click.stop="onAskNote(note)"`（禁用态不被包裹元素旁路） | §1.5 三态 3、§6.4 no.11 | 场景 40 新增「点 `.note-select` 本体 ⇒ `已选 1 条`、`checked:true`」：双触发（0 条）与只挂 `.stop`（0 条）都失败 |
| 4 | 「替换、不追加」（N44-6）无判别证据 | 采纳：41b 改为「先选 2 条 → 点第 3 行（`n-current-3`）的 `.note-ask`」，断言 `已选 1 条` + `摘录 1 条` | §6.3 场景 41b | `countText`/`chip`/`noticeText` 三条同源：追加实现会是 3 条 |
| 5 | 选择条「问 AI」（`.notes-ask-btn`）从未被点击 | 采纳：新增场景 41d（承接 41c，选 2 条 + 空草稿 → 点 `.notes-ask-btn`）；场景总数 15 → 16 | §6.3 场景 41d、§6.3 末段、§3.2 与 §6.1 / §7 的计数 | `value` = 模板、`activeHasInputArea:true`、`countText:"已选 2 条"`、`chip:"摘录 2 条"`（既不替换成 1 条也不清空） |
| 6 | 无文档时两个追问入口静默空转，与 §0.4/N44-2 的可见承诺冲突、§4 无此行 | 采纳（选「禁用 + title」方案）：§1.4 冻结三态可用性（`clarifying` → `等待澄清回答时无法发起追问`；无文档 → `请先打开文档，摘录才会随提问注入`）；`NotesPanel` 新增 prop `documentOpen`（`WorkspacePage` 绑 `readerStore.filePath !== null`，与 `documentChip` 同源）；§4 补第 17 行 | §1.4、§3.2（NotesPanel / WorkspacePage 行）、§4 第 17 行、§6.3 场景 42d、§8 第 8 条 | 42d：两入口 `disabled:true` + `wrapTitle` 逐字；点 `.notes-ask-btn` 后 `value:""`、`countText:"已选 2 条"`、`hasNotice:false` |
| 7 | §6.4 期望计数与契约不符（no.9 的 1 处 `emitNotesAsk`、no.2 的前缀命中） | 采纳「改期望」（实现不动：选择条按钮仍按 §1.4 模板内直接触发）：no.2 改为带词界的双 pattern + 逐文件行数，并声明 ChatPanel 对 `MAX_CONTEXT_NOTES_CHARS` 只做**文案插值**（`8000` 字面量只落定义行）；no.9 改为 `useQuickAsk.ts` 2 / `ChatPanel.vue` 2 / `NotesPanel.vue` 2 | §6.4 no.2、no.9；§1.3「同源」行；§3.2 ChatPanel 行 | `grep -rn "8000"` 1 命中；`MAX_CONTEXT_NOTES\b` 6 行 / 3 文件；`MAX_CONTEXT_NOTES_CHARS\b` 4 行 / 2 文件 |
| 8 | §6.1 烟测主命令不可执行（`--paths` 报 TS6064） | 采纳并加固：主命令改为「写 `$TMP/pix-r8-ctx/tsconfig.json` → `tsc -p`」，删掉备选说明；**实测发现第二处阻塞**：独立编译须把 `src/renderer/types/ipc.ts`（`declare global` 补 `window.pixApi`）放进 `files`，否则报 `error TS2339`；追加冻结「`baseUrl` 用 `pwd -W`」与「断言脚本 `cd $TMP` 后相对 require」 | §6.1 命令 3 + 三条实测约束 | 本次实测：`tsc -p` exit 0，产物 `out/renderer/utils/{reading-context,notes-path}.js`，node 可调用 `buildReadingUserMessage` |

### B. 两选一处方的取舍理由

- **must-fix 6：不采纳「复用 `.notes-ask-notice` 给一句提示」**。`onNotesAsk` 的提示行语义已被草稿保护占用（`已加入 N 条摘录，草稿已保留`，§1.4），再让它承载「不会注入」会产出两条语义相反的同名提示；禁用 + title 与既有 `clarifying` 分支同机制（同一 `disabled` 落点 + 包裹元素 title），零新增机制，且让「入口可用 ⇔ 会注入」与 chip 可见性同判据。替代方案（若坚持可点击）：把提示行文案冻结为 `当前未打开文档，摘录不会随提问注入` 并保留模板填入 —— 会让同一路径同时出现「已加入 N 条摘录」与「不会注入」两句相反文案，故不采纳。
- **must-fix 7：不采纳「改实现（选择条也走同一个 `onNotesAsk`）」**。两个入口语义不同（行内 = 替换为 1 条；选择条 = 原样使用当前选择集，§1.4），共用一个处理函数就必须在函数内分叉，反而违背「不写两条分支」。
- **must-fix 2：不采纳「删掉 `selectedText:` 断言」**。该行是 R7 回归面（「选中文本」chip 与注入联动）的证据，且 `selectPageSpan` 是作用域内既有原语，成本低于丢失判据。

### C. 次级项 8 条处置

| # | 评审要点 | 处置 | 落点 |
| --- | --- | --- | --- |
| 1 | §6.2 用例 11 标题写「两条」实为三条 | 标题改为「三条」 | §6.2 用例 11 |
| 2 | §1.6 `sendCalls` 记录点写成「既有分支内」 | 改为「`handleCommand` 需**新增** prompt/steer 分支并在此记录」 | §1.6 |
| 3 | `answerTitleFromEnd(n)` 与既有 `titleOfLastAnswer` 重复 | 冻结为「后者泛化为前者的 `n = 1` 调用，不留第二份写法」 | §1.6 |
| 4 | `clearSendCalls()` 无场景使用 | 在场景 43 的 steer 相位前显式调用（隔离两份证据） | §6.3 场景 43、末段 |
| 5 | N49-4「每帧每块至多解析一次」缺核对点 | 新增 §6.4 no.17（`ChatPanel` 内 `readingAnchorFor(` 0 命中） | §6.4 no.17 |
| 6 | `activeHasInputArea` 在 `show:false` 离屏窗口下的取法未写死 | §6.3 前置 no.8：判据 = `document.activeElement === .input-area`；`document.hasFocus()` 只记不判 | §6.3 前置 no.8 |
| 7 | `kind: answer` 的归一化后果需承认 | §1.2 新增一条：markdown 被折叠成一行是冻结格式的必然结果，注入面不得按 `kind` 加例外 | §1.2 |
| 8 | §8 的 7 条需求档字面修改请求需负责人处置 | 保留 §8 清单并追加第 8 条（无文档禁用）；开工前提 = 需求档回改或声明「本轮以设计档口径为准」二者其一 | §8（现 8 条） |

### D. 本次实测记录（只读命令 + 仓库外临时目录，未改任何代码）

1. `cd pix && ./node_modules/.bin/tsc --baseUrl . --paths '{"@shared/*":["src/shared/*"]}' … src/renderer/utils/{reading-context,notes-path}.ts` ⇒ `error TS6064`（复现评审结论）。
2. 改为 `$TMP/pix-r8-ctx/tsconfig.json` + `tsc -p` ⇒ 先报 `error TS2339: Property 'pixApi' does not exist on type 'Window & typeof globalThis'`（`reading-context.ts:80` 的 `hasLibraryReadApi`）；把 `src/renderer/types/ipc.ts` 加进 `files` 后 `exit 0`，产物落在 `$TMP/pix-r8-ctx/out/renderer/utils/*.js`。
3. `cd "$TMP/pix-r8-ctx" && node -e "require('./out/renderer/utils/reading-context.js')"` ⇒ `buildReadingUserMessage` 可调用，输出为 `<reading_context>` / `path` / `page` / `pageCount` / `selectedText:` 段（与 R7 字段顺序一致）。
4. 临时目录已删除；仓库源码零改动（`git status` 仅 `docs/pm/R8-{design,req,review}.md` 三份未跟踪文档）。

### E. 开工门槛（本节生效后的准入判据）

1. 正文与本节口径一致：§1.3 的 chip 可见性、§1.4 的三态可用性、§1.5 三态 3 的点击落点、§6.3 的 16 场景与新增原语/断言、§6.4 的计数期望。
2. 需求档的 8 条回退建议（§8）已由负责人处置（回改或声明以设计档为准）；未处置前不得开工实现。
3. 烟测主命令按 §6.1 可一条链跑通（`tsc -p` exit 0）；`cd pix && npm run check` 改前基线 0 error。

### F. 修复轮回改（R8 代码审查 must-fix 3，纯文档口径）

| # | 回改项 | 落点 |
| --- | --- | --- |
| 1 | §6.4 no.9 的逐文件行数按实际命中（顶层 import 行同样命中 pattern）：`useQuickAsk.ts` 2 / `ChatPanel.vue` 3 / `NotesPanel.vue` 3 | §6.4 no.9 |
| 2 | §6.4 no.17 的「ChatPanel 内 `readingAnchorFor(` 0 命中」按语义口径回改为「恰 1 处调用点（`answerActionViews` 内），模板 0 处直接解析」；`answerSaveTitle(` / `answerSaveDisabled(` 各 2 命中（模板 1 + 定义 1） | §6.4 no.17 |

> 两条均属「档面判否实现」的悬空期望：实现未动，只把判据改到可判定的实际口径（N49 的索引化实现本身按 §3.1 覆盖表落地，见 `docs/pm/R8-dev.md`「修复轮」）。
