# R9 开发档 · 结构可见（N52–N62）

> 上游：`docs/pm/R9-design.md`（定稿，契约以此为准）、`docs/pm/R9-req.md`、`docs/pm/R9-review.md`、`docs/pm/PRD-V0.4.md` §2/§4/§7.4。
> 本档只记录实现事实：改动文件、关键决策与偏差、真实命令与真实输出、逐条自评、未验证事项。
> 分工：**开发 A（数据与编排面）** 见下；开发 B（视觉与面板面）另行追加「## 开发 B」一节。

---

## 开发 A（数据与编排面）

### A.1 改动文件清单

| 文件 | 动作（numstat） | 内容 |
| --- | --- | --- |
| `pix/src/renderer/utils/outline-notes.ts` | **新建**（122 行） | 设计档 §1.1 全部：`collectPreorder`（唯一预序实现，键规则与 `flattenVisible` 逐字相同、含未展开节点）；`buildChapterRanges`（`end`/`label` 同源产出、`Math.min(end, pageCount)` 钳制、无后继取 `pageCount`（`pageCount === 0` 取 +∞，仅防御）、`page === null` 不进 Map）；`countNotesByChapter`（对 notes 恰好一次遍历 → 按页分桶 → 双前缀和 O(1) 区间求和 → 只写 `total > 0` 的键、三处越域守卫）；`ChapterRange` / `ChapterNoteCount`；`rangeContains` / `matchesChapterFilter` 的 re-export |
| `pix/src/renderer/utils/notes-path.ts` | 修改（+31/-3） | 设计档 §1.2：新增 `PageRange`、`rangeContains`（闭区间；页码非有限或 `< 1` 不命中、不抛错）、`matchesChapterFilter`（`docKey === null` 恒 false；`range === null` 只判文档归属）；`groupNotesByDocument` 增第四参 `chapterRange: PageRange \| null = null`，章节分支直调判定式、`null` 时退回 `onlyCurrent` 判定。既有路径/排序/分组/`sortNotesForContext` 零改动 |
| `pix/src/renderer/stores/notes-store.ts` | 修改（+41/-3） | 设计档 §1.3：`chapterFilter`（视图状态，非消费式）+ `chapterFocusToken`（一次性、单调）+ 派生 `chapterRange` / `groups`（第四参）+ 动作 `focusChapter`（首句 `currentDocKey === null` no-op 闸门）/ `clearChapterFilter`；清除点三处（动作、`watch(currentDocKey)`、`resetNotes`）；`setCurrentDocOnly` 与选择集/R8 动作零改动 |
| `pix/src/renderer/pages/WorkspacePage.vue` | 修改（+12/-1） | 设计档 §1.4：单个 `watch(() => notesStore.chapterFocusToken)`（首句 `if (token <= 0 \|\| token <= previous) return;` → `leftCollapsed = false` + `selectLeftTab("notes")`），写在 `selectLeftTab` 定义之后；既有编排（`openDocumentFromLibrary` / `onOpenNote` / `goHome`）零改动 |
| `docs/pm/R9-dev.md` | 新增（本档） | 「## 开发 A」一节（B 面追加） |
| `%TEMP%/pix-r9-smoke/**` | 临时（已删除） | 仓库外烟测 tsconfig + smoke.cjs（§6.2 九组 + 1 组交叉核对），跑完 `rm -rf`，仓库内零残留 |
| 未改动 | — | `components/workspace/KnowledgeMap.vue` / `NotesPanel.vue` / `scripts/ui-shot.mjs`（B 面）；`ReaderPanel.vue`、`PdfViewer.vue`（宽度守卫与跳页，零 diff）；`utils/reading-context.ts`、`ChatPanel.vue`、`useQuickAsk.ts`（R8 面，零 diff）；`pix/src/main/**`、`pix/src/shared/types.ts`、`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`（零改动） |

### A.2 关键决策与偏差

| # | 决策 / 偏差 | 依据与影响 |
| --- | --- | --- |
| D1 | **新模块文件名取设计档冻结的 `utils/outline-notes.ts`**（分工摘要里写作 `outline-range.ts`，与 `R9-req.md` §0.1/§4、`R9-review.md`、`R9-design.md` §1.1/§7 三档冻结的模块路径冲突） | 契约面（B 的 import、烟测 `require`、§6.5 走查的 `grep` 目标）全部按 `outline-notes.ts` 写明；按「契约与设计档逐字一致」以设计档为准。若负责人要改名为 `outline-range.ts`，需同步改 B 面 import 与走查命令 |
| D2 | **`utils/notes-path.ts` 在本轮被修改**（角色摘要的白名单行未列该文件，但设计档 §7-A 的 A 面清单含它、§1.2 是其唯一落点） | 判定式落 `notes-path.ts` 是设计档 §0 修订 3/4 的冻结结论（避免与 `outline-notes` 成环）；不修改它则「判定式唯一」「第四参」「`range === null` 只判文档归属」均无法落地 |
| D3 | re-export 形式取「导入三个值 + 本地 re-export」（`import { docPathKey, matchesChapterFilter, rangeContains } from "./notes-path";` + `export { matchesChapterFilter, rangeContains };`） | 与设计档 §1.1 的两行字面语义等价（`export ... from` 与本地 re-export 对 ESM/CJS 产物一致，`require("outline-notes.js")` 可直接取到两个判定式）；使 `matchesChapterFilter` 的 grep 计数恰为「定义 + 章节分支调用」两处 |
| D4 | `groupNotesByDocument` 的可见性判定从「全量入组 → 末尾按 `isCurrentDoc` 过滤」改为「入组前逐条判定」（章节分支直调判定式；`null` 分支 `!onlyCurrent \|\| docPathKey(note.docPath) === currentKey`） | 章节过滤是 per-note 的（同组内可只保留部分条目），必须在入组前判；三参行为逐字段不变由烟测 `empty-inputs` 的 `JSON.stringify` 相等断言与既有场景回归承担 |
| D5 | 写键条件写成 `if (total > 0) { … }`（而不是 `if (total <= 0) continue;`） | 设计档 §1.1「只写 `total > 0` 的键」「不得靠 `NaN` 比较兜底」：`NaN <= 0` 为假会放行，`NaN > 0` 为假则拒绝；`total > 0` 同时闭合两条 |
| D6 | `maxPage = max(所有有限 end, 0)` 取自 ranges（设计档字面） | 有限范围必有 `end ≤ maxPage`，`prefix[start - 1]`（`start ≥ 1`）与 `prefix[end]` 恒在下标域内；`start > maxPage` 守卫按契约保留为防御式提前返回（正常输入下不可达，`[5,5]` 与 `[1,1]` 同 Map 时 `maxPage === 5`，该键靠 `total > 0` 不写）。`start < 1` 的输入不在契约面内（`buildChapterRanges` 只产出 `start ≥ 1`），未追加第四条件 |
| D7 | `ReaderPanel.vue` 零改动 | 设计档 §4 失败路径 4/5 要求 `ReaderPanel.vue` 零 diff；事件通路 = store 状态 + `WorkspacePage` 编排（§1.4），不经过阅读区组件 |
| D8 | 注释规避走查 `grep` 的命中词：`notes-path.ts` 的说明不写 `scopeDoc` 标识符，`WorkspacePage.vue` 的说明不写 `chapterFilter` 字面 | §6.5「无第二份区间谓词（`grep scopeDoc` 无命中）」「不得读 filter 切标签（`grep chapterFilter WorkspacePage.vue` 无命中）」是逐字判据，注释即会被命中 |

### A.3 纯函数烟测（设计档 §6.2 九组 + 1 组交叉核对，仓库外临时目录）

编译在 `%TEMP%/pix-r9-smoke`（`C:\Users\86157\AppData\Local\Temp\pix-r9-smoke`），跑完删除；仓库内零临时文件。前九组组名与 §6.2 逐字一致；第 10 组是 §2.2 第 2 条「同一口径」的交叉核对（同 R8 处第 16 组早退的先例）：

| 组 | 覆盖的断言 |
| --- | --- |
| `range-basic` | 8 节点声明表：`Map.size === 7`、七键 `[start,end,label]` 逐条（`root/2/1 = [2,3] "2-3"`）、`root/2/0` 不入 Map、未展开孙节点 `root/2/0/0` 在 Map；`pageCount 0` 时 `root/2/1.end === +∞` 且 `label === "2"`、`root/0.end === 1`（有更大后继）；钳制样本 `[{p5},{p7}]` + `pageCount 4` ⇒ `end === 4`、`label === "5"` |
| `range-null-page` | `Map.size === 1`、`root/0` 不存在、子节点 `root/0/0` 照常 `[3,3] "3"` |
| `range-overlap` | (1) `[X(p2),Y(p3),Z(p2)]` ⇒ `X [2,2]`、`Z [2,3]`（「后继不同 ⇒ 范围不同」反例）；(2) 父 p1 / 子 p2 ⇒ `P [1,1]`、`C [2,2]`；(3) `[A(p2),B(p3),C(p2)]` 与 (1) 同形 |
| `count-kind` | `[2,2] ⇒ {3,2,1}`、`[1,1] ⇒ {1,0,1}`、`[3,3]` 键不存在、`total === excerpt + answer` |
| `count-multidoc` | 另一文档条目不计入；`page 9` 越界不抛错不计入；`docKey === null` ⇒ 空 Map |
| `count-guard` | 手工 ranges：`[5,5]`（越域）、`[3,2]`（`end < start`）、`[2,+∞]`（非有限）三键都不写；`[1,1]` 照常计数；输出无 `NaN`；单节点 outline + `pageCount 0` ⇒ 空 Map |
| `count-prefix-sum-equivalence` | 200 节点（3 层、预序页码 1..200）× 200 条笔记（同页重叠 / 空范围 / 越界页 250 / 其它文档混合）与烟测内朴素实现（逐 range 显式区间扫描，同用「`total > 0` 才写键」「`end` 非有限即跳过」）逐键 `JSON.stringify` 相等；`count-guard` 同款样本差分相等；`pageCount 0`：单节点 ⇒ 空 Map、`[A(p1),B(p2)]` ⇒ 两侧同为 `root/0`（`maxPage === 1`，不做特判） |
| `filter-predicate` | `rangeContains` 闭区间两端命中、`start-1`/`end+1` 不命中、`page < 1` 与 `NaN` 不抛错不命中；`matchesChapterFilter` 大小写/反斜杠归一后命中、doc 不匹配恒 false、`docKey === null` 恒 false、`range === null` 且 doc 匹配 ⇒ true |
| `empty-inputs` | `buildChapterRanges([], *)` / `countNotesByChapter(空 Map, *, *)` 空结果；`groupNotesByDocument(..., null)` 与三参结果 `JSON.stringify` 相等（3 种 currentKey × 2 种 onlyCurrent）；第四参单页 / 跨页 / AND 组合（`onlyCurrent` true 与 false 逐条相同）/ `currentKey === null` / 组内部分条目保留 |
| `badge-row-invariant`（附加） | 标准种子（p1 摘录 + p2 摘录 + p2 AI 结论 + 其它文档 p7）× sample-paper 声明表：`countNotesByChapter` 的四个键与 `{root/0:1, root/1:2, root/1/0:2, root/2/1:2}` 逐字相等；对每个徽标键，`groupNotesByDocument(..., {start, end})` 的行数总数 === 徽标数字（角标不撒谎）；`{3,3}` 范围过滤结果为空数组 |

负向对照（证明断言可失败）：把编译产物的 `end = next - 1;` 改成 `end = next;` 后重跑，`range-basic` / `range-overlap` / `badge-row-invariant` 三组判红（`checks=10 failed=3`，退出码 1）；还原产物后全绿（退出码 0）。另一次对照（`if (total > 0)` → `if (total >= 0)`）同样让计数四组判红。

### A.4 真实命令与真实输出

**命令 1（唯一工程门；改前基线与本次改造后）**

```text
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0
```

改前基线（A 面开工前实测）：逐字同上（`CHECK_EXIT=0`）；本档落盘前复跑仍为 `CHECK_EXIT=0`。

**命令 2（烟测编译，仓库外临时 tsconfig）**

```text
$ cd pix && ./node_modules/.bin/tsc -p "$TMP/pix-r9-smoke/tsconfig.json"
TSC_EXIT=0
$ find "$TMP/pix-r9-smoke/out" -type f | sort
/c/Users/86157/AppData/Local/Temp/pix-r9-smoke/out/renderer/utils/notes-path.js
/c/Users/86157/AppData/Local/Temp/pix-r9-smoke/out/renderer/utils/outline-notes.js
/c/Users/86157/AppData/Local/Temp/pix-r9-smoke/out/shared/types.js
```

**命令 3（烟测运行）**

```text
$ node "$TMP/pix-r9-smoke/smoke.cjs"
OK    1）range-basic
OK    2）range-null-page
OK    3）range-overlap
OK    4）count-kind
OK    5）count-multidoc
OK    6）count-guard
OK    7）count-prefix-sum-equivalence
OK    8）filter-predicate
OK    9）empty-inputs
OK   10）badge-row-invariant
checks=10 failed=0
SMOKE_EXIT=0
```

**命令 4（负向对照，仅改仓库外编译产物）**

```text
$ sed -i 's/end = next - 1;/end = next;/' out/renderer/utils/outline-notes.js && node smoke.cjs 2>&1 | grep -E "^(OK|FAIL|checks)"
FAIL  1）range-basic: root/0.end
OK    2）range-null-page
FAIL  3）range-overlap: root/0.end
OK    4）count-kind
OK    5）count-multidoc
OK    6）count-guard
OK    7）count-prefix-sum-equivalence
OK    8）filter-predicate
OK    9）empty-inputs
FAIL 10）badge-row-invariant: Expected values to be strictly deep-equal:
checks=10 failed=3
MUTATED_EXIT=1
$ cp /tmp/on.bak out/renderer/utils/outline-notes.js && node smoke.cjs | grep -E "^(OK|FAIL|checks)"
OK    1）range-basic …（十行全绿，逐字同命令 3）
checks=10 failed=0
RESTORED_EXIT=0
```

**命令 5（§6.5 走查点，A 侧逐条）**

```text
$ grep -rn ">= .*start.*&&.*<= .*end" pix/src/renderer
utils/notes-path.ts:53:  return Number.isFinite(page) && page >= range.start && page <= range.end;   # 判定式唯一

$ grep -n "matchesChapterFilter" pix/src/renderer/utils/notes-path.ts
60:export function matchesChapterFilter(note: ReaderNote, docKey: string | null, range: PageRange | null): boolean {
79:        ? matchesChapterFilter(note, currentKey, chapterRange)                            # 定义 + 章节分支调用，恰两处

$ grep -n "^import\|^export {" pix/src/renderer/utils/outline-notes.ts
11:import type { ReaderNote, ReaderOutlineNode } from "@shared/types";
12:import { docPathKey, matchesChapterFilter, rangeContains } from "./notes-path";
14:export { matchesChapterFilter, rangeContains };

$ grep -rn "chapterFocusToken" pix/src/renderer
pages/WorkspacePage.vue:208 / stores/notes-store.ts:69,215,230,272                            # 只命中 store 与页面单个 watcher

$ grep -n "chapterFilter" pix/src/renderer/pages/WorkspacePage.vue
（无命中，exit=1）

$ grep -rn "scopeDoc" pix/src/renderer
（无命中，exit=1）

$ grep -rn "currentDocOnly.value =" pix/src/renderer
stores/notes-store.ts:213,220                                                                 # 均在 store（resetNotes 与 setCurrentDocOnly）

$ grep -n "for (let p = .*p <= .*end" pix/src/renderer/utils/outline-notes.ts
（无命中，exit=1）

$ grep -rn ": any\|await import(" pix/src/renderer/utils/outline-notes.ts pix/src/renderer/utils/notes-path.ts
（无命中，exit=1）
```

`KnowledgeMap.vue` 内的旧 `buildPageLabels`/`buildRangeEnds`/`collectPreorder` 与 `ui-shot.mjs` 的夹具/场景属 B 面，本档不判定。

**命令 6（白名单与零外溢）**

```text
$ git diff --numstat
12	1	pix/src/renderer/pages/WorkspacePage.vue
41	3	pix/src/renderer/stores/notes-store.ts
31	3	pix/src/renderer/utils/notes-path.ts

$ git status --short
 M pix/src/renderer/pages/WorkspacePage.vue
 M pix/src/renderer/stores/notes-store.ts
 M pix/src/renderer/utils/notes-path.ts
?? pix/src/renderer/utils/outline-notes.ts
?? docs/pm/R9-dev.md
（另有本轮开始前未跟踪的 R9 需求/评审/设计三档）

$ git diff -- pix/src/renderer/components/workspace/ReaderPanel.vue pix/src/renderer/utils/reading-context.ts pix/src/main | wc -l
0                                                                                             # 阅读区 / R8 注入面 / 主进程零 diff
```

**命令 7（临时目录清理）**

```text
$ rm -rf "$TMP/pix-r9-smoke"
$ ls -d "$TMP/pix-r9-smoke"
ls: cannot access '/c/Users/86157/AppData/Local/Temp/pix-r9-smoke': No such file or directory
```

### A.5 A 面自评与未验证事项

- 设计档 §7-A 交付面 4 个文件全部落地；`§1.1`/`§1.2`/`§1.3`/`§1.4` 的签名、文案、守卫与清除点逐条对齐（D1–D8 为执行面偏差与实现笔记）。
- §6.2 九组烟测全绿（另加 1 组交叉核对，共 10 组）+ 两次负向对照可判红；`range-basic` 的 8 节点期望与设计档 §6.3 的 `SAMPLE_OUTLINE` 声明表逐字同源（`Appendix B` ⇒ `"2-3"` 的唯一文案变化在此被钉死）。
- §6.5 的 A 侧走查点（判定式唯一、无 `scopeDoc`、import 面、token 消费唯一、不读过滤切标签、开关唯一写入、无逐页累加、无 `any`/动态 import）全部通过（命令 5）。
- 未验证 1：**离屏（`ui-shot.mjs`）未跑** —— 脚本与 50–55 场景属 B 面白名单，A 侧零改动；`map-outline`/`map-note-badges`/`map-chapter-filter`/`map-progress`/`map-read`/`map-scale` 六组取证待 B 落地后由负责人统一跑基线与改后。
- 未验证 2：**渲染层 store 行为无自动化测试** —— 仓库无渲染层单测设施；`focusChapter` 的 no-op 闸门与 watcher 守卫（复位不触发）在本轮只能走查（设计档 §6.5 已按走查判定），交互断言由 B 的场景 52/52d/52h 覆盖（其驱动直接调用本侧动作名）。
- 未验证 3：B 落地前，`KnowledgeMap.vue` 仍持有旧的范围实现（`buildPageLabels`/`buildRangeEnds`），`npm run check` 与走查的「地图侧单一实现点」判据要等 B 面和入后复跑；本侧接口（`buildChapterRanges` / `countNotesByChapter` / `focusChapter({ title, start, end, label })` / `clearChapterFilter()`）已按 §1.1/§1.3 冻结。
- 未验证 4：`chapterFilter` 的 DOM 表现（过滤条、章节空态、计数第三态）属 B 的 `NotesPanel.vue`；A 侧只保证 `chapterFilter` / `chapterRange` / `groups` 的派生语义（烟测 `empty-inputs` 的第四参组合）。

---

## 开发 B（视觉与面板面）

### B.1 改动文件清单

| 文件 | 动作（numstat） | 内容 |
| --- | --- | --- |
| `pix/src/renderer/components/workspace/KnowledgeMap.vue` | 修改（+114/-76） | 删除本地 `buildPageLabels`/`buildRangeEnds`/`collectPreorder`（改调 `buildChapterRanges`，地图侧不再有第二份范围实现）；`MapRow` 增 `range`/`count`（`flattenVisible` 内一次 `ranges.get(key)`/`counts.get(key)` 填入，模板不做按行调用）；`noteCounts` computed（依赖只有 `notes`/`currentDocKey`/`outline`/`pageCount`）；两个 `v-for` 分支同构的 `.note-count-badge`（`.map-node` 之后的同级 `<button>`）+ `.note-count-num` + 点击 → `notesStore.focusChapter(range)`；`.map-progress`（紧跟 `.map-header` 之后的同级行，单个 computed）；`.map-row.read{opacity:0.55}`（CSS 字面量，全文件一处）；`isCurrent` 改读 `row.range.start/end`（行为等价，见 B.2-D6） |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改（+77/-2） | `.notes-chapter-filter`（`.notes-chapter-filter-text`/`-clear`）位于 `.notes-filter` 之后、`.notes-selection-bar` 之前；`chapterFilterTitle`（`docDisplayName(currentDocKey)`）；计数第三态 `本章 {visible} 条 / 共 {total} 条`；`.notes-chapter-empty`（`本章暂无笔记`）与分支优先级；其余（分组渲染、备注、删除二次确认、选择集、导出、错误态、`v-switch` 写法）零改动 |
| `pix/scripts/ui-shot.mjs` | 修改（+1018/-3） | `buildPdf(pages, outline = [])` 的 `/Outlines` 生成（对象号契约、`/First` 间接引用、`page===null` 不输出 `/Dest`、缺省参数下既有调用点字节不变）；`SAMPLE_OUTLINE`/`SAMPLE_MAP_EXPECT` 同源声明表、`LONG_BOOK_PAGES`/`LONG_BOOK_OUTLINE`；`writeFixtures` 写 `long-book.pdf`、`LIBRARY_TREE` 末行追加；stub 的 `notesLoadCalls()` 计数器；`SEL` 增 10 项；场景 50–55（20 张截图、6 组断言、局部 `longBookSeed()`/朴素参照）；沿用 R8 的 `enterCleanWorkspace`/`openNotesPanel`/`restoreStandardSeed` |
| `docs/pm/R9-dev.md` | 修改 | 「## 开发 B」一节（本节） |
| 未改动 | — | A 的 4 个文件（`outline-notes.ts`/`notes-path.ts`/`notes-store.ts`/`WorkspacePage.vue`）；`ReaderPanel.vue`/`PdfViewer.vue`/`PdfSelectionQuickAsk.vue`（零 diff）；`pix/src/main/**`、`pix/src/shared/**`、`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`（零改动，见命令 6） |

### B.2 关键决策与偏差

| # | 决策 / 偏差 | 依据与影响 |
| --- | --- | --- |
| D1 | **`archive/older-paper.pdf` 在场景 36 末段被 `rmSync`，50c/52g 需要它 ⇒ R9 段开头按原字节重建**（`writeFileSync(…, buildPdf(OLDER_PAGES))`） | 设计档 §6.3 把 `older-paper.pdf` 冻结为「无书签文档」；不重建则 50c/52g 必然开不了文件。重建发生在 00–46 全部断言执行完毕之后，不影响既有场景 |
| D2 | **54 段的取数顺序：三页计数在默认展开集（7 行）下取，`Appendix A` 展开移到三页采样之后** | 设计档的声明值 0/1、1/3、3/3 是在「Appendix A 未展开」时算出的；展开 `Appendix A` 会新增 `Appendix A.1`（范围 `[3,3]`）使第 3 页 `.current` 变 4（实测 4/3 差异即来自此行）。展开放到采样之后与设计档原文叙述的顺序一致，展开本身另立 `expand-null-page` 相位断言（8 行 + `.page-badge === "3"`） |
| D3 | **52f2 的计数按契约公式取 `本章 0 条 / 共 3 条`（设计档字面写 `共 4 条`）** | §1.8 写死 `共 {total}` = `notesStore.totalCount`；同段要求「删除范围内唯一条目」⇒ `totalCount` 由 4 变 3（`applyNotes` 立即覆盖本地列表）。这是设计档内部唯一自相矛盾处，按契约公式落地（实测 `本章 0 条 / 共 3 条`） |
| D4 | **55 段抽样的期望文本按「0 条不进 DOM」归一**：`Section 11.05` 的朴素参照计数 0 ⇒ 期望 `null` | 与 51 段 `2.2 Positional prior` 行的声明表同口径（`noteNum === null` 且无徽标）；否则会把「无徽标」误判为不符 |
| D5 | `.note-count-badge` 补 `cursor: pointer` | 设计档几何清单未列该项；它是 `<button>` 且与 `.map-node` 既有写法一致（可点击）。几何/配色/框线全部按 §1.5 字面 |
| D6 | `isCurrent` 改读 `MapRow.range`（`range.start <= page <= range.end`），`page != null` 判定由 `range != null` 承担 | §1.7 写「函数体零改动」、§2.1 写「读 `range.end`」；按评审次级项 1 以「行为等价」为准：`range` 来自同一 `Map`，`range.start === node.page`，实测三页 read/current 计数与声明表逐字一致（0/1、1/3、3/3） |
| D7 | 单行定位片段收敛为一个字符串生成器 `mapRowExpr(name)`（`mapRowSummary`/`clickMapBadge`/`clickMapNode`/`mapRowCount` 共用） | 同一份「按 `.label` 逐字定位行」的 JS 片段不在四处各写一遍 |
| D8 | **「截图下限 ≥ 95」按设计档 §6.4 字面不成立**：本机基线实测 74 张（设计档/评审按 75 计），改后 94 张 = 基线 + 20 | 「截图数只增不减」「既有截图 0 丢失」成立（命令 4）；74→94 与 75→95 只差基线计数的取整，属环境差异 |
| D9 | `countLabel` 的实现把 `visibleCount` 提到分支之前（三个分支共用一次 `reduce`） | 现有两种文案的输出逐字节不变（既有场景 02/04/13 与 R8 组的计数断言全部保持），只为第三态复用同一份取数 |
| D10 | **中文标点复原**：上一轮结束后 `pix/scripts/ui-shot.mjs` 的工作树副本被整体改写为 ASCII 标点（`，（）`→`,()`、`：`→`:`、`；`→`;`，共 405 行），与「既有场景文案逐字」冲突（实测：`31c` 断言比对的就是 stub 文案，ASCII 化后直接判红） | 以 HEAD 为底、只保留 R9 增量重建该文件（`git show HEAD:…` 作参照，不执行任何 git 写命令），stub 文案、断言文案与产物页文案全部回到与主进程/组件同源的全角标点；重建后 diff 为 `+1018/-3`（与增量本身一致，无标点噪音） |

### B.3 真实命令与真实输出

**命令 1（唯一工程门；改前基线、B 面改造后、收尾各一次）**

```text
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
CHECK_EXIT=0
```

**命令 2（改前基线：A 面已和入、B 面未动，独立产物目录）**

```text
$ cd pix && PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-r9-base" \
  PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
[ui-shot] 结束：产出 74 张截图
BASE_EXIT=0        # MANIFEST.json.failure === null
```

**命令 3（B 面改造后取证；最终验证 run，产物覆盖默认目录 `%TEMP%/pix-r5`）**

```text
$ cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
[ui-shot] 结束：产出 94 张截图
UI_SHOT_EXIT=0     # MANIFEST.json.failure === null（94 张全量走完，无 99-failure-state.png 写入）
```

新增 20 张（5x 组，逐字）：`50-map-outline.png`、`50b-map-outline-zoom.png`、`50c-map-outline-empty.png`、`51-map-note-badges.png`、`51b-map-badge-zoom.png`、`52-map-chapter-filter.png`、`52b-map-chapter-filter-left-pane.png`、`52c-map-chapter-filter-zoom.png`、`52d-map-chapter-filter-collapsed.png`、`52e-map-chapter-filter-current-doc-on.png`、`52e2-map-chapter-filter-current-doc-off.png`、`52f-map-chapter-filter-cleared.png`、`52f2-notes-chapter-empty.png`、`52g-map-chapter-filter-doc-switch.png`、`52h-map-chapter-filter-focus-once.png`、`53-map-progress.png`、`53b-map-progress-p2.png`、`54-map-read-dim.png`、`54b-map-read-zoom.png`、`55-map-scale-200.png`。

**命令 4（回归比对：既有 MEASUREMENTS 组逐字段相等 + 截图只增不减）**

```text
既有测量组：base=84 after=116 比对组=84 差异=0     # 归一化只去输出根路径 / updatedAt / 自动生成笔记 id / elapsedMs 与 ms 采样
截图：base=74 after=94 丢失=0 新增=20
新增组条目：map-outline=3 map-note-badges=2 map-chapter-filter=22 map-progress=2 map-read=2 map-scale=1（共 32 条）
after MANIFEST.failure=null
```

组件级裁切图 19 张里 14 张逐字节相同，5 张均为左栏（`08b`/`10b`/`32b`/`40-…`/`40c-…`），用 Electron `nativeImage.toBitmap()` 逐像素比对：差异 2–173 像素 / 260032 像素（≤0.07%），包围盒均落在笔记行的时间文案与文本抗锯齿区（fixture 用 `Date.now()` 生成相对时间，跨 run 漂移），逐图核对无可辨布局差异，非回归；全景图的差异全部落在资料库树新增行与相对时间文案上（§6.4 第 4 条允许的唯一既有画面差异）。

**命令 4b（最终 run 的工程门复跑）**

```text
$ cd pix && npm run check
CHECK_EXIT=0       # 与命令 1 同输出，代码在最终 run 后未再改动
```

**命令 5（新组关键实测值，摘自 `MEASUREMENTS.json`）**

```text
map-outline :: {"phase":"sample","count":"8","rows":7,"pageBadges":["1","2","2","3","3","2-3"],"appendixA1Rows":0}
map-outline :: {"phase":"jump","toThird":"第 3 / 3 页","backToFirst":"第 1 / 3 页"}
map-outline :: {"phase":"no-outline","empty":true,"count":"0","rows":0,"progress":"第 1 / 2 页 · 50%"}
map-note-badges :: {"phase":"standard-seed",… "noteHeight":"16px","noteFontSize":"10px","noteRadius":"999px","noteBorderWidth":"1px" …}
map-chapter-filter :: {"phase":"badge-click","tab":"notes","text":"章节：1. Abstract · 第 1 页","rows":1,"groups":1,"count":"本章 1 条 / 共 4 条","notesBytesSame":true,"stateBytesSame":true}
map-chapter-filter :: {"phase":"and-combination-off","checked":false,"rows":2,"groups":1,"count":"本章 2 条 / 共 4 条","order":{"hasAll":true,"filterBar":true,"barSelection":true}}
map-chapter-filter :: {"phase":"chapter-empty","text":"本章暂无笔记","bar":true,"count":"本章 0 条 / 共 3 条","rows":0,"abstract":{…"noteNum":null…}}
map-chapter-filter :: {"phase":"focus-once-home","before":70,"after":70}
map-chapter-filter :: {"phase":"injection","countText":"已选 2 条","chip":"摘录 2 条","notesCount":2,"hasReaderNotes":true,"stateBytesSame":true}
map-progress :: {"phase":"three-pages","p1":"第 1 / 3 页 · 33%","p2":"第 2 / 3 页 · 67%","p3":"第 3 / 3 页 · 100%"}
map-progress :: {"phase":"loading-guard","during":{"slot":true,"progress":false,"rows":0},"after":{"progress":"第 1 / 3 页 · 33%"}}
map-read :: {"phase":"three-pages","read1":{0,1},"read2":{1,3},"read3":{3,3},"both":0,"abstractOpacity":"0.55","currentOpacity":"1"}
map-scale :: {"phase":"long-book","timing":{"ms":86,"rows":220,"mode":"ready"},"count":"420","rows":220,"badges":22,"progress":"第 1 / 60 页 · 2%","samples":[Chapter 01=1, Chapter 20=1, Section 11.05=null],"overflowFree":true}
```

**命令 6（§6.5 B 侧走查点）**

```text
$ grep -n "buildPageLabels\|buildRangeEnds\|collectPreorder" pix/src/renderer/components/workspace/KnowledgeMap.vue
（无命中，exit=1）
$ grep -c "opacity: 0.55" pix/src/renderer/components/workspace/KnowledgeMap.vue
1
$ grep -rn ": any\|await import(" pix/src/renderer/components/workspace/{KnowledgeMap,NotesPanel}.vue pix/src/renderer/utils/outline-notes.ts
（无命中，exit=1）
$ grep -rn "chapterFilter" pix/src/renderer
components/workspace/NotesPanel.vue（6 处） / stores/notes-store.ts（7 处）   # 无第三处
$ git status --short
 M pix/scripts/ui-shot.mjs
 M pix/src/renderer/components/workspace/KnowledgeMap.vue
 M pix/src/renderer/components/workspace/NotesPanel.vue
 M pix/src/renderer/pages/WorkspacePage.vue        # A 面
 M pix/src/renderer/stores/notes-store.ts          # A 面
 M pix/src/renderer/utils/notes-path.ts            # A 面
?? pix/src/renderer/utils/outline-notes.ts         # A 面
?? docs/pm/R9-dev.md / R9-design.md / R9-req.md / R9-review.md
$ git diff --stat -- pix/src/main pix/src/shared pix/package.json package-lock.json packages pix/build | wc -l
0                                                                                          # 受保护路径零改动
```

**命令 7（仓库外临时脚本清理）**

```text
$ rm -f "$TEMP"/{reconstruct,reconstruct2,compare,compare2,pixdiff}.cjs "$TEMP"/ui-shot-{head,work,rebuilt}.mjs "$TEMP"/ui-shot-r9.diff
$ ls "$TEMP" | grep -E "ui-shot-(head|work|rebuilt)|pix-r9" || echo "（无残留）"
（无残留）
$ find . -name "*.cjs" -not -path "./node_modules/*" -not -path "./pix/dist/*"
（仓库内零临时文件：无 smoke* / 无 *.cjs 残留）
```

### B.4 MUST 类自评（设计档 §5 / 定稿修订 / §6.5 / §4 的 B 侧落点）

- **must-fix 1（夹具互斥）**：`SAMPLE_OUTLINE` 的 8 节点声明表落在脚本内，`Appendix B`(p2, 无更大后继, `pageCount 3`) ⇒ `label "2-3"`；实测页码徽标序列 `["1","2","2","3","3","2-3"]`、行数 7、节点数 8、徽标 4、已读 0-1-3 全部与声明值逐字相符（命令 5）。
- **must-fix 2（N59 不可判定）**：55 段断言「可见行 === 声明可见数（depth0+depth1）= 220」、`.map-count = 420`；耗时起点为点 `.map-toggle` 到 `.map-row` 数达标（`performance.now()`，800ms 上限，3000ms 兜底返回现场值），实测 `ms=86 / rows=220 / mode=ready`。
- **must-fix 3（徽标数量冲突）**：`longBookSeed()` 是 55 段局部种子（`lb-1` page 1 excerpt、`lb-2` page 58 answer），标准 `seedNotes()` 逐字未改；55 段末 `restoreStandardSeed()` 复位，`openNotesPanel(4)`/「共 4 条」等既有断言全部保持（既有测量组不等=0）。
- **must-fix 4（无基线判据）**：51 段改为同 run 内与档内声明值比对（无徽标行 `.page-badge` 的文本/16px/10px/999px + `overflowFree`；带徽标行只判文本与 class/几何），无任何「与改前同值」判据。
- **must-fix 5（字节判据拆分）**：`notes.json` 在「点徽标 / 清除 / 发送 / 切文档」前后字节不变；`reader-state.json` 只在「点徽标 / 清除 / 发送」前后不变，基线在 `waitPage` 后静置 900ms 取（实测 `notesBytesSame/stateBytesSame` 均 true）。
- **must-fix 6（伪触发）**：`goHome` 前后 `notesLoadCalls()` 计数不变（实测 70 → 70），重进工作区后活动标签为「资料库」且 `.notes-panel` 不可见。
- **must-fix 7/8（模块边与判定式、钳制与结论）**：B 面只消费 A 的派生（`buildChapterRanges` / `countNotesByChapter` / `focusChapter`），地图内无第二份范围实现（命令 6 第 1 条）；55 段抽样与 54 段的已读/当前口径均取自同一份派生（`Section 11.05` 无徽标 = 朴素参照 0 条）。
- **定稿修订 1（`openMap()` 与 50c）**：`openMap()` 只等 `.knowledge-map-slot`；50c 单独等「`.map-empty` 且 `.map-progress` 就绪」，53c 在加载窗口内点击后立即读（不加任何等待），实测加载窗口内 `{slot:true, progress:false, rows:0}`。
- **定稿修订 2（label 唯一差异）**：50a 的断言钉死 `Appendix B ⇒ "2-3"`；`pageCount===0` 的 `String(start)` 分支由 A 的烟测覆盖。
- **定稿修订 3/4（计数域与 kind）**：B 面不写计数逻辑，55 段抽样只与「0 条不进 DOM」的 DOM 契约对齐（D4）。
- **定稿修订 5（判定式唯一）**：`.notes-chapter-filter` 的可见行数与被点徽标的数字同源（52-子行 2 行 ≡ 徽标 2；`chapter-empty` 0 行 ≡ 徽标消失）。
- **§6.3 次级项**：①开关状态钉死（52e/52e2 断言 `input.checked` true/false）、③DOM 顺序三元素同现（52e2 的 `compareDocumentPosition`，实测 `filterBar/barSelection` true）、④`pageCount>0` 守卫用 `setLibraryReadDelay(900)` 造窗口（53c）、⑦父章节范围可解释性写进 `KnowledgeMap.vue` 头注释与本文（§2.2 第 3 条的「页码范围内的笔记数」口径）、⑧`overflowFree` 入 51/55。
- **§4 失败路径表**：1（无书签空态 + 进度仍在，50c）、2/3（无笔记/有笔记但无书签 ⇒ 无徽标，51 与 50c）、6（过滤后 0 条 ⇒ `.notes-chapter-empty` + 过滤条仍在 + 清除可用，52f2）、8/9（error/loading 期间条不渲染、状态保留，52-err/52-load）、11（`pageCount===0` 不渲染进度，53c）全部有离线断言；4/5/7（非 PDF / 宽度不足 / `currentDocKey===null`）按设计档走查（`ReaderPanel.vue` 零 diff + store 闸门）。

### B.5 未验证事项

- **未做全量像素级 diff**：设计档 §6.4 只要求「既有组逐字段相等 + 截图只增不减」；本档对 24 张裁切图做了逐像素比对（14 张逐字节相同，5 张差异 ≤0.07% 且包围盒落在相对时间文案区），55 张全景图未逐像素比对（差异源为新增树行与相对时间文案，已抽样核对）。
- **视觉人工核对为抽样**：已逐张看过 `51b-map-badge-zoom`/`50b-map-outline-zoom`/`52c-map-chapter-filter-zoom`/`54b-map-read-zoom`/`52f2-notes-chapter-empty` 等关键图，未覆盖全部 20 张；样式回归由 51/54 的几何与透明度断言 + 既有测量组承担。
- **52d 的隐含前提**：窗口 1600px 下展开左栏后阅读区仍 ≥ 620px（地图不被宽度守卫卸载）；若后续把窗口改窄，该条断言需同步。
- **未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`**（按工程红线）；无依赖变更、无主进程改动、无落盘字段、无 IPC。

---

## 终验

> 独立验收（不参与实现、未改任何产品代码）：只采信本机实跑输出。证据根目录 `%TEMP%/pix-r9-final`（第一遍）与 `%TEMP%/pix-r9-final2`（第二遍抖动对照），基线 `%TEMP%/pix-r9-base`（改前留档）。烟测脚本与临时产物全部在仓库外（`E:/tmp/pix-r9-final-smoke`，跑完删除）。

### V.1 结论

**PASS**。工程门 0 error；git 卫生干净；离屏两遍均退出码 0、94 张截图、`MANIFEST.json.failure === null`；6 组新断言 32 条两遍逐字段一致；既有 84 条测量与改前基线逐字段相等（唯一差异为自动生成笔记 id）；20 张新截图齐备；既有画面确定性差异全部可解释（资料库树新增行 + ≤3 灰度级抗锯齿噪声），无布局位移。未销账 must-fix = 0；下方 V.5 列出 8 条「无离屏/烟测证据、只能走查」的判据与 1 条已声明偏差（非阻塞）。

### V.2 实跑命令与输出

```text
$ cd pix && npm run check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
CHECK_EXIT=0

$ git status --short
 M pix/scripts/ui-shot.mjs
 M pix/src/renderer/components/workspace/KnowledgeMap.vue
 M pix/src/renderer/components/workspace/NotesPanel.vue
 M pix/src/renderer/pages/WorkspacePage.vue
 M pix/src/renderer/stores/notes-store.ts
 M pix/src/renderer/utils/notes-path.ts
?? docs/pm/R9-{req,review,design,dev}.md
?? pix/src/renderer/utils/outline-notes.ts

$ git diff --stat -- packages/ && git diff --stat -- pix/package.json pix/package-lock.json
（两者均为空输出）
$ git diff --stat -- pix/src/main pix/src/shared pix/src/renderer/components/workspace/ReaderPanel.vue \
    pix/src/renderer/components/workspace/PdfViewer.vue pix/src/renderer/components/workspace/ChatPanel.vue \
    pix/src/renderer/utils/reading-context.ts pix/src/renderer/composables/useQuickAsk.ts
（空输出：受保护路径与 R8/阅读区面零 diff）

$ cd pix && PIX_SHOT_ROOT="$TEMP/pix-r9-final" PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
[ui-shot] 结束：产出 94 张截图
UI_SHOT_EXIT=0     # shots/MANIFEST.json.failure === null；shots/ 内 94 张 png，无 99-failure-state.png
$ （第二遍，独立根 pix-r9-final2） 同上：94 张、UI_SHOT_EXIT=0、failure === null
$ node --check pix/scripts/ui-shot.mjs  →  SYNTAX_OK
```

独立测量比对（本机自写脚本，非复用开发方脚本）：

```text
既有测量组：base=84  after=116  比对组=84  差异组=1
  唯一差异：answer-notes-list 的 page2Ids[] 自动生成 id（时间戳/随机串），非语义字段
新增 6 组：map-outline=3 map-note-badges=2 map-chapter-filter=22 map-progress=2 map-read=2 map-scale=1（共 32 条）
两遍 run 的新组 32 条：逐字段相等（仅 map-scale 的耗时采样 88ms / 98ms 浮动，均 ≤ 800ms）
截图像素差分（PIL 逐像素，1600x1000）：base 74 张 0 丢失，新增 20 张
  与改前基线逐字节相同：31 张
  确定性差异（base≠run1 且 run1==run2）：16 张
    - 11 张 bbox=(48,240,157,253) 648px：资料库树新增 long-book.pdf 行（设计 §6.4 允许的唯一既有画面差异）
    - 00-workspace-enter：572 个强差异像素全部落在 x48–156 / y240–252（同一树行），其余为弱差异
    - 32b/42/42d/44 共 4 张：最大通道差 ≤ 3（抗锯齿级噪声，不可辨）
  跨 run 抖动（run1≠run2）：27 张，均为相对时间文案/滚动条边缘/抗锯齿
```

独立纯函数烟测（自写，仓库外临时 tsconfig + `require` 编译产物；覆盖嵌套计数唯一性、过滤域与计数域一致、边界页码）：

```text
$ ./node_modules/.bin/tsc -p E:/tmp/pix-r9-final-smoke/tsconfig.json   → TSC_EXIT=0
$ node E:/tmp/pix-r9-final-smoke/smoke.cjs
range-basic: ok=4 bad=0 / range-overlap: ok=2 bad=0 / count-nested-unique: ok=1 bad=0
count-kind: ok=1 / count-guard: ok=1 / count-multidoc: ok=1 / filter-predicate: ok=2
count-prefix-sum-equivalence: ok=2 / group-4th-arg: ok=2 / empty-inputs: ok=1 / progress-formula: ok=1
TOTAL checks=18 failed=0     SMOKE_EXIT=0

变异对照（只改仓库外编译产物 end = next - 1 → end = next）：failed=6，MUTATED_EXIT=1；tsc 重编译后复绿。
自纠一处：我的「父不覆盖后代」用例首轮把 pageCount 传 3（期望写成 C=[2,2]）⇒ 实现输出的 C=[2,3] 才是契约值（无后继取 pageCount）；改为同时断言 pageCount 3 ⇒ [2,3]、pageCount 2 ⇒ [2,2]，复绿。

夹具有效性（独立于开发方做法，自选 pages 样本）：
HEAD 版 buildPdf(pages) 与当前版 buildPdf(pages) / buildPdf(pages, []) 产物逐字节相同，md5 330c9e8a61e2a194c0e59fa9ceb4d3bd（1032B）。
```

### V.3 代码级走查（全部通过）

| 判据 | 命令 / 结果 |
| --- | --- |
| 地图侧无第二份范围实现 | `grep -n "buildPageLabels\|buildRangeEnds\|collectPreorder" KnowledgeMap.vue` 无命中 |
| 区间比较唯一 | `grep -rn ">= .*start.*&&.*<= .*end" pix/src/renderer` 只命中 `notes-path.ts:53` |
| 判定式唯一 | `matchesChapterFilter` = 定义 + `groupNotesByDocument` 章节分支调用（两处）+ `outline-notes` re-export |
| 无折写变量 | `scopeDoc` 零命中 |
| token 消费唯一 | `chapterFocusToken` 只命中 store 与 `WorkspacePage.vue:208` 单个 watcher（守卫 `token<=0\|\|token<=previous`） |
| 不读过滤切标签 | `chapterFilter` 在 `WorkspacePage.vue` 零命中（仅 store 7 处 + NotesPanel 6 处） |
| 清除点恰三处 | `chapterFilter.value = null` = store 93/214/235（watch / resetNotes / clearChapterFilter） |
| 开关唯一写入 | `currentDocOnly.value =` 仅 `resetNotes`（既有）与 `setCurrentDocOnly`，无 R9 新增写入 |
| 已读透明度唯一 | `grep -c "opacity: 0.55"` = 1 |
| 无 any / 动态 import / 逐页累加 | 三处 grep 均无命中；`outline-notes.ts` import 面 = type-only `@shared/types` + `./notes-path` + re-export |
| 徽标 DOM 结构 | 两个 `v-for` 分支均为 `.map-row` 直接子、`.map-node` 之后；计数只读 `Map.get`（`counts.get(key)`） |
| 面板无第二筛选管道 | `NotesPanel.vue` 内 `filter(` 零命中；第四参唯一入口在 store |
| 无第三条通路 | `KnowledgeMap.vue` 无 `dispatchEvent`/`CustomEvent`/`WorkspacePage` import |
| 失败路径 | `.map-progress` 的 `pageCount<=0` 不渲染、过滤条 `status==='ready'` 才渲染（读代码与 53c/52-err/52-load 实测一致） |

### V.4 需求档逐条判定（N52–N62，能用证据判定的条目）

| 条目 | 判定 | 证据 |
| --- | --- | --- |
| N52-1/2/6 | 通过 | 走查（V.3）、import 面 |
| N52-3/4/5 | 通过 | 我的烟测 18 条（含未展开孙节点在 Map、同页重叠、父不覆盖后代、`+∞` 与钳制） |
| N52-7 | 通过 | 离屏 `pageBadges=["1","2","2","3","3","2-3"]`（`Appendix B` 唯一文案变化被钉死） |
| N53-1..7 | 通过 | 走查 + 离屏 33/67/100、与 `.page-label` 同值、无书签仍渲染 50%、加载窗口不渲染（53c） |
| N54-1..6/9/10 | 通过 | 走查 + 离屏 4 行徽标逐字（数字/title/几何/ON-OFF 不变）+ 烟测 p9 越界不计入 |
| N54-7/8 | 走查可判、无离屏证据（见 V.5-1/2） | — |
| N55-1..8/10 | 通过 | 走查 + 离屏（切标签、过滤条、行数≡徽标、子行、折叠展开 268px、重复点击、替换、loading 保留恢复） |
| N55-9 | 走查可判（store 首句闸门）、无烟测面（见 V.5-3） | — |
| N56-1..6/8/9 | 通过 | 离屏（文案/title、DOM 顺序 `hasAll/filterBar/barSelection`、AND 两态、`input.checked` 钉死、清除、章节空态 + 清除可用） |
| N56-7 | 无离屏断言（见 V.5-4） | — |
| N57-3/4/5/6 | 通过 | 离屏 injection（已选 2 / chip 2 / `reader_notes` 2）、doc-switch 两次无过滤条、focus-once（70→70、重进 tab=library、面板不可见）、R8/阅读区零 diff |
| N57-1/2 | 无离屏断言（见 V.5-5/6） | — |
| N57-7 | 通过 | 走查（三处清除点，无隐式门控） |
| N57-8 | 部分：点徽标/切文档/发送三相位有字节断言；「清除」相位缺（见 V.5-7） | `notesBytesSame/stateBytesSame` 实测非空（应用真实写过这两个文件） |
| N57-9 | 通过 | 既有 00–11 场景全过；未过滤态过滤条不入 DOM（focus-once-middle `bar=false`） |
| N58-1..8 | 通过 | 离屏 0/1、1/3、3/3、`read∩current=0`、opacity 0.55/1、无页码节点豁免、已读行徽标仍可点；基线比对无回归（`isCurrent` 为语义等价改写，见 V.5-8） |
| N59-2..6 | 通过 | 走查（依赖列表）+ 离屏 420/220/22/`第 1 / 60 页 · 2%`/88ms + 我烟测的 200×200 差分等价 |
| N59-1 | 通过（字面偏差见 V.5-8） | 无逐页累加、模板无按行调用、计数为 computed |
| N60-1..5 | 通过 | 我的独立烟测全绿 + `npm run check` 0 error；仓库内零残留 |
| N61-1/2 | 通过 | 我自做的 buildPdf 字节不变性 + 走查 `/Outlines` 契约（对象号/`/First` 间接引用/无 `page` 不输出 `/Dest`）；夹具实测 8 节点/60 页 420 节点/older 无书签 |
| N61-3..8 | 通过 | SEL 10 项齐备、20 张新图齐备、6 组各含失败即抛错判据、基线 84 条相等、截图只增不减、check 0 error |
| N62-1..4/6/7 | 通过 | 离屏 + 走查 + `git diff` 空集 + 字节断言 |
| N62-5 | 通过 | 我的像素差分分类：确定性差异=树行+抗锯齿（见 V.2） |

### V.5 未判定 / 只能走查的条目（非阻塞，逐条给风险口径）

1. **N54-7（`currentDocKey === null` ⇒ 无徽标）**：无离屏相位（设计档 §6.5 已归口走查）。风险低：`countNotesByChapter` 对 `docKey === null` 返回空 Map 已被我的烟测覆盖，且该分支下徽标点击入口结构上不存在。
2. **N54-8（`status === "error"` 时徽标照旧、不新增错误 UI）**：无离屏相位。风险低：`noteCounts` 的依赖不含 `status`，`KnowledgeMap` 无错误分支（走查）。
3. **N55-9（`focusChapter` 直调 no-op）**：store 依赖 vue/pinia，无烟测面（设计档 §6.5 归口走查）。走查确认首句 `if (currentDocKey.value === null) return;` 在写 `chapterFilter` 之前。
4. **N56-7（过滤生效时删除被隐藏的笔记）**：52f2 删的是**可见**条目；隐藏条目的重算路径无离屏断言。风险低：逐条 `matchesChapterFilter` 判定发生在渲染派生内，无缓存。
5. **N57-1（过滤时导出仍全量 4 条）**：无离屏断言。风险低：导出在主进程按 `notes.json` 全量渲染且 `pix/src/main/**` 零 diff；`exportLabel`/`lastExport` 未改。
6. **N57-2（过滤时点可见行跳回原文）**：无离屏断言（既有 `note-jump` 场景未在过滤态下复跑）。风险低：行点击与 `applyNotes` 未改动，过滤只影响 `groups`。
7. **N57-8 的字节判据在「清除 / 发送（notes.json）」两个相位缺失**：脚本在点徽标（notes+state）、切文档（notes）、发送（state）取了哈希；`清除` 相位两文件均未取，`发送` 相位未取 `notes.json`。风险低：`clearChapterFilter()` 只有一次内存写入（走查），无 IPC/无主进程调用。建议（非阻塞）在 52f 与 52-inject 相位各补一次前后哈希。
8. **两处已声明偏差**：①`countNotesByChapter` 对 ranges 两次线性遍历（`maxPage` 求上界 + 写键），与 N59-1 字面「恰好一次」不同，复杂度仍 O(n+m)（设计档 D6 已论证必要）；②`isCurrent` 从「读 `rangeEnds` + `page != null`」改为「读 `MapRow.range`」，为语义等价改写（三页 read/current 实测 0/1、1/3、3/3）。二者不影响用户可见行为。
9. **52f2 计数取 `本章 0 条 / 共 3 条`**（设计档内部自相矛盾处，B 已在 D3 声明）：我复核该值自洽——删掉范围内唯一条目后 `totalCount` 由 4 变 3，公式 `本章 {visible} 条 / 共 {total} 条` 直落。

### V.6 环境备注

- 默认输出根 `%TEMP%/pix-r5/shots` 残留一张更早失败 run 的 `99-failure-state.png`（该目录的 `MANIFEST.json` 已被 20:51 的成功 run 覆盖为 `failure=null`）；本次验收改用全新根目录，产物无失败帧。建议脚本启动时清理 `shots/`（非 R9 交付面）。
- 我的两次 run 均在本机 1600×1000 窗口、`dpr=1` 下完成；`map-scale` 耗时 88ms / 98ms（阈值 800ms），新断言两遍逐字段一致，无抖动。
