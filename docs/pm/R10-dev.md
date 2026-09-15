# R10 开发档 · 规模可用（N63–N72）

> 上游：`docs/pm/R10-design.md`（定稿，契约以此为准）、`docs/pm/R10-req.md`、`docs/pm/R10-review.md`、`docs/pm/PRD-V0.4.md` §2/§4/§7.5。
> 本档只记录实现事实：改动文件、关键决策与偏差、真实命令与真实输出、逐条自评、未验证事项。
> 分工：**开发 A（契约与数据面）** 见下；开发 B（界面与取证面）另行追加「## 开发 B」一节。

---

## 开发 A（契约与数据面）

### A.1 改动文件清单

| 文件 | 动作（numstat） | 内容 |
| --- | --- | --- |
| `pix/src/main/notes-store.ts` | 修改（+53/-2） | 设计档 §1.2 全部：`undoSlot`（内存态、只存最近一条、不落盘）+ 三条专有文案常量（`RESTORE_EMPTY_MESSAGE` / `RESTORE_EXISTS_MESSAGE` / `RESTORE_DUPLICATE_MESSAGE`）+ `restoreFailure` 形态助手；`deleteNote` 改为 `findIndex` 定位（下标与 `not-found` 同源）、写盘成功后覆盖式设槽并回传 `note`；新增 `restoreNote`（校验①no-root →②无槽 →③id 不符 →④跨库 →⑤读失败既有码透传 →⑥同 id 占用 →⑦同去重键占用；还原按 `Math.min(slot.index, notes.length)` 原下标插回原对象、`writeFileAtomic` + `serializeNotes`、不刷新 `updatedAt`；成功才清槽）；`resetCorruptNotes` 成功才清槽。读-改-写仍全同步、同一函数体内零 `await` |
| `pix/src/main/ipc-handlers.ts` | 修改（+3/-1） | 新通道 `notes-restore`：`ipcMain.handle("notes-restore", (_event, id: unknown) => (isNoteId(id) ? restoreNote(id) : invalidNotesInput()))`（复用 `isNoteId` / `invalidNotesInput`，其余通道零改动） |
| `pix/src/main/preload.ts` | 修改（+2/-0） | `PixApi.notesRestore: (id: string) => Promise<ReaderNotesMutationResult>` + `ipcRenderer.invoke("notes-restore", id)`（notes 系列其余 6 个方法签名零改动） |
| `pix/src/renderer/utils/notes-view.ts` | **新建**（88 行） | 设计档 §1.4 全部：3 类型（`NotesSortMode` / `ListEmptyReason` / `ListEmptyInput`）、3 常量（`UNDO_WINDOW_MS=5000` / `UNDO_ROW_MS=8000` / `UNDO_EXPIRED_MESSAGE` 逐字）、7 函数（`normalizeQuery` 唯一 trim 点、`matchesSearch` 唯一匹配实现、`sortNotesForView`、`applyViewToGroups` 唯一搜索+排序管道、`buildNoteCopyFragment`、`resolveListEmptyReason`、`isUndoExpired`）。不 import Vue/Pinia/组件/store，无 `any`，无内联动态 import |
| `pix/src/renderer/stores/notes-store.ts` | 修改（+101/-3） | 设计档 §1.3 全部：字段 `searchQuery`（原串）/ `sortMode` / `pendingUndo`；派生 `activeQuery`（唯一 trim 来源）/ `searchActive` / `visibleCount`；`groups` 改走 `applyViewToGroups(groupNotesByDocument(…), activeQuery, sortMode)`；动作 `setSearchQuery` / `clearSearchQuery` / `setSortMode` / `clearPendingUndo` / `undoDelete`（三态 + 两条守卫，`stale` 在 `applyNotes` 之前返回）；`undoScope` 令牌（`resetNotes()` 内 +1）；`removeNote` 自定义（成功先 `applyNotes`，缺 `note` 载荷非静默）；`resetNotes()` 追加四项复位。选择集语义、`applyNotes`、`loadNotes` 竞态、`focusChapter` / `clearChapterFilter` / `chapterFocusToken` 零改动 |
| `docs/pm/R10-dev.md` | 新增（本档） | 「## 开发 A」一节（B 面另行追加） |
| `%TEMP%/pix-r10-smoke/**` | 临时（已删除） | 仓库外烟测：`tsconfig.main.json` + `smoke-main.cjs`（3 组 × 22 条断言）、`tsconfig.view.json` + `smoke-view.cjs`（7 组 × 9 条断言）+ 临时工作区；跑完 `rm -rf`，仓库内零残留、不新增 npm scripts |
| 未改动（零 diff） | — | `pix/src/shared/types.ts`（复用既有契约，无需新类型）、`pix/src/renderer/utils/notes-path.ts`、`pix/src/main/library-root.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue` 与 `pix/scripts/ui-shot.mjs`（B 面）、`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置 |

### A.2 关键决策与偏差

| # | 决策 / 偏差 | 依据与影响 |
| --- | --- | --- |
| D1 | **纯函数模块落点为 `pix/src/renderer/utils/notes-view.ts`（新建）**；角色摘要的白名单行写作 `pix/src/renderer/utils/notes-path.ts`，该文件按设计档保持零 diff | 设计档 §1.4/§1.5 冻结模块路径与 13 个导出名、§5 与 §8.5 明确 `notes-path.ts` **不改**（冻结文件零 diff 走查）、§8.3 冻结烟测 `require` 路径 `out-view/renderer/utils/notes-view.js`。按「契约与设计档逐字一致」以设计档为准；把搜索/排序写进 `notes-path.ts` 会同时违反三处冻结 |
| D2 | **渲染层 store（`stores/notes-store.ts`）由 A 落地**（设计档 §9 把该文件列在 B 面） | 本次角色摘要的 A 交付面含「渲染层 store 的搜索/排序视图状态与派生」，且 A 白名单显式含该文件；B 面只消费 §1.3 冻结的字段与动作签名（`searchQuery` / `activeQuery` / `searchActive` / `sortMode` / `pendingUndo` / `visibleCount` / `setSearchQuery` / `clearSearchQuery` / `setSortMode` / `undoDelete` / `clearPendingUndo`），接口未改动 |
| D3 | `restoreNote` 内先取 `const slot = undoSlot` 快照再做七步校验 | 与设计档字面 `undoSlot.index` / `undoSlot.note` 语义等价（同一对象、同一时刻），规避模块级可变变量在多次函数调用后的类型窄化歧义；行为与 §1.2 校验顺序逐条一致 |
| D4 | `deleteNote` 的「不存在」判定由 `filter` 前后长度比较改为 `findIndex` + `index < 0` | 下标必须与 `not-found` 判定同源（设计档 §1.2 要求 `index` 由 `read.file.notes.findIndex(...)` 得出、与 `filter` 同一份读结果）；对外语义（`not-found` 码）逐字不变 |
| D5 | 无其它偏差：IPC 通道名、入参守卫、错误码与三类逐字文案、槽的设/清/保留矩阵、`removeNote` 缺载荷文案、`undoDelete` 三态与两条守卫顺序、`resetNotes` 四项复位，均按设计档字面实现 | 设计档 §1.1/§1.2/§1.3/§3.3、修订 2/7/10 |

### A.3 烟测用例（仓库外临时目录，跑完删除）

编译与运行全部在 `C:\Users\86157\AppData\Local\Temp\pix-r10-smoke`（`%TEMP%`），仓库内零脚本、零产物、零 npm scripts 变更。

**主进程数据面（设计档 §8.2，`tsconfig.main.json` + `smoke-main.cjs`，3 组 22 条）**

| 组 | 步骤 | 断言（全部实跑通过） |
| --- | --- | --- |
| `undo-roundtrip` | `setLibraryRoot(ws-a)` → `addNote`×3（不同页/类型）→ 记字节哈希 → `deleteNote(中间那条)` → `restoreNote(该 id)` → 再 `restoreNote` 同 id | 删除即时落盘（哈希变化、文件里该 id 消失）、`note` 载荷必在且 id/page/text 与目标一致；还原 `success===true`、文件**逐字节等于删除前**（哈希相等 ⇒ 同下标插回、`updatedAt` 未刷新）、文件 id 序列回 `[n1,n2,n3]`、回传对象 `JSON.stringify` 等于删除前；二次还原 ⇒ `not-found` + `没有可撤销的删除` |
| `undo-failures` | ① 无槽 `restoreNote`；② 槽内 id 不符；③ 设槽后 `setLibraryRoot(ws-b)` 再还原；④ 同 id 占用（删 X → 原文件写回含 X）；⑤ 同去重键占用（删 X → 写入同 `docPath/page/kind/text`、新 id 条目）；⑥ `mkdirSync(notes.json.tmp)` 写失败注入 + 重试 + 清理后重试；⑦ 外部删除 `notes.json` 后还原 | ①②③ 均 `not-found` + 逐字 `没有可撤销的删除`，且零写盘、另一库不创建（`ws-b/.pix-read` 不存在）、A 库字节不变；②③ 失败后同一槽仍可成功还原（失败不清槽）；④ `invalid-input` + `该笔记已重新存在，无法撤销`、零写盘、无两条同 id；⑤ `invalid-input` + `该笔记内容已重新存在，无法撤销`、零写盘、**无两条同去重键条目**；⑥ `write-failed` + `笔记写入失败`、原文件字节不变、注入仍在时重试仍失败、清理注入口后重试成功且字节回复删除前；⑦ 按既有 ENOENT 语义成功写出「只含该条」的文件（点名一次，非本轮回归） |
| `undo-slot-lifecycle` | ① 设槽后 `updateNoteComment(另一条)` + `addNote` 再还原；② 失败的 `deleteNote("missing-id")` 后还原；③ 连删 A、B 后先还原 A 再还原 B；④ 设槽后写坏文件 → `resetCorruptNotes()` → 还原旧 id；⑤ 设槽后（文件未损坏）`resetCorruptNotes()` → 还原 | ① 仍可还原、新条目保留、备注保留、按原下标插回；② 失败删除不清槽、原槽仍可还原；③ 旧 id ⇒ `not-found`、新槽 ⇒ 成功（覆盖式，只存最近一条）；④ 重建成功后槽已清（重建前删除的条目不得被悄悄写回）+ 备份文件存在；⑤ `not-corrupt` 失败不清槽、仍可还原 |

**纯函数（设计档 §8.3，`tsconfig.view.json` + `smoke-view.cjs`，7 组 9 条）**

| 组 | 覆盖的断言 |
| --- | --- |
| `search-basic` | `TABLE 2` 命中 `n-current-2`（大小写不敏感）、`消融` 命中 `n-current-1`（备注）、`Table 2 reports` 命中原文、`稀疏注意力` 命中 `n-current-3`；`""` / `"   "` / `"\t\n"` 恒真；`消融 实验` 不命中（内部空白不折叠）；`sample-paper.pdf` / `n-current-2` / `7` 对全部 4 条都不命中（docPath/id/page 不参与）；`normalizeQuery("  a b  ") === "a b"` |
| `search-and-filter` | 4 条样本 × query∈{`""`,`Table`,`zzz`} × range∈{null,`[2,2]`,`[1,1]`} × onlyCurrent∈{false,true}：`applyViewToGroups(groupNotesByDocument(...))` 的可见集合恒等于朴素参照（`matchesSearch` ∧ `matchesChapterFilter` ∧ 文档归属）交集；章节区间生效时开关不改变集合；`applyViewToGroups` 前后入参 `JSON.stringify` 相等（组数组/组对象/notes 数组不被修改）；0 可见组整组丢弃；组顺序与入参逐键相同 |
| `sort-default` | `sortNotesForView(list,"page")` 与朴素参照（page→createdAt）逐字段相等；与 `groupNotesByDocument` 组内旧顺序逐字段相等；调用前后入参数组顺序不变 |
| `sort-created` | `createdAt` 降序 `[n-current-3, n-current-2, n-current-1]`；同刻按 id 升序；分组顺序与 `"page"` 模式逐键相同；不原地修改入参 |
| `empty-reason` | 五个判别值逐条；`query="   "` 且 `V=0` 且章节过滤生效 ⇒ `"chapter"`（空白不算搜索生效）；搜索类优先于章节/文档两态；`V>0` ⇒ `null`；无维度且 `V=0` ⇒ `null` |
| `copy-fragment` | 四段逐字（长文单行 / 多行逐行 `> ` 前缀且行间无空行 / answer 末尾 ` · AI 结论` / `archive/older-paper.pdf` ⇒ 显示名 `older-paper.pdf`）；无尾随换行；片段不含 `comment` 与 `id` |
| `undo-expiry` | `isUndoExpired(t, t+4999) === false`、`+5000`、`+5001` 均 `true`；`UNDO_WINDOW_MS===5000`、`UNDO_ROW_MS===8000`、`UNDO_EXPIRED_MESSAGE` 逐字；另断言 7 函数 + 3 常量导出名齐备 |

### A.4 真实命令与真实输出

**命令 1（唯一工程门，改动后）**

```text
$ cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check

> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0
```

（改前同命令基线亦为 `EXIT_CODE=0`，先跑后改。）

**命令 2（主进程烟测编译 + 运行）**

```text
$ cd pix && ./node_modules/.bin/tsc -p "C:/Users/86157/AppData/Local/Temp/pix-r10-smoke/tsconfig.main.json"
TSC_EXIT=0
# 产出恰为 3 个文件（rootDir 显式冻结）：
#   out-main/main/notes-store.js、out-main/main/library-root.js、out-main/shared/types.js

$ cd "C:/Users/86157/AppData/Local/Temp/pix-r10-smoke" && node smoke-main.cjs
R10 主进程烟测 · undo-roundtrip / undo-failures / undo-slot-lifecycle

[undo-roundtrip]
  ok   删除即时落盘、目标 id 消失、note 载荷必在
  ok   还原成功且文件逐字节回复删除前
  ok   再次还原同 id ⇒ not-found + 没有可撤销的删除

[undo-failures]
  ok   无槽 ⇒ not-found + 逐字 没有可撤销的删除
  ok   槽内 id 不符 ⇒ not-found + 同一文案、零写盘
  ok   id 不符的失败不清槽：原 id 仍可还原
  ok   跨工作区 ⇒ not-found 且另一库零改动
  ok   跨库失败不清槽：切回原库仍可还原
  ok   同 id 占用 ⇒ invalid-input + 该笔记已重新存在，无法撤销、零写盘
  ok   移除占用条目后同一槽可成功还原（槽保留）
  ok   同去重键（新 id）⇒ invalid-input + 该笔记内容已重新存在，无法撤销、零写盘
  ok   移除同键条目后同一槽可成功还原（槽保留）
  ok   notes.json.tmp 预置为目录 ⇒ write-failed + 笔记写入失败、原文件字节不变
  ok   注入仍在 ⇒ 重试仍 write-failed（槽保留）
  ok   清理注入口后重试成功且文件字节回复删除前
  ok   外部删除 notes.json 后还原：按空库写出只含该条的文件（既有 ENOENT 语义，非本轮回归）

[undo-slot-lifecycle]
  ok   updateNoteComment / addNote 不清槽：仍可还原且新条目保留
  ok   失败的删除（not-found）不清槽：原槽仍可还原
  ok   槽被更晚的成功删除覆盖：旧 id ⇒ not-found
  ok   新槽可还原
  ok   成功重建清槽：重建前删除的条目不得被悄悄写回
  ok   失败的重建（not-corrupt）不清槽：仍可还原

通过 22 项，失败 0 项
SMOKE_MAIN_EXIT=0
```

**命令 3（纯函数烟测编译 + 运行）**

```text
$ cd pix && ./node_modules/.bin/tsc -p "C:/Users/86157/AppData/Local/Temp/pix-r10-smoke/tsconfig.view.json"
TSC_EXIT=0
# 产出：out-view/renderer/utils/notes-view.js、out-view/renderer/utils/notes-path.js、out-view/shared/types.js

$ cd "C:/Users/86157/AppData/Local/Temp/pix-r10-smoke" && node smoke-view.cjs
R10 纯函数烟测 · notes-view.ts + notes-path.ts
  ok   模块导出名齐备（7 函数 + 3 常量）

[search-basic]
  ok   大小写不敏感 + 原文命中 / 备注命中 / 不折叠内部空白 / 不匹配元数据

[search-and-filter]
  ok   4 条样本 × 3 query × 3 章节区间 × 开关 的可见集合恒等于交集（朴素参照）
  ok   applyViewToGroups 不修改入参、丢弃空组、组顺序原样

[sort-default]
  ok   page 模式与朴素参照逐字段相等、不原地修改入参、与旧分组行为一致

[sort-created]
  ok   created 模式降序、同刻按 id 升序、组顺序不变、不原地修改入参

[empty-reason]
  ok   五个判别值 + 优先级 + 空白不算搜索生效 + 非 0 行为 null

[copy-fragment]
  ok   四段逐字模板 + 无尾随换行 + 不含 comment/id

[undo-expiry]
  ok   窗口边界 + 常量逐字

通过 9 项，失败 0 项
SMOKE_VIEW_EXIT=0
```

**清理**：`rm -rf "C:/Users/86157/AppData/Local/Temp/pix-r10-smoke"` 后 `git status --short` 仅剩本轮白名单源码与 `docs/pm/*.md`，仓库内无临时脚本/产物。

### A.5 代码级核对（A 面，`grep` 逐字）

| 核对 | 结果 |
| --- | --- |
| `grep -n "undoSlot" pix/src/main/notes-store.ts` | 声明 1 处（`= null`）、赋值恰 3 处（成功删除设槽 / 成功还原清槽 / 成功重建清槽）、校验读取 1 处（`const slot = undoSlot`）；无第四处赋值 |
| `grep -rn "notes-restore\|notesRestore" pix/src` | `ipc-handlers.ts` 1 处、`preload.ts` 2 处（类型 + 实现）、`stores/notes-store.ts` 1 处（仅经 `bridge().notesRestore`） |
| `grep -rn ": any\|await import(\|import(" <A 面 5 文件>` | 无命中 |
| `grep -rn "\.trim()" pix/src/renderer/stores/notes-store.ts pix/src/renderer/utils/notes-view.ts` | store 零命中；`notes-view.ts` 恰 1 处（`normalizeQuery` 内，唯一 trim 判定点） |
| `grep -rn "5000\|8000" pix/src/renderer/utils/notes-view.ts` | 各 1 处（`UNDO_WINDOW_MS` / `UNDO_ROW_MS`）；store 零命中 |
| `grep -rn "toLowerCase()" pix/src/renderer/utils/notes-view.ts` | 3 处，全在 `matchesSearch` 内（笔记链路唯一命中；其余命中均为既有非本轮文件） |
| `git diff -- pix/src/shared/types.ts pix/src/renderer/utils/notes-path.ts` | 空（复用既有 `ReaderNotesMutationResult`，错误码不扩） |

### A.6 A 面自评与未验证事项

- 已实现并验证：主进程槽的全部设/清/保留路径与七步校验顺序、三类逐字中文、字节级还原（`updatedAt` 不刷新、原下标插回、键序不变）、写失败注入与恢复、跨库防护、`notes-restore` IPC 与 preload 契约、纯函数 13 导出的全部逐字契约与不变量。
- 未验证（不在 A 面证据范围内，按设计档由 B 面离屏承担）：`NotesPanel.vue` 的撤销行定时器/按钮 `restoring` 复位与 60–65 场景、`ui-shot.mjs` 的 stub 槽语义与 18 张截图、`MEASUREMENTS.json` 四组。渲染层 store 的运行时行为（`undoDelete` 三态在真实面板中的表现）只经 `npm run check` 类型面与 B 面离屏间接覆盖，本轮未单独为 store 建烟测（store 依赖 Vue/Pinia/`window.pixApi`，属离屏面）。
- 风险提示：`restoreNote` 的 `stale` 语义在渲染层由守卫②（`undoScope`）与守卫③（目标 id）承担；主进程侧不存在超时判定（无时钟），窗口过期完全在渲染层提前返回，符合设计档 §1.2「时间窗口」条目。

---

## 开发 B（界面与取证面）

### B.1 改动文件清单

| 文件 | 动作（numstat） | 内容 |
| --- | --- | --- |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改（+340/-11） | 设计档 §1.5 DOM 契约：`.notes-search`/`.notes-search-input`/`.notes-search-clear`（整行 `v-if="status === 'ready' && hasNotes"`，清空按钮 `v-if="searchActive"`）、`.notes-sort`/`.notes-sort-btn`、`.notes-undo`/`.undo-text`/`.notes-undo-btn`、`.note-copy`/`.is-copied`；§2.2 计数四分叉（改用 `notesStore.visibleCount`，错误态仍为 `""`）；§2.3 空态映射（`LIST_EMPTY_CLASS` + `emptyReason`/`emptyClass`/`emptyText`，五条显式文案分支，`{q}` 取 `activeQuery`）；§3.2 撤销行定时器（`watch(() => notesStore.pendingUndo, scheduleUndoRow, { immediate: true })`，剩余钳到 0）；§3.3 `onUndoClick`（`restoring` 在途守卫 + `"stale" in result` 零副作用 + `try/finally` 唯一复位点）；§4.2/§4.3 复制（`COPY_FEEDBACK_MS = 1200`、`copiedNoteId` + `copyTimer`、`copyToClipboard`/`copyViaExecCommand` 照抄 ChatPanel、两链路都失败非静默）；`onBeforeUnmount` 增清 `undoRowTimer`/`copyTimer`（只清定时器，不调 `clearPendingUndo`） |
| `pix/scripts/ui-shot.mjs` | 修改（+1151/-3） | stub：`notesDelete` 改成「`findIndex` 定位 → 写盘 → 覆盖式设槽 → 回传 `note`」、新增 `notesRestore`（无槽 → id 不符 → 跨 root → 失败注入 → 同 id 占用 → 同去重键占用 → 原下标插回；去重键比较用新助手 `noteKey`）、`notesReset` 成功清槽、控制口 `notesRestoreCalls()`/`clearDeleteSlot()`/`setNotesRestoreFailure(code)`/`setNotesRestoreDelay(ms)`；`SEL` 增 7 项；60–65 场景（34 条场景日志、18 张截图、`MEASUREMENTS.json` 新增 `notes-search`/`notes-sort`/`notes-undo`/`notes-copy` 四组共 36 条记录）；65 段 `win.show()/focus()/webContents.focus()` 前置；`setSearch` 先 `focus()`、`searchProbe()` 一次读完 `{ value, focused, clearInDom, rows, countText, emptyText }` |
| `docs/pm/R10-dev.md` | 修改 | 本「## 开发 B」一节 |
| `%TEMP%/pix-r10-base/**`（基线留档，设计档 §8.1）与其他临时目录 `%TEMP%/pix-r10-b-check/**`（已删除） | 临时 | 仓库外工具：stub 生成物语法校验、运行日志、几何比对脚本；`%TEMP%/pix-r10-base` 按设计档 §8.1 作为改前基线留档保留，其余临时目录跑完删除；仓库内零残留、不新增 npm scripts |

### B.2 关键决策与偏差

| # | 决策 / 偏差 | 依据与影响 |
| --- | --- | --- |
| D1 | **60-9 的摘录判据改为「文件 + 面板回位」而非浮层反馈**：`excerptFirstSpan` 先轮询 `notes.json` 条数 +1，再等 `.notes-search-input` 回到 DOM；不断言 `.quick-ask-feedback.is-ok` | 实测（本机离屏）：面板从**空态切到列表**时 `.notes-panel` 触发一次滚动，`PdfSelectionQuickAsk` 的 `document` 级 `scroll` 监听在其 `onStageScroll` 中 `hide()` 浮层 ⇒ `showFeedback` 的 `if (!visible.value) return` 抑制反馈。60-9 恰好要求「删空最后一条后再摘录」，正落在该组合上（失败截图显示摘录已入库、浮层已回双按钮）。设计的逐字契约（摘录入库、查询原样保留、4c 空态文案）全部保留，只是判据换成更强的事实源 |
| D2 | **剪贴板逐字比较前归一化换行**：`normalizeClipboard(text) = text.replace(/\r\n/g, "\n")`，原始值同时入库 | 实测 `clipboard.readText()` 返回 `\r\n`：Windows 系统剪贴板把 LF 规整为 CRLF（OS 行为，非产品行为）。产品侧 `buildNoteCopyFragment` 的逐字模板（LF）已由主进程纯函数烟测逐字断言（A 面 `copy-fragment` 组），离屏侧断言「归一化后逐字相等 + 原始值入库」 |
| D3 | **`.notes-undo` 的 DOM 顺序断言从 63-2 移到 64c** | 63-2 是成功态：`pendingUndo` 已清空、撤销行已收回 ⇒ 该时刻判「通知在撤销行之前」是空断言/必红（首跑实测 `noticeBefore:false`）。64c 是失败态：`撤销失败：没有可撤销的删除` 通知与保留的撤销行同时存在 ⇒ 判据成立（实测 `noticeBefore:true`，且同时验证「行在导出行之前」） |
| D4 | **60-6 用 `ensureMapOpen()`（已开不再点）替代 `openMap()`** | 60-5 与 60-6 连续执行，地图在 60-5 已打开；`.map-toggle` 是二态开关，第二次点击会把地图关掉 ⇒ `waitFor(".knowledge-map-slot")` 必超时（首跑实测） |
| D5 | **62-6 先 `backToLibraryTab()` 再 `openRow("older-paper.pdf")`** | `.tree-row` 只在资料库标签下渲染；场景语义（切文档保留排序、重进工作区复位）不变 |
| D6 | **65-0 增 `clipboard.clear()`；65-1/65-3 用「相对点击前发生变化」的读取助手** | 剪贴板写入是异步的（`await navigator.clipboard.writeText`）⇒ 点击后立即读可能读到旧值；空基线 + 变化检测既避开竞态，也不拿期望值做轮询条件（逐字断言仍由 `COPY_SAMPLE_1/2/3` 常量给出） |
| D7 | **B 面未改动 `notes-view.ts` / `stores/notes-store.ts`**（设计档 §9 把两者列在 B 面，实际由 A 交付；本次角色摘要的 B 面白名单只有面板与 `ui-shot.mjs`） | 只消费 §1.3/§1.4 冻结接口（`searchQuery`/`activeQuery`/`searchActive`/`sortMode`/`pendingUndo`/`visibleCount`/`setSearchQuery`/`clearSearchQuery`/`setSortMode`/`undoDelete`/`clearPendingUndo` 与 13 导出），接口零改动；B 面的运行时证据由 60–65 离屏场景承担 |
| D8 | **无其它偏差**：DOM 类名与门控、计数四分叉逐字、空态六分支与逐字文案、撤销行 `已删除「{snippet}」· 第 {page} 页`（snippet = 前 12 字符 + `…`）、`restoring` 复位点、复制模板与两链路、`COPY_FEEDBACK_MS=1200` 落点，均按设计档字面实现 | 设计档 §1.5/§2.2/§2.3/§3.1–§3.3/§4.2/§4.3、定稿修订 must-fix 1/3/6 |
| D9 | **D8 的「无其它偏差」不成立（审查 must-fix 1 更正）**：搜索行三处字面偏离需求 §0.8 冻结值——placeholder 写成「搜索摘录与备注」、`.notes-search-input` 写成 22px/`var(--pix-radius-sm)`/11px、清空控件写成原生按钮 + 文本「清空」；且取证面当时无搜索行盒模型/控件形态断言 | 已在「## 修复轮」改回冻结字面（26px/圆角 6/12px、`v-btn icon="mdi-close"`）并在 60-1 追加 `notes-search|search-row-form` 断言；原偏离在离屏面不可见（`header.h` 位移仍属 §8.6 允许项，故未红） |

### B.3 离屏场景与断言（60–65，全部实跑通过）

| 场景 | 落点 | 关键实测值（`MEASUREMENTS.json`） |
| --- | --- | --- |
| 60-1/60-2 `notes-search\|hits` | 搜索命中态、即时性、清空、字节与 `notesLoad` 零增量 | `TABLE 2` → 1 行 + `命中 1 条 / 共 4 条`（输入与读取之间只隔一次 IPC 往返）；`消融` → 1 行（备注命中）；`消融 实验` → 0 行 + `没有匹配「消融 实验」的笔记`；`sample-paper.pdf` → 0 行（docPath 不参与）；清空 → 4 行 + `共 4 条`；`hashSame:true`、`loadCallsSame:true` |
| 60-3/60-4 `notes-search\|esc`/`clear-button` | Esc 前聚焦、Esc 后清空失焦、清空按钮交还焦点 | Esc 前 `focused:true`（空断言防护）；Esc 后 `value:""`、`focused:false`、4 行、清空按钮移出 DOM；清空按钮后 `focused:true`、4 行、`hashSame:true` |
| 60-5 `notes-search\|three-dimensions` | 三维 AND + 开关两态数值证据 | 行数 1、`章节：2. Method Overview · 第 2 页`、`checked:true`、`命中 1 条 / 共 4 条`；开关 OFF/ON 两态都 1 行 |
| 60-6 `notes-search\|counts` | 计数真值表六态 + 错误态 | `共 4 条` / `当前 3 条 / 共 4 条` / `本章 2 条 / 共 4 条` / `命中 1 条 / 共 4 条` / 三维同时 `命中 1 条 / 共 4 条` / 无匹配 `命中 0 条 / 共 4 条`；错误态 `countText:""`、搜索/排序行均不在 DOM；恢复后输入框 value 仍为 `Table 2` |
| 60-7 `notes-search\|empty-search`/`empty-matrix` | 空态矩阵（4a/4b/4c + 章节/文档两态，修订 4 路径） | 4c `没有匹配「zzz」的笔记`、4b `当前文档内没有匹配「zzz」的笔记`、4a `本章内没有匹配「zzz」的笔记`（另两个空态元素均不在 DOM）；清空查询后 `本章 2 条 / 共 4 条` → 删空两条 ⇒ `.notes-chapter-empty` `本章暂无笔记` + `本章 0 条 / 共 2 条`；清除章节过滤 `当前 1 条 / 共 2 条` → 删空 ⇒ `.notes-filtered-empty` `当前文档暂无笔记` + `当前 0 条 / 共 1 条`；关开关 1 行（`n-other-1`）无空态 |
| 60-8 `notes-search\|blank-query` | 空白串不算生效 | `value:"   "`、清空按钮不在 DOM、4 行、`共 4 条` |
| 60-9 `notes-search\|delete-all-then-excerpt` | 用「命中该条的查询」逐条删空 + 摘录回位（N64-7） | 逐步骤计数 `命中 0 条 / 共 3 条` → `/共 2 条` → `/共 1 条` → 删空：`.notes-empty` + `命中 0 条 / 共 0 条` + 搜索/排序行不在 DOM；摘录后查询原样 `消融`、`命中 0 条 / 共 1 条`、空态 `没有匹配「消融」的笔记` |
| 62-1/62-2/62-3 `notes-sort\|default`/`created`/`back-to-page`/`with-search` | 两种排序的行序、组头、计数与字节 | 默认 `排序：页码` + title `当前按页码排序，点击改为「最新优先」`、当前文档组序 `[n-current-1, n-current-2, n-current-3]`、组头 `["sample-paper.pdf","archive/older-paper.pdf"]`、组计数 `["共 3 条","共 1 条"]`；`排序：最新` 后组序 `[n-current-3, n-current-2, n-current-1]`、组顺序与计数不变、`hashSame:true`；搜索下两种排序都 1 行 + `命中 1 条 / 共 4 条` |
| 62-4/62-5/62-6 `notes-sort\|with-chapter`/`export-and-injection`/`scope` | 排序 × 章节过滤、导出与注入顺序、作用域 | 章节过滤后组数 1、可见集合不变、组内首行为 `n-current-3`；`.export-text` 逐字 `已导出 4 条 → .pix-read/notes.md`、载荷含两条且 `n-current-1` 的 text 出现在 `n-current-3` 之前（与屏幕顺序相反 ⇒ 排序不参与注入）；切文档后仍 `排序：最新`、重进工作区回 `排序：页码` |
| 63-1/63-2 `notes-undo\|delete`/`restore` | 删除即落盘 + 撤销行 + 字节回复 | `.undo-text` 逐字 `已删除「Table 2 repo…」· 第 2 页`、按钮 `撤销`/title `还原这条笔记`、行数 3、`hashChanged:true`；撤销后行数 4、`.notes-notice.is-success` `已还原该条笔记`、撤销行消失、`hashSame:true`、文件 id 序列回复、`createdAt` 等于种子值（`updatedAt` 未刷新） |
| 63-3/63-4/63-5/63-6 `notes-undo\|three-dimensions`/`selection`/`consecutive`/`repeat` | 还原后参与三维过滤、选择集、连删、重复删除 | 搜索 1 行；`1. Abstract` 章节 1 行且为 `n-current-1`、`本章 1 条 / 共 4 条`、两个空态元素均不在 DOM、清除后 4 行；删除后选择条消失、撤销后 `已选 1 条` + chip `摘录 1 条` + 注入载荷含该条；连删时撤销行数量恒 1、第一次文案 `已删除「We study ret…」· 第 1 页`、撤销只还原后一条（`n-current-1` 仍不存在）；两轮「删→撤」都 `hashSame` |
| 63-7/63-8 `notes-undo\|write-failure-retry`/`filter-independent` | 写失败可重试、撤销行与过滤无关 | `撤销失败：笔记写入失败` + 行保留（3 行）→ 解除注入后重试成功、行消失回 4 行；查询 `zzz` 下 0 行 + 搜索空态而撤销行仍在，撤销后仍 0 行 + `已还原该条笔记` + `hashSame:true`、清空查询回 4 行 |
| 64/64b `notes-undo\|expired`/`row-expired` | 窗口过期不发 IPC、行到期不复活 | 5.2s 时撤销行仍在；点击后 `撤销失败：撤销窗口已过期（超过 5 秒），笔记未能还原`、行立即消失、`callsDelta:0`、`hashSame:true`、3 行；删第二条后 8.2s 行自动消失，切标签往返仍不在 DOM、行数 2 |
| 64c/64c-2 `notes-undo\|slot-cleared`/`same-id-occupied` | 槽失效与同 id 占用 | `撤销失败：没有可撤销的删除`、`hashSame:true`、3 行、行保留且按钮未 disabled、通知在撤销行之前（`noticeBefore:true`）；写回同 id 种子后 ⇒ `撤销失败：该笔记已重新存在，无法撤销`、`callsDelta:1`、`hashSame:true`、4 行、行保留 |
| 64d/64e `notes-undo\|in-flight`/`stale-interleave` | 在途防重复与新删除介入（must-fix 3/4） | 在途按钮 `disabled:true`、`callsDelta:1`、完成后 4 行且 `hashSame:true`、收行；新删一条后新行按钮未 disabled（`restoring` 已复位）；stale 相位：撤销行文案仍是 `已删除「We study ret…」· 第 1 页`、行数 3、屏幕无 `n-current-1`（迟到响应未复活）、无成功/失败提示、按钮未 disabled、文件里 `n-current-1` 不存在而 `n-current-2` 存在（真实 FIFO 落盘） |
| 65-0…65-5 `notes-copy\|focus`/`copy-one`/`feedback-reset`/`two-fragments`/`failure`/`geometry` | 复制（must-fix 1） | `hasFocus:true`；`clipboard.readText()` 归一化后逐字等于 §4.1 第一/二/三段样例（含 `> ` 前缀、空行、`—— sample-paper.pdf · 第 2 页[ · AI 结论]`、`—— older-paper.pdf · 第 7 页`，不含目录段）；按钮 `已复制`/`.is-copied`/title `已复制`、1400ms 后回 `复制`/`复制为 Markdown`、反馈态恒 1 且属最后点击的行；注入失败 ⇒ `复制失败：无法访问剪贴板`、按钮仍 `复制`、剪贴板未改写；几何：`.note-copy` 在 `.note-ask-wrap` 之前、两者 `y` 相等、动作区右对齐（body/actions 右差 0）、`actionsOverflow:0`、`.note-actions` 仍是 `.note-body` 末子节点 |

### B.4 真实命令与真实输出

**命令 1（唯一工程门，终态）**

```text
$ cd pix && npm run check

> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0
```

**命令 2（离屏取证，改后终态）**

```text
$ cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
[ui-shot] fixture 资料库：C:\Users\86157\AppData\Local\Temp\pix-r5\library
[ui-shot] 渲染层已加载（dpr=1, 视口=1600x1000），开始场景
… 00–11 / 20–24 / 30–36 / 40–46 / 50–55 / 60–65 全部场景 …
[ui-shot] 结束：产出 112 张截图
UI_SHOT_EXIT=0
```

产物核对（`%TEMP%/pix-r5/shots`）：

```text
MANIFEST.json.failure = null
截图 = 112 张（= 基线 94 + R10 新增 18）
R10 新增 18 张（名称与设计档 §8.4 逐字一致）：
  60-notes-search.png / 60b-notes-search-left-pane.png / 60c-notes-search-zoom.png /
  60d-notes-search-cleared.png / 60e-notes-search-three-dimensions.png /
  61-notes-search-empty.png / 61b-notes-search-empty-doc.png / 61c-notes-search-empty-chapter.png /
  62b-notes-sort-default.png / 62-notes-sort-latest.png /
  63-notes-undo.png / 63b-notes-undo-restored.png / 63c-notes-undo-consecutive.png /
  64-notes-undo-expired.png / 64b-notes-undo-row-gone.png /
  65-note-copy-feedback.png / 65b-note-copy-fragment.png / 65c-note-copy-failure.png
MEASUREMENTS.json：新增 notes-search 9 条 / notes-sort 7 条 / notes-undo 14 条 / notes-copy 6 条（共 36 条）；
  每组都含文件字节或剪贴板级判据（notes.json 哈希、文件 id 序列、clipboard.readText()）
```

**命令 3（§8.6 改前基线，留档后删除）**

```text
# 临时把 B 面两个文件换回 HEAD 版本（先备份并 sha256sum 校验），跑基线后立即还原（sha256sum -c 全部 OK）
$ cd pix && PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-r10-base" PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
[ui-shot] 结束：产出 94 张截图
BASE_EXIT=0
MANIFEST.json.failure = null；MEASUREMENTS.json = 116 条
```

比对结论（仓库外脚本，跑完随临时目录删除）：

- 基线有而改后缺的测量条目 **0**；基线 94 张截图**全部保留**；新增条目 36 条（即四组）。
- 行内元素（`groupHead`/`groupName`/`groupPath`/`chip`/`noteRow`/`pageBadge`/`noteTime`/`deleteBtn`/`noteText`/`commentTrigger`/`exportBtn`）的 `w`/`h`/`fontSize`/`color`/`background` 在 `list-current-doc-filter-off|on` 与 `after-filter-off-settled` 三组中共 **41 处元素 × 5 字段、逐字差异 0**。
- 唯一位移是设计档 §8.6 预期的头部增高：`header.h` 68 → 111、`noteRow.y` 178 → 221；`panelScroll.clientH` 保持 914。

### B.5 代码级核对（B 面 grep 逐字）

| 核对 | 命令 | 结果 |
| --- | --- | --- |
| 匹配唯一实现 | `grep -rn "includes(" NotesPanel.vue notes-store.ts` | 无命中（搜索匹配只在 `notes-view.ts`） |
| 归一化唯一 | `grep -rn "searchQuery" pix/src/renderer` | 笔记链路只命中 `notes-store.ts`（字段/派生/动作/复位）与 `NotesPanel.vue:95`（`searchModel` 绑定）；另有余量命中 `ModelSelector.vue`（既有非本轮组件自带搜索框）。面板与 store 内零 `.trim()` |
| `trim` 允许清单 | `grep -rn "\.trim()" NotesPanel.vue notes-store.ts` | 只命中既有的 `commentDraft.value.trim()`（备注保存）；搜索链路零命中 |
| 常量唯一 | `grep -rn "5000\|8000" notes-view.ts notes-store.ts NotesPanel.vue` | `notes-view.ts` 各 1 处（`UNDO_WINDOW_MS`/`UNDO_ROW_MS`）+ 1 处注释引用（`+5000 即过期`）；store 与面板零命中（`COPY_FEEDBACK_MS = 1200` 在面板内，不在本判据） |
| 排序唯一 | `grep -rn "sortMode" pix/src` | 写入点只有 `notes-store.ts`（`setSortMode`）与 `NotesPanel.vue`（`onToggleSort`）；无 `settings`/`notes.json`/`reader-state` 落盘路径 |
| 管道唯一 | `grep -n "filter(\|sort(" NotesPanel.vue` | 无命中（模板不自行过滤/排序） |
| 撤销入口唯一 | `grep -rn "undoDelete\|clearPendingUndo" pix/src` | `undoDelete`：store 定义/导出 + 面板 1 处调用；`clearPendingUndo`：store 定义/导出 + 面板**恰好 2 处**（`scheduleUndoRow()` 到期回调、`onUndoClick()` 过期分支）；`onBeforeUnmount` 只清定时器 |
| 无 any / 无内联动态 import | `grep -rn ": any\|await import(\|import(" <B 面 2 文件 + notes-view.ts + notes-store.ts>` | 无命中 |
| 面板无第二处 Escape 监听 | `grep -n "Escape" NotesPanel.vue` | 只命中既有标识符 `showEscapeHatch`（R9 逃生口）；无第二个 `keydown` 监听，`@keydown.esc` 不 `stopPropagation` |
| 渲染层不拼路径 | `grep -n "notes.json\|\.pix-read" NotesPanel.vue notes-store.ts` | 只命中既有显示串 `.pix-read/notes.md`（导出提示）与注释文字 |
| 剪贴板不抽模块 | `git diff -- pix/src/renderer/components/workspace/ChatPanel.vue` | 空（零 diff）；面板内不出现 `ChatPanel` 引用 |
| 冻结文件零 diff | `git diff -- pix/src/shared/types.ts pix/src/main/library-root.ts pix/src/renderer/utils/notes-path.ts pix/src/renderer/utils/outline-notes.ts pix/src/renderer/components/workspace/KnowledgeMap.vue pix/src/renderer/pages/WorkspacePage.vue` | 空 |
| 白名单 | `git status --short` | 只有本轮白名单源码（A 面 4 文件 + B 面 2 文件 + `notes-view.ts`）与 `docs/pm/R10-*.md`；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置零改动；仓库内无临时脚本/产物 |

### B.6 B 面自评与未验证事项

- 已实现并验证（离屏实跑）：搜索（命中/大小写不敏感/中文备注命中/内部空白不折叠/元数据不参与/无防抖即时性/清空/Esc 焦点契约）、排序（两模式行序、组序与计数不变、不写盘、不参与注入载荷）、撤销（行文案与 DOM 位置、字节级回复、选择集回位、过期不发 IPC、行到期不复活、槽失效/同 id 占用/写失败重试/与过滤无关、在途防重复、stale 零副作用）、复制（三段逐字模板、`已复制` 反馈回位、唯一反馈态、失败非静默、行内几何与右对齐）。
- 计数四分叉与空态六分支的逐条文案、DOM 类名与门控、`restoring` 的 `try/finally` 复位点、`clearPendingUndo` 的 2 处调用点，均以离屏断言 + 走查双证据覆盖。
- 未验证 / 依赖前提：
  1. `undoDelete` 的守卫②（`undoScope`：离开工作区后到达的响应被丢弃）在离屏面无专门场景（`goHome` 会使面板卸载、撤销行随之消失，可观测面不足）；该分支由 store 代码走查与设计档 §6 第 4 行覆盖。
  2. 剪贴板失败注入走的是「页面主世界改写 `Clipboard.prototype.writeText` + `Document.prototype.execCommand`」；`contextIsolation` 下 stub 位于隔离世界，该注入不覆盖 stub 侧路径（按设计档修订 9，这是唯一可达的失败注入手段）。
  3. `MEASUREMENTS` 的基线比对只覆盖含面板行内几何的三组既有测量（`list-current-doc-filter-*`、`after-filter-off-settled`），未做全图像素 diff；纵坐标位移属设计预期。
  4. 60-9 的摘录判据按 B.2 D1 采用「文件 + 面板」事实源（浮层反馈在该组合下被既有 scroll-hide 语义抑制），未断言 `.quick-ask-feedback.is-ok`；该反馈本身仍由既有 07 场景断言。
  5. 复制成功路径依赖「窗口获焦」（65-0 的 `document.hasFocus() === true` 作为失败判据、不静默跳过）；若换到不允许显示窗口的环境，只能退化为 stub 记录载荷的间接判据。

## 修复轮

> 触发：`docs/pm/R10-review.md`「代码审查（R10）」must-fix 1（需求 §0.8 冻结的搜索行字面与交付实现不一致，且该偏离在取证面漏检，见 B.2 D9）。

### 修复内容

| 位置 | 交付态（被审出） | 修复后（= 需求 §0.8 / 设计档 §1.5 冻结字面） |
| --- | --- | --- |
| `NotesPanel.vue` 搜索行 placeholder | `搜索摘录与备注` | `搜索原文或备注` |
| `.notes-search-input` 盒模型 | `height:22px` / `border-radius:var(--pix-radius-sm)` / `font-size:11px` | 照抄 `PdfSearchPanel.vue` 的 `.search-input`：`height:26px` / `border-radius:6px` / `font-size:12px`（`padding:0 8px`、边框色、`background`、`:focus` 边框同款一并照抄） |
| `.notes-search-clear` 控件 | 原生 `<button>` + 文本「清空」 | `<v-btn class="notes-search-clear" icon="mdi-close" size="x-small" variant="text" title="清空搜索" @click="onSearchClear" />`；随之删除只服务旧原生按钮的 `.notes-search-clear` / `:hover` 自定义样式（v-btn 用 Vuetify 自身交互态） |

- 未变项：`.notes-search`/`.notes-sort` 的 `v-if`（`ready && hasNotes`）、`.notes-search-clear` 的 `v-if="notesStore.searchActive"`、Esc ⇒ 清空 + `blur()`、清空按钮 ⇒ 清空 + `input.focus()`、两者都不 `stopPropagation`。
- 本轮只改搜索行字面与取证面断言；计数四分叉、空态映射、撤销行、复制、store/IPC/主进程实现零改动。

### 取证面补强（同轮）

审查证据指「MEASUREMENTS 无搜索行盒模型/控件形态断言」，故 `ui-shot.mjs` 60-1 相位新增一条测量 `notes-search|search-row-form`（断言 placeholder 字面、输入框 `height:26` / `radius:6px` / `fontSize:12px`、清空控件是 `BUTTON` + `v-btn` / `v-btn--icon` + `title=清空搜索` + `mdi-close` 图标）。实跑实测值：

```text
{"phase":"search-row-form","placeholder":"搜索原文或备注","height":26,"radius":"6px","fontSize":"12px",
 "clearTag":"BUTTON","clearVBtn":true,"clearIconBtn":true,"clearTitle":"清空搜索","clearIcon":true,
 "clearBox":{"w":20,"h":20}}
```

### 重跑证据（全量重跑，未复用旧产物）

**命令 1（唯一工程门，终态）**

```text
$ cd pix && npm run check

> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0
```

（命令无 error 输出；退出码 0。）

**命令 2（离屏取证，终态）**

```text
$ cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs > %TEMP%/pix-r10-fix-uishot.log 2>&1
UI_SHOT_EXIT=0
[ui-shot] 结束：产出 112 张截图
```

产物核对（`%TEMP%/pix-r5/shots`）：

```text
MANIFEST.json：failure=null、shots=112（与设计档 §8.4 逐字一致，无新增/缺失截图）
MEASUREMENTS.json：153 条（上一交付 152 + 本轮 search-row-form 1）
  notes-search 10 / notes-sort 7 / notes-undo 14 / notes-copy 6，零 failures（任一断言失败即抛错，故 failure=null ⇒ 全过）
```

**命令 3（修复前/后逐条目几何比对，仓库外脚本）**

```text
$ node %TEMP%/pix-r10-fix-cmp2.cjs   # 输入：%TEMP%/pix-r10-prefix-shots（修复前快照）vs %TEMP%/pix-r5/shots（修复后）
pre=152 post=153
only in post: 1  + notes-search|search-row-form x1
only in pre: 0
diffs: 60（逐字段展开）
```

比对结论：

- 唯一新增条目是本轮补强的 `search-row-form`；修复前 152 条一条不缺。
- 差异只有两类：① 26px 输入框（修复前 22px）带来的 **+4px 整体下移**——`header.h` 111→115、`list-current-doc-filter-off|on` 与 `after-filter-off-settled` 的 `*.y`（含 `trackBox`/`thumbBox`/`controlBox`/`labelBox`）全部 +4、`panelScroll.scrollH` 1055→1059（`panelScroll.clientH` 不变）；② 非确定性字段（`updatedAt`、随机生成的笔记 id、`timing.ms`）。
- `noteRow`/`groupHead`/`groupName`/`groupPath`/`chip`/`pageBadge`/`noteTime`/`deleteBtn`/`noteText`/`commentTrigger`/`exportBtn` 的 `w`/`h`/`fontSize`/`color`/`background` 差异 **0**——+4px 属设计档 §8.6 的「纵坐标位移」允许项，是 §0.8「高 26px」的直接结果。
- 证据快照：`%TEMP%/pix-r10-prefix-shots/**`（修复前 MEASUREMENTS/MANIFEST 留档）、`%TEMP%/pix-r10-fix-uishot.log`（本轮离屏全量日志）；比对脚本为仓库外一次性脚本，用后删除，仓库内零残留。

### 修复轮文件清单

| 文件 | 动作 |
| --- | --- |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改（搜索行三处字面改回冻结值 + 删除旧清空按钮样式） |
| `pix/scripts/ui-shot.mjs` | 修改（60-1 增 `notes-search|search-row-form` 测量，含 7 条断言） |
| `docs/pm/R10-dev.md` | 修改（B.2 增 D9 更正 + 本「## 修复轮」） |

### 修复轮走查

| 核对 | 结果（`grep` 实测） |
| --- | --- |
| 无 `: any` / 无内联动态 `import()` | 六处白名单源码零命中 |
| `.trim()` 允许清单 | 只 `notes-view.ts:33`（`normalizeQuery`）与既有 `NotesPanel.vue:305` 的 `commentDraft.value.trim()`；搜索链路无第二处 |
| `5000`/`8000` 唯一 | 只 `notes-view.ts:26/27`（+ 1 处注释）；`1200` 只 `NotesPanel.vue:30`（`COPY_FEEDBACK_MS`） |
| 冻结字面 | `search-row-form` 实测 `搜索原文或备注`/`26`/`6px`/`12px`/`BUTTON`/`v-btn--icon`/`清空搜索`/`mdi-close` 逐项相等 |
| 白名单 | `git status --short` 只有 A 面 4 文件 + B 面 2 文件 + `notes-view.ts` + `docs/pm/R10-*.md`；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build`、electron-builder 配置零改动；未新增 npm scripts，仓库内无临时脚本/产物 |

---

## 终验

> 终验方（独立验收）：只采信本机实跑结果，未复用交付方/审查方脚本产物。主进程数据面与纯函数断言由终验方自建脚本在仓库外 `%TEMP%/pix-r10-final-verify` 生成（两个 tsconfig + 两个 smoke 脚本，`tsc -p` 均退出 0，跑完删除）。

### 终 1. 真实命令与真实输出

**命令 1（唯一工程门）**

```text
$ cd pix && npm run check

> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0
```

**命令 2（git 卫生）**

```text
$ git status --short
 M pix/scripts/ui-shot.mjs
 M pix/src/main/ipc-handlers.ts
 M pix/src/main/notes-store.ts
 M pix/src/main/preload.ts
 M pix/src/renderer/components/workspace/NotesPanel.vue
 M pix/src/renderer/stores/notes-store.ts
?? docs/pm/R10-design.md
?? docs/pm/R10-dev.md
?? docs/pm/R10-req.md
?? docs/pm/R10-review.md
?? pix/src/renderer/utils/notes-view.ts

$ git diff --stat -- packages/                              # 空
$ git diff --stat -- pix/package.json pix/package-lock.json # 空
$ git diff --stat -- <冻结文件清单：types.ts / notes-path.ts / ChatPanel.vue / KnowledgeMap.vue /
                     WorkspacePage.vue / PdfSearchPanel.vue / PdfViewer.vue / library-root.ts …>  # 空
```

**命令 3（离屏取证，全量重跑，输出落 `%TEMP%/pix-r10-final-verify/uishot-final.log`）**

```text
$ cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
[ui-shot] 结束：产出 112 张截图
UI_SHOT_EXIT=0
日志中「断言失败|场景失败|结束：失败」命中 0 处（日志 441 行）
```

产物（`%TEMP%/pix-r5/shots`，本轮重跑覆盖）：

```text
MANIFEST.json：failure=null、shots=112（R10 新增 18 张，名称逐字：
  60-notes-search / 60b / 60c / 60d / 60e、61 / 61b / 61c、62b-notes-sort-default / 62-notes-sort-latest、
  63-notes-undo / 63b-notes-undo-restored / 63c-notes-undo-consecutive、64-notes-undo-expired / 64b-notes-undo-row-gone、
  65-note-copy-feedback / 65b-note-copy-fragment / 65c-note-copy-failure）
MEASUREMENTS.json：153 条、failures 0；四组 notes-search 10 / notes-sort 7 / notes-undo 14 / notes-copy 6
磁盘另有 1 张 99-failure-state.png（mtime 22:57，本轮 23:40 之前的历史残留，不在本轮 MANIFEST 清单内，与本次运行无关）
```

### 终 2. 撤销语义独立验证（终验方自建，仓库外编译 main + view）

编译面：`tsconfig.main.json`（`rootDir` 指 `pix/src`、`@types/node` 指仓库 `pix/node_modules/@types`）产出 `out-main/main/{notes-store,library-root}.js` + `out-main/shared/types.js`；`tsconfig.view.json`（`paths` 指 `@shared/*`）产出 `out-view/renderer/utils/{notes-view,notes-path}.js`；两个 `tsc -p` 均退出 0。

**脚本 1 `smoke-final.cjs`（34 项全绿，FINAL_VERIFY_EXIT=0）**

- [A] 删除：`deleteNote` 成功且必回传 `note`（id/page/text 与目标一致）；文件哈希变化、该 id 消失；「回传列表 === 文件所存」id 序列逐条相等。
- [B] 撤销：`restoreNote` 成功；文件**逐字节回复删除前**；`id/kind/docPath/page/text/createdAt/updatedAt` 七字段全等（撤销不改 id/createdAt）；原下标插回（序列回复）；再次还原 ⇒ `not-found` + `没有可撤销的删除`。
- [C] 再删除：同一条可再次删除、文件再次变化、槽被重新设置。
- [D] 撤销过期（真实等待 5.3s）：`isUndoExpired(deletedAt, now) === true`（边界 +4999 未过期 / +5000 已过期）；
  **过期后仍能撤销的两层结论**——渲染层：`undoDelete` 在 `isUndoExpired` 命中时于 `bridge()` 之前 return（走查 `stores/notes-store.ts:226-228`），离屏 64 段 `callsDelta=0`（终验方复跑同值）证明不发 IPC；主进程：无时钟（设计档 §0.5），实测 5.3s 后直接调 `restoreNote` 仍成功写回且字节回复删除前、`createdAt/updatedAt` 未变——窗口由渲染层强制，非数据面缺陷；迟到撤销后槽已清（二次还原 `not-found`）。
- [E] 占用与跨库：同 id 占用 ⇒ `invalid-input` + `该笔记已重新存在，无法撤销`；跨库 ⇒ `not-found` + `没有可撤销的删除` 且 B 库目录未被创建；切回原库槽仍在；解除占用后同一槽可还原且字节回复。
- [F] 纯函数运行期导出面：3 常量 + 7 函数齐备；`UNDO_EXPIRED_MESSAGE` 逐字；`normalizeQuery` 只 trim 首尾且幂等；`matchesSearch` 大小写/备注/元数据/空白；`buildNoteCopyFragment` 无尾随换行、不含 comment。

**脚本 2 `smoke-final2.cjs`（42 项全绿，FINAL_VERIFY2_EXIT=0）**

- [G] `sortNotesForView` 两模式与朴素参照（page→createdAt；createdAt 降序→id 升序）逐字段相等、不原地修改入参。
- [H] `applyViewToGroups` 3 query × 3 区间 × 2 开关 = 18 组合可见集合恒等于三谓词交集；空组整组丢弃；组顺序原样；入参不被修改。
- [I] `resolveListEmptyReason` 五态 + 优先级 + 空白不算生效 + `!hasNotes` 不进该函数。
- [J] `buildNoteCopyFragment` 四段逐字（单行 / 多行 / answer 后缀 / 带目录 docPath）。
- [K] 失败路径与槽生命周期：id 不符 ⇒ `not-found` 逐字且不清槽；同去重键（新 id）⇒ `invalid-input` + `该笔记内容已重新存在，无法撤销` 且文件不出现两条同键；`notes.json.tmp` 预置为目录 ⇒ `write-failed` + `笔记写入失败`、原字节不变、槽保留、清理后重试成功且字节回复；第二次成功删除覆盖槽（旧 id ⇒ `not-found`）；成功 `resetCorruptNotes` 清槽（重建前删除的条目不得被悄悄写回）；`addNote`/`updateNoteComment` 不清槽。

> 首跑 41/1 失败为终验方脚本自身缺陷（用重建空库后已不存在的 id 调 `updateNoteComment`），修正后 42/42；产品侧无缺陷。合计 76 项断言全绿。

### 终 3. 截图核对（7 张：6 张新场景 + 1 张既有回归）

| 截图 | 目视结论 |
| --- | --- |
| `60-notes-search.png` | 搜索框值 `TABLE 2` + 右端 v-btn 图标清空钮；计数逐字 `命中 1 条 / 共 4 条`；列表仅 1 行（Table 2 那条）——大小写不敏感命中成立 |
| `61c-notes-search-empty-chapter.png` | 三维同时生效（`zzz` + `章节：2. Method Overview · 第 2 页` + 开关 ON），空态逐字 `本章内没有匹配「zzz」的笔记`——与 `本章暂无笔记` 可区分 |
| `62-notes-sort-latest.png` | 当前文档组行序变为 `[第 2 页 AI 结论(1 分钟前), 第 2 页 Table 2(2 分钟前), 第 1 页(4 分钟前)]`；组序与组计数（`共 3 条` / `共 1 条`）不变 |
| `63-notes-undo.png` | 撤销行逐字 `已删除「Table 2 repo…」· 第 2 页　撤销`；计数 `共 3 条` |
| `63b-notes-undo-restored.png` | 成功通知 `已还原该条笔记`、`共 4 条`、该行回到原下标；阅读区仍 `第 1 / 3 页`、`100%`（无跳页） |
| `65-note-copy-feedback.png` | 被点行按钮文本为 `已复制`（其余行为 `复制`），`.note-actions` 仍右对齐单行 |
| `02-notes-list.png`（既有场景） | 分组头（显示名 + 相对路径 + 共 N 条）、复选/页码徽标/相对时间/删除/展开全文/备注/AI 徽标、`复制 · 追问` 动作区与 R9 一致；新增搜索/排序两行插入头部，无其它视觉变化 |

### 终 4. 基线回归（终验方自算）

```text
%TEMP%/pix-r10-base（改前留档）：94 张 / 116 条 / failure=null
本轮                           ：112 张 / 153 条 / failure=null
基线截图缺失 = 0；基线测量条目缺失 = 0；新增条目 = 37（36 组 + search-row-form 1）
行内字段比对（list-current-doc-filter-off|on、after-filter-off-settled）：356 个字段相等；
  w/h/fontSize/color/background 差异仅 header.h 68 → 115（新增两行 + §0.8 冻结的 26px 输入框的必然结果，
  属设计档 §8.6 允许的纵坐标位移），其余差异均为 y/scrollH 位移
```

### 终 5. 验收标准逐条复核（只列可用本轮证据判定的）

| # | 结论 | 终验方判据 |
| --- | --- | --- |
| N63-1/2/3 | 通过 | 走查：`toLowerCase()` 在笔记链路只命中 `notes-view.ts::matchesSearch`（其余为既有非本轮文件）；`.trim()` 只有 `normalizeQuery` 与既有 `commentDraft`；自建纯函数断言大小写/备注/元数据/内部空白 |
| N63-4 | 通过 | 复跑 `notes-search\|hits` 逐字；`60/60b/60c` 在清单内并已目视 |
| N63-5 | 通过 | 走查 `setSearch`（setter + input，一次 js 往返）与紧随的读取之间无 sleep；实测 `immediate.rows=1` |
| N63-6/7 | 通过 | 复跑 `counts.error`（`countText=""`、搜索/排序行不在 DOM、恢复后 value 保留）与 `hits.hashSame/loadCallsSame` |
| N64-1/2 | 通过 | 走查（清空钮 `v-if=searchActive`、只清空 + focus；Esc 只清空 + blur；面板无第二处 Escape 监听，`grep Escape` 只命中既有 `showEscapeHatch`）；复跑 esc/clear-button |
| N64-3 | 通过 | 复跑 `empty-search`/`empty-matrix` 六态逐字；`61/61b/61c` 已目视 |
| N64-4/5/6 | 通过 | 复跑 esc（`before.focused=true` → 失焦、4 行、清空钮退出 DOM）、clear-button（`focused=true`）、blank-query（`clearInDom=false`、`共 4 条`） |
| N64-7 | 通过 | 复跑 `delete-all-then-excerpt`；判据按 B.2 D1 换为「文件 + 面板」，理由成立 |
| N65-1..9 | 通过 | `notes-path.ts` 零 diff、排序唯一实现；自建两模式与朴素参照逐字段相等；复跑 default/created/with-search/with-chapter/export-and-injection/scope；`62/62b` 已目视 |
| N66-1..9 | 通过 | 走查单一管道与 `countLabel` 单一定点；自建 18 组合交集 + empty-reason 五态；复跑 counts 六态、three-dimensions（三维可见 + 开关两态都 1 行）；既有场景全绿 |
| N67-1..10 | 通过 | 走查（`undoSlot` 恰 1 声明 + 3 赋值 + 1 读取；`notes-restore` 契约；渲染层不拼路径；失败非静默）；自建脚本 76 项（见 终 2）；复跑 notes-undo 全段 |
| N68-1..12 | 通过 | 自建窗口边界 + 常量逐字；复跑 expired（`callsDelta=0`）、row-expired（重挂不复活）、slot-cleared、same-id-occupied、in-flight（`disabled` + `callsDelta=1`）、stale-interleave（零副作用 + 真实 FIFO 落盘） |
| N69-1..9 | 通过 | 自建 copy-fragment 四段逐字；复跑 copy-one（`clipboard.readText()` 逐字）、two-fragments、feedback-reset、failure（非静默且剪贴板未改写）、geometry；`65/65b` 已目视 |
| N70-1..5 | 通过（交付方脚本不可复核） | 终验方自建等价脚本覆盖 9 个断言组；两个仓库外 tsconfig 编译退出 0；`pix/package.json` 零 diff、仓库内零脚本残留 |
| N71-1..7 | 通过 | 走查 SEL 7 项 + 控制口 4 个、stub 槽语义与主进程同序同文案；复跑清单 112 张含 18 张 R10、四组 37 条；基线 94 张/116 条零缺失 |
| N72-1..8 | 通过 | 复跑 exit 0、`failure=null`、无失败日志；check 0；白名单零越界；三个 `v-if` 门 + `.note-copy` 常驻（geometry 实测 `lastChild=note-actions`）；冻结文件零 diff；`notes.json` 字节判据 `hashSame`；无死代码（13 导出均有引用）、无 `any`/内联动态 import |

**未判定 / 未覆盖（终验方明确列出，不构成 passed 例外）**

1. 交付方原始烟测脚本不可复核：按设计档 §0 修订 5 不落仓库、跑完删除；终验方以自建等价脚本覆盖同类断言组（见 终 2）。
2. `undoDelete` 守卫②（离开工作区后在途响应被丢弃）无运行时场景，仅代码走查（`resetNotes` 先 `undoScope += 1`、`undoDelete` 在 `await` 后第一判）；可观测面不足，保留走查结论。
3. 全图像素级 diff 未做：回归以「行内字段 + 截图目视」判定（356 字段相等，仅 `header.h` 与纵坐标位移）。
4. `.note-actions` 极窄栏溢出未覆盖（审查方次级项；不属 N63–N72 判据）。
5. Windows 剪贴板把 LF 规整为 CRLF：离屏逐字断言按 CRLF 归一化后相等（原始值入库），产品 LF 模板由纯函数断言承担。

### 终 6. 结论

check 0 error、git 卫生干净、离屏 112 张 + `failure=null` + 退出码 0、四条撤销路径与失败/槽生命周期独立复验 76 项全绿、18 张 R10 截图与 153 条测量复跑通过、基线零缺失。代码审查 must-fix 1（搜索行冻结字面）已修复并经三面复核：代码（`.notes-search-input` 与 `PdfSearchPanel .search-input` 逐行同款；清空控件为 `v-btn icon="mdi-close"`）、测量（`notes-search|search-row-form` 七项逐字相等：`搜索原文或备注`/26/6px/12px/BUTTON/`v-btn--icon`/`清空搜索`）、截图（`60-notes-search.png` 目视）。**无未销账 must-fix**。
