# R13 需求评审（挑刺）

评审对象：`docs/pm/R13-req.md`（工作树未跟踪；HEAD `fdad504`）
评审角色：独立需求评审员（挑刺）。本步只做只读走查 + `cd pix && npm run check` + `%TEMP%` 内独立复算（已删除），未跑离屏取证与烟测脚本，未执行任何 git 写命令。

**总判定：需要修订后才能进入设计档（6 条 must-fix，均不涉及产品方向）。**
经复核成立的部分：§0.3 模板的逐字可判性（含示例正文/备注与真实夹具逐字一致）、章节区间只取 `buildChapterRanges` 的产出、路径的「双重防护」主体、错误码复用（不扩 11 键表）、文件白名单与改动点一一对应、离屏场景的可构造性（子目录文档与 helper 都在）。

---

## 一、must-fix 清单

### MF-1 在途/竞态语义既不可判定、也没有归属守卫（N83-2 / N83-6）

- 证据 1（不可判定）：本档 `:256` 冻结的 stub 控制口只有 `notesReportCalls()` / `setNotesReportFailure(code)` / `libraryShowCalls()`，而 `:443` 冻结「导出中重复点击只发 1 次 IPC（`exportingReport` 守卫）」。既有 harness 对同类在途语义都留了 delay 注入（`ui-shot.mjs:1561` `setReaderStateDelay`、`:2488` `setNotesAddDelay`、`:4792` `setNotesRestoreDelay`），报告面无 delay 口 ⇒ 这条冻结语义没有任何可判定证据（N83-2 的三条判据都不含「在途双击」）。
- 证据 2（无归属守卫）：渲染层 store 的既有纪律是「过期响应不得写状态」——`renderer/stores/notes-store.ts:100-104` 的 `loadSeq` / `writeSeq` / `undoScope`（`:271` 注释「跨工作区残留防护」）。本档对 `lastReport` 只冻结「切换文档 / `resetNotes()` 时置 `null`」（`:443`）：在途响应落地时 `currentDocKey` 已变（或已 reset）的话，迟到的成功结果会把已清除的状态行写回。r13-5 相位 `reveal-and-clear` 因不在途而不会红，属潜伏缺陷。
- 收口：① 冻结判定式——「发起前记录 docKey，落地时与 `currentDocKey` 不一致或 store 已 reset ⇒ 丢弃结果（不写 `lastReport`、不弹失败提示、不改 loading）」；② `:256` 增 `setNotesReportDelay(ms)`，补两条断言（在途双击只发 1 次 IPC；在途切文档后 `.notes-report-row` 不出现）。若不增控制口，必须在 N83-2 显式写「该条只由走查判定」并给出可核对位置。

### MF-2 `{文档相对路径}` 有两个来源，且「笔记归属该文档」的判定未冻结（§0.2 #1 vs §0.3）

- 证据：`:52` 写「文档相对路径 = `toRelativeDocPath` 的产出」，`:81` 写「= 存储态 `docPath`」。两者不等价：`toRelativeDocPath(filePath, root)`（`notes-store.ts:109-115`）产出的字符串来自**本次入参**；存储态 `docPath` 来自**当初入库**的那次调用（大小写/拼写可不同；Windows 下指向同一文件但字符串不同）。§0.4 只冻结页码谓词，「按什么键把笔记归到该文档」在 §0.4/§0.5 中缺失（只在 §7 白名单第 1 行提到「复用 `docPathKey`」）。报告文件名 / meta 行的 `文档：` 段 / 可见笔记集合因此可能分叉，而主进程实装与 `ui-shot.mjs` stub 镜像是两处独立实现（`:650` 冻结「逐字镜像主进程模板」），分歧不会被任何断言发现。
- 收口：在 §0.4 或 §0.5 加一行唯一来源与唯一定义：`docPath = toRelativeDocPath(input.docFilePath, getLibraryRoot())`（同一字符串用于 target、meta 行 `文档：` 段、`displayPath`）；归属判定 = `docPathKey(note.docPath) === docPathKey(docPath)`；并写明「不从笔记里取 `docPath` 作展示」。

### MF-3 `{显示名} = docDisplayName(currentDocKey)` 会丢原大小写（§0.6）

- 证据：`:240` 冻结该式。`currentDocKey`（`renderer/utils/notes-path.ts:23-30`）全程在小写域内运算并返回小写比较键，`docDisplayName`（同文件 `:32-35`）只切末段 ⇒ 混合大小写文档名下会渲染 `报告：attentionisallyouneed.pdf（3 条）→ .pix-read/reports/AttentionIsAllYouNeed.pdf.md`（同一行内两个大小写不一致）。离屏夹具文件名全小写 ⇒ 12 条 record 全绿也盖不住。
- 收口：`{显示名}` 改取保原大小写的来源（当前文档组的 `displayName`，或 `readerStore.filePath` 的末段），同步改写 `:240` 的表述（夹具值不变，不动既有断言期望）。

### MF-4 守卫 `1 ≤ start ≤ end` 与「chapters 只取 `buildChapterRanges` 的产出」不自洽

- 证据（独立复算：用仓库内 typescript 编译 `pix/src/renderer/utils/outline-notes.ts` 并在 `%TEMP%` 实跑，临时目录已删）：
  - `buildChapterRanges([{title:"Beyond",page:5,items:[]}], 3)` ⇒ `{start:5,end:3,label:"5"}`（合法产出，但按 §0.5 守卫会被整体拒绝 ⇒ 用户看到「报告参数不合法」，而不是报告）。
  - `pageCount === 0` 且末节点无后继 ⇒ `end = Infinity`（真实产出；只在渲染层漏掉 `pageCount === 0` 短路时才会外泄）。
- 可达性说明（避免过度报警）：`PdfViewer.vue:142-163` 的 `convertOutline` 页码来自 `doc.getPageIndex(ref)+1`，正常不越界 ⇒ 属防御性分歧。但既然守卫按形状严判，档内必须二选一写死「渲染层只传 `Number.isInteger(start) && Number.isInteger(end) && 1 ≤ start ≤ end` 的范围」或「守卫容忍 `end < start`（该组永不命中、不整体拒绝）」，并配一条边界断言。
- 收口：§0.5 守卫表加该判定 + 一条断言（烟测直接调 `exportDocumentReport` 传倒序范围，期望值写死其一）。

### MF-5 三条【走查】判据在真实代码 / TS 语法下不可达

- (a) `:411`：`grep -rn "ReaderNotesReportInput" pix/src/renderer` 「只命中构造入参的那一处对象字面量」——类型名要么出现在 `import type` 行（2 处），要么完全不出现（靠 `PixApi` 签名推断 ⇒ 0 处）；「恰 1 处」不可达。
- (b) `:398`：`grep -rn "exportCurrentDocReport" pix/src` 「只命中 store 定义与面板的一处调用」——Pinia setup store 的 return 对象是必然的第 3 处。实测先例：`grep -n "exportMarkdown" src/renderer/stores/notes-store.ts` ⇒ 2 处（`:244` 定义、`:379` return），加面板调用即 3 处。
- (c) `:449`：`lastReport` 「写入点恰 2 处」——`:443` 同时要求 `watch(currentDocKey)` 与 `resetNotes()` 各置 `null` ⇒ ≥3 个赋值点。
- 收口：改写为可判定式，例如 `grep -c "lastReport.value = null" pix/src/renderer/stores/notes-store.ts` = 2；`grep -rn exportCurrentDocReport pix/src | grep -v stores/notes-store.ts | wc -l` = 1；类型面改为 `grep -c "chapters:" pix/src/renderer/stores/notes-store.ts` = 1。

### MF-6 路径边界只写了一半（§0.5 守卫表 / N84-6 #4）

- 已写清（复核成立）：`..` 与库外绝对路径由 `toRelativeDocPath`（`notes-store.ts:109-115`：`resolve` 归一化 + 拒绝 `..` 段 + `isLibraryFilePath`，`library-root.ts:38-50` 含 realpath 兜底）与写盘前 `isPathInsideDirectory(target, paths.reports)`（`library-root.ts:26-31`）双重防护 ⇒ 越界必 `outside`。
- 未写清：① 入参若为**相对路径**，`resolve()` 以主进程 CWD 为基准（守卫只校验「非空字符串」，未要求 `isAbsolute`）；② 非法字符 / 超长路径 / Windows 保留名 ⇒ 仅由 `write-failed` 兜底，档内未点名；③ 目标父级被同名**文件**占用（例如 `.pix-read/reports/archive` 是文件）⇒ `mkdirSync` 抛错 ⇒ `write-failed`，而 N84-6 #4 的注入点只覆盖「`<报告>.tmp` 预置为目录」。
- 收口：§0.5 加一句兜底口径（「除 `outside` 外的一切路径类失败统归 `write-failed`，不新增错误码，不保证失败前的目录状态」），并把 ③ 或 ① 之一补成一条断言（可选）。

---

## 二、逐条核对清单结论

### 1. N82 模板是否逐字可判（空行 / 分隔线 / 层级 / 缩进 / emoji 与符号 / 时间格式）

**结论：可判（唯一不可判处 = `{显示名}`，见 MF-3）。**

- 空行与层级：§0.3 给全骨架（标题行 → 空行 → 元信息行 → 空行 → 组 → …），并逐条写死「条目间 `\n\n---\n\n`」「组间恰一个空行」「文件末尾恰一个 `\n`，不以空行结尾」。示例（`:99-122` 的代码块）与 §0.4 的组标题三形态一致。
- 条目渲染复用既有 `renderMarkdownEntry`（`notes-store.ts:253-261`，零改动面）⇒ `### 第 N 页` / `### 第 N 页 · AI 结论` / 空行 / `> ` 逐行 / 可选 `备注：` 的字节形态由既有实现钉死；`:328` 用 `grep -c "### 第 "` = 1（实测现值 1）钉住「不新增第二份标题产出」。
- 符号：只用 `·`、全角 `；`/`。`/`（）`，无 emoji、无缩进（示例即判据），与既有 `notes.md` 同风格。
- 时间格式：文档给出的既有函数名**真实存在**——`notes-store.ts:221-227` `formatStampHuman(ms)`，输出本地时间 `YYYY-MM-DD HH:mm:ss`、无 locale，与既有 `notes.md` 元信息行同源；两侧（烟测与离屏）共用同一条归一化正则（N82-4 #2）。
- 夹具一致性（逐字复核）：§0.3 示例的三条正文与两条备注与 `ui-shot.mjs:320-368` 的 `seedNotes()` 逐字一致（含长文一条的换行拼接）；我独立复算 `buildChapterRanges(SAMPLE_OUTLINE, 3)` 得 7 个范围、插入序与 label 与 §0.3 事实基线表完全一致（`1. Abstract`[1,1]`1`、`2. Method Overview`[2,2]`2`、`2.1`[2,2]`2`、`2.2`[3,3]`3`、`3. Ablation Study`[3,3]`3`、`Appendix A.1`[3,3]`3`、`Appendix B`[2,3]`2-3`；`Appendix A` 无页码不入表）。

### 2. 阅读进度来源是否现实可得

**结论：是，且入参形状与校验已写清。**

- 主进程**不持有**当前页 / 页数：落盘侧只有 `reader-state.json` 的 `{page, scale}`（本档明确不读，§0.2 #7），实时值在渲染层——`reader-store.ts:25-29` 的 `filePath` / `page` / `pageCount` / `outline`，页面文本由 `PdfViewer.vue:996` 渲染。本档正规定义为「只取渲染层实时内存值 + `pageCount > 0` 时成对传，否则 `null`」。
- 入参形状与校验：§0.5 `progress: { page: number; pageCount: number } | null` + 守卫「两值整数且 `1 ≤ page ≤ pageCount`」；`reader-store` 的 `setPage`/`setPageCount` 自带钳制（`reader-store.ts:109-118`）⇒ 形状前提成立。
- 文本文档退化前提成立：ReaderPanel 对 `.md` 只走 `loadTextFile`，不设页码；PdfViewer 起手 `setPageCount(0)`（`PdfViewer.vue:640`）⇒ r13-4 的 `chapters === []`、`progress === null` 可复现。
- 缺口：① 「progress 必须与 `docFilePath` 同属当前文档」未写（由按钮的 `currentDocKey` 禁用条件隐含，可接受）；② 范围边界见 MF-4。

### 3. N84 路径与安全（逐项）

| 边界 | 结论 |
| --- | --- |
| 相对路径含 `..` | 闭合：`toRelativeDocPath` 内 `resolve()` 归一化后 `relative()` 不可能含 `..`，且显式拒绝以 `..` 开头的相对段；写盘前 `isPathInsideDirectory(target, reports)` 复核（`library-root.ts:26-31`）⇒ `outside`。已写清（§0.5 + N84-5 #2「库外绝对路径」断言）。 |
| 绝对路径 | 正常路径；文档未要求 `isAbsolute` 形状校验（相对路径的 `resolve()` 基准是主进程 CWD）——见 MF-6①。 |
| 大小写 | 文件层面在 Windows/NTFS 上恒为同一份报告（§8 次级风险④ 的结论成立，我复核：`toRelativeDocPath` 不做 realpath、NTFS 不区分大小写）；字符串层面（meta 行 / `displayPath` / 归属判定）存在 MF-2 的双来源分歧。 |
| 非法字符 / 超长路径 / 保留名 | 未点名；兜底为 `write-failed`——见 MF-6②。 |
| 目录已存在为文件 | 未覆盖：N84-6 #4 注入的是「`<报告>.tmp` 为目录」，不是「父级为文件」——见 MF-6③。 |
| 越界判定落点 | 正确落在 `.pix-read/reports` 内（`isPathInsideDirectory(target, paths.reports)`，而非工作区根），与 `notesPaths()`（`notes-store.ts:70-75`，`NotesPaths` 接口 :61-64）扩字段方案自洽；`docPathKey`（`:99`）与 `toRelativeDocPath`（`:109`）的复用要求与真实实现一致。 |

### 4. N83 的无笔记 / 未打开文档 / 在途并发 / 失败提示

- 无笔记：**逐字写死且双层同句**——渲染层前置（`currentDocNoteCount === 0` ⇒ 不发 IPC、不写文件）+ `.notes-notice.is-error` 逐字 `当前文档暂无笔记，未生成报告`；主进程 `empty` 用同一句（§0.5）。判据齐（r13-1 `no-notes-notice` 断 IPC 增量 0 + 文件不存在 + `notes.md` 哈希不变）。
- 未打开文档：`:238` `:disabled="!notesStore.currentDocKey || exportingReport"` + `:240` 之前的 `status === "ready"` 渲染条件 ⇒ 可判定且成立（`currentDocKey` 在无文档/库外时为 `null`，`notes-path.ts:23-30`）。
- 导出中并发点击：**冻结了语义但不可判定、且缺归属守卫** ⇒ MF-1。
- 失败提示：`生成报告失败：{主进程 error}` 逐字节写死（§0.6 + r13-5），并要求 stub 侧文案与主进程逐字一致（`报告写入失败` / `当前文档暂无笔记，未生成报告`），且明确不得复用 `NOTES_ERRORS` 的通用串——这一条我核过 stub 现状（`ui-shot.mjs:494-502` 的 `NOTES_ERRORS` 里 `write-failed` 是「笔记写入失败」）⇒ 要求是必要的且写法正确。
- 另：成功「只给一处反馈」有断言（r13-2 `notesNotice() === null`），与 R10「撤销行本身就是反馈」先例一致。

### 5. N86 的可构造性

- **读文件字节可行**：`ui-shot.mjs` 是 Electron 主进程脚本，已直接 `readFileSync(NOTES_FILE)`（`notesHash`，`:2071` 等）⇒ 报告文件同理可读；时间戳归一化正则由两侧共用（写入档内即同一表达式）。
- **子目录文档存在**：`ui-shot.mjs:371` 建 `library/archive`、`:382` 写 `archive/older-paper.pdf`、树节点 `:675`，`openRow` 按 title 后缀命中（既有场景大量使用 `openRow("older-paper.pdf")`）⇒ r13-4 的 `reports/archive` 场景可构造。
- 依赖 helper 全部存在：`enterCleanWorkspace`（:3087）、`openNotesPanel`（:3100）、`restoreStandardSeed`（:3106）、`enterNotesProbe`（:4795）、`notesNotice`（:4940）、`settleEmptyOutline`（:6828）、`record`（:1390，失败即抛）、`capturePage`（:1049，无 rect 即整窗）；脚本挂载点描述（「r12-4 的 `restoreStandardSeed()` 之后、函数收口之前」）与实况 `:7263-7264` 一致。
- 期望值可判：`SAMPLE_OUTLINE`（:269-295）与 §0.3 事实基线表的 7 项逐条一致（独立复算）；`seedNotes()` 4 条与示例逐字一致；`LIBRARY_DIR = <OUT_ROOT>/library` ⇒ `{资料库名} = "library"`，而 `LIBRARY_NAME = "pix-r5-library"`（:39）是**界面显示名**——N82-1 #3 写的是 `basename(LIBRARY_DIR)`（正确），但 N86-3 的 stub 契约只写「逐字镜像主进程模板」，未点名「不得取 `CONFIG.name`」，建议在设计档点名，否则 stub 会写出 `资料库：pix-r5-library` 而全组变红。
- 缺口：在途/并发不可判定 ⇒ MF-1。

### 6. 白名单与改动一一对应

**结论：对应成立，未发现缺项。**

- 8 个文件（`notes-store.ts` / `ipc-handlers.ts` / `preload.ts` / `shared/types.ts` / 渲染层 `notes-store.ts` / `NotesPanel.vue` / `smoke-notes.mjs` / `ui-shot.mjs`）+ `package.json` 登记为不改（不新增 script，复用既有 `smoke:notes`）+ `docs/pm/R13-*.md`。
- `shared/types.ts` 确实需要新类型且已被列入：既有 `ReaderNotesExportResult` 只有 `filePath` / `count`，`ReaderNotesErrorCode` 恰 11 键（`types.ts:369-380`，我逐键数过）⇒ 三个新接口必需、不扩码表的要求成立。
- `preload.ts` 既有方法数 = 40（我对 `PixApi` 接口与 `api` 实现各自程序化计数，均为 40）⇒ 文档数字准确。
- 未列入但**不必**改的（我已逐一确认）：`library-root.ts`（`isPathInsideDirectory` 已导出、`ipc-handlers.ts:20` 已 import）、`notes-path.ts` / `outline-notes.ts`（复用既有导出）、`src/main/index.ts`（handler 在 `registerIpcHandlers` 内注册）、`.gitignore`（报告写在用户工作区，不落仓库）。
- 需要设计档补一句（不算白名单缺项）：ui-shot 的 stub 侧「报告目录真实路径」与「资料库名 = `basename(CONFIG.root)`」的口径。

---

## 三、次级观察（登记，不阻塞；非 must-fix 的理由已逐条写明）

- S-1 §0.8（`:269`）同一行内「允许的位移 ①（y 增大，x/width/height 不变）」与「不允许……`.notes-search`/`.notes-sort`/`.notes-filter`/`.notes-chapter-filter`/`.notes-selection-bar`/`.note-row` 自身几何与文本的变化」措辞互斥。① 的括注已给出判定，故不阻塞；建议改写为「y 允许增大，x/width/height 与文本不变」，否则终验必生争议。
- S-2 上游口径差：`docs/pm/PRD-V0.5.md:38` 说报告的阅读进度「只能来自 `reader-state.json` 与渲染层持有的 `pageCount`」，本档 §0.2 #7 明确不读不写 `reader-state.json`（只取实时内存值）。两者在正常路径下等值（落盘的正是 page + scale），不阻塞；建议在本档登记「口径收窄及其理由」，避免上游审查判为漂移。
- S-3 「行尾不产生行尾空格」（`:95`）与既有 `renderMarkdownEntry` 的「兼容手工写入的多行」语义（`notes-store.ts:253-261`：空行会产出 `"> "`）在**手工写入**的条目上不成立。烟测数据经 `normalizeNoteText` 归一化，恒绿；建议把该条限定为「主进程写入的条目」，避免断言的字面承诺过强。
- S-4 N82-1 #4「`grep -rn "阅读报告" pix/src/renderer` 只命中按钮 `title`」：当前实测为 **0 行**（该串尚不存在），但任何含「阅读报告」的注释都会让它误红。建议改成「命中集合 ⊆ {`NotesPanel.vue`}」。
- S-5 r13-2 相位 `content-verbatim` 的 ⑪「`.pix-read` 顶级条目变化恰为新增 `reports`」是时序敏感断言（`reader-state.json` 的写盘若落在两次快照之间会误红）。建议写明「两次快照紧贴点击前后，且只比较条目名集合、允许 `reader-state.json` 内容变化」。
- S-6 「`.notes-report-actions` 占满容器行宽」（§0.6）既无断言也无几何判据，而 §0.8 只白名单了纵向位移 ⇒ 8 张新截图的「目视登记」缺少可判标准。建议在设计档给出宽度判据或明确不进断言面。
- S-7 「`chapters` 不设长度上限」（§9 开放问题 6）在 `outline` 规模夹具（`long-book.pdf` 420 节点）下会产生 420 项入参：不影响正确性，但建议在 N86 的 payload 断言里避开 `long-book.pdf`（文档未指定该场景，仅提示）。
- S-8 本档事实基线表写「`git status --short` ⇒ 空」，与当前实况不符（实测 `?? docs/pm/R13-req.md`；本档落盘后还会多一条）。属证据保真度问题，建议注明「以本轮需求档落盘前的读数为准」。

---

## 四、本次实跑证据（可复核）

| 命令 / 读取 | 读数 |
| --- | --- |
| `git log --oneline -1` / `git status --short` | `fdad504 feat(reader): 章节语义贯通…（V0.5 R12）`；`?? docs/pm/R13-req.md` |
| `cd pix && npm run check`（`npm run check > /tmp/... ; echo $?`） | `CHECK_EXIT=0` |
| 基线目录 `C:/Users/86157/AppData/Local/Temp/pix-v05-r12-final/shots` | `MANIFEST.shots = 127`、`failure = null`、`MEASUREMENTS = 185`、`label = 41`、`r12-*` 四组 5/2/7/2；磁盘 129 张（多出 `zoom-pill-p1.png` / `zoom-pill-p3.png`，与文档一致） |
| `grep -c "writeFileAtomic(" pix/src/main/notes-store.ts` / `grep -c "### 第 " …` / `grep -rn "reports" pix/src` / `grep -rn "阅读报告" pix/src` | 7 / 1 / 0 / 0 |
| `grep -n "exportMarkdown" pix/src/renderer/stores/notes-store.ts` | 2 处（`:244` 定义、`:379` return） |
| `pix/src/main/preload.ts` 方法计数（程序化） | `PixApi` = 40、`api` = 40 |
| `pix/scripts/smoke-view.mjs` 分组计数（分段计数 `check(`） | 8 / 8 / 8 / 5 = 29（section-hit / section-null / section-nav / section-format） |
| `pix/scripts/smoke-notes.mjs` | 4 组 26 条（8 / 8 / 6 / 4），`main()` 顺序与文档一致 |
| 独立复算（`%TEMP%` + 仓库内 typescript 编译 `outline-notes.ts`，已删临时目录） | `buildChapterRanges(SAMPLE_OUTLINE, 3)` ⇒ 7 项，序与 label 与 §0.3 事实基线表完全一致；p1 → `1. Abstract`、p2 → `2. Method Overview`（同页 `2.1` 为后位，验证「第一条命中获胜」必要）、p9 → 兜底；`buildChapterRanges([{page:5}],3)` ⇒ `{start:5,end:3,label:"5"}`；`pageCount=0` 末节点 ⇒ `end=Infinity` |

must-fix：**MF-1 … MF-6**（见上）。MF-1…MF-6 销账后本档可进入设计档。

---

## 设计评审（R13）

评审对象：`docs/pm/R13-design.md`（工作树未跟踪；HEAD `fdad504`）
对照：`docs/pm/R13-req.md`（含 §0 定稿修订 M1–M6）与上面的「需求评审（R13）」MF-1…MF-6
评审角色：独立设计评审员（挑刺）。本步只读文件 + `cd pix && npm run check` + 只读 git；未跑离屏取证与烟测脚本，未执行任何 git 写命令，未改任何源码（唯一写操作 = 本文件追加）。

**总判定：revise —— 9 条 must-fix（D-1 … D-9），全部是可判定性 / 夹具正确性问题，不动产品方向，不改 R13-req §0 的契约冻结面。**

### 一、must-fix 清单

#### D-1 烟测 `report-failures` #4 的注入②不可能得到 `write-failed`（会先命中 `empty`）

- 证据：§5.1.4 的组前置是 `rmSync(REPORTS_A, { recursive: true, force: true })` + `seedReportNotes(DOC_A)`；而 §5.1.1 的 `seedReportNotes(docPath)` 只为传入文档写条目（实现里三次 `notesStore.addNote(draft(docPath, …))`，`smoke-notes.mjs:84` 的 `draft(docFilePath, page, text, kind)` 与本组夹具都不含 `DOC_ARCHIVE`）。§1.3.2 的判定顺序逐字是「…→ `readNotesFile` 失败码 → `empty` → 渲染 → `write-failed`」⇒ 对 `DOC_ARCHIVE`（0 条）导出时先返回 `{ code: "empty" }`，② 的期望 `code === "write-failed"` 与逐字文案 `报告写入失败` 必红。
- 同一条的第二步「清理注入后重试 ⇒ 成功且内容正确」也缺一步：注入是把 `reports/archive` 建为同名**文件**，重试前必须先删掉它（`rmSync(REPORTS_ARCHIVE_A, { recursive: true, force: true })`），否则 `mkdirSync` 继续抛错。
- 收口：② 之前补 `notesStore.addNote(draft(DOC_ARCHIVE, 7, ARCHIVE_TEXT))`（或复用 `report-files` #2 的同一夹具思路），并在「清理注入」里显式列出对 `REPORTS_ARCHIVE_A` 的删除。

#### D-2 烟测 `report-files` #4 的「`.pix-read` 集合差恰为 `["reports"]`」不可满足

- 证据：同一组 #1 的导出就已创建 `PIX_READ_A/reports`（#3 的 `writeFileSync(REPORT_A, "STALE-CONTENT\n")` 也以该目录存在为前提），前一组 `report-render` #1 更是更早创建过它；§5.1.3 没有为 `report-files` 写组前置（对比 §5.1.2 / §5.1.4 都写了前置）。⇒ #4 的两次 `readdirSync(PIX_READ_A)` 快照都含 `reports`，差集为空，「恰为 `["reports"]`」恒 false。
- 收口：把 #4 重排为「先 `rmSync(REPORTS_A, { recursive: true, force: true })` → 快照（条目 = `{notes.json, notes.md}`）→ 导出 → 快照 ⇒ 差集逐字 `["reports"]`」，或在组前置写明 `seedReportNotes`（该 helper 的契约是「返回时保证文件与目录为『无报告』初态」）并同步调整 #1–#3 对 `reports/` 已存在的依赖。

#### D-3 离屏 `r13-2` / `r13-3` 缺「有书签文档的唯一就绪点」`waitSectionReady()`

- 证据：`ui-shot.mjs:6746-6747` 的既有纪律注释——「PdfViewer 先 setPageCount → measurePages → scrollToPage，再 getOutline → setOutline ⇒ **有书签文档一律先 `waitSectionReady()`**」；实读 `PdfViewer.vue:677`（`setPageCount(doc.numPages)`）早于 `:696`（`doc.getOutline()`）与 `:700`（`readerStore.setOutline(nodes)`）⇒ `.page-label` 可见严格早于章节派生。R12 的章节相关场景都加了这道门（`:6849` / `:7019` / `:7075` / `:7196`），而 §5.2.4 / §5.2.5 的前置只有 `enterNotesProbe()`（`:4795`，内部无此门）⇒ `payload` ⑥、`content-verbatim` ⑨、`fallback` ①③④ 全部存在竞态（`chapters` 可能收到 `[]`，报告退化成按页分组）。
- 附加：§5.2.1 的「复用（不得重声明）」清单里没有 `waitSectionReady`（该 helper 已存在，`ui-shot.mjs:6817`），照现文实现会漏掉这道门。
- 收口：r13-2 / r13-3 在 `enterNotesProbe()` 之后、点击之前补 `await waitSectionReady();`；把 `waitSectionReady` 加进 §5.2.1 复用清单（r13-4 的 `older-paper.pdf` 继续用 `settleEmptyOutline()`，与 R12 口径一致）。

#### D-4 烟测夹具的同页次序依赖 `createdAt` 严格递增（同毫秒竞态）

- 证据：§5.1.1 的 `seedReportNotes` 连续两次 `notesStore.addNote()` 写 `sample-paper.pdf` 第 2 页的两条（先摘录后结论），而 §1.5.1 的 `sortReportEntries` 三键是 `page → createdAt → id`，第三键是 `id.localeCompare`（随机 UUID）。`addNote` 的时间戳取 `Date.now()`（`notes-store.ts:323`）⇒ 两次调用落在同一毫秒时，报告次序由随机 id 决定 ⇒ §5.1.2 #1（逐字节期望串）、#6（`indexOf(摘录) < indexOf(结论)`）与 §5.1.3 #3（两次归一化内容互等）会偶发红（同毫秒概率不低：两次 `addNote` 之间只有一次小文件读 + 一次「写 tmp + rename」）。
- 对照：离屏夹具不受影响——`ui-shot.mjs:320-368` 的 `seedNotes()` 用 `MINUTE` 偏移显式写死 `createdAt`。
- 收口：夹具改为显式时间戳（用脚本内既有 `writeNotesFile(serialize([...]))` 直接落盘、手写 `createdAt` 间隔），或对两条同页条目注入固定 `createdAt`；不要把「插入次序 = 报告次序」托付给 `addNote` 的时钟。

#### D-5 走查判据 §1.8 #19 的文件数与 §4 / §7.1 / 自检 三处矛盾

- 证据：§1.8 #19 写「只出现白名单：`M` **六个**源码/脚本」；§4 列 **8** 个修改文件（`shared/types.ts` / `main/notes-store.ts` / `main/ipc-handlers.ts` / `main/preload.ts` / `scripts/smoke-notes.mjs` / `renderer/stores/notes-store.ts` / `workspace/NotesPanel.vue` / `scripts/ui-shot.mjs`）；§7.1 写「白名单（5 + 3 = 8 个文件）」；附自检写「8 个源码 / 脚本被修改」。⇒ 该判据无法照做。
- 收口：#19 改为「`M` 八个源码/脚本（= §4 第 1–8 行）+ `?? docs/pm/R13-*.md`」。

#### D-6 走查判据 §5.6 #15 的 `SEL` 计数在真实 diff 上恒 > 4

- 证据：该行命令是 `git diff -- pix/scripts/ui-shot.mjs | grep -E "^\+.*(reportBtn|reportRow|reportText|reportReveal)"`，模式不锚定 `SEL` 块；而 §5.2.3–§5.2.7 的新增场景行里会出现 `clickEl(SEL.reportBtn)`、`waitFor(SEL.reportRow)`、`clickEl(SEL.reportReveal)`，`reportProbe()` 内部还引用四个选择器（§5.2.1）⇒ 命中行必然远多于 4 行，判据不可满足。
- 收口：改成锚定 SEL 项写法，例如 `git diff -U0 -- pix/scripts/ui-shot.mjs | grep -cE "^\+\s+report(Btn|Row|Text|Reveal): \""` = 4。

#### D-7 §5.1.3 #1 的 `endsWith("/reports/sample-paper.pdf.md")` 在 Windows 上恒 false

- 证据：§1.4.2 的目标路径由 `join(paths.reports, ...docPath.split("/")) + ".md"` 生成，`path.join` 在本机（win32）产出 `\` 分隔；同一份设计里既有的同类判据都用分隔符无关写法（`smoke-notes.mjs:445`：`relative(PIX_READ_A, exported.filePath) === "notes.md"`），§5.2.7 的 reveal 判据也用 `join(...)` 全路径比较。
- 收口：把该括注改为 `relative(REPORTS_A, result.filePath) === "sample-paper.pdf.md"`（或 `basename(result.filePath)`），主判据仍是「逐字 `REPORT_A`」。

#### D-8 §1.7.5 #1 的命中集合计数与逐字模板不一致

- 证据：该行期望「命中集合 = 模板 2 处 + 样式 4 处 + 选择器字符串 0 处」；按 §1.7.1 / §1.7.2 的逐字模板，含这些字面的模板行是 **5** 行（`class="notes-report-actions"` / `class="notes-report-btn"` / `class="notes-report-row"` / `class="report-text"` / `class="report-reveal"`），样式 **4** 行（`.notes-report-actions` / `.notes-report-btn` / `.notes-report-row` / `.report-text`）⇒ 合计 9 行。判据的可数形式必须与模板一致，否则该走查无法判定。
- 收口：改写为「9 行 = 模板 5 + 样式 4」，或把命令改成按块计数（例如只 grep 类名声明行）。

#### D-9 §5.3 的「允许的位移」白名单自相矛盾，且未覆盖 `.notes-header` 容器高度

- 证据：§5.3 允许「① 新增两行导致的**纵向**位移（其下各行 `y` 增大，`x/width/height` 不变）」，同一格又写「**不允许**：`.notes-search` / `.notes-sort` / `.notes-filter` / `.notes-chapter-filter` / `.notes-selection-bar` / `.note-row` 自身几何与文本的变化」。新行插在 `.notes-header-top` 之后、`.notes-search`（`NotesPanel.vue:429`）之前 ⇒ `.notes-search` 及其后各行的 `y` 必增，两条口径直接冲突（需求评审 S-1 已提示未销账）。另外 `.notes-header`（`NotesPanel.vue:699-708`，sticky 容器）的高度必增，而「其下各行」不覆盖容器自身，既有测量里正含该项（`ui-shot.mjs:1324` 的 `header: box(".notes-header")`）。
- 收口：改写为「允许：`.notes-header` 高度增大、`.notes-search` 及其后各行 `y` 增大（`x/width/height` 与文本不变，`.notes-header` 的 `h` 除外）；不允许：`.notes-header-top` 内既有元素与下文各控件的 **x/width/height/文本** 变化」；同时保留 §6 次级风险 7 的「内容差异只在 dev 档登记」口径。

### 二、重点核对结论（对照任务书 1–6）

1. **模板与渲染纯函数（逐字一致 / 特殊字符）**：与 R13-req §0.3 逐条比对一致——标题 `# 阅读报告 · {显示名}`、元信息行逐字（含进度段的出现条件与全角标点）、三种组标题（章节组 / `## 未归入章节（M 条）` / 按页组）、条目「逐字复用 `renderMarkdownEntry`」、条目间 `\n\n---\n\n`、组间恰一空行、文件末尾恰一个 `\n`。特殊字符口径写清且与既有实现自洽：不做 Markdown/HTML 转义（`*` `_` `#` `|` 原样）、正文按 `\n` 逐行加 `> `（兼容手工写入的多行）、`comment` 为空不产 `备注：`、标题 `\s+`→单空格 + 空 ⇒ 逐字 `未命名`（对照 `normalizeNoteText` `notes-store.ts:104-106` 与 `renderMarkdownEntry` `:253-261`）。**唯一未被任何断言覆盖的细节 = 反引号**：§1.5.3 的转义规则列举了 `*` `_` `#` `|` 而未点名 `` ` ``，实际由「通篇不做转义」覆盖，内容面无风险；可控风险在 stub 侧（stub 是 `buildStub()` 的模板字符串，§5.2.2 已冻结「内部不得出现反引号、一律用 `+` 与数组 `join` 拼接」）⇒ 建议在 §5.1.2 的夹具正文里加一条含 `` ` `` 的样本，把「数据里的反引号原样输出」也钉住。
2. **路径派生与越界**：判定式可判且覆盖齐——`..` 与库外绝对路径由 `toRelativeDocPath`（`notes-store.ts:109-115`：`resolve` + 拒绝 `..` + `isLibraryFilePath`，`library-root.ts:38-50` 含 `realpathSync` 兜底）+ 写盘前 `isPathInsideDirectory(target, paths.reports)`（`library-root.ts:24-30`）双层收口；子目录由 `join(paths.reports, ...docPath.split("/"))` 完整复刻（断言：烟测 `report-files` #2 + 离屏 `r13-4`）；大小写只在比较键域内消解（`docPathKey`），展示面保原大小写（§1.4.2 / §1.8 #10）。写盘原子性复用 `writeFileAtomic`（`notes-store.ts:180-200`，mkdir + tmp + rename + 失败清理），一次导出恰一次调用（§1.8 #2：实读现值 `grep -c "writeFileAtomic(" = 7` ⇒ 改后 8，成立）。目录创建失败路径明确（§3 第 7 行：父级被同名文件占用 ⇒ `mkdirSync` 抛错 ⇒ 既有 catch 统一 `write-failed`，不新增码/文案），但该条的**执行步骤**有缺陷（见 D-1）。
3. **IPC 形状与四面同步**：类型三接口（§1.1.2，位置在 `ReaderNotesExportResult`（`types.ts:401`）之后、`ReaderNotesResetResult`（`:410`）之前）、preload 两处（接口 `notesExport` `preload.ts:74` 之后、实现 `:163` 之后）、通道两处（`ipc-handlers.ts` 的 `notes-reset`（`:482`）之后）、守卫唯一实现点（`isReaderNotesReportInput` + `invalidReportInput()`，参照既有 `isNoteId:243` / `isNoteComment:247` / `invalidNotesInput:252-254`）——逐条给了可判命令（§1.8 #3 / #4 / #12）与「既有 40 方法逐字不动、改后 41」的不变量。实读复核：`preload.ts` 的 `notesExport` 位置与 `PixApi` 面计数（40）与设计一致。stub 面确需扩展且理由充分：`NOTES_ERRORS`（`ui-shot.mjs:494-502`）没有 `empty`，`write-failed` 是 `笔记写入失败` ⇒ 报告必须另立 `REPORT_ERRORS`（§5.2.2 已冻结）；stub 缺 `notesExportReport`，须与 preload 同步（N84-1 判据 2 的同一条纪律）。
4. **离屏场景可构造性与空断言风险**：追加点 `await restoreStandardSeed();`（`:7263`）与函数收口 `}`（`:7264`）与设计一致（本函数自 `:1372` 起无顶层级收口，全部 helper 同作用域）；§5.2.1 列出的复用 helper 名字逐字存在（`clickEl:6752`、`notesNotice:4940`、`enterNotesProbe:4795`、`setSearch:4804`、`searchProbe:4815`、`settleEmptyOutline:6828`、`backToLibraryTab:4090`、`rectOfSelector:2259`、`notesHash:2071`、`record:1390`、`capturePage:1049` 等）；`openNotesPanel(rows)` 的「每次切标签都会触发 loadNotes」有实现证据（`WorkspacePage.vue:202`）⇒ r13-4 `text-doc` 的「重新播种 → 切标签 → 5 行就绪」可复现；`CONFIG.root = LIBRARY_DIR`、`CONFIG.name = "pix-r5-library"`（界面显示名）⇒ §5.2.2 冻结「资料库名取 `path.basename(CONFIG.root)`」必要且正确；`writeFixtures()`（`:370-392`）确无 reports 清理行、`libraryShowInFolder`（`:767`）确不记参数 ⇒ §2.2 两处改动必要。**报告文件内容的判据 = 读字符串做逐字节比较**（烟测 `readFileSync(REPORT_A, "utf8")`、离屏 `readReport()` 同法），`^## ` 行集合另做行级诊断；两侧都以 utf-8 无 BOM 写入（主进程 `writeFileSync(..., "utf-8")`、stub `fs.writeFileSync(..., "utf8")`）⇒ 本机无需行尾/编码归一化，判据成立。**已发现两处空断言/时序风险**：D-3（缺 `waitSectionReady`）与 §5.2.7 `inflight-guard` 的拦截点（见次级观察 S-d4）；`r13-1` 的 `notes.md` 哈希「不存在 → 不存在」项在 stub 不写 `notes.md` 的前提下恒真（设计已在 §3 / §6 登记，不作 must-fix）。
5. **烟测面能否发现模板漂移 / 失败注入**：能——§5.1.2 #1 是「手写期望串逐字节比较」（`expectedRenderA()` / `expectedArchiveA()` 不含被测函数的产出），#2–#7 覆盖头部字段、空组不渲染、兜底组恒最后、退化按页、条目与分隔、倒序范围不命中；离屏 `content-verbatim` 用同一份构造法与 stub 输出比对 ⇒ 主进程模板与 stub 镜像任一侧漂移都会红（§5.2.2 的对齐机制成立）。失败注入的**方法**可行（§5.1.5 的两条抽样都是脚本内局部改动 + `git diff --exit-code` 还原），但抽样②的预期与实际不符：`REPORT_A` 由 `REPORTS_A` 派生（§5.1.1），把 `REPORTS_A` 指向不存在盘符会同时让 `report-render` #1 变红，而不是「`report-render` 不受影响」（见次级观察 S-d5）。
6. **白名单一致性、遗漏文件、对既有断言的影响**：8 个修改文件与 R13-req §7 的白名单、§7.1 的 A(5)+B(3) 逐条对齐；`package.json` / `smoke-view.mjs` 登记为不动与「不新增 script」的决策一致；未发现遗漏的必改文件（`library-root.ts` 只读复用、`notes-path.ts:32` 已导出 `docDisplayName`、`outline-notes.ts` 已导出 `buildChapterRanges`，`WorkspacePage.vue` / `ReaderPanel.vue` 均无需改）。**对既有断言的影响 = 零**（正向证据见第三节），但 §1.8 #19 的文件数与 §5.6 #15 的计数口径两处判据自身不可满足（D-5 / D-6）。

### 三、经复核成立的部分（正向证据；每条来自本次实读）

- **基线读数**：`C:/Users/86157/AppData/Local/Temp/pix-v05-r12-final/shots` ⇒ `MANIFEST.json` 的 `shots.length = 127`、`failure = null`；`MEASUREMENTS.json` 长度 185、label 去重 41 种（含 `r12-section-visible:5` / `r12-section-degrade:2` / `r12-section-nav:7` / `r12-section-context:2`）；磁盘一级 131 项 = 129 png + `MANIFEST.json` + `MEASUREMENTS.json`。与 §0.1 逐字一致。
- **工程门**：2026-09-16 实跑 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（输出仅两行脚本名与三段 tsc 命令行）。
- **走查基数**：`grep -c "writeFileAtomic(" pix/src/main/notes-store.ts` = 7；`grep -c "### 第 " …` = 1；`grep -rn "reports" pix/src | wc -l` = 0；`grep -rn "阅读报告" pix/src | wc -l` = 0；`grep -n exportMarkdown pix/src/renderer/stores/notes-store.ts` = 2 处（`:244` 定义 / `:379` return）；卷内各文件的行数（`main/notes-store.ts` 442 / `main/ipc-handlers.ts` 845 / `main/preload.ts` 188 / `renderer/stores/notes-store.ts` 395 / `workspace/NotesPanel.vue` 1387 / `main/library-root.ts` 50 / `scripts/smoke-notes.mjs` 553 / `scripts/ui-shot.mjs` 7421）与 §0.1 一致。
- **既有面零改动可行**：`undoOrder()`（`ui-shot.mjs:4925-4931`）只判「撤销行在 `.notes-notice` 之后、`.notes-export-row` 之前」；`bar40.barInHeader`（`:3188`）只判选择条在 `.notes-header` 内；`list-current-doc-filter-off/on` / `after-filter-off-settled`（`:1324-1358`）是纯 `measurements`（零缺失只比 label）⇒ 新增两行不触发既有断言改动，内容差异按 §6 次级风险 7 登记即可。
- **场景与配额**：`SEL` 末项 `composerInput: ".input-area"`（`:100`）与 `};`（`:101`）与 §5.2.1 的插入点一致；`SAMPLE_OUTLINE`（`:269-295`）结构与 7 项 label 与 §0.1 表一致（`Appendix A` 无页码不入表、`Appendix B` 预序最后 ⇒ `[2,3]`/`2-3`）；`seedNotes()`（`:320-368`）4 条与 §0.3 示例正文逐字一致且 `createdAt` 用 `MINUTE` 偏移显式区分；`NOTICE_MS = 4000`（`NotesPanel.vue:28`）⇒ 失败/空库提示的读取窗口充足。
- **stub 侧关键差异**：`CONFIG.name = "pix-r5-library"` ≠ `path.basename(CONFIG.root) = "library"`；`NOTES_ERRORS` 无 `empty`、`write-failed` 为 `笔记写入失败`（`ui-shot.mjs:494-502`）；`libraryShowInFolder`（`:767`）无参数记录；`notesExport`（`:916-919`）不写 `notes.md`。§2.2 / §5.2.2 对这四点的处置都是必要且正确的。

### 四、次级观察（登记，不阻塞）

- **S-d1**：`reportProbe()`（§5.2.1）返回字段里的 `emptyOk` 没有任何语义定义，也没有被 §5.2 的任一断言引用 ⇒ 删除或写明含义。
- **S-d2**：§4 第 5 行的 import 增量只列 `ReaderNotesReportChapter` 与 `buildChapterRanges`，而 §1.6.2 用到 `docDisplayName`（`notes-path.ts:32` 已导出）⇒ 补列。三层 tsconfig 均未开 `noUnusedLocals`（本次实读），故多余类型 import 不会让 `npm run check` 变红，不构成门禁风险。
- **S-d3**：§5.1.2 #1 的「命中片段匹配 `/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/`」措辞歧义：`STAMP_RE` 的 `match[0]` 含 `生成时间：` 前缀，锚定正则对 `match[0]` 恒 false。建议写成「取 `生成时间：` 之后的值段（或用捕获组）后匹配」。
- **S-d4**：§5.2.7 `inflight-guard` ⑩ 的实际拦截点大概率是 DOM `disabled` 而非 handler 首行守卫：`:disabled="!notesStore.currentDocKey || exportingReport"`（§1.7.1）会在第一次点击后的微任务里生效，而 `clickEl` 是 `js` 往返（`ui-shot.mjs:6752`）⇒ 第二次点击落在已 disabled 的按钮上（原生 `.click()` 不派发事件）。判据结论（增量恰 1）仍然成立，但「被 `exportingReport` 守卫拦下」的措辞应改为「两处守卫任一拦截即可」。
- **S-d5**：§5.1.5 抽样②「把 `REPORTS_A` 指向不存在盘符 ⇒ `report-files` 连续红、`report-render` 不受影响」与实际不符——`REPORT_A` 由 `REPORTS_A` 派生（§5.1.1），`report-render` #1 同样会 `write-failed`。建议改注入 `REPORTS_ARCHIVE_A`（只影响 `report-files` #2），或把预期写成「两组同时红，可证明错误未静默」。
- **S-d6**：大小写保真在报告面（`target` / meta 的 `文档：` 段 / `displayPath`）只有 §1.8 #10 的显示名走查。建议补一条「主进程侧不对 `docPath` 做二次变换」的走查（例如 `grep -n "toLowerCase" pix/src/main/notes-store.ts` 的命中集合 ⊆ `docPathKey` / `normalizeFsPath` 两处既有实现）。
- **S-d7**：`reportChapterTitle` 的空标题兜底在真实路径上不可达（`outline-notes.ts:42` 的 `collectPreorder` 已把空标题替换为 `未命名`），且 §1.8 没有「复用 `normalizeNoteText`、不写第二份折叠」的走查命令 ⇒ 建议补一条（`grep -n "normalizeNoteText" pix/src/main/notes-store.ts` 的命中集合 = 写入归一化 1 处 + `reportChapterTitle` 1 处）。
- **S-d8**：§5.2.5 的 r13-3 两个相位共享现场（搜索词 `Table 2` 与既有导出行都不复位），建议在表里显式写「相位间不重置」，避免开发者在 `idempotent` 之前插入复位而改变 ⑨ 的期望；同时点明 ⑤ 的读取方式（既有 `searchProbe()` / `countOf(SEL.noteRow)`）。
- **S-d9**：行号证据的两处偏差（不影响判定）：§1.1.1 把 `Reader state` 分节注释写作 `:484`（实读 `:484-486` 为分隔注释、`// Reader state…` 在 `:485`）；`invalidNotesInput()` 写作 `:253`（实读 `:252` 定义为 `:253` 的 return）。§0.1 表其余行号本次逐条复核一致。

### 五、本次实读证据（可复核）

| 命令 / 读取 | 读数 |
| --- | --- |
| `git log --oneline -3` / `git status --short` | `fdad504 feat(reader): 章节语义贯通…（V0.5 R12）`；`?? docs/pm/R13-design.md` / `?? docs/pm/R13-req.md` / `?? docs/pm/R13-review.md` |
| `cd pix && npm run check`（`; echo $?`） | `CHECK_EXIT=0` |
| 基线 `pix-v05-r12-final/shots`（node 复算） | `{shots:127, failure:null, measurements:185, labels:41}`；`ls -A` 131 项、129 png + 2 json |
| `grep -c "writeFileAtomic(" pix/src/main/notes-store.ts` / `grep -c "### 第 " …` | 7 / 1 |
| `grep -rn "reports" pix/src \| wc -l` / `grep -rn "阅读报告" pix/src \| wc -l` | 0 / 0 |
| `grep -n exportMarkdown pix/src/renderer/stores/notes-store.ts` | `:244` 定义、`:379` return（共 2 处） |
| `grep -n "notesExport\|libraryShowInFolder" pix/src/main/preload.ts` | 接口 `:74` / 实现 `:163`；`libraryShowInFolder` 接口 `:64` / 实现 `:153` |
| `grep -n`（`ipc-handlers.ts`） | `isNoteId:243` / `isNoteComment:247` / `invalidNotesInput:252-254` / 笔记七通道 `:468-482` / `Reader state` 注释 `:484-486` |
| `grep -n "setPageCount(doc.numPages)\|getOutline()\|setOutline(nodes)" pix/src/renderer/components/workspace/PdfViewer.vue` | `PdfViewer.vue:677` / `:696` / `:700`（章节派生晚于页码） |
| `grep -n "waitSectionReady()" pix/scripts/ui-shot.mjs` | `:6849` / `:7019` / `:7075` / `:7196`（R12 既有纪律）+ 定义 `:6817`；§5.2.1 复用清单未列它 |
| `grep -n "seedNotes\|writeFixtures\|buildStub\|NOTES_ERRORS\|CONFIG.name\|libraryShowInFolder\|notesExport:" pix/scripts/ui-shot.mjs` | `seedNotes:320` / `writeFixtures:370`（无 reports 清理行）/ `buildStub:400` / `CONFIG.name = LIBRARY_NAME`（`:404`）/ `NOTES_ERRORS:494-502`（无 `empty`、`write-failed` = 笔记写入失败）/ `libraryShowInFolder:767`（不记参数）/ `notesExport:916-919`（不写 `notes.md`） |
| `grep -n "const clickEl\|const notesNotice\|const enterNotesProbe\|const setSearch\|const searchProbe\|const settleEmptyOutline\|const backToLibraryTab\|const undoOrder" pix/scripts/ui-shot.mjs` | `:6752` / `:4940` / `:4795` / `:4804` / `:4815` / `:6828` / `:4090` / `:4925`；`awk` 复核 `1372→7264` 之间无顶层级 `}` |
| `grep -n "SAMPLE_OUTLINE\|MINUTE\|LIBRARY_NAME\|NOTICE_MS"` | `SAMPLE_OUTLINE:269-295`（7 项 label 与 §0.1 一致）/ `MINUTE:232` / `LIBRARY_NAME = "pix-r5-library"`（`:39`，界面显示名）/ `NOTICE_MS = 4000`（`NotesPanel.vue:28`） |
| `sed`/`grep`（`smoke-notes.mjs`） | 4 组 26 条、`main()` `:531-552`（`main();` 在 `:553`）、`draft():84`、`writeNotesFile():70`、`relative(...) === "notes.md"` 先例 `:445`、`WS_A:27` / `PIX_READ_A:29` / `NOTES_A:31` / `DOC_A:35` |
| `sed`/`grep`（`NotesPanel.vue`） | `exporting:65` / `exportLabel:92` / `onExport:360-366` / `revealPath:380` / `onUndoClick:233-248` / 模板 `.notes-header-top:415-428`、`.notes-search:429`、`.notes-export-row:514-525`、`.notes-loading:526` / 样式 `.notes-header:699-708`、`.notes-count:762-767`、`.notes-export-btn:774-776`、`.notes-export-row:971-981`、`.export-text:983-990` |
| `grep -n "notes-export-report"`（改前） | 0 命中（通道尚未存在，判据基数成立） |

must-fix：**D-1 … D-9**（见上）。D-1…D-9 销账后本档可进入开发档。

---

## 代码审查（R13）

审查对象：`git diff` 的 8 个白名单文件 + `docs/pm/R13-dev.md`；对照 `docs/pm/R13-req.md`（含 §0 定稿修订 M1–M6）与 `docs/pm/R13-design.md`（含定稿修订 D-1…D-9 / S-d1…S-d9）。
审查角色：独立代码审查员（冷启动，不复用交付方结论与产物）。唯一写操作 = 本档；其余全部只读；未执行任何 git 写命令；未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未改 `packages/**`；未增删依赖。
全部结论来自本次真实文件内容与真实命令输出；`%TEMP%` 内三个一次性脚本（独立反证 / 逐字节核对 / 测量差分类）与一个备份文件已全部删除；UI 取证不并发（首跑被外部中断后单独重跑一次）。

**总判定：accept（0 条 must-fix）。** 交付与需求档 §0 冻结契约、设计档 §1 契约冻结表逐条一致；8 个改动文件全部在白名单内、范围外零改动；既有冻结面（R10 模板/文案、R12 章节语义、取证脚本既有面）零 diff；既有 127 张 / 185 条 / 41 label 零缺失，新增 8 张 / 13 条齐备且逐条复算成立。

### 一、独立复验实跑证据（本次真实输出）

| # | 命令 | 实测输出 |
| --- | --- | --- |
| 1 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo CHECK_EXIT=$?` | `CHECK_EXIT=0`（仅 `> pix-read@0.1.0 check` 与 `vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit`） |
| 2 | `cd pix && PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r13-review" ./node_modules/.bin/electron scripts/ui-shot.mjs; echo $?` | `UI_SHOT_REVIEW_EXIT=0`；日志无任何 `场景失败`；末两行逐字 `[ui-shot] 结束：产出 135 张截图` / `UI_SHOT_REVIEW_EXIT=0` |
| 3 | 读 `pix-v05-r13-review/shots/{MANIFEST,MEASUREMENTS}.json` | `{"shots":135,"failure":null,"measurements":198,"labels":46}` |
| 4 | 与基线 `pix-v05-r12-final` 集合差（node 复算） | `missingShots=[]`；`added=` 8 张 `r13-*.png`（逐字与 §0.7 冻结名单一致）；`baseLabels=41 → afterLabels=46`；逐 label 计数不足者 `=[]`（41 种 label 一条不少） |
| 5 | `cd pix && node scripts/smoke-notes.mjs` | `通过 44 / 失败 0`、退出码 0（红注入还原后复跑一次仍是 44/0） |
| 6 | `cd pix && node scripts/smoke-view.mjs` | `通过 29 / 失败 0`、退出码 0（零改动文件回归） |
| 7 | 独立反证脚本（审查员自写，直接驱动 `exportDocumentReport`） | `RESULT pass=41 fail=0`（明细见 §三） |
| 8 | 逐字节核对脚本（离屏记录 + 在线文件 vs 审查员手写模板） | `RESULT pass=7 fail=0` |
| 9 | 模板漂移红注入（`renderDocumentReport` 元信息行 `每次导出都会覆盖` ⇒ `…（审查注入）`） | `通过 40 / 失败 4`：红 = `report-render #1` / `report-files #2` / `report-files #3` / `report-failures #4`，失败信息带真实实际值；还原后 `sha256=080f8522ee984c5be2d8307051a2e4b81cfb069de80e04c3101580afa5c3af19`（与注入前一致）、`git diff --numstat` 仍 `111 2`、注入串零残留 |
| 10 | 8 张新截图逐张目视（read 图片） | 入口行位于头行之下、搜索行之上、整宽 242px（= `.notes-search` 宽）；禁用态灰化可辨；`共 4 条` 与 `导出 Markdown` 未被挤动/换行；状态行与既有导出行同盒模型、同屏共存不重叠；文本完整无截断；失败提示单行 |

一次未计入证据的运行：首跑在 `r12-3` 之后被外部中断（`shots/` 125 张、无 `MANIFEST.json`、退出码 0 = `app.on("window-all-closed")` 路径），未产出任何读数；按「两个取证进程不得并发」纪律单独重跑一次后如上全绿。该中断与交付物无关（无 `场景失败`、无断言读数）。

### 二、验收逐条结论（对照 R13-req / R13-design）

| 需求 / 契约 | 判定 | 证据（本次实测） |
| --- | --- | --- |
| N82-1 头部（标题 + 元信息行 + 统计 + 进度） | 通过 | 反证 T1：文件首行 `# 阅读报告 · sample-paper.pdf`；元信息行逐字与手写期望串相等（`资料库：ws-a；文档：sample-paper.pdf；生成时间：<STAMP>；阅读进度：第 1 / 3 页；共 3 条（摘录 2 · AI 结论 1）。`）；`progress === null`（文本文档）时整段 `阅读进度：…；` 不出现（T3） |
| N82-1 判据 4（模板不入渲染层） | 通过 | `grep -rn "阅读报告" pix/src/renderer` = 1（仅按钮 `title`）；渲染层无 `# 阅读报告 ·` / `由 PiX-Read 生成` / `未归入章节` / `reports/`（= 0） |
| N82-2 分组 / 归组唯一 / 退化 | 通过 | 归组谓词全文件恰 1 处（`notes-store.ts:332`）；空组不渲染（`2.2 Positional prior` 出现 0 次）；`^## ` 行恰 2 条且逐字；p9 越界条 ⇒ 兜底组恒最后且正文恰 1 次；`chapters: []` ⇒ 按页组且页升序、不含 `未归入章节` 与 ` · 第 ` |
| N82-3 组内顺序与条目呈现 | 通过 | 同页先摘录后结论（`indexOf` 复算）；`### 第 2 页` 与 `### 第 2 页 · AI 结论` 各 1 次；恰 1 处 `\n\n---\n\n`；末尾恰一个 `\n`、无行尾空格；`renderMarkdownEntry` 零 diff（`grep -c "### 第 "` 恒 1） |
| N82-4 逐字模板 | 通过 | 反证 T1/T2/T3 + 离屏 `r13-2`/`r13-3` 的 `reportText` 与在线文件：四处逐字节等于审查员手写期望串（含空行位置、`---` 分隔线、三级标题层级、`备注：` 行） |
| N82-5 确定性 / 边界 | 通过 | 唯一非确定性 = `生成时间`（`STAMP_RE` 命中恰 1 次且形如 `YYYY-MM-DD HH:mm:ss`）；同状态两次导出归一化后逐字节相同（T7 与离屏 `idempotent`）；报告只读 `notes.json` + 入参，无 LLM 调用路径 |
| N83-1 入口（行 / 按钮 / 文案） | 通过 | `.notes-report-actions` 位于 `.notes-header-top` 之后、`.notes-search` 之前；文本 `导出当前文档报告`、`title` `导出当前文档的阅读报告（Markdown）`；两条文案在 `pix/src` 各 1 处；离屏相位 1/2 复算 `btnDisabled` true→false |
| N83-2 禁用条件与在途 | 通过 | 禁用 ⇔ `!currentDocKey \|\| exportingReport`（模板逐字）；`r13-5` `write-failed-retry` 计数增量 2（失败后恢复可用）；`inflight-guard` 增量恰 1（两处守卫任一拦下，与设计修订 §S-d4 一致） |
| N83-3 范围（当前文档 / 与视图无关） | 通过 | 入参 `docFilePath` 逐字 = 当前文档绝对路径；`chapters` 逐字段 = 7 项夹具；搜索 `Table 2` 生效（`visibleRows=1`）时报告仍 4 条 |
| N83-4 当前文档无笔记 | 通过 | 离屏：notice 逐字 `当前文档暂无笔记，未生成报告`、`callsDelta=0`、报告文件不存在、无状态行；反证 T5：主进程 `empty` + 目录未被创建 + 整树零写盘 |
| N83-5 成功 / 失败反馈 | 通过 | 成功只有 `.notes-report-row`（`notice=null`）；`reveal` 收到逐字报告绝对路径且报告哈希不变；失败 `生成报告失败：报告写入失败`、无状态行、无文件；显示名取发起瞬间 `docDisplayName(filePath)`（`grep "docDisplayName(currentDocKey)"` = 0） |
| N83-6 状态清理与在途 | 通过 | `lastReport.value = null` 恰 2 处 + 成功写入恰 1 处；切文档后行消失、切回再导出行回来；在途切文档的迟到响应被丢弃（行不在 DOM、notice 为 null） |
| N84-1 通道 / handler / preload | 通过 | `notes-export-report` 恰 2 处（`ipc-handlers.ts:529` / `preload.ts:168`）；`preload.ts` 的 `notesExportReport` 2 处（接口 + 实现）；既有 40 方法零改动；stub 面同步 |
| N84-2 入参形状 | 通过 | 三接口逐字落点正确；`ReaderNotesErrorCode` 仍 11 键；离屏 `text-doc` 入参 `chapters=[]` + `progress=null`；章节顺序 = `buildChapterRanges` 的 Map 插入序（7 项逐字段复算） |
| N84-3 入参校验与中文错误 | 通过 | 守卫唯一（定义 1 处、`报告参数不合法` 1 处）；纯形状校验（`typeof` / `Array.isArray` / `Number.isInteger`，无 I/O）；倒序范围不整体拒绝（`success=true`、`## Beyond` 0 次） |
| N84-4 返回形状 | 通过 | 成功三字段齐备（`filePath` 逐字等于报告绝对路径、`displayPath` 逐字 `.pix-read/reports/<docPath>.md`、`count=3`）；不含 `notes` 数组；`displayPath` 由主进程拼装（渲染层 `reports/` = 0） |
| N84-5 路径规则与越界 | 通过 | 反证 T4a–T4e：`..` 逃逸（绝对路径含 `..`）/ 相对路径（CWD 基准）/ 库外绝对路径 / 跨库路径 / 库根自身 ⇒ 全部 `outside` + 逐字 `该文档不在当前资料库内`，整棵工作区零写盘；子目录报告 `reports/archive/older-paper.pdf.md` 逐字节正确 |
| N84-6 写入语义 | 通过 | 复用 `writeFileAtomic`（调用点 7 ⇒ 8，函数体零 diff）；幂等：预置垃圾内容后被整文件覆盖、无 `.tmp` 残留（T8）；同一状态两次导出归一化后逐字节相同；失败两条注入（`.tmp` 为目录 / 父级同名文件）均 `write-failed` + 逐字文案、既有报告字节不变、清理后重试成功 |
| N84-7 只增一个产物目录 | 通过 | 反证 T6：`notes.json` / `notes.md` sha256 前后不变；删 `reports` 后 `loadNotes` / `addNote` / `exportNotesMarkdown` / 报告导出全部成功且目录重建（T9）；主进程对 `reports/**` 无任何 `readdirSync` / `readFileSync`（0 命中）；`.pix-read` 顶级条目变化恰为新增 `reports` |
| N85-1 `notes.json` 字节不变 | 通过 | 反证 T6 + 离屏 `notesHashSame=true`；失败路径（`empty` / 越界 / 损坏 / 版本不支持）各自零写盘 |
| N85-2 既有 `notes.md` 导出零改动 | 通过 | `renderNotesMarkdown` / `renderMarkdownEntry` / `exportNotesMarkdown` 零 diff；面板 `.notes-header-top` / `.notes-export-row` / `.export-text` / `exportLabel` 的 `-` 侧 = 0 行；离屏 `.export-text` 逐字 `已导出 5 条 → .pix-read/notes.md`；报告导出不改写 `notes.md` 哈希 |
| N85-3 R12 章节语义零改动 | 通过 | `git diff --stat -- pix/src/renderer/utils` 为空；`buildChapterRanges` 在渲染层新增命中 1 处（store 动作）；主进程 `buildChapterRanges` / `ReaderOutlineNode` = 0；`smoke-view` 29/0 |
| N85-4 既有断言与基线零缺失 | 通过 | `missingShots=[]`、逐 label 计数无不足、`failure=null`、退出码 0；`ui-shot.mjs` 的 `-` 侧 = 1 行（仅 `libraryShowInFolder`，§2.2 #1 允许项）；`smoke-notes.mjs` 的 `-` 侧 = 0 行 |
| N85-5 工程门与依赖零改动 | 通过 | `CHECK_EXIT=0`；`package.json` / `package-lock.json` / `packages` / `tsconfig*` / `vite.config.ts` / `smoke-view.mjs` 全零 diff；无 `any`、无内联动态 import（唯一 `any` 命中是既有英文注释） |
| N86-1 主进程烟测 3 组 18 条 | 通过 | 44 条全绿（既有 26 + 新增 18）；组构成 `report-render 7` / `report-files 5` / `report-failures 6`；期望串手写（脚本内无被测函数生成期望值）；运行后 `%TEMP%` 零残留 |
| N86-2 渲染层烟测零改动 | 通过 | `smoke-view.mjs` 零 diff、29/0 |
| N86-3 离屏 5 场景 13 条 + 8 张 | 通过 | 5 组 13 条 record 齐备（`3/3/2/2/3`），逐条读数与 §0.7 / §5.2 判据复算一致；8 张截图齐备并逐张目视；`SEL` 新增恰 4 项 |
| N86-4 基线与零缺失 | 通过 | 见 §一 #4；`.pix-read` 顶级条目差恰为 `["reports"]`（移除集合空） |
| N86-5 零残留 | 通过 | `git status --short` = `M` 8（全白名单）+ `?? docs/pm/R13-*.md`；仓库内无临时脚本/日志；`%TEMP%` 无 `pix-smoke-notes-*` 残留 |
| §0.2 #10 归属守卫 / §0.4 边界表 / §0.5 守卫表与返回面 / §0.6 字面 | 通过 | 逐条见上（最关键三项：越界 `outside` 零写盘、空库 `empty` 不建目录、写失败专有文案且既有文件字节不变） |
| §0.8 允许位移白名单 | 通过（详见 §四） | 185 条公共测量逐字段差：`y` 位移恰 +22（48 项）、`.notes-header` 与 `panelScroll.scrollH` 的 `h` +22（3 项），其余为路径 / 时间戳 / 随机 id / 既有 `quick-ask` 探针探索式计数；无任何冻结文案的文本变化 |

### 三、专项反证（审查员自写脚本，直接驱动主进程）

独立编译 `notes-store.ts` + `library-root.ts`（自写 tsconfig、自建临时工作区），41 条全过：

1. **报告字节与模板逐字**：根文档（3 条 + 3 章 + 进度）逐字节等于手写期望串；子目录文档（1 条 + 无章节 + 进度 1/2）逐字节；文本文档（1 条 + 无章节 + 无进度）逐字节；三者 `displayPath` 逐字 `.pix-read/reports/{sample-paper.pdf,archive/older-paper.pdf,reading-notes.md}.md`；文件末尾恰一个 `\n`、无行尾空格；条目渲染与冻结的 `renderMarkdownEntry` 同口径（交叉核对 `exportNotesMarkdown()` 产物：均为「标题 → 空行 → `> ` 正文」，与 `notes-store.ts` 内 `[title, "", …]` 的冻结实现一致）。
2. **越界零写盘**：`..` 逃逸 / 相对路径 / 库外绝对路径 / 跨库路径 / 库根自身 —— 五例全部 `outside` + 逐字文案，且整棵工作区（文件集合 + 每个文件 sha256）前后完全一致。
3. **无笔记不写文件**：`empty` + 逐字文案；`reports` 目录未被创建；整树零写盘。
4. **事实源字节不变**：`notes.json` 与 `notes.md` 的 sha256 前后相等；无 `.tmp` 残留。
5. **幂等覆盖**：报告写出后再改笔记（追加 1 条并改变条数）⇒ 覆盖后内容反映最新笔记、正文各出现恰 1 次（无追加、无重复、无旧内容）；同状态连续导出归一化后逐字节相同；再注水垃圾内容仍被整文件覆盖；删 `reports` 目录后既有功能与报告导出全部成功且内容重建。
6. **UI 路径交叉**：离屏 `r13-2` 的 `content-verbatim` 全文、`r13-3` 的 `fallback` 全文、以及 `r13-5` 重试后在磁盘上的报告文件，三者均逐字节等于审查员独立手写模板（7/7）。

### 四、红线走查（逐条实测）

| 项 | 命令 / 读法 | 结果 |
| --- | --- | --- |
| 白名单 | `git status --short` / `git diff --numstat` | `M` 恰 8 个（`types.ts 25/0`、`main/notes-store.ts 111/2`、`main/ipc-handlers.ts 50/1`、`main/preload.ts 5/0`、`smoke-notes.mjs 448/0`、`renderer/stores/notes-store.ts 90/2`、`NotesPanel.vue 81/0`、`ui-shot.mjs 751/1`）+ `?? docs/pm/R13-*.md`；范围外路径（`renderer/utils`、`main/library-root.ts`、其余组件与 store、`package.json`、lockfile、`packages/**`、`tsconfig*`、`vite.config.ts`、`README.md`、`.gitignore`、`smoke-view.mjs`）零 diff |
| 禁项 grep | `grep -nE "\bany\b\|await import\|import\("`（新增面 5 文件） | 仅 `ipc-handlers.ts:186` 既有英文注释；无 `any` 类型、无内联动态 import；全部顶层 import |
| 既有冻结文案 / 模板 | `git diff -U0 -- pix/src/main/notes-store.ts \| grep "^-"`；`NotesPanel.vue` / `smoke-notes.mjs` 的 `-` 侧 | 主进程仅 2 行（import 行、`notesPaths()` 返回行）；面板 0 行；烟测 0 行；R10 模板/文案、`ERROR_MESSAGES` 11 键、`ReaderNotesErrorCode` 零改动 |
| 既有场景与截图 | `git diff -- pix/scripts/ui-shot.mjs \| grep "^-"`；`SEL` 计数 | `-` 侧恰 1 行（`libraryShowInFolder`，§2.2 #1 允许项）；`git diff -U0 -- pix/scripts/ui-shot.mjs \| grep -cE "^\+\s+report(Btn\|Row\|Text\|Reveal): \""` = 4；既有 label / 截图名零删除 |
| 计量面语义 | 185 条公共测量逐字段差 | 48 项 `y` 位移恰 `+22`、3 项容器 `h` `+22`（`.notes-header` 与 `panelScroll.scrollH`）；字符串差仅「两个不同 `PIX_SHOT_ROOT` 路径 + 随机 id」；其余为计时/计数与既有 `quick-ask` 探针的探索式计数（该计数在本轮**之前**的 `pix-v05-r12-stab` 跑就已是 `attempts 2 / trail 2`，与本次读数一致 ⇒ 非本轮引入）；无冻结文案文本变化 |
| 零残留 | `git status`、`ls %TEMP%` | 仓库只有 8 个 `M` + 4 份未跟踪文档；无临时脚本 / 产物 / 调试日志；`pix-smoke-*` 临时目录 0 项 |
| 报告目录不参与读取 | `grep -rn "reports" pix/src` 与读函数调用点 | `reports` 命中 ⊆ {`main/notes-store.ts` 的常量/字段/派生/目标/复核, `shared/types.ts` 的注释}；主进程无对 `reports/**` 的 `readdirSync` / `readFileSync` |

### 五、must-fix 清单

**无（0 条）。** 交付可接受；下列次级项不阻塞，交由负责人按需处置。

### 六、次级项（登记，不阻塞）

1. **文档示例块笔误（与交付方 D1 / D-B1 同源，建议改文档而非代码）**：`R13-req.md` §0.3 的逐字示例块与 `R13-design.md` §5.1.1 / §5.2.4 的手写期望串把 `### 第 N 页` 与其后的 `> 正文` 写成相邻两行；冻结的 `renderMarkdownEntry`（R10 冻结点、本轮零 diff）输出恒为「标题 → 空行 → 正文」，两份档自身的字段表也写「标题 → 空行 → 正文」。本轮按真实输出落地是唯一不违反 R10 冻结的处置。建议负责人把两处示例块补上空行，避免后续轮次再次踩同一歧义。
2. `notesPaths()` 的 `reports` 用 `join(join(root, NOTES_DIR_NAME), REPORTS_DIR_NAME)` 重新拼了一次已存在的 `dir`（语义与输出一致，纯风格问题；设计档 §1.4.1 即此形态，交付方已在 R6 登记）。
3. A 面注释引入 2 处 `阅读报告` 字面（`main/notes-store.ts:495`、`shared/types.ts:417`），使 `grep -rn "阅读报告" pix/src` = 4（判据面要求 `pix/src/renderer` = 1，已满足；R-B6 已登记）。
4. 主进程模板与离屏 stub 镜像构成双实现：主进程模板漂移只能由 `smoke-notes.mjs` 发现（离屏走 stub），stub 漂移由离屏发现；两者靠「同一份手写期望串」对齐（本次实测有效：审查员红注入在烟测侧变红，历史首跑在离屏侧变红）。后续轮次若改动报告模板，必须同时更新两份手写期望串，否则会出现单侧绿。
5. `inflight-guard` 的实测拦截点是「DOM `disabled` 或 handler 首行守卫任一」（`clickEl` 为 `js` 往返）——判据（增量恰 1）成立，措辞已按设计修订 §S-d4 收敛，无需改动。
6. 报告状态行在 268px 左栏内自动折 2–3 行（`word-break: break-word`，与既有 `.export-text` 同款）：属设计行为，8 张新截图目视确认文本完整、无截断、与既有行不重叠（已由 R-B9 登记）。

### 七、结论

**accept。** 0 条 must-fix；8 个改动文件全部落在白名单；`npm run check` 0 error；离屏 135 张 / 198 条 / 46 label、`failure=null`、退出码 0、既有 127 张与 41 种 label 零缺失、新增 8 张 + 13 条齐备且逐条复算成立；烟测 44/0 与 29/0（含一次模板漂移红注入，注入已字节级还原）；越界 / 空库 / 零副作用 / 幂等覆盖四项反证全部成立；无临时产物残留。建议负责人在改文档（§六 第 1 条）后按 `git add <具体路径>` 提交。
