# PiX-Read R16 开发档 · A 面（派生与匹配纯函数 + 渲染层纯函数烟测）

> 上游：`docs/pm/R16-req.md`（需求 N91–N95 + §0 定稿修订 M1–M12 与 §0.0–§0.9 冻结契约）、`docs/pm/R16-design.md`（设计档 + 定稿修订 F1–F16）、`docs/pm/R16-review.md`、`docs/pm/R15-dev.md`（R15 交付终态与基线读数 153 张 / 223 条 / 59 种 label）。
> 本档**只记录 A 面**（派生与匹配纯函数 + 渲染层烟测）的交付。任务书给定的 A 面白名单 = 3 项：① 新增匹配 / 派生纯函数模块（`pix/src/renderer/utils/notes-path.ts` 与 `pix/src/renderer/utils/page-anchor.ts`）② `pix/scripts/smoke-view.mjs`（新增断言组）③ 本档（新建）。
> **A 面未触碰**：`PdfViewer.vue` / `stores/notes-store.ts` / `WorkspacePage.vue` / `NotesPanel.vue` / `PdfSearchPanel.vue` / `scripts/ui-shot.mjs`（B 面）；`pix/src/main/**`、`pix/src/shared/types.ts`、`pix/scripts/smoke-notes.mjs`、`pix/package.json`、`packages/**`、`package-lock.json`、`tsconfig*.json`、`vite.config.ts`、`assets/styles/**` 全部零 diff。
> 本档只记录**真实文件内容与真实命令输出**；所有命令于 2026-09-17 在 `E:/develop/PiX-Read`（Windows + git bash，`PATH="/c/Program Files/nodejs:$PATH"`）实跑，无一条手工构造。
> 全程未运行 git 写命令、未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`、未跑离屏 `ui-shot.mjs`（B 面验收面）、未增删依赖、未改 `package-lock.json`。
> **结论：`npm run check` exit 0（0 error）；`smoke:view` 连续两次「通过 51 / 失败 0」、退出码 0（既有 5 组 35 条零改动 + 新增 2 组 16 条）；`smoke:notes`「通过 65 / 失败 0」、退出码 0（整文件零 diff）；白名单外零改动、`%TEMP%` 零残留。**
> **偏差 / 未决项 4 条见 §A7**（其中 D1 为必改项：设计档 §5.1.1 的中文 needle 与冻结折叠规则矛盾、按现文必红，已按 F3 / F4 同法修正夹具并在 §A5 逐字登记；D3 为设计档走查计数口径的内部矛盾，需评审裁定）。

---

## A1. 交付摘要（数字先给）

| 项 | 数值 | 来源 |
| --- | --- | --- |
| `cd pix && npm run check`（A 面落地后） | `CHECK_EXIT=0`（0 error / 0 warning） | §A4.1 |
| `smoke:view` 第一次（落地后） | `通过 51 / 失败 0`、退出码 0 | §A4.2 |
| `smoke:view` 第二次（同命令复跑） | `通过 51 / 失败 0`、退出码 0（两次一致） | §A4.2 |
| `smoke:view` 组构成 | 既有 5 组 35 条（`8/8/8/5/6`）+ 新增 2 组 **16** 条（`notes-by-page` 6 + `excerpt-match` 10）= **7 组 51 条** | §A4.2 / §A5 |
| `smoke:notes` 回归（整文件零改动） | `通过 65 / 失败 0`、退出码 0（10 组） | §A4.3 |
| 编译面追加 | `files` +1 项（`page-anchor.ts`）、`required` +1 项（`renderer/utils/page-anchor.js`）；`allowed` 由 `required + "shared/types.js"` 派生自动覆盖 | §A3.3 |
| `%TEMP%` 残留 | `pix-smoke-view-*` 0 项（脚本 finally 自清理）；一次性探针 `r16a-atprobe.cjs` 运行后删除 | §A4.5 |
| 白名单外改动 | 0（`git status --short` 只出现本白名单 3 文件 + 既有未跟踪的 `docs/pm/R16-*.md`） | §A4.5 |

改动文件（`git diff --numstat` / `wc -l` 实测）：

| 文件 | 动作 | 规模 | 对应设计档条目 |
| --- | --- | --- | --- |
| `pix/src/renderer/utils/notes-path.ts` | 修改 | `+22 / −0`（纯新增：`PageNoteCount` + `countNotesByPage`） | §1.2.1 / §4 #1 / §7.1 A1 |
| `pix/src/renderer/utils/page-anchor.ts` | **新建** | 75 行（零 import / 零 DOM） | §1.4.3 / §4 #2 / §7.1 A2 |
| `pix/scripts/smoke-view.mjs` | 修改 | `+264 / −1`（唯一的 `−` 行 = `required` 数组行按 §2.2 #7 追加 1 项；既有 35 条断言零改动） | §5.1 / §2.2 #6–#8 / §7.1 A3 |
| `docs/pm/R16-dev.md` | **新建** | 本档（A 面部分） | —— |

---

## A2. 基线（动工前后读数，逐条标注是否本步实跑）

| 项 | 读数 | 是否本步实跑 |
| --- | --- | --- |
| 工作树与 HEAD | `git log --oneline -1` ⇒ `dbc2a58 docs: V0.6 迭代路线与 PRD（R16-R20）`；`git status --short` ⇒ 只有 `?? docs/pm/R16-{design,req,review}.md`（前三步的文档，本步未触碰） | **是**（只读命令） |
| 唯一工程门（动工前） | 设计档 §0.1 记录 `npm run check` 0 error（写档当天） | 否（本步**未**在改动前复跑 check；见 §A7 U2） |
| `smoke:view`（动工前） | 设计档 / 需求档共同冻结为「5 组 35 条：`8/8/8/5/6`」 | 否（同上；落地后实测 51 = 35 + 16，与冻结口径自洽） |
| `smoke:notes`（动工前 / 后） | `通过 65 / 失败 0`（10 组） | 落地后**是** |
| 命名预检（本步改动前） | `grep -rn "countNotesByPage\|page-anchor\|foldText" pix/src \| wc -l` ⇒ **0**；`pix/src/renderer/utils/page-anchor.ts` 不存在 | **是** |
| `for (` 基线 | `grep -c "for (" pix/src/renderer/utils/notes-path.ts` ⇒ **3**（`:75` / `:94` / `:118`） | **是** |

```bash
cd E:/develop/PiX-Read && git status --short && git log --oneline -1
cd pix && grep -c "for (" src/renderer/utils/notes-path.ts && grep -rn "countNotesByPage\|page-anchor\|foldText" src | wc -l
```

```text
 M pix/scripts/smoke-view.mjs          ← 本步改动后
 M pix/src/renderer/utils/notes-path.ts
?? docs/pm/R16-design.md
?? docs/pm/R16-req.md
?? docs/pm/R16-review.md
?? pix/src/renderer/utils/page-anchor.ts
dbc2a58 docs: V0.6 迭代路线与 PRD（R16-R20）
3
0
```

---

## A3. 改动清单（文件 + 具体改动 + 与设计档的对应）

### A3.1 `pix/src/renderer/utils/notes-path.ts`（+22 / −0，A1）

落点：紧接 `countNotesByDocument`（`:73-84`）之后、`groupNotesByDocument` 之前（与 R14 的计数函数同块，§1.2.1 的「落点」行）。逐字按 §1.2.1 的签名与参考实现：

```ts
export interface PageNoteCount {
  total: number;
  excerpt: number;
  answer: number;
}

/** 按页聚合的笔记计数（R16 页标记唯一派生）：单次遍历、键 = 页号、非法页号跳过、只产出 total > 0 的页、每次返回新 Map。 */
export function countNotesByPage(notes: ReaderNote[], docKey: string | null): Map<number, PageNoteCount> {
  const counts = new Map<number, PageNoteCount>();
  if (docKey === null) return counts;
  for (const note of notes) {
    if (docPathKey(note.docPath) !== docKey) continue;
    if (!Number.isInteger(note.page) || note.page < 1) continue;
    const current = counts.get(note.page) ?? { total: 0, excerpt: 0, answer: 0 };
    current.total += 1;
    if (note.kind === "answer") current.answer += 1;
    else current.excerpt += 1;
    counts.set(note.page, current);
  }
  return counts;
}
```

冻结项逐条闭合：单次遍历（函数体内恰 1 个 `for (`）、比较键复用 `docPathKey`（不写第二份归属比较）、`docKey === null` ⇒ 空 Map 不抛错、页号守卫 `Number.isInteger(note.page) && note.page >= 1`（不钳制、不改写入参）、只产出 `total > 0`、每次新 Map + 新元素对象、既有 9 个导出零 diff。

### A3.2 `pix/src/renderer/utils/page-anchor.ts`（新建，75 行，A2）

只放 §1.4.3 冻结的类型与纯函数：`FoldedText` / `AnchorRange` / `AnchorExcerpt` / `MAX_ANCHOR_TEXT_LENGTH = 400` / 局部 `isSpace()` / `foldText()` / `matchExcerpts()`；Range 重建（`AnchorSegment` / `anchorRangeFor`）按 req §0.7 不在此文件（归调用方 `PdfViewer.vue`，§1.4.4）。

实现逐字取自 §1.4.3 的参考实现（语义冻结）：折叠 = `parts.join("\n")` 的假分隔符 → `\s+` 折叠为**恰一个空格**（起点侧 `text.length > 0` 守卫等价 trim）→ 末尾一次统一小写；回溯表 `at[i]` 对由空白折叠出的字符记 `-1`；匹配 = 每条摘录一次 `indexOf` 取首个命中、超长 / 空跳过、与已接受区间重叠即整体丢弃、返回顺序 = 被接受输入的子序。

冻结判据实测（§A4.4）：`for (` = **2**（折叠 1 + 匹配 1，无嵌套循环）、`toLowerCase` = **1**、`indexOf` = **1**、`^(import|export … from)` = **0**（零依赖，不 import `@shared/types` / 不 import 渲染层模块）、`any` = **0**。

给 B 侧的签名冻结（B 只允许按此 import 与调用）：`foldText(parts: string[]): FoldedText`、`matchExcerpts(page: FoldedText, excerpts: AnchorExcerpt[]): AnchorRange[]`；**调用方约束**：区间端点映射用 `page.at[range.start]` / `page.at[range.end - 1] + 1` —— 两端必为真实字符（`at` 不为 `-1`；折叠后的 needle 首尾不可能是空白），区间**内部**的空白字符可能为 `-1`，不得用于索引换算（§1.4.4 ⑤ 与 §A7 D2）。

### A3.3 `pix/scripts/smoke-view.mjs`（+264 / −1，A3）

新增（全部为追加，既有 5 组 35 条与输出 / 自清理协议零改动）：

| # | 增量 | 对应条目 |
| --- | --- | --- |
| 1 | 夹具常量 `PIN_SEED` / `PIN_CASE` / `PIN_BAD_PAGE` / `ANCHOR_PARTS` / `ANCHOR_NEEDLE` / `ANCHOR_NEEDLE_FOLDED` / `ANCHOR_MISS` / `ANCHOR_CN_PAGE` / `ANCHOR_CN_NEEDLE` / `LONG_400` / `LONG_401` | §5.1.1 |
| 2 | `runNotesByPage()`（6 条，组 `notes-by-page`） | §5.1.2 |
| 3 | `runExcerptMatch()`（10 条，组 `excerpt-match`） | §5.1.3 |
| 4 | 模块句柄 `let pageAnchor = null;` + `pageAnchor = require(join(OUT_DIR, "renderer", "utils", "page-anchor.js"));` | §4 #7 |
| 5 | `files` 追加 `join(REPO_DIR, "pix", "src", "renderer", "utils", "page-anchor.ts")` | §2.2 #6 |
| 6 | `required` 追加 `"renderer/utils/page-anchor.js"`（该行为本次唯一的 `−` 行） | §2.2 #7 |
| 7 | `main()` 追加 `runNotesByPage();` 与 `runExcerptMatch();`（顺序固定为 §5.1 的 7 组序） | §2.2 #8 |

期望值一律**手写**（不由被测函数生成）：`notes-by-page` 逐字段比对走局部 `sameCount()`（失败信息含实际值）；`excerpt-match` 的期望串（`ANCHOR_NEEDLE_FOLDED = "we study retrieval … constraint."`、`"alpha beta"`、`[10,102)` / `[0,400)` / `[4,15)` 等）均为按冻结折叠规则预先手算的字面值。

---

## A4. 验证（实跑记录）

### A4.1 唯一工程门

```bash
cd E:/develop/PiX-Read/pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
```

```text
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0
```

`grep -cE "error TS|error:"` 对完整日志 ⇒ **0**（无 `any`、无内联动态 import；`page-anchor.ts` 与 `countNotesByPage` 全链路必填）。

### A4.2 `smoke:view`（7 组 51 条，连续两次）

```bash
cd E:/develop/PiX-Read/pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:view | tail -2; echo "SMOKE_EXIT=${PIPESTATUS[0]}"
```

```text
（第一次）
== 组 notes-by-page ==   … 6 条全 [通过]
== 组 excerpt-match ==   … 10 条全 [通过]
通过 51 / 失败 0
SMOKE_EXIT=0
（第二次，同命令复跑）
通过 51 / 失败 0
SMOKE2_EXIT=0
```

组构成（脚本内 `check()` 计数实测）：`section-hit` **8** / `section-null` **8** / `section-nav` **8** / `section-format` **5** / `badge-counts` **6** / `notes-by-page` **6** / `excerpt-match` **10** = **51**；既有 5 组 35 条逐字保留。

### A4.3 `smoke:notes`（回归，整文件零 diff）

```bash
cd E:/develop/PiX-Read/pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes | tail -2; echo "NOTES_EXIT=${PIPESTATUS[0]}"
```

```text
[通过] reader-state-store #5 F12-d read-failed ⇒ load degraded:true + save 拒写（code=read-failed，回归）
通过 65 / 失败 0
NOTES_EXIT=0
```

`git diff --stat -- pix/scripts/smoke-notes.mjs pix/src/main pix/src/shared/types.ts pix/package.json` ⇒ **空**（零 diff）。

### A4.4 走查读数（命令级，真实输出）

| # | 命令 | 实测值 | 设计档期望 |
| --- | --- | --- | --- |
| 1 | `grep -c "for (" src/renderer/utils/notes-path.ts` | **4** | 4（既有 3 + 新增 1）✅ |
| 2 | `sed -n '/countNotesByPage/,/^}/p' src/renderer/utils/notes-path.ts \| grep -c "for ("` | **1** | 1 ✅ |
| 3 | `grep -c "for (" src/renderer/utils/page-anchor.ts` | **2** | ≤ 2 ✅ |
| 4 | `grep -c "toLowerCase" src/renderer/utils/page-anchor.ts` | **1** | 1 ✅ |
| 5 | `grep -c "indexOf" src/renderer/utils/page-anchor.ts` | **1** | 1 ✅ |
| 6 | `grep -cE "^(import\|export .* from)" src/renderer/utils/page-anchor.ts` | **0** | 零 import ✅ |
| 7 | `grep -rn "MAX_ANCHOR_TEXT_LENGTH" src \| wc -l` | **2** | 2（定义 1 + 使用 1）✅ |
| 8 | `grep -rn "countNotesByPage" src \| wc -l` | **1**（A 面：`notes-path.ts` 定义 1） | 合并后应为 3（B 落 `PdfViewer.vue` 的 import 1 + `computed` 调用 1）——见 §A7 U1 |
| 9 | `grep -rn "matchExcerpts\|foldText" src \| wc -l` | **3**（`page-anchor.ts`：2 个 `export function` 声明 + `matchExcerpts` 内部对 `foldText` 的 1 次调用） | 设计档写 4 —— 与冻结参考实现不符，见 §A7 D3 |
| 10 | `git diff --numstat -- pix/scripts/smoke-view.mjs` | `264 / 1`，且 `git diff \| grep "^[-]"` 只有 `required` 一行 | §2.2 #6–#8 ✅ |

### A4.5 零残留与白名单

```text
git status --short ⇒
 M pix/scripts/smoke-view.mjs
 M pix/src/renderer/utils/notes-path.ts
?? docs/pm/R16-design.md      ← 前序步骤的文档（本步未触碰）
?? docs/pm/R16-req.md
?? docs/pm/R16-review.md
?? pix/src/renderer/utils/page-anchor.ts
?? docs/pm/R16-dev.md          ← 本档
```

`ls -d %TEMP%/pix-smoke-view-*` ⇒ 0 项（脚本 `finally` 自清理生效）；一次性探针 `%TEMP%/r16a-atprobe.cjs` 运行后已删除（`ls` 报不存在）。

---

## A5. 新增断言组明细（16 条，逐条列断言内容 + 覆盖的设计档用例）

### A5.1 组 `notes-by-page`（6 条）

| # | 断言（实测全绿） | 覆盖的设计档用例 |
| --- | --- | --- |
| 1 | `countNotesByPage(PIN_SEED, "sample-paper.pdf")` ⇒ `size === 2`；`get(1) = {1,1,0}`；`get(2) = {2,1,1}`；`get(3) === undefined`（逐字段） | §5.1.2 #1（N91-2 判据 1） |
| 2 | `docKey === null` ⇒ `size === 0`（不抛错） | §5.1.2 #2（N94 边界：资料库外文件） |
| 3 | 非法页号四条（`0` / `-2` / `1.5` / `NaN`）⇒ `size === 0`（不产生任何键） | §5.1.2 #3（N91-2 判据 2） |
| 4 | 比较键归一：`Sample-Paper.PDF` / `sample-paper.pdf\` / `sample-paper.pdf` 同页合并 ⇒ `size === 1`、`get(2) = {3,2,1}`；`PIN_SEED` 中 `archive/older-paper.pdf` 的 p7 在 `docKey = "sample-paper.pdf"` 下 `get(7) === undefined` | §5.1.2 #4（N91-2 判据 3） |
| 5 | 恒等式：`get(2).total === excerpt + answer === 2`（逐值） | §5.1.2 #5（N91-2 判据 4） |
| 6 | 纯性 + 新对象：入参 `JSON.stringify(PIN_SEED)` 前后逐字不变；`first !== second`；改 `first.get(2).total = 99` 不影响 `second.get(2).total === 2` | §5.1.2 #6（N91-2 判据 6） |

### A5.2 组 `excerpt-match`（10 条）

| # | 断言（实测全绿） | 覆盖的设计档用例 |
| --- | --- | --- |
| 1 | 跨片段命中（英文行尾断行）：`foldText([ANCHOR_NEEDLE]).text === ANCHOR_NEEDLE_FOLDED`；恰 1 条区间 `key === "k1"`、`[10,102)`；`page.text.slice(start,end)` 逐字等于手写折叠串；`page.text.indexOf(ANCHOR_NEEDLE_FOLDED) === start` | §5.1.3 #1（N93-1 判据 1） |
| 2 | 中文 + 大小写：`foldText(ANCHOR_CN_PAGE).text === ANCHOR_CN_NEEDLE`（片段边界折叠为恰一个空格）且命中 `start === 0`；`foldText(["HTML basics"])` + `"html"` ⇒ `[0,4)`；`foldText(["html basics"])` + `"HTML"` ⇒ `[0,4)`（大小写折叠对称） | §5.1.3 #2（N93-1 判据 2） |
| 3 | 空白差异等价：`foldText(["a\tb","c   d"])` / `foldText(["a\nb\nc d"])` / `foldText(["a b c d"])` 三者折叠文本逐字相等且等于手写 `"a b c d"`（恰一个空格、不丢字符）；含空白摘录 `"a  b"` 对页面 `["a","b"]` ⇒ `[0,3)` | §5.1.3 #3（N93-1 判据 3） |
| 4 | 跨行与 `trim` + 回溯表：`foldText(["alpha","beta"]).text === "alpha beta"`（长度 10）；`foldText(ANCHOR_PARTS)` 的 `at.length === text.length === 119`、非 `-1` 下标**严格递增**、片段边界记 `-1`（`at[10] === 10` / `at[58] === -1` / `at[101] === 101`，独立复算见 §A7 D2）；摘录首尾带空白（`" \n " + needle + "  "`）仍命中 `[10,102)` | §5.1.3 #4（N93-1 判据 4 + req §0.7 端点映射） |
| 5 | 不可匹配：页面 `["short page"]` + 超长摘录 `ANCHOR_MISS` ⇒ `[]`（不抛错、不返回近似区间） | §5.1.3 #5（N94-6 判据 1） |
| 6 | 重复文本：页面同一子串出现两次（`indexOf = 0` / `lastIndexOf = 11`）⇒ 恰 1 条区间且 `start === 0`（`[0,10)`），`start === page.text.indexOf(needle)` | §5.1.3 #6（N93-1 判据 6） |
| 7 | 多段重叠：`A ⊂ B` —— `[B, A]` ⇒ 只留 `B[0,19)`；`[A, B]` ⇒ 只留 `A[4,15)`（先到者获胜、后来者整体丢弃不截断） | §5.1.3 #7（N93-1 判据 7） |
| 8 | 超长边界：折叠后 401 字符的摘录（即使页面含该子串）⇒ `[]`；恰 400 字符 ⇒ 参与匹配 `[0,400)`（含等于） | §5.1.3 #8（N93-1 判据 8） |
| 9 | 空 / 全空白摘录 ⇒ `[]`；三条摘录（`alpha` / `zeta` / `gamma`）第 2 条不可匹配 ⇒ 返回顺序 = 被接受输入的子序（`k1[0,5)` / `k3[11,16)`） | §5.1.3 #9（N93-1 判据 9） |
| 10 | 纯性 + 新对象：`page` 与摘录数组 `JSON.stringify` 逐字不变；两次调用 `JSON.stringify` 相等但 `runA !== runB`；`foldText([])` ⇒ `{ text: "", at: [] }`；`foldText(["   "])` ⇒ 空（全空白同理） | §5.1.3 #10（N93-1 判据 10） |

---

## A6. 与设计档分工表的逐项闭合（§7.1 A1–A4）

| 序 | 交付物 | 完成判据（设计档） | 本档实测 |
| --- | --- | --- | --- |
| A1 | `notes-path.ts` 的 `PageNoteCount` + `countNotesByPage` | 既有导出零 diff；`for (` 3 → 4；函数体内 `for (` = 1 | ✅（§A4.4 #1 / #2；`git diff` 纯新增） |
| A2 | `page-anchor.ts`（新建） | 零 import / 零 DOM；`for (` ≤ 2、`toLowerCase` = 1、`indexOf` = 1；无 `any`；`npm run check` 0 error | ✅（§A4.4 #3–#6；§A4.1） |
| A3 | `smoke-view.mjs` | `通过 51 / 失败 0`；连续两次一致；既有 5 组 35 条零改动；`%TEMP%` 被删除 | ✅（§A4.2 / §A4.5） |
| A4 | 回归 `smoke:notes` | `通过 65 / 失败 0`（零改动） | ✅（§A4.3） |
| — | `npm run check` | 0 error | ✅（§A4.1） |

---

## A7. 偏差登记与未决项

| # | 类型 | 内容 |
| --- | --- | --- |
| **D1** | **夹具修正（必改项，已落地）** | 设计档 §5.1.1 的 `ANCHOR_CN_NEEDLE = "稀疏注意力在三分之一的预算下保持召回，位置先验是关键。"`（无空格）与冻结折叠规则**矛盾**：`ANCHOR_CN_PAGE` 是两片段，片段边界（`"\n"` 假分隔符）按 §1.4.3 折叠为**恰一个空格** ⇒ 折叠页面文本为 `"…保持召回， 位置先验是关键。"`（「，」后有空格），无空格 needle 的 `indexOf` 恒为 `-1` ⇒ 按现文 §5.1.3 #2 必红（与评审 F3 / F4 同类）。本步按 F3 / F4 同法修正**夹具期望值**为 `"稀疏注意力在三分之一的预算下保持召回， 位置先验是关键。"`（保留两片段与全部折叠语义不变），§A5 #2 已登记。独立复算证据（一次性探针，真实编译 `page-anchor.ts`）：`foldText(ANCHOR_CN_PAGE).text === "稀疏注意力在三分之一的预算下保持召回， 位置先验是关键。"`；原无空格串的 `matchExcerpts` 命中数 **0**。 |
| **D2** | 语义澄清（非缺陷，B 侧调用方须知） | `at[i]` 对**所有由空白折叠出的字符**记 `-1`（不止假分隔符）：`foldText(ANCHOR_PARTS)` 的折叠串 119 字符中 **17** 个为 `-1`（`at.filter(v => v === -1).length === 17`，独立复算）。这不影响 §1.4.4 ⑤ 的端点映射：折叠后的区间端点必为非空白 ⇒ `at[start]` / `at[end - 1]` 必为真实下标（实测 `at[10] = 10`、`at[58] = -1`、`at[101] = 101`，区间 `[10,102)` 与 119 长度的手算一致）。已把端点与边界值钉进烟测 `excerpt-match #4`，B 侧不得用 `at[i]`（`i` 为区间内部空白）做索引换算。 |
| **D3** | **设计档走查计数口径的内部矛盾（需评审裁定，行为不受影响）** | 设计档 §5.4 #14 与 req N93-1 #11 写 `grep -rn "matchExcerpts\|foldText" pix/src \| wc -l` = **4**，拆解为「`page-anchor.ts` 定义 2 + `PdfViewer.vue` import 1 + 调用 1」。但 §1.4.3 的**冻结参考实现**在 `matchExcerpts` 内部对 `foldText` 有 1 次调用（`const needle = foldText([excerpt.text]).text;`，是「两侧同一份折叠」的唯一手段，不得移除、也不得复制第二份折叠实现）⇒ `page-anchor.ts` 恒有 **3** 行命中。合并 B 面后全仓实测值将是 **5 或 6**（取决于 B 的调用行排布），不可能是 4。本步未擅自改写判据口径，仅在此登记，建议评审把该行改为「`page-anchor.ts` 3 行 + `PdfViewer.vue` 的 import / 调用行」或直接按实现放宽（行为面无差异，`foldText` / `matchExcerpts` 仍是唯一实现点）。 |
| **U1** | 待 B 面落地后复跑 | §A4.4 #8（`countNotesByPage` 全仓 = 3）与 §A4.4 #9（合并后计数）、设计档 §5.4 #5（`PdfViewer.vue` 内唯一调用点在 `computed` 回调、模板 0 处调用）——均需 B 落 `PdfViewer.vue` 后按同法复跑。 |
| **U2** | 未跑项（本步不允许 / 非 A 面） | 动工前的 `npm run check` / `smoke:view` 基线未复跑（本步在改动前只跑了只读的 `git` / `grep` 预检），基线读数引用设计档 §0.1 的写档读数；离屏 `ui-shot.mjs`、R15 零缺失比对、13 张新截图目视均属 B 面，本档不声明。 |

---

## A8. 纪律与零残留声明

- 只改动本白名单内的文件（`notes-path.ts` / `page-anchor.ts` / `smoke-view.mjs` + 本档）；未运行任何 git 写命令（提交由负责人完成）；`git add` 一律未执行。
- 未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未跑离屏 `ui-shot.mjs`；未引入或升级依赖；未改 `package-lock.json`、`pix/package.json`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`assets/styles/**`、`packages/**`。
- 既有 5 组 35 条烟测断言、`WINDOW_SHIM`、编译选项、产物逐项校验、输出协议与自清理协议零改动（`git diff -- pix/scripts/smoke-view.mjs | grep "^[-]"` 只有 `required` 一行，按设计档 §2.2 #7 允许）；`smoke-notes.mjs` 整文件零 diff。
- 一次性脚本写 `%TEMP%` 并在运行后删除；`smoke-view.mjs` 运行后 `%TEMP%` 自建目录被删除（实测 0 项残留）。
- 本档只记真实文件内容与真实命令输出；未验证项在 §A2 / §A7 逐条标注「未跑」。

---

# PiX-Read R16 开发档 · B 面（UI 与离屏）

> 上游：`docs/pm/R16-req.md`（N91–N95 + §0 定稿修订 M1–M12）、`docs/pm/R16-design.md`（设计档 + 定稿修订 F1–F16）、`docs/pm/R16-review.md`、本档 A 面（`notes-path.ts` / `page-anchor.ts` / `smoke-view.mjs` 已冻结并全绿）。
> 任务书给定的 B 面白名单 = 5 项：① `pix/src/renderer/components/workspace/PdfViewer.vue` ② `pix/src/renderer/components/workspace/NotesPanel.vue` 与 `pix/src/renderer/stores/notes-store.ts` ③ 组件内样式（设计档只允许落在 `PdfViewer.vue` / `NotesPanel.vue` 的 scoped 块与非 scoped 块；`assets/styles/**` 零 diff）④ `pix/scripts/ui-shot.mjs`（r16-* 场景）⑤ 本档（追加）。
> **B 面另需 1 个设计档 §7.2 B2 显式分工项**：`pix/src/renderer/pages/WorkspacePage.vue` 的 `pageFocusToken` watcher（设计档 §7.2 分工表把 B2 记在 B 面；任务书的「预期白名单」清单未列出该文件，按「以 §7 分工表为准」执行）。
> 本档只记录**真实文件内容与真实命令输出**；所有命令于 2026-09-17 在 `E:/develop/PiX-Read`（Windows + git bash，`PATH="/c/Program Files/nodejs:$PATH"`）实跑。
> 全程未运行 git 写命令、未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`、未增删依赖、未改 `package-lock.json`；两个取证进程（离屏）串行执行，零并发。
> **结论：`npm run check` exit 0（0 error）；`smoke:view` 通过 51 / 失败 0；`smoke:notes` 通过 65 / 失败 0；离屏验收 `PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v06-r16-after` 退出码 0 / `failure === null` / 166 张截图（153 张既有零缺失 + 13 张新增）/ 237 条测量（223 既有 + 14 新增）/ 64 种 label（59 既有零缺失 + 5 新增，条数 3/3/3/2/3）/ 磁盘与清单双向相等；13 张新截图逐张目视登记见 §B6。**

## B1. 交付摘要（数字先给）

| 项 | 数值 | 来源 |
| --- | --- | --- |
| `cd pix && npm run check`（B 面 + A 面落地后） | `CHECK_EXIT=0`（0 error / 0 warning；`grep -cE "error TS|error:"` = 0） | §B4.1 |
| `smoke:view`（7 组 51 条） | `通过 51 / 失败 0`、退出码 0 | §B4.2 |
| `smoke:notes`（10 组 65 条，零改动回归） | `通过 65 / 失败 0`、退出码 0 | §B4.3 |
| 离屏验收（`pix-v06-r16-after`） | 退出码 **0**；`MANIFEST.json.failure === null`；`shots.length` **166**；`MEASUREMENTS.json` 长度 **237**、label 去重 **64** | §B4.4 |
| 零缺失比对（基线 `pix-v05-r15-final`） | 既有 153 张截图缺失 **0**；既有 59 种 label 缺失 **0**；目录 png **166** == 清单 166（双向相等） | §B4.4 |
| 新增配额 | 截图 **13** 张（153→166）、record **14** 条（223→237）、label **5** 种（59→64） | §B4.4 |
| 新增 5 种 label 条数 | `r16-page-badge:3` / `r16-page-anchor:3` / `r16-note-highlight:3` / `r16-highlight-coexist:2` / `r16-degrade:3` = **14** | §B4.4 |
| `SEL` 增量 | **4** 项（60 → **64**）：`pageNotes` / `noteRowAnchored` / `pageBoxOne` / `notePageBadge`；`pdfPageOne` 逐字不动 | §B3.5 |
| stub 面 | **零改动**（`api` 恒 42 方法、无新控制口、无失败注入口） | §B4.5 |
| 白名单外改动 | **0**（`git status --short` 只出现 §B3 的 5 个 B 面文件 + A 面 3 文件 + `docs/pm/R16-*.md`） | §B4.6 |
| `%TEMP%` 残留 | `pix-smoke-view-*` 0 项（脚本自清理） | §B4.6 |

改动文件（`git diff --numstat` 实测）：

| 文件 | 动作 | 规模 | 对应设计档条目 |
| --- | --- | --- | --- |
| `pix/src/renderer/stores/notes-store.ts` | 修改 | `+22 / −0`（纯新增：两个 ref + `focusPageNotes` + 复位两行 + `return` 两项） | §1.3.2 / §1.3.3 / §4 #4 / §7.2 B1 |
| `pix/src/renderer/pages/WorkspacePage.vue` | 修改 | `+11 / −0`（纯新增：`pageFocusToken` watcher） | §1.3.4 / §4 #5 / §7.2 B2 |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | `+133 / −2`（两处既有行改写：模板根加 `ref="panelEl"`、`.note-row` 的 `:class` 绑定扩写；其余纯新增） | §1.3.5–§1.3.7 / §4 #6 / §7.2 B3 |
| `pix/src/renderer/components/workspace/PdfViewer.vue` | 修改 | `+237 / −0`（import / 常量 / 计数消费 / 标记模板与样式 / 锚点绘画 / 五个调用点 / 第三条 `::highlight()`） | §1.1 / §1.2.2 / §1.4 / §4 #3 / §7.2 B4 |
| `pix/scripts/ui-shot.mjs` | 修改 | `+985 / −0`（`SEL` 4 项 + 10 个 helper + `seedR16Focus()` + 5 场景；既有场景 / label / 截图名 / helper 零删除零改写） | §5.3 / §4 #8 / §7.2 B5 |
| `docs/pm/R16-dev.md` | 追加 | 本档（B 面部分） | —— |

## B2. 基线（动工前后读数，逐条标注是否本步实跑）

| 项 | 读数 | 是否本步实跑 |
| --- | --- | --- |
| 工作树与 HEAD | `git log --oneline -1` ⇒ `dbc2a58 docs: V0.6 迭代路线与 PRD（R16-R20）`；动工时 `git status --short` ⇒ A 面 3 文件（`M smoke-view.mjs` / `M notes-path.ts` / `?? page-anchor.ts`）+ 4 份 `docs/pm/R16-*.md` | **是**（只读命令） |
| 离屏基线（R15 交付终态） | `C:/Users/86157/AppData/Local/Temp/pix-v05-r15-final/shots`：`MANIFEST.shots.length = 153`、`failure = null`；`MEASUREMENTS.json` 长度 **223**、label 去重 **59**；目录 png **153**（与清单一致） | **是**（本步真实读取） |
| `npm run check`（B 面动工前） | 未在动工前复跑（A 面档 §A4.1 已记 0 error）；本步在 B4 落地后实测 | 落地后**是** |
| 离屏 dev 运行 | `PIX_SHOT_ROOT=<临时目录>/pix-r16-dev`：退出码 0、166 张、`failure = null`（用于迭代与目视；最终验收面见 §B4.4 的 `pix-v06-r16-after`） | **是** |
| 关键既有读数（本次逐字复读） | `PdfViewer.vue` 非 scoped 块 `grep -cE "^::highlight\("` 基线 **2**（改后 3）；`grep -rn "pix-search" src` = **4**（改后仍 4）；`NotesPanel.vue` 的 `grep -c "notes-notice"` = **4**（改后仍 4）；`SEL` 项数 **60**（改后 64） | **是** |

## B3. 改动清单（文件 + 具体改动 + 与设计档的对应）

### B3.1 `pix/src/renderer/stores/notes-store.ts`（+22 / −0，§1.3.2 / §1.3.3）

- `chapterFocusToken` 之后新增 `pageFocusPage = ref<number | null>(null)` 与 `pageFocusToken = ref(0)`（各一行注释，注释内不出现 `pageFocusToken` 标识符）。
- `resetNotes()` 的 `chapterFocusToken.value = 0;` 之后新增两行复位（`pageFocusPage.value = null;` / `pageFocusToken.value = 0;`）。
- `clearChapterFilter()` 之后新增 `focusPageNotes(page)`：守卫 `currentDocKey === null ⇒ return`（no-op，零副作用）→ `chapterFilter.value = null`（唯一被改动的视图状态，单向清除）→ 写载荷 → 令牌 `+= 1`。
- `return { … }` 在 `chapterFocusToken,` 之后新增 `pageFocusPage,` / `pageFocusToken,`，并在 `clearChapterFilter,` 之后新增 `focusPageNotes,`。
- 既有动作 / 指纹逻辑 / 竞态令牌语义零 diff（`git diff` 纯新增）。

### B3.2 `pix/src/renderer/pages/WorkspacePage.vue`（+11 / −0，§1.3.4）

- `chapterFocusToken` watcher 之后新增逐字同构的 watcher：`() => notesStore.pageFocusToken`，守卫 `if (token <= 0 || token <= previous) return;`，回调体 `leftCollapsed.value = false;` + `selectLeftTab("notes");`（不读任何过滤状态；打开面板的读盘来自既有 `selectLeftTab`）。
- 既有 `selectLeftTab` / `onOpenNote` / `onOpenNoteDoc` / `openDocumentFromLibrary` / 既有 watcher 零 diff（`grep -c "token <= 0 || token <= previous"` 由 1 → **2**）。

### B3.3 `pix/src/renderer/components/workspace/NotesPanel.vue`（+133 / −2，§1.3.5–§1.3.7）

- 常量：`ANCHOR_MISS_MESSAGE = "本页笔记不在当前筛选结果中"` / `LOCATE_WAIT_MS = 3000` / `ANCHOR_HIGHLIGHT_MS = 2000`（紧邻既有 `NOTICE_MS` / `DELETE_CONFIRM_MS`）。
- 新增 `panelEl`（模板 ref，挂 `.notes-panel` 根）与 `anchoredNoteId`（瞬时高亮的目标行 id，与行数据同源）；新增 `anchorTimer` / `locateWaitId` 两个句柄。
- `targetRow()`：**判定只看 DOM 顺序** —— `.notes-list` 内当前文档组（含 `.notes-group-head .v-chip`）中 `.note-page-badge` 文本逐字 `第 {N} 页` 的第一行；下标同序取回 `note.id`（仅用于模板类绑定）。
- `applyAnchor()`（先撤上一行与定时器 → `scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" })` → 挂类 → 2s 后移除）/ `clearAnchorHighlight()` / `degradeAnchor()`（复用 `setNotice("error", …)`，不新增提示容器）/ `cancelLocateWait()`。
- `locatePageNote(token)`：按帧轮询；令牌不符即丢弃；`status === 'error'` 立即退化；`status === 'ready'` 后连续 2 帧仍无目标行立即退化；`LOCATE_WAIT_MS` 到期退化；成功路径才写 DOM。
- watcher：`() => notesStore.pageFocusToken`（守卫与 WorkspacePage 同构；新一次定位先撤旧等待）。
- 模板：`.notes-panel` 根加 `ref="panelEl"`；`.note-row` 的 `:class` 扩写为三键对象（`confirming` / `selected` / `'is-anchored'`）。
- 样式：`.note-row.confirming` 之后新增 `.note-row.is-anchored { border-color: var(--pix-accent, #31424f); background: var(--pix-bg-hover, #eef2f6); }`（只有两条声明，不改几何、不加 transition）。
- `onBeforeUnmount`：新增 `cancelLocateWait()` 与 `anchorTimer` 清理（既有四个定时器清理逐字不动）。
- 既有 `.notes-*` 文案与 DOM 顺序零 diff；`grep -c "notes-notice"` 增量 **0**。

### B3.4 `pix/src/renderer/components/workspace/PdfViewer.vue`（+237 / −0，§1.1 / §1.2.2 / §1.4）

- import：`useNotesStore`；`countNotesByPage` / `docPathKey` / `sortNotesForContext` + `PageNoteCount`；`foldText` / `matchExcerpts` + `AnchorExcerpt` / `AnchorRange` / `FoldedText`（全部**顶层** import）。
- 常量与类型：`HIGHLIGHT_NOTE_ANCHOR = "pix-note-anchor"`、`ANCHOR_LAYER_WAIT_MS = 2000`、本地别名 `HighlightRegistryWriter`（与 `PdfSearchPanel.vue:18-22` 同名同形，刻意重复）、`interface AnchorSegment`。
- 计数消费：`pageNotes = computed(() => countNotesByPage(notesStore.notes, notesStore.currentDocKey))`（唯一调用点）+ `pageNotesForRender`（`pageSizes × pageNotes` 一次 `map`，每页恰 1 次 `Map.get`；模板零 `Map` 读取，四处一律 `?.`）。
- 模板：`.pdf-page` 的第 4 个子元素 `<button type="button" class="page-notes" :title="…">本页 {{ …?.total }} 条</button>`（`v-if="pageNotesForRender[index]"`，逐字按 §1.1.2）；`onPageNotesClick(pageNumber)` 只调 `notesStore.focusPageNotes(pageNumber)`（不跳页、不改缩放、不清选区、不发 IPC、不写盘）。
- 样式：`.page-notes` / `.page-notes:hover` 两条，插在 `.pdf-page :deep(.textLayer ::selection)` 之后、`.pdf-overlay` 之前（`scoped` 块内，标记是组件自身节点故不用 `:deep()`）。
- 锚点绘画：`anchorTextCache`（只缓存折叠结果）/ `anchorToken` / `anchorWaitId` / `anchorRegistry()` / `clearNoteAnchor()`（**唯一**删除点）/ `anchorExcerpts()`（当前文档 × 该页摘录，`sortNotesForContext` 序）/ `anchorSegments()`（每次重画重取，不缓存节点引用）/ `locate()` / `anchorRangeFor()`（`page.at` 端点回溯 + `document.createRange()`）/ `anchorFoldedText()` / `waitForAnchorLayer()`（按帧轮询，2s 上限，等待期零 DOM 写入）/ `scheduleNoteAnchor()` / `paintNoteAnchor()`（首行先删后画；无摘录 / 不可匹配 / 超时 / 区间全丢 ⇒ 注册表保持不存在）。
- 清空四个调用点 + 一个触发调用点（各恰 1 处新增，既有语句零改写）：`releasePage` 末尾、`loadPdf` 起始段（并 `anchorTextCache.clear()`）、scale watcher（`releasePage` 循环之后）、`onBeforeUnmount`（并 `cancelAnimationFrame`）、`renderPage` 末尾（`anchorTextCache.delete(pageNumber)` + `scheduleNoteAnchor()`，用于流式片段的完整性收敛 —— 见 §B8 D2）。
- 新增两个 watcher：`() => readerStore.page` 与 `() => notesStore.notes` ⇒ `scheduleNoteAnchor()`。
- 非 scoped 块新增第三条 `::highlight(pix-note-anchor)`（含 `color: transparent` + 浅底纹 + 2px 下划线）；既有两条逐字不动。
- 既有 `pageElement` / `observePages` / `updateCurrentPage` / `clearPageLayers` / `captureRegion` / `toLayerPoint` / `onCapturePointerDown` 函数体零 diff；`addEventListener` 仍 2、`setInterval` 仍 0。

### B3.5 `pix/scripts/ui-shot.mjs`（+985 / −0，§5.3）

- `SEL` 追加 4 项（60 → 64）：`pageNotes` / `noteRowAnchored` / `pageBoxOne` / `notePageBadge`；`pdfPageOne` 与既有 4 处使用零改写。
- 新增 10 个 helper（语义按 §5.3.1 冻结，命名自由）：`pageNotesProbe` / `anchorProbe` / `panelRowProbe` / `textLayerSnapshot` / `emptyTextLayer`（唯一写 DOM）/ `selectionOnPageOne` / `pdfSearchSet` / `pdfSearchNext` / `pdfSearchClose` / `pageLabelProbe`。
- `seedR16Focus()`（恰 14 条 = 标准 4 条 + 页 2 的 9 条填充摘录 + 页 3 的 1 条摘录）。
- 5 个场景 `r16-1`…`r16-5`（5 组 14 条 record / 13 张截图），追加在 `runReaderStateScenarios` 收口之前；每个场景以自己的 `restoreStandardSeed()` 收尾。
- 既有场景 / 相位 / label / 截图名 / helper **零删除零改写**：`git diff -- pix/scripts/ui-shot.mjs | grep "^[-]"` ⇒ **空**（设计档 §2.2 #9 / #10 预估的相邻行位移也未发生）。
- stub 面零改动（`buildStub()` 与 `api` 42 方法逐字不变）。

## B4. 验证（实跑记录）

### B4.1 唯一工程门

```bash
cd E:/develop/PiX-Read/pix && PATH="/c/Program Files/nodejs:$PATH" npm run check
```

```text
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
CHECK_EXIT=0      （error 行数 0）
```

### B4.2 / B4.3 烟测

```text
node scripts/smoke-view.mjs   ⇒ 通过 51 / 失败 0（7 组；VIEW_EXIT=0）
node scripts/smoke-notes.mjs  ⇒ 通过 65 / 失败 0（10 组；NOTES_EXIT=0）
```

### B4.4 离屏验收（唯一验收面）

```bash
cd E:/develop/PiX-Read/pix && PATH="/c/Program Files/nodejs:$PATH" \
  PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v06-r16-after" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs
```

```text
[ui-shot] 结束：产出 166 张截图
ACCEPT_EXIT=0
MANIFEST.json      ⇒ shots.length = 166、failure = null
MEASUREMENTS.json  ⇒ 长度 237、label 去重 64
零缺失比对         ⇒ 基线 153 张缺失 0；基线 59 种 label 缺失 0
磁盘 / 清单        ⇒ png 166 == 清单 166（双向相等）
新增 label 条数    ⇒ r16-page-badge 3 / r16-page-anchor 3 / r16-note-highlight 3 / r16-highlight-coexist 2 / r16-degrade 3
新增截图           ⇒ 13 张（名字见 §B6）
```

迭代记录（真实过程，非一次通过）：dev 运行（`pix-r16-dev`）先暴露 1 条时序竞态 —— `r16-5` 相位 `zero-page` 在 60 页文档上读到 `.pdf-page` 计数 0（页码 pill 由 `setPageCount` 先于 `pageSizes`/`measurePages` 落 DOM，`waitPage` 因此早退）⇒ 按同口径补 3 处「页盒就绪」等待（`r16-1 other-doc` 2 页 / `r16-2` 入口 3 页 / `r16-5 zero-page` 60 页），随后验收运行全绿（该项读数 `pageCount = 60`）。另：`stop_process` 只杀 shell 包装、electron 进程树需按端口额外 `taskkill`，两个取证进程因此串行且端口互不冲突。

### B4.5 走查读数（命令级真实输出）

| # | 命令 | 实测值 | 设计档期望 |
| --- | --- | --- | --- |
| 1 | `grep -rn "notesStat\|notesLoad\|notesAdd\|ipcRenderer" PdfViewer.vue \| wc -l` | **0** | 0 ✅ |
| 2 | `grep -rn "page-notes" pix/src \| wc -l`；`NotesPanel.vue` 内 | **3** / **0** | 3 / 0 ✅ |
| 3 | `grep -rn "本页 " pix/src \| wc -l` | **2** | 2 ✅ |
| 4 | `grep -rn "countNotesByPage" pix/src \| wc -l`；`notes-path.ts` 的 `for (` | **3** / **4** | 3 / 4 ✅ |
| 5 | `grep -n "countNotesByPage" PdfViewer.vue` | 命中行即 `const pageNotes = computed(() => countNotesByPage(…`（`computed` 与调用同一行；模板 0 处调用） | 唯一调用点在 `computed` ✅ |
| 6 | `grep -cE "^::highlight\(" PdfViewer.vue`；字面 `grep -c "::highlight("` | **3** / **4** | 2→3 / 3→4 ✅ |
| 7 | `grep -rn "pix-note-anchor" pix/src \| wc -l`；`pix-search` | **2** / **4**（零增量） | 2 / 4 ✅ |
| 8 | `ANCHOR_HIGHLIGHT_MS` / `LOCATE_WAIT_MS` / `ANCHOR_LAYER_WAIT_MS` 全仓 | **2** / **2** / **2** | 各 2 ✅ |
| 9 | `HighlightRegistryWriter`：`PdfViewer.vue` / 全仓 | **3** / **6** | ≥2 / ≥5 ✅ |
| 10 | `addEventListener` = **2**；`setInterval` = **0**；`notes-store.ts` 新增 `chapterFilter.value = null` = **1** | 见左 | ✅ |
| 11 | `pageFilter\|pageOnly\|pageRange` = **0**；store 的 `pageFocusToken` = **4**；全仓 = **7** | 见左 | 0 / 4 / 6 或 7 ✅ |
| 12 | `grep -c "notes-notice" NotesPanel.vue` | **4**（零增量） | 4 ✅ |
| 13 | `grep -rn "本页笔记不在当前筛选结果中" pix/src \| wc -l` | **1** | 1 ✅ |
| 14 | `grep -rn "matchExcerpts\|foldText" pix/src \| wc -l` | **6** | 设计档写 4，与冻结参考实现矛盾（见 §B8 D3） |
| 15 | `grep -rn "MAX_ANCHOR_TEXT_LENGTH" pix/src \| wc -l` | **2** | 2 ✅ |
| 16 | `grep -c "is-anchored" NotesPanel.vue` | **2** | ≥2 ✅ |
| 17 | `git diff -U0 PdfViewer.vue \| grep -E "^[+-].*\.(pdf-page\|pdf-scroll\|textLayer\|pdf-overlay\|capture-layer)" \| grep -v ^+++ \| grep -v ^---` | **1** 行：`+  const layer = pageElement(pageNumber)?.querySelector<HTMLElement>(".textLayer") ?? null;`（代码内选择器字符串，非 CSS 规则行） | 见 §B8 D4 |
| 18 | `git diff -U0 PdfViewer.vue \| grep -E "^[+-].*::highlight\("` | 只有 `+::highlight(pix-note-anchor) {` | ✅ |
| 19 | `git diff --stat -- pix/src/main pix/src/shared/types.ts pix/package.json package-lock.json packages pix/scripts/smoke-notes.mjs pix/src/renderer/assets/styles` | **空** | ✅ |

### B4.6 白名单与零残留

```text
git status --short ⇒
 M pix/scripts/smoke-view.mjs            ← A 面
 M pix/scripts/ui-shot.mjs               ← B 面
 M pix/src/renderer/components/workspace/NotesPanel.vue      ← B 面
 M pix/src/renderer/components/workspace/PdfViewer.vue       ← B 面
 M pix/src/renderer/pages/WorkspacePage.vue                  ← B 面
 M pix/src/renderer/stores/notes-store.ts                    ← B 面
 M pix/src/renderer/utils/notes-path.ts                      ← A 面
?? docs/pm/R16-design.md / R16-dev.md / R16-req.md / R16-review.md
?? pix/src/renderer/utils/page-anchor.ts                    ← A 面
```

`git diff -- <零 diff 冻结面清单>`（主进程 / 共享类型 / `PdfSearchPanel.vue` / `ReaderPanel.vue` / `KnowledgeMap.vue` / `LibraryPanel.vue` / `ChatPanel.vue` / `PdfSelectionQuickAsk.vue` / `outline-notes.ts` / `notes-view.ts` / `reading-context.ts` / 四个既有 store / `assets/styles` / `package.json` / `package-lock.json` / `packages` / `tsconfig*` / `vite.config.ts` / `smoke-notes.mjs` / `resources` / `README.md` / `.gitignore`）⇒ **空**。
`ls %TEMP%/pix-smoke-view-*` ⇒ 0 项（烟测脚本自清理）；一次性探针未创建。

## B5. 离屏新增场景与 14 条 record 明细（实测读数）

### B5.1 组 `r16-page-badge`（3 条，2 张截图）

| 相位 | 关键实测值 | 覆盖判据 |
| --- | --- | --- |
| `badges` | 页 1 `本页 1 条` / `本页 1 条笔记（摘录 1 · AI 结论 0）；点击定位到笔记面板`；页 2 `本页 2 条` / `（摘录 1 · AI 结论 1）`；页 3 `exists = false`（`.pdf-page` = 3）；子元素序列 `["", "textLayer", "pdf-overlay", "page-notes"]`（页 3 无第 4 项）；`position = absolute` / `z-index = 3`；页盒 `595 × 842`；页 1 `span = 6` / 页 2 `span = 4` / 页 3 `span = 3`；`markerVsSpans = false`（页 1 / 页 2）；`markerVsControls = []`（`.pdf-search-panel = null`）；`canvas.style.width = 595px` / `--scale-factor = 1`；`overlayIndex = 2`；框选模式下 `.capture-layer` `z-index = 5` 且标记仍 **2** 枚 | N91-1 / N91-3 判据 1–3、N94 行 1 / 2 / 14 |
| `live` | 删除后页 2 `本页 1 条` / `（摘录 0 · AI 结论 1）`；撤销后回 `本页 2 条` / `（摘录 1 · AI 结论 1）`；行数 **4 → 3 → 4**；过滤生效（`.notes-count` `共 4 条 → 命中 1 条 / 共 4 条`、`.group-count` `共 3 条 → 共 1 条`）而页 1 / 页 2 标记文本与 title **逐字不变**；滚到第 2 页再回（`第 1 / 3 页`）后读数不变；120% 下（`canvas 714px` / `--scale-factor 1.2`）读数不变且 `markerVsSpans = false`、`markerVsControls = []`；`notesHash` 不变 | N91-3 判据 4 / 5 / 6，N94 行 12 / 15 |
| `other-doc` | `older-paper.pdf`：`.page-notes` 计数 **0**、`.pdf-page` **2**；`readNotes()` 中 `n-other-1.page` 逐字 **7**（越界页零改写 / 零钳制）；切回后页 1 `本页 1 条` 恢复 | N91-2 判据 5 / N94 行 3 |

### B5.2 组 `r16-page-anchor`（3 条，3 张截图）

| 相位 | 关键实测值 | 覆盖判据 |
| --- | --- | --- |
| `locate-panel-open` | 点击前目标行 `top = 1819 > panel.bottom = 989`（防空成立）；点击后 `top = 620 / bottom = 740`，`header.bottom = 190`、`panel.bottom = 967`（完整可见、未被 sticky 头部遮挡），`panel.scrollTop = 0 → 1177`；`.note-row.is-anchored` 恰 **1** 且 `第 3 页`、在当前文档组内；`第 3 / 3 页` / `100%` / `sample-paper.pdf` 不变；四维视图状态零变化（`""` / `排序：页码` / `false` / 无选择条 / 无章节过滤）；`notesHash` 不变、add / report 增量 **0**；成功不弹提示；2.5s 后 `is-anchored` **0** 且配色读数回基线（`rgb(49,66,79)`/`rgb(232,239,245)` → `rgb(227,234,240)`/`rgb(255,255,255)`） | N92 判据 1–5、M1 / M7 |
| `locate-panel-closed` | 折叠后 `.layout-left.offsetWidth = 0`；点击后活动标签 `notes`、宽度 **268 > 200**；目标行被定位（`is-anchored` 在场，发生在 loading 窗口之后）；`loadCalls()` 增量 **1**、`notesHash` 不变 | N92 判据 6 / M1 的 loading 吸收 |
| `degrade-filters` | 章节过滤在场（`true`）时点标记 ⇒ 过滤块从 DOM 消失（`false`）且页 1 行被定位（`is-anchored` = 1）；搜索遮挡（`.note-row` = 1）时点标记 ⇒ `.notes-notice.is-error` 文本逐字 `本页笔记不在当前筛选结果中`、`is-anchored` = 0、`scrollTop` 与退化前逐字相同（0 == 0）、**退化耗时 123ms**（< `LOCATE_WAIT_MS`，即 ready 后立即退化）；清空搜索后再点 ⇒ 定位成功（退化不粘滞） | N92 判据 7 / 8、M1 / M7 / M10 |

### B5.3 组 `r16-note-highlight`（3 条，3 张截图）

| 相位 | 关键实测值 | 覆盖判据 |
| --- | --- | --- |
| `anchor-painted` | `pix-note-anchor` `size = 1`，区间文本 `We study retrieval over long documents where theattention budget is the binding constraint.`（去空白后 === 页 1 摘录）；区间属页 `1`；页 1 `span = 6` / `mark = 0`；两次结构快照（节点类型序列 + 文本）**逐字相同**；`--scale-factor = 1` / `canvas = 595px`；`pix-search` / `pix-search-current` **不在注册表**；选区 `"Sparse Atten"` 非空且 `.quick-ask` 在场 | N93 判据 1 / 2 / 5 / 6、N94 行 8 |
| `unmatched-silent` | 第 2 页：注册表 **不存在**、`span = 4`、无提示、`[pdf-viewer]` 日志增量 **0**；回第 1 页恢复同一区间；5 轮交替序列 = **10** 次点击，`maxMs = 6` / `totalMs = 29`（阈值 1000 / 6000），`revisitMs = [4,3,6,2,2,2,2,2,2,4]`（阈值 300）；快速连点 4 次后标签稳定在 `第 1 / 3 页`，注册表非空且区间所属页 `1` == 当前页（**无旧页残留**） | N93 判据 7 / N94 行 9 / 10 / 16 / 17（M9 / M10） |
| `scale-stable` | 80%：`--scale-factor 0.8` / `canvas 476px`（595 × 0.8 几何复算）/ 区间文本不变 / 仍在页 1；回 100%：`1` / `595px` / 文本不变 | N93 判据 3 / 4 / N94 行 11 |

### B5.4 组 `r16-highlight-coexist`（2 条，2 张截图）

| 相位 | 关键实测值 | 覆盖判据 |
| --- | --- | --- |
| `coexist` | 锚点 `size = 1` 且搜索 `pix-search` `size = 3`（`["Retrieval","retrieval","retrieval"]`，全在页 1）、`pix-search-current` `size = 1`（`["Retrieval"]`）**同屏并存**；两组区间文本集合不同；锚点区间文本去空白后逐字等于摘录；点「下一处」后锚点 `size` 与文本逐字不变；页 1 `span` 仍 **6**；标记矩形 `(972,904,60,19)` 与 `.pdf-search-panel` 矩形 `(887,117,300,67)` **不相交**（`overlap = []`） | N93-3 判据 1–3（M6）、N94 行 5 |
| `search-closed` | 关闭搜索面板后 `pix-search` / `pix-search-current` 不在注册表，锚点仍在且区间文本不变，无提示 | N93-3 判据 4（互不破坏） |

### B5.5 组 `r16-degrade`（3 条，3 张截图）

| 相位 | 关键实测值 | 覆盖判据 |
| --- | --- | --- |
| `zero-page` | `long-book.pdf`：`.page-notes` = **0**、`.pdf-page` = **60**（防空成立）；翻两页后仍 0 且注册表不存在；无提示；切回后页 1 标记与锚点都恢复 | N94 行 2 / 4 / 7 |
| `no-text-layer` | 清空页 1 文字层后翻页往返 + 2.3s：注册表 **不存在**、无提示、`[pdf-viewer]` 日志增量 **0**（静默放弃、不重试）；标记仍 **2**（不依赖文字层）；缩放重渲染后锚点恢复且区间文本不变（降级不粘滞） | N94 行 8 / 11 |
| `external-refresh` | 外部把 `n-current-1` 的 page 由 1 改为 3 后触发 focus + 刷新：`.note-row` = **4**、文件 4 条；页 1 **无标记**、页 2 `本页 2 条`、页 3 `本页 1 条` / `（摘录 1 · AI 结论 0）`；当前页（1）注册表不存在；`notesHash` 前后逐字相同、add / report 增量 **0**；无提示残留 | N94 行 12 / 21 |

## B6. 13 张截图逐张目视登记（`read` 工具实看，结论逐张）

| # | 截图 | 目视结论 |
| --- | --- | --- |
| 1 | `r16-1-page-badges.png` | 页 1 右下角一枚胶囊 `本页 1 条`，落在正文下方的空白区（正文止于页高约 1/4 处），**不压任何字形**；无换行、无第二枚、无「0 条」；页底与页码 pill / 章节 chip 不重叠（二者在页盒之外） |
| 2 | `r16-1b-page-badges-other-doc.png` | `older-paper.pdf` 整窗：页面与控件位置正常，**无任何标记**（越界 p7 不画）；左栏仍显示该条 p7 笔记（面板照常显示、文件未被改写） |
| 3 | `r16-2-page-anchor.png` | 目标行（第 3 页）完整可见：边框变深、底色变浅（`is-anchored`），未被 sticky 头部遮挡；列表行数仍 14（未被过滤）；下方可见 older-paper 组头 ⇒ 定位确实滚动到该行 |
| 4 | `r16-2b-page-anchor-tab-switch.png` | 左栏已展开且停在「笔记 14」标签，目标行带瞬时高亮；**无折叠残留**（左栏宽度正常、内容完整）；阅读区仍是第 3 页且章节 chip 正常；页 3 标记 `本页 1 条`、页 2 标记 `本页 11 条` 均正常显示 |
| 5 | `r16-2c-page-anchor-filter-degrade.png` | 退化提示行与既有提示同款外观（浅红底 + 文本逐字 `本页笔记不在当前筛选结果中`），列表仍处于搜索过滤态（1 行），无行高亮 |
| 6 | `r16-3-note-anchor.png` | 页 1 摘录被浅底下划线标出（覆盖 `We study retrieval … the` + `attention budget is the binding constraint.` 两行）；字形仍是 canvas 绘制 ⇒ **无重影**；`.textLayer` 无新节点（肉眼表现为选区几何不变）；标记 `本页 1 条` 仍在右下角 |
| 7 | `r16-3b-note-anchor-unmatched.png` | 第 2 页**无任何高亮**（无残影、无半截下划线）、无提示；标记 `本页 2 条` 仍显示 |
| 8 | `r16-3c-note-anchor-after-zoom.png` | 80% 下高亮仍在页 1 同一句话上、随页面等比缩小；下划线粗细与 100% 一致（2px）；文字不重影；标记随页盒缩放 |
| 9 | `r16-4-anchor-with-search.png` | 同屏两套高亮互相可分：锚点 = 浅底纹 + 深下划线；搜索全部命中 = 灰块（`Retrieval` / 两处 `retrieval`）；当前命中 = 反白（深底白字）；三者均不遮挡字形（无重影）；搜索面板与页右下角标记互不遮挡 |
| 10 | `r16-4b-anchor-after-search-closed.png` | 搜索面板关闭后**无搜索高亮残留**，锚点外观不变（浅底下划线仍在同一句上）；无提示 |
| 11 | `r16-5-zero-page-notes.png` | 60 页文档第 3 页整窗：**无标记、无高亮、无提示**；页面与控件位置正常（页码 `第 3 / 60 页`） |
| 12 | `r16-5b-no-text-layer.png` | 文字层被清空（canvas 字形仍在）：**无高亮、无提示**；标记 `本页 1 条` **仍在**（标记不依赖文字层） |
| 13 | `r16-5c-after-external-refresh.png` | 外部刷新后：列表按新列表重排（该条显示 `第 3 页`，页 1 无行）；当前页（1）**无标记、无高亮**；无提示残留 |

> 补充：dev 运行与验收运行共 13 张同名截图做过 sha256 比对，其中 **9 张逐字节相同**；4 张不同（`r16-2c` / `r16-5` / `r16-5b` / `r16-5c`）已用 `read` 逐张复看，内容与上表结论一致（差异来源为面板相对时间文案 `N 分钟前` 与抗锯齿）。

## B7. 与设计档分工表的逐项闭合（§7.2 B1–B7）

| 序 | 交付物 | 完成判据（设计档） | 本档实测 |
| --- | --- | --- | --- |
| B1 | `notes-store.ts` | `pageFocusToken` = 4；`chapterFilter.value = null` 新增恰 1 行；既有动作零 diff | ✅（§B4.5 #10 / #11；`git diff` 纯新增） |
| B2 | `WorkspacePage.vue` | 判据逐字同构；守卫增量恰 1 | ✅（`grep -c` 由 1 → 2） |
| B3 | `NotesPanel.vue` | 走查 #8 / #12 / #13；既有文案与 DOM 顺序零 diff；四个既有定时器清理逐字不动 | ✅（§B4.5 #8 / #12 / #13 / #16；`-` 行仅 2 处模板改写） |
| B4 | `PdfViewer.vue` | 走查 #2 / #3 / #5 / #6 / #7 / #9 / #10 / #14 / #15；两条 `git diff -U0` 判据；`check` 0 error | ✅（§B4.5；#14 见 §B8 D3、#17 见 §B8 D4） |
| B5 | `ui-shot.mjs` | §5.3.4 判据 1–4；既有 153 张 / 223 条 / 59 种 label 零缺失 | ✅（§B4.4；`git diff` 的 `-` 行为 0） |
| B6 | 离屏验收 | 退出码 0、`failure === null`、零缺失、13 张 / 14 条 / 5 种 label 齐备 | ✅（§B4.4；验收目录按任务书为 `pix-v06-r16-after`） |
| B7 | 目视比对 | 13 张逐张登记 | ✅（§B6） |
| 合并门 | `check` + `smoke:view` + `smoke:notes` + 零缺失 + `git status` 白名单 | ✅（§B4.1–§B4.6） |

## B8. 偏差登记与未决项

| # | 类型 | 内容 |
| --- | --- | --- |
| **D1** | 场景前置补充（必须，已落地） | `runReaderStateScenarios` 的最后一个既有场景 `r15-f16` 收尾停在**首页**，而 R16 第一个场景经 `enterNotesProbe → enterCleanWorkspace → goHome()` 的第一步是点工作区内的「返回首页」按钮（首页无此按钮，直接调用会抛错）⇒ R16 块开头补 `if (!(await has(SEL.workspace))) { await enterWorkspace(LIBRARY_NAME); }`（只读判定 + 既有 helper，不改既有场景）。 |
| **D2** | 实现细节（语义不变，需登记） | `anchorTextCache` 的作废点除「文档切换清空」外，另有「该页文字层渲染完成时 `anchorTextCache.delete(pageNumber)`」：设计档 §1.4.7 的收敛依赖「`renderPage` 末尾再重画一次」，而流式 chunk 未完成时折叠出的部分文本若被缓存，重画会命中脏缓存 ⇒ 该删除是让 §1.4.7 的收敛真正成立的必要一步（缩放仍不失效，折叠只依赖文本内容）。 |
| **D3** | 走查计数口径（设计档内部矛盾，行为无差异） | §5.4 #14 写 `matchExcerpts\|foldText` = **4**（`page-anchor.ts` 定义 2 + `PdfViewer.vue` import 1 + 调用 1），但 `matchExcerpts` 内部必须调用 `foldText`（两侧同一份折叠）⇒ 实测 **6**（`page-anchor.ts` 3 + `PdfViewer.vue` 3：import 行含两名 + 两处调用）。与 A 面 §A7 D3 同一结论，建议按实现放宽。 |
| **D4** | 走查口径（CSS 规则零 diff 的启发式边界） | §2.3 的 `git diff -U0 \| grep -E "^[+-].*…textLayer…"` 在 B 面落地后命中 **1** 行：锚点绘画新增的 `pageElement(pageNumber)?.querySelector<HTMLElement>(".textLayer") ?? null`（**代码内选择器字符串**，非 CSS 规则行；文本层 class 无法在不引用该字符串的前提下定位）。已复读确认 `PdfViewer.vue` 的 `.pdf-page` / `.pdf-scroll` / `.textLayer` / `.pdf-overlay` / `.capture-layer` **CSS 规则行零 diff**（`+`/`-` 行中不含任何此类规则选择器），建议把该走查命令限定为 CSS 行或改用 `.pdf-page\s*\{` 形态。 |
| **D5** | 场景判据强化（不改变冻结语义） | 三处补「页盒就绪」等待（`r16-1 other-doc` / `r16-2` 入口 / `r16-5 zero-page`）：页码 pill 由 `setPageCount` 先于 `pageSizes`（`measurePages`）落 DOM，`waitPage` 会在页盒尚未渲染时早退（dev 运行实测 `pageCount = 0`）；另在 `r16-1 badges` 与 `r16-3 anchor-painted` 补文字层就绪等待（`span` 计数），使 span / 几何 / 快照判据不依赖渲染时序。 |
| **D6** | 场景判据强化（新增可判定式） | `degrade-filters` 相位登记 `degradeMs`（本次 **123ms** < 2500）以把「ready 后**立即**退化、不等满 `LOCATE_WAIT_MS`」变成可判定式；`r16-1 badges` 的 ⑦ 通过「进入框选模式 → 读 `.capture-layer` `z-index` → Esc 退出」取得（`.capture-layer` 只在框选模式下存在；截图仍取自普通模式，不受影响）。 |
| **D7** | 夹具写法（更贴设计档语义） | `r16-5 external-refresh` 的外部改写用 `readNotes()` 逐字段复制后只改 `n-current-1.page`（而不是新建一份 `seedNotes()`），这样其余三条**逐字不变**；刷新等待同时等「`.notes-stale` 消失」与「行数 4」（设计档只写后者，前者使「刷新真的完成」可判定）。 |
| **U1** | 未跑项（任务书禁止 / 非本轮） | `npm run build` / `npm test` / `npm run package` / `npm run dev` 未跑（任务书禁止）；设计档 §5.3.5 建议的「动工前自建基线 `pix-v05-r16-base`」未单独执行 —— 零缺失比对直接使用 R15 交付基线 `pix-v05-r15-final`（任务书指定的基线）。 |
| **U2** | 遗留观察（不影响本轮判据） | `r16-1` 的 120% 相位里页码 pill / 章节 chip 与标记仍不相交（本次实测 `markerVsControls = []`），但这是**夹具相位内的几何事实**；真实文档页面贴底 / 更宽时仍可能重叠并被拦截点击（设计档 §1.1.4 已登记取舍，本档不改）。 |

## B9. 纪律与零残留声明

- 只改动白名单内文件（B：4 个源码 + `ui-shot.mjs` + 本档；A：3 文件），`assets/styles/**` / `package.json` / `package-lock.json` / `packages/**` / 主进程与共享类型全部零 diff。
- 未运行任何 git 写命令（未 `add` / 未 `commit`）；未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未引入或升级依赖。
- 两个离屏取证进程串行执行（dev 运行与验收运行不并发；前者被中止后按端口 `taskkill` 清树再启动后者）。
- 既有 153 张截图 / 223 条测量 / 59 种 label 零缺失；既有场景函数体、`SEL.pdfPageOne`、`record` 语义、stub 面（42 方法）零改动；`git diff -- pix/scripts/ui-shot.mjs | grep "^[-]"` 为空。
- 一次性脚本只写 `%TEMP%` 并在运行后删除；烟测与离屏脚本自建目录自清理（`pix-smoke-view-*` 0 项残留）。
- 本档只记真实文件内容与真实命令输出；未验证项在 §B8 U1 明示。
