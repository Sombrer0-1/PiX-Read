# R15 全量代码审计 · 主进程「会话桥与 IPC 面」

> 审计对象（shard S1，主进程）：`pix/src/main/session-bridge.ts`、`ipc-handlers.ts`、`preload.ts`、`pdf-tools.ts`、`chat-files.ts`、`file-dialogs.ts`、`index.ts`、`reading-prompt.ts`（合计 3277 行，`wc -l` 实测：1444 / 896 / 196 / 237 / 237 / 23 / 232 / 12）。
> 基线：`git log --oneline -1` ⇒ `e5dc001 feat(notes): 资料库树笔记徽标、笔记文件外部改动感知与组头文档跳转（V0.5 R14）`。
> 证据口径：本轮**只读**——文件实读 + `grep -n` 精确行号 + `git status`（只读）；唯一实跑命令为 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check`（实测 `CHECK_EXIT=0`）与一条只读的 `biome check` 取证。**未改任何源码/脚本**，**未跑** `npm run build` / `npm test` / `npm run package` / `npm run dev` / 离屏 `ui-shot`。
> 引用第三方行为时一律给 `packages/**` 里的真实实现或内核自带测试，不推测行号、不编造断言名。
> 本面共 **15** 条：P0 ×1 / P1 ×7 / P2 ×5 / D ×2。文末给「本面最值得修的 3 条」。

## 0. 汇总表

| 编号 | 分级 | 一句话 | 位置（主入口行） |
| --- | --- | --- | --- |
| S1-01 | P0 | 工具白名单把 MCP 工具挡在会话之外，而 MCP 设置页仍逐条展示「N 个工具」 | `session-bridge.ts:1259-1270` / `McpSettings.vue:157-186` |
| S1-02 | P1 | `start/newSession/switchSession` 无互斥：并发调用产生孤儿会话 + 订阅/MCP adapter 泄漏 + 库根漂移 | `session-bridge.ts:202-220,279-311,1277-1283,1387` |
| S1-03 | P1 | takeHerEyes 的 4 条早退路径完全静默：用户配置了视觉辅助却得不到任何提示 | `session-bridge.ts:1011-1016,1036-1039` |
| S1-04 | P1 | pdf 工具无文件大小上限、主进程同步整读 + 双份拷贝、每次调用重读重解析 | `pdf-tools.ts:96-107` |
| S1-05 | P1 | 聊天附件（文本/图片）无大小上限，整文件进上下文 | `chat-files.ts:54,90` |
| S1-06 | P1 | `library-list` / `library-open-path` 无根校验，而 read 面有守卫（open 是执行型出口） | `ipc-handlers.ts:423-446` vs `:188-200` |
| S1-07 | P1 | `enabledModels` 匹配规则与内核 `resolveModelScope` 分叉，且 0 命中会静默放宽为「全部模型」 | `session-bridge.ts:1145-1190,152-160` |
| S1-08 | P1 | `PixApi.installUpdate(): void` 吞掉主进程的拒绝结果，会话在跑时点安装无任何界面反馈 | `preload.ts:108,193` / `ipc-handlers.ts:617-634` |
| S1-09 | P2 | `respond_user_input` 失败无出口：bridge 抛错 + 渲染层 `void` 调用 | `session-bridge.ts:862-869` / `ChatPanel.vue:699,711` |
| S1-10 | P2 | 死代码与重复实现（3 个无调用点方法、`navigateTree` 两份、未使用 import、pdf-tools 复制 library-root 规则） | 见条目 |
| S1-11 | P2 | 三处 `catch` 静默降级为空值（会话列表 / 鉴权状态 / 命令表） | `ipc-handlers.ts:400-417`、`session-bridge.ts:496-515,711-762` |
| S1-12 | P2 | `set-settings` 对未知键只告警；`setPiSettings` 非原子（前几条已落盘后抛错） | `ipc-handlers.ts:553-557` / `session-bridge.ts:550-573` |
| S1-13 | D | `switch_session` 无路径校验、`delete-session` 依赖会话目录名单射性且带 mkdir 副作用 | `ipc-handlers.ts:666-688` / `session-bridge.ts:298-311` |
| S1-14 | P2 | biome 的 `files.includes` 不覆盖 `pix/src`，主进程代码没有 lint 门禁 | `biome.json:26-31` |
| S1-15 | D | `webPreferences.sandbox: false`（当前 preload 只用 electron 原生 API，可评估收紧） | `index.ts:94` |

---

## S1-01（P0）工具白名单把 MCP 工具挡在会话之外，UI 却仍在展示工具

**位置**

| 面 | 文件:行 | 内容 |
| --- | --- | --- |
| 白名单 | `pix/src/main/session-bridge.ts:1259-1270` | `tools: ["read","ls","grep","find","pdf_read_pages","pdf_outline","request_user_input","get_goal","create_goal","update_goal"]` |
| MCP 注册 | `pix/src/main/session-bridge.ts:1241-1244` | `extensionFactories: [(pi) => { mcpAdapter.register(pi); }, createPdfToolsFactory()]` |
| 内核过滤 | `packages/coding-agent/src/core/agent-session.ts:2840-2850` | `isAllowedTool = (!allowedToolNames \|\| allowedToolNames.has(name)) && !excludedToolNames?.has(name)`，对 `registeredTools`（扩展注册的工具）与内建工具一律过滤 |
| 内核回归测试 | `packages/coding-agent/test/suite/regressions/2835-tools-allowlist-filters-extension-tools.test.ts:68-83` | `createSession(["read","dynamic_tool"])` ⇒ `getAllTools() == ["dynamic_tool","read"]`；「allowlists filter extension tools」 |
| MCP 侧注册 | `packages/mcp-adapter/src/index.ts:986` | `registerServerTools(...)` → `pi.registerTool(this.createToolDefinition(exposed))` |
| UI 展示 | `pix/src/renderer/components/settings/McpSettings.vue:157,176-186` | 展示 `{{ server.toolCount }} 个工具` 并逐条列出 `server.tools` |

**证据（真实代码）**

```ts
// pix/src/main/session-bridge.ts:1249-1272（节选）
const result = await createAgentSession({
    ...
    tools: [
        "read", "ls", "grep", "find",
        "pdf_read_pages", "pdf_outline", "request_user_input",
        "get_goal", "create_goal", "update_goal",
    ],
    excludeTools: ["bash", "edit", "write", "run_background", "read_output", "stop_process"],
});
```

```ts
// packages/coding-agent/src/core/agent-session.ts:2840-2850（节选）
const isAllowedTool = (name: string): boolean =>
    (!allowedToolNames || allowedToolNames.has(name)) && !excludedToolNames?.has(name);
...
const registeredTools = this._extensionRunner.getAllRegisteredTools();
const allCustomTools = [ ...registeredTools, ...this._customTools... ].filter((tool) => isAllowedTool(tool.definition.name));
```

**为什么是问题**
`createAgentSession` 的 `tools` 在核心里同时充当「初始激活列表」与**硬白名单**（`sdk.ts:286` `const allowedToolNames = options.tools ?? ...`）。PiX 没有把任何 `mcp__*` 名字写进去，所以 MCP adapter 注册的工具会被 `isAllowedTool` 从 `_toolDefinitions` / `_toolRegistry` / 系统提示词中整体剔除——模型**既看不到也调不到**它们。而 MCP 设置页仍按 `mcp-get-servers` 的结果逐条展示工具清单，用户配好 MCP 服务器后会看到「N 个工具」却怎么问都用不上，且没有任何一处文案或注释说明这是有意的只读边界。同理，用户放在 PiX 自有扩展目录 `pixAgentExtensionsDir`（`session-bridge.ts:1238`）里的扩展若注册工具也会被同样过滤掉。反证：PDF 工具也是扩展注册的，PiX 必须把它们显式写进 `tools` 才可用（`pdf_read_pages` / `pdf_outline` 正是列表项），可见这条白名单确实会吃掉扩展工具。

**建议修法**
二选一，并写进设计档：
1. 若产品上希望 MCP 工具可用：把 MCP 工具名并入白名单（`mcpGetServers()` 已经有工具名清单，可在 `_createSession` 前取一次；注意 MCP 工具可能带任意能力，与 PiX 现有只读姿态冲突，需负责人裁决）。
2. 若确认 MCP 只做「配置与状态展示」：在 `_createSession` 的 `tools` 处加注释说明这是只读边界，并在 MCP 设置页明写「服务器工具不会提供给模型（PiX 只开放只读工具）」，消除「展示了就等于能用」的误导。

**修复风险**
选项 1 触及冻结面（`_createSession` 的工具策略是 V0.2 以来的只读保证）且会引入非只读工具，风险高；选项 2 只改文案，但会动 `McpSettings.vue` 与离屏 stub 的 MCP 面板断言（`ui-shot.mjs` 里有 MCP 相关记录），需要同步基线。

**判据**
写一次性脚本（照抄 `2835-*.test.ts:31-64` 的骨架）：`createAgentSession({ tools: <PiX 的 10 项>, extensionFactories:[注册 mcp__demo] })` ⇒ 当前 `getAllTools().includes("mcp__demo") === false`（复现缺陷）；修好后按所选方案断言为 `true`，或断言 UI 出现「不提供给模型」文案。

---

## S1-02（P1）会话生命周期无互斥：并发 start/switch 产生孤儿会话、泄漏订阅与 MCP adapter

**位置**：`session-bridge.ts:202-220`（`start`）、`:279-296`（`newSession`）、`:298-311`（`switchSession`）、`:1277-1283`（`_activateSession`）、`:1285-1315`（`_closeCurrentSession`）、`:1387`（`_setupEventSubscription`）。

**证据（真实代码）**

```ts
// session-bridge.ts:202-219
async start(projectDir: string, guiSettings?: GuiSettings): Promise<void> {
    this._assertProjectDirectory(projectDir);
    await this._closeCurrentSession("quit");        // A 与 B 都能通过（此时 this._session 仍为 null）
    this._cwd = projectDir;
    ...
    const result = await this._createSession(...);  // 两个调用各建一个 AgentSession（含 resourceLoader.reload、MCP adapter）
    await this._activateSession(result.session);
}
```

```ts
// session-bridge.ts:1277-1283 —— 后一个激活覆盖前一个的订阅句柄，前一个句柄从此无法解绑
private async _activateSession(session: AgentSession): Promise<void> {
    this._session = session;
    this._auxiliaryUsage = createEmptyAuxiliaryUsage();
    this._setupEventSubscription(session);          // this._unsubscribe = session.subscribe(...)
    await this._bindExtensions();
    this._emitLifecycle("ready");
}
```

```ts
// session-bridge.ts:1289-1297 —— 只解绑「当前」那一个句柄
const session = this._session;
const mcpAdapter = this._mcpAdapter;
this._unsubscribe?.();
this._unsubscribe = null;
this._session = null;
this._sessionManager = null;
...
this._mcpAdapter = null;
```

触发路径（真实渲染层代码，无并发守卫）：`pix/src/renderer/pages/HomePage.vue:43-44` 的 `openWorkspace()` 由 `:120-126` 的 `v-list-item` + `@click="openRecentProject(project)"` 直接驱动，该项上没有 `loading`/`disabled`/busy 标志 ⇒ 双击「最近打开」或快速点两个项目即两次 `startSession`（`:44` 就是 `if (await rpc.startSession(dirPath))`）；`WorkspacePage.vue:80-81` 的 `if (!rpc.isConnected.value) { const started = await rpc.startSession(...) }` 同样无重入保护。`onSwitchSession`（`WorkspacePage.vue:162-168`）与 `onNewSession`（`:152-156`）之间也没有串行化。

**为什么是问题**
并发时：A、B 两次 `_createSession` 各建一个 `AgentSession`（各含自己的 MCP adapter 与扩展绑定），最终只有 B 被 `_session` 持有；A 的会话**永不 dispose**（没有第二处调用点），其 `session.subscribe` → `_emitSessionEvent` 的闭包仍在，于是 A 的会话事件会继续经 `_eventListeners` 转发到渲染层（幽灵事件流、`_updateTrackedState` 状态被两个会话互相覆盖），同时 A 的 `McpAdapter` 引用被 `_mcpAdapter` 覆盖后再也拿不到 → `dispose()` 不会被调用（stdio 子进程/连接泄漏）。此外 `libraryRoot`（`ipc-handlers.ts:359-368` 在 `start` 返回后 `setLibraryRoot(projectDir)`）与 `this._cwd` 分别由两个调用写，二者可能分属不同项目 ⇒ 资料库树显示 A 的文件、Agent 的 cwd/工具根是 B。

**建议修法**
在 `SessionBridge` 内加单一串行门：把 `start` / `newSession` / `switchSession` / `fork` / `navigateTree` 包进 `this._lifecycleChain = this._lifecycleChain.then(...)`（或 `_busy` Promise + await），并在 IPC 层对 `session-start` 做幂等返回（同一 projectDir 且已 running 时直接返回成功）。另把 `_activateSession` 改成「先 `this._unsubscribe?.()` 再订阅」，使任何历史句柄都不会泄漏。

**修复风险**
中高：触碰会话生命周期（R1–R4 以来的冻结面）与 `agent-ready` 事件次数（`index.ts:200-201` 的注册点 + `ipc-handlers.ts:851-896` 的转发 + 渲染层 `useRpc` 的 `agentStatus`）；`libraryRoot` 的写入点也要一并复核（改为在 bridge 内部同步发布，或由 IPC 层在串行门之后设置）。既有 `smoke-notes` / `ui-shot` 不覆盖并发路径，理论零红，但需实机验证双击场景。

**判据**
并发回归脚本（主进程侧，可用现有 `smoke-notes.mjs` 的编译产物加载套路）：`Promise.all([bridge.start(dirA), bridge.start(dirB)])` ⇒ 断言 `AgentSession.dispose` 只被调用 1 次（或在桥内记录会话实例数 = 1）、`ready` 事件只发 1 次、`getState().sessionFile` 与 `getLibraryRoot()` 指向同一项目。手工判据：双击「最近打开」后只出现一条 ready/一次会话重建。

---

## S1-03（P1）takeHerEyes 的失败路径静默：配置已启用但完全不生效时，用户看不到任何提示

**位置**：`session-bridge.ts:1003-1016`（早退）、`:1034-1039`（鉴权失败）、`:1020-1032`（`emitEnd` 只在 `emittedStart` 为真时才发事件）。

**证据（真实代码）**

```ts
// session-bridge.ts:1003-1016
if (images.length === 0) return null;
const session = this._getSession();
if (session.settingsManager.getBlockImages()) return null;
const mainModel = session.model;
if (!mainModel) return null;
if (mainModel.input.includes("image")) return null;
const config = this._guiSettings?.takeHerEyes;
if (!config?.enabled || !config.provider || !config.modelId) return null;      // ← 静默
const eyeModel = session.modelRegistry.find(config.provider, config.modelId);
if (!eyeModel || !eyeModel.input.includes("image")) return null;               // ← 静默
if (!session.modelRegistry.hasConfiguredAuth(eyeModel)) return null;           // ← 静默
```

```ts
// session-bridge.ts:1034-1039
const auth = await session.modelRegistry.getApiKeyAndHeaders(eyeModel);
if (!auth.ok) {
    console.warn(`[takeHerEyes] Auth unavailable for ...`);
    return null;                                                               // ← 静默
}
```

渲染层只认事件：`pix/src/renderer/stores/session-store.ts:336`（`showVisionStatus` 由 `eye_model_start` 触发）与 `:354-372`（`finishVisionStatus`）；同时主模型侧会把图片降级成占位文本（`packages/ai/src/providers/transform-messages.ts:12,36-46`：`"(image omitted: model does not support images)"`）。

**为什么是问题**
用户在设置页启用「视觉辅助」并选了视觉模型后，只要之后出现「模型不在列表里 / 该提供商密钥被移除或失效 / 选中的模型不支持图片」，桥就**既不发 `eye_model_start` 也不发 `eye_model_end`**，渲染层因此不出现任何视觉状态块（`:1037` 只有主进程 `console.warn`）。用户看到的现象是：截图被丢弃、主模型收到一句「图片已省略」的占位，而界面毫无解释——正是「失败路径静默」。注意渲染层的 `finishVisionStatus` 已有「无 start 的 end」兜底分支（`:354-372` 末尾 push 新块），所以补发 end 不需要改渲染层。

**建议修法**
把这些早退分支改成「发一条 `eye_model_end{success:false,errorMessage}` 再返回 null」（`provider`/`modelId` 取配置值，缺配置时用空串或 `"unknown"`）；`auth.ok === false` 同法。文案给渲染层做（现有 `visionStatusLabel` 会显示 error 状态）。若担心噪声，可只在 `config.enabled === true` 且主模型不支持图片时才发（即真正「用户期待生效」的场景）。

**修复风险**
低：只新增事件，不改现有成功路径；`AgentSessionEvent` 已含 `eye_model_end`（`pix/src/shared/types.ts` 的 `eye_model_end` 变体），preload 只是透传。若要在离屏取证，需给 `ui-shot.mjs` 的 stub 增加一次事件注入（否则无自动化判据）。

**判据**
主进程侧：构造 `_guiSettings.takeHerEyes = {enabled:true, provider:"x", modelId:"y"}` 且主模型无 image 输入 ⇒ 断言 `onEvent` 收到 `eye_model_end{success:false}`（当前收不到）。渲染层：聊天流出现 `vision-status` error 块。

---

## S1-04（P1）pdf 工具：无文件大小上限 + 主进程同步整读 + 双份拷贝 + 每次调用重解析

**位置**：`pdf-tools.ts:96-107`（读文件）、`:10`（`MAX_PAGES_PER_CALL = 20`）、`:46-52`（路径守卫）、`:156-166`（页数上限，**在读文件之前**，顺序正确）；对照 `ipc-handlers.ts:61` `MAX_READABLE_FILE_BYTES = 256 * 1024 * 1024`。

**证据（真实代码）**

```ts
// pix/src/main/pdf-tools.ts:96-107
async function withPdfDocument<T>(filePath: string, fn: (doc: PDFDocumentProxy) => Promise<T>): Promise<T> {
    const file = readFileSync(filePath);            // ① 同步整读，阻塞主进程事件循环
    const data = new Uint8Array(file.byteLength);   // ② 再拷一份（峰值 = 文件大小 ×2）
    data.set(file);
    const task = getDocument({ data, disableAutoFetch: true, disableStream: true, isEvalSupported: false, useSystemFonts: true, verbosity: 0 });
    const doc = await task.promise;                 // ③ 每次调用都重新解析整个 PDF（无缓存）
    try { return await fn(doc); } finally { await doc.destroy(); }
}
```

```ts
// pix/src/main/ipc-handlers.ts:61（渲染层开文档的上限，pdf 工具侧没有任何同类检查）
const MAX_READABLE_FILE_BYTES = 256 * 1024 * 1024;
```

**为什么是问题**
页数上限（20 页/次）执行得比读文件更早，因此「>20 页」的请求不会触发读盘——这一半是好的；但**文件体积完全没有上限**：工具只需 `ctx.cwd` 或资料库内的路径即可被模型指向一个 300 MB+ 的 PDF（`ls`/`find` 就在白名单里，模型能自行发现），`readFileSync` + `Uint8Array` 副本 = 峰值两份文件大小，再叠加 pdf.js 自身的解析副本；同时 `readFileSync` 是**同步**的，主进程（IPC、窗口事件、事件转发）在读取期间被整体阻塞。按提示词约定（`reading-prompt.ts`「Prefer the current page and neighbors」）模型会对同一文件重复调用，每次都要重读重解析。主进程 OOM 即整个应用崩溃（会话不可恢复）。渲染层已有 256 MB 上限与可读文案（`ipc-handlers.ts:494-500`），工具侧没有对齐。

**建议修法**
1. 在 `resolveGuardedPdfPath` 之后加体积上限（与渲染层共用同一常量/口径，超限返回可读错误，如 `PDF too large: <N> MB > 256 MB`）。
2. 改成 `readFile`（异步）或 `fs.promises.readFile`，避免同步阻塞；去掉第二份拷贝（pdf.js 可接受 `Uint8Array`，`Buffer` 本身就是 `Uint8Array`，可直接传入）。
3. 视需要加「同路径 mtime+size 命中则复用已解析文档」的小 LRU（1–2 项），避免同一文档多轮重复解析。

**修复风险**
中：改错误文案与工具行为会触及提示词/工具的冻结口径（`pdf_read_pages` 的 `details.error` 码被设计档引用过），并需同步 `ui-shot`/烟测里若有 PDF 工具断言（本轮只读未改，未逐一核对所有断言面）；缓存必须处理文件被替换的场景（mtime+size 命中才复用）。

**判据**
用 300 MB 夹具（可 `fs.utruncate` 生成稀疏文件 + 合法 PDF 头，或真实大 PDF）调用 `pdf_read_pages` ⇒ 断言返回「too large」类错误且主进程不崩；对同一 20 页请求连调两次，断言第二次不重新解析（计时或计数打点）。内存可用 `process.memoryUsage().rss` 打点对比。

---

## S1-05（P1）聊天附件无大小上限，整文件拼进上下文

**位置**：`chat-files.ts:54`（图片 `readFile(absolutePath)`）、`:90`（文本 `readFile(absolutePath, "utf-8")` 后 `text += <file ...>content</file>`，见 `:95-99`）。

**证据（真实代码）**

```ts
// pix/src/main/chat-files.ts:89-98（节选）
try {
    const content = await readFile(absolutePath, "utf-8");
    attachments.push({ path: absolutePath, name: basenameFromPath(absolutePath), kind: "text", size: fileStats.size, content });
    text += `<file name="${absolutePath}">\n${content}\n</file>\n`;
} catch (error: unknown) { ... }
```

整个文件里唯一的体积判断是 `fileStats.size === 0`（`:41-50` 的空文件分支）；`fileStats.size` 只被用来填 `size` 字段，没有任何阈值；也没有二进制嗅探（非图片的 `.zip`/`.exe` 会按 UTF-8 全量读成乱码文本进上下文）。

**为什么是问题**
附件走 `processChatFiles`（`session-bridge.ts:943-945`）→ 文本直接进入 prompt。用户误拖一个 200 MB 日志或压缩包 ⇒ 主进程 `readFile` 全量读入（UTF-8 字符串内存约为字节数的 1–2 倍）、再整体放进消息体，随后是上下文爆掉/接口报错/界面长时间无响应；图片侧同样无上限（`resizeImage` 之前就已整读）。渲染层的文件读取（`library-read-text` 2 MB、`library-read-file` 256 MB）都设了上限，附件这条链路没有对齐。

**建议修法**
在 `processChatFiles` 里加统一上限（例如文本 2 MB / 图片 20 MB，与设计档定稿一致）：超限文本截断并在注入文本里标注 `truncated`，超限图片走 `resizeImage` 失败分支的可读文案（`<file ...>[Image omitted: ...]</file>`），或直接返回「附件过大」错误让用户看到。二进制嗅探可用现成的 `detectSupportedImageMimeType` 旁加一个 NUL 字节检查。

**修复风险**
低（新增失败/截断文案）；但会改变「附件一定能注入」的既有行为，需要一次产品口径确认（截断 vs 拒绝）。

**判据**
附带一个 50 MB 文本文件 ⇒ 断言注入文本长度被截断到上限并带 `truncated` 标记，或返回可读错误；`process.memoryUsage().rss` 不出现数量级跳变。

---

## S1-06（P1）`library-list` / `library-open-path` 缺根校验，read 面却有守卫

**位置**：`ipc-handlers.ts:423-437`（list，直接 `resolve(dir)` + `readdirSync`）、`:438-446`（open，直接 `shell.openPath(resolve(targetPath))`）、`:447-450`（show）、对照 `:188-200`（`guardLibraryPath`，read-text/read-file 在用）。

**证据（真实代码）**

```ts
// ipc-handlers.ts:423-437
ipcMain.handle("library-list", async (_event, dir: string, depth?: number) => {
    const root = resolve(dir);                       // 无根校验：任意绝对路径都会被列目录
    ...
    return { success: true, nodes: listLibraryChildren(root, effectiveDepth) };
});

// ipc-handlers.ts:438-446
ipcMain.handle("library-open-path", async (_event, targetPath: string) => {
    const resolved = resolve(targetPath);            // 无根校验
    if (!existsSync(resolved)) return { success: false, error: `路径不存在：${resolved}` };
    const result = await shell.openPath(resolved);   // 执行型出口：Windows 上 .exe/.lnk 会被运行
    ...
});
```

```ts
// ipc-handlers.ts:184-200（同一文件里对 read 面的守卫与理由）
 * Every renderer file read goes through here: without the root check the text
 * preview would happily return any absolute path on disk.
```

**为什么是问题**
同一份 IPC 面里，读内容的两条通道走白名单根校验，而「列目录」「用系统程序打开」两条通道完全不校验：`library-list("C:/Users")` 可枚举任意目录（文件名 + 绝对路径回传），`library-open-path(<任意路径>)` 可让主进程用系统关联程序打开任意文件（可执行文件即被执行）。当前所有调用方都传受信路径（`PdfViewer.vue:727`、`ReaderPanel.vue:145` 的 `props.filePath` 源自树/受校验的笔记与阅读现场；`NotesPanel.vue:408` 与 `SettingsPage.vue:183` 用的是 showInFolder），所以这不是一条现成的越界利用链，而是「渲染层可信」这一前提在 IPC 面上的破口——read 面的注释本身就否证了这个前提。另：`library-show-in-folder` **必须**保留根外能力（设置页要显示 PiX 自有存储目录），因此不能简单复用 `guardLibraryPath`。

**建议修法**
- `library-list`：改用 `guardLibraryPath(dir)`，或在同一函数里做「根内 + 根外仅允许 PiX 自有存储路径（`getPixStoragePaths()`）」的双白名单。
- `library-open-path`：同上收紧；如果产品上必须支持「用系统程序打开根内任意文件」，至少限制为根内（`isLibraryFilePath`）+ 明确注释「根外路径一律拒绝」。
- `library-show-in-folder`：保持现状，但在函数上补一行注释说明为何不受 `guardLibraryPath` 约束，避免下次审计再判为漏网。
- 顺带修 `:430` 的错误文案：路径存在但不是目录时也报「目录不存在」，应区分（`not-found` vs `not-a-directory`）。

**修复风险**
中：`ui-shot.mjs` 的 stub 有 `libraryShowCalls` 一类计数口，收紧 list/open 可能影响既有离屏场景（它们走的是根内路径，理论零红）；设置页若未来需要对根外文件调 `libraryOpenPath` 会被拒（当前只用 showInFolder）。

**判据**
stub 侧直接调两个通道：`libraryList("C:/")` ⇒ `success:false, code:"no-root"|"outside"`；`libraryOpenPath("<根外可执行文件>")` ⇒ 被拒且 `shell.openPath` 未被调用；根内路径两种调用保持成功。

---

## S1-07（P1）`enabledModels` 解析与内核分叉，0 命中静默放宽为「全部模型」

**位置**：`session-bridge.ts:152-160`（`globPatternToRegExp`）、`:1145-1152`（`_applyEnabledModelScope`）、`:1154-1190`（`_resolveScopedModels`）、`:1191-1204`（`_parseScopedModelPattern`）；内核侧 `packages/coding-agent/src/core/model-resolver.ts:255-313`（`resolveModelScope`）、`:121-151`（`tryMatchModel` 部分匹配/别名）、`:189-242`（`parseModelPattern`）。

**证据（真实代码）**

```ts
// session-bridge.ts:1166-1175
const hasGlob = pattern.includes("*") || pattern.includes("?");          // 不认 [ ]；
const regex = hasGlob ? globPatternToRegExp(pattern) : undefined;        // globPatternToRegExp 把 [ ] 转义成字面量
...
: fullId.toLowerCase() === patternLower || model.id.toLowerCase() === patternLower;   // 无 glob 时只做完全相等
```

```ts
// session-bridge.ts:1145-1152
private _applyEnabledModelScope(session: AgentSession): void {
    const patterns = session.settingsManager.getEnabledModels()?.map((p) => p.trim()).filter(Boolean);
    if (!patterns || patterns.length === 0) { session.setScopedModels([]); return; }
    session.setScopedModels(this._resolveScopedModels(session, patterns));
}
```

```ts
// packages/coding-agent/src/core/model-resolver.ts:277-280（内核对同一设置的规则）
return minimatch(fullId, globPattern, { nocase: true }) || minimatch(m.id, globPattern, { nocase: true });
```

**为什么是问题**
`enabledModels`（设置页的「可用模型」输入框，`SettingsPage.vue:265` 送 `["enabledModels", optionalCommaList(...)]`）在 pi CLI 与 PiX GUI 里是**两套实现**：内核用 `minimatch` + `tryMatchModel` 的部分/别名匹配（`"sonnet"` 能解析到某家的 sonnet），PiX 只做大小写不敏感的全等匹配，且只把 `*`/`?` 当 glob（`[abc]` 被转义成字面量，永远匹配不到）。后果一：同一个设置在 CLI 生效、在 PiX 静默失效；后果二（更糟）：PiX 匹配 0 个模型时 `setScopedModels([])` ⇒ `getAvailableModels()`（`:695-704`）与内核 `cycleModel`（`agent-session.ts:2018-2034`）都按「只要有 scopedModels 才限制」的约定回退到**全部模型**，即用户写的模型白名单被静默取消，且没有任何告警。

**建议修法**
最小改动：`_resolveScopedModels` 匹配数为 0 时 `console.warn` 并在 UI 侧暴露（或保留上一次的 scope 而不是清空）。彻底修：对齐内核语义——`resolveModelScope` 目前**没有**从包入口导出（`packages/coding-agent/src/index.ts` 无该符号），所以要么向上游提一个导出，要么在 PiX 侧改用与 minimatch 等价的匹配（注意不要把未声明的 `minimatch` 当直接依赖引入）。

**修复风险**
中：改变既有 `enabledModels` 行为可能影响设置页/模型选择器的既有判据（`settings` 面在 `ui-shot` 有场景）；上游导出属于跨仓改动，需负责人决定。

**判据**
同一组 pattern 在两侧跑对比：`["*sonnet*"]`、`["sonnet"]`、`["provider/[ab]x"]` ⇒ 断言 PiX 的 `getScopedModels()` 与内核 `resolveModelScope()` 结果一致；`["no-such-model"]` ⇒ 断言有告警且模型列表**不**变成全部。

---

## S1-08（P1）`installUpdate` 契约吞掉失败：会话在跑时点「安装更新」界面无反馈

**位置**：`preload.ts:108`（声明 `installUpdate: () => void;`）、`:193`（实现 `() => ipcRenderer.invoke("install-update")`）、`ipc-handlers.ts:617-634`、调用点 `SettingsPage.vue:311`。

**证据（真实代码）**

```ts
// pix/src/main/ipc-handlers.ts:617-634（节选）
ipcMain.handle("install-update", () => {
    if (sessionBridge.isRunning()) {
        const message = "有会话正在运行，请先停止会话再安装更新。";
        ...
        if (Notification.isSupported()) new Notification({ title: "PiX-Read 更新已推迟", body: message }).show();
        return { success: false, error: message };
    }
    autoUpdater.quitAndInstall();
    return { success: true };
});
```

```ts
// pix/src/renderer/pages/SettingsPage.vue:309-313
const result = await window.pixApi.downloadUpdate();
if (result.success) {
    window.pixApi.installUpdate();     // 不 await、不看返回值
} else { ... }
```

**为什么是问题**
主进程明确设计了一条拒绝路径（有会话时不安装，避免中断中截断会话状态），但 preload 把返回类型声明成 `void`，渲染层无法读到 `{success:false,error}`，也没有 `.catch`。于是「按下安装 → 什么都没发生」成为唯一可见结果，唯一的提示是系统通知（Windows 专注助手/关闭通知时被抑制）。从 Settings 页可达且会话常在运行：从工作区进设置页只走路由（`WorkspacePage.goHome()` 之外的路径不会 `stopSession`，`WorkspacePage.vue:232-233` 只在返回首页时停会话），所以「会话在跑 + 在设置页点安装」是可复现的真实状态。

**建议修法**
把契约改成 `installUpdate: () => Promise<{ success: boolean; error?: string }>`，`SettingsPage` 里 `const r = await window.pixApi.installUpdate(); if (!r.success) updateError.value = r.error ?? "安装被推迟";`（或至少 `.catch`+提示）。同时建议顺带修 `installUpdate` 未校验 `downloaded` 状态的问题（未下载就点安装时 `quitAndInstall()` 会走 electron-updater 的 `install()` 失败分支，见 `pix/node_modules/electron-updater/out/BaseUpdater.js:13-28,55-70`）。

**修复风险**
低：一处类型 + 一处调用点；preload 方法名集合不变，`ui-shot.mjs` 的 stub 只按名清单比对（不比对签名），同步成本小。

**判据**
会话运行中在设置页点「安装更新」⇒ 页面出现「有会话正在运行…」文案且应用不退出；无会话时行为不变。

---

## S1-09（P2）`respond_user_input` 失败无出口

**位置**：`session-bridge.ts:862-869`（`respondUserInput` 对未知 id 抛错）；渲染层 `ChatPanel.vue:699-702`（提交）与 `:711-714`（取消）都用 `void window.pixApi.sendCommand(...)`；`useRpc.ts:187-195` 的 `sendCommand` 只把错误写进 `lastError`（`:191`），而 `lastError` 仅在 `HomePage.vue:48,59` 与 `WorkspacePage.vue:83,89` 的启动流程被消费。

**证据（真实代码）**

```ts
// session-bridge.ts:862-869
respondUserInput(response: RequestUserInputResponse): void {
    const pending = this._pendingUserInputRequests.get(response.id);
    if (!pending) { throw new Error(`No pending user input request: ${response.id}`); }
    this._pendingUserInputRequests.delete(response.id);
    pending.resolve(response);
}
```

**为什么是问题**
澄清请求在「新一轮 agent_start 清空弹窗 / 会话切换 `_rejectPendingUserInputRequests`（`session-bridge.ts:1298`）/ 用户点取消后又提交」这些时序里都可能已经失效。此时用户的答案被静默丢弃：弹窗关闭、`lastError` 更新但没人展示、模型永远收不到答案，用户以为答过了。

**建议修法**
任一即可：IPC 侧对未知 id 幂等返回（`{success:true, ignored:true}`）并在 UI 提示「该提问已失效」；或渲染层改用 `sendCommandOrThrow` 并把失败提示到聊天流。另建议在 `RpcCommand` 的 `respond_user_input` 分支加 `response.id`/`answers` 形状校验（`executeCommand` 目前直接把 `cmd.response` 透传）。

**修复风险**
低。

**判据**
构造「弹窗过期后再提交」：断言聊天流出现「已回答但请求已失效」类提示，或断言主进程不再抛错而返回幂等结果。

---

## S1-10（P2）死代码与重复实现

**证据（真实读数）**

| 项 | 位置 | 实读 |
| --- | --- | --- |
| `getStderr()` | `session-bridge.ts:776-778` | `grep -rn "getStderr" pix/src pix/scripts` 仅命中定义处（0 调用点），且 `RpcCommand` 无 `get_stderr` |
| `isStreaming()` | `session-bridge.ts:772-774` | 同上，0 调用点（IPC 面用 `rpc.get_state` 的 `isStreaming` 字段） |
| `setAutoCompact()` | `session-bridge.ts:792-794` | 0 调用点（设置走 `set_pi_setting("compactEnabled")`，见 `_applyPiSetting:595`） |
| `navigateTree` 两份实现 | `session-bridge.ts:381-392` 与 `:1348-1356` | 两处逐字同构的 `this._getSession().navigateTree(...)` + `{cancelled}` 包装 |
| 未使用 import | `session-bridge.ts:37-38` | `McpResourceContent` / `McpResourceInfo` 在全文件仅出现于 import 行（各 1 次） |
| 规则复制 | `pdf-tools.ts:18-40` vs `library-root.ts:33-46` | `normalizeFsPath` 逐字重写（`library-root` 已 `export`）；`isInsideRoot` 与 `isPathInsideDirectory`/`isLibraryFilePath` 是同一包含判定的第三、四份实现 |
| 双机制表达同一意图 | `session-bridge.ts:1259-1271` | `tools` 白名单已排除 `bash/edit/write/run_background/read_output/stop_process`，`excludeTools` 再列一遍（冗余；`allowedToolNames` 已经足够） |

**为什么是问题**
死代码与重复实现增加后续改动漏改面（本面最典型的是 `navigateTree` 两份：改一处不改另一处会让扩展命令与 UI 命令行为分叉；pdf 工具的路径规则与库守卫分叉后，两边的 symlink/大小写处理很容易不一致）。

**建议修法**
删掉 3 个无调用点方法；`_bindExtensions` 内的 `navigateTree` 改为调用 `this.navigateTree(...)`；删 `McpResource*` 两个 import；`pdf-tools` 改为 `import { isLibraryFilePath, normalizeFsPath } from "./library-root.js"` 并复用（`isInsideRoot(cwd)` 这条「会话目录也算合法根」的额外规则需要保留，但可抽成一个具名 helper 放在 `library-root.ts`，避免第三份正常化逻辑）；`excludeTools` 视白名单语义决定是否保留（若不保留，请在注释放一句理由）。

**修复风险**
极低（纯删除/转发）；`getStderr` 若被仓库外消费者使用需先确认（全仓 grep 0 命中，仅主进程内部 API）。

**判据**
`grep -rn "getStderr\|setAutoCompact" pix/src | wc -l` 由 **3** → 0（当前 3 行的实测：`:776`、`:792`、`:793`）；`grep -rn "isStreaming()" pix/src/main/session-bridge.ts | wc -l` 由 1 → 0；`_bindExtensions` 内联体改为调用公有方法后 `cd pix && npm run check` 仍 `CHECK_EXIT=0`。

---

## S1-11（P2）三处 `catch` 静默降级为空值

**位置与证据**

```ts
// ipc-handlers.ts:400-417（list-sessions）
} catch (err) {
    console.error("[ipc] Error listing sessions:", err);
    return [];                     // 渲染层无法区分「没有历史」与「目录不可读/损坏」
}
```

```ts
// session-bridge.ts:496-515（getAuthStatus）与 :711-762（getCommands）
} catch {
    // Return empty status map if session not ready        ← 空 map 会被 UI 当成「没有任何提供商已配置」
}
} catch (err) {
    console.error("[SessionBridge] Error getting commands:", err);
    return [];                                            ← 命令面板静默空
}
```

**为什么是问题**
三处都把异常折成「空」这一合法业务值，渲染层没有错误码可用；`SessionManager.list` 本身已按文件容错（`packages/coding-agent/src/core/session-manager.ts:1493-1502`），剩余的失败是目录级错误（权限、路径被删），此时用户看到的是「历史会话全没了」而不是错误提示。

**建议修法**
`list-sessions` 返回 `{ success, sessions, error }`（或至少把错误透传到渲染层 toast）；`getAuthStatus` / `getCommands` 加一次性 `console.warn` 并在 UI 用「读取失败」态替代空态（`getCommands` 已有 `console.error`，缺的是返回侧信号）。

**修复风险**
低，但需要渲染层配合改返回值消费（跨面）。

**判据**
把会话目录设为不可读（或临时把 `pixSessionsRootDir` 指向一个文件）⇒ 断言渲染层出现错误提示而非空历史。

---

## S1-12（P2）`set-settings` 未知键只告警；`setPiSettings` 非原子

**位置**：`ipc-handlers.ts:93-160`（`sanitizeSettings`；未知键只 `console.warn`：`:96-100`，白名单 `SETTING_KEYS` 在 `:46-53`）、`:553-557`（`set-settings` handler）；`session-bridge.ts:550-573`（`setPiSettings` 逐条 `_applyPiSetting`，`:575-...` 的 `default:` 抛 `Unknown setting key`）。

**证据（真实代码）**

```ts
// ipc-handlers.ts:96-100
for (const key of Object.keys(settings)) {
    if (!SETTING_KEYS.has(key)) {
        console.warn(`[ipc] Ignoring unknown setting key: ${key}`);   // 只告警
    }
}
```

```ts
// session-bridge.ts:556-561
for (const entry of entries) {
    const result = this._applyPiSetting(entry.key, entry.value);      // 第 N 条抛错时，前面 1..N-1 条已经落盘
    ...
}
```

**为什么是问题**
渲染层拼错一个键名（或旧版本界面残留）会静默不生效，排查成本高；多键设置（`SettingsPage.vue:260-269` 一次送 8 条）在第 N 条非法时会出现「部分生效 + 一次失败提示」的半保存状态，与设置页「保存成功」的语义冲突。另 `set-settings` 的 `settings` 若为 `null`/非对象会在 `Object.keys` 处抛 TypeError（IPC 直接 reject，渲染层无 try 兜底则变成未处理拒绝）。

**建议修法**
`sanitizeSettings` 对未知键返回 `invalid-key` 错误（或按白名单丢键时把被丢的键回传）；`setPiSettings` 先做全量键校验（`_applyPiSetting` 的 switch 改成「校验 + 应用」两段，或先跑一次 dry-run）再落盘；`set-settings` 首行加 `if (!settings || typeof settings !== "object") return { success:false, error:"设置数据不合法" }`。

**修复风险**
低（需要渲染层配合读错误）。

**判据**
送 `{foo:1}` ⇒ 返回 `success:false` 或明确回执；送 8 条且第 5 条非法 ⇒ 断言前 4 条不落盘（读回 `get-settings` / `get_pi_settings` 对比）。

---

## S1-13（D，登记不修）

| 项 | 位置 | 事实 | 为何登记不修 | 代价 |
| --- | --- | --- | --- | --- |
| `switch_session` 无路径校验 | `session-bridge.ts:298-311` | 直接 `SessionManager.open(sessionPath, undefined, this._cwd)`，随后 `this._cwd = sessionManager.getCwd()`；被打开的 jsonl 里的 `cwd` 会成为 pdf 工具允许的根（`pdf-tools.ts:42-43` 的 `isInsideRoot(candidate, ctx.cwd)`） | 唯一调用方只传 `list-sessions` 的输出（`WorkspacePage.vue:165`）；加守卫需要先定「是否允许导入/外挂会话」的产品口径 | 若将来开放「导入会话」，这条会变成「用别人的会话文件改工具根」的越界面，届时必须补 `isPathInsideDirectory` 校验 |
| `delete-session` 的目录名前提 | `ipc-handlers.ts:666-688` + `pix-paths.ts:51-58` | `allowedDirs` 含 `resolvePixSessionDir(projectDir)`；`projectDir` 由渲染层给，`encodeProjectSessionDirName` 会把 `[/\\:]` 一律换成 `-`（`C:/a/b` 与 `C:-a-b` 同名），且该函数带 `mkdirSync` 副作用 | 编码规则是从内核复制的兼容规则，收紧会破坏「已有会话目录继续可读」的承诺 | 需要更严格时，应改为「按会话文件自查 cwd 是否等于 projectDir」而不是目录名匹配；mkdir 副作用可拆成「只在 start 时创建」 |
| `export_html/export_jsonl` 的 `outputPath` 直通 | `ipc-handlers.ts:804-807` → 内核 `agent-session.ts:3564-3580` | 渲染层传什么就写到什么路径（内核内部 `mkdirSync` + `writeFileSync`） | 当前**没有任何 UI 调用**这两个命令（全仓 `pix/src/renderer` 只有 `useRpc.ts:414,419` 的包装函数），属于未接线接口 | 一旦接线，必须把路径限制在资料库/PiX 存储内，否则是任意文件写入 |

---

## S1-14（P2）biome 不覆盖 `pix/src`：主进程代码没有 lint 门禁

**位置**：`biome.json:26-31` 的 `files.includes` 只有 `packages/*/src/**/*.ts`（`:28`）、`packages/*/test/**/*.ts`（`:29`）、`packages/coding-agent/examples/**/*.ts`（`:30`，外加 node_modules 等排除）。

**证据（实跑，只读取证）**

```text
$ ./node_modules/.bin/biome check pix/src/main/pdf-tools.ts
Checked 0 files in 2ms. No fixes applied.
  × No files were processed in the specified paths.
  i These paths were provided but ignored:
  - pix/src/main/pdf-tools.ts
```

**为什么是问题**
仓库规范里「禁 any / 禁内联动态 import / 顶层 import」等硬要求在 `pix/src/main` 这批文件上没有任何自动检查（`pix/package.json` 的 `check` 只跑 tsc/vue-tsc，`pix/package.json` 无 lint script；根 `package.json` 的 `check` 是 `tsgo --noEmit`，覆盖 workspace 包而非 pix 应用）。本面里 `McpResource*` 未使用 import 这类问题本可被 lint 直接拦下。

**建议修法**
把 `pix/src/**/*.ts` 加进 `files.includes`（`.vue` 另议），或至少在 `pix` 里加一个只针对 `src/main`+`src/shared` 的 `biome check` 脚本并接进 `check`。

**修复风险**
低，但首次开启会产生一批既有告警（尤其是 `pix/src/main` 与 renderer 的格式差异），建议分批：先 main/shared 只读模式（`--diagnostic-level=error`）落地，再逐步加严。

**判据**
`./node_modules/.bin/biome check pix/src/main` 的「Checked N files」由 0 变为实际文件数，且退出码在既有告警清零后为 0。

---

## S1-15（D，登记不修）`webPreferences.sandbox: false`

**位置**：`index.ts:90-95`（`preload: join(__dirname, "preload.cjs")`、`contextIsolation: true`、`nodeIntegration: false`、`sandbox: false` 在 `:94`）。

**事实**：preload 只用了 `electron` 的 `contextBridge` / `ipcRenderer`（`preload.ts:9`）与类型导入，理论上可在沙箱化 preload 下工作（Electron 20+ 的沙箱 preload 仍可用这两个模块）。

**为何登记不修**：需要一次实机回归（打包版 + dev 两侧）才能确认沙箱模式下 preload 与 `dist/main/main/preload.cjs` 的加载路径、`assert-main-esm.mjs` 的产物约定都不受影响，本轮为只读审计无法验证；且 `contextIsolation: true` + `nodeIntegration: false` 已挡住最直接的渲染层越权。

**代价**：沙箱关闭意味着渲染层被攻破时的影响面更大（配合 IPC 面的 `library-open-path` 这类无守卫出口，见 S1-06）。建议在完成 S1-06 收紧后单独排一轮「开启 sandbox 的实机回归」。

---

## 本面最值得修的 3 条（排序理由）

| 排序 | 编号 | 一句话 | 为什么排在这里 |
| --- | --- | --- | --- |
| 1 | **S1-01** | MCP 工具被工具白名单整体过滤，配置页却仍展示「N 个工具」 | 唯一的 P0，且是「功能面 vs 运行面」的直接矛盾：用户按 UI 配置后 100% 不可用、零提示。修法二选一都只需少量改动，但必须先由负责人裁决「MCP 工具是否允许进模型」这个安全边界，所以越早暴露越好 |
| 2 | **S1-02** | 并发 start/switch 无互斥：孤儿会话、订阅与 MCP adapter 泄漏、库根漂移 | 唯一能造成「后台仍在跑、界面显示的是另一个会话、库根与工具根不一致」的竞态，触发动作（双击最近打开）是常规用户操作；修复面清晰（单一串行门 + 先解绑再订阅），但拖得越久，越多的会话/工具行为会默认依赖「同时只有一个会话」这一隐性前提 |
| 3 | **S1-03** | takeHerEyes 的早退路径完全静默（配置了但不生效 = 零提示） | 与 R5 以来「失败必须可见」的既有姿态（错误兜底、无密钥引导）直接冲突，且修复成本最低（补发已被渲染层支持的事件，不动成功路径）；排在 S1-04/S1-05 之前是因为它影响的是「用户主动开启的功能看起来坏了」，而 04/05 需要先定体积上限口径 |

> 未进前三但建议同轮评估：**S1-04 / S1-05**（体积上限口径可以合并成一次决策，一次改完两处）与 **S1-06**（IPC 越界防护的一致性，越早收紧越不容易被后续 UI 需求绑死）。

---

## 附：本面已核对、确认无问题的项（避免重复劳动）

| 项 | 结论 | 证据 |
| --- | --- | --- |
| `ipcMain.handle` 通道 ↔ preload `invoke` 通道 | **逐字相等，无孤儿通道** | 程序化比对 36 个通道名完全一致（`grep -o` + `diff` 无输出） |
| 主进程 `webContents.send` ↔ preload `ipcRenderer.on` | **6 个事件名完全一致** | 同上比对：`agent-event`/`agent-ready`/`agent-exit`/`agent-error`/`user-input-request`/`window-maximize-change` |
| `AgentSessionEvent` 联合类型覆盖内核实际事件 | **覆盖齐全，无漂移** | PiX `shared/types.ts` 的成员与 `packages/coding-agent/src/core/agent-session.ts:155-192` + `packages/agent/src/types.ts:404-419` 逐一对应（另加 PiX 自有 `eye_model_*`） |
| `PixApi` 声明 ↔ 实现 | 方法名/顺序一致（R14 基线 42 项） | 唯一签名偏差为 `installUpdate`（见 S1-08） |
| 会话事件订阅/解绑（单会话路径） | **正确**：`_closeCurrentSession` 先解绑再 dispose（`session-bridge.ts:1291-1292`），内核 `dispose` 也会清空监听表（`agent-session.ts:993` `this._eventListeners = []`） | 仅并发路径有问题（S1-02） |
| `_pendingUserInputRequests` 清理 | 会话关闭时整体 reject 并清表（`session-bridge.ts:1298` + `_rejectPendingUserInputRequests:917-923`），AbortSignal 路径有 `cleanup`（`:887-905`） | 无泄漏 |
| 窗口事件监听重挂 | `setCurrentWindow`（`ipc-handlers.ts:153-179`）在重挂前先 `detachWindowStateListeners?.()`（`:155`），`closed` 时清空引用 | 无重复监听 |
| `window.open` / 外部链接边界 | `setWindowOpenHandler` 一律 deny + 白名单协议（http/https/mailto），`will-navigate` 只放行应用自身 URL（`index.ts:24-52` 的判定函数 + `:109-118` 的两个 handler） | 未见绕过；仅 `openExternalIfSafe` 的 `void shell.openExternal` 未接 `.catch`（未单列，属可忽略的未处理拒绝） |
| 单实例锁 / 退出清理 | `requestSingleInstanceLock` + `shuttingDown` 门保证 `cleanup()` 只跑一次（`index.ts:158-232`） | 无重复 dispose |
| 导入路径 / 越界守卫（read 侧） | `guardLibraryPath` + `isLibraryFilePath`（realpath 复核）+ `MAX_READABLE_FILE_BYTES` + 只读 2 MB 上限，`openSync`/`readSync`/`closeSync` 成对且只读 cap 字节（`ipc-handlers.ts:188-200,452-479,481-513`） | 正确；缺口在 list/open（S1-06） |
| `pdf_read_pages` 的页数上限执行顺序 | 页数校验在 `withPdfDocument` **之前**（`pdf-tools.ts:149-169`），>20 页不会读盘；页码 ≥1 由 TypeBox schema 与 `normalizePageNumbers` 双重把关 | 正确；缺口在文件体积（S1-04） |
| `pdf_outline` 递归与错误面 | 递归在工具 `try` 内，异常转成可读文本 + `details.error`；`doc.destroy()` 在 `finally` | 无崩溃路径 |
| `_applyPiSetting` 的键面 | 与 `SettingsManager` 真实 setter 对得上：`sessionDir` / `compactionReserveTokens` / `compactionKeepRecentTokens` 在 `settings-manager.ts` 里**只有 getter 没有 setter**（`:596,682-686`），故显式 no-op 合理 | 无「界面能改但内核没有」的假键 |
| MCP adapter 重复 dispose | `stop()` 先 `connections.clear()` 再断开（`mcp-adapter/src/index.ts:975-979`），`session_shutdown` + `dispose()` 双调用是幂等的 | 无重复释放问题（并发路径除外，S1-02） |
| `reading-prompt.ts` | 12 行常量，与当前阅读器约定（`[[pN]]` 徽标、section 行、截图非 OCR 源）一致；仓库内无脚本断言该文本（`grep docs/pm/*.md` 只提到位置） | 无问题 |
| `file-dialogs.ts` | 23 行，仅 `showOpenDialog` 包装，取消语义与返回类型正确 | 无问题 |
