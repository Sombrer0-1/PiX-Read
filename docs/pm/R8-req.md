# PiX-Read R8 需求档 · 笔记作为对话上下文（N43–N51）

> 上游：`docs/pm/PRD-V0.4.md` §3（资产分层：`notes.json` 是**用户资产**，读侧严格校验、损坏绝不覆盖）、§4.2/§4.3（笔记只由用户显式动作产生）、§7.2（笔记能跳回原文、能备注、能导出）；R7 已交付「回答存为笔记 + kind 维度 + 锚点」。
> 本轮唯一主线：**用户显式挑选的笔记进入对话上下文** —— 面板多选 + composer 可移除 chip + 单条「追问」，注入面可见、可移除、有硬上限。
> 判定工具（本档所有验收只能由这四种证据判定，逐条已标注）：
> - 【走查】代码审查：只读文件内容与 `git diff` / `git status` / `git show`（只读可用）。
> - 【check】`cd pix && npm run check` 0 error。
> - 【烟测】纯函数离线烟测：把 `pix/src/renderer/utils/{reading-context,notes-path}.ts` 用**仓库外临时 tsconfig**（`paths` 把 `@shared/*` 指向 `pix/src/shared/*`）+ `tsc --outDir %TEMP%/… --module commonjs --target es2022 --skipLibCheck --strict` 编译，node 直接 `require` 产物断言（type-only import 不产生运行时依赖）；脚本跑完删除。
> - 【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + `MEASUREMENTS.json` 新增断言组全绿。
> 本档不写实现代码；契约给出**冻结字面量**与理由，设计档可细化机制，但不得违反「必须」项与 §0 冻结值。

---

## 0. 五个必须直答的问题（冻结值，设计/开发档不得改写）

### 0.1 注入文本的确切形状

`<reading_context>` 的既有四/五个字段**逐字不动**（`path` → `page` → `pageCount` → 可选 `selectedText:`），`reader_notes` 追加在 `selectedText` 之后、`</reading_context>` 之前。

**每条笔记的条目块（冻结格式）**：序号（从 1 连续）行 + 4 个字段行，字段顺序固定 `doc` → `page` → `kind` → `text` →（有备注时）`comment`；字段行以 **3 个半角空格**缩进；条目之间**无空行**；`doc` 取 `ReaderNote.docPath` **原样**（存储态相对路径、正斜杠、保留原始大小写），不注入 `id` / 绝对路径 / 时间戳。

**真实示例**（当前文档 `sample-paper.pdf` 第 2 页、有选区；选中 2 条笔记，其中第 1 条有备注、第 2 条来自另一篇文档）：

~~~
<reading_context>
path: C:\Users\86157\AppData\Local\Temp\pix-r5\library\sample-paper.pdf
page: 2
pageCount: 3
selectedText:
which confirms the mask is doing more than sparsification.
reader_notes:
1. doc: sample-paper.pdf
   page: 1
   kind: excerpt
   text: We study retrieval over long documents where the attention budget is the binding constraint.
   comment: 与第 3 节消融实验对照
2. doc: archive/older-paper.pdf
   page: 7
   kind: excerpt
   text: Section 4. Reproducibility: all runs use three seeds and report the median.
</reading_context>

请对比这两处的结论。
~~~

> **负责人回改（R8 终验后）**：上面示例只冻结**字段形状与缩进**，不冻结**条目顺序**。条目顺序以设计档 §1.2 的四级确定性排序为准（`docPathKey` 升序 → `page` 升序 → `createdAt` 升序 → `id` 升序）——按该口径示例中的 `archive/older-paper.pdf` 条目应排在 `sample-paper.pdf` 之前，与面板的分组顺序无关。同级项：`.note-select` 上限的 `title` 文案以需求档 §0.4 为准（设计档与实现均含「笔记」二字）。

- `kind` 用原始取值 `excerpt` / `answer`（中文只在 UI 上出现）。
- `text` 与 `comment` 在写入条目块前必须做**行内归一化**（连续空白折叠为一个半角空格、首尾去空白）：`comment` 由用户自由输入，可能带换行，不归一化会破坏「一个字段一行」的冻结形状；`text` 读侧已归一化，此处仍做同款归一化以免依赖上游不变量。
- 备注为空（`""`）时**不渲染** `comment:` 行（不写空占位）。
- 一条都没有被注入时**不出现** `reader_notes:` 行（与「无选区时不出现 `selectedText:` 行」同范式）⇒ 空选择/全丢时输出与 R7 逐字节相同。
- 本条只影响**发送给模型的 message**；用户消息气泡仍只显示 `text`（`displayText`），注入文本不渲染进气泡（既有约定不变）。

### 0.2 两个硬上限、超限策略与确切文案

| 项 | 冻结值 | 生效时机 | 策略 | 用户可见文案（逐字） |
| --- | --- | --- | --- | --- |
| 条数上限 | **10 条** | 选择期 | **拒绝**：第 11 条不可选 | 控件包裹元素 `.note-select-wrap` 的 `title`：`最多可注入 10 条笔记，请先取消其它选择`；选择条计数文案恒为 `已选 N 条` |
| 字符总量上限 | **8000 字符** | 发送期 | **整条丢弃**（不做字符级截断） | chip 文案：`摘录 N 条 · 超出上限未注入 M 条`（`N` = 选择条数、`M` = 被丢弃条数）；chip `title`：`本次注入 P 条笔记；M 条因超过 8000 字符上限未注入`（`P = N - M`） |

**计数口径（唯一）**：被注入的**条目块文本**（§0.1 的格式，条目之间以 `\n` 连接、末尾不带换行，**不含** `reader_notes:` 行与 `</reading_context>`）的 `String.length` ≤ 8000。判定实现即 `entries.join("\n").length <= 8000`。

**装入算法（冻结）**：按 §0.2 的确定性排序（见下）**顺序**逐条尝试；加入该条后长度超过 8000 ⇒ 该条**整条丢弃并继续尝试后续条目**（不停止、不截断）；被丢弃的条目计入 `M`。单条自身就超过 8000 时可装入 0 条，此时 chip 文案为 `摘录 N 条 · 超出上限未注入 N 条`，且 `<reading_context>` 不出现 `reader_notes:` 行 —— **上限是硬上限，不为「至少注入一条」开口子**。

**注入顺序（冻结，与面板显示顺序不同）**：`docPathKey` 升序 → `page` 升序 → `createdAt` 升序 → `id` 升序。面板顺序含「当前文档组置顶」，若直接复用会把「当前打开哪篇文档」变成上下文载荷的一部分，故注入顺序必须独立定义（实现不得展开 `notesStore.groups` 当注入顺序）。

**上限数值的来源**：`notes.json` 单条 `text` 上限是 4000 字符（`pix/src/main/notes-store.ts:31` `MAX_NOTE_TEXT_LENGTH`，读侧 `isReaderNote` 同口径），8000 = 2 条满长笔记，且远小于上下文窗口（`ui-shot` fixture 的 `contextWindow = 200000`，实机窗口由模型决定）；10 条 × 典型摘录（100–300 字符）≈ 1–3k 字符，远未触字符上限。两个上限同时存在，防止「一条超长笔记顶满」与「多条短笔记堆满」两种走形。

**防御式一致**：条数上限在注入侧同样生效（排序后取前 10 条，多余条目计入 `M` 并体现在 chip 文案），使得「万一选择集超过 10 条」也不会静默消失。

### 0.3 选择集在七种情形下的确切结果（写死）

| # | 情形 | 判据（触发条件） | 选择集结果 | 可见后果 |
| --- | --- | --- | --- | --- |
| 1 | 发送成功 | `rpc.sendPrompt` / `rpc.sendSteer` 未抛错 | **保留**（不清空） | `excludedContexts` 在 `send()` 的 `finally` 复位 ⇒ chip 立即恢复；下一回合仍注入，用户想停必须显式「清空」（这正是「与既有 exclude 机制一致」的含义，见 §0.5） |
| 2 | 发送失败 | 同上抛错（IPC reject 或 `success:false`），乐观块被 `failOptimisticUserMessage` 回滚 | **保留** | chip 仍在，用户可直接重发；错误反馈由既有 error 块给出（不新增提示） |
| 3 | 切换文档 | `readerStore.filePath` 变化 | **保留** | 笔记是工作区级资产，与当前打开的文档无关；跨文档对比提问（一条笔记来自另一篇文档）必然要切文档 |
| 4 | 切笔记标签 | `leftTab` 从 `"notes"` 变为 `"library"` | **清空** | 选择条消失、chip 消失、行内控件回到未选；理由：面板不可见时用户无法核对「本次会注入什么」 |
| 5 | 离开工作区 | `goHome()` 或 WorkspacePage 卸载（`notesStore.resetNotes()`） | **清空** | 跨工作区零残留（`resetNotes` 必须同时清空选择集，两处调用点不变） |
| 6 | 笔记被删除 | `removeNote` 成功（主进程回传全量列表覆盖本地） | **收敛**：只丢被删的那条，其余保留 | 选择条计数与 chip 条数同步减 1 |
| 7 | 笔记被重载 | `loadNotes` 成功 / `recoverCorruptNotes` 成功（全量覆盖） | **收敛**：与最新清单求交；`status !== "ready"`（加载中/错误）时**清空** | 加载中与错误态下不渲染选择条；重载最终结果以最新清单为准（`loadNotes` 必经 loading 态，可见结果通常是从空开始） |

补充口径（同样写死）：
- **「仅看当前文档」筛选与分组变化不影响选择集**：被筛掉的条目仍在选择集内，计数照算（清空入口始终可用）。
- **移除 chip（exclude）不影响选择集**：chip 只控制「本次发送是否注入」。
- 发送被早退（draft 为空且无附件、或 `clarifying` 为真）时选择集不变（根本没发送）。
- 选择集元素必须**派生**自 `notesStore.notes ∩ selectedNoteIds`：计数、chip 文案、注入载荷三者都从派生结果取，不存在手工同步分支（这是情形 6/7 自动成立的原因）。

### 0.4 「追问」不覆盖草稿的确切规则

| composer 状态 | 行为 |
| --- | --- |
| `draft.trim() === ""` | 填入唯一模板 `请结合我选中的摘录回答：`，并聚焦输入框；不显示提示行 |
| `draft.trim() !== ""` | **draft 一个字符都不改**；仍聚焦输入框；在 composer 内显示提示行 `.notes-ask-notice`，文案逐字 `已加入 N 条摘录，草稿已保留`（停留 2500 ms 后消失） |
| `clarifying === true`（澄清待答，输入框被 `disabled`） | 两个入口（行内「追问」与选择条「问 AI」）均 `disabled`，包裹元素 `title` 逐字 `等待澄清回答时无法发起追问`；点击不改变 draft、不改变选择集 |

- 「把该条笔记作为上下文填入 composer」= **把它变成本次发送载荷**：行内「追问」把选择集替换为「该条」这一条（原选择集被替换，不追加），chip 随即显示 `摘录 1 条`；选择条「问 AI」把当前选择集原样作为载荷。两者共用同一个 composer 动作（聚焦 + 模板或提示），不区分两套逻辑。
- 草稿保护是硬要求：**不得**把笔记原文写进 textarea，也不得清空/覆盖用户输入（模板只在草稿为空时填入）。

### 0.5 「下一次回合恢复」的准确含义（消除歧义）

「移除 chip → 本次不注入 → 下一次回合恢复」中，「恢复」指**排除集合在发送结束后复位**（既有 `resetExcludedContexts()` 行为，`ChatPanel.vue:89` 定义、`:336` 在 `send()` 的 `finally` 调用），而不是「选择集被重新填上」。因为 §0.3 情形 1 规定**发送成功后选择集保留**：chip 在发送完成的那一刻就恢复可见（与「当前文档」「选中文本」chip 的既有表现完全一致），下一回合照常注入。用户要停止注入只有一条路径：面板「清空」（或移除 chip 逐回合排除）。

---

## 1. 本轮目标与不变量（违反任一即为回归，设计档必须逐条声明）

目标：让摘录/AI 结论能作为**显式、可移除、有上限**的上下文进入提问 —— 面板多选 → chip 可见 → 发送时注入 `<reading_context>` 的 `reader_notes` 段；单条「追问」把一条笔记变成一次性载荷并聚焦输入框。

1. **既有发送链路与 chips 排除机制不变**：`buildReadingUserMessage` 的既有字段名与顺序、`ContextChipKind` 的 `excludeContext(kind)` / `excludedContexts` 单次发送语义、`send()` 的「文档 chip 被排除 ⇒ 不发 `<reading_context>`」分支、锚点快照与 `rpc.sendPrompt/sendSteer` 的调用形状全部零改动；本轮只**新增一个 kind** 与一个新段落，不新造第二套排除机制。
2. **笔记面板既有语义零改动**：分组键、组内排序、当前文档组置顶、「仅看当前文档」筛选、计数文案、删除二次确认（3 s 复位 + capture `pointerdown`）、加载/错误/逃生口状态机、跳回原文、备注编辑、展开全文、AI 徽标 —— 全部保持；多选控件与选择条是**加法**。
3. **R7 锚点链路语义不变**：`readingAnchorFor` 的解析规则（只认紧邻前一个 `user-message` 块、无锚点即 `null`、不跨轮回溯）与此前登记的锚点快照点不变；本轮只把它的**实现复杂度**从每帧 O(blocks) 的 `findIndex` 改为索引缓存（N49），行为必须逐字节等价。
4. **用户资产与主进程面不变**：本轮**不改任何主进程文件**、不新增 IPC 通道、不新增/变更落盘字段；`notes.json` 全程只读（选择、清空、追问、发送都不产生写入）；损坏绝不覆盖、写入原子、渲染层以主进程返回的全量列表覆盖本地 —— 一并保持。
5. **上下文注入始终可见、可移除**：任何进入 `<reading_context>` 的笔记内容都必须先有对应 chip；不做隐式注入、不做「常开」开关、不写进系统提示词。

---

## 2. 需求明细

### 2.0 冻结的选择器与文案（离屏断言依赖这些名字与字面量，实现不得改名）

| 选择器 / 常量 | 含义 |
| --- | --- |
| `.note-select-wrap` | 选择控件的包裹元素（`title` 挂这里：禁用控件在 Chromium 下不派发鼠标事件，与 R7 `.answer-save-wrap` 同规避） |
| `.note-select` | 选择控件本体（`disabled` 属性表达「已达 10 条上限」） |
| `.note-row.selected` | 已选行态 |
| `.notes-selection-bar` | 选择条（仅 `status === "ready"` 且 `hasNotes` 且已选 > 0 时渲染；渲染在 `.notes-header` 内、`.notes-filter` 之后，随头部 sticky） |
| `.notes-selection-count` | 计数文案 `已选 N 条` |
| `.notes-ask-btn` | 选择条动作，文案 `问 AI` |
| `.notes-selection-clear` | 选择条动作，文案 `清空` |
| `.note-ask` | 行内「追问」入口，文案 `追问` |
| `.notes-ask-notice` | composer 内的草稿保护提示行（2500 ms 后消失） |
| `.context-chip` / `.context-chip-remove` | composer 上方 chip（既有；新 chip 复用，不新增类名） |
| `MAX_CONTEXT_NOTES = 10` | 条数上限（§0.2） |
| `MAX_CONTEXT_NOTES_CHARS = 8000` | `reader_notes` 段字符上限（§0.2） |
| `NOTES_ASK_TEMPLATE = "请结合我选中的摘录回答："` | 草稿为空时填入的唯一模板 |

chip 元数据：`kind = "notes"`、图标 `mdi-notebook-outline`（与面板空态图标同源）、标签按 §0.2 两种形态；移除按钮沿用既有 `.context-chip-remove`（`title="本次发送不使用"`）与 `excludeContext("notes")`。

---

### N43 笔记面板多选与选择条

**一句话**：笔记面板每条笔记有可见的选择控件，已选 > 0 时头部出现选择条（`已选 N 条` / `问 AI` / `清空`），选择集与清单永远一致（派生，不产生幽灵选中）。

**用户可见行为**：左栏「笔记」列表里每条笔记左侧多一个方形选择控件；勾选后该行高亮、头部出现「已选 1 条　问 AI　清空」一条；勾选第 11 条时控件禁用并提示已达上限；删除某条已选笔记后计数自动减一。

**验收标准**

1. 【走查】选择集状态只有一处（推荐落在 `stores/notes-store.ts`，与「渲染层笔记唯一数据源」同址）；`NotesPanel` 只通过 store 读写它，不复制到组件本地 ref；注入侧（ChatPanel）只读，不写。
2. 【走查】派生式：计数（`.notes-selection-count` 与 chip）、注入载荷都取自 `notesStore.notes ∩ selectedNoteIds` 的 computed 结果；代码中不存在「变更点手工 splice/同步」的一致性维护。
3. 【走查】`.note-select-wrap` → `.note-select` + `.note-row.selected` 的 DOM 契约成立；选择控件的点击处理带 `@click.stop`（不触发行的「跳回原文」），行的既有 click 行为、`.note-head` 内既有元素（页码徽标 / AI 徽标 / 时间 / 删除）顺序与 DOM 零改动。
4. 【走查】`.note-row.selected.confirming` 沿用既有 `.confirming` 配色（不新增第三种配色）；备注编辑态、展开全文对选择集无影响。
5. 【离屏】勾选 2 条 → 选择条出现，`.notes-selection-count` 文本逐字 `已选 2 条`、`.notes-ask-btn` 文本 `问 AI`、`.notes-selection-clear` 文本 `清空`；`.note-row.selected` 数量 = 2（截图 `40-notes-select-bar.png`）。
6. 【离屏】点 `.notes-selection-clear` → 选择条消失、`.note-row.selected` 数量 0、composer chip 消失（截图 `40b-notes-select-clear.png`）。
7. 【离屏】上限：用 `__pixStub.seedNotes()` 写入 12 条 → 进笔记标签 → 依次点前 10 条 → 选择条 `已选 10 条`；此时**所有未选条目的**控件均 `disabled === true`（断言取第 11 条），其 `.note-select-wrap` 的 `title` 逐字 `最多可注入 10 条笔记，请先取消其它选择`；再点第 11 条 → 计数仍 `已选 10 条`；取消勾选任一条后第 11 条恢复可选（截图 `40c-notes-select-cap.png`）。
8. 【离屏】收敛（删除）：勾选含 `n-current-2` 的 2 条 → 删除 `n-current-2`（走二次确认）→ 选择条 `已选 1 条`、composer chip `摘录 1 条`；随后发送，`sendCalls` 的 message 不含该条（与 N46 验收 7 联合判定）。
9. 【离屏】非 ready 态：`__pixStub.setLoadFailure("corrupt", "笔记文件已损坏")` 后进入笔记标签 → 无 `.notes-selection-bar`、无 `.note-row.selected`；通知区与逃生口按钮行为不变。
10. 【走查】边界：重复点击同一控件是切换（选中 ↔ 取消），不产生重复条目；选择集与顺序无关（去重按 `id`）；点行内其它区域仍走既有 `open-note`。
11. 【走查】读取不写盘：勾选/取消/清空/问 AI 不触发任何 IPC 调用；判定：`ui-shot` 场景中断言 `__pixStub.notesAddCalls().count` 与 fixture `notes.json` 字节不变（本节与 N50 共用断言）。

**涉及文件**：`pix/src/renderer/stores/notes-store.ts`（选择集与动作）、`pix/src/renderer/components/workspace/NotesPanel.vue`（控件与选择条）、`pix/src/renderer/pages/WorkspacePage.vue`（离开笔记标签时清空，一处）。

**数据落盘**：无（选择集只存在于渲染层内存）。

---

### N44 「问 AI」与「追问」：复用既有 quick-ask seam，不覆盖草稿

**一句话**：面板里的两个入口（选择条 `问 AI`、行内 `追问`）只做一件事 —— 把选中的笔记变成本次发送载荷并聚焦 composer，且通过既有 `useQuickAsk.ts` seam 送到 ChatPanel，不新造第二套跨组件机制。

**用户可见行为**：勾好几条摘录点「问 AI」，右侧输入框获得焦点并出现「请结合我选中的摘录回答：」，上方 chip 写明「摘录 N 条」；某条笔记点「追问」则只带这一条，若输入框里已有草稿，草稿一字不动，只多一行「已加入 1 条摘录，草稿已保留」。

**验收标准**

1. 【走查】通道唯一：跨组件动作只在 `pix/src/renderer/composables/useQuickAsk.ts` 内新增**成对**的注册/触发函数（命名由设计定，但必须与既有 `registerQuickAskConsumer` / `emitQuickAsk` 同文件、同范式：ChatPanel `onMounted` 注册、`onUnmounted` 置 `null`）；全仓库不新增第二个模块级 seam 文件，NotesPanel 不直接改 ChatPanel 的本地状态。
2. 【走查】行内「追问」= 把选择集替换为 `{noteId}` 再触发；选择条「问 AI」= 原样使用当前选择集后触发；两者在 ChatPanel 侧共用同一个处理函数（不写两条分支）。
3. 【走查】草稿规则逐条落地：`draft.trim() === ""` 才写模板；否则 draft 不被赋值（grep 该处理函数内只有一处 `draft.value =`，且在空草稿分支内）；`clarifying` 时两个入口 `disabled` 且 `title` 为 §0.4 冻结文案。
4. 【离屏】追问（草稿空）：清空输入 → 点某条笔记的 `.note-ask` → `.input-area` 的 value 逐字 `请结合我选中的摘录回答：`；`document.activeElement` 的 class 含 `input-area`；chip 文案 `摘录 1 条`（截图 `41-note-ask.png`）。
5. 【离屏】追问（草稿保护+显式提示）：先输入 `我的草稿` → 点 `.note-ask` → `.input-area` 的 value 仍逐字 `我的草稿`；`.notes-ask-notice` 文本逐字 `已加入 1 条摘录，草稿已保留`（截图 `41b-note-ask-keep-draft.png`）。
6. 【离屏】追问替换选择集：先勾 2 条 → 点第 3 条的 `.note-ask` → 选择条 `已选 1 条`、chip `摘录 1 条`；发送后 `sendCalls` 的 message 只含该条（N50 断言组）。
7. 【离屏】选择条 `问 AI`：勾 2 条 → 点 `.notes-ask-btn` → 输入框获得焦点，草稿空则填模板（与验收 4 同断言路径）。
8. 【边界】触发时携带的 `id` 已不在清单（行已被删除等）→ 不改变选择集、不改 draft、不聚焦，不抛错；判定【走查】（分支存在且无副作用）。
9. 【边界】流式中（`isStreaming`）允许追问：选择集替换照常；发送走既有 steer 分支，锚点与注入链路不变；判定【走查】+ 既有 steer 场景继续通过。
10. 【走查】既有 PDF 选区快捷入口零改动：`PdfSelectionQuickAsk.vue` 仍调用 `emitQuickAsk`，模板 `请解释选中的这段话：` 与聚焦行为逐字不变。

**涉及文件**：`pix/src/renderer/composables/useQuickAsk.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue`、`pix/src/renderer/components/workspace/ChatPanel.vue`。

**数据落盘**：无。

---

### N45 composer「摘录 N 条」chip（同构、可移除）

**一句话**：选择集非空时，composer 上方出现与既有 chip 同构的「摘录 N 条」，点 × 只影响本次发送；chip 文案与真实注入载荷由同一个纯函数结果派生，不撒谎。

**用户可见行为**：输入框上方 chip 行多出「摘录 3 条」；点 × 后本次发送不带笔记；发送完成后 chip 立即恢复（选择集保留，§0.3 情形 1）。

**验收标准**

1. 【走查】`ContextChipKind` 增 `"notes"`；chip 由既有 `contextChips` 同一个 computed 产出（顺序：`document` → `selection` → `notes`）；移除走既有 `excludeContext(kind)` 与 `.context-chip-remove`，`excludedContexts` / `resetExcludedContexts` 不改语义。
2. 【走查】chip 可见条件：`selectedNotes.length > 0` 且 `"notes" ∉ excludedContexts` 且 `"document" ∉ excludedContexts`（见第 6 条）。**不得**为笔记单独开第二个 chip 行或第二套排除集合。
3. 【离屏】chip 文案：无丢弃时逐字 `摘录 2 条`；有丢弃时逐字 `摘录 2 条 · 超出上限未注入 1 条`；`title` 逐字 `本次注入 1 条；1 条因超过 8000 字符上限未注入`（截图 `42-notes-chip.png` / `42b-notes-chip-overflow.png`）。
4. 【离屏】移除 chip：点 `.context-chip-remove` → chip 消失 → 发送 → `sendCalls` 最近一条 `prompt` 的 `message` 不含 `reader_notes`（截图 `42c-notes-chip-removed.png`）；同一断言确认 `displayText` 仍等于用户输入。
5. 【走查】chip 文案与注入载荷同源：两者都调用 `selectNotesForContext`（N46）；ChatPanel 内不出现第二处条数/长度计算。
6. 【边界】「当前文档」chip 被移除时，「摘录」chip 一并**不渲染**：因为此时 `send()` 走「不发 `<reading_context>`」分支，笔记必然不注入，chip 若仍显示即属撒谎（不变量 5）。判定【走查】+【离屏】（移除文档 chip 后 `.context-chip` 中无「摘录」、发送 message 无 `reading_context`）。
7. 【边界】选择集为空 ⇒ 不渲染 chip、`<reading_context>` 无 `reader_notes` 行（与 R7 输出逐字节相同，N46 验收 2 烟测）。
8. 【回归】既有「当前文档」「选中文本」chip 的可见性、文案、移除行为逐条不变（判定：`git diff` 只含 `ContextChipKind` 增项与该 computed 的条件追加）。

**涉及文件**：`pix/src/renderer/components/workspace/ChatPanel.vue`。

**数据落盘**：无（chip 是渲染层状态；`excludedContexts` 本就只在内存）。

---

### N46 注入契约：`reader_notes` 段的确切形状与唯一渲染点

**一句话**：`buildReadingUserMessage` 增加笔记入参，按 §0.1 的冻结格式追加 `reader_notes` 段；排序、裁剪、渲染三件事都只有一处实现（纯函数、可烟测）。

**用户可见行为**：用户看不到注入文本本身（气泡只显示 `text`），但 chip 是它的可见投影；把笔记放进上下文这件事永远伴随一个可移除的 chip。

**验收标准**

1. 【烟测】逐字节模板：给定 `ReadingSendContext`（含 §0.1 示例的两条笔记：一条有备注、一条来自另一文档）+ 用户输入 `请对比这两处的结论。` → `buildReadingUserMessage` 的输出逐字等于 §0.1 的字面量（含缩进、字段顺序、空行位置、结尾换行）。
2. 【烟测】回归：`notes: []` 时输出与 R7 逐字节相同（无 `reader_notes:` 行）——用 R7 的既有样例（有/无 `selectedText`）各断言一次。
3. 【烟测】文档标识：条目 `doc:` 等于入参 `ReaderNote.docPath` 原样（相对路径、正斜杠）；**条目块内**不出现资料库根、盘符、反斜杠、`id`、`createdAt`、`updatedAt`（既有 `path:` 行的绝对路径不受此条约束）。
4. 【烟测】归一化：`comment` 传 `"第一行\n\n第二行  "` ⇒ 条目 `comment: 第一行 第二行`（连续空白折叠为单个半角空格、首尾去空白）；`comment: ""` ⇒ 无 `comment:` 行。
5. 【烟测】序号连续且从 1 开始；条目之间无空行；`reader_notes:` 行紧随最后一条 `selectedText` 内容之后。
6. 【走查】唯一实现点：`reader_notes` 的字符串拼接、排序、长度比较**只**出现在 `pix/src/renderer/utils/reading-context.ts`（`ChatPanel.vue` 内不出现 `slice` / `join` / 长度比较 / 排序）；`sortNotesForContext` 只在 `pix/src/renderer/utils/notes-path.ts`（复用 `docPathKey`）。
7. 【离屏】真实载荷：勾 2 条（含一条跨文档）→ 发送 → `__pixStub.sendCalls()` 最近一条 `prompt` 的 `message` 逐行含 §0.1 形状（按 `includes` 逐行断言 `reader_notes:`、`1. doc:`、`   page:`、`   kind:`、`   text:`、`   comment:`）；`displayText` 等于用户输入（截图 `43-notes-context-payload.png`）。
8. 【走查】不写进系统提示词：`pix/src/main/reading-prompt.ts`、`pix/resources/skills/**` 零改动（`git diff` 不含）；笔记内容只出现在用户消息里。
9. 【边界】非 PDF 预览（`.md`/`.txt`，`pageCount === 0`）时 `path`/`page` 仍按现状（绝对路径 + `page: 1`），`reader_notes.doc` 仍取笔记自身 `docPath`（与当前文档无关）。

**涉及文件**：`pix/src/renderer/utils/reading-context.ts`、`pix/src/renderer/utils/notes-path.ts`、`pix/src/renderer/components/workspace/ChatPanel.vue`（只传参）。

**数据落盘**：无新增写入；注入文本随既有发送链路进入对话（会话文件由内核写入，行为与今天一致）。

---

### N47 硬上限的实现与可见文案

**一句话**：条数上限在选择期拒绝、字符上限在发送期整条丢弃，两个上限与文案按 §0.2 冻结，判定口径单一（`entries.join("\n").length`）。

**用户可见行为**：最多选 10 条；选得多/选得长时，chip 明确写出「超出上限未注入几条」，绝不悄悄少注入。

**验收标准**

1. 【烟测】字段边界：构造 `entries.join("\n")` 恰为 **8000** 的输入 ⇒ 全部装入、`dropped.length === 0`；**8001** ⇒ 过量条目整条丢弃（`dropped.length === 1`），装入部分仍 ≤ 8000。
2. 【烟测】整条丢弃（无字符级截断）：任意成功装入的条目文本与入参完全一致（含结尾标点），不出现 `slice(0, N)` / `substring` 类产物；判定：断言装入条目的 `text`/`comment` 与入参逐字相等（含边界样本）。
3. 【烟测】单条超限：单条自身 > 8000 ⇒ 装入 0 条、该条计入 `dropped`；输出不含 `reader_notes:` 行；chip 侧文案由同一函数结果派生（`M === N`）。
4. 【烟测】排序确定性：同输入多次调用结果一致；跨文档样本按 `docPathKey` 升序 → `page` 升序 → `createdAt` 升序 → `id` 升序；与该次 `currentDocOnly` 筛选状态、与面板「当前文档置顶」无关（构造样本使两者顺序不同，断言取注入顺序）。
5. 【烟测】条数上限防御：入参 11 条 ⇒ 装入 ≤ 10 条、`dropped.length >= 1`（即使选择侧已拒绝，注入侧仍成立）。
6. 【走查】常量有注释（注明来源与本档编号）、只出现一处；`ChatPanel.vue` 内不重复定义上限数值。
7. 【离屏】超限文案：写入 3 条各 3000 字符的笔记（`"摘".repeat(3000)`，骨架开销约 50 字符/条，余量充足）→ 全选 → chip 逐字 `摘录 3 条 · 超出上限未注入 1 条`，`title` 逐字 `本次注入 2 条；1 条因超过 8000 字符上限未注入`（截图 `42b-notes-chip-overflow.png`）。
8. 【边界】上限常量把「2 条短笔记」判为可装入：n-current-1 与 n-other-1 两条种子笔记（合计远小于 8000）必须全部装入（防止把上限误实现成「最多 1 条」或误算段长）。

**涉及文件**：`pix/src/renderer/utils/reading-context.ts`、`pix/src/renderer/components/workspace/ChatPanel.vue`（只消费结果）。

**数据落盘**：无。

---

### N48 发送链路的单点快照与 chip/exclude 交互

**一句话**：`send()` 内对笔记选择只取**一份**快照，与 R7 的阅读锚点快照同一同步段构造；chip 的文案与是否排除决定「注入什么」，不决定「读什么」。

**验收标准**

1. 【走查】`send()` 内对选择集只读一次（形如 `const notesSnapshot = …`），随后 `buildReadingUserMessage` 的实参与 chip 派生都取这一份；`send()` 内不出现第二处选择集读取或第二次裁剪实现。
2. 【走查】快照构造位置在 `sessionStore.appendOptimisticUserMessage(...)` 调用**之前**，与 `readContext` / `anchor` 同一个同步段（`ChatPanel.vue:290` 起）；锚点登记不受 chip 排除影响（R7 语义保持）。
3. 【走查】排除分支精确：`"document" ∈ excluded` ⇒ 不发 `<reading_context>`（笔记一并消失）；`"notes" ∈ excluded` ⇒ 发 `<reading_context>` 但无 `reader_notes` 行；`"selection" ∈ excluded` ⇒ 现状（`selectedText` 为空）。
4. 【离屏】exclude 与恢复：移除「摘录」chip → 发送 → `sendCalls` 的 message 无 `reader_notes`；发送完成后 `.context-chip` 中「摘录 N 条」重新出现（`finally` 复位，§0.5）。
5. 【离屏】发送失败保留（§0.3 情形 2）：`__pixStub.setSendFailure("throw")` → 发送 → 出现 error 块、乐观块被回滚、chip 仍在、选择条仍 `已选 2 条`；`setSendFailure(null)` 后重发成功且 message 含 2 条笔记（截图 `45-notes-select-send-failure.png`）。
6. 【离屏】steer 路径：流式中发送同样注入（`sendCalls` 最近一条 `type === "steer"` 且 message 含 `reader_notes`）。
7. 【走查】清空时机唯一：行内选择的清空只由 §0.3 的四个触发点（`resetNotes()`、离开笔记标签、`status !== "ready"`、派生收敛）产生；`send()` 内**不得**清空选择集。

**涉及文件**：`pix/src/renderer/components/workspace/ChatPanel.vue`、`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/pages/WorkspacePage.vue`。

**数据落盘**：无。

---

### N49 顺带项：阅读锚点解析的索引化（消掉每帧二次方开销）

**一句话**：`readingAnchorFor` 不再用 `displayBlocks.findIndex` 做 O(blocks) 查找（R7 代码审查记录的「每帧每块两次调用 ⇒ 重渲染二次方量级」），改为 id→位置索引或模板传索引，行为逐字节等价。

**用户可见行为**：无直接可见变化；长会话（数百块以上）滚动与流式期间的渲染开销不再随块数平方增长；回答块「存为笔记」的提示与行为一字不变。

**验收标准**

1. 【走查】`pix/src/renderer/stores/session-store.ts` 的 `readingAnchorFor` 内不存在 `findIndex`（`grep -n "findIndex" pix/src/renderer/stores/session-store.ts` 不命中该函数）；解析规则仍是「只认紧邻前一个 `user-message` 块，无锚点返回 `null`」，函数签名与返回类型零改动。
2. 【走查】缓存失效判定覆盖全部块列表变更点并列在设计档：新增块（多处 `displayBlocks.value.push`）、失败回滚删除（`failOptimisticUserMessage` 的 filter）、`MAX_DISPLAY_BLOCKS` 裁剪（`slice`）、`clearSession`（`displayBlocks.value = []`）、块内容就地更新（流式 delta，id 与位置不变）；不得引入「id 可复用」假设（`nextBlockId` 单调）。
3. 【离屏】`anchor-cache` 断言组：(a) 既有 30 场景「第 2 页发送 → 翻到第 3 页 → 切到另一文档后提示仍是第 2 页」全绿（缓存未被错误刷新）；(b) 新场景 `46-anchor-cache.png`：连续两轮（第 2 页一轮、第 3 页一轮）后，两个回答块的 `title` 分别含「第 2 页」与「第 3 页」（缓存串号的最强反证）；(c) 发送失败回滚后再发一轮：旧块已消失、新块锚点正确（删除路径的失效反证）。
4. 【走查】渲染路径每帧每块至多解析一次：回答块模板中 `answerSaveTitle` / `answerSaveDisabled` 共用一次解析结果（不得各自再查一次表）。
5. 【check】`npm run check` 0 error。
6. 【开发档】必须写明：改动点、复杂度从 O(blocks)/次 变为 O(1)/次、失效策略，以及「本轮未实测大列表帧率」这一事实。

**涉及文件**：`pix/src/renderer/stores/session-store.ts`、`pix/src/renderer/components/workspace/ChatPanel.vue`（调用点收敛）、`pix/scripts/ui-shot.mjs`（断言）。

**数据落盘**：无。

---

### N50 离屏取证面（stub 原语 + 40 段场景 + 断言组）

**一句话**：把 N43–N49 的可见行为与真实发送载荷做成 ui-shot 可判定的取证面。

**验收标准**

1. 【走查】stub 新增控制口（`__pixStub`）：
   - `sendCalls()` → `{ count, payloads: 最近 8 条 { type, message, displayText } }`，只记录 `type === "prompt" | "steer"`（`sendCalls` 是 N46/N48 的核心判据）；
   - `clearSendCalls()` → 清空计数（场景隔离）；
   - `setSendFailure(mode)` → `mode === "throw"` 时 `sendCommand` 抛 `new Error("stub 发送注入异常")`；`mode === "fail"` 时返回 `{ success:false, error:"stub 发送被拒绝" }`；`null` 复位。
   既有 `seedNotes()`（写穿 fixture 文件）、`notesAddCalls()`、`setLoadFailure()` 保持现状。
2. 【走查】新增场景（40 段，避开既有 00–11、20–24、30–36）：`40-notes-select-bar`、`40b-notes-select-clear`、`40c-notes-select-cap`、`41-note-ask`、`41b-note-ask-keep-draft`、`42-notes-chip`、`42b-notes-chip-overflow`、`42c-notes-chip-removed`、`43-notes-context-payload`、`44-notes-select-delete`、`45-notes-select-send-failure`、`46-anchor-cache`。
3. 【走查】场景数据准备：`40c` 用 `__pixStub.seedNotes([...12 条，id 形如 cap-1…cap-12...])` 并在场景结束前恢复标准种子（4 条，字面量在脚本内构造）；`42b` 写入 3 条 3000 字符笔记；两者都通过「切标签 → 切回」触发 `loadNotes`（不新增刷新入口）。
4. 【离屏】`MEASUREMENTS.json` 至少新增五组断言（脚本内 `throw` 实现）：`notes-select`（选择条文案/行态数量/上限禁用与 title/清空后归零）、`note-ask`（输入框 value、`document.activeElement`、提示行文案、选择集被替换后的计数）、`notes-chip`（无丢弃/有丢弃两种文案与 title、移除后 payload 无 `reader_notes`、文档 chip 被移除时摘录 chip 不渲染）、`notes-context`（真实 message 逐行字面量 + `displayText` + 无 `reader_notes` 的回归用例）、`anchor-cache`（N49 验收 3）。
5. 【离屏】既有 00–11、20–24、30–36 场景全部继续通过；截图数不少于改前；`MANIFEST.json.failure === null`；失败场景落 `99-failure-state.png` 且退出码 1。
6. 【check】`cd pix && npm run check` 0 error（stub 为 `.mjs` 字符串模板，不改类型面）。

**涉及文件**：`pix/scripts/ui-shot.mjs`。

**数据落盘**：只写 `%TEMP%` 下的临时 fixture（不写仓库）。

---

### N51 回归与零外溢

**一句话**：本轮不破坏既有语义，也不越出白名单。

**验收标准**

1. 【回归】`ui-shot.mjs` 既有全部场景通过（改前基线先跑一次留档，改后比对；截图数只增不减）。
2. 【check】`cd pix && npm run check` 0 error。
3. 【走查】`git diff --stat` 只含 §4 白名单文件；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置零改动。
4. 【走查】**主进程面零改动**：`pix/src/main/**` 与 `pix/src/shared/types.ts` 的 `git diff` 为空；IPC 通道数量不变（`notes-load`/`notes-add`/`notes-update`/`notes-delete`/`notes-export`/`notes-reset` 六条）；不新增依赖；不写死文档名/页码/上限以外的魔法数。
5. 【走查】`pix/src/main/reading-prompt.ts`、`pix/resources/skills/**` 零改动；`<reading_context>` 既有字段名与顺序零改动。
6. 【走查】`notes.json` 只读：本轮任何路径都不写该文件（判定：`git diff` 不含 `main/notes-store.ts`；离屏场景中 fixture 字节在「选择/清空/发送」前后不变）。
7. 【走查】不新增死代码：没有未被调用的导出、没有为主路径之外的场景预留的开关。

---

## 3. 反需求（本迭代明确不做）

1. **不做全量笔记注入**、不做「总是包含笔记」的开关：与不变量 5（必须显式可移除）直接冲突，且会把上下文成本变成不可控变量。
2. **不给 agent 新增读笔记的工具**：agent 已能读 `notes.json`（文件在资料库内）；新增工具会与「用户挑选注入」形成两条并行通路，并让「谁决定了上下文」不可解释。
3. **不把笔记选择做成持久化偏好**：不写 `settings`、不写 `reader-state.json`、不写 `notes.json`；选择集是「这次提问的载荷」，跨会话保留会变成隐性常开。
4. **不改系统提示词**：不教模型「存在笔记」这件事（`reading-prompt.ts` 零改动）；模型只被告知本次被注入的内容。
5. **不做字符级截断、不做摘要压缩**：整条丢弃是唯一超限策略（半截原文比不注入更糟，且无法在 UI 上解释「注入了哪一半」）。
6. **不做笔记面板的其它批量能力**（批量删除 / 批量导出 / 拖拽排序 / 多选搜索）：本轮只加选择控件与选择条，避免面板变成第二战场。
7. **不新增 IPC 通道、不改主进程与 preload**：注入是纯渲染层行为，落盘面零变更。
8. **不把 `<reading_context>` 渲染进气泡**：气泡只显示 `text`（`displayText`），chip 是唯一的可见投影；改动会同时影响语音/复制等既有行为。
9. **不修既有的「选中文本」chip 在「当前文档」chip 被移除时仍显示的不一致**：本轮只保证新增的「摘录」chip 不撒谎（N45 验收 6），既有 chip 的行为面按红线零改动（若要一并修，属另一轮，见 §5 开放问题 3）。
10. **不做 `notes.json` 的外部文件监听 / 自动刷新**：重载只在既有入口（进入笔记标签、错误态「重试」）发生，选择集按 §0.3 情形 7 收敛。
11. **不做其它性能优化**（虚拟滚动、displayBlocks 结构改造）：本轮只做 N49 的锚点索引化。
12. **不给回答块新增动作**（引用 / 重新生成 / 连带注入笔记）：R7 的动作区保持不变。

---

## 4. 文件白名单

### 主进程面

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `pix/src/main/**`（`ipc-handlers.ts`、`preload.ts`、`notes-store.ts`、`reading-prompt.ts`、`reader-state-store.ts`、`session-bridge.ts`、`pdf-tools.ts`、`library-root.ts`、`index.ts`） | **不改** | 本轮无新 IPC、无新落盘字段、无系统提示词改动 |
| `pix/src/shared/types.ts` | **不改** | 注入相关类型只服务渲染层，落在渲染层文件内；若设计确需新增共享类型，必须先回报理由（不得改动既有类型） |

### 渲染层面（含取证脚本）

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `pix/src/renderer/stores/notes-store.ts` | 修改 | 选择集（`selectedNoteIds` 或等价）+ 派生 `selectedNotes`/`selectedCount` + 切换/清空动作；`resetNotes()` 同时清空选择集；`status !== "ready"` 时选择集为空；既有动作语义与 `applyNotes` 覆盖策略**不改** |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | `.note-select-wrap`/`.note-select`、`.note-row.selected`、`.notes-selection-bar`（`.notes-selection-count`/`.notes-ask-btn`/`.notes-selection-clear`）、`.note-ask`；分组/排序/筛选/计数/删除确认/错误态/备注/展开**零改动** |
| `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改 | `ContextChipKind` 增 `"notes"`、notes chip、`send()` 单点快照与传递、seam 消费（追问 → 聚焦/模板/`.notes-ask-notice`）、回答块锚点解析每帧一次；既有 chips / 复制 / 存为笔记 / `[[pN]]` / 滚动跟随逻辑零改动 |
| `pix/src/renderer/composables/useQuickAsk.ts` | 修改 | 新增成对的笔记追问注册/触发函数（与既有 quick-ask 并存）；仍是唯一 seam 文件 |
| `pix/src/renderer/utils/reading-context.ts` | 修改 | `ReadingSendContext` 增笔记入参（类型落在本文件）；`selectNotesForContext`（排序 + 上限裁剪，纯函数）；`reader_notes` 段渲染（唯一实现点）；行内归一化 |
| `pix/src/renderer/utils/notes-path.ts` | 修改 | `sortNotesForContext`（确定性排序纯函数，复用 `docPathKey`）；既有分组/排序/路径函数零改动 |
| `pix/src/renderer/pages/WorkspacePage.vue` | 修改 | `selectLeftTab`：离开「笔记」标签时清空选择集（一处）；`resetNotes()` 调用点（挂载/卸载/goHome）不变 |
| `pix/src/renderer/stores/session-store.ts` | 修改 | `readingAnchorFor` 索引化（N49）；解析语义、签名、返回类型零改动 |
| `pix/scripts/ui-shot.mjs` | 修改 | stub 原语（`sendCalls`/`clearSendCalls`/`setSendFailure`）+ 40 段场景 + 五个断言组 |
| `pix/src/renderer/components/workspace/{PdfSelectionQuickAsk,PdfViewer,ReaderPanel,LibraryPanel,KnowledgeMap,PdfSearchPanel}.vue`、`components/session/*.vue`、`components/input/*.vue`、`composables/{useRpc,useRegionCapture}.ts`、`stores/{reader,reader-state,session,project,settings,auth}-store.ts`、`utils/{note-capture,markdown,session-title,image-capture}.ts` | **不改** | 见不变量 1/2/3 |

范围外（任何情况下不动）：`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置、`pix/resources/skills/**`。

---

## 5. 风险 Top3 与判定方式

**R1 「可见面与真实载荷不一致」** —— 最隐蔽的失败模式：chip 写「摘录 3 条」而 message 里只有 2 条、或反过来把没显示的笔记送进模型；根因通常是两处各算一遍裁剪、或在面板顺序/快照之间取了不同来源。

- 判定：N46 验收 1/3/7（烟测逐字节模板 + 离屏真实 `sendCalls` 载荷）+ N45 验收 3/5（chip 文案与 `selectNotesForContext` 同源）+ N48 验收 1/2（`send()` 内选择集只读一次）+ N47 验收 8（短笔记必全装入的反例保护）。
- 失败信号：`reader_notes` 段在 `ChatPanel.vue` 内被拼接；`selectNotesForContext` 不存在或存在两份；chip 条数与 message 条目数不等；注入顺序随「当前打开哪篇文档」变化。

**R2 「幽灵选中（选择集与清单脱钩）」** —— 会把已删除的笔记（或跨工作区残留的旧选择）悄悄注入上下文：用户看不见、也无从解释。

- 判定：N43 验收 2/8/9（派生式走查 + 删除已选笔记后计数与载荷同步 + 非 ready 态无选择条）+ §0.3 情形 5/7（`resetNotes` 清空、切标签清空）+ N43 验收 11（不落盘、不发 IPC）。
- 失败信号：出现 `watch(notes, …)` 里手工 splice 的一致性维护；删除后计数不变；错误态仍渲染 `.notes-selection-bar`；跨工作区后 chip 仍显示旧条目。

**R3 「上限策略落错」** —— 字符上限被实现成 `slice(0, 8000)`（半截原文进模型），或上限根本没生效（一次提问灌进上万字符），或判定口径与 chip 计数不同源。

- 判定：N47 验收 1/2/3/5（烟测：8000 通过 / 8001 整条丢弃 / 单条超限 0 条 / 11 条防御）+ N47 验收 7（离屏超限文案）+ N47 验收 4（排序确定性：同一选择多次发送注入同一批条目）。
- 失败信号：装入条目的 text 与入参不逐字相等；`entries.join("\n").length > 8000` 仍发生；同一选择两次发送注入不同条目。

**次级风险（不占 Top3）**：N49 的索引化若失效判定写错，会让 R7 的锚点语义漂移（今天第 2 页、明天第 3 页）——这类错误在走查里极难发现。判定：N49 验收 3 的 `anchor-cache` 断言组（同会话两轮不同页 + 回滚后重发）+ 既有 30–36 场景全绿。

**开放问题（需负责人确认，不阻塞本档定稿）**：
1. 上限数值 10 条 / 8000 字符是否与预期一致（数值一经开发即为冻结值，改动等于改需求档）。
2. 「离开笔记标签即清空」会让「选完摘录 → 去资料库核对另一篇 → 回来继续选」丢选择；若希望保留，需把清空判据收窄为「离开工作区 / 工作区切换」。
3. 「当前文档」chip 被移除时是否同时隐藏既有的「选中文本」chip（本轮只保证新增的「摘录」chip 不撒谎，既有 chip 行为不改）。
