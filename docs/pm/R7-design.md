# PiX-Read R7 设计档 · AI 结论入库（N35–N42）

> 上游：`docs/pm/R7-req.md`（需求，N35–N42）、`docs/pm/R7-review.md`（需求评审 must-fix 1–8 与次级项）、`docs/pm/PRD-V0.4.md` §1.2/§2/§3/§4.2/§4.3/§7.2。
> 本档是「可直接开工的定稿设计」：契约、锚点规则、文案、DOM 选择器、失败路径、分工、验证全部写死到可判定粒度。
> 本档**不改任何代码**；唯一工程门仍是 `cd pix && npm run check`（0 error）。
> 判定工具只有四种（与需求档一致）：【走查】只读代码 / `git diff`；【check】`cd pix && npm run check`；【烟测】主进程数据面离线烟测；【离屏】`scripts/ui-shot.mjs`。

---

## 0. 判定口径与三处口径修订

判定证据沿用 R6 口径（`docs/pm/R6-design.md` §0）。R7 需要对需求档的三条判定口径就地修订，全部因为「需求档的字面判据在现状代码/离屏面上不可满足」，修订后均**更严格**（不留走查口子）：

**修订 1（对应 must-fix 2 与评审 §3.1）—— 补两条驱动原语，hover 与「点发送」都改成真驱动。**
`ui-shot.mjs` 现在既没有 hover 原语也没有 composer 输入原语（`.message-copy-btn` 靠 `.agent-message:hover` + `opacity:0` 显形；`.composer-send` 按 `draft.trim()` 判禁用），"hover 后同时出现两个动作" 与 "点发送" 两句都拍不到/点不动。本档写死两条原语（§7.4.1）：

- `moveMouse(selector)`：先 `scrollIntoView({ block: "center" })`，再 `movePointer(x, y)`（CDP `Input.dispatchMouseEvent` 首选、`sendInputEvent` 兜底，判定顺序见 §7.4.1），等待 `250ms`（覆盖 `opacity .15s` 过渡）后返回 `getComputedStyle` 的 `opacity`。**这也是 hover 的唯一驱动方式**；`.answer-save-wrap` 的 hover 断言与截图都建立在它之上。
- `typeAndSend(text)`：取 `.input-area`，用原生 setter 写 `value` 并派发 `input`（Vue `v-model` 的监听）→ 等 `.composer-send` 不再是 `disabled` → `.click()`。**不依赖键盘事件与焦点**（离屏窗口 `show:false` 时 `sendInputEvent` 的键盘路径不可靠），因此 composer 驱动只走「写值 + 派发 input + 点发送按钮」三步。

**修订 2（对应 must-fix 3）—— stub 的 notes 五个口全部写穿同一个 fixture 文件。**
现状 `notesAdd/notesUpdate/notesDelete/notesReset` 只改内存数组（`ui-shot.mjs:497-541`），文件只在 `writeFixtures()` 写一次，而 N36 验收 4/5、N39 验收 4 是**文件态判据**。本档写死：`notesLoad` 每次真读文件、四个变更口 + `seedNotes` 全部写同一个 `<OUT_ROOT>/library/.pix-read/notes.json`（§7.3）。连带修正两处 fixture：
- `writeFixtures()` 写的 `notes.json` 初值改为 `{ "version": 1, "notes": [] }`（原来直接写 seedNotes；写穿后会让场景 B「笔记空态」失效）；
- `seedNotes()` 增加一条 answer 种子（N39 验收 3 的排序样本，§7.3.2）。

**修订 3（对应 must-fix 5/6/8）—— 三条字面判据改写为可满足且更严格的形式。**
- N37 验收 1 → 「`send()` 内 `readerStore.filePath` 与 `readerStore.page`（非 `pageCount`）**各恰好读一次**，锚点对象与 `<reading_context>` 实参都取自这两个局部量；锚点登记不受 `excluded.has("document")` 分支约束」（§2.1、§7.5 no.2）。
- N36 验收 9 → 「注入 `outside` + 断言反馈逐字为『保存失败：该文档不在当前资料库内』+ 不写盘 + 按钮回到可点」；另写死「锚点文档已被删除」的行为（**保存成功**，理由见 §5 第 3 行）。
- N38 验收 8 只覆盖反馈期；本档增补**在途窗口**：`pending` 守卫 + `setNotesAddDelay(600)` 场景，断言「连点两次 → `notesAddCalls().count === 1`」（§3、§7.4.2 场景 31b2）。

**新增场景声明**：需求 N41 验收 4 冻结 9 个截图名（30/30b/31/31b/31c/32/32b/33/34），本档在其上**新增两个场景**（`35-answer-anchor-strict`、`36-answer-save-failure`）与两张截图，理由：must-fix 1 的「不跨过无锚点块」与 must-fix 6 的失败注入各需要一条独立判别证据，否则这两条只有走查（§7.4.2）。截图数只增不减，符合 N41 验收 6。

---

## 1. 契约冻结表

### 1.1 共享类型（`pix/src/shared/types.ts`，改动只有三处）

```ts
// ── Reader Notes 段（既有类型：kind 从「有」到「必填」）────────────────────
export type ReaderNoteKind = "excerpt" | "answer";   // 既有，一字不改

/** 渲染层草稿：kind 必填、无默认值（不做向后兼容层，避免「忘了传」被静默写成长文本摘录）。 */
export interface ReaderNoteDraft {
  kind: ReaderNoteKind;     // 新增，必填
  docFilePath: string;      // 不变：绝对路径，相对化与越界拒收在主进程
  page: number;             // 不变
  text: string;             // 不变
}

// ── 新增：轮次锚点（紧随 Reader Notes 段之后）──────────────────────────────
/**
 * 提问发送时刻的阅读位置快照。只存在于渲染层内存的 display block 上：
 * 不落任何文件（会话文件、notes.json、reader-state.json 都不写）。
 */
export interface ReadingAnchor {
  docFilePath: string;   // 绝对路径（与 ReaderNoteDraft.docFilePath 同口径）
  page: number;          // 1-based
}

// ── DisplayBlock：只有 user-message 变体多一个可选字段 ──────────────────────
export type DisplayBlock =
  | { id: string; type: "user-message"; text: string; attachments?: ChatMessageAttachment[]; timestamp: number;
      readingAnchor?: ReadingAnchor }   // 新增可选；「缺省」即该轮没有锚点
  | { id: string; type: "agent-message"; ... }   // 其余 11 个联合成员逐字不动
```

- 字段取值域：`page` = 整数 ≥ 1（与 `reader-store.page` 同域）；`docFilePath` 非空绝对路径。
- `readingAnchor` 是**可选属性**而不是 `| null` 联合：缺省即「无锚点」，`?? null` 读法统一（§2.5）。
- **不落盘**：`ReaderNote`、`ReaderNotesFile`、`ReaderNotesErrorCode`、`ReaderState*` 全部零改动（判定：`git diff` 不含这些符号）。
- 导入路径：渲染层需要 `ReadingAnchor` 的两个文件（`stores/session-store.ts`、`components/workspace/ChatPanel.vue`）从 **`@shared/types`** 顶层 `import type`，**不改 `pix/src/renderer/types/session.ts` 的 re-export 列表**（该文件不在白名单内；仓库内 `stores/notes-store.ts` 已是「渲染层直引 `@shared/types`」的既有写法）。

### 1.2 IPC 与守卫（`pix/src/main/ipc-handlers.ts`）

| 通道 | 入参 | 返回 | 错误码与中文错误 |
| --- | --- | --- | --- |
| `notes-add` | `ReaderNoteDraft`（含新增必填 `kind`） | `ReaderNotesMutationResult` | `no-root`「尚未选择资料库根目录」；`invalid-input`「笔记数据不合法」；`outside`「该文档不在当前资料库内」；`too-long`（按 kind 分叉，见表下）；`corrupt`「笔记文件无法读取（文件已损坏，未被修改）」；`version-unsupported`「笔记文件版本不支持」；`read-failed`「笔记文件读取失败」；`write-failed`「笔记写入失败」 |

- 通道数量不变：`notes-load` / `notes-add` / `notes-update` / `notes-delete` / `notes-export` / `notes-reset` **六条，不增不减**（判定：`grep -n 'ipcMain.handle("notes' pix/src/main/ipc-handlers.ts` = 6 行）。
- 守卫：`isNoteDraft` 只增一条形状校验 `(draft.kind === "excerpt" || draft.kind === "answer")`，不合法走既有 `invalidNotesInput()`（`invalid-input` + 「笔记数据不合法」）。
- `preload.ts` **零改动**：`notesAdd(draft: ReaderNoteDraft)` 的类型自动携带 `kind`（判定：`git diff` 不含该文件）；`PixApi` 方法名与签名不变。
- `too-long` 文案分叉（`notes-store.ts` 内，**不得给 `ERROR_MESSAGES` 加键**，否则动码表）：

| 场景 | `code` | `error`（必须逐字） |
| --- | --- | --- |
| excerpt 超长 | `too-long` | `选中内容过长（超过 4000 字），请分段摘录`（既有，一字不改） |
| answer 超长 | `too-long` | `回答过长（超过 4000 字），无法存为笔记` |
| 空内容 / kind 非法 / page 非法 | `invalid-input` | `笔记数据不合法`（既有） |
| 文档越界 | `outside` | `该文档不在当前资料库内`（既有） |

实现形态（写死）：`ERROR_MESSAGES` 保持 `Record<ReaderNotesErrorCode, string>` 逐字不变，answer 文案是**独立模块常量**：

```ts
/** answer 超长文案；不能按 kind 给 ERROR_MESSAGES 加键（码表与 ReaderNotesErrorCode 一一对应，N35 验收 7）。 */
const ANSWER_TOO_LONG_MESSAGE = "回答过长（超过 4000 字），无法存为笔记";
```

### 1.3 `notes.json` 写盘字段（主进程唯一写者，路径与协议不变）

路径 `<工作区根>/.pix-read/notes.json`；序列化 `JSON.stringify(file, null, 2) + "\n"`；写入协议 `mkdir → 写 <target>.tmp → renameSync`；失败清理 tmp、原文件字节不变。**R7 只多一个入参维度（写入值）+ 一处导出标注。**

| 字段 | 取值 | 与本轮的关系 |
| --- | --- | --- |
| `id` | 新 `randomUUID()` | 不变 |
| `kind` | **`draft.kind`**（原为硬编码 `"excerpt"`，`notes-store.ts:295`） | **本轮唯一写入值变化** |
| `docPath` | 相对工作区根、正斜杠、保留原大小写 | 不变 |
| `page` | 原样写入 `draft.page`（1-based，不钳制） | 不变 |
| `text` | `normalizeNoteText(draft.text)`（连续空白含换行折叠为单空格 + 去首尾） | 不变（形态见需求 §0.1） |
| `comment` | `""` | 不变 |
| `createdAt` / `updatedAt` | 主进程 `Date.now()`，两者相等 | 不变 |
| `version` | `1` | 不变 |

去重键（唯一实现点 `duplicateKey`，`notes-store.ts:192`）：

```ts
/** N23 去重键扩一维 kind：同一段文字既摘录又存为结论时是两条独立资产（需求 §0.2）。 */
function duplicateKey(docPath: string, page: number, kind: ReaderNoteKind, text: string): string {
  return `${docPathKey(docPath)}\u0000${page}\u0000${kind}\u0000${text}`;
}
```

两处调用点同步传 `kind`（`addNote` 内查找与既有条目比较）；`kind` 是常量段 ⇒ 只含 excerpt 的库，去重命中结果与改动前逐条相同。

`addNote` 的判定顺序（写死，全部先于读写盘）：

1. `notesPaths()` 为空 → `no-root`（既有首判，保持不动）；
2. **`draft.kind` 白名单**（`!== "excerpt" && !== "answer"`）→ `invalid-input`（**先于 `outside`、先于 `readNotesFile`、先于 `writeFileAtomic`**）；
3. `toRelativeDocPath` 越界 → `outside`；
4. `normalizeNoteText` 后为空 / `page` 非整数 / `page < 1` → `invalid-input`；
5. 归一化文本长度 > 4000 → `too-long`（按 kind 取文案，见 §1.2）；
6. 读文件（损坏/版本/读失败原样上抛）→ 去重命中 → `duplicateOf`（不写盘）→ 追加 + 原子写。

导出（`renderMarkdownEntry` 一处分支）：

```ts
const title = note.kind === "answer" ? `### 第 ${note.page} 页 · AI 结论` : `### 第 ${note.page} 页`;
```

分隔符是**半角空格 + 全角中点（U+00B7 `·`）+ 半角空格**，与既有 ` · ` 用法一致；模板其余部分逐字节不变（`# 阅读笔记 · <资料库名>`、统计行、`## <docPath>（N 条）`、条目间 `\n\n---\n\n`、正文 `> ` 前缀、`备注：` 行、末尾 `\n`）。

### 1.4 锚点挂在哪个类型上（字段名 + 生命周期）

| 项 | 冻结值 |
| --- | --- |
| 类型 | `ReadingAnchor`（`pix/src/shared/types.ts`） |
| 挂载类型 | `DisplayBlock` 的 **`user-message`** 变体 |
| 字段名 | `readingAnchor?: ReadingAnchor` |
| 唯一赋值处 | `sessionStore.appendOptimisticUserMessage`（`session-store.ts:246`）内的块构造 |
| 唯一读取处 | `sessionStore.readingAnchorFor(blockId)`（新增，§1.5） |
| 生命周期 | 生成：`ChatPanel.send()` 内快照（§2.1）→ 挂在乐观用户块上 → 会话确认（`appendUserOrNoteMessage` 的匹配分支）**只覆盖 `text`/`attachments`/`timestamp`，锚点原样保留** → 块被 `clearSession()` / `MAX_DISPLAY_BLOCKS` 裁剪 / `failOptimisticUserMessage` 删除时随之消失 |

**为什么挂用户块而不是 agent 块**：轮次的起点是用户消息；`loadMessages`（历史会话）构造用户块时天然不赋值 ⇒ 「无锚点」分支不需要额外状态；会话文件格式零改动（`session-bridge.ts`、`packages/**` 不碰）。

### 1.5 渲染层 store 字段与动作

**`pix/src/renderer/stores/session-store.ts`（只加两处）**

```ts
/** 第三参：本轮发送时刻的阅读位置；null = 无锚点（不写该字段）。 */
function appendOptimisticUserMessage(text: string, filePaths: string[] = [], anchor: ReadingAnchor | null = null): string | null {
  ...
  const block: Extract<DisplayBlock, { type: "user-message" }> = {
    id: nextBlockId(),
    type: "user-message",
    text: text.trim(),
    attachments,
    timestamp,
    ...(anchor ? { readingAnchor: anchor } : {}),
  };
  ...
}

/** 回答块的轮次锚点：只认紧邻前一个 user-message 块；无锚点即 null（不跨块回溯，§2.5）。 */
function readingAnchorFor(blockId: string): ReadingAnchor | null {
  const blocks = displayBlocks.value;
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index < 0) return null;
  for (let i = index - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    if (block.type !== "user-message") continue;   // 只跳过非 user-message 块
    return block.readingAnchor ?? null;            // 命中第一个 user-message 即定论
  }
  return null;
}
```

- 两个函数都进 store 的 `return` 导出对象（`readingAnchorFor` 是新增导出名）。
- `appendUserOrNoteMessage`（`:206`）、`loadMessages`（`:615`）、`failOptimisticUserMessage`、`clearSession` **逐字不动**（`loadMessages` 路径不出现 `readingAnchor`）。
- 复杂度：向后扫描在**第一个 user-message 处终止**，步数 = 同轮内块数（通常 0–3），不是 O(blocks)；模板内按块调用可接受，不引入缓存。

**`pix/src/renderer/stores/notes-store.ts`（零改动）**：`addNote(draft)` / `applyNotes(result.notes)` / `AddNoteResult` 三态（`ok` / `duplicate` / 失败 message）原样复用；失败不吞（§3）。

**`pix/src/renderer/components/workspace/ChatPanel.vue` 新增的局部状态（名字冻结，供 B 与场景共用）**

```ts
type AnswerSaveState = "ok" | "duplicate" | "error";
interface AnswerSaveFeedback { state: AnswerSaveState; text: string }

/** 键 = 回答块 id；三态原位反馈（不弹对话框）。 */
const answerFeedback = ref<Record<string, AnswerSaveFeedback>>({});
/** 键 = 回答块 id；IPC 在途守卫（must-fix 8）。 */
const answerSavePending = ref<ReadonlySet<string>>(new Set());
const answerFeedbackTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** 与 PdfSelectionQuickAsk.FEEDBACK_MS 同值；组件内常量不可跨文件复用，此处独立定义。 */
const ANSWER_FEEDBACK_MS = 2500;
```

函数（冻结签名与语义，实现细节自由）：

| 函数 | 语义 |
| --- | --- |
| `answerDocName(filePath: string): string` | `filePath.split(/[/\\]/).pop() \|\| filePath`（(a)/(b) 两分支**同一函数**，口径不分叉） |
| `answerSaveTarget(block)` | 三分支：锚点优先（`sessionStore.readingAnchorFor(block.id)`）→ 当前阅读位置（`readerStore.filePath` 非空时 `{ docFilePath: readerStore.filePath, page: readerStore.page }`）→ `null`（不可用）。返回值带 `fromAnchor: boolean` 供文案分叉 |
| `answerSaveTitle(block): string` | 三情形提示文案（§3 文案表） |
| `canShowAnswerSave(block): boolean` | `block.content.trim() !== "" && !block.isStreaming`（N36 验收 3/11） |
| `answerSaveDisabled(block): boolean` | `answerSaveTarget(block) === null \|\| answerSavePending.value.has(block.id)` |
| `showAnswerFeedback(id, state, text): void` | 写 `answerFeedback[id]`，清旧计时器，`ANSWER_FEEDBACK_MS` 后删除该键（回到按钮） |
| `saveAnswerNote(block): Promise<void>` | 在途守卫 → `notesStore.addNote({ kind: "answer", docFilePath, page, text: block.content })` → 三态反馈；`finally` 清 pending |

### 1.6 DOM 与文案契约（选择器冻结，实现不得改名）

| 选择器 | 含义 |
| --- | --- |
| `.agent-message` | 回答块（既有，`position: relative` 祖先） |
| `.message-copy-btn` | 既有复制按钮：**DOM、类名、CSS、复制行为、`copied` 反馈零改动** |
| `.answer-save-wrap` | 保存动作容器（`position: absolute; top: 2px; right: 80px`，hover 显形）；**`title` 挂在这个容器上**（避开 Chromium 对禁用控件不派发鼠标事件的已知行为） |
| `.answer-save-btn` | 「存为笔记」按钮本体（`disabled` 属性表达不可用） |
| `.answer-note-feedback[data-state="ok\|duplicate\|error"]` | 三态原位反馈文本节点（`pointer-events: none`） |
| `.note-ai-badge` | 笔记面板中 answer 条目的「AI」徽标 |
| `.input-area` / `.composer-send` | composer 驱动原语的两个落点（既有） |

样式冻结（新容器与复制按钮同排、不重叠）：

```css
/* 复制按钮最宽态（图标 14 + 间距 4 + 「已复制」≈33 + 内边距 12 + 边框 2 ≈ 65px）之外；冻结值。 */
.answer-save-wrap {
  position: absolute; top: 2px; right: 80px; z-index: 1;
  display: inline-flex; align-items: center;
  opacity: 0; transition: opacity 0.15s ease;
}
.agent-message:hover .answer-save-wrap,
.answer-save-wrap.has-feedback { opacity: 1; }   /* 与 .message-copy-btn.copied 同机制的常显 */
```

`.answer-save-wrap` 用 `<span>`（无默认样式，便于绝对定位 + `title`）；`.answer-save-btn` 与 `.answer-note-feedback` 复刻 `.message-copy-btn` 的字号（11px）/圆角（6px）/内边距（2px 6px）/边框变量，反馈颜色：`ok` = `--pix-success`、`duplicate` = `--pix-text-secondary`、`error` = `--pix-error`。

---

## 2. 锚点生命周期（写死）

### 2.1 生成：`ChatPanel.send()` 内唯一快照点（must-fix 5）

```ts
// --- 本轮唯一快照：filePath/page 各只读一次，既作锚点又作 <reading_context> 的实参 ---
// 锚点登记不受 chip 排除分支约束：排除只影响「注入什么」，不影响「发送时读了哪一篇哪一页」。
const readFilePath = readerStore.filePath;
const readPage = readerStore.page;
const anchor: ReadingAnchor | null = readFilePath ? { docFilePath: readFilePath, page: readPage } : null;
const filePaths = attachments.value.map((a) => a.path);
optimisticBlockId.value = sessionStore.appendOptimisticUserMessage(text, filePaths, anchor);
...
const message = excluded.has("document")
  ? text
  : buildReadingUserMessage(text, {
      filePath: readFilePath,
      page: readPage,
      pageCount: readerStore.pageCount,
      selectedText: excluded.has("selection") ? "" : readerStore.selectedText,
    });
```

- `send()` 内 `readerStore.filePath` 与 `readerStore.page`（属性读取，不含 `pageCount`）**各恰好一次**；`<reading_context>` 的 `filePath`/`page` 取自同一对局部量，不存在第二套来源。
- `buildReadingUserMessage` 的入参对象与字段顺序零改动；chips 的排除行为零改动；`pageCount`/`selectedText` 的读取点不变。
- 非 PDF（md/txt）：`openDocument` 已把 `page` 复位为 1 ⇒ 锚点 `{filePath, page: 1}`，提示显示「第 1 页」（N36 验收 10）；跳回仍走 `jumpToPage` 的「非 PDF 直接忽略」。
- `pageCount === 0` 不影响登记（登记条件是 `filePath` 非空）。

### 2.2 挂载与会话确认

1. 乐观块带着 `readingAnchor` 立即入列（`appendOptimisticUserMessage`，同步执行，先于任何 await）。
2. **回答块自身不携带锚点字段**：它在渲染提示与点击保存时通过 `sessionStore.readingAnchorFor(block.id)` 现算（回答内容流式变化不会改动锚点；锚点只跟着用户块走）。
3. 会话确认（`message_start` role=user 命中 `matchOptimisticUserMessage`）时只覆盖 `text`/`attachments`/`timestamp` ⇒ **锚点保留**（N37 验收 3）。
4. 发送失败（`failOptimisticUserMessage`）删除乐观块 ⇒ 锚点随之消失；重发产生新锚点，不残留（N37 验收 6）。
5. 锚点是**值拷贝**，不引用 store：登记后关闭文档再打开同一文档，锚点不变（N37 验收 8）。

### 2.3 steer / follow-up

- steer 复用同一个 `send()`（`isStreaming` 分流到 `rpc.sendSteer`），因此**同一套快照与登记规则**；steer 的乐观块位于流式块之后、后续回答块之前 ⇒ 其后回答块"紧邻前一个 user-message"就是该 steer 块 ⇒ 落 steer 自己的锚点（N37 验收 4）。
- 渲染层目前没有 follow-up 入口（`useRpc` 只有 `set_follow_up_mode` 与队列计数）；**将来若加入口，必须复用 `send()` 的同一快照点与同一登记调用**，不得另起一套。
- **确认不匹配时（must-fix 7）**：`matchOptimisticUserMessage`（`session-store.ts:117`）不命中 ⇒ 乐观块之后会多出一个**无锚点**的确认用户块；此时回答块解析到的就是那个无锚点块 ⇒ **锚点归属 = 无锚点**，回答块走 (b)/(c)，**不许回落到上一轮**。判别证据见离屏场景 `35-answer-anchor-strict`（§7.4.2）。

### 2.4 清空

| 时机 | 锚点去向 | 依据 |
| --- | --- | --- |
| `clearSession()`（`goHome`（`WorkspacePage.vue:219`）/ `onNewSession`（`:153`）/ `onSwitchSession`（`:163`）/ `HomePage.openWorkspace`（`HomePage.vue:51`）） | 随 `displayBlocks` 一起清空 | `WorkspacePage` 既有调用点；`onUnmounted`（`:127`）只 flush + resetState，**不是**清空点（引用更正见 §10.2 no.4） |
| `loadMessages`（历史加载） | 用户块经 `appendUserOrNoteMessage` 构造，**不赋值锚点** ⇒ 一律 (b)/(c) | `loadMessages` 先 `clearSession()`，不存在跨重载残留 |
| `MAX_DISPLAY_BLOCKS`（20000）裁剪 | 带锚点的用户块可能被丢弃 ⇒ `readingAnchorFor` 返回 `null` ⇒ 该回答块走 (b)/(c)（不做非空断言、不抛错） | N37 验收 5 |
| 工作区重进 | `WorkspacePage.onMounted` 走 `syncWorkspaceState({loadMessagesIfEmpty:true})`：`displayBlocks.length === 0` 时才重载历史 | 场景 33/34 必须先 `goHome()` 再进工作区，否则历史不重载、测的不是目标分支 |

### 2.5 解析表达式（唯一实现点，跳过边界写死）

```ts
/**
 * 解析规则（写死，must-fix 1）：
 *  - 从回答块向前扫描，**跳过**非 user-message 块（thinking / work-status / vision-status /
 *    turn-separator / error / compaction / retry / note / status / guide）；
 *  - 遇到**第一个 user-message 块即终止扫描**：它有锚点就返回它，没有锚点就返回 null；
 *  - 绝不继续向前找「更早一个带锚点的用户块」——那会把上一轮的锚点当本轮目标。
 */
```

等价判定表达式：`anchor = nearestPrecedingUserMessageBlock(block)?.readingAnchor ?? null`。
无锚点分支的判定一律写成 `sessionStore.readingAnchorFor(block.id) === null`（不得用 `!anchor` 之外的自造状态）。

### 2.6 三分支判定（点击时刻判定，与需求 N36 表一致）

| 情形 | 条件（判定顺序） | 目标 | 提示 |
| --- | --- | --- | --- |
| (a) 有发送锚点 | `readingAnchorFor(block.id) !== null` | 锚点原值（绝对路径 + 页码） | `存为笔记 · <文件名> 第 N 页` |
| (b) 无锚点 + 当前有打开文档 | 上一步为 null 且 `readerStore.filePath` 非空 | 点击时刻的 `{readerStore.filePath, readerStore.page}` | `存为笔记 · <文件名> 第 N 页（按当前阅读位置）` |
| (c) 两者皆无 | 上一步也为空 | 无 | `无法存为笔记：这条回答没有发送时的文档锚点，且当前没有打开文档`；按钮 `disabled` |

---

## 3. 交互文案表

| 位置 | 触发 | 文案（逐字） |
| --- | --- | --- |
| `.answer-save-btn` | 常显（hover 显形） | `存为笔记` |
| `.answer-save-wrap[title]` | (a) | `存为笔记 · <文件名> 第 N 页` |
| `.answer-save-wrap[title]` | (b) | `存为笔记 · <文件名> 第 N 页（按当前阅读位置）` |
| `.answer-save-wrap[title]` | (c) | `无法存为笔记：这条回答没有发送时的文档锚点，且当前没有打开文档` |
| `.answer-note-feedback[data-state="ok"]` | 成功 | `已存为笔记 · <文件名> 第 N 页` |
| `.answer-note-feedback[data-state="duplicate"]` | 去重命中 | `已在笔记中`（与 `PdfSelectionQuickAsk` 的重复文案一致） |
| `.answer-note-feedback[data-state="error"]` | 失败 | `保存失败：<主进程 error 原文>` |

- `<文件名>` = `answerDocName(docFilePath)`：绝对路径最后一个分隔符（`/` 或 `\`）之后的部分，取不到时回落原字符串（与 ChatPanel 既有 `documentChip`、`sessionStore.attachmentName` 同取法）。
- `N` = 实际入库页码；成功/重复反馈里的 `N` 取 `result.page`（成功为 `note.page`，重复为草稿页码），与提示保持一致。
- 反馈停留 **2500 ms**（`ANSWER_FEEDBACK_MS`），到点后回到按钮；反馈节点带 `has-feedback` 常显类（不依赖 hover）。
- 主进程错误原文（反馈后缀的取值来源）：`该文档不在当前资料库内` / `笔记文件无法读取（文件已损坏，未被修改）` / `尚未选择资料库根目录` / `回答过长（超过 4000 字），无法存为笔记` / `笔记数据不合法` / `笔记写入失败` / `笔记文件读取失败`；IPC reject 走 `notes-store.rejectMessage` ⇒ `主进程调用异常：<message>`。

---

## 4. 文件级清单（动作 + 改动点 + 不变量）

### 4.1 A 面（契约与数据面）

| 文件 | 动作 | 具体改动点 | 不变量（不得破坏） |
| --- | --- | --- | --- |
| `pix/src/shared/types.ts` | 修改 | §1.1 三处：`ReaderNoteDraft.kind` 必填、新增 `ReadingAnchor`、`DisplayBlock` 的 user-message 变体加 `readingAnchor?` | 其余联合成员与 Reader Notes/Reader State 段逐字不动；不引入 `any` |
| `pix/src/main/notes-store.ts` | 修改 | (1) `duplicateKey` 增 `kind` 形参并同步两处调用；(2) `addNote` 增 kind 白名单（§1.3 顺序第 2 步）；(3) `too-long` 按 kind 取文案（新增独立常量，**不改码表**）；(4) note 构造 `kind: draft.kind`；(5) `renderMarkdownEntry` 加 ` · AI 结论` 分支 | 读侧 `isReaderNote`（含 `kind` 三分量判断）逐字不变；损坏/版本/原子写/备份/`resetCorruptNotes` 语义不变；**不允许出现 `slice(0, 4000)` 之类截断** |
| `pix/src/main/ipc-handlers.ts` | 修改 | `isNoteDraft` 增一条 kind 形状校验；不改通道、不改错误码、不改别的段 | notes 六通道数量与顺序不变；`invalidNotesInput()` 文案不变 |
| `pix/src/main/preload.ts` | **不改** | — | 判定：`git diff` 不含该文件 |

### 4.2 B 面（UI 与会话面）

| 文件 | 动作 | 具体改动点 | 不变量 |
| --- | --- | --- | --- |
| `pix/src/renderer/stores/session-store.ts` | 修改 | `appendOptimisticUserMessage` 增第三参 `anchor` + 条件展开写字段；新增并导出 `readingAnchorFor(blockId)`；`ReadingAnchor` 从 `@shared/types` 顶层 `import type` | `appendUserOrNoteMessage` / `loadMessages` / `failOptimisticUserMessage` / `clearSession` / 其余块构造零改动；`matchOptimisticUserMessage` 零改动；不改 `renderer/types/session.ts` 的 re-export 列表 |
| `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改 | §2.1 快照点；`send()` 第三参；§1.5 局部状态与函数；模板动作区新增 `.answer-save-wrap`（在 `.message-copy-btn` 之后、`.agent-markdown` 之前）；反馈期用 `v-if/v-else` 在按钮与反馈之间切换；`onUnmounted` 清 `answerFeedbackTimers` | 复制按钮的 DOM/类名/CSS/行为零改动；`jumpToPage` 与 `[[pN]]` 委托点击零改动；chips（`documentChip`/`selectionChip`/`excludeContext`）零改动；`renderAgentMarkdown` 与 `mdCache` 零改动；发送链路除快照外零改动 |
| `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 修改 | `addNote({ docFilePath, page, text })` → 追加 `kind: "excerpt"`（一行） | `pending` / `FEEDBACK_MS` / `showFeedback` 三态文案与行为零改动 |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | `.note-head` 内 `.note-page-badge` 之后、`.note-time` 之前插入 `v-if="note.kind === 'answer'"` 的 `.note-ai-badge`（文本 `AI`）+ 两条样式 | 排序/分组/筛选/计数文案/删除二次确认/备注交互/错误态/逃生口零改动；excerpt 行不渲染空占位 |
| `pix/scripts/ui-shot.mjs` | 修改 | §7.3 stub 写穿与控制口、§7.3.2 fixture 冻结、§7.4 场景与原语 | 既有 00–11、20–24 场景与 `SEL`/`MANIFEST`/`MEASUREMENTS` 结构不改；stub 是字符串模板，**不得出现反引号** |

范围外（任何情况下不动）：`packages/**`、`pix/package.json`（含 dependencies）、`package-lock.json`、`pix/build/**`、electron-builder 配置、`pix/resources/skills/**`、`pix/src/main/{library-root,reader-state-store,session-bridge,pdf-tools,reading-prompt,index}.ts`、`pix/src/renderer/utils/*`、`stores/{reader,reader-state,notes,project,settings,auth}-store.ts`、`pages/WorkspacePage.vue`、`components/{session/*,layout/*,input/*}.vue`、`components/workspace/{PdfViewer,ReaderPanel,LibraryPanel,KnowledgeMap,PdfSearchPanel}.vue`、`composables/*`。

---

## 5. 失败路径表

| # | 情况 | 行为 | 用户可见反馈 |
| --- | --- | --- | --- |
| 1 | 无锚点 + 当前无打开文档（(c)） | 不发起 IPC；按钮 `disabled`，`title` 给原因 | 悬停见 `无法存为笔记：…当前没有打开文档` |
| 2 | 锚点文档越界（不在资料库内） | 主进程 `outside`，不写盘 | `保存失败：该文档不在当前资料库内`；2500ms 后回按钮，**面板不进错误态** |
| 3 | **锚点文档已被删除但仍在资料库路径内** | **保存成功**（`isLibraryFilePath`（`library-root.ts:38-52`）只做前缀归属校验，`realpathSync` 失败被吞，不校验存在性）——这是既有事实，本轮不改；笔记面板照常出现该条；点击跳回走 ReaderPanel 既有预览失败态（不新增分支） | 反馈 `已存为笔记 · <文件名> 第 N 页` |
| 4 | 回答归一化后为空 | 主进程 `invalid-input`；渲染层根本不渲染按钮（`block.content.trim() === ""`） | 无按钮（数量 0） |
| 5 | 回答归一化后 > 4000 | 主进程 `too-long`（answer 文案），不写盘、无 `.tmp` | `保存失败：回答过长（超过 4000 字），无法存为笔记` |
| 6 | `notes.json` 损坏 / 版本不支持 | `corrupt` / `version-unsupported`，不写盘 | `保存失败：笔记文件无法读取（文件已损坏，未被修改）` / `保存失败：笔记文件版本不支持`；面板状态仍由面板自己的 `loadNotes` 决定，不被这次保存改写 |
| 7 | 无工作区根 | `no-root`，不写盘 | `保存失败：尚未选择资料库根目录` |
| 8 | 写盘失败（只读/被占用） | `write-failed`，tmp 已清理、原文件字节不变 | `保存失败：笔记写入失败` |
| 9 | IPC reject（handler 抛错） | `notes-store.rejectMessage` 兜底，**不停在 pending、不静默** | `保存失败：主进程调用异常：<message>` |
| 10 | 同 kind + 同文档 + 同页 + 同归一化文本重复保存 | 主进程命中 `duplicateOf`，不写盘、不返回新条目 | `已在笔记中`；笔记计数不变 |
| 11 | 快速连点（反馈期） | 反馈期改为渲染反馈节点（按钮不存在）⇒ 无第二次 IPC | 反馈常显 |
| 12 | 快速连点（IPC 在途窗口） | `answerSavePending` 守卫直接 return（`saveAnswerNote` 的首个同步段内） | 只有一次反馈；`notesAddCalls().count === 1` |
| 13 | 会话确认不匹配（乐观块 + 无锚点确认块并存） | 回答块锚点 = **无锚点** ⇒ 走 (b)/(c)，不回溯上一轮 | 提示按 (b) 加「（按当前阅读位置）」或按 (c) 禁用 |
| 14 | 流式中（块自身 `isStreaming === true`） | 不渲染按钮 | 无按钮（数量 0） |
| 15 | 历史会话 / 重载 / 新建对话 | 用户块无锚点 ⇒ (b)/(c) | 同 13 |
| 16 | 裁剪丢掉带锚点的用户块 | `readingAnchorFor` 返回 null（不抛错） | 同 13 |
| 17 | 发送失败（`failOptimisticUserMessage`） | 乐观块与其锚点一起删除；该轮无回答块 | 既有错误块（本轮不改） |

---

## 6. must-fix 处理表

| # | must-fix | 落在本档哪一节 | 落法（可判定） |
| --- | --- | --- | --- |
| 1 | 锚点解析规则未写死，会跨过无锚点块取上一轮锚点 | §2.5（解析表达式与跳过边界）、§2.3、§7.4.2 场景 35 | 写死「跳过非 user-message 块，遇第一个 user-message 即终止；无锚点返回 null」；**不采用跳过无锚点用户块的方案**，因此不需要额外的「跳过边界」补丁；新增场景 35 用「确认不匹配 ⇒ 回答块走 (b) 且页码取当前页而非上一轮锚点页」做判别 |
| 2 | hover 截图与「点发送」缺驱动原语 | §0 修订 1、§7.4.1 | 新增 `moveMouse(selector)`（CDP `Input.dispatchMouseEvent` 首选、`sendInputEvent` 兜底 + `250ms` 过渡等待，判定顺序见 §7.4.1）与 `typeAndSend(text)`（原生 setter + `input` 事件 + 点 `.composer-send`）；hover 同时断言「未 hover 时 opacity 0、hover 后 opacity 1」，截图 `30-answer-save-btn.png` 在断言通过后拍 |
| 3 | stub 写穿只覆盖 notesAdd | §0 修订 2、§7.3.1、§7.3.2 | 五个口（`notesAdd/notesUpdate/notesDelete/notesReset` + `seedNotes`）统一写同一个 fixture 文件，`notesLoad` 每次真读；`writeFixtures()` 的 `notes.json` 初值改空数组（否则场景 B 空态失效） |
| 4 | store 层缺 kind 白名单（非法 kind 会让整库判损坏） | §1.3（判定顺序第 2 步）、§6（A 面文件表） | `addNote` 内 `draft.kind` 白名单 → `invalid-input`，位于 `no-root` 之后、`outside` 与一切读写盘之前；`isNoteDraft` 同款形状校验（双层） |
| 5 | N37 验收 1 字面判据不可满足 | §0 修订 3、§2.1、§7.5 no.2 | 改为「`send()` 内 `readerStore.filePath` / `readerStore.page` 各恰好读一次，锚点对象与 `buildReadingUserMessage` 实参同源，且不受 chip 排除分支约束」；判定用 awk 区间计数 |
| 6 | N36 验收 9 造不出 `outside` | §5 第 2/3 行、§7.4.2 场景 36 | 改为「注入 `outside` + 断言逐字文案 + 不写盘 + 按钮回可点」；另写死「锚点文档已被删除 ⇒ 保存成功」并给出理由（`library-root.ts` 不校验存在）与证据 |
| 7 | 未定事件序列，N36 验收 4 与 N37 验收 3 互相污染 | §7.4.2 场景 30/31/33（事件序列逐条列出） | 主序列的 user `message_start` 一律带 `displayText === 发送文本`（命中确认 ⇒ 不产生多余用户块）；不匹配的归属在 §2.3 声明，并由场景 35 判别 |
| 8 | 快速连点只覆盖反馈期 | §1.5（`answerSavePending`）、§3、§5 第 11/12 行、§7.4.2 场景 31b2 | 按 `PdfSelectionQuickAsk.pending` 范式加守卫（同步段内先判后置）；新增 `setNotesAddDelay(ms)` 造在途窗口，断言「连点两次 → `count === 1`」 |

---

## 7. 验证方案

### 7.1 命令

```bash
# 1) 唯一工程门
cd pix && npm run check            # 期望：0 error

# 2) 离屏取证
cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
# 期望：退出码 0 + MANIFEST.json.failure === null + MEASUREMENTS.json 断言全部命中 + 截图数 >= 改前

# 3) 主进程数据面离线烟测（§7.2，临时目录，用完即删）
cd pix && ./node_modules/.bin/tsc --outDir "$TMP/pix-r7-notes" --module commonjs --target es2022 \
  --moduleResolution node --skipLibCheck --strict src/main/notes-store.ts src/main/library-root.ts
# 再跑 $TMP 下的 node 脚本；脚本跑完删除
```

### 7.2 主进程数据面烟测用例（可构造输入与预期 JSON）

前置：`setLibraryRoot(<$TMP>/r7-lib)`，库内放 `sample.pdf` 与 `archive/older.pdf`（空文件即可，主进程不解析 PDF）。

| # | 构造输入（draft / 前置动作） | 预期返回 | 预期文件/字节 |
| --- | --- | --- | --- |
| 1 | `{kind:"answer", docFilePath:"<$TMP>/r7-lib/sample.pdf", page:3, text:"A"}` | `{success:true, notes:[<1 条>], note:{id:<uuid>, kind:"answer", docPath:"sample.pdf", page:3, text:"A", comment:"", createdAt:t, updatedAt:t}}` | 文件 = `{"version":1,"notes":[<同上>]}`，2 空格缩进 + 末尾 `\n` |
| 2 | 同文档同页 `text:"B"` 先 `kind:"excerpt"` 再 `kind:"answer"`，第三次再 `kind:"answer"` | 第 1、2 次 `success:true` 且 `note` 各一条；第 3 次 `{success:true, duplicateOf:<第 2 条 id>}` 且 **无 `note` 字段** | 文件内 **2 条**（kind 分别为 excerpt/answer），`id` 不同、`createdAt` 单调；第 3 次后**字节与 mtime 不变** |
| 3 | 仅含 excerpt 的既有库：重复保存同一条 excerpt | 第 2 次 `duplicateOf` = 既有条目 id | 条目数不变、字节不变（与改动前逐条等价） |
| 4 | `kind` 缺失 / `"note"` / `123`（直接调 `addNote`，绕过 IPC 守卫） | `{success:false, notes:[], code:"invalid-input", error:"笔记数据不合法"}` | 不写盘、目录内**无 `.tmp`** |
| 5 | 4000 个非空白字符、`kind:"answer"` | `success:true` | 随后 `loadNotes()` 返回 `success:true`（不判 `corrupt`） |
| 6 | 4001 个非空白字符、`kind:"answer"` | `{success:false, code:"too-long", error:"回答过长（超过 4000 字），无法存为笔记"}` | 字节与 mtime 不变、无 `.tmp` |
| 7 | 4001 个非空白字符、`kind:"excerpt"` | `{success:false, code:"too-long", error:"选中内容过长（超过 4000 字），请分段摘录"}` | 同上 |
| 8 | `text:"   \n\t "`、`kind:"answer"` | `invalid-input` | 不写盘 |
| 9 | `page:0` / `page:1.5` | `invalid-input` | 不写盘 |
| 10 | `docFilePath:"<$TMP>/outside/sample.pdf"`（库外） | `{success:false, code:"outside", error:"该文档不在当前资料库内"}` | 不写盘 |
| 11 | 对 #2 的 answer 条目 `updateNoteComment(id,"备注")` / `deleteNote(id)` | 均 `success:true`，`notes` 全量回传 | 只改该条 `comment`/`updatedAt` 或删除该条，其余条目字节逐字不变 |
| 12 | 含 1 条 excerpt + 1 条 answer 的库，`exportNotesMarkdown()` | `{success:true, filePath:<…/notes.md>, count:2}` | `notes.md` 逐行：`### 第 2 页` 与 `### 第 2 页 · AI 结论`；`# 阅读笔记 · <资料库名>`、统计行 `共 2 条`、`## sample.pdf（2 条）`、条目间 `\n\n---\n\n`、正文 `> ` 前缀、末尾 `\n` 逐字；**导出前后 `notes.json` 的 sha256 与 mtime 相同**；连续两次导出除第 2 行（生成时间）外逐字节相同 |
| 13 | 只含 excerpt 的库导出 | 同上但**无任何标注** | 屏蔽生成时间行后与既有模板逐行相同 |
| 14 | 截断 JSON；`version:2`；`resetCorruptNotes()`（正常库） | `addNote` → `corrupt`；`addNote` → `version-unsupported`；`resetCorruptNotes` → `not-corrupt` | 三种情况原文件字节均不变；重建路径仍生成 `notes.json.corrupt-yyyyMMdd-HHmmss` 备份 |

> 烟测只编译叶子模块（`notes-store.ts` + `library-root.ts`），不跑 `npm run build`；脚本写在 `$TMP`，跑完删除。

### 7.3 stub 契约（`pix/scripts/ui-shot.mjs`）

#### 7.3.1 写穿与状态

- `const NOTES_FILE = CONFIG.notesFilePath`（= `<OUT_ROOT>/library/.pix-read/notes.json`，**仍只认 A 工作区**，与 R6 §6.1 一致）。
- `readNotesFile()`：`fs.readFileSync` → `JSON.parse` → 取 `notes` 数组（`clone`）；`ENOENT` / 解析失败 / 形状异常 ⇒ 空数组（stub 专用降级，偏差写在开发档）。**`loadFailure` 注入优先级高于真读**（保持既有场景 J 不变）。
- `writeNotesFile(list)`：`JSON.stringify({version:1, notes:list}, null, 2) + "\n"` 覆盖写同一个文件。
- `notesLoad` → 真读；`notesAdd` → 真读 → 归一化（同主进程口径：空白折叠 + 去首尾）→ kind 白名单 → 长度上限（answer/excerpt 两套文案）→ 去重键（`docPathKey + page + kind + text`）→ 命中回 `duplicateOf`，否则追加 + 真写；`notesUpdate` / `notesDelete` / `notesReset` → 真读 → 改 → 真写；`__pixStub.seedNotes(list)` → 真写（返回文件路径）；`notesExport` → 真读文件后取 `count`（与 `notesLoad` 同源，避免「内存数组 vs 文件」两套事实源；stub 不生成 `notes.md` 内容，导出模板的逐行断言由 §7.2 烟测 12/13 覆盖）。
- 越界：`notesAdd` 的 `docFilePath` 不在 `CONFIG.root` 前缀内 ⇒ `{success:false, code:"outside", error:"该文档不在当前资料库内"}`（与 `library-root` 的前缀归属口径一致，**不校验文件是否存在**，场景 36 的第 4 步依赖这一点）。

#### 7.3.2 控制口（`window.__pixStub`）

| 控制口 | 语义 |
| --- | --- |
| `seedNotes(list)` | 真写 fixture 文件（既有调用点场景 C 不变） |
| `notesAddCalls()` | `{count, payloads}`，`payloads` 为最近 8 条 `{docFilePath, page, text, kind}`（形状与需求 N41 验收 1 冻结一致，不加字段） |
| `setNotesAddFailure(code \| "throw")` | `code` ∈ `outside`/`corrupt`/`no-root`/`too-long`/`invalid-input`/`write-failed`：直接返回该码 + 中文原文、**不写盘**；`"throw"`：`throw new Error(...)`；`null` 清除 |
| `setNotesAddDelay(ms)` | `notesAdd` 前置 sleep（造在途窗口，must-fix 8；需求档未列，本档新增并说明理由） |
| `setMessages(list)` | `get_messages` 返回该列表（驱动历史无锚点分支） |
| `emitAgentEvent(event)` | 把事件逐个投递给所有保留的 `onAgentEvent` 回调（`onAgentEvent` 由「丢弃式 no-op」改为保留回调并返回取消函数） |
| 既有 | `setLoadDelay` / `setLoadFailure` / `setLibraryReadDelay` / `relativeDocPath` / `setReaderState*` / `readerStateSaveCalls` 全部保持不变 |

#### 7.3.3 fixture 冻结

- `writeFixtures()` 的 `notes.json` 改为 `{ "version": 1, "notes": [] }`（空库，保住场景 B 的笔记空态）。
- `seedNotes()` 增加第 4 条（字段逐字冻结，供 N39 验收 3 的排序与徽标断言）：

```js
{
  id: "n-current-3",
  kind: "answer",
  docPath: "sample-paper.pdf",
  page: 2,
  text: "结论：稀疏注意力在三分之一的预算下保持召回，位置先验是关键。",
  comment: "由一次提问总结",
  createdAt: now - 1 * MINUTE,   // 晚于 n-current-2（now - 2*MINUTE）⇒ 同页排在其后
  updatedAt: now - 1 * MINUTE,
}
```

- 其余 fixture（样例 PDF 3 页、`archive/older-paper.pdf` 2 页、`reading-notes.md`、A/B 两工作区）保持不变。

### 7.4 离屏场景与断言

#### 7.4.1 驱动原语（新增，供 hover 与 composer）

```js
/**
 * 真 hover：movePointer 驱动 → 等过渡 → 返回 opacity；同时断言落点确在该元素内。
 * index 默认 -1：一个会话里可能有多个回答块，默认取最后一个（本轮新块），避免取到旧块。
 */
const moveMouse = async (selector, index = -1) => { ... elementFromPoint 校验 + movePointer(x, y) + sleep(250) ... };
/** 指针移动：CDP 优先、sendInputEvent 兜底（判定顺序见下）；坐标一律 CSS px、窗口内容坐标。 */
const movePointer = async (x, y) => { ... debugger.attach("1.3") → Input.dispatchMouseEvent({type:"mouseMoved"}) → 失败回落 sendInputEvent({type:"mouseMove"}) ... };
/** 中性落点：读 hover-before 之前把指针移出动作区（.chat-header 中心；拿不到时取内容区 (8,8)）。 */
const moveNeutral = async () => { ... };
/** 同理：clickLast(selector, index = -1)。 */
/** composer 驱动：原生 setter 写值 + 派发 input → 等 .composer-send 可点 → click。 */
const typeAndSend = async (text) => { ... };
/** 事件序列注入：window.__pixStub.emitAgentEvent(event)（逐个 await，事件之间 waitFor 状态）。 */
const emit = (event) => js(`window.__pixStub.emitAgentEvent(${JSON.stringify(event)}), true`);
```

- `moveMouse` 的落点判定：`document.elementFromPoint(cx, cy)` 必须落在目标元素内，否则 `throw`（防「拍到别的元素」的假阳性）；坐标取该块 `.answer-save-wrap` 的 rect 中心（动作区所在行），拿不到时回落块内 `.agent-markdown` 首行的中心。
- 所有针对回答块的原语（`moveMouse` / `clickLast` / 读 `title`）一律带 `index = -1` 语义：**取最后一个回答块**；需要指定某一轮时用正索引。
- 发送文本一律来自场景内的局部常量（`const TURN1_TEXT = "这篇论文的结论是什么？"` 等），`typeAndSend(TURN1_TEXT)` 与 `emit(message_start, { displayText: TURN1_TEXT })` 用**同一个常量**，保证确认命中可判。
- **hover 驱动判定顺序（写死，must-fix 8）**：
  1. **CDP（首选）**：首次调用 `if (!win.webContents.debugger.isAttached()) win.webContents.debugger.attach("1.3")`，之后复用同一次 attach（不 per-call detach）；`await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", clickCount: 0, modifiers: [] })`。CDP 走浏览器输入管线，`:hover` 必然更新。
  2. **`sendInputEvent`（兜底）**：CDP 抛错，或 CDP 返回后 250ms 读到的 `opacity` 仍为 `"0"`，则 `win.webContents.sendInputEvent({ type: "mouseMove", x, y })`，再等 250ms 复读。
  3. **`forced`（最后手段）**：两级驱动都拿不到 `opacity === "1"` 才走 §7.4.2 文末的强制显影降级。
  - 每次 `moveMouse` 的返回值与落盘数据都带 `hoverDriver: "cdp" | "sendInputEvent" | "forced"`；失败时附 `cdpError` / `sendInputError`（`String(err).slice(0, 200)`），用来区分「驱动不生效」与「CSS 没写」。

#### 7.4.2 场景与断言（`30-*` / `31-*` / `32-*` / `33-*` / `34-*` 为需求冻结名；35/36 为本档新增）

**挂载位置与前置（写死，对应 must-fix 1/4/6）**

1. **挂载位置**：30–36 全部追加在 `runReaderStateScenarios` 函数**末尾**（R6 场景 24/24b 之后、该函数收尾 `}` 之前）。理由：`record` / `removeState` / `waitPage` / `goHome` / `enterWorkspace` / `openRow` / `clickNext` / `openNotesTab` / `clickNoteInGroup` / `clickNoteRowAtPage` 只在该函数作用域内（`ui-shot.mjs:939-1120`），`runScenario`（00–11）里没有这些原语；在函数外另起一套会引入第二份口径。
2. **`clearStateA()`（现场状态前置）**：凡「树行打开后必须从第 1 页起算」的场景（30、33、35），一律 `goHome()` → **`clearStateA()`** → `enterWorkspace(LIBRARY_NAME)`。理由：树行打开走 `openDocumentFromLibrary` → `readerStateStore.requestRestoreFor`（`WorkspacePage.vue:190-193` → `renderer/stores/reader-state-store.ts:188`），而 R6 段末 A 库 `sample-paper.pdf` = 第 2 页（`ui-shot.mjs:1576-1594` 的 goHome flush 断言）⇒ 不清状态文件时 `waitPage(1,3)` 必然超时。`clearStateA()` = `removeState(STATE_FILE_A)`（R6 既有原语）；`js("window.__pixStub.setReaderState(null)")`（`ui-shot.mjs:587-596`）是等价的 rmSync，但它按 `activeRoot` 取路径（`ui-shot.mjs:308/318-320`，`activeRoot` 由 `startSession` 改写，`ui-shot.mjs:440`）⇒ 首选 fs 级常量路径。
3. **历史注入的进入与清除**：33 在 `goHome()` **之前** `setMessages([...])` 造历史；35 开头 `setMessages([])`——否则 33 注入的历史会在 `goHome` 后重进工作区时被 `loadMessages` 重新装载（`WorkspacePage.vue:66` 的 `displayBlocks.length === 0` 门控 + `:106` 的事件订阅），35 会多 1 条无锚点历史用户块。35 的用户块断言写成「进入场景时的用户块基线 + 3」，基线在 `enterWorkspace` 之后、任何发送之前采样（本序列为 0）。
4. **资源顺序**：36 末段的 `rmSync(<OUT_ROOT>/library/archive/older-paper.pdf)` 是该文件的**最后一次使用**——30–36 中所有打开或断言该文件的步骤（30 打开它、31c/33 的锚点文案）都在 rmSync 之前；30 段之后不得再新增使用该文件的场景。既有 22c/22d/22e（`ui-shot.mjs:1429/1492/1507`）在本函数中位于 30 段之前，不受影响。
5. **反馈期不得点击**：`.answer-save-btn` 与 `.answer-note-feedback` 由 `v-if/v-else` 互斥（§4.2）⇒ 任何「同一块第二次点击」必须先 `waitFor` 按钮回位（最后一个回答块内 `.answer-save-btn` 存在，且全局 `.answer-note-feedback` 数量为 0；`ANSWER_FEEDBACK_MS = 2500`）。`waitFor` 默认上限 20s 足够，**不得** `querySelector` 后立刻 `click`。

| 场景（截图） | 驱动序列 | 断言（`MEASUREMENTS` label） |
| --- | --- | --- |
| **30 情形 (a)（`30-answer-save-btn.png`、`30b-answer-streaming.png`）** | `goHome` → `clearStateA()`（前置 no.2）→ 进 A → `waitTreeRows(4)` → 树行开 `sample-paper.pdf` → `waitPage(1,3)` → `clickNext` → `waitPage(2,3)` → 记用户块基线 → `typeAndSend(TURN1_TEXT)` → `emit(message_start user, displayText=TURN1_TEXT, content=TURN1_TEXT, timestamp)` → `emit(agent_start)` → `emit(message_start assistant, content="结论：")` → `emit(message_update assistant, content=ANSWER1_TEXT)`（场景内常量：标题 + 列表 + ```python 代码块，且含唯一可定位子串 `def sparse_attention`，供场景 32 的行定位） → **截图 `30b`** → `emit(message_end assistant)` → `emit(agent_end)` | `answer-save`：`{phase:"streaming", btnCount:0}`（`30b` 之前）；`{phase:"idle", btnCount:1}`；`{phase:"hover-before", wrapOpacity:"0", hoverDriver}`（读之前先 `moveNeutral()`，否则读到的是上一次的 hover 态）；`{phase:"hover", wrapOpacity:"1", copyBtnCount:1, saveBtnCount:1, overlap:false, title:"存为笔记 · sample-paper.pdf 第 2 页"}`（`title` 用 `includes` 判 basename 与「第 2 页」；文件名口径 = `answerDocName` = 最后一个分隔符之后，30/31b/33 的同类断言一律只用 basename，must-fix 2）；用户块数量 = 基线 + 1（确认命中 ⇒ 未新增无锚点块）；随后 `clickNext → waitPage(3,3)`：`title` 仍含「第 2 页」；再开 `archive/older-paper.pdf` → `waitPage(1,2)`：`title` 仍含 `sample-paper.pdf` + 「第 2 页」（N36 验收 4/5） |
| **31 保存成功（`31-answer-save-ok.png`）** | 沿用 30 的状态（当前文档 = older-paper）→ `moveMouse(".agent-message")` → `click(".answer-save-btn")` → `waitFor(".answer-note-feedback[data-state=ok]")` | `answer-anchor`：`calls.count === 1`、`lastPayload = {docFilePath: 以 sample-paper.pdf 结尾, page: 2, kind: "answer"}`；fixture 文件内存在 `{docPath:"sample-paper.pdf", page:2, kind:"answer"}` 且其 `text` `includes("\`\`\`python")` 且**不含** `<div` / `<p>` / `class=`（N36 验收 8 的口径）；`answer-feedback`：`{state:"ok", text.includes("已存为笔记")&&includes("第 2 页")}`；左栏 tab 文案 === `笔记 <fixture 内条数>`（`applyNotes` 覆盖后计数 +1，DOM 断言 `.pill-tab[data-tab="notes"]` 的文本） |
| **31b 重复（`31b-answer-save-duplicate.png`）** | **先等反馈过期**（前置 no.5）：`waitFor` 最后一个回答块内 `.answer-save-btn` 回位且全局 `.answer-note-feedback` 数量为 0（`ANSWER_FEEDBACK_MS = 2500`）→ 同块再次 `moveMouse` → `clickLast` → `waitFor("[data-state=duplicate]")` | `answer-feedback`：`{state:"duplicate", textIncludes:"已在笔记中", countDelta:0}`；fixture 文件字节哈希与 31 之后一致（零写入） |
| **31b2 在途连点（无独立截图，复用 31b 的 DOM 取证）** | **新起一轮短回答**（`typeAndSend(TURN2_TEXT)` → `emit(message_start user, displayText=TURN2_TEXT)` → `emit(agent_start)` → `emit(message_start/update assistant, content="第二轮回答")` → `emit(message_end assistant)` → `emit(agent_end)`）→ `setNotesAddDelay(600)` → `js("(() => { const b = document.querySelectorAll('.answer-save-btn'); const t = b[b.length - 1]; t.click(); t.click(); return true; })()")`（两次点击在**同一同步段**内，第二次落在第一次的 await 在途窗口）→ `waitFor(".answer-note-feedback")` → `setNotesAddDelay(0)` | `answer-save`：`{phase:"reentrant", delta:1}`（`notesAddCalls().count` 相对基线只 +1，must-fix 8）；反馈只出现一次；该轮锚点 = 发送时刻的当前文档（`archive/older-paper.pdf` 第 1 页）⇒ `lastPayload = {docFilePath 以 older-paper.pdf 结尾, page: 1, kind: "answer", text: "第二轮回答"}`；fixture 文件新增该条（场景 32 的 answer 计数按文件自洽） |
| **31c 超长（`31c-answer-save-too-long.png`）** | `typeAndSend(TURN3_TEXT)` → `emit(message_start user, displayText=TURN3_TEXT)` → `emit(agent_start)` → `emit(message_start/update assistant, content="长".repeat(4001))` → `emit(message_end assistant)` → `emit(agent_end)` → `moveMouse` 最后一个回答块 → `clickLast` → **末段（N38 验收 5 / N36 验收 11 的离屏半条，must-fix 7）**：`typeAndSend(TURN4_TEXT)` → `emit(message_start user, displayText=TURN4_TEXT)` → `emit(agent_start)` → `emit(message_start/update assistant, content="   ")` → `emit(message_end assistant)` → `emit(agent_end)` | `answer-save`：`{phase:"turn-3", title 含 "older-paper.pdf" 与 "第 1 页"}`（文件名字面量用 basename：§3/§1.5 的 `answerDocName` 取最后一个分隔符之后，`archive/older-paper.pdf` 永不成立，must-fix 2）（本轮锚点；若锚点被实现成「全局最近一次快照」，此处会显示 `sample-paper.pdf 第 2 页` ⇒ 失败；**跳块规则的判别在场景 35**）；`answer-feedback`：`{state:"error", textIncludes:"保存失败：回答过长（超过 4000 字），无法存为笔记", bytesUnchanged:true, calls:1}`；`answer-save`：`{phase:"blank-content", saveBtnCount:0, lastBlockSaveWrapCount:0, lastBlockTextTrim:""}`（空白回答不渲染按钮：§5 第 4 行 + N36 验收 11；定位用「最后一个 `.agent-message`」，其 `.agent-markdown` 的 `textContent.trim()` 为空） |
| **32 徽标与排序（`32-answer-note-badge.png`、`32b-answer-note-badge-left-pane.png`）+ answer 行等价断言（must-fix 5/7）** | 切左栏 `笔记` tab → `waitFor(".note-row")` → 截全景 + `rectOf(".layout-left",2)` 裁左栏 → **(a) 备注**：定位「31 新写入的 answer 行」（`sample-paper.pdf` 组内 `.note-text` 含 `def sparse_attention` 的行）→ 点 `.comment-trigger` → 等 `.note-comment textarea` → 原生 setter 写 `由回答入库` + 派发 `input` → 点 `.comment-actions` 内文本含「保存」的按钮 → **(b) 删除二次确认**：定位「31b2 新写入的 answer 行」（`archive/older-paper.pdf` 组内 `.note-text` 文本 `=== "第二轮回答"` 的行）→ 记 fixture 条数基线 → 点 `.note-delete` → 再点 `.note-delete` → **(c) 跳回原文**：点 (a) 的行（跳转后停在 sample-paper.pdf 第 2 页） | `answer-notes-list`：`badgeCount === readNotesFile().notes.filter(n => n.kind === "answer").length`（≥2）、`badgeTexts` 全为 `"AI"`；**第 2 页子序列**：在 `sample-paper.pdf` 组内先按 `.note-page-badge` 文本 `=== "第 2 页"` 过滤出各行，再把 `.note-text` 反查 fixture 文件的 `id`，断言 `n-current-2`（excerpt，无徽标）**出现在** `n-current-3`（answer，有徽标）之前（子序列，不断言全等——同页还有 31 写入的 answer 行）；`excerptRowHasNoBadge: true`；`headOverflow`：该组每行 `.note-head` 的 `scrollWidth <= clientWidth`；`answer-note-row`（新增，must-fix 7）：`{phase:"comment", domComment:"由回答入库", fileComment:"由回答入库"}`、`{phase:"delete-confirm", confirming:true, rowsDelta:-1, fileDelta:-1, badgeCountEqFile:true}`、`{phase:"jump", pageLabel:"第 2 / 3 页"}` |
| **33 情形 (b)（`33-answer-history-fallback.png`）** | `setMessages([{role:"user",content:"这篇论文的结论是什么？",timestamp:now-60s},{role:"assistant",content:[{type:"text",text:"结论：稀疏注意力在 1/3 预算下保持召回。"}],timestamp:now-50s}])` → `goHome()` → `clearStateA()`（前置 no.2）→ 进 A（历史重载）→ `waitTreeRows(4)` → 树行开 `sample-paper.pdf` → `waitPage(1,3)` → `clickNext` → `waitPage(2,3)` → `clickNext` → `waitPage(3,3)` → `moveMouse` 最后一个回答块 → `clickLast` | `answer-save`：`{phase:"fallback", title 含「（按当前阅读位置）」、basename `sample-paper.pdf` 与「第 3 页」}`；`answer-anchor`：`lastPayload.page === 3`；fixture 文件内出现 `{docPath:"sample-paper.pdf", page:3, kind:"answer"}` |
| **34 情形 (c)（`34-answer-save-disabled.png`）** | `goHome()` → 进 A（**不打开任何文档**）→ `moveMouse(".agent-message")` → 读属性 → `js("document.querySelector('.answer-save-btn').click(), true")` | `answer-save`：`{phase:"disabled", disabled:true, title.includes("无法存为笔记"), title.includes("当前没有打开文档"), deltaAfterClick:0}`（点击不产生 IPC） |
| **35 锚点不跨轮（`35-answer-anchor-strict.png`）**〔新增，must-fix 1 的判别〕 | `setMessages([])`（前置 no.3，清掉 33 注入的历史）→ `goHome` → `clearStateA()`（前置 no.2）→ 进 A → `waitTreeRows(4)` → 开 `sample-paper.pdf` → `waitPage(1,3)` → `typeAndSend("第一次提问")` → `emit(message_start user, displayText="第一次提问")`（命中）→ `emit(agent_start)` → `emit(message_start/update assistant, content="第一轮回答")` → `emit(message_end assistant)` → `emit(agent_end)`（此时该回答块有锚点：sample-paper 第 1 页）→ **再发一轮且让确认不匹配**：`typeAndSend("第二次提问")` → `emit(message_start user, displayText="<reading_context>\\n…\\n第二次提问")`（与乐观文本**不同** ⇒ 不命中，追加无锚点用户块）→ `emit(agent_start)` → `emit(message_start/update assistant, content="第二轮回答")` → `emit(message_end assistant)` → `emit(agent_end)` → `clickNext` → `waitPage(2,3)` | `answer-save`：`{phase:"strict", title 含「（按当前阅读位置）」且含「第 2 页」, titleNotIncludes:"第 1 页"}`（若实现写成「向前最近一个带锚点的用户块」，此处会显示「第 1 页」且无回退后缀 ⇒ 直接失败）；`userBlocks: 基线 + 3`（乐观 + 无锚点确认 + 第 1 轮的用户块；基线在进工作区后采样，本序列为 0） |
| **36 失败注入（`36-answer-save-failure.png`）**〔新增，must-fix 6〕 | 以 35 结束态为靶（**先确认靶子**：`moveMouse` 最后一个回答块，读到的 `title` 必须含「（按当前阅读位置）」与「第 2 页」——即 35 的第二轮回答块，无锚点 ⇒ 走 (b)；不是该块则直接 `throw`，must-fix 4）：`setNotesAddFailure("outside")` → `moveMouse` + `clickLast` → `waitFor("[data-state=error]")` → 断言 → `waitFor` 按钮回位（前置 no.5）→ `setNotesAddFailure("corrupt")` → 再点 → 断言 → 同样等回位 → `setNotesAddFailure("throw")` → 再点 → 断言 → 同样等回位 → `setNotesAddFailure(null)` → **再点一次**（必须回到 `ok`：按钮回可点）→ **末段**：树行开 `archive/older-paper.pdf` → `waitPage(1,2)` → `typeAndSend("第三次提问")` → `emit(message_start user, displayText="第三次提问")` → `emit(agent_start)` → `emit(message_start/update assistant, content="第三轮回答")` → `emit(message_end assistant)` → `emit(agent_end)` → `rmSync(<OUT_ROOT>/library/archive/older-paper.pdf)`（前置 no.4：该文件的最后一次使用）→ `moveMouse` + `clickLast` | `answer-feedback` 三条：`{state:"error", text:"保存失败：该文档不在当前资料库内", callsDelta:1, bytesUnchanged:true}`、`{state:"error", text:"保存失败：笔记文件无法读取（文件已损坏，未被修改）"}`、`{state:"error", text:"保存失败：主进程调用异常：<message>"}`；随后 `{state:"ok", text.includes("已存为笔记")}`（按钮回可点）；末段：文件已删但锚点仍在库内 ⇒ `{state:"ok"}` 且 fixture 文件新增该条（§5 第 3 行） |

顺序耦合声明：场景 32 的徽标计数依赖 31/31b2 的写盘结果（因此断言取「与文件内 answer 条数相等」的自洽形式，不写死绝对数）；场景 31c/35/36 各自新起对话轮次，互不依赖彼此的锚点。**每轮事件序列一律以 `emit(message_end assistant)` + `emit(agent_end)` 收尾**：`isStreaming` 只在 `agent_end` 复位（`stores/session-store.ts:416-423`），而 `.composer-send` 是 `v-if="!isStreaming"`（`ChatPanel.vue:873`）⇒ 缺 `agent_end` 会让下一轮的 `typeAndSend` 找不到发送按钮。

**降级理由（若某 UI 在 stub 下无法构造）**：
- `no-root` 在离屏面无独立场景（stub 恒有 `CONFIG.root`），改为 `setNotesAddFailure("no-root")` 注入（可断言文案），**不与场景 36 合并**的理由是它属于次级项（评审 §3.3），本档把它并入 36 的可选第 5 步。
- hover 只有在 **CDP 与 `sendInputEvent` 两条路径都拿不到 `opacity === "1"`** 时才降级（判定顺序见 §7.4.1，must-fix 8），且**只降级 hover 的截图与 opacity 断言**：保留 `.answer-save-wrap` 存在性、`title`、rect 不重叠、`opacity === "0"`（未 hover 隐藏）四项 DOM 断言，截图改为临时内联 `opacity = "1"` 强制显影，并在 `MEASUREMENTS` 里记 `hoverDriver: "forced"`；走查项补一条 `.agent-message:hover .answer-save-wrap { opacity: 1 }` 规则存在。**不得**因此删掉 N36 验收 2 的 `title` 断言。
- 「锚点文档已被删除后点击笔记跳回」的 UI 表现属既有 ReaderPanel 失败态，仅走查（不新增离屏场景）。

### 7.5 代码级核对点（只读命令）

| # | 判定 | 命令 | 期望 |
| --- | --- | --- | --- |
| 1 | 调用点唯一 | `grep -rn "\.addNote(" pix/src/renderer` | 恰好 2 个调用点：`PdfSelectionQuickAsk.vue`（`kind: "excerpt"`）、`ChatPanel.vue`（`kind: "answer"`）；无第三处、无默认值兜底（命令带前导点号，避开设定义与 store 导出对象里的 `addNote,`） |
| 2 | 快照点唯一、与实参同源 | 先取区间：`sed -n '/^async function send(/,/^}$/p' pix/src/renderer/components/workspace/ChatPanel.vue`（记为 `$S`），再在 `$S` 上跑 4 条 grep：`grep -c 'readerStore\.filePath'`、`grep -c 'readerStore\.page[^C]'`、`grep -c 'filePath: readFilePath'`、`grep -c 'page: readPage'` | 四条均为 `1`。（**诚实标注**：「区间内各读一次」在改前的代码上也是 `1+1`（`ChatPanel.vue:306-309` 本就各读一次），因此前两条单独不具判别力；后两条（`<reading_context>` 实参取的是与锚点同一对局部量）才是 must-fix 5 的判别条件——若实现把 `buildReadingUserMessage` 的实参写成 `filePath: readerStore.filePath`，后两条命中为 `0` ⇒ 失败） |
| 3 | 锚点唯一赋值 | `grep -n "readingAnchor" pix/src/renderer/stores/session-store.ts` | 赋值只落在 `appendOptimisticUserMessage` 内；`appendUserOrNoteMessage` / `loadMessages` 区间内 0 命中 |
| 4 | 解析规则不跳块 | `sed -n '/function readingAnchorFor/,/^  }$/p' pix/src/renderer/stores/session-store.ts` | 循环内 `if (block.type !== "user-message") continue;` 紧随 `return block.readingAnchor ?? null;`，无第二次 continue / 无嵌套扫描 |
| 5 | 第三参已接线 | `grep -n "appendOptimisticUserMessage(" pix/src/renderer` | 2 命中：定义（3 参）+ ChatPanel 调用（3 实参） |
| 6 | kind 进数据面 | `grep -n "kind: \"excerpt\"\|draft.kind\|ANSWER_TOO_LONG_MESSAGE" pix/src/main/notes-store.ts` | `kind: "excerpt"` **0 命中**；`draft.kind` 见校验、构造、去重三处；answer 文案只在独立常量里 |
| 7 | 码表零改动 | `git diff pix/src/main/notes-store.ts` | 不含 `ERROR_MESSAGES` 的键增删、不含 `isReaderNote` / `parseNotesFile` / `writeFileAtomic` / `resetCorruptNotes` 的改动 |
| 8 | 通道数量不变 | `grep -c 'ipcMain.handle("notes' pix/src/main/ipc-handlers.ts` | `6` |
| 9 | preload 零改动 | `git diff --name-only` | 不含 `pix/src/main/preload.ts` |
| 10 | 越界与红线 | `git diff --stat` | 只含 §4 白名单文件；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置 0 改动 |
| 11 | 无 any / 无内联动态导入 | `grep -rn ": any\|as any\|await import(\|import(" pix/src/shared/types.ts pix/src/main/notes-store.ts pix/src/renderer/stores/session-store.ts pix/src/renderer/components/workspace/ChatPanel.vue` | 0 命中 |
| 12 | 复制按钮零改动 | `git diff pix/src/renderer/components/workspace/ChatPanel.vue` | `.message-copy-btn` 的模板行、类名与 CSS 块逐字未动（新容器只新增） |
| 13 | 徽标唯一消费点 | `grep -rn "note-ai-badge" pix/src/renderer` | 只命中 `NotesPanel.vue`（模板 + 样式） |
| 14 | 面板与工具链零改动 | `git diff --stat pix/src/renderer/stores/notes-store.ts pix/src/renderer/utils/notes-path.ts pix/src/renderer/pages/WorkspacePage.vue pix/src/main/reading-prompt.ts` | 空（四文件均不在 diff） |
| 15 | 摘录链路一行 | `git diff pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 只有 `kind: "excerpt"` 一行语义改动 |

---

## 8. 开发分工（白名单，两侧文件不得重叠）

**A 面（契约与数据面）**
- `pix/src/shared/types.ts`
- `pix/src/main/notes-store.ts`
- `pix/src/main/ipc-handlers.ts`

交付定义：§1.1–§1.3 全部契约按字面落地（含 `addNote` 的判定顺序与 `too-long` 文案分叉）；§7.2 烟测 14 组全绿（含 4000/4001 边界、两类 kind 并存、字节与 mtime 不变、导出模板逐行）；`npm run check` 0 error。

**B 面（UI 与会话面）**
- `pix/src/renderer/stores/session-store.ts`
- `pix/src/renderer/components/workspace/ChatPanel.vue`
- `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`
- `pix/src/renderer/components/workspace/NotesPanel.vue`
- `pix/scripts/ui-shot.mjs`

交付定义：§1.5/§1.6/§2/§3/§5 全部机制落地（含 `pending` 守卫与 2500ms 反馈）；§7.3 stub 与 fixture 冻结、§7.4 全部场景与断言自测通过（脚本内 `throw`、退出码 0、`MANIFEST.failure === null`）；既有 00–11 与 20–24 不回归；`npm run check` 0 error。

接口约定：两侧只通过 §1.1 的类型与 §1.2 的通道交接，**名字以本档为准**；B 的编译前置是 A 的 `shared/types.ts`（`ReadingAnchor` + `readingAnchor?` + `kind` 必填），A 必须先合入类型面；A 不改 B 的文件，B 不改 A 的文件；`ui-shot.mjs` 的 stub 语义由 B 按 §7.3 实现（只需覆盖可判定的子集：真读真写、去重键含 kind、失败注入、调用计数、事件投递）。

开发档自评清单（两侧共同，逐条写进开发档）：
1. `too-long` 的两条文案逐字（answer/excerpt）与「不给 `ERROR_MESSAGES` 加键」的判定结果（§7.5 no.6/7）。
2. `send()` 的快照点判定（§7.5 no.2）：四条 grep 均为 1，并注明「前两条在改前也是 1」这一事实。
3 「锚点文档已被删除 ⇒ 保存成功」是既有事实（`library-root.ts:38-52` 只做前缀归属），本轮不改行为，只写进 §5；负责人确认这是期望语义。
4. 确认不匹配时锚点归属 = 无锚点（(b)/(c)），由场景 35 判别；若实现写成「向前找最近带锚点的用户块」，场景 35 必须失败。
5. stub 与主进程的已知差异：`readNotesFile` 解析失败按空数组降级（主进程判 `corrupt`）；`notesAdd` 不做 tmp+rename（原子性由 A 面烟测覆盖）。
6. 「回答入库是归一化单行文本」这一既有形态（需求 §0.1）不在本轮改变；代码块/标题的换行与缩进不保留。

---

## 9. 需求回退建议（本档已按建议口径落地，需求档若不同意请回改需求）

1. **N37 验收 1 的字面判据不可满足**（`ChatPanel.vue:306-309` 的 `buildReadingUserMessage` 实参本就读取 `readerStore` 四项）→ 建议改写为 §0 修订 3 的形式（各读一次 + 同源 + 不受 chip 排除分支约束），否则实现者只能靠改 `reading-context.ts` 来"达标"，而那是红线（不变量 5）。
2. **N36 验收 9 的 `outside` 造不出**（`isLibraryFilePath` 只校验前缀归属、`realpathSync` 失败被吞）→ 建议按 §0 修订 3 改写为注入式断言，并**另立一条**「锚点文档已被删除 ⇒ 保存成功」（与实现事实一致；若要改成失败，需要主进程增加存在性校验，那会给 `addNote` 引入 IO 语义，超出本轮）。
3. **N36 验收 8 的证据口径**（【走查】无法"构造含代码块的回答"）→ 建议归入【离屏】场景 31 的 `answer-anchor` 断言组（`text` 保留 ``` 围栏、不含渲染产物特征串），本档已如此落地。
4. **N36 验收 2 的 hover 判据** → 建议把「hover 后同时出现两个动作」明确为「`moveMouse` 驱动（CDP 首选、`sendInputEvent` 兜底）+ `opacity` 断言 + 截图」，并接受 §7.4.2 末尾的降级路径（仅在两级驱动都失效时触发）。
5. **N38 验收 8 只覆盖反馈期** → 建议补一句「反馈期不渲染按钮 + 在途窗口由 `pending` 守卫拦截」，并接受新增控制口 `setNotesAddDelay(ms)`（需求 N41 冻结的控制口列表里没有它）。
6. **N39 验收 3 的「断言两条 id 顺序」** 需要 DOM 钩子（`.note-row` 无 `data-note-id`）→ 本档选择**不加钩子**：断言「组内 `.note-text` 顺序」并在脚本侧用 fixture JSON 反查 id。若要求直接断言 id，需要给 `NotesPanel` 的 `.note-row` 增 `data-note-id`，那会越出 N39 的「只加徽标」范围。
7. **N41 验收 4 冻结 9 张截图** → 本档新增 `35-answer-anchor-strict`、`36-answer-save-failure` 两张（must-fix 1/6 的判别证据）；若负责人不接受截图数变化，可将两场景降为「无独立截图的断言组」（仍保留 `throw`）。
8. **场景顺序耦合**：场景 32 的徽标计数与场景 31/31c 的写盘结果相关 → 本档把断言写成「与 fixture 文件内 answer 条数相等」的自洽形式；若要求场景独立，需在每个场景前重写 fixture 文件（会拉长总时长）。
9. **`seedNotes()` 增第 4 条种子**会改变既有场景的行数（`>= 3/4` 断言仍成立，已核验），但会让「第 2 页同页三条」这一 N39 验收 8 的前提在 31c 之后变成 4 条 → 本档断言一律用「相对顺序 + 计数与文件一致」，不写死行数。
10. **N37 验收 4 的字面规则与 §2.5 相反**（对应设计评审 §3.2）：需求档写「向前最近一个带锚点的用户块」，本档 §2.5 写死「遇第一个 `user-message` 即终止，无锚点返回 null」，并由场景 35 判别 → 建议需求档一并回改，否则实现者可能照需求档写出被场景 35 判死的规则。

---

## 10. 定稿修订（R7）

> 上游：`docs/pm/R7-review.md` 的「设计评审（R7）」§2（must-fix 1–8）。**8 条全部采纳，无「不采纳」项**：能改设计的都改了，没有需要保留原口径再写替代方案的条目。本节只记处置与落点；正文对应处（§2.4、§7.3.1、§7.4.1、§7.4.2、§9）已同步改写，契约（§1）、白名单（§4/§8）、判定工具（§7.1/§7.2/§7.5）不变，代码面无需返工。

| # | must-fix（评审原文要点） | 处置 | 正文落点 |
| --- | --- | --- | --- |
| 1 | 场景 30/33 缺 R6 现场状态前置 ⇒ `waitPage(1,3)` 必超时 | 采纳，并升格为通用前置规则 | §7.4.2 前置 no.2 + 场景 30/33/35 的驱动序列 |
| 2 | 31c 的 `title 含 "archive/older-paper.pdf"` 与 §3/§1.5 的 basename 口径冲突 | 采纳：改 basename，并逐条核对 30/31b/33 | 场景 31c 断言 + 场景 30 的 title 口径注 + 场景 33 补 basename 断言 |
| 3 | 31b 在反馈仍显示时点按钮 ⇒ `querySelector` 为 null | 采纳：先等按钮回位再点 | §7.4.2 前置 no.5 + 场景 31b/36 |
| 4 | 35/36 未清 33/34 注入的 `setMessages` ⇒ 多 1 条无锚点历史块 | 采纳：35 开头 `setMessages([])`，断言写成「基线 + 3」 | §7.4.2 前置 no.3 + 场景 35（36 另加靶子确认步） |
| 5 | 32 的 `[n-current-2, n-current-3]` 顺序断言不成立 | 采纳：按 `.note-page-badge` 过滤第 2 页行 + 子序列断言 | 场景 32 断言 |
| 6 | 新场景挂载位置与资源顺序未写死；36 的 `rmSync` 会击穿既有用例 | 采纳：写死挂载位置与 `older-paper.pdf` 的最后一次使用 | §7.4.2 前置 no.1/no.4 |
| 7 | 两处证据缺口（answer 行等价断言 / 空内容不渲染按钮） | 采纳：场景 32 增 (a)(b)(c) 三步；31c 末段增空白回答轮 | 场景 32、场景 31c |
| 8 | hover 驱动无实证，降级会丢掉 N36 验收 2 的离屏证据 | 采纳：CDP 首选、`sendInputEvent` 兜底，判定顺序写死 | §7.4.1 + §7.4.2 降级理由 |

### 10.1 逐条处置细目

1. **现场状态前置（must-fix 1）** — 采纳，且不写成「30/33 的局部补丁」，而写成一条通用前置：凡「树行打开后必须从第 1 页起算」的场景，一律 `goHome()` → `clearStateA()` → `enterWorkspace(LIBRARY_NAME)`；35 的第一轮也吃这条规则。事实依据：`openDocumentFromLibrary` 对树行打开也调 `requestRestoreFor`（`WorkspacePage.vue:190-193` → `renderer/stores/reader-state-store.ts:188`），R6 段末 A 库 `sample-paper.pdf` = 第 2 页（`ui-shot.mjs:1576-1594` 的 goHome flush 断言）。评审给的两个选项里**选 `removeState(STATE_FILE_A)`**：它是 fs 级常量路径，不依赖 stub 的 `activeRoot`（`ui-shot.mjs:308/318-320`，由 `startSession` 改写，`ui-shot.mjs:440`）；`__pixStub.setReaderState(null)`（`ui-shot.mjs:587-596`）是等价的 rmSync，作为替代保留。
2. **basename 口径（must-fix 2）** — 采纳。31c 的字面量改为 `older-paper.pdf` + 「第 1 页」（断言用 `includes`，因此不再要求 `archive/` 前缀）。逐条核对同类断言：30 用 `sample-paper.pdf`（basename，已合规）；31b 只断言反馈文本「已在笔记中」（无文件名，无需改）；33 原只断言「（按当前阅读位置）」与「第 3 页」——**本轮补上 basename `sample-paper.pdf`** 以消除口径盲区。31/31b2 的 `lastPayload.docFilePath` 是绝对路径，用「以 `<basename>` 结尾」判，与 §3 的展示口径不冲突。
3. **反馈期再点（must-fix 3）** — 采纳。不写 `sleep(2700)` 这类固定等待，而是 `waitFor`：最后一个回答块内 `.answer-save-btn` 回位，且全局 `.answer-note-feedback` 数量为 0（`ANSWER_FEEDBACK_MS = 2500`；`waitFor` 默认上限 20s 足够）。同一规则适用于 31b 与 36 的三次失败注入后的重试。
4. **历史注入的清除（must-fix 4）** — 采纳 `setMessages([])`（35 开头、`goHome` 之前），并把 `userBlocks` 断言写成「进入场景时的用户块基线 + 3」（基线在 `enterWorkspace` 之后、任何发送之前采样，本序列为 0）。依据：`goHome` 后重进工作区满足 `displayBlocks.length === 0` ⇒ `loadMessages`（`WorkspacePage.vue:66` 门控 + `:106` 订阅），33 注入的 2 条历史会被重新装载。36 的靶子另加一步显式确认（`moveMouse` 读到的 `title` 必须含「（按当前阅读位置）」与「第 2 页」，否则 `throw`）。
5. **32 的顺序断言（must-fix 5）** — 采纳「先过滤再断言」：在 `sample-paper.pdf` 组内先按 `.note-page-badge` 文本 `=== "第 2 页"` 过滤出各行，再把 `.note-text` 反查 fixture 文件的 `id`，断言 `n-current-2` **出现在** `n-current-3` 之前（**子序列**，不断言全等）。同页除两条种子外还有 31 写入的 answer 行，且 31b2 会在 `archive/older-paper.pdf` 再写一条 ⇒ 徽标数沿用「= 文件内 `kind === "answer"` 条数」的自洽口径（不写死绝对数）。`.note-row` 没有 `data-note-id`（§9 no.6 已决定不加钩子）⇒ id 反查走脚本侧 `readNotesFile()`，与既有 05b/22 的取证方式一致；同页行序由 `groupNotesByDocument` 保证（page 升序 → 同页 `createdAt` 升序，`utils/notes-path.ts`）⇒ 对种子 `createdAt`（`now-2min` / `now-1min`）子序列成立。
6. **挂载位置与资源顺序（must-fix 6）** — 采纳。30–36 追加在 `runReaderStateScenarios` 末尾（`ui-shot.mjs:939-1120` 的辅助函数作用域内），`runScenario`（00–11）不动；36 的 `rmSync(older-paper.pdf)` 声明为该文件的最后一次使用，既有 22c/22d/22e（`ui-shot.mjs:1429/1492/1507`）位于其前，不受影响。
7. **两处证据缺口（must-fix 7）** — 采纳，落法见 §7.4.2：
   - 场景 32 增 (a) 备注（`.comment-trigger` → `.note-comment textarea` → `.comment-actions` 的「保存」）→ 断言 `.comment-text` 与 fixture `comment` 双读一致；(b) 删除二次确认 → 第一次点出 `.note-row.confirming`、第二次点后 `fileDelta:-1` 且徽标数仍与文件自洽；(c) 点行跳回 → `waitPage(2,3)`；等价物是 R6 已覆盖的 excerpt 行行为（`NotesPanel.vue:100-160`）。
   - 31c 末段增一轮「空白回答」（`content="   "`）：`message_end` 后断言 `.answer-save-btn` 数量为 0、最后一个回答块的 `.agent-markdown` 去空白为空 ⇒ N38 验收 5 与 N36 验收 11 的离屏半条有证据。
   - 行定位子串为此冻结：场景 30 的回答文本常量 `ANSWER1_TEXT` 含 `def sparse_attention`（空白归一化后仍保留，故可用于 DOM 与文件两侧定位）。
8. **hover 驱动（must-fix 8）** — 采纳 CDP 首选：`win.webContents.debugger.attach("1.3")` + `Input.dispatchMouseEvent({ type: "mouseMoved" })`（走浏览器输入管线，`:hover` 必然更新），`sendInputEvent({ type: "mouseMove" })` 降为兜底，`forced` 强制显影降为最后手段；判定顺序与失败留痕（`hoverDriver` / `cdpError` / `sendInputError`）写死在 §7.4.1。**不采纳**的是「把 hover 断言整体降为 DOM 断言」：降级只在两级驱动都失败时发生，且不得删掉 N36 验收 2 的 `title` 断言（§7.4.2 降级理由保持）。

### 10.2 同批落地的耦合修正（设计评审 §3 次级项，与上述 8 条同区域）

1. **每轮事件序列以 `message_end assistant` + `agent_end` 收尾**（评审 §3.4 指出 36 末段缺 `message_end`，同类问题在 31b2/31c/35 也缺 `agent_end`）：`isStreaming` 只在 `agent_end` 复位（`stores/session-store.ts:416-423`），而 `.composer-send` 是 `v-if="!isStreaming"`（`ChatPanel.vue:873`）⇒ 缺 `agent_end` 会让下一轮的 `typeAndSend` 找不到发送按钮。已按「`message_start user` → `agent_start` → `message_start/update assistant` → `message_end assistant` → `agent_end`」统一补齐（36 末段同样补 `message_start user` 与 `message_end assistant`）。
2. **`hover-before` 读数前 `moveNeutral()`**（评审 §3.5）：`moveMouse` 之后指针仍停在元素上，同一会话里再读 `opacity` 会读到 hover 态 ⇒ §7.4.1 增 `moveNeutral()`，场景 30 的 `hover-before` 读数前先调用。
3. **`notesExport` 真读**（评审 §3.3）：写穿后内存数组不再是事实源 ⇒ stub 的 `notesExport.count` 改为真读文件（§7.3.1）；导出模板的逐行断言仍由 §7.2 烟测 12/13 覆盖（stub 不生成 `notes.md` 内容）。
4. **`clearSession()` 触发表引用改准**（评审 §3.6）：改为 `goHome`（`WorkspacePage.vue:219`）/ `onNewSession`（`:153`）/ `onSwitchSession`（`:163`）/ `HomePage.openWorkspace`（`HomePage.vue:51`）；`onUnmounted`（`:127`）只 flush + resetState，不是清空点（§2.4）。
5. **§9 增第 10 条**（评审 §3.2）：N37 验收 4 的字面规则与 §2.5 相反，建议需求档一并回改。

### 10.3 判定与自检

- 本节与正文改动都是**文档面**，不新增代码检查项：`npm run check` 与本次修订无关，§7.1 的命令清单不变。
- 修订后 §7.4.2 的每条断言都可在 `ui-shot.mjs` 的既有结构内落地（stub 写穿、控制口、驱动原语、作用域、资源顺序、事件序列均已写死）；must-fix 1–8 的判别点分别落在：现场恢复页（30/33/35 的 `waitPage`）、`title` 文案（30/31c/33/36）、反馈三态与按钮回位（31/31b/31c/36）、在途连点（31b2）、徽标与排序（32）、answer 行等价断言（32）、空白回答（31c）、hover 驱动与 `hoverDriver` 留痕（30）。
- 截图数量不变：仍为 11 张（30/30b/31/31b/31c/32/32b/33/34 + 新增 35/36），符合 N41 验收 6 的「只增不减」。
