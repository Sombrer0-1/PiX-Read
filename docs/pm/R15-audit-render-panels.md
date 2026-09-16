# R15 全量代码审计：渲染层面（面板与会话 UI）

> 审计面：`pix/src/renderer/components/workspace/{NotesPanel,LibraryPanel,ChatPanel}.vue`、`components/session/*.vue`、`components/input/*.vue`、`components/layout/AppLayout.vue`、`pages/*.vue`、`router.ts`、`App.vue`。
> 方式：只读（未修改任何源码/脚本；未执行任何 git 写命令；未运行 build/test/package/dev；未跑离屏 `ui-shot.mjs`）。
> 编号约定：`S-RP-NN` = 问题项，`D-RP-NN` = 登记不修项。所有行号来自本轮真实读取的文件版本（HEAD `e5dc001`）。

## 0. 基线与复跑证据

| 命令 | 真实结果 |
| --- | --- |
| `cd pix && npm run check` | 退出码 0，无输出（`vue-tsc` + 主进程 `tsc` + preload `tsc` 全绿） |
| `node pix/scripts/smoke-view.mjs` | `通过 35 / 失败 0` |
| `node pix/scripts/smoke-notes.mjs` | `通过 51 / 失败 0` |
| `%TEMP%` 下 marked 转义探针（只读仓库 `pix/node_modules/marked`，仓库零残留） | 8 例输入均被转义/过滤，未发现注入路径（见 D-RP-02） |

结论分布：**P0 = 1，P1 = 5，P2 = 14，D = 4**（S-RP-12 为 5 处同因可访问性问题合并的簇条目）。

| 编号 | 分级 | 位置 | 一句话 |
| --- | --- | --- | --- |
| S-RP-01 | P0 | `components/input/InputArea.vue:28-33` | 回车发送未做输入法组合态守卫，中文选词回车即误发半成品 |
| S-RP-02 | P1 | `ChatPanel.vue:369,386-391` | 发送失败路径丢弃用户正文，草稿不还原、无重试入口 |
| S-RP-03 | P1 | `ChatPanel.vue:206-212,690-718` | 澄清请求被替换时 `currentQuestionIndex` 未复位，卡片消失且 composer 被禁用（无出口） |
| S-RP-04 | P1 | `ChatPanel.vue:428-455,462-470,623-631` / `NotesPanel.vue:31,255-296` | 剪贴板同一规则两份实现，失败路径一边报错一边静默 |
| S-RP-05 | P1 | `InputArea.vue:35-39` + `ChatPanel.vue:369` | 程序性清空草稿后 textarea 高度不复位 |
| S-RP-06 | P1 | `WorkspacePage.vue:74-125` vs `127-141` | 组件在 `onMounted` 的 await 期间被卸载时，IPC 订阅泄漏且卸载后继续写 store |
| S-RP-07 | P2 | `ChatPanel.vue:53-60` / `ThinkingSelector.vue:14-21` / `SettingsPage.vue:109-116` | 思考档位标签三处实现、两套文案（轻量/极简、标准/中…） |
| S-RP-08 | P2 | `NotesPanel.vue:666-696` / `WorkspacePage.vue:284,291` | 长列表无虚拟化 + 每次键入全量过滤/排序/重渲染；双侧面板 `v-show` 常驻 |
| S-RP-09 | P2 | `NotesPanel.vue:169-177,701` | 相对时间不自刷新，列表可展示陈旧时间 |
| S-RP-10 | P2 | `LibraryPanel.vue:102-123` | 懒展开目录失败静默：无 loading、无错误、`expanded` 已置位 |
| S-RP-11 | P2 | `ChatPanel.vue:729-750` | `mdCache` FIFO 淘汰可能淘汰在流式块，且跨会话不清理 |
| S-RP-12 | P2 | 见条目（5 处） | 可访问性簇：行不可键盘打开、"×" 无 aria-label、无 aria-live、澄清卡焦点不转移、窄屏 overlay 无 Esc |
| S-RP-13 | P2 | `ChatPanel.vue:330-340,398-415` | `pickFiles` 无异常捕获（IPC reject 零反馈）；粘贴图片被静默丢弃 |
| S-RP-14 | P2 | `ModelSelector.vue:61-66,74-81` / `ThinkingSelector.vue:63-70` | 选择模型/思考深度失败仅 `console.error`，渲染层失败路径静默 |
| S-RP-15 | P2 | `SettingsPage.vue:181-184,96-107,274` | `revealPath` 忽略失败；删密钥无二次确认；`saved` 复位用未托管 `setTimeout` |
| S-RP-16 | P2 | `stores/project-store.ts:25,86-88,123-133` | 死代码：`setCurrentProject` / `addSession` / `isLoadingSessions` 零消费 |
| S-RP-17 | P2 | `ChatPanel.vue:163` + `WorkspacePage.vue:157-168` | 会话切换/新建不清草稿、不按会话隔离（未规定行为，存在误发风险） |
| S-RP-18 | P2 | `ChatPanel.vue:1076,1085,1089,1094,1107` 等 | 多处 `<button>` 缺 `type="button"`，与同文件既有写法不一致 |
| S-RP-19 | P2 | `ChatPanel.vue:287-290,1099,1104` | `v-model` 与 `@update:model-value` 双写草稿（重复逻辑） |
| S-RP-20 | P2 | `HomePage.vue:43-61` | `openWorkspace` 无在途守卫，双击最近项目可并发 `startSession` + `newSession` |
| D-RP-01 | D | `utils/markdown.ts:32-50`（alt 在 `:46,49`） | 图片 `alt` 双重转义（实测 `alt="a &amp;amp; b"`），仅文案级 |
| D-RP-02 | D | `pix/index.html` / 主进程 | 无 CSP 第二道防线；本面实测无可利用注入路径 |
| D-RP-03 | D | `LibraryPanel.vue:58-64,86-89` | 资料库树固定展开三层 + 全树常驻，改动触及 R14 冻结面 |
| D-RP-04 | D | `NotesPanel.vue:26,715-720` | 折叠阈值 180 字符为启发式，中文长行"展开全文"时机与视觉不一致 |

---

## 1. P0

### S-RP-01 回车发送缺少输入法（IME）组合态守卫

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/components/input/InputArea.vue:28-33`（`onKeydown`）、绑定点 `:57` `@keydown="onKeydown"` |
| 证据 | ```ts\nfunction onKeydown(e: KeyboardEvent): void {\n  if (e.key === "Enter" && !e.shiftKey) {\n    e.preventDefault();\n    emit("send");\n  }\n}\n``` 同仓已有正确写法可对照：`pix/src/renderer/components/workspace/PdfSearchPanel.vue:308` `if (event.isComposing) return;` |
| 为什么是问题 | 中文界面产品的主输入路径。输入法组合中按 Enter 是"选词/上屏"，Chromium 该次 keydown 的 `isComposing === true`，当前实现照样 `emit("send")`，把未上屏的半截拼音/候选词当消息发出；`ChatPanel.send()` 已经先 `draft.value = ""`（`ChatPanel.vue:369`）并插入乐观气泡，误发内容不可撤回，只能重新输入。同根因的次要位置：`SettingsPage.vue:482` `@keydown.enter="saveKey(provider)"`（可能写入半截密钥）、`SettingsPage.vue:348` `<v-form @submit.prevent="saveSettings">`（任意输入框内回车即整体保存）、`ChatPanel.vue:1136` `@keydown.enter="saveRename"`（可能用未上屏的名称重命名会话）。 |
| 建议修法 | `onKeydown` 首行加守卫：`if (e.isComposing \|\| e.keyCode === 229) return;`（照抄 PdfSearchPanel 写法）。次要位置同样补守卫或改由显式按钮触发。 |
| 修复风险 | 低，且不触冻结断言：`pix/scripts/ui-shot.mjs:2435` 的 steer 驱动用 `new KeyboardEvent("keydown", { key: "Enter", bubbles: true })`，`isComposing` 默认 `false`，守卫不会拦截，场景 43 的 `type === "steer"` 断言保持绿。不涉及任何几何/文案。 |
| 判据 | 在 `.input-area` 上派发 `new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true })` ⇒ `sendPrompt`/`sendSteer` 调用计数为 0、`.input-area` value 不变；随后派发 `isComposing: false` 的同类事件 ⇒ 计数 +1（既证修复也证判据有判别力）。 |

## 2. P1

### S-RP-02 发送失败丢弃用户正文

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/components/workspace/ChatPanel.vue:369`（`draft.value = ""`）、`:386-391`（catch 只回滚气泡）；行为落点 `pix/src/renderer/stores/session-store.ts:317-334` `failOptimisticUserMessage` |
| 证据 | ```ts\n} catch (err) {\n  const errorMessage = err instanceof Error ? err.message : String(err);\n  sessionStore.failOptimisticUserMessage(optimisticBlockId.value, errorMessage);\n  ...\n``` + `session-store.ts`：`displayBlocks.value = displayBlocks.value.filter((block) => !removeIds.has(block.id));` 后仅 `push({ type: "error", message, source: "send" })`。 |
| 为什么是问题 | 失败路径上正文三重消失：气泡被回滚、`draft` 已在 `:369` 清空、ErrorBlock 无重试入口。用户写完的长提问（可能含整段引用）在一闪而过之后不可恢复，违反 PRD-V0.5 §5.5"渲染层失败路径不得静默"的立意。 |
| 建议修法 | catch 中若 `draft.value === ""` 则 `draft.value = text`（并 `nextTick` 聚焦）；或给 ErrorBlock `source === "send"` 增加"重新发送"按钮。二者都保留既有"气泡回滚"语义。 |
| 修复风险 | 中低。必须**保持** `ui-shot.mjs` 场景 45 的 `userBlocksRolledBack`（`pix/scripts/ui-shot.mjs:4032,4038-4039` 断言“失败后乐观用户块应回滚”与错误文案 `stub 发送注入异常`）不变；还原草稿会让 `.input-area` 在失败后非空，但场景 45/45B/45C 每次都先用 `setDraft` 覆写（`ui-shot.mjs:2413-2429`），故不产生新红。 |
| 判据 | 新增/扩充场景：`setSendFailure("throw")` → 发一条 `TEXT` → 等 `.error-block` → 断言 `document.querySelector(".input-area").value === TEXT` 且用户气泡仍已回滚；同时断言 `.composer-send` 可点（未被禁用）。 |

### S-RP-03 澄清请求被替换时 `currentQuestionIndex` / `answerMap` 未复位

| 字段 | 内容 |
| --- | --- |
| 位置 | `ChatPanel.vue:206-212`（状态与 `currentQuestion` 早退）、`:690-718`（只有提交/取消两处复位）；请求替换来源 `WorkspacePage.vue:106-124`（`agent_start` 置 null、`onUserInputRequest` 直接覆盖） |
| 证据 | ```ts\nconst currentQuestion = computed(() => {\n  const req = props.pendingUserInput;\n  if (!req \|\| currentQuestionIndex.value >= req.questions.length) return null;\n  return req.questions[currentQuestionIndex.value];\n});\n``` 全文件对 `props.pendingUserInput` **没有** watcher（`:143-152` 只 watch `currentSessionPath` 与 `displayBlocks.length`）。 |
| 为什么是问题 | 只要用户推进到第 2 题（`currentQuestionIndex = 1`）后请求被替换（`WorkspacePage` 的 `onNewSession` / `onSwitchSession` 置 null，或 agent_start 清空后新请求到达），新请求若只有 1 题 ⇒ `currentQuestion === null` ⇒ `ClarificationCard` 不渲染（`ChatPanel.vue:1061-1062` `v-if="clarifying && currentQuestion"`），而 `clarifying` 仍为 true，`InputArea` 被 `:disabled="clarifying"`（`:1102`）禁用 ⇒ 用户既看不到问题也无法输入，界面进入无出口的卡死（只能"新对话"逃出）。同时 `answerMap` 会携带上一个请求的问题 id 一起进入 `answers`。 |
| 建议修法 | 加 `watch(() => props.pendingUserInput, () => { currentQuestionIndex.value = 0; answerMap.value = {}; })`（在 `ChatPanel.vue:143-152` 的 watcher 附近），并在 `request.id` 变化时同样复位。 |
| 修复风险 | 低。仅动组件本地状态；`ui-shot.mjs` 的澄清场景（`:3548-3560`）每次只发一个请求，watcher 不会改变其路径。 |
| 判据 | 复现脚本：`emitUserInputRequest({ id: "r1", questions: [q1, q2] })` → 点"继续"（index=1）→ `emitUserInputRequest({ id: "r2", questions: [q1] })` ⇒ 断言 `.clarification-card` 仍在 DOM 且 `.question-progress` 为 `1 / 1`、`.card-textarea` 未禁用；反例（不修）时卡片消失且 `.input-area` disabled。 |

### S-RP-04 剪贴板同一规则两份实现，失败路径行为不一致

| 字段 | 内容 |
| --- | --- |
| 位置 | `ChatPanel.vue:428`（`COPY_FEEDBACK_MS = 1200`）、`:430-455`（`copyToClipboard` + `copyViaExecCommand`）、`:462-470`、`:623-631`；`NotesPanel.vue:31`、`:255-296`（同值常量 + 逐字相同实现） |
| 证据 | 两文件注释已自认同源：`NotesPanel.vue:255` `// --- 剪贴板：异步 API 优先，execCommand 兜底（写法与 ChatPanel 一致） ---`、`NotesPanel.vue:31` `/** 复制按钮的「已复制」反馈窗口（与 ChatPanel 同值，不抽公共模块）。 */`。失败路径分叉：`NotesPanel.vue:286-289` `if (!(await copyToClipboard(...))) { setNotice("error", "复制失败：无法访问剪贴板"); return; }` vs `ChatPanel.vue:463` `if (!(await copyToClipboard(block.content))) return;`、`ChatPanel.vue:624` 同形。 |
| 为什么是问题 | 同一规则（异步 API → execCommand 兜底 → 1200ms 反馈）存在两份实现，且同一失败场景下笔记面板报错、会话面板静默无反馈——正是"契约漂移"：改一处不会改另一处，用户看到的行为取决于点击位置。 |
| 建议修法 | 抽 `pix/src/renderer/utils/clipboard.ts`：导出 `COPY_FEEDBACK_MS`、`copyToClipboard(text): Promise<boolean>`，两处改为顶层 import；失败反馈由调用方注入（ChatPanel 补 `setNotice`/提示行）。 |
| 修复风险 | 低-中：纯函数外提不改 DOM；但 ChatPanel 目前**没有**提示行机制（`notesAskNotice` 是"草稿已保留"专用），补失败反馈需新增一行 UI，可能影响 `.composer` 高度相关截图（`ui-shot.mjs:3626` `composer42` 截图）。若只做外提+保持 ChatPanel 静默，则零风险但只解决一半问题。 |
| 判据 | `grep -rn "copyViaExecCommand" pix/src` 只应命中 `utils/clipboard.ts` 一处；行为判据：让 `navigator.clipboard.writeText` 与 `document.execCommand` 双双抛错（stub 注入），点 `.message-copy-btn` ⇒ 出现中文失败提示（当前无任何反馈）。 |

### S-RP-05 程序性清空草稿后 textarea 高度不复位

| 字段 | 内容 |
| --- | --- |
| 位置 | `InputArea.vue:35-39`（`autoResize` 只在 `@input` 里调用，`:22-26`）、`:53` `:value="modelValue"`；清空来源 `ChatPanel.vue:369` `draft.value = ""` |
| 证据 | ```ts\nfunction autoResize(): void {\n  if (textareaRef.value) {\n    textareaRef.value.style.height = "auto";\n    textareaRef.value.style.height = Math.min(textareaRef.value.scrollHeight, 200) + "px";\n  }\n}\n``` `autoResize` 只在 `onInput`（`:25`）触发；父组件直接改 `modelValue` 时只更新 `value`，`style.height` 保持上一次输入算出的高度。 |
| 为什么是问题 | 粘贴/输入多行长文后点发送，输入框被清空但仍是 200px 高的大块（直到用户下次敲键才回落）；同时 `draft` 由 `@quickAsk`/`onNotesAsk` 等程序性写入时高度也不会自动适配（模板文案较短，影响小）。属于"状态未复位"的用户可见残留。 |
| 建议修法 | `watch(() => props.modelValue, () => nextTick(autoResize))`（或 `onUpdated`），并在 `props.modelValue === ""` 时直接置回初始高度。 |
| 修复风险 | 低。`ui-shot.mjs` 中 composer 相关断言只读 `value`/可点性（`:3217-3227`），不读 `style.height`；`.composer` 截图（`:3626`）可能在高草稿场景下变矮，属预期修复效果。 |
| 判据 | 用原生 setter 写入 6 行文本并派发 `input` → 记录 `getBoundingClientRect().height` → 点 `.composer-send` → 断言 `.input-area` 的 `value === ""` 且高度回到单行（约 ≤ 32px）。 |

### S-RP-06 `onMounted` 内 await 之后注册 IPC 订阅：卸载竞态与订阅泄漏

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/pages/WorkspacePage.vue:74-125`（`onMounted`：`await startSession` → `await syncWorkspaceState` → `await notesStore.loadNotes()` → `await readerStateStore.loadReaderState()` → 才 `unsubscribeEvent = window.pixApi.onAgentEvent(...)`），清理只在 `:127-141` 的 `onUnmounted` |
| 证据 | ```ts\nonMounted(async () => {\n  ...\n  await syncWorkspaceState({ loadMessagesIfEmpty: true });\n  notesStore.resetNotes();\n  await notesStore.loadNotes();\n  readerStateStore.resetState();\n  await readerStateStore.loadReaderState();\n  document.addEventListener("visibilitychange", onDocumentVisibilityChange);\n  window.addEventListener("pagehide", onWindowPageHide);\n  unsubscribeEvent = window.pixApi.onAgentEvent((event) => { ... });\n``` 而 `onUnmounted` 只做 `unsubscribeEvent?.()`（卸载瞬间该变量仍为 `null`），且不检查"是否已销毁"。 |
| 为什么是问题 | 用户在首个 await 窗口内点"返回首页"（`goHome` 会 `stopSession` + `router.push("/")` + 清空 store）时：`onUnmounted` 先跑（`null?.()` 空操作、store 被 `resetNotes`/`resetState` 清空），随后异步续段仍会注册 `onAgentEvent` 与 `onUserInputRequest` 并把回调赋给已卸载组件作用域的变量 ⇒ ①订阅泄漏（没有第二次卸载可清理）；②每个 agent 事件继续触发 `sessionStore.addEvent` 与 `syncWorkspaceState()`（4 次 IPC + `listSessions`），在已复位/已离开工作区的状态下写 store。 |
| 建议修法 | `let disposed = false;` + `onUnmounted(() => { disposed = true; ... })`，在每个 await 之后 `if (disposed) return;`；或把两个订阅挪到 `onMounted` 的同步段（第一个 await 之前），再由 `onUnmounted` 统一解绑。 |
| 修复风险 | 低-中。顺序调整可能改变 `agent_start` 早到事件的处理时序（现状是订阅前的事件天然丢失）；建议用 `disposed` 旗标方案，保持注册顺序不变。 |
| 判据 | 注入慢 IPC（stub 把 `startSession`/`notes-load` 延迟 500ms）→ 进入工作区后立刻 `router.push("/")` → 断言 `window.pixApi.onAgentEvent` 的注册/解绑调用数相等（当前会多出 1 次注册且无解绑），且之后派发 `agent_start` 不再触发 `listSessions` 调用。 |

## 3. P2

### S-RP-07 思考档位中文标签三处实现、两套文案

| 字段 | 内容 |
| --- | --- |
| 位置 | `ChatPanel.vue:53-60`（`THINKING_LEVEL_LABELS`）、`components/input/ThinkingSelector.vue:14-21`（同表复制）、`pages/SettingsPage.vue:109-116`（`thinkingLevelItems`） |
| 证据 | `ChatPanel.vue:55` / `ThinkingSelector.vue:16` `minimal: "轻量"`，而 `SettingsPage.vue:111` `{ title: "极简", value: "minimal" }`；同类：`low` 低/低、`medium` `标准` vs `中`、`high` `深入` vs `高`、`xhigh` `极深` vs `极高`。 |
| 为什么是问题 | 同一枚举在两处界面显示不同中文（会话头部 chip 显示"轻量"、设置页选项显示"极简"），用户无法把两处对应起来；枚举新增档位需改三处，漏一处即静默回退为英文原值（`ChatPanel.vue:183` `?? level`）。 |
| 建议修法 | 抽 `pix/src/renderer/utils/thinking-levels.ts`：`THINKING_LEVEL_LABELS`（唯一文案源）+ `THINKING_LEVEL_DESCRIPTIONS`；三处改为 import，设置页的 `thinkingLevelItems` 由该表派生（保留"极简"或统一为"轻量"，需在轮次需求档登记冻结字面变更）。 |
| 修复风险 | 中。改动设置页下拉文案会触碰既有离屏截图/文案断言（PRD §5.7 要求冻结字面变更显式登记并更新断言）。 |
| 判据 | `grep -rn "极深\|极简" pix/src/renderer` 只命中 `utils/thinking-levels.ts` 一处；界面判据：会话头部 chip 与设置页选项对同一枚举显示同一中文。 |

### S-RP-08 长列表无虚拟化 + 每次键入全量重算；双侧面板 `v-show` 常驻

| 字段 | 内容 |
| --- | --- |
| 位置 | `NotesPanel.vue:666-696`（`v-for` 直出全部组与行，无虚拟化）、`:496-514`（搜索框逐键写 store）、`stores/notes-store.ts:150`（`groups` 派生由 store 承担）；`WorkspacePage.vue:284,291`（`LibraryPanel` 与 `NotesPanel` 同时挂载，仅 `v-show` 切换） |
| 证据 | 列表模板每个条目渲染 `.note-select-wrap > input` + `.note-body`（页徽标/时间/删除按钮/正文/展开按钮/备注触发器 `v-icon`/复制/追问）共约 12 个元素，且 `v-for` 无窗口化；`v-show` 只切 `display`，隐藏面板的 watcher/computed/渲染仍随 store 变化运行。 |
| 为什么是问题 | 机制性判断（未实测）：①搜索每敲一个字符 ⇒ store `searchQuery` 变化 ⇒ `groups` 全量过滤+排序 + 整个列表重渲染，笔记量到数百条以上时是明显的主线程热点；②隐藏的面板仍在为数百行做派生与 diff（切到"资料库"标签并不能省掉笔记列表的渲染成本）。**可访问性影响经核对不存在**：`v-show` 用 `display: none`，隐藏子树不进 a11y 树，也不产生重复选择器歧义。 |
| 建议修法 | 优先做零几何风险的输入 debounce（如 150ms 落 store）并给行加 `v-memo`/`content-visibility: auto`；虚拟化属结构改动，建议单独排轮（见 D-RP-03）。 |
| 修复风险 | 中高。debounce 会改变 `ui-shot.mjs:4994-5002`（`setSearch` 派发 `input` 后立即断言）的时序，`waitFor` 有轮询但断言即时读文案的场景可能瞬时红；`content-visibility` 可能影响 `headOverflow`/行数几何读数。需登记并在离屏验证中复核。 |
| 判据 | 造 500 条笔记（现有离屏种子放大）→ 测量连续 10 次键入到列表稳定的用时与 `.note-row` 数量；修复后单次键入不得导致全列表重渲染（可用 `notesStore.groups` 的求值计数或渲染计时对比基线）。 |

### S-RP-09 相对时间不自刷新

| 字段 | 内容 |
| --- | --- |
| 位置 | `NotesPanel.vue:169-177`（`relativeTime` 用 `Date.now()`）、`:701`（`{{ relativeTime(note.createdAt) }}`） |
| 证据 | `const minutes = Math.floor(Math.max(0, Date.now() - ms) / 60000);` 只在组件重渲染时求值；NotesPanel 没有节拍定时器（`nowTick` 只存在于 ChatPanel）。 |
| 为什么是问题 | 面板挂机久了（或长时间只读 PDF），"X 分钟前"会停留在打开时刻的口径，与实际不符；用户看到陈旧时间。 |
| 建议修法 | 复用分钟级 `nowTick`（60s 定时器，卸载清理）或改显式绝对时间；不许引入新的全局轮询。 |
| 修复风险 | 低（多一个定时器需要成对清理；会改变 `.note-time` 文案，若离屏断言逐字读时间需登记）。 |
| 判据 | 冻结 `Date.now()` 或推进假时钟 3 分钟后触发一次重渲染 ⇒ `.note-time` 文案随之变化（当前不变）。 |

### S-RP-10 资料库懒展开失败静默

| 字段 | 内容 |
| --- | --- |
| 位置 | `LibraryPanel.vue:102-123` |
| 证据 | ```ts\nif (!node.children \|\| node.children.length === 0) {\n  const result = await window.pixApi.libraryList(node.path, 1);\n  if (result.success) {\n    node.children = result.nodes;\n  }\n}\nnext.add(node.path);\nreplaceExpanded(next);\n``` 无 `else` 分支、无 `isLoading` 反馈、无 try/catch（IPC reject 会直接冒泡成未处理拒绝）。 |
| 为什么是问题 | 三种失败（`success: false`、reject、返回空）都不产生任何可见反馈，且 `expanded` 仍被置位 ⇒ 用户点目录"没反应"，再点一次是"折叠"（视觉上是箭头反转但列表不变），无法判断是权限问题、空目录还是故障；违反 PRD-V0.5 §5.5。 |
| 建议修法 | 失败时 `errorText.value = result.error \|\| "无法读取目录"`（复用 `.empty-hint` 呈现）/ 提示行，并**不**把该节点加入 `expanded`；补 `catch`。 |
| 修复风险 | 低（不改树几何，只多一行提示；`.empty-hint` 已有既有样式）。 |
| 判据 | stub 让 `libraryList(subdir, 1)` 返回 `{ success: false, error: "x" }` ⇒ 断言出现中文错误提示、节点保持折叠、无未处理拒绝。 |

### S-RP-11 `mdCache` 淘汰策略与跨会话残留

| 字段 | 内容 |
| --- | --- |
| 位置 | `ChatPanel.vue:729-750`（`const mdCache = new Map<...>`、`:745-747` 淘汰、`:732` `renderAgentMarkdown`） |
| 证据 | ```ts\nif (mdCache.size > 300) {\n  const oldest = mdCache.keys().next().value;\n  if (oldest !== undefined) mdCache.delete(oldest);\n}\n``` `Map.set` 对已存在的键不改插入序，因此"最旧"= 最早出现的块 id，可能正是当前仍在流式增长的块（长会话 + 同时多条回答时会被反复淘汰/重解析）；缓存也不随 `sessionStore.clearSession()` 清空。 |
| 为什么是问题 | ①淘汰不是 LRU，命中率与作者意图（"节流缓存"）不符，长会话下仍可能每次 token 触发整段 `renderMarkdown`（O(n²) 路径正是该缓存要解决的问题）；②跨会话残留 300 条 HTML 字符串，属无界（虽封顶）常驻内存。 |
| 建议修法 | 淘汰前先跳过 `isStreaming` 块（或改用 LRU：命中即 `delete` + `set`）；在 `currentSessionPath` watcher 里 `mdCache.clear()`（`:143-146` 已有的 watcher 内一行）。 |
| 修复风险 | 低（纯内部缓存，无 DOM/文案影响）。 |
| 判据 | 单测/走查：3 条回答轮流流式（>300 个不同块）后断言流式块的缓存条目仍在；会话切换后 `mdCache.size === 0`。 |

### S-RP-12 键盘与可访问性簇（5 处）

| 字段 | 内容 |
| --- | --- |
| 位置 | ①`NotesPanel.vue:677-683`（行是纯 `div @click`，无 `role`/`tabindex`，键盘无法打开笔记）；②`ChatPanel.vue:1076,1085,1089` 与 `:1073`（chip/附件移除按钮只写 `title`，正文是 `×`，无 `aria-label`）；③`ChatPanel.vue:958` `.chat-messages` 无 `role="log"`/`aria-live`（流式回答不播报）；④`ChatPanel.vue:1061-1062` + `:1102`（澄清卡出现时 composer 被禁用，焦点停留在被禁用的 textarea 上，不转移到 `.clarification-card`，键盘用户需自行 Tab）；⑤`AppLayout.vue:61-90`（窄屏 chat overlay 只有关闭按钮，无 Esc 关闭、无关闭后焦点归还） |
| 证据 | `①` `<div v-for="note in group.notes" :key="note.id" class="note-row" ... @click="emit('open-note', note)">`；`⑤` `<aside v-show="chatVisible" class="layout-right" :class="{ 'chat-overlay': narrow }">` 与 `@click="chatOpen = false"` 是唯一关闭路径（全文件无 `keydown` 处理）。 |
| 为什么是问题 | 面板内所有行级主操作（打开笔记）只有鼠标路径；流式输出对读屏用户完全静默；澄清提问出现时键盘焦点停在失效控件上。这些是"能不能用"的问题，不是风格偏好。 |
| 建议修法 | ①行内加一个可聚焦的 `button.note-open`（正文区）或给行 `role="button" tabindex="0"` + `@keydown.enter.space`；②给 3 处移除按钮补 `aria-label="移除"`/`"本次发送不使用"` 并保留 `title`；③`role="log" aria-live="polite"`；④`watch(props.pendingUserInput)` 里 `nextTick(() => cardRef.value?.focus())`；⑤overlay 上挂 `keydown.esc` 关闭并归还焦点到 `.chat-open-btn`。 |
| 修复风险 | 中。①④涉及 DOM 结构调整（新增可聚焦元素）与焦点行为，可能影响离屏"焦点在 `.input-area`"类断言（`ui-shot.mjs:3504,3608`）；③②⑤纯属性/行为新增，风险低。 |
| 判据 | 纯键盘走查：连续 Tab 能到达并在 Enter 后打开一条笔记；读屏/`aria-live` 属性存在性断言；澄清卡出现后 `document.activeElement` 落在卡片内；窄屏 overlay 下按 Esc 关闭。 |

### S-RP-13 `pickFiles` 无异常捕获；粘贴图片静默丢弃

| 字段 | 内容 |
| --- | --- |
| 位置 | `ChatPanel.vue:330-340`（`pickFiles`）、`:398-415`（`onPaste`） |
| 证据 | ```ts\nasync function pickFiles(): Promise<void> {\n  if (!window.pixApi) return;\n  const files = await window.pixApi.selectChatFiles();\n  for (const path of files) { ... }\n}\n``` 无 try/catch；`onPaste` 中 `if (prepared) { clipboardImages.value = [...]; }` 无 else，且超上限时 `if (clipboardImages.value.length >= MAX_PASTED_IMAGES) break;` 无提示。 |
| 为什么是问题 | ①`selectChatFiles` reject ⇒ 未处理的 Promise 拒绝，用户点"添加附件"无任何反馈；②粘贴 HEIC/SVG/损坏图片时 `preparePastedImage` 返回 null（`utils/image-capture.ts:39-43` 已 catch 并 `console.error`），UI 完全无反馈；③粘第 9 张图直接丢弃无提示 ⇒ 用户以为已附图。均为失败路径静默。 |
| 建议修法 | `pickFiles` 包 try/catch 并 `setNotice`/提示；`onPaste` 与 `onRegionCapture` 对 null/超限给出中文提示（"无法识别的图片格式"/"最多 8 张截图"）。 |
| 修复风险 | 低（新增提示行，可能与 `.composer` 截图高度相关）。 |
| 判据 | stub 让 `selectChatFiles` reject ⇒ 出现中文错误提示且无未处理拒绝；粘贴 9 张图 ⇒ 出现上限提示且 chip 数为 8。 |

### S-RP-14 模型/思考深度选择失败仅 `console.error`

| 字段 | 内容 |
| --- | --- |
| 位置 | `components/input/ModelSelector.vue:61-66`（`selectModel`）、`:74-81`（`cycleModel`）、`components/input/ThinkingSelector.vue:63-70`（`selectThinkingLevel`） |
| 证据 | ```ts\ntry {\n  await rpc.setModel(model.provider, model.id);\n  emit("close");\n} catch (err) {\n  console.error("[ModelSelector] Failed to set model:", err);\n}\n``` |
| 为什么是问题 | 用户点击"选择模型"后若主进程拒绝，面板不关闭、无提示，界面表现为"点了没反应"；用户无法区分是失败还是自己没点中。违反 PRD-V0.5 §5.5"渲染层失败路径不得静默"。 |
| 建议修法 | 面板内加一行中文错误态（复用 `auth-notice` 样式）或在 catch 里 `emit("close")` + 由 ChatPanel 显示提示。 |
| 修复风险 | 低（面板内部新增一行，且面板本身不在离屏几何断言清单内）。 |
| 判据 | stub 让 `set-model` 命令 reject ⇒ 断言面板内出现中文失败文案（当前只有控制台输出）。 |

### S-RP-15 SettingsPage 三处小缺陷

| 字段 | 内容 |
| --- | --- |
| 位置 | `pages/SettingsPage.vue:181-184`（`revealPath`）、`:96-107`（`deleteKey`）、`:274`（`setTimeout(() => (saved.value = false), 2000)`） |
| 证据 | ```ts\nasync function revealPath(path: string): Promise<void> {\n  if (!window.pixApi) return;\n  await window.pixApi.libraryShowInFolder(path);\n}\n``` 返回值被忽略；对比 `NotesPanel.vue:405-413` 对同一 API 检查 `${result.success}` 并弹中文错误。`deleteKey` 一键即删（无二次确认，密钥需重新申请）。`saved` 复位的定时器无句柄、卸载不清理。 |
| 为什么是问题 | 同一条 IPC 在两个面板的失败处理不一致（漂移 + 静默失败）；删除凭证无确认是真实的数据损失风险（无法恢复）；未托管定时器在组件卸载后仍写 ref（后果轻微但属清理遗漏）。 |
| 建议修法 | 与 NotesPanel 对齐检查 `result.success` 并提示；`deleteKey` 加二次确认（照抄 ChatPanel 会话删除的两步确认模式）；`saved` 定时器用局部变量持有并在 `onUnmounted` 清理。 |
| 修复风险 | 低（无冻结几何影响；`deleteKey` 交互变更需在轮次需求档登记）。 |
| 判据 | stub 让 `libraryShowInFolder` 返回 `{ success: false }` ⇒ 出现中文提示；删密钥需两次点击；卸载后无定时器回调写入。 |

### S-RP-16 死代码：`project-store` 三个导出零消费

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/stores/project-store.ts:25`（`isLoadingSessions`）、`:86-88`（`setCurrentProject`）、`:123-133`（`addSession`） |
| 证据 | `grep -rn "setCurrentProject\|addSession\|isLoadingSessions" pix/src --include=*.ts --include=*.vue`（排除定义文件本身）返回空；`project-store.ts:135-149` 的返回对象仍导出三者。 |
| 为什么是问题 | 违反 PRD-V0.5 §4.8"不写未被调用的死代码"；仓库约定把"预留"定义为"冻结契约 + 记录接入位置"，不新增未使用成员。误留会让后续读者以为存在第二条会话列表写入路径。 |
| 建议修法 | 删除三处导出（若确有 R16 计划使用，则在需求档登记接入位置后再保留）。 |
| 修复风险 | 低（零调用点）；注意不要误删被 `WorkspacePage` 使用的 `setCurrentSession`/`syncCurrentSession`（有调用点）。 |
| 判据 | `grep` 结果为空且 `npm run check` 仍 0 error。 |

### S-RP-17 会话切换/新建不清草稿、不按会话隔离

| 字段 | 内容 |
| --- | --- |
| 位置 | `ChatPanel.vue:163`（`const draft = ref("")`，全文件无按会话键控）、`WorkspacePage.vue:157-168`（`onNewSession` / `onSwitchSession`） |
| 证据 | `onSwitchSession` 只做 `sessionStore.clearSession(); pendingUserInput.value = null; await rpc.switchSession(...)`；`ChatPanel` 对 `props.currentSessionPath` 的 watcher（`:143-146`）只 `resetExcludedContexts()`，不动 `draft`/附件/粘贴图。 |
| 为什么是问题 | 未在任何需求档规定（本轮未找到"草稿跨会话保留"的约定）。后果：在会话 A（论文 A）写了一半切到会话 B，草稿与附件跟随，回车即把 A 的内容发进 B；附件 chip 同样跨会话残留。属"状态未复位"型风险，但也可能是产品有意的连续输入体验——需明确取一。 |
| 建议修法 | 二选一并登记：①会话切换时清空 `draft`/`attachments`/`clipboardImages`；②按 `currentSessionPath` 键控保留（`Map<sessionPath, draft>`），切换时回填。 |
| 修复风险 | 中（涉及 composer 内容语义，且 `ui-shot` 有"追问后草稿保留"的既有断言 `:3504-3517`，需确保只在会话标识变化时动作）。 |
| 判据 | 会话 A 输入文本 → 切到会话 B ⇒ 断言 composer 为空（方案①）或 A 的文本在切回 A 后恢复（方案②）。 |

### S-RP-18 `<button>` 缺 `type="button"`

| 字段 | 内容 |
| --- | --- |
| 位置 | `components/session/MessageBlock.vue:44`（附件 chip）、`components/input/ModelSelector.vue:113,153,184,189`（关闭/选项/翻页）、`components/input/ThinkingSelector.vue:83,90`、`components/workspace/ChatPanel.vue:1076,1085,1089,1094,1107`、`pages/WorkspacePage.vue:256,259,279,303` |
| 证据 | 同文件其它按钮已带 `type="button"`（如 `ChatPanel.vue:868,919`、`ClarificationCard.vue:43,66`），说明是遗漏而非风格选择。 |
| 为什么是问题 | 卫生问题：仓库规范"风格向同文件看齐"；当前无 `<form>` 祖先故无功能后果，但 `SettingsPage` 使用 `<v-form>`（`:348`），一旦这些按钮被复用到表单内即变成隐式提交。 |
| 建议修法 | 批量补 `type="button"`。 |
| 修复风险 | 低（纯属性）。 |
| 判据 | `grep -rn "<button" pix/src/renderer | grep -v 'type="button"'` 仅剩有意例外。 |

### S-RP-19 草稿双写（`v-model` 与 `@update:model-value` 并存）

| 字段 | 内容 |
| --- | --- |
| 位置 | `ChatPanel.vue:1099`（`v-model="draft"`）、`:1104`（`@update:model-value="updateDraft"`）、`:287-290`（`function updateDraft(value) { draft.value = value; }`） |
| 证据 | `InputArea.vue:22-26` 只 `emit("update:modelValue", ...)` 一次，父组件因此对同一值写两次（`v-model` 展开为 `modelValue` + `update:modelValue`，与显式监听重复）。 |
| 为什么是问题 | 重复逻辑（仓库 P2 定义），且 `updateDraft` 目前无任何附加行为，容易误导后来者以为此处有副作用钩子（实际新增副作用会被调用两次的风险点）。 |
| 建议修法 | 删除 `@update:model-value="updateDraft"` 与 `updateDraft` 函数（或改由 `watch(draft)` 承担真正的副作用）。 |
| 修复风险 | 低（行为等价）。 |
| 判据 | 走查 + 输入一次中文/粘贴一次，断言 `draft` 只被写入一次（可临时打点或删除后回归离屏场景 41/45）。 |

### S-RP-20 `openWorkspace` 无在途守卫

| 字段 | 内容 |
| --- | --- |
| 位置 | `pages/HomePage.vue:43-61`（`openWorkspace`）、`:70-72`（`openRecentProject`） |
| 证据 | ```ts\nasync function openWorkspace(dirPath: string): Promise<void> {\n  if (await rpc.startSession(dirPath)) {\n    await projectStore.openProject(dirPath);\n    const result = await rpc.newSession();\n``` "最近打开"列表项本身无 `disabled`/loading，双击即并发执行两条 `startSession` + `newSession` 链。 |
| 为什么是问题 | 竞态：第二条链会覆盖第一条的会话状态（`syncCurrentSession` 取最后一次结果），并可能在工作区目录留下一个多余的空会话文件；`useRpc.startSession` 内部 `setupEventListeners()` 先 `cleanup` 后注册，所以不会造成监听重复，但状态与磁盘产物仍可能不一致。 |
| 建议修法 | 加 `const opening = ref(false)`，入口处 `if (opening.value) return; opening.value = true;` + `finally` 复位，并把列表项/主按钮置为 loading。 |
| 修复风险 | 低（首页 UI，不涉及工作区几何与断言）。 |
| 判据 | 连续两次触发返回同一个 Promise 语义：断言 `startSession` 调用计数为 1、`projectStore.sessions` 只被刷新一次、`router.push("/workspace")` 只发生一次。 |

## 4. D：登记不修

### D-RP-01 markdown 图片 `alt` 双重转义

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/utils/markdown.ts:32-50`（`renderer.image` 内 `alt="${escapeHtml(text)}"`，实为 `:46,49`） |
| 证据 | 本轮 `%TEMP%` 探针（同一 renderer 逻辑）真实输出：输入 `![a & b](x.png)` ⇒ `<img src="x.png" alt="a &amp;amp; b">`（`text` 入参已被 marked 转义一次）。 |
| 为什么不修 | 影响面仅限含 `&`/`<` 的图片 alt 文案（悬停提示多一层实体），无安全影响；修正需改动 `renderer.image` 的转义契约，而 `renderer` 是 R5 起冻结的渲染面，收益与代价不匹配。 |
| 代价 | 保留一个已知文案级小瑕疵；若将来做无障碍朗读（alt→aria）需先修此点。 |

### D-RP-02 无 CSP 第二道防线

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/index.html`（无 `Content-Security-Policy` meta）、`pix/src/main/index.ts:92-94`（`contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`，未见 CSP 响应头注入） |
| 证据 | 本轮探针实测 `renderer.html` 转义（`<b>raw</b>` ⇒ `&lt;b&gt;raw&lt;/b&gt;`）、链接文本转义（`[<img src=x onerror=alert(1)>](https://a.com)` ⇒ 文本被转义）、协议过滤（`javascript:` ⇒ `data-unsafe-link`），未找到可利用路径。 |
| 为什么不修 | 本面（渲染层）不是修复位置：加 CSP 属入口/主进程面，且需与 preload 暴露面、Vuetify 内联样式（`style-src 'unsafe-inline'` 需求）一起评估；在没有可利用路径前贸然加 `script-src` 会破坏离屏与开发模式。 |
| 代价 | 缺失纵深防御：一旦将来 `renderer.*` 覆盖漏一处，`v-html`（`ChatPanel.vue:998`）即可执行内联事件处理器并触达 `window.pixApi`。建议在下一轮安全面单独立项。 |

### D-RP-03 资料库树固定展开三层 + 全树常驻

| 字段 | 内容 |
| --- | --- |
| 位置 | `LibraryPanel.vue:58-64`（`immediate: true` reload）、`:86-89`（`libraryList(rootDir, 3)` 后默认展开全部目录） |
| 证据 | `replaceExpanded(new Set(result.nodes.filter((n) => n.type === "directory").map((n) => n.path)));` —— 首屏即展开一层目录；三层深度由主进程一次返回，未做按需加载。 |
| 为什么不修 | 与 R14 冻结面相关：树行盒模型与徽标收缩权重有离屏几何断言（R14-design §1.4、`:302`），改展开策略会改变首屏行数与 `overflowFree`/`headOverflow` 读数；且资料库规模在目标场景（单文件夹论文集）通常不足以触发卡顿。 |
| 代价 | 超大资料库（数千文件）首屏会渲染较多行；仍受一次 `libraryList(..., 3)` 深度上限约束。 |

### D-RP-04 笔记折叠阈值 180 字符为启发式

| 字段 | 内容 |
| --- | --- |
| 位置 | `NotesPanel.vue:26`（`COLLAPSED_TEXT_LENGTH = 180`）、`:715-720`（按 `note.text.length` 决定是否渲染「展开全文」） |
| 证据 | 文件内注释已自认："启发式阈值，避免逐行测量 DOM 宽度"；`-webkit-line-clamp: 3`（`:1433-1438`）对中文/英文混排的实际可视行数不同，短中文字符串可能被裁切却没有展开按钮。 |
| 为什么不修 | 精确判据需要逐行测量（布局抖动）或 `scrollHeight` 读取，代价与收益不匹配；且改阈值会改变 `.note-expand` 的渲染集合，可能影响既有离屏行数/几何断言。 |
| 代价 | 少数中文长笔记被截断且看不到「展开全文」（用户仍可点行打开原文定位）。 |

## 5. 已核对但未发现问题的面（负结论，供复核者节省时间）

| 面 | 核对结论 |
| --- | --- |
| `v-html` 注入（`ChatPanel.vue:998`） | 实测 `utils/markdown.ts` 的 `renderer.html`/`link`/`image` 覆盖：裸 HTML 被转义、链接文本被转义、`javascript:`/非白名单协议降级为 `data-unsafe-link`。未发现可注入路径（CSP 缺失见 D-RP-02）。 |
| 定时器与清理 | `NotesPanel.onBeforeUnmount`（`:445-461`）清 `noticeTimer`/`undoRowTimer`/`copyTimer` + `clearDeleteConfirm`；`ChatPanel.onUnmounted`（`:824-859`）清 8 个定时器/interval 与 `answerFeedbackTimers` 全部句柄；`AppLayout` 清 `MediaQueryList` 监听；`App.vue` 清 `onWindowMaximizeChange`。漏项仅 `SettingsPage.vue:274`（已列入 S-RP-15）。 |
| `v-show` 的可访问性 | `v-show` 落地为 `display: none`，隐藏子树不进 a11y 树，也不产生重复可达控件；仅存在渲染成本（已列入 S-RP-08）。 |
| 笔记复选键盘语义 | `<input type="checkbox" @click.stop>`（`NotesPanel.vue:685-695`）：Space 触发的原生 `click` 会冒泡至包裹 `span` 的 `@click.stop`，store 与 `:checked` 同步，未发现"视觉勾选但未选中"的脱节。 |
| inbox 竞态（notes-store） | `loadNotes`/`undoDelete`/`exportCurrentDocReport` 均有 seq/scope 守卫与 try/catch（`stores/notes-store.ts:227-260,307-380`）；本轮 `smoke-notes` 51 条全绿。 |
| `send()` 状态快照 | 阅读上下文、笔记选择、附件与截图均在同步段完成快照（`ChatPanel.vue:343-373`），在途变化不回溯本次载荷；`excludedContexts` 在 `finally` 复位。 |
| 剪贴板兜底实现本身 | `copyViaExecCommand`（textarea + select + execCommand + remove）逻辑正确；问题只在"两份"与"失败反馈不一致"（S-RP-04）。 |

## 6. 本面最值得修的 3 条

| 排名 | 编号 | 一句话 | 排序理由 |
| --- | --- | --- | --- |
| 1 | S-RP-01 | 回车发送缺 IME 守卫，中文选词即误发半成品 | 唯一 P0：命中每一次中文输入；修复 1 行、零冻结面风险，且同仓已有正确写法可直接照抄 |
| 2 | S-RP-02 | 发送失败丢弃用户正文，无草稿还原/重试 | 影响最大的失败路径（不可恢复的用户输入损失）；修复局限在 `catch` 一段，且经核对不会破 `userBlocksRolledBack` 既有断言 |
| 3 | S-RP-03 | 澄清请求被替换后卡片消失、composer 被禁用 | 可把界面推进无出口状态（用户只能靠"新对话"逃出）；修复是一个 watcher，只动组件本地状态 |
