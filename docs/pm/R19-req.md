# PiX-Read R19 需求档 · 规模与性能（N104–N109）

> 上游：`docs/pm/PRD-V0.6.md` §2（R19 = 规模与性能：大文档（≥300 页）与大量笔记（≥500 条）下的打开、翻页、搜索、面板与报告的实测与修复；依赖 R13、R16）、§4 反需求 5（**不引入新运行时依赖（含 d3 / markmap / fuse / 虚拟滚动库）**；不改 `packages/*`；不改 electron-builder 配置）、§4 反需求 7（不做向后兼容层、**不写未被调用的死代码**、不为「看起来高级」加动画）、§5 工程红线 1（动工前基线离屏取证、收工后验收取证；`MANIFEST.json.failure === null`、退出码 0、既有场景与断言零缺失；基线与验收目录按 `pix-v06-r<N>-*` 命名）、§5 红线 2（新增/变更的 UI 与交互必须有离屏场景与断言；冻结字面的有意变更必须在本轮需求档显式登记）、§5 红线 3（**性能类判据必须给出可复跑的测量方式与阈值**（探针脚本写 `%TEMP%` 或固化为仓库内脚本），不得只给「感觉更快」）、§7 判据 4（**规模不塌**：300 页文档与 500 条笔记下，打开、翻页、搜索、面板渲染与报告导出有实测数据且不出现 >1s 的无反馈卡顿（阈值与测量方式在 R19 需求档冻结））。
> 依赖（既有机制，本轮只读不改）：`docs/pm/R9-req.md` §0（知识地图的 one-pass + memo 派生范式）、`docs/pm/R10-req.md` §0（笔记面板的视图管道：`groupNotesByDocument` → `applyViewToGroups`，搜索/排序的唯一实现点）、`docs/pm/R13-req.md` §0（报告导出：主进程 `renderDocumentReport` 的分组、排序三键与逐字格式）、`docs/pm/R14-req.md` §0（树徽标的 `countNotesByDocument` 单遍 + memo；`ui-shot.mjs` 的「既有场景零改写」硬约束与冻结字面登记范式）、`docs/pm/R15-audit-scripts-docs.md` §2（**S-SD-02**：`selectPageSpan` 的裸 20s 等待是已知 flake 点；处置处方 = 复用同文件 `ensureQuickAskExcerptReady` 的「有界静默 + 复核 + 有界重取」范式）、`docs/pm/R18-req.md` §0（抽查口径、冻结字面登记范式、离屏脚本的启动守卫 / 产物自净 / 结束自检契约）。
> 本轮唯一主线（负责人已冻结，不得扩张）：**把「大文档（≥300 页）与大量笔记（≥500 条）」下的七条关键路径变成可复跑、有阈值、有护栏的事实，只修实测暴露的热点；同时把验证面的已知 flake（S-SD-02 家族）做工程化修复**。
> 范围约束：不做虚拟滚动库、不做 Web Worker 迁移、不做磁盘缓存层、不做重构、不改 `packages/*`、不引入依赖、不改 electron-builder、不改 `pix/package.json`、不改产品 UI 文案 / 类名 / 结构（除条件性白名单内的实测热点且不得触碰字面）、不做「看起来更快」的无判据优化、不跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`。
> 需求编号 **N104–N109**，共 **27** 个子条（N104 5 / N105 7 / N106 3 / N107 4 / N108 4 / N109 4）。

---

## 0. 定稿修订（R19）

> 依据：`docs/pm/R19-review.md` §2 的 **MF-01…MF-13**（13 条 must-fix）。
> 本步口径：只读文件 + 只读 git 命令 + `cd pix && npm run check`；**未跑离屏**（`r19-1` 场景尚不存在）、**未跑 `perf-probe`**（脚本尚不存在）、未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`。下表「实读证据」列的行号与计数均为本步重新核对：结论只来自真实文件内容与真实命令输出，未核实的一律不写。

**处置汇总：must-fix 13 条全部处理（13 / 13），拒绝 0 条；另附一致性改动 7 条（评审 §3 观察项与 §1 附带项，见本节末）。**

| # | 评审问题（摘要） | 处置（本档落点） | 实读证据（本步核对） |
| --- | --- | --- | --- |
| MF-01 | ④ `notes.firstscreen.ms` 的终点在「点标签」之前即成立 | ④ 改为「工作区重新挂载 → 520 行首次入 DOM」：复位 = `goHome()` + 点项目卡片；起点 = 项目卡片 `click()`；终点 = `.note-row` 520 + `.notes-group-head` 41；防空 `data.rowsBefore === 0` 写成**硬断言**（§0.4 起点/终点行 ④、§0.4 窗口状态纪律、N105-4、§0.5 #10） | `WorkspacePage.vue:104`（工作区挂载即 `await notesStore.loadNotes()`）、`:312` / `:319`（两个面板 `v-show` 常挂载）、`NotesPanel.vue:759`（`v-if="status === 'loading'"`）与 `:763` / `:782` / `:787` / `:803` 构成互斥链（列表只在 `ready` 分支渲染）、`:804` / `:815`（组 / 行 `v-for`） |
| MF-02 | ⑦ `tree.badge.ms` 起点是 no-op、终点已存在 | ⑦ 复位/起点改为同一条「重新挂载」路径（`leftTab` 默认 `library` ⇒ 树在屏）；终点追加「该行 `getBoundingClientRect().height > 0`」；防空 `data.rowsBefore === 0`（§0.4 ⑦ 行、N105-7） | `WorkspacePage.vue:41`（`leftTab` 默认 `"library"`）、`:213-215`（`selectLeftTab` 对同标签直接 `return`）、`LibraryPanel.vue:36`（`rows`）/ `:49`（`noteCountMap`）/ `:51-57`（`rowsWithBadge`）/ `:164-171`（`v-for` + `.tree-row`）/ `:178-179`（`480 条` + `title` 文案） |
| MF-03 | ① 复位态与起点互斥、`openRow` 同文档不重载 | ① 复位冻结为「无打开文档」（`goHome()` + 点项目卡片）；N105-1 判据 3 改为「三次采样 = 三次重新挂载 + `openRow`」并加点击前读数（`.page-label` = null、`.pdf-page` = 0）（§0.4 窗口状态纪律、N105-1） | `WorkspacePage.vue:207-211`（`openDocumentFromLibrary` 对同 `docPathKey` 早退 ⇒ 文档已打开时点树行不产生加载） |
| MF-04 | ③ 冷/暖口径可被静默混淆 | 冷 = 「打开浮层前 `.pdf-search-panel` 不在 DOM」写成**读数证据**；暖 = 「清空 → 重输同一词」，禁止同值重写（§0.4 ③ 行、N105-3） | `PdfViewer.vue:1084`（`title` 逐字 `在文档中搜索` 的 `openSearch` 入口）、`:1087-1093`（`v-if="searchOpen && readerStore.pageCount > 0"` ⇒ 面板随浮层创建/销毁）；`PdfSearchPanel.vue:85`（`textCache` = setup 作用域 `new Map`）、`:330`（`resetAll` 清缓存）、`:340-347`（随 `filePath` / `pdfDocument` 清）、`:58` + `:348`（`query` 是 ref，同值不触发 `watch(query)`） |
| MF-05 | N108-2 注入存在竞态与覆盖空洞 | 注入顺序冻结为「先 `installStageScrollWatch()` + 基线快照，再挂注入定时器，最后调守卫」；断言改为「注入执行恰好一次 + 实测 `scrollTopDelta === 160` + 与基线快照的计数差 ≥ 1」；分支覆盖登记为**只确定性覆盖**「首轮静默窗口吸收」（§0.8、N108-2、§0.10） | `ui-shot.mjs:5708-5722`（安装，幂等且跨相位累积）、`:5724-5732`（探针）、`:5734-5758`（`from` 快照与 `absorbed = seen - from` 只在**该次调用内**成立）、`:5615`（既有守卫内调用） |
| MF-06 | §0.8 尝试预算自相矛盾（3 × (6s + 4s) = 30s > 20s） | 冻结优先级：**全局 deadline 20000ms 自首次尝试前起算，先到即以已有轨迹抛错**；每轮静默 ≤ 6000ms / 就绪 ≤ 4000ms 均受全局 deadline 约束（§0.8「尝试次数与总预算」「失败语义」两行） | `ui-shot.mjs:5734-5758`（既有默认 `quietMs = 400` / `timeoutMs = 6000`；`sleep(60)` 轮询） |
| MF-07 | label 配额自相矛盾（+1 vs 两条不同 label） | 冻结：**两条 record 共用 label `r19-selection-guard`**，相位落在 `data.phase`；配额保持 74 → 75；改掉 N108-2 判据 1 的措辞（§0.2#7 / §0.9 / N109-1 判据 2 原文不动） | `ui-shot.mjs:1678-1679`（`record(label, data, failures)` ⇒ `measurements.push({ label, data })`）；`:12436`（`MEASUREMENTS.json` 即该数组）⇒ label 去重数只随 label 字符串种类增长 |
| MF-08 | N104-3 抽取机械判据算不出来 | 三条判据重写：差异行**逐行归类**（取消「≤ 6 行」）；`${` 计数**仍为 1**；模板纪律判据改为**两文件计数之和 = 31** 并删除「应为 0」（§0.7「抽取的机械判据」、N104-3 判据 1 / 2 / 3） | `grep -c "listSessions\|readerStateSave\|switchSessionCalls\|setSessions\|readerStateSaveCalls" pix/scripts/ui-shot.mjs` = **31**（模板区 `:438-1320` 内 10 行：`:505` / `:506` / `:507` / `:931` / `:932` / `:1187` / `:1292` / `:1310` / `:1312` / `:1317`；模板外 21 行）；`sed -n '438,1320p' | grep -c '\${'` = **1**（唯一插值点 `:459`）；`buildStub` 体 = `:438-1320`（收口 `}` 在 `:1320`） |
| MF-09 | N104-2 判据 3 的证据归因错误 | 删除「由主进程 `isReaderNote` 证明」的断言，改为**证据边界登记 + 走查字段对照表**：离屏只证「stub 读侧接受」与渲染层规模不变量（N104-2 判据 3） | `ui-shot.mjs:523-524`（注释逐字「解析失败/缺文件按空数组降级（stub 专用；主进程同情形判 corrupt，差异见开发档）」）、`:525-534`（stub `readNotesFile` 自带宽松解析）；`pix/src/main/notes-store.ts:137`（`isReaderNote`）/ `:158`（`parseNotesFile`）/ `:180`（`readNotesFile`）在离屏运行中不执行 |
| MF-10 | 「单文件 ≤ 80 行」与冻结改动冲突 | ≤ 80 行限定为 **§8.2 条件性白名单内的产品文件**；`pix/scripts/*.mjs` 单列允许清单并逐块登记行数（§7.4、N107-2 判据 1、§8.1 行 4 / 5） | 实读搬移块：`ui-shot.mjs:137-139`（3 行）+ `:149-227`（79 行）+ `:438-1320`（883 行）= **965 行**搬出 |
| MF-11 | `search.cold.ms` 阈值理由不成立 | 删除「结构性下界 ≈ 9.6s / 20s = 2× 下界」推理，重述为**灾难性回退护栏**（回归检测由 `search.warm.ms` 承担）；dev 档登记实测值与解释力（§0.0#5、§0.5 #7 / #8、§9 R2、§10 开放问题 4） | `PdfSearchPanel.vue:126-130`：`window.requestIdleCallback(() => resolve(), { timeout: 32 })` —— `timeout` 是**上限**（超时才强制执行），不是每页 32ms 的强制让出 |
| MF-12 | N107-1「热点必修」在白名单上无出口 | 采用「**阻塞 + 上报**」口径：热点落在 §8.2 未授权文件（含 `PdfSearchPanel.vue` / `LibraryPanel.vue`）⇒ 登记为阻塞、上报负责人、不得自行扩权（N107-1 判据 4、§8.2 尾注） | §8.2 的 8 项不含 `PdfSearchPanel.vue` / `LibraryPanel.vue`；§8「不改（登记为不动）」清单含这两者；N107-4 末段已把 `PdfSearchPanel.runSearch` 与 `LibraryPanel.rowsWithBadge` 登记为「非候选」 |
| MF-13 | ④ 键入指标不可判别（`fixtur` 6 键全命中 520 条） | 查询词改为逐键收窄的 `Conclusion 13`（13 键）；新增防空断言「至少一键使计数变化 + 末键计数 < 首键计数 + 逐键读数原样登记」（§0.4 ④ 行、N105-4、§0.5 #11） | `notes-view.ts:37-41`（`matchesSearch` 只匹配 `text` / `comment`，`toLowerCase` 后 `includes`）；§0.3 夹具正文每条都含 `scale fixture` ⇒ `fixtur` 的 6 个前缀全命中 520 条 |

**一致性改动（非 must-fix，评审 §1 / §3 的附带项，逐条登记）**

1. §0.3「规模不变量」行写死 `fixture.docs` 语义 = 树内**文件行数 41**（= `big-book.pdf` + 40 篇小文档），消除与「小文档 40 篇」的歧义（评审 §3 观察 1）。
2. §0.4 ⑤ 行与 §0.5 #14：`map.scroll.ms` 明示为**节流代理量**（30 步 ≈ 30 个心跳的常数级），判别力落在 `map.scroll.stall.max.ms`（评审 §3 观察 3 / §1.1）。
3. §0.8「修法」行：`waitStageScrollQuiet()` 的超时语义改写**显式登记为新语义**（既有 docstring 为「超时 ⇒ 判红」，守卫内改为「只作证据、硬失败由 3 次尝试兜住」）（评审 §1.5 硬伤 3 / §3 观察 5）。
4. N105-1 判据 1：登记 ① 只有绝对阈值、无相对伴随判据的**检出盲区**（评审 §1.2）。
5. N109-3 判据 1：预置归因预案——每个 `selectPageSpan` 调用新增 ≥ ≈420ms（静默窗口最短路径 ≈ 7 × 60ms + `quietMs = 400`）⇒ 21 处调用点合计 ≥ ≈8.8s（评审 §1.5「附带代价」）。
6. §8.2 行 11（`PdfViewer.vue`）：删掉「按需渲染的**既有形态内**调整（… 逐字不变）」的自相矛盾措辞（评审 §1.6）。
7. N108-3 判据 3：把「4 处显式静默调用点」更正为「4 处显式 `selectPageSpan` 调用点（前置静默调用在其上一行）」（评审 §0 基线表）。

> 设计定稿后的进一步最小同步（依据设计评审 `docs/pm/R19-review.md` §2 的 MF-D1…MF-D10）见文末「## 0. 定稿修订（R19-定稿）」。

---

## 0. 冻结契约（设计档、开发档、评审档均不得改写）

### 0.0 本档五项定稿判断（登记；评审可复核，负责人可裁决改判）

1. **性能探针独立成脚本（`pix/scripts/perf-probe.mjs`），不并入 `ui-shot.mjs`。** 理由：① `ui-shot.mjs` 的契约是「截图 + 几何测量 + 首败即停」，单轮 3–5 分钟（186 张）；把 300 页夹具与长耗时采样压进去会同时抬高单轮时长（违反 N109 的 +10% 红线）与「一次环境抖动牺牲整轮」的暴露面；② 性能判据需要**独立退出码语义**（默认只报告 / 断言开关）与机器可读输出，而离屏脚本的失败语义被冻结为「`MANIFEST.json.failure` 单字符串 + 首败即停」（D-SD-01），两者无法共存；③ 大夹具（304 页 PDF + 520 条笔记）不得进入既有 186 张截图的夹具（会改变既有场景读数与时长）。代价：窗口/服务器引导有第二份实现，登记为可接受（引导参数逐字相同：1600×1000、`offscreen: true`、stub preload、`backgroundThrottling: false`、`disable-gpu`、`useContentSize: true`）。
2. **计时在渲染进程内用 `performance.now()`，以 `setTimeout(…, 16)` 轮询判定，心跳用 `setInterval(…, 16)` 的相邻 tick 间隔；不用 `requestAnimationFrame` 作为计时基准。** 理由（实读事实）：离屏窗口「只在 DOM 变更时出帧」（`ui-shot.mjs:22` 头部契约、`repaint()` 的 `invalidate()` + 等一拍），rAF 的推进依赖出帧驱动 ⇒ 把 rAF 当计时器会把「没有帧」记成「耗时」。跨进程 `executeJavaScript` 的往返抖动同样排除在计时窗口之外（一次测量 = 一次 `executeJavaScript`，内部自计）。
3. **「报告导出（500 条）」的判据落在主进程数据面烟测（`smoke-notes.mjs`），不落离屏。** 理由：报告字符串由主进程 `renderDocumentReport`（`pix/src/main/notes-store.ts:347`）生成；离屏 harness 没有真实主进程（`ui-shot.mjs` 用 stub preload），在 stub 上量的是**镜像实现**（`ui-shot.mjs` 内的 `renderDocumentReport` 逐字镜像），不是被测对象。`smoke-notes.mjs` 已具备真实模块的编译面、加载面与真实 fs 驱动（既有 10 组 71 条）。代价（登记）：⑥ 的时间轴不含 IPC 往返与提示渲染，只覆盖数据面（分组 + 字符串拼接 + 原子写）。
4. **共享模块只抽「生成引擎」与「stub 构建器」，夹具声明表留在消费者文件内。** 抽取 `escapePdfText` / `buildPdf`（PDF 生成引擎）与 `buildStub(config)`（假 pixApi 构建器）到 `pix/scripts/lib/`；304 页 PDF 的页/大纲声明表、520 条笔记与 41 篇小文档的声明表留在 `perf-probe.mjs`（唯一消费者）——避免制造「无人调用」的共享死代码（PRD §4.7）。
5. **阈值类型按「是否有产品绝对承诺」分配，且每条只择一。** 取**绝对阈值**的六条：`open.bigdoc.ms`（打开 304 页首屏可交互，PRD §7.4 的「规模不塌」）、`paging.stall.max.ms` / `search.scan.stall.max.ms` / `map.scroll.stall.max.ms`（PRD §7.4 明文「不出现 >1s 的无反馈卡顿」）、`search.cold.ms`（300 页冷扫描的灾难性回退护栏，与其解释力边界见 §0.5 #7）、`report.export500.ms`（纯数据面线性拼接，两个数量级余量）。其余十一条取**相对基线**（同一台机器、同一次会话内采出的基线，容差见 §0.5）——机器速度强相关的路径用固定毫秒数只能二选一：要么宽到发现不了真实回退，要么窄到在忙机器上误报。

### 0.1 本轮不得改写的既有冻结项

| 来源 | 冻结内容 | 本轮为什么不得动 |
| --- | --- | --- |
| R14 / R16 / R17 / R18 | **`ui-shot.mjs` 的既有面**：`SEL` 既有 **74** 项（`:47-131`）逐字不动；既有场景函数体、既有截图名与像素内容、既有 `label` 与 `record` 数据字段零改写；启动守卫 `assertOutRootSafe()`（`:12342-12359`）与产物自净（只删 `<OUT_ROOT>/shots`）、结束自检（`:12439-12458`：截图集合与清单双向相等 + 目录无白名单外条目）；`record` 的「先落测量再抛错」语义（`:1678-1681`） | 本轮的取证口径与零缺失判据全部建立在既有 186 张 / 264 条 / 74 种 label 上；唯一允许的既有行改动 = §0.8 的守卫实现行位移（逐字登记） |
| R14 / R18 | **`smoke-notes.mjs` 既有 10 组 71 条**（`runUndoRoundtrip` `:178` / `runUndoFailures` `:261` / `runUndoSlotLifecycle` `:415` / `runExportAndEmpty` `:564` / `runReportRender` `:616` / `runReportFiles` `:741` / `runReportFailures` `:847` / `runNotesStat` `:978` / `runLibraryRootContainment` `:1111` / `runReaderStateStore` `:1226`）与 `smoke-view.mjs` 既有 9 组 74 条 | 本轮只**追加**一个组（`perf-report-export`，3 条）；既有断言、`files` / `required` / `allowed` / 编译选项 / 自清理协议零改动 |
| R13 | **报告格式**：`renderDocumentReport` 的标题行、meta 行的字段顺序与逐字文案（`> 由 PiX-Read 生成，每次导出都会覆盖。资料库：…；文档：…；生成时间：…；阅读进度：…；共 N 条（摘录 X · AI 结论 Y）。`）、章节分组的排序三键（`page` → `createdAt` → `id`）、`## 章节（N 条）` 与 `### 第 N 页` 的层级、`---` 分隔、尾换行 | ⑥ 的判据是**同一份逐字格式在 480 条规模下的正确性与耗时**；格式一变，既有 R13 三条 label 的判据面即失效 |
| R10 / R14 / R16 | **笔记数据面与派生**：`notes.json` 的格式与写入协议（`version: 1`、条目字段白名单 `isReaderNote` `:137-155`、id 唯一性 `:176`、`MAX_NOTE_TEXT_LENGTH = 4000` `:39`）、原子写、`.pix-read/notes.md` 与 `reports/**` 的路径规则；`countNotesByDocument`（`notes-path.ts:73`）/ `countNotesByPage`（`:93`）/ `groupNotesByDocument`（`:109`）的语义与 `countNotesByChapter` 的前缀和口径（`outline-notes.ts:86`） | ④⑤⑦ 的规模不变量（行数 / 徽标 / 分组）必须在既有语义下成立；修复只能改变**计算方式**（memo / 索引化），不得改变**结果** |
| R6 / R18 | **`reader-state.json` 与现场记录**：格式、四键语义、R18 的两键（`lastSessionPath` / `lastSessionAt`）与成对不变量、主进程唯一写者与原子写协议 | 大夹具下打开 304 页文档会走落点写盘路径（`noteLanding`）⇒ 现场写入的既有语义必须逐字不变 |
| 全局 | 既有类名与文案（`.notes-*` / `.pdf-*` / `.map-*` / `.pill-*` / `.reader-*` / `.tree-row` / `.row-notes` / `.map-row` / `.note-row` / `.note-count-badge`）、`--pix-*` 变量表（不新增变量）、`pix/src/main/{ipc-handlers,preload}.ts`、`pix/package.json`、`package-lock.json`、`pix/build/**`、`packages/**`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/resources/**`、`README.md`、`.gitignore` | 本轮零新 IPC、零新依赖、零新增 npm script；取证断言建立在既有字面与既有几何上 |

### 0.2 本轮新增冻结项（设计档、开发档、评审档均不得改写）

| # | 项 | 冻结内容 |
| --- | --- | --- |
| 1 | 脚本与共享模块（N104） | `pix/scripts/perf-probe.mjs`（新建，唯一性能探针入口）、`pix/scripts/lib/pdf-fixture.mjs`（新建，PDF 生成引擎）、`pix/scripts/lib/stub-preload.mjs`（新建，`buildStub(config)`）；`ui-shot.mjs` 改为从两个共享模块导入（§0.7 的差异白名单） |
| 2 | 大夹具（N104） | §0.3 全表：`big-book.pdf`（**304 页 / 330 个大纲节点**）、`notes.json`（**520 条**：480 条大文档 + 40 条小文档）、小文档 **40 篇**（`doc-01.pdf`…`doc-40.pdf`）；全部写 `%TEMP%`，运行结束自清理 |
| 3 | 指标名与阈值（N105 / N106） | §0.5 全表：**27 条**（时序 17：绝对 6 / 相对 11；规模不变量 10）。按证据型拆分：【性能】（perf-probe）= **24 条**（时序 16：绝对 5 / 相对 11；恒等 8），【烟测-主进程】= **3 条**（时序 1：`report.export500.ms` 绝对；恒等 2：`report.head` / `report.chapters`）；指标名逐字冻结（`open.bigdoc.ms` 等） |
| 4 | 输出与退出码（N105 / N106） | §0.6 全表：stdout 单行 JSON（键名逐字冻结）+ `[perf] metric …` 行；退出码 **0 / 1 / 2** 三态语义 |
| 5 | 命令（N104） | §0.7 的 4 条命令逐字冻结（`--save-baseline` / `--baseline … --assert`）；`pix/package.json` 零 diff |
| 6 | 守卫契约（N108） | §0.8 全表：`selectPageSpan` 的「静默前置 + 有界重试 + 不变弱的就绪谓词 + 失败不降级」；新增场景 `r19-1`（组 `r19-selection-guard`，2 条 record，1 张截图）与 `SEL` 新增 1 项 |
| 7 | 配额与回归（N109） | §0.9 全表：离屏 **+1 截图（186 → 187）/ +2 record（264 → 266）/ +1 label（74 → 75）**；烟测-主进程 **+3 条（71 → 74）**；烟测-渲染零改动（9 组 74 条）；既有面零缺失；ui-shot 单轮时长增量 ≤ **10%** |

### 0.3 大夹具（逐字冻结，N104）

| 项 | 逐字值 |
| --- | --- |
| 根目录 | `PIX_PERF_ROOT`（环境变量，可选）；默认 `join(tmpdir(), "pix-v06-r19-perf")`。启动时先 `rmSync(root, { recursive: true, force: true })` 再重建，结束（含异常路径）`rmSync` 删除 |
| 安全守卫 | 与 `ui-shot.assertOutRootSafe()` 同款：必须**严格位于 `os.tmpdir()` 之下**、与 `pix/` 互不包含，否则拒绝启动（退出码 2）；`--baseline` / `--save-baseline` 的目标路径必须**在仓库外**，否则退出码 2 |
| `big-book.pdf` | **304 页**；每页两行文本（复用 `buildPdf`）：`Big Book Page {N}`（size 16，N = 1..304）与 `Chapter {KK} body text for the scale fixture.`（size 12，KK = `ceil(N / 10)`，即第 N 页属于第 KK 章）；页 k 的 KK = `ceil(k/10)` ⇒ 章 1..30 覆盖页 1..300，第 301–304 页**无章**（边界页：无章节徽标、无笔记） |
| `big-book.pdf` 大纲 | 30 个顶层 `Chapter {KK}`（KK 两位补零，`01`..`30`），每个 10 个叶子 `Section {KK}.{jj}`（jj = `01`..`10`）；`Chapter KK.page = Section KK.jj.page = 1 + 10 * (KK - 1)`（与 `ui-shot.mjs:332-351` 的 `LONG_BOOK_OUTLINE` 同风格，页号 = 该章首页）⇒ 节点数 = 30 + 300 = **330**（≥300）；默认展开态（`collectExpandable` 只展开顶层）= **330 行** |
| 小文档 | `doc-01.pdf`…`doc-40.pdf`（**40 篇**）：每篇 2 页（`Doc {NN} page {1|2} for the scale fixture.`），**无大纲**（`buildPdf(pages)` 不传 outline） |
| `notes.json` | 写到 `<root>/library/.pix-read/notes.json`，`{ version: 1, notes: [...] }`，**520 条**：① **480 条** `big-book.pdf`：对 KK = 1..30、j = 1..16 —— `page = 1 + 10*(KK-1) + floor((j-1)/2)`（每章前 8 页各 2 条）、`kind = j % 2 === 0 ? "answer" : "excerpt"`（每章 8 摘录 + 8 结论）；正文 `Excerpt {KK}.{j} for the scale fixture` / `Conclusion {KK}.{j} for the scale fixture`；② **40 条** `doc-NN.pdf`（每篇 1 条，`page: 1`，`kind: "excerpt"`，正文 `Doc {NN} excerpt for the scale fixture`）。id 逐条唯一（`perf-{NNN}`），`comment` 为空串，`createdAt` / `updatedAt` 为固定步长的确定值（`1758000000000 + 60000 * index`） |
| 规模不变量（供断言） | 全部文档笔记 = **520**；`big-book.pdf` = **480**（摘录 240 / 结论 240）；分组数（`.notes-group-head`）= **41**；树文件行 = **41**；地图默认行 = **330**。`fixture.docs` = **41** = 树内**文件行数**（`big-book.pdf` + 40 篇小文档），**不是「小文档篇数」**（后者 = 40）——N104-2 判据 1 断言的是 41 |
| 搜索用词（冻结） | `Chapter 13 body`：命中 `big-book.pdf` 第 **121**–**130** 页，每页 1 处 ⇒ 命中总数 **10**、**首个结果页 = 121**（证明扫描越过前 120 页） |
| 夹具生成时机 | 在起 vite dev server 与窗口**之前**一次完成；夹具生成耗时**不计入**任何指标；`big-book.pdf` 之外不得产生其它大文件（夹具总体积 < 5 MB） |

### 0.4 测量口径（逐字冻结，N105）

| 处 | 规则 |
| --- | --- |
| 计时器 | 渲染层路径一律在 `executeJavaScript` 的同一个 Promise 内用 `performance.now()` 计时：`t0 = performance.now()` 与触发动作（`.click()` / 输入写入 / `scrollTop` 赋值）**在同一个同步段**；`t1` = 轮询判定成立的时刻。一次测量 = 一次 `executeJavaScript`（不含 IPC 往返） |
| 轮询节奏 | `setTimeout(poll, 16)`；判定表达式在渲染层求值；有界超时（本表的「单项超时」行），超时 ⇒ 该项 `value: null` + `verdict: "fail"` + 记录 `timeout: true` |
| 心跳（卡顿判据） | 测量窗口内 `setInterval(tick, 16)` 的相邻 tick 间隔最大值 = `stall.max.ms`；窗口内 tick < 2 次 ⇒ 该指标判 fail（不得记 0） |
| 预热 | 每条指标正式采样前先执行**一次完整流程**并把结果丢弃（消除 pdf.js worker 启动、JIT、首次字体加载）；预热次数写死为 1，不可配置 |
| 采样与统计 | K = **3** 次，报告 median 与 samples 全量；`paging.*` 为 30 次翻页的 median / max；`search.cold.ms` 为**单次**（冷缓存：采样前必须让 `.pdf-search-panel` 不在 DOM（`PdfViewer.vue:1087` 的 `v-if="searchOpen && readerStore.pageCount > 0"`）⇒ 面板实例新建 ⇒ setup 作用域的 `textCache`（`PdfSearchPanel.vue:85`）为空；脚本必须登记「打开浮层前面板不在 DOM」的原样读数） |
| 交互节奏 | ② 的每一步「点击下一页」必须**等上一步的 turn 与 render 两个条件都成立**后再点下一次（无排队，写死）；④ 的逐键输入每键之间等「行数稳定」（连续 2 次 16ms 心跳行数不变） |
| 起点/终点（唯一） | ① `open.bigdoc.ms`：起点 = `.tree-row[title$="big-book.pdf"]` 的 `click()`；终点 = 第 1 页 `.pdf-page[data-page="1"]` 的 `canvas` 有非空 `style.width` **且** 该页 `.textLayer span` 在场 **且** `.page-label` 文本逐字 `第 1 / 304 页` |
| | ② `paging.turn.*`：起点 = `.pdf-page-indicator button[title="下一页"]` 的 `click()`；终点 = `.page-label` 文本逐字 `第 {K} / 304 页`（K = 2..31）；`paging.render.*`：同一起点，终点 = 第 K 页 `canvas` 非空 `style.width` 且 `.textLayer span` 在场 |
| | ③ `search.cold.ms`：**复位** = 重新挂载工作区（见「窗口状态纪律」行：文档未打开、搜索浮层闭合）→ `openRow("big-book.pdf")` + 等 `.page-label` 逐字 `第 1 / 304 页`；**起点** = 先点 `.pdf-toolbar` 内 `title` 逐字 `在文档中搜索` 的按钮打开浮层（`PdfViewer.vue:1084`；打开动作不计入计时），再向 `.pdf-search-panel .search-input` 写入 `Chapter 13 body` 并派发 `input` 事件（与 `ui-shot.mjs:9557` 的 `pdfSearchSet` 同款：原生 setter + `input`；计时窗口内含面板自身的 `DEBOUNCE_MS = 300`（`PdfSearchPanel.vue:41`）——冷 / 暖两条路径同等承受该防抖，相对比较不受影响）；终点 = 状态行文本逐字 `第 1 / 10 处 · 第 121 页`。`search.warm.ms`：**同一面板实例内**先把 `search-input` 清空并派发 `input`、等状态行回到空串，再写入同一词并派发 `input`（**禁止**直接重写同值：`:58` 的 `query` 是 ref，同值赋值不触发 `:348` 的 `watch(query)`）；终点 = 同一文本（`textCache` 命中）。冷路径的可判证据 = 打开浮层前 `.pdf-search-panel` 不在 DOM ⇒ 面板实例为新建（`:85` 的 `textCache` 随实例创建） |
| | ④ `notes.firstscreen.ms`：**复位** = 重新挂载工作区（见「窗口状态纪律」行；挂载时刻 `.note-row` = 0——`NotesPanel.vue:759` / `:763` / `:782` / `:787` / `:803` 互斥链下 `status` 非 `ready` 时列表不渲染）；**起点** = 首页项目卡片的 `click()`（同段取 `t0`）；终点 = `.note-row` 计数 = **520** 且 `.notes-group-head` 计数 = **41**；防空 = `data.rowsBefore`（t0 时刻的 `.note-row` 计数）= **0**（硬断言）。`notes.search.key.max.ms`：起点 = 逐键写入 `.notes-search-input`（**13 键**，写死为 `Conclusion 13`）并派发 `input`，终点 = `.note-row` 计数稳定（连续 2 次心跳不变）；防空 = 逐键计数原样登记 + 「至少一键使计数相对上一键发生变化」+ 末键计数 < 首键计数 |
| | ⑤ `map.open.ms`：起点 = `.map-toggle` 的 `click()`；终点 = `.map-row` 计数 = **330**；`map.expand.ms`：起点 = `Chapter 01` 行的 `.row-chevron` 的 `click()`（折叠），终点 = `.map-row` 计数 = **320**，随后再点击展开，终点 = 回到 **330**；`map.expand.ms` = **折叠 + 展开两次点击的合计**；`map.scroll.ms`：起点 = `.map-tree` 的 `scrollTop = 0` 后分 **30** 步（每步等一个 16ms 心跳）递增到 `scrollHeight - clientHeight`，终点 = `scrollTop` 达到目标值的时刻（**注**：`scrollTop` 赋值同帧即可读到目标值 ⇒ 本条的读数是**节流代理量**（30 步 ≈ 30 个 16ms 心跳的常数级），判别力落在 `map.scroll.stall.max.ms`） |
| | ⑦ `tree.badge.ms`：**复位** = 重新挂载工作区（见「窗口状态纪律」行；`leftTab` 默认 `"library"`（`WorkspacePage.vue:41`）⇒ 树在屏，挂载时刻 `.tree-row` = 0）；**起点** = 首页项目卡片的 `click()`（同段取 `t0`）；终点 = `.tree-row` 计数 = **41** 且 `big-book.pdf` 行的 `.row-notes` 文本逐字 `480 条` **且**该行 `getBoundingClientRect().height > 0`；防空 = `data.rowsBefore` = **0**（硬断言） |
| 单项超时 | ① 20s；② 单次 5s；③ `search.cold.ms` 60s / `search.warm.ms` 20s；④ 20s；⑤ 20s；⑦ 20s；单轮总预算 **240s**（超出 ⇒ 停止采样、已采指标照常输出、`ok: false`、退出码 1） |
| 窗口状态纪律 | 复位 = **重新挂载工作区**：`goHome()`（等首页 `.project-list-item` 在场，`ui-shot.mjs:1767-1776` 同款）→ 点项目卡片（等 `.workspace-page` 在场）。复位本身不计入任何指标。各指标的复位态：① = **无打开文档**（`.page-label` 不在场、`.pdf-page` 计数 = 0）——`openDocumentFromLibrary` 对同 `docPathKey` 早退（`WorkspacePage.vue:207-211`），**禁止**在文档已打开时重复点树行；②③ = 已打开 `big-book.pdf` 第 1 页（`.page-label` 逐字 `第 1 / 304 页`），③ 额外要求搜索浮层闭合（`.pdf-search-panel` 不在 DOM）；④⑦ = 刚挂载（`.note-row` = 0 / `.tree-row` = 0），④ 要求笔记面板搜索框为空、排序 = 页码、未开「仅看当前文档」——三者由重新挂载天然满足（store 随页面重建），不得靠改写控件值「复位」；⑤ = 已打开 `big-book.pdf` 第 1 页、`scale = 100%`、地图闭合（`goHome` 内 `readerStore.setMapOpen(false)` / `setScale(1)`） |

### 0.5 指标名与阈值（逐字冻结，N105 / N106）

`B` = 基线读数（`--baseline` 文件内同名指标值）。**绝对阈值 6 条 / 相对阈值 11 条 / 规模不变量 10 条**。

| # | 指标 id | 路径 | 单位 | 统计 | 判据 | 阈值 | 理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `open.bigdoc.ms` | ① | ms | K=3 median | 绝对 | ≤ **3000** | PRD §7.4 的「规模不塌」承诺：304 页论文打开到首屏可交互；实测预期数百毫秒 ⇒ 5–10× 余量，机器抖动不可能造成该幅度漂移 |
| 2 | `paging.turn.median.ms` | ② | ms | 30 次 median | 相对 | ≤ **1.5 × B** | 纯导航/页跟踪路径（Vue 更新 + 2 次 `getBoundingClientRect`）；绝对值只有几十毫秒 ⇒ 固定阈值区分度不足，用同机基线 |
| 3 | `paging.turn.max.ms` | ② | ms | 30 次 max | 相对 | ≤ **2.0 × B** | 同上；max 比 median 多留 0.5× 吸收偶发调度延迟 |
| 4 | `paging.render.median.ms` | ② | ms | 30 次 median | 相对 | ≤ **1.5 × B** | 翻页的可见代价 = 目标页重新渲染（canvas + 文字层）；机器速度强相关 |
| 5 | `paging.render.max.ms` | ② | ms | 30 次 max | 相对 | ≤ **2.0 × B** | 同上 |
| 6 | `paging.stall.max.ms` | ② | ms | 心跳 max | 绝对 | ≤ **1000** | PRD §7.4 明文「不出现 >1s 的无反馈卡顿」——用户可见的绝对承诺，不用基线 |
| 7 | `search.cold.ms` | ③ | ms | 单次（冷） | 绝对 | ≤ **20000** | **灾难性回退护栏**（只兜「让出被移除 / 扫描完全不可用」这类形态），**不是**回归检测主判据（回归检测由 #8 承担）。理由：304 页逐页 `getPageText`（`PdfSearchPanel.vue:110-124`）+ 每页 `await idleYield()`（`:126-130`，`requestIdleCallback(cb, { timeout: 32 })`）——`timeout` 是**上限**（超时才强制执行），**不得**据此推「结构性下界 ≈ 9.6s」或「20s = 2× 下界」。实测值与该条的解释力边界由 dev 档登记（含「本条不得用于宣称性能回归」一句） |
| 8 | `search.warm.ms` | ③ | ms | K=3 median | 相对 | ≤ **1.5 × B** | 缓存命中路径（`textCache`，`PdfSearchPanel.vue:85`），值是毫秒级；基线判据才有机分辨力。采样步骤逐字为「清空输入 → 重输同一词」（§0.4 ③ 行）⇒ 它是 ③ 的**回归检测主判据**（#7 只作护栏） |
| 9 | `search.scan.stall.max.ms` | ③ | ms | 心跳 max | 绝对 | ≤ **1000** | 同上（扫描期间 UI 必须不冻） |
| 10 | `notes.firstscreen.ms` | ④ | ms | K=3 median | 相对 | ≤ **1.5 × B** | 窗口 = 工作区挂载 → 520 行**首次入 DOM**（`loadNotes` 的 IPC 往返 + 分组 + 520 行 DOM 构建）；覆盖「一次性构建全部 DOM」的代价，强耦合机器速度；**不含**面板从隐藏到可见的 `v-show` 翻转（面板常挂载，该翻转不是渲染代价所在） |
| 11 | `notes.search.key.max.ms` | ④ | ms | **13 键** max | 相对 | ≤ **2.0 × B** | 键入反馈延迟（每键 = 一次输入 + 一次全量 filter/sort + 行数稳定）；max 留 0.5× 余量；防空见 §0.4 ④ 行（逐键计数登记 + 至少一键变化） |
| 12 | `map.open.ms` | ⑤ | ms | K=3 median | 相对 | ≤ **1.5 × B** | 330 行派生 + 首屏 DOM |
| 13 | `map.expand.ms` | ⑤ | ms | K=3 median（折叠+展开合计） | 相对 | ≤ **1.5 × B** | 展开态变化的整表重建代价 |
| 14 | `map.scroll.ms` | ⑤ | ms | K=3 median（30 步） | 相对 | ≤ **1.5 × B** | **节流代理量**：`scrollTop` 赋值同帧达标 ⇒ 读数 ≈ 30 个心跳的常数级；330 行的滚动/绘制真实代价与判别力由 #15 `map.scroll.stall.max.ms` 承担 |
| 15 | `map.scroll.stall.max.ms` | ⑤ | ms | 心跳 max | 绝对 | ≤ **1000** | 同上（PRD §7.4） |
| 16 | `tree.badge.ms` | ⑦ | ms | K=3 median | 相对 | ≤ **1.5 × B** | 窗口 = 工作区挂载 → 41 行树首次入 DOM 且 `big-book.pdf` 行徽标文本就绪（`libraryList` 往返 + `countNotesByDocument` 的 520 条聚合 + 41 行渲染）；强耦合机器速度 |
| 17 | `report.export500.ms` | ⑥ | ms | K=3 median（数据面） | 绝对 | ≤ **2000** | 纯线性字符串拼接 + 一次原子写（实测预期数十毫秒）⇒ 两个数量级余量；任何 O(n²) 或重复读盘实现必破线 |

**规模不变量与恒等断言（无阈值，判错即红）**

| # | 断言 id | 路径 | 恒等值 |
| --- | --- | --- | --- |
| 18 | `notes.rows.alldocs` | ④ | `.note-row` 计数 = **520** |
| 19 | `notes.rows.groups` | ④ | `.notes-group-head` 计数 = **41** |
| 20 | `notes.rows.currentdoc` | ④ | 点「仅看当前文档」后 `.note-row` 计数 = **480** |
| 21 | `map.rows` | ⑤ | 默认展开态 `.map-row` 计数 = **330**（折叠后 **320**，展开后回 **330**） |
| 22 | `tree.rows` | ⑦ | `.tree-row` 计数 = **41** |
| 23 | `tree.badge.bigbook` | ⑦ | `big-book.pdf` 行 `.row-notes` 文本逐字 `480 条`，`title` 逐字 `摘录 240 条 · AI 结论 240 条` |
| 24 | `search.hits` | ③ | 状态行文本逐字 `第 1 / 10 处 · 第 121 页` |
| 25 | `search.firsthit.page` | ③ | 首个结果页 = **121**（防空：不是第 1 页命中） |
| 26 | `report.head` | ⑥ | 报告首段 meta 行逐字含 `阅读进度：第 1 / 304 页；共 480 条（摘录 240 · AI 结论 240）。`（`生成时间` 按既有 `STAMP_RE` 归一化） |
| 27 | `report.chapters` | ⑥ | 报告内 `## ` 章块数 = **30**，每块逐字 `（16 条）` |

### 0.6 输出格式与退出码（逐字冻结，N104 / N106）

| 项 | 逐字规范 |
| --- | --- |
| 人类可读行 | 每条指标一行：`[perf] metric <id> value=<number|null> unit=<ms|count|text> stat=<median|max|single> samples=<n>` |
| 判定行 | 每条指标一行：`[perf] verdict <pass|fail|skip> <id> kind=<absolute|relative|invariant> baseline=<number|-> limit=<number|->` |
| 超标行（仅 `--assert` 且越界时） | `[perf] FAIL <id> value=<v> limit=<l> kind=<absolute|relative> baseline=<b> samples=[<…>]` |
| 机器可读 | **最后一行**：`[perf] JSON ` + 单行 JSON，键名逐字：`{"script":"perf-probe","mode":"report"|"assert","ok":<bool>,"root":"<abs>","startedAt":"<ISO>","baseline":"<abs|null>","metrics":[{"id":…,"value":…,"unit":…,"stat":…,"samples":[…],"baseline":…,"limit":…,"kind":…,"verdict":"pass"|"fail"|"skip"}],"fixture":{"pages":<n>,"outlineNodes":<n>,"notesTotal":<n>,"notesBigBook":<n>,"docs":<n>,"pdfBytes":<n>},"summary":{"total":<n>,"pass":<n>,"fail":<n>,"skip":<n>},"failures":[{"id":…,"reason":…}]}`（`fixture` 的六个键逐字冻结，供 N104-2 判据 1 断言） |
| 退出码 | **0** = 全部指标采样完成且（`--assert` 模式下）无越界；**1** = 任一指标采样失败（超时 / 异常 / 单项判 fail）**或** `--assert` 下任一阈值越界（含 `notes.*` / `map.rows` / `tree.*` / `search.*` / `report.*` 恒等断言不成立）；**2** = 用法或环境错误（根目录安全守卫失败、`--baseline` 缺失或不可解析、`--assert` 未带 `--baseline`、目标路径落在仓库内、端口占用） |
| 默认模式 | 无开关 = `mode: "report"`：**不因阈值越界失败**（越界只打印 `verdict fail`），仅采样失败退出 1 |
| 基线缺失语义 | `--baseline` 文件内缺少某相对指标 ⇒ 该条 `verdict: "skip"` + `[perf] warn no-baseline <id>`；**不改退出码**。§0.9 要求验收运行的 `skip` 计数 = 0（基线必须由同一份脚本采出） |
| 输出面 | stdout 为唯一输出面；**不写文件**（除 `--save-baseline` 指定的仓库外路径）；运行结束删除 `PIX_PERF_ROOT`（异常路径同样删除，`finally` 内） |

### 0.7 脚本路径、命令与共享模块抽取（逐字冻结，N104）

| 项 | 逐字值 |
| --- | --- |
| 探针 | `pix/scripts/perf-probe.mjs`（Electron 主进程入口 + 编排器；不新增 npm script） |
| 共享模块 | `pix/scripts/lib/pdf-fixture.mjs`（导出 `escapePdfText` / `buildPdf`，从 `ui-shot.mjs:137-139` 与 `:149-227` 逐字搬移）、`pix/scripts/lib/stub-preload.mjs`（导出 `buildStub(config)`，模板从 `ui-shot.mjs:438-1320` 搬移） |
| `stub-preload.mjs` 模板的允许差异（**唯一**） | ① 文件头注释补来源行（可选）；② `const LIBRARY_TREE = [...]` → `const LIBRARY_TREE = CONFIG.tree;`；③ `const LIBRARY_TREE_B = [...]` → `const LIBRARY_TREE_B = CONFIG.treeB;`；④ `libraryList(dir)` 的 archive 分支改为「`CONFIG.archiveDir` 命中 ⇒ 返回 `CONFIG.archiveChildren`」；⑤ 新增 `config` 键 `tree` / `treeB` / `archiveDir` / `archiveChildren`。**其余行逐字不动**（含既有类名、错误文案、控制口名与方法数） |
| 抽取的机械判据 | 用同一 `PIX_SHOT_ROOT`（`C:/Users/86157/AppData/Local/Temp/pix-v06-r19-stubsha`）跑一次 `ui-shot.mjs`（改前）与一次（改后），比对两次生成的 `stub-preload.cjs`：**差异行必须逐行落在上述 5 处白名单内**（**不设行数上限**，改前/改后均不写具体行数；dev 档原样贴出 `diff` 并逐行标注归类，无法归类的行即不通过）。计数类判据：① `grep -c '\${' pix/scripts/lib/stub-preload.mjs` = **1**；② 模板纪律模式（`listSessions\|readerStateSave\|switchSessionCalls\|setSessions\|readerStateSaveCalls`）在两文件的计数**之和 = 31**（= 抽取前 `ui-shot.mjs` 的计数） |
| 命令 1（基线，只报告） | `cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/perf-probe.mjs --save-baseline <仓库外绝对路径>/perf-base.json` ⇒ 退出码 0 |
| 命令 2（验收，断言） | `cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/perf-probe.mjs --baseline <仓库外绝对路径>/perf-base.json --assert` ⇒ 退出码 0（越界 1） |
| 命令 3（只报告，不写基线） | `cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/perf-probe.mjs` ⇒ 退出码 0 |
| 端口 | **5200**（`strictPort: true`；与 `ui-shot.mjs` 的 5199 不同，避免串行/并行冲突）；`vite` 用仓库自身 `pix/vite.config.ts`，缓存写 `PIX_PERF_ROOT/vite-cache` |
| 禁止 | 不得被 `ui-shot.mjs` 导入（`grep -rn "perf-probe" pix/scripts/ui-shot.mjs` = 0）；不得新增/修改 npm script（`pix/package.json` 零 diff）；不得在仓库内写任何文件 |

### 0.8 验证基建加固契约：`selectPageSpan` 家族的裸等待（逐字冻结，N108）

**现象与根因（实读，登记）**：`ui-shot.mjs:1838-1851` 的 `selectPageSpan(page)` 在造完选区后执行裸 `waitFor("摘录浮层", … offsetParent !== null)`（`:1850`，默认超时 20s）。产品语义（`pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`）：`onStageScroll`（`:141-151`，`:190` 以 **capture** 阶段监听 `document` 的 `scroll`）在「滚动目标位于 `.reader-stage` 子树内」时 `hide()`（`:93`）——**迟到的阅读区滚动**（前序相位遗留的 `scrollIntoView` / `scrollTop` 写入、缩放重排、`focusPage`）会把浮层隐藏 ⇒ `waitFor` 超时抛错 ⇒ `record` 首败即停 ⇒ **整轮取证中断**（`MANIFEST.json.failure` 单字符串）。

| 项 | 冻结 |
| --- | --- |
| 修法（唯一） | 把「静默前置 + 有界重试」**收进 `selectPageSpan` 自身**，成为该家族（`selectPageSpan` / `ensureQuickAskExcerptReady` / `excerptFirstSpan` / `excerptViaQuickAsk` / `focusPage`）的统一前置：每轮尝试 = ① 有界滚动静默等待（复用 `waitStageScrollQuiet()`：连续 400ms 无新增阅读区滚动事件——窗口长度与 `sleep(60)` 轮询节奏逐字不变）② 重建选区（既有 6 行 DOM 段逐字不动）③ 有界等待就绪谓词（**单项 ≤ 4000ms**）。**语义改写（显式登记为新语义，不是「既有语义」）**：`waitStageScrollQuiet()` 的既有 docstring 是「到 timeoutMs 仍有新增 ⇒ ok:false —— 调用方按『前置失败』判红，不得静默降级为通过」（`ui-shot.mjs:5730-5733`）；守卫内调用时改为「超时只作证据、照常进入下一步」——理由：静默窗口的作用是给迟到滚动一个吸收窗口，超时本身不等于选区前置不可满足；函数体与默认参数（`quietMs = 400` / `timeoutMs = 6000`）不动，硬失败由「全局 deadline 内 3 次尝试仍未就绪 ⇒ 抛错」兜住（不得降级为通过） |
| 就绪谓词（只增不减；既有判据逐字保留） | (a) `document.querySelector(".quick-ask")` 在场 **且** `offsetParent !== null`（**既有判据，逐字保留**）；(b) `getSelection()` 非 collapsed 且锚点在 `.reader-stage` 子树内；(c) 选区文本（`\s+` 归一化 + trim）逐字等于 `.pdf-page[data-page="{page}"] .textLayer span` 的首个 span 文本（与 `ensureQuickAskExcerptReady`（`:5611-5633`）同一谓词） |
| 尝试次数与总预算 | ≤ **3** 次尝试；每次尝试前重新静默；**全局 deadline = 20000ms，自首次尝试之前起算**（与既有 20s 同量级，不得更短）。每轮的「静默 ≤ 6000ms」与「就绪 ≤ 4000ms」**都受全局 deadline 约束（先到者生效）**——不得写成「每轮独立预算 × 3 次」（3 × (6s + 4s) = 30s 与总预算矛盾，评审 MF-06） |
| 失败语义（不得降级） | 全局 deadline 内 3 次尝试仍未就绪 ⇒ **抛错**（与今日同为硬失败）；错误文案逐字含 `选择前置失败` **与已完成的 `attempts` 数**，以及每轮 `attempt / quiet / state / selection` 轨迹（`JSON.stringify`）——全局 deadline 先到时也以同一文案抛错（轨迹取已完成部分）；**不得**改成返回 `ok:false` 由调用方忽略、不得跳过该相位、不得删除任何既有断言 |
| 定义位移（登记，唯一允许的既有行改动） | `installStageScrollWatch`（`:5708`）、`stageScrollWatchProbe`（`:5724`）、`waitStageScrollQuiet`（`:5734`）三处 `const` 定义**从闭包末段原样搬**到 `selectPageSpan` 定义（`:1838`）之前（同闭包内，纯位移、函数体逐字不变）——理由：`selectPageSpan` 的既有调用点（`:2060`、`:4077`、`:5518`）在定义处之后、末段之前执行，闭包内 `const` 的 TDZ 会使其无法调用末段 helper（同一事实已在 `:4071-4072` 的既有注释中登记）。既有 4 处显式调用点（`:11330` / `:11463` / `:11491` / `:11570`）保留原样（幂等，不产生第二次语义） |
| 新增可复跑判据（场景 `r19-1`） | 组 `r19-selection-guard`，**2 条 record**，**1 张截图**，见 N108-2 / N108-3 |
| 新增 `SEL` 项 | `readerStage: ".reader-stage"`（**74 → 75**；新场景的注入与复核需要该选择器，既有 74 项逐字不动） |

### 0.9 回归基线、配额与允许的位移（N109）

| 项 | R19 冻结口径 |
| --- | --- |
| 零缺失参照基线 | `C:/Users/86157/AppData/Local/Temp/pix-v06-r18c-review/shots`：**186** 张 png（`MANIFEST.shots[].name`，`failure === null`）、`MEASUREMENTS.json` 长度 **264**、label 去重 **74** 种（本档已逐项复读：`shots = 186` / `failure = null` / `264` / `74`） |
| 动工前自建基线 | `PIX_SHOT_ROOT=<临时目录>/pix-v06-r19-base` 实跑一次（PRD §5.1）；同时用同一次运行产出 `stub-preload.cjs` 的抽样副本（用于 §0.7 的抽取差异判据） |
| 零缺失判据 | 基线 `MANIFEST.shots[].name` 集合 ⊆ 验收运行集合；基线 label 集合（74 种）⊆ 验收 label 集合；`failure === null`、退出码 0；截图目录与清单双向相等、无白名单外条目 |
| 新增配额 | 截图 **+1**（186 → **187**）、record **+2**（264 → **266**）、label **+1**（74 → **75**）；烟测-主进程 **+3 条**（71 → **74**）；烟测-渲染零改动（9 组 74 条） |
| 允许的位移与内容变更（**仅** `r19-1` 场景内） | ① `.center-pill` / `.pdf-scroll` 内出现摘录浮层与选区（该场景固有）；② 阅读区滚动被注入（一次性，`scrollTop` 增量冻结为 `R19_GUARD_INJECT_DELTA = 160`，实际写入前后的读数登记在 `data.injected`）；③ `SEL` 新增 1 项（不影响任何既有断言）。**不允许**：既有 186 张截图的像素内容变化；既有 264 条测量的任何字段变化；既有 74 种 label 的条数变化；`.notes-*` / `.pdf-*` / `.map-*` / `.tree-row` / `.row-notes` / `.pill-*` 的既有几何与文本变化 |
| 时长红线 | 验收运行的 ui-shot 单轮 wall-clock ≤ 基线单轮 **× 1.10**（两次均用同一条命令 + `time` 记录；登记两次数值与比值） |
| 烟测回归 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" node scripts/smoke-view.mjs` ⇒ 末行逐字 `通过 74 / 失败 0`；`node scripts/smoke-notes.mjs` ⇒ 末行逐字 `通过 74 / 失败 0`；两者各连续两次结果相同 |
| 性能面回归 | 命令 1 / 命令 2 各退出 0；验收运行的 `skip` 计数 = **0**；`[perf] JSON` 的 `summary.fail` = **0** |

### 0.10 flake 登记（S-SD-02 家族，本轮工程化销账）

| 项 | 内容 |
| --- | --- |
| 编号与出处 | **S-SD-02**（`docs/pm/R15-audit-scripts-docs.md:32` 登记为 P1；`:69-…` 详述；`:325` 给出修复处方 = 复用同文件 `ensureQuickAskExcerptReady` 的「有界静默 + 复核 + 有界重取」） |
| 现象 | `MANIFEST.json.failure` 逐字形如 `等待超时：摘录浮层（document.querySelector(".quick-ask") && document.querySelector(".quick-ask").offsetParent !== null）`；中断点固定落在 `selectPageSpan` 的裸等待（今 `:1850`） |
| 频率（仓库内既有实跑记录） | R14：dev 基线（116/143 张）与审查步重跑各 1 次；R15-dev 尝试 1：`r11-3` 相位 5；R18-review 尝试 1：`r11-3` 相位 4（123/186 张）。**最近三轮每轮至少命中一次** |
| 每次代价 | 整轮 3–5 分钟重跑（首败即停，`MANIFEST.failure` 单字符串 + 既有 186 张产物作废） |
| 根因（实读） | ① `selectPageSpan`（`:1838-1851`）用裸 20s `waitFor` 等浮层可见；② 产品侧「阅读区滚动 ⇒ 隐藏浮层」是**既有语义**（`PdfSelectionQuickAsk.vue:141-151` / `:190`），而迟到的阅读区滚动（前序相位的 `scrollIntoView` / `scrollTop` / 缩放重排 / `focusPage`（`:5595-5599`））在渲染层是常态；③ 触发点与「环境快慢」强相关 ⇒ 在慢机器/忙机器上概率上升 |
| 处置（本轮，不再是「重跑一次」） | §0.8 的统一前置 + 有界重试；`r19-1` 的**注入式复现**（确定性地把迟到滚动注入到选区与就绪之间）与**硬失败反例**（前置不可满足时必须抛错）；`r19-1` 的两条 record 与 1 张截图进入既有零缺失面，任何后续轮次的改写都会使判据变红 |
| 处置后的验收口径 | `r19-1` 两条 record 全绿；既有 186 张 / 264 条 / 74 种 label 零缺失；§0.7 的差异白名单不被越界（`git diff -U0 -- pix/scripts/ui-shot.mjs` 的既有行改动仅限于 §0.8 的位移行与新场景行） |
| 残余风险（登记） | ① 注入式复现证明的是「有界重试能吸收一次迟到滚动」；无法证明「无限次连续迟到滚动」下的存活（若环境持续抖动，全局 deadline 内 3 次尝试后仍会硬失败）——按「不得降级为通过」的取向接受，失败时输出的 3 轮轨迹可定位。② 重试分支（`attempts ≥ 2`）**不被确定性覆盖**（§0.8 的注入固定落在首轮静默窗口内）——若实测命中，原样登记，不得声称两条分支都被证明。③ **返回后的迟到滚动不在守卫保护范围内**：守卫只覆盖到「就绪谓词成立」时刻；后续相位若因新的迟到滚动而隐藏浮层，仍会按既有断言失败（不属本轮修复面）。 |

## 本档事实基线（写档当天核对过的真实结果，供后续角色复核）

| 事实 | 证据 |
| --- | --- |
| 分支 `main`，HEAD = `bd4a189`（R18 已提交交付） | 实跑 `git log --oneline -1` = `bd4a189` |
| 工作树状态 | 写档当时：`git status --short` 只多出 `docs/pm/R19-req.md`（未跟踪）；定稿修订完成后（本步实跑）：`?? docs/pm/R19-req.md` + `?? docs/pm/R19-review.md`（两份未跟踪档件，无其它改动） |
| 唯一工程门当前 0 error | 2026-09-17 实跑 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（`vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit`） |
| R18 交付产物基线 | `C:/Users/86157/AppData/Local/Temp/pix-v06-r18c-review`：`MANIFEST.shots.length = 186`、`failure = null`、`MEASUREMENTS.json` 长度 **264**、label 去重 **74**、目录内 png **186**（实跑 `node -e` 读两个 json + `ls *.png \| wc -l`） |
| 离屏脚本现状（`pix/scripts/ui-shot.mjs`，12483 行 / 598411 字节） | `SEL` `:47-131` = **74** 项（`sed -n '47,140p' \| grep -cE '^  [a-zA-Z]+: '` = 74；末两项 `readerDiscuss` `:129` / `sessionDocMark` `:130`）；`escapePdfText` `:137`、`buildPdf` `:149`、`SAMPLE_PAGES` `:229`、`LONG_BOOK_OUTLINE`（20 章 × 10 节 × 1 子节 = 420 节点）`:332-351`、`seedNotes` `:350`、`writeFixtures` `:400`、`buildStub` `:438`、stub 模板唯一插值点 = `configJson`（`:459`；`:438-1320`（`buildStub` 体）内 `${` 计数 = 1）、`LIBRARY_TREE` `:839` / `LIBRARY_TREE_B` `:850` / `libraryList` `:854`（只按 3 个路径命中）、`shots` `:1326`、`capturePage` `:1337`、`runScenario` `:1347`（`waitFor` `:1350`）、`runReaderStateScenarios` `:1660`（`waitFor` `:1667`、`record` `:1678`）、`waitResumeEntry` `:1757`、`openRow` `:1792`、`clickNext`/`clickPrev` `:1801`/`:1802`、**`selectPageSpan` `:1838`（裸等待 `:1850`）**、`excerptFirstSpan` `:5517`、`quickAskProbe` `:5539`、`waitFeedbackOk` `:5551`、`quickAskStateProbe` `:5564`、`selectionProbe` `:5577`、`pageSpanText` `:5589`、`focusPage` `:5595`、**`ensureQuickAskExcerptReady` `:5611`**、`excerptViaQuickAsk` `:5638`、`waitFeedbackCleared` `:5665`、**`installStageScrollWatch` `:5708` / `stageScrollWatchProbe` `:5724` / `waitStageScrollQuiet` `:5734`**、裸等待同族 `:1465` / `:1512` / `:1540`（`runScenario` 内联）与 `:9552`（`selectionOnPageOne`）、4 处显式 `selectPageSpan` 调用点 `:11330` / `:11463` / `:11491` / `:11570`（前置静默调用在上一行 `:11329` / `:11462` / `:11490` / `:11569`）、`main` `:12361`、启动守卫 `:12342-12359`、结束自检 `:12439-12458`（实读 `grep -n`） |
| flake 根因（产品侧） | `PdfSelectionQuickAsk.vue`：`MIN_SELECTION_CHARS = 2` `:19`、`FEEDBACK_MS = 2500` `:23`、`hide()` `:93`、`onSelectionChange` `:118-139`、**`onStageScroll` `:141-151`**、capture 监听 `document` 的 scroll `:190`（与 `:195` 的对称解绑）；`.pdf-scroll` 在 `.reader-stage`（`ReaderPanel.vue:235` / `:322` 与 `PdfViewer.vue:1117`）子树内 ⇒ 阅读区滚动必隐藏浮层 |
| 规模相关现状（渲染层） | `PdfViewer.vue`：`ANCHOR_LAYER_WAIT_MS = 2000` `:60`、`measurePages` `:197-209`（**对全部页串行 `getPage` + `getViewport`**）、`observePages` `:301-325`（`rootMargin: "1200px 0px"`、`\|page − current\| > 4` 才 `releasePage`）、`updateCurrentPage` `:327-357`（二分定位）、`loadPdf` `:672-755`、`onScroll` `:784-790`（rAF 节流）、页指示器 `:1192-1224`（下一页 = `gotoPage(page + 1)`）、`anchorExcerpts` `:833-841`（每次重画全量 `filter` + `sort`）、`paintNoteAnchor` `:925-949`（仅当前页） |
| | `NotesPanel.vue`：`notes-list` `:803`、`v-for group` `:804-813`、`v-for note` `:815`（**无虚拟滚动、无分页**）、`.note-row` 单行结构（复选框 + 页码徽标 + 时间 + 删除按钮 + 正文 + 备注区） |
| | `KnowledgeMap.vue`：`nodeCount` `:46`、`chapterRanges` `:48`、`noteCounts` `:50-52`（memo，依赖 notes/currentDocKey/outline/pageCount）、`rows` `:53-55`、`groups` `:56`、默认展开 watch `:65-73`、`collectExpandable` `:105-116`（**只展开顶层**）、`flattenVisible` `:118-149`、`.map-tree` 为滚动容器（`overflow-y: auto`） |
| | `notes-store.ts`（渲染层 557 行）：`groups` `:155-161`、`visibleCount` `:163`、**`currentDocNoteCount` `:168-173`（第二次全量 `groupNotesByDocument`）** |
| | `LibraryPanel.vue`：`noteCountMap` `:49`（`countNotesByDocument` memo）、`rowsWithBadge` `:51-57`、`libraryList(root, 3)` `:86`、徽标 `{{ row.badge.total }} 条` `:179` + `title` `:178` |
| | `utils/notes-path.ts`：`docPathKey` `:18`、`countNotesByDocument` `:73-84`、`countNotesByPage` `:93-106`、`groupNotesByDocument` `:109-146`（分组 + 组内排序 + 组间排序）；`utils/notes-view.ts`：`applyViewToGroups` `:55-59`（每键全量 filter + sort）；`utils/outline-notes.ts`：`buildChapterRanges` `:52-79`（内层循环首个更大页码即 `break`）、`countNotesByChapter` `:86-124`（按页前缀和，区间 O(1)）；`utils/page-anchor.ts`：`foldText` `:40-60`、`matchExcerpts` `:63-75`、`MAX_ANCHOR_TEXT_LENGTH = 400` `:28` |
| | `PdfSearchPanel.vue`：`DEBOUNCE_MS = 300` `:41`、`LAYER_WAIT_TIMEOUT_MS = 5000` `:43`、`textCache` `:85`（**按文档缓存，跨缩放复用**）、`getPageText` `:110-124`、`idleYield` `:126-130`（`requestIdleCallback(…, {timeout: 32})`）、`runSearch` `:132-175`（逐页 `getTextContent` → 计数 → `await idleYield()`）、**命中结果在扫描结束后一次落地（`:167-169`）⇒ 首个结果可见 = 扫描完成时刻**、状态文本 `:74-82`（`已扫 x / y 页` / `第 i / n 处 · 第 P 页`） |
| 规模相关现状（主进程） | `notes-store.ts`：`NOTES_DIR_NAME = ".pix-read"` `:30`、`NOTES_FILE_NAME = "notes.json"` `:31`、`SCHEMA_VERSION = 1` `:37`、`MAX_NOTE_TEXT_LENGTH = 4000` `:39`、`isReaderNote` `:137-155`、条目 id 唯一性即损坏 `:176`、`renderMarkdownEntry` `:266-274`、`sortReportEntries` `:300-302`、`reportBlocks` `:313-344`（章节桶 → 退化按页分组）、`renderDocumentReport` `:347-362`、`exportDocumentReport` `:499-…`（`join(paths.reports, ...docPath) + ".md"` + 原子写） |
| 烟测面现状 | `grep -c "  check(" pix/scripts/smoke-notes.mjs` = **71**（10 组，见 §0.1）；`grep -c "  check(" pix/scripts/smoke-view.mjs` = **74**（9 组，`main()` 顺序 `runSectionHit` … `runTemplateDraft`） |
| 命名预检（本轮新增名字，`pix/src` 内当前 0 命中） | `perf-probe` / `PIX_PERF_ROOT` / `open.bigdoc.ms` / `paging.turn.median.ms` / `paging.stall.max.ms` / `search.cold.ms` / `notes.firstscreen.ms` / `map.expand.ms` / `tree.badge.ms` / `report.export500.ms` / `r19-selection-guard` / `readerStage`（`SEL` 键名）均为 0 命中；`pix/scripts/lib/` 目录当前不存在 |

**判定工具（本档所有验收只能由这六种证据判定，逐条已标注）**

| 记号 | 含义 |
| --- | --- |
| 【走查】 | 只读代码与 `git status` / `git diff` / `git log` / `git show`（只读可用）；含 `grep -c` / `grep -rn` 计数类判据 |
| 【check】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error（唯一工程门） |
| 【烟测-渲染】 | `pix/scripts/smoke-view.mjs`（**本轮零改动**：9 组 74 条只作回归） |
| 【烟测-主进程】 | `pix/scripts/smoke-notes.mjs`（10 组 71 条 → **11 组 74 条**：新增 `perf-report-export` 组 3 条） |
| 【离屏】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + 既有 186 张 / 264 条 / 74 种 label 零缺失 + `r19-1` 2 条 record 全绿 + 1 张新截图齐备（**新增证据型**） |
| 【性能】 | `pix/scripts/perf-probe.mjs` 的两条命令（§0.7 命令 1 / 命令 2）：退出码 + `[perf] JSON` 的 `summary` / `metrics[].verdict`（**本轮新增证据型**，依据 PRD §5.3「性能类判据必须给出可复跑的测量方式与阈值」） |

## 1. N104 大夹具与可复跑测量入口（5 子条）

**用户可见行为**：本轮不改变用户可见行为（唯一例外是 N108 的取证基建，用户不可见）；N104–N107 的产出是「把 300+ 页与 500+ 条下的行为变成有数字、有阈值、可复跑的事实」。

### N104-1 探针脚本与命令（逐字冻结）

**逐字冻结**：§0.7 全表（脚本路径 / 共享模块 / 4 条命令 / 端口 5200 / 命令与 `pix/package.json` 零 diff）。

**验收判据**

1. 【走查】文件存在且唯一：`test -f pix/scripts/perf-probe.mjs; test -f pix/scripts/lib/pdf-fixture.mjs; test -f pix/scripts/lib/stub-preload.mjs`；`grep -rn "perf-probe" pix/scripts/ui-shot.mjs \| wc -l` = **0**；`git diff pix/package.json` 为空。
2. 【性能】命令 3（只报告）⇒ 退出码 0，且 stdout 末行为 `[perf] JSON {…}`（`node -e` 解析该行，`mode === "report"`、`metrics.length === 24`）。
3. 【走查】顶层导入纪律：`grep -c "await import(\|import(" pix/scripts/perf-probe.mjs` = **0**；`grep -c "require(" pix/scripts/perf-probe.mjs` = **0**（ESM 顶层 import）。
4. 【走查】端口与守卫：`grep -c "5200" pix/scripts/perf-probe.mjs` ≥ 1；`grep -c "assertOutRootSafe\|tmpdir()" pix/scripts/perf-probe.mjs` ≥ 1。

**文件白名单条目**：`pix/scripts/perf-probe.mjs`（新建）、`pix/scripts/lib/pdf-fixture.mjs`（新建）、`pix/scripts/lib/stub-preload.mjs`（新建）。

### N104-2 大夹具（逐字冻结）

**逐字冻结**：§0.3 全表。

**验收判据**

1. 【性能】夹具规模：脚本在报告模式下把夹具读数写进 `[perf] JSON` 的 `metrics` 之外另落 `fixture` 对象（键 `pages` / `outlineNodes` / `notesTotal` / `notesBigBook` / `docs` / `pdfBytes`）⇒ 断言 `pages === 304`、`outlineNodes === 330`、`notesTotal === 520`、`notesBigBook === 480`、`docs === 41`、`pdfBytes > 0 && pdfBytes < 5 * 1024 * 1024`。
2. 【走查】复用而非复制：`grep -c "function buildPdf" pix/scripts/lib/pdf-fixture.mjs` = **1** 且 `grep -c "function buildPdf" pix/scripts/ui-shot.mjs` = **0**（`import { buildPdf } from "./lib/pdf-fixture.mjs"`）；`grep -c "function buildPdf" pix/scripts/perf-probe.mjs` = **0**。
3. 【走查】夹具合法性的**证据边界**（评审 MF-09）：离屏夹具**不经过主进程读侧**——`ui-shot.mjs` 的 stub `readNotesFile`（`:525-534`）自带宽松解析（`:523-524` 注释逐字「解析失败/缺文件按空数组降级（stub 专用；主进程同情形判 corrupt，差异见开发档）」），主进程的 `isReaderNote`（`pix/src/main/notes-store.ts:137-155`）/ `parseNotesFile`（`:158`）/ `readNotesFile`（`:180`）在离屏运行中**不执行**。因此 ④/⑦ 的 520 / 41 / 480 只证明**渲染层规模不变量**与「stub 读侧接受」，**不得**声称覆盖主进程白名单。替代证据（走查）：dev 档给出逐字段对照表——`perf-probe.mjs` 生成条目的字段集 ⊆ `isReaderNote` 接受的字段与取值域（`id` 非空串 / `kind` ∈ `"excerpt"`|"answer" / `docPath` 非空非绝对、无 `\` 与 `..` 段 / `page` 整数 ≥ 1 / `text` 1..4000 / `comment` 字符串 / `createdAt`・`updatedAt` 有限数），并注明该对照是走查、不是执行证据。
4. 【走查】零仓库写入：`git status --short` 在命令 3 前后完全相同；`%TEMP%/pix-v06-r19-perf` 在命令结束后**不存在**。

**文件白名单条目**：`pix/scripts/perf-probe.mjs`（新建）、`pix/scripts/lib/pdf-fixture.mjs`（新建）。

### N104-3 共享模块抽取（逐字冻结 + 差异白名单）

**逐字冻结**：§0.7 的「共享模块」「模板的允许差异（唯一）」「抽取的机械判据」三行。

**验收判据**

1. 【走查】差异白名单（逐行归类，**不设行数上限**——评审 MF-08）：用同一 `PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v06-r19-stubsha` 跑改前 / 改后各一次 `ui-shot.mjs`，`diff <改前 stub-preload.cjs> <改后 stub-preload.cjs>` 的**每一行**都必须落在 §0.7 的 5 处白名单形态内：① `CONFIG` 字面量新增键（`tree` / `treeB` / `archiveDir` / `archiveChildren`）及其 JSON 展开行；② `LIBRARY_TREE` 块（改前 `ui-shot.mjs:839-847`，9 行）整块替换为 1 行；③ `LIBRARY_TREE_B` 块（`:850-852`，3 行）整块替换为 1 行；④ `libraryList` 的 archive 分支（`:858`，1 行）改为 CONFIG 命中；⑤ 文件头注释（可选，≤ 1 行）。**出现无法归类的行（含额外缩进/格式/字面改动）即不通过**；行数本身作为读数登记在 dev 档（原「≤ 6 行」的写法作废）。
2. 【走查】唯一插值点不变：`grep -c '\${' pix/scripts/lib/stub-preload.mjs` = **1**（= 改前 `sed -n '438,1320p' pix/scripts/ui-shot.mjs | grep -c '\${'` 的计数；唯一插值点是 `:459` 的 ``const CONFIG = ${configJson};``）。白名单新增的 `CONFIG.tree` / `CONFIG.treeB` / `CONFIG.archiveDir` / `CONFIG.archiveChildren` 引用**不含** `${`，故计数不变（原「+ 白名单新增的 `CONFIG.*` 引用数」的公式作废；dev 档登记两个数字）。
3. 【走查】模板纪律零改写：`grep -c "listSessions\|readerStateSave\|switchSessionCalls\|setSessions\|readerStateSaveCalls"` 在 `pix/scripts/lib/stub-preload.mjs` 与 `pix/scripts/ui-shot.mjs` 两文件的计数**之和 = 31**（= 抽取前 `ui-shot.mjs` 的计数，实测；模板区 `:438-1320` 内占 10 行、模板外 21 行，抽取后后者留在 `ui-shot.mjs`）⇒ **不存在「抽取后应为 0」的形态**；另 `grep -c "api 面\|contextBridge.exposeInMainWorld" pix/scripts/lib/stub-preload.mjs` ≥ 2。
4. 【离屏】既有 186 张截图 / 264 条测量 / 74 种 label 零缺失（抽取不得改变既有夹具与场景的任何读数）。

**文件白名单条目**：`pix/scripts/lib/stub-preload.mjs`（新建）、`pix/scripts/lib/pdf-fixture.mjs`（新建）、`pix/scripts/ui-shot.mjs`（修改：只改 import 与调用点）。

### N104-4 机器可读输出与退出码

**逐字冻结**：§0.6 全表。

**验收判据**

1. 【性能】命令 3：退出码 **0**；末行 JSON 可被 `JSON.parse`（去掉 `[perf] JSON ` 前缀）；`summary.total === 24`（【性能】面）、`summary.fail === 0`、`failures.length === 0`；`mode === "report"`。
2. 【性能】命令 2 且**故意注入越界**（验收步骤的对照实验：用 `--baseline` 指向一份把 `open.bigdoc.ms` 记为 `1` 的构造基线）⇒ 退出码 **1**、stdout 含 `[perf] FAIL open.bigdoc.ms `、JSON 的 `summary.fail ≥ 1` 且 `ok === false`；恢复真实基线后退出 0。
3. 【性能】用法错误：`--baseline` 指向不存在文件 ⇒ 退出码 **2**；`--assert` 不带 `--baseline` ⇒ 退出码 **2**；`--save-baseline` 指向仓库内路径（`pix/perf-base.json`）⇒ 退出码 **2** 且仓库内无新文件。
4. 【走查】输出面唯一：`grep -c "writeFileSync" pix/scripts/perf-probe.mjs` 的命中仅为 `--save-baseline` 一处（dev 档登记该行）。

**文件白名单条目**：`pix/scripts/perf-probe.mjs`（新建）。

### N104-5 自清理与安全守卫

**逐字冻结**：§0.3 的「根目录」「安全守卫」两行 + §0.6 的「输出面」行。

**验收判据**

1. 【性能】成功后零残留：命令 3 结束后 `<默认根>` 不存在；`git status --short` 不出现新增未跟踪文件。
2. 【性能】失败路径零残留：用一个必然失败的注入（`PIX_PERF_ROOT` 指向被占用端口场景：先手工起一个 5200 端口进程，或在脚本外先占用）⇒ 退出码 2 且 root 仍被删除（dev 档登记该次尝试的原样输出）。
3. 【性能】安全守卫：`PIX_PERF_ROOT=E:/develop/PiX-Read/pix/perf-root` ⇒ 退出码 **2**、不创建目录、stdout 含拒绝启动文案（文案由设计定稿，语义 = 「必须位于系统临时目录内，且不得与仓库路径互相包含」）。
4. 【走查】不拖慢既有面：`grep -rn "PIX_PERF_ROOT\|perf-probe" pix/scripts/ui-shot.mjs pix/scripts/smoke-notes.mjs pix/scripts/smoke-view.mjs \| wc -l` = **0**。

**文件白名单条目**：`pix/scripts/perf-probe.mjs`（新建）。

## 2. N105 关键路径清单（7 子条，每条写死测量方式与计时起止点）

**逐字冻结（七条路径的唯一口径）**：§0.4 全表（计时器 / 轮询节奏 / 心跳 / 预热 / 采样与统计 / 交互节奏 / 起点终点 / 单项超时 / 复位纪律）。

### N105-1 ① 打开大文档到首屏可交互

**计时起止点**：**复位态** = 无打开文档（`goHome()` → 首页点项目卡片 → `.workspace-page` 在场、`.page-label` 不在场）；起点 = `.tree-row[title$="big-book.pdf"]` 的 `click()`（同段取 `t0`）；终点 = 第 1 页 `canvas` 非空 `style.width` **且** 该页 `.textLayer span` 在场 **且** `.page-label` 文本逐字 `第 1 / 304 页`。指标 `open.bigdoc.ms`（K=3 median，绝对 ≤ 3000）。

**验收判据**

1. 【性能】`open.bigdoc.ms` 有值且 ≤ 3000；`samples.length === 3`。**登记盲区**（评审 §1.2）：本条只有绝对阈值、无相对伴随判据 ⇒ 机器整体变慢 2–3× 时不会转红；dev 档必须写明该盲区与实测余量倍数。
2. 【走查】终点含「页数派生完成」：`.page-label` 分母为 304 ⇒ 覆盖 `measurePages`（`PdfViewer.vue:197-209`，对全部页串行 `getPage`）的代价（该路径是本轮候选热点之一，见 N107-4）。
3. 【性能】复位纪律（防空）：每次采样前必须回到「无打开文档」态（`goHome()` → 首页点项目卡片），并原样登记点击前的 `.page-label` 文本（应为 null）与 `.pdf-page` 计数（应为 0）——**三次采样 = 三次「重新挂载 + `openRow`」**。**禁止**在同一份已加载文档上重复点树行：`openDocumentFromLibrary` 对同 `docPathKey` 直接 `return`（`WorkspacePage.vue:207-211`），此时点击不产生任何加载，读数会退化为心跳间隔（评审 MF-03）。

**文件白名单条目**：`pix/scripts/perf-probe.mjs`（新建）。

### N105-2 ② 连续翻页（N=30）的平均与最坏帧内延迟

**计时起止点**：起点 = `.pdf-page-indicator button[title="下一页"]` 的 `click()`；终点（`paging.turn.*`）= `.page-label` 文本逐字 `第 K / 304 页`；终点（`paging.render.*`）= 第 K 页 `canvas` 非空 `style.width` 且 `.textLayer span` 在场；`paging.stall.max.ms` = 窗口内 16ms 心跳最大间隔。K = 2..31（30 次），每次等两个终点都成立后再点下一次。

**验收判据**

1. 【性能】四条指标有值：`paging.turn.median.ms` ≤ 1.5×B、`paging.turn.max.ms` ≤ 2.0×B、`paging.render.median.ms` ≤ 1.5×B、`paging.render.max.ms` ≤ 2.0×B；`paging.stall.max.ms` ≤ **1000**。
2. 【性能】防空：`samples.length === 30`；脚本必须另记**第一次终点的原始文本**并断言其逐字 `第 2 / 304 页`（即起点确实停在第 1 页）⇒ 防止「点不动」被记成「很快」。
3. 【性能】无排队：`paging.render.median.ms` 与 `paging.turn.median.ms` 的差 > 0 时可判定「渲染被计入」；两者都为 `null`（超时）即 fail。

**文件白名单条目**：`pix/scripts/perf-probe.mjs`（新建）。

### N105-3 ③ PDF 全文搜索（跨 304 页的首个结果与完成）

**计时起止点**：**复位** = 重新挂载工作区 → `openRow("big-book.pdf")` + 等 `.page-label` 逐字 `第 1 / 304 页`；**冷路径前置** = 打开浮层前登记 `document.querySelector(".pdf-search-panel") === null`（面板按 `v-if="searchOpen && readerStore.pageCount > 0"`（`PdfViewer.vue:1087`）创建 ⇒ 实例新建 ⇒ `textCache`（`PdfSearchPanel.vue:85`）为空）；**起点** = 点 `.pdf-toolbar` 内 `title` 逐字 `在文档中搜索` 的按钮打开浮层（`PdfViewer.vue:1084`，打开动作不计时）后，向 `.pdf-search-panel .search-input` 写入 `Chapter 13 body` 并派发 `input`（原生 setter + `input`，与 `ui-shot.mjs:9557` 同款）；终点 = 状态行文本逐字 `第 1 / 10 处 · 第 121 页`。`search.cold.ms` = 单次（冷）；`search.warm.ms` = K=3 median（**同一面板实例内**：清空输入并派发 `input` → 等状态行回到空串 → 重输同一词并派发 `input`；**禁止**同值重写）；`search.scan.stall.max.ms` = 扫描窗口心跳最大间隔。

**验收判据**

1. 【性能】`search.cold.ms` ≤ **20000**；`search.warm.ms` ≤ 1.5×B；`search.scan.stall.max.ms` ≤ **1000**。
2. 【性能】恒等断言：`search.hits` 逐字 `第 1 / 10 处 · 第 121 页`；`search.firsthit.page === 121`（防空：扫描确实越过了前 120 页）。
3. 【走查】登记事实：命中集合在扫描结束后一次落地（`PdfSearchPanel.vue:167-169`）⇒ 「首个结果可见」与「扫描完成」是同一时刻；本档据此把 N105 的「首个结果与完成时间」冻结为同一指标的两次不同缓存态测量（冷 / 暖），不新增第二套口径。
4. 【性能】冷/暖口径的可判证据（评审 MF-04）：`data.cold = { panelAbsentBeforeOpen: true, instanceOpened: true }`（打开浮层前 `.pdf-search-panel` 不在 DOM）且 `data.warmSteps = "clear-then-retype"`、两次采样的 `data.query` 逐字 `Chapter 13 body`；缺任一项即视为「冷/暖口径不可信」并判 fail。

**文件白名单条目**：`pix/scripts/perf-probe.mjs`（新建）。

### N105-4 ④ 笔记面板（520 / 480 条）首屏渲染与搜索输入响应

**计时起止点**：`notes.firstscreen.ms`：**复位** = 重新挂载工作区（挂载时刻 `.note-row` = 0；`NotesPanel.vue:759` / `:763` / `:782` / `:787` / `:803` 互斥链保证非 `ready` 时不渲染列表）；起点 = 首页项目卡片的 `click()`（同段取 `t0`）；终点 = `.note-row` 计数 = **520** 且 `.notes-group-head` 计数 = **41**；防空 = `data.rowsBefore`（t0 时刻的 `.note-row` 计数）**= 0**（硬断言）。`notes.search.key.max.ms`：起点 = 逐键写入 `.notes-search-input`（**13 键逐字 `Conclusion 13`**）并派发 `input`，终点 = `.note-row` 计数稳定（连续 2 个心跳不变）。二者均 K=3（首屏为 3 次 median；键入为 3 轮 × 13 键的 **max**）。

**验收判据**

1. 【性能】`notes.firstscreen.ms` ≤ 1.5×B；`notes.search.key.max.ms` ≤ 2.0×B。
2. 【性能】恒等断言：`notes.rows.alldocs === 520`、`notes.rows.groups === 41`、`notes.rows.currentdoc === 480`（最后一个在点既有「仅看当前文档」开关后读：`NotesPanel.vue:649-655` 的 `v-switch`，label 逐字 `仅看当前文档`；脚本定位方式由设计定稿，**不得新增类名或改写该控件**；`data` 内登记该次点击后的行数）。
3. 【性能】复位纪律：复位一律走「重新挂载工作区」（store 随页面重建 ⇒ 搜索框空、排序 = 页码、未开「仅看当前文档」）；**不得**在同一实例内重复点标签——`selectLeftTab` 对同标签直接 `return`（`WorkspacePage.vue:213-215`），而 `leftTab` 默认 `library`（`:41`），点击是 no-op（评审 MF-01 / MF-02）。
4. 【性能】键入指标防空（评审 MF-13）：`data.keyCounts` 原样登记 13 个逐键 `.note-row` 计数；断言「至少一键使计数相对上一键发生变化」且「末键计数 < 首键计数」；查询词逐字 `Conclusion 13`（**不得**改回 `fixtur`——后者 6 个前缀全命中 520 条，「行数稳定」在按键前即成立）。

**文件白名单条目**：`pix/scripts/perf-probe.mjs`（新建）。

### N105-5 ⑤ 知识地图（330 节点）展开与滚动

**计时起止点**：`map.open.ms`：起点 = `.map-toggle` 的 `click()`；终点 = `.map-row` 计数 = **330**。`map.expand.ms`：起点 = `Chapter 01` 行的 `.row-chevron` 的 `click()`；终点 = `.map-row` 计数 = **320**；随后再点一次展开（终点 = 330）⇒ 指标 = 两次点击的**合计**。`map.scroll.ms`：起点 = `.map-tree` 的 `scrollTop = 0` 后分 30 步（每步等一个心跳）递增至 `scrollHeight - clientHeight`；终点 = `scrollTop` 达到目标值（**注**：本条读数是节流代理量——`scrollTop` 赋值同帧即达标；判别力落在 `map.scroll.stall.max.ms`）。`map.scroll.stall.max.ms` = 滚动窗口心跳最大间隔。均 K=3 median（`map.scroll.stall.max.ms` = 3 轮窗口的 max）。

**验收判据**

1. 【性能】`map.open.ms` ≤ 1.5×B、`map.expand.ms` ≤ 1.5×B、`map.scroll.ms` ≤ 1.5×B、`map.scroll.stall.max.ms` ≤ **1000**。
2. 【性能】恒等断言：`map.rows === 330`；折叠中间态 == **320**；展开后回 **330**（防空：展开/折叠真实发生）。
3. 【性能】复位纪律：每轮采样前地图闭合、页码回第 1 页（避免 `isCurrent` 行变化干扰）。

**文件白名单条目**：`pix/scripts/perf-probe.mjs`（新建）。

### N105-6 ⑥ 单文档报告导出（480 条，主进程数据面）

**计时起止点**：`report.export500.ms`：起点 = 调用 `exportDocumentReport({ docFilePath, chapters, progress })` 前的 `performance.now()`；终点 = 返回后的 `performance.now()`（同一次同步调用内）。K=3 median，绝对 ≤ **2000**。

**验收判据**

1. 【烟测-主进程】组 `perf-report-export` #1–#3 全绿（三条断言逐字：① 480 条导出 `success === true` 且 `report.export500.ms ≤ 2000`；② 报告头逐字含 `阅读进度：第 1 / 304 页；共 480 条（摘录 240 · AI 结论 240）。`（`生成时间` 按既有 `STAMP_RE` 归一化）；③ 报告内 `## ` 章块数 = 30 且每块逐字 `（16 条）`）；连续两次运行结果相同。
2. 【性能】N/A（该路径的读数由【烟测-主进程】给出；`[perf] JSON` 内不含 ⑥）。
3. 【走查】登记取舍：⑥ 不在离屏面（§0.0 第 3 条），dev 档必须原样登记这条口径差异（含「不含 IPC 往返与提示渲染」）。

**文件白名单条目**：`pix/scripts/smoke-notes.mjs`（修改）。

### N105-7 ⑦ 资料库树徽标（41 篇文档）

**计时起止点**：**复位** = 重新挂载工作区（挂载时刻 `.tree-row` = 0；`leftTab` 默认 `library`（`WorkspacePage.vue:41`）⇒ 树在屏）；起点 = 首页项目卡片的 `click()`（同段取 `t0`）；终点 = `.tree-row` 计数 = **41** 且 `big-book.pdf` 行的 `.row-notes` 文本逐字 `480 条` **且**该行 `getBoundingClientRect().height > 0`；防空 = `data.rowsBefore` **= 0**（硬断言）。K=3 median，相对 ≤ 1.5×B。

**验收判据**

1. 【性能】`tree.badge.ms` ≤ 1.5×B。
2. 【性能】恒等断言：`tree.rows === 41`；`tree.badge.bigbook` 文本逐字 `480 条` 且 `title` 逐字 `摘录 240 条 · AI 结论 240 条`（后者覆盖 `LibraryPanel.vue:178-179` 的既有逐字格式）。
3. 【性能】复位纪律：每轮采样走「重新挂载工作区」（`leftTab` 回到默认 `library`、笔记搜索/排序为初值）；**不得**把起点写成「点 `.pill-tab[data-tab="library"]`」——同标签点击被 `selectLeftTab` 直接 `return`（`WorkspacePage.vue:213-215`），而 41 行树与徽标在该时刻已在 DOM（`LibraryPanel.vue:36` / `:49` / `:164-179` 常挂载 + computed），终点在动作前即成立（评审 MF-02）。

**文件白名单条目**：`pix/scripts/perf-probe.mjs`（新建）。

## 3. N106 阈值与回归护栏（3 子条）

### N106-1 阈值冻结与选择理由

**逐字冻结**：§0.5 全表（27 条：17 条时序 + 10 条恒等；**本轮脚本内实现 24 条 = 时序 16 + 恒等 8**，其余 3 条由 `smoke-notes.mjs` 的 `perf-report-export` 组承担）。

**验收判据**

1. 【走查】阈值只落两处：`grep -c "3000\|20000\|2000\|1000" pix/scripts/perf-probe.mjs` ≥ 4（绝对阈值以常量声明，dev 档登记常量名与行号）；`grep -c "1.5\|2.0" pix/scripts/perf-probe.mjs` ≥ 2（相对容差常量）。
2. 【性能】`[perf] verdict` 行的 `kind` 取值只能是 `absolute` / `relative` / `invariant`；全档 27 条的分布逐字 = 绝对 6 / 相对 11 / 恒等 10，**perf JSON 内 = 绝对 5 / 相对 11 / 恒等 8（合计 24）**（`metrics[].kind` 的三类计数由 dev 档登记）。
3. 【走查】相对容差不写入基线文件：基线 JSON 内只有 `metrics[].value`，不含 `limit`（limits 来自脚本常量）⇒ 防止「改基线即放水」。

**文件白名单条目**：`pix/scripts/perf-probe.mjs`（新建）。

### N106-2 抖动抑制与误报纪律

**逐字冻结**：§0.4 的「预热」「采样与统计」「心跳」三行 + §0.5 的统计列。

**验收判据**

1. 【性能】同一命令连跑两次（无代码改动）：两次的 `metrics[].verdict` 全部相同，且相对指标两次读数之比 ≤ **1.5**（dev 档登记两次的 `[perf] JSON` 摘要与原样读数）；出现比值 > 1.5 的指标 ⇒ 该指标的容差被判为「不足」，dev 档必须登记并按 §0.0 第 5 条的原则申请改判（不得静默放宽）。
2. 【性能】预热确实执行：`data` 内每条指标的 `samples.length === K`（`search.cold.ms` = 1），且脚本 stdout 含 **24** 条 `[perf] metric` 行（预热轮不打印）。
3. 【走查】心跳不是 0：`paging.stall.max.ms` / `search.scan.stall.max.ms` / `map.scroll.stall.max.ms` 三条在正常运行时必须 > 0（tick < 2 次即 fail，不得记 0）。

**文件白名单条目**：`pix/scripts/perf-probe.mjs`（新建）。

### N106-3 超标输出格式与判据落点

**逐字冻结**：§0.6 的「超标行」「机器可读」「退出码」「默认模式」「基线缺失语义」五行。

**验收判据**

1. 【性能】N104-4 判据 2 的越界对照实验（构造基线）⇒ stdout 恰含一行 `[perf] FAIL <id> value=<v> limit=<l> kind=absolute baseline=<b> samples=[…]`（键序与空格逐字），且 JSON 的该条 `verdict === "fail"`、`summary.fail ≥ 1`、`ok === false`。
2. 【性能】报告模式不因越界失败：命令 3 在 `open.bigdoc.ms` 超过构造阈值时仍退出 **0**（只打印 `verdict fail`）——默认只报告的语义不得被打破。
3. 【走查】`skip` 语义：`--baseline` 缺某相对指标 ⇒ `[perf] warn no-baseline <id>` + 该条 `verdict: "skip"`、退出码不变；§0.9 要求验收运行的 `skip` 计数 = 0。

**文件白名单条目**：`pix/scripts/perf-probe.mjs`（新建）。

## 4. N107 热点修复（4 子条）

### N107-1 热点判定（什么必须修、什么不修）

**逐字冻结（判据，写死）**：一条关键路径被判定为**热点**，当且仅当满足以下任一条 —— ① 该路径的绝对阈值越界（§0.5 的 6 条之一）；② 该路径的相对指标超出容差（§0.5 的 11 条之一）；③ 该路径的心跳 `stall.max.ms > 1000`；④ 单次用户可见操作 > 1000ms 且**没有**进行中反馈（PRD §7.4）。**不满足任一条 ⇒ 不修**（登记为「实测未见热点」）。

**验收判据**

1. 【性能】dev 档必须给出「热点清单」：`[perf] JSON` 的每条 `verdict === "fail"` 指标一行（id / value / limit / samples），以及该清单与 §0.0 第 5 条的映射。
2. 【走查】零热点清单也必须登记（写明【性能】24 条 + 【烟测-主进程】3 条全 pass），不得省略该节。
3. 【走查】每条修复必须绑定一条 measurable 指标（N107-3），不得出现「顺手优化」。
4. 【走查】**白名单外的热点**（评审 MF-12）：若实测 `fail` 指标的唯一落点在 §8.2 未授权的文件（`PdfSearchPanel.vue`（③）/ `LibraryPanel.vue`（⑦）/ 其余「不改（登记为不动）」清单内文件），处置口径 = **登记为阻塞**：dev 档写明「指标 id + 落点文件 + 未修理由」，上报负责人裁决；**不得**自行扩权修改（§8.2 的条件性白名单是封闭集合，本轮不因实测而临时扩权）。

**文件白名单条目**：（无；本子条只产出登记）。

### N107-2 允许的修复手段（白名单，写死）

**逐字冻结**：本题只允许以下四类**局部**改动，且每类都必须保持既有输出（DOM 文本、类名、几何语义、数据结果）逐字不变：

| 手段 | 允许的含义 | 既有范式（可参照） |
| --- | --- | --- |
| memo | 用 `computed` 的依赖收敛，把只在 N 个依赖变化时才需要重算的派生从「每次视图变化都重算」改为「依赖变化才重算」 | R9 `KnowledgeMap.noteCounts`（`:50-52`）、R14 `LibraryPanel.noteCountMap`（`:49`） |
| 索引化 | 用 `Map` / `Set` / 前缀和把「逐条查找」改为 O(1) 查询 | `countNotesByDocument`（`notes-path.ts:73`）、`countNotesByChapter`（`outline-notes.ts:86`） |
| 减少重复计算 | 同一份数据在同一次渲染内被算两次 ⇒ 收敛为一次（含把两个 computed 合并为一个、把同一遍历的结果缓存在组件局部） | R10 `visibleCount`（`notes-store.ts:163`） |
| 按需渲染 | 把「一次性构建全部 DOM」改为「先构建可见部分」——**不得改 UI 语义**（行数、行序、可点击目标、文案、类名一律不变） | `PdfViewer.observePages`（`:301`，几何占位 + IntersectionObserver 按需渲染） |

**禁止（写死）**：虚拟滚动库（`vue-virtual-scroller` 等）；Web Worker 迁移（含把 pdf.js worker 之外的逻辑搬出主线程）；磁盘缓存层（新增索引文件 / `indexeddb` / `localStorage` 缓存）；大重构（跨组件搬移职责、改 store 形状、改 IPC）；改 `packages/*`；改依赖或 lockfile；改 UI 文案 / 类名 / 结构 / 变量表；把「看起来更快」当证据；为通过阈值而放宽阈值或删断言。

**验收判据**

1. 【走查】`git diff --stat` 的行数上限：**仅对 §8.2 条件性白名单内的产品文件**（`pix/src/**`）单个 ≤ **80** 行（超过即视为「大重构」，dev 档必须登记理由并由评审裁定）；`pix/scripts/*.mjs` **不套用该上限**，但 dev 档必须逐文件登记「搬移块行数 + 净新增行数」（§8.1 行 4 / 5 给出白名单形态与既定搬移量）——评审 MF-10：`ui-shot.mjs` 的搬移块（实读 965 行：`:137-139` 3 行 + `:149-227` 79 行 + `:438-1320` 883 行）与守卫改造本来就不可能 ≤ 80 行。`git diff` 中不出现新依赖、不出现 `packages/**`。
2. 【走查】零语义漂移：`grep -rn "new Map(\|new Set(" pix/src/renderer | wc -l` 与基线的差值须与 dev 档登记的索引化点一一对应（新增点数量 = 登记数量）。
3. 【走查】未使用的手段零 diff：dev 档必须给出「手段 → 文件 → 行数」表，未使用的白名单手段对应文件 `git diff` 为空。

**文件白名单条目**：见 §8 的条件性白名单（8 个文件，均需实测热点证据）。

### N107-3 每条修复的改前/改后证据（硬要求）

**逐字冻结**：每条热点修复必须给出下表四行（缺任一行即视为未完成）：

| 项 | 要求 |
| --- | --- |
| 热点 id | §0.5 表中的指标 id（一条修复可对应多条，逐条列出） |
| 改前读数 | 命令 1（或命令 2 前的同一命令）的 `[perf] metric <id>` 原样行 + `[perf] JSON` 内 `samples` 全量 |
| 改后读数 | 改后同一条命令的同一行 + `samples` 全量；相对指标必须同时给出改前基线值与比值 |
| 差值归因 | 一句技术归因（哪个派生/遍历被消除、为什么等价）；若差异 < 10% 必须写「无显著差异，登记不修」 |

**验收判据**

1. 【性能】每条修复的改后读数必须**同时**满足：该指标不再 `fail`；同一运行内其余【性能】指标（24 条）的 `verdict` 不因该修复转 `fail`（无此消彼长）。
2. 【走查】dev 档的读数表逐条对应到真实运行的 stdout 片段（原样粘贴，不得手写数值）。
3. 【离屏】若修复触及 UI 面（`pix/src/renderer/**`）：必须复跑一次离屏，且既有 186 张 / 264 条 / 74 种 label 零缺失 + `r19-1` 全绿；**不允许**「只跑 perf-probe 就宣布安全」。

**文件白名单条目**：见 §8 的条件性白名单。

### N107-4 候选热点（代码走查所得，**待实测判定，不预先承诺修复**）

> 下表仅用于把「实测可能落在哪」写进档件，便于设计与评审准备；**是否修复由 N107-1 的实测判据决定**，每条都必须在 dev 档给出保留或修复的结论。

| # | 位置（实读） | 机制 | 预期的可判指标 |
| --- | --- | --- | --- |
| C1 | `NotesPanel.vue:815`（`v-for note` 全量渲染）+ `notes-store.ts:155-161`（`groups` 每次视图变化重算） | 520 行 × 每行十余个节点一次性构建；搜索每键全量 filter + sort | ④ `notes.firstscreen.ms` / `notes.search.key.max.ms` |
| C2 | `notes-store.ts:168-173`（`currentDocNoteCount` 再跑一次 `groupNotesByDocument`） | 同一份 `notes` 在同一次渲染里被分组两次（第二次只需计数） | ④（与 C1 合并判定） |
| C3 | `PdfViewer.vue:197-209`（`measurePages` 对 304 页串行 `getPage` + `getViewport`） | 打开文档的首屏路径上串行 304 次 await | ① `open.bigdoc.ms` |
| C4 | `PdfViewer.vue:833-841`（`anchorExcerpts` 每次重画全量 `filter` + `sort`，480 条） | 每次翻页/缩放/文字层就绪都跑一次全量过滤；`sortNotesForContext` 含 4 键比较 | ② `paging.render.*`（当前页摘录命中时的重画） |
| C5 | `KnowledgeMap.vue:53-55`（`rows` 在展开态变化时整表重建 330 行） | 折叠/展开触发 `flattenVisible` 全量重算 + `groups` 重建 | ⑤ `map.expand.ms` |
| C6 | `utils/notes-view.ts:55-59`（`applyViewToGroups` 每键全量 filter + sort） | 键入路径的每键成本与 520 条成正比 | ④ `notes.search.key.max.ms` |

**已登记为「非候选」（实测日前不改）**：`PdfSearchPanel.runSearch` 的逐页 `await idleYield()`（`PdfSearchPanel.vue:132-175`）与 `textCache`（`:85`）——既有实现已是「按需 + 让出 + 缓存」；`buildChapterRanges` 的内层循环首个更大页码即 `break`（`outline-notes.ts:57-70`）；`countNotesByChapter` 的前缀和（`:86-124`）；`countNotesByDocument` / `countNotesByPage` 的单遍聚合（`notes-path.ts:73` / `:93`）；`updateCurrentPage` 的二分定位（`PdfViewer.vue:327-357`）；`LibraryPanel.rowsWithBadge` 的 memo（`:49-56`）。

**验收判据**

1. 【性能】dev 档必须对 C1–C6 逐条给出结论：`热点（修）` 或 `非热点（不修，附实测读数）`；结论必须能对应到 `[perf] metric` 行。
2. 【走查】不得出现「未实测即修复」的条目（`git diff` 中每个被改文件都能对应到一条 fail 指标或 §0.4 的④判据）。

**文件白名单条目**：见 §8 的条件性白名单。

## 5. N108 验证基建加固（4 子条）

### N108-1 守卫实现（逐字冻结）

**逐字冻结**：§0.8 全表（修法 / 就绪谓词 / 尝试次数与总预算 / 失败语义 / 定义位移）。

**验收判据**

1. 【走查】定义位移：`grep -n "const installStageScrollWatch\|const stageScrollWatchProbe\|const waitStageScrollQuiet\|const selectPageSpan" pix/scripts/ui-shot.mjs` 的输出顺序逐字为 `installStageScrollWatch` < `stageScrollWatchProbe` < `waitStageScrollQuiet` < `selectPageSpan`（同一闭包内，位移后仍只有 1 处定义）。
2. 【走查】既有 DOM 段逐字不变：`git diff -U0 -- pix/scripts/ui-shot.mjs` 中 `selectPageSpan` 的 6 行选区段（`document.createRange` / `selectNodeContents` / `removeAllRanges` / `addRange` / `new Event("selectionchange")`）不作为 `+` / `-` 行出现。
3. 【走查】断言强度只增不减：`grep -c "选择前置失败" pix/scripts/ui-shot.mjs` ≥ 1；`grep -c "摘录浮层" pix/scripts/ui-shot.mjs` 不减（既有 6 处文案不动，含 `:1465` / `:1512` / `:1540` / `:1850` / `:9552` 与错误文案）。
4. 【离屏】既有 186 张 / 264 条 / 74 种 label 零缺失（守卫是所有选区相位的公共前置，任何语义漂移都会在既有 5 组 R16 / 5 组 R17 的选区断言上暴露）。

**文件白名单条目**：`pix/scripts/ui-shot.mjs`（修改）。

### N108-2 注入式复现（确定性判据）

**逐字冻结**：场景 `r19-1` 相位 `late-scroll-recovered`：① 前置 = `restoreStandardSeed()` + `enterWorkspace(LIBRARY_NAME)` + `openRow("sample-paper.pdf")` + `waitPdfLoaded()` + `waitPage(1, 3)`，并先断言 `.pdf-scroll` 的可滚动余量 `scrollHeight - clientHeight - scrollTop ≥ R19_GUARD_INJECT_DELTA`（不足即判红：否则 `scrollTop` 赋值被浏览器钳制，注入量不可信）；② **基线快照（必须先于注入）** = `await installStageScrollWatch()` + `data.baselineCount = (await stageScrollWatchProbe()).count`——`waitStageScrollQuiet()` 的 `absorbed` 是相对**该次调用**的 `from` 的差值（`ui-shot.mjs:5734-5758`），注入落在基线之前时会读到 0，故本相位不用 `quiet.absorbed` 作防空证据；③ 注入 = 在调用守卫**之前**同一个 `js()` 段里挂 `setTimeout(() => { const el = document.querySelector(".pdf-scroll"); const before = el.scrollTop; el.scrollTop = before + R19_GUARD_INJECT_DELTA; window.__pixR19Injected = { count: (window.__pixR19Injected ? window.__pixR19Injected.count : 0) + 1, before, after: el.scrollTop, at: Date.now() }; }, 60)`（一次性迟到滚动，目标在 `.reader-stage` 子树内 ⇒ 按既有语义隐藏浮层；60ms 落在守卫首轮静默窗口内）；注入增量冻结为命名常量 `R19_GUARD_INJECT_DELTA = 160`（`grep -c "R19_GUARD_INJECT_DELTA" pix/scripts/ui-shot.mjs` = **2**：定义 1 + 使用 1）；④ 调用守卫 `selectPageSpan(1)`；⑤ 记录 = 守卫返回的 `attempts` 与轨迹、注入读数（`count` / `before` / `after` / `scrollTopDelta = after - before` / `at`）、守卫结束后的一次 `stageScrollWatchProbe()`（`data.watchCountAfter`）与 `waitStageScrollQuiet()`（`waitedMs`）、`quickAskStateProbe()` + `selectionProbe()` + `pageSpanText(1)`，以及 `data.branch`（`attempts === 1` ⇒ `absorbed-first-window`，否则 `retried`）。

| 失败即红的断言 | 数据字段 |
| --- | --- |
| ① 守卫**成功返回**（未抛错）；② 注入确实发生且执行**恰好一次**：`injected.count === 1` 且 `injected.scrollTopDelta === 160`（`before` / `after` 原样登记；被钳制即判红，不得静默通过）；③ 注入被吸收：`watchCountAfter - baselineCount ≥ 1`（对**基线快照**取差；**不得**用 `quiet.absorbed`，理由见「逐字冻结」②）；④ 守卫 `attempts ≥ 1`，`data` 内同时登记 `injected.at`、`quiet.waitedMs` 与 `branch`（`absorbed-first-window` / `retried`）；⑤ 就绪谓词 (a)(b)(c) 全成立：`state.display !== "none"` 且 `selection.collapsed === false` 且 `selection.anchorInStage === true` 且 `selection.text` 逐字等于 `spanText`；⑥ `warnCount()` 增量 0 | `{ phase, baselineCount, injected, watchCountAfter, attempts, branch, quiet, state, selection, spanText, warnDelta }` |

**验收判据**

1. 【离屏】`r19-selection-guard` 组第 1 条 record 全绿：`label` 逐字 `r19-selection-guard`（**两条 record 共用该 label**，故 label 配额只 +1：74 → 75，见 §0.2#7 / §0.9 / N109-1 判据 2）且 `data.phase` 逐字 `late-scroll-recovered`（评审 MF-07）。
2. 【离屏】该条 record 的 `data.injected.scrollTopDelta === 160`（原样登记 `before` / `after`）且 `data.state.display !== "none"`（就绪谓词 (a) 的现场读数；原措辞里的 `data.after.ready` 字段不存在，已删除——评审 MF-05）。
3. 【走查】注入唯一且只影响本场景：`grep -c "R19_GUARD_INJECT_DELTA" pix/scripts/ui-shot.mjs` = **2**；`data.injected` 逐字 `{ count: 1, before: <px>, after: <px>, scrollTopDelta: 160, at: <epoch ms> }`（dev 档登记该 record 的原样 `data`）。
4. 【离屏】**分支覆盖登记**（评审 MF-05）：`data.branch` 逐字登记所走分支；`absorbed-first-window` 是**唯一被确定性覆盖**的分支；若实测落到 `retried`，原样登记该次轨迹即可（不额外要求）。「重试分支不被确定性覆盖」必须写进 dev 档与 §0.10 的残余风险。

**文件白名单条目**：`pix/scripts/ui-shot.mjs`（修改），附带 `SEL` 追加 1 项（`readerStage`）。

### N108-3 硬失败反例（不得降级为通过）

**逐字冻结**：场景 `r19-1` 相位 `precondition-hard-fail`：对**不存在的页**调用守卫（`selectPageSpan(999)`）⇒ 守卫必须**抛错**；场景用 `try/catch` 捕获并把「是否抛错」与错误文案写入 `data`（不得让该错误中断整轮）。

| 失败即红的断言 | 数据字段 |
| --- | --- |
| ① 抛错（`threw === true`）；② 错误文案包含 `第 999 页文本层` 或 `选择前置失败`（两者取其一逐字在场）；③ 抛出后 `.quick-ask` 不得处于可见态（`display === "none"` 或元素不在 DOM）；④ `warnCount()` 增量 0 | `{ phase, threw, message, quickAskDisplay, warnDelta }` |

**验收判据**

1. 【离屏】`r19-selection-guard` 组第 2 条 record 全绿（`phase` 逐字 `precondition-hard-fail`）。
2. 【走查】守卫内不存在任何吞错分支：`grep -c "catch" pix/scripts/ui-shot.mjs` 的增量恰为 **1**（仅 `r19-1` 相位 `precondition-hard-fail` 的**场景级**捕获，用于把抛错事实写成 `data`）；`selectPageSpan` 定义体内的 `catch` 计数 = **0**（守卫不得捕获、不得返回 `ok:false`）。
3. 【走查】既有 4 处显式 `selectPageSpan` 调用点（`:11330` / `:11463` / `:11491` / `:11570`；其前置静默调用分别在上一行 `:11329` / `:11462` / `:11490` / `:11569`）保留原样（不得删除，不得改为旁路）。

**文件白名单条目**：`pix/scripts/ui-shot.mjs`（修改）。

### N108-4 flake 登记与销账

**逐字冻结**：§0.10 全表（编号与出处 / 现象 / 频率 / 每次代价 / 根因 / 处置 / 验收口径 / 残余风险）。

**验收判据**

1. 【走查】档件登记齐备：dev 档含 §0.10 的六项（现象原样错误文案、最近三轮命中记录、根因 `PdfSelectionQuickAsk.vue:141-151` + `:190`、处置、可复跑判据编号、残余风险）。
2. 【离屏】回归证据：验收运行的 `MANIFEST.json.failure === null` 且 `r19-1` 两条 record 全绿；dev 档登记「本次运行是否再次命中 S-SD-02」（命中即说明注入式复现覆盖的形态与真实形态不一致，必须登记并加判据）。
3. 【走查】旧处置退役：`grep -rn "S-SD-02" docs/pm/R19-*.md` ≥ 1，且本轮之后不得再以「重跑一次」作为该类 flake 的唯一处置（dev 档写明）。

**文件白名单条目**：`pix/scripts/ui-shot.mjs`（修改）、`docs/pm/R19-*.md`（新建）。

## 6. N109 回归（4 子条）

### N109-1 既有离屏面零缺失

**逐字冻结**：§0.9 的「零缺失参照基线」「动工前自建基线」「零缺失判据」三行。

**验收判据**

1. 【离屏】动工前基线：`PIX_SHOT_ROOT=<临时目录>/pix-v06-r19-base` 一次运行 ⇒ 退出码 0、`failure === null`、**186** 张 / **264** 条 / **74** 种 label（与参照基线逐项相等；若有差异必须在 dev 档登记为「动工前已存在的偏差」并给出原样读数）。
2. 【离屏】验收运行：`<临时目录>/pix-v06-r19-after` ⇒ 退出码 0、`failure === null`、**187** 张 / **266** 条 / **75** 种 label；基线 186 张 name 集合 ⊆ 验收集合；基线 74 种 label 集合 ⊆ 验收集合；新增 label `r19-selection-guard` 条数 = **2**。
3. 【走查】零改写：`git diff -U0 -- pix/scripts/ui-shot.mjs` 中既有 74 个 `SEL` 键、既有截图名、既有 label 名、既有 `record` 数据字段不作为 `+` / `-` 行出现（唯一允许的既有行改动 = §0.8 的位移行，逐字登记）。

**文件白名单条目**：`pix/scripts/ui-shot.mjs`（修改）。

### N109-2 工程门与烟测

**逐字冻结**：§0.9 的「烟测回归」行 + 判定工具表的【check】行。

**验收判据**

1. 【check】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ 退出码 0（无 `any`、无内联动态 import、全部顶层 import）。
2. 【烟测-渲染】`node scripts/smoke-view.mjs` ⇒ 退出码 0、末行逐字 `通过 74 / 失败 0`；连续两次结果相同；`git diff pix/scripts/smoke-view.mjs` 为空。
3. 【烟测-主进程】`node scripts/smoke-notes.mjs` ⇒ 退出码 0、末行逐字 `通过 74 / 失败 0`；连续两次结果相同；既有 10 组 71 条零改写（`git diff -U0` 的新增行只出现在 `runPerfReportExport` 内与 `main()` 的一行调用）。

**文件白名单条目**：`pix/scripts/smoke-notes.mjs`（修改）。

### N109-3 时长红线（大夹具与探针不得拖慢既有单轮）

**逐字冻结**：§0.9 的「时长红线」行（≤ 基线 × 1.10）。

**验收判据**

1. 【离屏】两次运行的 wall-clock 用同一条命令 + `time` 记录（baseline 与 after），dev 档原样给出两次数值与比值；比值 > 1.10 ⇒ 必须给出归因并由评审裁定，不得静默接受。**归因预案（评审 §1.5「附带代价」）**：守卫给 21 处 `selectPageSpan` 调用各加静默前置，最短路径 ≈ 7 × 60ms sleep + `quietMs = 400` ≥ ≈420ms ⇒ 单轮至少 +≈8.8s；3–5 分钟基线下的 +10% = 18–30s，预计可容纳，但若某次调用走满 20s 上限则必然顶穿，必须按此归因写明。
2. 【走查】夹具面零交叉：`writeFixtures()`（`ui-shot.mjs:400-432`）不生成 `big-book.pdf` / 520 条笔记 / 40 篇小文档（`grep -c "big-book\|doc-01" pix/scripts/ui-shot.mjs` = **0**）；`perf-probe.mjs` 不被 ui-shot 导入（§0.7）。
3. 【性能】探针自身预算：单轮总耗时 ≤ **240s**（§0.4 的总预算），dev 档登记实测总耗时。

**文件白名单条目**：`pix/scripts/ui-shot.mjs`（修改）、`pix/scripts/perf-probe.mjs`（新建）。

### N109-4 配额、条件性白名单与零残留

**逐字冻结**：§0.9 的「新增配额」行 + §8 的白名单。

**验收判据**

1. 【走查】配额逐项：截图 **+1**、record **+2**、label **+1**、烟测-主进程 **+3**、烟测-渲染 **0**；`node -e` 读 `MEASUREMENTS.json` 复读 label 去重计数 = **75**。
2. 【走查】条件性白名单零越界：§8 的条件性条目中未使用的文件 `git diff` 为空；使用到的每条都必须在 dev 档登记「对应 fail 指标 id + 改前/改后读数」。
3. 【走查】零残留与零新面：`git status --short` 只出现 §8 白名单内的文件；仓库内无临时脚本 / 无临时产物 / 无调试日志（PRD §5.10）；`pix/package.json` / `package-lock.json` / `packages/**` / `pix/build/**` / `pix/tsconfig*.json` / `pix/vite.config.ts` / `pix/src/main/**`（除条件性条目）/ `pix/src/renderer/**`（除条件性条目）零 diff。

**文件白名单条目**：见 §8。

## 7. 反需求（本轮明确不做）

1. **不做虚拟滚动库**：不引入 `vue-virtual-scroller` / `vue-virtual-scroll-grid` 等；不手写「回收复用行」的滚动虚拟化（N107-2 的「按需渲染」只允许「先构建可见部分且不改变行数/行序/可点击目标」的形态）。
2. **不做 Web Worker 迁移**：不把笔记分组、排序、报告拼接、地图派生搬到 worker；不改 pdf.js worker 配置。
3. **不做磁盘缓存层**：不新增索引文件 / `indexeddb` / `localStorage` 缓存；`.pix-read/` 内不得新增文件类型（`notes.json` / `notes.md` / `reports/**` / `reader-state.json` 之外零新增）。
4. **不做重构**：不改 store 形状、不改 IPC、不跨组件搬移职责、不改 `PdfViewer` 的渲染策略（`rootMargin` / 释放窗口 / 占位几何逐字不变）；**§8.2 条件性白名单内的产品文件**单文件改动量 ≤ 80 行（N107-2 判据 1）；`pix/scripts/*.mjs` 按 §8.1 的逐文件允许清单登记行数（含搬移块），不套用 80 行上限（评审 MF-10）。
5. **不改 `packages/*`、不改依赖、不改 lockfile、不改 electron-builder 配置、不改 `pix/package.json`**：不新增 npm script（命令直接调 `./node_modules/.bin/electron`）。
6. **不做「看起来更快」的无判据优化**：任何改动必须绑定 §0.5 的一条指标 id 与改前/改后读数（N107-3）；无 fail 指标 ⇒ 不修。
7. **不改既有冻结字面**：74 个既有 `SEL` 键、既有场景/截图/label、`notes.json` 与 `reader-state.json` 格式、`.notes-*` / `.pdf-*` / `.map-*` / `.tree-row` / `.row-notes` / `.pill-*` 的类名与文案、报告格式、R16 高亮与 R18 会话锚点的既有语义。
8. **不降低断言强度来换绿**：不得删除/跳过既有断言（**唯一允许的既有行改动 = §0.8 的三处 helper 定义位移**）；不得把守卫的失败降级为 `ok:false` 让调用方忽略；不得因阈值难达标而放宽 §0.5 的阈值（改判只能走 N106-2 判据 1 的登记流程）。
9. **不把大夹具塞进既有取证**：`writeFixtures()` 零新增（304 页 PDF / 520 条笔记 / 40 篇小文档只存在于 `perf-probe.mjs` 的临时根）。
10. **不做跨轮基线存储**：不把基线 JSON 提交进仓库（跨轮对比以 dev 档记录的读数为准）。
11. **不动产品 UI**：本轮不得新增/删除/改文案任何用户可见元素（包括「加载中」提示、进度文案）；不得为性能问题新增 UI 反馈。
12. **不做死代码**：不为「将来可能的规模」预置开关（例如可配置的 K、可配置的阈值、可配置的路径）；K / 预热次数 / 阈值全部写死为常量。

## 8. 文件白名单（逐文件 + 改动点）

### 8.1 固定白名单（9 个）

| # | 文件 | 动作 | 对应需求 | 改动点（不得越界） |
| --- | --- | --- | --- | --- |
| 1 | `pix/scripts/lib/pdf-fixture.mjs` | 新建 | N104-3 | 从 `ui-shot.mjs:137-139` 与 `:149-227` **逐字搬移** `escapePdfText` / `buildPdf` 并 `export`；不新增未使用者 |
| 2 | `pix/scripts/lib/stub-preload.mjs` | 新建 | N104-3 | 从 `ui-shot.mjs:438-1320` 搬移 `buildStub(config)`；模板差异只允许 §0.7 的 5 处（tree/treeB/archive 参数化 + 头注释）；既有 API 面方法数、类名、错误文案、控制口名逐字不变 |
| 3 | `pix/scripts/perf-probe.mjs` | 新建 | N104-1…N104-5 / N105-1…N105-7 / N106-1…N106-3 / N107-3 | 大夹具声明表与写入（304 页 PDF / 330 节点大纲 / 520 条笔记 / 40 篇小文档）、窗口与 vite 引导（端口 5200、参数与 ui-shot 同款）、24 条指标的测量与判定（另 3 条在 `smoke-notes.mjs`）、基线读写、stdout 输出与三态退出码、自清理与安全守卫；**不得**新增 npm script、不得写仓库、不得引入依赖 |
| 4 | `pix/scripts/ui-shot.mjs` | 修改 | N104-3 / N108-1…N108-4 / N109-1 | ① `buildPdf` / `escapePdfText` / `buildStub` 改为顶层 import 并调整调用点（`writeFixtures` 与 `main` 各 1 处）；② `SEL` **追加 1 项** `readerStage: ".reader-stage"`（**74 → 75**）；③ §0.8 的三处 helper 定义**纯位移**（`installStageScrollWatch` / `stageScrollWatchProbe` / `waitStageScrollQuiet`）与 `selectPageSpan` 的守卫化；④ 新增场景 `r19-1`（组 `r19-selection-guard`，2 条 record，1 张截图 `r19-guard-recovered.png`），挂在 `runReaderStateScenarios` 末段（既有 `restoreStandardSeed()` 与最后一个 r18 场景之后、函数收口 `}` 之前）；**零删除零改写**：既有 74 个 `SEL` 键、既有场景函数体、既有 helper 语义、既有截图与 label、启动守卫与结束自检。**改动量登记**（不套用 80 行上限，评审 MF-10）：搬出 965 行（`:137-139` 3 行 + `:149-227` 79 行 + `:438-1320` 883 行）；净新增（`SEL` +1、位移块、守卫改造、`r19-1` 场景）由 dev 档逐块登记 |
| 5 | `pix/scripts/smoke-notes.mjs` | 修改 | N105-6 / N109-2 | 新增 `runPerfReportExport()`（组名 `perf-report-export`，3 条断言：#1 480 条导出 ≤ 2000ms 且 `success === true`；#2 报告头逐字含 `阅读进度：第 1 / 304 页；共 480 条（摘录 240 · AI 结论 240）。`；#3 `## ` 章块数 = 30 且每块 `（16 条）`）+ `main()` 内的一行调用；**零改动**：既有 10 组 71 条、`files` / `required` / `allowed` / 编译选项 / 自清理协议。**改动量登记**（不套用 80 行上限）：`runPerfReportExport()` 的净新增行数由 dev 档登记 |
| 6 | `docs/pm/R19-req.md` | 新建 | — | 本档 |
| 7 | `docs/pm/R19-review.md` | 新建 | — | 需求评审档（评审 must-fix 与处置） |
| 8 | `docs/pm/R19-design.md` | 新建 | — | 设计档（含定稿修订） |
| 9 | `docs/pm/R19-dev.md` | 新建 | — | 开发档（改动清单 / 原样输出 / 逐条自评 / 偏差表 / 未验证事项 / 热点结论 / 改前改后读数） |

### 8.2 条件性白名单（8 个，**仅在实测热点落在该文件时才允许修改**；每条使用必须附「fail 指标 id + 改前/改后读数」）

| # | 文件 | 动作 | 允许的改动点（不得越界） |
| --- | --- | --- | --- |
| 10 | `pix/src/renderer/components/workspace/NotesPanel.vue` | 条件修改 | 只允许 memo / 减少重复计算 / 按需渲染（**不得**改模板行数、行序、类名、文案、行内结构，不得引入虚拟滚动） |
| 11 | `pix/src/renderer/components/workspace/PdfViewer.vue` | 条件修改 | 只允许减少重复计算（如 `anchorExcerpts` 的按页预索引）；**不得**改 `rootMargin` / 释放窗口 / 占位几何（逐字不变），也不得改 `paintNoteAnchor` / `waitForAnchorLayer` / `onScroll` 的既有语义（评审 §1.6：原「按需渲染的既有形态内调整（… 逐字不变）」自相矛盾，已删除该措辞；按需渲染的手段限定见 N107-2 表） |
| 12 | `pix/src/renderer/components/workspace/KnowledgeMap.vue` | 条件修改 | 只允许 memo 与索引化（`rows` / `groups` 的重算收敛）；行数、行序、`--indent`、`--branch`、徽标语义不变 |
| 13 | `pix/src/renderer/stores/notes-store.ts` | 条件修改 | 只允许减少重复计算（`currentDocNoteCount` 与 `groups` 共用一次分组）、索引化；`groups` / `visibleCount` / `activeQuery` 的**结果**逐字不变，搜索/排序语义与 `applyViewToGroups` 的调用关系不变 |
| 14 | `pix/src/renderer/utils/notes-view.ts` | 条件修改 | 只允许在**不改变函数签名与返回语义**的前提下减少重复遍历（例如预归一化查询）；`matchesSearch` / `sortNotesForView` / `applyViewToGroups` 的纯函数语义与逐条结果不变 |
| 15 | `pix/src/renderer/utils/notes-path.ts` | 条件修改 | 只允许索引化 / 单遍聚合的既有语义内优化；`countNotesByDocument` / `countNotesByPage` / `groupNotesByDocument` 的输出逐字不变（组顺序、组内顺序、空组丢弃） |
| 16 | `pix/src/renderer/utils/outline-notes.ts` | 条件修改 | 只允许 `buildChapterRanges` 的查找索引化；`ChapterRange`（`start` / `end` / `label`）与 `countNotesByChapter` 的输出逐字不变 |
| 17 | `pix/src/main/notes-store.ts` | 条件修改 | 只允许⑥（报告导出）相关路径的索引化 / 减少重复计算；报告格式、分组规则、排序三键、原子写协议、`isReaderNote` 白名单逐字不变 |

**不改（登记为不动）**：`pix/package.json`、`package-lock.json`、`pix/build/**`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/src/main/{ipc-handlers,preload,session-bridge,pix-paths}.ts`、`pix/src/renderer/stores/{reader-store,reader-state-store,project-store,session-store,settings-store,auth-store}.ts`、`pix/src/renderer/utils/{reading-context,page-anchor,session-title,shortcut-help,quick-ask-templates,markdown,image-capture,note-capture}.ts`、`pix/src/renderer/pages/WorkspacePage.vue`、`pix/src/renderer/components/workspace/{ReaderPanel,PdfSearchPanel,LibraryPanel,ChatPanel,PdfSelectionQuickAsk,ShortcutOverview}.vue`、`pix/src/renderer/assets/styles/**`、`pix/scripts/{smoke-view,assert-main-esm,dev-electron}.mjs`、`pix/resources/**`。

**白名单外热点的处置（尾注，评审 MF-12）**：③（`PdfSearchPanel.vue`）与 ⑦（`LibraryPanel.vue`）在「不改」清单内。若实测热点唯一落在未授权文件 ⇒ 按 N107-1 判据 4 **登记为阻塞 + 上报负责人**，不得自行扩权；本轮不因实测结果临时扩白名单。

**范围外（任何情况下不动）**：`packages/**`、`docs/pm/**` 的历史档件（R6–R18）、`.gitignore`、`README.md`、`.pix-read/notes.json` 与其写入链。

## 9. 风险 Top3 与判定方式

**R1「探针的测量本身不可信（量到了假的数）」** —— 三种典型：① 点不动/没加载完就计时（把「没发生」记成「很快」）；② 离屏窗口的 rAF/出帧节流被误当性能（把「没有帧」记成「耗时」或反之）；③ 冷启动（pdf.js worker、JIT、首次字体）混入首次采样。

- 判定：§0.4 的「终点定义」（三条件合取、`page-label` 分母 304）、「预热 1 次」、「心跳 tick < 2 次即 fail」、「防空断言」（② 的 `samples.length === 30` 与首终点逐字 `第 2 / 304 页`；③ 的 `firsthit.page === 121`；⑤ 的折叠中间态 320/330；④ 的 `rowsBefore === 0` 与 520/41/480；⑦ 的 `rowsBefore === 0` 与 41/`480 条`）——④⑦ 的 `rowsBefore` 是本次定稿修订新增的硬断言（旧写法下终点在动作前即成立，见 §0 表 MF-01 / MF-02）。
- 失败信号：某项指标显著优于常识（例如 304 页搜索 200ms）、或 `samples` 长度不足、或恒等断言与指标同时「异常地好」。

**R2「阈值在真实机器上误报或漏报」** —— 相对判据依赖同机基线（忙机器的基线偏高会掩盖回退；空闲机器的基线偏低会让正常抖动变红）；绝对判据（6 条）若实测远低于阈值则丧失区分度。

- 判定：N106-2 判据 1（同一命令连跑两次，相对指标两次读数之比 ≤ 1.5，否则登记并申请改判）；N106-1 判据 3（容差不落基线文件，防放水）；§0.9 的 `skip` 计数 = 0；绝对阈值 6 条在 dev 档必须给出实测值与该值的余量倍数，其中 `search.cold.ms` 按**护栏口径**登记（见下）。
- 失败信号：两次连跑判定翻转、`skip > 0`；相对阈值（11 条）与产品绝对承诺阈值（`open.bigdoc.ms` + 三条 `stall.max.ms`）的实测余量 < 2× 须登记（例如 `open.bigdoc.ms` 实测 2100ms ⇒ 阈值 3000 已无意义，须登记）。**`search.cold.ms` 不适用「余量 < 2×」规则**：它是灾难性回退护栏（§0.5 #7），回归检测由 `search.warm.ms`（相对 #8）承担；dev 档必须登记该条实测值，并写明「不得据该条宣称性能回归」（评审 MF-11）。

**R3「为了达标而改变产品语义」** —— 最危险的方向：把 520 行「按需渲染」成「只渲染前 N 行且不提示」、把搜索改成「提前返回首个结果」、把报告改为「流式写盘」、把 `countNotesByChapter` 改口径、把摘要/分页悄悄改掉。

- 判定：N109-1（既有 186 张截图像素 + 264 条测量零缺失；R10 / R13 / R14 / R16 / R17 / R18 的全部 label 继续通过）、N109-2（`smoke-view` 74 条 + `smoke-notes` 74 条）、§0.5 的 10 条恒等断言（520/41/480/330/320/41/`480 条`/`第 1 / 10 处 · 第 121 页`/121/report 三段逐字）、§7 反需求 1–4 与 11。
- 失败信号：`.note-row` 计数 ≠ 520、报告章块 ≠ 30、搜索状态行不是 `第 1 / 10 处 · 第 121 页`、既有 label 出现新差异、`git diff` 触及被登记为「不动」的文件。

**次级风险（不占 Top3）**：① 抽取 `buildStub` 引入的 stub 行为漂移（由 186 张零缺失 + §0.7 的差异白名单双重兜住）；② `selectPageSpan` 守卫强化后，个别既有相位因就绪谓词 (c)（选区文本逐字等于 span 文本）而新增失败——**登记式处置**：若实测发生，允许把 (c) 降级为「选区非空（`collapsed === false`）」但必须在 dev 档给出该相位的现场读数与理由，**不得**移除 (a)(b)，也不得跳过相位；③ 304 页 PDF 的夹具生成时间（预期 < 1s）与 `big-book.pdf` 体积（预期 < 300 KB）若超预期，登记并说明；④ 端口 5200 的占用（`strictPort`）在并行取证时可能冲突 ⇒ 按「离屏串行」纪律运行，冲突时退出码 2 且提示。

## 10. 开放问题（需负责人确认，不阻塞本档定稿）

1. **⑥ 的边界**：本档把报告导出判据放在主进程数据面（§0.0 第 3 条），理由是「在 stub 上量到的是镜像实现」。若负责人要求 ⑥ 必须端到端（含 IPC 与提示渲染），则需要给离屏 harness 引入**真实主进程**（⇒ 需要 `npm run build` 产物 `dist/main`，与 PRD §5 的「子代理禁 build」冲突），或者接受「stub 镜像」并相应降低该指标的解释力。
2. **绝对阈值是否收紧**：本档把 `open.bigdoc.ms` 冻结为 3000ms（PRD §7.4 的「规模不塌」未给数字）。若负责人要求更紧（如 1500ms），需同步 §0.5 第 1 行与 N105-1 的判据；代价是慢机器上误报风险上升。
3. **是否需要「跨轮基线」**：本档冻结「基线只存在 `%TEMP%`、跨轮对比以 dev 档读数为准」（§7 反需求 10）。若希望有可提交的基线（例如 `docs/pm/R19-baseline.json`），需要同时决定「机器无关系数」（不同机器的绝对读数不可比）——本档不引入。
4. **`search.cold.ms` 的绝对阈值 20000ms**：该条已重述为灾难性回退护栏（§0.5 #7；`requestIdleCallback` 的 `timeout: 32` 是**上限**、不是强制让出，故不推结构性下界）。若实测显示该条余量过大（例如实测数百毫秒 ⇒ 无区分度），可申请改为相对基线判据或收紧数值——两种改法都要同步 §0.0#5 / §0.5 #7 / §0.9 与本节；本轮不预设数值（无实测依据，不做未验证的收紧）。
5. **C1–C6 是否允许「按需渲染」改变首屏可交互的定义**：本档把「按需渲染」限定为「不改变行数/行序/可点击目标」（N107-2）。若负责人希望允许「先渲染首屏 N 行，其余在滚动时补齐」这类形态（会改变 `notes.rows.alldocs` 的判定时刻），需要改 §0.5 的恒等断言 18/19 与 N105-4 的终点定义。

---

## 0. 定稿修订（R19-定稿）

> 依据：`docs/pm/R19-review.md` 的「## 设计评审（R19）」§2 的 **MF-D1…MF-D10**（含 3 条阻塞级）。本节的定位 = **最小字面同步**：只把「设计定稿后与需求档现有字面不一致、或按现有字面不可执行」的条目改口，**不重写本档任何其它节**；冻结契约、指标名、阈值数值、配额与白名单集合一律不动。行号 / 计数均为设计定稿步的实读结果（`UI-shot.mjs` 12483 行、`grep -n "摘录浮层"` = 6 行、位移块 `:5697-5756` = 60 行、`PdfSelectionQuickAsk.vue:118-123`）。

| # | 同步项（涉及的本档字面） | 修订后的口径（以此为准） |
| --- | --- | --- |
| 1 | §0.4「窗口状态纪律」行的「复位 = 重新挂载工作区」（复位态 ②③⑤ 的「第 1 页」不可复现） | 复位增加一个**前置子步骤**：每次复位在**工作区挂载之前**删除探针自有临时根下的 `<PERF_ROOT>/library/.pix-read/reader-state.json`（仅探针夹具，不动产品面）；②③⑤ 的复位后读数 `.page-label` 逐字 `第 1 / 304 页` 升为**硬断言**（`data.resetPage(s)`）。理由：阅读现场会持久化页码（`PdfViewer.vue:740` 的 `initialPage = … ?? restore?.page ?? 1`），不删会让同一夹具产出两种读数（MF-D1） |
| 2 | §N108-2（相位 1）的「失败即红断言」表 ①–⑥ 与「逐字冻结」③ | ① 新增**可见前置**：调守卫前先让浮层确实可见（`stateBefore.display !== "none"` 为硬断言）；② 新增 16ms 隐藏采样器 ⇒ 新硬断言「注入后浮层曾被实测为不可见」（`hiddenSeen === true`）；③ 新增硬断言 `trail[0].quiet.absorbed >= 1`（注入必须落在守卫**首轮**静默窗口内并被吸收）；④ 原有断言（`injected.count` / `scrollTopDelta === 160` / 计数差 ≥ 1 / 就绪谓词 (a)(b)(c) / `warnDelta === 0`）不变；⑤ `retried` 分支**仍不被确定性覆盖**（确定性覆盖需在就绪窗口内再注入一次，会额外 ≈4.5s，与 N109-3 的 +10% 红线冲突）⇒ 按残余登记，不得声称两条分支都被证明（MF-D3） |
| 3 | §0.8 的定义位移行与 §0.10 的销账范围 | 销账口径**收窄**：S-SD-02 本轮的销账范围 = **`selectPageSpan` 家族**（守卫内的 `:1850` + 21 处调用点 + 家族 helper 的重取路径）。全文件余下 4 处同族裸等待（`ui-shot.mjs:1465` / `:1512` / `:1540` / `:9552`，标签依次 `摘录浮层` / `摘录浮层复现` / `摘录浮层重现` / `摘录浮层（选择链路）`）**本轮不改**（理由：`06-*` / `07-*` / `r16-3-note-anchor.png` 的时序与像素面、`selectionOnPageOne` 的部分选区语义）⇒ 登记为**残余**，命中时原样登记 + 上报负责人（MF-D3） |
| 4 | §N108-3（相位 2 `precondition-hard-fail`）的失败即红断言 ③「抛出后 `.quick-ask` 不得处于可见态」 | 相位 2 增加**确定性前置**：先收起选区（`getSelection().removeAllRanges()` + 派发 `selectionchange`，与既有 DOM 段同源）并等 `quickAskProbe()` 的 `display === "none"` / 不在场，登记 `data.precondition`；判据 ③ 重述为「**前置已不可见 ∧ 守卫抛错后仍不可见**」。理由：相位 1 结束时浮层必然可见，而守卫对 span 缺失的页不派发 `selectionchange` ⇒ 按原字面判据 ③ **永假**（MF-D2） |
| 5 | §0.4「采样与统计」行（`paging.*` 的「30 次 median」）与 §0.5 #10 的解释力边界 | ①「30 次」= **每趟** 30 次翻页的纪律（防空 `samples.length === 30` 每趟）；统计样本量 = K=3 趟合计 **90**，median / max 按**全量 90** 算；② ④ / ⑪ 的测量发生在 `leftTab = library` 的**隐藏**笔记面板上 ⇒ 读数是「store 管道 + DOM 构建」，**不含 layout / paint**（不是「可见首屏」）；③ ⑤ 的 `map.scroll.ms` 为**节流代理量**（读数 ≈ 30 个 16ms 心跳的常数级），判别力落在 `map.scroll.stall.max.ms`（MF-D10） |
| 6 | §N108-1 判据 3 的 `grep -c "摘录浮层"`「不减（既有 6 处文案不动，含 `:1465` / `:1512` / `:1540` / `:1850` / `:9552` 与错误文案）」 | 改判为「**恰 6 行 + 逐行归类**」：`:1465` / `:1512` / `:1540` / `:9552` 四处残余裸等待（字面保留）+ `:11327` 注释 + 守卫内 `waitSelectionReady` 的等待标签（替代旧 `:1850` 的裸等待）⇒ 计数仍为 **6**（不减），但组成里不再包含 `:1850`（MF-D4） |
| 7 | §N106-2 判据 1 与 §0.9 的时长红线（阈值误报的处置） | 新增**抖动纪律**（与既有「连跑两次比值 ≤ 1.5」并用）：① 运行严格**串行**且以**空闲机器**为前提（登记当轮重负载进程 / 空闲内存）；② **负载红轮不判回退**：出现红且当轮存在外部重负载 ⇒ 在同代码同命令下于空闲时段复跑取**绿轮**作为验收读数（R18 先例），**不得**改阈值或删断言；③ 幅度依据（R18 同源）：同一相位干净轮 80 / 87 / 95 / 119 ms vs 负载轮 966 / 973 ms ⇒ 放大系数 ≈ 8–12×；④ dev 档对 `samples >= 30` 的指标登记 **p95**、K=3 的登记三个原始读数；⑤ `open.bigdoc.ms` 的「无相对伴随判据」盲区登记为**本轮接受**（MF-D9） |
