## 复核（R15）

> 复核对象：R15 交付（工作树 = HEAD `e5dc001` + 未提交改动：22 个白名单文件为 `M`、`pix/src/shared/limits.ts` 为 `??`）。依据 `docs/pm/R15-fix.md`（F1–F19 在册终表 + F20 降级 + 冻结面同步清单 + §4 验证方案）、`docs/pm/R15-audit.md`、`docs/pm/R15-fix-review.md`。
> 复核方式：**冷启动独立复核**——不复用交付方结论与产物；全部结论来自本次实读源码、实跑命令、本次全新离屏产物与本次自建探针。
> 复核纪律：未执行任何 git 写命令；未改源码；未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未触碰 `packages/*`；未改依赖与 lockfile；探针/中间产物全部落在 `%TEMP%`（跑完删除）。
> **结论：accept**。在册 F1–F19 **19/19 落地**；红线与冻结面**零违规**；全量回归（check + 两烟测 + 离屏 153 帧）全绿且可复跑。must-fix 1 条，属 F20 降级处置的收尾登记（不构成 F1–F19 的回归，不影响 R15 在册范围验收）。

---

### 1. 实跑证据（全量回归，两次离屏 + 门槛命令）

| # | 命令 | 实测结果 |
| --- | --- | --- |
| 1 | `cd pix && npm run check` | exit 0（`vue-tsc` + `tsc main` + `tsc preload` 三连无 error） |
| 2 | `cd pix && node scripts/smoke-notes.mjs` | **通过 65 / 失败 0**（exit 0；基线 51 + 新增 14 条） |
| 3 | `cd pix && node scripts/smoke-view.mjs` | **通过 35 / 失败 0**（exit 0） |
| 4 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r15-review" ./node_modules/.bin/electron scripts/ui-shot.mjs` | **EXIT=0**，末行 `[ui-shot] 结束：产出 153 张截图`（= `app.exit(0)` 路径）；日志全文落盘后核对，无 `场景失败` / `renderer gone` / `unhandledRejection` |
| 5 | 离屏第二次复跑（同 PIX_SHOT_ROOT，顺序执行，未并发） | 同上：EXIT=0、153 帧、读数逐条一致（见 §1.2） |

`npm run check` 的 exit 0 与两个烟测的通过/失败计数为本次真实输出；离屏退出码由重定向到日志的第二次运行直接读到（`EXIT=0`）。

#### 1.1 与基线 `C:/Users/86157/AppData/Local/Temp/pix-v05-r14-final` 的零缺失比对（§4.2 口径，本次实算）

| 项 | 基线 | 本次（两轮一致） | 结论 |
| --- | --- | --- | --- |
| `MANIFEST.failure` | `null` | `null` | 一致 |
| `shots[]` 成功帧 | 143 | **153** | ⊇ 基线 |
| 基线帧缺失数 | — | **0** | 零缺失 |
| 新增帧 | — | **10**：`r15-22c-bottom-50` / `r15-22f-fitted-no-clamp` / `45d-send-failure-restore` / `r15-ime-guard` / `r15-clarify-replace` / `r15-f18-capture-failure` / `r15-f18-capture-success` / `r15-f9-recover-backup` / `r15-f13-vision-failure-block` / `r15-f16-late-register` | 与计划 F1/F2/F6/F8/F9/F13/F16/F18 新增面一一对应 |
| `MEASUREMENTS` 条数 / label | 211 / 51 | **223 / 59** | label ⊇ 基线 |
| 基线 label 缺失数 | — | **0** | 零缺失 |
| 新增 label | — | **8**：`page-tracking` / `composer-send` / `composer-ime` / `clarify-replace` / `r15-capture-region` / `r15-notes-recover` / `r15-vision-fallback` / `r15-workspace-late-register` | 与计划一致 |
| `99-failure-state.png` | 不存在 | 不存在 | 一致 |
| 截图目录自净（脚本结束自检 + 复核独立复算） | — | 磁盘 png 153 = 清单 153，双向差集 0，白名单外条目 0 | 一致 |
| 已知 flake（r11-3 相位 4 超时） | — | 未触发（两轮均绿） | 无需重跑例外 |

#### 1.2 第二轮读数（复跑一致性抽查）

`failure=null`；`shots=153`；`measurements=223`；`labels=59`；基线缺失 0；新帧 10；新 label 8；§2 的复算脚本 15/15 通过。两轮 `MEASUREMENTS` 的 R15 新增记录逐字段一致（`composer-ime`、`page-tracking` 四相位、`r15-capture-region` 两相位、`r15-workspace-late-register` 等）。

---

### 2. 独立复现（自建探针 / 自建复算，全部 `%TEMP%`，跑完删除）

| 探针 | 覆盖 | 实测 | 判别力对照（同 harness 跑 HEAD 源码） |
| --- | --- | --- | --- |
| `probe-f1-ime.mjs`（从 `InputArea.vue` 逐字抽取 `onKeydown` 编译执行） | F1 | **通过 6 / 失败 0**：组合态 Enter `sent=[]`、`preventDefault` 未调用；非组合态 Enter `sent=["send"]`；Shift+Enter 不发送；`compositionstart→(isComposing)Enter→compositionend→Enter` 只发送 1 次；仅 `keyCode 229` 且未设 `isComposing` 的合成事件仍发送（该兼容路径由计划显式放弃） | HEAD 同法抽取：组合态 Enter **会发送**（缺陷复现） |
| `probe-f2-clamp.mjs`（逐字抽取 `updateCurrentPage`，用真实 CSS 几何模型 + 离屏实测几何驱动） | F2 | **通过 13 / 失败 0**：50% 触底 = 第 3 页；回顶 = 第 1 页；fitted（`clientHeight ≥ scrollHeight`）= 第 1 页；中部 4 个 scrollTop 与 HEAD 同值；用离屏实测几何（`scrollTop=457 / scrollHeight=1407 / clientHeight=950`）复算 HEAD = 第 2 页（≠ 末页） | HEAD 源在同几何下 = 2（缺陷复现）；「无滚动前置的朴素钳制」在 fitted 下钳到第 3 页（MF-2 修正必要性成立） |
| `probe-f3-conf.mjs`（真实 `settings-store.ts` tsc 编译 + 真实 `electron-store@8.2.0`/`conf@10.2.0`，只 shim `electron` 的 app 路径面；`%TEMP%` 造损坏 pix-settings） | F3 | **通过 8 / 失败 0**：截断 JSON 下真实 conf 构造期抛 **SyntaxError**（缺陷真实性）；修复后构造不抛、`getAll()` 回落 defaults、坏文件原字节完整躺在唯一 `.corrupt-20260917-032340` 备份、新文件按 defaults 重建；同秒二次运行换名 `-2` 不覆盖；零字节文件同样自愈；`recentProjects:"x"` 不透出非数组；正常文件不产生备份 | —（缺陷真实性由 F3-a 单独断言） |
| `probe-f4-library.mjs`（真实 `library-root.ts` + `cmd //c mklink /J` 真目录联接） | F4 | **通过 8 / 失败 0**：联接路径 true、真实路径 true、兄弟/`../` false、不存在的库内路径 true、普通根行为不变、无根恒 false（另测 `isLibraryDirAllowed(root)=true`、`isLibraryFilePath(root)=false`） | HEAD：联接路径访问 = **false**（整库被判越界的缺陷复现） |
| `probe-f7-f12-renderer.mjs`（esbuild 打包真实渲染层 `reader-state-store.ts` + pinia + 桩 `window.pixApi`） | F7 / F12(渲染) | **通过 4 / 失败 0**：1-e 不 reset 时迟到 save 响应写回（page=3）；1-d reset 后迟到响应**不回灌**（`documents={}`）；F12-r1 桩 IPC `{success:false,code:"no-root"}` ⇒ `ready=true` + `degraded=false` + 空模型 + 一条 `[reader-state] load failed (no-root)`；r1b 失败后仍能落盘（payload 恰 1 次） | HEAD：1-d **被回灌**（`docA.pdf: page 5` 写回已复位 store） |
| `probe-f10-notes-store.mjs`（esbuild 打包真实渲染层 `notes-store.ts`） | F10 | **通过 5 / 失败 0**：load 在途 loading → 写成功（`recoverCorruptNotes` 递增 `writeSeq`）→ load reject 后状态仍 `ready` 且数据在（2-c/2-d）；**反向对照**：无写时 load reject 仍进 `error` 态 | HEAD：同序列被推入 `error`（缺陷复现） |
| `probe-f17-pdf.mjs`（esbuild 打包真实 `pdf-tools.ts` + 真实 `pdfjs-dist`，仅把内核 `defineTool` 换恒等 shim） | F17 | **通过 4 / 失败 0**：300MB 稀疏文件（`truncateSync`）⇒ `PDF too large: 300 MB > 256 MB`（`pdf_read_pages` 与 `pdf_outline` 同文案、不抛、`details.error` 可读）；正常 PDF 仍读第 1 页文本（`Sparse Attention for Long-Context Retrieval`）；`grep -c readFileSync src/main/pdf-tools.ts` = **0** | —（体积守卫为直接代码路径 + 真实 pdf.js 回归） |
| `recompute-r15-measurements.mjs`（从 `MEASUREMENTS.json` 逐条复算 F1/F2/F6/F8/F9/F12/F13/F16/F18 的期望条件，期望值手写、草稿/备份字面量取自夹具常量为被测输入） | 离屏新增断言 | **通过 15 / 失败 0**（两轮各自复跑均 15/0） | — |

探针运行前置：两个离屏进程**未并发**（第二次离屏为顺序执行）；探针不复用 5199 端口；探针目录 `%TEMP%/pix-r15-review-probes` 复核结束后删除。

---

### 3. F1–F20 逐条结论表

| 编号 | 计划要求（R15-fix.md） | 复核证据（独立复现方式 → 实测结论） | 结论 |
| --- | --- | --- | --- |
| F1 | 三处 IME 组合态 Enter 守卫（发送框 / 重命名框 / 密钥框），成对判据 | 源码：`InputArea.vue` 首行 `if (e.isComposing) return;`、`ChatPanel.onRenameEnter`、`SettingsPage.onSaveKeyEnter(provider,$event)`（与 `PdfSearchPanel` 同形，未叠加 `keyCode 229`）。探针 `probe-f1-ime` 6/0（含 HEAD 对照会发送）；离屏 `composer-ime` 实测 `composing{sendCount:0, value 不变}` → `plain{sendCount:1, value 清空}`；`SettingsPage` 的 `<v-form @submit.prevent="saveSettings">` 走查确认不写密钥（`saveSettings` 只写默认模型/provider/思考档/takeHerEyes） | **落地** |
| F2 | 触底钳制（带可滚动前置）+ 4 条相位判据 | 源码：`updateCurrentPage` 首部 `scrollHeight-clientHeight>1 && scrollTop+clientHeight>=scrollHeight-1 ⇒ setPage(pageCount)`，既有 marker/二分逐字未动。离屏 22f 四相位实测：50% 触底 = 第 3/3 页（`scrollTop 457/1407/950`）、回顶 = 第 1/3 页、fitted = 第 1/3 页（不可滚动）、收尾 100% 且第 1 页。探针 `probe-f2-clamp` 13/0：HEAD 复算 = 2、朴素钳制对照在 fitted 下钳 3（修正必要性） | **落地** |
| F3 | 构造期容错 + 备份 + 形状校验 + `whenReady .catch` | 源码：`openStore()` catch → 唯一名 `.corrupt-yyyyMMdd-HHmmss(-n)` 备份 → defaults 重建；`getAll()` 走 `sanitizeGuiSettings`；`index.ts` 链尾 `.catch` → `console.error` + `dialog.showErrorBox("PiX-Read 启动失败", …)`。探针 `probe-f3-conf` 8/0（真实类 + 真实 conf + 真实 fs）：真实 conf 对坏 JSON 构造期抛 SyntaxError，修复后不抛、原字节在备份、零字节自愈、`recentProjects:"x"` 回落数组；所有主进程消费点均走 `getAll()`（`ipc-handlers:361/564/569`，无裸 `get()` 消费） | **落地**（真机走查见 §5 次级项） |
| F4 | 双根谓词（字面 ‖ realpath）+ 去 pdf-tools 复制实现 | 源码：`contained()` 双根 OR、`libraryRootReal` 缓存、`isPathInsideDirectory` 逐字未动、`library-root.ts` 未新增 import、`pdf-tools.ts` 删除本地 `normalizeFsPath`/`isInsideRoot`。探针 `probe-f4-library` 8/0（`mklink /J` 真联接）：联接/真实路径均 true、逃逸 false、不存在的库内路径 true、普通根不变、无根 false；HEAD 对照 = false | **落地** |
| F5 | 白名单只读边界注释 + 设置页面板级说明 | 内核语义实读：`sdk.js:157` `allowedToolNames = options.tools`、`agent-session.js:2280/2331` 对内置/自定义/扩展（含 MCP 注册）工具统一 `isAllowedTool` 过滤；`pi-mcp-adapter/dist/index.js:781-782` 生成 `mcp__<server>__<tool>` 名字 ⇒ 不在 PiX 传的 10 项白名单内，模型不可见。`session-bridge.ts:1313-1316` 4 行边界注释在册；`McpSettings.vue` 面板级 `v-alert`（`.mcp-tools-note`，常量 `服务器工具不会提供给模型（PiX 只开放只读工具）`）不依赖服务器列表，`mcpGetServers` 返回 `[]` 时同样可见 | **落地**（无自动化回归网，计划已登记为已知缺口） |
| F6 | 发送失败还原草稿/附件/粘贴图 + 聚焦 | 源码：`sentDraft/sentAttachments/sentImages` 三份快照 + catch 三路还原（均带「不覆盖在途新输入」）+ `nextTick` 聚焦 `composerInput`（ref 存在，`InputArea` 已 `defineExpose({focus})`）。离屏 `composer-send/failure-restore` 实测：`value === ASK45D`、`userBlocksRolledBack=true`、`sendDisabled=false`、`focused=true`、重发 `{value:"", type:"prompt"}`；45/45B/45C 既有行 `git diff` 无删除 | **落地** |
| F7 | `saveEpoch` 世代令牌（成功/失败两分支同判）+ `resetState` 递增 | 源码核对；探针 `probe-f7-f12-renderer` 1-d/1-e 4/0，HEAD 对照复现「迟到响应回灌」（缺陷真实性）；离屏 20 系列读数零回归（153 帧全绿） | **落地** |
| F8 | 浅层 getter watcher 复位 `currentQuestionIndex/answerMap` | 源码：`watch(() => props.pendingUserInput?.id ?? null, () => { index=0; answerMap={} })`（无 `deep`）。离屏 `clarify-replace` 实测 `1 / 2` → `1 / 1`、卡片在 DOM、`textareaDisabled=false`、撤销后消失 | **落地** |
| F9 | copy-first 备份 + `backupPath` 透传 + 「在文件夹中显示」 | 源码：main `notes-store.ts` `copyFileSync`（原文件不动，写失败仍回传 `backupPath`）；renderer 类型与两分支透传；`NotesPanel` 文案与 `.notice-reveal`。`smoke-notes` G4 #7/#8（既有 #1–#6 逐字未动）实测：成功路径 `backupPath` 非空 + 备份字节 === 损坏前字节 + 命名正则 + 原路径重建为空库；写失败注入（`notes.json.tmp` 预置为目录）⇒ `success:false`、原文件字节不变、备份存在。离屏 `r15-notes-recover`：提示含 stub 备份路径、`reveal=true`、空库 0 行 | **落地** |
| F10 | `loadNotes` catch 补 `startWriteSeq !== writeSeq` 守卫 | 源码：`startWriteSeq` 在入口捕获、catch 首行同守卫；`writeSeq` 仅 `applyNotes:185` / `recoverCorruptNotes:389` 递增（二者都置 `ready`，stale return 不留 loading）。探针 `probe-f10-notes-store` 5/0：写成功后到达的 load reject 保持 `ready` 且数据在；无写时仍进 `error`（防「清空状态换通过」）；HEAD 对照 = error | **落地** |
| F11 | 生命周期串行门 + 同 dir 幂等 + 订阅二次覆盖 + IPC 条件清根 + HomePage 在途守卫 | 源码走查：`_enqueueLifecycle`（`then(job, job)`，前序失败不吞错）覆盖 `start`/`newSession`/`switchSession`/`fork`/`navigateTree`/`dispose` 六项且**无自反调用死锁**（`_closeCurrentSession`/`_createSession`/`_activateSession` 均不在门内再调用公开生命周期方法；扩展命令回调 `commandContextActions` 的 `newSession/fork/switchSession` 由内核在 prompt 期调用，不与门重叠）；同 dir 幂等在串行段内、关闭前判定且幂等路径更新 `_guiSettings`；`_setupEventSubscription` 首行解绑旧订阅；`ipc-handlers:366` 改 `if (!sessionBridge.isRunning()) clearLibraryRoot()`；`HomePage` `opening` 守卫 + `:disabled="opening"`（`finally` 复位）。回归：全量离屏对工作区进出/会话切换路径零回归 | **落地（走查）**（独立探针未复跑，见 §5 次级项） |
| F12 | missing 摘出降级 + corrupt copy-first 备份 + version 拒写 + 渲染侧 `!success` 分支 + ui-shot 同步 | 源码逐点核对。`smoke-notes` 新组 `reader-state-store` #1–#5 实测：missing ⇒ `degraded:false` + **warn 0**；corrupt ⇒ `degraded:true` + load warn 1 + 备份字节 === 损坏前字节 + save 成功重建；备份名正则（`-n` 可选段）；version:2 ⇒ save 拒写（`code===undefined`、`error` 逐字 `阅读状态文件版本不支持（未写入）`）且文件 sha256 不变；read-failed ⇒ 拒写回归。渲染侧探针 `F12-r1/r1b` 见 §2。离屏：20b `warnDelta20b===0`、相位 23 `warnDelta===1` 逐字保留、`writeFixtures` 清 `.corrupt-*`（本次产物目录实测无残留） | **落地** |
| F13 | 仅「已启用 + 配置完整 + 确实带图」的不可用分支发 `eye_model_end{success:false}` | 源码走查（含反向清单）：`images.length===0`（`:1003`）、`getBlockImages()`、`!mainModel`、主模型可看图、`!config.enabled/provider/modelId` 均 **不发**；覆盖三分支（模型不可用/未配置鉴权/`auth.ok===false`），字段 `id=operationId`、`provider/modelId` 取配置值、`imageCount=images.length`；成功路径与 `emitEnd` 无删行。离屏兜底记录 `r15-vision-fallback`：无 start 的 `eye_model_end{success:false}` 恰好多一个块且文案 `视觉模型读取失败` | **落地**（真机走查未执行，`errorMessage` 不进 UI，均按计划登记） |
| F14 | `installUpdate` 返回 Promise + 渲染层 await 与失败文案 + stub 同步 | 源码：`preload.ts` 仅 1 行签名变更（方法名/顺序/42 项不变）；`SettingsPage.downloadAndInstall` `await` 后 `installed.success===false ⇒ updateError = error ?? "安装更新失败"`；主进程拒绝文案逐字 `有会话正在运行，请先停止会话再安装更新。`（`ipc-handlers:621`）且不退出；ui-shot stub 返回 `{success:true}`（无场景依赖） | **落地**（真机判据未执行，计划登记） |
| F15 | 7 个命令改 `sendCommandOrThrow` + `saveRename` catch + `abort` 显式保持静默 | 源码：`set_session_name`/`set_scoped_models`/`set_api_key`/`remove_auth`/`set_steering_mode`/`set_follow_up_mode`/`reload_resources` 7 处改抛出（4 处标注「当前零调用点」）；`sendCommandOrThrow` 在 `{success:false}` 抛 `new Error(message)`；`ChatPanel.saveRename` catch → `renameError` + 对话框内 `v-alert.rename-error`；`abort` 仍走 `sendCommand`（显式判定）。既有设置页 catch 文案 `保存 API 密钥失败`/`删除 API 密钥失败` 可用 | **落地（走查）** |
| F16 | await 后 `disposed` 守卫（注册前判定），不改注册顺序 | 源码：`onUnmounted` 首行置位、`onMounted` 5 处 await 后 `if (disposed) return;`（末次恰在 `onAgentEvent` 之前 ⇒ 计划推荐的「注册前判 disposed」）。离屏 `r15-workspace-late-register` 实测：迟到段注册 0 / 解绑 0、在册句柄增量 0、`agent_start` 后 `listSessions` 增量 0；本轮两跑均绿（场景含 4s+5s 固定窗口，收尾 `setLoadDelay(0)` 已复位） | **落地** |
| F17 | pdf 侧体积守卫 + 异步读 + 去第二份拷贝 + `shared/limits.ts` | 探针 `probe-f17-pdf` 4/0：300MB 稀疏文件被 `PDF too large: 300 MB > 256 MB` 拒绝（两个工具）、正常 PDF 回归可读；`readFileSync` 在 `pdf-tools.ts` **零命中**；`shared/limits.ts` 为叶子常量、只被 pdf-tools 引用（未进 smoke 编译面链路）；`git diff` 无 `chat-files.ts`（F17b 条件降级，未启用）。实现细节偏差（`new Uint8Array(file.buffer, byteOffset, byteLength)` 取代计划里的「直接传 Buffer」）有 pdf.js 行为佐证且探针转绿 | **落地** |
| F18 | 失败保留框选模式 +提示；成功/误触仍退出 | 源码：`captureRegion(rect): boolean`（7 处裸 return → `false`，成功 → `true`）、失败置 `captureFailed` 并 `return`（不退出）、进入/成功清空；`.capture-error-hint` 与 `.capture-hint` 并列、既有文案逐字未改。离屏 `r15-capture-region` 两相位实测：失败（画布置零）⇒ `.capture-layer` 在 DOM、`.capture-error-hint` 出现、`.pdf-viewer.capture-mode` + `aria-pressed="true"`；成功 ⇒ 退出模式 + `截图 1` chip。渲染层两条 `setPointerCapture NotFoundError` 为合成指针的已知现象（计划已声明不以 console error 判定失败） | **落地** |
| F19 | `isLibraryDirAllowed` 双根谓词 + `library-list`/`library-open-path` 根校验 | 源码走查：`library-list` 顺序为 类型/空值 → `no-root` → `isLibraryDirAllowed(resolve(dir))` → `statSync` 两分（`not-found` `目录不存在：<path>` / `not-a-directory` `不是目录：<path>`）→ 既有 `listLibraryChildren`；`library-open-path` 复用 `guardLibraryPath`（严格 `isLibraryFilePath`，根自身拒绝）+ `路径不存在`；`library-show-in-folder` 保持现状 + 注释。纯函数面由 `smoke-notes` `library-root-containment` #4–#7 实测（库根/子目录 true、兄弟与 `../` false、`isLibraryFilePath(根自身)===false`、无根恒 false） | **落地**（handler 装配无自动化 harness，计划登记为真机+走查） |
| F20 | **降级为 D**：处置 = 一行 `console.warn`（可选）+ 在本档登记匹配规则分叉 | `_applyEnabledModelScope`（`session-bridge.ts:1199-1206`）：`_resolveScopedModels` 返回空数组时 `:1205` 直接 `setScopedModels([])`，**无 warn**；`grep console.warn session-bridge.ts` 仅 takeHerEyes 三条；`docs/pm/R15-dev.md` **零次**提到 F20（登记缺失）。`R15-fix.md` §6 自身的 D 登记在册（降级理由不变） | **未落地（0/2）** → §6 must-fix |

**在册条目落地计数：19/19（F1–F19）**；F20 降级处置 0/2（warn + dev 档登记）。

---

### 4. 冻结面与红线核对（逐条实查）

| 项 | 核对方式 | 结果 |
| --- | --- | --- |
| 白名单 24 文件 | `git status --porcelain` + `git diff --stat` 逐项对表 | 22 个白名单文件为 `M`、新增仅 `pix/src/shared/limits.ts`（白名单第 11 行）；**表外文件 0**；`chat-files.ts` 未改（F17b 条件降级，计划允许） |
| `packages/*` 与依赖面 | `git status --porcelain packages/ pix/package.json pix/package-lock.json` | 全部为空（零 diff） |
| 既有冻结类名 / 选择器 | `SEL` 对象 HEAD 与现状 `diff`；`.capture-hint`/`.capture-layer`/`.pdf-capture-fab`/`.input-area`/`.composer-send`/`.error-block`/`.clarification-card`/`.question-progress`/`.note-row`/`.notes-stale`/`.empty-hint`/`.pdf-scroll`/`.textLayer`/`.pdf-error` 全量 grep | `SEL` **逐字相同**；类名全部在册 |
| 既有冻结文案 | 逐条 grep：`拖拽框选要提问的区域，Esc 取消`、`视觉模型读取失败`、`笔记文件无法读取（文件已损坏，未被修改）`、`笔记文件版本不支持`、`尚未选择资料库根目录`、`第 {{ page }} / {{ pageCount }} 页` | 全部保留（`visionStatusLabel` 逐字未动） |
| 既有断言 | `第 3 / 3 页` 出现次数 HEAD 8 → 现 10；`第 1 / 3 页` 13 → 16；`缩小后应回到 100%` 1 → 1；场景 43 steer 驱动 `new KeyboardEvent("keydown",{key:"Enter",bubbles:true})`（无 isComposing）未改；45/45B/45C `userBlocksRolledBack`/`stub 发送注入异常` 未改 | **零删除、零改写**（仅追加） |
| 冻结面同步清单（必须改的 3 处） | 逐一核对 | `ui-shot.mjs` 删行**仅 3 处**且与计划同步清单逐字一致：`installUpdate: function () {}`（F14）、`listSessions` 加计数（F16）、`waitWarnIncrement(warnBase20b, …)` → 有界静默 + `warnDelta20b===0`（F12）；`smoke-notes.mjs` 删行仅 import 行与 `required` 数组（新增 `main/reader-state-store.js`，计划内的编译面变更）。全部 `git diff -U0` 删行共 202 行，逐行分类均为计划内的重写（会话桥串行门包体、库根谓词替换、pdf-tools 去复制、captureRegion 布尔化、HomePage 重构缩进、7 个命令抛出化等），无截图名 / `record(` / `measurements.push` / `SEL.` 删行 |
| 产物与调试残留 | `git status --porcelain | grep '^??'`；`find pix/src -name '*.js'`；`git diff | grep '^+' | grep console.log` | 未跟踪仅 11 份 `docs/pm/R15-*.md`（复核档自身按任务新建）+ `shared/limits.ts`；`pix/src` 无 `.js` 残留；新增 `console.*` 仅 1 处 `console.error("[main] whenReady failed:")` + 1 处 `console.warn("[settings] …")` + 烟测内的 `console.warn` 捕获桩，**无 console.log 调试残留**；离屏产物只落在 `PIX_SHOT_ROOT`（仓库零残留） |
| 版本/协议面 | `preload.ts` 方法名/顺序/42 项；IPC 通道；`shared/types.ts` 未改（`git status` 无该文件） | 未变 |

---

### 5. must-fix 清单

1. **F20 降级处置未落地（登记 + 一行 warn）**。`docs/pm/R15-dev.md` 零次提及 F20；`session-bridge.ts` 的 `_applyEnabledModelScope`（`:1199-1206`）在 `_resolveScopedModels` 返回空数组时（`:1205`）没有任何 `console.warn`。按 `R15-fix.md` §6 的降级处置口径（「一行 warn + 匹配规则分叉登记」）与本次复核任务书的要求，需补：① 在 `:1205` 的空结果路径加一行 `console.warn`（措辞对齐内核 `model-resolver`）；② 在 dev 档登记 F20 降级事实与 PiX/内核匹配规则分叉（PiX 无 `[]`、无部分匹配、无别名）。属收尾性改动，不影响 F1–F19 与冻结面。

---

### 6. 次级项与残余风险（不阻断验收）

1. **真机走查未执行（环境限制，无人值守无 GUI）**：F3（`%APPDATA%\PiX-Read\pix-settings.json` 写坏 → 启动出现窗口 + `.corrupt-*` + 默认值）、F11（双击最近打开、快速返回首页无孤儿）、F13（视觉模型不可用时聊天流出现失败块、普通文本无噪声）、F14（会话运行中点安装更新的文案与不退出）、F15（设置页密钥失败提示）、F1（中文输入法实机组合态）——均由计划登记为「真机 / 人工」项。本次复核以等价面替代：F3 真实类探针、F11/F15 源码走查 + 全量离屏回归、F1 抽取真实 `onKeydown` 探针 + 离屏真实 KeyboardEvent。
2. **F11 未复跑独立探针**：完整 `SessionBridge` harness 需编译整个 main 并 shim electron + 起内核会话，超出本轮复核预算；本次以「串行门覆盖清单逐点走查（含无自反调用死锁核对）+ 153 帧全量零回归」替代。残余风险：真机「双击最近打开只重建一次」无自动化回归网（dev 档已用真实桥探针 + HEAD 对照覆盖）。
3. **F5 / F19 无自动化回归网**：设置页无 ui-shot 场景、`ipc-handlers` 装配无 harness（计划已登记）。F5 的内核过滤语义已由本次实读 `sdk.js` / `agent-session.js` / `pi-mcp-adapter` 证实。
4. **`library-list` 非字符串入参返回 `code:"not-found"`**（计划未指定码值；dev 档偏差 #6 已记录）：建议下轮统一为 `invalid`（与 `guardLibraryPath` 一致），当前渲染层忽略该字段，无用户可见影响。
5. **F12 的 stub 未模拟 save 侧 `.corrupt-*` 备份**（dev 档偏差 #4）：无断言依赖，假绿风险已评估为无（真实行为由 `smoke-notes` #2 覆盖）。
6. **`shared/limits.ts` 的两个 F17b 预留常量**（1 MiB / 10 MiB）为占位值且零引用，属 D 登记范围；启用 F17b 时必须随产品裁决改值。
7. **F2 的 `End`/`PageDown` 键盘路径**未核对（合成 KeyboardEvent 不触发原生滚动），计划已列入人工走查。
8. **ui-shot 相位 22f 复跑读数**：`before.scrollTop=48`（100% → 50% 连点缩小后的中间态）不影响判据；两个防空断言（可滚动、`scrollTop>0`）实测均成立，fitted 相位的 `scrollHeight=clientHeight=3000` 与「不可滚动」前提一致。

---

### 7. 复核方法与可复现命令

```bash
# 门槛三命令
cd pix && npm run check
cd pix && node scripts/smoke-notes.mjs          # 通过 65 / 失败 0
cd pix && node scripts/smoke-view.mjs           # 通过 35 / 失败 0

# 离屏（不得与其它取证进程并发；本次顺序跑两轮，均 EXIT=0 / 153 帧）
cd pix && PATH="/c/Program Files/nodejs:$PATH" \
  PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r15-review" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs

# 基线零缺失比对（脚本化：帧名集合 ⊇ 143、label 集合 ⊇ 51、磁盘/清单双向一致）
# 新增断言复算：读 shots/MEASUREMENTS.json，期望值手写
node <probe>/recompute-r15-measurements.mjs <shots>/MEASUREMENTS.json <OUT_ROOT>

# 独立探针（%TEMP%/pix-r15-review-probes，复核后删除）
node <probe>/probe-f1-ime.mjs
node <probe>/probe-f2-clamp.mjs <shots>/MEASUREMENTS.json
node <probe>/probe-f3-conf.mjs
node <probe>/probe-f4-library.mjs
node <probe>/probe-f7-f12-renderer.mjs
node <probe>/probe-f10-notes-store.mjs
node <probe>/probe-f17-pdf.mjs
```

> 探针与复算脚本存放于 `%TEMP%/pix-r15-review-probes/`（含 HEAD 源码对照树 `head/`），复核结束后整体删除；本档为唯一留存结论。

---

### F20 销账（R15）

> 销账对象：本档 §5 唯一 must-fix（F20 降级处置未落地：0 命中路径缺一行 warn + dev 档缺 F20 登记）对应的收尾修复。销账方式：冷启动独立核验，结论仅来自本次实读文件与实跑命令；未复用交付方结论。
> 纪律：未执行任何 git 写命令；未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未改白名单外文件（本次仅追加本小节）。

#### 1. 代码面（`git diff` 实读）

`pix/src/main/session-bridge.ts` 的 F20 相关 hunk 恰 1 处（`@@ -1151 +1205,6 @@`，原始计数 +6/-1）：

```diff
 		if (!patterns || patterns.length === 0) {
 			session.setScopedModels([]);
 			return;
 		}
-		session.setScopedModels(this._resolveScopedModels(session, patterns));
+		const scopedModels = this._resolveScopedModels(session, patterns);
+		if (scopedModels.length === 0) {
+			// F20 降级处置：0 命中时内核同样回退为全部模型（model-resolver 有 warn），此处仅补一行日志、不改行为
+			console.warn(`[SessionBridge] enabledModels 未命中任何模型，已回退为全部模型：${patterns.join(", ")}`);
+		}
+		session.setScopedModels(scopedModels);
```

| 判据 | 本次实测 | 结论 |
| --- | --- | --- |
| warn 只加在 `_applyEnabledModelScope` 的 0 命中分支 | 收尾修复新增 `console.warn` 源码行仅 1 处（`session-bridge.ts:1208`，在 `if (scopedModels.length === 0)` 内）；`git diff` 全量另 4 行新增 `console.warn`（烟测捕获桩 3 行、F3 `[settings]` 1 行）均属此前在册改动；`console.warn` grep：takeHerEyes 3 条逐字未动 | 符合 |
| 文案中文 | `[SessionBridge] enabledModels 未命中任何模型，已回退为全部模型：<patterns 逗号连接>`；注释亦为中文 | 符合 |
| 行为零改动（无 `setScopedModels` 行为变化） | `_resolveScopedModels` 调用次数与实参不变（1 次、同参）；0 命中与非 0 命中路径仍各以同一结果调用 `session.setScopedModels(...)` 恰 1 次；`:1202` 早退分支 `setScopedModels([])` 逐字未动；新增运行时副作用仅「0 命中时多一条日志」；`_resolveScopedModels` 为只读纯函数（遍历 registry 建数组，无写副作用） | 符合 |
| 未触碰其它文件（除 `docs/pm/R15-dev.md`） | 本档落盘（03:32:45）之后被改动文件仅 `pix/src/main/session-bridge.ts`（03:47:56）与 `docs/pm/R15-dev.md`（03:48:52）；`git status --porcelain` 文件集合与本档 §4 记录一致（22 M + `pix/src/shared/limits.ts` + 11 份 `R15-*.md`），无新增/消失 | 符合 |

#### 2. 命令与原样结果（本次实跑）

```text
cd pix && npm run check
  > vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
  → CHECK_EXIT=0

node pix/scripts/smoke-notes.mjs
  → 末行「通过 65 / 失败 0」，SMOKE_NOTES_EXIT=0

node pix/scripts/smoke-view.mjs
  → 末行「通过 35 / 失败 0」，SMOKE_VIEW_EXIT=0
```

（两烟测按任务书以仓库根为 cwd 执行；脚本按自身路径解析 `PIX_DIR`，与 `cd pix` 等价。）

#### 3. 文档面（走查）

- `docs/pm/R15-dev.md` 已有 `### F20 降级处置（收尾）` 小节（must-fix 第 ② 项）：降级理由 4 条、落地内容表（warn 位置 `:1205-1210` / 语句 `:1208`，与实读一致）、不改行为核对、契约分叉登记（0 命中处置 / glob 语法 / 部分匹配 / 别名 / 思考档后缀 5 维）、真实命令与输出、未验证事项。
- 该小节 §4 自报命令结果与本销账独立实跑逐条一致（exit 0 / 65-0 / 35-0）。

#### 4. 销账结论

- ① `_applyEnabledModelScope` 0 命中分支补一行 warn（仅日志、零行为改动）：**已落地**；② dev 档 F20 降级登记 + 契约分叉：**已落地**。
- **结论：closed**。本档 §5 唯一 must-fix 销账完成；F1–F19 与冻结面无回归（check 与两烟测全绿）。

#### 5. 残余风险（不阻断销账）

1. 新 warn 路径无自动化断言（交付方 `R15-dev.md` §5 已自报）：触发需真实「`enabledModels` 非空且 0 命中」；smoke 编译面不含 `session-bridge.ts`，本次以代码走查 + `tsc` 通过替代运行期探针。
2. 本次未复跑离屏回归（任务书白名单不含 `ui-shot`）：新增副作用仅为一条 `[SessionBridge]` 前缀日志；`ui-shot` 的 warn 卫生断言按 `line.includes("[reader-state]")` 过滤（`scripts/ui-shot.mjs:1628`），不含此前缀，不影响既有断言；修复后整树的离屏证据留待提交前/下轮补跑。
3. 计数口径：`R15-dev.md` §2 自报该 hunk 为「+4/-1」；本次实读 `git diff -U6` 原始计数为 **+6/-1**（含 1 行注释与被改写的调用行，不计注释为 +5/-1）。属文档计数口径差异，不影响任何判据。
