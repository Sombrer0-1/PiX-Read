# R1b 开发文档：上下文透明与错误兜底（上下文 chips / 无密钥引导 / 错误兜底块）

> 仓库：E:\develop\PiX-Read（Electron + Vue3 + Vuetify3 + Pinia）。只动 `pix/` 渲染层与共享类型。
> 你只负责本档需求。完成后 PM 验收。有疑问按本档最接近的方式自行决策并记录。

## 必读约束（违反直接打回）

1. 只改/建下列文件（另一个并行任务在改 `PdfViewer.vue`/`reader-store.ts`/`PdfSearchPanel.vue`，绝对不要碰）：
   - `pix/src/renderer/components/workspace/ChatPanel.vue`（修改）
   - `pix/src/renderer/stores/session-store.ts`（修改）
   - `pix/src/renderer/components/input/ModelSelector.vue`（修改）
   - `pix/src/shared/types.ts`（修改：只追加 DisplayBlock 变体）
   - `pix/src/renderer/components/session/GuideBlock.vue`（新建）
2. `cd pix && npm run check` 必须通过（vue-tsc + tsc main + tsc preload）。硬验收。
3. 禁止 `any`、禁止动态 import、顶层 import。
4. UI 文案中文；注释只写约束。Vuetify 先查仓库根 `vuetify_guide/`。
5. 不运行 `npm run build` / `npm test` / `npm run dev` / 任何 git 写命令。
6. 风格对齐现状：`<script setup lang="ts">`、文件头注释、scoped style、`--pix-*` CSS 变量。

## 现状速览

- `ChatPanel.vue`：右栏对话面板。`send()` 里：乐观插入用户气泡 → 若 `getPdfCaptureApi().hasInkOnCurrentPage()` 则自动截图 → `buildReadingUserMessage(text, { filePath, page, pageCount, selectedText })` 注入 `<reading_context>` → `rpc.sendPrompt(message, filePaths, images, text)`（isStreaming 时走 sendSteer）。composer 上方目前只有附件 chips（`.attachment-row`）。
- `utils/reading-context.ts`：`buildReadingUserMessage(userText, ctx)` 生成注入文本；`ctx.selectedText` 为空就不带选中文本；`ctx.filePath` 为空返回原文。
- `session-store.ts`：DisplayBlock 状态机。`auto_retry_end success=false` 时只写 `errorMessage.value`（UI 从不渲染它），已 push 的 retry 块只显示「第 N 次自动重试仍未成功」。`appendError(message, source)` 可加 error 块。
- `DisplayBlock` 联合类型在 `pix/src/shared/types.ts`（约 262 行起）。
- `ModelSelector.vue`：模型下拉面板。provider 分组头部有「已配置/需登录」徽标（`authStore.getProviderStatus(provider).configured`）。点击模型直接 `rpc.setModel`，未配置 provider 的模型也能选中，直到请求时才报错。
- `useRpc.setApiKey/removeAuth`、路由：`/settings?section=models`。Workspace → Settings 往返不会丢会话（SessionBridge 在主进程常驻，WorkspacePage 重新挂载会同步）。
- `window.pixApi` 类型见 `pix/src/main/preload.ts`（PixApi）。

## 需求

### N5 composer 上下文 chips（核心）

目标：发送前让用户看见「这次 AI 会看到什么」，并允许逐项去掉。

- 位置：composer 输入框上方，附件行同层（新起一行或合并入 `.attachment-row` 之前），仅在「将注入的上下文非空」时显示。
- 三类 chip（各带图标 + 文案 + `×` 关闭钮，chip 点击不产生其它行为）：
  1. 文档 chip：`mdi-file-pdf-outline` +「当前文档：{文件名} · 第 N 页」（无 pageCount 时省略页码）。有 filePath 且是 PDF/md/文本均显示。
  2. 选中文本 chip：`mdi-text-selection` +「选中文本：{前 24 字}…」。`readerStore.selectedText` 非空时显示。
  3. 圈画截图 chip：`mdi-pencil-circle-outline` +「红笔圈画截图」。仅当 `getPdfCaptureApi()?.hasInkOnCurrentPage()` 为真时显示（进面板与发送前都要刷新判断——用发送时的实时判断 + `readerStore.page/annotationMode/ink` 变化时重算即可，实现方式自定，但不得在渲染函数里做副作用）。
- 关闭行为：点 `×` 仅对「本次发送」隐藏该项（本地 ref 集合记录被排除项），不修改 readerStore 状态。发送完成后重置（下一条消息重新显示全部可用项）。切会话/清空面板时也重置。
- 发送逻辑改动：
  - 文档 chip 被排除 → 本次不调用 `buildReadingUserMessage`（发原文）。
  - 选中文本 chip 被排除 → 调用 `buildReadingUserMessage` 时传 `selectedText: ""`（其余不变）。
  - 圈画截图 chip 被排除 → 不执行 `captureCurrentPage`。
  - steer/follow_up 同样生效。
- chip 出现/消失不引入闪烁：避免在 template 内直接调用 `hasInkOnCurrentPage()`，用计算属性 + 在相关依赖（page、annotationMode、filePath、blocks 长度等）变化时惰性刷新，或 watch 同步。方案自定，交付说明里写清楚。

### N6 无密钥引导

- 在 ChatPanel 中新增对发送错误的分类：错误消息匹配认证类（`/401|403|api[\s_-]?key|unauthorized|authentication|permission denied|invalid api key|密钥|未配置|no auth/i`，大小写不敏感）时，视为「需要配置密钥」。
- 命中时：除了现有 `failOptimisticUserMessage` 的错误块外，再插入一个 guide 块（见 N7 的类型追加），文案：
  「看起来还没有配置可用的 API 密钥。打开「设置 → 模型与密钥」，为你的提供商填入密钥后即可开始提问。」
  按钮：「打开设置」（`mdi-cog-outline`），点击 `router.push("/settings?section=models")`。
- guide 块在聊天流中只保留最近 1 条（再次触发时移除旧的再插入，避免刷屏）。
- ModelSelector：点击「需登录」provider 下的模型时，不再直接 setModel：
  - 在面板顶部显示一条内联提示（warning 色）：「{provider} 还没有配置 API 密钥，部分模型无法使用。」+「去设置」按钮。提示常驻直到用户关闭或面板关闭；点击「去设置」时 emit close 并跳转设置页（同上）。
  - 已配置 provider 的行为完全不变。
- 路由跳转用 `useRouter`（ChatPanel/ModelSelector 均可直接用）。

### N7 错误兜底块

- `pix/src/shared/types.ts`：`DisplayBlock` 追加变体
  `{ id: string; type: "guide"; kind: "auth"; message: string; timestamp: number }`
  （只追加，不改其它变体）。
- `session-store.ts`：
  - 新增 `appendGuide(kind: "auth", message: string)`：先移除已有 `kind` 相同的 guide 块再 push。
  - `auto_retry_end` 且 `success === false` 且 `finalError` 存在时：在现有 retry 块之外，追加 `appendError(event.finalError, "api")`，保证失败原因可见（仍保留 errorMessage.value 逻辑）。
  - 导出 `appendGuide`。
- ChatPanel 渲染：`block.type === "guide"` → 渲染 `GuideBlock.vue`，点击「打开设置」向上 emit 或直接路由跳转（自定，保持事件链清晰）。
- `GuideBlock.vue`（新建）：提示卡片样式（`--pix-warning`/tonal 底），含文案 + 主按钮「打开设置」。props: `message`；emit: `open-settings`。

## 验收清单（PM 逐条核对）

1. `cd pix && npm run check` 0 error。
2. 打开 PDF 且有选中文本时，composer 上方出现文档/选中/圈画三类 chip；逐个 `×` 后发送：注入的 message 不含对应上下文（可在代码层验证 buildReadingUserMessage 入参），截图不附。
3. 发送后 chips 重置；steer 路径同样生效。
4. 未配置密钥的 provider：ModelSelector 点击其模型出现提示与「去设置」；已配置 provider 不受影响。
5. 发送返回认证错误时聊天流出现 guide 卡片（含可用按钮），重复触发不堆积。
6. 模拟 auto_retry 最终失败路径：聊天流可见 finalError 错误块（可用 session-store 单元层面代码走查确认，无需真发请求）。
7. 未改动本档之外文件。

## 交付物

- 修改/新建文件列表。
- 交付说明：chip 显隐的响应式方案、guide 块事件链、发送注入逻辑的分支矩阵。
