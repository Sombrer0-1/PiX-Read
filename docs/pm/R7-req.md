# PiX-Read R7 需求档 · AI 结论入库（N35–N42）

> 上游：`docs/pm/PRD-V0.4.md` §1.2（结论不沉淀＝半截资产）、§2（R7 = 结论入库，依赖 R6）、§3（资产分层：`notes.json` 是**用户资产**，严格校验、损坏绝不覆盖）、§4.2/§4.3（笔记只由用户显式动作产生，不给 agent 写笔记的工具）、§7.2（回答能变成带文档与页码锚点的笔记，能跳回、能备注、能导出，与摘录互不混淆、互不覆盖）。
> 本轮唯一主线：agent 回答可「存为笔记」，落库 `kind = "answer"`；锚点来自**该次提问发送时刻**的阅读上下文快照，而不是点击时刻的当前位置。
> 判定工具（本档所有验收只能由这四种证据判定，逐条已标注）：
> - 【走查】代码审查：只读文件内容与 `git diff`（`git status` / `git diff` / `git show` 只读可用）。
> - 【check】`cd pix && npm run check`（vue-tsc + 主进程 tsc + preload tsc）0 error。
> - 【烟测】主进程数据面离线烟测：沿用 R6 口径，把叶子模块用单文件 `tsc --outDir %TEMP%/… --module commonjs --target es2022 --moduleResolution node --skipLibCheck --strict` 编译到仓库外，用 node 脚本对 `notes.json` / `notes.md` 的**真实字节**断言；脚本跑完删除。
> - 【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + `MEASUREMENTS.json` 的新增断言。
> 本档不写实现代码；契约给出建议字面量与理由，设计档可细化但不得违反「必须」项。

---

## 0. 两个必须直答的问题

### 0.1 回答里含 Markdown 结构时，入库内容与导出内容分别长什么样

**入库**：`text` = 回答的 **Markdown 原文**（不是渲染后的 HTML），经主进程既有唯一归一化点 `notes-store.normalizeNoteText`（`notes-store.ts:84`：连续空白含换行折叠为一个空格、首尾去空白）后写入。**导出**：仍是既有的单行块引用条目，只有标题行多一个 kind 标注。

输入（即 `block.content`，与 `.agent-markdown` 渲染的是同一份原始 markdown）：

~~~
## 结论

- 检索在长文档上受注意力预算约束
- 参见 [[p12]]

```python
for i in range(3):
    print(i)
```
~~~

落库后 `notes.json` 的该条目：

~~~json
{
  "id": "…",
  "kind": "answer",
  "docPath": "sample-paper.pdf",
  "page": 12,
  "text": "## 结论 - 检索在长文档上受注意力预算约束 - 参见 [[p12]] ```python for i in range(3): print(i) ```",
  "comment": "",
  "createdAt": 1757900000000,
  "updatedAt": 1757900000000
}
~~~

导出后 `notes.md` 的该条目（`renderMarkdownEntry` 结构不变，仅标题行加 ` · AI 结论`）：

~~~
### 第 12 页 · AI 结论

> ## 结论 - 检索在长文档上受注意力预算约束 - 参见 [[p12]] ```python for i in range(3): print(i) ```
~~~

即：**标题层级、列表、代码块的换行与缩进都不会保留**；` [[p12]] `、`**加粗**`、代码围栏等**标记字符原样保留**（不做 Markdown 剥离、不做 HTML 渲染）。用户可见结果：笔记面板里是一段连续文本（`.note-text` 本就是默认 `white-space`，多行在面板上也会被折叠），导出里是一行 `> ` 块引用。

**为什么必须与摘录同一形态（不能为 answer 保留换行）**：读侧校验器 `isReaderNote`（`notes-store.ts:117`）要求 `0 < text.length ≤ 4000`，而 `parseNotesFile`（`notes-store.ts`）对**任一条目不合法即判整个文件损坏**。若「按归一化长度判上限、却把保留换行的原文写进文件」，原始长度可以超过 4000 → 下次读取（`loadNotes`）会把整库判成 `corrupt` 并拒绝一切写入，用户唯一的资产被推入错误态。这条路径不可接受，因此：**入库形态 = 归一化形态，上限口径单一口径**。这条决策的反面（保留换行 / 剥离标记 / 存 HTML）已列入 §3 反需求 6。

### 0.2 同一段文字既被摘录、又被存为回答时，库里有几条

**2 条。**去重键在 R7 变为「归一化文档路径 + 页码 + **kind** + 归一化文本」（`duplicateKey`，`notes-store.ts:192`）。两个 draft 的 kind 不同 ⇒ 键不同 ⇒ 两条独立条目，各自 `id` / `createdAt` / `comment` / `updatedAt`。

- 面板：两篇文档分组不变，同页内按 `createdAt` 升序 → 先摘录、后 AI 结论，后者带「AI」徽标。
- 导出：同组两条，一条 `### 第 N 页`、一条 `### 第 N 页 · AI 结论`。
- 反向（不回归）：同 kind、同文档、同页、同归一化文本的第二次保存**不新增条目**，返回既有条目 id（`duplicateOf`），文件字节不变 —— N23 语义原样保留。

这正是 PRD §7.2「与摘录互不混淆、互不覆盖」的可判定形式。

---

## 1. 本轮目标与不变量

目标：把「对话里的结论」变成用户资产的一条通路 —— 回答块上的一个显式动作，落库 `kind = "answer"`，锚点 = 发送时刻的阅读位置，全程可探知（悬浮提示先说清存到哪）、可反馈（成功/重复/失败三态）、可盘点（面板徽标）、可外带（导出标注）。

不变量（违反任一即为回归，设计档必须逐条声明，开发档逐条自评）：

1. **`notes.json` 的严格损坏策略不变**：仍是用户资产 —— 结构校验（含 `kind ∈ {excerpt, answer}`、`text` 非空且 ≤ 4000、`page ≥ 1` 整数）、损坏绝不覆盖、读不改写、写入原子（`mkdir → 写 .tmp → renameSync`）、显式逃生口（`notes-reset` 备份改名）。R7 只**扩展写入的入参维度（kind）与导出标注**，不新增写路径、不新增错误码、不改 `version`。
2. **去重语义只做维度扩展，不做语义重定义**：去重键 = 归一化路径 + 页码 + kind + 归一化文本；同一份只含 excerpt 的输入，其去重命中结果与改动前逐条相同（判定：烟测比对）。重复命中不写盘、不返回新条目（`duplicateOf` 语义不变）。
3. **面板的分组、排序、筛选与错误态不变**：分组键（比较键）、组内排序（`page` 升序 → 同页 `createdAt` 升序；kind **不参与排序**）、当前文档组置顶、「仅看当前文档」、计数文案、删除二次确认（3 秒复位 + capture `pointerdown` 清理）、加载/错误/逃生口状态机，全部零改动；answer 只是多一个徽标。
4. **导出契约不变（仅加 kind 标注）**：`# 阅读笔记 · <资料库名>`、`> 由 PiX-Read 导出生成…共 N 条。`、`## <docPath>（N 条）`、条目间 `---`、条目内 `### 第 N 页` + `> ` 正文 + 可选 `备注：`、末尾换行全部不变；只给 answer 条目的标题行加 ` · AI 结论`；导出只读 `notes.json`（不修改其字节）。只含 excerpt 的库，导出结果与改动前逐行相同。
5. **发送链路不变**：`<reading_context>` 的字段名与顺序、`buildReadingUserMessage` 的入参、chips 的排除行为零改动；锚点快照与该入参**在同一处**构造（同一份 readerStore 读取），不产生第二套来源；不把笔记或锚点注入对话上下文；不改 `reading-prompt.ts` 与 `resources/skills/**`。

---

## 2. 需求明细

### 2.0 契约建议（建议字面量与理由，N35–N42 共用）

**共享类型**（`pix/src/shared/types.ts`；只有两处改动）：

~~~ts
export type ReaderNoteKind = "excerpt" | "answer";   // 既有，不改

/** 渲染层草稿：kind 必填、无默认值（不做向后兼容层，避免"忘了传"被静默写成长文本摘录）。 */
export interface ReaderNoteDraft {
  kind: ReaderNoteKind;     // 新增
  docFilePath: string;      // 不变：绝对路径，相对化与越界拒收在主进程
  page: number;
  text: string;
}

/** 轮次锚点：提问发送时刻的阅读位置快照（绝对路径 + 1-based 页码）。 */
export interface ReadingAnchor {
  docFilePath: string;
  page: number;
}

export type DisplayBlock =
  | { id: string; type: "user-message"; text: string; attachments?: ChatMessageAttachment[]; timestamp: number;
      readingAnchor?: ReadingAnchor }   // 新增可选字段；其余变体零改动
  | …（其余联合成员逐字不动）
~~~

- 锚点挂在**用户消息块**上而不是 agent 块上：轮次的起点是用户消息，`loadMessages`（历史会话）天然不赋值 ⇒ 「无锚点」分支不需要额外状态，也不需要改会话文件格式。
- `readingAnchor` 为可选、不是 `null` 联合：缺省即「该轮没有锚点」。

**IPC 与 preload**：`notes-add` 的入参类型自动携带 `kind`（`preload.ts` 的 `notesAdd(draft: ReaderNoteDraft)` 不变），**不新增通道、不改 `PixApi` 方法签名**；`ipc-handlers.ts` 的 `isNoteDraft` 只加一条形状校验：

~~~ts
(draft.kind === "excerpt" || draft.kind === "answer")
~~~

不满足走既有 `invalidNotesInput()`（`invalid-input` + 「笔记数据不合法」）。

**主进程错误文案（kind 化，仅 `too-long` 一条分叉）**：

| 场景 | `code` | `error`（必须逐字） |
| --- | --- | --- |
| excerpt 超长 | `too-long` | `选中内容过长（超过 4000 字），请分段摘录`（既有，一字不改） |
| answer 超长 | `too-long` | `回答过长（超过 4000 字），无法存为笔记` |
| 空内容 / kind 非法 / page 非法 | `invalid-input` | `笔记数据不合法`（既有） |
| 文档越界 | `outside` | `该文档不在当前资料库内`（既有） |

**渲染层 DOM 与文案契约**（离屏断言依赖这些选择器，实现不得改名）：

| 选择器 | 含义 |
| --- | --- |
| `.answer-save-wrap` | 保存动作的容器（hover 显示；**不可用态的 `title` 挂在这个容器上**，避开 Chromium 对禁用控件不派发鼠标事件的已知行为） |
| `.answer-save-btn` | 「存为笔记」按钮本体（`disabled` 属性表达不可用） |
| `.answer-note-feedback[data-state="ok\|duplicate\|error"]` | 三态原位反馈文本节点 |
| `.note-ai-badge` | 笔记面板中 answer 条目的「AI」徽标 |

文案（判定用「包含」）：按钮 `存为笔记`；提示 `存为笔记 · <文件名> 第 N 页`，回退分支追加 `（按当前阅读位置）`；不可用 `无法存为笔记：这条回答没有发送时的文档锚点，且当前没有打开文档`；反馈 `已存为笔记 · <文件名> 第 N 页` / `已在笔记中`（与 `PdfSelectionQuickAsk` 的重复文案一致）/ `保存失败：<主进程 error 原文>`。`<文件名>` = 绝对路径最后一个分隔符之后的部分（与 ChatPanel 既有 `documentChip`、`sessionStore.attachmentName` 同取法）。

**反馈停留时长**：2500 ms（与 `PdfSelectionQuickAsk.FEEDBACK_MS` 同量级，保证「保存失败：回答过长（超过 4000 字），无法存为笔记」可读完）。

---

### N35 写入契约：`kind` 进 draft、进落盘、进去重键

**一句话**：`ReaderNoteDraft` 增必填 `kind`，主进程落盘使用 `draft.kind`，去重键包含 `kind`。

**用户可见行为**：无直接可见变化；间接效果是 AI 结论作为独立条目存在，与摘录同页并存而不互相覆盖。

**验收标准**

1. 【走查】`ReaderNoteDraft.kind: ReaderNoteKind` 为**必填**；全仓库 `addNote(` 调用点只有两处：`PdfSelectionQuickAsk.vue:153`（传 `"excerpt"`）与 ChatPanel 新增的一处（传 `"answer"`）；无第三处、无默认值兜底。
2. 【烟测】`addNote({kind:"answer", docFilePath:<temp 内绝对路径>, page:3, text:"A"})` → `success:true`，`note.kind === "answer"`，文件重读后该条 `kind === "answer"`、`docPath` 为斜杠相对路径、`page === 3`。
3. 【烟测】同一文段先以 `kind:"excerpt"` 再以 `kind:"answer"` 保存（同 docPath / page / text）→ 文件内**2 条**（§0.2），`createdAt` 单调、`id` 不同；随后再以 `kind:"answer"` 保存第三次 → `duplicateOf` 等于第二条的 id，条目数仍为 2，**文件字节与 mtime 不变**。
4. 【烟测】只含 excerpt 的既有库（未改动的 `notes.json`）读入后连续保存同样的 excerpt 两次 → 第一次 `duplicateOf` 命中既有条目（与改动前判定一致），文件字节不变。
5. 【烟测】`kind` 缺失 / `"note"` / 数字 → 守卫层与 store 层均拒绝为 `invalid-input`（中文「笔记数据不合法」），**不写盘、不留 `.tmp`**。
6. 【走查】写入字段精确：除 `kind` 外，`id`（新 UUID）、`docPath`（相对化）、`page`（原样）、`text`（归一化）、`comment: ""`、`createdAt === updatedAt === 主进程当前时刻`；序列化仍是 2 空格缩进 + 末尾换行。
7. 【走查】`notes.json` 的 `version`、`ReaderNote` 其余字段语义、`ReaderNotesErrorCode` 词表、备份/逃生口语义全部零改动（判定：`git diff` 不含这些符号；`isReaderNote` 的既有判断逐字不变）。
8. 【边界】越界 `docFilePath`（temp 根之外）→ `outside`，不写盘；`page` 为 `0` / 非整数 → `invalid-input`，不写盘（沿用既有校验）。

**涉及文件**：`pix/src/shared/types.ts`、`pix/src/main/notes-store.ts`、`pix/src/main/ipc-handlers.ts`、`pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`。

**数据落盘**：`<工作区根>/.pix-read/notes.json`（整文件原子重写，条目追加末尾）。

---

### N36 回答块的「存为笔记」动作与锚点三分支

**一句话**：每个已完成的回答块提供「存为笔记」按钮，点击后按「发送锚点 → 当前阅读位置 → 不可用」的固定优先级决定存入哪篇文档的哪一页，并先在悬浮提示里说清目标。

**用户可见行为**：鼠标悬停在回答块上，右上角出现「存为笔记」（与既有「复制回答」同一排、同一交互层级）；提示写明「<文件名> 第 N 页」；点击后按钮位置原地给出成功/重复/失败反馈；目标文档与页码与「发送那一刻读到哪里」一致，即使用户随后翻页或换了文档。

**三分支判定表（写死，点击时刻判定）**

| 情形 | 条件 | 目标 `{docFilePath, page}` | 提示文案 | 动作 |
| --- | --- | --- | --- | --- |
| (a) 有发送锚点 | 该回答块所属轮次在发送时 `readerStore.filePath` 非空 | 锚点原值 | `存为笔记 · <文件名> 第 N 页` | 可点 |
| (b) 无锚点 + 当前有打开文档 | 该轮无锚点，且点击时 `readerStore.filePath` 非空 | 当前 `{filePath, page}` | `存为笔记 · <文件名> 第 N 页（按当前阅读位置）` | 可点 |
| (c) 两者皆无 | 该轮无锚点，且点击时 `readerStore.filePath` 为空 | 无 | `无法存为笔记：这条回答没有发送时的文档锚点，且当前没有打开文档` | `disabled` |

说明：情形 (c) 不存在「会被存到哪一篇哪一页」，因此提示给的是**不可用的原因**而不是位置；这是唯一允许提示中不含文档名与页码的情形。

**验收标准**

1. 【走查】动作层级与既有复制按钮一致：`.answer-save-wrap` 与 `.message-copy-btn` 同在回答块的动作区（同一 `position: relative` 祖先、hover 显示）；`.message-copy-btn` 的 DOM、类名、复制行为零改动。
2. 【离屏】`30-answer-save-btn.png`：hover 回答块后同时出现两个动作；`.answer-save-wrap` 的 `title` 同时含文档名与「第 2 页」（断言用 `includes`）。
3. 【离屏】流式中不出现：判定用**回答块自身的** `block.isStreaming`（不是 `sessionStore.isStreaming`）——`message_start` + `message_update` 之后 `.answer-save-btn` 数量为 0；`message_end` 之后为 1（截图 `30b-answer-streaming.png` 与 `30-answer-save-btn.png`）。理由：避免把半截回答存成用户资产；一个轮次内的已完成中间块（工具调用前的那段文字）可以保存，这是 `block.isStreaming === false` 的自然结果。
4. 【离屏】情形 (a) 锚点优先（**本轮最核心断言**）：打开 `sample-paper.pdf` 停在**第 2 页** → 发一次提问并收到回答 → 翻到第 3 页 → 提示仍为「第 2 页」→ 点击保存 → `MEASUREMENTS.answer-anchor.payload.page === 2`、`kind === "answer"`，fixture 的真实 `notes.json` 中该条 `page === 2`。
5. 【离屏】锚点跨文档成立：情形 (a) 之后切到另一篇文档（`archive/older-paper.pdf`，第 1 页）→ 提示仍是第一篇文档名 + 第 2 页；保存后 `docPath === "sample-paper.pdf"`。
6. 【离屏】情形 (b)：`setMessages()` 注入一段历史会话并重新进入工作区（`get_messages` → `loadMessages`）→ 该回答块提示含「（按当前阅读位置）」；打开 `sample-paper.pdf` 停在第 3 页后点击 → 存到第 3 页（截图 `33-answer-history-fallback.png`）。
7. 【离屏】情形 (c)：同一历史会话下**不打开任何文档**→ `.answer-save-btn` 的 `disabled === true`，`.answer-save-wrap` 的 `title` 含「无法存为笔记」与「当前没有打开文档」；点击后 `notesAddCalls().count` 不变（截图 `34-answer-save-disabled.png`）。
8. 【走查】入库文本来源是 `block.content`（原始 markdown）：构造含代码块与标题的回答 → `notes.json` 的 `text` 不含 `<div`、`<p>`、`class=` 等渲染产物特征串。
9. 【边界】锚点文档已被移出资料库 / 删除 → 主进程 `outside` → 反馈 `保存失败：该文档不在当前资料库内`，不写盘，按钮回到可点状态（不把面板推入错误态）。
10. 【边界】当前文档是非 PDF 预览（`.md`/`.txt`，无页码概念，`pageCount === 0`）：仍按「`filePath` 非空即登记锚点、`page` 取 1」处理；提示显示「第 1 页」；跳回原文走既有 ChatPanel `jumpToPage` 的「非 PDF 直接忽略」路径（不新增分叉）。
11. 【边界】回答内容归一化后为空（只有空白）→ 不渲染保存按钮（数量 0）；主进程侧由 N38 验收 5 兜底。
12. 【走查】渲染层不拼存储路径：draft 的 `docFilePath` 是锚点或 `readerStore.filePath` 的绝对路径，不做 `join`、不做相对化。

**涉及文件**：`pix/src/renderer/components/workspace/ChatPanel.vue`、`pix/src/renderer/stores/session-store.ts`、`pix/src/renderer/stores/notes-store.ts`（只复用 `addNote`/`AddNoteResult` 三态，不改语义）、`pix/src/renderer/utils/notes-path.ts`（只读复用 `docDisplayName` 的取法）。

**数据落盘**：`<工作区根>/.pix-read/notes.json`（每次成功保存追加一条；重复/失败不写盘）。

---

### N37 锚点快照的登记点与生命周期

**一句话**：锚点在 `ChatPanel.send()` 内与 `<reading_context>` 入参**同一处**一次性快照，随乐观用户消息块登记，会话确认不覆盖、历史加载不伪造、裁剪丢失即回退。

**用户可见行为**：无直接可见变化；保证 N36 的 (a)/(b)/(c) 三分支在「发送 → 回答 → 翻页 → 切文档 → 重载会话」全过程中稳定。

**验收标准**

1. 【走查】唯一快照点：`ChatPanel.send()` 内读 `readerStore.filePath` / `readerStore.page` 只出现一次，且与 `buildReadingUserMessage` 的实参同一来源（判定：`send()` 中不存在第二处 `readerStore.` 读取；点击处理函数内不出现 `readerStore.filePath` / `readerStore.page`）。
2. 【走查】唯一写入点：`sessionStore.appendOptimisticUserMessage(text, filePaths, anchor)` 是 `readingAnchor` 的唯一赋值处；`loadMessages` 路径无赋值语句。
3. 【离屏】会话确认不清锚点：发送 → 收到回答（乐观块被 `appendUserOrNoteMessage` 的匹配分支覆盖 `text`/`attachments`/`timestamp`）→ 翻页 → 保存 → 仍写发送时页码（与 N36 验收 4 同场景，断言对象是「确认后锚点仍在」）。
4. 【走查】steer（流式中发送）同样登记锚点；其后的回答块按「向前最近一个带锚点的用户块」解析，落到该 steer 的锚点（不回落上一轮）。
5. 【走查】解析函数对「找不到锚点」返回 `null`（不做非空断言、不抛错）；`MAX_DISPLAY_BLOCKS` 裁剪丢掉锚点块时，该回答块自动走 (b)/(c)。
6. 【边界】发送失败（`failOptimisticUserMessage` 删除乐观块）→ 该轮没有回答块，无按钮可言；重发产生新锚点，不残留旧锚点。
7. 【走查】会话文件格式零改动：`pix/src/main/session-bridge.ts`、`packages/**` 无改动；锚点不落任何文件（判定：`git diff --stat`）。
8. 【边界】锚点登记后关闭文档再打开同一文档：锚点不因 `openDocument` 复位而改变（锚点是块上的一份拷贝，不引用 store）。

**涉及文件**：`pix/src/renderer/components/workspace/ChatPanel.vue`、`pix/src/renderer/stores/session-store.ts`、`pix/src/shared/types.ts`。

**数据落盘**：无（锚点只存在于渲染层内存的 display block 上）。

---

### N38 长度上限、空内容拒绝与三态原位反馈

**一句话**：归一化后超过 4000 字符的回答整条拒绝（不截断）并给中文原因，空内容同样拒绝；成功 / 重复 / 失败三态在回答块原地反馈。

**用户可见行为**：过长的回答点击保存后，原地出现「保存失败：回答过长（超过 4000 字），无法存为笔记」，库与计数器不变；成功出现「已存为笔记 · <文件名> 第 N 页」且左栏「笔记 N」+1；重复出现「已在笔记中」且计数不变。

**验收标准**

1. 【烟测】归一化后**恰好 4000** 字符的 answer → 保存成功，且随后 `loadNotes()` 返回 `success:true`（同时满足 `isReaderNote` 的 `text.length ≤ 4000`，文件不判损坏）。
2. 【烟测】**4001** 字符 → `success:false, code:"too-long"`，`error` 逐字为 `回答过长（超过 4000 字），无法存为笔记`；文件字节与 mtime 不变；目录内无 `.tmp`。
3. 【烟测】excerpt 的 4001 字符 → `too-long` 且 `error` 仍为 `选中内容过长（超过 4000 字），请分段摘录`（既有文案一字不改）。
4. 【走查】拒绝发生在写盘之前：`addNote` 内空内容/长度/越界判断全部先于 `writeFileAtomic`，不存在「先写再回滚」的路径；无 `slice(0, 4000)` 之类的截断。
5. 【烟测】`text` 为 `"   \n\t "` → `invalid-input`，不写盘；【离屏】`block.content.trim() === ""` 的回答块不渲染保存按钮。
6. 【离屏】成功态：反馈节点 `data-state="ok"`，文本含文档名与「第 N 页」；`NotesPanel` 计数 +1、左栏 tab 文案同步；fixture `notes.json` 中该条 `kind === "answer"`。
7. 【离屏】重复态：对同一回答再点一次 → `data-state="duplicate"`、文本「已在笔记中」、计数不变、`notes.json` 字节不变。
8. 【走查】失败态常显 + 可读：反馈节点带与 `.message-copy-btn.copied` 同机制的常显类（不依赖 hover 可见），停留 2500 ms 后恢复为按钮；反馈期间按钮不可点（同块重复点击不产生第二次 IPC）。
9. 【走查】失败不产生半条数据：所有失败分支在写入前返回；写盘协议仍是 tmp + rename，失败清理 tmp 且原文件字节不变。
10. 【边界】IPC reject（stub 注入抛错）→ 反馈 `保存失败：主进程调用异常：<message>`（沿用 `notes-store.rejectMessage` 口径）；不得停留在 pending、不得静默。
11. 【回归】excerpt 的三态原位反馈（`PdfSelectionQuickAsk` 的「已摘录 / 已在笔记中 / 摘录失败」）行为与文案不变，既有 `07*` 场景继续通过。

**涉及文件**：`pix/src/main/notes-store.ts`、`pix/src/renderer/components/workspace/ChatPanel.vue`、`pix/src/renderer/stores/notes-store.ts`（只复用，不改）。

**数据落盘**：成功时追加一条；重复/失败时零写入（判定：字节哈希）。

---

### N39 笔记面板：AI 徽标与两类条目的一致性

**一句话**：answer 条目与 excerpt 同组同序，仅多一个「AI」徽标；备注、删除、跳回原文、计数、筛选、错误态对两类条目完全一致。

**用户可见行为**：左栏笔记列表里，AI 结论条目的页码徽标旁多一个「AI」小徽标；其它交互与操作与摘录条目毫无差别。

**验收标准**

1. 【离屏】`32-answer-note-badge.png` + `32b-answer-note-badge-left-pane.png`：answer 条目的 `.note-head` 内有 `.note-ai-badge`（文本「AI」）；excerpt 条目无该元素；`.note-ai-badge` 数量 = 库内 answer 条数。
2. 【走查】徽标插入位置在 `.note-page-badge` 之后、`.note-time` 之前；excerpt 条目的行 DOM 结构不变（不渲染空占位）。
3. 【离屏】排序与分组不变：种子数据在 `sample-paper.pdf` 第 2 页放一条 excerpt（`createdAt` 较早）与一条 answer（`createdAt` 较晚）→ 列表中先 excerpt 后 answer；`MEASUREMENTS.answer-notes-list.order` 断言两条 `id` 顺序。
4. 【离屏】answer 条目上功能等价：备注保存后 `.comment-text` 更新；删除走二次确认（第一次点击变为「确认删除」，再点后该行消失、`notes.json` 少一条）；点击行 → 阅读区页码为笔记页（`data-page` 或页码指示器断言）。
5. 【离屏】计数与筛选不回归：`共 N 条` 含两类；「仅看当前文档」对两类同等生效；`当前 X 条 / 共 N 条` 文案不变。
6. 【回归】错误态与逃生口不变：既有 `10-notes-error`、`10b-*`、`05b-note-delete-confirm` 场景继续通过；损坏/版本不支持的提示与「备份原文件并新建空库」入口零改动。
7. 【走查】渲染层不新增路径拼接：`NotesPanel.vue` 仍只消费 `notesStore`；`utils/notes-path.ts`、`stores/notes-store.ts` 零改动（判定：`git diff --stat`）。
8. 【边界】同一文档同页存在 3 条以上混合条目、以及 answer 的 `comment` 非空 → 行内不溢出（`MEASUREMENTS` 断言 `.note-head` 的 `scrollWidth ≤ clientWidth`，截图 `32-answer-note-badge.png` 为旁证）。

**涉及文件**：`pix/src/renderer/components/workspace/NotesPanel.vue`。

**数据落盘**：只读（备注/删除沿用既有写入链路）。

---

### N40 导出 notes.md 的 kind 标注与既有结构不变

**一句话**：answer 条目的标题行加 ` · AI 结论` 标注，其余模板逐字节不变；导出只读 `notes.json`。

**用户可见行为**：导出的 Markdown 里，AI 结论一眼可辨（`### 第 12 页 · AI 结论`），摘录条目与今天完全一致。

**验收标准**

1. 【烟测】含两类条目的库导出 → 逐行断言：answer 条目为 `### 第 N 页 · AI 结论`，excerpt 条目为 `### 第 N 页`；`MEASUREMENTS` 之外的判定以烟测文件字面量为准（生成时间行屏蔽后比对）。
2. 【烟测】其余模板逐行不变：`# 阅读笔记 · <资料库名>`、第二行统计（`共 N 条` 统计两类之和）、`## <docPath>（N 条）`、条目间 `\n\n---\n\n`、正文 `> ` 前缀、`备注：` 行、文件末尾 `\n`。
3. 【烟测】导出只读：导出前后 `notes.json` 的 `sha256` 与 `mtime` 相同。
4. 【烟测】幂等：连续两次导出，除第 2 行（生成时间）外逐字节相同。
5. 【烟测】只含 excerpt 的库导出结果与改动前模板逐行相同（判定：屏蔽生成时间后与字面量模板比对，覆盖「零标注」这一半）。
6. 【回归】0 条 → `empty`（「暂无笔记可导出」）不变；损坏 / 版本不支持 → 拒导出且不改写文件（N25 语义不变）。

**涉及文件**：`pix/src/main/notes-store.ts`（`renderMarkdownEntry` 一处分支）。

**数据落盘**：写 `<工作区根>/.pix-read/notes.md`（整文件覆盖写）；`notes.json` 只读。

---

### N41 离屏取证面（stub + 30 段场景 + 断言）

**一句话**：把 N35–N40 的可见行为与落盘结果做成 ui-shot 可判定的取证面。

**验收标准**

1. 【走查】stub 的 `notesAdd` 按 `draft.kind` 落盘、去重键含 kind、并把结果写入 fixture 的真实 `notes.json`（与 `readerStateSave` 同范式，脚本可直接读文件断言）；`__pixStub` 新增控制口：`notesAddCalls()`（次数 + 最近 8 条 `{docFilePath, page, text, kind}`）、`setNotesAddFailure(code | "throw")`。
2. 【走查】stub 的 `onAgentEvent` 保留回调并在 `__pixStub.emitAgentEvent(event)` 时逐条投递；新增 `__pixStub.setMessages(list)` 让 `get_messages` 返回该列表（驱动「历史消息无锚点」分支）。场景允许用「点发送 + 直接投递事件序列」驱动，不要求 stub 实现真实的 prompt→answer 回环（`sendCommand("prompt"|"steer")` 保持现状）。
3. 【走查】`seedNotes()` 增一条 `kind: "answer"` 种子（与同页 excerpt 构成 N39 验收 3 的排序样本），并在 `writeFixtures()` 写入的 `notes.json` 中体现。
4. 【离屏】新增场景（30 段，避开既有 00–11 与 20–24）：`30-answer-save-btn`、`30b-answer-streaming`、`31-answer-save-ok`、`31b-answer-save-duplicate`、`31c-answer-save-too-long`、`32-answer-note-badge`、`32b-answer-note-badge-left-pane`、`33-answer-history-fallback`、`34-answer-save-disabled`。
5. 【离屏】`MEASUREMENTS.json` 至少新增四组断言，均以脚本内 `throw` 实现：`answer-save`（按钮存在性 / `disabled` / `title` 文本 / 流式中数量为 0）、`answer-anchor`（`notesAddCalls` 最近 payload 的 `page`+`kind` + fixture 文件内对应条目的 `page`+`kind`）、`answer-feedback`（`data-state` + 文本）、`answer-notes-list`（`.note-ai-badge` 计数与文本 + 同页两条顺序）。
6. 【离屏】既有 00–11、20–24 场景全部继续通过；截图数不少于改前；`MANIFEST.json.failure === null`；失败场景落 `99-failure-state.png` 且退出码 1。
7. 【check】`cd pix && npm run check` 0 error（stub 侧为 `.mjs`，不改类型面）。

**涉及文件**：`pix/scripts/ui-shot.mjs`。

**数据落盘**：只写 `%TEMP%` 下的临时 fixture（不写仓库）。

---

### N42 回归与零外溢

**一句话**：本轮不破坏既有语义，也不越出白名单。

**验收标准**

1. 【回归】`ui-shot.mjs` 既有全部场景通过（改前基线先跑一次留档，改后比对；截图数只增不减）。
2. 【check】`cd pix && npm run check` 0 error。
3. 【走查】`git diff --stat` 只含 §4 白名单文件；`packages/**`、`pix/package.json`（含 dependencies）、`package-lock.json`、`pix/build/**`、electron-builder 配置零改动。
4. 【走查】`pix/src/main/reading-prompt.ts`、`pix/resources/skills/**` 零改动；`<reading_context>` 的字段名与顺序零改动（`git diff` 不含 `reading-context.ts`）。
5. 【烟测】数据面回归：损坏文件（截断 JSON）下 `addNote` 返回 `corrupt` 且文件字节不变；`version:2` 返回 `version-unsupported` 且不写盘；`resetCorruptNotes` 的备份命名与 `not-corrupt` 拒绝语义不变。
6. 【走查】IPC 通道数量不变（`notes-load`/`notes-add`/`notes-update`/`notes-delete`/`notes-export`/`notes-reset` 六条，不增不减）；不新增依赖；不写未被调用的死代码。
7. 【走查】`PdfSelectionQuickAsk.vue` 的 diff 只有 `kind: "excerpt"` 一行语义改动；其余既有摘录链路零改动。

---

## 3. 反需求（本轮明确不做）

1. **不做自动入库**（不改 reading-prompt、不加启发式、不在回答结束时自动保存）：`notes.json` 是用户资产，只能由显式动作写入（PRD §4.3）。
2. **不给 agent 写笔记的工具**：agent 不得在无人确认下改动用户资产；再把「写笔记」做成工具会与「一键存为笔记」形成两条写入路径与两套校验。
3. **不改 `reading-prompt.ts` 与 `resources/skills/**`**：教模型「请把结论写成方便入库的形式」会改变回答风格与上下文成本，而锚点语义由 UI 单方面决定，模型不需要知情。
4. **不把 AI 结论注入对话上下文**（笔记多选注入是 R8）：本轮任何进入上下文的内容都不得变化，`<reading_context>` 只有既有四/五个字段。
5. **不改 `notes.json` 的 `version` 与既有字段语义**：`kind` 是 V0.3 冻结的既有字段，本轮只是第一次真正写它；改版号需要迁移与兼容层，属明确不做。
6. **不保留 Markdown 换行结构、不剥离 Markdown 标记、不存渲染后 HTML**：入库统一走既有归一化点（理由见 §0.1：读侧上限与损坏判定要求「入库形态 = 归一化形态」这一单一口径）。若未来要做「带结构的 AI 结论」，必须同轮同时改归一化、4000 判定与导出模板三处，并接受两类 text 形态分叉 —— 本轮不做。
7. **不做 answer 专属的独立列表 / 标签页 / 筛选开关**：面板已有「仅看当前文档」，再加维度会让计数与筛选口径分叉；本轮只要徽标区分。
8. **不持久化锚点**（不写会话文件、不写 notes.json 的额外字段、不写 reader-state.json）：会话文件格式属内核契约（`packages/**` 不改），把锚点写进 notes.json 则会给「笔记」引入一个与文档页码强绑定的隐藏字段语义。
9. **不做超长回答的分段保存 / 静默截断 / 折叠入库**：截断会让「笔记」与「原文」不一致，且超长值会让整个文件被读侧判损坏（§0.1）；分段保存需要一套切片 UI 与去重语义，超出主线。
10. **不做保存撤回 / 撤销 Undo**：删除已在面板提供（含二次确认）；跨面板事务属 R10 的范围。
11. **不做页码钳制**：主进程不解析 PDF（既有事实），越界页由跳转消费方（`reader-store`）钳制；本轮不给笔记写入路径引入 PDF 解析。
12. **不做回答块的其它动作**（重新生成、引用/挑刺、复制带锚点链接）：本轮只加「存为笔记」一个动作，避免动作区成为新战场。
13. **不引入新依赖、不改 `packages/**`、不改构建与打包配置**（工程红线）。

---

## 4. 文件白名单

### 主进程面

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `pix/src/shared/types.ts` | 修改 | `ReaderNoteDraft` 增必填 `kind`；新增 `ReadingAnchor`；`DisplayBlock` 的 `user-message` 变体增可选 `readingAnchor`；其余联合成员与 Reader Notes 段其余类型逐字不动 |
| `pix/src/main/notes-store.ts` | 修改 | `duplicateKey` 增 kind；`addNote` 用 `draft.kind` 落盘；`too-long` 文案按 kind 分叉（excerpt 文案一字不改）；`renderMarkdownEntry` 对 answer 加 ` · AI 结论`。解析、损坏策略、原子写、备份、reset 语义**不改** |
| `pix/src/main/ipc-handlers.ts` | 修改 | `isNoteDraft` 增一条 kind 形状校验；不给 notes 段新增 handler，不改错误码 |
| `pix/src/main/preload.ts` | **不改** | `notesAdd(draft: ReaderNoteDraft)` 类型自动携带 `kind`；判定：`git diff` 不含该文件 |
| `pix/src/main/library-root.ts`、`reader-state-store.ts`、`session-bridge.ts`、`pdf-tools.ts`、`reading-prompt.ts`、`index.ts` | **不改** | 只读复用；`reading-prompt.ts` 属红线 |

### 渲染层面（含取证脚本）

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改 | `send()` 内构造锚点快照（与 `buildReadingUserMessage` 同源）+ 乐观块传参；回答块保存按钮、三分支提示、三态原位反馈、点击保存。复制按钮、`[[pN]]` 跳页、chips、scroll 跟随等既有逻辑零改动 |
| `pix/src/renderer/stores/session-store.ts` | 修改 | `appendOptimisticUserMessage(text, filePaths, anchor)` 增第三参；新增「向前最近带锚点用户块」的解析函数（找不到返回 `null`）；`loadMessages` 不赋值锚点；其余块构造逻辑零改动 |
| `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 修改 | `addNote({ docFilePath, page, text })` → 追加 `kind: "excerpt"`（一行） |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | `.note-ai-badge`（「AI」）渲染。排序、筛选、计数、删除二次确认、错误态、备注交互**不改** |
| `pix/scripts/ui-shot.mjs` | 修改 | stub（`notesAdd` 按 kind 落盘/去重、`notesAddCalls`、`setNotesAddFailure`、`emitAgentEvent`、`onAgentEvent` 保留回调、`setMessages`）+ 30 段场景 + `MEASUREMENTS` 断言 |
| `pix/src/renderer/stores/notes-store.ts` | **不改** | 复用 `addNote` / `AddNoteResult`（成功 / 重复 / 失败三态）与 `applyNotes`；不做乐观合并 |
| `pix/src/renderer/utils/notes-path.ts` | **不改** | 分组与排序规则复用 |
| `pix/src/renderer/pages/WorkspacePage.vue` | **不改** | 保存动作全在 ChatPanel + notes-store；笔记跳回走既有 `onOpenNote` |
| `pix/src/renderer/utils/{reading-context,note-capture,markdown}.ts`、`stores/{reader,reader-state,project}-store.ts`、`components/workspace/{PdfViewer,ReaderPanel,LibraryPanel,KnowledgeMap,PdfSearchPanel}.vue`、`components/session/*.vue` | **不改** | 见不变量 5 与 §3 |

范围外（任何情况下不动）：`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置、`pix/resources/skills/**`。

---

## 5. 风险 Top3 与判定方式

**R1 「锚点被实现成点击时刻的当前位置」** —— 这是本轮唯一的语义核心，也是最容易蒙混过关的失败模式：点击时用户通常还停在发送时那一页，走查与截图都看不出差别。

- 判定：N36 验收 4/5（离屏：第 2 页发送 → 翻到第 3 页 → 断言 `notesAddCalls` 与真实 `notes.json` 的 `page === 2`；再断言跨文档后目标仍是第一篇）+ N37 验收 1/2/3（代码审查：快照点唯一、点击路径不读 `readerStore`）+ N37 验收 4（steer 与确认不清锚点）。
- 失败信号：点击处理里出现 `readerStore.filePath`/`page`；锚点存在模块级变量或 pinia 里（`loadMessages` 后仍被填上）；乐观块被会话确认时 `readingAnchor` 被覆盖。

**R2 「kind 只做了展示，没进数据契约」** —— 去重键漏 kind 或落盘仍写死 `"excerpt"`，会让「同一段文字既摘录又存为回答」时静默丢掉一条用户资产（无报错、无提示，最难被发现）。

- 判定：N35 验收 2/3/4（烟测：两类同文本 → 2 条；同 kind 重复 → `duplicateOf` 且字节不变；仅 excerpt 的库判定与改前一致）+ N36 验收 4（离屏断言 payload 的 `kind === "answer"` 与文件内容）+ N39 验收 1（徽标数量 = answer 条数）。
- 失败信号：`duplicateOf` 在两个 kind 之间命中；`notes.json` 里出现 `kind:"excerpt"` 的 AI 结论；面板计数只 +0。

**R3 「超长/异常输入突破单一口径，把整库推入损坏态」** —— 读侧 `isReaderNote` 的 `text.length ≤ 4000` 与「任一条目不合法即整库 corrupt」意味着一次越界写入会让用户**再也读不到自己的全部笔记**，而报错现场离根因很远。

- 判定：N38 验收 1/2/4（烟测：4000 通过且重读不损坏、4001 拒绝且文件字节/mtime 不变、无 `.tmp`）+ N35 验收 5/8（非法 kind 与越界路径不写盘）+ N42 验收 5（损坏与 version:2 下拒写且字节不变）+ N40 验收 3（导出不改 notes.json 字节）。
- 失败信号：出现 `slice(0, 4000)` 或「截断后保存」；失败后目录内残留 `.tmp` 或文件字节变化；拒绝后再 `loadNotes` 返回 `corrupt`。
