# PiX-Read V0.2 产品需求文档（PM: 主 agent）

> 本目录为 PM 工作文档，不属于提交范围（git 不提交 docs/）。
> 需求范围约束：只做「本地论文阅读 + AI 辅助」主线，不做下载/云同步/多标签/LLM 生成导图/多色笔。

## 产品目标

**把 PiX-Read 从「能跑的骨架」打磨成论文阅读者的日用工具。**
核心用户旅程：打开资料库 → 打开论文 → 连续阅读 → 圈画/选中 → 提问（自动带上下文）→ 得到可信回答 → 点击页码引用跳回原文 → 继续阅读。

当前可用性评估（基线 ≈20%）：三栏壳、PDF 连续阅读、红笔、会话、模型切换均已可用；但阅读器缺跳页/搜索/键盘，上下文注入对用户不可见，首次使用无密钥引导，回答不可复制、页码引用不可跳转。

## V0.2 主题：可信的阅读伴侣

三个可信度支柱：
1. **看得见**：AI 看到了什么上下文，用户必须可见、可移除。
2. **进得去**：论文内容高效到达（跳页、搜索、键盘、选中即问）。
3. **回得来**：AI 回答可复制，页码引用可点击跳回原文，错误必须有兜底提示。

## 迭代计划

| 迭代 | 内容 | 需求编号 | 状态 |
| --- | --- | --- | --- |
| R1a | 阅读器硬能力：页码跳转、前后翻页、键盘翻页、文内搜索 | N1 N2 N3 N4 | 已交付+真机验收 |
| R1b | 上下文透明与兜底：composer 上下文 chips、无密钥引导、错误兜底块 | N5 N6 N7 | 已交付+真机验收(chips) |
| R2a | 对话增强：选中即问、消息与代码块复制 | N8 N9 | 已交付+代码验收 |
| R2b | 页码引用跳转、会话重命名 | N10 N11 | 已交付+代码验收 |
| R3 | 打磨：token/费用轻量显示、空态文案、视觉走查修复 | N12 N13 | 已交付+真机验收(文案) |

## 集成阶段修复（PM 亲自处理）

1. **dev 工作流回归**：`npm run dev` 启动的 Electron 一直加载 `dist/renderer` 旧构建（`NODE_ENV`/`VITE_DEV_SERVER_URL` 从未注入，vite 热更新从未真正到达应用窗口）。新增 `pix/scripts/dev-electron.mjs` 注入环境变量并修改 dev 脚本。
2. **devtools 抢焦点**：dev 启动时 detached devtools 每次弹出打扰使用，改为 `PIX_OPEN_DEVTOOLS=1` 时才开启。
3. **搜索跨页高亮丢失（真机发现）**：平滑滚动翻页经过中间页会触发 PdfSearchPanel 的 page watcher 无条件清理高亮，导致跨页跳转后到达页无高亮。修复：page watcher 在新页恰为当前匹配页时改为重绘（不重新滚动），否则清理。已真机复验通过。

## V0.2.1（用户反馈迭代）：红笔圈画 → 框选截图（N16）

**用户原话**：把笔取缔，换成另一种方式进行标注或者截图。

**PM 决策**：红笔自由绘制的真实需求是「把我的注意力指向交给 AI + 附一张图」。鼠标手绘既慢又不准，而矩形框选天然精准。故：

- **删除**红笔圈画全链路：PdfAnnotator 组件、笔迹持久化（annotation-store + IPC + preload 通道 + InkStroke 等类型）、发送前"有笔迹自动截整页"的隐式逻辑。
- **新增框选截图**：阅读器左下 FAB（剪刀/裁剪图标）进入截图模式 → 页面加浅色遮罩 + 十字光标 + 顶部提示条 → 拖拽矩形 → 松手即把该区域渲染为 PNG（上限 2000px 长边）→ 作为截图附件进入 composer（与粘贴截图同链路、同上限 8 张）→ 随下一条消息发出。Esc 取消模式或本次拖拽。
- 语义对 agent 不变：附图是「用户圈定的页面区域」，是上下文证据而非 OCR 事实来源——reading-prompt / SKILL.md 的措辞从 ink 改为 page region。
- 不做：截图持久化、多页跨选、箭头/文字批注编辑器（后续按需）。

**R4 状态**：已交付（子 agent），`npm run check` 0 error，ink/annotation 全局零残留，README/SKILL/提示词措辞同步更新。真机框选拖拽验证待机器空闲时补做（需要真实指针操作）。

## 需求明细

### N1 页码跳转
底部「第 N 页」指示器升级为可交互：点击变成输入框，输入页码回车跳转；指示器两侧加「上一页/下一页」按钮。跳页复用 `readerStore.gotoPage`（PdfViewer 已 watch）。

### N2 键盘翻页
阅读器聚焦时（或全局，当焦点不在输入框时）：PgUp/PgDn、Left/Right 翻页，Home/End 首末页。不与 Ctrl+滚轮缩放冲突。

### N3 文内搜索（Ctrl+F）
PdfViewer 内实现搜索面板：输入关键词 → 当前文档全部匹配计数 + 上一处/下一处 + 高亮当前匹配。pdf.js 走 `page.getTextContent()` 自实现定位（不引 findController，避免依赖 viewer 组件）。Esc 关闭。只在 PDF 打开时可用。

### N4 搜索入口
阅读器工具栏加搜索按钮；Ctrl+F 唤起；`/` 键也可唤起。

### N5 composer 上下文 chips
发送前，composer 上方显示本次将注入的上下文 chips：当前文档（含页码）、选中文本（截断展示）、圈画截图（若当前页有笔迹）。文档 chip 可关闭（关闭后本次发送不注入阅读上下文），截图 chip 可关闭（不附带截图）。这是「AI 看到了什么」的透明化。

### N6 无密钥引导
- 发送消息收到认证类错误（401/403/api key/permission 等）时，聊天流插入引导块：说明需要在设置中配置 API 密钥，附「打开设置」按钮（跳 /settings?section=models）。
- ModelSelector 中「需登录」的提供商行不再只是标记，点击未配置 provider 的模型时提示并给出设置入口。

### N7 错误兜底块
`session-store.errorMessage` 当前从不渲染。要求：auto_retry 最终失败（`auto_retry_end success=false`）、以及 agent_end 后存在未展示错误时，聊天流插入 error block（ErrorBlock 复用）。保证「任何失败在聊天里都有可见反馈」。

### N8 选中即问
PDF 文字层选中文本松开鼠标后，在选区附近浮出「问 AI」小按钮；点击把选中文本以引用形式填入 composer（引用块样式 + 可删除），焦点移入输入框。不影响现有 selection 注入逻辑。

### N9 复制能力
- agent 消息气泡 hover 出现「复制」按钮，复制原始 markdown。
- agent 消息内代码块右上角复制按钮，复制代码文本。
- 使用 navigator.clipboard，成功后按钮短暂变「已复制」。

### N10 页码引用跳转
- 系统提示词（reading-prompt.ts）约定：提及具体页码时写成 `[[p37]]` 格式。
- 渲染 agent 消息时把 `[[pN]]` 渲染成可点击页码徽标，点击调用 `readerStore.gotoPage = N`（仅当前文档是 PDF 时）。
- pdf-tools 返回文本中已带 `--- page N ---`，提示词补充说明引用格式即可。

### N11 会话重命名
ChatPanel 会话下拉菜单：当前会话项加「重命名」动作，弹出输入框，调用 `rpc.setSessionName`。重命名后立即刷新 pill 标题与列表。

### N12 Token/费用轻量显示
composer 底部一行小字：本会话 tokens（in/out）与累计费用（sessionStats 已有）。每 30s 或 agent_end 刷新即可，不新增轮询。

### N13 空态与可发现性
- 知识地图按钮 `#` 换成 `mdi-map-outline` 图标 + tooltip「知识地图（书签目录）」。
- ChatPanel 空态补充一句「提问会自动附带当前文档与页码」。

## 明确不做

- 论文下载、元数据抓取、云同步
- 多标签/多文档对比
- LLM 生成知识地图、力导向图
- 多色笔/橡皮/压感
- 修改 packages/*（pi 内核）
- 暗色主题（V0.3 再议）

## 工程约束（对子 agent 生效）

1. 不改 `packages/*`；不改 `pix/src/main/preload.ts` 之外的 IPC 协议除非需求明确要求；优先只动渲染层。
2. `cd pix && npm run check` 必须通过（vue-tsc + 两份 tsc）。
3. 禁止 `any`；禁止内联动态 import；顶层导入。
4. UI 文案中文；注释只写约束不写流水账；代码风格向同文件看齐。
5. Vuetify 组件用法先查仓库内 `vuetify_guide/`。
6. 不运行 `npm run build` / `npm test` / `npm run dev`（dev 已由 PM 启动，vite 会热更）。
7. 不执行任何 git 写操作。
