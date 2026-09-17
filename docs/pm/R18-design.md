# PiX-Read R18 设计档 · 对话锚定（N100–N103）

> 上游：`docs/pm/R18-req.md`（需求 N100–N103，含 §0 定稿修订 MF1–MF10 与 §0.0–§0.9 冻结契约）、`docs/pm/R18-review.md`（独立需求评审；评审对象 HEAD = `1561cb4`）、`docs/pm/PRD-V0.6.md` §1 缺口 3 / §2 R18 行 / §3（现场文件允许新增可选字段）/ §4 反需求 3/5/6/7 / §5 工程红线 / §7 判据 3、`docs/pm/R14-design.md` 与 `docs/pm/R16-design.md`（**本档的结构范本**：§0 口径与证据面 / §1 契约冻结表 / §2 与既有冻结面的关系 / §3 失败路径表 / §4 文件级清单 / §5 验证方案 / §6 风险 Top3 / §7 开发分工 / §8 视觉验收要点）、`docs/pm/R17-design.md`（`.center-pill` 入口既有范式与「工作区阅读区标题栏被隐藏」的事实）。
> 本档是「可直接开工、可判定」的定稿设计：把 R18-req §0.2–§0.9 的冻结契约落到实现层粒度 —— 现场两键的类型与值域谓词、读侧成对裁剪与写侧「覆盖 / 保留」的参考实现、渲染层 `noteDiscussion` / `currentDiscussion` 的守卫顺序与提交路径（含 `saveEpoch` 复用）、`.reader-discuss` 的逐字 DOM / 样式 / 四闸与点击链路、`.session-doc-mark` 与 `#append` 槽守卫位置调整的 DOM 事实、以及烟测 6 条与离屏 5 场景 11 条 record / 12 张截图的逐条判据。
> **本档不改任何代码**，只新增这一份文档；本轮允许的写操作仅 `docs/pm/R18-design.md`。本步实跑了 `cd pix && npm run check`（`CHECK_EXIT=0`）与只读命令；**未跑离屏、未跑基线**（§0.4）。
> 判定工具（与需求档一致）：【走查】只读 `git status` / `git diff` / `git show` 与文件内容（含 `grep -c` / `grep -rn` 计数）；【check】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error（唯一工程门）；【烟测-主进程】`npm run smoke:notes`（10 组 65 条 → **10 组 71 条**）；【烟测-渲染】`npm run smoke:view`（9 组 74 条，**本轮零改动**，只作回归）；【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + 既有 174 张 / 253 条 / 69 种 label 零缺失 + 新增 5 组 11 条 record 全绿 + 12 张新截图齐备。

---

## 0. 口径与证据面

### 0.1 本档事实基线（写档当天的真实读数：只读核对 + 本步允许的实跑）

| 事实 | 证据（全部为本次真实读数） |
| --- | --- |
| 工作树与 HEAD | `git status --short` ⇒ `?? docs/pm/R18-req.md` / `?? docs/pm/R18-review.md`（本档落盘后追加 `?? docs/pm/R18-design.md`）；`git log --oneline -1` ⇒ `1561cb4 feat(reader): 快捷键总览与选区模板动作；修复选中文本在真实键入路径丢失（V0.6 R17）` |
| 唯一工程门当前 0 error（**本步实跑**） | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0` |
| 文件规模（本步 `wc -l`） | `ReaderPanel.vue` **478** / `ChatPanel.vue` **1797** / `WorkspacePage.vue` **472** / `shared/types.ts` **631** / `main/reader-state-store.ts` **293** / `renderer/stores/reader-state-store.ts` **272** / `ipc-handlers.ts` **910** / `preload.ts` **196** / `project-store.ts` **150** / `notes-path.ts` **160** / `session-title.ts` **88** / `useRpc.ts` **533** / `smoke-notes.mjs` **1411** / `smoke-view.mjs` **1074** / `ui-shot.mjs` **11689** |
| 零缺失比对基线（本轮的参照） | 目录 `C:/Users/86157/AppData/Local/Temp/pix-v06-r17c-review/shots`：`MANIFEST.json` ⇒ `shots.length = 174`、`failure = null`；`MEASUREMENTS.json` ⇒ 长度 **253**、`label` 去重 **69** 种；目录内 png **174**（与清单一致）。R16 五组 = `r16-page-badge:3` / `r16-page-anchor:3` / `r16-note-highlight:3` / `r16-highlight-coexist:2` / `r16-degrade:3` = 14 条；R17 五组 = `r17-shortcut-overview:3` / `r17-shortcut-geometry:2` / `r17-template-actions:3` / `r17-template-geometry:3` / `r17-selection-snapshot:5` = 16 条（复读命令见 §5.4） |
| 既有烟测面（本轮基线） | `grep -c "  check(" pix/scripts/smoke-notes.mjs` 实读 = **65**（10 组：`runUndoRoundtrip` `:178` / `runUndoFailures` `:261` / `runUndoSlotLifecycle` `:415` / `runExportAndEmpty` `:564` / `runReportRender` `:616` / `runReportFiles` `:741` / `runReportFailures` `:847` / `runNotesStat` `:978` / `runLibraryRootContainment` `:1111` / `runReaderStateStore` `:1226`）；`grep -c "  check(" pix/scripts/smoke-view.mjs` 实读 = **74**（9 组，本轮零改动） |
| 主进程读者现场现状（`pix/src/main/reader-state-store.ts`，293 行） | `SCHEMA_VERSION = 1` `:28`、`MIN_SCALE` / `MAX_SCALE` `:30-31`、`ERROR_MESSAGES` `:33`、`DEGRADE_MESSAGES` `:42`、`warn` `:57`、`stateFilePath` `:62`、`emptyState` `:68`、`docPathKey` `:78`、`isStoredDocPath` `:91`、`isValidPage` `:97`、`isValidScale` `:101`、`toRelativeDocPath` `:106`、**`parseDocState` `:115-124`**（只产 `{page, scale, updatedAt}` 三字段）、`resolveLastDoc` `:127`、`parseReaderState` `:142`、`readStateFile` `:165`、`writeFileAtomic` `:185`、`serializeState` `:204`、`uniqueBackupPath` `:216`、`loadReaderState` `:229`、**`saveReaderState` `:251`**（目标条目构造在函数尾：`documents: { ...current.documents, [key]: { page, scale, updatedAt: Date.now() } }`）；`grep -c "await"` 实读 = **1**（仅头部注释 `:5`） |
| 渲染层现场 store 现状（`pix/src/renderer/stores/reader-state-store.ts`，272 行） | `DEBOUNCE_MS = 600` `:25`、`documents` `:53`、`lastDoc` `:55`、`ready` `:57`、`degraded` `:58`、`saveEpoch` `:63`（注释 `:62`）、`snapshot` `:65` / `committed` `:66` / `settledKey` `:67`、`toSnapshot` `:73`、`relativeDocPath` `:80`、`resolveLastDoc` `:87`、`applyState` `:96`、`applyLocal` `:102`、**`submit` `:110-129`**（`const epoch = saveEpoch` `:111`；两处 `if (epoch !== saveEpoch) return;` `:119` / `:126`）、**`submitIfChanged` `:131-141`**（比较字段 = `key` + `page` + `scale`）、`capture` `:143`、`loadReaderState` `:158`、`progressPageFor` `:191`、`requestRestoreFor` `:202`、`noteLanding` `:215`、`noteChange` `:223`、`flush` `:234`、`resetState` `:243`、返回对象 `:259-271`（`documents,` `:260` / `resetState,` `:270`）；`grep -c "readerStateSave"` 实读 = **1**（仅 `submit` 内 `:113`） |
| 入口落点现状（`ReaderPanel.vue`，478 行） | `defineEmits` `:35-37`（仅 `open-document`）、`resumeEntry` `:65`、`openResumeEntry` `:150-152`、`mapToggleReady` `:43` / 就绪判定 `:160`（`!!document.querySelector(".center-pill")`）、`onBeforeUnmount` `:170`、`.map-toggle` Teleport `:193-205`、`.reader-empty`（`v-if="!filePath"`）`:213`、`.reader-resume` 模板 `:217`、样式 `.reader-resume` `:383` / `.reader-resume:hover` `:400`；样式插入点：`.map-toggle:disabled` 结束于 `:346`、`.reader-main` 起于 `:348` |
| 工作区页现状（`WorkspacePage.vue`，472 行） | `currentSessionPath = computed(() => projectStore.currentSession?.path)` `:49`、`syncWorkspaceState` `:58-74`、`onSwitchSession` `:170-177`（`clearSession` → `rpc.switchSession(session.path)` → `setCurrentSession` → `syncWorkspaceState({loadMessagesIfEmpty:true})`）、`openDocumentFromLibrary` `:198-203`、`selectLeftTab` `:204-211`、`goHome` `:251-266`、`ReaderPanel` 挂点 `:332-336`（`@open-document="openDocumentFromLibrary"`）、`ChatPanel` 挂点 `:340-347`、`.center-pill` 模板 `:321-331`（子元素 = 可选 `.pill-icon-btn`（`v-if="leftCollapsed"` `:323`）+ `.pill-label` `:330`）、**`.reader-under-pill :deep(.reader-header) { display: none; }` `:464-467`**（工作区里阅读区标题栏被隐藏 ⇒ 入口不得放 `reader-header`）；`absoluteDocPath, docPathKey` 已在 `:27` 顶层 import |
| 会话面现状（`ChatPanel.vue`，1797 行） | `paneTitle` `:209`、`historySessions = computed(() => props.sessions ?? [])` `:210`、`send()` `:384-447`：`readFilePath = readerStore.filePath` `:392` / `readPage = readerStore.page` `:393`、`if (isStreaming.value) {` `:426`、`await rpc.sendSteer(...)` `:427`、`return;` `:428`、`await rpc.sendPrompt(message, filePaths, sendImages, text)` `:430`、`if/else` 之后 try 内无其它语句、`} catch (err) {` `:431`、`} finally {` `:443-446`；`isActiveSession` `:864-866`、`onSelectSession` `:872-875`、会话菜单模板 `:928-979`（`.pill-session` `:930`、`新对话` `:938`、`重命名当前对话` `:944`、`历史对话` subheader `:949`、`v-for` 列表项 `:951-975`、`#append` 模板级守卫 `v-if="!isActiveSession(session) && !isStreaming"` `:960`、`.session-delete-btn` `:963`、两击确认 `:965-967`、`暂无历史对话` `:976`）、样式 `.session-menu-divider` `:1330`、`.session-delete-btn` `:1334`、`.session-delete-btn:hover, .session-delete-btn.armed` `:1347-1351`、`.chat-messages` 起于 `:1353` |
| 会话数据面现状 | `project-store.ts`：`sessions` `:25`、`listSessions()` `:90-106`（`api().listSessions(project.path)`；根变了就丢弃结果）、`setCurrentSession` `:108`、`syncCurrentSession` `:112-121`；`SessionInfo`（`shared/types.ts:288-297`）；`session-title.ts`：`deriveSessionTitle`（`name` 优先）/ `formatSessionTime`（`刚刚` = `diff < 60_000`）/ `truncateTitle`（28 字符 + `…`）；`docPathKey(path: string): string`（`notes-path.ts:18-20`）**不接受 `undefined`** |
| 渲染层唯一会话切换通道 | `useRpc.ts`：`sessionState` ref `:25`、`refreshSessionData` `:85`、`switchSession(sessionPath)` `:290-296`（`sendCommand({ type: "switch_session", sessionPath })`）；`grep -rn "switch_session" pix/src/renderer \| wc -l` 实读 = **1** |
| IPC 面现状（零改动目标） | `ipc-handlers.ts`：`isReaderStateDraft` `:301-312`（只校验 `docFilePath` 非空串 + `page` / `scale` 为有限数；**额外字段原样透传**）、`reader-state-load` `:553`、`reader-state-save` `:555-557`、`notes-stat` `:547`；`grep -c "reader-state-save" pix/src/main/ipc-handlers.ts` 实读 = **1**；`grep -rn "reader-state-save" pix/src \| wc -l` 实读 = **2**（`ipc-handlers.ts:555` + `preload.ts:176`） |
| 离屏脚本现状（`scripts/ui-shot.mjs`，11689 行） | `SEL` `:47-128`（**72** 项，实读 `sed -n '47,128p' scripts/ui-shot.mjs \| grep -cE '^  [a-zA-Z]+: '` = 72；末二项为 N97-4 的 `contextChip` / `contextChipRemove` `:126-127`，`};` 在 `:128`）；`CONFIG.root = LIBRARY_DIR` / `rootB` `:437-439`；`SESSION_STATE` `:637-651`（`sessionFile = path.join(CONFIG.root, ".pix-read", "session-demo.jsonl")` `:645`、`sessionId = "sess-demo"` `:646`、`sessionName = "摘录与笔记走查"` `:647`）；`handleCommand` `:666-689`（prompt/steer 记录 + 三种注入 `:668-679`；**`switch_session` 与 `new_session` / `clone` / `fork` 同支只返回 `{cancelled:false}`、不记录、不改 `SESSION_STATE`** `:685-687`）；stub 的 reader-state 镜像：`STATE_DIR` / `STATE_FILE_NAME` `:699-700`、`MIN_SCALE` / `MAX_SCALE` `:701-702`、`activeRoot` `:705`、`readerStateCalls` `:709`、`stateFilePath` `:715-717`、`emptyState` `:724`、`docPathKey` `:728`、`isStoredDocPath` `:732`、`isValidPage` `:738`、`isValidScale` `:742`、`parseDocState` `:746-751`、`normalizeState` `:754-772`、`readStateFile` `:775`、`writeStateFile` `:797-801`、`listSessionsCalls` `:503`、`listSessions` `:895`（**恒空列表**）、`readerStateLoad` `:1134-1146`、`readerStateSave` `:1147-1167`、`__pixStub` `:1185-1258`（`listSessionsCalls` `:1239`、`setReaderState` `:1243`、`readerStateSaveCalls` `:1257`、`readerStateFilePath` `:1258`）；`writeFixtures` `:397-420`（**每次运行删除 A/B 两库的 `reader-state.json`** `:409-410`）；`runReaderStateScenarios` `:1601-11532`（收口 `restoreStandardSeed()` `:11531` + `}` `:11532`）；场景内既有 helper：`STATE_FILE_A` / `STATE_FILE_B` `:1605` / `:1606`、`js` `:1602`、`waitFor` `:1608`（默认 20s、120ms 轮询）、`sleep` `:1603`、`record` `:1619-1622`（**先落测量再抛错**）、`textOf` `:1624`、`has` `:1628`、`countOf` `:1629`、`readState` / `writeState` / `removeState` `:1631-1637`、`entry` `:1640`、`saveCalls` `:1641`、`lastPayload` `:1642`、`warnCount` `:1643`、`waitTreeRows` `:1678`、`waitPdfLoaded` `:1680`、`waitPage` `:1681`、`waitResumeEntry` `:1686`、`goHome` `:1696`、`enterWorkspace` `:1706`、`openRow` `:1721`、`clickNext` / `clickPrev` `:1730` / `:1731`、`clearStateA` `:2394`、`setDraft` `:2544`、`typeAndSend` `:2556`、`rectOfSelector` `:2579`、`sendCalls` / `clearSendCalls` / `setSendFailure` / `setNotesDeleteFailure` / `lastErrorText` / `waitSendCalls` `:3268-3281`、`enterCleanWorkspace` `:3407-3415`、`restoreStandardSeed` `:3426-3430` |
| 既有场景零破坏的两个前提（本步实读） | ① `grep -n "switch_session\|pill-session" scripts/ui-shot.mjs` ⇒ 只有 stub 的 `handleCommand` 分支 `:685` 与 `SESSION_STATE.sessionFile` `:645`，**既有场景从不打开会话菜单、从不发 `switch_session`**；② `writeFixtures` `:409-410` 每轮删除 A/B 的 `reader-state.json` ⇒ 既有夹具条目**都不带两键** |
| 命名预检（本轮全部为**新增**名字，`pix/src` 内当前 0 命中；复读 `grep -rn "<名字>" pix/src \| wc -l`） | `reader-discuss` / `session-doc-mark` / `lastSessionPath` / `lastSessionAt` / `noteDiscussion` / `currentDiscussion` / `MAX_SESSION_PATH_LENGTH` / `继续讨论` / `最近讨论` / `open-session` / `mdi-forum-outline` / `mdi-file-link-outline` 各 **0**。既有冻结字面当前计数（改写即为回归）：`grep -rn "reader-resume" pix/src \| wc -l` = **3**（模板 1 + 样式 2）、`grep -rn "pill-session" pix/src \| wc -l` = **3**（模板 1 + 样式 2）、`grep -rn "session-delete-btn" pix/src \| wc -l` = **4**、`grep -rn "历史对话" pix/src \| wc -l` = **2** |
| 图标存在性（逐字冻结前的实读） | `pix/node_modules/@mdi/font/css/materialdesignicons.css` 内 `mdi-forum-outline` / `mdi-file-link-outline` 各 **1** 处存在 |
| Vuetify 事实（`#append` 槽常驻的 DOM 影响，实读源码） | `node_modules/vuetify/lib/components/VList/VListItem.js:222-223`（`hasAppendMedia = !!(props.appendAvatar \|\| props.appendIcon)`；`hasAppend = !!(hasAppendMedia \|\| slots.append)`）⇒ `:300-303` **无条件创建** `v-list-item__append` 容器；`VListItem.css:6` 的 `grid-template-columns: max-content 1fr auto` ⇒ 空容器零宽、视觉零位移 |
| 菜单关闭机制（helper 设计依据，实读源码） | `node_modules/vuetify/lib/components/VOverlay/VOverlay.js:193-212`：`isActive` 期间在 **window** 上挂 `keydown`，`e.key === 'Escape' && globalTop.value` ⇒ `isActive = false`；VMenu 默认 `closeOnContentClick: true`（`node_modules/vuetify/lib/components/VMenu/VMenu.js:25`）作用在 activator 上 ⇒ **点击列表项是否自动关闭菜单不由本档假设**：`closeSessionMenu()` 写成「列表不在场 ⇒ 立即返回；否则派发 Esc 并等消失」的幂等实现（§1.5.4） |
| 阅读区既有 Esc 语义（登记，供 helper 幂等性论证） | `PdfViewer.vue:434` / `:439`（captureMode / searchOpen 各自处理，**不 stopPropagation**）；`ShortcutOverview.vue:56`（注释逐字「关闭浮层但绝不阻断阅读区既有 Esc 语义（不 preventDefault、不阻断冒泡）」）⇒ 在 body 上冒泡派发 Esc 不会被任何既有 handler 吞掉 |
| 本轮未执行（本步禁止 / 不必要） | 离屏 `ui-shot.mjs`、基线复跑、`npm run build` / `npm test` / `npm run package` / `npm run dev`；`npm run smoke:notes` / `smoke:view` 未在本步复跑（读数取自 `R17-dev.md` 交付终态与本步 `check` + 计数命令） |

### 0.2 R18-req 定稿修订（MF1–MF10 + 次要项 N1–N7）在本档的实现级落点

| 编号 | 需求档结论 | 本档实现级落点 |
| --- | --- | --- |
| MF1（相位 ⑤ 防空写盘不可能） | 改为「翻页制造一次真实变化」 | §1.5.5 `r18-2` 相位 `open-switch-no-write` 步骤与判据（`clickNext()` → `waitPage(3, 3)` → `waitState(page === 3 && updatedAt > SEED_AT)`） |
| MF2（跨场景会话镜像残留） | 三个场景前置各加一次显式会话行点击；`r18-5` 判据 ⑥ 改口径 | §1.5.4 `clickSessionItem(title)`（幂等）；§1.5.5 `r18-1` / `r18-4` / `r18-5` 前置逐字 |
| MF3（B 现场文件条目必在场） | 写死「在场且无两键」+ `waitState` 消竞态 | §1.5.5 `r18-4` 相位 `workspace-b` 判据 ② |
| MF4（唯一调用点 vs 真实控制流） | 采纳修法 ②：`return` → `if/else` + 单一调用点 | §1.2.4 与 §2.2 第 3 行（唯一登记的控制流调整，逐字） |
| MF5（60s 窗口无护栏） | 前缀 + 运行时允许集；相位 3 落数据面 | §1.5.4 `waitDiscussText(prefix)` + `discussTimeAllowSet(...)`；§1.5.5 `r18-1` 判据 ⑦ / ⑮ |
| MF6（缺 `saveEpoch` 竞态守卫） | `noteDiscussion` 复用 `submit()` 的提交路径 | §1.2.2 / §1.2.4（`submit(next, stamp)` 单一路径；走查判据 `grep -c "readerStateSave"` = 1） |
| MF7（`SEL` 计数 64 → 72） | 全档改字（新增 2 ⇒ 74） | §0.1、§1.5.3、§1.6 走查 #3 |
| MF8（6 处行号与 HEAD 不符） | 按实读改字 | §0.1 全表按本步实读写入（含 `:11532` 收口、`:1721` / `:1730` / `:1731` / `:2579` / `:4521` / `:4525`） |
| MF9（`reader-state-save` 计数恒红） | 单文件口径 = 1 + 跨目录口径 = 2 | §1.6 走查 #2 |
| MF10（`#append` 槽 DOM 非逐字等价） | 按事实改写 + dev 档逐项登记 | §1.5.2「唯一登记的结构变更」与 §1.5.3「DOM 事实」（含 Vuetify 行号） |
| N1 | `.notes-notice` 判别力弱 | §1.5.5 `r18-3` 判据 ②：改判 `.center-pill` / `.chat-panel` 内新增类名计数 0 + 走查「`最近讨论：` 恰 1 处」 |
| N2 | `docPathKey(?.…)` 不可编译 | §1.4.1 的 `docRelatedPath` computed（`string \| null`）+ 空值守卫 |
| N3 | 缺真实删除路径场景 | 登记为等价覆盖（§1.5.5 场景级判据 5 与 §9 第 7 条） |
| N5 | `继续讨论` 计数对实现形态敏感 | §1.3.2 冻结为**一条复用串** `discussLabel`（文本与 `title` 同源）；判据落在运行时实文 + 命中文件数 |
| N6 | 备份计数用增量 | §5.2 #11（a）逐字（读前后差集恰 1） |
| N7 | 乐观 `updatedAt` 取 `at` | §1.2.3 的 `applyLocal` 登记（毫秒级偏差、无判据影响） |

### 0.3 本档新增的显式冻结（只补实现层命名与常量，不改任何判据）

| 项 | 冻结值 | 理由 |
| --- | --- | --- |
| 渲染层内部类型 | ```interface DiscussionStamp { path: string; at: number }```（`stores/reader-state-store.ts` 文件内，**不导出**、不进返回对象） | 把「两键」在渲染层收成一个可选参数；避免 `submit` / `applyLocal` 各自拼两份参数 |
| `noteDiscussion` 的返回面 | `function noteDiscussion(absPath: string \| null, page: number, scale: number, sessionPath: string \| null): void`；内部 `void submit(next, stamp)`（与既有 `submitIfChanged` 的 `void submit(next)` **同范式**） | 调用点是一条普通语句（不是浮空 Promise 表达式）⇒ `send()` 既有 `await` 结构与 `finally` 时序零改动；形参域与实参域逐字对齐（`string \| null`，**设计评审 MF1**：`readerStore.filePath` / `sessionState.sessionFile` 均可为 null），函数内先收窄再走 `toSnapshot`；失败只允许既有的一行 `[reader-state]` warn（`submit` 内已 try/catch） |
| `submit` 的第二参数 | `async function submit(next: ReaderSnapshot, stamp: DiscussionStamp \| null = null): Promise<void>`；payload 用条件展开携带两键 | 保持**唯一** `readerStateSave` 调用点（`grep -c` = 1）与**唯一** `saveEpoch` 守卫 |
| `applyLocal` 的第二参数 | `function applyLocal(next: ReaderSnapshot, stamp: DiscussionStamp \| null = null): void`；`updatedAt` 在 `stamp` 非空时取 `stamp.at`（N7），两键按「携带 ⇒ 覆盖 / 未携带 ⇒ 保留既有对」合成 | 与主进程写侧同一条保留规则的两处实现之一（另一处在 `saveReaderState`） |
| `MAX_SESSION_PATH_LENGTH` 落点 | 主进程 `main/reader-state-store.ts`：紧随 `MAX_SCALE` `:31` 之后；stub 内紧随 `MAX_SCALE` `:702` 之后（**刻意重复**，登记：stub 无法 import TS 源） | 与 `MIN_SCALE` / `MAX_SCALE` 的三处同款重复先例一致 |
| 谓词落点 | 主进程 `isValidSessionPath` / `isValidSessionAt`：紧随 `isValidScale` `:101-103` 之后 | 与 `isValidPage` / `isValidScale` 同区；读侧 / 写侧共用 |
| ReaderPanel 新增派生命名 | `discussEntry`（computed，载荷 `{ path: string; title: string; time: string } \| null`）/ `discussLabel`（computed，`string`，文本与 `title` 的唯一复用串）/ `openDiscussion()` | req 冻结了类名 / emit / 处理器名；这三个是本档补的实现层命名 |
| ReaderPanel 新增顶层 import | `docPathKey`（并入既有 `../../utils/notes-path` 那一行）、`formatSessionTime`（新增一行 `../../utils/session-title`） | 顶层导入纪律（禁内联动态 import）；`absoluteDocPath` / `docDisplayName` / `useReaderStateStore` / `useProjectStore` 已在场 |
| ChatPanel 新增顶层 import | `useReaderStateStore`（`../../stores/reader-state-store`）、`docPathKey`（`../../utils/notes-path`） | `deriveSessionTitle` / `formatSessionTime` / `useReaderStore` 已在场 |
| ChatPanel 新增派生命名 | `docRelatedPath`（`computed<string \| null>`）/ `docRelatedTitle`（`computed<string>`，未命中时 `""`）/ `isDocRelatedSession(session)`（谓词函数） | req §0.6 已冻结这三个名字，本档补参考实现 |
| 离屏新 helper（**7** 个，命名自由、语义冻结） | `enterWorkspaceWithState(state, rows = 4)` / `openSessionMenu()` / `closeSessionMenu()` / `sessionMenuProbe()` / `clickSessionItem(title)` / `waitDiscussText(prefix)` / `waitState(file, predicate, label, timeoutMs = 20000)` | §1.5.4 逐条给参考实现与语义；`waitState` 的存在理由是「`waitFor` 在渲染层求值、无法轮询现场文件」（自审第 2 条）；`waitDiscussText` 取前缀语义是 MF5 的直接后果 |
| 场景级夹具常量 | `PAST_AT = Date.now() - 26 * 60 * 60 * 1000`（26 小时前 ⇒ `formatSessionTime` 恒 `昨天`）、`SEED_AT = Date.now() - 60000`、`SESSIONS_A`（2 条）、`SESSIONS_GHOST`（3 条） | 时间档位确定性（`session-title.ts:84` 的 `diff < 2 * day` 档）+ MF2 的显式钉会话前置 |
| 时间后缀允许集 helper | `discussTimeAllowSet(lastSessionAt, now = Date.now())` ⇒ `Set(["刚刚", \`${floor(Δ/60000)} 分钟\`, \`${floor(Δ/60000)+1} 分钟\`])`（Δ = `now - lastSessionAt`，负值钳到 0） | MF5 的可判定式；只在场景代码内、不进产品代码 |
| stub 内部新增状态名 | `sessionsSeed`（数组）/ `sessionsSeedRoot`（默认 `LIBRARY_DIR`）/ `switchCalls`（`{path}[]`，保留末 8 条） | 与既有 `readerStateCalls` / `sendCalls` 同款内存记录范式 |
| 本档不引入的东西（登记） | 不新增 `--pix-*` 变量、不新增源文件、不新增 npm script、不新增 IPC 通道、不改 `package.json` / lockfile / `packages/**` | 与 R18-req §6 反需求 5/6/7 逐条对齐 |

### 0.4 本步未执行项（与本档证据面边界）

- 未跑离屏 `ui-shot.mjs`（本步禁止）；`r18-*` 的状态推演一律标注为「代码路径推导」。
- 未跑动工前基线（§5.1 步骤 0c）与验收离屏（§5.1 步骤 3）；基线目录 `pix-v06-r17c-review` 的读数由本步复读（§0.1）。
- 未跑 `npm run smoke:notes` / `smoke:view`（读数取自 R17 交付终态 `通过 74 / 失败 0`、`通过 65 / 失败 0` 与本步的 `grep -c "  check("` 计数）。
- 本步实跑：`cd pix && npm run check`（`CHECK_EXIT=0`）、`git status --short` / `git log --oneline -1`、全部 `grep` / `wc` / `sed` / `node -e` 读数、以及 `read` 全量读入 8 个待改文件与 R18-req / R18-review / R16-design / R14-design / R17-design 的相关段落。

---

## 1. 契约冻结表

### 1.1 N100 现场扩展字段（逐字）

#### 1.1.1 类型（`pix/src/shared/types.ts`，逐字）

```ts
/** 单篇文档的现场：page 1-based；scale 为 reader-store 钳制后的两位小数。 */
export interface ReaderDocState {
  page: number;
  scale: number;
  updatedAt: number;
  /** R18 可选字段：最近一次讨论该文档的会话文件路径（原样存储，不解析、不校验存在性） */
  lastSessionPath?: string;
  /** R18 可选字段：该次讨论的发送时刻（epoch ms，> 0） */
  lastSessionAt?: number;
}

/** 写入草稿：docFilePath 必须传绝对路径（与 ReaderNoteDraft 同口径）。 */
export interface ReaderStateSaveDraft {
  docFilePath: string;
  page: number;
  scale: number;
  /** R18 可选字段：最近一次讨论该文档的会话文件路径（原样存储，不解析、不校验存在性） */
  lastSessionPath?: string;
  /** R18 可选字段：该次讨论的发送时刻（epoch ms，> 0） */
  lastSessionAt?: number;
}
```

| 项 | 冻结 |
| --- | --- |
| 名字 / 类型 / 可选性 | 两处各新增**可选**字段 `lastSessionPath?: string` / `lastSessionAt?: number`；`ReaderStateFile` / `ReaderStateErrorCode` / `ReaderStateDegradeReason` / `ReaderStateLoadResult` / `ReaderStateSaveResult` **零改动** |
| 形状不变量（写死） | 条目里的两键**要么都在、要么都不在**；任何一侧非法 ⇒ 视为「没有对」（丢弃两键、不产生半截字段）；条目本身凭 `page` / `scale` 继续生效 |
| 文件形态与键序 | `documents["<比较键>"] = { page, scale, updatedAt, lastSessionPath, lastSessionAt }`；两键排在 `updatedAt` 之后（`git diff -U0` 的构造语句判定，读侧 / 写侧各 1 处） |
| 语义 | `lastSessionPath` = 会话文件的**绝对路径原样**（可能是库外路径；本模块从不打开、不解析、不校验存在性）；`lastSessionAt` = **发送时刻**（epoch ms，写入方时钟，不做钳制） |
| 值域谓词（主进程唯一实现点，名字逐字） | ```function isValidSessionPath(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= MAX_SESSION_PATH_LENGTH && !value.includes("\u0000"); }``` / ```function isValidSessionAt(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0; }``` / `const MAX_SESSION_PATH_LENGTH = 2048;` |
| 渲染层不得复制 | 谓词第二份与长度上限第二份都不允许：`grep -rn "MAX_SESSION_PATH_LENGTH" pix/src/renderer \| wc -l` = 0 |
| 不得触碰 | `page` / `scale` / `updatedAt` / `lastDocPath` / `documents` 键域 / `version` / 序列化（`JSON.stringify(file, null, 2) + "\n"`）/ 原子写协议 / 四条降级原因 —— 全部逐字不变 |

#### 1.1.2 读侧契约（`parseDocState` 参考实现，语义冻结）

```ts
function parseDocState(value: unknown): ReaderDocState | null {
  if (!isRecord(value)) return null;
  if (!isValidPage(value.page) || !isValidScale(value.scale)) return null;
  // updatedAt 非关键字段：读不出就记 0，不因它丢现场
  const updatedAt = typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : 0;
  // R18：合法对 ⇒ 成对带回；任一非法 ⇒ 两键都不追加（读侧不产生 warn、不改写文件）
  if (isValidSessionPath(value.lastSessionPath) && isValidSessionAt(value.lastSessionAt)) {
    return { page: value.page, scale: value.scale, updatedAt, lastSessionPath: value.lastSessionPath, lastSessionAt: value.lastSessionAt };
  }
  return { page: value.page, scale: value.scale, updatedAt };
}
```

**为什么必须带回（本档最重要的不变式）**：`saveReaderState` 的读-改-写把**其它条目**从 `parseReaderState` 的结果带过（`documents: { ...current.documents, [key]: … }`）；`parseDocState` 若继续只产三字段，**每次翻页保存都会静默清空其它文档的讨论记录**（本档 R1）。

#### 1.1.3 写侧契约（`saveReaderState` 目标条目构造参考实现，语义冻结）

```ts
  const key = docPathKey(docPath);
  const previous = current.documents[key];
  // R18：有效对 ⇒ 覆盖；否则 ⇒ 保留目标条目既有对（含「本来就没有」）；其它条目一字不动
  const carried = isValidSessionPath(draft.lastSessionPath) && isValidSessionAt(draft.lastSessionAt)
    ? { lastSessionPath: draft.lastSessionPath, lastSessionAt: draft.lastSessionAt }
    : previous && previous.lastSessionPath !== undefined && previous.lastSessionAt !== undefined
      ? { lastSessionPath: previous.lastSessionPath, lastSessionAt: previous.lastSessionAt }
      : {};
  const next: ReaderStateFile = {
    version: SCHEMA_VERSION,
    lastDocPath: docPath,
    // 键顺序沿用读入顺序：已有键原位覆盖，新条目追加在末尾
    documents: { ...current.documents, [key]: { page: draft.page, scale: draft.scale, updatedAt: Date.now(), ...carried } },
  };
```

| 项 | 冻结 |
| --- | --- |
| 既有语句零改写 | `lastDocPath: docPath`、`{ ...current.documents, [key]: … }` 的键序、`updatedAt: Date.now()`、`writeFileAtomic` / `serializeState` 调用逐字不动；函数体内**不新增 await**（`grep -c "await"` 保持 1 = 头部注释） |
| 四条降级语义零改动 | `read-failed` 拒写、`version-unsupported` 拒写（不带 code、error 逐字 `阅读状态文件版本不支持（未写入）` 的既有返回值不动）、`corrupt` copy-first 备份后重建、`missing` 允许整体重建 —— 全部不作为 `+` / `-` 行出现 |
| 越界 / 非法 | 空串 / 非字符串 / 超长（> 2048）/ 含 `\u0000` / 只给一侧 / `lastSessionAt` 为 `0` / 负数 / `NaN` / 字符串 ⇒ **静默丢弃该对**（不抛错、不写日志、不改其它条目、不产生 warn 增量） |
| 旧文件（无两键） | 写侧**不得凭空造字段**：未携带 ⇒ 保留「本来就没有」 |

#### 1.1.4 写入 / 清除时机表（逐条可判定）

| 事件 | 是否写两键 | 载荷与副作用 | 依据 |
| --- | --- | --- | --- |
| `sendPrompt` / `sendSteer` **成功返回后**（唯一记录点） | **覆盖**为本次发送的 `(sessionPath, at)` | 三字段 + 两键；`at = Date.now()`；**立即提交**（不经 `DEBOUNCE_MS`）+ 乐观更新 | §0.0 第 1 条、§0.4、MF6 |
| 翻页 / 缩放落地（`noteLanding` / `noteChange` 的 600ms 去抖提交） | **不携带** ⇒ 保留既有对 | 三字段；`snapshot` / `committed` 机制逐字不变 | §0.4「渲染层去重基线」 |
| 打开文档（续读落点写盘 / 树行打开 / 笔记跳转） | 同上（未携带 ⇒ 保留） | 同上 | 同上 |
| 切换会话 / 新建会话 / 删除会话 | **不写**（这些路径不调用 `capture` / `noteDiscussion`） | 零 IPC（reader-state 面） | §0.0 第 1 条理由 ① |
| 发送失败（`sendCommandOrThrow` 抛错，进 catch） | **不写** | 既有 `failOptimisticUserMessage` + 草稿 / 附件还原 + 认证引导逐字不动 | N100-4 判据 3 |
| 发送被拒（`{success:false}` ⇒ 抛错） | **不写**（与上同支） | 同上 | 同上 |
| 点击 `.reader-discuss` / 打开会话菜单 / 读标记 | **不写** | 见 §1.3.6 点击链路 | N101-3 判据 2 |
| `resetState`（`goHome` / `onUnmounted`，先 `flush`） | 只清渲染层内存（`documents` / `lastDoc` / `ready`）；**盘上记录原样保留** | 既有 `resetState` 分支零改写（已清 `documents`，无需新增复位项） | §0.7「零新增副作用」 |
| 读侧任何分支 | **从不改写文件** | R6 冻结 | §0.1 R6 行 |
| 「清除记录」入口 | **本轮不提供** | 两键只在「被新发送覆盖 / 其它条目原样带过 / 键域不合法整条丢弃（既有语义）」三条路径下变化 | 反需求 14（不写未被调用的死代码） |

#### 1.1.5 文件校验兼容矩阵（逐情形：读侧 → 写侧）

| 文件情形 | 读侧（`loadReaderState` ⇒ `parseReaderState` ⇒ `parseDocState`） | 写侧（`saveReaderState`） |
| --- | --- | --- |
| 旧文件：条目仅 `page` / `scale` / `updatedAt` | 零报错、零 warn、`degraded === false`；条目照常生效；两键均不存在 | 未携带 ⇒ 保留「本来就没有」；磁盘条目**仍无**两键 |
| 合法对 | 两键逐值带回（`documents[key]` 上可读） | 有效对 ⇒ 覆盖为草稿值 |
| 只给一侧（`lastSessionPath` 或 `lastSessionAt`） | 两键都不带回（条目凭 `page` / `scale` 生效） | 视为无效对 ⇒ 保留既有对 |
| 值非法（空串 / 非字符串 / 超长 / 含 `\u0000` / `0` / 负 / `NaN` / 字符串时间） | 同上（静默丢弃该对） | 同上（静默，warn 增量 0） |
| `version: 2`（带两键） | `degraded: true` + `reason: "version-unsupported"` + 恰 1 行 warn；`state` = 空状态 | 拒写（`success: false`、`error` 逐字 `阅读状态文件版本不支持（未写入）`、不带 `code`）；原文件 sha256 不变 |
| 损坏（截断，带两键） | `degraded: true` + `reason: "corrupt"` + 恰 1 行 warn | copy-first 备份（`.corrupt-<stamp>[-n]`）后重建；重建条目**无**两键 |
| `read-failed`（路径是目录等） | `degraded: true` + `reason: "read-failed"` | 拒写（`code: "read-failed"`）；原文件不动 |
| 文件缺失（含 B 库从未写过） | `success: true` / `degraded: false`（missing 不是降级） | 以空模型整体重建；目标条目可能只带三字段（未携带 ⇒ 无对） |
| 无工作区根 | `no-root`（静默，不记 warn） | `no-root`（静默，不写盘） |
| 目标文档越界 / 库外 | —— | `outside` 拒绝（不变） |

### 1.2 N100 渲染层 store 契约（`pix/src/renderer/stores/reader-state-store.ts`）

#### 1.2.1 类型（逐字，`DiscussionLink` 按 req §0.7 导出）

```ts
/** R18：一条讨论记录的提交载荷（渲染层内部使用，不导出）。 */
interface DiscussionStamp {
  path: string;
  at: number;
}

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

#### 1.2.2 动作 `noteDiscussion(absPath, page, scale, sessionPath)`（守卫顺序即判据）

```ts
/** R18：发送成功后的记录动作（唯一入口）。五条守卫全过 ⇒ 立即提交（不经 DEBOUNCE_MS、不写 snapshot/committed）。 */
function noteDiscussion(absPath: string | null, page: number, scale: number, sessionPath: string | null): void {
  if (!ready.value) return;                                   // ① 加载窗口内不写
  if (!absPath || !sessionPath) return;                       // ② 未打开文档 / 内核未给出会话文件（收窄 string | null；设计评审 MF1）
  if (!Number.isInteger(page) || page < 1) return;            // ③ 页码非法
  if (!Number.isFinite(scale) || scale < MIN_SCALE || scale > MAX_SCALE) return;  // ④ 缩放越界
  const next = toSnapshot(absPath, page, scale);              // ⑤ 库外 / 未选库 ⇒ toSnapshot 返回 null
  if (!next) return;
  const stamp: DiscussionStamp = { path: sessionPath, at: Date.now() };
  applyLocal(next, stamp);
  void submit(next, stamp);                                   // 唯一提交路径（复用 submit 的 saveEpoch 守卫）
}
```

| 项 | 冻结 |
| --- | --- |
| 静默性 | 五条守卫全部**静默**（不弹提示、不记面板状态、不写盘）；失败只允许既有的一行 `[reader-state]` warn（来自 `submit` 的 catch 分支） |
| 形参域（**设计评审 MF1**） | 两个形参与实参同域：`reader-store.ts:25` 的 `filePath: string \| null`、`useRpc.ts:25` 的 `sessionState: Ref<RpcSessionState \| null>`（`shared/types.ts:115` 的 `sessionFile?: string`）⇒ `?? null` 得 `string \| null`；`tsconfig.json:6` 的 `"strict": true`（含 `strictNullChecks`）下把 `string \| null` 传入 `string` 形参 = TS2345 ⇒ `[check]` 必红（§3 #17） |
| 不做的事 | 不写 `snapshot` / `committed`（翻页 / 缩放的去重基线逐字不变）；不 `flush`；不 `resetState`；不发任何新 IPC |
| 「同一页同一缩放的第二次发送必须照写」 | 由「不进 `committed` 机制」保证：`submitIfChanged` 的比较字段只有 `key` + `page` + `scale` |
| 提交路径唯一（MF6） | 走查：`grep -c "readerStateSave" pix/src/renderer/stores/reader-state-store.ts` = **1**；`grep -c "noteDiscussion" …/reader-state-store.ts` = **2**（定义 1 + 返回对象 1） |
| 调用点唯一（MF4） | `grep -c "noteDiscussion" pix/src/renderer/components/workspace/ChatPanel.vue` = **1**（`send()` 的 try 尾部） |

#### 1.2.3 `applyLocal` 的保留规则（参考实现）

```ts
/** 乐观更新：提交瞬间就把本地模型推到新值；失败不回滚（下一个真实变化自然重写）。 */
function applyLocal(next: ReaderSnapshot, stamp: DiscussionStamp | null = null): void {
  const previous = documents.value[next.key];
  const carried = stamp
    ? { lastSessionPath: stamp.path, lastSessionAt: stamp.at }
    : previous && previous.lastSessionPath !== undefined && previous.lastSessionAt !== undefined
      ? { lastSessionPath: previous.lastSessionPath, lastSessionAt: previous.lastSessionAt }
      : {};
  documents.value = {
    ...documents.value,
    // N7 登记：stamp 非空时 updatedAt 取发送时刻 at（与主进程写侧的 Date.now() 相差毫秒级，无判据影响）
    [next.key]: { page: next.page, scale: next.scale, updatedAt: stamp ? stamp.at : Date.now(), ...carried },
  };
  lastDoc.value = { docPath: relativeDocPath(next.filePath, rootDir()), page: next.page, scale: next.scale };
}
```

**为什么必须保留**：翻页 / 打开文档走的是同一条 `applyLocal`；若未携带时覆盖成「无对」，入口与标记会在每次翻页乐观更新时短暂消失（req §0.4 明文）。

#### 1.2.4 `submit` 的扩展与零改动面

```ts
  async function submit(next: ReaderSnapshot, stamp: DiscussionStamp | null = null): Promise<void> {
    const epoch = saveEpoch;                        // 既有语句（:111）零改写
    try {
      const result = await bridge().readerStateSave({
        docFilePath: next.filePath,
        page: next.page,
        scale: next.scale,
        ...(stamp ? { lastSessionPath: stamp.path, lastSessionAt: stamp.at } : {}),
      });
      if (epoch !== saveEpoch) return;              // 既有语句（:119）零改写
      if (result.success) { applyState(result.state); return; }
      warn(`save rejected (${result.code ?? "unknown"}): ${result.error ?? ""}`);   // 既有 warn 语义
    } catch (err) {
      if (epoch !== saveEpoch) return;              // 既有语句（:126）零改写
      warn(`save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
```

| 项 | 冻结 |
| --- | --- |
| 零改动 | `saveEpoch` 注释与实现（`:62-63` / `:111` / `:119` / `:126`）、`submitIfChanged` 本体的比较表达式、`capture` 三闸、`loadReaderState` 的播种（`:175-177`）、`progressPageFor` / `requestRestoreFor` / `noteLanding` / `noteChange` / `flush` / `resetState` 的既有分支 |
| ChatPanel 侧的调用（MF4 唯一登记的控制流调整） | ```ts
    if (isStreaming.value) {
      await rpc.sendSteer(message, filePaths, sendImages, text);
    } else {
      await rpc.sendPrompt(message, filePaths, sendImages, text);
    }
    readerStateStore.noteDiscussion(readFilePath, readPage, readScale, sendingSessionPath);
``` —— 既有语句只改 `return;`（`:428`）这一处；两支的 `await` 语句与实参逐字不变；catch 分支**不得**出现 `noteDiscussion`；实参 `readFilePath` / `sendingSessionPath` 均为 `string \| null`，由 §1.2.2 的同域形参接收（**设计评审 MF1**） |
| 同一同步段的三处快照 | 与既有 `readFilePath` `:392` / `readPage` `:393` 同一同步段新增 `const readScale = readerStore.scale;` 与 `const sendingSessionPath = rpc.sessionState.value?.sessionFile ?? null;`（类型 `string \| null`；`sessionFile?: string`，`shared/types.ts:115`）；`readFilePath` / `readPage` 各只读一次（R8 冻结） |
| 语义等价性 | 该分支之后 try 内无其它语句；`finally`（`:443-446`）语义不变；`sendSteer` 成功 → 记录；`sendPrompt` 成功 → 记录；任一失败 → 进 catch（不记录） |

#### 1.2.5 computed `currentDiscussion`（唯一派生点，参考实现）

```ts
/** R18：现场记录 × 会话列表 ⇒ 入口 / 标记的唯一数据源；无记录或会话不在列表 ⇒ null。 */
const currentDiscussion = computed<DiscussionLink | null>(() => {
  const key = currentDocKey(readerStore.filePath, rootDir());
  if (!key) return null;                                   // ① 未打开文档 / 库外文件 / 未选库
  const entry = documents.value[key];
  if (!entry) return null;                                 // ② 该文档无条目
  const sessionPath = entry.lastSessionPath;               // 先落局部变量：避免在闭包内用非空断言（仓库内非空断言实读 0 处）
  const sessionAt = entry.lastSessionAt;
  if (sessionPath === undefined || sessionAt === undefined) return null;   // ② 成对裁剪（半截记录视同无记录）
  const session = projectStore.sessions.find((item) => docPathKey(item.path) === docPathKey(sessionPath));
  if (!session) return null;                               // ③ 记录会话不在当前工作区列表（静默隐藏，读侧不改文件）
  return { sessionPath, title: deriveSessionTitle(session), at: sessionAt, docName: docDisplayName(key) };
});
```

| 项 | 冻结 |
| --- | --- |
| 暴露 | 在工厂返回对象上暴露（`grep -c "currentDiscussion" …/reader-state-store.ts` = **2**：声明 1 + 返回对象 1） |
| 依赖纪律 | 是「现场记录 → 会话」解析的**唯一实现点**：`grep -rn "lastSessionPath" pix/src/renderer/components \| wc -l` = **0**；`grep -rn "documents\[" pix/src/renderer/components \| wc -l` = **0**；`grep -rn "currentDiscussion" pix/src/renderer/pages \| wc -l` = **0** |
| 附加导入 | `deriveSessionTitle` / `docDisplayName` / `docPathKey` 顶层 import（`docPathKey` 与既有 `absoluteDocPath, currentDocKey` 同一行合并；`deriveSessionTitle` 来自 `../utils/session-title`） |
| 零新增副作用 | 既有 `documents` / `lastDoc` / `ready` / `degraded` 的形状与语义零改动；`resetState` 无需新增复位项 |
| 文档名口径（登记） | `docName = docDisplayName(key)`：取**比较键**（小写 + 正斜杠）⇒ 大小写变形的文档名显示为小写形态（与 req §0.7 逐字一致；夹具全为小写 ⇒ 判据不受影响）；本档明确不为此新增第二条显示名派生 |

### 1.3 N101 入口契约（`.reader-discuss`）

#### 1.3.1 落点与与既有 `.center-pill` 元素的关系（实读口径）

| 项 | 冻结 |
| --- | --- |
| 落点 | `ReaderPanel.vue` 模板新增 `<Teleport v-if="mapToggleReady && discussEntry" to=".center-pill">`（与既有 `.map-toggle` `:193-205` 同款就绪判定：容器存在才挂载） |
| 声明位次 | 紧邻既有 `.map-toggle` Teleport（`:193-205`）**之后**；`ReaderPanel.vue` 内新增块不得插入 `reader-header` / `reader-stage` / 空态分支的内部 |
| `.center-pill` 既有子元素 | `.pill-label`（`WorkspacePage.vue:330`）与 `leftCollapsed` 时的 `.pill-icon-btn`（`:322-329`）**零改动**：不改文本、不改类名、不改属性、不改位次；新增元素由 Teleport 追加到 `.center-pill` 末尾 |
| 与 `.map-toggle` / `.shortcut-toggle` 的关系 | 三者互不替换、互不隐藏；pill 内**相对位次由挂载顺序决定**（R17 已登记同款事实：订单不作断言）；三者共存时 pill 变宽（登记，不作像素断言） |
| 不落 `reader-header` | `WorkspacePage.vue:464-467` 的 `.reader-under-pill :deep(.reader-header) { display: none; }` ⇒ 该候选在真实工作区不可见（R17 需求档已登记同一事实） |
| 不落空态区 | `.reader-resume` 所在 `.reader-empty` 只在 `v-if="!filePath"`（`:213`）时渲染 ⇒ 文档一旦打开该区域整体不存在，无法承载「打开该文档时一步回到讨论」 |
| 就绪判定 | `mapToggleReady`（`:43` / `onMounted` `:160`）逐字复用：`.center-pill` 不在 DOM ⇒ 不渲染（不产生游离按钮） |

#### 1.3.2 DOM 形状与逐字模板

```html
    <Teleport v-if="mapToggleReady && discussEntry" to=".center-pill">
      <button type="button" class="reader-discuss" :title="`${discussLabel}；点击打开该会话`" @click="openDiscussion">
        <v-icon size="14">mdi-forum-outline</v-icon>
        <span class="reader-discuss-text">{{ discussLabel }}</span>
      </button>
    </Teleport>
```

| 项 | 逐字值 |
| --- | --- |
| 元素形态 | `<button type="button" class="reader-discuss">`（键盘可聚焦；不加 `tabindex`、不加 `aria-*`、不加 `disabled`） |
| 类名 | `.reader-discuss`（主）/ `.reader-discuss-text`（文本容器） |
| 图标 | `<v-icon size="14">mdi-forum-outline</v-icon>`（`grep -rn "mdi-forum-outline" pix/src \| wc -l` = **1**） |
| 文本（逐字模板） | `继续讨论：{title} · {time}`（例：`继续讨论：摘录与笔记走查 · 刚刚`；`{title}` = `deriveSessionTitle(session)`，`{time}` = `formatSessionTime(lastSessionAt)`） |
| `title`（tooltip，逐字模板） | `继续讨论：{title} · {time}；点击打开该会话` |
| 复用串（N5 收敛） | `const discussLabel = computed(() => (discussEntry.value ? \`继续讨论：${discussEntry.value.title} · ${discussEntry.value.time}\` : ""));`；文本渲染 `{{ discussLabel }}`，`title` = `discussLabel + "；点击打开该会话"`（**一条串两处消费** ⇒ `grep -rn "继续讨论" pix/src` 命中文件数 = 1；等价实现允许两条模板串，判据只落运行时实文与命中文件数） |
| 转义 / 空白 | 文本两处消费都必须经 `textContent` 归一化后逐字相等：`replace(/\s+/g, " ").trim()`（离屏 `textOf` 的既有归一化） |
| 禁止 | 不新增 `v-else` 占位节点、不新增第二枚元素、不加动画 / 过渡 / 阴影、不新增 `--pix-*` 变量 |

#### 1.3.3 样式（逐字；插入点 = `.map-toggle:disabled` 规则块之后、`.reader-main` 之前）

```css
.reader-discuss {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 240px;
  margin-left: 2px;
  padding: 1px 8px;
  border: 1px solid var(--pix-border-light, #e3eaf0);
  border-radius: 999px;
  background: var(--pix-bg-elevated, #ffffff);
  color: var(--pix-text-secondary);
  font-family: var(--pix-font-ui);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
}

.reader-discuss-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reader-discuss:hover {
  background: var(--pix-bg-hover, #eef2f6);
  color: var(--pix-text-primary);
}
```

| 项 | 冻结 |
| --- | --- |
| 插入位置 | 三条规则插在 `.map-toggle:disabled`（`:343-346`）之后、`.reader-main`（`:348`）之前（`scoped` 块内；`.reader-discuss` 是组件自身模板节点 ⇒ **不需要** `:deep()`） |
| 计数判据 | `grep -rn "reader-discuss" pix/src \| wc -l` = **5**（模板 2：主类名 1 + 文本容器类名 1；样式 3：基础 1 + 文本容器 1 + `:hover` 1）；`grep -c "reader-discuss" ReaderPanel.vue` = **5**（不允许注释 / 其它行出现该字面） |
| 零改动 | `.map-toggle` 三条规则、`.reader-resume`（`:383` / `:400`）、`.reader-empty`、`.pill-*`（在 `WorkspacePage.vue`）全部不作为 `+` / `-` 行出现 |
| 语义 | 浅色胶囊（与 `.map-toggle` 同为 pill 内元素）；`max-width: 240px` + 文本省略是**登记取舍**（长会话名截断，title 仍给全量） |

#### 1.3.4 显示条件（四闸，自上而下第一条命中即定）

| 序 | 条件 | 结果 | 判定落点 |
| --- | --- | --- | --- |
| 1 | `!readerStateStore.ready` | 不渲染（零占位；不出现「无会话的半截入口」，与 `.reader-resume` 的 `ready` 闸同构） | `discussEntry` 第一分量（`currentDiscussion` 依赖 `documents` ⇒ ready 前恒空） |
| 2 | `currentDiscussion === null` | 不渲染 | `discussEntry` 第二分量 |
| 3 | 记录会话路径的**比较键** == 当前活动会话路径的比较键（活动会话 = `projectStore.currentSession?.path`，与 `ChatPanel.isActiveSession` 同源） | 不渲染（避免死路点击） | `discussEntry` 第三分量：`docPathKey(link.sessionPath) === docPathKey(projectStore.currentSession?.path ?? "")` |
| 4 | 组件已挂载且 `.center-pill` 就绪（`mapToggleReady`） | —— | `Teleport v-if` |

```ts
/** R18：入口载荷（四闸全过才有值）。 */
const discussEntry = computed(() => {
  const link = readerStateStore.currentDiscussion;
  if (!link) return null;
  if (docPathKey(link.sessionPath) === docPathKey(projectStore.currentSession?.path ?? "")) return null;
  return { path: link.sessionPath, title: link.title, time: formatSessionTime(link.at) };
});
```

| 项 | 冻结 |
| --- | --- |
| 排序稳定性 | 闸顺序即判据：`ready` 未置位时 `currentDiscussion` 恒 `null` ⇒ 闸 2 与闸 1 不冲突；`docPathKey("")` 为 `""`、`sessionPath` 非空 ⇒ 无「空键误命中」 |
| 未打开文档 | `readerStore.filePath === null` ⇒ `currentDocKey` 为 null ⇒ `currentDiscussion` 为 null ⇒ 不渲染 |
| 库外文件 / 未选库 | `currentDocKey` 为 null ⇒ 同上（不猜测归属） |

#### 1.3.5 不渲染（零占位，逐条写死）

未打开文档 / 打开的是库外文件 / 该文档无记录 / 记录会话不在当前工作区列表 / 记录会话即当前活动会话 / 状态未就绪 ⇒ **元素不在 DOM**（无空胶囊、无禁用态、无占位文案、不弹提示、不写日志）。

#### 1.3.6 点击链路（复用既有通道，逐字）

```ts
function openDiscussion(): void {
  if (!discussEntry.value) return;
  emit("open-session", discussEntry.value.path);   // 载荷 = 会话文件绝对路径字符串
}
```

```ts
/** R18：入口 → 会话切换（复用既有 onSwitchSession；两条 no-op 守卫）。 */
function onOpenDiscussionSession(sessionPath: string): void {
  const key = docPathKey(sessionPath);
  const session = projectStore.sessions.find((item) => docPathKey(item.path) === key);
  if (!session) return;
  if (docPathKey(session.path) === docPathKey(currentSessionPath.value ?? "")) return;
  void onSwitchSession(session);
}
```

| 项 | 冻结 |
| --- | --- |
| `defineEmits` | `ReaderPanel.vue` 的 `defineEmits` 新增 `"open-session": [path: string]`（既有 `"open-document"` 逐字不动） |
| 模板绑定 | `WorkspacePage.vue` 的 `<ReaderPanel … @open-document="openDocumentFromLibrary" @open-session="onOpenDiscussionSession" />`（新增一条绑定；既有属性零改动） |
| 点击语义 | 不切文档、不改页码 / 缩放、不清选择、不写盘、不发任何新 IPC；唯一副作用 = 一次既有 `switch_session` 与随后的既有 `syncWorkspaceState` |
| 打开链路 | 逐字复用既有 `onSwitchSession`（`:170-177`）：`sessionStore.clearSession()` + `rpc.switchSession(session.path)` 的既有 `switch_session` 内核命令 + `projectStore.setCurrentSession(session)` + `syncWorkspaceState({ loadMessagesIfEmpty: true })` |
| 禁止 | 不得直接读写 / 解析 / 重命名 / 删除内核会话文件（`.jsonl`）；不得新增第二条会话切换实现；不得自动打开会话（只响应用户点击） |
| 计数判据 | `grep -rn "switch_session" pix/src/renderer \| wc -l` = **1**（零增量）；`grep -rn "sendCommand\|ipcRenderer" pix/src/renderer/components/workspace/ReaderPanel.vue \| wc -l` = **0** |

#### 1.3.7 降级判定表（五种情形，逐条写死）

| 情形 | 判定面（唯一事实源） | 行为 |
| --- | --- | --- |
| 记录会话文件被删除 / 移走 / 不可读 | `projectStore.sessions` 内按比较键命中失败（列表本身由内核给，渲染层**不 stat 文件**） | 静默隐藏；现场文件里的记录**保留原样**；不弹提示、不写日志、不重试 |
| 记录会话属于别的工作区 | 同上（`listSessions(project.path)` 是工作区隔离的列表） | 静默隐藏 |
| 会话文件在外部被删除但列表还没刷新 | `projectStore.sessions` 仍是旧列表（刷新时机：挂载 / 发送 / 切换 / 删除后） | 入口可能**短暂残留**（登记为接受的时延，不做监听，反需求） |
| 记录会话即当前活动会话 | 比较键相等 | 静默隐藏（避死路点击） |
| 现场记录本身非法（半截 / 越界） | `parseDocState` 成对裁剪（主进程侧已裁决） | 视同无记录；条目仍提供续读页 / 缩放 |

### 1.4 N102 会话列表标注契约（`.session-doc-mark`）

#### 1.4.1 元素 / 类名 / tooltip / 条件（逐字）

| 项 | 逐字值 |
| --- | --- |
| 落点 | `ChatPanel.vue` 会话菜单列表项（`:951-975`）的 `#append` 槽，**排在 `.session-delete-btn` 之前** |
| 元素 | ```<span v-if="isDocRelatedSession(session)" class="session-doc-mark" :title="docRelatedTitle"><v-icon size="14">mdi-file-link-outline</v-icon></span>``` |
| 类名 / 图标 | `.session-doc-mark` / `mdi-file-link-outline`（`grep -rn "mdi-file-link-outline" pix/src \| wc -l` = **1**） |
| tooltip（逐字模板） | `最近讨论：{docName}`（`{docName}` = 当前文档显示名，例：`最近讨论：sample-paper.pdf`；`grep -rn "最近讨论：" pix/src \| wc -l` = **1**） |
| 条件 | `docRelatedPath !== null && docPathKey(session.path) === docRelatedPath`；**与活动会话无关**（活动行同样显示标记） |
| computed（N2 收敛） | ```const docRelatedPath = computed<string \| null>(() => { const link = readerStateStore.currentDiscussion; return link ? docPathKey(link.sessionPath) : null; });``` |
| tooltip computed | ```const docRelatedTitle = computed(() => { const link = readerStateStore.currentDiscussion; return link ? `最近讨论：${link.docName}` : ""; });``` |
| 谓词 | ```function isDocRelatedSession(session: SessionInfo): boolean { return docRelatedPath.value !== null && docPathKey(session.path) === docRelatedPath.value; }``` |
| 取值纪律 | 两个 computed **只读** `readerStateStore.currentDiscussion`（唯一派生点）；不得在组件内读 `documents` 或 `lastSessionPath`（`grep -c "readerStateStore.documents" ChatPanel.vue` = 0 / `grep -c "lastSessionPath" ChatPanel.vue` = 0） |
| 计数判据 | `grep -c "currentDiscussion" pix/src/renderer/components/workspace/ChatPanel.vue` = **2**（两个 computed 各 1） |

#### 1.4.2 `#append` 槽守卫位置调整（唯一登记的结构变更）

```html
            <!-- 旧（:960）：<template v-if="!isActiveSession(session) && !isStreaming" #append> -->
            <template #append>
              <span v-if="isDocRelatedSession(session)" class="session-doc-mark" :title="docRelatedTitle">
                <v-icon size="14">mdi-file-link-outline</v-icon>
              </span>
              <button
                v-if="!isActiveSession(session) && !isStreaming"
                type="button"
                class="session-delete-btn"
                :class="{ armed: deleteArmedPath === session.path }"
                :title="deleteArmedPath === session.path ? '再次点击确认删除' : '删除该对话'"
                @click.stop="onDeleteSession(session)"
              >
                <v-icon size="14">
                  {{ deleteArmedPath === session.path ? "mdi-alert" : "mdi-trash-can-outline" }}
                </v-icon>
              </button>
            </template>
```

| 项 | 冻结 |
| --- | --- |
| 变更内容 | 槽从「模板级 `v-if`」改为「**槽常驻** + `.session-delete-btn` 自身带同一条 `v-if`」；既有类名 / 文案 / 两击确认 / 出现条件逐字不变（`grep -rn "session-delete-btn" pix/src \| wc -l` 保持 **4**） |
| **DOM 事实（MF10，不得写成「渲染输出等价」）** | 槽常驻后 Vuetify 会给**每一行**渲染一枚空的 `div.v-list-item__append` 容器（`VListItem.js:222-223` 的 `hasAppend` ⇒ `:300-303` 无条件建容器）；列宽 `grid-template-columns: max-content 1fr auto`（`VListItem.css:6`）⇒ 空容器零宽、视觉零位移；既有离屏场景从不打开会话菜单（`grep -c "pill-session" scripts/ui-shot.mjs` = 0）⇒ 既有 174 张截图 / 253 条测量零影响。**dev 档必须逐项登记该 DOM 差异** |
| 成本（登记） | 1 个路径 computed + 1 个 tooltip computed + 1 个谓词函数 + 1 枚 `<span>` + 1 条样式 + 上述守卫位置调整；**无新 IPC、无新数据面、无新 store** |
| 价值（登记） | 直接落地 PRD §7 判据 3 的「会话列表能看出与哪篇文档相关」：在当前文档下打开历史对话，一眼看出哪条会话讨论过这篇论文 |

#### 1.4.3 样式（逐字；插入点 = `.session-delete-btn:hover, .session-delete-btn.armed` 规则块之后、`.chat-messages` 之前）

```css
.session-doc-mark {
  display: inline-flex;
  align-items: center;
  margin-right: 6px;
  color: var(--pix-text-muted);
}
```

| 项 | 冻结 |
| --- | --- |
| 插入位置 | `.session-delete-btn.armed`（`:1347-1351`）之后、`.chat-messages`（`:1353`）之前 |
| 零改动 | `.session-delete-btn`（`:1334`）/ `.session-menu-divider`（`:1330`）/ `.pill-session` 规则全部不作为 `+` / `-` 行出现；两个 `.session-delete-btn` 两击确认的 `title` 逐字仍为 `再次点击确认删除` / `删除该对话` |
| 计数判据 | `grep -rn "session-doc-mark" pix/src \| wc -l` = **2**（模板 1 + 样式 1） |
| 无动画 | 不加 `transition` / `animation` / 阴影 |

### 1.5 N103 断言与场景清单（冻结配额）

#### 1.5.1 配额总表（逐条对齐 req §0.8 / §0.9）

| 项 | 基线 | 本轮 | 增量 |
| --- | --- | --- | --- |
| 离屏场景 | `runReaderStateScenarios` 内既有场景 | `r18-1` … `r18-5` | **5 场景** |
| 离屏 label | 69 种 | 74 种 | **5 组**：`r18-discuss-entry` **3** / `r18-old-format` **2** / `r18-session-missing` **2** / `r18-workspace-isolation` **2** / `r18-session-mark` **2** = **11 条 record** |
| 离屏截图 | 174 张 | 186 张 | **12 张**（清单见 §1.5.6） |
| `SEL` 项 | 72 | 74 | **+2**（`readerDiscuss` / `sessionDocMark`） |
| 烟测-主进程 | 10 组 65 条 | 10 组 71 条 | **+6**（`reader-state-store` 组 #6–#11） |
| 烟测-渲染 | 9 组 74 条 | 9 组 74 条 | **零改动**（只在 §5.3 作回归） |
| 现场文件新键 | —— | 条目级两键（成对） | 0 → 最多 5 个 r18 相位写入 |

#### 1.5.2 `SEL` 与 stub 增量（逐字：旧行 → 新行）

| # | 位置 | 旧行（实读） | 新行（冻结） |
| --- | --- | --- | --- |
| 1 | `ui-shot.mjs:127`（`contextChipRemove`）之后、`:128` 的 `};` 之前 | `  contextChipRemove: ".context-chip-remove",` / `};` | 追加两行：`  // R18 新增 2 项（设计档 §1.5.2）` + `  readerDiscuss: ".reader-discuss",` + `  sessionDocMark: ".session-doc-mark",`（既有 72 项逐字不动） |
| 2 | `ui-shot.mjs:503` 之后（stub 内部状态区） | `let listSessionsCalls = 0;` | 追加 `let sessionsSeed = [];` / `let sessionsSeedRoot = LIBRARY_DIR;` / `const switchCalls = [];`（三条独立行） |
| 3 | `ui-shot.mjs:685-687` | `if (type === "new_session" \|\| type === "switch_session" \|\| type === "clone" \|\| type === "fork") { return { success: true, data: { cancelled: false } }; }` | 拆成两支：`switch_session` 支先记录 + 命中镜像（见 §1.5.3 参考实现），其余三型保持原样；**返回体逐字不变** |
| 4 | `ui-shot.mjs:895` | `listSessions: async function () { listSessionsCalls += 1; return []; },` | `listSessions: async function (dir) { listSessionsCalls += 1; if (normalizePath(dir) !== normalizePath(sessionsSeedRoot)) return []; return sessionsSeed.map(function (item) { return Object.assign({}, item); }); },`（未种入 ⇒ 恒 `[]`，与既有行为等价） |
| 5 | `ui-shot.mjs:701-702` 之后（stub 常量区） | `const MIN_SCALE = 0.5;` / `const MAX_SCALE = 3;` | 追加 `const MAX_SESSION_PATH_LENGTH = 2048;` |
| 6 | `ui-shot.mjs:746-751`（`parseDocState`） | 三字段返回 | 两谓词 + 成对带回（§1.5.3 参考实现） |
| 7 | `ui-shot.mjs:1149`（payload 记录） | `readerStateCalls.push({ docFilePath: docFilePath, page: draft ? draft.page : null, scale: draft ? draft.scale : null });` | 追加 `lastSessionPath: draft ? draft.lastSessionPath : undefined` / `lastSessionAt: draft ? draft.lastSessionAt : undefined`（既有三字段逐字不动；`undefined` 在 `MEASUREMENTS.json` 里会被 `JSON.stringify` 省略 ⇒ 既有读数零变化） |
| 8 | `ui-shot.mjs:1162-1163`（目标条目构造） | `const documents = Object.assign({}, current.documents);` + `documents[key] = { page: draft.page, scale: draft.scale, updatedAt: Date.now() };` | 保留 `Object.assign` 行；追加 `previous` / `carried` 两行（§1.5.3），条目改为 `Object.assign({ page, scale, updatedAt: Date.now() }, carried)`（键序 = `page` → `scale` → `updatedAt` → `lastSessionPath` → `lastSessionAt`） |
| 9 | `ui-shot.mjs:1257` 之后（`__pixStub` 控制口） | `readerStateSaveCalls` / `readerStateFilePath` | 追加 `setSessions(list, root)` 与 `switchSessionCalls()`（§1.5.3） |

**`api` 面恒 42 方法（与 `PixApi` 逐字相等，零改动）**：上述 9 条都不增删 `api` 的方法。

#### 1.5.3 stub 契约（会话列表 / 会话切换 / reader-state 镜像，参考实现）

```js
  // ① switch_session：记录调用 + 命中种入列表时镜像 SESSION_STATE（faithful mirror 的最小集）
  if (type === "switch_session") {
    const target = typeof command.sessionPath === "string" ? command.sessionPath : null;
    if (target) {
      switchCalls.push({ path: target });
      if (switchCalls.length > 8) switchCalls.shift();
      const mirror = sessionsSeed.find(function (item) { return normalizePath(item.path) === normalizePath(target); });
      if (mirror) {
        SESSION_STATE.sessionFile = mirror.path;
        SESSION_STATE.sessionId = mirror.id;
        SESSION_STATE.sessionName = mirror.name;
      }
    }
    return { success: true, data: { cancelled: false } };
  }
```

```js
  // ② reader-state 镜像的谓词与条目构造（与 src/main/reader-state-store.ts 同谓词同保留规则）
function isValidSessionPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_SESSION_PATH_LENGTH &&
    value.indexOf(String.fromCharCode(0)) < 0;
}

function isValidSessionAt(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
```

```js
    const documents = Object.assign({}, current.documents);
    const previous = current.documents[key];
    const carried = isValidSessionPath(draft.lastSessionPath) && isValidSessionAt(draft.lastSessionAt)
      ? { lastSessionPath: draft.lastSessionPath, lastSessionAt: draft.lastSessionAt }
      : previous && previous.lastSessionPath !== undefined && previous.lastSessionAt !== undefined
        ? { lastSessionPath: previous.lastSessionPath, lastSessionAt: previous.lastSessionAt }
        : {};
    documents[key] = Object.assign({ page: draft.page, scale: draft.scale, updatedAt: Date.now() }, carried);
```

```js
  setSessions: function (list, root) {
    sessionsSeed = Array.isArray(list) ? list.map(function (item) { return Object.assign({}, item); }) : [];
    sessionsSeedRoot = root || LIBRARY_DIR;
    return sessionsSeed.length;
  },
  switchSessionCalls: function () { return { count: switchCalls.length, paths: switchCalls.map(function (item) { return item.path; }) }; },
```

| 项 | 冻结 |
| --- | --- |
| `setSessions(list, root = LIBRARY_DIR)` | 种入会话列表及其**归属工作区根**；未种入 ⇒ 恒 `[]`；返回种入条数（便于自检）；`r18-4` 的 `workspace-b` 相位以 `LIBRARY_B_DIR` 显式重种（**设计评审 MF3**：B 列表非空 ⇒ 判据 ① / ③ 才有判别力） |
| `listSessions(path)` 按根匹配 | 路径比较键等于种子根 ⇒ 返回种入列表（逐项浅拷贝）；否则 `[]`；未种入 ⇒ 恒 `[]`（既有场景行为等价）；`listSessionsCalls` 计数逐字保留 |
| `switch_session` 镜像 | 只镜像 `SESSION_STATE.sessionFile/sessionId/sessionName`（**不镜像** `SESSION_STATS`）；未命中种入列表 ⇒ 只记录、不镜像（既有场景零影响：既有场景从不发该命令） |
| 会话夹具（场景级，手写） | `SESSIONS_A` = 2 条：① `{ path: path.join(CONFIG.root, ".pix-read", "session-demo.jsonl"), id: "sess-demo", cwd: CONFIG.root, name: "摘录与笔记走查", created/modified: ISO 串, messageCount: 4, firstMessage: "" }`（与 `SESSION_STATE.sessionFile` `:645` / `sessionId` `:646` **同路径同 id**）；② `{ path: path.join(CONFIG.root, ".pix-read", "session-older.jsonl"), id: "sess-older", cwd: CONFIG.root, name: "消融实验对照", … }`；`SESSIONS_GHOST` = `SESSIONS_A` + `{ path: path.join(CONFIG.root, ".pix-read", "session-gone.jsonl"), id: "sess-gone", name: "丢失后恢复的会话", … }` |
| 时间夹具 | `PAST_AT = Date.now() - 26 * 60 * 60 * 1000`（⇒ 逐字 `昨天`；用于所有**种子**记录的 `lastSessionAt` 与 `updatedAt` 的 `SEED_AT` 对照）、`SEED_AT = Date.now() - 60000`（现场文件 `updatedAt` 的防空基线，用于「落点写盘确已发生」） |
| stub 是模板字符串 | 新增 stub 代码内**不得出现反引号**；字符串拼接用 `+`；NUL 判定用 `String.fromCharCode(0)`（避免 `\u0000` 在模板字符串里的转义歧义） |
| 既有面 | `SEL` 只**追加** 2 项（**72 → 74**）；既有场景 / 截图 / label / helper 零删除零改写（**唯一登记例外 = §2.3 #1 / `R18-req` §0.10**：`map-chapter-filter` 相位 `injection` 的 2 行既有断言更新与 `r18-3` 相位 `session-restored` 的步骤自确定化）；`writeFixtures` `:409-410` 的「每轮删除 A/B 两库 `reader-state.json`」逐字不动 |

#### 1.5.4 新 helper（7 个，命名自由、语义冻结；参考实现）

```js
  /** r18 场景统一前置：复位注入 → 回首页 → 清 A 现场 → 写现场夹具 → 进工作区 → 等树行 → 注入笔记种子。 */
  const enterWorkspaceWithState = async (state, rows = 4) => {
    await js("window.__pixStub.setMessages([]), true");
    await setSendFailure(null);
    await js("window.__pixStub.setNotesAddFailure(null), true");
    await setNotesDeleteFailure(null);
    await goHome();
    await clearStateA();
    writeState(STATE_FILE_A, state);
    await enterWorkspace(LIBRARY_NAME);
    await waitTreeRows(rows);
    await js(`window.__pixStub.seedNotes(${JSON.stringify(seedNotes())}), true`);
  };

  /** 打开会话菜单：点 pill 并等列表在场。 */
  const openSessionMenu = async () => {
    await js(`document.querySelector(".pill-session").click(), true`);
    await waitFor("会话菜单打开", `document.querySelector(".v-overlay-container .v-list")`);
  };

  /** 关闭会话菜单：列表不在场 ⇒ 立即返回（幂等）；否则派发 Esc 并等消失。 */
  const closeSessionMenu = async () => {
    if (!(await has(".v-overlay-container .v-list"))) return;
    await js(`document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })), true`);
    await waitFor("会话菜单关闭", `!document.querySelector(".v-overlay-container .v-list")`);
  };

  /** 菜单逐行探针：标题 / 副标题 / 活动 / 标记 / 标记 tooltip / 删除按钮。 */
  const sessionMenuProbe = () => js(`(() => {
    const rows = Array.from(document.querySelectorAll(".v-overlay-container .v-list .v-list-item"));
    const t = (el, selector) => { const node = el.querySelector(selector); return node ? node.textContent.replace(/\\s+/g, " ").trim() : null; };
    return {
      open: !!document.querySelector(".v-overlay-container .v-list"),
      items: rows.map((el) => {
        const mark = el.querySelector(".session-doc-mark");
        return {
          title: t(el, ".v-list-item-title"),
          subtitle: t(el, ".v-list-item-subtitle"),
          active: el.classList.contains("v-list-item--active"),
          marked: !!mark,
          markTitle: mark ? mark.getAttribute("title") : null,
          hasDeleteBtn: !!el.querySelector(".session-delete-btn"),
        };
      }),
    };
  })()`);

  /** 按标题文本点会话行（对已是活动会话的行是幂等 no-op；点击后等菜单消失，两条路径都能过）。 */
  const clickSessionItem = async (title) => {
    await js(`(() => {
      const rows = Array.from(document.querySelectorAll(".v-overlay-container .v-list .v-list-item"));
      const row = rows.find((el) => { const node = el.querySelector(".v-list-item-title"); return !!node && node.textContent.replace(/\\s+/g, " ").trim() === ${JSON.stringify(title)}; });
      if (!row) throw new Error("session item not found: " + ${JSON.stringify(title)});
      row.click();
      return true;
    })()`);
    await closeSessionMenu();
  };

  /** 等入口文本前缀命中（MF5：时间后缀不逐字钉；确定档位下用全串调用即逐字相等）。 */
  const waitDiscussText = (prefix) => waitFor(`讨论入口文本前缀「${prefix}」`, `(() => {
    const el = document.querySelector(${JSON.stringify(SEL.readerDiscuss)});
    if (!el) return false;
    return el.textContent.replace(/\\s+/g, " ").trim().indexOf(${JSON.stringify(prefix)}) === 0;
  })()`);

  /** 等现场文件达到谓词（waitFor 在渲染层求值，无法轮询文件；节奏同 waitFor 的 120ms）。 */
  const waitState = async (file, predicate, label, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      let ok = false;
      try { ok = Boolean(predicate(readState(file))); } catch { ok = false; }
      if (ok) return;
      if (Date.now() > deadline) throw new Error(`等待超时：${label}（现场文件未达判据）`);
      await sleep(120);
    }
  };

  /** MF5 的运行时允许集：`刚刚` ∪ {N 分钟}（N ∈ {floor(Δ/60000), +1}）。 */
  const discussTimeAllowSet = (lastSessionAt, now = Date.now()) => {
    const minutes = Math.floor(Math.max(0, now - lastSessionAt) / 60000);
    return new Set(["刚刚", `${minutes} 分钟`, `${minutes + 1} 分钟`]);
  };
```

| 项 | 冻结 |
| --- | --- |
| 复用（零修改） | `restoreStandardSeed()` `:3426`、`clearStateA()` `:2394`、`readState` / `writeState` / `removeState` `:1631-1637`、`entry(page, scale)` `:1640`、`saveCalls()` `:1641`、`waitResumeEntry()` `:1686`、`openRow(suffix)` `:1721`、`clickNext` / `clickPrev` `:1730` / `:1731`、`setDraft(text)` `:2544`、`typeAndSend(text)` `:2556`、`sendCalls()` / `clearSendCalls()` / `setSendFailure()` / `setNotesDeleteFailure()` / `lastErrorText()` / `waitSendCalls(n)` `:3268-3281`、`rectOfSelector` `:2579`、`capturePage` `:1278`、`has` / `textOf` / `countOf` `:1628-1629`、`waitFor` `:1608`、`sleep` `:1603`、`js(code)` `:1602`、`waitTreeRows(min)` `:1678`、`waitPdfLoaded()` `:1680`、`waitPage(page, count)` `:1681`、`goHome()` `:1696`、`enterWorkspace(name)` `:1706`、`fileHash(file)` `:4366`、`seedNotes()` `:347`、`SEL` `:47-128`；`enterCleanWorkspace(seed)` `:3407-3415` 只作**蓝本**（r18 场景不直接调用它）（helper 行号已按**设计评审 MF2** 勘正 / 补登） |
| `waitDiscussText` 的前缀语义 | 默认 20s（同 `waitFor`）；「确定档位」调用（`r18-3` `session-restored` / `r18-4` `back-to-a`）传全串 ⇒ 等价逐字相等 |
| 菜单探针的字面选择器 | `.v-overlay-container .v-list .v-list-item` / `.v-list-item-title` / `.v-list-item-subtitle` / `.v-list-item--active` 为 Vuetify 内部结构（既有先例：`:1711` / `:9222` 的 `.v-list-item-title` 字面量），**不进 `SEL`** |
| 场景挂载点 | `runReaderStateScenarios` 末尾（R17 最后一个相位与 `restoreStandardSeed()` `:11531` 之后、函数收口 `}` `:11532` 之前）；每个场景以自己的 `restoreStandardSeed()` + `js("window.__pixStub.setSessions([]), true")` + `setSendFailure(null)` 收尾 |

#### 1.5.5 场景矩阵（逐相位：步骤 / 失败即红的断言 / `data` 字段 / 截图）

**场景 `r18-1`（组 `r18-discuss-entry`，3 条 record，4 张截图）**

前置：`js("window.__pixStub.setSessions(SESSIONS_A), true")` → `enterWorkspaceWithState({ version: 1, lastDocPath: "sample-paper.pdf", documents: { "sample-paper.pdf": { page: 1, scale: 1, updatedAt: SEED_AT }, "archive/older-paper.pdf": { page: 1, scale: 1, updatedAt: 1758000001000, lastSessionPath: path.join(CONFIG.root, ".pix-read", "session-b.jsonl"), lastSessionAt: 1758000001000 } } })`（第二条 = 「其它条目不被动」的现场对照）→ `openRow("sample-paper.pdf")` → `waitPdfLoaded()` + `waitPage(1, 3)` → `openSessionMenu()` + `clickSessionItem("摘录与笔记走查")` + `closeSessionMenu()`（MF2：显式把活动会话钉为记录会话；已是活动会话 ⇒ 幂等 no-op）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `send-records` | 读 `saveCalls()` 基线 + `readState(STATE_FILE_A)`（防空：条目**无** `lastSessionPath` 键）→ `typeAndSend("R18：这篇的消融结论怎么复现？")` → `waitSendCalls(1)` → `waitState(STATE_FILE_A, (s) => s.documents["sample-paper.pdf"].lastSessionPath)` → 读文件 / payload / 元素 → 截图 `r18-1-send-records.png`（整窗） | ① 目标条目 `lastSessionPath` 逐字 = `SESSIONS_A[0].path`、`lastSessionAt` 为有限数且 `Date.now() - 值 < 60000`；② `page === 1`、`scale === 1`（发送不改变既有字段）；③ 第二条目（`archive/older-paper.pdf`）两键逐字仍为 `<root>/.pix-read/session-b.jsonl` / `1758000001000`；④ `saveCalls()` 末条 payload 含两键且逐值相等（`lastSessionPath === SESSIONS_A[0].path`、`lastSessionAt === 文件里的值`）；⑤ `.reader-discuss` 计数 **0**（记录会话即活动会话 ⇒ 隐藏）；⑥ `warnCount()` 增量 0 | `{ phase, file, payload, page, scaleBefore, scaleAfter, otherEntry, entryCount, warnDelta }` |
| `entry-visible-and-click` | `openSessionMenu()` + `clickSessionItem("消融实验对照")` + `closeSessionMenu()` → `waitDiscussText("继续讨论：摘录与笔记走查 · ")`（**前缀**）→ 截图 `r18-1b-discuss-entry.png`（`rectOfSelector(".center-pill", 12)`）→ 记 `switchCalls` 基线 + 文件 sha1 → 点 `.reader-discuss` → `waitFor` `switchSessionCalls().count === base + 1` → 读 `.pill-session .pill-label` / 元素 / 文件 → `openSessionMenu()` + `sessionMenuProbe()` 读活动行 + `closeSessionMenu()` → 复读 `.reader-discuss` 计数 → 截图 `r18-1c-discuss-switched.png`（整窗） | ⑦ 入口文本前缀逐字 `继续讨论：摘录与笔记走查 · `、其后缀 ∈ `discussTimeAllowSet(文件里的 lastSessionAt)`（**不写死档位**）；`title` = 文本 + `；点击打开该会话` 逐字；⑧ `.reader-discuss` 恰 1 个、`tagName === "BUTTON"`、内部 `.v-icon` 带 `mdi-forum-outline` 类、`.pill-label` 文本逐字 `sample-paper.pdf`、`.map-toggle` 在场；⑨ 点击后 `switchSessionCalls().paths` 末项逐字 = `SESSIONS_A[0].path`；`.pill-session .pill-label` 逐字 `摘录与笔记走查`；重开菜单后该行 `.active === true`（活动行在场，由重开的 `sessionMenuProbe()` 读）；⑩ 点击零写入：文件 sha1 不变、`saveCalls()` 增量 0；⑪ `.page-label` / `.zoom-label` 与点击前逐字相同；⑫ 点击后 `.reader-discuss` 计数 **0** | `{ phase, entry, switchCalls, pillBefore, pillAfter, activeRow, shaSame, saveDelta, page, zoom, entryAfter }` |
| `send-failed` | `openSessionMenu()` + `clickSessionItem("消融实验对照")` + `closeSessionMenu()` → 读文件两键 + 入口文本 → `setSendFailure("fail")` → `typeAndSend("R18：这条应当发不出去。")` → 等错误块（`lastErrorText()` 非空）→ 读文件 / 入口 / 发送计数 → `setSendFailure(null)` → 截图 `r18-1d-send-failed.png`（整窗） | ⑬ 发送被拒（错误块在场、`sendCalls()` 计数按既有语义变化）；⑭ 目标条目两键**逐字不变**（`lastSessionAt` = 相位 1 的读数）；⑮ 入口文本前缀仍逐字相同（后缀仍 ∈ 允许集）且现场文件 `lastSessionAt` 与相位 1 逐字相等（MF5：判据落数据面） | `{ phase, errorText, pairBefore, pairAfter, entryText, sendCount }` |

**场景 `r18-2`（组 `r18-old-format`，2 条 record，2 张截图）**

前置：`setSessions(SESSIONS_A)` → `enterWorkspaceWithState({ version: 1, lastDocPath: "sample-paper.pdf", documents: { "sample-paper.pdf": { page: 2, scale: 1, updatedAt: SEED_AT } } })`（**旧格式：无两键**）→ `waitResumeEntry()`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `old-format-silent` | 读 `.reader-resume` 文本 / `.reader-discuss` 计数 / warn 增量 / 现场文件 → 截图 `r18-2-old-format.png`（整窗） | ① `.reader-resume` 文本逐字 `继续阅读：sample-paper.pdf · 第 2 页`（R6 入口零改动）；② `.reader-discuss` 计数 **0**（无记录零占位）；③ `warnCount()` 增量 **0**；④ 现场文件条目 `hasOwnProperty("lastSessionPath") === false`（读侧不造字段） | `{ phase, resumeText, entryCount, warnDelta, hasPairKey }` |
| `open-switch-no-write` | 点 `.reader-resume` → `waitPdfLoaded()` + `waitPage(2, 3)` → `clickNext()` → `waitPage(3, 3)` → `waitState(STATE_FILE_A, (s) => s.documents["sample-paper.pdf"].page === 3 && s.documents["sample-paper.pdf"].updatedAt > SEED_AT)` → 读文件 → `openSessionMenu()` + `clickSessionItem("消融实验对照")` + `closeSessionMenu()` → 再读文件 / 入口 → 截图 `r18-2b-open-switch.png`（整窗） | ⑤ 打开文档确实写盘（`page === 3`、`scale === 1`、`updatedAt > SEED_AT`）而**仍无** `lastSessionPath` 键（MF1：夹具条目 `{page: 2, scale: 1}` + `lastDocPath` 播种的 `committed` 与续读落点全等 ⇒ 不开 IPC，必须翻页才能造出写入）；⑥ 切换会话后仍无该键；⑦ `.reader-discuss` 计数 **0**（打开文档后依旧零占位）；⑧ `warnCount()` 增量 **0** | `{ phase, page, pairKeyAfterOpen, pairKeyAfterSwitch, entryCount, warnDelta }` |

**场景 `r18-3`（组 `r18-session-missing`，2 条 record，2 张截图）**

前置：`setSessions(SESSIONS_A)` → `enterWorkspaceWithState({ version: 1, lastDocPath: "sample-paper.pdf", documents: { "sample-paper.pdf": { page: 1, scale: 1, updatedAt: PAST_AT, lastSessionPath: path.join(CONFIG.root, ".pix-read", "session-gone.jsonl"), lastSessionAt: PAST_AT } } })`（该会话**不在**列表里）→ `openRow("sample-paper.pdf")` → `waitPdfLoaded()` + `waitPage(1, 3)`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `session-gone` | 读 `.reader-discuss` 计数 / 新增类名在 `.center-pill` 与 `.chat-panel` 内的计数 / warn 增量 / 现场文件 → `openSessionMenu()` → 读标记 → `closeSessionMenu()` → 截图 `r18-3-session-gone.png`（整窗） | ① `.reader-discuss` 计数 **0**（会话不在列表 ⇒ 静默隐藏）；② `.center-pill` 内 `.reader-discuss` 与 `.chat-panel` 内 `.session-doc-mark` 计数 **0**，且 `最近讨论：` 只出现在 ChatPanel 的 tooltip 常量 1 处（走查，N1）；③ `warnCount()` 增量 **0**；④ 现场文件两键逐字保留（读侧不改写文件）；⑤ 菜单里 `.session-doc-mark` 计数 **0** | `{ phase, entryCount, noticeContainers, warnDelta, pair, markCount }` |
| `session-restored` | [**代码审查（R18）MF2 / `R18-req` §0.10 登记 2**] `js("window.__pixStub.setSessions(SESSIONS_GHOST), true")` → 读切换前 `.reader-discuss` 计数（防空：**0**）→ `openSessionMenu()` + `sessionMenuProbe()` 读菜单行，取活动行标题 → **自确定前置**：活动行标题 ≠ `摘录与笔记走查` 时 `clickSessionItem("摘录与笔记走查")` + `waitPillSession("摘录与笔记走查")` + 重开菜单（把活动会话显式钉为「摘录与笔记走查」；该行已是活动行时为幂等 no-op）→ 记 `switchSessionCalls()` 基线 → `clickSessionItem("消融实验对照")`（**冻结字面恢复为决定性点击**：此刻该行必然是非活动行 ⇒ 真实 `switch_session`）+ `closeSessionMenu()`（既有切换触发的 `listSessions` 刷新列表）→ `waitDiscussText("继续讨论：丢失后恢复的会话 · 昨天")` → 读 `switchSessionCalls()` / 菜单标记（含活动行）/ 现场文件 → 截图 `r18-3b-session-restored.png`（`rectOfSelector(".center-pill", 12)`） | ⑥ 入口出现且文本与 `title` 逐字（`· 昨天`；`title` = 文本 + `；点击打开该会话`）；⑦ 菜单里 `.session-doc-mark` 计数 **1** 且 `title` 逐字 `最近讨论：sample-paper.pdf`；⑧ 现场文件两键与 `page` 逐字不变（列表刷新不写盘，且恢复不粘滞）；**新增**⑨ 切换前 `.reader-discuss` 计数 **0**（记录会话不在列表 ⇒ 入口隐藏）；⑩ `switchSessionCalls()` 计数增量 ≥ 1 且 `paths` 末项逐字 = `SESSIONS_A[1].path`（真实调用链与载荷）；⑪ 切换后菜单活动行 = `消融实验对照` 且 `active === true` | `{ phase, entryText, entryTitle, entryCountBefore, switchBase, switchCalls, pinClicked, activeBefore, activeAfter, markCount, markTitle, pairBefore, pairAfter, page }` |

**场景 `r18-4`（组 `r18-workspace-isolation`，2 条 record，2 张截图）**

前置：`setSessions(SESSIONS_A)` → `enterWorkspaceWithState({ version: 1, lastDocPath: "sample-paper.pdf", documents: { "sample-paper.pdf": { page: 1, scale: 1, updatedAt: PAST_AT, lastSessionPath: SESSIONS_A[0].path, lastSessionAt: PAST_AT } } })` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` + `waitPage(1, 3)` → `openSessionMenu()` + `clickSessionItem("消融实验对照")` + `closeSessionMenu()`（MF2：显式把活动会话钉为**非**记录会话）→ 先断言 `.reader-discuss` 在场（防空）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `workspace-b` | 读 A 文件 sha1 → `goHome()` → `js("window.__pixStub.setSessions(SESSIONS_A, LIBRARY_B_DIR), true")`（**设计评审 MF3**：以 B 根重种 `SESSIONS_A` ⇒ B 列表非空，判据 ① / ③ 获得判别力）→ `enterWorkspace(LIBRARY_B_NAME)` → `waitTreeRows(1)` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` + `waitPage(1, 3)` → `waitState(STATE_FILE_B, (s) => s.documents["sample-paper.pdf"] && s.documents["sample-paper.pdf"].page === 1)`（等一次落点写盘）→ `openSessionMenu()` + `sessionMenuProbe()` + `closeSessionMenu()`（读菜单行与标记）→ 读入口 / B 文件 → 截图 `r18-4-workspace-b.png`（整窗） | ① B 工作区 `.reader-discuss` 计数 **0**（B 列表已按 B 根种入（非空），而 B 现场条目无有效对 ⇒ `currentDiscussion === null`；判别力：**设计评审 MF3**——B 列表非空后本判据不再结构性恒真，渲染层若持有可命中种子列表的驻留对（如 `saveEpoch` 守卫缺失导致跨复位迟到写响应回灌），入口即渲染、本判据变红）；② B 现场文件目标条目**在场**且 `hasOwnProperty("lastSessionPath") === false`（`waitState` 已消 600ms 去抖竞态）；③ 菜单内 `摘录与笔记走查` / `消融实验对照` 两行在场（证明 B 列表确已种入、判据非空断言；**设计评审 MF3**）且全菜单 `.session-doc-mark` 计数 **0**；④ A 现场文件 sha1 不变（B 侧操作不触碰 A 文件）；⑤ `warnCount()` 增量 **0** | `{ phase, entryCount, bState, menuRowCount, markCount, aShaSame, warnDelta }` |
| `back-to-a` | `goHome()` → `js("window.__pixStub.setSessions(SESSIONS_A, LIBRARY_DIR), true")`（重种 A 根；`workspace-b` 已把种子根切到 B，本相位需还原）→ `enterWorkspace(LIBRARY_NAME)` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` → `waitDiscussText("继续讨论：摘录与笔记走查 · 昨天")` → 读 A 文件 → 截图 `r18-4b-back-to-a.png`（`rectOfSelector(".center-pill", 12)`） | ⑥ 入口恢复且文本逐字 `继续讨论：摘录与笔记走查 · 昨天`（`title` = 文本 + `；点击打开该会话`）；⑦ A 文件两键逐字不变（回切不丢记录、不重复写） | `{ phase, entryText, entryTitle, pairSame }` |

**场景 `r18-5`（组 `r18-session-mark`，2 条 record，2 张截图）**

前置：与 `r18-4` 前置逐字相同（`setSessions(SESSIONS_A)` + `enterWorkspaceWithState(...)` 带对指向 `SESSIONS_A[0].path` + `openRow("sample-paper.pdf")` + `waitPdfLoaded()` + `waitPage(1, 3)`），但末尾的会话点击改为 `clickSessionItem("摘录与笔记走查")`（MF2：把活动会话显式钉为**记录会话**；已是活动会话 ⇒ 幂等 no-op），随后断言 `.reader-discuss` 计数 **0**（防空：入口在「活动会话 = 记录会话」下按设计隐藏）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `mark-visible` | `openSessionMenu()` → 读 `sessionMenuProbe()` → 截图 `r18-5-session-mark.png`（整窗，菜单打开）→ `closeSessionMenu()` | ① `.session-doc-mark` 计数恰 **1**、所在行标题逐字 `摘录与笔记走查`、`title` 逐字 `最近讨论：sample-paper.pdf`；② `消融实验对照` 行的 `marked === false`；③ `新对话` / `重命名当前对话` / `历史对话` 三个文本在场、`.session-delete-btn` 计数 **1** 且 `title` 逐字 `删除该对话`（活动行无按钮、非活动行有）；④ `.reader-discuss` 计数 **0**（与 §1.4.1「活动行同样显示标记」不矛盾：**标记与活动无关、入口与活动有关**） | `{ phase, items, markCount, markTitle, deleteCount, entryCount }` |
| `mark-absent` | `openRow("long-book.pdf")` → `waitPdfLoaded()` → `openSessionMenu()` → 读标记与入口 → 截图 `r18-5b-mark-absent.png`（整窗，菜单打开）→ `closeSessionMenu()` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` → 复读 | ⑤ 无记录文档下 `.session-doc-mark` 计数 **0** 且 `.reader-discuss` 计数 **0**；⑥ 切回后**标记恢复**（`title` 逐字 `最近讨论：sample-paper.pdf`）且 `.reader-discuss` 计数仍为 **0**（活动会话仍是记录会话 ⇒ 入口预期隐藏，MF2），现场文件 `sample-paper.pdf` 条目两键逐字不变（读-改-写不丢对）；⑦ `warnCount()` 增量 **0** | `{ phase, markCount, entryCount, restoredMark, restoredEntryCount, pairSame, warnDelta }` |

#### 1.5.6 截图清单（12 张，冻结）

`r18-1-send-records.png`（整窗）、`r18-1b-discuss-entry.png`（`rectOfSelector(".center-pill", 12)`）、`r18-1c-discuss-switched.png`（整窗）、`r18-1d-send-failed.png`（整窗）、`r18-2-old-format.png`（整窗）、`r18-2b-open-switch.png`（整窗）、`r18-3-session-gone.png`（整窗）、`r18-3b-session-restored.png`（`rectOfSelector(".center-pill", 12)`）、`r18-4-workspace-b.png`（整窗）、`r18-4b-back-to-a.png`（`rectOfSelector(".center-pill", 12)`）、`r18-5-session-mark.png`（整窗，菜单打开）、`r18-5b-mark-absent.png`（整窗，菜单打开）。

#### 1.5.7 场景级验收判据与既有面零位移论证

| # | 判据 |
| --- | --- |
| 1 | 5 组 record 全绿、12 张截图齐备（少一张即红）；新增 5 种 label 的条数与 §1.5.1 逐字一致 |
| 2 | 既有场景函数体零改动（`git diff` 只显示：`SEL` 2 项、stub 会话与现场镜像扩展、新 helper、`r18-1`…`r18-5`、**§2.3 #1 登记的 2 行既有断言更新**）；既有 174 张 / 253 条 / 69 种 label 零缺失 |
| 3 | 新增截图的矩形取法与 R14 / R16 一致（整窗无 rect；`.center-pill` 用 `rectOfSelector(".center-pill", 12)`） |
| 4 | stub 既有行为零破坏：`grep -c "listSessionsCalls" scripts/ui-shot.mjs` 不减；**未种入时** `listSessions` 对任何根都返回 `[]`（r15-f16 的 `listSessionsDelta` 断言不受影响）；`pix/package.json` 零 diff；`api` 面恒 42 方法 |
| 5 | 真实删除路径（N3）：登记为等价覆盖 —— 删除路径与 `session-gone` 归结为**同一谓词**（列表内路径命中失败 ⇒ `currentDiscussion === null`），且两条路径都保留现场记录原样；不新增相位（保持 5 场景 / 11 record / 12 张截图配额） |
| 6 | 既有场景零位移的推导：既有夹具**没有任何条目带两键**、stub 的 `listSessions` **未种入 ⇒ 恒空列表** ⇒ `currentDiscussion` 在既有场景恒为 `null` ⇒ `.reader-discuss` 与 `.session-doc-mark` 恒不渲染 ⇒ 既有 174 张截图的像素内容、253 条测量、69 种 label 预期零差异 |

### 1.6 走查判据（命令级，正反双向）

```bash
cd E:/develop/PiX-Read

# ① 现场字段与实现点
grep -rn "lastSessionPath" pix/src | wc -l                      # ≥ 4（shared/types.ts 2 + main/reader-state-store.ts ≥ 2）
grep -rn "lastSessionPath\|lastSessionAt" pix/src/renderer/components | wc -l   # 0
grep -c "MAX_SESSION_PATH_LENGTH = 2048" pix/src/main/reader-state-store.ts     # 1
grep -rn "MAX_SESSION_PATH_LENGTH" pix/src/renderer | wc -l     # 0

# ② 零新 IPC（MF9：单文件口径 1 + 跨目录口径 2）
git diff -- pix/src/main/ipc-handlers.ts pix/src/main/preload.ts pix/src/main/session-bridge.ts \
  pix/src/renderer/stores/session-store.ts pix/src/renderer/stores/project-store.ts \
  pix/src/renderer/stores/reader-store.ts pix/src/renderer/utils/session-title.ts \
  pix/scripts/smoke-view.mjs pix/package.json package-lock.json pix/build packages   # 逐条为空
grep -c "reader-state-save" pix/src/main/ipc-handlers.ts        # 1（与基线相同）
grep -rn "reader-state-save" pix/src | wc -l                    # 2（:555 + preload.ts:176）

# ③ 呈现层字面与计数
grep -rn "reader-discuss" pix/src | wc -l                       # 5
grep -c "reader-discuss" pix/src/renderer/components/workspace/ReaderPanel.vue  # 5
grep -rn "继续讨论" pix/src                                     # 命中文件数 = 1（行数不作判据）
grep -rn "mdi-forum-outline" pix/src | wc -l                    # 1
grep -rn "session-doc-mark" pix/src | wc -l                     # 2
grep -rn "mdi-file-link-outline" pix/src | wc -l                # 1
grep -rn "最近讨论：" pix/src | wc -l                            # 1
grep -rn "reader-resume" pix/src | wc -l                        # 3（保持）
grep -rn "pill-session" pix/src | wc -l                         # 3（保持）
grep -rn "session-delete-btn" pix/src | wc -l                   # 4（保持）
grep -rn "历史对话" pix/src | wc -l                              # 2（保持）

# ④ 提交路径唯一与调用点唯一（MF4 / MF6）
grep -c "readerStateSave" pix/src/renderer/stores/reader-state-store.ts   # 1
grep -c "noteDiscussion" pix/src/renderer/stores/reader-state-store.ts    # 2
grep -c "noteDiscussion" pix/src/renderer/components/workspace/ChatPanel.vue   # 1
grep -rn "noteDiscussion" pix/src/renderer/components/workspace/PdfViewer.vue \
  pix/src/renderer/components/workspace/ReaderPanel.vue pix/src/renderer/pages/WorkspacePage.vue | wc -l   # 0
grep -c "currentDiscussion" pix/src/renderer/stores/reader-state-store.ts      # 2
grep -rn "currentDiscussion" pix/src/renderer/components | wc -l               # ≥ 2（ReaderPanel 1 + ChatPanel 2 中的使用）
grep -rn "currentDiscussion" pix/src/renderer/pages | wc -l                    # 0
grep -rn "documents\[" pix/src/renderer/components | wc -l                     # 0

# ⑤ 既有通道零增量
grep -rn "switch_session" pix/src/renderer | wc -l                             # 1（零增量）
grep -rn "sendCommand\|ipcRenderer" pix/src/renderer/components/workspace/ReaderPanel.vue | wc -l   # 0
grep -c "await" pix/src/main/reader-state-store.ts                             # 1（仅头部注释）

# ⑥ 既有脚本面零删除零改写（smoke-view 必须 0；ui-shot 只允许 4 处 §1.5.2 登记的 stub 行 + §2.3 #1 登记的 2 行既有断言 = 6 行）
for f in pix/scripts/smoke-view.mjs pix/scripts/ui-shot.mjs; do echo -n "$f -lines: "; git diff -U0 -- "$f" | grep -cE "^-[^-]"; done
sed -n '/^const SEL = {/,/^};/p' pix/scripts/ui-shot.mjs | grep -cE '^  [a-zA-Z]+: '   # 74（72 → 74；范围自动覆盖到 `};`）
grep -c "  check(" pix/scripts/smoke-notes.mjs                                 # 71（65 → 71）
grep -c "  check(" pix/scripts/smoke-view.mjs                                  # 74（零改动）
git status --short                                                             # 只见 §4 白名单内的文件
```

---

## 2. 与既有冻结面的关系

### 2.1 本轮不得改动的既有冻结面（零改动清单）

| 来源 | 冻结内容（本轮零改动） |
| --- | --- |
| R6 | **`.reader-resume` 的文案与结构**：模板 `ReaderPanel.vue:217-220`（`继续阅读：{name} · 第 {N} 页`）、`v-if="resumeEntry"` 单分支、样式 `:383` / `:400`、`resumeEntry` 的 `ready` + `lastDoc` 双闸、`openResumeEntry` `:150-152`；`grep -rn "reader-resume" pix/src \| wc -l` 保持 **3** |
| R6 | **`reader-state.json` 既有字段与语义**：`version: 1`、`lastDocPath`（原大小写相对路径 + 交叉过滤）、`documents` 键域、条目 `page` / `scale` / `updatedAt`（非关键、读出为 0）、条目级裁剪、序列化缩进、原子写协议（`mkdir → <target>.tmp → renameSync`）、主进程唯一写者、同一函数体内零 await |
| R6 | **四条降级语义**：`missing`（首启、`degraded:false`、不记 warn）/ `corrupt`（`degraded:true` + 恰 1 行 warn；save 侧 copy-first 备份后重建）/ `version-unsupported`（load 降级；save 拒写且原文件字节不变、error 逐字 `阅读状态文件版本不支持（未写入）`）/ `read-failed`（load 降级；save 拒写）；`no-root` 静默；`outside` / `invalid-input` 拒绝语义 |
| R8 | 发送链路：`readFilePath` `:392` / `readPage` `:393` 各只读一次的快照、`<reading_context>` 载荷构造、`appendOptimisticUserMessage` / `failOptimisticUserMessage`、`sendSteer` / `sendPrompt` 的实参与 `sendCommandOrThrow` 语义、catch 分支的草稿 / 附件还原与认证引导、`finally`（`:443-446`） |
| R10 | 会话菜单既有类名与文案：`.pill-session`、`.session-menu-divider`、`.session-delete-btn`（含两击确认 `再次点击确认删除` / `删除该对话`）、`新对话` / `重命名当前对话` / `历史对话` / `暂无历史对话`、`isActiveSession` 的活动判定与「活动会话不渲染删除按钮」、`onSelectSession` 的 early-return |
| R14 | `notes-stat` 的 stat 语义与刷新链路：`ipcMain.handle("notes-stat", …)`（`ipc-handlers.ts:547`）的 `size` / `mtimeMs` / `hash` 口径、`.notes-stale` / `.stale-refresh` 与「刷新只读」；`notes.json` / 笔记面板 / 报告链路零 diff |
| R14 / R16 / R17 | **取证脚本契约**：`ui-shot.mjs` 启动守卫（`PIX_SHOT_ROOT` 必须在 `os.tmpdir()` 之下且与仓库互不包含，`:11545-11560`）、产物自净（只删 `<OUT_ROOT>/shots`）、结束自检（截图集合与清单双向相等 + 白名单外条目即失败，`:11645-11667`）、`SEL` 既有 72 项与既有场景 / 截图 / label 零删除零改写（**唯一登记例外 = §2.3 #1**：`map-chapter-filter` 相位 `injection` 的 2 行既有断言更新，负责人已追认）、`record` 的「先落测量再抛错」（`:1619-1622`）、`smoke-notes.mjs` 既有 65 条与 `smoke-view.mjs` 既有 74 条零改写 |
| 全局 | 既有类名 `.reader-*` / `.pdf-*` / `.notes-*` / `.map-*` / `.pill-*` / `.session-*` 与既有中文文案；`--pix-*` 变量表（**不新增变量**）；`.center-pill` 既有子元素（`.pill-label` 文本 / `.pill-icon-btn` / `.map-toggle` / `.shortcut-toggle`）；`pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`、`pix/src/main/session-bridge.ts`、`pix/src/renderer/stores/session-store.ts`、`pix/src/renderer/stores/project-store.ts`、`pix/src/renderer/stores/reader-store.ts`、`pix/src/renderer/utils/session-title.ts`、`pix/scripts/smoke-view.mjs`、`pix/package.json`（零 diff） |
| 反需求 | R18-req §6 全表（不改内核会话文件、不跨工作区聚合、不自动恢复会话、不做会话内文档索引、不改 `notes.json`、不引入依赖、零新 IPC、不做第二入口、不做第二种降级形态、不加动画 / 新变量、不删改既有场景、不每次翻页写记录、不写死代码） |

### 2.2 本轮对既有面的显式改动（逐字：文件 / 位置 / 旧值 / 新值 / 理由）

| # | 文件 : 位置 | 旧值 | 新值 | 理由 |
| --- | --- | --- | --- | --- |
| 1 | `shared/types.ts:472-476`（`ReaderDocState`） | 三字段体 | 追加两个可选字段（含逐字注释） | N100-1；只增不改 |
| 2 | `shared/types.ts:492-496`（`ReaderStateSaveDraft`） | 三字段体 | 追加两个可选字段（含逐字注释） | N100-1；IPC 守卫 `:301-312` 原样透传 ⇒ 零 IPC 改动 |
| 3 | `ChatPanel.vue:428`（`send()` 的流式分支） | `      return;` | `    } else {`（并把 `sendPrompt` 支收进 `else` 块；随后 try 尾部新增一行 `readerStateStore.noteDiscussion(readFilePath, readPage, readScale, sendingSessionPath);`） | MF4：`noteDiscussion` 成为 try 尾部的**唯一**调用点（`grep -c` = 1）；该分支之后 try 内无其它语句 ⇒ 控制流等价；`send()` 既有语句除这一处外零改写 |
| 4 | `ChatPanel.vue:960`（`#append` 槽） | `<template v-if="!isActiveSession(session) && !isStreaming" #append>` | `<template #append>` + `.session-delete-btn` 自身带 `v-if="!isActiveSession(session) && !isStreaming"` | 让活动会话行也能出现标记（§1.4.1「与活动会话无关」）；**DOM 非逐字等价**（每行多一枚空 `div.v-list-item__append`，视觉零位移，MF10 登记） |
| 5 | `ui-shot.mjs` stub（9 处，逐字见 §1.5.2） | 见 §1.5.2 的「旧行」列 | 见 §1.5.2 的「新行」列 | N103-2：`setSessions` / `switchSessionCalls` / 按根返回 / `switch_session` 记录 + 镜像 / reader-state 镜像支持两键 |
| 6 | `smoke-notes.mjs` 的 `runReaderStateStore`（`:1226-1321`） | 5 条断言 | 追加 #6–#11（`:1317` 的 `#5` 收尾 `rmSync(STATE_A, …)` 之后、`:1318` 的 `} finally` 之前） | N103-1；既有 #1–#5 逐字不动 |

**允许的内容变化（非 diff，登记）**：① `.center-pill` 内新增 `.reader-discuss`（pill 变宽；`.pill-label` 的文本与 CSS 零变化）；② 会话菜单行内新增 `.session-doc-mark`（仅当前文档相关行）与每行一枚空 `div.v-list-item__append` 容器；③ 新增 12 张截图 / 11 条测量 / 5 种 label；④ 现场文件在 r18 相位内出现两键。

### 2.3 本轮改写的既有断言（逐字列出 = **1 处**，见下表）与零 diff 判据命令

**结论**：本轮改写既有断言 **1 处**（`map-chapter-filter` 相位 `injection` 的 2 行字节比较；负责人已追认，登记于 `R18-req` §0.10 登记 1）；其余断言面**零改写**。

| # | 文件 : label : 相位 | 旧值（逐字，2 行） | 新值（逐字） | 理由 | 判别力说明 |
| --- | --- | --- | --- | --- | --- |
| 1 | `pix/scripts/ui-shot.mjs` : `map-chapter-filter` : `injection` | `      stateBytesSame: fileHash(STATE_FILE_A) === stateHash52i,`<br>`      ...(fileHash(STATE_FILE_A) === stateHash52i ? [] : ["发送不得改写 reader-state.json"]),` | `      stateBytesChanged: fileHash(STATE_FILE_A) !== stateHash52i,`<br>`      stateSameExceptRecord: stateProjection(STATE_FILE_A) === stateBefore52i,`<br>`      stateBefore: stateBefore52i,`<br>`      stateAfter: stateProjection(STATE_FILE_A),`<br>断言行：`      ...(stateProjection(STATE_FILE_A) === stateBefore52i ? [] : ["过滤 / 选择 / 发送不得改写阅读现场（R18 讨论记录除外）"]),`（`stateProjection`（`:1693-1703`）忽略讨论两键与 `updatedAt`）；并在取基线前新增一次 `await waitState(STATE_FILE_A, (state) => state.documents["sample-paper.pdf"], "52-inject 落点写盘")`（去除 600ms 去抖竞态） | 该相位打开了 `sample-paper.pdf` 且发送成功 ⇒ 按 N100-4 的**冻结语义**必写两键与 `updatedAt` ⇒ 字节全等断言在该相位**结构上不可能为真**（实测 `stateBytesChanged = true`）。两份冻结字面（R16/R17 的字节断言 vs R18 的「成功即写」）的冲突，不是实现缺陷 | ① 同 label 的 `badge-click` 相位（`:4799` / `:4813`）**字节级断言按原样未动**，继续兜住「纯 UI 路径零写盘」；② 改写后仍逐字覆盖 `version` / `lastDocPath` / 条目集合 / 各条目 `page` + `scale`（仅忽略讨论两键与 `updatedAt`）；③ 「写记录不得波及其它条目」由 `r18-1` 判据 ③ 与烟测 #7 另证；④ 记录写入侧由本轮 11 条 `r18-*` record 正向覆盖 |

逐条论证（其余断言面）：

| 断言面 | 是否被改写 | 论证 |
| --- | --- | --- |
| `smoke-notes.mjs` 既有 65 条（含 `reader-state-store` #1–#5） | **否** | 新增只落在 `runReaderStateStore` 内、`#5` 之后；`#6–#11` 各自备夹具（§5.2），既有夹具与判据文本零编辑 |
| `smoke-view.mjs` 74 条 | **否** | 本轮不新增渲染层纯函数 ⇒ 编译面与断言零改动 |
| `ui-shot.mjs` 既有场景断言（含 r15-f16 的 `listSessionsDelta`） | **否** | `listSessions` 未种入 ⇒ 恒 `[]`（与旧实现逐字等价）；既有场景从不发 `switch_session`（§0.1 实读）⇒ 镜像分支不可达 |
| `ui-shot.mjs` 既有 reader-state 断言（`saveCalls` 计数 / `lastPayload.page` 等） | **否** | 只做字段级读取（`thirty.lastPayload.page === 3` 等），不做 payload 深比较（实读 `:2073`）；新增两键在未携带时为 `undefined` ⇒ `JSON.stringify` 省略 ⇒ 既有 `MEASUREMENTS.json` 读数零变化 |
| `ui-shot.mjs` 既有 `SEL` 72 项 | **否** | 只追加 2 项（末尾） |
| `ui-shot.mjs` 既有 helper | **否** | 7 个新 helper 全部独立命名；`enterCleanWorkspace` 只作蓝本 |

```bash
cd E:/develop/PiX-Read

# ① 既有断言面零删除（`-` 行只允许出现在登记的新增插入点紧邻处）
git diff -U0 -- pix/scripts/smoke-view.mjs | grep -cE "^-[^-]"          # 0
git diff -U0 -- pix/scripts/smoke-notes.mjs | grep -cE "^-[^-]"         # 0（纯追加）
# ② ui-shot 的 `-` 行只允许是 §1.5.2 登记的 4 处 stub 实现行 + §2.3 #1 登记的 2 行既有断言（共 6 行）
git diff -U0 -- pix/scripts/ui-shot.mjs | grep -cE "^-[^-]"            # 6
# ③ 产品侧既有冻结字面零改写
git diff -U0 -- pix/src/renderer/components/workspace/ReaderPanel.vue | grep -E "^[+-].*reader-resume" ; echo "RESUME_DIFF_EXIT=$?"   # 无输出
git diff -U0 -- pix/src/renderer/components/workspace/ChatPanel.vue | grep -E "^[+-].*(pill-session|session-menu-divider|session-delete-btn)" ; echo "MENU_DIFF_EXIT=$?"   # 无输出
git diff -U0 -- pix/src/renderer/pages/WorkspacePage.vue | grep -E "^[+-].*(pill-label|reader-under-pill)" ; echo "PILL_DIFF_EXIT=$?"       # 无输出
# ④ 主进程降级面零 diff（MF 口径）
git diff -U0 -- pix/src/main/reader-state-store.ts | grep -E "^[+-].*(DEGRADE_MESSAGES|ERROR_MESSAGES|uniqueBackupPath|writeFileAtomic|resolveLastDoc|toRelativeDocPath|isStoredDocPath|parseReaderState)" ; echo "DEGRADE_DIFF_EXIT=$?"   # 无输出
```

---

## 3. 失败路径表

| # | 失败情形（错误实现 / 环境异常） | 症状 | 首个变红的判据 | 期望行为（冻结） |
| --- | --- | --- | --- | --- |
| 1 | `parseDocState` 忘记把合法对带回 | 每次翻页保存静默清空**其它**文档的讨论记录；旧字段读写全正常 ⇒ 只在「换一篇文档后入口消失」时暴露 | 烟测 #7（其它条目两键逐字不变）；离屏 `r18-1` 判据 ③ | 成对带回（§1.1.2） |
| 2 | 写侧未携带时覆盖为「无对」 | 翻页 / 打开文档后入口与标记短暂消失 | 离屏 `r18-5` `mark-absent` 判据 ⑥（`pairSame`） | 未携带 ⇒ 保留既有对（§1.1.3） |
| 3 | 会话文件缺失 / 移走 / 不可读（不在 `projectStore.sessions`） | 入口与标记残留 ⇒ 点击抛错或切到别的会话 | 离屏 `r18-3` `session-gone` 判据 ① / ⑤；`r18-4` `workspace-b` 判据 ① | 静默隐藏、不弹提示、不写日志、现场记录保留原样（§1.3.7） |
| 4 | 旧格式现场文件（无两键） | 出现新的 `[reader-state]` warn / 被写入 `lastSessionPath: null` | 烟测 #8；离屏 `r18-2` `old-format-silent` 判据 ③ / ④ | 零报错、零 warn、零降级、不造字段（§1.1.5） |
| 5 | 损坏 / 版本不符（带两键） | 版本不符的文件被新代码覆盖；备份被静默覆盖（同名） | 烟测 #11；既有 #2–#4（回归） | `corrupt` copy-first 备份（名可加 `-n`）、`version-unsupported` 拒写且字节不变（§1.1.5） |
| 6 | 跨工作区串（B 库出现 A 的记录） | B 工作区出现 `.reader-discuss` 或标记；A 的现场文件被 B 侧写 | 离屏 `r18-4` 判据 ① / ② / ③ / ④ | B 条目无对 ⇒ 不渲染；A 文件 sha 不变；B 列表按 B 根种入（非空）⇒ 判据 ① / ③ 可捕获渲染层驻留对（§1.5.5 `r18-4`；**设计评审 MF3**） |
| 7 | 发送失败仍记录（把调用点放进 `finally` 或放在 `await` 之前） | 入口指向一次没发生的讨论 | 离屏 `r18-1` `send-failed` 判据 ⑭ / ⑮；`r18-2` 判据 ⑤ / ⑥ | 只有发送**成功返回后**才记录；catch / finally 不记录（§1.2.4） |
| 8 | 写入时机漂移（打开文档 / 切换会话就写记录） | 入口指向从未讨论过这篇论文的会话 | 离屏 `r18-2` `open-switch-no-write` 判据 ⑤ / ⑥ | 只有发送成功触发（§1.1.4） |
| 9 | 活动会话仍渲染入口 | 点了「没反应」（死路点击） | 离屏 `r18-1` 判据 ⑤ / ⑫；`r18-5` 判据 ④ / ⑥ | 比较键相等 ⇒ 隐藏（§1.3.4 闸 3） |
| 10 | 会话路径用原始 `===` 而非比较键 | 大小写 / 分隔符差异导致误判（活动会话不隐藏 / 记录会话匹配失败） | 走查 #3（`docPathKey` 出现处）；离屏 `r18-1` 判据 ⑨ | 两侧一律比较键（§1.2.5 / §1.3.6） |
| 11 | `noteDiscussion` 走裸 `bridge().readerStateSave(...)`（无 `saveEpoch`） | `goHome` / `onUnmounted` 复位后迟到响应回灌上一库的 `documents` / `lastDoc` | 走查 #4（`grep -c "readerStateSave"` = 1） | 复用 `submit()`（同一条守卫，§1.2.4） |
| 12 | `#append` 槽改动的连带破坏（改类名 / 改文案 / 改两击确认） | 既有删除语义与文案回归 | 走查 #3（`session-delete-btn` 保持 4 / `历史对话` 保持 2）；离屏 `r18-5` 判据 ③ | 只调整守卫位置，其余逐字不变（§1.4.2） |
| 13 | stub 未种入时 `listSessions` 返回非空 | r15-f16 的 `listSessionsDelta === 0` 与既有零位移推导同时失效 | 走查 #6（脚本 `-` 行面）+ r15-f16 回归 | 未种入 ⇒ 恒 `[]`（§1.5.3） |
| 14 | 状态未就绪时渲染半截入口 | 出现「无会话的空胶囊」 | 走查 #3（`ReaderPanel.vue` 内 `reader-discuss` 恰 5 行、无 `v-else` 占位）；离屏 `r18-2` 判据 ② | 四闸全过才渲染，零占位（§1.3.4 / §1.3.5） |
| 15 | 库外文件 / 未选库 | 入口猜测归属并指向他人会话 | §1.2.5 闸 ①（`currentDocKey` 为 null ⇒ `currentDiscussion` 为 null） | 不渲染（§1.3.5） |
| 16 | 面板间距 / pill 挤压（`.reader-discuss` 挤掉 `.pill-label`） | 文档名不可辨、pill 换行 | §8.1 必查项 + `r18-1` 判据 ⑧ 的 `.pill-label` 逐字断言 | 入口 `max-width: 240px` + 文本省略（登记取舍）；`.pill-label` 不被改写 |
| 17 | `noteDiscussion` 形参类型与实参不自洽（`string \| null` 实参传 `string` 形参） | 类型检查失败 ⇒ 唯一工程门（[check]）变红，实现无法落地 | 【check】`cd pix && npm run check` ⇒ `CHECK_EXIT != 0`（TS2345；首个变红判据 = `CHECK_EXIT`） | 形参域与实参同域（`string \| null`），函数内先收窄（§1.2.2；**设计评审 MF1**） |

---

## 4. 文件级清单（动作 + 具体改动点 + 不变量）

| # | 文件 | 动作 | 需求 | 具体改动点（不得越界） | 不变量 |
| --- | --- | --- | --- | --- | --- |
| 1 | `pix/src/shared/types.ts` | 修改 | N100-1 | `ReaderDocState`（`:472-476`）与 `ReaderStateSaveDraft`（`:492-496`）各追加两个可选字段（含 §1.1.1 的逐字注释） | 其余类型（`ReaderStateFile` / 错误码 / 降级原因 / 结果类型 / `SessionInfo` / `ReadingAnchor`）零改动 |
| 2 | `pix/src/main/reader-state-store.ts` | 修改 | N100-1…N100-4 | 新增 `MAX_SESSION_PATH_LENGTH = 2048`（`MAX_SCALE` 之后）与 `isValidSessionPath` / `isValidSessionAt`（`isValidScale` 之后）；`parseDocState` 成对带回；`saveReaderState` 的 `previous` / `carried` 与目标条目构造（§1.1.3） | 四条降级语义、`DEGRADE_MESSAGES` / `ERROR_MESSAGES`、`resolveLastDoc` / `toRelativeDocPath` / `writeFileAtomic` / `uniqueBackupPath` / `serializeState`、既有三字段与 `lastDocPath` 语义、函数体内零 await |
| 3 | `pix/src/renderer/stores/reader-state-store.ts` | 修改 | N100-4 / N100-5 / N101-2 | 新增 `DiscussionStamp`（内部）/ 导出 `DiscussionLink` / `noteDiscussion` / `currentDiscussion`；`applyLocal` 与 `submit` 各加可选第二参数（§1.2） | `capture` 三闸、`submitIfChanged` 比较表达式、`saveEpoch` 语句、`loadReaderState` 播种、`progressPageFor` / `requestRestoreFor` / `noteLanding` / `noteChange` / `flush` / `resetState` |
| 4 | `pix/src/renderer/components/workspace/ReaderPanel.vue` | 修改 | N101-1…N101-4 | 新增 `discussEntry` / `discussLabel` / `openDiscussion()`、emit 名 `open-session`、`.map-toggle` Teleport 之后的 `.reader-discuss` Teleport、三条样式（`:346` 与 `:348` 之间）、顶层 import `docPathKey` + `formatSessionTime` | `.reader-resume`（模板 `:217` / 样式 `:383` / `:400` / `resumeEntry` / `openResumeEntry`）、`.reader-empty` 空态结构、`.map-toggle` 的 Teleport 与 `mapToggleReady`、PDF / 文本 / 失败分支、`onBeforeUnmount` |
| 5 | `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改 | N100-4 / N102-1 / N102-2 | `send()` 的三处快照 + `return;` → `if/else` + try 尾部单一 `noteDiscussion` 调用；`docRelatedPath` / `docRelatedTitle` / `isDocRelatedSession`；`#append` 槽常驻 + `.session-doc-mark` + 一条样式（`:1351` 与 `:1353` 之间）；顶层 import `useReaderStateStore` + `docPathKey` | `<reading_context>` 载荷构造、`appendOptimisticUserMessage` / `failOptimisticUserMessage`、会话菜单既有类名与文案、`session-delete-btn` 的两击确认、`onSelectSession` / `isActiveSession`、既有 `.pill-session` / `.session-menu-divider` 样式 |
| 6 | `pix/src/renderer/pages/WorkspacePage.vue` | 修改 | N101-3 | 新增 `onOpenDiscussionSession(sessionPath)`（解析 + 两条 no-op 守卫 + `void onSwitchSession(session)`）与 `<ReaderPanel>` 上的 `@open-session` 绑定 | `onSwitchSession` / `onNewSession` / `onDeleteSession` / `openDocumentFromLibrary` / `selectLeftTab` / 两个 token watcher / `goHome` / `onMounted` / `onUnmounted` 的既有语句 |
| 7 | `pix/scripts/smoke-notes.mjs` | 修改 | N103-1 | `runReaderStateStore` 内追加 #6–#11（§5.2） | 既有 #1–#5、其它 9 组、`files` / `required` / `allowed` / 编译选项 / 自清理协议 / `main()` 调用顺序 |
| 8 | `pix/scripts/ui-shot.mjs` | 修改 | N103-2 | `SEL` +2（72 → 74）；stub 9 处（§1.5.2）；7 个新 helper 与 `SESSIONS_A` / `SESSIONS_GHOST` / `PAST_AT` / `SEED_AT`；`r18-1`…`r18-5`（5 组 11 条 record / 12 张截图） | 既有 72 个 `SEL` 键、既有场景函数体、既有 helper、既有截图与 label、启动守卫与结束自检、`writeFixtures` 的 A/B 清理 |
| 9 | `docs/pm/R18-*.md` | 新建 | — | 本档（`R18-design.md`）；后续 `R18-review.md`（设计评审）/ `R18-dev.md` | —— |

**不改（登记为不动）**：`pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`、`pix/src/main/session-bridge.ts`、`pix/src/renderer/stores/session-store.ts`、`pix/src/renderer/stores/project-store.ts`、`pix/src/renderer/stores/reader-store.ts`、`pix/src/renderer/utils/session-title.ts`、`pix/src/renderer/utils/notes-path.ts`、`pix/scripts/smoke-view.mjs`、`pix/package.json`。

**范围外（任何情况下不动）**：`packages/**`、`package-lock.json`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/src/renderer/assets/styles/**`（含 `variables.css`）、`pix/src/renderer/components/workspace/{PdfViewer,PdfSearchPanel,PdfSelectionQuickAsk,KnowledgeMap,NotesPanel,LibraryPanel,ShortcutOverview}.vue`、`pix/src/renderer/stores/{notes-store,settings-store,auth-store}.ts`、`pix/src/renderer/utils/**`、`.pix-read/notes.json` 与其写入链、`pix/resources/**`、`docs/pm/**` 的历史档件、`.gitignore`、`README.md`。

---

## 5. 验证方案

### 5.1 命令（按执行顺序）

```bash
cd E:/develop/PiX-Read/pix
export PATH="/c/Program Files/nodejs:$PATH"

# 步骤 0：动工前 —— 唯一工程门（本步已实跑：CHECK_EXIT=0）
npm run check

# 步骤 0b：交叉核对零缺失比对基线（R17 交付目录，只读）
node -e "const fs=require('fs');const d='C:/Users/86157/AppData/Local/Temp/pix-v06-r17c-review/shots';const m=JSON.parse(fs.readFileSync(d+'/MANIFEST.json','utf8'));const me=JSON.parse(fs.readFileSync(d+'/MEASUREMENTS.json','utf8'));console.log(JSON.stringify({shots:m.shots.length,failure:m.failure,measurements:me.length,labels:new Set(me.map(x=>x.label)).size,png:fs.readdirSync(d).filter(f=>f.endsWith('.png')).length}))"
# ⇒ 必须逐字得到 {"shots":174,"failure":null,"measurements":253,"labels":69,"png":174}；不一致则停线排查

# 步骤 0c：动工前基线（新目录，读数即本轮唯一基线）
PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v06-r18-base" ./node_modules/.bin/electron scripts/ui-shot.mjs ; echo "BASE_EXIT=$?"
# ⇒ 期望 BASE_EXIT=0 且 pix-v06-r18-base/shots/MANIFEST.json 的 shots.length = 174、failure = null（与 R17 目录读数一致）

# 步骤 1：A 面落地（类型 + 主进程 + 渲染层 store + 烟测）
npm run check && npm run smoke:notes        # ⇒ 通过 71 / 失败 0
npm run smoke:view                          # ⇒ 通过 74 / 失败 0（零改动回归）

# 步骤 2：B 面落地（两个组件 + 工作区页 + 离屏）后的工程门
npm run check

# 步骤 3：离屏验收（与基线不同目录）
PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v06-r18-verify" ./node_modules/.bin/electron scripts/ui-shot.mjs ; echo "AFTER_EXIT=$?"
# ⇒ 期望 AFTER_EXIT=0、产出 186 张截图、MANIFEST.failure === null、5 组 11 条 record 全绿、12 张新截图齐备

# 步骤 4：零缺失比对（逐字命令见 §5.4）
# 步骤 5：零残留与工程门（§5.6）
```

### 5.2 烟测-主进程：`pix/scripts/smoke-notes.mjs` 的 `reader-state-store` 组追加 #6–#11（逐条）

夹具（手写常量，加在 `runReaderStateStore` 顶部）：`SESS = join(TMP, "agent", "sessions", "session-a.jsonl")`（**库外绝对路径**，证明原样存取）、`T = 1758000000000`、`SESS_B = join(TMP, "agent", "sessions", "session-b.jsonl")`、`T_B = 1758000001000`；每条断言前 `warns.length = 0`（增量口径）。

| # | 夹具与步骤 | 判据（失败即红） |
| --- | --- | --- |
| 6 | `rmSync(STATE_A, {recursive:true, force:true})` 后 `saveReaderState({ docFilePath: DOC_A, page: 2, scale: 1.2, lastSessionPath: SESS, lastSessionAt: T })` | `success === true`；`state.documents["sample-paper.pdf"]` 逐值 `page === 2` / `scale === 1.2` / `lastSessionPath === SESS` / `lastSessionAt === T` / `updatedAt` 为 `> 0` 的有限数；**磁盘文件**（`JSON.parse(readFileSync(STATE_A))`）同条目同四值（含库外路径原样、未被相对化）；`warns.length === 0` |
| 7 | `writeFileSync(STATE_A, JSON.stringify({ version: 1, lastDocPath: "sample-paper.pdf", documents: { "sample-paper.pdf": { page: 2, scale: 1.2, updatedAt: T, lastSessionPath: SESS, lastSessionAt: T }, "archive/older-paper.pdf": { page: 7, scale: 1, updatedAt: T, lastSessionPath: SESS_B, lastSessionAt: T_B } } }, null, 2) + "\n")` → `saveReaderState({ docFilePath: DOC_A, page: 3, scale: 1 })` | 目标条目 `page === 3` 且两键逐字仍为 `SESS` / `T`；第二条目两键逐字仍为 `SESS_B` / `T_B`（其它条目一字不动）；`warns.length === 0` |
| 8 | 写旧格式文件（条目仅 `page` / `scale` / `updatedAt`）→ `loadReaderState()` → 一次**不带两键**的 `saveReaderState({ docFilePath: DOC_A, page: 2, scale: 1 })` | `degraded === false`、`reason === undefined`、`warns.length === 0`；加载条目 `hasOwnProperty("lastSessionPath") === false`；save 后**磁盘条目仍无**两键（不得凭空造字段） |
| 9 | 先 seed 有效对（同 #7 的单条目文件），再以下列 **9 种**形态逐一 `saveReaderState({ docFilePath: DOC_A, page: 2, scale: 1.2, ...patch })`：① `lastSessionPath: ""` ② `lastSessionPath: 42` ③ `lastSessionPath: "a".repeat(2049)` ④ `lastSessionPath: "a\u0000b"` ⑤ 只给 `lastSessionPath: SESS_B`（不给 `lastSessionAt`）⑥ `lastSessionAt: 0` ⑦ `lastSessionAt: -1` ⑧ `lastSessionAt: NaN` ⑨ `lastSessionAt: "123"` | 每次 save 后目标条目两键逐字仍为 seed 值，且磁盘条目的 `hasOwnProperty("lastSessionPath") === hasOwnProperty("lastSessionAt")`（**不出现半截字段**）；`warns.length === 0`（每条之后复零） |
| 10 | 手写三条目文件：A = 合法对（`SESS` / `T`）；B = `archive/older-paper.pdf` 带 `lastSessionAt: "x"`（只给 at 且非法）；C = `reading-notes.md` 带 `lastSessionPath: SESS_B`（只给 path）→ `loadReaderState()` | A 两键逐值保留；B / C 的 `page` / `scale` 照常生效且**两键均不存在**；`degraded === false`、`warns.length === 0` |
| 11 | （a）带两键的文件被截断（写入半截 JSON）→ `loadReaderState()` → `readdirSync(PIX_READ_A)` 取**操作前后差集** → `saveReaderState({ docFilePath: DOC_A, page: 1, scale: 1 })`；（b）`version: 2` 且带两键的文件 → `loadReaderState()` → `saveReaderState(...)` | （a）load 降级恰 1 条 warn（`reason === "corrupt"`，**先记 load 的 warn 增量 = 1**，save 会额外产生 1 条备份 warn —— 不计入本条）；备份差集**恰 1** 个、文件名匹配 `/^reader-state\.json\.corrupt-\d{8}-\d{6}(-\d+)?$/`（不得用绝对计数，N6）；重建条目**无**两键；（b）load 降级、save `success === false` 且 `error` 逐字 `阅读状态文件版本不支持（未写入）`、原文件 sha256 不变 |

**末尾**：`rmSync(STATE_A, { recursive: true, force: true })`（与 #5 同款自净），`finally` 恢复 `console.warn`。

**验收**：`npm run smoke:notes` ⇒ 退出码 0、末行逐字 `通过 71 / 失败 0`；连续两次运行结果相同；既有 10 组 65 条零改写（`git diff -U0` 无 `-` 行）。

### 5.3 烟测-渲染：`pix/scripts/smoke-view.mjs`（9 组 74 条，**零改动**）

本轮**不新建渲染层纯函数**（§0.0 第 4 条）⇒ 该脚本的编译面与 74 条断言零改动，只作回归（`npm run smoke:view` ⇒ 退出码 0、末行逐字 `通过 74 / 失败 0`）。`grep -c "  check(" pix/scripts/smoke-view.mjs` 保持 **74**。

### 5.4 基线与零缺失比对（基线 = `C:/Users/86157/AppData/Local/Temp/pix-v06-r17c-review`）

```bash
cd E:/develop/PiX-Read/pix

# ① 截图集合零缺失 + 新增张数 + failure 字段（基线 174 → 验收 186）
node -e "const fs=require('fs');const b='C:/Users/86157/AppData/Local/Temp/pix-v06-r17c-review/shots';const a='C:/Users/86157/AppData/Local/Temp/pix-v06-r18-verify/shots';const bm=JSON.parse(fs.readFileSync(b+'/MANIFEST.json','utf8'));const am=JSON.parse(fs.readFileSync(a+'/MANIFEST.json','utf8'));const bn=bm.shots.map(s=>s.name);const an=am.shots.map(s=>s.name);const r18=an.filter(n=>n.startsWith('r18-')).sort();console.log(JSON.stringify({base:bn.length,after:an.length,missing:bn.filter(n=>!an.includes(n)),r18:r18.length,added:an.filter(n=>!bn.includes(n)).length,failure:am.failure}))"
# ⇒ base:174、after:186、missing:[]、r18:12、added:12、failure:null

# ② label 零缺失 + 新增 5 种（基线 69 → 验收 74）
node -e "const fs=require('fs');const b='C:/Users/86157/AppData/Local/Temp/pix-v06-r17c-review/shots';const a='C:/Users/86157/AppData/Local/Temp/pix-v06-r18-verify/shots';const cnt=(p)=>{const m=JSON.parse(fs.readFileSync(p+'/MEASUREMENTS.json','utf8'));const x={};for(const e of m)x[e.label]=(x[e.label]||0)+1;return x};const bc=cnt(b),ac=cnt(a);const missing=Object.keys(bc).filter(k=>!ac[k]||ac[k]<bc[k]);const r18=Object.entries(ac).filter(([k])=>k.startsWith('r18-'));console.log(JSON.stringify({baseLabels:Object.keys(bc).length,afterLabels:Object.keys(ac).length,baseMeasurements:Object.values(bc).reduce((s,v)=>s+v,0),afterMeasurements:Object.values(ac).reduce((s,v)=>s+v,0),missing:missing,r18:r18}))"
# ⇒ baseLabels:69、afterLabels:74、baseMeasurements:253、afterMeasurements:264、missing:[]、r18 = 5 组 11 条

# ③ 本轮基线目录（步骤 0c）与验收目录的交叉核对：本轮基线每个 label 的条数不得减少
# ⇒ r18BaseLabels:69、afterLabels:74、missing: []（两条比对都要过）

# ④ 产物目录白名单（脚本内已自检；此处人工复核）
ls C:/Users/86157/AppData/Local/Temp/pix-v06-r18-verify/shots | grep -vE '\.png$|^(MANIFEST|MEASUREMENTS)\.json$' ; echo "STRAY_EXIT=$?"   # 无输出

# ⑤ 新增相位的现场读数（供 dev 档登记与人工复核）
grep -n '"label": "r18-' C:/Users/86157/AppData/Local/Temp/pix-v06-r18-verify/shots/MEASUREMENTS.json | head -20
```

### 5.5 走查清单（一次跑完，逐条对人）

见 §1.6 的 6 组命令；另加：

```bash
git status --short                                  # 只出现 §4 白名单内的文件（新建 docs/pm/R18-*.md + 6 源文件 + 2 脚本）
git diff --stat                                     # 逐文件核对改动面（不得出现范围外文件）
grep -c "r18-" pix/scripts/ui-shot.mjs              # ≥ 12（5 个场景函数 + 12 张截图名）
grep -c "setSessions\|switchSessionCalls" pix/scripts/ui-shot.mjs   # ≥ 6（控制口 2 + 前置 5 处 - 1）
```

### 5.6 零残留与工程门

| # | 判据 |
| --- | --- |
| 1 | `cd pix && npm run check` ⇒ `CHECK_EXIT=0`（无 `any`、无内联动态 import、全部顶层 import；新增类型 / 动作 / 处理器全链路必填） |
| 2 | `git diff` 中 `ipc-handlers.ts` / `preload.ts` / `session-bridge.ts` / `session-store.ts` / `project-store.ts` / `reader-store.ts` / `package.json` / `package-lock.json` / `pix/build/**` / `packages/**` 全为空 |
| 3 | `git status --short` 只出现 §4 白名单内的文件 + 本档；仓库内无临时脚本 / 探针 / 调试日志 |
| 4 | `ui-shot.mjs` 的结束自检继续生效（截图集合与清单双向相等 + 白名单外条目即失败）；`smoke-notes.mjs` / `smoke-view.mjs` 运行后 `%TEMP%` 自建目录被删除 |
| 5 | 两次离屏**串行**执行（不并发）读数一致（label#phase 序列逐条一致） |

---

## 6. 风险 Top3 与判定方式

### R1「读-改-写把其它文档的记录吃掉」（最容易翻车，判定面最宽）

`saveReaderState` 的读-改-写把**其它条目**从解析结果带过，而 `parseDocState` 现在只产三字段 ⇒ 若忘记把合法对带回，**每次翻页 / 打开文档保存都会静默清空其它文档的讨论记录**（旧字段读写全部正常，问题只在「换一篇文档后入口消失」时暴露）。渲染层侧还有同款风险：`applyLocal` 未携带时若覆盖为「无对」，入口与标记会在每次落点写盘后短暂消失。

- 判定：烟测 #6（回读）/ #7（其它条目两键逐字不变）；离屏 `r18-1` `send-records` 判据 ③（预置第二条目不被发送写盘波及）；`r18-2` `open-switch-no-write` 判据 ⑤（落点写盘不得改动两键的存在性）；`r18-5` `mark-absent` 判据 ⑥（`pairSame`）。
- 失败信号：在 A 文档上发送一次，B 文档此前记录的入口消失；`readState` 里其它条目的两键变成 `undefined`；同一文档翻页一次后入口消失。
- 收敛手段：§1.1.2 / §1.1.3 / §1.2.3 三处参考实现 + 走查 #1 / #4 的计数判据。

### R2「入口指向错的东西 / 点不开」

四类典型：① 写入时机漂移（打开文档或切换会话就改写记录 ⇒ 入口指向从未讨论过的会话）；② 活动会话显示入口（点了没反应）；③ 记录会话不在列表却仍渲染（点了抛错或切到别的会话）；④ 会话路径比较用原始 `===`（大小写 / 分隔符差异 ⇒ 误判）。另有一类实现层事故：`noteDiscussion` 写成裸 `bridge().readerStateSave(...)` ⇒ 缺 `saveEpoch` 守卫，`goHome` / `onUnmounted` 复位后迟到响应把上一库的 `documents` / `lastDoc` 回灌。

- 判定：`r18-1` 判据 ⑤ / ⑦ / ⑨ / ⑩ / ⑪ / ⑫（活动会话隐藏、切换会话后出现、点击只有一次 `switch_session`、零写入、不切页 / 缩放）；`r18-1` `send-failed` 判据 ⑭ / ⑮；`r18-2` 判据 ⑤ / ⑥；`r18-3` 判据 ① / ⑤ / ⑥ / ⑦；`r18-4` 判据 ① / ⑥；走查 #4（`readerStateSave` = 1 与三处 `noteDiscussion` 计数）。
- 失败信号：打开文档后入口文本变成当前会话；点入口后右侧会话没变；会话被删后入口仍在且点击报错；A 库的入口在 B 库出现；切工作区返回首页再进，入口指向上一库的会话。

### R3「旧文件与既有链路被新字段破坏」

两个方向：① 新字段走「严格校验」（要求路径存在 / 必须相对 / 必须 `.jsonl`）或把非法值升级为 warn / 降级 ⇒ 直接违反 PRD §3（旧文件零报错）与 R6 的静默降级口径；② 「半截字段」（只写 `lastSessionPath`）在后续读取时被错误地当成有效记录。第三个方向是取证面自身：stub 的 reader-state 镜像若与主进程口径不一致（谓词 / 保留规则），会出现「产品对、镜像错」或反之的假绿。

- 判定：烟测 #8（旧格式零 err / warn、不造字段）/ #9（9 种越界形态静默丢弃）/ #10（读侧成对裁剪）/ #11（corrupt / 版本回归 + 备份增量）；走查 #1（`grep -c "await"` = 1）与 #4（降级分支零 diff）；离屏 `r18-2` `old-format-silent` 判据 ③ / ④；`r18-3` 判据 ④。
- 失败信号：旧文件上出现新的 `[reader-state]` warn；旧文件被写入 `lastSessionPath: null`；只有一侧的键出现在 JSON 里；版本不符的文件被新代码覆盖；备份被静默覆盖。

### 次级风险（不占 Top3，登记）

1. **`.center-pill` 变长后的挤压**：`.reader-discuss`（`max-width: 240px`）与 `.shortcut-toggle` / `.map-toggle` 同排 ⇒ 窄栏下可能把 `.pill-label` 挤到省略号或被换行。兜底：§8.1 必查项 + `r18-1` 判据 ⑧ 的 `.pill-label` 逐字断言（只钉文本，钉不住像素 ⇒ 目视登记）。
2. **「刚刚」的 60s 窗口**：r18-1 相位 2 / 3 已按 MF5 用「前缀 + 运行时允许集」与数据面判定；种子夹具一律 `PAST_AT` ⇒ `昨天`，档位确定。残余风险 = 相位 2 的 `waitFor` 恰好跨过 60s（允许集已含 `N 分钟` 两档，超窗即命中）。
3. **会话列表刷新时机**：`projectStore.sessions` 只在挂载 / 发送 / 切换 / 删除后刷新 ⇒ 会话文件在外部被删除时入口可能**短暂残留**，直到下一次刷新（登记为接受的时延，不做监听）。
4. **stub 的镜像覆盖范围**：`switch_session` 只镜像「命中种入列表」的路径（未命中 ⇒ 只记录）；`SESSION_STATS` 不镜像（`sessionStats` 面不参与本轮判据）。既有场景不触发该分支 ⇒ 零影响。
5. **`#append` 槽常驻的 DOM 差异**：每行多一枚空 `div.v-list-item__append`（Vuetify `VListItem.js:222-223` / `:300-303`）⇒ dev 档必须逐项登记；若某既有场景断言了菜单行 DOM 形状（本轮实读：既有场景从不打开会话菜单），会立刻暴露。
6. **`closeSessionMenu()` 的幂等性依赖菜单关闭机制**：VOverlay 在 `window` 上监听 Esc（`VOverlay.js:193-212`）；点击列表项是否自动关闭不在本档假设内 ⇒ helper 写成「不在场即返回，否则派发 Esc 并等消失」，两条路径都成立。

---

## 7. 开发分工（A 数据面 / B 交互面，白名单互不重叠）

### 7.1 A：字段、主进程与渲染层 store + 烟测

| 序 | 文件 | 改动 | 完成判据 |
| --- | --- | --- | --- |
| A1 | `pix/src/shared/types.ts` | `ReaderDocState` / `ReaderStateSaveDraft` 各追加两个可选字段 | `npm run check` 0 error |
| A2 | `pix/src/main/reader-state-store.ts` | 常量 + 两谓词 + 读侧成对带回 + 写侧保留规则 | 烟测 #6–#11 全绿；`grep -c "await"` = 1 |
| A3 | `pix/src/renderer/stores/reader-state-store.ts` | `DiscussionStamp` / `DiscussionLink` / `noteDiscussion` / `currentDiscussion` / `applyLocal` + `submit` 扩展 | `grep -c "readerStateSave"` = 1；`grep -c "currentDiscussion"` = 2；`npm run check` 0 error |
| A4 | `pix/scripts/smoke-notes.mjs` | `runReaderStateStore` 追加 #6–#11 | `npm run smoke:notes` ⇒ `通过 71 / 失败 0`（连跑两次） |

**A 不碰任何 Vue 文件**（`grep -rn "reader-discuss\|session-doc-mark" pix/src/renderer/components` 仍为 0）。

### 7.2 B：两个组件 + 工作区页 + 离屏（依赖 A 的签名与字面冻结）

| 序 | 文件 | 改动 | 完成判据 |
| --- | --- | --- | --- |
| B1 | `ReaderPanel.vue` | Teleport + 三条样式 + `discussEntry` / `discussLabel` / `openDiscussion` + emit + 两个顶层 import | 走查 #3 的 5 项计数；`r18-1` / `r18-2` / `r18-3` / `r18-4` 的入口面 |
| B2 | `ChatPanel.vue` | `send()` 快照 + `if/else` + 单一 `noteDiscussion`；`docRelatedPath` / `docRelatedTitle` / `isDocRelatedSession`；槽常驻 + `.session-doc-mark` + 样式；两个顶层 import | 走查 #3 / #4；`r18-5` 两个相位 |
| B3 | `WorkspacePage.vue` | `onOpenDiscussionSession` + `@open-session` 绑定 | `r18-1` 判据 ⑨；走查 #5 |
| B4 | `scripts/ui-shot.mjs` | `SEL` +2；stub 9 处；7 个新 helper；5 个场景 | 步骤 0c 基线 174；步骤 3 验收 186 / 74 种 label / `failure === null`；§5.4 两条比对全过 |

**串行纪律**：B 面在第 3 步（离屏验收）之前不得改 A 面文件；两次离屏串行执行。

### 7.3 备选：单代理（推荐当只有一名开发者时）

按 A1 → A2 → A4（先跑烟测锁定数据面）→ A3 → B1 → B2 → B3 → B4 的顺序；每一步后跑 `npm run check`，A4 之后跑 `smoke:notes`，A3 之后确认渲染层无字面泄漏（走查 #1 / #4），B4 落地后跑基线与验收两轮离屏。

---

## 8. 视觉验收要点

### 8.1 必查三项（PRD §7 判据 3 的观感面）

| # | 项 | 判据 |
| --- | --- | --- |
| 1 | **入口不挤压既有 pill 文本** | `r18-1b` / `r18-3b` / `r18-4b` 三张裁切图上：`.pill-label` 文本可辨（`sample-paper.pdf` 不被截断为省略号、不与 `.reader-discuss` 重叠）；`.reader-discuss` 与 `.map-toggle` / `.shortcut-toggle` 同排且不换行、不溢出 pill 的圆角边界；离屏判据 = `r18-1` 判据 ⑧（`.pill-label` 逐字 + `.map-toggle` 在场）与 `r18-4` 判据 ⑫ 的既有子元素在场 |
| 2 | **入口文本与 tooltip 逐字** | `r18-1b` / `r18-3b` / `r18-4b`：`继续讨论：{会话名} · {时间档位}` 完整可读（`max-width: 240px` 内）；tooltip 无法截图 ⇒ 由离屏判据 ⑦ / ⑥ 的 `title` 逐字断言兜住 |
| 3 | **菜单标记不破坏既有行** | `r18-5-session-mark.png` / `r18-5b-mark-absent.png`（菜单打开）：标记图标在删除按钮左侧、同行不换行、不与标题 / 时间副标题重叠；活动行的标记与「无删除按钮」并存；其余行视觉与既有菜单一致（判据 ③ 的 `.session-delete-btn` 计数 1 + `新对话` / `重命名当前对话` / `历史对话` 在场） |

### 8.2 逐张登记清单（12 张，dev 档必须逐张写结论）

| # | 截图 | 登记项 |
| --- | --- | --- |
| 1 | `r18-1-send-records.png` | 发送后：pill 内**无**入口（活动会话 = 记录会话）；会话菜单关闭；正文与页码（`第 1 / 3 页`）与发送前一致 |
| 2 | `r18-1b-discuss-entry.png`（`.center-pill` 裁切） | 入口出现：图标 + `继续讨论：摘录与笔记走查 · {时间档位}`；`pill-label` 未被挤压；与 `.map-toggle` / `.shortcut-toggle` 的相对位次 |
| 3 | `r18-1c-discuss-switched.png` | 右侧 `.pill-session` 文本变为 `摘录与笔记走查`；阅读区页码 / 缩放与点击前一致（不切页、不改缩放） |
| 4 | `r18-1d-send-failed.png` | 错误块可见；入口仍在（记录未被失败发送改写）；草稿 / 附件还原符合既有语义 |
| 5 | `r18-2-old-format.png` | 空态区：`.reader-resume` 文本逐字 `继续阅读：sample-paper.pdf · 第 2 页`；`.center-pill` 内**无**入口 |
| 6 | `r18-2b-open-switch.png` | 打开文档并翻到第 3 页后：阅读区**无**入口（打开 / 切换都不写记录）；会话菜单已关闭 |
| 7 | `r18-3-session-gone.png` | 入口与标记**都不在**；无任何提示行 / toast / 角标 |
| 8 | `r18-3b-session-restored.png`（`.center-pill` 裁切） | 入口恢复：`继续讨论：丢失后恢复的会话 · 昨天` |
| 9 | `r18-4-workspace-b.png` | B 工作区（左栏标题与树行只有 `sample-paper.pdf`）：**无**入口、无标记 |
| 10 | `r18-4b-back-to-a.png`（`.center-pill` 裁切） | 回 A 后入口恢复：`继续讨论：摘录与笔记走查 · 昨天` |
| 11 | `r18-5-session-mark.png`（菜单打开） | 标记恰 1 枚（`摘录与笔记走查` 行）、`消融实验对照` 行无标记；每行多出的空 `div.v-list-item__append` 零视觉位移；删除按钮单枚且未换行 |
| 12 | `r18-5b-mark-absent.png`（菜单打开） | 打开 `long-book.pdf` 后：标记与入口都不在；菜单其余行与 #11 一致 |

### 8.3 反例清单（出现即判红）

1. `.reader-discuss` 出现在**空态**（未打开文档）或出现在 `reader-header` 内（工作区里被 `display: none` 隐藏 ⇒ 不可见且不可点）。
2. 入口在「活动会话 = 记录会话」时仍可见（死路点击）。
3. 记录会话不在列表时入口仍渲染，或点击后抛错 / 切到别的会话。
4. drop-old 现象：翻页一次后入口或标记消失（R1 的视觉形态）。
5. 旧格式现场文件打开后出现新的 `[reader-state]` 警告日志。
6. `.pill-label` 文本被入口改写、被截断为省略号、或 pill 换行 / 溢出。
7. 会话菜单行的既有文案 / 类名 / 两击确认被改动；`.session-delete-btn` 计数从 1 变 0 或 2。
8. 入口 / 标记带 `transition` / `animation` / 阴影 / 新 `--pix-*` 变量；出现第二枚入口元素。
9. 打开文档 / 翻页 / 切换会话就写记录（`r18-2` 判据 ⑤ / ⑥ 变红）。
10. 点击入口后页码 / 缩放 / 文档发生变化（`r18-1` 判据 ⑪ 变红）。

---

## 9. 开放问题（登记，不阻塞本档定稿）

1. **入口落点的最终裁决**（上游 §9 第 1 条）：本档采信 `.center-pill`（§1.3.1 的三条实读证据）。若负责人改判为空态区，需同时改 §1.3、`r18-1` / `r18-4` 的断言面，并接受「打开文档后无法一步回到讨论」。
2. **活动会话是否隐藏入口**（上游第 2 条）：本档冻结为**隐藏**（§1.3.4 闸 3）。改判需同步 §1.3.4、`r18-1` 判据 ⑤ / ⑫、`r18-5` 判据 ④ / ⑥。
3. **时间用发送时刻还是会话 `modified`**：本档冻结 `lastSessionAt` = **发送时刻**（§1.1.1）。改判需删一键并改烟测 #6 / #9 / #10 与 `discussTimeAllowSet` 的判据面。
4. **显示会话标题还是文档名**：本档冻结「会话标题 + 时间」（§1.3.2）。改判需改 `discussLabel` 与 `r18-*` 的字面断言。
5. **N102 是否覆盖「会话 → 任意文档」的反向关联**：本档冻结为「只标注与当前文档相关的会话」（§1.4.1）。改判需在 `currentDiscussion` 之外新增聚合派生与多条文档夹具。
6. **入口是否可关闭**：本档冻结为「有记录即常驻（无关闭开关）」（§1.1.4 末行）。改判需新增易失状态字段（不得落 `notes.json`）并同步 §1.1 / §1.3 与烟测断言。
7. **真实删除路径场景（N3）**：本档登记为等价覆盖（§1.5.7 判据 5），不新增相位；若负责人要求独立相位，需扩配额（12 → 13 张截图、11 → 12 条 record）。
8. **`.reader-discuss` 与 `.shortcut-toggle` 的固定位次**：与 R17 同口径，由挂载顺序决定、不写断言；若要求固定顺序，需在 `ReaderPanel` 内统一 teleport 或改 flex `order`（会触碰既有 `.map-toggle` 语义）。

---

## 附：本档自检（交付面）

| 项 | 结果 |
| --- | --- |
| 交付文件 | `docs/pm/R18-design.md`（唯一新增；未改任何源码 / 脚本 / 其它文档） |
| 结构 | §0 口径与证据面 / §1 契约冻结表 / §2 与既有冻结面的关系 / §3 失败路径表 / §4 文件级清单 / §5 验证方案 / §6 风险 Top3 / §7 开发分工 / §8 视觉验收要点 / §9 开放问题（与 R14-design / R16-design 同构） |
| 冻结覆盖 | N100 字段（名字 / 类型 / 可选性 / 写入与清除时机 / 文件校验兼容矩阵）；N101 入口（DOM / 类名 / 逐字模板 / 点击链路 / 降级判定 / 与 `.center-pill` 既有元素关系）；N103 断言与场景清单（配额表 + 烟测 6 条 + stub 9 处 + 7 个 helper + 5 场景逐相位 + 12 张截图 + 场景级判据） |
| 行号纪律 | 本档全部行号 / 计数均来自本步真实命令输出（§0.1）；未编造行号与断言名 |
| 未执行 | 离屏 / 基线 / `smoke:notes` / `smoke:view` / build / package / dev（§0.4） |
| 设计评审处置（R18） | 设计评审 MF1–MF3 **全部采纳**（处理 3 / 拒绝 0；见文末「定稿修订（R18）」）；正文已同步改字：§0.1（helper 行号）/ §0.3（签名）/ §1.2.2（签名 + 形参域）/ §1.2.4（调用与快照）/ §1.5.3（B 根重种）/ §1.5.4（复用表）/ §1.5.5（`r18-4` 两相位）/ §3（#6 / #17） |

---

## 定稿修订（R18）

> 依据：`docs/pm/R18-review.md`「设计评审（R18）」的 must-fix 清单（MF1–MF3）。本步为**纯文档修订**：只改本档正文并追加本节，未动任何源码 / 脚本 / 基线；本步实跑 `cd pix && npm run check` ⇒ `CHECK_EXIT=0`（基线仍绿），未跑离屏 / 烟测 / 构建。

| 编号 | 评审结论（must-fix） | 处置 | 正文落点（已改字） | 核实（本步实读 / 实跑） |
| --- | --- | --- | --- | --- |
| MF1 | `noteDiscussion` 形参 `string` 与实参 `string \| null` 不自洽 ⇒ 唯一工程门必红 | **采纳**（评审修法 ①：形参同域 + 函数内收窄） | §0.3（签名行）/ §1.2.2（签名、守卫 ②、新增「形参域」冻结行）/ §1.2.4（调用行与快照行）/ §3 #17 | `sed -n '25p' pix/src/renderer/stores/reader-store.ts` ⇒ `const filePath = ref<string \| null>(null);`；`sed -n '25p;465p' pix/src/renderer/composables/useRpc.ts` ⇒ `sessionState = ref<RpcSessionState \| null>(null)` 定义行与暴露行；`grep -n '"strict"' pix/tsconfig.json` ⇒ `6: "strict": true,`；`grep -n "sessionFile" pix/src/shared/types.ts` ⇒ `115: sessionFile?: string;`；`npm run check` ⇒ `CHECK_EXIT=0`（缺陷由本轮签名引入，非既有） |
| MF2 | §0.1 `goHome` `:1681` / `enterWorkspace` `:1691` 与 HEAD 不符；§1.5.4 复用表漏登实际依赖的 helper | **采纳** | §0.1（helper 行号勘正 + 补登 `js` `:1602` / `waitTreeRows` `:1678` / `waitPdfLoaded` `:1680` / `waitPage` `:1681`）；§1.5.4「复用（零修改）」补登 `goHome()` `:1696` / `enterWorkspace(name)` `:1706` / `fileHash(file)` `:4366` / `seedNotes()` `:347` / `SEL` `:47-128` | `sed -n '1676,1710p' pix/scripts/ui-shot.mjs` ⇒ `waitTreeRows` `:1678` / `waitPdfLoaded` `:1680` / `waitPage` `:1681` / `waitResumeEntry` `:1686` / `goHome` `:1696` / `enterWorkspace` `:1706`；`grep -n "const seedNotes\|const fileHash" pix/scripts/ui-shot.mjs` ⇒ `347` / `4366`；`sed -n '1602,1603p;1608p' pix/scripts/ui-shot.mjs` ⇒ `js` / `sleep` / `waitFor` 定义 |
| MF3 | `r18-4` 相位 `workspace-b` 判据 ③（及判据 ① 的一半理由）是结构性空断言（B 列表为空 ⇒ 菜单恒无行） | **采纳**（评审修法 ①：B 根种入 ⇒ 判据非空） | §1.5.3（`setSessions` 行登记 B 根重种）/ §1.5.5 `r18-4`（`workspace-b` 步骤 + 判据 ① / ③ + `data.menuRowCount`；`back-to-a` 步骤补 A 根重种）/ §3 #6 | `sed -n '37p' pix/scripts/ui-shot.mjs` ⇒ `const LIBRARY_B_DIR = join(OUT_ROOT, "library-b");`；`sed -n '409,410p' pix/scripts/ui-shot.mjs` ⇒ A/B 两库 `reader-state.json` 每轮删除（B 现场必为 missing ⇒ 落点写盘后条目在场且无对）；`src/renderer/pages/WorkspacePage.vue:58-74` / `project-store.ts:112-121` ⇒ 切工作区后 `listSessions` 按根刷新并 `syncCurrentSession` |

**处置计数**：must-fix 处理 **3** 条、拒绝 **0** 条。评审次要项 N1–N6 不属 must-fix（评审原文「不阻断动工」）⇒ 本步不改正文，保留为 dev 档登记项；如后续采纳，同步改 §8.1 / §1.5.5 的相关选择器与文案（N1 / N6）即可。

**修订后判据自洽性（要点）**：

1. MF1：`string \| null` 形参 + 守卫 ② 收窄后，`toSnapshot(absPath, …)` 的实参已为 `string`；`grep -c "noteDiscussion" ChatPanel.vue` = **1** 的判据不变（调用点仍是一条普通语句）。
2. MF2：`waitTreeRows` / `waitPdfLoaded` / `waitPage` / `goHome` / `enterWorkspace` 既是 `enterWorkspaceWithState` 与 `r18-*` 步骤的实际依赖，也是登记「既有面零改动」时的定位基准；全部行号以本步实读为准。
3. MF3：`workspace-b` 的 B 列表以 B 根种入 `SESSIONS_A`（2 条）后，「B 列表为空」不再是判据 ① / ③ 成立的理由；判据 ③ 追加「菜单两行在场」的正向断言 ⇒ 恒真风险消除。`back-to-a` 必须重种 A 根，否则判据 ⑥ 的「入口恢复」会因列表为空而恒红（本相位已写明）。

**复跑入口**（本节结论的全部命令，只读）：

```bash
cd E:/develop/PiX-Read

# MF1：类型面（缺陷形态 + 修订后的规避方式）
sed -n '25p' pix/src/renderer/stores/reader-store.ts
sed -n '25p;465p' pix/src/renderer/composables/useRpc.ts
grep -n '"strict"' pix/tsconfig.json
grep -n "sessionFile" pix/src/shared/types.ts
cd pix && npm run check; echo "CHECK_EXIT=$?"     # 本步实跑 = 0

# MF2：行号面
cd E:/develop/PiX-Read
sed -n '1676,1710p' pix/scripts/ui-shot.mjs
grep -n "const seedNotes|const fileHash|const js =|const sleep =|const waitFor =" pix/scripts/ui-shot.mjs

# MF3：B 根与夹具面
sed -n '37p;409,410p' pix/scripts/ui-shot.mjs
sed -n '767,769p' docs/pm/R18-design.md    # 修订后的 r18-4 两相位
```

---

## 代码审查修订（R18 收口）

> 依据：`docs/pm/R18-review.md`「代码审查（R18）」§3 的 must-fix（MF1 / MF2）。负责人裁决：**两条均追认**；MF2 追加「相位自确定化」加固。本步为纯文档修订 + `ui-shot.mjs` 的 `r18-3` 相位自确定化（产品源码 `pix/src/**` 零改动）；实跑读数见 `R18-dev.md`「R18 收口」节。

| 编号 | 审查结论（must-fix） | 处置 | 本档落点（已改字） | 核实 |
| --- | --- | --- | --- | --- |
| MF1 | 既有断言改写（`map-chapter-filter` 相位 `injection` 的 2 行字节比较）属冻结面越界 | **追认**（按 R17 §0.9 先例就地登记） | §2.3（标题、结论、逐字登记表 #1、`-` 行配额 6）；`R18-req` §0.10 登记 1；`badge-click` 相位的字节断言（`:4799` / `:4813`）按原样未动 | `git diff -U0 -- pix/scripts/ui-shot.mjs \| grep -cE "^-[^-]"` = 6（4 stub + 2 断言）；`stateProjection` `:1693-1703` |
| MF2 | `r18-3` 相位 `session-restored` 的点击目标偏离冻结字面，且改后写法依赖前序场景遗留的 `SESSION_STATE` 镜像 | **追认并加固**（自确定化 + 冻结字面恢复） | §1.5.5 `r18-3` 的 `session-restored` 行（步骤 / 新增判据 ⑨⑩⑪ / `data` 字段）；§1.5.7 判据 2；`R18-req` §0.10 登记 2 | `restoreStandardSeed` `:3513-3517` 不复位 `SESSION_STATE`；唯一镜像点 stub `switch_session` 分支；`ChatPanel.vue:895-898` 活动行 early-return |

**修订后判据自洽性（要点）**：

1. MF1：改写后 `injection` 的判据面 = 「除讨论记录（两键 + `updatedAt`）外逐字不变」，与本轮 §0.3 / §0.4 的冻结写入语义自洽；`52` 组内另一相位的字节断言不受影响；「写记录不得波及其它条目」由 `r18-1` 判据 ③ 与烟测 #7 另证。
2. MF2：自确定前置保证「冻结字面点击必命中非活动行」；新增 3 条非空断言（切换前入口计数 0、真实 `switch_session` 调用链与载荷、切换后活动行）⇒ 判别力只增不减；`r18-3` 的 2 条 record / 2 张截图配额与判据 ⑥⑦⑧ 逐字不变。

**复跑入口**（只读）：

```bash
cd E:/develop/PiX-Read
git diff -U0 -- pix/scripts/ui-shot.mjs | grep -E "^-[^-]"          # 6 行（4 stub + 2 既有断言）
sed -n '12054,12080p' pix/scripts/ui-shot.mjs                        # 自确定前置 + 冻结字面决定性点击 + 新增断言
grep -n "const restoreStandardSeed" -A 4 pix/scripts/ui-shot.mjs     # 不复位 SESSION_STATE
sed -n '895,898p' pix/src/renderer/components/workspace/ChatPanel.vue  # 活动行 early-return
```
