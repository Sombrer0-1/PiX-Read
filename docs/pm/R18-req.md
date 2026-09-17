# PiX-Read R18 需求档 · 对话锚定（N100–N103）

> 上游：`docs/pm/PRD-V0.6.md` §1 缺口 3（「对话与文档没有绑定关系」：会话按工作区隔离，读某篇论文时找不到当时那段讨论；文档应当记住自己的阅读与讨论历史）、§2（R18 = 对话锚定：阅读现场记住每篇文档的最近会话；提供「继续讨论这篇论文」入口；会话列表标注关联文档；依赖 R6、R10）、§3（`.pix-read/reader-state.json` 为易失状态，**R18 允许新增可选字段（最近会话路径与时间）**；损坏/缺失/版本不符仍必须静默降级，且**旧文件（无新字段）必须零报错读取**）、§4 反需求 3（不做向量检索 / 全文索引 / 知识图谱 / 双链 / 标签体系）、§4 反需求 5（不引入新运行时依赖、不改 `packages/*`、不改 electron-builder 配置）、§4 反需求 6（不改 `.pix-read/notes.json` 的格式与写入协议；`.pix-read/` 之外的仓库内容不被产品写入）、§4 反需求 7（不做向后兼容层、不写未被调用的死代码、不为「看起来高级」加动画）、§5 工程红线（唯一工程门 `npm run check`、禁 any / 内联动态 import、中文文案、冻结字面显式登记、离屏串行与零缺失、临时产物零残留、IPC 入参校验、原子写）、§7 判据 3（**打开一篇读过的文档时，能一步回到上次讨论的会话；会话列表能看出与哪篇文档相关；旧 `reader-state.json` 零报错兼容**）。
> 依赖：`docs/pm/R6-req.md` §0（`.pix-read/reader-state.json` 的文件格式 / 四条降级原因 / 原子写与「主进程唯一写者」契约、`.reader-resume` 续读入口的静默降级语义）、`docs/pm/R8-req.md` §0（**发送瞬间的文档快照**：`readFilePath` / `readPage` 各只读一次，锚点与 `<reading_context>` 共用同一快照；发送失败走 `failOptimisticUserMessage`）、`docs/pm/R10-req.md` §0（会话列表 / 会话切换的既有通道与类名）、`docs/pm/R14-req.md` §0（冻结字面登记范式、`notes-stat` 的 stat 语义与 `.notes-stale` 刷新链路、`ui-shot.mjs` 的「既有场景零改写」硬约束）、`docs/pm/R16-req.md` §0（取证脚本契约：启动守卫 / 产物自净 / 结束自检 / `SEL` 与既有场景零删除 / `record` 的「先落测量再抛错」语义 / r16 场景的追加位置）、`docs/pm/R17-req.md` §0（**`.center-pill` 作为阅读区入口既有范式**（`.map-toggle` / `.shortcut-toggle` 均 Teleport 至该容器）与「工作区阅读区标题栏被隐藏」的既有事实）。
> 本轮唯一主线（负责人已冻结，不得扩张）：**让文档记得自己的讨论** —— 阅读现场记录每篇文档**最近一次讨论**的会话；打开该文档时提供「继续讨论」一步入口；会话列表能看出与当前文档相关的会话；**旧现场文件零报错兼容**。
> 范围约束：不做跨工作区会话聚合、不做「自动恢复上次会话」、不做会话内文档索引、不改内核会话文件（只读列表 + 复用既有 `switch_session` 命令）、不改 `notes.json`、不改 `.reader-resume` 的文案与结构、不改会话菜单既有类名与文案（唯一登记变更 = `#append` 槽守卫位置，见 §0.6）、不引入依赖、**零新 IPC**（`pix/src/main/ipc-handlers.ts` 与 `pix/src/main/preload.ts` 零 diff）。需求编号 **N100–N103**，共 **15** 个子条（N100 5 / N101 4 / N102 2 / N103 4）。

## 0. 定稿修订（R18）

> 依据：`docs/pm/R18-review.md`（独立需求评审；评审对象 HEAD = `1561cb4`）。本节逐条登记 **10 条 must-fix 的处理结论（10 条全部处理、0 条拒绝）**、7 条次要项的处置，以及本轮自审新发现的 2 处不自洽；**正文已按下表改字**。除表中标注「实读复核」的条目外，涉及离屏行为的结论均为代码路径推导（本步未跑离屏、未跑 `npm run check`）。
> 编号说明（次要项 N4）：本节与正文的 §0.1…§0.9 仍是「定稿登记与冻结契约」的冻结编号；本档无自有 §5 号（§4 之后为 §6），正文中出现的 §5 一律指 PRD-V0.6 §5。

| # | must-fix（评审档结论） | 处理 | 正文改动与理由 |
| --- | --- | --- | --- |
| MF1 | `r18-2` 相位 `open-switch-no-write` 判据 ⑤ 的「防空写盘」结构上不可能发生 | **处理**（采纳修法 ①：制造一次真实变化） | 相位步骤改为「`waitPage(2, 3)` 后 `clickNext()` → `waitPage(3, 3)`」，判据 ⑤ 改为 `page === 3`、`scale === 1`、`updatedAt > SEED_AT`。理由（代码路径推导）：夹具 `{page: 2, scale: 1}` + `lastDocPath = "sample-paper.pdf"` ⇒ `loadReaderState` 播种 `committed = toSnapshot(…, 2, 1)`（`renderer/stores/reader-state-store.ts:175-177`）；续读落点快照与基线三字段全等 ⇒ `submitIfChanged` 在 `:135` 直接 return、不开 IPC；翻页路径（`noteChange` `:223` → `capture` `:143` → 600ms 去抖 → `:135` 不等 ⇒ 提交）是唯一自洽的防空构造 |
| MF2 | `r18-5` 判据 ④ 与 ⑥ 互斥；`r18-4` / `r18-5` 依赖未登记的跨场景会话镜像残留 | **处理**（修法 ①②③全采纳） | ① `r18-1` / `r18-4` / `r18-5` 三处前置各追加一次**显式会话行点击**（`openSessionMenu()` + `clickSessionItem(...)` + `closeSessionMenu()`）；② `r18-5` 前置把活动会话显式钉为**记录会话**（`摘录与笔记走查`），判据 ④ 保留「计数 0」并与 §0.6「活动行同样显示标记」、判据 3 的 `.session-delete-btn` 计数 1 自洽；③ 判据 ⑥ 改为「标记恢复 + 入口**预期隐藏**（与 ④ 同口径）」。理由（代码路径推导）：`SESSION_STATE.sessionFile` 默认 = `session-demo.jsonl`（`ui-shot.mjs:645`）= `SESSIONS_A[0].path`；stub 行为变更 ② 的镜像会在 r18-1 相位 2 起把活动会话改为 `session-older.jsonl`，不复位则 r18-5 的入口**可见** ⇒ ④ 恒红、与 ⑥ 对立。显式点击是安全的钉死手段：`ChatPanel.onSelectSession`（`:872-875`）对已是活动会话的行 early-return ⇒ 两种镜像态下结果相同 |
| MF3 | `r18-4` 判据 ②「B 现场文件无该文档条目」与真实行为相反 | **处理**（写死单一口径 + 消除去抖竞态） | 判据 ② 改为「B 现场文件的目标条目**在场**且 `hasOwnProperty("lastSessionPath") === false`」，读取前用新增的文件轮询 helper `waitState(...)` 等一次落点写盘。理由（代码路径推导）：B 侧基态 missing ⇒ `committed = null`（`:175-177`）⇒ `openRow` 后 `noteLanding`（`PdfViewer.vue:744`）→ 去抖 → `:135` 基线为 null ⇒ 必写 `{page: 1, scale: 1, updatedAt}`，「无该文档条目」在 600ms 后必然为假。**对评审档证据的修正（实读）**：`STATE_FILE_B` 不是跨次保留——`writeFixtures()`（`ui-shot.mjs:397`）每次运行删除 A/B 两库的 `reader-state.json`（`:409-410`），且 B 库在本轮之前无任何写入点（R6 `workspace-switch` `:2348`、R14 `:8704` 只读树行）⇒ 结论不变 |
| MF4 | `N100-4` 判据 4 的「唯一调用点」与 `send()` 真实控制流冲突 | **处理**（采纳修法 ②：极小重构 + 显式登记） | §0.4「触发时机」与 §7 白名单第 5 行改为「把流式分支的 `return` 改为 `if/else`，`noteDiscussion` 置于 try 尾部的**唯一调用点**」，§0.1 的 R8 冻结行内登记该 `-` 行与语义等价性说明；N100-4 判据 4 的 `grep -c "noteDiscussion" ChatPanel.vue` = **1** 因此保留（修法 ① 会把它放宽到 2）。理由（实读）：`send()` `:384`、`if (isStreaming.value)` `:426`、`sendSteer` `:427`、`return` `:428`、`sendPrompt` `:430`，该分支之后 try 内无其它语句 |
| MF5 | `r18-1` 相位 2 / 相位 3 的「刚刚」逐字断言无 60s 护栏 | **处理**（采纳修法 ①+②） | 相位 2 改为「`waitDiscussText(前缀)` + 时间后缀 ∈ 运行时允许集」；相位 3 的「与相位 2 逐字相等」改为**数据面**断言（现场文件 `lastSessionAt` 逐字不变）。允许集规则：读现场文件 `lastSessionAt`，Δ = 断言时刻 − `lastSessionAt`，允许 `{刚刚} ∪ {N 分钟}`（N 取 `floor(Δ/60000)` 与 `+1` 两档）。理由（实读）：`formatSessionTime` 的 `刚刚` 窗口是 `diff < 60_000`（`renderer/utils/session-title.ts:81`），`waitFor` 默认超时 20s（`ui-shot.mjs:1608`）叠加截图与轮询 ⇒ 跨相位耗时不可控、逐字断言必然漂移；`昨天` 档（`diff ∈ [24h, 48h)`）由 `PAST_AT` 种子场景（r18-3 / r18-4）确定性覆盖，r18-1 不再承担「确定档位」职责 |
| MF6 | `noteDiscussion` 提交路径缺 `saveEpoch` 竞态守卫 | **处理** | §0.4「触发时机」+ §0.7「动作 `noteDiscussion`」冻结：`noteDiscussion` **复用 `submit()` 的提交路径**（把 `submit` 的 payload 扩展为可选携带两键，同一条 `saveEpoch` 守卫、同一条 warn 语义），**不得新增第二条裸 `bridge().readerStateSave(...)`**；新增两条走查判据：`grep -c "readerStateSave" pix/src/renderer/stores/reader-state-store.ts` = **1**（当前实读 = 1，`:113`）、`git diff -U0` 中 `noteDiscussion` 的提交不得脱离 `submit()`。理由（实读）：`saveEpoch` 语义见 `:62-63` 注释与 `:111` / `:119` / `:126`；触发复位的既有路径是 `WorkspacePage.vue:134-146`（`onUnmounted`：flush → resetState）与 `:251-266`（`goHome`） |
| MF7 | 事实基线 `SEL` 计数错（档内 64，实读 72） | **处理** | 全档 `SEL` 由 **64 → 72**（新增 2 ⇒ **74**）：事实基线表「离屏脚本现状」行、§0.8 的 `SEL` 行、§N103-2「既有面」行、§7 白名单第 8 行。实读复核：`sed -n '47,128p' pix/scripts/ui-shot.mjs \| grep -cE '^  [a-zA-Z]+: '` = **72** |
| MF8 | 事实基线 6 处 `ui-shot.mjs` 行号与 HEAD 不符 | **处理** | 按实读改字：`openRow` `:1706` → **`:1721`**；`clickNext` / `clickPrev` `:1715-1716` → **`:1730` / `:1731`**；`rectOfSelector` `:2569` → **`:2579`**；`backToLibraryTab` `:4506` → **`:4521`**；`waitNotesTab` `:4510` → **`:4525`**；场景收口 `:11565` → **`:11532`**（前一条 `await restoreStandardSeed();` 在 `:11531`）⇒ `runReaderStateScenarios` 区间改为 `:1601-11532`。其余行号引用不动（评审档已逐条复核一致） |
| MF9 | `N100-1` 判据 4 的 `reader-state-save` 计数会让判据恒红 | **处理** | 判据改为单文件口径「`grep -c "reader-state-save" pix/src/main/ipc-handlers.ts` = **1**（`:555`，与基线相同）」，并另记跨目录口径 `grep -rn "reader-state-save" pix/src \| wc -l` = **2**（`:555` + `preload.ts:176`）。实读复核：单文件 1、跨目录 2 |
| MF10 | §0.6 / §0.9 的「渲染输出等价」与 Vuetify 事实不符 | **处理**（按事实改写） | §0.6「唯一登记的结构变更」与 §0.9「允许的位移」④改为：「槽常驻 ⇒ **每一行**多一枚空的 `.v-list-item__append` 容器（DOM 非逐字等价）；`grid-template-columns: max-content 1fr auto` ⇒ 空容器零宽、视觉零位移；既有离屏场景从不打开会话菜单 ⇒ 既有 174 张截图 / 253 条测量零影响」。实读：`node_modules/vuetify/lib/components/VList/VListItem.js:223`（`hasAppend = !!(hasAppendMedia \|\| slots.append)`）⇒ `:300-303` 建容器；`VListItem.css:6` 的列宽；`grep -c "pill-session" pix/scripts/ui-shot.mjs` = 0 |

**次要项处置（评审档 N1–N7）**：N1（`.notes-notice` 判别力弱）、N2（§0.6 条件式不可编译）、N5（`继续讨论` 计数对实现形态敏感）、N6（`smoke-notes` #11 备份计数）、N7（乐观 `updatedAt` 取 `at`）**均按建议改正文**；N3（缺「真实删除路径」场景）**登记为等价覆盖**，不新增相位（保持 11 条 record / 12 张截图配额：删除路径与 `session-gone` 归结为同一谓词——列表内路径命中失败 ⇒ `currentDiscussion === null`，且现场记录都保留原样）；N4 见本文开头的编号说明。

**本轮自审发现的额外 2 处不自洽（一并改正文；不影响评审档结论）**：

1. **`listSessions` 的工作区口径**：`r18-4` 判据 ①/③ 的原始理由「记录会话属 A 的列表语境」在 stub 现状下不成立——stub 的 `listSessions` 无根过滤（`ui-shot.mjs:895`），原样改为「返回种入列表」会让 B 库拿到 A 的列表。改为**按根匹配返回**：`setSessions(list, root = LIBRARY_DIR)`，`listSessions(path)` 仅在路径比较键等于种子根时返回列表，否则 `[]`（未种入 ⇒ 恒 `[]`，既有场景行为等价）。与产品事实一致：`project-store.ts:90-107` 把 `project.path` 传给 `listSessions`，`:97` 的根变了就丢弃结果。
2. **文件级等待不能复用 `waitFor`**：`waitFor`（`ui-shot.mjs:1608`）在渲染层求值，无法轮询现场文件。新增 `waitState(file, predicate, label, timeoutMs = 20000)`（以 `readState` 轮询、节奏同 `waitFor` 的 120ms），用于 r18-1 / r18-2 / r18-4 的「等一次真实落盘」（消除 600ms 去抖与 IPC 往返的竞态）。

**判定工具（本档所有验收只能由这五种证据判定，逐条已标注）**

| 记号 | 含义 |
| --- | --- |
| 【走查】 | 只读代码与 `git status` / `git diff` / `git show`（只读可用）；含 `grep -c` / `grep -rn` 计数类判据 |
| 【check】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error（唯一工程门） |
| 【烟测-渲染】 | 纯函数离线烟测 `pix/scripts/smoke-view.mjs`（**本轮零改动**：9 组 74 条只作回归，理由见 §0.0 第 4 条） |
| 【烟测-主进程】 | 数据面烟测 `pix/scripts/smoke-notes.mjs`（本轮由 10 组 65 条 **扩到 10 组 71 条**：`reader-state-store` 组追加 #6–#11，见 N103-1） |
| 【离屏】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + 既有截图/测量零缺失 + 新增断言组全绿 + 新增截图齐备 |

## 本档事实基线（写档当天核对过的真实结果，供后续角色复核）

| 事实 | 证据 |
| --- | --- |
| 工作树干净、分支 `main`、HEAD = `1561cb4`（R17 已提交交付） | 实跑 `git status --short` ⇒ 空；`git log --oneline -1` ⇒ `1561cb4 feat(reader): 快捷键总览与选区模板动作；修复选中文本在真实键入路径丢失（V0.6 R17）` |
| 唯一工程门当前 0 error | 2026-09-17 实跑 `cd pix && npm run check` ⇒ `CHECK_EXIT=0`（`vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit`） |
| R17 零缺失比对基线（本轮的参照） | 目录 `C:/Users/86157/AppData/Local/Temp/pix-v06-r17c-review/shots`：`MANIFEST.json` ⇒ `shots.length = 174`、`failure = null`；`MEASUREMENTS.json` ⇒ 长度 **253**、`label` 去重 **69** 种（含 `r17-shortcut-overview:3` / `r17-shortcut-geometry:2` / `r17-template-actions:3` / `r17-template-geometry:3` / `r17-selection-snapshot:5` 与 R16 五组 14 条）；目录内 png 数与清单一致（174）。复读命令：`node -e` 读两个 json 后打印长度 / label 去重 / png 计数 |
| 既有烟测面（本轮基线） | `smoke-view.mjs` 9 组 74 条（R17 档件登记）；`smoke-notes.mjs` 10 组 65 条（`grep -c "  check(" pix/scripts/smoke-notes.mjs` 实读 = **65**；组：`runUndoRoundtrip` `:178` / `runUndoFailures` `:261` / `runUndoSlotLifecycle` `:415` / `runExportAndEmpty` `:564` / `runReportRender` `:616` / `runReportFiles` `:741` / `runReportFailures` `:847` / `runNotesStat` `:978` / `runLibraryRootContainment` `:1111` / `runReaderStateStore` `:1226`） |
| 主进程 reader-state 现状（`pix/src/main/reader-state-store.ts`，293 行） | 头部注释冻结四件事：主进程唯一写者 / 读-改-写全同步 fs（同一函数体内不得出现 await）/ 写入协议 `mkdir → <target>.tmp → renameSync` / 读侧只回报 `missing` / `corrupt` / `version-unsupported` / `read-failed` 且任何分支不改写文件；`SCHEMA_VERSION = 1` `:28`、`MIN_SCALE` / `MAX_SCALE` `:30-31`、`DEGRADE_MESSAGES` `:42`、`warn` `:57`、`stateFilePath` `:62`、`emptyState` `:68`、`docPathKey`（小写 + 正斜杠 + 去尾斜杠）`:78`、`isStoredDocPath` `:91`、**`parseDocState` `:115`**（条目级裁剪：`page`/`scale` 非法丢整条；`updatedAt` 非关键字段读出为 0；**返回对象只含 `{page, scale, updatedAt}` 三个字段**）、`resolveLastDoc` `:127`（lastDocPath 交叉过滤：越界 / 解析后不存在 / documents 无条目 ⇒ 按无记录）、`parseReaderState` `:142`、`readStateFile` `:165`（先剥 BOM）、`writeFileAtomic` `:185`、`serializeState` `:204`（`JSON.stringify(file, null, 2) + "\n"`）、`uniqueBackupPath` `:216`、`loadReaderState` `:229`、**`saveReaderState` `:251`**（`toRelativeDocPath` 越界 → `outside`；`read-failed` / `version-unsupported` 拒写；`corrupt` copy-first 备份后重建；`lastDocPath: docPath`；目标条目重建为 `{page, scale, updatedAt: Date.now()}`） |
| 共享类型现状（`pix/src/shared/types.ts`） | `ReaderDocState` `:472`（`page` / `scale` / `updatedAt`）、`ReaderStateFile` `:479`（`version: 1` / `lastDocPath` / `documents`）、`ReaderStateErrorCode` `:486`、`ReaderStateDegradeReason` `:489`、`ReaderStateSaveDraft` `:492`（`docFilePath` 绝对路径 / `page` / `scale`）、`ReaderStateLoadResult` `:499`、`ReaderStateSaveResult` `:510` |
| IPC 面现状（零改动目标） | `pix/src/main/ipc-handlers.ts`：`isReaderStateDraft` `:301-313`（只校验 `docFilePath` 非空串 + `page` / `scale` 为有限数；**额外字段原样透传**）、`reader-state-load` `:553`、`reader-state-save` `:555-557`；`pix/src/main/preload.ts` `readerStateLoad` `:83` / `readerStateSave` `:84` / 实现 `:174-176`；`notes-stat` `:548`（R14 冻结面，本轮零改动） |
| 渲染层现场 store 现状（`pix/src/renderer/stores/reader-state-store.ts`，272 行） | `DEBOUNCE_MS = 600` `:25`、`documents`（键 = 比较键）`:53`、`lastDoc` `:55`、`ready` `:57`、`degraded` `:58`、`loadSeq` / `saveEpoch` / 去抖句柄 / `snapshot` `:65` / `committed` `:66` / `settledKey` `:67`、`toSnapshot` `:73`、`relativeDocPath` `:80`、`resolveLastDoc` `:87`、`applyState` `:96`、`applyLocal` `:102`（乐观更新 `{page, scale, updatedAt: Date.now()}` + `lastDoc`）、`submit` `:110`（`epoch` 竞态守卫 + 失败一行 warn）、`submitIfChanged` `:131`（**去重基线 = 已提交 payload，比较字段 = key + page + scale**）、`capture` `:143`（`ready` + `page ≥ 1` + `scale ∈ [0.5, 3]` 三闸）、`loadReaderState` `:158`、`progressPageFor` `:191`、`requestRestoreFor` `:202`、`noteLanding` `:215`、`noteChange` `:223`、`flush` `:234`、`resetState` `:243`、返回对象 `:259` |
| 续读入口现状（`pix/src/renderer/components/workspace/ReaderPanel.vue`） | `resumeEntry` computed `:65`（`ready` + `lastDoc` 双闸；`path` / `name` / `page`）、`openResumeEntry` `:150-152`（`emit("open-document", …)`）、`defineEmits` `:35-37`（当前只有 `open-document`）、`.reader-resume` 模板 `:217`、样式 `:383` / `:400`、`.reader-empty` 空态 `:213`（**`v-if="!filePath"` 分支**）、`.map-toggle` Teleport `:193-205`（`mapToggleReady` `:43` / `:160`）、`onBeforeUnmount` `:170` |
| 工作区页现状（`pix/src/renderer/pages/WorkspacePage.vue`） | `currentSessionPath = computed(() => projectStore.currentSession?.path)` `:49`、`onSwitchSession(session)` `:170-177`（`clearSession` → `rpc.switchSession(session.path)` → `setCurrentSession` → `syncWorkspaceState({loadMessagesIfEmpty:true})`）、`openDocumentFromLibrary` `:198-203`、`ReaderPanel` 挂点 `:332-336`（`@open-document`）、`ChatPanel` 挂点 `:346`（`@switch-session="onSwitchSession"`）、**`.reader-under-pill :deep(.reader-header) { display: none; }` `:464-467`**（工作区里阅读区标题栏被隐藏 ⇒ 入口不得放 `reader-header`）、`.reader-under-pill :deep(.reader-empty)` `:468-471` |
| 会话面现状（`pix/src/renderer/components/workspace/ChatPanel.vue`，1797 行） | `send()` `:384-…`：`readFilePath = readerStore.filePath` `:392`、`readContext` `:397-404`、锚点 `:405-407`、`appendOptimisticUserMessage` `:413`、`await rpc.sendSteer(...)` `:427` / `await rpc.sendPrompt(...)` `:430`（**两者都走 `sendCommandOrThrow`：`{success:false}` 会抛错**）、catch 分支 `:431-443`（`failOptimisticUserMessage` + 草稿/附件还原 + 认证引导）；`isActiveSession` `:864-866`（`!!props.currentSessionPath && session.path === props.currentSessionPath`）、`onSelectSession` `:872-875`（活动会话 ⇒ return）、会话菜单模板 `:928-980`（`.pill-session` `:930`、`新对话` / `重命名当前对话` / 历史对话 subheader `:949`、`v-for` 列表项 `:951-975`、`#append` 模板级守卫 `v-if="!isActiveSession(session) && !isStreaming"` `:960`、`.session-delete-btn` `:963` 两击确认 `:965-967`、`暂无历史对话` `:976`）、`.pill-session` 样式 `:1256` / `:1293`、`.session-delete-btn` 样式 `:1334` / `:1347-1348` |
| 会话数据面现状 | `pix/src/renderer/stores/project-store.ts`：`sessions` `:25`、`listSessions()` `:90-107`（`api().listSessions(project.path)`，工作区隔离）、`setCurrentSession` `:108`、`syncCurrentSession(sessionFile, sessionId)` `:112-121`（按路径或 id 匹配列表）；`SessionInfo`（`pix/src/shared/types.ts:288-297`）含 `path` / `id` / `name?` / `modified` / `firstMessage`；`pix/src/renderer/utils/session-title.ts`：`deriveSessionTitle`（`name` 优先 → 首条消息摘要 → `新会话`，截断 28 字符 + `…`）/ `formatSessionTime`（`刚刚` / `N 分钟` / `N 小时` / `昨天` / `N 天` / `月 日`） |
| 离屏脚本现状（`pix/scripts/ui-shot.mjs`，11689 行） | `SEL` `:47-128`（**72** 项，实读计数；R16 追加 4、R17 追加 6、N97-4 追加 2）；`CONFIG.root` / `library-b` `:38-40`；`SESSION_STATE` `:637-651`（`sessionFile = <root>/.pix-read/session-demo.jsonl` `:645`、`sessionId = "sess-demo"` `:646`、`sessionName = "摘录与笔记走查"` `:647`）；`handleCommand` `:666-689`（prompt/steer 记录 `sendCalls` + 失败注入 `:677-688`；**`switch_session` 与 `new_session` 同支只返回 `{cancelled:false}`、不记录、不改 `SESSION_STATE`** `:685-687`）；stub 的 reader-state 镜像：`parseDocState` `:746-751`（与主进程同形，只产 `{page, scale, updatedAt}`）、`normalizeState` `:754-772`、`readStateFile` `:775`、`writeStateFile` `:797`、`readerStateLoad` `:1134-1146`、`readerStateSave` `:1147-1168`、`__pixStub` 控制口 `:1185-1259`（`setReaderState` `:1243`、`readerStateSaveCalls` `:1257`、`readerStateFilePath` `:1258`、`listSessionsCalls` `:1239`）；`listSessions: async function () { listSessionsCalls += 1; return []; }` `:895`（**恒空列表**）；场景函数 `runReaderStateScenarios` `:1601-11532`；场景内既有 helper：`STATE_FILE_A` `:1605` / `STATE_FILE_B` `:1606`、`readState` `:1631` / `writeState` `:1632` / `removeState` `:1633`、`entry(page, scale)` `:1640`、`saveCalls` `:1641`、`warnCount` `:1643`、`waitResumeEntry` `:1686`、`openRow` `:1721`、`clickNext` / `clickPrev` `:1730` / `:1731`、`setDraft` `:2544`、`typeAndSend` `:2556`、`sendCalls` `:3268`、`clearSendCalls` `:3269`、`lastSend` `:3274`、`lastErrorText` `:3276`、`waitSendCalls` `:3281`、`enterCleanWorkspace` `:3407-3415`、`restoreStandardSeed` `:3426-3430`、`rectOfSelector` `:2579`、`backToLibraryTab` `:4521`、`waitNotesTab` `:4525`、`capturePage` `:1278`、`repaint` `:1273`、`typeIntoComposer` `:10405-10420`；场景收口 `restoreStandardSeed()` + 函数 `}` 在 `:11531-11532` |
| 命名预检（本轮全部为**新增**名字，`pix/src` 内当前 0 命中；复读命令 `grep -rn "<名字>" pix/src \| wc -l`） | `reader-discuss` / `session-doc-mark` / `lastSessionPath` / `noteDiscussion` / `currentDiscussion` / `MAX_SESSION_PATH_LENGTH` / 文案 `继续讨论` / 文案 `最近讨论：` / `open-session` / `mdi-forum-outline` / `mdi-file-link-outline` 各 **0** 命中。既有冻结字面当前计数（改写即为回归）：`grep -rn "reader-resume" pix/src \| wc -l` = **3**（模板 1 + 样式 2）、`grep -rn "pill-session" pix/src \| wc -l` = **3**（模板 1 + 样式 2）、`grep -rn "session-delete-btn" pix/src \| wc -l` = **4**、`grep -rn "历史对话" pix/src \| wc -l` = **2** |
| 图标存在性（逐字冻结前的实读） | `pix/node_modules/@mdi/font/css/materialdesignicons.css` 内 `mdi-forum-outline` / `mdi-file-link-outline` 均存在（`grep -o` 实读各 1 处） |

---

## 0. 定稿登记与冻结契约（设计档、开发档、评审档均不得改写）

### 0.0 本档四项定稿判断（登记；评审可复核，负责人可裁决改判）

1. **N100 的写入时机 = 发送消息时（唯一选择）。** 具体口径：**`sendPrompt` / `sendSteer` 被内核接受之后**，用**发送瞬间的文档快照**（`readFilePath` / `readPage` / `readScale`）与**发送瞬间的会话文件路径**（`rpc.sessionState.value?.sessionFile`）记录（§0.4）。理由（逐条可判定）：① 「讨论」由发送定义 —— 打开文档 / 翻页 / 滚动 / 切换会话都可能是「路过」，把它们计入会让入口指向从未讨论过这篇论文的会话（可证伪的坏行为：切到会话 B 后翻两页，入口就变成 B）；② 与 R8 的 `<reading_context>` / 阅读锚点**同一快照**，不需要第二套状态机（发送瞬间的文档与会话各只读一次）；③ **成功才写** —— `sendPrompt` / `sendSteer` 都走 `sendCommandOrThrow`（`{success:false}` 抛错），失败进既有 catch，记录不会指向一次没发生的讨论；④ **立即写（不经 `DEBOUNCE_MS`）** 且**不占用 page/scale 去重基线** —— 发送是离散事件，翻页/滚动的去抖与去重语义逐字不变（§0.4 第 3 条）。备选「会话切换时」与「打开文档时」**不采用**（理由：切换不等于讨论；打开是最频繁的观察，会让「最近讨论」退化为「最近打开时的会话」，且每次打开都写盘）。
2. **N101 的入口落点 = `.center-pill`（阅读区顶部 chrome），不落空态区、不落 `reader-header`。** 登记为对 PM 括号内两个候选落点的**事实性偏离**（结论来自实读，可复核）：① `reader-header` 在工作区内被隐藏（`WorkspacePage.vue:464-467` 的 `.reader-under-pill :deep(.reader-header) { display: none; }`）⇒ 该候选在真实工作区不可见（R17 需求档已登记同一事实）；② `.reader-resume` 所在的空态区只在 `!filePath` 时渲染（`ReaderPanel.vue:213`）⇒ 文档一旦打开，该区域整体不存在，无法承载「打开该文档时提供一步入口」（PRD §7 判据 3 与 R18 主线写死的用户可见行为）；③ `.center-pill` 是 R17 已建立的阅读区入口范式（`ShortcutOverview.vue:86-98` 的 `Teleport to=".center-pill"`，与 `.map-toggle` `ReaderPanel.vue:193-205` 同款），打开文档后仍可见、不遮挡正文、不新增常驻占位（无记录即不渲染）。**`.reader-resume` 的文案与结构保持零改动**（只在 `ReaderPanel.vue` 内**新增**一枚独立元素）。
3. **会话不存在 ⇒ 静默隐藏（写死其一）。** 记录会话不在当前工作区的会话列表（文件被删 / 被移走 / 不可读 / 属于别的工作区）⇒ 入口不渲染、会话列表不加标记，**不弹提示、不写日志、不重试**；现场文件里的记录**保留原样**（读侧不改写文件）。理由：与既有的 `.reader-resume` 静默降级同口径（R6：`resolveLastDoc` 对不存在 / 不可读的文档按无记录处理，入口不出现），且「不可读」在渲染层没有可靠的判据面（只有列表一个事实源）。
4. **本轮不新建渲染层纯函数、`smoke-view.mjs` 零改动。** 「入口 / 标记」的解析（现场记录 → 会话）落在**渲染层 reader-state store 的唯一 computed**（`currentDiscussion`，§0.7），两个消费者的取数都经它；数据面规则（字段读写 / 旧文件兼容 / 降级 / 越界）由 `smoke-notes.mjs` 的 `reader-state-store` 组覆盖（主进程真实模块），交互面由离屏 `r18-*` 覆盖。不在 `renderer/utils/` 新建文件：该派生依赖 `SessionInfo`（`renderer/types/session.ts` → `@/types/session` 别名）与 `deriveSessionTitle`，进 `smoke-view.mjs` 编译面需连带处理别名与产物白名单（R16 已登记过此类编译面变更的代价），而收益仅是几条等价规则的重复断言。

### 0.1 本轮不得改写的既有冻结项

| 来源 | 冻结内容 | 本轮为什么不得动 |
| --- | --- | --- |
| R6 | **`.pix-read/reader-state.json` 的文件格式与既有字段语义**：`version: 1`、`lastDocPath`（原大小写相对路径 + 交叉过滤）、`documents` 键域（小写 + 正斜杠 + 去尾斜杠的比较键）、条目字段 `page`（1-based 整数）/ `scale`（`[0.5, 3]` 有限数）/ `updatedAt`（非关键字段，读出为 0）；条目级裁剪语义（`page`/`scale` 非法丢整条、其余条目照常生效） | 本轮的现场扩展必须**只增不改**：既有字段的校验、裁剪、比较键与序列化语义逐字不动 |
| R6 | **四条降级语义**：`missing`（首启，`degraded:false`，不记 warn）/ `corrupt`（`degraded:true` + 恰 1 行 warn；save 侧 copy-first 备份后重建）/ `version-unsupported`（load 降级；save 拒写且原文件字节不变）/ `read-failed`（load 降级；save 拒写）；`no-root` 静默；`outside` / `invalid-input` 拒绝语义 | PRD §3 明文：损坏/缺失/版本不符仍**必须静默降级**；本轮新增字段不得在任何分支引入新 warn、新错误码或新 UI |
| R6 | **写入协议与唯一写者**：`mkdir → 写 <target>.tmp → renameSync`、失败清理 tmp、原文件不动、同一函数体内不得出现 await（两次 IPC 交错不丢写）、主进程是唯一写者 | 本轮新增字段走同一条读-改-写；渲染层不得直接拼存储路径、不得新增第二条写入口 |
| R6 | **`.reader-resume` 的文案与结构**：`继续阅读：{name} · 第 {N} 页`（`ReaderPanel.vue:217`）、`v-if="resumeEntry"` 单分支、样式 `:383` / `:400`、`resumeEntry` 的 `ready` + `lastDoc` 双闸 | 本轮入口是**新增元素**，不得挤占、改名或复用该按钮的结构与语义（`grep -rn "reader-resume" pix/src \| wc -l` 保持 **3**） |
| R10 | **会话菜单既有类名与文案**：`.pill-session`、`session-menu-divider`、`.session-delete-btn`（含两击确认的 `title` 逐字 `再次点击确认删除` / `删除该对话`）、`新对话` / `重命名当前对话` / `历史对话` / `暂无历史对话`、`isActiveSession` 的活动判定与「活动会话不渲染删除按钮」 | 本轮只做**加法**：新增标记元素 +（唯一登记变更）`#append` 槽守卫位置（§0.6 第 3 条）；既有类名、文案、删除语义、活动判定逐字不动 |
| R8 | **发送链路**：`readFilePath` / `readPage` 各只读一次的快照；`appendOptimisticUserMessage` 的乐观块与 `failOptimisticUserMessage` 的回滚语义；`<reading_context>` 载荷与「排除 chip 只影响注入」的语义；`sendSteer`（流式中）与 `sendPrompt` 的分支 | N100 只**在发送成功之后补一次记录调用**，不改载荷、不改草稿/附件处理、不改错误分支。**唯一登记的例外（MF4）**：`send()` 内流式分支的 `if (isStreaming.value) { await rpc.sendSteer(...); return; }` 改为 `if/else`（两支各一次 `await`，语句与实参逐字不变），唯一目的是让 `noteDiscussion` 成为 try 尾部的**单一调用点**；该分支之后 try 内无其它语句、`finally`（`ChatPanel.vue:443-446`）语义不变 ⇒ 控制流等价（判据：`git diff -U0` 中 `send()` 内既有语句除 `return;` → `} else {` 这一处外零改写） |
| R14 | **`notes-stat` 的 stat 语义与刷新链路**：`ipcMain.handle("notes-stat", …)`（`ipc-handlers.ts:548`）的 `size` / `mtimeMs` / `hash` 口径、`.notes-stale` / `.stale-refresh` 与「刷新只读」 | 本轮与笔记数据面零交集；`notes.json`、`notes-stat`、笔记面板与报告链路零 diff |
| R14 / R16 / R17 | **取证脚本契约**：`ui-shot.mjs` 启动守卫、产物自净（只删 `<OUT_ROOT>/shots`）、结束自检（清单与磁盘双向相等 + 白名单外条目即失败）、`SEL` 与既有场景 / 截图 / label **零删除零改写**（**唯一登记例外 = §0.10 登记 1**：`map-chapter-filter` 相位 `injection` 的 2 行既有断言更新，负责人已追认）、`record` 的「先落测量再抛错」语义、`smoke-notes.mjs` 既有 65 条与 `smoke-view.mjs` 既有 74 条零改写 | 本轮只**追加**：`SEL` 2 项、stub 会话控制口与 reader-state 镜像扩展、r18 场景、烟测 6 条；既有 174 张 / 253 条 / 69 种 label 零缺失；`api` 面恒 42 方法（与 `PixApi` 逐字相等） |
| 全局 | 既有类名 `.reader-*` / `.pdf-*` / `.notes-*` / `.map-*` / `.pill-*` / `.session-*` 与既有中文文案；`--pix-*` 变量表（**不新增变量**）；`pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`、`pix/src/main/session-bridge.ts`、`pix/src/renderer/stores/session-store.ts`、`pix/package.json`（零 diff） | 取证断言与 IPC 面建立在既有字面与方法数上；本轮零新 IPC、零新依赖 |

### 0.2 本轮新增冻结项（设计档、开发档、评审档均不得改写）

| # | 项 | 冻结内容 |
| --- | --- | --- |
| 1 | 现场扩展字段（N100） | §0.3 全表：`ReaderDocState` / `ReaderStateSaveDraft` 新增**可选**字段 `lastSessionPath?: string` / `lastSessionAt?: number`（**要么成对出现、要么都不出现**）；值域谓词与长度上限 `MAX_SESSION_PATH_LENGTH = 2048` |
| 2 | 读写保留规则（N100） | §0.4 全表：读侧成对裁剪、写侧「有效对 ⇒ 覆盖；否则 ⇒ 保留既有对（含「本来就没有」）」、渲染层乐观更新同一保留规则、四条降级语义逐字不变 |
| 3 | 写入时机（N100-4） | §0.0 第 1 条 + §0.4：只有 `sendPrompt` / `sendSteer` **成功返回后**才记录；打开文档 / 翻页 / 缩放 / 切换会话 / 发送失败 / 发送被拒 ⇒ 不写 |
| 4 | 渲染层唯一派生（N100-5） | §0.7：`noteDiscussion(absPath, page, scale, sessionPath)`（动作）与 `currentDiscussion`（computed，`DiscussionLink`）——解析现场记录的**唯一实现点**；组件内不得出现 `lastSessionPath` 字面 |
| 5 | 「继续讨论」入口（N101） | §0.5 全表：类名 `.reader-discuss`、Teleport 进 `.center-pill`、文本逐字 `继续讨论：{title} · {time}`、`title` 逐字 `继续讨论：{title} · {time}；点击打开该会话`、图标 `mdi-forum-outline`、显示四闸、点击链路（emit `open-session` → 复用既有 `onSwitchSession`） |
| 6 | 会话列表标注（N102） | §0.6 全表：类名 `.session-doc-mark`、`mdi-file-link-outline`、tooltip 逐字 `最近讨论：{docName}`、条件 = 记录会话路径命中、`#append` 槽守卫位置调整（唯一登记的结构变更） |
| 7 | 反需求与配额 | §6 反需求全表；新增配额 = 离屏 **5 场景 / 5 组 label / 11 条 record / 12 张截图**、烟测-主进程 **+6 条（65 → 71）**、烟测-渲染 **零改动**（9 组 74 条回归）（§0.8） |

### 0.3 现场扩展字段（逐字冻结）

| 项 | 逐字值 |
| --- | --- |
| 文件形态 | `documents["<比较键>"] = { page, scale, updatedAt, lastSessionPath, lastSessionAt }`；新增两键**排在 `updatedAt` 之后**（序列化键序；由 `git diff` 的构造语句判定） |
| 类型（`pix/src/shared/types.ts`） | `ReaderDocState` 与 `ReaderStateSaveDraft` 各新增：`lastSessionPath?: string`（注释逐字：`R18 可选字段：最近一次讨论该文档的会话文件路径（原样存储，不解析、不校验存在性）`）与 `lastSessionAt?: number`（注释逐字：`R18 可选字段：该次讨论的发送时刻（epoch ms，> 0）`） |
| 语义 | `lastSessionPath` = 会话文件的**绝对路径原样**（可能是库外路径，本模块从不打开、不解析、不校验存在性）；`lastSessionAt` = **发送时刻**（epoch ms，写入方时钟，不做钳制） |
| 值域谓词（主进程，唯一实现点；名字逐字） | `isValidSessionPath(value)`：`typeof value === "string" && value.length > 0 && value.length <= MAX_SESSION_PATH_LENGTH && !value.includes("\u0000")`；`isValidSessionAt(value)`：`typeof value === "number" && Number.isFinite(value) && value > 0`；常量 `MAX_SESSION_PATH_LENGTH = 2048` |
| 形状不变量（**必须写死**） | 条目里的两键**要么都在、要么都不在**；任何一侧非法 ⇒ 视为「没有对」（丢弃两键、不产生半截字段）；条目本身凭 `page`/`scale` 继续生效 |
| 旧文件（无两键） | 读取**零报错、零 warn、零降级**；条目照常生效；写侧**不得凭空造字段**（未携带 ⇒ 保留「本来就没有」） |
| 越界 / 非法 | 空串 / 非字符串 / 超长（`> 2048`）/ 含 `\u0000` / 只给一侧 / `lastSessionAt` 为 `0` / 负数 / `NaN` / 字符串 ⇒ **静默丢弃该对**（不抛错、不写日志、不改其它条目） |
| 不得触碰 | `page` / `scale` / `updatedAt` / `lastDocPath` / `documents` 键域 / `version` / 序列化缩进（`JSON.stringify(file, null, 2) + "\n"`）/ 原子写协议 / 四条降级原因 —— 全部逐字不变 |
| 其它条目 | 保存目标条目时，**其它条目（含它们的两键）一字不动** —— 注意：`parseDocState` 必须把合法对带回来，否则读-改-写会在每次保存时丢掉其它文档的记录（这是本轮最危险的回归点，见 §8 R1） |

### 0.4 读侧 / 写侧 / 渲染层三处规则（逐字冻结）

| 处 | 规则 |
| --- | --- |
| 读侧（`parseDocState`） | 先按既有语义校验 `page`（整数 ≥ 1）/ `scale`（有限、`[0.5, 3]`）/ `updatedAt`（非关键，读出为 0）；再判定对：`isValidSessionPath(value.lastSessionPath) && isValidSessionAt(value.lastSessionAt)` ⇒ 返回对象追加 `{ lastSessionPath, lastSessionAt }`，否则**不追加任何键**。读侧不产生 warn、不改写文件 |
| 写侧（`saveReaderState`） | 目标条目的对 = `isValidSessionPath(draft.lastSessionPath) && isValidSessionAt(draft.lastSessionAt)` ⇒ **覆盖**为草稿值；否则 ⇒ **保留**目标条目既有对（含「本来就没有」）。其它条目走 `current.documents` 原样带过。既有语句（`lastDocPath: docPath`、`{...current.documents, [key]: entry}` 的键序、`Date.now()` 的 `updatedAt`）零改写；函数体内不新增 await |
| 渲染层乐观更新（`applyLocal`） | 与写侧同一条规则：提交的快照**携带有效对 ⇒ 覆盖**（本地 `documents.value[key]` 与主进程一致）；**未携带 ⇒ 保留**本地既有对（否则翻页乐观更新会把入口/标记短暂抹掉） |
| 渲染层去重基线 | `submitIfChanged` 的既有比较字段（`key` + `page` + `scale`）**逐字不变**；会话记录走**独立提交路径**（§0.7），不进 `snapshot` / `committed` 机制（同一页同一缩放下的第二次发送必须照写） |
| 触发时机（唯一） | `ChatPanel.send()` 内：与 `readFilePath` / `readPage` 同一同步段新增 `readScale = readerStore.scale` 与 `sendingSessionPath = rpc.sessionState.value?.sessionFile ?? null`；把流式分支的 `if (isStreaming.value) { await rpc.sendSteer(...); return; }` 改为 `if/else`（见 §0.1 的 R8 行登记），**成功返回后**在 try 尾部的唯一调用点执行 `readerStateStore.noteDiscussion(readFilePath, readPage, readScale, sendingSessionPath)`；catch 分支**不得**调用；不改任何发送载荷与回滚语义 |
| 守卫（`noteDiscussion` 内） | ① `!ready` ⇒ return；② `!sessionPath`（内核未给出会话文件）⇒ return；③ `page` 非整数或 < 1 ⇒ return；④ `scale` 越界 ⇒ return；⑤ `currentDocKey(absPath, rootDir()) === null`（库外 / 未选库）⇒ return；以上全部为**静默**（不弹提示、不记面板状态；失败只允许既有的一行 `[reader-state]` warn） |
| 已知取舍（登记） | 讨论写盘会把 `lastDocPath` 指向该文档（`saveReaderState` 的既有语义）；若用户在发送在途切换了文档，重开文档后的续读入口短暂指向被讨论的那一篇，随后由新文档的落点写盘自愈（`noteLanding` → 600ms 去抖） |

### 0.5 「继续讨论」入口（逐字冻结，N101）

| 项 | 逐字值 |
| --- | --- |
| 落点 | `ReaderPanel.vue` 模板新增 `<Teleport v-if="mapToggleReady && discussEntry" to=".center-pill">`（与既有 `.map-toggle` `:193-205` 同款就绪判定：容器存在才挂载）；元素 = `<button type="button" class="reader-discuss" :title="…" @click="openDiscussion">` |
| 类名 | `.reader-discuss` |
| 内容 | `<v-icon size="14">mdi-forum-outline</v-icon>` + `<span class="reader-discuss-text">继续讨论：{{ discussEntry.title }} · {{ discussEntry.time }}</span>` |
| 文本（逐字模板） | `继续讨论：{title} · {time}`（例：`继续讨论：摘录与笔记走查 · 刚刚`；`{title}` = `deriveSessionTitle(session)`，`{time}` = `formatSessionTime(lastSessionAt)`） |
| `title`（tooltip，逐字模板） | `继续讨论：{title} · {time}；点击打开该会话` |
| 样式（冻结；不新增 `--pix-*` 变量） | `display: inline-flex; align-items: center; gap: 4px; max-width: 240px; padding: 1px 8px; border: 1px solid var(--pix-border-light, #e3eaf0); border-radius: 999px; background: var(--pix-bg-elevated, #ffffff); color: var(--pix-text-secondary); font-family: var(--pix-font-ui); font-size: 11px; line-height: 1.4; white-space: nowrap; cursor: pointer;` + `.reader-discuss-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }` + `.reader-discuss:hover { background: var(--pix-bg-hover, #eef2f6); color: var(--pix-text-primary); }`；**无动画 / 无过渡 / 无阴影新增**（复用既有变量） |
| 显示条件（四闸，全过才渲染） | ① `readerStateStore.ready`；② `readerStateStore.currentDiscussion !== null`（= 当前打开文档有记录**且**记录会话存在于 `projectStore.sessions` 中，§0.7）；③ 记录会话路径 ≠ 当前活动会话路径（比较键比较，活动会话取 `projectStore.currentSession?.path`，与 `ChatPanel.isActiveSession` 同源）；④ 组件已挂载且 `.center-pill` 就绪（`mapToggleReady`） |
| 不渲染（零占位，逐条写死） | 未打开文档 / 打开的是库外文件 / 该文档无记录 / 记录会话不在当前工作区列表 / 记录会话即当前活动会话 / 状态未就绪 ⇒ **元素不在 DOM**（无空胶囊、无禁用态、无占位文案、不弹提示、不写日志） |
| 点击语义 | `openDiscussion()` ⇒ `emit("open-session", discussEntry.path)`（新增 emit，载荷 = 会话文件绝对路径字符串）；**不切文档、不改页码 / 缩放、不清选择、不写盘、不发任何新 IPC** |
| 打开链路（复用既有通道） | `WorkspacePage.vue` 新增处理器 `onOpenDiscussionSession(sessionPath: string)`：按 `docPathKey` 在 `projectStore.sessions` 里解析 → 不存在 ⇒ return（no-op）→ 已是当前会话 ⇒ return（no-op）→ 否则 `void onSwitchSession(session)`（**逐字复用既有函数**：`sessionStore.clearSession()` + `rpc.switchSession(session.path)` 的既有 `switch_session` 内核命令 + `setCurrentSession` + `syncWorkspaceState({ loadMessagesIfEmpty: true })`）；模板新增 `@open-session="onOpenDiscussionSession"` |
| 禁止 | 不得直接读写 / 解析 / 重命名 / 删除内核会话文件（`.jsonl`）；不得新增第二条会话切换实现；不得自动打开会话（只响应用户点击） |

### 0.6 会话列表标注（逐字冻结，N102）

| 项 | 逐字值 |
| --- | --- |
| 落点 | `ChatPanel.vue` 会话菜单列表项的 `#append` 槽（`:960-975`），**排在 `.session-delete-btn` 之前** |
| 元素 | `<span v-if="isDocRelatedSession(session)" class="session-doc-mark" :title="docRelatedTitle"><v-icon size="14">mdi-file-link-outline</v-icon></span>` |
| 类名 / 图标 | `.session-doc-mark` / `mdi-file-link-outline` |
| tooltip（逐字模板） | `最近讨论：{docName}`（`{docName}` = 当前文档显示名，例：`最近讨论：sample-paper.pdf`） |
| 条件 | `docRelatedPath !== null && docPathKey(session.path) === docRelatedPath`（当前文档有记录、记录会话在列表内、且该行就是它）；**与活动会话无关**（活动行同样显示标记）。`docRelatedPath` 是 ChatPanel 的 computed：`readerStateStore.currentDiscussion === null ? null : docPathKey(currentDiscussion.sessionPath)`（`string \| null`）——**不得直接把可空值传给 `docPathKey`**（其签名为 `path: string`，`utils/notes-path.ts:18-20`；写成 `docPathKey(readerStateStore.currentDiscussion?.sessionPath)` 不可编译，[check] 必红。次要项 N2） |
| 样式（冻结） | `.session-doc-mark { display: inline-flex; align-items: center; margin-right: 6px; color: var(--pix-text-muted); }`（不新增变量、不加动画） |
| 取值纪律 | `docRelatedPath` / `docRelatedTitle` 两个 computed **只读** `readerStateStore.currentDiscussion`（唯一派生点，§0.7）；不得在组件内读 `documents` 或 `lastSessionPath` |
| 唯一登记的结构变更 | `#append` 槽从「模板级 `v-if="!isActiveSession(session) && !isStreaming"`」改为「**槽常驻**，`.session-delete-btn` 自身带同一条 `v-if`」——既有类名 / 文案 / 两击确认 / 出现条件逐字不变，仅为让活动会话行也能出现标记。**DOM 事实（不得写成「渲染输出等价」）**：槽常驻后 Vuetify 会给**每一行**渲染一枚空的 `div.v-list-item__append`（`pix/node_modules/vuetify/lib/components/VList/VListItem.js:223` 的 `hasAppend = !!(hasAppendMedia \|\| slots.append)` ⇒ `:300-303` 建容器）；列宽 `grid-template-columns: max-content 1fr auto`（`VListItem.css:6`）⇒ 空容器零宽、视觉零位移；既有离屏场景从不打开会话菜单（`grep -c "pill-session" pix/scripts/ui-shot.mjs` = 0）⇒ 既有 174 张截图 / 253 条测量零影响。评审档与开发档必须原样登记此条，不得扩大；dev 档另需逐项登记该 DOM 差异 |
| 成本（登记） | 1 个 computed（路径）+ 1 个 computed（tooltip）+ 1 个谓词函数 + 1 枚 `<span>` + 1 条样式 + 上述守卫位置调整；**无新 IPC、无新数据面、无新 store** |
| 价值（登记） | 直接落地 PRD §7 判据 3 的「会话列表能看出与哪篇文档相关」与 §2 R18 行的「会话列表标注关联文档」：在当前文档下打开历史对话，一眼看出哪条会话讨论过这篇论文，不必点开逐条验证 |

### 0.7 渲染层 reader-state store 契约（逐字冻结，唯一派生点）

```ts
/** R18：一篇文档的最近讨论入口的解析结果（无记录 / 会话不在列表 ⇒ null）。 */
export interface DiscussionLink {
  /** 会话文件绝对路径（原样来自现场记录）。 */
  sessionPath: string;
  /** 会话标题（deriveSessionTitle，与「历史对话」菜单同一规则）。 */
  title: string;
  /** 讨论时刻（现场记录的 lastSessionAt）。 */
  at: number;
  /** 当前文档显示名（docDisplayName(currentKey)）。 */
  docName: string;
}
```

| 项 | 冻结 |
| --- | --- |
| 动作 `noteDiscussion(absPath, page, scale, sessionPath)` | 五条守卫见 §0.4；通过后：`at = Date.now()`；**立即提交**（不经 `DEBOUNCE_MS`、不写 `snapshot` / `committed`）：payload = 既有三字段 + `lastSessionPath: sessionPath` + `lastSessionAt: at`；先做乐观更新（本地条目 `{ page, scale, updatedAt: at, lastSessionPath, lastSessionAt }`，保留规则见 §0.4），再 `await` 提交。**提交路径唯一（MF6）**：必须走 `submit()`（把其 payload 扩展为可选携带两键），**不得**新增第二条裸 `bridge().readerStateSave(...)`——`saveEpoch` 竞态守卫（`:111` / `:119` / `:126`）只此一份，缺它会在 `goHome` / `onUnmounted`（`WorkspacePage.vue:251-266` / `:134-146`）复位后把上一库的 `documents` / `lastDoc` 回灌；走查判据 = `grep -c "readerStateSave" pix/src/renderer/stores/reader-state-store.ts` = **1**。失败只允许既有的一行 `[reader-state] warn`（不回滚、不弹 UI）。**登记（次要项 N7）**：乐观更新的 `updatedAt` 取 `at`（发送时刻），与主进程写侧的 `Date.now()` 相差毫秒级，无判据影响 |
| computed `currentDiscussion` | `null` ⇔ ① `readerStore.filePath` 为 null 或 `currentDocKey` 为 null；② 该比较键无条目或无合法对；③ `projectStore.sessions` 里没有路径命中的会话。命中 ⇒ 返回 `{ sessionPath: 条目.lastSessionPath, title: deriveSessionTitle(session), at: 条目.lastSessionAt, docName: docDisplayName(currentKey) }`；**必须在 store 返回对象上暴露** |
| 依赖纪律 | 该 computed 是「现场记录 → 会话」解析的**唯一实现点**：`grep -rn "lastSessionPath" pix/src/renderer/components \| wc -l` = **0**；`grep -c "currentDiscussion" pix/src/renderer/stores/reader-state-store.ts` = **2**（声明 1 + 返回对象 1） |
| 零新增副作用 | 既有 `documents` / `lastDoc` / `ready` / `degraded` 的形状与语义零改动；`loadReaderState` / `progressPageFor` / `requestRestoreFor` / `noteLanding` / `noteChange` / `flush` / `resetState` 的既有分支零改写（`resetState` 已清 `documents`，无需新增复位项） |

### 0.8 冻结的类名 / 常量 / 名字清单与新增配额

| 选择器 / 名字 | 含义 |
| --- | --- |
| `lastSessionPath` / `lastSessionAt` | 现场记录新增的两键（§0.3；成对出现） |
| `MAX_SESSION_PATH_LENGTH = 2048` | 会话路径长度上限（`reader-state-store.ts` 主进程） |
| `isValidSessionPath` / `isValidSessionAt` | 值域谓词（主进程；渲染层不得复制第二份） |
| `noteDiscussion` / `currentDiscussion` / `DiscussionLink` | 渲染层 store 的动作 / computed / 类型（§0.7） |
| `.reader-discuss` / `.reader-discuss-text` | 入口与其文本容器（§0.5） |
| `openDiscussion` / `open-session` | 入口点击处理器 / ReaderPanel 新增 emit 名（§0.5） |
| `onOpenDiscussionSession` | WorkspacePage 的打开处理器（§0.5） |
| `.session-doc-mark` | 会话列表标注元素（§0.6） |
| `isDocRelatedSession` / `docRelatedPath` / `docRelatedTitle` | ChatPanel 的谓词与两个 computed（§0.6） |
| `mdi-forum-outline` / `mdi-file-link-outline` | 入口图标 / 标注图标（实读存在） |
| 文案（逐字） | `继续讨论：{title} · {time}` / `继续讨论：{title} · {time}；点击打开该会话` / `最近讨论：{docName}` |
| `ui-shot.mjs` 的 `SEL` 新增 **2** 项（**72 → 74**） | `readerDiscuss: ".reader-discuss"` / `sessionDocMark: ".session-doc-mark"`；既有 **72** 项逐字不动 |
| `ui-shot.mjs` 的 `__pixStub` 控制口新增 **2** 个 | `setSessions(list, root = LIBRARY_DIR)`（种入会话列表并按**工作区根**匹配返回；未种入 ⇒ 恒 `[]`）、`switchSessionCalls()`（`{ count, paths }`）；**`api` 面恒 42 方法（与 `PixApi` 逐字相等，零改动）**；另登记：`listSessions(path)` 由恒空改为「路径比较键等于种子根 ⇒ 返回种入列表；否则 `[]`」（未种入 ⇒ 既有行为等价）、`handleCommand` 的 `switch_session` 分支新增「记录调用 + 命中列表时镜像 `SESSION_STATE.sessionFile/sessionId/sessionName`」、stub 的 reader-state 镜像（`parseDocState` / `normalizeState` / `readerStateSave`）与 `readerStateCalls` 载荷同步支持两键 |
| 新场景名 / 组名 / 条数 | `r18-1`…`r18-5`；`r18-discuss-entry` **3** / `r18-old-format` **2** / `r18-session-missing` **2** / `r18-workspace-isolation` **2** / `r18-session-mark` **2** = **11 条** |
| r18 场景的会话前置（登记，MF2） | `r18-1` / `r18-4` / `r18-5` 三个场景的前置各含一次**显式会话行点击**（`r18-1` 与 `r18-5` 钉 `摘录与笔记走查`、`r18-4` 钉 `消融实验对照`）⇒ 活动会话由场景自身确定，**不依赖前序场景遗留的 `SESSION_STATE` 镜像**；产品侧 `ChatPanel.onSelectSession`（`ChatPanel.vue:872-875`）对已是活动会话的行 early-return ⇒ 该点击**幂等**（两种镜像态下结果相同） |
| 新截图（冻结，12 张） | `r18-1-send-records.png`、`r18-1b-discuss-entry.png`、`r18-1c-discuss-switched.png`、`r18-1d-send-failed.png`、`r18-2-old-format.png`、`r18-2b-open-switch.png`、`r18-3-session-gone.png`、`r18-3b-session-restored.png`、`r18-4-workspace-b.png`、`r18-4b-back-to-a.png`、`r18-5-session-mark.png`、`r18-5b-mark-absent.png` |
| 新烟测断言（冻结，6 条） | `smoke-notes.mjs` 的 `reader-state-store` 组 #6–#11（§N103-1）；`smoke-view.mjs` 零改动 |

### 0.9 回归基线、零缺失与允许的位移

| 项 | R18 冻结口径 |
| --- | --- |
| 零缺失参照基线 | `C:/Users/86157/AppData/Local/Temp/pix-v06-r17c-review/shots`：174 张 png（`MANIFEST.shots[].name`）、253 条测量、69 种 label（本档已逐项复读） |
| 动工前自建基线 | 在新目录 `PIX_SHOT_ROOT=<临时目录>/pix-v06-r18-base` 实跑一次（PRD §5.1）；本档不跑离屏，读数留给设计 / 开发步 |
| 零缺失判据 | 基线 `MANIFEST.shots[].name` 集合 ⊆ 验收运行集合；基线 `MEASUREMENTS.json` 的 label 集合 ⊆ 验收运行集合（69 种一条不少）；`MANIFEST.json.failure === null`、退出码 0；截图目录与清单双向相等、无白名单外条目 |
| 新增配额 | 截图 **12 张**（174 → 186）、record **11 条**（253 → 264）、新 label **5 种**（69 → 74）、烟测-主进程 **+6 条**（65 → 71） |
| 既有场景零位移（登记，判定依据） | 既有夹具**没有任何条目带 `lastSessionPath`**、stub 的 `listSessions` **未种入 ⇒ 恒返回空列表** ⇒ `currentDiscussion` 在既有场景恒为 `null` ⇒ `.reader-discuss` 与 `.session-doc-mark` 恒不渲染 ⇒ 既有 174 张截图的像素内容、253 条测量、69 种 label 预期**零差异** |
| 允许的位移与内容变更（**仅** r18 场景内） | ① `.center-pill` 内出现 `.reader-discuss`（`.shortcut-toggle` / `.map-toggle` 的相对位次可能顺移，登记为可接受）；② 会话菜单列表项出现 `.session-doc-mark`；③ r18 场景写入的现场文件含两键；④ 菜单行的 `#append` 槽守卫位置变化——**每一行**多一枚空的 `div.v-list-item__append` 容器（DOM 非逐字等价；列宽 `max-content 1fr auto` ⇒ 空容器零宽、视觉零位移；既有场景不打开会话菜单 ⇒ 零影响）。**不允许**：`.reader-resume` 的任何变化；`.center-pill .pill-label` 文本变化；既有会话菜单文案 / 类名 / 删除按钮变化；`.pill-*` 与 `.notes-*` / `.pdf-*` 的既有几何与文本变化；任何既有 measurement 的差异 |
| 内容目视比对 | 12 张新增截图必须在 dev 档逐张登记结论（入口是否挤压 `pill-label` / 与 `.map-toggle`、`.shortcut-toggle` 是否同行且不换行；标记行是否有换行或与删除按钮重叠；菜单打开态是否溢出） |
| 烟测回归 | `smoke-view.mjs`（9 组 74 条，零改动）与 `smoke-notes.mjs`（10 组 71 条）都必须可复跑且全绿（退出码 0）；连续两次运行结果相同 |

### 0.10 负责人裁决登记（R18 收口）：既有断言更新与相位步骤自确定化

> 依据：`docs/pm/R18-review.md`「代码审查（R18）」§3 的 2 条 mustFix（MF1 = `map-chapter-filter` 相位 `injection` 的既有断言改写；MF2 = `r18-3` 相位 `session-restored` 的点击目标偏离）。负责人裁决：**两条均追认**（MF2 追加自确定化加固）。本节按 R17 §0.9 的登记式先例，把两处偏离**逐字登记进冻结文档**（本节即登记面；评审与开发不得自行扩大）。

**登记 1（MF1，追认）：既有断言更新（唯一一处，逐字）**

| 项 | 内容 |
| --- | --- |
| 文件 | `pix/scripts/ui-shot.mjs` |
| label / 相位 | `map-chapter-filter` 相位 `injection`（第 52 相位组的发送子相位） |
| 旧值（逐字，2 行） | `      stateBytesSame: fileHash(STATE_FILE_A) === stateHash52i,`<br>`      ...(fileHash(STATE_FILE_A) === stateHash52i ? [] : ["发送不得改写 reader-state.json"]),` |
| 新值（逐字） | `      stateBytesChanged: fileHash(STATE_FILE_A) !== stateHash52i,`<br>`      stateSameExceptRecord: stateProjection(STATE_FILE_A) === stateBefore52i,`<br>`      stateBefore: stateBefore52i,`<br>`      stateAfter: stateProjection(STATE_FILE_A),`<br>断言行：`      ...(stateProjection(STATE_FILE_A) === stateBefore52i ? [] : ["过滤 / 选择 / 发送不得改写阅读现场（R18 讨论记录除外）"]),`（`stateProjection`（`ui-shot.mjs:1693-1703`）忽略讨论两键与 `updatedAt`，其余 `version` / `lastDocPath` / 条目集合 / `page` / `scale` 逐字比较） |
| 理由 | R18 起「发送成功」按 §0.3 / §0.4 的**冻结语义**必写现场的两键（会话锚点）与 `updatedAt` ⇒ 字节全等断言在该相位**结构上不可能为真**（实跑：该相位 `stateBytesChanged = true`、`stateSameExceptRecord = true`）。这是两份冻结字面之间的冲突，不是实现缺陷。 |
| 附带的等价最小更新（登记） | 取基线前新增一次 `await waitState(STATE_FILE_A, (state) => state.documents["sample-paper.pdf"], "52-inject 落点写盘")`：落点写盘有 600ms 去抖，不先等目标条目在场则基线是「文件尚不存在」⇒ 改写后恒红。 |
| 判别力说明 | ① 同一 label 的 `badge-click` 相位（`ui-shot.mjs:4799` / `:4813`）**字节级断言按原样未动**，继续兜住「纯 UI 路径零写盘」；② 改写后仍逐字覆盖 `version` / `lastDocPath` / 条目集合 / 各条目 `page` + `scale`（仅忽略讨论记录两键与 `updatedAt`）——即「过滤 / 选择 / 发送不得改写阅读现场」的原判据意图一字不减；③ 「写记录不得波及其它条目」由 `r18-1` 相位 `send-records` 判据 ③ 与烟测 #7 另证；④ 记录写入侧由本轮 `r18-*` 11 条 record 正向覆盖。 |

**登记 2（MF2，追认并加固）：`r18-3` 相位 `session-restored` 的步骤偏离与自确定化**

| 项 | 内容 |
| --- | --- |
| 文件 | `pix/scripts/ui-shot.mjs` |
| label / 相位 | `r18-session-missing` 相位 `session-restored` |
| 旧值（冻结字面，设计档 §1.5.5） | `openSessionMenu()` + `clickSessionItem("消融实验对照")` + `closeSessionMenu()`（**单一**会话点击，点冻结字面行让既有切换触发 `listSessions` 刷新） |
| 交付时的偏离（被追认前） | 改为 `clickSessionItem("摘录与笔记走查")`（硬编码「当时非活动的那一行」） |
| 新值（本次收口，逐字） | ① **自确定前置**：`setSessions(SESSIONS_GHOST)` 后读 `countOf(SEL.readerDiscuss)`（= 切换前入口计数）→ `openSessionMenu()` + `sessionMenuProbe()` 读菜单行 → 取活动行标题 `activeTitlePre18c2`；若 `activeTitlePre18c2 !== "摘录与笔记走查"` ⇒ `clickSessionItem("摘录与笔记走查")` + `waitPillSession("摘录与笔记走查")` + 重开菜单（把活动会话**钉为**「摘录与笔记走查」，不依赖前序场景遗留的 `SESSION_STATE` 镜像）；② **冻结字面恢复为决定性点击**：`clickSessionItem("消融实验对照")`（此刻它必然是非活动行 ⇒ 真实 `switch_session`）；③ 新增断言（见下）。 |
| 事件序列证据（为什么冻结字面会恒红） | ① `restoreStandardSeed()`（`ui-shot.mjs:3513-3517`）**不复位** `SESSION_STATE`；② 全仓唯一改 `SESSION_STATE.sessionFile` 的实现 = stub 的 `switch_session` 镜像分支（`ui-shot.mjs:692-705`）；③ `r18-2` 末次点击把活动会话钉为「消融实验对照」⇒ 进入本相位后该行**就是活动行** ⇒ 产品 `ChatPanel.onSelectSession`（`ChatPanel.vue:895-898`）对活动行 early-return ⇒ 冻结字面（单次点击活动行）**不触发** `switch_session`、也就没有 `syncWorkspaceState → listSessions` 刷新 ⇒ `projectStore.sessions` 不含 `session-gone.jsonl` ⇒ 判据 ⑥ 的 `waitDiscussText("继续讨论：丢失后恢复的会话 · 昨天")` 必超时。 |
| 自确定化结论（是否恢复冻结字面） | **已恢复**：冻结字面 `clickSessionItem("消融实验对照")` 回到脚本内并成为该相位的决定性点击；`摘录与笔记走查` 只出现在「钉活动会话」的幂等前置里（该行已是活动行时为 no-op）。实测分支 `pinClicked = true`（`activeBefore = 消融实验对照`）⇒ 前置点击真实发生，冻结字面点击真实切换（`switchSessionCalls().paths` 末项 = `SESSIONS_A[1].path`）。 |
| 判别力说明（只增不减） | 判据 ⑥⑦⑧ 语义与文本逐字不变（入口文本 / `title` / 标记 / 现场两键不丢）；**新增 3 条非空断言**：切换前 `.reader-discuss` 计数 **0**（记录会话不在列表 ⇒ 入口隐藏，`data.entryCountBefore`）、`switchSessionCalls()` 计数增量 ≥ 1 **且** `paths` 末项逐字 = `SESSIONS_A[1].path`（真实调用链与载荷，`data.switchCalls`）、切换后菜单活动行 = `消融实验对照` 且 `active === true`（`data.activeAfter`）；另落盘 `pinClicked` / `activeBefore` 作登记证据。 |

**收口判据（本次登记的验收面）**：`git diff -U0 -- pix/scripts/ui-shot.mjs | grep -cE "^-[^-]"` 仍为 **6** 行（4 处 §N103-2 登记的 stub 实现行 + 本节的 2 行）；除本节两条登记外，既有场景 / 断言 / 截图名 / label 零删除零改写。

---

## 1. N100 现场扩展：每篇文档记住最近一次讨论的会话（5 子条）

**用户可见行为**：你在一篇论文上问过 AI，然后去读别的文档、切到别的会话；过几天再打开这篇论文，「继续讨论」入口与历史对话里的标注仍然指向当时那段讨论；如果你从没在这篇论文上发过消息，就什么都不显示；本轮的改动对旧现场文件完全透明——旧文件照常读出阅读位置，不会有任何报错、提示或多余写入。

### N100-1 字段与形状（逐字冻结）

**逐字冻结**：§0.3 全表（文件形态 / 类型 / 语义 / 值域谓词 / 形状不变量）。

**验收判据**

1. 【烟测-主进程】组 `reader-state-store` #6（写入并回读）：见 N103-1。
2. 【走查】形状与实现点：`grep -rn "lastSessionPath" pix/src \| wc -l` ≥ **4**（`shared/types.ts` 2 + `main/reader-state-store.ts` ≥ 2）；`grep -rn "lastSessionPath\|lastSessionAt" pix/src/renderer/components \| wc -l` = **0**；`grep -c "MAX_SESSION_PATH_LENGTH = 2048" pix/src/main/reader-state-store.ts` = **1**（定义行逐字），且 `grep -rn "MAX_SESSION_PATH_LENGTH" pix/src/renderer \| wc -l` = **0**（渲染层不得复制第二份长度上限）。
3. 【走查】新增键排在 `updatedAt` 之后：`git diff -U0 pix/src/main/reader-state-store.ts` 中新增条目的构造语句里键序逐字为 `page` → `scale` → `updatedAt` → `lastSessionPath` → `lastSessionAt`（读侧与写侧各 1 处，允许写成展开形式但展开源的键序同上）。
4. 【走查】零新 IPC：`git diff` 中 `pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts` 均为空；`grep -c "reader-state-save" pix/src/main/ipc-handlers.ts` = **1**（仅 `:555` 的 `ipcMain.handle("reader-state-save", …)`；与基线相同。跨目录口径另记：`grep -rn "reader-state-save" pix/src \| wc -l` = **2** = `:555` + `preload.ts:176`）。

**文件白名单条目**：`pix/src/shared/types.ts`（修改）、`pix/src/main/reader-state-store.ts`（修改）。

### N100-2 旧文件兼容与降级语义零改动

**逐字冻结**：§0.3 的「旧文件（无两键）」与「不得触碰」两行 + §0.1 的 R6 两条冻结项。

**验收判据**

1. 【烟测-主进程】组 `reader-state-store` #8（旧格式兼容）：见 N103-1；#11（corrupt / 版本回归）见 N103-1。
2. 【离屏】`r18-2` 相位 `old-format-silent`：旧格式现场文件下 `[reader-state]` warn 增量为 **0**、`.reader-resume` 文本逐字 `继续阅读：sample-paper.pdf · 第 2 页`、现场文件条目**无** `lastSessionPath` 键（`hasOwnProperty === false`）。
3. 【离屏】`r18-3` 相位 `session-gone`：`[reader-state]` warn 增量为 **0**，且现场文件里的记录**未被改写**（两键逐字保留）。
4. 【走查】降级路径零改动：`git diff -U0 pix/src/main/reader-state-store.ts` 中 `DEGRADE_MESSAGES`、`ERROR_MESSAGES`、四条 `readStateFile` 返回分支、`uniqueBackupPath`、`writeFileAtomic` 不作为 `+` / `-` 行出现；`grep -c "await" pix/src/main/reader-state-store.ts` = **1**（仅头部注释 `:5`，与基线相同；不得新增第二处，读-改-写仍在同一函数体内）。

**文件白名单条目**：`pix/src/main/reader-state-store.ts`（修改）。

### N100-3 写侧保留规则与越界丢弃

**逐字冻结**：§0.4 的「读侧」「写侧」「渲染层乐观更新」三行 + §0.3 的「越界 / 非法」行。

**验收判据**

1. 【烟测-主进程】组 `reader-state-store` #7（未携带 ⇒ 保留）、#9（值域越界丢弃）、#10（读侧成对裁剪）：见 N103-1。
2. 【离屏】`r18-1` 相位 `send-records`：发送后现场文件的目标条目两键逐字 = 会话路径与发送时刻；**同一条目的 `page` / `scale` 与发送前读数一致**（发送不改变既有字段）；其它条目的两键逐字不变（夹具预置第二条带另一对的条目）。
3. 【离屏】`r18-1` 相位 `send-failed`：`setSendFailure("fail")` 注入后发送被拒 ⇒ 目标条目的两键**逐字不变**（`lastSessionAt` 不变）。
4. 【走查】伪证排除：`git diff -U0 pix/src/main/reader-state-store.ts` 中 `resolveLastDoc`、`toRelativeDocPath`、`isStoredDocPath`、`docPathKey`、`parseReaderState` 的键域过滤与 `lastDocPath` 交叉过滤不作为 `+` / `-` 行出现。

**文件白名单条目**：`pix/src/main/reader-state-store.ts`（修改）。

### N100-4 写入时机（唯一选择与理由）

**逐字冻结**：§0.0 第 1 条 + §0.4 的「触发时机」「守卫」两行。

**验收判据**

1. 【离屏】`r18-1` 相位 `send-records`：`readerStateSaveCalls()` 的最后一条 payload 含 `lastSessionPath` 与 `lastSessionAt`（stub 记录扩展），且两值逐字等于现场文件里的记录；`[reader-state]` warn 增量 0。
2. 【离屏】`r18-2` 相位 `open-switch-no-write`：**打开文档（含一次真实落点写盘）与会话切换之后**，现场文件的条目 `page` 已按落点更新且 `updatedAt > SEED_AT`（防空：证明确实发生了写盘）而 `lastSessionPath` 键**仍不存在** ⇒ 「打开文档 / 切换会话不写记录」。
3. 【离屏】`r18-1` 相位 `send-failed`：发送失败不写（判据 3 见 N100-3）。
4. 【走查】唯一调用点：`grep -c "noteDiscussion" pix/src/renderer/components/workspace/ChatPanel.vue` = **1**（try 尾部单一调用点；前提 = §0.1 的 R8 行登记的 `if/else` 调整）；`git diff -U0 pix/src/renderer/components/workspace/ChatPanel.vue` 中 `send()` 既有语句除 `return;` → `} else {` 一处外不作为 `+` / `-` 行出现；`grep -c "noteDiscussion" pix/src/renderer/stores/reader-state-store.ts` = **2**（动作定义 1 + 返回对象 1）；`grep -rn "noteDiscussion" pix/src/renderer/components/workspace/PdfViewer.vue pix/src/renderer/components/workspace/ReaderPanel.vue pix/src/renderer/pages/WorkspacePage.vue \| wc -l` = **0**（记录只在发送链路触发）。

**文件白名单条目**：`pix/src/renderer/components/workspace/ChatPanel.vue`（修改）、`pix/src/renderer/stores/reader-state-store.ts`（修改）。

### N100-5 渲染层记录路径与唯一派生

**逐字冻结**：§0.7 全表。

**验收判据**

1. 【离屏】`r18-1` 相位 `send-records`：发送成功后现场文件、`readerStateSaveCalls` payload、`.reader-discuss` 三者一致指向同一会话路径（三层一致，防「只写了一层」）。
2. 【离屏】`r18-4` 相位 `workspace-b` / `back-to-a`：跨工作区不串（见 N101-3 判据 3）。
3. 【走查】单点派生：`grep -c "currentDiscussion" pix/src/renderer/stores/reader-state-store.ts` = **2**；`grep -rn "currentDiscussion" pix/src/renderer/components \| wc -l` ≥ **2**（ReaderPanel 1 + ChatPanel 1，实现自由）；`grep -rn "currentDiscussion" pix/src/renderer/pages \| wc -l` = **0**。
4. 【走查】乐观更新保留规则：`git diff -U0 pix/src/renderer/stores/reader-state-store.ts` 中 `applyLocal` 的构造语句保留既有分支持续新增展开（`...(对 ? 覆盖 : 保留)`），既有 `documents` / `lastDoc` / `updatedAt: Date.now()` 语句不作为 `-` 行出现；`submitIfChanged` 的比较表达式不作为 `+` / `-` 行出现（去重基线零改动）。
5. 【check】`CHECK_EXIT=0`（新增类型与动作全链路必填、无 `any`、无内联动态 import）。

**文件白名单条目**：`pix/src/renderer/stores/reader-state-store.ts`（修改）。

---

## 2. N101 「继续讨论」一步入口（4 子条）

**用户可见行为**：打开一篇你讨论过的论文，阅读区顶部的胶囊里多出一枚浅色小药丸，写着「继续讨论：消融实验对照 · 昨天」；鼠标悬停显示「继续讨论：消融实验对照 · 昨天；点击打开该会话」；点一下，右侧会话就切到那一条（对话内容随之载入）——文档不换页、不换缩放、不写盘；如果你此刻已经在那条会话里，这枚药丸不出现；如果那条会话已被删除，它安静地消失，不弹任何提示。

### N101-1 入口的位置、字面与样式

**逐字冻结**：§0.5 的「落点 / 类名 / 内容 / 文本 / `title` / 样式」六行。

**验收判据**

1. 【离屏】`r18-1` 相位 `entry-visible-and-click`：`.center-pill` 内 `.reader-discuss` 恰 **1** 个；文本前缀逐字 `继续讨论：摘录与笔记走查 · `、时间后缀 ∈ 运行时允许集（示例值 `继续讨论：摘录与笔记走查 · 刚刚`；**不得写死档位**，MF5）；`title` = 文本 + `；点击打开该会话` 逐字；图标节点为 `.v-icon` 且 `mdi-forum-outline` 类在场；元素 `tagName === "BUTTON"`。
2. 【离屏】`r18-4` 相位 `back-to-a`：`.center-pill` 内既有子元素（`.pill-label` / `.map-toggle`）仍在场，`.pill-label` 文本逐字 `sample-paper.pdf`（入口不得改写既有子元素）。
3. 【走查】字面唯一：`grep -rn "reader-discuss" pix/src \| wc -l` = **5**（模板 2：主类名 1 + 文本容器类名 1；样式 3：基础样式 1 + 文本容器样式 1 + `:hover` 1；逐行计数）；`grep -rn "继续讨论" pix/src` 的**命中文件数** = 1（全部落在 `ReaderPanel.vue`；因实现允许两处模板合并为一条复用串，**不将行数作为判据**——判别力放在判据 1 的运行时实文：文本与 `:title` 逐字）；`grep -rn "mdi-forum-outline" pix/src \| wc -l` = **1**。
4. 【走查】`.reader-resume` 零改动：`git diff -U0 pix/src/renderer/components/workspace/ReaderPanel.vue` 中 `reader-resume` 相关行不作为 `+` / `-` 行出现；`grep -rn "reader-resume" pix/src \| wc -l` 保持 **3**。

**文件白名单条目**：`pix/src/renderer/components/workspace/ReaderPanel.vue`（修改）。

### N101-2 解析与显示条件（零占位）

**逐字冻结**：§0.5 的「显示条件」「不渲染」两行 + §0.7 的 `currentDiscussion` 行。

**验收判据**

1. 【离屏】`r18-2` 相位 `old-format-silent`：无记录 ⇒ `.reader-discuss` 计数 **0**（零占位）；同相位 `.reader-resume` 在场（防空：不是整块空态都没渲染）。
2. 【离屏】`r18-1` 相位 `send-records`：记录会话即当前活动会话 ⇒ `.reader-discuss` 计数 **0**（活动会话隐藏规则）；切到另一条会话后同一文档 ⇒ 入口出现（判据见下相位）。
3. 【离屏】`r18-3` 相位 `session-gone`：记录会话不在列表 ⇒ `.reader-discuss` 计数 **0**，且 `.center-pill` / `.chat-panel` 内新增容器计数 0 + 新增提示文案 0（走查：新增文案 `最近讨论：` 只出现在 ChatPanel 的 tooltip 常量 1 处）。
4. 【走查】解析唯一：`grep -rn "documents\[" pix/src/renderer/components \| wc -l` = **0**；`grep -rn "SessionInfo" pix/src/renderer/components/workspace/ReaderPanel.vue \| wc -l` = **0**（入口不带会话类型，只用 store 的解析结果）。

**文件白名单条目**：`pix/src/renderer/components/workspace/ReaderPanel.vue`（修改）、`pix/src/renderer/stores/reader-state-store.ts`（修改）。

### N101-3 点击链路（复用既有会话切换通道）与降级

**逐字冻结**：§0.5 的「点击语义」「打开链路」「禁止」三行 + §0.0 第 3 条。

**验收判据**

1. 【离屏】`r18-1` 相位 `entry-visible-and-click`：点 `.reader-discuss` ⇒ `switchSessionCalls()` 计数 +1 且 `paths` 末项逐字 = 现场文件里的 `lastSessionPath`（复用 `switch_session`）；`.pill-session .pill-label` 文本从 `消融实验对照` 变为 `摘录与笔记走查`（UI 可见证据：目标会话已打开）；打开会话菜单后该行 `.v-list-item--active` 在场。
2. 【离屏】`r18-1` 相位 `entry-visible-and-click`：点击**不写盘** —— 现场文件 sha1 与 `readerStateSaveCalls()` 计数在点击前后不变；`.page-label` / `.zoom-label` / `.center-pill .pill-label` 与点击前逐字相同（不切页、不改缩放、不切文档）；点击后 `.reader-discuss` 计数变 **0**（记录会话即当前活动会话 ⇒ 入口隐藏）。
3. 【离屏】`r18-4` 相位 `workspace-b`：切到另一工作区后 `.reader-discuss` 计数 **0**（两条独立成立的理由：① stub 的 `listSessions` 按工作区根匹配 ⇒ B 列表为空；② B 现场文件的目标条目无有效对 ⇒ `currentDiscussion === null`），且 B 现场文件的目标条目在场而无两键（MF3）；`back-to-a` 相位：回到 A 后入口恢复（文本逐字 `继续讨论：摘录与笔记走查 · 昨天`）⇒ 跨工作区不串、回切可恢复。
4. 【走查】复用唯一通道：`grep -c "onSwitchSession" pix/src/renderer/pages/WorkspacePage.vue` 的既有函数体不作为 `-` 行出现；`grep -rn "switch_session" pix/src/renderer \| wc -l` = **1**（仅 `useRpc.ts:291`，零增量——新增处理器不得新增 `sendCommand` 调用）；`grep -rn "sendCommand\|ipcRenderer" pix/src/renderer/components/workspace/ReaderPanel.vue \| wc -l` = **0**。

**文件白名单条目**：`pix/src/renderer/pages/WorkspacePage.vue`（修改）、`pix/src/renderer/components/workspace/ReaderPanel.vue`（修改）。

### N101-4 边界：未就绪 / 未打开文档 / 库外文件 / 会话已删除

| 情形 | 写死的行为 |
| --- | --- |
| 状态未就绪（`ready === false`，加载窗口内） | 不渲染（零占位）；不出现「无会话的半截入口」（与 `.reader-resume` 的既有口径同构） |
| 未打开文档 / 打开与记录无关的文档 | 不渲染（`currentDocKey === null` 或该文档无记录） |
| 资料库外文件 / 未选库 | 不渲染（不猜测归属） |
| 记录会话已删除 / 不可读 / 移出本工作区 | 静默隐藏（`currentDiscussion === null`）；现场文件保留原记录 |
| 记录会话即当前活动会话 | 不渲染（避免死路点击；活动判定与 `ChatPanel.isActiveSession` 同源） |

**验收判据**

1. 【离屏】`r18-2` 相位 `old-format-silent` 与 `r18-3` 相位 `session-gone`：上述「不渲染」两行的可判定式（`.reader-discuss` 计数 0 且无提示）。
2. 【离屏】`r18-1` 相位 `send-records`：活动会话隐藏的可判定式（计数 0，随后切换会话 ⇒ 出现）。
3. 【走查】`grep -c "reader-discuss" pix/src/renderer/components/workspace/ReaderPanel.vue` = **5**（模板 2：主类名 + 文本容器类名；样式 3：基础 + 文本容器 + `:hover`；**不得**出现 `v-else` 占位节点或第二枚元素）。

**文件白名单条目**：`pix/src/renderer/components/workspace/ReaderPanel.vue`（修改）。

---

## 3. N102 会话列表标注（2 子条）

**用户可见行为**：打开历史对话下拉列表，讨论过**当前这篇论文**的那条会话，在删除按钮左侧多出一枚小图标（文档链接）；鼠标悬停显示「最近讨论：sample-paper.pdf」；其它会话行与既有一模一样（标题、时间副标题、删除按钮的两击确认都不变）；当前文档没有讨论记录时，列表里没有任何标记。

### N102-1 标记的字面、条件与结构变更

**逐字冻结**：§0.6 全表（含「唯一登记的结构变更」）。

**验收判据**

1. 【离屏】`r18-5` 相位 `mark-visible`：打开会话菜单 ⇒ `.session-doc-mark` 计数恰 **1**；所在行的标题文本逐字 `摘录与笔记走查`；标记 `title` 逐字 `最近讨论：sample-paper.pdf`；另一行（`消融实验对照`）内 `querySelector(".session-doc-mark") === null`。
2. 【离屏】`r18-5` 相位 `mark-visible`：既有菜单文案与控件零破坏 —— `新对话` / `重命名当前对话` / `历史对话` 三个文本在场；`.session-delete-btn` 计数 **1**（活动会话行无删除按钮、非活动行仍有），其 `title` 逐字 `删除该对话`。
3. 【离屏】`r18-5` 相位 `mark-absent`：切到无记录的文档（`long-book.pdf`）⇒ `.session-doc-mark` 计数 **0** 且 `.reader-discuss` 计数 **0**；切回 `sample-paper.pdf` ⇒ 标记恢复（`title` 逐字不变）且 `.reader-discuss` 计数仍为 **0**（前置已钉住「活动会话 = 记录会话」，与判据 ④ 同口径；MF2），现场文件 `sample-paper.pdf` 条目的两键逐字不变（跨文档不粘滞、读-改-写不丢对）。
4. 【走查】字面唯一：`grep -rn "session-doc-mark" pix/src \| wc -l` = **2**（模板 1 + 样式 1）；`grep -rn "mdi-file-link-outline" pix/src \| wc -l` = **1**；`grep -rn "最近讨论：" pix/src \| wc -l` = **1**；`.session-delete-btn` 的类名与文案行不作为 `-` 行出现（守卫位置调整只允许出现在 `#append` 模板行）。

**文件白名单条目**：`pix/src/renderer/components/workspace/ChatPanel.vue`（修改）。

### N102-2 取值纪律与成本边界

**逐字冻结**：§0.6 的「取值纪律」「成本」「价值」三行。

**验收判据**

1. 【走查】只读 store 派生：`grep -c "currentDiscussion" pix/src/renderer/components/workspace/ChatPanel.vue` = **2**（两个 computed 各 1）；`grep -c "readerStateStore.documents" pix/src/renderer/components/workspace/ChatPanel.vue` = **0**；`grep -c "lastSessionPath" pix/src/renderer/components/workspace/ChatPanel.vue` = **0**。
2. 【走查】零新数据面：`grep -c "ipcRenderer\|sendCommand" pix/src/renderer/components/workspace/ChatPanel.vue` 与基线相同；`git diff` 中 `pix/src/renderer/stores/session-store.ts`、`pix/src/renderer/stores/project-store.ts` 为空（标记不依赖会话流改动）。
3. 【离屏】`r18-5` 两个相位同时钉住「有标记」与「无标记」两侧，且菜单打开 / 关闭路径复用既有 `v-menu` 行为（Esc 或点击外部关闭；不新增关闭逻辑）。

**文件白名单条目**：`pix/src/renderer/components/workspace/ChatPanel.vue`（修改）。

---

## 4. N103 验证面（仓库内可复跑）

### N103-1 主进程数据面烟测：扩展 `smoke-notes.mjs`（+6 条）

**为什么扩展而不是新建（决策与理由，评审档不得改写本决策）**

1. 被测模块 `pix/src/main/reader-state-store.ts` **已在** `smoke-notes.mjs` 的编译面（`files` 含它）、产物白名单（`required` 含 `main/reader-state-store.js`）与加载面（`readerStateStore` 句柄）内，`reader-state-store` 组（`:1226`）已有 5 条断言与 `console.warn` 捕获脚手架；新建脚本需要新增 npm script ⇒ 触发 `pix/package.json` 改动（本轮登记为不动）。
2. 本轮**没有**新增渲染层纯函数（§0.0 第 4 条）⇒ `smoke-view.mjs` 的编译面与 74 条断言零改动，新字段规则无处可放也不必放。
3. 数据面与交互面分工：本组覆盖「写入 / 读取 / 旧文件兼容 / 损坏降级 / 越界」；`.reader-discuss` / `.session-doc-mark` 的解析与交互由离屏 `r18-*` 覆盖（N103-2）。

**冻结的追加断言（`reader-state-store` 组 #6–#11，不得减少；组数与既有 #1–#5 逐字不动）**

夹具（手写常量）：`SESS = join(TMP, "agent", "sessions", "session-a.jsonl")`（**库外绝对路径**，证明原样存取）、`T = 1758000000000`、`SESS_B = join(TMP, "agent", "sessions", "session-b.jsonl")`、`T_B = 1758000001000`。

| # | 断言（失败即红） |
| --- | --- |
| 6 | **写入并回读**：`saveReaderState({docFilePath: DOC_A, page: 2, scale: 1.2, lastSessionPath: SESS, lastSessionAt: T})` ⇒ `success === true`；`state.documents["sample-paper.pdf"]` 逐值 `page === 2` / `scale === 1.2` / `lastSessionPath === SESS` / `lastSessionAt === T` / `updatedAt` 为 `> 0` 的有限数；**磁盘文件**（`JSON.parse(readFileSync(STATE_A))`）同条目同四值（含库外路径原样、未被相对化） |
| 7 | **未携带 ⇒ 保留**：预置「第二条带 `SESS_B` / `T_B` 的条目」后，执行一次**不带两键**的 `saveReaderState({docFilePath: DOC_A, page: 3, scale: 1})` ⇒ 目标条目 `page === 3` 且两键逐字仍为 `SESS` / `T`；第二条的两键逐字仍为 `SESS_B` / `T_B`（其它条目一字不动） |
| 8 | **旧文件兼容（零报错、不造字段）**：写入旧格式文件（条目仅有 `page` / `scale` / `updatedAt`）⇒ `loadReaderState()` 的 `degraded === false`、`reason === undefined`、`warn` 增量 **0**、条目 `hasOwnProperty("lastSessionPath") === false`；随后一次不带两键的 save ⇒ 磁盘条目**仍无**两键（不得凭空造字段） |
| 9 | **值域越界丢弃**：先 seed 有效对，再逐一以 9 种非法形态 save —— `lastSessionPath: ""` / `42` / `"a".repeat(2049)` / 含 `"\u0000"`、只给 `lastSessionPath` 不给 `lastSessionAt`、`lastSessionAt: 0` / `-1` / `NaN` / `"123"`；每次 save 后目标条目两键逐字仍为 seed 值，且磁盘条目**不出现半截字段**（`hasOwnProperty` 两侧一致）；`warn` 增量 **0** |
| 10 | **读侧成对裁剪**：手写文件含三条目 —— A 有效对、B `lastSessionAt: "x"`、C 只给 `lastSessionAt`；`loadReaderState()` ⇒ A 两键逐值保留；B / C 的 `page` / `scale` 照常生效且**两键均不存在**；`degraded === false`、`warn` 增量 **0** |
| 11 | **损坏 / 版本回归（新字段在场）**：带两键的文件被截断 ⇒ `loadReaderState()` 降级恰 1 条 warn（`reason === "corrupt"`）；`saveReaderState({docFilePath: DOC_A, page: 1, scale: 1})` ⇒ 先 copy-first 备份——**判据用增量**（操作前后 `PIX_READ_A` 内 `reader-state.json.corrupt-*` 集合的差集恰 1 个；不得用绝对计数：#2/#3 已在同一 `PIX_READ_A` 留下 1 份，次要项 N6），文件名匹配既有 `/^reader-state\.json\.corrupt-\d{8}-\d{6}(-\d+)?$/`，且重建条目**无**两键；`version: 2` 且带两键的文件 ⇒ load 降级、save 拒写（`success === false`、`error` 逐字 `阅读状态文件版本不支持（未写入）`）且文件 sha256 不变 |

**验收判据**

1. 【烟测-主进程】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes` ⇒ 退出码 0、末行逐字 `通过 71 / 失败 0`；连续两次运行结果相同；既有 10 组 65 条零改写（#1–#5 与其它 9 组逐字不动）。
2. 【走查】只追加：`git diff -U0 pix/scripts/smoke-notes.mjs` 的新增行只出现在 `runReaderStateStore` 内、`main()` 调用顺序与 `required` / `allowed` / 编译选项零改动；断言索引恰为 `6`…`11`。

**文件白名单条目**：`pix/scripts/smoke-notes.mjs`（修改）。

### N103-2 离屏场景 `r18-*`（5 场景 / 5 组 / 11 条 record / 12 张截图）

**stub 契约（`ui-shot.mjs`）**

| 项 | 冻结 |
| --- | --- |
| 会话夹具（场景级，手写） | `SESSIONS_A` = 2 条：① `{ path: path.join(CONFIG.root, ".pix-read", "session-demo.jsonl"), id: "sess-demo", cwd: CONFIG.root, name: "摘录与笔记走查", created/modified: ISO 串, messageCount: 4, firstMessage: "" }`（与既有 `SESSION_STATE.sessionFile` / `sessionId` **同路径同 id**）；② `{ path: path.join(CONFIG.root, ".pix-read", "session-older.jsonl"), id: "sess-older", cwd: CONFIG.root, name: "消融实验对照", … }`；`SESSIONS_GHOST` = `SESSIONS_A` + `{ path: path.join(CONFIG.root, ".pix-read", "session-gone.jsonl"), id: "sess-gone", name: "丢失后恢复的会话", … }` |
| 时间夹具（决定入口文本可判定） | 场景局部常量 `PAST_AT = Date.now() - 26 * 60 * 60 * 1000`（26 小时前 ⇒ `formatSessionTime` 恒为逐字 `昨天`；用于所有**种子**现场记录）与 `SEED_AT = Date.now() - 60000`（1 分钟前 ⇒ 用于现场文件的 `updatedAt`，作「落点写盘确已发生」的防空基线）；`r18-1` 相位 `send-records` 的**真实发送**记录**不要求确定档位**（`刚刚` 窗口仅 60s）：该相位只断 `Date.now() - lastSessionAt < 60000` 作防空，相位 2 / 3 按 MF5 的**运行时允许集**判定（见 N103-2 相位表） |
| stub 新增控制口（2 个） | `setSessions(list, root = LIBRARY_DIR)`（种入会话列表及其**归属工作区根**，未种入 ⇒ 恒 `[]`；**既有场景零影响**）；`switchSessionCalls()` ⇒ `{ count, paths }`（`paths` 保留末 8 条） |
| stub 行为变更（登记） | ① `listSessions` 由 `return []` 改为「按根返回」（`path` 的比较键等于种子根 ⇒ 返回种入列表；否则 `[]`；未种入 ⇒ 恒 `[]`，与既有行为等价。理由见卷首自审第 1 条）；② `handleCommand` 的 `switch_session` 分支：记录 `{ path }` 到 `switchCalls`；命中种入列表时把 `SESSION_STATE.sessionFile/sessionId/sessionName` 镜像为该条（faithful mirror，`get_state` 随之变化）；返回体 `{ success: true, data: { cancelled: false } }` 逐字不变；③ reader-state 镜像（`parseDocState` / `normalizeState` / `readerStateSave`）与真实主进程同谓词同保留规则；`readerStateCalls` 的 payload 追加 `lastSessionPath` / `lastSessionAt` 两字段（记录传入值） |
| 复用 helper（零修改） | `restoreStandardSeed()` `:3426`、`clearStateA()` `:2394`、`readState` / `writeState` / `removeState` `:1631-1635`、`entry(page, scale)` `:1640`、`saveCalls()` `:1641`、`warnCount()` `:1643`、`waitResumeEntry()` `:1686`、`openRow(suffix)` `:1721`、`clickNext` / `clickPrev` `:1730` / `:1731`、`setDraft(text)` `:2544`、`typeAndSend(text)` `:2556`、`sendCalls()` / `clearSendCalls()` / `waitSendCalls(n)` / `lastErrorText()` `:3268-3281`、`rectOfSelector` `:2579`、`capturePage` `:1278`、`has` / `textOf` / `countOf` `:1624-1629`、`waitFor` `:1608`、`sleep` `:1603`（既有 `enterCleanWorkspace(seed)` `:3407` 的复位序列是新 helper 的蓝本，r18 场景不直接调用它） |
| 新 helper（语义冻结，命名自由） | `enterWorkspaceWithState(state, rows = 4)`：场景前置统一入口 —— `setMessages([])` + `setSendFailure(null)` + 两个笔记失败注入复位 → `goHome()` → `clearStateA()` → `writeState(STATE_FILE_A, state)` → `enterWorkspace(LIBRARY_NAME)` → `waitTreeRows(rows)` → `seedNotes(seedNotes())`（注入必须在「已返回首页之后、进入工作区之前」，与 R6 场景 20 的既有节奏一致）；`openSessionMenu()`：点 `.pill-session` 并等 `.v-overlay-container .v-list` 在场；`closeSessionMenu()`：Esc 关闭并等列表消失（**幂等**：菜单已被点击项关闭时直接返回，不得报错）；`sessionMenuProbe()`：返回 `{ open, items: [{ title, subtitle, active, marked, markTitle, hasDeleteBtn }] }`（按 `.v-list-item` 逐行读 `.v-list-item-title` 文本、`.v-list-item--active`、`.session-doc-mark` 与 `title`、`.session-delete-btn`）；`clickSessionItem(title)`：按标题文本点列表项（对已是活动会话的行是幂等 no-op）；`waitDiscussText(text)`：等 `.reader-discuss` 文本逐字相等；`waitState(file, predicate, label, timeoutMs = 20000)`：轮询 `readState(file)` 直到 `predicate(state)` 为真（节奏同 `waitFor` 的 120ms；`waitFor` 在渲染层求值，无法轮询文件——见卷首自审第 2 条） |
| 场景挂载点 | `runReaderStateScenarios` 末尾（R17 最后一个相位与 `restoreStandardSeed()` 之后、函数收口 `}`（现 `:11532`）之前）；每个场景以自己的 `restoreStandardSeed()` + `setSessions([])` + `setSendFailure(null)` 收尾 |
| 既有面 | `SEL` 只**追加** 2 项（**72 → 74**）；既有场景 / 截图 / label / helper 零删除零改写（**唯一登记例外 = §0.10 登记 1 / 登记 2**：`map-chapter-filter` 相位 `injection` 的 2 行既有断言更新与 `r18-3` 相位 `session-restored` 的步骤自确定化）；新增 5 种 label（69 → 74） |

**场景 `r18-1`（组 `r18-discuss-entry`，3 条 record，4 张截图）**

前置：`setSessions(SESSIONS_A)` → `enterWorkspaceWithState({ version: 1, lastDocPath: "sample-paper.pdf", documents: { "sample-paper.pdf": { page: 1, scale: 1, updatedAt: SEED_AT }, "archive/older-paper.pdf": { page: 1, scale: 1, updatedAt: 1758000001000, lastSessionPath: <root>/.pix-read/session-b.jsonl, lastSessionAt: 1758000001000 } } })`（第二条为「其它条目不被动」的现场对照）→ `openRow("sample-paper.pdf")` → `waitPdfLoaded()` + `waitPage(1, 3)` → `openSessionMenu()` + `clickSessionItem("摘录与笔记走查")` + `closeSessionMenu()`（MF2：显式把活动会话钉为记录会话；已是活动会话 ⇒ 点击是幂等 no-op）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `send-records` | 读 `saveCalls()` 基线 + `readState(STATE_FILE_A)`（防空：条目无 `lastSessionPath` 键）→ `typeAndSend("R18：这篇的消融结论怎么复现？")` → `waitSendCalls(1)` → `waitState(STATE_FILE_A, (s) => s.documents["sample-paper.pdf"].lastSessionPath)` → 读文件 / payload / 元素 → 截图 `r18-1-send-records.png`（整窗） | ① 目标条目 `lastSessionPath` 逐字 = `SESSIONS_A[0].path`、`lastSessionAt` 为有限数且 `Date.now() - 值 < 60000`（防空：`刚刚` 的可判定前提）；② `page === 1`、`scale === 1`（发送不改变既有字段）；③ 预置的第二条目（`archive/older-paper.pdf`）两键逐字仍为 `<root>/.pix-read/session-b.jsonl` / `1758000001000`（其它条目一字不动）；④ `readerStateSaveCalls()` 末条 payload 含两键且逐值相等；⑤ `.reader-discuss` 计数 **0**（记录会话即活动会话 ⇒ 隐藏）；⑥ `warnCount` 增量 0 | `{ phase, file, payload, page/scaleBefore/After, otherEntry, entryCount, warnDelta }` |
| `entry-visible-and-click` | `openSessionMenu()` → `clickSessionItem("消融实验对照")` → `closeSessionMenu()` → `waitDiscussText("继续讨论：摘录与笔记走查 · ")`（**前缀**）→ 截图 `r18-1b-discuss-entry.png`（`rectOfSelector(".center-pill", 12)`）→ 记 `switchCalls` 基线 + 文件 sha1 → 点 `.reader-discuss` → `waitFor` `switchSessionCalls().count === base + 1` → 读 `.pill-session .pill-label` / 元素 / 文件 → 截图 `r18-1c-discuss-switched.png`（整窗） | ⑦ 入口文本前缀逐字 `继续讨论：摘录与笔记走查 · `、其后缀 ∈ 运行时允许集（读现场文件 `lastSessionAt` 与断言时刻的差计算 `{刚刚} ∪ {N 分钟}`（N ∈ {floor(Δ/60000), +1}），**不写死档位**；MF5），`title` = 文本 + `；点击打开该会话` 逐字；⑧ `.reader-discuss` 恰 1 个、`.pill-label` 文本逐字 `sample-paper.pdf`；⑨ 点击后 `paths` 末项逐字 = `SESSIONS_A[0].path`；`.pill-session .pill-label` 逐字 `摘录与笔记走查`；菜单里该行 `.v-list-item--active` 在场；⑩ 点击零写入：文件 sha1 不变、`saveCalls()` 增量 0；⑪ `.page-label` / `.zoom-label` 与点击前逐字相同；⑫ 点击后 `.reader-discuss` 计数 **0** | `{ phase, entry, switchCalls, pillBefore/After, activeRow, shaSame, saveDelta, page/zoom, entryAfter }` |
| `send-failed` | `openSessionMenu()` → `clickSessionItem("消融实验对照")` → `closeSessionMenu()` → 读文件两键 + 入口文本 → `setSendFailure("fail")` → `typeAndSend("R18：这条应当发不出去。")` → 等 `.error-block` → 读文件 / 入口 / 发送计数 → `setSendFailure(null)` → 截图 `r18-1d-send-failed.png`（整窗） | ⑬ 发送被拒（错误块在场、`sendCalls` 计数按既有语义变化）；⑭ 目标条目两键**逐字不变**（`lastSessionAt` = 相位 1 的值）；⑮ 入口文本仍在与相位 2 相同的允许集内（前缀逐字相同），且现场文件的 `lastSessionAt` 与相位 1 的值逐字相等（记录仍指向 demo 会话，未被失败发送改写；MF5：判据落在数据面） | `{ phase, errorText, pairBefore/After, entryText, sendCount }` |

**场景 `r18-2`（组 `r18-old-format`，2 条 record，2 张截图）**

前置：`setSessions(SESSIONS_A)` → `enterWorkspaceWithState({ version: 1, lastDocPath: "sample-paper.pdf", documents: { "sample-paper.pdf": { page: 2, scale: 1, updatedAt: SEED_AT } } })`（**旧格式：无两键**）→ `waitResumeEntry()`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `old-format-silent` | 读 `.reader-resume` 文本 / `.reader-discuss` 计数 / warn 增量 / 现场文件 → 截图 `r18-2-old-format.png`（整窗） | ① `.reader-resume` 文本逐字 `继续阅读：sample-paper.pdf · 第 2 页`（R6 入口零改动）；② `.reader-discuss` 计数 **0**（无记录零占位）；③ `warnCount` 增量 **0**；④ 现场文件条目 `hasOwnProperty("lastSessionPath") === false`（读侧不造字段） | `{ phase, resumeText, entryCount, warnDelta, hasPairKey }` |
| `open-switch-no-write` | 点 `.reader-resume` → `waitPdfLoaded()` + `waitPage(2, 3)` → `clickNext()` → `waitPage(3, 3)`（制造一次真实变化）→ `waitState(STATE_FILE_A, (s) => s.documents["sample-paper.pdf"].page === 3 && s.documents["sample-paper.pdf"].updatedAt > SEED_AT)`（落点写盘的防空）→ 读文件 → `openSessionMenu()` + `clickSessionItem("消融实验对照")` + `closeSessionMenu()` → 再读文件 / 入口 → 截图 `r18-2b-open-switch.png`（整窗） | ⑤ 打开文档确实写盘（`page === 3`、`scale === 1`、`updatedAt > SEED_AT`）而**仍无** `lastSessionPath` 键（MF1：夹具条目 `{page: 2, scale: 1}` + `lastDocPath` 播种的 `committed` 与续读落点全等 ⇒ 不开 IPC，必须翻页才能造出写入）；⑥ 切换会话后仍无该键（打开 / 切换都不写记录）；⑦ `.reader-discuss` 计数 **0**（打开文档后依旧零占位）；⑧ `warnCount` 增量 **0** | `{ phase, page, pairKeyAfterOpen, pairKeyAfterSwitch, entryCount, warnDelta }` |

**场景 `r18-3`（组 `r18-session-missing`，2 条 record，2 张截图）**

前置：`setSessions(SESSIONS_A)` → `enterWorkspaceWithState({ version: 1, lastDocPath: "sample-paper.pdf", documents: { "sample-paper.pdf": { page: 1, scale: 1, updatedAt: PAST_AT, lastSessionPath: <root>/.pix-read/session-gone.jsonl, lastSessionAt: PAST_AT } } })`（该会话**不在**列表里）→ `openRow("sample-paper.pdf")` → `waitPdfLoaded()` + `waitPage(1, 3)`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `session-gone` | 读 `.reader-discuss` 计数 / 新增提示容器（`.center-pill` / `.chat-panel` 内）/ warn 增量 / 现场文件 → `openSessionMenu()` → 读标记 → `closeSessionMenu()` → 截图 `r18-3-session-gone.png`（整窗） | ① `.reader-discuss` 计数 **0**（会话不在列表 ⇒ 静默隐藏）；② `.center-pill` / `.chat-panel` 内新增容器计数 **0** 且无新增提示文案（次要项 N1：`.notes-notice` 属笔记面板（`NotesPanel.vue:695`），资料库标签下恒不渲染，不作为判据）；③ `warnCount` 增量 **0**；④ 现场文件两键逐字保留（读侧不改写文件）；⑤ 菜单里 `.session-doc-mark` 计数 **0** | `{ phase, entryCount, noticeContainers, warnDelta, pair, markCount }` |
| `session-restored` | `setSessions(SESSIONS_GHOST)` → `openSessionMenu()` + `clickSessionItem("消融实验对照")` + `closeSessionMenu()`（既有切换触发的 `listSessions` 刷新列表）→ `waitDiscussText("继续讨论：丢失后恢复的会话 · 昨天")` → 读菜单标记 / 现场文件 → 截图 `r18-3b-session-restored.png`（`rectOfSelector(".center-pill", 12)`） | ⑥ 入口出现且文本与 `title` 逐字（`· 昨天`）；⑦ 菜单里 `.session-doc-mark` 计数 **1** 且 `title` 逐字 `最近讨论：sample-paper.pdf`；⑧ 现场文件两键与 `page` 逐字不变（列表刷新不写盘，且恢复不粘滞） | `{ phase, entryText, markCount, markTitle, pairBefore/After, page }` |

**场景 `r18-4`（组 `r18-workspace-isolation`，2 条 record，2 张截图）**

前置：`setSessions(SESSIONS_A)` → `enterWorkspaceWithState({ version: 1, lastDocPath: "sample-paper.pdf", documents: { "sample-paper.pdf": { page: 1, scale: 1, updatedAt: PAST_AT, lastSessionPath: SESSIONS_A[0].path, lastSessionAt: PAST_AT } } })` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` + `waitPage(1, 3)` → `openSessionMenu()` + `clickSessionItem("消融实验对照")` + `closeSessionMenu()`（MF2：显式把活动会话钉为**非**记录会话，不依赖前序场景的 `SESSION_STATE` 镜像残留）→ 先断言 `.reader-discuss` 在场（防空）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `workspace-b` | 读 A 文件 sha1 → `goHome()` → `enterWorkspace(LIBRARY_B_NAME)` → `waitTreeRows(1)` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` + `waitPage(1, 3)` → `waitState(STATE_FILE_B, (s) => s.documents["sample-paper.pdf"]?.page === 1)`（等一次落点写盘，消除 600ms 去抖竞态）→ 读入口 / B 文件 / 菜单标记 → 截图 `r18-4-workspace-b.png`（整窗） | ① B 工作区 `.reader-discuss` 计数 **0**（两条独立成立的理由：stub 的 `listSessions` 按根匹配 ⇒ B 列表为空；B 现场文件的目标条目无有效对 ⇒ `currentDiscussion === null`）；② B 现场文件的目标条目**在场**且 `hasOwnProperty("lastSessionPath") === false`（MF3：`openRow` 的落点写盘必写条目，判据用「在场且无两键」而非「无条目」）；③ 菜单 `.session-doc-mark` 计数 **0**；④ A 现场文件 sha1 不变（B 侧操作不触碰 A 文件）；⑤ `warnCount` 增量 **0** | `{ phase, entryCount, bState, markCount, aShaSame, warnDelta }` |
| `back-to-a` | `goHome()` → `enterWorkspace(LIBRARY_NAME)` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` → `waitDiscussText(...)` → 读 A 文件 → 截图 `r18-4b-back-to-a.png`（`rectOfSelector(".center-pill", 12)`） | ⑥ 入口恢复且文本逐字 `继续讨论：摘录与笔记走查 · 昨天`；⑦ A 文件两键逐字不变（回切不丢记录、不重复写） | `{ phase, entryText, pairSame }` |

**场景 `r18-5`（组 `r18-session-mark`，2 条 record，2 张截图）**

前置：与 `r18-4` 前置逐字相同（`setSessions(SESSIONS_A)` + `enterWorkspaceWithState(...)` 带对指向 `SESSIONS_A[0].path` + `openRow("sample-paper.pdf")` + `waitPdfLoaded()` + `waitPage(1, 3)`），但末尾的会话点击改为 `clickSessionItem("摘录与笔记走查")`（MF2：把活动会话显式钉为**记录会话**；已是活动会话 ⇒ 幂等 no-op），随后断言 `.reader-discuss` 计数 **0**（防空：入口在「活动会话 = 记录会话」下按设计隐藏）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `mark-visible` | `openSessionMenu()` → 读 `sessionMenuProbe()` → 截图 `r18-5-session-mark.png`（整窗，菜单打开）→ `closeSessionMenu()` | ① `.session-doc-mark` 计数恰 **1**、所在行标题逐字 `摘录与笔记走查`、`title` 逐字 `最近讨论：sample-paper.pdf`；② `消融实验对照` 行无标记；③ `新对话` / `重命名当前对话` / `历史对话` 文本在场，`.session-delete-btn` 计数 **1** 且 `title` 逐字 `删除该对话`（活动行无按钮、非活动行有）；④ `.reader-discuss` 计数 **0**（前置已显式把活动会话钉为记录会话；与 §0.6「活动行同样显示标记」不矛盾：**标记与活动无关、入口与活动有关**） | `{ phase, items, markCount, markTitle, deleteCount, entryCount }` |
| `mark-absent` | `openRow("long-book.pdf")` → `waitPdfLoaded()` → `openSessionMenu()` → 读标记与入口 → 截图 `r18-5b-mark-absent.png`（整窗，菜单打开）→ `closeSessionMenu()` → 切回 `sample-paper.pdf`（`openRow`）→ `waitPdfLoaded()` → 复读 | ⑤ 无记录文档下 `.session-doc-mark` 计数 **0** 且 `.reader-discuss` 计数 **0**；⑥ 切回后**标记恢复**（`title` 逐字 `最近讨论：sample-paper.pdf`）且 `.reader-discuss` 计数仍为 **0**（活动会话仍是记录会话 ⇒ 入口预期隐藏；与 ④ 同口径，MF2），且现场文件 `sample-paper.pdf` 条目两键逐字不变（读-改-写不丢对）；⑦ `warnCount` 增量 **0** | `{ phase, markCount, entryCount, restoredMark, restoredEntryCount, pairSame, warnDelta }` |

**验收判据**

1. 【离屏】5 组 record 全绿、12 张截图齐备（少一张即红）；新增 5 种 label 的条数与 §0.8 逐字一致（`r18-discuss-entry:3` / `r18-old-format:2` / `r18-session-missing:2` / `r18-workspace-isolation:2` / `r18-session-mark:2`）。
2. 【走查】既有场景函数体零改动（`git diff` 只显示：`SEL` 2 项、stub 会话与实时状态镜像扩展、新 helper、`r18-1`…`r18-5`、**§0.10 登记的 2 行既有断言更新**）；既有 174 张截图 / 253 条测量 / 69 种 label 零缺失。
3. 【离屏】新增截图的矩形取法与 R14 / R16 一致（整窗无 rect；`.center-pill` 用 `rectOfSelector(".center-pill", 12)`）。
4. 【走查】stub 既有行为零破坏：`grep -c "listSessionsCalls" pix/scripts/ui-shot.mjs` 不减、**未种入时**`listSessions` 对任何根都返回 `[]`（既有 R15 F16 场景的 `listSessionsDelta === 0` 断言不受影响；试不依赖种入根）；`pix/package.json` 零 diff。

**文件白名单条目**：`pix/scripts/ui-shot.mjs`（修改）。

### N103-3 基线与零缺失

动工前先跑基线（新目录 `pix-v06-r18-base`）→ 开发后跑验收（另一目录）；判据见 §0.9（R17 交付目录 174 张 / 253 条 / 69 种 label 零缺失、新增 12 张 / 11 条 / 5 种 label 齐备、退出码 0、`failure === null`、允许的位移逐项登记）。

**验收判据**

1. 【离屏】基线目录与验收目录各自的 `MANIFEST.json` / `MEASUREMENTS.json` 读数按 §0.9 逐项比对（`missingShots = []`、`missingLabels = []`）。
2. 【离屏】与现场 / 会话面最有判别力的既有场景继续通过：`resume-entry`（R6 续读入口三相位）、`reader-state` 相关场景（加载窗口 / 无记录 / 写入失败注入）、R15 F16（`agent_start` 不触发工作区同步）、R16 / R17 的 5 + 5 组全部既有 label。
3. 【走查】任何非预期差异（尤其 §0.9 白名单外的位移与样式）必须在 dev 档逐项登记（改哪一项、为什么、基线读数与改后读数）。

### N103-4 工程门与零残留

**验收判据**

1. 【check】`CHECK_EXIT=0`（无 `any`、无内联动态 import、全部顶层 import；新增类型 / 动作 / 处理器全链路必填）。
2. 【走查】零新 IPC、零新依赖：`git diff` 中 `pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`、`pix/src/main/session-bridge.ts`、`pix/src/renderer/stores/session-store.ts`、`pix/src/renderer/stores/project-store.ts`、`pix/package.json`、`package-lock.json`、`pix/build/**`、`packages/**` 全为空；`grep -c "readerStateSave\|readerStateLoad" pix/src/main/preload.ts` 与基线相同。
3. 【走查】`git status --short` 只出现 §7 白名单内的文件（新建的 `docs/pm/R18-*.md` 与修改的源码 / 脚本）。
4. 【走查】仓库内无临时脚本、无临时产物、无调试日志（PRD §5.10）；`ui-shot.mjs` 的结束自检（截图集合与清单双向相等 + 白名单外条目即失败）继续生效；`smoke-notes.mjs` / `smoke-view.mjs` 运行后 `%TEMP%` 自建目录被删除。

---

## 6. 反需求（本轮明确不做）

1. **不改内核会话文件**：不写 / 不解析 / 不重命名 / 不删除 / 不复制 `.jsonl` 会话文件；只读 `listSessions` 的元数据 + 复用既有 `switch_session` 命令。会话文件的唯一写者仍是内核。
2. **不做跨工作区会话聚合**：会话列表恒为当前工作区的列表；不做「跨库搜会话」「最近会话全局榜」；不做跨工作区会话去重 / 合并 / 迁移。
3. **不做「自动恢复上次会话」**：打开文档时不得自动切换、自动新建或自动恢复会话；唯一触发是用户点击 `.reader-discuss`（或既有会话菜单）。也不做「打开工作区自动进入上次会话」。
4. **不做会话内文档索引**：不扫会话内容、不解析消息、不建立「会话 → 文档」的反向索引表、不新增索引文件；标记只来自**现场记录 + 会话列表**的路径比较。
5. **不改 `notes.json` 与笔记数据面**：`notes.json` 格式与写入协议、`notes-stat` 语义、`.notes-stale` 刷新链路、笔记面板与报告链路零 diff。
6. **不引入依赖、不改 lockfile、不改 `packages/**`、不改 electron-builder 配置**：不引入 `date-fns` 之类的格式化库（时间文案复用既有 `formatSessionTime`）。
7. **零新 IPC**：不为会话记录新增 IPC 通道（复用 `reader-state-save` 的可选字段）；不改 `ipcMain` 守卫形状；不改 preload 方法数。
8. **不改既有冻结字面**：`.reader-resume` 的文案与结构、`.pill-*` / `.notes-*` / `.pdf-*` / `.map-*` 既有类名与文案、会话菜单既有类名与文案（唯一登记变更 = §0.6 的 `#append` 槽守卫位置）、R14 的 `notes-stat` 语义、R16 / R17 的全部冻结项。
9. **不做第二种降级形态**：会话不存在 / 未就绪 / 库外一律**静默隐藏**；不弹 toast、不加角标、不写第二种提示容器、不新增空态文案。
10. **不做第二个入口**：阅读区只有 `.reader-discuss` 一枚新元素（不落空态区第二枚按钮、不落 `reader-header`、不在 PDF 覆盖层加压角标）。
11. **不为「看起来高级」加动画 / 过渡 / 新变量**：不新增 `--pix-*` 变量、不加 `transition` / `animation` / 淡入淡出 / 悬停浮层；`title` 只用原生 tooltip。
12. **不删除、不重命名、不改写既有离屏场景与截图**（PRD §5.7）：既有 174 张 / 253 条 / 69 种 label 零缺失，只允许追加（**唯一登记例外 = §0.10 登记 1**：`map-chapter-filter` 相位 `injection` 的 2 行既有断言更新，负责人已追认并写明判别力）；`smoke-view.mjs` 零改动，`smoke-notes.mjs` 只追加 6 条。
13. **不做「每次翻页都写记录」的实现**：会话记录只在发送成功时写一次；翻页 / 缩放 / 打开文档沿用既有 600ms 去抖写入且不携带两键（未携带 ⇒ 保留，不得清空）。
14. **不写死代码**：不新增未被调用的分支（例如「会话文件不存在时的重建入口」「自动清理过期记录」）。

---

## 7. 文件白名单（逐文件 + 改动点）

| # | 文件 | 动作 | 对应需求 | 改动点（不得越界） |
| --- | --- | --- | --- | --- |
| 1 | `pix/src/shared/types.ts` | 修改 | N100-1 | `ReaderDocState` 与 `ReaderStateSaveDraft` 各新增 `lastSessionPath?: string` / `lastSessionAt?: number`（含 §0.3 的逐字注释）；其余类型（`ReaderStateFile` / 错误码 / 降级原因 / 结果类型）**零改动** |
| 2 | `pix/src/main/reader-state-store.ts` | 修改 | N100-1…N100-4 | 新增 `MAX_SESSION_PATH_LENGTH = 2048` 与 `isValidSessionPath` / `isValidSessionAt`；`parseDocState` 成对带回两键；`saveReaderState` 的「有效对 ⇒ 覆盖 / 否则 ⇒ 保留」与目标条目构造；**零改动**：四条降级语义、`DEGRADE_MESSAGES` / `ERROR_MESSAGES`、`resolveLastDoc` / `toRelativeDocPath` / `writeFileAtomic` / `uniqueBackupPath` / 序列化缩进、既有 `page` / `scale` / `updatedAt` / `lastDocPath` 语义、函数体内零 await |
| 3 | `pix/src/renderer/stores/reader-state-store.ts` | 修改 | N100-4 / N100-5 / N101-2 | 新增 `DiscussionLink`、动作 `noteDiscussion(absPath, page, scale, sessionPath)`（五条守卫 + 立即提交 + 乐观更新 + **经 `submit()` 提交、复用其 `saveEpoch` 竞态守卫与 warn 语义**）、computed `currentDiscussion`（唯一派生点，暴露在返回对象）；`applyLocal` 追加「未携带 ⇒ 保留」；`submit` 的 payload 扩展为**可选**携带两键（新增可选参数）；**零改动**：`capture` 三闸、`submitIfChanged` 比较字段、`submit` 的 `epoch` 竞态守卫语句（`:111` / `:119` / `:126`）、`loadReaderState` / `progressPageFor` / `requestRestoreFor` / `noteLanding` / `noteChange` / `flush` / `resetState` 的既有分支 |
| 4 | `pix/src/renderer/components/workspace/ReaderPanel.vue` | 修改 | N101-1…N101-4 | 新增：`discussEntry` computed（四闸 + 活动会话排除）、`openDiscussion()`、emit 名 `open-session`、`.center-pill` 的 Teleport 与 `.reader-discuss` 三处样式、`docPathKey` / `formatSessionTime` 的顶层 import；**零改动**：`.reader-resume`（模板 `:217` / 样式 `:383` / `:400` / `resumeEntry` / `openResumeEntry`）、`.reader-empty` 的空态结构、`.map-toggle` 的 Teleport 与 `mapToggleReady`、PDF / 文本 / 失败分支 |
| 5 | `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改 | N100-4 / N102-1 / N102-2 | 新增：`send()` 内的 `readScale` / `sendingSessionPath` 快照，**流式分支的 `return` 改为 `if/else`（MF4，唯一登记的控制流调整）、try 尾部单一 `noteDiscussion` 调用**（catch 不得调用）、N102 的两个 computed 与谓词、`#append` 槽内的 `.session-doc-mark`（含「槽常驻 + 按钮级守卫」的登记变更）与 1 条样式、`useReaderStateStore` / `docPathKey` 的顶层 import；**零改动**：`<reading_context>` 载荷构造、`appendOptimisticUserMessage` / `failOptimisticUserMessage`、会话菜单既有类名与文案、`session-delete-btn` 的两击确认、`onSelectSession` / `isActiveSession` |
| 6 | `pix/src/renderer/pages/WorkspacePage.vue` | 修改 | N101-3 | 新增处理器 `onOpenDiscussionSession(sessionPath)`（解析 + 两条 no-op 守卫 + `void onSwitchSession(session)`）与 `ReaderPanel` 上的 `@open-session` 绑定；**零改动**：`onSwitchSession` / `onNewSession` / `onDeleteSession` / `openDocumentFromLibrary` / `selectLeftTab` / 两个 token watcher / `goHome` 的既有语句 |
| 7 | `pix/scripts/smoke-notes.mjs` | 修改 | N103-1 | `runReaderStateStore` 内追加 #6–#11（夹具常量、9 种越界形态、两条目 / 三条目文件、备份名回归）；**零改动**：既有 #1–#5、其它 9 组、`files` / `required` / `allowed` / 编译选项 / 自清理协议 |
| 8 | `pix/scripts/ui-shot.mjs` | 修改 | N103-2 | `SEL` 追加 2 项（**72 → 74**）；stub 新增 `setSessions(list, root = LIBRARY_DIR)` / `switchSessionCalls`、`listSessions` 按根返回种入列表、`switch_session` 记录 + `SESSION_STATE` 镜像、reader-state 镜像支持两键与 payload 扩展；新增 helper（`openSessionMenu` / `closeSessionMenu` / `sessionMenuProbe` / `clickSessionItem` / `waitDiscussText` / `waitState`）与 `SESSIONS_A` / `SESSIONS_GHOST` 夹具；新增 `r18-1`…`r18-5`（5 组 11 条 record、12 张截图）；**零改动**：既有 **72** 个 `SEL` 键、既有场景函数体、既有 helper、既有截图与 label、启动守卫与结束自检 |
| 9 | `docs/pm/R18-*.md` | 新建 | — | 本档（`R18-req.md`）与后续 `R18-review.md` / `R18-design.md` / `R18-dev.md` |

**不改（登记为不动）**：`pix/src/main/ipc-handlers.ts`（守卫形状与既有 handler 零 diff；额外字段原样透传）、`pix/src/main/preload.ts`、`pix/src/main/session-bridge.ts`、`pix/src/renderer/stores/session-store.ts`、`pix/src/renderer/stores/project-store.ts`、`pix/src/renderer/stores/reader-store.ts`、`pix/src/renderer/utils/session-title.ts`、`pix/scripts/smoke-view.mjs`、`pix/package.json`。

**范围外（任何情况下不动）**：`packages/**`、`package-lock.json`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/src/renderer/assets/styles/**`（含 `variables.css`）、`pix/src/renderer/components/workspace/{PdfViewer,PdfSearchPanel,PdfSelectionQuickAsk,KnowledgeMap,NotesPanel,LibraryPanel,ShortcutOverview}.vue`、`pix/src/renderer/stores/{notes-store,settings-store,auth-store}.ts`、`pix/src/renderer/utils/**`、`.pix-read/notes.json` 与其写入链、`pix/resources/**`、`docs/pm/**` 的历史档件、`.gitignore`、`README.md`。

---

## 8. 风险 Top3 与判定方式

**R1「读-改-写把其它文档的记录吃掉」** —— 本模块最容易翻车的地方：`saveReaderState` 的读-改-写把**其它条目**从解析结果带过，而 `parseDocState` 目前**只返回 `{page, scale, updatedAt}`** ⇒ 若忘记把合法对带回，**每次翻页保存都会静默清空其它文档的讨论记录**（而且旧字段读写全部正常，问题只在「换一篇文档后入口消失」时暴露）。

- 判定：烟测-主进程 #7（其它条目两键逐字不变）与 #6（回读）；离屏 `r18-1` 相位 `send-records` 判据 ③（预置的第二条目不被发送写盘波及）；`r18-2` 相位 `open-switch-no-write`（落点写盘不得改动两键的存在性）。
- 失败信号：在 A 文档上发送一次，B 文档此前记录的入口消失；`readState` 里其它条目的两键变成 `undefined`。

**R2「入口指向错的东西 / 点不开」** —— 三类典型：写入时机漂移（打开文档或切换会话就改写记录 ⇒ 入口指向从未讨论过的会话）；活动会话显示入口（点了「没反应」）；记录会话不在列表却仍渲染（点了抛错或切到别的会话）。此外「会话路径比较」若用 `===` 而不是比较键（大小写 / 分隔符差异）会误判。

- 判定：`r18-1` 相位 `send-records`（活动会话 ⇒ 隐藏）、相位 `entry-visible-and-click`（切换后出现、点击后 `switchSessionCalls().paths` 逐字、零写入）、相位 `send-failed`（失败不写）；`r18-2` 相位 `open-switch-no-write`（打开 / 切换不写）；`r18-3` 相位 `session-gone`（静默隐藏）与 `session-restored`（恢复不粘滞）；`r18-4`（跨工作区不串、回切恢复）。
- 失败信号：打开文档后入口文本变成当前会话；点入口后右侧会话没变；会话被删后入口仍在且点击报错；A 库的入口在 B 库出现。

**R3「旧文件与既有链路被新字段破坏」** —— 新字段若走「严格校验」（例如要求路径必须存在、必须是相对路径、必须是 `.jsonl`）或把非法值升级为 warn / 降级，会直接违反 PRD §3（旧文件零报错）与 R6 的静默降级口径；另一侧的风险是「半截字段」（只写 `lastSessionPath`）在后续读取时被错误地当成有效记录。

- 判定：烟测-主进程 #8（旧格式零 err/warn、不造字段）、#9（越界丢弃）、#10（读侧成对裁剪）、#11（corrupt / 版本回归）；走查 `grep -c "await" pix/src/main/reader-state-store.ts` = 1（仅头部注释，与基线相同）与降级分支零 diff；离屏 `r18-2` 相位 `old-format-silent`（warn 增量 0）。
- 失败信号：旧文件上出现新的 `[reader-state]` warn；旧文件被写入 `lastSessionPath: null`；只有一侧的键出现在 JSON 里；版本不符的文件被新代码覆盖。

**次级风险（不占 Top3）**：① `.center-pill` 变长后与 `.shortcut-toggle` / `.map-toggle` 挤行导致 `pill-label` 截断（由 §0.9 内容目视比对与判据 N101-1 判据 2 兜住；`max-width: 240px` 的省略号是登记取舍）；② r18 场景里「刚刚」的 60s 窗口**不再用逐字断言承担**：相位 2 用「前缀 + 运行时允许集」判定，相位 3 的「不写」证据落在现场文件 `lastSessionAt` 上（MF5）；种子夹具一律用 `PAST_AT` ⇒ `昨天`，档位确定；③ 会话列表刷新时机（`projectStore.sessions` 只在挂载 / 发送 / 切换 / 删除后刷新）⇒ 会话文件在外部被删除时入口可能短暂残留，直到下一次刷新（登记为接受的时延，不做监听）；④ stub 的 `switch_session` 镜像只覆盖「命中种入列表」的路径（既有场景不触发该分支，零影响）；stub 的 `listSessions` 按根匹配（未种入 ⇒ 恒 `[]`，既有场景行为等价）。

---

## 9. 开放问题（需负责人确认，不阻塞本档定稿）

1. **入口落点的最终裁决**：本档冻结为 `.center-pill`（§0.0 第 2 条，附三条实读证据）。若负责人要求回到 PM 括号内的「空态区」，则入口只在**未打开文档**时可点，与 PRD §7 判据 3 的「打开一篇读过的文档时」冲突 ⇒ 需同时改 §0.5、N101 全节与 `r18-1` / `r18-4` 的断言面（并接受「打开文档后无法一步回到讨论」）。
2. **活动会话是否隐藏入口**：本档冻结为**隐藏**（避免死路点击，§0.5）。若改判为「始终显示 + 点击成为 no-op」，需改 §0.5 显示条件、`r18-1` 相位 `send-records` 判据 ⑤ 与相位 `entry-visible-and-click` 判据 ⑫。
3. **现场记录的时间用发送时刻还是会话修改时刻**：本档冻结为**发送时刻**（`lastSessionAt`，§0.3；与「最近讨论」语义一致）。若改为显示 `session.modified`，则现场只需存路径，需删掉 §0.3 的一键与烟测 #6/#9/#10 的相关判据。
4. **是否显示文档名而非会话标题**：本档冻结为**会话标题 + 时间**（`继续讨论：{title} · {time}`；`{title}` 与历史对话菜单同一规则，重命名后即时跟随）。若改判为显示文档名，需改 §0.5 与 `r18-*` 的字面断言。
5. **N102 是否覆盖「会话 → 任意文档」的反向关联**：本档冻结为**只标注与当前文档相关的会话**（§0.6，成本最低）。若要求「每条会话都能看出关联哪篇文档」，需要把「会话路径 → 文档列表」的聚合压进 `currentDiscussion` 之外的新派生（并新增多条文档夹具与断言）。
6. **入口是否可关闭**：本档冻结为「有记录即常驻（无关闭开关）」。若希望可关闭，需新增易失状态（不得落在 `notes.json`；只能进 `reader-state.json` 的新可选字段），并同步 §0.3 / §0.5 与烟测断言。
