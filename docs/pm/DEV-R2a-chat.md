# R2a 开发文档：对话增强与页码跳转渲染（选中即问 / 复制 / [[pN]] 徽标 / 会话重命名 / 可发现性）

> 仓库：E:\develop\PiX-Read（Electron + Vue3 + Vuetify3 + Pinia）。只动 `pix/` 渲染层。
> 你只负责本档需求。完成后 PM 验收。有疑问按本档最接近的方式决策并记录。

## 必读约束（违反直接打回）

1. 只改/建下列文件（另一并行任务在改 `pix/src/main/reading-prompt.ts`、`pix/resources/skills/**`、`KnowledgeMap.vue`，绝对不要碰）：
   - `pix/src/renderer/components/workspace/ChatPanel.vue`（修改）
   - `pix/src/renderer/utils/markdown.ts`（修改）
   - `pix/src/renderer/components/workspace/ReaderPanel.vue`（修改：仅两处——挂载选中即问组件、知识地图按钮图标化）
   - `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`（新建）
   - `pix/src/renderer/composables/useQuickAsk.ts`（新建）
2. `cd pix && npm run check` 必须 0 error（vue-tsc + tsc main + tsc preload）。
3. 禁止 `any`、禁止动态 import()、顶层 import。
4. UI 文案中文；注释只写约束。Vuetify 先查仓库根 `vuetify_guide/`。
5. 不运行 `npm run build` / `npm test` / `npm run dev` / 任何 git 写命令。
6. 风格对齐现状：`<script setup lang="ts">`、文件头注释、scoped style、`--pix-*` 变量。

## 现状速览

- `ChatPanel.vue`：agent 消息渲染在 `.chat-messages` 内的 `.agent-message > .agent-markdown`（v-html，`renderAgentMarkdown` 带节流缓存）。composer 已有上下文 chips 行（`.context-row`）。会话下拉 `v-menu` 内有「新对话」「历史对话」列表。`rpc.setSessionName(name)` 已存在于 `useRpc`（内部 sendCommand + refreshState）。
- `markdown.ts`：`renderMarkdown(text, options)` 用 marked v12，自定义 renderer：`renderer.html` 全部转义（所以不能走内联 HTML 注入按钮/徽标！），`renderer.link` 走 `sanitizeHref`（允许 `#` 开头），`renderer.code(code, infostring, escaped)` 默认输出 `<pre><code>`。
- `ReaderPanel.vue`：Teleport 把 `#` 文本按钮（`.map-toggle`）挂到 `.center-pill`；`<PdfViewer>` 在 `.reader-pdf`。
- `PdfViewer.vue`（R1 刚改过，勿大动）：文字层 `.textLayer` 可选中；`onSelectionChange` 写 `readerStore.selectedText`。
- `usePdfCapture.ts`：现有组件间 seam 范式（module-level register/get），新 seam 照这个模式写。

## 需求

### N8 选中即问

PDF 阅读区选中文本后，在选区附近浮出「问 AI」按钮。

- 新建 `composables/useQuickAsk.ts`：module-level seam，模式参考 `usePdfCapture.ts`——`registerQuickAskConsumer(handler: ((text: string) => void) | null): void` 与 `emitQuickAsk(text: string): void`。
- 新建 `PdfSelectionQuickAsk.vue`：
  - 挂载点：ReaderPanel 根元素内（`position: absolute`，ReaderPanel 根已有 `position: relative`）。
  - 监听 `document` 的 `selectionchange`：选区非空、`selection.toString().trim().length >= 2`、且锚点节点位于 `.reader-stage` 内（用 `readerStage` 或 `.pdf-scroll` 判定）时，取 `selection.getRangeAt(0).getBoundingClientRect()` 计算按钮位置（选区末端右上，钳制在 stage 视口内），显示按钮「问 AI」。
  - 隐藏时机：选区折叠、`readerStore.filePath` 变化、stage 滚动（`.pdf-scroll` 的 scroll 事件，捕获式监听即可）、组件卸载。
  - **关键**：按钮必须 `@pointerdown.prevent`（否则 mousedown 会使文本选区塌陷、`readerStore.selectedText` 被清空）。`@click` 时把「显示时刻缓存的选择文本」经 `emitQuickAsk` 发出并隐藏按钮。
- ChatPanel：`onMounted` 注册 consumer，`onUnmounted` 注销。收到 text 后：
  - `draft` 为空时设为 `请解释选中的这段话：`；非空则保持不动（不覆盖用户正在输入的内容）。
  - 焦点移入输入框（`composerInput.value?.focus()`）。
  - 选中文本本身已经由 R1b 的「选中文本」上下文 chip 自动注入发送链路，**不要**把原文拼进 draft（避免重复注入）。chip 已存在，无需新 UI。

### N9 复制能力

- **消息级复制**：`.agent-message` hover 时右上角浮现「复制」按钮（opacity 0→1，`mdi-content-copy`，title 复制回答）。点击复制该 block 的原始 markdown（`block.content`）。成功后按钮图标/文字短暂变「已复制」（1.2s 后还原）。
- **代码块复制**：
  - `markdown.ts` 的 `renderer.code` 改为输出：
    `<div class="code-block"><div class="code-block-bar"><span class="code-lang">{lang}</span><button type="button" class="code-copy-btn">复制</button></div><pre><code ...>...</code></pre></div>`
    （lang 为空时省略 span；按钮文案固定「复制」；code 内容的转义沿用 marked 传入已处理的方式，不要二次转义）。
  - ChatPanel 在 `.chat-messages` 容器上做**事件委托**（单个 click listener，onMounted 挂 / onUnmounted 卸）：点击 `.code-copy-btn` → `closest('.code-block')` → 取其中 `pre` 的 `textContent` 复制 → 按钮文案短暂变「已复制」。注意 v-html 重渲染会让按钮 DOM 重建，用时间戳状态 + 文案回退定时器即可，不必精确到每个按钮实例。
  - 复制实现：优先 `navigator.clipboard.writeText`，catch 回退 `document.execCommand("copy")`（隐藏 textarea 方案）。写一个小工具函数（可放 ChatPanel 内或 `utils/`）。
- ChatPanel 中 `.agent-markdown :deep(pre)` 等样式在包裹 `.code-block` 后仍应正常（pre 的底色圆角迁移到 `.code-block` 或保留在 pre 上，视觉自查：bar 一行浅色、代码区原样）。

### N10 页码引用跳转（渲染侧）

约定：agent 在回答中用 `[[p37]]` 标注页码（提示词约定由另一任务在主进程加，你只管渲染）。

- `markdown.ts`：`renderMarkdown` 在进入 marked 前预处理：`/\[\[p(\d{1,4})\]\]/g` → `[p.$1](#pix-page-jump-$1)`。现有 `renderer.link` 对 `#` 开头 href 直接放行，无需改动 link 渲染。
- ChatPanel：委托点击 `a[href^="#pix-page-jump-"]` → preventDefault → 解析页码 → 若 `readerStore.pageCount > 0`（当前文档是 PDF）则 `readerStore.gotoPage = N`；否则忽略。
- 样式：`.agent-markdown` 下用属性选择器 `a[href^="#pix-page-jump-"]` 做页码徽标（圆角胶囊、accent 色、hover 加深），与普通链接区分。

### N11 会话重命名

- ChatPanel 会话下拉菜单顶部（「新对话」项之下）加「重命名当前对话」项（`mdi-pencil-outline`），仅当 `rpc.sessionState.value?.sessionFile` 存在时可用；`isStreaming` 时禁用。
- 点击打开小对话框（`v-dialog`，max-width 360）：`v-text-field` 默认值为当前标题（`paneTitle`），label「对话名称」，取消/保存。保存调 `rpc.setSessionName(name.trim())`（空值不提交），成功后关闭对话框。标题 pill 会随 `sessionState.sessionName` 自动更新（现有 computed 已处理），历史列表在下次 syncWorkspaceState 刷新即可，无需额外处理。

### N13 可发现性（渲染侧两条）

- `ReaderPanel.vue`：`.map-toggle` 的 `#` 文案改为 `<v-icon size="14">mdi-map-outline</v-icon>`，title 改「知识地图（书签目录）」。其余（active/disabled 逻辑）不动。
- `ChatPanel.vue` 空态：`.empty-subtitle` 文案改为「输入消息即可新建或继续对话；提问会自动附带当前文档与页码。」

## 验收清单（PM 逐条核对）

1. `cd pix && npm run check` 0 error。
2. 选中文本出现「问 AI」浮钮；点击后选区不丢（chip 仍在）、composer 获得模板文案并聚焦；在输入框内已有文字时不覆盖。
3. agent 消息 hover 出复制按钮；代码块有 bar + 复制按钮；复制后短暂「已复制」；代码块视觉不破。
4. `[[p12]]` 渲染为徽标；点击跳到第 12 页；非 PDF 文档下点击无副作用。
5. 重命名对话框可开/存/取消，保存后 pill 标题更新。
6. 知识地图按钮变为地图图标；空态文案更新。
7. 未改动本档之外文件；`markdown.ts` 的 HTML 转义行为未被削弱（不允许用内联 HTML 绕过 renderer.html 转义）。

## 交付物

修改/新建文件列表 + 交付说明（浮钮定位与防塌陷实现、委托事件清理、重命名数据流）。
