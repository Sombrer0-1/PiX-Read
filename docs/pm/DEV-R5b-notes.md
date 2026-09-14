# DEV-R5b-notes：开发包 B（UI 与交互）交付说明

> 输入：`docs/pm/DEV-R5-notes.md`（§4–§5、§7.2、§8.2/§8.5/§8.6）、`docs/pm/PRD-V0.3.md`（N17–N25 验收）、评审档 `pix-r5/design-review.md`（must-fix 1/2/5/6 的 B 侧步骤）、A 的交接约束 `docs/pm/DEV-R5a-notes.md` §5。
> 范围：只改 B 白名单；不碰 `ChatPanel.vue` / `MessageBlock.vue` / `LibraryPanel.vue` / `useQuickAsk.ts` / `ReadingPanel` / `packages/*`。
> 依据用户前置说明「开发包 B 白名单以 `DEV-R5-notes.md` 为准」：**「AI 回答存为笔记」为 PRD P2 项（PRD 第 66/276 行：唯一会改 `ChatPanel.vue`，本轮只冻结 `kind`），本轮不实现、不改 ChatPanel**。

## 1. 改动文件清单

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `pix/src/renderer/utils/note-capture.ts` | 新建 | 纯函数 `resolveSelectionPage(range, stage)`：锚点 `[data-page]` 祖先 → 页码；失败回退「选区顶边纵向命中」→ 再回退「垂直距离最近的页节点」；跨页取起始页。无 import、无 store 依赖。 |
| `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue` | 改 | 单按钮浮层 → `[问 AI] [摘录]` 双动作；三态原位反馈 `mode = actions \| feedback`（成功 `已摘录 · 第 N 页` / 重复 `已在笔记中` / 失败 `摘录失败：<原因>`，2.5s 复位）；`pending` 期间双按钮禁用；摘录条件 = `pageCount > 0 && resolveSelectionPage(...) !== null`；`问 AI` 链路不变；滚动即隐藏规则不变。 |
| `pix/src/renderer/components/workspace/NotesPanel.vue` | 新建 | 面板全量实现：头部（`共 N 条` + 导出按钮 + 「仅看当前文档」开关）、`.notes-notice`（4s 自动消失 / 点 × 关闭）、`.notes-export-row`、加载/错误/空态、文档分组与条目（页码徽标、3 行截断 + 展开、备注展示/行内编辑、相对时间、删除二次确认）；错误态按 `errorCode` 渲染逃生口；无 props，`emit("open-note")`。 |
| `pix/src/renderer/pages/WorkspacePage.vue` | 改 | 左栏 pill 改为 `返回首页 \| 资料库 \| 笔记 N \| 折叠`（`data-tab` 稳定钩子、`title` 放工作区绝对路径 / notes.json 绝对路径）；`LibraryPanel`/`NotesPanel` 用 `v-show` 常挂载；`onMounted` 的 `syncWorkspaceState` 后 `resetNotes()` + `loadNotes()`；切笔记标签 `loadNotes()`；`goHome()` 与 `onUnmounted` 各 `resetNotes()`；新增 `onOpenNote` 跳转入口。 |
| `pix/src/renderer/stores/reader-store.ts` | 改 | 仅新增 `pendingJump` / `requestJump` / `takePendingJump`（消费式），`openDocument` 按路径匹配清理意图；`requestJump` 对已加载文档走 `gotoPage = Math.min(page, pageCount)`（MF-2 钳制）。既有字段语义零改动。 |
| `pix/src/renderer/components/workspace/PdfViewer.vue` | 改 | `loadPdf()` 成功路径：`scrollToPage(takePendingJump(filePath) 钳制后 ?? 1)`；失败路径（`generation` 判定之后）丢弃意图。2 处、5 行。 |
| `E:/develop/PiX-Read/.gitignore` | 改 | 追加 `.pix-read/`（P1 收尾）。 |
| `E:/develop/PiX-Read/README.md` | 改 | 功能特性补一行「阅读笔记」（P1 收尾）。 |
| `docs/pm/DEV-R5b-notes.md` | 新建 | 本档。 |

未改动（核对项，`git status --short` 实测）：`ChatPanel.vue`、`MessageBlock.vue`、`LibraryPanel.vue`、`useQuickAsk.ts`、`ReaderPanel.vue`、`AppLayout.vue`、`reading-prompt.ts`、`pix-paths.ts`、`library-root.ts`、`packages/*`、`package.json`/lockfile、A 的 `main/notes-store.ts`、渲染层 `stores/notes-store.ts`、`utils/notes-path.ts`（B 只读消费）。

## 2. 关键设计决策（含与设计稿的差异与理由）

1. **摘录页码在浮层出现时解析一次**：`resolveSelectionPage` 在 `showFor` 时求值，点击时直接使用缓存页码与缓存原文（与「问 AI」的缓存语义一致）。理由：`N 用本地解析出的页码，与写入值一致`；浮层可见期的滚动即隐藏规则保证缓存不会跨滚动失效。
2. **浮层容器化**：单按钮改为容器 `.quick-ask`（`position: absolute`）+ 内部按钮；测量、钳制、`@pointerdown.prevent` 全部作用于容器（点击不丢选区，行为与改前一致）。
3. **反馈态不隐藏、复用同一浮层**：成功/重复/失败都替换为反馈文本；2.5s 后若浮层仍可见（选区仍在）回到双动作，否则保持隐藏。滚动/选区清空触发的 `hide()` 会同时清反馈与定时器。
4. **删除二次确认的取消监听加了「自身目标」守卫**（与设计稿的机制差异）：设计稿写「document 挂 capture 阶段 pointerdown + 按钮 `@pointerdown.stop`」。capture 阶段先于目标元素触发，`.stop` 无法屏蔽 document 的 capture 监听，否则第二次点击会「先取消再确认」永远删不掉。实现为：capture 监听内 `if (target.closest(".note-delete")) return;`，`.stop` 仍保留（与设计稿字面一致），行为为「点其它位置取消、点确认按钮执行」。监听与 3s 定时器在 `clearDeleteConfirm` 成对清理，`onBeforeUnmount` 兜底。
5. **逃生口按钮条件 = `errorCode ∈ {corrupt, version-unsupported}`**（A 交接约束 3）；`notesFilePath === ""`（no-root）时不渲染「在文件夹中显示」也不调用 `libraryShowInFolder`（MF-5 / A 交接约束 4）。
6. **错误态标题用 `notesStore.errorMessage`，第二行用 `errorDetail`；两者相同时不重复渲染第二行**（`errorCode === null` 的 reject 场景 `errorMessage` 回落到 `errorDetail`）。
7. **逃生口成功提示为「已备份原文件并新建空库」（不含时间戳）**：A 的 `recoverCorruptNotes()` 只返回 `{ ok }`，不含 `backupPath`；B 白名单不允许改 A 的 store 文件，故无法渲染设计稿中的 `<时间戳>` 片段。主进程返回体本身含 `backupPath`，若将来需要展示，A/B 任一周期加一个字段即可（不属本轮）。
8. **「仅看当前文档」过滤后当前文档无笔记时显示「当前文档暂无笔记」**：设计稿未冻结该边界；不显示标准空态（其文案会说「还没有摘录」，而笔记其实存在）。
9. **`onOpenNote` 的「是否换文档」判定用 `docPathKey` 归一化比较**（MF-1 的 B 侧步骤 / A 交接约束 1）：同文档点击不触发 `openDocument` 重载，落页走 `requestJump → gotoPage`。
10. **越界页语义写死为「跳到最后页」**：`requestJump` 与 `PdfViewer` 消费点两处 `Math.min(page, pageCount)`（MF-2）。
11. **相对时间内联在 NotesPanel**（唯一调用点，无 Intl 分支）：`刚刚 / N 分钟前 / N 小时前 / N 天前`；时间取 `createdAt`（摘录时间）。
12. **导出结果行保留至离开工作区**：`lastExport` 由 store 持有、`resetNotes()` 清空（A 的既有语义），不额外做 UI 级清除。

## 3. 验证

### 3.1 工程门（唯一强制命令，真实运行）

```
$ cd pix && npm run check
> pix-read@0.1.0 check
> vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit
exit=0            # 无任何 error/warning 输出（全量改动落地后运行两次，均 0 error）
```

### 3.2 只读核对（§8.2 补充）

```
$ git status --short                     # 仅 B 白名单 + A 已交付的未跟踪文件 + PM 档；ChatPanel.vue 零改动
$ git diff --stat pix/src/renderer/components/workspace/ChatPanel.vue pix/src/main/reading-prompt.ts   # (空)
$ grep -rn ": any\b|as any|<any>" <B 的 6 个源码文件>                               # (none)
$ grep -rn "await import(|import(\"" pix/src/renderer pix/src/main                  # (none)
$ grep -c "ipcMain.handle(\"notes-" pix/src/main/ipc-handlers.ts                    # 6（A 交付，未改）
$ grep -rn "notes.json" pix/src/renderer                                            # 仅 NotesPanel 头注释一处（非路径拼接）
$ grep -rn "notes.md" pix/src/renderer                                              # 仅导出行展示文案一处
$ grep -n "from \"fs\"|from \"node:fs\"|from \"path\"|from \"node:path\"" <渲染层 notes 相关 4 文件>   # (none)
$ grep -rn "recoverCorruptNotes" pix/src/renderer                                   # 4 处（store 定义 + 面板调用 + 注释）→ R8 销账
```

### 3.3 离屏走查（临时 harness，跑完已删；截图与脚本全部落在仓库外 `E:/tmp/r5-shot/`）

结构：`serve.mjs`（Vite Node API 起 dev server，root=`pix`，端口 5178）+ `stub-preload.cjs`（contextBridge 桩 `pixApi`，笔记夹具/损坏模式可经 `r5:state` IPC 切换）+ `main.cjs`（Electron 33 主进程：`disable-gpu` + offscreen `BrowserWindow(1280×860)`；用 `printToPDF` 现场生成 3 页真实 PDF 作为 `libraryReadFile` 的字节来源；`capturePage()` 逐态截图）。**非 npm 脚本、未改仓库文件、未跑 build/test/package。**

实测断言（全部通过，原样摘录）：

| 场景 | 结果 |
| --- | --- |
| 空态 | `.notes-empty` = 「还没有摘录」+「在 PDF 中选中文字，点「摘录」保存到这里」；导出按钮文案「暂无笔记」且 disabled；标签「笔记」（0 条不显示数字）；无当前文档时开关 disabled |
| 文本预览选区 | 浮层仅 `["问 AI"]`（无「摘录」）→ N17 验收 7 |
| 数据态 | 2 个分组；当前文档组（notes.md）置顶且带「当前文档」chip；组头 `共 1/2 条`；徽标 `第 1/2/5 页`；长文 `clamped` + 「展开全文」；备注显示「全篇的出发点。」；标签「笔记 3」 |
| 导出 | `.notes-export-row` = 「已导出 3 条 → .pix-read/notes.md」+「在文件夹中显示」；点击前按钮可用的前提=有笔记 |
| 删除待确认 | 二次点击前按钮变「确认删除」+ 行 `.confirming` 淡红底；`pointerdown` 落面板其它位置后 `confirming` 计数归 0；确认执行后行数 3→2、主进程桩列表同步、标签「笔记 2」 |
| 仅看当前文档 | 开关打开后分组 1（当前文档）；关闭恢复 2 |
| PDF 摘录（N17 验收 2 场景） | 当前页指示「第 1 / 3 页」时选中第 2 页文字 → 浮层 `["问 AI","摘录"]`；点击摘录 → 反馈「已摘录 · 第 2 页」；写入草稿 `{ docFilePath: E:\tmp\r5-ws\papers\attention.pdf, page: 2, text: … }`（页码=锚点页，非当前滚动页） |
| 反馈复位 / 去重（N23） | 2.8s 后浮层回到 `["问 AI","摘录"]`；再次摘录同一选区 → 「已在笔记中」，条数不增（3→仍 3，随后为 4） |
| 跳回原文（N20 验收 1/2） | 同文档点击第 2 页笔记 → 指示器「第 2 / 3 页」 |
| 跨文档 + 越界钳制（N20 验收 3 / MF-2） | 切到文本预览后点击第 5 页笔记（3 页文档）→ 重新加载 PDF 并落「第 3 / 3 页」（钳制到最后页） |
| 错误态（N19 验收 4 / N25） | `corrupt` → 标题「笔记文件无法读取」+ detail 原文 + 三按钮「重试 / 在文件夹中显示 / 备份原文件并新建空库」；点击逃生口 → 绿色提示「已备份原文件并新建空库」+ 面板回空态 |
| 备注（N22） | 打开编辑器 → 保存 → 行内文案与桩数据同步为输入值、编辑器关闭；取消 → 数据与展示均保持原值（草稿未落盘） |
| 浮层几何 | `layer` 右缘 == 选区右缘、底边 = 选区顶边 − 6px，双按钮横排（60×18 / 56×18），无溢出 |

同一 harness 另修复过两个**测试环境**问题（与产品代码无关，记录备查）：销毁唯一窗口会触发 Electron 默认退出导致后续 `loadURL` 失败（需 `app.on("window-all-closed")` 保持存活）；离屏窗口帧驱动不足时 pdf.js 的 IntersectionObserver 不渲染次页（需在轮询中 `capturePage()` 强制出帧）。

## 4. 逐条验收自评（对照 DEV-R5-notes §7.2）

**P0**

1. `npm run check` = 0 error：通过（§3.1）。
2. N17 验收 1–7：1/2/3/7 由离屏走查实测（§3.3）；4「写入字段与归一化」由 A 的主进程烟测覆盖 + 本次草稿字段核对；5「连续摘录」由去重实测覆盖；6「文本预览无摘录」实测。剩余真机项见 §5。
3. N19 验收 1–7：1/2（分组/排序/计数即时/切标签保留展开态）/3/4/5/6 实测；7「切面板不动阅读区」为 `v-show` 结构保证（未单独断言滚动位置，见 §5）。
4. N20 验收 1–6：1/2/3 实测（3 的「加载中连点取最后一条」为代码路径核对：`requestJump` 覆盖写 + 加载完成消费）；4 由「未打开文档时点条目」路径覆盖（首次打开 PDF 即由点击触发）；5 由失败路径清除代码 + 错误态实测（未真机移动文件）；6 由文本预览实测（目标为文本时打开预览、不报错）。
5. N21 验收 1–7：产物模板/幂等/字节不变属主进程（A 的烟测逐条覆盖）；UI 侧 3（0 条禁用 + 文案）、4（失败提示走 `.notes-notice`）、7（在文件夹中显示入口）已实现，「能定位到文件」需真机（见 §5）。
6. P1：N22 备注编辑实测（保存/取消/失败保留输入）；N23 重复识别实测；N24 仅看当前文档与当前文档标记实测；N25 逃生口实测。
7. 无回归：文本预览无「摘录」实测；「问 AI」链路未改（同一 `emitQuickAsk` seam）；资料库树不显示 `.pix-read`（A 的既有 `startsWith(".")` 规则未动）；知识地图/会话/错误兜底/框选链路零改动（`git status` 仅白名单文件）。

## 5. 未验证项与原因

1. **真实 Electron IPC 往返**（`ipcMain.handle` ↔ 六条 `notes-*`）：走查用桩 preload；真实链路静态依据为 `tsc -p tsconfig.preload.json` + A 的通道核对。需 `npm run dev`/真机，本轮禁止。
2. **真实鼠标交互细节**：`@pointerdown.prevent` 保住选区、滚动即隐藏（含反馈期间）、删除「点其它位置取消」的真实指针路径——离屏 harness 用合成事件验证了逻辑，真机指针行为需 PM 走查（§8.6）。
3. **3s 删除确认超时自动复位**：定时器清理逻辑已实现并随 `onBeforeUnmount` 兜底，但走查未等满 3s 断言（PM 走查项）。
4. **`libraryShowInFolder` 真机定位**（打开资源管理器并选中 `notes.md`）：桩返回成功，未真机验证。
5. **N20 验收 5「文件被移动/删除」**：失败路径的意图清除代码已就位；真机复现（重命名文件后点击笔记）属 PM 走查。
6. **Windows `renameSync` 被占用（EPERM）**、多实例并发、掉电：设计记录在案的边界，A 档同款未验证项。
7. **切面板不动阅读区（N19 验收 7）**：结构上 `v-show` 不触碰 `reader-store`，但本次未对「滚动位置」做数值断言。

## 6. 阻塞项

无。所有 P0 与 P1（N22–N25）均已落地并通过 `npm run check` 与离屏走查；上文未验证项均属「需真机 / PM 走查」或「设计明确记录的边界」，不阻塞交付。
