# R15 修复方案（可开工）· F1–F20 终表 / 批次 / 白名单 / 验证

> 输入：`docs/pm/R15-fix-review.md`（结论 revise，21 条 must-fix 全部采纳）、`docs/pm/R15-audit.md`（§3–§7）、6 份分片审计档。
> 本档由定稿代理只读产出：未改任何源码/脚本；未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未跑离屏取证；未执行任何 git 写命令。
> 基线实测（HEAD `e5dc001`）：`cd pix && npm run check` ⇒ exit 0；`node scripts/smoke-notes.mjs` ⇒ 通过 51 / 失败 0；`node scripts/smoke-view.mjs` ⇒ 通过 35 / 失败 0。行号全部为本次源码实读所得。
> 基线产物目录：`C:/Users/86157/AppData/Local/Temp/pix-v05-r14-final`（`shots/`：143 png；`MANIFEST.failure = null`；`MEASUREMENTS.json` 211 条 / 51 个 label）。修复后的离屏复跑以此为「零缺失」比对基线。
> 本轮不做：重构、架构调整、新功能（M4/M9/M10 合并类改动全部保持 D）；不改依赖字段与 lockfile；不改 `packages/*`。

**结论速览**：终表 20 行（F1–F19 在册 19 条 + F20 降级 D）；确定降级 1 条（F20），条件降级 1 条（F17 附件子项）；批次 3 个；文件白名单 24 个（与 R15-audit §5 相同，不含 `packages/*`，不新增表外文件）。

---

## 1. 修复清单终表（F1–F20）

口径说明：
- 「位置」为当前 HEAD 实读行号；实施时以代码语义为准，行号偏移不超过 ±3 行属正常。
- 「判据」逐条给出可执行命令或断言 label；「走查」= 人工代码核对；「探针」= 仓库外/`%TEMP%` 一次性脚本（harness 见附录 A）；「烟测」= 两个 smoke 脚本；「离屏」= `ui-shot.mjs` 新场景/记录。
- 「冻结面」列出必须逐字保持或必须同步修改的既有断言/文案/选择器；未列出的既有面一律不动。

### F1 · 回车发送缺少 IME 组合态守卫（P0）
- 位置：`pix/src/renderer/components/input/InputArea.vue:28-32`；次要位置 `pix/src/renderer/components/workspace/ChatPanel.vue:1136`（`@keydown.enter="saveRename"`）、`pix/src/renderer/pages/SettingsPage.vue:482`（`@keydown.enter="saveKey(provider)"`）；`SettingsPage.vue:348` 的 `<v-form @submit.prevent="saveSettings">` 隐式提交列入人工走查（若真机可复现 IME 提交再同法补守卫）。
- 修法：
  - `InputArea.onKeydown` 首行加 `if (e.isComposing) return;`（与同仓既有写法 `PdfSearchPanel.vue:308` 逐字一致；不再叠加已废弃的 `keyCode === 229`）。
  - `ChatPanel` 新增 `function onRenameEnter(e: KeyboardEvent): void { if (e.isComposing) return; void saveRename(); }`，模板改为 `@keydown.enter="onRenameEnter"`。
  - `SettingsPage` 新增 `function onSaveKeyEnter(provider: string, e: KeyboardEvent): void { if (e.isComposing) return; void saveKey(provider); }`，模板改为 `@keydown.enter="onSaveKeyEnter(provider, $event)"`。
- 判据：
  - 离屏新场景（建议组 `composer-ime`，截图 `r15-ime-guard.png`）：`setDraft("IME 测试")` → `js` 派发 `new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true })` → 断言 `window.__pixStub.sendCalls().count === 0` 且 `.input-area` value 未变（成对断言①）；再派发 `isComposing: false` → `waitSendCalls(1)`（成对断言②）。
  - 走查：`SettingsPage:348` 的隐式提交是否可信；人工走查中文输入法组合态回车（发送框/重命名框/密钥框）均不触发提交。
- 冻结面：不改场景 43 的 steer 驱动（`ui-shot.mjs:2435` 构造 `KeyboardEvent` 未传 `isComposing` ⇒ 默认 false，语义不受影响）；无既有断言需改。
- 批次：B2。

### F2 · 末页永远不是「当前页」（P0）
- 位置：`pix/src/renderer/components/workspace/PdfViewer.vue:290-315`（marker `:294`，写回 `:314`；`.pdf-scroll` 样式 `:1042-1047`，页 `margin-bottom:16px` `:1049-1054`）；`readerStore.pageCount` 见 `pix/src/renderer/stores/reader-store.ts:27`（写入口 `:113-116`）。
- 修法（含 MF-2）：触底钳制必须带「可滚动」前置，写值用 `readerStore.pageCount`：
  ```ts
  function updateCurrentPage(): void {
    const root = scrollEl.value;
    if (!root) return;
    // 触底钳制：只在内容确实可滚动时生效——否则一屏装得下的文档会被钉在末页
    if (root.scrollHeight - root.clientHeight > 1 && root.scrollTop + root.clientHeight >= root.scrollHeight - 1) {
      readerStore.setPage(readerStore.pageCount);
      return;
    }
    // …既有 marker + 二分逻辑逐字不动（:290-314）…
  }
  ```
  中部滚动取页口径不变；不改 `onScroll`（`:734`）与 `zoomBy`（`:757`，每次 ±0.1，`setScale` 钳制口径见 `reader-store.ts:136-139`）。
- 判据（离屏新相位，建议编号 `22c`，插在 22b 之后、23 之前；`SEL` 新增 `zoomOutBtn: '.pdf-toolbar button[title="缩小"]'`；截图 `r15-22c-bottom-50.png`）：
  1. 打开 `sample-paper.pdf`（100%，`第 1 / 3 页`）→ 点缩小 ×5 → 断言 `.zoom-label === "50%"` → `root.scrollTop = root.scrollHeight` → `waitPage` 断言 `.page-label === "第 3 / 3 页"`（修复前必红）。
  2. `root.scrollTop = 0` → 断言 `第 1 / 3 页`。
  3. fitted 负向：`js` 设 `root.style.flex = "0 0 auto"; root.style.height = "3000px"`（使 `scrollHeight - clientHeight <= 1`）→ 触发一次 scroll → 断言 `.page-label` 仍为 `第 1 / 3 页`（修复前会被钳到第 3 页）→ 恢复 `style.flex`/`style.height` 为空串。
  4. 相位收尾恢复 100% 并断言 `第 1 / 3 页`（避免污染后续相位）。
  - 备注：合成 `KeyboardEvent` 不触发原生滚动 ⇒ 判据用 `scrollTop` 赋值触发真实 scroll 事件（`onScroll` → rAF → `updateCurrentPage`）；`End` 键仅列入人工走查。
- 冻结面：新增 1 个 SEL 项 + 1 个场景；既有 `第 3 / 3 页` 断言全部保留，**更正** R15-audit §6.3 的「全部在 100% 缩放」表述——含 110% 缩放下断言（`ui-shot.mjs:1794/1795`、`1924/1925`、`1980`、`2031`），修复后仍绿。既有 `缩小后应回到 100%`（`:7128`）不动。
- 批次：B3。

### F3 · 设置文件非法 JSON ⇒ 应用启动不了（P0）
- 位置：`pix/src/main/settings-store.ts:25-31`（构造）/`:33-35`（`getAll`）；`pix/src/main/index.ts:173`（`whenReady().then(...)` 链，链尾 `:214`）；`pix/src/main/pix-paths.ts:19`（模块顶层 `app.getPath("appData")`，纯 node 下不可加载的直接原因）。已核 `conf@10.2.0` 源码：构造器内 `const fileStore = this.store;` 会立即读盘，`store` getter 在非 `clearInvalidConfig` 下对 `SyntaxError` 直接重抛（`node_modules/conf/dist/source/index.js`），缺陷真实。
- 修法（MF-10 选用「② conf 代理探针 + 真机走查」；① 的 electron shim 路线在本仓不可行，理由见「判据」）：
  ```ts
  // settings-store.ts（同文件私有辅助，不新增文件）
  constructor() { this.store = SettingsStore.openStore(); }
  private static openStore(): Store<GuiSettings> {
    const options = { name: "pix-settings", cwd: dirname(pixGuiSettingsFile), defaults: defaultSettings };
    try {
      return new Store<GuiSettings>(options);
    } catch (err) {
      const backupPath = backupInvalidSettingsFile(pixGuiSettingsFile, Date.now()); // mkdir → 唯一名 .corrupt-YYYYMMDD-HHMMSS(-n) → renameSync
      console.warn(`[settings] pix-settings.json 读取失败，已备份为 ${backupPath}：${err instanceof Error ? err.message : String(err)}`);
      return new Store<GuiSettings>(options); // 文件已挪走 ⇒ conf 走 ENOENT ⇒ 用 defaults 重建并落盘
    }
  }
  getAll(): GuiSettings { return sanitizeGuiSettings(this.store.store); } // 形状校验：recentProjects 必须数组，非法字段回落默认值
  ```
  `index.ts:214` 把链尾 `});` 改为 `}).catch((err) => { console.error("[main] whenReady failed:", err); dialog.showErrorBox("PiX-Read 启动失败", err instanceof Error ? err.message : String(err)); });`（`dialog` 追加到 `:9` 的 electron import；该弹框文案属新增 UI 文案，登记见 §5）。备份命名与 F9/F12 统一为 `<file>.corrupt-YYYYMMDD-HHMMSS(-n)`。
- 判据：
  - `%TEMP%` 探针 `probe-f3-conf.mjs`（真实 `conf`，非 mock）：`F3-a 坏 JSON 构造期必抛 SyntaxError`、`F3-b 改名后新实例回落 defaults 且原字节在备份里`、`F3-c 备份名唯一且匹配 /\.corrupt-\d{8}-\d{6}(-\d+)?$/`。
  - 真机走查（修复步执行）：`%APPDATA%\PiX-Read\pix-settings.json` 写入截断 JSON（与零字节两种）→ 启动 ⇒ 窗口出现、出现 `pix-settings.json.corrupt-*`、设置页为默认值；另走查 `getAll()` 在 `recentProjects: "x"` 时不得透出非数组（`ipc-handlers`/渲染层不再出现 TypeError）。
  - 走查：`constructor` catch→重试路径、`whenReady` `.catch` 路径逐行核对。
  - 为什么不用「① electron shim」：`settings-store.ts:5` `import Store from "electron-store"`，编译产物在 `%TEMP%` 下无法解析 `electron-store`（其内部还 require `electron` 与 `conf`）；若为它造 shim 等于桩掉「构造期抛错」这一被测行为，属循环论证。本路线承认真实类无自动化覆盖，以真机走查补齐（MF-10 ② 的登记方式）。
- 冻结面：不触既有断言（两个烟测编译面不含这两个文件，已核 `smoke-notes.mjs:1057-1099`）。
- 批次：B1（**最先做**，作为改坏也能重启的安全网）。

### F4 · 库根为目录联接/符号链接时整库被判越界（P0）
- 位置：`pix/src/main/library-root.ts:18-24`（`setLibraryRoot`）/`:38-51`（`isLibraryFilePath`）；`pix/src/main/pdf-tools.ts:18-47`（同构复制实现）。
- 修法（MF-7：双根判据；不得改 `isPathInsideDirectory`）：
  ```ts
  // library-root.ts
  let libraryRoot = "";
  let libraryRootReal = "";                       // setLibraryRoot 时缓存（realpath 失败回退字面）
  export function setLibraryRoot(root: string): void { /* …resolve + realpathSync 缓存… */ }

  /** 通用双根判定：字面候选 in 字面根 || （realpath 成功 && real 候选 in 解析根）。 */
  function contained(candidateResolved: string, candidateReal: string | null, allowRoot: boolean): boolean {
    const literal = normalizeFsPath(libraryRoot);
    const hit = (root: string, value: string): boolean => (value === root ? allowRoot : isPathInsideDirectory(value, root));
    if (hit(literal, candidateResolved)) return true;
    return candidateReal !== null && hit(libraryRootReal, candidateReal);
  }
  export function isLibraryFilePath(candidatePath: string): boolean {
    if (!libraryRoot) return false;
    const resolved = normalizeFsPath(candidatePath);
    let real: string | null = null;
    try { real = normalizeFsPath(realpathSync(candidatePath)); } catch { /* 不存在：只保留字面判定（既有语义） */ }
    return contained(resolved, real, false);
  }
  /** library-list 专用：额外放行库根自身（LibraryPanel.vue:86 传 rootDir）。 */
  export function isLibraryDirAllowed(candidatePath: string): boolean { /* 同谓词，allowRoot = true */ }
  /** pdf-tools 的 cwd 放行复用同一谓词（对 cwd 现场求 realpath），删除 pdf-tools 内复制实现。 */
  export function isPathInsideDirectoryResolved(candidatePath: string, directoryPath: string): boolean { /* 通用双根版本 */ }
  ```
  `pdf-tools.ts`：删除 `normalizeFsPath`（`:18-21`）与 `isInsideRoot`（`:23-40`），改 `isAllowedPdfPath = (p, cwd) => isLibraryFilePath(p) || isPathInsideDirectoryResolved(p, cwd)`，注释写明「cwd 放行 = 会话目录文件，不得删除」。`isPathInsideDirectory`（`library-root.ts:26-31`）**逐字不动**（`ipc-handlers.ts:677` 会话文件保护在用）。
- 判据：
  - `%TEMP%` 探针（`cmd //c mklink /J <link> <real>` 造目录联接）：`F4-a 联接根下经联接路径访问已存在文件 = true`（修复前 false）、`F4-b 经真实路径访问 = true`、`F4-c 联接根兄弟目录与 ../ 逃逸 = false`、`F4-d 不存在的库内路径（字面根下、含联接根下）= true`、`F4-e 普通目录根行为不变`。
  - `smoke-notes` 新增断言组（用 `symlinkSync(target, link, "junction")` 自造联接，断言后恢复根为 `WS_A`）：同 F4-a…F4-d 的纯函数级复跑。
  - 回归：`smoke-notes` 51/51、`smoke-view` 35/35（既有断言逐字不动）。
- 冻结面：`library-root.ts` 在 smoke-notes 编译面内（`smoke-notes.mjs:1089-1090`）；新增导出不产生新产物，`required/allowed` 不变；禁止给 `library-root.ts` 增加新 import；`isPathInsideDirectory` 语义不得放松。
- 批次：B1。

### F5 · MCP 工具被白名单过滤而设置页仍展示（P0）
- 位置：`pix/src/main/session-bridge.ts:1259-1271`（`tools` 10 项白名单 + `excludeTools`）；`pix/src/renderer/components/settings/McpSettings.vue:157`（`{{ server.transport }} · {{ server.toolCount }} 个工具`）、`:176-186`（工具 chips）。
- 修法：默认路径（不新增能力）——白名单处加 4 行注释说明只读边界；`McpSettings.vue` 在**面板级**新增说明（不要放行内：ui-shot stub `mcpGetServers` 返回 `[]`，行内文案不可断言），常量如 `"服务器工具不会提供给模型（PiX 只开放只读工具）"`，渲染为面板顶部 `.text-caption`/`v-alert`。若负责人裁决「开放 MCP 工具」，本条退出本清单、单独立项。
- 判据：人工走查（设置 → MCP：面板级文案可见；chips 不再暗示可用）；可选 `%TEMP%` 探针核对内核 `core/sdk.ts:286` 的 `allowedToolNames` 不含 `mcp__*`（写成「有意边界」的说明，**不**写成回归期望）。
- 冻结面：ui-shot 全脚本无设置页导航、无 MCP 断言（`mcpGetServers` stub 返回 `[]`，`:1142`）⇒ 无既有断言改动；新增用户可见文案须登记（§5）。**如实评估**：不新建 ui-shot 设置页场景（需首个设置页场景 + MCP 夹具，本轮预算不批）⇒ 该文案无自动化回归网，登记为已知缺口（§6）。
- 批次：B3。

### F6 · 发送失败丢弃用户正文（P1）
- 位置：`pix/src/renderer/components/workspace/ChatPanel.vue:343-395`（清空 `:369-372`，catch `:386-394`）。
- 修法：发送前快照 `sentDraft = draft.value`、`sentAttachments = [...attachments.value]`、`sentImages = [...clipboardImages.value]`（附件与截图 path/base64 都在内存里，同法回填——决定：文本+附件+粘贴图三者都还原，不再只还原文本）；catch 内：
  ```ts
  if (draft.value === "") draft.value = sentDraft;                                  // 不覆盖在途新输入
  if (attachments.value.length === 0 && sentAttachments.length > 0) attachments.value = sentAttachments;
  if (clipboardImages.value.length === 0 && sentImages.length > 0) clipboardImages.value = sentImages;
  nextTick(() => composerInput.value?.focus());
  ```
  `composerInput` 为新增模板 ref（`<InputArea ref="composerInput" …>`，`InputArea` 已 `defineExpose({ focus })`）；注释写明「还原的是发送瞬间快照；文件若已被外部删除会显示为失效 chip（既有 chip 语义）」。不加 ErrorBlock 重试按钮。
- 判据：离屏新记录（不动 45/45B/45C，新增截图 `45d-send-failure-restore.png`）：`clearSendCalls()` → `setSendFailure("throw")` → `setDraft(ASK45D)` → 点发送 → 等 `.error-block` → 断言 `.input-area` value === ASK45D、`userBlocks()` 回滚、`.composer-send` 非 disabled；再 `setSendFailure(null)` → 点发送 → `waitSendCalls(1)` 且 `.input-area` 清空（恢复后可重发）。
- 冻结面：45/45B/45C 的 `userBlocksRolledBack`（`ui-shot.mjs:4032`）与 `stub 发送注入异常`（`:4034-4039`）逐字保持；每轮先 `setDraft` 覆写（`:4026-4055`）不受还原影响。
- 批次：B2。

### F7 · 迟到 save 响应回灌已复位 store（P1）
- 位置：`pix/src/renderer/stores/reader-state-store.ts:108-121`（成功后无条件 `applyState` `:115-116`）、`:229-240`（`resetState` 只递增 `loadSeq` `:230`）。
- 修法：`let saveEpoch = 0;`；`submit` 开头 `const epoch = saveEpoch;`，`await` 之后（成功与 catch 两分支）先判 `if (epoch !== saveEpoch) return;`；`resetState` 内 `saveEpoch += 1;`（与 `loadSeq` 同段）。只丢弃跨 reset 的响应，不做其他时序改动。
- 判据：探针 `probe-f7-f10-stores.mjs`：`探针1-d 迟到 save 响应不得回灌已复位的 store` 由失败转通过；反向 `探针1-e 不 reset 时迟到响应必须写回`（防止过度丢弃）；离屏 20 系列 resume/徽标读数零回归。
- 冻结面：store 内部改动，无导出/契约/文案变化；无既有断言需改。
- 批次：B1（与 F12 同文件，一次改完）。

### F8 · 澄清请求替换时 `currentQuestionIndex` 未复位（P1）
- 位置：`pix/src/renderer/components/workspace/ChatPanel.vue:143-152`（现有两个 watcher）、`:206-212`（`currentQuestion` 早退）、`:691-704`（提交复位）/`:709-716`（取消复位）。
- 修法（浅层 getter，勿 `deep`）：
  ```ts
  watch(
    () => props.pendingUserInput?.id ?? null,
    () => { currentQuestionIndex.value = 0; answerMap.value = {}; },
  );
  ```
  `id` 变化与置 null 都会复位；`answerMap` 变更不触发。
- 判据：离屏新记录（label 建议 `clarify-replace`，截图 `r15-clarify-replace.png`）：`emitUserInputRequest({id:"r1",questions:[q1,q2]})` → `.card-textarea` 写值 + 点 `.next-btn` 推进到第 2 题 → `emitUserInputRequest({id:"r2",questions:[q1]})` → 断言 `.clarification-card` 在 DOM、`.question-progress` 文本 === `1 / 1`、`.card-textarea` 未 disabled。
- 冻结面：既有 41c 场景每次只发一个请求（`ui-shot.mjs:3547-3558`），不触新 watcher；`.question-progress` 文案（`ClarificationCard.vue:36`）与 `.clarification-card`/`.card-textarea` 类名不变。
- 批次：B2。

### F9 · notes 逃生口顺序与 `backupPath` 失联（P1，数据安全）
- 位置：`pix/src/main/notes-store.ts:528-552`（`renameSync` `:540`、写失败回传 `:547`、成功返回 `:551`）；`pix/src/renderer/stores/notes-store.ts:63`（类型）、`:382-396`（`recoverCorruptNotes`）；`pix/src/renderer/components/workspace/NotesPanel.vue:393-403`（`onRecover`）、`:405-413`（`revealPath`）、`:567`（`.notes-notice`）。
- 修法：
  - main：`:540` 的 `renameSync(paths.file, backupPath)` 改为 `copyFileSync(paths.file, backupPath)`（copy-first，原文件不动）；写失败时原文件与备份同时在（`:547` 分支保留 `backupPath`）。
  - renderer：`NotesActionResult`（`:63`）改为 `{ ok: true; backupPath?: string } | { ok: false; message: string; backupPath?: string }`；`recoverCorruptNotes` 两分支透传 `result.backupPath`。
  - `NotesPanel.onRecover`：失败 `重建失败：${result.message}${result.backupPath ? \`（原文件已备份：${result.backupPath}）\` : ""}`；成功 `已备份原文件并新建空库：${result.backupPath}`；新增 `lastBackupPath` ref，在 `.notes-notice` 内加「在文件夹中显示」按钮调用 `revealPath(lastBackupPath)`。
- 判据：
  - `smoke-notes` G4 既有断言逐字保留 + 新增：成功路径 `backupPath` 非空、`existsSync(backupPath) === true`、备份字节 === 损坏前字节；注入写失败路径：把 `<notes.json>.tmp` 预置为目录 ⇒ `resetCorruptNotes()` 返回 `success:false` 且 `existsSync(NOTES_A) === true`（copy 语义）、`backupPath` 非空且存在；断言后清理该目录。
  - 离屏新记录：写坏 `notes.json` → 展开逃生口 → 点「备份原文件并新建空库」（按文本查找按钮）→ 断言 `.notes-notice` 文本包含 stub 的 `backupPath`（`NOTES_FILE + ".bak"`，`ui-shot.mjs:1070`）。
- 冻结面：既有 `backups.length === 1`、`/^notes\.json\.corrupt-\d{8}-\d{6}(-\d+)?$/`、`rebuiltText === serialize([])`（`smoke-notes.mjs:469-481`）在 copy 实现下逐字保持；`undoSlot` 清槽语义不变；ui-shot 无既有 reset 文案断言。
- 批次：B1。

### F10 · `loadNotes` catch 缺 `writeSeq` 守卫（P1）
- 位置：`pix/src/renderer/stores/notes-store.ts:227-258`（成功分支守卫 `:234`，catch `:252-257` 只有 `seq !== loadSeq`）。
- 修法：catch 首行改为 `if (seq !== loadSeq || startWriteSeq !== writeSeq) return;`（`startWriteSeq` 已在 `:229` 捕获）。已核安全性：只有 `applyNotes`（`:184`）与 `recoverCorruptNotes`（`:387`）递增 `writeSeq`，二者都把 `status` 推到 `ready`，stale catch 直接 return 不会留下 loading。
- 判据：探针 `探针2-c 写成功后到达的 load reject 不得把面板推入 error 态` 转绿；保留 `探针2-a`（loading）与 `探针2-d`（数据仍在）防「清空状态换通过」；离屏笔记场景零回归。
- 冻结面：无既有断言需改（error 态场景由 `result.success === false` 驱动，不经 catch）。
- 批次：B1（与 F9 同文件）。

### F11 · 会话生命周期无互斥（P1）
- 位置：`pix/src/main/session-bridge.ts:202-219`（`start`）、`:279-311`（`newSession`/`switchSession`）、`:313-379`（`fork`）、`:381`（`navigateTree`）、`:222`（`dispose`）、`:768`（`isRunning`）、`:1277-1283`（`_activateSession`）、`:1385-1392`（`_setupEventSubscription` 覆盖 `_unsubscribe`）；`pix/src/main/ipc-handlers.ts:359-368`（失败分支 `clearLibraryRoot` `:365`）；`pix/src/renderer/pages/HomePage.vue:43-61`（`openWorkspace`）。
- 修法：
  1. 桥内单一串行门：
     ```ts
     private _lifecycleChain: Promise<void> = Promise.resolve();
     private _enqueueLifecycle<T>(job: () => Promise<T>): Promise<T> {
       const run = this._lifecycleChain.then(job, job);          // 前序失败也继续（gate 不吞错）
       this._lifecycleChain = run.then(() => undefined, () => undefined);
       return run;
     }
     ```
     `start`/`newSession`/`switchSession`/`fork`/`navigateTree`/`dispose` 主体包进 `_enqueueLifecycle`。
  2. 同 dir 幂等（串行段内、`_closeCurrentSession` 之前判）：
     ```ts
     if (this._session && this.isRunning() && normalizeFsPath(projectDir) === normalizeFsPath(this._cwd)) {
       if (guiSettings) this._guiSettings = guiSettings;   // 幂等返回也更新设置（调用方无其他依赖）
       return;
     }
     ```
     路径归一化用 `normalizeFsPath` 语义（`resolve` + win32 小写）。
  3. `_setupEventSubscription`（`:1385`）首行 `this._unsubscribe?.(); this._unsubscribe = null;`，杜绝句柄覆盖泄漏。
  4. `ipc-handlers.ts:365`：`clearLibraryRoot()` 改为 `if (!sessionBridge.isRunning()) clearLibraryRoot();`（第二个 `session-start` 失败不得清掉仍在运行会话的库根）。
  5. `HomePage`：`const opening = ref(false);`，`openWorkspace` 顶部 `if (opening.value) return;`，主体 `try { … } finally { opening.value = false; }`；最近项目条目 `:disabled="opening"`。
- 判据：
  - 探针 `probe-f11-bridge.mjs`（harness 见附录 A；若桥真机环境不可行则降级为「真机手工 + 走查」，须在 dev 档写明）：用例①同 dir 双击 ⇒ 1 会话 / 1 次 `ready` / 0 次 dispose / 终态 dir 不变（`F11-a 同 dir 幂等`）；用例②`start(A)` → `start(B)` 串行 ⇒ `ready ×2`、A 被 dispose 恰 1 次、无孤儿（订阅数 1）、终态会话与 `_cwd === B`（`F11-b A→B 串行`）。注意：期望不是「ready 只 1 次」（两个不同项目）；库根不在桥层判定（由 IPC 层 `:362` 设置）。
  - 真机手工：双击「最近打开」只重建一次会话；快速返回首页无孤儿。
  - 走查：串行门覆盖清单（start/newSession/switchSession/fork/navigateTree/dispose）与 `_unsubscribe` 二次覆盖点。
- 冻结面：触 `agent-ready`/`exit` 事件次数与 `agentStatus`（§7 已列属实）；ui-shot 的 stub `startSession` 只记录不拒绝（`:818`），无既有并发断言；`_activateSession` 不改事件发出顺序（`ready` 仍在其尾）。
- 批次：B2。

### F12 · reader-state 降级契约（P1，数据安全）
- 位置：`pix/src/main/reader-state-store.ts:205-216`（`missing/corrupt/version/read-failed` 同列 degraded 并 warn `:213-214`）、`:225-250`（读到 corrupt/version 用空模型整体覆盖 `:238-249`）、`:181-196`（`writeFileAtomic`）；渲染 `pix/src/renderer/stores/reader-state-store.ts:152-175`（`success/code/error` 零消费）；脚本 `pix/scripts/smoke-notes.mjs:1089-1101`（编译面）；`pix/scripts/ui-shot.mjs:1105-1113`（stub）、`:1802-1805`（相位 20b）、`:2175-2177`（相位 23）、`:382-407`（`writeFixtures`）。
- 修法（MF-3 / MF-14 全采）：
  - main：
    - `missing` 摘出 degraded：`:212-213` 前加分支——`if (read.reason === "missing") return { success: true, state: emptyState(), filePath, degraded: false };`（保留「一条失败一行日志」的 corrupt/version/read-failed 语义）。
    - `corrupt` 重建前 copy-first 备份（与 F9 一致，不用 rename-first）：`copyFileSync(filePath, uniqueBackupPath(filePath, Date.now()))`（本地 12 行 `uniqueBackupPath`，命名规则同 F9：`reader-state.json.corrupt-\d{8}-\d{6}(-\d+)?`），路径进 `warn`；随后原子写。
    - `version-unsupported` 对齐 notes-store 的「拒写」行为：`saveReaderState` 读到版本不符时直接拒写，原文件字节不变。**注意 `ReaderStateErrorCode`（`shared/types.ts:486`）不含 `version-unsupported`，而 `shared/types.ts` 不在白名单** ⇒ 不用 `failure(code)` 辅助，改为不带 code 的内联失败返回并单独 warn：
      ```ts
      if (!read.ok && read.reason === "version-unsupported") {
        warn("save rejected: 阅读状态文件版本不支持（未写入）");
        return { success: false, state: emptyState(), error: "阅读状态文件版本不支持（未写入）" };
      }
      ```
      渲染层 warn 走既有 `result.code ?? "unknown"` 格式（不被断言）。
    - `read-failed` 保持拒写。
  - renderer `loadReaderState()`：
    ```ts
    ready.value = true;
    if (!result.success) {
      degraded.value = false;
      applyState(result.state);
      committed = null;
      warn(`load failed (${result.code ?? "unknown"}): ${result.error ?? ""}`);
      return;
    }
    degraded.value = result.degraded;
    // …既有 applyState/播种/warn 分支不动…
    ```
  - smoke-notes：`required` 追加 `"main/reader-state-store.js"`（`:1089`；`allowed` 不变，已核该模块只 import `library-root` + `shared/types`）；新增断言组（见判据）。
  - ui-shot（同一批次内完成，否则零缺失复跑必红/假绿）：
    - `:1805` 的 `await waitWarnIncrement(warnBase20b, "missing 降级 warn");` 替换为有界静默 `await sleep(600);`，并在 20b 的 `record` 里新增 `warnDelta20b` 断言 `=== 0`（label 建议 `missing 不得再产生 [reader-state] warn`）。
    - stub `readerStateLoad`（`:1105-1113`）：`read.reason === "missing"` 时返回 `{ success:true, state: emptyState(), filePath: file, degraded:false }`；其余 reason 仍 `degraded:true`（与真实主进程同步，防假绿）。
    - 相位 23 的 `warnDelta === 1`（`:2175-2177`）**逐字保持**（corrupt 路径的 load warn 不变；备份发生在 save 侧，不增 load warn）。
    - `writeFixtures`（`:382-407`）：新增清理两个库 `.pix-read` 下的 `reader-state.json.corrupt-*`（防跨轮累积）；13d 的 `.pix-read` 断言（用相位内基线）不动。
- 判据：
  - `smoke-notes` 新组（真实主进程模块）：`F12-a missing ⇒ degraded===false 且 [reader-state] warn 计数 0`（monkeypatch `console.warn` 捕获）、`F12-b corrupt ⇒ degraded===true + warn 1 + 备份存在 + save 成功`、`F12-c version:2 load degraded + save 拒写（success===false、error 逐字「阅读状态文件版本不支持（未写入）」）且文件 sha256 不变`、`F12-d read-failed ⇒ 拒写（回归）`、`F12-e 备份名匹配 /reader-state\.json\.corrupt-\d{8}-\d{6}(-\d+)?/`。
  - 渲染侧探针（`probe-f7-f10-stores.mjs` 增量）：桩 IPC 返回 `{success:false, code:"no-root"}` ⇒ 出现 `load failed (no-root)` warn 且 `ready === true`。
  - 离屏：20b 增量为 0、相位 23 保持 1、13d `.pix-read` 断言不变。
- 冻结面：`ui-shot.mjs` 必须列入 F12 归属（MF-9）；`smoke-notes` 编译面白名单变更（`required` 追加一项，`allowed` 不变）；新备份文件命名与 F3/F9 统一。
- 批次：B1。

### F13 · takeHerEyes 失败路径静默（P1）
- 位置：`pix/src/main/session-bridge.ts:998-1039`（静默早退 `:1003`、`:1012`、`:1015-1016`，auth 失败 `:1036-1039`）；渲染兜底 `pix/src/renderer/stores/session-store.ts:354-375`；标签 `pix/src/renderer/components/workspace/ChatPanel.vue:783-787`。
- 修法（MF-4 收窄）：只在 `images.length > 0 && config?.enabled === true && config.provider && config.modelId` 成立时，对「已启用但不可用」的分支发 `eye_model_end{success:false}`：
  - 新增局部 `emitUnavailable(errorMessage: string)`，字段 `provider/modelId` 取配置值、`imageCount = images.length`、`id` 为本次 `operationId`；
  - 覆盖分支：`eyeModel` 不存在或非 image 模型 / `hasConfiguredAuth(eyeModel) === false` / `auth.ok === false`（`:1036`）；
  - **不**对 `images.length === 0`（`:1003`）或「功能未启用/配置不完整」（`:1012`）发射（`_tryTakeHerEyes` 每次 prompt 都被调用，`:979`），避免普通文本提问产生失败块噪声；
  - 成功路径逐字不动；`errorMessage` 采用中文短句（建议「配置的视觉模型不可用」/「视觉模型未配置鉴权」/「鉴权失败」）。
  - 决定：`errorMessage` **不在 UI 呈现**（`visionStatusLabel` 保持逐字），仅进事件载荷与日志 → 登记为已知缺口（§6）。
- 判据：
  - 走查：发射条件集合逐点核对（含「哪些分支不发」的反向清单）。
  - 真机走查（无 harness，MF-17 允许）：设置里填不存在的视觉模型并开启 takeHerEyes → 发带截图提问 ⇒ 聊天流出现 `vision-status` 失败块、普通文本提问不出现该块；成功路径不受影响。
  - 可选离屏（仅覆盖渲染兜底，不代表 F13 本身）：`emitAgentEvent({type:"eye_model_end", id:"…", success:false, …})` ⇒ 失败块渲染（新增记录，注明性质）。
- 冻结面：仅新增事件，不改成功路径；`visionStatusLabel` 文案不改；无既有断言需改（离屏默认不加 stub 注入）。
- 批次：B3。

### F14 · `installUpdate` 吞掉拒绝结果（P1）
- 位置：`pix/src/main/preload.ts:108`（`installUpdate: () => void;`）/`:193`；`pix/src/renderer/pages/SettingsPage.vue:309-313`（`if (result.success) { window.pixApi.installUpdate(); }` 不 await 不看返回值）；主进程 `pix/src/main/ipc-handlers.ts:617-636`（有拒绝分支，返回 `{success:false,error}`）；stub `pix/scripts/ui-shot.mjs:1147`。
- 修法：`PixApi.installUpdate: () => Promise<{ success: boolean; error?: string }>`（名称/顺序不变，42 方法集合不变；`renderer/types/ipc.ts` 自动继承）；`SettingsPage.downloadAndInstall` 改 `const installed = await window.pixApi.installUpdate(); if (!installed.success) updateError.value = installed.error ?? "安装更新失败";`；ui-shot stub 改 `installUpdate: function () { return { success: true }; }`（PRD §5.9 契约卫生；实测无场景调用，不构成硬依赖——更正 R15-audit §7.2 第 1 条）。
- 判据：人工（真机）：会话运行中在设置页点「安装更新」⇒ 页面出现「有会话正在运行，请先停止会话再安装更新。」文案且应用不退出（文案来自主进程 `:621`，逐字核对）；无会话时行为不变（走查 `quitAndInstall` 路径）。
- 冻结面：preload 方法名与顺序 42 项不变；stub 返回对象；`ui-shot.mjs` 无既有安装断言（无场景点击）。
- 批次：B2。

### F15 · useRpc 双失败通道（P1）
- 位置：`pix/src/renderer/composables/useRpc.ts:187-195`（`sendCommand` 静默）vs `:197-206`（`sendCommandOrThrow` 抛）；静默组 `:323-326`（`setSessionName`）、`:340-342`（`setScopedModels`）、`:356-361`（`setApiKey`/`removeAuth`）、`:427`/`:441`/`:449`（`setSteeringMode`/`setFollowUpMode`/`reloadResources`）；消费点 `SettingsPage.vue:82-106`（`saveKey`/`deleteKey` 的 catch 因此不可达）、`ChatPanel.vue:671-681`（`saveRename` try/finally **无 catch**）、`:1116`（模板裸调用 `@click="rpc.abort()"`）。
- 修法：上列 7 个命令改走 `sendCommandOrThrow`（其中 `setScopedModels`/`setSteeringMode`/`setFollowUpMode`/`reloadResources` 实测零调用点，改后注明「当前零调用点」）；`ChatPanel.saveRename` 加 catch：新增 `renameError` ref，失败置 `重命名失败：${message}` 并在重命名对话框内以 `<v-alert type="error" density="compact">` 渲染（打开/提交时清空）；`rpc.abort()` **保持** `sendCommand`（不进入变更集：停止失败无用户可操作项，且模板裸调用无 catch ⇒ 保持静默是显式判定，满足 MF-5 的逐点核对要求）。
- 判据：探针 `probe-f15-useRpc.mjs`：`探针3-a setApiKey 在 {success:false} 下必须让调用方感知` 由失败转通过；`探针3-b 正常路径 {success:true} 不得抛`（对照 setModel 现有抛出实现）；真机走查：设置页密钥保存失败出现中文提示（既有 catch 文案 `保存 API 密钥失败`/`删除 API 密钥失败` 逐字可用）。
- 冻结面：ui-shot 无这些命令断言、无设置页场景；避免「静默失败 → 未处理拒绝」：`saveRename` 的 catch 必须同批落地；`abort` 的静默判定写进提交说明。
- 批次：B2。

### F16 · `onMounted` await 后注册订阅（P1）
- 位置：`pix/src/renderer/pages/WorkspacePage.vue:74-125`（四个 await 后才 `onAgentEvent` `:106-124`）、`:127-141`（`onUnmounted` 只做 `unsubscribeEvent?.()`）。
- 修法：`let disposed = false;`；`onUnmounted` 置 `disposed = true`；每个 `await` 之后 `if (disposed) return;`（注册顺序与 `agent_start` 早到时序逐字不动）；若 `disposed` 已在 `onAgentEvent` 之后命中，则不再注册或立即解绑（二选一，推荐「注册前判 disposed」）。
- 判据：离屏：ui-shot stub 新增注册计数口（`agentEventListenerCount()`，配套 `agentEventHandlers` 数组 `:850-858`），用既有 `setLoadDelay`（作用于 `notesLoad`，`:883`）造慢 IPC → 进入工作区后立即返回首页 ⇒ 断言注册数 === 解绑数（当前多 1 次注册且无解绑）、随后 `emitAgentEvent({type:"agent_start"})` 不再触发 `listSessions`（stub `listSessions` 需加调用计数，`:866`）。
- 冻结面：不动注册顺序；`setLoadDelay` 作用面不变；无既有断言需改。
- 批次：B2。

### F17 · 大输入无上限 + pdf 整读/双拷贝（P1；附件子项条件降级）
- 位置：`pix/src/main/pdf-tools.ts:46-53`（守卫）、`:96-107`（`readFileSync` + 第二份 `Uint8Array`）；对照口径 `pix/src/main/ipc-handlers.ts:61`（`MAX_READABLE_FILE_BYTES = 256 * 1024 * 1024`）、`:494-500`（可读文案）；附件侧 `pix/src/main/chat-files.ts:54`/`:90`。
- 修法（**本轮只做 pdf 侧 F17a**）：
  - 新增 `pix/src/shared/limits.ts`（叶子常量，仅两个常量 + 注释）：`MAX_PDF_BYTES = 256 * 1024 * 1024`、`MAX_TEXT_ATTACHMENT_BYTES`/`MAX_IMAGE_ATTACHMENT_BYTES`（为 F17b 预留，本轮不被引用）；**约束：不得被 `library-root`/`notes-store`/`reader-state-store` 反向依赖**（否则 smoke-notes 的 required/allowed 会红）。
  - `resolveGuardedPdfPath`：在 exists/`statSync` 之后加 `if (stat.size > MAX_PDF_BYTES) return { error: \`PDF too large: ${Math.round(stat.size / 1048576)} MB > 256 MB\` };`（新增用户可见文案，登记 §5）。
  - `withPdfDocument`：`readFileSync` 改 `await readFile(filePath)`，删除 `new Uint8Array(file.byteLength)` 第二份拷贝（`Buffer` 即 `Uint8Array`；注释说明 pdf.js 在本仓 in-process fake worker 下不做 transfer/detach，若将来改 worker 需还原拷贝）。
  - **F17b（chat-files 附件上限）条件降级**：产品口径（文本截断 vs 图片拒绝）未裁决前不入册；降级理由与触发条件见 §6。`chat-files.ts` 本轮不改。
- 判据（探针 `probe-f17-pdf.mjs`，harness 见附录 A）：
  - `F17-a` `%TEMP%` 造 300MB 稀疏文件（`truncateSync`）→ 调 `pdf_read_pages.execute` ⇒ 返回含 `PDF too large` 的文本且进程不崩、`details.error` 可读；
  - `F17-b` 正常 PDF 仍可读页文本（回归）；
  - `F17-c` 走查：`grep -n "readFileSync" src/main/pdf-tools.ts` 零命中；
  - 可选读数：同请求连调两次对 event loop 无同步阻塞（`setTimeout` tick 延迟读数，仅作观测）。
- 冻结面：pdf 工具错误文案无既有断言（实测 scripts 无 `Path is outside`/`too large` 断言）⇒ 文案选择自由，但属新增用户可见文案须登记；`shared/limits.ts` 不得进 smoke 编译面的反向依赖链。
- 批次：B3。

### F18 · 框选截图失败静默 + 无条件退出模式（P1）
- 位置：`pix/src/renderer/components/workspace/PdfViewer.vue:531-544`（`:541` 调 `captureRegion`，`:543` 无条件 `exitCaptureMode()`）、`:556-624`（7 处裸 `return`：`:559/588/590/592/602/617/620`）、`:934`（`.capture-hint` 文案）。
- 修法：`captureRegion(rect): boolean`（成功 = 已 `emitRegionCapture`）；`onCapturePointerUp` 改为：
  ```ts
  if (rect && rect.width >= MIN_CAPTURE_PX && rect.height >= MIN_CAPTURE_PX) {
    if (!captureRegion(rect)) {
      captureFailed.value = true;      // 失败保留框选模式并提示
      return;
    }
  }
  exitCaptureMode();
  ```
  「误触阈值」（宽高 < 6px，`MIN_CAPTURE_PX` `:82`）分支保持退出（R4 既有语义）；新增独立提示节点（建议 `.capture-error-hint`，与 `.capture-hint` 并列，不改 `:934` 文案），进入框选/成功时清空 `captureFailed`。
- 开工前置：R4 设计「松手后退出模式」的交互语义变更**在本档 §5 完成登记**（旧值/新值/涉及断言），F18 不再条件降级。
- 判据：离屏（R4 场景 `SEL.captureLayer`/`captureFabBtn` `:87-88` 驱动）：进入框选 → `js` 把当前页 `canvas.width = 0; canvas.height = 0` → 派发 PointerEvent 拖拽（`pointerdown` → `pointermove` ≥6px → `pointerup`；注意 `setPointerCapture` 对合成事件可能抛 NotFoundError，`pointerup` 侧已有 try/catch，`pointerdown` 抛错不影响状态推进，ui-shot 不以 console error 判定失败）⇒ 断言 `.capture-layer` 仍在 DOM、`.capture-error-hint` 出现、`.pdf-capture-fab` 仍激活；反向：正常拖拽 ⇒ 退出模式且 composer 出现「截图 1」chip（既有 chip 文案）。
- 冻结面：`SEL.captureLayer`/`captureFabBtn` 不变；既有 r11 相位只做 Esc（`:6391-6445`、`:7355-7370`）不受影响；`.capture-hint` 文本不改；新增提示节点属新增 UI ⇒ 需场景与截图（本判据自带）。
- 批次：B3。

### F19 · `library-list` / `library-open-path` 缺根校验（P1）
- 位置：`pix/src/main/ipc-handlers.ts:423-437`（list）、`:438-446`（open）、`:447-450`（show-in-folder，保持现状 + 注释）；对照 `:188-200` 的 `guardLibraryPath`；调用方 `LibraryPanel.vue:86`（`libraryList(props.rootDir, 3)`）、`PdfViewer.vue:727`、`ReaderPanel.vue:145`。
- 修法（MF-1 阻断项）：
  - `library-root.ts` 增 `isLibraryDirAllowed`（F4 同一双根谓词，`allowRoot = true`）。
  - `library-list`：入参校验 → `!getLibraryRoot()` ⇒ `{success:false, code:"no-root"}` → `resolve(dir)` 不通过 `isLibraryDirAllowed` ⇒ `{success:false, code:"outside"}` → `statSync` 区分 `not-found`（不存在：`目录不存在：<path>`）与 `not-a-directory`（存在非目录：`不是目录：<path>`）→ 通过后走既有 `listLibraryChildren`。
  - `library-open-path`：`resolve` 后必须 `isLibraryFilePath(resolved)`（严格根内，根自身拒绝）→ `existsSync` 失败 `not-found` → 再 `shell.openPath`；注释「根外一律拒绝；两个调用方都传库内文档路径」。
  - `library-show-in-folder` 保持现状 + 注释（设置页需根外能力）。
  - **不得**把 `isPathInsideDirectory` 直接用于根判定（`relative === ""` 会拒绝库根自身 ⇒ 资料库树整体加载失败）。
- 判据：MF-15 选「抽纯函数入 smoke 面」——
  - `smoke-notes` 新增断言：`isLibraryDirAllowed(root) === true`（库根）、根内子目录 true、兄弟目录 false、`../` 逃逸 false、无根 false；`isLibraryFilePath(根自身) === false`（严格语义保留）。
  - 走查 + 真机：打开资料库树正常（回归）、`libraryList("C:/")` 类根外调用在真机上被拒（IPC 层无自动化 harness，登记为「无自动化回归网」口径：handler 装配走查 + 真机步骤，见 §6）。
- 冻结面：不触既有断言；ui-shot 的 `libraryList`/`libraryOpenPath` 是独立 stub（`:869-870`），收紧 main 不改变离屏行为；`guardLibraryPath`/`library-read-*` 语义不动。
- 批次：B1。

### F20 · `enabledModels` 0 命中静默放宽（P1）——**降级为 D（确定）**
- 位置：`pix/src/main/session-bridge.ts:1145-1152`（`_applyEnabledModelScope`）、`:1154-1180`（`_resolveScopedModels`）、`:1273`（会话创建期调用点）、`:470-479`（live 重算对照）。
- 降级理由（逐条）：① 修法在主要路径（会话创建 `session-bridge.ts:1273`）是 no-op：新会话 `_scopedModels` 默认 `[]`，「不清空」与清空等价；② 判据「列表不变成全部」在创建路径不可能通过；③ 「保留上一次」仅在 live 重算路径（`:524/534/571`）有效且与内核分叉（内核 0 命中同样回退，只是有 warn）；④ 收益退化为「补一条 warn + 文档登记」。
- 处置：登记为 D（§6）。替代方案（可选、随 D 一起记录，不占本轮在册名额）：`_applyEnabledModelScope`（`:1145-1152`）0 命中时加一行 `console.warn`（措辞对齐内核 `model-resolver`）+ 在本档 §5 登记匹配规则分叉（PiX 无 `[]`/无部分匹配/无别名）。
- 冻结面：无既有断言覆盖（ui-shot 无设置页、无模型选择器断言）；`session-bridge.ts` 白名单归属移除 F20。
- 批次：不实施（登记）。

---

## 2. 批次与串行计划（3 批）

每批结束的硬门槛（任一失败即停、修到全绿再进下一批）：

```bash
cd pix && npm run check                       # exit 0
cd pix && node scripts/smoke-notes.mjs        # 失败 0
cd pix && node scripts/smoke-view.mjs         # 失败 0
```

### B1 · 主进程数据安全与路径（F3 → F4 → F19 → F9 → F10 → F7 → F12）
- 批内顺序（同文件冲突点已排开）：
  1. **F3**（`settings-store.ts` + `index.ts`）——最先，保证后续改坏也能重启；
  2. **F4**（`library-root.ts` 谓词 + `pdf-tools.ts` 去复制）→ **F19**（`ipc-handlers.ts` 消费新谓词；同文件 `library-root.ts`，F4 先落）；
  3. **F9**（`main/notes-store.ts` copy-first + `renderer/stores/notes-store.ts` 类型/透传 + `NotesPanel.vue`）→ **F10**（同 renderer `notes-store.ts`，紧随其后一次编辑）；
  4. **F7**（renderer `reader-state-store.ts` saveEpoch）与 **F12**（main `reader-state-store.ts` + renderer `loadReaderState` + smoke 编译面 + ui-shot 20b/stub/fixture）——同文件，同批一次改完；
  5. 批内最后统一改 `smoke-notes.mjs`（F4/F9/F19/F12 的新增断言与编译面）——避免多次触碰同一脚本。
- 本批完成后跑门槛三命令（smoke-notes 总数上升、失败必须 0）。
- ui-shot 变更随批落地但本批不跑（F12 的 20b/stub 属语义原子改动，不能留到离屏轮再补）。

### B2 · 会话生命周期、输入与命令契约（F11 → F1 → F6 → F8 → F15 → F14 → F16）
- 批内顺序：
  1. **F11**（`session-bridge.ts` 串行门/幂等/订阅 + `ipc-handlers.ts:365` + `HomePage.vue`）——先立并发门；
  2. **F1 → F6 → F8 → F15**（同文件 `ChatPanel.vue` 一次编辑：IME 守卫、失败还原、澄清 watcher、saveRename catch；`InputArea.vue`、`useRpc.ts`、`SettingsPage.vue` 同批）；
  3. **F14**（`preload.ts` + `SettingsPage.vue` + ui-shot stub `:1147`；同文件 `SettingsPage.vue` 与 F1/F15 已在上一步改完）；
  4. **F16**（`WorkspacePage.vue` + ui-shot stub 计数/scene）最后，避免与 F11 的 HomePage/Workspace 生命周期交叉。
- 门槛三命令保持绿（本批不触 smoke 编译面）。

### B3 · PDF 阅读链、大输入与文案（F2 → F18 → F13 → F17 → F5）
- 批内顺序：
  1. **F2 → F18**（同文件 `PdfViewer.vue`，一次编辑；ui-shot 新增 SEL/场景同批）；
  2. **F13**（`session-bridge.ts`，与 B2 的 F11 不同批次但顺序在后，无冲突）；
  3. **F17**（`shared/limits.ts` 新增 + `pdf-tools.ts`；同文件 `pdf-tools.ts` 已在 B1 由 F4 改过，顺序必须 F4 先）；
  4. **F5**（`McpSettings.vue` 文案 + 白名单注释）最后。
- 门槛三命令保持绿；随后进入 §4 全量验证（含离屏）。

### 全局串行约束
- 同一文件的改动必须在同一批内完成，不做跨批并行；`smoke-notes.mjs` 只在 B1 集中改一次；`ui-shot.mjs` 允许 B1/B2/B3 各改一段，但**离屏只在全部改完后跑一次**（避免多次基线更替）。
- F4 → F17 顺序（同 `pdf-tools.ts`）与 F9 → F10、F7 → F12（同 store）为硬顺序；其余为建议顺序。

---

## 3. 文件白名单（24 个，全部在 `pix/` 内，不含 `packages/*`）

与 R15-audit §5 一致；F 归属按本档更新（F20 移除、ui-shot/smoke-notes 归属补齐）。不得新增表外文件。

| # | 文件 | 关联 F |
| --- | --- | --- |
| 1 | `pix/src/main/session-bridge.ts` | F5, F11, F13 |
| 2 | `pix/src/main/settings-store.ts` | F3 |
| 3 | `pix/src/main/index.ts` | F3 |
| 4 | `pix/src/main/library-root.ts` | F4, F19 |
| 5 | `pix/src/main/pdf-tools.ts` | F4, F17 |
| 6 | `pix/src/main/chat-files.ts` | F17（仅 F17b 启用时） |
| 7 | `pix/src/main/ipc-handlers.ts` | F11, F17, F19 |
| 8 | `pix/src/main/preload.ts` | F14 |
| 9 | `pix/src/main/notes-store.ts` | F9 |
| 10 | `pix/src/main/reader-state-store.ts` | F12 |
| 11 | `pix/src/shared/limits.ts`（新增） | F17 |
| 12 | `pix/src/renderer/components/input/InputArea.vue` | F1 |
| 13 | `pix/src/renderer/components/workspace/ChatPanel.vue` | F1, F6, F8, F15 |
| 14 | `pix/src/renderer/components/workspace/PdfViewer.vue` | F2, F18 |
| 15 | `pix/src/renderer/components/workspace/NotesPanel.vue` | F9 |
| 16 | `pix/src/renderer/components/settings/McpSettings.vue` | F5 |
| 17 | `pix/src/renderer/stores/reader-state-store.ts` | F7, F12 |
| 18 | `pix/src/renderer/stores/notes-store.ts` | F9, F10 |
| 19 | `pix/src/renderer/composables/useRpc.ts` | F15 |
| 20 | `pix/src/renderer/pages/SettingsPage.vue` | F1, F14, F15 |
| 21 | `pix/src/renderer/pages/HomePage.vue` | F11 |
| 22 | `pix/src/renderer/pages/WorkspacePage.vue` | F16 |
| 23 | `pix/scripts/smoke-notes.mjs` | F4, F9, F12, F19 |
| 24 | `pix/scripts/ui-shot.mjs` | F1, F2, F6, F8, F9, F12, F14, F16, F18 |

说明：`renderer/types/ipc.ts` 不单列（F14 签名自动继承，已核 `import type { PixApi } from "../../main/preload"`）；`shared/types.ts` **不列入、不修改**——已核 `ReaderNotesResetResult.backupPath?: string`（`:449`）与 `ReaderStateLoadResult.reason/code`（`:499-506`）现成，F9/F12 所需的返回形状不需要扩类型；F12 的 version-unsupported 拒写按上文走「不带 code 的失败返回」以避免新增 `ReaderStateErrorCode`；`smoke-view.mjs` 不修改（仅作回归门槛）；F5 不新建设置页场景，故 ui-shot 归属不含 F5；F17b 若不启用则 `chat-files.ts` 不修改。

---

## 4. 验证方案（修复后必须复跑）

### 4.1 命令序列（按序执行，任一失败即停）

```bash
cd pix
npm run check                                            # 0 error
node scripts/smoke-notes.mjs                             # 通过 >=51 / 失败 0（新增组后总数上升）
node scripts/smoke-view.mjs                              # 通过 >=35 / 失败 0
PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-r15-final" \
  PATH="/c/Program Files/nodejs:$PATH" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs       # 不得与其它取证并发（端口 5199）
```

### 4.2 离屏「零缺失」口径（⊇ 基线，不是相等）

基线目录：`C:/Users/86157/AppData/Local/Temp/pix-v05-r14-final`（实测：143 png、`MANIFEST.failure===null`、`MEASUREMENTS.json` 211 条 / 51 label）。

1. `MANIFEST.failure === null`；`99-failure-state.png` 不存在；退出码 0。
2. `MANIFEST.shots[].name` 集合 ⊇ 基线 143 个成功帧名（逐名比对，缺失数必须为 0）；新增帧为 Δ 增量（F1/F2/F6/F8/F9/F16/F18 的新截图）。
3. `MEASUREMENTS` 的 label 集合 ⊇ 基线 51 种（条目数 ⊇ 211）；新增测量逐条复核。
4. 已知 flake：若 `r11-3` 相位 4「摘录浮层」超时（S-SD-02，环境性），按 R14 先例重跑一次并在 dev 档记录；不得把超时当通过。
5. 产物自净：跑完 `git status --short` 无新增残留；产物只落在 `PIX_SHOT_ROOT` 内。

### 4.3 冻结面逐条核对清单（修复后人工过一遍）

| 类 | 冻结内容（逐字） | 位置 |
| --- | --- | --- |
| ui-shot 既有断言 | 场景 43 steer 驱动 `new KeyboardEvent("keydown", { key: "Enter", bubbles: true })`（未传 isComposing） | `ui-shot.mjs:2435` |
| ui-shot 既有断言 | 45/45B/45C 的 `userBlocksRolledBack`、`stub 发送注入异常` | `ui-shot.mjs:4032`,`:4034-4039` |
| ui-shot 既有断言 | `第 3 / 3 页`（含 110% 缩放：`:1794/1795`、`:1924/1925`、`:1980`、`:2031`）；`缩小后应回到 100%` | `ui-shot.mjs:7128` 等 |
| ui-shot 既有断言 | 相位 23 `warnDelta === 1`（`[reader-state] warn 增量应为 1，实际 …`）；13d `.pix-read` 相位内基线断言 | `ui-shot.mjs:2175-2177`、`:7695`、`:7750-7776` |
| ui-shot 必须同步 | 20b `waitWarnIncrement(warnBase20b, "missing 降级 warn")` → 有界静默 + `warnDelta20b === 0`；stub `readerStateLoad` missing ⇒ `degraded:false`；stub `installUpdate` ⇒ `{success:true}` | `ui-shot.mjs:1805`、`:1105-1113`、`:1147` |
| 烟测断言 | `smoke-notes` 51 条（含 `backups.length === 1`、备份名正则、`rebuiltText === serialize([])`）；`smoke-view` 35 条（`badge-counts #4` 比较键归一） | 两脚本正文 |
| 冻结类名/选择器 | `.pdf-page`/`.textLayer`/`.pdf-scroll`/`.pdf-error`/`.capture-layer`/`.pdf-capture-fab`/`.input-area`/`.composer-send`/`.error-block`/`.clarification-card`/`.question-progress`/`.note-row`/`.notes-stale`/`.empty-hint` | 各轮设计档 + `SEL` |
| 冻结文案 | `第 N / M 页`、缩放 `%`、笔记 4 条中文错误码文案、`已导出 N 条 → .pix-read/notes.md`、`stub 发送注入异常`、`.capture-hint`（`拖拽框选要提问的区域，Esc 取消`） | 各轮 review 冻结行 |
| 协议/契约 | `notes.json`/`reader-state.json` 形状与字节可复现；`ReaderNotesErrorCode` 码表；IPC 36 通道 + 6 事件；`PixApi` 42 方法（F14 仅签名） | 分片已核 |
| 工程规范 | `AGENTS.md`（不提交产物、依赖固定、禁 any、禁内联导入）；PRD §5.8 依赖字段零改动 | 仓库规范 |

### 4.4 探针清单（harness 见附录 A；label 逐条）

| 探针 | 覆盖 F | 断言 label |
| --- | --- | --- |
| `probe-f3-conf.mjs` | F3 | `F3-a` 构造期必抛；`F3-b` 改名后默认值重建 + 备份含原字节；`F3-c` 备份名唯一 |
| `probe-f4-library-root.mjs` | F4 | `F4-a` 联接路径 true；`F4-b` 真实路径 true；`F4-c` 兄弟/`../` false；`F4-d` 不存在库内路径 true；`F4-e` 普通根行为不变 |
| `probe-f7-f10-stores.mjs` | F7/F10/F12(渲染) | `1-d` 转绿、`1-e` 反向；`2-a`/`2-c`/`2-d`；`F12-r1` `load failed (no-root)` + `ready===true` |
| `probe-f11-bridge.mjs`（可行则跑，否则真机+走查） | F11 | `F11-a` 同 dir 双击；`F11-b` A→B 串行（`ready×2`/A dispose 恰 1/终态 B） |
| `probe-f15-useRpc.mjs` | F15 | `3-a` 转绿；`3-b` 正常路径不抛 |
| `probe-f17-pdf.mjs` | F17 | `F17-a` 300MB 拒绝；`F17-b` 正常回归；`F17-c` `readFileSync` 零命中（grep） |
| 走查/真机 | F1(次要位置/隐式提交)、F5、F13、F14、F19(handler) | §1 各条「走查/真机」步骤 |

### 4.5 失败处置
- 任一门槛命令失败：停批修复，不得跳过；`smoke-notes` 新增组失败时先确认断言期望值是否手写（不得由被测函数生成）。
- 离屏失败：先查是否为「假绿类」问题（F12 stub 语义未同步、F9 文案未同步），再按 `MANIFEST.failure` 原文定位；只允许按 R14 先例对已知 flake 重跑一次。
- 基线比对缺失：按帧名逐条列出缺失与新增，缺失必须归零后才可收轮。

---

## 5. 需求登记（PRD §5.7 承接；F18 开工前置）

R15 无独立需求档，以下登记由本档承接（写清旧值/新值/涉及断言/涉及截图）：

| # | 关联 F | 变更类型 | 旧值（逐字） | 新值（逐字） | 涉及断言/截图 |
| --- | --- | --- | --- | --- | --- |
| R1 | F18 | 交互语义 | R4「松手后退出框选模式」（`DEV-R4-capture.md`） | 「失败（无可截内容）时保留框选模式并提示；成功或误触（<6px）仍退出」 | 新增 `.capture-error-hint` 场景与截图；既有 Esc 相位不动 |
| R2 | F1 | 行为 | IME 组合态 Enter 触发发送 | 组合态 Enter 不触发（`e.isComposing` 守卫） | 新增 `composer-ime` 记录；场景 43 驱动不受影响 |
| R3 | F6 | 行为 | 发送失败后草稿/附件/截图全部丢弃 | 失败后还原发送前快照（三者都还原） | 新增 45D 记录；45/45B/45C 断言不动 |
| R4 | F9 | 用户可见文案 | `重建失败：<message>`、`已备份原文件并新建空库`（无路径） | `重建失败：<message>（原文件已备份：<path>）`、`已备份原文件并新建空库：<path>` + 「在文件夹中显示」 | 新增离屏记录；smoke 既有断言不动 |
| R5 | F12 | 用户可见文案（日志/降级语义） | `missing` 计为降级并 warn | `missing` 不再降级（日志仅 corrupt/version/read-failed） | 20b 改为 `warnDelta === 0`；相位 23 不变 |
| R6 | F14 | 用户可见文案 | 安装失败无提示（返回被吞） | `安装更新失败` 回退 + 会话中提示沿用主进程 `有会话正在运行，请先停止会话再安装更新。` | 人工判据 |
| R7 | F17 | 用户可见文案 | 无体积上限（静默整读） | `PDF too large: <N> MB > 256 MB` | 探针 `F17-a` |
| R8 | F5 | 用户可见文案 | 设置页展示「N 个工具」无边界说明 | 面板级新增「服务器工具不会提供给模型（PiX 只开放只读工具）」（最终文案实现时定稿） | 无自动化断言（人工走查，登记见 §6） |
| R9 | F3 | 用户可见文案 | 坏设置文件 ⇒ 启动失败 | 启动失败弹框「PiX-Read 启动失败：<message>」（仅在 whenReady 链异常时） | 走查 |
| R10 | F15 | 用户可见文案 | 重命名失败静默 | `重命名失败：<message>`（对话框内 error alert） | 真机走查 |
| R11 | F19 | 用户可见文案 | `目录不存在：<path>`（不区分目录/文件） | `目录不存在：<path>` / `不是目录：<path>` 两分 | smoke 纯函数断言 + 走查 |

（F2/F4/F7/F8/F10/F11/F13/F16 不产生用户可见文案或既有文案，无需登记。）

---

## 6. 不修清单 D 最终登记（一页速览）

**条数**：95 条 = R15-audit §4 的 94 条（被 20 条上限裁出的 P1 5 + 不属四类的 P1 4 + 原报告登记 D 21 + 未入册 P2 64）+ 本轮降级 1（F20）。另附「过程性登记」4 条（不计入 95，见下）。

| 分类 | 条数 | 理由摘要 | 后续触发条件 |
| --- | --- | --- | --- |
| 被 20 条上限裁出的 P1 | 5 | 用户可见性/数据安全排序靠后（S-RP-04 剪贴板双实现、S-PDF-03 渲染 await 窗口、S-PDF-05 worker 竞态、S-SD-01 三面一致性、S-SD-02 20s 裸等待 flake） | 下轮清理包或取证基建轮 |
| P1 但不属四类 | 4 | 非失败路径/竞态/泄漏/契约漂移（草稿高度不复位、释放 O(N²)、高亮悬空 Range、结束自检不校验覆盖） | 下轮顺手做（各有最小判据） |
| 原报告登记 D | 21 | 受信调用方/内核兼容规则/产品未裁决/属主进程面（S1-13/S1-15/D-MS-01…D-SD-03） | 条例已写明（如开放导入/导出接线时必须补校验） |
| 未入册 P2 | 64 | 死代码包、重复实现（重构）、性能热点、规范冲突（含依赖固定 S-SD-13 触冻结与 lockfile，需负责人批准） | 下轮零风险清理包优先 |
| 本轮降级 | 1 | F20：主要路径 no-op、判据不可通过、与内核分叉 | 可选一行 `console.warn`（对齐内核措辞）+ 匹配规则分叉登记；跨仓对齐不做 |

**过程性登记（新增，不计入 95）**：
1. F17b（`chat-files.ts` 附件上限）：产品口径「文本截断 vs 图片拒绝」未裁决 ⇒ 不入册；触发条件 = 负责人裁决后随下轮清理包；本轮 pdf 侧（F17a）已闭环。
2. F13 `errorMessage` 不呈现：失败块文案仍是「视觉模型读取失败」；触发条件 = 需要可行动提示时新增 UI 文案（走 §5 登记流程）。
3. F5 设置页无自动化回归网：ui-shot 无设置页导航、`mcpGetServers` stub 返回 `[]`；触发条件 = 下轮新增首个设置页场景（或 S-SD-01 的 stub 一致性脚本）。
4. F19 handler 装配无自动化 harness（`ipc-handlers.ts` 带 electron 依赖）：判定逻辑已入 smoke 面，装配只走查 + 真机；触发条件 = 下轮若引入 electron shim 夹具则可入册。
（F12 的 `.corrupt-*` 跨轮累积已在 B1 通过 `writeFixtures` 清理，不登记为 D。）

---

## 7. 风险与回退（每条高风险修复的失败信号与回退方式）

回退口径：**回退 = 只撤销该处改动（连同其新增断言/场景），不得整体回滚他人/前批改动**；每次回退后必须复跑 §4.1 门槛命令，再继续后续批次。

| F | 高风险点 | 失败信号 | 回退方式 |
| --- | --- | --- | --- |
| F2 | 触底钳制改动页码跟踪 | 新 `22c` 场景 ①②③ 任一红；或既有 `第 3 / 3 页`/12a 缩放读数回归 | 撤销 `updateCurrentPage` 的钳制块（恢复逐字原函数），撤回 SEL.zoomOutBtn 与 22c 场景；复跑门槛 + 离屏缺失比对 |
| F3 | 构造期 catch 可能掩盖真实 IO 错误 | 真机：坏文件不产生备份/不重建；或正常文件被误备份 | 撤销 `openStore` catch 与 `sanitizeGuiSettings`（恢复 `:25-34` 逐字），保留 `whenReady .catch`（独立安全网可不回退） |
| F4 | 双根谓词放宽越界 | 探针 `F4-c` 红（兄弟/逃逸被放行）或 smoke-notes 既有 outside 用例外行为变化 | 撤销 `library-root.ts` 谓词与 `pdf-tools.ts` 去复制改动（恢复 `renameSync` 语义前的两份实现），保留 smoke 新断言或同步删除 |
| F9 | copy-first 与既有备份断言冲突 | `smoke-notes` G4 的 `backups.length === 1`/名字正则/空库断言红；或 `existsSync(NOTES_A)` 在失败注入下为 false | 撤销 `:540` 的 copy 与渲染层 `backupPath` 透传（恢复 rename-first + 无路径文案），同步删除新增断言/离屏记录 |
| F11 | 串行门/幂等改变事件次数 | 探针 `F11-a/b` 红；真机双击重建两次；或 `agent-ready` 计数导致渲染层状态错乱 | 只撤串行门与幂等（恢复 `start`/`newSession`/`switchSession` 主体），保留 `_subscribe` 二次覆盖修复与 `HomePage` 在途守卫（两者独立且低风险） |
| F12 | missing 语义与 ui-shot 不同步 | 20b 红（warn 增量非 0）或假绿（stub 未同步）；相位 23 变红 | 回退顺序：先恢复 stub/20b 到旧语义，再撤 main/renderer 的 missing 分支；corrupt 备份与拒写可保留（独立收益）或一并回退 |
| F14 | 签名变更引发渲染层 TypeError | 离屏任一处点击安装/更新路径报错；`npm run check` 红 | 撤销 `preload.ts:108/193` 签名与 `SettingsPage` await（恢复 `() => void`），stub 可保留返回对象（无害） |
| F15 | 抛出化产生未处理拒绝 | 真机/探针出现未处理 rejection；`saveRename` 失败无提示 | 只回退抛出化的具体命令（逐个：先 `setApiKey/removeAuth`，再其余），保留 `saveRename` catch 与 abort 判定 |
| F17 | 上限过严误伤正常 PDF；异步读语义变化 | 探针 `F17-b` 红（正常文档读不出）；真机读常规 PDF 失败 | 撤销 `resolveGuardedPdfPath` 的上限与 `withPdfDocument` 异步读（恢复 `readFileSync`+拷贝），保留 `shared/limits.ts` 文件（未被引用时无副作用）或同步删除 |
| F19 | 根判定误伤资料库树 | 真机资料库树加载失败（explorer 空/报错）；smoke 纯函数断言红 | 撤销 `library-list/open-path` 守卫与 `isLibraryDirAllowed`，保留 `show-in-folder` 注释；恢复原 handler 逐字 |

低风险项（F1/F5/F6/F7/F8/F10/F13/F16/F18）失败时按同一「局部撤销」口径处理，无需额外说明。

---

## 附录 A · 探针与夹具 harness（命令级）

1. 通用原则：探针脚本写 `%TEMP%/pix-r15-probes/`；仓库零残留；只读仓库源码（`tsc` 编译不改源文件）；不跑 `npm run build`。
2. 纯主进程叶子面（F4/F12/F19 的纯函数、F9 的 smoke 增量）：直接沿用 `smoke-notes.mjs` 的 `tsconfig` + `createRequire` 范式（`%TEMP%/out`，`required/allowed` 断言产物集合）。
3. ESM-only 依赖面（F11 桥、F17 pdf-tools/chat-files）：`tsc` 编译真实源码到 `pix/node_modules/.pix-r15-probe/out`（位于 `node_modules` 内 ⇒ 裸包 `@earendil-works/*`、`pdfjs-dist` 可解析；本机 Node v24.19.0 已由 `node -v` 实读，具备 `require(esm)` 能力；若探针报 `ERR_REQUIRE_ESM` 先改 `.mjs` + `import()` 入口），入口用 `.mjs` + `import()` 加载；`electron` 用 `--import` loader 映射到 `%TEMP%` shim（`app.isPackaged=false`、`app.getAppPath=()=>PIX_DIR`、`app.getPath=()=>os.tmpdir()`）；探针结束删除 `.pix-r15-probe`。
4. 渲染 store 面（F7/F10/F12-renderer/F15）：`tsc` 编译到 `%TEMP%/out`，在 `out/` 下建 `node_modules` junction 指向 `pix/node_modules`（`fs.symlinkSync(pixNodeModules, join(outDir, "node_modules"), "junction")`，Windows 免管理员），桩 `window.pixApi`（含可控 resolve/reject 时序）。
5. 夹具：300MB PDF 用 `truncateSync` 造稀疏文件；联接根用 `cmd //c mklink /J`（探针）/`fs.symlinkSync(..., "junction")`（smoke 内）；坏设置文件用截断 JSON 与零字节两种。
6. 探针不得写入仓库、不得复用端口 5199、不得与 ui-shot 并发。
