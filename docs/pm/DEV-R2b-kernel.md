# R2b 开发文档：页码引用约定（主进程提示词）与知识地图联动

> 仓库：E:\develop\PiX-Read。本档一个主进程文件 + 一个技能文件 + 一个渲染组件，改动小但要精确。
> 你只负责本档需求。有疑问按最接近方式决策并记录。

## 必读约束

1. 只改这三个文件：
   - `pix/src/main/reading-prompt.ts`（修改）
   - `pix/resources/skills/read-and-analyze-materials/SKILL.md`（修改）
   - `pix/src/renderer/components/workspace/KnowledgeMap.vue`（修改）
   （另一并行任务在改 ChatPanel/markdown/ReaderPanel/PdfViewer 相关，不要碰任何 workspace 其它文件。）
2. `cd pix && npm run check` 必须 0 error。主进程文件改动不做构建（PM 统一构建），但必须通过 `tsc -p tsconfig.main.json --noEmit`（npm run check 已包含）。
3. 禁止 `any`、顶层 import、UI 文案中文、注释只写约束。
4. 不运行 `npm run build` / `npm test` / `npm run dev` / 任何 git 写命令。

## 背景

渲染侧（并行任务）会把回答文本中的 `[[p37]]` 渲染成可点击页码徽标，点击跳转到 PDF 第 37 页。主进程需要让 agent 知道并遵守这个输出约定；知识地图需要跟随阅读位置自动高亮滚动。

## 需求

### N10 约定注入（主进程）

`reading-prompt.ts` 的 `READING_ASSISTANT_SYSTEM_PROMPT`（数组 join 形式）追加两行（放在「Do not dump an entire PDF」附近）：

- "When your answer refers to a specific PDF page, mark it as [[pN]] (for example [[p12]]) so the reading UI can render a clickable page badge. Use it for every concrete page reference; do not invent page numbers you have not seen in tool results or reading context."
- 中文注释一行说明该约定与渲染层联动的约束（注释中文、提示词本身英文，与现有风格一致）。

`SKILL.md` 的「Page-check procedure」列表后新增一节 `## Citing pages`：说明引用具体页码一律 `[[pN]]` 格式、页码必须来自 `pdf_read_pages` 结果或 `<reading_context>`，不得编造；示例一行。

### N13 知识地图联动阅读位置（渲染）

`KnowledgeMap.vue`：

- 当 `readerStore.page` 变化且地图打开（组件本身只在打开时挂载，无需判断 mapOpen）时：计算当前页所属的节点（页码落在该节点页码范围内的最深节点；沿用现有 `pageLabels`/`rows` 数据），给该行加 `current` 类的逻辑已存在（`isCurrent` 只做精确 page 相等匹配）——把它改成「页码范围命中」：`page <= currentPage <= (下一个更高页码节点的前一页)`，无页码节点不命中。
- 当前命中的行 `scrollIntoView({ block: "nearest" })`，但仅当滚动来源是「用户翻页」而非「用户点击地图节点跳转本身」（点击节点跳转会触发同样的 page 变化，此时再 scrollIntoView 会把地图滚走——用一个小延迟或记录程序性跳转标记来抑制，方案自定并说明；简单方案：点击节点后的 600ms 内不做自动滚动）。
- 不改数据流（outline 仍来自 readerStore.outline），不改样式基调，只追加 current 样式所需的最小变更（现有 `.current` 样式可复用）。

## 验收清单

1. `cd pix && npm run check` 0 error。
2. reading-prompt.ts 与 SKILL.md 中约定文案准确、无错别字、风格与现有一致。
3. 翻页时知识地图中当前章节行高亮且地图平滑滚动跟随；点击地图节点跳页时地图不发生跳动。
4. 未改动本档之外文件。

## 交付物

修改文件列表 + 交付说明（当前章节判定算法、抑制自动滚动的方案）。
