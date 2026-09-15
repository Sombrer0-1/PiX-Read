# PiX-Read R6 需求档 · 阅读现场（N26–N34）

> 上游：`docs/pm/PRD-V0.4.md` §2（R6 = 阅读现场）、§3（资产分层：`.pix-read/reader-state.json` = 易失状态，静默降级）、§4.1（不自动打开上次文档）、§5.7（新增 UI 必须有 ui-shot 场景）。
> 本轮唯一主线：每篇文档的阅读位置与缩放随工作区持久化，重开应用可续读；资料库树可见进度。
> 判定工具（本档所有验收只能由这三种证据判定）：代码审查、`cd pix && npm run check`（0 error）、离屏取证 `cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs`（退出码 0 + `MANIFEST.json` 的 `failure` 为 null + `MEASUREMENTS.json` 断言值）。
> 本档不写实现代码；契约给出建议值与理由，设计档可细化但不得违反「必须」项。

---

## 0. 两个必须直答的问题

### 0.1 状态文件损坏时用户会看到什么

**什么都不看到，且阅读不受影响。**逐项落到可见层：

| 情况 | 用户可见 | 阅读链路 |
| --- | --- | --- |
| 文件不存在 | 无变化（空态照旧、续读入口不显示、树无进度） | 打开文档、翻页、搜索、摘录全部照旧 |
| 空文件 / JSON 语法错 / 顶层非对象 / `version !== 1` | 同上 | 同上 |
| `documents` 非对象、单条目 page/scale 非法 | 同上（单条目被丢弃，其余条目仍生效） | 同上 |
| `lastDocPath` 越界（`..`/绝对路径/绝对路径指向不存在文件） | 同上（该字段按「无记录」返回） | 同上 |
| 读取抛错（EACCES/EBUSY） | 同上 | 同上 |
| 写入失败（只读目录/文件被占用） | 同上（无浮层、无禁用态） | 同上，原文件字节不被触碰 |

硬约束：本轮**不允许**出现任何状态相关的错误面板、toast、notice、chip、禁用按钮、弹窗；损坏文件不做备份、不做逃生口按钮（与 notes 相反），下一次真实变化时以合法内容整体覆盖重建。渲染层唯一的失败痕迹是一行 `console.warn("[reader-state] …")`。该「静默」是 §1 不变量 4 的**显式例外**，来源是 PRD-V0.4 §3 的分层（资产停下来问用户，状态自己重来），必须在设计档与开发档各写一次，评审时按本条判定。

### 0.2 退出前 flush 采用哪种机制

**采用「渲染层主动 flush」，不采用「主进程 `before-quit` 拉取」。**Electron 依据（判定依据是 `pix/src/main/index.ts` 现状，只读核对，本轮不改该文件）：

1. Windows 上的关窗路径是 `window.close()` → 渲染层 `pagehide`/`beforeunload` → 渲染层销毁 → `window-all-closed`（index.ts:218）→ `requestShutdown()` → `cleanup()` → `app.quit()` → `before-quit`（index.ts:226，此时 `shuttingDown` 已置位，直接 return）。也就是说主进程在 `before-quit` 阶段窗口已经没了，无法再向渲染层索要状态。
2. 若改成主进程拉取，需要 `event.preventDefault()` + 异步回环 + 处理重入，等于把「易失状态」放进退出关键路径；这既与 index.ts 既有 `preventDefault` 独占的语义叠加（退出时序更难判定），也与本轮「状态不得阻塞」的原则冲突。
3. 渲染层 `pagehide` 在 Chromium/Electron 中是窗口关闭/导航前的可靠时点，`visibilitychange → hidden` 覆盖最小化与切后台；两者组合 + 去抖空闲 + 文档切换/离开工作区两个业务安全点，把「最坏损失」压缩为一个去抖窗口（600 ms）的页码，符合「状态宁可自己重来」。
4. 关闭窗口/退出应用这条真实路径在离屏脚本里无法完整复现，因此它由**开发档的人工走查**记录（翻页后 1 秒内关窗 → 重开 → 续读为该页），离屏脚本用 `pagehide`/`visibilitychange` 事件驱动同一段 flush 代码作客观证据。

---

## 1. 本轮目标与不变量

目标：给「阅读现场」建立一条**只读即恢复、写入不阻塞、损坏即重来**的持久化通路，并把恢复出来的位置暴露到用户看得见的三个入口（空态续读、资料库树进度、缩放）。

不变量（违反任一即为回归，必须在设计档里逐条声明，开发档里逐条自评）：

1. **N20 落页语义不变**：`reader-store.requestJump/takePendingJump` 仍为消费式意图；`openDocument` 的路径不匹配清理规则不变；加载成功与加载失败两条路径都必须消费意图。DEV-R5b §4 记录的 N20 验收 1–6 继续为真。本轮只**扩展**这条通道（新增优先级更低的恢复通道），不推翻它。
2. **`.pix-read/` 的写入纪律不变**：notes 相关文件仍是「用户资产」（严格校验、损坏不覆盖、显式逃生口）；状态文件是「易失状态」（静默降级、覆盖重建）。两套策略不得互相渗透：不允许状态文件的读写复用 notes 的校验/备份路径，也不允许 notes 借状态文件的容错放宽。
3. **单写者 + 原子写不变**：`.pix-read/` 下的文件仍只由主进程写；渲染层不拼任何存储路径（一律由主进程从资料库根派生）；写入协议仍是 `mkdir → 写 .tmp → renameSync` 覆盖。
4. **阅读链路零阻塞**：任何状态读写失败（含 IPC reject）都不得阻断打开文档、翻页、Ctrl+F 搜索、知识地图、框选截图、摘录写入、笔记跳转；也不得新增可见错误态（唯一例外：§0.1 规定的一行 `console.warn`）。
5. **既有 UI 契约不变**：页码指示器文案「第 N / M 页」、缩放标签百分比、`/` 与 Ctrl+F、书签地图、框选截图、composer chips 的行为与 DOM 选择器不被本轮改动；`pix/scripts/ui-shot.mjs` 既有的 00–11 场景必须继续全部通过。零外溢：`packages/**`、`pix/package.json` 依赖、`package-lock.json`、`pix/build/**`、electron-builder 配置不改。

---

## 2. 需求明细

### 2.0 契约建议（建议值与理由，N26–N34 共用）

**状态文件**：`<工作区根>/.pix-read/reader-state.json`（路径由 PRD-V0.4 §3 冻结，与 notes.json 同目录）。

```json
{
  "version": 1,
  "lastDocPath": "sample-paper.pdf",
  "documents": {
    "sample-paper.pdf": { "page": 12, "scale": 1.1, "updatedAt": 1757900000000 }
  }
}
```

- `documents` 用「比较键 → 条目」的 Record，键 = 小写 + 正斜杠（与 `notes-store.docPathKey`、`renderer/utils/notes-path.ts` 同约定）。理由：本文件的价值是 O(1) 命中，数组要线性扫描且允许重复键；notes.json 用数组是因为条目有序、要按时间展示，两者用途不同。
- `lastDocPath` 保留**原大小写**的相对路径。理由：它是空态续读入口唯一直接展示与打开的字段（`docDisplayName` 只取文件名，但打开需要原始路径）；`documents` 的键在小写域内，不需要再存一份原文。
- `updatedAt` = 主进程本次写入时刻的 epoch 毫秒。理由：与 notes 的 `updatedAt` 同口径，便于人工核对「最近读过哪篇」。
- `version: 1`，`version !== 1` 一律按空状态处理、不做迁移（不做向后兼容层）。理由：易失状态没有迁移价值，迁移代码是纯风险面。

**共享类型**（`pix/src/shared/types.ts` 新增「Reader State Types」段）：

```ts
export interface ReaderDocState { page: number; scale: number; updatedAt: number }
export interface ReaderStateFile { version: 1; lastDocPath: string | null; documents: Record<string, ReaderDocState> }
export type ReaderStateErrorCode = "no-root" | "outside" | "invalid-input" | "read-failed" | "write-failed";
export type ReaderStateDegradeReason = "missing" | "corrupt" | "version-unsupported" | "read-failed";
export interface ReaderStateSaveDraft { docFilePath: string; page: number; scale: number }
export interface ReaderStateLoadResult {
  success: boolean;            // 仅「无工作区根」为 false
  state: ReaderStateFile;      // 降级时为空状态
  filePath: string;            // 无根时为空串
  degraded: boolean;
  reason?: ReaderStateDegradeReason;
  code?: ReaderStateErrorCode;
  error?: string;              // 中文，只进 console.warn，不进入任何 UI
}
export interface ReaderStateSaveResult { success: boolean; state: ReaderStateFile; code?: ReaderStateErrorCode; error?: string }
```

- 错误码复用 notes 的词汇表（`no-root | outside | invalid-input | read-failed | write-failed`）。理由：两套码表会分叉出两套文案与两套判定习惯；本轮这些码**只进日志与取证断言**，不进文案。
- `degraded/reason` 的消费点固定为两处：主进程一行 `console.warn`、渲染层一行 `console.warn`（外加 ui-shot 的 stub 控制口）。理由：静默降级必须可诊断，否则损坏会变成不可观测的黑盒。

**IPC 通道**（`ipc-handlers.ts` 的 notes 段之后新增 `Reader state` 段）：

- `reader-state-load` → `ReaderStateLoadResult`（无参数）。
- `reader-state-save` → 入参 `ReaderStateSaveDraft`，返回 `ReaderStateSaveResult`；`docFilePath` 必须传绝对路径（与 `notes-add` 的 `docFilePath` 同口径），相对化、越界拒绝、归一化都在主进程完成。理由：与「渲染层不拼存储路径」的既有纪律一致，单一入参口径避免两套路径语义。
- `preload.ts` 的 `PixApi` 增 `readerStateLoad: () => Promise<ReaderStateLoadResult>` 与 `readerStateSave: (draft: ReaderStateSaveDraft) => Promise<ReaderStateSaveResult>`，接口与实现同步；`ui-shot.mjs` 的 stub 同步（N34）。

**渲染层新增面**：

- 新建 `stores/reader-state-store.ts`（`defineStore("readerState", …)`）：`state`（已加载映射）、`lastDoc`（展示用：`docPath` 原文 + `page` + `scale`）、`degraded`；动作 `loadReaderState()` / `flush()` / `resetState()`；查询 `progressPageFor(absPath)`（树徽标用，复用 `currentDocKey`）。常量 `DEBOUNCE_MS = 600`。
- `stores/reader-store.ts` 新增与 `pendingJump` **同构**的恢复通道：`pendingRestore: { filePath: string; page: number; scale: number } | null` + `requestRestore(path, page, scale)` + `takeRestore(path)`；`openDocument` 对它的清理规则与 `pendingJump` 完全一致（路径不匹配或 `null` 时清除）。既有字段语义一个字都不改。
- `PdfViewer.loadPdf()` 成功路径的消费顺序：`takePendingJump(path)` 命中 → 用跳页意图（并丢弃本轮恢复意图）→ 否则 `takeRestore(path)` 命中 → 落恢复页 + 应用恢复缩放 → 都没有 → 第 1 页 + 缩放 1.0。
- `ReaderPanel` 空态新增续读入口（`emit("open-document", absPath)`），`LibraryPanel` 新增行内进度徽标（**直接读 store**，与 NotesPanel 读 notes-store 同范式，避免 WorkspacePage 传 Map props）。

**去抖与安全点常量**：`DEBOUNCE_MS = 600`。理由：≥500 满足约束；≤1000 保证「停下后 1 秒内落盘」；再大则退出前的未落盘窗口变大，再小则连续翻页仍会多次写盘。

---

### N26 工作区级阅读状态文件与主进程 reader-state-store

**一句话**：新增 `<工作区根>/.pix-read/reader-state.json`（version 1）及其唯一写者 `reader-state-store`；读写全部静默降级，绝不阻断阅读。

**用户可见行为**：无（基础设施不可见）。用户能感知的是 N29/N30/N31 三个入口。

**验收标准**

1. 【走查】路径由 `getLibraryRoot()` 派生（`join(root, ".pix-read", "reader-state.json")`）；文件不 `import electron`；无工作区根时读返回 `{ success:false, code:"no-root", filePath:"", state:空 }`、写返回 `{ success:false, code:"no-root" }`。
2. 【走查】写协议与 `notes-store.writeFileAtomic` 一致：`mkdirSync(dirname, {recursive:true})` → 写 `<file>.tmp` → `renameSync` 覆盖；任一步失败清理 tmp 且**原文件字节不变**。
3. 【走查】入参校验全部在主进程：`docFilePath` 非字符串/空 → `invalid-input`；解析后 `!isLibraryFilePath()` → `outside`；`page` 非 ≥1 整数 → `invalid-input`；`scale` 非 [0.5, 3] 内有限数 → `invalid-input`。全部拒绝，不做静默裁剪。
4. 【走查】写入内容精确：只更新目标文档条目（其他条目除 `updatedAt` 外不得被改写，判定：两次写入不同文档后 diff 剩余条目字节相同）；`documents` 键为小写+正斜杠比较键；`lastDocPath` 为原大小写相对路径；`updatedAt` 为本次写入时刻。
5. 【走查】条目级裁剪 + 文件级降级都在 store 内完成（判定表见 N33），渲染层拿到的 `state` 已合法；渲染层不得再写第二套校验。
6. 【check】`shared/types.ts`、`preload.ts`（`PixApi` + 实现）、`ipc-handlers.ts`（两条 `ipcMain.handle`）三处类型一一对应，`npm run check` 0 error。
7. 【边界】不做条目 GC、不做容量上限、不写日志文件；条目数 ≈ 用户读过的文档数，单条 < 200 字节。
8. 【边界】`pageCount` 等文档元数据**不写入**状态文件（理由见反需求 2），因此 N30 的进度只可能是「第 N 页」，不是百分比/细进度条。

**涉及文件**：`pix/src/main/reader-state-store.ts`（新建）、`pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`、`pix/src/shared/types.ts`。

**数据落盘**：`<工作区根>/.pix-read/reader-state.json`（整文件原子重写）。

---

### N27 写入节流与 flush 安全点

**一句话**：渲染层以 600 ms 去抖、仅在有效变化时写入，并在四个安全点强制 flush。

**用户可见行为**：无直接可见变化；间接效果是重开应用能续读，且高频翻页不产生可感知的卡顿与磁盘活动。

**机制（必须写进设计档，且实现要能被计数验证）**

- **有效变化定义**：写入条件 =「目标文档条目（page, scale）或 `lastDocPath` 相对**最近一次成功落盘的结果**发生变化」。停留不动、反复 flush 同一值、打开文档时 `scrollToPage` 引发的 `setPage`（值等于已恢复值）都不算变化 → 0 次 IPC、0 次写盘。
- **去抖**：`DEBOUNCE_MS = 600`（理由见 2.0）。
- **上界证明（写进设计档与开发档）**：
  - 任意 T 毫秒窗口内写入次数 ≤ `⌈T/600⌉ + 1`（去抖结算 + 安全点各一次）。
  - 「按住 PageDown 连按」或「拖滚动条扫过整篇」只写**停止后的稳定值**一次；连续翻页过程中不产生写入。
  - 落到同一值的三元组写 0 次（去重）。
  - 单次写盘 = 一个小 JSON 的整文件重写（典型 < 4 KB），主进程同步读-改-写，不解析 PDF、不排队、不写日志、不做备份；因此不存在「写放大」路径。
- **四个安全点（缺一即失败，全部必须实现）**：
  a. **文档切换**（PDF→PDF、PDF→文本预览、文档→空态）：必须用**切换前捕获的快照**（`{ docPath, page, scale }`）flush，不得在切换后读取 `readerStore.page`（此时已被 `openDocument` 复位为 1）。
  b. **离开工作区**：`WorkspacePage.goHome()`。
  c. **工作区页面卸载**：`WorkspacePage.onUnmounted()`。
  d. **窗口隐藏/关闭前**：`visibilitychange`（`document.hidden === true`）与 `pagehide`。选择理由见 §0.2。
- **失败路径**：`write-failed`/`read-failed`/IPC reject → 不回滚内存状态、不弹任何 UI，主进程与渲染层各一行 `console.warn`；下一个变化点自然重试；不做重试队列、不做离线缓冲。

**验收标准**

1. 【离屏】打开 `sample-paper.pdf` 后 2 秒内 `readerStateSaveCalls ≤ 1`（注入状态已把该文档记为 lastDocPath 且页码一致时为 0），此后每再等 1 秒仍不增长（无周期性写）。
2. 【离屏】在 2 秒内制造 30 次页码变化（真实键盘 `PageDown`/`PageUp` 事件或滚动）→ `saveCalls ≤ 5`（= ⌈2000/600⌉ + 1），最近一次 payload 的 page = 停止后的稳定页码，且阅读区无任何错误态。
3. 【离屏】打开 A 翻到第 3 页，在去抖窗口内切到 B → 最近一次 save payload 必须是「A 的相对路径 + page 3」（若实现读的是切换后的 store 值，会写成 page 1，本断言直接暴露）。
4. 【离屏】依次 dispatch `visibilitychange`（hidden 态）与 `pagehide` → save 次数 +1（不会 +2），payload 为最后快照；无变化时再 dispatch 两次，次数不再增长（去重生效）。
5. 【离屏】保存失败注入（stub `setReaderStateFailure("write-failed")`）后翻页 → 阅读区 DOM 无任何变化（无 notice/toast/错误态），下一次成功注入后继续翻页能写盘。
6. 【走查】`before-quit` 无新增代码（`grep -n "before-quit" pix/src/main/index.ts` 与改前一致）；未新增 `ipcRenderer.sendSync` 或同步通道。
7. 【边界】非 PDF 文档（`.md`/`.txt`）从打开到关闭全程 save 次数不变。
8. 【边界】工作区根为空（未选资料库）时所有 flush 走 `no-root` 失败分支且静默，不产生 IPC 抛错。

**涉及文件**：`pix/src/renderer/stores/reader-state-store.ts`（新建）、`pix/src/renderer/pages/WorkspacePage.vue`、`pix/src/renderer/components/workspace/PdfViewer.vue`。

**数据落盘**：同 N26 文件。

---

### N28 落页优先级（写死）

**一句话**：任何入口打开文档的落页顺序固定为「显式跳转意图 > 现场恢复 > 第 1 页」。

**用户可见行为**：从笔记点「跳回原文」总是落在笔记页；从资料库树/续读入口打开有记录的文档落在上次页码；无记录时与现状完全一致（第 1 页）。

**验收标准**

1. 【走查】`loadPdf` 成功路径消费顺序严格为：`takePendingJump(path)` → 命中则落该页（钳制到 `pageCount`）并**丢弃本轮恢复意图**；未命中 → `takeRestore(path)` → 命中则落恢复页（钳制到 `pageCount`）并应用恢复缩放；两者都未命中 → 第 1 页 + 缩放 1.0。代码中**不存在第二个**初始落页分支（判定：`grep -n "scrollToPage(" PdfViewer.vue` 的调用点全部在 `gotoPage`/缩放缓存重排/这一处初始落页内）。
2. 【离屏】A 有记录第 3 页 → 打开 A → 页码指示器文本「第 3 / 3 页」；切到 B（无记录）→「第 1 / 2 页」；切回 A →「第 3 / 3 页」。
3. 【离屏】A 有记录第 3 页且 A 已打开，点笔记面板中 A 第 2 页的条目 → 落「第 2 / 3 页」（显式意图覆盖恢复值）；A 有记录第 3 页时点 B 第 2 页的笔记 → 打开 B 落「第 2 / 2 页」（恢复值不污染，A 的恢复意图也不得劫持 B）。
4. 【回归】DEV-R5b §4 里的 N20 验收 1–6 全部继续为真：同文档跳转不重载、跨文档落目标页、加载中连点取最后一条、未打开文档时点条目、目标文件缺失、目标为非 PDF。
5. 【走查】`pendingRestore` 与 `pendingJump` 生命周期同构：`openDocument(null)` 或路径不匹配 → 清除；加载成功路径与**加载失败路径**都必须消费/丢弃（失败路径不丢弃会劫持后续打开）。
6. 【边界】恢复页 > 实际页数（文档被替换/缩短）→ 钳制到最后页，并在随后的去抖写入中把状态改正为该实际页码（判定：文件里 `page` = 实际页数）。
7. 【边界】恢复页 ≤ 0 或非整数、`scale` 越界 → 主进程已按 N26 验收 5 裁剪为「无记录」→ 落第 1 页 + 缩放 1.0。
8. 【边界】优先级对入口无差别：资料库树、续读入口、笔记跳转三条路径走同一套消费代码（判定：走查三处调用点只改 `selectedFilePath`/`requestJump`/`requestRestore`，不含独立的落页逻辑）。

**涉及文件**：`pix/src/renderer/stores/reader-store.ts`、`pix/src/renderer/components/workspace/PdfViewer.vue`、`pix/src/renderer/pages/WorkspacePage.vue`。

**数据落盘**：无（本项只决定内存落点，写入由 N27 负责）。

---

### N29 空态「继续阅读」入口

**一句话**：阅读区空态新增「继续阅读」入口，显示上次打开的文档名与页码，点击打开并落页；无有效记录时该入口不存在。

**用户可见行为**：重开应用进入工作区（未选文档）时，空态出现「继续阅读」按钮，含文档名与「第 12 页」；点击打开该 PDF、落该页、恢复缩放。无记录时只有既有的「选择左侧文件开始阅读」文案，没有空壳按钮。

**验收标准**

1. 【离屏】stub 注入 `lastDocPath: "sample-paper.pdf"`、`documents["sample-paper.pdf"] = { page: 3, scale: 1.1, updatedAt }` → 空态出现 `.reader-resume`，`textContent` 同时含 `sample-paper.pdf` 与「第 3 页」（截图 `20-resume-entry.png`）。
2. 【离屏】点击该入口 → 页码指示器「第 3 / 3 页」、缩放标签「110%」（截图 + `MEASUREMENTS.resume-entry` 断言）。
3. 【离屏】stub 返回空状态（`lastDocPath: null`）→ `document.querySelector(".reader-resume") === null`，且空态文案与改前一致（截图）。
4. 【走查】渲染层只消费主进程返回的 `lastDocPath`（「在资料库内 + 文件存在」的过滤已在主进程完成），不自行探测文件、不拼存储路径；绝对路径由既有 `utils/notes-path.ts` 的 `absoluteDocPath(rootDir, docPath)` 派生（与笔记跳转同口径）；文件名展示复用 `docDisplayName`。
5. 【边界】记录指向已删除文件（主进程过滤生效）→ 入口不显示；若文件在显示后被删除（竞态）→ 走既有 PdfViewer 失败态（重试/用系统应用打开），不新增静默失败。
6. 【边界】状态加载未完成时（stub `setReaderStateDelay`）→ 入口不显示，不存在「先出现无页码的半截入口」；加载完成后出现（延迟中/加载后两张截图）。
7. 【边界】离开再进入同一工作区 → 入口恢复；进入另一个工作区 → 按该工作区状态显示（N32）。
8. 【边界】人工构造 `lastDocPath` 指向非 `.pdf` 文件 → 点击后走既有「该格式暂不支持内嵌预览」路径，不报错、不新增分支。

**涉及文件**：`pix/src/renderer/components/workspace/ReaderPanel.vue`、`pix/src/renderer/pages/WorkspacePage.vue`、`pix/src/renderer/stores/reader-state-store.ts`。

**数据落盘**：只读。

---

### N30 资料库树 PDF 行阅读进度

**一句话**：资料库树为「已读过」的 PDF 行显示「第 N 页」徽标，数据来自渲染层已加载的状态映射。

**用户可见行为**：左栏树中 `sample-paper.pdf` 行右侧出现小号徽标「第 12 页」；未读过的 PDF、非 PDF 文件、目录行都不显示。

**验收标准**

1. 【离屏】注入状态后 `sample-paper.pdf` 行的 `.row-progress` 文本为「第 3 页」；`reading-notes.md` 行与 directory 行的 `.row-progress` 数量为 0（DOM 计数 + 裁剪截图 `21-tree-progress.png`）。
2. 【离屏】当前文档打开并翻到第 2 页后（**不等待去抖窗口**），该行徽标立即变为「第 2 页」（当前文档取实时页码，其他文档取已加载映射）。
3. 【走查】徽标键复用 `utils/notes-path.ts` 的 `docPathKey`/`currentDocKey`，不新增第二套路径比较实现；键来源仍是行的 `title` 绝对路径。
4. 【走查】进度**不来自主进程文件树**：`library-list` handler、`listLibraryChildren`、`LibraryNode` 类型零改动（`git diff --stat` 不含这些符号）。
5. 【边界】不做百分比与细进度条：状态文件不存 `pageCount`（N26 验收 8），因此不出现「12/48」。若未来要百分比，必须同时把 pageCount 纳入状态文件（本轮明确不做）。
6. 【边界】长页码（注入 `page: 1024`）不导致行溢出、不挤压文件名：截图 + `MEASUREMENTS.tree-progress` 断言 `.row-label` 的 `scrollWidth <= clientWidth`。
7. 【回归】树的懒加载与展开态逻辑不变：`flattenVisible` 与 `expanded` 行为不改，既有树场景截图继续通过。

**涉及文件**：`pix/src/renderer/components/workspace/LibraryPanel.vue`、`pix/src/renderer/stores/reader-state-store.ts`。

**数据落盘**：只读。

---

### N31 缩放恢复

**一句话**：打开文档时恢复该文档上次缩放（无记录用 1.0），且恢复值在首次渲染前生效。

**用户可见行为**：打开上次以 110% 阅读的文档，缩放标签直接是 110%，页面按 110% 呈现，没有「先 100% 再跳变」的过程。

**验收标准**

1. 【离屏】`documents["sample-paper.pdf"].scale = 1.1` → 打开后 `.zoom-label` 文本为「110%」，`.pdf-page[data-page="1"]` 的 `getBoundingClientRect().width` == `Math.round(595 * 1.1) = 655`（±1px；fixture 页 MediaBox 宽 595pt，页面宽度按 `Math.round(base * scale)` 计算），见 `MEASUREMENTS.scale-restored` 与截图 `22-scale-restored.png`。
2. 【离屏】无记录文档 → 缩放标签「100%」、首页宽度 595±1px。
3. 【走查】恢复缩放的写入位置早于首次渲染（在 `pageSizes` 生成/首页 canvas 尺寸计算之前，且早于 `observePages()` 的首轮渲染），恢复路径上不触发 `scale` watcher 的全量重排分支。
4. 【走查】缩放边界仍只有一套来源：主进程按 [0.5, 3] 裁剪 + `reader-store.setScale` 钳制与两位小数取整；若新增常量，必须与 `reader-store.ts` 的 `MIN_SCALE/MAX_SCALE` 同源，不允许复制粘贴第二份。
5. 【边界】切换文档时缩放跟随目标文档的恢复值，不沿用上一个文档的缩放。
6. 【回归】在 110% 缩放下既有能力不变：翻页、Ctrl+F 搜索、知识地图、框选截图、摘录在 1.1 缩放下重跑既有场景不失败。

**涉及文件**：`pix/src/renderer/components/workspace/PdfViewer.vue`、`pix/src/renderer/stores/reader-store.ts`。

**数据落盘**：与 page 同条（`scale` 字段）。

---

### N32 跨工作区残留防护与生命周期

**一句话**：阅读状态与 notes 同等待遇，在进入工作区、卸载页面、回首页三处复位，避免 A 工作区的现场泄漏到 B。

**验收标准**

1. 【走查】`readerStateStore.resetState()` 在 `WorkspacePage` 的 `onMounted`（加载前）、`onUnmounted`、`goHome` 三处调用，与既有 `notesStore.resetNotes()` 一一对应（`grep -c "resetState()" WorkspacePage.vue` ≥ 3）。
2. 【离屏】A 工作区读过的文档与页码，切到 B（stub 换 rootDir 与状态）后：树中不出现 A 的进度徽标，空态入口指向 B 的记录（B 无记录则不显示）。
3. 【走查】复位必须作废在途 load（与 notes-store 的 `loadSeq` 同范式）：A 的迟到响应不得写入 B 的映射；`resetState()` 还须清空去抖定时器与快照，避免卸载后仍发起写入。
4. 【离屏+人工】在 A 中打开文档并翻页后直接 `goHome`（未过去抖）→ A 的 `reader-state.json` 已含该页（离屏 stub 断言）；真实窗口关闭路径（翻页后 1 秒内关窗 → 重开 → 续读该页）由开发档人工走查记录。

**涉及文件**：`pix/src/renderer/pages/WorkspacePage.vue`、`pix/src/renderer/stores/reader-state-store.ts`。

**数据落盘**：A、B 各自工作区目录下的 `reader-state.json`。

---

### N33 损坏 / 缺失 / 版本不符 / 无权限的降级与重建语义

**一句话**：读取一律降级为空状态且**读不改写**，写入时整体覆盖重建，全程无 UI（判定表见 §0.1）。

**验收标准**

1. 【走查】读取是纯函数：任何降级路径都不写盘（判定：损坏文件场景下读取后比对文件字节与 mtime 不变）。
2. 【走查】条目级裁剪规则精确：`page` 非 ≥1 整数 → 丢该条；`scale` 非 [0.5, 3] 内有限数 → 丢该条；键非字符串/含 `\`/绝对路径/含 `..` 段 → 丢该条；其余条目保留。
3. 【离屏】fixture 写入损坏内容（`{ "version": 1, "documents":` 截断）→ 启动工作区 → 断言：无 `.reader-empty` 错误态、无 notice/toast、续读入口不显示、树无徽标；随后打开 PDF 并翻页 → 文件被合法内容覆盖（脚本读文件断言 `version === 1`、条目 `page` 为翻到的页码）。
4. 【离屏】`version: 2` → 同上（空状态、不迁移、不报错），首次真实变化时按 version 1 重建。
5. 【走查/离屏】`lastDocPath` 为 `"../escape.pdf"` 或绝对路径 → 按「无记录」返回，其余 `documents` 条目仍生效；入口 selector 为 null。
6. 【走查】损坏文件**不产生备份文件**（不出现 `reader-state.json.corrupt-*`），不提供任何重建按钮。
7. 【回归】§0.1「阅读不受影响」的可判定形式：在损坏状态文件下把既有 00–11 场景跑完，`ui-shot` 退出码 0。
8. 【走查】渲染层唯一的失败消费点是一行 `console.warn("[reader-state] …")`（`grep -n "reader-state" pix/src/renderer` 的命中只出现在 store 内），无任何模板绑定、无 v-if 错误分支。

**涉及文件**：`pix/src/main/reader-state-store.ts`（新建）、`pix/src/renderer/stores/reader-state-store.ts`（新建）。

**数据落盘**：读不写；写入时整体覆盖（无备份）。

---

### N34 离屏取证面（stub + 场景 + 断言）

**一句话**：把本轮行为做成 ui-shot 可判定的取证面，作为「可见行为正确」的唯一客观证据。

**验收标准**

1. 【走查】`pix/scripts/ui-shot.mjs` 的 stub `api` 增 `readerStateLoad` / `readerStateSave`（与 `preload.ts` 的 API 面一致）；`__pixStub` 暴露控制口：`setReaderState(state)`、`setReaderStateDelay(ms)`、`setReaderStateFailure(code)`、`readerStateSaveCalls()`（返回次数与最近 payload 列表）；stub 的 save 写入 fixture 真实文件 `<library>/.pix-read/reader-state.json`，脚本可直接读文件断言 `version/lastDocPath/documents`。
2. 【离屏】新增截图（统一 `20-*` 段，避免与既有 00–11 冲突）：`20-resume-entry`（有记录）、`20b-resume-empty`（无记录，无空壳按钮）、`21-tree-progress`（含 page=1024 边界）、`22-scale-restored`、`23-corrupt-state-reading`（损坏状态下正常阅读）、`24-workspace-switch`（切换工作区无残留）。
3. 【离屏】`MEASUREMENTS.json` 至少新增四组断言：`resume-entry`（可见性 + textContent）、`scale-restored`（zoom 文本 + 首页宽度 + 期望值）、`tree-progress`（徽标文本 + `.row-label` 溢出判定）、`reader-state-writes`（save 次数 + 最近 payload）。断言以脚本内 `throw` 实现，失败落到 `99-failure-state.png` 且退出码 1。
4. 【回归】既有 00–11 场景全部通过，截图数量不少于改前，`MANIFEST.json` 的 `failure` 为 null。
5. 【check】`cd pix && npm run check` 0 error（vue-tsc + 主进程 tsc + preload tsc）。

**涉及文件**：`pix/scripts/ui-shot.mjs`。

**数据落盘**：只写临时 fixture 目录（不写仓库）。

---

## 3. 反需求（本轮明确不做）

1. **不自动打开上次文档、不做启动即跳页**：现场恢复只提供显式入口（PRD-V0.4 §4.1），避免劫持「进入工作区」的既有语义。
2. **不持久化 `pageCount` 与任何文档元数据**：状态文件只装「现场」；写进 PDF 解析结果会扩大损坏面，并把 N30 的「第 N 页」变成全量元数据依赖。
3. **不做滚动偏移（像素 y）恢复**：跨缩放、跨窗口宽度不可比，需要重新度量与容错；页码已覆盖主路径。
4. **不做多位置书签、多标签、最近 N 篇列表**：只保留单个 `lastDocPath`；列表需要排序/裁剪/清理 UI，超出本轮主线。
5. **不做状态文件的备份、逃生口、重置入口、管理面板**：与 notes 的分层相反（易失状态自己重来），任何管理面都会制造「用户需要理解状态文件」的负担。
6. **不做写入重试队列、离线缓冲、文件锁**：同步读-改-写 + 原子 rename 已足够；队列会把阅读链路与磁盘可用性耦合。
7. **不把阅读状态暴露给 agent**：不新增 reader-state 工具、不改 `<reading_context>` 字段；现场是 UI 层的东西，进上下文只增加噪声与回归面。
8. **不做跨工作区聚合、云同步、多设备**。
9. **不做 `before-quit` 拉取、不新增 `sendSync` 通道**：理由见 §0.2。
10. **不改 `library-list` IPC 与 `LibraryNode`**：进度来自渲染层映射；把阅读状态耦合进文件枚举对非阅读客户端无意义。
11. **不做向后兼容**：`version !== 1` 直接空状态，不迁移、不读旧字段。
12. **不引入新依赖、不改 `packages/**`、不改构建与打包配置**（工程红线）。

---

## 4. 文件白名单

### 主进程面

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `pix/src/main/reader-state-store.ts` | **新建** | 唯一写者；同步 fs；tmp+rename；路径从 `library-root` 派生；不 import electron |
| `pix/src/main/ipc-handlers.ts` | 修改 | notes 段之后新增 `Reader state` 段两条 handler（`reader-state-load` / `reader-state-save`），入参校验 + 中文错误 |
| `pix/src/main/preload.ts` | 修改 | `PixApi` 增两方法 + 实现（顶层 `import type`） |
| `pix/src/shared/types.ts` | 修改 | 新增「Reader State Types」段（2.0 契约） |
| `pix/src/main/library-root.ts` | 只读复用 | 不改 |
| `pix/src/main/index.ts` | **不改** | 不加 `before-quit` 拉取（§0.2） |
| `pix/src/main/notes-store.ts`、`pdf-tools.ts`、`reading-prompt.ts`、`pix-paths.ts`、`session-bridge.ts`、`file-dialogs.ts`、`settings-store.ts` | **不改** | 状态文件策略与 notes 相反，不得相互渗透 |

### 渲染层面

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `pix/src/renderer/stores/reader-state-store.ts` | **新建** | 已加载映射 + 快照 + 去抖 + 四安全点 flush + `resetState` |
| `pix/src/renderer/stores/reader-store.ts` | 修改 | 只新增 `pendingRestore` 三件套与 `requestRestore/takeRestore`；既有字段语义零改动 |
| `pix/src/renderer/components/workspace/PdfViewer.vue` | 修改 | `loadPdf` 消费顺序（跳转 > 恢复 > 第 1 页）+ 恢复缩放时机；不改渲染/搜索/框选逻辑 |
| `pix/src/renderer/components/workspace/ReaderPanel.vue` | 修改 | 空态续读入口 + `emit("open-document")` |
| `pix/src/renderer/components/workspace/LibraryPanel.vue` | 修改 | PDF 行进度徽标（读 store） |
| `pix/src/renderer/pages/WorkspacePage.vue` | 修改 | 三处 `resetState()` + 续读入口打开编排 + flush 接线 |
| `pix/scripts/ui-shot.mjs` | 修改 | stub 面 + `__pixStub` 控制口 + `20-*` 场景 + `MEASUREMENTS` 断言 |
| `pix/src/renderer/utils/notes-path.ts` | 只读复用 | 复用 `docPathKey/currentDocKey/absoluteDocPath/docDisplayName`，不改 |
| `pix/src/renderer/stores/notes-store.ts`、`components/workspace/NotesPanel.vue`、`ChatPanel.vue`、`KnowledgeMap.vue`、`PdfSearchPanel.vue`、`PdfSelectionQuickAsk.vue`、`composables/*`、`stores/{session,project,settings,auth}-store.ts`、`utils/{reading-context,note-capture,markdown,session-title,image-capture}.ts` | **不改** | 见 §2.0 与不变量 5 |

范围外（任何情况下不动）：`packages/**`、`pix/package.json`（含 dependencies）、`package-lock.json`、`pix/build/**`、electron-builder 配置。

---

## 5. 风险 Top3 与判定方式

**R1 「退出/切换时丢掉最后页码」** —— 快照与去抖共享一处状态，顺序错一次就丢用户唯一在意的那个数；且丢数据不像报错那样显眼，容易漏检。

- 判定：N27 验收 1/2/3/4/6 + N32 验收 4；离屏断言「切换后最近一次 payload = 旧文档的最后页码」；人工走查真实关窗（翻页后 1 秒内关窗 → 重开续读该页，记录在开发档）。
- 失败信号：切换路径的 payload page=1（读了复位后的 store 值）；或 `state=idle/loading` 时 `flush()` 被短路。

**R2 「恢复值污染显式跳转，破坏已交付的 N20 语义」** —— 笔记跳转是硬能力，被现场恢复劫持属回归级事故；两条意图通道同形，容易只处理一条。

- 判定：N28 验收 1/3/4/5/8（含 DEV-R5b §4 的 N20 六条回归）+ ui-shot 场景「A 已打开并翻页 → 点 B 第 2 页笔记 → 落第 2 页」。
- 失败信号：`openDocument` 只清理 `pendingJump` 未清理 `pendingRestore`；加载失败路径未消费恢复意图；出现第二个初始落页分支。

**R3 「状态写入爬进阅读链路，把打开/翻页拖慢或带崩」** —— 同步 fs + IPC 在打开路径上最容易被顺手调用，且失败若要冒泡会直接毁掉「阅读不受影响」这条硬约束。

- 判定：N33 补充硬约束（损坏状态下既有 00–11 场景全绿）+ N27 验收 1/2/5/8 + 代码审查点（所有 `reader-state-*` 调用点都在 `try/catch` 或返回结果分支内，返回值不进入任何模板分支）+ 离屏断言「主进程 write-failed 下 DOM 零变化」。
- 失败信号：渲染层出现 error 状态字段被模板消费；打开文档前 `await` 状态写入；去抖窗口被实现成 tick/interval 轮询。
