# PiX-Read R9 需求档 · 结构可见（N52–N62）

> 上游：`docs/pm/PRD-V0.4.md` §2（R9 = 结构联动：知识地图显示各章笔记数与阅读进度，视觉迭代）、§7.4（成功判据：地图上能看出「这一章我读了多少、摘了几条」）、§4（版本级反需求：不引依赖、不做 LLM 生成导图、不做静默注入）。
> 依赖：R6（`readerStore.page/pageCount`、阅读现场只读消费）、R7（`kind = excerpt | answer` 两类笔记）、R8（选择集、chip、`reader_notes` 注入链路）。
> 本轮唯一主线：**让知识地图成为结构导航面** —— 每个可跳页节点显示该章节页码范围内的笔记数（含两类明细）、点击徽标把笔记面板限定到该章节、地图头部显示阅读位置与全书进度、已读章节弱化。
> 判定工具（本档所有验收只能由这四种证据判定，逐条已标注）：
> - 【走查】代码审查：只读文件内容与 `git diff` / `git status` / `git show`（只读可用）。
> - 【check】`cd pix && npm run check` 必须 0 error（唯一工程门）。
> - 【烟测】纯函数离线烟测：把 `pix/src/renderer/utils/{outline-notes,notes-path}.ts` 用**仓库外临时 tsconfig**（`paths` 把 `@shared/*` 指向 `pix/src/shared/*`）+ `tsc --outDir %TEMP%/… --module commonjs --target es2022 --skipLibCheck --strict` 编译，node 直接 `require` 产物断言（type-only import 不产生运行时依赖）；脚本跑完删除。
> - 【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + `MEASUREMENTS.json` 新增断言组全绿 + 新增截图齐备。
> 本档不写实现代码；契约给出**冻结字面量**与理由。设计档可细化机制，但不得改写下文「冻结」项与 §0 的数值/文案。

---

## 0. 冻结契约（设计档、开发档、评审档均不得改写）

### 0.1 页码范围的唯一口径（计数、过滤、徽标、已读共用同一份派生）

**唯一实现点**：新建纯函数模块 `pix/src/renderer/utils/outline-notes.ts`（不 import Vue、不 import store），导出：

| 导出 | 契约 |
| --- | --- |
| `buildChapterRanges(nodes: ReaderOutlineNode[], pageCount: number): Map<string, ChapterRange>` | `ChapterRange = { key; title; start: number; end: number; label: string }` |
| `countNotesByChapter(ranges, notes: ReaderNote[], docKey: string \| null): Map<string, ChapterNoteCount>` | `ChapterNoteCount = { total; excerpt; answer }` |
| `rangeContains(range: { start: number; end: number }, page: number): boolean` | 闭区间 `start <= page <= end` |
| `matchesChapterFilter(note: ReaderNote, docKey: string \| null, range: { start; end } \| null): boolean` | 章节过滤的唯一判定式（§0.4） |

`KnowledgeMap.vue` 不得再持有 `buildPageLabels` / `buildRangeEnds` 的第二份实现：两个既有私有函数的逻辑**整体迁入**本模块（页面上不再出现同名第二实现），`pageLabels` 与 `rangeEnds` 由 `buildChapterRanges` 同时产出（`label` 与 `end` 同源）。

**范围算法（逐字冻结，与今天 `buildRangeEnds` 同源）**：
- 键 = 预序位置键，与既有 `flattenVisible` 完全一致的规则：根为 `"root"`，第 i 个子节点为 `` `${parentKey}/${i}` ``；**含未展开节点**（全量预序，与展开状态无关）。
- `page == null`（无页码）的节点**不进 Map**：无徽标、不可点击过滤、不参与已读判定；其有页码的后代照常计算（不受父节点无页码影响）。
- `start = node.page`；`end =` 预序中**第一个 `page` 严格大于 `start`、且 `page != null` 的节点**的 `page − 1`；不存在这样的节点时 `end = pageCount`（`pageCount > 0`），`pageCount === 0` 时 `end = Number.POSITIVE_INFINITY`（仅防御，不参与渲染）。
- `label`：`end === start` 时为起始页的十进制字符串，否则为「起始页-结束页」（半角连字符），与既有页码徽标同格式（`378-385` / `12`）。

**两条必须写进设计档的后果（不是缺陷，是本口径的定义）**：
1. **同页重叠**：两个节点起始页相同 ⇒ 范围相同 ⇒ 同一条笔记计入两者（计数之和 ≥ 该文档笔记数，允许重复计数）。
2. **父节点范围不保证覆盖后代**：预序中第一个更大页码的节点可能是自己的后代（父在第 1 页、某后代在第 2 页 ⇒ 父范围 `[1,1]`）。因此计数口径是「**页码范围内的笔记数**」，不是「子树内的笔记数」——这正是既有 `isCurrent`（当前章节高亮）使用的口径，保持两者永远一致。
3. **不落在任何范围内的笔记**（例：目录从第 2 页开始时的第 1 页笔记）**不出现在任何徽标上**，也不被章节过滤命中；不为它新增「未归类」节点。

**相对今天的唯一文案变化（有意为之，必须写进开发档与场景）**：无更大后继页码的节点，徽标由「单页」变为「起始-结束」（例：末章起始 5、总 10 页 ⇒ 徽标 `5-10`，今天显示 `5`）。理由：该节点的当前章节高亮本来就覆盖 5–10，徽标若显示 `5` 会与计数、过滤范围撒谎。有后继页码的节点（绝大多数）徽标文本逐字不变。

### 0.2 笔记数徽标的确切 DOM、文案与样式

徽标渲染在 `.map-row` 内、`.map-node` **之后**的同级位置（`<button class="map-node">` 是 `<button>`，禁止在其内部嵌套交互元素）；章节行与子行两个 `v-for` 分支都要渲染。

```html
<button type="button" class="note-count-badge" :title="…">
  <v-icon size="11">mdi-notebook-outline</v-icon>
  <span class="note-count-num">{{ total }}</span>
</button>
```

| 项 | 冻结值 |
| --- | --- |
| 渲染条件 | `total > 0`（`v-if`）。**0 条不进入 DOM**（不是 `display:none`、不是渲染 `0`） |
| `.note-count-num` 文本 | 十进制整数（无前缀后缀、无单位），如 `3` |
| `title` 逐字 | `{total} 条笔记 · 摘录 {excerpt} · AI 结论 {answer}；点击只看该章节笔记`（两类**恒显示，含 0**，如 `2 条笔记 · 摘录 2 · AI 结论 0；点击只看该章节笔记`） |
| 尺寸/排版 | 高 16px（与 `.page-badge` 同高）、`padding: 0 5px`、`border-radius: 999px`、`font-size: 10px`、`font-weight: 600`、`font-variant-numeric: tabular-nums`、`flex-shrink: 0`、`display: inline-flex; align-items: center; gap: 3px` |
| 配色 | 背景 `color-mix(in srgb, var(--branch) 16%, #fff)`、文字与图标 `var(--branch)`、`border: 1px solid color-mix(in srgb, var(--branch) 32%, transparent)`（边框是与 `.page-badge` 的唯一视觉差异点） |
| hover | 背景 `color-mix(in srgb, var(--branch) 26%, #fff)`，无位移/无阴影变化 |
| 既有类名 | `.map-row`/`.map-node`/`.page-badge`/`.dot`/`.label`/`.row-chevron`/`.map-header`/`.map-heading`/`.map-count`/`.map-tree`/`.chapter-block`/`.map-children` 全部保留原样，不重命名、不挪位 |

计数输入：`notesStore.notes`（工作区全量，读侧已校验）∩ 当前文档 ∩ 页码范围。当前文档判定复用 `utils/notes-path.ts` 的 `currentDocKey`（唯一实现点，不得在 `KnowledgeMap.vue` 里另写路径比较）。`kind === "answer"` 计入 `answer`，`kind === "excerpt"` 计入 `excerpt`，`total = excerpt + answer`。

### 0.3 章节过滤条的确切 DOM 与文案

渲染位置：`NotesPanel.vue` 的 `.notes-header` 内、`.notes-filter`（「仅看当前文档」开关）之后、`.notes-selection-bar` 之前。

```html
<div v-if="notesStore.status === 'ready' && notesStore.chapterFilter" class="notes-chapter-filter" :title="…">
  <span class="notes-chapter-filter-text">章节：{{ title }} · 第 {{ label }} 页</span>
  <button type="button" class="notes-chapter-filter-clear" title="清除章节过滤，恢复全部笔记">清除</button>
</div>
```

| 项 | 冻结值 |
| --- | --- |
| 渲染条件 | `notesStore.status === "ready"` 且 `chapterFilter !== null`（与 R8 选择条同范式；loading / error 期间不渲染、过滤状态保留在 store，回到 ready 后原样出现） |
| `.notes-chapter-filter-text` 逐字 | `章节：{章节名} · 第 {label} 页`，`{label}` 取 §0.1 的 `label`（如 `章节：2. Method Overview · 第 2 页`；区间形态如 `章节：3.2 消融实验 · 第 42-48 页`） |
| 章节名 | 与地图行渲染的同一个字符串（`node.title.trim() || "未命名"`） |
| 换行 | 单行省略（`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`）；完整文案挂在容器 `title` 上 |
| 容器 `title` 逐字 | `仅显示当前文档「{文档显示名}」该章节范围内的笔记；点「清除」恢复全部笔记`（`{文档显示名}` 取 `docDisplayName(currentDocKey)`） |
| 清除按钮 | 文本 `清除`，单击即清除（**不做二次确认**，与删除按钮的二次确认无关） |
| 计数文案（章节过滤生效时） | `本章 {visible} 条 / 共 {total} 条`（既有 `共 N 条` 与 `当前 X 条 / 共 N 条` 两种文案在章节过滤不生效时逐字节不变） |
| 列表空态（章节过滤生效且可见行 0） | 新增 `.notes-chapter-empty`，文案逐字 `本章暂无笔记` |
| 列表分支优先级 | loading → error → `!hasNotes`（既有「还没有摘录」） → 章节过滤空态 → 既有 `.notes-filtered-empty`（「当前文档暂无笔记」） → 列表 |

### 0.4 章节过滤的判定式与作用域（含与「仅看当前文档」的组合）

**判定式（唯一）**：一条笔记可见 ⇔ `matchesChapterFilter(note, currentDocKey, chapterFilter)`。`chapterFilter` 非空时该式为 `docPathKey(note.docPath) === currentDocKey && rangeContains(range, note.page)`。

由此**写死**下列语义（验收逐条判定）：
1. **AND**：「仅看当前文档」判定式为 `docPathKey(note.docPath) === currentDocKey`；章节过滤判定式已蕴含该条件 ⇒ 两者同时生效时的可见集合 = 章节过滤单独生效时的可见集合。**开关关闭时，章节过滤仍只显示当前文档该章节范围内的笔记**（范围只在当前文档的页码体系里有意义，不得解释到其它文档）。
2. **不改写开关**：章节过滤生效**不得**程序化打开/关闭 `currentDocOnly`；用户在 UI 上看到的开关值始终是他自己的选择。走查判据：除 `setCurrentDocOnly` 外全仓库无第二处写 `currentDocOnly`。
3. **其它文档分组在章节过滤生效期间不显示**（`.notes-group` 数量恒为 1，即当前文档组）。
4. **文档作用域 + 清除点**：`currentDocKey` 变化（或变为 `null`）时，store 必须把 `chapterFilter` **置为 `null`**（单点 `watch(currentDocKey)`，不是「读取时忽略」）；`resetNotes()`（离开工作区/卸载）同样置 `null`。切回原文档**不恢复**过滤（已被清除）。
5. **清除动作**：`clearChapterFilter()` 只把 `chapterFilter` 置 `null`；不改标签、不改阅读位置、不改选择集、不写盘、不发 IPC。
6. **生效条件**：`currentDocKey === null` 时徽标点击是 **no-op**（不写 filter、不请切换标签）。

### 0.5 已读/未读的判定与视觉（不新增第二套颜色体系）

- 判定（三态互斥，逐行）：
  - `.map-row.read` ⇔ 该行在 `buildChapterRanges` 中且 `end < readerStore.page`（**严格小于**）；
  - `.map-row.current` ⇔ 该行在 ranges 中且 `start <= page <= end`（既有 `isCurrent`，逻辑零改动）；
  - 其余（`start > page`，或无页码节点）不加任何类，视觉与今天一致。
- 恒等式（可判定）：同一行**不得**同时带 `.read` 与 `.current`；`.read` 不得落在无页码节点上。
- 视觉（唯一改动点，写死）：`.map-row.read { opacity: 0.55; }` —— 整行（含 `.dot`、`.label`、`.page-badge`、`.note-count-badge`、分支色背景与连接线）等比弱化。**禁止**新增颜色变量、禁止改 `BRANCH_COLORS`、禁止给 `.read` 换色或加灰阶滤镜；`.read` 行的交互（跳页、徽标点击）与 hover 行为不变。
- 已读不改变徽标数字与可点击性（弱化只是视觉）。

### 0.6 地图头部的进度文案与取整

- DOM：`.map-header` 内，新增一行 `.map-progress`（DOM 顺序：`.map-heading` 与 `.map-count` 所在的既有行之后）。
- 渲染条件：`readerStore.pageCount > 0`；`pageCount === 0` 时不渲染（头部与今天一致）。
- 文案逐字：`第 {page} / {pageCount} 页 · {percent}%`，分隔符为**半角空格 + `·` + 半角空格**（与 `继续阅读：… · 第 N 页` 同风格）；页码段与 `PdfViewer` 的 `.page-label`（`第 N / M 页`）同源同值。
- 取整：`percent = Math.round((page / pageCount) * 100)`；`Math.round` 的边界按 JS 语义（1/3 → `33`、2/3 → `67`、3/3 → `100`、1/1 → `100`）；不带小数、不带 `~`。
- 一致性：进度页码 `N` 与 `.map-row.current` 同源（都由 `readerStore.page` 与同一份 ranges 派生），页面无任何第二处页码来源。
- 不新增交互：`.map-progress` 不可点击、不拖拽（反需求 §3）。

### 0.7 一次性聚焦语义（禁止残留标记反复抢焦点）

- 跨栏信号只允许既有两种范式：`notesStore` 状态 + `WorkspacePage` 编排，或既有 module-level seam（`composables/useQuickAsk.ts`）。**不得新增第三个模块级 seam 文件**。
- 冻结形状：`notesStore` 增 `chapterFilter`（数据）与 `chapterFocusToken: number`（一次性请求，初值 `0`，**单调递增**）；`focusChapter({ title, start, end })` 先写 `chapterFilter` 再 `chapterFocusToken += 1`；`WorkspacePage` 以 `watch` 消费 token，效果 = `leftCollapsed = false` + 切到笔记标签（`leftTab = "notes"`）。
- 判定（写死）：切标签的触发条件**只能**是「token 发生变化」这一次事件。**不得**存在读取 `chapterFilter !== null` 来切标签的代码路径；组件重新挂载、文档切换、重渲染、过滤清除、笔记重载都不得触发标签切换。
- 每次点击徽标都有效（即使 `chapterFilter` 内容与当前相同）：不存在「同内容视为 no-op」的分支。
- 左栏折叠时点击徽标必须同时展开左栏（否则过滤生效但用户看不到结果）。

### 0.8 冻结的类名/常量清单（离屏断言依赖，不得改名）

| 选择器 / 常量 | 含义 |
| --- | --- |
| `.map-progress` | 地图头部进度行（§0.6） |
| `.map-row.read` | 已读行（§0.5，章节行与子行都可能带） |
| `.note-count-badge` / `.note-count-num` | 章节笔记数徽标与其数字（§0.2） |
| `.notes-chapter-filter` / `.notes-chapter-filter-text` / `.notes-chapter-filter-clear` | 章节过滤条与其清除按钮（§0.3） |
| `.notes-chapter-empty` | 章节过滤空态（文案 `本章暂无笔记`） |
| `pix/src/renderer/utils/outline-notes.ts` | §0.1 的四个纯函数（模块路径与函数名冻结，供烟测 `require`） |
| `BRANCH_COLORS`（既有，不得改） | `["#5b8def","#2a9d8f","#c4891a","#7c6bc4","#c45c6a","#3d8ea0"]` |
| `READ_OPACITY = 0.55` | 已读行不透明度（写在 `KnowledgeMap.vue` 样式表中；如需具名常量只允许一处） |

---

## 1. 本轮目标与不变量（违反任一即为回归，设计档必须逐条声明、开发档逐条自评）

目标：让知识地图从「目录树」升级为「结构导航面」——**每个可跳页章节节点在地图上自带笔记数与阅读状态，点徽标即把笔记面板限定到该章节**；一切视觉新增都必须复用既有语言（`BRANCH_COLORS`、既有 CSS 变量、既有 `.page-badge` 版式），不新增颜色体系、不新增依赖。

1. **地图既有行为零破坏**：节点点击跳页（`gotoPage` 记录 `suppressScrollUntil` 抑制窗口）、默认展开规则（`collectExpandable` 只展开 depth 0 的有子节点）、当前章节高亮（`isCurrent`）与滚动跟随（flush: post + `.current` 查询）、宽度守卫（`ReaderPanel` 的 `MIN_STAGE_WIDTH_FOR_MAP` 与 `.map-toggle:disabled`）、空态（「当前文档没有书签」）、`N20`/`R6` 的落页优先级（`pendingJump > 现场恢复 > 第 1 页`）全部保持。**本轮不修改 `ReaderPanel.vue` 与 `PdfViewer.vue`**。
2. **笔记面板既有语义零改动**：分组键与组内排序（`groupNotesByDocument`）、当前文档组置顶、`.notes-filter` 开关、无章节过滤时的计数文案与 DOM 逐字节不变、删除二次确认（3 s + capture `pointerdown`）、加载/错误/逃生口状态机、跳回原文、备注编辑、展开全文、AI 徽标、R8 的选择控件/选择条/上限与提示 —— 全部保持；章节过滤条是**加法**，且未触发时**不进入 DOM**。
3. **R8 选择集与注入零影响**：章节过滤只影响面板视图派生；选择集（`selectedNoteIds`）、条数上限、chip 文案、`<reading_context>` 的 `reader_notes` 段与发送链路**零改动**（`reading-context.ts`、`ChatPanel.vue`、useQuickAsk 的笔记通道 `git diff` 为空或仅注释）。被过滤隐藏的笔记仍可被选中、仍会被注入。
4. **R6 进度链路零改动**：资料库树 `.row-progress` 徽标、续读入口、`.pix-read/reader-state.json` 的读写时机与容错不变；本轮**不写**任何状态文件（地图进度只读 `readerStore.page/pageCount` 内存值）。
5. **零外溢 + 唯一工程门**：`packages/**`、`pix/package.json`（含 `dependencies`）、`package-lock.json`、`pix/build/**`、electron-builder 配置、`pix/src/main/**`、`pix/src/shared/types.ts` 零改动；不新增依赖（尤其不得引入 d3 / markmap）；`cd pix && npm run check` 0 error；新增 UI 元素在未触发时不得进入 DOM。

---

## 2. 需求明细

### N52 章节页码范围的单一派生

**一句话**：页码范围、页码徽标文本、笔记计数范围、章节过滤范围、已读判定上界，全部来自 `utils/outline-notes.ts` 的同一份 `buildChapterRanges` 结果，仓库内不存在第二份实现。

**用户可见行为**：无直接可见变化（唯一例外见 §0.1 末段：无更大后继页码的节点，页码徽标由单页变为区间）。

**验收标准**

1. 【走查】`KnowledgeMap.vue` 内不再存在 `buildPageLabels` / `buildRangeEnds` 函数体（`grep -n "buildPageLabels\|collectPreorder" pix/src/renderer/components/workspace/KnowledgeMap.vue` 不命中私有实现，只允许 import）；`grep -rn "预序\|collectPreorder" pix/src/renderer/utils/outline-notes.ts` 命中唯一实现。
2. 【走查】`outline-notes.ts` 不 import Vue / Pinia / 组件 / store；只 import `@shared/types` 的类型与 `./notes-path` 的 `docPathKey`（顶层 import，无动态 import、无 `any`）。
3. 【烟测】`buildChapterRanges` 逐条：无后继页的节点 `end === pageCount`、`label` 为 `start-end`；`start === end` 时 `label === String(start)`；`page === null` 的节点不在 Map 中（`Map.has(key) === false`）；键规则与 `flattenVisible` 一致（未展开的孙节点也在 Map 中）；`pageCount === 0` 时无后继节点的 `end === Number.POSITIVE_INFINITY`。
4. 【烟测】同页重叠：两个节点同页 ⇒ 两者的 `start/end/label` 相同，且同一条笔记同时计入两者（`countNotesByChapter` 两个键的 `total` 均为 1）。
5. 【烟测】父不覆盖后代：预序 `[p1, c2]`（父在第 1 页、子在第 2 页）⇒ 父范围 `[1,1]`、子范围 `[2,2]`；第 2 页的笔记只计入子。
6. 【走查】`page-badge` 的文本来源只有一个（`ChapterRange.label`），模板内不出现第二处页码拼接（不得出现 `${page}-${end}` 之类模板表达式）。
7. 【离屏】`sample-paper.pdf`（书签声明见 N61）打开地图后，`.page-badge` 文本序列逐字等于声明标签；无后继页码的末节点显示区间（夹具需构造该节点，见 N61）。

**涉及文件**：`pix/src/renderer/utils/outline-notes.ts`（新建）、`pix/src/renderer/components/workspace/KnowledgeMap.vue`。

**数据落盘**：无。

---

### N53 地图头部：阅读位置与全书进度

**一句话**：地图头部新增一行进度，显示当前页/总页数与百分比，与既有当前章节高亮同源。

**用户可见行为**：打开地图后，标题行下方显示 `第 2 / 3 页 · 67%`；翻页时该行随阅读位置实时变化；文档未加载完（无页码）时不显示这一行。

**验收标准**

1. 【走查】`.map-progress` 的值来源只有 `readerStore.page` / `readerStore.pageCount`（模板内不出现第二处页码计算）；格式化（拼接与取整）只有一个实现点（组件内 `computed`），不在模板内联算式。
2. 【离屏】打开 `sample-paper.pdf` 地图，第 1 页：`.map-progress` 文本逐字 `第 1 / 3 页 · 33%`；跳页到 2（`readerStore.gotoPage` 路径，即点 `下一章/下一页` 或笔记跳转）：逐字 `第 2 / 3 页 · 67%`；到 3：逐字 `第 3 / 3 页 · 100%`（截图 `53-map-progress.png` 与 `53b-map-progress-p2.png`）。
3. 【离屏】同一采样内，`.map-progress` 的 `N / M` 与 `.page-label` 的 `第 N / M 页` 中的 N、M 相等（两处字符串各自截取后相等）。
4. 【离屏】与高亮一致：当 `N` 落在任一节点范围内时，`.map-row.current` 数量 ≥ 1；夹具保证第 1 页属于某节点（否则该断言改为「`.current` 数量 === 期望值 0」并在场景注明）。
5. 【边界】`pageCount === 0`（PDF 加载中/文本预览）：地图不渲染（`mapOpen` 只在 PDF 时生效），断言 `.map-progress` 不存在。
6. 【边界】无书签文档（`older-paper.pdf`）：`.map-empty` 存在且 `.map-progress` **仍渲染**（进度与目录有无无关）。
7. 【走查】`.map-heading`（文档名 + 知识地图）与 `.map-count`（节点数）文本、位置、样式不变。

**涉及文件**：`pix/src/renderer/components/workspace/KnowledgeMap.vue`。

**数据落盘**：无。

---

### N54 章节笔记数徽标与两类悬浮明细

**一句话**：每个有页码的节点，若其页码范围内有当前文档的笔记，就在行尾显示徽标；`title` 分列摘录与 AI 结论条数；0 条不显示任何元素。

**用户可见行为**：`3.2 消融实验` 行尾出现带小图标与数字的徽标；鼠标悬浮显示「2 条笔记 · 摘录 1 · AI 结论 1；点击只看该章节笔记」；没有笔记的章节行外观与今天完全一致。

**验收标准**

1. 【走查】徽标是 `.map-row` 的直接子元素、排在 `.map-node` **之后**（不嵌在 `<button>` 内）；章节行与子行两个分支都渲染，且都只读同一个 `Map.get(row.key)`（模板内不出现 `noteCount(row)`、`countOf(row)` 之类的按行调用）。
2. 【走查】计数输入 = `notesStore.notes`（全量清单）∩ `notesStore.currentDocKey` ∩ 范围；`kind` 精确二分（`"answer"` → AI 结论，`"excerpt"` → 摘录）；`total = excerpt + answer`。
3. 【走查】计数与面板/地图其它状态**解耦**：计数 computed 不读 `currentDocOnly`、不读 `selectedNoteIds`、不读 `expanded`（`git diff` 可核对依赖列表）。
4. 【离屏】标准种子（`n-current-1` p1、`n-current-2` p2、`n-current-3` p2 且 `kind=answer`、`n-other-1` 属另一文档）+ `sample-paper.pdf` 书签（N61）：
   - `1. Abstract` 行 `.note-count-num` 逐字 `1`，`title` 逐字 `1 条笔记 · 摘录 1 · AI 结论 0；点击只看该章节笔记`；
   - `2. Method Overview` 行 `2`，`title` 逐字 `2 条笔记 · 摘录 1 · AI 结论 1；点击只看该章节笔记`；
   - 其子节点 `2.1 Sparse mask budget`（同页）`2`，`title` 同上；
   - 范围为 0 条的两个节点**不存在** `.note-count-badge`（按行 key 查询返回 `null`），且这两行 DOM 子元素与今天一致（仅 chevron + `.map-node`）；
   - 徽标总数 === 范围内有笔记的节点数（fixture 内写死的期望值）；
   - 另一文档的笔记（`n-other-1`，page 7）**不得**计入任何节点。
   截图：`51-map-note-badges.png`（地图槽）+ `51b-map-badge-zoom.png`（单个徽标放大）。
5. 【离屏】徽标视觉：`getComputedStyle(.note-count-badge)` 的 `height === "16px"`、`borderRadius === "999px"`、`fontSize === "10px"`、`borderTopWidth === "1px"`；`.note-count-num` 文本为纯数字。
6. 【离屏】切换「仅看当前文档」开关前后，同一批徽标的数字与 title **完全不变**（计数不受面板筛选影响）。
7. 【边界】`currentDocKey === null`（打开的资料库外文件）：所有节点无徽标（可点击入口一并消失）。
8. 【边界】`notesStore.status === "error"`（本地清单为读取失败前的旧值）时徽标照旧渲染，不新增任何错误提示、不清零（地图不承担笔记错误态）。
9. 【边界】笔记页超出全部范围（例：文档 3 页、某笔记 page 9）：不显示在任何徽标上，不报错。
10. 【回归】未渲染徽标的行与 `page-badge` 的既有版式逐像素不变（`MEASUREMENTS` 中页面徽标 `x/w/h/fontSize` 与改前同值）。

**涉及文件**：`pix/src/renderer/components/workspace/KnowledgeMap.vue`、`pix/src/renderer/utils/outline-notes.ts`。

**数据落盘**：无（计数只读内存清单）。

---

### N55 点击徽标：章节过滤 + 左栏一次性聚焦

**一句话**：点徽标 = 写入章节过滤状态 + 请求一次「展开左栏并切到笔记标签」；不跳页、不改阅读位置、不改选择集。

**用户可见行为**：点 `2. Method Overview` 的徽标 → 左栏（若折叠则展开）切到「笔记」标签，面板顶部出现「章节：2. Method Overview · 第 2 页　清除」，列表只剩该章节的 2 条笔记。

**验收标准**

1. 【走查】通道唯一：`KnowledgeMap` 只调用 `notesStore.focusChapter({ title, start, end })`（或设计档等价的单一动作），不 import `WorkspacePage`、不新增 module-level seam 文件、不发 DOM 自定义事件。
2. 【走查】一次性语义：`WorkspacePage` 的标签切换只由 `chapterFocusToken` 变化触发；代码中**不存在**读取 `chapterFilter`（或其存在性）来切标签/改 `leftCollapsed` 的路径；token 在 `resetNotes()` 中复位为 `0`。
3. 【走查】`focusChapter` 的全部副作用：写 `chapterFilter`（含 `docKey = currentDocKey`）+ `chapterFocusToken += 1`。不调用 `gotoPage`、不改 `leftTab`（由 `WorkspacePage` 消费 token）、不清选择集、不发 IPC。
4. 【离屏】点 `1. Abstract` 徽标（先停在「资料库」标签）：活动标签为「笔记」（`.pill-tab.active` 的 `data-tab === "notes"`）；`.notes-chapter-filter-text` 逐字 `章节：1. Abstract · 第 1 页`；列表行数 === 1（=== 徽标数字）；`.notes-group` 数量 === 1；`readerStore` 侧阅读页仍是点击前的页（`.page-label` 文本不变）；`.map-row.current` 不变。截图 `52-map-chapter-filter.png`（全窗口）+ `52b-map-chapter-filter-left-pane.png`（左栏）+ `52c-map-chapter-filter-zoom.png`（过滤条放大）。
5. 【离屏】点**子行**徽标（`2.1 Sparse mask budget`）同样生效：过滤条文案含该子节点标题与范围，行数 === 2（与父节点同范围 ⇒ 同一结果集，作为重叠计数的可见证据）。
6. 【离屏】左栏折叠态：点「折叠资料库」（`.pill-icon-btn[title="折叠资料库"]`）→ 点徽标 → 左栏展开（`.layout-left` 可见且宽度 > 0）+ 活动标签为「笔记」+ 过滤生效。截图 `52d-map-chapter-filter-collapsed.png`。
7. 【离屏】再次点击同一徽标（过滤内容相同）：仍切到「笔记」标签（不得被判为 no-op）；过滤条文案不变、行数不变。
8. 【边界】过滤生效期间点击**另一个**章节的徽标：过滤被替换为新章节（无累积、无「多章节」状态）；列表行数 === 新徽标数字。
9. 【边界】`currentDocKey === null` 时（徽标本就不渲染）不存在可点击入口；直接调用 `focusChapter` 是 no-op（走查 + 烟测：`chapterFilter` 保持 `null`、token 不变）。
10. 【边界】`notesStore.status === "loading"`（进入笔记标签会触发 `loadNotes`）期间：过滤条暂不渲染，加载完成后按 `chapterFilter` 原样出现（不出现「点了徽标但过滤丢失」）。

**涉及文件**：`pix/src/renderer/components/workspace/KnowledgeMap.vue`、`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/pages/WorkspacePage.vue`。

**数据落盘**：无。

---

### N56 章节过滤条：可见状态、清除与 AND 组合

**一句话**：过滤状态在面板顶部可见（章节名 + 页码范围），一键清除；与「仅看当前文档」是 AND 关系且不改写开关。

**用户可见行为**：过滤生效时面板顶部出现一行「章节：2. Method Overview · 第 2 页　清除」，头部计数变为「本章 2 条 / 共 4 条」；点「清除」→ 该行消失、列表与计数回到全量；「仅看当前文档」开关的位置与状态不受影响。

**验收标准**

1. 【走查】DOM 与文案逐字按 §0.3（含容器 `title`）；`.notes-chapter-filter` 在 `.notes-filter` 之后、`.notes-selection-bar` 之前（DOM 顺序断言：比较三者 `getBoundingClientRect().top` 或 `compareDocumentPosition`）。
2. 【走查】过滤实现唯一：分组侧由 `groupNotesByDocument(notes, currentKey, onlyCurrent, chapterRange)` 的第四参承担（默认 `null`，既有调用点行为不变）；`NotesPanel` 内不出现第二条筛选管道（不得在模板内 `filter()`）。
3. 【走查】判定式逐字为 §0.4（`matchesChapterFilter`）：doc 归属 + 闭区间；`NotesPanel` / store 内不出现第二份区间比较。
4. 【离屏】AND 组合（两种顺序都判）：
   - 开关 ON → 点徽标：过滤条在、可见行数 === 徽标数、`.notes-group` 数量 === 1、计数文案逐字 `本章 2 条 / 共 4 条`；
   - 开关 OFF → 点徽标：可见行数、`.notes-group` 数量、计数文案与上一态**相同**（证明章节过滤本身蕴含文档限定），且 `.notes-filter input.checked === false`（开关未被程序改写）；
   - 截图 `52e-map-chapter-filter-current-doc-on.png` / `52e2-map-chapter-filter-current-doc-off.png`（两张头部 + 列表）。
5. 【离屏】清除：点 `.notes-chapter-filter-clear` → 元素从 DOM 移除；行数回到全量（标准种子 4 行）；计数回到 `共 4 条`；开关状态不变；当前标签仍为「笔记」；阅读页不变。截图 `52f-map-chapter-filter-cleared.png`。
6. 【离屏】空态：构造「范围内 0 条」的可见状态（过滤生效后删除范围内全部笔记）→ `.notes-chapter-empty` 文本逐字 `本章暂无笔记`；过滤条**仍渲染**（徽标消失不清除过滤）；清除按钮仍可用。
7. 【边界】过滤生效时把某条被过滤隐藏的笔记删除：不抛错、列表按最新清单重算（可能转空态）。
8. 【边界】`status === "error"` / `loading`：不渲染过滤条，也不清除 `chapterFilter`（重试成功或加载完成后原样出现）；不接受「错误态悄悄丢掉过滤状态」。
9. 【走查】计数文案实现：章节过滤生效时只输出 `本章 {visible} 条 / 共 {total} 条`；其它两种形态代码路径不变（不得引入第四种文案）。

**涉及文件**：`pix/src/renderer/components/workspace/NotesPanel.vue`、`pix/src/renderer/utils/notes-path.ts`、`pix/src/renderer/stores/notes-store.ts`。

**数据落盘**：无。

---

### N57 过滤的边界：只影响显示、文档作用域、零残留

**一句话**：章节过滤是纯视图派生 + 文档作用域的易失状态：不影响导出、跳回原文、选择集与注入；切文档即清除；不写盘、不跨工作区、不反复抢焦点。

**用户可见行为**：过滤开着也能点笔记跳回原文、也能勾选/发送、也能导出全部笔记；换一篇文档后过滤自动消失，不会「回来时又被自动切到笔记面板」。

**验收标准**

1. 【离屏】导出仍全量：过滤生效（可见 1 条）时点「导出 Markdown」→ `.export-text` 文本逐字 `已导出 4 条 → .pix-read/notes.md`（4 = fixture 全量），且 `notesStore.lastExport.count === 4`。
2. 【离屏】跳回原文不受影响：过滤生效时点可见行 → PDF 落到该笔记的页（`.page-label` 文本 = 期望页），地图随阅读位置更新的现有行为不变。
3. 【离屏】选择集与注入不受影响（场景顺序：先勾 2 条 → 再点徽标开过滤；被过滤隐藏的条目仍留在选择集内）→ 选择条 `已选 2 条`、chip `摘录 2 条` 不变；发送后 `__pixStub.sendCalls()` 最近一条 `prompt.message` 仍含 `reader_notes:` 与两条条目（条数与过滤前一致）。
4. 【走查】`reading-context.ts`、`ChatPanel.vue` 的 `send()`/chip/`selectNotesForContext` 的 `git diff` 为空；章节过滤字段不出现在 `ReadingSendContext` 或任何注入路径。
5. 【离屏】文档作用域：过滤生效 → 从资料库打开 `archive/older-paper.pdf` → `.notes-chapter-filter` 不存在；列表为该文档的未过滤结果（`.notes-group` 为该文档组）；再切回 `sample-paper.pdf` → 过滤**仍不存在**（不回填旧状态）。截图 `52g-map-chapter-filter-doc-switch.png`。
6. 【离屏】一次性语义（抢焦点反证）：点徽标切到「笔记」→ 手动切回「资料库」标签 → 打开另一篇文档、再打开回 `sample-paper.pdf`（触发文档切换与 `loadNotes`）→ 活动标签仍为「资料库」；随后再点徽标 → 活动标签变为「笔记」。截图 `52h-map-chapter-filter-focus-once.png`。
7. 【走查】清除路径唯一且显式：`clearChapterFilter()`（用户点击）与 `watch(currentDocKey)` / `resetNotes()`（作用域失效）三处；无第四处清零点，无「读取时才忽略」的隐式门控。
8. 【走查】不写盘：`chapterFilter` 只存在于 Pinia 内存；`git diff` 不含 `pix/src/main/**`；场景中 fixture `notes.json` 与 `.pix-read/reader-state.json` 在「点徽标 / 清除 / 切文档」前后字节不变。
9. 【离屏】未设置过滤时面板与今天一致：`.notes-chapter-filter` 不在 DOM（`querySelectorAll(...).length === 0`），既有 00–11 场景的计数文案、行态、选择条断言全部不变。

**涉及文件**：`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/utils/notes-path.ts`、`pix/src/renderer/pages/WorkspacePage.vue`、`pix/scripts/ui-shot.mjs`（断言）。

**数据落盘**：无。

---

### N58 已读/未读的视觉区分

**一句话**：页码范围上界严格小于当前页的章节行整行弱化（`.read`，`opacity: 0.55`），包含当前页的行保持既有 `.current` 高亮，其余行沿用今天的样式；不新增颜色体系。

**用户可见行为**：读到第 2 页时，第 1 页的章节行明显变淡，当前所在的章节行仍是高亮，后面的章节行与今天一样。

**验收标准**

1. 【走查】判定与 §0.5 逐字一致：`read ⇔ end < page`（严格小于）、`current` 逻辑零改动（`isCurrent` 函数体不变）、三态互斥；`READ_OPACITY = 0.55` 只出现一处（样式表内 `opacity: 0.55`）。
2. 【走查】无新增颜色：`KnowledgeMap.vue` 的 `git diff` 中不出现新的色值字面量、不改 `BRANCH_COLORS`、不新增 CSS 变量（除 `opacity` 之外的视觉声明改动为零）。
3. 【离屏】第 2 页（`sample-paper.pdf`）：`1. Abstract` 行带 `.read` 且 `getComputedStyle(row).opacity === "0.55"`；`2. Method Overview` 与 `2.1 Sparse mask budget` 行带 `.current` 且 `opacity === "1"`；范围起始 > 2 的行两者都不带；`document.querySelectorAll(".map-row.read.current").length === 0`。截图 `54-map-read-dim.png`（地图槽整体）+ `54b-map-read-zoom.png`（已读行放大）。
4. 【离屏】第 1 页：`1. Abstract` 为 `.current`（不是 `.read`）；后续章节行都不是 `.read`（`.map-row.read` 数量 === 0）。
5. 【离屏】第 3 页（末页）：`1. Abstract`、`2. Method Overview`、`2.1` 均为 `.read`（其 `end` 均 < 3），含第 3 页的节点为 `.current`；`.map-row.read` 数量 === 期望值（fixture 写死）。
6. 【离屏】无页码节点：断言存在一个书签节点其 `page === null`（N61 夹具要求），该行既不带 `.read` 也不带 `.current`，且无徽标；点击它仍走既有「有子节点则展开」分支。
7. 【边界】已读行仍可交互：点 `.read` 行的 `.map-node` 仍跳页；点 `.read` 行的 `.note-count-badge` 仍触发章节过滤（弱化不影响命中测试）。
8. 【回归】`.read` 不影响徽标数字、标题文本、`page-badge` 文本与滚动跟随（`MEASUREMENTS` 中已读行的文本类断言与改动前一致）。

**涉及文件**：`pix/src/renderer/components/workspace/KnowledgeMap.vue`。

**数据落盘**：无。

---

### N59 规模：200+ 节点的一次遍历与 memo

**一句话**：计数派生是一次遍历 + 前缀和 + 单个 `computed`，模板只读 Map；200+ 节点、默认展开的地图不出现随「节点数 × 笔记数」增长的重复计算。

**用户可见行为**：打开一本 200+ 书签的长文档并展开目录，地图不出现明显卡顿与逐行错位。

**验收标准**

1. 【走查】复杂度结构（逐条可判定）：
   - 对 `notesStore.notes` 的遍历在计数派生中**恰好一次**（先按页分桶：`Map<page, { excerpt, answer }>` 或等长数组）；
   - 对 ranges 的遍历**恰好一次**，且每个节点用**前缀和数组**（长度 `pageCount + 1`）做 O(1) 区间求和；代码中不得出现「对每个节点遍历其页码跨度」（不得有 `for (let p = start; p <= end; p++)` 逐页累加）；
   - 模板内**不得**出现接受 row 的计数调用（`v-if="noteCount(row) > 0"` 之类）；徽标数字只能来自 `Map.get(row.key)` 的结果；
   - 计数结果是 `computed`，依赖只有 `notesStore.notes`、`notesStore.currentDocKey`、`readerStore.outline`、`readerStore.pageCount`（不含 `readerStore.page`、不含 `expanded`）。
2. 【走查】`expanded` / `readerStore.page` 变化只触发 `groups`（或等价的行派生）与 `isCurrent` 重算，不触发计数重算（依赖列表可核对）。
3. 【烟测】差分等价：同一组输入下，前缀和实现与烟测脚本内的朴素实现（按节点遍历其范围内页码计数）逐键相等；覆盖 200 节点 × 200 笔记样本、同页重叠样本、`pageCount === 0` 样本。
4. 【离屏】`long-book.pdf`（N61：≥200 节点、3 层、默认展开可见行 ≥ 200）：`.map-row` 数量 === 节点数；`.map-count` 文本 === 节点数；抽样 3 个节点的 `.note-count-num` 等于场景内朴素参照实现的结果；`.note-count-badge` 数量 ≥ 15。
5. 【离屏】性能（宽容阈值，只用于拦截平方级退化）：从点击「展开全部」（或首帧加载完成）到 `.map-row` 数量达到期望值的耗时 ≤ **800 ms**（在场景内用 `performance.now()` 测量一次，写入 `MEASUREMENTS` 供负责人比对；不设更紧的阈值以免机器抖动导致误判）。
6. 【走查】不引入依赖：`pix/package.json` 与 `package-lock.json` 零改动；无虚拟滚动、无 d3/markmap。

**涉及文件**：`pix/src/renderer/utils/outline-notes.ts`、`pix/src/renderer/components/workspace/KnowledgeMap.vue`、`pix/scripts/ui-shot.mjs`（场景与测量）。

**数据落盘**：无。

---

### N60 纯函数烟测面

**一句话**：§0.1 的规则与 N59 的复杂度等价性，用离线烟测把「代码审查说不清」的部分钉死，不依赖 Electron。

**验收标准**

1. 【烟测】脚本用仓库外临时 tsconfig 编译 `pix/src/renderer/utils/outline-notes.ts` 与 `notes-path.ts`（`paths` 指 `@shared/*`），node `require` 产物；脚本跑完全部断言后删除临时目录（仓库内不留残留文件）。
2. 【烟测】覆盖面（逐组断言，组名固定）：`range-basic`（N52 验收 3 的正例/边界）、`range-null-page`（无页码节点不入 Map、其子节点照常）、`range-overlap`（同页重叠与父不覆盖后代）、`count-kind`（两类拆分与 `total`）、`count-multidoc`（其它文档不计入）、`count-prefix-sum-equivalence`（N59 验收 3）、`filter-predicate`（doc 归属 + 闭区间 + `range === null` 时恒真）、`empty-inputs`（空 outline / 空 notes / `pageCount === 0` 都不抛错，返回空结果）。
3. 【烟测】`filter-predicate` 必须断言闭区间两端（`page === start`、`page === end` 命中；`page === start - 1`、`page === end + 1` 不命中）与 `page < 1` 的防御行为（不抛错、不命中）。
4. 【烟测】`notes-path.ts`：`groupNotesByDocument` 第四参 `chapterRange` 的三种输入（`null` / 单页区间 / 跨页区间）分组结果正确，且 `null` 时与第三参旧签名的结果**逐字段相等**（既有行为不变）。
5. 【check】`cd pix && npm run check` 0 error（新模块为主进程/渲染层都在同一 tsconfig 覆盖范围内，不得用 `any` 绕过类型）。

**涉及文件**：`pix/src/renderer/utils/outline-notes.ts`、`pix/src/renderer/utils/notes-path.ts`、`pix/scripts/ui-shot.mjs`（如烟测脚本以临时文件形式运行，不落仓库）。

**数据落盘**：只在 `%TEMP%` 下产生临时文件并在结束时删除。

---

### N61 离屏取证面：书签夹具 + 50 段场景 + 断言组

**一句话**：先让夹具 PDF 具有真实书签（否则本轮无法验收），再用 50 段场景把五个必测视觉点与所有边界变成可判定的截图 + 测量。

**验收标准**

1. 【走查】`buildPdf(pages, outline = [])` 扩展（既有调用点第三参缺省 ⇒ 行为不变），生成**真实书签目录**：
   - Catalog 增 `/Outlines {rootId} 0 R`（可选 `/PageMode /UseOutlines`）；书签对象追加在页与内容对象之后（不改既有对象编号）；
   - 节点字典形状：`<< /Title (ASCII 文本) /Parent … /Dest [ {pageObjId} 0 R /XYZ null null null ] /Next … /Prev … /First … /Last … /Count n >>`（`/Next`、`/Prev`、`/First`、`/Last` 按树结构齐全，`/Count` 为该节点的可见后代数）；
   - 文本仅 ASCII（沿用 WinAnsi 约束），标题与页码由 `writeFixtures` 内的声明表驱动；
   - 必须能构造出：无页码节点（缺 `/Dest` 或 `/Dest` 指向非法引用 ⇒ pdf.js 解析为 `page: null`）、同页的两个节点、无更大后继页码的末节点。
2. 【走查】夹具文档（声明表写死在脚本内，供断言直接引用）：
   - `sample-paper.pdf`（3 页）书签声明：`1. Abstract`(p1) / `2. Method Overview`(p2) → `2.1 Sparse mask budget`(p2) / `2.2 Positional prior`(p3) / `3. Ablation Study`(p3)；另加一个**无页码节点** `Appendix A`（建议作为 `3. Ablation Study` 的子节点，用于 N58 验收 6 与「无页码不计数」）。期望 `label` 序列：`1`、`2`、`2`、`3`、`3`，`Appendix A` 无页码 ⇒ 无徽标。
   - `archive/older-paper.pdf`：**保持无书签**（地图空态与「切文档清除过滤」的判据）。
   - `long-book.pdf`（新建，页数 ≥ 60）：≥200 个书签、3 层、页码单调不减、默认展开后可见行 ≥ 200；`LIBRARY_TREE` 增该行，`writeFixtures` 写出该文件（`waitTreeRows(4)` 等既有断言用 `>=`，不受影响——改前须先跑基线确认）。
3. 【走查】`SEL` 增补（命名冻结）：`mapToggle: ".map-toggle"`、`mapRow: ".map-row"`、`mapNode: ".map-node"`、`mapBadge: ".note-count-badge"`、`mapProgress: ".map-progress"`、`chapterFilter: ".notes-chapter-filter"`、`chapterFilterClear: ".notes-chapter-filter-clear"`、`chapterEmpty: ".notes-chapter-empty"`。
4. 【离屏】新增场景（50 段起，避开既有 00–11、20–24、30–36、40–46）与截图（数量只增不减）：
   - `50-map-outline.png`、`50b-map-outline-zoom.png`：带书签文档的地图展开（`.map-count` === 声明节点数、行数 === 节点数、`.page-badge` 文本序列 === 声明 label 序列）。
   - `50c-map-outline-empty.png`：`older-paper.pdf` 空态 + `.map-progress` 仍在。
   - `51-map-note-badges.png`、`51b-map-badge-zoom.png`：徽标数字/title/0 条不渲染（N54 验收 4/5）。
   - `52-map-chapter-filter.png`、`52b-map-chapter-filter-left-pane.png`、`52c-map-chapter-filter-zoom.png`：点击徽标 → 标签切换 + 过滤条 + 限定列表（N55 验收 4）。
   - `52d-map-chapter-filter-collapsed.png`：左栏折叠态点击（N55 验收 6）。
   - `52e-map-chapter-filter-current-doc-on.png`、`52e2-map-chapter-filter-current-doc-off.png`：AND 组合（N56 验收 4）。
   - `52f-map-chapter-filter-cleared.png`：清除（N56 验收 5）。
   - `52g-map-chapter-filter-doc-switch.png`：切文档清除（N57 验收 5）。
   - `52h-map-chapter-filter-focus-once.png`：一次性聚焦反证（N57 验收 6）。
   - `53-map-progress.png`、`53b-map-progress-p2.png`：头部进度（N53）。
   - `54-map-read-dim.png`、`54b-map-read-zoom.png`：已读弱化（N58）。
   - `55-map-scale-200.png`：200+ 节点规模与耗时（N59）。
5. 【离屏】`MEASUREMENTS.json` 至少新增六组断言（组名固定，缺一组即失败）：`map-outline`、`map-note-badges`、`map-chapter-filter`、`map-progress`、`map-read`、`map-scale`。每组断言必须包含「失败即抛错」的判据（沿用脚本既有 `record(label, data, failures)` 写法）。
6. 【走查】场景数据准备只用既有 stub 口（`seedNotes` / `setLoadFailure` / `sendCalls` / `clearSendCalls`）；需要新口时（如清空/查询 `chapterFilter` 相关的可见状态）优先用 DOM 断言，**不得**为测试在产品代码里加开关。
7. 【离屏】基线比对：改前先跑一次留档（截图数 + `MEASUREMENTS` 值）；改后既有场景全部通过、截图数只增不减、`MANIFEST.json.failure === null`、退出码 0。
8. 【check】`cd pix && npm run check` 0 error（脚本为 `.mjs`，不影响类型面）。

**涉及文件**：`pix/scripts/ui-shot.mjs`。

**数据落盘**：只写 `%TEMP%` 下的临时 fixture（不写仓库）。

---

### N62 回归与零外溢

**一句话**：本轮不破坏既有语义，也不越出白名单。

**验收标准**

1. 【离屏】既有 00–11、20–24、30–36、40–46 场景全部继续通过；`MANIFEST.json.failure === null`；退出码 0。
2. 【check】`cd pix && npm run check` 0 error。
3. 【走查】`git diff --stat` 只含 §4 白名单文件；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置零改动；`pix/src/main/**` 与 `pix/src/shared/types.ts` 零改动（本轮无新 IPC、无新类型、无新落盘字段）。
4. 【走查】`pix/src/renderer/components/workspace/ReaderPanel.vue`、`PdfViewer.vue`、`ChatPanel.vue`、`utils/reading-context.ts`、`composables/useQuickAsk.ts` 的 `git diff` 为空（宽度守卫、跳页、注入链路、选择集全部原样）。
5. 【走查】未触发即无痕：地图的新元素（`.map-progress` 之外）与笔记面板的新元素（`.notes-chapter-filter`）在未触发/未设置时不得进入 DOM；既有场景的截图与改动前一致（人工或像素对比，至少确认关键区域文案与几何值不变）。
6. 【走查】不新增死代码：无未被调用的导出、无「为其它场景预留」的开关、无 `any`、无内联动态 import、UI 文案中文、注释只写约束（向同文件风格看齐）。
7. 【走查】`notes.json` 只读：本轮任何路径都不写 `notes.json` 与 `reader-state.json`（判定：`git diff` 不含 `pix/src/main/**`；离屏场景中两个 fixture 文件在「点徽标 / 清除 / 切文档 / 发送」前后字节不变）。

---

## 3. 反需求（本迭代明确不做）

1. **不做力导向图 / 自动布局 / 画布渲染**：地图是线性目录树，改动会推翻既有高亮与滚动跟随，且必须引入依赖。
2. **不做地图内联编辑、重命名、折叠动画、拖拽排序**：本轮是「结构可见」，不是目录编辑；动画会干扰截图取证（首帧不稳定）。
3. **不做 LLM 生成节点 / 自动摘要节点**：与 PRD-V0.4 §4.3「结构来自 PDF 书签」冲突，也会让计数失去确定含义。
4. **不在树上展开笔记全文、不做笔记悬浮详情弹窗**：徽标的 `title` 已能给出「两类各多少」；展开全文属笔记面板职责，重复实现会造成两套阅读体验。
5. **不做第二种颜色体系（含已读灰阶、热度色带）**：已读只用 `opacity: 0.55`；新增颜色会与 `BRANCH_COLORS` 的分支语义打架，且无法在既有变量语义下解释。
6. **不做「未归类笔记」节点 / 不做按章节重排笔记分组**：面板仍是「按文档分组 + 一个范围过滤条」；新增分组维度会让 R8 的选择集与导出口径出现第二种解释。
7. **不做章节过滤的持久化**：不写 `settings`、不写 `reader-state.json`、不写 `notes.json`；过滤是「这一眼的视图」，跨会话保留会变成隐性常开。
8. **不做「笔记 → 地图」的反向高亮/滚动**（点笔记行让地图定位到章节）：本轮入口只有徽标一个方向，反向联动属另一轮。
9. **不做地图头部交互**（点击进度跳页、拖拽进度、点击节点数筛选）：头部只读。
10. **不做导出/注入的过滤感知**：不新增「按当前过滤导出」「只注入可见笔记」的选项；导出永远全量，注入只由选择集决定（R8 语义）。
11. **不做第二套跨栏机制**：不新增模块级 seam、不用 DOM 自定义事件、不用 URL query；只用 `notesStore` 状态 + `WorkspacePage` 编排。
12. **不新增依赖、不改主进程面、不加向后兼容层**：不引 d3 / markmap / 虚拟滚动库；`pix/src/main/**`、`pix/src/shared/types.ts` 零改动；不做「旧笔记无 kind 时按摘录处理」之类的兼容分支。

---

## 4. 文件白名单

### 主进程面

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `pix/src/main/**`（`ipc-handlers.ts`、`preload.ts`、`notes-store.ts`、`reader-state-store.ts`、`reading-prompt.ts`、`session-bridge.ts`、`pdf-tools.ts`、`library-root.ts`、`index.ts`） | **不改** | 本轮无新 IPC、无新落盘字段、无系统提示词改动；计数只读渲染层内存清单 |
| `pix/src/shared/types.ts` | **不改** | 章节范围/过滤类型只服务渲染层，落在渲染层文件内 |

### 渲染层面（含取证脚本）

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `pix/src/renderer/utils/outline-notes.ts` | **新建** | §0.1 四个纯函数（ranges / 计数 / 区间命中 / 过滤判定）；不 import Vue 与 store，供烟测直接编译 |
| `pix/src/renderer/components/workspace/KnowledgeMap.vue` | 修改 | 章节范围派生改为调用新模块（删掉本地 `buildPageLabels`/`buildRangeEnds` 实现）、`.note-count-badge`（章节行 + 子行）、`.map-row.read` 与 `opacity: 0.55`、`.map-progress`、徽标点击 → `notesStore.focusChapter`；`isCurrent`、跳页、滚动跟随、默认展开、空态、宽度守卫依赖的 DOM 与类名**零改动** |
| `pix/src/renderer/stores/notes-store.ts` | 修改 | `chapterFilter`（含 docKey/title/start/end）+ `chapterFocusToken` + `focusChapter` / `clearChapterFilter`；`groups` 传第四参；`watch(currentDocKey)` 清除；`resetNotes()` 清空两者；选择集/R8 动作/`applyNotes` 语义**不改** |
| `pix/src/renderer/utils/notes-path.ts` | 修改 | `groupNotesByDocument` 增可选第四参 `chapterRange`（`null` 时行为与今天逐字段相等）；既有路径/排序/分组函数零改动 |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | `.notes-chapter-filter`（文案/清除）、`.notes-chapter-empty`、章节过滤生效时的计数文案；分组/排序/筛选开关/计数其它形态/删除确认/错误态/备注/展开/AI 徽标/R8 选择控件与选择条**零改动** |
| `pix/src/renderer/pages/WorkspacePage.vue` | 修改 | 消费 `chapterFocusToken`（展开左栏 + 切「笔记」标签，一处）；`openDocumentFromLibrary` / `onOpenNote` / `goHome` 等既有编排不变 |
| `pix/scripts/ui-shot.mjs` | 修改 | `buildPdf` 书签支持、`long-book.pdf` 与 `LIBRARY_TREE`、`SEL` 增补、50–55 段场景、六组断言 |
| 其它既有文件（`ReaderPanel.vue`、`PdfViewer.vue`、`PdfSearchPanel.vue`、`PdfSelectionQuickAsk.vue`、`LibraryPanel.vue`、`ChatPanel.vue`、`components/session/**`、`components/input/**`、`composables/{useRpc,useQuickAsk,useRegionCapture}.ts`、`stores/{reader,reader-state,session,project,settings,auth}-store.ts`、`utils/{reading-context,note-capture,markdown,session-title,image-capture}.ts`、`assets/styles/**`） | **不改** | 见不变量 1–4；宽度守卫、跳页、注入链路、选择集、R6 现场全部原样 |

范围外（任何情况下不动）：`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置、`pix/resources/skills/**`。

---

## 5. 风险 Top3 与判定方式

**R1 「徽标数字撒谎」** —— 最核心的失败模式：徽标写 `2` 而点击后列表只有 1 条，或反过来（范围内还有笔记未计入）；根因通常是范围口径出现第二份实现（计数用上界口径、过滤用 `pageLabels` 口径、已读用第三份）。

- 判定：N52 验收 1/3/6（单一实现点 + 烟测逐条范围规则 + 模板无第二处页码拼接）+ N55 验收 4（行数 === 徽标数字）+ N54 验收 4（各节点数字与 fixture 期望逐字相等）+ N59 验收 3（前缀和与朴素实现差分等价）。
- 失败信号：`KnowledgeMap.vue` 内仍有 `buildPageLabels`/`buildRangeEnds` 函数体；`notes-path.ts` 或 `NotesPanel.vue` 内出现第二处 `page >= start && page <= end`；末节点的范围与徽标文本不一致（一个 `5`、一个 `5-10`）。

**R2 「过滤越界」** —— 章节过滤泄漏到导出、注入、选择集或阅读位置：用户以为只改了视图，实际丢 / 多带了笔记，或点徽标把阅读页也带走了。

- 判定：N57 验收 1–4（导出 4 条、跳页照常、chip 2 条与 `reader_notes` 载荷不变、`reading-context.ts`/`ChatPanel.vue` 零 diff）+ N55 验收 3（`focusChapter` 无 `gotoPage`）+ N56 验收 4（AND 组合不改写开关）+ N57 验收 9（未设置过滤时面板逐字节同旧）。
- 失败信号：导出条数随过滤变化；`selectedNotes`/`selectedCount` 出现按过滤收敛的写法；点徽标后 `.page-label` 变化；`chapterFilter` 出现在 `ReadingSendContext` 相关类型里。

**R3 「残留状态抢焦点」** —— `chapterFilter` 或聚焦标记跨文档/跨工作区残留，导致后续打开文档时自动跳标签、反复切回笔记面板，或过滤悄悄作用在新文档上。

- 判定：N57 验收 5–8（切文档清除且不回填、多次打开后仍停在用户所在标签、清除点只有三处且无隐式门控、不写盘）+ N55 验收 2（切标签只由 token 变化触发）+ N56 验收 8（error/loading 不清状态也不渲染条）。
- 失败信号：`WorkspacePage` 中出现 `watch(() => notesStore.chapterFilter, …)` 的切标签分支；把布尔量（而非单调 token）当作一次性请求；进入工作区时自动切到笔记标签；`.notes-chapter-filter` 在切换文档后仍存在。

**次级风险（不占 Top3）**：①200 节点下的性能退化（N59 验收 1/4/5：结构判据 + 800 ms 宽容阈值 + 测量留档）；②新夹具 PDF 的书签不被 pdf.js 解析（N61 验收 4 的 `.map-count` 与 `.page-badge` 序列断言即为最强反证：解析不出则整组失败）。

**开放问题（需负责人确认，不阻塞本档定稿）**：
1. §0.1 的口径统一会让「无更大后继页码的节点」页码徽标由单页变为区间（例 `5` → `5-10`）——这是本轮唯一的既有文案变化，是否接受；若不接受，则需改为「计数与过滤改用 `pageLabels` 口径（末节点只算起始单页）」，会牺牲与当前章节高亮的一致性。
2. 章节过滤生效时**其它文档分组一并隐藏**（当前文档范围无法解释到别的文档）——是否符合预期；若希望保留其它文档分组，则「面板限定到该章节」在视觉上不成立。
3. 徽标是否需要在视觉上区分两类笔记（当前方案：单一数字徽标 + `title` 分列两类），以及已读弱化的强度 `opacity: 0.55` 是否需要更强/更弱（取值一经开发即为冻结值）。
