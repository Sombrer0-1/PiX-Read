# R17 需求评审（独立评审员 / 挑刺角色）

## 需求评审（R17）

- 评审对象：`docs/pm/R17-req.md`（未跟踪新增档，474 行）
- 评审基线：`git status --short` ⇒ 仅 `?? docs/pm/R17-req.md`；`git log --oneline -1` ⇒ `8850c9c`
- 本轮实跑：`cd pix && npm run check` ⇒ `CHECK_EXIT=0`（唯一工程门复现，与档内事实表一致）
- 取证纪律：本档结论只来自本次实读的文件内容与本次实跑的命令输出；下列行号为本次实读（与 `R17-req.md` 事实表冲突处，以本档为准）；本步按指令未跑离屏取证

### 0. 复核通过的基线事实（与档内事实表逐条一致）

| 复核项 | 本次实读结果 |
| --- | --- |
| R16 零缺失基线 | `Temp/pix-v06-r16-review/shots/MANIFEST.json` ⇒ `shots.length = 166`、`failure = null`；目录内 png = 166；`MEASUREMENTS.json` 长度 = 237、`label` 去重 = 64；r16 前缀 record = 14 条（page-badge 3 / page-anchor 3 / note-highlight 3 / highlight-coexist 2 / degrade 3）、r16 前缀截图 = 13 |
| 阅读区键位 | `PdfViewer.vue` `onWindowKeydown` 415–484：Ctrl+F 419–427、capture Esc 434–437、search Esc 439–442、`isEditableTarget` 守卫 444、`[`/`]` 445–454、`/` 455–458、switch 462–483（PageUp/ArrowLeft 463–468、PageDown/ArrowRight 469–474、Home 475–478、End 479–482）；**无 ArrowUp / ArrowDown 分支**；窗口监听仅在 `pageCount > 0` 时注册（`keydownRegistered` 487–503） |
| 谓词 | `isEditableTarget` 400–407 = `isContentEditable ‖ INPUT ‖ TEXTAREA ‖ SELECT`（与档内 §0.5 的「逐字同构」目标一致） |
| 浮层与 seam | `PdfSelectionQuickAsk.vue`：`MIN_SELECTION_CHARS` 18 / `BUTTON_GAP` 19 / `STAGE_PADDING` 20 / `FEEDBACK_MS` 22；`showFor` 56–90（clamp 在 80–89）；`hide` 92–102；`showFeedback` 104–115；`onButtonClick` 148–152；模板 `.quick-ask` 196–225（问 AI 205–208、摘录 209–218、反馈 220–223）；CSS `.quick-ask` 228–242（`z-index: 6` 230）、`.quick-ask-btn` 244–256。`useQuickAsk.ts`：`QuickAskHandler` 10 / `registerQuickAskConsumer` 14 / `emitQuickAsk` 18；**`emitQuickAsk` 全仓仅 3 处引用**（定义 18、import `PdfSelectionQuickAsk.vue:12`、调用 151）；唯一消费点 `ChatPanel.vue:848`（清空 855） |
| composer | `ChatPanel.vue`：`onQuickAsk` 306–310（`if (!draft.value) draft.value = QUICK_ASK_TEMPLATE;` 308 + `focus()` 309，**无 `return;`**）、`QUICK_ASK_TEMPLATE` 304、`NOTES_ASK_TEMPLATE` 314、`.composer-box` 1123–1149；`InputArea.vue` `onKeydown` 28–35（`isComposing` 30）、`defineExpose` 48 |
| 既有按钮数断言 | `ui-shot.mjs` 的 `btnCount === 2` 恰 3 处：5518（`ensureQuickAskExcerptReady` ready 判据，5506–5529）、6987（相位 4 到期回落 B5）、7059（相位 5b C3）；反馈期 `btnCount === 0` 在 6975 / 6978（`quickAskStateProbe` 定义 5460–5468，`btnCount` 5467） |
| 夹具与坐标 | `SEL` 47–118，**键数 = 64**（本次脚本计数）；`WINDOW` 44 = 1600×1000；`.center-pill` = `WorkspacePage.vue:321–331`（唯一子元素 `.pill-label` 330 + 可选 `.pill-icon-btn` 322–329）；`.pane-pill` 377–392（`margin: 8px 10px 0`、`height: 28px`）、`.center-pill` 394–398（`position: absolute`）；`.reader-under-pill :deep(.reader-header) { display: none }` 464–466；`.layout-right` `AppLayout.vue:142–144`（`width: var(--pix-right-width)`）；`--pix-left-width/--pix-right-width/--pix-pane-pill-height` `variables.css:112–114`；`.pix-drag-bar` `main.css:38–45`、`--pix-window-controls-height` `variables.css:122` |
| 缩放 | `PdfViewer.vue:1081–1083`：`zoomBy(-0.1)` / `.zoom-label` / `zoomBy(0.1)` ⇒ 10 次点击 = 200%（档内「10 次放大」口径正确）；`.pdf-page { margin: 0 auto }` 1267–1272、`.pdf-scroll { overflow: auto; padding: 48px 16px }` 1260–1265 ⇒ 页宽溢出时 auto 边距归零、页左缘落到内容左缘（档内缩放相位推算自洽） |
| 名称与图标 | `pix/src/renderer/utils/` 现无 `shortcut-help.ts` / `quick-ask-templates.ts`；`grep -rn "shortcut" pix/src` 仅 1 处英文注释（`ClarificationCard.vue:5`），档内列举的 14 个新名字与文案 `快捷键总览` 在 `pix/src` 内 0 命中；`mdi-keyboard-outline` / `mdi-lightbulb-on-outline` / `mdi-translate` / `mdi-close` / `mdi-comment-question-outline` / `mdi-notebook-plus-outline` 在 `@mdi/font` CSS 内均存在 |
| 变量存在性 | 档内 §0.4 引用的 `--pix-font-ui/--pix-font-mono/--pix-shadow-xs/--pix-shadow-md/--pix-bg-elevated/--pix-bg-code/--pix-bg-hover/--pix-bg-active/--pix-border-light/--pix-text-primary/--pix-text-secondary/--pix-text-muted` 全部存在于 `variables.css`（15/16/18/20/25/30/31/32/68/69/100/102）⇒「不新增变量」可兑现 |
| 无像素比对 | `ui-shot.mjs` 内无 `pixelmatch` / 图像 diff 逻辑 ⇒ 肉眼看图不是判据（档内「由开发档目视登记」的处置正确） |

### 1. 键位表逐条与代码核对（清单 1）

结论：**16 条既有键位全部对位、无虚构；但存在 2 处真实键位遗漏与 1 处交互未写清。**

| # | 档内行 | 真实监听位置 | 守卫（实读） | 结论 |
| --- | --- | --- | --- | --- |
| 1 | `/` 打开文档搜索 | `PdfViewer.vue:455–458` | 444 守卫（`pageCount<=0 \|\| isEditableTarget`）；无文档时不注册监听（487–503） | 对位 |
| 2 | `Ctrl+F` | `419–427` | `ctrlKey && !shiftKey && !altKey && !metaKey && pageCount>0 && key.toLowerCase()==="f"`，且在输入框聚焦时仍生效（416–417 注释 + 418 行 return 结构） | 对位 |
| 3 | `PageUp / ←` | `463–468` | 第 1 页直接 return（不 preventDefault） | 对位 |
| 4 | `PageDown / →` | `469–474` | 末页直接 return | 对位 |
| 5 | `Home` | `475–478` | — | 对位 |
| 6 | `End` | `479–482` | — | 对位 |
| 7 | `[` 上一节 | `445–454` | 447 `captureMode` 屏蔽；450 目标 null 零副作用 | 对位 |
| 8 | `]` 下一节 | 同上 | 同上 | 对位 |
| 9 | `Esc` 退出框选 / 关搜索 | `434–437`（capture 优先）→ `439–442`（searchOpen） | 不 `stopPropagation`，先于 444 守卫 ⇒ 输入框内也生效 | 对位（desc 与两分支顺序一致） |
| 10 | `Enter` 发送（composer） | `InputArea.vue:28–35` + 模板 59 | `isComposing` 守卫 30；`Enter && !shiftKey` ⇒ `preventDefault` + `emit("send")` | 对位 |
| 11 | `Shift+Enter` 换行 | 同文件（未拦截） | 浏览器默认行为，无监听代码 | 对位（属行为而非监听，表述可接受） |
| 12 | `Enter` 下一处（搜索框） | `PdfSearchPanel.vue:307–311` + 模板 407 | `isComposing` 308 | 对位 |
| 13 | `Shift+Enter` 上一处 | 同上 309–310 | 同上 | 对位 |
| 14 | `Enter` 跳页（页码输入框） | `PdfViewer.vue:1209` | `.prevent` | 对位 |
| 15 | `Esc` 取消页码输入 | `PdfViewer.vue:1210` | `.prevent` | 对位 |
| 16 | `Esc` 清空搜索并移焦（笔记搜索框） | `NotesPanel.vue:222–226` + 模板 631 | `stopPropagation` 225（注释 221 逐字一致） | 对位 |
| 17 | `?` 打开/关闭总览 | 本轮新增 | 档内 §0.5 | 新增（无既有依据，不得写成既有键位） |

遗漏与口径问题：

1. **遗漏（真实键位）**：`ChatPanel.vue:1166` `@keydown.enter="onRenameEnter"` ⇒ `onRenameEnter` 708–711（`isComposing` 守卫 709 + 提交重命名），位于工作区右侧对话栏的「重命名当前对话」输入框。档内「输入框」组 7 行未列该键位，与主线「列出全部真实键位」冲突。
2. **需显式登记范围外**：`SettingsPage.vue:491` `@keydown.enter="onSaveKeyEnter"`（设置页 API Key 输入框）。它不在工作区内，若总览口径 = 工作区键位，应在档内用一行登记为「范围外」，否则 17 行配额与「全部真实键位」两处说法互相拉扯。
3. **`?`（Shift+/）与 `/` 的交互未写清**：`?` 需要 Shift，而 `PdfViewer.vue:455` 判的是 `event.key === "/"`（带 Shift 时 `key === "?"`）⇒ 两者天然互不误触；反向同理（§0.5 冻结 `event.key === "?"`）。该事实本档未逐字写出，属清单 1 直接点名要核对的点，应补一句冻结（同时写明 `PdfViewer.vue` 零 diff ⇒ `/` 语义不变）。
4. **`?` 守卫缺 IME 口径**：R15 已把 `isComposing` 早退写成仓库纪律（`InputArea.vue:30`、`PdfSearchPanel.vue:308`、`ChatPanel.vue:709`），档内 §0.5 的 `?` 只有「无 Ctrl/Alt/Meta + 非输入框目标」。实际风险被 `isEditableTarget` 覆盖（组合态必落在可编辑元素上），但口径不一致需要一句冻结或一句「有意不加」的登记。
5. **无虚构**：`ArrowUp` / `ArrowDown` 确不存在（switch 462–483 实读），「缩放无键位」（只有按钮 1081–1083 与 `onWheelZoom` 964 起的 wheel 手势）成立，第 17 行为本轮新增。

### 2. 浮层的焦点与键盘可达性（清单 2）

- **可判**：`tabindex="-1"` + `nextTick().focus()` ⇒ `document.activeElement` 恒可读；`SEL.shortcutOverview` 新增项可定位；三类打开方式（入口点击 / `?`）都能在离屏构造。
- **缺口 a（不可满足）**：N96-4 判据 1 第三句「用 `?`（body 聚焦）打开并关闭后 `document.activeElement === document.body`」缺少夹具前置。`?` 是**合成** keydown（`pressReaderKey` 7276–7279 打在 body 上，不改焦点），而 `key-toggle-and-typing-guard` ① 已把焦点放进 `.input-area` ⇒ `lastFocused` 会是 `.input-area`（§0.5「打开后焦点」的记录对象），关闭后归还 `.input-area`，断言不可能成立。必须冻结一条「先把焦点移出可编辑元素（blur / 显式 body 聚焦）」的前置步。
- **缺口 b（判据不完整）**：「不得劫持输入框内按键 + 不 preventDefault」的口径在 §0.5 有字面，但离屏判据只有「浮层不出现 + 草稿值不变」。合成 `KeyboardEvent` 不产生文本输入 ⇒「草稿值不变」是空断言；`preventDefault` 无任何判据。建议补：一条返回 `el.dispatchEvent(evt)` 布尔值的触达 helper，或一条走查（`?` 分支内 `isEditableTarget` 的 return 必须在 `preventDefault()` 之前）。
- **缺口 c（覆盖面）**：判据只打在 `.input-area`（TEXTAREA，`InputArea.vue` 模板 59）。§0.5 的谓词覆盖 INPUT / SELECT / contenteditable，但无对位判据；建议加一条打在 INPUT 上的断言（如 `SEL.notesFilterInput` 或 `.pdf-search-panel .search-input`）。
- **缺口 d（可聚焦控件计数）**：档内 §0.4 冻结「浮层内恰 1 个可聚焦控件（无焦点陷阱，Tab 可离开）」，但判据只有结构性 `closeCount === 1` 与走查 `grep -ci "focusin|focusout|trap" = 0`；「恰 1 个可聚焦控件」本身无断言（`panel.querySelectorAll("button, a[href], input, select, textarea, [tabindex]").length` 含面板自身 `tabindex="-1"` 应为 2，可判）。

### 3. N97 四按钮几何与「预填不发送」判据（清单 3）

- **几何可判**：`⊆ .reader-stage`（含 4px）、`scrollWidth - clientWidth <= 1`、四矩形按 DOM 顺序递增且两两不相交且 `clientWidth > 0`、与 `.composer-box` / `.reader-section` / `.pdf-page-indicator` 零相交，都是可执行判据；窄栏 / 缩放两相位可构造（`--pix-right-width` 手法 7148–7150 与 8628 / 8675 在 R11 / R14 已被验证）。
- **缩放相位的钳制断言成立**：`showFor` 的 left clamp（80–89）为 `clamp(rect.right - width, stageLeft+4, max(min, stageRight - width - 4))` ⇒ 上界生效时 `float.right = stage.right - 4`，与档内 `Math.abs(float.right - (stage.right - 4)) <= 1.5` 等价；页宽 1190 溢出容器时 `.pdf-page` 的 `margin: 0 auto` 归零 ⇒ 页左缘 = 内容左缘，档内「页 1 首 span 右缘 ≈ 1189 > stage 右缘 ≈ 1019」的推算自洽。
- **预填判据逐字可判**：`composerSnapshot()`（3337–3351）给 `value` / `activeHasInputArea`；`sendCalls()`（3258）/ `clearSendCalls`（3259）/ `lastSend`（3264）/ `waitSendCalls`（3271）、`userBlocks()`（2385，`.chat-messages .message-block`）、`chipSnapshot()`（3316–3336，`count` / `labels` / `notesLabel`）、`selectionProbe()`（5472–5481，`text` / `collapsed` / `anchorInStage`）字段名与档内用法一致 ⇒ 「草稿值 + 未发送 + chips 不变 + 选区不变」四类断言都能逐字判。
- **M1（判据不可满足）**：N97-3 判据 3 要求「点「解释」后 `quickAskStateProbe()` 的 `btnCount === 0` 且 `display === "none"`」。实读：`hide()` 92–102 只把 `visible` 置 false、`mode` 复位 `"actions"`、`selectionPage` 置 null；浮层是 `v-show`（197），actions 模板 204 的按钮**仍在 DOM**；探针 5467 按 `el.querySelectorAll(".quick-ask-btn").length` 计数 ⇒ 实际值 = **3**（摘录按钮因 `canExcerpt === false` 掉落，`canExcerpt` 定义 44）。该断言自相矛盾（同一函数不可能同时 `display:none` 且计数 0），必须改判据。
- **建议（非阻塞）**：§0.7 的三分支中「逐字比较、含首尾空白差异即不匹配」只有 ""/"   "/模板三类断言（N99-2 4–7），建议补一条 `" " + EXPLAIN_TEMPLATE` ⇒ `null`，把「空白差异不匹配」这半句也钉住。

### 4. 与既有语义的冲突（清单 4）

- **`.quick-ask` 隐藏规则零冲突**：滚动隐藏 `onStageScroll` 140–147、选区变化 `onSelectionChange` 117–138、文档切换 `watch` 175–179、`@pointerdown.prevent`（模板 202）均不在白名单里被改动；新增按钮复用既有 `.quick-ask-btn` 与 `hide()`，不新增分支。
- **点击后行为**：§0.6 冻结「`hide()` → `emitQuickAsk(cachedText, action)`」，但既有 `onButtonClick` 148–152 是**先取 `const text = cachedText` 再 `hide()`**，因为 `hide()` 94 行清空 `cachedText`。按档内字面顺序实现会发出空字符串（消费端 `text` 虽未被使用，seam 契约仍被污染）。见 M8。
- **seam 无破坏**：`QuickAskHandler` 只在 `useQuickAsk.ts` 内被引用（10/12/14），唯一发射方 151、唯一消费方 848，`registerQuickAskConsumer` 签名不变 ⇒ 加第二参数 + 默认值 `"ask"` 不破坏既有调用。
- **Esc 双响应**：档内 §7 开放问题 2 已登记（浮层不阻断 ⇒ 框选/搜索同一次 Esc 双响应），与 R11/R16 的 Esc 顺序契约不冲突。
- **知识地图冲突（未登记）**：`.knowledge-map-slot` 是 `.reader-stage` 的左列（`flex: 0 1 26%; max-width: 240px`，ReaderPanel.vue 样式），而浮层固定在 `.reader-panel` 的 `left: 8px / top: 40px`（相对定位包含块 = `.reader-panel` 264–268）。地图打开时浮层矩形 x≈[295, 524] 与地图列重叠、y 方向地图贯穿整个 stage ⇒ **浮层会压住知识地图顶部**。N96-5 的「不遮挡」清单（composer / toolbar / indicator / section / FAB / pill）没有这一项，离屏判据也不会判红。见 M3。
- **pill 与浮层的垂直关系（数值口径偏差，结论仍成立）**：档内以「pill 底边 66」为基准；实读 `.pane-pill` 有 `margin: 8px 10px 0`（377–392）且 `.center-pill` 是 `top: 0` 的 abspos ⇒ pill 盒 y ≈ [46, 74]，浮层 top = 38 + 40 = 78 ⇒ 零相交仍成立但**只剩 4px 余量**。建议在 §0.4 注明该 4px 余量的依赖（pill 高度 / margin 不可动），否则 N96-5 判据 1 对样式变动极敏感。
- **既有截图面（登记不全，非阻塞）**：除 r11-3 两张外，`06c-excerpt-entry-zoom.png` / `07b-excerpt-feedback-zoom.png` / `07c-excerpt-duplicate-zoom.png` 都以 `rectOf(SEL.quickAsk, 30)` 裁切（1401 / 1456 / 1486），浮层变宽 ⇒ 裁切矩形随之变化；仓内无像素比对（见 §0 末行）⇒ 不判红，但档内「既有截图零改写」的说明应把这三张一并登记。
- **既有按钮数断言**：5518 / 6987 / 7059 三处改 4 的登记正确（夹具内选区恒可定位到页 ⇒ `canExcerpt` 为真 ⇒ 4 动作）；6975 / 6978 的「反馈期 `btnCount === 0`」不受影响（feedback 模式不渲染按钮）。
- **回归覆盖**：`r15-f16`（9202–9245）只统计 `window.__pixStub.agentEventListenerCount()`（9207 / 9223 / 9242–9244），与 DOM `window.addEventListener("keydown")` 无关 ⇒ 档内「新增常驻 window 监听由 r15-f16 回归覆盖」不成立。见 M2。

### 5. 白名单一致性与遗漏（清单 5）

- 10 行白名单与 §0.6 / §0.7 / §0.9 的引用自洽；`docs/pm/R17-review.md` 在列（本档即该行产物）；`PdfViewer.vue` / `PdfSearchPanel.vue` / `NotesPanel.vue` / `InputArea.vue` / `WorkspacePage.vue` / `stores/**` / `main/**` / `shared/types.ts` / `package.json` / `packages/*` 已在「零 diff」清单中列全。
- **注册位置完整**：新组件挂 `ReaderPanel.vue`（模板 258 之后）；入口 `Teleport` 到 `.center-pill`；`SEL` +6、新 helper 4 个、三处 `btnCount` 更新落在 `ui-shot.mjs`；`smoke-view.mjs` 的 `files`（780–786）/ `required`（799）/ `allowed`（800）三处同步已冻结 ⇒ 无漏项。
- **样式作用域可行**：新组件 `<style scoped>` + `Teleport` 追加进 `.center-pill`，scoped 属性留在被渲染元素上（既有 `.map-toggle` 范式：ReaderPanel 192–204 + 样式 311–344）⇒ 入口样式生效，不需要改 `WorkspacePage.vue`。
- **遗漏 a（内容不可判）**：`QUICK_TEMPLATE_REPLACEABLE`（§0.7）要求「含三项、不含 `NOTES_ASK_TEMPLATE`」，但 smoke 面引用不到 `ChatPanel.vue` 的常量，N99-2 的 `known` 是测试内自写数组；N97-2 判据 5 只有 `grep -c "QUICK_TEMPLATE_REPLACEABLE" = 2`（计数），不能证明集合内容。见 M7。
- **遗漏 b（判据缺 helper 名）**：§2 的缺口 d / 缺口 b 若按建议补断言，需要新 helper（如「可聚焦控件计数」「dispatch 返回值」），但 N99-3 的 helper 名是**冻结**的四个 ⇒ 需一并裁决（补名或改用走查口径）。
- **遗漏 c（流程口径）**：本档白名单第 10 行包含 `R17-req.md`，而 §0.0/§0.2 又要求冻结条目「不得改写」；下面 must-fix 有多条要动冻结字面，需负责人裁决后再落开发档（不能由评审/开发自行改字）。

---

## must-fix 清单（按严重度排序；清空前不建议开工设计档 / 开发档）

**M1（判据不可满足，阻塞）** N97-3 判据 3 的 `quickAskStateProbe()` `btnCount === 0`。
证据：`PdfSelectionQuickAsk.vue` `hide()` 92–102（只置 `visible=false`、`mode="actions"`、`selectionPage=null`）、模板 `v-show` 197 + actions 模板 204、`canExcerpt` 44、探针计数 `ui-shot.mjs:5467`（按 DOM 计数）⇒ 点「解释」后实际为 `display === "none"` 且 `btnCount === 3`（问 AI / 解释 / 翻译；摘录因 `selectionPage=null` 掉落）。
处置：判据改为 `display === "none"` + `btnCount === 3`（或 `inDom === true` 且 `display === "none"`），语义仍锁「既有 `hide()` 未被新增分支破坏」。

**M2（证据链错误）** N96-6 判据 3 与 N99-4 判据 3 用 `r15-f16` 覆盖「卸载后不残留 window 监听」。
证据：`ui-shot.mjs:9202–9245`，其 counts 来自 `window.__pixStub.agentEventListenerCount()`（9207 / 9223 / 9242–9244），只统计 stub 侧的 agent 事件订阅数，与 DOM `window.addEventListener("keydown")` 无任何关系。
处置：保留并强化走查判据（`onBeforeUnmount` 内 `window.removeEventListener("keydown", …)`，`grep -c` = 1），删去「由 r15-f16 回归覆盖」的表述（或另立一条可判的 listener 泄漏判据）。

**M3（空间冲突未登记）** 浮层与 `.knowledge-map-slot` 重叠。
证据：`.reader-panel` 264–268 为定位包含块、浮层 `left: 8px`（§0.4）；`.knowledge-map-slot` 是 `.reader-stage` 左列（`flex: 0 1 26%; max-width: 240px`）⇒ 地图打开时浮层 x≈[295, 524] 压在地图上；N96-5 的零相交清单未含该项。
处置：二选一并写进 §0.4 / N96-5：① 把 `.knowledge-map-slot` 加入零相交清单并把浮层改为「相对 `.reader-stage` 且避开地图列」的定位（会牵连 §0.4 定位与 r17-1b 判据）；② 明确登记「地图打开时允许压住地图顶部」，并注明 r17-1b 相位必须在**地图关闭**状态下取值（夹具需显式保证）。

**M4（键位表完整性与交互口径）** 见 §1 的遗漏 1–4。
处置：① 「输入框」组补 `ChatPanel.vue:1166`（`onRenameEnter` 708–711）或登记排除理由；② `SettingsPage.vue:491` 显式登记为范围外；③ 补一句冻结「`?` = Shift+/，与 `PdfViewer.vue:455` 的 `/` 互不误触（两者都判 `event.key`，且 `PdfViewer.vue` 零 diff）」；④ 明确 `?` 是否加 `isComposing`（加则与 R15 纪律一致，不加须登记理由）。改动会触及 §0.3 的「3 组 / 17 行」冻结配额，需负责人裁决。

**M5（档内自相矛盾）** §0.3 注 4 与第 17 行 `desc`。
证据：注 4 逐字「…`?` 在输入框内不触发…**不得**把守卫细节塞进 `desc`」；第 17 行 `desc` = `打开或关闭本总览（不在输入框内时）`，正是注 4 禁止的守卫细节。
处置：二选一（改 `desc` 为纯主语义，或注 4 为第 17 行开例外并同步 N99-2 第 6 条的期望字面）；同时「全局」这个组名与「仅工作区可用」不符（组件挂在工作区 `ReaderPanel`，首页/设置页无监听），建议改名或登记口径。

**M6（判据不可判 / 不完整）** 见 §2 缺口 a–d 与 §5 遗漏 b。
处置：① 为 N96-4 判据 1 的 body 焦点分支冻结前置步（blur / 显式聚焦 body）；② 把 N98-2 判据 1「工作区内不存在任何新增常驻元素」改成可判形式（关闭态下 `.shortcut-overview` / `.shortcut-row` / `.shortcut-key` / `.shortcut-note` 计数全 0、`.shortcut-toggle` 计数 1）；③ 为「不 preventDefault」与 INPUT/SELECT 分支补一条判据（走查分支顺序或新增触达 helper，需同步 §5 遗漏 b 的 helper 配额）；④ 补「浮层内恰 1 个可聚焦控件」的计数判据。

**M7（走查不可证明）** `QUICK_TEMPLATE_REPLACEABLE` 的内容。
证据：`ChatPanel.vue` 是 `.vue`，`smoke-view.mjs` 编译面只含 `utils/*.ts`（780–786 / 799–800）⇒ N99-2 的 `known` 是测试内自写常量；N97-2 判据 5 只数出现次数。
处置：加一条可判的走查（例如 `grep -n -A3 "const QUICK_TEMPLATE_REPLACEABLE" ChatPanel.vue` 必须逐字等于 `[QUICK_ASK_TEMPLATE, EXPLAIN_TEMPLATE, TRANSLATE_TEMPLATE]` 三项、且不含 `NOTES_ASK_TEMPLATE`），否则「笔记模板不参与替换」这条语义在本轮验证面上是空的。

**M8（字面与既有实现冲突）** §0.6 的点击顺序。
证据：档内冻结「`hide()` → `emitQuickAsk(cachedText, action)`」，而 `hide()` 94 清空 `cachedText`，既有 `onButtonClick` 148–152 是先取后用。
处置：把字面改成「先 `const text = cachedText` → `hide()` → `emitQuickAsk(text, action)`」（与既有写法逐字同构），并在 r17-2 相位补一条「发射文本非空」（如需，用 seam 侧计数或走查）。

**M9（事实表行号失真）** 本次实读与档内不符的行号（其余抽查项一致）。
处置：按实读修正——`repaint` 1263–1266（档内 1258）；`record` 1609–1612（档内 1604）；`restoreStandardSeed` 3416（档内 3411）、场景收口 `await restoreStandardSeed()` 10234 / `}` 10235（档内 10230）；`clickEl` 7273（档内 7268）；`pressReaderKey` 7276–7279（档内 7272–7275）；`pressKeyOn` 7282–7287（档内 7277–7283）。`selectPageSpan` 1757、`setDraft` 2534、`rectOfSelector` 2569、`userBlocks` 2385、`sendCalls` 3258、`chipSnapshot` 3316、`composerSnapshot` 3337、`quickAskStateProbe` 5460–5468、`SEL` 47–118、R16 读数、`WorkspacePage` 321–331 / 464–466、`AppLayout` 112 / 142、`main.css` 38–45、`variables.css` 112–114 / 122 均与实读一致。

---

## 评审结论

- 需求主线（可发现的快捷键总览 + 选区模板动作只预填草稿 + 入口发现性）与 PRD §7 判据 2 对得上；本轮 17 条既有键位中 16 条逐条对位、无虚构；既有 `.quick-ask` / composer / chips / 载荷语义在白名单上确实被隔离；工程门 `npm run check` 复跑 0 error；R16 零缺失基线（166 / 237 / 64）复读一致。
- 但存在 **1 条不可满足的判据（M1）**、**1 条错误的回归证据链（M2）**、**1 处未登记的空间冲突（M3）**、**键位表的真实遗漏与交互口径缺口（M4）**、**档内自相矛盾（M5）**，以及若干不可判判据（M6/M7）与事实表行号失真（M9）。这些不是「开发时顺手改」的量级：M1 / M5 / M7 / M8 都落在 §0.2 / §0.3 / §0.6 / §0.7 的**冻结字面**上。
- 评审裁定：**不通过（需修订后复审）**。M1–M9 清空（或由负责人逐条裁决改判并同步 §0.0/§0.2 的连带条目）之后，方可进入设计档 / 开发档；其中 M1 / M3 / M7 建议在开发档开工前先落一版修订，否则离屏会直接判红或留下空验证面。

---

## 设计评审（R17）

- 评审对象：`docs/pm/R17-design.md`（未跟踪新增档，872 行）；对照 `docs/pm/R17-req.md`（含 §0 定稿修订 M1–M9 与 §0.0–§0.9 冻结契约）
- 评审基线（本次实读）：`git status --short` ⇒ 仅 `?? docs/pm/R17-req.md` / `?? docs/pm/R17-review.md` / `?? docs/pm/R17-design.md`；`git log --oneline -1` ⇒ `8850c9c`
- 本轮实跑：`cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（唯一工程门复现，与设计档 §0.1 一致）
- 取证纪律：全部结论来自本步真实文件内容（`read` / `grep` / `sed` / `awk` 只读）与真实命令输出；行号一律以本次实读为准；本步**未跑**烟测与离屏（按任务书不跑离屏取证）

### 0. 五个重点核对项逐条结论

**清单 1 — 键位表与真实代码逐条对照：通过（18/18 对位，无虚构、无遗漏）。**

| # | 表内键位 | 本次实读锚点 | 结论 |
| --- | --- | --- | --- |
| 1 | `["/"]` 打开文档搜索 | `PdfViewer.vue:455-458`（`event.key === "/"` ⇒ `preventDefault` + `openSearch()`） | 对位 |
| 2 | `["Ctrl+F"]` | `PdfViewer.vue:419-427`（`ctrlKey && !shiftKey && !altKey && !metaKey && pageCount > 0 && key.toLowerCase() === "f"`；输入框聚焦时仍生效——修饰键分支 `:416` 先于 `:444` 守卫） | 对位 |
| 3 | `["PageUp", "←"]` 上一页 | `PdfViewer.vue:463-468`（第 1 页 `return`，不 `preventDefault`） | 对位 |
| 4 | `["PageDown", "→"]` 下一页 | `PdfViewer.vue:469-474`（末页 `return`） | 对位 |
| 5 | `["Home"]` | `PdfViewer.vue:475-478` | 对位 |
| 6 | `["End"]` | `PdfViewer.vue:479-482` | 对位 |
| 7 / 8 | `["["]` / `["]"]` | `PdfViewer.vue:445-454`（447 框选屏蔽、450 目标 `null` 零副作用） | 对位 |
| 9 | `["Esc"]` 退出框选 / 关搜索 | `PdfViewer.vue:434-437`（capture 优先）+ `:439-442`（searchOpen） | 对位 |
| 10 | `["Enter"]` 发送（composer） | `InputArea.vue:28-35`（`isComposing` `:30`；`Enter && !shiftKey` ⇒ `preventDefault` + `emit("send")`） | 对位 |
| 11 | `["Shift+Enter"]` 换行 | 同文件：未拦截（浏览器默认），无应用侧监听 | 对位（表述可接受） |
| 12 / 13 | 搜索框 `Enter` / `Shift+Enter` | `PdfSearchPanel.vue:307-311`（`isComposing` `:308`；`shiftKey` ⇒ `goToPrev`）+ 模板 `:407` | 对位 |
| 14 / 15 | 页码输入框 `Enter` / `Esc` | `PdfViewer.vue:1209` / `:1210`（均 `.prevent`） | 对位 |
| 16 | 笔记搜索框 `Esc` | `NotesPanel.vue:222-226`（223 `clearSearchQuery()` / 224 `blur()` / 225 `stopPropagation()`）+ 模板 `:631` | 对位（档内行号偏差见 D5） |
| 17 | 重命名输入框 `Enter` | `ChatPanel.vue:1166` + `onRenameEnter` `:708-711`（`isComposing` `:709`） | 对位 |
| 18 | `["?"]` 打开或关闭本总览 | 本轮新增（未伪装成既有键位） | 新增 |

反例检查：`ArrowUp` / `ArrowDown` 在 `PdfViewer.vue` 的 switch（`:462-483` 全读）**无分支**；无缩放键位（`zoomBy` 仅按钮 `:1081-1083` 调用，`onWheelZoom` 属 wheel 手势）；`SettingsPage.vue:491` 按 §1.3 注 5 显式登记为「工作区外」。收录完备性实读：全仓 `@keydown` 模板挂点 **7 处**（`InputArea.vue:59` / `ChatPanel.vue:1166` / `NotesPanel.vue:631` / `PdfSearchPanel.vue:407` / `PdfViewer.vue:1209` / `PdfViewer.vue:1210` / `SettingsPage.vue:491`），window 级 `keydown` 监听 **1 处**（`PdfViewer.vue:493`）⇒ 18 行 = 阅读区 9 + 输入框 8 + `?` 1，无第 19 个未登记键位。

`?` 与 `/`、Shift 组合在真实事件模型下**成立**：`PdfViewer.vue:455` 判 `event.key === "/"`，§1.4 的 `?` 分支判 `event.key === "?"` ⇒ US 布局下 Shift+`/` 产出的 `key` 是 `"?"`，`/` 分支不命中；`Ctrl+F` 分支在 `event.ctrlKey` 时先 `return`（`:416-431`）⇒ `Ctrl+Shift+/` 不会落到 `?` 分支；`?` 的守卫不检查 `shiftKey`（正确，Shift 是必要修饰键）；`PdfViewer.vue` 本轮零 diff（§2.1 / §2.3 判据）⇒ `/` 语义不变。

**清单 2 — 浮层的焦点 / 键盘 / 关闭路径：可构造、可判、非空；两处需修（D2 / D6）。**

- 三条关闭路径均可离屏构造：Esc（`pressKeyOn(SEL.shortcutOverview, "Escape")`，面板是 `tabindex="-1"` 的 div，合成 keydown 冒泡到 window）、外部点击（`document.body` 上 `new PointerEvent("pointerdown", { bubbles: true })` 冒泡到 document 级监听）、`.shortcut-close` 的 click；`v-if` 真删除 ⇒ `document.querySelector(SEL.shortcutOverview) === null` 与 `.shortcut-row` 计数 0 可判。
- `aria-expanded` 读法与既有 `aria-pressed` 先例同构（`PdfViewer.vue:1162`）⇒ `getAttribute` 读字符串 `"true"` / `"false"` 成立。
- 「不 `preventDefault`」口径非空：以 `dispatchEvent` 布尔返回值 + 非空草稿（`"草稿守卫"`）+ 「INPUT 分支浮层仍打开」三处钉住（与需求档 M6 的处置一致）。
- 与「输入框聚焦」的边界具体：TEXTAREA（`.input-area`）与 INPUT（`.pdf-search-panel .search-input`，实读 `PdfSearchPanel.vue:401-408` 是原生 `<input>`）有真实实例与离屏判据；`SELECT` / `contenteditable` 在工作区内无实例（实读：`<select` / `v-select` 仅 `SettingsPage.vue`，全仓无 `contenteditable`）⇒ 只走查，与需求档口径一致。
- **缺口：D2（入口分支的焦点归还断言不可满足）、D6（零相交断言在矩形缺失时静默通过）。**

**清单 3 — N97 预填链路：通过（seam 沿用既有 quick-ask 通道；「不发送」由代码结构保证；既有断言面零破坏）。**

- seam：`emitQuickAsk`（`useQuickAsk.ts:18`）加第二参数与默认值 `"ask"`；唯一发射方仍为 `PdfSelectionQuickAsk.vue`（import `:12`、调用 `:151` + 新增 `onTemplateClick`），唯一消费方仍为 `ChatPanel.vue` 的 `registerQuickAskConsumer(onQuickAsk)`（`:848`，注销 `:855`；实读全仓引用仅此 4 处 + 定义）；`registerQuickAskConsumer` 签名不变 ⇒ 既有调用零破坏。笔记 seam（`NotesPanel.vue:12/213/680` 的 `emitNotesAsk`）与本轮无关、零改动。
- 「不发送」的结构性保证：`onTemplateClick` 三行只 `hide()` + `emitQuickAsk`；消费端只写 `draft.value` + `composerInput.value?.focus()`；全仓 `send()` 的触发点只有 `@send="send"`（`ChatPanel.vue:1135`）与 `.composer-send` 的 `@click="send"`（`:1142`）——模板动作链路不触及。
- 既有草稿语义零破坏：`ask` 分支两行（`:308` / `:309`）逐字与缩进不变（§0.3 的「非 ask 分支提前 return」写法可满足 `git diff -U0` 的「既有行不得作为 `-` 行」判据）；`NOTES_ASK_TEMPLATE`（`:314`）与 `onNotesAsk`（`:324-330`）零改动。
- 既有 chips / 载荷断言零破坏：`send()` / `reading-context.ts` / `notes-path.ts` 零 diff；`chipSnapshot()`（`:3316-3334`）与 `userBlocks()`（`:2385`）只作「不变」判据。既有 ui-shot 对浮层按钮的 6 处定位全部按文本（`:1448` / `:1479` / `:1982` / `:5416` / `:5537` / `:6791` 实读）⇒ 中间插入两个按钮不影响；**唯一必须同步的既有断言 = 三处 `btnCount === 2`（`:5518` / `:6987` / `:7059`）⇒ 4**；反馈期 `btnCount === 0`（`:6975` / `:6978`）不受影响（feedback 分支不渲染按钮）。

**清单 4 — 4 按钮几何：通过（单行 / 不溢出 / 换行 / 双向边界均有判据；隐藏规则在新按钮下成立）。**

- 双向边界：`浮层 ⊆ .reader-stage（含 STAGE_PADDING = 4 内缩）`实读自 `showFor` 的 clamp（`PdfSelectionQuickAsk.vue:80-89`：`left = clamp(rect.right - width, minX, Math.max(minX, stageRight - width - 4))`，`top` 同构）⇒ 左右 / 上下四边皆有界。
- 换行判据：`.quick-ask` 是 `display: inline-flex` 且未设 `flex-wrap`（默认 `nowrap`，实读 `:228-242`）；「4 按钮 `x` 严格递增 + 两两不相交 + `width > 0`」在 LTR 下等价于「单行且不重叠」（换行会让第二行 `x` 回落 ⇒ 判红），`scrollOverflow <= 1` 同时覆盖「被挤压 / 横向溢出」。
- 缩放相位自洽：`Math.abs(float.right - (stage.right - 4)) <= 1.5` 与 clamp 上界生效时的恒等式一致（`float.right = left + width = (stageRight - width - 4) + width = stageRight - 4`）；`.pdf-scroll` `overflow: auto`（`PdfViewer.vue:1260-1265`）与 `.pdf-page` `margin: 0 auto`（`:1267-1272`）支持「页宽溢出时页左缘落到内容左缘」的推算；`--pix-right-width` 手法与既有窄栏一致（`ui-shot.mjs:7148-7149` / `:8628-8635`），复位断言 380 ± 2 与既有 `:8675` 同范式。
- 隐藏规则：新按钮走同一 `hide()`（`:92-102`）与 `@pointerdown.prevent`（`:202`）；`onSelectionChange`（`:117-138`，含同文本保态分支）、`onStageScroll`（`:140-146`）、`watch(filePath)`（`:175-179`）零改动；`:disabled="pending"` 复用既有语义（四按钮一并禁用）。

**清单 5 — 白名单与样式注册：通过（无需改 `main.css` / `variables.css` / `WorkspacePage.vue`）。**

- 改动面与 §4 的 10 行白名单逐条对上；**不在白名单内、也确认不需要**的注册点逐个核实：新组件用 `<style scoped>`，`Teleport` 内容仍由本组件渲染 ⇒ 带 scoped 属性，与既有 `.map-toggle` 先例同款（`ReaderPanel.vue:192-204` + 样式 `:311-344`，R11/R14 已被离屏与截图验证）⇒ 入口样式生效路径成立，**不需要在 `main.css` 注册**；入口只用既有变量（`--pix-bg-hover` `variables.css:15` / `--pix-bg-active` `:16` / `--pix-text-secondary` `:31` 等实读存在）。
- 新 util 零 import ⇒ `smoke-view.mjs` 的产物核对逻辑（`allowed` 由 `required + "shared/types.js"` 推导，实读 `:799-815`）只需把两个新 `.js` 并入 `required`，无额外 emit 产物；`pix/tsconfig.json` 的 `include = ["src/renderer/**/*.ts", "src/renderer/**/*.vue", "src/shared/**/*.ts"]` 实读覆盖新文件 ⇒ 自动进入 `npm run check` 与构建，无需任何注册表。
- 剩余遗漏仅文档级（D4 / D5）。

### 1. must-fix 清单（新编号 D1–D6，与需求评审 M1–M9 区分）

**D1（阻塞：r17-1b 两相位的「地图关闭态」前置在真实运行序下必然失败）**
证据：`mapOpen` 是 store 级状态（`reader-store.ts:30`，默认 `false`、无持久化、无 reset；`openDocument`（`:54-68`）不清它）；`ui-shot.mjs:9820` 的 r16-2 场景 `await ensureMapOpen()` 打开地图后，直到 R17 追加点（`:10234` 的 `restoreStandardSeed()` 之后、`:10235` 收口之前）之间**没有任何关闭动作**（实读 `:9860-10236` 区间内 `grep -in "map"` 只剩 `.map()` 数组方法等无关命中，无 `closeMap` / `.map-toggle` / `mapSlot`）；R17 场景开头的 `enterCleanWorkspace`（`:3397-3407`）只清 `reader-state.json` 与切页，不复位内存态 ⇒ r17-1b `default` / `narrow` 的 `has(SEL.mapSlot) === false` 恒为 false（`showMap = mapOpen && isPdf && mapFits`，`mapFits = stageWidth >= MIN_STAGE_WIDTH_FOR_MAP(=620)`，`ReaderPanel.vue:28/61-62`；默认宽度 stage ≈ 912 ⇒ 命中）⇒ 两相位**必然判红**。
处置：相位入口显式保证地图关闭 —— 复用同作用域的既有幂等 helper `closeMap()`（`ui-shot.mjs:7342-7346`），例如 `if (await has(SEL.mapSlot)) await closeMap();`；并把 §5.4.3 r17-1b 括号里「未点 `.map-toggle` 即成立」的论证改成「r16-2 遗留打开态 ⇒ 显式关闭」。需求档 N96-5 的「地图关闭态取值」措辞本身没错，保证动作必须落在夹具侧。

**D2（阻塞：`close-paths-and-focus-return` 的「入口分支」断言不可满足）**
证据：该相位步骤 ④ 用 `clickEl(SEL.shortcutToggle)` 打开，而 `clickEl` = `el.click()`（`ui-shot.mjs:7273`）；程序化 `click()` 不移动焦点（浏览器聚焦只发生在真实指针 / 键盘交互的默认动作里），且关闭契约为「`lastFocused?.isConnected` ⇒ `lastFocused.focus()`，否则 ⇒ 入口按钮」（设计档 §1.4 / 需求档 §0.5）⇒ 步骤 ①②③ 的关闭都把焦点还给 `document.body`（`body.isConnected === true` ⇒ 永不走入口兜底），步骤 ④ 打开时 `lastFocused` 仍是 `document.body` ⇒ Esc 关闭后 `document.activeElement` 为 `document.body`，**不是** `.shortcut-toggle`（需求档 N96-4 判据 1 的「入口分支」同此——与 M6 是同一类缺前置，只是那次只修了 body 分支）。
处置（二选一）：① 该分支补前置「先 `document.querySelector('.shortcut-toggle').focus()` 并自检 `activeElement === .shortcut-toggle`，再点击打开」（与 body 分支的 `blur()` 前置同款；修好后断言可满足且非空）；② 该分支期望改为 `document.activeElement === document.body`，另在「先聚焦入口再打开」的变体里判 `.shortcut-toggle`。

**D3（判据无数据源 / 判据缺失）**
证据：① §5.4.3 `explain` 相位断言 `tagName === "BUTTON"` 与 `tabIndex >= 0`，但 §5.4.2 冻结的 `quickAskActionsProbe()` 返回 `{ display, rect, buttons: [{ text, icon, rect, disabled }], scrollOverflow, btnCount }` —— 无 `tagName` / `tabIndex` 字段，读数无从取得；② 需求档 N97-4 判据 1 的「对「解释」按钮 `focus()` 后 `document.activeElement === 该按钮`」在设计档 r17-2 / r17-2b 四个相位中**没有落点**（离屏面缺一条判据）。
处置：`quickAskActionsProbe()` 的 buttons 项补 `tagName` / `tabIndex`（在 §5.4.2 登记为需求字段的扩展；或改由相位内联 `js()` 读取），并在 `explain` 相位补 focus 断言。

**D4（档内自相矛盾 / 名字不可用）**
证据：① §0.2 的 M3 行写「§5.4 `r17-1b` 两相位的前置 `assertNoMapSlot()`」，而 §0.3「离屏新增的复用选择」明写「**不新增第 6 个 helper 名**（需求档冻结 5 个）」、§5.4.2 只定义 5 个 ⇒ 该名字在冻结配额之外（实际相位用的是 `has(SEL.mapSlot)`，§5.4.3 实文）；② §0.2 的 M1 行引用读数项 `quickAskAfterExplain`，但 §5.4.3 `explain` 的 `data` 清单（`{ phase, actions, draft, focused, quiet }`）里没有该字段，`display` / `btnCount === 3` 断言也没有落在任何 data 字段上；③ §5.4.2「复用 helper」把 `saveCalls` 写成 `readerStateSaveCalls` —— 实读 `ui-shot.mjs:1631` 的本地 helper 名是 `saveCalls`（`readerStateSaveCalls` 只是 stub 方法名 `:1247`），照档内字面写会在场景作用域里抛 ReferenceError。
处置：删去 `assertNoMapSlot`（用 `has(SEL.mapSlot)`）；`quickAskAfterExplain` 归位到 `explain` 的 `data`；helper 名改 `saveCalls()`。

**D5（事实表行号失真，同类需求档 M9）**

| 档内位置 | 档内值 | 本次实读值 |
| --- | --- | --- |
| §0.1 组件级键位行 / §1.3 表第 16 行 | `NotesPanel.vue` `onSearchEsc` `:224-227` | **222-226**（222 签名 / 223 `clearSearchQuery()` / 224 `blur()` / 225 `stopPropagation()` / 226 `}`；需求档写 222-226 正确） |
| §0.1 组件级键位行 / §1.3 表第 10 行 | `InputArea.vue` `onKeydown` `:28-36` | **28-35**（36 为空行） |
| §5.4.1 | `.input-area` = `SEL.composerInput` `:86` | **:100**（`:86` 是 `pdfViewer`） |
| §0.1 / §5.4.2 | `waitFor` `:1593` | **1598-1606**（`:1593` 是 `sleep`） |
| §0.1 / §5.4.2 | `goHome` `:1681-1689`、`enterWorkspace` `:1691-1704` | **1686-1694**、**1696-1709** |
| §0.1 / §5.4.2 | `enterCleanWorkspace` `:3392-3402`、`openNotesPanel` `:3405-3408` | **3397-3407**、**3410-3413** |
| §0.1 / §2.1 | clamp 块 `:80-88` | 需求档 M9 已定为 `:80-89`（实读整块 80-89）⇒ 两档口径需统一 |

另有同批尾界 ±1~3 的偏差（`openRow` 档内 `:1711-1720` / 实读 1711-1719；`selectPageSpan` 档内 `:1757-1772` / 实读 1757-1770；`chipSnapshot` 档内 `:3316-3335` / 实读 3316-3334；`rectOfSelector` 档内 `:2569-2582` / 实读 2569-2585）。经复核**一致**（起点行号与关键行）：`repaint :1263-1266`、`capturePage :1268-1276`、`textOf :1614`、`has :1618`、`countOf :1619`、`stateBytes :1620`、`openRow :1711`、`setDraft :2534-2543`、`sendCalls :3258` / `clearSendCalls :3259` / `lastSend :3264` / `waitSendCalls :3271`、`restoreStandardSeed :3416-3420`、`notesAddCalls :2382`、`userBlocks :2385`、`quickAskStateProbe :5459-5469`（`btnCount :5467`）、`selectionProbe :5472-5481`、`clickEl :7273`、`pressReaderKey :7276-7279`、`pressKeyOn :7282-7287`、收口 `:10234` / `:10235`、`SEL :47-118`（64 项，末项 `notePageBadge`；`sed -n '47,124p' | grep -cE` 实读 64）、三处 `btnCount === 2`（`:5518` / `:6987` / `:7059`）、`PdfSelectionQuickAsk.vue` 行段（`:18/:19/:20/:22`、`:56-90`、`:92-102`、`:117-138`、`:140-146`、`:148-152`、`:175-179`、`:196-225`、`:228-242`、`:244-264`、`:266-284`）、`ChatPanel.vue`（`:163/:166/:304/:306-310/:314/:708-711/:848/:855/:1123/:1127-1136/:1166/:1703`）、`ReaderPanel.vue`（`:42/:155/:159/:176/:192-204/:206/:207/:258/:263-269/:292-309/:311-344`）、`WorkspacePage.vue`（`:321-331/:369-375/:377-392/:394-398/:400-409/:459-462/:464-466`）、`AppLayout.vue`（`:105-114/:128-140/:142-152`）、`variables.css:112-114/:122`、`main.css:38-45`、`smoke-view.mjs`（`:33-34/:139-142/:149-158/:173/:255/:308/:385/:474/:550/:620/:780-786/:799-800/:825-848`，`grep -c "  check("` = 51）。
处置：按上表改字（只改文档，不动任何判据与冻结字面；D5 不改变任何语义）。

**D6（防空缺口：零相交断言在矩形缺失时静默通过）**
证据：§5.4.2 冻结 `intersects(a, b)`「`null` 一律判 `false`」⇒ 若浮层或任一对照控件取不到矩形（面板未渲染、选择器写错、DOM 未就绪），r17-1b 的六处零相交断言会全部「通过」（false = 不相交），只剩 `⊆` 判据一道防线；`data` 只落读数、不防空。
处置：在 r17-1b 两相位加一条前置（`has(SEL.shortcutOverview)` 且 `shortcutProbe().rect` 非 null、各对照 rect 非 null，任一缺失即判红），或在 `intersects` 的调用点强制非 null 断言。

### 2. 非阻塞建议（不削弱判据，建议开发档采纳）

1. `key-toggle-and-typing-guard` 步骤 ② 可顺手补一句「`?` 不得打开 `.pdf-search-panel`」（把「`?` / `/` 互不误触」从走查升级为可判，成本一行）。
2. `four-buttons-*` 的「单行」建议显式判 4 个按钮 `y` 相同（±1），使「换行」判据不依赖 `x` 递增的隐含推理。
3. 登记行为补一条：`.notes-search-input` 的 Esc 在 `NotesPanel.vue:225` 调 `stopPropagation()` ⇒ 该输入框内按 Esc **不会**冒泡到 window，浮层不会随之关闭（与设计档 §1.4「登记行为①」的 composer 情形不同）；本轮无判据依赖它，登记即可。

### 3. 评审结论

- 设计档把需求档 §0.2–§0.9 的冻结契约落到了实现级（数据模块逐字内容、组件参考实现、seam 与消费端形状、4 按钮几何、烟测 23 条与离屏 4 场景 11 条 record / 7 张截图的判据），**键位表 18/18 对位、无虚构键位**；`?` / `/` 的事件模型判定成立；N97 预填链沿用既有 `useQuickAsk` 通道，「不发送」由代码结构保证，既有 `.quick-ask` / composer / chips / 载荷断言面除三处 `btnCount`（已登记）外零破坏；4 按钮的单行 / 双向边界 / 换行 / 隐藏规则判据齐备；白名单完整，新组件样式走组件内 `<style scoped>`（Teleport 先例），**无需改 `main.css`**；`npm run check` 复跑 `CHECK_EXIT=0`。
- 但存在 **2 条会在正确实现上判红的阻塞项（D1 地图前置事实判断错误、D2 入口焦点归还断言缺前置）**、**1 条判据无数据源 / 缺落点（D3）**、**3 条文档级硬伤（D4 名字与配额矛盾、D5 行号失真、D6 防空缺口）**。D1 属「前置事实与真实运行序相反」（r16-2 在 `ui-shot.mjs:9820` 留下地图打开态），D2 与需求评审 M6 同类（缺夹具前置 ⇒ 断言不可满足）。
- 评审裁定：**revise**。D1–D6 清空（或由负责人逐条裁决改判并同步 §1.4 / §5.4.2 / §5.4.3 的连带条目与需求档 N96-4 / N96-5 的执行口径）后方可开工；其中 D1 / D2 / D3 建议在开发开工前先落一版修订，否则离屏会直接判红或留下不可判的断言。

---

## 代码审查（R17）

> 审查对象：R17 交付（`git diff` 的 6 个改动文件 + 3 个新源文件 + `docs/pm/R17-dev.md`），对照 `docs/pm/R17-req.md`（N96–N99 + §0 定稿修订 M1–M9 + §0.0–§0.9）与 `docs/pm/R17-design.md`（§1–§9 + 定稿修订 D1–D6）。
> 审查方式：冷启动独立复验。**未复用交付方的结论与产物**：离屏取证写入全新目录 `C:/Users/86157/AppData/Local/Temp/pix-v06-r17-review`（交付方目录为 `pix-v06-r17-after`）；11 条新 record 的全部断言按原始读数**用自写脚本独立复算 108 条**（期望值直接取自需求档 §0.3 / §0.9 与设计档 §5.4.3，未读取交付脚本的断言代码）；键位表 18 行逐条与真实源码对照。
> 只读命令与一次性脚本（`%TEMP%`，运行后已删除）之外未做任何仓库写入；未运行 git 写命令、未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；两个取证进程串行（本步只跑一次离屏，未与交付方进程并发）。

### A. 实跑证据（全部为本次真实命令输出）

| # | 命令 / 方法 | 结果 |
| --- | --- | --- |
| 1 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` | `CHECK_EXIT=0`（`vue-tsc --noEmit` + 两个 `tsc --noEmit`，0 error） |
| 2 | `node scripts/smoke-notes.mjs` | `通过 65 / 失败 0`、退出码 0（10 组；文件零 diff） |
| 3 | `node scripts/smoke-view.mjs`（两次） | 两次均 `通过 74 / 失败 0`、退出码 0；组构成 = 既有 7 组 51 条（`section-hit` 8 / `section-null` 8 / `section-nav` 8 / `section-format` 5 / `badge-counts` 6 / `notes-by-page` 6 / `excerpt-match` 10）+ `shortcut-table` 12 + `template-draft` 11；`grep -c "  check("` = **74** |
| 4 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v06-r17-review ./node_modules/.bin/electron scripts/ui-shot.mjs` | `UISHOT_EXIT=0`；末行 `[ui-shot] 结束：产出 173 张截图`；日志无 `场景失败` / `renderer gone` / `unhandledRejection`（唯一 renderer 报错 = 既有 `r15-f18` 的 `setPointerCapture` 噪声） |
| 5 | `MANIFEST.json` / `MEASUREMENTS.json` 复读 | `shots.length = 173`、`failure === null`；测量 **248** 条、label 去重 **68**；目录内 png **173** |
| 6 | 零缺失比对（自写脚本 `%TEMP%/pix-r17-review-compare.cjs`） | 基线 166 张截图缺失 **0**；166 张 png 缺失 **0**；64 种 label 缺失 **0**；前 237 条 label 序列逐条一致 **true**；label 条数减少的组 **[]**；新增 label 恰 4 种（`r17-shortcut-overview` / `r17-shortcut-geometry` / `r17-template-actions` / `r17-template-geometry`）；新增 7 张截图齐备；`shots` 清单与磁盘双向相等 |
| 7 | 11 条 `r17-*` record 断言独立复算（自写脚本 `%TEMP%/pix-r17-recompute.cjs`） | **checked=108、failed=0**（覆盖 18 行逐字、entry 双态、焦点 / 关闭路径、六处零相交、4 按钮几何与钳制、草稿三分支、零发送等） |
| 8 | 走查计数（`grep` 实跑） | `SEL` **70** 项；`btnCount === 2` **0** / `btnCount === 4` **3**（`:5525` / `:6994` / `:7066`）；`onTemplateClick` 三行逐字同序；`QUICK_TEMPLATE_REPLACEABLE` 逐字单行 **1** / 标识符 **2**；`ShortcutOverview.vue`：`shortcut-toggle` 4 / `快捷键总览（?）` 1 / `ReaderPanel` 内 `ShortcutOverview` 2 / `keys.join\|SHORTCUT_SECTIONS` 3 / 组件内手写键位 `上一页\|下一节\|发送消息` **0** / `position: fixed` **0** / `overflow: hidden` **0** / `stopPropagation` **0** / 捕获阶段 `keydown` **0** / `isComposing` **1** / `tabindex="-1"` **1** / `.focus()` **3** / `focusin\|focusout\|trap` **0** / `pageCount\|readerStore` **0** / `localstorage\|sessionstorage` **0** / `first\|seen\|dismiss` **0**；`window` 监听注册 **1** / 注销 **1**；6 个新用 mdi 图标在 mdi CSS 内均存在；`InputArea` 内 `mdi-lightbulb-on-outline\|mdi-translate` = 2 |
| 9 | 红线 diff 走查 | 范围外零 diff 集合（`main` / `shared/types.ts` / `PdfViewer.vue` / `PdfSearchPanel.vue` / `NotesPanel.vue` / `KnowledgeMap.vue` / `InputArea.vue` / `pages` / `stores` / `reading-context.ts` / `notes-path.ts` / `outline-notes.ts` / `page-anchor.ts` / `assets/styles` / `package.json` / `package-lock.json` / `packages` / `smoke-notes.mjs`）**全部为空**；`ui-shot.mjs` 的 `-` 行恰 **3 条**（三处 `btnCount`）；`smoke-view.mjs` 的唯一 `-` 行 = `required` 数组；`ChatPanel.vue` 的唯一 `-` 行 = 函数签名行；`PdfSelectionQuickAsk.vue` / `ReaderPanel.vue` / `useQuickAsk.ts` 的 `-` 行仅登记项（后者 3 行签名 / 类型）；无 `any`、无内联动态 import、无 `console.log`；无新增 `--pix-*` 变量；`git status --short` = 6 `M` + 7 `??`，全在白名单内 |
| 10 | 目视（`read` 工具实看 6 张新截图） | `r17-1`（浮层落在 pill 之下、320 宽、3 组 18 行含「摘录」说明行、不压工具条 / 页码指示器 / 章节 chip / FAB / 右栏）、`r17-1b`（pill 内 20px 键盘图标、文档名完整未省略）、`r17-1c`（窄栏下浮层完整、右上关闭按钮未被挤出）、`r17-2`（4 按钮单行、图标与文案对齐、胶囊未裁切、选区灰带可见）、`r17-2b`（草稿逐字、输入框聚焦、无新消息块）、`r17-2d`（200% + 窄栏：4 按钮单行、右缘贴住内缩 4px、无横向滚动条） |
| 11 | 既有 `.quick-ask` 回归读数（本运行） | `r11-quick-ask-scroll-scope` 五相位全绿：`excerpt-into-empty-panel` / `notes-panel-scroll` 反馈 `is-ok` + `已摘录 · 第 N 页`；`reader-scroll-control` 滚动后 `display:none`；`spurious-selectionchange` 反馈存活且到期回落（`btnCount 4`、`feedbackClass null`）；`different-text-reset` 回落（`btnCount 4`）且选区完好 |
| 12 | 临时产物 | `%TEMP%/pix-smoke-view-*` **0** 项；一次性脚本与日志存于 `%TEMP%` 并已删除；仓库内零临时文件 |

### B. 验收逐条结论（对照 req / design 冻结判据）

| 子条 | 判定 | 关键证据（本步独立读数） |
| --- | --- | --- |
| N96-1 入口 | 通过 | 未开文档与开文档后 `title = 快捷键总览（?）` / `aria-label = 快捷键总览`（两次断言）；`aria-expanded` false→true→false；入口 20×20；走查 #1 计数 4 / 1 / 2 |
| N96-2 浮层与键位表 | 通过 | DOM 读出 `sectionTitles` 三项逐字、`rows` 18 行逐条与 §0.3 表逐字相等、`noteText` 逐字、`closeCount = 1`；烟测 `shortcut-table` 12/12 |
| N96-3 开关与关闭 | 通过 | TEXTAREA 内 `?` 返回 true 且不打开、草稿逐字不变；body `?` 打开（且未触发 `/` 语义）；再 `?` 关闭；`/` 打开搜索面板；INPUT 内 `?` 返回 true 且浮层仍开；一次 Esc 同时关闭搜索与浮层；三条关闭路径均离开 DOM；捕获 **0** / `stopPropagation` **0**；分支顺序 `key !== "?"` → 修饰键/`isComposing` → `isEditableTarget` → `preventDefault` 逐字对位（`:61-66`） |
| N96-4 焦点管理 | 通过 | 打开后 `activeElement === .shortcut-overview`；入口分支归还 = `.shortcut-toggle`（含 focus 前置自检 true）；body 分支 = `document.body`（含 blur 自检 true）；`focusableCount === 2`；`tabindex="-1"` 恰 1；无 focus 陷阱 |
| N96-5 不遮挡与窄栏 | 通过 | 浮层 ⊆ `.reader-panel`；与 `.composer-box` / `.pdf-toolbar` / `.pdf-page-indicator` / `.reader-section` / `.pdf-capture-fab` / `.center-pill` 六处零相交（pill 底 75 vs 浮层顶 79，余 4px）；窄栏（560px）重复全判据成立且 `.layout-right` 复位 380；开关前后 `scrollTop 48` 与页 1 矩形逐字不变 |
| N96-6 关闭后零残留 | 通过 | 关闭后浮层不在 DOM、`.shortcut-row` 0、`aria-expanded false`；`send` / `notesAdd` / `stateSave` 零增量；无 `localStorage`；`stores` / `main` / `shared` 内 `shortcut` 0 命中；注册 / 注销 `window` 监听 1/1（M2 限制口径） |
| N97-1 两个动作 | 通过 | 4 按钮文本与图标逐字（各命中恰 1）；既有两按钮与全部 CSS 无 `-` 行 |
| N97-2 草稿填入规则 | 通过 | 点「解释」后 `value` 逐字 `EXPLAIN_TEMPLATE` 且聚焦；「解释 → 翻译」替换、空草稿填入均逐字 `TRANSLATE_TEMPLATE`；自定义草稿与 `NOTES_ASK_TEMPLATE` 一字不改；烟测 `template-draft` 11/11 |
| N97-3 选区 / chips / 载荷 | **不满足冻结字面（见 D 节 D-1）；等价形态落地，其余判据通过** | 满足项：`sendCalls` 增量 0、`.message-block` 不变、notes 文件零写入、`send()` / `reading-context.ts` 零 diff、点击时刻选区与页 1 首 span 逐字相等（`collapsed false`）；**不满足项**：点击后 `collapsed true` 且 chips 净差异恰 1 项（「选中文本」掉落）——根因为 `composerInput.value?.focus()`（冻结行）触发引擎的选区收拢（控制实验复现因果：写草稿不聚焦 ⇒ 选区完好；聚焦 ⇒ 塌陷），该行为在 HEAD 的「问 AI」路径同源（`git show HEAD` 实读） |
| N97-4 键盘可达与几何 | 通过 | 4 按钮 `tagName BUTTON` / `tabIndex 0` / `disabled false`；「解释」`focus()` 后 `activeElement` 即该按钮；默认 / 窄栏 / 200% 三相位：⊆ stage（含 4px）、`scrollOverflow 0`、`x` 递增、同一行（`y` 差 0）、两两不相交；200% 下 `float.right = 1015 = stage.right(1019) - 4`（`clampGap 0`）、收尾回 100% / 380 |
| N98-1 title / aria 与可见条件 | 通过 | 未开文档即可见（`pillReady` 就绪判定）；`reader-header` 0 命中；组件内 `pageCount\|readerStore` 0 命中 |
| N98-2 不打扰 | 通过 | 进入工作区首帧浮层 / 行 / 键 / 说明计数全 0、`.shortcut-toggle` 恰 1；无持久化 / 无首次分支；无自动打开 |
| N99-1 工程门与回归 | 通过 | `CHECK_EXIT=0`；`smoke-view` 74/0（两次）；`smoke-notes` 65/0（零 diff）；离屏 173 张 / 248 条 / 68 label、`failure === null`、166 + 237 + 64 零缺失 |
| N99-2 烟测新增两组 | 通过 | 12 + 11 = 23 条全绿；`files` / `required` 各 +2；`allowed` 未改且无白名单外产物 |
| N99-3 场景与配额 | 通过 | 4 场景 / 4 组 / 11 条 record / 7 张截图（命名逐字）；零缺失；每条 record 的断言经独立复算 108 条无失败 |
| N99-4 既有断言更新与回归 | 通过 | `btnCount === 2` → 0、`=== 4` → 3；r11-3 两处回落相位在 4 动作下全绿；反馈期 `btnCount === 0` 两处零改动；`r15-f16` / `r16-5` 保持绿（M2 的证据链限制按文档口径登记） |

### C. 专项反证（任务书 ①–⑥）

| # | 反证项 | 结论与证据 |
| --- | --- | --- |
| ① | 键位表逐条与真实代码对照（18 行） | **18/18 一致，零虚构**。逐行实测：`/`（`PdfViewer.vue:455`）、`Ctrl+F`（`:419-427`，输入框聚焦仍生效）、`PageUp`/`←` 与 `PageDown`/`→`（`:463-474`）、`Home` / `End`（`:475-482`；switch 内**无** `ArrowUp` / `ArrowDown`）、`[` `]`（`:445-454`，框选屏蔽与目标 null 零副作用）、`Esc`（`:434-442` 两分支）、`Enter` / `Shift+Enter`（`InputArea.vue:28-35`）、搜索框 `Enter` / `Shift+Enter`（`PdfSearchPanel.vue:307-311`）、页码 `Enter` / `Esc`（`PdfViewer.vue:1209-1210`）、笔记搜索 `Esc`（`NotesPanel.vue:222-226`）、重命名 `Enter`（`ChatPanel.vue:1175` + `onRenameEnter :717-720`）、`?`（本轮新增）。全仓挂点复核：`@keydown` 模板挂点 7 处、window `keydown` 2 处（既有 1 + 本轮 1），全部被表覆盖或按注 5 排除（`SettingsPage.vue:491` 工作区外）；`?` 与 `/` 按 `event.key` 天然分离（`PdfViewer.vue` 零 diff） |
| ② | `?` 在输入框聚焦时必须输入字符、不得打开总览 | **成立**。TEXTAREA（composer，草稿非空）：`dispatchEvent` 返回 **true**（未 `preventDefault` ⇒ 真实键入不被吞）、浮层不出现、`value` 逐字不变；INPUT（文档搜索框）：返回 **true**、浮层仍打开（既不 toggle 也不拦截）；`isEditableTarget` 早退在 `preventDefault()` 之前（逐字）；`SELECT` / `contenteditable` 分支在 `pix/src/renderer` 内无实例（`<select` 0 命中、`contenteditable` 仅谓词内 2 处，其中 `v-select` 实际落 `<input>` 亦被 INPUT 分支覆盖） |
| ③ | 模板动作点击后的草稿 / 不发送 / chips 与载荷 / 选区与浮层语义 | **草稿逐字、零发送、载荷零写、浮层既有语义不变**；**选区与 chips 不满足冻结字面**（见 B 节 N97-3 与 D 节 D-1）。关键读数：`draft = EXPLAIN_TEMPLATE`（翻译相位 `TRANSLATE_TEMPLATE`）；`send 0`、`.message-block 0→0`、notes 文件 4 行且 hash 不变；点击时刻选区 = 页 1 首 span（`collapsed false`）；点击后 `collapsed true`；chips 2→1（净差异 = `选中文本` 项，`notesLabel` / `removeTitle` 逐字不变）；`quickAskAfterExplain = {display:"none", btnCount:3}`（M1 口径）；`onTemplateClick` 三行形状逐字对位 |
| ④ | 焦点管理与关闭路径（Esc / 点击入口 / 点击外部） | **全部成立**。打开后焦点 = 浮层容器（`tabindex="-1"`）；Esc、`document.body` 上的 `pointerdown`、`.shortcut-close` 三条路径均 `gone + rows 0 + aria-expanded false`；入口分支：先 `focus()` 入口并自检（程序化 `click()` 不移动焦点，定稿 D2）→ 关闭后焦点 = 入口；body 分支：`blur()` 自检后 `?` 打开、Esc 关闭后焦点 = body；开关全程零写入、零侵扰（`scrollTop` 48→48、页 1 矩形逐字不变）；打开期间 `/`、`[` `]`、翻页、composer `Enter` 均未被劫持（相位内实测 + `PdfViewer.vue` 零 diff） |
| ⑤ | 4 按钮布局在窄栏与缩放下的几何双向判据 | **成立**。三相位：浮层 ⊆ `.reader-stage`（含 `STAGE_PADDING=4` 内缩）、`scrollOverflow 0`、4 按钮 `x` 递增、`y` 差 0（同一行）、两两不相交、`clientWidth > 0`、文案逐字；200% 下**右缘钳制生效**：`float.right = 1015 = stage.right(1019) - 4`（`clampGap = 0`）；收尾缩放回 100%、CSS 变量清除、`.layout-right` 回 380；浮层与 `.composer-box` / `.reader-section` / `.pdf-page-indicator` 零相交 |
| ⑥ | 既有 `.quick-ask` 两动作与反馈态零回归（含 R11/R15 隐藏规则） | **零回归**。`PdfSelectionQuickAsk.vue` 无 `-` 行（既有常量、`showFor` / clamp / `hide()` / `showFeedback` / `onSelectionChange` / `onStageScroll` / `watch(filePath)` / 模板既有两按钮与反馈块 / 全部 CSS 逐字未动）；`r11-quick-ask-scroll-scope` 五相位全绿（反馈 `is-ok`、滚动隐藏、spurious selectionchange 保态与到期回落、不同文本回落且选区完好）；两处既有回落断言的 `btnCount` 按登记改为 4；反馈期 `btnCount === 0` 两处零改动 |

### D. must-fix 清单

1. **D-1（上游文档同步 / 须负责人裁决）N97-3 判据 1 的两条冻结断言与冻结实现互斥，交付按等价形态落地。**
   实测（本步独立复现）：`r17-2/explain` 点击后 `document.getSelection()` 塌陷（`collapsed true`、`anchorInStage false`）、`chipSnapshot().count` 2→1（「选中文本」项掉落）；控制实验证明因果链为「聚焦 composer ⇒ 选区收拢」（写草稿不聚焦 ⇒ 选区完好；聚焦 ⇒ 塌陷）。根因 = 设计 / 需求档冻结的 `composerInput.value?.focus()`（`ChatPanel.onQuickAsk`），且该行为在 HEAD 的既有「问 AI」路径同源（`git show HEAD` 实读：`focus()` 行在 R17 前已存在；`R8-dev` D6 已登记为既有产品行为）⇒ **N97-3 判据 1 的「点击后选区不变 + chips 不变」在冻结实现下不可满足**，非本轮引入、亦无法在白名单内修复（修复需触碰 `PdfViewer` / `reader-store` 的选区链路）。
   交付处置（本步复核认可）：断言改为等价可判形态 —— ① 点击**时刻**选区与页 1 首 span 逐字相等且未塌陷；② 点击后「塌陷」被显式 pin 为既有语义；③ chips **净差异恰为「选中文本」一项**（其余字段逐字不变）；④ 三步增量控制实验；⑤ 零发送 / 零写盘照旧。**不删断言、不放宽为恒真**。
   须闭环项：需求档 N97-3 判据 1 与设计档 §1.7 / §5.4.3 / §8.2 #6 的相应字面由 PM / 负责人就地同步（采用上述等价口径并留痕），或裁决另立轮次修复「聚焦收拢选区」的既有产品行为；**在同步 / 裁决前，该两条不得按「已满足」对外引用**。代码面无需改动；本项不阻塞其余判据的验收。

### E. 次级项（不阻塞验收，建议登记 / 后续轮次）

1. **设计档 §1.4 参考实现注释与 §5.6 #5 走查自相冲突（交付方登记 D-B2）**：参考实现注释字面含 `stopPropagation`，而走查要求 `grep -c stopPropagation` = 0；交付改为「不阻断冒泡」（代码逐字不变）。建议设计档下一轮同步该注释字面。
2. **设计档 §2.2 #8 的 import 清单漏列 `templateForAction`（交付方登记 D-B3）**：§1.6 冻结函数体必须调用它；交付按冻结体导入 4 项。建议设计档补字，避免后续轮次按「3 项」口径误判越界。
3. **`r17-1b` 相位 `narrow` 补「重新打开浮层」一步（交付方登记 D-B4）**：`default` 相位收尾关闭浮层，不补该步则窄栏读数全为 `null`；本步实测该相位读数齐备（panel 320 宽、零相交）。建议设计档登记该步骤。
4. **`data` 追加字段与 `ACTIVE_PROBE` 表达式常量（交付方登记 D-B5）**：全部为追加、不覆盖既有字段；helper 名严格保持 5 个（无第 6 个）。登记即可。
5. **选区类相位复用既有 `ensureQuickAskExcerptReady` 作就绪护栏（交付方登记 D-B6）**：既有 helper 零改写，`ok === false` 即判红（不降级跳过）；本运行 11 条 record 的 `ready` 全为 true。属正向加固，登记即可。
6. **五张既有截图像素材质变化 + `.center-pill` 变宽 ≈ 22px**：`r11-3` 两张整窗 + `06c` / `07b` / `07c` 三张 `.quick-ask` 裁切（4 按钮变宽）；仓内无像素比对（`pixelmatch` 0 命中）⇒ 不判红；pill 的既有文本断言不受影响（本运行相关场景全绿）。已按设计档 §0.9 登记。
7. **`.shortcut-toggle` 与 `.map-toggle` 的 pill 内相对顺序**由挂载顺序决定（实测键盘图标在左、地图图标在右）；按上游 §0.0 第 2 条不写断言（开放问题 6）。
8. **浮层实测高度 503px（设计档推算 ≈ 448px）**：该值为设计档估算且 `max-height = 848` 未触顶；实测为准，登记即可。
9. **`r17-2-quick-ask-four-actions.png` 中「解释」按钮带焦点圈**：由定稿 D3 的步骤顺序（先 `focus()` 再截图）决定，交付方已登记。

### F. 结论

**accept。** 交付与冻结契约逐条对齐：键位总览（入口 / 浮层 / 18 行逐字 / 开关与焦点 / 四类关闭路径 / 零残留 / 不遮挡与窄栏）、4 动作模板预填（文案图标逐字 / 三分支替换规则 / 不发送 / 零写盘 / 几何三相位）、可发现性（title / aria 逐字、不依赖文档、无打扰）与新验证面（烟测 23 条 + 离屏 4 场景 11 条 record / 7 张截图）全部由**本步独立复验**的真实读数支撑：工程门 0 error、两套烟测 74/0 与 65/0、离屏退出码 0 + `failure === null` + 166/237/64 零缺失、11 条新 record 经 108 条独立复算零失败、白名单与零 diff 红线全过。唯一未满足的冻结字面（N97-3 判据 1 两条）经复核为**需求前提与冻结实现互斥**（既有 R8 D6 行为 + 冻结 `focus()` 行），交付以非平凡等价形态 + 控制实验落地并已登记 ⇒ 列为 D-1 上游文档同步项（不阻塞代码面验收，但须在轮次关闭前闭环）。

---

## 追加裁决（R17）

> 对象：本档「代码审查（R17）」must-fix **D-1**（N97-3 判据 1 的两条冻结断言 ——「点击后选区逐字不变 + chips 不变」——与冻结实现互斥）。
> 依据：本步实读（`ChatPanel.vue` / `PdfSelectionQuickAsk.vue` / `reader-store.ts` / `PdfViewer.vue` / `ui-shot.mjs`，只读）+ 交付方 / 前轮的**真实运行读数**（本档 D-1、`R17-dev.md` §B8 D-B1、`R8-dev.md` D6 与 B 面「未验证 1」）。本步**未跑**离屏与烟测，新增判据均为**待落地的契约**。
> 结论：**D-1 已被追加裁决取代**（不再作为「未闭环的上游同步项」挂在轮次上）—— 本轮改「修」（N97-4（追加））而不是「改写需求前提」。

### (a) 冻结实现下的现实行为 ⇒ 改写为等价形态

事实链（逐环实读 + 真实读数，非推测）：

1. `PdfSelectionQuickAsk.onTemplateClick`（`PdfSelectionQuickAsk.vue:155-159`）顺序为 `const text = cachedText;` → `hide();` → `if (text) emitQuickAsk(text, action);`（即 N97-3 判据 4 的冻结形状）。
2. `ChatPanel.onQuickAsk`（`ChatPanel.vue:309-319`）在 `ask` / 非 `ask` 两条路径末尾**都会**调 `composerInput.value?.focus()`（冻结行，R17 未改）。
3. 聚焦 composer 触发引擎把 document 选区收进输入框 ⇒ `document.getSelection().isCollapsed === true` ⇒ `PdfViewer.onSelectionChange`（`:792-805`，清空分支 `:795-803`）走 `readerStore.setSelectedText("")` ⇒「选中文本」chip（`ChatPanel.selectionChip` `:104-111`）与 `send()` 的实参（`:378`）同时失去来源。
4. 该行为**非本轮引入**：`R8-dev` D6 已登记为既有产品行为（真实键入路径下「选中文本」chip 与 `selectedText:` 断掉）；`R8-dev` B 面「未验证 1」已登记未修；`R17-dev` §B8 D-B1 有控制实验（写草稿不聚焦 ⇒ 选区完好；聚焦 ⇒ 塌陷）。
5. ⇒ **「点击后选区逐字不变（`collapsed === false`）」这条断言按字面不可满足**，且不可在本轮白名单内修（修它必须碰 `PdfViewer` / `reader-store`，已逐条零 diff）。

改写后的等价形态（本轮继续生效，与已交付的 `r17-2/explain` 读数逐字一致，**不删除、不放宽为恒真**）：

| 原冻结字面 | 现行等价形态（可判） |
| --- | --- |
| 点击后选区逐字不变 | 点击**时刻**选区与页 1 首 span 逐字相等且未塌陷；点击**后**将「塌陷」显式 pin 为既有语义（`collapsed true && anchorInStage false`），并以三步增量控制实验证明「点击本身零额外副作用、塌陷只由聚焦引起」 |
| （新增：chip 在真实路径上必须存活） | 点击后「选中文本」chip **仍逐字等于点击时的文本**（N97-4 冻结语义 B；r17-2 的 chips 断言从「净差异恰 1」改回「与点击前逐字相等」） |
| （新增：载荷必须带上那段话） | 发送后载荷含 `selectedText:` 行且下一行逐字等于点击时刻的选区文本（N97-4 判据 b） |

### (b) 通过 N97-4（追加）使「chips 不变」在真实键入路径下重新成立

- 裁决：**本轮修掉**（属缺陷修复，不是新功能）——建 **N97-4（追加 · 负责人裁决）选区快照**（需求档「追加冻结（R17 · 负责人裁决）」、设计档「追加设计（R17 · N97-4）」）。
- 确切改法（逐字见设计档 §2）：快照源 = `PdfSelectionQuickAsk` 点击时传给 `emitQuickAsk` 的 `cachedText`（已在消费端实参里，**不改 seam**）；落点 = `ChatPanel` 新增 `pendingSelection` + `effectiveSelectedText` 派生，`selectionChip` 与 `send()` 的 `selectedText` 实参共用该派生；失效 = C① 新非空选区（watch `selectedText`）/ C② `filePath` 变化（watch）/ C③ chip 移除（`excludeContext` 追加 1 行清空）；C④（发送不清空）/ C⑤（切会话不清空）为**负向约束**（源码里以「不写」+ 计数判据落地）。
- 生效后各判据的归属：
  - **N97-3 判据 1 的「chips 不变」重新成立**（不再是等价形态），并且该判据从「只在点击瞬间成立」升级为「在真实键入路径下成立」——这正是 R8 D6 / R17 D-B1 登记的缺陷面。
  - 「点击后选区逐字不变」**维持 (a) 的等价形态**（镜像链零 diff 是本轮硬约束）：N97-4 不改 `PdfViewer`，故 document 选区仍会被聚焦收拢；但 **chip 与载荷不再依赖它**，登记为「已知行为 + 可接受后果」。
- 验收面（设计档 §3）：新场景 `r17-3` / 组 `r17-selection-snapshot` / **5** 条 record / **25** 条断言 / 1 张新截图；`SEL` +2（⇒ 72）、helper +1（⇒ 6）；**更新既有断言恰 1 处**（`ui-shot.mjs:10904-10909` 的 chips 断言，其余零删除）。零回归口径 = 既有 166 张 / 237 条 / 64 种 label（R16 基线）+ R17 的 7 张 / 11 条 / 4 种 label 全部保留，`42*` / `43*` / `r17-*` 全绿。
- 编号消歧（登记）：既有 **N97-4（键盘可达与四动作几何）** 逐字不动（本档「验收逐条结论」表里「N97-4 键盘可达与几何」一行指的是它）；本追加的新需求标识为「N97-4（追加 · 负责人裁决）」，两处在档内以「（追加）」后缀消歧。

### (c) D-1 的最终标记

**D-1 已被追加裁决取代。**

| # | 原处置（本档 D-1） | 追加裁决 |
| --- | --- | --- |
| 1 | 要求 PM / 负责人就地同步 N97-3 判据 1 与设计档 §1.7 / §5.4.3 / §8.2 #6 的字面（等价口径） | 不再需要「改写前提」：N97-4 使冻结字面（chips 不变）在修复后重新成立；`r17-2/explain` 的唯一断言更新已由设计档 §3.4 冻结 |
| 2 | 或裁决另立轮次修「聚焦收拢选区」的既有产品行为 | 本轮**只修 chip / 载荷的丢失**（属本轮白名单内）；镜像链（`PdfViewer` / `reader-store`）仍零 diff，留待后续轮次（如要修，属新需求） |
| 3 | 在同步 / 裁决前，那两条不得按「已满足」对外引用 | 自本追加起解除：`chips 不变` 按 N97-4 验收（待 `r17-3` 落地后引用）；`点击后选区逐字不变` 仍**只能**按 (a) 的等价形态引用 |

**仍属待落地（登记，不阻塞本追加）**：① 设计档 §3 / §5 的新增判据与走查；② `R17-dev.md` §B8 D-B1 的「需上游裁决」标注应由开发档下一轮改为「已裁决（N97-4 追加）」，并向本档 §E 的登记口径对齐；③ 本档 §E 第 6 项（5 张既有截图像素材质变化）与 §8.2 #6 的目视口径不受本追加影响（chip 存活后，`r17-2c-template-translate-draft.png` 的实测观感会多回一个 chip —— 属预期变化，需 dev 档目视时重写结论）。

---

## 代码审查（R17 · N97-4）

> 审查对象：N97-4 增量交付（选区快照）—— `git diff` 中属于本追加的 2 个文件：`pix/src/renderer/components/workspace/ChatPanel.vue`（本追加 +25/−2；相对 HEAD 累计 +35/−3）、`pix/scripts/ui-shot.mjs`（本追加 +320/−0；累计 +1286/−3），外加 `docs/pm/R17-dev.md`「追加（N97-4 选区快照）」小节；对照 `docs/pm/R17-req.md`「追加冻结（R17 · 负责人裁决）」→ N97-4（追加 · 负责人裁决）的冻结语义 **A–D** 与判据 **a–d**、`docs/pm/R17-design.md`「追加设计（R17 · N97-4）」§1–§7。
> 冷启动独立复验（不复用交付方结论与产物）：离屏写入全新目录 `C:/Users/86157/AppData/Local/Temp/pix-v06-r17b-review`（交付方目录 `pix-v06-r17b-after` 本步只读）；253 条测量用**自写脚本独立复算 56 条判据**（期望值手写，未读交付脚本的断言代码）；另建一次性对抗性探针（`%TEMP%` 内 ui-shot 的独立副本 + **直接读 Pinia `reader` store**），在独立进程里跑通 ①–④ 四类对抗读数。
> 纪律：未运行任何 git 写命令；未跑 build / test / package / dev；三次离屏**串行**（无并发）；一次性脚本 / 探针副本 / `node_modules` 联接均在 `%TEMP%` 并在本步结束前删除；未改动仓库内白名单外文件。

### A. 实跑证据（全部为本次真实命令输出）

| # | 命令 / 方法 | 结果 |
| --- | --- | --- |
| 1 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` | `CHECK_EXIT=0`（0 error） |
| 2 | `node pix/scripts/smoke-view.mjs` / `node pix/scripts/smoke-notes.mjs` | `通过 74 / 失败 0`（退出码 0）/ `通过 65 / 失败 0`（退出码 0） |
| 3 | `PIX_SHOT_ROOT=<新目录> ./node_modules/.bin/electron scripts/ui-shot.mjs` | `UISHOT_EXIT=0`；末行「产出 174 张截图」；日志无 `场景失败` / `renderer gone` / `unhandledRejection` |
| 4 | `MANIFEST.json` / `MEASUREMENTS.json` 复读 | `failure === null`；`shots.length` **174**；目录内 png **174**（清单与磁盘双向零差集）；测量 **253** 条；`label` 去重 **69** |
| 5 | 零缺失比对（自写脚本） | R17 基线（173/248/68）与 R16 基线（166/237/64）**截图 / 记录 / label 三类零缺失**；前 248 条 `label#phase` 序列与 R17 基线**逐条一致（0 处差异）**；新增 5 条记录全部追加在尾部；新增截图恰 1 张 `r17-3-snapshot-survives-typing.png`；新增 label 恰 1 种 `r17-selection-snapshot` |
| 6 | 独立复算（自写脚本，`%TEMP%`，已删） | **checked=56、failed=0**（r17-3 五相位 25 条 + `r17-2/explain` chips 逐字相等 + `r17-2` 另两相位 + r11-3 回落读数 + 基线零缺失） |
| 7 | 对抗性探针（`%TEMP%` 内副本，直读 `#app.__vue_app__…$pinia.state.value.reader`） | 四步全部产出读数、`errors === []`（见 §C） |
| 8 | 走查计数（`grep` / `sed` 实跑） | `readerStore.selectedText` **2**（派生 1 + C① watch 取值器 1）/ `effectiveSelectedText` **3** / `pendingSelection.value = ""` **3** / 记录点 **1** / C③ 清空点 **1** / 载荷实参 **1** / `excludedContexts` **7** / `context-chip` **9** / `btnCount === 2` **0**、`=== 4` **3**（`:5528` / `:6997` / `:7069`）/ 旧 chips 断言 **0**、新断言 **1**（`:10930`）/ `SEL` **72** 项 / 6 个 helper 名各就位（无第 7 个）/ r17-3 断言数 **25**（9+6+3+4+3） |
| 9 | 目视（`read` 实看两张新阶段截图 + 1 张失败态截图） | `r17-3-snapshot-survives-typing.png`（358×71 @ `{x:1219,y:908}`）：草稿逐字 = 解释模板 + 键入内容；`r17-2b-template-explain-draft.png`（358×48 @ `{x:1219,y:931}`）：草稿逐字、无新消息块；**两张裁切均不含 chip 行**（见 §E-1） |
| 10 | 红线 diff 走查 | 见 §D |

### B. 冻结语义（A–D）与判据（a–d）逐条结论

| 条 | 判定 | 关键证据（本步独立读数） |
| --- | --- | --- |
| **A** 快照来源 | 满足 | `onQuickAsk` 首行 `if (text) pendingSelection.value = text;` 逐字 1 处且位于两条分支之前；探针直读：点「解释」后 **store.selectedText = `""`**（塌陷）而 chip 仍为 `选中文本：Sparse Attention for Lon…` ⇒ chip 确由快照支撑，非 store 兜底；`ask` 路径同结论（`chip-removed` 相位前置读数） |
| **B** 唯一来源 | 满足 | `effectiveSelectedText` 3 处（声明 / chip / 载荷实参）；`readerStore.selectedText` 仅 2 处（派生内部 + C① 取值器，非第二份来源）；载荷实参单行逐字；探针 + r17-3：chip 文本与载荷 `selectedText:` 下一行同为点击时刻选区文本 |
| **C①** 新选区失效 | 满足 | 探针：store `""` → `3. Ablation Study`，chip `选中文本：Sparse Attention for Lon…` → `选中文本：3. Ablation Study`（≠ 旧 label）；r17-3 `new-selection` 相位同结论 |
| **C②** 切文档清空 | 满足 | 探针：`openRow("long-book.pdf")` 后 `filePath` 变化、chip 消失、`sendDelta 0`；r17-3 `doc-switch` 相位同结论（前置 pin：切换前 chip 存在且选区已塌陷 ⇒ 只能由快照支撑） |
| **C③** 移除不复活 | 满足 | 探针：移除后 store `""`、chip 消失；**再发一次**（草稿非空）⇒ 载荷**不含** `selectedText:` 行（逐行实读）；随后 2.4 s / 16 次采样无复活；`resetExcludedContexts()` 确实已执行（stub 的 `prompt` 同步返回 ⇒ `send()` 的 finally 不延迟，轮询非真空） |
| **C④** 发送不清空 | 满足 | 探针：发送后 chip **仍在**（`labelsAfterSend1` 含该项，store 仍 `""`）；走查 `pendingSelection.value = ""` 计数 3（`send()` 内 0 处） |
| **C⑤** 切会话不清空 | 满足 | 走查：`props.currentSessionPath` 两处命中（`:153-155` 既有 watch、`:865` 会话比对）均不含 `pendingSelection` |
| **D** 不得改动 | 满足 | 零 diff（逐条见 §D）；`PdfSelectionQuickAsk.vue`（+15/−0）/ `useQuickAsk.ts`（+5/−3）/ `ReaderPanel.vue`（+2/−0）/ `smoke-view.mjs`（+225/−1）的 numstat 与 R17-dev §B1 逐字相同 ⇒ 本追加零触及；`ChatPanel.vue` 的 `-` 行恰 3 条且不含 `context-chip` / `notesLabel` / `buildReadingUserMessage` / `QUICK_ASK_TEMPLATE` / `excludeContext` 等既有面 |
| **(a)** 真实键入 | 满足 | 16 字符经 `sendInputEvent` 落值：`typed.log` 16/16 条 `isTrusted true` + `inputType insertText`；chip 文本逐字不变；`value = EXPLAIN_TEMPLATE + 键入内容`；`sendCalls` 增量 0、`.message-block` 0→0；非真空：`collapsed true && anchorInStage false` |
| **(b)** 载荷含 selectedText | 满足 | 载荷逐行实读：`<reading_context>` / `path:` / `page: 1` / `pageCount: 3` / `section: …` / `selectedText:` / `Sparse Attention for Long-Context Retrieval` / `</reading_context>` / 空行 / 草稿；`selectedText:` 下一行逐字 = 点击时刻选区文本 |
| **(c)** 失效路径 | 满足 | `new-selection` / `chip-removed` / `doc-switch` 三相位读数见上（并经本步探针直读复核） |
| **(d)** 零回归 | 满足 | 本步离屏退出码 0 + `failure === null`；166/237/64 与 173/248/68 两类基线零缺失；前 248 条记录序列逐条一致 |

### C. 对抗性验证（任务书 ①–⑤；全部为本次独立读数）

1. **① 真实键入路径下 chip 与载荷都不丢 —— 成立。** 探针（直读 store）：点击前 `selectedText = "Sparse Attention for Long-Context Retrieval"` → 点「解释」后 `""` 而 chip 仍在 → 键入 16 字符后 chip 逐字不变、store 仍 `""` → 发送后 chip 仍在、载荷 `selectedText:` 下一行逐字等于点击时刻选区文本。
2. **② 新选区出现后快照确实失效 —— 成立。** 第 2 页新选区：store 变为 `3. Ablation Study`（镜像链活）、chip = `选中文本：3. Ablation Study`（≠ 旧快照 label）。若快照未失效，派生优先取快照 ⇒ chip 会显示旧文本（判据可判别）。
3. **③ 移除 chip 后不复活（含载荷）—— 成立。** 移除后 store `""`、chip 消失；再发一次载荷**无** `selectedText:` 行；既有 `resetExcludedContexts()` 触发后 16 次采样无复活。
4. **④ 切换文档后 chip 消失 —— 成立。** 切换前 chip 由快照支撑（store `""`）、切换后无「选中文本」项、`sendDelta 0`。
5. **⑤ 无第二份来源 —— 成立（运行时 + 静态）。** 运行时：同一段文本同时出现在 chip label 与载荷 `selectedText:` 行，而 store 为空 ⇒ 两者共用同一派生；静态：`effectiveSelectedText` 3 处、`readerStore.selectedText` 仅派生内部 1 处内容读取。

### D. 红线走查

| 项 | 结果 |
| --- | --- |
| 白名单 | `git status --short` = 6 `M` + 7 `??`（与 R17 交付态一致）；本追加只改 `ChatPanel.vue` / `ui-shot.mjs` / `R17-dev.md`；`--untracked-files=all` 下无白名单外文件 |
| 零 diff（N97-4 口径，`git diff --stat` 实读） | `PdfViewer.vue` / `stores/**` / `reading-context.ts` / `InputArea.vue` / `WorkspacePage.vue` / `assets/styles/**` / `pix/package.json` / `package-lock.json` / `packages/**` / `smoke-notes.mjs` 全部为空；`useQuickAsk.ts` / `PdfSelectionQuickAsk.vue` / `ReaderPanel.vue` / `smoke-view.mjs` 的 numstat 与本轮 R17 交付记录逐字相同（零增量） |
| 既有 chips 类名 / 文案 | `ChatPanel.vue` 的 `-` 行恰 3 条（`const selected = …` / `function onQuickAsk(): void {` / `selectedText: … readerStore.selectedText,`）且不含 chips / 模板 / 载荷装配标识；`context-chip` 计数 9、`excludedContexts` 计数 7（与设计档 N8 期望一致） |
| 临时产物 | 仓库内零临时文件（`git status --untracked-files=all` 全量核对）；一次性脚本 / 探针副本 / `node_modules` 联接均在 `%TEMP%` 且已删除 |
| 既有断言 | `btnCount === 2` → 0、`=== 4` → 3；`r17-2/explain` chips 断言由「净差异恰 1」→「与点击前逐字相等」（旧字面 0 命中、新字面 1 命中）；`ui-shot.mjs` 的 `-` 行仅三处 `btnCount`，其余既有场景 / 断言 / 截图名零改写 |

### E. mustFix 清单

1. **（证据面 / 须闭环）`r17-3-snapshot-survives-typing.png` 的裁切矩形不含 chip 行 —— 设计档对该截图的内容承诺落空。**
   证据：截图实测 358×71 @ `{x:1219, y:908}`（= `.composer-box` 自身矩形）；`.context-row` 是 `.composer-box` 的**前一个兄弟**（模板 `ChatPanel.vue:1134` / `:1155`，样式 `:1656-1661` 的 `margin-bottom: 6px`）⇒ 裁切自 composer 盒顶起算，chip 行恒在其上方、不在框内；本步目视两张裁切图（`r17-3…` / `r17-2b…`）均只见输入框与草稿，无 chip。
   后果：本追加的**核心可视证据**（「键入后 chip 仍在」）在任何交付产物里都看不到；`R17-review.md`「追加裁决 (c)③」中「`r17-2c-template-translate-draft.png` 的实测观感会多回一个 chip」的预期同因落空；设计档 §3.3 相位 5 的括号字面（「`rectOfSelector(SEL.composerBox, 0)`：chip 行 + 草稿同框可见」）与实现互斥（与 M1 同类：字面与目的互斥）。
   处置（择一，均约 1 行 + 重出该图或改字）：① 裁切改 `rectOfSelector(".composer", 0)`（含 chip 行）；② 就地更正设计档 §3.3 的括号字面为「仅草稿裁切（chip 行不在框内）」。**功能判据不受影响**（chip 存活性由 `chipsAfterTyping` 逐字断言 + 本步探针直读 store 独立证明）。
2. **（夹具稳健性 / 偶发判红）`r17-3` 的 `selectPageSpan` 调用缺少有界重取护栏，本步真实复现 1 次超时判红。**
   证据：本步第 2 次离屏（`ui-shot.mjs` 独立副本：仅改 `PIX_DIR` 并在函数末尾追加探针代码，失败点之前的代码与仓库逐字一致）在 `ui-shot.mjs:11359`（`new-selection` 相位 `await selectPageSpan(2)`）超时 20 s 判红 —— 日志原文 `场景失败：等待超时：摘录浮层（document.querySelector(".quick-ask") && document.querySelector(".quick-ask").offsetParent !== null）`，栈 `selectPageSpan (…:1779) ← runReaderStateScenarios (…:11359)`；失败态截图显示第 2 页选区高亮仍在、chip 行可见（`当前文档：sample-paper.pdf · 第 2 页` + `选中文本：3. Ablation Study`）、浮层不在屏 ⇒ 即「迟到的阅读区滚动按既有语义隐藏浮层」这一已知形态恰好落在 `selectPageSpan` 内部；该 helper 自身**抛错**，后继的 `ensureQuickAskExcerptReady` 复核来不及生效。同一脚本另两次运行（主验收跑 + 探针跑）在同点位通过。
   处置：在 r17-3 的选区步前调用**既有** `waitStageScrollQuiet()`（或在相位内做「重建选区 + 有界重试」包装），使已知隐藏语义不再偶发触发判红；判据不放宽、断言不删。
3. **（文档同步）`R17-dev.md` 两处与被修复行为相反的字面未更新。**
   证据：① `:563` 的 **D-B1** 仍写「**需上游裁决**」且处置列仍以「chips 净差异恰为「选中文本」一项」为落地口径 —— 而本轮交付已把该断言改为「与点击前逐字相等」（`ui-shot.mjs:10930`），「追加裁决 (c)②」亦已要求改标为「已裁决（N97-4 追加）」；② `:537` 的 `r17-2c-template-translate-draft.png` 目视登记写「因 §B8 D-B1 的既有行为，点击后「选中文本」chip **必掉**」—— 该成因在 N97-4 后已不成立（chip 不再掉落，且实测两张裁切根本不含 chip 行，见 §E-1）。
   处置：仅改文档 —— D-B1 按裁决改标并同步处置列；`:537` 的登记改为「本张裁切不含 chip 行（§E-1），chip 存活性以数据面 + r17-3 的逐字断言为准」。

**次级项（登记，不阻塞）**：① `data` 的追加字段（`typed.log` / `selectionAfterTyping` / `revivalPoll` 类读数）全部为追加、未覆盖既有字段；② C⑤ 仍只由走查判定（设计档 §7 已登记，本轮无新面）；③ 本步探针把「store 是否为空」从「选区塌陷 + 镜像链零 diff」的**推断**升级为**直读**证据（若后续加 dev hook，可把该口径固化为常规判据）。

### F. 结论

**revise。** 功能面（冻结语义 A–D、判据 a–d）经本步**独立复验全部成立**：真实键入路径下 chip 与载荷不丢（探针直读 store 证明 chip 确由快照支撑、非 store 兜底）、新选区即时覆盖旧快照、移除后不复活且载荷不含 `selectedText:`、切文档清空、chip 与载荷共用同一派生；工程门 0 error、两套烟测 74/0 与 65/0、离屏退出码 0 + `failure === null` + 174/253/69 达成 + 166/237/64 与 173/248/68 两类基线零缺失、25 条新断言经自写脚本独立复算零失败；白名单 / 零 diff / 零残留全过。
三条 mustFix 均为**非功能性**（证据面 1 条、夹具稳健性 1 条、文档同步 1 条），修法各约 1 行 + 一次重跑（文档项免重跑）；清空后即可转 accept。未发现快照语义的实现缺陷，亦未发现对既有冻结面的越界改动。

---

### N97-4 收口销账（R17）

> 对象：本档「代码审查（R17 · N97-4）」mustFix ①②③ 的收口修复（`pix/scripts/ui-shot.mjs` 的裁切实改 1 行、选区步护栏 4 处、`data.scrollGuard` 追加字段；`R17-dev.md` §B8 D-B1 与 §B6 #6 改字；`R17-design.md` §3.3 裁切选择器改字 + §8 三条登记）。
> 方式：冷启动独立复验，**不复用交付方结论与产物**。离屏写入全新目录 `C:/Users/86157/AppData/Local/Temp/pix-v06-r17c-review`（交付方两跑目录 `pix-v06-r17c-b` / `pix-v06-r17c-a` 只作对照读数）；本步离屏为**单进程串行**（无并发）。结论只来自本步实读的文件内容与实跑输出。

#### A. 实跑证据（全部为本次命令原样输出）

| # | 命令 / 方法 | 结果 |
| --- | --- | --- |
| 1 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` | `CHECK_EXIT=0`（`vue-tsc --noEmit` + 两个 `tsc --noEmit`，0 error） |
| 2 | `node pix/scripts/smoke-notes.mjs` | `通过 65 / 失败 0`、退出码 0（10 组） |
| 3 | `node pix/scripts/smoke-view.mjs` | `通过 74 / 失败 0`、退出码 0 |
| 4 | `cd pix && PIX_SHOT_ROOT=<新目录> ./node_modules/.bin/electron scripts/ui-shot.mjs` | `UISHOT_EXIT=0`；末行「产出 174 张截图」；`grep -c "场景失败\|renderer gone\|unhandledRejection\|断言失败\|等待超时"` = **0** |
| 5 | `MANIFEST.json` / `MEASUREMENTS.json` 复读 | `failure === null`；`shots.length` **174**；目录内 png **174**；测量 **253** 条；label 去重 **69**；清单与磁盘双向差集 `[]`；`99-failure-state.png` 不存在 |
| 6 | 零缺失比对（自写脚本，%TEMP%） | R16 基线（166/237/64）缺失 **0/0/0**；R17 基线（173/248/68）缺失 **0/0/0**；R17b 基线（174/253/69）缺失 **0/0/0**；三者的前 N 条 `label#phase` 序列逐条一致 = `true`；相对 R16 新增截图 8 张 / 新 label 5 种（与 R17 交付登记一致） |
| 7 | `r17-3` 五相位断言独立复算（自写脚本，期望值手写自设计档 §3.3 冻结表） | 5 条 record 齐备；断言条目 **9+6+3+4+3 = 25**（与冻结配额逐条对位，无一条为恒真式）；独立复算 **checked=28 / failed=0** |
| 8 | 全量读数差分（修复前 `pix-v06-r17b-review` vs 本步，253 条逐字段） | **无字段丢失**；`r17-selection-snapshot` 的唯一新增字段 = `scrollGuard`，其余字段逐字相同；全库残余差异 18 条全部为运行派生量（`updatedAt` / `createdAt` / `lastAt` / 报告「生成时间」/ 笔记 id 时间戳 / 1 处布局读数，见 C-2） |
| 9 | 目视（`read` 工具实看） | `r17-3-snapshot-survives-typing.png`（**378×152 @ {x:1209,y:837}**）内可见两条 chip（`当前文档：sample-paper.pdf · 第 1 页` / `选中文本：Sparse Attention for Lon…`）+ 草稿逐字 `请解释选中的这段话在论文中的含义与作用：（追问）它在第二节的作用是什么？`；对照 `r17-2c-template-translate-draft.png` 仍为 358×48 @ {x:1219,y:931}（不含 chip 行，与 §B6 #6 的登记一致） |
| 10 | 走查（`grep` / `node` 实跑） | `await waitStageScrollQuiet()` 调用 **5** 处（既有 1 + 本收口 4）；`installStageScrollWatch` → `waitStageScrollQuiet` 整块与 HEAD **逐字相同 = true**（护栏为既有 helper，零改写）；`SEL` **72** 项；`chipsAfter17f.count === chipsBefore17f.count - 1` **0** 命中 / `JSON.stringify(chipsAfter17f) === JSON.stringify(chipsBefore17f)` **1** 命中（`:10930`） |
| 11 | `git status --short --untracked-files=all` / `git diff --numstat` | 与 R17 交付态一致（6 `M` + 7 `??`）；`ui-shot.mjs` **+1300 / −3**（`-` 行恰 3 条 = 三处 `btnCount`）、`ChatPanel.vue` `+35 / −3`、`PdfSelectionQuickAsk.vue` `+15 / −0`、`useQuickAsk.ts` `+5 / −3`、`ReaderPanel.vue` `+2 / −0`、`smoke-view.mjs` `+225 / −1` ⇒ 本收口对 `pix/src/**` 与 `smoke-view.mjs` **零增量**；仓库内无临时文件 |

#### B. mustFix ①②③ 逐条销账

| # | 原判 | 本步核验 | 判定 |
| --- | --- | --- | --- |
| ① | `r17-3-snapshot-survives-typing.png` 裁切不含 chip 行（设计档 §3.3 步骤 5 括号字面与目的互斥） | 裁切选择器已改为 `.composer`（`ui-shot.mjs:11277`）；DOM 实读：`.composer`（`ChatPanel.vue:1122`）是 `.context-row`（chip 行，`:1134`）与 `.composer-box`（`:1155`）的共同父容器，且 `.composer` 无 `overflow` 裁剪 ⇒ 父盒矩形含全部子元素；本步实跑裁切 **378×152 @ {1209,837}**（较原 `.composer-box` 的 358×48 @ {1219,931} 向上多出 94px、高度 +104px）；**目视两条 chip 与草稿同框**（证据 #9） | 销账 |
| ② | `r17-3` 选区步缺有界滚动静默护栏（迟到滚动 → 浮层隐藏 → `selectPageSpan` 内部 `waitFor` 超时判红） | 4 个含选区的相位在 `selectPageSpan(page)` **之前**各调用一次既有 `waitStageScrollQuiet()`：`:11234`（snapshot-survives-typing）/ `:11367`（new-selection）/ `:11395`（chip-removed）/ `:11474`（doc-switch 的重取循环内），每处均紧邻其后的 `selectPageSpan`；护栏整块与 HEAD 逐字相同（未改写 helper）；**断言未放宽**：`r17-3` 断言条目 25 条（9/6/3/4/3）与冻结表逐条对位、零删除零新增，`data` 仅追加 `scrollGuard`（不参与断言），全库 253 条读数无字段丢失；`scrollGuard.ok === false` 只会**多等**、不会被当作通过路径（后续 `ensureQuickAskExcerptReady(...).ok` 仍须为 `true` 才不判红） | 销账 |
| ③ | `R17-dev.md` 两处与被修复行为相反的字面未更新 | §B8 **D-B1**（`:563`）已改标「已裁决（N97-4 追加）」并按落地口径改写：① chips 不变重新成立（与 `ui-shot.mjs:10930` 的 `JSON.stringify(chipsAfter17f) === JSON.stringify(chipsBefore17f)` 一致）；② 「点击后选区逐字不变」维持等价形态（与 `:10921-10927` 的「点击时逐字相等 + 点击后 pin 塌陷 + 三步控制实验」一致）；③ 载荷口径（与 `r17-3/send-payload` 断言一致）。§B6 **#6**（`:537`）已改写为「本张裁切不含 chip 行，chip 存活性以数据面 + `r17-3` 逐字断言为准」，与 `:10977` 仍取 `.composer-box` 的实现一致。设计档侧：§3.3 步骤 5 括弧已改为 `rectOfSelector(".composer", 0)`（`R17-design.md:1078`），「追加设计」§8（`:1214-1222`）三条登记（裁切选择器 / 四相位护栏 / `r17-2c` 目视口径）与实现逐条对位，且未改任何判据与配额（`SEL` 72 / helper 6 / 25 条断言 / 5 record / 1 截图） | 销账 |

#### C. 残余风险（登记，不阻塞销账）

1. **护栏的「吸收迟到滚动」路径未被本步复现**：本步四相位 `scrollGuard.absorbed` 全为 `0`（`waitedMs` 400~431），即本步未遇到迟到滚动；交付方两跑为 `1 / 0`、`1 / 1`、`0 / 0`、`0 / 0`（`R17-dev.md` §7.1）。`scrollGuard.ok` 属**读数不属判据**（`ok:false` 不判红，仅表示有界窗口内仍有新滚动）。⇒ 该 mustFix 的**成因**（环境性迟到滚动）本质未消除，护栏只降低其触发概率；若后续再以同点位判红，仍需按夹具稳健性处理（本步未复现，登记备查）。
2. **`page-tracking#bottom-clamp-50.before.scrollHeight` 布局读数抖动**：本步 **2438**，其他 7 次运行（R16 复核 / R17 交付 / R17b 两跑 / R17c 交付两跑 / R17 复核）均为 **2670**；该字段仅参与「50% 下必须可滚动」的防空断言（`scrollHeight - clientHeight > 1`，本步 2438−950 = 1488 ⇒ 通过），非本轮改动面（`page-tracking` 与 `r17-3` 无交互）⇒ 登记为环境性布局抖动，不影响本收口结论。
3. **`R17-dev.md:647` 仍保留首次交付时的裁切字面**（`在盘（rectOfSelector(SEL.composerBox, 0) 裁切）`，同段的 JSON 摘录亦无 `scrollGuard`）：该行位于「首次交付原样结果」表内，§7.1 ① 已给出改字说明但未回填该行。属历史读数表的时点差异（非当前实现描述），登记备查；本档不代改。
4. **`r17-2b` / `r17-2c` 两张裁切仍不含 chip 行**：mustFix ① 只点名 `r17-3`（§7.6 #2），已由 §B6 #6 登记「chip 存活性以数据面 + `r17-3` 逐字断言为准」；本步实跑 `r17-2c` 裁切 358×48（tall 48 ⇒ 不含 chip 行）成立，登记项与实现一致。
5. **「点击后选区逐字不变」仍为等价形态**：镜像链（`PdfViewer` / `reader-store`）零 diff 未变，故该断言仍只能按本档「追加裁决（R17）」`(a)` 的等价口径引用；N97-4 不覆盖该缺陷面（属后续轮次的新需求）。

#### D. 结论

**closed（销账）。** mustFix ①②③ 三条均有本步独立证据支撑：裁切实测含 chip 行并经目视确认（378×152 @ {1209,837}）、四相位护栏均落在选区步之前且使用零改写的既有 helper、断言与读数面零放宽（25 条断言对位、253 条读数无字段丢失、唯一新增为 `scrollGuard` 读数）、两份文档的改字与实现逐条一致。工程门与回归面全绿：`CHECK_EXIT=0`、两套烟测 74/0 与 65/0、离屏 `UISHOT_EXIT=0` + `failure === null` + 174/253/69 达成 + 三类基线（166/237/64、173/248/68、174/253/69）**零缺失** + `r17-3` 25 条断言独立复算零失败；白名单 / 零 diff / 零残留全过。残余风险 5 项均为登记性（护栏成因未复现、1 处环境性布局读数、1 处历史读数表未回填、两张既有裁切范围、1 条等价形态口径），不构成新的 mustFix。
