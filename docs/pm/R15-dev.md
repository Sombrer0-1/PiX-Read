# R15 修复开发档（按批次追加）

> 依据：`docs/pm/R15-fix.md`（批次表 / 白名单 / 判据）、`docs/pm/R15-fix-review.md`。本档由各批次修复代理按批追加，只记真实改动、真实命令输出与未验证事项。
> 冻结面纪律：既有类名 / 文案 / ui-shot 场景与断言逐字保留（除非修复方案明确要求同步更新，更新处逐条登记）。

---

### 批次 B1

**范围**：F3 → F4 → F19 → F9 → F10 → F7 → F12（主进程数据安全与路径）。
**白名单命中**：`settings-store.ts` / `index.ts` / `library-root.ts` / `pdf-tools.ts` / `ipc-handlers.ts` / `notes-store.ts`(main) / `notes-store.ts`(renderer) / `NotesPanel.vue` / `reader-state-store.ts`(main) / `reader-state-store.ts`(renderer) / `smoke-notes.mjs` / `ui-shot.mjs`（12 个，全部在 `R15-fix.md` §3 白名单内）。
**未触碰**：`packages/*`、`src/shared/types.ts`、`preload.ts`、依赖与 lockfile；未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev` / ui-shot；未执行任何 git 写命令。

#### 1. 改动清单（文件:行要点）

| 文件 | 行（改后） | 要点 |
| --- | --- | --- |
| `pix/src/main/settings-store.ts` | 23-57 / 75-84 / 93-106 / 109-111 | `sanitizeGuiSettings`（`recentProjects` 恒数组、主题/思考档/视觉配置形状校验回落默认）；`backupInvalidSettingsFile`（mkdir → 唯一名 `.corrupt-yyyyMMdd-HHmmss(-n)` → rename，与 F9/F12 同规则）；`openStore` 构造期 catch → 备份 → 用 defaults 重建；`getAll()` 走形状校验 |
| `pix/src/main/index.ts` | 9 / 215-220 | `dialog` 加入 electron import；`app.whenReady().then(...)` 链尾接 `.catch` → `console.error` + `dialog.showErrorBox("PiX-Read 启动失败", message)` |
| `pix/src/main/library-root.ts` | 13 / 20-32 / 50-56 / 63-68 / 70-98 | 新增 `libraryRootReal` 缓存（setLibraryRoot 时 realpath，失败回退字面）；`realPathOrNull`；`contained` = 字面命中 ‖ realpath 命中（双根 OR）；`isLibraryFilePath`（allowRoot=false）、`isLibraryDirAllowed`（allowRoot=true）、`isPathInsideDirectoryResolved`（cwd 版，严格包含）；`clearLibraryRoot` 同时清两值；**未新增 import** |
| `pix/src/main/pdf-tools.ts` | 1-8 / 18-20 | 删除本地 `normalizeFsPath` / `isInsideRoot` 复制实现；`isAllowedPdfPath = isLibraryFilePath(p) ‖ isPathInsideDirectoryResolved(p, cwd)`，注释写明 cwd 放行 = 会话目录文件 |
| `pix/src/main/ipc-handlers.ts` | 20 / 423-446 / 448-458 / 460-465 | `library-list`：类型/no-root → `isLibraryDirAllowed` 拒根外 → `statSync` 两分 `not-found`（`目录不存在：<path>`）/ `not-a-directory`（`不是目录：<path>`）；`library-open-path`：复用 `guardLibraryPath`（严格 `isLibraryFilePath`，根自身拒绝）+ `路径不存在` 文案；`library-show-in-folder` 保持现状 + 注释（设置页需根外能力） |
| `pix/src/main/notes-store.ts` | 11 / 539-545 | `resetCorruptNotes` 备份改 **copy-first**（`copyFileSync`，原文件不动）；写失败分支继续回传 `backupPath`（既有 `:547` 语义保留） |
| `pix/src/renderer/stores/notes-store.ts` | 64 / 255 / 384-397 | `NotesActionResult` 两分支加可选 `backupPath`；`recoverCorruptNotes` 成功/失败都透传 `result.backupPath`；`loadNotes` catch 首行补 `startWriteSeq !== writeSeq` 守卫（F10） |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 77 / 155-157 / 400-411 / 573-585 / 1048-1058 | `lastBackupPath` ref（`setNotice` 统一清空，避免指向上一份备份）；失败文案 `重建失败：<message>（原文件已备份：<path>）`、成功文案 `已备份原文件并新建空库：<path>`；`.notes-notice` 内新增「在文件夹中显示」按钮（`.notice-reveal` → `revealPath`），样式与既有 `.notice-close` 同风格 |
| `pix/src/main/reader-state-store.ts` | 12 / 204-219 / 234-241 / 258-279 | `missing` 摘出降级（`degraded:false`、零 warn）；本地 `uniqueBackupPath` + `formatStampDashed`；`corrupt` 重建前 copy-first 备份（路径进 warn），备份失败则拒写；`version-unsupported` 拒写（不带 code，`error` 逐字 `阅读状态文件版本不支持（未写入）`），原文件字节不变；`read-failed` 仍拒写 |
| `pix/src/renderer/stores/reader-state-store.ts` | 63 / 113-129 / 160-172 / 245 | `saveEpoch` 世代令牌（`submit` 开头快照、await 后成功/失败两分支先判）；`loadReaderState` 的 `!result.success` 分支 → `degraded:false` + 空模型 + `load failed (<code>)` warn + `ready:true`；`resetState` 递增 `saveEpoch` |
| `pix/scripts/smoke-notes.mjs` | 10 / 486-560 / 1111-1223 / 1226-1326 / 1350-1360 / 1367-1369 / 1378 / 1420-1421 | 新增组 `library-root-containment`（F4/F19，7 条）与 `reader-state-store`（F12，5 条）；`runUndoSlotLifecycle` 追加 #7/#8（F9 copy-first 成功/写失败）；编译面 `files` + `required` 追加 `main/reader-state-store.js`（`allowed` 不变）；加载 `readerStateStore` |
| `pix/scripts/ui-shot.mjs` | 396-400 / 1111-1123 / 1810-1830 / 8811-8848 | `writeFixtures` 清理两库 `.pix-read/reader-state.json.corrupt-*`；stub `readerStateLoad` 的 missing ⇒ `degraded:false`（其余 reason 仍 true，与真实主进程同步）；20b 的 `waitWarnIncrement` → 有界 `sleep(600)` + 新增 `warnDelta20b === 0` 断言（label `resume-entry/no-record`）；新增 r15-f9 逃生口记录与截图 `r15-f9-recover-backup.png`（断言 `.notes-notice` 文本含 stub 的 `backupPath = NOTES_FILE + ".bak"` 与 `.notice-reveal` 入口） |

**冻结面核查**：既有 `第 3 / 3 页` / 缩放断言、45/45B/45C、场景 43、相位 23 的 `warnDelta === 1`、13d `.pix-read` 断言、`smoke-notes` 既有 51 条（含 G4 的 `backups.length === 1`、备份名正则、`rebuiltText === serialize([])`）全部逐字未动；`isPathInsideDirectory`（`ipc-handlers` 会话文件保护在用）逐字未动；`PixApi` 42 方法、IPC 通道、`shared/types.ts` 未动。

#### 2. 逐条自评

| 编号 | 结论 | 判据与实测 |
| --- | --- | --- |
| F3 | **完成** | `%TEMP%` 探针 `probe-f3-conf.mjs`（真实 `electron-store@8.2.0` / `conf@10.2.0`，只 shim `electron`）：F3-a 坏 JSON 构造期 `SyntaxError`（缺陷真实性，红）；F3-b 修复后真实 `SettingsStore` 构造不抛、`getAll()` 回落 defaults、坏文件原字节完整躺在 `.corrupt-*` 备份、新文件按 defaults 重建；F3-c 备份名匹配 `/\.corrupt-\d{8}-\d{6}(-\d+)?$/` 且同秒二次运行换名 `-2`（不覆盖旧备份）；F3-d `recentProjects:"x"` 不透出非数组。**真机走查未执行（见 §5）** |
| F4 | **完成** | 探针 `probe-f4-library-root.mjs`（`cmd //c mklink /J` 造联接）：F4-a 联接路径 true（**并直接编译 `git show HEAD:` 的修复前源码复跑，实测 false ⇒ 断言有判别力**）、F4-b 真实路径 true、F4-c 兄弟/`../` false、F4-d 不存在的库内路径 true、F4-e 普通目录根行为不变、F4-e2 无根 false。`smoke-notes` 同口径复跑（junction 由 `symlinkSync` 造）：组 `library-root-containment` #1–#3 全绿 |
| F19 | **完成** | `smoke-notes` 组 `library-root-containment` #4–#7：`isLibraryDirAllowed(库根/根内子目录/真实路径)===true`、兄弟与 `../` false、`isLibraryFilePath(根自身)===false`（严格语义保留）、无根恒 false。`library-list`/`library-open-path` 装配为走查项（handler 依赖 electron，无自动化 harness，见 §5 登记） |
| F9 | **完成** | `smoke-notes` `undo-slot-lifecycle` #7/#8（既有 #1–#6 逐字保留）：成功路径 `backupPath` 非空 + 备份存在且字节 === 损坏前字节 + 命名合规 + 原路径重建为空库；写失败注入（`notes.json.tmp` 预置为目录）⇒ `success:false` + `code:write-failed` + `existsSync(NOTES_A)===true` 且字节不变（**copy 语义**）+ `backupPath` 非空且存在。离屏新增记录 `r15-notes-recover/backup-path` + 截图（本批不跑，见 §4） |
| F10 | **完成** | 探针 `probe-f7-f10-stores.mjs`：探针2-a（loading）/2-b（写成功）前置、2-c 写成功后到达的 load reject 不再把面板推入 error（绿）、2-d 数据仍在；**基线脚本 `probe-f7-f10-baseline.mjs` 用 `git show HEAD:` 的修复前源码复跑 2-c，实测红 ⇒ 断言有判别力** |
| F7 | **完成** | 同探针：1-a/1-b/1-c 前置、1-d 迟到 save 响应不回灌已复位 store（绿）、1-e 不 reset 时迟到响应必须写回（反向，绿）；基线脚本实测 1-d 修复前红 |
| F12 | **完成** | `smoke-notes` 组 `reader-state-store` #1–#5：missing ⇒ `degraded:false` 且 `[reader-state]` warn 计数 0（monkeypatch `console.warn` 捕获）；corrupt ⇒ `degraded:true` + warn 1 + 备份存在且字节 === 损坏前字节 + save 成功且条目重建；备份名匹配 `/^reader-state\.json\.corrupt-\d{8}-\d{6}(-\d+)?$/`；version:2 ⇒ load degraded + save 拒写（`code===undefined`、`error` 逐字「阅读状态文件版本不支持（未写入）」）且文件 sha256 不变；read-failed（文件位置预置为目录）⇒ load degraded + save 拒写（回归）。渲染侧 `F12-r1`：桩 IPC `{success:false,code:"no-root"}` ⇒ `load failed (no-root)` warn 且 `ready===true`。ui-shot 侧 20b 改 `warnDelta===0`、stub missing ⇒ `degraded:false`、fixture 清 `.corrupt-*`，相位 23 的 `warnDelta===1` 逐字保留 |

**探针/离屏归属说明**：F3 的 electron shim 路线在本仓按 `R15-fix.md` F3「为什么不用 ①」被否；本批改用「编译真实 `settings-store.ts` 到 `pix/node_modules/.pix-r15-probe/out` + 只 shim `electron`（`app.getPath/setPath`），`electron-store`/`conf` 全真」——被测量（conf 构造期抛错 → 备份 → 重建）没有被桩掉，且比「复刻算法」的探针强，属判据范围内加强（见 §4 偏差表第 1 条）。

#### 3. 真实命令与输出摘要

```
# 基线（改动前，HEAD e5dc001）
cd pix && npm run check                     → exit 0
node scripts/smoke-notes.mjs                → 通过 51 / 失败 0（exit 0）
node scripts/smoke-view.mjs                 → 通过 35 / 失败 0（exit 0）

# 改后（本批全部改动落地）
cd pix && npm run check                     → exit 0（vue-tsc + tsc main + tsc preload 三连无 error）
node scripts/smoke-notes.mjs                → 通过 65 / 失败 0（exit 0）  ← 51 + 14 条新增
node scripts/smoke-view.mjs                 → 通过 35 / 失败 0（exit 0）

# 探针（%TEMP%/pix-r15-probes，命令：PIX_DIR=E:/develop/PiX-Read/pix node <probe>.mjs）
probe-f3-conf.mjs          → 全部通过：F3-a SyntaxError；F3-b-1/b-2 构造不抛+defaults+原字节在备份；F3-c-1 名字正则；F3-c-2 换名 -2 不覆盖；F3-d 形状校验（exit 0）
probe-f4-library-root.mjs  → 全部通过：F4-a（修复前 false 已用 HEAD 源码实测）/b/c/d/e/e2（exit 0）
probe-f7-f10-stores.mjs    → 全部通过：1-a/b/c 前置、1-d、1-e、2-a/b/c/d、F12-r1（exit 0）
probe-f7-f10-baseline.mjs  → 基线复现：1-d / 2-c 修复前均为红（exit 0）
```

`smoke-notes` 新增组实测输出（逐条通过，摘录）：

```
== 组 library-root-containment ==
[通过] #1 F4-a/b 联接根：经联接路径访问已存在文件 = true，经真实路径访问 = true
[通过] #2 F4-c 联接根：兄弟目录与 ../ 逃逸 = false
[通过] #3 F4-d 联接根：不存在的库内路径（字面/联接根下）= true
[通过] #4 F19-1 isLibraryDirAllowed：库根/根内子目录/真实路径 = true，兄弟与 ../ 逃逸 = false
[通过] #5 F19-2 isLibraryFilePath 保留严格语义：库根自身 = false（普通根与联接根均如此）
[通过] #6 F4-e 普通目录根行为不变：内含 true / 根自身与兄弟 false / 不存在的库内路径 true
[通过] #7 F19-3 无根：isLibraryDirAllowed / isLibraryFilePath 均恒 false
== 组 reader-state-store ==
[通过] #1 F12-a missing ⇒ success:true + degraded:false + 无 reason/error + warn 计数 0
[通过] #2 F12-b corrupt ⇒ degraded:true + warn 1 + 备份字节 === 损坏前字节 + save 成功且条目已重建
[通过] #3 F12-e 备份名匹配 /^reader-state\.json\.corrupt-\d{8}-\d{6}(-\d+)?$/
[通过] #4 F12-c version:2 ⇒ load degraded + save 拒写（success:false、error 逐字「阅读状态文件版本不支持（未写入）」）且文件 sha256 不变
[通过] #5 F12-d read-failed ⇒ load degraded:true + save 拒写（code=read-failed，回归）
```

F9 新增断言实测输出：

```
[通过] undo-slot-lifecycle #7 F9 成功路径：backupPath 非空 + 备份存在且字节 === 损坏前字节 + 备份名合规 + 原路径重建为空库
[通过] undo-slot-lifecycle #8 F9 写失败路径：success:false + 原文件仍在且字节不变（copy 语义）+ backupPath 非空且存在
```

#### 4. 偏差表

| # | 条目 | 计划 | 实际 | 性质 / 处置 |
| --- | --- | --- | --- | --- |
| 1 | F3 探针载体 | `%TEMP%` 探针只验真实 `conf`（承认真实类无自动化覆盖，配真机走查） | 探针在真实 `conf` 之外，把真实 `settings-store.ts` 编到 `pix/node_modules/.pix-r15-probe/out`（只 shim `electron`）后直接断言 F3-b/c/d | 加强，不改变被测行为；探针仍写 `%TEMP%`、结束删编译产物。F3-a 仍单独断言「真实 electron-store 构造期抛 SyntaxError」 |
| 2 | `library-list` 返回形状 | 计划只写 `{success:false, code:"no-root"/"outside"}` 与两类 error 文案 | `no-root`/`outside`/非字符串入参无 `error` 文本（渲染层回退既有「无法读取目录」）；`not-found`/`not-a-directory` 带计划指定的中文文案与 code | 无新增用户可见文案（除 §5 已登记的 R11 两分）；未登记新文案 |
| 3 | F12 `corrupt` 备份附加 warn | 计划「路径进 warn」 | save 侧除 load 的 1 条降级 warn 外，另加 1 条 `corrupt state backed up: <path>` | 计划明确的「路径进 warn」；相位 23 的 `warnDelta===1` 在 load 时刻采集，不受影响（实测 smoke #2 的 `corruptWarns === 1`） |
| 4 | ui-shot stub 的 save 侧备份 | 计划只要求 stub `readerStateLoad` 的 missing 语义同步 | stub `readerStateSave` 未模拟 `.corrupt-*` 备份落盘 | 无任何断言依赖该文件；真实行为由 `smoke-notes` F12-b 覆盖。登记为 stub 与真实主进程的已知差异（假绿风险：无） |
| 5 | F9 离屏记录位置 | 计划未指定落点 | 追加在 `runScenario` 末尾（r14-5 之后、`restoreStandardSeed()` 之前），截图 `r15-f9-recover-backup.png` | 计划 §2「新增帧为 Δ 增量（F1/F2/F6/F8/F9/F16/F18 的新截图）」已把 F9 列入新增截图 |
| 6 | `library-list` 非字符串入参 | 计划写「入参校验」但未给码值 | 返回 `{success:false, code:"not-found"}` | 极小防御分支；不新增码表（`code` 只在主进程对象里，`PixApi` 未声明该字段，渲染层忽略） |

#### 5. 未验证事项

1. **F3 真机走查未执行**：`%APPDATA%\PiX-Read\pix-settings.json` 写截断 JSON / 零字节 → 启动 ⇒ 窗口出现 + `.corrupt-*` 出现 + 设置页为默认值；以及 `recentProjects:"x"` 下 `ipc-handlers`/渲染层不出现 TypeError。原因：本批禁跑 `npm run build` / `npm run dev`，且不允许写用户真实 `%APPDATA%` 数据；等价机制已由 `probe-f3-conf.mjs`（真实类 + 真实 conf + 真实 fs）覆盖到构造/备份/重建/形状校验四步。
2. **F19 handler 装配走查**：`library-list` / `library-open-path` 的 IPC 层无自动化 harness（`ipc-handlers.ts` 依赖 electron）。已做代码级走查（顺序：入参 → no-root → 根判定 → stat → 列表；`open-path` 复用 `guardLibraryPath`）；真机判据「打开资料库树正常 + `libraryList("C:/")` 被拒」未执行。判定逻辑本身已入 smoke 面。
3. **离屏（ui-shot）本批未跑**：F9 新记录/截图、F12 的 20b `warnDelta===0`、stub missing 语义、fixture 清理均按计划落地但未实跑（避免与复核步并发；`R15-fix.md` §2 明确「本批不跑」）。复核步第一次跑 ui-shot 即是这些改动的首次运行验证。
4. **F12 相位 23 复跑读数**：本批只做了代码/断言同步（`warnDelta===1` 逐字保留），实跑读数留给离屏步骤。
5. **探针时效**：三个探针 + 一个基线脚本为一次性 `%TEMP%` 产物，产出摘要后已删除；仓库内不留探针脚本（如需复跑，按本档 §3 的命令与判据重建）。

#### 6. 批内自净

- `git status --short` 仅 12 个白名单文件为 `M`，无新增未跟踪产物（探针编译产物在 `pix/node_modules/.pix-r15-probe`，已删除；`pix/node_modules` 属 gitignore）。
- 未执行任何 git 写命令（提交由负责人完成）。

---

### 批次 B2

**范围**：F11 → F1 → F6 → F8 → F15 → F14 → F16（会话生命周期、输入契约与命令契约）。
**白名单命中**：`session-bridge.ts` / `ipc-handlers.ts` / `HomePage.vue` / `InputArea.vue` / `ChatPanel.vue` / `SettingsPage.vue` / `useRpc.ts` / `preload.ts` / `WorkspacePage.vue` / `ui-shot.mjs`（10 个，全部在 `R15-fix.md` §3 白名单内）。
**未触碰**：`smoke-notes.mjs`（本批无 smoke 落点，B1 的 65 条保持）、`packages/*`、`src/shared/*`、`tsconfig*.json`、依赖与 lockfile；未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev` / ui-shot；未执行任何 git 写命令。
**冻结面纪律**：既有类名 / 文案 / ui-shot 既有场景与断言逐字保留（本批新增均为新增记录 / 新增 stub 口，无既有断言改写）。

#### 1. 改动清单（文件:行要点）

| 文件 | 行（改后） | 要点 |
| --- | --- | --- |
| `pix/src/main/session-bridge.ts` | 52 / 202-210 / 212-246 / 241-248 / 300-317 / 321-391 / 393-402 / 1400-1405 | 新增 import `normalizeFsPath`（library-root.js）；`_lifecycleChain` + `_enqueueLifecycle`（`then(job, job)`，前序失败也继续、不吞错）；`start`/`newSession`/`switchSession`/`fork`/`navigateTree`/`dispose` 主体包进串行门；`start` 串行段内新增同 dir 幂等（命中时仅更新 `_guiSettings` 后 return，不 dispose、不 emit ready）；`_setupEventSubscription` 首行 `this._unsubscribe?.(); this._unsubscribe = null;`（杜绝句柄二次覆盖泄漏） |
| `pix/src/main/ipc-handlers.ts` | 366 | `session-start` 失败分支改 `if (!sessionBridge.isRunning()) clearLibraryRoot();`（仍在运行的会话不得被后续失败清根） |
| `pix/src/renderer/pages/HomePage.vue` | 26 / 45-68 / 133 | `opening` ref 在途守卫（`openWorkspace` 首判 + try/finally 复位）；最近项目条目 `:disabled="opening"` |
| `pix/src/renderer/components/input/InputArea.vue` | 29-30 | `onKeydown` 首行 `if (e.isComposing) return;`（与 `PdfSearchPanel.vue:308` 逐字一致，不叠加 keyCode 229） |
| `pix/src/renderer/components/workspace/ChatPanel.vue` | 219-227 / 377-380 / 399-409 / 683-713 / 1163-1172 | F8 澄清进度 watcher（浅层 `props.pendingUserInput?.id ?? null` → 复位 index / answerMap）；F6 发送前快照（草稿 / 附件 / 粘贴图）+ catch 内三路还原与 `nextTick` 聚焦；F15 `renameError` ref + `saveRename` catch（`重命名失败：<message>`）+ 对话框内 `<v-alert type="error" density="compact" class="rename-error">`；F1 `onRenameEnter` 守卫 + 模板改绑 |
| `pix/src/renderer/pages/SettingsPage.vue` | 109-113 / 311-327 / 491 | F1 `onSaveKeyEnter(provider, $event)` 守卫 + 模板改绑；F14 `downloadAndInstall` 改 `const installed = await window.pixApi.installUpdate()`，失败回落 `安装更新失败` |
| `pix/src/renderer/composables/useRpc.ts` | 324 / 342 / 358 / 363 / 430 / 445 / 454 | 7 个命令由 `sendCommand` 改走 `sendCommandOrThrow`（`set_session_name` / `set_scoped_models` / `set_api_key` / `remove_auth` / `set_steering_mode` / `set_follow_up_mode` / `reload_resources`；后 4 个注明「当前零调用点」）；`abort` 保持 `sendCommand`（显式判定，不进变更集） |
| `pix/src/main/preload.ts` | 108 | `installUpdate: () => Promise<{ success: boolean; error?: string }>`（方法名 / 顺序不变，`api` 对象 42 项不变；`git diff` 实测该文件仅 1 行改） |
| `pix/src/renderer/pages/WorkspacePage.vue` | 45-46 / 84 / 91 / 100 / 105 / 108 / 135 | `disposed` 卸载标志；`onMounted` 每个 await 之后 `if (disposed) return;`（注册顺序与既有 `agent_start` 时序逐字不动）；`onUnmounted` 首行置位 |
| `pix/scripts/ui-shot.mjs` | 484-488 / 860-869 / 880 / 1165 / 1216-1224 / 4099-4205 / 8978-9022 | stub 新增 `agentEventRegisterCount` / `agentEventUnregisterCount` / `listSessionsCalls` 与 `agentEventListenerCount()` / `listSessionsCalls()` 口；`installUpdate` 改返回 `{success:true}`；新增三组离屏记录（`composer-send/failure-restore`、`composer-ime/enter-guard`、`clarify-replace/replace`，截图 `45d-send-failure-restore.png` / `r15-ime-guard.png` / `r15-clarify-replace.png`）与 F16 记录（`r15-workspace-late-register`，截图 `r15-f16-late-register.png`） |

**冻结面核查**：场景 43 的 steer 驱动（`new KeyboardEvent("keydown", { key: "Enter", bubbles: true })`，未传 isComposing ⇒ 默认 false）逐字未动；45/45B/45C 的 `userBlocksRolledBack` / `stub 发送注入异常` 与每轮 `setDraft` 覆写逐字未动；既有两个 context watcher、设置页既有文案、`preload` 42 方法名与顺序、`PixApi` 方法集合均未动；ui-shot 既有场景 / 截图 / 断言无改写（新增一律追加）。

#### 2. 逐条自评

| 编号 | 结论 | 判据与实测 |
| --- | --- | --- |
| F11 | **完成** | `%TEMP%` 探针 `probe-f11-bridge.mjs`（真实 `SessionBridge`：把当前 `src/main` 编到 `pix/node_modules/.pix-r15-probe/out`，只 shim `electron` 的 `app.getPath/setPath/isPackaged/getAppPath` 并补 `process.resourcesPath`）：F11-a 同 dir 双击 ⇒ `created 1 / ready 1 / dispose 0 / subscribe 1 / 终态 cwd=A`（绿）；F11-b A→B ⇒ `created 2 / ready 2 / A dispose 恰 1 / 开着的订阅 1（无孤儿）/ 终态 _cwd=B`（绿）；F11-c dispose 收尾 ⇒ `exit 1 / running false / 订阅全解绑`（绿）。**判别力对照**：`probe-f11-bridge-baseline.mjs`（`git show HEAD:pix/src/main/session-bridge.ts` 编同一 harness）⇒ F11-a 红（`created 2 / ready 2 / dispose 0`、`subscribe 2`：双击重建两次且首会话成孤儿）、F11-b 红（`created 3`、开着的订阅 2）、F11-c 红。IPC 层 `clearLibraryRoot` 条件与 `HomePage` 守卫为走查项（见 §5） |
| F1 | **完成** | 三处守卫（发送框 / 重命名框 / 密钥框）落地；离屏新记录 `composer-ime/enter-guard`（组合态回车 `sendCalls===0` 且草稿不变 → 非组合态回车 `waitSendCalls(1)` 且草稿清空，成对断言）已按计划落点写入 `ui-shot.mjs`，**本批不跑离屏**（留复核步）。走查：`SettingsPage` 的 `<v-form @submit.prevent="saveSettings">` 隐式提交不写密钥（`saveSettings` 只写默认模型 / 思考档 / takeHerEyes，密钥仅由 `saveKey` 显式提交）⇒ 不补守卫；真机 IME 走查未执行（见 §5） |
| F6 | **完成** | `send()` 发送前快照 + catch 内三路还原（草稿 / 附件 / 粘贴图，均带「不覆盖在途新输入」条件）+ `nextTick` 聚焦 `composerInput`；离屏新记录 `composer-send/failure-restore`（截图 `45d-send-failure-restore.png`）：失败后 `.input-area` 值 === ASK45D、`userBlocks` 回滚、`.composer-send` 非 disabled、焦点回输入框；恢复后重发 `waitSendCalls(1)` 且草稿清空。**本批不跑离屏**（留复核步） |
| F8 | **完成** | 新增浅层 watcher（`props.pendingUserInput?.id ?? null`）在 id 变化与置 null 时复位 `currentQuestionIndex` / `answerMap`；离屏新记录 `clarify-replace/replace`（截图 `r15-clarify-replace.png`）：r1 两问推进到 `2 / 2` → 替换为 r2 一问 ⇒ `.clarification-card` 在 DOM、`.question-progress === "1 / 1"`、`.card-textarea` 未 disabled、撤销后卡片消失。**本批不跑离屏**（留复核步） |
| F15 | **完成** | 7 个命令改走 `sendCommandOrThrow`；`ChatPanel.saveRename` 同批加 catch（无未处理拒绝）；`abort` 保持静默（显式判定）。探针 `probe-f15-useRpc.mjs`（编译真实 `useRpc.ts` + `node_modules` junction + 桩 `window.pixApi`）：3-a `setApiKey` 失败抛出（绿）、3-a2 `removeAuth` 抛出（绿）、3-a3 `setModel` 既有抛出对照（绿）、3-b 正常路径不抛且刷新 models/state（绿）、3-c `setSessionName` 抛出（绿）、3-d `abort` 不抛（绿，显式静默判定）。**判别力对照**：`probe-f15-useRpc-baseline.mjs`（HEAD `useRpc.ts`）⇒ 3-a / 3-a2 / 3-c 红（`threw:null` 静默 resolve）、3-a3 / 3-b / 3-d 绿 |
| F14 | **完成** | `preload.ts` 签名改 `Promise<{success,error?}>`（方法名 / 顺序 / 42 项不变）；`SettingsPage.downloadAndInstall` await 并回落 `installed.error ?? "安装更新失败"`；ui-shot stub 改 `return { success: true }`。走查：主进程拒绝分支文案 `有会话正在运行，请先停止会话再安装更新。`（`ipc-handlers.ts:621`）→ 渲染层 `updateError` → 模板 `SettingsPage.vue:588` 的 `.update-status.error` 节点渲染（文案逐字）。真机判据未执行（见 §5） |
| F16 | **完成** | `WorkspacePage` 新增 `disposed`：`onUnmounted` 首行置位、`onMounted` 5 处 await 之后 `if (disposed) return;`（注册顺序不变）。ui-shot stub 新增注册 / 解绑计数与 `listSessions` 调用计数；新场景 `r15-workspace-late-register`（截图 `r15-f16-late-register.png`）：`setLoadDelay(4000)` 进工作区后立即返回首页 ⇒ 基线取在迟到段落地前，5s 后断言「迟到段注册数 === 解绑数」「在册句柄增量 0」，随后 `emitAgentEvent({type:"agent_start"})` 断言 `listSessions` 调用增量为 0。**本批不跑离屏**（留复核步） |

**探针 / 离屏归属说明**：F11 的 harness 按附录 A 第 3 条落地（编译进 `pix/node_modules/.pix-r15-probe`、electron shim、跑完删除），另用 `git show HEAD:` 的修复前源码做同 harness 对照，证明断言有判别力；F1 / F6 / F8 / F16 的判据在 `R15-fix.md` 中指定为离屏（ui-shot），本次只落点不跑（离屏留复核步，避免并发占端口 5199）。

#### 3. 真实命令与输出摘要

```
cd pix && npm run check                     → exit 0（vue-tsc + tsc main + tsc preload 三连无 error）
node scripts/smoke-notes.mjs                → 通过 65 / 失败 0（exit 0；B1 的 14 条新增保持，本批未改该脚本）
node scripts/smoke-view.mjs                 → 通过 35 / 失败 0（exit 0）
node --check scripts/ui-shot.mjs            → 语法 OK（无离屏执行）
```

探针（`%TEMP%/pix-r15-probes`，命令 `cd pix && node <probe>.mjs`）：

```
probe-f11-bridge.mjs          → 失败 0 条（F11-a/b/c 全绿；exit 0）
[通过] F11-a 同 dir 幂等（双击 ⇒ 1 会话 / 1 ready / 0 dispose / 终态 dir 不变） — {"created":1,"activated":1,"ready":1,"exit":0,"subscribeCalls":1,"unsubscribeCalls":0,"running":true,"disposeOfFirst":0}
[通过] F11-b A→B 串行（ready×2 / A 被 dispose 恰 1 次 / 无孤儿订阅 / 终态 _cwd === B） — {"afterB":{"created":2,"ready":2,"subscribeCalls":2,"unsubscribeCalls":1},"aDisposed":1,"openSubscriptions":1}
[通过] F11-c dispose 收尾（exit 恰 1 次、无在册会话、订阅全解绑） — {"afterDispose":{"exit":1,"running":false},"disposeCalls":2}

probe-f11-bridge-baseline.mjs → 失败 3 条（HEAD 源码复跑：F11-a created 2 / ready 2 / dispose 0，F11-b 开着的订阅 2；exit 1）

probe-f15-useRpc.mjs          → 失败 0 条（3-a / 3-a2 / 3-a3 / 3-b / 3-c / 3-d 全绿；exit 0）
[通过] 3-a setApiKey 在 {success:false} 下必须让调用方感知（抛出） — {"threw":"stub 拒绝：密钥写入失败","calls":["set_api_key"]}
[通过] 3-b 正常路径 {success:true} 不得抛（并刷新 models/state） — {"threw":null,"calls":["set_api_key","get_available_models","get_state"]}

probe-f15-useRpc-baseline.mjs → 失败 3 条（HEAD 源码复跑：3-a / 3-a2 / 3-c 静默 resolve，threw:null；exit 1）
```

#### 4. 偏差表

| # | 条目 | 计划 | 实际 | 性质 / 处置 |
| --- | --- | --- | --- | --- |
| 1 | F8 watcher 落点 | 「位置：`ChatPanel.vue:143-152`（现有两个 watcher）」 | 落在澄清状态块（`currentAnswer` 之后，`ChatPanel.vue:219-227`） | 同文件、语义一致；就近放置避免 setup 期 TDZ 与上下文混排。无冻结面影响 |
| 2 | F11 探针 harness 细节 | 附录 A 只写「electron 用 `--import` loader 映射到 shim」 | 改为「编译产物上一级目录内 `node_modules/electron` 目录 shim」（距产物更近的解析路径），并补 `process.resourcesPath`（纯 node 下该 Electron 专有字段缺失会让 `resolveReadingSkillsDir` 抛 TypeError） | 等价加强：真实 `SessionBridge` + 真实 `createAgentSession` 路径，只 shim electron 的 app 路径面；不改变被测行为。已登记本档 |
| 3 | F16 断言语义 | 「断言注册数 === 解绑数」 | 用「迟到窗口基线（`evtMid`）→ 迟到段落地后（`evtAfter`）」的增量比较，并追加「在册句柄增量 0」 | 全量计数含 useRpc 与 `goHome → stopSession` 的清理，全局平衡在本场景必然不等；增量口径才对应「迟到段」这一被测行为，且修复前仍必红（见 §2 说明） |
| 4 | F16 场景收尾 | 计划未提 | 追加一次 `emitAgentEvent({type:"agent_end"})` 复位 useRpc 的 `isStreaming` | 防污染后续 `runReaderStateScenarios`；不进断言 |
| 5 | F1 隐式提交 | 「`SettingsPage.vue:348` 的 `<v-form @submit.prevent>` 列入人工走查」 | 走查结论：`saveSettings` 不写密钥 ⇒ 不需要守卫 | 按计划「若真机可复现再补」处理；真机 IME 未执行（§5） |

#### 5. 未验证事项

1. **离屏（ui-shot）本批未跑**：F1 / F6 / F8 / F16 的新记录、截图与 stub 计数口均按计划落点写入，但未实跑（`R15-fix.md` §2 允许本批不跑；避免与复核步并发占端口 5199）。复核步第一次跑 ui-shot 即这些改动的首次运行验证；F16 场景含 4s + 5s 的固定等待窗口（慢加载造窗口所必需）。
2. **F11 真机手工未执行**：双击「最近打开」只重建一次会话、快速返回首页无孤儿 —— 本批禁跑 `npm run dev` / `npm run build`（无 GUI 载体）。等价面已由真实 `SessionBridge` 探针（并发 `Promise.all([start(A), start(A)])`）+ 修复前对照覆盖「会话数 / ready / exit / dispose / 订阅 / 终态 dir」六项读数；IPC 层 `clearLibraryRoot` 条件与 `HomePage` 在途守卫只做代码级走查。
3. **F1 真机 IME 走查未执行**：中文输入法组合态回车在发送框 / 重命名框 / 密钥框的实机行为、以及 `v-form` 隐式提交在 IME 下是否触发，均未在真机验证（无人值守环境）。代码级判据：三处均已加 `e.isComposing` 守卫；发送框断言口径为离屏 `composer-ime`（组合态 / 非组合态成对）。
4. **F14 真机判据未执行**：会话运行中点「安装更新」应出现主进程文案 `有会话正在运行，请先停止会话再安装更新。` 且不退出。已走查主进程拒绝分支与渲染层 `updateError` 渲染节点（`SettingsPage.vue:588`）；stub 无设置页场景，无自动化回归网。
5. **F15 真机走查未执行**：设置页密钥保存失败出现既有中文提示（`保存 API 密钥失败` / `删除 API 密钥失败` 或主进程 message）；探针只覆盖「调用方能否感知失败」与正常路径不抛。
6. **探针时效**：三个探针 + 两个基线脚本为一次性 `%TEMP%` 产物，产出摘要后已删除；仓库内不留探针脚本（如需复跑，按本档 §3 命令与 §4 偏差表第 2 条 harness 说明重建）。

#### 6. 批内自净

- `git status --short`：`pix/` 下仅白名单文件为 `M`，无新增未跟踪产物。`pix/node_modules/.pix-r15-probe` 已删除；探针编译期一度在 `pix/src/main/` 落下的三个副作用 `.js`（`preload.js` / `pix-paths.js` / `shared/types.js`）已删除，并复核 `git status pix` 无 `??` 条目。
- 未执行任何 git 写命令（提交由负责人完成）。

---

### 批次 B2 · 复跑核验（第二次派发；源码零改动）

**派发背景**：本批次为第二次派发。开工时工作树已完整包含上一小节「批次 B2」记录的全部改动（`git diff --name-only` 实测 20 个文件，其中本批 10 个白名单文件；门槛三命令全绿），并逐条与 `R15-fix.md` 的 F11 / F1 / F6 / F8 / F15 / F14 / F16 修法与落点一致。因此本轮**不重复修改源码**，改为独立复核：逐条与计划比对 + 自建探针（F11、F15，含修复前同 harness 对照）+ 门槛三命令；ui-shot 侧只做静态核验（离屏按派发禁令留给复核步）。

#### 1. 改动清单（本轮）

| 文件 | 行（改后） | 要点 |
| --- | --- | --- |
| 源码 / 脚本 | — | **零改动**（只读比对；`git diff --stat` 与开工时逐项一致） |
| `docs/pm/R15-dev.md` | 本小节 | 追加复跑核验记录 |

#### 2. 逐条自评（编号 → 结论 + 判据）

| 编号 | 结论 | 判据与实测 |
| --- | --- | --- |
| F11 | 复核通过 | 自建探针（真实 `SessionBridge`：`pix/src/main` 编译到 `pix/node_modules/.pix-r15-probe/out`，仅 shim electron 的 app 路径面）：F11-a `created 1 / ready 1 / closed 0 / openSubs 1 / cwdMatchesA true / running true`；F11-b `createdDelta 1 / readyDelta 1 / aDisposed 1 / openSubs 1 / cwdMatchesB true`；F11-c `exitDelta 1 / running false / openSubs 0`。**判别力对照**：`git archive HEAD pix/src` 的修复前源码编同一 harness ⇒ F11-a 红（`created 2 / ready 2`）、F11-b 红（`aDisposed 0 / cwdMatchesB false`）、F11-c 绿。代码走查：串行门覆盖 `start`/`newSession`/`switchSession`/`fork`/`navigateTree`/`dispose` 六项（`clone` 按计划不在内）；`_setupEventSubscription` 首行解绑旧订阅；`ipc-handlers.ts:366` 条件清根；`HomePage.vue` 在途守卫 + 最近项目 `:disabled="opening"` |
| F1 | 复核通过（离屏留复核步） | 三处守卫逐行核对：`InputArea.vue:29` 首行 `if (e.isComposing) return;`（同仓既有写法 `PdfSearchPanel.vue:308` 同形，未叠加 `keyCode === 229`）；`ChatPanel.vue` `onRenameEnter` + 模板改绑；`SettingsPage.vue` `onSaveKeyEnter(provider, $event)` + 模板改绑。隐式提交走查复跑：`saveSettings()` 只写默认模型 / 默认 provider / 思考档 / takeEyes / pi settings，**不写 API 密钥** ⇒ 按计划「若真机可复现再补」不补守卫。离屏记录 `composer-ime/enter-guard` 静态核验：成对断言（组合态 `sendCount===0` 且草稿不变 → 非组合态 `sendCount===1` 且清空），截图 `r15-ime-guard.png` |
| F6 | 复核通过（离屏留复核步） | `send()` 发送前取三份快照（草稿 / 附件 / 粘贴图）+ catch 三路还原（均带「不覆盖在途新输入」条件）+ `nextTick` 聚焦 `composerInput`；未新增 ErrorBlock 重试按钮（模板逐行核对）。离屏记录 `composer-send/failure-restore` 静态核验：断言 `.input-area === ASK45D`、`userBlocksRolledBack`、`.composer-send` 非 disabled、焦点回输入框、重发后清空；截图 `45d-send-failure-restore.png`；45/45B/45C 既有行逐字未动（`git diff` 该处无删除行） |
| F8 | 复核通过（离屏留复核步） | 浅层 watcher `props.pendingUserInput?.id ?? null` → 复位 `currentQuestionIndex` / `answerMap`（无 `deep`）；离屏记录 `clarify-replace/replace` 静态核验：r1 两问推进到 `2 / 2` → 替换为 r2（单问）⇒ `.clarification-card` 在 DOM、`.question-progress === "1 / 1"`、`.card-textarea` 未 disabled、撤销后卡片消失；截图 `r15-clarify-replace.png`；既有 41c 场景只发单请求，不触新 watcher |
| F15 | 复核通过 | 自建探针（esbuild 打包真实 `useRpc.ts` + 桩 `window.pixApi`）：3-a `setApiKey` 失败抛出（`threw:"stub 拒绝：set_api_key"`）、3-a2 `removeAuth` 抛出、3-a3 `setModel` 对照抛出、3-b 正常路径不抛且 `get_available_models` / `get_state` 被调用、3-c `setSessionName` 抛出、3-d `abort` 保持静默（显式判定）。**判别力对照**：HEAD 的 `useRpc.ts` 同 harness ⇒ 3-a / 3-a2 / 3-c 红（`threw:null`）。`ChatPanel.saveRename` catch + `renameError` 同批落地（无未处理拒绝）；`abort` 逐行确认仍走 `sendCommand` |
| F14 | 复核通过（真机判据未执行） | `preload.ts:108` 签名 `Promise<{success,error?}>`（方法名 / 顺序 / 42 项不变）；`SettingsPage.downloadAndInstall` await 并回落 `安装更新失败`；主进程拒绝分支文案 `有会话正在运行，请先停止会话再安装更新。`（`ipc-handlers.ts:621` 逐字核对）→ `updateError` → `SettingsPage.vue:588` `.update-status.error` 渲染节点；ui-shot stub 返回 `{success:true}` |
| F16 | 复核通过（离屏留复核步） | `WorkspacePage.onMounted` 5 个 await 后各 `if (disposed) return;`（末次恰在 `onAgentEvent` 注册之前 ⇒ 采用计划推荐的「注册前判 disposed」），`onUnmounted` 首行置位；注册顺序与既有 `agent_start` 时序逐字未动。ui-shot：stub 新增 `agentEventListenerCount()` / `listSessionsCalls()` 计数口；记录 `r15-workspace-late-register/unmount-during-load` 断言「迟到段注册数 === 解绑数」「在册句柄增量 0」「`agent_start` 后 `listSessions` 增量 0」；截图 `r15-f16-late-register.png` |

**ui-shot 侧静态核验（本轮实做）**：

- `node --check scripts/ui-shot.mjs` ⇒ 语法 OK（未跑离屏）。
- TypeScript AST 作用域核验（一次性脚本，跑完删除）：新增记录块（45d / r15-ime / r15-clarify / r15-f16）与 `const emit = (event) => …` 同属 `runReaderStateScenarios` 函数体；块内除全局 `JSON` 外全部标识符均可解析到作用域内声明 ⇒ 不存在 `ReferenceError` 面。
- 冻结面：`git diff -U0 scripts/ui-shot.mjs` 全量仅 3 行删除（`listSessions` stub 加计数、`installUpdate` stub 改返回对象、B1 的 `waitWarnIncrement` 行）；场景 43 steer 驱动 `new KeyboardEvent("keydown", { key: "Enter", bubbles: true })`（现 2466 行，未传 `isComposing`）与 45/45B/45C 既有断言均无改动；新增截图名与记录组名与计划一致 |

#### 3. 真实命令与输出摘要

```
# 门槛三命令（本轮实跑）
cd pix && npm run check                → exit 0（vue-tsc + tsc main + tsc preload 无 error）
node scripts/smoke-notes.mjs           → 通过 65 / 失败 0（exit 0）
node scripts/smoke-view.mjs            → 通过 35 / 失败 0（exit 0）
node --check scripts/ui-shot.mjs       → SYNTAX_OK

# 探针（写 %TEMP%/pix-r15-b2，跑完已删除）
node %TEMP%/pix-r15-b2/probe-f11-bridge.mjs → 失败 0 条（exit 0）
  [通过] F11-a 同 dir 幂等 — {"created":1,"ready":1,"exit":0,"closed":0,"subscribeCalls":1,"openSubs":1,"cwdMatchesA":true,"running":true}
  [通过] F11-b A→B 串行 — {"createdDelta":1,"readyDelta":1,"aDisposed":1,"closedDelta":1,"openSubs":1,"subscribeCalls":2,"unsubscribeCalls":1,"cwdMatchesB":true}
  [通过] F11-c dispose 收尾 — {"exitDelta":1,"running":false,"openSubs":0,"unsubscribeDelta":1,"closedDelta":1}
node <baseline> probe-f11-bridge.mjs（HEAD 源码同 harness）→ 失败 2 条（exit 1）
  [失败] F11-a — {"created":2,"ready":2,"exit":0,"closed":0,"subscribeCalls":2,"openSubs":1,…}
  [失败] F11-b — {"createdDelta":2,"readyDelta":2,"aDisposed":0,"closedDelta":1,"openSubs":1,…,"cwdMatchesB":false}
node %TEMP%/pix-r15-b2/probe-f15-useRpc.mjs <current bundle> → 失败 0 条（exit 0）
  [通过] 3-a setApiKey 失败必须让调用方感知 — {"threw":"stub 拒绝：set_api_key","calls":["set_api_key"]}
  [通过] 3-b 正常路径不抛 — {"threw":null,"calls":["set_api_key","get_available_models","get_state"]}
  [通过] 3-d abort 保持静默 — {"threw":null}
node %TEMP%/pix-r15-b2/probe-f15-useRpc.mjs <HEAD bundle> → 失败 3 条（exit 1；3-a / 3-a2 / 3-c 均 threw:null）
```

#### 4. 偏差表

| # | 条目 | 计划 | 实际 | 性质 / 处置 |
| --- | --- | --- | --- | --- |
| 1 | 小节标题 | 「追加你的小节：### 批次 B2」 | 工作树已有同名小节（上一派发产出）⇒ 本轮追加为「### 批次 B2 · 复跑核验」 | 文档结构差异，避免同名标题二义；既有小节内容零改动 |
| 2 | 本轮源码改动 | 按计划实现 F11 / F1 / F6 / F8 / F15 / F14 / F16 | 开工时改动已在树中且逐条与计划一致 ⇒ 零改动，只做复核 | 无新增行为偏差；证据见 §2 / §3 |
| 3 | F11 探针 harness | 附录 A 第 3 条：编译到 `pix/node_modules/.pix-r15-probe/out` + electron shim | 同路线；另将 `git archive HEAD pix/src` 解出的修复前源码编到 `.pix-r15-probe/baseline-src → baseline-out` 做同 harness 对照 | 加强（同 harness 判别力对照）；baseline 编译期只报 renderer 别名类类型错误，`main/*.js` 产物完整可执行 |
| 4 | F15 探针载体 | 附录 A 第 4 条：编译到 `%TEMP%/out` + `node_modules` junction | 改用 esbuild 打包真实 `useRpc.ts`（`--bundle --format=esm --platform=neutral --alias:@=src/renderer`，vue 一并打入）+ 桩 `window.pixApi` | 等价加强：被测模块逐字节取自仓库源码，只替换 IPC 边界 |

#### 5. 未验证事项

1. **离屏（ui-shot）本轮未跑**（按派发禁令，留复核步）：F1 / F6 / F8 / F16 的记录与截图、F16 的 stub 计数口均只做静态核验（语法 / AST 作用域 / 冻结面行级比对），未实跑读数。
2. **真机项未执行**：F11（双击最近打开、快速返回首页无孤儿）、F1（IME 组合态实机与 `v-form` 隐式提交）、F14（会话运行中点安装更新的文案与不退出）、F15（设置页密钥失败中文提示）——无人值守环境无 GUI 载体；等价面见 §2。
3. **F16 场景含固定等待窗口**（4s 慢加载 + 5s 观察窗），首次实跑读数与 flake 判定留给复核步。

#### 6. 批内自净

- `git status --short`：`pix/` 下仍仅 20 个白名单文件为 `M`；无新增未跟踪产物；`pix/node_modules/.pix-r15-probe` 已删除；`find pix/src -name "*.js"` 无探针残留；`%TEMP%/pix-r15-b2` 与 `%TEMP%/pix-r15-b2-appdata` 已删除。
- 未执行任何 git 写命令（提交由负责人完成）。

---

### 批次 B3

**范围**：F2 → F18 → F13 → F17 → F5（PDF 链与大输入）。
**白名单命中**：`PdfViewer.vue`（F2/F18）/ `ui-shot.mjs`（F2/F18/F13 离屏落点）/ `session-bridge.ts`（F13/F5）/ `pdf-tools.ts`（F17）/ `shared/limits.ts`（F17，表内第 11 行「新增」）/ `McpSettings.vue`（F5）（6 个，全部在 `R15-fix.md` §3 白名单内）。
**未触碰**：`chat-files.ts`（F17b 条件降级未启用，本轮不改）、`packages/*`、`src/shared/types.ts`、依赖与 lockfile；未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev` / ui-shot（离屏留给复核步，避免占端口 5199）；未执行任何 git 写命令。

#### 1. 改动清单（文件:行要点）

| 文件 | 行（改后） | 要点 |
| --- | --- | --- |
| `pix/src/renderer/components/workspace/PdfViewer.vue` | 63-65 / 292-300 / 538-554 / 567-635 / 848-857 / 945-949 / 1144-1158 | **F2**：`updateCurrentPage` 首部加触底钳制（`scrollHeight - clientHeight > 1` 且 `scrollTop + clientHeight >= scrollHeight - 1` ⇒ `readerStore.setPage(readerStore.pageCount)` 后返回），既有 marker + 二分逻辑逐字不动；**F18**：新增 `captureFailed` ref、`captureRegion(rect): boolean`（原 7 处裸 `return` 改 `return false`，成功路径补 `return true`）、`onCapturePointerUp` 失败时置位并保留框选模式、`captureMode` watcher 进入时清空、模板新增 `.capture-error-hint`（与 `.capture-hint` 并列，既有文案未改）、同款样式 |
| `pix/src/main/session-bridge.ts` | 1040-1070 / 1086-1093 / 1311-1314 | **F13**：`_tryTakeHerEyes` 新增局部 `emitUnavailable`（`id = operationId`、`provider/modelId` 取配置值、`imageCount = images.length`），覆盖「模型不存在/非 image 模型」「未配置鉴权」「`auth.ok === false`」三分支（中文短句），`images.length === 0` / 未启用 / 配置不完整 / blockImages / 主模型可看图一律不发；成功路径与 `emitEnd` 逐字不动。**F5**：`tools` 白名单处补 4 行只读边界注释（不新增能力） |
| `pix/src/main/pdf-tools.ts` | 1-10 / 21-38 / 80-90 | **F17**：`resolveGuardedPdfPath` 在 exists/stat 之后加体积守卫（`MAX_PDF_BYTES`，文案 `PDF too large: <N> MB > 256 MB`）；`withPdfDocument` 改 `await readFile` 且不再做第二份整份拷贝（改为同底层 `Uint8Array` 视图，见 §4 偏差 1）；`isAllowedPdfPath` 复用 B1 落地的 `isPathInsideDirectoryResolved` |
| `pix/src/shared/limits.ts`（新增） | 1-17 | 叶子常量模块：`MAX_PDF_BYTES` (256 MB) + 两个 F17b 预留常量；不 import 任何模块，不被 `library-root` / `notes-store` / `reader-state-store` 反向依赖（smoke 编译面 required/allowed 不变） |
| `pix/src/renderer/components/settings/McpSettings.vue` | 21-22 / 101-108 | **F5**：面板级常量 `TOOLS_NOT_SHARED_NOTE = "服务器工具不会提供给模型（PiX 只开放只读工具）"`，渲染为顶部 `v-alert type="info" variant="tonal"`（`.mcp-tools-note`，与 `mcpGetServers` 返回空也可见） |
| `pix/scripts/ui-shot.mjs` | 2176-2258 / 6675-6778 / 9162-9191 | **F2** 新相位 22f（`page-tracking` × 4 条：`bottom-clamp-50` / `top-back-50` / `fitted-no-clamp` / `restored-100`；截图 `r15-22c-bottom-50.png`、`r15-22f-fitted-no-clamp.png`）；**F18** 新场景（`r15-capture-region` × 2 条：`failure-keeps-mode` / `success-exits`；截图 `r15-f18-capture-failure.png`、`r15-f18-capture-success.png`）；**F13** 渲染兜底记录（`r15-vision-fallback` × 1 条，截图 `r15-f13-vision-failure-block.png`）。全部为纯追加（`git diff -U0` 删行仍为 B1/B2 的 3 行） |

**冻结面核查**：既有类名 / 文案 / 选择器未改（`.capture-hint` 文本 `拖拽框选要提问的区域，Esc 取消` 逐字未动；`第 N / M 页`、缩放 `%`、`.pdf-page`/`.textLayer`/`.pdf-scroll`/`.capture-layer`/`.pdf-capture-fab`/`.attachment-chip` 等均未动）；ui-shot 既有场景 / 断言 / 截图名零改写（仅追加 7 条记录 + 5 张新截图）；场景 43、45/45B/45C、相位 23 `warnDelta === 1`、`第 3 / 3 页`（含 110%）等既有断言逐字未动；`visionStatusLabel` 文案未改（F13 的 `errorMessage` 不进 UI，按计划登记为已知缺口）；`PixApi` 42 方法、IPC 通道、`shared/types.ts` 未动。

#### 2. 逐条自评

| 编号 | 结论 | 判据与实测 |
| --- | --- | --- |
| F2 | **完成（源码 + 落点）** | 源码：`updateCurrentPage` 触底钳制按计划落地，写值用 `readerStore.pageCount`，中部滚动取页口径与 `onScroll`/`zoomBy` 均未动。离屏新相位 22f 已按计划落点写入（`SEL` 复用既有 `zoomInBtn`，新增 `zoomOutBtn` 未另立选择器——既有 `'.pdf-toolbar button[title="缩小"]'` 直接内联，见 §4 偏差 2），4 条测量覆盖计划 ①–④（50% 触底 ⇒ 第 3 / 3 页；回顶 ⇒ 第 1 / 3 页；fitted 不可滚动 ⇒ 仍第 1 / 3 页；收尾恢复 100% 且第 1 页），每条自带防空断言（可滚动、scrollTop > 0、不可滚动）。**本批不跑离屏**（留复核步） |
| F18 | **完成（源码 + 落点）** | 源码：`captureRegion` 返回布尔（7 处裸 return → `false`，成功 → `true`），失败保留框选模式并置 `captureFailed`；`.capture-error-hint` 与 `.capture-hint` 并列、既有提示文案逐字未改；进入框选/成功后清空。误触阈值（< 6px）分支语义保持「退出」（R4 既有语义）。离屏新场景已落点：置零画布后合成拖拽（`pointerdown` → `pointermove` 120×80 → `pointerup`，`pointerId: 7`）⇒ 断言 `.capture-layer` 仍在 DOM、`.capture-error-hint` 出现、`capture-mode` + `aria-pressed="true"`；反向（还原画布尺寸后正常拖拽）⇒ 退出模式且 `.attachment-chip` 出现「截图 1」，场景收尾点 `.attachment-remove` 移除 chip（防污染后续相位）。`SEL.captureLayer`/`captureFabBtn` 不变；r11-2 的 Esc 相位未触。**本批不跑离屏**（留复核步） |
| F13 | **完成（源码 + 走查）** | 源码：`emitUnavailable` 只在「配置完整（enabled + provider + modelId）且确实带图」时发射，覆盖 `!eyeModel || !eyeModel.input.includes("image")`（`配置的视觉模型不可用`）、`!hasConfiguredAuth`（`视觉模型未配置鉴权`）、`auth.ok === false`（`鉴权失败`）三分支。**反向清单（不发）**：`images.length === 0`（每次 prompt 都调用本方法，无图不产生噪声）、`getBlockImages()`、`!mainModel`、`mainModel.input.includes("image")`（主模型能看图）、`!config?.enabled \|\| !config.provider \|\| !config.modelId`（功能未启用/配置不完整）。成功路径与 `emitEnd` 未动（`git diff` 该段无删行）。离屏兜底记录 `r15-vision-fallback`（仅覆盖渲染层：无 start 的 `eye_model_end{success:false}` ⇒ 恰好多出一个块且文案为「视觉模型读取失败」）已落点，注明性质不代表 F13 本身。真机走查未执行（见 §5） |
| F17 | **完成** | 探针 `probe-f17-pdf.mjs`（编译真实 `pdf-tools.ts` + `library-root.ts` + `shared/limits.ts` 到 `pix/node_modules/.pix-r15-probe/out`，只 shim 无——全真依赖）：`F17-a` 300MB 稀疏文件（`truncateSync`）⇒ `pdf_read_pages` 返回 `PDF too large: 300 MB > 256 MB`、不抛、`details.error` 同文案；`F17-a2` 文案含实际体积与上限；`F17-a3` details 可读；`F17-a4` `pdf_outline` 同样被拦；`F17-b` 正常 PDF（探针自建最小 PDF）仍可读第 1/2 页文本且相对路径走 cwd 放行；`F17-c` `grep -n "readFileSync" src/main/pdf-tools.ts` 零命中。**探针实测捕获一处真实缺陷**：直接 `await readFile` 得到的 Buffer 会被 pdf.js 的 `getDataProp` 明确拒绝（`Please provide binary data as Uint8Array, rather than Buffer.`）⇒ 改为同底层视图包装（零拷贝，非第二份整份拷贝）；见 §4 偏差 1 |
| F5 | **完成（文案 + 走查）** | 面板级文案常量落地（`.mcp-tools-note`，`v-alert type="info" variant="tonal" density="compact"`）；白名单处 4 行只读边界注释落地。边界走查（内核源码实读）：`node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.js:157` `allowedToolNames = options.tools ?? ...`、`:281` 传给 agent；PiX 传的即这份 10 项白名单；MCP 工具名由 `pi-mcp-adapter` 生成为 `mcp__<server>__<tool>`（`dist/index.js:781` 附近）⇒ 不在白名单内，模型不可见。**无自动化回归网**（ui-shot 无设置页场景、`mcpGetServers` stub 返回 `[]`），按计划登记（见 §5） |

#### 3. 真实命令与输出摘要

```
# 门槛三命令（本批改动落地后实跑）
cd pix && npm run check                     → exit 0（vue-tsc + tsc main + tsc preload 三连无 error）
node scripts/smoke-notes.mjs                → 通过 65 / 失败 0（exit 0；B1 的 65 条保持，本批未改该脚本）
node scripts/smoke-view.mjs                 → 通过 35 / 失败 0（exit 0）
node --check scripts/ui-shot.mjs            → SYNTAX_OK（无离屏执行）
git diff -U0 scripts/ui-shot.mjs | grep 删行 → 3 行（全部属于 B1/B2 已登记的 stub/等待式改动，本批 0 删行）
```

F17 探针（`%TEMP%/pix-r15-b3/probe-f17-pdf.mjs`，命令 `cd pix && node <probe>`）：

```
probe-f17-pdf：通过 6 / 失败 0（exit 0）
[通过] F17-a 300MB 稀疏文件被拒绝（进程不崩、返回可读文案） — {"threw":null,"message":"PDF too large: 300 MB > 256 MB","details":{"error":"PDF too large: 300 MB > 256 MB"},"sizeBytes":314572800}
[通过] F17-a2 拒绝文案含实际体积与上限（300 MB > 256 MB）
[通过] F17-a3 拒绝路径不回显超长错误（details.error 与文案同源且非空）
[通过] F17-a4 pdf_outline 同样拒绝超大文件
[通过] F17-b 正常 PDF 仍可读页文本（回归），且相对路径走 cwd 放行 — "PDF: <tmp>/sample-paper.pdf\nPages: 2\n\n--- page 1 ---\nSparse Attention for Long-Context Retrieval\nAbstract. We study retrieval over long documents.\n\n--- p"
[观测] 连调两次正常 PDF：耗时 9ms，setInterval(20ms) 最大间隔 0ms（仅读数）
[通过] F17-c src/main/pdf-tools.ts 零 readFileSync — []
# 首次运行（修复前形态）实红并暴露真实缺陷：
[失败] F17-b … — "Failed to read PDF pages: Please provide binary data as `Uint8Array`, rather than `Buffer`."
```

ui-shot 新增块静态作用域核验（`%TEMP%/pix-r15-b3/scope-check.mjs`，TS AST：块内标识符必须存在「早于使用点」的声明；另用两枚注入对照证明有判别力）：

```
[通过] F2/22f：引用 29 个标识符
[通过] F18/r15-f18：引用 24 个标识符
[通过] F13/r15-f13：引用 11 个标识符
作用域核验：全部通过
# 对照（有判别力）：注入未声明标识符 ⇒ 「未解析标识符」；把 clickElR15 换成后置声明的 clickEl ⇒ 「先用后声明（TDZ 风险）：clickEl@308813」
```

#### 4. 偏差表

| # | 条目 | 计划 | 实际 | 性质 / 处置 |
| --- | --- | --- | --- | --- |
| 1 | F17 第二份拷贝的删除方式 | 「删除 `new Uint8Array(file.byteLength)` 第二份拷贝（`Buffer` 即 `Uint8Array`）」 | 计划的前提不成立：pdf.js `getDataProp` 在 Node 下**明确拒绝** `Buffer` 实例（探针 F17-b 首跑实红：`Please provide binary data as Uint8Array, rather than Buffer.`）⇒ 改为 `new Uint8Array(file.buffer, file.byteOffset, file.byteLength)` 同底层视图（零拷贝；文件大于 Buffer 池时 pdf.js 亦走零拷贝分支，小文件由 pdf.js 内部复制一次，量级为池内小缓冲） | 修正计划的实现细节，达成计划的意图（去掉整份第二拷贝 + 异步读）；探针 F17-b 转绿后复核 |
| 2 | F2 相位编号 | 「建议编号 22c，插在 22b 之后、23 之前」 | `22c` 已被既有「写失败注入」相位占用（同函数不得重号）⇒ 新相位取 **22f**；实测插入点必须落在既有 22c 写失败相位**之后**（该相位依赖「当前第 2 页」前提，插在其前会把 `clickNext → waitPage(3,3)` 打断）⇒ 落在 22e 之后、23 之前（仍在「22b 之后、23 之前」区间内，且满足计划「收尾恢复 100% 不污染后续相位」） | 编号与插入点微调；截图名沿用计划指定的 `r15-22c-bottom-50.png` |
| 3 | F2 的缩小按钮选择器 | 「`SEL` 新增 `zoomOutBtn: '.pdf-toolbar button[title="缩小"]'`」 | 未新增 `SEL` 项，相位内直接内联同一选择器（`SEL` 是离屏脚本的冻结面之一，能不加项就不加） | 等价实现；恢复 100% 仍用既有 `SEL.zoomInBtn` |
| 4 | F17 `shared/limits.ts` 常量个数 | 「叶子常量，仅两个常量 + 注释」但同句列出 `MAX_PDF_BYTES` 与 `MAX_TEXT_ATTACHMENT_BYTES`/`MAX_IMAGE_ATTACHMENT_BYTES` | 落为 3 个 export（`MAX_PDF_BYTES` 被引用；两个附件常量标注「F17b 预留、数值随裁决调整」，本轮零引用、数值为占位 1 MiB / 10 MiB） | 计划自相矛盾处按「两个附件名都保留」落地；未新增依赖、未进 smoke 编译面（`required/allowed` 不变） |
| 5 | F18 失败提示文案 | 只要求「新增独立提示节点（建议 `.capture-error-hint`）」，未定文案 | 定稿为 `截图失败：页面内容尚未就绪，请稍后重试`（属新增用户可见文案）；样式与 `.capture-hint` 同形、位于其下方（top: 44px） | 按 §5 登记流程在本档登记（R15 无独立需求档）；`R15-fix.md` §5 R1 的旧值/新值语义一致 |
| 6 | F13 离屏记录 | 「可选离屏（仅覆盖渲染兜底，不代表 F13 本身）」 | 已落点 1 条 `r15-vision-fallback` 记录 + 截图，并在代码注释与本档双重标注性质 | 加强证据，不改 F13 判据归属（真机走查仍未执行，见 §5） |
| 7 | F5 文案渲染形态 | 「渲染为面板顶部 `.text-caption`/`v-alert`」 | 取 `v-alert type="info" variant="tonal" density="compact"`（与设置页既有 `variant="tonal"` 用法一致，Vuetify 3.12.7） | 计划给了二选一；无自动化断言（设置页无场景） |

#### 5. 未验证事项

1. **离屏（ui-shot）本批未跑**（派发禁令：留给复核步，避免并发占端口 5199）：F2 相位 22f、F18 场景、F13 兜底记录均只做静态核验（`node --check` + TS AST 作用域核验 + 冻结面行级比对），未实跑读数。两点已知风险留复核步观察：(a) 22f 的 50% 触底相位要求 `.pdf-scroll` 在 50% 下确实可滚动（相位内以防空断言显式判定：内容高 ≈ 3×(421+16)+96 ≈ 1407px vs 视口 ≈ 940px，且窗口为 `useContentSize: true` 的 1600×1000）；(b) F18 的合成 `pointerdown` 会因 `setPointerCapture` 抛 `NotFoundError` 在渲染层打一条 console error（组件状态在抛错前已置位，计划已声明「不以 console error 判定失败」）。
2. **F13 真机走查未执行**：设置里填不存在的视觉模型并开启 takeHerEyes → 发带截图提问 ⇒ 聊天流出现 `vision-status` 失败块；普通文本提问不出现该块；成功路径不受影响。无人值守环境无 GUI 载体；等价面为源码分支走查（§2 的正/反向清单）+ 渲染层兜底记录。
3. **F13 `errorMessage` 不呈现**：按计划保持 `visionStatusLabel` 逐字（失败块仍显示「视觉模型读取失败」），`errorMessage` 只进事件载荷与日志 ⇒ 登记为已知缺口（与 `R15-fix.md` §6 过程性登记第 2 条一致）。
4. **F5 无自动化回归网**：设置页无 ui-shot 场景、`mcpGetServers` stub 返回 `[]` ⇒ 面板级文案与白名单注释只有源码走查 + 内核源码实读（`sdk.js:157/281` 的 `allowedToolNames = options.tools`；`pi-mcp-adapter` 的 `mcp__<server>__<tool>` 命名）⇒ 未新建设置页场景（计划明确本轮不批），登记为已知缺口。
5. **F2 的「End 键」人工走查未执行**：合成 `KeyboardEvent` 不触发原生滚动，判据用 `scrollTop` 赋值 + 真实 `scroll` 事件驱动；`End` / `PageDown` 等键盘路径未在真机核对（无 GUI 载体）。
6. **探针时效**：`probe-f17-pdf.mjs` 与 `scope-check.mjs`（含两枚对照脚本）为一次性 `%TEMP%/pix-r15-b3` 产物，产出摘要后已删除；`pix/node_modules/.pix-r15-probe` 由探针自清理（实测已不存在）。如需复跑，按本档 §3 的命令与 §4 偏差 1/2 的说明重建。

#### 6. 批内自净

- `git status --short`：`pix/` 下改动 = B1/B2 的 20 个文件 + 本批 5 个（`session-bridge.ts` / `pdf-tools.ts` / `PdfViewer.vue` / `McpSettings.vue` / `ui-shot.mjs`），新增文件仅 `pix/src/shared/limits.ts`（白名单第 11 行）；无白名单外文件、无构建产物、无探针残留。
- 未执行任何 git 写命令（提交由负责人完成）。

---

## 终验（R15）

> 终验代理（冷启动）独立复核：只读源码 + 指定命令实跑 + 全新目录离屏取证（含 §4.2 允许的一次重跑）+ 截图目视 + 文档核对。未改任何源码/脚本（仅追加本小节）；未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未执行任何 git 写命令；两次取证串行、无并发（跑前已确认无 electron 进程）。

### 1. 白名单与零外溢（git 只读）

命令与结果：

```
git status --porcelain            → 22 个 " M"（源码/脚本）+ 12 个 "??"
                                    ?? = 11 份 docs/pm/R15-*.md + pix/src/shared/limits.ts（白名单第 11 行，新增）
git diff --stat -- packages/      → 空
git status --porcelain -- packages/ → 空
git diff -- pix/package.json pix/package-lock.json package.json package-lock.json → 空
find pix -maxdepth 2 -name "*.tsbuildinfo" -o -name "*.log" → 空
```

- 变更清单逐项对照 `R15-fix.md` §3 的 24 项白名单：命中 23 项（22 改 + 1 新增）；未触碰 `chat-files.ts`（F17b 条件降级未启用，符合方案）。
- `packages/*`、依赖字段、lockfile 零 diff；无构建产物与临时文件。
- 离屏跑完后再次 `git status --porcelain`：条目集合与跑前逐字一致（34 条）⇒ 取证产物只落 `PIX_SHOT_ROOT`，仓库零残留。

**结论：通过**（白名单一致、零外溢）。

### 2. 门槛命令（原样输出）

```
$ cd pix && npm run check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
EXIT=0（无 error 输出）

$ node scripts/smoke-notes.mjs
通过 65 / 失败 0
EXIT=0

$ node scripts/smoke-view.mjs
通过 35 / 失败 0
EXIT=0
```

（smoke-notes 65 = 基线 51 + B1 新增 14：`library-root-containment` 7 + `reader-state-store` 5 + `undo-slot-lifecycle` #7/#8。）

**结论：通过**（check 0 error；两烟测 0 失败）。

### 3. 离屏取证（全新目录）

命令（两次串行）：

```
cd pix && PATH="/c/Program Files/nodejs:$PATH" \
  PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r15-final" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs
```

- **尝试 1**：退出码 1；`MANIFEST.failure` = `等待超时：摘录浮层（document.querySelector(".quick-ask") …）`（`ui-shot.mjs:1764` `selectPageSpan` ← `runReaderStateScenarios:6992`，r11-3 相位 5）；产物 124 png。判定：与 R14 先例（`pix-v05-r14-base` / `-after` 两次同族超时）同一环境性 flake（S-SD-02 家族）；失败点在 R15 未触碰区间——`git diff -U0 scripts/ui-shot.mjs` 全部 hunk 不覆盖 6448–8795，该处代码逐字为基线 ⇒ 按 §4.2 重跑一次。
- **尝试 2**：退出码 0；`MANIFEST.failure === null`；`99-failure-state.png` 不存在；产物 **153 png**。
- 渲染层日志仅出现预期注入项：`[reader-state] save rejected (write-failed)`、`[reader-state] load degraded (corrupt)`、`[useRpc] Command prompt failed: stub 发送被拒绝`、合成 `pointerdown` 的 `NotFoundError`（F18 计划已声明不以 console error 判定失败），无其他异常。

零缺失比对（基线 `C:/Users/86157/AppData/Local/Temp/pix-v05-r14-final`：143 png / `failure=null` / MEASUREMENTS 211 条 / 51 label）：

- 帧名集合：143 ⊂ 153，**缺失 0**（无重名）；新增 10 帧：`45d-send-failure-restore.png`、`r15-22c-bottom-50.png`、`r15-22f-fitted-no-clamp.png`、`r15-clarify-replace.png`、`r15-f13-vision-failure-block.png`、`r15-f16-late-register.png`、`r15-f18-capture-failure.png`、`r15-f18-capture-success.png`、`r15-f9-recover-backup.png`、`r15-ime-guard.png`。
- MEASUREMENTS：本次 **223 条 / 59 label**；基线 label 缺失 0；新增 8 label / 12 条 = `page-tracking`×4、`composer-send`×1、`composer-ime`×1、`clarify-replace`×1、`r15-capture-region`×2、`r15-notes-recover`×1、`r15-vision-fallback`×1、`r15-workspace-late-register`×1。

新增断言逐条复算（读断言代码 + MEASUREMENTS 实测值，均非空断言）：

| 记录 | 实测值（原文摘录） | 复算 |
| --- | --- | --- |
| `page-tracking/bottom-clamp-50` | `zoom:50%`；触底后 `scrollTop 457`、`scrollHeight 1407 > clientHeight 950`；`page=第 3 / 3 页` | 通过（防空断言：50% 下可滚动 + scrollTop>0） |
| `page-tracking/top-back-50` | `page=第 1 / 3 页` | 通过 |
| `page-tracking/fitted-no-clamp` | `scrollHeight 3000 = clientHeight 3000`（不可滚动）；`page=第 1 / 3 页` | 通过（负向：修复前会被钳到末页） |
| `page-tracking/restored-100` | `zoom=100%`；`page=第 1 / 3 页` | 通过（相位收尾不污染后续） |
| `composer-ime/enter-guard` | 组合态 `sendCount 0`、值仍 `IME 测试`；非组合态 `sendCount 1`、值清空 | 通过（成对断言） |
| `composer-send/failure-restore` | `value=45d：失败后草稿应还原。`、`userBlocksRolledBack=true`、`sendDisabled=false`、`focused=true`；重发 `type=prompt`、值清空 | 通过 |
| `clarify-replace/replace` | 前置 `1 / 2`（推进后 `2 / 2`）；替换后 `inDom=true`、`progress=1 / 1`、`textareaDisabled=false`；撤销后 `cleared=false` | 通过 |
| `r15-capture-region/failure-keeps-mode` | 画布置零前 `595×842`、拖拽在层内；`layerInDom=true`、`errorHint=true`、`viewerCapture=true`、`fabPressed=true` | 通过（防空断言：置零前画布有尺寸 + 终点在层内） |
| `r15-capture-region/success-exits` | 画布还原 `595×842`；`layerInDom=false`、`chips=["截图 1 ×"]`、`errorHint=false` | 通过 |
| `r15-notes-recover/backup-path` | 文案 `已备份原文件并新建空库：C:\…\library\.pix-read\notes.json.bak`；`reveal=true`、title `在文件夹中显示备份文件`；`rows=0` | 通过（含 stub 备份名 `NOTES_FILE + ".bak"` 逐字） |
| `r15-vision-fallback/unavailable-end-without-start` | `before=[]` → `after=["视觉模型读取失败"]` | 通过（恰好多一个块；仅渲染兜底，不代表 F13 本身） |
| `r15-workspace-late-register/unmount-during-load` | `lateRegistered=0`、`lateUnregistered=0`、`lateHandlers=0`、`listSessionsDelta=0` | 通过（修复前迟到段会注册且无解绑） |

冻结面实读：

- 场景 43 steer 驱动（`ui-shot.mjs:2550`）`new KeyboardEvent("keydown", { key: "Enter", bubbles: true })` 未传 `isComposing`，逐字未动。
- 45/45B/45C 的 `userBlocksRolledBack`（`:4147/4196`）与 `stub 发送注入异常`（`:661`）逐字未动；45d 为追加记录。
- 相位 23 `warnDelta === 1`（`:2291`）逐字保留、本次实测 1；20b 改 `warnDelta20b === 0`（`:1843`，登记 R5）、实测 0；13d `.pix-read` 相位内基线断言与 `.capture-hint` 文案（`拖拽框选要提问的区域，Esc 取消`）实读未改。

**结论：通过**（退出码 0、`failure=null`、零缺失、10 帧增量、新增断言复算全部成立）。

### 4. 新增截图目视结论（4 张）

- `r15-22c-bottom-50.png`（F2）：工具栏缩放 `50%`；阅读区停在文档底部（`3. Ablation Study` / `4. Conclusion`）；底部页签 `第 3 / 3 页`；左树 `sample-paper.pdf 5 条 第 3 页`；章节 chip `2.2 Positional prior · 第 3 页`。修复前末页不可能是当前页 ⇒ 修复在截图上可见。
- `r15-ime-guard.png`（F1）：组合态回车后输入框仍为 `IME 测试`（未发送、未清空），页签 `第 1 / 3 页`，摘录 chip 与上下文未变。
- `r15-f18-capture-failure.png`（F18）：画布置零后合成拖拽 ⇒ 既有提示 `拖拽框选要提问的区域，Esc 取消` 下方出现新增红字 `截图失败：页面内容尚未就绪，请稍后重试`；框选按钮仍激活；页面区空白（画布已置零）、composer 无截图 chip ⇒ 失败时未退出模式。
- `r15-f9-recover-backup.png`（F9）：笔记面板提示 `已备份原文件并新建空库：C:\…\library\.pix-read\notes.json.bak` 并带 `在文件夹中显示` 入口；重建后为空库（`共 0 条`）。

### 5. PRD-V0.5 §7.5 与 R15-audit §3 落地核对

**§7.5 三个分句**：

1. 审查清单全部有结论：R15-audit 的 117 条发现全部有处置（20 条 F 表：F1–F19 修复落地、F20 降级 D；94 条 D + 2 条并入 F 的 P2）；R15-fix-review 的 21 条 must-fix 全部采纳（抽验 MF-1（`isLibraryDirAllowed` 根自入围）/MF-2（`:296` 可滚动前置）/MF-3（20b `warnDelta20b=0` + stub missing + fixture 清 `.corrupt-*`）/MF-5（`saveRename` catch + `abort` 保持静默）/MF-6（`ipc-handlers:366` 条件清根 + 路径归一化幂等）/MF-7（双根谓词、`isPathInsideDirectory` 逐字未动）/MF-13（`backupPath` 透传 + `notice-reveal`）/MF-14（copy-first）/MF-15（F19 纯函数入 smoke）/MF-16（F11 两用例探针）/MF-18（`R15-fix.md` §5 登记 R1–R11））。
2. `npm run check` 0 error：见 §2。
3. 零外溢：见 §1。

**§3 修复清单逐 F 落地（代码或断言证据）**：

| F | 证据（实读/实测） |
| --- | --- |
| F1 | `InputArea.vue:29` `if (e.isComposing) return;`；`ChatPanel.vue:708` `onRenameEnter` + `:1166` 模板改绑；`SettingsPage.vue:109/491` `onSaveKeyEnter`；离屏 `composer-ime` 通过 |
| F2 | `PdfViewer.vue:296` 触底钳制带 `scrollHeight - clientHeight > 1` 前置、写值 `readerStore.pageCount`；22f 四相位通过 |
| F3 | `settings-store.ts:88/96/101`（`openStore` 构造期 catch → `backupInvalidSettingsFile` → defaults 重建）、`sanitizeGuiSettings`；`index.ts:219` `dialog.showErrorBox("PiX-Read 启动失败", …)`；真实类探针（B1 §2） |
| F4 | `library-root.ts` 双根谓词 `contained/realPathOrNull`；`isPathInsideDirectory` HEAD 与工作树逐字相同（diff 仅新增）；smoke `library-root-containment` #1–#3 通过 |
| F5 | `McpSettings.vue:22/105` 面板级 `TOOLS_NOT_SHARED_NOTE`（v-alert）；`session-bridge.ts` 白名单只读边界注释；无自动化网（已登记） |
| F6 | `ChatPanel.vue:378-380` 三快照 + `:404-407` 三路还原（带「不覆盖在途新输入」）+ 焦点回填；离屏 45d 通过 |
| F7 | `renderer/stores/reader-state-store.ts:63/111/119/126/245` `saveEpoch` 世代令牌 |
| F8 | `ChatPanel.vue` 浅层 watcher（`pendingUserInput?.id ?? null`）复位进度与作答；离屏 `clarify-replace` 通过 |
| F9 | `main/notes-store.ts:541` copy-first + `:547` 失败回传路径；`renderer/stores/notes-store.ts` 类型透传；`NotesPanel.vue:403/408` 两文案 + `:579` `.notice-reveal`；smoke `undo-slot-lifecycle` #7/#8 + 离屏 `r15-notes-recover` 通过 |
| F10 | `renderer/stores/notes-store.ts:255` catch 首行 `startWriteSeq !== writeSeq` 守卫（成功分支 `:235` 同判据） |
| F11 | `session-bridge.ts:204/206-208` `_lifecycleChain`/`_enqueueLifecycle`（覆盖 start/newSession/switchSession/fork/navigateTree/dispose，`:213/242/301/322/339/409`）；`:217` 同 dir 幂等（`normalizeFsPath`）；`:1442` 订阅先解绑再挂；`ipc-handlers:366` 条件清根；`HomePage.vue:26/46/133` `opening` 守卫；真实桥探针 + 修复前对照（B2） |
| F12 | `main/reader-state-store.ts:237` missing 摘出降级、`:274` corrupt copy-first 备份、`:265-268` version-unsupported 拒写（error 逐字）；`renderer/stores/reader-state-store.ts:160-172` `!success` 分支；smoke `reader-state-store` #1–#5；离屏 20b=0 / 相位 23=1 通过 |
| F13 | `session-bridge.ts:1020` `images.length === 0` 早退 + `:1040` 配置完整性早退 + `:1050-1091` `emitUnavailable` 三分支；成功路径 `emitEnd` 未动；离屏兜底记录 `r15-vision-fallback` 通过 |
| F14 | `preload.ts:108` 仅签名 1 行改动，`PixApi` 方法数 HEAD/工作树均 42；`SettingsPage.vue:317-320` await + 失败回落；ui-shot stub 返回 `{success:true}` |
| F15 | `useRpc.ts` 7 命令改走 `sendCommandOrThrow`（`:324/342/358/363/430/445/454`）；`saveRename` catch（`ChatPanel.vue:701`）；`abort`（`:278`）保持 `sendCommand`（显式判定） |
| F16 | `WorkspacePage.vue:46/84/91/100/105/108/135` `disposed` 旗标；离屏 `r15-workspace-late-register` 读数为零 |
| F17 | `shared/limits.ts` 叶子模块（0 import；`library-root`/`notes-store`/`reader-state-store` 零反向依赖）；`pdf-tools.ts:35` 体积守卫、`:85` `await readFile`、零 `readFileSync`；探针 F17-a/b/c 通过（B3） |
| F18 | `PdfViewer.vue:567` `captureRegion(): boolean`、`:550` 失败置位并保留模式、`:948` `.capture-error-hint` 提示节点；离屏双向记录通过 |
| F19 | `ipc-handlers.ts:424-444` 四段守卫（类型 → no-root → `isLibraryDirAllowed`（根自入围）→ stat 两分）；`library-open-path` 复用 `guardLibraryPath`；smoke `library-root-containment` #4–#7 通过 |
| F20（降级 D） | `session-bridge.ts` 的 `_applyEnabledModelScope` / `_resolveScopedModels` 区域零 diff（`git diff` 无该两符号）⇒ 未落地，与降级登记一致 |

**§7.5 字面项的诚实记录**：

- 「仓库无死代码」：R15-audit §4.4 的 64 条 P2（含 M10 死代码包）按「登记不修 + 写明理由」口径收敛，字面未达成（属本轮方案的明示裁决，非遗漏）。

### 6. 终验结论

- check 退出码：**0**；两烟测：**65 / 0**、**35 / 0**。
- 截图数：**153**（基线 143 缺失 0，新增 10）。
- 断言数：**223 条 / 59 label**（基线缺失 0，新增 12 条 / 8 label）。
- 未销账 must-fix：**0**（R15-fix-review 的 21 条全部采纳并有落地证据；见 §5 抽验）。
- 是否可提交：**可提交**。提交范围 = `R15-fix.md` §3 白名单的 23 个源码/脚本文件（22 改 + `pix/src/shared/limits.ts` 新增）+ 11 份 `docs/pm/R15-*.md` 文档；不得包含任何产物（`shots/`、fixture 库、编译产物均在 `%TEMP%`）。
- 视觉结论：F1（IME 草稿保留）、F2（50% 触底 = `第 3 / 3 页` 且树徽标同步）、F9（备份路径透传 + 「在文件夹中显示」）、F18（失败保留框选模式 + 红字提示）四处在截图上与断言一致，无异常视觉残留。

**登记缺口（非阻断，均已在上文或方案 §6 登记）**：

1. F3 / F5 / F11 / F13 / F14 / F15 / F19 的真机走查未执行（本环境无人值守、无 GUI 载体）；等价证据：F3 真实类探针（真实 `conf`/`electron-store`）、F11 真实 `SessionBridge` 探针 + 修复前同 harness 对照、F19 纯函数入 smoke、F13 源码正/反向清单 + 渲染兜底记录、F5 内核源码实读、F14/F15 探针 + 渲染节点走查。
2. F7 / F10 的渲染 store 探针为一次性 `%TEMP%` 产物（按 `R15-fix.md` 附录 A 路线，仓库零残留）⇒ 该两处无仓库内回归网；与 fix-review MF-19 的字面要求存在差距，属方案定稿路线（附录 A）的既定取舍。
3. F17b（`chat-files.ts` 附件上限）条件降级未实施；F13 `errorMessage` 不进 UI；F5 面板文案无自动化回归网；F19 handler 装配无自动化 harness。
4. 已知 flake：本次尝试 1 在既有 r11-3 相位 5 超时（S-SD-02 家族），按 §4.2 重跑一次后全绿；建议下轮按 `ensureQuickAskExcerptReady` 范式把相位 5 也改为有界重取。

---

### F20 降级处置（收尾）

> 派发：R15 收尾修复代理，销账 `docs/pm/R15-review.md` §5 的唯一 must-fix（F20 降级处置未落地：warn + dev 档登记）。只改 `pix/src/main/session-bridge.ts` 与本文档；未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未执行任何 git 写命令。

#### 1. 降级为 D 的理由（沿用 `R15-fix.md` F20 条与 §6，本轮复核确认理由不变）

1. 修法在主要路径（会话创建期调用点）是 no-op：新会话 `_scopedModels` 默认空数组，「不清空」与清空等价；
2. 判据「列表不变成全部」在创建路径不可能通过；
3. 「保留上一次」仅在 live 重算路径有效，且与内核分叉——内核 `model-resolver` 在 0 命中时同样回退为全部模型，只是有 warn；
4. 收益退化为「补一行 warn + 文档登记」，不足以占用在册名额 ⇒ 降级为 D（确定）。

#### 2. 落地内容

| 项 | 位置 | 内容 |
| --- | --- | --- |
| 代码（warn 行） | `pix/src/main/session-bridge.ts:1205-1210` 的 `_applyEnabledModelScope`（warn 语句在 `:1208`） | `_resolveScopedModels` 返回空数组（原 `enabledModels` 非空但 0 命中）时，先输出一行 `console.warn`：`[SessionBridge] enabledModels 未命中任何模型，已回退为全部模型：<patterns 逗号连接>`（中文，含未命中的 patterns，粒度为「一次调用一行」；内核 `model-resolver` 为逐 pattern 一行英文 `Warning: No models match pattern`，语义一致、粒度不同） |
| 文档登记 | 本文档本节 | F20 降级事实 + 不改行为的契约分叉 + 真实命令输出 |

**不改行为的核对**：改动前后 0 命中路径都恰调用一次 `session.setScopedModels([])`（同一数组引用）；非 0 命中路径的调用参数与次数逐字不变；未抛错、未改 UI 文案、未改事件/协议、未触冻结面——`git diff -U6` 该 hunk 仅本次的 +4/-1（`const scopedModels` 中间变量 + warn 三行），`_resolveScopedModels` 及相邻代码零 diff。

#### 3. 不改行为的契约分叉登记（PiX vs 内核 `model-resolver`）

| 维度 | 内核 `resolveModelScope` | PiX `_resolveScopedModels` | 影响 |
| --- | --- | --- | --- |
| 0 命中处置 | 回退为全部模型 + 逐 pattern `console.warn` | 回退为全部模型 + 一行 warn（列出全部 patterns） | 行为一致（都回退），仅日志粒度不同 |
| glob 语法 | `*` / `?` / `[`（minimatch） | 仅 `*` / `?`（`globPatternToRegExp`），**无 `[]` 字符类** | 含 `[...]` 的 pattern 在 PiX 不命中 ⇒ 本分叉 |
| 部分匹配 | 逐段剥离冒号后缀试配（兼容 `model:exacto` 类 id） | 仅「provider/id 全等」或「id 全等」（大小写不敏感），**无部分匹配** | 内核能匹配的宽松写法在 PiX 不命中 |
| 别名 | 优先别名、否则取最新日期版 | **无别名**逻辑 | 同名多版本时选择可能不同 |
| 思考档后缀 | `:level` 后缀统一处理 | `_parseScopedModelPattern` 同构支持 `:level` | 一致 |

以上分叉本轮**不做跨仓对齐**（`R15-fix.md` §6：「跨仓对齐不做」）；只为「0 命中回退」补日志，若下轮启用对齐需按本表逐项给判据。

#### 4. 真实命令与输出（本收尾步实跑）

```
cd pix && npm run check                 → exit 0（vue-tsc + tsc main + tsc preload 三连无 error）
node scripts/smoke-notes.mjs            → 通过 65 / 失败 0（exit 0）
node scripts/smoke-view.mjs             → 通过 35 / 失败 0（exit 0）
```

#### 5. 未验证事项

1. 新 warn 路径**无自动化断言**：ui-shot 无设置页/模型选择器场景，smoke 编译面不含 `session-bridge.ts`；触发该路径需真实 0 命中 `enabledModels`（如 pattern 全部拼错），本轮未构造运行期探针（需完整桥 harness，超出收尾步预算）。
2. 真机上「`enabledModels` 设为不存在 pattern 时日志出现且模型列表回退为全部」未实跑（无人值守、无 GUI 载体）；本轮等价面为代码走查 + 类型检查。

