# R8 开发档 · 笔记作为对话上下文（N43–N51）

> 上游：`docs/pm/R8-design.md`（定稿，契约以此为准）、`docs/pm/R8-req.md`、`docs/pm/R8-review.md`、`docs/pm/PRD-V0.4.md`。
> 本档只记录实现事实：改动文件、关键决策与偏差、真实命令与真实输出、逐条自评、未验证事项。
> 分工：**开发 A（数据与注入面）** 见下；开发 B（UI 与会话面）另行追加「## 开发 B」一节。

---

## 开发 A（数据与注入面）

### A.1 改动文件清单

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `pix/src/renderer/utils/reading-context.ts` | 修改（+80/-1） | 设计档 §1.2 全部：① `ReadingSendContext.notes: ReaderNote[]` 必填（无默认值）；② `MAX_CONTEXT_NOTES = 10` / `MAX_CONTEXT_NOTES_CHARS = 8000` 单点定义（注释注明 R8 需求 §0.2 / 设计档 §1.2）；③ `NotesContextSelection{entries,injected,dropped}`；④ `sortNotesForContext`（`docPathKey` 升序 → `page` → `createdAt` → `id`，复用 notes-path 的比较键）；⑤ `selectNotesForContext`（排序 → 条数上限 → 逐条尝试字符上限，超限整条丢弃并继续尝试，序号按已装入条数续编）；⑥ 条目块渲染（`{序号}. doc: …` + 3 空格缩进的 `page`/`kind`/`text`（+非空 `comment`）行、行内归一化 `replace(/\s+/g," ").trim()`、不注入 id/绝对路径/时间戳）；⑦ `buildReadingUserMessage` 在 `selectedText` 之后、`</reading_context>` 之前追加 `reader_notes:` 段（`entries` 为 0 时不出现）。既有四字段顺序、`path`→`page`→`pageCount`→可选 `selectedText:` 与失败消息段零改动 |
| `pix/src/renderer/stores/notes-store.ts` | 修改（+43/-0） | 设计档 §1.1：`selectedNoteIds: ref<ReadonlySet<string>>`（不外露原始集合、整组替换式更新）+ 派生 `selectedNotes`/`selectedCount`/`selectionFull` + 动作 `isNoteSelected`/`toggleNoteSelected`（上限守卫用派生计数判）/`replaceSelectionWith`（id 不在 `notes.value` ⇒ `false` 且零副作用）/`clearNoteSelection`；`resetNotes()` 追加一行 `clearNoteSelection()`；上限常量从 `../utils/reading-context` 顶层 import。既有动作语义、`applyNotes` 全量覆盖、错误码表、`loadSeq`/`writeSeq` 不变 |
| `pix/src/renderer/composables/useQuickAsk.ts` | 修改（+15/-1） | 设计档 §1.4：追加 `NotesAskHandler` / `registerNotesAskConsumer` / `emitNotesAsk`（同文件同范式、无载荷触发信号）；文件头补一句两套 seam 并存。既有 quick-ask 三处签名与实现逐字不动 |
| 未改动（白名单外或设计档声明零改动） | — | `utils/notes-path.ts`（`sortNotesForContext` 落点偏差见 D1）、`stores/session-store.ts`（N49 索引化，见 D2）、`main/reading-prompt.ts`（设计档 §9 不变量 5「不写进系统提示词」，见 D3）、`utils/note-context.ts`（设计档未要求独立纯函数模块，见 D9）、全部 `.vue` 与 `ui-shot.mjs`（B 面） |

### A.2 关键决策与偏差

| # | 决策 / 偏差 | 依据与影响 |
| --- | --- | --- |
| D1 | `sortNotesForContext` 落在 `utils/reading-context.ts`，而不是设计档 §3.1 的常规落点 `utils/notes-path.ts`（该文件不在本轮 A 面白名单，禁改）。排序键、签名、导出名与 §0.2 冻结顺序逐字一致，并复用 notes-path 既有 `docPathKey`（无环、顶层 value import）。交接：若后续把实现迁回 `notes-path.ts`，`reading-context.ts` 改为顶层 import 即可，行为零变化 | 红线 7（只改白名单内文件）；设计档 §1.2「排序实现点唯一」在本轮由 reading-context.ts 承担（该文件行本就要求「字符串拼接、排序、长度比较只在本文件」） |
| D2 | `session-store.ts` 的 N49 索引化（设计档 §3.1 第 4 行 + 覆盖表 + §6.4 no.4/no.5）**未执行**：该文件不在本轮白名单、也不在交付清单 | 交接：`grep -n "findIndex" pix/src/renderer/stores/session-store.ts` 仍 1 命中（287 行）；`ChatPanel` 侧 `answerActionViews` 与 `ui-shot` 的 `anchor-cache` 组同样不在本侧 |
| D3 | `main/reading-prompt.ts` **零改动**（角色描述允许「加一句 reader_notes 说明」，但以设计档为准） | 设计档 §3.1 范围外列明「任何情况下不动 `pix/src/main/**`（含 `reading-prompt.ts`）」、§9 不变量 5 声明不写进系统提示词；§6.4 no.12 期望 `git diff pix/src/main` 为空 |
| D4 | 装填循环写成单趟 `for (const [index, note] of sorted.entries())` + `if (index >= MAX_CONTEXT_NOTES)`，而不是两段 `slice(0, MAX_CONTEXT_NOTES)` / `slice(MAX_CONTEXT_NOTES)` | 满足 §6.4 no.2 对 `reading-context.ts` 恰 2 行 `MAX_CONTEXT_NOTES\b` 的计数（定义 + 裁剪）；语义与「slice 为候选、其余计入 dropped」等价（同一顺序、同一不变式） |
| D5 | `dropped` 的顺序（设计档未冻结）：按遍历序 push ⇒ 先「字符超限的候选条目」，后「防御式超条数条目」 | chip 只取 `dropped.length`，顺序不可判定；不变式 `injected.length + dropped.length === notes.length` 由烟测 11/12/13 覆盖 |
| D6 | 选择集更新一律整体替换（`new Set(...)`），toggle 移除用 `filter` 构造新集合；不做 `watch(notes)` 同步、不做 prune | 设计档 §1.1「整组替换式更新、不外露、不做 watch/prune」；失效 id 不可见、不占名额、不产生幽灵条目 |
| D7 | 已知跨面编译耦合（非偏差，与 R7 的 D7 同构）：`ReadingSendContext.notes` 必填使**尚未落地**的 `ChatPanel.vue:320` 报 `TS2345 … Property 'notes' is missing … but required in type 'ReadingSendContext'` | 正是设计档 §7「A 先合入，B 的编译前置是 A 的类型面」；B 面把发送快照实参补上即消失。A 面自身文件在 check 日志中 0 命中，`tsconfig.main` / `tsconfig.preload` 两单元单独跑为 0 error（A.4） |
| D8 | `useQuickAsk.ts` 的头注释与新增注释跟随文件既有英文风格 | 设计档只冻结签名与行为，未冻结注释语言；AGENTS「风格向同文件看齐」 |
| D9 | 未新建 `utils/note-context.ts` | 白名单项的条件是「若设计认为需要独立纯函数模块」，设计档 §1.2/§3.1 未要求 ⇒ 条件不成立 |

### A.3 纯函数烟测（设计档 §6.2 十五组 + 1 组早退补充，仓库外临时目录）

编译与断言脚本都写在 `%TEMP%/pix-r8-ctx`（`C:\Users\86157\AppData\Local\Temp\pix-r8-ctx`），跑完删除；仓库内零临时文件。tsconfig 按 §6.1 的三条实测约束：`baseUrl` 用 `pwd -W` 取 `E:/develop/PiX-Read/pix`、`files` 含 `src/renderer/types/ipc.ts`（`window.pixApi` 的 `declare global`）、`paths` 只写在 tsconfig 里；断言脚本 `cd "$TMP/pix-r8-ctx"` 后用相对 `require`。

| 设计档用例 | 本烟测断言（16 组全绿） |
| --- | --- |
| 1 真实示例逐字 | 逐字 `strictEqual` 整条消息（含 `path`/`page`/`pageCount`/`selectedText:`/`reader_notes:` 段与两条条目，A 在前）；无结尾换行 |
| 2 notes 为空（有选区） | 与 R7 输出逐字节相同 + 无 `reader_notes:` 行 |
| 3 notes 为空（无选区） | 与 R7 输出逐字节相同 + 无 `selectedText:` / `reader_notes:` 行 |
| 4 注入顺序 + 确定性 | 入参 `[B,A]` ⇒ `injected` 顺序 `["a1","b1"]`；两次调用 `JSON.stringify` 相同 |
| 5 第 4 级比较键 | `docPath`/`page`/`createdAt` 相同 ⇒ 按 `id` 升序（`n-a`,`n-m`,`n-z`） |
| 6 comment 归一化 | `"第一行\n\n第二行  "` ⇒ `   comment: 第一行 第二行` |
| 7 空 comment | `""` 与 `"   "` 均不渲染 `comment:` 行 |
| 8 脏 text | `"  a\n b "` ⇒ `   text: a b` |
| 9 边界 8000 | 标定骨架（`entries[0].length - text.length`）后 `entries.join("\n").length === 8000` ⇒ `injected 1 / dropped 0` |
| 10 边界 8001 | `dropped 1 / injected 0`、`entries` 空、消息无 `reader_notes:` 行 |
| 11 中间条目超限 | 三条（4000/4000/1000 字符）：第 2 条丢弃后继续装入第 3 条 ⇒ `injected ["t1","t3"]`、`dropped ["t2"]`、序号续编（第 3 条渲染为 `2.`）、装入内容与入参逐字相等（无 `slice` 产物）、`join ≤ 8000` |
| 12 单条自身超限 | `injected 0 / dropped 1`、不变式成立（chip 的 `M === N` 同源） |
| 13 防御式条数上限 | 11 条短笔记 ⇒ `injected 10 / dropped 1`（`cap-11` 被裁），条目数 10 |
| 14 条目块洁净 | `reader_notes:` 之后无 `\`、无 `C:`、无 id（`a1`/`b1`）、无 `createdAt`/`updatedAt` |
| 15 非 PDF | `page: 1`/`pageCount: 0` 照旧；`reader_notes` 段与 PDF 情形逐字相同；`doc:` 取 `A.docPath` |
| 16 补充 早退 | `filePath: null` ⇒ 返回裸文本 |

### A.4 真实命令与真实输出

**命令 1（唯一工程门）**

```text
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

src/renderer/components/workspace/ChatPanel.vue(320,85): error TS2345: Argument of type '{ filePath: string | null; page: number; pageCount: number; selectedText: string; }' is not assignable to parameter of type 'ReadingSendContext'.
  Property 'notes' is missing in type '{ filePath: string | null; page: number; pageCount: number; selectedText: string; }' but required in type 'ReadingSendContext'.
CHECK_EXIT=2
```

改前基线（`git stash` 之外无法回退，故取本轮开工前实测）：`CHECK_EXIT=0`、无输出。
退出码 2 的唯一真因是 D7 的 B 面调用点（`ChatPanel.vue` 是 B 的文件，本轮禁改）；A 面文件在错误日志中 `grep -c` 为 **0**。B 面落地后重跑即为 0 error。链被 vue-tsc 中断后，两个主进程编译单元单独跑：

```text
$ ./node_modules/.bin/tsc -p tsconfig.main.json --noEmit
MAIN_EXIT=0
$ ./node_modules/.bin/tsc -p tsconfig.preload.json --noEmit
PRELOAD_EXIT=0
```

**命令 2（烟测编译，仓库外临时 tsconfig）**

```text
$ cd pix && ./node_modules/.bin/tsc -p "$TMP/pix-r8-ctx/tsconfig.json"
TSC_EXIT=0
$ find /tmp/pix-r8-ctx/out -type f | sort
/tmp/pix-r8-ctx/out/main/pix-paths.js
/tmp/pix-r8-ctx/out/main/preload.js
/tmp/pix-r8-ctx/out/renderer/types/ipc.js
/tmp/pix-r8-ctx/out/renderer/utils/notes-path.js
/tmp/pix-r8-ctx/out/renderer/utils/reading-context.js
/tmp/pix-r8-ctx/out/shared/types.js
```

**命令 3（烟测运行）**

```text
$ cd "$TMP/pix-r8-ctx" && node assert.cjs
OK   1) 1) 注入与真实示例逐字一致（notes 入参顺序无关，A 在前 = 冻结排序）
OK   2) 2) notes 为空（有选区）时与 R7 输出逐字节相同
OK   3) 3) notes 为空且无选区时与 R7 输出逐字节相同
OK   4) 4) 注入顺序 = docPathKey 升序（入参逆序）+ 确定性
OK   5) 5) docPath/page/createdAt 相同时按 id 升序（第 4 级比较键）
OK   6) 6) comment 行内归一化：连续空白折叠为单个半角空格 + 去首尾
OK   7) 7) comment 为 "" 或纯空白时不渲染 comment 行
OK   8) 8) text 为脏数据（含换行与首尾空格）时归一化为单行
OK   9) 9) 字符上限边界 8000：恰好装入（injected 1 / dropped 0）
OK   10) 10) 字符上限边界 8001：整条丢弃、无 reader_notes 行
OK   11) 11) 三条：第 2 条超限丢弃后继续尝试第 3 条（不截断、序号连续）
OK   12) 12) 单条自身 > 8000：injected 0 / dropped 1，不变式成立
OK   13) 13) 11 条短笔记：防御式条数上限 ⇒ injected 10 / dropped 1
OK   14) 14) 条目块洁净：无反斜杠 / 无盘符 / 无 id / 无时间戳
OK   15) 15) 非 PDF：page/pageCount 照旧，reader_notes 段与 PDF 情形逐字相同
OK   16) 16-补充) 无文档（filePath null）时早退：返回裸文本
checks=16 failed=0
SMOKE_EXIT=0
```

**命令 4（§6.4 只读核对点，A 侧相关行）**

```text
$ grep -rn "MAX_CONTEXT_NOTES\b" pix/src/renderer
stores/notes-store.ts:17  import { MAX_CONTEXT_NOTES } from "../utils/reading-context";
stores/notes-store.ts:82  const selectionFull = computed(() => selectedNotes.value.length >= MAX_CONTEXT_NOTES);
utils/reading-context.ts:22  export const MAX_CONTEXT_NOTES = 10;
utils/reading-context.ts:76  if (index >= MAX_CONTEXT_NOTES) {
（A 侧 4 行 / 2 文件；设计档 §6.4 no.2 的 6 行 / 3 文件待 B 的 NotesPanel.vue 2 行补齐）

$ grep -rn "MAX_CONTEXT_NOTES_CHARS\b" pix/src/renderer
utils/reading-context.ts:24  export const MAX_CONTEXT_NOTES_CHARS = 8000;
utils/reading-context.ts:79  if ([...entries, block].join("\n").length > MAX_CONTEXT_NOTES_CHARS) {
（A 侧 2 行；B 的 ChatPanel.vue 2 行待补）

$ grep -rn "\b8000\b" pix/src/renderer
utils/reading-context.ts:24  export const MAX_CONTEXT_NOTES_CHARS = 8000;
（平文本 grep 另命中既有 HomePage.vue:83 的 172800000，R6 既有、与 R8 无关）

$ grep -rn "reader_notes" pix/src/renderer
utils/reading-context.ts:23  （注释）
utils/reading-context.ts:68  （注释）
utils/reading-context.ts:105 lines.push("reader_notes:");
（唯一实现点；ChatPanel 0 命中由 B 保证）

$ grep -rn "selectedNoteIds" pix/src/renderer
stores/notes-store.ts:67,80,206,212,216,222,227
（只命中 store，原始集合未外露）

$ grep -rn "replaceSelectionWith" pix/src/renderer
stores/notes-store.ts:220,256（定义 + 导出；调用点在 B 的 NotesPanel.vue）

$ grep -rn "registerNotesAskConsumer\|emitNotesAsk" pix/src/renderer
composables/useQuickAsk.ts:26  export function registerNotesAskConsumer(handler: NotesAskHandler | null): void {
composables/useQuickAsk.ts:30  export function emitNotesAsk(): void {
（A 侧 2 行；ChatPanel / NotesPanel 各 2 行待 B 落地。全仓库仍只有 1 个 seam 文件）

$ grep -n "findIndex" pix/src/renderer/stores/session-store.ts
287:    const index = blocks.findIndex((block) => block.id === blockId);
（N49 未做，见 D2）

$ grep -rn ": any\|as any\|await import(\|import(" 本侧 4 个白名单文件
（0 命中；ReaderNote 走顶层 import type）

$ git diff --name-only
pix/src/renderer/composables/useQuickAsk.ts
pix/src/renderer/stores/notes-store.ts
pix/src/renderer/utils/reading-context.ts
（+ 本开发档 `docs/pm/R8-dev.md` 为新增；`pix/src/main/**`、`pix/src/shared/types.ts`、`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**` 0 改动）
```

**命令 5（临时目录清理）**

```text
$ rm -rf "$TMP/pix-r8-ctx"
$ ls -d "$TMP/pix-r8-ctx"
ls: cannot access '/tmp/pix-r8-ctx': No such file or directory
```

**命令 6（收尾复跑工程门，确认 B 是否已落地）**

```text
$ cd pix && npm run check
（见文末「收尾实测」；与本档 A.4 命令 1 的差异即 B 面是否已合入）
```

### A.5 A 面自评与未验证事项

- 设计档 §7 自评清单第 1 条（§6.2 十五组 + 边界 + 中间丢弃 + 确定性）→ A.3 全绿（16 组，含设计档未列的第 16 组早退）。
- §6.4 no.2/no.3/no.9 的 A 侧计数 → A.4 命令 4 逐条落地；`MAX_CONTEXT_NOTES` 的 2 行/文件与 `\b8000\b` 单点命中已核对。
- §3.1 A 面覆盖表的 N49 行**不在本轮范围**（D2），`session-store.ts` 的 `findIndex` 仍在；`ChatPanel` 每帧每块一次解析与 `anchor-cache` 组归 B。
- 未验证 1：离屏（`ui-shot.mjs`）未跑 —— 40–46 场景、5 个断言组、chip 三态与无文档禁用均属 B 的交付面；A 侧不碰脚本（白名单）。
- 未验证 2：渲染层 store 行为（多选/上限 no-op/替换/清空）未写自动化测试 —— 仓库无渲染层单测设施；本侧靠类型检查 + 走查核对，交互断言由 B 的离屏场景 40/40b/40c/41b/44/44b 覆盖（其驱动直接调用本侧动作名）。
- 未验证 3：大列表性能未实测（与设计档 §7 自评清单第 4 条同口径；N49 未做）。
- 未验证 4：`npm run check` 全绿的条件 = B 面在 `ChatPanel.send()` 内补 `notes: [...notesStore.selectedNotes]`（发送瞬间派生结果，位置在 `appendOptimisticUserMessage` 之前、与 `readContext` 同一同步段）——一行交接，见设计档 §3.2/§7。

### 收尾实测（本档落盘前最后一次复跑）

```text
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

src/renderer/components/workspace/ChatPanel.vue(320,85): error TS2345: Argument of type '{ filePath: string | null; page: number; pageCount: number; selectedText: string; }' is not assignable to parameter of type 'ReadingSendContext'.
  Property 'notes' is missing in type '{ filePath: string | null; page: number; pageCount: number; selectedText: string; }' but required in type 'ReadingSendContext'.
CHECK_EXIT=2
```

与命令 1 逐字相同：B 面此时仍未落地（`ChatPanel.vue` mtime 未变、非本侧触碰），故退出码保持 2；B 面补上 `notes` 实参后本命令即为 0 error。本档落盘时的 `git status --short`：`M composables/useQuickAsk.ts`、`M stores/notes-store.ts`、`M utils/reading-context.ts`、`?? docs/pm/R8-{design,req,review,dev}.md`；`git diff --numstat` = `15/1`、`43/0`、`80/1`（合计 +138/-2）。

---

## 开发 B（UI 与取证面）

### B.1 改动文件清单

| 文件 | 动作（numstat） | 内容 |
| --- | --- | --- |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改（+257/-55） | 设计档 §1.5 全部：新增 prop `clarifying` / `documentOpen`；常量 `ASK_DISABLED_TITLE`（`等待澄清回答时无法发起追问`）/ `ASK_NO_DOC_TITLE`（`请先打开文档，摘录才会随提问注入`）/ `SELECT_CAP_TITLE`（用 `MAX_CONTEXT_NOTES` 插值）与唯一判定 `askDisabledTitle`（三态优先级）；`isNoteSelectDisabled`（未选且满才禁用，上限守卫仍在 store）/ `onAskNote`（`replaceSelectionWith` 返回 `true` 才 `emitNotesAsk`）；`.notes-selection-bar`（`.notes-selection-count` / `.notes-ask-btn-wrap`+`.notes-ask-btn` / `.notes-selection-clear`，渲染在 `.notes-header` 内、`.notes-filter` 之后，条件 `status==="ready" && hasNotes && selectedCount>0`）；行结构改为 `.note-select-wrap`(原生 `input.note-select`，本体只挂 `:checked`/`:disabled`，`@click.stop="toggleNoteSelected"` 挂包裹元素)+`.note-body`（原四元素整体搬入，`.note-head` 内部顺序与类名零改动）+`.note-actions`+`.note-ask-wrap`/`.note-ask`；`.note-row.selected` 行态（置于 `.note-row.confirming` 之前，叠加时沿用既有 confirming 配色） |
| `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改（+130/-19） | 设计档 §1.3/§1.4/§3.2：`ContextChipKind` 增 `"notes"`、`ContextChip.title?`、`readingContextWillSend`（`documentChip !== null && !excludedContexts.has("document")`）、`notesChip`（可见性级联 + 两态 label/title，`MAX_CONTEXT_NOTES_CHARS` 仅作文案插值）、`contextChips` 增一项（顺序 document → selection → notes）；`send()` 内唯一笔记快照并作 `readContext.notes` 实参（含「chip 被移除 ⇒ 本次不注入」分支，见 D1）；`onNotesAsk` + `notesAskNotice` + 2500ms 定时器（卸载清理）；`onMounted`/`onUnmounted` 的 `registerNotesAskConsumer` 注册/置 null；`answerActionViews` computed（每帧每块至多一次锚点解析）+ `answerSaveView`/`answerSaveTitle`/`answerSaveDisabled`（`answerSaveTarget` 改为读同一视图）；模板 chip `:title="chip.title"` 与 `.notes-ask-notice`（渲染在 `.context-row` 与 `.attachment-row` 之间） |
| `pix/src/renderer/pages/WorkspacePage.vue` | 修改（+9/-1） | `selectLeftTab` 的 `library` 分支追加 `clearNoteSelection()`（设计档 §2 情形 4；折叠左栏不清空）；`<NotesPanel>` 增 `:clarifying="pendingUserInput !== null"` 与 `:document-open="readerStore.filePath !== null"`（与 `documentChip` 同源判据） |
| `pix/scripts/ui-shot.mjs` | 修改（+1039/-5） | 设计档 §1.6 + §6.3：stub 五原语（`sendCalls`/`clearSendCalls`/`setSendFailure`/`emitUserInputRequest`/`setNotesDeleteFailure`，含 `handleCommand` 新增 prompt/steer 分支、`onUserInputRequest` 改为保留回调、`notesDelete` 失败注入）；脚本侧 `setDraft`（`typeAndSend` 改为复用）、`sendViaEnter`、`answerTitleFromEnd(n)`（`titleOfLastAnswer` 泛化为 `n=1` 调用）、`clickInRow`/`selectionSnapshot`/`chipSnapshot`/`composerSnapshot`/`readerSnapshot`/`lastSend`/`waitSendCalls`/`lastErrorText`/`missingLines`、`capSeed`/`overflowSeed`、`enterCleanWorkspace`/`openNotesPanel`/`restoreStandardSeed`；16 个场景（40/40b/40c/41/41b/41c/41d/42/42b/42c/42d/43/44/44b/45/46）与 5 个断言组（`notes-select`/`note-ask`/`notes-chip`/`notes-context`/`anchor-cache`，全部用脚本内 `record` 的 `throw` 落地） |
| 未改动（白名单外或既定输入） | — | `pix/src/renderer/composables/useQuickAsk.ts`（A 已交付 `registerNotesAskConsumer`/`emitNotesAsk`）、`utils/reading-context.ts`、`stores/notes-store.ts`（A 面）、`stores/session-store.ts`（N49 见 D5）、`pix/src/main/**`、`pix/src/shared/types.ts`、`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**` |

### B.2 关键决策与偏差

| # | 决策 / 偏差 | 依据与影响 |
| --- | --- | --- |
| D1 | **`send()` 的笔记快照带排除分支**：`const notesSnapshot = excluded.has("notes") ? [] : [...notesStore.selectedNotes]` | 设计档 §4 失败路径第 3 行（「摘录」chip 被移除 ⇒ payload 有 `<reading_context>`、无 `reader_notes`）是功能要求；首版落地为无条件 `[...notesStore.selectedNotes]`，被场景 42c 的 `notes-chip.removed` 判红（payload 仍含 `reader_notes:`）后修正。与既有「选中文本」chip 的 `excluded.has("selection") ? "" : …` 完全同范式，仍在 §6.4 no.7 的「`notesStore.selectedNotes` 1 处 / `notes: ` 1 处」计数内 |
| D2 | 场景 42c **不承接 42 的现场，而是重建同一结束态** | 42b 按契约在末段恢复标准种子（`seedNotes` + 切标签切回触发 `loadNotes`），而切标签按 §2 情形 4 必然清空选择集 ⇒ 42c 起手无法承接 42。重建序列（开文档 → `waitPage(1,3)` → 切标签 → 选同一两行）与 42 前段逐字相同，被断言的 `removed`/`restored`/`doc-cascade`/`r7-regression` 四相全部保留 |
| D3 | 场景 43 的驱动顺序调整为 **先 `setDraft(ASK43)`、再 `selectPageSpan(2)`** | 实测取证：向聚焦中的 `.input-area` 写入值会让 document 选区收进输入框（capture 相位 `selectionchange` 日志：`{collapsed:true, text:"", anchor:"composer-box", active:"input-area composer-input"}`），`PdfViewer.onSelectionChange` 的既有清空分支随即把 `readerStore.selectedText` 置空（`setSelectedText` 调用栈落点 = `PdfViewer.vue` 的 `onSelectionChange`）⇒ 原顺序下场景 43 的 `selectedText:` 行恒缺。设计档评审 must-fix 2 的假设（「合成 click 不产生 mousedown，选区不会丢」）对 click 成立、对 textarea 写值不成立；语义断言一字未改 |
| D4 | §6.4 no.17 的 `grep -n "readingAnchorFor(" ChatPanel.vue` **期望 0 命中与本档 §3.2/§7 互斥**：ChatPanel 侧要「每帧每块一次锚点解析」，就必须有唯一调用点 | 两处冻结值不可同时满足（0 命中只能由「ChatPanel 完全不解析锚点」实现）。按语义优先落地：唯一 1 处调用点在 `buildAnswerActionView`（`answerActionViews` computed 内，每帧每块至多一次），模板内 `answerSaveTitle(`/`answerSaveDisabled(` 各 1 处且取同一 computed（另各有 1 处函数定义行，故 `grep -c` 为 2/2）。即 no.17 的「0 命中」应读作「模板 0 处直接解析」 |
| D5 | N49 的 **`stores/session-store.ts` 索引化未执行**（不在 B 白名单；A 亦已申报不在其白名单） | 后果：`grep -n findIndex pix/src/renderer/stores/session-store.ts` 仍 1 命中；场景 46 只能判**行为等价**（两轮不同页锚点 + 回滚后重发），无法判「缓存失效判据」本身（无缓存可失效）。`ChatPanel` 侧的每帧一次解析（D4）已按设计落地，缓存一旦补上不需再改 `.vue` |
| D6 | 记录一条**既有产品行为**（不在 R8 范围、本轮不改）：聚焦中的 `.input-area` 被写入值（含真实键入的第一笔）会把 document 选区收进输入框，`readerStore.selectedText` 随即清空 ⇒「选中文本」chip 与 `selectedText:` 注入在真实键入路径上极短命 | 证据同 D3；R7 语义冻结要求「既有 chip 行为/文案/移除逐字不变」，故本侧只记录，不改 `PdfViewer`/`reader-stote`，也不改注入链路。若后续要修，属另一轮（选区快照时点问题） |
| D7 | 额外新增 3 张截图：`40-notes-select-bar-left-pane.png`、`40c-notes-select-cap-left-pane.png`、`42-notes-chip-composer.png` | 命名不与场景号（`40b`/`40c`/`42b`/`42c`/`42d`）冲突；截图数 55 → 74（新增 19 张 ≥ 设计的 16 场景） |
| D8 | 场景 45 的逐字文案按实测冻结为 `stub 发送注入异常` / `stub 发送被拒绝` | `contextBridge` 原样透传渲染层抛出的 `Error.message`（既有场景 36 的 `throw` 分支同机制），无需放宽为 `includes` |
| D9 | `.notes-selection-clear` 增 `title="取消全部选择"`（设计档未冻结该 title）；`.note-select-wrap` 的 title 用 `undefined` 去除属性（Vue 对 `null/undefined` 均移除属性，`vue-tsc` 只接受 `string \| undefined`） | 细节按最小惊讶；「三态」的判定判据（属性有无）不变 |
| D10 | 选择条视觉（间距/圆角/配色）设计档未冻结，按既有 pill 与 `.note-delete`/`.comment-trigger` 风格落地；`.note-row.selected` 用 accent 边框 + `--pix-accent-light` 底，与 `.confirming` 叠加时后者胜出（样式表顺序） | 满足「不新增第三种配色」与 32 段 `headOverflow` 回归门（`.note-head` 可用宽度只少 19px，由既有 `.note-time { flex:1; min-width:0; text-overflow:ellipsis }` 吸收） |
| D11 | stub 的 `sendCalls` 在**失败注入前**记录（`throw`/`fail` 两种模式也计入计数） | 语义 = 「尝试发送」；场景 45 只读最后一条成功载荷（`resend`），不受影响；在开发档写明以免后续误读 |

### B.3 真实命令与真实输出

**命令 1（唯一工程门）**

```text
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0
```

（A.4 记的唯一 error 已由 B 的 `readContext.notes` 实参消除；改后基线 0 error。）

**命令 2（离屏取证）**

```text
$ cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
...
[ui-shot] 测量 note-ask: {"phase":"clarifying","noteAsk":{"disabled":true,"wrapTitle":"等待澄清回答时无法发起追问"}, ...}
[ui-shot] 测量 notes-context: {"phase":"prompt","missing":[],"orderOk":true,"entryBlockNoBackslash":true,"entryBlockNoIds":true,"displayText":"请对比这两处的结论。","endsWithUserText":true}
[ui-shot] 测量 anchor-cache: {"phase":"two-turns","titles":["存为笔记 · sample-paper.pdf 第 2 页","存为笔记 · sample-paper.pdf 第 3 页"]}
[ui-shot] 测量 anchor-cache: {"phase":"rollback","errorText":"stub 发送注入异常","lastTitle":"存为笔记 · sample-paper.pdf 第 3 页"}
[ui-shot] 结束：产出 74 张截图
UISHOT_EXIT=0
```

- `MANIFEST.json`：`failure: null`、`shots: 74`（改前 55：`generatedAt 2026-09-15T03:56:16Z` 的 R7 基线）。
- 新增截图 19 张：`40-notes-select-bar`、`40-notes-select-bar-left-pane`、`40b-notes-select-clear`、`40c-notes-select-cap`、`40c-notes-select-cap-left-pane`、`41-note-ask`、`41b-note-ask-keep-draft`、`41c-note-ask-clarifying`、`41d-note-ask-bar`、`42-notes-chip`、`42-notes-chip-composer`、`42b-notes-chip-overflow`、`42c-notes-chip-removed`、`42d-notes-chip-no-doc`、`43-notes-context-payload`、`44-notes-select-delete`、`44b-notes-select-delete-failure`、`45-notes-select-send-failure`、`46-anchor-cache`。
- 渲染层日志无新增警告/错误（仅既有 `[reader-state] load degraded (missing)` ×17、`save rejected (write-failed)` ×1、`load degraded (corrupt)` ×1 与 Electron CSP warning ×1、场景 45 故意注入的 `[useRpc] Command prompt failed: stub 发送被拒绝` ×1）。
- 新增五组测量计数：`notes-select` 5、`note-ask` 5、`notes-chip` 7、`notes-context` 8、`anchor-cache` 2；既有 00–11、20–24、30–36 场景全绿（含 32 段 `headOverflow` 六行全 true）。

**关键测量原文（节选，`MEASUREMENTS.json` 逐字）**

```text
notes-select | bar | {"nativeCheck":{"countText":"已选 1 条","checked":true},"countText":"已选 2 条","askText":"问 AI","clearText":"清空","selectedRows":2,"chipCount":0,"hasNotesChip":false,"barInHeader":true,"barAfterFilter":true,"noWrite":{"addCallsSame":true,"hashSame":true}}
notes-select | cap | {"countText":"已选 10 条","selectedRows":10,"row11":{"disabled":true,"wrapTitle":"最多可注入 10 条笔记，请先取消其它选择"},"afterCapClick":"已选 10 条","afterUncheck":{"disabled":false,"wrapTitle":null},"restoredRows":4}
notes-select | delete-failure | {"notice":"删除失败：笔记写入失败","countText":"已选 1 条","chip":"摘录 1 条","rows":3,"hashSame":true}
note-ask | keep-draft | {"value":"我的草稿","countText":"已选 1 条","chip":"摘录 1 条","noticeText":"已加入 1 条摘录，草稿已保留","noticeGone":true}
note-ask | no-doc | {"barAsk":{"disabled":true,"wrapTitle":"请先打开文档，摘录才会随提问注入"},"rowAsk":{"disabled":true,"wrapTitle":"请先打开文档，摘录才会随提问注入"},"afterClick":{"value":"","countText":"已选 2 条","hasNotice":false}}
notes-chip | basic | {"labels":["当前文档：sample-paper.pdf · 第 1 页","摘录 2 条"],"notesChipTitle":"本次注入 2 条笔记","removeTitle":"本次发送不使用"}
notes-chip | overflow | {"label":"摘录 3 条 · 超出上限未注入 1 条","title":"本次注入 2 条笔记；1 条因超过 8000 字符上限未注入"}
notes-chip | doc-cascade | {"hasNotesChip":false,"chipCount":0,"payload":{"hasReadingContext":false,"hasReaderNotes":false}}
notes-context | r7-regression | {"lines":{"<reading_context>":true,"page: 1":true,"pageCount: 3":true,"</reading_context>":true,"pathSuffix":true,"selectedTextLine":false},"hasReaderNotes":false,"displayText":"42c：清空选择后发送。"}
notes-context | steer | {"type":"steer","hasReaderNotes":true}
notes-context | delete-converge | {"hasReaderNotes":true,"notesCount":1,"excludesDeleted":true}
notes-context | send-failure | {"errorText":"stub 发送注入异常","userBlocksRolledBack":true,"countText":"已选 2 条","chip":"摘录 2 条"}
notes-context | send-reject | {"errorText":"stub 发送被拒绝","chip":"摘录 2 条"}
notes-context | resend | {"hasReaderNotes":true,"notesCount":2,"type":"prompt"}
```

**命令 3（临时脚本目录已清理）**

```text
$ rm -rf /tmp/pix-r8-stub && ls -d /tmp/pix-r8-stub
ls: cannot access '/tmp/pix-r8-stub': No such file or directory
```

该目录只用于「抽出 stub 模板做 `node --check`」的一次性语法预检（`EXTRACT_OK 21112` / `STUB_BUILT` / `STUB_SYNTAX_OK`），已删除。

### B.4 §6.4 只读核对（B 侧相关行）

```text
$ grep -rn "MAX_CONTEXT_NOTES\b" pix/src/renderer            → 6 行 / 3 文件（reading-context 2 + notes-store 2 + NotesPanel 2）
$ grep -rn "MAX_CONTEXT_NOTES_CHARS\b" pix/src/renderer      → 4 行 / 2 文件（reading-context 2 + ChatPanel 2：import + chip title 插值）
$ grep -rn "\b8000\b" pix/src/renderer                       → 仅 reading-context.ts:24（唯一数值引用）
$ grep -rn "selectedNoteIds" pix/src/renderer                → 仅 stores/notes-store.ts（7 行，原始集合未外露）
$ grep -rn "reader_notes" pix/src/renderer                   → 仅 utils/reading-context.ts（ChatPanel 0 命中）
$ grep -rn "registerNotesAskConsumer|emitNotesAsk" pix/src/renderer → useQuickAsk 2 / ChatPanel 2 / NotesPanel 2
$ grep -rn "replaceSelectionWith" pix/src/renderer            → notes-store 2（定义+导出）+ NotesPanel 1（唯一调用点）
$ sed -n '/^async function send(/,/^}$/p' ChatPanel.vue | grep -c … → notesStore.selectedNotes 1 / "notes: " 1 / buildReadingUserMessage( 1 / clearNoteSelection 0
$ sed -n '/function onNotesAsk/,/^}$/p' ChatPanel.vue | grep -c …    → "draft.value = " 1（空草稿分支内）/ notesStore.selectedNotes 0 / notesStore.selectedCount 1
$ grep -n "readingAnchorFor(" ChatPanel.vue                  → 1 命中（唯一解析点，见 D4；no.17 的 0 命中与 §3.2 互斥）
$ grep -n "answerSaveTitle(|answerSaveDisabled(" ChatPanel.vue → 各 2 命中（模板 1 + 定义 1，模板实参取同一 computed）
$ grep -rn ": any|as any|await import(|import(" B 侧 3 个源码文件 → 0 命中
$ grep -n "bridge()" stores/notes-store.ts                   → 仅既有 load/add/runMutation/export/reset；选择集动作不调用任何 IPC
$ git diff --stat pix/src/main pix/src/shared/types.ts       → 空；grep -c 'ipcMain.handle("notes' main/ipc-handlers.ts → 6（六通道不变）
$ git diff --stat                                            → 仅 B 4 文件 + A 3 文件（+ 新增文档）；packages/**、pix/package.json、package-lock.json、pix/build/**、electron-builder 配置 0 改动
$ git diff NotesPanel.vue                                    → groupNotesByDocument/countLabel/startDeleteConfirm/onDocumentPointerDown/备注与展开逻辑 0 改动；.note-head 四元素顺序与类名未动（diff 仅缩进位移）
$ grep -n "displayBlocks.value.splice|shift|unshift|sort|reverse" stores/session-store.ts → 0 命中
$ grep -c findIndex stores/session-store.ts                  → 1（N49 未做，见 D5）
```

### B.5 B 面自评与未验证事项

- 设计要求逐条：§1.3 chip 级联与文案、§1.4 三态可用性与草稿规则、§1.5 面板 DOM 与三态、§1.6 stub 五原语、§6.3 十六场景与五断言组 → 全部落地，由命令 2 的 74 张截图 + 五组测量 + `failure: null` 取证。
- 场景顺序耦合（§7 自评清单 3）：`40c`/`42b` 末段恢复标准种子并断言行数 4（`restoredRows:4` / `overflow-restored.rows:4`）；`41→41b→41c→41d` 为状态链（draft 与选择集逐段承接）；`44b→45` 依赖 44 的结束态；`42c` 重建结束态的理由见 D2。
- 既有链路未破坏：摘录（00–11）、备注/展开/删除二次确认（05/31–32）、跳回原文（20d/22d/32/33）、R7 存为笔记四态（30–36）、R6 续读（20–24）全部继续通过。
- 已知差异：① stub 的 `notesDelete` 仍不写 tmp+rename（原子性由主进程既有实现保证，本轮不改主进程）；② `emitUserInputRequest` 是新增取证原语（需求 N50 冻结清单外的第 6 个，设计档 §8 第 6 条已申报）；③ 本轮未实测大列表（数千块）帧率 —— N49 的 session-store 侧未做（D5），ChatPanel 侧只做了「每帧每块一次解析」的收敛。
- 未验证 1：真实鼠标/键盘输入路径下「选中文本」的存活（D6 的发现提示该路径会丢选区）—— 本轮只记录证据，未做产品行为修正（R8 明文不改 R7 语义）。
- 未验证 2：`42b` 的「3 条 ⇒ 丢 1 条」依赖 `overflowSeed` 的骨架长度（3062 字符/条：2 条 6125 ≤ 8000、3 条 9188 > 8000）；A 侧条目模板若改动，该场景的逐字 title 断言会直接判红，不静默漂移。
- 未验证 3：D4 的 grep 计数取舍未获设计档回改（§6.4 no.17 的「0 命中」与 §3.2 的「ChatPanel 每帧每块一次解析」不可同时成立），本轮按语义落地并在 D4 写明。

---

## 修复轮（代码审查 must-fix 3 条）

> 对象：`docs/pm/R8-review.md`「代码审查（R8）」§4 的三条 must-fix：① N49 未落地（`session-store.ts` 仍 `findIndex`，每帧仍 O(N²)）；② `sortNotesForContext` 落点与冻结字面不符；③ 设计档 §6.4 no.9/no.17 两条期望计数需回改。
> 结论：三条全部按「首选处置」落地 —— ① 按「数组引用变或长度变 ⇒ 整表重建」补 `blockIndexOf` 索引（`readingAnchorFor` 签名/返回类型/解析规则不变）；② `sortNotesForContext` 迁回 `utils/notes-path.ts`（函数体逐字搬迁，`reading-context.ts` 顶层 import）；③ 设计档 §6.4 两条判据按实际口径回改（纯文档）。无 IPC / 无落盘 / 无依赖 / 无主进程改动。

### F.1 改动文件清单

| 文件 | 动作（numstat） | 内容 |
| --- | --- | --- |
| `pix/src/renderer/stores/session-store.ts` | 修改（+21/-1） | N49：新增模块内 `blockIndexOf(blockId)` 与索引缓存（`anchorIndexBlocks` 存数组引用 + `byId` 存首现下标）；唯一失效判据 = 数组引用变「或」长度变 ⇒ 整表重建（`has()` 首现优先）；`readingAnchorFor` 的解析循环、签名、返回类型逐字未动（只把 `blocks.findIndex(...)` 换成 `blockIndexOf(blockId)`）；缓存注释写死「中段位移一律由替换数组承担」的约束 |
| `pix/src/renderer/utils/notes-path.ts` | 修改（+14/-0） | `sortNotesForContext` 按设计 §3.1 落点迁回（函数体与 A 面版本逐行相同），继续复用本文件 `docPathKey` |
| `pix/src/renderer/utils/reading-context.ts` | 修改（65/1；A 面为 80/1，净减 15 行） | 删除本地 `sortNotesForContext` 定义与「本轮该文件不在白名单内」的偏差注释；改为顶层 `import { sortNotesForContext } from "./notes-path"`（value import，无环） |
| `docs/pm/R8-design.md` | 修改（§6.4 + 定稿修订 F） | no.9 / no.17 两条判据按实际口径回改（纯文档，见命令 2 与 F.4） |

### F.2 关键决策与偏差

| # | 决策 / 偏差 | 依据与影响 |
| --- | --- | --- |
| F1 | 缓存按设计 §6.4 no.6 的冻结 pattern 落字面量：变量名 `byId`、判据 `byId.size !== blocks.length`、`has()` 首现优先写入 | 两条 grep（`blockIndexOf` / `byId.size !== blocks.length`）均命中；行为与「逐块 findIndex 取第一个匹配」等价（命令 4 第 6 组逐条全等） |
| F2 | 缓存注释避免出现 `findIndex` 与 `displayBlocks.value.splice/...` 字面量（改写为「与取第一个匹配的线性查找等价」「不得对 displayBlocks.value 做 splice/shift/unshift/sort/reverse 就地变更」） | §6.4 no.4/no.5 是 0 命中 grep 门；首版注释里写了字面量会把门误判为 1 命中（实测踩到并改） |
| F3 | 缓存不显式复位（`clearSession` 不加清理行） | `displayBlocks.value = []` 已是引用变 ⇒ 下一帧自动重建；不为同一目的加第二套失效逻辑（设计 §3.1「唯一失效判据」） |
| F4 | `sortNotesForContext` 采用「迁回」而非设计改判 | 代码审查 must-fix 2 的首选处置；函数体 diff 逐行相同（命令 3），行为由烟测第 1/4 组断言 |
| F5 | 判据回改只动被点名的 §6.4 no.9 / no.17 | 只做被要求的范围。另记录一处未点名的同类似项（本轮不改）：§6.4 no.1 的「`reader_notes` 只命中 `reading-context.ts`」在实现口径下还会命中两条注释（`ChatPanel.vue:117`、`NotesPanel.vue:52`）；注入实现点确实唯一，属判据字面面，供后续轮次处置 |

### F.3 真实命令与真实输出

**命令 1（唯一工程门，改动后复跑）**

```text
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0
```

**命令 2（§6.4 修复轮相关只读核对，真实输出）**

```text
$ grep -n "findIndex" pix/src/renderer/stores/session-store.ts                 → 0 命中（exit 1；no.4 达标）
$ sed -n '/function readingAnchorFor/,/^  }$/p' session-store.ts | grep -c findIndex → 0
$ grep -n "displayBlocks.value.splice|shift|unshift|sort|reverse" session-store.ts → 0 命中（no.5 达标）
$ grep -n "blockIndexOf\|byId.size !== blocks.length" session-store.ts
288:  function blockIndexOf(blockId: string): number {
290:    if (anchorIndexBlocks !== blocks || byId.size !== blocks.length) {
307:    const index = blockIndexOf(blockId);
（no.6 两处均命中）
$ grep -rn "sortNotesForContext" pix/src
utils/notes-path.ts:82  export function sortNotesForContext(notes: ReaderNote[]): ReaderNote[] {
utils/reading-context.ts:10  import { sortNotesForContext } from "./notes-path";
utils/reading-context.ts:55  const sorted = sortNotesForContext(notes);
（定义唯一、调用点唯一）
$ grep -n "readingAnchorFor(" ChatPanel.vue                                  → 515（恰 1 处，answerActionViews 内；no.17 按回改口径达标）
$ grep -rn "registerNotesAskConsumer\|emitNotesAsk" pix/src/renderer           → useQuickAsk 2 / ChatPanel 3（import+注册+置 null）/ NotesPanel 3（import+onAskNote+模板）
$ grep -rn "MAX_CONTEXT_NOTES\b" pix/src/renderer                              → 6 行 / 3 文件（不变）
$ grep -rn "MAX_CONTEXT_NOTES_CHARS\b" pix/src/renderer                        → 4 行 / 2 文件（不变）
$ grep -rn "\b8000\b" pix/src/renderer                                         → 仅 reading-context.ts:24（不变）
$ grep -rn ": any|as any|await import(|import(" 本侧 3 个源码文件              → 0 命中
$ git diff --stat pix/src/main pix/src/shared/types.ts                         → 空
$ grep -c 'ipcMain.handle("notes' pix/src/main/ipc-handlers.ts                 → 6
```

**命令 3（纯函数烟测，仓库外 `$TMP/pix-r8-fix/ctx`，跑完删除）**

```text
$ cd pix && ./node_modules/.bin/tsc -p "$TMP/pix-r8-fix/ctx/tsconfig.json"
CTX_TSC_EXIT=0
$ cd "$TMP/pix-r8-fix/ctx" && node assert.cjs
OK   1) 0) 落点：sortNotesForContext 由 notes-path 导出、reading-context 不再导出（迁回而非复制）
OK   2) 1) 真实示例逐字（A 在前 = docPathKey 升序；lines.join 无结尾换行）
OK   3) 2) notes 为空（有选区）时与 R7 输出逐字节相同
OK   4) 3) notes 为空且无选区时与 R7 输出逐字节相同
OK   5) 4) 排序四级键：docPathKey → page → createdAt → id（入参逆序仍升序）
OK   6) 5) text/comment 行内归一化：换行折叠、空 comment 不渲染
OK   7) 6) 单条超 8000：整条丢弃、无 reader_notes 行、不变式成立
OK   8) 7) 11 条防御裁剪（10+1）与中间条超限后继续尝试（序号续编）
OK   9) 8) 条目块洁净：text 内伪造 `2. doc:` 不产生新行、无反斜杠/无 id/无时间戳
checks=9 failed=0
CTX_ASSERT_EXIT=0
```

搬迁的函数体文本等价（before = 编辑前逐字命中的旧文本，after = 现文件提取）：

```text
$ awk '/^export function sortNotesForContext/,/^}$/' notes-path.ts > after-sort.txt
$ diff -u before-sort.txt after-sort.txt && echo FUNCTION_BODY_IDENTICAL=yes
FUNCTION_BODY_IDENTICAL=yes
```

**命令 4（N49 缓存烟测：真实 store + Pinia + Vue 反应式，仓库外 `$TMP/pix-r8-fix/store`）**

```text
$ cd pix && ./node_modules/.bin/tsc -p "$TMP/pix-r8-fix/store/tsconfig.json"
STORE_TSC_EXIT=0
$ cd "$TMP/pix-r8-fix/store" && NODE_PATH="E:/develop/PiX-Read/pix/node_modules" node assert.cjs
OK   1) 1) push 追加（长度变 ⇒ 重建）：两轮回答各自解析到本轮锚点
OK   2) 2) 失败回滚（filter 替换数组 ⇒ 重建）：不抛错、不返回过期下标
OK   3) 3) 流式就地字段更新（引用与长度都没变）：缓存路径仍解析正确
OK   4) 4) 裁剪（slice 替换数组 ⇒ 重建）：存活块解析正确、被裁块返回 null 不抛错
OK   5) 5) clearSession（引用变 ⇒ 重建）：旧 id 返回 null，新表可用
     blocks=5999 queries=2000 legacy=1045.1ms indexed=9.1ms ratio=115.2x
OK   6) 6) 复杂度：2000 轮对话上按 ChatPanel 取法逐块解析，与旧实现结果全等且快 5 倍以上
checks=6 failed=0
STORE_ASSERT_EXIT=0
```

（第 6 组内含 `deepEqual(current, legacy)`：索引实现与旧 `findIndex` 实现逐条结果全等；速度对比在同一持有数组上跑「2000 次查询」的两种实现。）

**命令 5（离屏取证，改动后）**

```text
$ cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
...
[ui-shot] 测量 anchor-cache: {"phase":"two-turns","titles":["存为笔记 · sample-paper.pdf 第 2 页","存为笔记 · sample-paper.pdf 第 3 页"]}
[ui-shot] 测量 anchor-cache: {"phase":"rollback","errorText":"stub 发送注入异常","lastTitle":"存为笔记 · sample-paper.pdf 第 3 页"}
[ui-shot] 结束：产出 74 张截图
UISHOT_EXIT=0
```

- `MANIFEST.json`：`failure: null`、`shots: 74`；五组 R8 测量计数与改前一致：`notes-select` 5、`note-ask` 5、`notes-chip` 7、`notes-context` 8、`anchor-cache` 2（`MEASUREMENTS` 共 84 条）；既有 00–11、20–24、30–36 全绿（含 32 段 `headOverflow` 六行 true；既知场景 33 的 pdf.js teardown flake 本轮未复现）。
- 渲染层日志无新增告警（仅既有 `[reader-state] load degraded/save rejected` 与场景 45 故意注入的 `[useRpc] Command prompt failed: stub 发送被拒绝`；`anchor-cache` 两相在索引化实现下仍逐字正确 —— 缓存若不随 `push`/`filter` 重建，标题会出现 `（按当前阅读位置）` 回退后缀）。

**命令 6（临时目录清理）**

```text
$ rm -rf "$TMP/pix-r8-fix" && ls -d "$TMP/pix-r8-fix"
ls: cannot access '/tmp/pix-r8-fix': No such file or directory
```

### F.4 修复轮自评与未验证事项

- must-fix 1（N49）：落地。`grep findIndex` 0 命中、`blockIndexOf` / `byId.size !== blocks.length` 命中、`displayBlocks.value` 无就地中段变更；失效覆盖表逐行由命令 4 的 1–5 组取证（push / filter / slice / clearSession 重建，流式就地更新不重建）；「消掉每帧二次方开销」的量化证据 = 同数组 2000 次查询 1045.1ms → 9.1ms（115.2x，结果与旧实现全等）。
- must-fix 2（落点）：落地。`utils/notes-path.ts` 定义、`utils/reading-context.ts` 顶层 import，函数体逐行相同（命令 3），行为由烟测第 1/4 组断言。
- must-fix 3（文档口径）：落地。`docs/pm/R8-design.md` §6.4 no.9/no.17 已按实际口径回改，并新增「定稿修订 F」记录回改理由。
- 未验证 1：N49 的真实**帧率**未测（本轮只做「每帧每块一次解析」的复杂度对比与 O(1) 查表行为等价；与设计 §7 自评清单第 4 条同口径）。
- 未验证 2：`MAX_DISPLAY_BLOCKS` 裁剪要积累 20000 块才可达，烟测用 20000 个 `appendError` 块构造（块类型分布与真实会话不同，覆盖的是同一条 `slice` 路径）。
- 未验证 3：离屏本轮 1 次全绿；既知场景 33 的 pdf.js worker teardown 竞态（非 R8 引入）本轮未复现，仍属观察项（沿用审查 §6 观察项 2）。
- 备注：§6.4 no.1 的字面判据在实现口径下仍会命中两条注释（`ChatPanel.vue:117`、`NotesPanel.vue:52`）—— 本轮 must-fix 未点名，保持原样（见 F.2/F5）。

---

## 终验

> 执行者：终验（独立验收，只采信本轮自己跑出来的结果）。对象：工作区未提交的 R8 变更（9 个源码/脚本文件 + 4 份文档）。
> 结论：**通过** —— check 0 error、git 卫生干净、离屏 74 张且 `MANIFEST.failure=null`、五组断言全绿、无未销账 must-fix。残余项只有需求档 2 条字面待回改（设计档 §8 已申报）与 3 条不可判定/未构造项，见 V.6。

### V.1 工程门与仓库卫生（真实命令）

```text
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
CHECK_EXIT=0（无输出）

$ git status --short
 M pix/scripts/ui-shot.mjs
 M pix/src/renderer/components/workspace/ChatPanel.vue
 M pix/src/renderer/components/workspace/NotesPanel.vue
 M pix/src/renderer/composables/useQuickAsk.ts
 M pix/src/renderer/pages/WorkspacePage.vue
 M pix/src/renderer/stores/notes-store.ts
 M pix/src/renderer/stores/session-store.ts
 M pix/src/renderer/utils/notes-path.ts
 M pix/src/renderer/utils/reading-context.ts
?? docs/pm/R8-design.md
?? docs/pm/R8-dev.md
?? docs/pm/R8-req.md
?? docs/pm/R8-review.md

$ git diff --stat -- packages/                              → 空
$ git diff --stat -- pix/package.json pix/package-lock.json  → 空
$ git diff --stat -- pix/src/main pix/src/shared             → 空
$ git diff --stat                                            → 9 文件，1593 insertions(+)，83 deletions(-)
$ grep -c 'ipcMain.handle("notes' pix/src/main/ipc-handlers.ts → 6
```

工作区状态与开发/修复轮申报一致：改动全部落在需求档 §4 白名单内（含 `stores/session-store.ts`，修复轮补 N49），`packages/**`、依赖与 lockfile、主进程与共享类型、构建配置零改动；本轮终验未执行任何 git 写命令。

卫生备注：终验自己的仓库外编译第一次因 tsconfig 双盘符根目录推断失败时，误落了一个未跟踪产物 `pix/src/shared/types.js`（181 B，非源码，未被任何导入解析到），已即时删除；删除后复跑工程门仍为 `FINAL_CHECK_EXIT=0`，最终 `git status --porcelain --untracked-files=all` 中无任何 `.js` 残留。

### V.2 离屏取证（真实命令与产物）

```text
$ cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
[ui-shot] 结束：产出 74 张截图
UISHOT_EXIT=0
```

- `MANIFEST.json`：`failure: null`、`shots: 74`（改前 R7 基线 55，新增 19 张）。本次运行的 74 张 PNG 全部写于本次时间窗内；同名目录里另有一张 13:23 的 `99-failure-state.png` 是上一次运行残留（未进入本次清单）。
- `MEASUREMENTS.json`：84 条记录，五组 R8 断言全绿 —— `notes-select` 5 / `note-ask` 5 / `notes-chip` 7 / `notes-context` 8 / `anchor-cache` 2；取值与设计档 §6.3 冻结字面量逐字一致，含 `已选 10 条`、`最多可注入 10 条笔记，请先取消其它选择`、`摘录 3 条 · 超出上限未注入 1 条`、`本次注入 2 条笔记；1 条因超过 8000 字符上限未注入`、`已加入 1 条摘录，草稿已保留`、`等待澄清回答时无法发起追问`、`请先打开文档，摘录才会随提问注入`、`删除失败：笔记写入失败`。
- 既有 00–11、20–24、30–36 场景全部继续通过（断言以脚本内 `throw` 落地：`if (failures.length) throw new Error(...)`，退出码 0 即全绿）；32 段 `headOverflow` 六行全 `true`。

### V.3 独立复核注入文本（仓库外临时 harness，21 组断言）

方法：把工作区当前的 `utils/{reading-context,notes-path}.ts` 与 `git show HEAD:` 的 R7 版 `reading-context.ts` **分别独立编译**（仓库外 tsconfig，`@shared/*` 经 `paths` 指向 `pix/src/shared/*`，`files` 含 `renderer/types/ipc.ts` 以解 `window.pixApi`），node 直接 `require` 产物断言；临时目录跑完删除。

```text
TSC_CUR_EXIT=0 / TSC_HEAD_EXIT=0
=== [1] 两条笔记（一条有备注 + 一条来自另一文档）+ 选中文本 ===
<reading_context>
path: C:\Users\86157\AppData\Local\Temp\pix-r5\library\sample-paper.pdf
page: 2
pageCount: 3
selectedText:
which confirms the mask is doing more than sparsification.
reader_notes:
1. doc: archive/older-paper.pdf
   page: 7
   kind: excerpt
   text: Section 4. Reproducibility: all runs use three seeds and report the median.
2. doc: sample-paper.pdf
   page: 1
   kind: excerpt
   text: We study retrieval over long documents where the attention budget is the binding constraint.
   comment: 与第 3 节消融实验对照
</reading_context>

请对比这两处的结论。<EOF>
    length=553，结尾换行=false
checks=21 failed=0
ASSERT_EXIT=0
```

| # | 复核项 | 结果 |
| --- | --- | --- |
| 1 | 与设计档 §1.2 真实示例逐字节相等（冻结排序 `archive/` 在前）；入参顺序颠倒后输出不变 | OK |
| 2 | 与需求档 §0.1 示例（`sample-paper` 在前）不相等 —— 即设计档 §0 修订 3 / §8 第 3 条已申报的字面冲突（实现取冻结排序） | 已申报 |
| 3 | R7 逐字节回归：6 个用例（有/无选区、空白选区、空 userText、`filePath=null` 早退、非 PDF）与 HEAD 实现输出**逐字节相同**，且 `notes: []` 时无 `reader_notes:` 行 | OK |
| 4 | 边界：标定骨架 62 字符/条 ⇒ 恰好 8000 装入 1/丢弃 0、`entries.join("\n").length === 8000`；8001 ⇒ 装入 0/丢弃 1、输出无 `reader_notes:` | OK |
| 5 | 中间条（9000 字符）整条丢弃后**继续尝试**第 3 条：`injected=[s1,s3]`、`dropped=[big]`、序号续编 `1.`/`2.` 无空洞、装入文本与入参逐字相等（无截断） | OK |
| 6 | 单条自身超限 ⇒ 装入 0/丢弃 1；11 条 ⇒ 防御式装入 10/丢弃 1，不变式 `injected+dropped === 入参长度` | OK |
| 7 | 排序：四级键（`docPathKey`→`page`→`createdAt`→`id`）生效、两次调用结果相同、**入参不被就地修改** | OK |
| 8 | 归一化：`comment: "第一行\n\n第二行  "` ⇒ `   comment: 第一行 第二行`；空/纯空白 comment 不渲染该行；脏 `text` 折叠为单行；`text` 内伪造 `2. doc:` 不产生新行（4 行条目） | OK |
| 9 | 条目块洁净：`reader_notes:` 之后无反斜杠 / 无 `C:` / 无 id / 无 `createdAt`/`updatedAt` | OK |
| 10 | 非 PDF（`pageCount: 0`）：`path`/`page: 1` 照旧，`doc:` 取笔记自身 `docPath`；`kind: answer` 不被过滤 | OK |

### V.4 关键契约的只读复核（真实 grep/读数）

```text
$ grep -n "findIndex" pix/src/renderer/stores/session-store.ts                        → 0 命中（exit 1）
$ grep -n "blockIndexOf|byId.size !== blocks.length" session-store.ts                 → 288 / 290 / 307 三处命中
$ grep -n "displayBlocks.value.splice|shift|unshift|sort|reverse" session-store.ts    → 0 命中
$ grep -rn "selectedNoteIds" pix/src/renderer                                          → 仅 stores/notes-store.ts（7 行，原始集合未外露）
$ grep -rn "MAX_CONTEXT_NOTES\b" pix/src/renderer                                     → 6 行 / 3 文件（reading-context 2 + notes-store 2 + NotesPanel 2）
$ grep -rn "MAX_CONTEXT_NOTES_CHARS\b" pix/src/renderer                               → 4 行 / 2 文件（reading-context 2 + ChatPanel 2）
$ grep -rn "\b8000\b" pix/src/renderer                                                → 仅 reading-context.ts:24（定义行）
$ grep -rn "reader_notes" pix/src/renderer                                             → reading-context.ts 实现 1 行 + 2 条注释（ChatPanel:117、NotesPanel:52，F.5 已申报）
$ grep -rn "registerNotesAskConsumer|emitNotesAsk" pix/src/renderer                   → useQuickAsk 2 / ChatPanel 3 / NotesPanel 3（与回改后的 §6.4 no.9 一致）
$ grep -rn "replaceSelectionWith" pix/src/renderer                                     → notes-store 定义 1 + 导出 1 + NotesPanel 调用 1（ChatPanel 0）
$ grep -n "readingAnchorFor(" ChatPanel.vue                                            → 恰 1 处（515，answerActionViews 路径内）
$ sed -n '343,410p' ChatPanel.vue（send 区间）… selectedNotes 1 / "notes: " 1 / buildReadingUserMessage( 1 / clearNoteSelection 0
$ grep -n ": any|as any|await import(|import(" 7 个改动源码文件                          → 0 命中
$ grep -n "sortNotesForContext" pix/src/renderer                                       → 定义在 notes-path.ts:82、reading-context.ts 顶层 import + 调用（唯一实现点）
$ ./node_modules/.bin/tsc -p <仓库外 tsconfig>（当前版 / HEAD 版）                     → TSC_CUR_EXIT=0 / TSC_HEAD_EXIT=0
```

读代码另核到：`.notes-selection-bar` 的渲染条件为 `status === "ready" && hasNotes && selectedCount > 0`，位于 `.notes-header` 内、`.notes-filter` 之后；`.note-select-wrap` 是唯一处理器落点（`@click.stop=toggleNoteSelected`），`.note-select` 本体只有 `:checked`/`:disabled`；`.note-ask` 本体带 `:disabled` 且 `@click.stop`；两个 `title` 都挂在包裹元素；`askDisabledTitle` 为三态优先级（`clarifying` → 无文档 → 无 title）；`send()` 内快照 `notesSnapshot` 在 `appendOptimisticUserMessage` 之前、与 `readContext`/锚点同一同步段；`onNotesAsk` 内恰一处 `draft.value =`（且在空草稿分支内）；`blockIndexOf` 以「引用变或长度变」唯一判据整表重建（`has()` 首现优先）；`.note-head` 四元素顺序/类名与 `.note-head` 内部 DOM 零改动（`git diff` 仅缩进位移）。

### V.5 截图证据（本轮实际读取）

| 截图 | 看到的内容 |
| --- | --- |
| `40-notes-select-bar-left-pane.png` | 头部「共 4 条」下出现选择条 `已选 2 条 / 问 AI / 清空`（位于「仅看当前文档」开关之后）；两行（`older-paper.pdf` 第 7 页、`sample-paper.pdf` 第 1 页）复选框勾选且行态高亮；每行底部右对齐出现「追问」；分组头/页码徽标/AI 徽标/备注/展开全文/删除均原样 |
| `42-notes-chip-composer.png` | composer 上方 chip 行：「当前文档：sample-paper.pdf · 第 1 页 ×」+「摘录 2 条 ×」（笔记本图标，复用既有 chip 结构与移除控件） |
| `40c-notes-select-cap-left-pane.png` | 12 条 `容量样本 1..12` 场景：先选 10 条后计数 `已选 9 条`（取消第 1 条后的相位）；面板行结构与选择控件正常，未见布局溢出 |
| `42c-notes-chip-removed.png` | 全窗：左栏选择条 `已选 2 条 / 问 AI / 清空`、右栏 composer 两 chip 并存、中栏 PDF 与页码 `第 1 / 3 页` 正常；三栏布局与既有 UI 无可见回归 |
| `03-notes-current-doc.png`（既有场景 03） | 未选任何笔记时 composer 只有「当前文档」chip、无「摘录」chip（N45-7）；面板既有元素（分组、当前文档 chip、页码徽标、相对时间、删除、备注、展开、AI 徽标）与新增复选框/追问共存，无换行或溢出 |

### V.6 逐条验收判定（N43–N51）

| 条目 | 判定 | 证据 |
| --- | --- | --- |
| N43-1/2/3/10 | 通过 | 选择集只在 store；派生于 `notes.filter`；`.note-select-wrap` 单一处理器 + `.note-select` 纯受控；`.note-head` 零改动；场景 40 `nativeCheck`（点本体恰切换一次） |
| N43-4/5/8 | 通过 | `.note-row.selected` 与既有 `.confirming` 叠加（后者在样式表后者胜出）；40/40b 逐字；44 删除收敛 + 44b 删除失败（`删除失败：笔记写入失败`、`hashSame:true`） |
| N43-6/7 | 通过 | 40b `barCount:0/selectedRows:0`；40c `已选 10 条`、第 11 条 `disabled` + 逐字 title、取消后可再选、`restoredRows:4` |
| N43-11 | 通过 | 场景 40/40b `noWrite.addCallsSame:true` + `hashSame:true`（选择/清空过程 `notes.json` 字节不变且零 IPC） |
| N44-1/2/3 | 通过 | seam 仅 `useQuickAsk.ts`；选择条模板直接 `emitNotesAsk()`；唯一 `onNotesAsk`；区间内仅 1 处 `draft.value =` |
| N44-4/5/6/7 | 通过 | 41（模板 + `activeHasInputArea` + chip）、41b（草稿不变 + 提示行 + 替换为 1 条）、41d（选择条入口保持 2 条） |
| N44-8/9/10 | 通过 | `replaceSelectionWith` 返回 `false` 即零副作用（走查）；场景 43 steer 相位 `{type:"steer",hasReaderNotes:true}`；既有文件零改动 |
| N45-1/2/5/8 | 通过 | chip 与载荷同源；级联判据静态成立；既有 chip 行为未动（既有场景全绿） |
| N45-3/4/6/7 | 通过 | 42/42b 逐字 label+title；42c `removed`（无 `reader_notes`）+ `restored` + `doc-cascade`（两 chip 同时消失、payload 无 `reading_context`） |
| N46-1/2/3/5/9 | 通过 | V.3 的 1/3/4/5/10 组（逐字节模板、R7 逐字节回归、序号连续、洁净性、非 PDF） |
| N46-4/6/7/8 | 通过 | 归一化 + 唯一实现点（`sortNotesForContext` 已迁回 `notes-path.ts`）；场景 43 `missing:[]`、`orderOk`、`displayText`、`endsWithUserText`；`pix/src/main`、`reading-prompt.ts`、`skills/**` 零改动 |
| N47-1..8 | 通过 | V.3 的 4/5/6/7 组；常量单点且带来源注释；42b 逐字 title；42 两条短种子全装入 |
| N48-1..7 | 通过 | send 区间 1/1/1/0；快照位置在乐观块之前；三个排除分支由 42c/42d/43 覆盖；45 发送失败保留 + 重发注入 2 条；steer 注入 |
| N49-1..6 | 通过 | `findIndex` 0 命中、缓存判据两处命中、无就地中段变更；`readingAnchorFor` 签名/返回类型/解析规则零改动；`anchor-cache` 两相（第 2/3 页两轮 + 回滚后重发，均无回退后缀）；每帧每块一次解析（唯一 1 处调用点）；开发档 F.4 写明复杂度、失效策略与未实测帧率 |
| N50-1..4/6 | 通过 | 五个 stub 原语在册（+ 脚本侧 `setDraft`/`sendViaEnter`/`answerTitleFromEnd(n)`）；16 个场景、19 张新截图；五组断言全绿 |
| N51-1..7 | 通过 | 74 ≥ 55；check 0；白名单内 diff；主进程/共享类型零改动 + IPC 六通道；`notes.json` 只读（哈希不变）；新导出均有调用点（无死代码） |

**未判定 / 不可判定项（3 条）**：

1. **N43-9「非 ready 态」**——设计档 §0 修订 1 已删除「非 ready 清空」，产品内不存在「ready + 有选择集 → loading/error」的可达路径，该条断言的判别力已被设计档判为恒真；终验只静态核到「bar 仅在 `status === "ready"` 时渲染」。
2. **N50-5 的失败支路**（失败场景落 `99-failure-state.png` + 退出码 1）——本轮无失败，未主动注入以验证取证面的失败行为；目录里 13:23 的 `99-failure-state.png` 是上一次运行残留，不能作为本轮证据。
3. **大列表真实帧率**——与设计档 §7 自评清单第 4 条同口径，本轮只核到复杂度收敛与 O(1) 查表的行为等价（真实帧率未测）。

**需求档待回改项（2 条，均已在设计档 §8 申报，非实现缺陷）**：

1. N45-3 的 chip `title` 字面量缺「笔记」二字 —— 实现按 §0.2 冻结值 `本次注入 P 条笔记；M 条因超过 8000 字符上限未注入`（场景 42b 逐字命中）。
2. §0.1 示例的条目顺序与 §0.2 冻结排序相反 —— 实现按冻结排序（`archive/older-paper.pdf` 在前），V.3 第 1/2 组即该冲突的判别证据。

### V.7 结论

- 唯一工程门 0 error；git 卫生干净（白名单内 9 文件 + 4 份文档，依赖/主进程/构建配置零改动）；离屏退出码 0、74 张、`failure:null`、R8 五组断言全绿、既有场景与 `headOverflow` 回归门全绿。
- 前两轮提出的 3 条代码审查 must-fix（N49 索引化、`sortNotesForContext` 落点、设计档 §6.4 两条判据口径）已在工作区落地并由本轮独立复核确认销账，**无未销账 must-fix**。
- 需求档 2 条字面冲突与 3 条不可判定项已在设计档/本档登记，属档面待办而非实现缺陷，不阻断本轮验收。
- 观察项（不影响结论）：既有场景 33 的 pdf.js worker teardown 竞态为已知 flake，本轮一次运行全绿、未复现。
