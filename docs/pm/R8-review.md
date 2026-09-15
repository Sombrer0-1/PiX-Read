## 需求评审（R8）

> 评审对象：`docs/pm/R8-req.md`（N43–N51 笔记作为对话上下文）。评审方式：需求档逐条 + 真实代码只读核对（`renderer/utils/{reading-context,notes-path}.ts`、`renderer/components/workspace/{ChatPanel,NotesPanel,PdfViewer,PdfSelectionQuickAsk}.vue`、`renderer/components/input/InputArea.vue`、`renderer/stores/{notes-store,session-store,reader-store}.ts`、`renderer/composables/{useQuickAsk,useRpc}.ts`、`renderer/pages/WorkspacePage.vue`、`main/notes-store.ts`、`shared/types.ts`、`scripts/ui-shot.mjs`）。
> 结论：**revise**。must-fix 6 条（见 §2），改完才进设计。主线本身成立：面板显式挑选 → chip 可见可移除 → `send()` 单点快照注入 → 条数与字符双上限，冻结的注入顺序、派生口径、整条丢弃策略都可实现且在现有代码上有落点。阻塞项集中在四处：「chip 可见性与真实注入条件不等价」「两处验收不可构造/恒真」「选择集写权与时序自相矛盾」「上限控件的 DOM 载体未冻结」。

---

### 0. 已核对为真、实现阶段不得翻案的前提

1. **既有 `<reading_context>` 的形状与唯一实现点与档中描述一致**：`buildReadingUserMessage`（`reading-context.ts:18-40`）只产 `path`/`page`/`pageCount`/可选 `selectedText:`，字段顺序与「无选区则不出现 `selectedText:` 行」的范式同档；全仓库唯一调用点是 `ChatPanel.vue:320`。追加 `reader_notes` 段不触碰任何既有字段 ⇒ N46 验收 2 的「与 R7 逐字节相同」可达成。
2. **4000 与 8000 的引用准确**：`MAX_NOTE_TEXT_LENGTH = 4000` 确在 `main/notes-store.ts:31`，读侧 `isReaderNote` 同口径（`:121`），文案也写明「超过 4000 字」（`:37`）。8000 = 2 条满长笔记的论证成立。
3. **注入侧再做一次行内归一化不是冗余**：主进程 `addNote` 走 `normalizeNoteText`（折叠空白），但 `isReaderNote` 只查「非空且 ≤ 4000」（`:117-121`），不查是否含换行；`ui-shot` 的 `seedNotes` 是直接写穿 fixture 文件（`ui-shot.mjs:685`），手工编辑的 `notes.json` 同理。⇒「条目块一个字段一行」必须由注入侧自己保证。
4. **`comment` 无长度校验、无归一化**：`updateNoteComment` 只落字符串（`main/notes-store.ts:324-332`），`isReaderNote` 对 comment 只判 `typeof === "string"`。⇒ §0.2「单条自身就超过 8000」是真实可达边界，不是假想。
5. **发送链路的快照点与失败语义成立**：`send()` 在 `appendOptimisticUserMessage` 之前读 `readerStore`（`ChatPanel.vue:290-302`），`excluded` 快照在 `finally` 复位（`:336`）；`sendPrompt`/`sendSteer` 走 `sendCommandOrThrow`（`useRpc.ts:197-276`），IPC reject 与 `success:false` 都会抛 ⇒ §0.3 情形 2 / N48 验收 5 真实可达。steer 分支可由 `agent_start` 造出（`session-store.ts:444` 置 `isStreaming = true`，`ui-shot.mjs:1921` 的 `runTurn` 就在用）。
6. **派生式选择集有唯一数据源可挂**：`notesStore.notes` 只由 `loadNotes`/`applyNotes`/`recoverCorruptNotes` 全量覆盖（`renderer/stores/notes-store.ts:87/75/163`），`resetNotes`（`:179`）已覆盖挂载/卸载/goHome 三个调用点（`WorkspacePage.vue:98/137/226`）；`selectedNoteIds` 放这里即可让 §0.3 情形 6/7 自动成立，无需 `watch` 手工同步。
7. **离屏取证面够用**：`seedNotes` 写穿 fixture 文件、`notesAddCalls()` 已有同范式、`record`（`ui-shot.mjs:1075`）先落测量后抛错、`readNotes()`/`readFileSync` 可做字节比较；40–46 编号确与既有 00–11、20–24、30–36、99 不冲突。
8. **白名单与零外溢自洽**：`ContextChipKind` 是 `ChatPanel.vue:70` 的组件本地类型，`ReadingSendContext` 在 `reading-context.ts:11`，两者都不进 `shared/types.ts`；本轮确无新 IPC、无落盘字段。N51 验收 4/6 的「主进程面零改动」与需求本身不矛盾。

---

### 1. 评审清单逐条结论

**1) 可判定性 —— 四种证据都真实存在，但有 4 处判不了或会空转。**

- **N43 验收 9 / §0.3 情形 7 的「非 ready 清空」恒真且不可构造**（must-fix 2）：按档字面进笔记标签时选择集必为空（进入即 `loadNotes` → loading，且上一跳已按情形 4 清空），断言「无 `.notes-selection-bar`、无 `.note-row.selected`」在没有该条款时同样成立。产品内也不存在「ready + 已选 → loading」的路径：`selectLeftTab` 同 tab 早退（`WorkspacePage.vue:196-201`），`loadNotes` 的其余触发点是错误态的「重试」。该条款同时与 N51 验收 7「不新增死代码」冲突。
- **N43 验收 7 的「第 11 条」不是稳定坐标**：N50 验收 3 只给了 `cap-1…cap-12`，未冻结 `page`/`createdAt`/`docPath`；面板顺序由 `groupNotesByDocument`（`notes-path.ts:63-92`：组间 key 升序 + 当前文档置顶，组内 page → createdAt）决定，「点前 10 条 → 断言第 11 条」在种子不冻结时不可重复。
- **N43 验收 7 的 `disabled` 落点未冻结**（must-fix 4）：若 `.note-select` 是 Vuetify 选择控件，`disabled` 落在内部 `input`，根元素上取 `disabled` 恒为 `undefined`。
- **N46 验收 1 的「结尾换行」写在围栏块里**：围栏块无法表达末尾是否有 `\n`，而实现形态是 `lines.join("\n")`（`reading-context.ts:38`，无尾换行）。判据要写成可比较的字符串。
- **N43 验收 11 的「不落盘」没有落到 N50 的五个断言组里**：N50 验收 4 列的是 `notes-select` / `note-ask` / `notes-chip` / `notes-context` / `anchor-cache`，N43 说「与 N50 共用断言」但未点名哪一组。
- **N44 验收 9 引用的「既有 steer 场景」不存在**：`ui-shot.mjs` 全文无 steer 场景（只有 `runTurn` 的 prompt 轮次），steer 证据只能由 N48 验收 6 新建。

其余抽查通过：N43 验收 5/6（`.notes-selection-*` 文本 + `.note-row.selected` 计数可判）；N44 验收 4/5/7（`.input-area` 是原生 textarea，`InputArea.vue:42-46` 暴露 `focus()`，`document.activeElement` 与 value 逐字断言可判；`composer-send` 的驱动已有 `typeAndSend`/`composer-send` 现成原语）；N45 验收 3/4、N46 验收 7、N47 验收 7、N48 验收 5/6（`sendCalls` 可加在 stub `handleCommand` 的 prompt/steer 分支上，`setSendFailure` 落在 `sendCommand`，`ChatPanel.vue:322-333` 的 catch 真实可达）；N50 验收 5（既有 32 段的 `headOverflow` 判据见 §3 次级项 5）。

**2) 注入形状与体积 —— 与既有契约兼容；两点要显式声明，不改冻结值。**

- **形状**：既有块是严格扁平的 `key: value`，`reader_notes:` 是第一个「段头 + 3 空格缩进子字段」结构。值内容不会伪造出第二条 `N. doc:` 行（`text`/`comment` 均在注入前归一化，见 §0 前提 3/4），命名空间不会串。唯一的误读面是 `reader_notes:` 行与 `selectedText:` 之间无空行（示例即如此），模型可能把编号条目读成选中文本的延续；这属于格式固有风险，靠缩进区分即可，不要另外发明分隔符（会破坏 N46 验收 1 的逐字节判据）。
- **`kind` 用原始取值**成立：`kind` 只在 UI 上中文化（面板 AI 徽标），注入用 `excerpt`/`answer` 与落盘同值，无二次映射。
- **体积关系要补一句**：8000 只约束 notes 段。`selectedText` 侧无任何上限（`PdfViewer.vue:727` 直接 `selection.toString()`），因此 `<reading_context>` 整体没有界；需求档的「上限来源」只解释了 notes 段，应显式声明「本上限不构成对整块上下文的界」，避免后续被当成上下文保护总量。8000 与「2 条满长笔记」的量级关系本身合理，10 条典型摘录 ≈1–3k 的估算也站得住。
- 顺带确认：`kind: answer` 会把 AI 旧结论回灌成「资料」，这是用户显式挑选的结果（chip 可见），不是缺陷；但设计档要承认这一后果，避免实现期自行加过滤。

**3) 七种情形与竞态 —— 覆盖到位，派生式是 6/7 成立的真正原因；三处口径要补。**

- 情形 6/7 由「选择集元素派生自 `notesStore.notes ∩ selectedNoteIds`」自动成立，且这是唯一正确做法；情形 1/2 与既有 chips 的 `finally` 复位语义一致（`ChatPanel.vue:336`）。
- **情形 3 的可达路径与情形 4 相抵**：切文档的常规入口是资料库树，而它必须先切到 library 标签 ⇒ 已按情形 4 清空。真正触达「切文档仍保留」的只有「点笔记行 → `onOpenNote`」（`WorkspacePage.vue:213-222`）。需求档用「跨文档对比必然要切文档」论证情形 3，与情形 4 互相抵消，要写明可达路径（也解释了为何注入顺序必须独立于面板顺序）。
- **面板折叠（`leftCollapsed`）与情形 4 判据不一致**：折叠后笔记面板同样不可见，但 `leftTab` 不变 ⇒ 选择集保留、chip 仍在。若判据的理由是「不可见则无法核对」，折叠应同处理；二选一并写死。
- **发送在途**自洽（快照在 `appendOptimisticUserMessage` 前，`:290-302`；在途期间的清单/选择变化只影响下一回合），但 N48 验收 1 要写死快照的是「发送瞬间的派生结果」而不是「id 集合对象」，否则「发送瞬间被删的条目」在两种写法下含义不同。
- **幽灵选中**已封死：跨工作区靠 `resetNotes`，清单变化靠派生；`status !== "ready"` 的额外清空既不可构造也无必要（见 §1.1）。

**4) 与既有语义冲突 —— 三处需要点明，一处必须改。**

- **chips 排除机制**：N45 验收 2 让 notes chip 的可见性依赖 `"document" ∉ excludedContexts`，方向正确但判据不等价（must-fix 1）。
- **删除二次确认**：`onDocumentPointerDown` 是 capture 阶段的 document 监听（`NotesPanel.vue:123-148`），点新控件只会取消待确认态（行外任意点击皆如此），与多选无冲突；新控件的 `@click.stop` 是隔离行级 `open-note` 的正确做法（N43 验收 3 已写）。
- **备注编辑 / 展开全文**：都在 `.note-comment`（带 `@click.stop`）与 `.note-expand`（带 `@click.stop`）内，N43 验收 4 的「零影响」成立。
- **R7 锚点链路**：N49 只改 `readingAnchorFor` 的实现（`session-store.ts:285-296`），语义/签名不变的要求正确、可达（语义分支只有两条），但失效判据缺证据（must-fix 6）。
- **跨工作区残留**：`resetNotes` 的调用点已覆盖挂载/卸载/goHome，选择集清空挂在这里是正确落点。

**5) 失败路径 —— 主干写全，缺三条边角。**

- 已写全：发送失败保留选择集（情形 2 / N48 验收 5）、草稿保护与 clarifying 禁用（§0.4 / N44 验收 3/5）、超限两种策略（§0.2 / N47）、id 在触发时已失效（N44 验收 8，但实现归属自相矛盾，见 must-fix 3）、`notes.json` 只读（N51 验收 6）。
- **缺**：空选择集下「行内追问」的行为（N44 验收 2 隐含「替换为 1 条」，但选择条在已选 = 0 时不渲染，两条入口的可用性边界要写死）；P=0（全部被字符上限丢弃）时 chip 仍渲染与否（文案已自陈 `未注入 N 条`，建议照旧渲染并在设计档写死，别让实现期自行删 chip）；删除失败时的行为（`runMutation` 失败不改 `notes`，`renderer/stores/notes-store.ts:132-149` ⇒ 选择集与 chip 都不动，正确但要写进 N43）。

**6) 隐性成本与越界 —— 无越界，最大成本项未被预算。**

- 越界面干净：不改主进程、不改 `shared/types.ts`、不加依赖、不动 `packages/**`；`ContextChipKind` / `ReadingSendContext` 都在白名单文件内。
- 成本集中在 `scripts/ui-shot.mjs`：12 段场景 + 5 组断言 + 3 个 stub 原语 + 两处写穿种子的恢复。需求档点名了但它同时是场景顺序、fixture 状态与断言落点三件事的交叉点（见 §3 次级项 1/2）。
- 第二成本项是 N49 这个与主线无关的性能项（must-fix 6）。

---

### 2. must-fix（6 条，改完才能进设计）

1. **N45-2/6：chip 可见性判据与注入条件不等价。** `reading-context.ts:19` 在无 `filePath` 时早退，而未打开文档时 chip 仍渲染「摘录 N 条」⇒ 可见面撒谎。判据改为「本次会输出 `<reading_context>`」（如 `documentChip !== null`），并补该场景的离屏断言。
2. **§0.3 情形 7「非 ready 清空」不可构造，N43-9 恒真。** 产品内无「ready + 已选 → loading」路径（`selectLeftTab` 同 tab 早退，`WorkspacePage.vue:196`），场景断言前选择集必为空。删掉该条款（派生式已保证无幽灵条目），或补 stub 原语造在册重载；否则与 N51-7「不新增死代码」冲突。
3. **N44-2 与 N44-8/N43-1 矛盾：谁写选择集、何时替换、id 失效怎么办无唯一答案。** 替换若在 NotesPanel，id 已失效时会先改选择集（违反 N44-8）；若在 ChatPanel，违反 N43-1「注入侧只读」。写死：替换收进 store 单一动作（id 不在 `notes` 中即 no-op、不触发、不聚焦），seam 只传触发信号并写死签名。
4. **§2.0/N43-7 未冻结 `.note-select` 的载体与 `disabled` 落点。** Vuetify 选择控件的 `disabled` 落在内部 `input`，根元素取 `disabled` 恒为 `undefined`，断言会指向错节点。冻结为原生控件（同 `.note-delete` 范式），或另冻结断言路径 `.note-select input`。
5. **`.note-ask` 未要求 `@click.stop`，追问会连带触发行跳回原文。** `.note-row` 的 `@click` 是 `open-note`（`NotesPanel.vue:315`），行内既有控件都用 `.stop`。把「追问与选择控件一律 `@click.stop`」写进 N43/N44，并断言点 `.note-ask` 后当前文档与页码不变。
6. **N49 的缓存失效判据无可判定证据，且两个选项互斥。** 现有证据只覆盖尾部追加与乐观块回滚（`session-store.ts:297-305`），裁剪（`:434`）与任意中段删除的位移无断言。写死为「列表引用一变即整表重建」，或补中段位移断言；删掉与之互斥的「模板传索引」（与「函数签名零改动」不能并存）。

---

### 3. 次级项（不阻塞，但设计档/开发档必须写死）

1. **N43 验收 7 的种子要冻结字面量**：`cap-1…cap-12` 的 `docPath`/`page`/`createdAt` 三者决定 DOM 顺序，写死为同文档 + page 递增（或 createdAt 递增）并按固定文本定位「第 11 条」；同时 40c/42b 结束时恢复标准种子的那一步要自带断言（`.note-row` 数量回到 4 或 fixture 条数 = 4），否则 44–46 段的失败会表现为无头案。
2. **N43 验收 11 的「不落盘」断言要落进具体组**：建议并入 `notes-select` 组，判据 = `notesAddCalls().count` 不变 + `readFileSync(NOTES_FILE)` 字节比较（`ui-shot.mjs` 侧现成的 `readNotes()`/`readFileSync` 足够，无需新原语）。
3. **补写三条边角行为**：空选择集下「行内追问」仍可用（替换为 1 条）；P=0 时 chip 照旧渲染（移除只影响本次）；`removeNote` 失败时选择集与 chip 都不动。
4. **N46 验收 1 的期望值写成可比较的字符串**（`lines.join("\n")`，无结尾换行），不要用围栏块当字面量；否则设计档与开发档会各解释一次「结尾换行」。
5. **N50 验收 5 与既有 32 段断言耦合**：该段判 `.note-head` 不横向溢出（`ui-shot.mjs:2289` 的 `headOverflow` + `:2327`），行内加控件若压缩 `.note-head` 可用宽度就会翻红。设计档要写明控件落点（建议 `.note-row` 的列布局内做兄弟节点，不改 `.note-head` 内部），并声明 32 段为回归门。
6. **情形 3/4 的判据与面板折叠的关系二选一写死**：或把清空判据从「离开笔记标签」放宽到「笔记面板不可见（含折叠）」，或明确保留「折叠不清空」并说明理由。
7. **N48 验收 1 的快照口径写死**：以「发送瞬间的派生结果」为准，发送在途发生的清单变化（例如删除）只影响下一回合，不回溯本次载荷。
8. **§0.2 的 chip `title` 归因不准**：条数上限造成的丢弃也被计入 `M`，而 title 逐字写「因超过 8000 字符上限未注入」。选择期已硬拒第 11 条 ⇒ 该分支只能由防御式裁剪触发。建议 title 改为「因超出上限未注入」，或声明该文案仅在字符上限路径下逐字成立。
9. **`selectedText` 与 notes 段的量级关系要在设计档留一句**：`selectedText` 无上限（`PdfViewer.vue:727`），8000 只约束 notes 段；避免后续把「8000」当成整块上下文的保护总量。

---

## 设计评审（R8）

> 评审对象：`docs/pm/R8-design.md`（对照 `docs/pm/R8-req.md`、上文需求评审，以及真实代码：`renderer/utils/{reading-context,notes-path}.ts`、`renderer/stores/{notes-store,session-store,reader-store}.ts`、`renderer/components/workspace/{ChatPanel,NotesPanel,PdfViewer}.vue`、`renderer/composables/{useQuickAsk,useRpc}.ts`、`renderer/components/input/InputArea.vue`、`renderer/pages/WorkspacePage.vue`、`scripts/ui-shot.mjs`）。
> 方式：只读核对（`grep`/`sed`/`git show`）+ 一处实测（`./node_modules/.bin/tsc --baseUrl . --paths …`，TypeScript 5.8.3）。
> 结论：**revise**。must-fix 8 条（§2）。主线成立：派生式选择集、`send()` 单点快照、`selectNotesForContext` 唯一实现点、条数/字符双上限、chip 与载荷同源、`readingAnchorFor` 只在实现层索引化（语义与签名零改动）都能落在现有代码上；阻塞项集中在两处 —— **离屏取证面与 §1.3/§1.4 的冻结契约不同源（场景 40/43/44 的断言与驱动序列互斥）**，以及**「追问 / 问 AI」在无文档时的可见承诺落空（N44-2 与 §0.4 的「chip 随即显示 摘录 1 条」不可达）**。

### 0. 已核对为真、开工后不得翻案的前提

1. **注入侧唯一实现点与调用面成立**：`buildReadingUserMessage` 只被 `ChatPanel.vue:320` 调用，既有四/五段字段与「无选区不出现 `selectedText:` 行」的范式同档；追加 `reader_notes` 不触碰任何既有字段 ⇒ N46 验收 2 的「与 R7 逐字节相同」可达成。
2. **依赖面无环**：`reading-context.ts` 现只 `import type { LibraryFileResult }`，新增顶层 `./notes-path`（value）后仍无环（`notes-path.ts` 只依赖 `@shared/types`）；`notes-store.ts` 反向 import `utils/reading-context` 的常量同样无环。
3. **§0 修订 3 与冻结排序自洽**：`docPathKey("archive/older-paper.pdf") < docPathKey("sample-paper.pdf")` ⇒ §1.2 示例、烟测 1、场景 43 的「1. archive 在前」三处一致（需求档 §0.1 示例确为反序，须按本档回改）。
4. **上限算术成立且非临界样本**：按 §0.1 冻结格式手算，`overflowSeed()` 单条条目块 = 62（骨架）+ 3000 = 3062 字符 ⇒ 2 条 6125 ≤ 8000 < 3 条 9188，恰好丢 1 条。设计档写「骨架 ≈61 字符 ⇒ 6123/9185」差 2 字符，但结论与场景 42b 的 label/title 文案不变，余量充足。
5. **选区构造路径存在且在作用域内**：`selectPageSpan(page)`（`ui-shot.mjs:1224`）造真实 `Range` + `selectionchange` 并等浮层出现；harness 的点击一律 `el.click()`（合成事件，无 mousedown）⇒ 场景内构造的选区不会被后续点击清掉（must-fix 2 的修法可行）。
6. **stub 侧可控**：生成式 stub 整体是一段模板字符串（`ui-shot.mjs:234-723`），`seedNotes(list)`（`:685`，可传任意列表）、`notesDelete`（`:623`）、`NOTES_ERRORS`（`:293`）、`onUserInputRequest` 的丢弃式 no-op（`:540`）都在其中 ⇒ §1.6 五条原语（含 `emitUserInputRequest` / `setNotesDeleteFailure`）可按「模板内不得出现反引号」实现；40–46 与既有 00–11 / 20–24 / 30–36 / 99 无编号冲突。
7. **追加位置可行**：`runReaderStateScenarios`（`:1058-2620`）是单函数体，`record` / `countOf` / `notesHash`（`:1757`）/ `emit`（`:1759`）/ `clearStateA`（`:1760`）/ `userBlocks`（`:1761`）/ `typeAndSend`（`:1908`）/ `runTurn`（`:1922`）/ `selectPageSpan`（`:1224`）都在作用域内，尾插（36 之后）可达。
8. **§6.3 前置 no.3 成立**：场景 36 末段确实 `rmSync(LIBRARY_DIR/archive/older-paper.pdf)`（`:2597`），而树来自静态 `LIBRARY_TREE`（`:473-479`）⇒ 删文件不影响 `waitTreeRows(4)`，只影响「打开该文件」；场景 41 用「点该文档的 `.note-ask` 后 pill 与页码不变」作判据因此有效。
9. **白名单与红线**：§3 的 9 个文件与需求 §4 一致；无需 `shared/types.ts` 与主进程改动；`ContextChipKind`、`ReadingSendContext` 都在白名单文件内；`npm run check` = vue-tsc + 两次 tsc，与「唯一工程门」口径一致。

### 1. 评审清单逐条结论

**1) 契约自洽性** —— §1.1–§1.5 内部互洽：`selectedNoteIds` 派生式、`replaceSelectionWith` 的唯一写权与失败语义、`MAX_CONTEXT_NOTES(_CHARS)` 单点定义、chip `label`/`title` 两形态与 §0.2 冻结文案逐字一致、seam 形态与既有 `registerQuickAskConsumer`/`emitQuickAsk` 同范式。**三处与验证面不自洽**：场景 40/44 的 chip 与注入断言（must-fix 1）、场景 43 的 `selectedText:` 断言（must-fix 2）、§6.4 no.2/no.9 的期望计数（must-fix 7）。另：§1.5 三态 3 与 §6.4 no.11 对「谁挂 `.stop`」互相矛盾，会让 `.note-select` 的 toggle 出现两份实现（must-fix 3）。

**2) 注入安全** —— 上限真生效：装填是「`[...entries, block].join("\n").length > 8000` ⇒ 整条丢弃并继续尝试」，单条超限可装入 0 条；条数上限在存储侧（派生计数守卫，用 `selectionFull` 而非 `selectedNoteIds.size`）与注入侧（`slice(0,10)` 防御）各一次；主进程 `MAX_NOTE_TEXT_LENGTH = 4000` 使「整库笔记发出去」不可达（最坏 10×4000 也被 8000 截住）。超限行为可见：label + title 两形态，P=0 时 chip 仍渲染、仍可移除（§4 第 4 行）。`selectedText` 无上限这一事实已在 §1.2「体积关系声明」显式写出（采纳需求评审次级项 9）。

**3) 选择集生命周期** —— 七种情形逐条核对通过：情形 1/2（保留 + `finally` 复位）与现有 `send()` 语义一致；情形 3 的可达路径只有 `onOpenNote`（`WorkspacePage.vue:203-212`），与情形 4 不再相抵；情形 4 的 `leftCollapsed` 例外与理由写死；情形 5 挂在 `resetNotes()`，覆盖挂载/卸载/`goHome` 三个既有调用点（`WorkspacePage.vue:98/137/226`）；情形 6/7 由派生自动收敛。§0 修订 1 的论证成立：`selectLeftTab` 同标签早退（`:196-201`），`loadNotes` 的其余触发点只有错误态「重试」，产品内不存在「ready + 已选 → loading/error」路径 ⇒ 删除「非 ready 清空」不产生死代码。发送在途的取值确定：快照取发送瞬间的派生结果（元素对象由 `applyNotes` 全量替换保证不被就地改写），在途变化只影响下一回合。无幽灵选中、无跨工作区残留。

**4) 交互可实现性** —— 草稿保护与既有 composer 不冲突：`onQuickAsk` 只在 `!draft.value` 时填模板（保持零改动），`onNotesAsk` 用 `draft.trim() === ""`，两者互不覆盖；`setDraft` 走原生 setter + `input` 事件写 `.input-area`，`sendViaEnter` 派发 `keydown Enter` 命中 `InputArea.onKeydown`（`InputArea.vue:26-31`）⇒ 流式 steer 路径可驱动（现有脚本确无 steer 场景，§8 第 5 条的判断正确）。PDF 选区 quick-ask 与笔记追问共用 seam 文件但信号不同，无干扰（N44-10 保持）。**缺口**：无文档时两个入口仍可点，而注入必然不发生（must-fix 6）。

**5) 与既有语义冲突** —— chips 排除集的重置点（`finally` + `currentSessionPath`/空列表两个既有 watcher）零改动；「摘录」chip 被排除只影响本次发送、`send()` 不清空选择集；`"document" ∈ excluded` 的级联与 R7 锚点登记解耦（锚点在快照段登记，与排除分支无关，`ChatPanel.vue:298-310`）；删除二次确认的 capture 监听（`NotesPanel.vue:123-148`）与多选无冲突，`.note-select-wrap`/`.note-ask-wrap` 的 `@click.stop` 是隔离行级 `open-note` 的正确做法；备注编辑与展开全文都在自带 `.stop` 的容器内，N43-4 的「零影响」成立；非 ready 态不渲染选择条、选择集不清空，chip 与载荷同源 ⇒ 无撒谎。

**6) 验证可执行性** —— 烟测 15 组可判定（8000/8001 边界、继续尝试后续条目、归一化、11 条防御、非 PDF 均给出可比较期望）；离屏 15 场景中 40b/40c/42d/44b/45 的判据可构造（`seedNotes` 写穿 + 切标签触发 `loadNotes`、`setNotesDeleteFailure`、`setSendFailure`、`emitUserInputRequest` 都在可控面内）。**三处不可判定**：场景 40/44（must-fix 1）、场景 43（must-fix 2）、「替换不追加」与「问 AI 入口」（must-fix 4/5）；另有 §6.1 主命令实测不可执行（must-fix 8）。

**7) 规模与工作量** —— 9 个文件（A 面 4 + B 面 5），成本集中在 `ui-shot.mjs`（15 场景 + 5 断言组 + 5 条 stub 原语 + 两处种子恢复），设计已按 A/B 面拆分并给出唯一交接面（A 的导出名 + `readingAnchorFor` 签名不变）；比需求 N50 冻结的多出 3 场景 + 2 原语，已在 §6.3 末段与 §8 第 7 条申报。整体与需求 §7 的估算口径一致，无隐藏越界面。

**8) 越界与白名单** —— 无越界：不碰 `packages/**`、`pix/package.json`、lockfile、`pix/build/**`、electron-builder 配置、`main/**`（含 `reading-prompt.ts`）、`shared/types.ts`、`resources/skills/**`；A 面不碰 `.vue`、B 面不碰 `utils/**`/`stores/**`，两侧交集只有 A 的导出名与常量，无重复实现面（排序/裁剪/长度比较只允许出现在 `reading-context.ts`，§6.4 no.1/no.2 的口径正确）。

### 2. must-fix（8 条，改完才开工）

1. **场景 40/44 与 §1.3 的 chip 可见性规则互斥（与 42d 直接矛盾）。** 40 明写「不打开文档」却断言 `chip:"摘录 2 条"`；44 未打开文档却断言 `chip:"摘录 1 条"` 与 `hasReaderNotes:true`（44b/45 继承），而 42d 在同样的无文档前提下断言 `chipCount:0`。修：40 删掉 `chip` 字段（或改为断言 chip 不存在），44 在选笔记前补「开 `sample-paper.pdf` → `waitPage(1,3)`」，与 41/42/43/46 同形。
2. **场景 43 断言 `selectedText:` 行，但驱动序列没有任何构造 PDF 选区的步骤。** §6.3 前置 no.1 的可用 helper 清单也没列作用域内已有的 `selectPageSpan(page)`（`ui-shot.mjs:1224`）。修：在 `waitPage(2,3)` 之后插入 `selectPageSpan(2)`（合成 click 不产生 mousedown，选区不会被后续点击清掉），或从断言集中删掉 `selectedText:`。
3. **`.note-select` 的点击处理唯一性未冻结，且 §1.5 与 §6.4 自相矛盾。** §1.5 三态 3 写「点击 `.note-select-wrap`/`.note-select` 都带 `@click.stop`」，§6.4 no.11 又写「`.stop` 由包裹元素承担」：input 也挂 toggle ⇒ 点复选框触发两次（勾选自相抵消）；input 只挂 `.stop` 不挂 toggle ⇒ 点复选框失效。场景只点 `.note-select-wrap`，两种错误都测不出。修：写死「只有 `.note-select-wrap` 挂 `@click.stop="toggleNoteSelected(note.id)"`，`.note-select` 只做受控 `:checked`/`disabled`」，并加一条点 `.note-select` 本体的断言。
4. **「替换、不追加」（N44-6）没有任何判别证据。** 场景 41 是空集 → 1 条、41b 是 1 条 → 1 条，把 `replaceSelectionWith` 实现成追加仍全绿。修：41b 先选 2 条再点第 3 行的 `.note-ask`，断言 `countText:"已选 1 条"` 与 chip `摘录 1 条`。
5. **选择条「问 AI」入口（`.notes-ask-btn`）在所有场景里从未被点击。** 现有断言只读它的文本与禁用态 ⇒ N44-7 无判定，§1.4「原样使用当前选择集」这条路径无证据。修：加一个相位（选 2 条 + 空草稿 → 点 `.notes-ask-btn` → `value` = 模板、`activeHasInputArea`、`countText` 仍 `已选 2 条`）。
6. **无文档时「追问 / 问 AI」是静默空转，与 §0.4/N44-2 的可见承诺冲突。** 无文档 ⇒ `readingContextWillSend === false` ⇒ chip 不渲染、载荷无 `reader_notes`，但两个入口仍可点并会填模板/提示行，用户以为摘录进了上下文；§4 失败表没有这一行。修：补一行失败路径并冻结可见行为（按「是否打开文档」禁用两个入口 + title 文案，或复用 `.notes-ask-notice` 给一句提示），并补一条对应断言。
7. **§6.4 的期望计数与 §1 契约不符。** no.9 期望 `NotesPanel.vue` 只有 1 处 `emitNotesAsk`，但 §1.4 要求选择条按钮「模板内直接调用」（必然 2 处）；no.2 用 `MAX_CONTEXT_NOTES` 作 pattern 会连 `MAX_CONTEXT_NOTES_CHARS` 的定义、使用与注释一起命中，不可能只有「定义 1 + 引用 3」。修：改期望（逐文件写清命中数并把 pattern 写精确）或改实现（选择条也走同一个 `onNotesAsk`）二选一。
8. **§6.1 的烟测编译主命令不可执行（已实测）。** `tsc --baseUrl . --paths '{"@shared/*":["src/shared/*"]}' …` 在 TypeScript 5.8.3 下直接报 `error TS6064: Option 'paths' can only be specified in 'tsconfig.json' file or set to 'null' on command line.`。修：主命令改为写 `$TMP/pix-r8-ctx/tsconfig.json`（`baseUrl` + `paths` + 三个入口文件）后 `tsc -p`，并删掉现在那段「tsc 不收 paths 时」的备选说明。

### 3. 次级项（不阻塞，但设计档/开发档要写死）

1. §6.2 用例 11 的标题写「两条」，实际是三条（第 1 条装入 / 第 2 条超限 / 第 3 条继续装入）；期望值本身正确。
2. §1.6 写 `sendCalls`「记录点在 `handleCommand` 的既有分支内」——`handleCommand`（`ui-shot.mjs:340-352`）目前没有 prompt/steer 分支，`prompt`/`steer` 落到默认 `{success:true,data:{}}`；应写成「新增 prompt/steer 分支并在此记录」。
3. `answerTitleFromEnd(n)` 与既有 `titleOfLastAnswer`（`:1763`，场景 30/31/33/35/36 在用）重复；建议把后者泛化为 `answerTitleFromEnd`，不要留第二份写法。
4. `clearSendCalls()` 在 §6.3 无任何场景使用，与 N51-7「不新增死代码」有张力：要么在某个场景显式使用（如 42c 发送前清基线），要么在设计档注明它是场景隔离的预留口。
5. N49-4「回答块每帧每块至多解析一次」只有走查口径，§6.4 无对应核对点；建议补一条 grep（模板中 `answerSaveTitle(`/`answerSaveDisabled(` 取 `answerActionViews`，`answerSaveTarget(` 只出现在一个 computed 内）。
6. 场景 41/41b 的 `activeHasInputArea` 证据依赖 `document.activeElement`，而窗口是 `show:false`（`:2644`）的离屏窗口；建议设计档写死取法（在 `js` 里显式 `focus()` 后读，或降级为 `.input-area:focus` 查询并把 `document.hasFocus()` 一并记入测量）。
7. `kind: answer` 的注入后果（markdown 换行/代码块被 `\s+ → 单个空格` 折叠成一行）是 §0.1 冻结值的必然结果；需求评审 §2 要求设计档「承认这一后果」，§1.2 只写了 kind 取原始值，建议补一句，避免实现期自行加过滤或例外。
8. §8 的 7 条都是对需求档字面量的修改请求（需求档 §0 声明冻结值不得改写）：开工前需要负责人明确处置（同轮回改需求档，或声明该轮以设计档口径为准并入档），否则 N43-9 / N45-3 / N46-1 / N44-9 的验收会与设计档字面冲突。

---

## 代码审查（R8）

> 审查对象：R8 交付（`reading-context.ts` / `notes-store.ts` / `useQuickAsk.ts` / `NotesPanel.vue` / `ChatPanel.vue` / `WorkspacePage.vue` / `ui-shot.mjs` 七个文件 + `docs/pm/R8-dev.md`），对照 `docs/pm/R8-req.md`（N43–N51）、`docs/pm/R8-design.md`（定稿，含「定稿修订」一节）与上文两份评审。
> 方式：只读走查（`git status` / `git diff` / `grep` / `sed`）+ 自建纯函数烟测（仓库外临时 tsconfig，含与 `git show HEAD:` 编译产物的逐字节比对）+ 离屏脚本复跑 4 次（其中 3 次为干净工作树）。
> 结论：**revise**。功能主线（N43–N48、N50、N51）在我这边全部复现为绿，注入面与上限面按冻结值逐字成立；实质性缺口只有 **N49 未落地**（`session-store.ts` 仍是 `findIndex`，每帧二次方开销原样保留），另有两处「落点/口径与冻结字面不一致」需处置。must-fix 3 条（§4）。

### 1. 真实执行的命令与结果

```text
$ cd pix && npm run check
CHECK_EXIT=0（无输出；改前基线 0 error，A 交接态的那条 TS2345 已被 B 的 readContext.notes 实参消除）

$ git status --short
 M pix/scripts/ui-shot.mjs
 M pix/src/renderer/components/workspace/ChatPanel.vue
 M pix/src/renderer/components/workspace/NotesPanel.vue
 M pix/src/renderer/composables/useQuickAsk.ts
 M pix/src/renderer/pages/WorkspacePage.vue
 M pix/src/renderer/stores/notes-store.ts
 M pix/src/renderer/utils/reading-context.ts
?? docs/pm/R8-design.md / R8-dev.md / R8-req.md / R8-review.md
$ git diff --stat pix/src/main pix/src/shared/types.ts   → 空
$ grep -c 'ipcMain.handle("notes' pix/src/main/ipc-handlers.ts → 6
（packages/**、pix/package.json、package-lock.json、pix/build、electron-builder 配置：0 改动）

$ 自建烟测（%TEMP% 临时 tsconfig：baseUrl=仓库 pix、paths 指向 @shared/*、files 含 types/ipc.ts；R7 版另用 stub 类型单独编译）
TSC_EXIT=0；node assert.cjs → checks=18 failed=0，SMOKE_EXIT=0
覆盖：设计档 §1.2 示例逐字（notes 入参逆序仍 A 在前）、notes 为空时与 HEAD 版 reading-context 产物逐字节相同 ×4（有/无选区、空 userText、无文档）、排序四级键与确定性、text/comment 归一化、8000 恰好装入 / 8001 整条丢弃、中间条超限后继续尝试（序号续编）、单条 9000 字 → 装入 0、超长 comment（9000 字）→ 整条丢弃不截断、11 条防御裁剪、条目块无反斜杠/盘符/id/时间戳、doc 取 docPath 原样、非 PDF、不传 notes 抛错、空集输出与 R7 逐字节相同

$ cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
复跑 3 次（干净工作树）：2 次 UISHOT_EXIT=0 / MANIFEST.failure=null / shots=74 / 五组 5·5·7·8·2；
1 次在既有场景 33 超时（渲染层 `[pdf-viewer] ... PDFWorker.fromPort - the worker is being destroyed` ⇒ `.page-label` 未出现），
  其余 1 次失败是我自己的烟测产物所致（见 §7），不计入。
R8 段渲染层日志：10 条既有 `[reader-state] load degraded (missing)` + 1 条场景 45 故意注入的 `[useRpc] Command prompt failed`，无新增告警。
```

### 2. 逐条验收核对（N43–N51）

| 验收项 | 结论 | 证据 |
| --- | --- | --- |
| N43-1/2 选择集单点落 store、派生式（notes ∩ ids）、注入侧只读 | 通过 | `selectedNoteIds` 仅命中 `stores/notes-store.ts`（7 行，未外露原始集合）；`selectedNotes`/`selectedCount`/`selectionFull` 三个 computed；无 `watch(notes)`、无 splice 类手工同步；ChatPanel 只读 `notesStore.selectedNotes` |
| N43-3/4/10 DOM 契约、`.note-head` 零改动、`@click.stop`、`.note-row.selected` | 通过 | `NotesPanel.vue:368-452`：`.note-select-wrap` 唯一处理器 + 原生 `input.note-select`（本体 0 处 `@click`）；`.note-head` 四元素顺序/类名/属性逐字未动（diff 仅缩进位移）；`.note-row.selected` 规则在 `.note-row.confirming` 之前 ⇒ 叠加时既有配色胜出；离屏 40 的 `nativeCheck:{countText:"已选 1 条",checked:true}` 正是「双触发/只挂 .stop」两种错误的判别 |
| N43-5/6/7 选择条文案、清空归零、上限三态与恢复 | 通过 | 离屏 40（`已选 2 条`/`问 AI`/`清空`/selectedRows=2/barInHeader/barAfterFilter/无文档时 chipCount=0）、40b（bar/行态/chip 全归零）、40c（`已选 10 条`、row11 禁用 + title 逐字 `最多可注入 10 条笔记，请先取消其它选择`、点第 11 条零效果、取消一条后恢复可用、restoredRows=4） |
| N43-8 删除已选笔记收敛 | 通过 | 离屏 44：删 `n-current-2` 后 `已选 1 条` + `摘录 1 条` + rows=3；载荷 `notesCount=1` 且不含被删文本（`excludesDeleted`） |
| N43-9 非 ready 态无选择条 | 存疑 | 设计 §0 修订 1 已删「非 ready 清空」半句并改判据；产品内无「ready+已选 → loading/error」路径，本轮无任何有判别力的断言（错误态下选择集必为空，「无 bar」恒真）——需需求档按 §8 第 1 条回改字面，不是代码缺陷 |
| N43-11 选择/清空/追问不写盘 | 通过 | 40/40b 的 `noWrite:{addCallsSame:true,hashSame:true}`；`notes-store.ts` 选择集四个动作不调用任何 `bridge()`；44b 删除失败后 `hashSame:true` |
| N44-1/2/10 seam 唯一、替换不追加、既有 quick-ask 零改动 | 通过 | 全仓库仅 `composables/useQuickAsk.ts` 一个 seam 文件，两套注册/触发同范式并存；替换只在 `notes-store.replaceSelectionWith`（`NotesPanel.vue:126` 唯一调用点）；离屏 41b 先选 2 条再点第 3 行 `.note-ask` ⇒ `已选 1 条` + `摘录 1 条`（追加实现会得 3 条）；`PdfSelectionQuickAsk`/`emitQuickAsk` 未动 |
| N44-3/4/5/7/8/9 草稿规则、焦点、两入口、澄清禁用、流式 steer | 通过 | `onNotesAsk` 内 `draft.value = ` 恰 1 处且在 `trim() === ""` 分支；41（模板逐字 + `activeHasInputArea`）、41b（`我的草稿` 一字不改 + 提示行逐字 + 2600ms 后消失）、41c（两入口 disabled + 逐字 title + 点击零副作用 + 复位恢复）、41d（选择条入口保持 `已选 2 条`）、42d（无文档 ⇒ 禁用 + 逐字 title，不再静默空转）、43 steer 相位 `{type:"steer",hasReaderNotes:true}` |
| N45-1/2/5/6/8 chip 契约、级联、既有 chip 零改动 | 通过 | `ContextChipKind` 增 `notes`、`contextChips` 顺序 document→selection→notes、排除仍走 `excludeContext`；42（`["当前文档：sample-paper.pdf · 第 1 页","摘录 2 条"]` + title `本次注入 2 条笔记` + 移除按钮 title `本次发送不使用`）；42c `doc-cascade`（移除文档 chip ⇒ 摘录 chip 一并消失、`chipCount:0`、载荷无 `<reading_context>`）；既有 chip 行为/文案/移除未改（`title?: string` 对旧 chip 恒为 undefined ⇒ 不渲染属性） |
| N45-3 文案字面量 | 通过（按 §0.2） | 实现取 §0.2 冻结的带「笔记」版（`本次注入 P 条笔记；M 条因超过 8000 字符上限未注入`），与 N45-3 少写「笔记」二字不符——设计 §0 修订 2 已判需求档回改，代码侧无错 |
| N45-4/7 移除 chip 后不发 `reader_notes`、空集与 R7 同形 | 通过 | 42c `removed`（payload `hasReaderNotes:false` 且 `displayText` 逐字）、`r7-regression`（无 `selectedText:`/无 `reader_notes:`）；我的烟测另有 4 例与 HEAD 产物逐字节相同 |
| N46-1..5/9 注入形状、排序、归一化、洁净、非 PDF | 通过 | 我的烟测 1/3/4/5a/5b/6/10/11 逐条；形状逐字等于设计 §1.2 示例（3 空格缩进、条目间无空行、`lines.join("\n")` 无结尾换行）、`doc` 取 `docPath` 原样、条目块内无 `id`/时间戳/盘符/反斜杠；伪造行测试：`text` 内含 `2. doc: evil.pdf` 不产生新行（归一化后仍在同一条 `   text: ` 行内） |
| N46-6 唯一实现点与落点 | 失败 | `reader_notes` 的拼接/排序/长度比较确实只在 `reading-context.ts`（grep 3 行，ChatPanel 0 处实现），但 `sortNotesForContext` 定义在本文件（`reading-context.ts:37`）而非常规落点 `utils/notes-path.ts`（需求 N46-6／设计 §3.1 字面落点），见 must-fix 2 |
| N46-7/8 真实载荷、系统提示词零改动 | 通过 | 43 `missing:[]`（含 `<reading_context>` / `page: 2` / `selectedText:` / `reader_notes:` / `1. doc: archive/older-paper.pdf` / `   page: 7` / `   kind: excerpt` / 两条 `   text:` / `   comment:`）、`orderOk`、`entryBlockNoBackslash/NoIds`、`endsWith("\n\n"+ASK)`；`git diff pix/src/main` 与 `pix/resources/skills` 为空 |
| N47-1..8 上限算法与文案 | 通过 | 烟测 5a/5b（8000 恰好装入、8001 整条丢弃）、6（中间条丢弃后继续尝试且序号续编、无 `slice` 产物）、7/12（单条自身超限 ⇒ 装入 0、不变式 `injected+dropped === notes.length`）、8/13（11 条 ⇒ 10+1）、额外的超长 comment 用例；42b 离屏逐字 `摘录 3 条 · 超出上限未注入 1 条` + title 逐字；P=0 时 chip 仍渲染（`notesChip` 不因 `injected=0` 返回 null） |
| N48-1..7 单点快照、排除分支、失败保留、steer、不清空 | 通过 | `send()` 区间内 `notesStore.selectedNotes` 1 处 / `notes: ` 1 处 / `buildReadingUserMessage(` 1 处 / `clearNoteSelection` 0 处；快照在 `appendOptimisticUserMessage` 之前、与 `readContext`/`anchor` 同一同步段；42c `removed`（排除 notes ⇒ 有 `<reading_context>` 无 `reader_notes`）与 `doc-cascade`（排除 document ⇒ 全不发）双向取证；45 两种失败模式后 `已选 2 条`/`摘录 2 条` 保留、重发 `notesCount=2`；43 steer 注入；无任何清空分支落在 `send()` 内 |
| N49 锚点索引化 | 失败 | `grep -n findIndex pix/src/renderer/stores/session-store.ts` → `287`（期望 0）；`blockIndexOf`/`byId.size !== blocks.length` 0 命中；场景 46 只判行为等价（无缓存可失效）；`ChatPanel.answerActionViews` 每帧对 N 块各调一次 `readingAnchorFor` ⇒ 每帧仍是 O(块数²)，「消掉每帧二次方开销」未达成。见 must-fix 1 |
| N50 取证面 | 通过 | stub 五原语齐全（`sendCalls` 只记 prompt/steer 且留最近 8 条、`clearSendCalls`、`setSendFailure` 的 throw/fail、`emitUserInputRequest`、`setNotesDeleteFailure`）；16 场景、五组断言（5·5·7·8·2）全部用脚本内 `record(...throw)` 落地，失败即抛；`MANIFEST.failure===null`、截图 74 张（改前 55）、`99-failure-state.png`+退出码 1 的失败路径在我第 3 次复跑中被真实触发过一次 |
| N51-1..7 回归与零外溢 | 通过 | 既有 00–11/20–24/30–36 场景在同一轮内全绿（含 32 段 `headOverflow` 六行全 true）；`check` 0 error；白名单外 0 改动；notes 六通道不变；无 `any`/无内联动态 import（6 个源码文件 0 命中）；无未调用导出（`clearSendCalls`/`emitUserInputRequest`/`setNotesDeleteFailure` 均在场景中使用） |
| 既有场景稳定性 | 存疑 | 3 次干净复跑中 1 次在**既有**场景 33 超时（`PDFWorker.fromPort - the worker is being destroyed` ⇒ `.page-label` 未出现）。该错误来自本轮未改动的 `PdfViewer`/`reader-store`（diff 为空），判定为既有 teardown 竞态而非 R8 回归；但「既有场景全绿」不是稳定事实，见 §6 |

### 3. 红线核对

- 依赖/配置面：`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置、`pix/resources/skills/**` 全部 0 改动；无新增依赖。
- 主进程面：`git diff pix/src/main pix/src/shared/types.ts` 为空；notes 六条 IPC 通道计数不变；`reading-prompt.ts` 未动（注入不写进系统提示词）。
- 类型与写法：6 个源码文件 `: any` / `as any` / `await import(` / 内联 `import(` 均 0 命中；`ReaderNote` 走顶层 `import type`；`sortNotesForContext` 为顶层 value import（无环）。
- 渲染层路径与失败路径：新增代码不拼存储路径（注入只透传 `ctx.filePath` 与 `note.docPath`）；删除失败沿用既有中文通知（44b 逐字 `删除失败：笔记写入失败`）；追问遇失效 id 按需求 N44-8 零副作用（无静默写入）。UI 文案全中文。
- 用户资产：`notes.json` 全程只读（选择/清空/发送前后 sha256 不变，删除失败时也不变）；无新增落盘字段；选择集只存在于渲染层内存。
- 排除机制未被绕过：chip 与载荷同源（`selectNotesForContext` 单点），`excludedContexts` 仍是「本次发送」语义，`finally` 复位后 chip 立即恢复（42c `restored`）。

### 4. must-fix（3 条）

1. **N49 未落地（唯一实质缺口）** —— `pix/src/renderer/stores/session-store.ts:287` 的 `readingAnchorFor` 仍是 `displayBlocks.findIndex`，无 `blockIndexOf`/byId 索引（`grep findIndex` 1 命中，需求 N49-1／设计 §6.4 no.4 期望 0）。`ChatPanel.answerActionViews` 每帧对 N 块各调一次 ⇒ 每帧仍 O(N²)，N49 的「消掉每帧二次方开销」没有达成；场景 46 只判行为等价，无法判缓存失效。期望：按「数组引用变**或**长度变 ⇒ 整表重建」补索引（`byId` 首现下标优先），`readingAnchorFor` 签名/返回类型/解析规则不变；不得引入 `splice/shift/unshift/sort/reverse`。
2. **`sortNotesForContext` 落点与冻结字面不符** —— `pix/src/renderer/utils/reading-context.ts:37` 定义该函数，需求 N46-6 与设计 §3.1 冻结的落点是 `pix/src/renderer/utils/notes-path.ts`（由 `reading-context` 顶层 import）。行为等价、无功能风险，但它是验收的字面项；期望：迁回 `notes-path.ts` 后由 `reading-context.ts` 顶层引入，或由负责人在设计档正式改判落点并记入开发档。
3. **设计档 §6.4 的两处期望计数需回改（纯文档）** —— no.17 冻结「ChatPanel 内 `readingAnchorFor(` 0 命中」，与 §3.2/§7「ChatPanel 每帧每块一次解析」不可同时成立；实现按语义取唯一 1 处调用点（`AnswerActionViews` 内，模板 0 处直接解析）。no.9 的逐文件行数同样偏低（import 行也会命中 pattern：ChatPanel 3 / NotesPanel 3）。期望：按实际口径回改这两条的判据与计数，不留「档面判否实现」的悬空期望。

### 5. 三个（+1）「最可能出错但没人验证」的点

1. **发送瞬间快照 vs 在途变化**：快照在 `appendOptimisticUserMessage` 之前的同步段取 `[...notesStore.selectedNotes]`，且 `applyNotes` 是全量替换（元素对象不会被就地改写）⇒ 在途期间删除/重载/改选择**不会**污染已发出的载荷，判定为正确。**但 chip 是实时的**：`await rpc.sendPrompt/sendSteer` 在途时改动选择集，chip 会立刻显示新条数，而已发出的载荷是旧快照（例如「已发出 2 条、chip 显示摘录 3 条」）。与 R7 既有「当前文档 chip + page」同范式，设计 §1.1 也冻结了「在途变化只影响下一回合」，故不判为缺陷；本轮无任何取证原语（如 `setSendDelay`）覆盖该窗口，属未验证面。
2. **超长单条是否绕过字符上限**：不绕过。实测（我自己的烟测）：单条 `text` 9000 字 ⇒ `injected 0 / dropped 1` 且消息无 `reader_notes:` 行；`comment` 9000 字（主进程对 comment 无长度校验）⇒ 同样整条丢弃、无字符级截断；骨架字符计入 `[...entries, block].join("\n").length`，故「恰好 8000」只有在扣除骨架后才装入（我的 8000/8001 标定即按此口径通过）。唯一未被断言覆盖的是「文本 + 备注合计接近上限」的整条丢弃可解释性（文案只说 8000 字符上限），判定为可接受。
3. **追问是否会覆盖用户草稿**：不覆盖。`onNotesAsk` 内 `draft.value = ` 恰 1 处且在 `trim() === ""` 分支，41b 逐字断言 `我的草稿` 不变、提示行 2500ms 后消失。**发现的边角瑕疵（不阻塞）**：草稿非空点追问（出提示行）→ 立刻清空草稿 → 再点追问 ⇒ 模板已填入，而**旧提示行仍在显示**（最长 2.5 s），「已加入 N 条摘录，草稿已保留」与当前无草稿的状态读起来矛盾；一行修复即可（空草稿分支里清 `notesAskNotice` 与定时器），或由设计档写死「允许残留」。
4. **选择集是否跨工作区残留**：不残留。`resetNotes()` 追加 `clearNoteSelection()`，覆盖挂载/卸载/`goHome` 三个既有调用点；`store` 侧无持久化（不写 notes.json / reader-state / settings）。**但「离开笔记标签即清空」（§0.3 情形 4）只有走查证据**：把 `WorkspacePage.selectLeftTab` 里那行删掉，现有 40c（`restoreStandardSeed` 只断言行数）与 42b 之后的场景都不会变红——若要把该行为钉死，建议补一条「切到 library 再切回 ⇒ `已选 0 条` / 无 `.note-row.selected`」的相位。

### 6. 观察项（不阻塞）

1. **需求档的 8 条回退建议仍未回改**（设计 §8）：N43-9 的「非 ready 清空」已按设计删除、N45-3 的 title 少写「笔记」二字、§0.1 示例与冻结排序相反、N44-9 引用的 steer 场景不存在、N50 冻结清单外的两个原语（`emitUserInputRequest`/`setNotesDeleteFailure`）等。代码按设计口径落地正确，但需求档字面与实现并存时会再次产生「按档判否」的误判。
2. **`ui-shot` 既有场景 33 的 pdf.js teardown 竞态**：3 次干净复跑中 1 次在该既有场景超时（`PDFWorker.fromPort - the worker is being destroyed`）。涉事文件（`PdfViewer.vue`/`reader-store.ts`）本轮零改动 ⇒ 非 R8 回归；但它会让「既有场景全绿」偶发变红，建议单独一轮收掉（加载任务 destroy 与新建 task 的时序，或 harness 侧的重试）。
3. **离线取证对既有 `typeAndSend` 的重构是等价重构**：旧实现体逐字搬入 `setDraft`，`waitFor('.composer-send' 可点) + click` 未变 ⇒ 既有场景时序不受影响（已核对 diff）。
4. **截图目录不清场**：`shots/` 里会残留上一次失败运行的 `99-failure-state.png`（不入 MANIFEST）。不影响判据，但读者容易误读「75 张」；建议脚本开跑前清理或改名。

### 7. 审查自身的痕迹清理（如实记录）

我自己的烟测用 `tsc -p` 编译时，第二次尝试（跨盘 `files` 触发 TS5009）把 6 个编译产物写回了源码树：`pix/src/main/{pix-paths,preload}.js`、`pix/src/renderer/types/ipc.js`、`pix/src/renderer/utils/{notes-path,reading-context}.js`、`pix/src/shared/types.js`。已按文件逐个删除，仓库现回到「7 M + 4 ??（文档）」；`git ls-files` 确认这些 `.js` 从未被跟踪，删除不影响任何提交内容。顺带记一个坑：**`src/renderer/**` 下残留的 `.js` 会被 vite 优先解析**（我第 2 次离屏复跑失败即由此产生：`does not provide an export named 'MAX_CONTEXT_NOTES'`），后续任何人做纯函数烟测都必须把 `outDir` 指到仓库外，且跑 `ui-shot` 前确认源码树无 `.js` 残留。


