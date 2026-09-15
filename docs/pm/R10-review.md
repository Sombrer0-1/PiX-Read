## 需求评审（R10）

> 评审对象：`docs/pm/R10-req.md`（N63–N72 与 §0 冻结契约）。方式：需求档逐条只读核对 + 真实代码只读走查（`pix/src/main/{notes-store,ipc-handlers,preload}.ts`、`pix/src/shared/types.ts`、`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/{NotesPanel,ChatPanel,KnowledgeMap}.vue`、`pix/src/renderer/utils/{notes-path,outline-notes}.ts`、`pix/scripts/ui-shot.mjs`），另加两处仓库外实测：①offscreen 窗口的剪贴板链路（Electron 33.4.11，脚本写在 `E:/tmp/pix-clip-probe*.mjs`，跑完即弃）；②Windows 写失败注入的三种手法（`E:/tmp` 下 node 脚本，跑完删除临时目录）。
> 结论：**revise**。must-fix 8 条（§2），改完才能进设计。主线本身成立：搜索/排序是纯视图状态、撤销是「内存槽 + 原下标插回 + 原子写」的真实反写、复制是只读操作，四处落点都在既有文件与既有范式内，无依赖、无存储格式变更、`types.ts` 零改动（`ReaderNotesMutationResult.note?` 已存在，`pix/src/shared/types.ts:392-399`）。阻塞集中在四处：**剪贴板判据在离屏取证面上结构性不可达**（实测：两条链路都失败）、**归一化 `query` 没有单一来源且与 N63-2 的禁止项冲突**、**撤销行的「最近一次刷新」时序与在途竞态未冻结**、**N64-3 空态矩阵末两步不可达**。

---

### 0. 已核对为真、设计阶段不得翻案的前提

1. **夹具与冻结文案逐字吻合**。`seedNotes()`（`ui-shot.mjs:290`）4 条：`n-current-1`（p1，备注「与第 3 节消融实验对照」）、`n-current-2`（p2，长文，首 12 字符 = `Table 2 repo`）、`n-current-3`（p2，`kind = answer`，正文含「稀疏注意力」）、`n-other-1`（`archive/older-paper.pdf` p7）。逐条复核 §0.1/N63-3/N63-4/N67-6 的样本：`TABLE 2` 仅命中 `n-current-2`；`消融` 仅命中 `n-current-1` 的备注；`消融 实验`（多一个空格）零命中；`稀疏注意力` 仅命中 `n-current-3`；`sample-paper.pdf`、`n-current-2`、`7` 在原文与备注上零命中（`n-other-1` 的正文是 `Section 4. Reproducibility: …`，页 7 不参与匹配）⇒ 这些判据都可判，且 `已删除「Table 2 repo…」· 第 2 页` 的切片算术成立。
2. **排序样本与冻结序一致**。`createdAt`：`n-current-3`(now−1m) > `n-current-2`(now−2m) > `n-current-1`(now−4m) > `n-other-1`(now−26h) ⇒ N65-4 的两种组内顺序可判（作用域问题见 must-fix 8）。
3. **撤销数据面可做到「字节回复」**。写盘唯一出口是 `serializeNotes`（`JSON.stringify(file, null, 2) + "\n"`，`pix/src/main/notes-store.ts:319/337/350`），读侧 `parseNotesFile` 保持键序 ⇒ 「原下标插回同一对象、不刷新 `updatedAt`」可得到与删除前逐字节相同的文件（含 `tmp`+`rename` 语义不变）。`ReaderNotesMutationResult.note?` 已存在、`isNoteId`（`ipc-handlers.ts:243`）与 `invalidNotesInput`（`:252`）可复用 ⇒ §0.5 的「不扩码表、`types.ts` 零改动」成立。
4. **槽语义可在既有函数体内落地**。`deleteNote`（`notes-store.ts:342`）今天是 `filter` + 单次写；主进程写读改全同步、无 `await` 的约束不因「记下标 + 设槽」而破。
5. **三维度落在既有结构上**。`groups`（`pix/src/renderer/stores/notes-store.ts:87`）是唯一派生管道；`countLabel`（`NotesPanel.vue:79`）与空态链（`:372` / `:376`）都在同一 computed/模板链上；R9 既有断言（`本章 2 条 / 共 4 条`，`ui-shot.mjs:4263` 附近）在「无查询」态下不受 §0.3 新优先级影响 ⇒ 计数与空态的插入不构成回归。
6. **取证原语够用**。搜索框是原生 `<input>` + v-model，`备注编辑` 已有「原生 setter + `new Event("input", { bubbles: true })`」先例（`ui-shot.mjs:2559`）；`notesHash()`（`:1955`）、`record/countOf/textOf/has/waitFor/capturePage` 与 `seedNotes` 足以承载新增断言。
7. **剪贴板链路实测结论（新事实，见 must-fix 1）**：`offscreen: true + show: false`（即 `ui-shot.mjs:4690-4706` 的窗口配置）下 `window.isSecureContext === true`、`navigator.clipboard` 存在，但 `document.hasFocus() === false` ⇒ `navigator.clipboard.writeText()` 抛 `NotAllowedError`、`document.execCommand("copy")` 返回 `false`、主进程 `clipboard.readText()` 恒为 `""`；改为 `win.show() + win.focus() + webContents.focus()` 后 `document.hasFocus() === true`、`writeText` resolved、`clipboard.readText()` 取回写入文本（`execCommand` 在 offscreen 下仍为 `false`）。
8. **Windows 写失败注入实测结论（新事实，见 must-fix 6）**：`chmod(dir, 0o444)` 后仍能写入（`chmod` 对目录写权限无效）；同进程持有读句柄时 `renameSync` 仍成功；唯一确定性手法是把 `notes.json.tmp` 预置为目录 ⇒ `writeFileSync` 抛 `EISDIR`。

---

### 1. 评审清单逐条结论

**1) 验收标准是否可判定 —— 大部分可判，6 处不可判或不可达，逐条点名。**

- **不可判（新增证据）**：N69-3/4/5/6（`clipboard.readText()` 逐字断言与 `.is-copied` 反馈）、N71-4（「每组至少一条剪贴板级判据」）——见 §0-7 与 must-fix 1；现有脚本对剪贴板零命中（`grep clipboard pix/scripts/ui-shot.mjs` 无结果），`.message-copy-btn` 只被几何探针读取（`:2213/2220`），即该能力在仓库里从未被证明。
- **不可达**：N64-3 空态矩阵第 4、5 步（「清空查询 → `本章暂无笔记`」「清除章节过滤 → `当前文档暂无笔记`」）——徽标仅在该章节范围内 `count > 0` 时渲染（`KnowledgeMap.vue:258/297` 的 `v-if`、`countNotesByChapter` 只写 `total > 0` 的键），点徽标后清空查询必然 `V ≥ 1`，第 5 步还需删空当前文档全部条目；R9 是用「删空该范围唯一一条」造出该态的（`ui-shot.mjs:4281-4292`）。见 must-fix 4。
- **判据不存在**：N70-1/2 的烟测产物（见 must-fix 5）；N67-3/N67-4/N70-2 依赖同一批脚本。
- **注入方式不成立**：N67-4 的「只读目录或占用」（见 §0-8 与 must-fix 6）。
- **自相矛盾**：N68-11 的「搜索 `zzz`（0 行）状态下删除一条」——0 行时没有 `.note-delete` 可点；括号里的替代路径（「先删除再输入查询」）与判据条件互相冲突。见 must-fix 8。
- **口径不唯一**：N65-4 的「`.note-row` 内正文顺序」未指明作用域（标准种子在该文档下共 4 行，第 4 行是 `n-other-1` 组的），逐条断言的字面数组不成立。见 must-fix 8。
- 其余抽查通过：N63-3/4（§0-1 的样本逐条成立）、N63-6/7、N64-2/4/5/6/7（`hasNotes` 与 `status` 门与 §0.8 自洽）、N65-2/3/5/7/8/9、N66-1/2/3/4/5/6/8/9（含 `.notes-chapter-filter-text` 与既有 `waitChapterFilter` 同源、`SEL.notesFilterInput` 已存在）、N67-1/2/5/6（文案与切片算术成立）、N67-8/10、N68-2/4/5/6/7/8/9/10/12、N69-1/2/8/9（除剪贴板）、N71-2/3/6/7、N72 全部。
- 措辞层面的弱判据（不阻塞）：N63-1 与 N68-1 的 `grep` 判据含「既有非本轮文件」「无关既有值」，判定边界靠评审主观，建议给出允许命中的文件清单（见 §3-3）。

**2) 撤销机制是否真的「界面所见即文件所存」—— 是；槽语义与并发有两处没写全。**

- 「真实反写」成立：删除立即写盘（既有语义）、撤销读槽 → 原下标插回 → `writeFileAtomic`，渲染层只用主进程回传的全量列表覆盖本地（§0.6 的 `applyNotes(notes)`）⇒ 不存在「先删面板、后删文件」或乐观合并的空间；N63-7/N67-6/N67-9/N67-10 的字节与哈希判据可判。
- 槽的写点、清点、校验顺序（无 root → 空槽 → id 不匹配 → 跨 root → 读失败 → 占用）逐条唯一，且「失败的删除不冲掉上一次撤销权」明确写死；`addNote`/`updateNoteComment`/`loadNotes`/`exportNotesMarkdown` 不清槽 ⇒ 与 §0.5 自洽。
- **缺口 1（时序）**：§0.6 只写「进入/重挂载时」按 `deletedAt` 折算剩余 8 秒，但连删两条时 `pendingUndo` 由 A 换成 B **不卸载 DOM**（`v-if` 的元素被复用）⇒ 行会按 A 的到期时刻消失，比 B 应得的 8 秒短；N68-8 只断言「数量恒 1、文案为 B」，抓不到这条。
- **缺口 2（在途竞态）**：撤销在途时若另一次删除成功（槽被覆盖为 B），旧请求的结果会按「其它失败保留行」处理，可能把新的撤销行提前收掉或把提示挂到错误的条目上；需求没有冻结「按 id 丢弃过期响应」。
- 「最近一次删除」的边界唯一：`.notes-undo` 单行 + 无栈 + 无快捷键（N68-8/10）；过期文案与 `UNDO_EXPIRED_MESSAGE` 唯一且由 `isUndoExpired` 定界（+4999 / +5000）；`UNDO_ROW_MS` 与 `UNDO_WINDOW_MS` 双常量并存是**有意设计**（否则过期提示在 UI 上不可达），开放问题 1 已自陈，判定为可接受。

**3) 搜索规则与性能 —— 规则唯一可判，但归一化来源缺一处冻结；性能在现量级无风险。**

- §0.1 把大小写（只用 `toLowerCase`）、命中字段（`text`/`comment`，不含 `id`/`kind`/`docPath`/`page`/`createdAt`）、空白（只 trim 首尾、内部不折叠）、中文（不分词/不拼音/连续子串）、正则（不用 `RegExp`）全部写死 ⇒ 逐条可在烟测里断言，无 locale 与转义陷阱。
- **缺口**：`query` 的归一化值在面板要用到四处（清空按钮的渲染条件、计数优先级 1、空态 4a/4b/4c 的条件、`{q}` 文案），但 §0.1 定义「生效 ⇔ `rawQuery.trim() !== ""`」、N64-6 要求「空白查询不渲染清空按钮」、§0.8/N64-1 又把它写成 `v-if="query !== ''"`，而 N63-2 明令「面板不做第二处 trim」、§0.10 的冻结导出表里也没有归一化函数 ⇒ 面板拿不到这个值。见 must-fix 2。
- 性能：几十条规模下每次输入全量重算 `groups` + 一次 DOM 差分，无 IO、无索引需求；唯一要守住的是 `applyViewToGroups` 不得原地改入参（N65-3 已断言）与「不得引入防抖」（N63-5 已声明）。

**4) 三维 AND、计数优先级与空态归因 —— 可实现，与 R9 无断言冲突；空态归因本身可区分。**

- `V` 的定义（列表实际渲染行数之和）只有一处口径，`countLabel` 四分叉与 §0.3 优先级一一对应；`status === "error"` 归零（优先级 0）与今天一致（`NotesPanel.vue:79-83`）。
- 与 R9 不冲突：今天 `countLabel` 的两态（`本章 …` / `当前 …`）在「无查询」态下逐字保留，R9 的 52 段断言不受影响；三维同时生效时前段只写「命中」，另两维度靠搜索框/章节条/开关可见——这是有意的取舍，不构成「头部与列表互相撒谎」。
- 空态六分支可区分（`resolveListEmptyReason` 的五个判别值 + `!hasNotes` 留在模板链上），`.notes-search-empty` 三文案共用类名、原因由文本区分，且 4 分支优先于 5/6 ⇒ 与「搜索无匹配不得报成本章/当前文档空」的期望一致。**但 N64-3 用来验证 5/6 两分支的状态构造不可达**（见 §1-1 与 must-fix 4）。

**5) 与既有语义的冲突 —— 无实质冲突，三处需要补字面。**

- 删除二次确认（3 s + document capture `pointerdown`，`NotesPanel.vue:160/179`，`DELETE_CONFIRM_MS = 3000`）：新增的撤销按钮不是 `.note-delete`，点它会先经 capture 监听清掉待确认态——既有行为不变、也不破坏「二次点击确认」；`confirmDelete` 开头已 `clearDeleteConfirm()`，删除成功后行消失不产生悬空确认。
- notice（4 s，`NOTICE_MS = 4000`）：撤销行 8 s 与 notice 4 s 是两条独立定时器，`onBeforeUnmount`（`:237`）同处清理即可（N68-4 已冻结）；「删除成功不额外弹 notice」与「撤销成功弹 `已还原该条笔记`」互不重叠。
- 选择集与行内动作、导出（永远全量）、跳回原文、章节过滤清除点（三处不变）都与 R10 无交集；`已选 0 条 → 1 条` 的还原效果是既有 `selectedNotes` 派生（`stores/notes-store.ts:96`）的自然结果，可判。
- 需补字面：①`.note-copy` 必须 `@click.stop`（否则点复制会触发 `open-note`）——需求只在 N69-8 断言行为、未冻结属性（§3-5）；②`COPY_FEEDBACK_MS` 的定义位置未冻结（§3-1）；③`.notes-search`/`.notes-sort` 受 `ready && hasNotes` 门控而 `.notes-filter` 不受，是有意的不对称，建议在 §0.8 点明以免被当缺陷。

**6) 失败路径与数据安全 —— 主进程侧写全了，渲染层侧缺三条边界。**

- 已写死：写失败保槽、过期不发 IPC、跨 root/空槽/占用三种 `not-found`/`invalid-input` 文案、失败不静默（一律经 `.notes-notice.is-error`）、损坏绝不覆盖、原子写。
- **缺**：①还原时若文件里已存在**同去重键**（同 `docPath`/`page`/`kind`/`text`、不同 id）的条目，§0.5 的占用校验只看 id ⇒ 文件会出现两条键相同的条目，破坏 `addNote` 建立的去重不变量（见 must-fix 7）；②`removeNote` 成功但主进程未回传 `note` 时，撤销行会静默不出现，需求需写死「`note` 必回传」（§3-4）；③复制失败路径（两条链路都失败）在离屏面上是**唯一可达**的分支，而需求把它留给「走查」——采纳 must-fix 1 后应升级为离屏可判。

**7) 隐性大成本项 —— 无越界项；两处被低估。**

- 新 IPC 的三处同步（`notes-store.ts` / `ipc-handlers.ts` / `preload.ts`）是既有范式，但 **stub 需复刻槽语义与三个控制口**（N71-1）⇒ 主进程与 stub 双实现漂移是最大维护成本，且 `notesHash` 判据要求 stub 的写盘与真实 `serializeNotes` 同形（现状 `writeNotesFile` 已是 `JSON.stringify(..., null, 2) + "\n"`，`:433`，可复用）。
- `ui-shot.mjs` 仍是最大单点：`SEL` 7 项 + 60–65 段场景 + ~17 张截图 + 4 组断言 + 两次长等待（5.2 s / 8.2 s）+ 空态矩阵的两次状态构造（删空章节范围、删空当前文档）+ 剪贴板前置（must-fix 1）⇒ 单次取证时长与场景数据准备量都比 R9 段更重，预算要按「脚本是唯一关键路径」给。
- 被低估的两处：烟测脚本的形式与落点未冻结（must-fix 5）；N70-2 要求「同法编译 `notes-store.ts` + `library-root.ts`」——两者确实都不 import electron（`library-root.ts` 只 import `fs`/`path`，`notes-store.ts` 只 import `node:*`、`./library-root.js` 与 type-only 的 `../shared/types.js`），该面成立，但 temp tsconfig 必须把 `paths` 与 `module: commonjs` 一起写对，否则 `.js` 后缀的 ESM 相对导入会解析失败。

---

### 2. must-fix（8 条，改完才能进设计）

1. **N69 的剪贴板判据在离屏面不可达（N71-4 同）。** 实测 `show:false+offscreen`（ui-shot.mjs:4690）下 `writeText` 抛 NotAllowedError、`execCommand` 返回 false、`readText()` 恒空，仅 show+focus 后成功。修：冻结 copy 场景前置，或由 stub 记录载荷。
2. **归一化 `query` 无单一来源。** §0.1 定生效=`rawQuery.trim()!==""`，§0.3/§0.4/§0.8/N64-1 却写 `query !== ""`、N64-6 要空白不渲染清空按钮，而 N63-2 禁止面板二次 trim、§0.10 无归一化导出。修：冻结单一来源（`normalizeQuery`/`activeQuery`）并改写四处条件。
3. **撤销行时序缺重挂点。** §0.6 只在「进入/重挂载」折算 8s，但连删两条时 `pendingUndo` A→B 不卸载 DOM（`v-if` 复用）⇒ 行按 A 到期消失；撤销在途遇新删除时旧响应会误收新行。修：冻结 `watch(deletedAt)` 重建定时器（或 `:key` 强制重挂）+ 响应 id 不符即丢弃。
4. **N64-3 空态矩阵第 4/5 步不可达。** 徽标仅在该范围 `count>0` 时渲染（`KnowledgeMap.vue:258/297`、`countNotesByChapter` 只写 `total>0`），点徽标后清空查询必然 `V≥1`。修：照 R9 52f2 先删空该范围；`.notes-filtered-empty` 需再删空当前文档全部条目。
5. **烟测脚本形式与落点未冻结。** N70-1/2 要编译驱动烟测，但 §4 白名单无脚本条目，也无 R9 N60 的「临时文件、不落仓库」括注 ⇒ 提交违反 N72-3，不提交无法复跑。修：N70 冻结「%TEMP% 临时脚本 + 跑完删除」并写入 §4。
6. **N67-4 的写失败注入在 Windows 不成立。** 实测 `chmod` 目录 0o444 后写入仍成功、同进程持句柄时 `renameSync` 仍成功；确定性手法只有把 `notes.json.tmp` 预置为目录（`writeFileSync` 抛 EISDIR）。修：按此冻结注入与恢复步骤。
7. **撤销与去重键的交叉语义空缺。** 删 A 后重摘录同文（新 id，同 `docPath/page/kind/text`）再撤销：§0.5 占用校验只看 id ⇒ 文件出现两条同去重键条目（`parseNotesFile` 不报损坏）。修：冻结同 dupKey 按 `invalid-input` 拒绝 + 中文文案 + 一条烟测断言。
8. **N68-11 自相矛盾、N65-4 作用域不明。** 0 行态没有 `.note-delete` 可点，无法「搜索 `zzz` 时删除一条」；`.note-row` 顺序未限定范围（该视图共 4 行，含 `n-other-1` 组）。修：N68-11 改为「先删除 → 再输入查询」，N65-4 写明断言范围=当前文档组。

---

### 3. 次级项（不阻塞，设计档/开发档必须写死）

1. **`COPY_FEEDBACK_MS` 的落点未冻结**：§0.10 把它列进「冻结常量清单」，但 §0.7 又说「照抄 ChatPanel 的 `COPY_FEEDBACK_MS`」（`ChatPanel.vue:427`），§3.12 禁止抽公共模块 ⇒ 写死「`NotesPanel.vue` 内声明同名常量、值 1200」，并说明 N68-1 那类「数字只出现一处」的走查不覆盖 1200。
2. **N63-5 的「即时性」判据不能用 `waitFor` 落地**：轮询会把 300 ms 防抖判成通过；必须写成「一次 `js`（setter + `input` 事件）往返后直接读 `.note-row` 数量」，与 N71-5 的「其余用 `waitFor`」划清边界。
3. **N63-1 / N68-1 的 `grep` 判据给出允许命中清单**：`toLowerCase` / `5000` / `8000` 在渲染层其它模块的既有命中会让判据靠评审主观裁量，建议逐文件列举（至少排除 `PdfSearchPanel.vue`、`ChatPanel.vue`、`reader-state-store.ts` 的既有常量）。
4. **`removeNote` 成功但缺 `note` 不得静默**：须写死「主进程成功删除必回传 `note`；渲染层取不到即视为实现缺陷」（否则撤销行静默不出现，违反「失败路径不得静默」）。
5. **`.note-copy` 的属性层冻结**：`@click.stop`（否则冒泡触发 `open-note`）、`title` 与反馈态类名在 §0.7 只给了 `复制`/`已复制` 文案，建议把 `click.stop` 写进 §0.7 的 DOM 契约，别只由 N69-8 的行为断言兜。
6. **「复制失败」路径的可判定性**：当前实测环境下两条链路在离屏窗口都失败，若采纳 must-fix 1 的「show+focus」前置，则成功路径可判、失败路径反而不可判；两条路径的判定手段要在 N69-7 里二选一并写明（建议：成功路径用 show+focus，失败路径由 stub 注入 `writeText` 抛错 + `execCommand` 返回 false）。
7. **复制片段不含 `comment`** 是 §0.7 的冻结取舍（备注只随导出出现）；建议在需求里点名理由，避免后续被当缺陷或被开发期"顺手"加回去导致 N69-2 失败。
8. **§0.3 三维同时生效时前段只写「命中」**：这是有意的取舍，但 R9 的「头部与列表一致」原则会被读成「计数应同时反映三维」；建议在 §0.3 补一句「计数只表达搜索维度，其余两维度由控件自身状态表达」，避免设计期再发明第二处计数。

---

## 设计评审（R10）

> 评审对象：`docs/pm/R10-design.md`（含 §0 十条口径修订、§1–§10），对照 `docs/pm/R10-req.md` 的 §0 冻结项与 `docs/pm/R10-review.md` 需求评审的 8 条 must-fix 处置表。方式：设计档逐条只读核对 + 真实代码只读走查（`pix/src/main/{notes-store,ipc-handlers,preload}.ts`、`pix/src/shared/types.ts`、`pix/src/renderer/stores/notes-store.ts`、`pix/src/renderer/components/workspace/{NotesPanel,KnowledgeMap,PdfViewer}.vue`、`pix/src/renderer/utils/notes-path.ts`、`pix/scripts/ui-shot.mjs`），另加一处仓库外实测：按 §8.2/§8.3 的原样 tsconfig 在 `%TEMP%/pix-r10-review-probe` 编译主进程与渲染层两个目标（跑完删除，结论见 must-fix 7 与 §4-7）。
> 结论：**revise**。must-fix 8 条（§2）。主线成立：契约四处同步可行（`types.ts` 零改动、`ReaderNotesMutationResult.note?` 已存在）、撤销是真实反写且「三态 + 两守卫」的判据自洽、搜索与排序是唯一实现且只影响视图、三维 AND 与空态归因可枚举、白名单不重叠。阻塞集中在四处：**`clearPendingUndo` 的调用点在档内自相矛盾**、**60-8/60-9 的起始态与 60-7 末态不符且「搜索生效 + 已删到 0 条」不可构造**、**64c-2 与 64e 两条失败/竞态场景不可达或与真实时序语义不符**、**63-3 与 60-3 两条断言分别与构造状态矛盾、为空断言**。

### 1. 评审清单逐条结论

**1) 契约自洽性 —— 四处同步成立、错误码与中文齐全、槽失效条件唯一；渲染层动作的调用点不唯一。**

- IPC 四处（`types.ts` 复用 / `notes-store.restoreNote` + `ipc-handlers` 的 `notes-restore` / `preload.notesRestore` / stub）与 §5 文件表、§9 分工表逐条对齐；入参守卫复用 `isNoteId`（`ipc-handlers.ts:243`）与 `invalidNotesInput`（`:252`）成立；`types.ts` 零改动成立（`ReaderNotesMutationResult.note?` 见 `types.ts:392`，`ReaderNotesErrorCode` 见 `:369`）。
- 中文错误齐全且可落地：`not-found` 的 `没有可撤销的删除` 与 `invalid-input` 两条专有文案**不能**走 `ERROR_MESSAGES`（`notes-store.ts:34-47`）与 `failure()`（`:70`），设计已用「按调用点写死（先例 `ANSWER_TOO_LONG_MESSAGE`）」覆盖 ⇒ 实现路径明确；`too-long`/`empty`/`not-corrupt`/`outside` 声明为不可达与实现一致。
- 槽失效条件唯一：§1.2 的四条失效条件与 ①–⑦ 校验顺序互不重叠，未发现第二个判据来源；「只有成功删除 / 成功还原 / 成功重建清槽」与 §8.5 的「恰好 3 处赋值」一致（`let undoSlot` 的初始化不算赋值点，走查口径应写清）。
- **不成立**：§1.3 第 108 行写 `clearPendingUndo()`「唯一调用点是面板撤销行定时器」，而 §3.1 第 265 行与 §3.4 行 4 都要求在「点击时已过期」分支里再调一次，§8.5 第 606 行的 `grep` 判据又按「面板定时器 1 处」写死 ⇒ 三处不能同时为真。见 must-fix 1。

**2) 撤销时序 —— 五种情形都有确定结果，两处需要补冻结。**

- 连删两条：槽被 B 覆盖 + `watch(() => pendingUndo, …, { immediate: true })` 重建定时器（源取 ref 本体、每次赋新对象字面量）成立 ✓；重载/切标签往返：行按 `deletedAt` 折算、不复活不续命 ✓；过期：零 IPC + 立即收行 ✓；写失败：槽保留、行保留到原到期时刻、可重试 ✓；占用（同 id / 同去重键）：`invalid-input`、不写盘、保留槽 ✓。
- 我按「撤销请求先发」与「撤销请求后发」两类交错各走了一遍：守卫②（`undoScope`）与守卫③（目标 id）的返回时机（在 `applyNotes` 之前）足以避免「旧列表复活新删条目」；`pendingUndo === null`（行已到期）时不丢弃、失败照常提示，也不会静默。
- **缺口 A**：§3.3 只冻结「`if (result.stale) return;` 写在 `setNotice` 之前」，未冻结 `restoring` 的复位 ⇒ 按字面实现会让撤销按钮在收到 stale 响应后永久 `disabled`（64e 无此断言，走查也抓不到）。见 must-fix 6。
- **缺口 B**：守卫③ 只在「A 的响应晚于 B 的响应」时起作用；真实主进程是同步 FIFO（先发的 undo invoke 先被处理，会真的写回 A），该顺序只能由 stub 制造，而 §8.4 给的做法把延迟放在了错误的时点（见 must-fix 4）。
- 计时基准写死为 `deletedAt`、`UNDO_ROW_MS > UNDO_WINDOW_MS` 的双常量取舍有理由且可判（64 段先断言行仍在、再断言点击过期）✓。

**3) 搜索与排序 —— 规则唯一可判，只影响视图，不动导出与跳转。**

- `normalizeQuery` 是唯一 `trim` 判定点、`matchesSearch` 是唯一匹配实现、`sortNotesForView` 是唯一排序实现，`applyViewToGroups` 是唯一「搜索 + 排序」管道且返回新对象、不改写入参 ✓；规则逐条可判（只用 `toLowerCase`、只 trim 首尾、内部空白不折叠、中文连续子串、不做繁简/全角转换、不用 `RegExp`、`comment` 原样比较、不匹配 `id`/`kind`/`docPath`/`page`/`createdAt`）✓。
- 导出（主进程 `renderNotesMarkdown`）、注入（`sortNotesForContext`）、跳转（`open-note`）都不读 `sortMode`/`activeQuery` ⇒ 排序与搜索不改可见集合之外的东西 ✓；§8.5 的 `toLowerCase()` 允许清单已把既有命中（`PdfSearchPanel.vue`、`ChatPanel.vue`、`reader-state-store.ts`、`notes-path.ts`）列全 ✓。
- 唯一需注意的措辞：`V` 的定义（列表实际渲染行数之和）与 store 的 `visibleCount` 必须是同一处求和，设计已写成单一来源 ✓。

**4) 文案与空态 —— 计数四分叉与空态六分支互为补集，可枚举。**

- 我逐态代入：无维度 `共 T 条` / 仅开关 `当前 V 条 / 共 T 条` / 仅章节 `本章 V 条 / 共 T 条` / 仅搜索 `命中 V 条 / 共 T 条` / 三维同时（前段只写命中）/ 无匹配 `命中 0 条 / 共 T 条` / 0 条 + 搜索生效 `命中 0 条 / 共 0 条`（N64-7 的取值）——与 §2.2 一一对应，无第五种文案 ✓。
- 空态：`resolveListEmptyReason` 五个判别值 + `null`（`.notes-list`）+ 模板侧 `!hasNotes`（分支 3）构成穷尽划分；`!hasNotes` 不进纯函数 ✓；4 分支优先于 5/6 ✓；空白查询按未生效处理 ⇒ 走 5/6/7 ✓。
- `chapterRange !== null` 时 `groupNotesByDocument` 走章节分支、开关状态不影响可见集合 ⇒ 60-5 的「再关/开开关行数都是 1」成立 ✓；`currentDocKey === null` 时三维中两维结构上不生效（示例表第 16 行）✓。

**5) 与既有语义冲突 —— 无实质冲突，一处后果需要写明。**

- 删除二次确认：capture `pointerdown` 只对 `.note-delete` 放行，撤销按钮走「先清待确认态再执行」，与既有行为一致；`confirmDelete` 开头已 `clearDeleteConfirm()` ⇒ 不产生悬空确认 ✓。
- notice：4 s 与 8 s 是两条独立定时器，`onBeforeUnmount` 同处清理 ✓；「删除成功不额外弹 notice」「撤销成功弹 `已还原该条笔记`」互不重叠 ✓。
- 选择集：撤销不写 `selectedNoteIds`，还原后由既有派生自然回到 `已选 N 条`/chip（N67-8 的期望成立）✓；章节过滤清除点零新增 ✓；R9 计数两态在无查询时逐字保留 ✓。
- **需要写明**：`PdfViewer.vue:375/380` 的 window 级 `keydown` 在 `isEditableTarget(event.target)` 之前处理 Escape ⇒ 在笔记搜索框里按 Esc 会顺带退出框选模式或关闭 PDF 搜索面板。需求 §0.8/N64-2 选了「不 `stopPropagation`」，设计忠实于需求，但应把这条后果写进档（否则开发期会被当缺陷修掉，反而违反 N64-2）。见次级项 1。

**6) 验证可执行性 —— 原语够用，四处场景结论错误、一处路径写错。**

- stub 面（`notesDelete` 回传 `note` + 槽 + 4 个控制口）与 `SEL` 7 项可落地；`record(label, data, failures)`（`ui-shot.mjs:1274`）、`notesHash()`（`:1955`）、`notesLoadCalls()`、`restoreStandardSeed()`（`:2990`）、`openNotesPanel()` 都在 `runReaderStateScenarios` 闭包内可复用 ✓。
- `pressSearchEsc` 用 `new KeyboardEvent("keydown", { key: "Escape", bubbles: true })` 可触发 `@keydown.esc`（Vue 的 `keyNames.esc → "escape"` 映射），与既有 `Enter` 先例（`:2129`）同形 ✓；焦点断言在隐藏离屏窗口内可判（`:3198` 既有「追问后焦点应在 `.input-area`」断言通过）⇒ 65 段的 `show+focus` 只对剪贴板链路是必需的前置 ✓。
- 失败即红的结论错误的四处：60-8/60-9（must-fix 2）、64c-2（must-fix 3）、64e（must-fix 4）、63-3 与 60-3（must-fix 5/8）；另加烟测产物路径写错（must-fix 7）。

**7) 规模与工作量 —— 白名单干净、接口冻结清楚，但单轮场景量与耦合度偏高。**

- §9 的两份白名单 7 个文件互不重叠，`%TEMP%/pix-r10-smoke/**` 不入仓库、不新增 npm scripts ⇒ 与 N72-3 自洽 ✓；三处接口冻结（`notes-view.ts` 13 导出 / store 动作面 / IPC 形状）足够支撑并行 ✓。
- §8.4 单轮新增约 35 个场景相位（60 段 9、62 段 6、63 段 8、64 段 6、65 段 6）+ 18 张截图 + 两次长等待 + 60-7 删空 3 条笔记 ⇒ 建议每个子场景自带复位（`enterMapWorkspace(seedNotes())` / `restoreStandardSeed()`），不依赖前一场景末态。本档的 60-8/60-9 与 64c-2 正是因为「接上一场景末态」才产生了 must-fix 2/3。

**8) 白名单是否重叠 —— 不重叠，且冻结文件的零 diff 声明与设计一致。**

- `notes-path.ts`（`groupNotesByDocument` / `matchesChapterFilter` 保持 R9 契约，搜索与排序在其之后）、`types.ts`、`library-root.ts`、`ChatPanel.vue`、`KnowledgeMap.vue`、`WorkspacePage.vue` 全部标为不改，与「搜索/排序只加在 store 的 `groups` 管道上」的做法一致 ✓。
- 修订 4 的前提复核为真：徽标仅在该范围 `total > 0` 时渲染（`KnowledgeMap.vue:258` 与 `:297` 的 `v-if="...count"`），夹具里 `1. Abstract` 的 noteNum 为 1、`2. Method Overview` 为 2（`ui-shot.mjs:215-216`）。

### 2. must-fix（8 条，改完才能开工）

1. **`clearPendingUndo()` 调用点档内矛盾：** §1.3:108 写「唯一调用点是定时器」，§3.1:265 与 §3.4 行 4 要点击过期分支再调一次，§8.5:606 的 grep 按 1 处写死。修：冻结 2 处（`scheduleUndoRow` 到期分支、`onUndoClick` 过期分支），同步改 §8.5 期望值。

2. **60-8/60-9 起始态不成立：** 60-7 末态是「查询已清空、只剩 `n-other-1`」（1 行），60-8 却断言行数 4；60-9 的「搜索生效 + 已删到 0 条」不可构造（0 行无 `.note-delete`）。修：两场景各自 `enterMapWorkspace(seedNotes())` 复位；删空最后一条改用命中该条的查询，`{q}` 随之改写。

3. **64c-2 不可达：** 64c 已 `clearDeleteSlot()`，校验顺序②（无槽 ⇒ `not-found`）先于⑥（同 id ⇒ `invalid-input`），断言 `该笔记已重新存在，无法撤销` 必红。修：拆为独立场景「删 `n-current-2` 设槽 → `seedNotes()` 写回同 id 条目 → 点仍在 8 s 内的撤销行」。

4. **64e 绑定 stub 副作用：** 延迟落在槽校验之前 ⇒ A 的结局是 `not-found`（真实 FIFO 下会成功写回）；「不出现成功文案」去掉守卫③也会过，「文件里两条都不存在」是 stub 特有。修：延迟改到写盘之后、返回之前；断言收敛为「行数 2 且无 `n-current-2` 行 + 无 notice + 按钮未 disabled」。

5. **63-3 断言与状态矛盾：** 点 `1. Abstract`（`[1,1]`）后 `n-current-1`（p1）仍可见（`ui-shot.mjs:215` 该徽标 noteNum=1）⇒ 列表 1 行、无空态元素。修：改为断言「行数 1、该行为 `n-current-1`、`n-current-2` 不在列表、无 `.notes-chapter-empty`，清除后回 4 行」。

6. **`stale` 分支的 `restoring` 复位未冻结：** §3.3 只写 `if (result.stale) return;`，按字面实现会让 `.notes-undo-btn` 永久 `disabled`。修：冻结 `try/finally` 复位，并在 64d/64e 加「响应后按钮未 disabled」断言。

7. **烟测产物路径与实测不符：** 实测为 `out-main/main/{notes-store,library-root}.js` + `out-main/shared/types.js`（view 侧同理），档内写的 `out-main/notes-store.js` 会 MODULE_NOT_FOUND。修：冻结准确 require 路径或显式 `rootDir`。

8. **60-3 失焦断言是空断言：** §8.4 的 `setSearch` 只做 setter + `input` 事件、从不 `focus()`，输入框此前无焦点 ⇒ 「`activeElement !== input`」恒真。修：`setSearch` 先 `input.focus()`，并把「Esc 前 `activeElement === input`」纳入同一断言组。

### 3. 次级项（不阻塞，设计档/开发档应写死或补注）

1. **Esc 冒泡的实际后果**：`PdfViewer.vue` 的 window 级 `keydown` 在 `isEditableTarget` 之前处理 Escape（`:375` / `:380`）⇒ 在笔记搜索框按 Esc 会顺带退出框选模式 / 关闭 PDF 搜索面板。建议在 §0.8 注明这是既有语义（N64-2 明确不 `stopPropagation`），避免开发期被当缺陷修掉。
2. **§8.2 的「两个产物」实测为三个**（`shared/types.js` 也会产出）；与 must-fix 7 一并改掉路径表述后，两个烟测脚本的 `require` 才不会踩空。
3. **63-8 引用了未定义的 `hashBefore`**：该基线必须在 63-8 开头采集；且 60-7/60-9 会消耗笔记并复位种子，其后的哈希基线与条数要按当时状态重算（§8.6 第 5 条建议补一句）。
4. **A/B 并行时序**：B 侧消费 `PixApi.notesRestore`，在 A 未落地前 `npm run check` 必红（`tsconfig.json` 与 `tsconfig.preload.json` 都会报缺方法）。建议写明「A 先落 `preload` + `main`，再并行 B」。
5. **外部删除 `notes.json` 后的还原语义**：`readNotesFile` 把 ENOENT 按空库处理 ⇒ 还原会写出「只含该条」的文件（与既有 `addNote` 同语义，非本轮回归）。「notes.json 是唯一事实源」的口径下，建议在烟测里点一次名（现状只覆盖 `corrupt`/`version-unsupported`/`read-failed`）。
6. **措辞**：§5 的「preload 既有 11 个方法签名零改动」与实测不符（`PixApi` 共 78 个成员），按「notes 系列 6 个方法签名零改动」表述即可。
7. **截图命名漂移**：§8.4 用 `62-latest.png`，N71-3 列的是 `62-notes-sort-latest.png`（数量一致、命名不同）。建议对齐需求档或在设计档注明以 §8.4 为准。
8. **60-7 的副作用要在 §8.6 说明**：该场景真实删除 3 条笔记，「夹具文件在搜索/排序/复制前后字节不变」的判据必须排除 60-7/60-9 之后的状态（先复位种子再复查哈希）。

### 4. 已核对为真、开发与评审均不得翻案的前提

1. **夹具与切片算术成立**：`n-current-2` 前 12 字符 = `Table 2 repo`、`n-current-1` 前 12 字符 = `We study ret`；`已删除「…」· 第 N 页` 的逐字断言可判；`1. Abstract` 1 条、`2. Method Overview` 2 条与 R9 徽标数字一致。
2. **字节回复可行**：`parseNotesFile` 保键序（`notes-store.ts:129`）、`serializeNotes` 是唯一序列化出口（`:191`）、原对象原样写回 ⇒ 还原后与删除前逐字节相同（含 `tmp`+`rename`）。
3. **槽语义可在既有函数体内落地**：读-改-写全同步、无 `await`；失败路径不写盘、不冲槽；`duplicateKey`（`:196`）可复用于同键占用校验。
4. **`types.ts` 零改动成立**：`ReaderNotesMutationResult.note?`（`:392`）与 `ReaderNotesErrorCode`（`:369`）已覆盖本轮全部所需形状与码，`ERROR_TITLES` 的完整性不受影响。
5. **三维 AND 的插入点成立**：`groups` 是既有唯一派生管道（`stores/notes-store.ts:87`），`countLabel` 与空态链同链，R9 的无查询态断言不受新优先级影响。
6. **焦点与按键注入在离屏面可判**：隐藏窗口内 `document.activeElement` 断言已有通过先例（`ui-shot.mjs:3198`）；`new KeyboardEvent` 注入与既有 `Enter` 先例同形。
7. **临时 tsconfig 方案本身可行**：按 §8.2/§8.3 的原样配置实测 `tsc -p` 退出码 0，`@types/node` 可从 cwd 祖先目录解析；仅产物路径需按 must-fix 7 修正。

## 代码审查（R10）

> 审查对象：R10 交付（A：`pix/src/main/{notes-store,ipc-handlers,preload}.ts`、`pix/src/renderer/utils/notes-view.ts`、`pix/src/renderer/stores/notes-store.ts`；B：`pix/src/renderer/components/workspace/NotesPanel.vue`、`pix/scripts/ui-shot.mjs`），对照 `docs/pm/R10-req.md`（§0 冻结项 + N63–N72）、`docs/pm/R10-design.md`（含「定稿修订」）、`docs/pm/R10-dev.md`。
> 方式：只读走查（`git status/diff`、文件内容）+ 审查方**自建**烟测 + **独立复跑**离屏取证（不复用交付方脚本产物，两条烟测脚本与断言均由审查方重写）。结论：**revise** —— 主线（搜索 / 排序 / 撤销 / 复制、数据面、失败路径、回归）全部通过；1 条 must-fix 落在需求 §0.8 的冻结字面（搜索行视觉与控件形态），且该偏离在交付档的偏差表中未登记。

### 1. 审查方实跑证据（命令与原样结果）

1. **唯一工程门**：`cd pix && npm run check` → `CHECK_EXIT=0`（`vue-tsc --noEmit && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit`，无任何 error）。
2. **主进程数据面（审查方自建，仓库外 `%TEMP%/pix-r10-verify`）**：`tsc -p tsconfig.main.json` 退出 0，产物恰为 `out-main/main/{notes-store,library-root}.js` + `out-main/shared/types.js`；`node smoke-main-verify.cjs` → **通过 54 项、失败 0**。覆盖：`deleteNote` 即时落盘 + `note` 载荷必在、`restoreNote` 后**文件逐字节回复删除前**（哈希相等 / `createdAt`·`updatedAt` 未刷新 / 原下标插回 / 末条 index 钳位到 `notes.length`）、每一步「主进程回传列表 === 文件所存」（id 序列逐条相等）；失败路径逐条：无槽 / id 不符 / 跨库（另一库目录未被创建、零写盘）/ 同 id 占用 / 同去重键占用（文件不出现两条同键）/ `notes.json.tmp` 预置为目录 ⇒ `write-failed` + `笔记写入失败` + 原字节不变 + 槽保留 + 清理注入口后重试成功 / 外部删除 `notes.json`（ENOENT 按空库）/ `corrupt` / `version-unsupported` / `clearLibraryRoot` 的 `no-root`；槽生命周期：`updateNoteComment`/`addNote` 不清槽、失败删除不清槽、第二次删除覆盖槽、成功重建清槽、失败重建（`not-corrupt`）不清槽。
3. **纯函数（审查方自建）**：`tsc -p tsconfig.view.json` 退出 0；`node smoke-view-verify.cjs` → **通过 48 项、失败 0**。覆盖：大小写不敏感 / 备注命中 / 中文连续子串 / 内部空白不折叠 / `docPath`·`id`·`page`·`kind` 零命中 / `""`·`"   "`·`"\t\n"` 恒真 / `normalizeQuery` 幂等；`sortNotesForView` 两模式（同刻按 id 升序、不原地修改入参）；`search-and-filter`（3 query × 3 章节区间 × 2 开关 = 18 组合，可见集合恒等于三谓词交集，且入参快照不变、空组丢弃、组顺序原样）；复制片段四段逐字（多行逐行 `> `、行间无空行、`· AI 结论`、显示名去目录、无尾随换行、不含 `comment`/`id`）；空态五态 + 「搜索类优先于章节/文档」+ 空白不算生效；`+4999/+5000/+5001` 边界；运行期导出面 = 3 常量 + 7 函数。
4. **离屏取证（审查方独立复跑）**：`cd pix && PATH="/c/Program Files/nodejs:$PATH" ./node_modules/.bin/electron scripts/ui-shot.mjs` → `UI_SHOT_EXIT=0`、`MANIFEST.json.failure === null`、清单内截图 **112 张**（= 94 既有 + 18 新增，文件名与设计档 §8.4 逐字一致，含 `62-notes-sort-latest.png` / `62b-notes-sort-default.png`）、`MEASUREMENTS.json` **152 条零 failures**。R10 四组 36 条：`notes-search` 9 / `notes-sort` 7 / `notes-undo` 14 / `notes-copy` 6，每组均含文件字节或剪贴板级判据；`clipboard.readText()` 三段样例逐字读回（仅 Windows 把 LF 规整为 CRLF，归一化后逐字相等，原始值一并入库）。
5. **基线比对（审查方用 `%TEMP%/pix-r10-base` 独立复算）**：基线 94 张 / 116 条、`failure=null`；本轮既有条目零缺失、94 张截图全保留；`list-current-doc-filter-off|on`·`after-filter-off-settled` 三组的 **346 个行内字段**中，差异仅 `header.h` 68→111、`panelScroll.scrollH` 1012→1055 与 15 处 `y` 位移（统一 +43px，设计档 §8.6 预期）；`w/h/fontSize/color/background` 逐字零差异；键集合无增删。
6. **红线走查**：`git diff --stat` 仅 6 个白名单源码 + 新建 `notes-view.ts` + `docs/pm/*.md`；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、`shared/types.ts`、`notes-path.ts`、`outline-notes.ts`、`reading-context.ts`、`ChatPanel.vue`、`KnowledgeMap.vue`、`WorkspacePage.vue`、其余 store/composable/样式 **零 diff**；改动文件内 `: any` / `await import(` / `import(` 零命中；`.trim()` 仅 `notes-view.ts::normalizeQuery` 与既有 `commentDraft.value.trim()`；`5000`/`8000` 仅 `notes-view.ts`；面板与 store 内 `includes(`/`filter(`/`sort(` 零命中；`undoSlot` 恰 1 声明 + 3 赋值 + 1 读取；`clearPendingUndo` 面板恰 2 处调用（定时器到期、过期分支）；`undoDelete` 面板 1 处调用；`setCurrentDocOnly` / `clearChapterFilter` 无新增写入点；无 `console.*` 静默失败分支；未新增 npm scripts、仓库内无临时脚本/产物残留。

### 2. 验收逐条（N63–N72）

| # | 结论 | 判据 |
| --- | --- | --- |
| N63-1/2/3 | 通过 | 匹配唯一实现（面板/store 零 `includes(`）；归一化唯一（`normalizeQuery`，面板零 `.trim()`）；审查方烟测 `search-basic` 逐条绿（大小写 / 中文备注 / 元数据零命中 / 内部空白不折叠） |
| N63-4 | 通过 | 离屏 `notes-search|hits`：`TABLE 2` → 1 行 + `命中 1 条 / 共 4 条`；`消融 实验` → 0 行 + 逐字空态；`sample-paper.pdf` → 0 行；三张截图齐备 |
| N63-5 | 通过 | `setSearch` → 下一次 `js` 直接读，无 sleep/repaint，读到 1 行（无防抖）；实现侧无 debounce 分支 |
| N63-6/7 | 通过 | `counts` 相位：错误态 `.notes-count=""`、搜索/排序行不在 DOM、恢复后输入框 value 仍为 `Table 2`；`hashSame`/`loadCallsSame` 均为真 |
| N64-1/2 | 通过（字面留档） | 清空按钮 `v-if=searchActive`（空白查询不渲染）；点击只清空 + `focus()`；Esc 只清空 + `blur()`、不 `stopPropagation`。**注**：N64-2 的字面 `grep "Escape"` 会命中既有标识符 `showEscapeHatch`（R9 逃生口），语义（无第二个 keydown 监听）成立 |
| N64-3 | 通过 | `empty-search` + `empty-matrix`：4a/4b/4c 逐字且共用 `.notes-search-empty`，另两个空态元素不同时在 DOM；章节/文档两态逐字（`本章 0 条 / 共 2 条`、`当前 0 条 / 共 1 条`）；关开关 1 行无空态 |
| N64-4/5/6 | 通过 | Esc 前 `focused:true`（空断言防护）→ Esc 后 `value:""`、失焦、4 行、清空按钮移出 DOM；清空按钮后 `focused:true`；空白查询 `共 4 条` |
| N64-7 | 通过 | 逐条用命中查询删空 → `命中 0 条 / 共 0 条` + `.notes-empty` + 搜索/排序行不在 DOM；摘录后查询保留、`命中 0 条 / 共 1 条`、4c 文案（判据由 D1 换成「文件 + 面板」，理由成立） |
| N65-1..9 | 通过 | 排序唯一实现（`notes-path.ts` 零 diff）；默认/最新行序、组序与 `.group-count` 不变、`hashSame:true`；title/文本逐字；搜索×排序、章节×排序；导出 `已导出 4 条 → .pix-read/notes.md` + 注入顺序 doc→page→createdAt 与屏幕顺序相反；切文档保留、重进复位 |
| N66-1..9 | 通过 | 单一管道（面板无 `filter(`/`sort(`、store 无第二份文档谓词）；`countLabel` 四分叉真值表逐字（含错误态空串、三维同时只写「命中」）；`visibleCount` 单一来源；三维可见性同时成立；AND 数值证据（开关两态都 1 行）；维度互不改写；既有场景全绿 |
| N67-1..10 | 通过 | 槽 3 处赋值；IPC 契约与 `types.ts` 零 diff；审查方烟测 `undo-roundtrip`/`undo-failures`/`undo-slot-lifecycle` 54 项全绿（字节级）；离屏 `notes-undo|delete/restore` 9. 节指标（删除即时落盘、撤销字节回复、`createdAt` 为种子值）；失败非静默（全部经 `.notes-notice.is-error`） |
| N68-1..12 | 通过 | 常量唯一；`undo-expiry` 边界；两个提前返回在 `bridge()` 之前（`callsDelta:0`）；计时基准 `deletedAt`（8.2s 收行、重挂不复活）；5.2s 逐字过期文案 + 立即收行 + 零 IPC + 字节不变；连删两条行数量恒 1、只还原最近一条；还原后可再删再撤；唯一入口；行与过滤无关；在途 disabled + 恰 1 次 IPC；64e stale 零副作用（`n-current-1` 未复活、无提示、按钮已复位、真实 FIFO 落盘） |
| N69-1..9 | 通过 | 片段唯一实现（面板不拼 `>`/`——`/`AI 结论`）；三段样例 `clipboard.readText()` 逐字；`已复制` 1400ms 回位、反馈态恒 1、`复制为 Markdown` 回位；失败路径逐字 + 剪贴板未改写 + 不置反馈；几何（在 `.note-ask-wrap` 之前、同行、右对齐、`actionsOverflow:0`、`.note-actions` 仍是末子节点）；不触发 `open-note`、`hashSame:true` |
| N70-1..5 | 通过（产物不可复核） | 审查方以等价自建烟测复现全部断言组并通过；仓库内零脚本残留、`pix/package.json` 零 diff。交付方原始脚本未入库，**其调用的真实存在性无法复核**（设计档 §0 修订 5 的既定取舍） |
| N71-1..7 | 通过 | stub 槽语义与主进程同形（含跨 root / 同 id / 同键 / 延迟落点）；`SEL` 7 项齐备；60–65 场景与 18 张截图齐备；四组测量含字节/剪贴板判据；基线只增不减、`failure===null`、退出码 0 |
| N72-1..8 | 通过 | 既有场景全绿；check 0 error；白名单零越界；未触发即无痕（三个 `v-if` 门 + `.note-copy` 常驻）；冻结文件零 diff；`notes.json` 格式与「搜索/排序/复制前后字节不变」；无死代码 / 无 `any` / 无内联 import / 文案中文；无向后兼容层 |
| §0.8 冻结字面 | **失败（唯一）** | 搜索行的 `placeholder`、`.notes-search-input` 盒模型、`.notes-search-clear` 控件形态三处偏离冻结字面 → 见 §3 的 must-fix |

### 3. must-fix（1 条）

1. **搜索行未按需求 §0.8 冻结字面实现。** `pix/src/renderer/components/workspace/NotesPanel.vue:434` 的 `placeholder="搜索摘录与备注"`，冻结值为「搜索原文或备注」；`:723-735` 的 `.notes-search-input` 为 `height: 22px` / `font-size: 11px` / `border-radius: var(--pix-radius-sm)`，冻结要求照抄 `PdfSearchPanel.vue` 的 `.search-input`（高 26px、圆角 6、12px 字号、focus 边框）；`:438-446` 的清空控件是原生文字按钮「清空」，冻结形为 `<v-btn icon="mdi-close" size="x-small" variant="text" title="清空搜索" />`（类名 `.notes-search-clear` 与 `title` 已合规）。修：改回冻结字面，或把该偏离登记进 `R10-dev.md` 的偏差表（现 B.2 的 D8 声称「无其它偏差」）。附：该偏离在取证面漏检的直接原因是离屏测量没有任何搜索行盒模型/控件形态断言（§8.6 只覆盖笔记行内元素）。

### 4. 次级项与建议（不阻塞验收）

1. **搜索行缺几何/属性断言**：`MEASUREMENTS` 的 `notes-search` 组只有文本/行数/计数/哈希判据；建议补「`.notes-search-input` 与 `PdfSearchPanel` `.search-input` 的 `h/fontSize/radius` 逐字相等」与「清空控件 `title` 逐字」，否则 §0.8 的视觉冻结项永远不可判。
2. **N64-2 的 `grep "Escape"` 判据与既有 `showEscapeHatch` 冲突**（R9 标识符），建议需求侧改为「无第二处 `keydown` 监听」或给允许命中清单。
3. **60-9 的判据替换（交付 D1）背后是一个真实 UI 现象**：面板从空态切到列表时的滚动会触发 `PdfSelectionQuickAsk` 的 scroll-hide ⇒ 首条摘录的「已存为摘录」反馈可能不可见。属既有语义、非本轮回归，但建议单独登记问题单，不要靠「改用文件判据」长期绕过。
4. **`.note-copy` 的窄栏溢出未覆盖**：65-5 只在 1600×1000 下测 `actionsOverflow:0`；左栏被拖到极窄时 `.note-actions`（默认 nowrap）是否溢出无断言。

### 5. 三个「最可能出错但没人验证」的点与判定

1. **删空最后一条（`hasNotes === false`）时撤销行的可见性与撤销可用性** —— 60-9 删空 4 条时只断言 `.notes-empty` 与计数，未断言 `.notes-undo`。判定：**无缺陷**。面板 `v-if="notesStore.pendingUndo"` 与 `hasNotes`/`status` 无耦合；主进程在空库上 `Math.min(index, 0)` 插回，审查方烟测已证「删末条 → 还原字节回复」。建议补一条离屏断言（删空后撤销行仍在 → 撤销成功 → 列表回 1 行）。
2. **守卫②（`undoScope`：离开工作区后在途响应）没有任何运行时场景**（交付方 B.6 自陈）。判定：**代码成立、风险低**。`resetNotes()` 在 `pendingUndo = null` 之前 `undoScope += 1`，`undoDelete` 在 `await` 之后的第一个判断就是 scope 比对；若删掉该守卫，迟到响应会经 `applyNotes` 把上一个工作区的列表写回已复位的 store（`status` 被推回 ready），这是唯一的跨工作区污染通道，但可观测面（面板已卸载）确实不足，保留走查结论可接受。
3. **`undoDelete` 的 `stale` 与「行已过期被收掉」的边界**：
