# R15 全量代码审计 · 汇总与定级（汇总档）

> 输入：6 份分片审计报告（`docs/pm/R15-audit-{main-session, main-stores, render-panels, render-pdf, render-stores-utils, scripts-docs}.md`，合计 2021 行），基线 HEAD `e5dc001`。
> 本档由汇总代理**只读**产出（未改任何源码/脚本；`git status` 仅显示 6 份报告为未跟踪文件）。
> 编号口径：沿用分片编号（`S1-*` / `S-MS-*` / `S-RP-*` / `S-PDF-*` / `S-RU-*` / `S-SD-*`，D 项为各自报告的登记项）。
> 入册口径：P0 全入；P1 中「失败路径缺陷 / 竞态 / 资源泄漏（含无界资源消耗）/ 契约漂移」入册；P2 仅「与仓库规范冲突或明确死代码/无用导出且改动局部、风险低」达标准。修复清单总量控制 **≤ 20 条**；达标准但被 20 条上限裁出的条目全部进 §4 并逐条给替代方案。
> 本轮不做：重构、架构调整、新功能。

---

## 1. 总览表

### 1.1 分级分布（按面，原始计数）

| 面 | 报告 | 范围 | P0 | P1 | P2 | D | 合计 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 主进程 · 会话桥与 IPC | main-session | `session-bridge` / `ipc-handlers` / `preload` / `pdf-tools` / `chat-files` / `file-dialogs` / `index` / `reading-prompt` | 1 | 7 | 5 | 2 | 15 |
| 主进程 · 存储与路径 | main-stores | `notes-store` / `reader-state-store` / `library-root` / `pix-paths` / `settings-store` / `env-setup` | 2 | 2 | 8 | 4 | 16 |
| 渲染层 · 面板与会话 UI | render-panels | 面板/输入/布局组件、页面、路由 | 1 | 5 | 14 | 4 | 24 |
| 渲染层 · PDF 阅读链路 | render-pdf | `PdfViewer` / 搜索 / 摘录 / ReaderPanel / KnowledgeMap / 截图 | 1 | 5 | 8 | 4 | 18 |
| 渲染层 · store/composable/纯函数 | render-stores-utils | 7 个 store、4 个 composable、8 个 utils | 0 | 3 | 14 | 4 | 21 |
| 脚本、配置与文档 | scripts-docs | `ui-shot.mjs` / 两个烟测 / 打包与 tsconfig / README / REMAINING / docs/pm | 0 | 3 | 17 | 3 | 23 |
| **合计** | | | **5** | **25** | **66** | **21** | **117** |

### 1.2 修复清单分配（按主来源面，共 20 条）

| 面 | 入册 | 说明 |
| --- | --- | --- |
| 主进程 · 会话桥与 IPC | 7 | F5 / F11 / F13 / F14 / F17 / F19 / F20 |
| 主进程 · 存储与路径 | 4 | F3 / F4 / F9 / F12 |
| 渲染层 · 面板与会话 UI | 4 | F1 / F6 / F8 / F16（F11 同时覆盖本面入口） |
| 渲染层 · PDF 阅读链路 | 2 | F2 / F18 |
| 渲染层 · store/composable/纯函数 | 3 | F7 / F10 / F15（F12 同时覆盖渲染侧） |
| 脚本、配置与文档 | 0 | 2 条 P1 被 20 条上限裁出（§4.1）、1 条不属四类（§4.2），余为 P2（§4.4） |
| **合计** | **20** | P0 ×5 + P1 ×15（覆盖 16 条源发现） |

### 1.3 全局规则

1. **P0 ×5 全入册**（F1–F5）。
2. P1 四类候选 20 条（覆盖 21 条源发现，含 1 组两源合并），加 P0 共 25 条 > 20 ⇒ 按「用户可见性 × 数据安全 × 修复风险」排序取前 20，裁出 5 条（§4.1）；另有 4 条 P1 不属四类，未入册（§4.2）。
3. P2 达标准者（死代码/无用导出/规范冲突）约 28 条，因 20 条名额已被 P0+P1 占满，全部进 §4.4 登记（其中 2 条已并入 F：`S-RU-06` → F12、`S-RP-20` → F11）。
4. 计数核对：入册覆盖源发现 **21** 条 + 并入 F 的 P2 **2** 条 + D **94** 条 = **117** 条（与 §1.1 合计一致）。

---

## 2. 去重与合并（同一根因跨面/同面多报）

| 组 | 根因 | 来源面 · 编号 | 处置 |
| --- | --- | --- | --- |
| M1 | 会话入口无互斥/无重入守卫：并发 `startSession`/`newSession` 产生孤儿会话、订阅与 MCP adapter 泄漏、库根漂移 | S1-02 + S-RP-20（两个面各报一半：桥内无串行门 / 页面无在途守卫） | **并入 F11** |
| M2 | 主进程「大输入无上限 + 整读」：pdf 工具与聊天附件同族 | S1-04 + S1-05（S1 面自述"体积上限口径可合并成一次决策"） | **并入 F17** |
| M3 | `pdf-tools.ts` 复制 `library-root.ts` 的路径规则，并继承同一 realpath 缺陷 | S1-10（规则复制）+ S-MS-02（同缺陷第二处）+ S-MS-08（四/五份实现） | realpath 修复并入 **F4**；规则去重（重构性质）进 D（§4.4 S-MS-08） |
| M4 | 路径比较键 / 相对化 / 越界判定 4–6 份实现（含注释与实现不符、渲染层两个变体） | S-MS-08 + S-RU-11 | D（**重构，本轮不做**） |
| M5 | `project-store` 定型死成员（`isLoadingSessions`/`setCurrentProject`/`addSession`） | S-RP-16 + S-RU-08（后者明确"不重复计数"） | D（P2 死代码包，§4.4） |
| M6 | markdown 图片 `alt` 双重转义；无 CSP 第二道防线 | D-RP-01 + D-RP-02 + S-RU 复核（两处独立复现） | D（§4.3） |
| M7 | 渲染层「粘贴/附件失败静默」：调用方无法区分"无图/解码失败"，`pickFiles` 无 catch、粘贴超限无提示 | S-RP-13 + S-PDF-12（后者自述需与本分片协调） | D（PRD §5.5 达标候选，被上限裁出，§4.4） |
| M8 | `reader-state` 降级契约两侧不一致：主进程读到 corrupt/版本不符静默整文件覆盖、渲染层忽略 `result.success` | S-MS-04 + S-RU-06 | **并入 F12** |
| M9 | 「当前工作区根」6 处各自派生 | S-RU-12（含 PdfViewer/ReaderPanel 两处属他面） | D（重构，§4.4） |
| M10 | 死代码/无用导出集合（主进程、渲染层、脚本三面） | S1-10、S-MS-11、S-RP-16、S-RU-04/05/07/08/09/16、S-PDF-08/09、S-SD-04/12/15/16/17 | D 组「下轮零风险清理包」（§4.4 各面表） |
| M11 | 渲染层静默失败集合（同一规范出处 PRD-V0.5 §5.5） | S1-09（渲染半）、S-RP-10/13/14/15、S-PDF-10/12 | D（建议捆绑一批，§4.4） |
| M12 | ui-shot 可靠性簇（三面一致无判据、flake、零缺失无自检、stub 第二实现） | S-SD-01/02/03（P1）+ S-SD-05…11（P2） | S-SD-01/02 被上限裁出（§4.1）、S-SD-03 不属四类（§4.2），P2 进 §4.4 |
| M13 | IPC 越界守卫不一致（read 面有守卫、list/open 无） | S1-06 + S-MS §5 交接观察（后者未编号） | **并入 F19**，来源标注两处 |
| M14 | notes 逃生口与损坏语义族 | S-MS-03（备份路径无消费 + 写入顺序）+ D-MS-01（全有或全无） | 写入顺序与路径消费并入 **F9**；D-MS-01 保持登记（§4.3） |
| M15 | 缩放相关（末页跟踪 / 高亮消失 / 按钮禁用态 / 地图抑制窗口） | S-PDF-01 / 06 / 10 / D-PDF-04 | 根因不同不合并；F2 入册，其余 D；同文件建议同批复核（§7） |

---

## 3. 修复清单（本轮要修的，F1–F20）

排序依据：用户可见性 × 数据安全 × 修复风险（P0 全入且位次靠前；同档内低风险、低工作量者先行）。

### F1 · 回车发送缺少输入法（IME）组合态守卫（P0）
- 来源发现：S-RP-01（渲染面板面；同根因次要位置：`SettingsPage.vue:482/348`、`ChatPanel.vue:1136`）。
- 位置：`pix/src/renderer/components/input/InputArea.vue:28-33`。
- 修法要点：`onKeydown` 首行加 `if (e.isComposing || e.keyCode === 229) return;`（照抄 `PdfSearchPanel.vue:308` 既有写法）；次要位置同法或改显式按钮触发。
- 判据：在 `.input-area` 派发 `new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true })` ⇒ `sendPrompt`/`sendSteer` 计数为 0、value 不变；再派发 `isComposing: false` ⇒ 计数 +1。
- 修复风险：不触冻结面（已核对 `ui-shot.mjs:2435` 的 steer 驱动默认 `isComposing === false`）。
- 工作量：小。

### F2 · 末页永远不是「当前页」（缩放 <1 或窗口足够高）（P0）
- 来源发现：S-PDF-01（PDF 阅读链路面）。
- 位置：`pix/src/renderer/components/workspace/PdfViewer.vue:290-315`（判据 `:294`，写回 `:314`）。
- 修法要点：二分之后加触底钳制：`if (root.scrollTop + root.clientHeight >= root.scrollHeight - 1) { readerStore.setPage(pageCount); return; }`（不改中部滚动取页口径）。
- 判据：新增离屏选择器 `zoomOutBtn: '.pdf-toolbar button[title="缩小"]'` → 缩到 `50%` → `End` ⇒ `.page-label` 逐字 `第 3 / 3 页`（修复前必红）；`scrollTop = 0` ⇒ 回到 `第 1 / 3 页`；100% 下既有翻页断言零回归。
- 修复风险：相邻冻结面（新增 1 个选择器 + 1 条场景；既有的 `第 3 / 3 页` 断言全部在 100% 缩放下成立，不受影响）。
- 工作量：小（代码）/中（含离屏场景）。

### F3 · 设置文件非法 JSON ⇒ 应用启动不了（P0）
- 来源发现：S-MS-01（主进程存储面）。
- 位置：`pix/src/main/settings-store.ts:22-31`；`pix/src/main/index.ts:173,180-184`。
- 修法要点：构造期 try/catch，坏文件改名 `pix-settings.json.corrupt-<stamp>`（沿用 `uniqueBackupPath` 策略）后用默认值重建；`whenReady` 链补 `.catch`（弹错误框 + 可继续启动）；`getAll()` 出口做 `GuiSettings` 形状校验（`recentProjects` 必须为数组）。
- 判据：写入截断 JSON / 零字节文件 ⇒ 构造不抛、出现 `pix-settings.json.corrupt-*` 且 `getAll()` 等于默认值；人工：清空 `%APPDATA%\PiX-Read\pix-settings.json` 后仍能起窗口。
- 修复风险：不触冻结面（两个烟测编译面不含这两个文件）。
- 工作量：小。

### F4 · 库根为目录联接/符号链接时整库被判越界（P0）
- 来源发现：S-MS-02（主进程存储面；`pdf-tools.ts` 的复制实现同缺陷，见 M3）。
- 位置：`pix/src/main/library-root.ts:18-19,38-51`；`pix/src/main/pdf-tools.ts:18-47`。
- 修法要点：`setLibraryRoot` 时缓存 `realpathSync` 解析后的根（失败回退字面 `resolve`）；`isLibraryFilePath` 用「候选 real 路径（失败回退字面）落在解析根之下」；`pdf-tools.ts` 删除复制实现、改为复用同一助手（`isInsideRoot(cwd)` 的额外放行显式保留或删除，由实施者二选一并注释）。
- 判据：探针四条：`setLibraryRoot(linkDir)` 后接联访问同一文件 true（修复前 false）；真实路径访问 true；兄弟目录与 `../` 逃逸仍 false；**不存在的库内路径仍 true**；`smoke-notes` 51/51、`smoke-view` 35/35 全绿。
- 修复风险：**触冻结面**——`main/library-root.ts` 在 `smoke-notes.mjs` 编译面内（`required = [main/notes-store.js, main/library-root.js]`），必须保住上述既有语义；`isPathInsideDirectory` 被 `ipc-handlers.ts:677` 用于会话文件保护，语义不得放松。
- 工作量：中。

### F5 · MCP 工具被白名单整体过滤，而 MCP 设置页仍逐条展示「N 个工具」（P0）
- 来源发现：S1-01（主进程会话面 × MCP 设置页）。
- 位置：`pix/src/main/session-bridge.ts:1259-1270`；`pix/src/renderer/components/settings/McpSettings.vue:157,176-186`。
- 修法要点：**默认路径（不新增能力）**——在 `tools` 白名单处加注释说明这是只读边界；MCP 设置页明写「服务器工具不会提供给模型（PiX 只开放只读工具）」，消除「展示了就等于能用」的误导。若负责人裁决改为「开放 MCP 工具」（白名单注入），属功能变更与本轮反需求冲突，须单独立项重估冻结面，不在本清单默认执行路径。
- 判据：一次性复现脚本（照抄 `packages/coding-agent/test/suite/regressions/2835-*.test.ts` 骨架）证明 `getAllTools()` 不含 `mcp__demo`（记录为有意边界）；UI 侧断言出现「不提供给模型」文案（新增 1 条离屏记录或人工走查）。
- 修复风险：相邻——改 `McpSettings.vue` 文案。经复核 `ui-shot.mjs` 对 MCP 面板**无断言**（stub `mcpGetServers` 返回 `[]`），预计只新增文案记录，不重写既有断言。
- 工作量：小。

### F6 · 发送失败丢弃用户正文（P1，用户输入损失）
- 来源发现：S-RP-02（渲染面板面）。
- 位置：`pix/src/renderer/components/workspace/ChatPanel.vue:369,386-391`。
- 修法要点：catch 内若 `draft.value === ""` 则回填 `text` 并 `nextTick` 聚焦；保留既有「乐观气泡回滚」语义；不加 ErrorBlock 重试按钮（避免扩大面）。
- 判据：扩展离屏场景：`setSendFailure("throw")` → 发 `TEXT` → 断言 `.input-area` value === TEXT、用户气泡仍已回滚、`.composer-send` 可点。
- 修复风险：相邻——必须保持 `ui-shot.mjs` 场景 45 系列 `userBlocksRolledBack` 与错误文案 `stub 发送注入异常`；45/45B/45C 每轮先 `setDraft` 覆写，预计零红，需实跑确认。
- 工作量：小。

### F7 · 迟到的 reader-state save 响应回灌已复位的 store（P1，竞态；已探针复现）
- 来源发现：S-RU-01（渲染 store 面；探针 1-d 现为失败态）。
- 位置：`pix/src/renderer/stores/reader-state-store.ts:108-121,229-240`。
- 修法要点：加提交令牌 `saveEpoch`：`resetState()` 递增；`submit()` 在 `await` 之后先判 `if (epoch !== saveEpoch) return;` 再 `applyState`（只丢弃跨 reset 的响应）。
- 判据：探针 1-d 转绿；反向断言：不调 `resetState()` 时迟到响应仍必须写回（防止过度丢弃）；离屏 resume/徽标场景零回归。
- 修复风险：不触冻结面（store 内部，无导出/契约/文案变化）。
- 工作量：小。

### F8 · 澄清请求被替换时 `currentQuestionIndex` 未复位 ⇒ 卡片消失且 composer 被禁用（P1，无出口）
- 来源发现：S-RP-03（渲染面板面）。
- 位置：`pix/src/renderer/components/workspace/ChatPanel.vue:143-152,206-212,690-718`。
- 修法要点：加 `watch(() => props.pendingUserInput, () => { currentQuestionIndex.value = 0; answerMap.value = {}; })`（含 `request.id` 变化）。
- 判据：`emitUserInputRequest({id:"r1",questions:[q1,q2]})` → 推进到第 2 题 → `emitUserInputRequest({id:"r2",questions:[q1]})` ⇒ `.clarification-card` 仍在 DOM、`.question-progress` 为 `1 / 1`、`.card-textarea` 未禁用。
- 修复风险：不触冻结面（组件本地状态；既有澄清场景每次只发一个请求）。
- 工作量：小。

### F9 · notes 逃生口：先搬走原文件再写新库，写失败时用户拿不回笔记且界面不提备份路径（P1，数据安全）
- 来源发现：S-MS-03（主进程存储面）；`backupPath` 生产了但渲染层零消费。
- 位置：`pix/src/main/notes-store.ts:526-552`；`pix/src/renderer/stores/notes-store.ts:382-398`；`pix/src/renderer/components/workspace/NotesPanel.vue:393-403`。
- 修法要点：顺序改为「先 `copyFileSync` 备份（原文件不动）→ 再原子写新库」；渲染层把 `backupPath` 透出：成功/失败文案均带路径并复用 `revealPath` 提供「在文件夹中显示」。
- 判据：`smoke-notes` 追加：成功路径 `backupPath` 非空且 `existsSync === true`；注入写失败后断言 `existsSync(NOTES_A) === true`（顺序改法）；渲染层侧提示条文本包含备份路径（离屏 1 条记录）。
- 修复风险：**触冻结面**——既有断言（备份名匹配 `notes\.json\.corrupt-\d{8}-\d{6}(-\d+)?`、`backups.length === 1`、重建为空库）在 copy 实现下同样满足，仍需实跑；`undoSlot` 清槽语义不变。
- 工作量：中。

### F10 · `loadNotes` 失败分支缺 `writeSeq` 守卫：写成功后到达的 reject 把面板推入 error 态（P1，已探针复现）
- 来源发现：S-RU-02（渲染 store 面；探针 2-c 现为失败态）。
- 位置：`pix/src/renderer/stores/notes-store.ts:227-258`（成功分支 `:234` 有守卫，catch `:252-257` 没有）。
- 修法要点：catch 内与成功分支同判据：`if (seq !== loadSeq || startWriteSeq !== writeSeq) return;`。
- 判据：探针 2-c 转绿；保留 2-a/2-d（loading 与数据仍在）防止「用清空状态换通过」；离屏笔记场景零回归。
- 修复风险：不触冻结面（一行判据；error 态场景由 `result.success === false` 分支驱动，不经过 catch）。
- 工作量：小。

### F11 · 会话生命周期无互斥：孤儿会话、订阅/MCP adapter 泄漏、库根漂移（P1，竞态）+ 入口重入（并入 S-RP-20）
- 来源发现：S1-02（主进程会话面）+ S-RP-20（渲染面板面，同根因 M1）。
- 位置：`pix/src/main/session-bridge.ts:202-220,279-311,1277-1283,1291-1297`；`pix/src/renderer/pages/HomePage.vue:43-61`。
- 修法要点：桥内加单一串行门（`start`/`newSession`/`switchSession`/`fork`/`navigateTree` 串到 `this._lifecycleChain`）；`session-start` 对「同一 projectDir 且已 running」幂等返回；`_activateSession` 先 `this._unsubscribe?.()` 再订阅；`HomePage.openWorkspace` 加 `opening` 在途守卫 + loading 态。`libraryRoot` 写入点（`ipc-handlers.ts:359-368`）在串行门之后复核一次。
- 判据：并发脚本（沿 `smoke-notes.mjs` 的编译加载套路）：`Promise.all([bridge.start(dirA), bridge.start(dirB)])` ⇒ 会话 dispose 只 1 次、`ready` 只 1 次、`sessionFile` 与 `getLibraryRoot()` 同项目；手工：双击「最近打开」只出现一次会话重建；离屏既有场景零缺失（并发路径无既有断言，属已知缺口）。
- 修复风险：相邻——触会话生命周期与 `agent-ready` 事件次数（`index.ts:200-201` + `ipc-handlers.ts:851-896` + `useRpc.agentStatus`），既有烟测/离屏不覆盖并发路径，需实机验证双击场景。
- 工作量：中。

### F12 · reader-state 降级契约：corrupt/版本不符被静默整文件覆盖；渲染侧忽略 `result.success`（P1，数据安全；含 S-RU-06）
- 来源发现：S-MS-04（主进程存储面）+ S-RU-06（渲染 store 面，同契约两侧）。
- 位置：`pix/src/main/reader-state-store.ts:205-250`；`pix/src/renderer/stores/reader-state-store.ts:152-175`。
- 修法要点：主进程——`corrupt` 重建前先按 `uniqueBackupPath` 备份（`reader-state.json.corrupt-<stamp>`，路径写日志）；`version-unsupported` 对齐 notes-store 语义直接拒写；`missing` 从 `degraded` 摘出（保留「一条失败一行日志」）。渲染层——`!result.success` 时按 `code/error` 打一条 warn（`ready` 仍置位，不破坏「本轮永不落盘」的既有兜底）。
- 判据：`smoke-notes` 新增组（编译面加入 `main/reader-state-store.ts`，同步 `required` 白名单）：非法 JSON 保存后出现 `.corrupt-*` 且成功；`version:2` 按选定方案断言拒写/有备份；`missing` 的 `degraded === false`；渲染层桩 IPC 返回 `{success:false, code:"no-root"}` 时出现 `load failed (no-root)` 日志且 `ready === true`。
- 修复风险：相邻——编译面新增一个产物（`smoke-notes.mjs` 脚本白名单同步）；该模块当前**零既有断言**（无回归网，必须补组）；渲染层改动只加日志。
- 工作量：中。

### F13 · takeHerEyes 失败路径完全静默（配置了却不生效 = 零提示）（P1）
- 来源发现：S1-03（主进程会话面）。
- 位置：`pix/src/main/session-bridge.ts:1003-1016,1034-1039`。
- 修法要点：早退分支改为「发一条 `eye_model_end{success:false,errorMessage}` 再返回 null」（`provider`/`modelId` 取配置值，缺配置用 `"unknown"`）；`auth.ok === false` 同法；只改失败分支，不动成功路径。
- 判据：主进程侧：`takeHerEyes = {enabled:true, provider:"x", modelId:"y"}` 且主模型无 image 输入 ⇒ `onEvent` 收到 `eye_model_end{success:false}`（当前收不到）；渲染层：聊天流出现 `vision-status` error 块（`finishVisionStatus` 已有无 start 的 end 兜底，不需改渲染层）。
- 修复风险：不触冻结面（仅新增事件；若做离屏取证需给 stub 增加一次事件注入，属新增记录）。
- 工作量：小。

### F14 · `installUpdate(): void` 吞掉主进程拒绝结果，会话在跑时点安装无界面反馈（P1，契约）
- 来源发现：S1-08（主进程会话面）。
- 位置：`pix/src/main/preload.ts:108,193`；`pix/src/renderer/pages/SettingsPage.vue:309-313`；**`pix/scripts/ui-shot.mjs:1147`**。
- 修法要点：`installUpdate` 契约改为 `() => Promise<{ success: boolean; error?: string }>`；`SettingsPage` `await` 并读 `success/error`，失败显示中文提示（建议顺带校验「未下载就点安装」）。
- 判据：会话运行中在设置页点「安装更新」⇒ 页面出现「有会话正在运行…」文案且应用不退出；无会话时行为不变。
- 修复风险：**触离屏面**——经复核 `ui-shot.mjs:1147` 的 stub `installUpdate: function () {}` 返回 `undefined`，渲染层改为读 `r.success` 后会在离屏直接 TypeError，**必须同步 stub 返回对象**；preload 方法名集合与顺序不变（42 项）。
- 工作量：小。

### F15 · useRpc 同一失败信号两份实现：auth/配置类命令静默失败，面板 catch 永不触发（P1，契约漂移）
- 来源发现：S-RU-03（渲染 store 面；探针 3-a 现为失败态）。
- 位置：`pix/src/renderer/composables/useRpc.ts:187-206,323-326,356-368,427-451`；消费点 `SettingsPage.vue:82-106`、`ChatPanel.vue:676`。
- 修法要点：变更类命令统一走 `sendCommandOrThrow`（或让 `sendCommand` 返回 `{ok,error}` 由调用点判）；`setApiKey`/`removeAuth`/`setSessionName`/`setScopedModels`/`setSteeringMode`/`setFollowUpMode`/`reloadResources` 逐个确认调用点有 catch；模板内裸调用 `rpc.abort()`（`ChatPanel.vue:1116`）补显式 `.catch()`。
- 判据：探针 3-a 转绿（`setApiKey` 在 `{success:false}` 下必须让调用方感知）；正常路径 `{success:true}` 不得抛；设置页密钥保存失败出现中文提示。
- 修复风险：相邻——改抛会新增 rejection 面，必须逐个核对调用点（含模板裸调用），避免把「静默失败」换成「未处理拒绝」。
- 工作量：中。

### F16 · `onMounted` 内 await 之后注册 IPC 订阅：卸载竞态与订阅泄漏（P1，竞态/泄漏）
- 来源发现：S-RP-06（渲染面板面）。
- 位置：`pix/src/renderer/pages/WorkspacePage.vue:74-141`。
- 修法要点：加 `let disposed = false;`，`onUnmounted` 置位并在每个 `await` 之后 `if (disposed) return;`（保持现有注册顺序不变，避免改动 `agent_start` 早到事件时序）。
- 判据：stub 注入慢 IPC（`startSession`/`notes-load` 延迟 500ms）→ 进入工作区后立刻返回首页 ⇒ `onAgentEvent` 的注册/解绑调用数相等（当前多 1 次注册且无解绑），随后派发 `agent_start` 不再触发 `listSessions`。
- 修复风险：不触冻结面（旗标方案不改注册顺序）；慢 IPC 注入需 stub 支持（ui-shot 改动，见 §5）。
- 工作量：小。

### F17 · 主进程大输入无上限 + pdf 工具同步整读/双份拷贝（P1，无界资源；含 S1-05）
- 来源发现：S1-04 + S1-05（同族 M2，S1 面自述建议一次改完两处）。
- 位置：`pix/src/main/pdf-tools.ts:96-107`；`pix/src/main/chat-files.ts:54,90`。
- 修法要点：① pdf 工具在路径守卫后加体积上限（与渲染层 256 MB 口径一致，超限返回可读错误 `PDF too large: <N> MB > 256 MB`）；② `readFileSync` 改异步 `readFile`，去掉第二份 `Uint8Array` 拷贝（`Buffer` 本身即 `Uint8Array`）；③ 聊天附件加统一上限（文本 2 MB 截断 + `truncated` 标注；图片 20 MB 走「附件过大」可读文案；旁加 NUL 字节的二进制嗅探）；④ 上限常量收敛到新的共享叶子模块（避免主进程内部第三份拷贝）。**不做** cached LRU（可选，收益需读数支撑，见 §4.1 边界说明）。
- 判据：300 MB PDF 夹具 ⇒ 返回「too large」且主进程不崩；50 MB 文本附件 ⇒ 注入文本被截断带标记（或返回可读错误）；同请求连调两次时主进程无同步阻塞（`readFileSync` 调用点消失）；`process.memoryUsage().rss` 无数量级跳变。
- 修复风险：相邻——pdf 工具错误文案/`details.error` 口径（既有离屏未见 PDF 工具错误断言）；附件「截断 vs 拒绝」需一次口径确认（默认：文本截断、图片拒绝）。
- 工作量：中。

### F18 · 框选截图 7 处静默早退 + 无条件退出框选模式（P1，失败路径静默）
- 来源发现：S-PDF-04（PDF 阅读链路面）。
- 位置：`pix/src/renderer/components/workspace/PdfViewer.vue:531-544,559-620`。
- 修法要点：`captureRegion` 返回 `boolean`（成功 = 已 `emitRegionCapture`）；`onCapturePointerUp` 仅在成功或「误触阈值」时 `exitCaptureMode()`；失败保留框选模式并在 `.capture-hint` 位置追加一行中文提示（复用既有短提示范式）。
- 判据：进入框选 → 把当前页 `canvas` 宽高置 0 → 拖拽（≥6px）⇒ `.capture-layer` 仍在 DOM、出现失败提示、`.pdf-capture-fab` 仍激活；反向：正常拖拽仍退出模式且 composer 出现「截图 1」chip。
- 修复风险：**触冻结语义**——R4 设计写「松手后退出模式」，交互语义变更须先在轮次需求档登记；新增 DOM 提示节点，`SEL.captureLayer`/`captureFabBtn` 选择器不变。
- 工作量：中。

### F19 · `library-list` / `library-open-path` 缺根校验（read 面却有守卫；open 是执行型出口）（P1，越界守卫契约）
- 来源发现：S1-06（主进程会话面）+ S-MS §5 交接观察（同结论，未编号）。
- 位置：`pix/src/main/ipc-handlers.ts:423-446`（对照 `:188-200` 的 `guardLibraryPath`）。
- 修法要点：`library-list` 改走 `guardLibraryPath`（或「根内 + PiX 自有存储路径」双白名单）；`library-open-path` 收紧为根内（`isLibraryFilePath`）+ 明确注释「根外一律拒绝」；`library-show-in-folder` 保持现状并补注释说明为何不受守卫（设置页需根外能力）；顺带修 `:430` 的「目录不存在」文案（区分 not-found / not-a-directory）。
- 判据：stub 侧：`libraryList("C:/")` ⇒ `success:false`（`no-root`/`outside`）；`libraryOpenPath(<根外可执行文件>)` 被拒且 `shell.openPath` 未被调用；根内两种调用保持成功。
- 修复风险：相邻——可能影响 `ui-shot` 的 library 计数口（既有场景走根内路径，理论零红）；设置页若未来对根外文件调 `libraryOpenPath` 会被拒（当前只用 showInFolder）。
- 工作量：小。

### F20 · `enabledModels` 0 命中静默放宽为「全部模型」（P1，契约漂移；最小修复）
- 来源发现：S1-07（主进程会话面）。
- 位置：`pix/src/main/session-bridge.ts:1145-1204`。
- 修法要点：**最小修复**——`_resolveScopedModels` 匹配数为 0 时 `console.warn` 且**不清空**（保留上一次 `scopedModels`，不再静默回退到全部模型）；设置页同步给出「未匹配到模型」提示（可选）。与内核 `resolveModelScope` 的语义完全对齐涉及上游导出或等价匹配实现（跨仓/依赖策略），不进本轮（见 §4.4）。
- 判据：`["no-such-model"]` ⇒ 有告警且模型列表**不**变成全部；`["*sonnet*"]` 等既有可解析 pattern 行为不变。
- 修复风险：相邻——改 `enabledModels` 生效行为；无既有断言覆盖 0 命中场景（需新增 1 条记录或探针）。
- 工作量：小。

---

## 4. 不修清单（D）

### 4.1 被 20 条上限裁出的 P1（排序靠后，5 条）

| 编号 | 一句话 | 未入册理由 | 替代方案（最小可判据 / 明确接受风险） |
| --- | --- | --- | --- |
| S-RP-04 | 剪贴板同一规则两份实现，失败路径一边报错一边静默 | 上限；用户可见性集中在失败态（低），数据安全 0；修复需新增 ChatPanel 提示行并抽 utils（涉及新文件与 composer 截图） | 最小可判据：stub 让双 API 抛错，点 `.message-copy-btn` 出现中文提示（当前无）；先做「失败反馈单侧补齐」，外提留到清理包（M10） |
| S-PDF-03 | `renderedPages.add` 与 `renderTasks.set` 之间的 await 窗口 ⇒ 同 canvas 并发渲染 | 上限；触发窗口窄、可见后果有限（一次多余渲染 + 一条 console 错误），修复触碰唯一渲染入口 | 最小可判据：`:197` 后加 1 行所有权复核；或**明确接受风险**（错误可重试、无数据损失），离屏监听 `Failed to render page` 作为读数观测 |
| S-PDF-05 | 文档切换与共享 `workerPort` 的 destroy 竞态 ⇒ 偶发假「解析失败」面板 | 上限；窗口取决于 IPC 往返（窄），修复需改加载时序（R6 落点/现场消费链），风险高于收益 | 最小可判据：stub 延迟 A 的加载后连点 A→B→A，断言 `.pdf-error` 不在 DOM；或**接受风险**：偶发时可手动「重试」，无数据损失 |
| S-SD-01 | `PixApi` 接口 / preload 实现 / ui-shot stub 三面一致无自动判据 | 上限；用户可见性 0（影响的是取证基建而非应用），其余两条 S-SD 同因排序靠后 | 沿用 R14 手工三面比对命令（`iface=42 / stub=42`，本轮复核相等）；建议下轮落 40 行 `assert-api-parity.mjs`（判据与负向控制已在报告） |
| S-SD-02 | `selectPageSpan` 裸 20s 等待是已知 flake 点，一次超时牺牲整轮取证 | 上限；用户可见性 0，修复涉及共享前置（8 处调用）需实跑验证 | 明确接受风险：命中时按 R14 先例重跑并记录（本轮验证方案已含该口径）；下轮按同文件 `ensureQuickAskExcerptReady` 范式做有界重取（判据：连续 3 次全量 run 均 exit 0） |

### 4.2 P1 但不属四类、未入册（4 条）

| 编号 | 一句话 | 未入册理由 | 替代方案 |
| --- | --- | --- | --- |
| S-RP-05 | 程序性清空草稿后 textarea 高度不复位 | 非「失败路径/竞态/资源泄漏/契约漂移」，属视觉状态残留 | 最小可判据：离屏读 `.input-area` 高度回到单行（≤32px，新增 1 条 record）；修法 1 行 watcher，可随下轮清理包顺手做 |
| S-PDF-02 | 释放路径 O(N²) 的 DOM 扫描（大文档缩放卡顿） | 非四类（性能热点，非泄漏） | 最小可判据：200 页夹具记录 5 次连续放大的累计耗时（差值 <10ms 则降级为观测项）；修法（`pageNodes` 建表 + 未渲染页早退）风险低，建议下轮 |
| S-PDF-06 | 缩放后搜索高亮静默消失（悬空 Range 无人重绘） | 非四类（状态未复位/陈旧引用，发生在正常路径） | 最小可判据：缩放后 `CSS.highlights.get("pix-search-current").size === 1` 且 Range `isConnected`；修法 1 个 watcher 复用 `revealCurrentMatch` 两行，建议下轮 |
| S-SD-03 | 结束自检不校验「场景/断言覆盖」，整组场景静默消失仍绿灯 | 非四类（取证自检缺口，非产品失败路径） | 最小可判据：新 run 的 `MANIFEST.shots[].name` 与 label 集合 ⊇ 基线（本轮验证方案的手工口径，§6.2）；下轮在 MANIFEST 加 `groups/counts` 并支持 `PIX_SHOT_BASELINE` 比对 |

### 4.3 原报告登记不修项（D，21 条，维持登记）

| 编号 | 一句话 | 维持理由（摘自报告） | 代价 / 若将来处理 |
| --- | --- | --- | --- |
| S1-13 | `switch_session` 无路径校验 / `delete-session` 目录名前提 + mkdir 副作用 / `export_*` 的 outputPath 直通 | 调用方受信、内核兼容规则、导出未接线；加守卫需先定产品口径 | 开放「导入/外挂会话」或接线导出时，必须补 `isPathInsideDirectory` 校验与输出路径限制 |
| S1-15 | `webPreferences.sandbox: false` | 需一次打包版 + dev 两侧实机回归（本轮只读无法验证） | 渲染层被攻破时影响面更大；建议 F19 收紧后单排一轮「开启 sandbox」回归 |
| D-MS-01 | notes.json 全有或全无的损坏语义 | 逐条抢救需新错误码/部分加载 UI，且与 smoke corrupt 逐字断言冲突 | 手改坏一条即整库读不出（原文件在备份名里）；F9 已让备份路径可见，作为兜底 |
| D-MS-02 | `reports/` 只增不减 | 报告是用户可见产物，自动清理需产品决策（保留期/随文档删除） | 陈旧报告积累（报告头有生成时间可自证） |
| D-MS-03 | 导出/报告 `localeCompare` 排序 | 改码元比较/固定 Collator 会改双侧次序，夹具不敏感 | 跨机器/跨 ICU 的 `notes.md` 组次序理论上可不同；同机稳定 |
| D-MS-04 | 比较键强制小写（大小写敏感 FS 上合并不同文件） | 目标平台 Windows，全仓建立在该约定上；改动需跨 4 模块键域重构 | Linux/macOS 上同名异例文件合并；可达性极低 |
| D-RP-01 | markdown 图片 `alt` 双重转义 | 仅文案级；`renderer` 是 R5 起冻结的渲染面 | 悬停提示多一层实体；将来做无障碍朗读前先修 |
| D-RP-02 | 无 CSP 第二道防线 | 本面非修复位置（主进程/入口面），且需与 Vuetify 内联样式一起评估 | 缺纵深防御；建议下一轮安全面立项（判据：`script-src` 生效且离屏/开发模式不破） |
| D-RP-03 | 资料库树固定展开三层 + 全树常驻 | 与 R14 冻结的树几何/徽标读数冲突；目标场景规模通常不触发 | 超大库首屏渲染行数多；仍受一次 `libraryList(...,3)` 深度约束 |
| D-RP-04 | 笔记折叠阈值 180 字符为启发式 | 精确判据需逐行测量（布局抖动）；改阈值影响 `.note-expand` 渲染集合 | 少数中文长笔记被截断且无「展开全文」（可点行打开原文） |
| D-PDF-01 | `MAX_SCALE × DPR` 无上限的 canvas 后备存储 | 修法涉及清晰度取舍与真机内存读数，本轮无判据 | 4K + 200% 屏缩 + 300% 缩放下内存偏高；判据见报告（MEASUREMENTS 记录 + 同机对比） |
| D-PDF-02 | 首屏前全量测量页尺寸 | 惰性测量会改 `.pdf-page` 首帧尺寸，撞冻结几何断言，须先改需求档 | 1000 页级文档秒级首屏等待；判据见报告（<500ms 且尺寸与冻结值一致） |
| D-PDF-03 | 框选模式内滚轮被拦截、分页键仍生效 | 两侧语义各有冻结出处（R4/R11），改动须回改文档并新增断言 | 想框选远页需 Esc 退出→滚动→再进入；能力不一致 |
| D-PDF-04 | 地图自动滚动抑制窗口用时长假设 | 影响限于地图树滚动位置；修法新增跨组件耦合 | 极端慢渲染下地图跳一下；判据见报告（`.map-tree` scrollTop 不变） |
| D-RU-01 | `buildChapterRanges` 最坏 O(n²)（10000 节点 83.5ms） | 现实书签数量小、重算不在热路径；改 O(n) 触碰 R12 冻结语义 | 极端文档首次生成章节表约 80ms 卡顿（一次性） |
| D-RU-02 | `preflightLibraryPath` 字符串前缀判定 | 方向是「可能误放行、不会误拒绝」，权威判定在主进程；改成 resolve 会破坏纯函数编译面 | 越界访问多一次 IPC（可忽略） |
| D-RU-03 | 单槽 handler 无归属令牌 | 当前唯一注册者，无可观测故障；改句柄会触 ChatPanel 卸载路径 | 将来出现第二个消费者时必须同步改造（两个文件） |
| D-RU-04 | `openDocument` 不复位 `scale`/`captureMode` | 与跨工作区复位组合看是有意设计；改动触 R6/R11 恢复语义与几何断言 | 无记录文档继承上一文档缩放；框选态跨文档保留（Esc 可退） |
| D-SD-01 | `record()` 首败即抛，单点失败终止全轮 | R11–R14 冻结的取证契约（MANIFEST `failure` 单字符串语义） | 一次环境 flake 牺牲整轮；缓解见 §4.1 S-SD-02 |
| D-SD-02 | stub 是主进程语义的第二实现（约 40 个镜像函数） | 收敛为单一来源需重做取证基建（stub 必须不依赖编译产物） | 语义漂移型假绿；缓解=关键文案常量在两侧同串断言（现有做法） |
| D-SD-03 | `PIX_SHOT_ROOT` 守卫不校验目录归属 | R11 已显式登记的取舍 | 指向他人临时目录时会递归删其 `shots/`；加固需标记文件（改所有调用命令） |

### 4.4 未入册的 P2（64 条，按面分组）

> 口径：标注「达标」= 符合 P2 入册标准（明确死代码/无用导出，或与仓库规范冲突，且局部低风险），因 20 条上限未入册；未标注者为不达标（评审类/设计类/重构类/需求未定类）。已并入 F 的 2 条不在此列：`S-RU-06` → F12、`S-RP-20` → F11。

**主进程（S1，5 条）**

| 编号 | 一句话 | 未入册理由 | 替代 / 代价 |
| --- | --- | --- | --- |
| S1-09 | `respond_user_input` 失败无出口（bridge 抛错 + 渲染层 `void`） | 未达标（P2；修复涉及 IPC 幂等语义，渲染半属 §5.5） | 最小判据：过期请求提交后出现「该提问已失效」提示；修法：IPC 幂等返回 `{success:true, ignored:true}` |
| S1-10 | 死代码与重复实现（3 个无调用点方法、`navigateTree` 两份、未用 import、pdf-tools 规则复制） | **达标（死代码）**；上限。纯删除部分零风险；pdf-tools 去重已随 F4 处理 realpath 部分 | 下轮首批：删 `getStderr`/`isStreaming`/`setAutoCompact` + 2 个未用 import + `navigateTree` 转发；`excludeTools` 语义保留并注释 |
| S1-11 | 三处 `catch` 静默降级为空值（会话列表/鉴权状态/命令表） | 未达标（主进程侧，§5.5 只约束渲染层；改动跨面） | 最小判据：会话目录不可读时 UI 有提示；修法：`list-sessions` 返回 `error` 字段 |
| S1-12 | `set-settings` 未知键只告警；`setPiSettings` 非原子 | 未达标（输入校验契约，P2） | 最小判据：`{foo:1}` 返回明确回执、8 条第 5 条非法时前 4 条不落盘；修法：首行对象校验 + 全量键校验两段式 |
| S1-14 | biome `files.includes` 不覆盖 `pix/src`，主进程代码无 lint 门禁 | **达标与否存疑**（非死代码，属「规范无执行门禁」）；首次开启会产生既有告警批次（成本中高） | 替代：先 `biome check pix/src/main --diagnostic-level=error` 只读落地（判据：Checked 0 → N，退出码按存量清零），再逐步加严 |

**主进程存储（S-MS，8 条）**

| 编号 | 一句话 | 未入册理由 | 替代 / 代价 |
| --- | --- | --- | --- |
| S-MS-05 | `updateNoteComment` 无长度上限与校验 | 未达标（信任边界校验，P2） | 最小判据：5000 字备注返回 `too-long` 且 notes.json 字节不变；修法：写侧 2000 字闸门（勿改读侧） |
| S-MS-06 | `statNotesFile` 先读后 stat（hash 与 size/mtime 非同一快照） | 未达标（P2 竞态，渲染层只用 hash，真实影响小） | 最小判据：既有 notes-stat 7 条 + 「同一调用内 size === 读取字节长度」；修法：`openSync→fstatSync→readSync` 单句柄 |
| S-MS-07 | `startsWith("..")` 把合法名字（`..foo.pdf`）误判为库外 | 未达标（边界缺陷，P2） | 最小判据：库内 `..foo.pdf` 可加笔记/存现场，`../ws-b/x` 仍 outside；修法：`.. + sep` 精确判定（两处同改） |
| S-MS-08 | 路径比较键/越界判定 4–5 份实现（含渲染层两个变体） | 未达标（**重构**，本轮不做） | 单轮立项：新增 `shared/doc-path.ts` 叶子模块；须同步两个烟测的编译面白名单（改脚本） |
| S-MS-09 | `documents` 无上限/无淘汰；每次保存整文件同步解析 | 未达标（产品决策：淘汰会丢老文档现场；架构改动） | 先做体积闸门（reader-state 侧，>4MB 降级不卡死）；淘汰策略单独立项 |
| S-MS-10 | `pixLogsDir` 只登记不创建，却被设置页当可打开目录展示 | 未达标（界面承诺 vs 实际，非死代码/规范冲突） | 修法二选一（`mkdirSync` 一行 / 从设置页移除），成本 5 分钟，建议随 M10 清理包 |
| S-MS-11 | 死代码簇：`SettingsStore` 四个方法 + `applyAmbientCredentialPolicy(true)` 分支零消费 | **达标（死代码）**；但涉及「删除有意代码需负责人确认」（密钥内存缓冲） | 先做读侧 `Array.isArray` 守卫（消除 TypeError 崩溃点）；删除/接线需裁决 3 选 1 |
| S-MS-12 | 会话目录名编码有损（`C:\a\b` 与 `C:\a-b` 同目录），会话列表串项目 | 未达标（内核兼容规则不可单方面改） | 替代：`list-sessions` 出口按 `session.cwd` 过滤（1 处，判据明确） |

**渲染面板（S-RP，13 条）**

| 编号 | 一句话 | 未入册理由 | 替代 / 代价 |
| --- | --- | --- | --- |
| S-RP-07 | 思考档位标签三处实现、两套文案（轻量/极简…） | 未达标（**重构 + 冻结字面**：改设置页文案须登记） | 先收敛为单表不改文案，或选定文案后统一（需需求档登记） |
| S-RP-08 | 长列表无虚拟化 + 每次键入全量重算；双侧面板 `v-show` 常驻 | 未达标（重构；ui-shot 时序/几何敏感） | 仅做输入 debounce 或 `content-visibility`（需离屏复核，成本中） |
| S-RP-09 | 相对时间不自刷新 | 未达标（UI 小瑕） | 修法：分钟级 tick（成对清理）；判据：假时钟推进 3 分钟后文案变化 |
| S-RP-10 | 资料库懒展开失败静默（无 loading/错误，`expanded` 已置位） | **达标（§5.5）**；上限 | 最小判据：stub 返回失败 ⇒ 出现中文提示且节点保持折叠；修法 1 处 + catch |
| S-RP-11 | `mdCache` FIFO 淘汰可能淘汰流式块，且跨会话不清理 | 未达标（内部缓存，P2） | 修法 2 行：淘汰跳过流式块 + 会话切换 `clear()` |
| S-RP-12 | 可访问性簇（行不可键盘打开、无 aria-label/live、焦点不转移、overlay 无 Esc） | 未达标（需求面未冻结无障碍要求；①④涉 DOM 结构调整） | 先做 ②③⑤ 纯属性项（零几何风险），①④单独评估焦点断言影响 |
| S-RP-13 | `pickFiles` 无异常捕获；粘贴图片被静默丢弃 | **达标（§5.5，与 S-PDF-12 同组 M7）**；上限 | 最小判据：`selectChatFiles` reject ⇒ 中文提示且无未处理拒绝；修法 try/catch + 上限提示 |
| S-RP-14 | 模型/思考深度选择失败仅 `console.error` | **达标（§5.5）**；上限 | 最小判据：`set-model` reject ⇒ 面板出现中文失败文案；修法：面板内一行错误态 |
| S-RP-15 | SettingsPage 三小缺陷（revealPath 忽略失败 / 删密钥无确认 / `saved` 定时器未托管） | **部分达标（revealPath 忽略失败 = §5.5）**；上限 | 先修 revealPath 检查 `result.success`（1 处）；删密钥确认属需求决策；定时器清理成对补齐 |
| S-RP-16 | `project-store` 三个导出零消费 | **达标（死代码）**；上限（见 M5） | 下轮清理包统一删除（注意保留 `setCurrentSession`/`syncCurrentSession`） |
| S-RP-17 | 会话切换/新建不清草稿、不按会话隔离 | 未达标（**未规定行为，需产品裁决**） | 二选一并登记（①切换清空 ②按会话键控）；注意 ui-shot「追问后草稿保留」断言需复核 |
| S-RP-18 | 多处 `<button>` 缺 `type="button"` | **达标（同文件既有写法不一致=规范）**；上限 | 批量补属性（纯属性、零风险，30 分钟），建议随清理包 |
| S-RP-19 | `v-model` 与 `@update:model-value` 双写草稿 | **达标（重复逻辑=仓库 P2 定义）**；上限 | 删除 `@update:model-value` 与 `updateDraft`（行为等价） |

**PDF 链路（S-PDF，8 条）**

| 编号 | 一句话 | 未入册理由 | 替代 / 代价 |
| --- | --- | --- | --- |
| S-PDF-07 | 加载期对全部页 `getPage`，pdf.js 页缓存无淘汰且从不 `cleanup()` | 未达标（资源常驻，P2；修法需 idle 调度） | 修法：`renderTasks.size === 0` 守卫下调 `cleanup()` 并 catch；判据：翻页后堆内存读数不线性上升 |
| S-PDF-08 | `<slot name="overlay">` 与 `.pdf-overlay` 无消费者（死代码） | **达标（死代码）**；上限 | 删除 slot + 规则并同步 `DEV-R1a-reader.md` 文档；`ui-shot` 无引用（已复核） |
| S-PDF-09 | `defineExpose({ gotoPage })` 与 ReaderPanel 的 `ref="pdfViewer"` 均无消费者 | **达标（死导出/死绑定）**；上限 | 删除两处；既有跳页场景仍绿 |
| S-PDF-10 | 缩放按钮在上下限处无禁用态（点击静默无效） | 未达标（P2 交互反馈） | 修法：`:disabled` 绑定上下限常量；判据：50% 时「缩小」disabled（新增 1 条记录） |
| S-PDF-11 | 目录键规则三处重复实现（徽标/章节过滤依赖） | 未达标（重复实现=重构） | 由 `outline-notes.ts` 导出 `outlineKey` 收敛，键值逐字不变；既有徽标场景回归 |
| S-PDF-12 | 粘贴图不可解码时调用方无法区分「跳过」与「无图」 | **达标（§5.5，与 S-RP-13 同组 M7）**；上限 | 修法：util 返回判别结果（`{ok:true,image}|{ok:false,reason}`），与 F 组同批可省一次分片协调 |
| S-PDF-13 | ReaderPanel 文本加载在途切到 PDF 时旧响应仍写 `content`/`failure` | 未达标（当前不可见的脏状态，P2） | 修法：watcher 内 `textLoadToken += 1`（1 行） |
| S-PDF-14 | quick-ask 反馈态复位不重算几何 ⇒ 浮层与选区错位 | 未达标（视觉小错位） | 修法：抽 `layout()` 在 mode 变化后 `nextTick` 重算（注意 `v-show` 隐藏态 offsetParent） |

**渲染 store/工具（S-RU，13 条）**

| 编号 | 一句话 | 未入册理由 | 替代 / 代价 |
| --- | --- | --- | --- |
| S-RU-04 | `events` 只写不读（5 万条上限），`addEvents`/`getRawEventsJson` 死导出 | **达标（死代码）**；删除需确认是否保留诊断能力 | 二选一：整体删除，或给 `getRawEventsJson` 一个真实入口；`displayBlocks` 是唯一渲染源 |
| S-RU-05 | `errorMessage` 死状态（只写不读） | **达标（死状态）**；上限 | 删除声明与两处写点（失败信息已由 error 块承载） |
| S-RU-07 | useRpc 死面：18 个零消费成员；`agentStatus`/`stderr` 无 UI 消费（内核错误不可见） | **达标（死导出）部分**；上限；错误出口属另一分片 | 先删 18 个零消费成员（check 可证）；错误出口（含 `isStreaming` 复位）单列一轮 |
| S-RU-08 | 导出卫生聚合（函数级死导出 7 个 + 仅内部类型导出 14 项 + store 定型死成员） | **达标（死导出）**；上限（与 M5/M10 同包） | 批量去 `export` 关键字；保留烟测直接 require 的导出（`outline-notes`/`notes-path`/`reading-context` 等） |
| S-RU-09 | markdown `citationKeys`/`imageSources` 通道零调用方（含不可达分支） | **达标（死参数+不可达分支）**；上限 | 删除后 14 例渲染探针输出须逐字节一致；`linkPageJumps` 保留 |
| S-RU-10 | `recoverCorruptNotes` 复制 `applyNotes` 七件套 | 未达标（重复实现=重构） | 改调 `applyNotes(...)`，差分断言两函数产出快照相等 |
| S-RU-11 | 路径比较键 5 份实现（注释与实现不符） | 未达标（**重构**，见 M4） | 以 `notes-path.docPathKey` 为唯一定点；`project-store` 替换后须跑会话切换场景 |
| S-RU-12 | 「当前工作区根」6 处各自派生 | 未达标（重构） | `project-store` 暴露 `libraryRoot` computed，其余改读（需与面板分片协调） |
| S-RU-13 | 重复派生规则两份（同页排序比较器 / 当前文档条数） | 未达标（重构；排序去重会改 `groups` 中间形态） | 计数改流向 `countNotesByDocument`（低风险半条可先做）；排序统一需 ui-shot 32 复核 |
| S-RU-14 | `getMessages()` 声明 `unknown[]`，调用点 `as AgentMessage[]` 掩盖契约 | **达标（禁断言掩盖的规范）**；上限 | 类型收窄为 `AgentMessage[] | null` 并删断言（1 行，check 即判据） |
| S-RU-15 | `Window.pixApi` 声明为必需，与 9 处「可能缺失」防御不一致 | **达标（类型-运行时不一致）**；上限 | 改 `pixApi?: PixApi` 并清理防御分支（收益=暴露遗漏；需一次集中修点） |
| S-RU-16 | `useTheme` 主题双源 + 死分支（`pix-theme` 从不写入）+ `as Theme` 未校验断言 | **达标（死分支+断言）**；上限 | 删 localStorage 分支与 `as Theme`（当前渲染不变），或接线 `settings.theme` 并白名单校验 |
| S-RU-17 | 同文件两套块查找（O(1) 索引 vs 线性扫描，含每 token 热路径） | 未达标（性能/一致性，P2；替换触及流式热路径） | 用 `blockIndexOf` 替换 `find`（等价性探针 + ui-shot 流式场景回归） |

**脚本与文档（S-SD，17 条）**

| 编号 | 一句话 | 未入册理由 | 替代 / 代价 |
| --- | --- | --- | --- |
| S-SD-04 | `SEL` 两项死键（`mapNode`/`staleText`） | **达标（死键）**；上限 | 改用 `SEL.mapNode`/`SEL.staleText` 或删键（静态引用已为 0） |
| S-SD-05 | 单函数 7240 行 + `js`/`waitFor`/`sleep` 重复定义两份 | 未达标（**重构**） | 分两步：先抽模块级驱动工厂，再拆场景文件；每步后全量比对 label 集合 |
| S-SD-06 | 默认 `OUT_ROOT` 写死本机用户名路径 | 未达标（配置默认值；失败响亮） | 改为 `join(tmpdir(), "pix-r5")`（1 行，零风险） |
| S-SD-07 | `window-all-closed → app.exit(0)` 与失败判定构成退出码竞态 | 未达标（潜伏，无判据） | 修法：惰性 handler（3 行）；判据：注入失败 run 必须 `EXIT=1` |
| S-SD-08 | `assertOutRootSafe` 不向 `main()` 返回状态 | 未达标（结构隐患，依赖 `app.exit` 即时性） | 返回 boolean + `main()` 早退（3 行）；判据复用 R11 的 `test ! -e` |
| S-SD-09 | `assert-main-esm.mjs` 产物面断言过窄（不校验入口/`shared/types.js`/非空） | 未达标 | 加 `REQUIRED` 清单逐个 `access` + `files.length > 0` |
| S-SD-10 | 截图产物无字节级判据（0 字节/空白帧同样进清单） | 未达标 | 记 `bytes` + `<1024` push `errors`；负向控制：替换 `toPNG()` 为 0 字节须报红 |
| S-SD-11 | fixture 库不重置为确定状态（`notes.md` 等跨轮保留） | 未达标（潜在不可复现） | `writeFixtures()` 开头重建两个库目录；判据：连续两次 run 名字集合逐字相等 |
| S-SD-12 | 两个烟测头部注释的覆盖面/条数过时 | **达标（文档与实现不符）**；上限 | 头部改为组名清单（view 5 组 / notes 8 组），数字交给运行输出 |
| S-SD-13 | pix 直接依赖 16 处 `^` 范围，与 `AGENTS.md:53`「直接依赖固定版本」冲突 | **达标（规范冲突）**；未入册理由：触依赖字段与 lockfile（PRD §5.8 冻结 + 需负责人批准 + 验证链长） | 一次性收口：改精确版本 + `npm install --package-lock-only --ignore-scripts`；判据：无 `^`/`~`，随后全验证链 |
| S-SD-14 | `build.files` 死配置（`index.html`）与 skills 重复打包 | **达标（死配置）**；未入册理由：打包面改动（`package` 属禁跑项），本轮无法验证 | 删 `index.html` 项 + skills 二选一（保留 `extraResources`）；需一次打包后技能加载核对 |
| S-SD-15 | `tsconfig.preload.json` 两条无效选项（等于默认值） | **达标（配置与注释不符）**；上限 | 删除两行；判据：check 仍 0 且产物逐字节相同 |
| S-SD-16 | README 功能与验证两节滞后（缺 R12/R13/R14；无烟测/离屏入口） | **达标（权威入口失准）**；上限 | 补 3 条功能 + 「验证」小节（四条命令）；零代码风险 |
| S-SD-17 | `REMAINING.md` 自述与实现不符（红笔圈画 / `annotationMode` / 过时文案） | **达标（事实性自相矛盾）**；上限 | 改 3 处使文件内部一致；零风险 |
| S-SD-18 | `docs/pm` 轮次文档读数与行号锚点过时（135/198/46 vs 143/211/51 等） | 未达标（历史文档快照惯性） | 只登记不改：在相关行加「as-of `<commit>`」标注（涉及多份历史档，需负责人定） |
| S-SD-19 | `dev-electron.mjs` 退出码归一化 + 缺 `error` 处理 | 未达标（dev-only，P2） | 加 error/信号处理（5 行）；判据：移除 PATH 后中文错误 + exit 1 |
| S-SD-20 | 验证入口无聚合（无 CI、根 `npm test` 不含 pix、离屏无脚本入口） | **达标（纪律无执行入口）**；上限 | `pix` 加 `verify: check && smoke:notes && smoke:view` + README 一节（零风险） |

---

## 5. 本轮修复文件白名单（24 个，全部在 `pix/` 内，不含 `packages/*`）

| # | 文件 | 关联 F | 备注 |
| --- | --- | --- | --- |
| 1 | `pix/src/main/session-bridge.ts` | F5, F11, F13, F20 | 四处改动，建议同批 |
| 2 | `pix/src/main/settings-store.ts` | F3 | 构造容错 + 形状校验 |
| 3 | `pix/src/main/index.ts` | F3 | `whenReady` 链 `.catch` |
| 4 | `pix/src/main/library-root.ts` | F4 | realpath 缓存；**smoke-notes 编译面内** |
| 5 | `pix/src/main/pdf-tools.ts` | F4, F17 | 去复制实现 + 体积上限/异步读 |
| 6 | `pix/src/main/chat-files.ts` | F17 | 附件上限 + 二进制嗅探 |
| 7 | `pix/src/main/ipc-handlers.ts` | F19, F17 | list/open 守卫；共享上限常量替换 |
| 8 | `pix/src/main/preload.ts` | F14 | `installUpdate` 签名 |
| 9 | `pix/src/main/notes-store.ts` | F9 | 备份顺序改「先复制」 |
| 10 | `pix/src/main/reader-state-store.ts` | F12 | 备份/拒写/missing 语义 |
| 11 | `pix/src/shared/limits.ts`（新增） | F17 | 体积上限常量唯一定点（避免第三份拷贝） |
| 12 | `pix/src/renderer/components/input/InputArea.vue` | F1 | IME 守卫 |
| 13 | `pix/src/renderer/components/workspace/ChatPanel.vue` | F1, F6, F8, F15 | 草稿还原、澄清 watcher、abort catch |
| 14 | `pix/src/renderer/components/workspace/PdfViewer.vue` | F2, F18 | 末页钳制、截图失败反馈 |
| 15 | `pix/src/renderer/components/workspace/NotesPanel.vue` | F9 | `backupPath` 展示 + reveal |
| 16 | `pix/src/renderer/components/settings/McpSettings.vue` | F5 | 只读边界文案 |
| 17 | `pix/src/renderer/stores/reader-state-store.ts` | F7, F12 | `saveEpoch`；消费 `success/code` |
| 18 | `pix/src/renderer/stores/notes-store.ts` | F9, F10 | `backupPath` 透出；catch 守卫 |
| 19 | `pix/src/renderer/composables/useRpc.ts` | F15 | 失败通道统一 |
| 20 | `pix/src/renderer/pages/SettingsPage.vue` | F1, F14, F15, F20 | 安装结果/密钥失败/IME 次要点/模型提示 |
| 21 | `pix/src/renderer/pages/HomePage.vue` | F11 | `opening` 在途守卫 |
| 22 | `pix/src/renderer/pages/WorkspacePage.vue` | F16 | `disposed` 旗标 |
| 23 | `pix/scripts/smoke-notes.mjs` | F4, F9, F12 | 新增断言组 + 编译面白名单同步 |
| 24 | `pix/scripts/ui-shot.mjs` | F2, F14, F16, F18 | 新选择器/场景、stub 同步、慢 IPC 注入 |

说明：
- `pix/src/renderer/types/ipc.ts` 不单独列入——它 `import type { PixApi } from "../../main/preload"`，F14 的签名变更自动生效。
- 若负责人选择不做 F17 的共享常量（改为两处各自定义），可去掉第 11 项；若 F5 采用「开放 MCP 工具」，白名单与冻结面须整条重估（不属默认路径）。
- 需求档登记（F18 的交互语义变更、F1 的次要位置文案）不在上表，由轮次需求档（R15-req）另行承接。

---

## 6. 验证方案（修复后必须复跑）

### 6.1 命令序列（按序执行，任一失败即停）

```bash
cd pix
npm run check                       # vue-tsc + tsc(main) + tsc(preload)，必须 0 error
node scripts/smoke-notes.mjs        # 通过 >=51 / 失败 0（F4/F9/F12 新增组后总数上升）
node scripts/smoke-view.mjs         # 通过 >=35 / 失败 0
PIX_SHOT_ROOT=<专用目录，非仓库内、非他人目录> PATH="/c/Program Files/nodejs:$PATH" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs    # 不得与其它取证并发（端口 5199）
```

### 6.2 离屏「零缺失」复跑口径（本轮为 ⊇ 基线，不是相等）

1. `MANIFEST.failure === null`；`99-failure-state.png` 不存在；退出码 0。
2. `MANIFEST.shots[].name` 集合必须是**上一轮基线的超集**：基线 143 个成功帧全部存在 + 本轮新增（F2/F18 等）为 Δ 增量；缺失数必须为 0。
3. `MEASUREMENTS` 的 label 集合 ⊇ 基线 51 种 / 211 条 + 新增；新增条目逐条复核。
4. 已知 flake：若在 `r11-3` 相位 4「摘录浮层」超时（既有环境性时序，与本次改动无因果；S-SD-02 未入册），按 R14 先例重跑一次并在 dev 档写明；不得把超时当通过。
5. 产物自净：跑完 `git status --short` 无新增残留，`shots`/临时目录只落在 `PIX_SHOT_ROOT` 内。

### 6.3 冻结面清单（修复不得改写）

| 类 | 冻结内容 | 依据 |
| --- | --- | --- |
| ui-shot 既有断言 | 场景 43 steer 驱动（`isComposing` 默认 false）；45/45B/45C 的 `userBlocksRolledBack` 与 `stub 发送注入异常`；追问后草稿保留；`第 3 / 3 页`（100% 缩放）；r11-3 连点放大；62-5 导出提示 `已导出 4 条 → .pix-read/notes.md`；结束自检与退出码语义 | `ui-shot.mjs:2435,4032,4038-4039,3504-3517,1794,1925,1980,2031,6942,5870-5889,8910-8929` |
| 烟测断言 | `smoke-notes` 51 条（undo-*/report-*/notes-stat 7/export-and-empty/outside 用例）；`smoke-view` 35 条（`badge-counts #4` 比较键归一） | 两份脚本的 `required/allowed` 编译面白名单与断言正文 |
| 冻结类名/选择器 | `.pdf-page` / `.textLayer` / `.pdf-scroll` / `.pdf-error` / `.capture-layer` / `.pdf-capture-fab` / `.input-area` / `.composer-send` / `.error-block` / `.clarification-card` / `.question-progress` / `.note-row` / `.notes-stale` / `.empty-hint` | 各轮设计档与 ui-shot SEL |
| 冻结文案 | `第 N / M 页`、缩放 `%`、笔记 4 条中文错误码文案、`已导出 N 条 → .pix-read/notes.md`、`stub 发送注入异常` | 各轮 review 冻结行 |
| 协议/契约 | `notes.json` / `reader-state.json` 的形状与字节可复现；`ReaderNotesErrorCode` 码表；IPC 36 通道 + 6 事件；`PixApi` 42 方法（F14 仅改签名，名称/顺序不变，且必须同步 ui-shot stub） | 分片报告已核对项 |
| 工程规范 | `AGENTS.md`（不提交产物、依赖固定、禁 any、禁内联导入）；PRD §5.8 依赖字段零改动 | 仓库规范 |

### 6.4 无法自动化的判据（本轮以探针/人工承接）

| F | 判据方式 |
| --- | --- |
| F1 | 键盘事件派发（可入 ui-shot 或人工走查） |
| F4 | `%TEMP%` 目录联接探针（沿用 S-MS-02 探针）+ 两个烟测 |
| F7 | 探针 1-d 转绿（报告已给出探针脚本与失败输出） |
| F11 | 并发脚本（主进程侧）+ 手工双击「最近打开」验收 |
| F13 | 主进程事件断言（可探针）；离屏需 stub 注入事件 |
| F15 | 探针 3-a 转绿 + 正常路径不抛 |
| F17 | 300 MB/50 MB 夹具 + rss 读数 |
| F20 | 探针：`["no-such-model"]` ⇒ 有告警且列表不变 |

---

## 7. 风险与依赖

### 7.1 批次建议（同文件/同冻结面合并，减少基线重跑次数）

| 批次 | 内容 | 理由 |
| --- | --- | --- |
| B1 主进程数据安全 | F3 → F4 → F9 → F12 → F13 → F20（`session-bridge` 的 F5/F11 放 B4） | F3 最先做（解锁「改坏也能重启」的安全网）；F4 与 F17 的 pdf-tools 改动互相独立但同文件 |
| B2 渲染会话/输入 | F1 → F6 → F8 → F15 → F16 | 集中于 `InputArea`/`ChatPanel`/`SettingsPage`/`WorkspacePage` 生命周期 |
| B3 PDF 展示 | F2 → F18 | 同文件 `PdfViewer.vue`；共享 ui-shot 新增场景与选择器 |
| B4 守卫与契约 | F5 → F11 → F14 → F19 + ui-shot stub 同步 | F14 必须与 ui-shot stub 同批；F5 文案与 F2/F18 的基线更新合并一次 |

### 7.2 顺序依赖与相互影响

1. **F14 → ui-shot stub（硬依赖）**：`ui-shot.mjs:1147` 的 `installUpdate: function () {}` 返回 `undefined`，渲染层改读 `r.success` 后离屏会直接 TypeError；必须同批改为返回 `{success:true}`，否则零缺失复跑必红。
2. **F11 ↔ F16**：同属生命周期/并发，桥层串行门与页面 disposed 旗标互不依赖，但建议同批后做一次「双击最近打开 + 快速返回首页」的手工并发验收。
3. **F12 ↔ F7**：渲染侧 `reader-state-store.ts` 同时被两条修复改动（token 与 success 消费），建议一次提交；F12 还要改 `smoke-notes.mjs` 编译面白名单，F7 的探针断言可并入同一新组。
4. **F9 ↔ F10**：渲染 `notes-store.ts` 同文件；F9 的主进程顺序改动必须保持 smoke-notes 既有备份断言全绿（copy 实现满足 `backups.length === 1`），与 F10 的一行守卫一起复核。
5. **F1 ↔ F6**：F6 让失败后 `.input-area` 非空，可能影响「发送后清空」类观测；已核对 45/45B/45C 每轮先 `setDraft` 覆写，仍需实跑确认；F1 的 IME 守卫与场景 43 驱动兼容（`isComposing` 默认 false）。
6. **F2 ↔ F18 ↔ F6 ↔ F14（ui-shot 基线）**：四条都要动 `ui-shot.mjs`（新选择器/场景/stub），建议一次性改完再跑全量，避免多次基线更替。
7. **F17 ↔ F4**：同在 `pdf-tools.ts`；先做 F4（守卫正确性）再做 F17（体积与异步读），顺序颠倒会让守卫复检建立在待改实现上。
8. **F5 ↔ F12 ↔ F19（冻结面邻接）**：三者都要求「不重写既有断言」；F19 若触动 library stub 计数口，与 F5/F2/F18 的基线更新合并记录。
9. **F20 的边界**：只做「0 命中不静默放宽」，与内核 `resolveModelScope` 的完全对齐（跨仓导出/依赖策略）明确不在本轮，避免被误读为已完成对齐。
10. **F13 的离屏取证**：默认不新增 stub 注入；若负责人要求离屏覆盖，需在 ui-shot stub 增加一次 `eye_model_end` 注入（属新增记录，不破冻结面）。

### 7.3 本轮明确不引入

- 不做重构/架构调整（M4/M9/M10 的合并类改动全部进 D）；不新增功能（F5 默认路径为文案与注释；开放 MCP 工具须单独立项）；不改依赖字段与 lockfile（S-SD-13 进 D）。
- 修复清单 20 条 ≤ 20 条上限；P0 ×5 全入；所有入册项均为缺陷修复，且每条给出了可复跑的判据。

---

## 8. 附：本轮修复清单速查（20 条）

| # | 来源 | 一句话 | 面 | 等级 | 工作量 |
| --- | --- | --- | --- | --- | --- |
| F1 | S-RP-01 | 回车发送加 IME 组合态守卫 | RP | P0 | 小 |
| F2 | S-PDF-01 | 触底钳制修复末页页码跟踪 | PDF | P0 | 小 |
| F3 | S-MS-01 | 设置文件损坏可自愈，应用不再变砖 | MS | P0 | 小 |
| F4 | S-MS-02 | 库根 realpath 缓存，联接/符号链接可用 | MS | P0 | 中 |
| F5 | S1-01 | 消除「MCP 工具有效」的误导展示（只读边界明示） | S1 | P0 | 小 |
| F6 | S-RP-02 | 发送失败还原用户正文 | RP | P1 | 小 |
| F7 | S-RU-01 | 提交令牌拦截迟到 save 回灌 | RU | P1 | 小 |
| F8 | S-RP-03 | 澄清请求替换时复位问题索引 | RP | P1 | 小 |
| F9 | S-MS-03 | 笔记逃生口先备份后写入，路径透出 | MS | P1 | 中 |
| F10 | S-RU-02 | loadNotes catch 补 writeSeq 守卫 | RU | P1 | 小 |
| F11 | S1-02 + S-RP-20 | 会话生命周期串行化 + 入口重入守卫 | S1/RP | P1 | 中 |
| F12 | S-MS-04 + S-RU-06 | reader-state 降级备份/拒写 + 渲染侧日志 | MS/RU | P1 | 中 |
| F13 | S1-03 | takeHerEyes 失败路径发可见事件 | S1 | P1 | 小 |
| F14 | S1-08 | installUpdate 契约改为可感知结果 | S1 | P1 | 小 |
| F15 | S-RU-03 | auth/配置命令失败不再静默 | RU | P1 | 中 |
| F16 | S-RP-06 | 工作区卸载竞态与订阅泄漏修复 | RP | P1 | 小 |
| F17 | S1-04 + S1-05 | pdf/附件体积上限与异步读 | S1 | P1 | 中 |
| F18 | S-PDF-04 | 框选失败保留模式并提示 | PDF | P1 | 中 |
| F19 | S1-06 | library list/open 补根校验 | S1 | P1 | 小 |
| F20 | S1-07 | enabledModels 0 命中不再静默放宽 | S1 | P1 | 小 |
