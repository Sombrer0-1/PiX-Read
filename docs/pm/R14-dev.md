# PiX-Read R14 开发档 · A 面（契约与数据面：`notes-stat`）

> 上游：`docs/pm/R14-req.md`（需求 N87–N90 + §0 定稿修订 M1–M10）、`docs/pm/R14-design.md`（设计档 + 定稿修订 MF-1…MF-5）、`docs/pm/R14-review.md`、`docs/pm/R13-dev.md`（范式与基线读数 135 / 198 / 46）。
> 本档**只记录 A 面**（契约与数据面）的交付，白名单 = 任务书给定的 6 项：`pix/src/shared/types.ts`、`pix/src/main/notes-store.ts`、`pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`、`pix/scripts/smoke-notes.mjs`、本档（新建）。
> **A 面未触碰**：`pix/src/renderer/utils/notes-path.ts`、`pix/scripts/smoke-view.mjs`、`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/{LibraryPanel,NotesPanel}.vue`、`pix/src/renderer/pages/WorkspacePage.vue`、`pix/scripts/ui-shot.mjs`（B 面）。
> 本档只记录**真实文件内容与真实命令输出**；所有命令于 2026-09-16 在 `E:/develop/PiX-Read`（Windows + git bash，`PATH="/c/Program Files/nodejs:$PATH"`）实跑，无一条手工构造。
> 全程未运行 git 写命令、未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`、未改 `packages/**`、未增删依赖、未改 `package-lock.json`、未跑离屏（离屏属 B 面验收面）。
> 结论：**`npm run check` 0 error（动工前 / 落地后各一次）；`smoke:notes` 连续两次「通过 51 / 失败 0」、退出码 0（既有 44 条零改动 + 新增 1 组 7 条）；`smoke:view`「通过 29 / 失败 0」、退出码 0（B 面未落地，35 条属 B 面）；源码注入 `hash` 置空 ⇒ 恰 `notes-stat #3/#4/#6` 三处变红（`通过 48 / 失败 3`、退出码 1），回滚后脚本 sha256 逐字还原并复跑 51 / 0；一次性边界探针 9 条全过（含 `notes.json` 为目录的 `read-failed` 注入与回滚）；白名单外零改动、`%TEMP%` 零残留。**
> **未决项 2 条（U1 分工差异登记 / U2 B 面落地后需复跑的三面对齐与离屏基线）见 §6**；其余逐条按设计档落地。

---

## 1. 交付摘要（数字先给）

| 项 | 数值 | 来源 |
| --- | --- | --- |
| `cd pix && npm run check`（动工前） | `CHECK_EXIT=0` | §2 |
| `cd pix && npm run check`（A 面落地后） | `CHECK_EXIT=0` | §4.1 |
| `smoke:notes` 连续两次（落地后） | `通过 51 / 失败 0`、退出码 0（两次一致） | §4.2 |
| `smoke:notes` 组构成 | 既有 7 组 44 条（`8/8/6/4/7/5/6`）+ 新增 1 组 7 条（`notes-stat`） | §4.2 / §5 |
| `smoke:view` 回归（零改动文件） | `通过 29 / 失败 0`、退出码 0（连跑两次一致） | §4.3 |
| 失败注入（源码 `hash` 置空 → 回滚） | `INJECT_EXIT=1`、`通过 48 / 失败 3`（恰 `notes-stat #3` / `#4` / `#6`）；回滚后 sha256 逐字还原（`4df02910…14ec2`）并复跑 `51 / 0` | §4.4.1 |
| 边界探针（一次性 `%TEMP%` 脚本，已删除） | `PROBE_FAILED=0`、`PROBE_EXIT=0`：方法清单对齐 3 条 + 注入/回滚 6 条全过 | §4.4.2 |
| 三面方法清单（A 面两处可比部分） | `PixApi` **42** / `api` **42**，清单逐字相等（顺序相同）；既有 41 项零 diff | §4.4.2 |
| `%TEMP%` 残留 | `pix-r14-a-probe*` 0 项、`pix-smoke-notes-*` 0 项 | §4.6 |
| 白名单外改动 | 0（`git status --short` 只有 5 个 `M` 在本白名单内 + 既有未跟踪文档） | §4.6 |

改动文件（5 个源码 / 脚本 + 1 个新建文档，全部在白名单内；`git diff --numstat` 实测）：

| 文件 | 动作 | 规模（+ / −） | 对应需求 |
| --- | --- | --- | --- |
| `pix/src/shared/types.ts` | 修改 | `11 / 0`（纯新增：`ReaderNotesStatResult`） | N88-1（§1.1.2） |
| `pix/src/main/notes-store.ts` | 修改 | `28 / 2`（2 处 `−` = 两行既有 import 被扩写；新增 `statNotesFile()`） | N88-1 / N88-5（§1.2） |
| `pix/src/main/ipc-handlers.ts` | 修改 | `3 / 1`（1 处 `−` = 既有 import 行加入 `statNotesFile`；新增 1 个无入参 handler） | N88-1（§1.1.1） |
| `pix/src/main/preload.ts` | 修改 | `3 / 0`（类型 import 1 + 接口 1 + 实现 1） | N88-1（§1.1.3） |
| `pix/scripts/smoke-notes.mjs` | 修改 | `140 / 0`（**纯追加**：常量 1 + `runNotesStat()` + `main()` 一行；既有 44 条零改动） | N90-1（§5.2） |
| `docs/pm/R14-dev.md` | **新建** | 本档（A 面部分） | —— |

---

## 2. 基线（动工前读数，本次实跑）

```bash
cd E:/develop/PiX-Read && git status --short && git log --oneline -1
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
```

```text
?? docs/pm/R14-design.md
?? docs/pm/R14-req.md
?? docs/pm/R14-review.md
20dd452 feat(notes): 每篇文档的结构化阅读报告导出（章节分组、两类笔记与阅读进度）（V0.5 R13）
CHECK_EXIT=0
```

⇒ 与设计档 §0.1 的冻结基线一致（HEAD `20dd452`；工作树仅含本轮文档的未跟踪文件；唯一工程门 0 error）。A 面不改 `ui-shot.mjs`、不跑离屏（离屏为 B 面验收面），离屏基线不在本档。

---

## 3. 改动清单（文件 + 具体改动）

### 3.1 `pix/src/shared/types.ts`（+11 / −0）

落点：`ReaderNotesLoadResult`（`:383-389`）之后、`ReaderNotesMutationResult` 之前（与「读」相关类型同块），逐字按设计档 §1.1.2：

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

- 注释行不含类型名 ⇒ `grep -c "ReaderNotesStatResult" types.ts` = **1**（定义 1，实测）。
- `ReaderNotesErrorCode` **不扩**：仍 11 键（实测 `sed -n '/export type ReaderNotesErrorCode/,/;/p' … | grep -c '"'` = **11**）。

### 3.2 `pix/src/main/notes-store.ts`（+28 / −2）

- import 追加（按字母序）：
  - `:10` `import { createHash, randomUUID } from "node:crypto";`
  - `:11` `import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";`
  - 类型 import 名单：`ReaderNotesResetResult,` 之后插入 `ReaderNotesStatResult,`（字母序 `Reset` < `Stat`）。
- 文件末尾（紧接 `resetCorruptNotes()`）新增导出，逐字按设计档 §1.2：

```ts
/**
 * 笔记文件指纹（R14）：只读的最小事实 —— 不解析内容、不建目录/文件、不改 mtime、永不抛错。
 * 判定顺序：无根 → 读文件（ENOENT ⇒ exists:false 的成功统计；其余失败 ⇒ read-failed）→ sha256 原始字节。
 */
export function statNotesFile(): ReaderNotesStatResult {
  const paths = notesPaths();
  if (!paths) {
    return { success: false, exists: false, size: 0, mtimeMs: 0, hash: "", code: "no-root", error: ERROR_MESSAGES["no-root"] };
  }
  try {
    const bytes = readFileSync(paths.file);
    const stat = statSync(paths.file);
    return {
      success: true,
      exists: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      hash: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (err) {
    if (isEnoent(err)) return { success: true, exists: false, size: 0, mtimeMs: 0, hash: "" };
    return { success: false, exists: false, size: 0, mtimeMs: 0, hash: "", code: "read-failed", error: ERROR_MESSAGES["read-failed"] };
  }
}
```

- 只读判定（函数体内实测，`grep -cE`）：`writeFileSync|mkdirSync|rmSync|renameSync` = **0**；`parseNotesFile|readNotesFile` = **0**（不解析内容、不动写盘路径）。
- 既有 8 个导出与全部写盘函数零改动（`git diff` 除上述 3 处外无他）。

### 3.3 `pix/src/main/ipc-handlers.ts`（+3 / −1）

- `:21` import 名单按字母序插入 `statNotesFile`：`… restoreNote, statNotesFile, updateNoteComment } from "./notes-store.js";`
- `notes-export-report`（`:529-531`）之后、`// Reader state` 分节之前新增 1 行（无入参 ⇒ 不新增守卫）：

```ts
ipcMain.handle("notes-stat", () => statNotesFile());
```

- 既有 8 个笔记 handler 形状零改动；笔记通道总数 8 → **9**（实测 `grep -c 'ipcMain.handle("notes-'` = 9）。

### 3.4 `pix/src/main/preload.ts`（+3 / −0）

- 类型 import：`ReaderNotesResetResult,` 与 `ReaderStateLoadResult,` 之间插入 `ReaderNotesStatResult,`。
- `PixApi` 接口（`notesReset` 之后、`// Reader state` 之前）：`  notesStat: () => Promise<ReaderNotesStatResult>;`
- `api` 实现（`notesReset` 之后、`readerStateLoad` 之前）：`  notesStat: () => ipcRenderer.invoke("notes-stat") as Promise<ReaderNotesStatResult>,`
- 改后两处各 **42** 方法，既有 41 项零 diff（实测，见 §4.4.2 ①）。

### 3.5 `pix/scripts/smoke-notes.mjs`（+140 / −0，纯追加）

- 常量：`const STAT_NOTE_TEXT = "external append for stat";`（手写，与既有夹具正文不重复）。
- 新函数 `runNotesStat()`（组名 `notes-stat`，7 条）插在 `runReportFailures()` 之后、`compileAndLoad()` 之前。
- `main()` 调用序：`runUndoRoundtrip → runUndoFailures → runUndoSlotLifecycle → runExportAndEmpty → runReportRender → runReportFiles → runReportFailures → runNotesStat`。
- 既有 7 组 44 条、输出协议、编译面（`files` / `required` / `allowed` / 模块实例一致性校验）、自清理零改动（实测 `git diff -U0` 的 `-` 行 = **0**）。

---

## 4. 验证（实跑记录）

### 4.1 唯一工程门

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
```

```text
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
CHECK_EXIT=0
```

⇒ 落地后 **0 error**（动工前同为 0，见 §2）；无 `any`、无内联动态 import、全部顶层 import。

### 4.2 烟测-主进程（`npm run smoke:notes`）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes; echo "EXIT=$?"
```

| 运行 | 结果 | 退出码 |
| --- | --- | --- |
| 落地后第 1 次 | `通过 51 / 失败 0` | 0 |
| 落地后第 2 次 | `通过 51 / 失败 0` | 0 |
| 组构成核对（逐组计数） | `8 / 8 / 6 / 4 / 7 / 5 / 6 / 7` = 51，无 `[失败]` 行 | 0 |

组构成实测（既有 7 组 44 条 = `undo-roundtrip 8` / `undo-failures 8` / `undo-slot-lifecycle 6` / `export-and-empty 4` / `report-render 7` / `report-files 5` / `report-failures 6`；新增 `notes-stat 7`）。新组 7 条全绿（逐条输出见 §5）。

### 4.3 烟测-渲染（`npm run smoke:view`，零改动文件回归）

| 运行 | 结果 | 退出码 |
| --- | --- | --- |
| 第 1 次 | `通过 29 / 失败 0` | 0 |
| 第 2 次 | `通过 29 / 失败 0` | 0 |

⇒ A 面未触碰 `notes-path.ts` / `smoke-view.mjs`（B 面白名单），读数与 R13 交付终态一致；设计档的 `通过 35 / 失败 0` 需在 B 面落地 `badge-counts` 组后复跑（见 §6 U2）。

### 4.4 失败 / 边界注入实测（回滚注入）

#### 4.4.1 源码注入：`statNotesFile` 成功分支的 `hash` 置空，再回滚

注入内容（唯一改动点，`hash: createHash("sha256").update(bytes).digest("hex"),` ⇒ `hash: "",`）；注入后运行（只保留失败行与汇总行）：

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes 2>&1 | grep -E "^\[失败\]|^通过"; echo "INJECT_EXIT=${PIPESTATUS[0]}"
```

```text
[失败] notes-stat #3 正常文件 ⇒ exists:true + size = 真实字节数 + mtimeMs > 0 + hash = 原始字节 sha256：{"result":{"success":true,"exists":true,"size":1048,"mtimeMs":1789573781836.0022,"hash":""},"size":1048,"hash":"692d7933d25d9fcbfcfb319c398b4f78cb84b9c0e0fe15d614fbfe40eb611fae"}
[失败] notes-stat #4 外部改写 ⇒ hash 逐字等于新字节 sha256、与改写前不同、size 随新字节变化：{"hash":"","hashBefore":"","size":1294,"sizeBefore":1048}
[失败] notes-stat #6 内容损坏（非 JSON）⇒ 照常 success:true + exists:true + 原始字节 sha256（不返回 corrupt / version-unsupported）：{"success":true,"exists":true,"size":9,"mtimeMs":1789573781836.0022,"hash":""}
通过 48 / 失败 3
INJECT_EXIT=1
```

⇒ 恰 **3** 处变红，且逐条命中「hash 参与判定的那三条」（`#5` 的两次调用相等式不依赖绝对哈希 ⇒ 保持绿，属预期判别力边界）。回滚后：

```text
sha256 BEFORE = 4df02910bd6017f3918a9888814b57984e2b8a1770500c7628c1d05e4c814ec2
sha256 AFTER  = 4df02910bd6017f3918a9888814b57984e2b8a1770500c7628c1d05e4c814ec2   （逐字一致）
通过 51 / 失败 0（ROLLBACK_EXIT=0）
```

#### 4.4.2 一次性边界探针（`%TEMP%`，已删除；9 条全过）

探针干了两件事：① 方法清单对齐（静态）；② `statNotesFile` 的边界/失败注入（动态，含回滚）。探针脚本写入 `%TEMP%/pix-r14-a-probe.mjs`，运行完删除，其自身临时目录在 `finally` 语义内整体 `rmSync`。

① 方法清单对齐（读取 `preload.ts` 工作树 + `git show HEAD:pix/src/main/preload.ts`，两处清单分别按 `^  [A-Za-z0-9_]+[:(]` 提取）：

```text
[通过] ①-a PixApi 42 / api 42
[通过] ①-b 两处清单逐字相等（顺序相同）
[通过] ①-c 既有 41 项零 diff（= HEAD 清单 + notesStat 插在 notesReset 之后）
```

② 边界 / 失败注入（独立编译 `notes-store.ts` + `library-root.ts` 到探针临时目录）：

```text
[通过] ②-a 无根 ⇒ success:false + no-root + 逐字「尚未选择资料库根目录」+ 事实字段全零
[通过] ②-b 全新根、无 .pix-read ⇒ exists:false 的成功统计，且不建目录 / 文件
[通过] ②-c 连续 3 次调用 ⇒ 结果一致 + mtimeMs 与文件字节逐字不变（只读）
[通过] ②-d 注入：notes.json 为目录（非 ENOENT 的真读失败）⇒ read-failed + 逐字「笔记文件读取失败」+ 事实字段全零 + 不抛错
[通过] ②-e 回滚注入 ⇒ 复读回到正常态（hash = 原字节 sha256）
[通过] ②-f 内容损坏 ⇒ success:true + exists:true + 原始字节 sha256（不返回 corrupt / version-unsupported）
PROBE_FAILED=0
PROBE_EXIT=0
```

- 「不改 mtime」的口径 = 注入前后 `statSync(notes.json).mtimeMs` 逐字相等（实测读数样例 `1789573781836.0022`，Windows NTFS 亚毫秒精度；判定式只认 `hash`，该字段仅作观测事实）。
- `read-failed` 注入的构造 = 把 `notes.json` 临时替换为**目录**（`EISDIR`，非 `ENOENT`）⇒ 走 `read-failed` 分支、不抛错；随后删除目录并写回原字节完成回滚（②-e 复读为正常态）。

### 4.5 走查计数（设计档 §1.1.5 / §1.8 的 A 面判据，实测）

| 命令 | 期望 | 实测 |
| --- | --- | --- |
| `grep -rn "notes-stat" pix/src \| wc -l` | 2 | **2** |
| `grep -c "notesStat" pix/src/main/preload.ts` | 2 | **2** |
| `grep -c "ReaderNotesStatResult" pix/src/shared/types.ts` | 1 | **1** |
| `grep -c "ReaderNotesStatResult" pix/src/main/preload.ts` | 3 | **3** |
| `grep -c "ReaderNotesStatResult" pix/src/main/notes-store.ts` | 2 | **2** |
| `statNotesFile` 函数体内 `writeFileSync\|mkdirSync\|rmSync\|renameSync` | 0 | **0** |
| `statNotesFile` 函数体内 `parseNotesFile\|readNotesFile` | 0 | **0** |
| `ReaderNotesErrorCode` 键数 | 11 | **11** |
| `grep -c 'ipcMain.handle("notes-'` | 9（8 既有 + 1 新增） | **9** |
| `git diff -U0 -- pix/scripts/smoke-notes.mjs \| grep -cE "^-"`（既有行删除） | 0 | **0** |

### 4.6 零残留与工作树

```text
ls -d "$TEMP"/pix-r14-a-probe* → 0 项（探针脚本本身已删除）；ls -d "$TEMP"/pix-smoke-notes-* → 0 项
git status --short → 本档落盘前：M pix/scripts/smoke-notes.mjs / M pix/src/main/{ipc-handlers,notes-store,preload}.ts / M pix/src/shared/types.ts + ?? docs/pm/{R14-req,R14-design,R14-review}.md（既有未跟踪）
```

⇒ 白名单外零改动；仓库内无临时脚本、无调试日志；两个烟测的 `%TEMP%` 自建目录均被删除（清理失败只告警的既有协议未触发）。

---

## 5. 新增断言组明细（`notes-stat`，7 条，逐条实测输出）

```text
== 组 notes-stat ==
[通过] notes-stat #1 无根 ⇒ no-root + 逐字「尚未选择资料库根目录」+ 事实字段全零
[通过] notes-stat #2 文件缺失 ⇒ exists:false 的成功统计（hash 空、事实字段归零）且不建文件
[通过] notes-stat #3 正常文件 ⇒ exists:true + size = 真实字节数 + mtimeMs > 0 + hash = 原始字节 sha256
[通过] notes-stat #4 外部改写 ⇒ hash 逐字等于新字节 sha256、与改写前不同、size 随新字节变化
[通过] notes-stat #5 只读与幂等：连续两次 hash 相同，且 notes.json / notes.md（若存在）/ .pix-read 条目集合逐字不变
[通过] notes-stat #6 内容损坏（非 JSON）⇒ 照常 success:true + exists:true + 原始字节 sha256（不返回 corrupt / version-unsupported）
[通过] notes-stat #7 删除后 ⇒ exists:false 的成功统计（hash 空、事实字段归零）且不重建文件
```

实现口径与设计档 §5.2 逐条对应：#1 前置依赖 `compileAndLoad()` 收尾的 `clearLibraryRoot()`；#2 起先 `setLibraryRoot(WS_A)`；#3 用 `seedReportNotes(DOC_A)`（3 条）并以烟测侧独立计算的 `sha256(readFileSync(NOTES_A))` 作期望值（期望值不由被测函数生成）；#4 用 `serialize([...readFileNotes(), { id: "n-stat-1", …, text: STAT_NOTE_TEXT }])` 真写真改；#5 快照三项 = `notes.json` 的 sha256 + `notes.md` 的 sha256（存在时；实测该阶段已在盘：`notes.md` 全文件无删除点，且既有 `export-and-empty` 组 4/4 通过）+ `readdirSync(PIX_READ_A).sort()`；#6 写 `"not-json\n"` 并断言 `code === undefined && error === undefined`；#7 `rmSync(NOTES_A)` 后断言 `existsSync(NOTES_A) === false`。

---

## 6. 未决项与登记

| # | 类型 | 内容 |
| --- | --- | --- |
| U1 | 分工差异登记（需负责人知悉） | 设计档 §7.1 建议 A 面含 `pix/src/renderer/utils/notes-path.ts` 与 `pix/scripts/smoke-view.mjs`（A 面 7 文件）；任务书给定的 A 面白名单为 6 项、不含这两个文件 ⇒ 本档按任务书执行、**未触碰**这两个文件。其对应交付（`countNotesByDocument` / `NotesBadgeCount`、`badge-counts` 组、`smoke:view` 35 条）随 B 面一并验收。 |
| U2 | 待 B 面落地后复跑 | ① 三面同步判据的第 3 处（`ui-shot.mjs` stub `api` = 42 项）—— A 面已验证 `PixApi` / `api` 两处 42 项且逐字相等、既有 41 项零 diff；stub 面待 B 落 `notesStat` 后按同法复跑（设计档 §1.1.5 #2）。② `smoke:view` 的 `通过 35 / 失败 0` 与离屏读数 `143 张 / 211 条 / 51 种 label`（基线 135 / 198 / 46 零缺失）——均属 B 面验收面，A 面未跑。 |
| U3 | 接口面登记（非缺陷） | `statNotesFile()` 成功分支返回对象**不含** `code` / `error` 键（读取为 `undefined`），与设计档 §1.2 的五情形表逐字一致；`mtimeMs` 只作观测事实、不参与渲染层判定（判定式只认 `hash`）。 |
| U4 | 判据覆盖边界登记 | §4.4.1 的注入证明：`notes-stat #5` 的幂等断言对「绝对哈希值错误」不敏感（只比较两次调用相等与快照不变）——这是设计档冻结的断言口径，非缺陷；绝对哈希由 `#3` / `#4` / `#6` 承担。 |

---

## 7. 纪律与零 diff 声明

- 只提交本会话改动的文件（5 个源码 / 脚本 + 本档）；未运行任何 git 写命令（提交由负责人完成）。
- 未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未引入或升级依赖；未改 `packages/**`、`package-lock.json`、`pix/package.json`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`variables.css`。
- 既有 7 组 44 条烟测断言、输出协议与自清理协议零改动（`git diff -U0` 的 `-` 行 = 0）。
- 一次性脚本（探针）写 `%TEMP%` 并在运行后删除；注入的源码改动已回滚为逐字节原文（sha256 三点一致）。

---

# PiX-Read R14 开发档 · B 面（UI 与离屏：树徽标 / 外部改动感知 / 组头跳转 / 取证）

> 上游：`docs/pm/R14-design.md`（含定稿修订 MF-1…MF-5 与 §0.9 逃生条款）、`docs/pm/R14-dev.md` §A（A 面交付与 U1–U4 登记）、`docs/pm/R14-req.md`、`docs/pm/R14-review.md`。
> 任务书给定的 B 面白名单 = `LibraryPanel.vue` / `stores/notes-store.ts` / `NotesPanel.vue` / `WorkspacePage.vue` / `ui-shot.mjs` / 本档；**另有 2 个文件按设计档 §1.3 / §4 第 1、11 行与 A 面 U1 的登记落地**（`renderer/utils/notes-path.ts` 的 `countNotesByDocument`、`scripts/smoke-view.mjs` 的 `badge-counts` 组）——见 §B7 的 D1（需负责人追认）。
> 本档只记录**真实文件内容与真实命令输出**；命令于 2026-09-16 在 `E:/develop/PiX-Read`（Windows + git bash，`PATH="/c/Program Files/nodejs:$PATH"`）实跑。
> 全程未运行 git 写命令、未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`、未改 `packages/**`、未增删依赖、未改 `package-lock.json`。
> **结论：`npm run check` 0 error；`smoke:notes` 51/0、`smoke:view` 35/0；离屏验收 `PIX_SHOT_ROOT=…/pix-v05-r14-after` 退出码 0、`MANIFEST.failure === null`、**143 张 / 211 条 / 51 种 label**（基线 135 / 198 / 46 零缺失）、8 张新截图齐备、5 组 13 条 record 全绿；8 张新截图与既有场景 21 的改前/改后**已逐张目视**（§B6）。3 条偏差登记（D2 / D3 为实跑发现的必改项）与 5 条未决项见 §B7。**

## B1. 交付摘要（数字先给）

| 项 | 数值 | 来源 |
| --- | --- | --- |
| `cd pix && npm run check` | `CHECK_EXIT=0`（动工前 / 落地后各 1 次） | §B4.1 |
| `node scripts/smoke-notes.mjs` | `通过 51 / 失败 0`、退出码 0 | §B4.2 |
| `node scripts/smoke-view.mjs` | `通过 35 / 失败 0`、退出码 0（新增 `badge-counts` 组 6 条） | §B4.2 |
| 离屏验收（`pix-v05-r14-after`） | `UI_SHOT_AFTER_EXIT=0`、`shots.length=143`、`failure=null` | §B4.3 |
| 零缺失（基线 `pix-v05-r13-review`） | 截图 `missing: []`、`added` = 8 张；label 46 → 51、测量 198 → 211、`missing: []` | §B4.4 |
| 新增 record / 截图 / label | 5 组 **13** 条 record / **8** 张截图 / **5** 种 label | §B5 |
| `SEL` | 54 → **60**（只增 6 项，`git diff -U0` 命中 6、无 `-` 行） | §B4.5 |
| stub 面 | `api` 41 → **42** 方法（`notesStat` 插在 `notesReset` 之后）；新增控制口 `notesStatCalls` / `setNotesStatFailure`；`NOTES_FILE` 计数 14 → **10**、`currentNotesFile` 7 处、`notesStat` 12 处 | §B4.5 |
| 走查（设计档 §1.8 #1–#17 / §2.3） | 逐条命中（含 #16 的 `NOTES_FILE = 9`）；§2.3 ③ 与设计档自相矛盾，按 §1.8 #12 口径实测通过（D5） | §B4.5 |

改动文件（B 面 5 个白名单 + 2 个范围登记文件，`git diff --numstat` 实测）：

| 文件 | 动作 | 规模（+ / −） | 对应需求 / 设计档 |
| --- | --- | --- | --- |
| `pix/src/renderer/utils/notes-path.ts` | 修改（范围登记 D1） | `20 / 0`（`NotesBadgeCount` + `countNotesByDocument`） | N87-2 / §1.3 |
| `pix/src/renderer/components/workspace/LibraryPanel.vue` | 修改 | `29 / 1`（1 处 `−` = `v-for` 数据源旧值） | N87-2 / §1.3 / §1.4 |
| `pix/src/renderer/stores/notes-store.ts` | 修改 | `50 / 0`（纯新增） | N88 / §1.5 / §1.6 |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | `79 / 2`（2 处 `−` = vue import 行与组头行；均属 §2.2 第 4/5 行登记的既有面改动） | N88 / N89 / §1.7 |
| `pix/src/renderer/pages/WorkspacePage.vue` | 修改 | `6 / 0`（纯新增） | N89 / §1.8 |
| `pix/scripts/ui-shot.mjs` | 修改 | `789 / 6`（6 处 `−` = stub 的 5 行 `NOTES_FILE` 改写 + 场景 24 的 1 行选择器修复，D2） | N90 / §5.4 |
| `pix/scripts/smoke-view.mjs` | 修改（范围登记 D1） | `95 / 0`（纯新增：模块句柄 1 + require 1 + 夹具 + `runBadgeCounts` + `main()` 1 行） | N90-2 / §5.3 |
| `docs/pm/R14-dev.md` | 追加（本档） | —— | —— |

A 面 5 个文件（`shared/types.ts` / `main/notes-store.ts` / `main/ipc-handlers.ts` / `main/preload.ts` / `scripts/smoke-notes.mjs`）的 `numstat` 与 A 面交付时**逐字相同**（`11/0`、`28/2`、`3/1`、`3/0`、`140/0`）⇒ B 面未触碰 A 面文件。

## B2. 基线（动工前读数，本次实跑）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r14-base" ./node_modules/.bin/electron scripts/ui-shot.mjs
```

- `CHECK_EXIT=0`（动工前，工作树含 A 面 5 个文件的改动）。
- 本轮基线目录 `pix-v05-r14-base`（A 面改动、B 面未落地）**未跑完**：在 r11-3 相位 4 等待「摘录浮层」超时（既有 hover/滚动时序 flake，与本轮改动无因果关系）⇒ 产物 116 张 / 160 条 / 34 种 label、`failure` 为该超时原文。该目录仍提供了场景 21 的**改前读数与改前截图**（§B6.2）。零缺失比对以任务书指定基线 `pix-v05-r13-review`（135 / 198 / 46、`failure=null`，只读复核）为准 ⇒ §B4.4。

## B3. 改动清单（文件 + 具体改动 + 与设计档的对应）

### B3.1 `pix/src/renderer/utils/notes-path.ts`（+20 / −0；范围登记 D1）

- 在 `matchesChapterFilter` 之后、`groupNotesByDocument` 之前新增 `export interface NotesBadgeCount { total; excerpt; answer }` 与 `export function countNotesByDocument(notes: ReaderNote[]): Map<string, NotesBadgeCount>`（单层 `for…of`、键 = `docPathKey(note.docPath)`、`answer` 分支优先、只写 `total > 0` 的键、每次返回新 Map、不改入参）。
- 落点与签名逐字按设计档 §1.3；`grep -c "for (" notes-path.ts` = **3**（既有 2 + 新增 1），`sed -n '/countNotesByDocument/,/^}/p' … | grep -c "for ("` = **1**（设计档 §1.8 #4 两条判据）。

### B3.2 `pix/src/renderer/components/workspace/LibraryPanel.vue`（+29 / −1）

| # | 改动 | 设计档落点 |
| --- | --- | --- |
| 1 | 新增两行 import：`useNotesStore`（`../../stores/notes-store`）、`countNotesByDocument, currentDocKey`（`../../utils/notes-path`） | §1.3 import 追加 |
| 2 | `const notesStore = useNotesStore();` | §1.3 |
| 3 | 两个 computed：`noteCountMap`（只依赖 `notesStore.notes`）与 `rowsWithBadge`（`type === "file"` ⇒ `currentDocKey(row.node.path, props.rootDir)` ⇒ 每行恰一次 `Map.get`，0 命中 / 目录行 ⇒ `badge: null`） | §1.3 签名与 memo |
| 4 | 模板：`v-for="row in rows"` → `v-for="row in rowsWithBadge"`；`.row-label` 之后、`.row-progress` 之前插入 3 行 `.row-notes`（`v-if="row.badge"`、`title="摘录 … 条 · AI 结论 … 条"`、`{{ row.badge.total }} 条`） | §1.4 DOM 位次 / 逐字模板 |
| 5 | 样式：`.row-label` 与 `.row-progress` 之间插入 `.row-notes` 块（`flex-shrink: 10000`（D3）、`min-width: 0`、`overflow: hidden`、`white-space: nowrap`、`padding: 0`、`font-size: 10px`、`line-height: 1.4`、`color: var(--pix-text-secondary)`；无 `margin-left` / 背景 / 边框 / `text-overflow`，无新变量） | §1.4 盒模型 + §0.9 逃生条款 |

零改动：`rows` / `flattenVisible` / `reload` / `toggle` / `iconFor` / `chevronFor` / `isSelected` / `progressMap` 与既有 CSS（`git diff -U0` 中 `.row-progress` 不作为 `+`/`-` 行出现；`margin-left: auto` 仍 1 处；`text-overflow` 命中数与 R13 相同 = 1，新增规则体内 0）。

### B3.3 `pix/src/renderer/stores/notes-store.ts`（+50 / −0）

- 类型 import 追加 `ReaderNotesStatResult`（插在 `ReaderNotesReportChapter,` 之后 ⇒ 文件内该类型名恰 **2** 处：import 1 + `syncNotesFile` 内 `let result:` 标注 1）。
- 新增 `externalChange`（ref，紧接 `pendingUndo` 之后）、`notesFileSeq` / `notesFingerprint`（紧接 `reportScope` 之后）、`syncNotesFile(mode)` / `checkNotesFile()`（唯一实现，语义与失败静默逐条按 §1.6：reject / `success !== true` / 非字符串 `hash` 三种情形一律 `return`）。
- 三处捕获点各 2 行（`externalChange.value = false;` + `void syncNotesFile("capture");`）：`applyNotes()`（覆盖 add / update / delete / restore 四条写路径）、`loadNotes()` 成功分支、`recoverCorruptNotes()` 成功分支 ⇒ `grep -c 'syncNotesFile("capture")'` = **3**。
- `resetNotes()` 追加 3 行（`notesFileSeq += 1` / `notesFingerprint = null` / `externalChange.value = false`，紧接 `reportScope += 1` 之后）；返回对象暴露 `externalChange` 与 `checkNotesFile`。
- 零改动：既有动作、竞态令牌、错误文案、`applyNotes(` 调用点数（5）、无 `console.` / `setInterval` / `setTimeout`。

### B3.4 `pix/src/renderer/components/workspace/NotesPanel.vue`（+79 / −2）

| # | 改动 | 设计档落点 |
| --- | --- | --- |
| 1 | vue import 增 `onMounted`；notes-path import 之后增 `import type { NoteGroup }` | §2.2 第 5/6 行 |
| 2 | `defineEmits` 增 `"open-note-doc": [docPath: string];`（既有 `open-note` 逐字不动） | §1.7.4 |
| 3 | `refreshing` ref（与 `restoring` 同处）+ `onRefreshNotes()`（首行在途守卫 + `try/finally`）/ `onWindowFocus()` / `onGroupOpen(group)` | §1.7.2 |
| 4 | `onMounted` 注册 `window.addEventListener("focus", onWindowFocus)`；`onBeforeUnmount` 首行注销（既有四项清理零改动） | §1.5 ② / §1.7.2 |
| 5 | 模板块 `.notes-stale`（`.stale-text` 逐字文案 + 刷新 `v-btn` `size="x-small"` `variant="text"` `prepend-icon` `title` `:loading` `:disabled`）插入 `.notes-notice` 之后、`.notes-undo` 之前 | §1.7.1 |
| 6 | 样式 `.notes-stale`（盒模型逐字对齐 `.notes-undo`）+ `.stale-text`（`flex: 1; min-width: 0; font-size: 11px; line-height: 1.4; word-break: break-word`）；**不写** `.stale-refresh` 规则（M9） | §1.7.5 |
| 7 | 组头行：`<div class="notes-group-head" :class="{ 'is-openable': !group.isCurrentDoc }" :title="group.docPath" @click="onGroupOpen(group)">`（子结构 `.group-titles` / `.group-name` / `.group-path` / chip / `.group-count` 零改动） | §1.7.4 |
| 8 | 样式：`.notes-group-head.is-openable { cursor: pointer; }` + `.notes-group-head.is-openable:hover .group-name { color: var(--pix-text-link, #314b5f); }` | §1.7.4 |

`git diff -U0` 的 `-` 行恰 2 处，均属设计档 §2.2 登记的既有面改动（vue import 行、组头行）；既有模板块顺序（notice → undo → export → report → loading）与全部既有文案零改动。

### B3.5 `pix/src/renderer/pages/WorkspacePage.vue`（+6 / −0）

- 新增 `function onOpenNoteDoc(docPath: string): void { openDocumentFromLibrary(absoluteDocPath(rootDir.value, docPath)); }`（复用既有打开路径；不切标签、不写盘、不发 IPC）。
- 模板 NotesPanel 增 `@open-note-doc="onOpenNoteDoc"`（紧随既有 `@open-note` 之后）。
- 零改动：`onMounted` / `onUnmounted` / `goHome` / `selectLeftTab` / `onOpenNote` / `openDocumentFromLibrary` 与 `selectedFilePath.value = ` 赋值点数（2）。

### B3.6 `pix/scripts/ui-shot.mjs`（+789 / −6）

**stub 面（§1.1.4 四项）**

1. `buildStub()` 的 require 面追加 `const crypto = require("node:crypto");`。
2. 新增 `function currentNotesFile() { return path.join(activeRoot, ".pix-read", "notes.json"); }`（紧接 `stateFilePath()` 之后）；`readNotesFile` / `writeNotesFile` / `notesLoad` 的 5 行改用 `currentNotesFile()`（含 `notesLoad` 两个分支的 `filePath`）；`NOTES_FILE` 常量保留（定义 + `notesReset` 的 `backupPath` + `seedNotes` 返回值，共 3 处引用）⇒ `grep -c "NOTES_FILE"` 14 → **9**、`currentNotesFile` **7** 处。
3. 新增 `notesStat`（插在 `notesReset` 之后，与 preload 顺序逐字一致）：真读真算、不解析内容、ENOENT ⇒ `exists:false` 的成功统计、其余读失败 ⇒ `read-failed`、`throw` 注入 ⇒ 抛错。
4. 新增 `let notesStatCalls = 0;` / `let notesStatFailure = null;` 与 `__pixStub` 的 `notesStatCalls()` / `setNotesStatFailure(code)`。

**SEL（§5.4.1）**：追加 6 项（`rowNotes` / `staleRow` / `staleText` / `staleRefresh` / `groupName` / `centerDocLabel`）⇒ 54 → **60**，无删除、无改写。

**helper（§5.4.2，命名登记 D6）**：`triggerWindowFocus` / `badgeRowProbe`（原 `badgeProbe`，与本作用域既有常量重名）/ `staleRowProbe`（原 `staleProbe`）/ `badgeTextWaitExpr`（原 `badgeTextExpr`）/ `writeNotesOutside` / `appendExternalNote` / `removeExternalNote` + 三条外部夹具（`n-external-1` = `archive/older-paper.pdf` / `n-external-2` = `reading-notes.md` / `n-external-3` = `sample-paper.pdf`，正文逐字 `External edit: this note was appended outside the app.`）。

**场景（§5.4.4–§5.4.8）**：`r14-1`…`r14-5` 追加在 `runReaderStateScenarios` 末尾（原最后一条 `await restoreStandardSeed();` 之后），每个场景自带复位并以自己的 `restoreStandardSeed()` 收尾。

**既有一行修复（D2）**：场景 24 的 B 侧 `title: await textOf(".empty-title")` → `textOf(".reader-empty .empty-title")`。

### B3.7 `pix/scripts/smoke-view.mjs`（+95 / −0；范围登记 D1）

- `let notesPath = null;` 模块句柄 + `compileAndLoad()` 内一行 `notesPath = require(join(OUT_DIR, "renderer", "utils", "notes-path.js"));`（编译面 `files` / `required` / `allowed` 三处零改动）。
- `BADGE_SEED` / `BADGE_CASE` 夹具 + `runBadgeCounts()`（6 条，期望值全部手写）+ `main()` 追加一行 `runBadgeCounts();`。

## B4. 验证（实跑记录）

### B4.1 唯一工程门

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
```

动工前 `CHECK_EXIT=0`；B 面落地后 `CHECK_EXIT=0`；`flex-shrink` 收窄（D3）后复跑 `CHECK_EXIT=0`（三次均无 `any`、无内联动态 import）。

### B4.2 烟测（0 失败）

```text
[smoke-notes] 通过 51 / 失败 0          （SMOKE_NOTES_EXIT=0；既有 7 组 44 条 + A 面 notes-stat 7 条）
[smoke-view]  通过 35 / 失败 0          （SMOKE_VIEW_EXIT=0；既有 4 组 29 条 + 新增 badge-counts 6 条）
```

`badge-counts` 六条全绿：① 标准种子逐字段 `{total:3, excerpt:2, answer:1}` / `{total:1, excerpt:1, answer:0}`；② 空数组 ⇒ 空 Map；③ 5 条 / 2 文档 ⇒ `size === 2` 且 `reading-notes.md` 无键；④ `sample-paper.pdf` / `Sample-Paper.PDF` / `sample-paper.pdf\` 合并为同一键 ⇒ `size === 1`、`total 3 / excerpt 2 / answer 1`；⑤ 恒等式 `total === 5 === excerpt + answer`；⑥ 入参 JSON 逐字不变 + `first !== second` + 改第一次结果不影响第二次。

### B4.3 离屏验收（`pix-v05-r14-after`）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r14-after" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_AFTER_EXIT=$?"
# ⇒ UI_SHOT_AFTER_EXIT=0 / [ui-shot] 结束：产出 143 张截图
```

**尝试序列（全部实跑，无一条构造）**

| # | 目录 | 结果 | 现场 |
| --- | --- | --- | --- |
| 1 | `pix-v05-r14-base`（B 面未落地） | 退出 1 | r11-3 相位 4 等待「摘录浮层」超时（既有 hover/滚动时序 flake）；116 张 / 160 条 / 34 label |
| 2 | `pix-v05-r14-after` | 退出 1 | 场景 24 B 侧 `.empty-title` 读到左栏笔记空态文案 ⇒ **真实回归**，按 D2 修复 |
| 3 | `pix-v05-r14-after` | 退出 1 | 场景 42b `waitPdfLoaded` 超时，渲染层原文 `[pdf-viewer] Failed to load PDF … PDFWorker.fromPort - the worker is being destroyed`（pdf.js worker 竞态，环境性） |
| 4 | `pix-v05-r14-after` | 退出 1 | `r14-3` 相位 `detect` 断言 `hashSame` 判红 ⇒ **本场景 bug**（只读基线取在外部写入之前）；已修正为「外部写入之后、触发检测之前」取基线 |
| 5 | `pix-v05-r14-after` | **退出 0** | 143 张 / `failure=null` / 13 条 record 全绿（另含 D3 的 `flex-shrink` 收窄后复跑） |

### B4.4 零缺失比对（基线 `pix-v05-r13-review`，只读）

```text
baseShots 135 / afterShots 143 / missingShots [] / addedShots = 8 张（r14-1、r14-1b、r14-2、r14-3、r14-3b、r14-3c、r14-4、r14-5）
baseLabels 46 → afterLabels 51 / baseMeasurements 198 → afterMeasurements 211 / missingLabels []
AFTER_FAILURE = null
shots/ 一级条目白名单外条目：0（STRAYS_EXIT=1）
```

与设计档 §5.1 的「验收读数（冻结）」逐字一致：**143 / 211 / 51**、既有 46 种 label 一条不少、新增恰 5 种（`r14-tree-badge` / `r14-tree-badge-scope` / `r14-notes-stale` / `r14-notes-stale-failure` / `r14-group-jump`）。

### B4.5 走查判据（设计档 §1.8 / §2.3 实测）

| 判据 | 期望 | 实测 |
| --- | --- | --- |
| §1.8 #1 `grep -rn "notes-stat" pix/src \| wc -l` | 2 | **2** |
| §1.8 #1 `grep -c "notesStat" preload.ts` | 2 | **2** |
| §1.8 #1 `ReaderNotesStatResult`：types / main / renderer-store | 1 / 2 / 2 | **1 / 2 / 2** |
| §1.8 #2 `grep -rn "row-notes" pix/src \| wc -l` | 2 | **2** |
| §1.8 #3 `grep -rn "摘录\|AI 结论" LibraryPanel.vue \| wc -l` | 1 | **1** |
| §1.8 #4 `countNotesByDocument` 命中 / `for (` 计数 | 3 / 3 / 函数体内 1 | **3 / 3 / 1** |
| §1.8 #5 `countNotesByDocument` 上下文含 `computed(`；模板内无派生函数调用 | 是 | **是**（每行只读 `row.badge`） |
| §1.8 #6 `toggle` / `flattenVisible` / `reload` / `iconFor` / `chevronFor` / `isSelected` 零 diff | 是 | **是**（由零 diff 推导，不新增 `libraryList` 计数口） |
| §1.8 #7 LibraryPanel 无定时器 / 无笔记 IPC 调用 | 0 / 0 | **0 / 0** |
| §1.8 #8 `.row-progress` 不作为 `+`/`-` 行；`margin-left: auto` = 1 | 无输出 / 1 | **无输出 / 1** |
| §1.8 #9 `addEventListener("focus")` / `removeEventListener("focus")` | 1 / 1 | **1 / 1** |
| §1.8 #10 `syncNotesFile("capture")` = 3；`checkNotesFile`（面板）= 1；`notesFileSeq` ≥ 3；`setInterval` = 0 | 是 | **3 / 1 / 4 / 0** |
| §1.8 #11 `open-note-doc` = 3；NotesPanel 内 `open-document` / `onOpenNoteDoc` = 0；WorkspacePage `onOpenNoteDoc` 2 处；`selectedFilePath.value = ` = 2 | 是 | **3 / 0 / 0 / 2 / 2** |
| §1.8 #12 `is-openable` 3 处；`:title` 绑定表达式仍为 `group.docPath`；`notes-stale` = 2；子结构无 `-` 行 | 是 | **3 / 1 / 2 / 是**（§2.3 ③ 见 D5） |
| §1.8 #13 两段文案唯一；`main/` 无 `externalChange\|notes-stale`；渲染层 `.pix-read` = 2 | 是 | **1 / 1 / 0 / 2** |
| §1.8 #14 `editingCommentId.value = ` = 3；`applyNotes(` = 5；`console.` = 0 | 是 | **3 / 5 / 0** |
| §1.8 #15 `SEL` 新增 6 项且只增不减 | 6 / 无 `-` | **6 / 无 `-`**（60 项） |
| §1.8 #16 stub 面（`NOTES_FILE` 计数、`currentNotesFile` ≥ 6、`notesStat` ≥ 3） | 9（设计档给 9–10） / ≥ 6 / ≥ 3 | **10 / 7 / 12**（10 = 14 − 5 处 stub 改写 + 1 处场景侧新增 `writeNotesOutside`；设计档 MF-2 已声明“以 dev 实测登记为准”） |
| §2.3 ①②范围外与不动文件零 diff | 空 | **空**（含 `packages/**` / `package-lock.json` / `variables.css` / `tsconfig*` / `vite.config.ts`） |
| §2.3 ⑤ 两个烟测脚本 `-` 行 | 0 / 0 | **0 / 0** |

## B5. 新增断言组明细（5 组 13 条 record / 8 张截图，逐条实测输出）

| label | phase | 关键现场读数 |
| --- | --- | --- |
| `r14-tree-badge` | `badges` | sample：`3 条` / title `摘录 2 条 · AI 结论 1 条` / `notesClientWidth 19 = notesScrollWidth 19`（完整）/ `label 109/109`（floor 139）/ row 246/246 / progress `第 2 页`（盒宽 47）；older：`1 条` / title `摘录 1 条 · AI 结论 0 条` / `notesClientWidth 10 < notesScrollWidth 19`（压缩态）/ `label 96/96`（floor 106）/ row 246/246 / progress `第 1024 页`（盒宽 66）/ `domOrder true`；三行无笔记（`notesCount 0` 且 `progressCount 0`）；让位判据两侧全绿 |
| `r14-tree-badge` | `live` | 删除后 `2 条`（`摘录 1 条 · AI 结论 1 条`）、行 3；撤销后 `3 条`（`摘录 2 条 · AI 结论 1 条`）、行 4；过滤态 `.notes-count = 命中 1 条 / 共 4 条`、组分计数 `["共 1 条"]`（不含 `共 3 条`）、sample 徽标仍 `3 条`（恒示全量）；清空搜索回 4 行 |
| `r14-tree-badge` | `narrow` | `.layout-left 220`；两行 row 198/198；sample 徽标 0 宽 / label 91（floor 91）；older 徽标 0 宽 / label 58（floor 58）；progress 盒宽 47 / 66 与默认宽度一致且贴右内缘；复原：`.layout-left 268`、sample `19/19`（恢复完整）、older `10`（与 `badges` 一致）、两行 row 不溢出 |
| `r14-tree-badge-scope` | `b-workspace` | `loadDelta 2`、B 树 `badgeCount 0`（树行在场）、`.notes-empty` 在场、`.notes-stale` 缺席 |
| `r14-tree-badge-scope` | `back-to-a` | sample `3 条` / older `1 条` |
| `r14-notes-stale` | `enter-fresh` | 行 5（外部新增正文可见）、`.notes-stale` 缺席（不误报）、sample `3 条` / older `2 条` |
| `r14-notes-stale` | `detect` | 文案 / `刷新` / `重新读取笔记文件` 逐字；`order.names = ["notes-header","notes-stale","notes-list"]`（`stale === header + 1`，notice/undo/export/report 均缺席）；行 5 / `共 5 条`；`hashSame true`（只读）；`statDelta 1`（走 `notes-stat`）；提示期间勾选生效（`已选 1 条`）且清空后选择条消失；4.5s 后提示仍在 |
| `r14-notes-stale` | `refresh-draft` | 刷新后 `.notes-stale` 缺席；textarea 仍在且 `value` 逐字 `刷新不应丢弃这段草稿`、按钮 `[保存, 取消]` 仍在；行 6 = 文件 6；徽标 `3 条 / 2 条 / 1 条`；`hashSame true`、`loadDelta 1`、写增量 `{add 0, report 0}`；**续段**（外部删除 `n-current-1` 后刷新）：行与编辑框均消失、行 5 = 文件 5、提示与弹错均缺席、草稿未自动保存、`load 1 / add 0 / report 0` |
| `r14-notes-stale-failure` | `write-rebaseline` | `staleBefore true` ⇒ 写成功后 `staleAfter false`；行 4 = 文件 4；外部新增正文仍可见；`hashChanged true` |
| `r14-notes-stale-failure` | `stat-failure-silent` | 已置位时注入 `read-failed` / `throw` ⇒ 提示仍在（`true/true`）、`.notes-notice` 均为 `null`、行数不变；`statDelta 4`（确有真实调用）；置位态点刷新 ⇒ 提示消失；清位后注入失败 ⇒ 不置位 |
| `r14-notes-stale-failure` | `inflight-guard` | 在途双击 `loadDelta 1`（首行守卫生效）；落地后提示消失、行 6 = 文件 6 |
| `r14-group-jump` | `current-noop` | 当前组头 `openable false` / `cursor auto` / title `sample-paper.pdf`；点击后 pill `sample-paper.pdf`、页码 `第 1 / 3 页`、分组顺序与哈希均不变 |
| `r14-group-jump` | `jump-other-doc` | older 组头 `openable true` / `cursor pointer`；点击后 pill `older-paper.pdf`、`第 1 / 2 页`、首个组 = `archive/older-paper.pdf`（带 chip、无 `is-openable`）、行 4 不变、`hashSame true`、`load/stat` 增量 0 |

## B6. 目视结论（逐张登记；取景方式 = `nativeImage.crop` + 3x 放大的一次性脚本，写 `%TEMP%` 后删除）

### B6.1 新增 8 张

| 截图 | 观察项与结论 |
| --- | --- |
| `r14-1-tree-notes-badge.png`（左栏） | sample 行 `3 条` 完整、字号小于行名、无背景 / 无边框、位于行名与进度胶囊之间且不重叠；older 行呈「`older-paper.pdf` 全名 + 数字 `1` + 被裁切的条」形态——**行名无省略号**、徽标无背景块、无省略号、非空胶囊；`archive` / `reading-notes.md` / `long-book.pdf` 三行零标记，行高与图标与改前一致 |
| `r14-1b-tree-badges-narrow.png`（左栏，220px） | 计数先让位：两行徽标压到 0 宽（完全不可见、无残留背景），行名随后按既有 ellipsis 截断（`older-p…` / `sample-pap…`），`第 1024 页` / `第 2 页` 胶囊形态与位置与默认宽度一致、贴行右内缘；无横向溢出条 |
| `r14-2-tree-badge-workspace-b.png`（左栏） | B 侧左栏 pill 为 `笔记`（无计数）、面板 `共 0 条` + `暂无笔记` + 报告按钮禁用；树上无任何计数标记（`badgeCount 0`）；无 A 侧残留 |
| `r14-3-stale-row.png`（左栏） | 提示行位于头部之下、笔记列表之上（与 `order.names` 一致）；盒模型与撤销行同款（同边框 / 圆角 / 白底 / 内边距）；文本完整可读 + 刷新按钮（图标 + `刷新`）在行右；未遮罩、未挤出既有行 |
| `r14-3b-refresh-keeps-draft.png`（左栏） | 刷新后 `n-current-1` 行的编辑框仍在、草稿 `刷新不应丢弃这段草稿` 完整可见、`保存 / 取消` 未被挤掉；sample 组 `共 3 条`、列表已同步到 6 行；提示行消失 |
| `r14-3c-refresh-list-synced.png`（左栏） | 提示行消失；older 组 `共 2 条`（外部新增条目正文 `External edit: …` 可见）；面板与文件一致（6 行） |
| `r14-4-stat-failure-silent.png`（左栏） | 注入失败态下提示行仍在、**无任何错误条**（`.notes-notice` 缺席）、列表行数不变；撤销行与提示行同屏且互不遮挡（两者语义不同、顺序 = 提示行在上） |
| `r14-5-group-jump.png`（整窗） | 中间阅读区文档名 `older-paper.pdf`、正文为该文档第 1 页；左栏分组重排为首组 `older-paper.pdf`（带「当前文档」chip、`共 1 条`）→ `sample-paper.pdf`（`共 3 条`）；当前组头无可点暗示（`openable false`） |

### B6.2 既有场景 21 的改前 / 改后目视比对（`21-tree-progress.png`，左右栏取景同区域 3x）

| 项 | 改前（`pix-v05-r14-base`，无徽标） | 改后（`pix-v05-r14-after`） |
| --- | --- | --- |
| `older` 行 | `older-paper.pdf` 全名 + `第 1024 页` 胶囊 | `older-paper.pdf` **全名** + 压缩徽标 `1` + `第 1024 页` 胶囊（位置与改前一致） |
| `sample` 行 | `sample-paper.pdf` + `第 3 页` 胶囊 | 同左，两枚标记并排不重叠 |
| 整窗读数（MEASUREMENTS） | sample `109/109` + `第 3 页`、older `96/96` + `第 1024 页`、notes `111/111`、archive `44/44`、row 246/246 | **逐字相同**（`live-page` / `trim` 两相位亦逐字相同） |
| 结论 | —— | 既有树行与进度徽标的文本 / 几何零变化；新增元素仅为计数徽标（压缩态），无重叠 / 截断 / 遮挡 |

> 取景过程中曾发现的真实回归（older 行行名出现省略号）已由 D3 修复；上表为**修复后**的终态。

### B6.3 其它形态登记

- **提示行折行**：268px 左栏下 22 字文本折为 2 行（设计档 §8 的「一行可读不折行」在该宽度下不可达；既有 `.notes-report-row` 的状态文本同样折行）——完整可读、无截断、按钮未被挤掉。
- **刷新按钮高度**：实测 `btnHeight = 12`；因 `src/renderer/main.ts:42` 的全局 `VBtn: { density: "comfortable" }`（`--v-btn-height 20px − 8px`），与既有导出 / 报告行的 `在文件夹中显示` 按钮同高同字号（同 props、无本地覆盖，M9 不被违反）。

## B7. 偏差登记与未决项

### B7.1 偏差 / 修复登记

| # | 内容 | 依据与取舍 |
| --- | --- | --- |
| **D1** | B 面白名单未含 `renderer/utils/notes-path.ts` 与 `scripts/smoke-view.mjs`；本次按设计档 §1.3 / §4 第 1、11 行与 A 面 U1 登记落地（`countNotesByDocument` + `NotesBadgeCount`、`badge-counts` 组 6 条） | 不落地则 `check` 必红（`LibraryPanel.vue` 无该导出可 import）、`smoke:view` 停在 29 条；两文件均属设计档指定的 A 面交付点、A 面已登记转 B。**需负责人追认或改派** |
| **D2** | `ui-shot.mjs` 场景 24 B 侧选择器 1 行修复：`textOf(".empty-title")` → `textOf(".reader-empty .empty-title")`（+1 行注释） | 实跑证据：stub 笔记根随 `activeRoot`（§2.2 第 8 行）后 B 侧笔记面板进入空态并渲染同名 `.empty-title`，原选择器读到左栏文案 `还没有摘录` ⇒ 场景 24 判红（`pix-v05-r14-after` 尝试 2 原文）。限定选择器与既有 r11-4 的 `.notes-empty .empty-title` 同款口径，**断言强度不变**（阅读区空态缺失仍判红）。取舍：保设计档 §3 失败路径 #15 的硬约束（既有场景全绿）与 §2.2 第 8 行，代价是 §1.8 #17「既有场景函数体零改动」出现 1 处登记例外。**需负责人追认** |
| **D3** | `LibraryPanel.vue` 的 `.row-notes { flex-shrink }` 由设计档字面的 `1000` 提高为 `10000`（§0.9「继续收窄徽标盒模型」逃生条款） | 实跑证据：`flex-shrink: 1000` 时行名承担 ≈0.044px 亚像素（比例分摊 8.8 × 96/18896），older 行行名出现省略号（`21-tree-progress.png` 改前/改后 3x 取景 + 一次性实验：label 盒 95.96875 vs 无徽标 96.00），违反 §5.5 硬约束「`.row-label` 几何零变化」；`10000` 时行名份额截断到 0（实验实测 label 盒 96.00、徽标 11.41），复跑后 older 行 `label 96/96`（与 R13 逐字相同）、徽标 `notesClientWidth 10`（仍为压缩态）。徽标盒模型其余字段、文案与门控逐字未动 |
| **D4** | 设计档 §5.4.2 的 helper 名 `badgeProbe` / `staleProbe` 与本作用域既有常量（早前场景的局部读数变量）重名 ⇒ 改名 `badgeRowProbe` / `staleRowProbe`；`badgeTextExpr` 同理改名 `badgeTextWaitExpr` | §0.3 已声明 helper「命名自由、语义冻结」；不改名则脚本语法错（`const` 重复声明） |
| **D5** | 设计档 §2.3 ③ 的命令（`grep -E "^[+-].*(…|group-name)"` 期望无输出）与 §1.7.4 强制的 `.notes-group-head.is-openable:hover .group-name` 规则自相矛盾（该规则必然命中 `group-name` 字面） | 按 §1.8 #12 的可满足口径实测：`group-name` 等字面**无 `-` 行**、`:title` 绑定表达式逐字保留、子结构零改动；登记为设计档自相矛盾项 |
| **D6** | 设计档 §8「提示行文本一行可读不折行」在 268px 左栏下不可达 | 见 §B6.3；文案 / 盒模型 / 按钮形态逐字按 §1.7.1 / §1.7.5，登记为非缺陷 |
| **D2 处置（追认）** | 负责人书面追认（2026-09-17）：场景 24 的 1 行选择器修复保留落地。理由逐字：`NotesPanel` 以 `v-show` 常驻 DOM，原选择器会抢先读到 B 侧空态文案，属既有场景在新 DOM 事实下的必要修复；断言文本与失败条件逐字未变 | 裁决原文见 `docs/pm/R14-review.md`「### 负责人追认（R14）」；§B7.2 U2 据此关闭（未决项行文保留不改） |
| **D3 处置（追认）** | 负责人书面追认（2026-09-17）：`.row-notes` 的 `flex-shrink` **终值 = 10000**（由设计档字面 1000 提高，不回退）。理由逐字：审查步已用受控实验证明 1000 会让既有 `21-tree-progress` 场景的行名出现省略号而整数判据捕获不到，10000 下行名零位移且全套断言绿；该收窄属 `R14-req` §0.9 授权范围 | 受控实验产物 `C:/Users/86157/AppData/Local/Temp/pix-v05-r14-mutshrink`（审查 §四-1）；§B7.2 U3 据此关闭（未决项行文保留不改） |

### B7.2 未决项

| # | 内容 |
| --- | --- |
| **U1** | B 白名单未含 `notes-path.ts` 与 `smoke-view.mjs`（D1）：本档已按设计档落点落地并逐条实测，请负责人追认或改派。 |
| **U2** | 场景 24 的 1 行选择器修复（D2）请负责人追认；若坚持 §1.8 #17 的字面口径，则需撤销 stub 笔记根改造（并接受 `r14-2` 的「B 无徽标」断言不可判定）。 |
| **U3** | `.row-notes` 的 `flex-shrink: 10000`（D3）请负责人确认（设计档字面为 `1000`；两者在整数读数上无差异，差异在亚像素与省略号是否出现）。 |
| **U4** | 本轮基线目录 `pix-v05-r14-base` 不完整（116 张 / 160 条 / 34 label，r11-3 flake）；设计档 §5.5 ③ 的交叉核对以 R13 目录（135 / 198 / 46）+ 本次 base 的 `tree-progress` 三相位读数替代。 |
| **U5** | 设计档 §1.5 纪律 3 要求「真实窗口激活路径（切出 → 外部改文件 → 切回）作者人工走查」：无人值守模式下无法真实操作窗口激活，**未覆盖**；离屏以合成 `window` `focus` 事件覆盖了判定链（`r14-3` / `r14-4` 共用同一注册点与同一 `checkNotesFile()` 入口）。 |
| **U6** | 既有面本机 flakiness 记录（与 R14 改动无因果关系）：r11-3 相位 4 的「摘录浮层」等待（尝试 1）与 42b 的 pdf.js worker 销毁竞态（尝试 3）；两次均发生在既有场景、且失败点互不相同；处置 = 重跑至 `failure=null`（本档 §B4.3 记录每次尝试的现场）。 |

## B8. 纪律与零残留

- 未运行任何 git 写命令（提交由负责人完成）；未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未引入或升级依赖；未改 `packages/**`、`package-lock.json`、`pix/package.json`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`variables.css`、`resources/**`。
- 白名单外零改动：`git status --short` 只有 §B1 表的 7 个 B 面文件 + A 面 5 个文件 + 本轮 4 份文档（`R14-req/design/review/dev.md`，均未跟踪）。
- 一次性脚本（取景脚本、flex 实验脚本、探针）全部写 `%TEMP%` 并在运行后删除；仓库内无临时产物、无调试日志；离屏产物只在 `%TEMP%/pix-v05-r14-*` 与 `%TEMP%/pix-r14-zoom`。

---

## B9. 独立复验（第二轮取证，2026-09-17，只读复跑）

> 目的：对 §B1–§B8 的每一项验收读数做一次**不依赖上一轮产物**的独立复跑（工程门 / 两个烟测 / 离屏全量 / 零缺失比对 / 8 张新截图与既有场景 21 的目视复检）。命令与环境同 §B4（`E:/develop/PiX-Read`，Windows + git bash，`PATH="/c/Program Files/nodejs:$PATH"`），未改任何文件后再取证。

### B9.1 工程门与烟测（复跑读数）

```text
cd pix && npm run check                ⇒ CHECK_EXIT=0
node scripts/smoke-notes.mjs           ⇒ 通过 51 / 失败 0（SMOKE_NOTES_EXIT=0）
node scripts/smoke-view.mjs            ⇒ 通过 35 / 失败 0（SMOKE_VIEW_EXIT=0）
```

### B9.2 离屏全量复跑与零缺失比对

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r14-after" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_AFTER_EXIT=$?"
# ⇒ UI_SHOT_AFTER_EXIT=0 / [ui-shot] 结束：产出 143 张截图
```

| 比对项 | 基线 `pix-v05-r13-review` | 复跑 `pix-v05-r14-after` | 零缺失 |
| --- | --- | --- | --- |
| 截图 | 135 张 / `failure=null` | **143 张** / `failure=null` | `missing: []`；`added` 恰 8 张（`r14-1` / `r14-1b` / `r14-2` / `r14-3` / `r14-3b` / `r14-3c` / `r14-4` / `r14-5`） |
| 测量 | 198 条 / 46 种 label | **211 条 / 51 种 label** | 按 label 计次 `missing: []` |
| 产物目录 | —— | `shots/` 一级条目仅 `*.png` + `MANIFEST.json` + `MEASUREMENTS.json` | 白名单外条目 0 |

13 条 `r14-*` record 全绿（任一断言失败即 `record` 抛错、脚本退出非 0；本次退出 0 且 `failure=null`）。关键现场与 §B5 逐字一致，例：`r14-tree-badge/badges` ⇒ sample `3 条` / `notesClientWidth 19 = notesScrollWidth 19` / label `109/109`（floor 139），older `1 条` / `notesClientWidth 10 < notesScrollWidth 19` / label `96/96`（floor 106）、`domOrder true`；`r14-tree-badge/narrow` ⇒ `.layout-left 220`、两行徽标 0 宽、label `91` / `58`、复原 `.layout-left 268`、sample `19/19`、older `10`；`r14-notes-stale/detect` ⇒ `order.names = ["notes-header","notes-stale","notes-list"]`、`hashSame true`、`statDelta 1`、4.5s 后提示仍在；`r14-notes-stale-failure` 三相 ⇒ `staleBefore true → staleAfter false`、失败注入下 `stale` 保持 `true` / `notice null` / `statDelta 4`、在途双击 `loadDelta 1`；`r14-group-jump` 两相 ⇒ `current-noop` 零副作用、`jump-other-doc` 落到 `older-paper.pdf` / `第 1 / 2 页` 且 `loadDelta 0` / `statDelta 0`。

### B9.3 既有面结构不变（归一化比对，程序化）

对基线 46 种 label 的全部既有 record 做「路径前缀归一化后逐字比较」：全部差异**只出现在**时间戳 / 随机 UUID / 性能计时字段（`updatedAt` / `createdAt` / `seedCreatedAt` / `waitMs` / `elapsedMs` / 报告生成时间 / `n-<时间戳>-<随机>`)；`tree-progress` 三相（`static` / `live-page` / `trim`）逐字相同（sample `109/109`、older `96/96`、notes `111/111`、archive `44/44`、row `246/246`、进度文本 `第 3 页` / `第 2 页` / `第 1024 页`），即既有树行与进度徽标**零结构位移**。与 `pix-v05-r14-base`（A 面改动、B 面未落地）的 `tree-progress` 三相交叉核对同样逐字一致。

### B9.4 三面同步复验（§1.1.5 #2 的第 3 处）

```text
PixApi 接口 42 / api 实现 42 / ui-shot stub api 42；三处方法名清单逐字相等（顺序相同）
notesStat 在三处的位置一致（notesReset 之后、索引 28 → 29）
```

`notes-stat` 通道 2 处、`notesStat`（preload）2 处、`ReaderNotesStatResult`（types / main / renderer-store）1 / 2 / 2、stub 的 `notesStat` 12 处 / `notesStatCalls` + `setNotesStatFailure` + `currentNotesFile` 18 处 / `NOTES_FILE` 10 处、`SEL` 60 项（新增 6 项、无删除）——逐条与 §B4.5 相同。

### B9.5 目视复验（本轮重新读图，8 张新截图 + 既有场景 21 / 24）

| 截图 | 复验结论 |
| --- | --- |
| `r14-1-tree-notes-badge.png` | sample 行 `3 条` 完整、字号小于行名、无背景 / 边框，位于行名与 `第 2 页` 胶囊之间不重叠；older 行为压缩降级形态（行名 `older-paper.pdf` 全名 + 仅数字 `1`，`条` 被右端裁切、无省略号、无空胶囊 / 半截背景）；`archive` / `reading-notes.md` / `long-book.pdf` 三行零标记 |
| `r14-1b-tree-badges-narrow.png` | 220px 下两行徽标完全让位（0 宽、无残留），行名随后按既有 ellipsis 截断（`older-p…` / `sample-pap…`）；`第 1024 页` / `第 2 页` 胶囊形态与默认宽度一致、贴行右内缘；无横向溢出条 |
| `r14-2-tree-badge-workspace-b.png` | B 侧左栏 pill 为 `笔记`（无计数）、`共 0 条`、导出 / 报告按钮禁用、空态 `还没有摘录`；树上无任何计数标记，无 A 侧残留 |
| `r14-3-stale-row.png` | 提示行在头部之下、笔记列表之上（`order.names` 一致）；盒模型与撤销行同款；文案 `笔记文件已被外部修改，面板内容可能过期` 完整可读、`刷新` 按钮（图标 + 文本）在行右；列表 5 行且外部新增正文可见；未遮罩、未挤出既有行 |
| `r14-3b-refresh-keeps-draft.png` / `r14-3c-refresh-list-synced.png` | 同一帧（见下方登记）：提示行消失；`n-current-1` 编辑框仍在、草稿 `刷新不应丢弃这段草稿` 完整可见、`保存 / 取消` 未被挤掉；列表同步到 6 行、三组计数 `共 2 / 1 / 3 条` 与徽标一致 |
| `r14-4-stat-failure-silent.png` | 注入失败态下提示行仍在、无任何错误条（`.notes-notice` 缺席）、列表行数不变；撤销行（`已删除「Table 2 repo…」· 第 2 页`）与提示行同屏且不遮挡（提示行在上）；同屏可见上一场景遗留的备注编辑框（既有语义：`startCommentEdit` 的编辑态不随读盘重置，非缺陷） |
| `r14-5-group-jump.png` | 中间阅读区文档名 `older-paper.pdf`、`第 1 / 2 页`；左栏分组重排为首组 `older-paper.pdf`（带「当前文档」chip、`共 1 条`）→ `sample-paper.pdf`（`共 3 条`）；当前组头无可点暗示 |
| `21-tree-progress.png`（改前 R13 / 改后） | 改前：`older-paper.pdf` + `第 1024 页`、`sample-paper.pdf` + `第 3 页`，无计数；改后：older 行插入压缩徽标 `1`、sample 行插入 `4 条`，两枚标记并排不重叠；行名 / 图标 / 进度胶囊的文本与位置逐像素一致（测量三相逐字相同） |
| `24-workspace-switch.png`（改前 R13 / 改后） | B 侧 pill 由 `笔记 6` 变为 `笔记`（B 的笔记根随 `activeRoot` ⇒ 计数归零，属 §2.2 登记的正确恢复）；左侧树 `sample-paper.pdf` 无徽标；阅读区空态文案 `选择左侧文件开始阅读` 与改前逐字一致（D2 的限定选择器未改断言强度） |

补充抽样（本轮追加，`22-scale-restored.png` / `20-resume-entry.png`）：含 A 侧树的既有截图在行内余量充足时徽标完整显示（`older-paper.pdf 1 条` / `sample-paper.pdf 4 条`），行名无省略号、进度胶囊位置不变。

### B9.6 本轮新增登记

| # | 内容 | 依据 |
| --- | --- | --- |
| **D7** | `r14-3b-refresh-keeps-draft.png` 与 `r14-3c-refresh-list-synced.png` **字节相同**（md5 均为 `d5a2b382…784e5`）：设计档 §5.4.6 把两次 `capturePage` 排在同一个步骤序列的同一时刻（刷新落地后、无中间状态变化）⇒ 同一帧写两个文件名。该帧同时覆盖两张截图的观察项（草稿保留 + 列表同步到 6 行 / 三组计数一致），语义与配额（8 张）不变；如需两帧不同形态，需改设计档的取证步骤（本轮未改） | 复跑产物的 md5 比对 + §8 的两行观察项逐条对照 |

### B9.7 复验的零残留

- `git status --short`：12 个 `M`（A 面 5 + B 面 5 + 范围登记 2） + 4 份未跟踪文档，与 §B1 表逐字一致；无新增 / 无临时产物。
- 复验用一次性脚本（`r14-verify-cmp.mjs` / `r14-verify-faces.mjs`）写 `%TEMP%` 并在运行后删除；离屏日志 `%TEMP%/r14-verify-b.log` 留作证据；仓库内零临时文件。

---

## 终验（R14）

> 终验代理（冷启动，独立于需求 / 设计 / 开发 / 审查步）：全部读数来自本次实跑与真实文件内容，无一条复用既有结论；只读复读基线产物 `C:/Users/86157/AppData/Local/Temp/pix-v05-r13-review`；本轮只启动一个离屏进程（两个取证进程未并发）。环境：2026-09-17，Windows + git bash，`E:/develop/PiX-Read`。
> 未运行任何 git 写命令；未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未改 `packages/**`、任何源码 / 脚本 / 配置；仅追加本档。一次性复算脚本写 `%TEMP%`（`pix-r14-final-verify.mjs`）并在用后删除。

**终验结论：可提交。** `CHECK_EXIT=0`；两个烟测 0 失败；全新离屏取证退出码 0 + `MANIFEST.json.failure === null`；143 张截图（基线 135 张零缺失、新增恰 8 张）/ 211 条测量（基线 198 条零缺失、新增恰 13 条）/ 51 种 label（基线 46 种零缺失、新增恰 5 种）；13 条 `r14-*` record 的 54 条断言语句逐条复算全通过；白名单内改动零外溢；**未销账 must-fix = 0**。

### 终验 1：工作树与白名单（只读 git）

```bash
cd E:/develop/PiX-Read && git status --porcelain=v1 && git diff --stat && git diff --numstat
git diff --stat -- packages package-lock.json pix/package.json
```

原样结果（摘要）：

```text
 M pix/scripts/smoke-notes.mjs
 M pix/scripts/smoke-view.mjs
 M pix/scripts/ui-shot.mjs
 M pix/src/main/ipc-handlers.ts
 M pix/src/main/notes-store.ts
 M pix/src/main/preload.ts
 M pix/src/renderer/components/workspace/LibraryPanel.vue
 M pix/src/renderer/components/workspace/NotesPanel.vue
 M pix/src/renderer/pages/WorkspacePage.vue
 M pix/src/renderer/stores/notes-store.ts
 M pix/src/renderer/utils/notes-path.ts
 M pix/src/shared/types.ts
?? docs/pm/R14-design.md
?? docs/pm/R14-dev.md
?? docs/pm/R14-req.md
?? docs/pm/R14-review.md

12 files changed, 1253 insertions(+), 12 deletions(-)
140/0 smoke-notes | 95/0 smoke-view | 789/6 ui-shot | 3/1 ipc-handlers | 28/2 main/notes-store | 3/0 preload
29/1 LibraryPanel | 79/2 NotesPanel | 6/0 WorkspacePage | 50/0 renderer/store | 20/0 notes-path | 11/0 types

（`git diff --stat -- packages package-lock.json pix/package.json` ⇒ 空输出）
```

逐条结论：

| 判据 | 结论 |
| --- | --- |
| 改动与 R14 白名单一致 | 通过：12 个 `M` 逐条落在 `R14-req.md` §6 白名单第 1–12 项（顺序为脚本 3 + 主进程 3 + 渲染层 5 + 共享类型 1）；4 个未跟踪文档 = 白名单第 14 项（`R14-req/design/review/dev.md`） |
| `packages/**` 零 diff | 通过（输出为空） |
| lockfile 零 diff | 通过（`package-lock.json` 输出为空） |
| 依赖字段零 diff | 通过（`pix/package.json` 输出为空；未新增 script） |
| 白名单外改动 | 0（`git diff --name-only` 与 `git ls-files --others --exclude-standard` 均无白名单外条目） |

### 终验 2：唯一工程门与两个烟测

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
cd E:/develop/PiX-Read && PATH="/c/Program Files/nodejs:$PATH" node pix/scripts/smoke-notes.mjs; echo "SMOKE_NOTES_EXIT=$?"
cd E:/develop/PiX-Read && PATH="/c/Program Files/nodejs:$PATH" node pix/scripts/smoke-view.mjs; echo "SMOKE_VIEW_EXIT=$?"
```

原样结果：

```text
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
CHECK_EXIT=0

[smoke-notes] 通过 51 / 失败 0        （组：undo-roundtrip 8 / undo-failures 8 / undo-slot-lifecycle 6 / export-and-empty 4 /
                                        report-render 7 / report-files 5 / report-failures 6 / notes-stat 7 = 44 + 7）
SMOKE_NOTES_EXIT=0

[smoke-view]  通过 35 / 失败 0        （组：section-hit 8 / section-null 8 / section-nav 8 / section-format 5 / badge-counts 6 = 29 + 6）
SMOKE_VIEW_EXIT=0
```

结论：`check` **0 error**（退出码 0）；`smoke-notes` **0 失败**（51 条，含新增 `notes-stat` 组 7 条逐条通过：`#1` 无根 / `#2` 缺文件 / `#3` 正常文件 / `#4` 外部改写 / `#5` 只读与幂等 / `#6` 损坏不解析 / `#7` 删除后）；`smoke-view` **0 失败**（35 条，含新增 `badge-counts` 组 6 条逐条通过：标准种子逐字段 / 空数组 / 只产出 >0 / 比较键归一 / 恒等式 / 入参零改动 + 新 Map）。三个命令均以仓库根为 cwd 实跑（两个烟测脚本按 `import.meta.url` 解析路径，与 cwd 无关）。

### 终验 3：全新离屏取证（`pix-v05-r14-final`）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r14-final" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_EXIT=$?"
```

原样结果（摘要）：

```text
[ui-shot] 结束：产出 143 张截图
UI_SHOT_EXIT=0

MANIFEST.json：generatedAt = 2026-09-16T17:05:57.848Z（本地 2026-09-17 01:05）/ url = http://localhost:5199/ /
                shots.length = 143 / failure = null
MEASUREMENTS.json：长度 211
shots/ 一级条目 145 = 143 png + MANIFEST.json + MEASUREMENTS.json；白名单外条目 0；清单内截图缺文件 0；磁盘上多出的 png 0
8 张新截图 mtime 全部为本轮运行时刻（01:05:47–01:05:57）
```

结论：**退出码 0、`failure === null`、产物自净与结束自检通过**（快照集合与清单双向相等、无白名单外条目）。

### 终验 4：与基线 `pix-v05-r13-review` 的零缺失比对 + 54 条断言复算

比对与复算由一次性脚本（`%TEMP%/pix-r14-final-verify.mjs`，用后删除）程序化完成，仅读两目录的 `MANIFEST.json` / `MEASUREMENTS.json` 与磁盘文件：

```text
BASE shots: 135 | FINAL shots: 143 | missingShots: []
addedShots(8): [r14-1-tree-notes-badge, r14-1b-tree-badges-narrow, r14-2-tree-badge-workspace-b, r14-3-stale-row,
                r14-3b-refresh-keeps-draft, r14-3c-refresh-list-synced, r14-4-stat-failure-silent, r14-5-group-jump]
BASE measurements: 198 | FINAL measurements: 211 | missingLabels: []
addedLabelKinds(5): [r14-tree-badge, r14-tree-badge-scope, r14-notes-stale, r14-notes-stale-failure, r14-group-jump]
FINAL failure: null | shots/ 白名单外条目: []
r14-* record 总数: 13（r14-tree-badge 3 / r14-tree-badge-scope 2 / r14-notes-stale 3 / r14-notes-stale-failure 3 / r14-group-jump 2）
R14_ASSERT_PASS=54/54
```

54 条断言语句 = 13 条 record 的全部失败即红条件（按 record 的判据分句合并计数：badges 5 / live 4 / narrow 8 / scope 5 / enter-fresh 1 / detect 6 / refresh-draft 8 / write-rebaseline 4 / stat-failure-silent 5 / inflight-guard 2 / current-noop 2 / jump-other-doc 4），复算口径与 `ui-shot.mjs` 内联谓词逐字一致（`overflowFree` / `rowFits` / `badgeYieldOk` = `labelClientWidth ≥ min(labelScrollWidth, labelFloor) − 1` / `progressPinnedRight` = `progressBox.right ≥ rowBox.right − paddingRight − 1` / `badgeWidthOk` = 0 或 ≥5）。关键现场读数（原样，取本轮 `MEASUREMENTS.json`）：

| record / phase | 本轮读数（复算结论） |
| --- | --- |
| `badges` | sample `3 条` + `摘录 2 条 · AI 结论 1 条`、`scroll 19 ≤ client 19 + 1`（未压缩）；older `1 条` + `摘录 1 条 · AI 结论 0 条`、`client 10 < scroll 19`（压缩态、无空胶囊）；reading-notes / long-book / archive 三行 `notesCount 0` 且 `progressCount 0`；`pinned: true/true`、`notes.right 199.0 ≤ progress.left 214.0`、`190.7 ≤ 194.7`、`domOrder true`；让位 `109 ≥ min(109,139)−1`、`96 ≥ min(96,106)−1` |
| `live` | 删除后 `2 条`（`摘录 1 · 结论 1`）、撤销后 `3 条`（`摘录 2 · 结论 1`），列表 3 → 4 行真实变化；过滤态 `命中 1 条 / 共 4 条`、组分计数仅 `共 1 条`、sample 徽标仍 `3 条`（恒示全量） |
| `narrow` | `.layout-left 220`；两行行宽 198/198；两行徽标 `client 0`（整体让位、非 null 防空成立）；进度徽标文本与盒宽不变（47 / 66）；让位 `91 ≥ min(109,91)−1`、`58 ≥ min(96,58)−1`；复原 `268`、sample `19/19`、older `10` |
| `b-workspace` / `back-to-a` | `loadDelta 2 ≥ 1`；B 树 `badgeCount 0`（行在场）、`.notes-empty` 在场、`.notes-stale` 缺席；回切 A `3 条 / 1 条` |
| `enter-fresh` | 外部新增 5 条读入、行 5、`.notes-stale` 缺席（不误报）；徽标 sample `3 条` / older `2 条` |
| `detect` | 文案逐字 + `刷新` + `重新读取笔记文件`；`order.names = [notes-header, notes-stale, notes-list]`；行 5 / `共 5 条`（检测不改列表）；`hashSame true` + `statDelta 1`（走新通道、只读）；提示期间勾选生效（`已选 1 条`）；4.5s 后仍在 |
| `refresh-draft` | 提示消失；textarea 在 DOM、`value` 逐字 `刷新不应丢弃这段草稿`、`[保存, 取消]` 仍在；行 6 = 文件 6；徽标 `3 / 2 / 1 条`；`hashSame true`、`loadDelta 1`、写增量 `add 0 / report 0`；续段（外部删除编辑中条目）：行与编辑框消失、5 = 5、无提示无弹错、草稿未自动保存、只读（`load 1 / add 0 / report 0`） |
| `write-rebaseline` | `staleBefore true → staleAfter false`（写成功重新对标）；行 4 = 文件 4；外部新增可见；`hashChanged true` |
| `stat-failure-silent` | 两注入下 `staleWhileFailed {readFailed: true, throw: true}`、`.notes-notice` 均 `null`、行 4 不变；`statDelta 4`；置位态刷新后清位；未置位注入失败不置位 |
| `inflight-guard` | 在途双击 `loadDelta 1`；落地后提示消失、行 6 = 文件 6 |
| `current-noop` / `jump-other-doc` | 当前组头 `openable false / cursor auto / title sample-paper.pdf`，点击零副作用（pill / 页码 / 顺序 / 哈希不变）；非当前组头 `openable true / cursor pointer`；点击后 pill `older-paper.pdf`、`第 1 / 2 页`、首组 `archive/older-paper.pdf`（chip 在场、不可点）、行 4 不变、`load/stat` 增量 0 |

走查复算（只读命令，逐条命中）：`row-notes` 2 / `摘录|AI 结论` 1 / `countNotesByDocument` 3（函数体内 `for (` 1、文件总数 3）/ LibraryPanel 笔记 IPC 0、定时器 0、`margin-left: auto` 1；`notes-stat` 2 / preload `notesStat` 2 / `ReaderNotesStatResult` 1·2·2·3 / `ipcMain.handle("notes-` 9 / `syncNotesFile("capture")` 3 / 面板 `checkNotesFile` 1 / focus add·remove 1·1 / `notesFileSeq` 4 / 两段文案各 1 / `notes-stale` 2 / `editingCommentId.value =` 3 / `applyNotes(` 5 / `console.` 0 / `setInterval` 0 / 主进程 `externalChange|notes-stale` 0；`open-note-doc` 3 / 面板 `open-document` 0 且 `onOpenNoteDoc` 0 / WorkspacePage `onOpenNoteDoc` 2 / `selectedFilePath.value =` 2 / `is-openable` 3 / `:title="group.docPath"` 1 / 渲染层 `.pix-read` 2 / `ReaderNotesErrorCode` 11 键；`SEL` 60 项；三面方法清单 `PixApi` 42 / `api` 42 / stub 42 且逐字相等（`notesStat` 均位于索引 29）；`.row-progress` 不作为 `+`/`-` 行（0）；`ui-shot.mjs` 真实删除行 6（stub 5 行 + 场景 24 选择器 1 行，与 D2 登记一致）/ 两个烟测删除行 0·0 / LibraryPanel 1 / NotesPanel 2。

### 终验 5：目视结论（3 张新截图，本次运行产物，read 工具逐张）

| 截图 | 观察项与结论 |
| --- | --- |
| `r14-1-tree-notes-badge.png`（左栏 268×952） | sample 行 `sample-paper.pdf 3 条 第 2 页`：徽标为 10px 次要色小字、无背景 / 无边框、位于行名与进度胶囊之间且不重叠；older 行为压缩态 `older-paper.pdf 1 第 1024 页`：仅数字 `1` 可见、`条` 被右端裁切、**行名 `older-paper.pdf` 全名无省略号**、无空胶囊 / 半截背景；`reading-notes.md` / `long-book.pdf` 行零标记，`archive` 目录行零标记；进度胶囊仍贴行右缘 |
| `r14-3-stale-row.png`（左栏） | 提示行为独立浅边框盒：文本 `笔记文件已被外部修改，面板内容可能过期`（268px 下折 2 行，完整可读、无截断）、右侧 `刷新` 按钮（刷新图标 + 文本）；位于头部控件之下、笔记列表之上；未遮罩、未挤出既有行、无弹窗 / 错误条；列表 5 行且 `External edit: …` 外部新增正文可见、行内复选框与「删除 / 复制 / 追问」等控件照常 |
| `r14-5-group-jump.png`（整窗 1600×1000） | 中间阅读区文档名为 `older-paper.pdf`、正文为其第 1 页（`Earlier Work on Dense Passage Retrieval`）、页码 `第 1 / 2 页`、缩放 100%；左栏分组重排为首组 `older-paper.pdf`（含「当前文档」chip、`共 1 条`，无可点暗示）→ `sample-paper.pdf`（`共 3 条`）；右侧 composer 显示 `当前文档: older-paper.pdf · 第 1 页`；无 A 侧残留、无提示 / 错误条 |

### 终验 6：PRD-V0.5 §7.4 与 R14 N87–N90 的「已实现 + 有判据」结论

**PRD §7.4「资产可见可信」三句逐句核对：**

| §7.4 子句 | 实现 | 判据（本轮实跑） |
| --- | --- | --- |
| 资料库树能看出哪篇文档有笔记、有多少条 | `.row-notes` 徽标（`{N} 条` + tooltip `摘录 A 条 · AI 结论 B 条`），只读渲染层 `notesStore.notes` | `r14-1` badges（逐字文本 / tooltip / 几何 / 无笔记行零标记）、live（删 / 撤销 / 过滤态口径）、narrow（让位与复原）；`r14-2`（B 侧 0 徽标 / 回切恢复）；`badge-counts` 6 条；目视 `r14-1` |
| 笔记文件被外部修改后面板给出非阻塞提示且不静默覆盖 | `notes-stat` 只读指纹 + `externalChange` 标记 + `.notes-stale` 提示行与显式 `刷新`（只调既有 `loadNotes`） | `r14-3` enter-fresh（不误报）/ detect（文案、位置、列表不动、可交互、4.5s 不消失、只读 `hashSame` + `statDelta 1`）/ refresh-draft（草稿逐字保留 + 只读 + 续段）；`r14-4` 三相（写后重新对标 / 失败静默 / 在途守卫）；`notes-stat` 7 条；目视 `r14-3` |
| 面板计数与文件始终一致 | 刷新 / 读盘 / 写成功均以文件为准；徽标同步 | refresh-draft 行 6 = 文件 6、续段 5 = 5；write-rebaseline 行 4 = 文件 4；inflight-guard 行 6 = 文件 6；既有面板 / 导出 / 报告场景零缺失通过 |

**N87–N90 逐条（实现 + 判据）**：

| 条目 | 结论 | 证据 |
| --- | --- | --- |
| N87-1 徽标 DOM / 逐字文案 / 渲染条件 | 已实现 + 有判据 | `badges` ①–⑤；走查 `row-notes` 2 / `摘录|AI 结论` 1 |
| N87-2 计数口径与唯一派生 | 已实现 + 有判据 | `badge-counts` 6 条；走查 3 / 1 / 3；`live` 过滤态 ⑨ |
| N87-3 更新时机与作用域 | 已实现 + 有判据 | `live` 删 / 撤销联动；refresh-draft 徽标同步；`r14-2` 跨工作区；树内笔记 IPC 0 |
| N87-4 与进度徽标并存 / 窄栏不溢出 | 已实现 + 有判据 | `badges` ④⑤；`narrow` 8 条；既有场景 21 `overflowFree` 零缺失（`label 96/96`、行 246/246） |
| N87-5 无笔记行与懒加载零变化 | 已实现 + 有判据 | `badges` ③（三行零标记）；`live` 行宽不溢出；`toggle` 等零 diff；场景 21/21b 零缺失 |
| N87-6 数据面纪律 | 已实现 + 有判据 | 唯一新通道 `notes-stat`（handler 9 = 8 + 1）；树内无定时器 / 无笔记 IPC；`check` 0 |
| N88-1 新 IPC 四面同步 | 已实现 + 有判据 | 三面 42/42/42 逐字相等；类型计数 1·2·2·3；`ReaderNotesErrorCode` 11；只读实现（`notes-stat` #5 / 探针口径同源） |
| N88-2 检测时机 / 基线与竞态 | 已实现 + 有判据 | `r14-3` enter-fresh / detect；`r14-4` write-rebaseline；走查 capture 3 / 入口 1 / focus 1·1 / `notesFileSeq` 4 |
| N88-3 提示行与刷新按钮 | 已实现 + 有判据 | `detect` ①②③（逐字 / 顺序 / 非阻塞 / 不消失）；文案唯一 2 段各 1；`variables.css` 零 diff；目视 `r14-3` |
| N88-4 刷新语义与草稿冲突 | 已实现 + 有判据 | refresh-draft ①–⑧（草稿 / 只读 / 一致 / 续段四条规则） |
| N88-5 失败路径 | 已实现 + 有判据 | `stat-failure-silent` ⑤–⑨；`notes-stat` #1·#2·#7；失败分支只 `return`、`console.` 0 |
| N88-6 写操作成功后重新对标 | 已实现 + 有判据 | `write-rebaseline`；`inflight-guard` `loadDelta 1`；`applyNotes(` 5、capture 3；无 `setInterval` |
| N88-7 零副作用与跨工作区 | 已实现 + 有判据 | 检测 / 刷新 `hashSame` 均 true；B 工作区无提示；渲染层 `.pix-read` 2（与 R13 同）；写操作才 `hashChanged` |
| N89-1 点击语义与门控 | 已实现 + 有判据 | `current-noop` ①②；`jump-other-doc` ③；`is-openable` 3、`:title` 绑定保留 |
| N89-2 复用既有跨文档跳转通道 | 已实现 + 有判据 | `jump-other-doc` ④⑤⑥（落地 `older-paper.pdf`、重排 + chip、`load/stat` 0）；`open-note-doc` 3 / `onOpenNoteDoc` 2 |
| N89-3 边界与零外溢 | 已实现 + 有判据 | `current-noop` 零副作用；面板侧 `onOpenNoteDoc` 0；既有组头相关 label 零缺失 |
| N90-1 烟测-主进程 | 已实现 + 有判据 | 51/0（44 + 7）；既有 44 条删除行 0；期望值独立计算 |
| N90-2 烟测-渲染 | 已实现 + 有判据 | 35/0（29 + 6）；编译面零改动（仅新增句柄 + `require`）；期望值手写 |
| N90-3 离屏场景 | 已实现 + 有判据 | 5 组 13 条 record / 8 张截图 / 5 种新 label 齐备；54 条断言复算全绿；既有场景零改写（除 D2 已追认的 1 行） |
| N90-4 基线与零缺失 | 已实现 + 有判据 | 135 → 143（`missing []`）、198 → 211、46 → 51（`missing []`）、`failure null`、退出码 0；场景 21 / 21b / 24 零缺失 |
| N90-5 工程门与零残留 | 已实现 + 有判据 | `check 0`；`packages/**` / lockfile / 依赖字段 / `variables.css` 零 diff；`git status` 白名单内；`shots/` 无白名单外条目；仓库无临时产物 |

### 终验 7：未销账项

| # | 类型 | 内容与处置 |
| --- | --- | --- |
| 1 | **未销账 must-fix = 0** | 需求 / 设计评审的 must-fix（MF-1…MF-10 与 MF-1…MF-5）已全部在定稿修订中销账；代码审查结论为 accept（0 阻塞）；终验未发现新阻塞项 |
| 2 | 已追认偏差（非未销账） | D2（场景 24 选择器修复 1 行）/ D3（`.row-notes` `flex-shrink` = 10000）/ D7（`r14-3b` 与 `r14-3c` 同帧）已由负责人书面追认（见 `R14-review.md`「负责人追认（R14）」与 §B7.1）；终验复核：`ui-shot.mjs` 删除行 6 与 D2 登记一致、`flex-shrink: 10000` 在树、两图 md5 同帧 |
| 3 | 遗留非阻塞登记（承接，不阻塞提交） | ① 真实窗口激活路径（切出 → 外部改文件 → 切回）仍未由判据覆盖，离屏以合成 `window` focus 事件覆盖判定链（设计档 §1.5 纪律 3 建议的人工走查，本轮无人值守未做）；② 提示行在 268px 左栏折 2 行（D6，设计档 §8「一行不折行」不可达，已登记为非缺陷）；③ 既有面 flakiness 历史（`r11-3` 相位 4 / 场景 42b 的 pdf.js worker 竞态，U6）：本轮首次实跑即 `failure=null`、未复现 |
| 4 | 终验自身边界 | 终验只读源码 / 脚本与只读 git；未做真实窗口操作、未做真实外部编辑（外部改动由离屏夹具在 Node 侧真写真改构造）；`mtimeMs` 只作观测事实（判定式只认 `hash`） |


