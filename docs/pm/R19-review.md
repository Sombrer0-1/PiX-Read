# R19 需求评审（独立评审员，挑刺视角）

> 对象：`docs/pm/R19-req.md`（HEAD `bd4a189` + 未跟踪的 R19-req.md）。本步只读代码 + 只读 git 命令 + `cd pix && npm run check`；未跑离屏取证、未跑 perf-probe（尚不存在）。
> 结论口径：每条结论都标注实读行号 / 实跑命令输出；未验证项一律写明「未验证」。

## 需求评审（R19）

### 0. 复核通过的事实基线（与需求档一致，实读/实跑）

| 档内断言 | 实测 | 证据 |
| --- | --- | --- |
| `ui-shot.mjs` 12483 行；`SEL` `:47-131` = 74 项 | 一致 | `wc -l` = 12483；`sed -n '47,140p' \| grep -cE '^  [a-zA-Z]+: '` = 74；末两项 `readerDiscuss` / `sessionDocMark` |
| `selectPageSpan` `:1838-1851`，裸等待 `:1850` | 一致 | `grep -n` 实读 |
| `ensureQuickAskExcerptReady` `:5611`、`installStageScrollWatch` `:5708` / `stageScrollWatchProbe` `:5724` / `waitStageScrollQuiet` `:5734` | 一致 | `grep -n` 实读（三处 helper 与 `selectPageSpan` 同闭包 `runReaderStateScenarios`） |
| 4 处显式静默调用点 `:11330` / `:11463` / `:11491` / `:11570` | 一致（静默调用实际在下一行 `:11329/:11462/:11490/:11569`，其 `selectPageSpan` 调用正是档内四行） | `grep -n "waitStageScrollQuiet("` / `"selectPageSpan("` |
| r11-3 相位 4 仍有裸调用点 | 成立 | `:7005` `await selectPageSpan(2);`（同段 `:7008` 才 `ensureQuickAskExcerptReady`），前序 `focusPage(2)`（`:7004`）正是迟到滚动来源 |
| 产品侧 hide 语义 `PdfSelectionQuickAsk.vue:141-151` / capture `:190` | 一致 | 实读（`:151` `if (visible.value) hide();`） |
| `notes-store.ts` `renderDocumentReport` `:347` / `exportDocumentReport` `:499` / `isReaderNote` `:137-155` / id 唯一性 | 一致 | 实读；meta 逐字与档内 §0.1 R13 行一致 |
| `smoke-notes.mjs` 10 组 71 条 + `STAMP_RE` `:50` | 一致 | `grep -c "  check("` = 71；组函数 10 个 |
| 基线目录 186 张 / 264 条 / 74 label / `failure === null` | 一致 | 实读 `pix-v06-r18c-review/shots/{MANIFEST,MEASUREMENTS}.json`（186 / null / 264 / 74；目录内 png 186） |
| 唯一工程门 0 error | 一致 | 实跑 `cd pix && PATH=... npm run check` ⇒ `CHECK_EXIT=0` |
| 工作树只多 R19-req.md | 一致 | `git status --short` |
| ③ 夹具算术（命中 10 处、首 121 页、`Chapter 13 body`） | 成立 | 页文本 `Chapter {ceil(N/10)} body …` ⇒ 仅 121–130 页命中；`getPageText` 逐 item 拼接（`PdfSearchPanel.vue:105-124`） |
| ⑤ 默认 330 行 / 折叠 320 | 成立 | `collectExpandable`（`KnowledgeMap.vue:105-116`）只加 `depth === 0` 且有子节点者 ⇒ 30 章 + 300 叶；折叠 `Chapter 01` 去 10 叶 |
| ④ 41 组 / 480 / 520 与 ⑦ 41 行 / `480 条` / title 逐字 | 成立 | `groupNotesByDocument`（`notes-path.ts:109-146`，`onlyCurrent=false` ⇒ 全库 41 组）；`LibraryPanel.vue:178-179` title `` `摘录 ${excerpt} 条 · AI 结论 ${answer} 条` `` |
| `.page-label` / `statusText` / `.tree-row[title]` 起点选择器 | 成立 | `PdfViewer.vue:1213` `第 {page} / {pageCount} 页`；`PdfSearchPanel.vue:81` `第 {i} / {n} 处 · 第 {p} 页`；`LibraryPanel.vue:166` `:title="row.node.path"` |
| `pdf-fixture` 搬移范围 `:137-139` / `:149-227`；stub 模板 `${` 计数 = 1 | 一致 | `escapePdfText` `:137`；`buildPdf` `:149-227`；`sed -n '438,1325p' \| grep -c '\${'` = 1（`CONFIG.` 行 32 处均无 `${`） |

### 1. 核对清单逐条结论

#### 1.1 测量方式能否在离屏/真实渲染进程复跑、计时起止点是否明确、是否有空断言（清单第 1 条）

**可用面**：②（翻页）与 ⑤（地图）的终点会真实变化，且各自带防空断言（② 首终点逐字 `第 2 / 304 页`、`samples.length === 30`；⑤ 折叠 320 / 展开 330）。① 的三条件合取（canvas + textLayer + `第 1 / 304 页`）在实现上确实覆盖 `measurePages`（`.pdf-page` 节点 `v-for="pageSizes"`，`PdfViewer.vue:1119`，而 `pageSizes` 只在 `:728` 的 `measurePages` 之后赋值）——判据 2 的说法成立。⑥ 在主进程数据面测（§0.0 第 3 条）理由正确：离屏 harness 无真实主进程，stub 内的 `renderDocumentReport` 是镜像（`ui-shot.mjs:597-641`）。

**问题（空断言/不可复现）**：

- **④ `notes.firstscreen.ms` 与 ③/⑦ 的同类结构性问题（最严重）**：终点条件在「起点动作」之前就已成立。
  - `WorkspacePage.vue:104` 在工作区挂载时即 `await notesStore.loadNotes()`；`NotesPanel` 用 `v-show` 常挂载（`:318-319`），其列表 `v-else class="notes-list"` + `v-for group` / `v-for note`（`NotesPanel.vue:803-817`）在笔记就绪时就已把 520 个 `.note-row` 建进 DOM（左栏折叠也是 `v-show`，`AppLayout.vue:53`）。
  - 因此「点 `.pill-tab[data-tab="notes"]` → 等 `.note-row` = 520」在点击前即满足，读数退化为「到下一次心跳」；同理 **⑦**：`selectLeftTab` 对同标签直接 `return`（`WorkspacePage.vue:213-215`，`leftTab` 默认 `"library"`，`:41`），点击是 no-op，而 `.tree-row`（41 行）与 `.row-notes` 徽标（`LibraryPanel.vue:36/:49/:51-57` 的 computed）在进入工作区时已存在 ⇒ `tree.badge.ms` 不可测。
  - 这不是「阈值松紧」问题，而是量到的不是被测对象（R1 的失败信号「异常地好」不会被任何断言拦住）。

- **① 的复位态与起点互斥**：§0.4 的窗口状态纪律把已知态定为「文档 = `big-book.pdf`、`page = 1`」，而 ① 的起点是点击 big-book 的树行；`openDocumentFromLibrary` 对同路径 `docPathKey` 直接 `return`（`WorkspacePage.vue:207-211`）⇒ 在给定已知态下点击不产生任何加载。N105-1 判据 3 的「三次采样之间…必须重新 `openRow`」在当前产品实现下也不成立（同文档点击不重载）。若不修正，① 可能量到 16ms 级的假读数或（若前一份文档仍在）20s 超时。

- **③ 的冷缓存前提未冻结**：`textCache` 是面板实例态（`PdfSearchPanel.vue:85`），只在 `resetAll()`（`:330`，由 `:340-347` 的 `watch(() => [props.filePath, props.pdfDocument])` 触发）或组件卸载时清空。既然同文档点击不重载（同上），「每次采样前必须重新打开文档」按字面执行可能什么都没发生 ⇒ `search.cold.ms` 实际量到 warm 路径（阈值 20000 对 warm 无区分度）。**另**：`search.warm.ms` 的「写入同一文本」不会触发 `watch(query)`（`:58` `const query = ref("")`，`:348` `watch(query, …)`；`setSearchQuery` 只做赋值 `notes-store.ts:435-437`）⇒ 读数为心跳间隔级假绿。

- **④ `notes.search.key.max.ms` 的终点判别力不足**：`fixtur` 的 6 个前缀都命中全部 520 条（夹具正文 `… for the scale fixture`；`matchesSearch` 只匹配 `text` / `comment`，`notes-view.ts:37-41`）⇒「`.note-row` 计数稳定」在按键前成立，终点无法区分「过滤真的执行了」与「什么都没发生」；也覆盖不到「搜索静默失效」这类回归。

- **⑤ `map.scroll.ms` 的终点是同步成立的**：`scrollTop` 赋值后同帧即可读到目标值，故窗口时间 ≈ 30 个 16ms 心跳（约 480ms 常数）；该指标实际只是节流代理量，判别力落在 `map.scroll.stall.max.ms`（这一点档内未写）。**未验证**：离屏窗口 `scrollTop` 是否必然触发滚动事件（`.map-tree` 为 `overflow-y: auto`，`KnowledgeMap.vue:225/400`，可行但未实跑）。

- **③/④/⑤ 的心跳窗口**：`setInterval(tick, 16)` 的相邻 tick 间隔只反映主线程阻塞，不反映合成/绘制；档内已用「离屏只在 DOM 变更时出帧」解释为何不用 rAF（`ui-shot.mjs:22`），口径自洽，但「>1s 无反馈卡顿」的解释力应限定为「JS 主线程阻塞」。

#### 1.2 阈值是否合理（清单第 2 条）

- 相对阈值（1.5× / 2.0×，K=3 median）+ 同机基线 + N106-2 的「连跑两次比值 ≤ 1.5」+ 「容差不落基线文件」是成立的设计；`paging.stall / search.scan.stall / map.scroll.stall ≤ 1000ms` 与 PRD §7.4 对应正确。
- **`search.cold.ms ≤ 20000` 的理由是错的**：`idleYield()` 是 `requestIdleCallback(cb, { timeout: 32 })`（`PdfSearchPanel.vue:126-130`）——32ms 是**上限**（超时才强制执行），不是每页 32ms 的强制让出 ⇒「结构性下界 ≈ 300 × 32ms ≈ 9.6s」「20s = 2× 下界」不成立（文档 §10.4 自己也承认需实测）。该阈值可保留（作为灾难性回退护栏），但必须删掉错误的下界推理并在 dev 档登记实测值。
- **① 缺相对护栏**：`open.bigdoc.ms` 是唯一一条覆盖 304 页打开路径的指标，判据只有绝对 3000ms（且实测预期数百毫秒 ⇒ 5–10× 余量），机器变慢或 `measurePages`（`PdfViewer.vue:197-209` 串行 304 次 `getPage`）劣化 2–3× 时发现不了。建议补一条相对伴随判据（例如同基线 ≤2.0×）或把它登记为本轮接受的盲区。
- 其余绝对阈值（`report.export500.ms ≤ 2000`）余量充分；⑥ 的读数含 `readNotesFile`（`notes-store.ts:499-520` 先读盘再渲染）——档内 §0.5#17 的「纯数据面」措辞应把读盘算进去（不影响阈值）。

#### 1.3 N104 大夹具能否与既有夹具共用、300 页 PDF 的生成成本（清单第 3 条）

- **共用成立**：抽取 `escapePdfText` / `buildPdf`（`:137-139` / `:149-227`）+ `buildStub(config)`（模板 `:438-1325`）确实可行——模板当前只有 1 个插值点 `${configJson}`（`:459`），`LIBRARY_TREE` / `LIBRARY_TREE_B` / `libraryList` 是三处孤立的树声明（`:839` / `:850` / `:854-859`），参数化后 `perf-probe` 只需声明 41 行树，符合「声明表留消费者、引擎共用」。
- **成本**：`buildPdf` 对 304 页 = 每页 1 个 content 流 + font/page 对象（对象数约 300–900），与既有 60 页 long-book 同量级，估计 < 1s / < 1MB 合理（**未实测**）。档内「夹具生成耗时不计入任何指标」成立，但 `240s 单轮总预算` 是否包含夹具生成 + vite + 窗口引导未写明；建议明确预算口径（否则 dev 可能把 240s 读成仅采样窗口）。
- **机械判据不可执行**：见 MF-08（`diff` ≤ 6 行 / `${` 计数公式 / 「ui-shot 抽取后应为 0」三处按字面都算不出来）。

#### 1.4 N107「只修实测热点」是否可执行（清单第 4 条）

- 判据结构可执行（①–④ 四类触发条件 + 零热点也要登记 + 每条修复必须绑指标 + 改前改后读数）。C1–C6 的代码定位全部实读核对无误：`NotesPanel.vue:815`、`notes-store.ts:168-173`、`PdfViewer.vue:197-209`、`PdfViewer.vue:833-841`、`KnowledgeMap.vue:53-55`、`notes-view.ts:55-59`。
- **预判项已写成「待实测确认」**（N107-4 表头 + 判据 1「逐条给出结论」）——这一条符合「不得未实测即修复」的要求，写法正确。
- **风险**：C1/C6（笔记面板 520 行）与 C2（二次分组）在同一指标上叠加，判定「修哪一条」时缺少可分离的度量（建议 dev 档在修复前后用同一命令的 `samples` 全量对比，且一次只落一条手段）。
- **覆盖缺口**：③（`search.cold.ms` / `search.scan.stall`）若实测热点，落在 `PdfSearchPanel.vue`——但该文件在 §8 被列入「不改（登记为不动）」；⑦ 同理（`LibraryPanel.vue`）。N107-1 的「不修 = 登记」与「必须修 = 白名单为空」之间没有处置口径。见 MF-12。

#### 1.5 N108 加固是否真能消除整轮中断（清单第 5 条）

- **根因分析正确**：`selectPageSpan`（`:1838-1851`）的裸 `waitFor`（`:1850`）+ 产品侧「阅读区滚动 ⇒ hide」的既有语义（`PdfSelectionQuickAsk.vue:141-151`，capture 监听 `:190`）+ 迟到滚动的常态化（`focusPage` `:5595-5599`、前序相位的 `scrollTop` 赋值）⇒ 首败即停。处方（静默前置 + 重建选区 + 有界重试，且失败不降级）与 R15 的既有范式一致，方向上正确。
- **定义位移的技术依据成立**：调用点 `:2060` / `:4077`（以及 `:6893` / `:7005` / `:7102` / `:7113`）在闭包内早于 `:5708-5758` 执行，`const` 的 TDZ 使得 `selectPageSpan` 体内引用末段 helper 会抛 ReferenceError ⇒ 必须把三处 helper 移到 `:1838` 之前。档内「既有调用点（`:2060`、`:4077`、`:5518`）」列举不全（实际 21 处），但不影响该论证（只需存在早于定义处的调用点）。
- **三处硬伤**：
  1. **尝试预算自相矛盾**：每轮「静默 ≤ 6000ms + 就绪 ≤ 4000ms」× 3 轮 = 30s > 「总预算 ≤ 20000ms」（§0.8）。需冻结优先级。
  2. **断言强度**：`quiet.absorbed ≥ 1` 依赖注入晚于 `installStageScrollWatch` 与 `from` 快照（`:5734-5758` 内 `absorbed = seen - from`）；60ms 定时器与「js 往返 → 守卫 → 静默安装」之间的竞态会让 `absorbed = 0` ⇒ 新场景自己变红（把已知 flake 换成新 flake）。且若注入落在首轮静默窗口内（大概率），`attempts === 1` 被档内承认为合法分支 ⇒ **重试路径从未被确定性覆盖**。见 MF-05。
  3. **语义改写未登记**：`waitStageScrollQuiet` 既有 docstring 明确「到 timeoutMs 仍有新增 ⇒ ok:false —— 调用方按「前置失败」判红，不得静默降级为通过」（`:5730-5733`）；§0.8 把超时改为「照常进入下一步，静默结果只作证据」，却称「既有 `waitStageScrollQuiet()` 语义」。需要显式登记为新语义。
- **附带代价**：静默窗口最短路径 ≈ 7 × 60ms ≈ 420ms（`:5734-5758` 的 `sleep(60)` 循环 + `quietMs = 400`），本轮给 21 处 `selectPageSpan` 调用各加 ≥420ms ⇒ 单轮 +≥8.8s wall-clock；N109-3 的 +10% 红线需预置该估算（3–5 分钟基线下 10% = 18–30s，应能容纳，但最坏情况下每次调用 20s 会顶穿）。
- **残余竞态（未登记）**：重试成功返回后若再有迟到滚动，浮层仍会被隐藏（后续相位若直接断言浮层可见则照旧暴露）——档内只登记了「无限次连续迟到滚动」，建议补一句「返回后的迟到滚动不在守卫保护范围内」。

#### 1.6 白名单一致性与遗漏（清单第 6 条）

- 固定 9 项（3 新建脚本/模块 + 2 改脚本 + 4 md）与条件 8 项覆盖了本轮的实际改动面；`pix/package.json` 零 diff、不新增 npm script 与命令口径一致（`./node_modules/.bin/electron` 直调）。
- **缺口**：见 MF-12（③/⑦ 的潜在热点文件在「不动」清单里）；另外条件项 11 的措辞自相矛盾——「按需渲染的既有形态内调整（`rootMargin` / 释放窗口 / 占位几何**逐字不变**）」，既是「调整」又是「逐字不变」，且与 §7.4 的「不改 `PdfViewer` 的渲染策略」重复表述不一致。
- **登记**：`docs/pm/R19-req.md` 已在工作树（未跟踪），`R19-review/design/dev.md` 属白名单；未发现需要修改白名单外文件的用例。

### 2. must-fix 清单（按优先级，全部要求在 R19-design.md 冻结口径后开工）

| # | 条目 | 现状（实读证据） | 必须改成 |
| --- | --- | --- | --- |
| MF-01 | ④ `notes.firstscreen.ms` 终点在点击前即成立 | `WorkspacePage.vue:104`（挂载即 `loadNotes`）+ `:318-319`（`v-show` 常挂载）+ `NotesPanel.vue:803-817`（列表常渲染） | 冻结 ④ 的复位态为「笔记尚未渲染」（如 goHome → enterWorkspace 后立即采样），并要求 `data` 记录**点击前** `.note-row` 计数（断言 < 520）作为防空前置 |
| MF-02 | ⑦ `tree.badge.ms` 起点是 no-op、终点已存在 | `WorkspacePage.vue:213-215`（同标签 `return`）、`:41`（默认 `library`）、`LibraryPanel.vue:36/:51-57`（行与徽标为常挂载 computed） | 冻结起点前置（先切 `.pill-tab[data-tab="notes"]`，再点 library；或改起点为真实触发路径），并记录点击前 `.tree-row` / `.row-notes` 快照作防空 |
| MF-03 | ① 复位态与起点互斥、`openRow` 同文档不重载 | `WorkspacePage.vue:207-211`（同 `docPathKey` 早退）；§0.4 复位把「文档 = big-book.pdf 第 1 页」设为已知态；N105-1 判据 3「必须重新 `openRow`」 | 把 ① 复位冻结为「无打开文档」（goHome → enterWorkspace），并加点击前 `.page-label` 文本 / `.pdf-page` 计数的防空记录 |
| MF-04 | ③ 冷/暖口径可被静默混淆 | `PdfSearchPanel.vue:85`（实例态 `textCache`）、`:330`（`resetAll` 清缓存）、`:340-347`（随 `filePath`/`pdfDocument` 清）、`:58/:348`（同值不触发 `watch`）；`WorkspacePage.vue:207-211` | ①冻结真实重载路径（goHome → enterWorkspace → openRow）并记录「面板被重建/扫描重启」的可判证据；②冻结 `search.warm.ms` 的步骤为「清空 → 重输同一词」（或换词回填），禁止直接重写同值 |
| MF-05 | N108-2 注入存在竞态与覆盖空洞 | `ui-shot.mjs:5734-5758`（`absorbed = seen - from`，计数只在 `installStageScrollWatch` 之后累积） | 冻结「先 `installStageScrollWatch` + 取基线快照，再挂注入定时器」的顺序（或把注入延迟写为常量并要求晚于基线）；补一条能证明重试路径被覆盖的断言，或明确登记该 scenario 只证明「静默窗口吸收」分支 |
| MF-06 | §0.8 尝试预算自相矛盾 | 2.1 节引文（3 次 × (6s+4s) = 30s vs 总预算 20s） | 冻结优先级：全局 deadline 先到即以已有轨迹抛错；错误文案必须含已完成的 attempts 数与每轮 `quiet / state / selection` |
| MF-07 | label 配额自相矛盾（+1 vs 两条不同 label） | §0.2#7 / §0.9 / N109-1 判据 2 / N109-4 判据 1（74→75，`r19-selection-guard` 条数 = 2） vs N108-2 判据 1「label 与 `phase` 逐字 `late-scroll-recovered`」 | 冻结「两条 record 共用 label `r19-selection-guard`，phase 落在 `data.phase`」；改掉 N108-2 的 label 措辞，或把配额改为 +2 label（74 → 76）并同步四处 |
| MF-08 | N104-3 抽取机械判据算不出来 | (a) `ui-shot.mjs:839-846` 的 `LIBRARY_TREE` 块 8 行 → 1 行即 9 个 diff 行，`LIBRARY_TREE_B` `:850-852` 4 行，`libraryList` archive 分支 1 行，`config` 新增 4 键 4 行 ⇒ 约 19–21 行；(b) `${` 计数改前 = 1，`CONFIG.tree/treeB/archiveDir` 均不含 `${` ⇒ 公式「1 + CONFIG 引用数」不成立；(c) 全文件命中 31 行，模板区 10 行 ⇒ 抽取后 `ui-shot.mjs` 仍有约 21 行命中（`:1712`、`:9331`、`:9334`、`:11766` 等），不存在「应为 0」 | 把 (a) 改为「差异行必须全部落在 5 处白名单形态内（不设行数上限，或上限 = 4 处改动点的行数和）」；(b) 改为「计数仍为 1」；(c) 改为「两文件和 = 31」并删除「应为 0」 |
| MF-09 | N104-2 判据 3 的证据归因错误 | `ui-shot.mjs:522-530` 的 stub `readNotesFile` 自带宽松解析（注释逐字「stub 专用；主进程同情形判 corrupt」），离屏夹具不经主进程 `isReaderNote`（`notes-store.ts:137-155`） | 由 `smoke-notes.mjs` 用真实 `parseNotesFile` 校验同一份 520 条夹具（或删除该断言并把 ④/⑦ 的证明力限定为「stub 读侧接受」） |
| MF-10 | 「单文件 ≤ 80 行」与冻结改动冲突 | §7.4 / N107-2 判据 1 vs §0.7（搬移 `ui-shot.mjs:438-1325` 模板）+ §0.8（位移三处 helper + 新场景） | 把 ≤80 行限定为「N107 条件性白名单内的产品文件」；对 `ui-shot.mjs` / `smoke-notes.mjs` 单列允许清单（含搬移行数） |
| MF-11 | `search.cold.ms` 阈值理由不成立 | `PdfSearchPanel.vue:126-130`（`timeout` 是上限） vs §0.5#7「结构性下界 ≈ 9.6s / 20s = 2× 下界」 | 删除下界推理，把该条重述为灾难性回退护栏；dev 档登记实测值与判据解释力；§9 R2 的「余量 < 2×」规则同步改写 |
| MF-12 | N107-1「热点必修」在白名单上无出口 | §8 把 `PdfSearchPanel.vue`（③）与 `LibraryPanel.vue`（⑦）列入「不改（登记为不动）」 | 二选一：把两文件加入条件性白名单（附 fail 指标 + 读数要求），或在 N107-1 写明「热点落在未授权文件 ⇒ 登记为阻塞，上报负责人，不得自行扩权」 |
| MF-13 | ④ 键入指标不可判别 | `notes-view.ts:37-41`（只匹配 text/comment）+ 夹具正文均含 `fixture` ⇒ 6 键全命中 520 条，「行数稳定」在按键前成立 | 改用逐键收窄的查询词（并在 §0.3/§0.4 重新冻结），或补一条「至少一键使 `.note-row` 计数发生变化」的防空断言（保留现有 520/41/480 恒等断言） |

### 3. 观察项（不阻塞定稿，但建议在 R19-design.md 逐条处置）

1. `fixture.docs === 41` 与 §0.3「小文档 40 篇」的键语义歧义（是 40 还是 41？）；`pdfBytes` 是 big-book 单文件还是夹具总体积（判据 `> 0 && < 5MB` 两种都过，但口径要写死）。
2. N107-2 的「按需渲染」与「行数/行序不变」在 DOM 计数口径下不相容（除非用 `content-visibility: auto` 一类不改 DOM 的手段）；需要设计档指定具体机制，否则该手段事实上不可用（开放问题 5 已触及，建议在定稿时给出结论）。
3. ⑤ `map.scroll.ms` 的终点同步成立 ⇒ 建议明确它是「节流代理量」，并把判别力声明落在 `map.scroll.stall.max.ms`；同时明确 `map.scroll.ms` 的 30 步等价于 30 个心跳，读数 ≈ 480ms 常数。
4. 每个 `selectPageSpan` 新增 ≥ ≈420ms（`:5734-5758`）⇒ 21 处调用点合计 +≥8.8s；N109-3 的 +10% 归因预案应写进设计档。
5. §0.8 对 `waitStageScrollQuiet` 超时语义的改写（由「判红」变「继续」）需要显式登记为**新语义**，并说明为何不违背「不得降级为通过」。
6. `①` 的绝对阈值无相对作伴（见 1.2 节），建议至少登记为「本轮接受的检出盲区」。
7. N104-5 判据 2 的「占用 5200 端口」实验需注意 `strictPort` 下 vite 启动失败路径是否也能保证 root 被删（`finally` 承诺）；建议在设计档写明「端口占用发生在 `rmSync(root)` 之前还是之后」的判定。
8. ④ 的「仅看当前文档」开关（`NotesPanel.vue:646-655` 的 `v-switch`）定位方式应在设计档冻结（档内已声明「由设计定稿」，可接受）。
9. `search.cold.ms` 单次 + 预热 1 次 ⇒ ③ 至少 2 次完整 304 页扫描 + 每次采样前的重载；建议在 240s 预算表中列出各路路径的预算分解。

### 4. 结论

- **事实面**：需求档的既有面数字（74 SEL / 186 张 / 264 条 / 74 label / 71 条烟测 / `npm run check` = 0 / 关键行号 / 夹具算术 / 报告逐字）经实读与实跑核对，**基本准确**；S-SD-02 的根因与残留裸调用点（`:7005`）确认存在，N108 的方向正确。
- **可执行面**：13 条 must-fix 中，MF-01/02/03/04/13 直接决定「量到的数是不是被测对象」（当前形态下 ④⑦ 是空断言、①③ 可被静默混淆、④ 键入不可判别）；MF-05/06/07/08/09 决定「新加的护栏自身是否可复跑、判据是否算得出来」；MF-10/11/12 决定「阈值与白名单是否自洽」。
- **裁决建议**：本档**不宜直接进入开发**。MF-01–MF-04、MF-13 需在 R19-design.md 里把每条指标的「复位态 / 起点前状态 / 防空读取」写死并给出 2–3 句可复跑描述；MF-05–MF-09 属判据/口径笔误，改字即可；MF-10–MF-12 属边界裁决，需负责人确认（是否扩条件性白名单、是否接受 `ui-shot.mjs` 的大 diff）。
- **未验证事项（本步明确不做）**：未跑离屏（无 `r19-1` 场景、`perf-probe.mjs` 尚不存在）；304 页 PDF 生成耗时/体积、`map-tree` 滚动事件行为、`requestIdleCallback` 在离屏下的实际让出节奏，均为**未实测**，需 dev 档实测登记。

---

## 设计评审（R19）

> 对象：`docs/pm/R19-design.md`（对照 `docs/pm/R19-req.md` 含 §0 定稿修订 MF-01…MF-13）。本步：实读文件 + 只读 git（`status` / `log`）+ `cd pix && npm run check`；**未跑**离屏 / `perf-probe.mjs`（尚不存在）/ 两条烟测 / `npm run build|test|package|dev`。下列行号、计数、退出码全部来自本次实跑；未核实的项一律显式标注。
> 结论：**revise**。3 条阻塞级（MF-D1 / MF-D2 / MF-D3）+ 7 条必须修正的判据与口径（MF-D4 … MF-D10），见 §2。

### 0. 复核通过的事实基线（本次实跑）

| 档内断言（抽样） | 实测 | 证据 |
| --- | --- | --- |
| `ui-shot.mjs` 12483 行；`SEL` `:47-131` = 74 项，`};` 在 `:131` | 一致 | `wc -l`；`sed -n '47,140p' \| grep -cE '^  [a-zA-Z]+: '` = 74 |
| `escapePdfText` `:137-139` / `buildPdf` `:149-227`（79 行）/ `SAMPLE_PAGES` `:229`（3 页）/ `LONG_BOOK_OUTLINE` `:332-351` / `buildStub` `:438-1320` | 一致 | `grep -n` 实读；`SAMPLE_PAGES` 3 组 |
| `LIBRARY_TREE` `:839-847`（9 行）/ `LIBRARY_TREE_B` `:850-852`（3 行）/ `libraryList` `:854-860`（archive 分支 `:858` = `key.endsWith("/archive")` → `LIBRARY_TREE[0].children`） | 一致 | `sed -n '836,862p'` |
| 模板唯一插值点 `:459`；模板区 `${` 计数 = 1；纪律模式全文件 = 31 | 一致 | `sed -n '438,1320p' \| grep -c '\${'` = 1；`grep -c "listSessions…"` = 31 |
| `selectPageSpan` `:1838-1851`（14 行，裸等待 `:1850`）；调用点 **21** 处；`waitStageScrollQuiet(` **5** 处；`ensureQuickAskExcerptReady(` **14** 处 | 一致 | `grep -n` 逐条与设计档 §0.1 清单比对本步全部命中 |
| 位移块 `:5697-5756` = **60** 行；`waitStageScrollQuiet` 体收口 `:5756` | 一致（但 §4 表格自相矛盾，见 MF-D5） | `sed -n '5697,5756p' \| wc -l` = 60；`awk 'NR==5756'` = `  };` |
| `pix/scripts/lib/` 不存在；`perf-probe\|PIX_PERF_ROOT` 在 `pix/scripts` + `pix/src` **0** 命中；`big-book\|doc-01` 在 `ui-shot.mjs` **0** 命中 | 一致 | `ls` / `grep -rn … \| wc -l` = 0 |
| 基线 `pix-v06-r18c-review/shots` = 186 张 / `failure:null` / 264 条 / 74 label / 186 png | 一致 | 实跑 `node -e` 读两个 json |
| HEAD `bd4a189`；工作树只多 3 份 `docs/pm/R19-*.md`；`npm run check` = 0 error | 一致 | `git log --oneline -1` / `git status --short` / `CHECK_EXIT=0` |
| 烟测面：`smoke-notes.mjs` 71 条（`main()` 组调用 `:1601-1610`，`runReaderStateStore();` = `:1610`，`rmSync(TMP)` = `:1616`）；`smoke-view.mjs` 74 条；`serialize` `:89` / `WS_A` `:27` / `NOTES_A` `:31` / `REPORTS_A` `:40` / `STAMP_RE` `:50` / `normalizeStamp` `:51` | 一致 | `grep -c "  check("` = 71 / 74；`sed -n '1596,1624p'` |
| 产品侧行号抽查（`PdfSelectionQuickAsk.vue` `FEEDBACK_MS` `:23` / `hide()` `:93` / `onStageScroll` `:141` / capture 监听 `:190`；`WorkspacePage.vue` `leftTab` `:41` / `openDocumentFromLibrary` `:207-211` / `selectLeftTab` `:213-220` / `goHome` `:260`；`LibraryPanel.vue` `rows` `:36` / `noteCountMap` `:49` / `rowsWithBadge` `:51-57` / `libraryList(root, 3)` `:86` / `.tree-row` `:166` / `.row-notes` `:178-179`） | 一致 | 实读（少数 1–3 行偏移见 §3 观察 1） |

### 1. 重点核对逐条结论

#### 1.1 测量的可复跑性与稳定性（重点核对 1）

- **计时点与采样口径**：①–⑤ / ⑦ 的起点、终点、复位态、防空读数逐条写死（§1.3 表），② 的「两个终点都成立后才点下一次」、④ 的「逐键等行数稳定」都冻结了交互节奏；预热 1 次、K=3、`samples` 全量、超时记 `null` 不记 0、心跳 tick < 2 判 fail——这些口径可复跑、可判定。
- **漏点（未闭合）**：**没有给出任何抖动幅度依据**。仓库内唯一可用的同源数据是 R18 的既有耗时断言：`docs/pm/R18-dev.md:131` / `:224` / `:273` 记录同一相位「`.map-toggle` → 220 行 ≤ 800ms」在四个干净轮次读 **80 / 87 / 95 / 119 ms**，在机器被外部进程占用（用户自己的 `E:\pix\PiX.exe` ×4 + `MsMpEng`，空闲内存 ~3.1 GB）的轮次读 **966 / 973 ms** ⇒ **同一份代码在负载下的放大系数 ≈ 8–12×**。据此判断：① 三条 `LIMIT_STALL_MS = 1000` 与 `LIMIT_OPEN_BIGDOC_MS = 3000` 在同等负载下会误报（这是绝对判据的代价，本轮无相对伴随判据）；② 相对判据里 `paging.render.max.ms` / `paging.turn.max.ms` 的「max(90) 比值 ≤ 2.0」在重尾分布上本身噪声大，负载轮次可轻松破 2.0×。设计档 §3 #7 与 §6 R2 只写了「登记 + 申请改判」，**没有冻结运行纪律**（串行、空闲机器前提、负载读数登记、负载红轮取空闲绿轮复跑，且不得改阈值）——而 R18 的既有处置恰恰是「不改阈值、取绿轮」。
- **口径歧义未登记**：req §0.5 #2–#5 写「30 次 median / max」，设计 §1.3 / §1.4 写 **90 samples**（3 趟合并）。两处读法都自洽，但设计档没有把这处解释登记为对 req 字面的显式解读——一旦 dev 按 req 字面实现，`samples` 长度与 `max` 的分位都会变。
- **解释边界未登记**：④ `notes.firstscreen.ms` 与 ⑪ `notes.search.key.max.ms` 的复位态使 `leftTab = "library"`（`WorkspacePage.vue:41`），即测量发生在 `v-show` 隐藏的笔记面板上（`:318`）。DOM 会照建（`v-if` 链与可见性无关），但 **layout / paint 不计入**；`notes.firstscreen.ms` 因此是「store 管道 + DOM 构建」的读数，不是「可见首屏」。req §0.5 #10 只声明了「不含 `v-show` 翻转」，没声明「不含布局与绘制」。
- **复位页码不可控（见 MF-D1）**：这是本节最严重的问题，已单列为阻塞项。

#### 1.2 夹具生成（重点核对 2）

- **与既有实现共用**：`buildPdf` 经 `pix/scripts/lib/pdf-fixture.mjs` 逐字搬移（设计 §1.2.3 / §1.6 ③ 的计数判据可算：`:137-139` 3 行 + `:149-227` 79 行 = 82 行）；`notes.json` 的序列化与 `ui-shot.mjs:538` 的 `writeNotesFile` 同款（`JSON.stringify({ version: 1, notes }, null, 2) + "\\n"`）——本步实读确认模板内该行逐字一致。声明表（`BIG_PAGES` / `BIG_OUTLINE` / 520 条生成器）留在 `perf-probe.mjs`，与 req §0.0#4「夹具声明表留在消费者文件内」一致，**不制造无人调用的共享死代码**。
- **成本可接受**：`buildPdf` 每页 1 个内容流 + 2 个对象，304 页约 610 个对象；MediaBox 595×842、每行自带字号——生成是纯字符串拼接，预期 < 1s，`big-book.pdf` 预期 < 300 KB（§1.2.1 的 `pdfBytes < 5 MiB` 判据有 1 个数量级余量），40 篇 2 页小文档合计 ~100 KB；`notes.json` 520 条 ~100 KB。探针总预算 240s 不含夹具生成 ✔。
- **不会误提交**：`PERF_ROOT` 默认 `join(tmpdir(), "pix-v06-r19-perf")`，第 3 步根目录守卫（严格位于 `os.tmpdir()` 之下、与 `pix/` 互不包含）+ `--save-baseline` 目标必须在仓库外，二者都给出「违例 ⇒ 退出码 2、仓库零新增文件」的冻结语义；`writeFileSync` 唯一命中被冻结在 `--save-baseline` 一处。本步实读确认 `pix/scripts` 下无探针、无 `lib/`、`big-book|doc-01` 零交叉 ⇒ 现有工作树不受影响。
- **缺口**：探针的 `buildStub(config)` 配置表不完整（见 MF-D7）。

#### 1.3 N108 加固（重点核对 3）

- **真实裸调用点清单（本步 `grep -n "摘录浮层"`）**：`:1465`（`runScenario`，截图为 `06-excerpt-entry-*`）、`:1512`（`摘录浮层复现`）、`:1540`（`摘录浮层重现`）、`:1850`（`selectPageSpan` 内，本轮唯一被改）、`:9552`（`:9537` 的 `selectionOnPageOne`，被 `:9998` 消费）、`:11327`（注释）。**设计只覆盖 1 / 5 个裸 `waitFor` 站点**，其余 4 处在设计档里既未登记为残余风险、也未论证为何不受「迟到阅读区滚动隐藏浮层」影响；§1.5.4 的「家族成员」表列的是 `excerptFirstSpan` / `excerptViaQuickAsk` / `ensureQuickAskExcerptReady` / `focusPage`，与这 4 处无关。销账口径因此必须收窄为「`selectPageSpan` 家族」并逐条登记 4 处残余（`:9552` 同闭包，可复用守卫；`:1465/:1512/:1540` 在 `runScenario` 内，可复用同一 helper）。
- **相位 1 的注入不构成「隐藏后恢复」的证明（假绿）**：守卫的首轮静默窗口最短 ≈ 420ms（`waitStageScrollQuiet` 的 `sleep(60)` × 7 + `quietMs = 400`，实读 `:5734-5756`），而注入定时器是 `setTimeout(…, 60)`。注入落在「选区尚未重建」的窗口内 ⇒ 那一刻 `.quick-ask` 还没有可见态可被隐藏（`visible` 由 `showFor` 打开），相位末的 `display !== "none"` 与 `attempts === 1` 都是「避开」而非「恢复」的结果。断言里唯一与注入绑定的是 `watchCountAfter - baselineCount >= 1`（只证明滚动发生过），**没有任何断言要求该滚动被首轮静默吸收**（`trail[0].quiet.absorbed >= 1`）或落在 `absorbed-first-window`。即：一个静默窗口过短（例如 20ms）的守卫实现同样能通过本场景——只要它在下一轮重试能成功（`branch = retried` 只登记、不判定）。建议：① 把 `trail[0].quiet.absorbed >= 1` 或 `branch` 写进失败即红断言；② 增设一次落在就绪窗口内的二次注入（如 `setTimeout(…, 700)`）以确定性覆盖 `retried` 分支（req §0.10 已登记该分支未被覆盖，但设计档没有把它变成可判定项）。
- **相位 2 的判据 ③ 事实不可满足（阻塞，见 MF-D2）**。
- **重试边界不会造成「吞错」型假绿**：参考实现无 `catch`、失败即抛、错误文案含 `选择前置失败` + `attempts` + 逐轮轨迹，全局 deadline 20000ms 自首次尝试前起算，每轮 `quiet ≤ min(6000, remaining)` / `ready ≤ min(4000, remaining)`——这几点与 req §0.8 / MF-06 一致，`awk` 的 `catch` = 0 判据可实现（新实现体内无 `catch` 字面；`waitSelectionReady` 定义在 `selectPageSpan` 之后但必须先于 `:2060` 的首次调用语句，建议在设计档写明「紧随其后但必在首个调用点之前」）。
- **就绪谓词只增不减**：(a) 逐字保留 `:1850` 的判据、(b)(c) 追加；唯一强度变化是逐页文字层累计等待 20s → ≤12s，已在 §1.5.3 / §6 次级风险 1 / §9 开放问题 6 登记 ✔。

#### 1.4 N107 热点修复的判据（重点核对 4）

- **判据链可复现**：热点定义（①–④）取自 §0.5 的 fail 指标；改动量上限只约束 §8.2 条件性白名单内的产品文件（≤ 80 行/文件）；每条修复要求「fail 指标 id + 改前/改后原样 stdout + `samples` 全量 + 归因」四行；并要求「同一次运行内其余 23 条不因该修复转 fail」与「触及 `pix/src/**` 必须复跑离屏 + 零缺失」。没有越界到大重构的授权（反需求 1–4 / 11 原样保留）。
- **未闭合的机制冲突**：N107-2 允许「按需渲染」，但 ④ 的终点是 `.note-row` = **520** ∧ `.notes-group-head` = **41**（恒等 #18/#19），而 ④ 的测量时刻面板处于 `display:none`。任何「只渲染可见部分」的实现都会让 ④ 的终点永不成立（隐藏面板下没有可见行）⇒ 该手段对 ④ **事实上不可用**。需求评审 §3 观察 2 已提出这一点，设计档未处置；应显式写死「④ 的可选手段 = memo / 减少重复计算（+ 可选的 `content-visibility` 一类不改 DOM 计数的手段）」，否则 dev 会烧掉一轮。
- **无 fail 不修**：设计 §8.3 的「差异 < 10% ⇒ 无显著差异，登记不修」与 N107-1「不满足任一条 ⇒ 不修」一致 ✔。

#### 1.5 白名单一致性与既有面零缺失（重点核对 5）

- **白名单**：§4 的文件清单（3 新建 + `ui-shot.mjs` + `smoke-notes.mjs` + 3 份 `docs/pm/R19-*.md` + dev 档）= 固定白名单 9 项，与 req §8.1 一一对应；§2.1 的零改动清单与 req §8.2 的「不改（登记为不动）」一致；「白名单外热点 ⇒ 阻塞 + 上报」在 §4 尾注与 §6 R3 双写 ✔。本步未发现设计授权的改动落在白名单之外。
- **186 张 / 264 条零缺失的风险点**：① 抽取 `buildStub`（5 处白名单差异 + 改前/改后同一 `PIX_SHOT_ROOT` 的 `stub-preload.cjs` 逐行归类）；② 守卫改造使 21 处调用点的时序整体后移 ≥ ≈420ms/处（R18 的 80–119ms 与 966–973ms 记录说明时序读数对负载敏感，截图内容不受影响但耗时断言可能）；③ 时长红线（设计自估新增 ≈ 24s，180s 基线下预算只有 18s ⇒ 贴线/顶穿）；④ `SEL` +1 项对既有断言无影响（实测既有 74 项逐字未动）。②③ 已被设计登记（§6 R2 / §3 #21），但**处置后置**：没有预置「若 ratio > 1.10 允许的非削弱动作」（例如复用调用方已做的显式静默、或缩短 r19-1 相位 2 的失败路径就绪超时——后者被 §9 开放问题 4 列为待裁决）。

### 2. must-fix 清单（设计档必须落定后才能动工）

| # | 级别 | 问题（实读证据） | 必须的改法 |
| --- | --- | --- | --- |
| MF-D1 | **阻塞** | 复位「回到第 1 页」不可控：`openDocumentFromLibrary` 对树行点击登记 `readerStateStore.requestRestoreFor(path)`（`WorkspacePage.vue:207-211` → `reader-state-store.ts:229-235` → `reader-store.ts:95-107` 消费 → `PdfViewer.vue:701-702` / `:740` `initialPage = lateJump ?? jumpPage ?? restore?.page ?? 1`）；页码在打开后即被 `noteLanding`（`PdfViewer.vue:744`）与 `noteChange`（`:1027`）持久化（`reader-state-store.ts:242` / `:250`，`DEBOUNCE_MS = 600` `:26`/`:181`）。⇒ ② 第 2/3 趟、③、⑤ 的「等 `.page-label` 逐字 `第 1 / 304 页`」要么等不到（记录页为 31）、要么与 `loadReaderState` 竞态（`.workspace-page` 一出现就点树行，`documents` 可能还是空 ⇒ 有时是第 1 页、有时是第 31 页）——同一个夹具会产出两种读数。 | 在 §1.3.0「复位纪律」写死：每次复位在**工作区挂载之前**删除 `<PERF_ROOT>/library/.pix-read/reader-state.json`（探针自有临时夹具，合法）；并在 §1.6 加一条走查判据（如 `grep -c "reader-state.json" pix/scripts/perf-probe.mjs` ≥ 1）与一条运行时防空（首批采样后 `[perf] data` 登记复位后打开的首个 `.page-label`）。② 的 `data.resetPage` 必须据此可重复。 |
| MF-D2 | **阻塞** | `r19-1` 相位 2 的失败即红判据 ③ 与相位 1 的判据 ⑤ 互斥：相位 1 结束时 `.quick-ask` 必然可见（判据 ⑤ 要求 `state.display !== "none"`）；相位 2 期间守卫对第 999 页的重建返回 `rebuilt: false`（span 缺失）且**不派发 `selectionchange`** ⇒ 浮层保持可见 ⇒ 判据 ③「`inDom === false` 或 `display === "none"`」永假，相位 2 不可能绿（整轮取证必红）。 | 相位 2 增加确定性前置：先收起选区（`selection.removeAllRanges()` + 派发 `selectionchange`，与既有 DOM 段同源）并把「浮层不处于可见态」作为**前置读数**；判据 ③ 改为「前置已不可见 ∧ 守卫抛错后仍不可见」。或把该判据改述为「守卫轨迹 `ready.ok === false` ∧ 未把浮层重新打开」。 |
| MF-D3 | **阻塞** | N108 覆盖与证明力都不足：① 只改 `:1850` 一处，其余 4 处同族裸等待（`:1465` / `:1512` / `:1540` / `:9552`）未登记、未覆盖；② 相位 1 的注入（`setTimeout(…, 60)`）落在「选区尚未重建」的窗口（守卫首轮静默 ≥ ≈420ms），**没有任何断言证明浮层曾被隐藏后被恢复**，`branch` 只登记不判——静默窗口过短的实现同样能绿。 | ① §1.5.4 增列 4 处残余 + 逐条理由（或改道同一 helper）；§1.6 的 S-SD-02 销账口径收窄为「`selectPageSpan` 家族」。② 失败即红断言增加 `trail[0].quiet.absorbed >= 1`（或断言 `branch === "absorbed-first-window"`）；并增设一次落在就绪窗口内的二次注入以确定性覆盖 `retried`（否则按 req §0.10 的残余风险原样登记，且不得把相位 1 表述为「复现了隐藏→恢复」）。 |
| MF-D4 | 中 | 判据自相矛盾：§1.6 ④ 写 `grep -c "摘录浮层"` **不减（既有 6 处文案仍在）**，但守卫化会删掉 `:1850` 的这条字面（本步实测该字面共 6 行：`:1465/:1512/:1540/:1850/:9552` + `:11327` 注释）⇒ 改后为 5，判据必假。 | 二选一：把判据改为「`:1465/:1512/:1540/:9552` 四处字面仍在（≥5 行命中）」；或让新 helper 的等待带 `摘录浮层` 标签（例如 `waitSelectionReady` 的错误/证据文案保留该词）。 |
| MF-D5 | 中 | 位移块行数自相矛盾：§1.5.2 / §2.2 写 `:5697-5756` 共 **60** 行（本步实测 60 ✔），§4 表格写 `:5708-5758` 共 **51 行**、§8.1 #1 写「位移 51 行」，§4 表格还出现「124 行级」的表述。 | 统一为 `:5697-5756` = 60 行（含前置注释头与空行），并让 §4 / §8.1 的登记口径一致。 |
| MF-D6 | 中 | `git diff -U0 \| grep -cE "^-[^-]"` 的「应恰为 965 + 60 + 14」不可算：旧 `selectPageSpan` 体被替换时，未被改写的选区段会在 hunk 内以**上下文行**出现（不是 `-` 行），且 `-U0` 下 hunk 合并方式与差分粒度相关 ⇒ 总数不是简单相加。 | 改为与 MF-08 同款的「逐块登记 + 无白名单外 `-` 行即停线」，删掉精确合计值的断言。 |
| MF-D7 | 中 | 探针的 `buildStub(config)` 配置表不完整：模板还用 `CONFIG.name` / `CONFIG.nameB`（`recentProjects` 两条，实读模板行 `:888-890`）、`CONFIG.samplePath` / `samplePathB` / `olderPath`；§1.2.3 的探针 config 列表缺 `nameB`（`JSON.stringify` 会丢掉 `undefined`），首页第二张卡片名会为空。 | 在设计档补全探针的 config 键值表（`name` / `nameB` / `root` / `rootB` / `notesFilePath` / `tree` / `treeB` / `archiveDir` / `archiveChildren`，以及明确不用的 `samplePath` / `samplePathB` / `olderPath`），并说明 `recentProjects` 的可见结果（单卡片还是双卡片、`resetToWorkspace()` 靠哪个键命中）。 |
| MF-D8 | 中 | ④ 的手段与恒等 #18 冲突（见 §1.4 末）：N107-2 的「按需渲染」在「隐藏面板 + `.note-row` = 520」的终点点下不可用。 | 在 §4 的条件性白名单细则（或 §8.3）写死每指标可用手段：④/⑪ = memo / 减少重复计算；`NotesPanel.vue` 的 DOM 行数（520 / 41）为**不可压缩**的终点点，`content-visibility` 一类不改 DOM 计数的手段须单独登记。 |
| MF-D9 | 低 | 抖动纪律缺登记：无抖动幅度依据、无运行纪律、无「负载红轮取空闲绿轮」的既有先例口径（R18 数据见 §1.1）。 | §1.4 / §3 #7 增补：串行 + 空闲机器前提、登记负载读数、负载红轮复跑取绿轮且**不得改阈值**；dev 档除 median 外登记 p95 / max 离散度。 |
| MF-D10 | 低 | 口径歧义未登记：`paging.*` 的统计量（req「30 次」vs 设计「90 samples」）；④ 的「不含 layout/paint」解释边界。 | §1.3 / §1.4 各加一行登记（并注明 ④⑪ 在 `leftTab = library` 的隐藏面板上量）。 |

### 3. 观察项（不阻塞，建议定稿时登记）

1. **行号精度**：抽查到少数 1–3 行偏移——`PdfSearchPanel.vue` 的 `statusText`（实读 `:74`，档内 `:71-82`）、`countOccurrences`（实读 `:100`，档内 `:99-107`）、`PdfViewer.vue` 的搜索面板挂点 `v-if`（实读 `:1088`，档内 `:1087-1093`）、`PdfSelectionQuickAsk.vue` 的 `onBeforeUnmount`（实读 `:193`，档内 `:194-196`）。不影响判据，但与「本档一律按实读行号引用」的自我声明不符。
2. **⑥ 的执行证据增量**：§5.2 的 `perf-report-export` 用真实 `main/notes-store.js` 走 480 条同形状夹具，`exportDocumentReport`（`src/main/notes-store.ts:499-525`）不要求 `big-book.pdf` 真实存在（`toRelativeDocPath` `:122-128` 只做包含性判定）⇒ 组内不必造 PDF，设计已如此写 ✔；但 `report.head` 的逐字子串跨 `生成时间` 归一化，务必沿用既有 `normalizeStamp`（`:51`）而不是手写正则。
3. **④ 的防空断言不完全是「防空」**：`rowsBefore === 0` 在「点项目卡片同一同步段取 t0」的写法下必然为 0（工作区尚未挂载）——它防的是「重复量到上一份状态」，不防「终点在动作前成立」。真正的判别力来自 `.notes-group-head = 41` + `notes.*` 恒等与 `k` 轮的逐键计数，建议在 dev 档如实登记该断言的效力边界。
4. **⑦ 的第二条现场依赖**：`LibraryPanel.vue:38-47` 的 `progressMap` 也来自 reader-state（`progressPageFor` `:218`），与 MF-D1 同源；复位纪律修好后建议在 `data` 里登记该徽标读数，避免「行高 > 0」被 reader-state 的缺失/迟到掩盖。
5. **`[perf] data` 行是设计档新增类别**（§0.3 / §6 次级风险 8）：本步接受「独立证据行 + `[perf] JSON` 键名不变」的方案，但需负责人在动工前确认（否则 `perf-probe.mjs` 的证据面实现要返工）。

### 4. 结论

- **事实面**：设计档 §0.1 的基线读数（12483 行 / 74 SEL / 关键行号 / 965 行搬移块 / `${` = 1 / 纪律 31 / 基线 186-264-74 / `CHECK_EXIT=0`）经本步实读与实跑**逐条复核一致**；对 req 的两处纠偏（`readerStage` 在 `pix/src` 的 3 处命中、`resetAll` / `textCache.clear()` 行号）也成立。
- **可执行面**：§1.3 的 27 条指标口径、§1.4 的阈值与实现常量、§5 的验证方案、§8 的登记要求足以支撑开发，**但复位纪律（MF-D1）与 `r19-1` 相位 2（MF-D2）在当前字面下不可实现/不可通过，N108 的覆盖与证明力（MF-D3）也不足以销账 S-SD-02**；另有 7 条判据/口径需改字或补登记。
- **裁决建议**：**revise**——MF-D1 / MF-D2 / MF-D3 必须在动工前落进设计档（建议同时把 MF-D4…MF-D7 一并改字，MF-D8…MF-D10 在 dev 档登记）。修改后无需重跑需求评审，直接进入 A / B 分工。
- **未验证事项（本步明确不做）**：未跑离屏（`r19-1` 尚不存在）、未跑 `perf-probe.mjs`（脚本不存在）、未跑两条烟测、未跑 `npm run build|test|package|dev`；304 页夹具的实测体积/耗时、`quiet.absorbed` 的实测量、`ratio = after/base` 的实测比值均为**未实测**，需 dev 档登记。
