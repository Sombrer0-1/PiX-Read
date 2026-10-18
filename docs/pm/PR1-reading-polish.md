# PR #1 阅读体验打磨 · 冻结项变更登记

> 对象：`feat/reading-polish`（PR #1：页顶停靠、缩放锚点与预设、专注阅读、对话起手）。
> 本档只登记本 PR 对既有冻结项的有意变更（PRD-V0.6 §5 红线 2），按 R17-req §0.9 / R18-req §0.10 的登记式先例写法；未登记的既有冻结项零改写。

## 1. 快捷键总览键位表（取代 R17-design §1.3「3 组 / 18 行，不得增删」）

| 项 | R17 冻结值 | 现值 |
| --- | --- | --- |
| 行数 | 3 组 / 18 行（9 + 8 + 1） | **3 组 / 22 行（11 + 8 + 3）** |
| 第 1 组新增（插在 `]` 之后、`Esc` 之前） | — | `["Ctrl+=", "Ctrl+-"]` 放大 / 缩小；`["Ctrl+0"]` 适合宽度 |
| 第 3 组 | `["?"]` 打开或关闭本总览 | `["F"]` 专注阅读（收起或展开两侧栏）；`["?"]` 打开或关闭本总览；`["Ctrl+,"]` 打开设置 |

- `Ctrl+,` 来自 main `a657940`（该提交把表扩到 19 行但未登记），一并在此销账。
- 收录口径不变（R17-req §0.2 第 1 条）：只登记工作区内应用代码显式注册 `keydown` 的键位。新增 4 个键位均有真实监听（`PdfViewer.vue` 的 `onWindowKeydown`、`WorkspacePage.vue` 的 `onFocusKeydown`、`ShortcutOverview.vue` 的 `onWindowKeydown`），不属于 R17-design「失败模式 ①」所指的「补进不存在的键位」。
- 其余逐字冻结项（组标题、`SHORTCUT_KEY_JOIN`、`SHORTCUT_NOTE`、既有 18 行的 `keys` / `desc`）零改写。

## 2. `smoke-view.mjs` 既有断言更新（`shortcut-table` 组，逐条登记）

条数不变（9 组 74 条），只改手写期望以对齐 §1：

| 断言 | 原值 | 现值 |
| --- | --- | --- |
| #3 总行数 | 18（9 + 8 + 1） | 22（11 + 8 + 3） |
| #4 第 1 组逐字深等 | 9 行 | 11 行（含两条缩放行） |
| #6 第 3 组逐字深等 | 1 行 | 3 行（F / ? / Ctrl+,） |
| #11 修饰键白名单 | `Ctrl+` 恰 1 次（`Ctrl+F`） | `Ctrl+` 恰 5 次（`Ctrl+F` / `Ctrl+=` / `Ctrl+-` / `Ctrl+0` / `Ctrl+,`），仍禁 `Ctrl+Shift` / `Alt+` / `Meta+` |

`smoke-notes.mjs` 零改动。

## 3. 布局字面

- `.pdf-toolbar` 由阅读区内第二排移到与 `.center-pill` 同排右上（`top: 8px; right: 10px`）；`.pdf-search-panel` 的 `top` 随之 78px → 44px。
- 打开 PDF 时 `.center-pill` 追加 `max-width: calc(100% - 192px)`，给同排工具条让位；R17-design §1.2 登记的 `.pane-pill` `margin` / `height` / `--pix-pane-pill-height` / `.center-pill` `top` 均未改，快捷键总览浮层的 78px 定位不受影响。
- `ui-shot.mjs` 零改动；按钮 `title`「缩小」「放大」与「无记录时缩放回落 100%」保持原样。
