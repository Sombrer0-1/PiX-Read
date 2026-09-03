# PiX-Read 未完成工作

> **状态说明（2026-09-04 清扫后）**：本文是清扫之前的计划记录，其中「`pix-file://` 协议」一节已失效——该协议注册的虽是 privileged standard scheme，但生成的 `pix-file:///C%3A/...` 是空主机 URL，Chromium 的 `fetch()` 无法解析，因此整体删除，PDF 字节改由 `library-read-file` IPC 通道获取。知识地图、红笔圈画、阅读向 agent 工具均已落地。存储位置的唯一来源见 `pix/src/main/pix-paths.ts`，功能现状见 `README.md`；下文仅作历史路线图参考。

本文档从已取消的计划会话整理而来，供后续会话直接执行。品牌仍是 **PiX-Read**。不改 `packages/*`。

主路径目标：资料库打开 PDF → 连续阅读 / 知识地图跳页 / 红笔圈画 → 带当前页与笔迹问 Read。

## 已完成（不要重做）

1. **三栏壳层**（`workspace-shell`）
   - 去掉 PiX logo 顶栏；左/中/右胶团标签分别为「资料库 / 工作区名」、当前文档名、当前会话名。
   - 右栏约 380px（`--pix-right-width`）；左栏可折叠。
   - `LibraryPanel` 递归懒加载文件树，头部「根目录」，会话列表已移到 `ChatPanel` 下拉。
   - 空态：「新对话」+「输入消息即可新建或继续对话。」组合器 placeholder：「向 PiX-Read 提问」。

2. **内嵌 PDF 连续阅读**（`pdf-viewer`）
   - 锁定 `pdfjs-dist@4.10.38`。
   - `pix-file://` 仅服务当前资料库根（越界 403）；协议实现内联在 `pix/src/main/index.ts` 与 `ipc-handlers.ts`，没有单独的 `pix-file-protocol.ts`。
   - `reader-store` 字段：`filePath` / `page` / `pageCount` / `selectedText` / `outline` / `mapOpen` / `annotationMode` / `gotoPage` / `scale`。
   - `PdfViewer`：竖向连续滚动、底部「第 N 页」、缩放、文字层可选中；`overlay` 插槽；`expose gotoPage`。
   - `ReaderPanel`：`.pdf` 走内嵌阅读；Markdown/文本预览保留；`mapOpen` 时左侧知识地图槽。

后续子代理应读写 `reader-store` 字段，尽量不改 store 文件本身。

## 进行中 / 需核对

### 知识地图（`knowledge-map`）

代码已有雏形，计划步骤未验收：

- 已有 `pix/src/renderer/components/workspace/KnowledgeMap.vue`
- `ReaderPanel` 用 Teleport 把 `#` 按钮挂到 `.center-pill`，`mapOpen` 时左侧挂 `<KnowledgeMap />`
- 数据来自 `readerStore.outline`（PdfViewer 加载时 `getOutline()`）
- 点击有页码的节点写 `readerStore.gotoPage`
- 无书签空态已有

相对图 2 仍缺或需核对：

- 头部应显示「{书名} 知识地图」和节点数（当前只写「知识地图」）
- 页码徽章尽量做成页码范围（如 `378-385`），而不是单页
- 彩色分支树视觉贴近图 2（章节父节点、彩色连线），当前更接近缩进列表
- 不引入 d3 / markmap；不用 LLM 生成节点
- **不要改** `PdfViewer.vue`、`reader-store.ts`、主进程 IPC

文件：

| 路径 | 操作 |
| --- | --- |
| `pix/src/renderer/components/workspace/KnowledgeMap.vue` | 已有，继续改 |
| `pix/src/renderer/components/workspace/ReaderPanel.vue` | 已接入，仅允许视觉修补 |

验收：`cd pix && npm run check`。带书签 PDF 能展开地图、点节点跳页、关闭后恢复全宽阅读；无 outline 有空态。

## 未开始

下面三步按依赖顺序做。`knowledge-map` 与 `ink-annotations` 可并行；`reading-agent` 依赖圈画截图 API；`chat-transcript` 依赖阅读 agent 的工具名。

### 1. 红笔圈画与持久化（`ink-annotations`）

对齐图 3 红圈。

- `PdfViewer` 左下角铅笔 FAB 切换 `readerStore.annotationMode`（不要改 `reader-store.ts` 文件，只读写现有字段）。
- 新建 `PdfAnnotator.vue`，挂到 `PdfViewer` 的 `overlay` 插槽。
- 单色红笔自由曲线，按页存点列。
- 笔迹写入工作区 `.pix-read/annotations/` 下按文档相对路径索引的 JSON。
- 主进程 IPC 读写，路径必须落在资料库根内。
- 撤销上一笔 / 清空本页。
- `PdfViewer` 暴露 `captureCurrentPage(cropToInk?: boolean)`，供下一步截图。
- 一期不做多色、橡皮擦、压感。
- **不要改** `ReaderPanel.vue`、`reader-store.ts`、`WorkspacePage.vue`。

文件：

| 路径 | 操作 |
| --- | --- |
| `pix/src/renderer/components/workspace/PdfAnnotator.vue` | 新建 |
| `pix/src/renderer/components/workspace/PdfViewer.vue` | 修改（FAB、overlay、captureCurrentPage） |
| `pix/src/main/annotation-store.ts` | 新建 |
| `pix/src/main/ipc-handlers.ts` | 修改 |
| `pix/src/main/preload.ts` | 修改 |
| `pix/src/shared/types.ts` | 修改 |

验收：`cd pix && npm run check`。红笔圈画后滚动/缩放仍贴页；重开文档笔迹还在；撤销与清空生效。

### 2. 阅读向 agent 与 PDF 工具（`reading-agent`）

不改 `packages/*`。

- `SessionBridge` 通过 `extensionFactories` 注册 `pdf_read_pages`（按页提取文本）和 `pdf_outline`。
- `createAgentSession` 默认只留 `read` / `ls` / `grep` / `find` + 这两个 PDF 工具；`exclude` `bash` / `edit` / `write`。
- `appendSystemPromptOverride` 把角色改成阅读助手：优先读当前文档当前页及邻页，区分正文与笔迹，用用户语言解释。
- 新建 `pix/resources/skills/read-and-analyze-materials/SKILL.md`，写按页核对流程。
- 发 prompt 时注入路径 / 页码 / 选中文本；有笔迹则调 `PdfViewer.captureCurrentPage` 作图片附件。
- `ChatPanel` **只加发送前上下文注入**，不改消息气泡样式（交给下一步）。

文件：

| 路径 | 操作 |
| --- | --- |
| `pix/src/main/session-bridge.ts` | 修改 |
| `pix/src/main/pdf-tools.ts` | 新建 |
| `pix/src/main/reading-prompt.ts` | 新建 |
| `pix/resources/skills/read-and-analyze-materials/SKILL.md` | 新建 |
| `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改（仅发送链路） |
| `pix/src/renderer/composables/useRpc.ts` | 修改 |
| `pix/src/shared/types.ts` | 修改 |

验收：`cd pix && npm run check`。圈画后问「讲讲红圈这段」会带当前页上下文和截图；agent 调 `pdf_read_pages` 而不是把 PDF 当纯文本 `read`；不出现 `bash` / `edit` / `write`。

### 3. 对齐图 3 的对话呈现（`chat-transcript`）

只改对话 UI，不改发送 / 上下文注入逻辑。

- 用户消息右侧灰色气泡。
- agent 回复 Markdown（复用 `renderMarkdown`）。
- 运行中显示「已处理 Ns」可折叠。
- 工具行改成友好中文摘要（已读取文件、已查看 N 页 PDF），映射 `pdf_read_pages` / `read` 等已知工具。
- 保留模型 / 思考深度切换，不挪主视觉标签栏。

文件：

| 路径 | 操作 |
| --- | --- |
| `pix/src/renderer/components/workspace/ChatPanel.vue` | 修改 |
| `pix/src/renderer/components/session/MessageBlock.vue` | 修改 |
| `pix/src/renderer/components/session/ToolExecutionBlock.vue` | 修改 |
| `pix/src/renderer/stores/session-store.ts` | 修改 |

验收：`cd pix && npm run check`。气泡、Markdown、耗时与中文工具行可见。

### 4. 收口验证（`integrate-verify`）

父代理或最后一次会话执行。只修补接口裂缝，不扩大功能。

核对：

- `ReaderPanel` 左侧是否挂上 `KnowledgeMap`
- `PdfViewer` overlay 是否挂上 `PdfAnnotator`
- 发送链路是否仍注入阅读上下文
- `cd pix && npm run check` 通过

## 产品取舍（不要偷偷做）

- 不做浏览器式多标签
- 不用 LLM 生成 200+ 节点地图
- 不做多色笔 / 橡皮 / 压感
- 不做像素级力导向导图
- 不改 `packages/*` 内核

## 依赖安装

本地安装用 `npm install --ignore-scripts`。不要跑 `npm run build` / `npm test`，除非明确要求。不要提交，除非明确要求。
