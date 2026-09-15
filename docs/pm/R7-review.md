## 需求评审（R7）

> 评审对象：`docs/pm/R7-req.md`（N35–N42 AI 结论入库）。评审方式：需求档逐条 + 真实代码只读核对（`main/notes-store.ts`、`main/ipc-handlers.ts`、`main/preload.ts`、`main/library-root.ts`、`shared/types.ts`、`renderer/types/session.ts`、`stores/session-store.ts`、`stores/notes-store.ts`、`stores/reader-store.ts`、`utils/notes-path.ts`、`composables/useRpc.ts`、`components/workspace/{ChatPanel,PdfSelectionQuickAsk,NotesPanel,ReaderPanel}.vue`、`components/input/InputArea.vue`、`pages/WorkspacePage.vue`、`scripts/ui-shot.mjs`、`tsconfig*.json`）。
> 结论：**revise**。must-fix 8 条（见 §2），改完才进设计。语义主线（锚点＝发送时刻快照、kind 进数据契约、单一超长口径）本身成立；阻塞项集中在「锚点解析规则没写死」「离屏驱动原语缺失」「stub 写穿口径只覆盖一半」「store 层 kind 校验缺位（数据风险）」四处。

---

### 0. 已核对为真、实现阶段不得翻案的前提

1. §0.1 的形式论证成立：`normalizeNoteText` 只做折叠，故「归一化长度 ≤ 原文长度」恒成立；若按归一化长度判定却写原文，一条超 4000 的条目会让 `isReaderNote`（`notes-store.ts:104`，长度项在 `:117`）否定整库 → `parseNotesFile` 判 `corrupt`。**「入库形态 = 归一化形态」是必须保持的推导，不是偏好**；§3 反需求 6 的封口也成立。
2. §0.2 的 2 条并存成立：`addNote` 的去重查找在写盘之前（`notes-store.ts:285-290`），命中即 `duplicateOf` 且不写盘；两条 `kind` 不同 ⇒ 键不同 ⇒ 两条独立条目，面板排序（`notes-path.ts` 的 `page → createdAt`）不含 kind ⇒ 先摘录后结论。
3. 「锚点挂用户块」在既有消息模型上可行：会话确认分支只覆盖 `text`/`attachments`/`timestamp`（`session-store.ts:225-231`），新增可选字段不会被清；`loadMessages`（`:615`）先 `clearSession()`（清空 `displayBlocks` 与乐观表）再经 `appendUserOrNoteMessage`（`:206`）构造用户块，天然不赋值锚点；`MAX_DISPLAY_BLOCKS` 的裁剪（`:154`）只丢尾部之前的内容，与 N37 验收 5 的描述一致。
4. 面板与导出的既有结构逐条与档中引用一致：`.note-head` = `.note-page-badge` → `.note-time` → `.note-delete`（`NotesPanel.vue:319-334`），计数文案 `共 N 条` / `当前 X 条 / 共 N 条`（`:55-58`），导出模板 `# 阅读笔记 · <name>` / `## <docPath>（N 条）` / `### 第 N 页` + `> ` + `备注：` / 条目间 `\n\n---\n\n`（`notes-store.ts:233-270`）。
5. 离屏 fixture 面已够用：`SAMPLE_PAGES` 3 页、`OLDER_PAGES` 2 页、`reading-notes.md` 文本预览、A/B 双工作区、`writeFixtures()` 真写 `notes.json`、stub sandbox 关闭可 `require("node:fs")`（R6 must-fix 5 的 3 页冻结已落地）。
6. 现状全仓库只有一处 `addNote(` 调用点（`PdfSelectionQuickAsk.vue:153`）；`ReaderNoteDraft` 加必填 `kind` 后 `preload.ts` 与 `PixApi` 无需改动（`shared/types.ts` 是唯一契约源）；`renderer/types/session.ts` 只是 re-export `DisplayBlock`，改一处即可；无 `exactOptionalPropertyTypes`，加可选字段不会波及其它构造点。
7. 运行中发送的入口只有 steer：`ChatPanel.send()` 以 `isStreaming` 分流到 `sendSteer`（`:314`），渲染层无 `follow_up` 发送入口（`useRpc.ts` 只有 `set_follow_up_mode` 与队列计数）——N37 只需覆盖 steer，但设计档要声明「将来若加 follow-up 入口须按同一规则登记」。
8. `sendPrompt`/`sendSteer` 走 `sendCommandOrThrow`（`useRpc.ts:256-276`），失败必抛 ⇒ `failOptimisticUserMessage` 的删除路径（`ChatPanel.vue:320`）真实可达，N37 验收 6 成立。

---

### 1. 评审清单逐条结论

**1) 可判定性** —— 大体可用四种证据判定；不可判定/会误判的有 5 处：

- **N36 验收 2 的 hover 截图不可判定**（must-fix 2）：`ui-shot.mjs:1656-1665` 是 `show:false + offscreen:true` 窗口，脚本内无任何 hover 原语（无 `sendInputEvent`、无 `:hover` 覆盖手段），而 `.message-copy-btn` 靠 `.agent-message:hover` + `opacity:0` 才显形（`ChatPanel.vue:1068-1090`）——「同时出现两个动作」这一句在离屏拍不到。同一条依赖 N41 未给出的「点发送」原语（`.input-area` 是普通 textarea + `v-model` + Enter→send，`InputArea.vue:20-52`；`.composer-send` 又是 `!isStreaming` 才渲染且按 `draft.trim()` 判禁用）。
- **N36 验收 9 的判据与主进程事实不符**（must-fix 6）：`isLibraryFilePath`（`library-root.ts:38-52`）只做前缀包含、`realpathSync` 失败被吞（注释即写明「Missing files still 404 at fetch time」），因此「锚点文档已被删除」**不会**返回 `outside`，`addNote` 反而成功落库。
- **N37 验收 1 的字面判据必然失败**（must-fix 5）：`ChatPanel.vue:306-309` 的 `buildReadingUserMessage` 实参本就在读 `readerStore.filePath/page/pageCount/selectedText`。
- **N36 验收 8 的证据口径错位**：【走查】只读代码，但该条要求「构造含代码块与标题的回答 → 看 `notes.json` 的 text」，实际需要【离屏】或【烟测】；N41 新增的断言组也没有覆盖它（`answer-anchor` 只判 `page`/`kind`）。
- **N41 的写穿口径只写了一半**（must-fix 3）：stub 现为纯内存（`notesAdd`/`notesDelete`/`notesUpdate`/`notesReset` 都只改数组，`ui-shot.mjs:490-541`），文件只在 `writeFixtures()` 写一次；N39 验收 4 却用「`notes.json` 少一条」判删除。

其余抽查通过：N35 验收 2–5、8（烟测可构造，`setLibraryRoot` 是现成接缝）；N36 验收 3（`message_start` + `message_update` 后数量 0 可判）；N36 验收 4/5（3 页 fixture 支撑「第 2 页发送→翻第 3 页」）；N36 验收 7（`notesAddCalls().count` 不变）；N38 验收 1/2/3（4000/4001 边界与 `text.length > MAX_NOTE_TEXT_LENGTH` 一致）；N39 验收 1/3/5/8；N40 全条（导出是主进程纯函数）；N42 验收 3/6（`git diff --stat` 与通道计数）。

**2) 锚点语义是否真的可实现** —— 逐问写清：

- **发送时刻快照的落点**：`ChatPanel.send()`（`:287` 起）内、`sessionStore.appendOptimisticUserMessage`（现状 `:293`）**之前**取值，作为第三参传入；`buildReadingUserMessage` 的实参在 `:305-312`（`readerStore.filePath/page/pageCount/selectedText` 在 `:306-309`）。不变量 5 要求「同一处、同一份来源」⇒ 实现必须先把快照收进一个本地对象，再同时喂 `:293` 与该实参，而不是在读 `readerStore` 时顺手复制一份。注意现状 `:303` 有 `excluded.has("document")` 分支：**锚点登记不得受该分支约束**（文档 chip 被排除时 `<reading_context>` 不注入，但 (a) 的条件是「发送时 `filePath` 非空」，需求须写明这一点）。
- **steer / follow-up 这一轮取哪一次**：steer 走同一快照（`:314`），其乐观块在流式块**之后**、后续回答块**之前**，因此只要解析规则是「紧邻前一个 user-message 块」，steer 这一轮就落 steer 自己的锚点；若解析规则写成「向前最近一个**带锚点**的用户块」，在确认不匹配导致乐观块与确认块并存时会得到不同答案（见 must-fix 1）。follow-up 渲染层无入口（§0.7）。
- **从会话文件重载的历史消息走哪条分支**：`get_messages` → `sessionStore.loadMessages`（`:615`）→ 用户块经 `appendUserOrNoteMessage` 构造，无锚点 ⇒ 一律走 (b)/(c)；且 `loadMessages` 前的 `clearSession()` 会清掉带锚点的旧块，**不存在跨重载的锚点残留**。触发条件不是「进入工作区」而是 `syncWorkspaceState({ loadMessagesIfEmpty: true })` + `displayBlocks.length === 0`（`WorkspacePage.vue:56-72`）——N36 验收 6 的「重新进入工作区」必须先把块清空（回首页 → 再点项目卡），否则历史不重载、断言测的不是该分支。
- **重载后 continuation 能否重新获得锚点**：能。`send()` 每轮都重新快照并登记（唯一写入点在 `session-store.ts:255` 的块构造处；`:238` 的另一处 user-message 构造**不得**赋值，否则历史/确认会伪造锚点）。前提是重载已完成且仍在同一 pinia 会话内。
- **steer 的边界**：若 steer 的确认事件未携带匹配文本/附件，会另压入一个无锚点用户块，此时「紧邻」与「跳过」两种规则给出不同落点——这一条同时是 must-fix 1 与 must-fix 7 的交叉点。

**3) 是否与既有契约冲突** —— 无硬冲突，六项逐条：

- `notes.json` 严格损坏策略：本轮只加一个入参维度，`version`/`ReaderNote` 字段/码表/备份与逃生口都可零改动；但**校验必须落在 `addNote` 内**（现 `notes-store.ts:295` 硬编码 `kind: "excerpt"`、无 kind 校验），见 must-fix 4。
- 去重键：`duplicateKey` 加 kind 后，对「仅 excerpt」输入的结果与改前逐条等价（`docPathKey + page + text` 不变，只是多了常量段）；跨 kind 不再互相命中 ⇒ N35 验收 3/4 的判定方式正确。
- 导出结构：`renderMarkdownEntry`（`notes-store.ts:233`）单点分支即可，导出只读 `notes.json`（`exportNotesMarkdown` 只写 `notes.md`）。
- `notes-update`/`notes-delete` 复用：answer 与 excerpt 走同一 `runMutation`（`:132`）/`applyNotes`（`:75`）全量覆盖，无乐观合并；删除按 `id`，与页/文本/kind 无关。
- 渲染层不拼路径：N36 验收 12 与现状一致（draft 传绝对路径，相对化在主进程）；笔记跳回仍走既有 `absoluteDocPath`（`WorkspacePage.vue:203-212`），本轮不改。
- 面板分组与排序：`utils/notes-path.ts` 零改动即可满足（kind 不参与比较）。
- 两处**口径冲突**（非硬冲突但会误判）：N39 验收 4 用文件态判据（must-fix 3）；N36 验收 5 的「切到另一篇文档」是同根内文档 ⇒ 走的是成功路径，与验收 9 想覆盖的 `outside` 不是同一条。

**4) 失败路径是否写全** —— 七项逐条：

- 超长：N38 验收 1/2/3 齐；实现注意 `ERROR_MESSAGES` 是 `Record<ReaderNotesErrorCode, string>`，**不能按 kind 加键**（否则动码表、违反 N35 验收 7），只能就地分支取两条字面量。
- 空内容：N38 验收 5 双层（`normalizeNoteText` 后为空 → `invalid-input`；渲染层 `block.content.trim() === ""` 不渲染按钮）✓。
- 无锚点无打开文档：N36 (c) ✓（含「title 挂容器避开禁用控件不派发事件」的正确规避）。
- **未选择资料库根**：无验收条目；离屏也造不出（stub 恒有 `CONFIG.root`），只能靠 `setNotesAddFailure("no-root")` 注入 ⇒ 归次级项。
- **`notes.json` 损坏**：无验收条目；`addNote` 会在守卫后被 `loadNotes` 同款判据挡下（`corrupt`），反馈文案「保存失败：笔记文件无法读取（文件已损坏，未被修改）」无人断言 ⇒ 归次级项。
- 含 Markdown 与代码块：§0.1 已定形态 ✓，但证据口径见 §1.1 第 4 点。
- 快速连点：N38 验收 8 只覆盖「反馈期不可点」，**未覆盖 IPC 在途窗口**（见 must-fix 8）。

**5) 是否有不可逆数据风险** —— 3 条，2 条需改：

- **最严重：kind 未在 store 层校验**（must-fix 4）。一条非法 kind 落盘即让整库被判损坏，用户读到的是「笔记文件无法读取」，根因（一次越界写入）离现场很远；这正好命中 R3 风险项的口径。
- **把 answer 写成 excerpt**（R2）：只要 `duplicateKey` 与落盘都取 `draft.kind`、写盘路径保持唯一（`notes-store.ts:293-303` 一处），即可消除；不要为此新增第二条写路径。
- **去重误命中**：跨 kind 已修好；同 kind 命中仍是「不写盘 + `duplicateOf`」⇒ 渲染层三态里的「已在笔记中」语义正确（`renderer/stores/notes-store.ts:118-129`：`result.note` 缺失即判重复，与主进程行为对齐）。
- 无「半条数据」风险：`addNote` 的拒绝分支全在 `writeFileAtomic` 之前（`:280-291`），协议仍是 tmp + rename。

**6) 是否有隐性大成本项** —— 无架构级成本，重心在取证脚本：

- 类型面零扩散：加可选字段 + 两个新类型，`renderer/types/session.ts` 只 re-export，无 `exactOptionalPropertyTypes`。
- `session-store`：第三参 + 一个只读 `displayBlocks` 的解析函数（纯函数、无副作用）——小。
- `ChatPanel`：动作区 + 提示 + 三态原位反馈 + 点击保存，与 `PdfSelectionQuickAsk` 同范式（含 `pending` 守卫、`FEEDBACK_MS`）——中。
- **`ui-shot.mjs` 是唯一的大头**：`onAgentEvent` 现为丢弃式 no-op（`ui-shot.mjs:472`）、`get_messages` 硬编码 `[]`（`:287`），本轮要一次做成「保留回调 + `emitAgentEvent` + `setMessages` + `notesAddCalls` + `setNotesAddFailure` + `notesAdd` 写穿 + 9 个场景 + 4 组断言 + hover/composer 驱动原语」，且 30 段是本脚本**首批对话场景**（既有 00–11/20–24 无任何 chat 驱动），风险与 R6 的 B 面同级。
- 无新 IPC、无新依赖、不动 `packages/**` 与构建配置 ✓；`reading-prompt.ts`/`skills/**` 零改动 ✓。

---

### 2. must-fix（8 条，改完才能进设计）

1. **锚点解析规则未写死，与 N36 三分支表冲突。** 「向前最近一个带锚点的用户块」会跨过无锚点块，把上一轮锚点当本轮目标。写死为「只认紧邻前一个 user-message 块，无锚点即返回 null」；若允许跳过，须给出跳过边界并补一条跨轮离屏场景。
2. **N36 验收 2 hover 截图与 N41「点发送」缺驱动原语。** 离屏窗口 show:false + offscreen，脚本无 hover/输入原语，两动作靠 :hover 显形、拍不到。要么在 N41 写死驱动序列（composer 与 hover 各一条），要么把验收 2 降为 DOM 断言。
3. **stub 写穿只覆盖 notesAdd，而 N36 验收 4/5、N39 验收 4 是文件态判据。** 四个变更口只改内存。写死：notesAdd/notesUpdate/notesDelete/notesReset 与 seedNotes 全部写穿同一个 fixture 文件，或统一改判据为 notesLoad 返回态。
4. **N35 验收 5 要求 store 层拒非法 kind，但 §2.0 与涉及文件表只给守卫层。** addNote 落 draft.kind，非法 kind 会让 isReaderNote 判整库 corrupt。把「addNote 内 kind 白名单 → invalid-input，先于读写盘」写进 N35 与文件表。
5. **N37 验收 1 的字面判据不可满足。** ChatPanel.vue:306-309 的实参本就读取 readerStore 四项，chips 链路禁改。改写为「filePath/page 各只读一次组成锚点对象，实参取同一对象，且不受 chip 排除分支约束」。
6. **N36 验收 9 造不出 outside。** library-root.ts:38-52 只做前缀包含、不校验存在，资料库内文件被删仍保存成功。改写为「注入 outside + 断言『保存失败：该文档不在当前资料库内』+ 不写盘 + 按钮回可点」，并另写死「锚点文档已被删除」的行为。
7. **N41 未定事件序列，N36 验收 4 与 N37 验收 3 互相污染。** 确认事件不匹配时 matchOptimisticUserMessage（session-store.ts:117）不命中，回答前多出无锚点用户块。写死序列（displayText 等于发送文本）并声明不匹配时的锚点归属。
8. **快速连点只覆盖反馈期，未覆盖 IPC 在途窗口。** N38 验收 8 只挡反馈期，在途连点会发两次 notes-add，反馈可能显示「已在笔记中」而库已写入。按 PdfSelectionQuickAsk 的 pending 范式加守卫，并在 N38 增断言「连点两次 → count === 1」。

---

### 3. 次级项（不阻塞，但设计档/开发档必须写死）

1. **N36 验收 8 的证据口径**：【走查】不能「构造回答」。改为【离屏】或把它并进 N41 的 `answer-anchor` 断言组（断言 fixture 内该条 `text` 不含 `<div`、`<p>`、`class=`），否则这条只等于「读了 `block.content` 这一行」。
2. **N39 验收 3 的种子要冻结字面量并点名 id**：新增 answer 种子的 `createdAt` 必须晚于 `n-current-2`（否则同页顺序反了）；同时注意场景 31 会往 `sample-paper.pdf` 第 2 页再写一条 answer，同页将有 3 条，断言必须按 `id` 取而不是按位置。
3. **两个无验收的失败分支**：`no-root` 与 `corrupt`。建议并入 N38 的失败态断言组（`setNotesAddFailure("corrupt")` 后逐字断言「保存失败：笔记文件无法读取（文件已损坏，未被修改）」），否则只能靠走查且不覆盖「不把面板推入错误态」这一句（N36 验收 9 只锁了 `outside`）。
4. **锚点文档是 md/txt 与「已被删除」两种 note 的跳回行为**要写死：前者走 `jumpToPage` 的「非 PDF 直接忽略」（`ChatPanel.vue:428-437`）✓，后者点击后 `ReaderPanel` 的失败态文案须与既有预览失败态一致（不新增分支）。
5. **反馈时长常量**：`FEEDBACK_MS = 2500` 是 `PdfSelectionQuickAsk` 的局部常量（`:22`），不可跨组件复用；ChatPanel 侧要新定义同值常量并注释来源，别去 import 组件内的常量（会引入循环/耦合）。
6. **动作区定位**：`.message-copy-btn` 是 `position:absolute; top:2px; right:2px`（`:1068-1072`），N36 验收 1 又要求它「DOM、类名、复制行为零改动」。设计须写死新容器的偏移（例如 `right: 88px`）或改用 flex 容器；否则两个动作重叠，验收 2 的截图与验收 1 的「同一排」都判不了。
7. **N37 验收 2 的「唯一赋值处」应写成可 grep 的形式**：期望 `grep -n "readingAnchor" pix/src/renderer/stores/session-store.ts` 只命中 `appendOptimisticUserMessage` 一处（`session-store.ts:255` 附近），并明确 `appendUserOrNoteMessage`（`:238`）不得赋值。
8. **重载场景的构造前提**要重复一次：`loadMessages` 只在 `displayBlocks.length === 0` 时触发（`WorkspacePage.vue:66`），场景 33 必须先回首页再进工作区（或先 `clearSession`），否则历史不会重载、走的是 (a) 分支。
9. **导出标注字面量冻结**：`### 第 12 页 · AI 结论` 的分隔符是「半角空格 + 全角中点 + 半角空格」，N40 验收 1/5 的逐行断言依赖它，设计档要把它写成字面量而不是「加一个标注」。
10. **文件名取法同源**：(a) 分支取锚点绝对路径、(b) 分支取 `readerStore.filePath`，两处必须走同一函数（`docDisplayName` 的取法或 `split(/[/\\]/).pop()`），否则 N36 验收 2/6 的 `title` 断言口径会分叉。

---

## 设计评审（R7）

> 评审对象：`docs/pm/R7-design.md`（N35–N42 AI 结论入库）。方式：设计档逐节 + 真实代码只读核对（`shared/types.ts`、`main/{notes-store,library-root,ipc-handlers}.ts`、`renderer/stores/{session-store,notes-store,reader-store,reader-state-store}.ts`、`renderer/components/workspace/{ChatPanel,PdfSelectionQuickAsk,NotesPanel}.vue`、`renderer/components/input/InputArea.vue`、`renderer/pages/{WorkspacePage,HomePage}.vue`、`scripts/ui-shot.mjs`、`tsconfig*.json`）。
> 结论：**revise**。契约面（§1.1–§1.3）与锚点生命周期（§2）逐条核对成立，可开工；阻塞项全部落在 §7 离屏取证面，共 8 条（§2），其中 6 条是「按档字面实现也必然失败」，2 条是「必无证据」。改完 §7 再开工，代码面无需返工。

### 0. 已核对为真、实现阶段不得翻案的前提

1. `addNote` 的判定顺序与 §1.3 一致：`no-root` 在首位（`notes-store.ts:274-275`），`outside` / `invalid-input` / `too-long` 全部先于 `readNotesFile` 与 `writeFileAtomic`（`:280-303`）；kind 白名单插在第 2 步不改变任何既有分支含义。
2. `duplicateKey` 确有两处调用（`notes-store.ts:285-286`，定义在 `:192`），第二处必须改传 `note.kind`；读侧 `isReaderNote` 已含 kind 三分量判断（`:117`），落盘改 `draft.kind` 后与读侧同口径，不会把 answer 写成 excerpt。
3. 锚点挂用户块可行：会话确认分支只覆盖 `text`/`attachments`/`timestamp`（`session-store.ts:227-229`），`appendUserOrNoteMessage`（`:238`）与 `loadMessages`（`:615-616` 先 `clearSession()`）都不赋值；`MAX_DISPLAY_BLOCKS` 裁剪只丢头部（`:408`）⇒ 被裁块上的锚点自然消失，`readingAnchorFor` 返回 null 的路径成立。
4. `ChatPanel.send()` 的快照点可落：`send()` 内 `readerStore.filePath` / `readerStore.page` 各读一次后同时喂 `appendOptimisticUserMessage` 与 `buildReadingUserMessage` 可行，`pageCount` / `selectedText` 读取点不变；`excluded.has("document")` 只影响注入，不影响登记。
5. 「锚点文档已被删除仍保存成功」与事实一致：`isLibraryFilePath`（`library-root.ts:38-52`）只做前缀归属、`realpathSync` 失败被吞，`addNote` 会成功落库；§5 第 3 行的写死与 §8 自评项 3 成立。
6. 非 PDF 锚点页取 1 成立：`openDocument` 无条件 `page.value = 1` / `pageCount.value = 0`（`reader-store.ts:54-57`）。
7. `typeAndSend` 的驱动路线成立：`InputArea` 是原生 `<textarea class="input-area">` + `@input`（`InputArea.vue:52-56`），Vue 的 `@input` 由原生 setter + `input` 事件即可触发；`.composer-send` 按 `draft.trim()` 判禁用且 `@click="send"`（`ChatPanel.vue:872-881`），不依赖键盘与焦点。
8. 事件回放可行：`WorkspacePage.vue:106` 用 `window.pixApi.onAgentEvent` 订阅并把事件交给 `sessionStore.addEvent`（`:107`），stub 现为丢弃式 no-op（`ui-shot.mjs:472`）⇒ 改为保留回调 + `emitAgentEvent` 后，`message_start`/`message_update`/`message_end` 能造出真实 agent 回答块（`extractContentText` 对 `content` 字符串与 text 数组都取得到文本）。
9. **驱动原语的作用域是坑**：`record` / `removeState` / `waitPage` / `goHome` / `enterWorkspace` / `openRow` / `clickNext` / `openNotesTab` 全部定义在 `runReaderStateScenarios` 内（`ui-shot.mjs:957-1120`），`runScenario`（00–11）只有 `waitFor` / `click` / `rectOf`。新增 30 段场景必须落进前者作用域。
10. **R6 段结束时 A 库的现场状态**：`sample-paper.pdf` = 第 2 页（场景 24 的 `goHome` flush，断言见 `:1590-1594`），而树行打开也会登记现场恢复（`openDocumentFromLibrary`，`WorkspacePage.vue:190-193` → `requestRestoreFor`，`reader-state-store.ts:188`）。这是 §2 must-fix 1 的事实依据。

### 1. 评审清单逐条结论

**1) 契约自洽性 —— 成立，只有一处断言字面量自相矛盾。**
`ReaderNoteKind` 既有（`types.ts:333`）；类型/主进程（`draft.kind` 三处）/渲染层（`excerpt` 一行 + `answer` 一处）/导出（` · AI 结论` 分支）四处口径一致；去重键加 kind 后对「仅 excerpt」输入逐条等价（常量段）。`notes-add` 的错误集与 `addNote` 全部失败分支一一对应（no-root / invalid-input / outside / too-long / corrupt / version-unsupported / read-failed / write-failed），无缺码；answer 超长文案走独立常量、`ERROR_MESSAGES` 不加键的写法与 `failure(code)` 只吃 code 的现状兼容（answer 分支需就地构造返回对象，烟测 6 可判别）。唯一矛盾：场景 31c 的 `title 含 "archive/older-paper.pdf"` 与 §3 的 `<文件名>`（`answerDocName` = 最后一个分隔符之后）冲突，见 must-fix 2。

**2) 锚点生命周期 —— 闭环，四处落点都在现有函数上。**
生成 = `ChatPanel.send()`；挂载 = `appendOptimisticUserMessage` 的块构造（两个 user-message 构造点中唯一赋值处）；消费 = 新增 `readingAnchorFor`；清理 = `clearSession` / `MAX_DISPLAY_BLOCKS` 裁剪 / `failOptimisticUserMessage`。四种时序都有明确结果：steer 复用同一 `send()`（§2.3）、会话切换走 `loadMessages` 前的 `clearSession`、重载历史用户块无锚点、新建对话 `clearSession`。§2.5 的解析规则（遇第一个 user-message 即终止）可由场景 35 判别。小修正（不阻塞）：§2.4 表把 `clearSession()` 的触发点写作「onUnmounted」，实际 `WorkspacePage` 的 `onUnmounted` 只 flush + reset（`:127-138`），真实触发是 `goHome`（`:219`）、`HomePage.openWorkspace`（`HomePage.vue:51`）、`onNewSession`（`:153`）、`onSwitchSession`（`:163`）；结论不变，字面建议改准。

**3) 交互与反馈 —— 三分支可实现，无「点了一定失败」入口。**
(a) 锚点原值、(b) 点击时刻当前位置、(c) `disabled` + 原因 title；按钮可用性由 `canShowAnswerSave`（非空 + 非流式）与 `answerSaveDisabled`（无目标或在途）决定，(c) 不发起 IPC。`title` 挂容器避开禁用控件不派发鼠标事件的规避正确。反馈与按钮用 `v-if/v-else` 互斥（§4.2），反馈期天然无第二次 IPC。问题只在取证脚本的时序（must-fix 3）。

**4) 失败路径与数据安全 —— 表 17 行齐全，两条数据风险已被封死。**
超长（4000/4001 两 kind 文案）、空、损坏、版本、无根、写失败、IPC reject、重复、反馈期连点、在途连点、确认不匹配、流式、历史、裁剪、发送失败都有明确行为；「answer 被写成 excerpt」由主进程 `kind: draft.kind` 单点写盘 + stub 同步封死；「跨 kind 去重误命中」由 `duplicateKey` 含 kind 封死；无截断路径；`notes.json` 仍 tmp+rename 且失败先于写盘。

**5) 与既有语义冲突 —— 无硬冲突，但 R6 的现场状态会被新场景踩到。**
面板排序/分组/计数/筛选（`notes-path.ts` 零改动、kind 不参与比较）、导出模板（仅标题行分支）、`notes-update`/`notes-delete` 复用、渲染层不拼路径、`preload.ts` 零改动（`ReaderNoteDraft` 是唯一契约源）全部不冲突。R6 的代码零改动（`reader-state-store` 在范围外），但它的**运行时行为**（树行打开即恢复现场）没有被新场景的前置状态考虑，见 must-fix 1/6。

**6) 验证可执行性 —— 烟测可判；离屏面 6 处必失败 + 2 处必无证据。**
烟测 14 组可构造（`setLibraryRoot` 存在、叶子模块编译命令与 R6 同口径）；stub 能构造 agent 回答块（见 §0.8）；`typeAndSend` / `emit` / `setMessages` / `notesAddCalls` / `setNotesAddFailure` / `setNotesAddDelay` 都在既有 stub 结构内可加。缺陷集中在场景前置（must-fix 1/4/6）与断言字面量（must-fix 2/5）与点击时序（must-fix 3），另有证据缺口（must-fix 7）。

**7) 规模与工作量 —— A+B 一轮可交付，但 B 是唯一关键路径且被低估在「调试取证面」。**
A 面三个文件、局部改动，半日量级。B 面 `ChatPanel` 与 `session-store` 是范式内的中量改动；真正的大头是 `ui-shot.mjs`：stub 写穿（五个口 + `notesExport` 口径）、三个新控制口、两条驱动原语、7 个场景（该脚本**首批对话场景**）、5 组断言，且既有 00–11 与 20–24 必须零回归。建议 B 内部分两步自测：先 stub 写穿 + 原语 + 场景 30（跑通全量既有场景不回归），再 31–36；否则场景 30 一挂就分不清是 stub 还是 UI 的问题。

**8) 越界检查 —— 白名单不重叠，依赖已声明。**
A（`shared/types.ts`、`main/notes-store.ts`、`main/ipc-handlers.ts`）与 B（`stores/session-store.ts`、`ChatPanel.vue`、`PdfSelectionQuickAsk.vue`、`NotesPanel.vue`、`scripts/ui-shot.mjs`）无交集；B 的编译前置是 A 的 `shared/types.ts`（`ReadingAnchor` + `kind` 必填）与 `PdfSelectionQuickAsk` 的 `kind: "excerpt"`，§8 已写死「A 必须先合入类型面」，无未交付字段依赖。注意 `kind` 的 answer 文案在 A 常量、stub、断言三处重复，三处字面量已在 §1.2/§7.3.1 冻结，改一处即全改。

### 2. must-fix（8 条，改完才能开工）

1. **场景 30/33 缺 R6 现场状态前置，`waitPage(1,3)` 必然超时。** `openDocumentFromLibrary`（`WorkspacePage.vue:190-193`）对树行打开也调 `requestRestoreFor`（`reader-state-store.ts:188`），而 R6 段末 A 库 `sample-paper.pdf` = 第 2 页（`:1590-1594` 断言即此）⇒ 打开即落第 2 页。修正：在 §7.4.2 写死「`goHome()` 之后、`enterWorkspace` 之前 `removeState(STATE_FILE_A)`（或 `__pixStub.setReaderState(null)`）」，凡从第 1 页起算的场景一律加此步。
2. **场景 31c 的 title 断言与 §3 口径冲突。** `title 含 "archive/older-paper.pdf"` 永远不成立：§3/§1.5 的 `<文件名>` = `answerDocName` = 最后一个分隔符之后（`older-paper.pdf`）。修正：断言改 `older-paper.pdf` + 「第 1 页」，并核对 30/31b/33 的同类断言一律只用 basename。
3. **场景 31b 在反馈仍显示时点按钮。** 反馈期按钮被 §4.2 冻结的 `v-if/v-else` 移除（只留 `.answer-note-feedback`），此时 `querySelector('.answer-save-btn')` 为 null ⇒ 场景抛错，拿不到 duplicate 态。修正：照场景 36 补「等反馈过期（2500ms + 200ms）或 `waitFor` 按钮回位」再点。
4. **场景 35/36 继承 33/34 的 `setMessages` 历史。** `goHome` 后重进工作区满足 `displayBlocks.length === 0` 会 `loadMessages`（`WorkspacePage.vue:106`/`:66`）⇒ 多 1 条无锚点历史用户块，场景 35 的 `userBlocks: 3` 必失败，36 的「最后一个回答块」也需重新确认。修正：35 开头 `setMessages([])`，或把断言改成「基线 + 3」。
5. **场景 32 的顺序断言不成立。** `[n-current-2, n-current-3]` 既不是该组全量（第 1 页还有 `n-current-1`），也未计入 31/31b2 新写入的条。修正：先按 `.note-page-badge` 过滤出第 2 页的行再断言 id 先后，或断言子序列（`n-current-2` 先于 `n-current-3`），并把「徽标数 = 文件内 answer 条数」的自洽口径沿用。
6. **新场景的挂载位置与资源顺序未写死。** `record`/`removeState`/`waitPage`/`goHome`/`enterWorkspace`/`openRow`/`clickNext` 只在 `runReaderStateScenarios` 作用域（`ui-shot.mjs:957-1068`）；场景 36 的 `rmSync(older-paper.pdf)` 会击穿既有 `:1429`/`:1492`/`:1507` 的 older-paper 用例。修正：声明 30 段追加在该函数末尾（R6 场景之后），并声明 36 之后不再使用该文件。
7. **两处证据缺口。** N39 验收 4（answer 行的备注保存 / 删除二次确认 / 跳回原文）在 §7.4 无任何断言（场景 32 只覆盖徽标、顺序、溢出；R6 的 05b/22/23 打的是 excerpt 行或只做确认态复位）；N38 验收 5、N36 验收 11 的离屏半条（空内容不渲染按钮）也无场景。修正：场景 32 后补一段 answer 行等价断言（备注 → `.comment-text`、删除二次确认 → 文件少一条、点行 → 落页为笔记页）；补 `emit(message_start/update assistant, content="   ")` + `message_end` 后断言 `.answer-save-btn` 数量为 0。
8. **hover 驱动是否可行没有实证，降级会丢掉 N36 验收 2 的离屏证据。** `offscreen: true` 的窗口上 `sendInputEvent(mouseMove)` 能否更新 `:hover` 不确定，一旦不生效只能走 §7.4.2 降级（只留四条 DOM 断言 + 走查）。修正：`moveMouse` 首选 `win.webContents.debugger` + CDP `Input.dispatchMouseEvent({ type: "mouseMoved" })`（走浏览器输入管线），`sendInputEvent` 降为兜底，并在 §7.4.1 写死两者判定顺序。

### 3. 次级项（不阻塞，但设计档/开发档应写死）

1. **N37 验收 1 的第二句与 N36 (b) 分支直接冲突**：「点击处理函数内不出现 `readerStore.filePath` / `readerStore.page`」在 (b) 分支必须被打破。§0 修订 3 已改写为「同源 + 各读一次」，但 §9 没点名这一句，建议在 §9 补一条回退建议，避免实现者按需求档字面自查后被误判。
2. **N37 验收 4 的字面（「向前最近一个带锚点的用户块」）与 §2.5 相反**，§9 未列为回退项。建议一并回改需求档，否则实现者可能照需求档写出被场景 35 判死的规则。
3. **`notesExport` 的 stub 口径**：写穿后 `notes` 内存数组与文件可能分叉（`ui-shot.mjs:526-528` 现读内存），§7.3.1 未提这一口；建议一并在 stub 内改为真读（或明确「所有写口都同步内存，故 export 读内存仍自洽」）。
4. **场景 36 末段的「`emit` 匹配序列」未列 `message_end assistant`**：缺它第三个回答块停在 `isStreaming` ⇒ 无保存按钮 ⇒ `{state:"ok"}` 必失败。建议照场景 30 的行序列写全。
5. **场景 30 的 `hover-before` 读数需要先离开动作区**：`moveMouse` 之后同一会话里再读 opacity 时鼠标仍停在元素上；§7.4.1 应写死「读 opacity 前先把鼠标移到中性落点（如 `.chat-header`）」。
6. **§2.4 的 `clearSession()` 触发表字面要改准**（见 §1 第 2 条结论），结论正确、引用有误。

### 4. 结论

设计档的语义主线（锚点 = 发送时刻快照、kind 进数据契约与去重键、单一超长口径、不做自动入库）经代码核对全部成立，A 面可原样开工；阻塞项 8 条全在 §7（离屏取证面与两处证据缺口），修订范围限定在 `docs/pm/R7-design.md` 的 §7.4/§7.5 与 §9，不涉及契约改动。修订后可直接进入 A+B 分工。

---

## 代码审查（R7）

> 审查对象：工作区当前改动（A 面 `shared/types.ts` / `main/notes-store.ts` / `main/ipc-handlers.ts`，B 面 `stores/session-store.ts` / `ChatPanel.vue` / `PdfSelectionQuickAsk.vue` / `NotesPanel.vue` / `scripts/ui-shot.mjs`，开发档 `docs/pm/R7-dev.md`）对照 `docs/pm/R7-design.md`（定稿）与 `docs/pm/R7-req.md`（N35–N42）。
> 方式：全只读 + 真实运行。自写独立烟测（**不复用开发的自述**：`git show HEAD:` 取改前源码另编译一份做字节级对照）、真实跑 `npm run check` 与全量离屏 `electron scripts/ui-shot.mjs`、逐条走查命令见 §1/§2。
> 结论：**approve**。0 must-fix；非阻塞次级项与残余风险 6 条见 §5。

### 1. 实测证据（真实命令与真实输出）

| 判定 | 命令 | 实测 |
| --- | --- | --- |
| 唯一工程门 | `cd pix && npm run check` | `CHECK_EXIT=0`（vue-tsc + main tsc + preload tsc 三段静默通过） |
| 白名单 | `git status --short` / `git diff --stat` | 8 个已改文件全在 A/B 白名单；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、`pix/src/main/preload.ts`、`renderer/{stores/notes-store.ts,utils/*,types/session.ts,pages/WorkspacePage.vue}`、`components/session/*.vue`、`main/reading-prompt.ts` 的 `git diff` 均为空 |
| 数据面（自写烟测） | `tsc --outDir $TMP/... src/main/{notes-store,library-root}.ts` 后跑自写脚本 | `checks=121 failed=0`；覆盖 §7.2 全部 14 组 + 判定顺序 + 原子性 |
| 导出对照（改前构建） | 同一库分别用 `HEAD` 版与工作区版导出 | 只含 excerpt：屏蔽生成时间行后**逐字节相同**；混入 answer：diff **恰 1 行**（`### 第 12 页` → `### 第 12 页 · AI 结论`）；两种情形 `notes.json` 的 sha256 前后一致（导出只读） |
| 离屏取证 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs` | `UI_SHOT_EXIT=0`；55 张截图（44 张既有名逐一在列 + 11 张新增）；`MANIFEST.json.failure === null`（`generatedAt 2026-09-15T03:49:14.881Z`）；`MEASUREMENTS.json` 57 条记录 / 17 组，新增 `answer-save`(11 相位) / `answer-anchor`(4) / `answer-feedback`(8) / `answer-notes-list`(1) / `answer-note-row`(3) |
| 关键读数 | 同上 | `hover hoverDriver="cdp" forcedVisible=false wrapOpacity="1"` 与 `hover-before wrapOpacity="0"`；`answer-anchor.payload.lastPayload{page:2, kind:"answer"}` 且保存 `saved{hasFence:true,hasRenderArtifact:false}`；跨文档/翻页后 title 仍 `sample-paper.pdf 第 2 页`；`reentrant.delta=1`；`strict.title` 含「（按当前阅读位置）」与「第 2 页」且不含「第 1 页」、`userBlocks=base+3`；`fallback` 第 3 页；`disabled.disabled=true` 且 `deltaAfterClick=0`；`too-long/outside/corrupt/throw/recovered/deleted-doc` 逐字命中；`badges.badgeCount=3===fileAnswerCount=3`、`page2Ids=[n-current-2, n-current-3, …]` 子序列成立、`excerptRowHasNoBadge=true`、`headOverflow` 全 true |

### 2. 红线核对

| 红线 | 判定 |
| --- | --- |
| 1 不改 `packages/**` / dependencies / lockfile / build / electron-builder | 通过（`git diff --stat` 上述路径全空） |
| 2 无 `any` / 无内联动态 import / 顶层 import / UI 中文 | 通过（7 个改动文件 `grep -n ': any\|as any\|await import(\|import('` 0 命中；`ReadingAnchor` 走 `@shared/types` 顶层 `import type`；文案全中文） |
| 3 只跑 `npm run check` | 通过（未跑 build/test/package/dev） |
| 4 不执行 git 写命令 | 通过（本次审查只读；开发自述亦一致） |
| 5 主进程入参校验 + 中文错误 / 失败不静默 / 渲染层不拼存储路径 | 通过（`isNoteDraft` 增 kind 形状校验，非法走既有 `invalid-input` +「笔记数据不合法」；`addNote` 双层校验；`ChatPanel` 三分支与三态反馈均落到具体文案；draft 直传绝对路径，`answerDocName` 只做展示切分） |
| 6 Vuetify / 既有写法 | 通过（`.answer-save-wrap` 复刻 `.message-copy-btn` 的值与断点；`.message-copy-btn` 的 diff 行为 0 行） |
| 7 只改白名单 | 通过（A 三文件 + B 五文件，均在设计档 §4/§8 白名单内） |
| 8 `notes.json` 原子写 / 不覆盖损坏 / 全量覆盖渲染层 | 通过（`writeFileAtomic` tmp+rename 与 `isReaderNote` / `parseNotesFile` / `resetCorruptNotes` 的 diff 仅命中新注释，无代码改动；渲染层仍 `applyNotes` 全量覆盖） |

契约级走查：`duplicateKey` 两处调用同步传 kind；`kind: "excerpt"` 硬编码 0 命中；`ANSWER_TOO_LONG_MESSAGE` 独立常量且 `ERROR_MESSAGES` 零键增删；`addNote` 判定顺序为 `no-root → kind 白名单 → outside → 空文本/page → too-long → 读盘 → 去重 → 原子写`（烟测用「损坏文件 + 非法 kind → 仍 `invalid-input`」判前两条先于读盘）；导出中点为 **U+00B7**（与既有 `# 阅读笔记 · x` 同码点）；`grep -c 'ipcMain.handle("notes'` = 6；`.addNote(` 恰 2 处（`PdfSelectionQuickAsk.vue:153` 与 `ChatPanel.vue:491`）；`send()` 区间四条 grep 全为 1（`readerStore.` 共 4 次 = filePath/page/pageCount/selectedText）；`readingAnchor` 只落在 `appendOptimisticUserMessage`（条件展开）与 `readingAnchorFor`（`session-store.ts:268/285-292`）；`note-ai-badge` 只命中 `NotesPanel.vue`；`PdfSelectionQuickAsk.vue` 的 diff 只有 `kind: "excerpt"` 一行。

### 3. 验收标准逐条核对（N35–N42）

| 条目 | 判定 | 证据 |
| --- | --- | --- |
| N35.1 kind 必填 + 调用点两处 | 通过 | `grep -rn '\.addNote('` 恰 2 处；`ReaderNoteDraft.kind` 无默认值 |
| N35.2 answer 落盘字段 | 通过 | 烟测段 1：`kind/docPath/page/text/comment/createdAt===updatedAt`/2 空格缩进 + 末尾换行逐条 |
| N35.3 跨 kind 2 条 / 同 kind 去重且字节不变 | 通过 | 烟测段 2（含「同页同 kind 不同文本不误判」判别项）；离屏 31b `bytesUnchanged:true` |
| N35.4 旧库（只含 excerpt）判定等价 | 通过 | 烟测段 3：`duplicateOf` = 既有 id、字节/mtime 不变 |
| N35.5 守卫层与 store 层均拒非法 kind | 通过 | 烟测段 4（`undefined/"note"/123/null/"Excerpt"` 全拒、不写盘、无 `.tmp`）；`ipc-handlers.ts:234` 形状校验 |
| N35.6 写入字段精确 / N35.7 version 与码表零改动 | 通过 | 烟测段 1 + `git diff` 符号核对（仅命中新注释） |
| N35.8 越界 / page 非法 | 通过 | 烟测段 6（`outside` + 文案；`page:0/1.5/-1` `invalid-input`，不写盘） |
| N36.1–3 动作层级 / hover 双动作 / 流式无按钮 | 通过 | `.message-copy-btn` diff 0 行；`answer-save.hover{wrapOpacity:"1",copyBtnCount:1,saveBtnCount:1,overlap:false}`（CDP 真驱动）；`streaming{btnCount:0}` + `30b` 截图 |
| N36.4 情形 (a) 锚点优先（核心） | 通过 | 翻页到 3 / 换到 older-paper 后 title 仍 `sample-paper.pdf 第 2 页`；点击后 payload `{page:2,kind:"answer"}` 且 fixture 文件内该条 `page:2` |
| N36.5 锚点跨文档 | 通过 | `answer-anchor.switch-doc` + `saved.docPath="sample-paper.pdf"` |
| N36.6 / N36.7 情形 (b)/(c) | 通过 | `fallback` title 含「（按当前阅读位置）」 + 第 3 页；`disabled{disabled:true,title 含「无法存为笔记」「当前没有打开文档」,deltaAfterClick:0}` |
| N36.8 入库文本 = 原始 markdown | 通过 | `saved.hasFence=true` + `hasRenderArtifact=false`（fixture 文件里是 `## 结论 - … ```python …` 的归一化单行原文） |
| N36.9 越界 / 已删除文档 | 通过 | 36 段 `outside` 逐字文案 + `bytesUnchanged:true` + 按钮回 `ok`；末段 `rmSync(older-paper.pdf)` 后仍 `ok` 且入库（与 `library-root.ts:38-52` 只看前缀归属的既有事实一致） |
| N36.10 非 PDF 锚点 page=1 | 存疑（代码证据） | `reader-store.ts:54-57` 非 PDF 无条件 `page=1/pageCount=0` ⇒ 锚点 `{filePath,1}` 且提示「第 1 页」；离屏无 md/txt 反向场景（设计档未要求） |
| N36.11 / N36.12 空白回答 / 不拼路径 | 通过 | `blank-content{saveBtnCount:0, lastBlockSaveWrapCount:0, lastBlockTextTrim:""}`；`grep` 渲染层无 `join(` 于 draft 路径 |
| N37.1 / N37.2 快照点与写入点唯一 | 通过 | §2 四条 grep 全 1（并确认前两条改前亦成立，后两条才是判别条件）；`readingAnchor` 唯一赋值处 |
| N37.3 确认不清锚点 | 通过 | 30/31 同一场景：确认命中后翻页/换文档，目标仍是第 2 页 |
| N37.4 steer 登记锚点 | 存疑（代码证据） | `send()` 内快照先于 `isStreaming` 分流（`ChatPanel.vue:298-310` 与 `:323`），steer 复用同一登记；离屏不驱动 steer（设计档 §2.3 已声明） |
| N37.5–8 裁剪 / 发送失败 / 会话格式 / 值拷贝 | 通过（代码） | `readingAnchorFor` 找不到块返回 `null` 不抛错；`failOptimisticUserMessage` 删块即失锚；`session-bridge.ts`/`packages/**` 零改动 |
| N38.1–3 4000/4001 两套文案 | 通过 | 烟测段 5；离屏 31c `保存失败：回答过长（超过 4000 字），无法存为笔记` 逐字 + `bytesUnchanged:true` |
| N38.4 / N38.5 先判后写 / 空内容 | 通过 | 烟测段 4–6（无截断、无 `.tmp`）；31c 末段空白回答不渲染按钮 |
| N38.6 / N38.7 成功态 / 重复态 | 通过 | `ok` 反馈 + 左栏 tab 文案 === 文件条数；31b `duplicate` + 字节不变（跨 31 的基线比对） |
| N38.8 反馈常显 / 回位 / 反馈期不可点 | 通过 | `waitFeedbackGone()` 在 31b/31b2/31c/36 四处生效（反馈期按钮被 `v-if/v-else` 移除）；`.has-feedback` + `ANSWER_FEEDBACK_MS=2500` 在代码中 |
| N38.9 / N38.10 / N38.11 无半条数据 / reject / 摘录回归 | 通过 | 36 段 `throw` → `保存失败：主进程调用异常：stub notesAdd 注入异常` 且不停留在 pending；既有 07/07b/07c 场景全绿 |
| N39.1–3 徽标 / 位置 / 同页顺序 | 通过 | `badgeCount===fileAnswerCount`、`badgeTexts=["AI"]*3`、`.note-page-badge` 与 `.note-time` 之间的模板 diff；`page2Ids` 子序列 `n-current-2` 在 `n-current-3` 前、`excerptRowHasNoBadge=true` |
| N39.4 answer 行等价（备注/删除/跳回） | 通过 | `answer-note-row{comment:dom==="由回答入库"==file, delete-confirm:{rowsDelta:-1,fileDelta:-1,badgeCountEqFile:true}, jump:"第 2 / 3 页"}`；`32-answer-note-badge.png` 目视确认 answer 行有「AI」、excerpt 行无 |
| N39.5–8 计数筛选 / 错误态 / 零改动 / 不溢出 | 通过 | `tabLabel===笔记 8`；10/10b/20*/23 既有场景全绿；`git diff --stat` 空；`headOverflow` 全 true |
| N40.1–6 导出标注与模板不变 | 通过 | 改前构建字节级对照：只含 excerpt 逐行相同、混入 answer 只差标题行；导出前后 `notes.json` sha256/mtime 不变；二次导出除生成时间行外相同；`empty`/损坏拒导路径代码未动 |
| N41.1–3 stub 写穿与控制口 | 通过 | 五个口全部真读真写同一 fixture（`notesAdd/Update/Delete/Reset + seedNotes`，`notesLoad` 真读）；`notesAddCalls()` 形状恰 `{docFilePath,page,text,kind}`；`writeFixtures` 初值空数组 + `seedNotes` 第 4 条 answer 种子（设计档 §7.3.3 修订 2 的口径） |
| N41.4–7 场景 / 断言组 / 既有场景 / check | 通过 | 55 张截图（44 既有名 + 11 新增）、`failure===null`、退出码 0；新增四组 + `answer-note-row` 断言组均以脚本内 `throw` 实现 |
| N42.1–7 回归与零外溢 | 通过 | 既有 44 张截图名逐一在列且全部场景未抛错（抛错即退出码 1）；既有测量组（`pdf-text-layer-geometry`/`list-current-doc-filter-*`/`resume-entry`/`note-jump`/`tree-progress`/`scale-restored`/`reader-state-writes`/`reader-state-degrade`/`reader-state-console`/`workspace-switch`）全部正常产出；通道 6；无新依赖；`reading-context.ts` 零改动 |

### 4. 三个「最可能出错但没人验证」的点

1. **answer 与 excerpt 的去重键是否真的隔离** —— 判定：**是**（且已双向取证）。独立烟测：同文档/同页/同文本的两类各入库一条（2 条、`kind` 各自独立、id 不同、`createdAt` 单调），第三次同 kind 命中 `duplicateOf` 且字节与 mtime 不变；另外「同页同 kind 但文本不同」必须新增条目这一判别项在位（开发档 A.2 D4 的自纠点已回归）。离屏侧文件态自洽：`n-current-2`（excerpt）与 `n-current-3`（answer）同页并存且徽标数 = answer 条数。
2. **steer 轮的锚点是否张冠李戴** —— 判定：**按冻结规则实现正确，但存在一个设计承认的空白**。`send()` 是唯一快照与登记点，steer 也走它；`appendOptimisticUserMessage` 把 steer 块 push 到列表末尾，`readingAnchorFor` 取「向前第一个 user-message」⇒ 其后新建的回答块（`message_start assistant` → `createAgentBlock`，`session-store.ts:466-471`）落到 steer 自己的锚点。唯一反例是「steer 后 agent 不新建回答块、继续写同一个流式块」（`message_update` 复用 `currentAgentBlockId`）：该块的目标仍是首问锚点，与「该轮 = 从首问开始」的定义一致，但用户观感是「我换到第 5 页问的，却记到第 2 页」。无离屏证据（ui-shot 不驱动 steer），建议 R8 补一条 steer 场景。
3. **会话重载后按钮是否变成必然失败入口** —— 判定：**不是**，但有一个可探知的语义坑。历史用户块不赋值锚点（`loadMessages` 先 `clearSession`，用户块经 `appendUserOrNoteMessage` 构造）⇒ 重载后的回答块走 (b) 当前阅读位置或 (c) 禁用；场景 33/34 已取证（title 带「（按当前阅读位置）」的第 3 页 / `disabled` 且点击零 IPC）。语义坑：分支 (b) 会把旧会话的结论记到**当前打开的那篇文档**上（例如昨天读 A 论文时问的结论，今天打开 B 论文时点保存 → 落到 B）。这是需求 N36 验收 6 指定的行为，且 tooltip 与成功反馈都写明目标文档与页码，可探知；不建议本轮改。
4. **（补）存笔记是否可能把渲染后的 HTML 存进去** —— 判定：**否**。`saveAnswerNote` 传 `text: block.content`（原始 markdown），渲染产物只存在于 `v-html` 的 `.agent-markdown`；离屏 `hasRenderArtifact:false` + `hasFence:true` 直接取证了这一点。

### 5. 非阻塞次级项与残余风险

1. **`readingAnchorFor` 的复杂度声明不完整**（`stores/session-store.ts:285-295`）：设计档 §1.5 只覆盖了「向后扫描遇第一个 user-message 即停」，但函数开头的 `displayBlocks.findIndex` 是 O(blocks)，而模板对每个已完成回答块调用它 2 次（`:title` 与 `:disabled`，`ChatPanel.vue:880/886`）⇒ 每次重渲染是二次方量级（流式 delta 与 composer 每次击键都会重渲染）。数百块规模无感，数千块规模可能卡顿，**本轮未实测**。建议（不阻塞）：v-for 传索引，或缓存一个 id→块/位置 的 Map。
2. **`saveAnswerNote` 的 `if (!target) return;` 是静默返回**（`ChatPanel.vue:486`）：可达性极低（同一条件下按钮已 `disabled`，禁用控件不派发 click），但严格按「渲染层失败路径不得静默」应给一条反馈或注释说明不可达。
3. **N36 验收 10 的语义后效**：非 PDF 锚点按「`filePath` 非空即登记、`page` 取 1」会写出 `page:1` 的笔记，面板与导出此后恒显示「第 1 页」。这是需求写死的行为、非缺陷，但建议 R8 复盘「md/txt 无页概念」的展示口径。
4. **反馈停留时长只有回位证据**：场景用 `waitFor` 等按钮回位（上限 20s），未断言量级 ≈2500ms；常量在代码中（`ANSWER_FEEDBACK_MS = 2500`）。
5. **stub 与主进程的三处已知差异**（开发档 B.6 已声明）：`readNotesFile` 解析失败按空数组降级（主进程判 `corrupt`）、`notesAdd` 无 tmp+rename、`notesExport` 不生成 `notes.md` 内容。导出模板的逐行判定已由数据面烟测覆盖，本轮不改。
6. **取证目录卫生**：`%TEMP%/pix-r5/shots` 留有一张更早一次失败运行的 `99-failure-state.png`（11:36），脚本成功时不会删除陈旧文件；本次绿跑的截图数以 `MANIFEST.json` 的 55 张为准（`failure === null`），勿据目录文件数误读。

另两处「需求档字面与设计档相反」的口径按设计档执行（N41 验收 3 的种子落点、N37 验收 4 的解析规则），设计档 §7.3.3 修订 2 与 §9 no.10 已声明；建议负责人一并回改需求档，避免后续按字面实现写反。

### 6. 结论

契约（§1）、锚点生命周期（§2）、交互与文案（§3）、失败路径（§5）、取证面（§7.3/§7.4）与设计档定稿逐条对应，未发现功能缺陷、数据面回归或红线违反；设计评审 8 条 must-fix 的判别点全部落地且有真实读数（hover 走 CDP 真驱动且未降级、31b2 在途连点 delta=1、31c 超长文案逐字、32 徽标自洽 + 同页子序列、35 锚点不跨轮、36 三态 + 已删除文档仍入库）。判定 **approve**，0 must-fix；§5 六条可在 R8 或本轮收尾时顺手处理。
