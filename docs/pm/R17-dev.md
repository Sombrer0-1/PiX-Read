# PiX-Read R17 开发档 · A 面（纯函数与烟测）

> 上游：`docs/pm/R17-design.md`（设计档 + 定稿修订 D1–D6 与三条非阻塞采纳项）、`docs/pm/R17-req.md`（需求 N96–N99 + §0 定稿修订 M1–M9）、`docs/pm/R17-review.md`、`docs/pm/R16-dev.md`（R16 交付终态与基线读数 166 张 / 237 条 / 64 种 label）。
> 本档**只记录 A 面**（数据源与纯函数 + 渲染层烟测）的交付。任务书给定的 A 面白名单 = 4 项：① `pix/src/renderer/utils/shortcut-help.ts`（新建）② `pix/src/renderer/utils/quick-ask-templates.ts`（新建）③ `pix/scripts/smoke-view.mjs`（新增两组断言）④ 本档（新建）。
> **A 面未触碰**：`ShortcutOverview.vue` / `PdfSelectionQuickAsk.vue` / `useQuickAsk.ts` / `ChatPanel.vue` / `ReaderPanel.vue` / `scripts/ui-shot.mjs`（B 面）；`pix/src/main/**`、`pix/src/shared/types.ts`、`pix/package.json`、`package-lock.json`、`packages/**`、`pix/scripts/smoke-notes.mjs`、`pix/src/renderer/assets/styles/**` 全部零 diff。
> 本档只记录**真实文件内容与真实命令输出**；所有命令于 2026-09-17 在 `E:/develop/PiX-Read`（Windows + git bash，`PATH="/c/Program Files/nodejs:$PATH"`）实跑，无一条手工构造。
> 全程未运行 git 写命令、未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`、未跑离屏 `ui-shot.mjs`（B 面验收面）、未增删依赖、未改 `package-lock.json`。
> **结论：`npm run check` exit 0（0 error）；`smoke:view` 连续两次「通过 74 / 失败 0」、退出码 0（既有 7 组 51 条零改写 + 新增 2 组 23 条）；`smoke:notes`「通过 65 / 失败 0」、退出码 0（整文件零 diff）；键位表 18 行逐条与真实代码一致（§A5，零冲突）；白名单外零改动、`%TEMP%` 零残留。**
> **偏差 / 未决项 5 条见 §A8**（全部为登记性，无判红项；其中 D1 为既有陈旧注释登记，本步按设计档改动面限制未动）。

---

## A1. 交付摘要（数字先给）

| 项 | 数值 | 来源 |
| --- | --- | --- |
| `cd pix && npm run check`（A 面落地后） | `CHECK_EXIT=0`（0 error） | §A4.1 |
| `smoke:view` 第一次（落地后） | `通过 74 / 失败 0`、退出码 0 | §A4.2 |
| `smoke:view` 第二次（同命令复跑） | `通过 74 / 失败 0`、退出码 0（两次输出除「临时目录」一行外逐字相同） | §A4.2 |
| `smoke:view` 组构成 | 既有 7 组 **51** 条（`section-hit` 8 / `section-null` 8 / `section-nav` 8 / `section-format` 5 / `badge-counts` 6 / `notes-by-page` 6 / `excerpt-match` 10）+ 新增 2 组 **23** 条（`shortcut-table` 12 + `template-draft` 11）= **9 组 74 条** | §A4.2 / §A6 |
| `smoke:notes` 回归（整文件零改动） | `通过 65 / 失败 0`、退出码 0（10 组） | §A4.3 |
| 编译面追加 | `files` +2（`shortcut-help.ts` / `quick-ask-templates.ts`）、`required` +2（`renderer/utils/shortcut-help.js` / `renderer/utils/quick-ask-templates.js`）；`allowed` 由 `required + "shared/types.js"` 派生自动覆盖、**未改** | §A3.3 |
| 键位表 | 3 组 / 18 行；18 行逐条与真实代码一致（含 `PageUp / ←` 的双 keys 元素） | §A5 |
| `%TEMP%` 残留 | `pix-smoke-view-*` 0 项（脚本 finally 自清理）；一次性提取脚本运行后删除 | §A4.5 |
| 白名单外改动 | 0（`git status --short` 只出现本白名单文件 + 既有未跟踪的 `docs/pm/R17-*.md`） | §A4.5 |

改动文件（`git diff --numstat` / `wc -l` 实测）：

| 文件 | 动作 | 规模 | 对应设计档条目 |
| --- | --- | --- | --- |
| `pix/src/renderer/utils/shortcut-help.ts` | **新建** | 53 行（零 import / 零 DOM） | §1.3 / §4 #1 / §7.1 A1 |
| `pix/src/renderer/utils/quick-ask-templates.ts` | **新建** | 29 行（零 import / 零 DOM） | §1.6 / §4 #2 / §7.1 A2 |
| `pix/scripts/smoke-view.mjs` | 修改 | `+225 / −1`（唯一的 `−` 行 = `required` 数组行按 §2.2 #13 追加 2 项；既有 51 条断言零改写） | §5.1 / §5.2 / §2.2 #12–#16 / §7.1 A3 |
| `docs/pm/R17-dev.md` | **新建** | 本档（A 面部分） | —— |

---

## A2. 基线（动工前后的真实读数）

| 项 | 读数 | 是否本步实跑 |
| --- | --- | --- |
| 工作树与 HEAD | `git log --oneline -1` ⇒ `8850c9c feat(reader): 原文锚点（页面笔记标记、本页摘录高亮与面板定位）（V0.6 R16）`；`git status --short`（改动前）⇒ 只有 `?? docs/pm/R17-{design,req,review}.md`（前三步流程档件，本步未触碰） | **是**（只读命令） |
| 两个新 util 不存在 | `ls pix/src/renderer/utils/` 内无 `shortcut-help.ts` / `quick-ask-templates.ts` | **是** |
| `smoke:view` 既有断言数（HEAD 版） | `git show HEAD:pix/scripts/smoke-view.mjs \| grep -c "  check("` ⇒ **51**；`wc -l` ⇒ 850 | **是** |
| 唯一工程门（动工前） | 设计档 §0.1 / 定稿修订记录「写档当天 `CHECK_EXIT=0`」；本步**未**在改动前复跑（落地后实跑，见 §A4.1） | 否（登记） |
| `smoke:notes`（动工前 / 后） | 设计档冻结「10 组 65 条、零改动」；本步落地后实跑 `通过 65 / 失败 0` | 落地后**是** |

```bash
cd E:/develop/PiX-Read && git status --short && git log --oneline -1
git show HEAD:pix/scripts/smoke-view.mjs | grep -c "  check(" ; wc -l < <(git show HEAD:pix/scripts/smoke-view.mjs)
```

```text
?? docs/pm/R17-design.md
?? docs/pm/R17-req.md
?? docs/pm/R17-review.md
8850c9c feat(reader): 原文锚点（页面笔记标记、本页摘录高亮与面板定位）（V0.6 R16）
51
850
```

---

## A3. 改动清单（文件 + 具体改动 + 与设计档的对应）

### A3.1 `pix/src/renderer/utils/shortcut-help.ts`（新建，53 行，A1）

- 逐字内容 = 设计档 §1.3 的冻结代码块（`ShortcutRow` / `ShortcutSection` 两个接口 + `SHORTCUT_KEY_JOIN = " / "` + `SHORTCUT_SECTIONS`（3 组：`阅读区（打开文档后）` 9 行 / `输入框` 8 行 / `工作区` 1 行）+ `SHORTCUT_NOTE`）。
- **字节级一致核验**（本步实做，一次性脚本写 `%TEMP%` 后删除）：从 `docs/pm/R17-design.md` 的 fenced ts 块提取「数据源文件」逐字内容，与落地文件 `diff -u` ⇒ 无差异（输出 `SHORTCUT-HELP: IDENTICAL`）。
- 不变量实读：`grep -c "^import"` ⇒ **0**；`grep -c "ArrowUp\|ArrowDown"` ⇒ **0**；`grep -c "SettingsPage\|onSaveKeyEnter"` ⇒ **0**（§5.6 #13）；`grep -c "\bany\b"` ⇒ **0**。

### A3.2 `pix/src/renderer/utils/quick-ask-templates.ts`（新建，29 行，A2）

- 逐字内容 = 设计档 §1.6 的冻结代码块（`TemplateAction` / `EXPLAIN_TEMPLATE` / `TRANSLATE_TEMPLATE` / `templateForAction` / `resolveTemplateDraft`，三分支冻结语义）。
- **字节级一致核验**（同法）：`diff -u` ⇒ 无差异（输出 `TEMPLATES: IDENTICAL`）。
- 不变量实读：`grep -c "^import"` ⇒ **0**；`grep -c "trim()"` ⇒ **1**；`grep -c "includes("` ⇒ **1**；`grep -c "\bany\b"` ⇒ **0**；无内联动态 import（`await import` / `import(` 零命中）。

### A3.3 `pix/scripts/smoke-view.mjs`（+225 / −1，A3）

| # | 位置 | 改动（逐字对照设计档） |
| --- | --- | --- |
| 1 | 句柄声明（`:142` 后） | 追加 `let shortcutHelp = null;` 与 `let quickAskTemplates = null;`（§2.2 #12） |
| 2 | `files`（`page-anchor.ts` 之后） | 追加 `shortcut-help.ts` / `quick-ask-templates.ts` 两项（§2.2 #13 / §5.2） |
| 3 | `required`（单行替换） | 4 项 ⇒ 6 项，追加 `"renderer/utils/shortcut-help.js"` / `"renderer/utils/quick-ask-templates.js"`；`allowed` 行**未动**（实读：`git diff -U0 … \| grep -c "allowed"` ⇒ 0，两个新模块零 import ⇒ 不产生额外 emit 产物）（§2.2 #13） |
| 4 | `require` 段（`pageAnchor` 之后） | 追加两个 `require`（§2.2 #14） |
| 5 | `main()` | `runExcerptMatch();` 之后追加 `runShortcutTable();` / `runTemplateDraft();`（调用顺序与 §5.1 冻结一致；末行仍为 `通过 ${passed} / 失败 ${failed}`）（§2.2 #15） |
| 6 | 新增块（`runExcerptMatch` 之后、`compileAndLoad` 注释之前） | 手写期望常量 + `runShortcutTable()`（12 条）+ `runTemplateDraft()`（11 条）（§2.2 #16 / §5.1） |

- 手写期望常量为独立新块：`SHORTCUT_EXPECT_TITLES` / `SHORTCUT_EXPECT_ROWS_READER` / `SHORTCUT_EXPECT_ROWS_INPUT` / `SHORTCUT_EXPECT_ROWS_WORKSPACE` / `SHORTCUT_EXPECT_NOTE`（键位表）与 `QUICK_ASK` / `NOTES_ASK` / `EXPLAIN` / `TRANSLATE` / `KNOWN`（模板），**不由被测数据生成**。
- 既有 51 条断言零改写判据（实跑）：`git diff -U0 -- pix/scripts/smoke-view.mjs | grep -E "^-" | grep -c "check("` ⇒ **0**；`git diff -U0 … | grep -E "^-"` 的唯一一行 = `required` 数组行（§2.2 #13 本身）。

### A3.4 `docs/pm/R17-dev.md`（新建，本档）

---

## A4. 验证（实跑记录）

### A4.1 唯一工程门

```bash
cd E:/develop/PiX-Read/pix && PATH="/c/Program Files/nodejs:$PATH" npm run check ; echo "CHECK_EXIT=$?"
```

```text
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
CHECK_EXIT=0
```

### A4.2 `smoke:view`（9 组 74 条，连续两次）

```bash
cd E:/develop/PiX-Read/pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:view   # 第一次、第二次
```

```text
[通过] shortcut-table #1 … #12（全绿，逐条见 §A6.1）
[通过] template-draft #1 … #11（全绿，逐条见 §A6.2）
通过 74 / 失败 0
NPM_SMOKE_EXIT=0
NPM_SMOKE_EXIT2=0
```

- 组计数实测（对两次输出做 `grep -oE "^\[(通过|失败)\] [a-z0-9-]+ #[0-9]+" | awk | uniq -c`）：`badge-counts` 6 / `excerpt-match` 10 / `notes-by-page` 6 / `section-format` 5 / `section-hit` 8 / `section-nav` 8 / `section-null` 8 / `shortcut-table` 12 / `template-draft` 11 = **74**，`[通过]` 行 74、`[失败]` 行 0。
- 两次运行 `diff`：唯一差异行是 `[smoke-view] 临时目录：…pix-smoke-view-<时间戳>`（该行天然随运行变化），其余逐字相同 ⇒ 「连续两次运行结果相同」成立。

### A4.3 `smoke:notes`（回归，整文件零 diff）

```bash
cd E:/develop/PiX-Read/pix && PATH="/c/Program Files/nodejs:$PATH" node scripts/smoke-notes.mjs | tail -3
```

```text
[通过] reader-state-store #5 F12-d read-failed ⇒ load degraded:true + save 拒写（code=read-failed，回归）
通过 65 / 失败 0
NOTES_EXIT=0
```

`git diff --stat -- pix/scripts/smoke-notes.mjs` ⇒ 空（整文件零 diff）。

### A4.4 走查读数（命令级，真实输出）

| 命令 | 实读输出 |
| --- | --- |
| `grep -c "  check(" pix/scripts/smoke-view.mjs` | **74**（§5.6 #14 目标值达成） |
| `git show HEAD:pix/scripts/smoke-view.mjs \| grep -c "  check("` | **51**（既有断言零改写） |
| `git diff -U0 -- pix/scripts/smoke-view.mjs \| grep -E "^[-]" \| grep -v "^---"` | 仅 `-  const required = [...]`（4 项版本）一行 |
| `git diff --numstat -- pix/scripts/smoke-view.mjs` | `225	1` |
| `wc -l pix/scripts/smoke-view.mjs` | **1074**（850 + 225 − 1） |
| `grep -c "^import" pix/src/renderer/utils/{shortcut-help,quick-ask-templates}.ts` | `0` / `0` |
| `grep -c "trim()"` / `grep -c "includes("` quick-ask-templates.ts | `1` / `1` |
| `grep -c "ArrowUp\|ArrowDown"` shortcut-help.ts | `0` |
| `grep -c "\bany\b"` 两个新文件 | `0` / `0` |
| `git diff --stat -- pix/src/main pix/src/shared/types.ts pix/package.json package-lock.json packages pix/scripts/smoke-notes.mjs` | 空（0 行输出） |

### A4.5 零残留与白名单

```bash
ls -d /c/Users/86157/AppData/Local/Temp/pix-smoke-view-* 2>/dev/null || echo "TEMP: no residue"
cd E:/develop/PiX-Read && git status --short
```

```text
TEMP: no residue
 M pix/scripts/smoke-view.mjs
?? docs/pm/R17-design.md
?? docs/pm/R17-dev.md
?? docs/pm/R17-req.md
?? docs/pm/R17-review.md
?? pix/src/renderer/utils/quick-ask-templates.ts
?? pix/src/renderer/utils/shortcut-help.ts
```

- `M` 仅 1 个（`smoke-view.mjs`）；`??` 白名单内 = 两个新 util + 本档；`docs/pm/R17-{design,req,review}.md` 为前三步既有未跟踪档件（本步未触碰）。
- 一次性提取脚本（`extract19.mjs` + 两份提取产物 + 两份运行输出）写在 `%TEMP%`，运行后已删除（见 §A9）。

---

## A5. 键位表逐条核对（落地时对真实代码再核对，18 行）

设计档 §1.3 已按真实代码核对；本步落地时按任务书要求**逐条再核对**（`grep -n` 实读行号），结论：**18 行无一条与真实代码冲突，无需判停**。第 18 行 `?` 为本轮新增（B 面按设计档 §1.4 落地），其余 17 行均为既有代码实读。

| # | `keys` | `desc` | 真实代码依据（本次 `grep -n` 实读） | 结论 |
| --- | --- | --- | --- | --- |
| 1 | `["/"]` | 打开文档搜索 | `PdfViewer.vue:455` `if (event.key === "/")` ⇒ `preventDefault` + `openSearch()` | 一致 |
| 2 | `["Ctrl+F"]` | 打开文档搜索 | `PdfViewer.vue:415-427`（`:425` `event.key.toLowerCase() === "f"`，修饰键四联守卫） | 一致 |
| 3 | `["PageUp", "←"]` | 上一页 | `PdfViewer.vue:463-464` `case "PageUp": case "ArrowLeft":` | 一致 |
| 4 | `["PageDown", "→"]` | 下一页 | `PdfViewer.vue:469-470` `case "PageDown": case "ArrowRight":` | 一致 |
| 5 | `["Home"]` | 跳到第一页 | `PdfViewer.vue:475` `case "Home":` | 一致 |
| 6 | `["End"]` | 跳到最后一页 | `PdfViewer.vue:479` `case "End":` | 一致 |
| 7 | `["["]` | 上一节 | `PdfViewer.vue:445` + `:448`（`chapterNav.value.prev`） | 一致 |
| 8 | `["]"]` | 下一节 | `PdfViewer.vue:445` + `:448`（`chapterNav.value.next`） | 一致 |
| 9 | `["Esc"]` | 退出框选模式或关闭文档搜索 | `PdfViewer.vue:434`（captureMode ⇒ `exitCaptureMode()`）/ `:439`（searchOpen ⇒ 关闭） | 一致 |
| 10 | `["Enter"]` | 发送消息（对话输入框） | `InputArea.vue:31-33`（`e.key === "Enter" && !e.shiftKey` ⇒ `preventDefault` + `emit("send")`） | 一致 |
| 11 | `["Shift+Enter"]` | 换行（对话输入框） | `InputArea.vue:31` 同条件的否定分支（未拦截 ⇒ 浏览器默认换行） | 一致 |
| 12 | `["Enter"]` | 下一处（文档搜索框） | `PdfSearchPanel.vue:307-310`（`isComposing` 守卫 `:308`；非 shift ⇒ `goToNext()` `:295`）+ 模板 `:407` | 一致 |
| 13 | `["Shift+Enter"]` | 上一处（文档搜索框） | 同上（`:309` `event.shiftKey` ⇒ `goToPrev()` `:301`） | 一致 |
| 14 | `["Enter"]` | 跳转到该页（页码输入框） | `PdfViewer.vue:1209` `@keydown.enter.prevent="commitPageDraft"` | 一致 |
| 15 | `["Esc"]` | 取消页码输入（页码输入框） | `PdfViewer.vue:1210` `@keydown.esc.prevent="cancelPageEdit"` | 一致 |
| 16 | `["Esc"]` | 清空搜索并移出焦点（笔记搜索框） | `NotesPanel.vue:222` `onSearchEsc`（`:225` `stopPropagation()` + 模板 `:631` `@keydown.esc`） | 一致 |
| 17 | `["Enter"]` | 提交重命名（对话名称输入框） | `ChatPanel.vue:1166` `@keydown.enter="onRenameEnter"` + `:708-709`（`isComposing` 守卫） | 一致 |
| 18 | `["?"]` | 打开或关闭本总览 | 本轮新增（设计档 §1.4 分支顺序冻结）；`PdfViewer.vue:455` 按 `event.key === "/"` 判 ⇒ `?`（Shift+`/`）天然分离 | 待 B 面落地后由离屏判据覆盖（登记） |

补充核对（设计档 §1.3 注册纪律 2）：表内不含 `ArrowUp` / `ArrowDown`（`PdfViewer.vue:462-483` 的 switch 无此分支）、无「摘录键位」（`SHORTCUT_NOTE` 为唯一登记位置）、无「缩放键位」（缩放只有按钮与 `Ctrl+滚轮` 手势）。

---

## A6. 新增断言组明细（23 条）

### A6.1 组 `shortcut-table`（12 条，直驱 `shortcutHelp`）

| # | 断言内容 | 期望值来源 |
| --- | --- | --- |
| 1 | `SHORTCUT_SECTIONS.length === 3` | 冻结配额（设计档 §1.3 注册纪律 1） |
| 2 | 三个组标题逐字 `["阅读区（打开文档后）", "输入框", "工作区"]`（顺序敏感） | 手写常量 `SHORTCUT_EXPECT_TITLES` |
| 3 | 总行数 `reduce === 18`（9 + 8 + 1） | 冻结配额 |
| 4 | 第 1 组 9 行 `{ keys, desc }` 逐字深等（含 `PageUp / ←` 双 keys 元素与两行 `打开文档搜索`） | 手写常量 `SHORTCUT_EXPECT_ROWS_READER` |
| 5 | 第 2 组 8 行逐字深等（含第 17 行 `提交重命名（对话名称输入框）`） | 手写常量 `SHORTCUT_EXPECT_ROWS_INPUT` |
| 6 | 第 3 组 1 行逐字深等（`["?"]` / `打开或关闭本总览`） | 手写常量 `SHORTCUT_EXPECT_ROWS_WORKSPACE` |
| 7 | 全表 `keys` 元素均为非空字符串；`keys.join(JOIN) + desc` 组合无重复 | 结构性判据 |
| 8 | `SHORTCUT_KEY_JOIN` 逐字 `" / "` | 冻结字面 |
| 9 | `SHORTCUT_NOTE` 逐字等于冻结串且含「摘录」 | 手写常量 `SHORTCUT_EXPECT_NOTE` |
| 10 | `JSON.stringify(SHORTCUT_SECTIONS)` 不含 `ArrowUp` / `ArrowDown` | 负向判据（设计档 §1.3 注册纪律 2） |
| 11 | 修饰键白名单：`Ctrl+` 恰 1 次（`Ctrl+F`）、不含 `Ctrl+Shift` / `Alt+` / `Meta+` | 负向判据 |
| 12 | 每组 `rows.length > 0` 且 `title` 为非空字符串（防空断言防护） | 结构性判据 |

### A6.2 组 `template-draft`（11 条，直驱 `quickAskTemplates`）

手写常量：`QUICK_ASK = "请解释选中的这段话："`、`NOTES_ASK = "请结合我选中的摘录回答："`、`EXPLAIN = "请解释选中的这段话在论文中的含义与作用："`、`TRANSLATE = "请把选中的这段话翻译成中文："`、`KNOWN = [QUICK_ASK, EXPLAIN, TRANSLATE]`。

| # | 断言内容 | 分支覆盖 |
| --- | --- | --- |
| 1 | `EXPLAIN_TEMPLATE` 逐字 `请解释选中的这段话在论文中的含义与作用：` | 字面冻结 |
| 2 | `TRANSLATE_TEMPLATE` 逐字 `请把选中的这段话翻译成中文：` | 字面冻结 |
| 3 | `templateForAction("explain") === EXPLAIN` 且 `templateForAction("translate") === TRANSLATE` | 两分支 |
| 4 | `resolveTemplateDraft("", EXPLAIN, KNOWN) === EXPLAIN` | 分支 ①（空） |
| 5 | `resolveTemplateDraft("   ", TRANSLATE, KNOWN) === TRANSLATE` | 分支 ①（纯空白） |
| 6 | `resolveTemplateDraft(QUICK_ASK, EXPLAIN, KNOWN) === EXPLAIN` | 分支 ②（既有模板可替换） |
| 7 | `resolveTemplateDraft(EXPLAIN, TRANSLATE, KNOWN) === TRANSLATE` | 分支 ②（模板互替） |
| 8 | `resolveTemplateDraft("我的问题", EXPLAIN, KNOWN) === null` | 分支 ③（自定义一字不改） |
| 9 | `resolveTemplateDraft(NOTES_ASK, EXPLAIN, KNOWN) === null` | 分支 ③（笔记模板不在集合内） |
| 10 | 两模板互不相等、且都不等于 `QUICK_ASK` | 字面区分（期望值手写） |
| 11 | `resolveTemplateDraft(" " + EXPLAIN, TRANSLATE, KNOWN) === null` | 分支 ③（首尾空白差异即不匹配；评审非阻塞项） |

---

## A7. 与设计档分工表的逐项闭合（§7.1 A1–A4）

| 序 | 设计档完成判据 | 本步证据 | 结论 |
| --- | --- | --- | --- |
| A1 | 零 import；3 组 18 行；`ArrowUp` / `ArrowDown` 零命中 | §A3.1 的字节级一致核验 + `grep -c` 实读（0 / 18 行 / 0） | 达成 |
| A2 | 零 import；`resolveTemplateDraft` 三分支与四个边界（空 / 空白 / 模板 / 自定义 / 空白差异）自测通过 | §A3.2 字节级核验 + §A6.2 #4–#9 / #11 全绿 | 达成 |
| A3 | `smoke:view` 末行逐字 `通过 74 / 失败 0`；连续两次结果相同；既有 7 组 51 条零改写；`%TEMP%` 目录被删除 | §A4.2（两次 74/0、差异仅临时目录名行）+ §A4.4（`-` 行仅 `required`）+ §A4.5（无残留） | 达成 |
| A4 | `smoke:notes` 末行逐字 `通过 65 / 失败 0`（零改动） | §A4.3 | 达成 |
| —— | 「A 完成时点」= A1–A4 全绿 + `npm run check` 0 error | §A4.1 `CHECK_EXIT=0` | 达成 |
| —— | 「A 不触碰」B 面 5 文件 + `ui-shot.mjs` | §A4.5 `git status --short` 白名单 + §A2 基线 | 达成 |

---

## A8. 偏差登记与未决项（5 条，全部登记性）

| # | 项 | 说明 | 处置 |
| --- | --- | --- | --- |
| D1 | `smoke-view.mjs` 头部注释陈旧 | 文件头注释仍写「<reading_context> 载荷组装（4 组 29 条）」，自 R16 起即为陈旧文案（R16 已扩到 7 组 51 条）。本轮 A 面按设计档 §2.2 只允许 #12–#16 五处改动（改它会多出白名单外的 `-`/`+` 行）⇒ **未改** | 登记；若需同步注释，须 PM 先改设计档字面后另批处理 |
| D2 | 两次 `smoke:view` 输出非逐字节相同 | 差异仅 `[smoke-view] 临时目录：…pix-smoke-view-<时间戳>` 一行（时间戳天然变化）；74 条判定行与末行逐字相同 | 登记为口径说明，非判红 |
| D3 | 键位表第 18 行 `?` 尚无运行时证据 | 该键位由 B 面在 `ShortcutOverview.vue` 落地，其可判面为离屏 `r17-1`（B 面） | 登记；A 面核对结论 = 其余 17 行零冲突（§A5） |
| D4 | 设计档 §5.6 #16 的 `ui-shot.mjs` 行区间与本档无关 | `sed -n '47,124p' … | grep -cE …` ⇒ 70 属 B 面落地后的目标读数，本步未跑离屏 | 登记（A 面无离屏面） |
| D5 | 本步未在改动前复跑 `check` / `smoke:view` 基线 | 基线取自 R16 交付终态（`git show HEAD` 的 51 条实读 + 设计档冻结读数）；A1–A4 均为「落地后实跑」 | 登记；落地后读数与冻结口径自洽（74 = 51 + 23） |

无任何判红项；无白名单外改动；无「与设计档字面冲突后判停」情形（§A5 逐条核对全绿）。

---

## A9. 纪律与零残留声明

- 未运行任何 git 写命令（只用 `git status` / `git diff` / `git log` / `git show` 只读）。
- 未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未跑离屏 `ui-shot.mjs`（B 面验收面）。
- 未增删依赖、未改 `package-lock.json`、未改 `packages/**`、未改 `pix/package.json`。
- 未删除既有场景 / 断言：既有 51 条逐字保留（`-` 行仅 `required` 一行，属设计档 §2.2 #13）。
- 一次性脚本（`%TEMP%/extract19.mjs` 与两份提取产物、两份运行输出）运行后已删除；`pix-smoke-view-*` 目录 0 项。
- 本档结论只来自真实文件内容与真实命令输出；行号与计数均为本次实读。

---
---

# PiX-Read R17 开发档 · B 面（UI、seam 与离屏）

> 上游：`docs/pm/R17-design.md`（§1 契约冻结表 / §2 与既有冻结面的关系 / §3 失败路径表 / §4 文件级清单 / §5 验证方案 / §7.2 B1–B7 / §8 视觉验收要点，含定稿修订 D1–D6 与三条非阻塞采纳项）、`docs/pm/R17-req.md`（N96–N99 + §0 定稿修订 M1–M9）、`docs/pm/R17-review.md`、本档 A 面（§A1–§A9）、`docs/pm/R16-dev.md`（基线 166 张 / 237 条 / 64 种 label）、`docs/pm/R8-dev.md`（D6：输入框聚焦/写值清空 document 选区的既有行为登记）。
> 本档**只记录 B 面**（UI、seam 与离屏）。任务书给定的 B 面白名单 = 7 项（设计档 §7.2 B1–B7）：① `pix/src/renderer/components/workspace/ShortcutOverview.vue`（新建）② `PdfSelectionQuickAsk.vue`（改）③ `pix/src/renderer/composables/useQuickAsk.ts`（改）④ `ChatPanel.vue`（改）⑤ `ReaderPanel.vue`（改）⑥ `pix/scripts/ui-shot.mjs`（改）⑦ 本档（追加）。
> **B 面未触碰**：设计档 §2.3 零 diff 清单全部路径（`pix/src/main/**`、`pix/src/shared/types.ts`、`PdfViewer.vue`、`PdfSearchPanel.vue`、`NotesPanel.vue`、`KnowledgeMap.vue`、`InputArea.vue`、`pix/src/renderer/pages/**`、`stores/**`、`utils/{reading-context,notes-path,outline-notes,page-anchor}.ts`、`assets/styles/**`、`pix/package.json`、`package-lock.json`、`packages/**`、`pix/scripts/smoke-notes.mjs`）；A 面三个文件（`shortcut-help.ts` / `quick-ask-templates.ts` / `smoke-view.mjs`）本步零改动。
> 证据纪律：本档所有读数来自本次**实跑**（`npm run check`、两条烟测、离屏 `ui-shot.mjs`）与**实读**（`grep -c` / `git diff --numstat` / `git status` / 7 张截图目视）；无一条手工构造。
> **结论：`npm run check` 0 error；`smoke:view` 74 / 0；`smoke:notes` 65 / 0；离屏退出码 0 且 `MANIFEST.json.failure === null`，产出 173 张 / 248 条测量 / 68 种 label；既有 166 张 / 237 条 / 64 种 label 零缺失（前 237 条 label 序列逐条一致）；§5.6 走查 #1–#18 全过；§2.3 零 diff 判据全过；7 张新截图逐张目视登记（§B6）。**
> **偏差 / 未决项 6 条见 §B8**：其中 **D-B1 为需求级 must-fix** —— 设计档 §5.4.3 `r17-2/explain` 的「点击后选区与 chips 不变」两条断言在冻结实现下**不可满足**（根因 = `ChatPanel.onQuickAsk` 的 `composerInput.value?.focus()` 把 document 选区收进输入框，属 `R8-dev` D6 已登记的既有行为，非本轮引入）；本步按「不删断言、不放宽为恒真」的纪律改为等价可判形态并附控制实验（§B4.3 / §B8 D-B1）。**R17b 收口更新：D-B1 已按 `R17-review.md`「追加裁决（R17）」与「代码审查（R17 · N97-4）」改标为「已裁决（N97-4 追加）」—— chips 不变由 N97-4 选区快照修复后重新成立，「点击后选区逐字不变」维持等价形态（见 §B8 D-B1 与本档「追加（N97-4 选区快照）」§7）。**

---

## B1. 交付摘要（数字先给）

| 项 | 数值 | 来源 |
| --- | --- | --- |
| `cd pix && npm run check`（B 面落地后） | `CHECK_EXIT=0`（0 error） | §B4.1 |
| `smoke:view`（回归，A 面 9 组 74 条） | `通过 74 / 失败 0`、退出码 0 | §B4.2 |
| `smoke:notes`（回归，10 组 65 条零 diff） | `通过 65 / 失败 0`、退出码 0 | §B4.2 |
| 离屏退出码 / 失败面 | `UISHOT_EXIT_FINAL=0`；`MANIFEST.json.failure === null`；末行 `[ui-shot] 结束：产出 173 张截图` | §B4.3 |
| 离屏读数（目标 §5.5） | `shots.length` **173** = 166 + 7；`MEASUREMENTS.json` 长度 **248** = 237 + 11；label 去重 **68** = 64 + 4 | §B4.3 |
| 零缺失比对 | 既有 166 张缺失 **0**；既有 64 种 label 缺失 **0**；前 237 条 label 序列逐条一致 **true**；label 条数减少的组 **0**；目录内 png **173** 且与清单双向一致 | §B4.4 |
| 新增场景配额 | 4 场景 / 4 组 label / **11** 条 `record` / **7** 张截图（命名与设计档逐字一致） | §B4.3 / §B5 |
| `SEL` 增量 | 64 → **70**（+6：`shortcutToggle` / `shortcutOverview` / `shortcutRow` / `shortcutKey` / `shortcutNote` / `composerBox`）；既有 64 项零改写零删除 | §B4.5 #16 |
| 新增 helper | **5** 个（冻结名逐字）：`shortcutProbe` / `quickAskActionsProbe` / `layoutVar` / `intersects` / `pressKeyOnReturning`；未新增第 6 个 helper 名 | §B3.6 / §B8 D-B5 |
| 既有断言改写 | **仅 3 处**：`btnCount === 2` ⇒ `=== 4`（`:5525` / `:6994` / `:7066`）；`grep -c "btnCount === 2"` = **0**、`grep -c "btnCount === 4"` = **3** | §B4.5 #15 |
| 走查（§5.6 #1–#18） | 全过（含逐字行、计数、零 diff、`git status` 白名单） | §B4.5 / §B4.6 |
| 视觉验收（§8.2 逐张） | 7 张逐张目视登记；§8.1 三项必查全部成立 | §B6 |

改动文件（`git diff --numstat` / `wc -l` 实测）：

| 文件 | 动作 | 规模 | 对应设计档条目 |
| --- | --- | --- | --- |
| `pix/src/renderer/components/workspace/ShortcutOverview.vue` | **新建** | 237 行（无 props / 无 emits；`window` 监听注册 1 / 注销 1） | §1.1 / §1.2 / §1.4 / §4 #3 / §7.2 B1 |
| `pix/src/renderer/components/workspace/ReaderPanel.vue` | 修改 | `+2 / −0`（一行 import + 一行 `<ShortcutOverview />`） | §2.2 #11 / §4 #7 / §7.2 B2 |
| `pix/src/renderer/composables/useQuickAsk.ts` | 修改 | `+5 / −3`（新增 `QuickAskAction`；`QuickAskHandler` 加第二参数；`emitQuickAsk` 加参数与默认值） | §1.6 / §2.2 #7 / §4 #5 / §7.2 B3 |
| `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 修改 | `+15 / −0`（一行 `import type`；`onTemplateClick` 三行形状；两个新按钮） | §1.5 / §2.2 #4–#6 / §4 #4 / §7.2 B3 |
| `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改 | `+10 / −1`（两行 import；单行 `QUICK_TEMPLATE_REPLACEABLE`；`onQuickAsk` 新函数体；唯一的 `−` 行 = 函数签名行 `function onQuickAsk(): void {`） | §1.6 / §2.2 #8–#10 / §4 #6 / §7.2 B4 |
| `pix/scripts/ui-shot.mjs` | 修改 | `+966 / −3`（`SEL` +6；R17 块 5 helper + 9 常量 + 4 场景；三处 `btnCount` 行替换 = 仅有的 3 个 `−` 行） | §5.4 / §2.2 #17–#21 / §4 #9 / §7.2 B5 |
| `docs/pm/R17-dev.md` | 追加 | 本档 B 面（A 面部分零改写） | —— |

---

## B2. 基线（动工前后的真实读数）

| 项 | 读数 | 是否本步实跑 |
| --- | --- | --- |
| 工作树与 HEAD | `git log --oneline -1` ⇒ `8850c9c feat(reader): 原文锚点（页面笔记标记、本页摘录高亮与面板定位）（V0.6 R16）`；`git status --short`（B 动工前）⇒ `M pix/scripts/smoke-view.mjs` + `?? docs/pm/R17-{design,dev,req,review}.md` + `??` 两个新 util（A 面终态） | **是**（只读命令） |
| A 面终态门 | `cd pix && npm run check` ⇒ `CHECK_EXIT=0`；`smoke:view` ⇒ `通过 74 / 失败 0`；`smoke:notes` ⇒ `通过 65 / 失败 0`（B 动工前复跑，确认 A 面绿） | **是** |
| 离屏零缺失基线 | `C:/Users/86157/AppData/Local/Temp/pix-v06-r16-review/shots`：`MANIFEST.json.shots.length = 166`、`failure = null`；`MEASUREMENTS.json` 长度 237、label 去重 64；目录内 png 166 | **是**（本次读取比对，见 §B4.4） |
| 验收目录 | `PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v06-r17-after`（独立目录，未覆盖基线目录） | **是** |
| 三处 `btnCount` 行位置（改动前） | `grep -n "btnCount" pix/scripts/ui-shot.mjs` ⇒ `:5518` / `:6987` / `:7059` 三处 `=== 2`（与设计档 §0.1 逐条一致） | **是** |

```bash
cd E:/develop/PiX-Read && git log --oneline -1 && git status --short
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check ; echo "CHECK_EXIT=$?"
node scripts/smoke-notes.mjs | tail -1 ; node scripts/smoke-view.mjs | tail -1
grep -n "btnCount === 2" scripts/ui-shot.mjs
```

```text
8850c9c feat(reader): 原文锚点（页面笔记标记、本页摘录高亮与面板定位）（V0.6 R16）
CHECK_EXIT=0
通过 65 / 失败 0
通过 74 / 失败 0
5518:        state.btnCount === 2 &&
6987:      ...(goneP4.probe.feedbackClass === null && goneP4.probe.btnCount === 2 && ...
7059:      ...(afterDifferentTextP5b.display !== "none" && afterDifferentTextP5b.btnCount === 2
```

---

## B3. 改动清单（文件 + 具体改动 + 与设计档的对应）

### B3.1 `ShortcutOverview.vue`（新建，237 行，B1）

- `<script setup lang="ts">`：与设计档 §1.4 参考实现**逐字一致**（`open` / `pillReady` / `panelEl` / `toggleEl` / `lastFocused` / 本地 `isEditableTarget` / `close()` / `toggle()` / `onDocumentPointerdown()` / `onWindowKeydown()` / `watch(open)` / 两个生命周期）。**唯一改字**：Esc 分支的注释把「不 `stopPropagation`」改写为「不阻断冒泡」（原因见 §B8 D-B2，代码零变化）。
- 模板：`Teleport v-if="pillReady" to=".center-pill"` 内 `.shortcut-toggle`（`title` / `aria-label` / `:aria-expanded` / `@click="toggle"` / `mdi-keyboard-outline`）；浮层 `v-if="open"` → `.shortcut-header`（`.shortcut-title` + `.shortcut-close`）→ 3 × `.shortcut-section`（`.shortcut-section-title` + 18 × `.shortcut-row`：`<kbd class="shortcut-key">` + `.shortcut-desc`）→ `.shortcut-note`。
- `<style scoped>`：§1.1 / §1.2 的逐字样式表（入口 20×20、浮层 `top: 40px; left: 8px; z-index: 7; width: 320px; max-height: calc(100% - 104px); overflow-y: auto`）；**未新增任何 `--pix-*` 变量**。
- 走查实读：`shortcut-toggle` 4 处 / `快捷键总览（?）` 1 处 / `keys.join(SHORTCUT_KEY_JOIN)|SHORTCUT_SECTIONS` 3 处 / 组件内手写键位文案（`上一页|下一节|发送消息`）**0** / `position: fixed` **0** / `overflow: hidden` **0** / `stopPropagation` **0** / 捕获阶段 `keydown` **0** / `localStorage|sessionStorage` **0** / `first|seen|dismiss` **0** / `pageCount|readerStore` **0** / `tabindex="-1"` **1** / `.focus()` **3** / `focusin|focusout|trap` **0** / `window` 监听注册 1 / 注销 1。

### B3.2 `ReaderPanel.vue`（改，B2）

- `import ShortcutOverview from "./ShortcutOverview.vue";`（紧跟 `PdfSelectionQuickAsk` 的 import 之后）与模板 `<PdfSelectionQuickAsk />` 之后的一行 `<ShortcutOverview />`；`grep -c "ShortcutOverview"` = **2**。既有 Teleport / `.map-toggle` / `.reader-stage` / `.knowledge-map-slot` / 样式零改动（`git diff` 仅这 2 行）。

### B3.3 `useQuickAsk.ts` + `PdfSelectionQuickAsk.vue`（改，B3）

- seam：新增 `export type QuickAskAction = "ask" | "explain" | "translate";`；`QuickAskHandler = (text: string, action: QuickAskAction) => void`；`emitQuickAsk(text: string, action: QuickAskAction = "ask")`；`registerQuickAskConsumer` 与笔记 seam 零改动。
- `PdfSelectionQuickAsk.vue`：新增 `import type { TemplateAction } from "../../utils/quick-ask-templates";`；`onTemplateClick(action)` 三行逐字形状（`const text = cachedText;` → `hide();` → `if (text) emitQuickAsk(text, action);`）；模板在「问 AI」与「摘录」之间插入「解释」（`mdi-lightbulb-on-outline`）与「翻译」（`mdi-translate`）两个 `.quick-ask-btn`（同级同缩进）。
- `git diff -U0` 实读：该文件**无任何 `-` 行**；`问 AI|摘录|mdi-notebook-plus-outline|mdi-comment-question-outline` 不作为 `-` 行出现；`.quick-ask|.quick-ask-btn|.quick-ask-feedback` 无 `+/-` 行（既有 CSS 零改写）。

### B3.4 `ChatPanel.vue`（改，B4）

- 两行 import：`import type { QuickAskAction } from "../../composables/useQuickAsk";` 与 `import { EXPLAIN_TEMPLATE, TRANSLATE_TEMPLATE, resolveTemplateDraft, templateForAction } from "../../utils/quick-ask-templates";`（`templateForAction` 为设计档 §2.2 #8 清单漏列、但 §1.6 冻结函数体必需，见 §B8 D-B3）。
- 单行常量：`const QUICK_TEMPLATE_REPLACEABLE: readonly string[] = [QUICK_ASK_TEMPLATE, EXPLAIN_TEMPLATE, TRANSLATE_TEMPLATE];`（`grep -c -F` 逐字命中 **1**；`grep -c` 标识符 **2**；该行不含 `NOTES_ASK_TEMPLATE`）。
- `onQuickAsk(text: string, action: QuickAskAction = "ask")`：非 `ask` 分支提前 `return`；既有两行（`if (!draft.value) draft.value = QUICK_ASK_TEMPLATE;` 与 `composerInput.value?.focus();`）字节与缩进零变化。
- `git diff -U0`：唯一的 `-` 行 = 函数签名行；`QUICK_ASK_TEMPLATE|NOTES_ASK_TEMPLATE` 不作为 `-` 行出现。

### B3.5 `ui-shot.mjs` 的 `SEL` 与三处按钮数断言（B5 前半）

- `SEL` 末尾追加注释 + 6 项（§5.4.1 逐字）；既有 64 项零改写零删除；`sed -n '47,124p' … | grep -cE` = **70**。
- 三处 `btnCount === 2` ⇒ `=== 4`（`:5525` / `:6994` / `:7066`，其余条件逐字不变）；反馈期 `btnCount === 0` 的既有两处（`:6982` / `:6985`）零改动。

### B3.6 `ui-shot.mjs` 的 R17 块（B5 后半，954 行：`:10244`–`:11197`）

- 追加位置：`runReaderStateScenarios` 内、`r16-5` 收尾的 `await restoreStandardSeed();` **之后**、函数收口 `}` **之前**（与设计档 §5.4 冻结位置一致）。
- 手写期望常量 9 项 + 1 个焦点表达式常量（`ACTIVE_PROBE`，仅作字符串表达式、不占 helper 配额）：`SHORTCUT_SECTION_TITLES`(3) / `SHORTCUT_ROWS`(18) / `SHORTCUT_NOTE_TEXT` / `EXPLAIN_TEMPLATE` / `TRANSLATE_TEMPLATE` / `NOTES_ASK_TEMPLATE` / `QUICK_ASK_ACTIONS`(4) / `QUICK_ASK_ICONS`(4) / `RIGHT_WIDTH`；全部为逐字期望值，**不由被测数据生成**。
- 5 个新 helper（冻结名逐字）：`shortcutProbe()`（入口 5 项 + 浮层 9 项，含 `focusableCount` 的「容器自身也计入」写法）、`quickAskActionsProbe()`（`display` / `rect` / `buttons[{text, icon, rect, disabled}]` / `scrollOverflow` / `btnCount`）、`layoutVar(name, value|null)`（`setProperty` / `removeProperty` + `repaint(win)` + 回传内联值）、`intersects(a, b)`（`null` 一律 false）、`pressKeyOnReturning(selector, key)`（回传 `dispatchEvent` 布尔）。既有 `pressKeyOn` / `rectOfSelector` / `selectPageSpan` / `ensureQuickAskExcerptReady` / `quickAskStateProbe` / `selectionProbe` / `chipSnapshot` / `composerSnapshot` / `sendCalls` / `notesAddCalls` / `saveCalls` / `userBlocks` / `clickEl` / `pressReaderKey` 零改写。
- 4 场景：`r17-1`（组 `r17-shortcut-overview`，3 record / 2 截图）、`r17-1b`（组 `r17-shortcut-geometry`，2 record / 1 截图）、`r17-2`（组 `r17-template-actions`，3 record / 3 截图）、`r17-2b`（组 `r17-template-geometry`，3 record / 1 截图）；每场景以 `restoreStandardSeed()` / `layoutVar(..., null)` / 缩放回 100% 自负复位。
- 增量护栏（登记，见 §B8 D-B6）：选区类相位在 `selectPageSpan()` 之后调用既有 `ensureQuickAskExcerptReady(page)` 复核就绪（失败即判红，不降级跳过）。

---

## B4. 验证（实跑记录）

### B4.1 唯一工程门

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check ; echo "CHECK_EXIT=$?"
```

```text
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
CHECK_EXIT=0
```

### B4.2 烟测两条（回归）

```bash
node pix/scripts/smoke-notes.mjs  # 通过 65 / 失败 0（NOTES_EXIT=0）
node pix/scripts/smoke-view.mjs   # 通过 74 / 失败 0（VIEW_EXIT=0）
```

### B4.3 离屏（验收轮，独立目录）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v06-r17-after" ./node_modules/.bin/electron scripts/ui-shot.mjs
```

```text
[ui-shot] 结束：产出 173 张截图
UISHOT_EXIT_FINAL=0
```

`MANIFEST.json` ⇒ `shots.length = 173`、`failure = null`；`MEASUREMENTS.json` ⇒ 长度 **248**、label 去重 **68**；新增 4 种 label = `r17-shortcut-overview` / `r17-shortcut-geometry` / `r17-template-actions` / `r17-template-geometry`；目录内 png **173** 且与清单双向一致（结束自检复算通过）。

11 条 `record` 全绿（逐条：关键读数见 §B5）：

| 组 | 相位 | 判定 |
| --- | --- | --- |
| `r17-shortcut-overview` | `open-by-click` | 绿（首帧计数、title/aria-label、18 行逐字、focusableCount=2、点击开关） |
| `r17-shortcut-overview` | `key-toggle-and-typing-guard` | 绿（TEXTAREA/INPUT 双守卫 `dispatchEvent === true`、body `?` 开关、`/` 未被劫持、Esc 双响应） |
| `r17-shortcut-overview` | `close-paths-and-focus-return` | 绿（三条关闭路径 + 两种焦点归还 + 零写入 + 零侵扰） |
| `r17-shortcut-geometry` | `default` | 绿（⊆ `.reader-panel` + 六处零相交 + 320 宽 + 入口 20×20） |
| `r17-shortcut-geometry` | `narrow` | 绿（560 ⇒ 复位 380；同一组判据） |
| `r17-template-actions` | `explain` | 绿（4 动作逐字 + 草稿逐字 + 不发送 + M1 口径 + 控制实验） |
| `r17-template-actions` | `translate-replace` | 绿（替换 / 空草稿填入均逐字 + 聚焦 + 零发送） |
| `r17-template-actions` | `custom-draft-kept` | 绿（自定义与笔记模板逐字保留 + 聚焦 + 零发送） |
| `r17-template-geometry` | `four-buttons-default` | 绿（⊆ stage + 4 按钮单行递增不相交 + overflow 0 + 零相交） |
| `r17-template-geometry` | `four-buttons-narrow` | 绿（同上一组 + 变量复位） |
| `r17-template-geometry` | `four-buttons-zoom-clamp` | 绿（200% + 右缘钳制 `clampGap = 0` + 复位 100% / 380） |

### B4.4 零缺失比对（既有 166 张 / 237 条 / 64 种 label）

一次性比对脚本（`%TEMP%`，运行后删除）对基线目录 `pix-v06-r16-review/shots` 与验收目录逐项比对，真实输出：

```text
基线 shots: 166 | 新 shots: 173
基线 failure: null | 新 failure: null
既有 166 张缺失数: 0 []
基线 measurements: 237 | 新: 248
基线 label 种类: 64 | 新: 68
既有 label 缺失: 0 []
前 237 条 label 序列逐条一致: true
label 条数减少的组: []
目录内 png: 173
清单存在但磁盘缺失: [] / 磁盘存在但清单缺失: []
新增 7 张截图齐备: true
新增 label: ["r17-shortcut-overview","r17-shortcut-geometry","r17-template-actions","r17-template-geometry"]
```

补充：同一命令序列连跑两次（第二次为最终字节版本），11 条 `r17` 测量数据**逐字相同**（脚本确定性）。

### B4.5 走查读数（§5.6 逐条，真实输出）

| # | 命令（`SC` = `ShortcutOverview.vue`） | 期望 | 实测 |
| --- | --- | --- | --- |
| 1 | `grep -c shortcut-toggle` / `grep -c 快捷键总览（?）` / `grep -c ShortcutOverview ReaderPanel.vue` | ≥1 / ≥1 / ≥2 | **4 / 1 / 2** |
| 2 | `keys.join(SHORTCUT_KEY_JOIN)|SHORTCUT_SECTIONS` / `上一页|下一节|发送消息` | ≥2 / 0 | **3 / 0** |
| 3 | `mdi-lightbulb-on-outline|mdi-translate`（`PdfSelectionQuickAsk.vue`） | 2 | **2** |
| 4 | `position: fixed` / `overflow: hidden` | 0 / 0 | **0 / 0** |
| 5 | `grep -n -A4 'event.key !== "?"'` / `isComposing` / `stopPropagation` / 捕获 `keydown` | `isEditableTarget` 的 return 在 `preventDefault()` 之前 / 1 / 0 / 0 | **命中顺序 :61→:62→:63→:64→:65（return 在 preventDefault 之前）/ 1 / 0 / 0** |
| 6 | `grep -n -A3 'function onTemplateClick'` | 三行逐字同序 | **:155 签名 → `const text = cachedText;` → `hide();` → `if (text) emitQuickAsk(text, action);`** |
| 7 | `grep -c -F 'const QUICK_TEMPLATE_REPLACEABLE…'` / `grep -c QUICK_TEMPLATE_REPLACEABLE` | 1 / 2 | **1 / 2** |
| 8 | 两条 `git diff -U0 … \| grep -E "^-" \| grep -E …` | 均空 | **均空**（外加 `.quick-ask*` 规则无 `+/-` 行） |
| 9 | `window.addEventListener("keydown"` / `window.removeEventListener("keydown"` | 各 1 | **各 1（`:76` / `:80`）** |
| 10 | `localstorage|sessionstorage` / `stores+main+shared` 内 `shortcut` / `first|seen|dismiss` | 0 / 0 / 0 | **0 / 0 / 0** |
| 11 | `tabindex="-1"` / `.focus()` / `focusin|focusout|trap` | 1 / ≥2 / 0 | **1 / 3 / 0** |
| 12 | `pageCount|readerStore` | 0 | **0** |
| 13 | `ArrowUp|ArrowDown` / `SettingsPage|onSaveKeyEnter`（`shortcut-help.ts`） | 0 / 0 | **0 / 0** |
| 14 | `grep -c "  check(" smoke-view.mjs` | 74 | **74** |
| 15 | `btnCount === 2` / `btnCount === 4` | 0 / 3 | **0 / 3**（`:5525` / `:6994` / `:7066`） |
| 16 | `pixelmatch` / `sed -n '47,124p' \| grep -cE` | 0 / 70 | **0 / 70** |
| 17 | §2.3 零 diff 集合（`main` / `shared/types.ts` / `package.json` / `package-lock.json` / `packages` / `smoke-notes.mjs` / `PdfViewer.vue`） | 全空 | **全空（`git diff --stat` 输出 0 行）** |
| 18 | `git status --short` | 只白名单 | **6 `M` + 7 `??`，全部在白名单内（§B4.6）** |

### B4.6 白名单与零残留

```text
 M pix/scripts/smoke-view.mjs                      （A 面）
 M pix/scripts/ui-shot.mjs                         （B5）
 M pix/src/renderer/components/workspace/ChatPanel.vue          （B4）
 M pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue （B3）
 M pix/src/renderer/components/workspace/ReaderPanel.vue        （B2）
 M pix/src/renderer/composables/useQuickAsk.ts                  （B3）
?? docs/pm/R17-design.md  ?? docs/pm/R17-dev.md  ?? docs/pm/R17-req.md  ?? docs/pm/R17-review.md
?? pix/src/renderer/components/workspace/ShortcutOverview.vue   （B1）
?? pix/src/renderer/utils/quick-ask-templates.ts                （A 面）
?? pix/src/renderer/utils/shortcut-help.ts                      （A 面）
```

无临时脚本 / 无调试日志 / 无构建产物进仓；一次性探针与比对脚本写在 `%TEMP%` 并已删除；验收轮独立目录（未覆盖基线目录）。

---

## B5. 运行时读数（4 场景 / 11 条 record 关键值）

| 场景（组） | 相位 | 关键读数（`MEASUREMENTS.json` 原值） |
| --- | --- | --- |
| `r17-1`（`r17-shortcut-overview`） | `open-by-click` | 浮层 `rect {x:295, y:79, w:320, h:503}`、`rows.length = 18`、`sectionTitles` 三项逐字、`noteText` 逐字、`closeCount = 1`、`focusableCount = 2`、`activeInsidePanel = true`、`scrollOverflow = 0`；首帧 `.shortcut-overview|.shortcut-row|.shortcut-key|.shortcut-note` 计数 **0**、`.shortcut-toggle` 计数 **1**、`aria-expanded = "false"`；未开文档与开文档后 `title = 快捷键总览（?）` / `aria-label = 快捷键总览` |
| `r17-1` | `key-toggle-and-typing-guard` | `textareaGuard {returns:true, inDom:false, value:"草稿守卫"}`；`blurSelfCheck = true`；`bodyGuard {opened:true, searchPanel:false}`；`closed = false`；`searchOpen = true`；`inputGuard {returns:true, stillOpen:true}`；`afterEsc {searchPanel:false, overview:0, ariaExpanded:"false"}` |
| `r17-1` | `close-paths-and-focus-return` | `esc / outside / closeBtn` 三条均 `gone:true, rows:0, expanded:"false"`；`openedActive.isPanel = true`；`focusReturn.byEntry.isToggle = true`、`focusReturn.byBody.isBody = true`；`selfChecks {entryFocus:true, bodyFocus:true}`；`writes {send:0, notesAdd:0, stateSave:0}`；`quiet` 前后 `scrollTop 48 / 页 1 rect 逐字不变` |
| `r17-1b`（`r17-shortcut-geometry`） | `default` | `mapSlotInDom = false`；8 个 rect（panel / entry / readerPanel / toolbar / indicator / section / fab / pill / composer）**全非 null**；`insideReaderPanel = true`；`intersect {composer:false, toolbar:false, indicator:false, section:false, fab:false, pill:false}`；panel `w = 320`；entry `{x:418, y:51, w:20, h:20}`；`quiet` 不变 |
| `r17-1b` | `narrow` | `rightWidth = 560`（`rightVar = "560px"`）、`restoredRightWidth = 380`、`restoredVar = ""`；`mapSlotInDom = false`；`insideReaderPanel = true`；六处零相交；panel `w = 320`；`quiet` 不变 |
| `r17-2`（`r17-template-actions`） | `explain` | `ready = true`；4 按钮 `["问 AI","解释","翻译","摘录"]` + 图标逐字 + `btnCount = 4` + `display = "flex"` + `disabled = false` 全员 + `tagName = "BUTTON"` + `tabIndex ≥ 0`；「解释」`focus()` 后 `activeIsExplain = true`；`draft = "请解释选中的这段话在论文中的含义与作用："`、`focused = true`；`quickAskAfterExplain {display:"none", btnCount:3}`（M1）；`quiet {send:0, blocks:0→0, notes:4 行且 hash 不变}`；控制实验 = §B8 D-B1 |
| `r17-2` | `translate-replace` | `ready {replace:true, empty:true}`；`afterReplace = afterEmpty = "请把选中的这段话翻译成中文："`；`focused = true`；`send = 0` |
| `r17-2` | `custom-draft-kept` | `ready {custom:true, notes:true}`；`customKept = "我的问题：请给出结论"`；`notesTemplateKept = "请结合我选中的摘录回答："`；`focused = true`；`send = 0` |
| `r17-2b`（`r17-template-geometry`） | `four-buttons-default` | `stage {x:287, y:39, w:912, h:950}`、`float {x:642, y:90, w:244, h:24}`、`inset=true`、`scrollOverflow = 0`、4 按钮 `x` 递增且同一行（`y` 差 0）、两两不相交、文案逐字；`intersect {composer:false, section:false, indicator:false}` |
| `r17-2b` | `four-buttons-narrow` | `stage {x:287, y:39, w:732, h:950}`、`float {x:552, y:90, w:244, h:24}`、`inset=true`、`scrollOverflow = 0`、4 按钮同一行（`y` 差 0）、文案逐字；`restoredRightWidth = 380`、`restoredVar = ""` |
| `r17-2b` | `four-buttons-zoom-clamp` | `zoom = "200%"`；`stageRight = 1019`、`floatRight = 1015`、**`clampGap = 0`**（`float.right = stage.right − 4` 逐字成立）；`inset = true`、`scrollOverflow = 0`、4 按钮同一行；`restored {zoom:"100%", rightWidth:380}` |

---

## B6. 目视结论（§8.2 七张逐张登记）

| # | 截图 | 目视结论（本次实读图像） |
| --- | --- | --- |
| 1 | `r17-1-shortcut-overview.png`（整窗） | 浮层落在阅读栏左上（pill 正下方、留可见缝隙）：标题「快捷键总览」+ 右上「×」；3 个组标题（阅读区（打开文档后）/ 输入框 / 工作区）与 18 行「键位胶囊 + 说明」；末行说明含「摘录」；白底圆角、无遮罩、无动画残留；**不遮挡** 右上工具条（100% / 缩放）、右下「本页 1 条」页标记、「1. Abstract · 第 1 页」章节 chip、「第 1 / 3 页」页码指示器、左下框选 FAB、右侧对话栏与 composer；pill 内可见文档名 + 键盘图标（展开态底色）+ 地图图标 |
| 2 | `r17-1b-shortcut-overview-entry.png`（`.center-pill` 裁切 + 12px） | 键盘图标按钮 20px 圆、与相邻 `.map-toggle` 同风格（同尺寸/同色系）；展开态带 `--pix-bg-active` 底色；`sample-paper.pdf` 文档名完整可辨（未出省略号）；位次在 pill 右侧（挂载顺序：键盘图标在左、地图图标在右，属设计档 §9 开放问题 6 的登记项，不写断言） |
| 3 | `r17-1c-shortcut-overview-narrow.png`（620px 高窄栏下的浮层裁切） | 窄栏（右栏 560px）下浮层仍完整：320px 宽、18 行未换行错位、键位列与说明列对齐、左上标题与右上「×」均未被挤出可视区；浮层仍在阅读栏内（未越到右栏） |
| 4 | `r17-2-quick-ask-four-actions.png`（`.quick-ask` 裁切 + 30px） | 4 个动作**单行**从左到右 `问 AI` / `解释` / `翻译` / `摘录`，图标与文案对齐（`mdi-comment-question-outline` / `mdi-lightbulb-on-outline` / `mdi-translate` / `mdi-notebook-plus-outline`）、间距均匀、胶囊完整未裁切、无禁用灰态；下方选区高亮带可见（与 R16 基线 `06c-excerpt-entry-zoom.png` 同款灰带）。**登记**：「解释」按钮带焦点圈 —— 由设计档定稿 D3 的步骤顺序（步骤 ② 先 `focus()` 再做步骤 ③ 截图）直接决定 |
| 5 | `r17-2b-template-explain-draft.png`（`.composer-box` 裁切） | composer 草稿逐字「请解释选中的这段话在论文中的含义与作用：」（两行折行）；输入框聚焦（圆角边框高亮 + 光标可见）；发送按钮为「非空草稿」态、**无新消息块**（未发送）；`.quick-ask` 已隐藏（不在裁切内） |
| 6 | `r17-2c-template-translate-draft.png`（`.composer-box` 裁切） | 草稿逐字「请把选中的这段话翻译成中文：」且为**替换**（不是追加）；光标在行尾、输入框聚焦。**登记**：本张裁切取 `.composer-box`（设计档未固定该张 rect）⇒ 裁切框内**不含 chip 行**（`.context-row` 是 `.composer-box` 的前一个兄弟）；N97-4 追加后点击模板动作**不再**让「选中文本」chip 掉落（根因已修，见本档「追加（N97-4 选区快照）」§3），本张看不到 chip 属**裁切范围**所致而非 chip 消失 —— chip 存活性以数据面（`r17-template-actions / explain` 的 `quiet.chips.before === after` 逐字相等）与 `r17-3` 的 `snapshot-survives-typing` 逐字断言 / 截图为准（R17b 收口更正） |
| 7 | `r17-2d-quick-ask-four-buttons-zoom.png`（`.pdf-viewer` 裁切） | 200% + 窄栏：4 按钮仍单行、浮层右缘贴住阅读区右缘内缩 4px（`floatRight 1015 = stageRight 1019 − 4`，钳制生效）、无横向滚动条、按钮互不重叠；选区高亮（页 1 标题与摘要行）清晰可见；不遮挡底部页码指示器与章节 chip |

§8.1 三项必查结论：① **4 按钮单行且不裁切** —— 成立（#4 / #7 + §B5 三相位几何判据）；② **浮层不遮挡** —— 成立（#1 / #3 + `r17-1b` 两相位六处零相交；地图列按上游 M3 处置② 为限定口径外）；③ **窄栏与缩放仍成立** —— 成立（#3 / #7 + `rightWidth 560→380`、`clampGap 0`、`zoom 200%→100%`）。

---

## B7. 与设计档分工表的逐项闭合（§7.2 B1–B7）

| 序 | 设计档完成判据 | 本步证据 | 结论 |
| --- | --- | --- | --- |
| B1 | 走查 #1/#2/#4/#5/#9/#10/#11/#12；`npm run check` 0 error | §B4.5 对应行 + §B4.1 | 达成（唯一改字 = §B8 D-B2） |
| B2 | `grep -c "ShortcutOverview"` ≥ 2；既有 Teleport / `.map-toggle` 零 diff | §B4.5 #1 = 2；`git diff` 仅 2 行 | 达成 |
| B3 | 走查 #3/#6/#8；`npm run check` 0 error | §B4.5 #3=2、#6 三行逐字、#8 两条均空；§B4.1 | 达成 |
| B4 | 走查 #7/#8；既有两行与 `onNotesAsk` / `send()` 零 diff | §B4.5 #7 = 1/2、#8 空；`-` 行仅函数签名行 | 达成 |
| B5 | 走查 #15/#16；既有 166 张 / 237 条 / 64 种 label 零缺失 | §B4.5 #15 = 0/3、#16 = 0/70；§B4.4 全绿 | 达成 |
| B6 | 退出码 0、`failure === null`、§5.5 读数目标（173 / 248 / 68）、新增 7 张齐备 | §B4.3 + §B4.4 | 达成 |
| B7 | 7 张新截图逐张登记结论 | §B6 | 达成 |
| 合并门 | `npm run check` 0 error + 两条烟测全绿 + 离屏退出码 0 + 零缺失 + 7 张齐备 + §2.3 零 diff + `git status` 白名单 | §B4.1 / §B4.2 / §B4.3 / §B4.4 / §B4.5 #17–#18 | 达成 |

---

## B8. 偏差登记与未决项（6 条）

| # | 项 | 说明 | 处置 |
| --- | --- | --- | --- |
| **D-B1**（已裁决（N97-4 追加）） | **`r17-2/explain` 的两条冻结断言**：chips 不变已由 N97-4 选区快照修复后重新成立；「点击后选区逐字不变」维持等价形态 | 设计档 §5.4.3 断言 ③ 要求「点击模板动作后 `getSelection().toString()` 与点击前逐字相等 + `collapsed === false`」且「`chipSnapshot()` 三字段不变」（需求档 N97-3 判据 1 / §1.7 / §8.2 #6 同口径）。**首次验收轮真实判红**：`before {text:"Sparse Attention for Long-Context Retrieval", collapsed:false}` → `after {text:"", collapsed:true, anchorInStage:false}`，chips 2 → 1（「选中文本」项掉落）。根因链：`onTemplateClick` → `emitQuickAsk` → `ChatPanel.onQuickAsk` 的 `composerInput.value?.focus()`（**冻结行**）⇒ Blink 把 document 选区收进输入框（同引擎一次性探针：`focus textarea` ⇒ collapsed；写值但未聚焦 ⇒ 选区完好；隐藏被聚焦按钮 ⇒ 选区完好；被聚焦按钮 ⇒ 选区完好）⇒ `PdfViewer.onSelectionChange` 清 `readerStore.selectedText` ⇒ chip 掉落。该行为**非本轮引入**：`R8-dev` D6 已登记为既有产品行为（问 AI 路径同源） | 按「不删断言、不放宽为恒真」落地为等价可判形态：**点击时**选区与页 1 首 span 逐字相等且未塌陷（N97 的「点击不清塌」在点击时刻成立）→ **点击后**断言「焦点确实进入 composer + 选区被收进输入框 + chips 净差异恰为「选中文本」一项（其余字段逐字不变）」→ **增量控制实验**（blur → 重建选区 → 写模板草稿 → 聚焦 composer 三步读数）证明「点击本身零额外副作用、塌陷只由聚焦引起」。数据面全量落进 `data.quiet` / `data.control`。**已裁决（N97-4 追加）**（`R17-review.md`「追加裁决（R17）」+「代码审查（R17 · N97-4）」）：① **chips 不变重新成立** —— N97-4 选区快照使「选中文本」chip 与载荷的 `selectedText` 实参不再依赖 `readerStore.selectedText`；`r17-2/explain` 的断言已按设计档「追加设计」§3.4 更新为 `JSON.stringify(chipsAfter17f) === JSON.stringify(chipsBefore17f)`（`count` / `labels` / `notesLabel` / `notesTitle` / `removeTitle` 五字段逐字相等），并由 `r17-3` 的 `snapshot-survives-typing` 相位在真实键入路径下逐字复核；② **「点击后选区逐字不变」维持上述等价形态**（镜像链零 diff 是本轮硬约束，N97-4 未改 `PdfViewer` / `reader-store`）；③ **载荷口径** —— `r17-3` 的 `send-payload` 逐字判「`selectedText:` 下一行 = 点击时刻选区文本」。全程不删断言、不放宽为恒真 |
| D-B2 | `ShortcutOverview.vue` 注释改字（代码零变化） | 设计档 §1.4 冻结参考实现的 Esc 分支注释含字面 `stopPropagation`，与 §5.6 #5「`grep -c stopPropagation` = 0」直接冲突（二者不可同时满足） | 注释改为「不阻断冒泡」，语义与代码逐字不变；现 `grep -c stopPropagation` = **0**、`grep -c stopPropagation`（全仓组件）无新增调用点 |
| D-B3 | `ChatPanel.vue` import 清单补 `templateForAction` | 设计档 §2.2 #8 列出的 import 为三项（`EXPLAIN_TEMPLATE` / `TRANSLATE_TEMPLATE` / `resolveTemplateDraft`），但 §1.6 冻结函数体调用 `templateForAction(action)`（需求档 §0.7 同） | 按 §1.6 冻结体一并导入（4 项）；§5.6 #7a/#7b 判据（1 / 2）不受影响 |
| D-B4 | `r17-1b` 相位 `narrow` 补「重新打开浮层」一步 | `default` 相位按设计档步骤 ⑤ 收尾关闭浮层 ⇒ 若 `narrow` 不重开，其截图与矩形读数会取到「浮层不在 DOM」的空值 | 在 `layoutVar(560px)` 后补一次入口点击 + `waitFor`（判据不变，仅步骤补齐） |
| D-B5 | `data` 增量字段与 1 个 Node 侧表达式常量 | 新增 `ACTIVE_PROBE`（活动焦点现场表达式字符串，**不是 helper 名**）与若干 `data` 字段：`r17-1` 相位 2 的 `blurSelfCheck` / `afterEsc`、相位 3 的 `openedActive` / `selfChecks`、`r17-1b` 的 `insideReaderPanel` / `restoredVar` / `entry`、`r17-2` 的 `ready` / `control` / `spanText`、`r17-2b` 的 `ready` / `restoredVar` | 全部为**追加**（不改任何判据、不覆盖既有字段）；helper 名严格保持 5 个 |
| D-B6 | 选区类相位的就绪护栏（登记性） | 设计档 §5.4.3 各相位未写就绪复核步；`selectPageSpan` 单独使用可能在迟到滚动下取到隐藏态 | 复用**既有** `ensureQuickAskExcerptReady(page)`（R15 helper，零改写）作前置复核，`ok === false` 即判红（不降级跳过） |

登记性说明（不构成偏差）：① 两张既有整窗截图 + 三张 `.quick-ask` 裁切截图因 4 按钮变宽而像素变化（设计档 §0.1 已登记；仓内 `pixelmatch` = **0** ⇒ 不判红）；② `.center-pill` 因新增 20px 入口而变宽约 22px（既有 `textContent` 断言不受影响，`r17-1b` 读数 `entry {w:20,h:20}`）；③ 浮层与知识地图列的重叠按上游 M3 处置② 接受（`r17-1b` 两相位在地图关闭态取值且 `mapSlotInDom === false`）。

---

## B9. 纪律与零残留声明

- 未运行任何 git 写命令（只用 `git status` / `git diff` / `git diff --numstat` / `git log` 只读）。
- 未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未增删依赖、未改 `package-lock.json` / `packages/**` / `pix/package.json`。
- 未删除既有场景 / 断言：既有 64 项 `SEL` 与 237 条测量逐条保留（唯一改写 = 三处 `btnCount`，设计档 §2.2 #19–#21 授权）。
- 一次性脚本与探针（`%TEMP%/pix-select-probe.cjs`、`%TEMP%/pix-r17-compare.cjs`）与中间产物已删除；两次离屏运行输出只落在独立目录 `pix-v06-r17-after`（未覆盖基线目录，且基线目录本次只读）。
- 两个取证进程未并发（三次离屏运行顺序执行，末次为最终字节版本）。
- 本档结论只来自真实文件内容与真实命令输出；行号、计数、矩形与文案均为本次实读 / 实跑。

---

### 追加（N97-4 选区快照）

> 上游：需求档 `R17-req.md`「追加冻结（R17 · 负责人裁决）」→「N97-4（追加 · 负责人裁决）选区快照」冻结语义 **A–D**（C①–C⑤）+ 验收判据 a–d；设计档 `R17-design.md`「## 追加设计（R17 · N97-4）」§1–§7。
> 白名单（本追加）：`pix/src/renderer/components/workspace/ChatPanel.vue`、`pix/scripts/ui-shot.mjs`、本档。其余路径零 diff（§4 第 8 条给出实读核对）。
> 证据纪律：本节所有读数来自本次**实跑**（`npm run check`、两条烟测、两次离屏 `ui-shot.mjs`）与**实读**（`grep -c` / `grep -F` / `git diff --numstat` / 两次离屏的 `MANIFEST.json` / `MEASUREMENTS.json` 逐条比对）；无一条手工构造。

#### 1. 改动（2 个文件；相对 R17 交付态的增量）

| 文件 | 本追加增量 | 相对 HEAD 的累计 | 改动点 |
| --- | --- | --- | --- |
| `pix/src/renderer/components/workspace/ChatPanel.vue` | **+25 / −2** | `+35 / −3`（R17-dev §B1 记录 `+10 / −1`） | ① `excludeContext` 追加 1 行清空（C③）；② `pendingSelection` + `effectiveSelectedText`（插在 `selectionChip` 之前）；③ `selectionChip` 取值行改 `effectiveSelectedText.value.trim()`；④ 既有两个 watch 之后新增 2 个 watch（C① 新选区失效 / C② 切文档清空）；⑤ `onQuickAsk` 首行 `if (text) pendingSelection.value = text;`；⑥ `send()` 的 `selectedText` 实参行改 `effectiveSelectedText.value` |
| `pix/scripts/ui-shot.mjs` | **+320 / −0** | `+1286 / −3`（R17-dev §B1 记录 `+966 / −3`；三个 `−` 行仍是 R17 的 `btnCount === 2` 三处） | ⑦ `SEL` +2（`contextChip` / `contextChipRemove`，70 → 72）；⑧ 新 helper `typeIntoComposer`（真实输入通道，5 → 6）；⑨ 新场景 `r17-3`（5 相位 / 25 条断言 / 1 张截图 / 新 label `r17-selection-snapshot`）；⑩ 既有 `r17-2/explain` 的 chips 断言更新 1 处（4 行 → 2 行） |
| `docs/pm/R17-dev.md` | 本节（追加） | —— | —— |

本追加**未触碰**的既有交付物（`git diff --numstat` 实读与 R17-dev §B1 逐字相同 ⇒ 本步零改动）：`smoke-view.mjs` `+225 / −1`、`PdfSelectionQuickAsk.vue` `+15 / −0`、`useQuickAsk.ts` `+5 / −3`、`ReaderPanel.vue` `+2 / −0`；`PdfViewer.vue` / `stores/**` / `InputArea.vue` / `reading-context.ts` / `WorkspacePage.vue` / `assets/styles/**` / `pix/package.json` / `packages/**` / `smoke-notes.mjs` 在 `git status --short` 与 `git diff --stat` 中均不出现。

`ui-shot.mjs` 的新 helper（真实键入原语，逐字）：

```js
  const typeIntoComposer = async (text) => {
    const before = await js(`(() => {
      const input = document.querySelector(${JSON.stringify(SEL.composerInput)});
      if (!input) throw new Error("composer input not found");
      return input.value;
    })()`);
    win.webContents.focus();
    for (const ch of text) win.webContents.sendInputEvent({ type: "char", keyCode: ch });
    await waitFor(
      `真实键入落进 composer（${text.length} 字符）`,
      `document.querySelector(${JSON.stringify(SEL.composerInput)}).value === ${JSON.stringify(before + text)}`,
    );
    return js(`document.querySelector(${JSON.stringify(SEL.composerInput)}).value`);
  };
```

#### 2. 真实命令与原样结果

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check ; echo "CHECK_EXIT=$?"
node pix/scripts/smoke-view.mjs | tail -1
node pix/scripts/smoke-notes.mjs | tail -1
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v06-r17b-after" ./node_modules/.bin/electron scripts/ui-shot.mjs > "C:/Users/86157/AppData/Local/Temp/pix-v06-r17b-after/uishot-run2.log" 2>&1 ; echo "UISHOT_EXIT=$?"
```

```text
CHECK_EXIT=0
通过 74 / 失败 0
通过 65 / 失败 0
UISHOT_EXIT=0
[ui-shot] 结束：产出 174 张截图
```

离屏产物（两次运行顺序执行，第二次为最终字节版本；日志留在 `C:/Users/86157/AppData/Local/Temp/pix-v06-r17b-after/uishot-run2.log`）：

| 项 | 目标（设计档「追加设计」§6） | 实读 |
| --- | --- | --- |
| `MANIFEST.json.failure` | `null` | `null` |
| `MANIFEST.json.shots.length` / 目录内 png | 174 / 174 | **174 / 174**（清单与磁盘双向零差集，白名单外条目 `[]`） |
| `MEASUREMENTS.json` 长度 | 253 | **253** |
| `label` 去重 | 69 | **69** |
| R16 基线零缺失 | 166 张 / 237 条 / 64 种 label | 缺失 **0 / 0 / 0**；前 237 条 label 序列逐条一致 = `true` |
| R17 基线（`pix-v06-r17-after`）零缺失 | 173 张 / 248 条 / 68 种 label | 缺失 **0 / 0 / 0** |
| 新截图 | `r17-3-snapshot-survives-typing.png` | 在盘（`rectOfSelector(SEL.composerBox, 0)` 裁切） |
| 失败截图 `99-failure-state.png` | 不应存在 | 不存在 |

`r17-3` 五相位实测值（`MEASUREMENTS.json` 原样摘录；长字段 `lines` 省略、`typed.log` 只留前 2 条）：

```json
{"phase":"snapshot-survives-typing","ready":true,"selectionText":"Sparse Attention for Long-Context Retrieval","selectionBefore":{"text":"Sparse Attention for Long-Context Retrieval","collapsed":false,"anchorInStage":true},"spanText":"Sparse Attention for Long-Context Retrieval","chipsBefore":["当前文档：sample-paper.pdf · 第 1 页","选中文本：Sparse Attention for Lon…"],"quickAskAfterExplain":{"inDom":true,"display":"none","feedbackClass":null,"feedbackText":null,"btnCount":3},"composerAfterClick":{"value":"请解释选中的这段话在论文中的含义与作用：","activeHasInputArea":true},"typed":{"text":"（追问）它在第二节的作用是什么？","value":"请解释选中的这段话在论文中的含义与作用：（追问）它在第二节的作用是什么？","log":[{"trusted":true,"inputType":"insertText","data":"（"},{"trusted":true,"inputType":"insertText","data":"追"},"…共 16 条"]},"composerAfterTyping":{"value":"请解释选中的这段话在论文中的含义与作用：（追问）它在第二节的作用是什么？","activeHasInputArea":true},"chipsAfterTyping":["当前文档：sample-paper.pdf · 第 1 页","选中文本：Sparse Attention for Lon…"],"selectionAfterTyping":{"text":"","collapsed":true,"anchorInStage":false},"quiet":{"send":0,"blocks":{"before":0,"after":0}}}
{"phase":"send-payload","sendCount":1,"displayText":"请解释选中的这段话在论文中的含义与作用：（追问）它在第二节的作用是什么？","selectedIndex":5,"selectedTextLine":"Sparse Attention for Long-Context Retrieval","expectedSelectionText":"Sparse Attention for Long-Context Retrieval","skeleton":{"head":true,"path":true,"pages":true,"tail":true},"tailMatches":true}
{"phase":"new-selection","ready":true,"spanText":"3. Ablation Study","expectedLabel":"选中文本：3. Ablation Study","label":"选中文本：3. Ablation Study","previousLabel":"选中文本：Sparse Attention for Lon…","labels":["当前文档：sample-paper.pdf · 第 2 页","选中文本：3. Ablation Study"]}
{"phase":"chip-removed","ready":true,"labelBeforeRemove":"选中文本：3. Ablation Study","selectionAfterAsk":{"text":"","collapsed":true,"anchorInStage":false},"chipsAfterRemove":{"count":1,"labels":["当前文档：sample-paper.pdf · 第 2 页"],"notesLabel":null,"notesTitle":null,"removeTitle":"本次发送不使用"},"chipsAfterReset":{"count":1,"labels":["当前文档：sample-paper.pdf · 第 2 页"],"notesLabel":null,"notesTitle":null,"removeTitle":"本次发送不使用"},"blocksBeforeReset":1,"sendAfterRemove":1,"composer":{"before":"请解释选中的这段话：","afterRemove":"请解释选中的这段话：","afterReset":""}}
{"phase":"doc-switch","ready":true,"attempts":1,"quickAskBeforeClick":{"inDom":true,"display":"flex","feedbackClass":null,"feedbackText":null,"btnCount":4},"labelBeforeClick":"选中文本：Sparse Attention for Lon…","labelBeforeSwitch":"选中文本：Sparse Attention for Lon…","selectionBeforeSwitch":{"text":"","collapsed":true,"anchorInStage":false},"chipsBeforeSwitch":{"count":2,"labels":["当前文档：sample-paper.pdf · 第 1 页","选中文本：Sparse Attention for Lon…"],"notesLabel":null,"notesTitle":null,"removeTitle":"本次发送不使用"},"chipsAfterSwitch":{"count":1,"labels":["当前文档：long-book.pdf · 第 1 页"],"notesLabel":null,"notesTitle":null,"removeTitle":"本次发送不使用"},"sendDelta":0}
```

更新的既有断言（设计档「追加设计」§3.4，唯一 1 处）实测：`r17-template-actions / explain` 的 `chips.before` 与 `chips.after` 逐字相等（`count` 2 / `labels` `["当前文档：sample-paper.pdf · 第 1 页","选中文本：Sparse Attention for Lon…"]` / `notesLabel` / `notesTitle` / `removeTitle` 五字段相同）⇒ N97-3 判据 1 的冻结字面（与点击前逐字相等）在真实路径下重新成立；该相位的三步控制实验保留（`afterWrite` 选区完好、`afterFocus` 塌陷）。

走查读数（设计档「追加设计」§5 N1–N14；命令级实读）：

| # | 命令 | 期望 | 实读 |
| --- | --- | --- | --- |
| N1 | `grep -c "readerStore.selectedText" ChatPanel.vue` | 1 | **2**（第 2 处 = C① watch 取值器 `() => readerStore.selectedText`，即设计档 §2.4 自身代码；来源唯一性由 N2 / N7 钉住，见 §4 第 6 条） |
| N2 | `grep -c "effectiveSelectedText"` | 3 | **3**（声明 1 + chip 1 + 载荷实参 1） |
| N3 | `grep -c 'pendingSelection.value = ""'` | 3 | **3**（C① / C② / C③；`send()` 内 0） |
| N4 | `grep -n -A3 "props.currentSessionPath"` | 不含 `pendingSelection` | 命中 2 段（`:153-155` 既有 watch、`:865` 会话比对），均不含（C⑤） |
| N5 | `grep -c -F 'if (text) pendingSelection.value = text;'` | 1 | **1**（`onQuickAsk` 下一非空行） |
| N6 | `grep -c -F 'if (kind === "selection") pendingSelection.value = "";'` | 1 | **1** |
| N7 | `grep -c -F 'selectedText: excluded.has("selection") ? "" : effectiveSelectedText.value,'` | 1 | **1**（排除分支逐字保留） |
| N8 | `grep -c "excludedContexts"` / `grep -c "context-chip"` | 7 / 9 | **7 / 9**（既有排除机制与 chips 结构零改写） |
| N9 | `git diff --stat -- <零 diff 清单>` | 空 | 清单内逐项空（`smoke-view.mjs` / `PdfSelectionQuickAsk.vue` / `useQuickAsk.ts` 的改动是 **R17 交付面**，numstat 与 R17-dev §B1 逐字相同） |
| N10 | `git diff -U0 -- ChatPanel.vue \| grep -E "^-"` | 只允许登记的 3 个 `-` 行 | **3 行**：`const selected = readerStore.selectedText.trim();`、`function onQuickAsk(): void {`、`selectedText: ... readerStore.selectedText,`；不含 `QUICK_ASK_TEMPLATE` / `NOTES_ASK_TEMPLATE` / `QUICK_TEMPLATE_REPLACEABLE` / `excludeContext` / `resetExcludedContexts` / `context-chip` / `notesLabel` / `buildReadingUserMessage` |
| N11 | `grep -c "pendingSelection"` | ≥ 6 | **6** |
| N12 | `sed -n '47,127p' ui-shot.mjs \| grep -cE '^\s+[A-Za-z][A-Za-z0-9]*:\s'` / `grep -c "r17-3\|r17-selection-snapshot"` | 72 / ≥ 2 | **72 / 12** |
| N13 | `grep -c "chipsAfter17f.count === chipsBefore17f.count - 1"` / `grep -c "JSON.stringify(chipsAfter17f) === JSON.stringify(chipsBefore17f)"` | 0 / 1 | **0 / 1** |
| N14 | `cd pix && npm run check` | 0 error | `CHECK_EXIT=0` |

#### 3. 逐条自评（冻结语义 A–D 与验收判据 a–d）

| 条 | 冻结字面 | 判定 | 实测依据 |
| --- | --- | --- | --- |
| **A** 快照来源 | 任何 action 都把 `emitQuickAsk` 的文本记为 pendingSelection | 成立 | 相位 `snapshot-survives-typing` 点「解释」后 chip 仍在且逐字等于点击时刻；`chip-removed` 相位点「问 AI」同结论（覆盖 `ask` 分支）；`grep -c -F 'if (text) pendingSelection.value = text;'` = 1（在两个分支之前） |
| **B** 唯一来源 | chip 可见性 / 文本与 `selectedText` 实参共用同一派生 | 成立 | 相位 `send-payload`：`selectedText:` 下一行 = `Sparse Attention for Long-Context Retrieval` = 点击时刻 `document.getSelection().toString().trim()`，且 chip 同文本；N2 = 3 / N7 = 1（第二份来源会同时改这两处计数） |
| **C①** 新选区失效 | store 变非空且与快照不同 ⇒ 快照失效 | 成立 | 相位 `new-selection`：chip 由 `选中文本：Sparse Attention for Lon…` 换成 `选中文本：3. Ablation Study`（≠ 旧 label） |
| **C②** 切文档清空 | `filePath` 变化 ⇒ 清空 | 成立 | 相位 `doc-switch`：`chipsBeforeSwitch` 含「选中文本」项（点击后选区已收进 composer ⇒ 只能由快照支撑）→ `openRow("long-book.pdf")` 后仅剩 `当前文档：long-book.pdf · 第 1 页` |
| **C③** 移除不清复活 | 移除 ⇒ 清空，且既有 `resetExcludedContexts()` 后仍不复活 | 成立 | 相位 `chip-removed`：移除后 `count` 2 → 1 且无「选中文本」项；真实触发 reset（`send()` 的 finally，`sendAfterRemove === 1`）后仍无该 chip（若快照未清空，此处会以旧文本复活） |
| **C④** 发送不清空 | `send()` 内不出现 `pendingSelection` | 成立 | N3 = 3（无第 4 处）；`send-payload` 之后 `chip-removed` 的链路仍按「快照 + 新选区」正常运行 |
| **C⑤** 切会话不清空 | `currentSessionPath` 关联代码不含 `pendingSelection` | 成立 | N4：命中片段全部不含该标识符 |
| **D** 不得改动 | 镜像语义 / 排除机制 / chips 类名文案 / 载荷格式 / 模板字面与「不自动发送」 | 成立 | N8 = 7 / 9；N9 零 diff 面（`PdfViewer.vue` / `stores/**` / `reading-context.ts` / `PdfSelectionQuickAsk.vue` / `useQuickAsk.ts` / `InputArea.vue` 本步零改动）；`r17-2/explain` 的零发送 / 指纹不变 / 浮层形态既有断言零改动且全绿 |
| **(a)** 真实键入下 chip 与草稿 | 9 条断言 | 全绿 | 真实键入 16 字符（`isTrusted: true` + `inputType: "insertText"`）；草稿 = `EXPLAIN_TEMPLATE + TYPED17`；chip 文本逐字未变；`sendCalls` 增量 0 且 `.message-block` 0 → 0；非真空证据 `collapsed === true && anchorInStage === false` |
| **(b)** 载荷含 `selectedText:` | 6 条断言 | 全绿 | `sendCount = 1`；`displayText` = 键入后草稿；骨架 `{head,path,pages,tail}` 全 true；`selectedText:` 下一行逐字 = 点击时刻选区文本；尾部 = 空行 + 草稿 |
| **(c)** 失效路径 | 3 + 4 + 3 条断言 | 全绿 | 见 C① / C② / C③ 行；`chip-removed` 的 composer 前后逐字（`请解释选中的这段话：`，非空 ⇒ 非真空） |
| **(d)** 零回归 | 基线零缺失 + 既有场景全绿 | 全绿 | 离屏退出码 0 / `failure === null`；R16 与 R17 基线截图 / 测量 / label 三类零缺失；`42*` / `43*` / `r15-*` / `r16-*` / `r17-1*` / `r17-2*` 全绿 |

#### 4. 偏差（逐条；含设计档 §3.2 / §3.3 的通道与步骤字面差异）

1. **键入通道：真实输入通道（不采用设计档 §3.2 登记的「原生 setter + `InputEvent`」）**。理由 = 本轮任务书要求「关键新增断言必须包含真实键入形态，不得只用程序化 setter」，且设计档 §7 开放问题 1 已写明「若要求真实引擎输入（`webContents.sendInputEvent`），需另立场景与通道」。落地 = `typeIntoComposer` 逐字符 `sendInputEvent({ type: "char", keyCode: ch })`；渲染层实测收到 `isTrusted: true` 的 `beforeinput` / `input`（`inputType: "insertText"`，16 条），断言 7 已把「真实通道」并入判红条件（`typingLog` 逐条 trusted + insertText + 条数 = 键入长度），故「通道退化」不会造成假绿。先期一次性探针（`%TEMP%/pix-r17b-probe.mjs`，已删）确认 `offscreen: true` + `show: false` 窗口下 char 事件可落值（含中文字符）。
2. **`chip-removed` 的 reset 触发器：改用真实发送路径；设计档冻结的 `setMessages([])` 在夹具内不可达**。首次实跑判红：`doc-switch` 的 `labelBeforeSwitch = null`（chip 被 `excludedContexts` 过滤）。根因 = stub 的 `setMessages([])`（`ui-shot.mjs:1223`）只改自身 `stubMessages`，不触发渲染层 `sessionStore.displayBlocks`，故 `watch(() => displayBlocks.length === 0)` 不触发、`resetExcludedContexts()` 未执行。改法 = 用 `send()` 的 `finally { resetExcludedContexts(); }`（同一函数、真实用户路径）；断言 3 增加 `sendAfterRemove === 1`（触发确实发生）。可选替代口径（点 `title="新对话"` 触发 `sessionStore.clearSession()`）本轮未采用。
3. **`doc-switch` 增「点击生效重取护栏」（≤3 次）**。理由 = `focusPage(1)` 的滚动会让浮层按既有语义隐藏并清空 `cachedText`，此时 `target.click()`（程序化点击对 `display:none` 元素同样派发）不再发射 ⇒ 无快照；判别信号 = 点击后 document 选区被收进 composer。实测 `attempts = 1`（未回退），护栏不改变判据字面。
4. **`new-selection` 期望 label 采用长度感知（`> 24` 才追加 `…`）**。设计档 §3.3 写「`选中文本：` + `pageSpanText(2)` 前 24 字 + `…`」，但第 2 页首 span = `3. Ablation Study`（18 字）⇒ 该字面在夹具内不成立（chip 的既有 `SELECTED_TEXT_PREVIEW_MAX` 语义：不足 24 字不加省略号）。期望值由运行时读到的 `pageSpanText(2)` 现算，未放宽任何条件。
5. **三处断言加严（不删、不放宽）**：`snapshot-survives-typing` 断言 7 并含真实通道证据；`chip-removed` 断言 3 并含 `sendAfterRemove === 1`；`doc-switch` 断言 1 并含「点击前 chip 存在」（不含则该相位无法判别「快照支撑」）。
6. **走查 N1 实读 = 2（设计期望 1）**：第 2 处是 C① watch 的取值器，即设计档 §2.4 自身冻结代码；「不得出现第二份来源」的口径由 N2 = 3 与 N7 = 1 承担。
7. **复用既有 helper 超出设计档 §3.2 清单**：`focusPage(1)`（把页 1 文本层带进渲染窗口 —— `IntersectionObserver` 只渲染视口内页）与 `waitPdfLoaded()`（切换 long-book 后的页码指示器就绪）；两者零改写。
8. **白名单核对（实读）**：`git diff --numstat` 只出现 R17 已登记的 6 个文件；本步触及的 `ChatPanel.vue`（+25 / −2 增量）与 `ui-shot.mjs`（+320 / −0 增量）之外，`smoke-view.mjs` / `PdfSelectionQuickAsk.vue` / `useQuickAsk.ts` / `ReaderPanel.vue` 的 numstat 与 R17-dev §B1 逐字相同；未运行任何 git 写命令。

#### 5. 未验证事项

1. **`readerStore.selectedText` 无 dev hook**（渲染层不可直接读）⇒「store 已空」仍是间接证据：`selectionProbe().collapsed === true && anchorInStage === false` + `git diff -- pix/src/renderer/components/workspace/PdfViewer.vue` 为空的双证（与设计档 §3.3 注一致）。若后续加 dev hook，应把该间接证据升级为直接读数。
2. **C⑤（切会话不清空）只由走查判定**：无离屏相位（`currentSessionPath` 变化在夹具内需走会话列表 / 新对话路径，本轮未立相位）。
3. **真实键入的口径边界**：char 事件是真实引擎输入通道，但未覆盖 IME 组合态（`isComposing`）、物理键盘布局差异与真实按键的 `keydown` 序列（本轮只发 `char`，故不会误触阅读区 `?` / `/` 等 window 级 keydown 分支）。
4. **`.quick-ask` 反馈态 × 快照的交互未另立相位**（反馈期内无法点击模板动作，属既有门控）。
5. **框选模式 / 降级文档 × 快照**未覆盖（本追加零改动面）。

#### 6. 纪律与零残留声明（本追加）

- 未运行任何 git 写命令（只用 `git status --short` / `git diff` / `git diff --numstat` / `git diff -U0` 只读）。
- 未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未增删依赖、未改 `package-lock.json` / `packages/**` / `pix/package.json`。
- 未删除既有场景 / 断言：既有 70 项 `SEL` 与 248 条测量逐条保留（唯一改写 = `r17-2/explain` 的 chips 断言 1 处，设计档「追加设计」§3.4 授权）；新增 `r17-3` 五条 `record` 与 1 张截图。
- 一次性探针 `%TEMP%/pix-r17b-probe.mjs` / `%TEMP%/pix-r17b-probe.json` 已删除；两次离屏运行产物只落在独立目录 `pix-v06-r17b-after`（R16 / R17 基线目录本次只读）。
- 两个取证进程未并发（两次离屏顺序执行，第二次为最终字节版本，`UISHOT_EXIT=0`）。
- 本追加结论只来自真实文件内容与真实命令输出。

#### 7. 收口修订（R17b · N97-4 收口）

> 依据：`R17-review.md`「代码审查（R17 · N97-4）」mustFix ①②③。本节只记本轮收口的改动与**实跑读数**；不改本追加 §1–§6 的任何字面，也**未触碰产品源码**（`pix/src/**` 零改动）。

**7.1 三条处置的落地**

| # | mustFix | 落地（`ui-shot.mjs` / 两份文档） |
| --- | --- | --- |
| ① | `r17-3-snapshot-survives-typing.png` 裁切不含 chip 行（设计档 §3.3 步骤 5 的括号字面与目的互斥） | 裁切矩形由 `rectOfSelector(SEL.composerBox, 0)` 改为 `rectOfSelector(".composer", 0)`（`.composer` = `.context-row`（chip 行）与 `.composer-box` 的共同父容器，`ChatPanel.vue:1122` / `:1134` / `:1155`）；裁切实测由 358×71 @ `{x:1219,y:908}` 变为 **378×152 @ `{x:1209,y:837}`**，图内实际可见两条 chip（`当前文档：sample-paper.pdf · 第 1 页` / `选中文本：Sparse Attention for Lon…`）+ 草稿逐字（已目视）；设计档 §3.3 步骤 5 括号字面同步更正并登记（`R17-design.md`「追加设计」§8 第 1 行） |
| ② | `r17-3` 选区步缺有界滚动静默护栏（迟到阅读区滚动→浮层隐藏→`selectPageSpan` 内部 waitFor 超时抛错） | 4 个含选区的相位（`snapshot-survives-typing` / `new-selection` / `chip-removed` / `doc-switch`）在 `selectPageSpan(page)` **之前**各调用一次**既有** `waitStageScrollQuiet()`（零改写）；读数落进各相位 `data.scrollGuard`（追加字段，不覆盖既有字段）；判据与断言（25 条）零新增零删除，`SEL` 72 项 / helper 6 个 / 截图与 record 配额均不变（`R17-design.md`「追加设计」§8 第 2 行登记）。两次绿跑实测护栏已吸收迟到滚动（吸收计数，a 值 / b 值）：`snapshot-survives-typing` 1 / 0、`new-selection` 1 / 1、`chip-removed` 0 / 0、`doc-switch` 0 / 0。|
| ③ | 文档同步（D-B1 仍写「需上游裁决」；§B6 #6 的「chip 必掉」表述已不成立） | §B8 **D-B1** 改标为「已裁决（N97-4 追加）」并按交付的等价断言口径改写（chips 逐字相等 + 选区维持等价形态 + `send-payload` 载荷口径）；§B6 **#6**（`r17-2c-template-translate-draft.png`）目视登记更正为「裁切不含 chip 行，chip 存活性以数据面 + `r17-3` 逐字断言为准」；R17 主档导语（§B1 之前）补一句收口指向 |

**7.2 真实命令与原样结果**

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check ; echo "CHECK_EXIT=$?"
PATH="/c/Program Files/nodejs:$PATH" node pix/scripts/smoke-view.mjs | tail -1
PATH="/c/Program Files/nodejs:$PATH" node pix/scripts/smoke-notes.mjs | tail -1
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v06-r17c-b" ./node_modules/.bin/electron scripts/ui-shot.mjs ; echo "UISHOT_B_EXIT=$?"
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v06-r17c-a" ./node_modules/.bin/electron scripts/ui-shot.mjs ; echo "UISHOT_A_EXIT=$?"
```

```text
CHECK_EXIT=0
通过 74 / 失败 0
通过 65 / 失败 0
UISHOT_B_EXIT=0
[ui-shot] 结束：产出 174 张截图
UISHOT_A_EXIT=0
[ui-shot] 结束：产出 174 张截图
```

日志：`…/pix-v06-r17c-a/uishot-run-a.log`、`…/pix-v06-r17c-b/uishot-run-b.log`（均无 `场景失败` / `renderer gone` / `unhandledRejection`）。两次离屏**串行**执行（不并发），均以最终字节状态运行。

**7.3 两次绿跑之前的中间一次复跑的既有 flake（登记，不属本轮面）**：该次同命令复跑曾在**场景 55** 判红：`断言失败 map-scale：展开耗时超限：964ms(mode=ready)`（阈值 800ms；知识地图面，本收口零改动，且 `r17-3` 在该场景之后），同命令立即复跑绿（73ms / 77ms）。该抖动与 `R11-dev` 偏差 ③（866 / 966ms）与 `R13-dev` R-B8（876ms）同款既有环境性 flake，未改既有断言。

**7.4 两次绿跑读数（同一最终字节状态；`MANIFEST.json` / `MEASUREMENTS.json` 实读）**

| 项 | `pix-v06-r17c-b`（先） | `pix-v06-r17c-a`（后） |
| --- | --- | --- |
| 退出码 / 末行 | 0 / 产出 174 张截图 | 0 / 产出 174 张截图 |
| `MANIFEST.json.failure` | `null` | `null` |
| shots / 目录内 png | 174 / 174 | 174 / 174 |
| `MEASUREMENTS.json` 长度 / label 去重 | 253 / 69 | 253 / 69 |
| R16 基线零缺失（166 张 / 237 条 / 64 种 label） | 0 / 0 / 0（前 237 条 label#phase 序列逐条一致 `true`） | 0 / 0 / 0（同） |
| R17b 基线（173 / 248 / 68）零缺失 | 0 | 0 |
| 新截图 / 新 label | 8 张（7 + `r17-3-…`）/ 5 种 | 同 |
| `r17-3-snapshot-survives-typing.png` 裁切 | 378×152 @ `{x:1209, y:837}` | 同（像素级目视：两条 chip + 草稿逐字） |
| `map-scale` 计时（登记性） | 73 ms | 77 ms |

`r17-3` 五相位（两次逐字一致；括号内为 `data.scrollGuard`）：

| 相位 | 关键读数（除 `scrollGuard` 的外层读数外两次相同） |
| --- | --- |
| `snapshot-survives-typing` | `ready true`；`chipsBefore = chipsAfterTyping = ["当前文档：sample-paper.pdf · 第 1 页", "选中文本：Sparse Attention for Lon…"]`；`typed.value = "请解释选中的这段话在论文中的含义与作用：（追问）它在第二节的作用是什么？"`；`selectionAfterTyping {text:"", collapsed:true, anchorInStage:false}`；`quiet {send:0, blocks:0→0}`（护栏：a `{waitedMs 531, absorbed 1}` / b `{468, 0}`） |
| `send-payload` | `sendCount 1`；`selectedTextLine = expectedSelectionText = "Sparse Attention for Long-Context Retrieval"`；`skeleton {head,path,pages,tail} = true`；`tailMatches true`（无护栏调用，滚动隐含在发送前已静默） |
| `new-selection` | `spanText "3. Ablation Study"`；`label "选中文本：3. Ablation Study"` ≠ `previousLabel`；`ready true`（护栏：a `{522, 1}` / b `{472, 1}`） |
| `chip-removed` | `labelBeforeRemove "选中文本：3. Ablation Study"`；移除后 / reset 后 `labels` 均仅 `["当前文档：sample-paper.pdf · 第 2 页"]`；`sendAfterRemove 1`；`composer` 前后逐字（`请解释选中的这段话：`）（护栏：a `{459, 0}` / b `{453, 0}`） |
| `doc-switch` | `attempts 1`；`labelBeforeSwitch "选中文本：Sparse Attention for Lon…"`；`chipsAfterSwitch ["当前文档：long-book.pdf · 第 1 页"]`；`sendDelta 0`（护栏：a `{420, 0}` / b `{431, 0}`） |

**7.5 走查与白名单（实读）**

| # | 命令 | 期望 | 实读 |
| --- | --- | --- | --- |
| N12 | `sed -n '47,127p' ui-shot.mjs \| grep -cE '^\s+[A-Za-z][A-Za-z0-9]*:\s'` / `grep -c "r17-3\|r17-selection-snapshot"` | 72 / ≥ 2 | **72 / 12** |
| N13 | `grep -c "chipsAfter17f.count === chipsBefore17f.count - 1"` / `grep -c "JSON.stringify(chipsAfter17f) === JSON.stringify(chipsBefore17f)"` | 0 / 1 | **0 / 1** |
| —— | `grep -c 'await waitStageScrollQuiet()' ui-shot.mjs` | 5（既有 1 + 本收口 4） | **5** |
| —— | `git status --short` | 与 R17 交付态一致（6 `M` + 7 `??`） | 一致；`pix/src/**` 本收口**零改动**（`ChatPanel.vue` numstat 仍 `+35 / −3`）；`ui-shot.mjs` 由 `+1286 / −3` 变为 **`+1300 / −3`**（+14 行 = 三处改字 + 注释） |

**7.6 未决 / 登记**

1. `data.scrollGuard` 为**追加**字段（不改任何判据）；其 `waitedMs` / `absorbed` / `lastAt` 属运行时抖动读数，不参与断言。
2. `r17-2b-template-explain-draft.png` / `r17-2c-template-translate-draft.png` 两张裁切仍取 `.composer-box`（设计档 §8.2 #5 / #6 未固定其 rect）：mustFix ① 只点名 `r17-3` 的截图，本收口未改这两张；其「chip 行不可目视」一项由 §B6 #6 登记说明（数据面与 `r17-3` 承担 chip 存活性证据）。
3. 中间一次复跑的 `map-scale` 性能抖动为既有环境性 flake（§7.3），未改既有断言、未列入未决项。
4. 本收口未运行任何 git 写命令；未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未增删依赖；无临时脚本 / 探针进仓。

