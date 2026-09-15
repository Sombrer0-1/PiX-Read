## 需求评审（R6）

> 评审对象：`docs/pm/R6-req.md`（N26–N34 阅读现场）。评审方式：只读代码核对（`reader-store.ts`、`PdfViewer.vue`、`ReaderPanel.vue`、`LibraryPanel.vue`、`WorkspacePage.vue`、`notes-store.ts`、`ipc-handlers.ts`、`preload.ts`、`types.ts`、`ui-shot.mjs`、`index.ts`、`DEV-R5b-notes.md`、`PRD-V0.4.md`）。
> 结论：**revise**。must-fix 8 条（见 §2），改完才进设计。

---

### 0. 已核对为真的前提（保留，别在设计中翻案）

1. §0.2 的 Electron 依据与现状一致：`index.ts:218` `window-all-closed` → `223` `requestShutdown()`（`152-155` 置位 `shuttingDown`）→ `226` `before-quit` 在 `227` 提前返回。「渲染层主动 flush、不新增 `before-quit` 拉取」的取舍成立。
2. 资产分层的分层写法与 `PRD-V0.4.md` §3 一致；N29 是显式入口，不违反 §4.1「不自动打开上次文档」；未越出「本地论文阅读 + AI 辅助」主线；N30 走资料库树而非知识地图，符合 §2 的 R6 行（知识地图进度是 R9）。
3. 分层不互相渗透的写法正确：状态文件与 `notes.json` 分文件、分策略；`writeFileAtomic` 协议（`mkdir → .tmp → renameSync`）与 `notes-store.ts` 一致，可复用同形实现而不复用其校验/备份路径。
4. 路径纪律、`pendingJump` 消费式语义、`WorkspacePage` 三处 `resetNotes()` 的跨工作区防护都只被「扩展」而非推翻；N32 与 `notesStore` 同范式（含 `loadSeq` 作废在途 load）是正确类比。
5. N28 的优先级链本身可判定（含 `grep` 判定），N20 六条回归的继承来源（`DEV-R5b-notes.md` §4 第 4 项）确实存在，不是空引用。

---

### 1. 评审清单逐条结论

**1) 可判定性** —— 多数条目可用三种证据判定；不可判定/会误判的有 4 处：
- N33 验收 3「无 `.reader-empty` 错误态」不可判定且会把正常空态判成错误：`ReaderPanel.vue:187`（正常空态）与 `:210`（错误态）共用 `.reader-empty`，该选择器在损坏场景下**必然存在**。
- N31 验收 6「1.1 缩放下重跑既有场景」不覆盖它列出的能力：`ui-shot.mjs` 的 00–11 场景里没有 Ctrl+F 搜索、知识地图、框选截图场景（现有场景只到摘录/去重/错误态/测量）。
- N27 §0.2.4 与 N32 验收 4 把「真实关窗」交给开发档人工走查，与「本档所有验收只能由这三种证据判定」直接冲突。
- N27 验收 4 要求 dispatch「hidden 态」的 `visibilitychange`，但离屏窗口 `document.hidden` 恒为 false，需求没写制造手段，等于把断言留给实现运气。
- 其余可判定项抽查通过：N26 验收 6/7、N27 验收 6（`before-quit` 仍在 `index.ts:226`）、N28 验收 8、N30 验收 4（`git diff --stat`）、N33 验收 1（字节 + mtime 比对）、N34 验收 3（脚本内 `throw` 落到 `99-failure-state.png` + 退出码 1，脚本已支持）。

**2) 主线与反需求** —— 无越界。唯一措辞冲突：N31 验收 5「切换文档时缩放跟随目标文档」**改动了现有行为**（今天 `openDocument` 不复位 scale，缩放跨文档保持），与不变量 5「缩放标签百分比不被本轮改动」字面打架；应把「缩放由跨文档保持改为按文档恢复」在设计档显式声明为有意变更，而不是塞进「契约不变」。

**3) 既有契约冲突** —— 无硬冲突，两处需收紧：
- `requestRestore` 缺 `requestJump` 那样的「当前文档直接生效」分支：同文档再点一次树行不会重载、也不会消费意图，陈旧意图会留到下一次打开该文档时生效。
- N27「有效变化」是纯值比较，会把 `ReaderPanel.vue:112` 的 `openDocument`（`page` 复位为 1）当成变化 → 见 MF3。
- `pendingJump` 的加载成功/失败双路径消费（`PdfViewer.vue:652`、`:670`）是真实存在的，N28 验收 5 的类比成立。

**4) 失败路径与边界** —— §0.1 + N33 覆盖度高于上一轮，仍缺 3 处：save 路径内部读取失败、加载窗口内的写入、`lastDocPath` 与 `documents` 的交叉一致性（MF2/MF3/MF8）。其余点名项检查通过：损坏/缺失/版本不符/越界路径/无根 √；文档被删（N29 验收 5）√；改名后旧键成为孤儿条目（N26 验收 7 明确不做 GC）√；高频翻页（N27 验收 1/2）√；切工作区（N32）√；退出（§0.2，证据口径见 MF7）。

**5) 隐性成本与依赖** —— 不新增依赖、不动文件树接口（N30 验收 4 与白名单自洽）√。成本集中在 `ui-shot.mjs`：fixture 页数与几何（MF5）、stub 需真写 fixture 文件 + 4 个控制口 + 断言。两点未写进 N34：stub 是字符串模板（**禁反引号**、反斜杠要转义，见 `ui-shot.mjs` 顶部约束与 `relativeDocPath` 的写法）；`visibilitychange` 的监听目标（`window` 还是 `document`）与 hidden 态制造方式。

**6) 不可逆数据风险** —— 状态文件不写进资产文件、不碰 `notes.json`、不备份是明确设计 √。真实风险 2 条：瞬时读失败后的覆盖重建会清空其它文档现场（MF2）；加载窗口内的复位值写盘会把已存页码改成 1（MF3）。

**7) 恢复优先级** —— 「显式跳转意图 > 现场恢复 > 第 1 页」本身是可实现可验收的条款，但消费点与 N31 的缩放应用时机互斥（MF4）；N28 验收 1 的 `scrollToPage` 调用点枚举与现状不符（现状 4 处：`:315` `gotoPage`、`:652` 初始落页、`:774` 缩放重排、`:783` `gotoPage` watcher 消费）。

---

### 2. must-fix（8 条，改完才能进设计）

1. **N33 验收 3 的 `.reader-empty` 断言会误判正常空态**：`ReaderPanel.vue:187`（正常空态）与 `:210`（错误态）共用同一 class。改为断言具体内容（`.empty-title` 文案为「选择左侧文件开始阅读」、无「重试」按钮），或新增专用 class 后再断言。
2. **§0.1/N33 未定义 save 路径内部读取失败（read-failed/EBUSY/权限）时的行为**。必须写死：读不到就不写（与 `notes-store.addNote` 同口径），只有 missing/corrupt/version-unsupported 才允许整体覆盖重建；否则一次瞬时占用会清空其它文档的现场。
3. **N27「有效变化」定义会把两处非用户变化写盘**：`ReaderPanel.vue:112` 的 `openDocument` 复位 `page=1`、以及状态尚未 load 完成就打开文档（此后无恢复、直接落第 1 页）。必须写明：状态加载完成前不落盘；文档加载窗口内的复位值不入快照（以首个落点为准）。否则 N27 验收 1 的「0 次」不成立，且已存页码会被自己写成 1。
4. **N28 验收 1 与 N31 验收 3 互斥**：`setScale` 只在 `PdfViewer.vue:637` 之前写才不触发缩放 watcher 的全量重排。二者选一写死（建议在 `getDocument` 前消费并应用缩放，失败路径仍丢弃意图），并把 N28 验收 1 的 `scrollToPage` 枚举修正为 `:315/:652/:774/:783` 四处。
5. **数字断言与离屏 fixture 不符**：`ui-shot.mjs` 的 `SAMPLE_PAGES` 只有 2 页（MediaBox 595×842）。N28 验收 2、N29 验收 2 的「第 3 / 3 页」与 N27 验收 2 的「30 次页码变化」都不成立（点开后会被钳制为「第 2 / 2 页」）。在 N34 冻结 fixture 的页数与几何，并据它重写全部数字断言。
6. **N27 快照/flush/去重机制未定死**：d 安全点与 N32 的 `resetState`（要求清定时器与快照）在同一点触发，必须写明调用顺序为 flush → resetState；去重基线改为「已提交的 payload」（提交即记账、失败不记账），否则 N27 验收 4 的「+1 不 +2」在异步 IPC 下不成立。
7. **不可判定项需改口径**：N31 验收 6 的「1.1 缩放下重跑既有场景」不含搜索/知识地图/框选（ui-shot 无这些场景）；N27 §0.2.4 与 N32 验收 4 的「真实关窗人工走查」与本档「只能用三种证据判定」冲突，须降级为代码审查项或显式列为第 4 类证据并限定范围。
8. **N29 入口规则缺两处交叉定义**：(a) 主进程对 `lastDocPath` 的过滤口径（越界/绝对/解析后不存在或非文件 → 按无记录），(b) `lastDocPath` 有效但 `documents` 无对应条目（被条目级裁剪或手改）时入口显示什么——写死「无条目等同无记录」，避免出现无页码的半截入口。

---

### 3. 不阻塞，但设计档必须写明的次级项

- §2.0 的 N26 验收 1 内联字面量漏了 save 的 `state` 字段，与 `ReaderStateSaveResult` 类型不一致。
- `degraded`/`reason` 对「文件不存在」是否成立（`reason` 表里有 `missing`，§0.1 却把它归入「无变化」）；`degraded` 是否就是 `console.warn` 的触发条件要写死。
- N30 验收 3「键来源是行的 title 绝对路径」应写成 `row.node.path`，不要诱导实现去读 DOM 的 `title` 属性。
- N30 验收 6 的 `scrollWidth <= clientWidth` 实际判的是「文件名未被截断」，需同时判 `.tree-row` 自身无横向溢出，且要说明该断言只在 fixture 的短文件名下成立。
- `requestRestore` 的同文档重复点击（陈旧意图）处理。
- N29 验收 5 的措辞「绝对路径指向不存在文件」应改为「相对路径解析后不存在或非文件」。
- 非 PDF 不落盘（N27 验收 7）意味着 `lastDocPath` 永远指向最后一次读的 PDF，需在设计档显式声明这是期望语义。
- N27 验收 4 要写明 hidden 态的制造方式（离屏窗口覆盖 `document.hidden`）与 `pagehide` 的监听目标（window 还是 document），否则该断言测不到生产路径。
- 快照捕获方式（同步捕获 vs 切换点显式 flush）要写死，否则 N27 验收 3、N32 验收 4 依赖实现巧合。

---

## 设计评审（R6）

> 评审对象：`docs/pm/R6-design.md`（阅读现场设计档）。评审方式：设计档 + 上游 `R6-req.md` / 本档 §2 的 8 条 must-fix，与真实代码只读核对（`reader-store.ts`、`PdfViewer.vue`、`ReaderPanel.vue`、`LibraryPanel.vue`、`WorkspacePage.vue`、`notes-store.ts`、`ipc-handlers.ts`、`preload.ts`、`shared/types.ts`、`renderer/types/ipc.ts`、`useRpc.ts`、`HomePage.vue`、`utils/notes-path.ts`、`library-root.ts`、`scripts/ui-shot.mjs`、`main/index.ts`、`package.json` / `tsconfig*.json`）。
> 结论：**revise**。must-fix 7 条（见 §2），全部落在契约键域、时序顺序与取证口径三处，不涉及架构返工；改完即可按设计档 §7 的白名单开工。

### 0. 已核对为真、实现阶段不得翻案的前提

1. §0 修订 1 与 §3.7 的 Electron 依据与 `main/index.ts` 现状一致：`index.ts:218` `window-all-closed` → `requestShutdown()`（`152–156` 置位 `shuttingDown`）→ `226` `before-quit` 提前返回。「渲染层主动 flush、不新增 `before-quit` 拉取、不新增 `sendSync`」是唯一不把易失状态放上退出关键路径的选项（`grep -rn sendSync pix/src` = 0 命中）。
2. §1.1–§1.3 的类型 / 通道 / preload 三处形状自洽，且与 `ReaderNotes*` 同形（save 结果恒带 `state`、失败回传空状态）；`window.pixApi` 的全局声明已在 `renderer/types/ipc.ts`，新增两条 API 不需要额外声明面。
3. §2 白名单与真实文件一一对应；`src/main/index.ts` 确实无需改动；B 面的编译前置只有 A 的 `types.ts` + `preload.ts`（设计档已声明）。
4. §3.2 对 must-fix 4 的取舍在代码上成立：`loadPdf` 已 `await destroyDocument()`（`PdfViewer.vue:614`）→ `pdfDoc = null`，故 §3.2 步骤 3 的 `setScale` 不会命中缩放 watcher 的重排分支（`:765` 起的 `if (!pdfDoc) return;`）。`scrollToPage(` 的「1 定义 + 4 调用」实测 = `:304` 定义、`:315` / `:652` / `:774` / `:783` 调用，与 §6.3 计数一致。
5. §3.5 安全点 a 选在 `ReaderPanel` 的 `props.filePath` watcher（`:109–112`）是对的：PDF→文本时 `PdfViewer` 被卸载，只有父级 watcher 能覆盖三种切换。
6. §1.6 的 `MIN_SCALE/MAX_SCALE/DEFAULT_SCALE` 现状确为文件内私有常量；§6.3 的「`before-quit` 未变」「无 `sendSync`」两条只读核对已实测为真。

### 1. 评审清单逐条结论

**1) 契约自洽性** —— 一处硬伤：渲染层 `documents` 的键域（MF1）。其余自洽：`ReaderStateFile` 字段、`degraded ⇔ reason !== undefined`、`success` 仅在 no-root 为 false、save 的 5 个码与中文文案、`filePath` 只作诊断 —— 类型 / 通道表 / 状态文件示例三处互相吻合；`invalid-input` 与 `outside` 只出现在 save 侧，与「渲染层不做第二套校验」一致。遗漏：no-root 与 IPC reject 两个分支的 `degraded` 取值未写死（次级项 1）。

**2) 时序与竞态** —— 三处需改：`ready` 闸门与 gate 3 的组合（MF2）、`goHome` 的 flush 与 `stopSession` 的顺序（MF3）、warn 计数基线（MF5）。其余判断成立：§3.3 的「快照持续捕获 + 切换点同步 flush」确实能让安全点 a 提交「切换前的值」（实参是 `snapshot`，不是切换后已被复位的 `readerStore.page`）；§3.4 的「提交即记账、失败不回滚」让 N27 验收 4 的「+1 不 +2」在异步 IPC 下成立；`resetState` 清定时器 / 快照 / 基线 + `loadSeq += 1` 与 `notes-store` 同范式，跨工作区三件套（MF2 之外）成立。退出前 flush 的可靠性已被 §0 修订 1 降级为「代码审查 + 合成事件驱动同一段生产代码」，与需求 §0.2 的口径一致；残余不确定性只有「真实关窗是否触发 `pagehide`」，属已声明的第 4 类证据。

**3) 失败路径** —— 覆盖度高于 R5 口径，逐条都落进「静默降级 + 不影响阅读」：缺失 / 损坏 / 版本不符 / 条目裁剪 / `lastDocPath` 越界与交叉过滤 / 读抛错 / save 内部读失败拒写 / 写失败 / IPC reject / 无根 / 加载窗口 / 恢复页越界 / 记录指向已删文件 / 显示后被删 / 非 PDF 全程 0 写。§1.4 的「`read-failed` 拒写」与 `notes-store.addNote` 同口径，是本轮最关键的写侧约束，写法正确。仅剩 no-root 分支的 `degraded` 与 warn 规则未闭合（次级项 1）。

**4) 与既有语义冲突** —— 无硬冲突：notes.json 策略零渗透（新文件自带原子写、不 import `notes-store`、不做备份与逃生口）；资料库树懒加载与 `flattenVisible` 不动；`reader-store` 既有字段只增 `pendingRestore`；`openDocument` 的清理规则与 `pendingJump` 逐字同构。两处需要写死判据而不是依赖实参巧合：gate 4 的字符串比较（次级项 3）、`openDocumentFromLibrary` ① 的「同路径」必须走比较键（并入 MF1）。

**5) 验证可执行性** —— 场景整体可构造：stub 有 `require("node:fs")`（sandbox 关闭），`HomePage.openWorkspace(dir)` → `rpc.startSession(dir)` 使「A/B 两个 activeRoot」可实现，`win.webContents.on("console-message")` 已能收集渲染层 warn 行，`SEL` / `MANIFEST` / `MEASUREMENTS` 结构可原地扩展。三处会误判：warn 计数（MF5）、§6.3 的两条判定命令（MF6）、B 侧断言可能空跑（MF7）。数字断言与 §6.1 的 3 页冻结自洽（`Math.round(595*1.1) = 655`；`.pdf-page` 宽是内联 `cssSize`，不被父级 flex 收缩）。

**6) 规模与工作量** —— A 面小（一个叶子模块 + 两条 handler + 一组类型），一轮内可交付。B 面重，最被低估的是 `ui-shot.mjs`：不是「加几组场景」，而是 stub 要自带「读文件 → 解析 → 降级分类 → 条目裁剪 → 合并 → 原子写回 + activeRoot 切换 + 两套资料库树 + 失败注入 + 调用计数」，外加 3 页 fixture、第二工作区、第二张最近项目卡、6 张截图、5 组断言。建议 B 面先冻结 stub 语义并跑通 20–24，再回填 UI；§6.1 的「注入时机 = 已返回首页之后、进入工作区之前」必须在开发档再写一次（否则安全点 a/b 的 flush 会覆盖注入内容）。

**7) 越界检查** —— 白名单不重叠：A = `shared/types.ts` / `main/reader-state-store.ts`(新) / `main/ipc-handlers.ts` / `main/preload.ts`；B = 渲染层 6 个文件 + `scripts/ui-shot.mjs`。无 hidden 依赖缺口：B 只额外只读 `utils/notes-path.ts`（已列）与 `project-store`（取 `currentProject.path` 作 root，`notes-store` 同款用法）；A 不依赖 B 的任何符号。唯一需要在 §7 补一句的是 stub 语义必须与 A 的通道名同源（已写）。

### 2. must-fix（7 条，改完才能开工）

1. **§3.2 步骤② 的键域写错，会导致现场恢复永不生效。** `documents` 的键是「工作区相对路径的比较键」（§1.1 示例 `sample-paper.pdf`、§1.4 写盘键、§1.5 `progressPageFor` 走 `currentDocKey`），而 `docPathKey(absPath)` 得到的是**绝对路径**键 → `documents[...]` 恒不命中 → `requestRestore` 从不登记，N28 验收 2/6、N29 验收 1/2、N31 验收 1 全部落空。修正：写死为 `currentDocKey(absPath, rootDir)`（`utils/notes-path.ts`，返回 `null` 即不登记意图），§1.5 与 §3.2 同口径；`openDocumentFromLibrary` ① 的同路径判定同样用比较键而不是 `===`。
2. **§3.3 的 `ready` 闸门与 gate 3 组合会让「加载窗口内打开的文档」整程不落盘。** `noteLanding` 因 `ready === false` 被丢弃时不写 `settledKey`，此后每次 `noteChange` 都会被 gate 3（`docPathKey(absPath) === settledKey`）拒绝，与同节「该文档的现场在下一次真实翻页/缩放时写入」直接矛盾（只有当用户切走再打开该文档、重新走一次 `loadPdf` 落点才会恢复写入）。修正：`settledKey` 无条件设置（落点即认领该文档），只让**快照与提交**受 `ready` 约束 —— 这样既可保住「不把已存的第 3 页写成 1」，又保住下一跳写入。
3. **§3.5 安全点 b 必须写死顺序：`flush()` 是 `goHome()` 的第一条语句，先于 `await rpc.stopSession()`。** `session-stop` handler 末尾调用 `clearLibraryRoot()`（`main/ipc-handlers.ts:304`），之后 `reader-state-save` 必返 `no-root` 并静默丢弃最后一次现场；`goHome` 的 `await rpc.stopSession()` 就在函数首行（`WorkspacePage.vue:185–186`），把 flush 插到「既有复位」里会踩中。该路径离屏**覆盖不到**（stub 的 `stopSession` 不清 `activeRoot`），必须在 §6.3 加一条代码审查判定并在开发档逐条自评。
4. **笔记跳转路径的现场语义未闭合，且 N28 验收 3 无场景。** §3.2 说笔记条目走既有 `onOpenNote`（只 `requestJump`、不 `requestRestore`），与 §1.7「缩放独立于位置优先级：永远取目标文档的恢复值」矛盾；`onOpenNote` 的不变项（§2.2）也锁死了它不会登记恢复意图。修正二选一并写死：要么 `onOpenNote` 同样调 `requestRestore`（同文档丢弃、跳转页覆盖，缩放取恢复值），要么删掉 §1.7 那句并声明「笔记跳转一律回落 `DEFAULT_SCALE`」。同时 §6.2 增补离屏场景：A 有记录第 3 页 → 点 B 第 2 页笔记 → 断言「第 2 / 2 页」（覆盖 N28 验收 3 的后半句）。
5. **§6.2 场景 23 的 `[reader-state]` warn 行数断言不可判定，且 stub 的降级面未定义。** 渲染层会话在整个 ui-shot 运行期是同一条，首启 `missing` 与 20/21 的注入都会留下 warn 行，「行数 === 1」按字面必然失败。修正：改为子场景增量基线（`warnLines.length - base === 1`，与 `reader-state-writes` 的写法统一）；并把 stub 的 `degraded`/`reason` 来源写死（20b 的 `missing`、23 的 `corrupt` 都要求 stub 真读并解析 fixture 文件），明确 `setReaderState(...)` 注入与「按 activeRoot 读文件」的优先级，以及条目裁剪规则是否在 stub 内实现（21 的 `page: 1024` 与 23 的 `documents[...].page === 3` 都依赖它）。
6. **§6.3 两条判定命令不可用/恒真。** (a) `grep -rn "reader-state" pix/src/renderer` 期望「只在 `stores/reader-state-store.ts` 内」按字面必然失败：四个消费文件都有 `from "../stores/reader-state-store"` 导入，会命中 `WorkspacePage.vue` / `ReaderPanel.vue` / `LibraryPanel.vue` / `PdfViewer.vue` → 改为 `grep -rn "\[reader-state\]" pix/src/renderer`（warn 文案单点）。(b) 「`setScale` 行号 < `getDocument(` 行号」恒真：`zoomBy` 的 `readerStore.setScale(`（`:718`）本来就在 `loadPdf` 之上 → 改为判定 `loadPdf` 内「`readerStore.setScale(` 早于 `getDocument({ data`」两行的相对次序，或直接改成代码审查项。
7. **§6.2 场景 24 的 B 侧断言可能空跑，fixture/stub 面需一并冻结。** 若 stub 的 `libraryList(dir)` 不为 B 返回树，B 树为空时「`.row-progress` 计数 === 0」会假通过 → 必须先断言 B 树里 `sample-paper` 行**存在**，再断言无徽标；同时写死 `recentProjects` 为 A 在前、B 可按 `:title`/`name` 定位（`HomePage.vue` 的 `.project-list-item` 用 `project.name` 渲染），并声明 stub 的 notes 面仍只认 A（避免跨工作区断言被笔记分组干扰）。§6.1 的 3 页冻结 + 第二工作区变更需在开发档确认既有 00–11 断言不依赖页数（实测现有断言只读 page 1 与 `.page-label`，可改）。

### 3. 次级项（不阻塞，但设计档或开发档需写死）

1. `degraded`/`reason` 在 no-root 与 IPC reject 两个分支的取值：按 §1.1 的「`degraded ⇔ reason !== undefined`」可推出 no-root 不产生 warn（reason 词表无 no-root），但 §1.2 只写了码表 —— 建议在 §1.2 明写「no-root 时 `degraded: false` 且不记 warn」，以对上 N27 验收 8 的「静默」。
2. 四条 reason 的**中文短句**（`missing`/`corrupt`/`version-unsupported`/`read-failed`）未冻结为字面量；本轮的场景只计数不比对文案，若将来要 grep 文案必须先冻结，否则保持「只计数」并写进开发档。
3. `noteChange` 的 gate 4 写作 `absPath === readerStore.filePath`（字符串相等）。当前所有调用点的实参同源（`openDocument` 与 `props.filePath` 是同一字符串），成立；但 `absoluteDocPath` 会按 root 的分隔符风格生成路径（`ui-shot` 里 stub 的 root 是正斜杠、树节点是 `path.join` 的反斜杠），建议改为比较键形式，与 §1.5 / §3.3 的键口径统一。
4. §1.5 说 `noteLanding`「非节流（每次加载 1 次）」，§3.4 说「`noteLanding`/`noteChange` 产生快照，600 ms 尾触发提交」—— 二者需二选一写死：若落点立即提交，则 N28 验收 6（恢复页钳制后改正）在同一次加载内即时生效；若落点也走去抖，则 §6.2 的「最近 payload」断言要等到 600 ms 之后。两种都可判定，但不能留白。
5. §3.3 只写了「加载窗口内不落盘」的代价，没写它的用户可见后果：首次进入新工作区就立刻打开 PDF 并停在该页、此后不再翻页 → 该文档整程无记录，下次重开落第 1 页。接受与否需要负责人在开发档确认一句（与 N29 的续读语义直接相关）。
6. N30 的徽标对「当前文档」取实时页码 ⇒ 打开任意 PDF 即出现「第 1 页」徽标（即使从未读过）。与 N30 的「已读过」措辞有轻微出入，建议在 §1.5 明写为期望语义，避免实现者额外加一道「仅当有记录」判断而与验收 2 冲突。
7. §6.4 的离线烟测命令可行（两个叶子模块、`--skipLibCheck`、`../shared/types.js` 在 `--moduleResolution node` 下可解析；`@types/node` 已安装），但需在开发档记明「临时脚本写 `$TMP`、跑完删除」，并明确 `mkdirSync(stateFile)` 冒充目录在 Windows 上确实抛 `EISDIR`（Node 会映射该 errno）。

---

## 代码审查（R6）

> 审查对象：A 面 4 文件 + B 面 7 文件（`git status --short` 逐项核对）与 `docs/pm/R6-dev.md`。
> 审查方式：默认怀疑，全部独立复跑——`npm run check`、主进程数据面离线烟测（自建脚本）、离屏取证（重跑一遍）、以及两个仓库脚本没覆盖的补充场景（仓库外临时副本）。
> 结论：**revise**。must-fix 1 条：N20 验收 3 在「同文档加载中连点」这一时序上被本轮改动打破，离屏可复现（N28 验收 4 点名要求它继续为真）。

### 0. 我实际跑的东西与结果

1. `cd pix && npm run check` → `vue-tsc` + 主进程 `tsc` + preload `tsc` 全绿、无 error 行、`CHECK_EXIT=0`。
2. 主进程数据面：单文件 `tsc --outDir %TEMP%` 编译 `reader-state-store.ts` + `library-root.ts`，自建烟测脚本 12 组 / 56 条断言全绿（`FAILS=0`）：ENOENT→`missing` 且不创建文件、恰一行 `[reader-state]` warn；截断 JSON→`corrupt`；`version:2`→`version-unsupported`；条目级裁剪（`page:0`、`scale:9`、`../escape.pdf`、反斜杠键、绝对键、非归一化键 `MixedCase.pdf` 整条丢；`updatedAt` 非法保留条目记 0）；`lastDocPath` 五类（越界 / 绝对 / 指向目录 / 不存在 / 无对应条目）→ 均按无记录且**其余条目仍生效**；save 只改目标条目（另一条目字段与 2 空格缩进格式不变、键序沿用读入顺序、末尾换行）；`missing`/`corrupt`/`version-unsupported` 允许空模型重建；**MF2 硬证据**：`mkdirSync(stateFile)` 冒充目录 → save 返 `read-failed`、目录仍在、不留 tmp；`.tmp` 被目录占用 → `write-failed` 且**原文件字节与 mtime 均不变**；越界→`outside`、越域→`invalid-input` 且不写盘；无根 load/save 均 `no-root`、不记 warn、不写盘；`.pix-read` 被删可自愈。（首次运行我自己的用例把「非归一化键」误写成已经归一化的 `mixedcase.pdf`，修正用例后全绿——是测试用例问题，不是实现问题。）
3. 离屏取证重跑：`UISHOT_EXIT=0`、`MANIFEST.failure === null`、`shots === 43`（既有 28 张 + 新增 15 张；目录里的 `99-failure-state.png` 是 09:58 的旧失败残留、不在 MANIFEST 内）、`MEASUREMENTS` 12 组标签打印值与开发档 B.4 逐字一致（`resume-entry` 3/3+110%、`tree-progress` 第 3 页 / 第 1024 页 / 实时第 2 页 / 裁剪 / `.row-label` 与 `.tree-row` 无横向溢出、`scale-restored` 655 = round(595×1.1) 且 110% 下摘录 `.is-ok`、`reader-state-writes` 0/0、失败注入 `bytesUnchanged` 且恢复后 +1、`changes=30 delta=1` payload page 3、切换 payload = `sample-paper.pdf` + 3、hidden/pagehide 1/1/1、非 PDF 0 次、`note-jump` 2/2+100% 与 2/2+150%、`reader-state-degrade` 无错误态/无重试/无入口/无徽标且重建 page 3、`reader-state-console` 增量 1、`workspace-switch` B 侧先证行存在再无徽标、回 A 入口与徽标「第 2 页」）。
4. 补充场景（仓库脚本没覆盖，用**仓库外临时副本**跑，跑完删除）：见 §2 与 §4 的「主动补证」两条。

### 1. 红线与工程面核对（全部通过）

- 白名单：`git status --short` 只有本轮 9 个修改文件 + 2 个新建源文件 + 流水线既有 `docs/pm/*`；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、`src/main/index.ts`、`utils/notes-path.ts` 零改动；`git diff --stat` 不含 `library-list` / `libraryList` / `LibraryNode`。
- 无 `any` / 无内联动态 import（9 个文件 grep，唯一 `import(` 命中是 `PdfViewer.vue:34` 既有注释）；`reader-state-store.ts`（主进程）不 import electron、不 import notes-store、导出恰好 2 个、同函数体内无 await、无备份 / 逃生口 / 校验和（`grep "corrupt-|\.bak|backup"` = 0 命中）。
- 渲染层不拼存储路径：状态文件路径唯一派生点是主进程 `stateFilePath()`；渲染层只用 `absoluteDocPath` 拼**文档**路径（设计档 §1.5/N29 验收 4 允许）。
- IPC 入参校验：`isReaderStateDraft` 形状守卫 + store 内域校验（`invalid-input` / `outside`），两条 handler 全同步、无 await、无中文错误遗漏。
- 失败不静默：渲染层唯一失败消费点是 `console.warn("[reader-state] …")`（`grep "\[reader-state\]" src/renderer` 命中文件唯一 = store；另一处是文件头注释），`degraded` 在 `components`/`pages` 0 命中；`no-root` 静默是设计档 §1.2/R3 的显式例外，主进程侧由我的烟测证明（不写盘、不记 warn）。
- 既有链路：`grep readerState` 在 PdfSearchPanel / KnowledgeMap / useRegionCapture = 0；`scrollToPage(` 1 定义 + 4 调用；`goHome` 内 flush < stopSession 的 awk `EXIT=0`；`loadPdf` 内 setScale < getDocument 的 awk `EXIT=0`；`resetState()` = 3；`sendSync` 0 命中；`before-quit` 仍只有 `index.ts:226` 一处且该文件未改。

### 2. must-fix（1 条）

1. **`PdfViewer.vue` 的 `loadPdf()` 把意图消费前移到序言（`:622`），而 `reader-store.requestJump()` 对「同文档加载中（`pageCount === 0`）」的点击只写 `pendingJump`、在途加载不再读它 ⇒ N20 验收 3「加载中连点取最后一条」失效（N28 验收 4 要求其继续为真）。期望：落点取最后一次点击的页码（越界仍钳制）；缩放仍留在 `getDocument` 之前应用。**

复现与判定（同一 must-fix 的证据）：

- 复现：仓库外临时副本把 stub 的 `libraryReadFile` 延迟 400 ms 造出确定的加载窗口；A 未打开时点 A 第 2 页笔记 → 加载中（探针 `loadingAtClick: true`）点 A 第 1 页笔记 → 加载结束后落点 = **第 2 / 3 页**（首次点击的页），最后一次点击的意图留在 `pendingJump`（下次打开该文档才突然生效）。R5 的落点在 `await` 之后消费 `takePendingJump`，同一时序会落在第 1 页。
- 最小改法：落点前再消费一次（`const lateJump = readerStore.takePendingJump(filePath); const target = lateJump ?? jumpPage ?? restore?.page ?? 1;`）。若认为该时序可以放弃，须回改需求档 N20 验收 3 / N28 验收 4 并在开发档写明代价。
- 未受影响：跨文档连点（每次点击都开新加载、序言消费最后一条）仍取最后一条；同文档跳转在文档**已加载**时仍走 `gotoPage`（我的补充场景实测「第 2 / 3 页」+ 110%）。

### 3. 验收逐条结论（N26–N34）

1. N26 验收 1–8：**通过**。no-root 静默、路径派生、入参校验、条目裁剪由我的烟测硬证；`pageCount` 未入类型、无 GC、无日志文件。
2. N27 验收 1：**通过**。重跑实测 `restore-no-write` base=2 / after2s=2 / after3s=2。
3. N27 验收 2：**通过**。`changes=30`、`delta=1` ≤ ⌈2000/600⌉+1。
4. N27 验收 3：**通过**。`switch-before-debounce` 末次 payload = `sample-paper.pdf` + page 3（不是 1）。
5. N27 验收 4：**通过**。`hidden-pagehide` 1 / 1 / 1（去重生效，不 +2）。
6. N27 验收 5：**通过**。22c：失败注入下页码照常、无 snackbar/notice/错误态、文件字节不变；清注入后 +1 且 `filePage=2`。
7. N27 验收 6：**通过**。`before-quit` 未改、`sendSync` 0 命中。
8. N27 验收 7：**通过**。非 PDF 全程 0 次 save，`lastDocPath` 仍指向 PDF。
9. N27 验收 8：**通过（主进程实证 + 渲染层代码审查）**。渲染层 `no-root` 分支 stub 恒有 activeRoot，覆盖不到（设计档 R4 已声明）。
10. N28 验收 1：**通过**。消费顺序 + try 外唯一消费 + `scrollToPage` 4 处调用 + awk 判定。
11. N28 验收 2：**通过**。恢复落 3/3、切到无记录文档落 1/2（场景③）；「切回 A → 3/3」无独立断言，由 20/22 的恢复落页等价覆盖。
12. N28 验收 3：**通过**。后半由 22d（2/2 + 100%）与 22e（2/2 + 150%）实测；前半我自己补跑（同文档：A 已开第 3 页 + 110%，点 A 第 2 页笔记）→「第 2 / 3 页」+ 110%，显式意图确实覆盖恢复值且不改缩放。
13. N28 验收 4：**失败**。见 §2 must-fix（N20 验收 3 的同文档时序）；其余五条（同文档跳转不重载、跨文档落目标页、未打开文档时点条目、目标缺失、目标非 PDF）仍为真。
14. N28 验收 5：**通过**。`openDocument` 对 `pendingRestore` 与 `pendingJump` 逐字同构清理；消费点在 try 之外（成功/失败共用）。
15. N28 验收 6：**通过**。`Math.min(initialPage, pageCount)` 钳制 + 落点即快照，下一次去抖写回实际页码（无独立场景，代码审查判定）。
16. N28 验收 7：**通过**。主进程裁剪已把越界条目降为「无记录」；22d/21b 佐证。
17. N28 验收 8：**通过**。三条入口共用 `requestRestoreFor` / `openDocumentFromLibrary`，无第二套落页逻辑。
18. N29 验收 1–8：**通过**。20c（loading 无入口 + 文案正确 / loaded 出现）、20（点击 → 3/3 + 110%）、20b（无记录 selector 为 null）；入口受 `ready` 门控、文件名走 `docDisplayName`、绝对路径走 `absoluteDocPath`；文件被删与格式不支持走既有失败态/预览。
19. N30 验收 1–7：**通过**。21 静态/实时/裁剪三组断言 + `.row-label`/`.tree-row` 无溢出（246/246、109/109）+ 键用 `row.node.path`；`library-list`、`flattenVisible`、`expanded` 零改动。
20. N31 验收 1–6：**通过**。655 = round(595×1.1)、110%；无记录 → 100%（22d）；`setScale` 早于 `getDocument` 且 `pdfDoc === null` 时缩放 watcher 早退；常量单一来源（无复制字面量）；22b 在 110% 下翻页 + 摘录；搜索/知识地图/框选零耦合（grep 0）。
21. N32 验收 1–4：**通过**。`resetState()` × 3；24 两工作区无残留（B 侧先证行存在）；`loadSeq` 作废在途 load；goHome 的 flush 已落盘 page 2。
22. N33 验收 1–8：**通过**。读不改写（烟测比对字节/mtime）、裁剪规则逐条、corrupt 重建、version 2 不迁移、`lastDocPath` 过滤、无备份文件、唯一 warn 点（增量基线）。验收 7 的**字面口径**由我的补充运行满足：fixture 起始就把 A 写成截断 JSON，00–11 + 全部场景仍绿、退出码 0。
23. N34 验收 1–5：**通过**。stub 与 `PixApi` 同名同形、控制口齐全且 `setReaderState` 直写真文件（与被测读路径同源）、21b 判别裁剪；截图 6 组齐全 + 增补 9 张；四组断言以 `throw` 实现；00–11 全绿、`failure` null、43 张 ≥ 改前；`npm run check` 0 error。

### 4. 三个「最可能出错但没人验证」的点与我的判定

1. **去抖窗口内切文档丢最后一次页码**：判定 = 场景③（末次 payload = 旧文档 + 第 3 页）+ 我的复跑 + 代码审查（`flush()` 只读持续维护的 `snapshot`，切换后绝不回读 `readerStore.page`）。结论：成立，且有硬证据；`goHome` 路线由 24a 同样证明。
2. **安全点 b 的 no-root 竞态（`goHome` 的 `flush` 与 `stopSession` 顺序）**：离屏覆盖不到（stub 的 `stopSession` 不清 `activeRoot`），只能代码审查。我的判定链：`flush()` 是 `goHome()` 第一条语句（awk `EXIT=0`）→ `submitIfChanged()` 里 `bridge().readerStateSave(...)` 是**同步发起的 invoke**（async 函数体在首个 await 之前同步执行），故 save 消息先于 `stopSession` 入队；主进程两条 handler 全同步、按到达顺序执行，save 先完成。反向风险已量化：我的烟测证明「先 `clearLibraryRoot()` 再 save」会静默返回 `no-root`、不写盘、不记 warn——即顺序写错会静默丢最后一页，而这条路径没有离屏证据。
3. **状态文件被外部改造/半写截断**：判定 = 原子写协议 + 我的烟测（`.tmp` 被占用 → `write-failed` 且原文件字节与 mtime 不变；读侧截断 → `corrupt` + 空模型 + 不写盘；单写者且读-改-写全同步，无交错丢写）。结论：成立。
4. 主动补证两条（仓库脚本未覆盖）：**损坏状态下从头跑完整套场景**（fixture 起始写截断 JSON → 退出码 0、44 张截图，N33 验收 7 的字面口径）；**同文档笔记跳转**（我的补充场景实测「第 2 / 3 页」+「110%」，N28 验收 3 前半）。

### 5. 次级观察（不阻塞，建议记录）

1. 树徽标对「当前文档」取实时页码 ⇒ 打开任何 PDF（即使无记录）都会出现「第 1 页」徽标，与需求 N30 首句「未读过的 PDF 不显示」措辞略有出入；设计档 §1.5 已写死该语义（评审次级项 6 亦要求明写），故不作缺陷，建议 PRD 侧同步一句。
2. save 回包乱序时 `applyState(result.state)` 理论上会把 `documents`/`lastDoc` 回退到较旧值（只影响展示，文件为准）；单通道 + 同步 handler 下实际不会乱序，记录备查。
3. `relativeDocPath()` 用「绝对路径后缀切片」还原原大小写相对路径，依赖 `toLowerCase()` 不改变长度（ASCII 成立，极少数 Unicode 例外），属可接受边界。
4. `no-root` 的渲染层分支（空模型 + 不记 warn + 不发写）无离屏证据，只有代码审查——与设计档 R4 的不覆盖声明一致。

### 6. 审查残留物

无。补充场景跑在 `%TEMP%` 的临时副本（脚本副本 + 结 junction 借用仓库 `node_modules` 做模块解析），跑完已删除，并复核仓库 `pix/node_modules` 仍为 365 项、工作树只有白名单改动；未执行任何 git 写命令。
