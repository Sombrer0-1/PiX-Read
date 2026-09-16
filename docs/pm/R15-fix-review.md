# R15 修复方案独立评审（挑刺） · F1–F20 逐条结论

> 评审对象：`docs/pm/R15-audit.md` 的 §3 修复清单（F1–F20）、§4 不修清单、§5 文件白名单、§6 验证方案、§7 风险与依赖。
> 证据：6 份分片审计档（`docs/pm/R15-audit-*.md`）+ 本仓 HEAD `e5dc001` 源码实读（引用行号均为本次实读所得）+ 本机实跑。
> 评审方式：只读（未改任何源码/脚本；未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未跑离屏 `ui-shot.mjs`；未执行任何 git 写命令）。
> 基线复跑（本次实测）：`cd pix && npm run check` ⇒ exit 0；`node scripts/smoke-notes.mjs` ⇒ 通过 51 / 失败 0；`node scripts/smoke-view.mjs` ⇒ 通过 35 / 失败 0；`git status --short` 仅 7 份未跟踪审计档。
> 评审结论：**revise**。缺陷真实性成立 19 条、部分成立 1 条（F20）；修法或判据需在实施前修正的条目：F2/F4/F11/F12/F13/F14/F15/F17/F19，以及 F1/F5/F6/F8/F9/F16/F18 的测试面归属；建议降级 1 条（F20），另有 2 条为条件降级。

---

## 0. 总体判断（先说结论）

1. **缺陷真实性总体可信**：本次逐条实读命中 F1–F19 的关键行号与语义（F20 的事实描述有一处重要偏差，见 F20）。分片报告的行号引用未发现编造。
2. **方案最大的系统性缺口不是"改什么"，而是"改完在哪里判"**：至少 7 条的判据需要动 `ui-shot.mjs`（F2/F5/F6/F9/F12/F16/F18），但 §5 白名单第 24 项只把 ui-shot 挂在 F2/F14/F16/F18 名下（F1/F5/F6/F9/F12/F19 缺失）；F3 的判据要动 smoke 编译面，而 §5 未把任何 smoke 脚本挂在 F3 下。照现状执行会出现"改完无处判 ⇒ 用人工走查顶替 ⇒ 判据落空"。
3. **两条修法会引入比原缺陷更大的新问题**（必须阻断）：F19 的 `library-list` 直改会让资料库树整体加载失败（根目录被自己判成 outside）；F2 的触底钳制在"内容不足一屏"时把当前页钉成末页。
4. **一条修法与既有离屏断言直接冲突且审计未发现**：F12 的 `missing` 摘出 degraded 会让 `ui-shot.mjs` 相位 20b 的 `waitWarnIncrement("missing 降级 warn")` 超时，按 `record` 首败即抛的契约直接判红整轮（详见 F12 与 MF-6）。
5. **F20 的修法在主要路径上是 no-op、判据不可通过、且与内核语义分叉**，建议降级为 D（详见 F20 与 §3）。

---

## 1. 逐条结论表（F1–F20）

### F1 · 回车发送缺少 IME 组合态守卫（P0）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`InputArea.vue:28-33` 的 `onKeydown` 无任何组合态判断；对照写法 `PdfSearchPanel.vue:308` 存在。次要位置三处均实读命中：`SettingsPage.vue:482`（`@keydown.enter="saveKey(provider)"`）、`:348`（`<v-form @submit.prevent="saveSettings">`）、`ChatPanel.vue:1136`（`@keydown.enter="saveRename"`）。复现：中文输入法组合态 Enter ⇒ `emit("send")`。 |
| 修法 | 成立，且是根因修复。更小等价写法：只判 `e.isComposing`（与同仓既有写法逐字一致）；`keyCode === 229` 是兼容补丁、属 deprecated，可保留但需注释。 |
| 需调整 | ① 判据已含成对断言（组合态计数 0 + 非组合态计数 +1），实施时不得只做前者；② 明确判据落点：入 ui-shot 的话 §5 白名单需补 ui-shot→F1（现在没有），否则按 §6.4 人工走查并写明步骤。 |
| 冻结面影响 | 不触既有断言。已核 `ui-shot.mjs:2435` 的 `sendViaEnter` 构造 `KeyboardEvent` 未传 `isComposing`（默认 false）⇒ 场景 43 steer 驱动不受影响（§6.3 冻结清单已收录该驱动及其 `isComposing 默认 false` 说明，无需新增，只需按此约束实现）。 |
| 判据 | 成立（stub 已有 send 计数与 `sendViaEnter` 驱动；成对断言可判别）。 |

### F2 · 末页永远不是「当前页」（P0）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`PdfViewer.vue:290-315`（marker 在 `:294`，写回 `:314`）；`.pdf-scroll`（`:1042-1047`，padding 48/16）+ 页 `margin-bottom:16px`（`:1049-1054`）。按本仓 ui-shot 夹具（`WINDOW 1600×1000`、页 595×842、scale=0.5）复算：最大滚动位下末页顶边 ≈395 > marker（120）⇒ 二分命中倒数第二页。 |
| 修法 | **需修正**：`scrollTop + clientHeight >= scrollHeight - 1` 在内容**不足一屏（不可滚动）**时恒真 ⇒ 任何"一屏装得下"的文档（4K 屏 + 1–2 页文档可达）当前页恒为末页，且 Home 跳回第 1 页后任何一次 zoom/scroll 事件都会再被钳回末页。必须加可滚动前置：`root.scrollHeight - root.clientHeight > 1 && ...`。写值用 `readerStore.pageCount`（实读存在，`reader-store.ts:27/114`）。 |
| 需调整 | ① 加可滚动前置；② 判据补 fitted 文档用例（clientHeight ≥ scrollHeight 时不得显示末页）；③ 判据文案"第 3 / 3 页"的冻结口径见下。 |
| 冻结面影响 | 新增 SEL 项与场景（`zoomInBtn` 已在 `ui-shot.mjs:83`；"缩小"按钮存在，`:7106` 已有字面用例）。**更正**：§6.3/F2 称既有 `第 3 / 3 页` 断言"全部在 100% 缩放"不成立——`ui-shot.mjs:1794/1925` 至少两处断言 `zoom === "110%"`（`:1795`、`:1922`）；110% 下末页顶边 ≈ −94 < 120，故修复后这些断言仍绿，"不受影响"的结论对、文字描述需改。 |
| 判据 | 部分成立：原判据可复跑（50% → End → 第 3 / 3 页；scrollTop=0 → 第 1 / 3 页），但对"不可滚动"这一新引入的边界是空的 ⇒ 需补。 |

### F3 · 设置文件非法 JSON ⇒ 应用启动不了（P0）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`settings-store.ts:24-31` 构造期 `new Store`（electron-store 未覆盖 `clearInvalidConfig`，conf 在构造期读盘并 throw）；`index.ts:173` 的 `whenReady().then(...)` 链无 `.catch`（实读 173–215 全链），`:182-184` catch 后重抛。 |
| 修法 | 成立（try/catch + 备份改名 + 默认值重建 + `getAll` 形状校验 + `whenReady` 补 catch）。更小等价：只传 `clearInvalidConfig: true` 可自愈但**不留备份**（丢 recentProjects 无法找回），不建议替代。 |
| 需调整 | 新增的 `pix-settings.json.corrupt-*` 命名与 F9/F12 的备份命名风格需统一（建议同一规则，便于文档与用户认知）。 |
| 冻结面影响 | 不触既有断言（两个烟测编译面不含 settings-store/index，已核 `smoke-notes.mjs:1073-1075`）。 |
| 判据 | **不成立/不完整**：`settings-store.ts` → `pix-paths.ts:16-18` 在模块顶层调用 `app.getPath("appData")`，纯 node 下 `require("electron")` 返回字符串 ⇒ `app` 为 undefined，直接 import 即崩。要跑真实类必须像 smoke-view 的 `WINDOW_SHIM` 那样先造 `electron` shim（且编译面 required/allowed 要加 `main/settings-store.js`、`main/pix-paths.js`）；否则只能退回"用 conf 代理"的探针（S-MS-01 的证据法），覆盖不到真实类。两条路必须二选一写清，§5 白名单相应补 smoke 脚本。 |

### F4 · 库根为目录联接/符号链接时整库被判越界（P0）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`library-root.ts:38-51`：`realpathSync(candidate)` 与**未解析**的 `root` 比较，联接根下任何存在文件都 false；`catch` 分支对不存在路径放行（自相矛盾的判定确实存在）。`pdf-tools.ts:18-47` 有同构的第三份实现（`isAllowedPdfPath:43` 另有 cwd 放行）。 |
| 修法 | **需补全谓词**。案文"候选 real 路径（失败回退字面）落在解析根之下"会丢掉一条既有语义：联接根下**不存在**的文件（realpath 抛错 ⇒ 回退字面候选）对"解析根"比较必然 false，与 S-MS-02 判据④「不存在的库内路径仍 true」矛盾。正确写法是双根判据：`字面候选 in 字面根 || (realpath 成功 && real 候选 in 解析根)`，realpath 失败时只保留字面判定（即现状语义）。**不得改 `isPathInsideDirectory` 本身**：`ipc-handlers.ts:677` 用它做会话文件保护。 |
| 需调整 | ① 写全谓词（如上）；② `pdf-tools.ts` 的 `isInsideRoot(cwd)` 保留/删除必须给出判定并注释（这是会话目录放行，删掉会让工具拒绝会话目录文件）；③ 修复不得给 `library-root.ts` 增加新 import（否则 smoke-notes 的 required/allowed 需同步）。 |
| 冻结面影响 | `library-root.ts` 在 smoke-notes 编译面内（`smoke-notes.mjs:1073-1075,1085-1099`）；既有 51 条断言用普通目录，理论全绿。 |
| 判据 | 成立（四条探针 + 两烟测）；建议判据③补"联接根的兄弟目录与 `../` 逃逸"，避免只测真实根兄弟。 |

### F5 · MCP 工具被白名单过滤而设置页仍展示（P0）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`session-bridge.ts:1259-1271` 的 `tools` 10 项白名单 + `excludeTools`；内核 `core/sdk.ts:286`（`allowedToolNames = options.tools ?? ...`）与 `agent-session.ts:2838-2850` 的硬过滤；MCP 侧 `mcp-adapter/src/index.ts:986` 用 `pi.registerTool` 注册；UI `McpSettings.vue:157`（`{{ server.transport }} · {{ server.toolCount }} 个工具`）与 `:176-186`（逐条工具 chip）。 |
| 修法 | 默认路径（注释 + 文案）可接受（行为变更须负责人裁决，方案已标注）。但 **3 处不自洽**：① stub 的 `mcpGetServers` 返回 `[]`（`ui-shot.mjs:1142`）⇒ 行内文案不会被渲染，文案必须放**面板级**才可断言；② "新增 1 条离屏记录"实为**新建 ui-shot 首个设置页场景**（实测 ui-shot 全脚本无设置页导航、无 `router`/`location.hash` 驱动），工作量"小"不成立；③ 判据要求 `packages/coding-agent/test/...` 骨架，违反"全部在 `pix/` 内"的白名单，且"断言 getAllTools 不含 mcp__demo"是把**尚未裁决**的边界写成回归期望。 |
| 需调整 | ① ui-shot.mjs 列入 F5 白名单并如实评估新建场景成本；② 文案位置写明（面板级）；③ 上游复现脚本改为 `%TEMP%` 一次性探针（不落库、不进 packages）；④ 按 PRD §5.5/§5.7 登记新增文案（含旧值/新值）。 |
| 冻结面影响 | 新增 UI 文案 ⇒ PRD §5.7「新增/变更的 UI 必须有对应场景与截图」；`ui-shot.mjs` 对 MCP 面板无既有断言（实测无 mcp 场景，只有 stub 常量 `:1142-1143`）⇒ 不重写既有断言。 |
| 判据 | 部分不成立（见上），需重写为"面板级文案 + 离屏记录或人工走查（并注明设置页为 ui-shot 空白区）"。 |

### F6 · 发送失败丢弃用户正文（P1）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`ChatPanel.vue:369`（`draft.value = ""`）、`:370-372`（附件与粘贴图同时清空）、catch `:386-394` 只回滚气泡与 auth guide。 |
| 修法 | 成立。遗留边界需写明：**文本+附件/纯附件发送失败时附件不回填**（当前方案只回填 `text`），用户仍会丢附件与截图；要么同法回填（path/base64 都在内存里），要么在方案里显式接受。不加 ErrorBlock 重试可接受。 |
| 需调整 | 判据"扩展离屏场景"要求 ui-shot 列入 F6（§5 未列）；或降级为人工/探针并写明。 |
| 冻结面影响 | 不触既有断言：45/45B/45C 每轮先 `setDraft` 覆写（`ui-shot.mjs:4026-4055`），`userBlocksRolledBack`（`:4032`）与 `stub 发送注入异常`（`:4034`）语义不变。 |
| 判据 | 成立（stub `setSendFailure("throw")` 现成）。 |

### F7 · 迟到 save 响应回灌已复位 store（P1）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`renderer/stores/reader-state-store.ts:108-121`（成功后无条件 `applyState`）、`:229-240`（`resetState` 只递增 `loadSeq`）。触发时序与 `WorkspacePage.vue` 的 `onUnmounted`（flush → resetState 同段）一致。 |
| 修法 | 成立，最小且安全（令牌与 `loadSeq` 同形，只丢跨 reset 响应）。 |
| 需调整 | 无。建议把审计期的探针脚本固化为可复跑文件（%TEMP% 或 smoke 组），否则"探针 1-d 转绿"依赖审计期的临时物。 |
| 冻结面影响 | 无（store 内部，无导出/契约/文案变化）。 |
| 判据 | 成立，且反向断言（不 reset 时仍写回）必须保留，防"过度丢弃换通过"。 |

### F8 · 澄清请求替换时 `currentQuestionIndex` 未复位（P1）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`ChatPanel.vue:206-212`（`currentQuestion` 早退）；`:143-152` 只有 `currentSessionPath` 与 `displayBlocks.length` 两个 watcher，无 `pendingUserInput` watcher；`:690-718` 只在提交/取消复位。 |
| 修法 | 成立。watcher 用浅层 getter（勿 `deep`，否则 `answerMap` 变更会反复复位）。 |
| 需调整 | 判据落点指定（ui-shot 或探针）；ui-shot 若入判据需补白名单（§5 未列 F8）。 |
| 冻结面影响 | 无。既有澄清场景每次只发一个请求（`ui-shot.mjs:3547-3559` 实读）。 |
| 判据 | 成立。`ClarificationCard.vue:36` 的进度文案为 `{{ questionIndex + 1 }} / {{ totalQuestions }}`，与判据 `1 / 1` 逐字一致；stub `emitUserInputRequest`（`ui-shot.mjs:1176`）可用。 |

### F9 · notes 逃生口顺序与 backupPath 失联（P1，数据安全）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`main/notes-store.ts:528-552`（`renameSync` 在 `:540`，写失败在 `:547` 回传 `backupPath`）；`grep backupPath pick/src` 仅 5 处、渲染层零消费；`renderer/stores/notes-store.ts:382-398` 只映射 `error`；`NotesPanel.vue:393-403` 两条文案均不带路径（同文件 `revealPath` 在 `:405-413` 现成）。 |
| 修法 | 成立（先 `copyFileSync` 备份、再原子写；渲染层透出 `backupPath` + reveal）。copy 语义下"写失败保留原文件+备份两份"可接受（更像逃生口）。 |
| 需调整 | ① 渲染层 `NotesActionResult` 形状需加 `backupPath`（`renderer/stores/notes-store.ts` 返回对象）并在 `NotesPanel.onRecover` 两分支使用——属源码契约改动，§5 第 18/15 项已含这两个文件；② 判据中"离屏 1 条记录"要求 ui-shot 列入 F9（§5 未列，ui-shot stub 的 `notesReset` 已回 `backupPath`，文案断言需新建）；③ 新增 smoke 断言用 `<notes.json>.tmp` 预置为目录的注入可行（`writeFileAtomic:193-205` 走 tmp 文件）。 |
| 冻结面影响 | smoke-notes 既有 reset 断言（`:468-482`，`backups.length === 1` + 名字正则 + 重建为空库）在 copy 实现下仍满足（逐条核对）；`undoSlot` 清槽语义不变；ui-shot 无 reset 文案断言（实测 `已备份原文件`/`重建失败` 零命中）。 |
| 判据 | 成立（smoke 侧新断言可复跑；`existsSync(NOTES_A) === true` 对 copy 实现有判别力）。 |

### F10 · `loadNotes` catch 缺 `writeSeq` 守卫（P1）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`renderer/stores/notes-store.ts:227-258`：成功分支 `:234` 双守卫，catch `:252-257` 只判 `seq !== loadSeq`。 |
| 修法 | 成立。安全性已核：只有 `applyNotes`（`:184`）与 `recoverCorruptNotes`（`:387`）递增 `writeSeq`，二者都会把 `status` 推到 `ready`（`applyNotes:186-190`）⇒ stale catch 直接 return 不会把面板留在 loading。 |
| 需调整 | 无。 |
| 冻结面影响 | 无（error 态场景由 `result.success === false` 驱动，不经 catch）。 |
| 判据 | 成立（探针 2-a/2-c/2-d，2-a/2-d 必须保留）。 |

### F11 · 会话生命周期无互斥（P1）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`session-bridge.ts:202-219`（`start` 无门）、`:279-296`/`:298-311`（new/switch 无门）、`:1277-1283`（`_activateSession` 覆盖 `_unsubscribe`）、`:1291-1310`（只解当前句柄与当前 adapter）；`HomePage.vue:43-61`（`openWorkspace` 无在途守卫，`:70-72` 直接驱动）。 |
| 修法 | 方向成立，**三处需修**：① `ipc-handlers.ts:361-366` 的失败分支 `clearLibraryRoot()`（`:365`）在"第二个 start 失败"时会把**仍在运行**会话的库根清掉——串行门之后必须让库根与"当前活动会话"绑定，或仅在无会话时清；② "同 dir 幂等"要定义路径归一化（大小写/尾分隔符）与 `guiSettings` 传递（`start` 第二参现在会覆盖 `_guiSettings`，幂等返回会丢掉这次设置更新，需确认调用方无依赖）；③ 建议把 `dispose` 也纳入门（或明确退出期不再入队）。 |
| 需调整 | 判据必须重写（见下）。 |
| 冻结面影响 | 触 `agent-ready`/`exit` 事件次数与渲染层 `agentStatus`（§7 已列，属实）；并发路径无既有断言（属实）；`ui-shot.mjs` 的 stub `startSession` 只记录不拒绝（`:818`）。 |
| 判据 | **不成立**：`Promise.all([start(A), start(B)])` 在正确串行化下的期望不是"ready 只 1 次"——A、B 是两个不同项目，串行结果是 ready×2、A 被 dispose 恰 1 次、最终活动会话与 `_cwd` = B、无孤儿。且 bridge 级探针里 `getLibraryRoot()` 恒为 `""`（库根由 IPC 层 `:362` 设置），"sessionFile 与 getLibraryRoot() 同项目"在桥层不可判。需拆两个用例：同 dir 双击（1 会话、1 ready、0 dispose、final=dir）；A→B 串行（无孤儿、A disposed 恰 1、final=B）。 |

### F12 · reader-state 降级契约（P1，数据安全；含 S-RU-06）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`main/reader-state-store.ts:205-216`（missing/corrupt/version 同列 degraded 并 warn）、`:225-250`（读到 corrupt/version 用空模型整体覆盖，无备份）；`renderer/stores/reader-state-store.ts:152-175`（`success/code/error` 零消费）。 |
| 修法 | 方向成立但**必须与 ui-shot 同步**（见下），且备份应统一为 copy-first（与 F9 一致），否则 F12 用 rename-first 会重演 F9 修掉的"写失败原文件已不在"。version-unsupported 拒写是零现状影响的未来保护（当前 SCHEMA_VERSION=1，无 v2 文件），可保留。 |
| 需调整 | ① **`missing` 摘出 degraded ⇒ 直接冲突**：`ui-shot.mjs:1802-1805` 相位 20b 用 `waitWarnIncrement(warnBase20b, "missing 降级 warn")` 等 warn，`waitWarnIncrement` 超时即 `throw`（`:1645-1652`），而 `record` 首败即抛 ⇒ 零缺失复跑必红。必须同步：该相位改为"有界静默（sleep）+ 断言 warn 增量 === 0"；② ui-shot stub `readerStateLoad`（`:1105-1113`）对 missing 也返回 `degraded:true`，不同步则**假绿**（离屏继续按旧语义通过、真机已改）；③ 相位 23 的 `[reader-state] warn 增量 === 1`（`:2175-2177`）在 corrupt 路径保持（备份发生在 save 侧，不增 load warn），需写入影响说明；④ `.pix-read` 会出现 `reader-state.json.corrupt-*`：13d 的 `.pix-read` 增删断言取相位内基线（`:7695/7750-7776`）理论不红，但 `writeFixtures`（`:382-407`）只删 reports 与 reader-state.json（`:386/:394-395`），备份跨轮累积，建议纳入 fixture 重置或声明接受。 |
| 冻结面影响 | 编译面新增 `main/reader-state-store.js`（实测它只 import `library-root` + `shared/types` ⇒ 产物可控，required/allowed 可预期）；**`ui-shot.mjs` 必须列入 F12 白名单**（§5 第 24 项现未挂 F12）；§6.3 冻结清单需收录 20b/23 两条 warn 断言与 13d 的 `.pix-read` 断言。 |
| 判据 | 部分成立。smoke 新增组（真实主进程模块）可行且判据明确；渲染侧 `!success` 的 warn 判据（no-root）需要桩探针（离屏无 no-root 路径）；ui-shot 侧按上面三点重写后成立。 |

### F13 · takeHerEyes 失败路径静默（P1）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`session-bridge.ts:1003-1016`（4 条静默早退）、`:1036-1039`（auth 失败静默）；`emitEnd` 以 `emittedStart` 为前提（`:1020-1032`）。渲染层 `session-store.ts:354-380` 确有无 start 的 end 兜底（补发不需要改渲染层，属实）。 |
| 修法 | **需收窄**：`_tryTakeHerEyes` 在**每次 prompt** 都被调用（`:979`），若对 `images.length === 0`（`:1003`）或"功能未启用"（`:1013`）也发 end，普通文本提问会新增失败块噪声。正确范围：仅当 `images.length > 0 && config?.enabled === true` 时，对"已启用但不可用"的分支（缺 provider/modelId、`eyeModel` 不存在、`hasConfiguredAuth` false、`auth.ok` false）发 `eye_model_end{success:false}`；`provider/modelId` 取配置或 `"unknown"`，`imageCount = images.length`。另：**`errorMessage` 目前不会被显示**（`ChatPanel.vue:783-787` 的 `visionStatusLabel` 只输出"视觉模型读取失败"），要可行动提示就得加文案（属新增 UI 文案，PRD §5.7 需登记）。 |
| 需调整 | ① 明确发射条件集合与字段值；② 决定是否呈现 errorMessage；③ 判据改为可执行路径。 |
| 冻结面影响 | 只新增事件，不改成功路径；离屏如需覆盖要给 stub 加一次注入（新增记录，不动冻结断言）。 |
| 判据 | **不可复跑**：桥层断言需要真 `AgentSession`/模型环境，现无 harness；ui-shot 桩注入只能验证渲染层兜底（不能验证 F13 本身）。建议明确为真机人工走查（设置里填不存在的视觉模型 → 发截图 → 出现失败块）+ 代码走查，并在 §6.4 登记。 |

### F14 · `installUpdate` 吞掉拒绝结果（P1）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`preload.ts:108`（`installUpdate: () => void;`）与 `:193`；`SettingsPage.vue:309-313`（`if (result.success) { window.pixApi.installUpdate(); }` 不 await 不看返回值）；`ipc-handlers` 的 `install-update` 有拒绝分支（会话运行中弹系统通知 + `{success:false,error}`）。 |
| 修法 | 成立（签名 + await + 中文提示）。 |
| 需调整 | **§7.2 第 1 条的"硬依赖必红"不成立**：实测 ui-shot 无任何场景点击"安装更新/下载更新"（全脚本无 `installUpdate` 调用、无"更新"相关驱动），也**从不进入设置页**（无 settings 导航），故不改 stub 也不会红。但 PRD §5.9 要求 stub 与 preload 面一致 ⇒ stub（`:1147`）改为返回 `{success:true}` 仍应做（属契约卫生，不是硬依赖）。判据保持人工（真机），或明确预算"新建设置页场景"的成本。 |
| 冻结面影响 | `PixApi` 签名变更（名称/顺序不变）；`renderer/types/ipc.ts` 自动继承（审计已说明）。 |
| 判据 | 人工判据可执行；离屏判据（若加）需新场景。 |

### F15 · useRpc 双失败通道（P1）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`useRpc.ts:187-195`（`sendCommand` 静默，只写 `lastError`）vs `:198-206`（`sendCommandOrThrow` 抛）；静默组：`setApiKey/removeAuth`（`:356-368`）、`setSessionName`（`:323-326`）、`setScopedModels`（`:340-342`）、`setSteeringMode/setFollowUpMode/reloadResources`（`:427-451`）；`SettingsPage.saveKey/deleteKey`（`:82-106`）的 catch 因此不可达。 |
| 修法 | 成立，但**必须点名两个无 catch 的调用点**：`ChatPanel.saveRename`（`:671-681`，try/finally **无 catch**，改为抛出版即产生未处理拒绝）；模板裸调用 `@click="rpc.abort()"`（`:1116`）。其余四个静默组成员实测零消费（`grep` 全仓 0 命中），可改可不改，改了要注明"当前零调用点"。 |
| 需调整 | 判据"设置页密钥保存失败出现中文提示"需要设置页场景/人工走查，二选一写明。 |
| 冻结面影响 | 无既有断言（实测 ui-shot 无设置页场景、无这些命令断言）。风险是实现面的未处理拒绝（见上）。 |
| 判据 | 成立（探针 3-a + 正常路径不抛）。 |

### F16 · onMounted await 后注册订阅（P1）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`WorkspacePage.vue:74-125`（四个 await 之后才 `onAgentEvent`，`:108-124`）、`onUnmounted`（`:127-141`）只做 `unsubscribeEvent?.()`。 |
| 修法 | 成立（`disposed` 旗标，保持注册顺序，不动 `agent_start` 早到时序）。 |
| 需调整 | 判据里"注册/解绑调用数相等"需要新增 stub 计数器（当前 `ui-shot.mjs:850-858` 只维护处理器数组，无计数/查询口）；慢 IPC 用既有 `setLoadDelay`（`:883` 作用于 notesLoad）即可，无需新桩能力。 |
| 冻结面影响 | 不触既有断言；ui-shot 已在 F16 白名单内。 |
| 判据 | 成立（需 1 个新桩接口 + 1 条新场景记录）。 |

### F17 · 大输入无上限 + pdf 整读/双拷贝（P1）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`pdf-tools.ts:96-107`（`readFileSync` + 第二份 `Uint8Array`）；`chat-files.ts:54`（图片整读）/`:90`（文本整读后拼接，唯一体积判断是 `size === 0`）；对照 `ipc-handlers.ts:61` 的 256MB 上限与可读文案（`:494-500`）。 |
| 修法 | 方向成立，**建议拆分并收窄**：① pdf 体积上限放 `resolveGuardedPdfPath`（`statSync` 已在用，零新依赖）、`readFile` 异步、去第二份拷贝——可行；pdf.js 若对 `data` 做 transfer/detach 需顺带确认（本仓 worker 走 in-process fake worker，风险低，加注释即可）；② 附件上限需一次口径确认（文本截断 vs 拒绝；`size===0` 分支与 `resizeImage` 失败文案先例可复用）；③ NUL 嗅探会误伤 UTF-16 文本附件，需限定或注明；④ 新共享模块 `pix/src/shared/limits.ts` 的消费模块（pdf-tools/chat-files/ipc-handlers）都不在 smoke 编译面内（实测），但要写明"不得被 notes-store/library-root/reader-state-store 反向依赖"，否则 smoke 的 required/allowed 会红。 |
| 需调整 | 判据的**运行方式未定义**：pdf-tools/chat-files 都带 `@earendil-works/*` 与 pdfjs 依赖，不能直接 require；300MB/50MB 夹具必须有明确 harness（%TEMP% tsc 编译 + 直接调用导出函数，或真机走查）。 |
| 冻结面影响 | pdf 工具错误文案无既有断言（实测 scripts 无 `Path is outside`/`too large` 断言）⇒ 文案选择自由，但属新增用户可见文案，建议登记。 |
| 判据 | 部分不成立（见上：无 harness；`readFileSync` 调用点消失属走查级判据，可接受）。 |

### F18 · 框选截图失败静默 + 无条件退出模式（P1）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`PdfViewer.vue:531-544`（`:541` 调 `captureRegion`，`:543` 无条件 `exitCaptureMode()`）；`captureRegion` 的 7 处裸 return（`:559/588/590/592/602/617/620`）。 |
| 修法 | 成立。实现要点：返回 boolean + 依返回值决定退出（误触阈值分支保持退出，R4 明示"宽高 < 6px 视为误触 → 忽略并退出"，`DEV-R4-capture.md:43-47`）。提示建议新增独立节点/类名，不改 `.capture-hint` 文本（该文案未被断言，但独立节点更稳）。 |
| 需调整 | **交互语义变更按 PRD §5.7 必须在本轮需求档登记，而 R15 无需求档**（docs/pm 下只有 R15-audit*）。方案把这笔账记为"由 R15-req 另行承接"，但该产物不存在 ⇒ F18 在登记之前不可开工。需先产出登记（写明改哪一条、旧语义"松手后退出模式"如何更新、涉及哪些断言/截图）。 |
| 冻结面影响 | `SEL.captureLayer/captureFabBtn`（`ui-shot.mjs:87-88`）不变；既有 r11 相位只做 Esc、不拖拽（`:6391-6445`），不冲突；新增提示节点属新增 UI ⇒ 需场景与截图。 |
| 判据 | 成立（canvas 置 0 注入 + 反向正常拖拽 + "截图 1"chip）；ui-shot 已在白名单。 |

### F19 · `library-list` / `library-open-path` 缺根校验（P1）

| 项 | 结论 |
| --- | --- |
| 真实性 | 成立。`ipc-handlers.ts:423-437`（list 只 `resolve` + 目录存在性）、`:438-446`（open 直接 `shell.openPath`）；对照 `:188-200` 的 `guardLibraryPath`。 |
| 修法 | **有一处正确性缺陷（阻断）**：`guardLibraryPath` 经 `isLibraryFilePath` → `isPathInsideDirectory`，后者对 `relative === ""`（即目录自身）返回 false ⇒ **库根自身会被判 outside**；而 `LibraryPanel.vue:86` 正是 `libraryList(props.rootDir, 3)`，按方案直改会让资料库树整体加载失败（比原缺陷更严重）。必须用"根 == resolved 或根内"的判定（或新的允许等值的 guard）。`library-open-path` 收紧为根内安全（两个调用方 `PdfViewer.vue:727`、`ReaderPanel.vue:145` 都传库内文档路径）。`show-in-folder` 保持现状 + 注释可接受。 |
| 需调整 | ① 根目录放行；② 判据重写（见下）；③ 顺带修 `:430` 的"目录不存在"文案可做（区分 not-found/not-a-directory）。 |
| 冻结面影响 | 不触既有断言；stub（`:869/870`）是独立实现，收紧 main 不改变 ui-shot 行为；设置页不调用 open-path（只用 showInFolder），无回归。 |
| 判据 | **不成立**：`ipc-handlers.ts` 带 electron 依赖，不能像纯模块那样被探针/烟测直接加载；在 ui-shot 里测 stub 的 guard 只能验证 stub 自己（循环论证，且 stub 根本不调真实校验）。需改为：把"路径判定"抽成可编译的纯函数并入 smoke 面，或明确声明"走查 + 真机验证，当前无自动化回归网"，并把 `libraryList("C:/")` 负向用例写成真机步骤。 |

### F20 · `enabledModels` 0 命中静默放宽（P1）

| 项 | 结论 |
| --- | --- |
| 真实性 | **部分成立，且有一处重要偏差**。"PiX 0 命中 ⇒ 回退到全部模型"为真（`session-bridge.ts:1145-1152` → `setScopedModels([])` → `getAvailableModels:695-704` 的"空 scope = 不限制"）；但**内核 CLI 路径同样如此**：`model-resolver.ts:277-313` 对 0 命中只 `console.warn` 后 `continue`，全部 0 命中时同样返回空 scope = 不限制。PiX 的真正分叉是：① 匹配规则（无 `[]`、无部分匹配/别名）② 没有 warn。 |
| 修法 | **不成立（当前案文）**：`_applyEnabledModelScope` 在**会话创建**时调用（`:1273`），全新会话的 `_scopedModels` 默认 `[]`（`core/sdk.ts:415` → `agent-session.ts:415` `?? []`）⇒ "不清空"与"清空"结果完全相同；"保留上一次 scopedModels"只在 `setApiKey/removeAuth/setPiSettings` 的**已运行会话**重算路径（`:524/534/571`）有效，而这会与内核路径分叉（内核重算后会允许全部）。判据"模型列表不变成全部"在创建路径**不可能通过**。 |
| 需调整 | 建议降级为 D（见 §3），替代为"一行 `console.warn`（措辞对齐内核）+ 文档登记匹配规则分叉"；若负责人坚持保留 F20，必须把判据改为"创建路径：有 warn 且列表 = 全部（记录为已知回退）"，并单独论证 live 重算路径"保留上一次"的取舍。 |
| 冻结面影响 | 无既有断言覆盖（属实，且**审计 S1-07 的"settings 面在 ui-shot 有场景"与实测不符**：ui-shot 无设置页、无模型选择器断言——这降低了风险，但汇总档要改）。 |
| 判据 | 不成立（见上）。 |

---

## 2. must-fix 清单（对方案的修正要求，按阻断级别排序）

### A. 会引入新缺陷 / 回归，实施前必须改（阻断）

1. **MF-1（F19）** `library-list` 的判定必须允许**库根自身**：`LibraryPanel.vue:86` 传 `rootDir`，而 `guardLibraryPath → isLibraryFilePath → isPathInsideDirectory` 对 `relative === ""` 返回 false。定为 `resolved === root || 根内` 的判定（`library-open-path` 可保持严格根内）。
2. **MF-2（F2）** 触底钳制加"可滚动"前置：`root.scrollHeight - root.clientHeight > 1 && root.scrollTop + root.clientHeight >= root.scrollHeight - 1`；写值明确为 `readerStore.pageCount`。否则内容不足一屏的文档当前页恒为末页（Home 后一有 zoom/scroll 事件又被钳回）。
3. **MF-3（F12）** 与 `ui-shot.mjs` 相位 20b 的冲突必须同批解决：① `:1802-1805` 的「missing 降级 warn」改为有界静默 + 断言 warn 增量 === 0；② 同步 stub `readerStateLoad`（`:1105-1113`）的 missing 语义（否则假绿）；③ 相位 23 的 `warn 增量 === 1`（`:2175-2177`）明确保持；④ `ui-shot.mjs` 列入 F12 白名单；⑤ 明确 `.pix-read/*.corrupt-*` 跨轮累积与 fixture 重置（`:382-407`）的关系。
4. **MF-4（F13）** 发射范围收窄：仅 `images.length > 0 && config?.enabled === true` 且"已启用但不可用"的分支发 `eye_model_end{success:false}`（`_tryTakeHerEyes` 每次 prompt 都会被调用，`:979`）；同时决定 `errorMessage` 是否要在 UI 呈现（当前 `visionStatusLabel` 不显示）。
5. **MF-5（F15）** 调用点清单必须显式包含：`ChatPanel.saveRename`（`:671-681`，try/finally 无 catch）与模板 `@click="rpc.abort()"`（`:1116`）；否则"静默失败"会变成"未处理拒绝"。
6. **MF-6（F11）** 处理 `ipc-handlers.ts:361-366`：串行门之后，失败的第二次 `session-start` 不得 `clearLibraryRoot()` 掉仍在运行会话的库根；并定义幂等比较的路径归一化与 `guiSettings` 传递语义。
7. **MF-7（F4）** 谓词写全为双根判据（字面根 + 解析根；realpath 失败回退字面），保「不存在的库内路径仍 true」（联接根下亦然）；**不得改动 `isPathInsideDirectory`**（`ipc-handlers.ts:677` 会话保护在用）。
8. **MF-8（F20）** 降级为 D（理由见 §3）；若保留，则修法与判据按上表重写。

### B. 冻结面 / 测试面同步（不改则"零缺失复跑"必红或判据落空）

9. **MF-9（F12/F14/F1/F5/F6/F8/F9）** 补齐 §5 白名单第 24 项的归属：`ui-shot.mjs` 目前只挂 F2/F14/F16/F18；需要新增场景/记录的 F6、F9 与需要改相位的 F12 必须列入；F1/F8 需指定"ui-shot 或探针或人工"；F5/F14 若走离屏要如实标注"新建首个设置页场景"的成本（ui-shot 现无设置页导航）。
10. **MF-10（F3）** 判据落地方式二选一并写明：① 加 `electron` shim（照 smoke-view `WINDOW_SHIM` 先例）+ 编译面 required/allowed 增加 `main/settings-store.js`、`main/pix-paths.js`；或 ② 声明为"conf 代理探针"，承认真实类无覆盖。
11. **MF-11（F14）** 更正 §7.2 第 1 条：ui-shot 无场景点击安装/下载，基线不会因此变红；stub 同步（`:1147` 返回 `{success:true}`）按 PRD §5.9 做，但不构成"硬依赖"。
12. **MF-12（F5）** ① ui-shot 列入 F5 白名单并如实评估"新建设置页场景"；② 文案放面板级（stub `mcpGetServers` 返回 `[]`）；③ 上游复现脚本移出 `packages/`（改 `%TEMP%` 一次性探针），删除"断言不提供 MCP 工具"这种把未裁决边界写成回归期望的判据；④ 按 PRD §5.7 登记新增文案。
13. **MF-13（F9）** 渲染层结果类型补 `backupPath`（`renderer/stores/notes-store.ts:382-398` 返回值）与 `NotesPanel.onRecover`（`:393-403`）两分支文案；如需离屏记录，`ui-shot.mjs` 列入 F9。
14. **MF-14（F12/F9）** 备份策略统一：F12 不要用 rename-first（会重演 F9 修掉的"写失败原文件已不在"），与 F9 统一为 copy-first，或明确论证 rename-first 对派生数据的可接受性并写进方案。

### C. 判据可执行性（现判据不可复跑 / 空断言风险）

15. **MF-15（F19）** 重写判据：主进程改动不能由 ui-shot 桩验证（桩只测桩）；改为"判定逻辑抽纯函数入 smoke 编译面"或"走查 + 真机验证（写明步骤）并登记无自动化回归网"。
16. **MF-16（F11）** 重写并发判据为两个用例并给出期望事件序列：同 dir 双击（1 会话 / 1 ready / 0 dispose）；A→B 串行（无孤儿 / A dispose 恰 1 / ready×2 / final=B 与库根一致）。
17. **MF-17（F13/F17）** 补可执行的验证路径：F13 改真机走查（或声明无 harness）；F17 明确 300MB/50MB 夹具的运行方式（%TEMP% 编译探针或真机），并写明 `shared/limits.ts` 不得被 smoke 编译面模块反向依赖。
18. **MF-18（F18 + 全部新增文案）** 先产出需求登记产物（R15 现无需求档）：至少覆盖 F18 的交互语义变更（R4 "松手后退出模式"）、F1 次要位置、F5/F9/F14/F17 的新增或变更文案（写清旧值/新值/涉及断言），PRD §5.7 是硬要求。
19. **MF-19（F1/F8/F7/F10）** 判据落点与探针固化：F7/F10 的探针（1-d、2-c）需固化为可复跑文件；F1/F8 指定 ui-shot 或人工；成对断言（正向/反向）必须保留。

### D. 事实更正（汇总档回改，避免误判优先级）

20. **MF-20** §6.3/F2 的"既有 `第 3 / 3 页` 断言全部在 100% 缩放"应为"含 110% 缩放下"（`ui-shot.mjs:1794/1925`）；S1-07 的"settings 面在 ui-shot 有场景"与 F15 的"这些命令在 ui-shot 中由真实主进程驱动"均应删除/更正（ui-shot 无设置页、无这些命令断言，且用的是 stub 不是真实主进程）。
21. **MF-21** F11 的"dispose 只 1 次、ready 只 1 次"与 F2 的"`scrollTop=0` 回到第 1 页"这类表述要为 fitted/并发两种情形留出定义，避免被实现者按字面实现成错误语义（见 MF-2/MF-16）。

---

## 3. 建议降级（对方案的回退建议）

| 条目 | 处置 | 理由（必须成立） |
| --- | --- | --- |
| **F20** | **降级为 D（确定）** | ① 修法在主要路径（会话创建，`:1273`）是 no-op：新会话 scope 默认 `[]`（`sdk.ts:415`/`agent-session.ts:415`），"不清空"与清空等价；② 判据"列表不变成全部"在创建路径不可能通过；③ "保留上一次"只在 live 重算路径有效，且与内核分叉（内核 0 命中同样回退，只是有 warn，`model-resolver.ts:277-313`）；④ 真实收益退化为"补一条 console.warn + 文档登记"，成本/收益不匹配。替代：一行 warn（措辞对齐内核）+ 在需求/文档登记匹配规则分叉；完全对齐内核属跨仓改动，本轮不做（原方案自己也这么写）。 |
| F18 | 条件降级 | 若在开工前拿不到需求登记产物（R15 无需求档），则该条**不具备开工条件**，应按 D 处理（登记语义变更 + 现状"失败静默"作为已知代价），直到登记落地。 |
| F17（附件上限子项） | 条件降级 | "文本截断 vs 图片拒绝"属产品口径，未确认前只做 pdf 侧（体积上限 + 异步读）即可闭环；附件子项若无口径裁决，建议拆出并降级为 D 登记（保留 pdf 侧入册）。 |

**降级条数汇总**：确定 1 条（F20）；条件 2 条（F18、F17 的附件子项）。

---

## 4. 其余核对结论（不构成 must-fix，供实施参考）

- **F2 数学**：1600×1000 窗口 + 595×842 夹具 + 50% 缩放下末页顶边 ≈395 > marker 120 ⇒ 缺陷与判据"修复前必红"的推理成立（本评审独立复算）。
- **F9 copy 实现的兼容性**：`smoke-notes.mjs:468-482` 的 `backups.length === 1`、名字正则、重建为空库三项在 copy 下均满足；`:894-899` 的 corrupt 语义与 `:1031` 的 stat 语义都不受顺序改动影响。
- **F10 的新守卫安全性**：`writeSeq` 仅 `applyNotes:184`、`recoverCorruptNotes:387` 递增，二者均把 `status` 置 ready ⇒ stale catch 返回不会留 loading。
- **F16 现成能力**：`setLoadDelay` 已作用于 `notesLoad`（`ui-shot.mjs:883`），造卸载窗口不需要新桩能力；只需新增注册计数口。
- **F14 stub 现状**：`:1147 installUpdate: function () {}`（返回 undefined），与 §7.2 描述一致；但无场景调用（见 MF-11）。
- **F5 内核行为**：`allowedToolNames` 由 `options.tools` 决定（`core/sdk.ts:286`），扩展工具注册后仍被过滤（`agent-session.ts:2840-2850`）——缺陷成立，方案的"注释 + 文案"是可接受的默认路径，只要测试面补齐。
- **ui-shot 设置页空白**：实测全脚本无设置页导航、无 MCP/更新/模型选择器断言 ⇒ 涉及设置页 UI 的 F5/F14/F15/F20 的"离屏判据"都需要新建场景，成本应在工作量列如实反映（当前 F5/F14 记为"小"偏低）。

---

## 5. 结论

**revise**。F1–F19 的缺陷真实性成立、修法大多可用，但方案需先落实 21 条 must-fix（含 7 条阻断级），其中 F19 的根目录判定与 F2 的可滚动前置属"照原案实施会引入新回归"，F12 与 ui-shot 20b 的冲突属"照原案实施必红"，F20 建议降级为 D。完成上述修正后，本清单可进入实施。
