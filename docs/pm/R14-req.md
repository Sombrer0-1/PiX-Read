# PiX-Read R14 需求档 · 资产贯通（N87–N90）

> 上游：`docs/pm/PRD-V0.5.md` §1 断层 3（资产在各面上不一致 ——「看不见，也信不过」：资料库树知道阅读进度，却不知道哪篇有笔记；笔记面板知道文件内容，却不知道文件在外部被改过。资产必须在每个面上都有可见、可信的表达；「唯一事实源」不仅要写进文档，还要在界面上兑现）、§2（R14 = 资产贯通：资料库树的笔记徽标、笔记文件外部改动感知、阅读器侧章节笔记入口；依赖 R6、R9、R10 —— **范围收窄登记**：负责人本轮冻结主线为「树上可见 + 外部改动感知」，第三项「阅读器侧章节笔记入口」未纳入本轮，本档不为其写需求、不为其留配额；若后续恢复，须另立需求编号）、§3（资产分层：`.pix-read/notes.json` = 用户资产 / 唯一事实源，损坏时**报错、绝不覆盖、用户显式决策**；`notes.md` 与 `reports/**` = 产物；`reader-state.json` = 易失状态）、§4（版本级反需求：不引入新运行时依赖、不改 `packages/*`、不改 `notes.json` 格式与写入协议、不做向后兼容层、不写未被调用的死代码）、§5（工程红线：§5.1 唯一工程门 `npm run check`；§5.2 禁 `any` 与内联动态 import；§5.3 UI 文案中文、Vuetify 照抄仓库既有写法；§5.5 主进程新增 IPC 必须有入参校验与中文错误、渲染层不得自行拼接存储路径；§5.6 写盘只落 `.pix-read/`、原子写、损坏不覆盖；§5.7 取证纪律与冻结字面显式登记；§5.8 依赖与 lockfile 零改动；§5.9 离屏脚本是唯一 UI 基线、stub 面必须与 preload 面一致；§5.10 无临时产物）、§7.4（成功判据 4：资料库树能看出哪篇文档有笔记、有多少条；笔记文件被外部修改后面板给出非阻塞提示且不静默覆盖；面板计数与文件始终一致）。
> 依赖：`docs/pm/R10-req.md` §0（面板既有类名 / 文案 / 撤销行 / `.notes-notice` 语义）、`docs/pm/R11-req.md`（在途归属守卫与 `stale` 零副作用范式、`.pix-read` 唯一写者纪律）、`docs/pm/R12-req.md` §0（取证脚本契约、`SEL` 与场景/截图/label 零删除）、`docs/pm/R13-req.md` §0（`.notes-report-*` 字面、`reportScope` 归属守卫、stub 与主进程逐字镜像纪律）、`docs/pm/R13-design.md` §1.1（**新 IPC 四面同步写法**：`shared/types.ts` 类型 → `main/ipc-handlers.ts` handler → `main/preload.ts` 接口与实现 → `ui-shot.mjs` stub 面，四处同增）、`docs/pm/R13-dev.md`（R13 交付终态与基线读数 135 / 198 / 46）。
> 本轮唯一主线（负责人已冻结，不得扩张）：**让笔记资产在资料库与面板上可见、可信** —— 树上能看出哪篇文档有笔记、有多少条（含摘录 / AI 结论分列）；笔记文件被外部改动时面板给出非阻塞提示与显式刷新（绝不静默覆盖、绝不自动丢弃正在编辑的备注草稿）。
> 范围约束：不做自动同步 / 自动刷新、不做文件监听守护进程、不做跨工作区聚合、不做笔记云同步、不改 `notes.json`、不引入依赖、不做树内编辑。需求编号 **N87–N90**，共 **21** 个子条。

**判定工具（本档所有验收只能由这五种证据判定，逐条已标注）**

| 记号 | 含义 |
| --- | --- |
| 【走查】 | 只读代码与 `git status` / `git diff` / `git show`（只读可用）；含 `grep -c` / `grep -rn` 计数类判据 |
| 【check】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error（唯一工程门） |
| 【烟测-渲染】 | 纯函数离线烟测 `pix/scripts/smoke-view.mjs`（本轮由 4 组 29 条 **扩到 5 组 35 条**，见 N90-2） |
| 【烟测-主进程】 | 数据面烟测 `pix/scripts/smoke-notes.mjs`（本轮由 7 组 44 条 **扩到 8 组 51 条**，见 N90-1） |
| 【离屏】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<临时目录> ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + 既有截图/测量零缺失 + 新增断言组全绿 + 新增截图齐备 |

**本档事实基线（写档当天核对过的真实结果，供后续角色复核）**

| 事实 | 证据 |
| --- | --- |
| 工作树干净、分支 `main`、HEAD = `20dd452`（R13 已提交交付） | `git status --short` ⇒ 空（本档落盘前）；`git log --oneline -1` ⇒ `20dd452 feat(notes): 每篇文档的结构化阅读报告导出（章节分组、两类笔记与阅读进度）（V0.5 R13）` |
| 唯一工程门当前 0 error | 2026-09-16 实跑 `cd pix && npm run check` ⇒ `CHECK_EXIT=0` |
| R14 的零缺失比对基线（R13 交付产物） | 目录 `C:/Users/86157/AppData/Local/Temp/pix-v05-r13-review/shots`：一级 **137** 项 = **135** png + `MANIFEST.json` + `MEASUREMENTS.json`（无清单外 png）；`MANIFEST.json` ⇒ `shots.length = 135`、`failure = null`；`MEASUREMENTS.json` ⇒ 长度 **198**、`label` 去重 **46** 种（含 R13 五组：`r13-report-entry:3` / `r13-report-content:3` / `r13-report-fallback:2` / `r13-report-degrade:2` / `r13-report-failure:3`）；`r14` 前缀 label 当前 **0** 命中 |
| 资料库树现状（`pix/src/renderer/components/workspace/LibraryPanel.vue`，277 行） | `rows`（`computed`，`flattenVisible` 单次遍历）；`progressMap`（`computed`：单次遍历 rows，按 `.pdf` 过滤 + `readerStateStore.progressPageFor`）；模板 `.tree-row` 内顺序 = 折叠箭头/占位 → `.row-icon` → `.row-label` → `.row-progress`（`v-if="progressMap.has(row.node.path)"`，文本 `第 {{ progressMap.get(row.node.path) }} 页`）；`.row-progress` CSS：`min-width: 46px; flex-shrink: 0; margin-left: auto; padding: 1px 6px; border-radius: 999px; background: var(--pix-bg-active, #dfeaf4); font-size: 11px; white-space: nowrap`；`.row-label`：`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`（无 flex 属性）；懒加载展开逻辑在 `toggle(node)`（目录首次展开才拉子节点） |
| 渲染层笔记 store（`pix/src/renderer/stores/notes-store.ts`，483 行） | 列表唯一写入口 = `applyNotes(next)`（`notes.value = next; writeSeq += 1;`，并按需把状态推回 `ready`），被 `addNote` / `runMutation`（update、delete 除外的写路径）/ `removeNote` / `undoDelete` 调用；`loadNotes()` 成功分支直接写 `notes.value = result.notes`；`recoverCorruptNotes()` 成功分支直接写 `notes.value`；作用域令牌 `loadSeq` / `writeSeq` / `undoScope` / `reportScope`（`resetNotes()` 内各自 `+= 1`）；`watch(currentDocKey)` 清 `chapterFilter` / `lastReport`；`externalChange` / `checkNotesFile` / `countNotesByDocument` 当前 **0** 命中 |
| 主进程笔记存储（`pix/src/main/notes-store.ts`，551 行） | `notesPaths(): { file, markdown, reports } \| null`；`readNotesFile`（ENOENT ⇒ 空库；损坏 ⇒ `corrupt`）、`serializeNotes`（`JSON.stringify(file, null, 2) + "\n"`）、`writeFileAtomic`、`ERROR_MESSAGES` **11** 键、`isEnoent`、`docPathKey`、`normalizeNoteText`、`isStoredDocPath`、`toRelativeDocPath`；import 现为 `randomUUID`（node:crypto）+ `existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync`（node:fs）—— `createHash` / `statSync` **未** import |
| 主进程 IPC 面（`pix/src/main/ipc-handlers.ts`） | 笔记 8 通道：`notes-load`（`:513`）/ `notes-add`（`:515`）/ `notes-update`（`:517`）/ `notes-delete`（`:521`）/ `notes-restore`（`:523`）/ `notes-export`（`:525`）/ `notes-reset`（`:527`）/ `notes-export-report`（`:529-531`）；无入参通道先例：`notes-load` / `notes-export` / `notes-reset` / `reader-state-load`；`notes-stat` 当前 **0** 命中 |
| preload 面（`pix/src/main/preload.ts`） | `PixApi` 接口与 `api` 实现各 **41** 方法（R13 后）；笔记方法 8 个（接口 `:69-76`、实现 `:157-165`）；`notesStat` 当前 **0** 命中 |
| 共享类型（`pix/src/shared/types.ts`） | `ReaderNotesLoadResult`（`:383`）/ `ReaderNotesMutationResult`（`:392`）/ `ReaderNotesExportResult`（`:401`）/ `ReaderNotesReportChapter\|Input\|Result`（`:410`/`:418`/`:425`）/ `ReaderNotesResetResult`（`:435`）；`ReaderNotesErrorCode` 恰 **11** 键；`ReaderNotesStatResult` 当前 **0** 命中 |
| 笔记面板（`pix/src/renderer/components/workspace/NotesPanel.vue`，1468 行） | 反馈行 DOM 顺序：`.notes-notice`（`:536`）→ `.notes-undo`（`:543`）→ `.notes-export-row`（`:552`）→ `.notes-report-row`（`:565`）→ `.notes-loading` → 错误态 / 空态 / 列表；列表分组头 `.notes-group-head`（`:621`，`:title="group.docPath"`）内 `.group-titles`（`:620`）含 `.group-name` / `.group-path`，另有「当前文档」chip 与 `.group-count`；`defineEmits` 只有 `open-note`；`onBeforeUnmount` 已有（清理 notice / undoRow / copy 三个定时器与删除确认监听），**没有** `onMounted`；`startCommentEdit` 语义 = `editingCommentId = note.id; commentDraft = note.comment`；`saveComment` 失败保留草稿与编辑态 |
| 工作区页（`pix/src/renderer/pages/WorkspacePage.vue`） | `rootDir`（`:46`）、`selectedFileName`（`:48`，中间 pill 的 `.pill-label`）、`selectLeftTab("notes")` 内 `void notesStore.loadNotes()`（`:202`，**打开笔记标签即重新读盘** = 既有行为）、`onOpenNote`（`:216`）、`@open-note` 绑定（`:290`）、ReaderPanel 的 `@open-document` 绑定（`:310`，既有的绝对路径跳转通道 = `openDocumentFromLibrary`）；`onMounted` 内 `notesStore.resetNotes(); await notesStore.loadNotes();`（`:98-99`） |
| 笔记路径工具（`pix/src/renderer/utils/notes-path.ts`） | `docPathKey`（`:18`）、`currentDocKey(filePath, root)`（`:23`，小写比较键）、`docDisplayName`、`absoluteDocPath`、`groupNotesByDocument`、`sortNotesForContext`；`countNotesByDocument` 当前 **0** 命中 |
| 离屏脚本（`pix/scripts/ui-shot.mjs`，8171 行） | 夹具根 `LIBRARY_DIR`（`:36`）/ `LIBRARY_B_DIR`（`:38`）；`SEL`（`:47-110`，R13 后 41 项）；stub 的笔记文件真读真写用常量 `NOTES_FILE = CONFIG.notesFilePath`（`:428`，**恒为工作区 A**）⇒ `readNotesFile`（`:481`）/ `writeNotesFile`（`:492`）/ `notesLoad`（`:865`，返回 `filePath: NOTES_FILE`）；`activeRoot`（`:668`，由 `startSession(dir)` 写）目前只影响 `stateFilePath()`（`:641`）；helper：`rowFinder`（`:2796`）、`rowProbe` / `rowByTitle` / `rowByLabel` / `overflowFree`（`:1560-1585`）、`narrowProbe`（`:5376`）、`notesHash`（`:2209`）= `sha256(readFileSync(NOTES_FILE))`、`enterCleanWorkspace`（`:3225`）、`openNotesPanel(rows)`（`:3238`）、`restoreStandardSeed`（`:3244`）、`enterMapWorkspace`（`:4214`）、`backToLibraryTab`（`:4228`）、`waitNotesTab`（`:4232`）、`enterNotesProbe(seed, rows)`（`:4933`）、`notesNotice()`（`:5078`）、`deleteRowByText`（`:5033`）、`clickEl`（`:6890`）、`waitSectionReady`（`:6955`）、`settleEmptyOutline`（`:6966`）；`triggerWindowFocus` 当前**不存在**；stub 控制口以 `contextBridge.exposeInMainWorld("__pixStub", …)` 暴露（含 `notesLoadCalls` / `setLoadDelay` / `setLoadFailure` / `notesReportCalls` / `libraryShowCalls`） |
| 离屏夹具内容 | A 树 **5** 行（`archive/` 目录默认展开 ⇒ `archive/older-paper.pdf`、`reading-notes.md`、`sample-paper.pdf`、`long-book.pdf`）；B 树 **1** 行（`sample-paper.pdf`，与 A 同字节）；标准种子 `seedNotes()` **4** 条 ⇒ `sample-paper.pdf` **3** 条（摘录 2 · AI 结论 1）、`archive/older-paper.pdf` **1** 条（摘录 1 · AI 结论 0）、其余文档 **0** 条；**既有场景 21 运行时文件是 5 条**（种子 4 + 场景 06/07 的摘录动作新增 `sample-paper.pdf` 第 1 页 1 条，R13 基线截图的面板 pill 亦为「笔记 5」）⇒ 树上读数为 `sample-paper.pdf` **4 条**（摘录 3 · AI 结论 1）、`archive/older-paper.pdf` **1 条**（评审非阻塞提示 ② 就地吸收） |
| 树行几何实测（R13 基线 `MEASUREMENTS.json` 的 `tree-progress` static 相位，本档复读） | 行 `clientWidth = 246`；行内边距 depth 0 = `8/6`、depth 1 = `22/6` ⇒ **内容宽 232 / 218**；`.row-label` 内容宽：`sample-paper.pdf` **109** / `archive/older-paper.pdf` **96** / `reading-notes.md` **111** / `archive` **44**；进度徽标实测宽 **47**（`第 3 页`）/ **66**（`第 1024 页`）；`rowScrollWidth == rowClientWidth`（不溢出）、`labelScrollWidth == labelClientWidth`（未截断）。插入 `.row-notes` 前的行内余量（实测反解，非估算）：`sample-paper.pdf` = `232 − (14 + 16 + 109 + 47 + 3×4)` = **34px**；`archive/older-paper.pdf` = `218 − (14 + 16 + 96 + 66 + 3×4)` = **14px** ⇒ 徽标自然宽 ≈18.8px、含新增 gap 需 ≈22.8px ⇒ 前者完整显示、后者须由徽标自己让位（N87-4、§0.3 的压缩行） |
| 命名预检（本轮全部为**新增**名字） | `pix/src` 内 `notes-stat` / `notesStat` / `row-notes` / `notes-stale` / `countNotesByDocument` / `externalChange` / `checkNotesFile` / `ReaderNotesStatResult` / `statNotesFile` / `onOpenNoteDoc` 各 **0** 命中；`open-document` 已有 3 处（ReaderPanel 事件 + WorkspacePage 绑定，**载荷 = 绝对路径**）⇒ 笔记面板的新事件名不得复用该名字（见 §0.7） |

---

## 0. 定稿修订（R14）

> 上游：`docs/pm/R14-review.md`「需求评审（R14）」的 must-fix 清单 MF-1…MF-10。
> 结论：**10 条全部接受、0 条拒绝**。其中 MF-1 评审给出两个候选口径，本档采用**选项 ①**（改冻结项：徽标可收缩、文案优先保留数字），**选项 ②（接受既有场景 21 的 label 截断并改写既有断言）登记为「须负责人显式裁决、本轮不采用」**（理由见 M1）。正文已按本节就地同步（每条给出「同步位置」）；本节是**定稿口径**：与正文冲突时以本节为准。
> 复核方式：本节全部结论来自真实文件实读（`grep` / `sed` 只读）、只读 `git` 命令（HEAD `20dd452`）与只读复读 R13 基线产物 `C:/Users/86157/AppData/Local/Temp/pix-v05-r13-review/shots/{MEASUREMENTS.json,21-tree-progress.png}`；**本轮不跑离屏取证与烟测**（留给设计 / 开发 / 审查步）。行号与计数一律以本次实读为准。
> 编号说明：本节是修订记录，不参与冻结契约编号；下文 §0.1–§0.9 与 §1–§8 的编号逐字不变。
> 附带修正（非 must-fix）：事实基线表与 N90-3 的 stub 契约表内两处未转义的 `|`（类型名 `ReaderNotesReportChapter\|Input\|Result` 与 `NOTES_ERRORS[code] \|\| code`）已改为 `\|`，修正表格列错位；语义逐字未变。
> 评审 §4 的五条非阻塞提示：①（徽标背景与 `--pix-bg-hover` 撞色）随 M1 把降级形态改成「无背景小字」而**自动失效**；②（事实表按 4 条推导既有场景读数失真）已在事实基线表与 §0.3 就地补齐；④（stub `activeRoot` 影响面）已在 N90-3 的 stub 契约表补一句；⑤（`smoke-notes` 新组 #1 的前置）已在 N90-1 的组表后补一段；③（真实窗口激活的人工走查）登记给开发档，不新增离屏判据。

### M1 树徽标与既有 `overflowFree` 的自相矛盾（评审 MF-1）—— 接受：选「徽标让位」，用实测读数替换估算

- 复核（实读）：
  - `LibraryPanel.vue:213-266`：`.tree-row { display:flex; align-items:center; gap:4px; padding:5px 6px }` + 行内 `paddingLeft = 8 + depth*14`；`.row-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap }`（无 flex 属性 ⇒ 默认 `flex-shrink:1`，`overflow:hidden` 使 `min-width:auto` 归 0 ⇒ **当前唯一的可收缩项**）；`.row-progress { min-width:46px; flex-shrink:0; margin-left:auto; padding:1px 6px; font-size:11px }`。
  - R13 基线实测（`MEASUREMENTS.json` 的 `tree-progress` static 相位，本次复读；并与 `21-tree-progress.png` 目视一致）：行 `clientWidth = 246`；`sample-paper.pdf`（depth 0 ⇒ 内容宽 232）label **109** / 进度 `第 3 页` **47** ⇒ 行内余量 **34px**；`archive/older-paper.pdf`（depth 1 ⇒ 内容宽 218）label **96** / 进度 `第 1024 页` **66** ⇒ 行内余量 **14px**（`14 = 218 − (14 占位 + 16 图标 + 96 label + 66 进度 + 3×4 gap)`）。
  - 徽标自然宽（同款字体度量，由实测 47 / 66 两支反解 11px 下的「数字 ≈ 0.575em、空格 ≈ 0.303em、CJK = 1em」⇒ 10px 下 条 = 10、数字 ≈ 5.75、空格 ≈ 3.03）：`{N} 条`（个位）= **≈18.8px**；插入后多消耗 1 个 gap ⇒ 需要 **≈22.8px**。
  - 判定：`sample-paper.pdf` 行放得下（34 ≥ 22.8）；`archive/older-paper.pdf` 行放不下（缺 **8.8px**）⇒ 评审「既有场景 21 必红」的判定**成立**，前提是**徽标不可收缩**（原 §0.3 的 `flex-shrink: 0`）。
- 处理（选项 ①：徽标让位，既有元素零位移）：
  1. §0.3 的盒模型改为「唯一可收缩项」：`.row-notes { flex-shrink: 1000; min-width: 0; overflow: hidden; white-space: nowrap; padding: 0; font-size: 10px; line-height: 1.4; color: var(--pix-text-secondary); }`；`.row-label` 与 `.row-progress` 的 flex 行为**逐字不变** ⇒ 既有 `overflowFree` 口径不变 ⇒ 既有场景 21 保持绿。
  2. 降级形态写死（**数字优先**）：缺口全部由徽标承担 ⇒ 徽标被压缩、文本按**右端硬裁切**（数字在最左 ⇒ 优先保留）；**不得**用 `text-overflow: ellipsis`（省略号会挤掉数字本身）、**不得**设背景 / 边框 / 水平内边距（任何水平内边距 `p` 都把压缩下限抬到 `2p`：`older` 行可用宽恰为 `余量 14 − gap 4 = 10px`，只有 `p = 0` 才能保证数字 ≈5.75px 完整可见）；压缩到 0 宽 ⇒ 整体不可见（**不得**留下空胶囊）。
  3. 数值推导（替换原估算）：`older` 行插入徽标后缺口 `= 18.8 + 4 − 14 = 8.8px` ≤ 徽标自身可收缩量 `18.8px` ⇒ 徽标承担全部缺口、落到 10px，**`.row-label` 与 `.row-progress` 几何零变化**。
  4. 未采用的候选（登记）：选项 ②（接受 `older` 行 label 省略号）会让既有场景 21 的 `overflowFree(older)` 变红，必须改写 `ui-shot.mjs` 的既有场景断言，与 §0.1 / N90-3 #2 的「既有场景零改写」冲突 ⇒ **须负责人显式裁决**；本轮无人值守、无裁决 ⇒ 不采用。若负责人后续改判 ②，需同时改 §0.9 硬约束、N87-1 / N87-4 判据与 `tree-progress` 的既有断言，并重跑基线。
- 影响面登记：`.row-notes` 的可见形态 = 「10px 次要色小字」而非胶囊；默认宽度下「长文件名 + 长页码」的行（既有场景 21 与 `r14-1` 的 `archive/older-paper.pdf` 行，余量 14px）为**压缩态**（可见宽 10px、数字完整、「条」被裁切）——`r14-1` 的 `badges` 相位断言该读数，既有场景 21 的截图由 dev 档在目视比对里登记。
- 同步位置：§0.2 第 1 条、§0.3、§0.8、§0.9、N87 总述、N87-1、N87-2 #7、N87-3 #2、N87-4、N87-5 #3、§7 R3、§8 开放问题 1、事实基线表（树行几何 / 夹具内容两行）。

### M2 `r14-4` 相位 `stat-failure-silent` 步骤与断言矛盾（评审 MF-2）—— 接受：先造置位态再注入失败

- 复核（实读）：`ui-shot.mjs:6890` 的 `clickEl` = `document.querySelector(sel).click()`（元素不存在即 `TypeError`）；前一相位 `write-rebaseline` 以「写操作成功重新对标」收尾 ⇒ 进入本相位时 `.notes-stale` 必然缺席，而原步骤前半段就点 `.stale-refresh` ⇒ 必抛错；同时原断言 ⑤ 要求「已置位时失败 ⇒ 提示仍在那」，但步骤里没有任何置位动作。
- 处理：相位步骤重排为「外部追加（夹具 `n-external-3`）+ `focus` **先造置位态** → 注入 `read-failed` / `"throw"` 各一次并复核提示仍在且无弹错 → 点 `.stale-refresh` 清位（置位态下该元素必然存在）→ 置位前注入失败 ⇒ 复核提示不出现」；截图点移到「失败注入且提示仍在」的状态。
- 同步位置：N88-2 #6、N88-5 #1、N90-3 的 `r14-4` 场景表。

### M3 N87-2 #5 的循环计数不可满足（评审 MF-3）—— 接受：改为函数体内计数

- 复核（实读）：`grep -c "for (" pix/src/renderer/utils/notes-path.ts` 现为 **2**（`:74` 与 `:98`，均在 `groupNotesByDocument` 内），新增 `countNotesByDocument` 的 1 个循环后文件总数 = **3**，不可能等于原判据写的 1。
- 处理：N87-2 #5 拆成两条并存的判据：① 函数体内恰 1 个循环（`sed -n '/countNotesByDocument/,/^}/p' pix/src/renderer/utils/notes-path.ts | grep -c "for ("` = **1**，函数体内无嵌套循环）；② 文件总数 = **3** = 既有 2 + 新增 1。
- 同步位置：N87-2 #5。

### M4 N89-3 #2 的判据写错文件（评审 MF-4）—— 接受：改为面板侧 0 次

- 复核（实读）：`onOpenNoteDoc` 是**新增**处理器，按 §0.7 只落在 `WorkspacePage.vue`（定义 1 + 模板绑定 1 = 2 处，与 N89-2 #4 一致）；`NotesPanel.vue` 侧只有事件名 `open-note-doc`（`defineEmits` 声明 1 + emit 调用 1）⇒ 面板侧 `onOpenNoteDoc` 应为 **0**。
- 处理：N89-3 #2 的该半句改为「`grep -c "onOpenNoteDoc" pix/src/renderer/components/workspace/NotesPanel.vue` = **0**（处理器只在 `WorkspacePage.vue`）；面板与处理器之间唯一接口 = 事件名 `open-note-doc`（`grep -rn "open-note-doc" pix/src | wc -l` = **3**，见 N89-2 #3）」。
- 同步位置：N89-3 #2。

### M5 N90-2 的改动清单缺 `notes-path` 的 `require`（评审 MF-5）—— 接受：白名单与判据同步

- 复核（实读）：`smoke-view.mjs` 的 `compileAndLoad()` 只 `require` 了 `renderer/utils/outline-notes.js` 与 `renderer/utils/reading-context.js`（`:465-466`）；`notes-path.js` 虽在 `files`（`:428`）与 `required`（`:446`）内 ⇒ 编译产物有它，但**没有模块句柄**，`countNotesByDocument` 无处可取；`files` / `required` / `allowed`（`:446-447`）确实零改动。
- 处理：§6 白名单第 11 条与 N90-2 判据 2 写入「模块句柄 `notesPath` + `require(join(OUT_DIR, "renderer", "utils", "notes-path.js"))`」，并把「只新增常量、断言与 `main()` 一行调用」改写为「只新增常量、夹具、断言、模块句柄/require 与 `main()` 一行调用」。
- 同步位置：N90-2 判据 2、§6 第 11 条。

### M6 徽标口径与面板 `.group-count` 的差异未写清（评审 MF-6）—— 接受：补口径行 + 补一条离屏断言

- 复核（实读）：徽标口径 = 渲染层 `notesStore.notes` 的**全量**条目按文档聚合（§0.2 第 2 / 3 条）；面板 `.group-count` = `group.notes.length`（`NotesPanel.vue:627`），而 `groups` = `applyViewToGroups(groupNotesByDocument(...))`（`notes-store.ts:142-145`）⇒ 搜索 / 章节过滤 / 「仅看当前文档」生效时是**过滤后**的可见条数 ⇒ 过滤态下两者**必然可以不等**（正确语义，不是缺陷）。
- 处理：§0.3 增「与面板计数的口径差异」行；N87-2 增判据 7（离屏，挂在 `r14-1` 相位 `live`，复用既有 helper `setSearch`（`ui-shot.mjs:4942`）与 `searchProbe`（`:4956`））：写入只命中 `archive/older-paper.pdf` 那条的搜索串（如 `Reproducibility`）⇒ `sample-paper.pdf` 分组的 `.group-count` 不再等于徽标文本，而该行 `.row-notes` 的 `textContent` 逐字不变；清空搜索后复原。
- 同步位置：§0.3、N87-2 #7、N90-3 的 `r14-1` 相位 `live`。

### M7 N87-4 #4 的 `git diff` 判据字面不可满足（评审 MF-7）—— 接受：改用 `-U0`

- 复核（实读）：`.row-notes` 的插入点紧贴 `.row-progress` 之前（§0.3 的 DOM 位次）⇒ 统一 diff 的上下文行必然包含 `.row-progress` 的模板行；`grep -c "margin-left: auto" pix/src/renderer/components/workspace/LibraryPanel.vue` 实测 = **1**（`:261`，仍只属于 `.row-progress`）。
- 处理：N87-4 #4 改为「以 `git diff -U0 pix/src/renderer/components/workspace/LibraryPanel.vue` 判定：`.row-progress` **不作为 `+` / `-` 行出现**（上下文行不得用于判定）」，保留 `grep -c "margin-left: auto"` = 1 的有效判据。
- 同步位置：N87-4 #4。

### M8 判据 / 夹具文字不一致（评审 MF-8）—— 接受：三处对齐

- 复核（实读）：(a) `NotesPanel.vue:28` 的 `NOTICE_MS = 4000`；(b) N90-3 目前只定义 `n-external-1` / `n-external-2` **两条**外部夹具，而「外部删除编辑中的那一条」没有 helper；(c) `ui-shot.mjs` 的 stub `api` 与 `preload.ts` 的 `PixApi` / `api` 现各 **41** 项（本次实读：接口 `:34-107` 41 项、实现 `:109-191` 41 项、stub `api` `:798-1100` 41 项）。
- 处理：(a) N88-3 #3 的「等待 ≥ 5s」统一为 **4500ms**（仍 > `NOTICE_MS`，对照意义不变，与 `r14-3` 的 `sleep(4500)` 逐字一致）；(b) N90-3 的夹具行补齐**第三条** `n-external-3`（供 `r14-4` 的 `stat-failure-silent` 造置位态）使「三条」成立，并新增 helper `removeExternalNote(id)`（Node 侧读-改-写 A 的 `notes.json`，用于「外部删除编辑中的那一条」），§6 第 12 条同步；(c) N88-1 #2 补可复跑判据：改后 `PixApi` / `api` / stub `api` 各 **42** 项且三处方法名清单逐字相等。
- 同步位置：N88-3 #3、N88-1 #2、N90-3 的 stub 契约表、§6 第 12 条。

### M9 刷新按钮的控件形态与样式表冲突（评审 MF-9）—— 接受：保留 `v-btn`、删除冲突覆盖

- 复核（实读）：`pix/node_modules/vuetify/lib/components/VBtn/VBtn.css:27-29`：`.v-btn--size-x-small { --v-btn-size: 0.625rem; --v-btn-height: 20px; font-size: var(--v-btn-size); min-width: 36px; padding: 0 8px; }` ⇒ 「`size="x-small"`」与「`padding: 1px 6px` + `font-size: 11px`」不可能同时成立；既有先例 = `.notes-export-row`（`NotesPanel.vue:552-559`）与 `.notes-report-row`（`:564-572`）的行内 `v-btn`，同为 `size="x-small"` + `variant="text"` + `prepend-icon`，**不覆盖** padding / font-size。
- 处理：§0.4 的「刷新按钮」行固定为 `v-btn` + `size="x-small"` + `variant="text"` + `prepend-icon="mdi-refresh"` + 文本 / title 逐字，**不写** padding / font-size 覆盖（度量按 Vuetify：`--v-btn-height: 20px`、`font-size: 0.625rem`）；「提示行样式」行删除 `.stale-refresh` 的追述（只保留容器 `.notes-stale` 与 `.stale-text` 的样式）；§0.9 的目视比对条目同步为「`.stale-refresh` 与导出 / 报告行的「在文件夹中显示」同高同字号」。
- 同步位置：§0.4 两行、§0.9 目视比对。

### M10 N87-5 #3 的 `libraryList` 次数无判据（评审 MF-10）—— 接受：删除该半句、改为零 diff 推导

- 复核（实读）：`ui-shot.mjs` 的 `__pixStub` 控制口（`:1101-1170`）含 `notesLoadCalls` / `notesAddCalls` / `notesRestoreCalls` / `notesReportCalls` / `libraryShowCalls` / `readerStateSaveCalls` / `sendCalls` 等，**不含**任何 `libraryList` 计数口 ⇒ 原判据不可判定。
- 处理（取评审给出的第二选项：不新增控制口、不改 stub 契约）：N87-5 #3 删除「首次展开目录仍只有一次 `libraryList` 调用」半句，改为「`toggle` / `flattenVisible` / `reload` / `iconFor` / `chevronFor` / `isSelected` 零 diff ⇒ 懒加载的调用次数与 R13 逐字一致（由零 diff 推导）」。
- 同步位置：N87-5 #3。

---

## 0. 冻结契约（设计档、开发档、评审档均不得改写）

### 0.1 本轮不得改写的既有冻结项

| 来源 | 冻结内容 | 本轮为什么不得动 |
| --- | --- | --- |
| R6 / R9 | 树行既有类名与结构：`.tree-row` / `.row-chevron` / `.row-chevron-spacer` / `.row-icon` / `.row-label` / `.row-progress`，以及 `.row-progress` 的文案 `第 {N} 页` 与全部 CSS（含 `min-width: 46px` / `flex-shrink: 0` / `margin-left: auto`）；懒加载展开（`toggle`）与 `flattenVisible` 的语义 | 树行是本轮唯一改动的既有面；进度徽标是 R6/R9 基线与断言的一部分（场景 21 / 21b / 24），改动会连带作废既有截图与读数 |
| R6 | `reader-state.json` 的读写语义、`readerStateStore.progressPageFor` 的派生、`loader` 徽标与 `requestRestoreFor` | 笔记徽标是**并列新增**的第二枚徽标，不得借用、改写或替换进度徽标的来源 |
| R8 / R9 / R10 | 笔记面板全部既有类名与文案：`.notes-header(-top)` / `.notes-count` / `.notes-export-btn`（`导出 Markdown` / `暂无笔记`）/ `.notes-search*` / `.notes-sort*` / `.notes-filter` / `.notes-chapter-filter*` / `.notes-selection-bar` / `.notes-notice` / `.notes-undo` + `.undo-text` / `.notes-export-row` + `.export-text`（`已导出 {N} 条 → .pix-read/notes.md`）/ `.notes-loading` / `.notes-error` / `.notes-empty` / `.notes-group*` / `.note-*`、分组头 `:title="group.docPath"`、`startCommentEdit` / `saveComment` 的编辑态语义、选择集 / 搜索 / 排序 / 章节过滤 | 新增的提示行与组头点击必须**绕开**这些字面：不改文案、不改 DOM 结构与顺序（只允许在既有块之间插入新块）、不动编辑态语义 |
| R13 | `.notes-report-actions` / `.notes-report-btn` / `.notes-report-row` + `.report-text` / `.report-reveal` 的字面与位置；报告通道 `notes-export-report`、模板、`empty` / `write-failed` 专有文案 | 报告的入口行、状态行是本轮提示行的**邻居**；顺序与样式不得被挤动 |
| R10 / R11 | `notes-load` / `notes-add` / `notes-update` / `notes-delete` / `notes-restore` / `notes-export` / `notes-reset` 七通道与 `ReaderNotesLoadResult` / `ReaderNotesMutationResult` / `ReaderNotesExportResult` / `ReaderNotesResetResult` 形状；错误码表 `ReaderNotesErrorCode` 既有 **11** 键；`.pix-read` 的唯一写者纪律（写盘全在 `src/main`）；`undoScope` / `reportScope` / `stale` 范式 | 外部改动检测是**新增**通道（`notes-stat`，只读），不是对既有读取通道的改造：`notes-load` 的形状一律不动 |
| 全局 | 既有类名 `.notes-*` / `.pdf-*` / `.map-*` / `.tree-*` / `.reader-section*` / `.page-label` / `.zoom-label` 与既有中文文案；`--pix-*` 变量表（不新增变量） | 取证断言建立在既有字面上；新样式只允许复用既有变量与既有盒模型 |
| R12 / R13 | 取证脚本契约：`ui-shot.mjs` 启动守卫（`PIX_SHOT_ROOT` 必须在系统临时目录内）、产物自净（只删 `<OUT_ROOT>/shots`）、结束自检（截图集合与清单双向相等 + 白名单外条目即失败）、`SEL` 与既有场景 / 截图 / label **零删除零改写**；章节唯一派生 `buildChapterRanges`；报告模板与 `reports/**` 语义 | 本轮只**追加**场景、断言与截图；既有 135 张截图、198 条测量、46 种 label 零缺失 |

### 0.2 本轮新增冻结项（设计档、开发档、评审档均不得改写）

| # | 项 | 冻结内容 |
| --- | --- | --- |
| 1 | 树徽标（N87） | §0.3 全表：`.row-notes` 的 DOM 位次（`.row-label` 之后、`.row-progress` 之前）、文本 `{N} 条`、title `摘录 {A} 条 · AI 结论 {B} 条`、只对「有笔记的文档行」渲染、计数口径 = `notes.json` 全量条目按文档聚合的 `total`（= 摘录 + AI 结论）、盒模型（**行内唯一可收缩项**：`flex-shrink: 1000; min-width: 0; overflow: hidden; white-space: nowrap; padding: 0; font-size: 10px; color: var(--pix-text-secondary)` —— 无背景 / 无边框 / 无水平内边距）、压缩降级形态（空间不足即右端硬裁切、数字优先，见 §0.3），且 **`.row-label` 与 `.row-progress` 零改动** |
| 2 | 计数派生 | `pix/src/renderer/utils/notes-path.ts` 新增唯一纯函数 `countNotesByDocument(notes: ReaderNote[]): Map<string, NotesBadgeCount>`：键 = `docPathKey(note.docPath)`、**单次遍历**、只产出 `total > 0` 的文档、每次调用返回新 `Map`；`NotesBadgeCount = { total: number; excerpt: number; answer: number }` |
| 3 | 数据来源与更新时机 | 徽标只读渲染层 `notesStore.notes`（与笔记面板同一份事实）；更新时机 = 列表变化（增 / 删 / 改 / 撤销 / 读盘 / 刷新 / 切工作区）；**不得为此新增任何主进程 IPC**、不读盘、不写盘、不做轮询 |
| 4 | 新 IPC（N88） | 通道 `notes-stat`；preload 方法 `notesStat`；返回 `ReaderNotesStatResult`（§0.5）；handler 无入参（守卫不适用）；主进程实现 `statNotesFile()`；**只读**——不解析内容、不建目录/文件、不改 mtime、永不抛错 |
| 5 | 检测语义 | 渲染层以「指纹基线」+「指纹比对」判定：基线只在 ① `loadNotes()` 成功 ② `applyNotes()`（写操作成功）③ `recoverCorruptNotes()` 成功 时**捕获**（capture），比对只由 ④ 窗口获得焦点时触发（compare）；`resetNotes()` 作废基线并清标记；**检测失败（`success === false` 或 IPC reject）保持现状**：不置位、不清除、不弹错、不写日志 |
| 6 | 提示行与刷新（N88） | §0.4 全表：`.notes-stale` / `.stale-text` 逐字 `笔记文件已被外部修改，面板内容可能过期` / `.stale-refresh` 文本逐字 `刷新` + title 逐字 `重新读取笔记文件`；渲染条件 = `externalChange === true`；非阻塞（无遮罩、无弹窗、不自动消失）；刷新 = 调既有 `loadNotes()`（重新读盘；成功即清标记） |
| 7 | 刷新与草稿 | §0.6 的四条规则（检测与刷新都不得触碰 `editingCommentId` / `commentDraft`；不自动保存、不自动清空、不自动关闭编辑框） |
| 8 | 组头跳转（N89） | §0.7：`.notes-group-head` 加 `is-openable` 类与点击处理器（DOM 结构与 title 零变化）；emit 名 **`open-note-doc`**（载荷 = 工作区相对 `docPath`，**不得**复用既有的 `open-document`，后者载荷是绝对路径）；WorkspacePage 处理器名 `onOpenNoteDoc` |
| 9 | 反需求与配额 | §5 反需求全表；新增配额 = 离屏 **5 场景 / 5 组 / 13 条 record / 8 张截图**、烟测-主进程 **+1 组 7 条**、烟测-渲染 **+1 组 6 条**（§0.9） |

### 0.3 树徽标（逐字冻结）

| 项 | 逐字值 |
| --- | --- |
| 触发面 | 资料库树（`LibraryPanel.vue`）的 `.tree-row`，仅 `row.node.type === "file"` |
| 渲染条件 | 该行的工作区相对路径经 `currentDocKey(node.path, rootDir)` 得到的键在计数 Map 中命中（`total > 0`）；**只显示 > 0**，0 笔记行不渲染任何新节点 |
| 不渲染的行 | 目录行（`.pix-read` 等点开头条目树里本就不列出；目录**不聚合**子项计数）、0 笔记的文档行（`reading-notes.md` / `long-book.pdf` 在标准种子下无徽标） |
| DOM 位次 | `.row-label` **之后**、`.row-progress` **之前**（`.row-progress` 的 `margin-left: auto` 保持独占，仍贴行右缘） |
| 类名 | `.row-notes`（`<span>`） |
| 文本 | `{{ total }} 条`（例：`3 条`；数字与「条」之间恰一个半角空格；无「笔记」前缀、无图标） |
| 行内 `title`（tooltip） | `摘录 {excerpt} 条 · AI 结论 {answer} 条`（两段**恒给**，为 0 时也写；分隔符为半角空格 + `·`(U+00B7) + 半角空格；例：`摘录 2 条 · AI 结论 1 条`、`摘录 0 条 · AI 结论 1 条`） |
| 计数口径 | `notes.json` **全量条目**中该文档的 `excerpt + answer` 总数（= `total`）；按 `docPathKey` 大小写/斜杠无关地聚合 |
| 数据来源 | 渲染层 `notesStore.notes`（不读盘、不发 IPC、不写盘；外部改动的一致性由 N88 承担，徽标不单独读盘） |
| 盒模型（冻结，用于守住既有 `overflowFree` 判据） | `flex-shrink: 1000; min-width: 0; overflow: hidden; white-space: nowrap; padding: 0; font-size: 10px; line-height: 1.4; color: var(--pix-text-secondary);`（**不得**加 `margin-left: auto` / 背景 / 边框 / 水平内边距 / `text-overflow`；不得新增 CSS 变量。`.row-notes` 是行内**唯一的可收缩项**；`.row-label` 与 `.row-progress` 的 flex 行为逐字不变） |
| 压缩与降级（冻结；读数见事实基线表） | 行内剩余空间不足时，缺口**全部由徽标承担**（`.row-label` / `.row-progress` 零位移）：徽标被压缩、文本按**右端硬裁切**（数字在最左 ⇒ **优先保留**；**不得**用 `text-overflow: ellipsis`）；压缩到 0 宽即整体不可见（**不得**留下空胶囊）。实测口径：`sample-paper.pdf` 行余量 34px ≥ 所需 ≈22.8px ⇒ 完整显示 `3 条`；`archive/older-paper.pdf` 行余量 14px ⇒ 徽标落到 10px，数字（≈5.75px）完整可见、「条」被裁切。**文本类判据一律用 `textContent`**（恒为逐字 `{N} 条`，与是否被压缩无关） |
| 与面板计数的口径差异（冻结） | 徽标恒示**该文档全量条数**；面板 `.group-count`（`NotesPanel.vue:627` 的 `共 {N} 条`）= `group.notes.length`，而 `groups` = `applyViewToGroups(groupNotesByDocument(...))`（`notes-store.ts:142-145`）⇒ **过滤态（搜索 / 章节过滤 / 「仅看当前文档」）下可与 `.group-count` 不等**（徽标不跟过滤走，这是正确语义） |
| 派生纪律 | ① 聚合函数唯一实现点 = `countNotesByDocument`（`notes-path.ts`），函数体恰 **1** 个循环、循环内无嵌套循环；② 每行的计数只经**一次** `Map.get`（等价实现：行对象带 `badge` 字段，或模板内单次调用 + 局部变量）；③ 派生整体由 Vue `computed` 提供（memo：`notes` 未变则不重算） |

### 0.4 外部改动检测、提示行与刷新（逐字冻结）

| 项 | 逐字值 |
| --- | --- |
| 检测通道 | `notes-stat`（§0.5）；渲染层唯一调用入口 = store 的 `checkNotesFile()`（= 指纹比对）；调用点唯一 = 面板的窗口焦点监听 |
| 检测时机 | ① 进入工作区（`WorkspacePage.onMounted` 的 `loadNotes()` 成功 ⇒ 捕获基线）；② 窗口重新获得焦点（`window` 的 `focus` 事件 ⇒ `checkNotesFile()`）；③ 打开笔记面板（`selectLeftTab("notes")` 的既有 `loadNotes()` 成功 ⇒ 捕获基线）；④ 每次笔记写操作成功后（`applyNotes()` 内捕获基线） |
| 判定式 | `externalChange ⇔ (exists ? hash : "") !== 基线`；基线为 `null`（尚未捕获）时按捕获处理（不置位）；比对只认 `hash`，`size` / `mtimeMs` 只作观测事实 |
| 提示行容器 | `.notes-stale`（DOM 位置：`.notes-notice` 块**之后**、`.notes-undo` 块**之前**） |
| 提示行渲染条件 | `notesStore.externalChange === true`（**单一条件**，不附加 `status` 条件：刷新失败时提示保留，与错误态并存） |
| 提示文本 | `.stale-text` 逐字 `笔记文件已被外部修改，面板内容可能过期` |
| 刷新按钮 | `.stale-refresh`（`v-btn`，`size="x-small"`、`variant="text"`、`prepend-icon="mdi-refresh"`；**不覆盖** Vuetify 的 padding / font-size —— 度量同既有行内 x-small text 按钮：`--v-btn-height: 20px`、`font-size: 0.625rem`，见 `pix/node_modules/vuetify/lib/components/VBtn/VBtn.css:27-29`，先例 = `.notes-export-row` / `.notes-report-row` 的行内按钮）文本逐字 `刷新`；`title` 逐字 `重新读取笔记文件`；`:loading="refreshing"`、`:disabled="refreshing"`（在途第二次点击不发第二次 IPC） |
| 刷新动作 | 调 `notesStore.loadNotes()`（既有读盘语义：`status = "loading"` → 覆盖 `notes` 列表 → 成功后捕获基线 ⇒ `externalChange` 归 false）；**只读**，不发任何写 IPC、不改 `notes.json` 字节 |
| 非阻塞含义 | 不遮罩、不弹窗、不锁滚动、不禁用任何既有控件；提示存在期间笔记行点击 / 选择 / 追问 / 删除 / 备注编辑 / 搜索 / 导出 / 报告入口全部照常；提示**不自动消失**，也**没有关闭按钮**（唯一消失路径 = 显式刷新成功或写操作成功重新对标） |
| 提示行样式 | 容器 `.notes-stale` 与 `.notes-undo` 同盒模型：`margin: 2px 10px 6px; padding: 6px 8px; border: 1px solid var(--pix-border-light, #e3eaf0); border-radius: var(--pix-radius-md); background: var(--pix-bg-elevated, #ffffff);`；`.stale-text` `flex: 1; min-width: 0; font-size: 11px; line-height: 1.4; color: var(--pix-text-secondary); word-break: break-word;`；`.stale-refresh` **无自有样式覆盖**（保持 Vuetify `v-btn` 的 `x-small` text 形态，与导出 / 报告行的行内按钮同度量） |

### 0.5 新 IPC、类型与失败面（逐字冻结）

**通道与 preload 面**

| 项 | 值 |
| --- | --- |
| 通道 | `notes-stat` |
| handler | `ipcMain.handle("notes-stat", () => statNotesFile());`（**无入参** ⇒ 无守卫；错误以返回字段表达，**不抛错**） |
| 落点 | `ipc-handlers.ts` 的 `Reader notes` 分节内、`notes-export-report`（`:529-531`）之后；新增 import `statNotesFile` |
| preload | `PixApi` 接口 + `api` 实现各一处：`notesStat: () => Promise<ReaderNotesStatResult>`（`ipcRenderer.invoke("notes-stat")`）；改后 `PixApi` / `api` 各 **42** 方法，既有 41 个逐字不动 |
| stub 面 | `ui-shot.mjs` 的 stub `pixApi` 同步新增 `notesStat`（保持「stub 面 = preload 面」既有纪律，见 §0.9 与 N90-3） |

**类型（`pix/src/shared/types.ts`，名字与字段逐字冻结）**

```ts
/** 笔记文件指纹：只读的最小事实（不解析内容、不改文件）；失败时 success=false 且事实字段归零。 */
export interface ReaderNotesStatResult {
  success: boolean;
  exists: boolean;
  size: number;
  mtimeMs: number;
  hash: string;
  code?: ReaderNotesErrorCode;
  error?: string;
}
```

| 项 | 冻结 |
| --- | --- |
| 落点 | 紧接 `ReaderNotesLoadResult`（`types.ts:383-388`）之后、`ReaderNotesMutationResult`（`:392`）之前（与「读」相关的类型同块） |
| 错误码 | **不扩** `ReaderNotesErrorCode`（既有 11 键）：只用 `no-root` / `read-failed` |
| `hash` 定义 | 文件**原始字节**的 sha256 十六进制小写（未剥 BOM、未解析）；`exists === true` 时恒为 64 字符；`exists === false` 时恒为 `""` |
| `size` / `mtimeMs` | `exists === true` 时取 `statSync` 的真实值（`mtimeMs > 0`、`size ≥ 0`）；`exists === false` 或 `success === false` 时恒为 `0` |
| 语义边界 | **不解析内容**：损坏 / 版本不支持的文件照常 `success: true` + 真实 `hash`（**不返回** `corrupt` / `version-unsupported`）；文件缺失是**成功**的统计（`exists: false`）；只读（不建目录、不建文件、不改 mtime） |
| 主进程返回面（`statNotesFile(): ReaderNotesStatResult`） | 无工作区根 ⇒ `{ success: false, exists: false, size: 0, mtimeMs: 0, hash: "", code: "no-root", error: "尚未选择资料库根目录" }`；文件不存在（ENOENT）⇒ `{ success: true, exists: false, size: 0, mtimeMs: 0, hash: "" }`；stat 或读取失败（非 ENOENT）⇒ `{ success: false, exists: false, size: 0, mtimeMs: 0, hash: "", code: "read-failed", error: "笔记文件读取失败" }`；正常 ⇒ `{ success: true, exists: true, size, mtimeMs, hash }` |

**渲染层口径**

| 项 | 冻结 |
| --- | --- |
| 指纹归一 | `fingerprint = result.success && result.exists ? result.hash : ""`（文件缺失记 `""`，与「基线为 `""`」等价 ⇒ 创建 / 删除文件都会命中不一致） |
| 失败静默 | `success === false`、非字符串 `hash`、IPC reject 三种情形**一律** `return`（保持 `externalChange` 与基线不变），不弹 `.notes-notice`、不写日志、不改 `status` |
| 竞态 | 内部序号 `notesFileSeq`：响应落地时序号已变即丢弃（`resetNotes()` 递增并作废基线）；与 `loadSeq` / `undoScope` / `reportScope` 同范式 |

### 0.6 刷新与草稿的冲突规则（写死，N88）

> 前提：本次刷新的判定完全由「用户显式点击 `.stale-refresh`」触发；任何检测都不得自动重载列表。

1. **不触碰草稿与编辑态**：检测（`checkNotesFile`）与刷新（`loadNotes`）都**不得**读写面板的 `editingCommentId` / `commentDraft`；不自动保存、不自动清空、不自动关闭编辑框。
2. **条目仍在**：刷新后若编辑中的条目（同 `id`）仍在新列表中 ⇒ 编辑框保持打开、`commentDraft` 逐字不变（**不**把文件里的 `comment` 覆盖进草稿；草稿优先，直到用户点「保存」或「取消」）。
3. **条目已不在**（外部删除了该条）⇒ 其行随数据消失、编辑框随行消失；`editingCommentId` / `commentDraft` 的内存值**不自动清理**（不自动保存、不自动丢弃）；该行的后续动作只能由用户显式发起（对其它条目重新打开编辑会按既有 `startCommentEdit` 语义覆盖草稿 —— 既有行为，本轮不改）。
4. **刷新只读**：刷新不发任何写 IPC（`notes-add` / `notes-update` / `notes-delete` / `notes-restore` / `notes-export` / `notes-export-report` 全部零调用）；`notes.json` 字节在刷新前后逐字节不变。

### 0.7 组头文档跳转（N89，逐字冻结）

| 项 | 逐字值 |
| --- | --- |
| 可点面 | `.notes-group-head` 增 `:class="{ 'is-openable': !group.isCurrentDoc }"` 与 `@click="onGroupOpen(group)"`；**DOM 结构与 `:title="group.docPath"` 零变化**（不加按钮、不加图标、不加下划线） |
| 判别用类 | `is-openable`（仅非当前文档组） |
| 可选样式 | `.notes-group-head.is-openable { cursor: pointer; }`；`.notes-group-head.is-openable:hover .group-name { color: var(--pix-text-link, #314b5f); }`（只允许这两条；不新增变量、不加过渡动画） |
| 当前文档组 | 不渲染 `is-openable`；点击（含点 `.group-name`）**零副作用**：不切文档、不跳页、不发 IPC、不改选择集 |
| 事件名 | `open-note-doc`（`defineEmits` 增 `"open-note-doc": [docPath: string]`；载荷 = `group.docPath`，**工作区相对**；**不得**复用既有 `open-document`——它是绝对路径语义） |
| 处理器（`WorkspacePage.vue`） | `onOpenNoteDoc(docPath: string): void { openDocumentFromLibrary(absoluteDocPath(rootDir.value, docPath)); }`；模板 `@open-note-doc="onOpenNoteDoc"` |
| 既有效果复用 | 复用 `openDocumentFromLibrary`（树行同一条通道）：`requestRestoreFor` 登记现场恢复意图、`selectedFilePath` 赋值；**不切标签、不折叠左栏、不写盘、不发新 IPC** |
| 边界 | 目标文档磁盘缺失时**不做**存在性预检（与既有笔记行跳转 `onOpenNote` 同口径，失败由阅读区既有错误态承担） |

### 0.8 冻结的类名/常量/名字清单（离屏与烟测断言依赖，不得改名）

| 选择器 / 名字 | 含义 |
| --- | --- |
| `.row-notes` | 树行笔记计数（§0.3；10px 次要色小字、行内唯一可收缩项、压缩态与文本判据口径见 §0.3） |
| `.notes-stale` / `.stale-text` / `.stale-refresh` | 外部改动提示行、文本、刷新按钮（§0.4） |
| `is-openable` | 组头可跳转标记（§0.7） |
| `notes-stat` / `notesStat` / `ReaderNotesStatResult` / `statNotesFile` | 新 IPC 通道、preload 方法、类型、主进程实现（§0.5） |
| `notes-store.ts`（渲染层）：`externalChange` / `checkNotesFile` / `syncNotesFile` / `notesFileSeq` / `notesFingerprint` | 检测状态、动作与内部竞态/基线（内部命名自由、语义冻结；`externalChange` 与 `checkNotesFile` 必须在 store 的返回对象上暴露） |
| `notes-path.ts`：`countNotesByDocument` / `NotesBadgeCount` | 计数派生唯一实现点与返回元素类型（§0.2 第 2 条） |
| `notes-store.ts`（主进程）：`statNotesFile` | 指纹读取唯一实现（§0.5） |
| `NotesPanel.vue`：`onRefreshNotes` / `refreshing` / `onWindowFocus` / `onGroupOpen` | 刷新动作、在途标志、焦点监听、组头处理器（命名自由、语义冻结） |
| `WorkspacePage.vue`：`onOpenNoteDoc` / `open-note-doc` | 组头跳转处理器与事件名（§0.7） |
| `ui-shot.mjs` 的 `SEL` 新增 **6** 项 | `rowNotes: ".row-notes"` / `staleRow: ".notes-stale"` / `staleText: ".notes-stale .stale-text"` / `staleRefresh: ".notes-stale .stale-refresh"` / `groupName: ".notes-group-head .group-name"` / `centerDocLabel: ".center-pill .pill-label"` |
| `ui-shot.mjs` 的 stub 新增 | `notesStat`（真读真算）/ `__pixStub.notesStatCalls()` ⇒ `{ count }` / `__pixStub.setNotesStatFailure(code)`（`null` / 错误码 / `"throw"`）/ 笔记文件根随 `activeRoot`（函数 `currentNotesFile()`）。`activeRoot` 影响面（冻结，D）：随 `activeRoot` = `readNotesFile` / `writeNotesFile` / `notesLoad` / `notesStat`；仍锚 A 根 = `relativeDocPath` / `isInsideNotesRoot` / `notesExport` / `notesExportReport` / `notesReset`（⇒ B 侧写操作仍判 `outside`，本轮无场景触发，登记为已知简化） |
| 新场景名 / 组名 / 条数 | `r14-1`…`r14-5`；`r14-tree-badge` **3** / `r14-tree-badge-scope` **2** / `r14-notes-stale` **3** / `r14-notes-stale-failure` **3** / `r14-group-jump` **2** = **13 条** |
| 新截图（冻结，8 张） | `r14-1-tree-notes-badge.png`、`r14-1b-tree-badges-narrow.png`、`r14-2-tree-badge-workspace-b.png`、`r14-3-stale-row.png`、`r14-3b-refresh-keeps-draft.png`、`r14-3c-refresh-list-synced.png`、`r14-4-stat-failure-silent.png`、`r14-5-group-jump.png` |
| 新烟测组与条数（冻结，不得减少） | `notes-stat` **7**（追加在既有 7 组 44 条之后）/ `badge-counts` **6**（追加在既有 4 组 29 条之后） |

### 0.9 回归基线与新增配额

| 项 | R14 冻结口径 |
| --- | --- |
| 基线 | 动工前在**新目录**（`PIX_SHOT_ROOT=<临时目录>/pix-v05-r14-base`）实跑一次，读数即本轮唯一基线；R13 交付目录 `C:/Users/86157/AppData/Local/Temp/pix-v05-r13-review`（135 张 / 198 条 / 46 种 label，本档已逐项核对）作为交叉参考 |
| 零缺失判据 | 基线 `MANIFEST.shots[].name` 集合 ⊆ 验收运行集合；基线 `MEASUREMENTS.json` 的 label 集合 ⊆ 验收运行集合（既有 46 种 label、198 条测量一条不少）；`MANIFEST.json.failure === null`、退出码 0 |
| 新增配额 | 截图 **8 张**、record **13 条**（5 组）；既有 135 张 / 198 条 / 46 种 label 零缺失、零改写 |
| 允许的位移与内容变更 | **仅** ① 有笔记的树行新增 `.row-notes` 计数（既有截图里出现新元素 = 预期内容变化）；② 该计数在行内余量不足时被压缩 / 右端裁切（`.row-notes` 是行内唯一可收缩项 ⇒ **`.row-label` 与 `.row-progress` 的几何零变化**；实测：`sample-paper.pdf` 行余量 34px ⇒ 完整显示，`archive/older-paper.pdf` 行余量 14px ⇒ 落到 10px、数字可见、「条」被裁切，窄栏下可被压到 0 宽即不可见）；③ 面板在 `.notes-notice` 与 `.notes-undo` 之间可能多出 `.notes-stale` 行（仅当 `externalChange === true`，既有场景不会出现）；④ 非当前文档分组的组头出现 `is-openable` 类与 `cursor: pointer`（静态几何零变化）。**不允许**：`.row-progress` 文本/几何的任何变化；`.notes-group-head` / `.group-count` / `.group-titles` / `.group-name` / `.group-path` 的字体、颜色、盒几何变化；面板既有行与控件的任何几何/文本变化；任何 `w/h/fontSize/color/background` 的非预期差异。**硬约束**：既有 `tree-progress` 场景的 `overflowFree`（行级与 label 级）必须保持绿——机制 = 缺口全部由 `.row-notes` 自行承担（`older` 行缺口 8.8px ≤ 徽标可收缩量 18.8px），若徽标反而挤动了 `.row-label`，则必须继续收窄徽标盒模型（文案逐字不变）并在 dev 档登记实测读数 |
| 内容目视比对 | 新增 8 张截图必须在 dev 档逐张登记结论（是否出现非预期的重叠 / 截断 / 换行）；`.row-notes` 不得压住 `.row-label` 文本或 `.row-progress`，也不得出现「空胶囊」；压缩态行（`r14-1` 的 `older` 行、既有场景 21 的 `21-tree-progress.png`）须登记可见宽与裁切位置；`.notes-stale` 不得压住 `.notes-notice` / `.notes-undo`；`.stale-refresh` 与导出 / 报告行的「在文件夹中显示」同高同字号 |
| 烟测回归 | `pix/scripts/smoke-view.mjs`（既有 4 组 29 条 + 新增 1 组 6 条）与 `pix/scripts/smoke-notes.mjs`（既有 7 组 44 条 + 新增 1 组 7 条）都必须可复跑且全绿（退出码 0） |

---

## 1. N87 资料库树笔记徽标（6 子条）

**用户可见行为**：打开资料库树，有笔记的文档行在文件名后多一段小字计数「3 条」（10px 次要色，不压行名与页码）；鼠标悬停显示「摘录 2 条 · AI 结论 1 条」；没有笔记的文档和目录行和以前完全一样；有阅读进度的文档行两枚标记并排（计数在前、页码在后且仍贴行右缘）；行内空间不够时先压缩计数本身（数字优先保留、「条」被裁切，再不够则计数整体让位），**永不挤动文件名与页码**；在笔记面板里删掉或撤销一条摘录、或刷新后外部新增一条笔记，树上的数字跟着变；换一个资料库，计数不会串库。

### N87-1 徽标 DOM、逐字文案与渲染条件

**逐字冻结**：§0.3 的「触发面 / 渲染条件 / 不渲染的行 / DOM 位次 / 类名 / 文本 / 行内 `title`」。

**验收判据**

1. 【离屏】`r14-1` 相位 `badges`：`sample-paper.pdf` 行的 `.row-notes` `textContent` 逐字 `3 条`、`title` 逐字 `摘录 2 条 · AI 结论 1 条`，且**未被压缩**（`notesScrollWidth ≤ notesClientWidth + 1`）；`archive/older-paper.pdf` 行 `textContent` 逐字 `1 条`、`title` 逐字 `摘录 1 条 · AI 结论 0 条`，压缩态按 §0.3 断言（`notesClientWidth` 实测 10 ± 1、数字可见、无空胶囊）（截图 `r14-1-tree-notes-badge.png`）。
2. 【离屏】`r14-1` 相位 `badges`：`reading-notes.md` / `long-book.pdf` / `archive`（目录）三行 `.row-notes` 计数为 **0**，且这三行的 `.row-progress` 计数也为 0（防空：断言确在无徽标行上执行）。
3. 【离屏】`r14-1` 相位 `badges`：`.row-notes` 的 DOM 位次 = `.row-label` 之后、`.row-progress` 之前（`compareDocumentPosition` 判定），两枚标记矩形不重叠（`notes.right ≤ progress.left`；压缩态同样成立）。
4. 【走查】类名与文案唯一：`grep -rn "row-notes" pix/src | wc -l` = **2**（`LibraryPanel.vue` 的模板 1 处 + 样式 1 处）；`grep -rn "摘录\|AI 结论" pix/src/renderer/components/workspace/LibraryPanel.vue | wc -l` = **1**（唯一一处 tooltip 模板）。

**文件白名单条目**：`pix/src/renderer/components/workspace/LibraryPanel.vue`（修改）。

### N87-2 计数口径与唯一派生（单次遍历 + memo）

**逐字冻结**：§0.2 第 2 / 3 条与 §0.3 的「计数口径 / 数据来源 / 与面板计数的口径差异 / 派生纪律」。

**验收判据**

1. 【烟测-渲染】组 `badge-counts` #1：标准 4 条夹具 ⇒ `Map.size === 2`；`get("sample-paper.pdf")` 逐字段 `{ total: 3, excerpt: 2, answer: 1 }`；`get("archive/older-paper.pdf")` 逐字段 `{ total: 1, excerpt: 1, answer: 0 }`。
2. 【烟测-渲染】组 `badge-counts` #3：未出现笔记的文档（`reading-notes.md`）在 Map 中 `undefined`（只产出 `total > 0` 的文档）。
3. 【烟测-渲染】组 `badge-counts` #5：同文档混合 kind（3 摘录 + 2 结论）⇒ `total === excerpt + answer === 5`，逐值断言。
4. 【烟测-渲染】组 `badge-counts` #4：比较键归一 —— `sample-paper.pdf` / `Sample-Paper.PDF` / `sample-paper.pdf\\` 三类写法合并为**同一键**且计数相加。
5. 【走查】唯一实现点与单次遍历：`grep -rn "countNotesByDocument" pix/src | wc -l` = **3**（`notes-path.ts` 定义 1 + `LibraryPanel.vue` 的 import 与调用各 1）；**函数体内**恰 1 个循环：`sed -n '/countNotesByDocument/,/^}/p' pix/src/renderer/utils/notes-path.ts | grep -c "for ("` = **1**（无嵌套循环）；**文件总数** = **3** = 既有 2（`groupNotesByDocument` 的 `:74` / `:98`）+ 新增 1。
6. 【走查】memo 与一次查找：`LibraryPanel.vue` 的聚合结果是 `computed`（`grep -n "countNotesByDocument" -A 2 …` 命中 `computed(`），且模板不出现对派生函数的重复调用（每行只读一次行对象上的徽标值 / 只调一次取数函数）。
7. 【离屏】`r14-1` 相位 `live`（口径：徽标恒示全量、不跟过滤走）：用既有 helper `setSearch` 写入只命中 `archive/older-paper.pdf` 那条的搜索串（`Reproducibility`）⇒ `sample-paper.pdf` 分组的 `.group-count` 不再等于徽标文本（该组归零或分组消失），而该行 `.row-notes` 的 `textContent` 逐字不变（仍 `3 条`）；随后用 `setSearch("")` 复原。

**文件白名单条目**：`pix/src/renderer/utils/notes-path.ts`（新增纯函数）、`pix/src/renderer/components/workspace/LibraryPanel.vue`（修改）、`pix/scripts/smoke-view.mjs`（新增断言组）。

### N87-3 更新时机与作用域（含跨工作区不残留）

**逐字冻结**：§0.2 第 3 条（列表变化即更新；不新增 IPC、不轮询）。

**验收判据**

1. 【离屏】`r14-1` 相位 `live`：在笔记面板删除 `sample-paper.pdf` 的一条摘录 ⇒ 该行徽标变 `2 条`、tooltip 变 `摘录 1 条 · AI 结论 1 条`；点撤销 ⇒ 徽标回到 `3 条`（tooltip 回 `摘录 2 条 · AI 结论 1 条`）。
2. 【离屏】`r14-3` 相位 `refresh-draft`：外部新增笔记 + 面板显式刷新 ⇒ 树徽标同步（`reading-notes.md` 行出现 `1 条`、`archive/older-paper.pdf` 行变 `2 条`）——证明「面板刷新」也是徽标的更新时机。徽标一律用 `textContent` 读取：面板打开时树由 `v-show` 隐藏（DOM 完整、几何为 0），所以本相位也可以先 `backToLibraryTab()` 再读。
3. 【离屏】`r14-2` 相位 `b-workspace`：切到工作区 B（B 的库无笔记）⇒ B 树行 `.row-notes` 计数 **0**（且 B 树至少有 1 行作为防空断言）；`notesLoadCalls()` 在进入 B 后有增量（进入工作区即读盘）。
4. 【离屏】`r14-2` 相位 `back-to-a`：切回工作区 A ⇒ 徽标恢复（`sample-paper.pdf` = `3 条`、`archive/older-paper.pdf` = `1 条`）。
5. 【走查】数据面纪律：`grep -rn "notesStat\|notesLoad\|notesAdd" pix/src/renderer/components/workspace/LibraryPanel.vue | wc -l` = **0**（树不直接调任何笔记 IPC，数据只来自 store 的列表）。

**文件白名单条目**：`pix/src/renderer/components/workspace/LibraryPanel.vue`（修改）；`pix/scripts/ui-shot.mjs`（stub 笔记根随 `activeRoot` + 场景）。

### N87-4 与阅读进度徽标并存、窄栏不溢出

**逐字冻结**：§0.3 的 DOM 位次、盒模型与「压缩与降级」；§0.9 的「允许的位移与内容变更」②与硬约束。

**验收判据**

1. 【离屏】`r14-1` 相位 `badges`：`sample-paper.pdf` 行同时有 `.row-notes`（`3 条`，未被压缩）与 `.row-progress`（`第 2 页`，由种子现场写入）；`.row-progress` 的右边界贴行右内边距（与无笔记行一致，误差 ≤ 1px）；两枚标记不重叠（`notes.right ≤ progress.left`）。
2. 【离屏】`r14-1` 相位 `narrow`：`--pix-left-width: 220px` 下（`.layout-left` 实测宽 218–222 作防空断言）——行 `scrollWidth ≤ clientWidth + 1`（不溢出）、`.row-progress` 的文本与几何不变、`.row-label` 的截断深度不超过 R13 读数 + 4px（多出的那 1 个 gap）；`.row-notes` 允许被压缩到 0 宽（不可见）或仅剩数字 ⇒ **不作「文本完整」断言**，但必须把它自己的几何（`notesClientWidth` / `notesScrollWidth`）写进 `data` 并在 dev 档登记（截图 `r14-1b-tree-badges-narrow.png`）。
3. 【离屏】既有场景 21（`tree-progress`，含 `.row-notes` 出现后的默认宽度）继续全绿：`overflowFree(sample)` 与 `overflowFree(older)` 均成立（行级 + label 级不溢出/不截断）——机制 = 缺口全部由徽标承担（`older` 行缺口 8.8px ≤ 徽标可收缩量 18.8px ⇒ 徽标落到 10px、label 与进度徽标零位移）；这是本轮对既有断言最敏感的一条，必须零缺失通过。
4. 【走查】`.row-progress` 零改动：`git diff -U0 pix/src/renderer/components/workspace/LibraryPanel.vue` 中 `.row-progress` **不作为 `+` / `-` 行出现**（上下文行不得用于判定；允许出现的是 `.row-notes` 新增块与其紧邻的定位插入）；`grep -c "margin-left: auto" …LibraryPanel.vue` = **1**（实测 `:261`，仍只属于 `.row-progress`）。

**文件白名单条目**：`pix/src/renderer/components/workspace/LibraryPanel.vue`（修改）。

### N87-5 无笔记文档与懒加载零变化

**逐字冻结**：0 笔记行不渲染任何新节点；懒加载（`toggle`）与 `flattenVisible` 语义不变；目录行不聚合。

**验收判据**

1. 【离屏】`r14-1` 相位 `badges`：`reading-notes.md` / `long-book.pdf` 行的子节点集合与基线一致（新增计数 = 0）——用 `.row-notes` 计数 = 0 与行 `scrollWidth ≤ clientWidth` 共同判定。
2. 【离屏】`r14-1` 相位 `badges`：`archive` 目录行本身无徽标（计数 0），但其子行 `archive/older-paper.pdf` 有徽标（证明「不聚合、不遗漏子行」）。
3. 【走查】`toggle` / `flattenVisible` / `reload` / `iconFor` / `chevronFor` / `isSelected` 零 diff（`git diff` 不显示这些函数体）⇒ 懒加载的调用次数与 R13 逐字一致（由零 diff 推导；**不新增** `libraryList` 计数口，评审 MF-10 的第二选项）。
4. 【离屏】既有场景 21b（`tree-progress` 相位 `trim`）继续全绿：该相位的既有断言（`sample` 行 `第 3 页`、`older` 行进度徽标计数 **0**）零缺失通过；`.row-notes` 只可能出现在有笔记的行上，不得干扰这两条读数（该场景不新增 `.row-notes` 断言，期望值不硬编码，实测读数在 dev 档登记）。

**文件白名单条目**：`pix/src/renderer/components/workspace/LibraryPanel.vue`（修改）。

### N87-6 数据面纪律（不得为此新增主进程 IPC）

**逐字冻结**：§0.2 第 3 条。

**验收判据**

1. 【走查】本轮**唯一**新增通道是 N88 的 `notes-stat`（见 §0.5）；树徽标路径不出现任何 `ipcMain.handle` 或 `ipcRenderer.invoke`：`grep -rn "ipcRenderer\|pixApi\." pix/src/renderer/components/workspace/LibraryPanel.vue` 只命中既有的 `window.pixApi.libraryList`（懒加载，2 处；不得出现笔记相关调用）。
2. 【走查】徽标路径不写盘、不做轮询：`grep -rniE "setInterval|setTimeout" pix/src/renderer/components/workspace/LibraryPanel.vue | wc -l` = **0**。
3. 【check】`CHECK_EXIT=0`（新增纯函数与模板改动无类型错误；无 `any`、无内联动态 import）。

**文件白名单条目**：`pix/src/renderer/utils/notes-path.ts`、`pix/src/renderer/components/workspace/LibraryPanel.vue`（均修改）。

---

## 2. N88 笔记文件外部改动感知（7 子条）

**用户可见行为**：在应用外改过 `.pix-read/notes.json`（编辑器保存、脚本写入、把文件删掉）后回到窗口，笔记面板顶部出现一行灰色提示「笔记文件已被外部修改，面板内容可能过期」和一枚「刷新」按钮，列表暂时保持原样（不会被悄悄改写）；点「刷新」后列表与文件对齐、提示消失；正在写的备注草稿一个字都不会丢；如果外部文件读不动（占用、权限），应用什么都不说、什么都不弹，继续正常工作。

### N88-1 新 IPC（通道、handler、preload、类型、失败面）

**逐字冻结**：§0.5 全表（含类型定义与五种返回形状）。

**验收判据**

1. 【走查】四面同步（逐条可判定）：`grep -rn "notes-stat" pix/src | wc -l` = **2**（handler 1 + preload 实现 1）；`grep -c "notesStat" pix/src/main/preload.ts` = **2**（接口 1 + 实现 1）；`grep -c "ReaderNotesStatResult" pix/src/shared/types.ts` = **1**（定义 1）、`grep -c "ReaderNotesStatResult" pix/src/main/preload.ts` = **3**（import 1 + 接口返回类型 1 + 实现断言类型 1）。
2. 【走查】既有 41 个 preload 方法零改动、`notes-load` 等七通道与 `ReaderNotesLoadResult` 形状零改动；`ReaderNotesErrorCode` 仍为 11 键（`no-root` / `outside` / `invalid-input` / `too-long` / `not-found` / `corrupt` / `version-unsupported` / `read-failed` / `write-failed` / `empty` / `not-corrupt`）；`ui-shot.mjs` 的 stub `pixApi` 新增 `notesStat` ⇒ **三处方法数均为 42**（改前各 41：`preload.ts` 接口 `:34-107`、实现 `:109-191`、stub `api` `ui-shot.mjs:798-1100`），且三处方法名清单逐字相等（stub 面 = preload 面）。
3. 【走查】只读实现：`statNotesFile()` 内不出现 `writeFileSync` / `mkdirSync` / `rmSync` / `renameSync`（`grep -c` 各 0，可见范围限该函数体内）；不调用 `parseNotesFile` / `readNotesFile`（不解析内容）。
4. 【check】`CHECK_EXIT=0`。
5. 【离屏】`r14-3` 相位 `detect`：检测确实走新通道（`notesStatCalls()` 增量 ≥ 1），且检测前后 `notesHash()` 不变（只读）。

**文件白名单条目**：`pix/src/shared/types.ts`、`pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`、`pix/src/main/notes-store.ts`（均修改）。

### N88-2 检测时机、基线与竞态

**逐字冻结**：§0.2 第 5 条、§0.4 的「检测时机 / 判定式」、§0.5 的「指纹归一 / 失败静默 / 竞态」。

**验收判据**

1. 【离屏】`r14-3` 相位 `enter-fresh`：把 A 的 `notes.json` 在进入工作区**之前**由外部改写为 5 条 ⇒ 进入工作区（挂载 `loadNotes`）并打开面板（`selectLeftTab` 再次 `loadNotes`）后：面板 5 行、外部新增条目文本可见、`.notes-stale` **不在 DOM**（读盘即一致 ⇒ 不误报）。
2. 【离屏】`r14-3` 相位 `detect`：外部再追加一条 + 派发 `window` 的 `focus` 事件 ⇒ `.notes-stale` 出现；且该相位 `.note-row` 仍 5 行、`.notes-count` 文本逐字 `共 5 条`（检测**不**自动改写列表与计数）。
3. 【离屏】`r14-4` 相位 `write-rebaseline`：外部追加一条（提示出现）后，在面板删除一条笔记（写操作成功）⇒ `.notes-stale` 消失、列表包含外部新增条目、面板行数等于 `notes.json` 的条目数（`readNotes().length`）——证明「写操作成功后重新对标」且不同步外部改动也不丢数据。
4. 【走查】基线捕获点恰 **3** 处：`grep -c "syncNotesFile(\"capture\")" pix/src/renderer/stores/notes-store.ts` = **3**（`loadNotes` 成功分支、`applyNotes`、`recoverCorruptNotes`）；比对入口恰 **1** 处：面板 `grep -c "checkNotesFile" pix/src/renderer/components/workspace/NotesPanel.vue` = **1**；焦点监听恰 1 处：`grep -rn "addEventListener(\"focus\"" pix/src | wc -l` = **1**、`removeEventListener("focus"` = **1**（同一文件的成对注册与清理）。
5. 【走查】竞态纪律：`grep -c "notesFileSeq" pix/src/renderer/stores/notes-store.ts` ≥ **3**（递增、比较、`resetNotes` 作废）；`resetNotes()` 内出现 `externalChange.value = false` 与基线置空各 1 处。
6. 【离屏】`r14-4` 相位 `stat-failure-silent`（步骤见 N90-3：先由外部追加 + `triggerWindowFocus()` 造出置位态，再注入失败）⇒ 状态**保持现状**：已置位时失败 ⇒ 提示仍在、不清除；清位后再失败 ⇒ 提示**不出现**、不置位；两种失败注入期间 `.notes-notice` 为 `null`、`.note-row` 行数不变。

**文件白名单条目**：`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue`（均修改）。

### N88-3 提示行与刷新按钮（逐字字面、非阻塞）

**逐字冻结**：§0.4 的「提示行容器 / 渲染条件 / 提示文本 / 刷新按钮 / 非阻塞含义 / 提示行样式」。

**验收判据**

1. 【离屏】`r14-3` 相位 `detect`：`.stale-text` 文本逐字 `笔记文件已被外部修改，面板内容可能过期`；`.stale-refresh` 文本逐字 `刷新`、`title` 逐字 `重新读取笔记文件`；`.notes-stale` 与 `.notes-notice` / `.notes-undo` 的 DOM 顺序 = notice → stale → undo（截图 `r14-3-stale-row.png`）。
2. 【离屏】`r14-3` 相位 `detect`：提示存在期间笔记行仍可交互（点第 1 行复选框 ⇒ `.notes-selection-count` 出现；随后清空选择）——非阻塞的可判定式；同时断言 `.notes-count` 与 `.notes-export-btn` 文本不变（既有控件未被禁用/改写）。
3. 【离屏】`r14-3` 相位 `detect`：提示**不自动消失**（派发焦点后 `sleep(4500)` 仍在——等待窗口 > `NOTICE_MS = 4000`，与瞬时提示形成对照）。
4. 【走查】文案唯一：`grep -rn "笔记文件已被外部修改，面板内容可能过期" pix/src | wc -l` = **1**（面板模板；store 不持有字面）；`grep -rn "重新读取笔记文件" pix/src | wc -l` = **1**。
5. 【走查】样式零外溢：`grep -c "notes-stale" pix/src/renderer/components/workspace/NotesPanel.vue` = **2**（模板 1 + 样式 1）；不新增 `--pix-*` 变量（`git diff` 的 `variables.css` 为空）。

**文件白名单条目**：`pix/src/renderer/components/workspace/NotesPanel.vue`（修改）。

### N88-4 刷新语义与草稿冲突（写死）

**逐字冻结**：§0.6 的四条规则与 §0.4 的「刷新动作」。

**验收判据**

1. 【离屏】`r14-3` 相位 `refresh-draft`：点击 `.stale-refresh` 后 `.notes-stale` 不在 DOM、`.note-row` 行数 = 文件条目数（外部新增的两条均可见）——「提示消失 + 面板与文件一致」（截图 `r14-3c-refresh-list-synced.png`）。
2. 【离屏】`r14-3` 相位 `refresh-draft`：刷新前对第 1 行打开备注编辑并草稿逐字 `刷新不应丢弃这段草稿`；刷新后 `document.querySelector(".note-comment textarea")` 仍在 DOM、`value` 逐字等于草稿、「保存」与「取消」按钮仍在——**草稿与编辑态未被触碰**（截图 `r14-3b-refresh-keeps-draft.png`）。
3. 【离屏】`r14-3` 相位 `refresh-draft`：刷新只读——`notesHash()` 在刷新前后不变、`notesAddCalls()` 与 `notesReportCalls()` 增量为 0、`notesLoadCalls()` 增量恰 **1**。
4. 【离屏】`r14-3` 相位 `refresh-draft` 的续段（同一 record，不新增截图）：外部删除**编辑中的那一条** → `triggerWindowFocus()` → 等提示 → 点 `.stale-refresh` ⇒ ① 该行与 `.note-comment textarea` 均不在 DOM（行随数据消失）；② `.notes-stale` 不在 DOM；③ `.notes-notice` 为 `null`（面板零弹错）；④ **未自动保存**：`JSON.stringify(readNotes())` 不含草稿文本、该条目未被写回；⑤ **未自动丢弃**：全程无写 IPC（`notesAddCalls()` / `notesReportCalls()` 增量为 0、`notesHash()` 与“刷新只读”断言一致）。
5. 【走查】`editingCommentId` / `commentDraft` 的赋值点分计：`grep -c "editingCommentId.value = " pix/src/renderer/components/workspace/NotesPanel.vue` = **3**（`startCommentEdit` 写入、`saveComment` 成功清空、`cancelCommentEdit` 清空），载荷不因刷新改变。

**文件白名单条目**：`pix/src/renderer/components/workspace/NotesPanel.vue`（修改）。

### N88-5 失败路径（不弹错、不阻塞）

**逐字冻结**：§0.5 的「失败静默」与三种失败形态（`success === false` / 非字符串 `hash` / IPC reject）。

**验收判据**

1. 【离屏】`r14-4` 相位 `stat-failure-silent`：**置位态下**注入 `read-failed` 与 `"throw"` 两种失败后各派发一次 `focus` ⇒ `.notes-stale` 仍在（存在性与注入前一致）、`.notes-notice` 为 `null`、`.note-row` 行数不变（截图 `r14-4-stat-failure-silent.png`）；随后点 `.stale-refresh` 清位（置位态下该元素必然存在，不会出现 `clickEl` 的 `TypeError`），再注入一次失败并派发 `focus` ⇒ `.notes-stale` **不出现**（置位前失败不置位）。
2. 【烟测-主进程】组 `notes-stat` #1：无工作区根 ⇒ `success === false` + `code === "no-root"` + 逐字 `尚未选择资料库根目录` + 事实字段全零（不抛错、不建文件）。
3. 【烟测-主进程】组 `notes-stat` #2 / #7：文件不存在 / 被删除 ⇒ `success === true`、`exists === false`、`hash === ""`、`size === 0`、`mtimeMs === 0`，且**不创建** `notes.json`。
4. 【走查】失败路径无 UI 副作用：`grep -n "syncNotesFile" -A 6 pix/src/renderer/stores/notes-store.ts` 的失败分支只有 `return`（不调用 `setNotice` 之外的任何面板动作、不改 `status`、不改列表）；store 不出现 `console.warn` / `console.error`（`grep -c "console\." …notes-store.ts` 的增量 = 0）。

**文件白名单条目**：`pix/src/renderer/stores/notes-store.ts`、`pix/src/main/notes-store.ts`（均修改）；`pix/scripts/smoke-notes.mjs`（新增断言组）。

### N88-6 写操作成功后重新对标

**逐字冻结**：§0.2 第 5 条（③ 写操作成功 ⇒ capture）。

**验收判据**

1. 【离屏】`r14-4` 相位 `write-rebaseline`：外部改动后（提示在屏）执行一次删除 ⇒ 提示消失、列表回到 5→4 条且包含外部新增条目（主进程读-改-写语义把外部改动并入 → 面板与文件一致）；`readNotes().length === .note-row` 计数。
2. 【离屏】`r14-4` 相位 `inflight-guard`：`setLoadDelay(1200)` 后在途双击 `.stale-refresh` ⇒ `notesLoadCalls()` 增量恰 **1**（在途第二次点击被 `refreshing` 守卫拦下）；刷新落地后 `.notes-stale` 不在 DOM、行数 = 文件条目数。
3. 【走查】捕获点无遗漏：`applyNotes` 是唯一的写成功漏斗（`grep -c "applyNotes(" pix/src/renderer/stores/notes-store.ts` = **5**：定义 1 + 调用 4），`applyNotes` 内出现 `syncNotesFile("capture")` 恰 1 处；`recoverCorruptNotes` 成功分支同款 1 处。
4. 【走查】不引入轮询：`grep -rn "setInterval" pix/src/renderer/stores/notes-store.ts | wc -l` = **0**。

**文件白名单条目**：`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue`（均修改）。

### N88-7 零副作用与跨工作区

**逐字冻结**：检测与刷新都不得写盘；`resetNotes()` 清标记与基线；写盘纪律不变（`.pix-read` 唯一写者在主进程）。

**验收判据**

1. 【离屏】`r14-3` 相位 `detect` 与 `refresh-draft`：两个相位各自的 `notesHash()` 前后比对（检测只读、刷新只读）；`.pix-read` 顶级条目集合不变（不产生新文件）。
2. 【离屏】`r14-4` 相位 `write-rebaseline`：写操作确实改了文件（哈希变化）且面板与文件一致——对照证明「只有用户写操作会改文件」。
3. 【走查】`grep -rn "externalChange\|notes-stale" pix/src/main | wc -l` = **0**（主进程不感知提示行）；`grep -rn "\.pix-read" pix/src/renderer | wc -l` 与 R13 基线一致（渲染层不拼存储路径）。
4. 【离屏】`r14-2` 相位 `b-workspace`：B 工作区下 `.notes-stale` 不在 DOM（跨工作区不残留状态与提示）。

**文件白名单条目**：`pix/src/renderer/stores/notes-store.ts`（修改）。

---

## 3. N89 笔记组头文档跳转（3 子条）

> **取舍（本轮取「做」）**：价值 = 笔记面板的非当前文档分组头目前是死元素（只有 `title`），点它即可在阅读器打开该文档，把「笔记资产 → 源文档」接通，与 N87（树 → 笔记可见性）构成双向闭环，且完全复用既有 `openDocumentFromLibrary` 通道；代价 = 1 个事件 + 1 个处理器 + 1 个相位断言 + 1 张截图，零新 IPC、零存储改动、零依赖。若负责人在定稿时决定不做：删除本节与 §0.7、`r14-5` 场景及 1 张截图（配额降为 4 场景 / 11 条 record / 7 张截图），并把 N90-3 的场景清单同步收窄。

**用户可见行为**：把鼠标移到笔记里「别的文档」的分组头上，文档名可点（手型光标）；点一下，中间阅读区就打开那篇文档（有阅读现场时回到上次的页）；当前正在读的那篇文档的分组头点了没有任何反应。

### N89-1 点击语义与门控

**逐字冻结**：§0.7 的「可点面 / 判别用类 / 可选样式 / 当前文档组」。

**验收判据**

1. 【离屏】`r14-5` 相位 `current-noop`：当前文档组（`sample-paper.pdf`）的 `.notes-group-head` **不含** `is-openable`，其 `cursor` 不是 `pointer`；点击该组的 `.group-name` ⇒ `.center-pill .pill-label` 逐字不变（`sample-paper.pdf`）、`.page-label` 仍含 `第 1 / 3 页`、`notesHash()` 不变、`.notes-group` 顺序不变。
2. 【离屏】`r14-5` 相位 `jump-other-doc`：非当前文档组（`archive/older-paper.pdf`）的 head 含 `is-openable` 且 `cursor === "pointer"`。
3. 【走查】门控唯一：`grep -n "is-openable" pix/src/renderer/components/workspace/NotesPanel.vue` 命中 **3** 处（`:class` 绑定 1 + 两条样式）；`:title="group.docPath"` 行零 diff；`.notes-group-head` 的 DOM 子结构零变化（无新增包装元素）。

**文件白名单条目**：`pix/src/renderer/components/workspace/NotesPanel.vue`（修改）。

### N89-2 复用既有跨文档跳转通道

**逐字冻结**：§0.7 的「事件名 / 处理器 / 既有效果复用」。

**验收判据**

1. 【离屏】`r14-5` 相位 `jump-other-doc`：点击后 `waitPdfLoaded()` + `waitPage(1, 2)` 通过、`.center-pill .pill-label` 逐字 `older-paper.pdf`；分组顺序与「当前文档」chip 随之更新（DOM 首个 `.notes-group` 的 head `title` 逐字 `archive/older-paper.pdf` 且含文本 `当前文档`）。
2. 【离屏】`r14-5` 相位 `jump-other-doc`：笔记面板数据零改写（`.note-row` 仍 4 行、`notesHash()` 不变、`notesLoadCalls()` 无增量、`notesStatCalls()` 无增量——跳转不发笔记 IPC）。
3. 【走查】事件名不复用绝对路径语义：`grep -rn "open-note-doc" pix/src | wc -l` = **3**（面板 emits 声明 1 + emit 调用 1 + WorkspacePage 绑定 1）；`grep -c "open-document" pix/src/renderer/components/workspace/NotesPanel.vue` = **0**。
4. 【走查】处理器唯一且复用既有通道：`grep -n "onOpenNoteDoc" pix/src/renderer/pages/WorkspacePage.vue` 命中 **2** 处（定义 + 模板绑定），函数体恰一行调用 `openDocumentFromLibrary(absoluteDocPath(rootDir.value, docPath))`；不新增 `selectedFilePath.value =` 赋值点（`grep -c "selectedFilePath.value = " …WorkspacePage.vue` 与 R13 基线相同）。

**文件白名单条目**：`pix/src/renderer/pages/WorkspacePage.vue`、`pix/src/renderer/components/workspace/NotesPanel.vue`（均修改）。

### N89-3 边界与零外溢

**逐字冻结**：§0.7 的「边界」与 §0.9 的允许变更 ④。

**验收判据**

1. 【离屏】`r14-5` 相位 `current-noop`：点击当前组头后阅读器位置、缩放、`.notes-selection-bar` 均不变（非阻塞式零副作用）。
2. 【走查】不切标签、不折叠：`WorkspacePage.vue` 的 `onOpenNoteDoc` 体不出现 `leftTab` / `leftCollapsed` / `selectLeftTab` / `requestJump` / `requestRestore` 的**新**调用（`openDocumentFromLibrary` 内部既有调用不计）；`grep -c "onOpenNoteDoc" pix/src/renderer/components/workspace/NotesPanel.vue` = **0**（处理器只在 `WorkspacePage.vue`：定义 1 + 模板绑定 1 = 2 处，见 N89-2 #4；面板与处理器之间唯一接口 = 事件名 `open-note-doc`，`grep -rn "open-note-doc" pix/src | wc -l` = 3，见 N89-2 #3）。
3. 【离屏】既有场景 02 / 02b / 40–46 等涉及 `.notes-group-head` 的断言继续全绿（`groupHeads()` 的 `title` / `name` / `count` 三个字段逐字不变；measurement label `list-current-doc-filter-off` 的 `groupName` / `groupPath` 盒几何零变化）。

**文件白名单条目**：`pix/src/renderer/components/workspace/NotesPanel.vue`、`pix/src/renderer/pages/WorkspacePage.vue`（均修改）。

---

## 4. N90 验证面（仓库内可复跑）

### N90-1 主进程数据面烟测：就地扩展 `smoke-notes.mjs`（1 组 7 条）

**为什么扩展而不是新建 `smoke-stat.mjs`（决策与理由，评审档不得改写本决策）**

1. `statNotesFile()` 是**主进程数据面**代码，落在 `pix/src/main/notes-store.ts`；`smoke-notes.mjs` 已编译该文件并装配了本烟测所需的全部脚手架（`%TEMP%` 临时工作区 A/B、`notes.json` 真写、`sha256` 比对、`readFileSync` 真实字节、`%TEMP%` 自清理、模块实例一致性校验）。
2. 新建脚本要复制约 200 行脚手架，并新增一个 npm script ⇒ 触发 `pix/package.json` 改动（PRD §5.8 要求依赖字段零改动；本轮不新增 script）。
3. 单一事实源纪律：`notes-stat` 与 `notes.json` 的其余读取共用 `notesPaths()`；「同一次运行里既测既有读写又测指纹」更容易发现相互破坏。

**冻结的组与条数（不得减少）**：`notes-stat` **7** 条；追加在既有 7 组（44 条）之后，`main()` 调用顺序固定为 `runUndoRoundtrip → runUndoFailures → runUndoSlotLifecycle → runExportAndEmpty → runReportRender → runReportFiles → runReportFailures → runNotesStat`。

| 组 | # | 断言（失败即红） |
| --- | --- | --- |
| `notes-stat` | 1 | 无根：`libraryRoot.clearLibraryRoot()` ⇒ `success === false`、`code === "no-root"`、`error` 逐字 `尚未选择资料库根目录`、`exists === false`、`size === 0`、`mtimeMs === 0`、`hash === ""` |
| | 2 | 文件缺失：空工作区 ⇒ `success === true`、`exists === false`、`hash === ""`、`size === 0`、`mtimeMs === 0`，且 `existsSync(NOTES_A) === false`（不建文件） |
| | 3 | 正常文件：`seedReportNotes(DOC_A)` 后 ⇒ `exists === true`、`size === readFileSync(NOTES_A).length`、`mtimeMs > 0`、`hash === sha256(readFileSync(NOTES_A))`（两侧都取真实字节，期望值由烟测侧独立计算） |
| | 4 | 外部改写：用 `writeFileSync` 写一份不同内容（追加一条不同正文）⇒ `hash` 变化且逐字等于新字节的 sha256，`size` 随之变化 |
| | 5 | 只读与幂等：连续两次调用 ⇒ 两次 `hash` 相同；调用前后 `notes.json` 与 `notes.md`（若存在）的 sha256 不变；`.pix-read` 顶级条目集合不变 |
| | 6 | 不解析内容：写入非 JSON 文本（如 `not-json`）⇒ `success === true`、`exists === true`、`hash === sha256(原始字节)`（**不**返回 `corrupt` / `version-unsupported`） |
| | 7 | 删除后：`rmSync(NOTES_A)` ⇒ `success === true`、`exists === false`、`hash === ""`、`size === 0`、`mtimeMs === 0` |

**输出协议与自清理（既有约定不变）**：每组先打印 `== 组 <名> ==`，每条 `[通过] <组> #<序号> <说明>` / `[失败] <组> #<序号> <说明>：<实际值>`；末行逐字 `通过 {passed} / 失败 {failed}`；失败即退出码 1；临时目录在 `finally` 内 `rmSync(…, { recursive: true, force: true })`。

**组内前置（评审非阻塞提示 ⑤）**：`compileAndLoad()` 收尾已经 `libraryRoot.clearLibraryRoot()`（`smoke-notes.mjs:972`）⇒ 新组 #1 直接断言「无根」；**#2 起必须先 `libraryRoot.setLibraryRoot(WS_A)` 再接 `seedReportNotes` / 写夹具**，否则后续条全部落在无根态。

**验收判据**

1. 【烟测-主进程】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes` ⇒ 退出码 0、`通过 51 / 失败 0`；连续两次运行结果相同。
2. 【走查】既有 7 组 44 条零改动（`git diff` 只显示新增函数与常量、`main()` 的一行调用追加）；脚本只读仓库源文件、只写 `%TEMP%`、运行后仓库零残留。
3. 期望值一律**手写 / 独立计算**（不得用被测函数生成期望串）；每条失败信息可读（含实际值）。

**文件白名单条目**：`pix/scripts/smoke-notes.mjs`（修改）。

### N90-2 渲染层纯函数烟测：扩展 `smoke-view.mjs`（1 组 6 条）

**为什么扩展而不是新建**：`countNotesByDocument` 落在 `pix/src/renderer/utils/notes-path.ts` —— 该文件**已在** `smoke-view.mjs` 的编译面与产物校验集合内（`required` / `allowed` 无需改动）；新函数只依赖同文件的 `docPathKey` 与 `@shared/types`，不新增 import，因此扩展后编译产物集合与现有契约完全一致（新建脚本反而要再复制一份编译脚手架并新增 script）。

**冻结的组与条数（不得减少）**：`badge-counts` **6** 条；追加在既有 4 组（29 条）之后。

| 组 | # | 断言（失败即红） |
| --- | --- | --- |
| `badge-counts` | 1 | 标准 4 条夹具（p1 摘录 / p2 摘录 / p2 AI 结论 / archive p7 摘录）⇒ `size === 2`；`get("sample-paper.pdf")` 逐字段 `{ total: 3, excerpt: 2, answer: 1 }`；`get("archive/older-paper.pdf")` 逐字段 `{ total: 1, excerpt: 1, answer: 0 }` |
| | 2 | 空数组 ⇒ `size === 0`（Map 为空，不报错） |
| | 3 | 只产出 `total > 0` 的文档：5 条笔记但只覆盖 2 个文档 ⇒ `size === 2`，且未出现的文档 `get("reading-notes.md") === undefined` |
| | 4 | 比较键归一：`sample-paper.pdf` / `Sample-Paper.PDF` / `sample-paper.pdf\\` 三类写法合并为同一键，`total` 相加 |
| | 5 | 恒等式：同一文档 3 摘录 + 2 结论 ⇒ `total === 5 === excerpt + answer`，逐值断言 |
| | 6 | 输入零改动 + 每次返回新 Map：调用前后 `JSON.stringify(notes)` 逐字不变；两次调用的返回值不是同一对象，修改第一次的结果不影响第二次 |

**验收判据**

1. 【烟测-渲染】`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:view` ⇒ 退出码 0、`通过 35 / 失败 0`；既有 4 组 29 条零改动。
2. 【走查】`smoke-view.mjs` 的编译面（`files` `:428` / `required` `:446` / `allowed` `:447`）零改动（`git diff` 不显示这三处）；只新增常量、夹具、断言、**模块句柄 `notesPath` 与其 `require(join(OUT_DIR, "renderer", "utils", "notes-path.js"))`**（`compileAndLoad()` 现只 require `outline-notes.js` / `reading-context.js`，`:465-466`；`notes-path.js` 已在 `required` 内 ⇒ 不需改编译面）与 `main()` 一行调用。
3. 期望值一律**手写**（不由被测函数生成）。

**文件白名单条目**：`pix/scripts/smoke-view.mjs`（修改）。

### N90-3 离屏场景 `r14-*`（5 场景 / 5 组 / 13 条 record / 8 张截图）

**stub 契约（`ui-shot.mjs`）**

| 项 | 冻结 |
| --- | --- |
| `notesStat()` | 真读真算：按 `currentNotesFile()`（= `<activeRoot>/.pix-read/notes.json`）取真实字节，返回 `{ success: true, exists, size, mtimeMs, hash }`（`hash` = 原始字节的 sha256；文件缺失 ⇒ `exists: false`、`size/mtimeMs` 为 0、`hash: ""`）；调用进入即计数（`notesStatCalls()`）；**不解析内容**（损坏文件照常返回真实字节的哈希）；失败注入见下 |
| 笔记文件根 | **修正**：stub 的 `readNotesFile` / `writeNotesFile` / `notesLoad` 改用 `currentNotesFile()`（随 `activeRoot`，与 `stateFilePath()` 同纪律）——`r14-2` 的跨工作区断言必须让 B 侧读到 B 的文件，否则「B 无徽标」不可判定；A 侧行为与今天逐字等价（`activeRoot` 初值 = `CONFIG.root`）；`isInsideNotesRoot` / `relativeDocPath` / `notesExport` / `notesExportReport` / `notesReset` 仍锚 A 根（既有简化，本轮只登记不改 ⇒ B 侧写操作仍判 `outside`，本轮无场景触发） |
| 控制口 | `__pixStub.notesStatCalls()` ⇒ `{ count }`；`__pixStub.setNotesStatFailure(code)`：`null` 复位，错误码 ⇒ `{ success: false, exists: false, size: 0, mtimeMs: 0, hash: "", code, error: NOTES_ERRORS[code] \|\| code }`，`"throw"` ⇒ 抛出异常（覆盖 IPC reject 路径） |
| 焦点派发 | 新 helper `triggerWindowFocus()` = `js('window.dispatchEvent(new Event("focus")), true')`（面板监听的正是 `window` 的 `focus` 事件） |
| 新 helper（命名自由、语义冻结） | `badgeProbe(rowExpr)`（行标记联读：`.row-notes` 的 `textContent` / `title` / 矩形 / `scrollWidth` / `clientWidth`，`.row-progress` 文本 / 矩形，`.row-label` 的 `scrollWidth/clientWidth`，行 `scroll/ClientWidth`，DOM 顺序）、`staleProbe()`（提示行存在性 / `.stale-text` / `.stale-refresh` 文本与 title / 与 notice、undo 的相对位置）、`appendExternalNote(note)`（Node 侧读-改-写 A 的 `notes.json`，用于模拟外部改动）、`removeExternalNote(id)`（Node 侧读-改-写 A 的 `notes.json` 删掉指定 id，用于「外部删除编辑中的那一条」）。**徽标文本类判据一律取 `textContent`**（§0.3 的压缩态不影响它；面板打开时树由 `v-show` 隐藏、几何为 0） |
| 外部改动夹具（逐字） | **三条**，均与标准种子不重名、正文不重复：① `n-external-1` = `{ id: "n-external-1", kind: "excerpt", docPath: "archive/older-paper.pdf", page: 1, text: "External edit: this note was appended outside the app.", comment: "", createdAt: <now>, updatedAt: <now> }`（r14-3 前置、r14-4 `write-rebaseline`）；② `n-external-2` 同形，`docPath: "reading-notes.md"`、`page: 1`、`id: "n-external-2"`（r14-3 `detect`、r14-4 `inflight-guard`）；③ `n-external-3` 同形，`docPath: "sample-paper.pdf"`、`page: 1`、`id: "n-external-3"`（r14-4 `stat-failure-silent` 造置位态） |
| 场景挂载点 | `runReaderStateScenarios` 末尾（R13 块 `r13-5` 的 `restoreStandardSeed()` 之后、函数收口 `}` 之前）；每个场景自带复位并以其自己的 `restoreStandardSeed()` 收尾 |
| 既有面 | `SEL` 只**追加** 6 项；既有场景 / 截图 / label / helper 零删除零改写；新增 5 种 label（`46 → 51`） |

**场景 `r14-1`（组 `r14-tree-badge`，3 条 record，2 张截图）**

前置：`goHome()` → `clearStateA()` → `writeState(STATE_FILE_A, { version: 1, lastDocPath: "sample-paper.pdf", documents: { "sample-paper.pdf": entry(2, 1), "archive/older-paper.pdf": entry(1024, 1.1) } })` → `enterWorkspace(LIBRARY_NAME)` → `waitTreeRows(5)` → `js(seedNotes(...))` → `openNotesPanel(4)` → `backToLibraryTab()`。（阅读现场与既有场景 21 同款：`sample` 行余量 34px、`older` 行余量 14px ⇒ 本场景同时覆盖「完整」与「压缩」两种徽标形态。）

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `badges` | 等 `document.querySelectorAll(".row-notes").length === 2` → 读 `badgeProbe` × 3 行（sample-paper.pdf / archive/older-paper.pdf / reading-notes.md）→ 截图 `r14-1-tree-notes-badge.png`（`rectOfSelector(SEL.layoutLeft)`） | ① sample 行 `.row-notes` 的 `textContent` 逐字 `3 条`、title 逐字 `摘录 2 条 · AI 结论 1 条`，且**未被压缩**（`notesScrollWidth ≤ notesClientWidth + 1`）；② older 行 `textContent` 逐字 `1 条`、title 逐字 `摘录 1 条 · AI 结论 0 条`，且**压缩态符合 §0.3**（`notesClientWidth` = 10 ± 1 且 > 数字宽、`notes.left ≥ label.right`、不出现空胶囊）；③ reading-notes.md / long-book.pdf / archive 三行 `.row-notes` 计数 0（且进度徽标计数 0，防空）；④ 两行的 `.row-progress` 文本逐字 `第 2 页` / `第 1024 页`、各自贴行右缘，且每行的 `.row-notes` 与 `.row-progress` 不重叠、DOM 顺序 label → notes → progress；⑤ 三行 `rowScrollWidth ≤ rowClientWidth` 且 label 未截断（既有 `overflowFree` 同口径） | `{ phase, sample, older, notesRow, archiveRow }` |
| `live` | `openNotesPanel(4)` → `deleteRowByText("Table 2 repo")` → 读 sample 行徽标 → `clickUndo()` → 等徽标回 `3 条` → `setSearch("Reproducibility")` → 读 `.notes-count` / `.group-count` / sample 行 `.row-notes` → `setSearch("")` | ⑥ 删除后 sample 行 `2 条` / title `摘录 1 条 · AI 结论 1 条`；⑦ 撤销后回到 `3 条` / `摘录 2 条 · AI 结论 1 条`；⑧ 全程 `.note-row` 行数按删除/撤销在 4/3/4 之间变化（列表真实变化，徽标不是空断言）；⑨ 过滤态口径（N87-2 #7）：搜索串只命中 older 那条 ⇒ `sample-paper.pdf` 分组不再渲染（或 `.group-count` 归零），而该行 `.row-notes` 的 `textContent` 仍逐字 `3 条` ⇒ 徽标 = 全量、不跟过滤走；清空搜索后面板复原 | `{ phase, afterDelete, afterUndo, rows, filteredCount, badgeUnderFilter }` |
| `narrow` | `backToLibraryTab()` → `document.documentElement.style.setProperty("--pix-left-width", "220px")` → `repaint` → 读 `badgeProbe(sample)` 与 `.layout-left` 宽 → 截图 `r14-1b-tree-badges-narrow.png`（左栏）→ `removeProperty("--pix-left-width")` → `repaint` | ⑨ `.layout-left` 宽在 218–222（空断言防护）；⑩ `.row-progress` 的文本与矩形与默认宽度读数一致（不在 §0.9 白名单内的变化即红）；⑪ 行 `scrollWidth ≤ clientWidth + 1`（窄栏下先由徽标让位）；`.row-notes` 允许被压到 0 宽（不可见）或仅剩数字 ⇒ **只登记** `notesClientWidth` / `notesScrollWidth`，**不作**「文本完整」断言；`.row-label` 的截断深度不超过 R13 读数 + 4px | `{ phase, leftWidth, row, notesBadge, progressBadge }` |

**场景 `r14-2`（组 `r14-tree-badge-scope`，2 条 record，1 张截图）**

前置：`restoreStandardSeed()`（A 侧 4 条）→ 记录 `notesLoadCalls()` 与 `.row-notes` 基线。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `b-workspace` | `goHome()` → `enterWorkspace(LIBRARY_B_NAME)` → `waitTreeRows(1)` → `openNotesPanel(0)`（B 无笔记 ⇒ 等 `.notes-empty`）→ 读树行与调用计数 → 截图 `r14-2-tree-badge-workspace-b.png`（左栏） | ① `notesLoadCalls()` 相对进入 B 前有增量（进入工作区即读盘）；② B 树 `.row-notes` 计数 **0**（防空：B 侧至少有 1 行 `sample-paper.pdf`）；③ `.notes-empty` 在场（B 的笔记列表为空 ⇒ 断言不是「未加载」的假绿）；④ `.notes-stale` 不在 DOM | `{ phase, loadDelta, rows, badgeCount, emptyShown }` |
| `back-to-a` | `goHome()` → `enterWorkspace(LIBRARY_NAME)` → `waitTreeRows(5)` → 等 `.row-notes` 计数 2 → 读 sample / older 行徽标 | ⑤ 切回 A 后 sample 行 `3 条`、older 行 `1 条`（跨工作区不残留、回切可恢复） | `{ phase, sample, older }` |

**场景 `r14-3`（组 `r14-notes-stale`，3 条 record，3 张截图）**

前置（Node 侧，在进入工作区前完成）：`goHome()` → `clearStateA()` → 把 A 的 `notes.json` 写成「标准种子 + `n-external-1`」（5 条）→ `enterWorkspace(LIBRARY_NAME)` → `waitTreeRows(5)`。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `enter-fresh` | `openNotesPanel(5)` → 读行数 / 徽标 / 提示行 | ① `.note-row` 恰 5 行且外部新增正文可见（进入工作区与打开面板都读盘）；② `.notes-stale` **不在 DOM**；③ 树徽标与文件一致：older 行 `2 条`、sample 行 `3 条` | `{ phase, rows, stale, sample, older }` |
| `detect` | 记录 `notesHash()` → `appendExternalNote(n-external-2)` → `triggerWindowFocus()` → 等 `.notes-stale` → 读 `staleProbe` / 行数 / 计数 / 复选框交互 → `sleep(4500)` 复查提示仍在 → 截图 `r14-3-stale-row.png`（左栏） | ④ `.stale-text` 逐字 `笔记文件已被外部修改，面板内容可能过期`、`.stale-refresh` 文本逐字 `刷新`、title 逐字 `重新读取笔记文件`；⑤ DOM 顺序 notice → stale → undo；⑥ `.note-row` 仍 5 行、`.notes-count` 逐字 `共 5 条`（检测不改列表/计数）；⑦ `notesHash()` 与检测前相同（只读）；⑧ 提示存在期间勾选第 1 行复选框仍生效（`.notes-selection-count` 出现，随后清空）；⑨ 4.5s 后 `.notes-stale` 仍在（不自动消失，与 4s 瞬时提示形成对照） | `{ phase, stale, rows, countText, hashSame, selectable, stillAfterWait }` |
| `refresh-draft` | 点第 1 行 `.comment-trigger` → 写入草稿 `刷新不应丢弃这段草稿` → 点 `.stale-refresh` → 等 `.notes-stale` 消失且 `.note-row` 命中 6 → 读 textarea / 行数 / 徽标 / 哈希 / 调用计数 → 截图 `r14-3b-refresh-keeps-draft.png`（左栏）+ `r14-3c-refresh-list-synced.png`（左栏）→ **续段**：用 `removeExternalNote(<编辑中的那一条 id>)` 从 `notes.json` 外部删除该条 → `triggerWindowFocus()` → 等 `.notes-stale` → 点 `.stale-refresh` → 复读行数 / textarea / 提示 / 哈希 | ⑩ `.notes-stale` 不在 DOM（提示消失）；⑪ textarea 仍在 DOM 且 `value` 逐字 `刷新不应丢弃这段草稿`、`.comment-actions` 的保存/取消按钮仍在（草稿与编辑态未被触碰）；⑫ 面板与文件一致：`.note-row` 6 行且 `readNotes().length === 6`；⑬ 徽标同步（一律取 `textContent`）：reading-notes.md 行出现 `1 条`、older 行 `2 条`、sample 行 `3 条`；⑭ 刷新只读：`notesHash()` 不变、`notesLoadCalls()` 增量恰 1、`notesAddCalls()` / `notesReportCalls()` 增量 0；**续段**：⑮ 被删条目行与 textarea 均不在 DOM、`.note-row` 5 行；⑯ `.notes-stale` 不在 DOM、`.notes-notice` 为 `null`、`JSON.stringify(readNotes())` 不含草稿文本（未自动保存） | `{ phase, stale, draft, draftKept, rows, fileRows, badges, hashSame, loadDelta, writeDelta, removedRowGone, removedNotice, draftNotSaved }` |

**场景 `r14-4`（组 `r14-notes-stale-failure`，3 条 record，1 张截图）**

前置：`restoreStandardSeed()`（A 侧 4 条、面板 4 行、阅读器停在 `sample-paper.pdf` 第 1 页）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `write-rebaseline` | `appendExternalNote(n-external-1)` → `triggerWindowFocus()` → 等 `.notes-stale`（防空）→ `deleteRowByText("Table 2 repo")` → 等提示消失 | ① 外部改动后提示出现（检测生效，防空断言）；② 删除成功后 `.notes-stale` 不在 DOM（写操作成功即重新对标）；③ 面板行数 = `readNotes().length`（= 4）且外部新增正文可见（不丢外部改动）；④ `notesHash()` 与改动前不同（真实写盘） | `{ phase, staleBefore, staleAfter, rows, fileRows, externalVisible, hashChanged }` |
| `stat-failure-silent` | `appendExternalNote(n-external-3)` → `triggerWindowFocus()` → 等 `.notes-stale`（防空：置位态成立）→ 读提示基线 → `setNotesStatFailure("read-failed")` → `triggerWindowFocus()` → `sleep(400)` → 复核（提示仍在、`.notes-notice === null`、行数不变）→ `setNotesStatFailure("throw")` → `triggerWindowFocus()` → `sleep(400)` → 复核同上 → 截图 `r14-4-stat-failure-silent.png`（左栏）→ 点 `.stale-refresh`（置位态下必然存在）→ 等提示消失 → `setNotesStatFailure("read-failed")` → `triggerWindowFocus()` → `sleep(400)` → 复核（提示**不出现**）→ `setNotesStatFailure(null)` | ⑤ 已置位时失败 ⇒ 提示仍在那（失败不清除）；⑥ 失败期间 `.notes-notice` 为 `null`、`.note-row` 行数不变；⑦ 置位前失败 ⇒ 提示**不出现**（失败不置位）；⑧ 失败注入后 `notesStatCalls()` 有增量（确有真实调用，不是空跑）；⑨ 点 `.stale-refresh` 后提示消失（相位内的点击发生在置位态，不会触发 `clickEl` 的 `TypeError`） | `{ phase, staleWhileFailed, notice, rows, staleAfterClear, statDelta }` |
| `inflight-guard` | `setLoadDelay(1200)` → `appendExternalNote(n-external-2)` → `triggerWindowFocus()` → 等提示 → 同一同步段内双击 `.stale-refresh` → 读 `notesLoadCalls()` → 等提示消失 → `setLoadDelay(0)` | ⑨ 在途双击后 `notesLoadCalls()` 增量恰 **1**（`refreshing` 守卫拦下第二次）；⑩ 刷新落地后 `.notes-stale` 不在 DOM、`.note-row` 行数 = `readNotes().length` | `{ phase, loadDelta, staleAfter, rows, fileRows }` |

**场景 `r14-5`（组 `r14-group-jump`，2 条 record，1 张截图）**

前置：`enterNotesProbe()`（`sample-paper.pdf` 第 1 页 + 面板 4 行）。

| 相位 | 步骤 | 失败即红的断言 | `data` 字段 |
| --- | --- | --- | --- |
| `current-noop` | 读当前组头（首 `.notes-group`）：`is-openable` / `cursor` / `title` → 点其 `.group-name` → 复读文档名、页码、分组顺序、`notesHash()` | ① 当前组头不含 `is-openable`、`cursor !== "pointer"`、head `title` 不被改写（逐字 `sample-paper.pdf`）；② 点击后 `.center-pill .pill-label` 不变（`sample-paper.pdf`）、`.page-label` 仍含 `第 1 / 3 页`、`.notes-group` 顺序不变、`notesHash()` 不变 | `{ phase, openable, cursor, title, pillLabel, pageLabel, hashSame }` |
| `jump-other-doc` | 读 older 组头（含 `is-openable` / `cursor`）→ 点其 `.group-name` → `waitPdfLoaded()` → `waitPage(1, 2)` → 读文档名 / 分组顺序 / 行数 / 调用计数 → 截图 `r14-5-group-jump.png`（整窗） | ③ 非当前组头 `is-openable` 在场且 `cursor === "pointer"`；④ `.center-pill .pill-label` 逐字 `older-paper.pdf`、`.page-label` 含 `第 1 / 2 页`；⑤ 分组随当前文档重排：DOM 首个 `.notes-group` 的 head `title` 逐字 `archive/older-paper.pdf` 且含文本 `当前文档`；⑥ 笔记数据零改写：`.note-row` 仍 4 行、`notesHash()` 不变、`notesLoadCalls()` / `notesStatCalls()` 无增量 | `{ phase, openable, cursor, pillLabel, pageLabel, firstGroup, rows, hashSame, loadDelta, statDelta }` |

**场景末**：每个场景以自己的 `restoreStandardSeed()` 收尾（与 R11/R12/R13 同纪律）。

**验收判据**

1. 【离屏】5 组 record 全绿、8 张截图齐备（少一张即红）；两类新 label 计数与 §0.8 逐字一致。
2. 【走查】既有场景函数体零改动（`git diff` 只显示：stub 的两处修正与三个新控制口、`SEL` 6 项、新 helper、`r14-1`…`r14-5`、`writeFixtures()`（如需）的一行）；既有 135 张截图 / 198 条测量 / 46 种 label 零缺失。
3. 【离屏】新增截图的矩形取法与 R13 一致（整窗无 rect、左栏用 `rectOfSelector(SEL.layoutLeft)`）。

### N90-4 基线与零缺失

动工前先跑基线（新目录 `pix-v05-r14-base`）→ 开发后跑验收（另一目录）；判据见 §0.9（135 张 / 198 条 / 46 种 label 零缺失、新增 8 张 / 13 条齐备、退出码 0、`failure === null`、允许的位移逐项登记）。

**验收判据**

1. 【离屏】基线目录与验收目录各自的 `MANIFEST.json` / `MEASUREMENTS.json` 读数按 §0.9 逐项比对（`missingShots = []`、`missingLabels = []`）；新 label `r14-*` 5 种、新增测量 13 条。
2. 【离屏】既有对树行最有判别力的场景（21 / 21b / 24）与面板既有场景（02 / 11 / 40–46 / 52 / 60–65 / r11 / r12 / r13）全部继续通过。
3. 【走查】任何非预期差异（尤其 §0.9 白名单外的位移与样式）必须在 dev 档逐项登记（改哪一项、为什么、基线读数与改后读数）。

### N90-5 工程门与零残留

**验收判据**

1. 【check】`CHECK_EXIT=0`（无 `any`、无内联动态 import、全部顶层 import；新增函数/类型全链路必填）。
2. 【走查】`pix/package.json` **零 diff**（沿用既有 `smoke:notes` / `smoke:view`）；`package-lock.json`、`pix/build/**`、`packages/**`、electron-builder 配置零 diff；`pix/src/renderer/assets/styles/variables.css` 零 diff。
3. 【走查】`git status --short` 只出现 §6 白名单内的文件（新建的 `docs/pm/R14-*.md` 与修改的源码/脚本）。
4. 【走查】仓库内无临时脚本、无临时产物、无调试日志（PRD §5.10）；`ui-shot.mjs` 的结束自检（截图集合与清单双向相等 + 白名单外条目即失败）继续生效；`smoke-*.mjs` 运行后 `%TEMP%` 自建目录被删除。

---

## 5. 反需求（本轮明确不做）

1. **不做自动同步 / 自动刷新**：检测只允许置 / 清 `externalChange` 一个布尔标记，**不得**自动改写 `notes` 列表、不得自动保存或丢弃草稿、不得自动关闭编辑框；唯一会重载列表的路径是用户显式点 `.stale-refresh`（以及既有的「切工作区 / 打开面板 / 重试」读盘时机）。（登记为**允许**的例外：用户自己的写操作成功后重新对标 ⇒ 面板与文件一致 ⇒ 提示消失；这不是自动同步，而是「写成功即已一致」的直接后果。）
2. **不做文件监听守护进程**：不使用 `fs.watch` / `fs.watchFile` / `chokidar` / 任何轮询定时器；检测只在 §0.4 的四个时机发生。
3. **不做跨工作区聚合**：徽标只统计当前工作区（当前资料库根）的笔记；不显示其它库的计数、不做合并视图、不做「全部资料库」入口。
4. **不做笔记云同步 / 多设备 / 冲突合并 UI**：不引入远端、不做三向合并、不做「保留两份」策略。
5. **不改 `notes.json`**：不新增字段、不改 `version`、不改 `serializeNotes` 的字节、不改原子写协议、不在检测/刷新时写事实源（逐字节不变）。
6. **不改既有导出与报告**：`notes.md` 模板与文案、`导出 Markdown`、报告通道与模板、`.notes-report-*` 字面全部零改动；不新增第二个导出/报告入口。
7. **不引入依赖、不改 lockfile、不改 `packages/**`、不改 electron-builder 配置、不改 `pix/package.json`**。
8. **不做树内编辑**：树上不加右键菜单、不加新增/删除/编辑笔记的入口、不做拖拽；树上只有徽标（读），笔记的写操作仍在笔记面板。
9. **不做第二个外部改动入口**：不加菜单项 / 快捷键 / 托盘提示 / 状态栏图标；检测结果**只**在笔记面板顶部呈现（不上树、不进聊天、不写会话）。
10. **不做树徽标的主进程支持**：不为 N87 新增 IPC、不新增主进程读取通道（`notes-stat` 只为 N88 服务）。
11. **不做提示行的关闭按钮与自动消失**：提示不自动消失、无关闭按钮（唯一消失路径 = 刷新成功 / 写操作成功重新对标），避免「用户以为看过了就已经同步」。
12. **不删除、不重命名、不改写既有离屏场景与截图**（PRD §5.7）：既有 135 张 / 198 条 / 46 种 label 零缺失，只允许追加。
13. **不给树徽标加动画 / 过渡 / 主题变量**：不新增 `--pix-*` 变量，不加过渡动画，不加图标（保持纯文本小徽标）。

---

## 6. 文件白名单（逐文件 + 改动点）

| # | 文件 | 动作 | 对应需求 | 改动点（不得越界） |
| --- | --- | --- | --- | --- |
| 1 | `pix/src/renderer/utils/notes-path.ts` | 修改 | N87-2 | 新增纯函数 `countNotesByDocument(notes): Map<string, NotesBadgeCount>` 与接口 `NotesBadgeCount`（单次遍历、键 = `docPathKey`、只产出 > 0 的文档、每次返回新 Map）；既有 `docPathKey` / `currentDocKey` / `docDisplayName` / `absoluteDocPath` / `rangeContains` / `matchesChapterFilter` / `groupNotesByDocument` / `sortNotesForContext` **零改动** |
| 2 | `pix/src/renderer/components/workspace/LibraryPanel.vue` | 修改 | N87-1…N87-6 | 新增：`useNotesStore` 引入、`noteCountMap`（`computed`）、每行的徽标取数（一次 `Map.get`）、模板 `.row-notes`（位次 = `.row-label` 之后、`.row-progress` 之前）、`.row-notes` 样式（§0.3 盒模型：**行内唯一可收缩项**、无背景/无水平内边距、数字优先的右端硬裁切）；`progressMap` / `rows` / `flattenVisible` / `reload` / `toggle` / `iconFor` / `chevronFor` / `isSelected` / 模板既有节点与其 CSS（含 `.row-label` / `.row-progress` 的 flex 行为）**零改动** |
| 3 | `pix/src/shared/types.ts` | 修改 | N88-1 | 新增 `ReaderNotesStatResult`（§0.5，落点在 `ReaderNotesLoadResult` 之后）；`ReaderNotesErrorCode` 不扩（仍 11 键）；既有类型零改动 |
| 4 | `pix/src/main/notes-store.ts` | 修改 | N88-1 / N88-5 | 新增导出 `statNotesFile(): ReaderNotesStatResult`（只读、不解析、不建文件、不抛错）与 import 追加 `createHash`（`node:crypto`）、`statSync`（`node:fs`）；复用 `notesPaths()` / `isEnoent` / `ERROR_MESSAGES`；既有写盘函数与渲染函数零改动 |
| 5 | `pix/src/main/ipc-handlers.ts` | 修改 | N88-1 | 新增 1 个无入参 handler `ipcMain.handle("notes-stat", () => statNotesFile())`（落点：`notes-export-report` 之后）；import 追加 `statNotesFile`；既有 8 个笔记 handler 与其他 handler 零改动 |
| 6 | `pix/src/main/preload.ts` | 修改 | N88-1 | `PixApi` 接口与 `api` 对象各新增 1 处 `notesStat`；改后各 42 方法；既有 41 个方法零改动 |
| 7 | `pix/src/renderer/stores/notes-store.ts` | 修改 | N88-2 / N88-5 / N88-6 / N88-7 | 新增 `externalChange`（ref，暴露）、`checkNotesFile()`（暴露）、内部 `syncNotesFile(mode)` / `notesFileSeq` / `notesFingerprint`；`loadNotes()` 成功分支、`applyNotes()`、`recoverCorruptNotes()` 成功分支各追加 1 处 `void syncNotesFile("capture")`；`resetNotes()` 追加序号递增 / 基线置空 / 标记清零；既有动作与竞态令牌语义零改动；不拼存储路径、不写盘 |
| 8 | `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | N88-2…N88-4（+N89-1） | 新增：`.notes-stale` 行（`.stale-text` / `.stale-refresh`）与样式、`refreshing` 状态、`onRefreshNotes()`、`onWindowFocus()` 与 `onMounted` 注册（`onBeforeUnmount` 成对注销）、`onGroupOpen(group)` 与 `is-openable` 类与两条样式、`defineEmits` 增 `open-note-doc`；既有模板块顺序（notice → undo → export → report）、既有文案、`startCommentEdit` / `saveComment` / `onUndoClick` / `onExport` / `onExportReport` 语义零改动 |
| 9 | `pix/src/renderer/pages/WorkspacePage.vue` | 修改 | N89-2 | 新增 `onOpenNoteDoc(docPath)`（一行 `openDocumentFromLibrary(absoluteDocPath(rootDir.value, docPath))`）与 NotesPanel 的 `@open-note-doc` 绑定；`onOpenNote` / `openDocumentFromLibrary` / `selectLeftTab` / `onOpenDocument` 绑定零改动 |
| 10 | `pix/scripts/smoke-notes.mjs` | 修改 | N90-1 | 新增 1 组 7 条（`notes-stat`）与所需常量/helper；`main()` 追加一行调用；既有 7 组 44 条与输出协议零改动 |
| 11 | `pix/scripts/smoke-view.mjs` | 修改 | N90-2 | 新增 1 组 6 条（`badge-counts`）与夹具、**模块句柄 `notesPath` 与 `notes-path.js` 的 `require`**（`compileAndLoad()` 内；`required` `:446` 已含该产物 ⇒ 无需改编译面）；`main()` 追加一行调用；编译面（`files` `:428` / `required` `:446` / `allowed` `:447`）与既有 4 组 29 条零改动 |
| 12 | `pix/scripts/ui-shot.mjs` | 修改 | N90-3 | stub：`notesStat`（真读真算）+ `currentNotesFile()`（笔记根随 `activeRoot`，`readNotesFile` / `writeNotesFile` / `notesLoad` 改用它）+ 控制口 `notesStatCalls()` / `setNotesStatFailure(code)`；`SEL` 追加 6 项；新增 helper（`triggerWindowFocus` / `badgeProbe` / `staleProbe` / `appendExternalNote` / `removeExternalNote`）与 `r14-1`…`r14-5`（5 组 13 条 record、8 张截图）；既有场景 / 截图 / label / SEL / helper 零改动、零删除 |
| 13 | `pix/package.json` | **不改**（登记为不动） | N90-1 / N90-2 | 烟测就地扩展两个既有脚本，因此不新增 script；依赖字段与 lockfile 零改动（PRD §5.8） |
| 14 | `docs/pm/R14-*.md` | 新建 | — | 本档（`R14-req.md`）与后续 `R14-design.md` / `R14-review.md` / `R14-dev.md` |

**范围外（任何情况下不动）**：`packages/**`、`package-lock.json`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/src/renderer/assets/styles/**`（含 `variables.css`）、`pix/src/renderer/utils/{outline-notes.ts,notes-view.ts,reading-context.ts}`、`pix/src/renderer/components/workspace/{ReaderPanel,PdfViewer,KnowledgeMap,ChatPanel,PdfSearchPanel,PdfSelectionQuickAsk}.vue`、`pix/src/renderer/stores/{reader-store,reader-state-store,project-store,chat-store}.ts`、`pix/src/main/{library-root,reader-state-store,session-bridge,reading-prompt}.ts`、`pix/resources/**`、`docs/pm/**` 的历史档件、`.gitignore`、`README.md`。

---

## 7. 风险 Top3 与判定方式

**R1「徽标计数与面板 / 文件不一致（口径漂移）」** —— 最容易出错的是把 `answer` 漏计（用「摘录数」冒充「笔记数」）、滑到第二套文档归属判定（绝对路径 vs 相对比较键大小写）、或让懒加载 / 未展开子目录的笔记丢失；跨工作区若不清基线还会把 A 的计数画到 B 的同名文件上。

- 判定：烟测-渲染 `badge-counts` #1/#3/#4/#5（逐字段计数、只产出 >0、比较键归一、恒等式）；离屏 `r14-1` 相位 `badges`（两行文本与 tooltip 逐字）、相位 `live`（删除/撤销联动）、`r14-2`（B 侧 0 徽标 + 回切恢复）、`r14-3` 相位 `refresh-draft`（外部新增后刷新 ⇒ 徽标同步）。
- 失败信号：`sample-paper.pdf` 显示 `2 条`（漏计 answer）；B 工作区出现 A 的计数；0 笔记行出现徽标；tooltip 缺少 `AI 结论 0 条` 段。

**R2「外部改动检测误报 / 漏报 / 阻塞」** —— 自己写盘后基线未更新 ⇒ 误报；焦点检测忘记派发或只比对 mtime ⇒ 漏报；失败路径弹错 / 写日志 / 清掉已置位状态 ⇒ 阻塞；刷新时顺手把列表或草稿重置 ⇒ 违背「绝不静默覆盖」。

- 判定：离屏 `r14-3` 相位 `enter-fresh`（不误报）、`detect`（漏报反例：提示必须出现且列表不动）、`refresh-draft`（草稿保留 + 只读刷新 + 提示消失）、`r14-4` 相位 `write-rebaseline`（写后不误报）、`stat-failure-silent`（失败保持现状且无提示无弹错）、`inflight-guard`（在途只发一次 IPC）；烟测-主进程 `notes-stat` #1/#5/#6（只读、幂等、不解析内容）。
- 失败信号：写操作成功后仍显示提示；4 个时机中任一漏检；失败注入后出现 `.notes-notice`；刷新后 textarea 消失或草稿被清；检测改动 `notes.json` 字节。

**R3「新 UI 挤动既有版面」** —— 树行的第二枚标记会吃掉行内余量（实测：`sample-paper.pdf` 34px / `archive/older-paper.pdf` 14px，见事实基线表），一旦 `.row-notes` 可以反向挤动 `.row-label`，就会让 label 截断、连带把既有 `tree-progress` 的 `overflowFree` 判据打红（本轮口径 = 「徽标独占收缩、既有元素零位移」，见 §0.3 的压缩行与 §0.9 硬约束）；面板新提示行插错位置会破坏既有 DOM 顺序断言。

- 判定：离屏 `r14-1` 相位 `badges` 的 ⑤ 与相位 `narrow` 的 ⑩⑪；既有场景 21 / 21b / 24 零缺失通过；走查 `.row-progress` 零 diff 与 `margin-left: auto` 仍只出现 1 次；`r14-3` 的 DOM 顺序断言（notice → stale → undo）；§0.9 的允许位移白名单逐项登记。
- 失败信号：`.row-label` 出现省略号（默认宽度下）；`.row-progress` 的 x/y 变化；`.row-notes` 出现空胶囊、`text-overflow` 省略号或被反向挤到 0 宽以外的异常（窄栏可压到 0）；`.notes-stale` 出现在 `.notes-notice` 之前或 `.notes-undo` 之后；既有 measurement 的 `groupName` / `groupPath` 几何变化。

**次级风险（不占 Top3）**：① stub 的笔记根改为随 `activeRoot` 后，A 侧行为必须与今天逐字等价（`activeRoot` 初值 = `CONFIG.root`），差异只能在 B 侧显现 —— dev 阶段必须实跑既有 135 张截图确认零缺失；② `.notes-stale` 与 4s 瞬时 `.notes-notice` 可能同屏（既有提示未过期时触发检测）—— 两者语义不同、都非阻塞，`r14-3` 只断言 stale 不被 notice 挤出（顺序），不断言互斥；③ `notes-stat` 每次焦点都整读并哈希文件，超大 `notes.json` 会有一次同步读 —— 焦点事件频率低、文件规模受既有 `addNote` 语义约束，本轮不做节流（如后续需要，另立需求）；④ 组头点击与既有 `.notes-group-head` 的 `title` 提示共存 —— 点击不改变 title（零 diff），hover 提示仍是 `group.docPath`。

---

## 8. 开放问题（需负责人确认，不阻塞本档定稿）

1. **徽标文案**：本档冻结为 `{N} 条`（如 `3 条`）——§0 的 M1 已定稿为「文案形态不变，紧行按右端硬裁切、数字优先」。若要求更短（纯数字 `3`）或更长（`笔记 3`），需同步改 §0.3、§0.8、`r14-1` 的文本断言与 `.row-notes` 盒模型（并重算 N87-4 的余量判据）；若改判为评审 MF-1 的选项 ②（接受 label 省略号），则需同时改 §0.9 硬约束、N87-1 / N87-4 与既有 `tree-progress` 断言，并重跑基线。
2. **tooltip 的分列为 0 时是否省略**：本档冻结为「两段恒给」（`摘录 1 条 · AI 结论 0 条`）。若要省略 0 段，需改 §0.3 与 `r14-1` 的 title 断言。
3. **提示行是否给「关闭」按钮**：本档冻结为**不给**（唯一消失路径 = 刷新成功 / 写操作成功重新对标），理由是避免「看过了就当同步了」。若要加关闭按钮，需补一条断言（关闭后再次检测到不一致仍能重新出现）。
4. **检测失败是否留痕**：本档冻结为**完全静默**（不日志、不提示）。若希望按 `reader-state` 先例留一行 `console.warn`，需同时新增一条「warn 增量恰 1」的离屏断言。
5. **新 IPC 是否只回 mtime+size（更省）**：本档冻结为含 `hash`（sha256 原始字节），理由是跨平台确定性与可复现断言（mtime 粒度/时区差异会引入假绿）。若改为 mtime 口径，需重写 §0.5 与 `notes-stat` 的一半断言。
6. **N89 的点击面强度**：本档冻结为「组头整块可点 + `is-openable` 手型光标 + hover 变色」；若希望更显式（图标 / 下划线 / 独立按钮），需重列 §0.7 与 `r14-5` 的断言（并重新评估 §0.9 的组头几何零变化约束）。
7. **新增配额**（8 张截图 / 13 条 record / 2 个烟测组 13 条）是否超出本轮容量：如需压缩，优先保留 `r14-1`（徽标字面与更新时机）、`r14-3`（检测与刷新）、`r14-2`（跨工作区）；`r14-4` 的三个相位可各合并为 1 条 record（合并后仍**不得**删除「写后不误报」「失败保持现状」「在途只发一次」三项判据）；若放弃 N89，则整体减 1 场景 / 2 条 / 1 张截图。
