# PiX-Read R6 设计档 · 阅读现场（N26–N34）

> 上游：`docs/pm/R6-req.md`（需求，含 §0.1 静默降级与 §0.2 渲染层主动 flush 两条写死项）、`docs/pm/R6-review.md`（must-fix 1–8）、`docs/pm/PRD-V0.4.md` §2/§3/§4.1/§5.7。
> 本档是「可直接开工的定稿设计」：契约、时序、失败路径、分工、验证全部写死到可判定粒度，实现侧不需要再做取舍。
> 本档不改任何代码；**唯一工程门**仍是 `cd pix && npm run check`（0 error）。

---

## 0. 判定口径与两处口径修订

判定证据仍只有三类：代码审查、`cd pix && npm run check`（0 error）、离屏取证
`cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs`（退出码 0 + `MANIFEST.json` 的 `failure` 为 null + `MEASUREMENTS.json` 断言值）。

**修订 1（对应 must-fix 7 前半）**：`N27 §0.2.4` 与 `N32 验收 4` 的「真实关窗人工走查」降级为**第 4 类证据（开发档人工走查）并限定范围**：只在开发档记录「翻页后 1 秒内关窗 → 重开 → 续读该页」，**不作为本档判定依据**。本档的判定改为两条可判定项：
- 【代码审查】`document.addEventListener("visibilitychange", …)` 与 `window.addEventListener("pagehide", …)` 注册在 `WorkspacePage`，两个 handler 都只调用 `readerStateStore.flush()`；
- 【离屏】用 `Object.defineProperty(document, "hidden", { configurable: true, get: () => true })` 制造 hidden 态 + `document.dispatchEvent(new Event("visibilitychange"))`、`window.dispatchEvent(new Event("pagehide"))` 驱动同一段生产代码。

**修订 2（对应 must-fix 7 后半）**：`N31 验收 6` 的「1.1 缩放下重跑既有场景」收窄为：
- 【离屏】1.1 缩放下重跑「翻页 + 文本层选区 + 摘录」链路（新增场景 `22b-scale-excerpt`，复用 06/07 的选区与摘录动作）；
- 【代码审查】搜索 / 知识地图 / 框选截图在缩放恢复下零耦合，判定 `grep -rn "readerState" src/renderer/components/workspace/PdfSearchPanel.vue src/renderer/components/workspace/KnowledgeMap.vue src/renderer/composables/useRegionCapture.ts` 为 0 命中（这三条链路只读 `readerStore.scale`，其语义与取值域本轮未变）。

**有意变更声明（评审 §1(2)）**：本轮把「缩放跨文档保持」改为「缩放按文档恢复（无记录回 1.0）」。这是需求 N31 验收 5 要求的行为，**属于有意变更**，不算违反不变量 5（不变量 5 管的是标签文案与 `reader-store.setScale` 的钳制/取整口径，二者都不变：仍只有一处缩放来源）。

---

## 1. 契约冻结表

### 1.1 共享类型（`pix/src/shared/types.ts`，新增「Reader State Types」段，紧随 Reader Notes Types 之后）

```ts
/** 单篇文档的现场：page 1-based；scale 为 reader-store 钳制后的两位小数。 */
export interface ReaderDocState {
  page: number;
  scale: number;
  updatedAt: number;
}

/** 状态文件内存模型。documents 以「比较键（小写 + 正斜杠）」为键；lastDocPath 保留原大小写相对路径。 */
export interface ReaderStateFile {
  version: 1;
  lastDocPath: string | null;
  documents: Record<string, ReaderDocState>;
}

/** 复用 notes 的词表，避免两套码表分叉；本轮这些码只进日志与取证，不进任何文案。 */
export type ReaderStateErrorCode = "no-root" | "outside" | "invalid-input" | "read-failed" | "write-failed";

/** 读侧降级原因。degraded === true ⇔ reason !== undefined。 */
export type ReaderStateDegradeReason = "missing" | "corrupt" | "version-unsupported" | "read-failed";

/** 写入草稿：docFilePath 必须传绝对路径（与 ReaderNoteDraft 同口径）。 */
export interface ReaderStateSaveDraft {
  docFilePath: string;
  page: number;
  scale: number;
}

/** success 仅在「无工作区根」时为 false；state 在降级时为空状态。 */
export interface ReaderStateLoadResult {
  success: boolean;
  state: ReaderStateFile;
  filePath: string;
  degraded: boolean;
  reason?: ReaderStateDegradeReason;
  code?: ReaderStateErrorCode;
  error?: string;
}

/** 失败时 state 恒为空状态（与 ReaderNotesMutationResult 的「失败回传空值」同形），渲染层不得消费失败 payload。 */
export interface ReaderStateSaveResult {
  success: boolean;
  state: ReaderStateFile;
  code?: ReaderStateErrorCode;
  error?: string;
}
```

- 字段取值域：`page` = 整数 ≥ 1；`scale` = 有限数且 ∈ [0.5, 3]；`updatedAt` = 主进程本次写入时刻的 epoch 毫秒。
- `filePath` = 状态文件绝对路径（无根时为空串），**只用于诊断，不渲染**。
- `degraded` / `reason` 的消费点固定两处：主进程一行 `console.warn("[reader-state] …")`、渲染层一行 `console.warn("[reader-state] …")`；**判定：`degraded === true` ⇔ 恰好一行 warn（含 `missing`，首启缺文件同样记一行，规则唯一、可一眼验真）**。

### 1.2 IPC 通道（`pix/src/main/ipc-handlers.ts` 的 notes 段之后新增「Reader state」段）

| 通道 | 入参 | 返回 | 错误码与中文错误（只进日志） |
| --- | --- | --- | --- |
| `reader-state-load` | 无 | `ReaderStateLoadResult` | `no-root`「尚未选择资料库根目录」（`success:false, filePath:""`、`degraded:false`、不记 warn、不写盘）；降级不设 code（只有 `reason`），`error` 为该原因的中文短句 |
| `reader-state-save` | `ReaderStateSaveDraft`（handler 只做形状守卫，取值域在 store 内判） | `ReaderStateSaveResult` | `invalid-input`「阅读状态数据不合法」、`outside`「该文档不在当前资料库内」、`read-failed`「阅读状态文件读取失败（未写入）」、`write-failed`「阅读状态写入失败」、`no-root`「尚未选择资料库根目录」 |

- handler 形状守卫：`isReaderStateDraft(value)` 只判 `docFilePath` 为非空 string、`page` 为有限 number、`scale` 为有限 number；形状不合法直接返回 `{ success:false, state:空状态, code:"invalid-input", error:"阅读状态数据不合法" }`（与 `invalidNotesInput()` 同形）。
- 域校验（相对化、越界、范围、整数）全部在 `reader-state-store.ts` 内完成，**渲染层不得有第二套校验**。

### 1.3 preload（`pix/src/main/preload.ts`）

`PixApi` 增两条 + 实现同步（顶层 `import type`）：

```ts
readerStateLoad: () => Promise<ReaderStateLoadResult>;
readerStateSave: (draft: ReaderStateSaveDraft) => Promise<ReaderStateSaveResult>;
// 实现：ipcRenderer.invoke("reader-state-load") / ipcRenderer.invoke("reader-state-save", draft)
```

### 1.4 状态文件（主进程唯一写者）

- 路径：`join(getLibraryRoot(), ".pix-read", "reader-state.json")`（唯一派生点，无根时返回空路径并走 `no-root`）。
- 内容（`JSON.stringify(file, null, 2) + "\n"`，与 notes 同序列化口径）：

```json
{
  "version": 1,
  "lastDocPath": "sample-paper.pdf",
  "documents": {
    "sample-paper.pdf": { "page": 3, "scale": 1.1, "updatedAt": 1757900000000 }
  }
}
```

- 原子写协议：`mkdirSync(dirname(target), { recursive: true })` → 写 `<target>.tmp` → `renameSync` 覆盖；任一步失败清理 tmp 且**原文件字节不变**。`reader-state-store.ts` **自带**该实现（`notes-store.writeFileAtomic` 未导出，且不变量 2 禁止两套策略互相渗透）；不做备份、不做逃生口、不做校验和。
- 读侧原因表（读不改写；任何分支都不写盘）：

| 情况 | reason | 内存模型 |
| --- | --- | --- |
| `ENOENT` | `missing` | 空状态 |
| JSON 语法错 / 顶层非对象 / 数组 / `version` 非 number / `documents` 非对象 | `corrupt` | 空状态 |
| `version !== 1` | `version-unsupported` | 空状态（不迁移） |
| 其它读异常（EACCES / EBUSY / EISDIR / EPERM…） | `read-failed` | 空状态 |
| 读取成功 | 无（`degraded:false`） | 逐条裁剪后的模型 |

- 条目级裁剪规则（读时执行；`page` 非 ≥1 整数、`scale` 非 [0.5, 3] 内有限数、键非字符串/含 `\`/绝对路径/含 `..` 段/**键不等于其归一化形式**，任一命中即丢该条，其余条目保留）。`updatedAt` 非有限数 → 条目保留、`updatedAt` 记 0（非关键字段，不因它丢现场）。
- `lastDocPath` 交叉过滤（写死，对应 must-fix 8）：`lastDocPath` 非 string / 空 / 绝对 / 含 `\` / 含 `..` 段 → 按无记录；`resolve(root, lastDocPath)` 未通过 `isLibraryFilePath()`、或**解析后不存在或非文件** → 按无记录；`documents[docPathKey(lastDocPath)]` **不存在或已被裁剪** → 按无记录（此处 `docPathKey` 作用于**相对路径**，与写盘键同域；**绝对路径不得用于查 `documents`**，渲染层同样遵守）；**无条目等同无记录**，返回模型里 `lastDocPath = null`，不产生「无页码的半截入口」。
- 写侧语义（对应 must-fix 2）：`saveReaderState` 的读-改-写里，读结果为 `missing`/`corrupt`/`version-unsupported` 时**允许**以空模型整体覆盖重建；读结果为 `read-failed` 时**拒绝写入**（返回 `code:"read-failed"`、原文件字节不变）。理由与 `notes-store.addNote` 同口径：读不到就不知道其它文档的现场，覆盖 = 一次瞬时占用清空全部文档的阅读位置。
- 写入内容精确性：只改目标条目（`page`/`scale`/`updatedAt = Date.now()`）+ `lastDocPath = 目标文档原大小写相对路径`；**其它条目字段一字不动**，序列化格式统一（2 空格缩进 + 末尾换行），键顺序沿用读入顺序（新条目追加在末尾）。

### 1.5 渲染层 store：`pix/src/renderer/stores/reader-state-store.ts`（`defineStore("readerState", …)`，setup store）

| 成员 | 类型 | 语义 | 消费式 / 节流 |
| --- | --- | --- | --- |
| `documents` | `Ref<Record<string, ReaderDocState>>` | 已加载映射（键 = 工作区相对路径比较键 `docPathKey(相对路径)`，值域与 `currentDocKey(absPath, rootDir)` 一致）；提交时乐观更新，主进程成功返回的 `state` 覆盖。即 `R6-req.md` §2.0 所称的「`state`（已加载映射）」，本档统一叫 `documents`（避免与「状态文件」同词） | — |
| `lastDoc` | `Ref<{ docPath: string; page: number; scale: number } \| null>` | 续读入口唯一数据源；`docPath` 为原大小写相对路径 | — |
| `ready` | `Ref<boolean>` | 状态加载已结束（成功或降级都算结束）；**快照与提交、续读入口显示的硬前置**（落点的「认领」不受它约束，见 §3.3） | — |
| `degraded` | `Ref<boolean>` | 诊断镜像（与主进程降级一一对应）；只驱动 store 内那一行 warn，**不得进入任何模板** | — |
| `loadReaderState()` | `() => Promise<void>` | 唯一读入口；`loadSeq` 作废在途响应（与 notes-store 同范式）；成功后以加载值给去重基线播种 | 消费式（一次工作区一次） |
| `progressPageFor(absPath)` | `(absPath: string) => number \| null` | 树徽标查询：`key = currentDocKey(absPath, rootDir)`（`rootDir` 取 `projectStore.currentProject?.path ?? ""`，与 notes-store 同款用法）；`key` 为 null 或 `documents[key]` 不存在 → `null`（不显示徽标）；当前文档取 `readerStore.page`（实时），其它文档取 `documents[key].page` | — |
| `requestRestoreFor(absPath)` | `(absPath: string) => void` | **恢复意图的唯一登记点**（树行 / 续读入口 / 笔记跳转共用）：`key = currentDocKey(absPath, rootDir)`；`key` 非 null 且 `documents[key]` 存在 → `readerStore.requestRestore(absPath, documents[key].page, documents[key].scale)`；键为 null 或无记录 → **不登记任何意图** | — |
| `noteLanding(absPath, page, scale)` | 每次加载成功后的唯一落点观察 | 两段式：**认领**（`currentDocKey` 非 null 即置 `settledKey = key`，不受 `ready` 约束）→ **快照**（`ready === true` 且 `page`/`scale` 合法才覆盖 `snapshot` 并起/续去抖） | 非节流（每次加载 1 次） |
| `noteChange(absPath, page, scale)` | 落点之后的位置/缩放变化观察 | 仅在闸门（§3.3）全部通过时接受，更新快照并起/续去抖 | 节流（600 ms 尾触发） |
| `flush()` | `() => void` | 同步捕获快照 → 去重 → 提交 IPC；清去抖定时器；**同步完成捕获**，调用后即可 resetState | 安全点 + 去抖结算 |
| `resetState()` | `() => void` | `loadSeq += 1`、清定时器、清快照、清基线、清 `documents`/`lastDoc`、`ready = false`、`degraded = false`、`settledKey = null` | — |

内部非响应式状态：`loadSeq`、`debounceTimer`、`snapshot: {filePath,page,scale} | null`、`committed: Snapshot | null`（**去重基线 = 已提交的 payload**）、`settledKey: string | null`（工作区相对路径比较键，与 `documents` 同域）。常量 `DEBOUNCE_MS = 600`。

### 1.6 渲染层 store（`reader-store.ts` 扩展，既有字段语义零改动）

```ts
const pendingRestore = ref<{ filePath: string; page: number; scale: number } | null>(null);
function requestRestore(path: string, page: number, scale: number): void;  // 同文档且已加载 → 直接丢弃（不留意图）
function takeRestore(targetPath: string): { page: number; scale: number } | null; // 路径匹配则清除并返回，否则 null
```

`openDocument(path)` 对 `pendingRestore` 的清理规则与 `pendingJump` **逐字同构**（`!path` 或路径不匹配 → 置 null）。
`requestRestore` 在渲染层的唯一登记点是 `reader-state-store.requestRestoreFor(absPath)`（§1.5）：键运算与 `documents` 查找都收在 store 内，`WorkspacePage` 与 `PdfViewer` 都不自行拼键（比较键的唯一定义点仍是 `utils/notes-path.ts`）。
另外导出 `MIN_SCALE / MAX_SCALE / DEFAULT_SCALE`（现为文件内私有常量），供 `reader-state-store` 与 `PdfViewer` 复用，**禁止在别处复制字面量**（判定：`grep -rn "0\.5\|= 3\b" src/renderer/stores/reader-state-store.ts src/renderer/components/workspace/PdfViewer.vue` 无缩放字面量）。

### 1.7 时间点语义（何时读 / 何时写 / 何时清 / 优先级）

- **读**：工作区 `onMounted` 一次（`resetState()` → `loadReaderState()`，紧跟既有 `notesStore.resetNotes()/loadNotes()` 之后）。不轮询、不在每次打开文档时重读（唯一写者是我们自己，内存模型即真相；重读会引入竞态与额外 IO）。
- **写**：仅由 `noteLanding`/`noteChange` 产生快照，600 ms 尾触发提交；四个安全点强制 `flush()`（§3.5）。
- **清**：`resetState()` 三处 —— `WorkspacePage.onMounted`（加载前）、`onUnmounted`（**flush 之后**）、`goHome`（**flush 之后**）。
- **优先级**：`pendingJump`（显式跳转）> `pendingRestore`（现场恢复）> 第 1 页。**缩放独立于位置优先级**：永远取目标文档的恢复值，无记录即 `DEFAULT_SCALE`（1.0）。即「跳转命中 + 该文档有恢复记录」时落跳转页 + 恢复缩放。
- **三个入口同一条恢复路径**：资料库树、续读入口、笔记跳转都经 `readerStateStore.requestRestoreFor(absPath)` 登记恢复意图，所以上面那条缩放规则对笔记跳转同样成立；笔记跳转的位置由既有 `requestJump(target, note.page)` 决定（同文档时 `requestRestore` 直接丢弃、缩放保持当前值，与现状一致）。
- **失败不改内存**：任何写失败都不回滚内存模型、不重试排队；下一个真实变化自然重写（`committed` 提交即记账，见 §3.4）。

---

## 2. 文件级清单（动作 + 改动点 + 不变量）

### 2.1 主进程 / 共享（A 面）

| 文件 | 动作 | 具体改动点 | 不变量（不得破坏） |
| --- | --- | --- | --- |
| `pix/src/shared/types.ts` | 修改 | 新增 §1.1 的 7 个类型（Reader State Types 段） | 既有类型一字不改；不引入 `any`；段间注释风格与 Reader Notes Types 一致 |
| `pix/src/main/reader-state-store.ts` | **新建** | 叶子模块：不 `import electron`；同步 fs；`mkdir → tmp → renameSync` 自带实现；`statePaths()` 从 `getLibraryRoot()` 派生；`toRelativeDocPath`（与 notes 同规则自带一份）；`parseReaderState`（原因表 + 裁剪 + `lastDocPath` 交叉过滤）；导出仅 `loadReaderState()` 与 `saveReaderState(draft)` | 不 import `notes-store.ts`；不写备份文件；不超过 2 个导出；同一函数体内不出现 `await` |
| `pix/src/main/ipc-handlers.ts` | 修改 | notes 段之后新增「Reader state」段：`isReaderStateDraft` 形状守卫、`invalidReaderStateInput()`、两条 `ipcMain.handle` | `library-list` / `library-read-*` / `notes-*` 段零改动；handler 不做域校验 |
| `pix/src/main/preload.ts` | 修改 | `PixApi` 增 `readerStateLoad` / `readerStateSave` + 实现 + 顶层 `import type` | 既有 API 名与语义不变；不新增 `sendSync` / 同步通道 |
| `pix/src/main/index.ts` | **不改** | 不加 `before-quit` 拉取（§0.2） | — |

### 2.2 渲染层 / 取证（B 面）

| 文件 | 动作 | 具体改动点 | 不变量 |
| --- | --- | --- | --- |
| `pix/src/renderer/stores/reader-state-store.ts` | **新建** | §1.5 + §3.2–§3.4 全部机制；唯一 `console.warn("[reader-state] …")` 消费点 | 不拼存储路径；无 UI 状态机（无 `status/error` 字段）；不 import electron |
| `pix/src/renderer/stores/reader-store.ts` | 修改 | 新增 `pendingRestore` 三件套；导出 `MIN_SCALE/MAX_SCALE/DEFAULT_SCALE` | `openDocument` 的复位集合、`setPage/setPageCount/setScale` 的钳制与两位小数、`requestJump/takePendingJump` 语义零改动 |
| `pix/src/renderer/components/workspace/PdfViewer.vue` | 修改 | `loadPdf` 序言消费两意图 + 应用缩放（早于 `getDocument`）；唯一初始落页点 + `noteLanding`；新增位置/缩放变化观察 watcher；删除 catch 段的 `takePendingJump` 调用 | `scrollToPage(` 调用点仍为 4 处（`:315` gotoPage、`:652` 初始落页、`:774` 缩放重排、`:783` gotoPage watcher）；缩放 watcher 的 `if (!pdfDoc) return;` 与全量重排分支不变；渲染/搜索/框选/键盘/Ctrl+F 逻辑零改动 |
| `pix/src/renderer/components/workspace/ReaderPanel.vue` | 修改 | 空态续读入口 + `emit("open-document", absPath)`；错误空态新增专用 class `reader-empty-error`；filePath watcher 中 `flush()` **先于** `openDocument(path)` | 正常空态文案「选择左侧文件开始阅读」与 `.empty-title`/`.empty-subtitle` 不动；文本预览链路（markdown/截断提示/失败态/重试）不动 |
| `pix/src/renderer/components/workspace/LibraryPanel.vue` | 修改 | PDF 行的 `.row-progress` 徽标（读 store，键用 `row.node.path`）+ 两条样式 | `flattenVisible`/`expanded`/懒加载/`toggle`/`reload` 零改动；不新增 props（不引入第二套键实现） |
| `pix/src/renderer/pages/WorkspacePage.vue` | 修改 | `resetState()`×3；`flush()` 接线（`goHome`、`onUnmounted`、`visibilitychange`、`pagehide`）；`openDocumentFromLibrary(absPath)` 编排（树行 + 续读入口共用，内部走 `readerStateStore.requestRestoreFor`）；`@open-document` 处理；`onOpenNote` 增 `readerStateStore.requestRestoreFor(target)`（位置仍走既有 `requestJump(target, note.page)`） | `onOpenNote` 的 `requestJump` 与「同文档不重载」（比较键判定）不变；**`goHome()` 的第一条语句必须是 `readerStateStore.flush()`，先于 `await rpc.stopSession()`**（`session-stop` handler 末尾 `clearLibraryRoot()`，之后 save 必返 `no-root` 并静默丢弃最后现场）；其后既有复位顺序（stopSession → clearSession → openDocument(null) → mapOpen/captureMode/scale → resetNotes → push）逐条不变 |
| `pix/scripts/ui-shot.mjs` | 修改 | fixture 冻结（3 页 A + 2 页 B + 第二工作区）、stub 面与控制口、`20-*` 场景与断言 | 既有 00–11 场景、`SEL`、`MANIFEST`/`MEASUREMENTS` 结构不改；stub 不得用反引号、反斜杠转义照旧 |

范围外（任何情况下不动）：`packages/**`、`pix/package.json`（含 dependencies）、`package-lock.json`、`pix/build/**`、electron-builder 配置、`pix/src/main/{notes-store,pdf-tools,reading-prompt,pix-paths,session-bridge,file-dialogs,settings-store,index}.ts`、`pix/src/renderer/utils/notes-path.ts`、`components/workspace/{NotesPanel,ChatPanel,KnowledgeMap,PdfSearchPanel,PdfSelectionQuickAsk}.vue`、`composables/*`、`stores/{session,project,settings,auth,notes}-store.ts`。

---

## 3. 时序与状态机

### 3.1 reader-state store 状态机

```
resetState() ──► idle (ready=false, 快照/基线/定时器全空, settledKey=null)
   │
   ├── loadReaderState() ──► loading (loadSeq=seq)
   │        ├─ 成功/降级/异常 ──► ready=true
   │        │      · documents/lastDoc ← 主进程模型（异常时为空模型）
   │        │      · committed ← { docKey(lastDocPath), page, scale }（仅当 lastDoc 非 null）
   │        │      · degraded=true ⇒ 一行 console.warn
   │        └─ 过期（seq 不匹配）──► 丢弃，不写状态机（与 notes-store 同范式）
   │
   ├── 任意时刻（PdfViewer 落点）：noteLanding ──► 认领 settledKey（不受 ready 约束）
   └── ready=true 后：noteLanding / noteChange ──► snapshot ──► 600ms 尾触发 ──► submitIfChanged
            flush()（四安全点）──► 同步捕获 snapshot ──► submitIfChanged（并清定时器）
            resetState()（三处）──► 回 idle
```

### 3.2 打开文档的时序（含 must-fix 4 的缩放时机写死）

```
用户点击（树行 / 续读入口 / 笔记条目）
  ↓
WorkspacePage.openDocumentFromLibrary(absPath)         // 树行与续读入口共用
  ① 与当前文档同路径（`docPathKey(absPath)` 比较键判定，不用 `===`）→ 直接返回（不重载、不登记任何意图，守 N20 验收 1）
  ② readerStateStore.requestRestoreFor(absPath)          // 键 = currentDocKey(absPath, rootDir)；命中 documents 才登记意图，键 null / 无记录 → 不登记
  ③ selectedFilePath = absPath
  ↓（笔记条目走 onOpenNote：readerStore.requestJump(target, note.page)
     + readerStateStore.requestRestoreFor(target) + 比较键判定同文档不重载）
ReaderPanel 的 props.filePath watcher
  a. readerStateStore.flush()                          // 安全点 a：用切换前快照，早于复位
  b. readerStore.openDocument(path)                     // page=1、pageCount=0 → 复位态不入快照（§3.3）
  c. 文本文件 → loadTextFile；PDF → PdfViewer 渲染
PdfViewer.loadPdf(path)                                 // props 变化触发或被复用组件重新加载
  1. isLoading=true、清 pageSizes、setPageCount(0)…、await destroyDocument()（pdfDoc=null）
  2. if (generation !== loadGeneration) return;         // 被更新的加载抢占 → 不消费任何意图（保持现状语义）
  3. 意图消费（紧接在 try **之外**，任何成功/失败路径都必然执行过）：
       const jumpPage = readerStore.takePendingJump(filePath);   // 显式跳转优先
       const restore  = readerStore.takeRestore(filePath);       // 无论 jump 是否命中都消费，避免陈旧意图
       readerStore.setScale(restore ? restore.scale : DEFAULT_SCALE);   // ★ 早于 getDocument
  4. try { …libraryReadFile → getDocument → setPageCount → measurePages → isLoading=false → nextTick → observePages() }
  5. 唯一初始落页点：
       const target = jumpPage ?? restore?.page ?? 1;
       scrollToPage(Math.min(target, readerStore.pageCount));
       readerStateStore.noteLanding(filePath, readerStore.page, readerStore.scale);
  6. outline → setOutline（不变）
  catch → 既有失败态（意图已在步骤 3 消费，故失败路径同样丢弃；删除原 catch 段那次调用）
```

**must-fix 4 的取舍（选「在 `getDocument` 前消费并应用缩放」）**：`readerStore.setScale` 的写入位置必须早于 `pdfDoc = doc`（现 `:638`）。此时 `pdfDoc` 已被 `destroyDocument()` 置为 `null`，缩放 watcher 首行 `if (!pdfDoc) return;`（现 `:765`）必然早退 → 保证 N31 验收 3「恢复路径上不触发缩放 watcher 的全量重排分支」，也保证 N31 验收 1「首次渲染前就是 110%」（`pageSizes`/`cssSize` 与首帧 canvas 都读 `readerStore.scale`，恢复值此刻已在位）。
因此放弃另一个选项（在首次渲染后 `setScale` 再依赖重排），**二者互斥，本档只允许前者**。
`scrollToPage(` 的调用点冻结为 4 处：`:315`（`gotoPage`）、`:652`（唯一初始落页）、`:774`（缩放缓存重排）、`:783`（`gotoPage` watcher 消费）；行号会随实现漂移，判定以符号计数为准（§6.3）。

**意图消费等价性（守 N28 验收 5）**：消费点从「成功路径 + catch 路径各一次」前移为「try 之外的唯一一次」，因此**成功与失败两条路径都被同一次消费覆盖**；同时消除「出现两个消费点」的歧义。被更新的加载抢占（步骤 2）时不消费——这与现状同类（现状在 `:651` 消费、`:658` 之后的 stale 早退同样会丢意图），且此时 `openDocument` 的路径不匹配清理已经把旧意图清掉，语义无变化。

### 3.3 快照与观察闸门（对应 must-fix 3）

- **快照是持续维护的**：每次被接受的观察都把 `snapshot` 覆盖为 `{filePath(绝对), page, scale}`；`flush()` 只做「同步读取当前快照 → 提交」，不在 flush 时读 `readerStore`（这正是 N27 验收 3 能成立的原因：切换后读 `readerStore.page` 会写成 1）。
- **键域**：`settledKey` 与所有闸门都用「工作区相对路径比较键」`currentDocKey(absPath, rootDir)`（与 `documents` 同域，唯一实现点仍是 `utils/notes-path.ts`）。
- `noteLanding` 两段式：
  - **认领（不受 `ready` 约束）**：`currentDocKey(filePath, rootDir)` 非 null 即置 `settledKey = 该键`；键为 null（空路径/出根）不认领。
  - **快照（受 `ready` 约束）**：`ready === true` 且 `page` 为 ≥1 整数且 `scale ∈ [MIN_SCALE, MAX_SCALE]` 时覆盖 `snapshot` 并起/续去抖；`ready === false` 时只认领、不写快照。
  - 分两段的理由（设计评审 must-fix 2）：认领是「这篇文档已加载过」的事实，与状态是否加载完无关；若认领也被 `ready` 丢弃，加载窗口内打开的文档此后每次 `noteChange` 都会被闸门 3 拒，整程不落盘，与本节「下一次真实翻页/缩放时写入」自相矛盾。
- `noteChange` 接受条件（四条全过；**全部在 store 内**，可在单文件内审查）：
  1. `ready === true`；
  2. `readerStore.pageCount > 0`（**文档加载窗口/`openDocument` 复位态的判据**：复位必然把 `pageCount` 置 0，落点必然在 `setPageCount` 之后，故复位值 `page = 1` 结构上无法进入快照）；
  3. `key !== null && key === settledKey`（该文档已落点；`key` 为 null 必须被显式拒掉，否则「两边都是 null」会假通过）；
  4. `key === currentDocKey(readerStore.filePath, rootDir)`（观察对象就是当前文档，比较键形式，与 1/2/3 同域）。
- **状态加载完成前不落盘**：快照与提交都以 `ready` 为前置，`loadReaderState` 未结算前不产生任何快照（含「状态未加载完就打开文档」这种时序）。**代价写死并接受**：加载窗口内打开、且此后不再翻页/缩放的文档，本轮不写盘（宁可少写一次，也不把已存的第 3 页写成 1）；只要用户在该文档内翻页或缩放一次，现场即恢复写入（认领已在落点时完成，不需要重新打开文档）。
- 观察的生产点只有两处（`PdfViewer`）：落点（`loadPdf` 步骤 5）与 `watch(() => [readerStore.page, readerStore.scale])`（在同一 watcher 内同时观察，避免两次调度）。watcher 内不做任何判断，只调用 `noteChange(props.filePath, readerStore.page, readerStore.scale)`。

### 3.4 去抖、提交与去重基线（对应 must-fix 6）

- **尾触发去抖**：只有「当前没有待触发定时器」时才排一个新的；定时器触发时清空自身并调用 `submitIfChanged()`。因此上界为「每 600 ms 至多一次结算 + 安全点各一次」。
- `flush()`：清掉待触发定时器 → `submitIfChanged()`。**flush 的捕获是同步的**（读 `snapshot`、比较、置 `committed`、发起 `window.pixApi.readerStateSave(payload)` 均不 await），所以「`flush()` → `resetState()`」这个调用顺序可以写死且安全。
- `submitIfChanged()` 的唯一去重规则：`snapshot === null` → 0 次 IO；`committed !== null && committed.filePath 同键 && committed.page === snapshot.page && committed.scale === snapshot.scale` → 0 次 IO；否则**提交**。
- **去重基线 = 已提交的 payload**：提交瞬间同步执行 `committed = snapshot`（提交即记账），因此异步 IPC 未回落前再次 flush 不会重复提交（N27 验收 4 的「+1 不 +2」成立）。失败**不回滚**基线（避免对同一值反复重试）；下一个不同值照常提交（N27 验收 5「下一次成功注入后继续翻页能写盘」成立）。成功时用主进程返回的 `state` 覆盖 `documents`；提交时对 `documents`/`lastDoc` 做乐观更新，失败只 `console.warn`。
- **基线播种**：`loadReaderState` 成功后，若 `lastDoc` 非空则 `committed = { filePath: absoluteDocPath(root, lastDoc.docPath), page, scale }`——它就是「文件里此刻的内容」，因此「打开 lastDoc 且页码/缩放一致」= 0 次 IPC、0 次写盘（N27 验收 1）。
- **`resetState()` 与 flush 的顺序**：调用点一律先 `flush()` 后 `resetState()`（§3.5）。flush 之后 `snapshot` 仍在，resetState 才清；即使两个事件先后触发（`pagehide` + `unmounted`），第二次 flush 因 `snapshot === null` 直接 0 次 IO。

### 3.5 四个安全点（调用点写死）

| 安全点 | 调用位置 | 顺序与理由 |
| --- | --- | --- |
| a 文档切换（PDF→PDF / PDF→文本 / 文档→空态） | `ReaderPanel.vue` 的 `props.filePath` watcher 内 | `flush()` → `openDocument(path)`。放在这里而不是 `PdfViewer`：它覆盖全部三种切换（PDF→文本会卸载 PdfViewer，`PdfViewer` 内抓不到） |
| b 离开工作区 | `WorkspacePage.goHome()` | **`flush()` 是 `goHome()` 的第一条语句，先于 `await rpc.stopSession()`**；之后既有复位（含 `openDocument(null)`）→ `router.push("/")`。理由（设计评审 must-fix 3）：`session-stop` handler 末尾 `clearLibraryRoot()`（`ipc-handlers.ts:304`），晚于它发起的 save 必返 `no-root` 并静默丢弃最后现场；该路径离屏覆盖不到（stub 的 `stopSession` 不清 `activeRoot`），判定 = §6.3 的代码审查项 + 开发档自评 |
| c 工作区页面卸载 | `WorkspacePage.onUnmounted()` | `flush()` → 退订 → `resetState()`；**顺序固定为 flush → resetState** |
| d 窗口隐藏/关闭前 | `WorkspacePage.onMounted/onUnmounted` 注册/注销 | `document.addEventListener("visibilitychange", h)`（`document.hidden === true` 时 flush）、`window.addEventListener("pagehide", h)`；两个 handler 只调 `flush()`，**不 resetState**（窗口可能只是被隐藏） |

监听生命周期与工作区页面严格对齐的理由：避免卸载后仍向旧工作区的根写盘；也避免「进入 B 后 A 的监听把 B 的快照写进 A 文件」。

### 3.6 跨工作区切换

`goHome`（flush → reset → 路由）→ 首页点另一张项目卡 → `HomePage.openWorkspace` 调 `rpc.startSession(dir)` → **主进程 `session-start` 里 `setLibraryRoot(projectDir)`**（既有代码）→ `WorkspacePage.onMounted`：`resetNotes/loadNotes` 之后 `resetState()/loadReaderState()`。
残留防护三件套：`resetState()` 清空 `documents/lastDoc/快照/基线/定时器`；`loadSeq += 1` 作废在途 load（A 的迟到响应不写 B 的映射）；`settledKey = null` 使 A 的迟到观察无法进入 B 的快照。

### 3.7 退出前 flush（机制与理由，对应 §0.2）

采用**渲染层主动 flush**，不新增主进程 `before-quit` 拉取、不新增 `sendSync`。理由（只读核对现状，本轮不改 `index.ts`）：Windows 关窗路径为 `window.close()` → 渲染层 `pagehide` → 渲染层销毁 → `window-all-closed`（`index.ts:218`）→ `requestShutdown()`（`index.ts:153` 置位 `shuttingDown`）→ `cleanup()` → `app.quit()` → `before-quit`（`index.ts:226`，`shuttingDown` 已置位即 return）——主进程在 `before-quit` 阶段窗口已不存在，无法再向渲染层索要状态；改为主进程拉取需 `event.preventDefault()` + 异步回环 + 处理重入，等于把易失状态放进退出关键路径，与本轮「状态不得阻塞阅读」冲突。
最坏损失 = 一个 600 ms 去抖窗口内的页码；`pagehide` 覆盖关窗、`visibilitychange → hidden` 覆盖最小化/切后台。

### 3.8 写入上界（写进开发档自评）

- 任意 T 毫秒窗口内写入次数 ≤ `⌈T/600⌉ + 1`（去抖结算至多一次 + 安全点至多一次）。
- 连续翻页/拖滚动条只写停止后的稳定值一次；落到同一三元组写 0 次；打开文档时 `scrollToPage` 引发的 `setPage`（值等于已恢复值）因基线播种写 0 次。
- 单次写盘 = 一个小 JSON 的整文件重写（典型 < 4 KB），主进程同步读-改-写；不解析 PDF、不排队、不写日志、不做备份。

---

## 4. 失败路径表

**本轮硬约束（逐字写进开发档自评）：状态类失败对用户完全不可见且不影响阅读。** 不允许出现任何状态相关的错误面板、toast、notice、chip、禁用按钮、弹窗；渲染层不得有任何模板分支消费状态失败（`degraded` 不得进模板）。

| 情况 | 行为 | 用户可见反馈 |
| --- | --- | --- |
| 状态文件不存在（首启） | 空模型、`reason: "missing"`、不写盘 | 无（空态照旧、续读入口不显示、树无徽标）；一行 `console.warn` |
| JSON 语法错 / 顶层非对象 / `documents` 非对象 | 空模型、`corrupt`、不写盘、不备份 | 无；一行 warn |
| `version !== 1` | 空模型、`version-unsupported`、不迁移 | 无；一行 warn |
| 单条目 `page`/`scale`/键非法 | 丢该条，其余条目仍生效 | 无 |
| `lastDocPath` 越界 / 绝对 / 解析后不存在或非文件 | 按无记录（`lastDocPath: null`） | 续读入口不显示；树徽标按条目情况 |
| `lastDocPath` 有效但 `documents` 无对应条目 | 无条目等同无记录 | 同上（不出现无页码的半截入口） |
| 读取抛错（EACCES/EBUSY/EISDIR） | 空模型、`read-failed` | 无；一行 warn |
| **save 内部读取失败** | **拒绝写入**，返回 `read-failed`，原文件字节不变 | 无；一行 warn（本轮最关键的一条：不许清空其它文档现场） |
| save 内部读到 `corrupt`/`version-unsupported`/`missing` | 允许以空模型整体覆盖重建 | 无 |
| 写入失败（只读目录/被占用） | `write-failed`，原文件字节不变 | 无（无浮层、无禁用态）；下一个变化点自然重写 |
| IPC reject（渲染层） | `try/catch` + `.catch` → 一行 warn | 无；阅读链路不受影响 |
| 无工作区根 | load/save 均 `no-root`、静默（load 返回 `degraded:false`，不记 warn） | 无（N27 验收 8） |
| 状态加载未完成就打开文档 | 落点只做认领（`settledKey`），不产生快照、不落盘（§3.3） | 无；该文档下一次真实翻页/缩放即写入 |
| 恢复页 > 实际页数 | 钳制到最后一页，随后去抖写入改正状态 | 页码指示器显示实际末页（既有能力） |
| 恢复页 ≤ 0 / 非整数 / `scale` 越界 | 主进程已裁剪为无记录 | 第 1 页 + 100%（既有能力） |
| 记录指向已删除文件 | 主进程过滤 → 无记录 | 入口不显示 |
| 显示后被删除（竞态） | 走既有 PdfViewer 失败态（重试 / 用系统应用打开） | 既有失败文案，不新增分支 |
| 非 PDF 文档（md/txt） | 全程 0 次 save | 无；`lastDocPath` 因此永远指向最后一次读的 PDF（**期望语义**） |
| 恢复缩放 = 当前缩放 / 无记录 | 不写盘 | 无 |

---

## 5. must-fix 处理表

| # | must-fix | 落在本档哪一节 | 落法 |
| --- | --- | --- | --- |
| 1 | `.reader-empty` 断言会误判正常空态 | §2.2（ReaderPanel 行）、§6.2 场景 23 | 错误空态新增专用 class `reader-empty-error`；断言改为 `.reader-empty-error === null` + `.empty-title` 文案为「选择左侧文件开始阅读」+ 空态内无「重试」按钮（三重判定，不依赖共用 class） |
| 2 | save 路径内部读取失败的定义缺失 | §1.4 写侧语义、§4 表第 8 行 | 写死：仅 `missing`/`corrupt`/`version-unsupported` 允许整体覆盖重建；`read-failed` 直接拒绝且原文件字节不变（与 `notes-store.addNote` 同口径）；离屏用「目录冒充状态文件 → EISDIR」复核 |
| 3 | 「有效变化」会把两处非用户变化写盘 | §3.3、§3.4、§1.5 | 写死：**快照与提交**在 `ready` 之前不落盘（含加载未完成就打开文档）；落点的「认领」（`settledKey`）不受 `ready` 约束（设计评审 must-fix 2）；复位态因 `pageCount === 0` 结构上无法进入快照，快照以**首个被接受的观察**为准 |
| 4 | N28 验收 1 与 N31 验收 3 互斥 | §3.2（★ 行）、§0 | 选定「`getDocument` 前消费并应用缩放」（`setScale` 早于 `pdfDoc = doc`，缩放 watcher 因 `pdfDoc === null` 早退）；失败路径仍丢弃意图；`scrollToPage` 冻结为 4 处调用点 |
| 5 | 数字断言与离屏 fixture 不符 | §6.1（fixture 冻结）、§6.2（全部数字断言） | N34 冻结：A `sample-paper.pdf` = **3 页**、MediaBox 595×842（新增第 3 页，几何不变）；B `archive/older-paper.pdf` = 2 页；全部「第 3 / 3 页」「110%」「655px」「30 次变化」按此重写 |
| 6 | 快照/flush/去重机制未定死 | §3.4、§3.5 | `flush → resetState` 顺序写死并在安全点表逐条列出；去重基线 = 已提交 payload（提交即记账、失败不回滚）；基线由加载值播种 |
| 7 | 不可判定项改口径 | §0 修订 1/2 | 真实关窗降级为第 4 类证据（限定范围）+ 代码审查项；`visibilitychange` 用 `Object.defineProperty(document,"hidden")` 制造 hidden 态、监听目标 `document`/`window` 写死；N31 验收 6 收窄为「离屏翻页+摘录链路」+「搜索/知识地图/框选零耦合代码审查」 |
| 8 | N29 入口规则缺两处交叉定义 | §1.4 的 `lastDocPath` 交叉过滤 | (a) 越界/绝对/解析后不存在或非文件 → 按无记录；(b) 有效但 `documents` 无对应条目 → 无条目等同无记录，返回模型 `lastDocPath = null` |

评审 §3 次级项也已落档：N26 验收 1 的字面量含 `state` 字段（§1.2）；`degraded ⇔ 一行 warn`（§1.1）；树徽标键用 `row.node.path`（§2.2 LibraryPanel 行）；N30 验收 6 的断言范围（§6.2）；`requestRestore` 同文档重复点击 → 直接丢弃（§1.6）；N29 验收 5 措辞（§4 表）；非 PDF 不落盘 ⇒ `lastDocPath` 只指向 PDF（§4 表末行）；N27 验收 4 的 hidden 制造方式与监听目标（§0 修订 1、§3.5）；快照捕获方式 = 持续捕获 + 切换点 flush（§3.3/§3.4）。

---

## 6. 验证方案

### 6.1 fixture 冻结（`ui-shot.mjs`，N34）

- A 工作区 = `<OUT_ROOT>/library`：`sample-paper.pdf` = **3 页**（新增第 3 页，如「4. Conclusion」标题 + 2 行正文；字体/字形沿用现有写法），每页 `MediaBox [0 0 595 842]`；`archive/older-paper.pdf` = 2 页（不变）；`reading-notes.md`（不变）；`.pix-read/notes.json`（不变）。
- B 工作区 = `<OUT_ROOT>/library-b`：`sample-paper.pdf`（与 A 同字节，用于「同名不同工作区」的最强判据）+ `.pix-read/`（**不预置** `reader-state.json`）；B 树的 `libraryList` **只返回这一行**（无 `archive/`、无 `reading-notes.md`），使场景 24 的 B 侧断言有真实的树可断言。
- 几何常量：`PAGE_W = 595`、`PAGE_H = 842`；`scale 1.1` ⇒ 首页宽 `Math.round(595 * 1.1) = 655` px（±1px）。
- stub 的 `activeRoot` 与状态面（must-fix 5/7 的冻结项）：
  - `startSession(dir)` 记录 `activeRoot = dir`（与主进程 `session-start → setLibraryRoot` 同构）；**`stopSession()` 不清 `activeRoot`**——这是与真实主进程的已知差异（§3.5 安全点 b 的 `no-root` 路径因此在离屏面覆盖不到），只由代码审查判定。
  - `readerStateLoad` **永远按 `activeRoot` 真读文件** `<activeRoot>/.pix-read/reader-state.json` 并真解析：`ENOENT → missing`、JSON 语法错/顶层非对象/数组/`version` 非 number/`documents` 非对象 → `corrupt`、`version !== 1 → version-unsupported`、其它读异常 → `read-failed`；条目级裁剪（§1.4 规则）在 stub 内实现；`degraded`/`reason` 只由这次真解析决定（20b 的 `missing` 来自文件不存在，23 的 `corrupt` 来自脚本写下的截断 JSON）。
  - `setReaderState(state)` = **把该文件写出来**（`state === null` = 删除文件；只写 `activeRoot` 下的路径），因此不存在「注入优先还是读文件优先」——两者是同一个来源（写文件的便捷口 → 同一条读路径）；场景 23 的截断 JSON 由脚本直接 `writeFileSync` 写同一个文件。
  - `setReaderStateDelay(ms)`（load 前 sleep）与 `setReaderStateFailure(code)`（**只影响 save 的返回**，不影响 load 的读文件语义）+ `readerStateSaveCalls()`（次数 + 最近 payload 列表）沿用 N34 的控制口定义。
  - `getSettings` 的 `recentProjects` = [A, B]（A 在前；B 的 `name` = `pix-r5-library-b`，按 `:title` 定位）；`libraryList(dir)` 按 dir 返回两套树；**stub 的 notes 面仍只认 A 的 `notes.json`**（不随 `activeRoot` 切换），避免 B 工作区的笔记分组干扰跨工作区断言。
- **注入/改写状态文件的时机固定为「已返回首页之后、进入工作区之前」**（否则安全点 flush 会覆盖注入内容）；同一场景需要两次不同注入时，按「`goHome` → 注入 → 点项目卡进入」重复一遍。
- 既有 00–11 断言不依赖 fixture 页数（实测：`scripts/ui-shot.mjs` 无 `.page-label` 命中，既有场景只读 `[data-page="1"]` 的文本层）——A 由 2 页改 3 页不影响既有场景。

### 6.2 命令与离屏场景

命令：
1. `cd pix && npm run check` → 0 error（唯一工程门）。
2. `cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs` → 退出码 0、`MANIFEST.json` 的 `failure === null`、`MEASUREMENTS.json` 全部断言值命中；既有 00–11 场景截图数量不少于改前。
3. 场景内断言以 `throw` 实现（新增本地 helper：先 push measurement 再 throw），失败自动落 `99-failure-state.png`、退出码 1。
4. 渲染层 warn 采集：`win.webContents.on("console-message", …)` 除打印外把消息追加到 `rendererLogs`；所有 warn 断言一律取**增量基线**（子场景开始前 `base = rendererLogs.filter(含 "[reader-state]").length`，断言 `… - base === n`）。主进程侧 warn 不进这个集合（stub 没有主进程日志），四条 reason 的中文短句本轮不冻结（只计数、不比对文案）。

截图与断言点（统一 `20-*` 段）：

| 场景 | 截图 | 断言（`MEASUREMENTS` label） |
| --- | --- | --- |
| 20c 续读入口加载中（`setReaderStateDelay(1500)` 后立刻取证） | `20c-resume-loading.png` | `resume-entry`：`.reader-resume === null`、`.empty-title` 归一化文本 === 「选择左侧文件开始阅读」 |
| 20 续读入口（注入 `lastDocPath:"sample-paper.pdf"`、`documents["sample-paper.pdf"]={page:3,scale:1.1}`） | `20-resume-entry.png` | `resume-entry`：`.reader-resume` 可见、`textContent` 同时含 `sample-paper.pdf` 与「第 3 页」；点击后 `.page-label` 归一化文本 === 「第 3 / 3 页」、`.zoom-label` === 「110%」 |
| 20b 无记录 | `20b-resume-empty.png` | `resume-entry`：`.reader-resume === null`、空态文案与 20c 相同（fixture 不写状态文件 → stub 真解析得 `missing`，渲染层记一行 warn；不断言文案） |
| 21 树进度（注入「sample-paper.pdf」`page:3` + `archive/older-paper.pdf` `page:1024`） | `21-tree-progress.png` | `tree-progress`：sample-paper 行 `.row-progress` 文本 === 「第 3 页」；`reading-notes.md` 行与 directory 行 `.row-progress` 计数 === 0；older-paper 行 === 「第 1024 页」；`.row-label` 与 `.tree-row` 的 `scrollWidth <= clientWidth`；随后点开 sample-paper → 翻到第 2 页 → **不等待去抖**该行徽标 === 「第 2 页」（当前文档取实时页码） |
| 21b 条目级裁剪（注入合法 `sample-paper.pdf` `page:3,scale:1.1` + 非法 `archive/older-paper.pdf` `page:0,scale:1.1`） | `21b-trim-invalid-entry.png` | `tree-progress.trim`：sample-paper 行 `.row-progress` === 「第 3 页」；older-paper 行 `.row-progress` 计数 === 0（非法条目整条被丢；若 stub 未实现裁剪，该行会出现「第 1 页」，断言直接暴露） |
| 22 缩放恢复（同 20 的注入，经树行打开） | `22-scale-restored.png` | `scale-restored`：`.zoom-label` === 「110%」、`.pdf-page[data-page="1"]` `getBoundingClientRect().width` === `Math.round(595*1.1)`（±1）、`.page-label` === 「第 3 / 3 页」 |
| 22b 1.1 缩放下翻页 + 摘录（修订 2 的离屏子集） | `22b-scale-excerpt.png` | `scale-restored.excerptAt110`：翻到第 2 页后 `.page-label` === 「第 2 / 3 页」；当前页 `.textLayer span` 存在；构造选区后 `.quick-ask` 可见、点「摘录」后 `.quick-ask-feedback.is-ok` 出现 |
| 22c 写失败注入后 DOM 零变化（`setReaderStateFailure("write-failed")`，翻页并等满一个去抖窗口） | `22c-throttle-no-ui-change.png` | `reader-state-writes`：`.reader-empty-error === null`、无 `.v-snackbar/.notes-notice`、`.page-label` 正常推进、`readerStateSaveCalls()` 的 payload 有记录且拒绝写入（fixture 文件字节不变）；随后清除注入、再翻页 → `calls +1` |
| 22d 笔记跳转到无记录文档（A 有记录第 3 页/110%；`archive/older-paper.pdf` 无记录；点该文档的种子笔记 `page:7` → 越界钳到第 2 页） | `22d-note-jump.png` | `note-jump`：`.page-label` === 「第 2 / 2 页」、`.zoom-label` === 「100%」（N28 验收 3 后半：A 的恢复值不污染 B） |
| 22e 笔记跳转到有记录文档（注入 `sample-paper.pdf` `page:3,scale:1.1` + `archive/older-paper.pdf` `page:1,scale:1.5`，`lastDocPath` = older-paper；点同一条笔记） | `22e-note-jump-restored.png` | `note-jump.restored`：`.page-label` === 「第 2 / 2 页」（跳转页覆盖恢复页）、`.zoom-label` === 「150%」（缩放取目标文档恢复值——本条是 §1.7 与 must-fix 4 选项 (a) 的判别断言，改动选项即失败） |
| 23 损坏状态下的阅读与重建（脚本写截断 JSON） | `23-corrupt-state-reading.png` | `reader-state-degrade`：`.reader-empty-error === null`、空态内无「重试」按钮、`.reader-resume === null`、`.row-progress` 计数 === 0；打开 PDF 并翻到第 3 页后读 fixture 文件：`version === 1`、`lastDocPath === "sample-paper.pdf"`、`documents["sample-paper.pdf"].page === 3`；`reader-state-console`：进入工作区后、任何翻页之前，含 `[reader-state]` 的渲染层 warn **增量 === 1**（base 取子场景进入前；corrupt 由脚本 `writeFileSync` 写截断 JSON 到 A 的 `reader-state.json` 得到，stub 真解析） |
| 24 跨工作区无残留（A 读→首页→B→回 A） | `24-workspace-switch.png` | `workspace-switch`：(a) A 侧注入 `{lastDocPath:"sample-paper.pdf", documents:{"sample-paper.pdf":{page:1,scale:1.1}}}` → 树行打开 sample-paper → 翻到第 2 页 → `goHome`（flush 落盘 page 2）；(b) 切到 B（`.project-list-item[title="pix-r5-library-b"]`）→ **先断言 B 树中 sample-paper 行存在**（`.tree-row[title$="sample-paper.pdf"]` 计数 ≥ 1，防空跑）→ 再断言该行 `.row-progress` 计数 === 0、`.reader-resume === null`、`.empty-title` 文案正常；(c) 回 A → `.reader-resume` 可见且 `textContent` 含 `sample-paper.pdf` 与「第 2 页」、sample-paper 行 `.row-progress` === 「第 2 页」 |
| 21/22 期间的节流与安全点（无独立截图，复用 21/22 的 DOM） | — | `reader-state-writes`（**计数一律取增量**：子场景开始前 `base = readerStateSaveCalls().count`）：① 打开「有记录且页码/缩放一致」的文档后 2 s 内 `count - base === 0`，再等 1 s 仍为 0；② 先把页码复位到第 1 页（连点上一页），再在 2 s 内制造 30 次页码变化（`.pdf-page-indicator` 的下一页/上一页按钮交替点击：`(next, prev) × 14 + next + next`，30 次真实变化、结束页 = 3）→ 结算后 `新增 calls <= 5`、最近 payload `page === 3`；③ A 翻到第 3 页（注入 A 记录为第 1 页）→ 去抖窗口内切到另一篇文档（`archive/older-paper.pdf`）→ 最近一次 payload = A 的相对路径 + page 3；④ 制造一次变化后依次 `visibilitychange(hidden)`（`Object.defineProperty(document,"hidden",{configurable:true,get:()=>true})` + dispatch）与 `pagehide` → `calls` 恰好 +1；再 dispatch 两次 → 不再增长；⑤ 打开 `reading-notes.md` 并等 1.5 s → `calls` 不变（该断言的基线取「打开 md 之后」的计数，用于排除切换瞬间对上一篇 PDF 的正常 flush） |

### 6.3 代码级核对点（只读命令）

| 判定 | 命令 | 期望 |
| --- | --- | --- |
| 越界文件零改动 | `git status --short` | 只有 §2 白名单文件 |
| 文件树接口零改动 | `git diff --stat` | 不含 `library-list` / `libraryList` / `LibraryNode` |
| 未新增退出路径 | `grep -n "before-quit" pix/src/main/index.ts` | 与改前一致 |
| 无同步通道 | `grep -rn "sendSync" pix/src/main pix/src/renderer` | 0 命中 |
| 主进程白名单 | `grep -n "reader-state" pix/src/main/ipc-handlers.ts pix/src/main/preload.ts pix/src/main/reader-state-store.ts` | 只出现两通道名 / 两方法名 / 状态文件相关常量 |
| 渲染层唯一失败消费点 | `grep -rn "\[reader-state\]" pix/src/renderer` | 命中行全部落在 `stores/reader-state-store.ts` 内（文件唯一；warn 语句本身可有多行，不做行数断言——改判理由见 must-fix 6） |
| 复位三处 | `grep -c "resetState()" pix/src/renderer/pages/WorkspacePage.vue` | ≥ 3（onMounted / onUnmounted / goHome） |
| 落页点唯一 | `grep -n "scrollToPage(" pix/src/renderer/components/workspace/PdfViewer.vue` | 5 命中 = 1 定义 + 4 调用（gotoPage / 初始落页 / 缩放重排 / gotoPage watcher） |
| 意图消费唯一 | `grep -n "takePendingJump\|takeRestore" pix/src/renderer/components/workspace/PdfViewer.vue` | 恰好 2 处调用，且都在 try 之前；catch 段 0 处 |
| 缩放早于解析 | `awk '/async function loadPdf/ { f = NR } /readerStore\.setScale\(/ { s = NR } /getDocument\(/ { r = ((f && s && f < s && s < NR) ? 0 : 1); exit } END { exit r }' pix/src/renderer/components/workspace/PdfViewer.vue` | 退出码 0 = `loadPdf` 内存在 `readerStore.setScale(` 且其行号 < `getDocument(` 行号（`zoomBy` 的 `:718` 不在 loadPdf 区间内，不参与判定） |
| 离开工作区先 flush 后停会话 | `awk '/async function goHome/ { f = NR } /readerStateStore\.flush\(\)/ { s = NR } /rpc\.stopSession\(\)/ { r = ((f && s && f < s && s < NR) ? 0 : 1); exit } END { exit r }' pix/src/renderer/pages/WorkspacePage.vue` | 退出码 0（= `goHome` 内第一条 `flush()` 早于 `stopSession()`）。该路径离屏覆盖不到（stub 的 `stopSession` 不清 `activeRoot`），属 must-fix 3 的代码审查判定，开发档逐条自评 |
| 缩放常量单一来源 | `grep -rn "0\.5\|MAX_SCALE\|DEFAULT_SCALE" pix/src/renderer/stores/reader-state-store.ts pix/src/renderer/components/workspace/PdfViewer.vue` | 无字面量，只有来自 `reader-store` 的导入符号 |
| 搜索/知识地图/框选零耦合 | `grep -rn "readerState" pix/src/renderer/components/workspace/PdfSearchPanel.vue pix/src/renderer/components/workspace/KnowledgeMap.vue pix/src/renderer/composables/useRegionCapture.ts` | 0 命中 |
| 状态失败不进模板 | `grep -rn "degraded" pix/src/renderer/components pix/src/renderer/pages` | 0 命中 |
| 无 `any` / 无内联动态导入 | `grep -rn ": any\|as any\|await import(\|import(" pix/src/main/reader-state-store.ts pix/src/renderer/stores/reader-state-store.ts` | 0 命中 |

### 6.4 主进程数据面的离线烟测（A 面，临时目录，用完即删）

`ui-shot` 的 stub 代替不了主进程分支（`corrupt`/`read-failed`/`write-failed`/裁剪/`lastDocPath` 交叉过滤都在主进程）。A 面用一个临时脚本覆盖，不新增仓库文件、不跑 `npm run build`：

```bash
# 1) 只编译两个叶子模块到临时目录（不是构建：单文件 tsc，输出到 %TEMP%）
cd pix && ./node_modules/.bin/tsc --outDir "$TMP/pix-r6-state" --module commonjs --target es2022 \
  --moduleResolution node --skipLibCheck --strict src/main/reader-state-store.ts src/main/library-root.ts
# 2) 临时脚本（写到 $TMP，运行后删除）依次断言：
#    ENOENT→missing+空模型；截断 JSON→corrupt；version:2→version-unsupported；
#    单条目 page:0 / scale:9 / 键 "../x.pdf" 被丢、其余保留；
#    lastDocPath="../escape.pdf" 与「有效但 documents 无该键」→ 都按无记录（模型里 lastDocPath === null）；
#    save：只改目标条目 + lastDocPath，另一条目字节不变；
#    用 mkdirSync(stateFile) 冒充目录 → 读得 read-failed → save 返回 read-failed 且目录仍在（MF2 的硬证据）；
#    写只读目标（或把 .tmp 换成目录）→ write-failed 且原文件字节与 mtime 不变。
```

---

## 7. 开发分工（白名单，两侧文件不得重叠）

**A 面（契约与数据面）**：`pix/src/shared/types.ts`、`pix/src/main/reader-state-store.ts`（新建）、`pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`。
交付定义：§1.1–§1.4 全部契约按本档字面量落地（含 §1.2 的 no-root 静默语义：`degraded:false`、不记 warn、不写盘）；`npm run check` 0 error；§6.4 离线烟测全绿（含 `read-failed` 拒写）。

**B 面（UI 面）**：`pix/src/renderer/stores/reader-state-store.ts`（新建）、`pix/src/renderer/stores/reader-store.ts`、`pix/src/renderer/components/workspace/PdfViewer.vue`、`pix/src/renderer/components/workspace/ReaderPanel.vue`、`pix/src/renderer/components/workspace/LibraryPanel.vue`、`pix/src/renderer/pages/WorkspacePage.vue`、`pix/scripts/ui-shot.mjs`。
交付定义：§1.5–§1.7 + §3 全部机制落地（含 §3.5 安全点 b：`goHome` 第一条语句 = `flush()`）；`npm run check` 0 error；§6.2 场景与断言自测通过（脚本内 `throw`、退出码 0，含新增的 21b/22d/22e）；既有 00–11 不回归。

**开发档自评清单（两侧共同，逐条写进开发档）**：
1. 状态类失败对用户完全不可见（无面板/toast/notice/chip/禁用态；`degraded` 不进模板）；写入上界与 §0.1 静默例外各写一次。
2. `goHome()` 的 `flush()` 先于 `await rpc.stopSession()`（must-fix 3）：注明该路径离屏覆盖不到（stub 的 `stopSession` 不清 `activeRoot`），并附 §6.3 的 awk 判定结果。
3. 「加载窗口内打开、且此后不再翻页/缩放的文档本轮不写盘」这条代价的用户可见后果（重开落第 1 页）由负责人确认一句。
4. 既有 00–11 断言不依赖 fixture 页数（A 2 页 → 3 页），已由 ui-shot 现状只读 `[data-page="1"]` 核验。
5. `reason` 四条中文短句本轮不冻结（warn 只计数不比对文案）；stub 的 `stopSession` 不清 `activeRoot` 是与真实主进程的差异（§6.1）。

接口约定：两侧只通过 §1.1–§1.3 的类型/通道/方法名交接；**名字以本档为准，A 不改名**（要改先改本档并同步 B）。B 的编译前置是 A 的 `types.ts` + `preload.ts`；A 必须先合入这两处的类型面，B 才能落 typecheck。B 不得改 A 的文件，A 不得改 B 的文件；`ui-shot.mjs` 的 stub 语义由 B 按 §1.2/§1.4/§6.1 实现（stub 只需覆盖可判定的子集：读-改-写、merge、失败注入、调用计数）。

---

## 8. 需求回退建议（本档已按建议口径落地，需求档若不同意请回改需求）

1. **N27 §0.2.4 / N32 验收 4 的「真实关窗人工走查」**：与「只能用三种证据判定」冲突 → 建议降级为**第 4 类证据并限定范围**（仅开发档记录，不作判定依据）+ 本档 §0 修订 1 的两条可判定项。理由：离屏脚本无法复现真实 `window.close()`，且 `before-quit` 阶段窗口已不存在（§3.7）。
2. **N31 验收 6「1.1 缩放下重跑既有场景」**：`ui-shot.mjs` 无搜索/知识地图/框选场景 → 建议收窄为「离屏翻页 + 摘录链路」（`22b`）+「三条链路零耦合的代码审查」（§0 修订 2）。理由：新增三个缩放场景超出本轮取证面预算，而这三条链路只读 `readerStore.scale`，本轮未改其语义。
3. **N28 验收 2 / N29 验收 2 的「第 3 / 3 页」**：依赖 fixture 页数 → 本档选择**把 A 的 fixture 冻结为 3 页**（几何不变，B 保持 2 页），并据此重写全部数字断言（§6.1/§6.2）。若负责人不接受改 fixture，则全部断言回落为「第 2 / 2 页」且 N27 验收 2 的「30 次变化」改用 prev/next 交替点击（本档已给出该替代序列，两条路都可判）。
4. **N26 验收 4 的「diff 剩余条目字节相同」**：需补一句「其它条目字段一字不动、序列化格式统一（2 空格缩进 + 末尾换行）」；手工改过格式的文件在首次写入后会被规范化（属期望行为）。
5. **N27「有效变化」定义**：需求原文缺 must-fix 3 的两条（加载完成前不落盘、复位值不入快照）→ 建议把这**两条**写进需求档 N27，否则实现者会按字面「值比较」实现并写出第 3 页→1 的错值。
6. **N29 验收 5 措辞**：「绝对路径指向不存在文件」建议改为「相对路径解析后不存在或非文件」（与主进程 `lastDocPath` 过滤口径一致）。
7. **N30 验收 6 的 `scrollWidth <= clientWidth`**：建议补「同时判 `.tree-row` 无横向溢出；该断言只在 fixture 的短文件名下成立，长文件名截断属期望」。
8. **非 PDF 不落盘（N27 验收 7）⇒ `lastDocPath` 只指向最后一次读的 PDF**：请确认这是期望语义；若希望续读入口也能指向 md/txt，需要同时改 N27 验收 7 与状态文件范围。

---

## 定稿修订（R6）

> 上游：`docs/pm/R6-review.md` 的设计评审 must-fix 1–7。本节把 7 条逐条消解为可开工契约，并**就地修改**主文中与修订后契约不一致的正文（改动点见下表最后一列）。
> 结论：**7 条全部采纳，没有「不采纳」项**；其中两条评审给了二选一，本档各选定一条，被放弃的另一条写在 §R2。

### R1 逐条处置表（must-fix 1–7）

| # | 评审 must-fix | 结论 | 落在本档哪一节（已就地改） | 改成了什么（可判定） |
| --- | --- | --- | --- | --- |
| 1 | §3.2 ② 的键域写错：`documents` 的键是工作区相对路径比较键，`docPathKey(absPath)` 是绝对路径键 ⇒ 恒不命中、`requestRestore` 从不登记 | 采纳 | §1.5（`documents` / `progressPageFor` 行 + 新增 `requestRestoreFor` 行）、§1.6、§3.2 ①② 与笔记分支、§1.7 | 恢复意图的唯一登记点收拢为 `reader-state-store.requestRestoreFor(absPath)`：内部 `key = currentDocKey(absPath, rootDir)`，`key` 非 null 且 `documents[key]` 存在才 `readerStore.requestRestore(absPath, documents[key].page, documents[key].scale)`，否则**不登记**；`openDocumentFromLibrary` ① 的同路径判定改用 `docPathKey` 比较键（不用 `===`）。判定：`grep -rn "docPathKey(" pix/src/renderer/stores/reader-state-store.ts` = 0 命中（store 内的文档身份一律走 `currentDocKey`；`docPathKey` 只允许用于「绝对路径 vs 绝对路径」的同一性判定，即 `WorkspacePage` 的 ① 与 `onOpenNote` 两处） |
| 2 | §3.3 的 `ready` 闸门 + gate 3 组合会让加载窗口内打开的文档整程不落盘（`settledKey` 未置 ⇒ 后续 `noteChange` 全被拒） | 采纳 | §1.5（`ready` / `noteLanding` 行）、§3.1 状态机、§3.3 | `noteLanding` 拆两段：**认领无条件**（`currentDocKey` 非 null 即 `settledKey = key`，不受 `ready` 约束）+ **快照受 `ready` 约束**；`noteChange` 四条闸门不变（含 `pageCount > 0`）。判据：加载窗口内打开文档 → 加载完成后再翻一页 → 必须写盘 |
| 3 | 安全点 b 顺序：`flush()` 必须是 `goHome()` 第一条语句，先于 `await rpc.stopSession()`（否则 `clearLibraryRoot()` 后 save 返 `no-root` 静默丢弃最后现场） | 采纳 | §2.2（WorkspacePage 行）、§3.5 安全点 b、§6.3（新增代码审查行）、§7（自评清单 2） | 写死顺序 + 依据（`session-stop` handler 末尾 `clearLibraryRoot()`，`ipc-handlers.ts:304`）+ 「离屏覆盖不到」声明（stub 的 `stopSession` 不清 `activeRoot`）。判定：§6.3 的 awk 命令退出码 0（该路径不放进 §6.2） |
| 4 | 笔记跳转的现场语义未闭合（§3.2 只 `requestJump` vs §1.7「缩放永远取目标文档恢复值」），且 N28 验收 3 后半无场景 | 采纳（选「`onOpenNote` 同调 `requestRestoreFor`」） | §1.7（新增「三个入口同一条恢复路径」）、§2.2（WorkspacePage 行）、§3.2 笔记分支、§6.2 新增 22d/22e | 笔记跳转 = `requestJump(target, note.page)`（位置）+ `requestRestoreFor(target)`（缩放取目标文档恢复值，无记录回落 `DEFAULT_SCALE`；同文档时 `requestRestore` 按既有规则丢弃）。§6.2 增 22d（目标无记录 → 第 2 / 2 页 + 100%）与 22e（目标记录 `{page:1,scale:1.5}` → 第 2 / 2 页 + 150%，同时判别「跳转页覆盖恢复页」与「缩放取目标文档恢复值」） |
| 5 | §6.2 场景 23 的 `[reader-state]` warn 行数断言不可判定（同一渲染层会话已累计 warn）+ stub 的降级面未定义 | 采纳 | §6.1（stub/fixture 冻结）、§6.2（新增命令 4 + 20b/23 行） | 所有 warn 断言改**增量基线**（`rendererLogs` 里 `[reader-state]` 计数之差）；写死 stub 的 `degraded`/`reason` 只来自「按 `activeRoot` 真读 + 真解析文件」（20b = 文件不存在 → `missing`；23 = 脚本写截断 JSON → `corrupt`）；`setReaderState` = 写同一个文件（与读同一来源，**无优先级问题**）；条目裁剪在 stub 内实现（新增 21b 判别）；`setReaderStateFailure` 只影响 save 返回 |
| 6 | §6.3 两条判定命令不可用/恒真：(a) `grep -rn "reader-state" src/renderer` 必然被四个消费文件的 `import` 命中；(b) `setScale` 行号 < `getDocument(` 被 `zoomBy(:718)` 恒真 | 采纳 | §6.3 | (a) 改判 `grep -rn "\[reader-state\]" pix/src/renderer` → 命中**文件唯一** = `stores/reader-state-store.ts`（warn 文案可有多行，不断言行数）；(b) 改为 awk 判定「`loadPdf` 区间内存在 `readerStore.setScale(` 且早于 `getDocument(`」（`zoomBy` 不再参与）。不恒真已实测：两条 awk（`loadPdf` 与 `goHome`）在当前代码上都返回 `exit 1`（调用尚未实现时应当失败），`grep -rn "\[reader-state\]"` 现在 0 命中（实现后必须恰命中 store 一个文件） |
| 7 | §6.2 场景 24 的 B 侧断言可能空跑；fixture/stub 面需冻结 | 采纳 | §6.1、§6.2（场景 24 行） | 先断言 B 树里 sample-paper 行**存在**（防空跑）再断言无徽标；冻结 `recentProjects = [A, B]`（A 在前，B 按 `:title="pix-r5-library-b"` 定位）、`libraryList(dir)` 两套树（B 树只有 sample-paper 一行）、**stub 的 notes 面仍只认 A**；A 侧先落盘 page 2 再切 B，回 A 断言「第 2 页」+ 树徽标恢复；fixture 页数变更不影响既有 00–11（已核验无 `.page-label` 依赖） |

### R2 不采纳与理由 / 替代方案（评审给了二选一的两条 + 一条防误读）

1. **must-fix 4 的另一选项「声明笔记跳转一律回落 `DEFAULT_SCALE`」——放弃。** 理由：(a) 它与 §1.7「缩放独立于位置优先级：永远取目标文档的恢复值」直接冲突，而该句是 N31 验收 5 的落地形式（对笔记入口同样成立）；(b) 它会在渲染层留下第二个缩放取值来源（`PdfViewer` 的 `restore ? restore.scale : DEFAULT_SCALE` 之外还要为笔记路径特判），与本轮「缩放只有一处来源」的纪律相抵触；(c) 选中的方案不新增机制：`requestRestoreFor` 本就是树行/续读入口共用的登记点，笔记跳转复用它，`onOpenNote` 只多一行调用，不新增第二套落页逻辑（N28 验收 8 仍成立）。
2. **must-fix 6(b) 的另一选项「直接降级为人工代码审查项」——放弃这个宽口径**，改为「awk 自动判定 + 代码审查复核」：自动判定能复跑（`exit 0`），人工审查只作兜底；命令已在当前代码上实测 `exit 1`，不会恒真。同理 (a) 保留一条可复跑的 grep，而不是改成「看一眼 store」。
3. **must-fix 5 的「stub 不实现条目裁剪」——放弃。** 理由：21b 需要裁剪才能判别；stub 与主进程在裁剪口径上分叉会让 20–24 失去对主进程行为的代表性（§7 的接口约定要求 stub 按 §1.4 实现）。
4. **must-fix 1 的「让 `documents` 改用绝对路径键」——不采纳**（评审未提，但不写成「不采纳」会被误读）：状态文件的键域是磁盘格式（§1.4 冻结、`lastDocPath` 同域），改键域会推翻 N26 验收与全部数字断言；正确修法是渲染层查询走相对比较键。

### R3 同步修正的次级项与正文口径（评审 §3 中已随本次修订闭合的项）

- `noteChange` 闸门 3/4 由字符串相等改为比较键（`currentDocKey`），与 `documents`/`settledKey` 同域；闸门 3 **显式拒 `key === null`**（否则「两边都是 null」会假通过）。（评审 §3.3）
- §1.2 明写 no-root 分支：`degraded:false`、不记 warn、不写盘（对上 N27 验收 8 的「静默」）。（评审 §3.1）
- 四条 `reason` 的中文短句本轮**不冻结**，warn 断言只计数、不比对文案（§6.2 命令 4）。（评审 §3.2）
- 「加载窗口内打开、且此后不再翻页/缩放的文档本轮不写盘」的用户可见后果（重开落第 1 页）列入开发档自评、由负责人确认（§7 自评清单 3）。（评审 §3.5）

### R4 不覆盖声明（本轮取证面到此为止，不要在实现期临时扩面）

- 安全点 b 的 `no-root` 竞态（`flush` 与 `stopSession` 的相对顺序）在离屏脚本里**无法**构造：stub 的 `stopSession` 按 §6.1 明确不清 `activeRoot`。判定只有「§6.3 的 awk 代码审查行 + 开发档自评」两类，§6.2 不新增这一场景。
- 真实 `window.close()` 仍为第 4 类证据（§0 修订 1），本节不改该口径。
- B 面开工顺序（评审 §6 的落地建议）：先按 §6.1 冻结 fixture 与 stub 语义、跑通 20–24 的骨架（截图 + 断言行就位），再回填 UI；A 面先只落 `types.ts` + `preload.ts` 解 B 的编译前置。
