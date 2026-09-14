# DEV-R5a-notes：开发包 A（数据面 + 契约冻结）交付说明

> 输入：`docs/pm/DEV-R5-notes.md`（§1–§3、§7.1、§8.2/§8.3）、`docs/pm/PRD-V0.3.md`（N17–N25、§8、§10.1）、评审档 `pix-r5/design-review.md`（must-fix 8 条）。
> 范围：只做渲染层数据层与主进程存储/契约；不写任何 UI 组件，不碰 `reader-store.ts` / `WorkspacePage.vue` / `PdfViewer.vue` / `packages/*`。

## 1. 改动文件清单

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `pix/src/shared/types.ts` | 改 | 新增 `Reader Notes Types` 一节（位置在 Library Types 之后、GUI Settings Types 之前）：`ReaderNoteKind` / `ReaderNote` / `ReaderNoteDraft` / `ReaderNotesFile` / `ReaderNotesErrorCode` / `ReaderNotesLoadResult` / `ReaderNotesMutationResult` / `ReaderNotesExportResult` / `ReaderNotesResetResult`。既有类型零改动。 |
| `pix/src/main/notes-store.ts` | 新建 | 六个导出（`loadNotes` / `addNote` / `updateNoteComment` / `deleteNote` / `exportNotesMarkdown` / `resetCorruptNotes`）+ 内部函数：路径派生、严格校验、归一化、去重键、原子写、Markdown 渲染。不 import electron。 |
| `pix/src/main/ipc-handlers.ts` | 改 | 新增 `Reader notes` 一节（紧接 Library 之后）6 条 `ipcMain.handle`；新增 `isNoteDraft` / `isNoteId` / `isNoteComment` / `invalidNotesInput`；新增 `./notes-store.js` 与类型 import。 |
| `pix/src/main/preload.ts` | 改 | `PixApi` 新增 `notesLoad` / `notesAdd` / `notesUpdate` / `notesDelete` / `notesExport` / `notesReset`（6 个 `ipcRenderer.invoke`，显式 `as`）；类型 import 追加 5 个新类型。 |
| `pix/src/renderer/stores/notes-store.ts` | 新建 | pinia setup store：`notes/status/errorCode/errorDetail/notesFilePath/lastExport/currentDocOnly` 状态，`totalCount/hasNotes/currentDocKey/groups/errorMessage` 计算，`loadNotes/addNote/updateNoteComment/removeNote/exportMarkdown/recoverCorruptNotes/resetNotes/setCurrentDocOnly` 动作；导出 `AddNoteResult` / `ExportNotesResult`。 |
| `pix/src/renderer/utils/notes-path.ts` | 新建 | 纯函数：`docPathKey` / `currentDocKey` / `docDisplayName` / `absoluteDocPath` / `groupNotesByDocument` + `NoteGroup`。 |
| `docs/pm/DEV-R5a-notes.md` | 新建 | 本档。 |

未改动（核对项）：`pix-paths.ts`、`library-root.ts`、`types/rpc.ts`、`types/ipc.ts`、`composables/useRpc.ts`、`package.json`/lockfile、`.gitignore`、任何组件与 `reader-store.ts`。
`git status --short` 实测只有上表 6 个源码路径（外加 PM 自己的 `docs/pm/DEV-R5-notes.md`、`docs/pm/PRD-V0.3.md` 两个未跟踪档）。

## 2. 验证：真实命令与结果

### 2.1 工程门（唯一强制命令）

```
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
exit=0            # 无任何 error/warning 输出
```

### 2.2 只读核对（§8.2）

```
$ grep -n "ipcMain.handle(\"notes-" pix/src/main/ipc-handlers.ts
441:  ipcMain.handle("notes-load", () => loadNotes());
443:  ipcMain.handle("notes-add", (_event, draft: unknown) => (isNoteDraft(draft) ? addNote(draft) : invalidNotesInput()));
445:  ipcMain.handle("notes-update", (_event, id: unknown, comment: unknown) =>
449:  ipcMain.handle("notes-delete", (_event, id: unknown) => (isNoteId(id) ? deleteNote(id) : invalidNotesInput()));
451:  ipcMain.handle("notes-export", () => exportNotesMarkdown());
453:  ipcMain.handle("notes-reset", () => resetCorruptNotes());
# 恰好 6 条

$ grep -n "notesLoad\|notesAdd\|notesUpdate\|notesDelete\|notesExport\|notesReset" pix/src/main/preload.ts
66-71:   PixApi 接口声明（6 个）
149-155: ipcRenderer.invoke（恰好 6 处）

$ grep -rn ": any\b\|as any\|<any>" pix/src/main/notes-store.ts pix/src/renderer/stores/notes-store.ts pix/src/renderer/utils/notes-path.ts   # (none)
$ grep -rn "await import(\|import(\"" pix/src/renderer pix/src/main                                                                          # (none)
$ grep -n  "from \"electron\"" pix/src/main/notes-store.ts                                                                                    # (none)
$ grep -rn "notes\.json" pix/src/renderer                                                                                                     # (none：渲染层不拼存储路径)
$ grep -n  "from \"fs\"\|from \"node:fs\"\|from \"path\"\|from \"node:path\"" pix/src/renderer/stores/notes-store.ts pix/src/renderer/utils/notes-path.ts  # (none)
```

### 2.3 纯函数烟测（§8.3，临时脚本跑完已删）

```
$ PATH="/c/Program Files/nodejs:$PATH" node --experimental-strip-types E:/tmp/r5-notes-smoke.mjs
notes-path smoke ok
```

断言覆盖：比较键（大小写/分隔符/尾斜杠）、`currentDocKey` 越界与空根返回 `null`、`absoluteDocPath` 分隔符跟随 root（MF-1）、当前文档组置顶、其余按 key 升序、组内 page 升序 + 同页 createdAt 升序、`onlyCurrent` 过滤（`currentKey === null` → 空数组）、输入数组未被修改。

### 2.4 主进程存储烟测（把 `notes-store.ts` 原样复制到仓库外，配 `library-root` 桩）

```
$ cp pix/src/main/notes-store.ts E:/tmp/r5-main/store.ts && diff -q ...   # copy identical
$ PATH="/c/Program Files/nodejs:$PATH" node --experimental-strip-types E:/tmp/r5-main/smoke.mjs
main notes-store smoke ok
```

覆盖：`no-root`（且 `filePath === ""`，MF-5）/ 空库不写盘 / `outside` 不写盘 / 归一化 + 相对正斜杠路径 + `createdAt === updatedAt` / 落盘 JSON 为 2 空格 + 尾换行且无 `.tmp` 残留 / 去重（路径大小写、分隔符、空白差异命中同一条且不写盘）/ 同文本不同页 = 两条 / `invalid-input`（空文本、page 0、page 1.5）/ `too-long`（4001）与 4000 边界 / 备注更新（`updatedAt` 前进）/ 删除与 `not-found` / 导出模板（标题、声明行、条数、分组升序、`### 第 N 页`、备注行、无备注不输出备注行）/ 1.1s 后二次导出仅「生成时间」一行不同 / 0 条拒绝导出 / 损坏时 add·update·delete·export 全部失败且文件字节不变、无 tmp / `notes-reset` 备份字节等于原始内容并写回空库、未损坏返回 `not-corrupt` / `version-unsupported` 也可重建 / 删除 `.pix-read` 后自愈 / BOM 容忍 / 14 组条目级损坏样例（含 notes 非数组、version 缺失或非数字、docPath 绝对/反斜杠/`..` 段/空串、page 非正整数、text 空或超限、时间戳非有限数、id 空或重复）。

说明：主进程模块用「复制 + `library-root` 桩」运行，是因为源文件按 Node16 ESM 规则 import `./library-root.js`（磁盘上只有 `.ts`），Node 无法解析该说明符；复制前后已 `diff` 确认字节一致。

## 3. must-fix 落地对照

| # | 落地情况 |
| --- | --- |
| MF-1 路径形态 | `absoluteDocPath` 改为分隔符跟随 root（`root.includes("\\") ? "\\" : "/"`），输出与资料库树节点同形。**B 侧仍有一步必须在 `WorkspacePage.onOpenNote` 落地**：`selectedFilePath` 与目标路径的比较要用同一归一化（`toLowerCase().replace(/\\/g,"/")`），否则「同文档」会被判成换文档并整篇重载（见 §5 交接项 1）。 |
| MF-2 越界页 | `shared/types.ts` 的 `ReaderNote.page` 注释已改写为实际规则：主进程不解析 PDF，越界页由跳转消费方钳制到最后页（不再声称由 `setPage` 钳制）。钳制代码属 B（`requestJump` / `PdfViewer` 消费点），见 §5 交接项 2。 |
| MF-3 reject 兜底 | `ensureNotesDir` 归入 `write-failed`（`mkdirSync` 与 `writeFileSync` 同一 try 分支）；渲染层每个动作都有 try/catch，reject 返回 `{ ok: false, message: "主进程调用异常：…" }`；`loadNotes` 的 reject 走 `status: "error"` + `errorCode: null`。变更/导出失败不写 `status/errorCode`。 |
| MF-4 load 去重 | `let loadSeq`，`loadNotes()` 开头 `const seq = ++loadSeq`，await 后 `seq !== loadSeq` 直接丢弃；同时用 `startWriteSeq !== writeSeq` 丢弃被变更超越的 load。 |
| MF-5 空路径语义 | 无工作区根时 `filePath: ""`（写入 types 注释 + 实现 + 开发档）；`notes-store` 不把空串传出去（B 侧在 `filePath === ""` 时不渲染「在文件夹中显示」，见 §5 交接项 4）。 |
| MF-6 逃生口语义 | `notes-reset` 对 `corrupt` 与 `version-unsupported` 均执行备份重建（写死并写入类型注释）；`read-failed` 拒绝（可能是临时占用/权限问题，改名会丢可恢复数据）；`not-corrupt` 拒绝。 |
| MF-7 死代码口径 | 本档 §4 逐条登记「已交付但暂无消费者」的符号；A 内无未调用的私有函数。 |
| MF-8 导出判定 | 未改模板（PRD N21 验收 6 要求生成时间）；烟测把判定实现为「两次导出仅 1 行不同且行数相同」，实测通过。PM 走查按此口径。 |

should-fix 采纳：3 条 —— 拆掉 `formatStamp(ms, dashed)` 布尔开关（改为 `formatStampHuman` / `formatStampDashed`）；`notesDir()/notesFile()` 单行 helper 合成为 `notesPaths()` 并内联目录派生；读取时 id 重复按 `corrupt` 处理。其余 should-fix（错误文案表、备注上限、删除确认生命周期、notes-load 失败与旧列表次序）处理见 §4/§6。

## 4. 已交付但暂无消费者的符号清单（A 阶段，B/P1 落地时销账）

主进程通道：`notes-reset`（P1 逃生口按钮，B 周期 P1）。
preload 方法：`notesUpdate`（P1 备注编辑）、`notesDelete`（P0 面板删除，B 实现）、`notesExport`（P0 导出按钮，B 实现）、`notesReset`（同上 P1）。
渲染层 store：`updateNoteComment`（P1）、`removeNote`（P0 面板）、`exportMarkdown`（P0 面板）、`recoverCorruptNotes`（P1）、`setCurrentDocOnly` 与 `currentDocOnly`（P1 N24）、`lastExport`（P0 导出结果行）、`errorMessage`（P0 错误态标题）。
渲染层 utils：`docPathKey`（组内使用 + B 可选）、`currentDocKey`（store 内使用）、`docDisplayName`（`groupNotesByDocument` 内使用，B 也可直接用于组头）、`absoluteDocPath`（B 的 `onOpenNote`）、`groupNotesByDocument` 与 `NoteGroup`（store `groups` 计算，B 直接消费）。
判定口径（对应 MF-7）：A 内**模块私有的函数无死代码**；上表为跨周期消费者，随 B 的组件落地销账；不为了通过 grep 而写假调用。

## 5. 交接给 B 的强制约束（不可私改契约）

1. `WorkspacePage.onOpenNote(note)`：先 `readerStore.requestJump(absoluteDocPath(root, note.docPath), note.page)`，再按**归一化比较**决定是否改 `selectedFilePath`（`selectedFilePath.toLowerCase().replace(/\\/g,"/") !== target.toLowerCase().replace(/\\/g,"/")`）。若用严格字符串比较，同文档点击会触发 `openDocument()`（重置 `page/pageCount/gotoPage`）→ 整篇重载 → 落回第 1 页（N20 验收 1/2 直接红）。
2. 越界页：`requestJump` 写 `gotoPage` 前 `Math.min(page, pageCount)`；`PdfViewer` 消费 `takePendingJump(filePath)` 时同样 `Math.min(page, readerStore.pageCount)`（`pageCount` 在 `setPageCount` 后已可用）。语义写死为「越界页跳到最后页」。
3. 错误态逃生口按钮只在 `errorCode === "corrupt"` 或 `"version-unsupported"` 时渲染（这两个码主进程都接受重建）；`read-failed` / `no-root` 只给「重试」+（非空路径时）「在文件夹中显示」。
4. `notesFilePath === ""`（`no-root`）时不渲染「在文件夹中显示」，也不要调用 `libraryShowInFolder("")`。
5. 跨工作区：进工作区先 `resetNotes()` 再 `loadNotes()`；`goHome()` 与 `onUnmounted` 各调一次 `resetNotes()`。
6. 面板展示规范：错误态标题用 `notesStore.errorMessage`，第二行用 `errorDetail`；`status` 三态互斥（`loading` / `error` / 其余按 `hasNotes` 分空态与列表）。
7. 不新增第二套路径/时间/归一化实现：路径统一走 `utils/notes-path.ts`，相对时间在组件内联，原文归一化与去重只在主进程。

## 6. 关键设计决策（含与设计稿的差异）

1. **同步 handler + 全同步 fs**：六条通道的 handler 返回普通对象（不是 Promise），读-改-写之间没有 `await`；签名在编译期可见，避免将来有人插入异步破坏串行性。
2. **写盘原子性集中在 `writeFileAtomic(target, content)`**：设计稿名为 `writeNotesFile(file)`（只服务 notes.json），导出需要同一协议写 `notes.md`。改为 `writeFileAtomic` + `serializeNotes(file)` 两个内部函数，`notes.json` 与 `notes.md` 共用。行为与设计一致（mkdir → 写 tmp → rename → 失败清理 tmp 且不动原文件）。
3. **`notesPaths()` 取代 `notesDir()/notesFile()`**：这两个单行 helper 只有唯一调用点，按 AGENTS.md 合并为一个返回 `{ file, markdown }` 的函数（`dir` 由 `dirname(target)` 派生，不留未使用字段）。
4. **`errorMessage` 保留但降级为「标题 + 回退」**：设计 §3.2 要求该计算属性（B 的面板按它渲染），评审建议删除以避免与主进程文案表漂移。实现取二者交集：有 `errorCode` 时返回短标题（如 `corrupt` → 「笔记文件无法读取」），否则回落到 `errorDetail`；**完整中文原因始终由主进程 `error`（`errorDetail`）提供**，渲染层不再复制完整文案表。B 直接展示两者即可。
5. **`status` 只由 load/reset 写**（设计不变式 2）；`loadNotes` 失败时保留内存中的旧列表（IPC 规则 2「失败不得覆盖本地列表」），跨工作区残留由 `resetNotes()` 负责。
6. **`resetNotes()` 追加清 `currentDocOnly`**：它是视图状态且不持久化；若跨工作区保留为 `true`，新工作区在未打开文档时会因 `currentDocKey === null` 而显示空列表，属明显错误态。设计未写死，按「清空全部本地状态」的最接近读法处理。
7. **`addNote` 去重命中不写盘**，直接回传主进程现有全量列表 + `duplicateOf`；渲染层以「有无 `note` 字段」判定是否为重复（`AddNoteResult.duplicate`），`writeSeq` 照样递增（列表已被权威刷新）。
8. **读取校验比设计表更严的两处**（都落在「宁可报错、不静默」一侧，已写注释）：① `text` 必须非空且 ≤ 4000，否则 `corrupt`；② id 重复按 `corrupt`（update/delete 会对哪一条产生歧义，评审 should-fix 5）。
9. **`comment` 本轮不设长度上限**（评审 should-fix 3 的另一选项：记录理由）。理由：P1 备注由面板内联输入产生、不是粘贴通道；主进程仍是唯一写者，越界只会使单文件变大，不会丢数据；若 P1 需要上限，在 `notes-update` 加 2000 上限即可（不改通道形状）。此条在 B 的 P1 验收时复评。
10. **错误码 → 文案是主进程单点**（`ERROR_MESSAGES` 用 `Record<ReaderNotesErrorCode, string>` 保证穷尽）；渲染层 `ERROR_TITLES` 只提供短标题。
11. **`workspaceName(root)` 用 `split(/[\\/]/)` 自实现**而不是 `basename()`：容器/平台无关（POSIX 下 `basename("E:\\ws")` 会返回整串）。
12. **导出 Markdown 不依赖当前文档**（排序只看 `docPathKey` → `page` → `createdAt`），保证幂等与可 diff；面板视图的「当前文档置顶」在渲染层完成（B）。

## 7. A 验收自评（对照 DEV-R5-notes §7.1）

1. `npm run check` = 0 error：通过（§2.1）。
2. 六条通道名 / preload 方法名 / 返回结构与 §2.2 表逐字一致：通过；`notes-reset` 已交付、UI 未消费（契约冻结项，§4 登记）。
3. `ipc-handlers.ts` 恰好 6 条 `notes-*` handle，`preload.ts` 恰好 6 处 `notes-*` invoke：通过（§2.2）。
4. 渲染层 `notes-store.ts` 无 `fs`/`path` import、无路径拼接；主进程 `notes-store.ts` 无 `electron` import：通过（§2.2）。
5. 无 `any`、无 `await import(`/`import("…")`；新增导出全部在 A 内有调用或已登记为跨周期消费者：通过（§2.2 + §4）。
6. `notes-path.ts` 可被 Node 临时脚本导入并跑通 §8.3 断言：通过（§2.3）。
7. `notes.json` 的 schema/版本/限额/归一化/去重/原子写逐条对应 §1、§2.5、§2.6：通过（§2.4 烟测逐条断言）。

## 8. 未验证项与原因

1. **真实 Electron/IPC 往返**（`ipcMain.handle` 注册后的 `ipcRenderer.invoke` 链路）：需要启动应用，本轮约束禁止 `npm run dev`/`build`/`package`。静态依据：`tsc -p tsconfig.preload.json --noEmit` 保证 `PixApi` 与实现一致，通道名两侧 grep 逐字核对。
2. **`isLibraryFilePath` 的真实路径守卫**（大小写归一、`..` 逃逸、symlink 复核）：烟测用的是等价桩（同 `relative` 语义），未跑 `library-root.ts` 本体（它依赖主进程模块图但本身无 electron 依赖；本轮不改该文件）。
3. **`.pix-read` 不被资料库树显示**：`listLibraryChildren` 的 `startsWith(".")` 规则未改动（回归核对项），未跑运行时。
4. **UI 三态渲染、浮层反馈、跳页时序**（N17/N19/N20 的可见行为）：属 B 与 PM 走查项。
5. **Windows `renameSync` 在目标被占用时的 `EPERM`**：设计明确本轮不重试；`write-failed` 路径由烟测覆盖（目录不存在时仍会 mkdir 自愈），占用场景需真机复现。
6. **多实例竞争、掉电**：设计记录在案的边界，不做验证。
