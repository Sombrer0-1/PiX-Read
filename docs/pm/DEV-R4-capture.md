# R4 开发文档：红笔圈画 → 框选截图（删除 + 重写）

> 仓库：E:\develop\PiX-Read（Electron + Vue3 + Vuetify3 + Pinia）。
> 本档一半是**删除**（红笔全链路），一半是**重写**（框选截图）。用户已明确授权删除红笔。
> 有疑问按本档最接近方式决策并记录。

## 必读约束

1. `cd pix && npm run check` 必须 0 error。删除代码后不许留下未使用的导入/类型/死代码。
2. 禁止 `any`、禁止动态 import()、顶层 import、UI 文案中文、注释只写约束。
3. Vuetify 先查仓库根 `vuetify_guide/`。
4. 不运行 `npm run build` / `npm test` / `npm run dev` / 任何 git 写命令（可用 git status/diff 只读）。
5. 风格对齐现状。

## 第一部分：删除红笔全链路（彻底，不留向后兼容）

逐项删除，删完后全局搜索 `ink|Ink|annotation|Annotation|PdfAnnotator`（PdfAnnotator 换成新组件属例外）确认无残留引用：

- `pix/src/renderer/components/workspace/PdfAnnotator.vue` — 整个文件删除。
- `pix/src/renderer/composables/usePdfCapture.ts` — 整个文件删除（seam 被新 seam 取代，见第二部分）。
- `pix/src/main/annotation-store.ts` — 整个文件删除。
- `pix/src/main/ipc-handlers.ts` — 删除 `annotations-load` / `annotations-save` 两个 handler 及相关 import（loadAnnotations/saveAnnotations/PdfInkFile）。
- `pix/src/main/preload.ts` — 删除 `annotationsLoad` / `annotationsSave` 及 `PdfInkFile` import。
- `pix/src/shared/types.ts` — 删除 `ReaderAnnotationMode`、`InkPoint`、`InkStroke`、`PdfInkFile`；**保留** `PageCapture`（新功能继续用它）。同步清理 `pix/src/renderer/types/rpc.ts` 中的对应 re-export（若存在）。
- `pix/src/renderer/stores/reader-store.ts` — 删除 `annotationMode` 与 `setAnnotationMode`，新增 `captureMode`（boolean）与 `setCaptureMode`（导出字段同步更新）。
- `pix/src/renderer/pages/WorkspacePage.vue` — `goHome()` 中 `readerStore.setAnnotationMode("none")` 改为 `readerStore.setCaptureMode(false)`。
- `pix/src/renderer/components/workspace/ChatPanel.vue` — 删除：`getPdfCaptureApi` import 与 send() 中的自动截图分支、`hasInkCapture`/`refreshInkCapture`/ink 轮询 watcher、`ink-capture` chip（ContextChipKind、inkChip、excluded 分支）。
- `pix/src/renderer/components/workspace/PdfViewer.vue` — 删除：PdfAnnotator import 与使用、`inkPages` 状态及全部 ink 函数（strokesForPage/onStrokeEnd/undoLastStroke/clearCurrentPageInk/togglePenMode/inkBounds/drawInkOnContext/flushInkSave/persistInk/loadInk/saveInkSnapshot/cloneInkPages）、`pdf-ink-controls` 区块、`canUndoInk`/`currentPageStrokes`/`penActive` 计算属性、overlay `.drawing` 相关样式、`captureCurrentPage` 中 cropToInk 逻辑（见第二部分重写）、`registerPdfCaptureApi` 注册。`INK_COLOR`/`INK_CROP_PADDING` 随 ink 删除。
- `pix/src/main/reading-prompt.ts` — 措辞替换："Distinguish PDF body text from user ink/markup. An attached ink screenshot is markup over the page, not the OCR source of truth." → "Distinguish PDF body text from attached page-region screenshots. An attached screenshot is the user's selection over the page, not the OCR source of truth."
- `pix/resources/skills/read-and-analyze-materials/SKILL.md` — 同义替换 ink → page-region screenshot（第 4/5 条）。
- `README.md` — 功能特性第一条里「红笔圈画并随提问附图」改为「框选页面区域截图并随提问附图」；如有其它 ink 表述一并替换。

## 第二部分：框选截图（新功能）

### 交互设计

- **入口**：阅读器左下 FAB（原红笔位置），图标 `mdi-crop`，title「框选截图（随提问发送）」。点击切换 `readerStore.captureMode`；激活态样式参考原 pen FAB（flat + primary 色）。
- **进入模式**：`.pdf-viewer` 根加 `capture-mode` class：
  - `.textLayer` 与 `.pdf-overlay` `pointer-events: none`、`user-select: none`（防文字选区干扰）。
  - 滚动区之上覆盖一层捕捉层（`.capture-layer`，absolute inset 0，z-index 高于 textLayer 与 search panel，cursor: crosshair）。
  - 顶部居中提示胶囊：「拖拽框选要提问的区域，Esc 取消」（样式参考 `.pdf-page-indicator`）。
- **拖拽**：pointerdown 记录起点（相对捕捉层）；pointermove 更新矩形 div（1.5px 实线 border，`--pix-accent` 色，填充 accent 8% 透明度）；矩形可反向拖（起点在终点右下时自动归一化）。pointerdown 后按下 Esc → 取消本次拖拽并退出模式。
- **松手**：
  1. 矩形宽高 < 6px 视为误触 → 忽略并退出模式。
  2. 确定「目标页」：`document.elementFromPoint` 或几何计算——用矩形中心命中的 `[data-page]` 元素；把拖拽矩形与该页元素矩形求**交集**（拖拽跨页时自动裁到单页）。
  3. 找该页 `canvas`，把交集（CSS 像素）换算到 canvas 设备像素：`scaleX = canvas.width / canvasRect.width`。新建离屏 canvas，按 `CAPTURE_MAX_EDGE = 2000` 长边缩放绘制裁剪区，`canvasToPngBase64` 得 `{ mimeType: "image/png", base64 }`。
  4. 经新 seam 推给 ChatPanel；退出截图模式（复用现有 `canvasToPngBase64` 工具，utils/image-capture.ts）。
- **Esc**：无拖拽时按 Esc 退出模式。复用 PdfViewer 现有 window keydown：在搜索分支**之前**处理（captureMode 优先）。
- **保留能力**：截图模式下 Ctrl+滚轮缩放仍可用吗——不允许（捕捉层拦截 wheel 即可），降低边界情况；退出模式后一切如常。

### 组件间 seam

新建 `pix/src/renderer/composables/useRegionCapture.ts`（模式参考已删除的 usePdfCapture.ts，module-level）：

```ts
export type RegionCaptureHandler = (image: { mimeType: string; base64: string }) => void;
export function registerRegionCaptureConsumer(handler: RegionCaptureHandler | null): void;
export function emitRegionCapture(image: { mimeType: string; base64: string }): void;
```

- PdfViewer：截图完成 → `emitRegionCapture(img)`。
- ChatPanel：`onMounted` 注册 / `onUnmounted` 注销。收到图 → 若 `clipboardImages.value.length < MAX_PASTED_IMAGES` 则 push，否则忽略。现有「截图 N」chip 与发送链路自动生效，无需新 UI。
- ChatPanel 的 `update:answer` 等现有逻辑不动；附件 chip 显示由现有 `clipboardImages` 渲染承担。

### defineExpose 清理

PdfViewer `defineExpose({ gotoPage, captureCurrentPage })` → `defineExpose({ gotoPage })`（captureCurrentPage 已随重写消失；确认无其它引用——KnowledgeMap/ReaderPanel 只用 gotoPage）。

## 验收清单（PM 逐条核对）

1. `cd pix && npm run check` 0 error；全局 grep 无 ink/annotation 残留（新 seam 与新组件命名除外）。
2. 左下 FAB 变为裁剪图标；点击进入模式有遮罩/提示/十字光标；Esc 可退出。
3. 拖拽出矩形 → 松手 → composer 出现「截图 1」chip；连续框选可叠加，上限 8 张后不再增加。
4. 框选区域图像内容正确（对准某段文字拖框，发送后图片应为该区域——真机验收由 PM 做，代码层需保证坐标换算含 devicePixelRatio 与滚动偏移）。
5. 截图模式下不能选中文字、搜索面板打开时行为不冲突（模式优先级：captureMode > search Esc 处理顺序正确）。
6. 主进程/preload/shared types 无 annotations 通道；构建（PM 负责）不会因删除文件出现悬空 import。
7. reading-prompt/SKILL/README 措辞已更新。

## 交付物

修改/删除/新建文件清单 + 交付说明（坐标换算公式、跨页裁剪处理、Esc 优先级实现）。
