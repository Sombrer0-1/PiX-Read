# PiX-Read R10 需求档 · 规模可用（N63–N72）

> 上游：`docs/pm/PRD-V0.4.md` §2（R10 = 规模可用：笔记搜索、排序、撤销删除、单条复制）、§7.5（成功判据：笔记到几十条时仍能检索、排序、撤销误删、单条复制）、§4（版本级反需求：不引依赖、不自动写笔记、不做全文索引服务、不做静默注入）。
> 依赖：R7（`kind = excerpt | answer`）、R8（选择集、条数上限、注入链路）、R9（章节过滤、计数文案两态、空态两分支）。
> 本轮唯一主线：**让笔记面板在几十条规模下仍然可用** —— 面板内即时搜索、组内排序切换、删除后 5 秒内真实反写的撤销、单条复制为 Markdown；三个过滤维度（搜索 / 章节 / 仅看当前文档）组合语义写死为 AND，且每个维度都在面板上可见。
> 判定工具（本档所有验收只能由这五种证据判定，逐条已标注）：
> - 【走查】代码审查：只读文件内容与 `git diff` / `git status` / `git show`（只读可用）。
> - 【check】`cd pix && npm run check` 必须 0 error（唯一工程门）。
> - 【烟测-渲染】纯函数离线烟测：把 `pix/src/renderer/utils/notes-view.ts` 用**仓库外临时 tsconfig**（`paths` 把 `@shared/*` 指向 `pix/src/shared/*`）+ `tsc --outDir %TEMP%/… --module commonjs --target es2022 --skipLibCheck --strict` 编译，node 直接 `require` 产物断言；脚本跑完删除临时目录。
> - 【烟测-主进程】数据面烟测：同法编译 `pix/src/main/notes-store.ts` 与其依赖 `pix/src/main/library-root.ts`（叶子模块，不 import electron），在 `%TEMP%` 下用 `setLibraryRoot(tmp)` + 真实文件系统驱动 `addNote/deleteNote/restoreNote`，断言写盘结果与文件字节；脚本跑完删除临时目录。
> - 【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + `MEASUREMENTS.json` 新增断言组全绿 + 新增截图齐备；剪贴板内容由脚本侧（主进程）`clipboard.readText()` 读取比对。
> 本档不写实现代码；契约给出**冻结字面量**与理由。设计档可细化机制，但不得改写下文「冻结」项与 §0 的数值/文案。

---

## 0. 冻结契约（设计档、开发档、评审档均不得改写）

### 0.1 搜索匹配的确切规则（唯一实现点 `matchesSearch`）

**唯一实现点**：新建纯函数模块 `pix/src/renderer/utils/notes-view.ts`（不 import Vue、不 import store；只 import `@shared/types` 的类型与 `./notes-path` 的 `docDisplayName`），导出 `matchesSearch(note: ReaderNote, query: string): boolean`。面板与 store 内不得出现第二份 `includes`/`indexOf` 匹配。

| 项 | 冻结规则 |
| --- | --- |
| 归一化 | `query = rawQuery.trim()`。`query === ""` ⇒ 搜索维度**未生效**（该维度恒真，不参与过滤，也不产生任何 UI 差异） |
| 大小写 | 唯一使用 `String.prototype.toLowerCase()`（**不用** `toLocaleLowerCase`，避免 locale 差异）；`needle` 只算一次 |
| 命中字段 | `note.text` **或** `note.comment`：`text.toLowerCase().includes(needle) \|\| comment.toLowerCase().includes(needle)` |
| 不参与匹配 | `id`、`kind`、`docPath`、`page`、`createdAt` 一律不参与（查 `sample-paper.pdf` / 查 `n-current-1` 恒不命中） |
| 空白 | 只 trim 首尾；**内部空白不折叠**，按字面字符参与子串匹配。因此 `消融实验` 命中而 `消融 实验` 不命中；原文写入时已被主进程 `normalizeNoteText` 归一化为单空格，故查询里出现连续两个空格时实际不会命中 |
| 中文 | 不做分词、不做拼音、不做繁简/全角半角转换、不做模糊匹配；多字中文查询必须是**连续子串** |
| 正则/通配 | 不使用 `RegExp`、不解释 `*`/`?`，一律按字面量处理（无转义陷阱） |
| 备注换行 | `comment` 原样比较（不折叠空白、保留换行）：`"a\nb"` 不含 `"ab"`、不含 `"a b"` |
| 排序/分组 | 搜索**不改变**分组顺序，也不改变组内排序规则（排序见 §0.2） |
| 空态展示用串 | 面板空态文案里的 `{q}` 就是 `query.trim()` 本身（原样插入，不做转义） |

**为什么不做「原文 + 备注分别标注命中位置」**：本轮不引入高亮渲染，命中位置的第二种 DOM 结构会与「展开全文 / 折叠」交互打架（见 §3.8）。

### 0.2 排序切换的确切规则（唯一实现点 `sortNotesForView`）

`export type NotesSortMode = "page" | "created";`（定义在 `notes-view.ts`）

| 模式 | 组内排序（逐字，`||` 为 JS 短路） | 说明 |
| --- | --- | --- |
| `"page"`（默认） | `a.page - b.page \|\| a.createdAt - b.createdAt` | **与今天逐条同序**（既有实现一字不改） |
| `"created"`（最新优先） | `b.createdAt - a.createdAt \|\| a.id.localeCompare(b.id)` | `createdAt` 相同则按 id 升序（保证确定性；不得依赖 `Array.prototype.sort` 的稳定性） |

**冻结的三条后果**：
1. **分组顺序不变**：仍是「当前文档组置顶 → 其余按 key 升序」（R9 语义）。排序切换只改组内顺序，不改组序（用户点的是「笔记顺序」，不是「文档顺序」）。
2. **不改三处既有顺序**：导出顺序（主进程 `renderNotesMarkdown` 的 doc→page→createdAt）、注入顺序（`notes-path.sortNotesForContext`）、分组前的清单顺序（`notesStore.notes` 保持主进程返回原序）**零改动**。
3. **不持久化**：不写 `settings`、不写 `notes.json`、不写 `reader-state.json`；`resetNotes()`（离开工作区/卸载）复位为 `"page"`；**文档切换保留**当前模式（与搜索词同一级别）。

### 0.3 计数文案在三维度下的确切取值与优先级

记 `V` = 最终可见行数（三个维度 AND 之后的渲染行数之和）、`T` = `totalCount`（工作区全量）。

| 优先级 | 生效条件（自上而下第一条命中） | `.notes-count` 逐字 |
| --- | --- | --- |
| 0 | `status === "error"` | `""`（空串，既有） |
| 1 | `query !== ""`（搜索生效） | `命中 {V} 条 / 共 {T} 条` |
| 2 | `chapterFilter !== null`（章节过滤生效） | `本章 {V} 条 / 共 {T} 条`（既有逐字） |
| 3 | `currentDocOnly === true` | `当前 {V} 条 / 共 {T} 条`（既有逐字） |
| 4 | 以上都不生效 | `共 {T} 条`（既有逐字） |

- 三维同时生效时前段只写「命中」；另外两个维度各自在**搜索框（含查询串）/ 章节过滤条（含章节名与页码）/ 开关状态**上可见（§0.9）。
- 数值口径只有一处：`V` 恒等于列表实际渲染的 `.note-row` 数量之和（不是「搜索维度单独命中的条数」），因此**头部数字与列表永远一致**。
- 组头 `.group-count` 逐字 `共 {N} 条`，`N` = 该组**可见条数**（搜索与排序之后）；可见条数为 0 的组整组不渲染（既有行为）。
- 不新增「搜索命中 N 条」的第二处计数（搜索框内不重复计数）。

### 0.4 列表空态：分支优先级与逐字文案（六分支）

模板分支顺序逐字冻结（自上而下第一条命中者渲染）：

| # | 条件 | 元素与类名 | 逐字文案 |
| --- | --- | --- | --- |
| 1 | `status === "loading"` | `.notes-loading`（既有） | 既有 spinner，无文本 |
| 2 | `status === "error"` | `.notes-error`（既有） | 既有错误面板（标题 + 详情 + 动作） |
| 3 | `!hasNotes` | `.notes-empty`（既有） | 标题 `还没有摘录`；副标题 `在 PDF 中选中文字，点「摘录」保存到这里`（搜索状态不影响本分支） |
| 4a | `query !== ""` 且 `V === 0` 且 `chapterFilter !== null` | `.notes-search-empty` | `本章内没有匹配「{q}」的笔记` |
| 4b | `query !== ""` 且 `V === 0` 且 `chapterFilter === null` 且 `currentDocOnly` | `.notes-search-empty` | `当前文档内没有匹配「{q}」的笔记` |
| 4c | `query !== ""` 且 `V === 0`（其余） | `.notes-search-empty` | `没有匹配「{q}」的笔记` |
| 5 | `chapterFilter !== null` 且 `V === 0` | `.notes-chapter-empty`（既有） | `本章暂无笔记`（既有逐字） |
| 6 | `currentDocOnly` 且 `V === 0` | `.notes-filtered-empty`（既有） | `当前文档暂无笔记`（既有逐字） |
| 7 | 其余 | `.notes-list`（既有） | —— |

- 4a/4b/4c 共用同一个类名 `.notes-search-empty`，**原因由文本区分**（这是「必须能区分原因」的判定面）。
- 「搜索无匹配」永不被报成「本章暂无笔记 / 当前文档暂无笔记」（4 分支优先于 5/6）。
- 分支判别唯一的纯函数：`resolveListEmptyReason(input): "search-chapter" | "search-current-doc" | "search" | "chapter" | "current-doc" | null`（定义在 `notes-view.ts`；`!hasNotes` 由面板已有的 `v-else-if` 链承担，不进该函数）。面板只把判别值映射为字面量，不重复写条件。

### 0.5 撤销的主进程契约（新 IPC `notes-restore`）

**删除槽只存在主进程内存**（不落盘、不跨重启、不写第二份文件）：

```ts
let undoSlot: { root: string; note: ReaderNote; index: number } | null = null;
```

| 步骤 | 冻结行为 |
| --- | --- |
| 设槽 | **只有成功的 `deleteNote` 会覆盖槽**：写盘成功后设 `{ root: getLibraryRoot(), note: 被删条目原对象, index: 它在数组中的下标 }`；`not-found` / `write-failed` 等失败**不改变槽**（不能把上一次的撤销权冲掉） |
| 清槽 | 只有「成功的 `restoreNote`」与「成功的 `resetCorruptNotes`（含重建为空库）」清空槽（后者理由：重建语义是「从空库开始」，把重建前删除的条目悄悄写回会让用户以为重建失败）；`addNote` / `updateNoteComment` / `loadNotes` / `exportNotesMarkdown` **不清槽** |
| 校验 | 按顺序：① 无 root → `no-root`；② 槽为空 → `not-found`（消息逐字 `没有可撤销的删除`）；③ `id !== 槽.note.id` → `not-found`（同一消息，最近一次删除的强约束）；④ `docPathKey(槽.root) !== docPathKey(getLibraryRoot())` → `not-found`（同一消息，**跨工作区防护：绝不写别的库**）；⑤ 读文件失败 → 既有码（`corrupt` / `version-unsupported` / `read-failed`，不覆盖） |
| 占用校验 | 文件里已存在同 id 条目 → `invalid-input`，消息逐字 `该笔记已重新存在，无法撤销`（**不得**覆盖或合并） |
| 写回 | `index = Math.min(槽.index, notes.length)`；`notes.splice(index, 0, 槽.note)`，**原对象原样写回**（`id` / `kind` / `docPath` / `page` / `text` / `comment` / `createdAt` / `updatedAt` 全部不变，不刷新 `updatedAt`） |
| 原子写 | 复用 `writeFileAtomic` + `serializeNotes`；写失败 → `write-failed`，**槽保留**（用户可在剩余时限内重试） |
| 成功返回 | `{ success: true, notes, note: 被还原条目 }`；槽置 `null`（不能重复还原） |
| 时间窗口 | **主进程不引入时钟与过期判定**：时间窗口由渲染层强制（§0.6）。主进程只保证「最近一次 + 归属 + 占用」三条数据面约束 |
| 类型面 | 复用既有 `ReaderNotesMutationResult`；**不扩 `ReaderNotesErrorCode`**（码表与 `ERROR_TITLES` 的既有约定不变，专有文案按调用点写死，先例：`ANSWER_TOO_LONG_MESSAGE`） |
| 通道 | `ipcMain.handle("notes-restore", (_e, id: unknown) => (isNoteId(id) ? restoreNote(id) : invalidNotesInput()))`；preload 增 `notesRestore: (id: string) => Promise<ReaderNotesMutationResult>` |

**附带（同一次删除调用内，最小改动）**：`deleteNote` 成功时把被删条目放进既有可选字段 `note` 一并回传（`{ success: true, notes, note }`），渲染层据此渲染撤销行，不需要在渲染层「猜」被删内容，也不新增类型。

### 0.6 撤销的渲染层时序与边界（冻结）

**常量（`notes-view.ts` 导出，写死一处）**：

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `UNDO_WINDOW_MS` | `5000` | 撤销窗口：自删除成功时刻起算，超时不可还原 |
| `UNDO_ROW_MS` | `8000` | 撤销**行保留时长**：比窗口长 3 秒，用来让「已过期」这件事可见可点（否则过期提示在 UI 上不可达） |
| `UNDO_EXPIRED_MESSAGE` | `撤销窗口已过期（超过 5 秒），笔记未能还原` | 渲染层过期文案（逐字） |
| `isUndoExpired(deletedAt, now)` | `now - deletedAt >= UNDO_WINDOW_MS` | 边界判定：`+4999` 未过期、`+5000` 已过期 |

**store 面（冻结命名）**：
- `pendingUndo: Ref<{ id: string; page: number; text: string; deletedAt: number } | null>`（只存展示与时限所需的四项；**还原载荷完全由主进程槽提供**，渲染层无法伪造还原内容）。
- `removeNote(id)` 成功 → `pendingUndo = { id/page/text 取自主进程回传的 note, deletedAt: Date.now() }`。
- `undoDelete(): Promise<{ ok: true } | { ok: false; message: string }>`：`pendingUndo === null` 或 `isUndoExpired(pendingUndo.deletedAt, Date.now())` → 返回 `{ ok: false, message: UNDO_EXPIRED_MESSAGE }` 且**不发 IPC**；否则调 `notesRestore(pendingUndo.id)`，成功 → `applyNotes(notes)` + 槽置 `null`；失败 → **槽保留**、返回主进程消息。
- `clearPendingUndo()`：面板的行定时器消费（唯一调用点）。
- `resetNotes()` 清空 `pendingUndo`。

**面板面（冻结行为）**：
- 撤销行 `.notes-undo` 渲染条件 = `pendingUndo !== null`；DOM 位置在 `.notes-notice` 之后、`.notes-export-row` 之前；**与三个过滤维度无关**（搜索/章节/文档过滤生效时照样渲染）。
- 行内容：`.undo-text` 逐字 `已删除「{snippet}」· 第 {page} 页`，其中 `snippet = text.slice(0, 12)`，若 `text.length > 12` 则追加 `…`（半角省略号）；`.notes-undo-btn` 文本 `撤销`、`title` 逐字 `还原这条笔记`；还原在途 `:disabled`（防双击二次写）。
- 计时基准是 `deletedAt`（不是挂载时刻）：进入/重挂载时 `setTimeout(UNDO_ROW_MS - (Date.now() - deletedAt))`，剩余时长 `<= 0` 立即 `clearPendingUndo()`。因此切标签/重挂载后行**不会复活**也不会续命；`onBeforeUnmount` 清理该定时器（与既有 `noticeTimer` / `confirmTimer` 同一处清理范式）。
- 点击撤销：失败 → `setNotice("error", \`撤销失败：${result.message}\`)`；其中 `message === UNDO_EXPIRED_MESSAGE` 时**同时立即收行**（避免死按钮），其它失败保留行到原 `UNDO_ROW_MS` 到期（不延长计时，可重试）；成功 → `setNotice("success", "已还原该条笔记")`（逐字）+ 行消失。
- 删除成功**不额外弹 notice**（撤销行本身就是反馈，避免同时出现三行）。

**边界（逐条冻结，N68 验收）**：

| 场景 | 冻结结果 |
| --- | --- |
| 5 秒内点撤销 | 真实反写；条目回到清单；`id` 与 `createdAt` 不变；若无其它写入介入，`notes.json` 与删除前**字节完全一致** |
| 5–8 秒之间点撤销（行仍在） | 不写盘、不发 IPC；`.notes-notice.is-error` 出现并逐字为 `撤销失败：撤销窗口已过期（超过 5 秒），笔记未能还原`；行立即消失；文件保持删除后的字节 |
| 8 秒之后（行已消失） | 界面上无任何撤销入口（无快捷键、无历史面板、无第二个入口）；走查确认不存在其它调用 `undoDelete` 的地方 |
| 连续删除两条 | 撤销行只有一行（`.notes-undo` 数量 ≤ 1），内容与时限**刷新为第二条**；第一条不再可撤销（不存在撤销栈）；撤销只作用于最近一次 |
| 撤销成功后再删同一条 | 允许：出现新的撤销行，并可再次还原（无「一次性」限制） |
| 撤销与选择集 | 撤销**不修改** `selectedNoteIds`；删除前已选的条目在还原后重新计入「已选 N 条」与注入载荷（R8 语义的自然结果，必须写进验收） |
| 撤销与章节过滤/搜索/排序 | 一律不改：不清 `chapterFilter`、不动 `currentDocOnly`、不清 `searchQuery`、不改 `sortMode`、不跳页 |
| 还原后可见性 | 按当前三维过滤重新派生：可能仍不可见（此时计数不变，但成功通知照常出现） |
| 主进程返回失败（如 `write-failed`） | 行保留到原到期时刻、错误通知逐字 `撤销失败：{主进程消息}`；文件字节不变；可重试 |
| 槽已失效（主进程无槽/跨工作区） | 错误通知逐字 `撤销失败：没有可撤销的删除`；文件字节不变 |

### 0.7 单条「复制为 Markdown」的逐字模板（唯一实现点 `buildNoteCopyFragment`）

```
> {text 第 1 行}
> {text 第 N 行}

—— {文档显示名} · 第 {page} 页[ · AI 结论]
```

| 项 | 冻结规则 |
| --- | --- |
| 引用块 | 原文**逐行**加 `> ` 前缀（与导出 `renderMarkdownEntry` 同规则）；行与行之间不留空行 |
| 空行 | 引用块与出处行之间恰好一个空行（`\n\n`） |
| 出处行前缀 | `—— `（两个 U+2014 破折号 + 一个半角空格） |
| 文档显示名 | `docDisplayName(note.docPath)`（与分组头 `.group-name` 同一字符串，如 `sample-paper.pdf`、`older-paper.pdf`）；**不含**绝对路径与 id |
| 页码 | 十进制整数，1-based |
| 类型后缀 | 仅 `note.kind === "answer"` 追加 ` · AI 结论`（半角空格 + `·` + 半角空格）；`excerpt` 无后缀 |
| 不含 | 备注（`comment`）、id、`kind` 原值、文档相对路径、时间戳 |
| 末尾 | **无**尾随换行（最后一行不以 `\n` 结束） |
| 反馈 | 按钮 `.note-copy` 默认文本 `复制`、`title` `复制为 Markdown`；成功后 1200 ms 内文本与 `title` 均为 `已复制` 并加类 `.is-copied`（范式照抄 ChatPanel 的 `COPY_FEEDBACK_MS`）；反馈键 `copiedNoteId`（单键，同一时刻至多一个按钮处于反馈态） |
| 剪贴板链路 | `copyToClipboard`（`navigator.clipboard.writeText`）失败即降级 `copyViaExecCommand`（临时 textarea + `document.execCommand("copy")`）；两个函数在 `NotesPanel.vue` 内照抄 ChatPanel 写法，**不新建 clipboard 模块、不改 ChatPanel** |
| 失败 | 两条链路都失败 → `.notes-notice.is-error` 逐字 `复制失败：无法访问剪贴板`；不改行内容、不写盘 |
| 位置 | `.note-actions` 内、`.note-ask` **之前**（`<button class="note-copy">` → `<span class="note-ask-wrap">`）；`.note-actions` 仍是 `.note-body` 的最后一个子节点、右对齐单行 |

### 0.8 搜索/排序的 DOM、类名与接入点（冻结）

**`.notes-header` 内 DOM 顺序（自上而下，冻结）**：

```
.notes-header-top（计数 + 导出按钮，既有）
.notes-search        ← 新增，搜索行
.notes-sort          ← 新增，排序行
.notes-filter        ← 既有「仅看当前文档」开关
.notes-chapter-filter（既有，条件渲染）
.notes-selection-bar（既有，条件渲染）
```

- `.notes-search` 与 `.notes-sort` 的渲染条件同为 `notesStore.status === "ready" && notesStore.hasNotes`（与 `.notes-selection-bar` 同范式；加载/错误/空库期间不渲染、状态保留，回到 ready 后原样出现）。
- `.notes-search` 结构：`<input class="notes-search-input" type="text" placeholder="搜索原文或备注" @keydown.esc="…">` + `<v-btn v-if="query !== ''" class="notes-search-clear" icon="mdi-close" size="x-small" variant="text" title="清空搜索" />`（**未输入查询时不进入 DOM**）。输入框盒模型照抄 `PdfSearchPanel.vue` 的 `.search-input`（高 26px、圆角 6、12px 字号、focus 边框），**类名改为 `.notes-search-input`** 以免与搜索面板的选择器同名。
- Esc：清空查询并 `blur()`（不加 `stopPropagation`，阅读区既有的全局 Esc 处理不在本轮改动范围）。
- 清空按钮：查询置空后**焦点回到输入框**。
- `.notes-sort` 结构：单个 `<button class="notes-sort-btn">`；文本逐字 `排序：页码`（默认）/ `排序：最新`；`title` 逐字 `当前按页码排序，点击改为「最新优先」` / `当前按最新优先排序，点击改为「页码」`；点击即切换（无下拉、无二次确认）。不使用 `v-btn-toggle`（仓库内无既有用法，不引入新组件语义）。
- store 面：`searchQuery: Ref<string>` + `setSearchQuery(v)` + `clearSearchQuery()`；`sortMode: Ref<NotesSortMode>` + `setSortMode(mode)`；面板用与 `.notes-filter` 开关同形的 `computed` get/set 绑定 v-model。
- 可见行派生（唯一管道，全部在 store 内）：
  `groups = applyViewToGroups(groupNotesByDocument(notes, currentDocKey, currentDocOnly, chapterRange), searchQuery, sortMode)`
  其中 `applyViewToGroups(groups, query, mode)`：按 `matchesSearch` 过滤组内条目（0 条整组丢弃）→ 按 `sortNotesForView` 重排组内条目 → **组数组顺序原样返回**。该函数为纯函数：**不得原地修改入参**。面板模板内不得出现 `filter()` / `sort()`。

### 0.9 三维度组合语义与「每个维度都可见」

- **AND（写死）**：一条笔记可见 ⇔ `matchesSearch(note, query)` ∧ `matchesChapterFilter(note, currentDocKey, chapterRange)` ∧（`onlyCurrent → docPathKey(note.docPath) === currentDocKey`）。
  由于 `matchesChapterFilter` 已蕴含文档归属（R9 §0.4），实际判定式 = 搜索 ∧ 章节（若生效）∧ 文档（若生效）；`chapterRange === null` 时退化为 R9 既有语义，**逐条等价于今天**。
- **可见性三处（每条都要在离屏场景里被同时断言）**：搜索框内是用户的查询串（清空后为空）；章节过滤条显示章节名与页码范围（含「清除」）；开关显示自身的 on/off（章节过滤**不得**程序化改写开关，R9 不变）。
- **排序与复制不是过滤维度**：它们不改变可见集合，只改变顺序与剪贴板内容。
- 计数文案与空态文案按 §0.3 / §0.4；任何维度下 0 条都必须能看出原因。

### 0.10 冻结的类名/常量清单（离屏断言依赖，不得改名）

| 选择器 / 常量 | 含义 |
| --- | --- |
| `.notes-search` / `.notes-search-input` / `.notes-search-clear` | 搜索行、输入框、清空按钮（§0.8） |
| `.notes-sort` / `.notes-sort-btn` | 排序行与其按钮（§0.8） |
| `.notes-search-empty` | 搜索无匹配空态（三种文案共用，§0.4） |
| `.notes-undo` / `.undo-text` / `.notes-undo-btn` | 撤销行、行文案、撤销按钮（§0.6） |
| `.note-copy` / `.note-copy.is-copied` | 行内复制按钮与反馈态（§0.7） |
| `pix/src/renderer/utils/notes-view.ts` | `NotesSortMode` / `matchesSearch` / `sortNotesForView` / `applyViewToGroups` / `buildNoteCopyFragment` / `resolveListEmptyReason` / `UNDO_WINDOW_MS` / `UNDO_ROW_MS` / `UNDO_EXPIRED_MESSAGE` / `isUndoExpired`（模块路径与导出名冻结，供烟测 `require`） |
| `UNDO_WINDOW_MS = 5000` / `UNDO_ROW_MS = 8000` | 撤销窗口 / 撤销行保留时长（§0.6，逐字冻结） |
| `COPY_FEEDBACK_MS = 1200` | 复制反馈时长（与 ChatPanel 同值） |
| `notes-restore` / `notesRestore` | IPC 通道名与 preload 方法名（§0.5） |

---

## 1. 本轮目标与不变量（违反任一即为回归，设计档必须逐条声明、开发档逐条自评）

目标：让笔记面板在**几十条规模**下可检索、可排序、可纠错（撤销误删）、可外带（单条复制）；四条主线全部落在**视图状态 + 纯函数 + 一次真实反写**上，不引依赖、不引索引、不改存储格式。

1. **`notes.json` 是唯一事实源，界面所见必须与文件所存一致**：删除立即写盘（既有语义不变），撤销是**真实反写**而不是定时器骗局；任何写入仍走 `writeFileAtomic`（tmp + rename）；变更后渲染层一律用主进程回传的全量列表覆盖本地（**不做乐观合并**，R8/R9 已建立的语义不变）；损坏绝不覆盖。
2. **R8 选择集语义不变**：选择集仍是 id 集合、上限 10 条、注入顺序（`sortNotesForContext`）与 chip 文案零改动；搜索/排序/章节过滤都不得改写它；撤销后因 id 重新有效而自然回到选择集（这是 §0.6 冻结的**预期结果**，不是缺陷）。
3. **R9 章节过滤语义不变**：`matchesChapterFilter` 仍是唯一判定式、`groupNotesByDocument` 的第四参仍是章节范围入口、章节过滤仍不程序化改写开关、切文档仍清除过滤、token 一次性聚焦不变；本轮只在其**之后**追加「搜索 → 排序」两个视图维度。
4. **既有交互零改动**：删除二次确认（3 s + document capture `pointerdown`）、`.notes-notice` 4 s 自动消失与 × 关闭、导出契约（永远全量、`已导出 N 条 → .pix-read/notes.md`）、跳回原文、备注编辑、展开全文、AI 徽标、错误态与逃生口、计数文案的既有两态、空态既有两分支 —— 全部保持；新增元素未触发时不进入 DOM。
5. **视图状态不落盘、零外溢、唯一工程门**：搜索词与排序模式只存在于 Pinia 内存；不改 `notes.json` 格式、不新增落盘字段；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置零改动；不新增依赖；`cd pix && npm run check` 0 error。

---

## 2. 需求明细

### N63 面板内搜索：匹配规则与即时过滤

**一句话**：面板头部新增搜索框，输入即按 §0.1 的规则过滤可见笔记（原文或备注，大小写不敏感，中文不分词），且只在视图层生效。

**用户可见行为**：在搜索框里敲 `TABLE 2`，列表立刻只剩「Table 2 reports…」那一条；敲 `消融` 只剩带该备注的那条；敲 `消融 实验`（中间多一个空格）列表变空并提示没有匹配。

**验收标准**

1. 【走查】`matchesSearch` 只在 `notes-view.ts` 实现一份：`grep -rn "toLowerCase()" pix/src/renderer` 在笔记链路上只命中该模块与既有非本轮文件；`NotesPanel.vue`、`notes-store.ts` 内不出现 `includes(`/`indexOf(` 形式的搜索匹配。
2. 【走查】`query` 的归一化只有一处（`trim()`）：store 的 `searchQuery` 存的是用户输入原串，过滤一律走 `matchesSearch` 内部 trim，面板不做第二处 trim 判定。
3. 【烟测-渲染】组名 `search-basic`（逐条断言）：大小写不敏感（`TABLE 2` 命中 `Table 2…`）；备注参与匹配（`消融` 命中备注、命中原文）；原文参与匹配；`""` 与 `"   "` 恒真；连续空格不折叠（`消融 实验` 不命中）；`sample-paper.pdf` / `n-current-2` / `7` 一律不命中（证明 `docPath`/`id`/`page` 不参与）；中文连续子串命中（`稀疏注意力`）。
4. 【离屏】场景 60：标准种子 + `sample-paper.pdf`（当前文档）打开笔记面板，逐次输入并断言（每次输入后等待一次渲染帧）：
   - `TABLE 2` → `.note-row` 数量 `1`；`.notes-count` 逐字 `命中 1 条 / 共 4 条`；
   - 清空后再输入 `消融` → `1`；
   - 再输入 `消融 实验` → `0` 且 `.notes-search-empty` 文本逐字 `没有匹配「消融 实验」的笔记`；
   - 再输入 `sample-paper.pdf` → `0`（文档名不参与匹配）。
   截图 `60-notes-search.png`（全窗口）、`60b-notes-search-left-pane.png`（左栏）、`60c-notes-search-zoom.png`（搜索行 + 头部计数放大）。
5. 【离屏】即时性：输入事件后**不等待额外延迟**（无防抖）即断言行数变化；同一批断言内不存在 `sleep` 于输入与断言之间（唯一允许的一次 `repaint` 由 `capturePage` 内部完成）。
6. 【边界】`status === "error"` / `"loading"`：搜索行不渲染，`searchQuery` 保留；回到 ready 后按原查询过滤（不出现「错误态悄悄丢查询」）。
7. 【走查】搜索不改数据：`pix/src/main/**` 在本条无改动；场景内 `notes.json` 字节在「输入查询 / 清空查询」前后不变（哈希断言）。

**涉及文件**：`pix/src/renderer/utils/notes-view.ts`（新建）、`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue`。

**数据落盘**：无。

---

### N64 搜索交互：命中数、一键清空、Esc 清空并失焦、空态

**一句话**：搜索框旁提供一键清空（只在有查询时出现），Esc 清空并失焦，头部计数用「命中 V 条 / 共 T 条」给出命中数，无匹配时按 §0.4 给出可区分原因的空态。

**用户可见行为**：输入后头部显示「命中 1 条 / 共 4 条」；点 × 清空、列表回到 4 条且输入框仍聚焦；在搜索框里按 Esc，查询清空且输入框失焦；搜索不到时看到「没有匹配「xxx」的笔记」。

**验收标准**

1. 【走查】清空按钮 `v-if="query !== ''"`（未输入查询时不在 DOM）；点击只调 `clearSearchQuery()` 并 `focus()` 输入框，不写盘、不发 IPC、不改选择集。
2. 【走查】Esc 处理：`@keydown.esc` 只做「清空 + `blur()`」，不 `stopPropagation`、不做别的副作用；面板内不存在第二处监听 Escape 的代码（`grep -rn "Escape" pix/src/renderer/components/workspace/NotesPanel.vue` 不命中）。
3. 【离屏】场景 61 的空态矩阵（每次按 §0.4 断言元素类名与逐字文案）：
   - 搜索 `zzz` + 三个维度都不生效 → `.notes-search-empty` 文本逐字 `没有匹配「zzz」的笔记`；
   - 再开「仅看当前文档」→ 文本逐字 `当前文档内没有匹配「zzz」的笔记`（仍是 `.notes-search-empty`，不是 `.notes-filtered-empty`）；
   - 再点地图章节徽标（章节过滤生效）→ 文本逐字 `本章内没有匹配「zzz」的笔记`（仍是 `.notes-search-empty`，不是 `.notes-chapter-empty`）；
   - 清空查询（点 ×）→ 章节过滤仍生效 → 文本逐字 `本章暂无笔记`（`.notes-chapter-empty`，R9 文案）；
   - 清除章节过滤 → 文本逐字 `当前文档暂无笔记`（`.notes-filtered-empty`，R9 文案）；
   - 关掉开关、清空查询 → 4 行列表（无空态）。
   截图 `61-notes-search-empty.png`、`61b-notes-search-empty-doc.png`、`61c-notes-search-empty-chapter.png`。
4. 【离屏】Esc（三个维度都不生效的状态下：开关关、无章节过滤）：输入 `消融` 后按 Esc → 输入框 `value === ""`、`document.activeElement !== 输入框`、`.note-row` 数量回到 `4`、`.notes-search-clear` 不在 DOM。截图 `60d-notes-search-cleared.png`。
5. 【离屏】一键清空（同上状态）：输入 `消融` 后点 × → `value === ""` 且 `document.activeElement === 输入框`、行数回到 `4`。
6. 【边界】查询只有空白（`   `）时：清空按钮**不渲染**（判定用 trim 后非空）、计数文案走 §0.3 优先级 4（`共 4 条`）、列表不筛。
7. 【边界】删到 0 条（搜索生效中）：显示 `.notes-empty`「还没有摘录」（§0.4 分支 3 优先）；再摘录一条不匹配的原文 → 搜索行回来且查询原样、计数逐字 `命中 0 条 / 共 1 条`、空态为 4c 文案（走查 + 离屏各一次）。

**涉及文件**：`pix/src/renderer/components/workspace/NotesPanel.vue`、`pix/src/renderer/stores/notes-store.ts`。

**数据落盘**：无。

---

### N65 排序切换：默认页码序、可切「最新优先」

**一句话**：面板提供排序切换（§0.2），默认保持今天的组内顺序（页码升序 → 同页 createdAt 升序），可切「最新优先」（createdAt 降序，同值按 id 升序）；只改组内顺序，不改组序，不持久化。

**用户可见行为**：面板头部按钮显示「排序：页码」；点一下变成「排序：最新」，当前文档组里的两条同页笔记顺序对调（AI 结论那条（更晚创建）排到摘录前面）；再点一下回到页码序；换文档/换标签顺序保持，离开工作区回到默认。

**验收标准**

1. 【走查】排序实现只有 `sortNotesForView` 一份；`groupNotesByDocument` 内的既有排序表达式（`a.page - b.page || a.createdAt - b.createdAt`）**一字不改**（`git diff` 可核对）；`buildNoteCopyFragment`/导出/注入都不读 `sortMode`。
2. 【烟测-渲染】组名 `sort-default`：`"page"` 模式输出与烟测内独立手写的朴素参照（page→createdAt）逐字段相等，且与不传 `sortMode` 的旧行为逐字段相等。
3. 【烟测-渲染】组名 `sort-created`：降序正确；`createdAt` 相同时按 id 升序；**分组顺序与 `"page"` 模式逐键相同**；纯函数不原地修改入参（断言调用前后入参数组顺序不变）。
4. 【离屏】场景 62：标准种子 + `sample-paper.pdf`，默认态断言 `.note-row` 内正文顺序为 `[n-current-1, n-current-2, n-current-3]`（按 p1→p2 摘录→p2 结论）；点 `.notes-sort-btn` 后断言顺序为 `[n-current-3, n-current-2, n-current-1]`，且 `.notes-group-head` 的文档顺序**不变**、`.group-count` 文案不变；再点一次回到原顺序。截图 `62-notes-sort-latest.png`、`62b-notes-sort-default.png`。
5. 【离屏】按钮文本与 title 逐字：默认 `排序：页码` / `当前按页码排序，点击改为「最新优先」`；切换后 `排序：最新` / `当前按最新优先排序，点击改为「页码」`。
6. 【边界】排序与搜索叠加：搜索 `稀疏注意力`（命中 AI 结论那条）→ 切「最新」→ 行数与文案不变（1 行、`命中 1 条 / 共 4 条`）。
7. 【边界】排序与章节过滤叠加：章节过滤生效时切换排序，可见集合不变、`.notes-group` 数量不变（1），仅组内顺序变化。
8. 【走查】不持久化：不写 `settings`/`notes.json`/`reader-state.json`；`resetNotes()` 复位为 `"page"`（`grep -rn "sortMode" pix/src` 的全部写入点可枚举，且没有一处落盘路径）。
9. 【回归】导出与注入顺序不受影响：场景内导出后 `.export-text` 逐字 `已导出 4 条 → .pix-read/notes.md`；发送后 `reader_notes` 条目顺序仍为 doc→page→createdAt（与 `sortMode` 无关）。

**涉及文件**：`pix/src/renderer/utils/notes-view.ts`、`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue`。

**数据落盘**：无。

---

### N66 三维度组合：AND 语义、计数优先级、空态归因

**一句话**：搜索 / 章节过滤 / 仅看当前文档三者是 AND，任一条可见都必须同时满足；头部计数与空态文案按 §0.3 / §0.4 冻结的优先级取值，任一维度下 0 条都能看出原因。

**用户可见行为**：开着「仅看当前文档」、章节过滤到 `2. Method Overview`、再搜 `Table 2` → 只剩 1 条，头部写「命中 1 条 / 共 4 条」，同时能看到搜索框里的词、章节条里的章节名和开关的勾选状态；把查询改成 `zzz` → 空态写「本章内没有匹配「zzz」的笔记」。

**验收标准**

1. 【走查】可见集合的判定只有一条管道：`applyViewToGroups(groupNotesByDocument(notes, currentDocKey, currentDocOnly, chapterRange), query, sortMode)`；`NotesPanel.vue` 模板内无 `filter(`/`sort(`；store 内不存在第二条筛选表达式（不含第二处 `docPathKey(note.docPath) === currentDocKey`）。
2. 【走查】计数文案只有 `countLabel` 一处实现、四分叉，且 `V` 与 `T` 的来源只有 `groups` 与 `totalCount`（模板内不出现第二处求和）。
3. 【烟测-渲染】组名 `search-and-filter`：给定 4 条样本与一组（query × chapterRange × onlyCurrent）参数，断言可见集合恒等于三个谓词的交集（含 `chapterRange === null`、`query === ""` 的退化用例），且与逐条 `matchesSearch ∧ matchesChapterFilter` 的朴素参照逐条相等。
4. 【烟测-渲染】组名 `empty-reason`：`resolveListEmptyReason` 的六种判别值逐条（含「4 分支优先于 5/6」与「`!hasNotes` 不进该函数」的约定）。
5. 【离屏】计数文案真值表（标准种子 T=4；章节过滤取 `2. Method Overview`，其页码范围 `[2,2]` 内含 2 条，与 R9 的徽标数字一致；场景 60/61 内断言）：无维度 `共 4 条`；仅「仅看当前文档」且打开该文档 `当前 3 条 / 共 4 条`；仅章节过滤 `本章 2 条 / 共 4 条`；仅搜索（`TABLE 2` 命中 1）`命中 1 条 / 共 4 条`；搜索 + 章节 + 仅看当前文档 `命中 1 条 / 共 4 条`（前段只写「命中」）；搜索无匹配 `命中 0 条 / 共 4 条`；`status === "error"` 时 `.notes-count` 文本为空串。
6. 【离屏】三维度可见性同时成立：上一条最后一态下，`.notes-search-input` 的 value 非空、`.notes-chapter-filter-text` 存在且文本逐字 `章节：2. Method Overview · 第 2 页`、`.notes-filter input.checked === true`（截图 `60e-notes-search-three-dimensions.png`）。
7. 【离屏】AND 的数值证据：搜索 `Table 2` 时开/关「仅看当前文档」→ 行数都是 1（章节过滤生效时判定式已蕴含文档归属，与 R9 一致）。
8. 【走查】维度不得互相改写：`grep -rn "setCurrentDocOnly" pix/src` 只有开关的 setter 与面板绑定；`clearChapterFilter` 的调用点与 R9 相同（无新增清零点）；搜索/排序不触发 `loadNotes`（场景内 `notesLoadCalls()` 在输入查询前后不变）。
9. 【回归】未使用任何新维度时，面板 DOM 与文案与 R9 一致：既有的 00–11、20–24、30–36、40–46、50–55 场景全部继续通过。

**涉及文件**：`pix/src/renderer/utils/notes-view.ts`、`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue`。

**数据落盘**：无。

---

### N67 撤销的数据面：删除槽 + `notes-restore`（真实反写）

**一句话**：主进程在内存里保存「最近一次成功删除」的条目与它的原下标，`notes-restore` 把该条目按原下标插回并原子写盘（`id`/`createdAt`/`updatedAt` 全不变）；校验槽归属与该 id 未被占用。

**用户可见行为**：删除一条笔记后立刻在文件里就看不到它了（不是等撤销窗口结束才写）；点撤销后它回到原位置，行、页码、备注、时间（如「2 分钟前」）与删除前完全一致。

**验收标准**

1. 【走查】槽的形状与写点：`notes-store.ts` 内 `undoSlot` 只在「成功删除」与「成功还原 / 成功重建空库」三处变化（可枚举的赋值点，禁止第四处）；全程无 `await`（写读改同函数体内同步完成，既有约束不变）。
2. 【走查】IPC 契约：通道名 `notes-restore`、preload 方法 `notesRestore(id)`、handler 用既有 `isNoteId` 守卫并在守卫失败时返回 `invalidNotesInput()`；`shared/types.ts` **零改动**（复用 `ReaderNotesMutationResult`，不扩错误码）；无内联动态 import、无 `any`。
3. 【烟测-主进程】组名 `undo-roundtrip`：在 `%TEMP%` 临时库里 `addNote` ×3 → 记录文件字节与哈希 → `deleteNote(中间那条)` → 断言文件即时变化（删除已落盘）、`deleteNote` 返回的 `note.id/page/text` 与目标一致 → `restoreNote(id)` → 断言：文件**字节完全一致**（等价于「同一条目按原下标插回、`updatedAt` 未刷新」）、`note` 字段回传正确、`success === true`、槽已清空。
4. 【烟测-主进程】失败路径逐条：`restoreNote` 在无槽时返回 `not-found` 且消息逐字 `没有可撤销的删除`；id 与槽不匹配时同码同消息；换 root（`setLibraryRoot(另一个临时目录)`）时同码同消息且**另一个库的文件不被创建/修改**；文件里已存在同 id 条目时返回 `invalid-input` 且消息逐字 `该笔记已重新存在，无法撤销`（且文件字节不变）；写失败注入下（只读目录或占用）返回 `write-failed` 且槽保留（可立即重试成功）。
5. 【烟测-主进程】槽生命周期：`updateNoteComment` / 第二次 `addNote` 之后槽仍可还原（还原成功，且新条目保留）；成功的第二次 `deleteNote` 覆盖槽（旧 id 的还原请求返回 `not-found`）；成功的 `restoreNote` 后再次 `restoreNote` 同 id 返回 `not-found`（不能重复还原）；`resetCorruptNotes` 成功后槽为空。
6. 【离屏】场景 63：删除 `n-current-2` 后读取 fixture 文件断言该条已消失、`notesHash()` 与删除前不同（**界面所见 = 文件所存**的直接证据）；`.notes-undo` 存在且 `.undo-text` 逐字 `已删除「Table 2 repo…」· 第 2 页`；点 `.notes-undo-btn` → 行数回到 4、`.notes-notice.is-success` 文本逐字 `已还原该条笔记`、`notesHash()` 与删除前**相等**、文件里 `n-current-2` 的 `createdAt` 与种子值相等、清单顺序与删除前逐条相同。截图 `63-notes-undo.png`、`63b-notes-undo-restored.png`。
7. 【边界】还原后该条仍在原位参与三个过滤维度（例如搜索 `Table 2` 仍命中；若章节过滤把 p2 排除则仍不可见——两种都断言一次）。
8. 【边界】撤销不改选择集与注入：先勾选 `n-current-2`（`已选 1 条`）→ 删除（`已选 0 条`、chip 消失）→ 撤销（`已选 1 条`、chip `摘录 1 条` 回来，发送载荷重新含该条）。
9. 【走查】渲染层不拼路径：`NotesPanel.vue` / `notes-store.ts` 内不出现 `notes.json`、`.pix-read`、路径分隔符拼接；还原载荷来自主进程槽（渲染层的 `pendingUndo` 只含 id/page/text/deletedAt）。
10. 【走查】失败不静默：还原失败一律经 `.notes-notice.is-error` 呈现（消息来自 `undoDelete()` 的返回），不存在只 `console` 或静默 return 的失败分支。

**涉及文件**：`pix/src/main/notes-store.ts`、`pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`、`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue`。

**数据落盘**：`<工作区根>/.pix-read/notes.json`（删除立即写、还原再写；两次写入都走 tmp + rename 原子写；撤销槽本身**不落盘**、不跨重启）。

---

### N68 撤销的界面时序与边界（5 秒窗口 / 8 秒行 / 过期文案 / 最近一次）

**一句话**：删除后 5 秒内在面板内提供「撤销」（真实反写），行保留 8 秒；窗口内点击生效、窗口外点击给出中文失败提示并立即收行；撤销只作用于最近一次删除。

**用户可见行为**：删掉一条后顶部出现「已删除「Table 2 repo…」· 第 2 页　撤销」；4 秒内点撤销，条目回来并提示「已还原该条笔记」；等到第 6 秒才点，提示「撤销失败：撤销窗口已过期（超过 5 秒），笔记未能还原」，行消失、笔记不会回来；连着删两条，只有第二条能撤销。

**验收标准**

1. 【走查】常量与纯函数：`UNDO_WINDOW_MS = 5000`、`UNDO_ROW_MS = 8000`、`UNDO_EXPIRED_MESSAGE` 只在 `notes-view.ts` 定义一次；面板与 store 不写第二份数字（`grep -rn "5000\|8000" pix/src/renderer` 在笔记链路上只命中该模块与无关既有值）。
2. 【烟测-渲染】组名 `undo-expiry`：`isUndoExpired(t, t + 4999) === false`、`isUndoExpired(t, t + 5000) === true`、`isUndoExpired(t, t + 5001) === true`；常量值逐字断言为 `5000` / `8000`；`UNDO_EXPIRED_MESSAGE` 逐字断言。
3. 【走查】过期分支不发 IPC：`undoDelete()` 的两个提前返回点（无槽 / 已过期）在调用 `bridge()` 之前 return（可核对函数体顺序）；面板的行定时器只调 `clearPendingUndo()`。
4. 【走查】计时基准是 `deletedAt`：定时器时长由 `UNDO_ROW_MS - (Date.now() - deletedAt)` 折算并对 `<= 0` 立即清槽；不存在「按挂载时刻重置计时」的写法；`onBeforeUnmount` 清理该定时器（与 `noticeTimer`/`confirmTimer` 同处）。
5. 【离屏】场景 64（过期）：删除 `n-current-2` → 记录删除后哈希与 `notesRestoreCalls()` → `sleep(5200)` → 断言 `.notes-undo` 仍存在（行保留 8 秒）→ 点 `.notes-undo-btn` → 断言 `.notes-notice.is-error` 文本逐字 `撤销失败：撤销窗口已过期（超过 5 秒），笔记未能还原`、`.notes-undo` 从 DOM 消失、`notesRestoreCalls()` 增量 **0**（未发 IPC）、`notesHash()` 与删除后相同、`.note-row` 数量仍为 3。截图 `64-notes-undo-expired.png`。
6. 【离屏】场景 64b（行到期）：再次删除一条 → `sleep(8200)` → `.notes-undo` 不在 DOM、`.note-row` 数量确认（无复活）；此期间切到「资料库」标签再切回「笔记」，行仍不在（计时基准未被重挂载重置）。截图 `64b-notes-undo-row-gone.png`。
7. 【离屏】场景 64c（槽失效）：删除一条 → 调 stub 控制口清空删除槽 → 点撤销 → `.notes-notice.is-error` 文本逐字 `撤销失败：没有可撤销的删除`、文件哈希保持删除后状态、行数不变。
8. 【离屏】连续删除两条：删除 A 再删除 B → `.notes-undo` 数量恒为 `1`、`.undo-text` 为 B 的文案；点撤销只还原 B（A 仍不在清单里，行数为 3）。
9. 【离屏】撤销后再次删除同一条：还原 A → 再次删除 A → 新的撤销行出现 → 再次撤销成功（行数回到 4，哈希回到基线）。
10. 【走查】唯一撤销入口：`grep -rn "undoDelete" pix/src` 只命中 store 定义与 `.notes-undo-btn` 的一处调用；无快捷键、无右键菜单、无历史面板。
11. 【边界】行渲染与过滤无关：搜索 `zzz`（0 行）状态下删除一条（可从章节过滤前的列表删除，或先删除再输入查询）→ `.notes-undo` 仍然渲染（断言存在）；撤销后条目按当前过滤决定是否可见。
12. 【边界】还原在途防重复：`restoring` 期间 `.notes-undo-btn` 处于 disabled，双击只产生 1 次 `notesRestore` 调用（stub 计数器断言）。

**涉及文件**：`pix/src/renderer/utils/notes-view.ts`、`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue`、`pix/scripts/ui-shot.mjs`（断言与 stub 控制口）。

**数据落盘**：无（除 N67 的还原写）。

---

### N69 单条复制为 Markdown

**一句话**：每条笔记的行内动作里提供「复制」，把 §0.7 的片段写入剪贴板，并复用既有的「已复制」短暂反馈范式与 clipboard 降级链路。

**用户可见行为**：点某条摘录的「复制」，按钮变成「已复制」，粘贴到别处得到一段带 `>` 引用与「—— sample-paper.pdf · 第 2 页」出处行的 Markdown；AI 结论那条的出处行末尾多出「· AI 结论」。

**验收标准**

1. 【走查】模板实现唯一：`buildNoteCopyFragment` 只在 `notes-view.ts` 定义一份；面板只调用它，不在模板或本地函数里拼 `>` 前缀、`——` 或「AI 结论」。
2. 【烟测-渲染】组名 `copy-fragment`：四种输入逐字断言——`excerpt` 单行、`excerpt` 多行（每行都有 `> ` 前缀、行间无空行）、`answer`（出处行末尾 ` · AI 结论`）、`docPath` 带目录（`archive/older-paper.pdf` → 显示名 `older-paper.pdf`）；断言末尾无 `\n`、片段不含 `comment` 与 `id`。
3. 【离屏】场景 65：点 `n-current-2` 行的 `.note-copy` → 脚本侧 `clipboard.readText()` 逐字等于：
   ```
   > Table 2 reports the ablation over the sparse mask budget. Removing the positional prior costs 2.4 points of recall, which confirms the mask is doing more than sparsification alone; the effect persists when the retrieval corpus is truncated to the first 8k tokens, so the gain cannot be attributed to longer effective context windows.

   —— sample-paper.pdf · 第 2 页
   ```
   并断言按钮文本为 `已复制`、类名含 `.is-copied`；截图 `65-note-copy-feedback.png`。
4. 【离屏】类型可见：对 `n-current-3`（`kind = answer`）复制 → `clipboard.readText()` 逐字等于：
   ```
   > 结论：稀疏注意力在三分之一的预算下保持召回，位置先验是关键。

   —— sample-paper.pdf · 第 2 页 · AI 结论
   ```
5. 【离屏】显示名规则：对 `n-other-1`（`archive/older-paper.pdf` 第 7 页）复制 → 出处行逐字 `—— older-paper.pdf · 第 7 页`（不含目录段、不含绝对路径）。截图 `65b-note-copy-fragment.png`（把三条片段写进场景日志并截图备注）。
6. 【离屏】反馈时序：`已复制` 在 `sleep(1400)` 后回到 `复制`、`.is-copied` 消失；同一时刻至多一个按钮处于反馈态（连续点两条 → 断言只有最后一条带 `.is-copied`）。
7. 【走查】链路与失败：两个剪贴板函数在 `NotesPanel.vue` 内（ChatPanel 零 diff）；两条都失败时 `setNotice("error", "复制失败：无法访问剪贴板")`——失败路径必须存在且非静默。
8. 【回归】复制按钮不影响行点击与其它行内动作：点 `.note-copy` 不触发 `open-note`（阅读页 `.page-label` 不变）；`.note-ask` 的禁用态与 title 逻辑不变。
9. 【走查】复制是只读操作：不写盘、不改 store 的过滤/选择/排序状态（除 `copiedNoteId` 反馈态）；场景内 `notes.json` 哈希在复制前后相同。

**涉及文件**：`pix/src/renderer/utils/notes-view.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue`。

**数据落盘**：无（只写系统剪贴板）。

---

### N70 纯函数与数据面烟测面

**一句话**：把本轮「代码审查说不清」的部分（匹配规则、排序确定性、空态归因、撤销数据面）用离线烟测钉死，不依赖 Electron。

**验收标准**

1. 【烟测-渲染】脚本用仓库外临时 tsconfig 编译 `pix/src/renderer/utils/notes-view.ts` 与 `notes-path.ts`（`paths` 指 `@shared/*`），node `require` 产物；断言组固定为 `search-basic`、`search-and-filter`、`sort-default`、`sort-created`、`empty-reason`、`copy-fragment`、`undo-expiry`；脚本跑完删除临时目录（仓库内不留残留文件）。
2. 【烟测-主进程】同法编译 `pix/src/main/notes-store.ts` + `pix/src/main/library-root.ts`（核查：两者均不 import electron），在 `%TEMP%` 临时工作区内用真实文件系统驱动，断言组固定为 `undo-roundtrip`、`undo-failures`、`undo-slot-lifecycle`；断言过程中直接读取文件字节做哈希比对（不得只断言返回值）。
3. 【烟测】失败即非零退出码；每条断言必须有可读的中文失败信息（沿用既有烟测脚本风格）。
4. 【check】`cd pix && npm run check` 0 error（新模块不得用 `any` 绕过类型；主进程与渲染层同在一个 tsconfig 覆盖范围内）。
5. 【走查】烟测不落仓库：临时 tsconfig、编译产物、临时工作区全部在 `%TEMP%` 下，脚本结束即删除；不新增 npm scripts（不改 `pix/package.json`）。

**涉及文件**：`pix/src/renderer/utils/notes-view.ts`、`pix/src/main/notes-store.ts`、`pix/src/main/library-root.ts`（只读、不改）。

**数据落盘**：只在 `%TEMP%` 下产生临时文件并在结束时删除。

---

### N71 离屏取证面：SEL 增补 + 60 段场景 + 四组断言

**一句话**：把搜索、排序、撤销、复制的四个必测点与全部边界变成可判定的截图与测量，stub 补上 `notes-restore` 与删除槽控制口。

**验收标准**

1. 【走查】stub 增补（形状与主进程一致，含删除槽语义）：
   - `notesDelete` 成功时写入内存槽 `{ note, index }` 并回传 `note`；
   - `notesRestore(id)`：无槽 / id 不匹配 / 跨 root → `{ success:false, code:"not-found", error:"没有可撤销的删除" }`；同 id 已存在 → `{ success:false, code:"invalid-input", error:"该笔记已重新存在，无法撤销" }`；成功 → 按原下标插回 + 写文件 + 清槽 + 回传 `note`；
   - 控制口：`notesRestoreCalls()`、`clearDeleteSlot()`、`setNotesRestoreFailure(code)`（与既有 `setNotesDeleteFailure` 同形）；
   - 不新增产品代码开关（不得为测试在产品代码里加钩子）。
2. 【走查】`SEL` 增补（命名冻结）：`searchInput: ".notes-search-input"`、`searchClear: ".notes-search-clear"`、`sortBtn: ".notes-sort-btn"`、`searchEmpty: ".notes-search-empty"`、`undoRow: ".notes-undo"`、`undoBtn: ".notes-undo-btn"`、`noteCopy: ".note-copy"`。
3. 【离屏】新增场景（60 段起，避开既有 00–11、20–24、30–36、40–46、50–55）与截图（数量只增不减）：
   - `60-notes-search.png` / `60b-notes-search-left-pane.png` / `60c-notes-search-zoom.png` / `60d-notes-search-cleared.png` / `60e-notes-search-three-dimensions.png`（N63、N64、N66）；
   - `61-notes-search-empty.png` / `61b-notes-search-empty-doc.png` / `61c-notes-search-empty-chapter.png`（N64 空态矩阵）；
   - `62-notes-sort-latest.png` / `62b-notes-sort-default.png`（N65）；
   - `63-notes-undo.png` / `63b-notes-undo-restored.png` / `64-notes-undo-expired.png` / `64b-notes-undo-row-gone.png`（N67、N68）；
   - `65-note-copy-feedback.png` / `65b-note-copy-fragment.png`（N69）。
4. 【离屏】`MEASUREMENTS.json` 至少新增四组断言（组名固定，缺一组即失败）：`notes-search`、`notes-sort`、`notes-undo`、`notes-copy`；每组断言必须包含「失败即抛错」的判据（沿用既有 `record(label, data, failures)` 写法），并至少包含一条**文件字节或剪贴板**级别的判据（不能只断言 DOM）。
5. 【离屏】场景数据准备只用既有 stub 口（`seedNotes` / `notesLoadCalls` / `sendCalls`）与新增的三个控制口；断言不依赖睡眠抖动（唯一允许的长等待是 §N68 的 5.2 s 与 8.2 s 过期窗口，其余用 `waitFor`）。
6. 【离屏】基线比对：改前先跑一次留档（截图数 + `MEASUREMENTS` 值）；改后既有场景全部通过、截图数只增不减、`MANIFEST.json.failure === null`、退出码 0。
7. 【check】`cd pix && npm run check` 0 error（脚本为 `.mjs`，不影响类型面）。

**涉及文件**：`pix/scripts/ui-shot.mjs`。

**数据落盘**：只写 `%TEMP%/pix-r5` 下的夹具与截图（不写仓库）。

---

### N72 回归与零外溢

**一句话**：本轮不破坏既有语义，也不越出白名单。

**验收标准**

1. 【离屏】既有 00–11、20–24、30–36、40–46、50–55 场景全部继续通过；`MANIFEST.json.failure === null`；退出码 0。
2. 【check】`cd pix && npm run check` 0 error。
3. 【走查】`git diff --stat` 只含 §4 白名单文件；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置零改动。
4. 【走查】未触发即无痕：`.notes-search` / `.notes-sort` 只在 `status === "ready" && hasNotes` 时进入 DOM；`.notes-search-clear` 只在查询非空时进入 DOM；`.notes-undo` 只在 `pendingUndo !== null` 时进入 DOM；`.note-copy` 是**常驻**行内按钮（与 `.note-ask` 同级，属于既有行内动作区的加法，必须在 R8 场景中确认 `.note-actions` 仍是右对齐单行、不换行）。
5. 【走查】既有文件零改动（除白名单）：`pix/src/renderer/utils/notes-path.ts`、`outline-notes.ts`、`reading-context.ts`、`composables/**`、`components/workspace/{KnowledgeMap,ReaderPanel,PdfViewer,PdfSearchPanel,PdfSelectionQuickAsk,ChatPanel}.vue`、`pages/WorkspacePage.vue`、`stores/**`（除 `notes-store.ts`）、`assets/styles/**` 的 `git diff` 为空。
6. 【走查】`notes.json` 格式不变：本轮不新增字段、不写 tombstone、不写 `deletedAt`（fixture 文件在「搜索 / 排序 / 复制 / 章节过滤 / 文档切换」前后字节不变；只有删除与撤销会改它）。
7. 【走查】不新增死代码：无未被调用的导出、无「为其它场景预留」的开关、无 `any`、无内联动态 import、UI 文案中文、注释只写约束（向同文件风格看齐）；Vuetify 用法只出现仓库既有写法（本轮新增的输入框是原生 `<input>`，与 `PdfSearchPanel.vue` 同形）。
8. 【走查】不加向后兼容层：不为「旧 notes.json」写兼容分支、不为 `notes-restore` 写双通道、不为缺失字段造默认值。

**涉及文件**：全量走查（无代码改动）。

**数据落盘**：无。

---

## 3. 反需求（本迭代明确不做）

1. **不做批量删除 / 批量选择**（负责人给定）：选择集（R8）的语义是「注入上下文」，复用于批量删除会让同一个勾选框承担两种破坏性语义；批量删除还需要第二套确认与撤销语义，收益远低于风险。
2. **不做全文索引、模糊匹配、拼音、分词、正则、多关键词 OR**：会引入索引服务/缓存与依赖（PRD-V0.4 §4.6），且模糊匹配让「命中数」失去确定含义；子串匹配是唯一可逐字判定的规则。
3. **不做排序偏好持久化**：与「仅看当前文档」同级别（都是这一眼的视图）；一旦写进 `settings`，用户下次打开工作区会看到「自己没设过的顺序」，且需要第三处状态文件读写与容错。
4. **不改 `notes.json` 格式**：不新增字段、不加 `deletedAt`/tombstone/软删除标记；撤销靠主进程内存槽 + 真实反写实现，文件始终只有「存在的笔记」。
5. **不做笔记标签 / 双链 / 知识图谱 / 导出范围选择**：PRD-V0.4 §4.6、§4.4 写死不做；导出永远全量、注入只由选择集决定。
6. **不做多条撤销栈 / 撤销历史面板 / Ctrl+Z 全局撤销**：撤销只作用于最近一次删除；栈会引入跨工作区、跨重启与「撤销顺序」三处新语义，且与「界面所见 = 文件所存」的判定面冲突。
7. **不做「延迟写盘 / 乐观删除」**：删除必须立即落盘；撤销是真实反写而不是定时器骗局（这是本轮硬约束，不允许用「面板先删、文件后删」换取实现简单）。
8. **不做搜索命中高亮 / 搜索内跳转（上一条/下一条）/ 在笔记内定位**：高亮会把 `.note-text` 从纯文本变成 DOM 片段，与「展开全文/折叠」的行数截断逻辑打架，且需要第二套截图断言面；本轮只做过滤。
9. **不做复制多选 / 复制全部 / 复制样式选择（纯文本 / 引用 / 带备注）**：多选复制属批量语义（见 §3.1）；样式选择会让「复制」变成需要弹菜单的交互。
10. **不做跨文档搜索结果的分组重排、不做「搜索结果数」在地图上的扩展**：地图（R9）本轮不参与；搜索是面板视图状态。
11. **不做防抖 / 延迟过滤**：几十条规模下不需要，且防抖会让「输入即时过滤」无法逐帧判定（N63 验收 5）。
12. **不新增依赖、不改 ChatPanel（含抽公共剪贴板模块）、不为测试在产品代码里加开关、不加向后兼容层**：clipboard 两个函数在 `NotesPanel.vue` 内照抄既有写法；stub 控制口只存在于取证脚本生成的文件里。

---

## 4. 文件白名单

### 主进程面

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `pix/src/main/notes-store.ts` | 修改 | 内存删除槽（`{ root, note, index }`）、`restoreNote(id)`（校验 → 原下标插回 → 原子写 → 清槽）、`deleteNote` 成功时回传 `note`、成功重建空库清槽；既有 `loadNotes`/`addNote`/`updateNoteComment`/`exportNotesMarkdown`/`resetCorruptNotes` 的语义与文案**不动** |
| `pix/src/main/ipc-handlers.ts` | 修改 | 新增 `notes-restore` 通道 + 复用 `isNoteId` / `invalidNotesInput` 守卫；其余通道零改动 |
| `pix/src/main/preload.ts` | 修改 | `PixApi` 增 `notesRestore: (id: string) => Promise<ReaderNotesMutationResult>` + `ipcRenderer.invoke("notes-restore", id)` |
| `pix/src/shared/types.ts` | **不改** | 复用 `ReaderNotesMutationResult`；不扩 `ReaderNotesErrorCode`、不新增结果类型（专有文案按调用点写死，先例 `ANSWER_TOO_LONG_MESSAGE`）；`ERROR_TITLES` 的完整性因此不受影响 |

### 渲染层面（含取证脚本）

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `pix/src/renderer/utils/notes-view.ts` | **新建** | `NotesSortMode` / `matchesSearch` / `sortNotesForView` / `applyViewToGroups` / `buildNoteCopyFragment` / `resolveListEmptyReason` / `isUndoExpired` / `UNDO_WINDOW_MS` / `UNDO_ROW_MS` / `UNDO_EXPIRED_MESSAGE`（纯函数，不 import Vue 与 store，供烟测直接编译） |
| `pix/src/renderer/stores/notes-store.ts` | 修改 | 新增 `searchQuery`/`sortMode`/`pendingUndo` 三个视图状态与 `setSearchQuery`/`clearSearchQuery`/`setSortMode`/`undoDelete`/`clearPendingUndo`；`groups` 改为 `applyViewToGroups(groupNotesByDocument(...), …)`；`removeNote` 成功时写 `pendingUndo`；`resetNotes()` 清空三者（排序复位 `"page"`）；选择集/`applyNotes`/`errorMessage`/`loadNotes` 竞态语义**不动** |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | `.notes-search`（输入 + 清空 + Esc）、`.notes-sort`（切换按钮）、`.notes-search-empty` 三文案、计数四分叉、`.notes-undo`（文案/撤销/8 s 定时器）、`.note-copy`（剪贴板两函数 + 1200 ms 反馈）、按 §0.4 重排空态分支；分组/排序/既有计数两态/删除二次确认/notice/导出/错误态/备注/展开/AI 徽标/选择控件与选择条/R9 章节过滤条的 DOM 与文案**零改动** |
| `pix/scripts/ui-shot.mjs` | 修改 | stub 增 `notesRestore` + 删除槽 + 三个控制口、`SEL` 增补、60–65 段场景与截图、四组断言（含文件哈希与剪贴板判据） |
| `pix/src/renderer/utils/notes-path.ts` | **不改** | 分组入口 `groupNotesByDocument` 与判定式 `matchesChapterFilter` 保持 R9 契约；搜索与排序在其**之后**由 `notes-view.ts` 承担（不在本文件加第二个维度） |
| `pix/src/renderer/utils/outline-notes.ts`、`reading-context.ts`、`pix/src/renderer/composables/**`、`pages/WorkspacePage.vue`、`components/workspace/{KnowledgeMap,ReaderPanel,PdfViewer,PdfSearchPanel,PdfSelectionQuickAsk,ChatPanel}.vue`、`stores/{reader,reader-state,session,project,settings,auth}-store.ts`、`assets/styles/**` | **不改** | 见不变量 2–4；注入链路、跳页、地图、章节过滤的 token 机制、R6 现场全部原样 |

范围外（任何情况下不动）：`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置、`pix/resources/skills/**`。

---

## 5. 风险 Top3 与判定方式

**R1 「界面所见 ≠ 文件所存」** —— 最致命的失败模式：撤销被实现成「面板先删、定时器到期再写盘」，或撤销只是把条目塞回本地列表而没写文件；用户看到的与磁盘上的不一致，关掉应用就丢数据（或反之）。

- 判定：N67 验收 6（删除后立即读文件：条目已消失、哈希变化）+ 验收 3（撤销后文件字节与删除前**完全一致**）+ N67 验收 4（失败路径文件字节不变）+ N67 验收 10（失败不静默）+ N68 验收 3（过期分支不发 IPC、`notesRestoreCalls()` 增量为 0）+ 走查（`removeNote` 只有一条写路径，无延迟写盘/乐观合并）。
- 失败信号：删除后 `notesHash()` 未变；撤销后 `createdAt` 或数组顺序被改动（哈希不等）；过期点击仍发出 IPC；渲染层出现「本地先删、稍后写」的分支或任何 `setTimeout` 里调用写接口。

**R2 「计数与列表互相撒谎」** —— 四个维度（搜索 / 章节 / 仅看当前文档 / 排序）叠加后，头部数字、组头数字、列表行数、空态归因四者出现不一致（典型：搜索生效却报了「本章暂无笔记」，或计数写「共 4 条」而列表只有 1 行）。

- 判定：N66 验收 5（四分叉真值表逐字）与验收 4（空态六分支）+ N63 验收 4（每次输入后同步断言行数与计数）+ N64 验收 3（空态矩阵按类名与文案逐一断言）+ N66 验收 3（烟测：可见集合 = 三谓词交集）+ 走查（单一管道、单一定点实现）。
- 失败信号：`NotesPanel.vue` 模板里出现 `filter(`/`sort(`；`countLabel` 出现第五种文案；搜索无匹配时渲染 `.notes-chapter-empty`/`.notes-filtered-empty`；`V` 与 `.note-row` 数量不等。

**R3 「撤销越界」** —— 撤销被用在它不该作用的地方：跨工作区把 A 库删掉的笔记写进 B 库；重复还原同一条；把新摘录覆盖掉；或撤销把选择集/章节过滤/阅读位置一起改掉，造成「撤销之后状态漂移」。

- 判定：N67 验收 4（跨 root 拒绝且另一个库零改动、id 占用拒绝、写失败保槽）+ N67 验收 5（槽生命周期：第二次删除覆盖、成功还原后不可重复、重建空库清槽）+ N68 验收 8/9（连续删两条只撤销最近一条、还原后可再删再撤）+ N67 验收 8（撤销不改选择集：`已选 1 条` 回来）+ N68 验收 11（撤销行与过滤无关、撤销不改三个维度）+ 走查（渲染层不拼路径、还原载荷只来自主进程槽）。
- 失败信号：`restoreNote` 不校验 root 或 id 占用；槽在 `addNote`/`updateNoteComment` 后被清空或保留错误；撤销后 `chapterFilter`/`searchQuery`/阅读页发生变化；渲染层把完整 `ReaderNote` 传给主进程还原。

**次级风险（不占 Top3）**：①`UNDO_ROW_MS`（8 s）与 `UNDO_WINDOW_MS`（5 s）双常量被后续实现「合并成一个」，导致过期提示在 UI 上不可达（判定：N68 验收 1/2 的常量断言 + 场景 64 的 5.2 s 点击路径）；②三个定时器（notice 4 s / confirm 3 s / undo 8 s）与选择态并存时的清理遗漏（判定：N68 验收 4 的 `onBeforeUnmount` 走查 + 场景 64b 的切标签往返）。

**开放问题（需负责人确认，不阻塞本档定稿）**：
1. 撤销**行**保留 8 秒、撤销**窗口** 5 秒（行比窗口长 3 秒）——这是为了让「撤销窗口已过期」这条中文失败提示在界面上可达、可截图判定。若更希望行与窗口都是 5 秒，则该失败路径只存在于竞态代码里（走查 + 烟测可覆盖，离屏不可判定），是否接受。
2. 「最新优先」是否也应重排**文档分组**（本轮冻结为：只改组内顺序，组序仍是「当前文档组置顶 → key 升序」）；若希望最新笔记所在的文档组上浮，需要在 R9 的组序语义上开一个口子。
3. 搜索词在**文档切换时保留**（只在离开工作区时清空），且命中范围**不含文档名与页码**（只搜原文与备注）——是否符合预期；若希望搜索随文档切换清空，或希望文档名/页码也参与匹配，需要在 §0.1/§0.3 改口径后再进入设计。
