# PiX-Read R9 设计档 · 结构可见（N52–N62）

> 上游：`docs/pm/R9-req.md`（需求，N52–N62 与 §0 冻结值）、`docs/pm/R9-review.md`（需求评审 must-fix 8 条与次级项 10 条）、`docs/pm/PRD-V0.4.md` §2/§4/§7.4、`docs/pm/R8-design.md`（笔记选择集与注入链路，本轮零改动）。
> 本档是「可直接开工的定稿设计」：纯函数签名、store 字段与动作、DOM 与类名、文案字面量、夹具书签结构、声明期望值、场景与断言、分工与回退全部写死到可判定粒度。**本档不改任何代码**，只新增这一份文档。
> 判定工具四种（与需求档一致）：【走查】只读代码 / `git diff` / `git status`【check】`cd pix && npm run check`（唯一工程门；改前基线已实测 0 error，2026-09-15）【烟测】仓库外临时 tsconfig 编译 `utils/{outline-notes,notes-path}.ts` 后 node 断言（跑完删除）【离屏】`cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs`（退出码 0 + `MANIFEST.json.failure === null` + `MEASUREMENTS.json` 新增 6 组全绿）。
> 事实基线（本档引用的现有实现位置均为只读核对结果）：`KnowledgeMap.vue` 的 `buildPageLabels:98` / `buildRangeEnds:127` / `collectExpandable:148` / `flattenVisible:161` / `isCurrent:207`；`notes-path.ts` 的 `docPathKey` / `currentDocKey` / `docDisplayName` / `groupNotesByDocument`；`notes-store.ts:75` 的 `currentDocKey` computed；`WorkspacePage.vue` 的 `leftTab:41` / `leftCollapsed:39` / `selectLeftTab` / `goHome`；`ReaderPanel.vue:61` 的 `showMap` 与 `MIN_STAGE_WIDTH_FOR_MAP = 620`；`ui-shot.mjs` 的 `buildPdf:71` / `seedNotes:144` / `writeFixtures:194` / `record:1120` / `openNotesPanel:2830` / `restoreStandardSeed:2836` / `SEL:46`。

---

## 0. 口径修订（8 条，均为「需求档字面与可实现/可判定现状冲突」，本档就地对齐）

**修订 1（对应 must-fix 2、次级项 6）—— `.map-progress` 落在 `.map-header` 之后，而不是 `.map-header` 内部。**
事实：`.map-header` 是 `space-between` 单行 flex（`KnowledgeMap.vue:325`），直接追加第三个子节点会排在同一行；改成 `flex-wrap` 后在窄槽（240 px）下 `.map-count` 可能被挤到第二行 ⇒ N53-7「`.map-heading`/`.map-count` 位置不变」不可保证（`.map-heading` 有 `white-space: nowrap`，其 hypothetical main size 是全文宽度，换行由内容宽度决定而非固定）。
本档写死：`.map-header` 的既有行样式**零改动**，`.map-progress` 作为 `.map-header` 的**下一个兄弟节点**渲染（`.knowledge-map` 列 flex 的第二个直接子节点）。§0.6 冻结的「DOM 顺序在 `.map-heading` 与 `.map-count` 所在行之后」逐字成立（文档序），N53-7 由「既有行样式逐字迁移」保证。

**修订 2（对应 must-fix 4）—— 删掉一切「与改前同值」的判据，改为同 run 内的**声明字面量**比对。**
事实：脚本全文没有任何地图场景、两个夹具 PDF 都无书签 ⇒ `.page-badge` / `.map-row` / `.map-heading` 从未被测量，不存在可比对的基线；且带徽标行的 `.page-badge` 会因 `.map-node` 变窄而位移，「逐像素不变」只在无徽标行成立。
本档写死：`.map-page-badge` 类几何量一律与档内声明值比对（无徽标行），带徽标行只断言文本与 class；「既有场景不视觉回归」改由 §6.4 的**基线 run 逐字段相等**承担（改前先跑一次基线并留档）。

**修订 3（对应 must-fix 7）—— 判定式落在 `notes-path.ts`，`outline-notes.ts` 只接受已解析的 `docKey`/`range`，并 re-export。**
事实：§0.1 要 `outline-notes` import `notes-path`（`docPathKey`），而 N56-2 又要 `notes-path` 的第四参用 `matchesChapterFilter` ⇒ 反向依赖成环。N52-2 的 import 面因此扩为 `./notes-path` 的三个值（`docPathKey` + 两个判定式），函数名与模块路径仍按 §0.1/§0.8 冻结（`rangeContains`、`matchesChapterFilter` 可用 `require` 自 `outline-notes` 产物取出）。

**修订 4（对应 must-fix 7 第二半、设计评审 must-fix 5）—— 「可见 ⇔ `matchesChapterFilter`」写死为章节分支直调判定式。**
`range === null` 时若判定式「恒真」，则「仅看当前文档」会被吞掉。本档写死（§1.2 与 §2.2 第 2 条）：**过滤生效（`chapterRange !== null`）时，可见性逐条等于 `matchesChapterFilter(note, currentKey, chapterRange)`（章节分支直调唯一判定式）；仅 `chapterRange === null` 时退回今天的 `onlyCurrent` 判定** —— 同一文件内不得再写第二份区间谓词，也不得引入 `scopeDoc` 之类的组合变量。`matchesChapterFilter` 的 `range === null` 语义是「**只做文档归属判定**」，不是整式恒真。

**修订 5（对应 must-fix 6，取「守卫」方案）—— 保留 `resetNotes()` 归零，watcher 加「只增」守卫。**
`chapterFocusToken` 初值 0、`focusChapter` 自增、`resetNotes()` 归 0；`WorkspacePage` 的 watcher 体第一句 `if (token <= 0 || token <= previous) return;` —— 归零（N → 0）不进入效果分支，因此 `goHome`（先 `resetNotes()` 再 `push`，`:216-232`）与卸载路径都不会写 `leftTab`/`leftCollapsed`，也不会发出无意义的 `notesLoad`。§0.7「切标签的触发条件只能是 token 变化这一次事件」保持不变（触发源仍是 token 变化，只是过滤掉复位这一次）。

**修订 6 —— `chapterFilter` 不含 `docKey` 字段。**
N55-3 写了「含 `docKey = currentDocKey`」，但文档作用域已由两处承担：写入闸门（`currentDocKey === null` ⇒ no-op，N55-9）与 `watch(currentDocKey)` 清除（N57-5/7）。存一个永不参与判定式的字段即 N62-6 禁止的死字段，且会诱导出「读取时才忽略」的隐式门控（N57-7 明令禁止）。章节名的展示仍取 `docDisplayName(currentDocKey)`（§0.3 冻结文案），不需要副本。

**修订 7 —— `focusChapter` 入参增加 `label`。**
N55-1 写 `focusChapter({ title, start, end })`。若由 store 依 `start/end` 再拼一次页码文本，就会出现第二份 label 实现（N52-6 禁止）。本档冻结 `focusChapter({ title, start, end, label })`，`label` 只能来自 `ChapterRange.label`（§0.1 唯一实现）；`KnowledgeMap` 把 `Map.get(row.key)` 得到的整个 `ChapterRange` 传下去（N55-1 的「或设计档等价的单一动作」）。

**修订 8 —— label 的 `+∞` 防御分支写死为单页文本，并写死与今天唯一的一处差异（设计评审 must-fix 2）。**
§0.1 冻结 `pageCount === 0` 时无后继节点的 `end = +∞`（仅防御、不参与渲染）。字面套用今天的拼接式会得到 `"2-Infinity"`。本档写死：`label = Number.isFinite(end) && end > start ? \`${start}-${end}\` : String(start)`。
与今天 `buildPageLabels`（`KnowledgeMap.vue:98-125`）的关系：**除一处外逐字相同** —— 「无更大后继且 `pageCount > start`」的节点今天走 `end == null` 分支输出 `String(start)`，本档输出 `start-pageCount`（`Appendix B`(p2, `pageCount 3`) ⇒ `"2-3"`，即 50a 与 §6.3 徽标表依赖的那一行）；`pageCount === 0`（`end = +∞`）与 `pageCount === start`（`end === start`）两种情形仍输出 `String(start)`。**不得再写「与今天等价」**：今天不存在与本档 `label` 逐字等价的实现，按等价口径落地会直接挂掉 50a。

**证据面更正（随修订一并冻结，三条）**
1. N55-9 的「烟测：`focusChapter` 是 no-op」不成立（store 依赖 vue/pinia 与 `window.pixApi`，不在 N60 的烟测面内）⇒ 该条**只能走查**；设计把 no-op 判据写成 store 内的一句显式闸门便于走查。
2. N56-1 的「DOM 顺序」是离屏可判项（`compareDocumentPosition`），本档归入 `map-chapter-filter` 组。
3. N53-5 的 `pageCount > 0` 守卫必须用 `setLibraryReadDelay` 造加载窗口后点开地图才能判到（文本预览下 `.map-toggle` 结构性不存在）。

---

## 1. 契约冻结表

### 1.1 纯函数模块 `pix/src/renderer/utils/outline-notes.ts`（新建）

```ts
import type { ReaderNote, ReaderOutlineNode } from "@shared/types";      // 仅类型，编译后擦除
import { docPathKey, matchesChapterFilter, rangeContains } from "./notes-path";
export { matchesChapterFilter, rangeContains } from "./notes-path";       // §0.1 导出表的单一来源

export interface ChapterRange { key: string; title: string; start: number; end: number; label: string }
export interface ChapterNoteCount { total: number; excerpt: number; answer: number }

export function buildChapterRanges(nodes: ReaderOutlineNode[], pageCount: number): Map<string, ChapterRange>;
export function countNotesByChapter(
  ranges: Map<string, ChapterRange>,
  notes: ReaderNote[],
  docKey: string | null,
): Map<string, ChapterNoteCount>;
```

| 项 | 冻结值 |
| --- | --- |
| 键规则 | 预序位置键，与既有 `flattenVisible` 逐字相同：根 `"root"`，第 i 个子节点 `` `${parentKey}/${i}` ``；**含未展开节点**（全量预序） |
| `title` | `node.title.trim() \|\| "未命名"`（与地图行渲染的字符串同源，供过滤条文案） |
| `page === null` | **不进 Map**（`Map.has(key) === false`）；其有页码的后代照常计算 |
| `start` | `node.page` |
| `end` | 全量预序中**第一个** `page != null && page > start` 的节点的 `page - 1`；再 `pageCount > 0` 时 `end = Math.min(end, pageCount)`；不存在这样的节点时 `end = pageCount > 0 ? pageCount : Number.POSITIVE_INFINITY` |
| `label` | `Number.isFinite(end) && end > start ? \`${start}-${end}\` : String(start)`（修订 8） |
| 复杂度 | 每节点向前扫描（与今天 `buildRangeEnds` 同形）；`flat` 只建一次 |
| 计数 | 对 `notes` 恰好一次遍历（先按页分桶）→ 前缀和数组（长度 `maxPage + 1`，`maxPage = max(所有有限 end, 0)`）→ 每个 range 一次 O(1) 区间求和；**只写 `total > 0` 的键**；`start > maxPage` 或 `end < start` 或 `end` 非有限 ⇒ 该键**不写**（不得让 `prefix[start - 1]` 越界成 `undefined` 后靠 `NaN` 比较兜底） |
| 计数页过滤 | `docPathKey(note.docPath) !== docKey` ⇒ 跳过；`!Number.isInteger(page) \|\| page < 1 \|\| page > maxPage` ⇒ 跳过；`kind === "answer"` ⇒ `answer`，否则（`excerpt`）⇒ `excerpt`，**无第三分支**（`ReaderNoteKind` 只有两态，越域 kind 不可达：主进程读侧白名单 `isReaderNote`（`pix/src/main/notes-store.ts:114`）越域即整库判 corrupt，`loadNotes` 不会返回）；`total === excerpt + answer` 恒等 |
| 空输入 | `docKey === null` 或 `ranges.size === 0` ⇒ 返回空 Map；**`pageCount === 0` 不做特判**：有更大后继的节点 `end` 仍有限（`[A(p1), B(p2)]`、`pageCount 0` ⇒ `A.end === 1`、`maxPage === 1`，p1 笔记照常计入、返回非空 Map），`end = +∞` 的 range 走计数行的「键不写」守卫，只有全部 `end` 非有限（单节点 / 空 outline）时才得到空 Map |
| 依赖方向 | `outline-notes → notes-path`（单向，无环）；不 import Vue / Pinia / 组件 / store；无 `any`、无内联动态 import |

### 1.2 `pix/src/renderer/utils/notes-path.ts`（既有文件，加法）

```ts
export interface PageRange { start: number; end: number }

export function rangeContains(range: PageRange, page: number): boolean;
// ⇔ Number.isFinite(page) && page >= range.start && page <= range.end（闭区间；page < 1 不抛错、不命中）

export function matchesChapterFilter(note: ReaderNote, docKey: string | null, range: PageRange | null): boolean;
// ⇔ docKey !== null && docPathKey(note.docPath) === docKey && (range === null || rangeContains(range, note.page))
//   range === null 时只做文档归属判定（修订 4）；docKey === null 时恒 false

export function groupNotesByDocument(
  notes: ReaderNote[],
  currentKey: string | null,
  onlyCurrent: boolean,
  chapterRange: PageRange | null = null,          // 默认 null：既有调用点逐字段不变
): NoteGroup[];
```

第四参生效时的可见性判定（写死，唯一）：

```ts
const visible = chapterRange !== null
  ? matchesChapterFilter(note, currentKey, chapterRange)          // 章节分支：直调唯一判定式，不另写区间谓词
  : (!onlyCurrent || docPathKey(note.docPath) === currentKey);    // 回退：今天的 onlyCurrent 判定
```

- 章节分支不再出现第二份区间比较，也不引入 `scopeDoc` 之类的折写变量：过滤生效时「可见 ⇔ `matchesChapterFilter`」在结构上逐条成立（N56-3），计数口径与过滤口径之间不再有第二处可漂移的谓词。
- 分组顺序、组内排序、`isCurrentDoc`、`displayName` 全部沿用今天实现（第四参为 `null` 时与三参签名逐字段相等，N60-4）。
- `currentKey === null` 且 `chapterRange !== null` ⇒ `matchesChapterFilter` 恒 `false` ⇒ 全部跳过 ⇒ 空数组；`currentKey === null` 且 `onlyCurrent` ⇒ 空数组（与今天同形）。
- 过滤是 per-note 的：同一组内可能只保留部分条目（这是「章节过滤」与今天「仅看当前文档」的唯一行为差）。

### 1.3 章节过滤状态（`pix/src/renderer/stores/notes-store.ts`）

| 项 | 冻结值 |
| --- | --- |
| 字段 | `const chapterFilter = ref<{ title: string; label: string; start: number; end: number } \| null>(null)` —— **视图状态，非消费式**（持续生效直到显式清除或作用域失效） |
| 字段 | `const chapterFocusToken = ref(0)` —— **一次性请求信号，单调递增**；`focusChapter` 每次令 `+1`；`resetNotes()` 归 0 |
| 派生 | `const chapterRange = computed<PageRange \| null>(() => chapterFilter.value ? { start: chapterFilter.value.start, end: chapterFilter.value.end } : null)` |
| 派生 | `groups = computed(() => groupNotesByDocument(notes.value, currentDocKey.value, currentDocOnly.value, chapterRange.value))` |
| 动作 | `focusChapter(input: { title: string; start: number; end: number; label: string }): void` —— 第一句 `if (currentDocKey.value === null) return;`（no-op 闸门，修订 6/走查判据）；随后写 `chapterFilter` 与 `chapterFocusToken += 1`。**不**调 `gotoPage`、**不**改 `leftTab`、**不**清选择集、**不**发 IPC |
| 动作 | `clearChapterFilter(): void` —— 只置 `null`（不改标签、不改阅读位置、不改选择集、不写盘、不发 IPC） |
| 清除点 | 三处，无第四处：`clearChapterFilter()`（用户点击）、`watch(currentDocKey, () => { chapterFilter.value = null; })`、`resetNotes()`（追加 `chapterFilter.value = null; chapterFocusToken.value = 0;`） |
| 不改写 | `currentDocOnly` 只由 `setCurrentDocOnly` 写（N56-2 走查判据）；`chapterFilter` 与选择集/R8 动作/`applyNotes` 语义零耦合 |

### 1.4 地图 → 面板的信号通路（复用既有范式，不新增 seam）

- 通路 = **store 状态 + `WorkspacePage` 编排**（R8 已用的两条范式之一；**不**新增 module-level seam、**不**用 DOM 自定义事件、**不**用 URL query）。
- `KnowledgeMap` 只调用 `notesStore.focusChapter({ title, start, end, label })`（单一动作，入参来自该行的 `ChapterRange`）。
- `WorkspacePage` 的消费点（冻结形状，写在 `selectLeftTab` 定义之后）：

```ts
watch(
  () => notesStore.chapterFocusToken,
  (token, previous) => {
    if (token <= 0 || token <= previous) return;   // 复位（N → 0）不是聚焦请求（修订 5）
    leftCollapsed.value = false;                   // 折叠态必须展开，否则过滤生效但看不到结果
    selectLeftTab("notes");                        // 复用既有编排：切标签 + 必要时 loadNotes
  },
);
```

- 冻结判定：**除此处外**，全仓库不得有第二处写 `leftTab`/`leftCollapsed` 的 token 消费路径，也不得存在「读 `chapterFilter !== null` 来切标签」的分支（走查：`grep -n "chapterFilter" src/renderer` 只命中 store 与 `NotesPanel.vue`）。

### 1.5 笔记计数的 DOM 契约（供 ui-shot 断言）

徽标渲染在 `.map-row` 内、`.map-node` **之后**的同级位置；章节行与子行两个 `v-for` 分支都渲染：

```html
<button v-if="row.count" type="button" class="note-count-badge" :title="noteCountTitle(row.count)" @click="onNoteCountClick(row.range)">
  <v-icon size="11">mdi-notebook-outline</v-icon>
  <span class="note-count-num">{{ row.count.total }}</span>
</button>
```

| 选择器 | 契约 |
| --- | --- |
| `.note-count-badge` | `total > 0` 才进入 DOM（`v-if`，0 条不进 DOM，不是 `display:none`、不渲染 `0`）；章节行与子行同构 |
| `.note-count-badge[title]` | `{total} 条笔记 · 摘录 {excerpt} · AI 结论 {answer}；点击只看该章节笔记`（两类恒显示，含 0） |
| `.note-count-num` | 十进制整数文本（无前后缀、无单位） |
| `.note-count-badge` 几何 | `height: 16px`、`padding: 0 5px`、`border-radius: 999px`、`font-size: 10px`、`font-weight: 600`、`font-variant-numeric: tabular-nums`、`flex-shrink: 0`、`display: inline-flex; align-items: center; gap: 3px`、`border: 1px solid` |
| 配色 | 背景 `color-mix(in srgb, var(--branch) 16%, #fff)`；文字与图标 `var(--branch)`；边框 `color-mix(in srgb, var(--branch) 32%, transparent)`；hover 背景 `color-mix(in srgb, var(--branch) 26%, #fff)`（无位移、无阴影） |
| 行结构 | `.map-row` 直接子元素顺序：`.row-chevron`（或有子节点时）/ `.row-chevron-spacer` → `.map-node` → `.note-count-badge?`；`.map-node` 内仍只有 `.dot` + `.label` + `.page-badge?` |
| `MapRow` 扩展 | 新增 `range: ChapterRange \| null` 与 `count: ChapterNoteCount \| null`（由 `flattenVisible` 内**一次** `ranges.get(key)` / `counts.get(key)` 填入；模板只读字段，不出现 `noteCount(row)` 之类的按行调用） |
| 计数依赖 | `noteCounts` 的依赖只有 `notesStore.notes` / `notesStore.currentDocKey` / `readerStore.outline` / `readerStore.pageCount`（**不含** `readerStore.page`、不含 `expanded`、不含 `currentDocOnly`、不含 `selectedNoteIds`） |

### 1.6 地图头部进度（`.map-progress`）

| 项 | 冻结值 |
| --- | --- |
| 位置 | `.map-header` 的**下一个兄弟节点**（修订 1），DOM 序在 `.map-heading`/`.map-count` 所在行之后、`.map-empty`/`.map-tree` 之前 |
| 渲染条件 | `readerStore.pageCount > 0`；`pageCount === 0` 时不渲染（DOM 中不存在） |
| 文案 | `第 {page} / {pageCount} 页 · {percent}%`（半角空格 + `·` + 半角空格） |
| 公式 | `percent = Math.round((page / pageCount) * 100)`；无小数、无 `~`；`1/3 → 33`、`2/3 → 67`、`3/3 → 100`、`1/1 → 100`、`1/60 → 2` |
| 实现点 | 组件内单个 `computed`（模板不出现算式）；页码与 `.page-label`（`PdfViewer.vue:943`）同源同值 |
| 样式 | `font-size: 11px`、`font-weight: 600`、`letter-spacing: 0.04em`、`color: var(--pix-text-muted)`、`font-variant-numeric: tabular-nums`、`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`、`padding: 0 8px 10px` |
| 交互 | 无（不点击、不拖拽、无 hover 态） |

### 1.7 已读/未读的 CSS 契约

| 项 | 冻结值 |
| --- | --- |
| 判定 | `.map-row.read` ⇔ 该行在 ranges 中且 `end < readerStore.page`（**严格小于**）；`.map-row.current` ⇔ 既有 `isCurrent`（`start <= page <= end`，函数体零改动）；其余不加类 |
| 互斥 | 同一行不得同时带 `.read` 与 `.current`（`end < page` 与 `page <= end` 不可同真）；无页码/不在 Map 的行两者都不带 |
| 唯一视觉改动 | `.map-row.read { opacity: 0.55; }` —— 整行等比弱化（含 `.dot`/`.label`/`.page-badge`/`.note-count-badge`/分支色背景与连接线） |
| 常量落点 | **CSS 字面量 `0.55`，全文件一处**（不新增 JS 常量、不用 `:style` 绑定；§0.8 的 `READ_OPACITY` 具名常量本轮不引入） |
| 禁止 | 新增颜色变量、改 `BRANCH_COLORS`、`.read` 换色或加灰阶滤镜；`.read` 行的跳页、徽标点击、hover、滚动跟随行为全部不变 |

### 1.8 笔记面板：章节过滤条与空态

```html
<div v-if="notesStore.status === 'ready' && notesStore.chapterFilter" class="notes-chapter-filter" :title="chapterFilterTitle">
  <span class="notes-chapter-filter-text">章节：{{ notesStore.chapterFilter.title }} · 第 {{ notesStore.chapterFilter.label }} 页</span>
  <button type="button" class="notes-chapter-filter-clear" title="清除章节过滤，恢复全部笔记" @click="notesStore.clearChapterFilter()">清除</button>
</div>
```

| 项 | 冻结值 |
| --- | --- |
| DOM 位置 | `.notes-header` 内、`.notes-filter` 之后、`.notes-selection-bar` 之前 |
| 渲染条件 | `status === "ready"` 且 `chapterFilter !== null`（loading / error 期间不渲染，状态保留，回到 ready 后原样出现） |
| 文本 | `章节：{title} · 第 {label} 页`（`label` 取 `ChapterRange.label`，区间形态如 `第 2-3 页`） |
| 换行 | 单行省略（`flex: 1 1 auto; min-width: 0; font-size: 11px; color: var(--pix-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis`） |
| 容器 `title` | `仅显示当前文档「{docDisplayName(currentDocKey)}」该章节范围内的笔记；点「清除」恢复全部笔记` |
| 清除按钮 | 文本 `清除`；单击即清除（无二次确认）；样式逐字抄 `.notes-selection-clear`（`padding: 2px 6px`、`border-radius: var(--pix-radius-sm)`、`background: transparent`、`font-size: 11px`、hover `var(--pix-bg-hover)`） |
| 容器样式 | 逐字抄 `.notes-selection-bar` 的盒模型（`display:flex; align-items:center; gap:6px; margin-top:6px; padding:3px 4px 3px 8px; border:1px solid var(--pix-border-light,#e3eaf0); border-radius: var(--pix-radius-md); background: var(--pix-bg-elevated,#ffffff)`） |
| 计数文案 | 章节过滤生效时 `本章 {visible} 条 / 共 {total} 条`（`visible` = `groups` 内条目总数；`total` = `notesStore.totalCount`）；不生效时既有两种文案逐字节不变 |
| 章节空态 | `v-else-if="notesStore.hasNotes && notesStore.groups.length === 0 && notesStore.chapterFilter"` → `<div class="notes-chapter-empty">本章暂无笔记</div>`，样式逐字抄 `.notes-filtered-empty` |
| 分支优先级 | loading → error → `!hasNotes`（「还没有摘录」）→ `.notes-chapter-empty` → `.notes-filtered-empty`（「当前文档暂无笔记」）→ `.notes-list` |

---

## 2. 页码范围定义（写死）

### 2.1 与既有 `buildPageLabels` / `buildRangeEnds` 的关系

- 两个私有函数**整体迁入** `outline-notes.ts`（`KnowledgeMap.vue` 内不再有同名函数体、不再有第二份 `collectPreorder`），`label` 与 `end` 由 `buildChapterRanges` **同时产出、同源**。
- 算法逐字对齐今天的 `Math.min(end, pageCount)` 钳制（`KnowledgeMap.vue:110/138`）与「无后继取 `pageCount`」；唯一有意差异是 §0 修订 8 写死的那一处：**「无更大后继且 `pageCount > start`」的节点由单页文本变为 `start-pageCount` 区间文本**（`pageCount === 0` 与 `pageCount === start` 仍输出 `String(start)`；本轮唯一既有文案变化，证据见 §6.3 的 `Appendix B` 行）。
- 今天的 `pageLabels` / `rangeEnds` 两个 computed 合并为一个 `chapterRanges`；`flattenVisible` 从「读 labels」改为「读 ranges」（`pageLabel = range?.label ?? null`，`isCurrent` 读 `range.end`）。

### 2.2 三条语义（写死）

1. **重叠（嵌套章节）**：一条笔记同时落进多个 range 时，**徽标计数重复计入每一个命中节点**（计数之和 ≥ 该文档笔记数，允许重复）。样本夹具里 `2. Method Overview`(p2, `[2,2]`) 与 `2.1 Sparse mask budget`(p2, `[2,2]`) 即此情形，N54/N55 的断言正是拿它当证据。
2. **计数口径与过滤命中口径同一个**：`groupNotesByDocument` 的章节分支直接调 `matchesChapterFilter`（§1.2，同文件内无第二份区间谓词），徽标用 `countNotesByChapter` 的同一份 `ranges`、同一个 `rangeContains` ⇒ 「徽标显示 N 条」与「点它后列表 N 行」在**同一文档**内恒等（差异只可能来自「面板选择集」「笔记清单在两次读取间被改写」这类外部变化，不来自口径）。
3. **父节点范围不保证覆盖后代**：预序中第一个更大页码的节点可能是自己的后代（父 p1、子 p2 ⇒ 父范围 `[1,1]`）。因此「点父章节徽标 = 只看该父章节起始页范围的笔记」是常态，文档与注释都必须按「页码范围内的笔记数」表述，不得写成「子树内的笔记数」。
4. **正确化的结论（must-fix 8 第二条）**：不是「起始页相同 ⇒ 范围相同」，而是「**后继节点相同 ⇒ 范围相同**」。预序 `[A(p2), B(p3), C(p2)]` 中 A 与 C 起始页相同但 A 的后继是 B（`[2,2]`）而 C 无更大后继（`[2, pageCount]`）。实现与优化都不得依赖前一条（烟测 `range-overlap` 第三条断言即为反例）。
5. **无页码节点**：不进 Map ⇒ 无页码徽标、无笔记徽标、不可点击过滤、不参与已读/当前判定；其有页码的后代照常参与全部上述口径（`Appendix A`(null) 与 `Appendix A.1`(p3) 即证据）。
6. **不落在任何范围内的笔记**：不出现在任何徽标上，也不被章节过滤命中；**不新增「未归类」节点**（反需求 6）。开发档需面向用户写明这条可解释性（「第 1 页有摘录但地图上没有徽标」只可能来自目录与正文页码错位）。

---

## 3. 时序与生命周期

### 3.1 点击徽标 → 切标签 → 应用过滤

```
用户点 .note-count-badge
→ notesStore.focusChapter({ title, start, end, label })
   ├─ currentDocKey === null ? 直接 return（no-op）
   ├─ chapterFilter = { title, label, start, end }      （同步，非消费）
   └─ chapterFocusToken += 1                            （同步，一次性）
→ WorkspacePage 的 watch（pre）: token > 0 且 > 旧值
   ├─ leftCollapsed = false
   └─ selectLeftTab("notes") → leftTab = "notes" + notesStore.loadNotes()（既有编排）
→ 面板：status ready 后渲染 .notes-chapter-filter；列表 = groupNotesByDocument(..., chapterRange)
→ 行数 === 徽标数字（同一份 ranges/rangeContains）
```

冻结判据：点击徽标**不改变** `.page-label`、不改变 `.map-row.current`、不清选择集、不发除 `notesLoad` 以外的 IPC；再次点击同一徽标（内容相同）仍走完整流程（不存在同内容 no-op）。

### 3.2 清除

点 `.notes-chapter-filter-clear` → `clearChapterFilter()` → `chapterFilter = null` → 过滤条从 DOM 移除、列表回全量、计数回既有文案；**token 不变** ⇒ 不触发标签切换；`currentDocOnly` 不变；阅读位置不变。

### 3.3 切文档

`readerStore.filePath` 变化 → `notesStore.currentDocKey` 变化 → `watch(currentDocKey)` ⇒ `chapterFilter = null`（token 不变 ⇒ 不切标签、不发 `notesLoad`）。切回原文档**不恢复**过滤。地图随新文档重建（`outline` 由 `openDocument` 清空后由 `PdfViewer` 重填）。

### 3.4 关闭地图

点 `.map-toggle` → `mapOpen = false` ⇒ `.knowledge-map-slot` 卸载（`v-if="showMap"`），`KnowledgeMap` 整体卸载（含徽标与进度）。`chapterFilter` **保留**（地图不是过滤的作用域）；无写盘、无 IPC。

### 3.5 离开工作区（goHome / 卸载）

`goHome`：`flush()` → `stopSession()` → … → `notesStore.resetNotes()`（`chapterFilter = null`、`chapterFocusToken = 0`、清选择集）→ `router.push("/")`。watcher 因「新值不大于旧值」不进入效果分支 ⇒ 不写 `leftTab`/`leftCollapsed`、不发 `notesLoad`。卸载路径（`onUnmounted` → `resetNotes()`）同理。

### 3.6 过滤与「仅看当前文档」的组合

| `currentDocOnly` | `chapterRange` | 可见集合 | 组数 |
| --- | --- | --- | --- |
| false | null | 全部笔记（今天） | N |
| true | null | 当前文档全部（今天） | 1 或 0 |
| false | 非空 | 当前文档 ∩ 范围 | 1 或 0 |
| true | 非空 | 与上一行**逐条相同** | 1 或 0 |

开关值永不被程序改写；`currentDocKey === null` 时 `chapterRange` 结构上为 `null`（写入闸门 + 清除点）。

---

## 4. 失败路径表

| # | 情形 | 地图 | 笔记面板 | 断言/证据 |
| --- | --- | --- | --- | --- |
| 1 | 无书签（`older-paper.pdf`） | `.map-empty`（「当前文档没有书签」）+ `.map-count` = 0 + **`.map-progress` 仍渲染**（进度与目录无关）；无 `.map-row`、无徽标 | 正常（无章节过滤入口） | 场景 `50c`；组 `map-progress` |
| 2 | 无笔记（`notes.json` 为空） | 全部节点无 `.note-count-badge`（`counts` 为空 Map）；无点击入口 ⇒ 结构上写不出 `chapterFilter` | 「还没有摘录」（分支优先级先于章节空态）；未写过过滤时 `.notes-chapter-filter` 不在 DOM。注：**可达**的「过滤生效后笔记被删空」会同时满足 `chapterFilter !== null` ⇒ 过滤条仍渲染、计数 `本章 0 条 / 共 0 条`，列表走「还没有摘录」（§0.3 冻结的优先级） | 场景 `01`（既有）+ 组 `map-note-badges`（`badges === 0` 分支由 `2.2` 行的 `noteNum === null` 覆盖） |
| 3 | 有笔记但无书签 | 徽标无处可挂（`ranges` 为空）⇒ 一个都不渲染；不抛错 | 正常 | 组 `map-note-badges`（`older-paper` 打开时 `.note-count-badge` 计数 0；`archive/older-paper.pdf` 的 p7 笔记不参与） |
| 4 | 文档不是 PDF（`.md`/`.txt`/未知格式） | `.map-toggle` 结构性不渲染（`isPdf === false`）⇒ 无地图、无徽标、无 `.map-progress` | `currentDocKey` 可非 null（资料库内文档）但无徽标可点 ⇒ `chapterFilter` 保持 `null` | 走查（`ReaderPanel.vue` 零 diff）+ 既有场景 `00-11` 不变 |
| 5 | 地图宽度不足（stage < 620 px） | `.map-toggle:disabled` + `title="阅读区宽度不足，无法显示知识地图"`；`showMap === false` ⇒ 无地图/徽标/进度 | 已有过滤状态保留（不被清除、不渲染过滤条以外的影响） | 走查（`ReaderPanel.vue` 零 diff）+ 窗口 1600 px 下 240 px 槽位的 `overflowFree` 判据 |
| 6 | 过滤后 0 条 | 徽标可能因笔记被删而消失；**过滤不清除** | `.notes-chapter-empty` 文本逐字 `本章暂无笔记`；过滤条仍渲染、清除按钮可用；计数 `本章 0 条 / 共 4 条` | 组 `map-chapter-filter`（`chapter-empty` 阶段） |
| 7 | `currentDocKey === null`（资料库外文件） | 全部节点无徽标（`counts` 空） | 正常；`focusChapter` 直调为 no-op（token 不变） | 走查（store 闸门）+ 组 `map-note-badges`（`currentDocKey` 为空的分支不进入离屏面，见 §6.5） |
| 8 | `status === "error"`（读取失败前旧值） | 徽标照旧渲染（读 `notes` 旧值），不新增错误 UI、不清零 | 不渲染过滤条，也不清除 `chapterFilter`；重试成功后原样出现 | 组 `map-chapter-filter`（错误态阶段：先开过滤 → 注入 `setLoadFailure("corrupt")` → 切标签触发加载 → 断言条不存在且清除后仍可用） |
| 9 | `status === "loading"` | 徽标照旧 | 过滤条暂不渲染；加载完成后出现（不出现「过滤丢失」） | 组 `map-chapter-filter`（`setLoadDelay(4000)` 阶段） |
| 10 | 笔记页超出全部范围（如文档 3 页、笔记 page 9） | 不计入任何徽标、不报错 | 若过滤生效则不计入 `visible`（可能转空态） | 烟测 `count-multidoc` 扩展样本 + 走查（`maxPage` 桶过滤） |
| 11 | `pageCount === 0`（加载窗口 / 文本预览） | `.map-progress` 不渲染；label 恒为单页文本；`end = +∞` 只出现在无更大后继的节点（仅防御、不参与渲染），有更大后继的节点 `end` 有限、计数照常（§1.1 空输入行） | 正常 | 场景 `53c`（`setLibraryReadDelay` 造加载窗口后点开地图） |
| 12 | 钳制后 `end < start`（`pageCount` 小于后继页 − 1） | 徽标/`label` 走单页分支（与今天同）；已读判定按钳制后的 `end` | 正常 | 烟测 `range-basic`（钳制样本） |

---

## 5. must-fix 处理表（评审 §2 逐条落点）

| # | must-fix | 处置（本档写死） | 落点 |
| --- | --- | --- | --- |
| 1 | N52-7 与 N61 夹具互斥，「末节点显示区间」无断言 | `sample-paper.pdf` 书签声明新增 `Appendix B`(p2)（`3. Ablation Study` 的子节点，`page < pageCount` 且无更大后继）⇒ `label = "2-3"`；同步徽标数 4 / 已读数（p1: 0、p2: 1、p3: 3）/ 行数 7 / 节点数 8；另加 `Appendix A`(null) + `Appendix A.1`(p3) 覆盖无页码与未展开孙节点 | §6.2 声明表、§6.3 场景 50/51/54 |
| 2 | N59-4/5 不可判定（只展开 depth0、无「展开全部」控件） | 断言改为「可见行 === 声明可见数（depth0+depth1）」＝ 220；耗时起点冻结为**点 `.map-toggle` 到 `.map-row` 数达标**（`performance.now()`，上限 800 ms，附加 3000 ms 兜底返回现场值） | §6.3 场景 55 |
| 3 | 「`.note-count-badge ≥ 15`」与标准种子 4 条冲突 | long-book 笔记用场景局部 `longBookSeed()`（2 条：page 1 excerpt、page 58 answer）写穿同一 `notes.json`；**标准种子 `seedNotes()` 逐字不变**，`openNotesPanel(4)`/`restoredRows === 4`/「共 4 条」/「已导出 4 条」全部保持；`long-book` 结束后 `restoreStandardSeed()` 复位 | §6.2、§6.3 场景 55 |
| 4 | N54-10「与改前同值」无基线 | 删除该判据；改为同 run 内**无徽标行**的 `.page-badge` 与档内声明值比对（文本 / `height` / `fontSize` / `borderRadius`）+ `overflowFree`；带徽标行只断言文本 | §0 修订 2、§6.3 场景 51 |
| 5 | 「`reader-state.json` 字节不变」不成立 | 字节判据拆开：`notes.json` 在「点徽标 / 清除 / 发送 / 切文档」前后字节不变；`reader-state.json` 只在「点徽标 / 清除 / 发送」前后不变，**基线在打开文档并静置 ≥ 900 ms 后取**（切文档会走 `flush()`，不纳入该判据） | §6.3 场景 51/52（`noWrite` 阶段） |
| 6 | token 复位与「只能由 token 变化触发」组合出伪触发 | 保留 `resetNotes()` 归零；watcher 体第一句 `if (token <= 0 \|\| token <= previous) return;`；补两条断言：`goHome` 前后 `notesLoadCalls()` 计数不变（stub 计数器）+ 重进工作区后 `.notes-panel` 不可见且活动标签为「资料库」 | §0 修订 5、§1.4、§6.3 场景 52h |
| 7 | 单一实现点与模块边冲突 + 空 range 吞掉「仅看当前文档」 | 判定式实现落 `notes-path.ts`，`outline-notes.ts` re-export；`range === null` 语义 = 只判文档归属；`groupNotesByDocument` 第四参的章节分支直调 `matchesChapterFilter`、`null` 时退回 `onlyCurrent`（§1.2 写死）；`outline-notes` 只接受已解析 `docKey`/`range` | §0 修订 3/4、§1.2 |
| 8 | 冻结公式丢了钳制 + 「起始页相同 ⇒ 范围相同」为假 | 公式逐字带上 `Math.min(end, pageCount)`（§1.1）；结论改写为「**后继节点相同 ⇒ 范围相同**」并给出反例（§2.2 第 4 条），烟测 `range-overlap` 覆盖 | §1.1、§2.2、§6.2 烟测 |

**次级项（评审 §3）落点**：①开关状态钉死 → 场景 52e/52e2 显式断言 `input.checked`，52f 起始态为 OFF；②删除与字节判据的场景边界 → 章节空态阶段在字节断言之后执行，末尾 `restoreStandardSeed()`；③DOM 顺序断言需三元素同现 → 场景 52 在「已选 2 条 + 过滤生效」的相位判 `compareDocumentPosition`；④N53-5 用加载窗口；⑤N55-9 证据类型改走查；⑥`.map-progress` 布局按修订 1；⑦父章节范围可解释性写进组件注释与开发档；⑧`overflowFree` 判据加入 51/55；⑨`READ_OPACITY` 落 CSS 字面量；⑩`/First` 必须间接引用写进夹具要求。

---

## 6. 验证方案

### 6.1 命令

```bash
# 唯一工程门（已实测：2026-09-15 在未改动的工作树上 0 error）
cd pix && npm run check

# 改前基线（必须先跑，留档到独立目录）
cd pix && PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-r9-base" \
  PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs

# 改后取证
cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
```

### 6.2 纯函数烟测（仓库外临时 tsconfig，跑完删除）

```bash
TMP="/c/Users/86157/AppData/Local/Temp/pix-r9-smoke"; mkdir -p "$TMP"
# tsconfig.json：{ compilerOptions: { module: commonjs, target: es2022, moduleResolution: node,
#   strict: true, skipLibCheck: true, outDir: "./out",
#   paths: { "@shared/*": ["E:/develop/PiX-Read/pix/src/shared/*"] } },
#   include: ["E:/develop/PiX-Read/pix/src/renderer/utils/outline-notes.ts",
#             "E:/develop/PiX-Read/pix/src/renderer/utils/notes-path.ts"] }
cd pix && ./node_modules/.bin/tsc -p "$TMP/tsconfig.json"
node "$TMP/smoke.cjs"          # require("$TMP/out/outline-notes.js") / ("$TMP/out/notes-path.js")
rm -rf "$TMP"
```

用例（组名固定，输入 → 期望）：

| 组 | 输入 | 期望 |
| --- | --- | --- |
| `range-basic` | §6.2 声明表（8 节点）+ `pageCount 3` | `root/0 [1,1] "1"`、`root/1 [2,2] "2"`、`root/1/0 [2,2] "2"`、`root/1/1 [3,3] "3"`、`root/2 [3,3] "3"`、`root/2/0` 不存在、`root/2/0/0 [3,3] "3"`、`root/2/1 [2,3] "2-3"`；`Map.has("root/2/0/0") === true`（未展开孙节点也在 Map）；`pageCount 0` 时 `root/2/1.end === Number.POSITIVE_INFINITY` 且 `label === "2"`；钳制样本：`[{page 5}, {page 7}]`、`pageCount 4` ⇒ `end === 4`（`Math.min`）、`label === "5"` |
| `range-null-page` | `[{title:"A",page:null,items:[{title:"A1",page:3}]}]` + `pageCount 3` | `Map.size === 1`，`root/0` 不存在、`root/0/0 [3,3] "3"` |
| `range-overlap` | (1) 同后继：`[X(p2), Y(p3), Z(p2)]`；(2) 父不覆盖后代：`[P(p1, items:[C(p2)])]`；(3) 同起始页不同后继：`[A(p2), B(p3), C(p2)]`、`pageCount 3` | (1) `X` 与 `Z` **范围不同**（`X [2,2]`、`Z [2,3]`）⇒ 反例成立；(2) `P [1,1]`、`C [2,2]`；(3) `A [2,2]`、`C [2,3]` 与 (1) 同 |
| `count-kind` | ranges（`[2,2]` + `[3,3]` + `[1,1]`）+ notes：p2 excerpt×2、p2 answer×1、p1 answer×1 | `[2,2]` ⇒ `{total:3, excerpt:2, answer:1}`；`[1,1]` ⇒ `{total:1, excerpt:0, answer:1}`；`[3,3]` 键**不存在**（0 条不进 Map）；`total === excerpt + answer`；kind 只有两态（域由主进程 `isReaderNote` 白名单闭合），**不测第三态**（不可达，N62-6） |
| `count-multidoc` | 同 ranges，notes 含 `docPath: "archive/older-paper.pdf"` 的 p2/p7 条目 + `docKey = "sample-paper.pdf"` | 另一文档条目全部不计入；page 9 越界条目不抛错、不计入；`docKey === null` ⇒ 空 Map |
| `count-guard` | 手工 ranges Map：`[5,5]`（`start > maxPage`，notes 全在 p1 ⇒ `maxPage === 1`）、`[3,2]`（`end < start`）、单节点 outline + `pageCount 0`（`end = +∞`），另含 `[1,1]` 正常键与 docKey 匹配的 p1 笔记 | 三个越域键**都不写**（不抛错、不写 `0`、不出 `NaN`）；`[1,1]` 照常计数 |
| `count-prefix-sum-equivalence` | 生成 200 节点（3 层）+ 200 条笔记（同页重叠/空范围/越界混合）+ `pageCount 200`；另加 `count-guard` 同款越域样本与 `pageCount 0` 样本 | 逐键与烟测内朴素实现（显式逐页累加 `page >= start && page <= end`，同用「`total > 0` 才写键」与「`end` 非有限即跳过」）的 `{total, excerpt, answer}` **完全相等**；`pageCount 0` 的「空 Map」只在**单节点 outline**（`end = +∞`）上成立；多节点样本（`[A(p1), B(p2)]` + `pageCount 0`）两侧同为 `A` 键（`maxPage === 1`）⇒ `pageCount === 0` 不做特判 |
| `filter-predicate` | `rangeContains` 边界与 `matchesChapterFilter` 组合 | 闭区间两端命中；`start-1`/`end+1` 不命中；`page < 1` 不抛错且不命中；`docPathKey` 大写/反斜杠归一后命中；`docKey` 不匹配 ⇒ `false`（即使 `range === null`）；`docKey === null` ⇒ `false`；`range === null` 且 doc 匹配 ⇒ `true` |
| `empty-inputs` | `buildChapterRanges([], 0)`、`countNotesByChapter(new Map(), [], null)`、`groupNotesByDocument([], null, false, null)` | 全部返回空结果、不抛错；`groupNotesByDocument(notes, key, onlyCurrent, null)` 与三参签名结果**逐字段相等**（`JSON.stringify` 相等）；第四参单页区间/跨页区间的分组结果按 §1.2 的章节分支与回退分支 |

### 6.3 离屏场景（50–55，追加在 `runReaderStateScenarios` 末尾，复用既有 helper）

新增 `SEL`（命名冻结）：`mapToggle: ".map-toggle"`、`mapRow: ".map-row"`、`mapNode: ".map-node"`、`mapBadge: ".note-count-badge"`、`mapProgress: ".map-progress"`、`chapterFilter: ".notes-chapter-filter"`、`chapterFilterClear: ".notes-chapter-filter-clear"`、`chapterEmpty: ".notes-chapter-empty"`、`mapSlot: ".knowledge-map-slot"`、`mapEmpty: ".map-empty"`（后两项供 `openMap()` 与 `50c` 的空态等待）。

新增场景内 helper（局部闭包，命名自由但语义冻结）：`openMap()`（点 `.map-toggle` 后等 `.knowledge-map-slot` 出现 —— **不是**等 `.map-row`：无书签与加载窗口下只渲染 `.map-empty`，`.map-row` 结构性不存在，等它必然超时；需要行的场景各自显式等行数）、`mapSnapshot()`（`.map-count` 文本、行数、`.page-badge` 文本序列、每行 `{label,pageText,noteNum,noteTitle,read,current,opacity,overflow}`）、`mapRowByLabel(name)`、`longBookSeed()`、`clickMapBadge(name)`。

**夹具书签声明表（写死在脚本内，断言直接引用其字面量）**

```js
// sample-paper.pdf：3 页。声明表字段分工：{ title, page, items } 喂给 buildPdf 生成 /Outlines；
// label 只是**断言期望值**（手写，不参与 PDF 生成；唯一文案变化 2-3 在此行）
const SAMPLE_OUTLINE = [
  { title: "1. Abstract",          page: 1, label: "1",   items: [] },
  { title: "2. Method Overview",   page: 2, label: "2",   items: [
      { title: "2.1 Sparse mask budget", page: 2, label: "2", items: [] },
      { title: "2.2 Positional prior",   page: 3, label: "3", items: [] },
  ] },
  { title: "3. Ablation Study",    page: 3, label: "3",   items: [
      { title: "Appendix A",     page: null, label: null, items: [
          { title: "Appendix A.1", page: 3, label: "3", items: [] },      // 未展开的孙节点：证明键含未展开节点
      ] },
      { title: "Appendix B",     page: 2, label: "2-3", items: [] },        // 无更大后继且 page < pageCount
  ] },
];
const SAMPLE_MAP_EXPECT = {
  nodeCount: 8, visibleRows: 7, badges: 4,
  badgeTexts: ["1", "2", "2", "3", "3", "2-3"],                 // 按 DOM 顺序的 .page-badge
  rows: [ /* 每行 label / pageText / noteNum / noteTitle，逐字取 §6.3 的期望值表 */ ],
  read: { page1: { read: 0, current: 1 }, page2: { read: 1, current: 3 }, page3: { read: 3, current: 3 } },
  progress: { page1: "第 1 / 3 页 · 33%", page2: "第 2 / 3 页 · 67%", page3: "第 3 / 3 页 · 100%" },
};
```

标准种子（`seedNotes()`，逐字不变）下的徽标期望：

| 行 | label | `.note-count-num` | `title` |
| --- | --- | --- | --- |
| `1. Abstract` | `1` | `1` | `1 条笔记 · 摘录 1 · AI 结论 0；点击只看该章节笔记` |
| `2. Method Overview` | `2` | `2` | `2 条笔记 · 摘录 1 · AI 结论 1；点击只看该章节笔记` |
| `2.1 Sparse mask budget` | `2` | `2` | 同上 |
| `2.2 Positional prior` | `3` | — | 无 `.note-count-badge` |
| `3. Ablation Study` | `3` | — | 无 |
| `Appendix A` | — | — | 无页码徽标、无笔记徽标；子节点 `Appendix A.1` 默认不渲染 |
| `Appendix B` | `2-3` | `2` | `2 条笔记 · 摘录 1 · AI 结论 1；点击只看该章节笔记` |

`long-book.pdf`（新建，60 页）：`LONG_BOOK_OUTLINE` = 20 章 × 10 节 × 1 子节，标题 `Chapter NN` / `Section NN.MM` / `Note NN.MM`（ASCII）；页码规则 `page(Chapter k) = page(Section k.*) = page(Note k.*) = 1 + 3k`（k 从 0 起，单调不减）；`label(Chapter 01) = "1-3"`、`label(Chapter 20) = "58-60"`。声明期望：节点数 **420**、默认可见行 **220**（depth0 + depth1）、`.map-count` = 420、`.page-badge` 数 = 220、场景局部种子 `longBookSeed()`（`lb-1` page 1 excerpt、`lb-2` page 58 answer）⇒ `.note-count-badge` 数 = **22**（chapter 1 与其 10 节 11 个 + chapter 20 与其 10 节 11 个）；抽样 3 行（`Chapter 01` = 1、`Chapter 20` = 1、`Section 11.05` = 无徽标）与场景内朴素参照实现（显式逐页扫描声明表）一致；进度 `第 1 / 60 页 · 2%`。`LIBRARY_TREE` 追加 `long-book.pdf`（追加在末行，既有行位置不变；`waitTreeRows(4)` 用 `>=` 不受影响）。

**`buildPdf(pages, outline = [])` 的书签生成契约（冻结）**

- 对象编号：1 Catalog、2 Pages、3 Font；第 i 页（0-based）= `4+2i`、其内容流 = `5+2i`；书签根 = `4+2*pages.length`；书签节点按声明表**预序**从 `4+2*pages.length+1` 起连续分配。既有对象编号与字节布局不变。
- Catalog：`outline.length === 0` 时保持 `<< /Type /Catalog /Pages 2 0 R >>` 逐字不变；非空时为 `<< /Type /Catalog /Pages 2 0 R /Outlines {rootId} 0 R >>`（不写 `/PageMode`）。
- 书签根：`<< /Type /Outlines /First {id} 0 R /Last {id} 0 R /Count {n} >>` —— **`/First` 必须是间接引用**，否则 pdf.js 4.10.38 直接判「无书签」（空态而非报错）。
- 节点：`<< /Title ({escapePdfText(title)}) /Parent {parentId} 0 R [/Dest [{pageObjId} 0 R /XYZ null null null]] [/Prev id] [/Next id] [/First id /Last id /Count n] >>`；`page === null` ⇒ **不输出 `/Dest`**；`/Prev`/`/Next`/`/First`/`/Last`/`/Count` 仅在存在时输出；`/Count` = 该节点后代总数（pdf.js 只解析不使用）。
- 文本仅 ASCII + `escapePdfText`。

**场景与断言（截图数量只增不减；旧场景编号 00–11/20–24/30–36/40–46 不占用）**

| 场景 | 步骤（入口统一为 `goHome → clearStateA → enterWorkspace(LIBRARY_NAME) → waitTreeRows(5) → seedNotes(...)`） | 截图 | 断言组（失败即抛错） |
| --- | --- | --- | --- |
| `50a` | 种子=标准；打开 `sample-paper.pdf` → `waitPage(1,3)` → 切「笔记」标签 → `openMap()`（只等槽位）→ 等地图形就绪（`countOf(SEL.mapRow) === 7`） | `50-map-outline.png`、`50b-map-outline-zoom.png`（地图槽） | `map-outline`：`.map-count`=8、`.map-row`=7、`.page-badge` 文本序列 = `["1","2","2","3","3","2-3"]`、`Appendix A` 行无 `.page-badge`、`Appendix A.1` 行不在 DOM；点 `2.2 Positional prior` 的 `.map-node` ⇒ `.page-label` = `第 3 / 3 页`（既有跳页零回归），再点 `1. Abstract` 节点回落第 1 页 |
| `50c` | 打开 `archive/older-paper.pdf` → `waitPage(1, 2)` → `openMap()` → 等**空态就绪**：`.map-empty` 存在 且 `.map-progress` 存在（`pageCount` 已就绪）；**不**等 `.map-row`（无书签 ⇒ 结构性不存在） | `50c-map-outline-empty.png` | `map-outline`：`.map-empty` 存在、`.map-count`=`0`、`.map-row`=0、`.map-progress` = `第 1 / 2 页 · 50%` |
| `51` | 同 50a（标准种子） | `51-map-note-badges.png`、`51b-map-badge-zoom.png`（单个徽标） | `map-note-badges`：§6.3 期望表逐行相等；`.note-count-badge` 数 = 4；`2.2`/`3. Ablation Study` 行 `noteNum === null` 且 `row.children.length === 2`（chevron/spacer + `.map-node`）；徽标几何 `height==="16px"`、`borderTopLeftRadius==="999px"`、`fontSize==="10px"`、`borderTopWidth==="1px"`；无徽标行 `.page-badge` 文本/几何 = 声明值（`"3"`、16px、10px、999px）且 `overflowFree`；切「仅看当前文档」ON→OFF 后徽标数字与 `title` 逐字不变 |
| `52` | 标准种子 + 打开文档 + `openMap()` → 点 `.pill-tab[data-tab="library"]`（起始态钉死）→ `clickMapBadge("1. Abstract")` | `52-map-chapter-filter.png`、`52b-...-left-pane.png`、`52c-...-zoom.png`（过滤条） | `map-chapter-filter`（`badge-click` 阶段）：活动标签 `data-tab === "notes"`；条文本 `章节：1. Abstract · 第 1 页`；容器 `title` = `仅显示当前文档「sample-paper.pdf」该章节范围内的笔记；点「清除」恢复全部笔记`；`.note-row` = 1、`.notes-group` = 1、计数 `本章 1 条 / 共 4 条`；`.page-label` 与 `.map-row.current` 数不变；`noWrite`：`notes.json` 与 `reader-state.json` 字节不变（基线在 `waitPage` 后静置 900 ms 取） |
| `52-子行` | `clickMapBadge("2.1 Sparse mask budget")` | 复用 52 | `map-chapter-filter`（`child-badge`）：条文本 `章节：2.1 Sparse mask budget · 第 2 页`、行数 2（与父节点同范围 ⇒ 重叠口径的可见证据） |
| `52-重复` | 先切回「资料库」→ 再点同一徽标 | 复用 52 | `map-chapter-filter`（`repeat-click`）：活动标签变「笔记」（不得判 no-op）、条文本与行数不变 |
| `52-替换` | 点 `Appendix B` 徽标 | 复用 52 | `map-chapter-filter`（`replace`）：条文本 `章节：Appendix B · 第 2-3 页`、行数 2、无累积（`chapterFilter` 单值） |
| `52d` | 点 `.pill-icon-btn[title="折叠资料库"]` → 点徽标 | `52d-map-chapter-filter-collapsed.png` | `map-chapter-filter`（`collapsed`）：`.layout-left` 可见（`offsetWidth > 0`）、活动标签「笔记」、条存在 |
| `52e`/`52e2` | 开关 ON → 点 `2. Method Overview` 徽标；再关开关 OFF → 点同一徽标（前后均断言 `input.checked`） | `52e-...-current-doc-on.png`、`52e2-...-current-doc-off.png` | `map-chapter-filter`（`and-combination`）：两态行数均为 2、`.notes-group` 均为 1、计数均为 `本章 2 条 / 共 4 条`；OFF 态 `input.checked === false`（开关不被程序改写）；同时在 OFF 态（`已选 2 条` 相位）判 `compareDocumentPosition`：`.notes-filter` → `.notes-chapter-filter` → `.notes-selection-bar` 顺序成立 |
| `52f` | 点 `.notes-chapter-filter-clear`（起始态开关 OFF） | `52f-map-chapter-filter-cleared.png` | `map-chapter-filter`（`clear`）：条不在 DOM、行数 4、计数 `共 4 条`、开关仍 false、标签仍「笔记」、`.page-label` 不变 |
| `52f2` | 重新开过滤（`1. Abstract`）→ 删除范围内唯一条目（`.note-delete` 二次点击） | `52f2-notes-chapter-empty.png` | `map-chapter-filter`（`chapter-empty`）：`.notes-chapter-empty` 文本逐字 `本章暂无笔记`、条仍渲染（地图侧 `1. Abstract` 徽标随计数归零而消失，**不得**连带清除过滤）、清除按钮可用、计数 `本章 0 条 / 共 4 条`；随后 `restoreStandardSeed()` 复位（删除写盘发生在 `noWrite` 断言之后） |
| `52g` | 开过滤 → 切「资料库」→ 打开 `archive/older-paper.pdf` → 切回「笔记」→ 断言 → 从树打开回 `sample-paper.pdf` | `52g-map-chapter-filter-doc-switch.png` | `map-chapter-filter`（`doc-switch`）：两次都无 `.notes-chapter-filter`；组为该文档组 / 切回后 2 组；`notes.json` 字节不变（`reader-state.json` 不纳入） |
| `52h` | 点徽标 → 手动切回「资料库」→ 打开另一文档再打开 `sample-paper.pdf`（触发 `loadNotes`）→ 断言仍「资料库」→ 再点徽标 | `52h-map-chapter-filter-focus-once.png` | `map-chapter-filter`（`focus-once`）：中间态活动标签为「资料库」；再点徽标后为「笔记」；`goHome` 前后 `notesLoadCalls()` 计数不变；重进工作区后 `.notes-panel` 不可见且活动标签「资料库」（must-fix 6） |
| `52-err`/`52-load` | 开过滤 → `setLoadFailure("corrupt")`/`setLoadDelay(4000)` → 切标签触发加载 | 不新增 | `map-chapter-filter`（`error` / `loading`）：条不渲染、`chapterFilter` 保留（恢复后条原样出现） |
| `52-inject` | 切「笔记」→ 勾 2 条 → 点徽标开过滤（被隐藏条目仍在选择集）→ 发送 | 不新增（复用 52b） | `map-chapter-filter`（`injection`）：选择条 `已选 2 条`、chip `摘录 2 条`、`sendCalls` 最近一条仍含 `reader_notes:` 且 2 条；`reader-state.json` 字节不变 |
| `53` | 同 50a → 点 `下一页` 到第 2 页 → 第 3 页 | `53-map-progress.png`、`53b-map-progress-p2.png` | `map-progress`：§6.3 进度三态逐字；`.map-progress` 的 `N / M` 截取后与 `.page-label` 的 N、M 相等；第 1 页 `.map-row.current` 数 = 1 |
| `53c` | `setLibraryReadDelay(900)` → 从树打开 `sample-paper.pdf` → 加载窗口内 `openMap()`（只等 `.knowledge-map-slot`）→ **点击后立即读**（不加等行/等进度） | 不新增 | `map-progress`（`loading-guard`）：加载窗口内 `.map-progress` 不存在（`pageCount === 0`）；`waitPage(1, 3)` 后存在且为 `第 1 / 3 页 · 33%` |
| `54` | 同 50a → 第 1、2、3 页各采样一次（`下一页`） | `54-map-read-dim.png`、`54b-map-read-zoom.png`（已读行） | `map-read`：三页的 `.map-row.read` / `.map-row.current` 计数 = 上表（0/1、1/3、3/3）；`.map-row.read.current` 恒为 0；第 2 页 `1. Abstract` 行 `getComputedStyle(row).opacity === "0.55"`、当前行 `=== "1"`；`Appendix A` 行无 `.read`/`.current`/徽标，点击它后 `.map-row` 变 8 且出现 `Appendix A.1` 行（`.page-badge` = `"3"`）；第 3 页点 `1. Abstract` 徽标（`.read` 行）仍触发过滤（行数 1），随后清除 |
| `55` | `seedNotes(longBookSeed())` → 打开 `long-book.pdf` → `waitPage(1,60)` → 计时：点 `.map-toggle` 到 `.map-row` 数达 220 | `55-map-scale-200.png` | `map-scale`：`.map-count` = 420、`.map-row` = 220（= 声明可见数，非节点数）、`.note-count-badge` = 22、3 个抽样行与朴素参照实现一致、`.map-progress` = `第 1 / 60 页 · 2%`、耗时 ≤ 800 ms（`performance.now()`，另记 3000 ms 兜底现场值）、`overflowFree` 抽样通过；结束后 `restoreStandardSeed()` |

`MEASUREMENTS.json` 新增六组：`map-outline`、`map-note-badges`、`map-chapter-filter`、`map-progress`、`map-read`、`map-scale`；每组至少一条「失败即抛错」判据（沿用 `record(label, data, failures)`）。

### 6.4 回归与基线比对（N62）

1. 改前跑基线（`PIX_SHOT_ROOT=…/pix-r9-base`）留档 `MANIFEST.json` + `MEASUREMENTS.json`。
2. 改后：既有 `MEASUREMENTS` 组（`list-current-doc-filter-off/on`、`after-filter-off-settled`、`tree-progress`、`resume-entry`、`note-jump`、`anchor-cache`、`notes-select`、`notes-context`、`pdf-text-layer-geometry` 等）逐字段与基线相等；新增 6 组为增量。
3. 截图数只增不减（基线按实测 75 张 → 改后 ≥ 95：50/50b/50c、51/51b、52/52b/52c/52d/52e/52e2/52f/52f2/52g/52h、53/53b、54/54b、55）；`MANIFEST.json.failure === null`；退出码 0。
4. 唯一允许的既有画面差异：资料库树新增一行 `long-book.pdf`（fixture 变化，位于树末行，既有行位置不变）；既有断言全部按文本/标题定位，不受影响。
5. `notes.json` / `reader-state.json` 无新字段、无新写入路径（`git diff` 不含 `pix/src/main/**`）。

### 6.5 代码级核对点（走查）

| 核对 | 命令 / 位置 | 期望 |
| --- | --- | --- |
| 单一实现点 | `grep -n "buildPageLabels\|buildRangeEnds\|collectPreorder" pix/src/renderer/components/workspace/KnowledgeMap.vue` | 无命中 |
| 预序唯一 | `grep -rn "parentKey" pix/src/renderer/utils/outline-notes.ts` | 唯一实现（`collectPreorder`） |
| 判定式唯一 | `grep -rn ">= .*start.*&&.*<= .*end" pix/src/renderer` | 只命中 `notes-path.ts` |
| 无第二份区间谓词 | `grep -rn "scopeDoc" pix/src/renderer` | 无命中（§1.2 章节分支直调判定式，无折写变量） |
| 过滤分支直调判定式 | `grep -n "matchesChapterFilter" pix/src/renderer/utils/notes-path.ts` | 定义 + `groupNotesByDocument` 章节分支调用，无第三处 |
| 依赖方向 | `grep -n "import" pix/src/renderer/utils/outline-notes.ts` | 仅 `@shared/types`（type-only）+ `./notes-path` + re-export |
| 无 any / 无内联动态 import | `grep -rn ": any\|await import(" pix/src/renderer/utils/outline-notes.ts pix/src/renderer/components/workspace/{KnowledgeMap,NotesPanel}.vue` | 无命中 |
| token 消费唯一 | `grep -n "chapterFocusToken" pix/src/renderer` | 只命中 store 与 `WorkspacePage.vue` 的单个 watcher |
| 不得读 filter 切标签 | `grep -n "chapterFilter" pix/src/renderer/pages/WorkspacePage.vue` | 无命中 |
| 开关唯一写入 | `grep -rn "currentDocOnly.value =" pix/src/renderer` | 只命中 `notes-store.ts` 的 `setCurrentDocOnly` |
| 已读透明度唯一 | `grep -c "opacity: 0.55" pix/src/renderer/components/workspace/KnowledgeMap.vue` | `1` |
| 白名单 | `git status --short` + `git diff --stat` | 仅本档 + §7 白名单文件；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、`pix/src/main/**`、`pix/src/shared/types.ts` 零改动 |
| R8 面零改动 | `git diff -- pix/src/renderer/utils/reading-context.ts pix/src/renderer/components/workspace/ChatPanel.vue pix/src/renderer/composables/useQuickAsk.ts` | 空 |
| 阅读区零改动 | `git diff -- pix/src/renderer/components/workspace/ReaderPanel.vue pix/src/renderer/components/workspace/PdfViewer.vue` | 空 |
| 危险用法排除 | `grep -n "for (let p = .*p <= .*end" pix/src/renderer/utils/outline-notes.ts` | 无命中（不得逐页累加） |
| Vuetify `<v-switch>` 用法 | `NotesPanel.vue` 既有写法逐字保留（不改 label/disabled/color） | 无新增 Vuetify 组件依赖 |

---

## 7. 开发分工（白名单，互不重叠）

### A：数据与编排（4 个文件 + 临时烟测）

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `pix/src/renderer/utils/outline-notes.ts` | **新建** | §1.1 的两个实现 + §0.1 的导出表（re-export 判定式）；`ChapterRange` / `ChapterNoteCount` 类型 |
| `pix/src/renderer/utils/notes-path.ts` | 修改 | `PageRange`、`rangeContains`、`matchesChapterFilter`、`groupNotesByDocument` 第四参与 §1.2 的章节分支（直调判定式）/回退分支 |
| `pix/src/renderer/stores/notes-store.ts` | 修改 | §1.3 全部（字段/派生/动作/清除点）；选择集与 R8 动作零改动 |
| `pix/src/renderer/pages/WorkspacePage.vue` | 修改 | §1.4 的单个 watcher（修订 5 守卫 + `leftCollapsed`/`selectLeftTab`）；既有编排零改动 |
| `%TEMP%/pix-r9-smoke/**` | 临时 | §6.2 烟测脚本（tsconfig + smoke.cjs），跑完删除，仓库不留残留 |

### B：视觉与面板（3 个文件）

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `pix/src/renderer/components/workspace/KnowledgeMap.vue` | 修改 | 删除本地 `buildPageLabels`/`buildRangeEnds`/`collectPreorder`，改调 `buildChapterRanges`；`MapRow` 增 `range`/`count`；`noteCounts` computed；徽标 DOM+样式+点击；`.map-progress`；`.map-row.read`（CSS 字面量 0.55）；`isCurrent` 逻辑零改动 |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | §1.8 过滤条 / 章节空态 / 计数第三态 / 分支优先级；其余（分组渲染、删除确认、备注、展开、AI 徽标、R8 选择控件与选择条、错误态、导出文案）零改动 |
| `pix/scripts/ui-shot.mjs` | 修改 | `buildPdf` 书签支持（§6.3 契约）、`SAMPLE_OUTLINE`/`LONG_BOOK_OUTLINE`/`long-book.pdf`/`LIBRARY_TREE` 追加、`SEL` 10 项、stub 的 `notesLoadCalls()` 计数器、50–55 场景与 6 组断言、`longBookSeed()`/`restoreStandardSeed()` 复位 |

接口冻结（两侧只通过这三处耦合）：`buildChapterRanges` / `countNotesByChapter` 的签名与返回结构（§1.1）；`notesStore.focusChapter({ title, start, end, label })` 与 `clearChapterFilter()`（§1.3）；DOM 类名与文案（§1.5–§1.8）。

---

## 8. 需求回退建议（若负责人不接受以下任一条，需回改需求档字面）

1. 本档 §0 修订 1/6/7 改动的是需求档字面（`.map-progress` 位置、`chapterFilter` 字段、`focusChapter` 入参）——均为「冻结项与可实现性冲突」的对齐，机制不变、可见行为不变。若必须逐字保留，则 §0.6 需接受 `.map-header` 换行（`.map-count` 在窄槽可能换行）或改为「包一层容器」（本档已选等价方案）。
2. N53-7 / N54-10 的「与改前同值」类判据在本轮**不可能**成立（今天零地图基线）——本档改为声明字面量 + 同 run 比对（修订 2）。若负责人坚持像素级回归，需先落一次「带书签夹具 + 空实现」的基线 run 再改造。
3. N59-4/N59-5 的原始字面（行数 = 节点数、`.note-count-badge ≥ 15`、无「展开全部」控件下的耗时起点）在 3 层夹具上不可构造——本档按 must-fix 2/3 改写；若负责人要求「可见行 = 节点数」成立，则需新增「展开全部」控件（与反需求 §3.9 冲突，需另行决策）。
4. N55-9 的烟测证据面不存在（store 依赖 vue/pinia），本档按走查处置；若坚持要烟测，需把 `focusChapter` 的 no-op 条件抽成纯函数（会给 store 增加一层转发，本档不采用）。
5. N57-8/N62-7 的「`reader-state.json` 字节不变」在产品语义上为假（打开文档即去抖落盘、切文档 `flush()`），本档按 must-fix 5 拆开判据；若要求文件完全不被触碰，则与 R6 现场链路直接冲突，需改 R6 契约。

---

## 定稿修订（R9）

> 来源：`docs/pm/R9-review.md` 的「设计评审」§3 must-fix 5 条（含两份评审的编号：需求评审 must-fix 与设计评审 must-fix 独立编号，本节按设计评审）。逐条消解如下，正文已同步（落点见末列）；本节是改动清单，不构成第二份契约。

| # | must-fix | 处置（写死） | 正文落点 |
| --- | --- | --- | --- |
| 1 | `openMap()` 与场景 `50c` 互斥 | `openMap()` 的等待谓词由 `.map-row` 改为 `.knowledge-map-slot`（`SEL.mapSlot`，`v-if="showMap"` 的宿主，无书签与加载窗口下都存在）；需要行的地方各自显式等行数；`50c` 等的是**空态**（`SEL.mapEmpty` + `.map-progress` 就绪，不等行）；`53c` 在加载窗口内点击后立即读，不加任何等待 | §6.3 SEL 与 helper 定义、场景 `50a`/`50c`/`53c`、§7-B（`SEL` 10 项） |
| 2 | 修订 8 的「与今天逐字等价」为假，且与 §2.1「唯一有意差异」矛盾 | 删除等价声明，改写为「除『无更大后继且 `pageCount > start`』输出 `start-pageCount` 外与今天逐字相同；`pageCount === 0` 与 `pageCount === start` 仍输出 `String(start)`」；写明不得再按等价口径实现（否则 `50a` 与 §6.3 徽标表一起失败） | §0 修订 8、§2.1 |
| 3 | 计数域两条为假（`pageCount === 0`、`start > maxPage`） | §1.1 空输入行删除「`pageCount === 0` ⇒ 空 Map」的一般声明（有更大后继的节点 `end` 仍有限 ⇒ `maxPage` 非 0、返回非空 Map）；计数行补守卫「`start > maxPage` 或 `end < start` 或 `end` 非有限 ⇒ 该键不写」；§6.2 新增 `count-guard` 组，`count-prefix-sum-equivalence` 的 `pageCount 0` 样本收敛为单节点 outline 并补多节点反向样本 | §1.1 计数/空输入行、§6.2 `count-guard` 与 `count-prefix-sum-equivalence` |
| 4 | 「其它 kind 不计」与「徽标数字 ≡ 点它后行数」冲突，且属 N62-6 禁止的死分支 | 删除第三分支：`kind === "answer"` ⇒ `answer`，其余（`excerpt`）⇒ `excerpt`，`total === excerpt + answer` 恒等；域由主进程读侧白名单闭合（`pix/src/main/notes-store.ts:114` 的 `isReaderNote`，越域即整库判 corrupt ⇒ 该分支不可达） | §1.1 计数页过滤行、§6.2 `count-kind` |
| 5 | 组合式与「判定式唯一」/N56-3 有落差 | `groupNotesByDocument` 的章节分支直接调 `matchesChapterFilter(note, currentKey, chapterRange)`，仅 `chapterRange === null` 时退回 `onlyCurrent`；删除 `scopeDoc` 折写；§6.5 增两条走查（无 `scopeDoc`、`matchesChapterFilter` 无第三处） | §0 修订 4、§1.2、§2.2 第 2 条、§6.5、§7-A |

附带同步（非 must-fix，评审 §4 次级项 2）：§6.4 第 3 条的基线截图数按实测 75 计，改后下限改 `≥ 95`。

冻结不变（本节不得据此翻案）：`buildChapterRanges` / `countNotesByChapter` 的签名与返回结构（除上述两行外）、徽标 DOM 与几何（§1.5）、`.map-progress` 的位置与文案（§1.6）、`.read` 的 `opacity: 0.55`（§1.7）、过滤条与分支优先级（§1.8）、token 语义（§1.3/§1.4）、夹具声明表与 6 组断言的结构（§6.3）。
