# R6 开发档 · 阅读现场（N26–N34）

> 上游：`docs/pm/R6-design.md`（定稿，契约以此为准）、`docs/pm/R6-req.md`、`docs/pm/R6-review.md`、`docs/pm/PRD-V0.4.md`。
> 本档只记录实现事实：改动文件、关键决策与偏差、真实命令与真实输出、逐条自评、未验证事项。
> 分工：**开发 A（契约与数据面）** 见下；开发 B（UI 面）另行追加「## 开发 B」一节。

---

## 开发 A（契约与数据面）

### A.1 改动文件清单

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `pix/src/shared/types.ts` | 修改（+50 行） | 新增「Reader State Types (workspace .pix-read/reader-state.json)」段，紧随 Reader Notes Types 之后；7 个类型与设计档 §1.1 逐字一致（`ReaderDocState` / `ReaderStateFile` / `ReaderStateErrorCode` / `ReaderStateDegradeReason` / `ReaderStateSaveDraft` / `ReaderStateLoadResult` / `ReaderStateSaveResult`）；既有类型零改动 |
| `pix/src/main/reader-state-store.ts` | **新建**（252 行，2 个导出） | 主进程唯一写者：读侧原因表 + 条目级裁剪 + `lastDocPath` 交叉过滤；写侧只改目标条目 + `lastDocPath`，`read-failed` 拒写；自带 `mkdir → tmp → renameSync` 原子写；路径从 `getLibraryRoot()` 派生；不 import electron / notes-store，同一函数体内无 await |
| `pix/src/main/ipc-handlers.ts` | 修改（+36 行） | notes 段之后新增「Reader state」段：`isReaderStateDraft` 形状守卫、`invalidReaderStateInput()`、`reader-state-load` / `reader-state-save` 两条 `ipcMain.handle`；notes / library 段零改动 |
| `pix/src/main/preload.ts` | 修改（+11 行） | `PixApi` 增 `readerStateLoad` / `readerStateSave` + 两条 `ipcRenderer.invoke` 实现；类型走顶层 `import type`；既有 API 名与语义不变，未新增同步通道 |

白名单外零改动：`git status --short` 只有上述四文件（A 面新建件为未跟踪），另加流水线既有的 `docs/pm/*` 未跟踪档；`pix/src/main/index.ts`、`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、`pix/scripts/ui-shot.mjs` 与全部渲染层文件未被触碰。

### A.2 关键实现决策与偏差

按设计档 §1.1–§1.4 逐条落地；以下是设计档没写清、由 A 面按「最小惊讶 + 与仓库既有风格一致」补齐的点，以及有意偏差（截至 A 面完成，**契约零偏差**，只有补充决策）。

| # | 决策 | 依据/理由 |
| --- | --- | --- |
| D1 | `reader-state-store.ts` 内自带 `docPathKey`（小写 + 正斜杠 + 去尾斜杠），与 `notes-store.docPathKey`、渲染层 `utils/notes-path.docPathKey` 同实现；不复用（notes 的实现未导出，且不变量 2 禁止两套策略互相渗透） | 设计档 §1.4「键 = 小写 + 正斜杠」；同一实现保证主进程与渲染层的键域一致 |
| D2 | 读盘按 `JSON.stringify(file, null, 2) + "\n"`，BOM 先剥（`raw.replace(/^\uFEFF/, "")`）再 `JSON.parse` | 设计档只冻结格式；BOM 剥离与 `notes-store.readNotesFile`、`library-read-text` 同口径，否则手工编辑过的 BOM 文件会被判 `corrupt` |
| D3 | 读侧硬错误（`corrupt` / `version-unsupported` / `read-failed`）只回报原因，**从不改写文件**；`ENOENT` 只回报 `missing`，不创建文件 | 设计档 §1.4「读不改写」；烟测 1 显式断言 `load` 后文件仍不存在 |
| D4 | `lastDocPath` 交叉过滤用 `statSync(resolved).isFile()`（try/catch 兜住不存在与不可访问） | 设计档 §1.4「解析后不存在或非文件 → 按无记录」；目录（如 `lastDocPath:"archive"`）同样按无记录 |
| D5 | 写侧顺序：形状兜底 → 相对化（`outside`）→ 取值域（`invalid-input`）→ 读文件（`read-failed` 拒写）→ 合并 → 原子写（`write-failed`） | 设计档 §1.2「域校验全在 store 内」+ §1.4 写侧语义；`read-failed` 检查先于任何写动作，保证原文件字节不变（MF2） |
| D6 | store 内保留一层形状兜底（`docFilePath` 非空 string、`page`/`scale` 有限数），与 handler 守卫同形 | handler 之外（如将来直接调用）传入非 string 会让 `resolve()` 抛 TypeError；兜底返回 `invalid-input` 而不是抛异常，符合「失败必须真实存在且可判定」 |
| D7 | 失败日志：load 降级恰一行 `console.warn("[reader-state] …")`；save 的 `outside`/`invalid-input`/`read-failed`/`write-failed` 各一行；**`no-root` 静默**（load `degraded:false`、不记 warn、不写盘） | 设计档 §1.1「`degraded ⇔ 恰一行 warn`」（读侧）、§4 表（save 内部读失败一行 warn）、§1.2（no-root 静默）。同一操作只走一条路径，不叠加 |
| D8 | 所有失败返回 `state` 恒为空状态（`{version:1,lastDocPath:null,documents:{}}`）；`ipc-handlers.ts` 的 `invalidReaderStateInput()` 用同形字面量构造（不改 store 导出面） | 设计档 §1.1「失败时 state 恒为空状态」+ §1.2「与 `invalidNotesInput()` 同形」；store 只导出 `loadReaderState` / `saveReaderState`（上限 2 个导出） |
| D9 | load 降级时 `success: true` + `reason` + `error`（中文短句），不设 `code`；无根时 `success:false` + `code:"no-root"` + `degraded:false` + `filePath:""` | 设计档 §1.1/§1.2 逐字 |
| D10 | 四条 `reason` 的中文短句写在 `DEGRADE_MESSAGES`（`missing`「阅读状态文件不存在（尚无阅读现场记录）」等） | 评审次级项 2 / §6.2 命令 4：本轮**不冻结**文案，warn 只计数不比对；文案只进日志与结果 `error` 字段，不进 UI |

不变量自检（A 面）：不 import `notes-store.ts`；不 import electron；无备份文件、无逃生口、无校验和；同一函数体内无 `await`（`grep -n "await"` 只命中文件头注释第 5 行）；导出恰好 2 个；无 `any` / 无内联动态 import；路径只有一个派生点 `stateFilePath()`（`join(getLibraryRoot(), ".pix-read", "reader-state.json")`）。

### A.3 逐条自评

**设计档 §7「开发档自评清单」中属于 A 面的两条**：

1. **状态类失败对用户完全不可见**：A 面不含任何 UI 代码，失败只经 IPC 返回值与主进程一行日志反映；新增代码不注册任何 toast/notice/弹窗/禁用态所需的通道，也不引入模板字段。写入上界：A 面**不自发写盘**——`saveReaderState` 只在渲染层 IPC 调用时执行（无定时器、无轮询、无退出钩子、无 `before-quit` 拉取）；单次写盘 = 一个小 JSON 的整文件重写（本面最坏情况为「读+合并+rename」一次）。§0.1 静默例外（无根）已在 D7 落实：`no-root` 不记 warn、不写盘。
2. **`reason` 四条中文短句本轮不冻结**：已按 D10 落实（只计数、不比对文案）；warn 行结构统一为 `[reader-state] ` 前缀 + 短句，可供将来冻结。

**本任务硬性要求的逐条自评**：

| 要求 | 结论 | 证据 |
| --- | --- | --- |
| 契约与设计档逐字一致（类型名/通道名/字段/返回结构/错误码） | 通过 | `types.ts` 新增段与 §1.1 代码块逐字一致（含注释）；通道名为 `reader-state-load` / `reader-state-save`（§1.2）；`PixApi` 方法名 `readerStateLoad` / `readerStateSave`（§1.3）；错误码表 = §1.2 五码，中文错误逐字（`尚未选择资料库根目录` / `该文档不在当前资料库内` / `阅读状态数据不合法` / `阅读状态文件读取失败（未写入）` / `阅读状态写入失败`） |
| 输入校验（非法入参返回中文错误 + 明确错误码） | 通过 | handler `isReaderStateDraft`（形状）→ `invalidReaderStateInput()`（`invalid-input` + 「阅读状态数据不合法」）；store 内 `invalid-input`（page 非 ≥1 整数 / scale 非 [0.5,3] 有限数 / 空路径）、`outside`（越界）——烟测 11 覆盖 6 条非法入参且断言文件未被改写 |
| 越界路径拒绝 | 通过 | `toRelativeDocPath` 走 `isLibraryFilePath()`（同 notes-store 口径：resolve + 包含判定 + realpath 复核）；烟测 11 断言 `outside` + 原文件字节不变 |
| 目录不存在时按设计创建 | 通过 | `writeFileAtomic` 内 `mkdirSync(dirname(target), { recursive: true })`；烟测 13 先删掉 `.pix-read/` 再 save，断言重建成功 |
| 失败路径真实存在（不许 try/catch 吞掉后静默返回成功） | 通过 | 烟测 9（`read-failed` 拒写、目录仍在、不留 tmp）、烟测 10（`write-failed`、原文件字节与 mtime 不变）、烟测 12（`no-root`）；所有失败分支都返回显式 `code`+`error`，无「catch 后返回 success」路径 |
| 中文错误落到位 | 通过 | `ERROR_MESSAGES`（5 码）+ `DEGRADE_MESSAGES`（4 reason），全部中文；handler 的两条中文错误与 §1.2 逐字 |
| 工程门 `npm run check` 0 error | 通过 | 见 A.4（改动前基线 0 error，改动后 0 error） |
| 白名单外零改动 | 通过 | 见 A.1 / A.4 的 `git status --short` |

**设计档 §6.4 离线烟测清单逐条**（13 项全绿，见 A.4）：ENOENT→`missing`+空模型（1）；截断 JSON→`corrupt`（2）；`version:2`→`version-unsupported`（3）；顶层数组 / `documents` 非对象→`corrupt`（4）；条目级裁剪（`page:0`、`scale:9`、`"../escape.pdf"`、`"archive\\older-paper.pdf"`、非归一化键 `MixedCase.pdf`、绝对键、`null` 条目被丢；`updatedAt` 非法保留条目记 0）（5）；`lastDocPath` 越界 / 绝对 / 指向目录 / 不存在 / 无对应条目 → 均按无记录（6）；save 只改目标条目 + `lastDocPath`、另一条目原始字节不变、2 空格缩进 + 末尾换行、键顺序沿用读入顺序（7）；`missing`/`corrupt`/`version-unsupported` 允许空模型重建且新条目追加末尾（8）；**MF2 硬证据**：`mkdirSync(stateFile)` 冒充目录 → 读 `read-failed` → save 返回 `read-failed` 且目录仍在、不留 tmp（9）；`.tmp` 被目录占用 → `write-failed` 且原文件字节与 mtime 不变（10）；越界/越域入参不写盘（11）；无根静默（12）；原子写自愈（13）。

### A.4 真实命令与真实输出

**命令 1（唯一工程门，改动前基线与改动后各跑一次）**

```text
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
EXIT=0
```

改动前基线同为 `EXIT=0`；改动后最后一次运行输出同上（无 error 行），退出码 0。

**命令 2（§6.4 离线烟测；临时脚本写在 `%TEMP%`，运行后已删除）**

```text
$ cd pix && ./node_modules/.bin/tsc --outDir /tmp/pix-r6-state --module commonjs --target es2022 \
    --moduleResolution node --skipLibCheck --strict src/main/reader-state-store.ts src/main/library-root.ts
TSC_EXIT=0
/tmp/pix-r6-state/main/library-root.js
/tmp/pix-r6-state/main/reader-state-store.js
/tmp/pix-r6-state/shared/types.js

$ node %TEMP%/pix-r6-smoke.cjs %TEMP%/pix-r6-state/main
OK 13 checks
  - 1) ENOENT -> missing + 空模型 + 恰一行 warn + 不写盘
  - 2) 截断 JSON -> corrupt + 空模型 + 恰一行 warn
  - 3) version:2 -> version-unsupported + 空模型 + 恰一行 warn
  - 4) 顶层数组 / documents 非对象 -> corrupt
  - 5) 条目级裁剪 + lastDocPath 交叉过滤
  - 6) lastDocPath 越界 / 有效但无条目 / 指向目录 -> 均按无记录
  - 7) save：只改目标条目 + lastDocPath，其它条目一字不动
  - 8) save：新条目追加在末尾 + 空模型重建（missing / corrupt / version-unsupported 允许覆盖）
  - 9) MF2：save 内部读失败（EISDIR）-> read-failed，拒写且目录仍在
  - 10) write-failed：.tmp 被目录占用 -> 失败且原文件字节与 mtime 不变
  - 11) save 入参：越界 -> outside；page/scale 越域 -> invalid-input；均不写盘
  - 12) 无根：load/save 均 no-root、静默、不写盘
  - 13) 原子写：写入后目录被删可自愈（mkdir recursive）
warn 总数=13（全部以 [reader-state] 开头：true）
SMOKE_EXIT=0
```

**命令 3（§6.3 只读核对点，A 面相关行）**

```text
$ git status --short
 M pix/src/main/ipc-handlers.ts
 M pix/src/main/preload.ts
 M pix/src/shared/types.ts
?? docs/pm/PRD-V0.4.md            （流水线既有，非本次改动）
?? docs/pm/R6-design.md           （流水线既有，非本次改动）
?? docs/pm/R6-req.md              （流水线既有，非本次改动）
?? docs/pm/R6-review.md           （流水线既有，非本次改动）
?? pix/src/main/reader-state-store.ts

$ git diff --stat
 pix/src/main/ipc-handlers.ts | 36 +++++++++++++++++++++++++++++++
 pix/src/main/preload.ts      | 11 ++++++++++
 pix/src/shared/types.ts      | 50 ++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 97 insertions(+)

$ grep -rn "sendSync" pix/src/main pix/src/renderer
（0 命中）

$ grep -n "reader-state" pix/src/main/ipc-handlers.ts pix/src/main/preload.ts pix/src/main/reader-state-store.ts
ipc-handlers.ts:22:import { loadReaderState, saveReaderState } from "./reader-state-store.js";
ipc-handlers.ts:268:/** 守卫只做形状；相对化、越界、取值域与原子写都在 reader-state-store 内完成。 */
ipc-handlers.ts:482:  // Reader state (workspace .pix-read/reader-state.json)
ipc-handlers.ts:485:  ipcMain.handle("reader-state-load", () => loadReaderState());
ipc-handlers.ts:487:  ipcMain.handle("reader-state-save", (_event, draft: unknown) =>
preload.ts:76:  // Reader state (workspace .pix-read/reader-state.json)
preload.ts:164:  readerStateLoad: () => ipcRenderer.invoke("reader-state-load") as Promise<ReaderStateLoadResult>,
preload.ts:166:    ipcRenderer.invoke("reader-state-save", draft) as Promise<ReaderStateSaveResult>,
reader-state-store.ts:2: * Reader state storage: <workspace root>/.pix-read/reader-state.json
reader-state-store.ts:26:const STATE_FILE_NAME = "reader-state.json";
reader-state-store.ts:54:  console.warn(`[reader-state] ${message}`);

$ grep -rn ": any\|as any\|await import(\|import(" pix/src/main/reader-state-store.ts
（0 命中，exit 1）

$ grep -n "before-quit" pix/src/main/index.ts
（与改前一致：A 面未触碰 index.ts）
```

### A.5 未验证事项

1. **离屏取证（§6.2 场景 20–24）未跑**：`ui-shot.mjs` 属 B 面白名单且当前尚未落地 `readerState*` stub；A 面按分工不产物出离屏证据。stub 与主进程读侧（原因表、裁剪、`lastDocPath` 交叉过滤）的一致性由 B 面按 §1.4/§6.1 实现并判定。
2. **真实 Electron 运行时往返未验证**：禁止 `npm run build` / `npm run dev`；preload 的正确性由 `tsc -p tsconfig.preload.json --noEmit`（0 error）+ 通道名/方法名与 §1.2/§1.3 逐字一致判定，未做真实窗口内的 IPC 实测。
3. **Windows 关窗/最小化路径（`pagehide` / `visibilitychange`）不属 A 面**：安全点 b 的 `no-root` 竞态与 §3.7 的退出时序由 B 面 + 代码审查判定。
4. **仅单进程内同步读-改-写**：并发多窗口同时 save 的交错未构造（本仓库单窗口；同步 fs 保证同一进程内的交错不丢写）。
5. **烟测的编译口径**：用单文件 `tsc --outDir`（非 `npm run build`）编译两个叶子模块，产物仅用于分支判定；`write-failed` 的制造方式选「`.tmp` 被目录占用」而不是只读目录（Windows 上对只读文件的 `renameSync` 行为不稳定，目录占用是确定性拒写）。
6. **主进程 warn 的实际落点未验证**（终端/开发者控制台）：只断言了「一条失败恰一行、统一 `[reader-state] ` 前缀」。

---

## 开发 B（UI 与交互面）

### B.1 改动文件清单

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `pix/src/renderer/stores/reader-state-store.ts` | **新建**（257 行） | `defineStore("readerState")`：`documents`/`lastDoc`/`ready`/`degraded` 四个 ref + `loadReaderState`/`progressPageFor`/`requestRestoreFor`/`noteLanding`/`noteChange`/`flush`/`resetState` 七个动作；内部 `loadSeq`/`debounceTimer`/`snapshot`/`committed`/`settledKey` + `DEBOUNCE_MS = 600`；唯一 `console.warn("[reader-state] …")` 消费点；不 import electron、不拼存储路径、无 UI 状态字段 |
| `pix/src/renderer/stores/reader-store.ts` | 修改（+32 / −3） | 新增 `pendingRestore` 与 `requestRestore` / `takeRestore`（与 `pendingJump` 三件套逐字同构，`openDocument` 同款清理）；导出 `MIN_SCALE` / `MAX_SCALE` / `DEFAULT_SCALE`；既有字段语义零改动 |
| `pix/src/renderer/components/workspace/PdfViewer.vue` | 修改（+25 / −6） | `loadPdf` 序言（`try` 之外、`getDocument` 之前）一次消费 `takePendingJump` + `takeRestore` 并 `setScale(restore ? restore.scale : DEFAULT_SCALE)`；唯一初始落页点 `jump > restore > 1` + `noteLanding`；新增 `watch(() => [page, scale])` 观察点（只调 `noteChange`）；删除 catch 段里的 `takePendingJump` |
| `pix/src/renderer/components/workspace/ReaderPanel.vue` | 修改（+52 / −1） | 空态续读入口 `.reader-resume`（`emit("open-document", absPath)`）；错误空态专用 class `reader-empty-error`；`filePath` watcher 中 `flush()` 先于 `openDocument(path)` |
| `pix/src/renderer/components/workspace/LibraryPanel.vue` | 修改（+30） | PDF 行 `.row-progress` 徽标（`progressMap` 读 store，键用 `row.node.path`）+ `min-width`/`flex-shrink` 两条样式；`flattenVisible`/`expanded`/懒加载/toggle/reload 零改动 |
| `pix/src/renderer/pages/WorkspacePage.vue` | 修改（+39 / −2） | `resetState()`×3（onMounted 加载前 / onUnmounted / goHome）；`flush()` 接线（`goHome` 第一条语句、`onUnmounted` 第一条、`visibilitychange(document.hidden)`、`pagehide`）；`openDocumentFromLibrary` 编排 + `@open-document`；`onOpenNote` 增 `requestRestoreFor(target)` |
| `pix/scripts/ui-shot.mjs` | 修改（+841 / −6） | fixture 冻结（A 3 页、B 工作区 `library-b`、两工作区起始无 `reader-state.json`）；stub 补 `readerStateLoad`/`readerStateSave` + `__pixStub` 控制口；新增 `runReaderStateScenarios`（`20-*` 场景，独立于既有 `runScenario`，既有函数零改动）；`rendererLogs` 采集 |

白名单外零改动：`git status --short` 只多出上述 6 个文件（另一个新建件为 A 面的 `src/main/reader-state-store.ts`）；A 面 4 个文件与 `packages/**`、`package.json`、`package-lock.json`、`pix/build/**` 未被触碰。`src/renderer/utils/notes-path.ts` 与 `stores/{notes,project}-store.ts` 也零改动（B 只读它们的导出）。

### B.2 关键实现决策与偏差

契约零偏差（类型名/通道名/字段名/错误码沿用 A 面交付，未发现需要回报的契约不足）。以下是设计档没有写清、由 B 面按「最小惊讶 + 与仓库既有风格一致」补齐的点：

| # | 决策 | 依据 / 理由 |
| --- | --- | --- |
| D-B1 | `progressPageFor` 对「当前文档」多一条 `readerStore.pageCount > 0` 守卫 | 加载窗口内 `page = 1` 而映射里是第 3 页，显示「第 1 页」是假进度；与「宁可少显示」同向，属渲染层细节，不影响 21 的实时值断言（断言发生在文档已加载后） |
| D-B2 | store 内私有 `relativeDocPath(absPath, root)`：先用 `currentDocKey` 取键，再对绝对路径做等长后缀切片，得到原大小写相对路径 | `lastDoc.docPath` 需要原始大小写（展示 + `absoluteDocPath` 回拼），而主进程只在返回值里给 `lastDocPath`；乐观更新必须能从绝对路径派生。仅用于展示/跳转，不参与任何键运算（判定：`grep -c "docPathKey(" reader-state-store.ts` = 0） |
| D-B3 | `loadReaderState` 的 IPC reject 分支：`ready = true` + `degraded = true` + 空模型 + 一行 warn | 失败不得静默（硬性要求）；`ready` 必须置位，否则本轮永不落盘；`degraded` 只是诊断镜像、不进模板 |
| D-B4 | 场景里的项目卡定位改为按 `.v-list-item-title` 文本匹配 | Vuetify 的 `:title` 是 props（渲染为文本节点），**DOM 上不存在 `title` 属性**，设计档 §6.2 写的 `.project-list-item[title="pix-r5-library-b"]` 在本仓库取不到元素；断言目标（B 工作区侧无徽标/无入口）不变，只换定位方式 |
| D-B5 | 场景里的「PDF 就绪」信号用 `.page-label`，不用 `[data-page="1"] .textLayer span` | 落页到第 3 页时第 1 页不在 IntersectionObserver 的渲染窗口内，等它的文字层会假超时；`waitPage(page, count)` 仍逐条断言真实落点 |
| D-B6 | fixture 起始显式删除两个工作区的 `reader-state.json` | 否则上一轮遗留文件让「首启 missing」与 20b 的前置不可复现（实测：第二次运行时起始状态已带上一轮的写入） |
| D-B7 | 额外截图 5 张：`20c-resume-loaded`、`20b-resume-opened`、`24b-back-to-a`（其余 12 张为设计档列的 `20-*`） | 需求 N29 验收 6 明确要「延迟中 / 加载后两张截图」；另两张是点击入口与跨工作区回切的现场证据。设计档只列了 `20-resume-entry` 一张，属增补不是替换 |
| D-B8 | `② 30 次页码变化`用「逐次点击 + 逐次读页码」统计真实变化数，断言 `changes === 30` | 只断言结束页会掩盖 no-op 点击（交替点击下结束页仍可能是 3）；这样「真实变化」与写入上界同时可判 |
| D-B9 | `22c` 的「文件字节不变」基线取在失败注入之后、翻页之前（先 `sleep(800)` 让 22b 的去抖结算完成） | 否则基线里可能还差一次正常写入，字节对比会出现假红 |
| D-B10 | 新增场景放在独立函数 `runReaderStateScenarios`，与既有 `runScenario` 并列 | 既有 00–11 场景函数零改动，避免回归；`SEL` 也未新增键（新场景用字面选择器） |

### B.3 新增场景与断言（`ui-shot.mjs`）

| 场景 | 截图 | 断言（MEASUREMENTS label） |
| --- | --- | --- |
| 20c 续读入口加载中（`setReaderStateDelay(1500)`） | `20c-resume-loading.png`、`20c-resume-loaded.png` | `resume-entry`（loading）：`.reader-resume === null`、`.empty-title` = 「选择左侧文件开始阅读」、无错误态 class；（loaded）入口文本含「第 3 页」 |
| 20 有记录：入口存在 → 点击 | `20-resume-entry.png`、`20b-resume-opened.png` | `resume-entry`（hit）：文本同时含 `sample-paper.pdf` 与「第 3 页」；（after-click）`.page-label` = 「第 3 / 3 页」、`.zoom-label` = 「110%」 |
| 20b 无记录 | `20b-resume-empty.png` | `resume-entry`（no-record）：`.reader-resume === null`、空态文案正常（stub 真解析得 `missing`，渲染层恰一行 warn） |
| 21 树进度（含 page=1024 边界） | `21-tree-progress.png` | `tree-progress`（static）：sample 行「第 3 页」、older 行「第 1024 页」、`reading-notes.md` 行与目录行徽标计数 0、`.row-label` 与 `.tree-row` 的 `scrollWidth <= clientWidth`；（live-page）打开后翻到第 2 页**不等去抖**徽标即「第 2 页」 |
| 21b 条目级裁剪 | `21b-trim-invalid-entry.png` | `tree-progress`（trim）：`page:0` 条目整条被丢（older 行徽标计数 0），合法条目保留 |
| 22 缩放恢复（经树行打开） | `22-scale-restored.png` | `scale-restored`（tree-row）：`.zoom-label` = 「110%」、`.page-label` = 「第 3 / 3 页」、`[data-page="1"]` 宽 655 = `Math.round(595*1.1)` |
| 22b 110% 下翻页 + 摘录 | `22b-scale-excerpt.png` | `scale-restored`（excerptAt110）：「第 2 / 3 页」、当前页文本层 span 数 > 0、`.quick-ask-feedback.is-ok` 出现 |
| 22c 写失败注入 | `22c-throttle-no-ui-change.png` | `reader-state-writes`（save-failure）：页码照常推进、save 被调用且被拒（payload 在案）、`.reader-empty-error === null`、无 `.v-snackbar`/`.notes-notice`、**文件字节不变**；（save-recovered）清注入后再翻页 → +1 且文件页码更新 |
| ①（复用 22 DOM，无独立截图） | — | `reader-state-writes`（restore-no-write）：打开「有记录且值一致」的文档后 2s 内 0 次、再等 1s 仍 0（实测 base=2 → after2s=2 → after3s=2） |
| ②（无独立截图） | — | `reader-state-writes`（thirty-changes）：30 次真实变化、`delta <= 5`（实测 1）、末次 payload page=3、结束页「第 3 / 3 页」 |
| ③（无独立截图） | — | `reader-state-writes`（switch-before-debounce）：末次 payload = A 的相对路径 + page 3 |
| ④（无独立截图） | — | `reader-state-writes`（hidden-pagehide）：`visibilitychange(hidden)` → +1；`pagehide` 后再 dispatch 两次 → 不再增长（实测 1/1/1） |
| ⑤（无独立截图） | — | `reader-state-writes`（non-pdf）：打开 `reading-notes.md` 后 1.5s 内 0 次 save，`lastDocPath` 仍指向 PDF |
| 22d 笔记跳转（目标无记录） | `22d-note-jump.png` | `note-jump`（no-record-target）：「第 2 / 2 页」（越界钳制）+「100%」（缩放不串文档） |
| 22e 笔记跳转（目标有记录） | `22e-note-jump-restored.png` | `note-jump`（recorded-target）：「第 2 / 2 页」（跳转页覆盖恢复页）+「150%」（缩放取目标文档恢复值） |
| 23 损坏状态 | `23-corrupt-state-reading.png` | `reader-state-degrade`（corrupt-empty）：无 `reader-empty-error`、空态无重试按钮、无续读入口、树徽标计数 0、空态文案正常；（rebuilt）翻到第 3 页后文件重建为 `version:1` + `lastDocPath:"sample-paper.pdf"` + `page:3`；`reader-state-console`（corrupt）：`[reader-state]` warn 增量 = 1 |
| 24 跨工作区切换 | `24-workspace-switch.png`、`24b-back-to-a.png` | `workspace-switch`（a-left-home）：goHome 的 flush 已把 page 2 落进 A 的文件；（b-workspace）：B 树中 sample-paper 行**存在**、该行徽标计数 0、无续读入口、空态文案正常；（back-to-a）：入口「继续阅读：sample-paper.pdf · 第 2 页」、树徽标「第 2 页」 |

### B.4 真实命令与真实输出

**命令 1（唯一工程门）**

```text
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
CHECK_EXIT=0
```

改动前后均为 0 error（无任何 error 行）。

**命令 2（离屏取证，最后一次运行即本档所引用的那次）**

```text
$ cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
[ui-shot] fixture 资料库：C:\Users\86157\AppData\Local\Temp\pix-r5\library
[ui-shot] 截图目录：C:\Users\86157\AppData\Local\Temp\pix-r5\shots
[ui-shot] vite dev server 就绪：http://localhost:5199/
[ui-shot] 渲染层已加载（dpr=1, 视口=1600x1000），开始场景
...（00–11 既有场景全部通过，28 张截图不变）
[ui-shot] 20c 续读入口加载中（setReaderStateDelay(1500)）  → 20c-resume-loading.png / 20c-resume-loaded.png
[ui-shot] 20 续读入口存在且点击后落第 3 页 / 110%           → 20-resume-entry.png / 20b-resume-opened.png
[ui-shot] 20b 无记录：入口不存在                            → 20b-resume-empty.png
[ui-shot] 21 树进度徽标（含 page=1024 边界）                 → 21-tree-progress.png
[ui-shot] 21b 条目级裁剪（非法 page 整条丢弃）                → 21b-trim-invalid-entry.png
[ui-shot] 22 缩放恢复（经资料库树打开，110%）                 → 22-scale-restored.png
[ui-shot] 22b 110% 下翻页 + 摘录                            → 22b-scale-excerpt.png
[ui-shot] 22c 写失败注入（write-failed）后 DOM 零变化         → 22c-throttle-no-ui-change.png
[ui-shot] ② 30 次真实页码变化 → 写入上界
[ui-shot] ③ 去抖窗口内切换文档 → 落盘切换前的页码
[ui-shot] ④ visibilitychange(hidden) + pagehide → 恰好 +1
[ui-shot] ⑤ 非 PDF（reading-notes.md）全程 0 次 save
[ui-shot] 22d 笔记跳转到无记录文档（第 2 / 2 页 + 100%）       → 22d-note-jump.png
[ui-shot] 22e 笔记跳转 + 目标文档缩放恢复（150%）              → 22e-note-jump-restored.png
[ui-shot] 23 损坏状态：降级 + 重建                            → 23-corrupt-state-reading.png
[ui-shot] 24 跨工作区切换：树徽标与入口均无残留                → 24-workspace-switch.png / 24b-back-to-a.png
[ui-shot] 结束：产出 43 张截图
UISHOT_EXIT=0
```

`MANIFEST.json`：`failure === null`、`shots.length === 43`（既有 28 张未变，新增 15 张）。渲染层全会话的 `[reader-state]` warn 共 4 行，全部为预期分支：`load degraded (missing)`（20b 与 B 工作区首启）、`save rejected (write-failed)`（22c 注入）、`load degraded (corrupt)`（23）；无其它 `console.error`、无未捕获异常。

关键 `MEASUREMENTS.json` 断言值（新增组，`...` 处为绝对路径前缀）：

```text
resume-entry  {"phase":"loading","resume":false,"title":"选择左侧文件开始阅读","emptyError":false}
resume-entry  {"phase":"loaded","text":"继续阅读：sample-paper.pdf · 第 3 页"}
resume-entry  {"phase":"hit","text":"继续阅读：sample-paper.pdf · 第 3 页"}
resume-entry  {"phase":"after-click","page":"第 3 / 3 页","zoom":"110%"}
resume-entry  {"phase":"no-record","resume":false,"title":"选择左侧文件开始阅读","emptyError":false}
tree-progress {"phase":"static","sample":{"progress":"第 3 页","progressCount":1,"rowScrollWidth":246,"rowClientWidth":246,"labelScrollWidth":109,"labelClientWidth":109},
               "older":{"progress":"第 1024 页","progressCount":1,"rowScrollWidth":246,"rowClientWidth":246,"labelScrollWidth":96,"labelClientWidth":96},
               "notes":{"progress":null,"progressCount":0},"archive":{"progress":null,"progressCount":0}}
tree-progress {"phase":"live-page","row":{"progress":"第 2 页","progressCount":1}}
tree-progress {"phase":"trim","sample":{"progress":"第 3 页"},"older":{"progress":null,"progressCount":0}}
scale-restored {"phase":"tree-row","zoom":"110%","pageLabel":"第 3 / 3 页","pageWidth":655,"expectedWidth":655}
scale-restored {"phase":"excerptAt110","page":"第 2 / 3 页","spanCount":4}
reader-state-writes {"phase":"restore-no-write","base":2,"after2s":2,"after3s":2}
reader-state-writes {"phase":"save-failure","page":"第 3 / 3 页","delta":1,"lastPayload":{"docFilePath":"...\\sample-paper.pdf","page":3,"scale":1.1},
                     "emptyError":false,"snackbar":0,"notice":0,"bytesUnchanged":true}
reader-state-writes {"phase":"save-recovered","delta":1,"lastPayload":{"page":2,"scale":1.1},"filePage":2}
reader-state-writes {"phase":"thirty-changes","changes":30,"elapsedMs":77,"delta":1,"page":"第 3 / 3 页","lastPayload":{"page":3,"scale":1.1}}
reader-state-writes {"phase":"switch-before-debounce","lastPayload":{"docFilePath":"...\\sample-paper.pdf","page":3,"scale":1}}
reader-state-writes {"phase":"hidden-pagehide","afterHidden":1,"afterPageHide":1,"afterExtra":1}
reader-state-writes {"phase":"non-pdf","delta":0,"lastDocPath":"archive/older-paper.pdf","mdEntries":[]}
note-jump     {"phase":"no-record-target","page":"第 2 / 2 页","zoom":"100%"}
note-jump     {"phase":"recorded-target","page":"第 2 / 2 页","zoom":"150%"}
reader-state-degrade {"phase":"corrupt-empty","emptyError":false,"retryButtons":0,"resume":false,"progressCount":0,
                      "title":"选择左侧文件开始阅读","warnDelta":1}
reader-state-console {"phase":"corrupt","warnDelta":1}
reader-state-degrade {"phase":"rebuilt","rebuilt":{"version":1,"lastDocPath":"sample-paper.pdf",
                      "documents":{"sample-paper.pdf":{"page":3,"scale":1,"updatedAt":...}}}}
workspace-switch {"phase":"a-left-home","file":{"lastDocPath":"sample-paper.pdf","documents":{"sample-paper.pdf":{"page":2,"scale":1.1}}}}
workspace-switch {"phase":"b-workspace","row":{"title":"...\\library-b\\sample-paper.pdf","progress":null,"progressCount":0},
                  "progressCount":0,"resume":false,"title":"选择左侧文件开始阅读"}
workspace-switch {"phase":"back-to-a","entry":"继续阅读：sample-paper.pdf · 第 2 页","row":{"progress":"第 2 页","progressCount":1}}
```

**命令 3（§6.3 代码级核对点，只读；B 面相关行全部通过）**

```text
$ grep -rn "\[reader-state\]" src/renderer
src/renderer/stores/reader-state-store.ts:45:  console.warn(`[reader-state] ${message}`);
（命中文件唯一 = stores/reader-state-store.ts；另一处命中是文件头的同文案注释）
$ grep -rn "degraded" src/renderer/components src/renderer/pages                      → 0 命中
$ grep -c "docPathKey(" src/renderer/stores/reader-state-store.ts                     → 0
$ grep -rn "readerState" src/renderer/components/workspace/PdfSearchPanel.vue \
    src/renderer/components/workspace/KnowledgeMap.vue src/renderer/composables/useRegionCapture.ts → 0 命中
$ grep -rn "0\.5\|MAX_SCALE\|DEFAULT_SCALE" src/renderer/stores/reader-state-store.ts src/renderer/components/workspace/PdfViewer.vue
  → 只有来自 reader-store 的导入符号，无字面量
$ grep -n "scrollToPage(" src/renderer/components/workspace/PdfViewer.vue
306:function scrollToPage(...)   317:gotoPage   661:唯一初始落页   784:缩放重排   802:gotoPage watcher      （1 定义 + 4 调用）
$ awk '/async function loadPdf/ { f = NR } /readerStore\.setScale\(/ { s = NR } /getDocument\(/ { r = ... }' PdfViewer.vue        → EXIT=0
$ awk '/async function goHome/ { f = NR } /readerStateStore\.flush\(\)/ { s = NR } /rpc\.stopSession\(\)/ { r = ... }' WorkspacePage.vue → EXIT=0
$ grep -c "resetState()" src/renderer/pages/WorkspacePage.vue                         → 3
$ grep -n "takePendingJump\|takeRestore" src/renderer/components/workspace/PdfViewer.vue
622:  const jumpPage = readerStore.takePendingJump(filePath);
623:  const restore = readerStore.takeRestore(filePath);                                  （恰好 2 处，均在 try 之前；catch 段 0 处）
$ grep -rn "sendSync" pix/src/main pix/src/renderer                                   → 0 命中
$ grep -rn ": any\|as any\|await import(\|import(" <B 面 7 个文件>
  → 唯一命中是 PdfViewer.vue:34 既有注释里的 "import()s"（改前就在，非代码）
```

### B.5 逐条自评

**设计档 §7「开发档自评清单」中属于 B 面的条目**

1. **状态类失败对用户完全不可见**：通过。渲染层没有任何状态相关的错误面板/toast/notice/chip/禁用态/弹窗（`grep "degraded" components pages` = 0；`degraded` 只在 store 内驱动一行 warn）；失败注入下 DOM 零变化（22c：`emptyError:false, snackbar:0, notice:0`，页码照常推进）；`reader-empty-error` 只挂在既有「文本文件读取失败」分支上（23 断言正常空态不带该 class）。写入上界：去抖只在「无待触发定时器」时排一次 + 安全点各一次 ⇒ 任意 T ms 内 ≤ `⌈T/600⌉ + 1`；实测 30 次真实变化（77 ms 内）只结算 1 次写、值一致时 0 次、`pagehide` 后再 dispatch 两次不增长。§0.1 静默例外（无根）在渲染层表现为「空模型 + 不记 warn」（`result.success === false` 分支）。
2. **`goHome()` 的 `flush()` 先于 `await rpc.stopSession()`**：通过。`flush()` 是 `goHome` 的第一条语句（WorkspacePage.vue:217，`stopSession` 在其后）；§6.3 的 awk 判定 `EXIT=0`。**该路径离屏覆盖不到**：stub 的 `stopSession` 按设计不清 `activeRoot`（§6.1 的已知差异），故安全点 b 的 `no-root` 竞态只有「代码审查 + 本自评」两类证据，本轮不新增该场景（§0 修订 1 / R4）。
3. **「加载窗口内打开、且此后不再翻页/缩放的文档本轮不写盘」的代价**：实现已按写死口径落地（`ready` 之前的观察只认领 `settledKey`、不产生快照；`pageCount > 0` 使 `openDocument` 的复位值结构上不入快照）。用户可见后果 = 该文档重开时落第 1 页而非上次页。**此条按设计档要求留待负责人确认一句**。
4. **既有 00–11 断言不依赖 fixture 页数**：通过。A 由 2 页改 3 页后，00–11 的 28 张截图全部产出且断言无变化（既有场景只读 `[data-page="1"]` 的文字层，不读 `.page-label`）。
5. **`reason` 四条中文短句不冻结 / stub 差异**：通过。`ui-shot` 只对 `[reader-state]` warn 计数（增量基线），不比对文案；stub 的 `stopSession` 不清 `activeRoot`、`getSettings` 的 `recentProjects` 固定为 [A, B]（A 在前）等差异已在本档与脚本注释中声明。

**任务硬性要求的逐条自评**

| 要求 | 结论 | 证据 |
| --- | --- | --- |
| 恢复优先级（跳转 > 恢复 > 第 1 页；缩放独立取目标文档恢复值） | 通过 | 22（恢复）、22d（无记录 → 100%）、22e（恢复值 150% + 跳转页 2/2 覆盖恢复页 1）三组断言；`scrollToPage(` 1 定义 + 4 调用 |
| 内联反馈（不复用状态机、不弹错误） | 通过 | 22c：失败注入下无 snackbar/notice/错误态，页码照常；22b：`.quick-ask-feedback.is-ok` |
| 空态入口（`ready` 前不渲染、无记录不渲染、点击落页） | 通过 | 20c（loading/loaded 两张）、20（点击后 3/3 + 110%）、20b（无记录时 selector 为 null） |
| 进度展示（当前文档实时、其它取映射、非 PDF/目录行不显示） | 通过 | 21（静态 + 实时两条）、21b（裁剪）、24（B 侧无徽标） |
| 失败静默降级 | 通过 | 23（corrupt：空模型 + 恰一行 warn + 不阻断阅读 + 后续重建）、22c（write-failed：字节不变、下一次变化照常写） |
| 不破坏既有阅读链路 | 通过 | 00–11 全部通过（翻页/选区/摘录/去重/笔记面板/筛选/加载态/错误态/几何测量）；22b 在 110% 下重跑翻页 + 摘录 |
| stub 与 `preload.ts` 的 API 面一致 | 通过 | stub 增 `readerStateLoad`/`readerStateSave`（同名同形）；控制口 `setReaderState`/`setReaderStateDelay`/`setReaderStateFailure`/`readerStateSaveCalls` 与需求 N34 一致，另加 `readerStateFilePath` 诊断口 |
| 只改白名单内文件 | 通过 | `git status --short`：B 面 6 个文件 + A 面 4 个文件 + 未跟踪的开发档 |
| `npm run check` 0 error | 通过 | B.4 命令 1 |
| 失败路径真实存在（无吞掉异常后返回成功） | 通过 | 渲染层 fail 分支只落 warn 且不改内存（22c 实测拒绝写入 + 字节不变 + 下一次恢复写入）；主进程分支由 A 面烟测覆盖 |
| 中文错误落到位 | 通过（B 面无新增错误文案） | 渲染层不产生状态类错误文案（状态失败无 UI）；新增展示文案均为中文（「第 N 页」「继续阅读：<文档名> · 第 N 页」） |
| 不加依赖 / 无 `any` / 无内联动态导入 | 通过 | 未新增依赖；B 面 7 个文件 grep 全 0（唯一 `import(` 命中是 PdfViewer 既有注释） |

### B.6 未验证事项

1. **真实关窗路径（`window.close()` → `pagehide` → 渲染层销毁）未走查**：按 §0 修订 1 属第 4 类证据，需人工在真实窗口做「翻页后 1 秒内关窗 → 重开 → 续读该页」；离屏只覆盖了 `visibilitychange(hidden)` 与 `pagehide` 的事件驱动路径（④）。
2. **安全点 b 的 `no-root` 竞态无法离屏构造**（stub 的 `stopSession` 不清 `activeRoot`）：只有 §6.3 awk（`EXIT=0`）+ 本档自评两类证据，与设计档 R4 的不覆盖声明一致。
3. **无工作区根的渲染层表现（`no-root`）未离屏覆盖**：stub 恒有 `activeRoot`，`readerStateLoad` 不会返回 `success:false`；该分支（空模型 + 不记 warn + 不发写）只有代码审查。主进程侧由 A 面烟测 12 覆盖。
4. **真实 IPC 往返未验证**：渲染层只经 stub（contextBridge 直连函数），`ipcRenderer.invoke("reader-state-load"/"reader-state-save")` 的真实往返由 A 面的 tsc + 通道名逐字比对判定；禁止 `npm run build` / `npm run dev`。
5. **`lastDoc` 乐观更新在「提交后立刻回首页」下的展示一致性**未单独取证：24 的 a 段验证了 flush 落盘（文件 page=2）与回切后的展示，但那是「不失败」的路径；失败注入下的乐观展示差异不可见（状态不进 UI）故未设断言。
6. **状态文件被外部并发改写**未覆盖：本仓库单窗口 + 主进程同步读-改-写，未构造外部写入场景。
7. **树徽标溢出断言的范围**：只在 fixture 的短文件名 + `page: 1024` 下成立（设计档已声明长文件名截断属期望行为）；更窄的左栏宽度（折叠/拖拽）未测。
8. **非 Windows 平台未覆盖**：全部取证在 win32 上完成。
9. **② 的「30 次变化」是程序化点击**（`button.click()` + 逐次读页码），不是真实键盘事件；设计档 §6.2 明确允许 prev/next 按钮交替点击，需求档 N27 验收 2 的「真实键盘事件或滚动」这一更强口径未覆盖。

---

## 修复轮（代码审查 must-fix：加载窗口内连点取最后一条）

> 触发：`docs/pm/R6-review.md` 的「代码审查（R6）」must-fix 1 条 —— 意图消费前移到 `loadPdf` 序言（`:622`）后，`requestJump` 对「同文档加载中（`pageCount === 0`）」的点击只写 `pendingJump`，在途加载不再读它 ⇒ N20 验收 3 / N28 验收 4 失效。
> 结论：已修复。`npm run check` 0 error；离屏取证 44 张截图、`MANIFEST.failure === null`；新增 20d 场景，并在负向控制（把落页点改回旧时序）下确认该场景会超时失败。

### F.1 改了什么（2 个文件）

| 文件 | 改动 | 依据 / 理由 |
| --- | --- | --- |
| `pix/src/renderer/components/workspace/PdfViewer.vue` | 落页点（`:662`）新增一次补消费：`const lateJump = readerStore.takePendingJump(filePath);` → `const initialPage = lateJump ?? jumpPage ?? restore?.page ?? 1;`；序言与 catch 两处注释同步（序言只结算「点击发生在其之前」的意图） | 审查给出的最小改法：落点前再消费一次取最后一次点击；`lateJump` 优先于序言消费的 `jumpPage`，`Math.min(..., pageCount)` 钳制不变 |
| `pix/scripts/ui-shot.mjs` | stub 增 `setLibraryReadDelay(ms)`（只延迟 `libraryReadFile`，默认 0；`__pixStub` 新控制口，`:237`/`:485`/`:584`）；场景助手 `clickNoteRowAtPage(fragment, "第 N 页")`（`:1089`）；新增 20d 场景（`:1196`，截图 `20d-note-jump-late-click.png`，断言 label `note-jump` / phase `late-click-wins`） | 仓库原本没有造「在途加载窗口」的控制口（审查在仓库外临时副本里手改）；20d 把该时序固化为仓内回归断言 |

时序（修复前）：点「第 1 页」笔记 → 打开文档，序言消费 `pendingJump`（`jumpPage = 1`）→ 在途加载（`pageCount === 0`）中点「第 2 页」笔记 → 只写 `pendingJump`、无人在读 → 旧落点用 `jumpPage` ⇒ 落第 1 页，第 2 页的意图留在 `pendingJump`（下次打开该文档才突然生效）。修复后：落页点的补消费命中第 2 页 ⇒ 落「第 2 / 3 页」。

口径变化（本档记录，不改设计档）：

1. `takePendingJump|takeRestore` 的调用点从「恰好 2 处（均 `try` 之前）」变为 **3 处**（序言 2 + 落页点 1）；设计档 §6.3 该行判定需按此更新。
2. 失败路径：序言已消费的意图照旧丢弃（N20 验收 5 不变）；「加载窗口内晚到、且该次加载随后失败」的点击会留下意图，由重试消费（重试落该页）。`openDocument` 的路径不匹配清理保证它不会劫持其它文档。
3. 无 UI/样式改动：现有 15 张 R6 截图对应的场景实测值与 B.4 逐字一致，仅 `reader-state-writes/restore-no-write` 的增量基线由 2 变 3（断言本就是增量判定）。

### F.2 真实命令与输出

**命令 1（唯一工程门，全部改动完成后的最后一次运行）**

```text
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
CHECK_EXIT=0
```

**命令 2（离屏取证；连跑两次，两次均 exit 0）**

```text
$ cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
[ui-shot] 20d 加载窗口内连点笔记 → 落点取最后一次点击（第 2 / 3 页）
[shot] 20d-note-jump-late-click.png
[ui-shot] 测量 note-jump: {"phase":"late-click-wins","page":"第 2 / 3 页","zoom":"100%","loadingAtClick":true}
[ui-shot] 结束：产出 44 张截图
UISHOT2_EXIT=0
$ node -e "…读 MANIFEST.json…"
failure= null shots= 44
```

（00–11 与 20c/20/20b/21/21b/22/22b/22c/①—⑤/22d/22e/23/24 全部通过；既有断言值不变，新增仅 20d 一条与 1 张截图。）

**命令 3（负向控制：证明 20d 场景有判别力）**

把 `PdfViewer.vue` 临时改回「落页点不补消费」（仅此一行），产物写仓库外 `PIX_SHOT_ROOT`，跑完立即恢复源码：

```text
$ … PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs
[ui-shot] 20d 加载窗口内连点笔记 → 落点取最后一次点击（第 2 / 3 页）
[ui-shot] 场景失败：等待超时：落点 第 2 / 3 页（document.querySelector(".page-label") && document.querySelector(".page-label").textContent.replace(/\s+/g, " ").includes("第 2 / 3 页")）
Error: 等待超时：落点 第 2 / 3 页（…）
    at waitFor (file:///E:/develop/PiX-Read/pix/scripts/ui-shot.mjs:951:40)
    at async runReaderStateScenarios (file:///E:/develop/PiX-Read/pix/scripts/ui-shot.mjs:1212:3)
    at async main (file:///E:/develop/PiX-Read/pix/scripts/ui-shot.mjs:1694:5)
[ui-shot] 结束：失败（场景断言未通过）
NEGCTRL_EXIT=1
```

失败截图（`99-failure-state.png`）显示落点停在「第 1 / 3 页」、composer chip 为「当前文档：sample-paper.pdf · 第 1 页」⇒ 旧时序确实落首次点击的页。恢复后 `sha1sum -c` 输出 `PdfViewer.vue: OK`（与命令 2 的取证内容逐字节一致）。

### F.3 判定点（只读命令）

```text
$ grep -n "takePendingJump\|takeRestore" pix/src/renderer/components/workspace/PdfViewer.vue
623:  const jumpPage = readerStore.takePendingJump(filePath);      （序言）
624:  const restore = readerStore.takeRestore(filePath);            （序言）
662:  const lateJump = readerStore.takePendingJump(filePath);       （落页点补消费，修复点唯一）
$ grep -n "scrollToPage(" pix/src/renderer/components/workspace/PdfViewer.vue
306: 定义 / 317 gotoPage / 664 唯一初始落页 / 787 缩放重排 / 805 gotoPage watcher   （1 定义 + 4 调用，未变）
```

### F.4 未验证 / 残留

1. 真实鼠标连点未走查：20d 用注入延迟（900 ms）+ 合成点击（`row.click()`），探针 `loadingAtClick: true` 保证第二次点击确实落在加载窗口内；真机指针时序的细节差异不覆盖。
2. 「加载窗口内晚到意图 + 该次加载失败」的残留语义（留给重试消费）无离屏场景，属 F.1 记录的判断。
3. 设计档 §6.3「意图消费唯一：恰好 2 处」一行已过期（现为 3 处），本档记录、不改设计档。

---

## 终验（独立验收）

> 角色：终验（独立验收）。只相信本次亲自运行产出的结果；不采信任何自述。
> 时间 2026-09-15，工作区 `E:/develop/PiX-Read`；未改动任何代码、未执行任何 git 写命令；临时产物写在仓库外并已删除。
> 结论：**passed**（四项硬条件全过、唯一一条代码审查 must-fix 已销账；未能独立判定的条目见 §终验 D）。

### 终验 A. 命令与真实结果

**A.1 工程门（唯一工程门）**

```text
$ cd pix && npm run check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
CHECK_EXIT=0   （无 error 行）
```

**A.2 Git 卫生（只读）**

```text
$ git status --short
 M pix/scripts/ui-shot.mjs
 M pix/src/main/ipc-handlers.ts
 M pix/src/main/preload.ts
 M pix/src/renderer/components/workspace/LibraryPanel.vue
 M pix/src/renderer/components/workspace/PdfViewer.vue
 M pix/src/renderer/components/workspace/ReaderPanel.vue
 M pix/src/renderer/pages/WorkspacePage.vue
 M pix/src/renderer/stores/reader-store.ts
 M pix/src/shared/types.ts
?? docs/pm/PRD-V0.4.md / R6-design.md / R6-dev.md / R6-req.md / R6-review.md   （流水线既有文档）
?? pix/src/main/reader-state-store.ts
?? pix/src/renderer/stores/reader-state-store.ts

$ git diff --stat -- packages/                              → 空（无输出）
$ git diff --stat -- pix/package.json pix/package-lock.json → 空（无输出）
$ git diff --stat
 pix/scripts/ui-shot.mjs                            | 897 ++++++++++++++++++++-
 pix/src/main/ipc-handlers.ts                       |  36 +
 pix/src/main/preload.ts                            |  11 +
 pix/src/renderer/components/workspace/LibraryPanel.vue |  30 +
 pix/src/renderer/components/workspace/PdfViewer.vue    |  34 +-
 pix/src/renderer/components/workspace/ReaderPanel.vue  |  53 +-
 pix/src/renderer/pages/WorkspacePage.vue               |  41 +-
 pix/src/renderer/stores/reader-store.ts                |  35 +-
 pix/src/shared/types.ts                                |  50 +
```

白名单外零改动：`index.ts`、`notes-path.ts`、`library-list`/`libraryList`/`LibraryNode` 符号、`pix/build/**`、依赖与 lockfile 均未出现在 diff 中。

**A.3 离屏取证（自跑一次，非复用他人结果）**

```text
$ cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
UISHOT_EXIT=0
MANIFEST.json:   failure=null, shots=44（00–11 既有 28 张 + 20–24 新增 16 张）
MEASUREMENTS.json: 30 条记录（R6 新增 8 组 26 条），无失败项
```

`shots` 目录核对：44 张本次 PNG（mtime 10:29）全部在 MANIFEST 内；同目录另有 `99-failure-state.png`（mtime 09:58、不在 MANIFEST 内）——属上一轮残留，本次运行无失败截图。

关键实测值与设计档 §6.2 冻结值逐条一致：

```text
resume-entry  loading:  无入口、title「选择左侧文件开始阅读」
              loaded/hit: 「继续阅读：sample-paper.pdf · 第 3 页」
              after-click: 第 3 / 3 页 + 110%
              no-record: 无入口
note-jump     late-click-wins: 第 2 / 3 页 + 100% + loadingAtClick=true   （修复轮新增 20d）
              no-record-target: 第 2 / 2 页 + 100%；recorded-target: 第 2 / 2 页 + 150%
tree-progress static: 第 3 页 / 第 1024 页 / md 与目录行 0 / row 246=246、label 109=109
              live-page: 第 2 页（不等去抖）；trim: 非法条目整条丢
scale-restored 110% / 第 3 / 3 页 / pageWidth 655 = expected 655；excerptAt110 第 2 / 3 页
writes        restore-no-write 3/3/3（0 增量）；save-failure delta 1 + bytesUnchanged=true + emptyError=false + snackbar 0 + notice 0
              save-recovered +1 且 filePage=2；thirty-changes changes=30 + delta=1 + 末次 payload page=3
              switch-before-debounce 末次 payload=sample-paper.pdf+page 3；hidden-pagehide 1/1/1；non-pdf delta=0 且 lastDocPath 仍指向 PDF
degrade       corrupt-empty：无错误 class / 无重试按钮 / 无入口 / 无徽标 / warnDelta=1
              rebuilt：version 1 + lastDocPath=sample-paper.pdf + page 3；console warnDelta=1
switch        a-left-home 文件 page=2；b-workspace 先证行存在（title=…\library-b\sample-paper.pdf）再 progressCount=0、resume=false
              back-to-a 入口与树徽标均「第 2 页」
```

**A.4 视觉核对（本次亲自 `read` 截图）**

| 截图 | 看到的结论 |
| --- | --- |
| `21-tree-progress.png` | 左栏 `sample-paper.pdf` 行右侧「第 3 页」徽标、`archive/older-paper.pdf` 行「第 1024 页」徽标、`reading-notes.md` 行无徽标；中栏空态与续读入口正常 |
| `20-resume-entry.png` + 左栏 2× 裁切对比 | 20 的树只有 sample-paper 徽标（该场景未注入 older-paper），21 多出 older-paper 徽标 ⇒ 两场景注入面不同、截图未串；空态出现「继续阅读：sample-paper.pdf · 第 3 页」入口（图标 + 文案） |
| `22-scale-restored.png` | 中栏 PDF 第 3 页（4. Conclusion）、右上「110%」、底部「第 3 / 3 页」、左栏 sample 行高亮 + 徽标、右栏 composer「当前文档：sample-paper.pdf · 第 3 页」chip；窄栏 110% 横向滚动属预期 |
| `02-notes-list.png`（既有场景） | 左栏 pill「资料库 / 笔记 3」、导出 Markdown、仅看当前文档开关、分组笔记与页码徽标，均为既有 UI，无状态类新增元素 |
| `24b-back-to-a.png` | 左栏 sample-paper.pdf「第 2 页」徽标 + 空态续读入口「第 2 页」，无 A→B 残留 |

结论：树进度徽标与空态续读入口均按预期出现；既有左侧 pill、笔记面板、阅读区无视觉回归。

**A.5 独立主进程烟测（仓库外临时脚本，跑完已删除）**

```text
$ cd pix && ./node_modules/.bin/tsc --outDir <temp>/lib --module commonjs --target es2022 \
    --moduleResolution node --skipLibCheck --strict src/main/reader-state-store.ts src/main/library-root.ts
TSC_EXIT=0
$ node <temp>/verify.cjs <temp>/lib
…（41 条 OK，0 FAIL）
TOTAL=41 FAILS=0 WARN_LINES=13
VERIFY_EXIT=0
```

覆盖：no-root 静默不写盘；ENOENT→missing 且不建文件、读不改写、恰一行 warn；截断 JSON→corrupt 且字节不变；version:2→version-unsupported；顶层数组 / documents 非对象→corrupt；条目裁剪（page 0/1.5、scale 9/0.1、`../`、反斜杠、非归一化键、null 条目全丢；updatedAt 非法保留条目记 0）；lastDocPath 六类（越界/绝对/反斜杠/目录/不存在/无对应条目 → 均无记录且其余条目生效）；save 只改目标条目、其它条目字段与序列化格式不变、键序沿用；invalid-input ×4 与 outside 均不写盘；MF2 的 EISDIR→read-failed 拒写且目录仍在、不留 tmp；corrupt 后允许空模型整体重建；write-failed 时原文件字节与 mtime 不变；BOM 容错；`.pix-read/` 被删可自愈；`filePath` 唯一派生点。

### 终验 B. 逐条验收复核（`docs/pm/R6-req.md`）

| 条目 | 结论 | 本轮独立证据 |
| --- | --- | --- |
| N26.1 路径派生 / 不 import electron / no-root | 通过 | 代码审查 + 我的烟测（no-root load/save 静默、filePath 空、不写盘） |
| N26.2 原子写与失败不改原文件 | 通过 | 烟测（write-failed：字节 + mtime 不变；mkdir 自愈；tmp 清理） |
| N26.3 入参校验（invalid-input / outside） | 通过 | 烟测（4 类越域 + 越界，均不写盘） |
| N26.4 写入精确（只动目标条目、格式统一） | 通过 | 烟测（字段、缩进、末尾换行、键序） |
| N26.5 裁剪与降级在 store 内 | 通过 | 烟测（7 类非法条目 + 三类硬错误 + 交叉过滤） |
| N26.6 check 0 error | 通过 | 终验 A.1 |
| N26.7/8 无 GC/无日志/不写 pageCount | 通过 | 代码与类型审查（无相关代码路径与字段） |
| N27.1 一致值 0 次写入 | 通过 | 离屏 `restore-no-write`（0 增量，2s/3s 各一次） |
| N27.2 30 次变化上界 | 通过 | 离屏 `thirty-changes`（changes=30、delta=1≤5、末次 page=3） |
| N27.3 去抖窗口内切换写旧文档 | 通过 | 离屏 `switch-before-debounce`（payload=sample-paper.pdf+page 3） |
| N27.4 hidden/pagehide 恰 +1 且去重 | 通过 | 离屏 `hidden-pagehide`（1/1/1） |
| N27.5 失败注入 DOM 零变化 + 恢复 | 通过 | 离屏 `save-failure` / `save-recovered` |
| N27.6 无 before-quit 拉取 / 无 sendSync | 通过 | `grep before-quit` 仅 `index.ts:226` 且该文件零改动；sendSync 0 命中 |
| N27.7 非 PDF 不落盘 | 通过 | 离屏 `non-pdf`（delta=0，lastDocPath 仍为 PDF） |
| N27.8 no-root 静默 | 主进程侧通过；渲染层分支未离屏（见 D-8） | 我的烟测（主进程）；渲染层只有代码审查 |
| N28.1 消费顺序与唯一初始落页点 | 通过 | 代码审查 + `scrollToPage` 1 定义 + 4 调用 + awk `EXIT=0` |
| N28.2 恢复落页（3/3、无记录 1/2、切回） | 大体通过 | 20/22（3/3）、场景③ `waitPage(1,2)`；「切回 A → 3/3」无独立断言（见 D-3） |
| N28.3 笔记跳转两条（同文档 / 跨文档） | 后半通过；前半未独立判定（见 D-2） | 22d/22e；20d 为加载窗口变体 |
| N28.4 N20 回归 1–6 | 3 通过（20d）、1/2/4 走查、5/6 沿用 R5 口径（见 D-9） | 20d（loadingAtClick=true）；R5b 既有记录 + 本次未改路径 |
| N28.5 pendingRestore 生命周期同构 | 通过 | 代码审查（`openDocument` 逐字同款清理） |
| N28.6 恢复页越界钳制 + 状态改正 | 部分（见 D-4） | 跳转侧由 22d（page 7→2/2）实证；恢复侧为同一 `Math.min` 表达式（代码审查） |
| N28.7 非法记录 → 第 1 页 + 100% | 通过 | 烟测裁剪 + 21b + 22d 的 100% |
| N28.8 三入口同一条恢复路径 | 通过 | 代码审查（只改 selectedFilePath / requestJump / requestRestoreFor） |
| N29.1/2 入口存在与点击落页 | 通过 | 20c/20 + 截图核对 |
| N29.3 无记录无入口 | 通过 | 20b |
| N29.4 只消费 lastDocPath（路径与文件名复用） | 通过 | 代码审查（`absoluteDocPath` + `docDisplayName`） |
| N29.5 指向已删除文件 / 显示后竞态 | 前半通过（烟测）；竞态未构造（见 D-6） | 烟测「解析后不存在 → 无记录」 |
| N29.6 加载未完成不渲染半截入口 | 通过 | 20c（loading/loaded 两张） |
| N29.7 离开再进入 / 另一工作区 | 通过 | 24 / 24b |
| N29.8 指向非 `.pdf` 的既有分支 | 未独立判定（见 D-6） | R5 既有能力，本轮未重测 |
| N30.1/2 徽标文本与实时页码 | 通过 | 21 static + live-page + 截图核对 |
| N30.3/4 键复用与文件树零改动 | 通过 | 代码审查；`git diff` 不含 `library-list`/`LibraryNode` |
| N30.5 无百分比 | 通过 | 类型与内容审查（无 pageCount） |
| N30.6 长页码不溢出 | 通过 | 21（row 246=246、label 109=109） |
| N30.7 树懒加载回归 | 通过 | 00–11 全绿 |
| N31.1 110% 恢复与首屏宽度 | 通过 | 22（655=round(595×1.1)） |
| N31.2 无记录 100% | 标签通过；宽度 595±1 无断言（见 D-5） | 20d/22d 的 100% |
| N31.3 恢复早于解析、不触发重排 | 通过 | awk `EXIT=0`（setScale < getDocument）+ 代码（pdfDoc===null 早退） |
| N31.4 缩放常量单一来源 | 通过 | grep 无字面量（只有 reader-store 导入符号） |
| N31.5 切文档取目标文档恢复值 | 通过 | 22e（150%） |
| N31.6 110% 下既有能力 | 通过 | 22b（翻页 + 摘录 `waitFor .quick-ask-feedback.is-ok`）+ 三条链路 grep 0 耦合 |
| N32.1 resetState ×3 | 通过 | `grep -c` = 3 |
| N32.2 跨工作区无残留 | 通过 | 24（先证行存在再断言 0 徽标） |
| N32.3 loadSeq 作废在途 load | 通过 | 代码审查（loadSeq + 清定时器/快照/基线） |
| N32.4 goHome 落盘 / 真实关窗 | 前半通过（24 a 段文件 page=2）；真实关窗未做（见 D-1） | R6-design §0 修订 1 已降级为第 4 类证据 |
| N33.1 读不改写 | 通过 | 烟测（字节/存在性前后比对） |
| N33.2 条目级裁剪精确 | 通过 | 烟测（7 类键/字段） |
| N33.3 corrupt 下正常阅读与重建 | 通过 | 23（三重判定 + 重建 + warnDelta=1） |
| N33.4 version:2 同口径 | 数据面通过；渲染层无独立场景（见 D-7） | 烟测 version:2 |
| N33.5 越界 lastDocPath 无记录 | 通过 | 烟测（六类）+ 23 无入口 |
| N33.6 无备份 / 无重建按钮 | 通过 | 烟测（目录内只出现状态文件本体）+ 23 |
| N33.7 损坏下 00–11 全绿 | 大体成立（见 D-7） | 本次运行 00–11 在 `missing` 下全绿；23 的 corrupt 分支之后场景继续通过 |
| N33.8 唯一 warn 消费点 | 通过 | `[reader-state]` 命中文件唯一 = store；`degraded` 在 components/pages 0 命中 |
| N34.1 stub 通道与控制口 | 通过 | 代码审查（两通道 + 四控制口 + `readerStateFilePath`，真读真写 fixture） |
| N34.2 新增截图齐全 | 通过 | MANIFEST 内 16 张 `20-*`（含增补） |
| N34.3 断言 throw + 失败落 99 | 通过 | 代码审查（先记测量再 throw）+ 本次无失败 |
| N34.4 既有 00–11 全过、数量不减 | 通过 | 44 张、failure=null、00–11 28 张 |
| N34.5 check 0 error | 通过 | 终验 A.1 |

### 终验 C. must-fix 销账

1. **代码审查 must-fix（唯一一条）**：加载窗口内连点同一文档取最后一次点击 —— **已销账**。证据三线：`PdfViewer.vue:662` 落页点补消费 `takePendingJump`（`lateJump ?? jumpPage ?? restore?.page ?? 1`）；仓内 20d 场景实测 `note-jump/late-click-wins = 第 2 / 3 页 + loadingAtClick=true`；该场景的判别力可由代码推理确认（旧时序下序言只消费到首次点击，第二次点击的意图无消费者，落点必为第 1 页；审查的负向控制在仓库外副本实测超时失败）。
2. **设计评审 must-fix 1–7**：本轮逐条复核通过 —— 键域（store 内 `docPathKey(` 0 命中、`currentDocKey(` 9 处）、`settledKey` 无条件认领、`goHome` 首句 `flush()`、`onOpenNote` 调 `requestRestoreFor`、warn 增量基线、`[reader-state]` 单文件判定 + awk、B 树行存在性前置断言。
3. **设计档 MF1–MF8**：`.reader-empty-error` 三重判定（23）、read-failed 拒写（烟测 EISDIR）、ready 闸门（20c）、setScale 早于 getDocument（awk）、fixture 3 页与数字断言、flush→resetState 顺序、hidden 制造方式与 N31.6 收窄、lastDocPath 交叉过滤（烟测）均已落地。
4. **文档一致性残留**：设计档 §6.3「意图消费唯一：恰好 2 处」一行已过期（修复轮改为 3 处，属 must-fix 要求的最小改法），已在 R6-dev 修复轮 F.1/F.4 记录；设计档不在本轮白名单内，未改。

### 终验 D. 未能独立判定的条目（诚实清单，均不构成 passed 阻断）

1. **N32.4 / N27 §0.2.4 真实关窗人工走查**（翻页后 1 秒内关窗 → 重开续读该页）：第 4 类证据，本次未做；离屏只覆盖事件驱动路径（④）。
2. **N28.3 前半**（A 已打开且有记录时点同文档第 2 页笔记 → 第 2 / 3 页）：仓内无独立场景（20d 是加载窗口变体；审查的临时副本实测不计入我的判定）。该路径走 R6 未改动的 `gotoPage` 分支，风险低但未实测。
3. **N28.2「切回 A → 第 3 / 3 页」**：24b 断言的是入口与徽标「第 2 页」（A 的文件已被 goHome 更新为 page 2），未在「切回后打开」这一动作上独立断言；由 20/22 的恢复路径等价覆盖。
4. **N28.6 恢复页越界钳制 + 随后去抖改正**：无独立场景（跳转侧由 22d 实证；恢复侧仅代码审查同一 `Math.min` 表达式 + `noteLanding` 记钳制后页码）。
5. **N31.2 无记录文档首页宽 595±1px**：只有 100% 标签断言（20d/22d），无宽度断言。
6. **N29.5 显示后文件被删的竞态 / N29.8 指向非 `.pdf`**：前者走既有 PdfViewer 失败态、后者走既有「格式暂不支持内嵌预览」，均为未改动的既有分支，本轮未重测。
7. **N33.4 渲染层 version:2 场景 / N33.7「起始即损坏跑完整套」**：数据面由我的烟测覆盖；渲染层 version:2 与 corrupt 走同一读取分支（23 已覆盖 corrupt）；「起始即损坏」由审查在临时副本实测，本次运行是「00–11 在 missing 下全绿 + 23 的 corrupt 分支后场景继续通过」。
8. **N27.8 渲染层 no-root 分支**：stub 恒有 `activeRoot`，该分支只有代码审查（设计档 §6.3/R4 已声明），主进程侧由我的烟测实证。
9. **N20 验收 5/6**（目标文件缺失、目标为非 PDF）：沿用 R5b 的「失败路径清除 + 文本预览」口径，R6 未重测。

### 终验 E. 结论

- 工程门：`npm run check` 0 error（CHECK_EXIT=0）。
- Git 卫生：只含白名单 9 改 + 2 新源文件 + 流水线文档；`packages/**`、依赖、lockfile 零改动。
- 离屏取证：退出码 0、`failure=null`、44 张截图（既有 28 张零回归 + 新增 16 张），MEASUREMENTS 新增 8 组 26 条断言值全部命中设计档冻结值；视觉核对确认树进度徽标与空态续读入口符合预期，既有 UI 无回归。
- must-fix：唯一一条修复已由仓内场景 + 代码审查双证销账；设计评审 7 条与设计档 8 条复核通过。
- **判定：passed**（未达独立判定的 9 条见 §终验 D，均为已声明的取证边界或低风险既有分支，不影响本轮验收）。
