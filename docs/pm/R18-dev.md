# PiX-Read R18 开发档 · 对话锚定（N100–N103）

> 上游：`docs/pm/R18-req.md`（含 §0 定稿修订 MF1–MF10）、`docs/pm/R18-design.md`（含「定稿修订（R18）」MF1–MF3）、`docs/pm/R18-review.md`（需求评审 / 设计评审）。
> 分工：A 代理 = 数据面（字段 / 主进程 / 渲染层 store / 烟测），B 代理 = 交互面（`ReaderPanel.vue` / `ChatPanel.vue` / `WorkspacePage.vue` / `scripts/ui-shot.mjs`）。
> 本档当前只含 **A 面**；B 面（含 12 张新增截图的逐张登记、离屏 5 场景读数、`#append` 槽的 DOM 差异登记）由 B 代理追加在同一文件。
> 本步实跑（全部为真实命令输出）：`cd pix && npm run check` ⇒ `CHECK_EXIT=0`（3 次）；`node scripts/smoke-notes.mjs` ⇒ `通过 71 / 失败 0`（2 次，退出码 0）；`node scripts/smoke-view.mjs` ⇒ `通过 74 / 失败 0`（2 次，退出码 0）；`%TEMP%` 旧格式探针 13/13 通过（退出码 0，脚本与临时目录已删除）。**未跑离屏 / 未跑 build / package / dev。**

## A. 数据面（字段、主进程、渲染层 store、烟测）

### A.1 交付文件与改动点

| # | 文件 | 动作 | 改动点（与设计档 §1.1 / §1.2 逐条对齐） |
| --- | --- | --- | --- |
| A1 | `pix/src/shared/types.ts` | 修改（+8 行） | `ReaderDocState`（`:472-476` → `:472-482`）与 `ReaderStateSaveDraft`（`:492-496` → `:496-506`）各追加可选字段 `lastSessionPath?: string` / `lastSessionAt?: number`（逐字注释与设计档 §1.1.1 相同）；`ReaderStateFile` / 错误码 / 降级原因 / 结果类型零改动 |
| A2 | `pix/src/main/reader-state-store.ts` | 修改（+25 / -3 行） | 新增 `MAX_SESSION_PATH_LENGTH = 2048`（紧随 `MAX_SCALE`）；新增 `isValidSessionPath` / `isValidSessionAt`（紧随 `isValidScale`）；`parseDocState` 成对带回两键；`saveReaderState` 新增 `previous` / `carried` 与目标条目构造（键序 `page` → `scale` → `updatedAt` → `...carried`） |
| A3 | `pix/src/renderer/stores/reader-state-store.ts` | 修改（+69 / -6 行） | 内部 `interface DiscussionStamp`、导出 `interface DiscussionLink`；`applyLocal(next, stamp = null)` 的「携带 ⇒ 覆盖 / 未携带 ⇒ 保留」；`submit(next, stamp = null)` 的 payload 条件展开（唯一 `readerStateSave` 调用点与唯一 `saveEpoch` 守卫）；动作 `noteDiscussion(absPath, page, scale, sessionPath)`；computed `currentDiscussion`；顶层 import `computed` / `docDisplayName` / `docPathKey` / `deriveSessionTitle`；返回对象新增 `currentDiscussion` 与 `noteDiscussion` |
| A4 | `pix/scripts/smoke-notes.mjs` | 修改（+213 行，0 删除行） | `runReaderStateStore` 内追加夹具 `SESS` / `T` / `SESS_B` / `T_B`、局部 helper `hasOwn` / `writeStateA` 与断言 #6–#11（`grep -c "  check("` 65 → 71）；既有 #1–#5、其它 9 组、`files` / `required` / `allowed` / 编译选项零改动 |

**未改动（与设计档 §4「不改」逐条一致）**：`pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`、`pix/src/main/session-bridge.ts`、`pix/src/renderer/stores/{session-store,project-store,reader-store}.ts`、`pix/src/renderer/utils/session-title.ts`、`pix/scripts/smoke-view.mjs`、`pix/package.json`。A 面未触碰任何 `.vue` 文件（`grep -rn "reader-discuss\|session-doc-mark" pix/src/renderer/components` = 0 / `grep -rn "noteDiscussion" pix/src/renderer/components` = 0，留给 B 面）。

### A.2 唯一工程门与烟测（实跑读数）

| 命令 | 读数 | 期望 | 结论 |
| --- | --- | --- | --- |
| `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` | `CHECK_EXIT=0`（动工前基线 1 次 + A2 后 1 次 + A3 与注释改字后 1 次） | 0 error | 通过 |
| `cd pix && node scripts/smoke-notes.mjs` | `通过 71 / 失败 0`、`SMOKE_NOTES_EXIT=0`；连跑两次末 3 行逐字相同 | 71 / 0 | 通过 |
| `cd pix && node scripts/smoke-view.mjs` | `通过 74 / 失败 0`、`SMOKE_VIEW_EXIT=0`；连跑两次末行逐字相同 | 74 / 0（零改动回归） | 通过 |
| `%TEMP%` 旧格式探针（一次性脚本，运行后删除） | `PROBE_RESULT ALL_PASS (13/13)`、`PROBE_EXIT=0`；脚本删除后 `grep -c "pix-r18-a-probe"` = 0（目录内零残留） | 全绿 | 通过 |

### A.3 走查判据（设计档 §1.6 的 A 面部分，逐条实读）

| 判据 | 命令 | 实读 | 期望 |
| --- | --- | --- | --- |
| 现场字段实现点 | `grep -rn "lastSessionPath" pix/src \| wc -l` | 13 | ≥ 4 |
| 组件内零字面泄漏 | `grep -rn "lastSessionPath\|lastSessionAt" pix/src/renderer/components \| wc -l` | 0 | 0 |
| 长度上限唯一定义 | `grep -c "MAX_SESSION_PATH_LENGTH = 2048" pix/src/main/reader-state-store.ts` | 1 | 1 |
| 渲染层不得复制上限 | `grep -rn "MAX_SESSION_PATH_LENGTH" pix/src/renderer \| wc -l` | 0 | 0 |
| 零新 IPC（单文件口径） | `grep -c "reader-state-save" pix/src/main/ipc-handlers.ts` | 1 | 1（与基线相同） |
| 零新 IPC（跨目录口径） | `grep -rn "reader-state-save" pix/src \| wc -l` | 2 | 2 |
| IPC 面零 diff | `git diff --numstat -- pix/src/main/ipc-handlers.ts pix/src/main/preload.ts \| wc -l` | 0 | 0 |
| 提交路径唯一（MF6） | `grep -c "readerStateSave" pix/src/renderer/stores/reader-state-store.ts` | 1 | 1 |
| 动作定义 + 暴露 | `grep -c "noteDiscussion" pix/src/renderer/stores/reader-state-store.ts` | 2 | 2（定义 1 + 返回对象 1） |
| 派生单点 + 暴露 | `grep -c "currentDiscussion" pix/src/renderer/stores/reader-state-store.ts` | 2 | 2 |
| 页面层零泄漏 | `grep -rn "currentDiscussion" pix/src/renderer/pages \| wc -l` | 0 | 0 |
| 组件内不读 documents | `grep -rn "documents\[" pix/src/renderer/components \| wc -l` | 0 | 0 |
| 主进程函数体零新增 await | `grep -c "await" pix/src/main/reader-state-store.ts` | 1 | 1（仅头部注释） |
| 烟测条数 | `grep -c "  check(" pix/scripts/smoke-notes.mjs` | 71 | 71（65 → 71） |
| 烟测纯追加 | `git diff -U0 -- pix/scripts/smoke-notes.mjs \| grep -cE "^-[^-]"` | 0 | 0 |
| 渲染烟测零改动 | `git diff -- pix/scripts/smoke-view.mjs \| wc -l` | 0 | 0 |
| 既有冻结字面 | `grep -rn "reader-resume" pix/src \| wc -l` / `pill-session` / `session-delete-btn` / `历史对话` | 3 / 3 / 4 / 2 | 3 / 3 / 4 / 2（全部保持） |
| 降级面零 diff | `git diff -U0 -- pix/src/main/reader-state-store.ts \| grep -E "^[+-].*(DEGRADE_MESSAGES\|ERROR_MESSAGES\|uniqueBackupPath\|writeFileAtomic\|resolveLastDoc\|toRelativeDocPath\|isStoredDocPath\|parseReaderState)"` | 无输出（exit 1） | 无输出 |
| 新增行落点 | `git diff -U0 -- pix/scripts/smoke-notes.mjs \| grep -E "^@@"` | 仅 `@@ -1230,0 +1231,7 @@` 与 `@@ -1317,0 +1325,206 @@`（两处均在 `runReaderStateStore` 内） | 只出现在该组内 |
| 工作树范围 | `git status --short` | 4 个修改文件（A1–A4）+ 3 个未跟踪文档（R18-req / R18-review / R18-design） | 白名单内 |

### A.4 旧格式现场文件兼容实测（%TEMP%：读 → 写 → 再读）

两条独立证据，均在 `%TEMP%` 下构造旧文件（条目只有 `page` / `scale` / `updatedAt`）：

1. **烟测 #8（`smoke-notes.mjs`，`TMP = <os.tmpdir()>/pix-smoke-notes-<ts>`）**：写入旧格式文件 → `loadReaderState()` → 一次不带两键的 `saveReaderState({page: 2, scale: 1})` → 再 `loadReaderState()`。断言：全程 `degraded === false`、`reason === undefined`、`[reader-state]` warn 增量 0；首次读与再读后 `lastSessionPath` / `lastSessionAt` 的 `hasOwnProperty` 恒为 `false`（读侧不造字段、写侧不凭空补字段）；再读后既有字段不丢（`page === 2` / `scale === 1`）。
2. **独立探针（一次性脚本 `%TEMP%/pix-r18-a-probe.mjs`，运行后已删除）**：同样编译真实 `reader-state-store.ts` 驱动，13 条断言全通过：
   - 读旧文件：`success:true` + `degraded:false` + `reason undefined`、既有字段不丢（`page 3` / `scale 1.5`）、两键不存在、warn 增量 0；
   - 写（未携带）：成功且磁盘为 `page 4` / `scale 1.25`、仍无两键、warn 增量 0；
   - 再读：`degraded:false`、字段不丢（含 `updatedAt` 有限）、两键仍不存在、warn 增量 0；
   - 正向对照：携带合法对 ⇒ 磁盘与回读逐值相等（库外绝对路径原样、未被相对化）、warn 增量 0。

### A.5 登记：与设计档的实现级差异（逐项）

| # | 设计档原文 | 实际实现 | 理由与影响 |
| --- | --- | --- | --- |
| 1 | §1.2.1 的 `DiscussionLink.title` 注释逐字 `/** 会话标题（deriveSessionTitle，与「历史对话」菜单同一规则）。 */` | 注释改字为 `/** 会话标题（deriveSessionTitle，与历史会话菜单同一规则）。 */`（仅注释，类型 / 字段 / 语义逐字不变） | 该注释会让设计档 §0.1 / §1.6 冻结的 `grep -rn "历史对话" pix/src \| wc -l` = **2** 变成 3（判据优先）。实读复核：改字后该计数 = 2；`DiscussionLink` 的四个字段与语义与设计档逐字一致 |
| 2 | §5.2 夹具只列 `SESS` / `T` / `SESS_B` / `T_B` 四个常量 | 另加两个组内局部 helper：`hasOwn(target, key)`（`Object.prototype.hasOwnProperty.call` 的短名）与 `writeStateA(file)`（按 `JSON.stringify(…, null, 2) + "\n"` 写目标文件） | 断言文本不变；helper 只在 `runReaderStateStore` 内、不进产物代码；避免 9 条越界形态各抄一遍写盘语句 |
| 3 | §5.2 #8 步骤为「写旧格式 → load → 一次不带两键的 save」 | 追加第三次 `loadReaderState()`，判据要求「读 → 写 → 再读」全程 `degraded:false` 且再读后字段不丢 | 判据只增不减（仍是一条 #8 断言）；直接兑现「旧文件字段不丢且不触发降级」的实测口径 |
| 4 | §5.2 #11 为一行的（a）+（b）两段 | 实现为**一条** `check(G, 11, …)`，内部先跑（a）再跑（b），warn 增量按段各自复位（（a）的 load warn 增量 = 1，save 的备份 warn 不计入；与 N6 的增量口径一致） | 保持「6 条断言 / 索引 6…11 / 总 71」的冻结配额 |
| 5 | §0.3 谓词落点「紧随 `isValidScale` `:101-103` 之后」 | 落点一致（现 `:107-116`）；`MAX_SESSION_PATH_LENGTH` 紧随 `MAX_SCALE`（现 `:32-33`） | 与设计档逐字一致，仅行号随插入位移 |
| 6 | §0.3 `MAX_SESSION_PATH_LENGTH` 在 stub 内「刻意重复」 | 未做（属 B 面 `ui-shot.mjs` 白名单） | 登记：A 面不触碰 `ui-shot.mjs`；该重复由 B 面落地 |

### A.6 风险 Top3 的 A 面判定证据

| 风险 | A 面证据 |
| --- | --- |
| R1 读-改-写把其它文档的记录吃掉 | 烟测 #6（回读）/ #7（第二条目两键与 page/scale 逐字不变，目标条目未携带时保留既有对）；#10（读侧成对裁剪不丢合法对）；`git diff` 中 `parseDocState` 只增 `+` 行 |
| R2 入口指向错的东西 / 点不开 | A 面提供 `currentDiscussion` 的唯一解析（不命中清单 ⇒ `null`，静默）；`noteDiscussion` 五条静默守卫 + 只经 `submit()` 提交（`grep -c "readerStateSave"` = 1）；「同一页同一缩放第二次发送照写」由「不进 `snapshot` / `committed`」保证；交互面证据由 B 面的 `r18-*` 覆盖 |
| R3 旧文件与既有链路被新字段破坏 | 烟测 #8（旧格式读→写→再读：零降级 / 零 warn / 不造字段）+ #9（9 种越界与半截形态静默丢弃、无半截字段）+ #11（corrupt / version-unsupported 回归，备份增量口径）；独立 `%TEMP%` 探针 13/13；`grep -c "await"` = 1；降级面零 diff |

### A.7 未决项（A 面）

1. **B 面依赖的签名与字面已冻结**：`noteDiscussion(absPath: string | null, page: number, scale: number, sessionPath: string | null): void`、`currentDiscussion`（`DiscussionLink`）、`submit` / `applyLocal` 的可选第二参数。B 面若需改动签名，必须回改 A 面并重跑 A 面两条烟测。
2. **未执行项**：离屏 `ui-shot.mjs`（基线 / 验收两轮）、`npm run build` / `npm test` / `npm run package` / `npm run dev` 均未跑（本步禁止或按纪律不需要）；`smoke:notes` / `smoke:view` 已实跑（见 A.2）。
3. **交接给 B 的既有事实**：`pix/src/renderer/components` 内当前 0 处 `noteDiscussion` / `lastSessionPath` 字面（A 面未触碰组件）；`ui-shot.mjs` 的 `SEL` 与 stub 增量（§1.5.2 的 9 处）全部待 B 落地。

---

## B. 交互面（ReaderPanel / ChatPanel / WorkspacePage / 离屏取证）

> 本步实跑（全部为真实命令输出）：`cd pix && npm run check` ⇒ `CHECK_EXIT=0`（2 次：三个组件落地后 / 离屏与烟测前）；`node scripts/smoke-notes.mjs` ⇒ `通过 71 / 失败 0`；`node scripts/smoke-view.mjs` ⇒ `通过 74 / 失败 0`；`PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v06-r18-after ./node_modules/.bin/electron scripts/ui-shot.mjs` ⇒ `AFTER_EXIT=0`、产出 **186** 张、`MANIFEST.failure === null`。**未跑 build / package / dev；未改 `packages/*`；未引入依赖。**

### B.1 交付文件与改动点

| # | 文件 | 动作 | 改动点（与设计档 §1.2 / §1.3 / §1.4 逐条对齐） |
| --- | --- | --- | --- |
| B1 | `pix/src/renderer/components/workspace/ReaderPanel.vue` | 修改（+58 / -1 行） | 顶层 import 增 `docPathKey`（并入既有 `notes-path` 行）与 `formatSessionTime`（新行 `session-title`）；`defineEmits` 增 `"open-session": [path: string]`；`discussEntry`（四闸：`currentDiscussion` null ⇒ 隐 / 活动会话比较键相等 ⇒ 隐）+ `discussLabel`（一条复用串）+ `openDiscussion()`；`.map-toggle` Teleport **之后**新增 `.reader-discuss` Teleport（`v-if="mapToggleReady && discussEntry"`）；三条样式插在 `.map-toggle:disabled` 与 `.reader-main` 之间 |
| B2 | `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改（+37 / -3 行） | 顶层 import 增 `useReaderStateStore` 与 `docPathKey`；`docRelatedPath` / `docRelatedTitle` / `isDocRelatedSession`（只读 `currentDiscussion`）；`send()` 快照段增 `readScale` + `sendingSessionPath`（与既有 `readFilePath` / `readPage` 同段、各只读一次），`return;` → `if/else`，try 尾部单一 `readerStateStore.noteDiscussion(readFilePath, readPage, readScale, sendingSessionPath);`；`#append` 槽由模板级 `v-if` 改为槽常驻 + `.session-delete-btn` 自带同一条 `v-if`，槽内**删除按钮之前**新增 `.session-doc-mark`；样式 `.session-doc-mark` 插在 `.session-delete-btn.armed` 与 `.chat-messages` 之间 |
| B3 | `pix/src/renderer/pages/WorkspacePage.vue` | 修改（+10 行） | `onOpenDiscussionSession(sessionPath)`（比较键解析 + 两条 no-op 守卫 + `void onSwitchSession(session)`）；`<ReaderPanel>` 增 `@open-session="onOpenDiscussionSession"`；既有 `onSwitchSession` / `goHome` / watcher 等零改动 |
| B4 | `pix/scripts/ui-shot.mjs` | 修改（+774 / -6 行） | `SEL` +2（`readerDiscuss` / `sessionDocMark`，72 → 74）；stub 9 处（§1.5.2 逐字）；7 个新 helper + `discussTimeAllowSet` + 5 个场景级只读探针（`entryTextOf` / `entryTitleOf` / `deleteTitleOf` / `switchCallsNow` / `waitPillSession`）与 `menuItem`、`SESSIONS_A` / `SESSIONS_GHOST` / `PAST_AT` / `SEED_AT`；5 个场景 11 条 record / 12 张截图；另：`map-chapter-filter` 的 `injection` 相位一处既有断言的**最小改写**（见 B.7 #4） |

**未改动（与设计档 §4「不改」逐条一致）**：`pix/src/main/{ipc-handlers,preload,session-bridge}.ts`、`pix/src/renderer/stores/{session-store,project-store,reader-store}.ts`、`pix/src/renderer/utils/{session-title,notes-path}.ts`、`pix/scripts/smoke-view.mjs`、`pix/package.json` / lockfile / `packages/**`（`git diff --numstat` 全为 0 行）。

### B.2 唯一工程门与烟测（实跑读数）

| 命令 | 读数 | 期望 | 结论 |
| --- | --- | --- | --- |
| `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` | `CHECK_EXIT=0`（2 次） | 0 error | 通过 |
| `cd pix && node scripts/smoke-notes.mjs` | 末行逐字 `通过 71 / 失败 0`、`SMOKE_NOTES_EXIT=0` | 71 / 0 | 通过 |
| `cd pix && node scripts/smoke-view.mjs` | 末行逐字 `通过 74 / 失败 0`、`SMOKE_VIEW_EXIT=0` | 74 / 0（零改动回归） | 通过 |

### B.3 离屏取证（验收轮）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v06-r18-after" ./node_modules/.bin/electron scripts/ui-shot.mjs
echo "AFTER_EXIT=$?"   # ⇒ 0；末行「结束：产出 186 张截图」
```

| 项 | 基线（`pix-v06-r17c-review`，只读复读） | 验收（`pix-v06-r18-after`） | 判据 |
| --- | --- | --- | --- |
| 截图数 / failure | 174 / `null` | **186** / **`null`** | 零缺失 + 新增 12 |
| 截图集合差 | —— | `missing: []`、`added: 12`、`r18: 12` | 既有 174 张**零缺失**、新增 12 张齐备 |
| label 种类 / 条数 | 69 / 253 | **74** / **264** | 既有 69 种 label **零缺失**；新增 5 种 11 条 |
| 新增 label 条数 | —— | `r18-discuss-entry:3`、`r18-old-format:2`、`r18-session-missing:2`、`r18-workspace-isolation:2`、`r18-session-mark:2` | 与设计档 §1.5.1 配额逐字一致 |
| 产物目录白名单 | —— | 仅 `*.png` + `MANIFEST.json` + `MEASUREMENTS.json` | 无杂项文件 |

**环境与偶发项（登记）**：同一份代码的 **6 次离屏尝试**（含两次因断言口径而红的轮次）中，既有 `map-scale` 相位的耗时断言（`.map-toggle` → 220 行 ≤ 800ms）红 **2** 次（966ms / 973ms）、绿 2 次（最终绿轮读数 **90ms**）；历史四轮同相位读数 80 / 87 / 95 / 119ms。红轮期间机器上有用户自己的 `E:\pix\PiX.exe`（4 进程，11:41 启动）与 `MsMpEng` 占 CPU、空闲内存仅 ~3.1GB；同轮次内 `reader-state-writes/thirty-changes` 耗时 92ms（历史 89ms）正常 ⇒ 判为**环境负载导致的一次性慢帧**，未改该既有断言的阈值，也未改产品代码（详见 B.9）。

### B.4 r18 场景读数（11 条 record 的关键值，均取自 `MEASUREMENTS.json`）

| 组 / 相位 | 关键读数 |
| --- | --- |
| `r18-discuss-entry` / `send-records` | 发送后条目 = `{page:1, scale:1, updatedAt:…, lastSessionPath:<A>/.pix-read/session-demo.jsonl, lastSessionAt:…}`；末条 payload 同两键；**第二条目**（`archive/older-paper.pdf`）两键逐字仍为 `session-b.jsonl` / `1758000001000`；入口计数 0（活动会话 = 记录会话）；warn 增量 0 |
| `r18-discuss-entry` / `entry-visible-and-click` | 入口文本 `继续讨论：摘录与笔记走查 · 刚刚`、`title` = 文本 + `；点击打开该会话`；`.reader-discuss` 恰 1 个、`tagName=BUTTON`、图标含 `mdi-forum-outline`；`.pill-label`=`sample-paper.pdf`、`.map-toggle` 在场；点击后 `switch_session` 末项 = `session-demo.jsonl`、pill 由 `消融实验对照` → `摘录与笔记走查`、重开菜单该行 `active=true`；文件 sha 不变、`saveCalls` 增量 0；页码 `第 1 / 3 页` 与缩放 `100%` 逐字不变；入口计数 0 |
| `r18-discuss-entry` / `send-failed` | 错误块 `stub 发送被拒绝`；两键逐字不变（`lastSessionAt` 与相位 1 相等）；入口文本逐字不变；`sendCalls=1` |
| `r18-old-format` / `old-format-silent` | `.reader-resume` 逐字 `继续阅读：sample-paper.pdf · 第 2 页`；入口 0；warn 增量 0；`hasOwnProperty(lastSessionPath)=false` |
| `r18-old-format` / `open-switch-no-write` | 翻页后 `page=3`、`scale=1`、`updatedAt > SEED_AT` 且**仍无**记录键；切换会话后仍无；入口 0；warn 增量 0 |
| `r18-session-missing` / `session-gone` | 入口 0；`.center-pill .reader-discuss` 0 / `.chat-panel .session-doc-mark` 0；菜单标记 0；两键逐字保留；warn 增量 0 |
| `r18-session-missing` / `session-restored` | 入口恢复 `继续讨论：丢失后恢复的会话 · 昨天`（`title` 同范）；菜单标记恰 1 且 `title` 逐字 `最近讨论：sample-paper.pdf`；现场 `page=1` 与两键逐字不变 |
| `r18-workspace-isolation` / `workspace-b` | B 侧入口 0；B 条目 `{page:1, scale:1, updatedAt}`（无记录键）；B 菜单 4 行含两个会话标题；标记 0；A 文件 sha 不变；warn 增量 0 |
| `r18-workspace-isolation` / `back-to-a` | 入口恢复 `继续讨论：摘录与笔记走查 · 昨天`；两键逐字不变（`pairSame=true`） |
| `r18-session-mark` / `mark-visible` | 标记恰 1（活动行 `摘录与笔记走查`，`title=最近讨论：sample-paper.pdf`）；`消融实验对照` 行 `marked=false`；菜单文案含 `新对话` / `重命名当前对话` / `历史对话`；`.session-delete-btn` 恰 1（`title=删除该对话`）；入口 0 |
| `r18-session-mark` / `mark-absent` | `long-book.pdf` 下标记 0 且入口 0；切回后标记恢复（`title` 逐字）；入口仍 0；`pairSame=true`；warn 增量 0 |

### B.5 逐张目视登记（12 张，`read` 工具逐张目视）

| # | 截图 | 目视结论 |
| --- | --- | --- |
| 1 | `r18-1-send-records.png`（整窗） | 发送成功；中心 pill = `sample-paper.pdf` + 地图 / 快捷键两枚既有图标且**无**入口；会话 pill = `摘录与笔记走查`；正文 `第 1 / 3 页` / `100%` 与发送前一致；页脚「本页 1 条」标记在场 |
| 2 | `r18-1b-discuss-entry.png`（`.center-pill` 裁切） | 顺序 = `sample-paper.pdf` → 地图图标 → 快捷键图标 → 入口胶囊（`继续讨论：摘录与笔记走查 · 刚刚`）；`.pill-label` 完整可辨（未截断、不与入口重叠）；三者同排不换行、不溢出 pill 圆角 |
| 3 | `r18-1c-discuss-switched.png`（整窗） | 右侧会话 pill 已变为 `摘录与笔记走查`；阅读区页码 / 缩放与点击前一致（不切页、不改缩放）；中心 pill 内无入口 |
| 4 | `r18-1d-send-failed.png`（整窗） | 错误块（`! 错误 send / stub 发送被拒绝`）可见；入口仍在（记录未被失败发送改写）；composer 草稿逐字回填 |
| 5 | `r18-2-old-format.png`（整窗） | 空态区 `.reader-resume` 逐字 `继续阅读：sample-paper.pdf · 第 2 页`；`.center-pill` 内**无**入口；无任何错误 / 提示 |
| 6 | `r18-2b-open-switch.png`（整窗） | 打开并翻到 `第 3 / 3 页` 后阅读区**无**入口；会话菜单已关闭；左树行显示「第 3 页」徽标 |
| 7 | `r18-3-session-gone.png`（整窗） | 入口与标记都不在；无提示行 / toast / 角标；正文第 1 页与「本页 1 条」标记不变 |
| 8 | `r18-3b-session-restored.png`（裁切） | 入口恢复逐字 `继续讨论：丢失后恢复的会话 · 昨天`；`.pill-label` 未受挤压 |
| 9 | `r18-4-workspace-b.png`（整窗） | B 工作区（左栏只有 `sample-paper.pdf`，第 1 页）：**无**入口、无标记；无跨库残留 |
| 10 | `r18-4b-back-to-a.png`（裁切） | 回 A 后入口恢复逐字 `继续讨论：摘录与笔记走查 · 昨天` |
| 11 | `r18-5-session-mark.png`（整窗，菜单打开） | 标记恰 1 枚在活动行 `摘录与笔记走查`（行尾，图标在删除按钮的同一位置 —— 该行无删除按钮）；`消融实验对照` 行无标记、行尾为删除按钮；两行标题 / 副标题（`30 分钟` / `2 小时`）单行不换行、不与标记 / 按钮重叠；既有三行文案（`新对话` / `重命名当前对话` / `历史对话`）在场 |
| 12 | `r18-5b-mark-absent.png`（整窗，菜单打开） | `long-book.pdf` 下标记与入口都不在；菜单其余行与 #11 一致（`消融实验对照` 行仍有删除按钮，活动行 `摘录与笔记走查` 无标记、无按钮） |

**反例清单（§8.3）逐条**：1 否（入口未出现在空态 / `reader-header`）；2 否（活动 = 记录时会话隐藏，见 #3 / #12 与 `entryAfter=0`）；3 否（会话不在列表时静默隐藏，`session-gone` 入口 0 且点击面不存在）；4 否（`mark-absent` 的 `pairSame=true`、`open-switch-no-write` 记录键恒 false）；5 否（旧格式零 warn）；6 否（三张裁切图 `.pill-label` 完整）；7 否（菜单文案 / 类名 / 两击标题零改写，删除按钮计数 1）；8 否（无 transition / animation / 新 `--pix-*` 变量，入口恰 1 枚）；9 否（打开 / 翻页 / 切换都不写记录）；10 否（点击后页码 / 缩放 / 文档不变）。

### B.6 MF10 登记：`#append` 槽常驻的 DOM 事实（**实测**）

槽从模板级 `v-if` 改为常驻后，每行会话行都有一枚 `div.v-list-item__append` 容器（第 3 列；Vuetify `VListItem.js:222-223` 的 `hasAppend` ⇒ `:300-303` 无条件建容器）。实测（`sessionMenuProbe` 新增 `appendCount` / `appendWidth` 两个只读字段，随 `MEASUREMENTS.json` 落盘）：

| 菜单行 | `appendCount` | `appendWidth` | 容器内容 |
| --- | --- | --- | --- |
| `新对话` / `重命名当前对话`（无该槽） | 0 | `null` | —— |
| `摘录与笔记走查`（活动 + 标记，`r18-5`） | 1 | **20px** | 仅标记（`.session-doc-mark`） |
| `消融实验对照`（非活动 + 删除按钮，`r18-5`） | 1 | **22px** | 仅删除按钮 |
| `消融实验对照`（**活动且无标记**，`r18-4` B 侧） | 1 | **0px** | 空容器（零宽，视觉零位移） |

⇒ 修正设计档 MF10 的粗口径「每行多一枚**空**容器」：槽常驻的后果是「会话行恒有一枚容器」，容器为空（零宽）只发生在**既无标记也无删除按钮**的行（例如 B 侧活动行）；有标记 / 删除按钮时容器按内容占宽。既有场景从不打开会话菜单（`grep -c "pill-session" scripts/ui-shot.mjs` = 0）⇒ 既有 174 张截图零影响（验收轮 `missing: []` 佐证）。

### B.7 与设计档的实现级差异（逐项，全部为「按事实改写」）

| # | 设计档原文 | 实际实现 | 理由与影响 |
| --- | --- | --- | --- |
| 1 | §1.5.4 helper 的菜单在场判定为 `!!document.querySelector(".v-overlay-container .v-list")` | `menuOpenExpr` = 存在且 `getClientRects().length > 0`（可见性）；`sessionMenuProbe().open` / `openSessionMenu` / `closeSessionMenu` 三处共用同一条表达式；探针行集合同样过滤隐藏行 | VOverlay 关闭用 `v-show`（内容 DOM 首次打开后常驻：`VOverlay.js` 的 `[[_vShow, isActive.value]]` + `useLazy`）⇒ 按设计档字面实现会在**第二次 `closeSessionMenu` 上等待超时**（元素永不消失）。逐次开 / 关的 `r18-1` / `r18-3` / `r18-4` / `r18-5` 全部通过即为该改写的证据 |
| 2 | §1.5.5 `r18-3` 相位 `session-restored`：`clickSessionItem("消融实验对照")`（并注明「既有切换触发的 listSessions 刷新列表」） | 改为 `clickSessionItem("摘录与笔记走查")`（即当时**非**活动的那一行） | `ChatPanel.onSelectSession` 对活动行 early-return ⇒ 点活动行**不触发** `switch-session`、也就没有 `syncWorkspaceState → listSessions` 刷新 ⇒ 设计档字面写法会因 `projectStore.sessions` 未刷新而等到超时。判据 ⑥/⑦（入口文本与标记）与相位意图逐字不变；`r18-4` / `r18-5` 的前置点击目标与设计档一致（在两景里那两行确实是非活动行） |
| 3 | §1.5.4 `waitState` 定义在 r18 场景块内 | 上移到既有 helper 区（`readState` 附近），供 `map-chapter-filter` 的 `injection` 相位与全部 r18 相位共用 | 见 #4：该相位需要在 r18 块**之前**使用同一口径的文件轮询；`const` 的 TDZ 不允许在后面声明、前面调用 |
| 4 | §2.3「本轮**零改写**既有断言」 | `map-chapter-filter` 的 `injection` 相位：「发送不得改写 reader-state.json」的**字节比较**改为**现场投影比较**（`stateProjection` 忽略讨论记录两键与 `updatedAt`，其余 `version` / `lastDocPath` / 条目集合 / `page` / `scale` 逐字相等）；数据字段 `stateBytesSame` → `stateSameExceptRecord`（另加信息字段 `stateBytesChanged` / `stateBefore` / `stateAfter`）；该相位在取基线前新增一次 `waitState(A, 条目在场)` | 该断言的旧口径与 N100-4 的**冻结语义**直接冲突：本相位打开了 `sample-paper.pdf` 且发送成功 ⇒ 按设计必须写两键（实测 `stateBytesChanged=true`）。改写后判别力保留：`52` 相位的**字节级**断言（点徽标不得改写，按原样未动）继续兜住「纯 UI 路径零写盘」；R18 的记录写入由 `r18-*` 的 11 条 record 覆盖。`waitState` 前置是因为落点写盘有 600ms 去抖：不先等目标条目在场，基线会是「文件尚不存在」而恒红（实测复现一次后定位） |
| 5 | §1.5.5 `r18-4` / `r18-5` 未列 append 探针 | `sessionMenuProbe` 增两个只读字段 `appendCount` / `appendWidth`，并在 `r18-4` / `r18-5` 各加一条「容器事实」断言（B 侧空容器必须 `0px`；会话行恒 1 枚、命令行 0 枚） | 兑现 MF10 的「dev 档必须逐项登记该 DOM 差异」：登记从源码推断升级为**实测**（见 B.6） |
| 6 | §1.5.4 未列 R18 之外的小 helper | 另加 5 个只读探针：`entryTextOf` / `entryTitleOf` / `deleteTitleOf` / `switchCallsNow` / `waitPillSession`（均为既有 `textOf` / `js` / `waitFor` 的组合，不新增 IPC、不进产物代码） | 避免同一表达式在各相位重复三遍；语义与设计档的「读文本 / 读 title / 读 switchCalls / 等 pill 文本」逐字一致 |
| 7 | §1.5.5 `r18-5` `mark-visible` 步骤顺序 | 在 `clickSessionItem` 之后、开菜单之前插一次 `waitFor`「入口隐藏」（`r18-1` 相位 2 同理，用同一条终态等待） | 「活动会话 = 记录会话 ⇒ 入口消失」是终态：不等它而在中间态读 `countOf` 会在切换完成前读到 1（实现级稳健性，不改判据） |

### B.8 走查判据（设计档 §1.6，逐条实读）

| 判据 | 命令 | 实读 | 期望 |
| --- | --- | --- | --- |
| 入口字面总量 | `grep -rn "reader-discuss" pix/src \| wc -l` | 5 | 5（模板 2 + 样式 3） |
| 单文件字面 | `grep -c "reader-discuss" …/ReaderPanel.vue` | 5 | 5（无注释 / 其它行命中） |
| 复用串命中文件数 | `grep -rln "继续讨论" pix/src` | 1（`ReaderPanel.vue`） | 1 |
| 图标 | `grep -rn "mdi-forum-outline" pix/src \| wc -l` | 1 | 1 |
| 标注字面 | `grep -rn "session-doc-mark" pix/src \| wc -l` | 2 | 2（模板 1 + 样式 1） |
| 标注图标 | `grep -rn "mdi-file-link-outline" pix/src \| wc -l` | 1 | 1 |
| 标注 tooltip 字面 | `grep -rn "最近讨论：" pix/src \| wc -l` | 1 | 1 |
| 既有冻结字面 | `reader-resume` / `pill-session` / `session-delete-btn` / `历史对话` | 3 / 3 / 4 / 2 | 全部保持 |
| 提交路径唯一（MF6） | `grep -c "readerStateSave" …/stores/reader-state-store.ts` | 1 | 1 |
| 调用点唯一（MF4） | `grep -c "noteDiscussion" ChatPanel.vue` / `…/stores/reader-state-store.ts` | 1 / 2 | 1 / 2 |
| 其它组件零泄漏 | `grep -rn "noteDiscussion" …/{PdfViewer,ReaderPanel}.vue …/WorkspacePage.vue \| wc -l` | 0 | 0 |
| 派生点纪律 | `currentDiscussion` 在 components / pages / store | 3 / 0 / 2 | ≥2 / 0 / 2 |
| 组件不读现场表 | `grep -rn "documents\[" pix/src/renderer/components \| wc -l` | 0 | 0 |
| 组件零字段字面 | `grep -rn "lastSessionPath\|lastSessionAt" pix/src/renderer/components \| wc -l` | 0 | 0 |
| 既有通道零增量 | `grep -rn "switch_session" pix/src/renderer \| wc -l` | 1 | 1 |
| 入口不发 IPC | `grep -rn "sendCommand\|ipcRenderer" …/ReaderPanel.vue \| wc -l` | 0 | 0 |
| 主进程零新增 await | `grep -c "await" pix/src/main/reader-state-store.ts` | 1 | 1（仅头部注释） |
| 降级面零 diff | `git diff -U0 -- pix/src/main/reader-state-store.ts \| grep -E "^[+-].*(DEGRADE_MESSAGES\|ERROR_MESSAGES\|uniqueBackupPath\|writeFileAtomic\|resolveLastDoc\|toRelativeDocPath\|isStoredDocPath\|parseReaderState)"` | 无输出 | 无输出 |
| SEL 项数 | `sed -n '/^const SEL = {/,/^};/p' scripts/ui-shot.mjs \| grep -cE '^  [a-zA-Z]+: '` | 74 | 74（72 → 74） |
| 烟测条数 | `grep -c "  check(" scripts/smoke-notes.mjs` / `smoke-view.mjs` | 71 / 74 | 71 / 74 |
| 脚本改动面 | `grep -c "r18-" scripts/ui-shot.mjs` / `grep -c "setSessions\|switchSessionCalls" …` | 42 / 18 | ≥12 / ≥6 |
| `ui-shot.mjs` 删除行 | `git diff -U0 -- pix/scripts/ui-shot.mjs \| grep -E "^-[^-]"` | 6 行 = 4 处 §1.5.2 登记的 stub 实现行 + 2 行 §B.7 #4 的既有断言改写 | 逐字见 B.7 #4 |
| 零新 IPC / 零依赖面 | `git diff --numstat -- …{ipc-handlers,preload,session-bridge}.ts …{session-store,project-store,reader-store}.ts …/session-title.ts scripts/smoke-view.mjs package.json package-lock.json pix/build packages \| wc -l` | 0 | 0 |
| 工作树范围 | `git status --short` | 8 个修改（A1–A4 + B1–B4）+ 4 个未跟踪文档 | 白名单内 |

### B.9 未决项（B 面）

1. **既有 `map-scale` 耗时断言的偶发性（非本轮引入，未改）**：本轮共 **6 次离屏尝试**（含初轮因旧口径断言而红、以及新增 append 断言的第一版而红的轮次）；其中 `map-scale` 相位的「`.map-toggle` → 220 行 ≤ 800ms」红了 **2** 次（966ms / 973ms）、绿 2 次（最终绿轮 90ms），另两轮未跑到该相位。历史四轮同相位 80 / 87 / 95 / 119ms。红轮期间机器上存在用户自己的 `E:\pix\PiX.exe`（4 进程，`E:\pix\PiX.exe` 路径、11:41 启动）与 `MsMpEng` 占用，空闲内存 ~3.1GB；同轮 `reader-state-writes/thirty-changes` 为 92ms（历史 89ms）正常。⇒ 登记为**环境负载敏感**：未改阈值、未改产品代码；验收证据取最终绿轮（`pix-v06-r18-after`，186 张 / `failure: null`）。若后续要工程化消除，建议单列一条「耗时断言在负载下的判据口径」改动，而非本轮静默放宽。
2. **入口位次**：实测挂载顺序为 `.pill-label` → `.map-toggle` → `.shortcut-toggle` → `.reader-discuss`（`r18-1b` / `r18-3b` / `r18-4b` 三张裁切图一致）；按设计档 §1.3.1 / §9 第 8 条不予断言，窄栏下的挤压仍只由 `.pill-label` 逐字判据 + 目视兜住。
3. **`r18-4-workspace-b.png` 的菜单是关闭态**：设计档 §1.5.6 只冻结「整窗」；B 侧菜单行 / 标记由 `sessionMenuProbe` 的读数兜住（`menuRows` / `markCount=0` 已落盘），截图不重开菜单。
4. **`r18-3` 的相位 2 点击目标**（B.7 #2）与**既有断言改写**（B.7 #4）是本次两处与设计档字面不一致的地方；都已按「失败路径表 / 判据意图」保留判别力并逐项登记。若评审要求逐字回到设计档字面，需先给出「活动行点击也能刷新会话列表」的产品级方案。
5. **未执行项**：`npm run build` / `npm test` / `npm run package` / `npm run dev` 未跑（本步禁止）；离屏多次尝试均**串行**（不并发），最终验收轮 = 第 6 次尝试（`AFTER_EXIT=0`）。

### B.10 复验记录（B 面第二次验证执行）

> 本节对 B.1–B.9 的交付面做**独立复跑**：同一工作树、不新增任何源码 / 脚本 / 断言改动，只重跑工程门、两条烟测与两轮离屏（串行），并把新读数与逐张目视结论落到本档。本节唯一写操作 = 本节自身。

| 序 | 命令 | 实读 | 期望 | 结论 |
| --- | --- | --- | --- | --- |
| 1 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` | `CHECK_EXIT=0` | 0 error | 通过 |
| 2 | `cd pix && node scripts/smoke-notes.mjs` | 末行逐字 `通过 71 / 失败 0`、`SMOKE_NOTES_EXIT=0` | 71 / 0 | 通过 |
| 3 | `cd pix && node scripts/smoke-view.mjs` | 末行逐字 `通过 74 / 失败 0`、`SMOKE_VIEW_EXIT=0` | 74 / 0 | 通过 |
| 4 | 验收离屏 `PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v06-r18-after` | `AFTER_EXIT=0`、末行 `结束：产出 186 张截图`、`MANIFEST.failure === null` | 0 / 186 张 / null | 通过 |
| 5 | 复跑轮离屏 `PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v06-r18-verify`（在第 4 步之后单独执行，不并发） | `VERIFY_EXIT=0`、186 张、`failure === null` | 与第 4 步一致 | 通过 |

**零缺失比对（本次实跑，基线 `C:/Users/86157/AppData/Local/Temp/pix-v06-r17c-review`，只读）**

| 项 | 基线 | 验收（`pix-v06-r18-after`） | 判据 |
| --- | --- | --- | --- |
| 截图数 / `failure` | 174 / `null` | 186 / `null` | 既有 174 张 `missing: []`、`added: 12`、`r18-*` 恰 12 张 |
| label 种类 / 测量条数 | 69 / 253 | 74 / 264 | 既有 69 种 label `missing: []`（逐 label 条数不减） |
| 新增 5 组 label 条数 | —— | `r18-discuss-entry:3` / `r18-old-format:2` / `r18-session-missing:2` / `r18-workspace-isolation:2` / `r18-session-mark:2` = **11** | 与设计档 §1.5.1 配额逐字一致 |
| 产物目录白名单 | —— | 186 png + `MANIFEST.json` + `MEASUREMENTS.json`，白名单外条目 0 | 结束自检继续生效 |
| 两轮一致性（设计档 §5.6 #5） | —— | 两轮 `label#phase` 序列逐条一致（264 条，diff 0）、两轮截图集合差集为空 | 串行两轮读数一致 |

**r18 相位关键读数（本次验收轮 `MEASUREMENTS.json`，与 B.4 逐条一致）**：`send-records` 目标条目两键 = 会话 `session-demo.jsonl` + `lastSessionAt`，末条 payload 携带同两键，第二条目（`archive/older-paper.pdf`）两键仍为 `session-b.jsonl` / `1758000001000`，入口计数 0、warn 增量 0；`entry-visible-and-click` 入口文本 `继续讨论：摘录与笔记走查 · 刚刚`、`title` = 文本 + `；点击打开该会话`、`switch_session` 末项 = `session-demo.jsonl`、pill `消融实验对照` → `摘录与笔记走查`、文件 sha 不变、`saveDelta=0`、页码 `第 1 / 3 页` 与 `100%` 不变、点击后入口 0；`send-failed` 错误文本 `stub 发送被拒绝`、两键逐字不变；`old-format-silent` 续读文案逐字 `继续阅读：sample-paper.pdf · 第 2 页`、`hasPairKey=false`、warn 增量 0；`open-switch-no-write` 翻页后 `page=3` / `updatedAt > SEED_AT` 且记录键恒 false；`session-gone` 入口 0 / 两个容器内计数 0 / 菜单标记 0 / 两键原样；`session-restored` 入口 `继续讨论：丢失后恢复的会话 · 昨天`、标记恰 1 且 `title=最近讨论：sample-paper.pdf`；`workspace-b` B 侧入口 0、B 条目无记录键、菜单 4 行含两条会话、标记 0、A 文件 sha 不变；`back-to-a` 入口恢复且 `pairSame=true`；`mark-visible` 标记恰 1（活动行）、`消融实验对照` 行无标记、`.session-delete-btn` 恰 1（`title=删除该对话`）、入口 0；`mark-absent` 标记 0 / 入口 0、切回后标记恢复且 `pairSame=true`、warn 增量 0。MF10 的实测宽：标记行 append 容器 20px、删除按钮行 22px、空容器（B 侧活动行）0px、命令行无容器。

**走查复读（设计档 §1.6 的 B 面部分，本次实读）**：`reader-discuss` = 5（`ReaderPanel.vue` 内亦 5）；`grep -rln "继续讨论" pix/src` 命中文件数 = 1；`mdi-forum-outline` = 1；`session-doc-mark` = 2；`mdi-file-link-outline` = 1；`最近讨论：` = 1；既有冻结字面 `reader-resume` / `pill-session` / `session-delete-btn` / `历史对话` = 3 / 3 / 4 / 2；`readerStateSave`（store）= 1；`noteDiscussion` = 2（store）/ 1（ChatPanel）/ 0（ReaderPanel、PdfViewer、WorkspacePage）；`currentDiscussion` = 2（store）/ 3（components）/ 0（pages）；`documents[`（components）= 0；`lastSessionPath` 与 `lastSessionAt`（components）= 0；`switch_session`（renderer）= 1；`MAX_SESSION_PATH_LENGTH`（renderer）= 0；`await`（主进程 store）= 1；`SEL` 项数 = 74；`check(` 计数 = 71（notes）/ 74（view）；范围外文件 `git diff --numstat` = 0 行；`smoke-notes.mjs` 删除行 = 0、`smoke-view.mjs` 全文 diff = 0、`ui-shot.mjs` 删除行 = 6（4 处 §1.5.2 登记的 stub 实现行 + 2 行 §B.7 #4 登记的既有断言改写）。

**目视复验（12 张，`read` 工具逐张读入本轮 `pix-v06-r18-after` 的新文件）**：结论与 B.5 逐条一致，关键判断如下。

| # | 截图 | 本次目视结论 |
| --- | --- | --- |
| 1 | `r18-1-send-records.png` | 发送后中心 pill = `sample-paper.pdf` + 地图 / 快捷键两枚既有图标且**无**入口；会话 pill = `摘录与笔记走查`；正文 `第 1 / 3 页` / `100%`、右栏用户消息与发送前一致 |
| 2 | `r18-1b-discuss-entry.png` | 同排顺序 `sample-paper.pdf` → 地图图标 → 快捷键图标 → 入口胶囊；文本完整可辨 `继续讨论：摘录与笔记走查 · 刚刚`，`.pill-label` 未截断、无重叠、不换行 |
| 3 | `r18-1c-discuss-switched.png` | 右侧会话 pill 已切为 `摘录与笔记走查`；阅读区仍 `第 1 / 3 页` / `100%`；中心 pill 内无入口（活动 = 记录 ⇒ 隐藏） |
| 4 | `r18-1d-send-failed.png` | 错误块（`错误` / `send` / `stub 发送被拒绝`）在场；入口仍在（记录未被失败发送改写）；composer 草稿逐字回填 |
| 5 | `r18-2-old-format.png` | 空态区 `.reader-resume` 逐字 `继续阅读：sample-paper.pdf · 第 2 页`；`阅读区` pill 内**无**入口；无提示 / 报错 |
| 6 | `r18-2b-open-switch.png` | 打开并翻到 `第 3 / 3 页`（`4. Conclusion`）后阅读区**无**入口；会话菜单关闭；左树行显示 `第 3 页` 徽标 |
| 7 | `r18-3-session-gone.png` | 入口与标记都不在；无提示 / 角标；正文第 1 页与既有标记原样 |
| 8 | `r18-3b-session-restored.png` | 入口恢复逐字 `继续讨论：丢失后恢复的会话 · 昨天`；`.pill-label` 未受挤压 |
| 9 | `r18-4-workspace-b.png` | B 工作区左栏仅 `sample-paper.pdf`（第 1 页），**无**入口、无标记、无跨库残留 |
| 10 | `r18-4b-back-to-a.png` | 回 A 后入口恢复逐字 `继续讨论：摘录与笔记走查 · 昨天` |
| 11 | `r18-5-session-mark.png` | 菜单两行会话：活动行 `摘录与笔记走查 / 30 分钟` 行尾恰 1 枚标记（该行无删除按钮）、`消融实验对照 / 2 小时` 行尾为删除按钮；单行不换行、不重叠；`新对话` / `重命名当前对话` / `历史对话` 在场 |
| 12 | `r18-5b-mark-absent.png` | `long-book.pdf` 下标记与入口都不在；菜单其余行与 #11 一致 |

**环境偶发（本轮实跑登记，未改阈值、未改产品代码）**：本次共 3 次离屏（均串行、不并发）——验收轮第 1 次红于**既有** `map-scale` 相位的 `.map-toggle` → 220 行耗时断言（970ms > 800ms），第 2 次绿（93ms）；复跑轮绿（82ms）。该断言与 R18 无关（本轮 `git diff` 中 0 命中），红轮期间机器上存在用户自己的 `E:\pix\PiX.exe` 等重负载进程（空闲内存 ~3.0GB）⇒ 与 B.9 第 1 条同源，维持「环境负载敏感、不静默放宽」的处置。

**结论**：B 面交付（B1–B4）与 A 面数据面在本轮独立复跑下全绿：`check` 0 error、两条烟测 71/0 与 74/0、离屏两轮 `failure === null` 且既有 174 张截图 / 69 种 label 零缺失、新增 5 组 11 条 record 与 12 张截图齐备、逐张目视无 §8.3 反例。未决项 = B.7 #2 / #4 两处与设计档字面的登记差异（需评审裁定）、B.9 第 1 条的既有耗时断言环境敏感性（非本轮引入）、`npm run build` / `npm test` / `npm run package` / `npm run dev` 未跑。

---

## C. R18 收口（负责人裁决落地：既有断言更新登记 + `r18-3` 相位自确定化）

> 依据：`docs/pm/R18-review.md`「代码审查（R18）」§3 的 2 条 mustFix。负责人裁决：**MF1 追认**（既有断言改写登记进冻结文档）、**MF2 追认并加固**（步骤偏离登记 + 相位自确定化，能恢复冻结字面则恢复）。本步白名单：`pix/scripts/ui-shot.mjs`、`docs/pm/R18-req.md`、`docs/pm/R18-design.md`、`docs/pm/R18-dev.md`（**产品源码 `pix/src/**` 零改动**）。
> 本步实跑：`npm run check` ⇒ `CHECK_EXIT=0`；`node scripts/smoke-notes.mjs` ⇒ `通过 71 / 失败 0`；`node scripts/smoke-view.mjs` ⇒ `通过 74 / 失败 0`；离屏两轮（串行、不并发）⇒ 退出码 **0 / 0**、各 **186** 张截图、`failure === null`。

### C.1 登记条数与位置（2 条，逐字登记进冻结文档）

| # | 登记面 | 位置 | 内容 |
| --- | --- | --- | --- |
| 1 | MF1 既有断言更新（唯一一处） | `R18-req` §0.10「登记 1」+ `R18-design` §2.3（标题 / 结论 / 逐字登记表 #1 / `-` 行配额 6 / 复核命令 ②） | 文件 `pix/scripts/ui-shot.mjs`；label `map-chapter-filter`；相位 `injection`；**旧值 2 行**（`stateBytesSame: fileHash(STATE_FILE_A) === stateHash52i` + `...(fileHash(...) === stateHash52i ? [] : ["发送不得改写 reader-state.json"])`）⇒ **新值**（`stateBytesChanged` / `stateSameExceptRecord`（`stateProjection` 忽略讨论两键与 `updatedAt`）/ `stateBefore` / `stateAfter` + 投影比较断言行），并登记「取基线前新增一次 `waitState(STATE_FILE_A, 条目在场)`」的理由（600ms 去抖）；判别力说明 = `badge-click` 相位字节断言（`:4799` / `:4813`）按原样未动 + 投影仍逐字覆盖 `version` / `lastDocPath` / 条目集合 / `page` / `scale` + 其它条目不受写记录波及由 `r18-1` 判据 ③ 与烟测 #7 另证 |
| 2 | MF2 步骤偏离 + 自确定化 | `R18-req` §0.10「登记 2」+ `R18-design` §1.5.5 `r18-3` 的 `session-restored` 行（步骤 / 新增判据 ⑨⑩⑪ / `data` 字段）+ 本档 C.2 | 事件序列证据（`restoreStandardSeed` 不复位 `SESSION_STATE`（`:3513-3517`）；唯一镜像点 = stub `switch_session` 分支；`r18-2` 末次点击把活动会话钉为「消融实验对照」⇒ `ChatPanel.onSelectSession` 对活动行 early-return ⇒ 冻结字面单次点击必超时）+ 新值（自确定前置 + 冻结字面恢复为决定性点击） |

**同步改字的冻结引用点（避免与登记冲突）**：`R18-req` §0.1 的 R14 / R16 / R17 行（补「唯一登记例外 = §0.10 登记 1」）、§N103-2 判据 2、§6 反需求 12、§N103-2「既有面」行；`R18-design` §1.5.7 判据 2；`R18-design` 新增「代码审查修订（R18 收口）」节（MF1 / MF2 处置表 + 复跑入口）。

### C.2 自确定化结论（是否恢复冻结字面）

**已恢复**：`r18-3` 相位 `session-restored` 的决定性点击回到冻结字面 `clickSessionItem("消融实验对照")`（`ui-shot.mjs:12072`）；自确定只在必要时前置一次**幂等钉死点击**（`clickSessionItem("摘录与笔记走查")` + `waitPillSession("摘录与笔记走查")`）——该行已是活动会话时为 no-op（`ChatPanel.onSelectSession` early-return），因此不依赖前序场景遗留的 `SESSION_STATE` 镜像。

实测（两轮一致）：`pinClicked = true`、`activeBefore = "消融实验对照"`、`entryCountBefore = 0`、`switchBase.count = 4`（末项 = `session-demo.jsonl`，即前置钉死点击）、`switchCalls.count = 5`（末项 = `session-older.jsonl` = `SESSIONS_A[1].path`，即冻结字面点击）、`activeAfter = true`。

**新增断言（只增不减，随 `MEASUREMENTS.json` 落盘）**：

1. 切换前 `.reader-discuss` 计数 **0**（记录会话不在列表 ⇒ 入口隐藏）；
2. `switchSessionCalls()` 计数增量 ≥ 1 **且** `paths` 末项逐字 = `SESSIONS_A[1].path`（真实 `switch_session` 调用链与载荷）；
3. 切换后菜单活动行 = `消融实验对照` 且 `active === true`。

原判据 ⑥⑦⑧（入口文本 / `title` 逐字 / 标记恰 1 / 现场两键与 `page` 不变）逐字保留。`data` 新增 `entryCountBefore` / `switchBase` / `switchCalls` / `pinClicked` / `activeBefore` / `activeAfter` 六个只读字段（与交付轮 `pix-v06-r18-after` 的逐字段比对：该相位**仅**新增这六个字段；`entryText` / `entryTitle` / `markCount` / `markTitle` / `page` 语义逐字不变）。

### C.3 唯一工程门与两条烟测（本步实跑）

| 命令 | 读数 | 期望 | 结论 |
| --- | --- | --- | --- |
| `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` | `CHECK_EXIT=0` | 0 error | 通过 |
| `cd pix && node scripts/smoke-notes.mjs` | 末行逐字 `通过 71 / 失败 0`、退出码 0 | 71 / 0 | 通过 |
| `cd pix && node scripts/smoke-view.mjs` | 末行逐字 `通过 74 / 失败 0`、退出码 0 | 74 / 0（零改动回归） | 通过 |

### C.4 离屏取证（两轮，串行；`PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v06-r18c`）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v06-r18c" ./node_modules/.bin/electron scripts/ui-shot.mjs
```

| 项 | 第 1 轮 | 第 2 轮 | 判据 |
| --- | --- | --- | --- |
| 退出码 | **0**（`R18C_EXIT=0`） | **0**（`R18C2_EXIT=0`） | 0 |
| 末行 | `结束：产出 186 张截图` | `结束：产出 186 张截图` | 186 张 |
| `MANIFEST.failure` | `null` | `null` | `null` |
| 截图零缺失（基线 `pix-v06-r17c-review`，174 张） | `missing: []`、`added: 12`、`r18: 12` | `missing: []`、`added: 12`、`r18: 12` | 零缺失 + 新增 12 |
| label 零缺失（基线 69 种 / 253 条） | 74 种 / 264 条、`missingLabels: []` | 74 种 / 264 条、`missingLabels: []` | 零缺失 |
| 新增 5 组 label 条数 | `r18-discuss-entry:3` / `r18-old-format:2` / `r18-session-missing:2` / `r18-workspace-isolation:2` / `r18-session-mark:2`（= 11） | 同上 | 与冻结配额逐字一致 |
| `r18-*` 全绿 | 是（断言失败即抛错 ⇒ 退出码非 0；两轮 11 条 record 全绿） | 同 | 全绿 |
| 产物目录白名单 | 186 png + `MANIFEST.json` + `MEASUREMENTS.json`（白名单外条目 0） | 同 | 结束自检继续生效 |

**第 1 轮 `r18-3` 相位 `session-restored` 控制台读数（原文关键段）**：`"entryCountBefore":0,"switchBase":{"count":4,…},"switchCalls":{"count":5,…"session-older.jsonl"},"pinClicked":true,"activeBefore":"消融实验对照","activeAfter":true,"markCount":1,"markTitle":"最近讨论：sample-paper.pdf","page":1`。**第 2 轮**（当前目录内 `MEASUREMENTS.json`）逐值一致。

**回归比对（交付轮 `pix-v06-r18-after` vs 本步第 2 轮，264 条逐条规范化比对 —— 归一化时间戳 / 耗时 / 临时根路径）**：差异 **15** 条，其中 **14** 条为时间 / 环境派生（随机笔记 id 的时间戳、`createdAt` / `resolvedAt`、`waitMs` / `elapsedSinceFeedbackMs`、报告文本内的「生成时间」、滚动事件时间戳）；**唯一**语义差异 = `r18-session-missing#session-restored`，且仅为本步登记的六个新增字段。其余 249 条（含 `resume-entry`、`reader-state-*`、`r15-f16`、R16 / R17 全部 label）逐字段一致。

### C.5 走查判据（本步实读）

| 判据 | 命令 | 实读 | 期望 |
| --- | --- | --- | --- |
| 既有断言改写面 | `git diff -U0 -- pix/scripts/ui-shot.mjs \| grep -cE "^-[^-]"` | **6** | 6 = 4 处 §1.5.2 登记的 stub 实现行 + §2.3 #1 登记的 2 行既有断言 |
| `ui-shot.mjs` 增删行 | `git diff --numstat -- pix/scripts/ui-shot.mjs` | `800 / 6` | 交付轮为 `774 / 6` ⇒ 本步只**追加** 26 行（r18-3 自确定前置 + 新断言），无新增删除行 |
| 冻结字面恢复 | `sed -n '12060,12080p' pix/scripts/ui-shot.mjs` | 自确定前置 + `clickSessionItem("消融实验对照")`（决定性点击）+ 新增断言 | 冻结字面在场 |
| `SEL` 项数 | `sed -n '/^const SEL = {/,/^};/p' scripts/ui-shot.mjs \| grep -cE '^  [a-zA-Z]+: '` | 74 | 74（72 → 74，与交付轮一致） |
| 场景 / 截图 / 配额 | 两轮 `MANIFEST.json` / `MEASUREMENTS.json` | 12 张 r18 截图 / 11 条 record / 5 组 label | 与 §1.5.1 冻结配额逐字一致 |
| 工作树范围 | `git status --short` | 8 个修改（A1–A4 + B1–B4）+ 4 个未跟踪文档 | 白名单内（本步未新增文件） |
| 产品源码零改动（本步） | `git diff --stat -- pix/src` | 与交付轮同一组 7 个文件、行数不变（本步未触碰） | 本步零改动 |

### C.6 未决项（C 面）

1. **`r18-2` 相位 `open-switch-no-write` 的会话点击在当前执行序下是 no-op**（评审 §4 S1，非阻断、非本次裁决范围）：本步**未改**该相位（其步骤逐字符合冻结字面）；「切换会话不写记录」由 `r18-1` 相位 2 判据 ⑩ 与 `r18-3` 相位 2 判据 ⑧⑩ 兜住（后者本步已升级为「真实切换 + 调用链断言」）。
2. **既有 `map-scale` 耗时断言的环境敏感性**（B.9 第 1 条）：本步两轮均未触发（两轮皆绿、退出码 0）；未改阈值、未改产品代码。
3. **未执行项**：`npm run build` / `npm test` / `npm run package` / `npm run dev` 未跑（按纪律禁止）；`packages/**` 未触碰。
