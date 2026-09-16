# R15 全量代码审计：渲染层基础（store / composable / 纯函数）

> 审计面：`pix/src/renderer/stores/*.ts`（session / project / settings / auth / reader / reader-state / notes）、`pix/src/renderer/composables/*.ts`（useRpc / useQuickAsk / useRegionCapture / useTheme）、`pix/src/renderer/utils/*.ts`（markdown / image-capture / note-capture / notes-path / notes-view / outline-notes / reading-context / session-title）、`pix/src/renderer/types/*.ts`。
> 方式：只读（未修改仓库任何文件；未执行任何 git 写命令；未运行 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未跑离屏 `ui-shot.mjs`）。全部探针脚本写在 `%TEMP%` / 仓库外目录，仓库零残留。
> 编号约定：`S-RU-NN` = 问题项，`D-RU-NN` = 登记不修项。行号来自本轮真实读取的 HEAD `e5dc001`。

## 0. 基线与复跑证据

| 命令 | 真实结果 |
| --- | --- |
| `cd pix && npm run check` | 退出码 0，无输出（`vue-tsc` + 主进程 `tsc` + preload `tsc` 全绿） |
| `node pix/scripts/smoke-view.mjs` | `通过 35 / 失败 0` |
| `node pix/scripts/smoke-notes.mjs` | `通过 51 / 失败 0` |
| 探针（`%TEMP%` 编译真实 `reader-state-store.ts` / `notes-store.ts` / `useRpc.ts`，桩 `window.pixApi`，仅 `vue`+`pinia` 来自仓库 `node_modules`） | 3 条断言失败 = 3 条 P1 复现（见 S-RU-01/02/03 证据列），失败数 3，探针目录运行后自删 |
| 探针（`buildChapterRanges` 规模压测） | 升序 500/2000 节点 1.3/1.6ms；降序最坏 500/2000/10000 节点 1.1/2.8/**83.5ms** |
| 探针（markdown 渲染器 14 例注入输入） | 原始 HTML、`javascript:`、`data:`、属性闭合、代码块、实体类输入全部被转义或走 `data-unsafe-link`/`missing-image` 分支，未发现可利用注入路径 |
| 依赖方向检查（19 个文件的全部顶层 import 逐条读取） | utils 不 import store/composable；stores 只向下依赖 store（notes-store/reader-state-store → reader-store + project-store；auth-store → useRpc）；composable 只 import 类型 ⇒ **本面无循环依赖** |

结论分布：**P0 = 0，P1 = 3，P2 = 14，D = 4**。

| 编号 | 分级 | 位置 | 一句话 |
| --- | --- | --- | --- |
| S-RU-01 | P1 | `stores/reader-state-store.ts:108-121,229-240` + `pages/WorkspacePage.vue:129,136,235,245` | `submit()` 无在途令牌：`flush()` 后立刻 `resetState()` 时，迟到的 save 响应把上一个工作区的 documents/lastDoc 回灌进已复位的 store |
| S-RU-02 | P1 | `stores/notes-store.ts:227-258` | `loadNotes` 成功分支守 `writeSeq`、`catch` 分支不守：写成功后到达的 reject 把面板推入 error 态，笔记列表/搜索/排序/导出全部消失 |
| S-RU-03 | P1 | `composables/useRpc.ts:187-206,356-368,323-326,427-451` | 同一失败信号两份实现（`sendCommand` 静默 / `sendCommandOrThrow` 抛出）：auth 与配置类命令走静默，面板 `try/catch` 永不触发（密钥保存失败零反馈） |
| S-RU-04 | P2 | `stores/session-store.ts:154-158,451-457,650-652,770-772` | `events` 数组只写不读（仅死导出 `getRawEventsJson` 读它），50k 上限内的事件载荷纯占内存；`addEvents` 死导出 |
| S-RU-05 | P2 | `stores/session-store.ts:161,465,637,760,778` | `errorMessage` 死状态：只写不读，重试失败原因只能靠 error 块 |
| S-RU-06 | P2 | `stores/reader-state-store.ts:152-175` | `loadReaderState` 忽略 `result.success`：失败时 `degraded` 被写成 false、`code`/`error` 丢弃且不落日志（与"降级要打 warn"的纪律不符） |
| S-RU-07 | P2 | `composables/useRpc.ts:24-30,233-243,298,323,340,427,441,449,521-529` | useRpc 死面：18 个零消费成员 + `initRpcEvents`/`cleanupRpcEvents`；`agentStatus`/`stderr`/`isRunning` 无任何 UI 消费（内核扩展错误与退出原因对用户不可见） |
| S-RU-08 | P2 | 见条目（多文件） | 导出卫生聚合：函数级死导出 7 个 + 仅本文件使用的类型导出 14 项 + store 定型死成员（auth 4 / settings 3 / project 3 即 S-RP-16） |
| S-RU-09 | P2 | `utils/markdown.ts:5-8,10-12,35-51,54-58` | `citationKeys`/`imageSources` 通道零调用方：`linkCitations` 恒早退、imageSources 分支不可达（含每图 O(n) 扫描） |
| S-RU-10 | P2 | `stores/notes-store.ts:382-397` vs `:182-194` | `recoverCorruptNotes` 复制 `applyNotes` 的状态更新七件套（同规则两份实现，注释已声明 applyNotes 是唯一定点） |
| S-RU-11 | P2 | `utils/notes-path.ts:19-21`、`utils/reading-context.ts:153-155`、`stores/project-store.ts:18-20`、`stores/reader-store.ts:50-52`、`utils/markdown.ts:10-12` | 路径比较键 5 份实现，其中 `project-store.normalizePath` 少"去尾斜杠"、`reader-store.samePath` 不合流为单键，注释却声称"与 project-store.normalizePath 同约定" |
| S-RU-12 | P2 | `stores/reader-state-store.ts:67-69`、`stores/notes-store.ts:145`、`pages/WorkspacePage.vue:46`、`PdfViewer.vue:658`、`ReaderPanel.vue:68,94` | "当前工作区根" 6 处各自派生 `currentProject?.path ?? ""`（无唯一定点） |
| S-RU-13 | P2 | `utils/notes-path.ts:119` vs `utils/notes-view.ts:47`；`stores/notes-store.ts:163-169` vs `utils/notes-path.ts:73-85` | 重复派生规则两份：同页排序比较器逐字重复（且分组内排序在"最新优先"下立即被丢弃）；"当前文档条数"两种算法 |
| S-RU-14 | P2 | `composables/useRpc.ts:298-301` + `pages/WorkspacePage.vue:69` | `getMessages()` 声明 `unknown[]`，唯一调用点用 `as AgentMessage[]` 断言掩盖契约（主进程返回的就是 `AgentMessage[]`） |
| S-RU-15 | P2 | `types/ipc.ts:9` | `Window.pixApi: PixApi` 声明为必需，与 9 处运行时代码"可能缺失"的防御（6 处 `if (!window.pixApi)` 围栏 + 可选链 + 三处页面判空）不一致 |
| S-RU-16 | P2 | `composables/useTheme.ts:12-31`（`initTheme` 在 `:23-26`）、`stores/settings-store.ts:54-55` | 主题来源两份且一份是死分支：`pix-theme` 从不被写入（"从已保存偏好初始化"不可达），`as Theme` 断言可把任意串写进只允许 "light" 的 ref；`settings.theme` 零消费 |
| S-RU-17 | P2 | `stores/session-store.ts:283-300,382,419,440-448,505,515` | 同文件两套块查找：已存在 O(1) `byId` 索引只服务 `readingAnchorFor`，流式与工具路径全走 `find()`/倒序扫描 |
| D-RU-01 | D | `utils/outline-notes.ts:52-79,62-69` | `buildChapterRanges` 最坏 O(n²)：实测 10000 节点降序 83.5ms，仅随书签/页数变化重算 ⇒ 登记不修 |
| D-RU-02 | D | `utils/reading-context.ts:153-170` | `preflightLibraryPath` 是字符串前缀判定（不归一 `..`），可宽松放行；权威判定在主进程 `resolve+isLibraryFilePath` ⇒ 登记不修 |
| D-RU-03 | D | `composables/useQuickAsk.ts:10-31`、`useRegionCapture.ts:10-20` | 单槽 handler 无归属令牌：旧实例卸载会清掉新实例的注册（当前不存在两消费者共存） ⇒ 登记不修 |
| D-RU-04 | D | `stores/reader-store.ts:61-77` | `openDocument` 不复位 `scale`/`captureMode`（换文档沿用上次缩放/框选态），属未规定行为，改动触及 R6/R11 现场恢复与 ui-shot 几何断言 ⇒ 登记不修 |

---

## 1. P0：无

本面**未发现 P0**。为避免"没找到"被误读成"没查"，列出本面针对 P0 三类面的实际检查与反向证据：

| P0 面 | 检查内容 | 结论 |
| --- | --- | --- |
| 注入 | `utils/markdown.ts` 的三个 renderer 覆写（html/code/link/image）+ `linkPageJumps`/`linkCitations` 锚点构造；14 例探针（原始 `<img onerror>`、`<script>`、内联 HTML、`javascript:`/`data:` 链接与图片、href/title/alt 属性闭合、代码块内 HTML、实体） | 全部转义或降级为 `data-unsafe-link`/`missing-image`；锚点目标用 `encodeURIComponent(key)` 与 `\d{1,4}` 白名单构造，注入面闭合 |
| 越界 | `utils/notes-path.ts:absoluteDocPath`（字符串拼接）、`utils/reading-context.ts:preflightLibraryPath`（渲染层预检）、写入路径归属（`notes-store` 不拼路径，全走 IPC） | 渲染层预检只可能"误放行"，权威判定在主进程 `ipc-handlers.ts:188-200`（`resolve()` + `isLibraryFilePath`，`..` 被折叠）；写盘全在主进程且原子写，渲染层无越界写面 |
| 崩溃 / 挂死 / 数据安全 | 全部 `setInterval/setTimeout`（reader-state 去抖、NotesPanel 撤销行、ChatPanel 计时器）与 watch 的清理点；`buildChapterRanges` 内层循环；`events`/`displayBlocks` 上限；`undoDelete`/`exportCurrentDocReport` 的双守卫 | 渲染层 timer 全部有 `clearTimeout` 或随组件卸载；块/事件数组有硬上限；`buildChapterRanges` 最坏情形实测有界（见 D-RU-01）；无 while(true)/无自递归 |

---

## 2. P1

### S-RU-01 迟到的 reader-state save 响应回灌已复位的 store（跨工作区残留）

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/stores/reader-state-store.ts:108-121`（`submit`）、`:125-134`（`submitIfChanged`）、`:220-227`（`flush`）、`:229-240`（`resetState`）；调用点 `pix/src/renderer/pages/WorkspacePage.vue:129→136`（`onUnmounted` 的 `flush()` 在 129、`resetState()` 在 136，同一同步块）、`:235→245`（`goHome` 的 `flush()` 在 235、`resetState()` 在 245，中间只隔一次 IPC await） |
| 证据 | ① 代码：`submit()` 成功后无条件 `applyState(result.state)`（`:116`），而 `resetState()` 只递增 `loadSeq`（`:230`）并清空 `documents`/`lastDoc`/`snapshot`/`committed`，**没有**任何令牌保护在途 save。<br>② 探针（真实源码 + 桩 IPC，`%TEMP%` 编译）实际输出：<br>`[通过] 探针1-a 前置：ready 置位 => ready=true`<br>`[通过] 探针1-b 前置：save 已发出 => calls=1`<br>`[通过] 探针1-c 前置：resetState 后为空`<br>`[失败] 探针1-d 迟到 save 响应不得回灌已复位的 store => documents={"book.pdf":{"page":5,"scale":1.5,"updatedAt":1}} lastDoc={"docPath":"book.pdf","page":5,"scale":1.5}`<br>③ 触发序列（与 `onUnmounted` 逐字一致，`:127-138`）：同一同步块内先 `readerStateStore.flush()`（内部 `void submit(next)` 发起异步 IPC）再 `readerStateStore.resetState()`；`goHome`（`:232-247`）路径同理，只是两语句间隔一次 `await rpc.stopSession()`（约一个 IPC 往返），窗口性质相同。 |
| 为什么是问题 | 文件头注释写明 `resetState()` 的契约是"清空全部内存与**在途状态**"，实现只作废了在途 load，没作废在途 save。窗口关闭/工作区卸载这一路径必然产生"保存请求已发出、复位已执行"的时序，响应一到就把旧工作区的 `documents` 映射与 `lastDoc` 写进**已经复位**的 store。后果是用户可见的：① 下一个工作区里同名相对路径文档（如两库都有 `book.pdf`）的树进度徽标会显示上一个库的页码（`progressPageFor` 直接查 `documents[key].page`，`:177-185`）；② 续读入口 `lastDoc` 指向旧库文档，`ReaderPanel` 会按它拼绝对路径并请求打开（`reader-state-store.ts:188-194` → `readerStore.requestRestore`）。当前之所以没在验收里暴露，只因新工作区进入时还会 `resetState()`+`loadReaderState()` 覆盖一次，而两者的到达顺序不受约束（save 与 load 是两条独立 IPC 通道）。 |
| 建议修法 | 引入与 `loadSeq` 同形的提交令牌（例如 `let saveEpoch = 0`）：`resetState()` 递增；`submit()` 在 `await` 之后先判 `if (epoch !== saveEpoch) return;` 再 `applyState`。若希望更彻底，`submit()` 改为只在同一工作区令牌内应用 `result.state`（把 `loadReaderState` 播种的 root 一并纳入判据）。 |
| 修复风险 | 低，且不触冻结面：改动只在 store 内部（不新增/删除导出，不改 IPC 形态，不改任何文案与几何）。`ui-shot.mjs` 的现场恢复场景（resume/徽标）走的是"同工作区内捕获→提交"，令牌不会丢弃这些响应（只有跨 reset 的响应会被丢），断言不受影响。 |
| 判据 | 探针 1-d 由"失败"转"通过"（当前实测失败）；另加反向断言：不调用 `resetState()` 时，迟到响应仍必须写回（否则修法过度丢弃）。仓库内既有可复用夹具：`smoke-notes.mjs` 的 `%TEMP%` 编译加载范式。 |

### S-RU-02 `loadNotes` 失败分支缺 `writeSeq` 守卫：写成功后到达的 reject 把面板推入 error 态

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/stores/notes-store.ts:227-258`（`loadNotes`；守卫在 `:234`，catch 在 `:252-257`）；影响面 `pix/src/renderer/components/workspace/NotesPanel.vue:622-666`（loading/error/list 三选一） |
| 证据 | ① 代码对照——成功分支：<br>`if (seq !== loadSeq \|\| startWriteSeq !== writeSeq) { ... return; }`（`:234`）<br>catch 分支：<br>`} catch (err) {`<br>`  if (seq !== loadSeq) return;`<br>`  status.value = "error";`<br>`  errorCode.value = null;`<br>`  errorDetail.value = rejectMessage(err);`（`:252-257`）<br>② 探针实际输出：<br>`[通过] 探针2-a 前置：status=loading => status=loading`<br>`[通过] 探针2-b 前置：写成功 => {"ok":true,"duplicate":false,"page":3}`<br>`[失败] 探针2-c 写成功后到达的 load reject 不得把面板推入 error 态 => status=error errorDetail="主进程调用异常：IPC channel closed"`<br>`[通过] 探针2-d 数据仍在（对照） => notes=1` |
| 为什么是问题 | ① 与同函数成功分支的守卫不对称：写成功后 `applyNotes` 刚把 `status` 推成 `ready`（`:182-194`，注释明确写着"否则后续 load 结果被丢弃后没有任何东西能把状态推出来"），随后到达的 reject 又把它打回 `error` 并把 `errorDetail` 覆盖为通用异常文案——正是注释要防的那类"面板卡在错误态"；② 用户可见：`NotesPanel` 模板是 `v-if loading / v-else-if error / v-else list`（`:622,626,666`），error 态下笔记列表、搜索、排序、章节过滤条、导出按钮全部不渲染，用户看到的是错误页而不是自己完好的笔记。③ 可达性说明（如实）：主进程 `notes-load` 目前自兜底（`src/main/notes-store.ts:180-191` 捕获读失败），故今日触发需 IPC 传输层异常（handler 抛错、通道关闭、结构化克隆失败）或未来主进程回归；但该分支一旦触发就是"数据完好却给用户看错误页"，且修法只需补一个判据。 |
| 建议修法 | catch 内与成功分支同判据：`if (seq !== loadSeq \|\| startWriteSeq !== writeSeq) return;`（或在 catch 内先判 `writeSeq`，仅当没有更新的写入落地时才落 error 态）。 |
| 修复风险 | 低：一行判据，不改导出、不改状态机语义（在途 load 仍会被更新的 load 作废）。`ui-shot.mjs` 的笔记错误态场景（B 空态、degraded）由 `result.success === false` 分支驱动，不经过 catch，断言不受影响。 |
| 判据 | 探针 2-c 由失败转通过；同时保留 2-a/2-d（loading 与数据断言）以防"用清空状态换通过"。 |

### S-RU-03 useRpc 同一失败信号两份实现：auth/配置类命令静默失败，面板 catch 永不触发

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/composables/useRpc.ts:187-206`（`sendCommand` vs `sendCommandOrThrow`）、静默组：`:356-368`（`setApiKey`/`removeAuth`）、`:323-326`（`setSessionName`）、`:340-342`（`setScopedModels`）、`:427-451`（`setSteeringMode`/`setFollowUpMode`/`reloadResources`）、`:278-280`（`abort`）；消费点 `pix/src/renderer/pages/SettingsPage.vue:82-106`、`pix/src/renderer/components/workspace/ChatPanel.vue:676` |
| 证据 | ① 代码：`sendCommand` 失败只 `lastError.value = ...` + `console.error` 并返回 `null`（`:187-195`）；`setApiKey` 用静默版：`await sendCommand({ type: "set_api_key", provider, key }); await Promise.all([refreshModels(), refreshState()]);`（`:356-360`）。② 主进程 `ipc-handlers.ts:384-394` 把一切命令异常转成 `{success:false,error}`（invoke 不 reject），因此**唯一**失败出口就是这个 `success` 字段。③ 探针实际输出：<br>`[useRpc] Command set_api_key failed: auth.json 写入失败`<br>`[失败] 探针3-a setApiKey 失败应让调用方能感知（throw 或返回错误） => threw=false lastError="auth.json 写入失败"`<br>`[useRpc] Command set_model failed: 模型不可用`<br>`[通过] 探针3-b 对照：setModel 走抛出实现，失败即抛 => threw=true`<br>④ 消费点证据：`SettingsPage.saveKey` 是 `try { await rpc.setApiKey(...); editingKeys[provider] = ""; editingProvider.value = null; await authStore.refreshStatus(); } catch (err) { authError.value = ... }`——catch 永远不可达，失败时输入框被清空、编辑行关闭、`authError` 恒为空。 |
| 为什么是问题 | 同一条"命令失败"规则在同一个文件里有两份实现，选择标准不可见：写盘类（`set_model`/`set_thinking_level`/`compact`/`prompt`/`steer`…）用抛出版，auth 与配置类用静默版。用户可见后果是"操作看似成功、实际没生效且没有任何提示"，而且失败信息被降级成一个只有 `HomePage`/`WorkspacePage` 启动路径会读的 `lastError`（其余界面无消费者）。API 密钥写入失败属于安全相关动作，静默是最差选项。 |
| 建议修法 | 变更类命令统一走 `sendCommandOrThrow`（或让 `sendCommand` 返回 `{ok,error}` 由调用点判），并在 `SettingsPage.saveKey`/`deleteKey` 已有 catch 上补充文案；`abort` 这类可能在模板里裸调用的入口（`ChatPanel.vue:1116 @click="rpc.abort()"`）改为显式 `.catch()` 或保留静默但补 toast。 |
| 修复风险 | 中低：`sendCommandOrThrow` 会把失败变成 rejection，必须逐个确认调用点有 catch（模板内 `rpc.abort()` 无 catch ⇒ 改成抛出版会新增未处理 rejection，需一并处理）。不触及 R8/R10 冻结断言（这些命令在 `ui-shot.mjs` 中由真实主进程驱动，正常路径不产生 rejection）。 |
| 判据 | 探针 3-a 由失败转通过（`setApiKey` 在 `{success:false}` 下必须让调用方感知）；并新增回归断言：正常路径 `{success:true}` 下不得抛。 |

---

## 3. P2

### S-RU-04 `session-store.events` 只写不读，配套导出全死

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/stores/session-store.ts:154-155`（上限）、`:158`（`events` ref）、`:451-457`（裁剪+push）、`:650-652`（`addEvents`）、`:770-772`（`getRawEventsJson`）、`:757`（清空） |
| 证据 | 全仓检索 `\.events`（排除本文件）零命中；`addEvents`/`getRawEventsJson` 在 `src/` + `scripts/` 零命中（脚本扫描输出：`### renderer\stores\session-store.ts exports=1 zero-consumer: (none)`——`addEvents`/`getRawEventsJson` 属 store 返回成员，见扫描 3：`session-store members=14 zero-consumer=2 → addEvents, getRawEventsJson`）。`events` 只被 `:451-457` 写入与 `:770-772` 序列化。 |
| 为什么是问题 | 一次会话最多驻留 5 万条原始事件（`AgentSessionEvent` 含工具入参/结果、`message_*` 的整段内容），而没有任何读取者，纯内存占用与无谓的响应式开销（`ref([])` 每次 push 触发依赖通知）。同时"原始事件可用于导出/诊断"的能力实际不可用（没有入口调用 `getRawEventsJson`）。 |
| 建议修法 | 二选一：① 删除 `events`/`addEvents`/`getRawEventsJson`/`MAX_EVENTS` 及相关清空逻辑（最简）；② 保留诊断能力则给 `getRawEventsJson` 一个真实入口（例如导出面板）并把 `MAX_EVENTS` 下调到与用途相称的量级。 |
| 修复风险 | 低：`displayBlocks` 是渲染唯一数据源，删 `events` 不影响任何 UI；若仓库有意保留调试导出，仅删导出会改变未来接口，需产品确认（故也可并入 D）。 |
| 判据 | 删除后 `npm run check` 仍 0；`ui-shot.mjs` 全场景（尤其流式与工具工作块）不受影响——可用 `grep -rn "getRawEventsJson\|addEvents" src scripts` 零命中作为静态判据。 |

### S-RU-05 `sessionStore.errorMessage` 死状态

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/stores/session-store.ts:161`（声明）、`:465`（agent_start 清空）、`:637`（auto_retry_end 写入）、`:760`（clearSession 清空）、返回对象 `:778` |
| 证据 | `grep -rn "sessionStore.errorMessage" src/renderer` 零命中；重试失败的可见性由 `appendError(event.finalError, "api")`（`:640`）承担，`errorMessage` 无第二个消费者。 |
| 为什么是问题 | 一个"只写不读"的公开状态会被后续改动误当作渲染契约（例如新面板读它却发现时序不确定）；且 `auto_retry_end` 的失败信息在同一事件里被写了两次（`errorMessage` + error 块），语义分叉。 |
| 建议修法 | 删除 `errorMessage` 与两处写点（失败信息已由 error 块承载），或明确把它接到 UI（如会话级错误条）。 |
| 修复风险 | 低（纯删除，无 UI 依赖）。 |
| 判据 | `grep -rn "errorMessage" src/renderer/stores/session-store.ts` 无残留；`auto_retry` 失败场景的 error 块断言仍绿。 |

### S-RU-06 `loadReaderState` 忽略 `result.success`

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/stores/reader-state-store.ts:152-175`（成功路径 `:155-162`） |
| 证据 | 契约（`src/shared/types.ts:499-507`）`ReaderStateLoadResult { success; state; filePath; degraded; reason?; code?; error? }`；主进程 `src/main/reader-state-store.ts:205-210` 在无根时返回 `{ success: false, state: emptyState(), filePath: "", degraded: false, code: "no-root", error: ... }`。渲染层直接 `ready.value = true; degraded.value = result.degraded; applyState(result.state);` 并只在 `if (degraded.value)` 时打 warn——`success`/`code`/`error` 三个字段无一被消费。 |
| 为什么是问题 | 失败被静默成"成功且未降级"：① `degraded` 语义被写反（契约里 degraded ⇔ 有降级原因）；② `code`/`error` 丢弃后连日志都没有，与文件头"唯一消费点是一行 console.warn"的纪律冲突（该纪律假定只会有 degraded 情形）；③ 排障时无法区分"空库"与"读取失败"。 |
| 建议修法 | `if (!result.success) { warn(\`load failed (${result.code ?? "unknown"}): ${result.error ?? ""}\`); }` 后再按现状继续（或把 `success:false` 也计入 degraded）。 |
| 修复风险 | 低：只加日志与判据，不改状态机（`ready` 必须置位否则"本轮永不落盘"的既有设计会被破坏）。 |
| 判据 | 桩 IPC 返回 `{success:false, code:"no-root"}` ⇒ 控制台出现 `[reader-state] load failed (no-root): …`；`ready === true` 仍成立。 |

### S-RU-07 useRpc 死面与生命周期通道零 UI 消费

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/composables/useRpc.ts`：零消费成员分布 `:233-243`（attachToRunningSession）、`:332-338`（getAvailableThinkingLevels/supportsThinking）、`:340-346`（setScopedModels/getScopedModels）、`:374-376`（setPiSetting 单数形式，复数 `setPiSettings` 在用）、`:386-410`（forkSession/cloneSession/getTree/getUserMessagesForForking/navigateTree）、`:413-421`（exportHtml/exportJsonl）、`:427-447`（setSteeringMode/setFollowUpMode）、`:449-456`（reloadResources/getResourceStatus），以及 `:521-529`（`initRpcEvents`/`cleanupRpcEvents`）；生命周期字段 `:24`（agentStatus）、`:29`（stderr）、`:30`（lastError，仅启动类路径 4 处消费） |
| 证据 | 逐成员全仓 `grep -n "\b<name>\b" src/renderer/components src/renderer/pages scripts`（排除本文件）计数：零消费者 18 个——`attachToRunningSession`、`cloneSession`、`exportHtml`、`exportJsonl`、`forkSession`、`getAvailableThinkingLevels`、`getResourceStatus`、`getScopedModels`、`getTree`、`getUserMessagesForForking`、`navigateTree`、`reloadResources`、`setFollowUpMode`、`setScopedModels`、`setSteeringMode`、`supportsThinking`、`isRunning`、`setPiSetting`；另 `initRpcEvents`/`cleanupRpcEvents` 与 `agentStatus`/`stderr` 亦为零命中（`lastError` 4 处，仅启动路径）。对应 preload 侧 `isAgentRunning`（`src/main/preload.ts`）因此成为孤儿能力（`attachToRunningSession` 是它唯一使用者）。 |
| 为什么是问题 | ① RPC 面是"渲染层 ↔ 主进程"契约的显式清单，18 个永不被执行的成员会被误读为已交付能力（fork/clone/export/tree 是典型会被验收误认为"已实现"的功能名）；② 更实际的一条：`onAgentExit`/`onAgentError` 是订阅里唯一设置 `agentStatus`/`stderr` 的地方，二者没有任何 UI 消费 ⇒ 内核扩展错误（`_emitLifecycle("error")`）与退出原因对用户完全不可见，恰恰是排障最需要的一条信息；③ ChatPanel 的"工作中"判据只看 `sessionStore.isStreaming`，异常结束时该标志无复位通道（只能靠 agent_end），异常路径下会持续停在流式态（计时器继续跑、Enter 走 steer 分支）。 |
| 建议修法 | 分两步：① 删除确无规划的死成员（session tree/fork/export/resources 五组），保留 `sendCommand`/`refresh*` 等在用项；② 给 `agentStatus === "error"` 安排一个可见出口（会话区错误条或 toast，复用 `stderr`），并在 agent-error/exit 时复位 `sessionStore.isStreaming`。若短期内不打算做 ②，至少把 `agentStatus`/`stderr` 标注为"尚未消费"避免再次误判。 |
| 修复风险 | 删除成员：低（零调用点，`npm run check` 即可证）；新增错误出口：中（触及 ChatPanel/WorkspacePage 模板，属另一分片，需与该分片协调）。 |
| 判据 | 删除后 `npm run check` 0 且 `ui-shot.mjs` 全绿；`grep -rn "rpc.agentStatus\|rpc.stderr" src/renderer` 在 ② 完成后应至少命中新出口。 |

### S-RU-08 导出卫生聚合（死函数导出 / 仅内部使用的类型导出 / store 定型死成员）

| 字段 | 内容 |
| --- | --- |
| 位置 | 函数级死导出：`utils/session-title.ts:46`（`summarizeSessionText`，仅被同文件 `:56` 调用）、`utils/markdown.ts:67`（`escapeHtml`，仅同文件使用）、`utils/notes-view.ts:37,44`（`matchesSearch`/`sortNotesForView`，仅被同文件 `applyViewToGroups` 调用）、`utils/notes-view.ts:26`（`UNDO_WINDOW_MS`，仅被同文件 `isUndoExpired` 使用）、`stores/session-store.ts:650,770`（`addEvents`/`getRawEventsJson`，见 S-RU-04）；类型导出（无外部导入者）：`stores/notes-store.ts:40-61`（`AddNoteResult`/`ExportNotesResult`/`UndoDeleteResult`/`ExportDocReportResult`/`PendingUndo`）、`utils/notes-path.ts:66-71`（`NotesBadgeCount`）、`utils/notes-view.ts:16-23`（`ListEmptyInput`）、`utils/reading-context.ts:13,29`（`ReadingSendContext`/`NotesContextSelection`）、`utils/image-capture.ts:9-12`（`PreparedImage`）、`utils/markdown.ts:5-8`（`MarkdownRenderOptions`）、`composables/useQuickAsk.ts:10,22`（`QuickAskHandler`/`NotesAskHandler`）、`composables/useRegionCapture.ts:10`（`RegionCaptureHandler`）；store 定型死成员：`stores/auth-store.ts:32,34,40,47`（`isLoaded`/`configuredProviders`/`unconfiguredProviders`/`configuredCount`，返回对象 `:78-85`）、`stores/settings-store.ts:31,51,54,55`（`isLoaded`/`theme`/`recentProjects`；`HomePage.vue:41` 用的是 `projectStore.recentProjects`） |
| 证据 | 两轮脚本扫描（排除定义文件、覆盖 `src/` 与 `scripts/`；扫描输出见下）＋逐名 grep 复核：<br>`notes-store zero-consumer: AddNoteResult, ExportNotesResult, UndoDeleteResult, ExportDocReportResult`<br>`auth-store zero-consumer: isLoaded, configuredProviders, unconfiguredProviders, configuredCount`<br>`settings-store zero-consumer: isLoaded`（`theme`/`recentProjects` 两个 computed 因解析器只取裸标识符未进列表，已单独 grep 确认零命中）<br>`useRpc zero-consumer: attachToRunningSession, forkSession, cloneSession, exportHtml, exportJsonl`（完整 18 项见 S-RU-07）<br>`session-store zero-consumer: addEvents, getRawEventsJson`<br>`notes-path zero-consumer: NotesBadgeCount`、`notes-view zero-consumer: ListEmptyInput, UNDO_WINDOW_MS, matchesSearch, sortNotesForView`、`session-title zero-consumer: summarizeSessionText`、`markdown zero-consumer: MarkdownRenderOptions, escapeHtml`、`image-capture zero-consumer: PreparedImage`、`reading-context zero-consumer: ReadingSendContext, NotesContextSelection`、`project-store zero-consumer: isLoadingSessions, setCurrentProject, addSession`（＝S-RP-16）。<br>反向核销：`reader-store` 的 `pendingRestore`（被同文件 `takeRestore`/`openDocument` 使用）与 `notes-store.currentDocNoteCount`（被 `exportCurrentDocReport` 使用）经复核**不是**死成员，故未计入。 |
| 为什么是问题 | 与仓库既有 P2 判定一致（参照 S-RP-16）：这些导出把"内部实现"伪装成公共契约，类型导出尤其容易被误当作"调用方依赖的形状"而被锁死；`auth-store` 的 4 个 computed 是同一状态（`authStatus`）的第二套派生口径，实际 UI 用 `authStatus`+`providerCount` 自取，属"同规则多份派生"的轻微形态。 |
| 建议修法 | 去掉纯内部符号的 `export`（类型与函数），删除零消费的 store 成员；保留确有烟测/外部脚本使用面的导出（如 `notes-view` 的 `buildNoteCopyFragment`、`outline-notes` 与 `notes-path`、`reading-context` 的全部导出——`smoke-view.mjs` 直接 require 这三个编译产物）。 |
| 修复风险 | 低：删 `export` 关键字或成员不会改变运行时行为；唯一需确认的是仓库外工具（`ui-shot.mjs`）是否引用——已逐名 grep，零命中。 |
| 判据 | `npm run check` 0；重跑两轮扫描脚本，`zero-consumer` 列表为空或仅剩"文件内使用"的类型。 |

### S-RU-09 markdown.ts 的两条能力通道零调用方

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/utils/markdown.ts:5-8`（`MarkdownRenderOptions`）、`:10-12`（`normalizePath`）、`:35-51`（imageSources 查找分支）、`:54-58`（`linkCitations`）；调用点 `ChatPanel.vue:737`、`ReaderPanel.vue:77` |
| 证据 | `grep -rn "renderMarkdown" src scripts` 只有两个调用点，均为 `renderMarkdown(x)`（无第二参数）⇒ `options.citationKeys`/`options.imageSources` 恒 `undefined`：`linkCitations` 在 `:55` 立即 `return text`，`:35` 的 `.find(...)` 永不执行（`source` 恒 undefined，永远走 `:44` 的普通 `<img>` 分支）。 |
| 为什么是问题 | ① 死参数 + 不可达分支会被后来者当作已交付能力（"引用跳转/内嵌图片已支持"），而 ChatPanel 的事件委托只处理 `.code-copy-btn` 与 `#pix-page-jump-`（`:641-657`），`citation-*` 锚点连点击处理器都没有；② 该分支是每张图一次 `entries()` 展开 + 线性扫，一旦有人真的接上会成为图片密集消息的 O(图片数 × 源数)。 |
| 建议修法 | 若近期不接：删 `MarkdownRenderOptions`/`linkCitations`/imageSources 分支（保留 `linkPageJumps`）；若要接：在 ChatPanel 里真正构造 `imageSources`/`citationKeys`，并补上 `#citation-` 的委托处理。 |
| 修复风险 | 删除：低（渲染结果对现有调用点逐字节不变——无 option 时分支不执行）。保留并接线：涉及 ChatPanel（另一分片）。 |
| 判据 | 删除后用 `%TEMP%` 复跑 14 例渲染探针，输出与删除前逐字节一致；`npm run check` 0。 |

### S-RU-10 `recoverCorruptNotes` 复制 `applyNotes` 的状态更新

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/stores/notes-store.ts:382-397`（`recoverCorruptNotes`）vs `:182-194`（`applyNotes`） |
| 证据 | 两段代码逐字对照：`notes.value = …; writeSeq += 1; [if status!=="ready"] status.value="ready"; errorCode=null; errorDetail=""; externalChange=false; void syncNotesFile("capture")`。差别仅：`applyNotes` 用 `if (status.value !== "ready")` 守卫（保留 errorDetail 之外的既有语义）、`recoverCorruptNotes` 无条件置 `ready`（两者对"error→ready"这一目标态结果相同）。 |
| 为什么是问题 | 文件里已有"写入成功 ⇒ 提交列表并复位错误态"的唯一定点（`applyNotes`），`recoverCorruptNotes` 却手抄了一遍七步；本次扫描能看到两条路径等价，但任何一处新增判据（例如 S-RU-02 的修复若要求同步记账、或再加 `externalChange` 语义）都会立刻分叉。 |
| 建议修法 | `recoverCorruptNotes` 改为 `applyNotes(result.notes); return { ok: true };`（保持 `if (!result.success) return …` 与 catch 不变）。 |
| 修复风险 | 极低：`applyNotes` 的条件守卫在 error 态下同样会把状态推成 ready（`status !== "ready"` 成立），逐字路径等价。 |
| 判据 | 桩 IPC 走 `notesReset` 成功：从 error 态恢复到 ready 且 `externalChange === false`（与现状逐项一致）；可加"两函数产出快照相等"的差分断言。 |

### S-RU-11 路径比较键 5 份实现（含注释与实现不符）

| 字段 | 内容 |
| --- | --- |
| 位置 | `utils/notes-path.ts:19-21`（`docPathKey`：反斜杠→斜杠 + **去尾斜杠** + 小写）、`utils/reading-context.ts:153-155`（`normalizePath`，与上者**逐字相同**）、`stores/project-store.ts:18-20`（`normalizePath`：反斜杠→斜杠 + 小写，**不去尾斜杠**）、`stores/reader-store.ts:50-52`（`samePath`：两侧各自小写+反斜杠转换，不合流为单一键）、`utils/markdown.ts:10-12`（额外去 `./` 前缀） |
| 证据 | 5 处代码如上（逐字读取）；`utils/notes-path.ts:4-5` 的注释声称"比较键 = 小写 + 正斜杠 + 去尾斜杠，与 project-store.normalizePath 同约定"，而 `project-store.normalizePath` 并不去尾斜杠 ⇒ 注释与实现不符。`reader-state-store.ts:78-82` 的 `relativeDocPath` 还内联了第 6 份（`replace(/\\/g,"/")` + 去尾斜杠）后与 `currentDocKey` 混用。 |
| 为什么是问题 | "同一规则多份派生"是本仓库明确的审计目标：只要将来任一处需要变（例如容忍 UNC 前缀、统一 `.toLowerCase()` 之外的大小写策略、处理尾斜杠），5 处必须同步，而其中 3 处没有测试面（`smoke-view.mjs` 只编译 `outline-notes`/`notes-path`/`reading-context` 三个模块——`notes-path.docPathKey` 有覆盖，`project-store`/`reader-store`/`markdown` 的副本无覆盖）。 |
| 建议修法 | 以 `notes-path.docPathKey` 为唯一定点导出，其余位置改为导入（`reader-store` 可保留 `samePath` 签名但内部改为比较两个 `docPathKey` 结果）；`project-store` 的版本建议直接替换（其唯二调用点在 `syncCurrentSession` `:112-116`，只用于比较 session 路径，去尾斜杠无副作用）。 |
| 修复风险 | 低-中：`project-store.syncCurrentSession` 的行为会因为多一次去尾斜杠而略变（更宽松），需跑 `ui-shot.mjs` 的会话切换场景确认；`markdown.normalizePath` 的 `./` 前缀语义若合并需保留（图片路径匹配依赖它）。 |
| 判据 | 合并后 `grep -rn "replace" src/renderer/utils src/renderer/stores` 人工核对：反斜杠→斜杠 的归一化只应剩 `notes-path.docPathKey` 一处（`markdown.normalizePath` 的 `./` 前缀语义若保留则为第二处）；`smoke-view.mjs` 的 `badge-counts #4 比较键归一` 保持通过并可扩充到新的单一入口。 |

### S-RU-12 "当前工作区根" 6 处各自派生

| 字段 | 内容 |
| --- | --- |
| 位置 | `stores/reader-state-store.ts:67-69`（`rootDir()`）、`stores/notes-store.ts:145`（`currentDocKey` computed 内联）、`pages/WorkspacePage.vue:46`（`rootDir` computed）、`components/workspace/PdfViewer.vue:658`、`components/workspace/ReaderPanel.vue:68,94`（后两处属面板分片，此处仅登记规则重复） |
| 证据 | 6 处均为 `projectStore.currentProject?.path ?? ""` 或等价写法（逐处读取；`grep -rn "currentProject?.path ?? \"\"" src/renderer` 全覆盖）。 |
| 为什么是问题 | 这个值同时是"资料库归属判定基准"（`currentDocKey`/`absoluteDocPath`/`preflightLibraryPath` 的入参）与"展示用根"，一旦来源变化（例如将来支持多库或把根存到 settings），6 处会不一致；其中 `PdfViewer`/`ReaderPanel` 的副本已属另一分片，属于典型"跨分片契约漂移温床"。 |
| 建议修法 | 在 `project-store` 暴露 `libraryRoot` computed（唯一派生），其余位置改读它。 |
| 修复风险 | 低（纯取值改写），但 `PdfViewer`/`ReaderPanel` 属另一分片，需与其修复批次协调（本面只登记 `reader-state-store`/`notes-store`/`WorkspacePage` 三处）。 |
| 判据 | `grep -rn "currentProject?.path ?? \"\"" src/renderer` 仅剩 `project-store` 一处。 |

### S-RU-13 重复派生规则两份（排序比较器 / 当前文档计数）

| 字段 | 内容 |
| --- | --- |
| 位置 | 排序：`utils/notes-path.ts:119`（`group.notes.sort((a,b) => a.page - b.page || a.createdAt - b.createdAt)`）与 `utils/notes-view.ts:47`（同一条比较器）；计数：`stores/notes-store.ts:163-169`（`currentDocNoteCount` = `groupNotesByDocument(notes, key, true)[0].notes.length`）与 `utils/notes-path.ts:73-84`（`countNotesByDocument` 返回 `Map<key, {total,…}>`） |
| 证据 | 比较器逐字相同（含 `||` 次序）；计数两条路径对同一 `key` 恒等（分组路径按 `docPathKey` 命中后取该组长度，Map 路径按 `docPathKey` 累加），可互相推导。附带开销：`applyViewToGroups` 在 `sortMode === "created"` 时把 `groupNotesByDocument` 刚排好的顺序整份丢弃（重复排序 + 丢弃）。 |
| 为什么是问题 | 同一规则两份实现，面板同时消费两条派生（`groups`/`visibleCount` 与 `currentDocNoteCount`）时容易出现"改一处忘一处"；且 `currentDocNoteCount` 每次 `notes` 变化都要跑一次完整分组 + 组内排序，只为取一个整数（可等价地从 `countNotesByDocument` 取，或直接一次遍历计数）。 |
| 建议修法 | ① 排序：让 `groupNotesByDocument` 只负责分组（不排序），排序统一由 `notes-view.sortNotesForView` 负责；或反之，二选一定为唯一定点并在另一处 import。② 计数：`currentDocNoteCount` 改为 `countNotesByDocument(notes.value).get(key)?.total ?? 0`（同一次遍历产出，去掉分组与排序开销）。 |
| 修复风险 | 中：排序去重会改变 `groups` 的中间形态，需确认 `NotesPanel` 在 `sortMode === "page"` 下渲染顺序不变（等价性可由"同页 page+createdAt 升序"证明，但 `sortNotesForView` 的 `created` 模式对同 `createdAt` 追加了 `id` 兜底比较，逐字输出可能与现状不同——必须用 `ui-shot.mjs` 场景 32（徽标与排序）复验）。计数改写为低风险。 |
| 判据 | 排序：同一夹具下 `groups` 的 `JSON.stringify` 与改动前逐字节一致（`sortMode` 两态各测）；计数：`currentDocNoteCount` 与 `countNotesByDocument(notes).get(key)?.total` 对 0/1/N 条夹具相等。 |

### S-RU-14 `getMessages()` 的 `unknown[]` 与调用点断言

| 字段 | 内容 |
| --- | --- |
| 位置 | `composables/useRpc.ts:298-301`；调用点 `pages/WorkspacePage.vue:69`（`sessionStore.loadMessages(messages as AgentMessage[])`） |
| 证据 | `async function getMessages(): Promise<unknown[] \| null> { return sendCommand<unknown[]>({ type: "get_messages" }); }`；主进程 `ipc-handlers.ts:792` `case "get_messages": return bridge.getMessages();`，`bridge.getMessages()` 返回会话消息数组（`session-store.ts:653` 的 `loadMessages(messages: AgentMessage[])` 即刻消费）⇒ 类型参数本可直接写 `AgentMessage[]`。 |
| 为什么是问题 | 仓库明确"禁用 any、避免断言掩盖缺陷"：这里唯一调用点必须用 `as` 才能编译，等于把"主进程返回形状"这一契约从类型系统里抹掉——将来主进程改为返回包装对象（`{messages: [...]}`）时，`as` 不会报错，只会在运行时把包装对象当消息数组逐条处理（`Array.isArray(messages)` 仍为真）而静默产出空会话。 |
| 建议修法 | `getMessages(): Promise<AgentMessage[] \| null>` 并删除调用点断言。 |
| 修复风险 | 极低（纯类型收窄；`AgentMessage` 已在 `@/types/rpc` 导出）。 |
| 判据 | 改后 `npm run check` 0 且 `WorkspacePage.vue` 不再出现 `as AgentMessage[]`；若把主进程临时改成返回包装对象，`npm run check` 应报错（证明断言不再掩盖）。 |

### S-RU-15 `Window.pixApi` 声明为必需，与运行时代码的"可能缺失"防御不一致

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/types/ipc.ts:7-11`（`interface Window { pixApi: PixApi; }`）；防御点 `stores/settings-store.ts:17-24`、`stores/project-store.ts:11-16`、`stores/notes-store.ts:80-85`、`stores/reader-state-store.ts:36-41`、`composables/useRpc.ts:17-22`、`utils/reading-context.ts:149-151`、`pages/HomePage.vue:64`、`pages/SettingsPage.vue:182`、`App.vue:59,64,69` |
| 证据 | `ipc.ts` 用非可选属性声明；`settings-store` 头注释明确"Without the bridge (plain Vite preview) reads/writes are skipped"，`hasLibraryReadApi()` 用 `window.pixApi?.libraryReadFile` 可选链（`:150`），`App.vue:15-22` 用 `api && typeof api.windowMinimize === "function"` 判真，`HomePage.vue:64`/`SettingsPage.vue:182` 各自 `if (!window.pixApi) return;`。类型系统视角下这些防御都是"不可达分支"，`tsc` 不会提示任何遗漏（例如新增代码直接 `window.pixApi.xxx()` 也不报错）。 |
| 为什么是问题 | 类型精确性缺陷：声明与运行时事实相反，使"缺 preload / 版本不匹配"这一被产品显式支持的运行形态在编译期不可表达；`smoke-view.mjs` 甚至要单独造 `window.pixApi?` 的 ambient 声明来绕开它（`scripts/smoke-view.mjs:29-38`），说明该声明已成为工具链摩擦点。 |
| 建议修法 | 改为 `pixApi?: PixApi`，让所有直接访问点显式处理缺失（现有 `if (!window.pixApi)` 分支自然变成必要分支）；`preload.ts` 侧的 `PixApi` 形状不变。 |
| 修复风险 | 中低：类型改成可选后，任何未判空的直接访问会立刻报错——这**正是收益**，但需要在同一次改动里修掉（预估点：各 store 的 `bridge()` 已判空；`ChatPanel.vue:48` 等使用 store 而非 window，不受影响；`App.vue` 已判空）。不改任何运行时行为。 |
| 判据 | `npm run check` 0（含 `ui-shot.mjs` 专用 shim 可删）；并在 Vite 预览（无 preload）下确认各 store 走"无 bridge"分支而不抛。 |

### S-RU-16 `useTheme`：主题来源两份 + 死分支 + 未校验断言

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/composables/useTheme.ts:12-31`（`initTheme` 在 `:23-26`）；对照 `stores/settings-store.ts:54`、`src/shared/types.ts:522`（`GuiSettings.theme: "light"`） |
| 证据 | ① `initTheme()`：`const saved = localStorage.getItem("pix-theme") as Theme \| null; applyTheme(saved \|\| "light");`——全仓 `grep -rn "pix-theme"` 只有这一处**读**，没有任何写入点 ⇒ "Initialize from saved preference" 分支永久不可达；② `as Theme` 断言把任意 localStorage 字符串当作 `"light"` 类型，`applyTheme` 会把它写进 `document.documentElement[data-theme]` 与 `currentTheme.value`（后者声明为 `Theme`，实际可能是 `"dark"`）；③ `settings.theme`（持久化设置）与 `settingsStore.theme` computed 都零消费 ⇒ 主题有两个所有者但都不生效，`useTheme().theme` 也无人读取（`App.vue:10` 只解构 `initTheme`）。 |
| 为什么是问题 | 类型精确性 + 死代码组合：仅支持 light 的产品里保留一条"看似支持已保存偏好"的路径，会让后续加暗色主题的人误以为持久化已就绪；`as` 断言使非法值静默进入 DOM 属性与响应式状态（`data-theme="<任意串>"`），且没有任何校验。 |
| 建议修法 | 要么删除 `initTheme` 的 localStorage 分支与 `theme` ref（只保留 `document.documentElement.setAttribute("data-theme","light")`），要么把主题真正接到 `settings.theme`（读写同一来源）并用白名单校验（`saved === "light" ? saved : "light"`）。 |
| 修复风险 | 低：两种修法都不改变当前实际渲染（`data-theme` 恒为 `"light"`）；删除导出需确认无外部引用（已确认）。 |
| 判据 | 删除后 `npm run check` 0；预置 `localStorage.setItem("pix-theme","dark")` 后启动，`document.documentElement.dataset.theme === "light"` 且不出现 `currentTheme === "dark"`（若选接线方案则断言其等于 settings 值）。 |

### S-RU-17 同文件两套块查找（O(1) 索引 vs 线性扫描）

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/stores/session-store.ts:283-300`（`blockIndexOf` + `byId` 索引）、`:382`（`closeCurrentWorkStatus` 的 `find`）、`:419`（`ensureWorkStatusBlock` 的 `find`）、`:440-448`（`findWorkStatusForTool` 倒序全扫）、`:505`/`:515`（`message_update` 每 token 一次 `find`）、`:226`（乐观消息回填的 `find`） |
| 证据 | `blockIndexOf` 的注释声明了索引失效判据（数组引用变或长度变即重建）与"必须替换数组、不得就地变更"的不变量，可见作者已把该索引当作唯一访问路径；但除 `readingAnchorFor`（`:305-316`）外全部走线性查找。`message_update` 是流式热路径：每个 token 触发一次 `displayBlocks.value.find(...)`，`MAX_DISPLAY_BLOCKS` 允许长到 20000。 |
| 为什么是问题 | 属于"同文件内两套实现 + 热路径线性扫描"的轻微性能与一致性负担：条数少时无感（数千块 × 每 token 一次比较仍是微秒级），但块数上限是 2 万，且 `findWorkStatusForTool` 倒序扫描还叠加了 `tools.some()` 的二次线性，长会话（一次会话内大量工具调用）下开销随块数无界增长到上限为止。修复代价极小（索引已存在且不变量已被注释固化）。 |
| 建议修法 | 用 `blockIndexOf(id)` 取下标后直接访问 `displayBlocks.value[index]`（替代 `:226`/`:382`/`:419`/`:505`/`:515`）；`findWorkStatusForTool` 改为按 `toolCallId → blockId` 维护一张增量映射（或至少在 work-status 块集合上倒序扫描而非整块数组）。 |
| 修复风险 | 低-中：`byId` 索引的正确性依赖"块 id 不变、只替换数组"（文件内已有不变量注释），替换后需确认裁剪路径（`:454-455` 的 `slice`）仍会因数组引用变化触发重建；`ui-shot.mjs` 的流式/工具场景可作回归面。 |
| 判据 | 替换后 `ui-shot.mjs` 流式与工具工作块场景全绿；并在探针里断言"`message_update` 序列后 `displayBlocks` 与替换前逐字节一致"（等价性），以及 2 万块下 `message_update` 单次耗时下降（可选，仅作量化）。 |

---

## 4. D：登记不修

### D-RU-01 `buildChapterRanges` 最坏 O(n²)

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/utils/outline-notes.ts:52-79`（内层 `for (let j = i + 1; ...)` 在 `:62-69`，对每个有页码节点找"第一个页码严格更大"的节点） |
| 证据 | 真实压测（`%TEMP%` 编译真实源码）：`升序 500 = 1.3ms / 升序 2000 = 1.6ms / 降序 500 = 1.1ms / 降序 2000 = 2.8ms / 降序 10000（最坏） = 83.5ms`。 |
| 理由与代价 | 触发条件是"书签页码降序且数量上万"，现实 PDF 书签通常在数十到数百条，重算只发生在 outline/pageCount 变化（不在键入或翻页路径）。现在改成 O(n) 需要引入单调栈，会改动 R12 已冻结的"预序中第一个更大页码"语义定义（含并列取首见的判据），收益与风险不成比例。代价：极端文档首次生成章节表会有 ~80ms 卡顿（一次性，无累积）。 |

### D-RU-02 `preflightLibraryPath` 的字符串前缀判定

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/utils/reading-context.ts:153-170` |
| 证据 | `normalizePath(filePath).startsWith(\`${root}/\`)`——不折叠 `..`，因此 `"root/../../x.pdf"` 会通过渲染层预检；权威判定在 `src/main/ipc-handlers.ts:188-200`（`resolve()` 后 `isLibraryFilePath`）。 |
| 理由与代价 | 该函数自述为"Renderer-side containment pre-check"，方向性上是"可能误放行、不会误拒绝"，误放行的唯一后果是多一次 IPC 往返并得到主进程的 `outside` 文案（用户可见文案仍正确）。改成 `path.resolve` 需要引入 node:path 到纯函数工具（破坏"纯函数、可被 smoke-view 直驱"的编译面设计），权衡后不修。代价：每次越界访问多一次 IPC（可忽略）。 |

### D-RU-03 单槽 handler 无归属令牌（useQuickAsk / useRegionCapture）

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/composables/useQuickAsk.ts:10-31`、`pix/src/renderer/composables/useRegionCapture.ts:10-20` |
| 证据 | `registerXxxConsumer(handler \| null)` 直接覆盖模块级单槽；`null` 即清空。若新旧实例生命周期交叠（新实例先注册、旧实例后卸载），旧实例的 `register(null)` 会清掉新注册，且无任何提示。 |
| 理由与代价 | 当前 `ChatPanel` 是唯一注册者，工作区页面卸载顺序（旧卸载→新挂载）不构成交叠，属"当前不可达的潜在设计弱点"。改成返回归属句柄（`register() → unregister`）会触及 `ChatPanel` 卸载路径与 ui-shot 的输入链路断言面，收益为 0（无可观测故障）。代价：将来若出现第二个消费者（例如笔记面板也需要 quick-ask）必须同步改造，届时是一处集中修改（两个文件）。 |

### D-RU-04 `reader-store.openDocument` 不复位 `scale` / `captureMode`

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/renderer/stores/reader-store.ts:61-77`（字段 `:32-33`） |
| 证据 | `openDocument` 复位 `page/pageCount/selectedText/outline/gotoPage` 与跳转/恢复意图，但不复位 `captureMode`（`:32`）与 `scale`（`:33`）；`goHome` 则显式调用 `setCaptureMode(false)`/`setScale(1)`（`WorkspacePage.vue:242-243`），两处口径不一致。 |
| 理由与代价 | "同工作区内换文档继承缩放"与"跨工作区强制复位"的组合看起来是有意设计（阅读现场恢复依赖 `pendingRestore` 恢复每篇文档的缩放，无记录时继承当前值是自然语义）；"框选态跨文档保留"也无用户可见危害（PdfViewer 的 Escape/点击路径会退出框选）。改动会触及 R6/R11 的现场恢复语义与 `ui-shot` 的缩放/框选几何断言。代价：无记录文档继承上一文档缩放，属轻微不一致；`captureMode` 在新文档中保持激活可能让用户误以为需要重新框选（Escape 可退出）。 |

---

## 5. 与其它分片重叠的既有条目（复核，不重复计数）

| 编号 | 位置 | 复核结论 |
| --- | --- | --- |
| S-RP-16（面板分片） | `stores/project-store.ts:27,86-88,123-133` | 本面独立复核**确认**：`isLoadingSessions`/`setCurrentProject`/`addSession` 在 `src/` 与 `scripts/` 全仓零消费（逐名 grep + 成员扫描双重确认）。为避免重复计数，此处不另编 `S-RU` 号，修复归属建议留在该分片批次。 |
| D-RP-01/02（面板分片） | `utils/markdown.ts`（alt 双转义、无 CSP） | 本面独立探针**复现**了 alt 双转义（`![a & b](x.png)` 与 `![a &amp; b](x.png)` 都输出 `alt="a &amp;amp; b"`），与 D-RP-01 同因同结论，不另编号；无 CSP 属主进程面，本面无补充。 |

---

## 6. 本面最值得修的 3 条

| 序 | 编号 | 一句话 | 排序理由 |
| --- | --- | --- | --- |
| 1 | S-RU-01 | 迟到的 reader-state save 响应会回灌已复位 store，把上一个工作区的阅读位置（含同名文档页码、续读入口）带进下一个工作区。 | 唯一一条**已用真实源码探针复现**且后果落在"数据正确性 + 跨工作区污染"的缺陷；它违反的是本文件自己写下的 `resetState()` 契约，且修复面最小（store 内加一枚令牌），不触任何冻结断言。 |
| 2 | S-RU-02 | 写成功后到达的 load reject 会把面板推入 error 态，用户笔记列表/搜索/排序/导出整块消失（数据其实完好）。 | 与第 1 条同为复现项，修法是一行判据。排在 S-RU-01 之后只因触发需 IPC 传输层异常（主进程当前自兜底），但它的用户可见面更大：整块笔记区被替换成错误页，且与 `applyNotes` 注释里作者自己声明的目标直接冲突。 |
| 3 | S-RU-03 | auth/配置类命令走静默失败通道，密钥保存失败时输入框被清空、无任何提示（面板 catch 永不触发）。 | 影响面最广的一条（8 个命令共用一个错误处理），后果是"安全相关写操作静默失败 + 用户误以为已生效"。排第 3 的原因：触发需主进程写盘失败，且修复需要逐个确认调用点（含模板内裸调用）不会变成未处理 rejection，改动面比前两条大。 |
