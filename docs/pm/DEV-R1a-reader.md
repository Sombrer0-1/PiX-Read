# R1a 开发文档：阅读器硬能力（页码跳转 / 键盘翻页 / 文内搜索）

> 仓库：E:\develop\PiX-Read（Electron + Vue3 + Vuetify3 + Pinia，pnpm/npm workspaces，只动 `pix/` 渲染层）
> 你只负责本档需求。完成后 PM 验收。有任何需求疑问，按本档最接近的实现方式自行决策并在交付说明中记录。

## 必读约束（违反直接打回）

1. 只改/建下列文件，不碰其它（尤其不改 `packages/*`、`pdf-tools.ts`、`session-bridge.ts`、`ChatPanel.vue`、`session-store.ts`——另一个并行任务在改它们）：
   - `pix/src/renderer/components/workspace/PdfViewer.vue`（修改）
   - `pix/src/renderer/components/workspace/PdfSearchPanel.vue`（新建）
   - `pix/src/renderer/stores/reader-store.ts`（只允许追加字段/方法，不改已有行为）
2. `cd pix && npm run check` 必须通过（vue-tsc + tsc main + tsc preload）。这是硬验收。
3. 禁止 `any`、禁止 `await import()` 动态导入、顶层 import、不改 `shared/types.ts`。
4. UI 文案全部中文，注释只写代码看不出的约束。
5. Vuetify 组件用法先查 `vuetify_guide/`（仓库根），不要猜 API。
6. 不运行 `npm run build` / `npm test` / `npm run dev` / 任何 git 命令。
7. 保持现有代码风格：`<script setup lang="ts">` + 文件头注释块 + scoped style + CSS 变量（`--pix-*`）。

## 现状速览

- `PdfViewer.vue`：pdf.js 连续滚动阅读。页面元素 `div.pdf-page[data-page=N]`，内含 `canvas` + `.textLayer` + overlay。滚动由 `IntersectionObserver` 触发按页渲染；`readerStore` 持有 `page/pageCount/scale/gotoPage`；`gotoPage` 被 watch，置 null 后 `scrollToPage(target)`。底部已有静态指示器「第 N 页」（`.pdf-page-indicator`），右上已有缩放工具栏（`.pdf-toolbar`）。
- `reader-store.ts`：`setPage/clampPage/gotoPage/openDocument` 等。
- Electron 33（Chromium 130），支持 CSS Custom Highlight API（`CSS.highlights` + `Highlight`）。
- pdf.js 版本 4.10.38，锁死。`TextLayer` 已在组件中使用。

## 需求

### N1 页码跳转 + 前后翻页按钮

替换静态 `.pdf-page-indicator` 为交互式页脚（保持悬浮胶囊样式，居中底部）：

- 布局：`[上一页 icon]` `第 N / M 页` `[下一页 icon]`。
- 「第 N / M 页」区域点击进入编辑态：变成 `<input>`（数字，宽约 64px），回车或失焦提交；非法值（非数字/越界/空）回滚显示态。编辑态不影响滚动位置，提交后跳页。
- 上一页/下一页：`gotoPage(page ± 1)`，边界禁用（第 1 页时上一页禁用等）。
- 跳页必须复用现有 `readerStore.gotoPage` 机制或组件内 `gotoPage()`，不要另写滚动逻辑。

### N2 键盘翻页

- 组件挂载且 `pageCount > 0` 时在 `window` 上注册 `keydown`；卸载时移除。
- 忽略条件（全部满足才处理）：事件目标不是 `input/textarea/select/contenteditable`；无 ctrl/alt/meta 修饰键。
- 按键映射：`PageUp`→上一页、`PageDown`→下一页、`ArrowLeft`→上一页、`ArrowRight`→下一页、`Home`→第 1 页、`End`→最后一页。命中后 `preventDefault()`（避免原生滚动叠加造成跳两屏）。
- 打开搜索面板（N3）且焦点在搜索输入框内时，`ArrowUp/Down` 归搜索面板用，不触发翻页。

### N3 文内搜索（核心，认真做）

新建 `PdfSearchPanel.vue`，由 PdfViewer 在 `.pdf-viewer` 内右上角（缩放工具栏下方）挂载。功能：

- 输入关键词（防抖 300ms），对全文档搜索：每页调用 `page.getTextContent()`（pdf.js），把 items 的 `str` 拼接后做大小写不敏感匹配，统计每页命中数。`getTextContent` 结果按页缓存（文档不换则复用；scale 变化不影响文本层内容）。大文档注意：逐页计算放在 `requestIdleCallback`/分帧里跑，避免一次 500 页卡死 UI；搜索进行中显示进度（已扫 N/M 页）。
- 结果 UI：`第 x / y 处 · 第 N 页`、上一处/下一处按钮、关闭按钮、无结果态（「未找到 “xx”」）。
- 导航行为：跳到目标页（复用 gotoPage），等该页渲染完成（页面 canvas/textLayer 已在 DOM），再在该页 textLayer DOM 上定位当前匹配并高亮 + 平滑滚动到匹配的纵向位置。
- 高亮实现（按优先级）：
  1. **CSS Custom Highlight API**：在该页 `.textLayer` 的文本节点上计算匹配的 Range，注册 `CSS.highlights`（两套：全部匹配浅色 `--pix-accent` 12% 透明度、当前匹配实色）。样式用 `::highlight(pix-search)` / `::highlight(pix-search-current)` 定义在全局（main.css 不许改的话写在 PdfViewer 的 non-scoped style 块里）。切页/关面板/换词时清理注册。
  2. 若你验证 Range 跨 textLayer span 不稳，允许降级：只高亮当前页匹配（同 API），全文档只提供页级计数 + 跳页。两种情况都要在交付说明里写明采用了哪种。
- 注意 textLayer DOM 文本与 getTextContent 文本可能有空格差异：页内定位以 DOM 拼接文本为准重新匹配（只在当前页做，代价可接受）。
- 状态清理：文档切换（`props.filePath` 变化）、面板关闭、卸载时，取消进行中的分帧扫描、清空 highlights、重置计数。
- 面板打开/关闭由 PdfViewer 持有（`searchOpen` ref），输入框自动聚焦。

### N4 搜索入口

- 缩放工具栏旁新增搜索按钮（`mdi-magnify`，title「在文档中搜索」），点击打开面板。
- 快捷键：`Ctrl+F` 与 `/` 打开（`/` 需满足 N2 的忽略条件才触发）；`Ctrl+F` 在 window 级监听并 `preventDefault`。
- `Esc`：焦点在面板内或面板打开时，关闭面板（N2 翻页键不与之冲突）。

## 验收清单（PM 将逐条核对）

1. `cd pix && npm run check` 0 error。
2. 打开 PDF：页脚有 上一页/下一页/页码编辑，跳页、边界禁用、非法输入回滚。
3. PageUp/PageDown/←/→/Home/End 翻页正确；在聊天输入框打字时按方向键不触发翻页（通过忽略条件保证）。
4. Ctrl+F 打开面板，输入关键词出现计数；上一处/下一处在页间循环；当前匹配高亮可见且滚动定位到可视区。
5. 换文档后搜索状态清零；面板关闭后高亮消失。
6. 未改动本档之外的文件（`git status` 核对——你只看不跑 git 写命令）。

## 交付物

- 修改/新建的文件。
- 一段交付说明：采用的高亮方案（Custom Highlight 或降级）、getTextContent 缓存策略、遗留风险。
