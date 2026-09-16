# PiX-Read

PiX-Read 是基于 [pi](https://github.com/earendil-works/pi) agent 内核的**智能阅读工作区**。三栏布局:左侧资料库、中间阅读区、右侧 agent 对话。用户在阅读文档的同时,通过对话让 agent 解答问题、分析内容、操作文件。

> 本仓库是项目的 GUI 地基:保留了 pi 的 agent-loop 内核(已与 TUI 解耦),Electron 应用壳已具备完整的会话能力,阅读相关特性(PDF 渲染、框选截图、知识地图等)在此地基上迭代。

## 技术栈

- **前端**: Vue 3 + Vuetify 3 + Pinia + Vue Router
- **桌面框架**: Electron
- **构建工具**: Vite + TypeScript
- **Agent 内核**: 复用 pi-agent-core / pi-coding-agent / pi-ai(多模型 LLM),进程内直连(`SessionBridge`),无子进程

## 功能特性

- 三栏工作区:资料库文件树(懒加载展开)、阅读区、agent 对话面板
- 内嵌 PDF 连续阅读:竖向滚动、缩放、文字层可选中、书签知识地图跳页、框选页面区域截图并随提问附图
- 阅读现场:每篇文档的阅读位置与缩放随工作区持久化(`.pix-read/reader-state.json`)、阅读区空态「继续阅读」入口、资料库树阅读进度徽标
- 阅读笔记:选中文字一键摘录(重复内容自动识别)、agent 回答一键存为笔记(`kind=answer`,带发送时刻的文档页码锚点)、左栏「笔记」面板按文档分组、点击跳回原页、行内备注、「仅看当前文档」/章节/搜索三维过滤、排序切换、删除 5 秒内可撤销、单条复制为 Markdown、一键导出 Markdown 到工作区 `.pix-read/notes.md`
- 笔记复用:面板多选后经 composer 可移除 chip 显式注入 `<reading_context>`(10 条 / 8000 字符上限),单条「追问」随上下文入 composer
- 知识地图联动:章节节点显示该章笔记数与页码范围、头部显示阅读进度、已读章节弱化、点击笔记数徽标把笔记面板限定到该章节
- 阅读向 agent 工具:`pdf_read_pages`(按页取正文)、`pdf_outline`(书签与页码),发送时注入文档路径/当前页/选中文本
- agent 会话能力:流式输出、工具执行展示、steering/follow-up
- 会话管理:新建、切换、重命名与删除,按 workspace 目录隔离存储
- 模型与思考深度切换、API key 管理、MCP 服务器配置(经 pi-mcp-adapter)
- 截图/附件发送;纯文本模型经 takeHerEyes 视觉预处理通道
- agent 主动提问(request_user_input)以澄清卡片形式插入对话

## 项目结构

```
pix/                           # Electron 应用(产品名 PiX-Read)
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── index.ts           # 应用入口(窗口/生命周期/剪贴板菜单)
│   │   ├── preload.ts         # contextBridge 暴露 PixApi(IPC 单一来源)
│   │   ├── session-bridge.ts  # AgentSession 桥接(prompt/steer/模型/认证/MCP/takeHerEyes 视觉预处理)
│   │   ├── ipc-handlers.ts    # IPC 处理(会话/设置/资料库/更新/笔记/阅读现场/窗口)
│   │   ├── pdf-tools.ts       # 注册 pdf_read_pages / pdf_outline agent 工具
│   │   ├── reading-prompt.ts  # 阅读助手系统提示词
│   │   ├── library-root.ts    # 当前资料库根与路径越界校验(叶子模块)
│   │   ├── notes-store.ts     # 笔记存储(工作区 .pix-read/notes.json)
│   │   ├── reader-state-store.ts  # 阅读现场存储(工作区 .pix-read/reader-state.json)
│   │   ├── chat-files.ts      # 附件处理(图片缩放等)
│   │   ├── file-dialogs.ts    # 原生目录/附件选择对话框
│   │   ├── pix-paths.ts       # PiX 自有存储位置唯一来源(%APPDATA%/PiX-Read,含 agent/sessions)
│   │   ├── env-setup.ts       # 进程级环境隔离(须为 main 入口第一个 import)
│   │   └── settings-store.ts  # pix-settings 持久化(electron-store)
│   ├── renderer/              # Vue 渲染进程
│   │   ├── main.ts / App.vue / router.ts
│   │   ├── components/workspace/  # LibraryPanel / NotesPanel / ReaderPanel / PdfViewer / PdfSearchPanel / PdfSelectionQuickAsk / KnowledgeMap / ChatPanel
│   │   ├── components/session/    # MessageBlock / ToolExecutionBlock / ErrorBlock / GuideBlock
│   │   ├── components/input/      # InputArea / ModelSelector / ThinkingSelector / ClarificationCard
│   │   ├── components/settings/   # McpSettings(模型与密钥等已并入 SettingsPage)
│   │   ├── components/layout/     # AppLayout
│   │   ├── pages/             # HomePage / WorkspacePage / SettingsPage
│   │   ├── stores/            # session / project / settings / auth / reader / reader-state / notes
│   │   ├── composables/       # useRpc / useRegionCapture / useTheme / useQuickAsk
│   │   ├── utils/             # markdown / reading-context / session-title / note-capture / notes-path / notes-view / outline-notes / image-capture
│   │   ├── types/             # ipc / rpc / session 类型声明
│   │   └── assets/styles/     # main.css / variables.css
│   └── shared/                # 主进程与渲染进程共享类型
│       └── types.ts           # RpcCommand / GuiSettings / LibraryFileResult / PDF 区域截图等类型
├── resources/skills/          # 随包技能(read-and-analyze-materials)
└── package.json               # name: pix-read, build: electron-builder 配置
packages/
├── agent/                     # @earendil-works/pi-agent-core:agent-loop 内核
├── ai/                        # @earendil-works/pi-ai:多模型 LLM API
├── coding-agent/              # @earendil-works/pi-coding-agent:会话/工具/扩展(无 TUI)
└── mcp-adapter/                # pi-mcp-adapter:MCP 协议适配器
```

## 开发

```bash
# 安装依赖(在仓库根目录,工作区包含 packages/*)
npm install --ignore-scripts

# 在 pix/ 下开发
cd pix
npm run build:main   # 先编译主进程/preload 到 dist(改过 src/main 必须执行)
npm run dev          # Vite + Electron
npm run dev:renderer # 仅渲染进程
npm run check        # 渲染层 vue-tsc + 主进程 tsc 类型检查
npm run build        # 构建 main + renderer
npm run package      # 构建并打包为安装程序
```

内核包(packages/*)改动后需要重新构建供 pix 引用:

```bash
npm run build        # 根目录:按 ai → agent → coding-agent → mcp-adapter 顺序构建
```

## 构建打包

```bash
cd pix
npm run package
```

产物位于 `pix/release/`:
- Windows: `PiX-Read-Setup-x.x.x.exe`(NSIS 安装程序)
- macOS: `PiX-Read-x.x.x.dmg`
- Linux: `PiX-Read-x.x.x.AppImage`

`pix/package.json` 的 `build` 字段是 electron-builder 的唯一配置源(`appId: com.pixread.app`,`productName: PiX-Read`)。

## 依赖包

| 包名 | 说明 |
|------|------|
| `@earendil-works/pi-coding-agent` | 复用:AgentSession / 工具 / session / settings / 扩展系统 |
| `@earendil-works/pi-agent-core` | 复用:agent-loop 运行时 |
| `@earendil-works/pi-ai` | 复用:多模型 LLM API |
| `pi-mcp-adapter` | 复用:MCP 协议适配器 |

## 许可证

MIT
