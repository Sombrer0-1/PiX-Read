## 需求评审（R11）

> 评审对象：`docs/pm/R11-req.md`（R11 收口修复，N73–N76 与 §0 冻结契约）。
> 方式：需求档逐条只读核对 + 真实代码/脚本只读走查。走查面：`pix/scripts/ui-shot.mjs`、`pix/src/renderer/components/workspace/{NotesPanel,PdfSelectionQuickAsk,PdfViewer,PdfSearchPanel,ReaderPanel,KnowledgeMap,ChatPanel,LibraryPanel}.vue`、`pix/src/renderer/{pages/WorkspacePage.vue,components/layout/AppLayout.vue,assets/styles/main.css,assets/styles/variables.css,stores/reader-store.ts}`、`pix/src/main/{notes-store,library-root,ipc-handlers}.ts`、`pix/{package.json,tsconfig.json,tsconfig.main.json,tsconfig.preload.json}`、`README.md`、`docs/pm/{R10-req,R10-design,R10-dev,R10-review,PRD-V0.5}.md`，另加 `git status --short`（只读）。
> 实测命令（本轮唯一允许跑的命令）：`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（2026-09-16 实跑；`tail` 输出构建脚本行后紧跟退出码 0）。
> **未跑的命令**（本轮权限不允许）：离屏取证 `electron scripts/ui-shot.mjs`、烟测脚本、任何 git 写命令。凡涉及运行时几何/时序的结论均标注「走查 + 静态判定」，未声称已实测。
> 结论：**revise**。must-fix 6 条（§M）。主线成立：三个缺陷的落点、三条补断言、脚本自净、烟测入口、README 更正全部落在既有文件与既有范式内，无依赖、无新功能、白名单与改动一一对应（逐条见 §3）。阻塞集中在：一处事实性错误（152/153 口径）、一条方向相反的恢复操作（缩小）、一条按字面不可判的文案判据、一条有盲区的几何判据、一条缺失的越界守卫判据、一处未登记的既有截图内容影响。

---

### M. must-fix 清单（6 条）

**M1（事实错误）§0.7「152 vs 153 差 1 条未在交付档说明」不成立，`R10-dev.md` 已写明**

- 问题：需求档「事实基线」表与 §0.7 把 152/153 的差 1 条写成「未在交付档中说明」，并据此在 §8 开放问题 4 里请负责人先查清。该前提与真实交付档矛盾：R10 交付方已逐字解释该差 1 条，且解释指向 R10 修复轮的补强条目，不是未知漂移。
- 证据：`docs/pm/R10-dev.md:359`「MEASUREMENTS.json：153 条（上一交付 152 + 本轮 search-row-form 1）」；`:367`「pre=152 post=153」；`:375`「唯一新增条目是本轮补强的 `search-row-form`；修复前 152 条一条不缺。」；终 4 `:498-500`（基线 94 张 /116 条 → 本轮 112 张 /153 条，新增 37 = 36 组 + search-row-form 1）。与 `docs/pm/R10-review.md:206`（审查方复跑读到 112 张 / **152 条**）在时间上互补：审查跑的 152 是「搜索行冻结字面修复前」的读数。
- 修法要求：改写「事实基线」该行与 §0.7 的「已知口径冲突」段，逐字引用 `R10-dev.md:359/375`；删除或改写 §8 开放问题 4（基线仍以 R11 动工前实跑为唯一基线这一点保留，但理由改为「口径统一」而不是「差 1 条未说明」）。

**M2（判据方向反了）r11-3 相位 `reader-scroll-control` 的「不可滚动则点『缩小』」不可能造出可滚动**

- 问题：需求档写「若不可滚动则先点 `.pdf-toolbar` 的 `title="缩小"` 按钮直到可滚动」。缩小只会减小渲染页高，不可能让 `scrollHeight > clientHeight + 40` 成立；该兜底路径自相矛盾。
- 证据：`pix/src/renderer/components/workspace/PdfViewer.vue:844` `title="缩小" @click="zoomBy(-0.1)"`、`:846` `title="放大" @click="zoomBy(0.1)"`；`:730-732` `zoomBy` 直接写 `readerStore.scale`；页盒尺寸由 `getViewport({ scale: readerStore.scale })`（`:189`）→ `:886` 的 `:style` 决定（`.pdf-scroll` 于 `:880`，CSS `:990-995` `overflow: auto`）。`MIN_SCALE/MAX_SCALE = 0.5/3`（`pix/src/renderer/stores/reader-store.ts:20-22`）。夹具每页 MediaBox 595×842（`ui-shot.mjs:111`），因此方向只能是放大。
- 修法要求：把兜底操作改为点击 `title="放大"`，并写明「达到 `.pdf-scroll` 可滚动即停止，且不得超过 `MAX_SCALE`；若放大到上限仍不可滚动 ⇒ 该相位判失败（不得降级为跳过）」，同时把实际 scale 写入 `data` 作空断言留档。

**M3（判据按字面不可判）N74-1 ⑤ / r11-4 的「`.notes-empty` 文案逐字 `还没有摘录`」没有冻结读取节点**

- 问题：`.notes-empty` 是容器节点（含图标 + 两段文案），其 `textContent` 归一化后是「还没有摘录 在 PDF 中选中文字，点「摘录」保存到这里」，不可能与「逐字 `还没有摘录`」相等；需求档「逐字冻结字面」只列了两条文案，没归位到具体类名。实现方式不同就会得到相反结论。
- 证据：`pix/src/renderer/components/workspace/NotesPanel.vue:561-565`：`<div v-else-if="!notesStore.hasNotes" class="notes-empty">` → `<v-icon class="empty-icon">`、`<p class="empty-title">还没有摘录</p>`、`<p class="empty-subtitle">在 PDF 中选中文字，点「摘录」保存到这里</p>`。需求档 N74-1 断言 ⑤ 与「逐字冻结字面」表均未指定节点。既有脚本对空态的读法都是读带单段文案的节点（`SEL.searchEmpty = ".notes-search-empty"`，`ui-shot.mjs:75/4783-4790`），`60-9` 对 `.notes-empty` 只断言存在（`ui-shot.mjs:5266/5277`），没有可照抄的「容器文案」先例。
- 修法要求：冻结读取节点为 `.notes-empty .empty-title`（逐字 `还没有摘录`）与 `.notes-empty .empty-subtitle`（逐字 `在 PDF 中选中文字，点「摘录」保存到这里`），或把断言 ⑤ 改写为对这两个子节点的逐字比对。

**M4（判据有盲区 + 阈值节点不唯一）N74-2 的「动作区不溢出」与「未换行」判定式**

- 问题 1：判定项④ `actions.scrollWidth - actions.clientWidth <= 1` 与判定项⑤（只比 `right` 边界）都覆盖不到 **inline-start（左）方向的溢出**。`.note-actions` 是 `justify-content: flex-end` 的 flex 容器，内容超宽时溢出发生在左侧（`复制` 被挤出面板、被父级裁切），此时 `scrollWidth` 与 `right` 都可能仍然合格 ⇒ 220px 实为溢出却判绿 ⇒「修 or 不修」误判为「测定不溢出，不修」。按 CSS Overflow 的 scrollable overflow 定义（只覆盖 end 侧），`scrollWidth` 对该形态不可靠；本轮禁止跑离屏，无法在本档内实测，故按「缺少必要判据」认定。
- 问题 2：判定项⑥「`.note-actions` 的 `h` 不超过该行文本行高的 1.5 倍（按实际行内文本 `fontSize * 1.5` 计算）」没有冻结取哪个节点的 `fontSize`：`.note-text` 是 12px/1.5（阈值 1.5×18=27px），`.note-copy` 是 11px/1.4（阈值 1.5×16.5=24.75px，若按 1.4 行高再加倍则又不同），同一实现可给出不同结论。
- 证据：`NotesPanel.vue:1336-1340`（`.note-actions { display:flex; justify-content:flex-end; gap:4px }`）；`:1266-1272`（`.note-text { font-size:12px; line-height:1.5 }`）；`:1347-1356`（`.note-copy { font-size:11px; line-height:1.4 }`）；`:5820-5838`（既有 65-5 同样只用 `scrollWidth - clientWidth` 与 `y` 差、`right` 差，未覆盖 start 边）。
- 修法要求：判定表补 start 边判据（例如 `actions.getBoundingClientRect().left >= body.getBoundingClientRect().left - 1`，并对 `.note-copy` / `.note-ask-wrap` 各判一次 `left >= actions.left - 1`），或在 220px 相位显式比对「子元素盒的左右边界都在容器内容盒内」；判定项⑥指明取的节点与期望阈值（建议 `.note-text`：`1.5 * 12 * 1.5 = 27px`），并写明「取 max(fontSize×1.5) 的节点」。

**M5（缺越界守卫判据）N73-3 的清理范围「不得触碰 %TEMP% 之外的路径」没有任何实现层判据**

- 问题：§0.5 冻结「只删除 `join(OUT_ROOT,"shots")`……不得触碰 `%TEMP%` 之外的路径」，但 `OUT_ROOT` 由环境变量决定且当前无任何校验：`PIX_SHOT_ROOT` 指向仓库（或用户任意目录）时，`rmSync(<该目录>/shots, { recursive: true, force: true })` 会递归删除仓库/用户目录 —— 这既是「越界删仓库文件」，也让该条冻结项完全不可判定。另一侧结论（不会误删当次产物）成立：清理点在 `main()` 内（`ui-shot.mjs:5852-5856`）先于一切 `capturePage()`（`:1024-1032`），且 `writeFixtures()` 的 `mkdirSync(SHOTS_DIR)`（`:352`）会重建目录。
- 证据：`ui-shot.mjs:33` `const OUT_ROOT = process.env.PIX_SHOT_ROOT || "C:/Users/86157/AppData/Local/Temp/pix-r5";`（无校验、无白名单）；`:34` `SHOTS_DIR = join(OUT_ROOT, "shots")`；`:5854` `mkdirSync(OUT_ROOT, { recursive: true })` 后无清理；`:1024-1032` `capturePage` 写 `SHOTS_DIR`；现有 `rmSync` 仅用于 state 文件（`:1375` 附近），无 `rmSync(SHOTS_DIR` （现网 `grep` 命中 0 ⇒ 改造后 `=== 1` 可判）。
- 修法要求：冻结一条守卫并写成走查判据，例如「`main()` 启动时校验 `resolve(OUT_ROOT)` 既不在 `PIX_DIR`（`ui-shot.mjs:32`）子树内、也不在仓库内，否则 `console.error` + `app.exit(1)`，**不执行清理**」；或在 §0.5「清理范围」行写明「`PIX_SHOT_ROOT` 必须位于 `os.tmpdir()` 下，否则脚本拒绝启动」，并给出对应判定命令。

**M6（登记缺失）N73-2 放松隐藏规则对既有截图**内容**的可预期影响没有覆盖**

- 问题：§0.7 的零缺失判据只到「basename 集合 ⊆」与「label 集合 ⊆」；N73-2 会让「非 `.reader-stage` 子树」的滚动不再隐藏浮层，脚本中有 4 处在面板滚动/复位之后立刻截图，其中一处正处在浮层反馈态：面板滚动若真的产生 scroll 事件，改前会隐藏浮层、改后不会 ⇒ 该截图的**内容**（不是文件名、也不是任何被断言的字段）会变。需求档没有任何「内容/目视」判据覆盖它，PRD §5.7 的「截图目视」因此失去落点。
- 证据：`ui-shot.mjs:1086`→`02-notes-list.png`、`:1109`→`03-notes-current-doc.png`、`:1243`→`08-notes-after-excerpt.png`（紧接 `:1235-1237` 的「已在笔记中」duplicate 反馈，浮层此时处于 `mode="feedback"`）、`:2561`→32 段的截图；浮层的隐藏来源就是 `onStageScroll`（`PdfSelectionQuickAsk.vue:137-139`）。注：这 4 处的赋值多为 `scrollTop = 0` 的幂等写（不产生 scroll 事件），因此**预期**无差异，但需求档既未登记也未要求目视留档。
- 修法要求：在 §0.7 或 N73-2 验收判据内加一条「开发档必须对这 4 张截图（至少 `08-notes-after-excerpt.png`）做改前/改后目视比对并登记结论（预期差异 = 浮层是否可见；若只有浮层差异则登记为 N73-2 的预期结果）」，或明确写出「本轮不做内容比对，浮层可见性变化不计入回归」并给理由。

---

### 1. 每条需求是否有可执行判据；判据能否在离屏窗口真实构造

**结论：14 条新断言（4 组 13 条 + 可选 1 条）全部可构造，除 M2/M3/M4 三处外判据可执行。** 逐条核对：

- r11-1 前置可构造：`.pdf-toolbar` 内 `title="在文档中搜索"` 的按钮存在（`PdfViewer.vue:847` `@click="openSearch"`），`.pdf-search-panel` 根类名存在且由 `v-if="searchOpen && pageCount > 0"` 门控（`:850-856`；`PdfSearchPanel.vue:432`）。相位 `pdf-search-close-control` 在 `document.body` 上派发 Escape 可命中 `searchOpen` 分支（`:380-383`），因为 `isEditableTarget`（`:341-349`）对 BODY 返回 false。
- r11-2 前置可构造：`.pdf-capture-fab` 内有 `v-btn`（`PdfViewer.vue:910-919`，`@click="toggleCaptureMode"`），进入态可判 `.capture-layer` 在 DOM（`:896-900`）+ `.pdf-viewer` 含 `capture-mode`（`:842`）。
- N73-1 的离屏可行性靠监听注册方式成立：`PdfViewer` 的 Esc 处理注册在 `window.addEventListener("keydown", onWindowKeydown)`（`:424`，**非 capture**），而 `pressSearchEsc()` 派发的合成事件以 `.notes-search-input` 为 target（`ui-shot.mjs:4808-4813`）⇒ 输入框上的 `stopPropagation()` 能阻断 window 监听；`.notes-search-input` 上的 Vue 监听是元素级、非 capture，不受影响。
- r11-3：`.notes-panel` 上派发 `new Event("scroll")`（不冒泡）可被 `document` 级 capture 监听收到且 `event.target === .notes-panel`（capture 阶段覆盖 document，`ui-shot.mjs` 无同款先例但为 DOM 标准行为）；浮层用 `v-show`（`PdfSelectionQuickAsk.vue:190-196`），因此「computed `display !== "none"`/`=== "none"`」可判。`.pdf-scroll` 滚动相位见 M2。
- r11-4：`seedNotes()[0]` = `n-current-1`（page 1、文本 `We study retrieval over long documents where the attention budget is the binding constraint.`，`ui-shot.mjs:301-310`），`undoSnippet = text.slice(0,12) + "…"`（`NotesPanel.vue:103-107`）⇒ `已删除「We study ret…」· 第 1 页` 逐字成立；`.notes-undo` 的 `v-if="notesStore.pendingUndo"` 与 `hasNotes`/`status` 无耦合（`:506`，与 `:525-565` 的 loading/error/empty 分支同级）⇒ 删空后仍在 DOM 成立；`countText === "共 0 条"` 成立（`:137-145` 无查询/无章节/未开「仅看当前文档」时走 `共 ${totalCount} 条`）。`deleteRowByText`（`ui-shot.mjs:4858-4873`）在任何行数下都可用。
- r11-5：`.layout-left` 宽 = `var(--pix-left-width)`（`AppLayout.vue:116-118`，默认值 `variables.css:112` 268px），`documentElement.style.setProperty("--pix-left-width","220px")` 可覆盖（窄屏分支同值 220px：`AppLayout.vue:169-178`）；`removeProperty` 后回 268 可判。判定项④/⑥的问题见 M4。
- r11-6（可选）前置成立：stub 的 `notesRestore` 先写盘再延迟响应（`ui-shot.mjs:869-889`，`if (notesRestoreDelayMs) await sleep(...)` 在 `writeNotesFile` 之后），`setNotesRestoreDelay`/`notesRestoreCalls` 控制口存在（`:964-965`、`:960-962`），`resolvedAt` 需新增（白名单允许）。计时口径见 §4 非阻塞第 5 条。

### 2. 冻结字面是否完整（类名、文案、场景名、断言 label 逐字可判）

**结论：绝大多数逐字可判，1 处不可判（M3），另 2 处措辞需收紧。** 核对结果：

- 命中项：`.notes-undo` / `.undo-text` / `.notes-undo-btn` + `title="还原这条笔记"` + 文本 `撤销`（`NotesPanel.vue:506-511`）、`已还原该条笔记`（`:239`；既有断言就用 `textOf(".notes-notice.is-success")` 逐字比对，`ui-shot.mjs:5440/5451` ⇒ 该读法已被既有绿断言证明可用）、`.note-copy`/`.note-ask-wrap`/`.note-actions` 类名与 DOM 顺序、`已摘录 · 第 N 页`（`PdfSelectionQuickAsk.vue:165`，模板 `:213` 的 `is-ok`）、`FEEDBACK_MS = 2500`（`:22`）、`.quick-ask`/`.quick-ask-feedback`（`:190/213`）。
- 未冻结节点：`.notes-empty` 的两条文案（M3）。
- 措辞需收紧（不阻塞判据成立，但「逐字」标签下有歧义）：
  1. N73-1 走查第 3 条把「`stage.contains(` 是该函数里唯一的新判据」写成判据，但 §0.4 判定式里新增的不止一行（`const stage = resolveStage()`、`event.target instanceof Node`、`!stage` 三条也都是新增）。应改为「新增判定只允许出现在 `onStageScroll` 内，且不含按类名枚举的例外分支」。
  2. N76-1 的「更正为」列未带行首列表符 `- `（现文是 `- 会话管理:…`，`README.md:24`）。若按字面替换会破坏列表结构，应写明「保留行首 `- `」。

### 3. 是否越界成新功能；白名单与改动的对应关系

**结论：不越界，白名单与改动一一对应，无遗漏。**

- 无新功能：N73-1/N73-2 是缺陷修复（PRD-V0.5.md:32「修 V0.4 遗留缺陷」），N73-3/N75 是验证基建（PRD-V0.5.md:90 已把「烟测-主进程」定义为「R11 起为仓库内可复跑脚本」），N74 只补断言，N76 只改事实性描述。`packages/**`、`package-lock.json`、`pix/src/main/**`、`pix/src/shared/types.ts`、stores/utils/styles 均零改动（白名单逐字列出）。
- 白名单映射：N73-1→`NotesPanel.vue`+`ui-shot.mjs`；N73-2→`PdfSelectionQuickAsk.vue`+`ui-shot.mjs`；N73-3/N74-1/N74-2/N74-3→`ui-shot.mjs`（N74-2 另含 `NotesPanel.vue` 的条件式样式面）；N75→`scripts/smoke-notes.mjs`（新建）+`pix/package.json`（仅 `scripts` 一键）；N76→`README.md`；文档→`docs/pm/R11-*.md`。`ui-shot.mjs` 在表中出现 5 次是同一文件的多需求复用，不构成重叠冲突；`pix/package.json` 同时出现在白名单与「范围外（electron-builder 配置）」两处，但已被「仅 `scripts` 增一键」限定，判定命令可写为 `git diff -- pix/package.json` 只含该行。
- 依赖与工程门：`npm run check` 独立实跑 0 error（本档开头）；`pix/scripts/**` 不在类型面（`pix/tsconfig.json` 的 `include` 只有 `src/renderer/**`、`src/shared/**`；`tsconfig.main.json` 含 `src/main/**`+`src/shared/**`；`tsconfig.preload.json` 只有 `files:["src/main/preload.ts"]`）⇒ 新增 `.mjs` 不引入新类型错误，与 N75 的口径一致。
- PRD 上游引用核对为真：§5.7 基线目录命名（`PIX_SHOT_ROOT=<临时目录>/pix-v05-r<N>-base`）、§5.8「R11 允许新增一个 `scripts` 条目」、§5.9 离屏脚本是唯一 UI 回归基线、§5.10 无临时产物、§7.1「112 张 + 153 条零缺失」均在 `PRD-V0.5.md:76-79 / 90 / 98` 逐字命中；R11 档 §0.5 用的 `pix-v05-r11-base` 与 §5.7 的命名范式一致。

### 4. N73-1 改写 N64-2 的旧断言更新方式是否写清（旧断言仍须绿）

**结论：写清了，符合 PRD §5.7「写明改哪一条、为什么、旧断言如何更新」。** 证据与核对：

- 旧字面逐字命中：`R10-req.md:190`「Esc：清空查询并 `blur()`（不加 `stopPropagation`，阅读区既有的全局 Esc 处理不在本轮改动范围）」；`:272`「`@keydown.esc` 只做「清空 + `blur()`」，不 `stopPropagation`、不做别的副作用」；设计档 `R10-design.md:180`（同款冻结）与 `:777`（「Esc 与清空按钮都**不** `stopPropagation`」）；代码侧 `NotesPanel.vue:200` 的旧注释。R11 §0.2 引用的四处位置全部对得上。
- 旧断言更新方式可执行：60-3 的 record 数据字段是 `{ phase, before, after }`、断言使用 `before.focused/value/rows` 与 `after.value/focused/rows/clearInDom`（`ui-shot.mjs:5071-5078`）；60-4 是 `{ phase, ...clearBtn60, hashSame }`（`:5085-5090`）——§0.2 说「全部字段逐字保留、只要求继续通过」与真实字段一致，且 `pressSearchEsc` 全脚本只有一处调用（`:5068`）⇒ 加 `stopPropagation` 不触碰任何其它既有断言。
- 新字面的可判定性：`stopPropagation` 恰 1 处（现网 1 处命中且是旧注释里的字符串；改写后的新注释 `/** Esc 只清空查询并交出焦点，并阻断冒泡：… */` 不含该词 ⇒ 走查命令仍有判别力）、`preventDefault` 0 处（现网 NotesPanel 无命中）、`addEventListener("keydown"` 0 处（面板只有 `pointerdown` capture 监听，`:323`）、模板 `@keydown` 恰 1 处（`:435`）、`PdfViewer.vue` 零 diff。Vue 的 `.esc` 修饰符不会自动 `preventDefault`（只有 `.prevent` 会），与「不 `preventDefault`」不冲突。

### 5. N73-2「哪些滚动会隐藏、哪些不会」是否真的可实现（逐容器判定）

**结论：唯一规则可判定、可构造，8 行判定表逐条与真实 DOM 一致（含 `.map-tree` 会隐藏、`document` 级不可达）。**

| # | 容器 | 真实位置（本次走查） | 在 `.reader-stage` 子树 | 判定 | 理由 |
| --- | --- | --- | --- | --- | --- |
| 1 | `.pdf-scroll` | `PdfViewer.vue:880`（`ref="scrollEl"`），CSS `:990-995` `overflow:auto`；祖先链 `.reader-stage`(`ReaderPanel.vue:206`) → `.reader-main`(`:211`) → `.reader-pdf`(`:222`) → `.pdf-viewer`(`PdfViewer.vue:842`) | 是 | 隐藏 | `stage.contains(target) === true`；R4 起既有语义，不得放松 |
| 2 | `.reader-content` | `ReaderPanel.vue:250`（文本/Markdown 分支），CSS `:419-423` | 是 | 隐藏 | 同一阅读列的内容位移 |
| 3 | `.map-tree` | `KnowledgeMap.vue:225`，CSS `:400-404`；祖先 `.reader-stage` → `aside.knowledge-map-slot`(`ReaderPanel.vue:207-209`) → `.knowledge-map`(`:211`) | 是 | 隐藏 | 规则只按「在 stage 子树内」判；不为地图列开第二处例外（否则要引入第二份「哪些列算阅读区」枚举） |
| 4 | `.notes-panel` | `NotesPanel.vue:690-696`（CSS `:695` `overflow-y:auto`），经 `WorkspacePage.vue:285-290` 挂在 `.layout-left`（`AppLayout.vue:53/116-118`）内；`.pane-body`（`WorkspacePage.vue:434-437`）自身无 `overflow` | 否 | 不隐藏 | 本轮修复目标（R10 审查 §4.3 + `R10-dev.md:190` 的 scroll-hide 实测） |
| 5 | `.panel-scroll` | `LibraryPanel.vue:205` `overflow-y:auto` | 否 | 不隐藏 | 与阅读列无关 |
| 6 | `.chat-messages` | `ChatPanel.vue:1287-1294` `overflow-y:auto` | 否 | 不隐藏 | 与阅读列无关 |
| 7 | `document` / `html` / `body` | `main.css:16-20`（`html,body{height:100%;overflow:hidden}`）、`WorkspacePage.vue:332-337`（`:336` `overflow:hidden`）、`AppLayout.vue:105-114`（`:109` `overflow:hidden`） | 否（不可达） | 不隐藏 | `stage.contains(document)` 天然为假；不可达路径不写分支正确 |
| 8 | `.pdf-search-panel` 内部 | `PdfSearchPanel.vue:432-436` `position:absolute`（在 `.pdf-viewer` 内 ⇒ 属 stage 子树）；`:471-477` 的 `overflow:hidden` 只用于截断，无滚动源 | 是 | 不适用 | 该面板内不存在滚动容器 |

其它：浮层组件本身挂在 `.reader-stage` 之外（`ReaderPanel.vue:258` `<PdfSelectionQuickAsk />`，与 `.reader-stage` 同级），因此规则不会自隐藏；`resolveStage()` 已存在（`PdfSelectionQuickAsk.vue:48-50`），`event.target instanceof Node` 在渲染层可用；监听注册不变（`:176`，capture）与 `onBeforeUnmount` 对称移除（`:181`）逐字保留。风险 R2 的「收得太宽/太窄」两条失败信号（按类名枚举、`.pdf-scroll` 滚动后浮层仍在、`document` 级滚动被当条件）在该规则下都可判。

### 6. N73-3 的清理策略是否会误删当次产物或越界删仓库文件

**结论：不会误删当次产物；但越界风险未被判据约束（M5）。**

- 不会误删当次产物：清理点位于 `main()` 内 `mkdirSync(OUT_ROOT)` 之后、`writeFixtures()` 之前（需求档指定的插入点，`ui-shot.mjs:5852-5856`），任何 `capturePage()`（`:1024-1032`）都在其后；`writeFixtures()` 内的 `mkdirSync(SHOTS_DIR)`（`:352`）负责重建 ⇒ `SHOTS_DIR` 一定存在且为空。
- 结束自检的落点可判：`MANIFEST.json`/`MEASUREMENTS.json` 写在 `:5919-5923`，`server.close()` 在 `:5926`，`errors` 已在 `:5928-5931` 决定退出码 ⇒ 「两个 JSON 写完之后、`server.close()` 之前」的位置与「追加 `errors`、退出码 1」都可实现，且失败截图 `99-failure-state.png` 由 `capturePage`（`:5913`）正常登记进 `shots`（`shots.push` 在 `:1029`）⇒ 自检不会误报。
- 越界：见 M5（`OUT_ROOT` 无校验）。
- 基线隔离：§0.5 要求改前基线与改后验收使用不同 `PIX_SHOT_ROOT`，与「同目录重复运行会丢弃上一次截图」的意图自洽（`PIX_SHOT_ROOT` 是唯一环境开关，`:33`）。

### 7. N75 的可复跑性（编译入口、临时目录、自清理、退出码、断言组）

**结论：逐字可实现；断言与真实数据面逐条对齐（无 must-fix）。**

- 编译入口真实存在：`pix/node_modules/typescript/lib/tsc.js` 存在（267 字节 CJS shim，实测 typescript 5.8.3，与需求档「实测 5.8.3」一致）；`pix/node_modules/@types/node` 存在（22.19.19）⇒ `typeRoots: ["<repo>/pix/node_modules/@types"]` + `types: ["node"]` 可解析。`spawnSync(process.execPath, [tscJs, "-p", cfg])` 的形态与仓库内既有 `assert-main-esm.mjs` 同为零依赖 Node 脚本范式（`pix/package.json` 的 `"type": "module"` 不妨碍 `.mjs`）。
- 依赖树封闭：`notes-store.ts` 只 import `node:crypto` / `node:fs` / `node:path` / `./library-root.js` / type-only 的 `../shared/types.js`（`:10-24`）；`library-root.ts` 只 import `fs`/`path`（`:8-9`）；`shared/types.ts` 无 import ⇒ 期望产物恰好为 `out/main/notes-store.js`、`out/main/library-root.js`、`out/shared/types.js`（`rootDir=<repo>/pix/src` + `files` 两个 `src/main/*.ts` ⇒ `main/…` 路径保持）。两者都无 electron、无渲染层依赖 ⇒ `createRequire` 可直接加载，且 `notes-store.js` 的 `require("./library-root.js")` 与脚本 `require(out/main/library-root.js)` 解析到同一绝对路径 ⇒ 同一模块实例（`setLibraryRoot` 两侧同时生效）成立。
- 断言与源码逐条对齐（抽核全部 26 条的关键点）：错误码与逐字文案（`RESTORE_EMPTY_MESSAGE`/`RESTORE_EXISTS_MESSAGE`/`RESTORE_DUPLICATE_MESSAGE`、`笔记写入失败`、`笔记文件未损坏，无需重建`、`暂无笔记可导出`）、校验顺序（无槽→id 不符→跨 root→读文件→同 id 占用→去重键占用）、失败不清槽、`writeFileAtomic` 的 `<target>.tmp` + `renameSync`（`<root>/.pix-read/notes.json.tmp` 预置为目录 ⇒ `EISDIR` ⇒ `write-failed` 且原字节不变、槽保留）、`Math.min(slot.index, notes.length)` 按原下标插回 ⇒ 还原后逐字节回复（`serializeNotes` 2 空格缩进 + 末尾换行）、备份名 `notes.json.corrupt-<yyyyMMdd-HHmmss>`、`resetCorruptNotes` 成功即清槽、导出 `count` / `filePath` 以 `.pix-read/notes.md` 结尾 / 组标题用存储态相对路径 ⇒ `## sample-paper.pdf（2 条）`、导出不改 `notes.json` 字节。`isLibraryFilePath` 对缺失文件按在库内处理（`library-root.ts:38-48` 的 try/catch）⇒ 「无需真实 PDF」成立。
- 运行契约可实现：输出协议、汇总行 `通过 {passed} / 失败 {failed}`、退出码 0/1、`finally` 自清理、仓库零残留（临时目录在 `os.tmpdir()` 下，脚本不写仓库）——均为常规 Node 实现，且白名单已含新建文件与 `package.json` 一键；失败路径抽样只改白名单文件并 `git diff --exit-code` 还原，口径正确。

### 8. 对既有 112 张截图 / 153 条测量的影响

**结论：未发现会被打破的既有断言；但有一处「截图内容」影响未被需求档覆盖（M6）。** 逐改动核对：

- N73-1：唯一受影响的既有断言是 60-3/60-4，需求档已明确「逐字保留 + 继续通过」；`pressSearchEsc` 全脚本单点调用（`ui-shot.mjs:5068`），`PdfViewer.vue` 零 diff 使「焦点不在笔记搜索框时的 Esc 语义」保持（`:375`/`:380`/`:385`）。60-3 之后 `document.activeElement` 回到 body，不影响后续场景。
- N73-2：既有依赖「滚动隐藏」的地方只有 60-9 的 `excerptFirstSpan`（判据是文件条数 + 面板回位，**不**断言浮层，`:4954-4971`）与场景 06 的隐藏断言（来源是 `selectionchange`，`:1186-1187`，不是 scroll）；场景 07（`:1210`）、22b（`:1733`）的 `is-ok` 反馈断言是「等出现」，放松只会更稳 ⇒ 不会变红。60-9 追加断言「`.quick-ask-feedback.is-ok` 逐字 `已摘录 · 第 1 页`」在改后可达（`showFeedback` 的 `if (!visible.value) return` 在浮层不再被面板滚动隐藏时会执行到，`PdfSelectionQuickAsk.vue:104-115`、`:147-166`）。内容影响见 M6。
- N73-3：清理只作用于本次 `OUT_ROOT/shots`，不触碰 `MANIFEST.json`/`MEASUREMENTS.json` 字段与既有截图名；历史残留 `99-failure-state.png`（`R10-dev.md:456` 登记）被清掉正是本轮意图，且它不在任何 MANIFEST 清单里 ⇒ 零缺失判据不受影响。
- N74-1/N74-2：只新增场景；N74-2 若真的落样式修改，既有 65-5（`ui-shot.mjs:5829-5839`：同排 + 右对齐 + `actionsOverflow <= 1` + `lastChild === "note-actions"`）在默认 268px 下仍须为绿 ⇒ 「修」必须限定为不改变默认宽布局的写法（例如仅在窄宽下生效的 `flex-wrap`），需求档已用 §0.7 的零缺失比对与「不得改类名/文案/DOM 顺序」约束住，但判定式本身的盲区见 M4。
- N75/N76：不触碰产品 UI 与既有截图/测量（N75 只编译不改源码；N76 只改 README，不进类型面）。

### 9. 非阻塞（建议，不影响本轮定稿）

1. N73-1 §0.2 的旧字面引用把「不加 `stopPropagation`」加了粗体标记，与「逐字引用」有轻微出入（原文无 `**`）；同时建议把 `R10-design.md:181`（「Escape 继续冒泡……开发期**不得**当缺陷修掉」）也登记为被本轮改写，避免开发/走查按旧档判红。
2. N73-3 的结束自检①（`shots/*.png` basename 集合 === `MANIFEST.shots[].file` basename 集合）在当前写入路径下恒真（二者同源：`capturePage` 同时写文件与入栈，`:1027-1029`）；真正有判别力的是②（白名单外条目 0）。若希望①也具备判别力，应改为「与基线 MANIFEST 的 basename 集合比对」或删除。
3. `onStageScroll` 改为「每次滚动 `resolveStage()`（`document.querySelector`）」会在高频滚动的 `.pdf-scroll` 上增加一次 DOM 查询；建议在实现层注明可接受（或缓存 + 挂载/卸载时失效），需求档无需冻结。
4. N74-3 的 `NOTES_RESTORE_DELAY_MS = 6000` 与「必须 ≥ 实测往返 + 2000 ms」在本轮无法预先实测；建议写明「该建议值可由设计档按实测上浮（上浮不影响判据）」，避免与「≥ 实测 + 2000」自相矛盾。
5. r11-4 的撤销通知 (`is-success`) 与撤销行都受计时器约束（通知 4s、行 `UNDO_ROW_MS`），断言必须紧跟点击采集；需求档次级风险③已提到通知，建议把「撤销行 8s 窗口」也写进同一句。
6. 事实基线行的「`git status --short`（空）」在写档当天成立，但本档自身是未跟踪文件（当前 `git status --short` 只有 `?? docs/pm/R11-req.md`）；建议基线行注明「不含本档」。

### 10. 本轮评审的复跑留档

- 已跑：`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（2026-09-16）。
- 未跑（权限不允许，故本档所有「运行时」结论均为走查判定）：`electron scripts/ui-shot.mjs`（含 M4 中 `scrollWidth` 在 `justify-content: flex-end` 下的实测，需离屏或浏览器实测确认）、`scripts/smoke-notes.mjs`（尚未创建）。
- 只读核对：`git status --short`（仅 `?? docs/pm/R11-req.md`）、`git log --oneline -1`（`752a6d2 docs: V0.5 迭代路线与 PRD（R11-R15）`，与需求档事实基线一致）。

---

## 设计评审（R11）

> 评审对象：`docs/pm/R11-design.md`（R11 收口修复设计档，N73–N76），对照 `docs/pm/R11-req.md`（含 §0 定稿修订 M1–M6）。
> 方式：设计档逐条只读核对 + 真实代码 / 脚本只读走查 + 二次真实命令取证（`npm run check`；一次真实离屏实跑）。本轮不得改源码与脚本，故新增场景 `r11-1`…`r11-6` 与 `scripts/smoke-notes.mjs` **未实跑**（前者尚未落地、后者尚未创建）；凡涉及其运行态的结论一律标注「走查 + 静态判定」，未声称已实测。
> 结论：**revise**。must-fix 4 条（§2）。设计档主体成立：N73-1 的阻断机制、N73-2 的来源判定与改法范围、N73-3 的守卫 / 清理 / 自检顺序、N74 三条断言的落点与构造方式、N75 的编译面与驱动面、白名单与改动映射，全部与真实代码和真实命令输出逐条对得上（§1）；M2–M6 的定稿修订全部落地（§1.4）。阻塞集中在 4 处「按字面无法满足 / 与自身冻结判据互斥 / 与上游要求相矛盾」的判据，均为一句话级修正，不需要改需求档。

### 0. 本轮的实跑留档（可复现）

| 命令 | 观察到的原始结果 | 用途 |
| --- | --- | --- |
| `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"` | `CHECK_EXIT=0` | 唯一工程门当前 0 error（2026-09-16） |
| `tasklist \| grep -i electron`（跑前） | 无输出（无并发取证进程） | 满足「两取证进程不得并发」 |
| `node -e "console.log(require('os').tmpdir())"` | `C:\Users\86157\AppData\Local\Temp` | 守卫默认值可通过性 |
| `PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-r11-review-probe" ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_EXIT=$?"` | `UI_SHOT_EXIT=0`，末行 `[ui-shot] 结束：产出 112 张截图` | 既有基线在本机可跑通 |
| 读该次 `shots/MANIFEST.json` / `MEASUREMENTS.json` | `shots=112`、`failure=null`、`measurements=153` | 与设计档 §0.1、需求 §0.7 的 112 / 153 逐字一致 |
| `ls -A <probe>/shots \| grep -v '\.png$' \| grep -v '^\(MANIFEST\|MEASUREMENTS\)\.json$'` | 空 | 自检判据②在现状下天然成立 |

未跑（原因见上）：新场景、`smoke-notes.mjs`、任何 git 写命令。

### 1. 逐条核对（对应本轮 6 个重点）

#### 1.1（重点 1）N73-2 是否只对阅读区滚动生效：`.reader-stage` 内可滚动元素逐个判定

设计档 §1.2.1 的判定式与需求 §0.4 逐字一致，落点 `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue:137-139` 与现网完全一致（现网 `grep -n`：`resolveStage()` 定义 `:48-50`、`instanceof Node` 0 处、`stage.contains(` 0 处、`closest(` 0 处、`addEventListener("scroll"` 恰 1 处且带 `true`（`:176`）、对称移除 `:181`）。按真实 DOM 枚举 `.reader-stage` 子树（`ReaderPanel.vue:206` → `.knowledge-map-slot`(`:207`) / `.reader-main`(`:211`) → `.reader-pdf`(`:222`) → `PdfViewer` 的 `.pdf-viewer`(`:842`)）：

| # | 滚动容器 | 真实声明（本次走查行号） | 在 `.reader-stage` 子树 | 新规则下滚动时 | 设计档 §1.2.2 表内 |
| --- | --- | --- | --- | --- | --- |
| 1 | `.pdf-scroll` | 元素 `PdfViewer.vue:880`；CSS `:993 overflow: auto` | 是 | **隐藏** | ✔ 行 1 |
| 2 | `.reader-content` | `ReaderPanel.vue:250`；CSS `:421 overflow-y: auto` | 是 | **隐藏** | ✔ 行 2 |
| 3 | `.map-tree` | `KnowledgeMap.vue:225`；CSS `:403 overflow-y: auto` | 是 | **隐藏** | ✔ 行 3 |
| 4 | `.reader-body pre`（Markdown / 文本分支的代码块） | `ReaderPanel.vue:449-455`（scoped `:deep(pre)`）+ 全局 `assets/styles/main.css:204 pre { overflow-x: auto }` | **是** | **隐藏** | **缺行** |
| 5 | `.knowledge-map-slot` | `ReaderPanel.vue:306 overflow: hidden`；`KnowledgeMap.vue:80-82` 用 `scrollIntoView()` 程序化滚动（`overflow:hidden` 盒可被程序化滚动 ⇒ 会产生以它为 target 的 scroll） | 是 | **隐藏** | **缺行**（与行 3 同向、无行为差） |
| 6 | `.notes-panel` | `NotesPanel.vue:695 overflow-y: auto`（挂 `.layout-left`；`.pane-body` 只有 `flex/min-height`，`WorkspacePage.vue:434-437`，且与 `.notes-panel` 同元素） | 否 | **不隐藏（本轮修复目标）** | ✔ 行 4 |
| 7 | `.panel-scroll` | `LibraryPanel.vue:205 overflow-y: auto` | 否 | 不隐藏 | ✔ 行 5 |
| 8 | `.chat-messages` | `ChatPanel.vue:1289 overflow-y: auto` | 否 | 不隐藏 | ✔ 行 6 |
| 9 | `document` / `html` / `body` | `main.css:19`、`WorkspacePage.vue:336`、`AppLayout.vue:109` 均 `overflow: hidden` | 否（不可达） | 不隐藏 | ✔ 行 7 |
| 10 | `.pdf-search-panel` 内部 | `PdfSearchPanel.vue:432 position: absolute`；文件内只有 `:474 overflow:hidden` + `:475 text-overflow: ellipsis`，无 auto/scroll | 是 | 无滚动源 | ✔ 行 8 |

判定：**改法确实只对阅读区滚动生效** —— `.notes-panel` / `.panel-scroll` / `.chat-messages` 都不在 stage 子树（`stage.contains(target)` 为假）⇒ 浮层不被无关滚动吞掉；`.pdf-scroll` / `.reader-content` / `.map-tree` 的既有隐藏语义逐条保留；`document`/`body` 不可达（`stage.contains(document)` 天然为假）⇒ 不写分支正确。

事件 target 面：`.pdf-scroll` / `.reader-content` / `.map-tree` / `pre` 的 scroll 事件 target 都是元素自身（scroll 不冒泡，但监听是 `document` 级 capture ⇒ 仍会收到）；相位 2 的合成 `new Event("scroll")`（不冒泡）派发在 `.notes-panel` 上时同样被 capture 监听收到、`event.target === .notes-panel`（DOM 标准行为，现网无同款先例但机制成立）⇒ §1.2.4 相位 2 的构造成立。

唯一缺点：**第 4/5 行未登记**，而 §1.2.2 把这表称为「每个滚动源的结论必须逐条一致」、§1.2.3 给出走查判据「§0.4 表格 8 行逐条与实现一致」。结论同向、无行为差，属登记缺口（见 §3.1），不改变判定式的正确性。

#### 1.2（重点 2）N73-1：`stopPropagation` 是否足以阻断 window 监听 + 其它输入框

- **机制成立（走查 + DOM 标准）**：`PdfViewer.vue:417-428` 的注册是 `window.addEventListener("keydown", onWindowKeydown)`（**非 capture**），且只在 `readerStore.pageCount > 0` 时注册（`watch` at `:430-434`，`immediate: true`），`onBeforeUnmount` 对称移除（`:823-829`）。Vue 的 `@keydown.esc="onSearchEsc"`（`NotesPanel.vue:435`）挂在 `<input>` 元素上、非 capture。以该 input 为 target 的合成 `KeyboardEvent` 事件路径是 `window → document → … → input`（capture 段，无监听）→ 目标阶段（Vue 监听执行）→ 冒泡段（`input → … → document → window`）；在目标阶段调用 `stopPropagation()` 会截断冒泡段 ⇒ window 上的 `onWindowKeydown` 不被调用。改法（`onSearchEsc(event: KeyboardEvent)` 内 `event.stopPropagation()`）与需求 §0.2/§0.3 逐字一致。
- **旧断言不受影响**：`pressSearchEsc` 全脚本唯一调用点 `ui-shot.mjs:5068`（60-3）；60-3 / 60-4 的 record 字段只读 `value / focused / rows / countText / clearInDom`（`:5067-5090`）⇒ 加阻断不触碰任何既有字段。
- **反方向（阅读区语义未坏）**：`pressBodyEsc()` 以 `document.body` 为 target，不经 input ⇒ `PdfViewer.vue:375` 的 `captureMode` 分支、`:380` 的 `searchOpen` 分支照旧执行（`isEditableTarget`（`:341-349`）对 body 返回 false）⇒ §1.4.2 相位 ⑧ / ⑨⑩ 可判。
- **其它输入框的现状（设计档口径需收紧）**：window 监听的分支顺序是 Ctrl+F → `captureMode` → `searchOpen` → `isEditableTarget`（`:356-385`）。因此「框选模式开启」或「PDF 搜索面板开启」时，**任何**焦点位置的 Escape 都会被阅读区语义抢先处理，包括 chat composer（`InputArea.vue:50` textarea）、澄清卡 textarea（`ClarificationCard.vue:56`）、笔记备注输入（`NotesPanel.vue` 的 `v-textarea`）、会话重命名对话框输入（`ChatPanel.vue:660-666`）、页码输入（`PdfViewer.vue:931`，且它自己还有 `:940 @keydown.esc.prevent`）。设置页 / 首页不受影响：三条路由互相排斥且 `App.vue:109` 无 `KeepAlive` ⇒ 离开工作区即卸载 `PdfViewer` 并摘除监听。设计档 §2.2「不受影响」行的事实陈述正确（R11 不动 `PdfViewer`），但用词是「一律保持既有语义」且只点名前三个输入框，容易被读成「这些输入框是安全的」；建议补显式残留清单（§3.2）。
- **范围判定**：需求 §5 反需求 1 明确本轮不做 `PdfViewer` 的 Esc 语义重构 ⇒ 上述残留是「本轮有意不修」，不构成设计缺陷；但设计档的任务是「可直接开工、可判定」，残留清单缺失会让走查角色误判。

#### 1.3（重点 3）N73-3：清理时机边界与越界守卫

- **顺序可判、不会误删当次产物**：现网 `main()` 首条语句是 `:5853 app.setPath("userData", …)`、`:5854 mkdirSync(OUT_ROOT, {recursive:true})`；设计档把 `assertOutRootSafe()` 插为第一条、把唯一清理点插在 `mkdirSync(OUT_ROOT)` 与 `writeFixtures()` 之间，`writeFixtures()` 内 `:352 mkdirSync(SHOTS_DIR, {recursive:true})` 负责重建 ⇒ 任何 `capturePage()`（`:1024-1032`，写文件并 `shots.push`）都在其后。现网 `grep -c "rmSync(SHOTS_DIR"` = **0** ⇒ 改后 `=== 1` 可判。清理只删 `join(OUT_ROOT,"shots")`，`writeFixtures()` 另建的 `library` / `library-b` / `.pix-read` / `electron-userdata` / `vite-cache` / `stub-preload.cjs` 都不受影响（`:344-368`、`:5855`、vite `cacheDir`）。
- **守卫真实可判、失败零副作用**：`assertOutRootSafe` 是 `main()` 第一条语句 ⇒ 失败路径上 `app.setPath` / `mkdirSync` / `rmSync` 均未执行；`main()` 之前只有 `app.commandLine.appendSwitch`（`:5843-5848`）与纯路径常量（`:31-38`），无落盘。判定命令（`test ! -e` 两次 + `EXIT=1` + 逐字文案）可用；两个方向的语义在同一个函数里可读。默认值（`:33`，`C:/Users/86157/AppData/Local/Temp/pix-r5`）在本机位于 `os.tmpdir()` 之下（实测），不设环境变量也能启动，与 §0.1 一致。
- **结束自检落点可判**：`errors` 在 `main()` 内声明并在 `:5928-5931` 决定退出码；两个 JSON 写在 `:5919-5923`、`server.close()` 在 `:5926` ⇒「两个 JSON 之后、`server.close()` 之前 push errors」可实现；失败截图 `99-failure-state.png` 经 `capturePage`（`:5913`）正常入 `shots` ⇒ 自检①不会误报。我的基线实跑复核：`<probe>/shots` 一级条目只有 `*.png` + `MANIFEST.json` + `MEASUREMENTS.json` ⇒ 自检②现状天然绿。
- **残余边界（登记，不作为阻塞）**：① 守卫只保证「在 `os.tmpdir()` 之下且与仓库互不包含」⇒ `PIX_SHOT_ROOT=%TEMP%/<任意他者目录>` 仍会被允许递归删其 `shots/`；② 同一 `OUT_ROOT` 并发两次运行会互删（设计档只登记了顺序复用「预期丢弃」）。本轮纪律（禁止并发 + 基线与验收双目录）已覆盖，建议只在 §0.5 备注（§3.3）。
- 自检①（磁盘 basename 集合 === `MANIFEST.shots[].file` basename 集合）与 `capturePage` 同源，判别力弱（需求评审非阻塞 2 已指出）——设计档保留它作护栏无害，但它是「同一写入路径的自证」，不能当「产物齐全」的独立证据；真正有判别力的是自检②。

#### 1.4（重点 4）N74 三条断言的离屏可构造性 + M3/M4 是否落地

**M 修订落地核查（逐条对照真实代码）**

| 修订 | 设计档落点 | 真实代码对照 | 结论 |
| --- | --- | --- | --- |
| M2（兜底方向改放大） | §1.2.4 相位 3 第 ①③ 步 | `PdfViewer.vue:844 title="缩小"` / `:846 title="放大"`（`zoomBy(±0.1)`，`:730-732`）、`MAX_SCALE=3`（`reader-store.ts:21`）、夹具 3 页 ×842（`ui-shot.mjs:177-197`）、`cssSize`（`PdfViewer.vue:90`） | ✔ 落地；1600×1000 下 `.pdf-scroll` 自带滚动，兜底大概率不触发，但硬口径（放大到上限仍不可滚动即判失败）已写死 |
| M3（`.notes-empty` 读取节点） | §1.4.1 组表、§2.1、§1.4.3 ⑤ | `NotesPanel.vue:561`（容器）+ `:563 empty-title` 逐字 `还没有摘录` + `:564 empty-subtitle` 逐字 `在 PDF 中选中文字，点「摘录」保存到这里` | ✔ 落地（容器只判在 DOM） |
| M4（start 侧 + 阈值节点） | §1.4.4 判定表第 2/3/5 行 | `.note-actions{display:flex;justify-content:flex-end;gap:4px}`（`:1336-1340`）、`.note-body` 无内边距（`:1173-1179`）、`.note-text` 12px/1.5（`:1266-1269`）⇒ `T=1.5×12×1.5=27px`、`.note-copy` 11px/1.4（`:1347-1355`） | ✔ 落地（另见 §3.4 的恒真子句） |
| M5（加强版守卫） | §1.3.2 逐字函数 | 与需求 §0.5 逐字一致；`node:os` 为 Node 内建，无新依赖 | ✔ 落地 |
| M6（4 张截图目视留档） | §2.3 表模板 + 判定规则 | 4 处 `scrollTop = 0` 的真实位置 `ui-shot.mjs:1086 / :1109 / :1243 / :2561`，对应截图 `02-notes-list.png` / `03-notes-current-doc.png` / `08-notes-after-excerpt.png` / `32-answer-note-badge.png` | ✔ 落地（模板 + 判定规则 + 失败处理齐备） |
| M1（基线口径） | §0.1、§5.1 步骤 0、§5.2 | 本机实跑 112 / 153 / `failure=null` | ✔ 落地 |

**三条断言的构造性（走查判定）**

- **r11-4（N74-1）**：`seedNotes()` 第 1 条 = `n-current-1`，`page 1`、`text` 逐字 `We study retrieval over long documents where the attention budget is the binding constraint.`（`ui-shot.mjs:302-310`）；`undoSnippet = text.slice(0,12)+"…"`（`NotesPanel.vue:103-107`）⇒ ⑧ 的 `已删除「We study ret…」· 第 1 页` 成立；`.notes-undo` 的 `v-if="notesStore.pendingUndo"`（`NotesPanel.vue:506`）位于模板顶层面（`:525` 起才是 loading/error/empty 分支）⇒ 与 `hasNotes`/`status` 无耦合，删空后仍在 DOM；`deleteRowByText`（`:4858-4872`）、`undoSnapshot`（`:4875-4887`）、`clickUndo`（`:4898-4903`）、`notesNotice`（`:4905-4912`）都是**既有** helper；`已还原该条笔记` 逐字命中（`NotesPanel.vue:239`）；stub 的 `notesRestore` 先写盘再延迟（`:884-888`），重写用 `JSON.stringify({version:1,notes},null,2)+"\n"`（`:451-454`）⇒ ⑩（hash 变化）与 ⑮（字节回复）都可判。
- **r11-5（N74-2）**：`.layout-left{width:var(--pix-left-width)}`（`AppLayout.vue:116-118`，默认 `variables.css:112` = 268px，窄屏分支同值 220px：`AppLayout.vue:169-179`）⇒ ③⑧ 可判；`narrowProbe()` 逐行读矩形；`repaint`（模块级 `:1021-1024`）与 `win` 在同一场景作用域可用；`.note-copy` 是 `.note-actions` 第一个元素子节点、`.note-ask-wrap` 在其后、`.note-actions` 是 `.note-body` 最后一个元素子节点（`NotesPanel.vue:658-680`）⇒ ⑦ 可判；既有 65-5（`:5813-5839`）不被替换。
- **r11-1 / r11-2（N73-1 组）**：`.pdf-toolbar` 内 `title="在文档中搜索"` 的 v-btn 真实存在（`PdfViewer.vue:847 @click="openSearch"`），面板由 `v-if="searchOpen && readerStore.pageCount > 0"` 门控（`:850-855`；根类 `PdfSearchPanel.vue:399`）；`button[title=…]` 的查询手法已被既有 `clickNext()`（`.pdf-page-indicator button[title="下一页"]`，`ui-shot.mjs:1470`，在多个绿色场景中使用）证成。`.pdf-capture-fab`（`PdfViewer.vue:910`）内 v-btn 走 `toggleCaptureMode`（`:456-458`，二态）⇒「读 `.capture-layer` 未开才点」的防护必要且正确；`.capture-layer`（`:896-899`）与 `.pdf-viewer.capture-mode`（`:842`）可判；退出走 `exitCaptureMode`（`:467-470`）。**登记**：`.capture-layer` / `.pdf-capture-fab` / `.pdf-search-panel` 在现网 `ui-shot.mjs` 里 0 引用（本组是首次使用）。
- **r11-3（N73-2 组）**：浮层是 `v-show`（`PdfSelectionQuickAsk.vue:190-196`）⇒ `getComputedStyle().display` 可判；`FEEDBACK_MS=2500`（`:22`）、反馈文案 `已摘录 · 第 ${page} 页`（`:165`）；60-9 追加断言的可行性有 R10 实测背书（`R10-dev.md:190`：面板空态↔列表过渡会触发 `.notes-panel` 滚动并抑制反馈）；相位 2 的合成 scroll 是纯 capability 判据（改前必红、改后必绿）。**唯一缺陷**：前置的空态防护没有等待（见 §M2），且 `.pdf-scroll` 的自带滚动性使相位 3 的放大兜底大概率不触发（已写明硬口径）。
- **r11-6（可选）**：stub 的 `notesRestore` 确实「先写盘、后延迟」（`:884-888`），`setNotesRestoreDelay` / `notesRestoreCalls` 控制口存在（`:960-965`），`resolvedAt` 需新增（白名单允许，不改 API 面）；`goHome`（`:1436`）/ `sleep`（`:1343`）都在作用域内。

**结论：14 条新断言（13 + 可选 1）全部可构造**，除 §2 的两处（F1 与 F2）按字面不可满足外，其余判据与真实 DOM / helper 逐条对得上。

#### 1.5（重点 5）N75 的编译命令在 Windows / git bash 下是否逐字可用

| 项 | 核对结果（本次实测 / 走查） |
| --- | --- |
| `TSC_JS = join(PIX_DIR,"node_modules","typescript","lib","tsc.js")` | 文件存在（267 B）；内容为 `enableCompileCache()` + `module.exports = require("./_tsc.js")` ⇒ `node tsc.js -p <cfg>` 可用（typescript 5.8.3） |
| `spawnSync(process.execPath, [TSC_JS,"-p",TSCONFIG], {cwd: PIX_DIR})` | 与仓库内既有零依赖脚本 `pix/scripts/assert-main-esm.mjs` 同范式；`pix/package.json` 的 `"type":"module"` 不妨碍 `.mjs` 入口 |
| `types:["node"]` + `typeRoots:[<repo>/pix/node_modules/@types]` | `pix/node_modules/@types/` 下列出 `node`（另有其它），`@types/node` 在 devDependencies（`^22.0.0`） |
| tsconfig 字段合法性 | `module/commonjs`、`target/ES2022`、`rootDir`、`outDir`、`strict`、`skipLibCheck`、`esModuleInterop`、`types`、`typeRoots`、`files` 均为 `tsc -p` 合法字段；`rootDir=<repo>/pix/src` + `files=[src/main/notes-store.ts, src/main/library-root.ts]` ⇒ 产物落在 `out/main/…`（与设计档一致）；`../shared/types.js` 是 `import type`（`notes-store.ts:20-31`）⇒「允许附带 `out/shared/types.js`」的期望与实际一致 |
| 依赖树封闭（决定 `createRequire` 能否直载） | `notes-store.ts:13-25` 只 import `node:crypto` / `node:fs` / `node:path` / `./library-root.js` / type-only `../shared/types.js`；`library-root.ts:8-9` 只 import `fs` / `path` ⇒ 无 electron、无渲染层；两处 `require` 解析到同一绝对路径 ⇒ 同一模块实例（`setLibraryRoot` 两侧同时生效）成立 |
| 产物校验与退出码 | `readdirSync(dir,{recursive:true})`（Node ≥ 20.1）在本机 node `v24.19.0` 可用；`finally` 自清理 + 只打印警告不改退出码 + 仓库零残留，与 §5.1 步骤 4 的 `git status` 判据自洽 |
| 26 条断言与源码抽核 | 逐字文案全部命中：`笔记写入失败` / `笔记文件未损坏，无需重建` / `暂无笔记可导出` / `没有可撤销的删除` / `该笔记已重新存在，无法撤销` / `该笔记内容已重新存在，无法撤销`（`notes-store.ts:36-53`）；校验顺序（无槽 → id 不符 → 跨 root → 读文件 → 同 id 占用 → 去重键占用）见 `:378-410`；`writeFileAtomic` 的 `<target>.tmp` + `renameSync`、`removeTemp` 用 `rmSync(tmp,{force:true})`（无 `recursive`）⇒ 预置 `notes.json.tmp` 为目录时该目录在失败窗口内保持存在 ⇒ #7 的 `EISDIR` 注入成立；`splice(Math.min(slot.index, notes.length), 0, slot.note)` 按原下标插回（`:404-406`）；`resetCorruptNotes` 成功即 `undoSlot = null`（`:440`）、`not-corrupt` 早返回（`:422`）；备份名 `notes.json.corrupt-<yyyyMMdd-HHmmss>`（`:414-427`）；导出标题 `## ${docPath}（N 条）` + `> ` 行前缀（`:264-281`）；`serializeNotes` 2 空格 + 末换行（`:222-224`） |

⇒ **N75 的编译面、属性面与技术面逐字可用**；唯一缺陷是断言组 `undo-slot-lifecycle` 的步骤顺序（§M→F1）。`smoke-notes.mjs` 尚未创建，本节全部为走查 + 本机环境实测，未运行脚本本身。

#### 1.6（重点 6）白名单一致性与既有断言 / 截图影响

- **白名单一致**：设计档 §4 与需求 §6 逐条一致 —— `NotesPanel.vue`（N73-1 必改 + N74-2 条件式样式面）、`PdfSelectionQuickAsk.vue`（N73-2）、`scripts/ui-shot.mjs`（N73-3 + 场景）、新建 `scripts/smoke-notes.mjs`、`pix/package.json`（仅 `scripts.smoke:notes` 一键）、`README.md`（N76 七处）、`docs/pm/R11-*.md`；`packages/**`、`package-lock.json`、`pix/src/main/**`、`src/shared/types.ts`、stores/utils/styles/其它 `.vue` 零改动。`pix/scripts/**` 不在 `pix/tsconfig.json` 的 include 内（与 `ui-shot.mjs` 同待遇 ⇒ 不进 `npm run check` 类型面），与 §1.5.7 的口径一致。
- **N73-1 影响的既有面**：仅 60-3 / 60-4（字段逐字保留、`pressSearchEsc` 单点调用）+ 60-3 截图 `60d-notes-search-cleared.png`（该相位 PDF 搜索面板未开 ⇒ 像素不变）。`@keydown` 在 `NotesPanel.vue` 恰 1 处、`preventDefault` 0 处、`addEventListener("keydown"` 0 处（现网实测），与 §1.1.3 的走查判据吻合。
- **N73-2 影响的既有面**：现网唯一「要求浮层隐藏」的断言在 `ui-shot.mjs:1187`，触发源是清空选区（`selectionchange`）而不是 scroll ⇒ 不受影响；`.notes-panel` 的 4 处 `scrollTop = 0`（`:1086 / :1109 / :1243 / :2561`）正是 §2.3 登记的 4 张截图，且均为幂等写（不产生 scroll 事件）⇒ 预期无差异（留档方式已由 M6 落地）；`.chat-messages` / `.panel-scroll` / `.map-tree` 的变化只影响「是否隐藏」，现网无依赖它们的浮层断言。
- **N73-3 影响的既有面**：清理只作用于本次 `OUT_ROOT/shots`；历史残留 `99-failure-state.png` 不在任何 MANIFEST 清单内 ⇒ 零缺失判据不受影响。本机基线实跑复核 112 张 / 153 条 / `failure=null`，新增 6 张（可选 7）与新增 4 组（可选 5）不与之冲突；`MEASUREMENTS.json` 的既有 label 分布已留档（`notes-search:10`、`notes-undo:14`、`notes-copy:6`、`notes-sort:7`、`map-chapter-filter:22` 等）。
- **N74 影响的既有面**：只新增场景；`r11-4` 末 `restoreStandardSeed()`、`r11-5` 的 `removeProperty` + 回 268 复位都写成硬判据 ⇒ 不污染后续场景；65-5 只被追加、不被替换。
- **未发现遗漏**的既有 label / 截图名 / 字段改动；`excerptFirstSpan` 的注释改写已在 §1.2.3 与 §4 登记（行为不变）。
- 一处**文档级**不一致：§2.4 的零 diff 命令把 `README.md` / `pix/package.json` 与真正的零 diff 路径并列（见 §M→F4）。

### 2. must-fix 清单（4 条）

**F1（判据按字面不可满足）N75 组 `undo-slot-lifecycle` #4 → #5 之间缺「重建槽」步骤**

- 问题：设计档 §1.5.5 组 3 的 #4 要求「写坏 `notes.json` → `resetCorruptNotes()` 成功 ⇒ **槽已清** + 重建为空库（`notes: []`）」；#5 紧接着要求「文件未损坏时 `resetCorruptNotes()` ⇒ `not-corrupt` + 逐字文案 + **不清槽（随后仍可还原）**」。执行到 #5 时槽已被 #4 清空、文件也已被重建为空 ⇒「随后仍可还原」必然 `not-found` 红灯，该条断言在按字面执行的顺序下不可满足。
- 证据（真实代码）：`pix/src/main/notes-store.ts:440`（`resetCorruptNotes` 成功分支内 `undoSlot = null;`，注释「重建语义 = 从空库开始」）、`:422`（`not-corrupt` 在任何槽操作之前早返回）、`:382`（`restoreNote` 首条校验 `if (!slot) return restoreFailure("not-found", RESTORE_EMPTY_MESSAGE)`）。设计档 §1.5.5 组 3 与需求 §3 组 3 同款。
- 修法要求：#5 的步骤列显式补一步「`addNote` 1 条 → `deleteNote` 该条（重新设槽、文件保持合法）」再调用 `resetCorruptNotes()`；判据文字与条数不变（仍 6 条）。

**F2（前置防护是空操作）`r11-3` 前置的 `.notes-empty` / `rows === 0` 没有等待**

- 问题：§1.2.4 前置写「`enterNotesProbe([], 0)`（0 条种子；空断言防护：`.notes-empty` 在 DOM、`.notes-search` 行不在 DOM、`rows === 0`）」。但 `enterNotesProbe(seed, 0)` → `openNotesPanel(0)` 内部等待式是 `document.querySelectorAll(".note-row").length === 0`（`ui-shot.mjs:3069-3072`），**在 0 条时恒真**；而切标签会同步把 store 置为 `loading`（`WorkspacePage.vue:202` → `notes-store.ts:147-150` `status.value = "loading"`）⇒ `.notes-empty` 在 IPC 返回前**不在 DOM**（模板 `NotesPanel.vue:525` 的 loading 分支优先）。按字面实现，前置防护会采到中间态，相位 1 的 ①（`.notes-search` 行在 DOM）也可能在面板尚未 ready 时读取 ⇒ 误红 / 抖动。
- 证据：`ui-shot.mjs:3069-3072`、`:4760-4767`（`enterNotesProbe` 原样传 `rows`）、`pix/src/renderer/pages/WorkspacePage.vue:202`、`pix/src/renderer/stores/notes-store.ts:147-150`、`pix/src/renderer/components/workspace/NotesPanel.vue:561-566`（空态分支）。
- 修法要求：前置改为显式有界等待（例如 `await waitFor("空态就绪", SEL.notesEmpty)`，或等 `.notes-count` 逐字 `共 0 条`）后再读探针；`enterNotesProbe([], 0)` 的调用可保留。

**F3（与自身冻结判据互斥）N74-2「修」分支的首选改法会把判定项 ⑥ 判红**

- 问题：§1.4.4「修 or 不修」边界把「**首选** `.note-actions { flex-wrap: wrap }` 或等价的收缩/换行策略」写成修复方向；同一节的判定项 ⑥ 冻结「未换行：`.note-copy` 与 `.note-ask-wrap` 的 `y` 差 ≤ 1，且 `actions.h <= T = 27px`」。若 220px 下真的溢出并按「首选」加 `flex-wrap`，两个按钮必然换行 ⇒ `y` 差 ≈ 17.4 + 4 = 21px、`actions.h ≈ 39px` ⇒ ⑥ 恒红；而判据是冻结的（不得改写）⇒「组 `r11-note-actions-narrow` 全绿」在「修」之后仍不可达，形成死循环。
- 证据：`NotesPanel.vue:1336-1340`（`.note-actions{gap:4px}`）、`:1347-1355`（`.note-copy`：`padding:1px 6px`、`font-size:11px`、`line-height:1.4`）；设计档 §1.4.4 判定表第 5/6 行与边界表第 1 行。
- 旁证（**非** 220px 实测，为 268px 基线实测 + 推算）：本次基线实跑 65-5 记录 `copyBox.w=34 / askBox.w=34 / gap=4`（内容合计 72px）、`bodyBox.w=217`（左栏 268px 时）；按左栏 268→220（−48px）推算，220px 下 `.note-body` ≈ 169px ≫ 72px ⇒ 实际很可能落在「不修」分支。但 red 分支的指令必须自洽。
- 修法要求：把「首选」改为保持单行的收缩写法（例如收窄 `.note-copy` / `.note-ask` 的 `padding` 或 `.note-actions` 的 `gap`），并显式写明「`flex-wrap` 与判定项 ⑥ 互斥、不作为候选」；或写明「若必须换行 ⇒ 需回到需求档改判据」的升级路径。（配套：若采用收缩方案，建议把「只允许调整 `padding`/`gap`」写进设计档，避免开发顺手改 `font-size` 触发 §5.2 的 `fontSize` 非预期差异判据。）

**F4（与上游要求相矛盾）§2.4「零 diff 清单与判据」把 `README.md` / `pix/package.json` 列入零 diff 路径**

- 问题：§2.4 的 `git diff -- …` 命令把 `README.md pix/package.json` 与真正的零 diff 路径（`pix/src/main`、`PdfViewer.vue`、`PdfSearchPanel.vue`、`ChatPanel.vue`、`KnowledgeMap.vue`、`LibraryPanel.vue`、`ReaderPanel.vue`、`package-lock.json`、`pix/tsconfig*.json`、`pix/vite.config.ts` 等）并列，期望句写作「上面 `git diff --` 的路径里只有 deliberately 复查过的那几个」（中英混杂、无判别力）；而 §4 / N75 / N76 明确要求这两个文件**必须有 diff**（`scripts.smoke:notes` 一行 + README 七处行内更正；需求 §5.4 的第 14/15 项已给出单文件判据）。按 §2.4 字面走查会得到「README / package.json 有 diff ⇒ 疑似越界」的错误信号，且与 §5.4 第 14/15 项自相矛盾。
- 修法要求：把 `README.md` / `pix/package.json` 从零 diff 清单移出，另列「预期有 diff 的两个文件 + 逐字判据」（可直接引用需求 §5.4 #14/#15 的两行命令与期望）；零 diff 清单只保留真正应为空的路径。

### 3. 非阻塞（7 条，建议在开发档开工前一次性吸收）

1. **§1.2.2 判定表缺 2 行（继承需求 §0.4 的同款缺口）**：`pre{overflow-x:auto}`（`ReaderPanel.vue:449-455` + `main.css:204`）与 `.knowledge-map-slot`（`ReaderPanel.vue:306 overflow:hidden` + `KnowledgeMap.vue:80-82` 的 `scrollIntoView`）都在 stage 子树内、都是真实滚动源，结论均为「隐藏」（与行 2 / 行 3 同向，无行为差）。建议补行或加注记，并把 §1.2.3 的走查判据从「表格 8 行」改为「8 行 + 注记」，避免走查角色据此判「实现与表格不一致」。
2. **N73-1 的「不受影响」行建议补显式残留清单**：`captureMode` / `searchOpen` 开启时，备注输入、重命名对话框输入、页码输入（自带 `.esc.prevent`）等仍会被阅读区语义抢先处理；设置页 / 首页因 `PdfViewer` 卸载不受影响。写清楚可免「为什么只修笔记搜索框」的反复确认。
3. **§0.5 建议备注守卫的残余边界**：只保证「tmpdir 之下 ∧ 与仓库互不包含」，不防「tmpdir 内的他者目录」也不防并发（同 `OUT_ROOT` 并发互删）。本轮纪律已覆盖，写明即可。
4. **§1.4.4「动作区不溢出（start 侧）」的首个子句恒真**：`.note-actions` 是 `.note-body` 的拉伸 flex 子项（无 `width` 声明）⇒ `actions.left === body.left` 恒成立；本次基线实跑 65-5 记录 `actionsBox.x === bodyBox.x === 45`、两者 `w === 217`。真正有判别力的是后两条子元素判据（`.note-copy` / `.note-ask-wrap` 的 `left >= actions.left - 1`）。建议标注「恒真，仅留档」，以免误以为该条覆盖了 start 侧。
5. **§0.1「既有 helper」清单不全**：本次实际要用到的 `undoSnapshot`（`:4875`）、`clickUndo`（`:4898`）、`notesNotice`（`:4905`）、`openNotesPanel`（`:3069`）、`repaint`（`:1021`）、`rowFinder`（`:2627`）都未列入；§1.4.3 的 `data` 恰好引用了前三个名字。补齐可免「是否要新增同名 helper」的歧义（三个 helper 已存在，设计档无错，只是清单不全）。
6. **§1.4.3 的「`r11-4` 全场耗时必须 < 8 s」表述不准**：8 s 是撤销行定时器 `UNDO_ROW_MS` 从**删除时刻**起的窗口，而 `r11-4` 前置的 `enterNotesProbe()`（goHome → 进工作区 → 等树行 → 开 PDF → 等页 → 切标签）本身就远超 8 s。建议改为「从 `deleteRowByText` 到 `clickUndo` 必须 < 8 s；`restored` 相位的 ⑭ 紧跟 `waitFor` 采集」，否则开发可能为了满足字面而裁剪前置（反而破坏复位纪律）。
7. **N73-2 的 `resolveStage()` 在每次 scroll 里做一次 `document.querySelector`**：`.pdf-scroll` 是高频滚动源（`@scroll.passive`），新增查询是可接受的成本，但建议在设计档的实现注记里点一句「不做缓存」，避免开发自行加缓存而引入「stage 换 DOM 后失效」的新分支（需求反需求 3 只禁 debounce/throttle，未提缓存）。

### 4. 结论

- **verdict：revise**。F1–F4 都是一句话到三句话级别的判据修正，不需要改动需求档、不扩大白名单、不新增依赖；修完即可开工。
- 设计档的判定工具链（走查 / check / 烟测-主进程 / 离屏）与白名单自洽；`npm run check` 与一次真实离屏实跑均绿（112 张 / 153 条 / `failure=null`），证明「R11 动工前基线」在本机可复现，M1 的基线口径可直接采用。
- 本评审的所有结论均来自真实文件内容、真实 `grep` / `git` 读数与上述两条实跑命令；未运行的项（新场景运行态、`smoke-notes.mjs`）已逐条标注为「走查 + 静态判定」。

---

## 代码审查（R11）

> 独立复验（冷启动）：本节的每条结论都来自本步实跑输出或真实文件内容，未复用交付方结论与产物。
> 环境：`E:/develop/PiX-Read`、Windows + git bash、`node v24.19.0`；`git status --short` 复验前后一致（无遗留）。
> 本步唯一写操作 = 追加本节目录；未运行 `npm run build` / `npm test` / `npm run package` / `npm run dev`，未执行任何 git 写命令，未改 `packages/*`，未引入依赖。

### 1. 实跑证据（命令 + 原样输出摘要）

**1.1 工程门（唯一）**

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
# ⇒ CHECK_EXIT=0
```

**1.2 独立离屏取证（自有目录 + 预置残留）**

```bash
REVIEW="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-review"
rm -rf "$REVIEW/shots"; mkdir -p "$REVIEW/shots"
printf 'fakepng' > "$REVIEW/shots/99-failure-state.png"; printf 'fakepng' > "$REVIEW/shots/zz-stale.png"
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="$REVIEW" ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_EXIT=$?"
# ⇒ [ui-shot] 结束：产出 119 张截图
# ⇒ UI_SHOT_EXIT=0
```

读数（本步自行解析 `MANIFEST.json` / `MEASUREMENTS.json` 计算，非引用交付方表格）：

```text
基线 pix-v05-r11-base  : shots=112 measurements=153 failure=null generatedAt=2026-09-16T04:49:08.848Z（label 集合不含任何 r11-*）
本次 pix-v05-r11-review : shots=119 measurements=167 failure=null
MISSING_SHOTS []            # 基线 112 张一张不少
ADDED_SHOTS   = 7 张 r11-*.png（r11-1/2/3/4/5/5b/6）
LABEL_MISSING []            # 基线 32 个 label 全部存在且计数不减
ONLY_IN_BASE  []            # 既有 record 一条不缺（按 label|data.phase 计）
ONLY_IN_AFTER = 14 条 r11-* record（4+3+3+3+1）
预置残留 STALE_PRESENT_AFTER [] / 白名单外条目 STRAYS_AFTER [] / 磁盘 png 119 = 清单 119
```

`CHANGED_DATA` 共 17 条既有 record，逐条核对后差异只有三类，全部为环境驱动：

| 差异类 | 实例 |
| --- | --- |
| `OUT_ROOT` 绝对路径串（基线与验收不同目录） | `tree-progress`×3、`reader-state-writes`×4、`workspace-switch`×3、`answer-save`（`reentrant`）、`answer-anchor`×2 等 |
| `Date.now()` 派生值 | `notes-undo`（`restore`）的 `createdAt`/`seedCreatedAt`、`answer-notes-list`（`badges`）的生成 id、`reader-state-degrade`（`rebuilt`）的 `updatedAt` |
| 毫秒计时 | `reader-state-writes`（`thirty-changes`）75→70、`map-scale`（`long-book`）timing 90→89 |

**冻结 record 逐字一致（`data` 字符串级相等，本步复算）**：`notes-search|esc`（60-3）、`notes-search|clear-button`（60-4）、`notes-copy|geometry`（65-5）、`notes-search|search-row-form`、`notes-search|delete-all-then-excerpt`（60-9 未被改写）。⇒ 无几何 / 文案 / 门控类差异。

**1.3 新增 14 条 record 逐条核对（本步实测值 vs 冻结判据表）**

| record（label / phase） | 本步实测关键值 | 判据 | 结论 |
| --- | --- | --- | --- |
| `r11-esc-scope` / `pdf-search-open` | before `{value:"Table",focused:true,clearInDom:true,rows:1}`、after `{value:"",focused:false,clearInDom:false,rows:4,countText:"共 4 条"}`、`panelInDom:true`、`hashSame:true` | ①–⑦（含空断言防护） | 全绿 |
| `r11-esc-scope` / `pdf-search-close-control` | `panelInDom:false` | ⑧ | 全绿 |
| `r11-esc-scope` / `capture-mode` | `entry{layerInDom:true,viewerCapture:true}`、after `layerInDom:true` / `viewerCapture:true` / `value:""` / `focused:false` / `rows:4`、`hashSame:true` | ①–⑧ | 全绿 |
| `r11-esc-scope` / `capture-mode-exit-control` | `layerInDom:false`、`viewerCapture:false`、`hashSame:true` | ⑨–⑪ | 全绿 |
| `r11-quick-ask-scroll-scope` / `excerpt-into-empty-panel` | `rows:1`、`searchInDom:true`、`quickAsk{display:"flex",feedbackClass:"quick-ask-feedback is-ok",feedbackText:"已摘录 · 第 1 页"}`、`waitMs:261` | ①–③（≤1500 ms） | 全绿 |
| `r11-quick-ask-scroll-scope` / `notes-panel-scroll` | 派发后 `display:"flex"`、反馈文本不变、`fileCount:1`、`hashSame:true`、`elapsedSinceFeedbackMs:262` | ④–⑥ | 全绿 |
| `r11-quick-ask-scroll-scope` / `reader-scroll-control` | `scrollHeight 2670 > clientHeight 950+40`（`zoom.clicks:0`、`scaleText:100%`）、`quickAskBeforeScroll display:"flex"`、`scroll.before 48 → after 200`、`quickAskAfterScroll display:"none"`、`fileCount:1`、`hashSame:true` | ②⑦⑧⑨ | 全绿 |
| `r11-undo-after-empty` / `before-delete` | `rows:1`、`countText:"共 1 条"`、`emptyInDom:false` | ①–③ | 全绿 |
| `r11-undo-after-empty` / `after-delete-empty` | `rows:0`、`countText:"共 0 条"`、`empty{inDom:true,title:"还没有摘录",subtitle:"在 PDF 中选中文字，点「摘录」保存到这里"}`、`undo{rowCount:1,text:"已删除「We study ret…」· 第 1 页",btnText:"撤销",btnTitle:"还原这条笔记"}`、`hashChanged:true` | ④–⑩ | 全绿 |
| `r11-undo-after-empty` / `restored` | `rows:1`、`emptyInDom:false`、`undoRowInDom:false`、`notice{isSuccess:true,text:"已还原该条笔记"}`、`searchInDom:true`、`hashSame:true` | ⑪–⑯ | 全绿 |
| `r11-note-actions-narrow` / `default-width` | `layoutLeftWidth:268`、两行 `scrollOverflow:0` | ①② | 全绿 |
| `r11-note-actions-narrow` / `narrow-220` | `layoutLeftWidth:220`、`threshold{node:".note-text",fontSize:12,T:27}`、`scrollOverflow:0`、`actionsLeft 45 >= bodyLeft 45`、`copyLeft 142` / `askWrapLeft 180 >= 45`、三者 `right 214 <= .layout-left.right+1`、`copyY === askWrapY`、`actionsHeight 17.390625 <= 27`、DOM 关系三项全真 | ③–⑦（M4 全表） | 全绿 |
| `r11-note-actions-narrow` / `restored-width` | `layoutLeftWidth:268`、`scrollOverflow:0` | ⑧⑨ | 全绿 |
| `r11-undo-scope-stale` / `stale-scope` | `restoreCallsDelta:1`、`resolvedAt 1789537272128 > panelReadyAt 1789537263154`（迟到 8984 ms）、`rows:2` 且文本逐字等于第 ④ 步写入的两条、`countText:"共 2 条"`、`notice:null`、`hashSame:true` | ①–⑥ | 全绿 |

**1.4 截图目视（read 工具逐张看，非交付方结论）**

| 截图 | 目视所见 | 判据 |
| --- | --- | --- |
| `r11-1-esc-pdf-search-panel.png` | 笔记搜索框为空（placeholder `搜索原文或备注`）、列表 4 行 `共 4 条`、PDF 搜索面板仍在（`在文档中搜索` 输入框 + 结果导航） | N73-1 行 3 |
| `r11-2-esc-capture-mode.png` | 框选提示条「拖拽框选要提问的区域，Esc 取消」仍在、查询已清空、`共 4 条` | N73-1 行 2 |
| `r11-3-excerpt-feedback-visible.png` | 浮层「已摘录 · 第 1 页」可见，同框笔记面板已由空态切到 1 行列表 | N73-2 |
| `r11-4-undo-row-after-empty.png` | 空态（`还没有摘录` / `在 PDF 中选中文字，点「摘录」保存到这里`）+ 撤销行「已删除「We study ret...」· 第 1 页」+ `撤销`，`共 0 条` | N74-1 |
| `r11-5b-note-actions-narrow-row.png` | 220px 行裁剪：`复制` / `追问` 同行右对齐、无裁切 | N74-2 |
| `r11-6-stale-scope.png` | 2 行（逐字等于外部改写后的两条）、`共 2 条`、无通知 | N74-3 |
| `08-notes-after-excerpt.png`（M6 必看） | 与基线并排目视一致：浮层「已在笔记中」两图均可见、列表与正文逐项一致；本次 08 与基线差 15 字节 | §0.7 内容目视 |

**1.5 守卫负向控制（独立复跑）**

```bash
cd E:/develop/PiX-Read && test ! -e "E:/develop/pix-shot-guard-probe-review" && echo "PROBE_ABSENT=yes"
# ⇒ PROBE_ABSENT=yes
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="E:/develop/pix-shot-guard-probe-review" ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "EXIT=$?"
# ⇒ [ui-shot] 拒绝启动：PIX_SHOT_ROOT 必须位于系统临时目录内，且不得与仓库路径互相包含（当前：E:\develop\pix-shot-guard-probe-review）
# ⇒ EXIT=1
test ! -e "E:/develop/pix-shot-guard-probe-review" && echo "PROBE_ABSENT_AFTER=yes"
# ⇒ PROBE_ABSENT_AFTER=yes（零副作用：目录未被创建）
```

另：不设 `PIX_SHOT_ROOT` 时默认值按同一判定式复算 ⇒ `inTmp=true` / `crossesRepo=false`（默认路径不会被守卫误拒，`ui-shot.mjs` 的常规用法不受影响）。

**1.6 数据面烟测（连续两次 + 故障注入）**

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" node scripts/smoke-notes.mjs; echo "SMOKE_NOTES_EXIT=$?"   # ×2
# ⇒ 两次均 SMOKE_NOTES_EXIT=0；[通过] 26 / [失败] 0；末行逐字 通过 26 / 失败 0
# ⇒ ls -d %TEMP%/pix-smoke-notes-* 计数 = 0（finally 自清理生效）；git status --short 仍只列白名单文件
```

脚本自审：断言由 `check(groupName, index, desc, ok, actual)` 的布尔值判定（描述文本与比较字面分离），26 条都驱动真实文件系统（`setLibraryRoot` 切换、真实写坏 `notes.json`、`notes.json.tmp` 预置为目录造 EISDIR、真实 `rmSync` 外部删文件），编译面为仓库内 `pix/node_modules/typescript/lib/tsc.js` 编译仓库内 `src/main/{notes-store,library-root}.ts`，产物白名单 + 两侧模块实例一致性各有一道硬门，导入面只有 Node 内建（无 electron / 渲染层 / `packages/**`）。

故障注入（注入只落在 `pix/scripts/` 下的临时副本 `_r11_review_inject*.mjs`，跑完即删；交付文件未被触碰，其 sha256 复算 `da3c8c41f283643b8b48ddfc6932d5e8d2989011d56495c7df18997fe1da67d5` 与开发档记录一致）：

```text
注入 A（把 undo-failures #7 的比较字面改成「笔记写入失败X（注入）」）
# ⇒ INJECT2_EXIT=1；恰 1 条 [失败] undo-failures #7 …：{"success":false,…,"error":"笔记写入失败"}；其余 25 条照常；汇总 通过 25 / 失败 1
注入 B（TSC_JS 指向不存在路径）
# ⇒ INJECT3_EXIT=1；[smoke-notes] typescript 编译失败（status=1），不进入断言；断言行 0 条；汇总 通过 0 / 失败 0
```

⇒ 脚本确实会红（判别力成立），且失败路径的两种表现与需求 §0.6 / 设计 §3 第 5/7 行逐字一致。附注：注入 A 的第一次尝试改的是「描述文本」而非「比较字面」，无任何效果 —— 这正是描述与判据分离的正确结构，不构成缺陷。

**1.7 红线走查**

```text
git status --short      : 仅白名单（M README.md / M pix/package.json / M pix/scripts/ui-shot.mjs /
                          M NotesPanel.vue / M PdfSelectionQuickAsk.vue / ?? docs/pm/R11-*.md /
                          ?? pix/scripts/smoke-notes.mjs）
禁项 grep               : `: any` 0 处、`await import(` 0 处、`import(` 0 处（4 个源码/脚本文件）
冻结文件零 diff          : pix/src/main、pix/src/shared、utils、stores、composables、pages、assets、
                          PdfViewer.vue、PdfSearchPanel/ChatPanel/KnowledgeMap/LibraryPanel/ReaderPanel.vue、
                          tsconfig*.json、vite.config.ts、package-lock.json、packages ⇒ 全部为空
N73-1 走查              : stopPropagation 1（NotesPanel.vue:204，在 onSearchEsc 内）；preventDefault 0；
                          addEventListener("keydown" 0；@keydown 1（:436，绑定 .notes-search-input）
N73-2 走查              : scroll 监听 1 处 capture（:180）+ 对称移除（:185）；instanceof Node 1（:140）；
                          stage.contains( 2（:130 既有 / :141 新增）；closest( 全文件 0
N73-3 走查              : rmSync(SHOTS_DIR 1 处（:6405）在 mkdirSync(OUT_ROOT)（:6402）之后、
                          writeFixtures()（:6407）之前；守卫 app.exit(1)（:6394）< :6405；
                          自检块在 MEASUREMENTS.json（:6474）之后、server.close()（:6498）之前；
                          assertOutRootSafe() 为 main() 首条语句（:6400）
产物残留                : 仓库内无 pix-smoke-notes-* / _r11_review* 类文件；%TEMP% 下无 pix-smoke-notes-* 目录
```

**1.8 N76 事实性核对（逐文件名落到真实目录）**

`pix/src/main` 14 文件（含 `notes-store.ts` / `reader-state-store.ts`）；`components/workspace` 8 文件；`components/session` 4（含 `GuideBlock.vue`）；`stores` 7（含 `reader-state-store.ts` / `notes-store.ts`）；`composables` 4（含 `useQuickAsk.ts`）；`utils` 8；`ipc-handlers.ts` 注册面：`notes-*` 7、`reader-state-load/save` 2、`window-*` 4、`delete-session` 1；`ChatPanel.vue:881/900/902` 的 `重命名当前对话` / `.session-delete-btn` / `删除该对话`·`再次点击确认删除` 与 `WorkspacePage.vue:174` 的 `window.pixApi.deleteSession` 均在。⇒ README 的每处更正都能在仓库内找到依据，`git diff -- README.md` 恰为 7 个子条（3 hunk / 9 增 7 删）。

### 2. 验收逐条结论

| 需求 | 判据面 | 结论 | 本步证据 |
| --- | --- | --- | --- |
| N73-1 | 走查 5 条 / check / 离屏新断言 / 旧断言保留 | **通过** | §1.7；`CHECK_EXIT=0`；`r11-esc-scope` 4 条全绿 + 2 张截图目视；60-3 / 60-4 `data` 与基线字符串级相等 |
| N73-2 | 走查（唯一规则 + 8 行判定表）/ check / 离屏新断言 / 旧断言保留 / 内容目视 | 通过；**【离屏·追加】60-9 未落地（D1）** | §1.2 / §1.3 / §1.4；`r11-quick-ask-scroll-scope` 3 条全绿（面板滚动不隐藏、阅读区滚动隐藏）；60-9 的 record 与基线逐字相等；08 目视一致 |
| N73-3 | 走查 / 守卫负向控制 / 自检判据 / 预置残留复核 / 零缺失 | **通过** | §1.2（零缺失 + 无白名单外条目）、§1.5（`EXIT=1` + 逐字文案 + 目录未被创建） |
| N74-1 | 离屏 `r11-undo-after-empty` 3 条 + 截图 | **通过** | §1.3 / §1.4（删空后 `.notes-undo` 仍在、文案逐字、撤销后字节回复） |
| N74-2 | 离屏 `r11-note-actions-narrow` 3 条 + 2 张截图 + 「修 or 不修」 | **通过（不修）** | §1.3（220px 五类判据全绿、`T=27`、复位 268）；`NotesPanel.vue` 无样式面 diff |
| N74-3（可选） | 离屏 `r11-undo-scope-stale` 1 条 | **已落地并通过** | §1.3（迟到 8984 ms、零副作用） |
| N75 | 连续两次实跑 / 走查 / check / 失败路径抽样 | **通过** | §1.6（26/26 ×2、注入 A/B 均按预期红、零残留、`package.json` 仅 `scripts` 一行） |
| N76 | 走查（只含 7 子条 + 文件名可查） | **通过** | §1.8 |
| 零缺失回归 | 112 张截图 / 153 条测量零缺失、`failure=null`、退出码 0 | **通过** | §1.2（`MISSING_SHOTS []` / `LABEL_MISSING []` / `UI_SHOT_EXIT=0`） |
| 红线 | 白名单 / 禁项 / 冻结零 diff / 无残留 | **通过** | §1.7 |

### 3. must-fix 清单（1 条，需负责人裁决；无代码面 must-fix）

1. **D1 —— 需求 N73-2「【离屏·追加】60-9 加一条 `.quick-ask-feedback.is-ok` 逐字断言（有界等待 ≤1500 ms）」按字面未通过。**
   - 事实（本步可判部分）：`pix/scripts/ui-shot.mjs:5374` 之后的 60-9 段**没有**该断言；60-9 的 `record` 与 `failures` 与基线**逐字相等**（§1.2 的 `CHANGED_DATA` 不含 `notes-search|delete-all-then-excerpt`）。
   - 交付方给的未落地理由（`R11-dev.md` §4.8 的页内插桩：反馈态 `+42` 出现、`+43` 被重置回 actions）**我在本步的允许范围内无法复核**（复核需临时改 `ui-shot.mjs` 并带插桩实跑，超出本步写权限）。
   - 我能独立确认的机制侧证据：`PdfSelectionQuickAsk.vue` 的 `showFor()`（`:57-62`）进入即 `mode = "actions"` + `feedback.value = null`，而 `onSelectionChange()` 在选区变化时调用 `showFor()`；⇒「摘录后若再来一次选区变化，反馈态会被重置」在代码上成立，与 N73-2 的滚动规则**无关**。
   - 我**不能**证伪交付方的可观测性结论，因此不把它记为代码缺陷；但作为验收判据它确实未落地，**必须由负责人二选一**：① 接受「同一用户可见属性由 `r11-3` 相位 1 承担」并同步修订 `R11-req.md` / `R11-design.md` 的该条字面；或 ② 另开一条需求处理「面板 DOM 更新触发的原生 `selectionchange` 会重置反馈」这一既有行为（需扩白名单到该组件的选区/反馈面）。在裁决前，N73-2 的【离屏·追加】面记为**未落地**。

### 4. 次级项（不阻塞收口，建议一并处置）

1. **`R11-req.md` 的事实行需更正**：N76-7 的「`notes-*` 6 个（`:468-482`）」与代码不符 —— 实际 7 个（`:468 notes-load` / `:470 notes-add` / `:472 notes-update` / `:476 notes-delete` / `:478 notes-restore` / `:480 notes-export` / `:482 notes-reset`）。README 文案未写数字，交付不受影响，仅档件证据行需改。
2. **D2（`scrollTopBefore` 实测 48 ≠ 0）与 D4（设计 §5.4 #5 的「各恰 1 处」含存量命中）**：两条偏差我均独立复核成立（48 / `resolveStage()` 4 处、`stage.contains(` 2 处、`closest(` 0 处）。登记本身没问题；建议下一轮把这两条判据的字面改成「增量口径」，避免后续评审重复解释。
3. **D3（`NOTES_RESTORE_DELAY_MS` 6000 → 9000）**：需求显式允许按实测上浮 ⇒ 不判偏差；本步实测 `sinceUndoClickMs:32`、迟到 8984 ms，余量充足。
4. **M6 的 `32-answer-note-badge.png` 运行时刻差异属环境驱动（本步交叉验证）**：用「同一代码的两次运行」比对（交付 `pix-v05-r11-after` vs 本步 `pix-v05-r11-review`）⇒ 119 张中 39 张不同，包含 `32`、`08` 甚至新增的 `r11-1` / `r11-2` / `r11-4`；而 `02` / `03` 在同代码两次运行间仍**逐字节一致**。⇒ 截图差异大类（相对时间文案 / 聊天 HH:mm）不能归因于 R11 改动。若负责人坚持「零非浮层差异」的字面口径，须先冻结 fixture 的消息时间戳（属取证脚本面，另开需求）。
5. **`r11-3` 相位 2 的 `elapsedSinceFeedbackMs` 实测 262 ms**（阈值 2400 ms）⇒ 未触发设计 §1.2.4 的「先滚动后截图」次序微调分支，无需处置，仅留档。
6. **走查覆盖面（与开发档 §8 一致）**：`.reader-content` / `.map-tree` / `document` 级滚动源在本轮仍只有走查结论；本步未为其另造场景（本轮未要求），不影响 N73-2 的判定表成立性。

### 5. 结论

- **verdict：accept。**
- 依据：唯一工程门 0 error；本步自有目录的独立离屏实跑 `exit 0` / `failure === null` / 119 张截图 / 167 条测量，基线 112 张 + 153 条 label **零缺失**，既有 record 一条不缺且冻结 record 逐字不变；新增 4 组 13 条（+ 可选 1 条）逐条与本步实测值核对全绿，关键截图逐张目视与断言一致；守卫负向控制、预置残留清理、结束自检三条判据独立复现；烟测连续两次 26/26 且两种故障注入均按预期变红；N76 的每处更正都能在仓库内找到文件依据；白名单、禁项、冻结零 diff、零残留四条红线全清。**代码面未发现 must-fix 项。**
- 唯一待处置项是 **D1（60-9 判据未落地，需负责人裁决）**：它是「需求判据的可满足性」问题而非实现缺陷 —— 我在允许的写权限内既无法复核其 1 ms 插桩，也无法构造出既不假绿又满足原字面的写法（原字面的前提是「面板滚动不再隐藏浮层 ⇒ 反馈可被事后断言」，而实际阻断者是与之无关的选区变化（selectionchange）路径上的 `showFor()` 重置）。裁决前，该一条验收面记为未落地，其余全部通过。

---

## 追加裁决（R11）

> 裁决人：迭代负责人；执笔与落档：裁决与契约追加代理。
> 本步权限：只读文件 / `cd pix && npm run check` / 离屏 `ui-shot.mjs`（指定自有 `PIX_SHOT_ROOT`）/ `node pix/scripts/smoke-notes.mjs` / 追加本节与两份追加小节；**未执行任何 git 写命令，未改任何代码，未改白名单外文件**。本步实际执行：`npm run check` ×1、离屏实跑 ×1（自有 `OUT_ROOT`，未与其它取证进程并发）。
> 本节结论只来自真实文件内容与真实命令输出（读数见 §5）；对既有结论只做两件事：① 记录裁决；② 把被取代的结论标记为「已被追加裁决取代」（不改写其原文）。

### 1. 裁决对象与两条出路

- 出处：本档「## 代码审查（R11）」§3 must-fix 1（D1）；`docs/pm/R11-dev.md`「## 修复轮（R11 代码审查 must-fix 处置）」修复轮.1。
- 争议判据（需求档 N73-2【离屏·追加】逐字）：60-9 内追加「`.quick-ask-feedback.is-ok` 文本逐字 `已摘录 · 第 1 页`（有界等待 ≤1500 ms）」。
- 两条出路（本档 §3 逐字）：
  - **①** 接受「同一用户可见属性由 `r11-3` 相位 1 承担」并同步修订 `R11-req.md` / `R11-design.md` 的该条字面；
  - **②** 另开一条需求处理「面板 DOM 更新触发的原生 `selectionchange` 会重置反馈」这一既有行为（需扩白名单到该组件的选区/反馈面）。

### 2. 裁决

**裁决 = ②：把它作为 N73-2 的组成部分修掉。** 同一用户可见目标 = **首条摘录的「已摘录 · 第 N 页」反馈必须可见**；判据字面**不修订**（60-9 恢复原字面断言，不得改写为「由 `r11-3` 承担」），改动落在产品组件 + 取证脚本（白名单扩到 `PdfSelectionQuickAsk.vue` 的选区/反馈面：**仅** `onSelectionChange` 内一处早退分支）。

冻结语义与验收面（(a)(b)(c)）逐字落档于 `docs/pm/R11-req.md`「### N73-2b（追加 · 负责人裁决）」；确切改法、离屏断言与不变量逐条落档于 `docs/pm/R11-design.md`「## 追加设计（R11 · N73-2b）」。

### 3. 裁决理由

1. **同一用户可见目标**：出路 ① 只是把「判据采不到」写进档件，用户侧行为不变 —— 「已摘录」反馈仍会在约 1 ms 后被抹回双按钮；出路 ② 直接修掉该行为，正是 N73-2 的目标「摘录反馈不被吞掉」在首条摘录场景下的完整形态。
2. **机制证据（两次独立实跑，`R11-dev.md` 修复轮.1）**：点击前静默窗 150 ms / 600 ms 两次实跑均复现「反馈 `+42` 出现 → `+43` 被重置回 actions」，`feedbackWaitMs` 分别 1565 / 1544 ms，两处探测均为 `{display:"flex", feedbackClass:null, feedbackText:null}`；静默窗放宽到 600 ms（点击前已静默 633 ms）仍复现 ⇒ 排除「点击前遗留的补派事件与点击竞态」这一替代解释。
3. **代码路径可判（本步只读核对）**：`pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue:117-135` 的 `onSelectionChange` 在不满足隐藏守卫时无条件调用 `showFor`（`:134`），而 `showFor` 进入即 `mode.value = "actions"`（`:61`）+ `feedback.value = null`（`:62`）+ 清计时器（`:63-66`）⇒ 任何晚于反馈出现的 `selectionchange`（含选区未变者）都会把「已摘录」抹回双按钮；该路径与 N73-2 的滚动规则（`onStageScroll`，`:137-143`）**互不覆盖**，是两个独立入口。
4. **不选 ① 的附带理由**：① 需要把判据字面改写成「由 `r11-3` 相位 1 承担」，而 `r11-3` 相位 1 能采到反馈靠的是「空态 → 列表」过渡恰落在 2500 ms 窗口内的时序（本步实跑 `waitMs:250`）；它不改变 60-9 组合下反馈被抹掉的事实 ⇒ 档件长期存在「写已覆盖、现场仍可复现」的落差。

### 4. 裁决对本档（与开发档）既有结论的处置

| 既有结论 | 位置 | 处置 |
| --- | --- | --- |
| 【代码审查】§3 must-fix 1（D1）「按字面未通过 … **必须由负责人二选一**」 | 本档 §3 | 裁决完成（**②**）；该条 must-fix 的处置方式 = 按 N73-2b 落码 + 复跑，验收判据 = `R11-req.md` 的 (a)(b)(c) |
| 【代码审查】§5「唯一待处置项是 D1 … 裁决前，该一条验收面记为未落地」 | 本档 §5 | 保留原文；**状态更新**为「已裁决（②）⇒ 转为待实现 / 待复跑」，不再是「未落地待裁决」 |
| 【代码审查】§2「N73-2 … 通过；**【离屏·追加】60-9 未落地（D1）**」 | 本档 §2 | 保留原文；**状态更新**为「N73-2 主条通过；追加面（60-9 字面）现由 N73-2b 承担并待复跑」 |
| 【开发档】修复轮.1「D1 判为**不接受落地**（60-9 保持 R10 原样），需负责人按评审 ①/② 裁决」 | `R11-dev.md` | **已被追加裁决取代**：其技术理由（触发链与 N73-2 无关、不能用观察器救判据、原白名单不允许改产品）仍然成立，且正是裁决选 ② 的依据；其处置结论（60-9 保持原样）不再生效 —— 60-9 追加 A1–A3 后必须为绿 |
| 【开发档】修复轮.1「**建议裁决：②**」 | `R11-dev.md` | 采纳 |
| 【开发档】终验.8 第 1 条「D1（唯一实质未销账项，需负责人裁决）」、终验.9「唯一需负责人先行处置的是 D1 的裁决」 | `R11-dev.md` | **已被追加裁决取代**：裁决已给出；销账条件 = N73-2b 落码后 `check` 0 error + 离屏 `r11-quick-ask-scroll-scope` 5 条无 `failures` + 60-9 无 `failures` 且 `data.excerptFeedback` 存在 + 既有断言零缺失 |
| 【代码审查】§4 次级项 1（`notes-*` 注册面事实行 6 vs 7） | 本档 §4 | 不受裁决影响；仍为待更正项（不阻塞）；次级项 2–6 同理 |

**待办移交（不在本裁决的写权限内）**：按 `R11-req.md` N73-2b + `R11-design.md` 追加设计落码（白名单：`PdfSelectionQuickAsk.vue`、`ui-shot.mjs`），随后复跑 `check` + 离屏（换新 `OUT_ROOT`）+ 零缺失比对 + 目视 `r11-3b-feedback-after-spurious-selectionchange.png`；提交由负责人执行。

### 5. 本步实跑留档（裁决时的现场读数，独立于交付方与开发档）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
# ⇒ CHECK_EXIT=0

cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-adj" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_EXIT=$?"
# ⇒ [ui-shot] 结束：产出 119 张截图 / UI_SHOT_EXIT=0
# ⇒ shots=119  failure=null  measurements=167
# ⇒ notes-search|delete-all-then-excerpt 的 data 键 = ["phase","steps","empty","excerpted"]（无反馈字段）、failures 缺失
# ⇒ r11-3 相位 1 waitMs=250；相位 2 elapsedSinceFeedbackMs=251；相位 3 scroll 48→200 / zoom clicks=0 / display:none
# ⇒ shots/ 一级条目除 *.png / MANIFEST.json / MEASUREMENTS.json 外 0 个（grep 无输出，退出码 1）

# 零缺失比对（命令逐字照 R11-design.md §5.2 的两段 node -e，只把 $BASE / $AFTER 换成本步的两个目录）
# ⇒ MANIFEST：{"base":112,"after":119,"missing":[],"added":7}  /  AFTER_FAILURE=null
# ⇒ MEASUREMENTS label 计次：{"baseLabels":32,"afterLabels":37,"missing":[]}
```

⇒ 与本档「代码审查（R11）」的独立读数一致（119 张 / 167 条 / `failure: null` / 既有 label 零缺失），并独立复现 D1 的现场：60-9 组合下**没有任何反馈判据**（该字面断言未落地）；按 ① 处理则永不落地，故裁决取 ②。

### 6. 裁决的边界

- 本步**不改任何代码**；`git status --short` 与裁决前逐字一致（只多出本追加节与两份追加小节，均在本轮文档白名单内）；不执行任何 git 写命令（提交由负责人完成）。
- 本裁决不改变 R11 的其它结论（N73-1 / N73-3 / N74-N76 / 零缺失 / 红线走查均不受影响），也不改变 PRD §5.7「不得删除既有场景」与 §5.9「离屏脚本是唯一 UI 回归基线」。
- 冻结语义（S1–S7）与验收判据 (a)(b)(c) 以 `docs/pm/R11-req.md` 的 N73-2b 小节为准；实现层细节以 `docs/pm/R11-design.md` 的「追加设计（R11 · N73-2b）」为准；两者与本节的裁决结论冲突时以本节为准。

---

## 代码审查（R11 · N73-2b）

> 执行：2026-09-16（Windows + git bash，仓库根 `E:/develop/PiX-Read`），独立代码审查员（冷启动，未复用交付方结论与产物）。
> 对象：`R11-dev.md`「### 修复轮.4 N73-2b 落地（追加裁决 ②）」对应的**真实工作树增量**（`git diff`）、`R11-req.md`「### N73-2b（追加 · 负责人裁决）」、`R11-design.md`「## 追加设计（R11 · N73-2b）」。
> 本步权限：只读文件 / 追加本节 / `cd pix && npm run check` / 离屏 `ui-shot.mjs`（指定自有 `PIX_SHOT_ROOT`）/ `node pix/scripts/smoke-notes.mjs` / 只读 `git status|diff|log|show`。**未执行任何 git 写命令**；未运行 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未改任何源码与 `packages/**`；未引入依赖。
> 离屏目录 = `C:/Users/86157/AppData/Local/Temp/pix-v05-r11-review2`（连续 3 次实跑，逐次启动清理，磁盘产物 = 第 3 次）；原始日志留档 `%TEMP%/pix-v05-r11-review2-ui-shot.log`（跑 1）/ `-run2.log`（跑 2）/ `-run3.log`（跑 3）/ `pix-r11-review2-smoke.log`。
> **判词：revise。** 代码走查与红线全清；但验收判据 (b) 在本环境 **3 次独立实跑中 2 次为红（退出码 1、`MANIFEST.failure ≠ null`）**，新增相位 4/5 的判据不可复现 ⇒ 未达到「全绿」的销账条件。must-fix 1 条（取证脚本面），产品代码面 0 条。

### §1 实跑证据（命令逐字 + 原样输出摘要）

```bash
# 1) 唯一工程门
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
# ⇒ （三行 tsc 脚本头后）CHECK_EXIT=0

# 2) 离屏取证（同一命令连续 3 次；每次前 tasklist | grep -ci electron ⇒ 0，未与其它取证并发）
cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-review2" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_EXIT=$?"
```

| 跑次 | 起止（本地时刻） | `UI_SHOT_EXIT` | `MANIFEST.failure` | `shots/*.png` | 结论 |
| --- | --- | --- | --- | --- | --- |
| 跑 1 | 17:35:52 →（约 3 min） | **1** | 非 null：`断言失败 r11-quick-ask-scroll-scope：派发前应为反馈态：…` | 117（含 `99-failure-state.png`） | **红** |
| 跑 2 | 17:39:40 → 17:41:45 | **1** | 非 null：`断言失败 r11-quick-ask-scroll-scope：不同文本后应回到 actions 态：…` | 117 | **红** |
| 跑 3 | 17:42:50 → 17:45:06 | **0** | `null` | **120** | 绿 |

跑 1 原始数据行（相位 4，节选，逐字）：

```text
[ui-shot] 测量 r11-quick-ask-scroll-scope: {"phase":"spurious-selectionchange","waitMs":0,"dispatchAtMs":919,"feedbackGoneAtMs":1990,
 "feedbackAfterExcerpt":{"inDom":true,"display":"flex","feedbackClass":"quick-ask-feedback is-ok","feedbackText":"已摘录 · 第 2 页"},
 "before":{"inDom":true,"display":"none","feedbackClass":null,"feedbackText":null,"btnCount":1},
 "afterDispatch":{"inDom":true,"display":"flex","feedbackClass":null,"feedbackText":null,"btnCount":2},
 "after600ms":{"inDom":true,"display":"flex","feedbackClass":null,"feedbackText":null,"btnCount":2},
 "atExpiry":{..."btnCount":2},"selectionBefore":{"text":"3. Ablation Study","collapsed":false,"anchorInStage":true},
 "selectionAfter":{…同上},"spanText2":"3. Ablation Study","fileCount":2,"hashSame":true}
```

跑 2 原始数据行（相位 5，节选，逐字）：

```text
[ui-shot] 测量 r11-quick-ask-scroll-scope: {"phase":"different-text-reset",
 "feedbackBefore":{"inDom":true,"display":"flex","feedbackClass":"quick-ask-feedback is-ok","feedbackText":"已摘录 · 第 3 页"},
 "spanText2":"3. Ablation Study","spanText3":"4. Conclusion",
 "afterDifferentText":{"inDom":true,"display":"none","feedbackClass":null,"feedbackText":null,"btnCount":1},
 "afterDifferentTextRecheck":{…同上},"selectionAfter":{"text":"3. Ablation Study","collapsed":false,"anchorInStage":true},
 "fileCount":3,"hashSame":true}
```

跑 2 的相位 4 **全绿**（同一相位、同一代码）：`before`/`afterDispatch`/`after600ms` = `display:"flex"` + `is-ok` + `已摘录 · 第 2 页` + `btnCount:0`；`atExpiry` = `feedbackClass:null` + `btnCount:2` + `display:"flex"`；`dispatchAtMs:917` / `feedbackGoneAtMs:2541`（上界 `917+2200=3117`、下界 `1900`）。

### §2 离屏产物核对（第 3 次绿跑的 `MANIFEST.json` / `MEASUREMENTS.json` 独立复算；不看脚本自身判定）

```text
shots 基线 112 → 本次 120；missing=[]；added = [r11-1-esc-pdf-search-panel.png, r11-2-esc-capture-mode.png,
  r11-3-excerpt-feedback-visible.png, r11-3b-feedback-after-spurious-selectionchange.png, r11-4-undo-row-after-empty.png,
  r11-5-note-actions-narrow.png, r11-5b-note-actions-narrow-row.png, r11-6-stale-scope.png]（8 张，均为 r11-*）
磁盘 120 === 清单 120；diskNotInManifest=[]；manifestNotOnDisk=[]；strays=[]（无 99-failure-state.png）
measurements 153 → 169；missingLabels=[]；labelCountDropped=[]；带 failures 的 record = 0 条（169 条全绿）
组 r11-quick-ask-scroll-scope = 5 条（excerpt-into-empty-panel / notes-panel-scroll / reader-scroll-control /
  spurious-selectionchange / different-text-reset），逐条 failures = null
既有 6 个冻结 record（notes-search|esc / clear-button / search-row-form、notes-copy|geometry、notes-sort|default、notes-undo|repeat）
  ⇒ data 与基线**字符串级相等** + 无 failures
```

**判据 (a) 60-9 追加（A1–A3）逐条复算**（只读 `data`）：

```text
excerptFeedback = {"waitMs":1,"first":{"display":"flex","feedbackClass":"quick-ask-feedback is-ok","feedbackText":"已摘录 · 第 1 页"},
                   "after400ms":{同上 + "btnCount":0}}
A1 = true（class 含 is-ok 且 display ≠ null/"none"）｜A2 = true（文本逐字 已摘录 · 第 1 页）｜A3 = true（+400 ms 复采仍为反馈态 + 同一文本）
有界等待 = waitMs 1 ms ≤ 1500 ms；追加段总等待 = 1 + 400 = 401 ms < FEEDBACK_MS 2500 ms；既有 excerpted/steps/empty 与基线字符串级相等 = true
```

**判据 (b) 相位 4（B1–B5）与相位 5（C1–C4）逐条复算**：

```text
B1a true（派发前 display=flex + is-ok + 已摘录 · 第 2 页）｜B1b true（collapsed=false / anchorInStage=true / selection.text === spanText2）｜B1c true（dispatchAtMs 926 ∈ [900,2100)）
B2 true（派发后 display=flex + is-ok + 已摘录 · 第 2 页 + btnCount=0）｜B3 true（+600 ms 同 B2 四项）
B4 true（atExpiry.feedbackClass=null 且 1900 ≤ goneAt 2528 ≤ 926+2200=3126）—— 计时未重开（重开则 ≥ 3426）
B5 true（atExpiry：feedbackClass=null / btnCount=2 / display=flex；fileCount=2；hashSame=true）
C1 true（feedbackBefore = is-ok + 已摘录 · 第 3 页；fileCount=3；spanText2 "3. Ablation Study" ≠ spanText3 "4. Conclusion"）
C2 true（afterDifferentText：feedbackClass=null 且 feedbackText=null）｜C3 true（复采 display=flex + btnCount=2 ⇒ 回到 actions）
C4 true（selectionAfter.text===spanText2 / collapsed=false / anchorInStage=true；fileCount=3；hashSame=true）
```

**与基线内容级比对**（独立脚本，屏蔽路径/时刻/ID 后逐 record 比较）：153 条既有 record 中 147 条 byte 级相等；差异 6 条经**字段级**核对后全部为环境/时刻/ID 驱动，无一条为内容回归：

```text
reader-state-writes|thirty-changes   : elapsedMs 75→81 + lastPayload.docFilePath（不同 OUT_ROOT）
reader-state-degrade|rebuilt         : documents.sample-paper.pdf.updatedAt
workspace-switch|a-left-home         : file.documents.sample-paper.pdf.updatedAt
answer-notes-list|badges             : page2Ids[2]/[3]（时间戳派生的 note id）
notes-undo|restore                   : createdAt / seedCreatedAt
notes-search|delete-all-then-excerpt : **唯一实质差异 = 新增字段 data.excerptFeedback**（既有 4 键逐字未变）
```

**目视**（read 工具，整窗截图）：跑 3 的 `r11-3b-feedback-after-spurious-selectionchange.png` 同框可见「已摘录 · 第 2 页」绿勾反馈浮层 + 第 2 页选区高亮 `3. Ablation Study` + 左栏 2 行笔记（第 1 / 第 2 页）+ 底栏「第 2 / 3 页」；对照跑 1 的同名截图（同一帧相位、红状态）浮层为「问 AI / 摘录」双按钮 ⇒ 两张截图在**同一断言点**上呈现两种状态，与两跑数据行一致。

### §3 代码反证（`PdfSelectionQuickAsk.vue` 真实 diff + 逐条件核对）

```text
git diff --numstat -- PdfSelectionQuickAsk.vue ⇒ 9 / 2（= N73-2 的 6+/2- + N73-2b 的净 +3 行：2 行注释 + 1 行早退分支）
git diff -U0 两处 hunk：@@ -133,0 +134,3 @@（新增 3 行）与 @@ -137,2 +140,6 @@（改 6 行 / 删 2 行 = N73-2 的 onStageScroll 守卫，非本轮）
sha256 PdfSelectionQuickAsk.vue bff06eb2ddfb27b9cdf3a235e09af87b870320a0c6556efcbf2838f2dc1131e7（= 开发档修复轮.4 留档值，逐字相同 ⇒ 验证后未再改动）
sha256 ui-shot.mjs              6843c8bd76286f4a4de9368c931cd6a7006c0097da21c22dc0f2d74935a7b4b3（同上）
```

**早退分支的四条前置与位置（逐条实测行号）**：

| 项 | 实测 | 判定 |
| --- | --- | --- |
| 早退分支本体 | `:136` `if (mode.value === "feedback" && visible.value && text.trim() === cachedText) return;` | 恰 1 处；短路顺序 = S1(mode) → S1(visible) → S2(a)(文本 trim 后逐字相等)；分支内只有 `return` |
| S5 位置 | 守卫 1 `:119`（`rangeCount === 0` / `isCollapsed` / 无 `filePath` ⇒ hide）→ 守卫 2 `:124`（trim 后 < `MIN_SELECTION_CHARS` ⇒ hide）→ 守卫 3 `:130`（无锚点 / 无 stage / 锚点不在 stage ⇒ hide）→ **`:136` 早退** → `:137` `void showFor(...)` | 位置正确（在三条守卫之后、`showFor` 之前）；**无任一前置被放宽或提前** |
| 「折叠选区仍 hide」 | `isCollapsed` 在 `:119`，早于 `:136` | 成立（早退不可触达该现场） |
| 「短文本仍 hide」 | `:124` 早于 `:136` | 成立 |
| 「锚点越界仍 hide」 | `:130` 早于 `:136` | 成立 |
| 「不同文本仍重置为 actions」 | 早退要求 `text.trim() === cachedText`，不同文本必不命中 ⇒ 落到 `:137` `showFor`（`:61` `mode='actions'` / `:62` 清 feedback / `:63-66` 清计时器） | 成立；且第 3 次实跑相位 5 实测 `afterDifferentText = {display:flex, feedbackClass:null, feedbackText:null, btnCount:2}` |

**不变量零改动（走查计数 + 逐字核对）**：`mode.value` 5 处（改前 4 + 新增 1）、`visible.value` 8（改前 7 + 1）、`cachedText` 7（改前 6 + 1）、`FEEDBACK_MS` 2（`:22` 定义 `= 2500` + `:114` 使用）、`setTimeout(` 1、`clearTimeout(` 4、`closest(` **0**、`instanceof Node` 1（N73-2 既有）；`showFor`(`:56`)/`hide`(`:92`)/`showFeedback`(`:104`)/`onStageScroll`(`:140`) 在本轮 diff 中零改动（本轮仅 `:134-136`）；文案 `已摘录 · 第 N 页`（`:172`）/`已在笔记中`（`:169`）/`摘录失败：…`（`:165`）与类名、`MIN_SELECTION_CHARS = 2`（`:18`）、几何钳制（`STAGE_PADDING`/`BUTTON_GAP`/`clamp`）、`:181`/:183 监听注册与 `:187`/:188 对称移除均未变；`ui-shot.mjs` 侧 `quickAskProbe`（`:4995`）与 `waitFeedbackOk`（`:5008`）返回形状未变，新增 6 个 helper（`quickAskStateProbe` :5025 / `selectionProbe` :5038 / `pageSpanText` :5050 / `focusPage` :5056 / `excerptViaQuickAsk` :5066 / `waitFeedbackCleared` :5089）与设计档 §2.4 语义一致；60-9 追加段与设计档 §2.1 字面一致（`waitFeedbackOk(1500)` → `sleep(400)` → 复采 + `data.excerptFeedback`）；`excerptFirstSpan` docstring 已改为 N73-2b 口径。

### §4 红线走查

```text
git diff --numstat（全部改动文件）：README.md 9/7 ｜ pix/package.json 1/0（仅 scripts.smoke:notes） ｜ pix/scripts/ui-shot.mjs 787/6
  ｜ NotesPanel.vue 3/2 ｜ PdfSelectionQuickAsk.vue 9/2
  ⇒ 5 项均属 R11 白名单的既有交付面；本轮（修复轮.4）在白名单内的增量 = PdfSelectionQuickAsk.vue（净 +3 行）+ ui-shot.mjs 的 N73-2b 片段；NotesPanel.vue / README.md / pix/package.json 本轮无涉及 N73-2b 的改动
未跟踪：docs/pm/R11-{req,design,dev,review}.md + pix/scripts/smoke-notes.mjs（均在白名单内）
git status --short packages / git diff --stat -- packages ⇒ 空（packages/** 零 diff）
禁项 grep（改动文件 + `git diff` 新增行）：`: any` 0 处 ｜ `await import(` 0 处 ｜ 动态 `import(` 0 处（顶层导入零违规）
仓库零残留：git status --porcelain ⇒ 10 项（= 5 改 + 5 未跟踪，无白名单外条目）；一次性核对脚本写在 %TEMP% 并已删除
离屏目录自检：磁盘集合 === 清单集合（120/120）、`strays=[]`、无 `99-failure-state.png`
```

**限制（不影响本判词）**：本轮 ui-shot.mjs 的增量无法用 `git diff` 与「修复轮.4 之前」的状态对切（无提交边界）；归属依据 = 设计档 §2.1/2.2/2.3/2.4 字面比对 + 既有相位 1/2/3 与 153 条既有 label / 6 条冻结 record 的零缺失与内容级相等 + sha256 与开发档验证后留档值逐字相同。

### §5 烟测

```bash
node pix/scripts/smoke-notes.mjs; echo "SMOKE_NOTES_EXIT=$?"
# ⇒ 末行「通过 26 / 失败 0」；SMOKE_NOTES_EXIT=0；[通过] 行 26 条 / [失败] 行 0 条
```

### §6 must-fix（1 条，取证脚本面）

1. **相位 4/5 的判据对「反馈窗口内出现阅读区滚动」不可判别，验收判据 (b) 不可复现。** 三次独立实跑（同一命令、同一代码、未并发）**2 次红**（退出码 1、`MANIFEST.failure ≠ null`）：跑 1 相位 4 的 B1/B2/B3 红；跑 2 相位 5 的 C3 红。两处红现场的共同特征 = `display:"none"` + `btnCount:1`（`selectionPage` 被清 ⇒ 只能来自 `hide()`），而同一时刻 `selectionBefore/After` 均为 `collapsed:false` + `anchorInStage:true` + 文本等于 `spanText2` ⇒ **不是**早退分支被放宽或跳过（该情形应表现为 `display:"flex"` + `btnCount:2` 的 actions 态），而是**一条按 S4⑤ 既有语义隐藏浮层的真实阅读区滚动**（`.reader-stage` 子树内目标）落在了观测窗内；相位未记录 `scrollTop`、未设「窗口内不得发生阅读区滚动」的前置/判据，故把环境性前置破坏与产品行为混为一红。→ 处置建议：在相位 4/5 记录 `t0` 与派发/复采时刻的 `stageScrollProbe().scrollTop`，**把「窗口内滚动」显式判为前置失败并给出独立失败文案**（或按设计档 §追加-3 第 6 行的同类处方做有界重取），使 (b) 的绿/红只反映「同文本不重置 / 不同文本重置」这一被测语义；同时给 B4 加独立前置（见次级项 3）。**在该项处置并复跑到「连续实跑均绿」之前，不应按「全绿」销账。**

**产品代码面 must-fix：0 条。** 依据：`PdfSelectionQuickAsk.vue` 的早退分支四前置与位置逐条符合 S1/S2/S5，不变量零改动（§3）；判据 (a) 在第 3 次实跑 A1–A3 全绿且既有字段与基线字符串级相等；判据 (b) 的相位 4 在跑 2、跑 3 均实绿（`feedbackGoneAtMs` 2528/2541 ≈ `t0+2500`，证明计时未被重开），相位 5 在跑 3 实绿（不同文本 ⇒ actions）；判据 (c) 既有 112 张截图 / 153 条 label 零缺失。

### §7 次级项（不阻塞，登记）

1. **偏差 ②（既有场景 07 G2 补 1 个有界等待）**：实测无害（07/07c 截图与既有 label 未变，等待为默认 20 s 上界、实耗 ≈ `FEEDBACK_MS`），但使一条既有场景隐式依赖 `FEEDBACK_MS` 的取值；建议把该等待的上界与 `FEEDBACK_MS` 绑定，避免常量变更时静默失配。
2. **同文本「用户重选」与「冗余事件」不可区分**：按 S1/S2 的冻结字面，反馈窗口内的同文本重选也不重置（需等 ≤2.5 s 自然回落或滚动）。这是冻结语义的既定结果（与需求档逐字一致），仅登记其用户可见代价；若负责人希望「用户重选即回 actions」，需在契约里引入事件来源判别（超出本轮白名单）。
3. **B4 双边界可「空过」**：跑 1 中 `feedbackGoneAtMs=1990` 同时满足下界 1900 与上界 3119，但当时反馈早已被滚动清掉 —— B4 缺独立前置，靠 B1 判红兜底；随 must-fix 1 一并加固（要求派发前/复采时刻均为反馈态）。
4. **根因可读性**：`MEASUREMENTS.json` 在相位 4/5 不记录 `scrollTop`/滚动事件，导致失败现场只能反推（本次反推依据 = §6 的 `display/btnCount` 组合 + 合法选区）。建议随 must-fix 1 补读数。
5. **命名偏差 ① 核对通过**：既有同名 helper `waitFeedbackGone`（`ui-shot.mjs:2088`，用于 `.answer-note-feedback`）确实同作用域存在，改用 `waitFeedbackCleared` 是必要且已注明，无副作用。
6. `%TEMP%/pix-r11-n732b-review-cmp.mjs`（14:54，非本步产物）仍在临时目录；仓库内零残留，仅登记。

### §8 未验证项

1. 未运行 `npm run build` / `npm test` / `npm run package` / `npm run dev`（超出本步命令面）。
2. 像素级/浮层可见性差异未作断言（仅目视两张同点截图对照，见 §2）。
3. 阅读区滚动源（`.reader-content` / `.map-tree` / document 级）仍只有走查结论 —— 与 `R11-dev.md` §8.3、终验.8 第 4 条同口径；本步新增相位 4/5 的红现场也未定位到具体滚动源（见次级项 4）。

### §9 判词

- `npm run check` = **0 error**；`node pix/scripts/smoke-notes.mjs` = **26 通过 / 0 失败 / 退出 0**；代码走查四条前置、位置、不变量、禁项与白名单/零 diff/零残留红线 **全清**；判据 (a) 与 (c) 在绿跑中**全绿**且逐条独立复算通过。
- **判据 (b) 未达成「全绿且可复现」**：3 次独立实跑 1 绿 2 红（`MANIFEST.failure ≠ null`）。
- **结论：revise**（must-fix 1 条：相位 4/5 的窗口内滚动不可判别 + B4 缺前置；产品代码面 0 条）。修订并复跑至连续实跑全绿后，本档可按 (a)(b)(c) 销账。

---

## 复核（R11 · N73-2b 稳定性）

> 执行：2026-09-16（Windows + git bash，仓库根 `E:/develop/PiX-Read`）；**独立复核代理（冷启动，未复用交付方与上一轮审查员的结论与产物）**。
> 对象：`R11-dev.md`「### 修复轮.5 取证面稳定性修复（滚动静默前置）」对应的**真实工作树状态**（`git diff` + 逐字读码 + 独立实跑）、本档「## 代码审查（R11 · N73-2b）」§6 must-fix 1、`R11-req.md`「### N73-2b」的 (a)(b)(c)。
> 本步权限：只读文件 / 追加本节 / `cd pix && npm run check` / 离屏 `ui-shot.mjs`（自有 `PIX_SHOT_ROOT`，与其它取证进程**不并发**）/ `node pix/scripts/smoke-notes.mjs` / 只读 `git status|diff|log|show`。**未执行任何 git 写命令**；未运行 `npm run build` / `npm test` / `npm run package` / `npm run dev`；未改任何源码（`pix/src/**`、`packages/**` 零改动）与白名单外文件；未引入依赖。
> 离屏目录 = `C:/Users/86157/AppData/Local/Temp/pix-v05-r11-review3`（单次实跑；启动清理把该目录上一轮遗留的条目清空）；原始日志 = `%TEMP%/pix-v05-r11-review3-ui-shot.log`。一次性核对脚本写在 `%TEMP%`（`pix-r11-review3-verify.mjs` / `pix-r11-review3-shape.mjs`），跑完即删，仓库零残留。
> **判词：accept。** 上一轮 must-fix 1 **已处置且经本次独立实跑复核**；本次 must-fix 0 条（产品代码面 0 条）；登记项 3 条（不阻塞）。

### §1 实跑证据（命令逐字 + 原样结果）

```bash
cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check; echo "CHECK_EXIT=$?"
# ⇒ CHECK_EXIT=0

cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT="C:/Users/86157/AppData/Local/Temp/pix-v05-r11-review3" \
  ./node_modules/.bin/electron scripts/ui-shot.mjs; echo "UI_SHOT_EXIT=$?"
# ⇒ [ui-shot] 结束：产出 120 张截图
# ⇒ UI_SHOT_EXIT=0

node pix/scripts/smoke-notes.mjs; echo "SMOKE_NOTES_EXIT=$?"
# ⇒ 末行「通过 26 / 失败 0」；[通过] 26 行 / [失败] 0 行；SMOKE_NOTES_EXIT=0
```

| 项 | 实测 |
| --- | --- |
| 起止（本地时刻） | 18:08:38（首张 `00-workspace-enter.png` 落盘）→ 18:10:51（`MANIFEST.generatedAt = 2026-09-16T10:10:51.260Z`） |
| 并发检查 | 跑前 `tasklist /FI "IMAGENAME eq electron.exe"` 无匹配 ⇒ 无并发取证进程 |
| 退出码 / 失败 | `UI_SHOT_EXIT=0`、`MANIFEST.failure === null` |
| 产物 | shots 120（磁盘 120 = 清单 120）、measurements 169 |
| 被验状态 | `sha256 pix/scripts/ui-shot.mjs = 17c77b42d550a97f0ff671fed7cb6afd1092a8060c2a6f69ec8c47a8666c3e2d`，跑前跑后各核一次，与修复轮.5 留档值**逐字相同** ⇒ 开发档两次绿跑与本次绿跑同一份代码 |

### §2 独立复算（只读 `MANIFEST.json` / `MEASUREMENTS.json`，不看脚本自身判定）

**零缺失（基线 `pix-v05-r11-base` = 112 张 / 153 条）**：

```text
截图：after 120；missingShots=[]；added = 8 张（全为 r11-*，含 r11-3b-feedback-after-spurious-selectionchange.png）
      diskNotInManifest=[]；manifestNotOnDisk=[]；strays=[]（无 99-failure-state.png）
测量：base 153 → after 169；missingLabels=[]；labelCountDropped=[]（32 个既有 label 逐条计次不减）；带 failures 的 record = 0 条
冻结 record 与基线 data 字符串级相等：notes-search|esc / notes-search|clear-button / notes-search|search-row-form /
      notes-copy|geometry / notes-sort|default / notes-undo|repeat
唯一字段差异 = notes-search|delete-all-then-excerpt 新增 data.excerptFeedback（既有 phase/steps/empty/excerpted 逐字未变）
```

**判据 (a) 60-9 A1–A3**：`excerptFeedback = {"waitMs":1,"first":{"inDom":true,"display":"flex","feedbackClass":"quick-ask-feedback is-ok","feedbackText":"已摘录 · 第 1 页"},"after400ms":{同上 + "btnCount":0}}` ⇒ A1（`is-ok` 且 `display !== none`）= true；A2（文本逐字）= true；A3（+400 ms 复采仍为反馈态且同文本）= true；`waitMs 1 ≤ 1500`；追加段总等待 `1 + 400 = 401 ms < FEEDBACK_MS 2500`。

**判据 (b) 相位 4（B1–B5）**：B1a（派发前 `is-ok` + `已摘录 · 第 2 页` + `display:"flex"`）、B1b（`selectionBefore = {text:"3. Ablation Study", collapsed:false, anchorInStage:true}` 且 `text === spanText2`）、B1c（`dispatchAtMs 936 ∈ [900, 2100)`）全真；B2（派发后 `is-ok` + `已摘录 · 第 2 页` + `display:"flex"` + `btnCount 0`）、B3（+600 ms 同 B2 四项）全真；B4 前置（派发前与复采时刻均为反馈态）真 + `feedbackGoneAtMs 2530 ∈ [1900, 936+2200=3136]` + `atExpiry.feedbackClass === null`；B5（`atExpiry = {feedbackClass:null, btnCount:2, display:"flex"}` / `fileCount 2` / `hashSame true`）全真。

**判据 (b) 相位 5（C1–C4）**：C1（`feedbackBefore = is-ok + 已摘录 · 第 3 页`；`fileCount 3`；`spanText2 "3. Ablation Study" ≠ spanText3 "4. Conclusion"`）、C2（`afterDifferentText = {feedbackClass:null, feedbackText:null}`）、C3（`afterDifferentTextRecheck = {display:"flex", btnCount:2}`）、C4（`selectionAfter` 等于 `spanText2` / 未折叠 / 锚点在 stage；`fileCount 3` / `hashSame true`）全真。

**相位 1/2/3 既有判据**（同组 5 条 record 的另外 3 条）逐条复算亦全真（`rows 1` / `searchInDom` / 相位 1 与 2 的 `is-ok + 已摘录 · 第 1 页` / `elapsedSinceFeedbackMs 247 < 2500` / 相位 3 `scrollTop 48→200` + 滚动后 `display:"none"`）。

### §3 静默前置的落位与实测生效（本轮核心）

**代码落位（只读逐行核对，真实行号）**：`ensureQuickAskExcerptReady`（`:5072`）在相位 4/5 中先于 `t0` 调用 —— 相位 4：`:6369` 入口前置 → `:6371` `excerptViaQuickAsk()` → `:6373` `t0P4` → `:6374` 首个 `stageScrollWatchProbe`；相位 5：`:6466` → `:6468` → `:6470` → `:6471`。⇒ 「静默 + 可摘录态复核 + 有界重取」**全部发生在观测窗之前**。

**helper（`:5169` / `:5185` / `:5195`）**：`installStageScrollWatch` 为 document 级 **capture** `scroll` 监听，只统计 `target` 在 `.reader-stage` 子树内的事件（与产品 `PdfSelectionQuickAsk.onStageScroll` 的 hide 判据同源）、幂等且跨相位累积；`waitStageScrollQuiet` 为有界静默（`quietMs 400` / `timeoutMs 6000`，超时返回 `ok:false`，由调用方按前置失败判红，不静默降级）。

**判红路径（独立文案，与 B/C 判据并列进同一条 record 的 `failures`）**：相位 4 `:6428`（入口前置不成立）、`:6429-6430`（`t0` 前 400 ms 内仍有阅读区滚动）、`:6432-6433`（**窗口内计数 > 0**，文案带次数 / 相对 `t0` 的最近时刻 / 两处 `scrollTop`）；相位 5 同构 `:6509` / `:6510-6511` / `:6513-6514`；B4 独立前置 `:6446-6448`。

**实测生效证据（本次数据）**：相位 4 `preQuiet = {ok:true, attempts:1, quiet:{waitedMs:446, absorbed:0}}`；相位 5 `preQuiet = {ok:true, attempts:2}`，且 `trail[1] = {state:{display:"none", btnCount:1}, ready:false, quiet:{absorbed:1}}` → 重取 → `trail[2] = {state:{display:"flex", btnCount:2}, ready:true}` —— **attempt 1 的隐藏现场与上一轮 §6 记录的两次红现场同签名**（`display:"none"` + `btnCount:1`，即 `hide()` 路径），但本次落在观测窗**之前**并被入口吸收，未再表现为红或裸错误。

**窗口内滚动计数**：相位 4 四处采样（`t0` / 派发 / +600 ms / 复采）全为 `{scrollTop:852, count:0, lastAt:null}` ⇒ `windowCount = 0`；相位 5 三处采样恒为 `{scrollTop:1710, count:1, lastAt:1789553438666}`、`windowCount = 0` 且 `sinceLastEventAtT0Ms = 886 ms ≥ 静默窗 400 ms`（同一次事件在开窗前）⇒ **两个观测窗的窗口内计数均为 0**，与开发档留档值一致。

### §4 语义判据零放松（独立核对，不依赖开发档自述）

1. **逐条对照需求档 (a)(b)(c) 与设计档 §2.2/§2.3**：B 组 8 条、C 组 7 条条件块的**比较式与阈值逐字一致** —— `dispatchAtMs >= 900 && dispatchAtMs < 2100`、B4 下界 `2500 - 600`、上界 `dispatchAtMs + 2500 - 300`、B2/B3 的 `btnCount === 0`、B5 的 `btnCount === 2` 且 `display !== "none"`、C2 的 `feedbackClass === null && feedbackText === null`、C3 的 `display !== "none" && btnCount === 2`、C4 的三项选区现场 + 数据不变；A1–A3 与设计档 §2.1 字面一致。
2. **失败文案非重写**：上一轮 §6 引用的两条原样文案（`派发前应为反馈态：…`、`不同文本后应回到 actions 态：…`）在当前文件中**逐字相同**；新增文案仅为「环境噪声：…」与「B4 前置不成立（…）」。
3. **与上一轮（修复轮.4）绿跑 `pix-v05-r11-review2` 的 data 形状差集**（独立脚本逐键比较）：相位 4/5 **只新增 `stageScroll` / `preQuiet`，零删除、零改名**；同名键中仅时间量不同（`waitMs 1→0`、`dispatchAtMs 926→936`、`feedbackGoneAtMs 2528→2530`），而 `before` / `afterDispatch` / `after600ms` / `atExpiry` / `selectionBefore` / `selectionAfter` / `spanText2` / `fileCount` / `hashSame` **逐一相同**；相位 1/2 只差时间量（`waitMs 252→246`、`elapsedSinceFeedbackMs 253→247`）、相位 3 与 `notes-search|delete-all-then-excerpt` **字节级相同**。
4. **判据只增不减**：本轮新增的是每相位 3 条环境前置 + B4 1 条独立前置，全部只会**扩大**判红面；未见任何条件被放宽、删除或降级为跳过。
5. **不变量**：`PdfSelectionQuickAsk.vue:136` 的早退分支（`mode.value === "feedback" && visible.value && text.trim() === cachedText`）、`FEEDBACK_MS = 2500`（`:22`）、`MIN_SELECTION_CHARS = 2`（`:18`）均未变。

### §5 产品面零改动与红线走查

```text
sha256 PdfSelectionQuickAsk.vue bff06eb2ddfb27b9cdf3a235e09af87b870320a0c6556efcbf2838f2dc1131e7（= 修复轮.4 留档值，逐字相同 ⇒ 本轮零改动）
sha256 NotesPanel.vue              2b75c16bdd54b96f9ea03340321c98cd8802fceea74378a468e326b6174688c2
mtime  NotesPanel.vue 12:48:10 ｜ PdfSelectionQuickAsk.vue 14:34:19 ｜ ui-shot.mjs 17:59:45（本轮仅 ui-shot.mjs 被写）
git diff --numstat：ui-shot.mjs 942/6（= 修复轮.4 的 787/6 + 净 +155，与开发档一致）
                    pix/src：NotesPanel.vue 3/2 + PdfSelectionQuickAsk.vue 9/2（与上一轮 §4 逐字相同，非本轮增量）
git diff --stat -- packages  ⇒ 空（packages/** 零 diff）
git status --porcelain       ⇒ 10 项（5 改 + 5 未跟踪，与上一轮相同，无白名单外条目）
```

未新增依赖、未新增 npm 脚本、未运行 build/test/package/dev、未执行任何 git 写命令；一次性脚本已在 `%TEMP%` 删除。

### §6 登记项（不阻塞）

1. **本次仅 1 次离屏实跑**（按本步命令面要求）。同一 `sha256` 上的绿跑计数 = 开发档留档 2 次 + 本次 1 次；「连续多轮均绿」的更强口径未在本步重做。
2. **`环境噪声：窗口内发生阅读区滚动` 分支本次未触发**（两个观测窗 `windowCount` 均为 0）⇒ 其判红效力由走查确认（纯条件分支：计数非 0 即 push 独立文案），未做注入式负向控制（注入需改动被测脚本状态，超出本步写权限）。
3. **入口「有界重取」不构成静默掩盖**：重取会重建选区（`selectPageSpan(page)`）以恢复前置，触发痕迹全部留在 `data.preQuiet.trail`（本次相位 5 实测 `attempts=2`），可判读；阅读区滚动的**具体源元素**仍未定位（与 `R11-dev.md` §8.3、上一轮 §8.3 同口径）。

### §7 判词

- 上一轮 must-fix 1（相位 4/5 对「反馈窗口内出现阅读区滚动」不可判别 + B4 缺独立前置）**已处置**：入口静默 + 可摘录态复核 + 有界重取（均在 `t0` 之前生效）+ 窗口内滚动计数与**独立判红文案** + B4 独立前置，且经 §4 逐条核对**无任何语义判据被放松**。
- 本次实跑：`UI_SHOT_EXIT=0`、`failure === null`、120 张截图 / 169 条测量、既有 112 张截图与 153 条 label 零缺失、`(a)(b)(c)` 逐条独立复算全绿、`CHECK_EXIT=0`、烟测 26 通过 / 0 失败；目视 `r11-3b-feedback-after-spurious-selectionchange.png` 与 B1/B2 读数一致（同框可见「已摘录 · 第 2 页」反馈 + 第 2 页选区 + 左栏 2 行笔记 + 底栏「第 2 / 3 页」）。
- **结论：accept**（must-fix 0 条；产品代码面 0 条）。`R11-req.md`「### N73-2b」的验收判据 (a)(b)(c) 按本档口径**销账**；提交由负责人执行。
