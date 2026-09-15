# R7 开发档 · AI 结论入库（N35–N42）

> 上游：`docs/pm/R7-design.md`（定稿，契约以此为准）、`docs/pm/R7-req.md`、`docs/pm/R7-review.md`、`docs/pm/PRD-V0.4.md`。
> 本档只记录实现事实：改动文件、关键决策与偏差、真实命令与真实输出、逐条自评、未验证事项。
> 分工：**开发 A（契约与数据面）** 见下；开发 B（UI 与会话面）另行追加「## 开发 B」一节。

---

## 开发 A（契约与数据面）

### A.1 改动文件清单

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `pix/src/shared/types.ts` | 修改（+20/-2） | 三处（§1.1）：① `ReaderNoteDraft` 增 `kind: ReaderNoteKind` 必填（无默认值，注释写死「不做向后兼容层，避免「忘了传」被静默写成长文本摘录」）；② 新增 `ReadingAnchor{docFilePath, page}` 独立段，紧随 Reader Notes 段之后（`ReaderNotesResetResult` 与 Reader State 段之间），注释写死「只存在于渲染层内存的 display block 上，不落任何文件」；③ `DisplayBlock` 的 `user-message` 变体加 `readingAnchor?: ReadingAnchor`（可选属性，缺省即该轮无锚点）。其余 11 个联合成员、`ReaderNote`/`ReaderNotesFile`/`ReaderNotesErrorCode`/Reader State 段逐字不动 |
| `pix/src/main/notes-store.ts` | 修改（+23/-8） | 设计档 §4.1 A 面表的五条全部落地：① `duplicateKey` 增 `kind` 形参（键 = `docPathKey` + `page` + `kind` + `text`），两处调用同步；② `addNote` 增 kind 白名单（`no-root` 之后、`outside` 与一切读写盘之前）；③ `too-long` 按 kind 取文案（新增独立常量 `ANSWER_TOO_LONG_MESSAGE`，**不给 `ERROR_MESSAGES` 加键**）、**不截断**；④ note 构造 `kind: draft.kind`（原硬编码 `"excerpt"`）；⑤ `renderMarkdownEntry` 标题行加 ` · AI 结论` 分支 |
| `pix/src/main/ipc-handlers.ts` | 修改（+1/-0） | `isNoteDraft` 返回表达式的首条增 `(draft.kind === "excerpt" \|\| draft.kind === "answer")`；notes 六通道、`invalidNotesInput()` 文案与其余段零改动 |
| `pix/src/main/preload.ts` | **不改** | `notesAdd(draft: ReaderNoteDraft)` 的类型自动携带 `kind`，`PixApi` 方法名与签名不变；判定见 A.4 命令 3（`git diff --name-only` 不含该文件） |

白名单外零改动：`git diff --name-only` 只有上述三文件；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置、全部渲染层文件与 `pix/scripts/ui-shot.mjs` 未被触碰（`git status --short` 见 A.4 命令 4）。

### A.2 关键决策与偏差

契约零偏差（类型名/字段/错误码/文案/判定顺序全部按设计档字面落地）。以下是设计档没写清、由 A 面按「最小惊讶 + 与仓库既有风格一致」补齐的点，以及一条实现期自纠偏差：

| # | 决策 / 偏差 | 依据 |
| --- | --- | --- |
| D1 | `ReadingAnchor` 落在 Reader Notes 段与 Reader State 段之间，`DisplayBlock`（文件前方）直接引用它——TS 接口声明提升，编译无顺序要求 | 设计档 §1.1「紧随 Reader Notes 段之后」；不放到 `DisplayBlock` 旁是为了逐字照设计档 |
| D2 | `too-long` 分支不用 `failure()` 帮助函数（它只取码表文案），改为显式构造同形状失败对象（`success:false` + `notes:[]` + `code:"too-long"` + 分叉文案），其余失败路径继续走 `failure()` | 设计档 §1.2「不得给 `ERROR_MESSAGES` 加键」+ 返回结构与 `failure()` 同形 |
| D3 | kind 白名单写成 `draft.kind !== "excerpt" && draft.kind !== "answer"`，位置在 `notesPaths()` 判空之后、`getLibraryRoot()` 之前 | 设计档 §1.3 判定顺序第 2 步；先于 `outside` 与一切读写盘 |
| D4 | 去重查找的第二次 `duplicateKey` 传**既有条目的** `note.text`（不是新草稿的 `text`） | 正确性要求；首轮实现误传了新草稿文本，会让「同页同 kind 不同文本」被误判重复 —— 由烟测用例 2 的「同页同 kind 但文本不同 → 新条目」判别项抓出并已修正（见 A.3） |
| D5 | `ANSWER_TOO_LONG_MESSAGE` 常量紧贴 `ERROR_MESSAGES` 之后（同一屏内对照），注释说明不按 kind 给码表加键的理由 | 设计档 §1.2 代码块给出的常量与注释；仓库既有风格为「码表 + 邻接常量」 |
| D6 | `renderMarkdownEntry` 用局部常量 `title` 承接三元的两种标题，正文拼接顺序与 `备注：` 行位置一字不动 | 设计档 §1.3 导出分支片段逐字 |
| D7 | 已知跨面耦合（非偏差）：`ReaderNoteDraft.kind` 必填会让尚未落地的渲染层调用点 `PdfSelectionQuickAsk.vue:153`（`addNote({ docFilePath, page, text })`）编译报错 —— 这正是设计档 §8 声明的「B 的编译前置是 A 的 `shared/types.ts`」，B 面补 `kind: "excerpt"` / `kind: "answer"` 后消失。A 面自身的两个编译单元（`tsconfig.main.json` / `tsconfig.preload.json`）为 0 error，证据见 A.4 命令 1 | 设计档 §8 接口约定 |

### A.3 数据面烟测（设计档 §7.2 十四组 + 原子性与判定顺序）

临时脚本写在 `%TEMP%`（`C:\Users\<user>\AppData\Local\Temp\pix-r7-smoke.cjs`），编译产物写 `%TEMP%/pix-r7-notes`，跑完与临时目录一起删除；仓库内未留任何临时文件。覆盖与设计档 §7.2 的对应关系：

| 设计档用例 | 本烟测落点（77 条断言） |
| --- | --- |
| 1 answer 落盘 | `1)` 段：字段逐项、`id` 为 uuid、`createdAt === updatedAt`、文件字节 = `JSON.stringify(...,null,2) + "\n"`、写盘后无 `.tmp` |
| 2 excerpt/answer 同文本不去重、同 kind 去重 | `2)` 段：两类各入库；第 3 次命中 `duplicateOf` = 第 2 条 id 且**无 `note` 字段**；文件恰 2 条、kind 分布、id 互不相同、`createdAt` 单调；去重后**字节与 mtime 不变**；另加判别项「同页同 kind 但文本不同 → 新条目」（D4 的回归位） |
| 3 旧库（只含 excerpt）重复保存 | `3)` 段：`duplicateOf` = 既有 id、条目数/字节/mtime 三重不变 |
| 4 kind 缺失 / `"note"` / `123` | `4)` 段：三种非法取值均 `invalid-input` +「笔记数据不合法」、不写盘、无 `.tmp`、既有条目原样 |
| 5 / 6 / 7 长度边界 | `5)` 4000 字 answer 入库且 `loadNotes` 不判 `corrupt`；`6)` 4001 字 answer → `too-long` +「回答过长（超过 4000 字），无法存为笔记」+ 字节/mtime 不变 + 无 `.tmp`；`7)` 4001 字 excerpt →「选中内容过长（超过 4000 字），请分段摘录」 |
| 8 / 9 空内容与 page 非法 | `8)`/`9)` 段：`"   \n\t "`、`page:0`、`page:1.5` 均 `invalid-input`、不写盘、mtime 不变 |
| 10 越界文档 | `10)` 段：`outside` +「该文档不在当前资料库内」、不写盘 |
| 11 备注 / 删除 | `11)` 段：answer 条目 `updateNoteComment` / `deleteNote` 均成功且全量回传；excerpt 条目字节逐字不变 |
| 12 导出（两类标注） | `12)` 段：`count === 2`；同时含 `### 第 2 页` 与 `### 第 2 页 · AI 结论`；标题行/统计行（逐字正则）/分组行/`\n\n---\n\n`/`> ` 前缀/末尾 `\n`；导出前后 `notes.json` 的 sha256 与 mtime 相同；二次导出除生成时间行外逐字节相同 |
| 13 只含 excerpt 的库导出 | `13)` 段：无 `AI 结论`；模板逐行断言（无标注） |
| 14 损坏 / 版本 / 逃生口 | `14)` 段：截断 JSON → `corrupt` + 逐字文案 + 字节/mtime 不变；`resetCorruptNotes` → 备份名匹配 `\.corrupt-\d{8}-\d{6}$`、备份内容 = 原字节、重建后为空库；`version:2` → `version-unsupported` + 字节不变；正常库 → `not-corrupt` + 字节/mtime 不变 |
| 原子性（补充） | `15)` 段：`.tmp` 被目录占用 → `write-failed` +「笔记写入失败」且原文件字节/mtime 不变；释放后同一路径可再写；写盘后无 `.tmp`；`.pix-read` 被整目录删除后可自愈（`mkdir recursive`） |
| 判定顺序（补充） | `16)` 段：无根时 `addNote` → `no-root` +「尚未选择资料库根目录」，`loadNotes` → `no-root` + 空 `filePath` |

### A.4 真实命令与真实输出

**命令 1（唯一工程门 `cd pix && npm run check`）**

```text
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
src/renderer/components/workspace/PdfSelectionQuickAsk.vue(153,43): error TS2345: Argument of type '{ docFilePath: string; page: number; text: string; }' is not assignable to parameter of type 'ReaderNoteDraft'.
  Property 'kind' is missing in type '{ docFilePath: string; page: number; text: string; }' but required in type 'ReaderNoteDraft'.
CHECK_EXIT=2
```

A 面自身的两个编译单元（`&&` 链被 vue-tsc 中断，故单独再跑）：

```text
$ ./node_modules/.bin/tsc -p tsconfig.main.json --noEmit
MAIN_EXIT=0
$ ./node_modules/.bin/tsc -p tsconfig.preload.json --noEmit
PRELOAD_EXIT=0
```

**命令 2（§7.2 数据面烟测：编译到仓库外临时目录 + node 运行；脚本与临时目录跑完删除）**

```text
$ cd pix && ./node_modules/.bin/tsc --outDir /tmp/pix-r7-notes --module commonjs --target es2022 \
    --moduleResolution node --skipLibCheck --strict src/main/notes-store.ts src/main/library-root.ts
TSC_EXIT=0
$ find /tmp/pix-r7-notes -type f
/tmp/pix-r7-notes/main/library-root.js
/tmp/pix-r7-notes/main/notes-store.js
/tmp/pix-r7-notes/shared/types.js

$ node %TEMP%/pix-r7-smoke.cjs %TEMP%/pix-r7-notes/main
OK   1) success + 恰 1 条
OK   2) excerpt 与 answer 各自入库
（中段断言全部 OK，逐条打印，无 FAIL）
OK   15) .pix-read 目录被删可自愈
OK   16) 无根 → no-root + 文案
OK   16) 无根 load → no-root + 空 filePath

checks=77 failed=0
SMOKE_EXIT=0
```

（完整 77 条断言逐条打印 `OK`，无 `FAIL`；`checks=77 failed=0`、退出码 0。）

**命令 3（设计档 §7.5 只读核对点，A 面相关行）**

```text
$ grep -n 'kind: "excerpt"\|draft.kind\|ANSWER_TOO_LONG_MESSAGE' pix/src/main/notes-store.ts
48:const ANSWER_TOO_LONG_MESSAGE = "回答过长（超过 4000 字），无法存为笔记";
282:  if (draft.kind !== "excerpt" && draft.kind !== "answer") return failure("invalid-input");
294:      error: draft.kind === "answer" ? ANSWER_TOO_LONG_MESSAGE : ERROR_MESSAGES["too-long"],
300:  const key = duplicateKey(docPath, draft.page, draft.kind, text);
310:    kind: draft.kind,
（no.6：`kind: "excerpt"` 字面量 0 命中；answer 文案只在独立常量里）

$ grep -c 'ipcMain.handle("notes' pix/src/main/ipc-handlers.ts
6
（no.8：六通道不增不减）

$ git diff --name-only
pix/src/main/ipc-handlers.ts
pix/src/main/notes-store.ts
pix/src/shared/types.ts
（no.9：不含 pix/src/main/preload.ts；no.10：只含 A 面白名单）

$ grep -rn ': any\|as any\|await import(\|import(' pix/src/shared/types.ts pix/src/main/notes-store.ts pix/src/main/ipc-handlers.ts
（no.11：0 命中）

$ git diff -U0 pix/src/main/notes-store.ts | grep -E '^[+-]' | grep -E 'isReaderNote|parseNotesFile|writeFileAtomic|resetCorruptNotes'
+  // kind 白名单必须在一切读写盘之前：非法取值一旦落盘，读侧的 isReaderNote 会把整库判成损坏
（no.7：唯一命中是一行注释；码表键增删 0 —— 变更行里 ERROR_MESSAGES 只出现「新增常量注释」与「读既有 too-long 键」两处）
```

**命令 4（工作区状态）**

```text
$ git status --short
 M pix/src/main/ipc-handlers.ts
 M pix/src/main/notes-store.ts
 M pix/src/shared/types.ts
?? docs/pm/R7-design.md          （流水线既有，非本次改动）
?? docs/pm/R7-dev.md             （本档）
?? docs/pm/R7-req.md             （流水线既有，非本次改动）
?? docs/pm/R7-review.md          （流水线既有，非本次改动）

$ git diff --numstat
1	0	pix/src/main/ipc-handlers.ts
23	8	pix/src/main/notes-store.ts
20	2	pix/src/shared/types.ts
```

### A.5 自评清单（设计档 §8 中属于 A 面的条目）

| 要求 | 结论 | 证据 |
| --- | --- | --- |
| §1.1–§1.3 契约按字面落地（含判定顺序与 `too-long` 文案分叉） | 通过 | A.1 表 + A.2 D1–D6 + 烟测 `4)`/`6)`/`7)`/`10)`/`16)` 段（判定顺序先于一切读写盘：非法 kind 与空内容/page 非法/越界三种输入都断言了「不写盘、mtime 不变、无 `.tmp`」） |
| `too-long` 两条文案逐字、不给 `ERROR_MESSAGES` 加键（§8 自评 1） | 通过 | smoke `6)`/`7)` 逐字比对「回答过长（超过 4000 字），无法存为笔记」与「选中内容过长（超过 4000 字），请分段摘录」；A.4 命令 3 的 no.7 判定：码表键增删 0 |
| 既有 excerpt 行为与改动前逐条等价（§7.2 用例 3） | 通过 | 去重键多一维常量（excerpt），只含 excerpt 的库命中结果逐条相同：smoke `3)` 段 |
| 读侧与逃生口零改动（损坏绝不覆盖、写入原子） | 通过 | `isReaderNote`/`parseNotesFile`/`writeFileAtomic`/`resetCorruptNotes` 无代码改动（A.4 命令 3 no.7）；smoke `14)`/`15)` 段：corrupt 与 version-unsupported 三态下原文件字节/mtime 不变、备份名唯一、`.tmp` 被占时 `write-failed` 且原文件不动 |
| 入参校验双层（IPC 形状 + store 白名单，MF4） | 通过 | `ipc-handlers.isNoteDraft` 增 kind 形状校验（+1 行）；`addNote` 内白名单直判；smoke `4)` 段绕过 IPC 直呼 store，覆盖「非法 kind 不写盘」 |
| 回答入库为归一化单行（§8 自评 6，既有形态不变） | 通过 | `normalizeNoteText` 及其调用点零改动；smoke `12)` 段的正文行 `> AI 结论正文` 来自归一化后的文本 |
| 「锚点文档已被删除 ⇒ 保存成功」是既有事实（§8 自评 3） | 通过（数据面口径） | `addNote` 只走 `toRelativeDocPath`（`isLibraryFilePath` 前缀归属 + `realpathSync` 失败被吞，`library-root.ts:38-52`），无存在性校验；A 面本轮不改该行为，离屏取证由 B 面场景 36 的末段承担 |
| 无 `any` / 无内联动态导入 / 不加依赖 / 无死代码 | 通过 | A.4 命令 3 no.11（0 命中）；未改 `pix/package.json`；新增符号全部被使用（`ReadingAnchor` 被 `DisplayBlock` 与渲染层类型面消费） |
| 白名单外零改动（`preload.ts` 不改） | 通过 | A.4 命令 3 no.9 / 命令 4 |
| 唯一工程门 0 error | **未达成（跨面）** | vue-tsc 报 1 条且仅 1 条错误，落在 B 面尚未落地的调用点 `PdfSelectionQuickAsk.vue:153`（`kind` 缺失，设计档 §8 声明的编译前置）；A 面两个编译单元 `MAIN_EXIT=0` / `PRELOAD_EXIT=0`；B 面补 `kind` 后该错误消失（见 A.6） |

### A.6 未验证事项与后续动作

- **`npm run check` 的 0 error 依赖 B 面落地**：本档记录的是 A 面完成时刻的真实状态（命令 1 收尾重跑同结果，命令 2 亦重跑一次复现 77/77）。B 面（`PdfSelectionQuickAsk.vue` 的 `kind: "excerpt"`、`ChatPanel.vue` 的 `kind: "answer"`）落地后需重跑一次并回填结果；A 面不再改动即可转绿。判定依据：`git status --short` 在 A 面工作全程只显示 A 面三文件（渲染层与 `ui-shot.mjs` 无任何写入），说明 B 面是流水线中 A 之后的独立一步（设计档 §8「A 必须先合入类型面」）。
- 未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`（红线 3）。
- 未跑 `scripts/ui-shot.mjs`（B 面白名单文件 + 离屏取证属 B 面交付定义）。
- `ipc-handlers.isNoteDraft` 的 kind 形状校验无法在无 Electron runtime 下直测（handler 注册依赖 `ipcMain`），本档以「主进程编译 0 error + 只读走查 + store 层同款直判的烟测用例 4」作为替代证据。
- 烟测脚本与编译产物写在 `%TEMP%`，跑完已删除；仓库内无临时文件。

---

## 开发 B（UI 与会话面）

> 上游：设计档 §1.4–§1.6、§2、§3、§5、§7.3、§7.4；A 面已交付的契约（`shared/types.ts` 的 `ReaderNoteDraft.kind` / `ReadingAnchor` / `DisplayBlock.readingAnchor?`）先读再动。
> 判定工具：【走查】【check】【离屏】（见 B.4 的真实命令与真实输出）。

### B.1 改动文件清单

| 文件 | 动作（diff 行数） | 内容 |
| --- | --- | --- |
| `pix/src/renderer/stores/session-store.ts` | 修改（+30/-3） | ① `ReadingAnchor` 从 `@shared/types` 顶层 `import type`；② `appendOptimisticUserMessage(text, filePaths = [], anchor = null)` 增第三参 + 条件展开 `...(anchor ? { readingAnchor: anchor } : {})`；③ 新增并导出 `readingAnchorFor(blockId)`（§2.5 唯一实现点）；④ `appendUserOrNoteMessage` / `loadMessages` / `failOptimisticUserMessage` / `clearSession` / `matchOptimisticUserMessage` 逐字未动（`loadMessages` 区间内 `readingAnchor` 0 命中） |
| `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改（+205/-12） | ① `send()` 内唯一快照点（见 D-B1）；② 第三参接线；③ 回答块动作区 `.answer-save-wrap` / `.answer-save-btn` / `.answer-note-feedback` 与三分支提示、三态原位反馈、2500ms 回位、`answerSavePending` 在途守卫；④ `onUnmounted` 清 `answerFeedbackTimers`；⑤ 复制按钮的 DOM/类名/CSS/行为、`[[pN]]` 跳页、chips、`renderAgentMarkdown`/`mdCache` 零改动 |
| `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 修改（+1/-1） | `addNote({ docFilePath, page, text })` → `addNote({ kind: "excerpt", docFilePath, page, text })`；`pending` / `FEEDBACK_MS` / 三态文案零改动 |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改（+18/-0） | `.note-head` 内 `.note-page-badge` 之后、`.note-time` 之前插 `v-if="note.kind === 'answer'"` 的 `.note-ai-badge`（文本 `AI`）+ 两条样式（`.note-ai-badge`、`.note-row.confirming .note-ai-badge`）；分组/排序/筛选/计数/备注/删除二次确认/错误态/逃生口零改动 |
| `pix/scripts/ui-shot.mjs` | 修改（+1037/-35） | §7.3 stub 写穿与控制口、§7.3.2 fixture 冻结（`notes.json` 初值空数组 + `seedNotes` 第 4 条 answer 种子）、§7.4.1 两条驱动原语与 `moveNeutral`/`clickLast`、§7.4.2 场景 30–36 与 `MEASUREMENTS` 断言 |
| `pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/types/session.ts`、`pix/src/renderer/components/session/MessageBlock.vue` | **不改** | 白名单里标「仅当确有必要」的三个文件本轮均无必要：`addNote` / `applyNotes` / `AddNoteResult` 三态原样复用（失败不吞、不做乐观合并）；`ReadingAnchor` 直引 `@shared/types`，re-export 列表不动；用户块不承载锚点，`MessageBlock` 的 props 无新增 |

白名单外零改动：`git diff --name-only` 只含 A 面三文件 + 上面五个 B 面文件；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、electron-builder 配置、`pix/src/main/**`（含 `preload.ts`）与其余渲染层文件未被触碰。

**越界说明（唯一两处，均在设计档 §4.2/§8 的 B 面白名单内）**：委派提示里的 B 面文件清单未列 `PdfSelectionQuickAsk.vue` 与 `NotesPanel.vue`，但两者是设计档 §8「B 面（UI 与会话面）」白名单文件，且分别被两条硬约束直接要求：① `npm run check` 必须 0 error —— A 面交付时刻的 1 条 TS2345 就落在 `PdfSelectionQuickAsk.vue:153`（A.6 已声明「B 面补 `kind: "excerpt"` 后消失」）；② 交付要求「面板的 answer 区分」只能落 `NotesPanel.vue`（设计档 §4.2「只加徽标、其余零改动」）。两处改动都已按设计档最小化（前者一行、后者一个 `v-if` 节点 + 两条样式）。

### B.2 关键决策与偏差

契约零偏差：类型名/字段名/函数名/选择器/中文文案/判定顺序全部按设计档字面落地（文案逐字见 B.3 的 `MEASUREMENTS` 实测值）。以下是设计档没写清、或写清了但与现状不可同时满足的点：

| # | 决策 / 偏差 | 依据 |
| --- | --- | --- |
| D-B1 | `send()` 的快照写成一份 `readContext`（含 `filePath`/`page`/`pageCount`/`selectedText`），**锚点对象与 `buildReadingUserMessage` 的实参都从它取**：`const anchor = readContext.filePath ? { docFilePath: readContext.filePath, page: readContext.page } : null;`。设计档 §2.1 的等价写法（锚点字面量与实参字面量各写一次）会让 §7.5 no.2 的 `grep -c 'page: readPage'` 命中 2（该判定要求四条均为 1），而语义不变：`filePath`/`page` 各只读一次、两者同源、锚点登记不受 `excluded.has("document")` 分支约束（`readContext` 在分支之前构造）；`buildReadingUserMessage` 的入参仍是那四个字段、同一顺序 | 设计档 §2.1（快照规则）+ §7.5 no.2（四条 grep 均为 1），两者取可同时满足的形式 |
| D-B2 | 场景 31 的 `notesAddCalls().count === 1` 落成**基线增量** `delta === 1`（同时记绝对数）：既有场景 22b 的摘录链路已经产生 `notesAdd` 记录，绝对计数不等于 1 是既有事实。31b2 用的是设计档自己写的「相对基线 +1」口径 | 设计档 §7.4.2 场景 31 与 31b2（同一类断言的两种措辞） |
| D-B3 | 场景 31c 末段的 `saveBtnCount` 按设计档的定位口径取「**最后一个** `.agent-message` 内的按钮数」（=0），另记 `globalSaveBtnCount`（=3，前几轮已完成回答的按钮仍在；全局计数不是该断言的判据） | 设计档 §7.4.2 场景 31c「定位用「最后一个 `.agent-message`」」 |
| D-B4 | `moveMouse` 的滚动策略：**先把探针（`.answer-save-wrap`）自身滚进视口**再取点，探针拿不到时回落块内 `.agent-markdown` 首行、再回落整块；落点必须通过 `elementFromPoint` 校验否则 `throw`。设计档只写了「先 scrollIntoView」：对 4001 字的超长回答，整块 `scrollIntoView({block:"center"})` 会把动作区留在视口外，实测直接抛「落点不在目标元素内」（首轮失败现场），滚动探针自身即命中 | 设计档 §7.4.1（落点校验与回落要求） |
| D-B5 | hover 驱动实测走 **CDP**：首轮尝试时 `Input.dispatchMouseEvent` 的 `modifiers: []` 报 `Error: Invalid parameters`（协议要求位掩码整数），改成 `modifiers: 0` 后稳定命中 `hoverDriver: "cdp"`；`sendInputEvent` 兜底与 `forced` 降级路径均已实现但本轮未触发 | 设计档 §7.4.1 判定顺序（must-fix 8） |
| D-B6 | stub 与主进程的已知差异（设计档 §8 自评 5 的落地）：`readNotesFile` 解析失败/文件缺失按**空数组降级**（主进程同情形判 `corrupt`）；`notesAdd` **不做 tmp+rename 原子写**（原子性由 A 面烟测覆盖）；`notesExport` 只回 `count`、不生成 `notes.md` 内容（导出模板逐行断言由 A 面烟测 12/13 覆盖） | 设计档 §7.3.1 + §8 自评 5 |
| D-B7 | stub 的 `notesLoad` 仍是「`loadFailure` 注入优先于真读」，与既有场景 J（错误态）保持一致；`seedNotes` 返回值改为 fixture 文件路径（既有调用点只用于副作用，不读返回值） | 设计档 §7.3.1（写穿与状态） |
| D-B8 | 场景 35 的第二轮确认文本用脚本拼真实 `<reading_context>`（含 `path:`/`page:`/`pageCount:` 三行）而不是设计档示例里的省略号：文本必须与乐观文本**不同**才不命中，且要贴近真实注入形态；断言只判「不匹配 ⇒ 无锚点」，不读该串内容 | 设计档 §7.4.2 场景 35（`displayText` 与乐观文本不同 ⇒ 不命中） |

### B.3 离屏取证（stub 写穿、场景 30–36、断言映射）

**stub 面（§7.3）**：`notesLoad` 每次真读 `<OUT_ROOT>/library/.pix-read/notes.json`；`notesAdd` / `notesUpdate` / `notesDelete` / `notesReset` / `seedNotes` 五个口全部真写同一文件（`JSON.stringify({version:1,notes},null,2) + "\n"`）；`notesAdd` 按主进程口径做「空白折叠归一化 → kind 白名单 → 4000 上限（answer 独立文案）→ 去重键 `docPath + page + kind + text` → 命中回 `duplicateOf` 否则追加重写」；`docFilePath` 不在 `CONFIG.root` 前缀内 ⇒ `outside`（只判前缀、不校验存在性 ⇒ 场景 36 末段成立）。控制口新增 `notesAddCalls()` / `setNotesAddFailure(code|"throw")` / `setNotesAddDelay(ms)` / `setMessages(list)` / `emitAgentEvent(event)`，并把 `onAgentEvent` 从丢弃式 no-op 改为保留回调 + 返回取消函数。`writeFixtures()` 的 `notes.json` 初值为空数组（保住场景 B 空态），`seedNotes()` 增第 4 条 `n-current-3`（answer，与 `n-current-2` 同页且 `createdAt` 更晚）。

**驱动原语（§7.4.1）**：`moveMouse(selector, index=-1, probe=null)`（scrollIntoView → `elementFromPoint` 校验 → CDP `Input.dispatchMouseEvent` → `sleep(250)` → 复读 opacity，CDP 抛错或仍非 1 时回落 `sendInputEvent`，两级都不行记 `forced`）、`moveNeutral()`（读 hover-before 前把指针移出动作区）、`clickLast(selector, index=-1)`、`typeAndSend(text)`（原生 setter + `input` 事件 → 等 `.composer-send` 可点 → click）、`emit(event)`（`__pixStub.emitAgentEvent`）。每轮事件序列统一 `message_start user` → `agent_start` → `message_start/update assistant` → `message_end assistant` → `agent_end`（缺 `agent_end` 会让下一轮找不到 `.composer-send`）。

**场景与断言（`MEASUREMENTS.json` 实测值，逐条为脚本内 `throw`）**：

| 场景（截图） | 断言 label + 实测值 |
| --- | --- |
| 30 情形 (a)（`30-answer-save-btn.png`、`30b-answer-streaming.png`） | `answer-save`：`{phase:"streaming",btnCount:0,wrapCount:0}`；`{phase:"idle",btnCount:1}`；`{phase:"hover-before",wrapOpacity:"0",hoverDriver:"cdp"}`；`{phase:"hover",hoverDriver:"cdp",forcedVisible:false,wrapOpacity:"1",title:"存为笔记 · sample-paper.pdf 第 2 页",copyBtnCount:1,saveBtnCount:1,overlap:false}`；`{phase:"confirm",base:0,userBlocks:1}`；`answer-anchor`：`{phase:"flip-page",title:"…第 2 页"}`、`{phase:"switch-doc",title:"…sample-paper.pdf 第 2 页"}` |
| 31 保存成功（`31-answer-save-ok.png`） | `answer-anchor`：`{phase:"payload",delta:1,lastPayload:{…,page:2,kind:"answer"},saved:{docPath:"sample-paper.pdf",page:2,kind:"answer",hasFence:true,hasRenderArtifact:false}}`；`answer-feedback`：`{phase:"ok",state:"ok",text:"已存为笔记 · sample-paper.pdf 第 2 页",tabLabel:"笔记 7"}`（左栏 tab 文案与文件条数自洽） |
| 31b 重复（`31b-answer-save-duplicate.png`） | `answer-feedback`：`{phase:"duplicate",state:"duplicate",text:"已在笔记中",callsDelta:1,bytesUnchanged:true}`（`notes.json` 字节哈希与 31 之后一致） |
| 31b2 在途连点（复用 31b 的 DOM 取证） | `answer-save`：`{phase:"reentrant",delta:1,payloads:[…,{docFilePath:…older-paper.pdf,page:1,text:"第二轮回答",kind:"answer"}],inFile:true}`（`setNotesAddDelay(600)` 造窗口、同一同步段两次点击 ⇒ 只 1 次 IPC） |
| 31c 超长（`31c-answer-save-too-long.png`） | `answer-save`：`{phase:"turn-3",title:"存为笔记 · older-paper.pdf 第 1 页"}`；`answer-feedback`：`{phase:"too-long",state:"error",text:"保存失败：回答过长（超过 4000 字），无法存为笔记",calls:1,bytesUnchanged:true}`；`{phase:"blank-content",saveBtnCount:0,globalSaveBtnCount:3,lastBlockSaveWrapCount:0,lastBlockTextTrim:""}` |
| 32 徽标与排序（`32-answer-note-badge.png`、`32b-answer-note-badge-left-pane.png`）+ answer 行等价断言 | `answer-notes-list`：`{phase:"badges",badgeCount:3,fileAnswerCount:3,badgeTexts:["AI","AI","AI"],page2Ids:["n-current-2","n-current-3","n-…","n-…"],page2BadgeCounts:[0,1,0,1],excerptRowHasNoBadge:true,headOverflow:[true×6]}`（第 2 页子序列：`n-current-2` 在 `n-current-3` 之前）；`answer-note-row`：`{phase:"comment",domComment:"由回答入库",fileComment:"由回答入库"}`、`{phase:"delete-confirm",confirming:true,rowsDelta:-1,fileDelta:-1,badgeCountEqFile:true}`、`{phase:"jump",pageLabel:"第 2 / 3 页"}` |
| 33 情形 (b)（`33-answer-history-fallback.png`） | `answer-save`：`{phase:"fallback",title:"存为笔记 · sample-paper.pdf 第 3 页（按当前阅读位置）"}`；`answer-anchor`：`{phase:"fallback-payload",delta:1,lastPayload:{…,page:3,kind:"answer"},inFile:true}` |
| 34 情形 (c)（`34-answer-save-disabled.png`） | `answer-save`：`{phase:"disabled",disabled:true,title:"无法存为笔记：这条回答没有发送时的文档锚点，且当前没有打开文档",deltaAfterClick:0}` |
| 35 锚点不跨轮（`35-answer-anchor-strict.png`） | `answer-save`：`{phase:"strict",title:"存为笔记 · sample-paper.pdf 第 2 页（按当前阅读位置）",base:0,userBlocks:3}`（若实现回溯上一轮锚点，会显示「第 1 页」且无回退后缀 ⇒ 直接失败） |
| 36 失败注入（`36-answer-save-failure.png`）+ 已删除文档 | `answer-feedback`：`{phase:"outside",state:"error",text:"保存失败：该文档不在当前资料库内",callsDelta:1,bytesUnchanged:true}`、`{phase:"corrupt",text:"保存失败：笔记文件无法读取（文件已损坏，未被修改）"}`、`{phase:"throw",text:"保存失败：主进程调用异常：stub notesAdd 注入异常"}`、`{phase:"recovered",state:"ok",text:"已存为笔记 · sample-paper.pdf 第 2 页"}`（按钮回可点）、末段 `{phase:"deleted-doc",state:"ok",text:"已存为笔记 · older-paper.pdf 第 1 页",inFile:true}`（`rmSync` 后仍成功，§5 第 3 行） |

顺序耦合声明沿用设计档：场景 32 的徽标计数取「与 fixture 文件内 answer 条数相等」的自洽口径（不写死绝对数）；31c/35/36 各自新起轮次、互不依赖彼此锚点；36 末段的 `rmSync(archive/older-paper.pdf)` 是该文件的最后一次使用（既有 22c/22d/22e 在其前）。

### B.4 真实命令与真实输出

**命令 1（唯一工程门）**

```text
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0
```

（A 面交付时刻的 1 条 TS2345 落在 `PdfSelectionQuickAsk.vue:153`，B 面补 `kind: "excerpt"` 后消失；此后 `ChatPanel.vue` 因 D-B1 改写过一次 `send()`，重跑仍 0 error。）

**命令 2（离屏取证）**

```text
$ cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
[ui-shot] fixture 资料库：C:\Users\86157\AppData\Local\Temp\pix-r5\library
[ui-shot] 截图目录：C:\Users\86157\AppData\Local\Temp\pix-r5\shots
[ui-shot] vite dev server 就绪：http://localhost:5199/
[ui-shot] 渲染层已加载（dpr=1, 视口=1600x1000），开始场景
...（00–11 既有 28 张 + 20/20b/20c/20d/21/21b/22/22b/22c/22d/22e/23/24/24b 既有 16 张全部通过，断言值不变）...
[ui-shot] 30 情形 (a)：第 2 页发送 → 翻页与换文档后目标仍是第 2 页
[shot] 30b-answer-streaming.png
[shot] 30-answer-save-btn.png
[ui-shot] 31 保存成功：payload 带锚点页码与 kind，入库文本是回答原文
[shot] 31-answer-save-ok.png
[ui-shot] 31b 重复保存：去重命中、零写入
[shot] 31b-answer-save-duplicate.png
[ui-shot] 31b2 在途连点：setNotesAddDelay(600) 造窗口，两次点击只发一次 notesAdd
[ui-shot] 31c 超长回答：answer 文案逐字、零写入；空白回答不渲染动作
[shot] 31c-answer-save-too-long.png
[ui-shot] 32 徽标与排序（answer 与 excerpt 同组混排）
[shot] 32-answer-note-badge.png
[shot] 32b-answer-note-badge-left-pane.png (272x956 @ 8,36)
[ui-shot] 33 情形 (b)：历史会话 + 当前阅读位置回退
[shot] 33-answer-history-fallback.png
[ui-shot] 34 情形 (c)：无锚点 + 无打开文档 → 按钮禁用，点击不产生 IPC
[shot] 34-answer-save-disabled.png
[ui-shot] 35 锚点不跨轮：确认不匹配 ⇒ 回答块显示「按当前阅读位置」的第 2 页
[shot] 35-answer-anchor-strict.png
[ui-shot] 36 失败注入：outside / corrupt / throw 三态与原位回位
[shot] 36-answer-save-failure.png
[ui-shot] 测量 answer-save: {"phase":"hover-before","wrapOpacity":"0","hoverDriver":"cdp","cdpError":null,"sendInputError":null}
[ui-shot] 测量 answer-save: {"phase":"hover","hoverDriver":"cdp","forcedVisible":false,"wrapOpacity":"1","title":"存为笔记 · sample-paper.pdf 第 2 页","copyBtnCount":1,"saveBtnCount":1,"overlap":false}
[ui-shot] 测量 answer-save: {"phase":"strict","title":"存为笔记 · sample-paper.pdf 第 2 页（按当前阅读位置）","base":0,"userBlocks":3}
[ui-shot] 测量 answer-feedback: {"phase":"deleted-doc","state":"ok","text":"已存为笔记 · older-paper.pdf 第 1 页","inFile":true}
[ui-shot] 结束：产出 55 张截图
UI_SHOT_EXIT=0
```

`MANIFEST.json`：`failure === null`（`generatedAt = 2026-09-15T03:43:24.294Z`）、`shots.length === 55`；`MEASUREMENTS.json` 共 57 组，新增 label 5 个：`answer-save` / `answer-anchor` / `answer-feedback` / `answer-notes-list` / `answer-note-row`。截图数改前 44（R6 交付值，`docs/pm/R6-dev.md:397`）→ 改后 55，新增恰为设计档列的 11 张，既有 44 张零缺失。

**命令 3（§7.5 代码级核对点，只读）**

```text
$ grep -rn "\.addNote(" pix/src/renderer
pix/src/renderer/components/workspace/ChatPanel.vue:491:    const result = await notesStore.addNote({
pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue:153:  const result = await notesStore.addNote({ kind: "excerpt", docFilePath, page, text });

$ S=$(sed -n '/^async function send(/,/^}$/p' pix/src/renderer/components/workspace/ChatPanel.vue)
$ echo "$S" | grep -c 'readerStore\.filePath'      → 1
$ echo "$S" | grep -c 'readerStore\.page[^C]'      → 1     # 不含 pageCount
$ echo "$S" | grep -c 'filePath: readFilePath'     → 1
$ echo "$S" | grep -c 'page: readPage'             → 1
# 诚实标注（设计档 §7.5 no.2 要求）：前两条在改前的代码上也是 1+1（原 :306-309 本就各读一次），
# 单独不具判别力；后两条是判别条件 —— 若把 buildReadingUserMessage 的实参写回 readerStore.*，后两条为 0 ⇒ 失败。

$ sed -n '/function readingAnchorFor/,/^  }$/p' pix/src/renderer/stores/session-store.ts
  function readingAnchorFor(blockId: string): ReadingAnchor | null {
    const blocks = displayBlocks.value;
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index < 0) return null;
    for (let i = index - 1; i >= 0; i -= 1) {
      const block = blocks[i];
      if (block.type !== "user-message") continue;      # 只跳过非 user-message 块
      return block.readingAnchor ?? null;               # 遇第一个 user-message 即终止
    }
    return null;
  }

$ grep -n "readingAnchor" pix/src/renderer/stores/session-store.ts
268:      ...(anchor ? { readingAnchor: anchor } : {})        # 唯一赋值（appendOptimisticUserMessage 内）
285:  function readingAnchorFor(blockId: string): ReadingAnchor | null {
292:      return block.readingAnchor ?? null;
762:    readingAnchorFor,                                     # store 导出
# appendUserOrNoteMessage / loadMessages / failOptimisticUserMessage / clearSession 区间内 0 命中

$ grep -rn "appendOptimisticUserMessage(" pix/src/renderer
pix/src/renderer/components/workspace/ChatPanel.vue:301: ...appendOptimisticUserMessage(text, filePaths, anchor);   # 3 实参
pix/src/renderer/stores/session-store.ts:251:  function appendOptimisticUserMessage(                          # 3 参定义

$ grep -rn "note-ai-badge" pix/src/renderer
pix/src/renderer/components/workspace/NotesPanel.vue:321: <span v-if="note.kind === 'answer'" class="note-ai-badge">AI</span>
pix/src/renderer/components/workspace/NotesPanel.vue:684: .note-ai-badge {
pix/src/renderer/components/workspace/NotesPanel.vue:696: .note-row.confirming .note-ai-badge {

$ grep -rn ": any\|as any\|await import(\|import(" <B 面五个文件>      → 0 命中
$ grep -c 'ipcMain.handle("notes' pix/src/main/ipc-handlers.ts      → 6      # 通道不增不减
$ grep -n 'kind: "excerpt"\|draft.kind\|ANSWER_TOO_LONG_MESSAGE' pix/src/main/notes-store.ts
48:const ANSWER_TOO_LONG_MESSAGE = "回答过长（超过 4000 字），无法存为笔记";
282:  if (draft.kind !== "excerpt" && draft.kind !== "answer") return failure("invalid-input");
294:      error: draft.kind === "answer" ? ANSWER_TOO_LONG_MESSAGE : ERROR_MESSAGES["too-long"];
300:  const key = duplicateKey(docPath, draft.page, draft.kind, text);
310:    kind: draft.kind,                                       # 原硬编码已删净

$ git diff --stat pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue
 1 file changed, 1 insertion(+), 1 deletion(-)              # 只有 kind: "excerpt" 一行语义改动
$ git diff --stat pix/src/renderer/stores/notes-store.ts pix/src/renderer/types/session.ts pix/src/renderer/components/session/MessageBlock.vue
（空，三文件零改动）
$ git diff --name-only
pix/scripts/ui-shot.mjs
pix/src/main/ipc-handlers.ts
pix/src/main/notes-store.ts
pix/src/renderer/components/workspace/ChatPanel.vue
pix/src/renderer/components/workspace/NotesPanel.vue
pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue
pix/src/renderer/stores/session-store.ts
pix/src/shared/types.ts
```

### B.5 自评清单（设计档 §8 中属于 B 面的条目）

| 要求 | 结论 | 证据 |
| --- | --- | --- |
| `send()` 的快照点判定（§8 自评 2 / §7.5 no.2） | 通过 | 命令 3：四条 grep 均为 1，并已诚实标注「前两条在改前也是 1」；D-B1 说明了取 `readContext` 形式的原因 |
| 三分支（锚点 > 当前位置 > 禁用）与提示文案（§2.6/§3） | 通过 | 场景 30/33/34/35 的 `title` 实测值：锚点分支 `存为笔记 · sample-paper.pdf 第 2 页`、回退分支 `…第 3 页（按当前阅读位置）`、不可用分支 `无法存为笔记：这条回答没有发送时的文档锚点，且当前没有打开文档` |
| 流式中与空白回答不渲染动作（N36 验收 3/11） | 通过 | 场景 30 `{phase:"streaming",btnCount:0}`；场景 31c `{phase:"blank-content",…}`（块内按钮与动作容器均 0） |
| 三态原位反馈与 2500ms 回位、反馈期不再点（N38、§5 第 11/12 行） | 通过 | 场景 31/31b/31c/36 的 `data-state` 与逐字文本；31b/36 每次重点前都 `waitFor`「按钮回位且全局反馈数为 0」；31b2 的 `delta:1` 证明在途窗口被守卫拦住 |
| 成功/重复/失败反馈里的页码与 `<文件名>` 口径（§3） | 通过 | `已存为笔记 · sample-paper.pdf 第 2 页` / `已在笔记中` / `保存失败：…`；`answerDocName` 取最后一个分隔符之后，场景 31c 用 basename `older-paper.pdf` 断言（must-fix 2） |
| 确认不匹配 ⇒ 无锚点、不回溯（§2.3、§2.5、§8 自评 4） | 通过 | 场景 35：`title` 含「（按当前阅读位置）」与「第 2 页」且不含「第 1 页」，`userBlocks = 基线 + 3` |
| 锚点文档已被删除 ⇒ 保存成功（§5 第 3 行、§8 自评 3） | 通过（离屏面） | 场景 36 末段 `rmSync` 后 `{state:"ok"}` 且 fixture 新增该条 |
| 面板徽标只区分来源、排序/筛选/计数/备注/删除/跳回零改动（§4.2） | 通过 | 场景 32：徽标数 = 文件 answer 数、`badgeTexts` 全为 `AI`、excerpt 行无徽标、第 2 页子序列正确、`headOverflow` 全 true；answer 行的备注/删除二次确认/跳回原文三态等价断言全部命中；既有 `00–11`（含 `05b-note-delete-confirm`、`10-notes-error`）与 `20–24` 场景零回归 |
| 复制按钮、`[[pN]]` 跳页、chips、摘录、R6 现场恢复与续读入口不回归 | 通过 | `git diff` 中 `.message-copy-btn` 的模板/CSS/行为、`jumpToPage`、`documentChip`/`selectionChip`/`excludeContext` 无改动；既有 44 张截图与断言值全部不变（含 `resume-entry`/`tree-progress`/`reader-state-writes`/`workspace-switch`） |
| 回答入库是归一化单行文本、不混渲染产物（§8 自评 6） | 通过 | 场景 31：`saved.hasFence === true`（python 围栏保留）、`hasRenderArtifact === false`（无 `<div`/`<p `/`class=`） |
| stub 与主进程差异已知（§8 自评 5） | 通过 | D-B6（三处差异逐条列明） |
| 无 `any` / 无内联动态导入 / 不加依赖 / 无死代码 | 通过 | 命令 3 的 grep 0 命中；未改 `pix/package.json`；新增函数全部有调用点（`answerSaveTitle`/`answerSaveDisabled`/`canShowAnswerSave`/`answerDocName`/`moveMouse`/`moveNeutral`/`clickLast`/`typeAndSend`/`emit` 均在模板或场景中被调用） |
| 白名单外零改动 | 通过 | 命令 3 的 `git diff --name-only`；两处渲染层越界的理由见 B.1 末段 |
| 唯一工程门 0 error | 通过 | 命令 1：`CHECK_EXIT=0` |

### B.6 未验证事项

- **`forced` 降级路径本轮未被触发**：CDP 在 `modifiers: 0` 后稳定命中，`sendInputEvent` 与 `forced` 只在代码层实现（`MEASUREMENTS` 里 `forcedVisible` 恒为 `false`、`hoverDriver` 恒为 `"cdp"`）。若某环境 CDP 失效，判定顺序会按 §7.4.1 逐级回落，`hoverDriver`/`cdpError`/`sendInputError` 三个字段已留痕可判别。
- **真实主进程的 kind 守卫未在离屏面直测**：stub 的 kind 白名单是独立实现（D-B6），`ipc-handlers.isNoteDraft` 的形状校验由 A 面编译 + 走查覆盖（A.6 已声明同口径）。
- **「锚点文档已被删除后点击笔记跳回」的 UI 表现**属既有 ReaderPanel 失败态，未新增离屏场景（设计档 §7.4.2 降级理由已声明只走查）。
- 未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`（红线 3）；未执行任何 git 写命令（只用 `status`/`diff`/`show` 只读）。
- 离屏脚本的产物全部写在 `%TEMP%/pix-r5`，仓库内无临时文件；未创建 `nul` 等 Windows 保留名文件。

---

## 终验（独立验收）

> 执行者：终验子代理（独立于开发 A/B 与代码审查者）。判定原则：只采信本次亲手跑出的输出，A/B/审查结论仅作对照。
> 时间 2026-09-15；工作区 `E:/develop/PiX-Read`；全程只读 git（`status`/`diff`/`show`），未执行任何 git 写命令，未修改任何代码；临时产物写在仓库外并已删除。

### 一、唯一工程门

```text
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit

CHECK_EXIT=0
```

无任何 error 输出（A 面交付时刻的 `PdfSelectionQuickAsk.vue:153` TS2345 已由 B 面 `kind: "excerpt"` 消除）。

### 二、git 卫生

```text
$ git status --short
 M pix/scripts/ui-shot.mjs
 M pix/src/main/ipc-handlers.ts
 M pix/src/main/notes-store.ts
 M pix/src/renderer/components/workspace/ChatPanel.vue
 M pix/src/renderer/components/workspace/NotesPanel.vue
 M pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue
 M pix/src/renderer/stores/session-store.ts
 M pix/src/shared/types.ts
?? docs/pm/R7-design.md
?? docs/pm/R7-dev.md
?? docs/pm/R7-req.md
?? docs/pm/R7-review.md

$ git diff --stat -- packages/                        （空）
$ git diff --stat -- pix/package.json pix/package-lock.json   （空）
$ git diff --name-only                                （恰上表 8 个 M 文件，全在 R7 白名单）
```

仓库内无 `*.tmp` / `*.tsbuildinfo` / `nul` 等临时产物（`find` 排除 node_modules 后为空）。

### 三、离屏取证

```text
$ cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs
[ui-shot] 结束：产出 55 张截图
UI_SHOT_EXIT=0
```

- `MANIFEST.json`：`failure === null`（`generatedAt = 2026-09-15T03:56:16.779Z`）、`shots.length === 55`。
- `MEASUREMENTS.json`：57 条 / 17 组，其中 `answer-save` 11、`answer-anchor` 4、`answer-feedback` 8、`answer-notes-list` 1、`answer-note-row` 3。
- 截图名单与 HEAD 精确对照：`capturePage` 调用 HEAD 45 个 → 现 56 个；**新增恰 11 张**（`30-answer-save-btn`、`30b-answer-streaming`、`31-answer-save-ok`、`31b-answer-save-duplicate`、`31c-answer-save-too-long`、`32-answer-note-badge`、`32b-answer-note-badge-left-pane`、`33-answer-history-fallback`、`34-answer-save-disabled`、`35-answer-anchor-strict`、`36-answer-save-failure`），**零删除、零改名**；既有 44 张全部在列。
- 新场景关键读数（直接从 `MEASUREMENTS.json` 取原文，均为脚本内 throw 断言通过后的落盘值）：`answer-save` streaming `{btnCount:0,wrapCount:0}` / idle `{btnCount:1}` / hover-before `{wrapOpacity:"0",hoverDriver:"cdp"}` / hover `{wrapOpacity:"1",title:"存为笔记 · sample-paper.pdf 第 2 页",copyBtnCount:1,saveBtnCount:1,overlap:false}` / reentrant `{delta:1}` / turn-3 `{title:"存为笔记 · older-paper.pdf 第 1 页"}` / blank-content `{saveBtnCount:0,lastBlockSaveWrapCount:0,lastBlockTextTrim:""}` / fallback `第 3 页（按当前阅读位置）` / disabled `{disabled:true,deltaAfterClick:0}` / strict `{title:"…第 2 页（按当前阅读位置）",userBlocks:3}`；`answer-anchor` flip-page 与 switch-doc 标题均保持 `sample-paper.pdf 第 2 页`、payload `{page:2,kind:"answer"}`、`saved{hasFence:true,hasRenderArtifact:false}`；`answer-notes-list` `{badgeCount:3,fileAnswerCount:3,badgeTexts:["AI","AI","AI"],page2 子序列 n-current-2 在 n-current-3 前,excerptRowHasNoBadge:true,headOverflow 全 true}`。
- 陈旧产物声明：`%TEMP%/pix-r5/shots/99-failure-state.png`（11:36）是修复前失败运行的残留，**不在本次 MANIFEST 内**；本次绿跑截图数以 MANIFEST 的 55 为准。

### 四、目视核对（read 工具逐张）

| 截图 | 核对点 | 结论 |
| --- | --- | --- |
| `30-answer-save-btn.png` | hover 后「存为笔记」与复制按钮同排不重叠；左栏树行 sample-paper 显示第 2 页 | 通过 |
| `31-answer-save-ok.png` | 原位反馈「已存为笔记 · sample-paper.pdf 第 2 页」；左栏 tab「笔记 6」→「笔记 7」；当前视图已切到 older-paper.pdf 第 1 页，仍写发送时的 sample-paper 第 2 页 | 通过 |
| `32-answer-note-badge.png` | answer 行带「AI」徽标（older-paper 第 1 页、sample-paper 第 2 页），excerpt 行无徽标，同组混排、行内不溢出 | 通过 |
| `33-answer-history-fallback.png` | 回退分支反馈落「第 3 页」（与当前阅读位置一致） | 通过 |
| `36-answer-save-failure.png` | 失败反馈「保存失败：该文档不在当前资料库内」原位常显 | 通过 |
| `02-notes-list.png`（既有场景） | 面板布局/列表/开关/导出按钮无破坏；因设计档冻结的第 4 条 answer 种子，计数 3→4、多一枚 AI 徽标属预期变化，非回归 | 通过 |

### 五、独立数据面验证（仓库外，自建脚本）

方法：用 `tsc --outDir %TEMP%/pix-r7-final/… --module commonjs --strict` 分别编译当前 `notes-store.ts`+`library-root.ts` 与 `git show HEAD:` 的同名文件（`NEW_TSC_EXIT=0` / `HEAD_TSC_EXIT=0`），再用自写 node 脚本对真实文件字节断言。共 51 条，`checks=51 failed=0`，`VERIFY_EXIT=0`。要点：

- excerpt 与 answer 同页同文本 → 文件恰 2 条、id 不同、kind 各一；answer 第三次保存 → `duplicateOf` = answer 条 id、无 `note` 字段、sha+mtime 不变；同页同 kind 不同文本 → 新条目（D4 判别回归位）。
- 写盘形态：`JSON.stringify(...,null,2) + "\n"`、`docPath` 为斜杠相对路径、`comment: ""`、`createdAt === updatedAt`、每次写后无 `.tmp` 残留。
- 导出：同时含 `### 第 2 页` 与 `### 第 2 页 · AI 结论`（中点为 U+00B7，非 U+30FB）；标题行/统计行/分组行/`\n\n---\n\n` 分隔/`> ` 前缀/末尾 `\n` 模板全中；导出前后 `notes.json` 的 sha256 与 mtime 不变；二次导出除生成时间行外逐字节相同。
- **与 HEAD 逐字节对照**：仅含 excerpt 的库导出（屏蔽生成时间行与库名后）与 HEAD 构建逐字节一致；HEAD 的去重语义在新库上一致（只含 excerpt 时命中既有条目）。
- 长度：4000 字 answer 入库且 `loadNotes` 不判 `corrupt`；4001 字 answer → 「回答过长（超过 4000 字），无法存为笔记」、excerpt → 「选中内容过长（超过 4000 字），请分段摘录」，两者均零写入、无 `.tmp`。
- 非法输入：kind 缺失 / `"note"` / 数字、page `0` / `1.5`、空白文本 → `invalid-input` +「笔记数据不合法」，不写盘、无 `.tmp`。
- 原子性与归属：`.tmp` 路径被目录占用 → `write-failed` +「笔记写入失败」且原文件不动、释放后可再写；越界 → `outside`；已删除但仍在库内的文档 → 保存成功（前缀归属，不校验存在性）。
- 损坏与逃生口：截断 JSON → `addNote`/`export`/`load` 三路径均 `corrupt` 且字节不变；`resetCorruptNotes` 备份名匹配 `notes.json.corrupt-\d{8}-\d{6}`、备份内容=原字节、重建为空库；再次调用 → `not-corrupt`；`version:2` → `version-unsupported` 且不写盘；空库导出 → `empty` +「暂无笔记可导出」。

### 六、走查复核（关键契约，只读，均为本终验亲手执行）

- `.addNote(` 恰 2 处（`ChatPanel.vue:491` / `PdfSelectionQuickAsk.vue:153`）；`ipcMain.handle("notes` = 6；`isNoteDraft` 首条 kind 形状校验在 `ipc-handlers.ts:234`。
- `send()` 区间四条 grep 实测 **1/1/1/1**（`readerStore.filePath`=1、`readerStore.page[^C]`=1、`filePath: readFilePath`=1、`page: readPage`=1；函数内 `readerStore.` 共 4 次 = 上述 4 个字段）；锚点与 `buildReadingUserMessage` 实参同源 `readContext`，且锚点登记位于 `excluded.has("document")` 分支之前。
- `readingAnchor` 全仓唯一赋值在 `session-store.ts:268`（`appendOptimisticUserMessage` 内条件展开）；`readingAnchorFor` 跳过非 user-message、遇第一个 user-message 即终止、无锚点返回 `null`；`loadMessages` 区间 0 命中。
- `ChatPanel.vue` DOM/CSS：`.answer-save-wrap`（absolute top:2 / right:80）hover 与 `.has-feedback` → `opacity:1`；`.answer-save-btn` 的 disabled；`.answer-note-feedback` `pointer-events:none` + 三态色；反馈期 `v-if/v-else` 移除按钮；`ANSWER_FEEDBACK_MS = 2500`；`answerSavePending` 同步段先判后置；`onUnmounted` 清计时器。
- `NotesPanel.vue`：`.note-page-badge` → `.note-ai-badge` → `.note-time` 顺序，`v-if="note.kind === 'answer'"`。
- 零改动面（`git diff` 为空）：`preload.ts`、渲染层 `stores/notes-store.ts`、`utils/notes-path.ts`、`utils/reading-context.ts`、`pages/WorkspacePage.vue`、`components/session/**`、`types/session.ts`、`reading-prompt.ts`、`resources/skills/**`、`packages/**`、`pix/package.json`、lockfile、`pix/build/**`；无 `any` / 无内联动态 import（7 个改动文件 0 命中）。

### 七、R7-req 验收逐条判定

| 需求条目 | 判定 | 证据 |
| --- | --- | --- |
| N35 验收 1–8 | 通过 | 走查：addNote 恰 2 处、码表键零增删、字段 diff；本终验烟测：跨 kind 并存、同 kind 去重、两套超长文案、4000/4001、非法 kind/page/空白、越界、序列化与无 `.tmp` |
| N36 验收 1–9、11、12 | 通过 | 走查：动作区与 `.message-copy-btn` 零改动、`text = block.content`、不拼存储路径；离屏：30/30b/31/33/34/36 的 MEASUREMENTS + 截图；未 hover 0 → hover 1（CDP） |
| N36 验收 10 | **未判定** | 非 PDF（`.md`/`.txt`）锚点 page=1 无离屏场景，仅走查 ChatPanel/reader-store 路径 |
| N37 验收 1、2、3、5、7、8 | 通过 | 走查四条 grep 1/1/1/1、唯一赋值/`loadMessages` 0 命中、解析规则与 `null` 返回；离屏 31（确认后仍写第 2 页）；session 文件/内核零改动 |
| N37 验收 4、6 | **未判定** | steer 登记锚点、发送失败删块无离屏场景（走查：锚点在 `isStreaming` 分支前统一登记；失败路径删除乐观块） |
| N38 验收 1–11 | 通过 | 烟测 4000/4001/空白/文案；离屏 31 ok、31b duplicate、31c too-long + blank、31b2 在途 `delta:1`、36 throw；走查 2500ms/指针事件/原子失败 |
| N39 验收 1–8 | 通过 | 离屏 32：徽标数 = 文件 answer 数、excerpt 无徽标、第 2 页子序列、answer 行备注/删除二次确认/跳回三相位、headOverflow 全 true；既有 02/03/04/05/10 场景通过；NotesPanel 外零改动 |
| N40 验收 1–6 | 通过 | 本终验烟测（与 HEAD 逐字节对照、只读、幂等、empty/corrupt/version-unsupported） |
| N41 验收 1–7 | 通过 | `ui-shot.mjs` diff（stub 五口写穿 + 控制口 + 种子 + 场景挂载位置）；55 张 + `failure === null` + 新增 5 组断言；`CHECK_EXIT=0` |
| N42 验收 1–7 | 通过 | `capturePage` 名单 HEAD 45→56（新增恰 11、零删除）+ 运行绿；check；git 卫生；reading-prompt/skills/reading-context 零改动；烟测 corrupt/version/reset；通道 6；`PdfSelectionQuickAsk` 单行 |

**仍未判定条目（均为「无离屏场景的走查项」或「降级分支未触发」，不影响本轮验收结论）**：

1. N36 验收 10（非 PDF 锚点 `page=1`）：无离屏场景，只有代码路径走查。
2. N37 验收 4（steer 登记锚点）与验收 6（发送失败清理乐观块）：无离屏场景，只有走查。
3. `ipc-handlers.isNoteDraft` 的运行时拒绝无 Electron runtime 直测（以编译 + 走查 + store 层同款直判替代，store 层已由本终验烟测覆盖）。
4. hover 降级路径（`sendInputEvent` 兜底 / `forced`）本轮未触发（`hoverDriver` 恒为 `cdp`、`forcedVisible` 恒为 `false`）。
5. 与 R6 运行产物的逐像素对照不可得（R6 产物已被覆盖，且 fixture 按设计新增第 4 条 answer 种子）；以「`capturePage` 名单精确增 11、零删除 + 本次运行绿 + 既有断言代码未改」判定无回归。

### 八、次级观察（不阻塞）

- 31c 的 basename 断言写法是 `includes("older-paper.pdf")`，对全路径（`archive/older-paper.pdf`）同样成立，判别力由 MEASUREMENTS 实测串 `存为笔记 · older-paper.pdf 第 1 页` 提供；如需更硬的断言可加「不含 `archive/`」。
- `%TEMP%/pix-r5/shots/99-failure-state.png` 是旧失败运行的残留文件，脚本成功时不清理陈旧文件；以 MANIFEST 为准即可。

### 九、结论

- 工程门 0 error；git 卫生干净；`ui-shot` 55 张、`failure === null`、新增 11 张与既有 44 张完整；新场景（锚点优先、回退、禁用、三态反馈、在途连点、徽标与排序、失败注入）实测符合设计档与需求档；独立数据面 51/51 通过，且与 HEAD 模板逐字节对照一致。
- 设计评审 8 条 must-fix 与代码审查 0 条 mustFix 均已销账（逐条证据见 §三/§六/§七）；**无未销账 must-fix**。
- **终验结论：passed = true**。遗留未判定项见 §七，均为走查项或未触发的降级分支。
