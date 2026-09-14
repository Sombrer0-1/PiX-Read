# PiX-Read V0.3 产品需求文档（R5：读有所得）

> 本目录为 PM 工作文档，沿现有约定放在 `docs/pm/`。
> 上游：`docs/pm/PRD-V0.2.md`（N1–N16 已交付：三栏工作区、PDF 连续阅读、选中即问、composer chips、无密钥引导、错误兜底、复制能力、会话管理、模型/思考深度、MCP、token 显示、框选截图）。
> 本轮范围约束：只做「本地论文阅读 + AI 辅助」主线，不做论文下载 / 云同步 / 多标签 / LLM 生成导图 / 多色笔 / 暗色主题。
> 需求编号从 **N17** 起。本轮迭代代号 **R5**（V0.3 第一轮）。

---

## 1. 产品目标

### 1.1 V0.3 总目标

**把 PiX-Read 从「阅读辅助」推进为「阅读资产」。**

V0.2 解决的是「读得进、看得见、回得来」——能力都在，但读完一篇论文，用户手里没有任何沉淀：关键段落停在对话流或剪贴板里，下次再读同一篇论文仍要重新翻页找。V0.3 起，在本机工作区内积累**可回跳、可外带、可复用**的阅读资产。

### 1.2 战略判断（本轮主题：读有所得）

| 维度 | V0.2（阅读辅助） | V0.3（阅读资产） |
| --- | --- | --- |
| 用户拿到的东西 | 一次问答、一次跳页 | 本机可积累的摘录与理解 |
| 数据归属 | 会话（可被压缩/切换/丢弃） | 工作区 `.pix-read/`（不随会话变化） |
| 与「聊天式 PDF 工具」的分界 | 有 AI | 有产物：可积累、可回跳、可导出、可被 agent 复用 |
| 验收问句 | AI 看到了什么、回答能不能跳回 | 读完这篇，我留下了什么、下次能不能找回来 |

本轮只做「关键段落 → 笔记」这条主线。**AI 结论入库（kind=answer）只冻结格式、不实现**（见 §7）。

### 1.3 R5 成功判据

1. **闭环成立**：PDF 中选中文字 → 摘录 → 笔记面板（按文档分组）→ 点击跳回原文页 → 一键导出 Markdown 到工作区 `.pix-read/`，全链路可演示、可逐条判定。
2. **数据可信**：只落本机工作区，重启后一致；文件损坏时只报错、绝不覆盖；写入原子、无半条数据。
3. **规模可控**：两个子代理、两个开发周期交付；`cd pix && npm run check` 为 0 error。
4. **零外溢**：`ChatPanel.vue`、`reading-prompt.ts`、SKILL.md、`packages/*` 本轮零改动；agent 语义与发送链路不变。

---

## 2. 横向选型结论（三份候选）

### 2.1 逐份评估

| 候选 | 对主线（沉淀/回跳/复用/导出）的贡献 | 实现成本 | 风险 | 可验收性 | 结论 |
| --- | --- | --- | --- | --- | --- |
| **cand-min**（最小可用闭环） | 沉淀/回跳完整，导出降级为 P2、备注降到 P1 | 1 周期，12 文件 | 低：写得最收敛，风险三条都点名了应对 | 高：验收条目是「逐条判定」粒度，含损坏、跨库、超长、重启 | **采为 P0 骨架**（但导出必须升入 P0，见下） |
| **cand-full**（完整闭环） | 沉淀/回跳/导出齐全，且把「AI 回答入库」纳入 | P0 2 周期 + P1 1 周期 | 中：P0 已顶到 2 周期上限，P1 还带 ChatPanel 改动 | 高：验收标准细，但 P0 内混入了越界动作（AI 回答） | **并其「IPC 契约一次冻结」与导出条款**；AI 回答降 P2 |
| **cand-exp**（体验与前瞻） | 闭环 + 体验基线（时延/可靠性/键盘/搜索/撤销） | P0 1.5–2 周期 + P1 ≈1.5 周期 | 高：P1 六项（去重/撤销/搜索/备注/键盘/空态）真机验收重，整体 3 周期 | 高：验收最细，但含大量需要指针/键盘真机判定的项 | **并其存储契约、落页时序契约、导出位置与反馈细节**；P1 只留两项 |

### 2.2 结论（直接）

- **选 cand-min 作为 P0 主干**：它的收敛度是本轮最需要的——P0 四条同批交付、单文件存储、主进程唯一写者、不重构 reader-store。它的风险清单也最贴近真实故障面（半写、跨文档丢页、路径身份分裂）。
- **唯一上修：把「一键导出 Markdown」从 cand-min 的 P2 升入 P0**。理由：本轮主路径写死了「外带」这一环（`摘录 → 面板 → 回跳 → 导出`），导出是「阅读资产」的对外证据；成本仅 0.2 周期（主进程纯函数 + 一个按钮），且数据模型不变、不引入新交互状态，不构成 P0 失控风险。
- **只从 cand-exp 并四条，其余全部推后**：
  1. **面板位置改到左栏双标签**（`资料库 | 笔记 N`），而不是挤进阅读区右侧。理由：阅读区宽度是主路径资源（已有一个知识地图槽在抢宽度，再加一栏会触发第二套宽度守卫）；笔记是工作区级资产，放左栏与「资料库」同级语义正确。
  2. **摘录结果在浮层原位反馈**（`已摘录 · 第 N 页`），不做全局 toast：反馈位置贴着用户刚做的动作，成本更低，不新增浮层基础设施。
  3. **落页走 reader-store 的消费式意图**（`pendingJump`，`openDocument` 不清除），而不是让 `WorkspacePage` 监听 `pageCount > 0` 再写 `gotoPage`。理由：`PdfViewer.loadPdf()` 在加载完成后会执行 `scrollToPage(1)`，外部观察者写 `gotoPage` 与这两步存在真实竞态（表现为「文档打开了，停在第一页」）。
  4. **导出目标为稳定路径 `.pix-read/notes.md`（全量覆盖）**，而不是 `exports/notes-<时间戳>.md`：一个可外带的产物、不产生目录垃圾、重复导出幂等；`notes.json` 是唯一事实源，导出文件首行标注「由 PiX-Read 生成，每次导出覆盖」。
- **从 cand-full 并三条**：
  1. **IPC 契约一次冻结**：`notes-load / add / update / delete / export` 五条随 cand-full 并入，另加 `notes-reset`（P1 损坏逃生口，见 N25）共六条，在 A 周期一次交付；P1 的备注编辑复用 `notes-update`，不改契约、不返工。
  2. **主进程回传权威全量列表**，渲染层不做乐观合并（与 cand-min 一致，写死）。
  3. 导出的禁用条件与中文失败提示、以及「不做非 PDF 摘录 / 不做导入 / 不做导出范围选择」的反需求条目。
- **砍掉（写清理由）**：
  - cand-exp N22 删除撤销（5s）→ **P2**：删除已有二次确认；撤销需要主进程恢复语义 + 渲染缓冲，收益边际。
  - cand-exp N23 面板内搜索 → **P2**：本轮笔记量级小（单篇论文个位数条），搜索在有真实数据量之后再加。
  - cand-exp N25 全流程键盘 + `E` 快捷键 → **P2**：键盘可达需要与阅读器全局键位（PgUp/PgDn/`/`/`Esc`）逐条做 `stopPropagation` 与焦点守卫，真机验收成本最高，与「先闭环」冲突。
  - cand-exp N21 去重的「查看」联动 → **降级为 P1 简化版**：主进程识别重复并返回 `duplicateOf`，浮层显示「已在笔记中」，不做滚动定位与脉冲高亮。
  - cand-full N22 AI 回答存为笔记 → **P2**：唯一会改 `ChatPanel.vue` 的项，且主路径只要求段落摘录；本轮只冻结 `kind` 字段，将来零迁移。
  - cand-full N24 摘录后 1.2s 内「加备注」入口 → **P2**：时序 + 焦点跳转复杂度不划算；P1 的行内备注编辑已覆盖同一需求。
  - cand-exp 的「左栏折叠时自动展开并切到笔记标签」→ **P2**：需要新增跨组件 seam 状态，收益低。
  - cand-exp 的小节折叠/排序切换/统计行 → **不做**（非目标，见 §6）。

### 2.3 分层定稿

| 层 | 需求 | 规模 | 交付门 |
| --- | --- | --- | --- |
| **P0** | N17 摘录、N18 持久化、N19 面板、N20 跳回、N21 导出（2 个开发周期：A 数据面 → B UI 面） | 2 周期 | 闭环可演示 + `npm run check` 0 error |
| **P1** | N22 备注编辑、N23 重复摘录识别、N24 仅看当前文档、N25 损坏逃生口、文档/`.gitignore` 收尾 | ≈0.5 周期 | 本轮尽量完成；未完成不阻塞 P0 验收 |
| **P2** | §7 扩展点 + §5.3 延后清单（AI 回答入库、撤销、搜索、键盘、复制、统计行） | 下一轮 | 本轮只冻结契约，不写代码 |

---

## 3. 核心用户旅程

### 3.1 主路径（P0 必须闭环）

打开资料库 → 打开论文 → 选中第 5 页一段文字 → 浮层点「摘录」→ 浮层原位提示「已摘录 · 第 5 页」→ 读到第 40 页，共摘 6 条 → 左栏切到「笔记」标签，按文档分组看到 6 条 → 点第 5 页那条 → 阅读区回到第 5 页原文 → 面板头部点「导出 Markdown」→ `.pix-read/notes.md` 生成 →「在文件夹中显示」定位文件。

### 3.2 二次进入

关闭应用 → 重新打开同一资料库 → 笔记条数、页码、原文与关闭前一致（数据来自 `.pix-read/notes.json`）。

### 3.3 跨文档回跳

在文档 B 打开时点击文档 A 的笔记 → 阅读区打开 A 并**直接落在目标页**（不得停在第 1 页）→ 面板保持打开，可继续点下一条。

### 3.4 失败路径（必须可见、不静默）

- 未选择资料库根 / 写盘失败 → 浮层提示「摘录失败」，不留半条数据。
- `notes.json` 被外部改坏 → 面板显示「笔记文件无法读取」+ 原因 + 「在文件夹中显示」+「重试」，任何写操作返回失败且原文件字节不变。
- 笔记目标的文档被移动/删除 → 阅读区走既有中文失败态；该次跳转意图被丢弃，之后打开其它文档不被旧跳转劫持。

### 3.5 反例（本轮明确不做的事）

不在对话里存 AI 结论、不做笔记搜索、不做标签/双链、不把笔记注入 agent 上下文（只留 seam）、非 PDF 文档不出摘录入口。

---

## 4. 需求明细

> 每条包含：一句话 / 用户可见行为 / 验收标准（QA 逐条判定）/ 涉及文件 / 数据落盘。
> 统一约束：UI 文案中文；禁止 `any`；全部顶层 import；Vuetify 用法先查 `vuetify_guide/`。

### N17 选区一键摘录（P0）

- **一句话**：PDF 文字层选中的文字，一次点击变成一条带文档与页码的笔记。
- **用户可见行为**：PDF 选区浮层由「问 AI」扩展为「问 AI｜摘录」；点「摘录」后浮层**原位**变为「已摘录 · 第 N 页」，约 2.5s 后恢复；选中内容不因点击而丢失（沿用 `@pointerdown.prevent`）。Markdown/文本预览里只有「问 AI」。不弹对话框、不打断阅读。
- **验收标准**：
  1. 打开 PDF，在第 5 页选中一段文字 → 浮层出现「摘录」；点击后提示「已摘录 · 第 5 页」，提示页码与所选文字所在页一致。
  2. **页码必须来自选区锚点所在的 `[data-page]` 页节点**（锚点祖先解析，失败时按选区矩形命中的页节点回退，跨页选择取起始页）；构造「滚动标记页 ≠ 选中页」场景（选中第 5 页文字但阅读器当前页指示为第 6 页）时，笔记页码仍为 5。
  3. 页码无法解析时不显示「摘录」按钮（只留「问 AI」），不出现可点击但必然失败的入口。
  4. 写入后 `.pix-read/notes.json` 新增 1 条：`docPath` 为相对工作区根的正斜杠路径、`page=5`、`text` 与所选文字一致（仅做空白归一化）。
  5. 连续快速摘录 3 段 → 文件含 3 条、`id` 互不相同、无丢写。
  6. 选 1 个字符或空选区 → 不出浮层；文本预览中选中文字 → 只有「问 AI」。
  7. 主进程写入失败（无资料库根 / 目录不可写）→ 浮层显示「摘录失败」（可附简短原因），不产生半条数据、不出现「看着成功、重启丢失」。
- **涉及文件**：`pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`（改）、`pix/src/renderer/utils/note-capture.ts`（新建，选区→页码/原文的纯函数）、`pix/src/renderer/stores/notes-store.ts`（新建，见 N18）。
- **数据落盘**：经由 N18，写入 `<工作区根>/.pix-read/notes.json`。

### N18 笔记本地持久化与 IPC 契约（P0，契约一次冻结）

- **一句话**：笔记单文件落在工作区 `.pix-read/notes.json`；主进程是唯一写者，同步读-改-写 + 临时文件原子替换；文件损坏只报错、绝不覆盖。
- **用户可见行为**：重启后笔记仍在；文件被外部改坏时面板显示错误态且任何写操作都不覆盖原文件。
- **IPC 通道（一次冻结，六条）**：
  - `notes-load` → `{ success, notes, filePath, error?, code? }`
  - `notes-add`（草稿：文档绝对路径 + 页码 + 原文）→ `{ success, notes, note?, duplicateOf?, error? }`
  - `notes-update`（id + 备注）→ `{ success, notes, error? }`
  - `notes-delete`（id）→ `{ success, notes, error? }`
  - `notes-export` → `{ success, filePath, count, error? }`
  - `notes-reset` → `{ success, notes, backupPath?, error? }`（仅损坏文件的显式重建，见 N25；无损坏时返回失败）
  - 变更类通道都返回**最新全量列表**；渲染层不传任何存储路径（路径一律由主进程从 `getLibraryRoot()` 派生），不做乐观合并。
  - 「冻结」的含义：**六条通道的名称、入参、返回结构在 A 周期一次交付**，后续（P1/P2）只新增 UI 消费，不再改契约、不再由 B 改主进程。
- **验收标准**：
  1. 摘录后 `<工作区根>/.pix-read/notes.json` 存在且可被 `node -e "JSON.parse(...)"` 解析；结构为 `{ version: 1, notes: [...] }`。
  2. 关闭应用重启（或回首页后重开同一工作区）→ 面板条目与关闭前一致（条数、页码、原文、备注）。
  3. 手工把文件改成非法 JSON → `notes-load` 返回失败码，面板显示「笔记文件无法读取」；此时执行摘录/删除/导出全部返回失败，且**原文件字节不变**。
  4. 顶层结构不合法（`notes` 非数组）、任一条目缺必需字段、或 `version !== 1`（含版本过新）同样按「损坏」处理：报错、不覆盖、不静默降级为空库。
  5. 删除整个 `.pix-read` 目录后再摘录 → 目录与文件自动重建，无报错。
  6. 工作区 A 摘录后切到工作区 B → B 的面板为空，且 B 中不出现 A 的笔记；A 的文件未被改动。
  7. 单条原文上限 4000 字符，超出则**拒绝保存**并提示「选中内容过长（超过 4000 字），请分段摘录」（不做静默截断）。
  8. 写入协议：先写 `notes.json.tmp` 再 `rename` 覆盖；写入失败时原文件不动、临时文件被清理。
  9. 资料库文件树不显示 `.pix-read`（既有点开头目录跳过规则的回归项，不改 library 代码）。
- **涉及文件**：`pix/src/shared/types.ts`（改：类型）、`pix/src/main/notes-store.ts`（新建）、`pix/src/main/ipc-handlers.ts`（改：6 个 handler + 入参守卫）、`pix/src/main/preload.ts`（改：`PixApi` 加 6 个方法）、`pix/src/renderer/stores/notes-store.ts`（新建）、`pix/src/renderer/utils/notes-path.ts`（新建：相对/绝对路径换算、分组键、显示名）。
- **数据落盘**：`<工作区根>/.pix-read/notes.json`（详见 §8）。

### N19 笔记面板（左栏「笔记」标签，按文档分组）（P0）

- **一句话**：左栏 pill 增加「资料库｜笔记 N」双标签；笔记标签下按文档分组集中查看、可删除。
- **用户可见行为**：左栏 pill 变为两个标签（笔记标签带总条数；0 条时不显示数字）；笔记面板自上而下为：头部（条数 + 「导出 Markdown」+ P1 的「仅看当前文档」开关）、文档分组（组头 = 文档相对路径 + 条数，当前文档组置顶，其余按路径升序）、条目（页码徽标「第 N 页」、原文默认 3 行截断可展开、备注（若有）、相对时间、删除按钮）。切回「资料库」标签时文件树的展开状态保留（组件不卸载）。
- **验收标准**：
  1. 两个文档各摘 2 条 → 笔记面板出现 2 个分组，组头标题为文档相对路径、条数正确；组内按页码升序（同页按创建时间升序）。
  2. 笔记标签计数随摘录即时 +1；切到「资料库」再切回，计数与列表仍正确、文件树展开状态未丢。
  3. 无笔记 → 空态三要素：图标 + 主文案「还没有摘录」+ 指引「在 PDF 中选中文字，点「摘录」保存到这里」。
  4. 读取失败 → 显示错误态（与空态明确区分）：中文原因 + 「在文件夹中显示」+「重试」。
  5. 删除：第一次点击进入待确认（3s 内二次点击才执行，超时复位），确认后条目消失且 `notes.json` 同步；点其它位置取消待确认。
  6. 长原文在卡片内截断展示、可展开查看全文（不改动数据）。
  7. 只切读区不动：打开/关闭笔记面板不改变阅读区页码、缩放与滚动位置。
- **涉及文件**：`pix/src/renderer/components/workspace/NotesPanel.vue`（新建）、`pix/src/renderer/pages/WorkspacePage.vue`（改：pill 双标签 + `v-show` 切换 + 进工作区 load / 返回首页 reset）、`pix/src/renderer/stores/notes-store.ts`（新建）。
- **数据落盘**：只读 `notes.json`；删除走 `notes-delete`。

### N20 点击笔记跳回原文页（P0，含跨文档时序）

- **一句话**：点击笔记条目回到它被摘下来的那一页；来源不是当前文档时先打开该文档再落页。
- **用户可见行为**：点条目（删除按钮除外）→ 阅读区滚到第 N 页，底部页码指示器显示「第 N 页」；跨文档时阅读区切换文档并落在目标页，不停在第 1 页；面板保持打开，可连续跳多条。
- **实现契约（写死，避免返工）**：`reader-store` 增加消费式意图
  - `pendingJump: { filePath: string; page: number } | null`
  - `requestJump(filePath, page)`：目标是当前已加载文档（路径匹配且 `pageCount > 0`）→ 直接写既有 `gotoPage`；否则写 `pendingJump`。
  - `takePendingJump(filePath)`：`PdfViewer` 在文档加载成功、页节点建立后调用；路径匹配则清除并返回页码，否则返回 `null`。
  - `openDocument(path)`：路径与 `pendingJump.filePath` 不匹配、或 `path === null` 时清除 `pendingJump`（防止旧意图劫持后续打开）。
  - `PdfViewer.loadPdf()` 中的固定 `scrollToPage(1)` 改为：优先消费 `takePendingJump(props.filePath)` 落目标页，否则落第 1 页；加载失败路径清除 `pendingJump`。
- **验收标准**：
  1. 当前文档第 3 页的笔记 → 点击后页码指示器为「第 3 页」。
  2. 在第 12 页时点同文档第 5 页的笔记 → 回到第 5 页（可上跳）。
  3. 打开文档 B 时点文档 A 的笔记 → 阅读区打开 A 且落在目标页（不停在第 1 页）；A 数据加载中点击第二条不同页的笔记，最终停在最后一条的页码。
  4. 未打开任何文档时点条目 → 阅读区打开目标 PDF 并落页。
  5. 目标文件已被移动/删除 → 阅读区显示既有中文失败态；该跳转意图被丢弃（清除），随后打开其它文档不被劫持。
  6. 目标不是 PDF（被改名/替换）→ 以文本预览打开，不报错、不误跳。
- **涉及文件**：`pix/src/renderer/stores/reader-store.ts`（改：仅新增 `pendingJump` / `requestJump` / `takePendingJump`，不改既有字段语义）、`pix/src/renderer/components/workspace/PdfViewer.vue`（改：消费落页 + 失败清除）、`pix/src/renderer/components/workspace/NotesPanel.vue`（新建）、`pix/src/renderer/pages/WorkspacePage.vue`（改：跳转入口，先 `requestJump` 再切 `selectedFilePath`）。
- **数据落盘**：无（只读笔记数据）。

### N21 一键导出 Markdown 到工作区（P0）

- **一句话**：面板头部一键把当前工作区全部笔记导出为按文档分组的 Markdown，落到 `.pix-read/notes.md`。
- **用户可见行为**：点「导出 Markdown」→ 面板内出现一行结果：「已导出 N 条 → .pix-read/notes.md」+「在文件夹中显示」；`notes.json` 不被修改。
- **验收标准**：
  1. 有笔记时导出 → `<工作区根>/.pix-read/notes.md` 生成；按文档分组（组标题含文档相对路径与条数），每条含页码、原文（blockquote）、备注（若有）；无备注不输出备注行。
  2. 多次导出为覆盖同一文件（幂等），不产生新文件、不追加重复段落。
  3. 0 条笔记时按钮禁用（文案「暂无笔记」）；主进程侧同样拒绝并返回中文原因。
  4. 导出失败（目录不可写 / 笔记文件损坏）→ 中文错误提示，不静默、不留半个文件（tmp + rename）。
  5. 导出前后 `notes.json` 字节内容不变。
  6. 文件头包含来源与生成声明：「由 PiX-Read 导出生成，每次导出都会覆盖」+ 资料库名 + 时间 + 条数。
  7. 「在文件夹中显示」调用既有 `libraryShowInFolder` 且能定位到该文件（`.pix-read` 为隐藏目录，资料库树不显示它，此入口是唯一可发现路径）。
- **涉及文件**：`pix/src/main/notes-store.ts`（新建，含 Markdown 渲染）、`pix/src/main/ipc-handlers.ts`、`pix/src/main/preload.ts`、`pix/src/shared/types.ts`、`pix/src/renderer/components/workspace/NotesPanel.vue`。
- **数据落盘**：`<工作区根>/.pix-read/notes.md`（产物，全量覆盖，非事实源）。

### N22 备注编辑（P1）

- **一句话**：摘录之后可以补一句自己的话；备注参与导出。
- **用户可见行为**：条目上「添加备注 / 编辑备注」→ 行内多行输入 → 「保存 / 取消」；空备注显示占位文案；保存失败给出中文错误并保留输入内容（不吞输入、不出现「面板已改、文件没改」）。
- **验收标准**：
  1. 保存后备注在面板与 `notes.json` 一致（`comment` 更新、`updatedAt` 变化），重启仍在。
  2. 取消不写盘；清空备注为合法操作。
  3. 保存失败 → 面板回滚原值并提示原因，输入内容不丢失。
  4. 备注出现在导出 Markdown 中；无备注的条目不输出备注行。
- **涉及文件**：`pix/src/renderer/components/workspace/NotesPanel.vue`、`pix/src/renderer/stores/notes-store.ts`（复用 `notes-update`，不改契约）。
- **数据落盘**：`notes.json` 中该条的 `comment` / `updatedAt`（原子写，走既有协议）。

### N23 重复摘录识别（P1，简化版）

- **一句话**：同一段话摘两次不会变成两条。
- **用户可见行为**：同一「文档 + 页 + 归一化原文」再次摘录 → 不新增，浮层显示「已在笔记中」（2.5s 后恢复）。
- **验收标准**：
  1. 连续两次摘录同一段 → 计数只 +1，`notes.json` 仅一条；判定在主进程完成（渲染层只展示结果），连点下也只可能有一条。
  2. 归一化规则：折叠连续空白（含换行）为单个空格、去首尾；不改大小写、不改汉字。
  3. 同一段文字在相邻两页分别摘录视为两条（页码是键的一部分）。
  4. 去重键的比较用归一化后的文档相对路径（大小写不敏感）。
- **涉及文件**：`pix/src/main/notes-store.ts`（去重键与 `duplicateOf`）、`pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`（结果文案）。
- **数据落盘**：不新增条目（去重在写盘前完成）。

### N24 面板「仅看当前文档」与当前文档标记（P1）

- **一句话**：笔记多了也能只看当前这篇。
- **用户可见行为**：面板头部开关「仅看当前文档」；当前文档所在组头带「当前文档」标记；关闭开关恢复全部；切文档后标记跟随；0 条时不显示计数数字。
- **验收标准**：开关打开只剩当前文档组；关闭恢复；当前文档标记随 `selectedFilePath` 变化；无打开文档时开关禁用或该组不存在。
- **涉及文件**：`pix/src/renderer/components/workspace/NotesPanel.vue`、`pix/src/renderer/pages/WorkspacePage.vue`（传入当前文档路径）、`pix/src/renderer/stores/notes-store.ts`（可选过滤计算）。
- **数据落盘**：无（纯视图状态，开关不持久化）。

### N25 损坏文件逃生口（P1）

- **一句话**：文件坏了也给出用户可自己决定的出口，而不是让功能永久不可用。
- **用户可见行为**：错误态额外提供「备份原文件并新建空库」；点击后原文件改名为 `notes.json.corrupt-<yyyyMMdd-HHmmss>`（同目录保留证据），随后以空库继续，面板回到空态并提示已备份。
- **实现契约**：`notes-reset` 通道（A 周期随契约交付，UI 在 B 周期作为 P1 接入）。
- **验收标准**：仅用户显式点击才重建；备份文件确实存在于 `.pix-read/` 且内容为原始字节；重建后摘录/导出可用；不做任何自动重建；文件未损坏时该通道拒绝执行（返回失败，不做多余改名）。
- **涉及文件**：`pix/src/renderer/components/workspace/NotesPanel.vue`（错误态按钮，P1）、`pix/src/renderer/stores/notes-store.ts`（`recoverCorruptNotes()` 动作）。主进程侧已在 A 周期完成（`notes-reset`）。

### P2 清单（本轮不实现，见 §5.3 与 §7）

AI 回答存为笔记（`kind=answer`，唯一会改 `ChatPanel.vue` 的项）、删除撤销（5s）、面板内搜索、全流程键盘可达与 `E` 快捷键摘录、摘录后「加备注」快速入口与「查看」联动、单条复制为 Markdown、存储统计行、分组折叠与排序切换。

---

## 5. 分层与规模

### 5.1 P0（不可裁）

| 需求 | 不可裁的理由 |
| --- | --- |
| N17 摘录 | 没有入口就没有数据。 |
| N18 持久化 + IPC 契约 | 「资产」的定义就是可积累、重启不丢；契约一次冻结，P1/P2 全部复用，后补必返工。 |
| N19 面板 | 只摘不看不回 = 又一堆死数据。 |
| N20 跳回原文 | 「阅读资产」区别于「外部笔记软件」的唯一硬能力。 |
| N21 导出 | 主路径明确要求「外带」闭环，且是资产可被带走的证据；成本 0.2 周期、无交互状态。 |

**P0 规模**：新建 4 文件（`main/notes-store.ts`、`renderer/stores/notes-store.ts`、`renderer/utils/notes-path.ts`、`renderer/utils/note-capture.ts`）+ 新建组件 1（`NotesPanel.vue`）+ 修改 7 文件（`shared/types.ts`、`ipc-handlers.ts`、`preload.ts`、`reader-store.ts`、`PdfViewer.vue`、`PdfSelectionQuickAsk.vue`、`WorkspacePage.vue`）。与 R4（删红笔 + 新框选）同量级。

**为什么两个周期够**：A（数据面）与 B（UI 面）文件集几乎不相交；A 冻结 `shared/types.ts` + 六条通道（含只被 P1 消费的 `notes-reset`）后 B 才开始，B 只消费 API。

### 5.2 P1（本轮尽量完成）

N22 备注编辑（0.2）、N23 重复摘录识别（0.15）、N24 仅看当前文档（0.1）、N25 损坏逃生口（0.15）、文档与 `.gitignore` 收尾（0.05），合计 ≈0.65 周期，集中在 B 的文件集内（避免并发改同一文件）。**若 B 的周期尾余量不足，按 N22 → N23 → N24 → N25 顺序保前两项，其余顺延，不阻塞 P0 验收。**

### 5.3 被降到 P1/P2 的需求与理由（P0 不失控）

| 原始归属 | 现状 | 降级理由 |
| --- | --- | --- |
| cand-exp N22 删除撤销（P1） | P2 | 需要主进程恢复语义 + 渲染缓冲 + 时序测试，收益低于 5s 二次确认已给的安全感。 |
| cand-exp N23 面板搜索（P1） | P2 | 单篇论文笔记量级为个位数，搜索要有真实数据量才值钱。 |
| cand-exp N25 键盘可达 + `E`（P1） | P2 | 需要与阅读器全局键位逐条守卫 + 真机验收，成本最高、闭环无关。 |
| cand-full N22 AI 回答入库（P1） | P2（只冻结 `kind`） | 唯一触达会话发送/展示链路的项，本轮冻结格式即可保证将来零迁移。 |
| cand-full N24 摘录后加备注（P1） | P2 | 时序 + 跨面板焦点跳转，与 N22 行内编辑重复。 |
| cand-exp N27/N28/N29（P2） | 单项延后 / 不做 | 折叠与排序切换非目标；统计行可由导出结果文案替代。 |

---

## 6. 明确不做（反需求，写死）

**产品层（本轮与整个 V0.3 第一轮都不做）**

1. 云同步、多设备、任何远端存储；笔记只属于当前工作区 `.pix-read/`，不做跨工作区聚合。
2. 标签体系、双向链接、笔记关系图、复习/间隔重复。
3. LLM 自动摘要、自动生成/补全笔记、自动划重点；所有笔记都来自用户显式动作。
4. 富文本编辑器；备注为纯文本（不渲染 Markdown）。
5. 笔记内嵌页面截图；框选截图能力本轮不接入笔记。
6. 暗色主题（全局非目标，另议）。
7. 论文下载、元数据抓取、多标签、多文档对比、LLM 生成知识地图、多色笔。
8. 非 PDF（Markdown/文本预览）的摘录：没有页码概念，不引入第二套定位模型。
9. 笔记导入；导出 HTML/JSON/Anki/PDF；导出到工作区之外的目录；导出范围选择（全部/单文档）。
10. 面板内搜索、批量选择与批量删除、排序切换、分组折叠；首页/全局笔记总览。
11. 监听 `notes.json` 的外部改动并实时刷新（只在进工作区、打开面板、保存、删除、导出时读写）。
12. 笔记全文搜索、快捷键（`Ctrl+Shift+N` 等）、摘录音效与动画。

**工程层（红线）**

1. **本轮绝不触碰 `packages/*`**（pi-agent-core / pi-coding-agent / pi-ai / mcp-adapter）。
2. 不改 `ChatPanel.vue`（发送链路）、`reading-prompt.ts`、`resources/skills/**`：笔记不进 agent 上下文，agent 语义不变。
3. 不新增依赖、不动 `package.json` / lockfile。
4. 禁止 `any`；禁止内联动态 import（`await import()` / `import("x").T` / 动态类型导入），全部顶层 import。
5. 不运行 `npm run build` / `npm test` / `npm run package` / `npm run dev`；不执行任何 git 写命令。
6. UI 文案中文；注释只写约束不写流水账；风格向同文件看齐；Vuetify 用法先查 `vuetify_guide/`。
7. 不做向后兼容的旧格式兼容层（本格式是全新的，没有历史数据）。

---

## 7. 仅预留不实现的扩展点（只留 seam，不写 stub）

仓库约定禁止死代码，因此「预留」= **冻结数据契约 + 记录接入位置**，不新增未使用的类型/函数。

| 扩展点 | 本轮冻结什么（已实现） | 将来接什么（本轮不写） |
| --- | --- | --- |
| 笔记作为 agent 上下文注入源 | `ReaderNote` 带稳定 `id` + 文档相对路径 + 页码 + 原文 + 备注；主进程有可复用的「按文档读取」内部函数 | `reading-context.ts` 的 `ReadingSendContext` 增 `notes` 字段 + composer 增一个可移除的「笔记」chip；聊天发送前必须显式带上，绝不静默注入 |
| 基于笔记的复习/追问 | 每条笔记自带定位三要素（文档/页码/原文） | 面板行内「追问」动作，复用 `useQuickAsk` 同款 module-level seam |
| 笔记与知识地图联动 | 跳页统一走 reader-store 落页通道（`gotoPage` / `pendingJump`），地图与笔记共用 | `KnowledgeMap.vue` 节点显示「本章 N 条笔记」；本轮零改动 |
| AI 结论入库 | `kind: "excerpt" \| "answer"` 字段与读取容错 | `ChatPanel.vue` 回答气泡「存为笔记」；导出中「AI 回答」小节 |
| 备份/恢复 | 损坏文件逃生口（N25）产出 `notes.json.corrupt-<时间戳>` | 面板内「从备份恢复」；本轮不做 |

**允许写什么**：数据契约、类型、以及为将来复用而自然存在的内部函数。
**禁止写什么**：未调用的导出函数、未使用的字段读写分支、占位组件、注释掉的代码。

---

## 8. 数据落盘与存储契约（写死）

### 8.1 位置

| 路径 | 性质 |
| --- | --- |
| `<工作区根>/.pix-read/notes.json` | **唯一事实源**，随工作区走；不进 `%APPDATA%`，不进会话目录 |
| `<工作区根>/.pix-read/notes.md` | 导出产物（全量覆盖），非事实源 |
| `<工作区根>/.pix-read/notes.json.tmp` | 写入中间态，rename 后不应残留 |
| `<工作区根>/.pix-read/notes.json.corrupt-<yyyyMMdd-HHmmss>` | 损坏逃生口备份（仅 N25 显式触发时产生） |

`<工作区根>` = 主进程 `getLibraryRoot()`（会话启动时设置）。路径不来自渲染层，渲染层只拿结果里的绝对路径用于展示与「在文件夹中显示」。`.pix-read` 为点开头目录，既有 `listLibraryChildren` 的 `entry.name.startsWith(".")` 规则已跳过，资料库树不显示（本轮不改该代码，仅作回归核对）。

### 8.2 文件格式（version 1）

```json
{
  "version": 1,
  "notes": [
    {
      "id": "b1f3c0a2-5e6d-4c8f-9a1b-0d2e3f4a5b6c",
      "kind": "excerpt",
      "docPath": "papers/attention.pdf",
      "page": 5,
      "text": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.",
      "comment": "",
      "createdAt": 1757860000000,
      "updatedAt": 1757860000000
    }
  ]
}
```

- `docPath`：相对工作区根、**正斜杠**、保留原始大小写（工作区整体移动后仍可解析；显示名由它派生，不额外存文件名）。
- `kind`：`"excerpt"`（本轮唯一产出）｜`"answer"`（读取须容忍，本轮不产出）。
- `page`：1-based 整数。
- `text`：归一化后的原文（去首尾 + 连续空白折叠为单空格），≤ 4000 字符，超限拒绝保存。
- `comment`：字符串，默认 `""`（P1 可编辑）。
- 时间戳：毫秒整数。

### 8.3 写入协议

- 主进程是**唯一写者**；读-改-写全部使用**同步 fs**（主进程单线程 + 同步调用即天然串行，不需要额外写队列；异步 fs 才需要队列，因此不用异步）。
- 每次变更：读取 → 校验 → 内存修改 → 写 `notes.json.tmp`（`utf-8`）→ `renameSync` 覆盖 → 返回全量列表。
- 变更类通道返回最新全量；渲染层以返回值覆盖本地状态，不做乐观合并。
- 目录不存在时先 `mkdirSync(dir, { recursive: true })`。
- 写入失败：清理 tmp，原文件不动，返回中文错误；不允许出现「半条数据」或「截断文件」。

### 8.4 读取与损坏兜底

| 情况 | 行为 |
| --- | --- |
| 文件不存在 | 视为空库 `{ version: 1, notes: [] }`；不立即写盘，首次成功保存时创建 |
| JSON 解析失败 | 损坏：报错、**绝不覆盖、绝不部分回写**；`notes-load` 返回失败码 + 中文原因 + 绝对路径 |
| 顶层结构不合法（`notes` 非数组 / 非对象） | 同上 |
| 任一条目缺必需字段 / 类型不符 | 同上（宁可报错，不静默丢条目、不改写文件） |
| `version !== 1` | 「笔记文件版本不支持」错误，同上不覆盖 |
| 损坏状态下的写操作（add/update/delete/export） | 一律返回失败 + 中文原因，不改文件 |
| 用户显式点「备份原文件并新建空库」（N25 / `notes-reset`） | 原文件改名 `notes.json.corrupt-<时间戳>` 后以空库继续；文件未损坏时拒绝执行 |

**设计取舍（写清，防反复）**：不做「自动备份并静默重建」。理由：静默空库与「笔记丢了」在用户视角无法区分，而笔记是用户资产；本轮选择「报错 + 保留原文件 + 用户显式决策」的保守路径，把不可逆动作交给用户。

### 8.5 已知边界（记录，不处理）

`.pix-read/notes.json` 位于工作区内，agent 的 read/grep/find 工具天然能读到它。本轮**不注入、也不刻意隐藏**：纯文本资产可被读取是特性。若将来出现上下文噪声，再按「注入开关（默认关）」或「把 `.pix-read` 排除出工具搜索范围」二选一处理。

---

## 9. 工程约束（对开发子代理生效）

1. `cd pix && npm run check` 必须 0 error（vue-tsc + 主进程 tsc + preload tsc）；这是唯一验收命令。
2. 禁止 `any`；禁止内联动态 import；顶层 import；不新增依赖、不动 lockfile。
3. UI 文案中文；注释只写约束不写流水账；风格向同文件看齐；Vuetify 用法先查仓库根 `vuetify_guide/`。
4. 不运行 `npm run build` / `npm test` / `npm run package` / `npm run dev`；不执行任何 git 写命令（`git status/diff` 只读可用）。
5. 大范围改动前必须完整读文件；只改本条 PRD 列出的文件，超出范围先回报。
6. 主进程新增通道必须有入参校验与中文错误；渲染层失败路径不静默。
7. 不做向后兼容层；不写未使用的代码（seam 见 §7）。
8. 文档更新只动 `README.md`（功能一行）与 `docs/pm/DEV-R5*.md`；不改其它文档。

---

## 10. 给开发子代理的边界与交付物

### 10.1 子代理 A（周期 1：数据面 + 契约冻结）

**范围（只改这些文件）**
- `pix/src/shared/types.ts`：`ReaderNoteKind` / `ReaderNote` / `ReaderNoteDraft` / `ReaderNotesFile` / `ReaderNotesLoadResult` / `ReaderNotesMutationResult` / `ReaderNotesExportResult` / 错误码联合类型。
- `pix/src/main/notes-store.ts`（新建）：`loadNotes` / `addNote` / `updateNoteComment` / `deleteNote` / `exportNotesMarkdown` / `resetCorruptNotes`；内部含路径派生、严格校验、归一化、去重键、原子写、Markdown 渲染。不 import electron（只用 `fs`/`path`/`crypto` + `library-root`）。
- `pix/src/main/ipc-handlers.ts`：6 个 handler（`notes-load/add/update/delete/export/reset`）+ 入参类型守卫函数。
- `pix/src/main/preload.ts`：`PixApi` 加 6 个方法（类型来自 shared，顶层 import，无 `any`）。
- `pix/src/renderer/stores/notes-store.ts`（新建）：`notes/status/errorMessage/notesFilePath` 状态，`loadNotes/addNote/updateNoteComment/removeNote/exportMarkdown/recoverCorruptNotes/resetNotes` 动作，`groups/totalCount` 计算；以主进程返回的全量列表覆盖本地。
- `pix/src/renderer/utils/notes-path.ts`（新建）：相对/绝对路径换算、分组键（小写 + 正斜杠，与 `project-store.normalizePath` 同约定）、显示名。
- `pix/src/main/library-root.ts` / `pix-paths.ts`：**不改**（笔记不进 `%APPDATA%`，复用既有根与越界守卫）。
- `docs/pm/DEV-R5a-notes.md`（新建，开发档）。

**交付门**：`cd pix && npm run check` 0 error；契约（类型 + 通道名 + 返回结构）与本 PRD §4/§8 完全一致；不得在渲染层拼接存储路径。
**不做**：任何 UI 组件改动（`NotesPanel.vue`/`PdfSelectionQuickAsk.vue`/`PdfViewer.vue`/`WorkspacePage.vue`/`reader-store.ts` 属 B）；ChatPanel；packages/*。

### 10.2 子代理 B（周期 2：UI 与交互）

**范围（只改这些文件）**
- `pix/src/renderer/utils/note-capture.ts`（新建）：选区 → 页码解析（`[data-page]` 祖先 + 矩形回退）、文档绝对路径、原文归一化预览。
- `pix/src/renderer/components/workspace/PdfSelectionQuickAsk.vue`（改）：双动作浮层 + 三态原位反馈（成功/重复/失败）；仅 PDF（`pageCount > 0`）且页码可解析时展示「摘录」。
- `pix/src/renderer/components/workspace/NotesPanel.vue`（新建）：头部（条数/导出/仅看当前文档）、分组列表、条目（页码徽标/原文截断展开/备注/时间/删除二次确认）、空态/错误态/加载态、导出结果行 + 「在文件夹中显示」。
- `pix/src/renderer/pages/WorkspacePage.vue`（改）：左栏 pill 双标签 + `v-show` 切换（保留文件树展开态）、进工作区 `loadNotes`、`goHome` 时 `resetNotes`、笔记跳转入口（先 `requestJump` 再切 `selectedFilePath`）。
- `pix/src/renderer/stores/reader-store.ts`（改）：仅新增 `pendingJump` / `requestJump` / `takePendingJump`，并在 `openDocument` 中按 §4 N20 的规则清理；不改既有字段语义。
- `pix/src/renderer/components/workspace/PdfViewer.vue`（改）：加载成功后消费 `takePendingJump` 替代固定 `scrollToPage(1)`；失败路径清除。
- `pix/src/renderer/components/workspace/ReaderPanel.vue` / `LibraryPanel.vue`：**预期不改**（如确需改动，先回报理由）。
- `.gitignore`（P1，仅加一行 `.pix-read/`）、`README.md`（P1：功能特性补一行）、`docs/pm/DEV-R5b-notes.md`（新建，开发档）。

**交付门**：`cd pix && npm run check` 0 error；P0 的 N17–N21 端到端可演示；无回归（文本预览无「摘录」、「问 AI」行为不变、资料库树与会话/聊天链路不受影响）。
**不做**：改 `packages/*`、`ChatPanel.vue`、`reading-prompt.ts`、`shared/types.ts` 契约之外的扩展；不加依赖。

### 10.3 顺序与交接

1. A 先交付并冻结契约（类型 + IPC + 渲染层数据层），B 以冻结契约为输入开工；B 不得自行改通道名或返回结构。
2. 若 B 发现契约不足（例如缺少必要字段），回退给 PM 决策，不在 B 内私改 `shared/types.ts` 的语义（可加字段，不可改既有字段含义）。
3. 任一子代理报告完成时，必须列出：改动文件清单、`npm run check` 结果、逐条验收标准的自评（P0 全部，P1 已完成的）、未验证事项。

---

## 11. 整体验收口径

### 11.1 工程门（硬）

1. `cd pix && npm run check` 0 error。
2. 无 `any`、无内联动态 import、无新增依赖、未运行 build/test/package、未执行 git 写命令。
3. `packages/*`、`ChatPanel.vue`、`reading-prompt.ts`、`resources/skills/**` 零改动（`git status`/`git diff` 只读核对）。

### 11.2 数据门

1. `notes.json` 结构为 `{ version: 1, notes: [...] }`，字段与 §8.2 一致，可用 node 解析核对。
2. 重启后一致；损坏文件不被覆盖；删除 `.pix-read` 后能重建。
3. 写操作原子：不出现截断文件与半条数据。

### 11.3 端到端门（P0）

选中 → 摘录 → 面板可见（按文档分组）→ 重启仍在 → 点击跳回（同文档/跨文档/冷启动三种时序）→ 导出 Markdown 到 `.pix-read/notes.md` → 「在文件夹中显示」可定位。

### 11.4 无回归门

文本预览无「摘录」按钮；「问 AI」与 composer chips 行为不变；资料库树不显示 `.pix-read`、展开状态在标签切换后保留；知识地图、会话管理、错误兜底块、框选截图链路不受影响。

### 11.5 验证方式

- 代码级：`npm run check` + `git diff`/`git status` 只读核对（子代理可执行）。
- 运行时：真机点击路径（PM/用户）；必要时用离屏截图（`app.commandLine.appendSwitch("disable-gpu")` + offscreen `BrowserWindow` + `capturePage().toPNG()`）核对面板三态渲染。

---

## 12. 风险与应对（Top 3）

1. **持久化一致性（最高）**：全量重写的 read-modify-write 若被并发或中断破坏，会得到截断文件而丢掉全部笔记；损坏文件若被后续写入覆盖则不可恢复。
   应对：主进程唯一写者 + 同步 fs（单线程内天然串行）+ tmp&rename 原子替换 + 严格校验 + 损坏只报错不覆盖；渲染层不做乐观合并；4000 字符上限抑制文件膨胀。判定：§11.2 与 N18 验收 1/3/4/8。
2. **跨文档回跳时序**：`openDocument()` 会重置阅读状态，`loadPdf()` 又会固定 `scrollToPage(1)`；外部观察 `pageCount > 0` 再写 `gotoPage` 存在真实竞态，表现为「文档打开了但停在第 1 页」。
   应对：reader-store 的消费式 `pendingJump`（`openDocument` 只在路径不匹配时清除）、`PdfViewer` 加载成功后消费、失败与离开目标文档即清除。判定：N20 验收 3/4/5。
3. **笔记身份不一致（分组分裂 / 串库）**：同一文档以不同路径形态入库（`\` 与 `/`、盘符大小写）会在面板裂成两组、跳转失配；渲染层缓存可能在切库后残留上一个工作区的数据。
   应对：主进程统一派生相对 POSIX 路径并做比较归一化；分组键与当前文档匹配统一走 `utils/notes-path.ts`；进工作区强制 `loadNotes`、`goHome`/切库 `resetNotes`；变更后以主进程返回的全量覆盖。判定：N18 验收 6、N19 验收 2。

---

## 13. 下一轮候选（本轮不做，仅登记）

- AI 结论入库（`kind=answer`）+ 导出中的「AI 回答」小节。
- 笔记作为 agent 上下文（composer chips 增加可移除的「笔记」chip，显式注入）。
- 面板内搜索 / 撤销删除 / 全流程键盘可达 / 单条复制为 Markdown。
- 笔记与知识地图联动（节点显示「本章 N 条笔记」）、基于笔记的追问与复习。
- 导出范围选择（当前文档 / 全部）、导出模板定制。
