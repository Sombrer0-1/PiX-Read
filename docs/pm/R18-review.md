# PiX-Read R18 评审档（独立需求评审）

> 评审对象：`docs/pm/R18-req.md`（HEAD = `1561cb4`）。
> 证据面：仅本步允许的只读走查（`read` / `grep` / `sed` / `awk` / `git status`）与本轮唯一指定产物本档。**本步未跑离屏、未跑 `npm run check` / `npm run build` / `npm test`**，凡涉及离屏运行结论均标注为「代码路径推导」而非实测。
> 命名与计数复核命令一律写在条目内，便于复跑。

## 需求评审（R18）

### 0. 结论

**总体判断：主线与数据面口径成立，可以进入设计档；但 N103 的 4 条离屏判据不可满足或自相矛盾，必须先改档再动工。** 事实基线表另有 3 类共 8 处行号/计数与 HEAD 不符，其中 1 处会让判据恒红。

成立的部分（实读复核过，见 §1）：

- N100 的「零新 IPC」路线**可行**：`ipc-handlers.ts:301-313` 的 `isReaderStateDraft` 只做形状校验，额外字段原样透传进 `saveReaderState(draft)`（`:555-557`），`preload.ts:84` / `:175-176` 亦为直通；`shared/types.ts:472-496` 加两个可选字段即可，无需动 IPC 面。
- N100 的字段与 R6 冻结语义**不冲突**：`parseReaderState`（`main/reader-state-store.ts:142`）只认已知键，`resolveLastDoc`（`:127`）/ `isStoredDocPath`（`:91`）/ `SCHEMA_VERSION = 1`（`:28`）不受可选键影响；`updatedAt` 的「非关键字段、读不出记 0」在 `parseDocState`（`:115-124`）内逐字不变；旧文件零报错由现有分支天然满足（`readStateFile` `:165` 不校验条目键集）。
- N101 的落点与点击链路**真实存在**：`.reader-resume` 在 `.reader-empty`（`ReaderPanel.vue:213-220`，`v-if="!filePath"`）内，`.center-pill` 由 `WorkspacePage.vue:321-331` 渲染，`.map-toggle` 已用同款 Teleport（`ReaderPanel.vue:193-205`），`ShortcutOverview.vue:86-98` 同款；`onSwitchSession` 在 `WorkspacePage.vue:170-177`，`switch_session` 的渲染层唯一入口是 `useRpc.ts:291`（`grep -rn "switch_session" pix/src/renderer | wc -l` 实读 = 1）。
- 命名预检与冻结字面复核**与档内一致**：`lastSessionPath` / `lastSessionAt` / `reader-discuss` / `session-doc-mark` / `noteDiscussion` / `currentDiscussion` / `MAX_SESSION_PATH_LENGTH` / `继续讨论` / `最近讨论` / `mdi-forum-outline` / `mdi-file-link-outline` / `open-session` 在 `pix/src` 内各 **0** 命中；`reader-resume` **3**、`pill-session` **3**、`session-delete-btn` **4**、`历史对话` **2**；两个 mdi 图标在 `pix/node_modules/@mdi/font/css/materialdesignicons.css` 各 1 处存在。
- 烟测面配额**算术自洽**：`grep -c "  check(" scripts/smoke-notes.mjs` 实读 **65**（追加 6 ⇒ 71）、`scripts/smoke-view.mjs` 实读 **74**（9 组）；`smoke-notes.mjs` 的编译面与产物白名单**无需改动**（`files` 三文件含 `main/reader-state-store.ts`；`required` 含 `main/reader-state-store.js`；`allowed` 已含 `shared/types.js`）。
- 既有离屏面零位移的**前提成立**：既有夹具无两键、stub `listSessions` 默认 `[]`（`ui-shot.mjs:895`）⇒ `currentDiscussion` 恒 null ⇒ 新元素不渲染；既有场景**从不打开会话菜单**（`grep -n "pill-session" scripts/ui-shot.mjs` = 0 命中）⇒ `#append` 守卫位置调整对既有 174 张截图/253 条测量无像素与结构影响；既有断言只读条目 `.page` 字段与键名过滤（`:2041` / `:2139` / `:2319` / `:2344`），不做条目形状深比较 ⇒ 新增可选键不破既有断言。

### 1. 核对清单逐条结论

#### 1.1 N100：写入时机与真实数据流

**（a）「发送瞬间的当前会话」可读，取法成立。** `useRpc` 暴露 `sessionState`（`src/renderer/composables/useRpc.ts:25` 定义、`:465` 暴露），`RpcSessionState.sessionFile?: string`（`src/shared/types.ts:115`）⇒ §0.4 的 `sendingSessionPath = rpc.sessionState.value?.sessionFile ?? null` 可编译可判。切换/新建会话后 `sessionState` 会经 `refreshSessionData()`（`useRpc.ts:85`，被 `newSession` `:282-288` / `switchSession` `:290-296` 调用）刷新，`WorkspacePage` 侧另有 `syncWorkspaceState` 兜底（`WorkspacePage.vue:58-79`、`:170-177`）⇒ 不存在「读到上一个会话文件」的窗口（除内核未给出 `sessionFile` 的未落盘会话，此时 §0.4 守卫 ② 静默返回，口径正确）。

**（b）字段形状与既有校验/降级/`updatedAt` 无冲突。** 见 §0 第 2 条证据；另注：`parseReaderState` 的键域过滤（`docPathKey(key) !== key` 丢条）只作用于 `documents` 的**键**，与条目内的新键无关 ⇒ 「成对裁剪」不会误伤条目。

**（c）旧文件兼容可判。** `#8`（烟测）+ `r18-2`（离屏）两条判据都能落到真实可判的量：`degraded === false` / `reason === undefined` / `warn` 增量 0 / `hasOwnProperty("lastSessionPath") === false`。唯 `r18-2` 的另一条判据不可满足，见 MF1。

**（d）缺口（MF6）：`noteDiscussion` 的提交路径没写 `saveEpoch` 竞态守卫。** 既有 store 的注释逐字写明该守卫的理由（`renderer/stores/reader-state-store.ts:62`：`保存世代：resetState 递增，跨复位的迟到 save 响应一律丢弃（不得回灌已清空的 store）`；实现 `:63` / `:110-128`：`const epoch = saveEpoch` `:111`、两处 `if (epoch !== saveEpoch) return;` `:119` / `:126`）。§0.4 / §0.7 只写了「先做乐观更新，再 await 提交」，未要求同款守卫；若 dev 写成裸 `bridge().readerStateSave(...)` + `applyState(result.state)`，则在「发送在途 → 返回首页 / 切工作区」（`WorkspacePage.vue:134-146` 的 `onUnmounted` 顺序 flush→resetState、`:251-266` 的 `goHome`）之后，迟到响应会把上一库的 `documents` / `lastDoc` 回灌进已复位 store，形成跨工作区残留。**修法**：在 §0.7 冻结「`noteDiscussion` 复用 `submit()` 或在同一处新增 `epoch !== saveEpoch ⇒ return`」，并加一条走查判据（`git diff` 中 `noteDiscussion` 的提交语句必须与 `submit()` 同源）。

#### 1.2 N101：入口落点、点击链路、缺失判定

**（a）与既有 `.reader-resume` 无结构冲突。** 两者容器不同（`.reader-empty` vs `.center-pill`），`.reader-resume` 的模板（`ReaderPanel.vue:217-220`）、样式（`:383` / `:400`）、`resumeEntry`（`:65-72`）零改动即可达成；`grep -rn "reader-resume" pix/src | wc -l` 保持 3 的判据可达。Teleport 进 `.center-pill` 的 scoped 样式可用（既有 `.map-toggle` 为同一机制的先例）⇒ 判定 2 的落点结论成立。

**（b）点击链路真实存在且唯一。** `WorkspacePage.vue:170-177` 的 `onSwitchSession` 就是档内要复用的函数，其内部 `clearSession` → `rpc.switchSession` → `setCurrentSession` → `syncWorkspaceState({loadMessagesIfEmpty:true})` 与档内逐字一致；`switch_session` 在渲染层只有 `useRpc.ts:291` 一处 ⇒ 「零增量」判据（`grep -rn "switch_session" pix/src/renderer | wc -l` = 1）可判且已达基线。

**（c）会话缺失判定可判但依赖一个事实源。** 唯一事实源是 `projectStore.sessions`（`stores/project-store.ts:90-107`），派生为 null ⇒ 静默隐藏，口径与 `.reader-resume` 同构；已知刷新时延已在 §8 次级风险登记。**提醒**：`docPathKey(path: string): string`（`utils/notes-path.ts:19`）不接受 `undefined`，§0.6 的条件式按字面不可编译（[check] 会红），dev 必须走 `docRelatedPath` computed + 空值守卫（见次要项 N2）。

#### 1.3 与既有语义的冲突

- **既有断言（20-resume-entry）**：三相位只读 `.reader-resume` 文本与 `.reader-empty` 文案/错误态（`ui-shot.mjs:1783-1861`），不含 `.center-pill` 子元素计数 ⇒ 零冲突；且该场景会话列表为空、条目无两键 ⇒ 新元素恒不在 DOM。**结论：无冲突。**
- **切换工作区后的状态复位**：`resetState()`（`renderer/stores/reader-state-store.ts:243-257`）清 `documents` / `lastDoc` / `ready`，派生随之为 null；`goHome()`（`WorkspacePage.vue:251-266`）先 flush 再 reset、`onUnmounted`（`:134-146`）顺序相同 ⇒ 无跨库残留。档内「`resetState` 已清 `documents`，无需新增复位项」的登记**成立**。
- **会话删除后的残留**：`onDeleteSession`（`WorkspacePage.vue:178-190`）删除成功后 `await projectStore.listSessions()` ⇒ 派生转 null ⇒ 入口与标记同时消失；现场文件保留原记录属 §0.0 第 3 条已登记取舍。**缺口（次要 N3）**：N103 没有「真实删除路径 + 有记录文档」的场景（`r18-3` 只造「记录会话不在列表」）。

#### 1.4 N103 可构造性与空断言风险

- **可构造**：`setSessions` / `switchSessionCalls` 两个新控制口 + 既有 `writeState`（`:1632`）/ `setSendFailure`（`__pixStub:1208`）/ `setReaderState`（`:1243`）/ `readState`（`:1631`）足以造出「有记录的文档」「旧格式文件」「记录会话不在列表」「跨工作区」四种前置；`PAST_AT = now - 26h` 在 `formatSessionTime` 下恒为 `昨天`（`utils/session-title.ts:84`：`diff < 2 * day`）；`SESSIONS_A[0].path` 与 `SESSION_STATE.sessionFile`（`ui-shot.mjs:645-647`）同路径同 id ⇒ r18-1 的「记录 = 活动会话」前置成立。
- **不可满足 / 自相矛盾 4 处（MF1–MF4，逐条给代码路径推导见 must-fix 清单）**。
- **时间依赖断言（MF5）**：`刚刚` 的窗口是 `diff < 60_000`（`session-title.ts:81`），而 r18-1 相位 2 的 `waitDiscussText("… · 刚刚")` 与相位 3 的「与相位 2 读数逐字相等」都跨相位、无护栏；相位 1 的 `Date.now() - 值 < 60000` 防空**只覆盖相位 1 自身**，兜不住后续。
- **弱断言（次要 N1）**：用 `.notes-notice === null` 充当「无提示」判据——该元素属笔记面板（`NotesPanel.vue:695`），在资料库标签下本就不渲染，判别力弱。

#### 1.5 白名单一致性与遗漏

- **齐备**：`types.ts` / `main/reader-state-store.ts` / `renderer/stores/reader-state-store.ts` / `ReaderPanel.vue` / `ChatPanel.vue` / `WorkspacePage.vue` / 两个脚本 / 新建 `docs/pm/R18-*.md` 与改动点一一对应；`ipc-handlers.ts`、`preload.ts`、`session-bridge.ts`、`session-store.ts`、`project-store.ts`、`package.json` 零 diff 的目标在实读下**可达**（§0 第 1 条）；`smoke-view.mjs` 零改动成立（本轮无渲染层纯函数新增，`grep -c "  check("` = 74 需保持不变）。
- **登记不准确（MF10）**：`#append` 常驻后 Vuetify 会给**每一行**渲染 `v-list-item__append` 容器（`node_modules/vuetify/lib/components/VList/VListItem.js:222-223` 的 `hasAppend = hasAppendMedia || slots.append`，`:301-303` 恒建容器），DOM 输出**并非逐字等价**；列宽 `grid-template-columns: max-content 1fr auto`（`VListItem.css:1-10`）⇒ 视觉零位移，但 §0.6「渲染输出等价」与 §0.9「允许的位移」第 4 条需按事实改写。
- **无遗漏的写入口**：`switch_session` 唯一入口已核实；`readerStateSave` 无第二写者（`grep -rn "reader-state-save" pix/src | wc -l` = 2：`ipc-handlers.ts:555` + `preload.ts:176`）。

---

## must-fix 清单（进设计档前必须改档）

### MF1 `r18-2` 相位 `open-switch-no-write` 判据 ⑤ 不可满足（防空前提自相矛盾）

- 位置：R18-req §N103-2「场景 `r18-2`」相位 `open-switch-no-write` 判据 ⑤（「打开文档确实写盘（`page === 2`、`scale === 1`、`updatedAt > SEED_AT`）而**仍无** `lastSessionPath` 键」）。
- 证据（代码路径推导）：
  1. 夹具 `documents["sample-paper.pdf"] = { page: 2, scale: 1 }` 且 `lastDocPath = "sample-paper.pdf"` ⇒ `loadReaderState` 成功后会播种去重基线 `committed = toSnapshot(absoluteDocPath(root, last.docPath), 2, 1)`（`renderer/stores/reader-state-store.ts:175-177`）。
  2. 点击续读入口 ⇒ `requestRestoreFor`（`:202-208`）登记 `page 2 / scale 1`；PdfViewer 消费后 `setScale(1)`、`scrollToPage(2)`，随后 `noteLanding(filePath, readerStore.page, readerStore.scale)`（`PdfViewer.vue:702-744`）⇒ 快照 = `{key, page 2, scale 1}`。
  3. `submitIfChanged`（`:131-141`）比较 `key` + `page` + `scale` 与基线**完全相等** ⇒ 直接 `return`，**不发生 IPC**（`saveCalls()` 增量 0，`updatedAt` 仍为 `SEED_AT`）。
- 结论：该相位的「防空写盘」在档内夹具下**结构上不可能发生**，判据恒红（若实现改成「必须写盘」则为伪需求引入）。
- 修法（二选一）：① 在断言前制造一次真实变化——`openRow` → `waitPdfLoaded()` → `clickNext()` → `waitPage(3, 3)`，再断言 `page === 3`、`updatedAt > SEED_AT`、`hasOwnProperty("lastSessionPath") === false`、入口计数 0；② 把夹具改成「条目页 ≠ 落点页」不可行（落点取自条目），故必须走 ① 的翻页路径或显式 `waitFor(updatedAt > SEED_AT)` 的等价构造。

### MF2 `r18-5` 判据 ④ 与 ⑥ 互斥，且 r18-4 / r18-5 依赖未登记的跨场景会话镜像残留

- 位置：R18-req §N103-2「场景 `r18-5`」相位 `mark-visible` 判据 ④（`.reader-discuss` 计数 **0**，理由「该场景活动会话即记录会话」）与相位 `mark-absent` 判据 ⑥（切回 `sample-paper.pdf` 后「标记与入口同时恢复」）。
- 证据：
  1. 场景前置与 `r18-4`「逐字相同」，**不切换会话**；而 stub 行为变更 ②（同档 §N103-2）把 `switch_session` 命中种入列表时同步镜像 `SESSION_STATE.sessionFile`，`r18-1` 相位 2、`r18-2` 相位 `open-switch-no-write`、`r18-3` 相位 `session-restored` 都执行了 `clickSessionItem("消融实验对照")` ⇒ 进入 `r18-5` 时活动会话已是 `session-older.jsonl`（≠ 记录会话 `SESSIONS_A[0].path`）。
  2. 显示条件 ③（§0.5）「记录会话路径 ≠ 当前活动会话路径」⇒ 入口**可见** ⇒ ④「计数 0」恒红；而 ⑥ 又要求入口在切回后「恢复」，与 ④ 直接对立（同一场景内文档与会话状态不变，二者不可能同时成立）。
  3. 同类问题也影响 `r18-4` 前置的「先断言 `.reader-discuss` 在场（防空）」：它同样只能靠前序场景遗留的镜像态成立，单场景复跑/调序即红。
- 修法：① 在 `r18-5` 前置显式冻结活动会话（`openSessionMenu()` + `clickSessionItem("摘录与笔记走查")` 之后再断言 ④），或把 ④ 移进「显式切回记录会话后」的独立相位；② 把 ⑥ 的「入口恢复」改成与 ④ 同口径（或改为只断言标记恢复 + 入口的**预期隐藏**）；③ 在 `r18-4` / `r18-5` 前置各写一条显式的会话镜像复位（例如 `setSessions(...)` 后 `clickSessionItem(...)`），并在 §0.8 登记「场景不依赖前序场景的 `SESSION_STATE` 残留」。

### MF3 `r18-4` 判据 ② 与真实行为相反（B 现场文件**会**有该文档条目）

- 位置：§N103-2「场景 `r18-4`」相位 `workspace-b` 判据 ②（「B 现场文件无该文档条目 / 无两键（工作区隔离）」）。
- 证据：B 的现场文件在本轮从未被写入（`STATE_FILE_B` 在 `ui-shot.mjs` 内**只有声明一处**（`:1606`），无使用点；自净只删 `<OUT_ROOT>/shots`，`library-b` 跨次保留）⇒ 进入 B 后 `readerStateStore.loadReaderState()` 得 `missing` ⇒ `committed = null`；随后 `openRow("sample-paper.pdf")` + `waitPdfLoaded()` 触发 `noteLanding` ⇒ 600ms 去抖后**必写**一条 `{page: 1, scale: 1, updatedAt}`（`reader-state-store.ts:143-152`（capture）→ `:131-141`（去重去抖）→ `:110-128`（提交），基线播种见 `:175-177`）。若 B 的文件因上一次运行已存在，则条目同样在场（只是走去重分支不重写）。两种情况下「B 现场文件**无**该文档条目」均不成立；「/ 无两键」的写法会被实现成合取而恒红。
- 修法：写死单一口径——「B 条目在场且 `hasOwnProperty("lastSessionPath") === false`」，并在读取前用 `waitFor` 等一次落点写盘（消除 600ms 去抖竞态）；跨工作区隔离的判据保留「A 的条目与两键不被波及」（`r18-4` 判据 ④ 的 A 侧 sha1 已覆盖）。

### MF4 `N100-4` 判据 4 的「唯一调用点」与 `send()` 真实控制流冲突

- 位置：§N100-4 判据 4（`grep -c "noteDiscussion" ChatPanel.vue` = **1**）；§7 白名单第 5 行（「两条发送分支之后」）。
- 证据：`ChatPanel.send()`（`:384`）内 `if (isStreaming.value) { await rpc.sendSteer(...); return; }`（`:426-429`）后接 `await rpc.sendPrompt(...)`（`:430`）⇒ 若在两条 `await` 之后各补一次调用，实读计数为 **2**（判据红）；若只在其中一条后补，另一条路径永不记录（功能缺陷）。
- 修法（二选一，档内必须写死）：① 判据改为 2（两条分支各 1 处，`grep -c` = 2），并说明「记录点 = 发送成功后的两条路径各一处」；② 允许一次极小重构（把 `return` 结构改为 `if/else`，单一调用点置于 try 尾部），同时在 §0.1 的 R8 冻结行内**显式登记**该 `-` 行与语义等价性说明，并把 `git diff` 判据写成「`send()` 内既有语句除该处外零改写」。

### MF5 `r18-1` 相位 2 / 相位 3 的时间逐字断言无护栏（60s 窗口）

- 位置：§N103-2 场景 `r18-1` 相位 `entry-visible-and-click`（`waitDiscussText("继续讨论：摘录与笔记走查 · 刚刚")`、判据 ⑦ 的 `title` 逐字）与相位 `send-failed` 判据 ⑮（「入口文本与相位 2 的读数逐字相等」）。
- 证据：`formatSessionTime`（`src/renderer/utils/session-title.ts:70-88`）的档位在 `diff ≥ 60_000` 时从 `刚刚` 变成 `N 分钟`（`:81`）；相位的 `waitFor` 超时为 20s（`ui-shot.mjs:1608` 的 `runReaderStateScenarios` 内实现，默认 `timeoutMs = 20000`），跨相位耗时不可控（两次截图各含 200ms 重绘 + 多次轮询）⇒ 一旦超窗，`waitDiscussText` 必然超时抛错，且相位 3 的「与相位 2 逐字相等」同样随时间漂移。§8 次级风险 ② 的登记（`Date.now() - 值 < 60000`）只覆盖相位 1 的读数，不构成护栏。
- 修法：① 期望串改为运行时计算——读现场文件的 `lastSessionAt`，按 `formatSessionTime` 同规则算出期望文本后再断言（或断言前缀 `继续讨论：摘录与笔记走查 · ` + 时间档位集合）；② 相位 3 改为断言文件层 `lastSessionAt` 逐字不变（UI 文本只断 `title` 前缀），把「不写」的证据放在数据面而非渲染文本上。

### MF6 `noteDiscussion` 的提交路径缺 `saveEpoch` 竞态守卫（写进 §0.4 / §0.7）

- 位置：§0.4「触发时机」行、§0.7「动作 `noteDiscussion`」行。
- 证据：既有守卫与语义见 `renderer/stores/reader-state-store.ts:62-63`（注释逐字「保存世代：resetState 递增，跨复位的迟到 save 响应一律丢弃（不得回灌已清空的 store）」）与 `:110-128`（`const epoch = saveEpoch;` `:111`；`if (epoch !== saveEpoch) return;` `:119` / `:126`）；`WorkspacePage.vue:134-146`（`onUnmounted`：flush → resetState）与 `:251-266`（`goHome`）是触发复位路径。
- 修法：冻结为「`noteDiscussion` 复用 `submit()` 的提交路径（同一条 `saveEpoch` 守卫）或新增同款守卫」，并加走查判据：`git diff -U0 pix/src/renderer/stores/reader-state-store.ts` 中 `noteDiscussion` 的 IPC 调用不得脱离 `submit()` / 不得缺少 `saveEpoch` 比较。

### MF7 事实基线：`SEL` 计数错（档内 64，实读 72）

- 位置：§0 事实基线表「离屏脚本现状」行与 §0.1 全局行、§0.8「`SEL` 新增 2 项（64 → 66）」、「N103-2 判据 2 / 判据 4」。
- 证据：`sed -n '47,128p' scripts/ui-shot.mjs | grep -cE '^  [a-zA-Z]+: '` 实读 = **72**（初版 24 + R10 7 + R11 11 + R12 8 + R13 4 + R14 6 + R16 4 + R17 6 + N97-4 2）；对应 R16 `60 → 64`、R17(`R17-dev.md:308`) `64 → 70` + N97-4 `70 → 72`（`R17-review.md:399` 亦记 `SEL` 72 项）。
- 修法：档内全部改为「现 **72** 项 ⇒ 追加 2 ⇒ **74**」，§0.1「既有 64 个 `SEL` 键逐字不动」改为 72。

### MF8 事实基线：6 处 `ui-shot.mjs` 行号与 HEAD 不符

| 档内 | 实读（HEAD `1561cb4`） |
| --- | --- |
| `openRow` `:1706` | `:1721` |
| `clickNext` / `clickPrev` `:1715-1716` | `:1730` / `:1731` |
| `rectOfSelector` `:2569` | `:2579` |
| `backToLibraryTab` `:4506` | `:4521` |
| `waitNotesTab` `:4510` | `:4525` |
| 场景收口 `}`「现 `:11565`」 | `:11532`（其前一条 `await restoreStandardSeed();` 在 `:11531`） |

- 其余引用经复核**一致**（避免连带改错）：`SEL :47-128`、`SESSION_STATE :637-651`、`handleCommand :666-689`、`parseDocState :746-751`、`normalizeState :754-772`、`readStateFile :775`、`writeStateFile :797`、`listSessions :895`、`readerStateLoad :1134-1146`、`readerStateSave :1147-1168`、`__pixStub :1185`、`listSessionsCalls :1239`、`setReaderState :1243`、`readerStateFilePath :1258`、`runReaderStateScenarios :1601`、`STATE_FILE_A/B :1605/:1606`、`readState/writeState/removeState :1631-1633`、`entry :1640`、`saveCalls :1641`、`warnCount :1643`、`waitResumeEntry :1686`、`setDraft :2544`、`typeAndSend :2556`、`sendCalls/clearSendCalls/lastSend/waitSendCalls :3268-3281`、`enterCleanWorkspace :3407-3415`、`restoreStandardSeed :3426-3430`、`capturePage :1278`、`repaint :1273`、`typeIntoComposer :10405`；产品侧行号（`ReaderPanel.vue` 全表、`ChatPanel.vue` 全表、`WorkspacePage.vue :49/:170/:198/:332/:346/:464-467/:468-471`、`project-store.ts :25/:90/:108/:112`）**全部一致**。
- 修法：按上表改字（R17 评审档 M9 已有同类先例）。

### MF9 事实基线：`N100-1` 判据 4 的 `reader-state-save` 计数会让判据恒红

- 位置：§N100-1 判据 4（`grep -c "reader-state-save" pix/src/main/ipc-handlers.ts` = **2**（挂载行 + 名称串；与基线相同））。
- 证据：`grep -c "reader-state-save" src/main/ipc-handlers.ts` 实读 = **1**（仅 `:555` 的 `ipcMain.handle("reader-state-save", …)`）；跨目录 `grep -rn "reader-state-save" pix/src | wc -l` 实读 = **2**（`ipc-handlers.ts:555` + `preload.ts:176`）。
- 修法：判据改为「`grep -c "reader-state-save" pix/src/main/ipc-handlers.ts` = 1（与基线相同）」或改成跨目录的 2；同时保留 `git diff` 空这一主判据。

### MF10 §0.6 / §0.9 的「渲染输出等价」应按事实改写

- 位置：§0.6「唯一登记的结构变更」行、§0.9「允许的位移」第 ④ 条。
- 证据：`node_modules/vuetify/lib/components/VList/VListItem.js:222-223` 的 `hasAppend = !!(hasAppendMedia || slots.append)`；`:301-303` 无条件创建 `v-list-item__append` 容器 ⇒ 槽常驻后**每一行**（含活动行/流式态）都会多出一个空容器；`VListItem.css:1-10` 的 `grid-template-columns: max-content 1fr auto` ⇒ 空格零宽，视觉零位移。
- 修法：改述为「DOM 多一枚空的 `.v-list-item__append` 容器（视觉零位移）；既有离屏场景不打开会话菜单（`grep -n "pill-session" scripts/ui-shot.mjs` = 0 命中）⇒ 既有 174 张截图/测量零影响」，并在 dev 档逐项登记该 DOM 差异。

---

## 次要项（不阻塞，建议在设计与开发档一并登记）

| # | 项 | 建议 |
| --- | --- | --- |
| N1 | `r18-3` 判据 ② 用 `.notes-notice === null` 充当「无提示」判据 | 该元素属笔记面板（`NotesPanel.vue:695`），在资料库标签下恒不渲染 ⇒ 判别力弱；改为「`.center-pill` / `.chat-panel` 内新增容器计数 0 + 走查无新增提示容器/文案」 |
| N2 | §0.6 条件式 `docPathKey(readerStateStore.currentDiscussion?.sessionPath)` 不可编译 | `docPathKey`（`utils/notes-path.ts:19`）只接受 `string`；明写 `docRelatedPath` computed（`string \| null`）+ 空值守卫，避免 [check] 红 |
| N3 | 无「真实删除路径 + 有记录文档」的场景 | 建议在 `r18-3` 追加一个相位（对记录会话行点两击删除 ⇒ 入口/标记消失、现场记录保留），或明确登记由 `session-gone` 等价覆盖 |
| N4 | 档内章节编号跳号（§4 后直接 §6，无 §5） | 补平编号或说明（现引用中的 §5 均指 PRD-V0.6） |
| N5 | `grep -rn "继续讨论" pix/src \| wc -l` = 2 对实现形态敏感 | 若实现把文本与 `title` 合成一条模板串，计数会变成 1；建议判据写成「文本模板与 `title` 模板各 1 处（同文件）」，或直接断 `:title` 属性的运行时实文 |
| N6 | `smoke-notes.mjs` 的备份计数 | `#2/#3` 已在 `PIX_READ_A` 留下 1 份 `reader-state.json.corrupt-*`，`#11` 的备份判据必须用**增量**（读取前后差集）而非绝对计数 |
| N7 | `noteDiscussion` 的乐观 `updatedAt` 取 `at` 而非 `Date.now()` | 与主进程写侧 `Date.now()` 略差（毫秒级），无判据影响；建议在 §0.7 注明以避免打卡式返工 |

---

## 复核命令（本档结论的复跑入口）

```bash
# 命名与冻结字面
grep -rn "lastSessionPath\|lastSessionAt\|reader-discuss\|session-doc-mark\|noteDiscussion\|currentDiscussion\|继续讨论\|最近讨论" pix/src | wc -l
grep -rn "reader-resume" pix/src | wc -l ; grep -rn "pill-session" pix/src | wc -l
grep -rn "session-delete-btn" pix/src | wc -l ; grep -rn "历史对话" pix/src | wc -l

# 基线计数与行号
sed -n '47,128p' pix/scripts/ui-shot.mjs | grep -cE '^  [a-zA-Z]+: '
grep -c "  check(" pix/scripts/smoke-notes.mjs ; grep -c "  check(" pix/scripts/smoke-view.mjs
grep -n "const openRow\|const clickNext\|const rectOfSelector\|const backToLibraryTab\|const waitNotesTab" pix/scripts/ui-shot.mjs
grep -c "reader-state-save" pix/src/main/ipc-handlers.ts ; grep -rn "reader-state-save" pix/src | wc -l

# MF1 / MF3 相关的实现点
sed -n '131,152p;175,183p' pix/src/renderer/stores/reader-state-store.ts
sed -n '420,435p' pix/src/renderer/components/workspace/ChatPanel.vue
grep -n "STATE_FILE_B" pix/scripts/ui-shot.mjs
```

（本步未运行 `cd pix && npm run check`、未跑离屏、未跑构建；MF1–MF3 为代码路径推导，判定结论以设计/开发步的实跑为准。）

---

# PiX-Read R18 设计评审（独立挑刺）

> 评审对象：`docs/pm/R18-design.md`（对照 `docs/pm/R18-req.md` 及 §0 定稿修订 MF1–MF10），HEAD = `1561cb4`。
> 证据面：本步**实跑** `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check`（`CHECK_EXIT=0`）、`git status --short` / `git log --oneline -1`、`wc -l`、`grep` / `sed` / `node -e` 只读读数（含基线目录 `pix-v06-r17c-review/shots` 复读）。**未跑离屏、未跑 `smoke:notes` / `smoke:view`、未跑构建**；凡涉及离屏运行行为的结论均标注为「代码路径推导」。
> 写操作仅本档（追加本节）。

## 设计评审（R18）

### 0. 结论

**revise（改档后即可动工，不需重做设计）。**

设计档的可判定面在实读下基本成立：字段契约与 req §0.3/§0.4 逐字对齐、写侧「覆盖 / 保留」规则与「读侧必须成对带回」的因果链正确、入口四闸与点击链路逐函数可追、stub 与烟测的可构造性成立、白名单与「零新 IPC」可达、既有断言 0 条需改写。但存在 **1 处会让唯一工程门必红**的契约缺陷（`noteDiscussion` 形参类型与调用点不自洽）、1 处事实行号错误、1 条结构性恒真的空断言。三者为 must-fix。

抽检结论（全部为本步实读，非档内转述）：`SEL` 72 项且 `};` 在 `:128`、`CONFIG.root/rootB` `:437-439`、`SESSION_STATE` `:637-651`（`:645` / `:646` / `:647`）、`handleCommand` `:666-689`（`switch_session` 合支行 `:685-687`）、stub 镜像 `:699-709` / `:715-717` / `:724` / `:728` / `:732` / `:738` / `:742` / `:746-751` / `:754-772` / `:775` / `:797-801`、`listSessions` `:895` 恒空、`readerStateLoad` `:1134-1146`、`readerStateSave` `:1147-1167`、`__pixStub` `:1185-1258`（`:1239` / `:1243` / `:1257` / `:1258`）、`writeFixtures` `:397-420`（A/B 清理 `:409-410`）、`runReaderStateScenarios` `:1601-11532`（收口 `:11531`）、helper 表全对（`:1603` / `:1605` / `:1606` / `:1608` / `:1619-1622` / `:1624` / `:1628` / `:1629` / `:1631-1637` / `:1640` / `:1641` / `:1642` / `:1643` / `:1686` / `:1721` / `:1730` / `:1731` / `:2394` / `:2544` / `:2556` / `:2579` / `:3268-3281` / `:3407-3415` / `:3426-3430`）、`smoke-notes.mjs` #5 收尾 `rmSync` `:1317` + `} finally` `:1318`、`check(` 计数 65 / 74、基线目录 `174 张 / 253 条 / 69 种 label / 174 png`（`failure: null`）、`reader-state-save` 单文件 1 / 跨目录 2、`notes-stat` `:547`、`preload.ts:176`、渲染层 `switch_session` 1 处、Vuetify `VListItem.js:222-223` + `VListItem.css:6`、mdi 两图标各 1 处。**仅两处行号与 HEAD 不符**（见 MF2）。

### 1. 字段与协议（重点 1）

**1.1 向后兼容成立（旧文件读取 / 写回不丢字段、不触发降级）。** 证据：`pix/src/main/reader-state-store.ts:115-124` 的 `parseDocState` 现状只产 `{page, scale, updatedAt}`；`parseReaderState`（`:142`）的键域过滤只作用于 `documents` 的**键**（`isStoredDocPath(key) && docPathKey(key) === key`），`readStateFile`（`:165`）不校验条目键集 ⇒ 旧文件零报错、零 warn、零降级（与 req §0.3 一致）。设计档 §1.1.2「必须把合法对带回」是**真需求**而非修辞：`saveReaderState`（`:251`）的 `documents: { ...current.documents, [key]: … }` 把其它条目从解析结果带过 ⇒ 读侧不回带即「翻页静默清空其它文档记录」（R1）。写侧 `previous` / `carried` 与 req §0.4 的「有效对 ⇒ 覆盖 / 否则 ⇒ 保留（含本来就没有）」逐字一致，`...carried` 位于 `updatedAt` 之后 ⇒ 键序 `page → scale → updatedAt → lastSessionPath → lastSessionAt` 与 req §0.3 一致；`.corrupt-*` 备份、`version-unsupported` 拒写、`read-failed` 拒写三条降级路径不在改动面内。

**1.2 写入时机唯一且可判。** 渲染层唯一写出口是 `submit`（`pix/src/renderer/stores/reader-state-store.ts:110-129`，`grep -c "readerStateSave"` 实读 = 1），`noteDiscussion` 复用同一路径 ⇒ 唯一 `saveEpoch` 守卫（`:111` / `:119` / `:126` 零改写，MF6 落地正确）；`grep -c "noteDiscussion" ChatPanel.vue` = 1 可达（唯一调用点在 try 尾部）；失败只允许 `submit` 既有的一行 `[reader-state] warn`（`:120` / `:127`），不新增 UI / 不新增 IPC。发送失败（catch 分支）不记录、打开 / 翻页 / 缩放 / 切会话不携带两键（`submitIfChanged` 的比较表达式 `:131-141` 零改写）—— 三条都在 req §0.4 的冻结面内，设计档逐条对齐。

**1.3 阻断缺陷（MF1）：`noteDiscussion` 的形参类型与调用点不自洽 ⇒ `npm run check` 必红。** 见 must-fix MF1。

### 2. 入口链路（重点 2）

**2.1 逐函数调用链（实读行号，与档内逐字一致）。** `ReaderPanel.vue` 新增模板节点 `.reader-discuss`（Teleport 至 `.center-pill`）→ `openDiscussion()`（载荷 `discussEntry.value.path`）→ 新增 emit `open-session`（`defineEmits` 现状 `:35-37` 仅 `open-document`）→ `WorkspacePage.vue:332-336` 的新增绑定 `@open-session="onOpenDiscussionSession"` → 新处理器（`docPathKey` 解析 `projectStore.sessions`（`:25`）→ 两条 no-op 守卫 → `void onSwitchSession(session)`）→ 既有 `onSwitchSession`（`:170-177`：`sessionStore.clearSession()` → `rpc.switchSession(session.path)` → `useRpc.ts:290-296` 的 `sendCommand({type:"switch_session", sessionPath})` + `refreshSessionData()`（`:85`）→ `projectStore.setCurrentSession(session)` → `syncWorkspaceState({loadMessagesIfEmpty:true})`（`:58-74`，内含 `listSessions()` → `syncCurrentSession(sessionFile, sessionId)`））。全链无第二实现、无新 IPC（`grep -rn "switch_session" pix/src/renderer | wc -l` 实读 = 1）。

**2.2 失败与降级路径可判。** 记录会话不在 `projectStore.sessions` ⇒ `currentDiscussion` 为 null ⇒ 不渲染且读侧不改文件（req §0.0 第 3 条）；列表刷新时延（挂载 / 发送 / 切换 / 删除后）已登记为接受项；「活动会话 = 记录会话 ⇒ 隐藏」的判定源与 `ChatPanel.isActiveSession`（`:864-866`）同源（`projectStore.currentSession?.path`，`WorkspacePage.vue:49`）。档内 §1.3.7 的五种情形与本步实读的代码路径一致。

**2.3 与 `.center-pill` 既有元素的 DOM / 几何关系（登记项核对）。** 实读：全仓 `to=".center-pill"` 的 Teleport **仅 2 处**（`ReaderPanel.vue:193` 的 `.map-toggle`、`ShortcutOverview.vue:86` 的 `.shortcut-toggle`），pill 的静态子元素是 `WorkspacePage.vue:321-331` 的 `.pill-icon-btn`（`v-if="leftCollapsed"` `:322-329`）与 `.pill-label`（`:330`）⇒ 设计档 §1.3.1 的清单**完整且无遗漏**。任务书提到的 `SEL.readerSection`（`.reader-section`）**不是** pill 子元素：它是 `PdfViewer.vue:1166-1186` 的 PDF 底部浮层，样式 `position: absolute; bottom: 46px`（`PdfViewer.vue:1437-1453`）⇒ 与入口无几何耦合，档内不登记它是正确的。pill 固定高 `--pix-pane-pill-height: 28px`（`assets/styles/variables.css:114`）与 `.reader-discuss` 的近似 20px 无高度冲突；唯一位移是宽度（档内已登记为允许项，且 §8.1 必查三项覆盖目视面）。scoped 样式随 Teleport 生效有 `.map-toggle` 先例（同一 `<style scoped>` 块），档内「不需要 `:deep()`」的判断成立。

### 3. 与既有断言的冲突（重点 3）

**结论：需要显式登记改写的既有断言 = 0 条（与档内 §2.3 一致）。**

- **20-resume（`resume-entry` 组）**：实读 `ui-shot.mjs:1795` / `:1800` / `:1809` / `:1825` / `:1834` / `:1855` 六处 `record`，断言只取 `.reader-resume` 文本、`.empty-title`、`.reader-empty-error`（`:1823-1836`、`:1849-1856`），不含 `.center-pill` 子元素与会话菜单 ⇒ 零冲突。
- **WorkspacePage 的会话切换断言**：脚本内**不存在**——`grep -c "pill-session" pix/scripts/ui-shot.mjs` 实读 = 0，`grep -n "switch_session" pix/scripts/ui-shot.mjs` 只命中 stub 分支 `:685`（另 `grep -n "重命名\|历史对话\|新对话"` 无菜单交互）⇒ 「既有场景从不打开会话菜单」成立，`#append` 槽改动对既有截图 / 测量零影响。
- **整份 state 落测量的弱深比较**：`:2315` 与 `:2341` 把整份 state 写进 MEASUREMENTS（`record("reader-state-degrade", …, rebuilt)` / `record("workspace-switch", …, file: homeFile)`），断言本身只读 `version` / `lastDocPath` / 条目 `page`；因写侧不凭空造字段（req §0.3 冻结），既有读数零变化 ⇒ 无需改写。
- **`.center-pill` 相关既有断言**：`SEL.centerDocLabel`（`:112`）与 `:3367` 只读文本；R17 的 pill 矩形取法（`:10684` / `:10758`）位于 `runScenario`（先于 r18），其夹具无两键 ⇒ 新元素恒不渲染 ⇒ 零位移。

### 4. 离屏与烟测可构造性 / 空断言（重点 4）

- **会话路径在 stub 面可得**：`SESSION_STATE.sessionFile`（`:645`）→ `handleCommand` 的 `get_state`（`:680`）→ 渲染层 `sessionState`（`useRpc.ts:25`，暴露 `:465`）⇒ `noteDiscussion` 的第四实参可判；`switch_session` 的 `SESSION_STATE` 镜像（档内 §1.5.3 ①）是「`.pill-session .pill-label` 变化」与「活动会话隐藏入口」两条判据的**必要条件**，档内已给。
- **菜单可探可关**：`.v-overlay-container` 由 Vuetify `useTeleport` 建在 body（`pix/node_modules/vuetify/lib/composables/teleport.js` 的 `className = 'v-overlay-container'`）；Esc 关闭由 `VOverlay.js` 在 window 上的 `keydown`（`e.key === 'Escape' && globalTop` ⇒ `isActive = false`，非 `persistent`）实现 ⇒ `openSessionMenu` / `closeSessionMenu` 的幂等实现成立。行文本用 `.v-list-item-title` / `.v-list-item-subtitle` 是**props 渲染**（`ChatPanel.vue:953-954` 传 `:title` / `:subtitle`），非自定义结构 ⇒ 探针选择器有效。
- **烟测**：`smoke-notes.mjs` 的编译面 `files` 已含 `main/reader-state-store.ts`、产物白名单 `required` 已含 `main/reader-state-store.js`、`allowed` 已含 `shared/types.js` ⇒ #6–#11 无需动编译面；`runReaderStateStore`（`:1226`）的 `#5` 收尾 `rmSync` 在 `:1317`、`} finally` 在 `:1318`（档内插入点逐字正确）；`check(G, index, …)` 的索引是显式实参（无连续性校验）⇒ `6…11` 可行；`PIX_READ_A`（`:29`）在场 ⇒ #11 的**备份增量**判据可判（N6 已收敛）。
- **空断言风险**：`r18-4` 相位 `workspace-b` 判据 ③（菜单 `.session-doc-mark` 计数 0）在 B 列表为空（`listSessions` 按根匹配 ⇒ `[]`）时**结构性恒真**——`isDocRelatedSession` 依赖 `docRelatedPath !== null`，而它依赖列表命中 ⇒ 该条不可能失败（must-fix MF3）。其余零计数判据均有同场景正向判据兜住（`r18-1` ⑦⑧ 对 `r18-2` ②、`r18-3` ①⑤ 由 ⑥⑦ 兜、`r18-5` ⑤ 由 ① 兜）⇒ 非空断言。`r18-4` 判据 ① 的两条理由在当前夹具下只有「列表为空」这一条生效，判据 ① 因此**兜不住**「渲染层 `documents` 未随工作区复位」的缺陷（若 B 列表非空则能兜住）——与 MF3 合并处理最省。
- **潜在陷阱（非阻断）**：`switchSessionCalls().count` 语义是「保留条数（上限 8）」而非累计调用数（档内 §1.5.3 的 `switchCalls.length`）⇒ `r18-1` 的 `count === base + 1` 仅在本轮累计切换 ≤7 次时成立；按 5 场景推演，本轮序内累计为 6 次（`r18-1` 相位 2/3、`r18-2`、`r18-3`、`r18-4`、`r18-5` 各 1），当前安全。

### 5. 白名单一致性与遗漏（重点 5）

- **齐备**：§4 的 9 条（`types.ts` / `main/reader-state-store.ts` / `renderer/stores/reader-state-store.ts` / `ReaderPanel.vue` / `ChatPanel.vue` / `WorkspacePage.vue` / `smoke-notes.mjs` / `ui-shot.mjs` / `docs/pm/R18-*.md`）与改动点一一对应；无遗漏文件（`docPathKey` / `formatSessionTime` / `deriveSessionTitle` / `useReaderStateStore` 均在既有模块；`.reader-discuss` 的 scoped 样式随 Teleport 生效有 `.map-toggle` 先例）。
- **零新 IPC 可达**：`ipc-handlers.ts:301-312` 的 `isReaderStateDraft` 只做形状校验并把 `draft` **原样**透传给 `saveReaderState`（`:555-557`）⇒ 两个新可选字段无需改 IPC / preload；`grep -c "reader-state-save" pix/src/main/ipc-handlers.ts` = 1、跨目录 = 2（`:555` + `preload.ts:176`）与档内一致。
- **既有面零删除可达**：`SEL` 追加 2 项（72 → 74）可用 `sed -n '/^const SEL = {/,/^};/p' | grep -cE '^  [a-zA-Z]+: '` 判；7 个新 helper 名与 `sessionsSeed` / `sessionsSeedRoot` / `switchCalls` / `setSessions` / `switchSessionCalls` / `isValidSessionPath` / `isValidSessionAt` / `MAX_SESSION_PATH_LENGTH` / `SESSIONS_A` / `SESSIONS_GHOST` / `PAST_AT` / `SEED_AT` 在 `ui-shot.mjs` 内**各 0 命中**（不构成重复 `const` 的语法冲突）；产品侧 12 个新名字在 `pix/src` 内各 0 命中。
- **冻结字面复核**：`reader-resume` 3、`pill-session` 3、`session-delete-btn` 4、`历史对话` 2、`mdi-forum-outline` / `mdi-file-link-outline` 各 1 ⇒ 与本轮「只增不改」的目标一致。

---

## must-fix 清单（动工前必须改档）

### MF1 `noteDiscussion` 的形参类型与调用点不自洽 ⇒ 唯一工程门必红

- 位置：§0.3「`noteDiscussion` 的返回面」行（`function noteDiscussion(absPath: string, page: number, scale: number, sessionPath: string): void`）、§1.2.2 签名与守卫 ②、§1.2.4 的调用行 `readerStateStore.noteDiscussion(readFilePath, readPage, readScale, sendingSessionPath);`、§1.2.4「同一同步段的三处快照」行（`sendingSessionPath = rpc.sessionState.value?.sessionFile ?? null`）。
- 证据（实读）：`pix/src/renderer/stores/reader-store.ts:25` `const filePath = ref<string | null>(null);` ⇒ `readerStore.filePath: string | null`；`pix/src/shared/types.ts` 的 `RpcSessionState` 内 `sessionFile?: string`，配合 `pix/src/renderer/composables/useRpc.ts:25` `const sessionState = ref<RpcSessionState | null>(null);` ⇒ `rpc.sessionState.value?.sessionFile ?? null: string | null`；`pix/tsconfig.json` 为 `"strict": true`（含 `strictNullChecks`）。把两个 `string | null` 实参传给 `string` 形参是 TS2345，`vue-tsc` 报错 ⇒ `npm run check` 红（本步实跑该门基线 `CHECK_EXIT=0`，即该缺陷由本轮引入）。附带：guard ② `if (!sessionPath) return;` 在 `sessionPath: string` 下退化为「空串」语义，与 req §0.4「内核未给出会话文件 ⇒ return」的意图不符。
- 修法（择一，档内必须写死）：① 签名改为 `noteDiscussion(absPath: string | null, page: number, scale: number, sessionPath: string | null): void`，函数内先 `if (!absPath || !sessionPath) return;`（收窄后再走 `toSnapshot(absPath, …)`）；② 保留 `string` 签名，把调用点写成显式窄化（如 `if (readFilePath && sendingSessionPath) readerStateStore.noteDiscussion(readFilePath, readPage, readScale, sendingSessionPath);`）——此时 `grep -c "noteDiscussion" ChatPanel.vue` 仍为 **1**。并在 §3 失败路径表补一行「调用点类型不匹配 ⇒ [check] 红（首个变红判据 = `CHECK_EXIT`）」。

### MF2 §0.1 两处行号与 HEAD 不符

- 证据：`sed -n '1676,1710p' pix/scripts/ui-shot.mjs` ⇒ `waitTreeRows` `:1678`、`waitPdfLoaded` `:1680`、`waitPage` `:1681`、`waitResumeEntry` `:1686`、**`goHome` `:1696`**、**`enterWorkspace` `:1706`**；档内写作 `goHome` `:1681`、`enterWorkspace` `:1691`（同表其余 helper 行号实读全部一致，属孤立错误）。
- 影响：§1.5.4 的 `enterWorkspaceWithState` 参考实现与该行号表是 dev 的定位基准；本档自述「全部行号 / 计数均来自本步真实命令输出」⇒ 须改字。建议同时在 §1.5.4 的「复用（零修改）」行补入实际依赖但未列出的 `waitTreeRows` `:1678` / `waitPdfLoaded` `:1680` / `waitPage` `:1681` / `seedNotes()` `:347` / `fileHash` `:4366` / `js` `:1602` / `SEL`（`fileHash` 与 r18 场景同处 `runReaderStateScenarios` 作用域 ⇒ 可直接复用）。

### MF3 `r18-4` 相位 `workspace-b` 判据 ③ 是空断言（恒真）

- 位置：§1.5.5「场景 `r18-4`」相位 `workspace-b` 判据 ③（「菜单 `.session-doc-mark` 计数 **0**」）。
- 证据（代码路径推导 + 实读）：§1.4.1 的 `isDocRelatedSession` 要求 `docRelatedPath !== null`，而 `docRelatedPath` 只读 `currentDiscussion`，后者在 `projectStore.sessions` 无路径命中时恒为 null（§1.2.5 闸 ③）；该场景的 stub 前置是 `setSessions(SESSIONS_A)`（默认根 = `LIBRARY_DIR`）且 `listSessions` **按根匹配**（§1.5.3）⇒ 进入 B 后列表恒为 `[]`，菜单里**没有会话行** ⇒ 判据 ③ 结构上不可能失败。同类削弱也落在判据 ① 上：判据 ① 的「两条独立理由」中只有「列表为空」可被触发，因此它**不能**兜住「渲染层 `documents` 未随工作区复位」的缺陷。
- 修法（择一，低成本）：① 在进入 B 前补 `js("window.__pixStub.setSessions(SESSIONS_A, LIBRARY_B_DIR), true")`（或让 `setSessions` 支持按根种入 B），使 B 列表非空 ⇒ 判据 ①③ 同时获得真正判别力（能兜住跨库内存残留）；② 保留夹具但把判据 ③ 显式登记为**无判别力（恒真）**，并在 §1.5.7 零位移论证中注明该条不构成跨工作区隔离的证据。**不得**把恒真判据留在「失败即红」列。

---

## 次要项（建议在本档或 dev 档登记，不阻断动工）

| # | 项 | 建议 |
| --- | --- | --- |
| N1 | §1.5.5 `r18-1` 判据 ⑧ 的 `.pill-label` 未限定作用域 | DOM 内有两枚 `.pill-label`（`WorkspacePage.vue:330` 的文档名、`ChatPanel.vue:931` 的会话名）；`SEL` 已有 `centerDocLabel: ".center-pill .pill-label"`（`:112`）⇒ 建议改判为限定选择器或复用 `SEL.centerDocLabel`（判据 ⑨ 已限定 `.pill-session .pill-label`，两条不要混用同一裸选择器） |
| N2 | §1.5.5 `r18-5` 判据 ③ 要求「`历史对话` 在场」，但 §1.5.4 的 `sessionMenuProbe` 只读 `.v-list-item` 行 | `历史对话` 是 `v-list-subheader`（`ChatPanel.vue:949`），不在探针的 `items` 内 ⇒ 补 selector（如 `.v-overlay-container .v-list-subheader`）或读容器 `textContent`，避免 dev 临时造探针 |
| N3 | `switchSessionCalls().count` 是「保留条数（上限 8）」而非累计调用数 | 本轮累计 ≤6 安全；建议档内注明该上限语义（或在 stub 内改为单调计数），以免后续追加场景时 `base + 1` 静默失效 |
| N4 | `noteDiscussion` 位于 `send()` 的 try 内、`applyLocal` 之后 | `submit` 自带 try/catch（渲染层 store）⇒ 无 unhandled rejection；但 `applyLocal`（同步段）若抛出会被 `send()` 的 catch 当作发送失败（`failOptimisticUserMessage` + 草稿还原）⇒ 建议档内写死「`noteDiscussion` 自身不得向上抛（或整段包一层 try）」 |
| N5 | §1.3.4 闸 1（`ready`）在 `discussEntry` 中未显式读取 | 实读下成立（`resetState` `:243` 清 `documents`；`loadReaderState` 在 `:175` 先置 `ready` 再 `applyState`，同一同步段内）⇒ 建议档内登记该前置依赖（「`ready === false` 期间 `documents` 必须为空」），以免后续把 `documents` 变成持久缓存时闸 1 静默失效 |
| N6 | §1.4.2 / §2.2 的「每一行多一枚空 `div.v-list-item__append`」表述偏宽 | 该槽只挂在 `v-for` 的历史会话行（`ChatPanel.vue:950-973`，`#append` 在 `:960`）；`新对话` / `重命名当前对话` / `暂无历史对话`（`:936-947`、`:974-978`）不在槽内 ⇒ 改述为「每一**历史会话行**」，dev 档登记时按行区分 |

---

## 复核命令（本节结论的复跑入口）

```bash
cd E:/develop/PiX-Read

# MF1：调用点与形参类型
sed -n '25p' pix/src/renderer/stores/reader-store.ts          # filePath = ref<string | null>(null)
sed -n '25p;465p' pix/src/renderer/composables/useRpc.ts      # sessionState = ref<RpcSessionState | null>(null)
grep -n '"strict"' pix/tsconfig.json                          # true
sed -n '386,435p' pix/src/renderer/components/workspace/ChatPanel.vue

# MF2：行号
sed -n '1676,1710p' pix/scripts/ui-shot.mjs                    # waitTreeRows :1678 / waitPage :1681 / goHome :1696 / enterWorkspace :1706

# MF3：B 侧列表为空 ⇒ 判据恒真
sed -n '895p' pix/scripts/ui-shot.mjs                          # listSessions 恒空（未种入时）
sed -n '1,20p' pix/node_modules/vuetify/lib/composables/teleport.js   # .v-overlay-container

# 事实基线抽检
sed -n '47,128p' pix/scripts/ui-shot.mjs | grep -cE '^  [a-zA-Z]+: '
node -e "const fs=require('fs');const d='C:/Users/86157/AppData/Local/Temp/pix-v06-r17c-review/shots';const m=JSON.parse(fs.readFileSync(d+'/MANIFEST.json','utf8'));const me=JSON.parse(fs.readFileSync(d+'/MEASUREMENTS.json','utf8'));console.log(JSON.stringify({shots:m.shots.length,failure:m.failure,measurements:me.length,labels:new Set(me.map(x=>x.label)).size}))"
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
```

（本节未跑离屏与烟测；MF3 与 §4 的空断言判定为代码路径推导，判定结论以开发步的实跑为准。）

---

# 代码审查（R18）

> 评审对象：当前工作树（HEAD = `1561cb4` + R18 未提交改动；`git status --short` 见 §5）。对照 `docs/pm/R18-req.md`（含 §0 定稿修订 MF1–MF10）与 `docs/pm/R18-design.md`（含「定稿修订（R18）」MF1–MF3）。
> 本步为**冷启动独立复验**：不复用交付方的产物目录、一次性脚本与结论。离屏取证用自建目录（`%TEMP%/pix-v06-r18-review` 与 `…-review2`，两轮严格串行、不并发）；旧格式兼容用自写一次性探针（`%TEMP%`，编译真实 `pix/src/main/reader-state-store.ts`，运行后删除）；判据复算用自写脚本（只读 `MEASUREMENTS.json`）。本步唯一写操作 = 本文件。

## 0. 结论

**revise**。功能面与判据面全绿，**未发现产品侧功能缺陷**（工程门 0 error、两条烟测 71/0 与 74/0（各连跑两次）、离屏两轮退出码 0 + `failure === null` + 基线零缺失 + 新增配额齐备 + r18 断言从**自有**读数独立复算 60/60 + 旧格式探针 27/27）。

但交付面存在 **2 处冻结面越界**（§3）：`R18-req` §0.1 / §N103-2 判据 2 / §6 反需求 12 与 `R18-design` §2.3 都写死了「既有场景 / 断言零改写」以及本轮可改面的枚举；交付的 `ui-shot.mjs` 有 **2 行既有断言被改写**（MF1），另有 **1 处冻结相位步骤被偏离**（MF2）。两处都是为实现本轮冻结语义所必需、且已在 `R18-dev` 登记，但登记位置不是冻结文档；按本轮纪律（先例 = R17 评审 P1：「需负责人裁决后再落开发档，不能由评审 / 开发自行改字」）必须由负责人裁决并就地把改动登记进 `R18-req` / `R18-design`，闭环后方可 accept。除 MF2 的可选收敛外，**无需产品代码改动**。

## 1. 实跑证据（本步真实命令与读数）

| # | 命令 / 方法 | 读数 |
| --- | --- | --- |
| 1 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` | `CHECK_EXIT=0`（0 error） |
| 2 | `node scripts/smoke-notes.mjs`（连跑两次） | 末行逐字 `通过 71 / 失败 0`、退出码 0；两次相同 |
| 3 | `node scripts/smoke-view.mjs`（连跑两次） | 末行逐字 `通过 74 / 失败 0`、退出码 0；两次相同 |
| 4 | 离屏第 1 轮：`PIX_SHOT_ROOT=%TEMP%/pix-v06-r18-review ./node_modules/.bin/electron scripts/ui-shot.mjs` | `REVIEW_EXIT=0`；末行 `结束：产出 186 张截图`；`MANIFEST.failure === null` |
| 5 | 离屏第 2 轮：同命令，目录 `…/pix-v06-r18-review2` | `REVIEW2_EXIT=0`、186 张、`failure === null`；两轮 `label#phase` 序列逐条一致（264 条，diff **0**）、截图集合差集 **0** |
| 6 | 零缺失比对（自写脚本，基线 `%TEMP%/pix-v06-r17c-review`，只读） | 截图 `{base:174, after:186, missing:[], added:12, r18:12, failure:null, png:174/186}`；测量 `{baseLabels:69, afterLabels:74, baseMeasurements:253, afterMeasurements:264, missingLabels:[], r18 = 3/2/2/2/2}`（两轮各测一次，读数相同） |
| 7 | r18 断言逐条复算（自写脚本，判据文本取自 req §N103-2 / design §1.5.5） | `R18_ASSERT_RECOMPUTE ALL_PASS (60/60)`，**两轮均 60/60** |
| 8 | 旧格式独立探针（自写；`tsc` 编译真实 `main/reader-state-store.ts` + `library-root.ts`） | `PROBE_RESULT ALL_PASS (27/27)`：旧文件读→写→读全程 `degraded:false` / 零 warn / 字段不丢 / 两键 `hasOwnProperty` 恒 false；其它条目两键逐字不动；有效对覆盖（库外路径原样）；6 种非法 / 半截对静默丢弃并保留既有对；corrupt 备份 + 重建无两键；`version:2` 拒写 + `error` 逐字 + 文件字节不变 |
| 9 | 既有面回归比对（自写脚本，逐字段） | `resume-entry`（5 条）、`reader-state-console`、`scale-restored`、`note-jump`、`list-current-doc-filter-off/on`、`after-filter-off-settled` **逐字段一致**；`reader-state-writes` 仅 `elapsedMs`（耗时）、`reader-state-degrade` 仅 `updatedAt`（时间戳）差异；唯一语义差异 = `map-chapter-filter#injection`（= MF1，见 §3） |
| 10 | 目视（自建第 1 轮 4 张） | `r18-1b-discuss-entry.png`：`.center-pill` 内 4 件同排不换行、`.pill-label` 完整未截断、入口胶囊文本 `继续讨论：摘录与笔记走查 · 刚刚`；`r18-5-session-mark.png`：标记恰 1 枚在活动行行尾、另一行是删除按钮、`新对话` / `重命名当前对话` / `历史对话` 在场；`r18-4-workspace-b.png`：B 库无入口 / 无标记 / 无跨库残留；`r18-4b-back-to-a.png`：回 A 后入口恢复 `继续讨论：摘录与笔记走查 · 昨天` |
| 11 | 走查 / grep（见 §5） | 白名单、禁项、冻结字面计数、零 diff 逐条对位 |

**产品行为层的独立读法（三个专项反证）**

- **① 旧格式 `reader-state.json`（无新字段）读→写→读**：探针 #8 全绿（上表）；烟测 #8 同口径亦绿。**不丢字段、不触发降级、零 warn、不造字段** 成立。
- **② 会话文件缺失 / 不可读时的入口降级**：`main` 侧两谓词与成对裁剪由探针 #8/#③ 覆盖；渲染层唯一事实源 = `projectStore.sessions` 的路径比较键命中（`stores/reader-state-store.ts` 的 `currentDiscussion`，无 stat / 无文件读取）。离屏 `r18-session-missing/session-gone` 实测：入口 0、`.center-pill` 与 `.chat-panel` 内新增元素 0、菜单标记 0、warn 增量 0、现场两键逐字保留 —— 与 §0.0 第 3 条「静默隐藏 + 记录保留原样」逐字一致。
- **③ 跨工作区不串**：`r18-4/workspace-b`（B 列表按 B 根种入 = 4 行菜单在场，`entryCountA === 1` 作防空）B 侧入口 0、B 条目在场且无记录键、A 文件 sha 不变；`back-to-a` 入口恢复且 `pairSame = true`。附：stub 的 `listSessions` 按 `normalizePath(dir)` 与种子根比较（`ui-shot.mjs:931-935`），产品侧 `project-store.listSessions(project.path)` 的工作区隔离语义未被绕过。
- **④ 点击入口后确有会话被打开（真实调用链）**：`r18-1/entry-visible-and-click` 实测 `switchSessionCalls().paths` 末项 = 记录会话（= 产品 `useRpc.switchSession` 的既有 `switch_session` 命令，`grep -rn "switch_session" pix/src/renderer | wc -l` = 1，零增量）、`.pill-session .pill-label` 由 `消融实验对照` → `摘录与笔记走查`、重开菜单该行 `active = true`；同时文件 sha 不变、`saveCalls` 增量 0、页码 / 缩放逐字不变。不是「仅 UI 变化」。
- **⑤ 既有 20-resume 与 reader-state 面零回归**：`resume-entry` 5 条 record 与基线逐字段一致（含 `.reader-resume` 文案与降级分支）；`reader-state-writes` / `reader-state-degrade` / `reader-state-console` 仅时间戳 / 耗时字段差异；`r15-workspace-late-register#unmount-during-load` 的 `listSessionsDelta = 0` 实测成立（未种入 ⇒ 恒 `[]`）。

## 2. 验收逐条结论（req N100–N103；判据编号沿用 req / design）

| 子条 | 结论 | 判定依据 |
| --- | --- | --- |
| N100-1（字段与形状） | 通过 | 烟测 #6（71/0）；探针 #8 的覆盖版；`grep` 计数 13 / 0 / 1 / 0 对位；磁盘键序实读 `page → scale → updatedAt → lastSessionPath → lastSessionAt`；`ipc-handlers.ts` / `preload.ts` 零 diff 且 `reader-state-save` 单文件 1、跨目录 2 |
| N100-2（旧文件兼容与降级零改动） | 通过 | 烟测 #8 / #11；离屏 `old-format-silent`（resume 文案逐字、`hasPairKey=false`、warn 0）与 `session-gone`（warn 0、两键原样）；降级面 `+/-` 行 0；`grep -c "await"` = 1 |
| N100-3（写侧保留与越界丢弃） | 通过 | 烟测 #7 / #9 / #10；离屏 `send-records`（其它条目两键逐字不动、`page` / `scale` 不被发送改写）与 `send-failed`（两键逐字不变）；伪证排除 `+/-` 行 0 |
| N100-4（写入时机） | 通过 | `send-records` 末条 payload 两键与磁盘逐值相等；`open-switch-no-write`：`page=3`、`updatedAt > SEED_AT`（防空）且仍无记录键；`send-failed` 不写；`noteDiscussion` 计数 = 1（ChatPanel）/ 2（store）/ 0（其它三处）；`send()` 既有语句除登记的一处 `return;` → `} else {` 外零 `+/-` |
| N100-5（渲染层记录路径与唯一派生） | 通过（1 处字面冲突见 §4 S3） | `send-records` 文件 / payload / 入口三层一致；`r18-4` 隔离与恢复；`currentDiscussion` 2 / 3 / 0；`submitIfChanged` 比较表达式零 `+/-` 行；`[check]` 0 error |
| N101-1（入口位置 / 字面 / 样式） | 通过（1 项复核口径见 §4 S5） | `entry-visible-and-click`：前缀逐字 + 后缀 ∈ 运行时允许集 + `title` 逐字 + `switch` / `pill` / `activeRow`；`back-to-a` 恢复逐字；字面 5 / 1 / 1；`reader-resume` 零 `+/-` 行且计数 3 |
| N101-2（解析与零占位） | 通过 | `old-format-silent`（入口 0 且 `.reader-resume` 在场作防空）、`send-records`（活动 = 记录 ⇒ 0）、`session-gone`（0 + 无提示容器）；`documents[`（components）= 0；`SessionInfo`（ReaderPanel）= 0 |
| N101-3（点击链路与降级） | 通过 | 见 §1 专项 ④；B 侧 0 / 回 A 恢复；`switch_session`（renderer）= 1；ReaderPanel 内 `sendCommand|ipcRenderer` = 0 |
| N101-4（边界） | 通过 | 上述两相位 + `grep -c "reader-discuss" ReaderPanel.vue` = 5（无 `v-else` 占位 / 无第二枚元素） |
| N102-1（标记字面与结构变更） | 通过 | `mark-visible`：标记恰 1（活动行）、`title` 逐字、另一行无标记、`.session-delete-btn` 恰 1 且 `title` 逐字 `删除该对话`、三文案在场；`mark-absent`：0 + 切回恢复 + `pairSame`；字面 2 / 1 / 1；`session-delete-btn` 无 `-` 行 |
| N102-2（取值纪律与成本） | 通过 | `currentDiscussion`（ChatPanel）= 2、`readerStateStore.documents` = 0、`lastSessionPath` = 0；`session-store.ts` / `project-store.ts` 零 diff；两相位同时钉住有 / 无标记两侧 |
| N103-1（烟测 +6） | 通过 | 71/0 两次；`-` 行 0；新增行只落在 `runReaderStateStore`（两处 `@@`）；断言索引 6…11 |
| N103-2（离屏 5 场景 / 11 条 / 12 张） | **不通过（1 处）** | 5 组 record 全绿、12 张截图齐备、5 组条数 3/2/2/2/2 与冻结逐字一致；stub 九处与 7 helper 与 5 场景齐备；矩形取法（3 张 `rectOfSelector(".center-pill", 12)` / 其余整窗）一致；`api` 面 42 方法、`package.json` 零 diff、`listSessionsCalls` 计数不减、未种入恒 `[]`（r15-f16 实跑 `listSessionsDelta = 0`）。**但判据 2「既有场景函数体零改动」被破**（§3 MF1），另有 §3 MF2 的步骤偏离 |
| N103-3（基线与零缺失） | 通过 | §1 #6 + #9；既有高判别力面（resume-entry / reader-state-* / r15-f16 / R16 / R17 五组 label）全部在场且读数对位；除 §3 MF1 与 §4 S4 外的非预期差异未发现 |
| N103-4（工程门与零残留） | 通过 | `[check]` 0；零新 IPC / 零依赖（范围外 `git diff --numstat` = 0 行）；`git status` 仅白名单；仓库零残留 + `%TEMP%` 无烟测残留（见 §5） |

## 3. must-fix 清单

### MF1 既有断言改写（`map-chapter-filter` 相位 `injection`，冻结面越界）

**事实（实读）**：`git diff -U0 -- pix/scripts/ui-shot.mjs | grep -cE "^-[^-]"` = **6**，其中 4 行是 `R18-design` §1.5.2 已登记的 stub 实现行，另 **2 行是既有断言**：

```
-      stateBytesSame: fileHash(STATE_FILE_A) === stateHash52i,
-      ...(fileHash(STATE_FILE_A) === stateHash52i ? [] : ["发送不得改写 reader-state.json"]),
```

替换为现场投影比较（`stateProjection` 忽略讨论两键与 `updatedAt`，见 `ui-shot.mjs:1693-1700` / `5118-5128`），并在取基线前新增一次 `waitState`。

**冻结依据（不得由评审 / 开发自行改字）**：`R18-req` §0.1「R14 / R16 / R17」行「`SEL` 与既有场景 / 截图 / label **零删除零改写**」；`R18-req` N103-2 判据 2「既有场景函数体零改动（`git diff` 只显示：`SEL` 2 项、stub 会话与实时状态镜像扩展、新 helper、`r18-1`…`r18-5`）」；`R18-req` §6 反需求 12；`R18-design` §2.3「本轮改写的既有断言（逐字列出 = **无**）」（该节论证「既有 reader-state 断言只做字段级读取」与本相位的**字节比较**不符 ⇒ 设计档漏识别了该冲突）。

**为什么必须动（本步实跑佐证）**：该相位打开 `sample-paper.pdf` 且发送成功 ⇒ 按 N100-4 的冻结语义必写两键；本步两轮实测该相位 `stateBytesChanged = true` 且 `stateSameExceptRecord = true` ⇒ 冻结的**字节断言在该相位不可能为真**。这是两份冻结字面之间的冲突，不是实现缺陷。

**处置（需负责人裁决，二选一）**：
1. **采纳（推荐）**：把该处断言更新**逐字登记进冻结文档**（`R18-req` 增补「既有断言更新（唯一一处）」条目 + `R18-design` §2.3 改字），先例 = `R17-req` §0.9 #4（三处 `btnCount` 断言的登记式更新）。
2. **拒绝**：给出不改写既有断言的等价实现（本步未找到可行形态：该相位内存在一次成功发送，且 N100-4 已冻结「成功即写」）。

**影响评估（判别力未降）**：`52` 相位的字节级断言（`ui-shot.mjs:4799` / `4813`）按原样未动，仍兜住「纯 UI 路径零写盘」；`injection` 改为「除讨论记录外逐字不变」后仍覆盖 `version` / `lastDocPath` / 各条目 `page` + `scale`；「写记录不得波及其它条目」由 `r18-1` 判据 ③ 与烟测 #7 另证。

### MF2 `r18-3` 相位 `session-restored` 的点击目标偏离冻结步骤

**事实（实读）**：`R18-design` §1.5.5（与 `R18-req` §N103-2 场景 `r18-3` 相位 2）冻结步骤为 `clickSessionItem("消融实验对照")`；实现为 `clickSessionItem("摘录与笔记走查")`（`ui-shot.mjs:12059`，含理由注释）。

**为什么必须动（代码路径 + 遗留态推导）**：`restoreStandardSeed()`（`ui-shot.mjs:3513-3517`）**不复位** `SESSION_STATE`；全仓唯一改 `SESSION_STATE` 的代码 = stub 的 `switch_session` 镜像分支（`ui-shot.mjs:693-703`）。`r18-2` 末次点击把活动会话钉为 `消融实验对照` ⇒ 进入 `r18-3` 后该行**就是活动行** ⇒ `ChatPanel.onSelectSession`（`ChatPanel.vue:895-898`）对活动行 early-return ⇒ 冻结字面**不会触发 `switch_session`**、也就没有 `listSessions` 刷新 ⇒ 判据 ⑥ 的 `waitDiscussText("继续讨论：丢失后恢复的会话 · 昨天")` 必超时（相位恒红）。改后写法（点非活动行）能真实切换、判据 ⑥⑦⑧ 语义不变，本步两轮实测全绿。

**残留问题（同一处需一并收敛）**：改后写法把「活动会话」交给**前序场景遗留**（`r18-2` 末次点击的镜像），与 MF2 在 req 侧确立的原则「活动会话由场景自身确定，不依赖前序场景遗留的 `SESSION_STATE` 镜像」不一致；若后续调整场景顺序或 `r18-2` 的会话点击，本相位会静默变红。

**处置（需负责人裁决）**：① 把该处步骤偏离逐字登记进冻结文档；② **建议**一并把该相位改为自确定（`sessionMenuProbe()` 读出两行后点「非活动」的那一行，或先显式钉住活动会话再点另一行），与 `r18-1` / `r18-4` / `r18-5` 同口径 —— 这一步需要改脚本（可选，非阻塞）。

## 4. 次级项（不阻塞，登记 / 建议）

| # | 项 | 事实与建议 |
| --- | --- | --- |
| S1 | `r18-2` 相位 `open-switch-no-write` 的会话点击在当前执行序下是 no-op | 活动会话 = `消融实验对照`（`r18-2` 起始即如此：`r18-1` 末次点击的镜像），故该相位对「切换会话不写记录」的判据 ⑥ 实际未触发真实切换（判据仍绿）。**本相位步骤逐字符合冻结字面**，故不计 must-fix；「切换不写记录」由 `r18-1` 相位 2 判据 ⑩（点击入口触发真实切换 + 零写盘）与 `r18-3` 相位 2 判据 ⑧（真实切换 + 两键不变）兜住。建议与 MF2 的自确定写法一并收敛（注：该相位未落 `switchSessionCalls` 读数，判定为代码路径推导）。 |
| S2 | `docName` 取**比较键**（小写）⇒ 大小写变形的文档名 tooltip 显示小写形态 | `R18-design` §1.2.5 已登记该取舍；与 `.pill-label`（原名）可能不一致（夹具全小写 ⇒ 判据不受影响）。若负责人不接受：`docName` 改用 `docDisplayName(readerStore.filePath ?? "")`（一行，仍只读 store）。 |
| S3 | `N100-5` 判据 4 的字面与 §0.4 / design §1.2.3 互斥 | 判据 4 要求「既有 `documents` / `lastDoc` / `updatedAt: Date.now()` 语句不作为 `-` 行出现」，而 §0.4 / design §1.2.3 又要求 `applyLocal` 的条目构造扩展为「携带 ⇒ 覆盖 / 未携带 ⇒ 保留」⇒ 条目构造行必然是 `-` 行（本步实读：`documents.value =` / `lastDoc.value =` / `submitIfChanged` 比较表达式零 `+/-` 行；`updatedAt: Date.now()` 在未携带分支逐字保留）。实现按 design §1.2.3 落地；建议下次改档把该句改为「除 `applyLocal` 条目构造行外」。 |
| S4 | 基线目录 `pix-v06-r17c-review` 自身有一处环境性异常读数 | `page-tracking#bottom-clamp-50` 的 `before.scrollHeight`：基线与我的两轮分别 2438 / 2670 / 2670；另查 8 个运行目录（R16 + R17 四目录 + R18 三轮）**全部为 2670** ⇒ 该值只看环境，判据（可滚动 + 触底换页）不依赖它，**非 R18 引入**。 |
| S5 | 4 项「入口形态」断言的独立复核口径 | `count === 1` / `tagName === "BUTTON"` / 图标类含 `mdi-forum-outline` / `.pill-label` 与 `.map-toggle` 在场：由脚本体断言执行；本步以「断言代码文本 + 两轮退出码 0」为准，另由目视（`r18-1b` 截图中 pill 内 4 件同排、`.pill-label` 完整）旁证，未做 DOM 级独立取值。 |
| S6 | `r18-5` 相位 `mark-absent` 用 `waitFor(".pdf-page" === 60)` 代替冻结步骤的 `waitPdfLoaded()` | 等价就绪信号（long-book 60 页），属未登记的实现级差异；不影响判据。 |
| S7 | 两处**设计外的正向加固**（已由 dev 登记） | ① `sessionMenuProbe` 增 `appendCount` / `appendWidth` 并落成断言（MF10 的实测登记：标记行 20px / 删除按钮行 22px / B 侧活动行空容器 0px / 命令行无容器）；② `waitState` 上移到 helper 区（`TDZ` 需要，供既有 `52-inject` 相位与本轮共用）。 |

## 5. 红线走查（本步实读 / 实跑）

| 项 | 命令 | 读数 / 结论 |
| --- | --- | --- |
| 白名单 | `git status --short` | 8 个修改（`types.ts` / `main/reader-state-store.ts` / `renderer/stores/reader-state-store.ts` / `ReaderPanel.vue` / `ChatPanel.vue` / `WorkspacePage.vue` / `smoke-notes.mjs` / `ui-shot.mjs`）+ 4 个未跟踪文档（`R18-req / design / dev / review`）⇒ 与 req §7 白名单逐行对位 |
| 范围外零 diff | `git diff --numstat -- ipc-handlers preload session-bridge session-store project-store reader-store session-title notes-path smoke-view package.json package-lock.json pix/build packages tsconfig* vite.config.ts styles/**` | 0 行 |
| 禁项 | 新增行 grep | `any` 0、内联动态 import / `require(` 0、新增 `--pix-*` 变量 0、`transition|animation|@keyframes` 0、`console.log` 0、`TODO|FIXME` 0 |
| 冻结字面 | 计数（本步实读） | `lastSessionPath`(src) 13 ≥4；components 内两键 **0**；`MAX_SESSION_PATH_LENGTH` 主进程 1 / 渲染层 0；`reader-state-save` 单文件 1 / 跨目录 2；`reader-discuss` 总 5（ReaderPanel 内 5）；`继续讨论` 命中文件 1；`mdi-forum-outline` 1；`session-doc-mark` 2；`mdi-file-link-outline` 1；`最近讨论：` 1；`reader-resume` 3 / `pill-session` 3 / `session-delete-btn` 4 / `历史对话` 2（全部保持）；`readerStateSave`(store) 1；`noteDiscussion` 2 / 1 / 0；`currentDiscussion` 2 / 3 / 0；`documents[`(components) 0；`switch_session`(renderer) 1；ReaderPanel 内 `sendCommand|ipcRenderer` 0；`await`(main store) 1；ChatPanel 内 `readerStateStore.documents` 0 / `lastSessionPath` 0；`SessionInfo`(ReaderPanel) 0 |
| 冻结面 diff | `git diff -U0 …` | 降级面（`DEGRADE_MESSAGES` / `ERROR_MESSAGES` / `uniqueBackupPath` / `writeFileAtomic` / `resolveLastDoc` / `toRelativeDocPath` / `isStoredDocPath` / `parseReaderState`）`+/-` 行 **0**；`reader-resume` / `pill-session` / `session-delete-btn` / `pill-label|reader-under-pill` `+/-` 行 **0**；`smoke-view.mjs` diff 0 行；`smoke-notes.mjs` `-` 行 0；`ui-shot.mjs` `-` 行 **6**（4 登记 stub + **2 既有断言** ⇒ §3 MF1）；`SEL` 74；`api` 42 方法；`smoke-notes` 71 / `smoke-view` 74 |
| 零残留 | 仓库 + `%TEMP%` | 仓库无临时脚本 / 产物 / 日志（`ls -a` 无 `nul` / `*.log` / `*.tmp` / `probe`）；两条烟测运行后 `%TEMP%` 无 `pix-smoke-*`；本步探针 / 比对 / 复算脚本均为 `%TEMP%` 一次性文件，已在结论落定后删除；离屏产物只在自建 `%TEMP%` 目录（脚本启动守卫 + 结束自检继续生效：产物目录无白名单外条目） |

## 6. 复核命令（本节结论的复跑入口）

```bash
cd E:/develop/PiX-Read

# ① 冻结面越界（MF1）：ui-shot 的删除行只允许是 4 处登记 stub 行
git diff -U0 -- pix/scripts/ui-shot.mjs | grep -nE "^-[^-]"

# ② MF2：r18-3 相位 2 的点击目标 vs 冻结字面
grep -n 'clickSessionItem("消融实验对照")\|clickSessionItem("摘录与笔记走查")' pix/scripts/ui-shot.mjs
grep -n "const restoreStandardSeed" -A 4 pix/scripts/ui-shot.mjs          # 不复位 SESSION_STATE
grep -n "SESSION_STATE.sessionFile = mirror.path" pix/scripts/ui-shot.mjs # 唯一镜像点
sed -n '895,898p' pix/src/renderer/components/workspace/ChatPanel.vue     # 活动行 early-return

# ③ 零缺失比对（把 AFTER 换成本步目录 / 自建目录）
node -e "const fs=require('fs');const b='C:/Users/86157/AppData/Local/Temp/pix-v06-r17c-review/shots';const a='C:/Users/86157/AppData/Local/Temp/pix-v06-r18-review/shots';const bm=JSON.parse(fs.readFileSync(b+'/MANIFEST.json','utf8'));const am=JSON.parse(fs.readFileSync(a+'/MANIFEST.json','utf8'));const bn=bm.shots.map(s=>s.name),an=am.shots.map(s=>s.name);const cnt=p=>{const m=JSON.parse(fs.readFileSync(p+'/MEASUREMENTS.json','utf8'));const x={};for(const e of m)x[e.label]=(x[e.label]||0)+1;return x};const bc=cnt(b),ac=cnt(a);console.log(JSON.stringify({base:bn.length,after:an.length,missing:bn.filter(n=>!an.includes(n)),r18:an.filter(n=>n.startsWith('r18-')).length,failure:am.failure,baseLabels:Object.keys(bc).length,afterLabels:Object.keys(ac).length,missingLabels:Object.keys(bc).filter(k=>!ac[k]||ac[k]<bc[k]),r18Counts:Object.entries(ac).filter(([k])=>k.startsWith('r18-'))}))"

# ④ 工程门与烟测
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
node scripts/smoke-notes.mjs | tail -1 ; node scripts/smoke-view.mjs | tail -1
```

## 7. 未覆盖 / 局限（如实登记）

1. **未跑的项**（本步禁止或不需要）：`npm run build` / `npm test` / `npm run package` / `npm run dev`；`packages/**` 未触碰（只读核对）。
2. **离屏只跑 2 轮**（严格串行、不并发），未复跑交付方声明的第 3 轮；两轮读数一致（264 条 `label#phase` 序列 diff 0）。
3. **产品行为层证据来自离屏 stub**（无真实内核 / 无真实主进程）：两键的落盘语义由烟测（真实主进程模块）与自写探针双证；交互层由 stub 镜像 + 产品组件真实代码路径（`send()` → `noteDiscussion` → `submit` → IPC；`openDiscussion` → emit → `onOpenDiscussionSession` → `onSwitchSession`）双证。
4. **4 项 DOM 形态断言未做独立取值**（§4 S5）；`r18-2` 相位 2 的「切换」实际发生与否为代码路径推导（§4 S1）。
5. **本步未改动任何源码 / 脚本 / 断言**；白名单核对以 `git status` 与 `git diff --numstat` 为准（§5）。

---

### R18 收口销账

> 对象：上一步对「代码审查（R18）」§3 两条 mustFix 的处置（`R18-req` §0.10 登记 1 / 登记 2、`R18-design` §2.3 与 §1.5.5、`ui-shot.mjs` 的 `r18-3` 相位自确定化）。
> 本步为**冷启动独立销账**：不复用处置方的一次性脚本；离屏两轮**严格串行、不并发**；证据 = 真实文件内容 + 真实命令输出；唯一写操作 = 本档本节。

**结论：closed。** 两条 mustFix 的登记内容与实现逐字一致；`r18-3` 相位自确定（不依赖前序场景遗留的 `SESSION_STATE` 镜像）且判别力只增不减；工程门与两条烟测 0 error / 0 失败；离屏收口轮退出码 0、`failure === null`、与基线零缺失、`r18-*` 断言从自有读数逐条复算全通过。

#### 1. 登记与实现核对（逐字）

| 项 | 核查（真实文件 / 命令） | 结果 |
| --- | --- | --- |
| 登记 1 文件 : label : 相位 | `pix/scripts/ui-shot.mjs` : `map-chapter-filter` : `injection` | 一致 |
| 登记 1 旧值（2 行） | 与 `git diff -U0 -- pix/scripts/ui-shot.mjs` 的两条删除行逐字相等（`stateBytesSame: fileHash(STATE_FILE_A) === stateHash52i,` 与 `...(fileHash(STATE_FILE_A) === stateHash52i ? [] : ["发送不得改写 reader-state.json"]),`） | 一致 |
| 登记 1 新值 | 4 行数据 + 断言行在 `:5118-5121` / `:5128` 逐字在场；`stateProjection` 定义于 `:1693-1703`（忽略讨论两键与 `updatedAt`，其余 `version` / `lastDocPath` / 条目集合 / `page` / `scale` 逐字比较）；`await waitState(STATE_FILE_A, …, "52-inject 落点写盘")` 位于断言基线 `stateBefore52i` 之前（字节 hash `stateHash52i` 为信息字段、仍在其前采样，不影响任何断言） | 一致 |
| 登记 1 理由 | 该相位发送成功必写记录（收口轮读数 `stateBytesChanged:true`、`stateSameExceptRecord:true`）⇒ 旧字节断言结构性恒假 | 成立 |
| 登记 2 文件 : label : 相位 | `pix/scripts/ui-shot.mjs` : `r18-session-missing` : `session-restored` | 一致 |
| 登记 2 新值 | 自确定前置（运行时读活动行 → 条件幂等钉住「摘录与笔记走查」 + `waitPillSession` → 重开菜单）+ **冻结字面恢复为决定性点击** `clickSessionItem("消融实验对照")`（`:12072`）；六个只读字段 `entryCountBefore` / `switchBase` / `switchCalls` / `pinClicked` / `activeBefore` / `activeAfter` 落盘 | 一致 |
| 登记 2 理由（事件序列） | `restoreStandardSeed`（`:3513-3517`）不复位 `SESSION_STATE`；`SESSION_STATE.sessionFile = mirror.path` 唯一镜像点 `:699`；`ChatPanel.vue:896` 活动行 early-return | 三条实读成立 |
| `r18-3` 自确定 | 钉住分支由运行时活动行驱动（已是目标 ⇒ 幂等 no-op；否则条件点击 + 等 pill 生效）⇒ 决定性点击必命中非活动行；判据 ⑨ 由场景自身夹具（`setSessions(SESSIONS_A)` + 现场记录）决定 | 不依赖前序遗留 |
| `r18-3` 判别力 | 判据 ⑥⑦⑧ 逐字保留；**新增 3 条非空断言**（⑨ 切换前入口计数 0；⑩ 真实 `switch_session` 计数增量且末项 = `SESSIONS_A[1].path`；⑪ 切换后活动行 `active===true`）；对交付轮 `pix-v06-r18-after` 逐字段比对：新增恰六字段、删除 0（`pairBefore` / `pairAfter` 仅环境路径与时间差异） | 只增不减 |

#### 2. 工程门、烟测与离屏（真实读数）

| 命令 | 读数 |
| --- | --- |
| `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` | `CHECK_EXIT=0`（0 error） |
| `cd pix && node scripts/smoke-notes.mjs` | 末行 `通过 71 / 失败 0`、退出码 0 |
| `cd pix && node scripts/smoke-view.mjs` | 末行 `通过 74 / 失败 0`、退出码 0 |

离屏取证（`PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v06-r18c-review`，两轮串行、不并发）：

| 轮次 | 读数 |
| --- | --- |
| 尝试 1 | 退出码 **1**；`failure` = `等待超时：摘录浮层（…quick-ask…）`（`selectPageSpan` ← `runReaderStateScenarios:7005`，r11-3 相位 4）；123 张 / 169 条 / `r18-*` 0 条（中断点在 r18 块之前）⇒ 既有 S-SD-02 家族环境性 flake（未改区间；与 R14 / R15 同点先例），按先例重跑 |
| 尝试 2（收口读数） | 退出码 **0**；末行 `结束：产出 186 张截图`；`MANIFEST.failure === null`；186 png + `MANIFEST.json` + `MEASUREMENTS.json`（白名单外 0） |

零缺失比对（基线 `pix-v06-r17c-review`，只读复读）：截图 `{base:174, after:186, missing:[], added:12, r18:12}`；测量 `{base:253, after:264, baseLabels:69, afterLabels:74, missingLabels:[]}`；新增 5 组 label 条数 `3/2/2/2/2`（= 11，与冻结配额逐字一致）。

`r18-*` 断言逐条复算（仓库外一次性只读脚本，逐条从 `MEASUREMENTS.json` 独立复算；运行后已按纪律删除）：**`ALL_PASS (59/59)`**。覆盖 11 条 record 的全部数据面判据；`session-restored` 的自确定证据与处置方登记读数逐值一致：`entryCountBefore=0`、`pinClicked=true`、`activeBefore="消融实验对照"`、`switchBase.count=4`（末项 `session-demo.jsonl`）、`switchCalls.count=5`（末项 `session-older.jsonl` = `SESSIONS_A[1].path`）、`activeAfter=true`。

走查读数：`git diff -U0 -- pix/scripts/ui-shot.mjs | grep -cE "^-[^-]"` = **6**（4 处 stub + 2 行登记断言）；`git diff --numstat` = `800/6`（`ui-shot.mjs`）、`213/0`（`smoke-notes.mjs`）；`git status` = 8 修改 + 4 未跟踪文档（白名单内）；绿轮 `map-scale` 耗时 82ms。

#### 3. 残余风险（登记）

1. **S-SD-02 未工程化修复**（`selectPageSpan` 裸 20s 等待，`ui-shot.mjs:1850`）：本步尝试 1 命中一次（同族同点）；命中代价 = 整轮取证中断（本次 123/186 张）。处置沿用「重跑一次并登记」；建议后续按 R15-audit 的处方（有界重取）彻底消除。
2. **环境负载敏感**：两轮均在本机 4 个 `PiX.exe` + `MsMpEng`、空闲内存 ~2.9GB 下运行；绿轮 `map-scale` 82ms（阈值 800ms）未触发历史耗时 flake，但该断言家族仍对负载敏感（`R18-dev` B.9 已登记）。
3. **`switchSessionCalls().count` 为保留条数（上限 8）**：判据 ⑩ 依赖 `count` 增量；未来新增场景若使点击前保留数饱和到 8，该断言会变红（不会静默通过）——属维护注意项，非本步缺陷。
4. **复算边界**：复算覆盖全部有数据字段的判据（59 条）；少量判据（如 `r18-1` 相位 2 的「`.reader-discuss` 恰 1 枚」、`r18-2` 相位 2 的 `scale` / `updatedAt > SEED_AT`）无独立数据字段，由脚本体已执行断言 + 退出码 0 覆盖。
5. 尝试 1 的失败现场（123 张 / 169 条）已被尝试 2 的自净覆盖，控制台原文保留于本轮 bash 日志；本档按先例登记其读数与失败文案。
