# PiX-Read R11 需求档 · 收口修复（N73–N76）

> 上游：`docs/pm/PRD-V0.5.md` §2（R11 = 收口修复：修 V0.4 遗留缺陷、取证脚本启动清理、回归断言补齐、可复跑数据面烟测入口）、§4（版本级反需求）、§5（工程红线，§5.7 证据纪律、§5.8 依赖零改动 + 允许新增一个 `scripts` 条目、§5.9 离屏脚本是唯一 UI 回归基线、§5.10 无临时产物）、§7.1（修复零回归：三个缺陷各有独立断言、112 张既有截图与 153 条既有测量零缺失、`npm run check` 每轮 0 error）。
> 依赖：`docs/pm/R10-req.md`（§0 冻结字面 + N63–N72）、`docs/pm/R10-review.md`「代码审查（R10）」§3 must-fix 1（已销账）、§4.3 / §4.4 / §5.1 / §5.2 / §5.3、`docs/pm/R10-dev.md` B.2 D1（摘录反馈被 scroll-hide 抑制的实测记录）、B.6 / 终 1（`99-failure-state.png` 历史残留）、终 6。
> 本轮唯一主线：**把 V0.4 的遗留缺陷与验证基础设施一次性收口** —— 修「笔记搜索框 Esc 越界触发阅读区语义」与「摘录反馈被无关滚动吞掉」两个真实缺陷、让取证脚本产物目录自净、把 R10 只有走查结论的三处补成可判定的回归断言、把 R10 只存在于仓库外临时目录的数据面烟测固化为仓库内可复跑脚本、更正 README 的事实性错误。
> **本轮不新增任何产品功能**（PRD §2 已冻结 R11 的性质是「修复 / 基建」）。

---

## 0. 定稿修订（R11）

> 上游：`docs/pm/R11-review.md`「需求评审（R11）」§M（must-fix 6 条）。
> 本节是**定稿口径**：与正文冲突时以本节为准；正文已就地同步（每条给出「同步位置」）。
> 结论：**6 条全部接受、0 条拒绝**。M1 / M2 / M5 涉及事实错误或不可判定判据，已用真实文件内容与实跑命令复核后再改，复核证据写在各条「复核」行。
> 说明：评审 §9 的 6 条**非阻塞**建议不在 must-fix 范围，本档不据此改动正文（设计档可按需吸收）。

### M1（152 vs 153 口径）—— 接受，改写

- 复核：`docs/pm/R10-dev.md:359` 逐字「MEASUREMENTS.json：153 条（上一交付 152 + 本轮 search-row-form 1）」；`:375` 逐字「唯一新增条目是本轮补强的 `search-row-form`；修复前 152 条一条不缺。」；`docs/pm/R10-review.md:206` 的 **152 条**读数为「搜索行冻结字面修复前」的时间点读数。原「差 1 条未在交付档中说明」不成立。
- 处理：「本档事实基线」第 3 行与 §0.7「既有测量」行改按上述两条逐字引用；§8 开放问题 4 改为「口径统一」表述（唯一基线仍是 R11 动工前实跑），删除「先查清 1 条差异再动工」的措辞。
- 同步位置：事实基线表第 3 行、§0.7「既有测量」行、§8 第 4 条。

### M2（r11-3 兜底按钮方向）—— 接受，改写

- 复核：`pix/src/renderer/components/workspace/PdfViewer.vue:844` `title="缩小" @click="zoomBy(-0.1)"`、`:846` `title="放大" @click="zoomBy(0.1)"`；`zoomBy`（`:730-732`）直接写 `readerStore.scale`；页盒尺寸由 `getViewport({ scale: readerStore.scale })`（`:189`）决定；`MIN_SCALE / MAX_SCALE = 0.5 / 3`（`pix/src/renderer/stores/reader-store.ts:20-21`）；夹具每页 MediaBox 595×842（`pix/scripts/ui-shot.mjs:111`）。⇒ 缩小只会减小渲染页高，不可能让 `.pdf-scroll` 达到可滚动；方向只能是放大。
- 处理：兜底改为点 `title="放大"`；冻结「达到 `.pdf-scroll` 可滚动即停止、不得超过 `MAX_SCALE`；放大到上限仍不可滚动 ⇒ 该相位判失败（不得降级为跳过）」；实际 `scale`（读 `.zoom-label`）与 `scrollHeight` / `clientHeight` 写入 `data` 作空断言留档。
- 同步位置：N73-2 场景 `r11-3` 相位 `reader-scroll-control`。

### M3（`.notes-empty` 文案读取节点）—— 接受，改写

- 复核：`pix/src/renderer/components/workspace/NotesPanel.vue:561-564`：`.notes-empty` 是容器（`.empty-icon` + `.empty-title` 逐字 `还没有摘录` + `.empty-subtitle` 逐字 `在 PDF 中选中文字，点「摘录」保存到这里`）；容器 `textContent` 归一化后不可能等于单段文案。
- 处理：N74-1 的「逐字冻结字面」与场景 `r11-4` 断言⑤冻结读取节点为 `.notes-empty .empty-title` 与 `.notes-empty .empty-subtitle`；`.notes-empty` 本体只作「在 DOM」判定。
- 同步位置：N74-1 逐字冻结字面、场景 `r11-4` 的 `after-delete-empty` 判定项⑤。

### M4（N74-2 判据盲区与阈值节点）—— 接受，改写

- 复核（盲区）：`NotesPanel.vue:1336-1340` `.note-actions { display: flex; justify-content: flex-end; gap: 4px }` ⇒ 内容超宽时溢出在 inline-start（左）侧；既有 `scrollWidth - clientWidth`（只覆盖 end 侧）与 `right` 边界判据都覆盖不到，220px 实为溢出时可判绿。本轮禁止离屏实跑，按「缺少必要判据」处理。
- 复核（阈值）：`.note-text`（`:1266-1269`，12px / line-height 1.5）与 `.note-copy`（`:1347-1355`，11px / line-height 1.4）字号不同 ⇒ 原「按实际行内文本 `fontSize * 1.5`」不指定节点不可判。
- 处理：判定表增「动作区不溢出（start 侧）」（`actions.left >= body.left - 1`，且 `.note-copy` / `.note-ask-wrap` 各判一次 `left >= actions.left - 1`；矩形取 `getBoundingClientRect()`；`body` = 该行 `.note-body`，其 CSS 无内边距 `:1173-1179`）；「未换行」阈值冻结为 `1.5 × max(fontSize × 1.5)`，本轮取 `.note-text`（12px）⇒ `27px`，开发档必须把实际取的节点、`fontSize` 与阈值写入 `data`。
- 同步位置：N74-2 判定表「动作区不溢出（end 侧）」「动作区不溢出（start 侧）」「未换行」三行、场景 `r11-5` 的 `narrow-220` 判定项。

### M5（越界守卫判据）—— 接受，改写（取更强写法）

- 复核：`ui-shot.mjs:33` `OUT_ROOT = process.env.PIX_SHOT_ROOT || "C:/Users/86157/AppData/Local/Temp/pix-r5"`（无校验、无白名单）、`:34` `SHOTS_DIR = join(OUT_ROOT, "shots")`；实跑 `grep -c "rmSync(SHOTS_DIR" scripts/ui-shot.mjs` = **0**；`rmSync` 已在 `:28` 顶层导入。⇒ §0.5「不得触碰 `%TEMP%` 之外的路径」在实现层无判据；`PIX_SHOT_ROOT` 指向仓库或任意目录时，`rmSync(<该目录>/shots, { recursive: true, force: true })` 会递归删除该目录。评审的第一种写法（只挡仓库路径）挡不住「仓库外的任意目录」，故取第二种写法的加强版：同时要求 tmpdir 归属与仓库互不包含。
- 处理：§0.5 增「启动守卫（冻结）」行；N73-3 验收面增走查判据与负向控制命令（见 §0.5 与 N73-3）。
- 实测注记：本机 `os.tmpdir()` = `C:\Users\86157\AppData\Local\Temp`（2026-09-16 实跑 `node -e "console.log(require('os').tmpdir())"`），`:33` 的默认值位于其下 ⇒ 不设 `PIX_SHOT_ROOT` 时守卫可通过；若某机器 `os.tmpdir()` 与默认值不符，守卫会拒绝启动并打印原因（运行前必须显式设 `PIX_SHOT_ROOT`）。
- 同步位置：§0.5「清理范围」「启动守卫」「依赖」三行、N73-3 逐字冻结字面、N73-3 验收判据。

### M6（4 张截图的可见内容）—— 接受，登记并目视比对

- 复核（按真实文件行号）：面板复位（`scrollTop = 0`）后随即截图的 4 处——`ui-shot.mjs:1086`→`:1087` `02-notes-list.png`、`:1109`→`:1110` `03-notes-current-doc.png`、`:1243`→`:1244` `08-notes-after-excerpt.png`（前一拍 `:1235` 起为「已在笔记中」duplicate 反馈，浮层处于 `mode="feedback"`）、`:2561`（复位）→`:2599` `32-answer-note-badge.png`（复位与截图之间只有 `readNotes()` 与一个只读 DOM 探针）。浮层的滚动隐藏来源即 `PdfSelectionQuickAsk.vue:137-138` 的 `onStageScroll`（正是 N73-2 的改动点）。注：4 处赋值多为 `scrollTop = 0` 的幂等写（不产生 scroll 事件）⇒ **预期**无差异，但需求档原无「内容 / 目视」判据覆盖。
- 处理：§0.7 增「内容目视比对（N73-2 影响）」行；N73-2 验收判据增【离屏·内容目视】一行。差异只允许是「浮层是否可见」，且必须逐张登记；出现其它内容差异 ⇒ 判回归失败。
- 同步位置：§0.7 表新增行、N73-2 验收判据表新增行。

---

**判定工具（本档所有验收只能由这五种证据判定，逐条已标注）**

| 记号 | 含义 |
| --- | --- |
| 【走查】 | 只读代码与 `git status` / `git diff` / `git show`（只读可用） |
| 【check】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` 必须 0 error（唯一工程门） |
| 【烟测-渲染】 | 纯函数离线烟测（仓库外临时目录编译 `pix/src/renderer/utils/*.ts` 后 node 直接断言）。**本轮不涉及**：R11 不改 `notes-view.ts` / `notes-path.ts` 等纯函数模块，也不新增纯函数（若开发过程中打破了这一前提，必须在设计档登记并补该面判据） |
| 【烟测-主进程】 | 数据面烟测：R11 起为**仓库内可复跑脚本** `pix/scripts/smoke-notes.mjs`（N75） |
| 【离屏】 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs`：退出码 0 + `MANIFEST.json.failure === null` + 新增断言组全绿 + 新增截图齐备 |

**本档事实基线（写档当天核对的真实结果，供后续角色复核）**

| 事实 | 证据 |
| --- | --- |
| 工作树干净、分支 `main`、HEAD = `752a6d2`（`docs: V0.5 迭代路线与 PRD（R11-R15）`） | `git status --short`（空）、`git branch --show-current`、`git log --oneline -1` |
| 唯一工程门当前 0 error | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（2026-09-16 实跑） |
| R10 交付终态 = 112 张截图 / 153 条测量 | `R10-dev.md` 终 1、终 4；`R10-review.md:206` 的审查方独立复跑读到 **152 条**，是「搜索行冻结字面修复前」的时间点读数，差额已由交付方说明：`R10-dev.md:359`「MEASUREMENTS.json：153 条（上一交付 152 + 本轮 search-row-form 1）」、`:375`「唯一新增条目是本轮补强的 `search-row-form`；修复前 152 条一条不缺。」⇒ 不存在未说明的漂移 |
| 缺陷 N73-1 的代码位置 | `pix/src/renderer/components/workspace/PdfViewer.vue:356-385`（`onWindowKeydown`：375 `captureMode` 分支 → 380 `searchOpen` 分支 → 385 才做 `isEditableTarget` 检查）；`pix/src/renderer/components/workspace/NotesPanel.vue:200-204`（`onSearchEsc` 只清空 + `blur()`，无 `stopPropagation`）、模板 `:435`（`@keydown.esc="onSearchEsc"`） |
| 缺陷 N73-2 的代码位置 | `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue:137-139`（`onStageScroll`：`if (visible.value) hide()`）、`:176`（`document.addEventListener("scroll", onStageScroll, true)` 无来源判定）、`:105`（`showFeedback` 的 `if (!visible.value) return`） |
| N73-3 的代码位置 | `pix/scripts/ui-shot.mjs:33`（`OUT_ROOT` 取环境变量、无任何校验）、`:34`（`SHOTS_DIR = join(OUT_ROOT, "shots")`）、`:352`（`mkdirSync(SHOTS_DIR, { recursive: true })`）、`:5854`（`mkdirSync(OUT_ROOT, { recursive: true })` 后无清理；`main()` 的首条语句是 `:5853` 的 `app.setPath("userData", …)`）、`:5920-5923`（写 `MANIFEST.json` / `MEASUREMENTS.json`）、`:28`（`rmSync` 已顶层导入） |
| 新增离屏场景的挂载点 | `runReaderStateScenarios`（`ui-shot.mjs:1341`）末尾、65 段之后；每场景自带复位（`enterNotesProbe` / `enterCleanWorkspace`），不引用其它场景的局部变量 |
| R10 审查档的一处缺口（不影响本轮） | `docs/pm/R10-review.md` 在 §5.3 处结束：文件末行（`:247`）只有条目标题 `3. **\`undoDelete\` 的 \`stale\` 与「行已过期被收掉」的边界**：`，正文缺失 ⇒ 该点**没有**审查结论。R11 不追补该点（属 R15 全量审查范围） |

---

## 0. 冻结契约（设计档、开发档、评审档均不得改写）

### 0.1 本轮不得改写的既有冻结项（R9 / R10）

| 来源 | 冻结内容 | 本轮为什么不得动 |
| --- | --- | --- |
| R10 §0.1/§0.2 | 搜索匹配与排序的唯一实现点 `pix/src/renderer/utils/notes-view.ts`（`matchesSearch` / `sortNotesForView` / `applyViewToGroups` / `normalizeQuery` / `resolveListEmptyReason` / `buildNoteCopyFragment` / `isUndoExpired`） | 本轮不碰过滤与排序语义；面板内仍不得出现第二份 `includes(` / `filter(` / `sort(` |
| R10 §0.3 | 计数四分叉逐字：`共 {T} 条` / `本章 {V} 条 / 共 {T} 条` / `当前 {V} 条 / 共 {T} 条` / `命中 {V} 条 / 共 {T} 条`；错误态 `.notes-count` 为空串；组头 `.group-count` 逐字 `共 {N} 条` | R11 只做缺陷修复，不改任何计数口径 |
| R10 §0.4 | 空态六分支与逐字文案（`.notes-empty` / `.notes-search-empty` 三态 / `.notes-chapter-empty` / `.notes-filtered-empty` / `.notes-loading` / `.notes-error`） | 同上 |
| R10 §0.5/§0.6 | 撤销主进程契约（内存槽 + 校验顺序 + 逐字文案 `没有可撤销的删除` / `该笔记已重新存在，无法撤销` / `该笔记内容已重新存在，无法撤销`）与渲染层常量 `UNDO_WINDOW_MS=5000` / `UNDO_ROW_MS=8000` / `UNDO_EXPIRED_MESSAGE=撤销窗口已过期（超过 5 秒），笔记未能还原` | 本轮不碰撤销语义；N74-1 只是补断言 |
| R10 §0.8（定稿后） | 搜索行字面：`placeholder="搜索原文或备注"`、`.notes-search-input` 盒模型（高 26px / 圆角 6 / 12px，照抄 `PdfSearchPanel.vue` 的 `.search-input`）、`.notes-search-clear` 为 `<v-btn icon="mdi-close" title="清空搜索">` | 修复轮刚销账的 must-fix，R11 不得再次偏离 |
| R10 §0.9（DOM 门控） | `.notes-search` / `.notes-sort` 的 `v-if="status === 'ready' && hasNotes"`；`.notes-search-clear` 的 `v-if="searchActive"`；`.notes-undo` 的 `v-if="pendingUndo !== null"` 与「在 `.notes-notice` 之后、`.notes-export-row` 之前」 | N73-1/N74-1 的新断言必须建立在这些门控**不变**之上 |
| R10 / R9 类名 | `.notes-panel` / `.notes-header` / `.notes-search` / `.notes-search-input` / `.notes-search-clear` / `.notes-sort` / `.notes-sort-btn` / `.notes-count` / `.notes-notice` / `.notes-undo` / `.undo-text` / `.notes-undo-btn` / `.notes-export-row` / `.notes-group-head` / `.group-count` / `.note-row` / `.note-body` / `.note-text` / `.note-actions` / `.note-copy` / `.note-ask-wrap` / `.notes-empty` / `.notes-chapter-filter` / `.notes-chapter-filter-clear` / `.notes-chapter-empty` / `.notes-filtered-empty` | 取证基线与断言面全部建立在这些类名上 |
| R10 §0.10（几何） | `.note-copy` 在 `.note-ask-wrap` 之前、两者同行、`.note-actions` 右对齐且是 `.note-body` 最后子节点（65-5 `notes-copy|geometry`） | N74-2 只追加极窄栏判据，不得改动既有几何断言 |
| R10 场景面 | 场景 00–11 / 20–24 / 30–36 / 40–46 / 50–55 / 60–65 的全部 label 与 18 张 R10 截图名、`notes-search|esc`（60-3）与 `notes-search|clear-button`（60-4）两相位的全部字段 | PRD §5.7「不得删除既有场景」；N73-1 的旧断言必须逐字保留 |
| R6 / R9 面 | 阅读现场（`reader-state.json`）与知识地图（章节过滤条、徽标计数口径）的类名、文案、token 机制 | 本轮不碰；`.reader-stage` 只被 N73-2 当作**只读**的滚动来源判据 |

### 0.2 本轮显式改写的唯一一条冻结字面：N64-2 的「不 stopPropagation」

R10 把「Esc 只清空 + `blur()`，**不 `stopPropagation`**」写成了冻结字面（`docs/pm/R10-req.md` §0.8 的 `:190`、N64-2 的走查判据 `:272`；设计档侧 `docs/pm/R10-design.md:180`、`:777`；代码侧 `NotesPanel.vue:200` 的注释），R11 显式改写它 —— 这是本轮**唯一**一处对既有冻结字面的改写，必须在设计档/开发档/评审档逐字引用本表。

| 项 | 内容 |
| --- | --- |
| 被改写的旧字面（逐字） | 「Esc：清空查询并 `blur()`（**不加 `stopPropagation`**，阅读区既有的全局 Esc 处理不在本轮改动范围）」（`R10-req.md:190`）；走查判据「`@keydown.esc` 只做「清空 + `blur()`」，不 `stopPropagation`、不做别的副作用」（`:272`） |
| 为什么改 | 用户把焦点放在笔记搜索框时，按 Esc 的意图只有一个：**退出这个搜索**。旧字面让同一个按键同时穿透到 window 级监听（`PdfViewer.vue:375` 的 `captureMode` 分支、`:380` 的 `searchOpen` 分支在 `isEditableTarget` 之前执行），造成「清空笔记查询的同时退出框选模式 / 关掉 PDF 搜索面板」的越界副作用 |
| R11 起的新字面（逐字） | 「笔记搜索框内的 Esc 只清空查询并失焦；**该输入框内的 Esc 不触发阅读区任何 Escape 语义**（框选模式保持开启、PDF 搜索面板保持打开）」 |
| 实现层归属 | 由**持有输入框的组件**（`NotesPanel.vue`）阻断冒泡：`onSearchEsc(event: KeyboardEvent)` 在清空与 `blur()` 之后调用 `event.stopPropagation()`（等价写法 `@keydown.esc.stop`）。`PdfViewer.vue` 的分支顺序与语义**零改动** |
| 旧断言的更新方式 | ① 60-3（`notes-search|esc`）与 60-4（`notes-search|clear-button`）的**全部字段逐字保留**：`value` / `focused` / `rows` / `countText` / `clearInDom` 与「Esc 前 `focused:true`」的空断言防护一律不变，只要求继续通过；② 走查判据从 R10 的「面板内不出现 `stopPropagation`」改成本档 §0.3 的三条（唯一调用点、唯一监听点、无 `preventDefault`）；③ 新增 capability 断言落在 `r11-esc-scope` 组（N73-1） |
| 不受影响 | PDF 搜索框、页码输入框、chat composer 等其它输入框内的 Esc 一律保持既有语义（`PdfViewer` 的 `captureMode` 优先分支对它们仍然生效） |

### 0.3 笔记搜索框内 Esc 的唯一定义（N73-1 的行为矩阵）

| 焦点位置 | 阅读区状态 | 按 Esc 之后（R11 冻结） |
| --- | --- | --- |
| `.notes-search-input`（笔记搜索框） | 空闲 | 查询清空、输入框失焦；阅读区零变化 |
| `.notes-search-input` | 框选模式开启（`.capture-layer` 在 DOM） | 查询清空、输入框失焦；**`.capture-layer` 仍在 DOM、`.pdf-viewer` 仍含 `capture-mode` 类** |
| `.notes-search-input` | PDF 搜索面板开启（`.pdf-search-panel` 在 DOM） | 查询清空、输入框失焦；**`.pdf-search-panel` 仍在 DOM** |
| 非 `.notes-search-input`（阅读区 / body / PDF 搜索框） | 框选模式开启 | 退出框选模式（既有语义，逐字不变） |
| 非 `.notes-search-input` | PDF 搜索面板开启 | 关闭 PDF 搜索面板（既有语义，逐字不变） |

**实现层冻结（逐字）**

1. `onSearchEsc` 必须接收事件参数并调用 `event.stopPropagation()`：**恰 1 处调用**，且只在本函数体内（`grep -n "stopPropagation" NotesPanel.vue` ⇒ 1 命中，落在 `onSearchEsc` 内）。
2. 不得调用 `event.preventDefault()`（面板内 `preventDefault` 计数 0）。
3. 不得新增第二处键盘监听：面板内 `addEventListener("keydown"` 计数 0、模板 `@keydown` 计数 1（只在 `.notes-search-input` 上）。（本条替代 R10 审查 §4.2 指出的「`grep "Escape"` 会命中既有标识符 `showEscapeHatch`」这一无法判定的判据。）
4. `pix/src/renderer/components/workspace/PdfViewer.vue` 零改动（`:375` / `:380` / `:385` 的分支顺序与内容逐字不变）。
5. 注释逐字改写为：
   `/** Esc 只清空查询并交出焦点，并阻断冒泡：本输入框内的 Esc 不触发阅读区的 Escape 语义（框选模式 / PDF 搜索面板）。 */`

### 0.4 浮层隐藏的滚动来源判定（N73-2 唯一规则 + 逐元素判定表）

**唯一规则（冻结）**：唯一的 `document` 级 capture `scroll` 监听在处理时，**只有滚动事件的目标节点位于 `.reader-stage` 子树内**才隐藏浮层；其余来源一律不隐藏。

```
判定式（语义冻结，写法可细化但判别结果必须与此逐条一致）：
  const stage = resolveStage();
  if (!stage) return;                                  // 阅读区不存在 ⇒ 不隐藏
  if (!(event.target instanceof Node)) return;         // 非节点目标 ⇒ 不隐藏
  if (!stage.contains(event.target)) return;           // 目标不在 stage 子树内 ⇒ 不隐藏
  if (visible.value) hide();                           // 阅读区滚动 ⇒ 隐藏（既有语义）
```

**逐元素判定表（每个滚动源的结论必须与下表逐条一致）**

| # | 滚动容器 | 位置 / 声明 | 在 `.reader-stage` 子树内 | 滚动时是否隐藏浮层 | 依据 |
| --- | --- | --- | --- | --- | --- |
| 1 | `.pdf-scroll` | `PdfViewer.vue:990-994`（`:993` `overflow: auto`）；DOM 为 `.pdf-viewer` → `.reader-pdf` → `.reader-main` → `.reader-stage` | 是 | **隐藏** | 阅读区本体滚动（R4 起的既有语义，不得放松） |
| 2 | `.reader-content` | `ReaderPanel.vue:419-423`（`:421` `overflow-y: auto`，Markdown / 文本预览分支） | 是 | **隐藏** | 同一阅读列的内容位移 |
| 3 | `.map-tree` | `KnowledgeMap.vue:400-404`（`:403` `overflow-y: auto`）；`.knowledge-map-slot` 是 `.reader-stage` 的直接子节点（`ReaderPanel.vue:206-208`） | 是 | **隐藏** | 规则只按「在 stage 子树内」判定；不为地图列开第二处例外（否则要引入「哪些列算阅读区」的第二份枚举） |
| 4 | `.notes-panel` | `NotesPanel.vue:695` `overflow-y: auto`（左栏笔记面板；`WorkspacePage.vue:285` 挂载，`:434` 的 `.pane-body` 自身无 overflow） | 否 | **不隐藏** | **本轮修复目标**：R10 审查 §4.3 + `R10-dev.md` B.2 D1 实测「空态 → 列表」的面板滚动会把「已摘录」反馈吞掉 |
| 5 | `.panel-scroll` | `LibraryPanel.vue:205` `overflow-y: auto`（左栏资料库树） | 否 | **不隐藏** | 与阅读区无关 |
| 6 | `.chat-messages` | `ChatPanel.vue:1289` `overflow-y: auto`（右栏对话） | 否 | **不隐藏** | 与阅读区无关 |
| 7 | `document` / `html` / `body` 级滚动 | `assets/styles/main.css:16-20` `html, body { height: 100%; overflow: hidden }`；`WorkspacePage.vue:336` `overflow: hidden`；`AppLayout.vue` `.app-layout { overflow: hidden }` | 否（且**不可达**） | **不隐藏** | 不可达路径不写分支；判定式对该目标自然返回「不隐藏」 |
| 8 | `.pdf-search-panel` 内部 | `PdfSearchPanel.vue:432` `position: absolute`（在 `.pdf-viewer` 内 ⇒ 属 stage 子树） | 是 | 不适用 | 文件内无 `overflow: auto/scroll`（`:474` 的 `overflow: hidden` 只用于文本截断），**没有滚动源** |

**其余冻结项**

- 监听注册方式不变：仍是 `document.addEventListener("scroll", onStageScroll, true)`（capture）+ `onBeforeUnmount` 里的对称移除；**不得**改到 `.reader-stage` 上直挂（那会漏掉 `document` 级 capture 的既有覆盖面），也不得新增第二个 `scroll` 监听。
- `hide()` 的内容不变（清 `cachedText` / `selectionPage` / `mode` / `feedback` / 定时器）。
- `showFeedback` 的 `if (!visible.value) return` 保持不变（本轮不引入「隐藏后仍显示反馈」的第二套语义）。

### 0.5 取证脚本产物目录契约（N73-3）

| 项 | 冻结内容 |
| --- | --- |
| 启动清理点 | `main()` 内、`mkdirSync(OUT_ROOT, { recursive: true })`（`:5854`）之后、`writeFixtures()` 之前：`rmSync(SHOTS_DIR, { recursive: true, force: true })`；随后由既有的 `mkdirSync(SHOTS_DIR, { recursive: true })`（`:352`）重建目录 |
| 清理范围 | **只**删除 `join(OUT_ROOT, "shots")`。`OUT_ROOT` 下其它子项（`library` / `library-b` / `electron-userdata` / `vite-cache` / `stub-preload.cjs`）必须保留；不得删除 `OUT_ROOT` 本身；不得触碰 `%TEMP%` 之外的路径（由下一行启动守卫强制） |
| 启动守卫（冻结） | `main()` 的**第一条语句**（在任何 `app.setPath` / `mkdirSync` / `rmSync` 之前）：① `resolve(OUT_ROOT)` 必须严格位于 `resolve(os.tmpdir())` 之下——以 `tmpRoot + path.sep` 为前缀且不等于 `tmpRoot`（win32 下两侧先 `toLowerCase()` 归一）；② `resolve(OUT_ROOT)` 与 `PIX_DIR`（`:32`）互不包含——不在 `PIX_DIR` 子树内、不是其祖先、也不与其相等。任一不满足 ⇒ `console.error("[ui-shot] 拒绝启动：PIX_SHOT_ROOT 必须位于系统临时目录内，且不得与仓库路径互相包含（当前：" + <resolve 后的绝对路径> + "）")` + `app.exit(1)`；失败路径**零副作用**（不创建目录、不删除任何路径、不设 `userData`）。判定命令见 N73-3 验收判据「守卫负向控制」 |
| 唯一性 | `grep -c "rmSync(SHOTS_DIR" scripts/ui-shot.mjs` === 1（只有一个清理点，且必须先于一切 `capturePage()`） |
| 结束自检（脚本内，`MEASUREMENTS.json` 写完、`server.close()` 之前） | ① `shots/*.png` 的**文件集合**（按 basename）与 `MANIFEST.json.shots[].file` 的 basename 集合**双向相等**；② `SHOTS_DIR` 的一级条目中，除 `*.png` / `MANIFEST.json` / `MEASUREMENTS.json` 之外为 **0 个**。任一条不满足 ⇒ 追加到 `errors`（不覆盖既有 `failure` 文本）⇒ 退出码 1 |
| 自检失败文案（逐字） | ① `截图目录与清单不一致：磁盘 {N} 张 / 清单 {M} 张，差集 [{...}]`；② `截图目录存在白名单外条目：[{...}]` |
| 依赖 | `node:fs` 的既有顶层 import 行增 `readdirSync`（`:28`）；顶层增 `import { tmpdir } from "node:os"`（Node 内建，不新增依赖）；不加 `basename` / `sep` 之外的路径工具（`node:path` 已导入 `dirname, join, resolve`，按需增 `basename` / `sep`） |
| 与基线留档的关系 | 清理只作用于本次运行的 `OUT_ROOT`，因此「改前基线」（`PIX_SHOT_ROOT=<临时目录>/pix-v05-r11-base`）与「改后验收」（另一个 `OUT_ROOT`）必须使用**不同的** `PIX_SHOT_ROOT`；同目录重复运行会丢弃上一次的 `shots/`，这是本轮的意图（历史残留不再混放） |
| 冻结的不变项 | 失败截图 `99-failure-state.png` 仍由失败路径产出（并且会被 `capturePage()` 正常登记进 `shots`）；`MANIFEST.json` / `MEASUREMENTS.json` 的内容与字段不变 |

### 0.6 数据面烟测脚本契约（N75）

| 项 | 冻结内容 |
| --- | --- |
| 文件 | 新建 `pix/scripts/smoke-notes.mjs`（顶层静态 import；与 `ui-shot.mjs` 同为零依赖的 Node 脚本） |
| 运行入口 | 主入口 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes`；等价入口 `cd pix && PATH="/c/Program Files/nodejs:$PATH" node scripts/smoke-notes.mjs` |
| `package.json` 改动 | **只**在 `scripts` 增一键：`"smoke:notes": "node scripts/smoke-notes.mjs"`；其余字段（含 `dependencies` / `devDependencies` / `build` / `check`）逐字零改动；`package-lock.json` 零改动 |
| 编译面 | 用**仓库内** typescript（`pix/node_modules/typescript/lib/tsc.js`，实测 5.8.3）编译**仓库内源文件**（不得先复制到临时目录）：`%TEMP%/pix-smoke-notes-<时间戳>/tsconfig.smoke.json`（仓库外）中显式写 `rootDir` = `<repo>/pix/src`、`outDir` = `<TMP>/out`、`files` = [`<repo>/pix/src/main/notes-store.ts`, `<repo>/pix/src/main/library-root.ts`]、`module: "commonjs"`、`target: "ES2022"`、`strict: true`、`skipLibCheck: true`、`esModuleInterop: true`、`types: ["node"]`、`typeRoots: ["<repo>/pix/node_modules/@types"]`；`spawnSync(process.execPath, [tscJs, "-p", tmpTsconfig])` |
| 编译产物期望 | 必需：`out/main/notes-store.js`、`out/main/library-root.js`（`rootDir` = `<repo>/pix/src` ⇒ 路径保持 `main/…`）；允许附带 `out/shared/types.js`（`import type "../shared/types.js"` 的类型依赖，R10 A.4 实测的 3 文件形态）；出现其它路径的产物或必需产物缺失 ⇒ 直接判失败退出 1；`tsc` 退出码 ≠ 0 ⇒ 直接判失败退出 1 |
| 加载方式 | `createRequire(import.meta.url)` 加载编译产物；`notes-store.js` 的 `require("./library-root.js")` 与脚本自身的 `require(out/main/library-root.js)` 必须解析到**同一模块实例**（同一路径），从而 `setLibraryRoot` / `clearLibraryRoot` 对两侧同时生效 |
| 驱动面 | 只用真实文件系统：`setLibraryRoot(<TMP>/ws-a)` / `setLibraryRoot(<TMP>/ws-b)`、真实写坏 `notes.json`、把 `<root>/.pix-read/notes.json.tmp` 预置为目录造写失败；库内文档路径统一用 `<TMP>/ws-a/sample-paper.pdf`（**无需真实文件**：`isLibraryFilePath` 对缺失文件按在库内处理，`notes-store.ts` 把它存为相对路径 `sample-paper.pdf`，断言字面因此稳定）；**不得** mock `node:fs`、不得引入依赖、不得 import electron 或渲染层代码 |
| 断言组与条数（冻结） | 4 组共 **26 条**（见 §3 表格）：`undo-roundtrip` 8 条、`undo-failures` 8 条、`undo-slot-lifecycle` 6 条、`export-and-empty` 4 条。**不得减少**（可追加，追加必须在开发档登记） |
| 输出协议 | 每条一行：`[通过] <组名> #<序号> <一句话说明>` / `[失败] <组名> #<序号> <一句话说明>：<实际值>`；组内首行打印组名横幅；末尾汇总一行逐字 `通过 {passed} / 失败 {failed}` |
| 退出码 | 全部通过 ⇒ `0`；任一失败 ⇒ `1`（含编译失败、产物缺失、断言失败） |
| 自清理 | `finally` 内 `rmSync(<TMP>, { recursive: true, force: true })`；清理失败只打印 `[警告] 临时目录未清理：<path>`，**不改变**退出码，也不得把断言失败掩盖为成功 |
| 零仓库残留 | 运行结束后 `git status --short` 只能看到本轮白名单文件；脚本不得在仓库内写任何文件（含 `.pix-read/**`、`notes.md`、日志） |
| 与工程门的关系 | `pix/scripts/**` 不在 `tsconfig.json` 的 include 内（`:include` 只有 `src/renderer/**` 与 `src/shared/**`），因此新脚本与 `ui-shot.mjs` 同待遇：不进 `npm run check` 的类型面，正确性由「实跑 + 退出码」判定 |

### 0.7 回归基线数值（R11 动工前必须重新计数）

| 项 | R11 冻结口径 |
| --- | --- |
| 既有截图 | 以 R11 **动工前**在 `PIX_SHOT_ROOT=<临时目录>/pix-v05-r11-base` 实跑得到的 `MANIFEST.json.shots` 为准；R10 交付终态记录为 **112 张**（`R10-dev.md` 终 1/终 4）。R11 结束时既有 112 张**一张不少** |
| 既有测量 | 同上，以实跑的 `MEASUREMENTS.json` 为准；R10 交付终态记录为 **153 条**（`R10-dev.md:359` 逐字「MEASUREMENTS.json：153 条（上一交付 152 + 本轮 search-row-form 1）」、`:375` 逐字「唯一新增条目是本轮补强的 `search-row-form`；修复前 152 条一条不缺。」）。`R10-review.md:206` 的审查方独立复跑读到 **152 条**，是「搜索行冻结字面修复前」的时间点读数，与上述说明一致，不构成未解释的差额。动工前的实跑计数必须落进 R11 开发档，并以此为唯一基线（理由：**口径统一**到动工前实跑；R10 的 112/153 只在无法重跑时作为参考） |
| 新增配额 | 新增测量组 4 组（record 条数：`r11-esc-scope` 4 / `r11-quick-ask-scroll-scope` 3 / `r11-undo-after-empty` 3 / `r11-note-actions-narrow` 3 = **13 条**）；可选组 `r11-undo-scope-stale` 1 条；新增截图 **6 张**（可选再 +1 张） |
| 零缺失判据 | 基线 `shots` 的 basename 集合 ⊆ 验收运行的集合；基线 `MEASUREMENTS.json` 的 `label` 集合 ⊆ 验收运行的集合（既有 label 一条不少）；`MANIFEST.json.failure === null`、退出码 0 |
| 内容目视比对（N73-2 影响） | 面板复位（`scrollTop = 0`）后随即截图的 4 处可能因 N73-2 改变**可见内容**（浮层是否可见）：`ui-shot.mjs:1086`→`:1087` `02-notes-list.png`、`:1109`→`:1110` `03-notes-current-doc.png`、`:1243`→`:1244` `08-notes-after-excerpt.png`（前一拍 `:1235` 起为「已在笔记中」duplicate 反馈，浮层处于 `mode="feedback"`）、`:2561`（复位）→`:2599` `32-answer-note-badge.png`。开发档必须对这 4 张（至少 `08-notes-after-excerpt.png`）做改前（基线 `PIX_SHOT_ROOT`）/ 改后目视比对并登记结论：预期差异 = 浮层是否可见；若只有浮层差异，登记为 N73-2 的预期结果；出现任何其它内容差异 ⇒ 判回归失败 |
| 截图/测量的允许位移 | 与 R10 同口径：只允许「因新增行 / 新增控件导致的纵坐标位移」；`w/h/fontSize/color/background` 不得出现非预期差异（R10 审查 §4.1 的搜索行盒模型断言继续作为护栏） |

---

## 1. N73 必修缺陷（3 条）

### N73-1 笔记搜索框内 Esc 的语义越界

**用户可见行为**：焦点在左栏笔记搜索框时按 Esc，只把笔记查询清空并让输入框失焦；**不再**连带退出 PDF 框选模式、也不再关闭 PDF 搜索面板（当前实现会：`PdfViewer.vue:375` 的 `captureMode` 分支与 `:380` 的 `searchOpen` 分支都在 `isEditableTarget` 判定（`:385`）之前执行）。

**逐字冻结字面**

| 项 | 值 |
| --- | --- |
| 改动点 | `pix/src/renderer/components/workspace/NotesPanel.vue` 的 `onSearchEsc`（`:200-204`）与模板 `:435` |
| 新注释（逐字） | `/** Esc 只清空查询并交出焦点，并阻断冒泡：本输入框内的 Esc 不触发阅读区的 Escape 语义（框选模式 / PDF 搜索面板）。 */` |
| 方法签名 | `function onSearchEsc(event: KeyboardEvent): void`（调用 `event.stopPropagation()`；**不** `preventDefault()`） |
| 保留行为 | 先 `notesStore.clearSearchQuery()`、再 `searchInputRef.value?.blur()`（顺序与 R10 一致，逐字不变） |
| 模板 | `@keydown.esc="onSearchEsc"`（绑定对象仍是既有 `.notes-search-input`；`v-if` 门控、`placeholder` 与盒模型零改动） |
| 不改 | `pix/src/renderer/components/workspace/PdfViewer.vue`（`:356-385` 的 `onWindowKeydown` 逐字零改动）；不得新增 window/document 级键盘监听 |

**验收判据**

| 面 | 判据 |
| --- | --- |
| 【走查】 | §0.3 的 5 条实现层冻结逐条命中：`stopPropagation` 恰 1 处且在 `onSearchEsc` 内、`preventDefault` 0 处、`addEventListener("keydown"` 0 处、模板 `@keydown` 1 处、`PdfViewer.vue` 零 diff |
| 【check】 | `CHECK_EXIT=0` |
| 【离屏·旧断言保留】 | `notes-search|esc`（60-3）与 `notes-search|clear-button`（60-4）全部字段逐字不变且继续通过；`notes-search` 组既有 10 条 record 一条不减 |
| 【离屏·新断言】 | 组 `r11-esc-scope`（4 条 record，两场景 `r11-1` / `r11-2`，见 §0.3 矩阵）全绿，2 张截图齐备 |

**场景 `r11-1`（PDF 搜索面板开启态）**

前置：`enterNotesProbe()`（标准 4 条种子、sample-paper.pdf 第 1 页、面板就绪、搜索框已清空）→ 点击 `.pdf-toolbar` 内 `title="在文档中搜索"` 的按钮 → `waitFor(".pdf-search-panel")`。

| 相位 | 步骤 | 失败即红的断言 |
| --- | --- | --- |
| `pdf-search-open` | `setSearch("Table")`（沿用既有 helper，先 `focus()`）→ 读探针 → 派发 `pressSearchEsc()`（合成 `KeyboardEvent("keydown", { key: "Escape", bubbles: true })`）→ 读探针 | ① 派发前 `focused === true`（空断言防护）；② `.pdf-search-panel` 仍在 DOM；③ `value === ""`；④ `focused === false`；⑤ `rows === 4`；⑥ `countText === "共 4 条"`；⑦ `notesHash()` 与场景开始前相等 |
| `pdf-search-close-control` | 在 `document.body` 上派发同款 Escape | ⑧ `.pdf-search-panel` 退出 DOM（证明 `PdfViewer` 的既有语义未被改坏） |

截图：`r11-1-esc-pdf-search-panel.png`（相位 `pdf-search-open` 断言通过后立即采集，同框可见笔记搜索框空值 + PDF 搜索面板仍在）。

**场景 `r11-2`（框选模式开启态）**

前置：`enterNotesProbe()` → 点击 `.pdf-capture-fab` 内按钮进入框选模式。

| 相位 | 步骤 | 失败即红的断言 |
| --- | --- | --- |
| `capture-mode` | 断言进入态 → `setSearch("Table")` → 派发 `pressSearchEsc()` → 读探针 | ① 进入后 `.capture-layer` 在 DOM 且 `.pdf-viewer` 含 `capture-mode` 类（空断言防护）；② 派发前 `focused === true`；③ Esc 后 `.capture-layer` **仍在 DOM**；④ `.pdf-viewer` **仍含** `capture-mode`；⑤ `value === ""`；⑥ `focused === false`；⑦ `rows === 4`；⑧ `notesHash()` 不变 |
| `capture-mode-exit-control` | `setSearch("")` 后在 `document.body` 上派发同款 Escape | ⑨ `.capture-layer` 退出 DOM；⑩ `.pdf-viewer` 不再含 `capture-mode`；⑪ 字节仍与场景开始前相等 |

截图：`r11-2-esc-capture-mode.png`。

**文件白名单条目**：`pix/src/renderer/components/workspace/NotesPanel.vue`（修改）；`pix/scripts/ui-shot.mjs`（新增场景与断言组）。

---

### N73-2 摘录反馈被无关滚动吞掉

**用户可见行为**：在 PDF 里选中文字点「摘录」，浮层显示「已摘录 · 第 N 页」；此时左栏笔记面板从空态切到列表（或用户滚动左栏 / 右栏 / 资料库树），反馈**不再**被吞掉，浮层保持可见直到自身 2.5 秒定时器到期或阅读区真的滚动。

**逐字冻结字面**：§0.4 的唯一规则 + 逐元素判定表；`onStageScroll` 的判定式；`hide()` / `showFeedback` / 监听注册方式零改动；`.quick-ask` / `.quick-ask-feedback` / `.is-ok` / `.is-duplicate` / `.is-error` 类名与 `FEEDBACK_MS = 2500` 常量零改动。

**验收判据**

| 面 | 判据 |
| --- | --- |
| 【走查】 | §0.4 表格 8 行逐条与实现一致（含 `.map-tree` 会隐藏、`document` 级不可达）；`scroll` 监听恰 1 处且仍为 capture；`stage.contains(` 是该函数里唯一的新判据 |
| 【check】 | `CHECK_EXIT=0` |
| 【离屏】 | 组 `r11-quick-ask-scroll-scope`（3 条 record，场景 `r11-3`）全绿 + 截图 `r11-3-excerpt-feedback-visible.png` |
| 【离屏·旧断言保留】 | **60-9 的全部既有断言逐字保留**（计数三步 3/2/1、删空后 `.notes-empty` + 搜索/排序行不在 DOM、摘录后查询原样 `消融` / `命中 0 条 / 共 1 条` / 空态 `没有匹配「消融」的笔记`）；`excerptFirstSpan`（`ui-shot.mjs:4949-4954`，注释块 `:4949-4953`）的**注释**必须改写为 R11 口径（说明「面板滚动不再隐藏浮层」），其行为（文件条数 + 面板回位）保留；面板滚动的**新**断言放在 `r11-3`，不替换 60-9 的任何判据 |
| 【离屏·追加】 | 60-9 内**追加**（不替换）一条：摘录完成后 `.quick-ask-feedback.is-ok` 文本逐字 `已摘录 · 第 1 页`（有界等待 ≤1500 ms；这是 R10 只能登记、无法断言的那条） |
| 【离屏·内容目视】 | §0.7「内容目视比对（N73-2 影响）」：4 张复审截图（至少 `08-notes-after-excerpt.png`）的改前 / 改后目视结论必须在开发档逐张登记，差异只允许是「浮层是否可见」 |

**场景 `r11-3`（空态 → 列表的滚动 + 滚动来源矩阵）**

前置：`enterNotesProbe([], 0)`（0 条种子；断言 `.notes-empty` 在 DOM、`.notes-search` 行**不在** DOM，防空断言）。

| 相位 | 步骤 | 失败即红的断言 |
| --- | --- | --- |
| `excerpt-into-empty-panel` | `selectPageSpan(1)` → 点击 `.quick-ask-btn` 中文本含「摘录」的按钮 → 等 `readNotes().length` 由 0 变 1（≤20 s 轮询）→ `waitFor(".notes-search-input" 回到 DOM)` → 有界等待 `.quick-ask-feedback.is-ok` | ① 面板确已从空态切到列表（`.notes-search` 行在 DOM、`rows === 1`）；② `.quick-ask` 的 computed `display !== "none"`；③ `.quick-ask-feedback` 元素带 `is-ok` 类，文本逐字 `已摘录 · 第 1 页` |
| `notes-panel-scroll` | 在 `.notes-panel` 上派发合成 `scroll` 事件（`new Event("scroll")`，不冒泡；`document` 级 capture 监听可收到，`event.target` = `.notes-panel`） | ④ 派发后 `.quick-ask` 仍 `display !== "none"`；⑤ 反馈文本仍逐字 `已摘录 · 第 1 页`；⑥ 文件条数仍 1、`notesHash()` 不变（滚动不改数据） |
| `reader-scroll-control` | ① 读 `.pdf-scroll` 的 `scrollHeight` / `clientHeight`；达不到 `scrollHeight > clientHeight + 40` 时点 `.pdf-toolbar` 的 `title="放大"` 按钮（`zoomBy(+0.1)`，`PdfViewer.vue:846`）逐档放大，**达到可滚动即停止**、不得超过 `MAX_SCALE`（3，`reader-store.ts:21`）；放大到上限仍不可滚动 ⇒ 该相位直接判失败（不得降级为跳过）。把实际 `scrollHeight` / `clientHeight` 与 `.zoom-label` 读到的 scale 写入 `data` 作空断言留档。② 放大完成后复读一次 `.quick-ask` 的 computed `display !== "none"`（前置防空断言；若此时已被隐藏，说明放大动作触发了 scroll 事件，开发档必须登记原因并把放大时机改到反馈出现之前，不得让 ⑧ 建立在此种假绿上）→ 记录 `scrollTopBefore === 0` → `scrollTop = 200` → `waitFor(".quick-ask" 隐藏)` | ⑦ `scrollTop` 确实由 0 变为 > 0（防空断言）；⑧ `.quick-ask` 的 computed `display === "none"`（既有语义未放松）；⑨ 文件条数仍 1、`notesHash()` 不变 |

截图：`r11-3-excerpt-feedback-visible.png`（相位 `excerpt-into-empty-panel` 之后，同框可见笔记搜索行、1 行列表与浮层「已摘录 · 第 1 页」）。

**文件白名单条目**：`pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`（修改）；`pix/scripts/ui-shot.mjs`（新增场景与断言组、60-9 追加断言、`excerptFirstSpan` 注释更新）。

---

### N73-2b（追加 · 负责人裁决）同文本 `selectionchange` 不得重置摘录反馈

> 来源：`docs/pm/R11-dev.md`「## 修复轮（R11 代码审查 must-fix 处置）」修复轮.1（**两次独立实跑**：`+42` 出现 `quick-ask-feedback is-ok` 反馈、`+43` 被原生 `selectionchange` → `showFor` 重置为 actions，反馈态实测仅存在约 1 ms；静默窗放宽到 600 ms 后仍复现 ⇒ 排除「点击前遗留的补派事件」）；`docs/pm/R11-review.md`「代码审查（R11）」§3 must-fix 1（D1）与 §5（两条出路）。
> 裁决：**② —— 把它作为 N73-2 的组成部分修掉**（书面裁决逐字落档于 `docs/pm/R11-review.md`「## 追加裁决（R11）」）。本小节是 N73-2 的**追加组成部分**：N73-2 修的是「哪些滚动来源会隐藏浮层」，本小节修的是**第二条独立通道** —— 摘录入库引发的 DOM 更新在点击后约 2 ms 带出一次 `selectionchange`，经 `onSelectionChange` → `showFor` 把反馈态重置为 actions。两者不可互相覆盖；合起来才使「首条摘录的『已摘录 · 第 N 页』反馈必须可见」这一用户可见目标成立。与 N73-2 主条冲突时以本小节为准。

**用户可见行为**：在 PDF 里选中文字点「摘录」，浮层显示「已摘录 · 第 N 页」；此后即使笔记面板因本次入库发生 DOM 更新（带出一次**选区未变**的 `selectionchange`），反馈**保持可见**，直到自身 2.5 秒计时到期（到期后回落为「问 AI / 摘录」双按钮态）或阅读区真的滚动。只有**选区真的变了**（文本不同）、选区折叠/清空、锚点离开 `.reader-stage` 时，才按既有语义重置或隐藏。

**冻结语义（N73-2b，逐字）**

> 在反馈态可见期间（`mode === feedback`、`visible === true`），若到达的 `selectionchange` 解析出的选区文本与 `cachedText` 相同（trim 后逐字相等）且未折叠、锚点在 stage 内，则**保持反馈态**（不重置 `mode`、不清 `feedback`、不重算几何、不重开反馈计时器）；选区变化（文本不同）、选区折叠/清空、锚点离开 stage 时仍按既有语义重置或隐藏。**不得**改动 `showFor` 的几何钳制、`FEEDBACK_MS`、反馈文案与既有隐藏规则。

**冻结语义分解（7 条，逐条可判）**

| # | 条 | 逐字内容 |
| --- | --- | --- |
| S1 | 触发域 | 只当 `mode === "feedback"` **且** `visible === true` 时适用；actions 态下的同文本 `selectionchange` 仍走既有 `showFor`（本轮不改其行为）。 |
| S2 | 保态条件（三条同时成立） | （a）到达事件解析出的选区文本与 `cachedText` **trim 后逐字相等**；（b）选区**未折叠**；（c）锚点在 `.reader-stage` 子树内。 |
| S3 | 保态内容（四项不变） | 不重置 `mode`、不清 `feedback`、**不重算几何**（不进入 `showFor` 的定位钳制）、**不重开反馈计时器**。 |
| S4 | 未覆盖的行为（既有语义逐条保留） | ① 文本不同 ⇒ `showFor` 重置为 actions 态并重算几何；② 选区折叠 / 清空 / `rangeCount === 0` / 无 `filePath` ⇒ `hide()`；③ 文本 trim 后 < `MIN_SELECTION_CHARS` ⇒ `hide()`；④ 锚点不在 stage 内 ⇒ `hide()`；⑤ 阅读区（`.reader-stage` 子树内）滚动 ⇒ `hide()`（N73-2）。 |
| S5 | 位置 | 新判据只出现在 `onSelectionChange` 内，且位于三条 `hide()` 守卫**之后**、`showFor` 调用**之前**；守卫链的顺序与内容逐字不变。 |
| S6 | 计时语义 | 反馈仍在 `FEEDBACK_MS = 2500` 后自然回落为 actions 态；保态**既不延长也不缩短**该窗口（不得重开计时器、不得改常量）。 |
| S7 | 不得改动项 | `showFor` 的几何钳制与 `cachedText` 赋值、`FEEDBACK_MS`、反馈文案（`已摘录 · 第 N 页` / `已在笔记中` / `摘录失败：…`）与类名（`.quick-ask-feedback` / `.is-ok` / `.is-duplicate` / `.is-error`）、`hide()` 的五项清理、`showFeedback` 的首行守卫（`if (!visible.value) return`）、`onStageScroll` 的判定式与监听注册方式、`watch(filePath)` 的隐藏语义。 |

**验收判据**

| 面 | 判据 |
| --- | --- |
| 【走查】 | `onSelectionChange` 内新增分支恰 1 处、判据三项顺序 S1→S2(a/b/c) 与设计档逐条一致；`showFor` / `hide` / `showFeedback` / `FEEDBACK_MS` / `onStageScroll` / 监听注册零 diff；`closest(` 仍 0 处 |
| 【check】 | `CHECK_EXIT=0` |
| 【离屏·(a)】 | **60-9 恢复需求原字面**：在既有 `record("notes-search", { phase: "delete-all-then-excerpt" })` 内**追加**（不替换）`.quick-ask-feedback.is-ok` 逐字 `已摘录 · 第 1 页`、有界等待 ≤1500 ms；修复后**必须为绿**（修复前该组合实测采不到，见 D1） |
| 【离屏·(b)】 | 场景 `r11-3` 追加相位 4 `spurious-selectionchange`（5 条断言）与相位 5 `different-text-reset`（4 条断言）全绿 + 截图 `r11-3b-feedback-after-spurious-selectionchange.png` |
| 【离屏·(c)】 | **既有断言零缺失**：`r11-3` 既有相位 1/2/3、`notes-search\|esc`（60-3）、`notes-copy\|geometry`（65-5）、`notes-search\|delete-all-then-excerpt` 的既有判据等全部继续绿；112 张既有截图 / 153 条既有 label 零缺失 |

**场景 `r11-3` 追加相位（组 `r11-quick-ask-scroll-scope`：3 条 record → **5 条 record**；既有 3 个相位逐字不动，新相位追加在其后）**

相位 4 `spurious-selectionchange`（自足前置：不依赖相位 1 的反馈存活）

| 步骤 | 失败即红的断言 |
| --- | --- |
| 前置：把第 2 页带进渲染窗口（`scrollIntoView`，该滚动会隐藏浮层 —— 既有语义，故必须先做）→ `selectPageSpan(2)`（第 2 页文本层首个 span；第 1 页首个 span 已在相位 1 摘录过，再摘会命中 duplicate 分支，得不到 `is-ok`）→ 点 `.quick-ask-btn` 中文本含「摘录」的按钮 → 轮询 `readNotes().length` 由 1 变 2（≤20 s）→ `waitFor` 面板回位 → `waitFeedbackOk(1500)`（记 `t0`） | **B1** 前置/防空断言：反馈态可见（`display !== "none"`、class 含 `is-ok`、文本逐字 `已摘录 · 第 2 页`）；且「同文本」现场成立：选区未折叠、锚点在 `.reader-stage` 内、选区文本逐字等于第 2 页文本层首个 span 的归一化文本；且 `dispatchAtMs ≥ 900`（可判别性下限，见设计档；不足时有界补齐） |
| 派发一次与当前选区文本**相同**的 `selectionchange`（合成事件 `document.dispatchEvent(new Event("selectionchange"))`，**不改选区**）→ `repaint` → 立即探针 → 截图 `r11-3b-feedback-after-spurious-selectionchange.png` | **B2** 仍为反馈态：`display !== "none"`、class 含 `is-ok`、文本仍逐字 `已摘录 · 第 2 页`、`.quick-ask` 内 `.quick-ask-btn` 数 = 0（动作行未渲染） |
| 再等 600 ms（< `FEEDBACK_MS`）→ 复采 | **B3** 仍为反馈态（同 B2 四项）——即负责人判据 (b) 的「再等 < `FEEDBACK_MS` 后仍为反馈态」 |
| 有界等到反馈元素退出（`feedbackClass === null`），记 `feedbackGoneAtMs = 该时刻 − t0` | **B4** 计时未被重置：`feedbackGoneAtMs ≥ FEEDBACK_MS - 600` **且** `≤ dispatchAtMs + FEEDBACK_MS - 300`（后者即「早于被重置后的到期时刻」；计时被重开时该值 ≥ `dispatchAtMs + 2200` ⇒ 必红；到 `t0 + FEEDBACK_MS + 700` 仍未退出亦判红） |
| 探针复采 | **B5** 到期后回落 actions 态且浮层仍在：`feedbackClass === null`、`.quick-ask` 内 `.quick-ask-btn` 数 = 2、`display !== "none"`（选区未变 ⇒ 既有语义：回到双按钮）；文件仍 2 条、`notesHash()` 不变 |

相位 5 `different-text-reset`（对照组：证明保态是**有条件**的）

| 步骤 | 失败即红的断言 |
| --- | --- |
| 前置：把第 3 页带进渲染窗口（同上）→ `selectPageSpan(3)` → 点「摘录」→ 轮询文件条数 2 → 3（≤20 s）→ `waitFeedbackOk(1500)` | **C1** 前置/防空断言：反馈态可见（class 含 `is-ok`、文本逐字 `已摘录 · 第 3 页`）、文件确为 3 条 |
| 派发**不同文本**的 `selectionchange`：`selectPageSpan(2)`（真实 DOM 选区变更 + 合成 `selectionchange`）→ `repaint` → 立即探针 | **C2** 反馈被重置：`feedbackClass === null` 且 `feedbackText === null` |
| 同上，复采 | **C3** 浮层仍可见且回到 actions 态：`display !== "none"`、`.quick-ask` 内 `.quick-ask-btn` 数 = 2 |
| 同上，复采选区与文件 | **C4** 数据与选区现场：文件仍 3 条、`notesHash()` 不变；选区文本逐字等于第 2 页文本层首个 span 的归一化文本、未折叠、锚点在 `.reader-stage` 内 |

**断言编号与条数（与设计档同口径，共 12 条）**

| 编组 | 条数 | 编号 | 归属 |
| --- | --- | --- | --- |
| 60-9 追加（判据 (a)） | 3 | **A1** / **A2** / **A3** | 既有 `notes-search` / `delete-all-then-excerpt` record 的 `failures`（只追加；`data` 增 `excerptFeedback`） |
| 相位 4 `spurious-selectionchange`（判据 (b)） | 5 | **B1**–**B5** | 新 record（组 `r11-quick-ask-scroll-scope`） |
| 相位 5 `different-text-reset`（判据 (b) 的对照） | 4 | **C1**–**C4** | 新 record（同组） |
| 合计 | **12** | —— | 新增截图 1 张；既有断言与截图零缺失（判据 (c)） |

**文件白名单条目**：`pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`（修改：`onSelectionChange` 增 1 条早退分支）；`pix/scripts/ui-shot.mjs`（修改：60-9 追加断言、`r11-3` 追加 2 个相位与新增 helper、两处 D1 注释按 N73-2b 口径改写）。

---

### N73-3 取证脚本启动清理与产物自检

**用户可见行为**（对使用取证脚本的开发者）：每次运行 `ui-shot.mjs` 后，截图目录里只有**本次运行**的产物；历史失败残留（如 `99-failure-state.png`）不再与新产物混放；运行结束时脚本自己核对「目录内容 === 清单内容」并在不一致时以退出码 1 报警。

**逐字冻结字面**：§0.5 全表（启动清理点、清理范围、**启动守卫**及其逐字失败文案、唯一性、结束自检两级判据、逐字失败文案、`readdirSync` / `node:os` import、基线目录隔离要求）。

**验收判据**

| 面 | 判据 |
| --- | --- |
| 【走查】 | `rmSync(SHOTS_DIR` 恰 1 处且位于 `mkdirSync(OUT_ROOT)` 之后、`writeFixtures()` 之前；`SHOTS_DIR` 之外零删除；**启动守卫**逐条命中 §0.5（`main()` 第一条语句；`node:os` 的 `tmpdir` 归属校验；与 `PIX_DIR` 互不包含；`app.exit(1)` 分支位于 `rmSync(SHOTS_DIR` 之前——`grep -n` 可判）；结束自检位于两个 JSON 写完之后、`server.close()` 之前 |
| 【离屏·守卫负向控制】 | 开发档必须实跑并留档：先 `test ! -e <仓库外的非临时目录路径>`（例如 `E:/develop/pix-shot-guard-probe`）确认该路径不存在 ⇒ `cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=<该路径> ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "EXIT=$?"` ⇒ 期望 `EXIT=1` + §0.5 逐字守卫失败文案，且再次 `test ! -e <该路径>` 证明**未被创建**（守卫失效导致被创建时：删除该路径、修守卫、重跑；本测试只用仓库外路径） |
| 【check】 | `CHECK_EXIT=0` |
| 【离屏·自检判据】 | 成功运行（退出码 0、`failure === null`）：`shots/*.png` basename 集合 === `MANIFEST.json.shots[].file` basename 集合；`SHOTS_DIR` 一级条目除 `*.png` / `MANIFEST.json` / `MEASUREMENTS.json` 外为 0 个 |
| 【离屏·预置残留复核】 | 手工在 `<OUT_ROOT>/shots/` 预置 `99-failure-state.png` 与 `zz-stale.png` 两个假残留 → 运行一次 → 两个文件均不存在，且上述两条判据仍成立（这条必须在开发档里以真实命令 + 原始输出留档） |
| 【离屏·零缺失】 | 112 张既有截图（或基线实测值）零缺失；`MEASUREMENTS.json` 既有 label 零缺失 |

**文件白名单条目**：`pix/scripts/ui-shot.mjs`（修改）。

---

## 2. N74 回归断言补齐（3 条）

> 来源：`R10-review.md`「代码审查（R10）」§5.1（删空最后一条后的撤销行）、§5.2（`undoScope` 守卫无运行时场景）、§4.4（`.note-copy` 窄栏溢出未覆盖）。三条都只**补断言**，除 N74-2 的「修 or 不修」边界外不改产品行为。

### N74-1 删空最后一条后撤销行仍在且撤销成功

**用户可见行为**：删掉工作区里最后一条笔记后，面板进入空态，但撤销行仍在（`.notes-undo`），点「撤销」能把这条笔记真实还原（列表回到 1 行、文件字节回复删除前）。

**逐字冻结字面**：`.notes-undo` / `.undo-text` / `.notes-undo-btn` 类名；撤销行文案模板 `已删除「{snippet}」· 第 {page} 页`（`snippet` = 原文前 12 字符 + `…`，R10 口径）；撤销成功通知逐字 `已还原该条笔记`；`.notes-empty .empty-title` 逐字 `还没有摘录`、`.notes-empty .empty-subtitle` 逐字 `在 PDF 中选中文字，点「摘录」保存到这里`（读取节点冻结：`.notes-empty` 是容器，本体只作「在 DOM」判定）；单条种子 = 既有 `seedNotes()` 的第 1 条（`id = n-current-1`，文本 `We study retrieval over long documents where the attention budget is the binding constraint.` ⇒ `snippet` 逐字 `We study ret…`，`page = 1`）。

**验收判据**：【离屏】组 `r11-undo-after-empty`（3 条 record，场景 `r11-4`）全绿 + 截图 `r11-4-undo-row-after-empty.png`；【走查】面板的 `v-if="notesStore.pendingUndo"` 与 `hasNotes` / `status` 无耦合（本轮不得新增耦合）。

**场景 `r11-4`**

| 相位 | 步骤 | 失败即红的断言 |
| --- | --- | --- |
| `before-delete` | `enterNotesProbe(seedNotes().slice(0, 1), 1)` → 记 `hashBefore = notesHash()` | ① `rows === 1`；② `countText === "共 1 条"`；③ `.notes-empty` 不在 DOM（空断言防护） |
| `after-delete-empty` | `deleteRowByText("We study retrieval")`（既有两次点击手法） | ④ `rows === 0`；⑤ `.notes-empty` 在 DOM，且 `.notes-empty .empty-title` 逐字 `还没有摘录`、`.notes-empty .empty-subtitle` 逐字 `在 PDF 中选中文字，点「摘录」保存到这里`；⑥ `countText === "共 0 条"`；⑦ **`.notes-undo` 仍在 DOM**（本轮核心断言）；⑧ `.undo-text` 逐字 `已删除「We study ret…」· 第 1 页`；⑨ `.notes-undo-btn` 文本逐字 `撤销`、`title` 逐字 `还原这条笔记`；⑩ `notesHash() !== hashBefore`（删除已真实落盘） |
| `restored` | 点击 `.notes-undo-btn` | ⑪ `rows === 1`；⑫ `.notes-empty` 退出 DOM；⑬ `.notes-undo` 退出 DOM；⑭ `.notes-notice.is-success` 文本逐字 `已还原该条笔记`；⑮ `notesHash() === hashBefore`（字节级回复）；⑯ `.notes-search` 行回到 DOM（`ready && hasNotes` 的自然结果） |

截图：`r11-4-undo-row-after-empty.png`（相位 `after-delete-empty` 断言通过后采集，同框可见 `.notes-empty` 与撤销行）。

**文件白名单条目**：`pix/scripts/ui-shot.mjs`（新增场景与断言组）。产品代码零改动。

---

### N74-2 左栏极窄时 `.note-copy` 所在的 `.note-actions` 不溢出（含「修 or 不修」边界）

**用户可见行为**：把左栏压到产品自身支持的窄宽（220px）时，笔记行内的动作区（`复制` + `追问`）仍在一行内、不被裁切、不横向溢出。

**实测判定（逐条冻结）**

| 待测项 | 判定式 |
| --- | --- |
| 窄宽已生效（防空断言） | `.layout-left` 的 `getBoundingClientRect().width` ∈ [218, 222]（`AppLayout.vue:117-118` 用 `var(--pix-left-width)`；场景通过 `document.documentElement.style.setProperty("--pix-left-width", "220px")` 施加，该值就是 `AppLayout.vue` 窄屏分支（`@media (max-width: 959px)`）自带的 220px） |
| 动作区不溢出（end 侧） | `actions.scrollWidth - actions.clientWidth <= 1`（只覆盖 end 侧：`justify-content: flex-end` 下 start 侧溢出不会抬高 `scrollWidth`，需要下一行补齐） |
| 动作区不溢出（start 侧，新增） | `actions.left >= body.left - 1`，且 `.note-copy` / `.note-ask-wrap` 各判一次 `left >= actions.left - 1`（矩形一律取 `getBoundingClientRect()`；`body` = 该行 `.note-body`，其 CSS 无内边距，`:1173-1179`） |
| 动作区右侧不越界 | `.note-copy` / `.note-ask-wrap` / `.note-actions` 三者的 `right` 均 `<= .layout-left` 的 `right + 1` |
| 未换行（仍是一行） | `.note-copy` 与 `.note-ask-wrap` 的 `y` 差 `<= 1`；且 `.note-actions` 的 `h ≤ T`，`T = 1.5 × max(fontSize × 1.5)`（`fontSize` 取行内文本节点 `.note-text` / `.note-copy` 的 computed 值，`:1266-1269` / `:1347-1355`）⇒ 本轮取 `.note-text`（12px）⇒ `T = 1.5 × 12 × 1.5 = 27px`；开发档必须把实际取的节点、`fontSize` 与 `T` 写入 `data` |
| DOM 关系不变 | `.note-copy` 是 `.note-actions` 的第一个元素子节点、`.note-ask-wrap` 在其后；`.note-actions` 仍是 `.note-body` 的最后一个子节点（与 R10 65-5 同口径） |
| 复位 | 场景结束时 `document.documentElement.style.removeProperty("--pix-left-width")`，并断言 `.layout-left` 宽度回到 268px（默认值，`assets/styles/variables.css:112`），避免污染后续场景 |

**「修 or 不修」边界（冻结）**

| 条件 | 处理 |
| --- | --- |
| 220px（产品可达最窄值）下**任一**判定项为红 | **必须修**：最小改法限定在 `NotesPanel.vue` 的样式面（首选 `.note-actions { flex-wrap: wrap }` 或等价的收缩/换行策略），**不得**改类名、不得改文案、不得改 DOM 顺序、不得删 `复制` 或 `追问` 任一入口；修完必须重跑 §0.7 的零缺失比对（位移允许，`w/h/fontSize/color/background` 非预期差异不得出现） |
| 220px 下全部判定项为绿 | **不修**：保留断言作为回归护栏，并在开发档登记「测定不溢出，不修」 |
| 160px 及更窄（产品不可达：`AppLayout` 只提供 `var(--pix-left-width)` = 268px 与窄屏 220px 两档） | **不判、不修**：登记为已知限制（写在开发档的「未覆盖」清单里），不为其加第三套断言 |
| 场景本身不可达（如 `.note-actions` 无法在窄栏下渲染） | 视为判据不可判定 ⇒ 开发档必须写明原因，且不得以「改用其它元素」的方式降级断言 |

**验收判据**：【离屏】组 `r11-note-actions-narrow`（3 条 record，场景 `r11-5`）全绿 + 2 张截图（`r11-5-note-actions-narrow.png`、`r11-5b-note-actions-narrow-row.png`）；【走查】若发生修复，`git diff` 只落在 `NotesPanel.vue` 的样式面。

**场景 `r11-5`**

| 相位 | 步骤 | 失败即红的断言 |
| --- | --- | --- |
| `default-width` | `enterNotesProbe(seedNotes().slice(0, 2), 2)`（两个 `.note-actions` 各含 `.note-copy`） | ① `.layout-left` 宽 = 268 ± 2；② 两个动作区 `scrollWidth - clientWidth <= 1`（既有 1600×1000 下的既有结论复现） |
| `narrow-220` | `setProperty("--pix-left-width", "220px")` → 等一拍（`repaint`） | ③ 窄宽已生效 218–222；④ 上表「动作区不溢出（end 侧）」+「动作区不溢出（start 侧）」；⑤ 上表「动作区右侧不越界」；⑥ 上表「未换行（阈值 27px）」；⑦ 上表「DOM 关系不变」 |
| `restored-width` | `removeProperty("--pix-left-width")` → 等一拍 | ⑧ 宽度回到 268 ± 2；⑨ 动作区 `scrollWidth - clientWidth <= 1` |

截图：`r11-5-note-actions-narrow.png`（整左栏，`rectOfSelector(".layout-left", 2)`）、`r11-5b-note-actions-narrow-row.png`（该行裁剪，`rectOfSelector(".note-row", 2)`）。

**文件白名单条目**：`pix/src/renderer/components/workspace/NotesPanel.vue`（**仅当 220px 实测溢出时**修改样式面）；`pix/scripts/ui-shot.mjs`（新增场景与断言组）。

---

### N74-3（可选）`undoScope` 守卫的运行时场景

> 代价可控才做；不阻塞验收。R10 审查 §5.2 与 `R10-dev.md` B.6 第 1 条都只给走查结论（`resetNotes()` 在 `pendingUndo = null` 之前 `undoScope += 1`；`undoDelete` 在 `await` 之后的第一个判断就是 scope 比对，`stores/notes-store.ts:229-233`）。

**前置条件（不满足则本轮不做）**：能用 stub 的 `setNotesRestoreDelay(ms)`（既有控制口）造出「响应晚于重新进入工作区后面板就绪」的时序，且用 stub 记录的响应时刻做空断言防护（stub 增记 `resolvedAt`）。冻结建议值 `NOTES_RESTORE_DELAY_MS = 6000`（必须 ≥ 实测的「goHome → 重回工作区 → 面板就绪」耗时 + 2000 ms 余量）。

**场景 `r11-6`（label 组 `r11-undo-scope-stale`，1 条 record）**

| 步骤 | 断言 |
| --- | --- |
| ① 面板就绪 4 条 → 删 1 条（文件 3 条、撤销行出现）；② `setNotesRestoreDelay(6000)` → 点 `.notes-undo-btn`（IPC 在途；stub 在延迟**之前**已写回文件 ⇒ 文件 4 条）；③ 立刻 `goHome()`（`WorkspacePage` 卸载 ⇒ `resetNotes()` ⇒ `undoScope += 1`）；④ 直接改写库内 `notes.json` 为「另两条」（模拟外部改动）；⑤ 重回工作区并打开笔记面板（读到 2 行）；⑥ `await sleep(6500)` 等迟到响应到达 | ① `restoreCalls` 增量恰 1（证明确有在途响应，防空断言）；② stub 记录的 `resolvedAt` > ⑤ 完成时刻（证明响应确实晚于面板就绪）；③ ⑥ 之后 `rows` 仍为 2 且行文本等于第 ④ 步写入的那两条；④ `countText === "共 2 条"`；⑤ 屏幕无任何 `.notes-notice`（迟到响应零副作用）；⑥ `notesHash()` 与第 ④ 步写完后相等 |

截图：`r11-6-stale-scope.png`。

**若不做**：必须在 R11 开发档登记「不覆盖 + 理由（例如无法稳定达成时序）」，且保留走查结论；该条不影响任何其它需求的验收。

**文件白名单条目**：`pix/scripts/ui-shot.mjs`（新增场景、`resolvedAt` 记录与断言组）。

---

## 3. N75 可复跑数据面烟测入口（`pix/scripts/smoke-notes.mjs`）

**用户可见行为**（对开发者/维护者）：在仓库内一条命令即可复跑 R10 已验证的主进程数据面不变量与失败路径，逐项打印「通过/失败」，退出码 0/1，跑完自清理临时目录、仓库零残留。

**逐字冻结字面**：§0.6 全表（文件、入口、`package.json` 只增一键、编译面与产物期望、加载方式、驱动面、输出协议、退出码、自清理、零残留、与工程门的关系）。

### N75-1 编译面与入口

- 用仓库内 typescript 编译**仓库内**源文件（`pix/src/main/notes-store.ts` + 其叶子依赖 `pix/src/main/library-root.ts`）到 `%TEMP%` 下的临时 `outDir`（commonjs）；必需产物 `out/main/notes-store.js` 与 `out/main/library-root.js` 缺失、出现其它路径产物、或 `tsc` 退出码 ≠ 0 ⇒ 判失败退出 1。
- 主入口 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes`；等价入口 `cd pix && PATH="/c/Program Files/nodejs:$PATH" node scripts/smoke-notes.mjs`。
- `pix/package.json` **只**新增 `"smoke:notes": "node scripts/smoke-notes.mjs"`；`package-lock.json`、`packages/**` 零改动。

### N75-2 断言组与条数（4 组共 26 条，逐条冻结，不得减少）

**组 `undo-roundtrip`（8 条）**

| # | 断言 |
| --- | --- |
| 1 | `addNote`×3（不同页、含 `excerpt` 与 `answer`）均 `success === true`，`loadNotes()` 回传 3 条，文件 id 序列 = 新增顺序 |
| 2 | 每一步「主进程回传列表 === 文件所存」：`result.notes` 的 id 序列与直接读文件解析出的 id 序列逐条相等 |
| 3 | `deleteNote(中间那条)` ⇒ `success === true` 且回传 `note` 必在，`id` / `page` / `text` / `kind` / `docPath` 与目标逐字段相等 |
| 4 | 删除后立即读文件：该 id 消失、条数 2、sha256 ≠ 删除前 |
| 5 | `restoreNote(该 id)` ⇒ `success === true` |
| 6 | 还原后文件**逐字节**等于删除前（sha256 相等 ⇒ 原下标插回、`createdAt` / `updatedAt` 均未刷新） |
| 7 | 还原后回传列表 id 序列回复为删除前的三元素序列 |
| 8 | 再次 `restoreNote(同一 id)` ⇒ `not-found` + 逐字 `没有可撤销的删除`（槽已清） |

**组 `undo-failures`（8 条）**

| # | 断言 |
| --- | --- |
| 1 | 无槽时 `restoreNote` ⇒ `not-found` + 逐字 `没有可撤销的删除` + 零写盘（sha256 不变） |
| 2 | 槽内 id 不符 ⇒ `not-found` + 同逐字文案 + 零写盘 |
| 3 | 设槽后 `setLibraryRoot(ws-b)` 再还原 ⇒ `not-found` + 同逐字文案 + A 库 sha256 不变 + `ws-b/.pix-read` **不存在**（跨工作区绝不写别的库） |
| 4 | ②③ 失败后切回 A 库，同一槽仍可成功还原且字节回复删除前（失败不清槽） |
| 5 | 文件里已存在同 id 条目 ⇒ `invalid-input` + 逐字 `该笔记已重新存在，无法撤销` + 零写盘 + 文件内该 id 恰 1 条 |
| 6 | 同去重键占用（新 id、同 `docPath/page/kind/text`）⇒ `invalid-input` + 逐字 `该笔记内容已重新存在，无法撤销` + 零写盘 + 文件内该键恰 1 条 |
| 7 | `<root>/.pix-read/notes.json.tmp` 预置为目录 ⇒ `write-failed` + 逐字 `笔记写入失败` + 原字节不变 + **槽保留**；清理注入口后重试成功且字节回复删除前 |
| 8 | 外部删除 `notes.json`（ENOENT 按空库）后还原 ⇒ `success === true` 且写出「只含该条」的文件（点名一次：既有语义，非本轮回归） |

**组 `undo-slot-lifecycle`（6 条）**

| # | 断言 |
| --- | --- |
| 1 | 设槽后 `updateNoteComment(另一条)` + `addNote(新条)` 都**不清槽**：随后仍可还原，新条目与备注保留，且按原下标插回 |
| 2 | 失败的 `deleteNote("missing-id")` ⇒ `not-found` 且**不清槽**（随后原槽还原成功） |
| 3 | 连删 A、B：先还原 A ⇒ `not-found`（覆盖式只存最近一条）；还原 B ⇒ 成功 |
| 4 | 写坏 `notes.json` → `resetCorruptNotes()` 成功 ⇒ 槽已清（旧 id 还原 ⇒ `not-found`）+ 备份文件存在（`notes.json.corrupt-<yyyyMMdd-HHmmss>`）+ 重建后的文件为 `version: 1` 且 `notes: []`（按 `serializeNotes` 的 2 空格缩进格式，不是单行 JSON） |
| 5 | 文件未损坏时 `resetCorruptNotes()` ⇒ `not-corrupt` + 逐字 `笔记文件未损坏，无需重建` + 不清槽（随后仍可还原） |
| 6 | 组内每一步「主进程回传列表 === 文件所存」（与组 1 同一不变量，收尾复查） |

**组 `export-and-empty`（4 条）**

| # | 断言 |
| --- | --- |
| 1 | 空库 `exportNotesMarkdown()` ⇒ `success === false` + `code === "empty"` + 逐字 `暂无笔记可导出` + `notes.md` 不存在 |
| 2 | 2 条笔记时 ⇒ `success === true` + `count === 2` + `filePath` 以 `.pix-read/notes.md` 结尾 + 产物文本含该文档组标题行 `## sample-paper.pdf（2 条）` 且含两条的 `> ` 引用行 |
| 3 | 导出不改 `notes.json` 字节（前后 sha256 相等） |
| 4 | `.pix-read/` 之外零写盘（库内其它目录与 `ws-b` 均未被创建/修改） |

### N75-3 运行契约（输出、退出码、自清理、零残留）

- 输出协议与退出码逐字见 §0.6；汇总行逐字 `通过 {passed} / 失败 {failed}`。
- `finally` 自清理临时目录；清理失败只告警、不改退出码。
- 运行后 `git status --short` 只出现本轮白名单文件（仓库零残留）；脚本不在仓库内产生任何文件。

**验收判据**

| 面 | 判据 |
| --- | --- |
| 【烟测-主进程】 | 连续两次 `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run smoke:notes` 均 `SMOKE_NOTES_EXIT=0`；输出逐条打印 4 组共 ≥26 条 `[通过]` 且无 `[失败]`；末行汇总逐字 `通过 {passed} / 失败 {failed}` |
| 【走查】 | 编译面只引用 `<repo>/pix/src/main/{notes-store,library-root}.ts` 与 `<repo>/pix/node_modules/typescript/lib/tsc.js`；临时目录写在 `os.tmpdir()` 下；`pix/package.json` 除 `scripts.smoke:notes` 外零 diff；`package-lock.json` / `packages/**` 零 diff；仓库内无 `pix-smoke-notes-*` 类残留 |
| 【check】 | `CHECK_EXIT=0`（脚本不在 `tsconfig.json` 的 include 内，不引入新增类型错误） |

**失败路径抽样（必须实测并留档）**：两项注入都只临时修改 `pix/scripts/smoke-notes.mjs`（本轮白名单文件，改完立即还原并以 `git diff --exit-code -- pix/scripts/smoke-notes.mjs` 证明还原；不得为了验证去改 `pix/src/**`）：
1. 临时把 `spawnSync` 的 `tscJs` 指向一个不存在路径 ⇒ 编译失败 ⇒ 脚本以非 0 退出且**不**进入断言（输出含失败原因）；
2. 临时把一条断言里的期望文案改错 ⇒ 该条 `[失败]` + 其余条目不受影响 + 退出码 1。

**文件白名单条目**：`pix/scripts/smoke-notes.mjs`（新建）；`pix/package.json`（仅 `scripts` 增一键）。

---

## 4. N76 README 事实性更正（7 子条）

范围约束：**只更正与真实文件内容不符之处，不重写句子、不扩写文案**；除下表各行外，README 其余内容逐字不动。更正后的表述必须能在仓库内找到依据（下表「依据」列即证据）。

| # | 现文（逐字） | 更正为（逐字） | 依据 |
| --- | --- | --- | --- |
| N76-1 | `会话管理:新建与切换,按 workspace 目录隔离存储(删除有主进程接口,尚无界面入口)` | `会话管理:新建、切换、重命名与删除,按 workspace 目录隔离存储` | 界面入口已存在：`pix/src/renderer/components/workspace/ChatPanel.vue:898-908`（`.pill-session` 菜单 → 「历史对话」项右侧 `.session-delete-btn`，类名在 `:900`、`title` 在 `:902` 逐字 `删除该对话` / `再次点击确认删除`）；接线在 `pix/src/renderer/pages/WorkspacePage.vue:170-183`（`onDeleteSession` → `window.pixApi.deleteSession`，`:322` `@delete-session`）；菜单另有 `重命名当前对话`（`ChatPanel.vue:881`） |
| N76-2 | 项目结构 `src/main/` 列表（现有 12 项） | 在既有列表内**补** `notes-store.ts`（笔记存储）与 `reader-state-store.ts`（阅读现场存储）两行 | 两文件真实存在（`pix/src/main/` 目录列表） |
| N76-3 | `components/workspace/  # LibraryPanel / ReaderPanel / PdfViewer / KnowledgeMap / ChatPanel` | `components/workspace/  # LibraryPanel / NotesPanel / ReaderPanel / PdfViewer / PdfSearchPanel / PdfSelectionQuickAsk / KnowledgeMap / ChatPanel` | `pix/src/renderer/components/workspace/` 实际 8 个文件 |
| N76-4 | `stores/  # session / project / settings / auth / reader` | `stores/  # session / project / settings / auth / reader / reader-state / notes` | `pix/src/renderer/stores/` 实际 7 个文件（`notes-store.ts`、`reader-state-store.ts` 为 R5/R6 新增） |
| N76-5 | `composables/  # useRpc / useRegionCapture / useTheme` 与 `components/session/  # MessageBlock / ToolExecutionBlock / ErrorBlock` | 前者补 `useQuickAsk`；后者补 `GuideBlock` | `pix/src/renderer/composables/` 实际 4 个文件；`pix/src/renderer/components/session/` 实际 4 个文件 |
| N76-6 | `utils/  # markdown / reading-context / session-title` | `utils/  # markdown / reading-context / session-title / note-capture / notes-path / notes-view / outline-notes / image-capture` | `pix/src/renderer/utils/` 实际 8 个文件 |
| N76-7 | `ipc-handlers.ts  # IPC 处理(会话/设置/资料库/更新)` | `ipc-handlers.ts  # IPC 处理(会话/设置/资料库/更新/笔记/阅读现场/窗口)` | `pix/src/main/ipc-handlers.ts` 实际注册：`notes-*` 6 个（`:468-482`，含 R10 的 `notes-restore`）、`reader-state-load/save`（`:488-490`）、`window-*` 4 个（`:589-607`）、`delete-session`（`:615`） |

**不改动清单（避免过度更正）**：README 对「阅读笔记」（含 `10 条 / 8000 字符上限` ⇔ `reading-context.ts:22/24` 的 `MAX_CONTEXT_NOTES = 10` / `MAX_CONTEXT_NOTES_CHARS = 8000`）、「知识地图联动」、「阅读向 agent 工具」、「按 workspace 目录隔离存储」（`pix-paths.ts:55` `sessions/<编码后的项目路径>`）、构建/打包/依赖章节、根 `package.json` 的构建顺序（`build` 脚本 `ai → agent → coding-agent → mcp-adapter`）的表述**均与代码一致**，不得改；开篇「本仓库是项目的 GUI 地基…阅读相关特性在此地基上迭代」一句为持续时表述，不判定为错误，不得改写。

**验收判据**：【走查】`git diff -- README.md` 只包含上表 7 行（含行内最小改动），无其它 hunk；更正文案中的每个文件名都能在仓库内找到；【check】不受影响（README 不进类型面）。

**文件白名单条目**：`README.md`（修改）。

---

## 5. 反需求（本轮明确不做）

1. **不做 `PdfViewer` 的 Esc 语义重构**（不给 `onWindowKeydown` 加「输入框白名单」/ 不调整 `captureMode` / `searchOpen` / `isEditableTarget` 的分支顺序）：这会改变 PDF 搜索框与页码输入框的既有行为，且与「不越界者不改」的最小修复原则冲突；本轮只由持有输入框的组件阻断冒泡（§0.2）。
2. **不改浮层定位 / 锚点算法 / `FEEDBACK_MS`**：本轮只改「哪些滚动来源会隐藏浮层」这一条判定，不碰 `showFor` 的几何钳制与反馈时长。
3. **不引入 debounce/throttle 或 `scrollend` 之类的新事件语义**：判定必须逐条可判，时序型技巧会让离屏断言失去确定性。
4. **不删除、不重命名、不改写任何既有离屏场景与截图**（PRD §5.7）：60–65 段只允许「新增断言」与「更新注释」，其判据一律不得替换。
5. **不补做 UI 的像素级 diff**（`R10-dev.md` 终 5「未判定 / 未覆盖」第 3 条已登记为不修）：回归仍以「基线集合零缺失 + 行内字段逐字 + 截图目视」判定。
6. **不做笔记搜索/排序/撤销/复制的任何功能扩展**（高亮、命中定位、多条撤销栈、批量操作、导出范围选择等）：全部落在 PRD §4 的版本级反需求里。
7. **不改主进程与渲染层的产品源码**（除 N73-1 的 `NotesPanel.vue`、N73-2 的 `PdfSelectionQuickAsk.vue`，以及 N74-2 在 220px 实测溢出时的样式面最小修复）：`pix/src/main/**`、`pix/src/shared/types.ts`、stores、utils、其它 `.vue`、样式变量文件本轮零改动。
8. **不新增依赖、不改 lockfile、不新增第二个 npm 脚本**（N75 只允许 `smoke:notes` 一键）；不为烟测方便在产品代码里加导出/开关（烟测编译的是真实源码）。
9. **不把烟测脚本接进 `npm run check` / `npm test` / CI**（仓库内没有 CI 配置；PRD §5.4 禁止子代理跑 `npm test`）。
10. **不做 `undoScope` 守卫的代码改动**（N74-3 只补运行时场景；守卫本身是既有正确实现，不得为「更容易测」而重写）。
11. **不修 README 之外的文档**（`REMAINING.md`（头部已声明为历史路线图）、`AGENTS.md`、`docs/pm/PRD-*.md`、`R6–R10-*.md` 均只读；历史档件的事实性描述保持当时状态）。
12. **不清理仓库内既有临时产物以外的任何文件**（例如不去删 `%TEMP%` 下的历史目录，不改 `.gitignore`）。

---

## 6. 文件白名单（主进程面 / 渲染层面 / 脚本与文档面）

### 主进程面

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `pix/src/main/**`（含 `notes-store.ts` / `library-root.ts` / `ipc-handlers.ts` / `preload.ts` / `reader-state-store.ts`） | **零改动** | 本轮三个缺陷与三条断言全部落在渲染层与脚本面；N75 的烟测只**编译**这两个既有叶子模块，不修改它们 |
| `pix/src/shared/types.ts` | **零改动** | 不扩码表、不新增类型（R10 的 `notes-restore` 契约已是终态） |

### 渲染层面

| 文件 | 动作 | 对应需求 | 说明 |
| --- | --- | --- | --- |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改 | N73-1 | `onSearchEsc(event)` 增 `event.stopPropagation()` + 注释逐字改写；搜索行字面、计数、空态、撤销行、复制、DOM 门控**零改动** |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 修改（**条件**） | N74-2 | 仅当 220px 实测溢出时改样式面（`.note-actions` 等），不改类名/文案/DOM 顺序；不溢出则不进入本轮 diff |
| `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 修改 | N73-2 | `onStageScroll` 增「目标在 `.reader-stage` 子树内」判定；`hide()` / `showFeedback` / 监听注册方式零改动 |
| `pix/src/renderer/components/workspace/PdfViewer.vue` | **不改** | N73-1 | `onWindowKeydown` 的 `captureMode` / `searchOpen` / `isEditableTarget` 分支顺序与内容逐字不动（§0.3 第 4 条） |
| `pix/src/renderer/components/workspace/{PdfSearchPanel,ChatPanel,KnowledgeMap,LibraryPanel,ReaderPanel}.vue`、`pix/src/renderer/pages/**`、`pix/src/renderer/stores/**`、`pix/src/renderer/utils/**`、`pix/src/renderer/composables/**`、`pix/src/renderer/assets/styles/**` | **不改** | — | 见 §0.1 与 §5.7 |

### 脚本与文档面

| 文件 | 动作 | 对应需求 | 说明 |
| --- | --- | --- | --- |
| `pix/scripts/ui-shot.mjs` | 修改 | N73-1 / N73-2 / N73-3 / N74-1 / N74-2（/ N74-3） | 启动清理 `SHOTS_DIR` + 结束自检；`SEL` 增补（如需）；`excerptFirstSpan` 注释更新；60-9 追加 1 条反馈断言；新增 `r11-1`…`r11-6` 场景与 4 组（可选 5 组）测量；stub 仅在 N74-3 落地时增记 `resolvedAt`。既有场景、既有 label、既有截图名零改动 |
| `pix/scripts/smoke-notes.mjs` | **新建** | N75 | 仓库内可复跑数据面烟测（§0.6 + §3） |
| `pix/package.json` | 修改（最小） | N75 | 仅 `scripts` 增 `"smoke:notes": "node scripts/smoke-notes.mjs"`；其余字段零改动 |
| `README.md` | 修改 | N76 | 只含 §4 表格的 7 行更正 |
| `docs/pm/R11-req.md` | 新建（本轮交付） | — | 本档 |
| `docs/pm/R11-design.md`、`docs/pm/R11-review.md`、`docs/pm/R11-dev.md` | 新建 | — | 后续角色档件（设计 / 评审 / 开发），均只能落在本白名单语义内 |

**范围外（任何情况下不动）**：`packages/**`、`package-lock.json`、`pix/tsconfig*.json`、`pix/vite.config.ts`、`pix/build/**`、electron-builder 配置（`pix/package.json` 的 `build` 字段）、`pix/resources/**`、`docs/pm/**` 的历史档件、`.gitignore`。

---

## 7. 风险 Top3 与判定方式

**R1「Esc 修好了越界，却把阅读区的 Esc 弄坏了」** —— 为了阻止冒泡而把监听改成 capture、或顺手在 `PdfViewer` 里加输入框白名单，导致「焦点不在笔记搜索框时 Esc 不再退出框选模式 / 不再关闭 PDF 搜索面板」。

- 判定：`r11-1` 相位 `pdf-search-close-control`（⑧）+ `r11-2` 相位 `capture-mode-exit-control`（⑨⑩）+ 走查 `PdfViewer.vue` 零 diff + `.pdf-toolbar` 的搜索按钮打开面板的既有路径仍可用。
- 失败信号：`PdfViewer.vue` 出现任何 diff；`notes-search|esc`（60-3）之外的既有 Esc 行为改变；面板内出现第二个 `keydown` 监听。

**R2「滚动隐藏规则收得太窄或太宽」** —— 收得太窄（只排除了 `.notes-panel` 这一个选择器）会在下一个新滚动容器上复发；收得太宽（改成「任何滚动都不隐藏」）会丢掉「阅读区滚动收起浮层」的既有语义，让浮层停在已经滚走的选区上。

- 判定：§0.4 表格 8 行逐条走查 + `r11-3` 的三个相位（`notes-panel-scroll` 不隐藏 / `reader-scroll-control` 隐藏）+ 既有 06/07 场景（选区与反馈）全绿。
- 失败信号：实现里出现按类名枚举的第二份判断（例如 `if (target.closest(".notes-panel")) return;`）；`.pdf-scroll` 滚动后浮层仍在；`document` 级滚动被当成隐藏条件。

**R3「烟测脚本只跑 happy path 或被环境漂移带偏」** —— 断言条数被悄悄裁剪（只留 add/delete 成功路径）、把仓库内源文件复制到仓库外再编译（编译对象与工作树源文件脱钩）、或把临时目录写在仓库内留下产物。

- 判定：`smoke-notes.mjs` 的实跑输出必须逐条打印 4 组共 ≥26 条并出现 §0.6 的汇总行；连续两次运行都 `SMOKE_NOTES_EXIT=0`；运行后 `git status --short` 只出现白名单文件；走查编译命令只引用 `<repo>/pix/src/main/*.ts` 与 `<repo>/pix/node_modules/typescript/lib/tsc.js`。
- 失败信号：输出里出现「跳过」「仅 happy path」类分支；产物落在仓库内；`package.json` 除 `scripts` 之外出现 diff；断言条数少于 26。

**次级风险（不占 Top3）**：① `r11-3` 的反馈断言落在 2500 ms 窗口内，环境过慢会红 ⇒ 用有界等待（≤1500 ms）并在 data 里记录实测等待耗时；② `r11-5` 的 `--pix-left-width` 若忘记复位会污染后续截图 ⇒ 场景内 `restored-width` 相位是硬判据；③ `r11-4` 的撤销通知 4 s 后自动消失 ⇒ 断言必须紧跟点击之后采集；④ 启动清理会丢弃同一 `OUT_ROOT` 上一次运行的截图 ⇒ 基线与验收必须用两个不同目录（§0.5 末尾）。

---

## 8. 开放问题（需负责人确认，不阻塞本档定稿）

1. **N74-3 的取舍**：若 N74-3 因时序不可稳定达成而「不做」，是否接受「保留走查结论 + 开发档登记」作为本轮收口（R10 已是该结论）？还是要求必须补一条仓库外一次性时序验证（不落仓库）？
2. **`--pix-left-width` 施加方式**：N74-2 冻结用 `documentElement` 覆盖 CSS 变量到 220px（产品自身窄屏分支的值）。若负责人更希望用真实窗口尺寸切换（触发 `@media (max-width: 959px)`，代价是离屏窗口尺寸变化与更高不确定性），需要在设计档改口径后再进入开发。
3. **`SHOTS_DIR` 的历史产物清理是否要扩大到 `OUT_ROOT`**：本轮只清 `shots/`。若希望连 `vite-cache` / `electron-userdata` 一起每次重建（运行更干净但更慢、且会让「首启」类场景每次都冷启动），需要另开一条需求。
4. **基线条数口径（112/153 vs 152）**：本档按 §0.7 处理为「以 R11 动工前实跑计数为唯一基线」，理由是**口径统一**（把基线与 R11 实跑对齐，避免跨时点读数混用）。`R10-review.md:206` 的 152 条与 R10 交付档 153 条的差异已由 `R10-dev.md:359/375` 说明（152 = 搜索行补强前读数、153 = 补强后），无须先查清。若负责人仍要求以 R10 交付档字面 112/153 强制作基线，请在下发设计任务前明确。
