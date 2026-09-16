# PiX-Read R13 需求档 · 阅读报告（N82–N86）

> 上游：`docs/pm/PRD-V0.5.md` §1 断层 2（读完之后带不走东西：笔记能导出，但导出物是一份按文档分组的平铺清单，用户还得自己重组章节、区分摘录与 AI 结论、补上阅读进度）、§2（R13 = 阅读报告：每篇文档导出结构化 Markdown 阅读报告（章节分组 + 摘录/AI 结论 + 备注 + 阅读进度）；依赖 R9、R10）、§3（资产分层：`<工作区根>/.pix-read/reports/**` = 导出产物，全量覆盖写，目录缺失即创建，**不参与读取**，删掉不影响任何功能）、§4（版本级反需求：R13 的报告是确定性产物，**不得调用 LLM**；不引入新运行时依赖；不改 `packages/*`；不做向后兼容层；不写未被调用的死代码）、§5（工程红线：§5.1 唯一工程门、§5.2 禁 `any`/内联动态 import、§5.5 主进程 IPC 必须有入参校验与中文错误、§5.6 写盘必须落在 `.pix-read/` 内且越界一律 `outside` + 原子写、§5.7 取证纪律与冻结字面登记、§5.8 依赖零改动、§5.9 离屏脚本是唯一 UI 基线、§5.10 无临时产物）、§7.3（报告可带走：每篇文档能导出结构化报告；报告内容与 `.pix-read/notes.json` 逐条一致（字节级可判）；无笔记 / 无章节 / 无现场数据时行为明确且不报错）。
> 依赖：`docs/pm/R10-req.md` §0（导出模板 `renderNotesMarkdown` 的逐字字面与「已导出 N 条」文案、`.notes-*` 类名、原子写链路）、`docs/pm/R12-req.md` §0（`buildChapterRanges` 为区间唯一派生、`.reader-section` 与 section 行语义、取证脚本契约与零缺失制度）、`docs/pm/R12-dev.md`（R12 交付终态与基线读数 127/185/41）。
> 本轮唯一主线：**让用户读完一篇论文后能带走一份结构化、确定性（不调用 LLM）的 Markdown 报告** —— 把散落的摘录、AI 结论与备注按论文章节重新组织，落到 `<工作区根>/.pix-read/reports/<文档相对路径>.md`，一个入口、一条通道、一处渲染实现。
> 范围约束：不做 LLM 摘要/改写、不做模板定制与多格式导出（PDF/HTML/docx）、不做批量导出全部文档、不改 `notes.json`（读写协议与字节）、不改既有 `notes.md` 导出的模板与文案、不引入依赖、不做自动导出。需求编号 **N82–N86**，共 **28** 个子条。

**判定工具（本档所有验收只能由这五种证据判定，逐条已标注）**

| 记号 | 含义 |
| --- | --- |
| 【走查】 | 只读代码与 `git status` / `git diff` / `git show`（只读可用）；含 `grep -c` / `grep -rn` 计数类判据 |
| 【check】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error（唯一工程门） |
| 【烟测-渲染】 | 纯函数离线烟测 `pix/scripts/smoke-view.mjs`（R12 起可复跑，4 组 29 条）；**本轮零改动**，只作回归 |
| 【烟测-主进程】 | 数据面烟测 `pix/scripts/smoke-notes.mjs`（仓库内可复跑；本轮由 4 组 26 条 **扩到 7 组 44 条**，见 N86-1） |
| 【离屏】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + 既有截图/测量零缺失 + 新增断言组全绿 + 新增截图齐备 |

**本档事实基线（写档当天核对过的真实结果，供后续角色复核）**

| 事实 | 证据 |
| --- | --- |
| 工作树干净、分支 `main`、HEAD = `fdad504`（R12 已提交交付） | `git status --short` ⇒ 空；`git branch --show-current` ⇒ `main`；`git log --oneline -1` ⇒ `fdad504 feat(reader): 章节语义贯通（当前章节 chip、上/下一节导航与 reading_context section 行）（V0.5 R12）` |
| 唯一工程门当前 0 error | 2026-09-16 实跑 `cd pix && npm run check` ⇒ `CHECK_EXIT=0` |
| R12 交付基线产物（R13 的零缺失比对基线） | 目录 `C:/Users/86157/AppData/Local/Temp/pix-v05-r12-final`：`shots/MANIFEST.json` 的 `shots.length = 127`、`failure = null`；`shots/MEASUREMENTS.json` 长度 **185**、label 共 **41** 种（含 R12 四组：`r12-section-visible:5` / `r12-section-degrade:2` / `r12-section-nav:7` / `r12-section-context:2`）；该目录内另有 2 张**不在清单内**的历史 PNG（`zoom-pill-p1.png` / `zoom-pill-p3.png`），零缺失比对一律以 `MANIFEST.shots[].name` 与 `MEASUREMENTS.json` 的 label 为准 |
| 既有烟测面 | `pix/scripts/smoke-notes.mjs` = 4 组 26 条（`undo-roundtrip:8` / `undo-failures:8` / `undo-slot-lifecycle:6` / `export-and-empty:4`）；`pix/scripts/smoke-view.mjs` = 4 组 29 条（`section-hit:8` / `section-null:8` / `section-nav:8` / `section-format:5`）；`pix/package.json` 已有 `scripts.smoke:notes` / `scripts.smoke:view` |
| 既有导出链路（逐字读码确认） | `ipc-handlers.ts`：`ipcMain.handle("notes-export", () => exportNotesMarkdown())`；`notes-store.ts`：`NOTES_DIR_NAME = ".pix-read"` / `NOTES_FILE_NAME = "notes.json"` / `NOTES_MARKDOWN_NAME = "notes.md"`、`notesPaths(): { file, markdown } \| null`、`writeFileAtomic(target, content)`（`mkdirSync(dirname)` + 写 `${target}.tmp` + `renameSync` + 失败 `removeTemp`）、`renderMarkdownEntry(note)`（`### 第 {page} 页` / `### 第 {page} 页 · AI 结论` + `> ` 逐行 + 可选 `备注：{comment}`）、`renderNotesMarkdown(file, name, now)`（标题 `# 阅读笔记 · {工作区名}`、元信息行 `> 由 PiX-Read 导出生成，每次导出都会覆盖。资料库：{名}；生成时间：{YYYY-MM-DD HH:mm:ss}；共 {N} 条。`、组标题 `## {docPath}（{N} 条）`、条目间 `\n\n---\n\n`、文件末尾一个 `\n`）、`formatStampHuman` / `workspaceName` / `toRelativeDocPath` / `normalizeNoteText` / `isPathInsideDirectory`（来自 `library-root.ts`） |
| 面板既有字面（逐字读码确认） | `NotesPanel.vue`：`exportLabel = hasNotes ? "导出 Markdown" : "暂无笔记"`；按钮 `:disabled="!notesStore.hasNotes \|\| exporting \|\| notesStore.status === 'error'"`、`:loading="exporting"`、类名 `.notes-export-btn`、位于 `.notes-header-top`；成功行 `.notes-export-row > .export-text` 逐字 `已导出 {{ count }} 条 → .pix-read/notes.md` + 「在文件夹中显示」调 `revealPath(filePath)`；失败提示 `导出失败：{message}`；`.notes-report-*` 类名当前不存在 |
| 章节派生（R12 冻结，本轮只读复用） | `pix/src/renderer/utils/outline-notes.ts`：`buildChapterRanges(nodes, pageCount): Map<string, ChapterRange>`（键 = 预序 `root/0/1…`，值 = `{key,title,start,end,label}`；**Map 插入序 = 有页码节点的预序**，是唯一顺序来源）、`resolveCurrentChapter` / `resolveChapterNav` / `formatChapterHeading`；`notes-path.ts`：`rangeContains`（闭区间）、`matchesChapterFilter` |
| 夹具复算（实读复算，用于本档全部期望值） | 在 `%TEMP%` 用仓库内 `typescript` 编译 `pix/src/renderer/utils/outline-notes.ts` 后调用 `buildChapterRanges(SAMPLE_OUTLINE, 3)` ⇒ **7 个范围**（按 Map 插入序）：`1. Abstract` [1,1] label `1`；`2. Method Overview` [2,2] label `2`；`2.1 Sparse mask budget` [2,2] label `2`；`2.2 Positional prior` [3,3] label `3`；`3. Ablation Study` [3,3] label `3`；`Appendix A.1` [3,3] label `3`；`Appendix B` [2,3] label `2-3`（`Appendix A` 无页码 ⇒ 不进 ranges） |
| 标准种子（`ui-shot.mjs` 的 `seedNotes()`，逐字） | 4 条：`n-current-1`（`sample-paper.pdf` p1 摘录，备注「与第 3 节消融实验对照」）、`n-current-2`（`sample-paper.pdf` p2 摘录，无备注，长文）、`n-other-1`（`archive/older-paper.pdf` **p7** 摘录，无备注）、`n-current-3`（`sample-paper.pdf` p2 **AI 结论**，备注「由一次提问总结」） |
| 夹具文档与页数 | `sample-paper.pdf`（3 页，有书签）、`archive/older-paper.pdf`（2 页，**无书签**）、`long-book.pdf`（60 页）、`reading-notes.md`（**文本文档，`pageCount === 0`**）；`LIBRARY_DIR = <OUT_ROOT>/library`（`workspaceName(LIBRARY_DIR) === "library"`） |

---

## 0. 定稿修订（R13）

> 上游：`docs/pm/R13-review.md`「需求评审（R13）」的 must-fix 清单 1–6。
> 结论：**6 条全部接受、0 条拒绝**；正文已按本节就地同步（每条给出「同步位置」）。本节是**定稿口径**：与正文冲突时以本节为准。
> 复核方式：本节全部结论来自真实文件实读（`grep` / `sed` 只读）与只读 `git` 命令（HEAD `fdad504`）；本轮不跑离屏取证与烟测（留给开发 / 审查步）。行号与计数一律以本次实读为准。
> 编号说明：本节是修订记录，不参与冻结契约编号；下文 §0.1–§0.8 与 §1–§9 的编号逐字不变。
> 事实基线的读数时点：表中 `git status --short` 的「空」是**本档落盘之前**的读数（落盘后工作树会多出未跟踪的 `docs/pm/R13-*.md`）；同表的 `git branch` / `git log` 两项与当前实读一致。
> 评审 §3 的 8 条次级观察（S-1…S-8）不在 must-fix 范围，本档不据此改动正文（设计档 / 开发档按需吸收）。

### M1 在途 / 竞态语义（评审 MF-1）—— 接受：补归属守卫 + 增 delay 控制口与两条断言

- 复核（实读）：`ui-shot.mjs` 对同类在途语义确有 delay 注入先例——`setNotesRestoreDelay`（声明 `:990`，使用 `:4792`）、`setNotesAddDelay`（声明 `:1001`，使用 `:2488`）、`setReaderStateDelay`（声明 `:1026`，使用 `:1561`）；渲染层 store 的既有纪律是「过期响应不得写状态」——`notes-store.ts:100-104` 的 `loadSeq` / `writeSeq` / `undoScope`，`undoDelete` 的 `stale` 形态（`:229-239`）与面板零副作用先例（`NotesPanel.vue:238` 的 `if ("stale" in result) return;`；`NotesPanel.vue` 为 `v-show` 挂载、切标签不卸载，见 `WorkspacePage.vue:285`）。
- 处理：① §0.2 新增冻结项第 10 条（报告导出的在途归属守卫：发起前快照 `docKey` 与 `reportScope`；落地时不一致 ⇒ 丢弃并返回 stale，不写 `lastReport`、不弹 notice）；② §0.6 增对应行（含面板 `onExportReport()` 首行的 `exportingReport` 守卫，与既存 `onExport` 的 `exporting` 守卫同范式，`NotesPanel.vue:360-362`）；③ §0.7 的 stub 控制口增 `setNotesReportDelay(ms)` 并冻结「只推迟响应」；④ N83-2 增判据 4（在途双击只发 1 次 IPC）；⑤ N83-6 增判据 4（在途切文档后行不出现）；⑥ N86-3 的 `r13-5` 增相位 `inflight-guard` 承载 ④⑤（无新截图）。
- 影响面登记：record 12 → **13 条**（`r13-report-failure` 2 → 3）；截图 8 张不变。§0.7 / §0.8 / N86-1 / N86-3 / N86-4 / §7 / §9 的条数已同步。
- 同步位置：§0.2、§0.6、§0.7、§0.8、N83-2、N83-6、N86-3、§7、§9 第 7 条。

### M2 `{文档相对路径}` 双来源（评审 MF-2）—— 接受：冻结唯一来源与归属判定

- 复核（实读）：`toRelativeDocPath`（`notes-store.ts:109-115`）的产出取决于**本次入参**（`resolve` + `relative` + 越界拒绝）；存储态 `docPath` 由**入库那次**调用决定（`addNote` 的 `:300`）——Windows 下可指向同一文件而字符串（大小写 / 拼写）不同。
- 处理：§0.5「路径与写入」表新增「docPath（唯一来源）」行（`docPath = toRelativeDocPath(input.docFilePath, getLibraryRoot())`；同一字符串用于目标路径、meta 行 `文档：` 段与 `displayPath`；归属判定 = `docPathKey(note.docPath) === docPathKey(docPath)`；**不从笔记条目取 `docPath` 作展示**）；§0.3 字段表 `{文档相对路径}` 行与 N84-5 逐字冻结同步；N86-3 的 stub 契约补 `<rel>` 同口径。
- 同步位置：§0.3、§0.5、N84-5、N86-3。

### M3 `{显示名}` 大小写（评审 MF-3）—— 接受：改取保原大小写的来源

- 复核（实读）：`currentDocKey`（`notes-path.ts:23-30`）全程在小写域内运算并返回小写比较键；`docDisplayName`（`notes-path.ts:32-35`）只切末段 ⇒ 原式（`docDisplayName(currentDocKey)`）在混合大小写文档名下会渲染小写显示名，与按入参大小写拼装的 `{displayPath}` 同段不一致；夹具文件名全小写，该差异不会被任何断言发现。
- 处理：§0.6 状态行文本的 `{显示名}` 改为「发起导出那一刻的 `docDisplayName(readerStore.filePath)`」（保原大小写；不得用 `currentDocKey` 派生）；§0.7 的 `lastReport` 行点明 `displayName` 口径；N83-5 增判据 6（走查）。
- 同步位置：§0.6、§0.7、N83-5。夹具值与既有断言期望不变。

### M4 守卫与 `buildChapterRanges` 产出不自洽（评审 MF-4）—— 接受：选「守卫容忍 `end < start`」

- 复核（实读）：`buildChapterRanges`（`outline-notes.ts:52`）在节点无后继时取 `end = pageCount > 0 ? pageCount : +∞` ⇒ 书签页码超过 `pageCount` 时合法产出 `start > end`（如 `{start:5,end:3,label:"5"}`）；同文件 `countNotesByChapter`（`:86`）对 `end < start` 与 `end` 非有限的键**静默跳过**（`:116`）——退化范围不报错、不产出是既有先例。
- 处理：§0.5 守卫表的 `chapters` 行改为「`start` / `end` 为整数且 `1 ≤ start`、`1 ≤ end`；**不要求** `start ≤ end`」；N84-3 判据 1 同步；N86-1 的 `report-render` 增第 7 条断言（直接调 `exportDocumentReport` 传倒序范围 ⇒ 导出成功、该章节出现 0 次）。`+∞` 仍由 `Number.isInteger` 拒绝（防御留痕，仅在渲染层漏掉 `pageCount === 0` 短路时才会外泄）。
- 影响面登记：烟测 17 → **18 条**（`report-render` 6 → 7）；`通过 43 / 失败 0` → `通过 44 / 失败 0`。§0.7 / §0.8 / 判定工具表 / N86-1 / §7 / §9 第 7 条已同步。
- 同步位置：§0.5、N84-3、N86-1。

### M5 三条不可达的【走查】判据（评审 MF-5）—— 接受：改写为可判定式

- 复核（实读）：`grep -n "exportMarkdown" pix/src/renderer/stores/notes-store.ts` ⇒ 2 处（`:244` 定义、`:379` `return`）——Pinia setup store 的 `return` 暴露是必然的第三处命中，原「只命中 store 定义与面板的一处调用」不可达；`grep -rn "ReaderNotesReportInput" pix/src` 与 `grep -rn "阅读报告" pix/src` 当前均为 **0** 命中（新类型 / 字面尚未存在），实现后类型名允许只出现在 `import type` 行或完全不出现。
- 处理：① N83-3 判据 4 改为 `grep -c "chapters:" pix/src/renderer/stores/notes-store.ts` = 1（入参对象字面量恰一处）；② N83-2 判据 3 改为 `grep -rn "exportCurrentDocReport" pix/src | grep -v "stores/notes-store.ts" | wc -l` = 1；③ N83-6 判据 3 改为赋值点分计（`grep -c "lastReport.value = null"` = 2、成功写入 = 1）。
- 同步位置：N83-2、N83-3、N83-6。

### M6 路径边界兜底（评审 MF-6）—— 接受：补兜底口径并加一条断言

- 复核（实读）：`toRelativeDocPath` 内 `resolve(filePath)`（`notes-store.ts:110`）对相对入参以主进程 CWD 为基准；`writeFileAtomic`（`:180`）的 `mkdirSync(dirname(target), { recursive: true })`（`:184`）在目标父级为同名**文件**时抛错 ⇒ 由既有 catch 统一返回 `write-failed`（不新增码、不新增文案）。
- 处理：§0.5「路径与写入」表增「入参相对路径」与「失败兜底口径」两行（除 `no-root` / `outside` 外的一切路径类与写入类失败统归 `write-failed`，不额外保证失败后的目录状态）；N84-6 判据 3 扩为两条注入（`<报告>.tmp` 预置为目录 + 目标父级 `.pix-read/reports/archive` 预置为同名文件），期望同一条文案。
- 同步位置：§0.5、N84-6。

---

## 0. 冻结契约（设计档、开发档、评审档均不得改写）

### 0.1 本轮不得改写的既有冻结项

| 来源 | 冻结内容 | 本轮为什么不得动 |
| --- | --- | --- |
| R10 | `notes.md` 的模板与文案：`# 阅读笔记 · {工作区名}`、元信息行逐字、组标题 `## {docPath}（{N} 条）`、条目渲染 `renderMarkdownEntry`（`### 第 {page} 页` / `### 第 {page} 页 · AI 结论` + `> ` 逐行 + 可选 `备注：{comment}`）、条目间 `\n\n---\n\n`、文件末尾 `\n`；`renderNotesMarkdown` / `exportNotesMarkdown` 的行为（永远全量、与打开哪个文档无关、幂等）；`notes-export` 通道与 `notesExport` 方法名 | 报告是**另一次**导出（另一文件、另一通道）；既有导出是 R10/R12 基线与断言面的一部分，任何改动都会让既有断言与截图失去意义 |
| R10 | 面板既有字面：`导出 Markdown` / `暂无笔记`、`.notes-export-row` + `.export-text` 逐字 `已导出 {N} 条 → .pix-read/notes.md`、失败 `导出失败：{message}`、`.notes-header-top` 内的既有按钮与 `.notes-count` 计数四分叉 | 报告入口是**新增行**，不挤动既有行；`.notes-header-top` 的内容与顺序逐字不动 |
| R8 / R9 / R10 | 选择集（id 集合、上限 10、注入顺序 `sortNotesForContext`）、章节过滤（`matchesChapterFilter` 唯一判定式、`groupNotesByDocument` 第四参）、搜索/排序（`matchesSearch` / `sortNotesForView` / `applyViewToGroups`） | 报告不受任何视图维度影响（§0.2 第 6 条）：它读的是 `notes.json` 的**全量**条目，不是屏幕上的可见行 |
| R12 | 章节语义的唯一派生：`buildChapterRanges` 的区间算法与 `Map` 插入序、`resolveCurrentChapter` / `resolveChapterNav` / `formatChapterHeading` 的签名与语义、`.reader-section` 与 `<reading_context>` 的 `section:` 行 | 报告的分组范围**只取** `buildChapterRanges` 的产出；主进程不解析 outline、不重算区间（禁止第二份区间算法） |
| R12 | 取证脚本契约：`ui-shot.mjs` 的启动守卫（`PIX_SHOT_ROOT` 必须在系统临时目录内）、产物自净（只删 `<OUT_ROOT>/shots`）、结束自检（截图集合与清单双向相等 + 白名单外条目即失败）、`SEL` 与既有场景/截图/label 零删除 | 本轮只**追加**场景、断言与截图；既有 127 张截图与 185 条测量零缺失 |
| 全局 | 既有类名与文案：`.notes-*` / `.pdf-*` / `.map-*` / `.tree-*` / `.reader-section*` / `.page-label` / `.zoom-label`；主进程错误码表 `ReaderNotesErrorCode` 与 `ERROR_MESSAGES` 的既有 11 个键值 | 报告复用错误码表（不扩码），消息按调用点写死（先例：`ANSWER_TOO_LONG_MESSAGE` / `RESTORE_EMPTY_MESSAGE`）；取证断言建立在既有字面上 |

### 0.2 本轮新增冻结项（设计档、开发档、评审档均不得改写）

| # | 项 | 冻结内容 |
| --- | --- | --- |
| 1 | 报告产物路径 | `<工作区根>/.pix-read/reports/<文档相对路径>.md`（文档相对路径 = `toRelativeDocPath` 的产出：正斜杠、保原大小写）。子目录必须创建；越界一律 `outside`；`displayPath` 恒为 `.pix-read/reports/<文档相对路径>.md` |
| 2 | 报告模板 | §0.3 的逐字模板（含空行、分隔线、标题层级）；条目渲染**复用既有 `renderMarkdownEntry`**（零改动、零新模板） |
| 3 | 分组规则 | §0.4：章节组按入参顺序、**第一条命中获胜**（每条笔记恰好出现一次）、兜底组 `未归入章节` 恒最后、`chapters === []` 时退化为按页分组、0 条组不渲染 |
| 4 | IPC 契约 | 通道 `notes-export-report`；preload 方法 `notesExportReport`；入参 `ReaderNotesReportInput`（§0.5）；返回 `ReaderNotesReportResult`（§0.5）；错误码**复用** `ReaderNotesErrorCode`；三条专有文案：`报告参数不合法`（入参守卫）/ `当前文档暂无笔记，未生成报告`（空库）/ `报告写入失败`（写失败） |
| 5 | 入口字面 | `.notes-report-actions`（新行）内 `.notes-report-btn`，文本 `导出当前文档报告`、`title` `导出当前文档的阅读报告（Markdown）`；成功后的持久行 `.notes-report-row`（`.report-text` 逐字 `报告：{显示名}（{N} 条）→ {displayPath}` + `.report-reveal` 文本 `在文件夹中显示`） |
| 6 | 报告与视图维度无关 | 报告内容、条数与入口可用性**不受**搜索词 / 排序 / 章节过滤 / 「仅看当前文档」影响；入口可用性只看「是否有当前文档」与「是否在途」（错误态由「整行不渲染」承担，见 §0.6） |
| 7 | 阅读进度的来源 | 只取当前文档的**实时内存值** `readerStore.page` / `readerStore.pageCount`（`pageCount > 0` 时成对传给主进程，否则传 `null`）；**不读也不写** `reader-state.json`；章节入参同理：`pageCount === 0` ⇒ `chapters = []` |
| 8 | 零副作用 | 报告导出只写一个报告文件：不改 `notes.json` 字节、不写 `notes.md`、不写现场文件、不改选择集/过滤/排序/阅读位置；报告目录**不参与读取**、删掉不影响任何功能 |
| 9 | 渲染层不拼存储路径 | 面板与 store 不拼 `.pix-read`、不拼 `reports`、不拼路径分隔符；`filePath`（绝对）与 `displayPath`（工作区相对）一律取主进程回传值；面板只做展示 |
| 10 | 报告导出的在途归属守卫 | 同一时刻最多一个在途报告请求（在途重复点击不发第二次 IPC）；发起前快照 `docKey = currentDocKey` 与 `scope = reportScope`（`reportScope` 为 `resetNotes()` 内与 `loadSeq` / `undoScope` 同一处 `+= 1` 的作用域令牌），响应落地时 `currentDocKey !== docKey \|\| reportScope !== scope` ⇒ **丢弃结果**：不写 `lastReport`、不弹 `.notes-notice`（成功与失败同一处理）、动作返回 stale（与 `undoDelete` 的 `stale` 同范式，面板零副作用）；`exportingReport` 仍由动作的 `try/finally` 收口（丢弃路径不额外改动它） |

### 0.3 报告模板（逐字冻结）

**骨架（`\n` 为字面换行；`<空行>` = 两个 `\n`；文件末尾恰一个 `\n`）**

```
# 阅读报告 · {文档显示名}
<空行>
> 由 PiX-Read 生成，每次导出都会覆盖。资料库：{资料库名}；文档：{文档相对路径}；生成时间：{YYYY-MM-DD HH:mm:ss}；阅读进度：第 {page} / {pageCount} 页；共 {N} 条（摘录 {A} · AI 结论 {B}）。
<空行>
{组 1}
<空行>
{组 2}
…
```

| 字段 | 冻结规则 |
| --- | --- |
| `{文档显示名}` | `文档相对路径` 的最后一段（与渲染层 `docDisplayName` 同结果；`archive/older-paper.pdf` ⇒ `older-paper.pdf`） |
| `{资料库名}` | `workspaceName(getLibraryRoot())`（**复用既有唯一实现**，与 `notes.md` 同源；即工作区目录的末段，夹具下为 `library`） |
| `{文档相对路径}` | 入参 `docFilePath` 经 `toRelativeDocPath` 的产出（§0.5「docPath（唯一来源）」：正斜杠、保原大小写，与目标路径 / `displayPath` 同一字符串），非绝对路径、非显示名；**不从笔记条目的 `docPath` 取值** |
| `{YYYY-MM-DD HH:mm:ss}` | `formatStampHuman(now)`（本地时间、无 locale 依赖；**全文件唯一的非确定性字段**） |
| `阅读进度：第 {page} / {pageCount} 页；` | **整段**只在进度可得（`progress !== null`）时出现；不可得时该段连同其后的 `；` 一律不出现，其余字段顺序不变 |
| `{N}` / `{A}` / `{B}` | 该文档在 `notes.json` 中的笔记总数 / `kind === "excerpt"` 数 / `kind === "answer"` 数；**恒有 `A + B === N`**，且 `N` 恒等于报告中出现的条目数（不丢条、不重复） |
| 分组顺序 | 章节组按入参 `chapters` 顺序（§0.4），兜底组恒在其后；`chapters === []` 时只有按页组（页升序） |
| 组标题（章节组） | `## {章节标题} · 第 {label} 页（{M} 条）` |
| 组标题（兜底组） | `## 未归入章节（{M} 条）`（**无页码范围**；仅在章节数组非空且存在未归组笔记时出现） |
| 组标题（按页组，退化） | `## 第 {page} 页（{M} 条）` |
| `{章节标题}` | 入参 `chapter.title` 的空白折叠（`\s+` → 单空格 + `trim`，等价 `normalizeNoteText`）；折叠后为空 ⇒ 逐字 `未命名`（与 `collectPreorder` 的兜底同口径） |
| `{label}` | 入参 `chapter.label` 原样（`1` / `2-3` 这类既有 `buildChapterRanges` 产出，不二次格式化） |
| `{M}` | 该组条目数（章节组 = 落入该组的笔记数；兜底组 = 未落入任何章节的笔记数；按页组 = 该页笔记数） |
| 条目 | **逐字复用既有 `renderMarkdownEntry(note)`**（零改动）：`### 第 {page} 页`（excerpt）/ `### 第 {page} 页 · AI 结论`（answer）→ 空行 → 正文逐行加 `> ` 前缀 →（备注非空时）空行 + `备注：{comment}` |
| 条目分隔 | 同组内相邻条目之间**恰** `\n\n---\n\n`（与 `notes.md` 同规则）；组与组之间**恰**一个空行（`\n\n`） |
| 不做转义 | Markdown 原样输出（不转义 `*`/`_`/`#`/表格符），不做 HTML 转义 |
| 行尾 | 不产生行尾空格；文件末尾恰一个 `\n`（不以 `---` 结尾、不以空行结尾） |

**逐字示例（判定夹具：`sample-paper.pdf` + 标准种子 + 第 1 / 3 页；`<STAMP>` = `生成时间` 的值）**

```text
# 阅读报告 · sample-paper.pdf

> 由 PiX-Read 生成，每次导出都会覆盖。资料库：library；文档：sample-paper.pdf；生成时间：<STAMP>；阅读进度：第 1 / 3 页；共 3 条（摘录 2 · AI 结论 1）。

## 1. Abstract · 第 1 页（1 条）

### 第 1 页
> We study retrieval over long documents where the attention budget is the binding constraint.

备注：与第 3 节消融实验对照

## 2. Method Overview · 第 2 页（2 条）

### 第 2 页
> Table 2 reports the ablation over the sparse mask budget. Removing the positional prior costs 2.4 points of recall, which confirms the mask is doing more than sparsification alone; the effect persists when the retrieval corpus is truncated to the first 8k tokens, so the gain cannot be attributed to longer effective context windows.

---

### 第 2 页 · AI 结论
> 结论：稀疏注意力在三分之一的预算下保持召回，位置先验是关键。

备注：由一次提问总结
```

（该示例以 `\n` 收尾；`archive/older-paper.pdf` 无书签的退化形态见 §0.4 末表。）

### 0.4 分组规则与边界（逐字冻结）

**归组判定（唯一实现点 = 主进程报告渲染内的单个谓词）**

> 一条笔记属于某章节组 ⇔ `chapter.start ≤ note.page ≤ chapter.end`（**闭区间、含两端**；与渲染层 `rangeContains` 同规则）。
> 笔记可能命中多个章节（夹具：`2. Method Overview` [2,2] / `2.1 Sparse mask budget` [2,2] / `Appendix B` [2,3] 在第 2 页重叠）⇒ **取入参 `chapters` 数组中最早出现的那一个**（第一条命中获胜）。
> 未命中任何章节的笔记 ⇒ 全部归入兜底组 `未归入章节`（唯一一个兜底组，恒排在所有章节组之后）。

**三条冻结后果**

1. **恰好一次**：每条笔记在报告中**恰出现一次**（章节组互斥 + 兜底组完备）；报告条目数恒等于 `N`。
2. **空组不渲染**：条数为 0 的章节组整组不出现（不出现空标题、不留空占位、不写 `（0 条）`）。夹具后果：第 3 页无笔记时 `2.2 Positional prior` / `3. Ablation Study` / `Appendix A.1` / `Appendix B` 四个组都不出现。
3. **退化不伪造章节**：`chapters === []`（无 outline、文档未传章节、或 `pageCount === 0`）⇒ 不渲染任何章节组与兜底组，改按页分组（`## 第 {page} 页（{M} 条）`，页升序）；组内排序同 §0.4 下表。

**排序（组内）**

| 优先级 | 键 | 说明 |
| --- | --- | --- |
| 1 | `page` 升序 | 与 `notes.md` 的组内序一致 |
| 2 | `createdAt` 升序 | 同页内先摘录后结论 |
| 3 | `id` 升序（`localeCompare`） | 仅当前两键相等时生效：保证**字节级可复现**（不依赖 `Array.prototype.sort` 的稳定性） |

**边界表**

| 场景 | 冻结结果 |
| --- | --- |
| 文档无书签（`archive/older-paper.pdf`） | `chapters = []` ⇒ 按页分组；不出现 `## … · 第 … 页` 章节标题，也不出现 `未归入章节` |
| 文本文档 / PDF 未就绪（`pageCount === 0`） | `chapters = []` 且 `progress = null` ⇒ 按页分组 + 元信息行无阅读进度段 |
| 笔记页超出 `pageCount`（例如 `sample-paper.pdf` 上一条 p9 笔记） | 不钳制、不改写 `notes.json`；该条不命中任何章节 ⇒ 归入 `未归入章节` |
| 章节数组非空但无笔记命中任何章节 | 只渲染 `## 未归入章节（{M} 条）` 一组（不出现任何空章节标题） |
| 文档无笔记 | **不写文件**：渲染层前置判定不发 IPC（§2 N83-4）；主进程侧同判返回 `empty`（§0.5） |
| 同页同 `createdAt` 两条 | 按 `id` 升序（第 3 键）⇒ 两次导出逐字节相同 |

### 0.5 IPC、类型与路径（逐字冻结）

**通道与 preload 面**

| 项 | 值 |
| --- | --- |
| 通道 | `notes-export-report` |
| handler | `ipcMain.handle("notes-export-report", (_event, input: unknown) => (isReaderNotesReportInput(input) ? exportDocumentReport(input) : invalidReportInput()))` |
| preload | `notesExportReport: (input: ReaderNotesReportInput) => Promise<ReaderNotesReportResult>`（`PixApi` 接口 + `api` 实现各一处；`ipcRenderer.invoke("notes-export-report", input)`） |

**类型（`pix/src/shared/types.ts`，名字与字段逐字冻结）**

```ts
/** 单个章节范围：只带渲染所需事实（不传 key；顺序即分组顺序）。 */
export interface ReaderNotesReportChapter {
  title: string;
  start: number;
  end: number;
  label: string;
}

/** 单文档阅读报告入参：文档绝对路径 + 已算好的章节范围 + 阅读进度（不可得为 null）。 */
export interface ReaderNotesReportInput {
  docFilePath: string;
  chapters: ReaderNotesReportChapter[];
  progress: { page: number; pageCount: number } | null;
}

/** 报告导出结果：成功时 filePath 为绝对路径、displayPath 为 `.pix-read/reports/<docPath>.md`（工作区相对）。 */
export interface ReaderNotesReportResult {
  success: boolean;
  filePath?: string;
  displayPath?: string;
  count?: number;
  code?: ReaderNotesErrorCode;
  error?: string;
}
```

**入参守卫（唯一实现点 = `ipc-handlers.ts` 的 `isReaderNotesReportInput`；守卫只做形状，语义校验在 store 内）**

| 字段 | 冻结校验 |
| --- | --- |
| `docFilePath` | 非空字符串（绝对路径归属由 `toRelativeDocPath` 判定 ⇒ 越界 `outside`） |
| `chapters` | 数组（可为空数组）；每项为非空对象，`title` 为字符串、`start` / `end` 为整数且 `1 ≤ start`、`1 ≤ end`（`Number.isInteger` 同时排除 `Infinity` / `NaN`）、`label` 为非空字符串；**不要求 `start ≤ end`**——倒序范围（`buildChapterRanges` 在书签页码超过 `pageCount` 时的合法产出，例如 `{start:5,end:3}`）不整体拒绝，该组因 §0.4 的闭区间谓词恒不命中而不会出现在报告中；不设长度上限 |
| `progress` | `null` 或对象 `{ page: number, pageCount: number }`，两值为整数且 `1 ≤ page ≤ pageCount` |
| 守卫失败 | `{ success: false, code: "invalid-input", error: "报告参数不合法" }`，**零写盘**（不建目录、不建文件） |

**主进程返回面（`exportDocumentReport(input): ReaderNotesReportResult`）**

| 情形 | 返回 |
| --- | --- |
| 成功 | `{ success: true, filePath: <绝对路径>, displayPath: ".pix-read/reports/<docPath>.md", count: N }` |
| 无工作区根 | `{ success: false, code: "no-root", error: "尚未选择资料库根目录" }`（复用既有码与文案） |
| 文档不在库内 / 报告目标路径越界 | `{ success: false, code: "outside", error: "该文档不在当前资料库内" }` |
| 该文档无笔记 | `{ success: false, code: "empty", error: "当前文档暂无笔记，未生成报告" }`（**专有文案**） |
| `notes.json` 损坏 / 版本不支持 / 读取失败 | 既有码 `corrupt`（`笔记文件无法读取（文件已损坏，未被修改）`）/ `version-unsupported`（`笔记文件版本不支持`）/ `read-failed`（`笔记文件读取失败`） |
| 写盘失败 | `{ success: false, code: "write-failed", error: "报告写入失败" }`（**专有文案**） |

**路径与写入**

| 项 | 冻结 |
| --- | --- |
| docPath（唯一来源） | `docPath = toRelativeDocPath(input.docFilePath, getLibraryRoot())`（产出 `null` ⇒ 见返回面 `outside`）。该字符串是**唯一来源**：同时用于目标路径、meta 行 `文档：` 段与 `displayPath`；笔记归属判定 = `docPathKey(note.docPath) === docPathKey(docPath)`（复用既有比较键）。**不从笔记条目的 `docPath` 取值作展示**（存储态 `docPath` 由入库那次调用决定，与本次入参可在大写 / 拼写上不同） |
| 目录常量 | `notes-store.ts`：`REPORTS_DIR_NAME = "reports"`；`notesPaths()` 返回值扩为 `{ file, markdown, reports }`（`reports = join(join(root, ".pix-read"), REPORTS_DIR_NAME)`） |
| 目标路径 | `target = join(paths.reports, <docPath 按 "/" 分段>) + ".md"`；写盘前用 `isPathInsideDirectory(target, paths.reports)` **复核**，不通过 ⇒ `outside`（与 `toRelativeDocPath` 双重防护） |
| 入参相对路径 | 守卫不要求 `isAbsolute`；`docFilePath` 为相对路径时，`toRelativeDocPath` 内 `resolve()` 以主进程 CWD 为基准解析，解析结果不在库内 ⇒ `outside` |
| 失败兜底口径 | 除 `no-root` 与 `outside` 外的**一切路径类与写入类失败**（非法字符 / 超长路径 / Windows 保留名、目标父级被同名文件占用导致 `mkdirSync` 抛错、写 tmp 或 `renameSync` 失败、tmp 清理失败等）统归 `write-failed`（`报告写入失败`）：不新增错误码、不新增分支文案，也不保证失败后的目录状态（可能留下已创建的空目录） |
| 原子写 | 复用既有 `writeFileAtomic(target, content)`（`mkdirSync(dirname(target), { recursive: true })` + 写 `${target}.tmp` + `renameSync`；失败清理 tmp、原文件不动）——与 `notes.md` 同一实现，不新增写盘函数 |
| 幂等 | 整文件覆盖（无追加、无「已存在则跳过」、无增量合并）；同一 `notes.json` + 同一入参 ⇒ 除 `生成时间` 外**逐字节相同** |
| 目录/文件缺失 | 目录缺失即创建（含任意层级子目录）；文件缺失即创建；两者都不报错 |
| 失败零破坏 | 任何失败路径（含写失败）都不得创建半截报告文件、不得破坏既有报告/`notes.json`/`notes.md` 的字节 |
| 只写一个文件 | 一次导出恰好一次 `writeFileAtomic`，且目标恒在 `reports/` 内；不写 `notes.json`、不写 `notes.md`、不写现场文件 |

### 0.6 入口与反馈字面（逐字冻结）

| 项 | 逐字值 |
| --- | --- |
| 新行容器（动作） | `.notes-report-actions`（DOM 位置：`.notes-header-top` **之后**、`.notes-search` **之前**；渲染条件 `notesStore.status === "ready"`） |
| 新按钮 | `.notes-report-btn`（`v-btn`，`size="small"`、`variant="tonal"`、`prepend-icon="mdi-file-document-outline"`、占满容器行宽） |
| 按钮文本 | `导出当前文档报告`（**恒定**，不随状态变化） |
| 按钮 `title` | `导出当前文档的阅读报告（Markdown）` |
| 按钮禁用 | `:disabled="!notesStore.currentDocKey \|\| exportingReport"`、`:loading="exportingReport"`（在途防重复） |
| 新行容器（状态） | `.notes-report-row`（DOM 位置：`.notes-export-row` **之后**、`.notes-loading` **之前**；渲染条件 `notesStore.lastReport !== null`） |
| 状态行文本 | `.report-text` 逐字 `报告：{显示名}（{N} 条）→ {displayPath}`，其中 `{显示名} = docDisplayName(readerStore.filePath)`（**发起导出那一刻**的绝对路径末段，保原大小写；**不得**用 `currentDocKey` 派生——它是小写比较键，混合大小写文档名会与 `{displayPath}` 的大小写不一致）、`{N} = count`（当前文档笔记数）、`{displayPath}` 逐字取主进程回传值（如 `.pix-read/reports/sample-paper.pdf.md`、`.pix-read/reports/archive/older-paper.pdf.md`） |
| 状态行按钮 | `.report-reveal`（`v-btn`，`size="x-small"`、`variant="text"`、`prepend-icon="mdi-open-in-new"`）文本 `在文件夹中显示`，点击 `revealPath(lastReport.filePath)`（复用既有函数） |
| 无笔记提示 | `.notes-notice.is-error` 逐字 `当前文档暂无笔记，未生成报告`（**不发 IPC、不写文件**；与主进程 `empty` 文案逐字相同） |
| 失败提示 | `.notes-notice.is-error` 逐字 `生成报告失败：{主进程 error}` |
| 成功反馈 | **只有** `.notes-report-row`（不额外弹 `.notes-notice`；理由与 R10「撤销行本身就是反馈」同：一次动作只给一处反馈，且瞬时提示 4 秒后消失、带不走信息） |
| 在途归属守卫 | 见 §0.2 第 10 条：面板 `onExportReport()` 首行 `if (exportingReport.value) return`（同 `onExport` 的 `exporting` 守卫范式）；迟到的响应在 `currentDocKey` 已变或 store 已 reset 时返回 stale ⇒ 不写 `lastReport`、不弹 notice |

### 0.7 冻结的类名/常量/名字清单（离屏与烟测断言依赖，不得改名）

| 选择器 / 名字 | 含义 |
| --- | --- |
| `.notes-report-actions` / `.notes-report-btn` | 报告入口行与按钮（§0.6） |
| `.notes-report-row` / `.report-text` / `.report-reveal` | 成功后的持久状态行、行文本、在文件夹中显示按钮（§0.6） |
| `notes-export-report` / `notesExportReport` | IPC 通道名与 preload 方法名（§0.5） |
| `notes-store.ts`：`exportDocumentReport` / `REPORTS_DIR_NAME` / `REPORT_EMPTY_MESSAGE` / `REPORT_WRITE_FAILED_MESSAGE` | 主进程报告导出的唯一导出函数与三条常量（内部渲染函数命名自由、语义冻结） |
| `ipc-handlers.ts`：`isReaderNotesReportInput` / `invalidReportInput` / `REPORT_INVALID_MESSAGE` | 入参守卫与守卫失败返回 |
| `notes-store.ts`（渲染层 store）：`lastReport` / `currentDocNoteCount` / `exportCurrentDocReport` / `reportScope` | 渲染层状态与动作名（`lastReport = { filePath, displayPath, displayName, count } \| null`；`displayName` = 发起时 `docDisplayName(readerStore.filePath)`；`reportScope` = `resetNotes()` 递增的在途作用域令牌，见 §0.2 第 10 条） |
| `ui-shot.mjs`：`notesReportCalls()` / `setNotesReportFailure(code)` / `setNotesReportDelay(ms)` / `libraryShowCalls()` | stub 控制口（`notesReportCalls()` 返回 `{ count, payloads }`，`payloads` 元素含 `docFilePath` / `chapters` / `progress` / `resolvedAt`；调用进入 stub 即计数与记账，延迟只推迟**响应**） |
| `ui-shot.mjs` 的 `SEL` 新增 4 项 | `reportBtn: ".notes-report-btn"` / `reportRow: ".notes-report-row"` / `reportText: ".notes-report-row .report-text"` / `reportReveal: ".notes-report-row .report-reveal"` |
| 新场景名 / 组名 / 条数 | `r13-1`…`r13-5`；`r13-report-entry` **3** / `r13-report-content` **3** / `r13-report-fallback` **2** / `r13-report-degrade` **2** / `r13-report-failure` **3** = **13 条** |
| 新截图（冻结，8 张） | `r13-1-report-disabled.png`、`r13-1b-report-no-notes-notice.png`、`r13-2-report-row.png`、`r13-2b-report-row-left-pane.png`、`r13-3-report-fallback-row.png`、`r13-4-report-degrade-subdir.png`、`r13-4b-report-degrade-text-doc.png`、`r13-5-report-failure-notice.png` |
| 新烟测组与条数（冻结，不得减少） | `report-render` **7** / `report-files` **5** / `report-failures` **6** = **18 条**（追加在既有 4 组 26 条之后） |

### 0.8 回归基线与新增配额

| 项 | R13 冻结口径 |
| --- | --- |
| 基线 | 动工前在**新目录**（`PIX_SHOT_ROOT=<临时目录>/pix-v05-r13-base`）实跑一次，读数即本轮唯一基线；R12 交付目录 `C:/Users/86157/AppData/Local/Temp/pix-v05-r12-final`（127 张 / 185 条 / 41 label，本档已核对）作为交叉参考 |
| 零缺失判据 | 基线 `MANIFEST.shots[].name` 集合 ⊆ 验收运行集合；基线 `MEASUREMENTS.json` 的 label 集合 ⊆ 验收运行集合（既有 41 种 label、185 条测量一条不少）；`MANIFEST.json.failure === null`、退出码 0 |
| 新增配额 | 截图 **8 张**、record **13 条**（5 组）；既有 127 张 / 185 条零缺失、零改写 |
| 允许的位移与内容变更 | **仅** ① 新增 `.notes-report-actions` 行与 `.notes-report-row` 行导致的纵向位移（其下各行 `y` 增大，`x/width/height` 不变）；② 既有截图里出现新行本身的可见内容。**不允许**：`.notes-header-top` 内既有元素（`.notes-count` 文本、`.notes-export-btn` 文本/几何）的任何变化；`.notes-search` / `.notes-sort` / `.notes-filter` / `.notes-chapter-filter` / `.notes-selection-bar` / `.note-row` 自身几何与文本的变化；任何 `w/h/fontSize/color/background` 的非预期差异。任何偏差必须逐项登记在 dev 档，不得静默 |
| 内容目视比对 | 新增 8 张截图必须在 dev 档逐张登记结论（是否出现非预期的重叠 / 截断 / 换行）；报告入口行不得与 `.notes-count` 文本重叠，不得把导出按钮挤出左栏 |
| 烟测回归 | `pix/scripts/smoke-view.mjs`（4 组 29 条，**零改动**）与 `pix/scripts/smoke-notes.mjs`（既有 4 组 26 条 + 新增 3 组 18 条）都必须可复跑且全绿（退出码 0） |

---

## 1. N82 报告内容结构与渲染规则（确定性）

**用户可见行为**：点一次「导出当前文档报告」，`.pix-read/reports/` 下就出现一份按论文章节重排的 Markdown：开头是文档名、资料库名、生成时间、文档相对路径、阅读进度与条数统计；正文按章节分组（组标题带章节标题与页码范围），组内按页升序；摘录与 AI 结论一眼可分（`### 第 2 页` vs `### 第 2 页 · AI 结论`），备注跟在引用块后；文档没有书签时退化成按页分组，不会出现空章节标题。

### N82-1 头部（标题 + 元信息行 + 统计 + 阅读进度）

**逐字冻结字面**

| 项 | 值 |
| --- | --- |
| 第 1 行 | `# 阅读报告 · {文档显示名}` |
| 第 2 段（紧随一个空行） | `> 由 PiX-Read 生成，每次导出都会覆盖。资料库：{资料库名}；文档：{文档相对路径}；生成时间：{YYYY-MM-DD HH:mm:ss}；阅读进度：第 {page} / {pageCount} 页；共 {N} 条（摘录 {A} · AI 结论 {B}）。` |
| 进度不可得时的第 2 段 | `> 由 PiX-Read 生成，每次导出都会覆盖。资料库：{资料库名}；文档：{文档相对路径}；生成时间：{YYYY-MM-DD HH:mm:ss}；共 {N} 条（摘录 {A} · AI 结论 {B}）。` |
| 字段顺序 | 资料库 → 文档 → 生成时间 →（阅读进度）→ 共 N 条（摘录 A · AI 结论 B）；分隔符全角 `；`，段落以全角 `。` 收尾 |
| 统计口径 | `N` / `A` / `B` = 该文档在 `notes.json` 中的总数 / 摘录数 / AI 结论数；`A + B === N` 恒成立 |
| 进度口径 | `第 {page} / {pageCount} 页`（1-based，半角斜杠两侧各一空格；与 `.page-label` 的 `第 1 / 3 页` 同形） |

**验收判据**

1. 【烟测-主进程】组 `report-render` #1：拿 `sample-paper.pdf` + 3 条笔记（p1 摘录带备注 / p2 摘录 / p2 AI 结论）+ 三章入参 + `progress {page: 1, pageCount: 3}`，导出后读文件，**把 `生成时间` 段替换为 `<STAMP>` 占位后逐字节等于 §0.3 的手写期望串**；同时断言 `生成时间` 段恰出现 1 次且匹配 `/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/`。
2. 【烟测-主进程】组 `report-render` #2：头部逐字段——第 1 行 = `# 阅读报告 · sample-paper.pdf`；元信息行含 `资料库：ws-a`、`文档：sample-paper.pdf`、`阅读进度：第 1 / 3 页`、`共 3 条（摘录 2 · AI 结论 1）`。
3. 【离屏】`r13-2` 相位 `content-verbatim`：面板导出的报告文件中，元信息行的 `资料库：` 段 = `basename(LIBRARY_DIR)`、`文档：sample-paper.pdf`、`阅读进度：第 1 / 3 页`、`共 3 条（摘录 2 · AI 结论 1）`（逐字）。
4. 【走查】头部只由主进程渲染：渲染层不出现 `# 阅读报告`、`由 PiX-Read 生成`、`共 {N} 条（摘录` 等字面（`grep -rn "阅读报告" pix/src/renderer` 只命中按钮 `title`）。
5. 【边界】`progress === null`（文本文档）⇒ 元信息行**不含** `阅读进度：`（离屏 `r13-4` 相位 `text-doc`）。

**文件白名单条目**：`pix/src/main/notes-store.ts`（修改：新增报告渲染与导出）。

### N82-2 分组、归组唯一性与退化

**用户可见行为**：正文按章节分组，组标题写清「哪一节 · 第几页（几条）」；第 3 页没有笔记的章节不会出现空标题；超出现有页码范围的老笔记（例如文档被替换成更短版本后留下的 p9 笔记）不会丢，落到末尾「未归入章节」；文档没有书签时按页分组。

**逐字冻结**：见 §0.3（组标题三种形态）与 §0.4（归组判定、第一条命中获胜、空组不渲染、按页退化、组内排序三键）。

**验收判据**

1. 【烟测-主进程】组 `report-render` #3：入参含 3 个章节（其中 `2.2 Positional prior` [3,3] 无笔记）⇒ 报告中 `2.2 Positional prior` 出现次数为 **0**；`^## ` 行恰好 2 条且逐字为 `## 1. Abstract · 第 1 页（1 条）` / `## 2. Method Overview · 第 2 页（2 条）`。
2. 【烟测-主进程】组 `report-render` #4：追加一条 `page = 9` 的 `sample-paper.pdf` 摘录 ⇒ `^## ` 行**最后一条**逐字 `## 未归入章节（1 条）`；该条正文在全文出现次数恰为 1；`共 4 条（摘录 3 · AI 结论 1）`。
3. 【烟测-主进程】组 `report-render` #5：`chapters: []` ⇒ `^## ` 行**只有**按页组且页升序（`## 第 1 页（1 条）`、`## 第 2 页（2 条）`）；全文不含 `未归入章节`、不含 ` · 第 `。
4. 【走查】归组谓词只有一处：`grep -n "start <= \|<= chapter.end\|rangeContains" pix/src/main/notes-store.ts` 只命中报告渲染的这一处闭区间比较；`pix/src/main/**` 不出现 `buildChapterRanges` / outline 解析（主进程只接收算好的范围）。
5. 【走查】`chapter.title` 的空白折叠复用 `normalizeNoteText`（不写第二份折叠），空标题兜底逐字 `未命名`（与 `collectPreorder` 同口径）。

**文件白名单条目**：`pix/src/main/notes-store.ts`（修改）。

### N82-3 组内顺序与条目呈现

**用户可见行为**：同一节里先看摘录、后看 AI 结论（按页与创建时间）；正文是引用块；备注跟一行 `备注：…`；两条之间用 `---` 分隔。

**逐字冻结**：条目渲染逐字复用既有 `renderMarkdownEntry`（§0.3 表最后两行）；组内排序三键见 §0.4；条目间隔与组间隔见 §0.3。

**验收判据**

1. 【烟测-主进程】组 `report-render` #6：`sample-paper.pdf` 第 2 页的摘录与 AI 结论在报告中先后出现（`indexOf(摘录正文) < indexOf(结论正文)`）；条目标题逐字 `### 第 2 页` 与 `### 第 2 页 · AI 结论`；两条之间恰一处 `\n\n---\n\n`；文件 `endsWith("\n")` 且 `!endsWith("\n\n")`。
2. 【烟测-主进程】组 `report-render` #1（同一断言组内）：带备注的条目在引用块之后恰一个空行 + `备注：与第 3 节消融实验对照`；无备注的条目不出现 `备注：` 行。
3. 【走查】`renderMarkdownEntry` **零 diff**（`git diff` 不显示该函数）；`grep -c "### 第 " pix/src/main/notes-store.ts` 的新增命中为 0（`### ` 标题只由既有函数产出）。
4. 【离屏】`r13-2` 相位 `content-verbatim`：报告全文（时间戳归一化后）逐字节等于 §0.3 的手写期望串（含 `---` 分隔线与备注行）。

**文件白名单条目**：`pix/src/main/notes-store.ts`（修改）。

### N82-4 逐字模板落地（空行 / 分隔线 / 标题层级）

**逐字冻结**：§0.3 全表 + §0.3 的完整示例（`sample-paper.pdf` 标准种子）。

**验收判据**

1. 【烟测-主进程】`report-render` #1 的逐字节比较（含空行位置、`---` 分隔线、`#`/`##`/`###` 三级标题层级）。
2. 【离屏】`r13-2` 相位 `content-verbatim`：同一比较（时间戳归一化方式逐字冻结：`text.replace(/生成时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/, "生成时间：<STAMP>")`，两侧脚本都用这一条表达式）。
3. 【走查】模板只在主进程实现一处：`grep -rn "阅读报告 ·\|未归入章节" pix/src` 只命中 `pix/src/main/notes-store.ts`（与 `ui-shot.mjs` 的 stub 镜像，见 N86-3）。

**文件白名单条目**：`pix/src/main/notes-store.ts`（修改）。

### N82-5 确定性与边界

**用户可见行为**：同一份笔记、同一个文档，导出两次得到的内容除生成时间外一模一样；标题里有换行或连续空格不会破坏分组标题；没有备注就不出现空的 `备注：` 行。

**冻结规则（逐字）**

| 项 | 规则 |
| --- | --- |
| 唯一非确定性 | `生成时间` 段（`formatStampHuman(Date.now())`）。同一 `notes.json` + 同一入参 ⇒ 除该段外逐字节相同 |
| 无 LLM | 报告内容 100% 由 `notes.json` 条目 + 入参章节 + 入参进度派生；不调用 agent / 不联网 / 不读会话文件 |
| 时间来源 | 主进程 `Date.now()`（与 `exportNotesMarkdown` 同范式）；不接受渲染层传入的时间 |
| 标题折叠 | `\s+` → 单空格 + `trim`；折叠后为空 ⇒ `未命名` |
| 正文换行 | 正文写入前已被 `normalizeNoteText` 归一化为单行；渲染仍按 `\n` 逐行加 `> ` 前缀（兼容手工写入的多行） |
| 越界页 | 不钳制、不改写事实源；按 §0.4 边界表归入兜底组 |
| 空文档 | 该文档 0 条 ⇒ 主进程返回 `empty`，**不创建文件、不创建目录**（§0.5） |
| 大型文档 | 报告长度与条目数线性相关；不做截断、不做分页 |

**验收判据**

1. 【烟测-主进程】组 `report-files` #3：先向报告目标写入垃圾内容，连续导出两次 ⇒ 文件内容逐字节等于期望（无残留、无追加）；第二次与第一次（时间戳归一化后）完全相同。
2. 【烟测-主进程】组 `report-render` #6：文件末尾恰一个 `\n`；全文无行尾空格（逐行断言 `!/ $/.test(line)`）。
3. 【烟测-主进程】组 `report-render` #5：`chapters: []` 时无任何章节标题（退化路径不伪造章节）。
4. 【走查】`grep -rn "Date.now()" pix/src/main/notes-store.ts` 中报告路径只用于 `生成时间`；渲染层不出现对报告内容的重新拼装。

**文件白名单条目**：`pix/src/main/notes-store.ts`（修改）。

---

## 2. N83 入口与范围

**用户可见行为**：笔记面板头部多一行「导出当前文档报告」；没打开文档时它是灰的；点一下就在左侧出现「报告：sample-paper.pdf（3 条）→ .pix-read/reports/sample-paper.pdf.md」并在磁盘上生成文件；当前文档一条笔记都没有时点它会提示「当前文档暂无笔记，未生成报告」，且不产生任何文件。

### N83-1 入口（行、按钮、文案）

**逐字冻结**：§0.6 的 `.notes-report-actions` / `.notes-report-btn` / 文本 / `title` / 渲染条件（`status === "ready"`）。

**验收判据**

1. 【走查】`.notes-report-actions` 位于 `.notes-header-top` 之后、`.notes-search` 之前（模板顺序可核对）；`.notes-header-top` 的模板内容**零 diff**。
2. 【离屏】`r13-1` 相位 `enabled-with-doc`：打开 `sample-paper.pdf` 后 `.notes-report-btn` 文本逐字 `导出当前文档报告`、`title` 逐字 `导出当前文档的阅读报告（Markdown）`、`!disabled`；
3. 【离屏】`r13-1` 相位 `disabled-no-doc`：未打开文档时按钮在 DOM 且 `disabled === true`（截图 `r13-1-report-disabled.png`）。
4. 【走查】文案唯一：`grep -rn "导出当前文档报告\|导出当前文档的阅读报告" pix/src` 各命中 1 处（面板模板 + `title`）。

**文件白名单条目**：`pix/src/renderer/components/workspace/NotesPanel.vue`（修改）。

### N83-2 禁用条件与在途

**逐字冻结**：禁用 ⇔ `!notesStore.currentDocKey || exportingReport`；`:loading="exportingReport"`；错误态下**整行不渲染**（`status === "ready"` 才渲染）；在途归属守卫与「在途重复点击不发第二次 IPC」见 §0.2 第 10 条与 §0.6。

**验收判据**

1. 【离屏】`r13-1` 相位 `disabled-no-doc`：`disabled === true`（无当前文档）；相位 `enabled-with-doc`：`disabled === false`。
2. 【离屏】`r13-5` 相位 `write-failed-retry`：注入 `notesExportReport` 失败后再点一次 ⇒ `notesReportCalls().count` 增量恰 2（第一次失败、第二次成功），证明按钮在失败后**恢复可用**且未被永久禁用。
3. 【走查】`exportingReport` 只在动作的 `try/finally` 内翻转（失败不把按钮留在 loading）；不出现第二个报告导出入口：`grep -rn "exportCurrentDocReport" pix/src | grep -v "stores/notes-store.ts" | wc -l` = 1（只有面板一处调用；store 内的定义与 `return` 暴露不计入口——Pinia setup store 的成员暴露是必然的第三处命中，实测先例：`grep -n "exportMarkdown" pix/src/renderer/stores/notes-store.ts` = 2 处）。
4. 【离屏】`r13-5` 相位 `inflight-guard`：`setNotesReportDelay(1200)` 后在途双击 `.notes-report-btn` ⇒ `notesReportCalls().count` 增量恰 1（第二次点击被 `exportingReport` 守卫拦下，不发 IPC）。

**文件白名单条目**：`pix/src/renderer/stores/notes-store.ts`、`NotesPanel.vue`（修改）。

### N83-3 范围：当前文档、与视图维度无关

**用户可见行为**：导出的永远是**当前打开的那篇文档**：`sample-paper.pdf` 打开时导出只含它的 3 条（`archive/older-paper.pdf` 那条不出现）；搜索框里写着 `zzz`、章节过滤生效、或开着「仅看当前文档」都不改变报告内容与条数。

**验收判据**

1. 【烟测-主进程】组 `report-render` #1：报告正文不含另一文档的笔记文本（`archive/older-paper.pdf` 的条目文本出现次数为 0）；`共 3 条` 与文件条目数一致（同库另有 1 条属于别的文档）。
2. 【离屏】`r13-3` 相位 `fallback`：先在面板输入搜索词 `Table 2`（可见行数 < 总数）再导出 ⇒ 报告仍含全部 4 条（可见集合不影响报告）。
3. 【离屏】`r13-2` 相位 `payload`：IPC 入参的 `docFilePath` 逐字等于当前文档绝对路径（`join(LIBRARY_DIR, "sample-paper.pdf")`）。
4. 【走查】报告的文档筛选只由主进程做：渲染层不传 `notes`、不传可见行、不传统计（入参对象字面量恰一处：`grep -c "chapters:" pix/src/renderer/stores/notes-store.ts` = 1；类型名 `ReaderNotesReportInput` 允许只出现在 `import type` 行或完全不出现在渲染层，故不以类型名计数）。

**文件白名单条目**：`pix/src/renderer/stores/notes-store.ts`（修改）。

### N83-4 当前文档无笔记（不写文件 + 逐字提示）

**逐字冻结**：渲染层先判 `currentDocNoteCount === 0` ⇒ **不发 IPC、不写任何文件/目录**，`.notes-notice.is-error` 逐字 `当前文档暂无笔记，未生成报告`；主进程侧对同一情形返回 `empty` + 同一句文案（§0.5）。

**验收判据**

1. 【离屏】`r13-1` 相位 `no-notes-notice`：打开 `reading-notes.md`（该文档 0 条笔记）→ 点按钮 ⇒ `.notes-notice.is-error` 文本逐字 `当前文档暂无笔记，未生成报告`；`notesReportCalls().count` 增量 **0**；`<LIBRARY_DIR>/.pix-read/reports/reading-notes.md.md` **不存在**（截图 `r13-1b-report-no-notes-notice.png`）。
2. 【烟测-主进程】组 `report-failures` #3：对该情形直接调 `exportDocumentReport` ⇒ `success === false`、`code === "empty"`、`error` 逐字 `当前文档暂无笔记，未生成报告`，且 `reports` 目录**未被创建**。
3. 【走查】同一句文案在两个执行点逐字相同（`grep -rn "当前文档暂无笔记，未生成报告" pix/src` 命中 2 处：渲染层提示与主进程专有文案）。

**文件白名单条目**：`pix/src/renderer/stores/notes-store.ts`、`NotesPanel.vue`、`pix/src/main/notes-store.ts`（修改）。

### N83-5 成功反馈与失败反馈

**逐字冻结**：成功 = `.notes-report-row`（`.report-text` 逐字 `报告：{显示名}（{N} 条）→ {displayPath}` + `.report-reveal` 文本 `在文件夹中显示`）；失败 = `.notes-notice.is-error` 逐字 `生成报告失败：{主进程 error}`；成功**不**弹 notice（§0.6 最后一行）。

**验收判据**

1. 【离屏】`r13-2` 相位 `export-success`：点按钮后 `.notes-report-row` 出现，`.report-text` 逐字 `报告：sample-paper.pdf（3 条）→ .pix-read/reports/sample-paper.pdf.md`（截图 `r13-2-report-row.png` 整窗 + `r13-2b-report-row-left-pane.png` 左栏）。
2. 【离屏】`r13-2` 相位 `export-success`：整个过程 `.notes-notice` 不出现（`notesNotice() === null`），证明成功只给一处反馈。
3. 【离屏】`r13-5` 相位 `write-failed-retry`：注入 `write-failed` ⇒ `.notes-notice.is-error` 文本逐字 `生成报告失败：报告写入失败`、`.notes-report-row` 不存在、报告文件不存在（截图 `r13-5-report-failure-notice.png`）。
4. 【离屏】`r13-5` 相位 `reveal-and-clear`：点 `.report-reveal` ⇒ `libraryShowCalls()` 最后一项逐字等于报告绝对路径（`join(LIBRARY_DIR, ".pix-read", "reports", "sample-paper.pdf.md")`）；点击不写盘（报告文件哈希不变）。
5. 【烟测-主进程】组 `report-files` #1：`displayPath` 逐字 `.pix-read/reports/sample-paper.pdf.md`、`filePath` 末尾 `/reports/sample-paper.pdf.md`、`count === 3`。
6. 【走查】状态行显示名保原大小写：`lastReport.displayName` 由发起导出那一刻的 `docDisplayName(readerStore.filePath)` 生成、面板直接渲染该值（`grep -rn "docDisplayName(currentDocKey)" pix/src/renderer` = 0）；夹具文件名全小写，该差异只能由走查判定。

**文件白名单条目**：`pix/src/renderer/stores/notes-store.ts`、`NotesPanel.vue`（修改）；`pix/scripts/ui-shot.mjs`（stub 控制口）。

### N83-6 状态清理与在途

**逐字冻结**：`lastReport` 在 ① 文档切换（`watch(currentDocKey)`）、② `resetNotes()`（离开工作区 / 卸载）时置 `null`；同一文档反复导出只保留最新一次；导出中重复点击只发 1 次 IPC（`exportingReport` 守卫）；迟到的在途响应按 §0.2 第 10 条的归属守卫丢弃（`currentDocKey` 已变或 store 已 reset ⇒ 不写 `lastReport`、不弹 notice、动作返回 stale）。

**验收判据**

1. 【离屏】`r13-5` 相位 `reveal-and-clear`：导出 `sample-paper.pdf` 的报告后切到 `older-paper.pdf` ⇒ `.notes-report-row` **不在 DOM**；切回并再导出 ⇒ 行回来。
2. 【离屏】`r13-3` 相位 `idempotent`：同一文档连续导出两次 ⇒ `notesReportCalls().count` 增量恰 2 且 `.report-text` 不变。
3. 【走查】`lastReport` 的赋值点分计：`grep -c "lastReport.value = null" pix/src/renderer/stores/notes-store.ts` = 2（`watch(currentDocKey)` 与 `resetNotes()` 各一处）、成功写入恰 1 处（`grep -c "lastReport.value =" …` 合计 = 3，其中 2 处为置空）；`grep -rn "lastReport" pix/src` 不出现落盘路径（不写 settings / notes.json / reader-state.json）。
4. 【离屏】`r13-5` 相位 `inflight-guard`：在途（`setNotesReportDelay(1200)` 未结束）切到 `older-paper.pdf` 并等响应落地 ⇒ `.notes-report-row` **不在 DOM**（迟到的成功结果被归属守卫丢弃）、`.notes-notice` 为 `null`（成功与失败都不弹）。

**文件白名单条目**：`pix/src/renderer/stores/notes-store.ts`、`NotesPanel.vue`（修改）。

---

## 3. N84 存储与契约

**用户可见行为**：报告固定写到工作区里的 `.pix-read/reports/`；带子目录的文档（`archive/older-paper.pdf`）会得到 `.pix-read/reports/archive/older-paper.pdf.md`（目录自动建）；重复导出覆盖同一个文件、不追加；写失败时既有文件不被破坏、面板给出中文提示。

### N84-1 通道、handler 与 preload 面

**逐字冻结**：§0.5 的通道名、handler 形状、preload 方法签名。

**验收判据**

1. 【走查】`ipc-handlers.ts` 新增恰 1 个 `ipcMain.handle("notes-export-report", …)`；通道名与 preload 的 `ipcRenderer.invoke("notes-export-report", input)` 逐字一致；无内联动态 import、无 `any`。
2. 【走查】`preload.ts` 的 `PixApi` 接口与 `api` 实现各新增 1 处 `notesExportReport`；既有 40 个方法零改动；`ui-shot.mjs` 的 stub `pixApi` 面同步新增（见 §5 N86-3），保持「stub 面 = preload 面」的既有纪律。
3. 【check】`CHECK_EXIT=0`（类型面：`ReaderNotesReportInput/Result` 全链路必填、无默认值）。

**文件白名单条目**：`pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`、`pix/src/shared/types.ts`（修改）。

### N84-2 入参形状

**逐字冻结**：`ReaderNotesReportInput` 三字段（`docFilePath` / `chapters` / `progress`），见 §0.5；`chapters` 顺序即分组顺序；`progress` 必填、可 `null`（不给默认值：漏传即编译期报错）。

**验收判据**

1. 【走查】`shared/types.ts` 只新增 `ReaderNotesReportChapter` / `ReaderNotesReportInput` / `ReaderNotesReportResult` 三个接口；既有类型（含 `ReaderNotesExportResult` / `ReaderNotesErrorCode`）零改动。
2. 【离屏】`r13-2` 相位 `payload`：入参 `chapters` **逐字段**等于 §0.3 夹具的 7 项（顺序、`title`/`start`/`end`/`label` 全部逐字），`progress` 逐字 `{ page: 1, pageCount: 3 }`。
3. 【离屏】`r13-4` 相位 `text-doc`：文本文档的入参 `chapters` 为 `[]`、`progress === null`（`pageCount === 0` ⇒ 不派生章节、不报进度）。

**文件白名单条目**：`pix/src/shared/types.ts`、`pix/src/renderer/stores/notes-store.ts`（修改）。

### N84-3 入参校验与中文错误

**逐字冻结**：§0.5 的守卫表（形状校验）；失败返回 `{ success: false, code: "invalid-input", error: "报告参数不合法" }`（`invalidReportInput()`），零写盘。

**验收判据**

1. 【走查】`isReaderNotesReportInput` 是唯一守卫：逐字段校验（`docFilePath` 非空字符串；`chapters` 每项 `start`/`end` 整数且 `1 ≤ start`、`1 ≤ end`（**不要求 `start ≤ end`**，倒序范围见 §0.5）、`label` 非空、`title` 字符串；`progress` 为 `null` 或 `1 ≤ page ≤ pageCount` 的整数对）；守卫失败返回 `invalidReportInput()`，**不调用** `exportDocumentReport`。
2. 【走查】专有文案常量 `REPORT_INVALID_MESSAGE` 只定义 1 处（`grep -c "报告参数不合法" pix/src/main/ipc-handlers.ts` = 1）；错误码表 `ReaderNotesErrorCode` 与 `ERROR_MESSAGES` 的既有 11 键零改动。
3. 【走查】守卫是纯函数：不做 I/O、不抛错、不读写状态（只 `typeof` / `Number.isInteger` 判定）。

**文件白名单条目**：`pix/src/main/ipc-handlers.ts`（修改）。

### N84-4 返回形状

**逐字冻结**：`ReaderNotesReportResult`（§0.5）；成功时 `filePath`（绝对）+ `displayPath`（工作区相对，正斜杠）+ `count`（该文档笔记数）三者齐备；失败时 `code` + `error`（`filePath`/`displayPath`/`count` 缺省）。

**验收判据**

1. 【烟测-主进程】组 `report-files` #1：三个字段逐字断言（路径、`displayPath`、`count`）。
2. 【走查】成功返回不含 `notes` 数组（不回传全量笔记；渲染层不据此改写列表）：`grep -n "ReaderNotesReportResult" -A 8 pix/src/shared/types.ts` 的字段集合与 §0.5 逐字一致。
3. 【走查】`displayPath` 由主进程拼装：`grep -rn "reports/" pix/src/renderer` 为 0（渲染层不出现该前缀）。

**文件白名单条目**：`pix/src/shared/types.ts`、`pix/src/main/notes-store.ts`（修改）。

### N84-5 路径规则与越界

**逐字冻结**：§0.5 的路径与写入表：`<工作区根>/.pix-read/reports/<文档相对路径>.md`；`REPORTS_DIR_NAME = "reports"`；`notesPaths()` 增 `reports` 字段；写盘前 `isPathInsideDirectory` 复核；越界一律 `outside`；`<文档相对路径>` 的唯一来源与笔记归属判定见 §0.5「docPath（唯一来源）」行。

**验收判据**

1. 【烟测-主进程】组 `report-files` #2：`docFilePath = <ws>/archive/older-paper.pdf` ⇒ `displayPath` 逐字 `.pix-read/reports/archive/older-paper.pdf.md`，`reports/archive` 目录被创建，文件内容逐字（按页分组，`## 第 7 页（1 条）`）。
2. 【烟测-主进程】组 `report-failures` #2：`docFilePath = <TMP>/outside/x.pdf`（库外）⇒ `code === "outside"`、`error` 逐字 `该文档不在当前资料库内`、`reports` 目录**未新增条目**。
3. 【烟测-主进程】组 `report-failures` #1：`clearLibraryRoot()` 后 ⇒ `code === "no-root"`、`error` 逐字 `尚未选择资料库根目录`、零写盘。
4. 【走查】路径拼接唯一：`grep -n "REPORTS_DIR_NAME\|isPathInsideDirectory" pix/src/main/notes-store.ts` 命中集合只在报告渲染/导出内；渲染层与面板零命中。

**文件白名单条目**：`pix/src/main/notes-store.ts`（修改）。

### N84-6 写入语义（原子写、幂等、目录缺失、失败零破坏）

**逐字冻结**：§0.5 的写入表（复用 `writeFileAtomic`；整文件覆盖；目录/文件缺失即创建；失败零破坏；一次导出恰一次写盘）。

**验收判据**

1. 【烟测-主进程】组 `report-files` #3：垃圾内容预置 ⇒ 导出后内容逐字节等于期望（**幂等覆盖**，无残留、无重复）；连续两次导出的内容（时间戳归一化后）完全相同。
2. 【烟测-主进程】组 `report-files` #4：导出前后 `notes.json` 与 `notes.md` 的 sha256 **不变**（`notes.md` 不存在时仍不存在）；`.pix-read` 顶级条目集合的变化**恰为**新增 `reports`。
3. 【烟测-主进程】组 `report-failures` #4：两条注入各判一次——① 把 `<报告>.tmp` 预置为目录（既有报告文件字节不变）；② 把目标父级 `.pix-read/reports/archive` 预置为同名**文件**（`mkdirSync` 抛错）——两例都 ⇒ `code === "write-failed"`、`error` 逐字 `报告写入失败`；清理注入后重试均成功且内容正确（写失败不留半截文件）；失败兜底口径见 §0.5。
4. 【走查】报告写盘只调一次 `writeFileAtomic`（`grep -c "writeFileAtomic(" pix/src/main/notes-store.ts` 的增量 = 1，且目标为报告路径）；不新增写盘函数、不改 `writeFileAtomic` 实现。

**文件白名单条目**：`pix/src/main/notes-store.ts`（修改）。

### N84-7 只增一个产物目录（不参与读取、可删除、不碰事实源）

**逐字冻结**：报告目录**不参与读取**（无任何代码枚举/读取 `reports/**`）；删掉后既有功能与报告导出都必须正常（自愈重建）；导出不得写 `notes.json` 与既有 `notes.md`。

**验收判据**

1. 【烟测-主进程】组 `report-files` #5：`rmSync(reports, { recursive: true, force: true })` 后 ⇒ `loadNotes()` / `addNote()` / `exportNotesMarkdown()` 全部成功，再次 `exportDocumentReport()` 成功且内容（时间戳归一化后）与首次相同（目录被重建）。
2. 【烟测-主进程】组 `report-failures` #5 / #6：`notes.json` 损坏（非 JSON）⇒ `corrupt` + 逐字 `笔记文件无法读取（文件已损坏，未被修改）`、`notes.json` 字节不变、无报告文件产生；`{"version": 2}` ⇒ `version-unsupported` + 逐字 `笔记文件版本不支持`，同样零写盘。
3. 【走查】`grep -rn "reports" pix/src` 的命中集合 ⊆ {`pix/src/main/notes-store.ts` 的路径与文案、`pix/src/shared/types.ts` 的 `displayPath` 注释}；`readdirSync` / `readFileSync` 在报告路径上零命中（报告只写不读）。
4. 【走查】`.pix-read/` 的唯一写者纪律不变：报告写盘全部在 `pix/src/main/notes-store.ts`；`pix/src/renderer/**` 不出现 `.pix-read`（R10/R11/R12 既有纪律）。

**文件白名单条目**：`pix/src/main/notes-store.ts`（修改）；`pix/scripts/smoke-notes.mjs`（新增断言组）。

---

## 4. N85 不变性与回归

**用户可见行为**：导出报告后，笔记列表、`导出 Markdown` 的行为与提示、阅读器章节控件、AI 注入内容全部与之前一模一样；笔记文件字节不变。

### N85-1 `notes.json` 字节不变

**验收判据**

1. 【烟测-主进程】组 `report-files` #4：导出前后 `notes.json` 的 sha256 相等（含成功与失败两侧：失败组 #1/#2/#3/#5/#6 各自断言零写盘）。
2. 【离屏】`r13-2` 相位 `content-verbatim`：`notesHash()` 在导出前后相等。
3. 【走查】报告路径的代码不出现 `serializeNotes` / `NOTES_FILE_NAME`（不写事实源）。

### N85-2 既有 `notes.md` 导出零改动

**验收判据**

1. 【走查】`renderNotesMarkdown` / `renderMarkdownEntry` / `exportNotesMarkdown` / `notesPaths().markdown` 的 diff 为空；`notes-export` 通道与 `notesExport` 方法名零改动；面板的 `exportLabel`、`.notes-export-btn`、`.export-text` 字面零改动（`git diff pix/src/renderer/components/workspace/NotesPanel.vue` 不显示这些行）。
2. 【离屏】既有场景 62 的导出断言继续绿（`.export-text` 逐字 `已导出 4 条 → .pix-read/notes.md`）；报告导出与该行互不干扰：`r13-3` 断言 `.notes-report-row` 与 `.notes-export-row` 可同屏共存，`r13-1` 相位 `no-notes-notice` 断言 `notes.md` 哈希不变。
3. 【离屏】报告导出**不产生** `notes.md`：`r13-1` 相位 `no-notes-notice`（无笔记路径不发 IPC）与 `r13-2` 相位 `content-verbatim`（`.pix-read` 顶级条目变化恰为新增 `reports`）两侧共同覆盖；既有 `.notes-export-btn` 的可用性与文案在 `r13-1` 相位 `enabled-with-doc` 的防空断言中被钉住。

### N85-3 R12 章节语义零改动（唯一派生复用）

**验收判据**

1. 【走查】`git diff --stat pix/src/renderer/utils/outline-notes.ts` 为空（**零 diff**）；`buildChapterRanges` / `resolveCurrentChapter` / `resolveChapterNav` / `formatChapterHeading` / `countNotesByChapter` / `collectPreorder` 全部未被触碰。
2. 【走查】报告章节入参只来自 `buildChapterRanges` 的产出：`grep -rn "buildChapterRanges" pix/src/renderer` 的新增命中恰 1 处（store 的导出动作），组件层零新增；不出现第二份区间算法（`grep -rnE "\.(start|end)[[:space:]]*(<=|>=|<|>)" pix/src/renderer` 的命中集合 ⊆ R12 基线集合）。
3. 【烟测-渲染】`npm run smoke:view` 29 条全绿（4 组不变，退出码 0）。
4. 【离屏】既有 `r12-1`…`r12-4` 场景全部继续绿（零缺失判据的子集）。
5. 【走查】主进程不解析 outline：`grep -n "outline" pix/src/main/notes-store.ts` 为 0；`ReaderOutlineNode` 不出现在报告入参类型里。

### N85-4 既有断言与基线零缺失

**验收判据**

1. 【离屏】基线 `C:/Users/86157/AppData/Local/Temp/pix-v05-r12-final`：`MANIFEST.shots[].name`（127 个）⊆ 验收集合、`MEASUREMENTS.json` 的 label（41 种 / 185 条）⊆ 验收集合；`failure === null`、退出码 0。
2. 【离屏】既有场景 00–65 与 `r11-*` / `r12-*` 全部继续通过（既有断言零改动、零删除）。
3. 【烟测-主进程】既有 4 组 26 条零改动且全绿。
4. 【走查】`ui-shot.mjs` 的 diff 只含：stub 的报告面与控制口、`writeFixtures()` 的 reports 清理一行、`SEL` 4 项、新 helper、`r13-1`…`r13-5`；既有场景函数体零改动。

### N85-5 工程门与依赖零改动

**验收判据**

1. 【check】`CHECK_EXIT=0`（无 `any`、无内联动态 import、全部顶层 import）。
2. 【走查】`pix/package.json` **零 diff**（不新增 script，沿用既有 `smoke:notes`）；`package-lock.json`、`pix/build/**`、`packages/**`、electron-builder 配置零 diff。
3. 【走查】`git status --short` 只出现 §7 白名单内的文件（新建的 `docs/pm/R13-*.md` 与修改的源码/脚本）。

---

## 5. N86 验证面（仓库内可复跑）

### N86-1 主进程数据面烟测：就地扩展 `smoke-notes.mjs`（3 组 18 条）

**为什么扩展而不是新建 `smoke-report.mjs`（决策与理由，评审档不得改写本决策）**

1. 报告渲染与写盘是**主进程数据面**代码，落在 `pix/src/main/notes-store.ts`；`smoke-notes.mjs` 已经编译该文件并装配了本烟测所需的全部脚手架（`%TEMP%` 临时工作区 A/B、`notes.json` 真写、`sha256` 比对、`readFileSync` 真实字节、`%TEMP%` 自清理）。
2. 新建脚本要复制约 200 行脚手架（编译面、产物集合校验、模块实例一致性校验、失败信息协议），并新增一个 npm script ⇒ 触发 `pix/package.json` 改动（PRD §5.8 要求依赖字段零改动；R11/R12 各只允许加一个 script，本轮**不加**）。
3. 单一事实源纪律：报告与 `notes.md` 共用 `notesPaths` / `writeFileAtomic` / `renderMarkdownEntry`，「同一次运行里既测既有导出又测报告」比两个脚本更容易发现相互破坏。

**冻结的组与条数（不得减少）**：`report-render` **7** / `report-files` **5** / `report-failures` **6** = **18 条**；追加在既有 4 组（26 条）之后，`main()` 调用顺序固定为 `runUndoRoundtrip → runUndoFailures → runUndoSlotLifecycle → runExportAndEmpty → runReportRender → runReportFiles → runReportFailures`。

| 组 | # | 断言（失败即红） |
| --- | --- | --- |
| `report-render` | 1 | 逐字节模板：章节分组 + 备注 + 统计 + 进度；`生成时间` 段替换为占位后等于手写期望串，且该段匹配 `YYYY-MM-DD HH:mm:ss` 且恰 1 次 |
| | 2 | 头部逐字段：`# 阅读报告 · sample-paper.pdf`、`资料库：ws-a`、`文档：sample-paper.pdf`、`阅读进度：第 1 / 3 页`、`共 3 条（摘录 2 · AI 结论 1）` |
| | 3 | 空组不渲染：无笔记的 `2.2 Positional prior` 组标题出现次数 = 0；`^## ` 行恰 2 条且逐字（§0.3 示例的两个组标题） |
| | 4 | 兜底组：p9 笔记 ⇒ 末条 `^## ` 行逐字 `## 未归入章节（1 条）`；该条正文出现 1 次；统计变 `共 4 条（摘录 3 · AI 结论 1）` |
| | 5 | 无章节退化：`chapters: []` ⇒ `^## ` 行集合逐字 `["## 第 1 页（1 条）", "## 第 2 页（2 条）"]`；不含 `未归入章节` |
| | 6 | 条目与分隔：同页先摘录后结论（`indexOf` 比较）、`### 第 2 页` / `### 第 2 页 · AI 结论`、恰一处 `\n\n---\n\n`、末尾恰一个 `\n`、无行尾空格 |
| | 7 | 倒序范围不拒绝：三章入参额外追加 `{title:"Beyond", start:5, end:3, label:"5"}` ⇒ 导出**成功**（不是 `invalid-input`）、`## Beyond` 出现 0 次、`^## ` 行集合与不追加时逐字相同（闭区间谓词恒不命中，见 §0.4 / §0.5） |
| `report-files` | 1 | 返回面：`filePath` 结尾 `/reports/sample-paper.pdf.md`、`displayPath` 逐字 `.pix-read/reports/sample-paper.pdf.md`、`count === 3` |
| | 2 | 子目录：`archive/older-paper.pdf` ⇒ `displayPath` 逐字 `.pix-read/reports/archive/older-paper.pdf.md`、目录被创建、内容逐字（`## 第 7 页（1 条）` + 单条引用 + 末尾 `\n`） |
| | 3 | 幂等覆盖：预置垃圾内容 ⇒ 两次导出后文件逐字节等于期望（无残留）；两次内容（时间戳归一化）相同 |
| | 4 | 零副作用：`notes.json` 与 `notes.md` sha256 不变（`notes.md` 不存在时仍不存在）；`.pix-read` 顶级条目变化恰为新增 `reports` |
| | 5 | 目录可删：删 `reports` 后 `loadNotes` / `addNote` / `exportNotesMarkdown` / `exportDocumentReport` 全部成功，重建内容与首次相同（时间戳归一化） |
| `report-failures` | 1 | 无根：`clearLibraryRoot()` ⇒ `no-root` + 逐字 `尚未选择资料库根目录` + 零写盘 |
| | 2 | 越界：库外绝对路径 ⇒ `outside` + 逐字 `该文档不在当前资料库内` + `reports` 未新增条目 |
| | 3 | 空文档：该文档 0 条 ⇒ `empty` + 逐字 `当前文档暂无笔记，未生成报告` + `reports` 目录**未被创建** |
| | 4 | 写失败（两条注入）：`<报告>.tmp` 预置为目录（既有报告字节不变）与目标父级 `.pix-read/reports/archive` 预置为同名文件 ⇒ 两例都 `write-failed` + 逐字 `报告写入失败`；清理后重试成功 |
| | 5 | 损坏库：`notes.json` 写坏 ⇒ `corrupt` + 逐字 `笔记文件无法读取（文件已损坏，未被修改）` + `notes.json` 字节不变 + 无报告文件 |
| | 6 | 版本不支持：`{"version": 2, "notes": []}` ⇒ `version-unsupported` + 逐字 `笔记文件版本不支持` + 零写盘 |

**输出协议与自清理（既有约定不变）**：每组先打印 `== 组 <名> ==`，每条 `[通过] <组> #<序号> <说明>` / `[失败] <组> #<序号> <说明>：<实际值>`；末行逐字 `通过 {passed} / 失败 {failed}`；失败即退出码 1；临时目录在 `finally` 内 `rmSync(…, { recursive: true, force: true })`。

**验收判据**

1. 【烟测-主进程】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes` ⇒ 退出码 0、`通过 44 / 失败 0`；连续两次运行结果相同。
2. 【走查】既有 4 组 26 条零改动（`git diff` 只显示新增的函数与常量、`main()` 的三行调用追加）；脚本只读仓库源文件、只写 `%TEMP%`、运行后仓库零残留。
3. 期望值一律**手写**（不得用被测函数生成期望串）；每条失败信息可读（含实际值）。

### N86-2 渲染层纯函数烟测：零改动（回归）

**验收判据**

1. 【烟测-渲染】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:view` ⇒ 退出码 0、`通过 29 / 失败 0`；`pix/scripts/smoke-view.mjs` 零 diff。
2. 【走查】本轮不新增渲染层纯函数模块（报告内容与路径全部在主进程；渲染层的章节派生只调用既有 `buildChapterRanges`），因此**不扩** `smoke-view.mjs`：新增的渲染层逻辑是 Pinia 动作编排与模板字面，由离屏场景（`payload` 相位）与【走查】覆盖。

### N86-3 离屏场景 `r13-*`（5 场景 / 5 组 / 13 条 record / 8 张截图）

**stub 契约（`ui-shot.mjs`）**

| 项 | 冻结 |
| --- | --- |
| `notesExportReport(input)` | 真写 `<activeRoot>/.pix-read/reports/<rel>.md`，其中 `<rel>` = `input.docFilePath` 相对 `activeRoot` 的归一化路径（正斜杠、保原大小写；与主进程 `toRelativeDocPath` 同口径），meta 行 `文档：` 段与 `displayPath` 都用这同一个 `<rel>`（**不从笔记条目取 `docPath`**）；**逐字镜像**主进程模板：同分组规则、同条目渲染、同文件尾；字符串拼接、**不得使用模板字面量**——stub 是字符串模板，内部不能出现反引号；记录 `notesReportCalls`（`docFilePath` / `chapters` / `progress` / `resolvedAt`，调用进入 stub 即计数与记账）；支持 `setNotesReportFailure(code)` 注入（返回失败、零写盘）与 `setNotesReportDelay(ms)` 延迟（**只推迟响应**：落盘、计数与 payload 记录在调用时完成；`resolvedAt` = 响应返回时刻，在途为 `null`）；返回 `{ success, filePath, displayPath, count }` |
| `libraryShowInFolder` | 记录调用参数（`libraryShowCalls()`），返回 `{ success: true }`，行为不变 |
| 报告错误文案 | stub 的报告失败/空库文案必须与主进程**逐字一致**（`报告写入失败` / `当前文档暂无笔记，未生成报告`），**不得**复用 `NOTES_ERRORS` 的通用串（`笔记写入失败`）——否则离屏失败提示断言会红 |
| 既有 `notesExport` 现状 | stub 的 `notesExport` 只返回路径与条数、**不写** `notes.md`（既有行为，本轮不改）⇒ 离屏侧的 `notes.md` 断言恒为「不存在 → 不存在」；真实写盘行为由主进程烟测的 `report-files` #4 覆盖 |
| 控制口 | `__pixStub.notesReportCalls()` ⇒ `{ count, payloads }`；`__pixStub.setNotesReportFailure(code)`；`__pixStub.setNotesReportDelay(ms)`；`__pixStub.libraryShowCalls()` ⇒ `{ count, paths }` |
| 模板一致性的对齐机制 | 主进程模板由烟测逐字节钉住；stub 的输出由离屏场景与**同一份手写期望串**比对 ⇒ 两侧任何偏离都会让对方变红（stub 只是取证夹具，**不是**第二实现） |
| fixture 冻结 | `writeFixtures()` 增一行 `rmSync(join(LIBRARY_DIR, ".pix-read", "reports"), { recursive: true, force: true })`（每次运行从「无报告目录」开始，「文件不存在」类断言才可复现） |
| 场景挂载点 | `runReaderStateScenarios` 末尾（`r12-4` 的 `restoreStandardSeed()` 之后、函数收口之前）；每个场景自带复位并以其自己的 `restoreStandardSeed()` 收尾 |

**场景 `r13-1`（组 `r13-report-entry`，3 条）**

前置：`enterCleanWorkspace(seedNotes())` → `openNotesPanel(4)`（**不打开文档**）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `disabled-no-doc` | 读 `.notes-report-btn` 现场 → 截图 `r13-1-report-disabled.png`（`rectOfSelector(SEL.layoutLeft)`） | ① 按钮在 DOM、文本逐字 `导出当前文档报告`、`title` 逐字 `导出当前文档的阅读报告（Markdown）`、`disabled === true`（无当前文档） | `{ phase, button, leftWidth }` |
| `enabled-with-doc` | `backToLibraryTab()` → `openRow("sample-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 3)` → `openNotesPanel(4)` → 读按钮现场（**顺序不可颠倒**：资料库树在笔记标签下不可见） | ② `disabled === false` 且文本/title 逐字不变；③ 防空：`.notes-count` 文本不变（`共 4 条`）、既有 `.notes-export-btn` 文本逐字 `导出 Markdown` | `{ phase, button, countText, exportLabel }` |
| `no-notes-notice` | `backToLibraryTab()` → `openRow("reading-notes.md")` → `waitFor(".reader-body")` → `openNotesPanel(4)` → 点 `.notes-report-btn` → 读 notice / IPC 计数 / 文件存在性 → 截图 `r13-1b-report-no-notes-notice.png`（左栏） | ④ `.notes-notice.is-error` 文本逐字 `当前文档暂无笔记，未生成报告`；⑤ `notesReportCalls().count` 增量 **0**；⑥ `<LIBRARY_DIR>/.pix-read/reports/reading-notes.md.md` 不存在且 `.notes-report-row` 不在 DOM；⑦ `notes.md` 哈希在点击前后不变（不存在时仍不存在） | `{ phase, notice, reportCalls, reportExists, notesMdHashSame }` |

**场景 `r13-2`（组 `r13-report-content`，3 条）**

前置：`enterNotesProbe()`（`sample-paper.pdf` 第 1 页 + 笔记面板 4 行）→ 记录 `notesHash()` 与 `notes.md` 哈希（若存在）→ 记录 `notesReportCalls().count`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `export-success` | 点 `.notes-report-btn` → `waitFor(SEL.reportRow)` → 截图 `r13-2-report-row.png`（整窗）+ `r13-2b-report-row-left-pane.png`（`SEL.layoutLeft`） | ① `.report-text` 逐字 `报告：sample-paper.pdf（3 条）→ .pix-read/reports/sample-paper.pdf.md`；② `.report-reveal` 文本逐字 `在文件夹中显示`；③ `notesNotice() === null`（成功不弹提示）；④ 报告文件存在 | `{ phase, reportText, revealText, notice, fileExists }` |
| `payload` | 读 `notesReportCalls().payloads` 最后一项 | ⑤ `docFilePath` 逐字 `join(LIBRARY_DIR, "sample-paper.pdf")`；⑥ `chapters` 逐字段等于夹具 7 项（顺序 + `title`/`start`/`end`/`label`，逐字见 §0.3 事实基线表）；⑦ `progress` 逐字 `{ page: 1, pageCount: 3 }`；⑧ 一次点击只发 1 次调用（增量 1） | `{ phase, callsDelta, docFilePath, chapters, progress }` |
| `content-verbatim` | `readFileSync(join(LIBRARY_DIR, ".pix-read", "reports", "sample-paper.pdf.md"))` → 时间戳归一化 → 逐字节比对 → 复读 `notesHash()` 与 `notes.md` 哈希 | ⑨ 报告全文（`生成时间：<STAMP>` 占位后）逐字节等于 §0.3 的手写期望串；⑩ 生成时间段匹配 `YYYY-MM-DD HH:mm:ss` 且恰 1 次；⑪ `notesHash()` 不变、`notes.md` 哈希不变、`<LIBRARY_DIR>/.pix-read` 顶级条目变化恰为新增 `reports` | `{ phase, reportText, stampOk, notesHashSame, notesMdHashSame }` |

**场景 `r13-3`（组 `r13-report-fallback`，2 条）**

前置：`enterNotesProbe([...seedNotes(), outOfRangeNote()], 5)`（`outOfRangeNote()` 逐字 = `{ id: "n-out-of-range", kind: "excerpt", docPath: "sample-paper.pdf", page: 9, text: "Out-of-range excerpt: this page is beyond the document page count.", comment: "", createdAt: <seed-now - 3 * MINUTE>, updatedAt: 同值 }`；正文取该句是为了与标准种子的任何一条都不重名）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `fallback` | 点 `.notes-export-btn` → `waitFor(".notes-export-row .export-text")` → 在搜索框输入 `Table 2` → 点 `.notes-report-btn` → `waitFor(SEL.reportRow)` → 读报告文件 → 截图 `r13-3-report-fallback-row.png`（左栏） | ① `^## ` 行逐字 = `["## 1. Abstract · 第 1 页（1 条）", "## 2. Method Overview · 第 2 页（2 条）", "## 未归入章节（1 条）"]`（兜底组恒最后）；② 第 9 页那条正文出现恰 1 次；③ 第 2 页组内先摘录后 AI 结论；④ 统计逐字 `共 4 条（摘录 3 · AI 结论 1）`；⑤ **搜索生效不影响报告**（`.notes-search-input` 的 value 非空且 `.note-row` 为 1 行，报告仍是 4 条）；⑥ **与既有导出行互不干扰**：`.notes-report-row` 与 `.notes-export-row` 同屏共存，且 `.export-text` 逐字 `已导出 5 条 → .pix-read/notes.md`（R10 字面未被报告改动） | `{ phase, groups, outOfRangeCount, stats, searchValue, visibleRows, exportText, bothRows }` |
| `idempotent` | 把报告文件写成垃圾（`writeFileSync(<report>, "STALE-CONTENT\n")`）→ 再点 `.notes-report-btn` → 复读文件与 `.report-text` | ⑥ 文件（时间戳归一化后）与相位 `fallback` 的内容**逐字节相同**且不含 `STALE-CONTENT`；⑦ `notesReportCalls().count` 增量恰 2（同一文档两次导出）；⑧ `.report-text` 不变 | `{ phase, sameAsFirst, staleGone, callsDelta, reportText }` |

**场景 `r13-4`（组 `r13-report-degrade`，2 条）**

前置：`enterCleanWorkspace(seedNotes())` → `openRow("older-paper.pdf")` → `waitPdfLoaded()` → `waitPage(1, 2)` → `settleEmptyOutline()`（无书签文档的就绪点，与 `r12-2` 同口径）→ `openNotesPanel(4)`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `no-chapter-subdir` | 点 `.notes-report-btn` → `waitFor(SEL.reportRow)` → 读 `.report-text` 与报告文件 → 截图 `r13-4-report-degrade-subdir.png`（左栏） | ① `.report-text` 逐字 `报告：older-paper.pdf（1 条）→ .pix-read/reports/archive/older-paper.pdf.md`；② 报告 `^## ` 行逐字 `["## 第 7 页（1 条）"]`（按页退化，无章节标题、无 `未归入章节`）；③ 元信息行含 `文档：archive/older-paper.pdf` 与 `阅读进度：第 1 / 2 页`；④ 子目录 `reports/archive` 被创建；⑤ 入参 `chapters` 为 `[]` | `{ phase, reportText, groups, meta, chapters }` |
| `text-doc` | `js("window.__pixStub.seedNotes(" + JSON.stringify([...seedNotes(), textDocNote()]) + "), true")`（`textDocNote()` 逐字 = `{ id: "n-text-doc", kind: "excerpt", docPath: "reading-notes.md", page: 1, text: "阅读清单：sample-paper.pdf 已完成，archive/older-paper.pdf 待读。", comment: "", createdAt: <seed-now - 5 * MINUTE>, updatedAt: 同值 }`）→ `backToLibraryTab()` → `openRow("reading-notes.md")` → `waitFor(".reader-body")` → `openNotesPanel(5)` → 点 `.notes-report-btn` → 读文件 → 截图 `r13-4b-report-degrade-text-doc.png`（左栏） | ⑥ 报告 `^## ` 行逐字 `["## 第 1 页（1 条）"]`；⑦ 元信息行**不含** `阅读进度：`，含 `文档：reading-notes.md`；⑧ 入参 `chapters === []` 且 `progress === null`；⑨ `.report-text` 逐字 `报告：reading-notes.md（1 条）→ .pix-read/reports/reading-notes.md.md`；⑩ 切文档已清行：进入本相位前 `.notes-report-row` 曾不存在（防空：`older-paper.pdf` 的报告行不得残留到本相位） | `{ phase, groups, meta, payload, reportText, rowCleared }` |

**场景 `r13-5`（组 `r13-report-failure`，3 条）**

前置：`rmSync(join(LIBRARY_DIR, ".pix-read", "reports"), { recursive: true, force: true })`（同时构成「删掉报告目录不影响功能」的现场）→ `enterNotesProbe()`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `write-failed-retry` | `setNotesReportFailure("write-failed")` → 点 `.notes-report-btn` → 读 notice / 行 / 文件 → 截图 `r13-5-report-failure-notice.png`（左栏）→ `setNotesReportFailure(null)` → 再点一次 | ① `.notes-notice.is-error` 文本逐字 `生成报告失败：报告写入失败`；② `.notes-report-row` 不在 DOM；③ 报告文件不存在；④ 注入期间 `notesReportCalls().count` 增量 1（确有一次真实调用）；⑤ 清理注入后再点 ⇒ 行出现、文件存在（目录被重建）、`notesReportCalls().count` 增量 2 | `{ phase, notice, rowInDom, fileExists, callsDelta, retryRow, retryFile }` |
| `reveal-and-clear` | 点 `.report-reveal` → 读 `libraryShowCalls()` 与报告哈希 → `backToLibraryTab()` → `openRow("older-paper.pdf")` → `waitPdfLoaded()` → 读 `.notes-report-row` 存在性 → `openRow("sample-paper.pdf")` → `waitPage(1, 3)` → `openNotesPanel(4)` → 再点 `.notes-report-btn` | ⑥ `libraryShowCalls().paths` 最后一项逐字 `join(LIBRARY_DIR, ".pix-read", "reports", "sample-paper.pdf.md")`；⑦ 点击前后报告文件哈希不变（reveal 是只读动作）；⑧ 切文档后 `.notes-report-row` 不在 DOM；⑨ 切回并再导出 ⇒ 行回来且 `.report-text` 逐字 `报告：sample-paper.pdf（3 条）→ .pix-read/reports/sample-paper.pdf.md` | `{ phase, showPaths, hashSame, rowAfterSwitch, reportText }` |
| `inflight-guard` | `enterNotesProbe()` → 快照 `notesReportCalls().count` → `setNotesReportDelay(1200)` → 点 `.notes-report-btn` → 立即再点一次（同一同步段，与 31b2 同口径）→ 读 IPC 计数 → `backToLibraryTab()` → `openRow("older-paper.pdf")` → `waitPdfLoaded()` → `openNotesPanel(4)` → 轮询至最后一条 payload 的 `resolvedAt` 非空（在途响应落地）→ 读行与 notice → `setNotesReportDelay(0)` 复位 | ⑩ `notesReportCalls().count` 增量恰 1（在途第二次点击被 `exportingReport` 拦下，不发 IPC）；⑪ 在途切文档后迟到的成功响应落地 ⇒ `.notes-report-row` **不在 DOM**、`.notes-notice` 为 `null`（结果被 §0.2 第 10 条的归属守卫丢弃） | `{ phase, callsDelta, rowInDom, notice }` |

**场景末**：`restoreStandardSeed()`（与 R11/R12 收尾同纪律）。

### N86-4 基线与零缺失

动工前先跑基线（新目录 `pix-v05-r13-base`）→ 开发后跑验收（另一目录）；判据见 §0.8（127 张 / 185 条 / 41 label 零缺失、新增 8 张 / 13 条齐备、退出码 0、`failure === null`、允许的位移逐项登记）。

**验收判据**

1. 【离屏】基线目录与验收目录各自的 `MANIFEST.json` / `MEASUREMENTS.json` 读数按 §0.8 逐项比对（`missingShots = []`、`missingLabels = []`）。
2. 【离屏】新增 5 组 record 全绿、8 张截图齐备（少一张即红）。
3. 【走查】任何非预期差异（尤其 §0.8 白名单外的位移与样式）必须在 dev 档逐项登记（改哪一项、为什么、基线读数与改后读数）。

### N86-5 零残留与自清理

`ui-shot.mjs` 只写 `<OUT_ROOT>`（其启动守卫与产物自净契约不变）；`smoke-notes.mjs` 只写 `%TEMP%`；本轮不新增任何临时脚本、不新增 npm script、不留调试日志。

**验收判据**

1. 【走查】运行后 `git status --short` 只出现白名单文件（本轮预期：新建 `docs/pm/R13-req.md` 与后续 `R13-*.md`、修改的 6 个源码/脚本文件）。
2. 【走查】仓库内无临时脚本、无临时产物、无调试日志（PRD §5.10）；`ui-shot.mjs` 的结束自检（截图集合与清单双向相等 + 白名单外条目即失败）继续生效。
3. 【烟测-主进程】`smoke-notes.mjs` 运行后 `%TEMP%` 下自建的 `pix-smoke-notes-<时间戳>` 目录被删除（失败也只告警、不改退出码）。

---

## 6. 反需求（本轮明确不做）

1. **不调用 LLM**：报告 100% 确定性渲染（`notes.json` + 入参章节 + 入参进度 + `Date.now()`）；不做自动摘要、不做措辞润色、不做章节推断（章节只来自调用方传入的 `buildChapterRanges` 产出）。
2. **不做模板定制与多格式导出**：不提供标题/字段/顺序选项，不导出 PDF/HTML/docx/JSON，不加模板引擎、不加 front-matter、不加 YAML。
3. **不做批量导出全部文档**：一次只导出当前文档；「全部文档一键出报告」不在本轮（R14/R15 也不做）；既有全量 `notes.md` 平铺导出保持不变。
4. **不改 `notes.json`**：不新增字段、不改 `version`、不改写入协议、不在报告导出时写事实源（字节级不变）。
5. **不改既有 `notes.md` 导出**：模板、按钮文案 `导出 Markdown` / `暂无笔记`、提示 `已导出 N 条 → .pix-read/notes.md`、失败文案逐字不变；不把报告内容并进 `notes.md`。
6. **不引入依赖、不改 lockfile、不改 `packages/**`、不改 electron-builder 配置**：`pix/package.json` 零改动（本轮不新增 npm script）。
7. **不做自动导出**：不因翻页/摘录/定时/关闭文档而写报告；唯一写盘触发是用户点击 `.notes-report-btn`。
8. **不做报告回读与双向同步**：报告不参与任何读取（不解析、不检索、不注入 `<reading_context>`），删掉后无任何功能受影响；不把报告写进会话。
9. **不新增阅读现场写入**：报告不写 `reader-state.json`；阅读进度只读当前内存值。
10. **不新增第二处存储路径拼装**：渲染层不拼 `.pix-read` / `reports` / 路径分隔符。
11. **不删除、不重命名、不改写既有离屏场景与截图**（PRD §5.7）：既有 127 张 / 185 条零缺失，只允许追加。
12. **不做第二个报告入口**：不加右键菜单、不加快捷键、不加命令面板项、不加「复制报告内容到剪贴板」。
13. **不做报告文件的额外能力**：不做历史版本、不做增量合并、不做文件名自定义、不做多文档合并、不做删除报告入口。
14. **不给报告加样式/主题变量/动画**：不引入新全局 CSS 变量，不新增过渡动画。

---

## 7. 文件白名单（逐文件 + 改动点）

| # | 文件 | 动作 | 对应需求 | 改动点（不得越界） |
| --- | --- | --- | --- | --- |
| 1 | `pix/src/main/notes-store.ts` | 修改 | N82 / N84 / N85 | 新增 `REPORTS_DIR_NAME`、`REPORT_EMPTY_MESSAGE`（`当前文档暂无笔记，未生成报告`）、`REPORT_WRITE_FAILED_MESSAGE`（`报告写入失败`）；`notesPaths()` 返回值增 `reports` 字段；新增唯一导出 `exportDocumentReport(input): ReaderNotesReportResult` 与其私有渲染（分组、模板、排序、路径复核、原子写）；**复用** `writeFileAtomic` / `toRelativeDocPath` / `normalizeNoteText` / `formatStampHuman` / `workspaceName` / `renderMarkdownEntry` / `readNotesFile` / `docPathKey` / `isPathInsideDirectory`（全部零改动）；`renderNotesMarkdown` / `exportNotesMarkdown` / 既有通道实现零 diff |
| 2 | `pix/src/main/ipc-handlers.ts` | 修改 | N84-1 / N84-3 | 新增 `ipcMain.handle("notes-export-report", …)`（守卫失败 ⇒ `invalidReportInput()`）、`isReaderNotesReportInput`（形状校验）、`REPORT_INVALID_MESSAGE = "报告参数不合法"`、`invalidReportInput()`；既有 7 个笔记相关 handler（`notes-load` / `notes-add` / `notes-update` / `notes-delete` / `notes-restore` / `notes-export` / `notes-reset`）与 `invalidNotesInput()` 零改动；import 增 `exportDocumentReport` |
| 3 | `pix/src/main/preload.ts` | 修改 | N84-1 | `PixApi` 接口与 `api` 对象各新增 1 处 `notesExportReport`；其余方法零改动 |
| 4 | `pix/src/shared/types.ts` | 修改 | N84-2 / N84-4 | 新增 `ReaderNotesReportChapter` / `ReaderNotesReportInput` / `ReaderNotesReportResult` 三接口；`ReaderNotesErrorCode` 不扩；既有类型零改动 |
| 5 | `pix/src/renderer/stores/notes-store.ts` | 修改 | N83-2…N83-6 / N84-2 | 新增 `lastReport`、`currentDocNoteCount`（复用 `groupNotesByDocument`，**不写第二处文档归属比较**）、`exportCurrentDocReport()`（前置判定 + 章节/进度派生 + 调 IPC + 写 `lastReport`，其中 `displayName` = 发起时 `docDisplayName(readerStore.filePath)`）、`reportScope`（`resetNotes()` 递增）与在途归属守卫（§0.2 第 10 条，丢弃时返回 stale）、`watch(currentDocKey)` 与 `resetNotes()` 内的 `lastReport` 清理；不拼接任何存储路径；既有动作/派生/注入顺序零改动 |
| 6 | `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | N83-1…N83-6 | 新增 `.notes-report-actions` 行（`.notes-report-btn`）、`.notes-report-row` 行（`.report-text` / `.report-reveal`）、`onExportReport()`、`exportingReport` 状态与样式；`.notes-header-top`、`.notes-export-row`、既有 handlers / 样式零改动 |
| 7 | `pix/scripts/smoke-notes.mjs` | 修改 | N86-1 | 新增 3 组共 18 条（`report-render` / `report-files` / `report-failures`）与所需常量/helper（`DOC_ARCHIVE` / `REPORTS_A` / `REPORT_A` / `STAMP_RE` / `normalizeStamp`）；`main()` 追加三行调用；既有 4 组 26 条与输出协议零改动 |
| 8 | `pix/scripts/ui-shot.mjs` | 修改 | N86-3 | stub：`notesExportReport`（真写 + 记录 + 失败/延迟注入）、`libraryShowInFolder` 记录、`__pixStub` 四个控制口；`writeFixtures()` 增 `rmSync(.pix-read/reports)` 一行；`SEL` 增 4 项；新增 helper 与 `r13-1`…`r13-5`（5 组 13 条 record、8 张截图）；既有场景/截图/label/SEL 零改动、零删除 |
| 9 | `pix/package.json` | **不改**（登记为不动） | N86-1 | 报告烟测就地扩展 `smoke-notes.mjs`，因此不新增 script；依赖字段与 lockfile 零改动（PRD §5.8） |
| 10 | `docs/pm/R13-*.md` | 新建 | — | 本档（`R13-req.md`）与后续 `R13-design.md` / `R13-review.md` / `R13-dev.md` |

**范围外（任何情况下不动）**：`packages/**`、`package-lock.json`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/src/renderer/utils/**`（含 `outline-notes.ts` / `notes-path.ts` / `notes-view.ts` / `reading-context.ts`）、`pix/src/renderer/components/workspace/{PdfViewer,KnowledgeMap,ReaderPanel,LibraryPanel,PdfSearchPanel,PdfSelectionQuickAsk,ChatPanel}.vue`、`pix/src/renderer/stores/{reader-store,reader-state-store,project-store,chat-store}.ts`、`pix/src/main/{library-root,reader-state-store,session-bridge,reading-prompt}.ts`、`pix/scripts/smoke-view.mjs`、`pix/resources/**`、`docs/pm/**` 的历史档件、`.gitignore`、`README.md`。

---

## 8. 风险 Top3 与判定方式

**R1「报告与事实源不一致（丢条 / 重复 / 顺序漂移）」** —— 分组最容易写出「同一条落进多个章节组」（夹具里第 2 页同时命中 `2. Method Overview` [2,2]、`2.1 Sparse mask budget` [2,2]、`Appendix B` [2,3]）或「越界页悄悄丢弃」两类缺陷，两者都会让「报告内容与 `notes.json` 逐条一致」失败。

- 判定：烟测 `report-render` #1/#3/#4（逐字节 + `^## ` 行集合 + 兜底组恒最后 + 正文出现次数 = 1）、`report-files` #3（幂等覆盖无重复）；离屏 `r13-3`（兜底组与组内顺序、搜索生效时报告仍 4 条）。
- 失败信号：报告中某条正文出现 0 次或 ≥ 2 次；`共 N 条` 与条目数不等；兜底组不在最后或出现两个兜底组。

**R2「报告导出破坏既有资产或既有导出」** —— 报告写盘若走了 `notes.json` 的路径、复用了 `notesPaths().file`、或顺手写了 `notes.md`，就会破坏唯一事实源或 R10 的导出基线。

- 判定：烟测 `report-files` #4（`notes.json` / `notes.md` sha256 不变、`.pix-read` 顶级变化恰为 `reports`）与 `report-failures` #5/#6（损坏/版本不支持时零写盘）；离屏 `r13-2` 相位 `content-verbatim` 的 `notesHashSame`；走查 `writeFileAtomic` 调用点增量恰 1。
- 失败信号：`notes.json` 哈希变化；`.pix-read` 出现第三个新条目；`renderNotesMarkdown` 出现 diff。

**R3「新入口挤动面板既有版面」** —— 在 `.notes-header-top` 内塞第二个按钮最可能把计数文本挤掉行或让导出按钮换行，进而影响既有场景的读数与截图。

- 判定：走查（`.notes-header-top` 模板零 diff、新行插在它之后）；离屏 `r13-1` 相位 `enabled-with-doc` 的防空断言（`.notes-count` 文本不变、`.notes-export-btn` 文本不变）；§0.8 的允许位移白名单（只允许新行导致的纵向位移）；8 张新截图逐张目视登记。
- 失败信号：`.notes-header-top` 出现 diff；`.notes-count` 文本变化或与报告按钮重叠；`.notes-export-btn` 换行/被截断。

**次级风险（不占 Top3）**：① stub 的报告镜像与主进程模板偏离 —— 两侧都与同一份**手写**期望串比对，任一侧偏离都会变红（不是静默通过），但会带来一次额外的修复往返；② `.notes-report-row` 与 `.notes-export-row` 同时存在时左栏高度增长 —— 面板可滚动，`r13-3` 断言两行共存，不做几何冻结；③ 文本文档（`pageCount === 0`）与「PDF 未就绪」窗口共用退化分支 —— `r13-4` 已把「无章节 + 无进度」钉在文本文档上，PDF 未就绪窗口不在本轮断言面（同一分支已覆盖）；④ 大小写不敏感的同名文档（既有比较键语义）在 Windows 上必然指向同一份报告文件 —— 属既有比较键语义，本轮不改、不登记为缺陷。

---

## 9. 开放问题（需负责人确认，不阻塞本档定稿）

1. **入口形态**：本档冻结为「`.notes-header-top` 之后另起一行 + 一个整宽按钮」（离屏断言依赖稳定选择器，且左栏宽度约 268px，塞进既有头部行会把计数文本挤掉）。若设计档坚持放进头部行或改成菜单/图标按钮，需在设计档重列等价选择器与文案，并在本档 §0.6/§0.7 登记为冻结字面变更（§0.8 的允许位移也随之改写）。
2. **成功反馈只给持久行、不弹瞬时提示**（§0.6 最后一行）。若负责人要求「toast」式的瞬时成功提示，逐字建议 `.notes-notice.is-success` = `已生成报告：{显示名}（{N} 条）`，只增一条断言，不影响其余判据。
3. **报告行随文档切换清除**（N83-6 冻结）。若希望保留「最近一次报告入口」，需改为不过滤文档并在行内保留文档名 —— 会增加一条断言与一处状态语义，由负责人裁决。
4. **`资料库名` 取工作区目录名**（`workspaceName`，与既有 `notes.md` 同源）而非 settings 里的项目显示名。夹具下该值为目录末段 `library`。若要求与界面显示名一致，需要把显示名作为入参传入（改变 IPC 形状）。
5. **章节组标题沿用 `label`**（`· 第 2-3 页` 形态，与 `formatChapterHeading` / 地图 `.page-badge` 同源；`label` 为 `start-end` 或单页 `start`）。若要求写成绝对区间（例如总是 `第 2-3 页`、单页写 `第 2-2 页`），需要改 `buildChapterRanges`（本轮禁止）或在主进程重算（破坏唯一派生）；届时同步改 §0.3 的组标题字面与全部期望值。
6. **报告入参不设章节数组长度上限**（形状合法即可）。若要求上限（例如 2000 项），需补一条 `invalid-input` 断言。
7. **新增配额**（8 张截图 / 13 条 record / 18 条主进程烟测）是否超出本轮容量：如需压缩，优先保留 `r13-report-entry`（入口与禁用态、无笔记）、`r13-report-content`（内容逐字节 + 入参 + 零副作用）、`r13-report-failure`（失败路径）三组；`r13-report-fallback` 与 `r13-report-degrade` 可各自合并为 1 条 record（合并后仍**不得**删除「兜底组恒最后」「无章节退化」两项判据）。烟测 18 条中 `report-render` #1/#4/#5/#7 与 `report-files` #3/#4 不得删减。
