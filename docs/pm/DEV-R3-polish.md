# R3 开发文档：用量显示与首页引导（最后一轮功能迭代）

> 仓库：E:\develop\PiX-Read（Electron + Vue3 + Vuetify3 + Pinia）。只动 `pix/` 渲染层。
> 有疑问按最接近方式决策并记录。

## 必读约束

1. 只改这两个文件：
   - `pix/src/renderer/components/workspace/ChatPanel.vue`（修改）
   - `pix/src/renderer/pages/HomePage.vue`（修改）
   - `pix/src/renderer/components/workspace/PdfViewer.vue`（修改：仅键盘翻页越界忽略一处）
2. `cd pix && npm run check` 必须 0 error。
3. 禁止 `any`、禁止动态 import()、顶层 import、UI 文案中文、注释只写约束。
4. Vuetify 先查仓库根 `vuetify_guide/`。
5. 不运行 `npm run build` / `npm test` / `npm run dev` / 任何 git 写命令。

## 需求

### N12 会话用量轻量显示

ChatPanel composer 区域新增一行轻量 meta（`.composer-meta`，位于 composer-box 之下、padding 内）：

- 左侧：`输入 {in} · 输出 {out}`（tokens，来自 `rpc.sessionStats.value?.tokens`）；会话有累计费用且 > 0 时追加 ` · ${cost.toFixed(4)}`（美元，前缀 $）。
- 右侧：`上下文 {percent}%`（`rpc.sessionStats.value?.contextUsage?.percent`，null/undefined 时省略右侧）。
- 数值格式：tokens 用 k 缩写（≥1000 → `{n/1000 保留 1 位}k`，四舍五入）。
- 隐藏条件：`rpc.sessionStats` 为 null，或 input+output+cacheRead+cacheWrite 全为 0（新会话未发消息时不显示该行，保持 composer 干净）。
- 数据刷新已由 useRpc 在 agent 生命周期事件中处理（agent_start/agent_end/message_end/tool_execution_end），不要新增轮询；本行是纯 computed。
- 样式：12px、`--pix-text-muted`、上下 4px 间距，与 composer 边框区协调；不许使用表格/卡片重样式。

### N14 首页空态引导

HomePage.vue 的 `.home-empty` 空态（无最近项目）改为更具体的引导（两行）：

- 第一行（主文案）：「从一个本地文件夹开始：把论文、讲义、笔记放进同一个文件夹，PiX-Read 会把它作为资料库。」
- 第二行（辅助）：「所有内容只保存在本机，提问时自动附带当前文档与页码。」
- 保持现有排版类（`.empty-text` 可拆两个 `<p>`），风格不变。

### N15 键盘翻页越界忽略

PdfViewer.vue `onWindowKeydown`：`PageUp/ArrowLeft` 在 `readerStore.page <= 1` 时直接 return（不 preventDefault 不滚动）；`PageDown/ArrowRight` 在 `readerStore.page >= readerStore.pageCount` 时同理。`Home/End` 行为不变。

## 验收清单

1. `cd pix && npm run check` 0 error。
2. 有 token 累计的会话：composer 下方出现用量行且数字格式正确；新会话空态不显示；费用为 0 不显示费用段。
3. 首页空态两行文案正确。
4. PDF 第 1 页按 ←/PageUp 无滚动跳动；最后一页按 →/PageDown 同理。
5. 未改动白名单之外文件。

## 交付物

修改文件列表 + 交付说明（用量行隐藏判定、格式化函数）。
