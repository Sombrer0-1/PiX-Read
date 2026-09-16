# R14 需求评审（独立需求评审员）

> 评审对象：`docs/pm/R14-req.md`（工作树唯一未跟踪文件）
> 评审基线：HEAD `20dd452`；`git status --short` ⇒ 仅 `?? docs/pm/R14-req.md`
> 证据口径：【走查】只读文件 + `grep` / `git`；【check】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check`（本次实跑 `CHECK_EXIT=0`）；R13 交付基线的树行几何取自只读的 `C:/Users/86157/AppData/Local/Temp/pix-v05-r13-review/shots/MEASUREMENTS.json` 与 `21-tree-progress.png` 逐像素测量（**本步未跑离屏取证**）
> 结论：**不通过**——2 项阻塞性 must-fix（既有场景 `21` 必红；`r14-4` 一个相位不可执行），另有 8 项必须在本轮动工前改清的判据/白名单问题。

## 需求评审（R14）

### 一、核对清单逐条结论

**1. N87 计数口径 / 树行溢出 / 懒加载徽标**

- 口径与既有实现**同源**：键函数 = `notes-path.ts` 的 `docPathKey`（小写 + 正斜杠 + 去尾斜杠），与面板分组（`groupNotesByDocument`）、地图章节计数（`countNotesByChapter`）同一套；字段形状 `{ total, excerpt, answer }` 与 `outline-notes.ts:26` 的 `ChapterNoteCount` 同构 ⇒ §0.3 的复用是干净的。
- **缺口**：徽标是「该文档全量条数」，面板 `.group-count`（`NotesPanel.vue:627`）是过滤后的可见条数（`applyViewToGroups` 搜索 + `currentDocOnly` / `chapterRange`），两处在过滤态下必然不等——档内未写这句，也没有任何一条判据覆盖过滤态（MF-6）。
- 溢出可判：`overflowFree`（`ui-shot.mjs:1584`，`rowScrollWidth ≤ clientWidth` 且 `labelScrollWidth ≤ clientWidth`）现成；但默认宽度下 `archive/older-paper.pdf` 行**不可能保持绿**（MF-1，像素级证据见下）。
- 懒加载徽标：`flattenVisible` + `rows` 派生保证「展开后新行自动带徽标」，但**无判据**（stub 未暴露 `libraryList` 计数口；MF-10）。

**2. N88 时机清单 / 不自动覆盖 / 草稿冲突 / 失败路径**

- 四个时机全部落在真实既有事件上，可判：① `WorkspacePage.onMounted` → `resetNotes()` + `loadNotes()`（`WorkspacePage.vue:98-99`）；③ `selectLeftTab("notes") → loadNotes()`（`:202`）；④ 写成功唯一漏斗 `applyNotes()`（`notes-store.ts:174-184`，`addNote`/`runMutation`/`removeNote`/`undoDelete` 均经它）；② `window` 的 `focus` 监听（现 `grep -rn 'addEventListener("focus"' pix/src | wc -l` = **0**，新增后 = 1，与 N88-2 #4 判据一致）。无轮询（`setInterval` 现 0，N88-6 #4 断言 0）。
- 「绝不自动覆盖」写死（§0.4 非阻塞含义 + §0.6 四条 + §5.1），并把「切工作区 / 打开面板 / 重试」的既有读盘登记为允许例外。
- 草稿冲突可判：`.note-comment textarea` 的读取有既有先例（`ui-shot.mjs:2811-2820`），§0.6 四条与 r14-3 `refresh-draft` 逐条对应。
- 失败路径非阻塞：N88-5 的三种失败形态 + store 失败分支只 `return`（`notes-store.ts` 现 `console.` = 0 处）。
- **但** r14-4 的 `stat-failure-silent` 相位步骤与自身断言矛盾，且中段的刷新点击会直接抛错（MF-2）。

**3. N89 与既有通道的关系（保留可用）**

- 事件名不与既有 `open-document`（现 `pix/src` 命中 3 处，**载荷 = 绝对路径**）冲突；`open-note-doc` 载荷 = 工作区相对 `docPath`，经 `WorkspacePage.onOpenNoteDoc` → `absoluteDocPath` → `openDocumentFromLibrary`（树行同一条通道，`:190-194`）。
- **无循环**：链路为 面板 → WorkspacePage → reader/reader-state store，阅读器侧没有回写笔记面板的路径；父级组件只在 `chapterFocusToken` 变化时切标签（`:207-213`），与本事件无关。
- 当前文档组由 `is-openable`（`!group.isCurrentDoc`）+ 处理器内守卫门控，可判。
- 一处判据写错文件（MF-4）。

**4. N90 可构造性**

- 「外部改动」可构造：Node 侧直接读-改-写 fixture 文件（既有先例 `ui-shot.mjs:6830-6831` 就是 `writeFileSync(NOTES_FILE, …)`）；stub 的 `notesStat` 真读真算 ⇒ 与渲染层基线哈希天然可比；`setNotesStatFailure(code|"throw")` 覆盖 `success:false` 与 IPC reject 两条链（stub 的 `NOTES_ERRORS` 已含 `read-failed: 笔记文件读取失败`，`:513-522`）。
- 焦点可构造：`triggerWindowFocus()` 合成 `window` 的 `focus` 事件，`addEventListener` 收合成事件，确定可达。
- 徽标断言的 DOM 判据真实存在：`.row-label` / `.row-progress` 现成，`.row-notes` 由 N87 落地；`--pix-left-width: 220px` 有既有实测先例（`r11-note-actions-narrow` phase `narrow-220` ⇒ `layoutLeftWidth = 220`）。
- **但** smoke-view 缺 `notes-path` 的 `require`，按现档字面 diff 约定无法落地断言组（MF-5）。
- 限制：离屏只能验证**合成**焦点事件，真实窗口激活路径无法由现有判据覆盖（非阻塞提示 3）。

**5. 白名单与改动对应**

- 12 个改动面与需求一一对应（`notes-path.ts` / `LibraryPanel.vue` / `shared/types.ts` / `main/notes-store.ts` / `ipc-handlers.ts` / `preload.ts` / `stores/notes-store.ts` / `NotesPanel.vue` / `WorkspacePage.vue` / 两个 smoke / `ui-shot.mjs`；`package.json` 登记为不动）。preload 与 stub 的同步都在清单内（preload 接口与实现各 41 方法 → 42；stub `api` 现 41 项 → 42）。
- 命名预检复核一致：`notes-stat` / `notesStat` / `ReaderNotesStatResult` / `statNotesFile` / `row-notes` / `notes-stale` / `is-openable` / `countNotesByDocument` / `externalChange` / `checkNotesFile` 在 `pix/src` 均 0 命中。
- 缺口：MF-3 / MF-4 / MF-5 / MF-9 四处表述或判据错误；stub 的 `activeRoot` 影响面未写全（非阻塞 4）。

### 二、must-fix 清单

**MF-1（阻塞）既有场景 `21`（`tree-progress`）的 `overflowFree(older)` 不可能保持绿，且 §0.9 自相矛盾。**

- 实测（R13 基线）：`archive/older-paper.pdf` 行 `clientWidth = 246`，`paddingLeft = 22`（depth 1）⇒ 内容宽 218；项目宽 = 14（占位）+ 16（图标）+ 96（label）+ 66（`.row-progress`「第 1024 页」，像素测量 x 195→260）+ 3×4（gap）= 204 ⇒ **自由空间仅 14px**。`sample-paper.pdf` 行自由空间 34px（进度徽标实测 47px）。
- 拟新增 `.row-notes`（`{N} 条`，`font-size: 10px`、`padding: 1px 5px`）按同款字体度量（11px 徽标实测：数字 ≈ 0.59em、空格 ≈ 0.29em）估算 = 18.9px 文本 + 10px padding ≈ 28.9px，再加 1 个 row gap 4px ⇒ **≈ 32.9px > 14px**；即便去掉 padding 与 gap（18.9px）也放不进。`.row-label` 是唯一可收缩项（`flex-shrink` 默认 1，`overflow: hidden` 使 `min-width: auto = 0`）⇒ labelClientWidth 降到 ≈77 < scrollWidth 96 ⇒ `overflowFree` 判 `label` 截断为**假** ⇒ 场景抛错、离屏退出码 1、`failure !== null`。
- 场景 21 现场**确有** older 行笔记：`runScenario` 的摘录动作（`ui-shot.mjs:1344-1373`，选区 = `SEL.pdfPageOne` 即首页第一个 span「Sparse Attention for Long-Context Retrieval」）在标准 4 条种子之外新增 1 条 sample 笔记 ⇒ 场景 21 时文件 5 条（R13 基线截图 pill 亦为「笔记 5」）= sample 4 + older 1 ⇒ 徽标必然渲染、`1 条` 必然占位。
- §0.9 自身冲突：「允许的位移与内容变更 ② 有笔记行的 `.row-label` 可用宽度减少约 32px（自由空间不足时出现省略号）」对上「**硬约束**：既有 `tree-progress` 场景的 `overflowFree`（行级与 label 级）必须保持绿」。
- 档内空间估算亦有误：算式 `246 - 8 - 6 - 14 - 16 - 3×4 - 109` 实得 **81**（档写 85），且只算了 sample 行，未算「第 1024 页」行。
- 需改：二选一并重写 §0.3 / §0.9（① 改冻结项——允许徽标收缩/改位次/改文案形态，并同步 N87-1/N87-4 几何判据；② 明确接受既有场景 21 label 截断——那就必须改写既有场景断言，与 N90-3 #2「既有场景函数体零改动」冲突，须负责人显式裁决），并用实测读数（sample 34px / older 14px）替换档内估算。

**MF-2（阻塞）`r14-4` 相位 `stat-failure-silent` 步骤与断言矛盾，中段点击会抛错。**

- 前一相位 `write-rebaseline` 以「写操作成功重新对标」收尾，断言 ② 断言 `.notes-stale` 不在 DOM ⇒ 进入本相位时 `externalChange === false`；而断言 ⑤ 要求「已置位时失败 ⇒ 提示仍在那」，步骤里没有任何「先置位」的动作。
- 步骤中段「点 `.stale-refresh` 复位」会走 `clickEl`（`ui-shot.mjs:6890` = `document.querySelector(sel).click()`）——元素不存在即 `TypeError`，场景直接失败。
- 需改：相位开头补 `appendExternalNote(n-external-1) → triggerWindowFocus() → 等 .notes-stale` 制造置位态后再注入失败；或把「置位前失败 ⇒ 不置位」与「已置位时失败 ⇒ 不清除」拆成两个各自带前置的相位。

**MF-3 N87-2 #5 判据不可满足。** `grep -c "for (" pix/src/renderer/utils/notes-path.ts` 现为 **2**（`groupNotesByDocument` 的两个循环，`:74` / `:98`），新增一个循环后为 3，不可能等于判据要求的 1。需改为按函数体范围计数（如 `sed -n '/countNotesByDocument/,/^}/p' … | grep -c "for ("` = 1），或写成「总数 = 3 = 既有 2 + 新增 1」。

**MF-4 N89-3 #2 判据写错文件。** `onOpenNoteDoc` 只出现在 `WorkspacePage.vue`（定义 + 绑定 2 处，与 N89-2 #4 一致）；`NotesPanel.vue` 中该名字应为 **0**（面板侧只有 `open-note-doc` 的 emits 声明与 emit 调用，与 N89-2 #3 的「pix/src 共 3 处」自洽）。需改文件/改期望值。

**MF-5 N90-2 的改动清单不准，dev 按字面实施会受限。** `smoke-view.mjs` 的 `compileAndLoad()` 现只 `require` 了 `outline-notes.js` 与 `reading-context.js`（`:465-466`）；`badge-counts` 要断言 `countNotesByDocument` 必须新增 `notesPath = require(join(OUT_DIR, "renderer", "utils", "notes-path.js"))`（外加模块句柄声明）。`files` / `required` / `allowed`（`:428-447`）确实零改动。需把这两行写进白名单第 11 条，并把 N90-2 #2 的「只新增常量、断言与 `main()` 一行调用」改写为「只新增常量、断言、模块句柄/require 与 `main()` 一行调用」。

**MF-6 徽标口径与面板 `.group-count` 的差异未写清（核对清单第 1 条直接要求）。** 需在 §0.3 明确「徽标恒示该文档全量条数；过滤态（搜索 / 章节过滤 / 仅看当前文档）下可与 `.group-count` 不等」，并补一条离屏断言（例：写入搜索串后 `.group-count` 变小而该行 `.row-notes` 文本不变），否则实现可能滑向「徽标跟过滤走」。

**MF-7 N87-4 #4 的 `git diff` 判据字面不可满足。** `.row-notes` 插入点紧贴 `.row-progress` 之前，统一 diff 的上下文行必然包含 `.row-progress` 模板行。需改为「以 `git diff -U0` 判定：`.row-progress` 不作为 +/- 行出现」，或删除该半句、保留 `grep -c "margin-left: auto"` = 1 的有效判据。

**MF-8 判据/夹具文字不一致（三项）。**
(a) N88-3 #3 写「等待 ≥ 5s」，而 r14-3 相位步骤是 `sleep(4500)`——统一为 4500ms 或改判据（仍须 > `NOTICE_MS = 4000` 以维持对照意义）。
(b) §0.8 写「**三条**外部夹具」，实际只定义 `n-external-1` / `n-external-2` 两条；r14-3 续段的「从 `notes.json` 外部删除编辑中的那一条」没有对应 helper（只列了 `appendExternalNote`）——补 helper 名或写清 Node 侧内联读-改-写。
(c) N88-1 #2「既有 41 个 preload 方法零改动」未给 stub 侧计数口径（stub `api` 现 41 项、改后 42），与 §0.9「stub 面 = preload 面」应合并成可复跑判据。

**MF-9 刷新按钮的控件形态与样式表冲突（需写死实现口径）。** §0.4 同时冻结「`.stale-refresh`（`v-btn`、`size="x-small"`、`variant="text"`、`prepend-icon="mdi-refresh"`）」与「与 `.notes-undo-btn` 同款（无边框、透明底、`padding: 1px 6px`、`font-size: 11px`）」；Vuetify 的 `x-small` 实际度量为 `--v-btn-height: 20px` 且自带 padding（`pix/node_modules/vuetify/lib/components/VBtn/VBtn.css:27-29`），两条不会同时成立。需二选一（保留 v-btn ⇒ 删除冲突的 padding/font-size 覆盖，改按既有行内 v-btn（`.notes-export-row` / `.notes-report-row`）口径登记），并同步目视比对条目。

**MF-10 N87-5 #3「首次展开目录仍只有一次 `libraryList` 调用」无判据。** stub 未暴露 `libraryList` 计数口（现有控制口清单 `ui-shot.mjs:1105-1160` 不含）。需补控制口（新增白名单条目 + 一条断言），或删除该半句、改为「`toggle` / `reload` 零 diff ⇒ 调用次数不变」的推导表述。

### 三、无异议项（已用真实文件/命令核对）

- 数据面纪律 N87-6 可判：`LibraryPanel.vue` 现仅 `window.pixApi.libraryList` 2 处（`:73` / `:103`），无 `setInterval|setTimeout`。
- N88 四面同步判据计数可实现：`notes-stat` handler 1 + preload invoke 1 = 2；`preload.ts` 内 `notesStat` = 2（接口 + 实现）；`ReaderNotesStatResult` 在 types = 1、preload = 3（import + 接口 + 实现断言）。
- `statNotesFile` 白名单可落地：`notesPaths()`（私有，`main/notes-store.ts:78`）、`isEnoent`（`:106`）、`ERROR_MESSAGES` 11 键且 `no-root` 文案逐字 `尚未选择资料库根目录`（`:41`）；当前 import 行（`:10-11`）确实未含 `createHash` / `statSync`。
- smoke-notes 脚手架兼容：`libraryRoot.setLibraryRoot()` / `clearLibraryRoot()`（smoke-notes `:178` / `:972`）、`seedReportNotes`、`sha256`、`NOTES_A` 全部现成；`main()` 追加一行可保持既有 7 组 44 条零改动。
- r14 场景可挂载：`runReaderStateScenarios` 末尾、`r13-5` 的 `restoreStandardSeed()`（`:8013`）之后、函数收口 `}`（`:8014`）之前；局部 `NOTES_FILE` / `readNotes` / `notesHash`（`:2206-2209`）可用；`archive/older-paper.pdf` 虽在场景 36 被删，但 50–55 段前按原字节重建（`:4067`），r14 场景可打开与断言。
- 既有 helper 复用无阻塞：`deleteRowByText`（`:5031`）、`clickUndo`、`notesNotice`（`:5078`）、`restoreStandardSeed` / `openNotesPanel`（`:3238-3246`）、`backToLibraryTab`（`:4228`）、`enterNotesProbe`（`:4933`）、`setLoadDelay`（`:1148`）、`notesLoadCalls`（`:1112`）、`notesReportCalls`（`:1132`）。
- 既有 `undoOrder()` 判据（notice → undo → export）不会因 `.notes-stale` 插入而失效（只判「notice 在 undo 前」「undo 在 export 前」，`:5063-5069`）。
- 工程门：`cd pix && npm run check` ⇒ `CHECK_EXIT=0`（2026-09-16 实跑）。

### 四、非阻塞提示

1. 徽标背景拟用 `--pix-bg-hover`（#e8eff5），与 `.tree-row:hover` 的行背景同值 ⇒ 悬停该行时徽标轮廓消失；建议改用 `--pix-bg-active`，或在 dev 档登记为已知现象。
2. 事实表按「标准种子 4 条」推导**既有场景**读数会失真：场景 21 现场是 5 条（sample 4 + older 1）。建议在事实表补一句「既有场景运行时文件含 `runScenario` 摘录新增的第 5 条」。
3. 焦点检测在离屏只能验证合成事件；`window` 级 focus 在规范中于窗口激活时对 Window 触发（与元素焦点无关），但建议 dev 档人工做一次真实「切出 → 外部改文件 → 切回」走查并登记结论（不新增离屏判据）。
4. stub 契约建议一次写清 `activeRoot` 影响面：随 `activeRoot` = `readNotesFile` / `writeNotesFile` / `notesLoad` / `notesStat`；仍锚 A 根 = `relativeDocPath` / `isInsideNotesRoot` / `notesExport` / `notesExportReport` / `notesReset`。现状（add/update/delete 走 `readNotesFile`/`writeNotesFile` 却由 `isInsideNotesRoot` 锚 A）在 B 侧写操作会判 `outside`——本轮无场景触发，但需一句话写死以免 dev 各自发挥。
5. `smoke-notes` 新组 #1 `clearLibraryRoot()` 之后必须重新 `setLibraryRoot(WS_A)` 才能继续 #2…#7（实现细节，建议表格补一行）。

---

## 设计评审（R14）

> 评审对象：`docs/pm/R14-design.md`；对照 `docs/pm/R14-req.md`（含 §0 定稿修订 M1–M10 与 §0.1–§0.9 冻结契约）。
> 评审基线：HEAD `20dd452`；`git status --short` ⇒ `?? docs/pm/R14-design.md` / `?? docs/pm/R14-req.md` / `?? docs/pm/R14-review.md`。
> 证据口径：只读文件 + `grep` / `git`（本步**未**跑离屏取证与烟测）；唯一工程门本步实跑 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`；零缺失基线只读复读 `C:/Users/86157/AppData/Local/Temp/pix-v05-r13-review/shots/{MANIFEST,MEASUREMENTS}.json`（实读 `MEASUREMENTS.json` 长度 **198**、`label` 去重 **46** 种，与档内一致）。
> 结论：**revise（修订后开工）** —— 5 项 must-fix（其中 MF-1 按字面落地 `check` 必红；MF-2 / MF-3 为判据自相矛盾；MF-4 / MF-5 为 `r14-1` 窄栏相位判据不完整）。除这 5 条外，本档逐条与真实代码、真实读数一致，未发现其他阻塞项。

### 一、重点核对（逐条结论与证据）

**1. 徽标派生：同源 / memo 失效条件 / 性能口径**

- **同源 ✓**：面板分组 = `applyViewToGroups(groupNotesByDocument(notes.value, …))`（`pix/src/renderer/stores/notes-store.ts:142-145`），徽标 = `countNotesByDocument(notesStore.notes)`（设计 §1.3）——同一个 `notes`，与 N87 的「数据只来自 store 列表」一致。
- **memo 失效条件完整 ✓**：全部写入路径都是「换引用」——`applyNotes()`（`:174-184`）、`loadNotes()` 成功分支 `notes.value = result.notes`（`:200`）、`recoverCorruptNotes()` 成功分支（`:334`）、`resetNotes()` 的 `notes.value = []`；无任何 `push` / `splice` 原地改写（本步实读全文件）。因此笔记增删改撤销、读盘、刷新、切工作区（`resetNotes()` + 重新 `loadNotes()`）都会触发重算。本步实跑 `grep -c "applyNotes(" = 5`（定义 1 + 调用 4），与档内一致。
- **文档重命名未登记（非阻塞，见 §四-1）**：徽标键 = 存储侧 `note.docPath` 经 `docPathKey`；树行键 = `currentDocKey(row.node.path, rootDir)`。磁盘改名后二者不再匹配 ⇒ 徽标消失、面板仍按旧 `docPath` 分组。需求未覆盖该边界，属可见且可预期的行为，建议补一行登记（不改判据）。
- **性能口径**：档内只有结构判据（§1.3 两层 `computed` + §1.8 #5 走查），**无时序/次数判据**；需求未设性能指标 ⇒ 可接受；建议在 §1.3 明写「本档不设性能断言」，避免 dev 自行加计时判据。

**2. 外部改动检测：时机可达性 / 哈希口径 / 不自动覆盖 / 失败路径**

- **时机 ①③ 落在既有 `loadNotes`**（`WorkspacePage.vue:98-99` / `:202`）、**④ 落在唯一写成功漏斗** `applyNotes` + `recoverCorruptNotes`、**② 落在新增 `window` 的 `focus` 监听**（`NotesPanel.vue` 现无 `onMounted`，`onBeforeUnmount` `:415-431` 四项清理）——逐条与实读一致 ✓。
- **离屏可构造 ✓，且档内「真实获焦路径无法覆盖」的表述过谦**：`ui-shot.mjs:6172-6175`（场景 65-0）已有 `win.show(); win.focus(); win.webContents.focus(); await waitFor("窗口获得焦点", "document.hasFocus()", 15000)` 的先例，且 `document.hasFocus() === true` 被断言 ⇒ 运行期窗口**确实会真实获焦**。合成派发（`window.dispatchEvent(new Event("focus"))`）能命中 `addEventListener` 的监听器，故判据本身有效；建议把 §1.5 纪律 3 与风险 5 的措辞从「无法由离屏覆盖」改为「本轮按需求冻结使用合成派发；真实获焦路径在离屏可达但本轮不新增判据，dev 档人工走查一次」。
- **哈希口径稳定 ✓**：判定式两侧都取**同一文件的原始字节** sha256，比较路径**不重新序列化**；写入方 `serializeNotes` 为 `JSON.stringify(file, null, 2) + "\n"`（数组序保持），`size` / `mtimeMs` 只作观测不参与判定 ⇒ 「JSON 序列化顺序」不构成判据风险。外部改写即使语义等价、字节不同 ⇒ 置位（正确语义）。
- **「不自动覆盖」与草稿状态机自洽 ✓**：唯一会改列表的路径 = `loadNotes()`（显式刷新 / 打开面板 / 重试）；草稿态 `editingCommentId` / `commentDraft` 全在面板本地（store 侧 `grep -c "editingCommentId" notes-store.ts = 0`）；刷新期间 `status="loading"` 会把列表整块换成 `.notes-loading`（`NotesPanel.vue:575`），但组件态不随 DOM 重建丢失 ⇒ `r14-3` ⑪ 可判。
- **失败路径非阻塞 ✓**：`syncNotesFile` 三种失败均 `return`（不改 `externalChange`、不弹 `.notes-notice`、不写日志；现 `grep -c "console\." notes-store.ts = 0`）；stub 的 `"throw"` 由 `await` + `try/catch` 覆盖 ⇒ `r14-4` ⑤⑥⑦ 可判。
- **竞态 ✓**：`notesFileSeq` 与 `loadSeq` / `writeSeq` / `undoScope` / `reportScope` 同范式；`resetNotes()` 递增并置空基线 ⇒ 跨工作区不残留（≥3 处判据可达）。
- **语义登记齐备 ✓**：捕获失败基线滞留、外部改动被撤回后 compare 清零（⇔ 语义的直接后果）、失败注入只作用于 compare 相位，均已在 §1.6 登记。

**3. IPC 四面同步（types / ipc-handlers / preload / stub）逐条可判**

- **三处方法名清单本步程序化比对：接口 41 = 实现 41 = stub 41，且逐字相等**（`pix/src/main/preload.ts:34-107` / `:109-191` / `ui-shot.mjs:798-1100`，提取正则与 §1.1.5 #2 相同）⇒ 「改后各 42 项且清单逐字相等」可判，与 R14-req MF-8(c) 同口径 ✓。
- **逐字落点全部与实读一致 ✓**：`ipc-handlers.ts:21` 的 import 名单（`addNote…updateNoteComment`）逐字相同且插入位（`restoreNote, statNotesFile, updateNoteComment`）字母序正确；八通道在 `:513-531`、`// Reader state` 分节在 `:533` 起；`preload.ts` 接口 `:71-78`（`notesReset` 在 `:78`）、实现 `:160-169`（`notesReset` 在 `:169`）、类型 import 名单插在 `ReaderNotesResetResult`（`:26`）与 `ReaderStateLoadResult` 之间；`types.ts` 的 `ReaderNotesLoadResult`（`:383-389`）之后为插入点；`ReaderNotesErrorCode` 仍 11 键 ✓。
- **主进程只读实现可判 ✓**：`notesPaths()`（`:78`）、`isEnoent`（`:106`）、`ERROR_MESSAGES` 11 键且 `no-root` 逐字 `尚未选择资料库根目录`；`node:crypto` 现名单无 `createHash`、`node:fs` 现名单无 `statSync`（`:10-11`）⇒ 档内「import 追加两行」与现状吻合。
- **stub 面能模拟外部改动 ✓（读真实 stub 代码确认）**：`readNotesFile()` 每次 `fs.readFileSync(NOTES_FILE)` 现读、**无内存缓存**（`:481-490`）⇒ 外部写入可被下次读取看见；`writeNotesFile` 的字节格式 `JSON.stringify({version:1,notes},null,2)+"\n"`（`:492-495`）与档内 `writeNotesOutside` **逐字同格式**；Node 侧直改先例 `writeFileSync(NOTES_FILE, …)`（`:6830-6831`）；stub 作用域已有 `fs` / `path`，追加 `node:crypto` 后 `crypto.createHash` 可用 ✓。
- **缺口（MF-1）**：两处消费侧类型 import 未登记。**缺口（MF-2）**：§1.8 #16 的 `NOTES_FILE` 计数判据与 §1.1.4 第 2 项冲突。**表述不精确（非阻塞，§四-2）**：`notesReset`（`:1050-1055`）内部写盘经 `writeNotesFile`（改后随 `activeRoot`），「仍锚 A 根」仅对其 `backupPath` 成立。

**4. 离屏场景可构造性与空断言风险**

- **引用到的既有 helper 全部实存**（本步逐个 `grep` 命中）：`waitFor:1517`、`record:1528`、`rowFinder:2796`、`setSearch:4942`、`searchProbe:4953`、`deleteRowByText:5031`、`clickUndo:5071`、`notesNotice:5078`、`backToLibraryTab:4228`、`enterNotesProbe:4933`、`restoreStandardSeed:3244`、`openNotesPanel:3238`、`waitTreeRows:1587`、`waitPdfLoaded:1589`、`waitPage:1590`、`readNotes:2208`、`notesHash:2209`、`loadCalls:4072`、`clickEl:6890`、`rectOfSelector:2397`、`repaint:1182`、`sleep:1512`；`overflowFree:1584` 只读四处宽高，与 `badgeProbe` 字段兼容 ✓。
- **挂载点 ✓**：`runReaderStateScenarios` 末尾 `await restoreStandardSeed();`（`:8013`）之后、函数收口 `}`（`:8014`）之前（本步实读）。
- **前置可构造 ✓**：A 树 5 行（`archive` 目录 + 4 文件；`archive/older-paper.pdf` 虽在场景 36 末段被 `rmSync`，但 50–55 段开头按原字节重建 `:4067`，r14 块在其后）⇒ `waitTreeRows(5)`、`rowByTitle("older-paper.pdf")` 成立；`rowFinder("We study retrieval", false)` 命中 `n-current-1`（`seedNotes():325-370`）；搜索串 `Reproducibility` 只命中 `n-other-1`，且 `applyViewToGroups` 丢弃空组（`notes-view.ts:55-59`）⇒ `r14-1` `live` ⑨「`.notes-group` 数 = 1」可判；`clickEl` 点 `v-btn` 根已有多处先例（`:7577` 起，`SEL.reportBtn`）⇒ 点 `.stale-refresh` 不抛 `TypeError` ✓。
- **非同步双击守卫可判 ✓**：`refreshing.value = true` 在首个 `await` 之前同步置位 ⇒ 同一同步段内第二次 `click()` 被首行守卫拦下（`disabled` 只是第二道防线）⇒ `loadCalls()` 增量恰 1 成立。
- **窄栏变量与相位数 ✓**：`--pix-left-width` 定义于 `variables.css:112`（`268px`），R11 先例（`:6765` / `:6807`）证明 `220px` 生效（`.layout-left` 实测 218–222）。**但**：`r14-1` 的 `narrow` 相位缺 `.row-notes` 存在性防空（MF-4）与 restore 侧判据（MF-5）。
- **既有断言不受新元素影响 ✓**：全仓 `childCount` 探针只用于 `.map-row`（`:4141` / `:4159`），**没有**任何对 `.tree-row` / `.notes-panel` 子元素计数或子结构全集的断言；`undoOrder()`（`:5063-5069`）只判相对顺序 ⇒ 插入 `.row-notes` / `.notes-stale` 不打红既有断言。
- **一处登记示例待实测（非阻塞，§四-3）**：档内「既有场景 21 运行时文件 = 5 条 ⇒ sample 行 `4 条`」在可用基线产物中**无法复核**（`MEASUREMENTS.json` 无 pill 文本字段；`共 5 条` 0 命中、`共 4 条` 20 命中且属其它场景）。不影响任何判据（场景 21 只判 `overflowFree` + 文本；个位数字母版宽一致），但 dev 应实测登记真实值。

**5. 白名单一致性与对既有断言的影响**

- §4 的 **12 个改动文件 + 1 份文档**与需求 §6 白名单逐条一致 ✓；§7.1 的 A/B 分工 7 + 5 无重叠 ✓；`package.json` / `package-lock.json` / `variables.css` / `packages/**` / `tsconfig*` 零 diff 与需求 §5.8 一致 ✓（本步 `git status --short` 仅三份 R14 文档）。
- 树行既有元素零改动可判 ✓：`grep -c "margin-left: auto" LibraryPanel.vue = 1`（本步实读），§1.8 #8 / §2.3 ④ 的 `-U0` 判据可执行。
- 既有场景 24（唯一跨工作区）B 侧断言实读为「`bRow` 存在性 / `.row-progress` 计数 0 / 续读入口 absent / 空态文案」（`:2164-2176`）⇒ stub 笔记根改造只造成**截图内容**变化（pill 文本），不影响判据 ✓，档内登记项成立。
- 新增焦点监听顺带产生的 `notes-stat` 调用**不影响任何既有计数口**（既有断言只用 `notesLoadCalls` / `notesAddCalls` / `notesRestoreCalls` / `notesReportCalls` / `libraryShowCalls` / `readerStateSaveCalls` / `sendCalls`）✓。
- 但 `win.show(); win.focus()`（`:6172-6175`）让「既有场景不会出现 `.notes-stale`」（§5.5 允许变更 ③）不再由「离屏无焦点事件」兜底，而由「种子写入后总有一次 `loadNotes` 捕获」兜底；本步核对既有唯一一处外部直改（`:6831`）发生在 `goHome()` 之后（面板已卸载）⇒ 现状成立，建议 dev 验收跑后抽查一次（该风险只影响截图内容，不影响零缺失判据）。

### 二、must-fix 清单

**MF-1（阻塞：按字面落地 `npm run check` 必红）两处 `ReaderNotesStatResult` 类型 import 未登记。**

- 现状：`pix/src/main/notes-store.ts` 的类型 import 名单（`:14-27`）止于 `ReaderNotesResetResult`；`pix/src/renderer/stores/notes-store.ts` 的类型 import 名单（`:12-18`）止于 `ReaderNotesReportChapter`；两处均无 `ReaderNotesStatResult`。
- 冲突：§1.2 的参考实现签名 `export function statNotesFile(): ReaderNotesStatResult {` 与 §1.6 的 `let result: ReaderNotesStatResult;` 都要求该类型在作用域内，而 §1.2 / §4 第 4 行 / §4 第 7 行只写了值 import（`createHash` / `statSync`）。
- 修法：① `pix/src/main/notes-store.ts` 的类型 import 名单在 `ReaderNotesResetResult,` 之后插 `  ReaderNotesStatResult,`（字母序 `Reset` < `Stat`）；② `pix/src/renderer/stores/notes-store.ts` 的 `@shared/types` 名单在 `ReaderNotesReportChapter,` 之后插 `  ReaderNotesStatResult,`；③ §1.8 增两条计数判据：`grep -c "ReaderNotesStatResult" pix/src/main/notes-store.ts` = **2**（import 1 + 返回类型 1）、`grep -c "ReaderNotesStatResult" pix/src/renderer/stores/notes-store.ts` = **1**（import 1）。

**MF-2（阻塞：判据不可满足）§1.8 #16「`grep -c "NOTES_FILE" pix/scripts/ui-shot.mjs` 不减少」与 §1.1.4 第 2 项冲突。**

- 本步实读：改前该计数 = **14**（`:428` 定义 / `:445` 注释 / `:484` / `:493` / `:494` / `:869` / `:871` / `:1054` / `:1107` / `:2207-2209` / `:6831` / `:7406` 注释）。§1.1.4 第 2 项要求 `readNotesFile` / `writeNotesFile` / `notesLoad`（含 `filePath`）改用 `currentNotesFile()` ⇒ `:484` / `:493` / `:494` / `:869` / `:871` 五行必然改为 `currentNotesFile()` ⇒ 计数**必然降到 9**（若只改成功分支的 `filePath`，为 10）。「不减少」永远判红。
- 修法：改写为「`NOTES_FILE` 常量**保留且仍被引用**（`:428` 定义 + `:1054` `backupPath` + `:1107` `seedNotes` 返回值，≥3 处）+ `currentNotesFile()` 被 `readNotesFile` / `writeNotesFile` / `notesLoad`（两个分支的 `filePath`）/ `notesStat` 引用（`grep -n "currentNotesFile" … | wc -l` ≥ 6）；`grep -c "NOTES_FILE" …` 改后 = **9**（本档实读口径；dev 若只改成功分支则为 10，以 dev 实测登记为准）」。

**MF-3（阻塞：判据自相矛盾）§1.8 #12「`:title="group.docPath"` 行零 diff」与 §2.2 第 4 行冲突。**

- 本步实读：`NotesPanel.vue:621` 现值为 `<div class="notes-group-head" :title="group.docPath">`；§2.2 第 4 行要求把**同一行**改成含 `:class` 与 `@click` 的新行 ⇒ 该行必然以 `-` / `+` 出现在 `git diff` 中，「行零 diff」不可满足（与 R14-req MF-7 同源的整行 diff 字面陷阱）。
- 修法：该半句改为「`:title` 的**绑定表达式**逐字仍为 `group.docPath`（该行因新增 `:class` / `@click` 属预期改动，会出现在 `git diff -U0` 的 `+` 行）；`.group-titles` / `.group-name` / `.group-path` / `v-chip` / `.group-count` 子结构零改动（`git diff -U0` 中这些字面不作为 `-` 行出现）」，与 §0.7「DOM 结构与 `:title` 零变化」口径对齐。

**MF-4（判据不完整：空断言假绿）`r14-1` 相位 `narrow` 缺 `.row-notes` 存在性防空。**

- 现状：§5.4.4 的 `narrow` 相位 ⑩–⑬ 全部建立在「徽标节点存在」这一**隐含前提**上；`badgeProbe` 在节点缺席时返回 `notesClientWidth: null`，而 ⑬ 的让位判据（`labelClientWidth ≥ min(labelScrollWidth, labelFloor) − 1`）在徽标缺席时**更容易成立** ⇒ 徽标未渲染 / 选择器写错时该相位静默通过（该相位是本轮唯一验证「窄栏徽标让位」的判据）。
- 修法：`narrow` 相位断言补两条防空——两行 `notesCount === 1`（`.row-notes` 恰 1 个）与 `notesClientWidth !== null`；`data` 的 `notesBadge` 说明补「`notesClientWidth ∈ {0} ∪ [5, ∞)`（0 = 整体让位、≥5 = 数字可见）」，与需求 N87-4 #2 的「必须登记 `notesClientWidth` / `notesScrollWidth`」对齐。

**MF-5（判据不完整：缺 end 向）`r14-1` 相位 `narrow` 缺 restore 侧判据，未对齐 R11 三相位范式（M4 教训）。**

- 现状：该相位只在 `setProperty("--pix-left-width", "220px")` 之后判据，`removeProperty` 之后仅 `repaint`、**无任何断言**；R11 的同类相位是**三相位**（`ui-shot.mjs:6753-6815`：`default-width` → `narrow-220` → `restored-width`，各带 `.layout-left` ±2 防空与几何复核）。缺 end 向判据 ⇒ 「变量未复位」不会被发现，后续场景在错误布局下继续跑。
- 修法（**不新增 record / 截图，配额不变**）：在**同一** `narrow` record 内追加复原读数与断言——`removeProperty` + `repaint` 之后复核 ① `.layout-left` 回到 268±2（`variables.css:112` 实读 `268px`；R11 的 `widthOk11e` 亦为 268±2）② 两行 `notesClientWidth` 回到默认宽度读数（sample：`notesScrollWidth ≤ notesClientWidth + 1`；older ≈10）③ `rowScrollWidth ≤ rowClientWidth + 1` ④ 让位判据成立；`data` 增 `restored` 字段。若负责人要求独立相位，须同改 §0.8 的配额（13 条 record / 5 种 label）——超出设计档权限。

### 三、无异议项（本步已用真实文件 / 真实读数核对）

- 档内事实基线的行号与数字**逐条实读一致**：12 个文件的 `wc -l`（`LibraryPanel.vue` 277 / `renderer/stores/notes-store.ts` 483 / `main/notes-store.ts` 551 / `ipc-handlers.ts` 894 / `preload.ts` 193 / `types.ts` 620 / `NotesPanel.vue` 1468 / `WorkspacePage.vue` 447 / `notes-path.ts` 118 / `ui-shot.mjs` 8171 / `smoke-notes.mjs` 1001 / `smoke-view.mjs` 492）；`SEL` 顶层键 **54**（`:47-106`，程序化计数）；八个 notes 通道行号；模板块顺序 `.notes-notice :536-542` → `.notes-undo :543` → `.notes-export-row :550` → `.notes-report-row :562` → `.notes-loading :575`；`.notes-group-head :621` / `.group-name :623` / `.group-count :627`；`LibraryPanel.vue` 的 `rows :33` / `progressMap :35-46` / 模板 `:151-168` / 样式 `:213-270`；`WorkspacePage.vue` 的 `:98-99` / `:190-194` / `:202` / `:216-224` / `:290` / `:310`。
- 档内基线计数**逐条实跑一致**：`for (` in notes-path = 2、`margin-left: auto` = 1、`applyNotes(` = 5、`editingCommentId.value = ` = 3、`selectedFilePath.value = ` = 2、`console.` in store = 0、`pixApi.` in LibraryPanel = 2、`.pix-read` in renderer = 2、`setInterval` in store = 0、`externalChange|notes-stale` in main = 0、`addEventListener("focus"` = 0、`open-document` = 3、`setInterval|setTimeout` in LibraryPanel = 0；本轮 12 个新名字（`notes-stat` / `notesStat` / `ReaderNotesStatResult` / `statNotesFile` / `row-notes` / `notes-stale` / `countNotesByDocument` / `externalChange` / `checkNotesFile` / `onOpenNoteDoc` / `open-note-doc` / `is-openable`）在 `pix/src` **全部 0 命中**（命名预检成立）。
- 样式复用可落地：`--pix-text-link` / `--pix-border-light` / `--pix-bg-elevated` / `--pix-radius-md` / `--pix-text-secondary` 均在 `variables.css` 已定义（`:34` / `:25` / `:20` / `:94` / `:31`）⇒「不新增变量」成立；`.notes-stale` / `.stale-text` 与既有 `.notes-undo`（`:989`）/ `.undo-text`（`:1000`）同盒模型 ✓。
- `r14-5` 的 `cursor` 判据可判：`.notes-group-head`（`:1182-1188`）无 `cursor` 声明，且该文件 17 处既有 `cursor` 规则的宿主选择器**无一是其祖先** ⇒ 计算值 `auto` ≠ `pointer` ✓。
- 场景链条闭合：`r14-1` 的阅读现场（`entry(1024, 1.1)`）与既有场景 21 同款（`stateFilePath` / `normalizeState` 校验通过）；`r14-2` 的 B 侧空态（B 的 `.pix-read` 无 `notes.json` ⇒ `readNotesFile` 返回 `[]` ⇒ `.notes-empty`）；`r14-3` / `r14-4` 的三条外部夹具与标准种子不重名、`docPath` 互不相同；`r14-5` 的 `older-paper.pdf` 为 2 页（既有 `:7382` 的 `pageCount: 2` 佐证）⇒ `waitPage(1, 2)` 成立。
- 烟测面：`smoke-notes.mjs` 的 `WS_A`（`:27`）/ `NOTES_A`（`:31`）/ `DOC_A`（`:35`）/ `PIX_READ_A`（`:29`）/ `REPORTS_A`（`:40`）/ `serialize`（`:86`）/ `sha256`（`:85`）/ `readFileNotes`（`:95`）/ `writeNotesFile`（`:90`）/ `seedReportNotes`（`:113`）/ `libraryRoot.setLibraryRoot|clearLibraryRoot`（`:178` 起 / `:972`）全部现成，`main()`（`:976-1001`）追加一行可行 ✓；`smoke-view.mjs` 的 `files:428` 已含 `notes-path.ts`、`required:446` 已含 `notes-path.js`、`allowed:447` 不动、模块句柄在 `:82-83`、`require` 在 `:465-466` ⇒ N90-2 判据 2 的落地方式可行 ✓。
- 唯一工程门：本步实跑 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`。

### 四、非阻塞提示（建议 dev 档登记或就地修订，不阻塞开工）

1. **文档重命名边界未登记**：徽标按存储 `docPath` 聚合（§一-1），磁盘改名后徽标消失；建议在 §0.3「计数口径」或 §3 补一行（不改判据）。
2. **`activeRoot` 影响面表述不精确**：`notesReset`（`:1050-1055`）内部写盘经 `writeNotesFile`（改后随 `activeRoot`），「仍锚 A 根」仅对其 `backupPath` 成立；建议照实改写（B 侧本轮无场景触发，行为无影响）。
3. **既有场景 21 的徽标读数示例待实测**：见 §一-4 末段（本步无法从 R13 基线产物复核；判据不受影响）。
4. **helper 面缺两个小包装**：相位里用到的 `notesStatCalls()`（读 `.count`）与 `setNotesStatFailure(code)` 未列入 §0.3 的 helper 表（6 个 + `writeNotesOutside`）；建议补入（语义与 `notesReportCalls:7428` / `setNotesReportFailure:7430` 同范式），免得 dev 各自内联。
5. **`.stale-refresh` 的「同高同字号」只有单侧读数**：`staleProbe` 只登记 `.stale-refresh` 的高度；§8 要求与导出 / 报告行的行内按钮比对，建议把另一侧（`.notes-export-row` 的行内 `v-btn`）或期望值（Vuetify x-small `--v-btn-height: 20px`，`VBtn.css:27-29`）一并写入同一测量，否则该目视条目只能靠人工判断。
6. **性能口径建议写死**：见 §一-1 末段（本档不设性能断言）。
## 代码审查（R14）

> 审查对象：R14 交付（工作树 `git diff` 的 12 个源码 / 脚本文件 + `docs/pm/R14-dev.md`），对照 `docs/pm/R14-req.md`（含 §0 定稿修订 M1–M10 与 §0.1–§0.9 冻结契约）与 `docs/pm/R14-design.md`（含定稿修订 MF-1…MF-5）。
> 审查基线：HEAD `20dd452`；`git status --short` ⇒ 12 个 `M`（逐条落在 R14-req §6 白名单第 1–12 项内）+ 4 份未跟踪文档；白名单外零改动。
> 审查步独立性：以下全部读数（工程门 / 两个烟测 / 离屏 143 张全量 / 零缺失比对 / 13 条 record 复算 / 8 张新截图目视 / 独立边界探针 / 两处失败注入）均为**审查步独立实跑**，未复用交付方结论与产物；比对基线为只读复读 `C:/Users/86157/AppData/Local/Temp/pix-v05-r13-review`。对应原始产物：`C:/Users/86157/AppData/Local/Temp/pix-v05-r14-review/{shots/MANIFEST.json,shots/MEASUREMENTS.json}`。
> 结论：**accept（通过）**——无阻塞性 must-fix；交付与需求 / 设计逐条一致，既有 135 张 / 198 条 / 46 种 label 零缺失、仅时间戳 / 随机 id / 计时字段有非确定性差异；3 项已登记偏差（D2 / D3 / D7）需负责人显式追认。

### 一、实跑证据（审查步逐条，命令与读数）

**1.【check】唯一工程门**

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
# ⇒ CHECK_EXIT=0（落地态；两处注入回滚后复跑同为 0）
```

**2.【烟测-主进程】`node scripts/smoke-notes.mjs`**

```text
通过 51 / 失败 0（退出码 0；复跑 3 次一致）
组构成（独立计数）：undo-roundtrip 8 / undo-failures 8 / undo-slot-lifecycle 6 / export-and-empty 4 /
report-render 7 / report-files 5 / report-failures 6 / notes-stat 7 = 44 + 7
```

**3.【烟测-渲染】`node scripts/smoke-view.mjs`**

```text
通过 35 / 失败 0（退出码 0；复跑 2 次一致）
组构成（独立计数）：section-hit 8 / section-null 8 / section-nav 8 / section-format 5 / badge-counts 6 = 29 + 6
```

**4.【离屏】`PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v05-r14-review ./node_modules/.bin/electron scripts/ui-shot.mjs`**

```text
UI_SHOT_EXIT=0；[ui-shot] 结束：产出 143 张截图；MANIFEST.json.failure === null
shots/ 一级条目 145 = 143 png + MANIFEST.json + MEASUREMENTS.json；白名单外条目 0
```

**5.【零缺失比对（独立复算）】**

```text
截图：base 135 → after 143；missing []；added 恰 8 张
      （r14-1-tree-notes-badge / r14-1b-tree-badges-narrow / r14-2-tree-badge-workspace-b / r14-3-stale-row /
        r14-3b-refresh-keeps-draft / r14-3c-refresh-list-synced / r14-4-stat-failure-silent / r14-5-group-jump）
测量：label 46 → 51；条数 198 → 211；按 label 计次 missing []
```

**6.【既有面结构比对（46 种既有 label 全量归一化复算）】** 唯一差异只出现在时间戳 / 随机 id / 性能计时字段（`elapsedMs` / `waitMs` / `*At` / `updatedAt` / `createdAt` / 生成时间 / `n-<ts>-<rand>`）。`tree-progress` 三相与 R13 逐字相同：`sample 109/109 + 第 3 页`、`older 96/96 + 第 1024 页`、`notes 111/111`、`archive 44/44`、行 `246/246`；`workspace-switch` 的 B 侧读数逐字相同（`选择左侧文件开始阅读`、行 246/109）。即既有树行 / 进度徽标 / 面板零结构位移。

**7.【13 条 `r14-*` record 逐条复算（按设计档 §5.4 判据，用真实 MEASUREMENTS 读数）】**

| record / phase | 关键读数（复算结论） |
| --- | --- |
| `r14-tree-badge` / `badges` | sample `3 条` + `摘录 2 条 · AI 结论 1 条`、`19 ≤ 19+1`（未压缩）；older `1 条` + `摘录 1 条 · AI 结论 0 条`、`clientWidth 10 < scrollWidth 19`（压缩态、`10 ≥ 5` 无空胶囊）；reading-notes.md / long-book.pdf / archive 三行 `notesCount 0` 且 `progressCount 0`；两行 `progressBox.right 261 = 267 − 6`（贴右内缘）、`notes.right ≤ progress.left`、`domOrder true`；让位判据 `109 ≥ min(109,139)−1`、`96 ≥ min(96,106)−1`；五行 `rowScrollWidth ≤ rowClientWidth` |
| `r14-tree-badge` / `live` | 删除后 `2 条` / `摘录 1 条 · AI 结论 1 条`、撤销后 `3 条` / `摘录 2 条 · AI 结论 1 条`，行数真实变化 `3 → 4`；过滤态（搜索 `Reproducibility`）组分计数仅 `共 1 条`（无 `共 3 条`）而 sample 徽标仍 `3 条`（徽标恒示全量）；清空搜索回 4 行 |
| `r14-tree-badge` / `narrow` | `.layout-left 220`；两行 `row 198/198`；两行 `notesCount 1` 且 `notesClientWidth 0`（整体让位，非 null ⇒ 防空成立）；`progress` 文本与盒宽不变（47 / 66）、贴右内缘；让位判据 `91 ≥ min(109,91)−1`、`58 ≥ min(96,58)−1`；复原 `.layout-left 268`、sample `19/19`、older `10`（∈9..11） |
| `r14-tree-badge-scope` / `b-workspace` | `loadDelta 2 ≥ 1`；B 树 `badgeCount 0`（树行在场）；`.notes-empty` 在场；`.notes-stale` 缺席（跨工作区不残留） |
| `r14-tree-badge-scope` / `back-to-a` | sample `3 条`、older `1 条`（回切恢复） |
| `r14-notes-stale` / `enter-fresh` | 行 5、外部新增可见、`.notes-stale` 缺席（不误报）；徽标与文件一致（older `2 条` / sample `3 条`） |
| `r14-notes-stale` / `detect` | 文案 / `刷新` / `重新读取笔记文件` 逐字；`order.names = [notes-header, notes-stale, notes-list]`（stale 紧随 header）；行 5 / `共 5 条`（检测不改写列表）；`hashSame true`（只读）+ `statDelta 1`（走新通道）；提示期间勾选生效（`已选 1 条`）；4.5s 后提示仍在 |
| `r14-notes-stale` / `refresh-draft` | 刷新后提示消失、`textarea` 在 DOM、`value` 逐字 `刷新不应丢弃这段草稿`、`[保存, 取消]` 仍在；行 6 = 文件 6；徽标同步 `reading 1 条 / older 2 条 / sample 3 条`；`hashSame true`、`loadDelta 1`、写增量 `add 0 / report 0`；**续段**：外部删除后行与编辑框消失、行 5 = 文件 5、提示与弹错皆缺席、草稿未自动保存、`load 1 / add 0 / report 0` |
| `r14-notes-stale-failure` / `write-rebaseline` | `staleBefore true → staleAfter false`（写成功重新对标）；行 4 = 文件 4；外部新增可见；`hashChanged true` |
| `r14-notes-stale-failure` / `stat-failure-silent` | 两注入（`read-failed` / `throw`）下提示保持 `true/true`、`.notes-notice` 均 `null`、行数不变、`statDelta 4`；置位态刷新后提示消失；清位后注入失败不置位 |
| `r14-notes-stale-failure` / `inflight-guard` | 在途双击 `loadDelta 1`（守卫生效）；落地后提示消失、行 6 = 文件 6 |
| `r14-group-jump` / `current-noop` | 当前组头 `openable false` / `cursor auto` / `title sample-paper.pdf`；点击后 pill / 页码 / 分组顺序 / 哈希均不变 |
| `r14-group-jump` / `jump-other-doc` | 非当前组头 `openable true` / `cursor pointer`；点击后 `older-paper.pdf` + `第 1 / 2 页`；首组为 `archive/older-paper.pdf`（带 chip、无 `is-openable`）；行 4；`hashSame true`、`loadDelta 0`、`statDelta 0`（跳转不发笔记 IPC） |

**8.【失败注入（两处，独立）】**

- a) `statNotesFile` 的 `hash` 改为 `String(stat.size)`（模拟指纹口径漂移：以 size 代理替代原始字节 sha256）⇒ `notes-stat #3 / #4 / #6` 恰 3 处判红（`通过 48 / 失败 3`、退出码 1）；回滚后 sha256 逐字还原（`4df02910bd6017f3918a9888814b57984e2b8a1770500c7628c1d05e4c814ec2`）并复跑 `51 / 0`。⇒ 新组对「指纹口径漂移」有真实判别力。
- b) `countNotesByDocument` 漏计 answer（`total` 只累加摘录）⇒ `badge-counts #1 / #4 / #5 / #6` 判红（`通过 31 / 失败 4`、退出码 1）；回滚后 sha256 逐字还原（`1767c11957521e437dfaa8ed1e73fc082e051bfeb986d2ef3bc4b3037450eeef`）并复跑 `35 / 0`。
- 两处回滚后复跑：`npm run check` = 0、`smoke-notes` 51/0、`smoke-view` 35/0；`git diff --stat` 与注入前逐字一致。

**9.【独立边界探针（%TEMP% 一次性脚本，已删除；自编译 `notes-store.ts` + `library-root.ts`，8 条全过）】** 无根 ⇒ `no-root` + 逐字文案；缺文件 ⇒ `exists:false` 成功统计且**不建目录 / 不建文件**；含 BOM 文件 ⇒ `hash = sha256(原始字节)`（不剥 BOM）、`size` 真实、`mtimeMs > 0`，且**调用前后 mtime 与文件字节逐字不变**（只读）；损坏内容 ⇒ 照常 `success:true` + 原始字节哈希；`notes.json` 为目录（EISDIR）⇒ `read-failed` + 逐字 `笔记文件读取失败` + 不抛错；删除后不重建；两次调用幂等且 `.pix-read` 条目集合不变 ⇒ `PROBE_OK`。

**10.【目视（`read` 工具逐张，8 张新图 + 既有场景 21 对照）】**

| 截图 | 结论 |
| --- | --- |
| `r14-1-tree-notes-badge.png` | sample 行 `3 条` 完整、字号小于行名、无背景 / 边框，位于行名与 `第 2 页` 胶囊之间不重叠；older 行呈「行名全名 + 数字 `1` + 被右端裁切的条」形态——无省略号、无空胶囊、无半截背景；`archive` / `reading-notes.md` / `long-book.pdf` 零标记 |
| `r14-1b-tree-badges-narrow.png` | 220px 下两行徽标整体让位（0 宽、无残留），行名随后按既有 ellipsis 截断（`older-p…` / `sample-pap…`）；`第 1024 页` / `第 2 页` 胶囊形态与位置与默认宽度一致、贴右内缘；无横向溢出 |
| `r14-2-tree-badge-workspace-b.png` | B 侧左栏 pill 为 `笔记`（无计数）、`共 0 条`、空态 `还没有摘录`、报告按钮禁用；无 A 侧残留 |
| `r14-3-stale-row.png` | 提示行位于头部之下、笔记列表之上；盒模型与撤销行同款；文案完整可读 + `刷新`（图标 + 文本）在行右；列表 5 行且外部新增正文可见；未遮罩、未挤出既有行 |
| `r14-3b-refresh-keeps-draft.png` | 提示行消失；`n-current-1` 编辑框仍在、草稿 `刷新不应丢弃这段草稿` 完整可见、`保存 / 取消` 未被挤掉；列表 6 行、三组计数 `共 2 / 1 / 3 条` |
| `r14-3c-refresh-list-synced.png` | **与 3b 字节相同**（md5 `d5a2b382aa26fd7e2c5e56369eb784e5`，D7 登记项）：同一帧同时可见「草稿保留」与「列表同步 6 行」两项观察 |
| `r14-4-stat-failure-silent.png` | 失败注入态下提示行仍在、**无任何错误条**（`.notes-notice` 缺席）、列表行数不变；撤销行与提示行同屏且不遮挡 |
| `r14-5-group-jump.png` | 中间阅读区 `older-paper.pdf` + `第 1 / 2 页`；左栏首组 `older-paper.pdf`（带「当前文档」chip、`共 1 条`）→ `sample-paper.pdf`（`共 3 条`）；当前组头无可点暗示 |
| `21-tree-progress.png`（对照 R13 基线） | 改前：older 无徽标 + `第 1024 页`、sample 无徽标 + `第 3 页`；改后：older 插入压缩徽标 `1`、sample 插入 `4 条`（场景 21 运行时文件 5 条 ⇒ sample 4 / older 1）；行名 / 图标 / 进度胶囊位置逐像素一致（测量三相逐字相同） |

**11.【走查（命令级，审查步独立复跑）】**

| 判据 | 期望 | 实测 |
| --- | --- | --- |
| `notes-stat`（`pix/src`）/ `notesStat`（preload）/ `ReaderNotesStatResult`（types / main / renderer-store / preload） | 2 / 2 / 1 / 2 / 2 / 3 | **2 / 2 / 1 / 2 / 2 / 3** |
| `row-notes` / `摘录\|AI 结论`（LibraryPanel） | 2 / 1 | **2 / 1** |
| `countNotesByDocument` 命中 / 函数体内 `for (` / 文件总数 | 3 / 1 / 3 | **3 / 1 / 3** |
| `LibraryPanel` 内 `setInterval\|setTimeout` / 笔记 IPC 调用 / `pixApi.` | 0 / 0 / 仅 2 处 `libraryList` | **0 / 0 / 两处 `libraryList`（`:86` / `:116`）** |
| `margin-left: auto` = 1；`.row-progress` 不作为 `+`/`-` 行 | 是 | **1；无输出** |
| `addEventListener("focus")` / `removeEventListener("focus")` | 1 / 1 | **1 / 1** |
| `syncNotesFile("capture")` / `checkNotesFile`（面板）/ `notesFileSeq` / `setInterval` | 3 / 1 / ≥3 / 0 | **3 / 1 / 4 / 0** |
| `open-note-doc` = 3；面板内 `open-document` / `onOpenNoteDoc` = 0；`WorkspacePage` 内 `onOpenNoteDoc` = 2；`selectedFilePath.value = ` = 2 | 是 | **3 / 0 / 0 / 2 / 2** |
| `is-openable` = 3；`notes-stale` = 2；`:title` 绑定仍为 `group.docPath`；既有子结构无 `-` 行 | 是 | **3 / 2 / 是（`-` 行仅 vue import 行与组头行 2 处，属设计 §2.2 第 4/5 行登记）** |
| 文案唯一：两段提示文案 / `main` 内 `externalChange\|notes-stale` / 渲染层 `.pix-read` | 1 / 1 / 0 / 2 | **1 / 1 / 0 / 2** |
| `editingCommentId.value = ` / `applyNotes(` / `console.` | 3 / 5 / 0 | **3 / 5 / 0** |
| `SEL` 项数（HEAD → 工作树）/ 删除 / 新增 | 54 → 60 / 0 / 6 | **54 → 60 / 0 / 恰 6 项且既有顺序逐字保留** |
| 三面方法清单（`PixApi` / `api` / stub） | 42 / 42 / 42 且逐字相等 | **42 / 42 / 42，三者逐字相等，`notesStat` 均位于索引 29** |
| `ReaderNotesErrorCode` 键数 / `ipcMain.handle("notes-` | 11 / 9 | **11 / 9** |
| 范围外面（`packages/**` / `package-lock.json` / `pix/package.json` / `tsconfig*` / `vite.config.ts` / `variables.css`）与 §2.3 清单文件 | 零 diff | **零 diff**（含 `smoke-*` 的 `-` 行 0 / 0） |
| `ui-shot.mjs` 删除行 | 仅 stub 5 行 + 登记修复 1 行 | **恰 6 行**（`NOTES_FILE`→`currentNotesFile` 5 行 + 场景 24 选择器 1 行） |
| `LibraryPanel.vue` 删除行 / `NotesPanel.vue` 删除行 | 各 1 / 各 2（登记） | **1（`v-for` 数据源）/ 2（vue import、组头行）** |

### 二、验收逐条结论（N87–N90，对照需求档含定稿修订）

| 条目 | 结论 | 证据 |
| --- | --- | --- |
| N87-1 徽标 DOM / 逐字文案 / 渲染条件 | 通过 | `r14-1` ①–④ 逐字（见 §7 表）；走查 2 / 1 |
| N87-2 计数口径与唯一派生（单次遍历 + memo） | 通过 | `badge-counts` 6 条全绿（期望值手写）；走查 3 / 1 / 3 + `computed(` + 模板只读 `row.badge`；`live` ⑨ 过滤态口径 |
| N87-3 更新时机与作用域 | 通过 | `live` 删除 / 撤销联动（含行数真实变化）；`refresh-draft` ⑬ 刷新后徽标同步；`b-workspace` 0 徽标 + `back-to-a` 恢复；走查树不调笔记 IPC = 0 |
| N87-4 与进度徽标并存 / 窄栏不溢出 | 通过 | `badges` ④⑤（贴右缘 `261 = 267 − 6`、不重叠、让位判据）；`narrow` ⑩–⑯（220 生效、不溢出、progress 不变、徽标 0 宽让位、复原 268 与默认读数）；既有场景 21 `overflowFree` 绿（label 96/96 与 R13 逐字同） |
| N87-5 无笔记行与懒加载零变化 | 通过 | `badges` ③（三行 `notesCount 0` 且 `progressCount 0`）；目录行无徽标而子行有；`toggle` 等零 diff；既有 21b（trim）三相与 R13 逐字同 |
| N87-6 数据面纪律 | 通过 | 唯一新通道 = `notes-stat`（handler 9 = 8 既有 + 1）；树内无定时器 / 无笔记 IPC；`check` 0 |
| N88-1 新 IPC 四面同步 | 通过 | 三面 42/42/42 逐字相等；`notes-stat` 2 处；类型计数 1/2/2/3；`ReaderNotesErrorCode` 11；`statNotesFile` 只读（探针 + 函数体 grep 0）；`r14-3/detect` `statDelta 1` 且 `hashSame true` |
| N88-2 检测时机 / 基线 / 竞态 | 通过 | `enter-fresh` 不误报；`detect` 焦点置位；`write-rebaseline` 写后清位；走查捕获 3 / 比对入口 1 / 焦点 1+1 / `notesFileSeq 4`；`stat-failure-silent` 两注入 |
| N88-3 提示行与刷新按钮（逐字 / 非阻塞） | 通过 | 文案 / title 逐字；提示期间可交互（`已选 1 条`）；4.5s 不消失；文案唯一 1/1；`notes-stale` 2 处；`variables.css` 零 diff |
| N88-4 刷新语义与草稿冲突 | 通过 | 刷新后行 6 = 文件 6、提示消失；草稿逐字保留 + 编辑框未关；只读（`loadDelta 1`、写 0、`hashSame`）；续段外部删除四条规则逐条满足 |
| N88-5 失败路径 | 通过 | `stat-failure-silent` ⑤⑥⑦；烟测 #1/#2/#7；失败分支只 `return`、`console.` 0 |
| N88-6 写操作成功后重新对标 | 通过 | `write-rebaseline`；`inflight-guard` `loadDelta 1`；`applyNotes(` 5、capture 3；无 `setInterval` |
| N88-7 零副作用与跨工作区 | 通过 | 检测 / 刷新 `hashSame`；B 工作区无提示；渲染层不拼存储路径（`.pix-read` = 2 与 R13 同） |
| N89-1 点击语义与门控 | 通过 | `current-noop` ①②；`jump-other-doc` ③；走查 `is-openable` 3、`:title` 绑定保留 |
| N89-2 复用既有跨文档跳转通道 | 通过 | `jump-other-doc` ④⑤⑥（落到 `older-paper.pdf`、重排 + chip、笔记 IPC 零增量）；走查 `open-note-doc` 3、`onOpenNoteDoc` 2 |
| N89-3 边界与零外溢 | 通过 | `current-noop` 零副作用；面板侧 `onOpenNoteDoc` = 0；既有 `.notes-group-head` 相关 label 逐字未变 |
| N90-1 烟测-主进程 | 通过 | 51/0（44 + 7）；既有 44 条 `-` 行 0；期望值由烟测侧独立计算 |
| N90-2 烟测-渲染 | 通过 | 35/0（29 + 6）；编译面 `files` / `required` / `allowed` 零改动（仅新增句柄 + `require`）；期望值手写 |
| N90-3 离屏场景 | 通过 | 5 组 13 条 record 全绿（§7 复算）；8 张截图齐备（3b/3c 同帧，D7）；既有场景零改写除登记的 1 行（D2） |
| N90-4 基线与零缺失 | 通过 | 143 / 211 / 51、`missing []`、`failure null`；既有树行最有判别力场景 21 / 21b / 24 继续通过（§6 归一化比对） |
| N90-5 工程门与零残留 | 通过 | `check 0`；`package.json` / lockfile / `packages/**` / `variables.css` 零 diff；`git status` 白名单内；仓库零临时产物 |

### 三、must-fix 清单

**无阻塞性 must-fix（0 条）。** 以下 3 项为**已登记偏差、须负责人显式追认 / 确认**（非代码缺陷）：

1. **D2（须追认）** `ui-shot.mjs` 场景 24 的 1 行选择器修复（`textOf(".empty-title")` → `textOf(".reader-empty .empty-title")`）。审查步独立复核：`WorkspacePage.vue:290-291` 的 NotesPanel 为 `v-show` 常驻 DOM，B 侧笔记根随 `activeRoot` 后 B 面板进入空态（`.notes-empty .empty-title` = `还没有摘录`）且位于阅读区空态之前 ⇒ 原选择器必读错；修复后断言文本与失败条件逐字不变（强度不变）。该行属对既有场景函数体的改写，与 R14-req §5 反需求 #12「不改写既有离屏场景」字面冲突 ⇒ 需负责人追认（备选：撤销 stub 笔记根改造并接受 `r14-2` 断言不可判定，不建议）。
2. **D3（须确认）** `.row-notes { flex-shrink: 10000 }`（设计档字面 1000）。依 R14-req §0.9 硬约束的逃生条款「若徽标反而挤动了 `.row-label`，则必须继续收窄徽标盒模型（文案逐字不变）并在 dev 档登记实测读数」。**审查步独立实验（临时把 `flex-shrink` 还原为 1000 全量重跑，随后回滚还原）**：1000 下整套 143 张 / 13 条 record **仍全绿**（`overflowFree` 与让位判据都是整数口径：older 行 `labelClientWidth 96 = labelScrollWidth 96`），但 `21-tree-progress.png` 的 older 行行名**目视出现省略号**（`older-paper.p…`）；同一位置在交付态（10000）为全名 `older-paper.pdf`。即：1000 的亚像素挤压（label 份额 8.8×96/18896 ≈ 0.044px，高于 1/64px 布局分辨率）造成真实可见的既有元素位移，而既有整数断言**捕获不到**；10000 把份额压到 0（实测全绿且目视完整）⇒ 收窄符合 §0.9 授权与「既有元素零位移」硬约束。建议负责人确认（若要求严格逐字回到 1000，需要同时补一条能捕获亚像素挤压的判据，否则既有场景 21 的可见回归会静默通过）。
3. **D7（须确认）** `r14-3b` / `r14-3c` 两张截图字节相同（md5 `d5a2b382aa26fd7e2c5e56369eb784e5`）。原因为设计档把两次 `capturePage` 排在同一时刻、其间无状态变化；同帧已同时覆盖「草稿保留」与「列表同步 6 行」两项观察项，配额（8 张 / 13 条 record / 5 种 label）不变。如需两帧不同形态，须改设计档取证步骤（超出本轮）。

其余登记项（D1 范围、D4 helper 改名、D5 设计档自相矛盾、D6 提示行折行不可达、U1–U6）见 dev 档 §B7，审查步已逐条核对，无追加异议。

### 四、次级项（登记，不阻塞）

1. **D3 对照实验（审查步独立，含一次既有 flake 复现）**：为核实 D3（`flex-shrink` 1000 → 10000）的必要性，审查步临时还原 1000 全量重跑（产物 `C:/Users/86157/AppData/Local/Temp/pix-v05-r14-mutshrink`）。第一次运行在 `r11-3` 相位 4「摘录浮层」等待超时（与 dev 档 U6 / §B2 记录同点；该 flake 在只改主进程 / preload、无渲染层改动的 dev 基线运行中亦出现 ⇒ 与本轮渲染层改动无因果关系）；重跑完成：退出码 0、143 张、13 条 record 全绿。关键读数：`tree-progress` 三相与交付态逐字相同（older `96/96`）、`r14-tree-badge` 让位判据全绿——**但** `21-tree-progress.png` 的 older 行行名目视出现省略号（`older-paper.p…`），交付态（10000）为全名。结论：既有整数断言无法捕获亚像素挤压，D3 的收窄是必要且被 §0.9 授权；实验后已回滚（`flex-shrink: 10000`，无探针残留，`check` = 0）。
2. **提示行折行（D6）**：268px 左栏下 22 字文案折为 2 行（见 `r14-3-stale-row.png`）。设计档 §8 的「一行可读不折行」在该宽度下不可达（文案 + 按钮宽度超过可用宽），dev 档已登记为非缺陷；建议负责人在下一次改版时决定是否收窄文案或加宽左栏。
3. **`r14-3/detect` 的 DOM 顺序判据为相对式**：notice / undo 缺席时不判（设计档次级风险 6 已登记）；本相位实测 `order.names = [notes-header, notes-stale, notes-list]`，「stale 紧随 header」为强断言，可接受。
4. **`statNotesFile` 的 read→stat 两步**在理论上有微小 TOCTOU 窗口（`size` / `mtimeMs` 与 `hash` 可能来自不同瞬间）；判定式只认 `hash`，`size` / `mtimeMs` 为观测字段，无判据影响（设计档 §1.2 参考实现即此形状）。
5. **未覆盖项**：真实窗口激活路径（切出 → 外部改文件 → 切回）仍只有合成 `window` focus 事件的离屏覆盖（设计档 §1.5 纪律 3 / dev 档 U5）；建议在人工验收时补一次真实走查。

### 负责人追认（R14）

> 追认对象：上节「三、must-fix 清单」列出的 3 项「非阻塞·待追认」偏差（D2 / D3 / D7）。追认方式：负责人逐项复核后**书面追认**（迭代负责人，2026-09-17）；本轮只写文档、不改代码，以下裁决与理由逐字登记，不得改写。

1. **D2（追认）** `ui-shot` 场景 24 的 1 行选择器修复（`textOf(".empty-title")` → `textOf(".reader-empty .empty-title")`）⇒ **追认**。理由：`NotesPanel` 以 `v-show` 常驻 DOM，原选择器会抢先读到 B 侧空态文案，属既有场景在新 DOM 事实下的必要修复；断言文本与失败条件逐字未变。处置：修复保留落地；最终处置登记于 `docs/pm/R14-dev.md` §B7.1 偏差表（未决项 U2 据此关闭）。
2. **D3（追认）** `.row-notes` 的 `flex-shrink` 由设计档 1000 提高为 **10000** ⇒ **追认**。理由：审查步已用受控实验证明 1000 会让既有 `21-tree-progress` 场景的行名出现省略号而整数判据捕获不到，10000 下行名零位移且全套断言绿；该收窄属 `R14-req` §0.9 授权范围。处置：`flex-shrink` 终值维持 **10000**（不回退 1000）；最终处置登记于 `docs/pm/R14-dev.md` §B7.1 偏差表（未决项 U3 据此关闭）。
3. **D7（追认）** `r14-3b` / `r14-3c` 两张截图字节相同 ⇒ **追认**，并把「两次 `capturePage` 排在同一时刻」登记为设计档取证步骤的偏差（配额与语义覆盖不变）。处置：本条即设计档取证步骤（§5.4.6）偏差在本轮的登记；配额（8 张 / 13 条 record / 5 种 label）与同帧语义覆盖不变，本轮不改设计档。

> 其余登记项（D1 / D4 / D5 / D6 与 U1–U6）无追加异议；R14 验收结论维持 **accept**。
