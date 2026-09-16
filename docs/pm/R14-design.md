# PiX-Read R14 设计档 · 资产贯通（N87–N90）

> 上游：`docs/pm/R14-req.md`（需求 N87–N90，含 §0 定稿修订 M1–M10 与 §0.1–§0.9 冻结契约）、`docs/pm/R14-review.md`（需求评审 must-fix MF-1…MF-10）、`docs/pm/PRD-V0.5.md` §1 / §2 / §3 / §4 / §5 / §7.4、`docs/pm/R13-design.md`（**新 IPC 四面同步写法** §1.1：`shared/types.ts` → `main/ipc-handlers.ts` → `main/preload.ts` → `ui-shot.mjs` stub 面）、`docs/pm/R12-design.md`（§1 契约冻结表 / §2 既有面 / §3 失败路径表 / §5 验证方案 / §8 视觉验收的结构范本）、`docs/pm/R13-dev.md`（R13 交付终态与基线读数 135 / 198 / 46）。
> 本档是「可直接开工、可判定」的定稿设计：把 R14-req §0.2–§0.9 的冻结契约落到实现层粒度 —— 新通道 `notes-stat` 的逐字形状与四五面同步、指纹基线与检测时机的确切实现点、徽标派生的签名与 memo、面板提示行与刷新状态机（含草稿冲突）、组头跳转的事件与处理器、烟测 13 条与离屏 5 场景 13 条 record / 8 张截图的逐条判据。
> **本档不改任何代码**，只新增这一份文档；本轮允许的写操作仅 `docs/pm/R14-design.md`。
> **范围收窄登记（照抄 R14-req §2）**：「阅读器侧章节笔记入口」未纳入本轮；本轮主线 = 树上可见（N87）+ 外部改动感知（N88）+ 笔记组头文档跳转（N89）+ 验证面（N90）。本档不为被收窄项写任何设计。
> **编号映射**：本档按任务书编号 —— §1 契约冻结表 / §2 与既有冻结面的关系 / §3 失败路径表 / §4 文件级清单 / §5 验证方案 / §6 风险 Top3 / §7 开发分工 / §8 视觉验收要点。
> 判定工具（与需求档一致）：【走查】只读 `git status` / `git diff` / `git show` 与文件内容（含 `grep -c` / `grep -rn` 计数）；【check】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error（唯一工程门）；【烟测-渲染】`npm run smoke:view`（既有 4 组 29 条 + 新增 1 组 6 条 = **35 条**）；【烟测-主进程】`npm run smoke:notes`（既有 7 组 44 条 + 新增 1 组 7 条 = **51 条**）；【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + 既有 135 张 / 198 条 / 46 种 label 零缺失 + 新增 5 组 13 条 record 全绿 + 8 张新截图齐备。

---

## 0. 口径与证据面

### 0.1 本档事实基线（写档当天的真实读数：只读核对 + 本步允许的实跑）

| 事实 | 证据（全部为本次真实读数） |
| --- | --- |
| 工作树与 HEAD | `git status --short` ⇒ `?? docs/pm/R14-req.md` / `?? docs/pm/R14-review.md`（本档落盘后追加 `?? docs/pm/R14-design.md`）；`git log --oneline -1` ⇒ `20dd452 feat(notes): 每篇文档的结构化阅读报告导出（章节分组、两类笔记与阅读进度）（V0.5 R13）` |
| 唯一工程门当前 0 error | 2026-09-16 本步实跑 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（输出仅 `> pix-read@0.1.0 check` 与 `vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit` 两行） |
| R14 的零缺失比对基线（R13 交付产物，只读复读） | 目录 `C:/Users/86157/AppData/Local/Temp/pix-v05-r13-review/shots`：一级 **137** 项 = **135** png + `MANIFEST.json` + `MEASUREMENTS.json`；`MANIFEST.json` ⇒ `shots.length = 135`、`failure = null`；`MEASUREMENTS.json` ⇒ 长度 **198**、`label` 去重 **46** 种（含 R13 五组：`r13-report-entry:3` / `r13-report-content:3` / `r13-report-fallback:2` / `r13-report-degrade:2` / `r13-report-failure:3`）；`r14` 前缀 label **0** 命中 |
| 树行几何（基线 `MEASUREMENTS.json` 的 `tree-progress` static/trim 相位，本档复读） | 四行的 `rowScrollWidth == rowClientWidth == 246`（行盒宽不随 depth 变）；`.row-label` 宽：`sample-paper.pdf` **109** / `archive/older-paper.pdf` **96** / `reading-notes.md` **111** / `archive` **44**；`.row-progress` 文本：`第 3 页` / `第 1024 页`；`trim` 相位确认 `older` 行进度计数 0 时 `rowScrollWidth == rowClientWidth` |
| 文件规模（本步 `wc -l`） | `LibraryPanel.vue` **277** / `renderer/stores/notes-store.ts` **483** / `main/notes-store.ts` **551** / `main/ipc-handlers.ts` **894** / `main/preload.ts` **193** / `shared/types.ts` **620** / `NotesPanel.vue` **1468** / `WorkspacePage.vue` **447** / `renderer/utils/notes-path.ts` **118** / `scripts/ui-shot.mjs` **8171** / `scripts/smoke-notes.mjs` **1001** / `scripts/smoke-view.mjs` **492** |
| 命名预检（本轮全部为**新增**名字；`grep -rn … pix/src \| wc -l`） | `notes-stat` **0** / `notesStat` **0** / `ReaderNotesStatResult` **0** / `statNotesFile` **0** / `row-notes` **0** / `notes-stale` **0** / `countNotesByDocument` **0** / `externalChange` **0** / `checkNotesFile` **0** / `onOpenNoteDoc` **0** / `open-note-doc` **0** / `is-openable` **0**；既有 `open-document` **3** 处（载荷 = 绝对路径）⇒ 新事件名不得复用 |
| 判据现状值（本轮改后值） | `grep -c "for (" notes-path.ts` = **2**（`:74` / `:98`，均在 `groupNotesByDocument`）；`grep -c "margin-left: auto" LibraryPanel.vue` = **1**；`grep -c "applyNotes(" renderer-store` = **5**（定义 1 + 调用 4）；`grep -c "editingCommentId.value = " NotesPanel.vue` = **3**；`grep -c "selectedFilePath.value = " WorkspacePage.vue` = **2**；`grep -c "console\." renderer-store` = **0**；`grep -c "pixApi\." LibraryPanel.vue` = **2**（两处 `libraryList`）；`grep -rn "\.pix-read" pix/src/renderer \| wc -l` = **2**（`NotesPanel.vue:551` 展示文案 + `reader-state-store.ts:4` 注释）；`grep -c "setInterval" renderer-store` = **0**；`grep -rn "externalChange\|notes-stale" pix/src/main \| wc -l` = **0**；`grep -rniE "setInterval\|setTimeout" LibraryPanel.vue \| wc -l` = **0**；`grep -rn 'addEventListener("focus"' pix/src \| wc -l` = **0** |
| preload 面（程序化计数，本次实读） | `PixApi` 接口 `:34-107` = **41** 方法、`api` 实现 `:109-191` = **41**、`ui-shot.mjs` stub `api` = **41**；**三处方法名清单逐字相等且顺序相同**（程序化比对 `iface===impl===stub` 为 `true`）⇒ M8(c) 的「三处 42 项且清单逐字相等」可判 |
| 主进程 IPC 面（笔记 8 通道，实读行号） | `notes-load` `:513` / `notes-add` `:515` / `notes-update` `:517` / `notes-delete` `:521` / `notes-restore` `:523` / `notes-export` `:525` / `notes-reset` `:527` / `notes-export-report` `:529-531`；`notes-store.js` 的 import 在 `:21`；无入参通道先例：`notes-load` / `notes-export` / `notes-reset` / `reader-state-load`（`:537`） |
| 共享类型（实读行号） | `ReaderNotesFile` `:364` / `ReaderNotesErrorCode` `:369-380`（**11** 键）/ `ReaderNotesLoadResult` `:383-389` / `ReaderNotesMutationResult` `:392-399` / `ReaderNotesExportResult` `:401` / `ReaderNotesReportChapter` `:410` / `ReaderNotesReportInput` `:418` / `ReaderNotesReportResult` `:425` / `ReaderNotesResetResult` `:435` |
| 主进程笔记存储（关键字面） | import `:10`（`randomUUID`）/ `:11`（`existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync`，**无** `statSync`）/ `:12`（path）/ `:13`（library-root）/ `:14`（types）；`ERROR_MESSAGES` `:40`（11 键，`no-root` 逐字 `尚未选择资料库根目录`、`read-failed` 逐字 `笔记文件读取失败`）；`notesPaths()` `:78`；`isEnoent` `:106`；导出 8 个函数（`loadNotes` `:363` … `resetCorruptNotes` `:527`） |
| 渲染层笔记 store（实读行号） | `notes` ref `:95`；`pendingUndo` `:109`；竞态令牌 `loadSeq` `:126` / `writeSeq` `:127` / `undoScope` `:129` / `reportScope` `:131`；`applyNotes()` `:174-184`；`loadNotes()` `:186-215`（成功分支 `notes.value = result.notes` 在 `:200`、`status.value = "ready"` 在 `:201`）；`recoverCorruptNotes()` 成功分支 `:332-341`；`resetNotes()` `:352-370`；返回对象 `:433-482` |
| 笔记路径工具（实读行号） | `docPathKey` `:18` / `currentDocKey` `:23` / `docDisplayName` `:32` / `absoluteDocPath` `:40` / `PageRange` `:47` / `rangeContains` `:52` / `matchesChapterFilter` `:60` / `groupNotesByDocument` `:67`（循环在 `:74` / `:98`）/ `sortNotesForContext` `:110` |
| 资料库树（实读行号） | `rows` computed `:33`；`progressMap` computed `:35-46`（`readerStateStore.progressPageFor(row.node.path)` 在 `:39`）；`flattenVisible` `:53`；`toggle` `:89`；模板 `v-for="row in rows"` `:151`、`.tree-row` `:153-168`（`.row-label` `:164`、`.row-progress` `:165-167`）；样式 `.tree-row` `:213-227`（`gap: 4px` / `padding: 5px 6px`）、`.row-chevron-spacer` `:243`（`width: 14px`）、`.row-icon` `:248`、`.row-label` `:252-256`、`.row-progress` `:257-270`（`min-width: 46px; flex-shrink: 0; margin-left: auto; padding: 1px 6px; font-size: 11px`） |
| 笔记面板（实读行号） | `NOTICE_MS = 4000` `:28`；`defineEmits` `:52-54`（当前只有 `open-note`）；vue import `:10`（**无** `onMounted`）；`startCommentEdit` `:294-297`；`onBeforeUnmount` `:415-431`；模板块顺序：`.notes-notice` `:536-542` → `.notes-undo` `:543-548` → `.notes-export-row` `:550-561` → `.notes-report-row` `:562-574` → `.notes-loading` `:575`；列表 `.notes-group-head` `:621-628`（`:title="group.docPath"` `:621`、`.group-name` `:623`、`当前文档` chip `:625`、`.group-count` `:627`）；`.note-comment textarea` 模板 `:679`；样式 `.notes-notice` `:943` / `.notes-undo` `:989-998` / `.notes-export-row` `:1030` / `.notes-group-head` `:1182-1188` |
| 工作区页（实读行号） | `onMounted` `:74` 起、`notesStore.resetNotes(); await notesStore.loadNotes();` 在 `:98-99`；`onUnmounted` `:126` 起、`notesStore.resetNotes()` 在 `:137`；`openDocumentFromLibrary` `:190-194`；`selectLeftTab` `:196-203`（`if (tab === "notes") void notesStore.loadNotes();` 在 `:202`）；`onOpenNote` `:216-224`；模板 `@open-note="onOpenNote"` `:290`、`@open-document="openDocumentFromLibrary"` `:310` |
| 离屏脚本（实读行号） | `const SEL = {` `:47` … `};` `:106`（程序化计数 **54** 项，见 §0.5(a)）；`buildStub()` `:407`；stub 的 `require` 面 `:424-425`（`electron` / `node:fs` / `node:path`，**无** `node:crypto`）；`NOTES_FILE = CONFIG.notesFilePath` `:428`（= A 根）；`readNotesFile` `:481` / `writeNotesFile` `:492` / `isInsideNotesRoot` `:507` / `relativeDocPath` `:654`；`activeRoot` `:668`（初值 `CONFIG.root`）/ `stateFilePath()` `:678`；`notesLoad` `:865-872`；`contextBridge.exposeInMainWorld("__pixStub", …)` `:1104`；控制口 `notesLoadCalls` `:1112` / `libraryShowCalls` `:1137` / `setLoadDelay` `:1151` / `setLoadFailure` `:1152`；`seedNotes()` `:320-368`（4 条：sample 3 = 摘录 2 + AI 结论 1、`archive/older-paper.pdf` 1 = 摘录 1）；`writeFixtures()` `:370-400`；`runReaderStateScenarios` `:1510` 起 |
| 离屏 helper 面（实读行号） | `waitFor` `:1521`（轮询 120ms）/ `record` `:1528`（先落测量再抛错）/ `textOf` `:1535` / `has` `:1537` / `countOf` `:1538` / `rowProbe` `:1565` / `rowByTitle` `:1583` / `rowByLabel` `:1584` / `overflowFree` `:1584-1585` / `waitTreeRows` `:1587` / `goHome` `:1605` / `enterWorkspace` `:1615` / `openRow` `:1630` / `notesHash` `:2209` / `readNotes` `:2207` / `NOTES_FILE`（Node 侧）`:2206` / `rectOfSelector` `:2397` / `enterCleanWorkspace` `:3225` / `openNotesPanel` `:3238` / `restoreStandardSeed` `:3244` / `loadCalls` `:4072` / `enterMapWorkspace` `:4214` / `backToLibraryTab` `:4228` / `enterNotesProbe` `:4933` / `setSearch` `:4942` / `searchProbe` `:4953` / `deleteRowByText` `:5031` / `notesNotice` `:5078` / `closeNotice` `:5090` / `clickUndo` `:5071` / `narrowProbe` `:5377` / `clickEl` `:6890` / `waitSectionReady` `:6955` / 报告面 `notesReportCalls` `:7428` / `reportProbe` `:7445` |
| 离屏挂载点与收尾 | `runReaderStateScenarios` 的最后一条语句 = `await restoreStandardSeed();`（`:8013`），函数收口 `}`（`:8014`）⇒ R14 块追加在 `:8013` 之后、`:8014` 之前；每个新场景自带复位并以自己的 `restoreStandardSeed()` 收尾 |
| stub 控制口与 API 面 | `pixApi` = 41 方法（与 preload 逐字相等）；`__pixStub` 现有控制口含 `seedNotes` / `notesAddCalls` / `notesLoadCalls` / `notesRestoreCalls` / `notesReportCalls` / `libraryShowCalls` / `readerStateSaveCalls` / `sendCalls` / `setLoadDelay` / `setLoadFailure` / `setLibraryReadDelay` / `relativeDocPath` / `setReaderState*` 等；**无** `notesStatCalls` / `setNotesStatFailure` / `libraryList` 计数口 |
| 既有场景 21 的现场（决定「既有截图内容变化」登记项） | 场景 21 不写种子 ⇒ 运行时文件 = `runScenario` 的 4 条种子 + `runScenario` 摘录动作新增 1 条 = **5 条**（sample 4 + older 1）⇒ R14 后该场景的 sample 行徽标为 `4 条`、older 行为 `1 条`；`21-tree-progress.png` 会出现新元素（§2.2 / §8 登记项） |
| 跨工作区唯一既有场景 | 仅场景 24 进入 B（`enterWorkspace(LIBRARY_B_NAME)` `:2168`），其 B 侧断言只判 `.row-progress` 计数 0 / 续读入口 / 空态文案 ⇒ stub 笔记根改为随 `activeRoot` 后，B 侧「笔记 pill 文本」会从 `笔记 5` 变为 `笔记`（内容变化登记项，见 §2.2） |
| 烟测面（实读行号） | `smoke-notes.mjs`：`files` `:934` / `required` `:950` / `allowed` `:951` / 加载 `:970-971` / `main()` `:976-1001`（调用序 `runUndoRoundtrip → … → runReportFailures`，末行 `main();`）；`smoke-view.mjs`：`files` `:428` / `required` `:446` / `allowed` `:447` / 模块句柄 `:82-83` / require `:465-466` / `main()` `:470-489`；`seedReportNotes`（smoke-notes）`:113`、`draft` `:84`、`sha256` `:85`、`readFileNotes` `:75`、`writeNotesFile` `:70` |
| 版本级反需求命中面 | `pix/package.json` 本轮零 diff（不新增 script）；`packages/**`、`package-lock.json`、`variables.css`、`tsconfig*.json`、`vite.config.ts` 零 diff |

### 0.2 R14-req 定稿修订（M1–M10）在本档的实现级落点

| 编号 | 需求档结论 | 本档实现级落点 |
| --- | --- | --- |
| M1 / MF-1（徽标让位） | 选项 ①：改为「行内唯一可收缩项 + 右端硬裁切、数字优先」，用实测读数替换估算 | §1.4 盒模型与压缩降级（逐字 CSS）、§1.4 的几何推导（232/218、34/14、18.8/22.8、缺口 8.8）、**新增「徽标让位判据」**（§1.4 / §5.4），既有场景 21 保持绿 |
| M2 / MF-2（`r14-4` 相位步骤） | 「先造置位态 → 注入失败 → 复核 → 点刷新清位 → 置位前注入失败 ⇒ 不置位」 | §5.4 场景 `r14-4` 相位 `stat-failure-silent` 的步骤与断言（逐条写出点击序列，保证 `clickEl` 不抛 `TypeError`） |
| M3 / MF-3（循环计数） | 拆成「函数体内恰 1 个循环」+「文件总数 = 3」 | §1.3 参考实现（单层 `for…of`）+ §1.8 走查 #4 |
| M4 / MF-4（判据文件） | `NotesPanel.vue` 侧 `onOpenNoteDoc` = 0 | §1.7.4 与 §1.8 走查 #11 |
| M5 / MF-5（`notes-path` 句柄） | `smoke-view.mjs` 增模块句柄 `notesPath` + `require` | §5.3 判据 2 + §4 第 11 行 |
| M6 / MF-6（计数口径差异） | 徽标恒示全量；补一条过滤态离屏断言 | §1.4「与面板计数的口径差异」+ §5.4 场景 `r14-1` 相位 `live` ⑨ |
| M7 / MF-7（`git diff -U0`） | 判据改用 `-U0` | §1.8 走查 #8 |
| M8 / MF-8（三处对齐） | 4500ms / 三条外部夹具 + `removeExternalNote` / 三处 42 项 | §5.4 夹具表（三条）、helper 表（`removeExternalNote`）、§1.1.5 判据 2、§5.4 场景 `r14-3` ⑨ |
| M9 / MF-9（刷新按钮形态） | 保留 `v-btn` `x-small` text，**不**覆盖 padding / font-size | §1.7.2 模板逐字 + §1.7.3 样式（无 `.stale-refresh` 规则） |
| M10 / MF-10（`libraryList` 次数） | 删除该半句，改为零 diff 推导 | §1.8 走查 #6（`toggle` / `flattenVisible` / `reload` / `iconFor` / `chevronFor` / `isSelected` 零 diff） |

### 0.3 本档新增的显式冻结（只补实现层命名与常量，不改任何判据）

| 项 | 冻结值 | 理由 |
| --- | --- | --- |
| 渲染层 store 内部命名 | `externalChange`（ref，暴露）/ `checkNotesFile()`（暴露）/ `syncNotesFile(mode: "capture" \| "compare")`（内部）/ `notesFileSeq`（内部序号）/ `notesFingerprint`（内部基线） | 与 `undoScope` / `reportScope` 同层同语系；§0.8 只冻结语义与「必须暴露前两个」 |
| 标记清零点与捕获点分离 | 清零点 = `loadNotes()` 成功分支 / `applyNotes()` / `recoverCorruptNotes()` 成功分支 / `resetNotes()`（各 1 行 `externalChange.value = false;`）；捕获点 = 前三处各追加 1 行 `void syncNotesFile("capture");` | 捕获走 IPC（可能失败），清零是「读盘/写盘成功的直接后果」——两者分离才能在 `r14-4` 的失败注入下仍满足「刷新成功 ⇒ 提示消失」（§1.6 状态机） |
| 面板内部命名 | `refreshing`（ref）/ `onRefreshNotes()` / `onWindowFocus()` / `onGroupOpen(group)` | §0.8 命名清单（语义冻结、命名自由）；`onRefreshNotes` 不复用既有 `retryLoad`（后者无在途守卫与 loading 态） |
| 离屏新增 helper（**6** 个，命名自由、语义冻结） | ①`triggerWindowFocus()` ②`badgeProbe(rowExpr)` ③`staleProbe()` ④`appendExternalNote(note)` ⑤`removeExternalNote(id)` ⑥`badgeTextExpr(suffix, expected)` | ①–⑤ 与 N90-3 逐字对应；⑥ 是本档补的第 6 个（纯 Node 侧表达式串，供 `waitFor` 轮询徽标文本，≥4 处复用；不新增任何 DOM 契约） |
| 外部改动夹具命名 | `n-external-1`（`archive/older-paper.pdf` p1）/ `n-external-2`（`reading-notes.md` p1）/ `n-external-3`（`sample-paper.pdf` p1），正文逐字 `External edit: this note was appended outside the app.` | N90-3 夹具表；三条互不重名、与标准种子不重名；docPath 互不相同 ⇒ 去重键不冲突 |
| Node 侧笔记文件读写（离屏） | `writeNotesOutside(list)` / `appendExternalNote(note)` / `removeExternalNote(id)` 全部以 `NOTES_FILE`（A 根）为唯一目标，字节格式 = `JSON.stringify({version: 1, notes: list}, null, 2) + "\n"`（与 stub 的 `writeNotesFile` 逐字同格式） | 外部改动必须由 Node 侧真写真改（模拟编辑器/脚本），与渲染层 store 无任何耦合 |
| 徽标让位判据（本档新增的可判定式，用于默认宽度与窄栏两相位） | `labelClientWidth ≥ min(labelScrollWidth, labelFloor) − 1`，其中 `labelFloor = rowClientWidth − paddingLeft − paddingRight − spacerWidth − iconWidth − progressClientWidth − 4 × gap` | 把 §0.3「缺口全部由徽标承担」写成可复跑的数值判据：徽标可收缩时左侧恒成立；若徽标不可收缩（或反向挤动 label），该式判红（推导见 §1.4） |
| 草稿夹具文本 | `刷新不应丢弃这段草稿`（逐字；写入 `n-current-1` 行的备注编辑框） | §0.6 规则 2 的现场证据；`n-current-1` 不在任何相位的改动路径上 |

### 0.4 本轮不得改动的既有冻结面

见 §2.1（与需求档 §0.1 同口径，本档只补判据命令）。

### 0.5 与上游档件的口径差异登记（本档以真实读数与可实现性为准，逐条说明）

| # | 上游写法 | 本档实读 / 处理 | 影响 |
| --- | --- | --- | --- |
| a | R14-req 事实表与 §0.8：「`SEL`（`:47-110`，R13 后 **41** 项）」 | 本档程序化计数（按 `const SEL = {` … `};` 内的顶层键）⇒ **54** 项（24 基础 + R10 7 + R11 11 + R12 8 + R13 4），行范围 `:47-106`；本轮新增 6 ⇒ **60** 项 | 判据「只增不减」不受影响；本档一律以 54 / 60 为准 |
| b | R14-req 事实表：`.notes-export-row`（`:552`）/`.notes-report-row`（`:565`） | 实读 `:550` / `:562`（`.notes-loading` `:575`、`.notes-group-head` `:621`、`.group-count` `:627`） | 本档行号一律用实读值 |
| c | R14-req N87-4 #2：「`.row-progress` 的**几何不变**、`.row-label` 的截断深度不超过 R13 读数 + 4px」 | 窄栏下 `.row-progress` 的 `x/left` 必然随行宽左移（行盒宽 246 → ≈198），且**树行没有 R13 窄栏读数**（`--pix-left-width: 220px` 的既有相位只测笔记面板行）⇒ 该写法不可判定 | 本档改写为：文本与**盒宽**不变 + 右缘贴行内边距 + **徽标让位判据**（§1.4 / §5.4）；绝对坐标不参与判定 |
| d | R14-req N88-4 #4⑤：「`notesHash()` 与'刷新只读'断言一致」 | 续段的「外部删除编辑中那一条」必然改哈希 ⇒ 该半句不可判定 | 本档改为：`notesAddCalls()` / `notesReportCalls()` 增量 0 + `notesLoadCalls()` 增量恰 1 + `readNotes().length === 5`（§5.4 `r14-3` 续段 ⑯） |
| e | R14-req 多处写 `notesLoadCalls()` | 真实 helper 名 = `loadCalls()`（`ui-shot.mjs:4072`，返回 `window.__pixStub.notesLoadCalls()`） | 本档统一用 `loadCalls()`；stub 控制口名 `notesLoadCalls` 不变 |
| f | R14-req N88-2 #4：「基线捕获点恰 3 处（`grep -c "syncNotesFile(\"capture\")"` = 3）」 | 本档同数，同时登记「④ 写操作成功」也走 `applyNotes()`（同一处调用即覆盖 `addNote` / `update` / `delete` / `restore` 四条写路径） | 判据不变；语义澄清登记 |

---

## 1. 契约冻结表

### 1.1 新 IPC `notes-stat`：通道 / 入参 / 返回 / 错误码与四面同步

#### 1.1.1 通道与 handler（逐字）

| 项 | 值 |
| --- | --- |
| 通道 | `notes-stat` |
| 入参 | **无**（`ipcRenderer.invoke("notes-stat")` 零实参；handler 不声明入参） |
| 返回 | `ReaderNotesStatResult`（§1.1.2） |
| 错误码 | **不扩** `ReaderNotesErrorCode`（既有 11 键）；只用 `no-root` / `read-failed`；失败以返回字段表达，**永不抛错** |
| handler 逐字（落点：`ipc-handlers.ts` 的 `Reader notes` 分节内、`notes-export-report`（`:529-531`）之后、`// Reader state` 分节注释（`:533-535`）之前） | `ipcMain.handle("notes-stat", () => statNotesFile());` |
| import 追加 | `:21` 的 `import { addNote, deleteNote, exportDocumentReport, exportNotesMarkdown, loadNotes, resetCorruptNotes, restoreNote, updateNoteComment } from "./notes-store.js";` ⇒ 名单内按字母序插入 `statNotesFile`（`… restoreNote, statNotesFile, updateNoteComment } from "./notes-store.js";`） |

#### 1.1.2 类型（`pix/src/shared/types.ts`，名字与字段逐字冻结）

落点：紧接 `ReaderNotesLoadResult`（`:383-389`）之后、`ReaderNotesMutationResult`（`:392`）之前（与「读」相关的类型同块）。

```ts
/** 笔记文件指纹：只读的最小事实（不解析内容、不改文件）；失败时 success=false 且事实字段归零。 */
export interface ReaderNotesStatResult {
  success: boolean;
  exists: boolean;
  size: number;
  mtimeMs: number;
  hash: string;
  code?: ReaderNotesErrorCode;
  error?: string;
}
```

冻结口径（与需求 §0.5 逐字一致）：

| 字段 | 语义 |
| --- | --- |
| `hash` | 文件**原始字节**的 sha256 十六进制小写（未剥 BOM、未解析）；`exists === true` 时恒为 64 字符，`exists === false` 时恒为 `""` |
| `size` / `mtimeMs` | `exists === true` 时取 `statSync` 真实值（`mtimeMs > 0`、`size ≥ 0`）；`exists === false` 或 `success === false` 时恒为 `0` |
| 语义边界 | 损坏 / 版本不支持的内容照常 `success: true` + 真实 `hash`（**不返回** `corrupt` / `version-unsupported`）；文件缺失是**成功**的统计（`exists: false`）；只读（不建目录、不建文件、不改 mtime） |
| 文档注释纪律 | 注释行**不得**出现类型名（`grep -c "ReaderNotesStatResult" types.ts` = **1** 的判据要求） |

#### 1.1.3 preload（两处，逐字）

| 落点 | 逐字 |
| --- | --- |
| `PixApi` 接口（`:78` `notesReset` 之后、`// Reader state` 分节之前） | `  notesStat: () => Promise<ReaderNotesStatResult>;` |
| `api` 实现（`:169` `notesReset` 之后、`readerStateLoad` 之前） | `  notesStat: () => ipcRenderer.invoke("notes-stat") as Promise<ReaderNotesStatResult>,` |
| 类型 import（`:11-31` 的 `import type { … } from "../shared/types.js";` 名单内） | 追加 `  ReaderNotesStatResult,`（按字母序插在 `ReaderNotesResetResult` 与 `ReaderStateLoadResult` 之间） |

改后 `PixApi` / `api` 各 **42** 方法，既有 41 个逐字不动。

#### 1.1.4 stub 面（`ui-shot.mjs` 的 `buildStub()`，逐字）

stub 面扩展（**四项**，全部落在 `buildStub()` 的模板串内）：

| # | 项 | 逐字实现 | 说明 |
| --- | --- | --- | --- |
| 1 | `require` 面 | 在 `const path = require("node:path");` 之后追加 `const crypto = require("node:crypto");` | 当前 require 面为 `electron` / `node:fs` / `node:path`（`:424-425`） |
| 2 | 笔记文件根函数 | `function currentNotesFile() { return path.join(activeRoot, ".pix-read", "notes.json"); }`；`readNotesFile` / `writeNotesFile` / `notesLoad` 三处的 `NOTES_FILE` 改用 `currentNotesFile()`（`notesLoad` 返回的 `filePath` 同步改为 `currentNotesFile()`） | 笔记根随 `activeRoot`（与 `stateFilePath()` 同纪律，`:678-680`）；`NOTES_FILE` 常量保留（= `CONFIG.notesFilePath` = A 根），继续服务 `seedNotes` 返回值 / `notesReset` 备份名等 A 根锚点 |
| 3 | `notesStat` 方法（真读真算） | 见下方参考实现，插在 stub `api` 的 `notesReset` 之后（保持与 preload 的方法顺序逐字一致） | 不解析内容（损坏文件照常返回真实字节哈希）；调用进入即计数 |
| 4 | 失败注入与计数 | 模块级 `let notesStatCalls = 0;` / `let notesStatFailure = null;`（`notesStatFailure` 取值 `null` / 错误码 / `"throw"`），并在 `__pixStub` 暴露 `notesStatCalls: function () { return { count: notesStatCalls }; }` 与 `setNotesStatFailure: function (code) { notesStatFailure = code || null; }` | 错误码文案复用既有 `NOTES_ERRORS[code] || code`（`NOTES_ERRORS` 已含 `read-failed: 笔记文件读取失败`） |

stub `notesStat` 参考实现（语义冻结；等价写法允许，逐条判据不变）：

```js
  notesStat: async function () {
    notesStatCalls += 1;
    if (notesStatFailure === "throw") throw new Error("stub notesStat 注入异常");
    if (notesStatFailure) {
      return {
        success: false,
        exists: false,
        size: 0,
        mtimeMs: 0,
        hash: "",
        code: notesStatFailure,
        error: NOTES_ERRORS[notesStatFailure] || notesStatFailure,
      };
    }
    const file = currentNotesFile();
    let bytes;
    try {
      bytes = fs.readFileSync(file);
    } catch (err) {
      if (err && err.code === "ENOENT") return { success: true, exists: false, size: 0, mtimeMs: 0, hash: "" };
      return { success: false, exists: false, size: 0, mtimeMs: 0, hash: "", code: "read-failed", error: NOTES_ERRORS["read-failed"] };
    }
    const stat = fs.statSync(file);
    return {
      success: true,
      exists: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      hash: crypto.createHash("sha256").update(bytes).digest("hex"),
    };
  },
```

`activeRoot` 影响面（冻结，与需求 §0.8 逐字一致）：随 `activeRoot` = `readNotesFile` / `writeNotesFile` / `notesLoad` / `notesStat`，外加本档新增的 `currentNotesFile()`；仍锚 A 根 = `relativeDocPath` / `isInsideNotesRoot` / `notesExport`（`:1007-1010`）/ `notesExportReport`（`:1012-1048`）/ `notesReset`（`:1050-1055`）⇒ B 侧写操作仍判 `outside`（本轮无场景触发，登记为已知简化）。

#### 1.1.5 四面同步判据（命令级）

1. 【走查】`grep -rn "notes-stat" pix/src | wc -l` = **2**（handler 1 + preload 实现 1）；`grep -c "notesStat" pix/src/main/preload.ts` = **2**（接口 1 + 实现 1）；`grep -c "ReaderNotesStatResult" pix/src/shared/types.ts` = **1**（定义 1）、`grep -c "ReaderNotesStatResult" pix/src/main/preload.ts` = **3**（import 1 + 接口返回类型 1 + 实现断言类型 1）。
2. 【走查】改后 `PixApi` 接口 / `api` 实现 / `ui-shot.mjs` stub `api` **各 42 项**，且三处方法名清单逐字相等（顺序亦相同）——建议命令：以 `^  [A-Za-z0-9_]+[:(]` 提取三处名单并做字符串相等比较（本档 §0.1 已用同法核对改前 41 / 41 / 41 三者相等）。
3. 【走查】既有七通道（`notes-load` / `notes-add` / `notes-update` / `notes-delete` / `notes-restore` / `notes-export` / `notes-export-report` / `notes-reset`）的 handler 行与形状零改动；`ReaderNotesErrorCode` 仍 **11** 键（`no-root` / `outside` / `invalid-input` / `too-long` / `not-found` / `corrupt` / `version-unsupported` / `read-failed` / `write-failed` / `empty` / `not-corrupt`）。
4. 【走查】只读实现：`statNotesFile()` 函数体内不出现 `writeFileSync` / `mkdirSync` / `rmSync` / `renameSync`（`grep -c` 各 0，可见范围限该函数体）；不调用 `parseNotesFile` / `readNotesFile`（不解析内容）。
5. 【check】`CHECK_EXIT=0`。
6. 【离屏】`r14-3` 相位 `detect`：`notesStatCalls()` 增量 ≥ 1（检测确实走新通道），且检测前后 `notesHash()` 不变（只读）。

### 1.2 主进程 `statNotesFile()`（参考实现 + 返回面五情形）

落点：`pix/src/main/notes-store.ts` 内，紧接 `resetCorruptNotes()`（`:527`）之后的文件末尾（新增导出，不插进既有函数之间）。import 追加：`:10` 追加 `createHash`（`node:crypto`）、`:11` 追加 `statSync`（`node:fs`）；类型 import 名单（`:14-27`，现止于 `ReaderNotesResetResult,`（`:26`））在 `ReaderNotesResetResult,` 之后插入 `  ReaderNotesStatResult,`（字母序 `Reset` < `Stat`）——缺此一行 `npm run check` 必红（MF-1）。

```ts
/**
 * 笔记文件指纹（R14）：只读的最小事实 —— 不解析内容、不建目录/文件、不改 mtime、永不抛错。
 * 判定顺序：无根 → 读文件（ENOENT ⇒ exists:false 的成功统计；其余失败 ⇒ read-failed）→ sha256 原始字节。
 */
export function statNotesFile(): ReaderNotesStatResult {
  const paths = notesPaths();
  if (!paths) {
    return { success: false, exists: false, size: 0, mtimeMs: 0, hash: "", code: "no-root", error: ERROR_MESSAGES["no-root"] };
  }
  try {
    const bytes = readFileSync(paths.file);
    const stat = statSync(paths.file);
    return {
      success: true,
      exists: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      hash: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (err) {
    if (isEnoent(err)) return { success: true, exists: false, size: 0, mtimeMs: 0, hash: "" };
    return { success: false, exists: false, size: 0, mtimeMs: 0, hash: "", code: "read-failed", error: ERROR_MESSAGES["read-failed"] };
  }
}
```

返回面五情形（逐字，即烟测 `notes-stat` 组的期望值来源）：

| # | 情形 | `success` | `exists` | `size` / `mtimeMs` | `hash` | `code` / `error` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 无工作区根（`notesPaths() === null`） | `false` | `false` | `0` / `0` | `""` | `"no-root"` / 逐字 `尚未选择资料库根目录` |
| 2 | 文件不存在（ENOENT，含目录不存在） | `true` | `false` | `0` / `0` | `""` | 无 |
| 3 | 读取 / stat 失败（非 ENOENT，如权限） | `false` | `false` | `0` / `0` | `""` | `"read-failed"` / 逐字 `笔记文件读取失败` |
| 4 | 正常文件 | `true` | `true` | `statSync` 真实值 | 原始字节 sha256 | 无 |
| 5 | 内容损坏 / 版本不支持 | `true` | `true` | `statSync` 真实值 | 原始字节 sha256 | **无**（不解析 ⇒ 不返回 `corrupt` / `version-unsupported`） |

### 1.3 计数派生 `countNotesByDocument`（签名 / 参考实现 / memo / 行渲染）

签名（`pix/src/renderer/utils/notes-path.ts`，新增；`NotesBadgeCount` 与 `outline-notes.ts` 的 `ChapterNoteCount` 同构）：

```ts
export interface NotesBadgeCount {
  total: number;
  excerpt: number;
  answer: number;
}

/** 按文档聚合的笔记计数（R14 树徽标唯一派生）：单次遍历、键 = docPathKey、只产出 total > 0 的文档、每次返回新 Map。 */
export function countNotesByDocument(notes: ReaderNote[]): Map<string, NotesBadgeCount> {
  const counts = new Map<string, NotesBadgeCount>();
  for (const note of notes) {
    const key = docPathKey(note.docPath);
    const current = counts.get(key) ?? { total: 0, excerpt: 0, answer: 0 };
    current.total += 1;
    if (note.kind === "answer") current.answer += 1;
    else current.excerpt += 1;
    counts.set(key, current);
  }
  return counts;
}
```

> 上式是参考写法之一；**语义冻结**的是：单次遍历、循环体内无嵌套循环、键 = `docPathKey(note.docPath)`、只写 `total > 0` 的键（键只在见过该文档的条目时创建）、不修改入参数组与既有 `ReaderNote` 对象、每次调用返回新 `Map`、`total === excerpt + answer`（`kind === "answer"` 分支优先，其余计入 `excerpt`）。等价写法允许，逐条判据不变。

落点：`notes-path.ts` 的 `groupNotesByDocument`（`::67`）之前、`matchesChapterFilter`（`:60`）之后（与「按文档聚合」语义相邻）。

memo 策略与行渲染（`LibraryPanel.vue`）：

```ts
const notesStore = useNotesStore();
/** 聚合结果：仅随 notes 列表变化重算（Vue computed memo；面板与树读同一份事实）。 */
const noteCountMap = computed(() => countNotesByDocument(notesStore.notes));
/** 行 + 徽标：键与树节点同源（currentDocKey）；每行恰一次 Map.get；0 命中 / 目录行 ⇒ null（不渲染）。 */
const rowsWithBadge = computed(() =>
  rows.value.map((row) => {
    const key = row.node.type === "file" ? currentDocKey(row.node.path, props.rootDir) : null;
    return { ...row, badge: key === null ? null : noteCountMap.value.get(key) ?? null };
  }),
);
```

| 冻结项 | 值 |
| --- | --- |
| import 追加 | `import { useNotesStore } from "../../stores/notes-store";` + `import { countNotesByDocument, currentDocKey } from "../../utils/notes-path";` |
| 模板数据源 | `v-for="row in rowsWithBadge"`（`:151`；`rows` 本身及其它绑定零改动，见 §2.2 第 2 行） |
| 每行取值 | 模板只读 `row.badge`（`v-if="row.badge"` + `{{ row.badge.total }} 条` + title 两段）⇒ 每行恰一次 `Map.get`，模板内不出现对派生函数的调用 |
| memo | 两层 `computed`：`noteCountMap` 只依赖 `notesStore.notes`（引用变即重算）；`rowsWithBadge` 依赖 `rows` 与 `noteCountMap`（树/展开态或列表变化才重算） |
| 与面板计数的口径差异（冻结） | 徽标恒示**该文档全量条数**；面板 `.group-count`（`:627` 的 `共 {N} 条`）= `group.notes.length`，而 `groups = applyViewToGroups(groupNotesByDocument(…))`（`renderer-store:142-145`）⇒ 过滤态（搜索 / 章节过滤 / 仅看当前文档）下可与 `.group-count` 不等（正确语义，判据见 §5.4 `r14-1` 相位 `live` ⑨） |

### 1.4 树徽标：DOM / 类名 / 逐字文案 / 盒模型 / 压缩降级 / 几何

| 项 | 逐字值（与需求 §0.3 一致） |
| --- | --- |
| 触发面 | 资料库树（`LibraryPanel.vue`）的 `.tree-row`，仅 `row.node.type === "file"` |
| 渲染条件 | `currentDocKey(row.node.path, props.rootDir)` 命中 `noteCountMap`（`total > 0`）；目录行与 0 笔记行**不渲染任何新节点**（`v-if="row.badge"`，`badge === null`） |
| DOM 位次 | `.row-label`（`:164`）**之后**、`.row-progress`（`:165`）**之前** |
| 类名 | `.row-notes`（`<span>`） |
| 文本 | `{{ row.badge.total }} 条`（数字与「条」之间恰一个半角空格；无「笔记」前缀、无图标） |
| 行内 `title` | `` :title="`摘录 ${row.badge.excerpt} 条 · AI 结论 ${row.badge.answer} 条`" ``（两段**恒给**，分隔符 = 半角空格 + `·`(U+00B7) + 半角空格） |
| 模板逐字 | `<span v-if="row.badge" class="row-notes" :title="`摘录 ${row.badge.excerpt} 条 · AI 结论 ${row.badge.answer} 条`">` / `{{ row.badge.total }} 条` / `</span>`（三行；含 `摘录` / `AI 结论` 的行**只有一行** ⇒ 走查 #3 可判） |
| 盒模型（冻结） | `flex-shrink: 1000; min-width: 0; overflow: hidden; white-space: nowrap; padding: 0; font-size: 10px; line-height: 1.4; color: var(--pix-text-secondary);`（**不得** `margin-left: auto` / 背景 / 边框 / 水平内边距 / `text-overflow`；不新增 CSS 变量） |
| CSS 落点 | 插在 `.row-label` 规则（`:252-256`）之后、`.row-progress` 规则（`:257`）之前；CSS 注释**不得**包含类名字面（走查 #2 的行计数要求模板 1 + 样式 1 = 2） |
| 压缩与降级 | 缺口全部由徽标承担、文本按**右端硬裁切**（数字在最左 ⇒ 优先保留）；压缩到 0 宽即整体不可见（无背景/边框 ⇒ 不存在空胶囊）；**不得** `text-overflow: ellipsis` |
| 文本判据口径 | 一律 `textContent` + 空白归一化（`replace(/\s+/g, " ").trim()`）⇒ 恒为逐字 `{N} 条`，与被压缩与否无关；几何判据只在树可见的相位（`badges` / `narrow`）使用（面板打开时树 `display:none`，几何为 0） |

几何推导（默认宽度，基于 §0.1 的基线实测与 CSS 盒模型；**dev 档必须登记实测读数**）：

| 量 | 推导 | 值 |
| --- | --- | --- |
| 行内容宽 | `rowClientWidth 246 − paddingLeft(8 或 22) − paddingRight(6)` | depth 0 = **232**、depth 1 = **218** |
| 固定项 | 占位 `14`（`.row-chevron-spacer`）+ 图标 `16`（`.row-icon`）+ 3 个既有 gap `3×4` | 42 |
| `.row-progress` 自然宽（反解） | 11px 下「数字 ≈0.575em、空格 ≈0.303em、CJK = 1em」⇒ `第 3 页` ≈ 34.9 + `padding 1px 6px` = ≈46.9；`第 1024 页` ≈ 53.9 + 12 = ≈65.9（与需求档引用的像素读数 47 / 66 一致） | **≈47 / ≈66** |
| 徽标自然宽（10px） | `3 条` = 数字 ≈5.75 + 空格 ≈3.03 + `条` 10 = **≈18.8**；插入后多消耗 1 个 gap ⇒ 需要 **≈22.8** | 18.8 / 22.8 |
| 插徽标前余量 | sample `232 − (14+16+109+47+3×4)` = **34**；older `218 − (14+16+96+66+3×4)` = **14** | 34 / 14 |
| 结论 | sample：34 ≥ 22.8 ⇒ **完整显示 `3 条`**；older：缺口 `18.8 + 4 − 14` = **8.8 ≤ 可收缩量 18.8** ⇒ 徽标落到 **≈10.0**，`.row-label` / `.row-progress` 零位移 | — |
| 次像素说明（登记项） | 缺口按 `flex-shrink × 基准宽` 权重分配：徽标 `1000×18.8`、label `1×96` ⇒ 徽标承担 ≈99.5%（older 行 8.76px）、label 承担 ≈0.04px（亚像素）；整数读数为 96/96 时既有 `overflowFree` 保持绿。若不同 DPR 下取整方向不利，按需求 §0.9 硬约束继续收窄徽标盒模型并在 dev 档登记 | — |

徽标让位判据（本档新增，`badges` / `narrow` 两相位共用；字段来源见 §5.4.2 的 `badgeProbe`）：

```
labelFloor = rowClientWidth − paddingLeft − paddingRight − spacerWidth − iconWidth − progressClientWidth − 4 × gap
断言：labelClientWidth ≥ min(labelScrollWidth, labelFloor) − 1
```

- 语义：`labelFloor` = 「假定徽标只花掉自己的两个 gap（不占任何宽度）时」行名应有的可用宽；`min(…, …)` 把「行名本来就短、无需占满余量」的行排除在外。左侧 ≥ 右侧 ⇒ 徽标没有反向挤动行名（两侧都可由 §5.4.2 的探针现场读取）。
- 默认宽度（sample `labelFloor = 232 − 14 − 16 − 47 − 16 = 139`）：`min(109, 139) − 1 = 108 ≤ 109` ✓（徽标未压缩）；older（`labelFloor = 218 − 14 − 16 − 66 − 16 = 106`）：`min(96, 106) − 1 = 95 ≤ 96` ✓（徽标压缩后行名零位移）。
- 判别力（反例）：若徽标不可收缩（固定 18.8px），older 行名会掉到 ≈87 ⇒ `87 ≥ 95` 为假 ⇒ **判红**。
- 窄栏（`.layout-left` ≈220，内容宽 sample 184 / older 170）：sample `labelFloor = 184 − 14 − 16 − 47 − 16 = 91` ⇒ 断言 `labelClientWidth ≥ 90`（预期 ≈90）；older `labelFloor = 170 − 14 − 16 − 66 − 16 = 58` ⇒ 断言 `labelClientWidth ≥ 57`（预期 ≈58）；若徽标不可收缩，older 行名会掉到 ≈39 ⇒ 判红。

### 1.5 检测时机：四个时刻的确切实现点（事件名 + 注册处）

| # | 时机 | 确切实现点 | 动作 |
| --- | --- | --- | --- |
| ① 进入工作区 | `WorkspacePage.vue:98-99`（`onMounted` 内、`syncWorkspaceState` 之后：`notesStore.resetNotes(); await notesStore.loadNotes();`） | **capture**（在 `loadNotes()` 成功分支内落地，WorkspacePage **零改动**） |
| ② 窗口重新获得焦点 | `NotesPanel.vue` 新增 `onMounted(() => { window.addEventListener("focus", onWindowFocus); })`；注销在既有 `onBeforeUnmount`（`:415-431`）内追加 `window.removeEventListener("focus", onWindowFocus);` | **compare**（`function onWindowFocus(): void { void notesStore.checkNotesFile(); }`；事件名 = `window` 的 `"focus"`，注册处 = 面板 `onMounted`） |
| ③ 打开笔记面板 | `WorkspacePage.vue:202`（`selectLeftTab` 内 `if (tab === "notes") void notesStore.loadNotes();`） | **capture**（同 ①，WorkspacePage **零改动**） |
| ④ 写操作成功后 | `renderer/stores/notes-store.ts` 的 `applyNotes()`（`:174-184`；`addNote` / `runMutation`（update）/ `removeNote` / `undoDelete` 共 4 处调用，`grep -c "applyNotes("` = 5 含定义）+ `recoverCorruptNotes()` 成功分支（`:332-341`） | **capture**（写成功后重新对标 ⇒ 提示消失） |

纪律：

1. **无轮询**：不引入 `setInterval` / `setTimeout` / `fs.watch` / `chokidar`；检测只在上述四时刻发生。
2. **焦点监听的对象与阶段**：`window`（布尔捕获 = `false`，与既有 `pointerdown` 的捕获式监听不同）；`window` 级 `focus` 只在窗口获得焦点时派发（元素级 focus 不冒泡到 window 的冒泡阶段监听器）⇒ 不会因面板内输入框聚焦而误报。
3. **离屏可构造性**：`triggerWindowFocus()` = 在页面内 `window.dispatchEvent(new Event("focus"))`，直接命中该监听器（登记：真实窗口激活路径无法由离屏覆盖，dev 档做一次人工走查并登记结论）。
4. **注册/注销成对**：同文件内恰 1 处注册、恰 1 处注销（§1.8 走查 #9）。

### 1.6 渲染层 store 的检测状态机（状态 / 基线 / 失败静默 / 竞态 / 复位）

新增状态与内部变量（落点：`externalChange` 紧接 `pendingUndo`（`:109`）之后；`notesFileSeq` / `notesFingerprint` 紧接 `reportScope`（`:131`）之后）：

```ts
/** 外部改动标记：只在 store 内部改写；唯一渲染条件 = 面板提示行的 v-if。 */
const externalChange = ref(false);
...
/** 指纹请求序号（R14）：响应落地时序号已变即丢弃（resetNotes() 递增 ⇒ 跨工作区在途作废）。 */
let notesFileSeq = 0;
/** 指纹基线（R14）：null = 尚未捕获（比对时按捕获处理）；"" = 文件缺失；其余 = sha256 十六进制。 */
let notesFingerprint: string | null = null;
```

唯一实现（语义冻结；函数体形状即判据）：

```ts
/**
 * 指纹同步（唯一入口）：capture = 重新对标；compare = 置 / 清 externalChange。
 * 失败静默：IPC reject、success !== true、非字符串 hash 三种情形一律 return（保持现状：不置位、不清除、不弹错、不写日志）。
 */
async function syncNotesFile(mode: "capture" | "compare"): Promise<void> {
  const seq = ++notesFileSeq;
  let result: ReaderNotesStatResult;
  try {
    result = await bridge().notesStat();
  } catch {
    return;
  }
  if (seq !== notesFileSeq) return;
  if (!result || result.success !== true || typeof result.hash !== "string") return;
  const fingerprint = result.exists ? result.hash : "";
  if (mode === "capture") {
    notesFingerprint = fingerprint;
    return;
  }
  if (notesFingerprint === null) {
    notesFingerprint = fingerprint;
    return;
  }
  externalChange.value = fingerprint !== notesFingerprint;
}

/** 检测入口（面板焦点监听唯一调用点）。 */
async function checkNotesFile(): Promise<void> {
  await syncNotesFile("compare");
}
```

三处调用点（各 2 行，追加在既有状态写入之后；`grep -c "syncNotesFile(\"capture\")"` = **3**）：

| 调用点 | 追加内容 |
| --- | --- |
| `loadNotes()` 成功分支（`:200-203`） | `externalChange.value = false;` + `void syncNotesFile("capture");` |
| `applyNotes()`（`:174-184`） | 同上（写成功 ⇒ 面板与文件一致 ⇒ 标记清零；基线由 stat 重新捕获） |
| `recoverCorruptNotes()` 成功分支（`:332-341`） | 同上 |

`resetNotes()`（`:352-370`）追加 3 行：`notesFileSeq += 1;` / `notesFingerprint = null;` / `externalChange.value = false;`。

| 冻结语义 | 值 |
| --- | --- |
| 判定式 | `externalChange ⇔ (exists ? hash : "") !== 基线`；基线为 `null` 时按捕获处理（不置位） |
| 指纹归一 | `fingerprint = result.success && result.exists ? result.hash : ""`（文件缺失记 `""` ⇒ 创建 / 删除文件都会命中不一致） |
| 只认 `hash` | `size` / `mtimeMs` 只作观测事实，不参与判定 |
| 失败静默 | 三种失败（`success === false` / 非字符串 `hash` / IPC reject）**一律 `return`**：不置位、不清除、不弹错、不写日志、不改 `status` |
| 竞态 | `notesFileSeq`：响应落地时序号已变即丢弃；与 `loadSeq` / `writeScope` / `undoScope` / `reportScope` 同范式 |
| 标记清零的四种路径 | ① `loadNotes()` 成功（含进入工作区 / 打开面板 / 点「刷新」/ 错误态重试）② `applyNotes()` ③ `recoverCorruptNotes()` 成功 ④ `resetNotes()`；**没有**定时器、没有关闭按钮 |
| 登记项（⇔ 语义的直接后果） | 若外部改动被撤回成与基线逐字节相同的文件，下一次 compare 会把标记清零（判定式是等价式）；「不自动消失」指不随时间/事件自动消解为「已同步」 |
| 登记项（捕获失败） | 写成功但 `notesStat` 失败时：标记已清零（写成功的直接后果），基线停留旧值 ⇒ 下一次 compare 可能置位一次（非静默错误：用户看到提示并可刷新）；离屏的失败注入只作用于 compare 相位（§5.4 `r14-4`） |

### 1.7 面板：提示行 + 刷新状态机（含草稿冲突）+ 组头跳转

#### 1.7.1 提示行模板（逐字；插入点 = `.notes-notice` 块（`:536-542`）之后、`.notes-undo` 块（`:543`）之前）

```html
    <div v-if="notesStore.externalChange" class="notes-stale">
      <span class="stale-text">笔记文件已被外部修改，面板内容可能过期</span>
      <v-btn
        class="stale-refresh"
        size="x-small"
        variant="text"
        prepend-icon="mdi-refresh"
        title="重新读取笔记文件"
        :loading="refreshing"
        :disabled="refreshing"
        @click="onRefreshNotes"
      >
        刷新
      </v-btn>
    </div>
```

| 冻结项 | 值 |
| --- | --- |
| 渲染条件 | `notesStore.externalChange === true`（**单一条件**，不附加 `status` 条件 ⇒ 刷新失败时提示保留、与错误态并存） |
| 提示文本 | `.stale-text` 逐字 `笔记文件已被外部修改，面板内容可能过期`（唯一出现处 = 本模板；`grep -rn` = 1） |
| 刷新按钮 | `.stale-refresh` = `v-btn` + `size="x-small"` + `variant="text"` + `prepend-icon="mdi-refresh"`；文本逐字 `刷新`；`title` 逐字 `重新读取笔记文件`；度量按 Vuetify（`--v-btn-height: 20px`、`font-size: 0.625rem`，见 `pix/node_modules/vuetify/lib/components/VBtn/VBtn.css:27-29`），**不写** padding / font-size 覆盖（先例 = `.notes-export-row` / `.notes-report-row` 的行内按钮） |
| 非阻塞 | 不遮罩、不弹窗、不锁滚动、不禁用任何既有控件；提示存在期间笔记行的点击 / 选择 / 追问 / 删除 / 备注编辑 / 搜索 / 导出 / 报告入口全部照常；提示不自动消失、无关闭按钮 |

#### 1.7.2 面板脚本新增（逐字语义）

```ts
const refreshing = ref(false);

/** 刷新的唯一动作：既有读盘语义（status=loading → 覆盖列表 → 成功后清标记）；只读，不发任何写 IPC。 */
async function onRefreshNotes(): Promise<void> {
  if (refreshing.value) return; // 在途第二次点击零副作用（不发第二次 IPC）
  refreshing.value = true;
  try {
    await notesStore.loadNotes();
  } finally {
    refreshing.value = false;
  }
}

function onWindowFocus(): void {
  void notesStore.checkNotesFile();
}

function onGroupOpen(group: NoteGroup): void {
  if (group.isCurrentDoc) return;
  emit("open-note-doc", group.docPath);
}
```

import 追加两处：`:10` 的 vue import 增 `onMounted`；`:13` 的 notes-path import 增 `import type { NoteGroup }`。`defineEmits`（`:52-54`）增 `"open-note-doc": [docPath: string];`（既有 `"open-note": [note: ReaderNote]` 逐字不动）。

#### 1.7.3 刷新动作状态机

| 状态 | 进入条件 | 行为 | 退出 |
| --- | --- | --- | --- |
| idle | 初始 / 落地后 | 提示行在屏（`externalChange === true`）等待用户动作 | 点击 `.stale-refresh` ⇒ in-flight |
| in-flight（`refreshing === true`） | `onRefreshNotes()` 首行置位；按钮 `:loading` + `:disabled` | 调 `notesStore.loadNotes()`（唯一 IPC = `notes-load`）；再点击被**首行守卫**拦下（Vue ref 同步更新 ⇒ 即使 `disabled` 尚未渲染也零副作用）；`loadNotes` 失败不发第二次 IPC | `finally` 内 `refreshing = false`；成功 ⇒ `list 覆盖` + `externalChange = false`（提示消失）+ 基线重捕；失败 ⇒ `status = "error"`、`externalChange` 保持不变、提示保留 |
| 条目级草稿（正交状态，随列表重渲染） | 用户点某行 `.comment-trigger`（`startCommentEdit` `:294-297`） | 刷新/检测**不读写** `editingCommentId` / `commentDraft` | 用户点「保存」/「取消」，或对其它条目重新打开编辑（既有 `startCommentEdit` 覆盖语义） |

草稿冲突四条规则（照抄需求 §0.6，逐条对应判据）：

| # | 规则 | 判据（§5.4 `r14-3` 相位 `refresh-draft` / 续段） |
| --- | --- | --- |
| 1 | 检测与刷新都不得读写 `editingCommentId` / `commentDraft`；不自动保存、不自动清空、不自动关闭编辑框 | ⑪ 刷新后 textarea 仍在 DOM 且 value 逐字 = 草稿、`.comment-actions` 的保存 / 取消按钮仍在 |
| 2 | 条目不仍在 ⇒ 编辑框保持打开、`commentDraft` 逐字不变（草稿优先于文件里的 `comment`） | ⑪（草稿未被文件值覆盖） |
| 3 | 条目已不在（外部删除）⇒ 行与编辑框随数据消失；内存值不自动清理、不自动保存、不自动丢弃 | ⑮⑯ |
| 4 | 刷新只读：不发任何写 IPC；`notes.json` 字节在刷新前后逐字节不变 | ⑭ + 续段 ⑯ |

#### 1.7.4 组头跳转（逐字）

| 项 | 值 |
| --- | --- |
| 模板（改 `:621` 一行 + 保持子结构） | `<div class="notes-group-head" :class="{ 'is-openable': !group.isCurrentDoc }" :title="group.docPath" @click="onGroupOpen(group)">`（`.group-titles` / `.group-name` / `.group-path` / chip / `.group-count` 子结构逐字不动） |
| 判别用类 | `is-openable`（仅非当前文档组） |
| 样式（只允许这两条；不新增变量、无过渡动画；CSS 注释不得含类名字面） | `.notes-group-head.is-openable { cursor: pointer; }` + `.notes-group-head.is-openable:hover .group-name { color: var(--pix-text-link, #314b5f); }` |
| 当前文档组 | 不渲染 `is-openable`；点击（含点 `.group-name`）零副作用：不切文档、不跳页、不发 IPC、不改选择集 |
| 事件名 | `open-note-doc`（载荷 = `group.docPath`，**工作区相对**；不得复用既有的 `open-document`——后者载荷是绝对路径） |
| 处理器（`WorkspacePage.vue`） | `function onOpenNoteDoc(docPath: string): void { openDocumentFromLibrary(absoluteDocPath(rootDir.value, docPath)); }`；模板 NotesPanel 增 `@open-note-doc="onOpenNoteDoc"`（紧随既有 `@open-note="onOpenNote"` `:290`） |
| 既有效果复用 | 复用 `openDocumentFromLibrary`（`:190-194`）：`readerStateStore.requestRestoreFor(path)` 登记现场恢复意图 + `selectedFilePath` 赋值；不切标签、不折叠左栏、不写盘、不发新 IPC |
| 边界 | 目标文档磁盘缺失时**不做**存在性预检（与既有 `onOpenNote` 同口径，失败由阅读区既有错误态承担） |

#### 1.7.5 提示行与样式（逐字新增到 `<style scoped>`；紧接 `.notes-undo` 规则（`:989-998`）之后的合适位置）

```css
/* 外部改动提示行：盒模型逐字对齐撤销行（同 margin / padding / 边框 / 圆角 / 背景）；刷新按钮保持 Vuetify x-small text 形态。 */
.notes-stale {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 10px 6px;
  padding: 6px 8px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: var(--pix-radius-md);
  background: var(--pix-bg-elevated, #ffffff);
}

.stale-text {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--pix-text-secondary);
  word-break: break-word;
}
```

**不写** `.stale-refresh` 的样式规则（M9）；不新增 `--pix-*` 变量（`variables.css` 零 diff）。类名字面计数：`grep -c "notes-stale" NotesPanel.vue` = **2**（模板 1 + 样式 1，注释不得含该字面）。

### 1.8 走查判据（命令级，正反双向）

| # | 判据（命令 ⇒ 期望） |
| --- | --- |
| 1 | `grep -rn "notes-stat" pix/src \| wc -l` ⇒ **2**；`grep -c "notesStat" pix/src/main/preload.ts` ⇒ **2**（§1.1.5）；`grep -c "ReaderNotesStatResult" pix/src/main/notes-store.ts` ⇒ **2**（类型 import 1 + `statNotesFile` 返回类型 1）；`grep -c "ReaderNotesStatResult" pix/src/renderer/stores/notes-store.ts` ⇒ **2**（类型 import 1 + §1.6 `syncNotesFile` 的 `let result:` 标注 1；评审 MF-1③ 给 1 未计函数体标注 ⇒ 按可满足口径落为 2，见「定稿修订」表） |
| 2 | `grep -rn "row-notes" pix/src \| wc -l` ⇒ **2**（模板 1 + 样式 1） |
| 3 | `grep -rn "摘录\|AI 结论" pix/src/renderer/components/workspace/LibraryPanel.vue \| wc -l` ⇒ **1**（唯一一行 tooltip 模板） |
| 4 | `grep -rn "countNotesByDocument" pix/src \| wc -l` ⇒ **3**（定义 1 + LibraryPanel 的 import 1 + 调用 1）；`sed -n '/countNotesByDocument/,/^}/p' pix/src/renderer/utils/notes-path.ts \| grep -c "for ("` ⇒ **1**；`grep -c "for (" pix/src/renderer/utils/notes-path.ts` ⇒ **3**（既有 2 + 新增 1） |
| 5 | `grep -n "countNotesByDocument" -A 2 pix/src/renderer/components/workspace/LibraryPanel.vue` 命中行含 `computed(`；模板内不出现对派生函数的调用（每行只读 `row.badge`） |
| 6 | `git diff` 不显示 `toggle` / `flattenVisible` / `reload` / `iconFor` / `chevronFor` / `isSelected` 的函数体 ⇒ 懒加载调用次数与 R13 逐字一致（由零 diff 推导；不新增 `libraryList` 计数口） |
| 7 | `grep -rniE "setInterval\|setTimeout" pix/src/renderer/components/workspace/LibraryPanel.vue \| wc -l` ⇒ **0**；`grep -rn "notesStat\|notesLoad\|notesAdd" …/LibraryPanel.vue \| wc -l` ⇒ **0**；`grep -rn "ipcRenderer\|pixApi\." …/LibraryPanel.vue` 只命中既有两处 `libraryList` |
| 8 | `git diff -U0 pix/src/renderer/components/workspace/LibraryPanel.vue` 中 `.row-progress` **不作为 `+` / `-` 行出现**（上下文行不得用于判定）；`grep -c "margin-left: auto" …/LibraryPanel.vue` ⇒ **1** |
| 9 | `grep -rn 'addEventListener("focus"' pix/src \| wc -l` ⇒ **1**；`grep -rn 'removeEventListener("focus"' pix/src \| wc -l` ⇒ **1**（同一文件成对） |
| 10 | `grep -c 'syncNotesFile("capture")' pix/src/renderer/stores/notes-store.ts` ⇒ **3**；`grep -c "checkNotesFile" pix/src/renderer/components/workspace/NotesPanel.vue` ⇒ **1**；`grep -c "notesFileSeq" …/notes-store.ts` ⇒ **≥ 3**；`resetNotes()` 内 `externalChange.value = false` 与基线置空各 **1** 处；`grep -c "setInterval" …/notes-store.ts` ⇒ **0** |
| 11 | `grep -rn "open-note-doc" pix/src \| wc -l` ⇒ **3**（emits 声明 1 + emit 调用 1 + WorkspacePage 绑定 1）；`grep -c "open-document" …/NotesPanel.vue` ⇒ **0**；`grep -c "onOpenNoteDoc" …/NotesPanel.vue` ⇒ **0**；`grep -n "onOpenNoteDoc" …/WorkspacePage.vue` 命中 **2** 处；`grep -c "selectedFilePath.value = " …/WorkspacePage.vue` ⇒ **2**（与 R13 同） |
| 12 | `grep -n "is-openable" …/NotesPanel.vue` 命中 **3** 处（`:class` 1 + 样式 2）；`:title` 的**绑定表达式**逐字仍为 `group.docPath`（该行因新增 `:class` / `@click` 属预期改动，会以 `+` 行出现在 `git diff -U0`；上下文行不得用于判定——MF-3）；`.group-titles` / `.group-name` / `.group-path` / `v-chip` / `.group-count` 子结构零改动（`git diff -U0` 中这些字面不作为 `-` 行出现）；`grep -c "notes-stale" …/NotesPanel.vue` ⇒ **2** |
| 13 | 文案唯一：`grep -rn "笔记文件已被外部修改，面板内容可能过期" pix/src \| wc -l` ⇒ **1**；`grep -rn "重新读取笔记文件" pix/src \| wc -l` ⇒ **1**；`grep -rn "externalChange\|notes-stale" pix/src/main \| wc -l` ⇒ **0**；`grep -rn "\.pix-read" pix/src/renderer \| wc -l` ⇒ **2**（与 R13 同，渲染层不拼存储路径） |
| 14 | `grep -c "editingCommentId.value = " …/NotesPanel.vue` ⇒ **3**；`grep -c "applyNotes(" …/notes-store.ts` ⇒ **5**；`grep -c "console\." …/notes-store.ts` ⇒ **0** |
| 15 | `SEL` 只**追加** 6 项（54 ⇒ 60）：`git diff -U0 -- pix/scripts/ui-shot.mjs \| grep -cE '^\+\s+(rowNotes\|staleRow\|staleText\|staleRefresh\|groupName\|centerDocLabel): "'` ⇒ **6**；既有 54 项零删除（同上 diff 无 `^-` 的 `SEL` 项） |
| 16 | stub 面 = preload 面：`grep -n "notesStat" pix/scripts/ui-shot.mjs` 命中 ≥ 3（方法 1 + 控制口 1 + 注入 1）；`notesStatCalls` / `setNotesStatFailure` / `currentNotesFile` 各 ≥ 1 处；`NOTES_FILE` 常量**保留且仍被引用**（`:428` 定义 + `:1054` `backupPath` + `:1107` `seedNotes` 返回值，≥ 3 处）；`currentNotesFile()` 被 `readNotesFile` / `writeNotesFile` / `notesLoad`（两个分支的 `filePath`）/ `notesStat` 引用（`grep -n "currentNotesFile" pix/scripts/ui-shot.mjs \| wc -l` ⇒ **≥ 6**）；`grep -c "NOTES_FILE" pix/scripts/ui-shot.mjs` 改后 = **9**（= 14 − 5 处改用 `currentNotesFile()`；若 `notesLoad` 只改成功分支的 `filePath`（共 4 行）则为 10，以 dev 实测登记为准——MF-2） |
| 17 | 既有面零改写：`git diff -- pix/scripts/ui-shot.mjs` 不出现既有场景函数体的改动（`runScenario` / `r11-*` … `r13-*` 段落）；`git diff` 不出现 `pix/package.json` / `package-lock.json` / `pix/src/renderer/assets/styles/variables.css` / `pix/tsconfig*.json` / `pix/vite.config.ts` / `packages/**` |

---

## 2. 与既有冻结面的关系

### 2.1 本轮不得改动的既有类名 / 文案 / 场景 / 断言（零改动清单）

| 来源 | 冻结内容（本轮零改动） |
| --- | --- |
| R6 / R9 | 树行既有类名与结构 `.tree-row` / `.row-chevron` / `.row-chevron-spacer` / `.row-icon` / `.row-label` / `.row-progress`；`.row-progress` 的文案 `第 {N} 页` 与全部 CSS（含 `min-width: 46px` / `flex-shrink: 0` / `margin-left: auto`）；`toggle` 懒加载与 `flattenVisible` 语义；`.row-label` 与 `.row-progress` 的 flex 行为 |
| R6 | `reader-state.json` 读写语义、`progressPageFor` 派生、`loader` 徽标与 `requestRestoreFor`（徽标是并列新增的第二枚，不借用、不改写、不替换进度来源） |
| R8 / R9 / R10 / R13 | 笔记面板全部既有类名与文案：`.notes-header(-top)` / `.notes-count` / `.notes-export-btn`（`导出 Markdown` / `暂无笔记`）/ `.notes-search*` / `.notes-sort*` / `.notes-filter` / `.notes-chapter-filter*` / `.notes-selection-bar` / `.notes-notice` / `.notes-undo` + `.undo-text` / `.notes-export-row` + `.export-text` / `.notes-report-actions` / `.notes-report-btn` / `.notes-report-row` + `.report-text` / `.report-reveal` / `.notes-loading` / `.notes-error` / `.notes-empty` / `.notes-group*` / `.note-*`；分组头 `:title="group.docPath"`；`startCommentEdit` / `saveComment` 编辑态语义；选择集 / 搜索 / 排序 / 章节过滤 / 撤销 / 复制 / 报告入口 |
| R10 / R11 | 笔记七通道（`notes-load` … `notes-reset`）+ R13 的 `notes-export-report` 的形状、`ReaderNotesLoadResult` / `MutationResult` / `ExportResult` / `ResetResult` / `Report*`；`ReaderNotesErrorCode` 11 键；`.pix-read` 唯一写者纪律（写盘全在 `src/main`）；`undoScope` / `reportScope` / `stale` 范式 |
| 全局 | 既有 `--pix-*` 变量表（不新增变量）；既有中文文案；`WorkspacePage.vue` 的 `onMounted` / `onUnmounted` / `goHome` / `selectLeftTab` / `onOpenNote` / `openDocumentFromLibrary` 语义；`resetNotes()` 的既有字段清空集合 |
| R12 / R13 | 取证脚本契约：`ui-shot.mjs` 的启动守卫（`PIX_SHOT_ROOT` 必须在系统临时目录内）、产物自净（只删 `<OUT_ROOT>/shots`）、结束自检（截图集合与清单双向相等 + 白名单外条目即失败）；**既有 135 张截图 / 198 条测量 / 46 种 label / 既有 5 场景与 SEL 54 项零删除零改写**；`record` 语义（先落测量再抛错）；`.pix-read/reports/**` 与报告模板 |
| 反需求 | §5 全表（不做自动同步、不做文件监听、不跨工作区聚合、不云同步、不改 `notes.json`、不改既有导出与报告、不引入依赖、不做树内编辑、不做第二入口、不做提示行关闭按钮、不删改既有场景、不给徽标加动画 / 变量） |

### 2.2 本轮对既有面的显式改动（逐字：文件 / 位置 / 旧值 / 新值 / 理由）

| # | 文件 : 位置 | 旧值 | 新值 | 理由 |
| --- | --- | --- | --- | --- |
| 1 | `LibraryPanel.vue:151` | `v-for="row in rows"` | `v-for="row in rowsWithBadge"` | 每行的一次 `Map.get` 结果必须挂在行对象上（N87-2 #6）；`rows` / `flattenVisible` 本身零改动 |
| 2 | `LibraryPanel.vue:257`（插入点） | `.row-label` 规则之后直接是 `.row-progress` 规则 | 两规则之间插入 `.row-notes` 规则块 | 样式顺序与 DOM 顺序一致；`.row-progress` 规则体零改动（`git diff -U0` 判据） |
| 3 | `NotesPanel.vue:543`（插入点） | `.notes-undo` 块紧接 `.notes-notice` 块 | 两既有块之间插入 `.notes-stale` 块 | §0.4 的 DOM 位置冻结（notice → stale → undo） |
| 4 | `NotesPanel.vue:621` | `<div class="notes-group-head" :title="group.docPath">` | `<div class="notes-group-head" :class="{ 'is-openable': !group.isCurrentDoc }" :title="group.docPath" @click="onGroupOpen(group)">` | N89；`:title` 与子结构零变化 |
| 5 | `NotesPanel.vue:10` | `import { computed, onBeforeUnmount, ref, watch } from "vue";` | 增 `onMounted` | 焦点监听注册（§1.5 ②） |
| 6 | `NotesPanel.vue:13` | `import { docDisplayName } from "../../utils/notes-path";` | 增 `import type { NoteGroup }` | `onGroupOpen(group: NoteGroup)` 的类型面 |
| 7 | `NotesPanel.vue:415-431`（`onBeforeUnmount`） | 四个清理项（notice / undoRow / copy 定时器 + `clearDeleteConfirm`） | 追加 `window.removeEventListener("focus", onWindowFocus);` | 注册/注销成对（§1.8 走查 #9） |
| 8 | `ui-shot.mjs:428` 起的 stub | `readNotesFile` / `writeNotesFile` / `notesLoad` 用 `NOTES_FILE`（恒 A 根） | 改用 `currentNotesFile()`（随 `activeRoot`） | `r14-2` 的「B 无徽标」必须可判定；A 侧逐字等价（`activeRoot` 初值 = `CONFIG.root`） |
| 9 | `ui-shot.mjs` stub `api` | 41 方法（无 `notesStat`） | 42 方法（`notesStat` 插在 `notesReset` 之后） | 四面同步（§1.1.4） |
| 10 | `ui-shot.mjs` `buildStub()` require 面 | `electron` / `node:fs` / `node:path` | 追加 `node:crypto` | `notesStat` 的 sha256 |

**既有截图的内容变化（登记项，冻结）**：① 所有含 A 侧资料库树的既有截图会出现 `.row-notes`（示例：`21-tree-progress.png` 的 sample 行 `4 条` / older 行 `1 条`；场景 02/03/11/40–46 等凡种子笔记在盘者）；② 场景 24 的 B 侧 `24-workspace-switch.png` 中左侧 pill 文本由 `笔记 5` 变为 `笔记`（B 的笔记根改为随 `activeRoot` 的直接后果，是**正确恢复**，非缺陷）。零缺失判据只比 basename / label 集合，**不覆盖内容差异** ⇒ dev 档按文档分类抽样登记（或逐张登记）并确认无「非预期的重叠 / 截断 / 遮挡」。

### 2.3 零 diff 判据命令

```bash
cd E:/develop/PiX-Read

# ① 范围外面（逐条为空 = 无输出）
git diff -- package-lock.json pix/package.json pix/tsconfig.json pix/tsconfig.main.json pix/tsconfig.preload.json pix/vite.config.ts pix/src/renderer/assets/styles/variables.css packages
# ② 本轮明确不动的既有文件（逐条为空）
git diff -- pix/src/renderer/utils/outline-notes.ts pix/src/renderer/utils/notes-view.ts pix/src/renderer/utils/reading-context.ts
git diff -- pix/src/renderer/stores/reader-store.ts pix/src/renderer/stores/reader-state-store.ts pix/src/renderer/stores/project-store.ts pix/src/renderer/stores/chat-store.ts
git diff -- pix/src/main/library-root.ts pix/src/main/reader-state-store.ts pix/src/main/session-bridge.ts pix/src/main/reading-prompt.ts
git diff -- pix/src/renderer/components/workspace/ReaderPanel.vue pix/src/renderer/components/workspace/PdfViewer.vue
git diff -- pix/src/renderer/components/workspace/KnowledgeMap.vue pix/src/renderer/components/workspace/ChatPanel.vue
git diff -- pix/src/renderer/components/workspace/PdfSearchPanel.vue pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue
# ③ 面板既有块顺序与文本（只允许新增，不出现既有行的改动）
git diff -U0 -- pix/src/renderer/components/workspace/NotesPanel.vue | grep -E "^[+-].*(notes-notice|notes-undo|notes-export-row|notes-report-row|group-count|group-name)" ; echo "ORDER_DIFF_EXIT=$?"   # 期望无输出、EXIT=1
# ④ 树行既有元素零改动
git diff -U0 -- pix/src/renderer/components/workspace/LibraryPanel.vue | grep -E "^[+-].*row-progress" ; echo "PROGRESS_DIFF_EXIT=$?"   # 期望无输出
# ⑤ 两个烟测的既有面零删除（`-` 行只允许出现在登记的新增插入点紧邻处）
for f in pix/scripts/smoke-view.mjs pix/scripts/smoke-notes.mjs; do echo -n "$f -lines: "; git diff -U0 -- "$f" | grep -cE "^-[^-]"; done    # 期望两个 0
```

---

## 3. 失败路径表

| # | 情形 | 期望表现 | 证据 / 判据 |
| --- | --- | --- | --- |
| 1 | **无工作区根**（`notesStat` 返回 `no-root`） | 渲染层按失败静默处理：**不置位**（提示不出现）、不弹错、不改 `status`；基线不动 | 烟测 `notes-stat` #1；§1.6 失败静默；`r14-4` 相位 `stat-failure-silent` ⑦ |
| 2 | **文件不存在 / 被外部删除**（`exists: false`、`hash: ""`） | 统计成功、`hash = ""`；与基线 `""` 等价（不误报）；与基线非空不等（置位）；**不创建**文件 | 烟测 `notes-stat` #2 / #7（`existsSync(NOTES_A) === false` 后置断言）；§1.6 指纹归一 |
| 3 | **外部改动发生在进入工作区前** | 进工作区 / 打开面板的读盘即一致 ⇒ **不误报** | `r14-3` 相位 `enter-fresh` ② |
| 4 | **检测失败（`success === false` / 非字符串 `hash` / IPC reject）** | 三种情形一律 `return`：不置位、不清除、不弹错、不写日志、不改 `status`；**已置位时保持置位**、未置位时保持不置位 | `r14-4` 相位 `stat-failure-silent` ⑤⑥⑦；§1.6 失败静默 |
| 5 | **在途竞态**（响应迟到 / 跨工作区） | `notesFileSeq` 序号不符即丢弃；`resetNotes()` 递增序号并作废基线 ⇒ 跨工作区不残留 | §1.6 竞态；`r14-2` 相位 `b-workspace` ④ |
| 6 | **刷新失败**（`loadNotes` 返回错误态） | 提示**保留**、与 `.notes-error` 并存（渲染条件单一）；`refreshing` 在 `finally` 复位（按钮不永久 loading）；不写盘 | §1.7.1 渲染条件 + §1.7.3 状态机 |
| 7 | **在途双击刷新** | 第二次点击零副作用（首行守卫 + `disabled` + `loading`），`notesLoadCalls` 增量恰 **1** | `r14-4` 相位 `inflight-guard` ⑨ |
| 8 | **刷新与草稿冲突** | 条目不仍在 ⇒ 编辑框与草稿逐字保留；条目已不在 ⇒ 行随数据消失、内存值不清理、**不自动保存**、**不自动丢弃** | `r14-3` 相位 `refresh-draft` ⑪ 与续段 ⑮⑯ |
| 9 | **徽标计数口径漂移**（漏计 `answer` / 用绝对路径 / 大小写敏感） | 判红：`badge-counts` #1/#3/#4/#5 与 `r14-1` 的逐字文本 / tooltip | §1.3 唯一派生 + §5.3 |
| 10 | **徽标与面板计数不等（过滤态）** | **不是缺陷**：徽标恒示全量；判据只要求「徽标文本不变」而非「两者相等」 | `r14-1` 相位 `live` ⑨；§1.3 口径差异行 |
| 11 | **徽标反向挤动既有元素**（`.row-label` 被截断 / `.row-progress` 位移） | 判红：`r14-1` 相位的徽标让位判据、既有场景 21 的 `overflowFree`、§1.8 走查 #8 | §1.4 徽标让位判据；既有场景 21 零缺失 |
| 12 | **徽标出现空胶囊 / 省略号** | 判红：压缩态断言 `notesClientWidth === 0 \|\| notesClientWidth ≥ 5`；`.row-notes` 规则体内不得出现 `text-overflow`（`grep -c "text-overflow" …/LibraryPanel.vue` 的新增命中 = 0） | §1.4 压缩与降级；`r14-1` 相位 `badges` ② |
| 13 | **提示行插错位置 / 挤动既有行** | 判红：`staleProbe().order` 的 `header < stale` 且 `stale === header + 1 + (notice 在场 ? 1 : 0)`；未在场元素按「缺席不判」处理（与既有 `undoOrder()` 同纪律） | `r14-3` 相位 `detect` ⑤；§1.7.1 插入点 |
| 14 | **组头跳转误伤当前文档 / 触发 IPC** | 判红：`r14-5` 相位 `current-noop` ①②（无 `is-openable`、`cursor ≠ pointer`、文档名 / 页码 / 分组顺序 / 哈希不变）；`jump-other-doc` ⑥（`notesLoadCalls` / `notesStatCalls` 无增量、`notesHash()` 不变） | §1.7.4 |
| 15 | **stub 笔记根改造引入 A 侧回归** | 判红：既有 135 张 / 198 条 / 46 种 label 零缺失比对 + 既有场景 21 / 21b / 24 全绿；A 侧 `activeRoot` 初值 = `CONFIG.root` ⇒ 行为应与今天逐字等价 | §2.2 第 8 行；§5.5 比对 |
| 16 | **烟测产物异常 / 编译失败** | 打印 `tsc` 输出与产物树 ⇒ **不进入断言**，直接退出 1（既有协议不变） | §5.2 / §5.3 判据 1；既有脚本 `fail()` |
| 17 | **烟测清理失败 / 仓库残留** | 只打印 `[警告] 临时目录未清理：<path>`，不改退出码；`git status --short` 出现白名单外文件即停线 | §5.1 步骤 6 |

---

## 4. 文件级清单（动作 + 具体改动点 + 不变量）

| # | 文件 | 动作 | 具体改动点 | 不变量 |
| --- | --- | --- | --- | --- |
| 1 | `pix/src/renderer/utils/notes-path.ts` | 修改 | 新增 `NotesBadgeCount` 接口 + 纯函数 `countNotesByDocument`（§1.3；落点：`matchesChapterFilter` 之后） | 既有 `docPathKey` / `currentDocKey` / `docDisplayName` / `absoluteDocPath` / `PageRange` / `rangeContains` / `matchesChapterFilter` / `groupNotesByDocument` / `sortNotesForContext` 零 diff；无新依赖；无 `any`；不修改入参 |
| 2 | `pix/src/renderer/components/workspace/LibraryPanel.vue` | 修改 | `useNotesStore` 与 `countNotesByDocument` / `currentDocKey` 引入；`noteCountMap` + `rowsWithBadge` 两个 computed；模板 `.row-notes`（位次 = `.row-label` 之后、`.row-progress` 之前）；`.row-notes` 样式（§1.4 盒模型）；`v-for` 数据源换 `rowsWithBadge`（§2.2 第 1 行） | `progressMap` / `rows` / `flattenVisible` / `reload` / `toggle` / `iconFor` / `chevronFor` / `isSelected` 与既有 CSS（含 `.row-label` / `.row-progress` 的 flex 行为）零改动；无笔记 IPC、无定时器、不拼存储路径 |
| 3 | `pix/src/shared/types.ts` | 修改 | 新增 `ReaderNotesStatResult`（§1.1.2；落点：`ReaderNotesLoadResult` 之后） | `ReaderNotesErrorCode` 仍 11 键；既有类型零改动；新增名字在文件内恰 1 行 |
| 4 | `pix/src/main/notes-store.ts` | 修改 | 新增导出 `statNotesFile()`（§1.2）；import 追加 `createHash`（`node:crypto`）与 `statSync`（`node:fs`）；类型 import 追加 `ReaderNotesStatResult`（插在 `ReaderNotesResetResult,` 之后——MF-1） | 既有 8 个导出与全部写盘函数零改动；`statNotesFile` 只读、不解析、不建文件、不抛错、不改 mtime；函数体内无 `writeFileSync` / `mkdirSync` / `rmSync` / `renameSync` |
| 5 | `pix/src/main/ipc-handlers.ts` | 修改 | 新增 1 个无入参 handler（§1.1.1；落点：`notes-export-report` 之后）；import 追加 `statNotesFile` | 既有 8 个笔记 handler 与其他 handler 零改动；不新增守卫函数（无入参通道先例） |
| 6 | `pix/src/main/preload.ts` | 修改 | `PixApi` 接口 + `api` 实现各 1 处 `notesStat`（§1.1.3）；类型 import 追加 `ReaderNotesStatResult` | 既有 41 方法零改动；改后各 **42** 方法 |
| 7 | `pix/src/renderer/stores/notes-store.ts` | 修改 | 新增 `externalChange` / `syncNotesFile` / `checkNotesFile` / `notesFileSeq` / `notesFingerprint`（§1.6）；`@shared/types` 类型 import 追加 `ReaderNotesStatResult`（插在 `ReaderNotesReportChapter,` 之后——MF-1）；`loadNotes()` 成功分支 / `applyNotes()` / `recoverCorruptNotes()` 成功分支各追加 2 行；`resetNotes()` 追加 3 行；返回对象暴露 `externalChange` 与 `checkNotesFile` | 既有动作、竞态令牌语义、错误文案零改动；不拼存储路径、不写盘、无 `console.*`、无定时器、无轮询 |
| 8 | `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | `.notes-stale` 块 + 样式（§1.7.1 / §1.7.5）；`refreshing` / `onRefreshNotes` / `onWindowFocus` / `onGroupOpen`（§1.7.2）；`onMounted` 注册焦点监听（§1.5 ②）+ `onBeforeUnmount` 注销；`defineEmits` 增 `open-note-doc`；`.notes-group-head` 增 `is-openable` / `@click` 与两条样式（§1.7.4） | 既有模板块顺序（notice → undo → export → report → loading）与全部既有文案零改动；`startCommentEdit` / `saveComment` / `onUndoClick` / `onExport` / `onExportReport` 语义零改动；不新增 `--pix-*` 变量 |
| 9 | `pix/src/renderer/pages/WorkspacePage.vue` | 修改 | 新增 `onOpenNoteDoc(docPath)`（一行调用 `openDocumentFromLibrary(absoluteDocPath(rootDir.value, docPath))`）与模板 `@open-note-doc="onOpenNoteDoc"` 绑定 | `onMounted` / `onUnmounted` / `goHome` / `selectLeftTab` / `onOpenNote` / `openDocumentFromLibrary` / `selectedFilePath.value = ` 赋值点数零改动 |
| 10 | `pix/scripts/smoke-notes.mjs` | 修改 | 新增 1 组 7 条（`notes-stat`，§5.2）+ 所需常量 / 局部 helper；`main()` 追加一行 `runNotesStat();` | 既有 7 组 44 条、编译面（`files` `:934` / `required` `:950` / `allowed` `:951`）与输出协议零改动；只读仓库源文件、只写 `%TEMP%`、结束自清理 |
| 11 | `pix/scripts/smoke-view.mjs` | 修改 | 新增 1 组 6 条（`badge-counts`，§5.3）+ 夹具 + **模块句柄 `notesPath` 与 `notes-path.js` 的 `require`**（`compileAndLoad()` 内，`:82-83` 声明处增一行、`:465-466` 之后增一行）；`main()` 追加一行 `runBadgeCounts();` | 编译面（`files` `:428` / `required` `:446` / `allowed` `:447`）与既有 4 组 29 条零改动；期望值手写（不由被测函数生成）；零依赖 |
| 12 | `pix/scripts/ui-shot.mjs` | 修改 | stub：`notesStat`（真读真算）+ `currentNotesFile()`（笔记根随 `activeRoot`）+ 控制口 `notesStatCalls()` / `setNotesStatFailure(code)` + `node:crypto`；`SEL` 追加 6 项（54 ⇒ 60）；新增 6 个 helper（§0.3）与三条外部夹具；`r14-1`…`r14-5`（5 组 13 条 record、8 张截图）追加在 `:8013` 之后、`:8014` 之前 | 既有场景 / 截图 / label / `SEL` 54 项 / helper 零删除零改写；只写 `OUT_ROOT`；`record` 语义不变；每个场景以自己的 `restoreStandardSeed()` 收尾 |
| 13 | `pix/package.json` | **不改**（登记为不动） | 烟测就地扩展两个既有脚本 ⇒ 不新增 script | `scripts` / `dependencies` / `devDependencies` 逐字不动；`package-lock.json` 零 diff（PRD §5.8） |
| 14 | `docs/pm/R14-design.md` | 新建（本档） | —— | 不改源码 |

**范围外（任何情况下不动）**：`packages/**`、`package-lock.json`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/src/renderer/assets/styles/**`（含 `variables.css`）、`pix/src/renderer/utils/{outline-notes.ts,notes-view.ts,reading-context.ts}`、`pix/src/renderer/components/workspace/{ReaderPanel,PdfViewer,KnowledgeMap,ChatPanel,PdfSearchPanel,PdfSelectionQuickAsk}.vue`、`pix/src/renderer/stores/{reader-store,reader-state-store,project-store,chat-store}.ts`、`pix/src/main/{library-root,reader-state-store,session-bridge,reading-prompt}.ts`、`pix/resources/**`、`docs/pm/**` 的历史档件、`.gitignore`、`README.md`。

---

## 5. 验证方案

### 5.1 命令（按执行顺序）

```bash
# 步骤 0：动工前（未改任何文件）—— 唯一工程门
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"            # 期望 0

# 步骤 0b：交叉核对本轮的零缺失比对基线（R13 交付目录，只读）
node -e "const fs=require('fs');const L=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));const B='C:/Users/86157/AppData/Local/Temp/pix-v05-r13-review/shots';const m=L(B+'/MANIFEST.json');const x=L(B+'/MEASUREMENTS.json');console.log(JSON.stringify({shots:m.shots.length,failure:m.failure,measurements:x.length,labels:new Set(x.map(e=>e.label)).size,r14:x.filter(e=>e.label.startsWith('r14')).length}))"
# ⇒ 必须逐字得到 {"shots":135,"failure":null,"measurements":198,"labels":46,"r14":0}；不一致则停线排查

# 步骤 0c：动工前基线（新目录，读数即本轮唯一基线；与 R13 目录互为交叉参考）
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r14-base" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_BASE_EXIT=$?"
# ⇒ 期望 UI_SHOT_BASE_EXIT=0 且 base/shots/MANIFEST.json 的 shots.length = 135、failure = null（与 R13 目录读数一致）

# 步骤 1：A 面落地（类型 + 主进程 + preload + 两个烟测）
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"            # 0
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes; echo "SMOKE_NOTES_EXIT=$?"  # 0，通过 51 / 失败 0（连跑两次）
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:view;  echo "SMOKE_VIEW_EXIT=$?"   # 0，通过 35 / 失败 0（连跑两次）

# 步骤 2：B 面落地（纯函数 + 树 + store + 面板 + 页面）后的工程门
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"            # 0

# 步骤 3：离屏验收（与基线目录不同）
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r14-after" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_AFTER_EXIT=$?"
# 期望：UI_SHOT_AFTER_EXIT=0 + MANIFEST.json.failure === null + 5 组 13 条 record 全绿 + 8 张新截图齐备

# 步骤 4：零缺失比对（逐字命令见 §5.5）
# 步骤 5：零残留
cd E:/develop/PiX-Read && git status --short
```

**验收读数（冻结）**：`pix-v05-r14-after/shots/MANIFEST.json` ⇒ `shots.length = 143`、`failure = null`；`MEASUREMENTS.json` ⇒ 长度 **211**、`label` 去重 **51** 种（既有 46 种 ⊆ 51；新增恰为 `r14-tree-badge` / `r14-tree-badge-scope` / `r14-notes-stale` / `r14-notes-stale-failure` / `r14-group-jump`）；`shots/` 一级条目只有 `*.png` / `MANIFEST.json` / `MEASUREMENTS.json`。

### 5.2 烟测-主进程：`pix/scripts/smoke-notes.mjs` 新增 1 组 7 条

组名 `notes-stat`；`main()`（`:976-1001`）的调用序固定为 `runUndoRoundtrip → runUndoFailures → runUndoSlotLifecycle → runExportAndEmpty → runReportRender → runReportFiles → runReportFailures → runNotesStat`。

组前置（评审非阻塞提示 ⑤）：`compileAndLoad()` 收尾已 `libraryRoot.clearLibraryRoot()`（`:972`）⇒ #1 直接断言「无根」；**#2 起第一行必须 `libraryRoot.setLibraryRoot(WS_A)`**，否则后续条全部落在无根态。

新增常量（复用既有路径常量，不新增路径派生）：`const STAT_NOTE_TEXT = "external append for stat";`（#4 的外部改写正文，手写常量）。

| # | 断言（失败即红；期望值手写 / 由测试侧独立计算） |
| --- | --- |
| 1 | 无根：`libraryRoot.clearLibraryRoot()` ⇒ `statNotesFile()` 返回 `success === false`、`code === "no-root"`、`error` 逐字 `尚未选择资料库根目录`、`exists === false`、`size === 0`、`mtimeMs === 0`、`hash === ""` |
| 2 | 文件缺失：`setLibraryRoot(WS_A)` → `rmSync(NOTES_A, { force: true })` ⇒ `success === true`、`exists === false`、`hash === ""`、`size === 0`、`mtimeMs === 0`，且调用后 `existsSync(NOTES_A) === false`（**不建文件**） |
| 3 | 正常文件：`seedReportNotes(DOC_A)`（`:113`，3 条）⇒ `exists === true`、`size === readFileSync(NOTES_A).length`、`mtimeMs > 0`、`hash === sha256(readFileSync(NOTES_A))`（两侧都取真实字节，期望值由烟测侧独立计算） |
| 4 | 外部改写：`writeFileSync(NOTES_A, serialize([...readFileNotes(), { id: "n-stat-1", kind: "excerpt", docPath: "sample-paper.pdf", page: 1, text: STAT_NOTE_TEXT, comment: "", createdAt: Date.now(), updatedAt: Date.now() }]), "utf8")` ⇒ 新 `hash` 逐字等于新字节的 `sha256`、且 ≠ #3 的 `hash`、`size` 随新字节长度变化 |
| 5 | 只读与幂等：快照（`notes.json` 的 sha256 / `notes.md` 的 sha256（存在时） / `readdirSync(PIX_READ_A).sort()`）→ 连续两次 `statNotesFile()`（两次 `hash` 相同）→ 复核快照三项逐字不变 |
| 6 | 不解析内容：`writeFileSync(NOTES_A, "not-json\n", "utf8")` ⇒ `success === true`、`exists === true`、`hash === sha256(Buffer.from("not-json\n"))`，且 `code === undefined` 与 `error === undefined`（**不返回** `corrupt` / `version-unsupported`） |
| 7 | 删除后：`rmSync(NOTES_A, { force: true })` ⇒ `success === true`、`exists === false`、`hash === ""`、`size === 0`、`mtimeMs === 0`；再次 `existsSync(NOTES_A) === false` |

验收判据：`npm run smoke:notes` ⇒ 退出码 0、`通过 51 / 失败 0`、连续两次结果相同；既有 7 组 44 条零改动（`git diff` 只显示新增函数 / 常量与 `main()` 一行）；输出协议与自清理（末行逐字 `通过 {passed} / 失败 {failed}`、`finally` 内 `rmSync`）不变。

### 5.3 烟测-渲染：`pix/scripts/smoke-view.mjs` 新增 1 组 6 条

组名 `badge-counts`；`main()`（`:470-489`）追加一行 `runBadgeCounts();`（既有四组调用序不变）。

编译面（零改动，评审 MF-5）：`files`（`:428`）已含 `notes-path.ts`、`required`（`:446`）已含 `renderer/utils/notes-path.js`、`allowed`（`:447`）不变；**只新增**模块句柄声明（`:82-83` 增 `let notesPath = null;`）与 `compileAndLoad()` 内一行 `notesPath = require(join(OUT_DIR, "renderer", "utils", "notes-path.js"));`（插在 `:466` 之后）。

夹具（手写；期望值不由被测函数生成）：

```js
/** 标准 4 条（与 ui-shot 的 seedNotes 同构：sample 3 = 摘录 2 + AI 结论 1；archive 1 = 摘录 1）。 */
const BADGE_SEED = [
  { id: "n-current-1", kind: "excerpt", docPath: "sample-paper.pdf", page: 1, text: "badge seed p1", comment: "", createdAt: 1, updatedAt: 1 },
  { id: "n-current-2", kind: "excerpt", docPath: "sample-paper.pdf", page: 2, text: "badge seed p2", comment: "", createdAt: 2, updatedAt: 2 },
  { id: "n-current-3", kind: "answer", docPath: "sample-paper.pdf", page: 2, text: "badge seed answer", comment: "", createdAt: 3, updatedAt: 3 },
  { id: "n-other-1", kind: "excerpt", docPath: "archive/older-paper.pdf", page: 7, text: "badge seed archive", comment: "", createdAt: 4, updatedAt: 4 },
];
const BADGE_CASE = [
  { id: "c-1", kind: "excerpt", docPath: "sample-paper.pdf", page: 1, text: "case 1", comment: "", createdAt: 5, updatedAt: 5 },
  { id: "c-2", kind: "excerpt", docPath: "Sample-Paper.PDF", page: 2, text: "case 2", comment: "", createdAt: 6, updatedAt: 6 },
  { id: "c-3", kind: "answer", docPath: "sample-paper.pdf\\", page: 3, text: "case 3", comment: "", createdAt: 7, updatedAt: 7 },
];
```

| # | 断言（失败即红） |
| --- | --- |
| 1 | `notesPath.countNotesByDocument(BADGE_SEED)` ⇒ `size === 2`；`get("sample-paper.pdf")` 逐字段 `{ total: 3, excerpt: 2, answer: 1 }`；`get("archive/older-paper.pdf")` 逐字段 `{ total: 1, excerpt: 1, answer: 0 }` |
| 2 | 空数组 ⇒ `size === 0`（Map 为空、不抛错） |
| 3 | 只产出 `total > 0` 的文档：5 条笔记但只覆盖 2 个文档 ⇒ `size === 2`，且 `get("reading-notes.md") === undefined` |
| 4 | 比较键归一：`BADGE_CASE`（`sample-paper.pdf` / `Sample-Paper.PDF` / `sample-paper.pdf\`）合并为**同一键** ⇒ `size === 1`、`total === 3`、`excerpt === 2`、`answer === 1` |
| 5 | 恒等式：同一文档 3 摘录 + 2 结论 ⇒ `total === 5 === excerpt + answer`，逐值断言 |
| 6 | 输入零改动 + 每次返回新 Map：调用前后 `JSON.stringify(BADGE_SEED)` 逐字不变；两次调用返回对象不同（`first !== second`），修改第一次的结果不影响第二次（`second.get("sample-paper.pdf").total === 3`） |

验收判据：`npm run smoke:view` ⇒ 退出码 0、`通过 35 / 失败 0`；既有 4 组 29 条零改动；编译面三处零 diff。

### 5.4 离屏（`pix/scripts/ui-shot.mjs`）：5 场景 / 5 组 / 13 条 record / 8 张截图

#### 5.4.1 `SEL` 新增 6 项（逐字；54 ⇒ 60）

```js
  // R14 新增 6 项（设计档 §5.4.1）
  rowNotes: ".row-notes",
  staleRow: ".notes-stale",
  staleText: ".notes-stale .stale-text",
  staleRefresh: ".notes-stale .stale-refresh",
  groupName: ".notes-group-head .group-name",
  centerDocLabel: ".center-pill .pill-label",
```

#### 5.4.2 新增 helper（6 个 + 1 个内部写入原语 `writeNotesOutside`；语义冻结；全部为 `runReaderStateScenarios` 闭包内的一次 `js` 往返或 `waitFor` 包装）

```js
  const triggerWindowFocus = () => js(`window.dispatchEvent(new Event("focus")), true`);

  const badgeProbe = (expr) => js(`(() => {
    const box = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, w: b.width, h: b.height }; };
    const text = (el) => (el ? el.textContent.replace(/\\s+/g, " ").trim() : null);
    const rows = Array.from(document.querySelectorAll(".tree-row"));
    const row = rows.find(${expr});
    if (!row) return null;
    const style = getComputedStyle(row);
    const notes = row.querySelector(".row-notes");
    const progress = row.querySelector(".row-progress");
    const label = row.querySelector(".row-label");
    const spacer = row.querySelector(".row-chevron-spacer");
    const icon = row.querySelector(".row-icon");
    const paddingLeft = parseFloat(style.paddingLeft);
    const paddingRight = parseFloat(style.paddingRight);
    const gap = parseFloat(style.columnGap) || 0;
    const spacerWidth = spacer ? spacer.getBoundingClientRect().width : 0;
    const iconWidth = icon ? icon.getBoundingClientRect().width : 0;
    const progressClientWidth = progress ? progress.clientWidth : 0;
    const labelFloor =
      row.clientWidth - paddingLeft - paddingRight - spacerWidth - iconWidth - progressClientWidth - 4 * gap;
    return {
      title: row.getAttribute("title"),
      text: text(notes),
      notesTitle: notes ? notes.getAttribute("title") : null,
      notesCount: row.querySelectorAll(".row-notes").length,
      notesClientWidth: notes ? notes.clientWidth : null,
      notesScrollWidth: notes ? notes.scrollWidth : null,
      notesBox: notes ? box(notes) : null,
      progress: text(progress),
      progressCount: row.querySelectorAll(".row-progress").length,
      progressClientWidth,
      progressBox: progress ? box(progress) : null,
      labelClientWidth: label ? label.clientWidth : null,
      labelScrollWidth: label ? label.scrollWidth : null,
      labelFloor,
      rowClientWidth: row.clientWidth,
      rowScrollWidth: row.scrollWidth,
      rowBox: box(row),
      spacing: { paddingLeft, paddingRight, gap, spacerWidth, iconWidth },
      domOrder: !!(label && notes && progress) && (label.compareDocumentPosition(notes) & 4) === 4 && (notes.compareDocumentPosition(progress) & 4) === 4,
    };
  })()`);

  const staleProbe = () => js(`(() => {
    const panel = document.querySelector(".notes-panel");
    const names = Array.from(panel.children).map((el) => String(el.className).split(" ")[0]);
    const at = (name) => names.indexOf(name);
    const row = document.querySelector(".notes-stale");
    const text = row ? row.querySelector(".stale-text") : null;
    const btn = row ? row.querySelector(".stale-refresh") : null;
    return {
      present: !!row,
      text: text ? text.textContent.replace(/\\s+/g, " ").trim() : null,
      btnText: btn ? btn.textContent.replace(/\\s+/g, " ").trim() : null,
      btnTitle: btn ? btn.getAttribute("title") : null,
      btnHeight: btn ? Math.round(btn.getBoundingClientRect().height) : null,
      btnDisabled: btn ? btn.disabled : null,
      order: {
        names,
        header: at("notes-header"),
        notice: at("notes-notice"),
        stale: at("notes-stale"),
        undo: at("notes-undo"),
        exportRow: at("notes-export-row"),
        reportRow: at("notes-report-row"),
        list: at("notes-list"),
      },
    };
  })()`);

  /** 徽标文本轮询表达式（面板打开时树隐藏、几何为 0 ⇒ 只读 textContent；缺席返回 false）。 */
  const badgeTextExpr = (suffix, expected) => `(() => {
    const rows = Array.from(document.querySelectorAll(".tree-row"));
    const row = rows.find((el) => (el.getAttribute("title") || "").endsWith(${JSON.stringify(suffix)}));
    const el = row ? row.querySelector(".row-notes") : null;
    return !!el && el.textContent.replace(/\\s+/g, " ").trim() === ${JSON.stringify(expected)};
  })()`;

  const writeNotesOutside = (list) => writeFileSync(NOTES_FILE, `${JSON.stringify({ version: 1, notes: list }, null, 2)}\n`, "utf8");
  const appendExternalNote = (note) => writeNotesOutside([...readNotes(), note]);
  const removeExternalNote = (id) => writeNotesOutside(readNotes().filter((note) => note.id !== id));
```

外部改动夹具（三条，逐字）：

```js
  const EXTERNAL_TEXT = "External edit: this note was appended outside the app.";
  const externalNote = (id, docPath) => ({ id, kind: "excerpt", docPath, page: 1, text: EXTERNAL_TEXT, comment: "", createdAt: Date.now(), updatedAt: Date.now() });
  const EXTERNAL_1 = externalNote("n-external-1", "archive/older-paper.pdf");
  const EXTERNAL_2 = externalNote("n-external-2", "reading-notes.md");
  const EXTERNAL_3 = externalNote("n-external-3", "sample-paper.pdf");
```

#### 5.4.3 场景挂载点与纪律

- 挂载：`runReaderStateScenarios` 末尾（`:8013` 的 `await restoreStandardSeed();` 之后、`:8014` 的 `}` 之前）。
- 每个场景自带复位（`goHome()` / `clearStateA()` / `enterWorkspace(...)`）并以其自己的 `restoreStandardSeed()` 收尾。
- 场景相位的 `data` 字段集合即报文；断言失败信息必须给出实际值（沿用 `record` 的「先落测量再抛错」）。
- 截图取法与 R13 一致：整窗截图不传 rect；左栏截图传 `await rectOfSelector(SEL.layoutLeft)`。

#### 5.4.4 场景 `r14-1`（组 `r14-tree-badge`，3 条 record，2 张截图）

前置：`goHome()` → `clearStateA()` → `writeState(STATE_FILE_A, { version: 1, lastDocPath: "sample-paper.pdf", documents: { "sample-paper.pdf": entry(2, 1), "archive/older-paper.pdf": entry(1024, 1.1) } })` → `enterWorkspace(LIBRARY_NAME)` → `waitTreeRows(5)` → `js(seedNotes(...))`（4 条：sample 3 / older 1）→ `openNotesPanel(4)` → `backToLibraryTab()`。（阅读现场与既有场景 21 同款，但页码为 2 / 1024 ⇒ 同时覆盖「完整」与「压缩」两种徽标形态。）

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `badges` | 等 `document.querySelectorAll(".row-notes").length === 2` → 读 `badgeProbe` × 5 行（`rowByTitle("sample-paper.pdf")` / `rowByTitle("older-paper.pdf")` / `rowByLabel("reading-notes.md")` / `rowByLabel("long-book.pdf")` / `rowByLabel("archive")`）→ 截图 `r14-1-tree-notes-badge.png`（`rectOfSelector(SEL.layoutLeft)`） | ① sample 行 `text` 逐字 `3 条`、`notesTitle` 逐字 `摘录 2 条 · AI 结论 1 条`、未被压缩（`notesScrollWidth ≤ notesClientWidth + 1`）；② older 行 `text` 逐字 `1 条`、`notesTitle` 逐字 `摘录 1 条 · AI 结论 0 条`、压缩态：`9 ≤ notesClientWidth ≤ 11` 且 `notesScrollWidth > notesClientWidth`、无空胶囊（`notesClientWidth === 0 \|\| notesClientWidth ≥ 5`）；③ `reading-notes.md` / `long-book.pdf`（`rowByLabel`）/ `archive` 三行 `notesCount === 0` 且 `progressCount === 0`（防空：断言确在无徽标行上执行）；④ 两行 `progress` 逐字 `第 2 页` / `第 1024 页`、`progressBox.right ≥ rowBox.right − spacing.paddingRight − 1`（贴行右内缘）、`notesBox.right ≤ progressBox.left`（不重叠）、`domOrder === true`（label → notes → progress）；⑤ 五行的 `overflowFree(probe)` 成立（行级 + label 级），且两枚标记行的**徽标让位判据**成立（`labelClientWidth ≥ min(labelScrollWidth, labelFloor) − 1`） | `{ phase, sample, older, notesRow, archiveRow, longBookRow }` |
| `live` | `openNotesPanel(4)` → `deleteRowByText("Table 2 repo")` → 等 `badgeTextExpr("sample-paper.pdf", "2 条")` → 读 sample 徽标 → `clickUndo()` → 等 `badgeTextExpr("sample-paper.pdf", "3 条")` → `setSearch("Reproducibility")` → 读 `.notes-count` / `.notes-group-head` 计数 / sample 行徽标文本 → `setSearch("")` | ⑥ 删除后 sample 行 `text === "2 条"`、`notesTitle === "摘录 1 条 · AI 结论 1 条"`；⑦ 撤销后 `text === "3 条"`、`notesTitle === "摘录 2 条 · AI 结论 1 条"`；⑧ 全程 `.note-row` 行数在 4 → 3 → 4 之间变化（列表真实变化 ⇒ 徽标断言非空）；⑨ 过滤态口径：搜索串命中 older 那条 ⇒ `.notes-group` 数 = 1（sample 分组不再渲染）、`groupCounts` 不含 sample 的 `共 3 条`，而 sample 行 `text` 仍逐字 `3 条`（徽标 = 全量、不跟过滤走）；清空搜索后面板复原（`.note-row` = 4） | `{ phase, afterDelete, afterUndo, rows, filteredCount, groupCounts, badgeUnderFilter }` |
| `narrow` | `backToLibraryTab()` → `document.documentElement.style.setProperty("--pix-left-width", "220px")` → `repaint(win)` → 读 `badgeProbe`（sample / older）与 `.layout-left` 宽 → 截图 `r14-1b-tree-badges-narrow.png`（左栏）→ `removeProperty("--pix-left-width")` → `repaint(win)` → **复读** `badgeProbe`（sample / older）与 `.layout-left` 宽（复原段与窄栏段同属本 record，不新增 record / 截图） | ⑩ `.layout-left` 宽在 218–222（防空）；⑪ **防空（MF-4）**：两行 `notesCount === 1`（`.row-notes` 恰 1 个）且 `notesClientWidth !== null`（徽标缺席 / 选择器写错不得静默通过）；⑫ 两行 `rowScrollWidth ≤ rowClientWidth + 1`（窄栏下不溢出）；⑬ `.row-progress` 的 `progress` 文本逐字不变（`第 2 页` / `第 1024 页`）、`progressClientWidth` 与默认宽度读数一致（±1）、`progressBox.right ≥ rowBox.right − spacing.paddingRight − 1`；⑭ **徽标让位判据**成立（`labelClientWidth ≥ min(labelScrollWidth, labelFloor) − 1`，见 §1.4 的窄栏推导 91 / 58）；`.row-notes` 允许被压缩到 0 宽或仅剩数字 ⇒ **不作文本完整断言**，`notesClientWidth` 只登记且必须 ∈ `{0} ∪ [5, ∞)`（0 = 整体让位、≥5 = 数字可见）；**复原向（MF-5；对齐 R11 三相位范式加 end 向）**：⑮ `removeProperty` + `repaint` 后 `.layout-left` 回到 **268±2**（`variables.css:112` = `268px`，与 R11 `widthOk11e` 同口径）；⑯ 复读两行——sample `notesScrollWidth ≤ notesClientWidth + 1`（恢复完整显示）、older `notesClientWidth` ≈ **10**（与相位 `badges` ② 的 9–11 一致）、两行 `rowScrollWidth ≤ rowClientWidth + 1` 且**徽标让位判据**继续成立（变量未复位 / 徽标状态未回退即判红） | `{ phase, leftWidth, row, notesBadge, progressBadge, restored }`（`notesBadge` = 两行徽标读数（含 `notesClientWidth ∈ {0} ∪ [5, ∞)`）；`restored` = 复原段读数 `{ leftWidth, sample, older }`） |

#### 5.4.5 场景 `r14-2`（组 `r14-tree-badge-scope`，2 条 record，1 张截图）

前置：`restoreStandardSeed()`（A 侧 4 条、面板 4 行）→ 记录 `loadCalls()` 基线。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `b-workspace` | `goHome()` → `enterWorkspace(LIBRARY_B_NAME)` → `waitTreeRows(1)` → 点笔记标签 → `waitFor("B 笔记空态", 'document.querySelector(".notes-empty")')` → 读树行 / 调用计数 / 提示行 → 截图 `r14-2-tree-badge-workspace-b.png`（左栏） | ① `loadCalls()` 相对进入 B 前有增量（进入工作区即读盘）；② B 树 `.row-notes` 计数 **0**（防空：B 树至少 1 行 ⇒ `rowByTitle("sample-paper.pdf")` 非 null）；③ `.notes-empty` 在场（断言不是「未加载」的假绿）；④ `.notes-stale` 不在 DOM | `{ phase, loadDelta, rows, badgeCount, emptyShown, stale }` |
| `back-to-a` | `goHome()` → `enterWorkspace(LIBRARY_NAME)` → `waitTreeRows(5)` → 等 `document.querySelectorAll(".row-notes").length >= 2` → 读 sample / older 行徽标 | ⑤ 切回 A 后 sample 行 `text === "3 条"`、older 行 `text === "1 条"`（跨工作区不残留、回切可恢复） | `{ phase, sample, older }` |

#### 5.4.6 场景 `r14-3`（组 `r14-notes-stale`，3 条 record，3 张截图）

前置（Node 侧，在进入工作区前完成）：`goHome()` → `clearStateA()` → `writeNotesOutside([...seedNotes(), EXTERNAL_1])`（5 条）→ `enterWorkspace(LIBRARY_NAME)` → `waitTreeRows(5)`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `enter-fresh` | `openNotesPanel(5)` → 读行数 / 徽标 / 提示行 | ① `.note-row` 恰 5 行且外部新增正文可见（`rowFinder(EXTERNAL_TEXT, false)` 命中）；② `.notes-stale` **不在 DOM**（读盘即一致 ⇒ 不误报）；③ 树徽标与文件一致：older 行 `2 条`、sample 行 `3 条` | `{ phase, rows, stale, sample, older }` |
| `detect` | 记录 `notesHash()` → `appendExternalNote(EXTERNAL_2)` → `triggerWindowFocus()` → `waitFor("外部改动提示", 'document.querySelector(".notes-stale")')` → 读 `staleProbe` / 行数 / 计数 / `notesStatCalls()` → 勾选第 1 行（`.note-row .note-select-wrap`，等 `.notes-selection-count`）→ 点 `.notes-selection-clear` 清空 → `sleep(4500)` 复查 → 截图 `r14-3-stale-row.png`（左栏） | ④ `text` 逐字 `笔记文件已被外部修改，面板内容可能过期`、`btnText` 逐字 `刷新`、`btnTitle` 逐字 `重新读取笔记文件`；⑤ DOM 位置：`order.header < order.stale` 且 `order.stale === order.header + 1 + (order.notice === -1 ? 0 : 1)`（未在场元素按「缺席不判」处理，与既有 `undoOrder()` 同纪律）；⑥ `.note-row` 仍 5 行、`.notes-count` 逐字 `共 5 条`（检测不改列表与计数）；⑦ `notesHash()` 与检测前相同（只读）且 `notesStatCalls()` 增量 ≥ 1（走新通道）；⑧ 提示存在期间勾选生效（`.notes-selection-count` 出现）且清空后 `.notes-selection-bar` 消失（非阻塞、既有控件未被改写）；⑨ 4.5s 后 `.notes-stale` 仍在（不自动消失；等待窗口 > `NOTICE_MS = 4000`） | `{ phase, stale, rows, countText, hashSame, statDelta, selectable, stillAfterWait }` |
| `refresh-draft` | 用 `rowFinder("We study retrieval", false)` 定位 `n-current-1` 行 → 点其 `.comment-trigger` → 等 `.note-comment textarea` → 用原生 setter 写入草稿 `刷新不应丢弃这段草稿` 并派发 `input` → 记录 `notesHash()` / `loadCalls()` / `notesAddCalls()` / `notesReportCalls()` → 点 `.stale-refresh` → `waitFor("提示消失", '!document.querySelector(".notes-stale")')` 且等 `.note-row` 命中 6 → 读 textarea / 行数 / 徽标 / 哈希 / 调用计数 → 截图 `r14-3b-refresh-keeps-draft.png` + `r14-3c-refresh-list-synced.png`（各左栏）→ **续段（同一 record，不新增截图）**：`removeExternalNote("n-current-1")` → `triggerWindowFocus()` → 等提示 → 点 `.stale-refresh` → 等提示消失 → 复读行数 / textarea / 提示 / 文件 | ⑩ `.notes-stale` 不在 DOM（提示消失）；⑪ `.note-comment textarea` 仍在 DOM、`value` 逐字 `刷新不应丢弃这段草稿`、`.comment-actions` 的「保存 / 取消」按钮仍在（草稿与编辑态未被触碰）；⑫ 面板与文件一致：`.note-row` 6 行且 `readNotes().length === 6`；⑬ 徽标同步（一律取 `textContent`）：`reading-notes.md` 行 `1 条`、older 行 `2 条`、sample 行 `3 条`；⑭ 刷新只读：`notesHash()` 前后不变、`loadCalls()` 增量恰 **1**、`notesAddCalls()` / `notesReportCalls()` 增量 0；**续段**：⑮ 被删条目行与 textarea 均不在 DOM、`.note-row` 5 行且 `readNotes().length === 5`；⑯ `.notes-stale` 不在 DOM、`.notes-notice === null`（面板零弹错）、`JSON.stringify(readNotes())` 不含草稿文本（未自动保存）、`notesAddCalls()` / `notesReportCalls()` 增量 0 且 `loadCalls()` 增量恰 1（未自动丢弃 + 只读刷新） | `{ phase, stale, draft, draftKept, rows, fileRows, badges, hashSame, loadDelta, writeDelta, removedRowGone, removedNotice, draftNotSaved }` |

#### 5.4.7 场景 `r14-4`（组 `r14-notes-stale-failure`，3 条 record，1 张截图）

前置：`restoreStandardSeed()`（A 侧 4 条、面板 4 行、阅读器停在 `sample-paper.pdf` 第 1 页）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `write-rebaseline` | 记录 `notesHash()` 基线 → `appendExternalNote(EXTERNAL_1)` → `triggerWindowFocus()` → 等 `.notes-stale`（防空）→ `deleteRowByText("Table 2 repo")` → 等提示消失 → 读行数 / 文件条数 / 外部正文可见性 / 哈希 | ① 外部改动后提示出现（检测生效，防空断言）；② 删除成功后 `.notes-stale` 不在 DOM（写操作成功即重新对标）；③ 面板行数 = `readNotes().length`（= 4）且外部新增正文可见（`rowFinder(EXTERNAL_TEXT, false)` 命中 ⇒ 不丢外部改动）；④ `notesHash()` 与改动前不同（真实写盘） | `{ phase, staleBefore, staleAfter, rows, fileRows, externalVisible, hashChanged }` |
| `stat-failure-silent` | `appendExternalNote(EXTERNAL_3)` → `triggerWindowFocus()` → 等 `.notes-stale`（防空：置位态成立）→ 读提示基线 → `setNotesStatFailure("read-failed")` → `triggerWindowFocus()` → `sleep(400)` → 复核（提示仍在、`.notes-notice === null`、行数不变）→ `setNotesStatFailure("throw")` → `triggerWindowFocus()` → `sleep(400)` → 复核同上 → 截图 `r14-4-stat-failure-silent.png`（左栏）→ `setNotesStatFailure(null)` → 点 `.stale-refresh`（置位态下该元素必然存在，不会触发 `clickEl` 的 `TypeError`）→ 等提示消失 → `setNotesStatFailure("read-failed")` → `triggerWindowFocus()` → `sleep(400)` → 复核（提示**不出现**）→ `setNotesStatFailure(null)` | ⑤ 已置位时注入失败 ⇒ 提示仍在（失败不清除）；⑥ 失败期间 `.notes-notice === null`、`.note-row` 行数不变；⑦ 清位后注入失败 ⇒ 提示**不出现**（失败不置位）；⑧ `notesStatCalls()` 有增量（确有真实调用，不是空跑）；⑨ 点 `.stale-refresh` 后提示消失（点击发生在置位态）；相位的失败注入在 `finally` 语义上被复位（`setNotesStatFailure(null)` 收尾） | `{ phase, staleWhileFailed, notice, rows, staleAfterClear, statDelta }` |
| `inflight-guard` | `setLoadDelay(1200)` → `appendExternalNote(EXTERNAL_2)` → `triggerWindowFocus()` → 等提示 → 记录 `loadCalls()` → **同一同步段内双击**（`js` 内 `btn.click(); btn.click();`）→ 读 `loadCalls()` → 等提示消失且 `.note-row` 命中 `readNotes().length` → `setLoadDelay(0)` | ⑩ 在途双击后 `loadCalls()` 增量恰 **1**（首行守卫拦下第二次；`disabled` 为第二道防线）；⑪ 刷新落地后 `.notes-stale` 不在 DOM、`.note-row` 行数 = `readNotes().length` | `{ phase, loadDelta, staleAfter, rows, fileRows }` |

#### 5.4.8 场景 `r14-5`（组 `r14-group-jump`，2 条 record，1 张截图）

前置：`enterNotesProbe()`（`sample-paper.pdf` 第 1 页 + 面板 4 行；A 的阅读现场已被清空 ⇒ 目标文档无恢复记录）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `current-noop` | 读当前组头（DOM 首个 `.notes-group` 的 `.notes-group-head`）：`is-openable` / `cursor` / `title` → 点其 `.group-name` → 复读文档名 / 页码 / 分组顺序 / `notesHash()` | ① 当前组头不含 `is-openable`、`cursor !== "pointer"`、head `title` 逐字 `sample-paper.pdf`；② 点击后 `.center-pill .pill-label` 逐字 `sample-paper.pdf`、`.page-label` 仍含 `第 1 / 3 页`、`.notes-group` 顺序不变、`notesHash()` 不变 | `{ phase, openable, cursor, title, pillLabel, pageLabel, hashSame }` |
| `jump-other-doc` | 读 older 组头（`title` 含 `archive/older-paper.pdf`）：`is-openable` / `cursor` → 点其 `.group-name` → `waitPdfLoaded()` + `waitPage(1, 2)` → 读文档名 / 分组顺序 / 行数 / 调用计数 / 哈希 → 截图 `r14-5-group-jump.png`（整窗） | ③ 非当前组头 `is-openable` 在场且 `cursor === "pointer"`；④ `.center-pill .pill-label` 逐字 `older-paper.pdf`、`.page-label` 含 `第 1 / 2 页`；⑤ 分组随当前文档重排：DOM 首个 `.notes-group` 的 head `title` 逐字 `archive/older-paper.pdf` 且其内含文本 `当前文档`；⑥ 笔记数据零改写：`.note-row` 仍 4 行、`notesHash()` 不变、`loadCalls()` / `notesStatCalls()` 无增量（跳转不发笔记 IPC） | `{ phase, openable, cursor, pillLabel, pageLabel, firstGroup, rows, hashSame, loadDelta, statDelta }` |

#### 5.4.9 配额与截图清单（冻结，不得减少）

| 项 | 值 |
| --- | --- |
| 场景 | **5**（`r14-1`…`r14-5`） |
| 组 / record | **5 组 13 条**：`r14-tree-badge` 3 / `r14-tree-badge-scope` 2 / `r14-notes-stale` 3 / `r14-notes-stale-failure` 3 / `r14-group-jump` 2 |
| 截图（8 张，逐字） | `r14-1-tree-notes-badge.png`（左栏）、`r14-1b-tree-badges-narrow.png`（左栏）、`r14-2-tree-badge-workspace-b.png`（左栏）、`r14-3-stale-row.png`（左栏）、`r14-3b-refresh-keeps-draft.png`（左栏）、`r14-3c-refresh-list-synced.png`（左栏）、`r14-4-stat-failure-silent.png`（左栏）、`r14-5-group-jump.png`（整窗） |
| label | 新增 **5** 种（46 ⇒ 51） |
| `SEL` | 新增 **6** 项（54 ⇒ 60，只增不减） |
| stub 控制口 | 新增 **2** 个（`notesStatCalls` / `setNotesStatFailure`）+ 1 个 stub 方法（`notesStat`）+ 1 个内部函数（`currentNotesFile`） |

### 5.5 基线与零缺失比对（基线 = `C:/Users/86157/AppData/Local/Temp/pix-v05-r13-review`）

```bash
BASE="C:/Users/86157/AppData/Local/Temp/pix-v05-r13-review"
AFTER="C:/Users/86157/AppData/Local/Temp/pix-v05-r14-after"

# ① 截图集合零缺失 + 新增张数 + failure 字段
node -e "const fs=require('fs');const L=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));const b=L(process.argv[1]),a=L(process.argv[2]);const S=(x)=>new Set(x.shots.map(s=>s.name));const bs=S(b),as=S(a);console.log(JSON.stringify({base:b.shots.length,after:a.shots.length,missing:[...bs].filter(n=>!as.has(n)),added:[...as].filter(n=>!bs.has(n))}));console.log('AFTER_FAILURE='+JSON.stringify(a.failure))" "$BASE/shots/MANIFEST.json" "$AFTER/shots/MANIFEST.json"
# ⇒ base:135、after:143、missing:[]、added = §5.4.9 的 8 张、AFTER_FAILURE=null

# ② 测量 label 零缺失（按 label 计次，基线每 label 的条数不得减少）
node -e "const fs=require('fs');const L=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));const cnt=(x)=>{const m=new Map();for(const e of x)m.set(e.label,(m.get(e.label)||0)+1);return m};const cb=cnt(L(process.argv[1])),ca=cnt(L(process.argv[2]));console.log(JSON.stringify({baseLabels:cb.size,afterLabels:ca.size,baseMeasurements:cb.size&&[...cb.values()].reduce((s,v)=>s+v,0),afterMeasurements:[...ca.values()].reduce((s,v)=>s+v,0),missing:[...cb].filter(([k,v])=>(ca.get(k)||0)<v).map(([k,v])=>k+':'+v+'->'+(ca.get(k)||0))}))" "$BASE/shots/MEASUREMENTS.json" "$AFTER/shots/MEASUREMENTS.json"
# ⇒ baseLabels:46、afterLabels:51、baseMeasurements:198、afterMeasurements:211、missing:[]

# ③ 本轮基线目录（步骤 0c）与验收目录的交叉核对：本轮基线每个 label 的条数不得减少
node -e "const fs=require('fs');const L=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));const cnt=(x)=>{const m=new Map();for(const e of x)m.set(e.label,(m.get(e.label)||0)+1);return m};const b=cnt(L(process.argv[1])),a=cnt(L(process.argv[2]));console.log(JSON.stringify({r14BaseLabels:b.size,afterLabels:a.size,missing:[...b].filter(([k,v])=>(a.get(k)||0)<v).map(([k,v])=>k+'->'+(a.get(k)||0))}))" "C:/Users/86157/AppData/Local/Temp/pix-v05-r14-base/shots/MEASUREMENTS.json" "$AFTER/shots/MEASUREMENTS.json"
# ⇒ r14BaseLabels:46、afterLabels:51、missing: []（本轮基线 135 / 198 / 46 与 R13 目录读数一致；两条比对都要过）

# ④ 产物目录白名单（脚本内已自检；此处人工复核）
ls -A "$AFTER/shots" | grep -v -E '\.png$' | grep -v -E '^(MANIFEST|MEASUREMENTS)\.json$' ; echo "STRAYS_EXIT=$?"   # 期望无输出、EXIT=1

# ⑤ 新增相位的现场读数（供 dev 档登记与人工复核）
node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));for(const e of x) if(e.label.startsWith('r14-')) console.log(e.label, JSON.stringify(e.data).slice(0,400))" "$AFTER/shots/MEASUREMENTS.json"
```

**允许的位移与内容变更（冻结，与需求 §0.9 逐条一致）**：① 有笔记的树行新增 `.row-notes` 计数（既有截图出现新元素 = 预期内容变化）；② 该计数在行内余量不足时被压缩 / 右端裁切（`.row-notes` 是行内唯一可收缩项 ⇒ `.row-label` 与 `.row-progress` 的几何零变化）；③ 面板在 `.notes-notice` 与 `.notes-undo` 之间可能多出 `.notes-stale` 行（仅当 `externalChange === true`，既有场景不会出现）；④ 非当前文档分组的组头出现 `is-openable` 类与 `cursor: pointer`（静态几何零变化）；⑤ 场景 24 的 B 侧 pill 文本由 `笔记 5` 变为 `笔记`（§2.2 登记项）。**不允许**：`.row-progress` 的文本 / 几何变化（盒宽与右缘贴齐须与 R13 一致 ±1px）；面板既有行与控件的几何 / 文本变化；任何 `w/h/fontSize/color/background` 的非预期差异。**硬约束**：既有 `tree-progress` 场景的 `overflowFree`（行级与 label 级）必须保持绿。

### 5.6 走查清单（一次跑完，逐条对人）

| # | 命令 / 检查 | 期望 |
| --- | --- | --- |
| 1 | `git status --short` | 只出现 §4 白名单（12 个修改 + 本档）；无临时产物、无调试日志 |
| 2 | §1.8 的 #1–#17 | 逐条命中期望值 |
| 3 | §2.3 的 ①–⑤ 零 diff 命令 | 逐条为空 / 命中期望计数 |
| 4 | `git diff -- pix/scripts/ui-shot.mjs` 的 hunk 清单 | 只含：stub 四处（require / `currentNotesFile` / `notesStat` / 控制口）、`SEL` 6 行、6 个 helper、三条夹具、`r14-1`…`r14-5` 段落；既有场景函数体零改动 |
| 5 | `git diff -U0 -- pix/src/renderer/components/workspace/LibraryPanel.vue` | `+` 行只含：两行 import、`noteCountMap` / `rowsWithBadge`、`.row-notes` 模板 3 行、`.row-notes` 样式块、`v-for` 数据源行；`-` 行只有 `v-for` 数据源那一行的旧值 |
| 6 | `git diff -U0 -- pix/src/renderer/components/workspace/NotesPanel.vue` | `+` 行只含：两处 import、`refreshing` / 四个函数、`.notes-stale` 模板块、`.notes-stale` / `.stale-text` 样式、`is-openable` 两条样式、`onMounted` 注册与 `onBeforeUnmount` 注销各 1 行、`.notes-group-head` 的 `:class` / `@click` |
| 7 | `grep -c "text-overflow" pix/src/renderer/components/workspace/LibraryPanel.vue` | 与 R13 同（新增命中 0；`.row-notes` 不得出现省略号） |
| 8 | `grep -rn "notesStat" pix/scripts/ui-shot.mjs` | 命中：stub 方法 1 + 计数变量 1 + 计数控制口 1 + 注入控制口 1 + 失败分支 2（`=== "throw"` / `notesStatFailure` 判真） |
| 9 | 两个烟测连跑两次 | `通过 51 / 失败 0` 与 `通过 35 / 失败 0` 稳定复现；`%TEMP%` 无残留目录 |
| 10 | `npm run check` | `CHECK_EXIT=0`（无 `any`、无内联动态 import、全部顶层 import） |

---

## 6. 风险 Top3 与判定方式

**R1「徽标计数与面板 / 文件不一致（口径漂移）」** —— 最易错处：漏计 `answer`（用「摘录数」冒充「笔记数」）、滑到第二套文档归属判定（绝对路径 vs 比较键大小写 / 尾斜杠）、懒加载或未展开子目录的笔记丢失、跨工作区不清基线把 A 的计数画到 B 的同名文件上。

- 判定：烟测 `badge-counts` #1/#3/#4/#5（逐字段计数、只产出 >0、比较键归一、恒等式）；`r14-1` 相位 `badges`（两行文本与 tooltip 逐字）与 `live`（删除 / 撤销联动 + 过滤态口径）；`r14-2`（B 侧 0 徽标 + 回切恢复）；`r14-3` 相位 `refresh-draft` ⑬（外部新增后刷新 ⇒ 徽标同步）。
- 失败信号：sample 显示 `2 条`（漏计 answer）；B 工作区出现 A 的计数；0 笔记行出现徽标；tooltip 缺少 `AI 结论 0 条` 段。

**R2「外部改动检测误报 / 漏报 / 阻塞」** —— 自己写盘后基线未更新 ⇒ 误报；焦点检测未注册或只比对 `mtime` ⇒ 漏报；失败路径弹错 / 写日志 / 清掉已置位状态 ⇒ 阻塞；刷新时顺手重置列表或草稿 ⇒ 违背「绝不静默覆盖」。

- 判定：`r14-3` 相位 `enter-fresh`（不误报）、`detect`（漏报反例：提示必须出现且列表不动）、`refresh-draft`（草稿保留 + 只读刷新 + 提示消失）；`r14-4` 相位 `write-rebaseline`（写后不误报）、`stat-failure-silent`（失败保持现状、无提示无弹错）、`inflight-guard`（在途只发一次 IPC）；烟测 `notes-stat` #1/#5/#6（只读、幂等、不解析内容）。
- 失败信号：写操作成功后仍显示提示；四个时机中任一漏检；失败注入后出现 `.notes-notice`；刷新后 textarea 消失或草稿被清；检测改动 `notes.json` 字节。

**R3「新 UI 挤动既有版面 / 既有离屏断言变红」** —— 树行第二枚标记吃掉行内余量（实测：sample 34px / older 14px）；一旦 `.row-notes` 反向挤动 `.row-label`，既有 `tree-progress` 的 `overflowFree` 会红；stub 笔记根改造若在 A 侧产生差异，会让既有 135 张截图 / 198 条测量的零缺失比对失败；面板提示行插错位置会破坏既有 DOM 顺序断言。

- 判定：`r14-1` 相位 `badges` ⑤ 与相位 `narrow` ⑪（防空）⑫⑬⑭（行不溢出 + progress 文本 / 盒宽 / 右缘 + 徽标让位判据）与 ⑮⑯（复原向：`.layout-left` 268±2 + 徽标回默认读数）；既有场景 21 / 21b / 24 零缺失通过；§1.8 走查 #8（`.row-progress` 零 diff 且 `margin-left: auto` 仍 1 处）；§5.5 零缺失比对（135 / 198 / 46 一条不少）；`r14-3` 的 `staleProbe().order`。
- 失败信号：默认宽度下 `.row-label` 出现省略号；`.row-progress` 的 `x/y` 变化超出「右缘贴齐 ±1px」；`.row-notes` 出现空胶囊 / 省略号；`.notes-stale` 出现在 `.notes-notice` 之前或 `.notes-undo` 之后；`r14-*` 之外的 label 条数减少；场景 24 的 B 侧除 pill 文本外出现差异。

**次级风险（不占 Top3；逐条给出处置）**

1. **次像素取整**：`flex-shrink: 1000` 下 label 仍承担 ≈0.04px（§1.4 次像素说明）⇒ 若某 DPR 下 `labelClientWidth` 的取整方向不利，既有 `overflowFree` 可能红：处置 = 按需求 §0.9 硬约束继续收窄徽标盒模型（文案逐字不变）并在 dev 档登记实测读数；不得放宽判据。
2. **stub 笔记根改造的 A 侧等价性**：`activeRoot` 初值 = `CONFIG.root`，但 `stopSession` 不清 `activeRoot`（既有登记差异）⇒ 处置：dev 阶段实跑既有 135 张截图确认零缺失；任何 A 侧差异即停线排查。
3. **`.notes-stale` 与 4s 瞬时 `.notes-notice` 可能同屏**：两者语义不同、都非阻塞；处置 = `r14-3` 只断言顺序（`header < stale` 与 notice 相对位次），不断言互斥；视觉上登记一张同屏形态（若 dev 阶段可构造）。
4. **`notes-stat` 每次焦点整读并哈希文件**：超大 `notes.json` 会有一次同步读；处置 = 本轮不做节流（焦点事件频率低、文件规模受既有 `addNote` 语义约束），登记为已知取舍；如后续需要另立需求。
5. **离屏的焦点是合成事件**：真实窗口激活路径无法由现有判据覆盖 ⇒ 处置 = dev 档人工做一次「切出 → 外部改文件 → 切回」走查并登记结论（不新增离屏判据）。
6. **`r14-3` 的 DOM 顺序相对判据在 `detect` 相位为「缺席不判」**（notice / undo 均不在场）⇒ 处置 = 以 `staleProbe().order.names` 的现场值与「stale 紧随 header」的强断言补足；dev 档登记现场 `names` 数组。
7. **提示行消失路径与 ⇔ 语义**：外部改动被撤回成原字节时 compare 会清零标记（§1.6 判定式）⇒ 处置 = 登记为正确语义（标记只在「文件当前指纹与基线一致」时为零）；无判据要求「只能靠刷新消失」。
8. **捕获失败可能产生一次误报**：写成功但 `notesStat` 失败时基线停留旧值 ⇒ 处置 = 登记项（§1.6）；用户可见且可刷新，不静默；离屏的失败注入只作用于 compare 相位。
9. **`.stale-refresh` 的禁用态与 `loading` 同时存在**：`clickEl` 是 `js` 往返，第二次点击可能打在 `disabled` 上（与 R13 的 S-d4 同类）⇒ 处置 = 判据只认「`loadCalls()` 增量恰 1」，两处拦截点任一命中即通过。
10. **`r14-5` 的目标文档落地页**：依赖 A 的阅读现场被清空（`enterNotesProbe` → `enterCleanWorkspace` → `clearStateA()`）⇒ 若某次运行遗留现场，`waitPage(1, 2)` 会红；处置 = 断言前不做额外清理，红灯时先查 `clearStateA()` 是否落地。

---

## 7. 开发分工（A 契约与数据面 / B UI 与离屏）

### 7.1 建议 A / B 两面（白名单互不重叠）

| 面 | 白名单（6 + 6 = 12 个文件） | 内容 |
| --- | --- | --- |
| **A：契约与数据面** | `pix/src/renderer/utils/notes-path.ts`、`pix/src/shared/types.ts`、`pix/src/main/notes-store.ts`、`pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`、`pix/scripts/smoke-notes.mjs`、`pix/scripts/smoke-view.mjs` | N87-2 的纯函数（§1.3）、§1.1（四面同步的类型 / handler / preload）、§1.2（`statNotesFile`）、§5.2 / §5.3（两个烟测组） |
| **B：UI 与离屏** | `pix/src/renderer/components/workspace/LibraryPanel.vue`、`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue`、`pix/src/renderer/pages/WorkspacePage.vue`、`pix/scripts/ui-shot.mjs` | §1.3 的消费侧（memo + 行渲染）、§1.4（树徽标）、§1.5 / §1.6（检测时机与状态机）、§1.7（提示行 / 刷新 / 组头跳转）、§5.4（stub + `SEL` + helper + 5 场景 13 条 record / 8 张截图） |

**接口冻结（两侧必须逐字遵守）**

1. A 提供、B 消费：通道名 `notes-stat`、preload 方法 `notesStat`、类型 `ReaderNotesStatResult`（§1.1.2 逐字）、返回面五情形（§1.2 逐字）、纯函数 `countNotesByDocument` 与 `NotesBadgeCount`（§1.3 逐字）。
2. A **不得**改 `LibraryPanel.vue` / `stores/notes-store.ts` / `NotesPanel.vue` / `WorkspacePage.vue` / `ui-shot.mjs`；B **不得**改 `notes-path.ts` / `types.ts` / `main/**` 三个文件 / 两个烟测脚本。
3. **落地顺序（冻结）**：**A 先落**（`npm run check` 绿 + `smoke:notes` 与 `smoke:view` 各连跑两次全绿）→ 再落 B。理由：B 的 `check` 依赖 A 的类型、preload 方法与 `countNotesByDocument` 存在；B 的离屏 stub 必须返回与 A 一致的 `ReaderNotesStatResult` 形状。若并行，B 只能先写模板 / 样式 / 场景骨架，**不得**在 A 落地前跑验收（`check` 会红、`r14-1` 的徽标断言与 `r14-4` 的检测断言会红，读数不可用）。
4. 两侧共用 `record` 语义与 `MANIFEST` / `MEASUREMENTS` 字段（零改动），无需额外接口。

### 7.2 备选：单代理（推荐当只有一名开发者时）

执行顺序（冻结）：

1. **动工前**：`npm run check`（`CHECK_EXIT=0`）+ 步骤 0b 的基线读数核对（135 / 198 / 46 / `r14:0`）+ 步骤 0c 的本轮基线实跑（`pix-v05-r14-base`）。
2. **A1 纯函数**：`notes-path.ts` 的 `NotesBadgeCount` + `countNotesByDocument` → `npm run check`。
3. **A2 类型与数据面**：`types.ts` → `main/notes-store.ts`（import 两行 + `statNotesFile`）→ `ipc-handlers.ts`（import + handler）→ `preload.ts`（import + 接口 + 实现）→ `npm run check`。
4. **A3 烟测**：`smoke-notes.mjs`（常量 + `runNotesStat` + `main()` 一行）与 `smoke-view.mjs`（夹具 + `notesPath` 句柄 / require + `runBadgeCounts` + `main()` 一行）→ 两个烟测各连跑两次（`通过 51 / 失败 0`、`通过 35 / 失败 0`）。
5. **B1 树**：`LibraryPanel.vue`（import → 两个 computed → 模板 3 行 → 样式块 → `v-for` 数据源）→ `npm run check`。
6. **B2 store**：`stores/notes-store.ts`（import 类型 → 状态与内部变量 → `syncNotesFile` / `checkNotesFile` → 三处调用点 → `resetNotes` 三行 → 返回对象两行）→ `npm run check`。
7. **B3 面板与页面**：`NotesPanel.vue`（vue import 增 `onMounted`、notes-path import 增 `NoteGroup` → `refreshing` 与四个函数 → `.notes-stale` 模板块与 `.notes-stale` / `.stale-text` 样式 → `onMounted` 注册 / `onBeforeUnmount` 注销 → `defineEmits` 增 `open-note-doc` → `.notes-group-head` 的 `is-openable` 绑定与两条样式）→ `WorkspacePage.vue`（`onOpenNoteDoc` + 模板绑定）→ `npm run check`。
8. **B4 离屏**：`ui-shot.mjs`（require 面 + `currentNotesFile` + `notesStat` + 两个控制口 → `SEL` 6 项 → 6 个 helper + 三条夹具 → `r14-1`…`r14-5`）→ `npm run check`（脚本不在工程门内，此步只为确认未破坏源码）。
9. **验收**：`PIX_SHOT_ROOT=<tmp>/pix-v05-r14-after` 实跑 → §5.5 的零缺失比对（143 / 211 / 51 / `missing: []` / `added` = 8 张）→ §8 的 8 张目视登记 → 树 / 面板类既有截图的内容抽样登记（§2.2 登记项）。
10. **收尾**：`git status --short` 只出现 §4 白名单；`git add <具体路径>`（绝不 `git add .` / `-A`）；提交由负责人完成。

**纪律**：只提交本会话改动的文件；不跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；不改白名单外任何文件；不引入或升级依赖；不改 `packages/**` 与 `package-lock.json`；任何 git 写命令由负责人执行。

---

## 8. 视觉验收要点（窄栏 / 与既有徽标并存 / 折行）

**新增 8 张截图（逐张目视登记，结论写入 `R14-dev.md`；登记模板：截图名 / 路径 / 观察项 / 结论）**

| 截图 | 观察项（逐条） | 预期 |
| --- | --- | --- |
| `r14-1-tree-notes-badge.png`（左栏） | 两行的两枚标记是否并排且不重叠（计数在左、页码在右）；`older` 行徽标是否已被压缩（只看得到数字、无「条」残留、无背景块、无省略号）；行名是否未被截断 | sample 行 `3 条` 完整；older 行呈「数字 + 被裁切的条」形态；`.row-label` 无省略号 |
| `r14-1b-tree-badges-narrow.png`（左栏） | 窄栏（≈220px）下两枚标记的让位顺序（先压计数、再挤行名）、`.row-progress` 是否仍贴右缘、是否出现横向溢出条 | 行不溢出；页码徽标形态与默认宽度一致；计数可被压到不可见 |
| `r14-2-tree-badge-workspace-b.png`（左栏） | B 侧树上**不得**出现任何计数标记；左侧 pill 文本为 `笔记`（B 无笔记） | 无 `.row-notes`、无残留 |
| `r14-3-stale-row.png`（左栏） | 提示行位置（在头部之下、笔记列表之上）、文本一行可读不折行、刷新按钮形态与既有行内 `x-small` text 按钮同高同字号、不压住相邻块 | 文本 `笔记文件已被外部修改，面板内容可能过期` + 按钮 `刷新` |
| `r14-3b-refresh-keeps-draft.png`（左栏） | 刷新后编辑框仍在、草稿文本完整可见、「保存 / 取消」按钮未被挤掉；列表已同步到 6 行 | 草稿逐字 `刷新不应丢弃这段草稿` |
| `r14-3c-refresh-list-synced.png`（左栏） | 提示行消失、列表 6 行、分组计数与徽标一致 | 面板与文件一致 |
| `r14-4-stat-failure-silent.png`（左栏） | 注入失败状态下的界面：提示行仍在、无错误条（`.notes-notice` 缺席）、列表行数不变 | 静默：无任何弹错 |
| `r14-5-group-jump.png`（整窗） | 跳转后中间阅读区文档名与页码、左栏分组重排（other 组带「当前文档」chip）、当前组头无手型光标 | `older-paper.pdf` + `第 1 / 2 页` |

**目视要点（冻结）**

1. **与既有徽标并存**：同一行内两枚标记构成「计数（左、10px 次要色小字、无背景）→ 进度（右、11px 胶囊、`margin-left: auto` 贴行右缘）」的固定语序；两枚标记之间留一个 4px gap，**不得**重叠（判据 `notes.right ≤ progress.left`），也**不得**出现「计数跑到页码右侧」。
2. **窄栏表现**：`.layout-left` ≈220px 时，先由计数让位（可被压到 0 宽即完全不可见），再动行名（既有 `text-overflow: ellipsis`），**永不**挤动页码徽标；行不得出现横向滚动条。
3. **折行与裁切**：`.row-notes` 必须单行（`white-space: nowrap`），空间不足时按**右端硬裁切**（数字在最左、优先保留），**不得**出现省略号（`text-overflow`），也**不得**因压缩留下空胶囊 / 半截背景。
4. **无笔记的行零变化**：目录行、0 笔记文档行的行高、行名、图标、进度徽标与 R13 逐像素一致（`r14-1` 相位 `badges` ③⑤ 与既有场景 21 / 21b 零缺失共同承担）。
5. **提示行的插入感**：`.notes-stale` 与 `.notes-undo` 同盒模型（同边距 / 同圆角 / 同内边距 / 同边框 / 同背景）、`.stale-text` 与 `.undo-text` 同字号与颜色；`刷新` 按钮与导出 / 报告行的「在文件夹中显示」**同高同字号**（Vuetify `x-small` text，无自有样式覆盖）。
6. **提示行的非阻塞形态**：出现时**不**遮罩、不弹窗、不把既有行挤出可视区；面板可继续滚动与交互；提示不自动消失、无关闭按钮。
7. **组头可点形态**：非当前文档组头悬停时文档名变色（`var(--pix-text-link)`）+ 手型光标；**不加**图标 / 下划线 / 按钮；当前文档组头无任何可点暗示（`cursor` 非 `pointer`）；组头几何与既有 `groupName` / `groupPath` / `.group-count` 完全一致。
8. **既有截图的内容变化（登记项）**：① 含 A 侧资料库树的既有截图会出现 `.row-notes`（示例 `21-tree-progress.png`）；② 场景 24 的 B 侧 pill 文本由 `笔记 5` 变为 `笔记`。§5.5 的零缺失判据只比 basename / label 集合，**不覆盖内容差异** ⇒ dev 档按文档分类抽样登记（或逐张登记）并确认无「非预期的重叠 / 截断 / 遮挡」。
9. **结论判红规则**：出现任何**非预期**差异（控件重叠、文字截断、按钮不可辨识、既有控件位移超出 §5.5 白名单、出现空胶囊或省略号）⇒ 记录截图路径 + 差异描述并停线排查；**不得**以「目视误差」结案（与 R11 / R12 / R13 §8 同纪律）。

---

## 附：本档自检（交付面）

| 项 | 值 |
| --- | --- |
| 涉及文件数 | **12 个源码 / 脚本被修改**（A 面 7：`renderer/utils/notes-path.ts`、`shared/types.ts`、`main/notes-store.ts`、`main/ipc-handlers.ts`、`main/preload.ts`、`scripts/smoke-notes.mjs`、`scripts/smoke-view.mjs`；B 面 5：`renderer/components/workspace/LibraryPanel.vue`、`renderer/stores/notes-store.ts`、`renderer/components/workspace/NotesPanel.vue`、`renderer/pages/WorkspacePage.vue`、`scripts/ui-shot.mjs`）+ **1 份文档新建**（本档）；另有 **1 个文件登记为不动**：`pix/package.json` |
| 新增断言组 | **7 组**（烟测 2 组 13 条：`notes-stat` 7 / `badge-counts` 6；离屏 5 组 13 条 record：`r14-tree-badge` 3 / `r14-tree-badge-scope` 2 / `r14-notes-stale` 3 / `r14-notes-stale-failure` 3 / `r14-group-jump` 2） |
| 新增场景 | **5**（`r14-1`…`r14-5`）+ 新增截图 **8** 张 + 新增 label **5** 种（46 ⇒ 51）+ `SEL` 新增 **6** 项（54 ⇒ 60）+ stub 新增控制口 **2** 个 + 新增 stub 方法 **1** 个（`notesStat`）+ 离屏新增 helper **6** 个 |
| 新增 IPC | **1**（通道 `notes-stat`，无入参、只读、永不抛错）；新类型 **1**（`ReaderNotesStatResult`）；新纯函数 **1**（`countNotesByDocument`）+ 返回元素类型 **1**（`NotesBadgeCount`）；错误码表**不扩**（仍 11 键） |
| 风险条数 | **13 条**（Top3 + 次级 10） |
| 验收期望读数 | 离屏 143 张 / 211 条测量 / 51 种 label（基线 135 / 198 / 46 零缺失 + R13 目录交叉核对）；`smoke:notes` 通过 51 / 失败 0；`smoke:view` 通过 35 / 失败 0；`check` 0 error |

---

## 定稿修订（R14）

> 本表记录 `docs/pm/R14-review.md`「设计评审（R14）」must-fix 清单 MF-1…MF-5 的逐条处置（**5 采纳 / 0 拒绝**；MF-1 内含 1 处判据口径修正，见下）。正文已按本表就地修订（§1.2 / §1.8 / §4 / §5.4.4 / §6），修订点均以真实文件内容 / 真实命令输出核实（本步实读 / 实跑，未跑离屏取证）。评审「四、非阻塞提示」1–6 不在 must-fix 范围，本步未改正文（按评审口径留待 dev 档登记或就地修订）。

| 编号 | 评审结论（摘要） | 处置 | 正文修订点 | 核实证据 |
| --- | --- | --- | --- | --- |
| MF-1 | 两处消费侧类型 import 未登记（`main/notes-store.ts` / `renderer/stores/notes-store.ts`）⇒ 按字面落地 `check` 必红 | 采纳（含 1 处判据口径修正） | §1.2 落点段（import 行）、§4 第 4 / 7 行、§1.8 #1（新增两条计数判据） | 实读 `pix/src/main/notes-store.ts:14-27`：类型 import 名单止于 `ReaderNotesResetResult,`（`:26`），无 `ReaderNotesStatResult`；实读 `pix/src/renderer/stores/notes-store.ts:12-18`：`@shared/types` 名单止于 `ReaderNotesReportChapter,`（`:17`），无 `ReaderNotesStatResult`。**口径修正**：评审给渲染层计数 = 1（import 1），但本档 §1.6 参考实现含 `let result: ReaderNotesStatResult;`（函数体 1 处）⇒ 按可满足口径落为 **2**（import 1 + 标注 1）；主进程侧维持评审的 **2**（import 1 + 返回类型 1） |
| MF-2 | §1.8 #16「`grep -c "NOTES_FILE"` 不减少」与 §1.1.4 第 2 项冲突（改用 `currentNotesFile()` 后必然降到 9） | 采纳 | §1.8 #16（改写为「常量保留且 ≥ 3 处引用 + `currentNotesFile()` ≥ 6 处 + 计数 = 9」） | 实跑 `grep -c "NOTES_FILE" pix/scripts/ui-shot.mjs` ⇒ **14**，逐行命中 `:428` / `:445` / `:484` / `:493` / `:494` / `:869` / `:871` / `:1054` / `:1107` / `:2207` / `:2208` / `:2209` / `:6831` / `:7406`；待改 5 行 = `readNotesFile`（`:484`）+ `writeNotesFile`（`:493` / `:494`）+ `notesLoad` 两分支（`:869` / `:871`）⇒ 改后 14 − 5 = **9**；保留引用点实读 = `:428` 定义 / `:1054` `notesReset` 的 `backupPath` / `:1107` `seedNotes` 返回值 |
| MF-3 | §1.8 #12「`:title="group.docPath"` 行零 diff」与 §2.2 第 4 行冲突（同一行必然出现在 `git diff`） | 采纳 | §1.8 #12（改为「绑定表达式逐字 + 子结构零改动；该行属预期 `+` 行」） | 实读 `pix/src/renderer/components/workspace/NotesPanel.vue:621` = `<div class="notes-group-head" :title="group.docPath">`（单行）；§2.2 第 4 行要求同一行新增 `:class` / `@click` ⇒「行零 diff」按字面不可满足（与 R14-req MF-7 同源的整行 diff 陷阱） |
| MF-4 | `r14-1` 相位 `narrow` 缺 `.row-notes` 存在性防空（徽标缺席时空断言假绿） | 采纳 | §5.4.4 `narrow` 相位：⑪（两行 `notesCount === 1` 且 `notesClientWidth !== null`）、`data` 说明（`notesClientWidth ∈ {0} ∪ [5, ∞)`） | 本档 `badgeProbe`（§5.4.2）在节点缺席时返回 `notesClientWidth: null`；让位判据在徽标缺席时更易成立（`labelFloor` 不含徽标项 ⇒ 行名余量更大）⇒ 必须显式防空 |
| MF-5 | `r14-1` 相位 `narrow` 缺 restore 侧判据（未对齐 R11 三相位范式，M4 教训） | 采纳（不新增 record / 截图，配额不变） | §5.4.4 `narrow` 相位：步骤增「复读」段 + 断言 ⑮⑯、`data` 增 `restored`；§6 R3 判定行号同步 | 实读 `--pix-left-width`（`pix/src/renderer/assets/styles/variables.css:112` = `268px`）；R11 三相位范式实读 `ui-shot.mjs:6753-6815`（`default-width` → `narrow-220` → `restored-width`，`widthOk11e = Math.abs(probe.leftWidth - 268) <= 2`）；§5.4.9 配额（**5 组 13 条 record / 8 张截图**）保持不变 |

**本步核实命令（节选）**：`grep -c "NOTES_FILE" pix/scripts/ui-shot.mjs` ⇒ **14**；`grep -n "NOTES_FILE" pix/scripts/ui-shot.mjs`（逐行命中如上）；`grep -c "ReaderNotesStatResult" pix/src/renderer/stores/notes-store.ts` 改前实跑 = **0**，改后值按 §1.6 参考实现推定为 **2**（import 1 + 标注 1）；实读文件 / 行号：`pix/src/main/notes-store.ts:14-27`、`pix/src/renderer/stores/notes-store.ts:12-18`、`pix/src/renderer/components/workspace/NotesPanel.vue:621`、`pix/src/renderer/assets/styles/variables.css:112`、`pix/scripts/ui-shot.mjs:6753-6815`。

**修订后一致性自检**：§1.8 仍为 **17** 行（#1 / #12 / #16 就地改写，不新增行）；`narrow` 相位断言 ⑩–⑯ 与 §6 R3 的引用同步；§5.4.9 的配额（13 条 record / 8 张截图 / 5 种 label / `SEL` 6 项 / stub 控制口 2 个 / helper 6 个）与「附：本档自检」逐条零变化；本轮涉及文件数 / 新增断言组数 / 验收期望读数均不变。
