# R15 全量代码审计：主进程存储与路径面（notes-store / reader-state-store / library-root / pix-paths / settings-store / env-setup）

> 审计面：`pix/src/main/notes-store.ts`、`reader-state-store.ts`、`library-root.ts`、`pix-paths.ts`、`settings-store.ts`、`env-setup.ts`。
> 方式：只读（未修改任何源码/脚本；未执行任何 git 写命令；未运行 build / test / package / dev；未跑离屏 `ui-shot.mjs`）。探针脚本一律只写 `%TEMP%`，仓库零残留。
> 编号约定：`S-MS-NN` = 问题项，`D-MS-NN` = 登记不修项。行号来自本轮真实读取的文件版本（HEAD `e5dc001`），全部由 `grep -n` / `sed -n` 现场取得。

## 0. 基线与复跑证据

| 命令 | 真实结果 |
| --- | --- |
| `cd pix && npm run check` | 退出码 0，无输出（`vue-tsc` + 主进程 `tsc` + preload `tsc` 全绿） |
| `node pix/scripts/smoke-notes.mjs` | `通过 51 / 失败 0` |
| `node pix/scripts/smoke-view.mjs` | `通过 35 / 失败 0` |
| `git status --short`（只读） | `?? docs/pm/R15-audit-render-panels.md`（另有审计产物，无源码改动） |
| 探针 `%TEMP%/pix-audit-probe/probe-paths.mjs`（编译仓库内 `main/library-root.ts` 到 `%TEMP%`，用目录联接实测越界判定） | 见 S-MS-02 证据列 |
| 探针 `%TEMP%/pix-audit-probe/probe-conf2.mjs`（用仓库内 `node_modules/conf` 10.2.0 复现 `SettingsStore` 的构造选项） | 见 S-MS-01 证据列 |

结论分布：**P0 = 2，P1 = 2，P2 = 8，D = 4**。

| 编号 | 分级 | 位置 | 一句话 |
| --- | --- | --- | --- |
| S-MS-01 | P0 | `main/settings-store.ts:25-31` + `main/index.ts:173,180-184` | 设置文件不是合法 JSON 时 `new SettingsStore()` 构造期抛错，`whenReady` 回调重抛且无 `.catch` ⇒ 应用无法启动，且无任何恢复入口 |
| S-MS-02 | P0 | `main/library-root.ts:38-51` | 库根本身是目录联接/符号链接时，`isLibraryFilePath` 对**已存在**的库内文件一律 false（不存在的路径反而 true）⇒ 整库不可读、笔记与现场全部写入失败 |
| S-MS-03 | P1 | `main/notes-store.ts:528-552` + `renderer/stores/notes-store.ts:382-398` + `NotesPanel.vue:393-403` | 逃生口的 `backupPath` 生产了但无人消费；「备份成功但新库写入失败」时 `notes.json` 已不在原位，界面只说「重建失败」 |
| S-MS-04 | P1 | `main/reader-state-store.ts:219-250` + `:205-216` | 读到 corrupt / version-unsupported 时用空模型整文件覆盖，无备份、无上报；且 missing（正常态）被计成 degraded 并双侧各记一行 warn |
| S-MS-05 | P2 | `main/notes-store.ts:418-434` | `updateNoteComment` 无长度上限与校验（IPC 侧只判 `typeof string`），与 4000 字正文上限不对称 |
| S-MS-06 | P2 | `main/notes-store.ts:558-577` | `statNotesFile` 先读后 stat，hash 与 size/mtime 非同一快照（竞态） |
| S-MS-07 | P2 | `main/notes-store.ts:126` + `main/reader-state-store.ts:106` | `relativePath.startsWith("..")` 把合法名字「..foo.pdf」「..drafts/…」误判为库外，报错误码 outside |
| S-MS-08 | P2 | `notes-store.ts:112,131` / `reader-state-store.ts:74,87` / `renderer/utils/notes-path.ts:18` / `main/pdf-tools.ts:18-47` | 同一「路径比较键/越界判定」规则 4-5 份实现，且渲染层已存在两个变体（去尾斜杠 vs 不去） |
| S-MS-09 | P2 | `main/reader-state-store.ts:150,239-250` | `documents` 无上限、无淘汰；每次翻页保存都整文件同步解析 + 序列化，两个 store 都无输入体积上限 |
| S-MS-10 | P2 | `main/pix-paths.ts:22,43-45` | `pixLogsDir` 只注册不创建（实测 `%APPDATA%/PiX-Read/` 下无 `logs/`），设置页却把它当可打开目录展示 |
| S-MS-11 | P2 | `settings-store.ts:37-109` + `pix-paths.ts:138-157` | 死代码簇：`SettingsStore.get/set/addRecentProject/removeRecentProject`、`applyAmbientCredentialPolicy(true)` 分支零消费（后者还把密钥常驻内存） |
| S-MS-12 | P2 | `main/pix-paths.ts:51-60` | 会话目录名编码有损（`/`、`\`、`:`、`-` 全折叠为 `-`），两个不同项目可落同一目录；叠加内核 `filterCwd` 规则后会话列表会串项目 |
| D-MS-01 | D | `main/notes-store.ts:137-178` | notes.json 全有或全无的损坏语义（单条越界 ⇒ 整库不可读，只能整文件重建） |
| D-MS-02 | D | `main/notes-store.ts:499-525` | `reports/` 每文档一份、从不清理，无 TTL/过期判定 |
| D-MS-03 | D | `main/notes-store.ts:292` / `renderer/utils/notes-path.ts:133` | 导出与报告用 `localeCompare` 排序，跨 ICU/语言环境次序可变，与「可 diff」的注释承诺有张力 |
| D-MS-04 | D | `notes-store.ts:112` / `reader-state-store.ts:74` | 比较键强制小写：在大小写敏感文件系统上会把两个不同文件合并（含撤销槽的库归属校验） |

---

## 1. 发现明细

### S-MS-01（P0）设置文件非法 JSON ⇒ 主进程构造期抛错，应用启动不了

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/settings-store.ts:22-31`（`new Store<GuiSettings>({ name, cwd, defaults })`）、`pix/src/main/index.ts:173`（`app.whenReady().then(...)`）、`:180`（`settingsStore = new SettingsStore()`）、`:182-184`（catch 后 `throw err` 重抛） |
| 证据 | ① `node_modules/electron-store/index.js` 全文 `clearInvalidConfig` 命中 **0** 次（`grep -c` = 0），故走 `conf` 默认 `clearInvalidConfig: false`（`node_modules/conf/dist/source/index.js:73`）。② `conf` 构造函数第 131 行 `const fileStore = this.store;` 在**构造期**读盘，`store` getter（`:274-292`，其中 `:287` 是 `clearInvalidConfig && SyntaxError` 的唯一豁免）对非 ENOENT 且非 `clearInvalidConfig && SyntaxError` 的错误一路 `throw error`。③ 探针实跑（`conf` 10.2.0，与 `SettingsStore` 同选项）：<br>`1 截断 JSON: new Conf() THROW: SyntaxError \| Unterminated string in JSON at position 32 (line 3 column 12)`<br>`2 零字节: new Conf() THROW: SyntaxError \| Unexpected end of JSON input`<br>`1 截断 JSON: 构造后 get THROW / set THROW`（同一异常，任何读写都不可用）<br>`3 clearInvalidConfig:true 的 .store => {"theme":"light","recentProjects":[]}`（对照组可自愈）<br>④ `settings-store.ts` 与 `ipc-handlers.ts:549-557` 都无 try/catch；`index.ts:173` 的 `.then(...)` 链上无 `.catch`（`grep -n "catch" src/main/index.ts` 仅 28/44/143/182/190 五处，均非该链）。 |
| 为什么是问题 | 损坏来源不需要「作者写错」：conf 的写入虽然默认走 `atomically.writeFileSync`（源码核对：`conf/dist/source/index.js:375`（EXDEV 回退在 `:381-382`）；electron-store 未覆盖 `_write`），但同一函数在 `EXDEV` 时**回退 `fs.writeFileSync` 非原子写**（`conf/dist/source/index.js:368-382`，注释自陈 Windows 上会遇 EXDEV）；再叠加云同步/杀软/手改/磁盘问题，`%APPDATA%\PiX-Read\pix-settings.json` 变成空文件或截断 JSON 是可达的。一旦如此：`new SettingsStore()` 抛 → `index.ts:184` 在 `whenReady` 回调内重抛 → 未处理拒绝（Node 默认 `throw` ⇒ 进程异常退出；若被降级为 warn ⇒ 后面的 `createWindow()` 永不执行，表现为「点了没反应」）。两条路径都是应用完全不可用，且**没有任何应用内恢复入口**（同一仓库的 notes.json 有逃生口，设置文件没有）。 |
| 建议修法 | ① 构造期容错：把 `new Store` 包在 try/catch；失败时把坏文件改名为 `pix-settings.json.corrupt-<yyyyMMdd-HHmmss>`（唯一名，参考 `notes-store.ts:252-260` 的 `uniqueBackupPath` 策略），再用默认值重建 store；或至少传 `clearInvalidConfig: true`（实测可自愈）。② 读侧校验：`getAll()` 出口对 `GuiSettings` 做形状校验（`recentProjects` 必须是数组、每项 `path/name/lastOpened/sessionCount` 齐备，缺项丢弃并 warn），避免坏值穿透到渲染层。③ `index.ts` 给 `whenReady` 链补 `.catch`，把它降级成「弹错误框 + 可继续启动」而不是静默退出。 |
| 修复风险 | 不触任何冻结面：两个 smoke 脚本的编译面（`main/notes-store.ts` + `main/library-root.ts`；`renderer/utils/{outline-notes,notes-path,reading-context}.ts`）都不含 `settings-store.ts`/`index.ts`，现有 86 条断言不受影响。风险只在「多出一个备份文件」这一新行为，需要产品确认弹窗/日志文案。 |
| 判据 | 新增 smoke（或用探针同法）三条：① 写入截断 JSON 后构造 `SettingsStore` 不抛错；② 同目录出现 `pix-settings.json.corrupt-*` 且 `getAll()` 等于默认值；③ 零字节文件同样满足 ①②。人工验收：把 `%APPDATA%\PiX-Read\pix-settings.json` 清空后仍能起窗口。 |

### S-MS-02（P0）库根为目录联接/符号链接时，库内已存在文件全被判为「不在资料库内」

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/library-root.ts:38-51`（`isLibraryFilePath`，关键在 `:44` `const real = normalizeFsPath(realpathSync(candidatePath))` 与 `:45` 用**未解析的** `root` 做包含判定）；`setLibraryRoot`（`:18-19`）只做 `resolve(root)`，不解析 realpath；`main/pdf-tools.ts:23-47` 有一份同缺陷的复制实现 |
| 证据 | 探针（`%TEMP%` 下建 `real-lib` + 目录联接 `link-lib`，调用仓库源码编译出的 `isLibraryFilePath`）：<br>`realpath(linkDir) = C:\Users\86157\AppData\Local\Temp\pix-audit-probe-hPlRpo\real-lib`<br>`root=真实目录, 库内文件 isLibraryFilePath = true`<br>`root=联接目录, 经联接访问同一文件 = false`<br>`root=联接目录, 经真实路径访问同一文件 = false`<br>`root=联接目录, 联接目录下的不存在文件 = true`<br>另有 `relative(ws, ws/..foo.pdf) = "..foo.pdf"` 等 path 语义读数同批取得。 |
| 为什么是问题 | 库根来自渲染层字符串（`ipc-handlers.ts:359-362` `session-start` → `setLibraryRoot(projectDir)`），中间不做 realpath。只要该字符串经解析后与字面不同（Windows 目录联接、符号链接、某些 `subst`/网络映射盘、短名 8.3 路径），`real !== resolved` 且「真实路径不在字面 root 之下」⇒ **库内每个已存在文件都返回 false**。后果是全链路失效：渲染层所有文件读取（`ipc-handlers.ts:188-199` `guardLibraryPath`）报「该文件不在当前资料库内」、PDF 取文（`pdf-tools.ts:43`）失败、`addNote`/`exportDocumentReport`/`saveReaderState` 的相对化（`notes-store.ts:122-128`、`reader-state-store.ts:102-108`）全部报 outside，即整库不可读且错误文案指错方向。反过来，**不存在的路径反而放行**（catch 分支），判定自相矛盾：同一目录下「有文件读不了、没文件能过」。 |
| 建议修法 | 在 `library-root.ts` 内缓存「已解析的库根」：`setLibraryRoot` 时计算 `resolvedRoot = normalizeFsPath(realpathSync(root))`，`realpathSync` 失败（根不存在/不可访问）时回退为字面 `resolve(root)`；`isLibraryFilePath` 改为「候选的 real 路径（失败时用字面 resolved）必须落在 `resolvedRoot` 之下」，并把「库根本身不算在库内」的严格包含语义保持原样。`pdf-tools.ts:18-47` 的复制实现应删掉、直接复用同一助手（其 `|| isInsideRoot(candidatePath, cwd)` 的额外放行要么显式保留、要么删除——需该面负责人判断）。 |
| 修复风险 | 触及冻结面：`main/library-root.ts` 在 `smoke-notes.mjs` 的编译面内（`files: [main/notes-store.ts, main/library-root.ts]`，且脚本额外校验 side-effect 单实例）。现有 51 条断言里与库根相关的都是普通目录（`WS_A`/`WS_B`），修复后应保持全绿；必须保住的语义有两条：① 不在库内的路径（含同级兄弟目录 `ws2`）仍判 false；② **不存在的库内路径仍判 true**（smoke 夹具 `DOC_A` 本身不存在，靠的就是这个）。另需注意 `isPathInsideDirectory` 被 `ipc-handlers.ts:677` 用于会话文件保护，语义不可放松。 |
| 判据 | 探针升级为断言三条：① `setLibraryRoot(linkDir)` 后 `isLibraryFilePath(join(linkDir,"paper.pdf")) === true`；② `isLibraryFilePath(join(realDir,"paper.pdf")) === true`（同一文件的真实路径，落在 `resolvedRoot` 下）；③ `realDir` 的兄弟目录文件、`../` 逃逸路径仍为 false；④ 不存在文件的既有放行语义不变。外加 `smoke-notes` 51/51、`smoke-view` 35/35 保持全绿。 |

### S-MS-03（P1）逃生口的 `backupPath` 生产了但无人消费；写失败时原文件已搬走而界面只说「重建失败」

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/notes-store.ts:528-552`（`resetCorruptNotes`；`:538` 取备份名、`:540` `renameSync`、`:547` 写失败时回传 `backupPath`、`:551` 成功时回传 `backupPath`）；契约字段 `shared/types.ts:449`；消费侧 `renderer/stores/notes-store.ts:382-398`、`renderer/components/workspace/NotesPanel.vue:393-403` |
| 证据 | 主进程明确写了「必须把路径报给渲染层」：<br>`// 备份已存在，必须把路径报给渲染层，否则用户无从找回原文件`（`notes-store.ts:546`）+ `return { success: false, notes: [], backupPath, ... }`。<br>但全仓 `grep -rn "backupPath" pix/src` 只有 5 处命中：`notes-store.ts:538/540/547/551` + `shared/types.ts:449`（计数 `wc -l` = 5）——**渲染层零消费**。`recoverCorruptNotes`（`renderer/stores/notes-store.ts:382-398`）只做 `if (!result.success) return { ok: false, message: result.error ?? "重建失败" }` 与成功后 `void syncNotesFile("capture")`；`NotesPanel.vue:399` 显示「重建失败：笔记写入失败」、`:402` 显示「已备份原文件并新建空库」（都不带路径，也无 reveal 入口，而同文件 `:405-412` 有现成的 `revealPath`）。 |
| 为什么是问题 | 路径：`renameSync(notes.json → notes.json.corrupt-<stamp>)` 成功、随后 `writeFileAtomic` 失败（目录只读/被占/盘满），此时 `notes.json` **已经不在原位**；界面文案是「重建失败」+ 错误码 `write-failed`，用户自然理解为「什么都没发生」。紧接着任何一次 `loadNotes()` 都会把缺失文件当空库处理（`notes-store.ts:180-191` ENOENT ⇒ 空库），面板显示 0 条且无错误——**看起来就是笔记被清空了**，而唯一副本躺在一个用户不可能猜到的文件名里。这正是「失败路径缺陷 + 状态未复位」。 |
| 建议修法 | 两处小改，任选其一或同做：① 顺序改为「先 `copyFileSync(notes.json → backup)`（原文件不动）→ 再原子写新库」：写失败时原文件仍在原位、备份也在，`write-failed` 语义变干净；② 渲染层把 `backupPath` 透出：失败文案改成「重建失败，原文件已备份到 &lt;路径&gt;」并复用 `revealPath` 提供「在文件夹中显示」，成功文案同样带路径。 |
| 修复风险 | ① 不破既有断言：`smoke-notes` 只断言「备份数量 = 1 且名字匹配 `notes\.json\.corrupt-\d{8}-\d{6}(-\d+)?`」（`:469,474-482`）与「重建为空库」，复制实现同样满足；但会多出「原文件仍在」的语义变化，需要 R15 负责人确认。② 只动渲染层文案与一个 reveal 调用，不触冻结面。 |
| 判据 | `smoke-notes` 追加两条：① 成功路径 `reset.backupPath` 非空且 `existsSync(backupPath) === true`；② 注入写失败（沿用既有 `<报告>.tmp` 预置为目录/父级占位的手法是同类注入）后断言 `existsSync(NOTES_A) === true`（顺序改法）或断言失败结果里 `backupPath` 非空（文案改法）。渲染层侧由 `ui-shot` 检查提示条文本包含备份路径。 |

### S-MS-04（P1）状态文件降级语义：corrupt/版本不符被静默整文件覆盖；missing 被计成 degraded

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/reader-state-store.ts:225-250`（`saveReaderState`：`:219-224` 的设计注释、`:237` 读、`:239` 读失败即用 `emptyState()`、`:246` 整体覆盖写）；`loadReaderState` `:205-216`（`:213` 记 warn）；渲染层 `renderer/stores/reader-state-store.ts:152-172`（`:164` 也记 warn） |
| 证据 | 主进程注释自陈：`读到 missing/corrupt/version-unsupported 允许以空模型整体覆盖重建`（`:221-224`）。写路径从不回报「我刚覆盖掉了一个损坏文件」，也没有备份（对比 `notes-store.ts:528-552` 的 `.corrupt-<stamp>` 策略）。降级原因里 `missing` 与 `corrupt` 同列（`DEGRADE_MESSAGES`，`:41-46`），`loadReaderState` 对 `missing` 也走 `warn(...)`（`:213`），渲染层再记一次（`:164`）——首次打开任何资料库（尚无 `reader-state.json`）就固定产生 2 行 warn，与注释「degraded ⇔ 恰一行 warn」不一致。 |
| 为什么是问题 | ① 数据安全路径：`saveReaderState` 被渲染层按去抖频繁调用（翻页/缩放即提交），所以「读到损坏 ⇒ 覆盖」几乎立即发生，全部文档的阅读现场在用户毫不知情、无备份的条件下被清零；而同一仓库对同类文件（notes.json）选择「拒绝写入 + 备份重建」，两处同一问题的规则不一致，属契约漂移。② 版本不符被归入「可覆盖」比 corrupt 更危险：未来版本写入的 `version: 2` 文件在旧构建上会被无条件降级覆盖（无备份）。③ 日志语义：正常首启态被记成 warn，掩盖真正的 corrupt/read-failed。 |
| 建议修法 | ① 覆盖前留备份：对 `corrupt`/`version-unsupported` 先按 `uniqueBackupPath` 同法改名（`reader-state.json.corrupt-<stamp>`）再写新库，路径写进日志；或 ② 与 `notes-store` 对齐：`version-unsupported` 直接拒写（返回新码或复用 `read-failed` 口径），只允许 `corrupt` 重建且必须留备份。③ `missing` 从 `degraded` 里摘出来（或渲染层不把它当降级文案），保留「一条失败一行日志」的不变量。 |
| 修复风险 | `reader-state-store.ts` **不在任何 smoke 的编译面内**（`smoke-notes.mjs:1073-1075` 只编 `notes-store.ts`+`library-root.ts`；`smoke-view.mjs:521-524` 只编渲染层三个 utils），因此改动零既有断言风险——代价是也没有回归网，必须同步补一组断言（见判据）。语义面需确认：渲染层的 `loadReaderState` 已处理 `success:false`+降级分支（`renderer/stores/reader-state-store.ts:152-172`），改「拒写」不会让渲染层卡在未就绪（该文件 `:170` 有「IPC reject ⇒ 按空模型继续并置 ready」的兜底）。 |
| 判据 | 新增 smoke 组（编译面加入 `main/reader-state-store.ts`）：① 写入非法 JSON → `saveReaderState` 成功且目录内出现 `reader-state.json.corrupt-*`（或按方案 ② 返回失败且原字节不变）；② `{"version":2,...}` → 按选定方案断言「拒写、字节不变」或「有备份」；③ 正常文件保存后：其它文档条目字段逐字不变（只改目标条目）、`lastDocPath` 更新；④ `missing` 的 load 结果 `degraded === false`（或 `reason` 区分）。 |

---

### S-MS-05（P2）`updateNoteComment` 无长度上限与内容校验

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/notes-store.ts:418-434`（`:426` `const updated: ReaderNote = { ...read.file.notes[index], comment, updatedAt: Date.now() }`）；IPC 形状守卫 `ipc-handlers.ts:250-252,517-519`；UI 侧 `NotesPanel.vue:311` |
| 证据 | 主进程对正文有硬上限（`notes-store.ts:39` `MAX_NOTE_TEXT_LENGTH = 4000`，读侧也在 `:150` 复检），但 `comment` 只做 `typeof === "string"` 形状判断（`ipc-handlers.ts:250`），进来后**原样落盘**（无 trim、无折叠、无上限）。渲染层只有一个 `.trim()`（`NotesPanel.vue:311`）。 |
| 为什么是问题 | 信任边界（IPC）上的不对称：同一份文件、同一类用户文本，正文有 4000 字闸门，备注没有。备注会写进 notes.json（无界增长，且读侧不检查其长度，不会触发 corrupt）并原样进入 notes.md 与阅读报告（`renderNotesMarkdown`/`renderMarkdownEntry`）。异常渲染层或粘贴巨量文本时，文件体积与导出体积无上界。 |
| 建议修法 | 在 `updateNoteComment` 内加写侧闸门（建议与正文同量级，如 2000 字），超限返回既有 `too-long` 码 + 调用点专有文案（照 `ANSWER_TOO_LONG_MESSAGE` 先例，不动码表）；**不要**在读侧 `isReaderNote` 加备注长度检查（会把既有文件判成损坏）。 |
| 修复风险 | 只加写侧判断 ⇒ 不触冻结断言（`smoke-notes` 无超长备注用例）。若同时改读侧，会与「宁可报错」策略叠加出误伤，不推荐。 |
| 判据 | smoke 追加：`updateNoteComment(id, "x".repeat(5000))` ⇒ `success=false` + 指定码/文案 + notes.json 字节不变；随后 `loadNotes()` 仍返回原条目（未被判损坏）。 |

### S-MS-06（P2）`statNotesFile` 先读后 stat：hash 与 size/mtime 不是同一快照

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/notes-store.ts:558-577`（`:564` `const bytes = readFileSync(paths.file)`、`:565` `const stat = statSync(paths.file)`） |
| 证据 | 两次独立系统调用之间无任何隔离；文件在此期间被外部改写/替换（R14 的设计前提就是「外部改动感知」）时，返回的 `size`/`mtimeMs` 属于新文件、`hash` 属于旧字节。 |
| 为什么是问题 | 竞态窗口内的报告字段自相矛盾。当前渲染层只用 `hash` 做变更判定（`renderer/stores/notes-store.ts:200-222`，`grep` 显示 `mtimeMs`/`size` 在渲染层零消费），所以真实影响小；但该 RPC 已被声明为「只读的最小事实」，字段互相不对应会让后续基于 `size/mtime` 的优化（如跳过 hash）踩坑。 |
| 建议修法 | 改成单句柄快照：`openSync` → `fstatSync(fd)` → `readSync`（或 `readFileSync(fd)`）→ `closeSync`，保证三个字段来自同一 inode 同一时刻。 |
| 修复风险 | 无：`smoke-notes` 的 notes-stat 组（7 条）只比对 `size === bytes.length`、`hash === sha256(bytes)`、`mtimeMs > 0`，单句柄实现同样满足。 |
| 判据 | 既有 `notes-stat #3/#4/#5` 保持全绿；新增一条「同一调用内 `size === 读取字节长度`」的显式断言（可在外部写者持锁/持续追加的夹具下跑）。 |

### S-MS-07（P2）`startsWith("..")` 把合法名字的文档误判为库外

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/notes-store.ts:122-128`（`:126` `if (!relativePath \|\| relativePath.startsWith("..") \|\| isAbsolute(relativePath)) return null;`）、`pix/src/main/reader-state-store.ts:102-108`（`:106` 同一行） |
| 证据 | 探针实跑：<br>`relative(root, root/..foo.pdf) = "..foo.pdf"`、`startsWith('..') ⇒ true`、`isLibraryFilePath(root/..foo.pdf) = true`<br>即：越界判定认为它在库内，相对化却因前缀误判返回 null ⇒ 调用点回报 `outside`（「该文档不在当前资料库内」）。同批读数 `relative(ws, ws2/a.pdf) = "..\ws2\a.pdf"`（真正的越界形态）。 |
| 为什么是问题 | 合法的文件名/目录名以 `..` 开头（如 `..foo.pdf`、`..drafts/x.pdf`；Windows 只禁 `.` 与 `..` 本身）会让该文档永远无法加笔记、无法导出报告、无法保存阅读现场，且错误码与文案把用户指向「不在资料库内」——错误信息指错方向、无自助解法。读侧 `isStoredDocPath`（`notes-store.ts:131-135`、`reader-state-store.ts:87-91`）已用「整段等于 `..`」的精确判定，两处口径还不一致。 |
| 建议修法 | 两处同改：新增局部量 parent（值为「..」+ `sep`），判定改为 `if (!relativePath \|\| relativePath === ".." \|\| relativePath.startsWith(parent) \|\| isAbsolute(relativePath)) return null;`（`sep` 从 `node:path` 取，与 `relative` 的输出一致）。 |
| 修复风险 | 低。`smoke-notes` 的 outside 用例走的是「库外绝对路径」（`REPORTS` 夹具外的路径）而非 `..` 前缀，判定语义不变；仍建议本轮把「真越界」用例保留跑一遍以确认没有放松。 |
| 判据 | smoke 追加：库内建 `..foo.pdf` ⇒ `addNote` 成功且 `docPath === "..foo.pdf"`、`saveReaderState` 成功、`exportDocumentReport` 成功；再断言 `../ws-b/x.pdf` 仍为 `outside`/`false`。 |

### S-MS-08（P2）同一路径规则 4-5 份实现，且已存在两个变体

| 字段 | 内容 |
| --- | --- |
| 位置 | 比较键 `docPathKey`：`main/notes-store.ts:112-114`、`main/reader-state-store.ts:74-76`、`renderer/utils/notes-path.ts:18-20`、`scripts/ui-shot.mjs:702-704`（第 4 份）；存储态路径判定 `isStoredDocPath`：`main/notes-store.ts:131-135`、`main/reader-state-store.ts:87-91`、`scripts/ui-shot.mjs:706-711`；越界判定：`main/library-root.ts:26-51` vs `main/pdf-tools.ts:18-47`（`pdf-tools` 重抄 `normalizeFsPath` + `isInsideRoot`，并在 `:43` 用 `\|\|` 叠加 cwd 放行） |
| 证据 | 现存的三个「路径比较」变体：`docPathKey` = 小写 + 正斜杠 + **去尾斜杠**；`renderer/stores/project-store.ts:18-20` `normalizePath` = 小写 + 正斜杠（**不去尾斜杠**）；`renderer/stores/reader-store.ts:52-54` `samePath` = 小写 + 正斜杠（**不去尾斜杠**，注释却写「与 project-store.normalizePath 同约定」）。因此 `reader-store.ts:52` 与 `notes-path.ts:18` 对同一字符串 `"C:/ws/a\\"` 的答案不同（前者 false、后者 true）。 |
| 为什么是问题 | 规则分叉已经在渲染层出现，而三份 `docPathKey` 目前逐字相同只靠人工同步；任何一处将来改（例如去掉 lowercase、改成正斜杠折叠）都会让主进程存下的 `documents` 键与渲染层查询键错位——`reader-state-store` 读侧正是用「键必须等于自己的比较键」来丢弃条目的（`:153`），错位会静默丢现场。`pdf-tools.ts:18-47` 的复制还继承了 S-MS-02 的 realpath 缺陷（同一 bug 两处）。 |
| 建议修法 | 新增共享叶子模块（如 `pix/src/shared/doc-path.ts`，纯函数、无 electron 依赖），导出 `docPathKey` / `isStoredDocPath` / `relativeToRoot`；主进程两处、渲染层 `notes-path.ts` 改为 import；`pdf-tools.ts` 的越界判定改为直接调用 `library-root` 的助手。同步更新 `ui-shot.mjs` 的脚本副本（它是测试夹具，可保留但需标注来源）。 |
| 修复风险 | 中：① `smoke-notes.mjs:1073-1075,1089-1090` 硬编码了编译产物集合（`required = [main/notes-store.js, main/library-root.js]`，`extra` 只允许 `shared/types.js`），新增共享运行时代码会让「多出」检查失败 ⇒ 必须同步改脚本白名单；`smoke-view.mjs:521-524,539-540` 同构（`files` + `allowed`）。② 语义必须逐字保持（小写/正斜杠/去尾斜杠），否则 `badge-counts #4`、`undo` 组的键归一断言会红。 |
| 判据 | 改后 `grep -rn "\.replace(/\\\\\\\\/g" pix/src` 只剩共享模块 1 处（+ 脚本夹具副本）；`npm run check`、两个 smoke 全绿；新增断言：`docPathKey("A.pdf\\") === docPathKey("a.PDF")` 单点覆盖，且渲染层改用共享实现后 `samePath` 的两个变体收敛为 1 个。 |

### S-MS-09（P2）`documents` 无上限、无淘汰；每次保存整文件同步解析；两 store 都无输入体积闸门

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/reader-state-store.ts:150`（`const documents: Record<string, ReaderDocState> = {}` 累积读入）、`:239-250`（每次保存 `{ ...current.documents, [key]: ... }` 后整体序列化）、`:237`（每次保存都 `readFileSync` + `JSON.parse` 全文）；`notes-store.ts:180-191`（同型：整文件读取，无体积上限） |
| 证据 | 保存路径 = 读全文 → 解析 → 合并一条 → `JSON.stringify(file, null, 2)` → 原子写；调用频率 = 渲染层翻页/缩放去抖提交（`renderer/stores/reader-state-store.ts:108-152`，且 `applyLocal` 乐观更新后立刻 `submit`）。条目永不淘汰：文档被删/改名后其条目仍留在文件里。 |
| 为什么是问题 | 大资料库（数千文档）下 `documents` 单调增长，主进程每次保存都做 O(n) 同步解析与序列化，占住主进程（同步 fs + JSON）⇒ 可观测卡顿；且两个 store 都不对读入体积设闸门，一个异常巨大的文件（外部工具/同步冲突产生的倍增文件）会让主进程在 `JSON.parse` 上长时间阻塞（界面冻结），且该风险在 corrupt 判定之前发生。 |
| 建议修法 | ① 给 `documents` 加上限与淘汰（如保留最近 `updatedAt` 的 N=500 条，写侧裁剪并保证「当前文档必留」）；② 读侧先 `statSync` 判体积，超过阈值（如 4 MB）按 `read-failed`/新降级原因处理，不进入 `JSON.parse`。 |
| 修复风险 | ① 纯主进程实现，不触现有断言（reader-state 无 smoke 覆盖）；但淘汰策略属产品决策（会丢老文档的现场）。② notes.json 侧若引入新错误码，会牵动「码表与 `ReaderNotesErrorCode` 一一对应」的冻结约束与 `smoke-notes` 的逐字文案断言 ⇒ 建议只在 reader-state 侧先落地体积闸门。 |
| 判据 | 新增探针：造 5k 条 `documents` 的 `reader-state.json`，量测一次 `saveReaderState` 的耗时与文件大小；修后断言「写入后条目数 ≤ 上限 + 1」且耗时回到毫秒级；体积闸门用例：写入 > 阈值的文件后 `loadReaderState` 返回降级而不卡死。 |

### S-MS-10（P2）`pixLogsDir` 只登记不创建，却被设置页当作可打开目录展示

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/pix-paths.ts:22`（`export const pixLogsDir = join(pixRootDir, "logs")`）、`:38-41`（`pinPixUserData` 里 `app.setPath("logs", pixLogsDir)`）、`:43-45`（`ensurePixDirectories` **只** `mkdirSync(pixAgentDir)`）；消费方 `ipc-handlers.ts:559-561`（`get-storage-paths`）→ `renderer/pages/SettingsPage.vue:138-146`（展示 + reveal 按钮） |
| 证据 | 真实运行后的磁盘事实（只读列出）：<br>`ls "$APPDATA/PiX-Read"` ⇒ `Cache/ Code Cache/ DawnGraphiteCache/ DawnWebGPUCache/ GPUCache/ Local State/ Local Storage/ Network/ Preferences/ Shared Dictionary/ agent/ blob_storage/ pix-settings.json`<br>**没有 `logs/`**（应用确实跑过：`pix-settings.json` 存在，119 字节，键 `theme,recentProjects,defaultThinkingLevel,takeHerEyes`）。`grep -rn "pixLogsDir\|logsDir" pix/src` 只有 `pix-paths.ts` 的声明与 `getPixStoragePaths` 的转发，无任何 `mkdirSync`。 |
| 为什么是问题 | 设置页把「日志」列成一条可显示/可打开的路径，但该目录在默认安装下不存在 ⇒ `shell.openPath`/「在文件夹中显示」失败（`ipc-handlers.ts:438-445` 的 `library-open-path` 也在 `existsSync` 为假时直接返回「路径不存在」）。同时 `app.setPath("logs", …)` 指向不存在的目录，Chromium 的日志落盘也拿不到位置，属「界面承诺 vs 实际存在」不一致。 |
| 建议修法 | 在 `ensurePixDirectories()` 里补 `mkdirSync(pixLogsDir, { recursive: true })`（一行），或在 `get-storage-paths` 前确保目录存在；如确实不打算启用文件日志，则把该行从设置页移除（产品取舍）。 |
| 修复风险 | 无（不触任何 smoke 断言）。 |
| 判据 | 启动应用后 `ls "$APPDATA/PiX-Read/logs"` 存在；设置页「日志」行的 reveal 动作返回成功。 |

### S-MS-11（P2）死代码簇：设置 store 的四个方法 + 环境变量密钥还原分支

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/settings-store.ts:37-39`（`get`）、`:41-43`（`set`）、`:82-101`（`addRecentProject`）、`:103-109`（`removeRecentProject`）；`pix/src/main/pix-paths.ts:138-144`（`captureAmbientCredentials`）、`:147-157`（`applyAmbientCredentialPolicy`） |
| 证据 | `grep -rn "settingsStore\.\|addRecentProject\|removeRecentProject" pix/src`：主进程只有 `getAll()`（`ipc-handlers.ts:361,550,555`）与 `setMany()`（`:554`）被调用；`get`/`set`/`addRecentProject`/`removeRecentProject` **零调用**（渲染层有同名的 `project-store.removeRecentProject`，是另一条 `getSettings`/`setSettings` 通道）。`applyAmbientCredentialPolicy` 全仓只有 `env-setup.ts:31` 的 `applyAmbientCredentialPolicy(false)` 一次调用，`:147-152` 的 `allow === true` 分支（还原环境变量）从未被执行；`capturedAmbientCredentials` 因此只进不出，把 API 密钥在进程内存里长期保留（键表见 `pix-paths.ts:93-134`）。 |
| 为什么是问题 | ① 无用导出（仓库规范明确把死代码列为卫生问题），且 `addRecentProject`/`removeRecentProject` 含类型假设：探针实跑 `recentProjects` 为非数组时 `projects.findIndex is not a function`（TypeError），一旦被复用就是崩溃点（`settings-store.ts:83,104` 的 `\|\| []` 只兜 falsy）。② 密钥常驻内存却没有任何消费方，属无收益的敏感数据留存；`pix-paths.ts:88-92` 的「先缓存将来还原」注释是唯一理由。 |
| 建议修法 | 三选一并请负责人裁决（涉及删除有意代码，按仓库规范需先确认）：① 删掉未用的设置方法与 `allow=true` 分支；② 把「允许使用环境变量密钥」真正接上设置项（此时需保留缓冲并补 `GuiSettings` 字段 + IPC）；③ 保留但加 `@internal` 注释与读侧校验（`Array.isArray` 守卫）。 |
| 修复风险 | 无断言风险（均不在冻结面内）；风险是误删「有意为之」的将来接口，故必须由负责人确认。 |
| 判据 | 改后 `grep -rn "settingsStore.get(\|settingsStore.set(\|addRecentProject" pix/src` 命中数符合预期（0 或已接线）；`npm run check` 通过；非数组 `recentProjects` 不再抛 TypeError（探针复跑）。 |

### S-MS-12（P2）会话目录名编码有损 ⇒ 两个项目可共用会话目录并串列表

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/pix-paths.ts:47-60`（`encodeProjectSessionDirName`：去首分隔符 + `[/\\:]` → `-`；`pixProjectSessionsDir` 用其拼目录）；调用方 `main/session-bridge.ts:77-80`（`resolvePixSessionDir`）+ `main/ipc-handlers.ts:400-402`（`resolvePixSessionDir` → `SessionManager.list`） |
| 证据 | 表达式即证据：`\`--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--\``。于是 `C:\work\proj` ⇒ `--C--work-proj--`，`C:\work-proj` ⇒ `--C--work-proj--`（同名）；同类还有 `C:\a\b` 与 `C:\a-b`。内核侧 `packages/coding-agent/src/core/session-manager.ts:1495-1497`：`const filterCwd = sessionDir !== undefined && dir !== getDefaultSessionDirPath(cwd);`——PiX 传入的目录正是内核默认目录（`PI_CODING_AGENT_DIR` 被 `env-setup.ts:24` 指向 `pixAgentDir`），故 `filterCwd === false`，**不会按 cwd 过滤**，冲突目录下两个项目的会话会一起列出（`ipc-handlers.ts:403-412` 直接回传 `SessionManager.list` 结果）。 |
| 为什么是问题 | 目录名编码是内核既有规则（注释已声明为兼容目的），本仓库无法单方面改动；但由此产生的「会话串项目」是真实可见的（列表里出现别的项目的对话，打开后 `session.cwd` 与当前工作区不一致）。触发需要两个路径编码相同，概率低但代价是用户困惑与误操作。 |
| 建议修法 | 不动编码（保持内核兼容），在 `ipc-handlers.ts` 的 `list-sessions` 出口按 `session.cwd` 与 `projectDir` 同路径（大小写/分隔符归一后）过滤一次即可闭环；若担心历史会话 `cwd` 缺失，用 `session.cwd \|\| projectDir` 的既有兜底参与比较。 |
| 修复风险 | 低；但该文件不在本面冻结面内，实施归 ipc/session 面。 |
| 判据 | 构造两个编码相同的目录（如 `%TEMP%\work\proj` 与 `%TEMP%\work-proj`），用同法编码断言目录名相同；修正后断言任一项目的 `list-sessions` 只返回 `cwd` 匹配的会话。 |

---

## 2. 登记不修（D）

### D-MS-01 notes.json 的「全有或全无」损坏语义

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/notes-store.ts:137-178`（`isReaderNote` + `parseNotesFile`，任一条目不合法即整文件 `corrupt`），逃生口 `:528-552` |
| 证据 | `if (!notes.every(isReaderNote)) return corruptRead();`（`:174`）+ 注释「宁可报错，不静默丢条目」；读侧对 `text.length <= 4000`、`page` 为整数 ≥1、`kind` 白名单、`id` 唯一都做硬校验。 |
| 为什么不修 | 逐条抢救（跳过坏条目、保留好条目）需要新的错误码/文案与「部分加载」的 UI 语义，且会与 `smoke-notes` 的 corrupt 逐字断言（`report-failures #5/#6`、`undo-slot-lifecycle #4`）冲突；当前策略有备份逃生口兜底。 |
| 代价 | 用户手改或外部工具追加一条超长/越界条目 ⇒ 整库在界面里读不出来，只能重建（原文件留在备份名里，但备份路径当下不显示，见 S-MS-03）。 |

### D-MS-02 `reports/` 只增不减，无过期判定

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/notes-store.ts:499-525`（`exportDocumentReport`；`:506` `join(paths.reports, ...docPath.split("/")) + ".md"`） |
| 证据 | 每次导出覆盖同名报告，但文档改名/删除后旧报告永远留在 `.pix-read/reports/` 的镜像目录树里；全模块没有任何清理或 TTL 逻辑（`grep TTL\|expire\|prune` 在六个文件内 0 命中）。 |
| 为什么不修 | 报告是用户可见产物（可能被引用/归档），自动删除需要产品决策（保留期、是否随文档删除）；体积上界 = 文档数 × 单文档报告，可接受。 |
| 代价 | 长期使用后 `.pix-read/reports/` 积累陈旧报告，用户可能误读为当前事实（报告头有生成时间，可自证）。 |

### D-MS-03 导出/报告的 `localeCompare` 排序与「可 diff」承诺有张力

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/notes-store.ts:292`（`[...groups.entries()].sort(([a], [b]) => a.localeCompare(b))`）、`:301`（`sortReportEntries` 的 `id.localeCompare`）、`renderer/utils/notes-path.ts:133`（`docPathKey(a).localeCompare(...)`） |
| 证据 | `localeCompare` 结果依赖 ICU 版本与语言环境；对仅在标点/连字符上不同的键（如 `a-b` 与 `ab`），不同平台/ICU 的次序可能不同（同机稳定）。`renderNotesMarkdown` 的注释自称「幂等、可 diff」。 |
| 为什么不修 | 修法（改码元比较或固定 `Intl.Collator("en")`）会改变主进程与渲染层两处次序，且现有夹具（`sample-paper.pdf` / `archive/older-paper.pdf`）不敏感，收益低于双面改动 + 复核成本。 |
| 代价 | 跨机器/跨 Electron 版本导出的 `notes.md` 组次序理论上可能不同，破坏「可 diff」的强承诺；同机同版本内无影响。 |

### D-MS-04 强制小写的比较键在大小写敏感文件系统上合并不同文件

| 字段 | 内容 |
| --- | --- |
| 位置 | `pix/src/main/notes-store.ts:112-114`、`pix/src/main/reader-state-store.ts:74-76`、渲染层 `renderer/utils/notes-path.ts:18-20` |
| 证据 | `docPath.toLowerCase()`：`A.pdf` 与 `a.pdf` 得同一键 ⇒ 去重键相同（新增第二条同文本会被判重复）、`exportDocumentReport` 的 `docPathKey` 过滤会把两个文档的笔记合并进同一份报告、撤销槽的库归属校验（`notes-store.ts:462` `docPathKey(slot.root) !== docPathKey(getLibraryRoot())`）也会把仅大小写不同的两个库根当作同一个。 |
| 为什么不修 | 目标平台是 Windows（大小写不敏感），整仓库（渲染层分组、徽标计数、会话匹配）都建立在这一约定上；改成大小写敏感需要跨 4 个模块的键域重构并重写相应断言，收益仅限于 Linux/macOS 上的极少数同名异例文件。 |
| 代价 | 在大小写敏感文件系统上：两个不同文档的笔记被合并展示/导出，去重判定误命中；跨库撤销的归属校验失效（需要「两个库根仅大小写不同 + 渲染层仍持有旧 id」同时成立，实际可达性很低）。 |

---

## 3. 已核对但未发现问题的面（负结论，省复核时间）

| 面 | 核对结论 |
| --- | --- |
| 原子写协议与临时文件清理 | `notes-store.ts:193-218` 与 `reader-state-store.ts:180-197` 均为 `mkdirSync(recursive)` → 写 `<target>.tmp` → `renameSync` 覆盖，失败走 `removeTemp`；`smoke-notes` 的「`<报告>.tmp` 预置为目录 / 目标父级预置为同名文件」两路注入均断言 `write-failed` + 原字节不变（51/51 通过）。`rmSync(force)` 不递归，遇到目录型 tmp 会失败但仍保持「失败可上报」而非静默成功。 |
| 读-改-写的同步性（无 await 交错） | 六个文件内 `grep -n "await"` 只在两个文件头注释各命中 1 处（`notes-store.ts:5`、`reader-state-store.ts:5`），实现代码 0 处；`notes-store.ts`/`reader-state-store.ts` 的每个导出函数都是「读 → 改 → 原子写」同一同步段落，两次 IPC 不会交错丢写（文件头注释的声明与实现一致）。 |
| `undoSlot` 生命周期 | 只有成功 `deleteNote` 设槽（`notes-store.ts:436-450`，设槽在 `:448`），只有成功 `restoreNote`（`:456-480`）与成功 `resetCorruptNotes`（`:550`）清槽；失败与 `addNote`/`updateNoteComment`/导出都不动槽，与 R10 的 8 条失败断言逐条对应（`smoke-notes` undo-* 三组全绿）。 |
| 备份名唯一性 | `uniqueBackupPath`（`:252-260`）用 `existsSync` 递增后缀，规避 Windows 上 `renameSync` 静默覆盖同名目标；同秒二次重建不会覆盖上一份备份（`smoke-notes` 断言 `backups.length === 1`）。 |
| BOM 与解析稳定性 | 两个 store 读入后统一 `raw.replace(/^\uFEFF/, "")`（`notes-store.ts:189-190`、`reader-state-store.ts:169-170`），与 `library-read-text` 同口径；`serialize*` 用 `JSON.stringify(file, null, 2) + "\n"`，键序由构造顺序固定（`{ version, notes }` / `{ version, lastDocPath, documents }`），字节可复现。 |
| 报告与导出的确定性 | `reportBlocks` 的归组是纯函数（入参顺序即分组顺序、第一条命中获胜、空组不渲染、兜底组恒最后），`sortReportEntries` 三键排序不依赖 `sort` 稳定性（`notes-store.ts:300-302`）；`smoke-notes` report-render 组以手写期望串逐字节比对（时间戳归一化）全绿。 |
| `setLibraryRoot` 的时序 | `ipc-handlers.ts:359-366` 在 `session-start` 内 `await sessionBridge.start(...)` **之后**才 `setLibraryRoot`；渲染层 `WorkspacePage.vue:80-99` 也是先 `await rpc.startSession()` 再加载笔记/现场，故不存在「库根已切但文件 IPC 用旧根」的可达窗口。 |
| `env-setup` 的加载顺序 | `index.ts:9` 是 `import "./env-setup.js";`（第一行 import），`PI_CODING_AGENT_DIR` 在任何内核模块求值前写入；`delete process.env.PI_MCP_CONFIG` 与密钥清空都在模块顶层同步执行，与文件头「必须是第一个 import」的约束一致。 |
| 旧设置迁移 | `env-setup.ts:38-53`：目标已存在 / 源不存在 / 大小写不敏感下同文件三种情形都跳过，且先 `JSON.parse` 校验再 `copyFileSync`（不删源文件），迁移失败只 `console.error` 不阻塞启动。 |
| settings 读取的别名风险 | 探针用例 5：`store.store` 每次返回 `createPlainObject()` + 展开的新对象（`conf` 源码 `:274-292`，返回语句在 `:280`），改返回值不会污染内部状态，`getAll()` 无「返回内部引用」问题。 |
| `normalizeFsPath` 的大小写/尾分隔符 | 探针：`root=大写` 与 `root=尾分隔符` 时库内文件均判 true（`normalizeFsPath` 小写化 + `path.relative` 在 win32 内部大小写不敏感比较），日常路径形态没有误判。 |

---

## 4. 本面最值得修的 3 条

| 排名 | 编号 | 一句话 | 排序理由 |
| --- | --- | --- | --- |
| 1 | S-MS-01 | 设置文件坏一个字节，应用直接起不来且无恢复入口 | 唯一「把应用变成砖」的路径，且修复成本最低（构造期 try/catch + 备份改名 + 补 `.catch`），完全不在冻结面内；同类文件（notes.json）已有成熟逃生口可照抄 |
| 2 | S-MS-02 | 库根是联接/符号链接时整库被判越界，笔记与现场全写不进去 | 影响面最大（所有文件读取与写入的统一守卫），且现状自相矛盾（已存在文件拒绝、不存在文件放行）；修复是 `library-root.ts` 一处 realpath 缓存，须同步 `pdf-tools` 的复制实现，风险可控（既有 51 条断言用的都是普通目录） |
| 3 | S-MS-03 | 逃生口「先搬走原文件再写新库」，写失败时用户拿不回笔记且界面只说「重建失败」 | 数据面最贵的一条：用户的笔记唯一副本被移出原位而提示不提路径（`backupPath` 全场无消费）；顺序改成「先复制备份、再原子写」即可不破既有断言，是低风险高收益的失败路径修复 |

> 次优候选：`S-MS-04`（损坏的阅读现场被静默整文件覆盖）——数据价值低于笔记，但同样属「静默覆盖 + 无备份」，且该模块当前零 smoke 覆盖，可与本轮新增判据一并处理。

## 5. 交接给其它面（非本面，仅为闭环提示）

| 位置 | 观察 | 归属 |
| --- | --- | --- |
| `main/ipc-handlers.ts:423-436`（`library-list`） | 入参 `dir` 只做 `resolve` + 「是不是目录」检查，**没有任何库内/白名单约束**（对比同文件 `:188-199` 的 `guardLibraryPath` 会做 `isLibraryFilePath`）。渲染层被注入时仅靠该通道即可列举任意目录的文件名（内容读取仍被守卫拦住）。修复建议与 `guardLibraryPath` 同口径，或明确限定为 `getLibraryRoot()` 之下 | ipc-handlers 面 |
| `renderer/composables/useTheme.ts:4-30` | 主题只从 `localStorage("pix-theme")` 读写，而 `GuiSettings.theme` 会持久化到 `pix-settings.json`（`settings-store.ts:29` 默认值 + `setMany` 分支）并通过 `get-settings` 回传——设置文件里的 `theme` 没有任何应用点（`getAll().theme` 零消费） | 渲染层 UI 面（本面只登记去向） |
| `renderer/stores/reader-store.ts:20-21` vs `main/reader-state-store.ts:29-30` | 缩放取值域 `MIN_SCALE=0.5/MAX_SCALE=3` 在两个进程各写一份（注释声明「主进程独立判」）；任一侧改动而另一侧未同步 ⇒ 保存被 `invalid-input` 静默拒绝（渲染层只 `warn`）。建议常量收敛到 `shared/types.ts` 同级模块 | 渲染层 + 本面（`reader-state-store.ts`） |
| `main/ipc-handlers.ts:102-104`（`sanitizeSettings`） | `theme` 只接受字面量 `"light"`；当前 `GuiSettings.theme` 类型也仅 `"light"`（`shared/types.ts:522`），故不算缺陷，但将来放开暗色主题时需要同时改三处（类型 / sanitize / `useTheme`） | 渲染层 UI 面 |
