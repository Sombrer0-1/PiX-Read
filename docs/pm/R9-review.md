## 需求评审（R9）

> 评审对象：`docs/pm/R9-req.md`（N52–N62 结构可见）。评审方式：需求档逐条 + 真实代码只读核对（`renderer/components/workspace/{KnowledgeMap,NotesPanel,ReaderPanel,PdfViewer}.vue`、`renderer/stores/{notes-store,reader-store,reader-state-store}.ts`、`renderer/utils/notes-path.ts`、`renderer/pages/WorkspacePage.vue`、`renderer/assets/styles/main.css`、`scripts/ui-shot.mjs`、`node_modules/pdfjs-dist/build/pdf.worker.mjs`（4.10.38，只读核对书签解析路径））。
> 结论：**revise**。must-fix 8 条（见 §2），改完才能进设计。主线本身成立：范围/徽标/计数/过滤/已读共用同一份派生、`outline-notes.ts` 纯函数 + 离线烟测、徽标 → `notesStore.focusChapter` → `WorkspacePage` 一次性 token（既有「store 状态 + 页面编排」范式）、`.read` 只用 `opacity`，全部落在既有代码与白名单内，无依赖、无主进程改动、无新类型。阻塞项集中在四处：**夹具与验收自相矛盾**（N52-7/N61 声明表、N59 行数与「展开全部」、N59 的 ≥15 徽标与标准种子 4 条）、**字节/基线判据按现状必为假或不可判定**（N57-8/N62-7 的 `reader-state.json` 字节不变、N54-10 的「与改前同值」无基线）、**单一实现点与模块边冲突**（`notes-path` ↔ `outline-notes` 反向依赖 + `matchesChapterFilter` 的空 range 语义吞掉「仅看当前文档」）、**token 复位与「只能由 token 变化触发」组合出一次伪触发**。

---

### 0. 已核对为真、实现阶段不得翻案的前提

1. **「同源」的说法在既有代码上确实可达成**：`buildPageLabels`（`KnowledgeMap.vue:98`）与 `buildRangeEnds`（`:127`）共用同一份全量预序 `collectPreorder`，`isCurrent`（`:207`）只读 `rangeEnds`，`flattenVisible`（`:161`）的键规则与预序键逐字相同 ⇒ 把两函数整体迁入 `outline-notes.ts` 并让 `label`/`end` 同源，没有行为分叉的隐藏面。
2. **展开状态不影响键**：`collectExpandable`（`:148`）只改 `expanded`，键由 `flattenVisible` 的位置下标生成 ⇒ §0.1「含未展开节点」的口径与既有 DOM 行键一致，`Map.get(row.key)` 的落点成立。
3. **夹具 PDF 能真的带书签，但有两条 pdf.js 硬约束**：`buildPdf`（`ui-shot.mjs:71`）现有编号为 Catalog=1、Pages=2、Font=3、页=4+2i、内容=5+2i，追加对象不破坏既有引用。pdf.js 4.10.38 的 `_readDocumentOutline`（`pdf.worker.mjs:36396-36406`）要求 `/Outlines` 是字典且**`/First` 必须是间接引用（`instanceof Ref`）**，否则 `getOutline()` 返回 null（整组 5x 断言会静默失败）；`/Dest [ {pageRef} 0 R /XYZ null null null ]` 通过 `isValidExplicitDest`（`:36157`，XYZ 允许 2–3 个参数且 null 合法）；`/Count` 会被解析但只进 `count` 字段，不参与遍历（写上无妨，不能当作遍历依赖）。
4. **计数与面板筛选可解耦**：`notesStore.notes` 只由 `loadNotes`/`applyNotes`/`recoverCorruptNotes` 全量覆盖，`currentDocKey` 已是 store 的 computed（`notes-store.ts:75`）⇒ `KnowledgeMap` 直接消费即可，无需自比路径（§0.2 的要求可达成）。
5. **导出链路天然全量**：`notesExport`（`preload.ts:161`）由主进程读盘导出，与渲染层筛选无关 ⇒ N57-1「过滤生效时导出 4 条」不需要任何产品改动，判据可达成。
6. **取证原语够用**：`seedNotes(list)`（`ui-shot.mjs:718`，可传任意列表）、`record`（`:1120`，先落测量后抛错）、`countOf/textOf/js`、`libraryReadDelayMs`（造加载窗口）、1600×1000 窗口下 `.map-toggle` 会经 Teleport 出现在 `.center-pill`。
7. **今天是零基线**：脚本全文无任何地图场景（`地图`/`map-row`/`map-toggle` 零命中），夹具两个 PDF 都无书签 ⇒ `.page-badge`、`.map-row` 从未被测量过，「与改前同值」类判据目前没有可比对象。
8. **N54 的冻结几何可以照抄，已实测**：全局 `box-sizing: border-box`（`assets/styles/main.css:9-14`）下，`height: 16px` + `border: 1px` 的元素 `getComputedStyle().height === "16px"`、`offsetHeight === 16`、`borderTopWidth === "1px"`、`borderTopLeftRadius === "999px"`、`fontSize === "10px"`（临时 offscreen Electron 脚本在仓库外实测，Electron 33 / 同仓库 CSS 写法）⇒ N54-5 的四条断言与「与 `.page-badge` 同高（16px）」不冲突，可达成。

---

### 1. 评审清单逐条结论

**1) 验收标准是否可判定 —— 四种证据面都是真的，但有 7 处判不了、恒真或自相矛盾。**

- **N52-7 与 N61 声明表互斥**（must-fix 1）：按 §0.1 手算，声明序列 `1/2/2/3/3` 里没有任何区间文本——`2.2 Positional prior`(p3) 与 `3. Ablation Study`(p3) 都是「无更大后继页码且 `start === pageCount`」⇒ `label === "3"`。所以「无后继页码的末节点显示区间」不可构造，§0.1 自陈的「唯一文案变化」也没有任何断言覆盖（实现若照抄今天的单页口径，5x 组仍然全绿）。
- **N59-4/5 互相矛盾且起点不存在**（must-fix 2）：`collectExpandable` 只展开 `depth === 0` 的有子节点 ⇒ 3 层树下可见行 = depth0 + depth1 ≠ 节点数，「`.map-row` 数量 === 节点数」在 3 层夹具上恒不成立；且产品里没有「展开全部」控件（反需求 §3.9 又禁止新增头部交互）。
- **N59-4 的「`.note-count-badge` ≥ 15」不可构造**（must-fix 3）：标准种子只有 4 条，`seedNotes()`/`restoreStandardSeed()`/`openNotesPanel(4)`（`:144`/`:2836`/`:2830`，8 处调用）把「4 行」写死进了既有场景。
- **N57-8 / N62-7 的字节判据不成立**（must-fix 5）：打开文档即 `noteLanding → capture`（`reader-state-store.ts:137/201`）起 600 ms 去抖落盘，切文档还有 `flush()`（`:220`）⇒ `reader-state.json` 必然从缺失变为存在或被改写，与「切文档前后字节不变」直接冲突。
- **N55-9 的「烟测」证据面不存在**：N60 只编译 `outline-notes.ts` + `notes-path.ts`，store 依赖 vue/pinia 与 `window.pixApi`，不在该面内 ⇒ `focusChapter` 在 `currentDocKey === null` 时 no-op 只能走查；同类证据错配还有 N56-1（把「DOM 顺序」写成走查项，实际是离屏可判）。
- **N53-5 恒真且理由不成立**：文本预览下 `isPdf === false`，`.map-toggle` 结构性不渲染，`.map-progress` 的缺席与 §0.6 的 `pageCount > 0` 守卫无关；加载窗口内 `.map-toggle` 已存在、`showMap` 与 `pageCount` 无关（`ReaderPanel.vue:61/207`）⇒ 要真正判到该守卫，必须用 `libraryReadDelayMs` 造加载窗口后点开地图。
- **N54-10 的「与改前同值」无基线**：见 §0 前提 7（今天无地图场景、夹具无书签），且带徽标行的 `.page-badge` 会因 `.map-node` 变窄而左移 ⇒ 只能改成同 run 内「无徽标行」与声明值比对（§2 must-fix 4）。
- 其余抽查通过：N53-2/3（`Math.round` 手算 33/67/100 与 `.page-label`（`PdfViewer.vue:943`）同源可判）、N54-4/6/9、N55-4/5/6/7/8、N56-4/5/6、N57-1/2/3/5/6、N58-3/4/5/6、N59-3、N62-1/2/3/4 都能在「夹具 + SEL + record」现有面上落成断言。

**2) 页码范围语义是否唯一 —— 口径唯一、重复计数是有意为之；但两处推理与既存实现不同源。**

- `page == null` 不进 Map、其有页码的后代照常计算、键规则与 `flattenVisible` 一致：三条都与今天的行为可比对，可实现。
- 同页重叠与父不覆盖后代会被重复计入同一本笔记：§0.1 后果 1/2 已显式声明，样本夹具里 `2. Method Overview`(p2) 与 `2.1 Sparse mask budget`(p2) 恰好同范围，N54-4/N55-5 正把它当证据，判据自洽。**但后果 1 的推理「起始页相同 ⇒ 范围相同」是假的**（预序中隔着一个更大页码节点时，前者的后继是那个节点、后者没有后继 ⇒ 范围不同）；设计档不能拿它当捷径或优化前提（must-fix 8）。
- 与既有实现的一处真实差异：§0.1 的公式丢了今天 `Math.min(end, pageCount)` 钳制（`KnowledgeMap.vue:110/138`），与「逐字冻结、与今天 `buildRangeEnds` 同源」矛盾（实际可达性极低：pdf.js 的 `getPageIndex` 对上界外的 dest 会抛错并落成 `page: null`，故影响面只在文档层面，但冻结项不该自陈错误）。
- 「不落在任何范围内的笔记不出现、不被过滤命中、也不新增未归类节点」是可达的（目录页码与正文页码错位时第 1 页的摘录就会落进这一格），且与 `.map-count`/高亮口径一致；必须在开发档写明这条用户可解释性（用户会看到「第 1 页有摘录但地图上没有徽标」）。
- 末节点徽标由 `5` 变 `5-10` 是本轮唯一既有文案变化，但没有任何断言覆盖（见 §1.1 第一条）。

**3) 跨栏信号是否只复用了既有范式 —— 是，且切标签在「token 只增」下确实一次性。**

- 通路只有两条腿：`KnowledgeMap → notesStore.focusChapter`（store 状态）与 `WorkspacePage` 的 `watch(chapterFocusToken)` 编排；`leftTab`/`leftCollapsed` 本来就在 `WorkspacePage`（`:39/41`），不需要新 seam、不需要改 `ReaderPanel`/`PdfViewer`，不存在「被迫改多处组件」。
- 徽标放在 `.map-node` 之外的 `.map-row` 直接子节点上（§0.2 已冻结）⇒ 与既有 `onNodeClick`（跳页 + `suppressScrollUntil`）互不串扰，N55-3「不跳页、不改阅读位置」的写法成立。
- **唯一缺口是复位语义**：`resetNotes()` 把 token 从 N 归 0 本身就是「token 发生变化」，与「切标签只能由 token 变化触发」组合出一次伪触发（`goHome` 先 `resetNotes()` 再 `push`，`WorkspacePage.vue:216-232`；挂载/卸载各一处 `:98/:228`）⇒ 见 must-fix 6。
- 若设计让 watcher 调 `selectLeftTab("notes")`，要连带给 `loadNotes` 与本轮「会话已停」的时序写清楚（`goHome` 路径上会发出一次无意义的 `notesLoad`），建议只写 `leftTab`/`leftCollapsed` 两个 ref。

**4) 过滤组合语义与数据安全 —— 判定式、清除点、全量导出都可达成；三处边角要写死。**

- AND、开关不改写、其它文档分组不显示（`.notes-group` 恒为 1）、切文档 `null`、`clearChapterFilter` 纯置空、`currentDocKey === null` 时徽标不可点：都能落在 `groupNotesByDocument` 第四参 + store `watch(currentDocKey)` + 既有 `setCurrentDocOnly` 上，且不需要主进程改动。
- 分支优先级必须按 §0.3 冻结：章节过滤生效且可见 0 时，既有 `filteredEmpty`（`NotesPanel.vue:68`：`hasNotes && groups.length === 0`）同样为真 ⇒ 章节空态必须先判，顺序不可调换。
- 计数文案的第三态互斥：`countLabel`（`NotesPanel.vue:73`）现在只有 `共 N 条` 与 `当前 X 条 / 共 N 条` 两态，章节过滤生效时输出第三态，N56-5 的「回到 `共 4 条`、行数回到 4」只在「仅看当前文档」为 OFF 时成立（该场景前面刚跑过 N56-4 的两态、开关状态没钉死）⇒ 见 §3 次级项。
- N56-6 用「删除范围内全部笔记」造空态会真写 `notes.json`，与 N57-8 的字节判据在同一脚本里需要显式的场景边界与复种步骤。
- R8 面确实零影响：过滤只进面板派生，选择集/上限/chip/`reader_notes`/`reading-context.ts` 都不需要改动，N57-4 的「`git diff` 为空」可达成。

**5) 视觉与既有风格 —— 变量体系内、与高亮不冲突；两处布局/可判定性细节要补。**

- 徽标配色 `color-mix(in srgb, var(--branch) 16%, #fff)` 与文字/图标 `var(--branch)` 与 `.page-badge`（`:535`）同源，边框走同一族 `color-mix`；`.read` 只用 `opacity: 0.55`、不新增色值、不动 `BRANCH_COLORS` ⇒ 符合不变量 1 与反需求 5。
- 与 `.current` 无冲突：`.current` 改的是行背景（`--branch 18%`），徽标是行内独立元素；`.read` 与 `.current` 由判定式天然互斥（`end < page` 与 `start <= page <= end` 不能同真）。
- **`.map-header` 是单行 flex（`space-between`，`:325`），直接追加第三个子节点会排在同一行**；「新增一行 `.map-progress`」需要 `flex-wrap` + `flex-basis: 100%`（或包一层容器），而 N53-7 又要求 `.map-heading`/`.map-count` 位置不变 ⇒ 设计档必须写死布局做法，别让开发期自行发明。
- 240 px 地图槽内新增徽标会压缩 `.label`（`min-width: 0` + ellipsis，不会溢出），但建议在 51 段补一条 `overflowFree` 判据（同 21 段范式）作为视觉门。
- 200 节点性能的可判定性：结构判据（单次遍历 + 前缀和 + computed 依赖清单）可走查，阈值起点见 must-fix 2。

**6) 隐性大成本项 —— 没有越界项，两处成本被低估。**

- 夹具书签可行但有硬约束（§0 前提 3：`/First` 必须是间接引用）；`long-book.pdf` 的规模（≥60 页 / ≥200 节点）本身不构成风险（现有 `buildPdf` 追加对象即可）。
- 跨栏通路不蔓延（2 个组件 + 1 个 store），本轮真正的大头是 `scripts/ui-shot.mjs`：3 个 PDF 的声明表、`SEL` 8 项、14 张截图、6 组断言、≥3 个新场景的数据准备（含 N56-6 的删除与复种）——预算要按「脚本是最大单点」给。
- 被低估的两处：标准种子被 8 处 `openNotesPanel(4)` + 2 处 `restoredRows === 4` 绑死（must-fix 3）；`resetNotes` 的三个调用点与 token 语义耦合（must-fix 6）。

---

### 2. must-fix（8 条，改完才能进设计）

1. **N52-7 与 N61 声明表互斥，「末节点显示区间」不可构造。** 声明的 label 序列里没有任何区间（p3 末节点 `end === start`），§0.1 自陈的唯一文案变化无断言覆盖。修：声明表增加一个「`page < pageCount` 且无更大后继页码」的节点（如 `Appendix B`(p2) 作 `3. Ablation Study` 子节点），给出它的 label 与区间形态，并同步徽标数/已读数/行数期望。
2. **N59-4/5 不可判定：行数判据与 3 层夹具矛盾，测量起点不存在。** `collectExpandable`（`KnowledgeMap.vue:148`）只展开 depth 0 ⇒ 可见行 = depth0 + depth1 ≠ 节点数；产品无「展开全部」控件，反需求 9 也禁止新增头部交互。修：断言改为「可见行 === 声明可见数（depth0+depth1）」，耗时起点冻结为点 `.map-toggle` 到 `.map-row` 数达标。
3. **N59-4「`.note-count-badge` ≥ 15」与标准种子 4 条冲突。** `seedNotes()`/`restoreStandardSeed()`/`openNotesPanel(4)`（`ui-shot.mjs:144/2836/2830`，8 处）与 40c/42b 的 `restoredRows === 4`、N56/N57 的「共 4 条」「已导出 4 条」都把 4 写死。修：冻结 long-book 的笔记为场景局部 `seedNotes([...])` 追加（或场景专用构建器），标准种子逐字不变并在档内写死期望条数。
4. **N54-10 的「与改前同值」不可判定，且部分行必然不成立。** 今天无地图场景、夹具无书签（§0 前提 7）⇒ `.page-badge` 从未被测量、没有基线；带徽标行的 `.page-badge` 又因 `.map-node` 变窄而位移。修：删掉「与改前同值」，改为同 run 内「无徽标行」与档内声明值（文本/字号/几何）比对，或先落一次带书签夹具的基线再改。
5. **N57-8 / N62-7 的「`reader-state.json` 字节不变」不成立。** 打开文档即 `noteLanding → capture` 起 600 ms 去抖落盘（`reader-state-store.ts:137/201`）、切文档还走 `flush()`（`:220`）⇒ 该文件必然被创建或改写。修：字节不变只对 `notes.json` 断言；`reader-state.json` 改为「点徽标/清除/发送」前后不变，且基线在打开文档之后取。
6. **§0.7 的 token 复位与「切标签只能由 token 变化触发」组合出伪触发。** `resetNotes()` 把 token 由 N 归 0 就是一次变化，`goHome` 路径（`WorkspacePage.vue:216-232`，先 `resetNotes()` 再 `push`）会写 `leftTab`/`leftCollapsed`（若调 `selectLeftTab` 还会在会话已停后发一次 `notesLoad`）。修：冻结为「只在新值 > 0 且大于旧值时生效」或 token 只增不复位，并补一条「`goHome` 后重进仍停在资料库」的离屏断言。
7. **单一实现点与模块边冲突，且空 range 语义会吞掉「仅看当前文档」。** §0.1 要 `outline-notes import notes-path`，N56-2 又要 `notes-path` 第四参用 `matchesChapterFilter`（反向依赖成环）；N56-3 的「可见 ⇔ `matchesChapterFilter`」在 `range === null` 时按 N60-2「恒真」会忽略文档归属。修：冻结方向（判定式落在 `notes-path`，`outline-notes` 只接受已解析的 `docKey`/`range`），并写死「文档归属由第三参、章节范围由第四参」的组合式。
8. **§0.1 的冻结公式与既有实现不同源，且一条结论为假。** 公式丢了今天 `buildPageLabels`/`buildRangeEnds` 的 `Math.min(end, pageCount)` 钳制（`KnowledgeMap.vue:110/138`）；「两节点起始页相同 ⇒ 范围相同」在预序中间隔着更大页码节点时不成立。修：逐字对齐钳制（或显式声明该钳制退役），并把结论改写为「后继节点相同 ⇒ 范围相同」。

---

### 3. 次级项（不阻塞，但设计档/开发档必须写死）

1. **N56-5 要钉死开关状态**：`共 4 条`、行数 4 只在「仅看当前文档」为 OFF 时成立；ON 时是 `当前 3 条 / 共 4 条`、行数 3。把场景起始态（或两态各自的期望值）写死，否则断言取决于 52e 段的收尾状态。
2. **N56-6 与 N57-8 的场景边界要写死**：删除范围内全部笔记会真写 `notes.json`，破坏字节判据的基线；要在同一脚本内声明「删除后复种标准种子」与各段文件快照的先后顺序。
3. **N56-1 的 DOM 顺序断言要指明三元素同现**：`.notes-selection-bar` 只在 `selectedCount > 0` 时渲染，场景需同时具备选择集与章节过滤（或只断言 `filter.compareDocumentPosition(bar) & 4` 在有选择时才判）。
4. **N53-5 的理由与判据改写**：文本预览下 `.map-toggle` 结构性不存在，要判 §0.6 的 `pageCount > 0` 守卫必须用 `libraryReadDelayMs` 造加载窗口后点开地图（此时地图渲染成空态且无 `.map-progress`）。
5. **N55-9 的证据类型改正**：store 不在 N60 的烟测面内（依赖 vue/pinia 与 `window.pixApi`），该条只能走查；若坚持要烟测，需把 `focusChapter` 的 no-op 条件抽成纯函数。
6. **`.map-progress` 的布局做法写进设计档**：`.map-header`（`KnowledgeMap.vue:325`）是 `space-between` 单行 flex，需 `flex-wrap` + `flex-basis: 100%`（或包层）才能既换行又保 N53-7 的位置不变。
7. **父章节徽标的可解释性**：父节点范围几乎总在自身起始页收口（预序先到子节点），因此「点父章节徽标 = 只看该父章节起始页的笔记」是常态；§0.1 已冻结该口径，但 N55 的「用户可见行为」措辞（「列表只剩该章节的 2 条笔记」）应补一句范围语义，避免开发期与设计期各自解释。
8. **补一条地图行 `overflowFree` 判据**（51 段，沿用 21 段范式）：240 px 槽宽下徽标挤压 `.label`，需要「不横向溢出 + `.label` 宽度 > 0」的视觉门。
9. **`READ_OPACITY` 的落点二选一**：§0.8 允许具名常量、N58-1 要求 `opacity: 0.55` 只出现一处 ⇒ 写死「CSS 字面量」或「JS 常量 + `:style` 绑定」其一，别让两处各自存在。
10. **`/First` 必须是间接引用写进 N61 的夹具要求**（`pdf.worker.mjs:36402-36406`）：内联字典形式的书签会被 pdf.js 静默判为「无书签」，整组 5x 断言失败且错误信息是空态而非解析错误。

---

## 设计评审（R9）

> 评审对象：`docs/pm/R9-design.md`（R9 结构可见 N52–N62 定稿设计）。方式：清单 8 条逐条与真实代码只读核对（`KnowledgeMap.vue`、`NotesPanel.vue`、`notes-store.ts`、`notes-path.ts`、`WorkspacePage.vue`、`ReaderPanel.vue`、`LibraryPanel.vue`、`components/layout/AppLayout.vue`、`assets/styles/main.css`、`scripts/ui-shot.mjs`、`node_modules/pdfjs-dist@4.10.38`），另加两处仓库外经验核验：按 §6.3 契约生成带书签 PDF 后用仓库内 pdf.js 解析并复算 §1.1 公式（含 `convertOutline` 复刻），以及 `long-book` 声明值算术复算。核验脚本写在 `%TEMP%/r9-check/` 并在跑完后删除，不落仓库、不改代码。
> 结论：**revise**。must-fix 5 条（§3），改完可开工。主线成立：单一派生（`buildChapterRanges`）+ 前缀和计数 + token 一次性聚焦 + `opacity` 弱化 + 夹具书签；§6.2/§6.3 的声明值经实测逐字成立。

### 1. 事实基线复核

设计档自陈的行号逐条命中：`buildPageLabels:98`、`buildRangeEnds:127`、`collectExpandable:148`、`flattenVisible:161`、`isCurrent:207`、`notes-store.ts:75`、`leftCollapsed:39`、`leftTab:41`、`selectLeftTab:196`、`goHome:216-232`、`buildPdf:71`、`seedNotes:144`、`writeFixtures:194`、`record:1120`、`openNotesPanel:2830`、`restoreStandardSeed:2836`、`SEL:46`。两处偏差：`ReaderPanel.vue` 的 `showMap` 在 `:62`（`:61` 是 `mapFits`）；基线截图数实际 **75**（`await capturePage` 75 次，76 把函数定义行也计入）⇒ §6.4 的「≥ 76 + 20」应为「≥ 95」。

### 2. 清单逐条结论

**1) 契约自洽性。** 签名与调用点一致：`buildChapterRanges(nodes, pageCount)`、`countNotesByChapter(ranges, notes, docKey)`、`groupNotesByDocument` 第四参默认 `null`（与 `notes-store.ts:76` 的既有三参调用逐字段等价）；`ChapterRange` 多出的 `key` 传给 `focusChapter({title,start,end,label})` 合法（非字面量入参不做多余属性检查）。DOM 契约与既有结构不冲突：`.map-row`（`display:flex; gap:2px`）在 `.map-node{flex:1;min-width:0}` 之后容纳 `flex-shrink:0` 的徽标不会溢出；`.map-row.read` 的 `opacity` 与 `.current` 的行背景互不干扰。三处不闭合见 must-fix 2/4/5（§0 修订 8 的等价声明、§1.1「其它 kind 不计」、§1.2 的两条并列判定式）。

**2) 页码语义。** 归属规则唯一（「预序中第一个 `page > start` 的后继页减一」+ `Math.min(end, pageCount)`），与今天 `buildRangeEnds` 同源；嵌套重复计数是声明过的定义（`2. Method Overview` 与 `2.1` 同为 `[2,2]`）；无页码节点不进 Map 而其后代照常（实测 `root/2/0` 缺席、`root/2/0/0 [3,3] "3"` 在 Map，且该孙节点默认不展开仍在 Map）；越界钳制后 `end < start` 落单页文本，`.read`/`.current` 用同一 `end` ⇒ 互斥恒真（实测三页 `readAndCurrent` 均为 0；read/current = 页1 `0/1`、页2 `1/3`、页3 `3/3`，与 §6.3 声明表一致）。域外两条声明为假，见 must-fix 3。

**3) 跨栏信号。** 复用「store 状态 + `WorkspacePage` 编排」，未新增 seam；`selectLeftTab("notes")` 既有编排同时满足「展开左栏 + 切标签 + 必要时 `loadNotes`」，与 N55 逐条对得上。一次性语义成立：token 单调递增 + watcher 首句 `token <= 0 || token <= previous` 守卫，`goHome`（`WorkspacePage.vue:216-232` 先 `resetNotes()` 再 `push`）与 `onUnmounted` 两条复位路径都不进效果分支，无「残留标记反复抢标签」路径（全仓库无「读 `chapterFilter` 切标签」分支即成立）。宽度不足时 `.map-toggle:disabled` + `showMap === false` ⇒ 无徽标可点（只可清除已存过滤），不越界（`ReaderPanel` 零 diff）。副作用须知：展开左栏会把 `.reader-stage` 由 1190px 压到 914px（1600×1000 窗口：左 268 / 右 380 / padding 22 / gap 16，`AppLayout.vue:110-118`），仍 ≥ 620 ⇒ 52d 不会把地图卸载。

**4) 视觉契约。** `.read` 与 `.current` 互斥（同上，恒真）；配色为 `var(--branch)` + `color-mix`，与 `.page-badge`（`KnowledgeMap.vue:535` 段同族写法）同源，未新增变量、未动 `BRANCH_COLORS`；tooltip 用原生 `title`（与 `.map-node` / `.row-chevron` 既有写法一致，未引入 `v-tooltip`，Vuetify 用法零新增）；`opacity: 0.55` 单处 CSS 字面量，不引入 JS 常量，符合 N58-1「只出现一处」。

**5) 性能。** 计数路径是「`notes` 恰好一次遍历（按页分桶）→ 长度 `maxPage+1` 的前缀和 → 每个 range 一次 O(1) 区间求和」，`computed` 依赖显式排除 `readerStore.page` / `expanded` / `currentDocOnly` / `selectedNoteIds`；`rows` 只读 `Map.get`，模板无按行计数调用；翻页或展开只重算行派生与 `isCurrent`。`buildChapterRanges` 仍与今天同形（每节点向前扫描，O(n²) 上界、420 节点约 8.8 万步），非本轮瓶颈。声明规模经算术复算逐项成立：420 节点 / 220 可见行 / 220 个 `.page-badge` / 22 个 `.note-count-badge` / `Chapter 01`=`1-3` / `Chapter 20`=`58-60` / `Section 11.05` 无徽标 / `第 1 / 60 页 · 2%`。

**6) 验证可执行性。** 书签夹具方案**实测可行**：按 §6.3 契约生成的 3 页 `sample-paper.pdf` 经仓库内 pdf.js 4.10.38 解析，`getOutline()` 非空；按 `PdfViewer.vue:131-152` 复刻 `convertOutline` 后得到 8 节点、`Appendix A` 的 `page === null`、`.page-badge` 序列 `["1","2","2","3","3","2-3"]`、徽标 4 个（`1. Abstract`=1、`2. Method Overview`=2、`2.1`=2、`Appendix B`=2），与声明值逐字一致。解析侧细节确认：`/Outlines` 走 `Dict.get` 会解引用（可写间接引用）；`/First` 非间接引用即返回 null；`isValidExplicitDest` 接受 `/XYZ` 的 2–3 个 null 参数；缺 `/Dest` 得 `page: null` 而不抛错；`/Count` 只进 `count` 字段不参与遍历。实现注意（本地复现过一次）：对象号规则要求「先 push 书签根（`4+2*pages`）再按预序 push 节点」，且 id 必须按**预序**（先子树后兄弟）分配；按层次分配 id 会把 `/First`/`/Next` 串成 BFS 序、目录结构被打散而 pdf.js 不报错。两处断言不可判定见 must-fix 1/3。

**7) 规模与工作量。** `ui-shot.mjs` 是最大单点（`buildPdf` 书签支持 + 2 张声明表 + `long-book` 生成 + `SEL` 8 项 + stub 计数器 + 50–55 二十来个相位 + 6 组断言），与两张组件改动同属 B，B 是唯一关键路径；建议按「夹具与 helper 先行、场景后叠」拆两次提交，避免 A 等 B 的 DOM 契约。其余 7 个文件的改动面都在 §7 写死的三处接口之内。

**8) 白名单。** A/B 无文件重叠；接口只有三处（`buildChapterRanges`/`countNotesByChapter` 签名、`focusChapter`/`clearChapterFilter`、DOM 类名与文案）；`%TEMP%` 烟测与本次核验脚本都在仓库外；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build/**`、`pix/src/main/**`、`pix/src/shared/types.ts` 不在改动面内（`kind` 白名单在既有 `pix/src/main/notes-store.ts:114`，只作证据引用）。

### 3. must-fix（5 条）

1. **§6.3 的 `openMap()` 与场景 `50c` 互斥。** helper 定义为「点 `.map-toggle` 后等 `.map-row`」，而 `50c` 打开无书签的 `older-paper.pdf`：`hasOutline === false` ⇒ DOM 只有 `.map-empty`，`.map-row` 结构性不存在，该场景必然超时（20s 上限后抛错，整轮取证中止）。改：helper 等的谓词改为 `.knowledge-map-slot`（或「`.map-row` 或 `.map-empty`」二选一），并在 `50c` 单独写明它等的是空态。
2. **§0 修订 8 的「与今天 `buildPageLabels` 在全部可达输入上逐字等价」为假，且与 §2.1「唯一有意文案变化」互相矛盾。** 今天 `end == null` 恰是「无更大后继页码」的**正常**分支（`KnowledgeMap.vue:98-125`：`end == null || end === start || end < start ⇒ String(start)`），改后该分支变为区间文本——`Appendix B`(p2, `pageCount` 3) ⇒ `2-3` 正是 `50a` 的断言。若实现方按「逐字等价」落地，`50a` 与 §6.3 徽标表一起失败。改：删掉等价声明，改写为「除『无更大后继且 `pageCount > start`』输出 `start-pageCount` 外与今天逐字相同；`pageCount === 0` 仍输出 `String(start)`」。
3. **计数域两条声明为假（`pageCount === 0` 与 `start > maxPage`）。** ①`pageCount === 0` 时**有后继**的节点 `end` 仍有限（`[A(p1), B(p2)]` ⇒ `A.end === 1`；本地实测 `maxPage === 1`，p1 笔记被计入，返回非空 Map），故 §1.1「空输入」的「所有 range 的 `end` 非有限 ⇒ 空 Map」与 §6.2 `count-prefix-sum-equivalence` 的「`pageCount 0` 两侧同为 0 键」只在单节点 / 空 outline 成立 ⇒ 把该样本改成单节点 outline，或按真实语义重写期望。②`start > maxPage` 时标准前缀和取 `prefix[start - 1]` 越界（`undefined` ⇒ `NaN`，靠 `NaN > 0` 为假才没写键）；§1.1 需补一句「`start > maxPage` 或 `end < start` ⇒ 该键不写」，避免实现方按 `>= 0` 等判据落地出别的结果。
4. **§1.1「其它 kind 不计（但仍不抛错）」与 §1.2/§2.2 第 2 条的恒等式冲突。** 过滤侧（`rangeContains`/`matchesChapterFilter`）不看 `kind`，越域 kind 会让「徽标数字」比「点它后的行数」少 1，正是 R1「徽标撒谎」的第二个入口；而 `kind` 取值域由主进程读侧白名单闭合（`pix/src/main/notes-store.ts:114` 的 `isReaderNote`，越域即整库判 corrupt）⇒ 该分支不可达，属 N62-6 禁止的死分支。改：删除该分支（并在烟测声明「越域 kind 不可能由 `notesLoad` 返回」），或把越域 kind 归入 `excerpt`（保住 `total === excerpt + answer`）。
5. **§1.2 把 `matchesChapterFilter` 与 `groupNotesByDocument` 的组合式写成两条并列判定。** 同一文件内的第二份谓词与 §1.1「判定式唯一」、N56-3「可见 ⇔ `matchesChapterFilter`」有落差，等于给「计数口径 vs 过滤口径」留了第二个漂移点（烟测只能事后比对，不能结构上排除）。改：写死章节分支直接调 `matchesChapterFilter(note, currentKey, chapterRange)`，仅当 `chapterRange === null` 时退回既有 `onlyCurrent` 判定；`scopeDoc` 的折写随之删除。

### 4. 次级项（不阻塞，开发档需写死）

1. `isCurrent` 的表述冲突：§1.7 写「函数体零改动」、§2.1 写「`isCurrent` 读 `range.end`」。判据是行为等价（N58-1），开发档按「读 `MapRow.range` 上的同一 `end`」写自评即可。
2. 基线截图数按实测 75 写，改后下限 ≥ 95；`MEASUREMENTS` 的既有组经核对不含整树快照（`tree-progress` 等按行标题/文本定位），追加 `long-book.pdf` 不会破坏「逐字段与基线相等」。
3. `52-err` 的「清除后仍可用」要分相位：错误态下过滤条结构性不渲染 ⇒ 必须先 `setLoadFailure(null)` 并重载（条回来）才能判「清除可用」。
4. 窄幅（stage < 620px）下徽标不可达、只能清除不能新建过滤；文案不必新增，但开发档需按 N62-6 写明这条可解释性。
5. `.map-progress` 与 `.map-header` 各带 10px 下内边距 ⇒ 行间距 10px；其后紧接 `.map-empty`/`.map-tree`，窄槽靠 ellipsis 收口（与 `.map-heading` 同族写法）。
6. 模板里的 `noteCountTitle(row.count)` 属格式化调用，不在 N54-1 的禁止面内（禁止的是按行取计数）；实现时需保证 `count === null` 时不进 DOM（`v-if` 已覆盖）。
7. `50a` 的「点 `2.2 Positional prior` ⇒ `.page-label` = `第 3 / 3 页`」需经 `waitPage(3, 3)` 之类就绪等待，不能只读一次文本（跳页是异步落地）。
8. 52d 的收尾会把左栏展开（stage 1190 → 914px，仍 ≥ 620），不必为「地图会被卸载」加断言；但若后续有人把窗口改窄，这条隐含前提要一并改。

---

## 代码审查（R9）

> 评审对象：本轮全部产出（新建 `pix/src/renderer/utils/outline-notes.ts`；修改 `pix/src/renderer/utils/notes-path.ts`、`stores/notes-store.ts`、`pages/WorkspacePage.vue`、`components/workspace/{KnowledgeMap,NotesPanel}.vue`、`scripts/ui-shot.mjs`；新增 `docs/pm/R9-dev.md`），对照 `docs/pm/R9-req.md`（N52–N62 与 §0 冻结值）、`docs/pm/R9-design.md`（定稿契约）、本档两份评审的 must-fix。
> 方式：只读走查 + 独立复跑（工程门、两轮新目录离屏取证、自建纯函数烟测与变异对照、基线/像素/字节/状态文件比对）。未改任何产品代码，未执行任何 git 写命令。
> 结论：**approve**，无 must-fix。4 条判据（N57-1/N57-2/N54-8/N56-7）的离屏断言未落地、只有走查与结构判定，见 §4 观察项 1；内容本身可证伪，不阻塞合入。

### 0. 我实际执行的命令与真实结果

| # | 命令 / 动作 | 结果 |
| --- | --- | --- |
| 1 | `cd pix && npm run check` | `CHECK_EXIT=0`，三段 tsc 全过、0 error |
| 2 | `git status --short` / `git diff --stat` | 改动仅本档 + 白名单 6 个文件 + `outline-notes.ts`；`packages/**`、`pix/package.json`、`package-lock.json`、`pix/build`、`pix/src/main/**`、`pix/src/shared/**`、`ReaderPanel.vue`、`PdfViewer.vue`、`ChatPanel.vue`、`utils/reading-context.ts`、`composables/useQuickAsk.ts` 全部零 diff |
| 3 | 独立离屏复跑两次（`PIX_SHOT_ROOT=…/pix-r9-verify`、`…/pix-r9-probe`） | 两次均 `UI_SHOT_EXIT=0`、94 张截图、`MANIFEST.json.failure === null`、目录内无 `99-failure-state.png` |
| 4 | 自建纯函数烟测（仓库外 tsconfig 编译 `outline-notes.ts` + `notes-path.ts`，42 条断言） | `checks=42 failed=0`；变异对照（编译产物 `end = next - 1` → `end = next`）`failed=3`，还原后复绿 ⇒ 断言可失败 |
| 5 | 与改前基线比对（`…/pix-r9-base`，84 条既有测量） | 归一化只去输出根路径 / `updatedAt` / 自动生成笔记 id / 耗时采样后 **84/84 逐字段相等**，0 条缺失、0 条新增异常 |
| 6 | 截图像素比对（Electron `nativeImage.toBitmap()` 逐像素） | 基线 74 张：36 张逐字节相同、**0 张丢失**、新增 20 张；38 张有差异，其中 **25 张在同一份代码的两次运行之间也差异**（时序/抗锯齿抖动），13 张确定性差异为「资料库树新增 `long-book.pdf` 行」（11 张，648 px/图）与 pill/卡片边缘抗锯齿（2 张，119 px/图），无布局位移 |
| 7 | 夹具字节不变性 | 用 `git show HEAD:pix/scripts/ui-shot.mjs` 的 `buildPdf` 与当前 `buildPdf(pages)` 生成同一 `OLDER_PAGES`：**逐字节相同**（md5 `f6b3e924c08a99d6aa791aa327a2500d`，1110 B）⇒ 书签扩展未污染无书签夹具；`writeFixtures` 仅 3 行既有代码被改写（签名、Catalog push、调用点） |
| 8 | 状态文件字节判据是否为空断言（120 ms 轮询 fixture 目录） | 场景 52 期间 `reader-state.json` 由应用真实写出（21:18:30.809，178 B），52g/52h 期间同样存在 ⇒ `stateBytesSame` 不是 `null === null` |
| 9 | 冻结声明值复核（对 probe run 的 6 组 32 条测量逐条比对档内声明值） | 31 条断言全绿（唯一红是我自己的字符串/数字比较笔误）；probe run 与开发 run 归一化后逐字段相等（差异仅耗时采样） |
| 10 | 红线 `grep`（见 §3） | 无命中：`any`、内联动态 import、第二份区间谓词、`scopeDoc`、地图内旧范围实现、`opacity: 0.55` 计数=1、`chapterFilter` 越出 store+NotesPanel |

### 1. 逐条验收（N52–N62）

| 判据 | 判定 | 证据 |
| --- | --- | --- |
| N52-1 单一实现点 | 通过 | `KnowledgeMap.vue` 内 `buildPageLabels`/`buildRangeEnds`/`collectPreorder` 零命中；`collectPreorder` 唯一落在 `outline-notes.ts:37`（`grep` 走查） |
| N52-2 import 面 | 通过 | `outline-notes.ts` 只 import `@shared/types`（type-only）+ `./notes-path`；无 `any`、无动态 import |
| N52-3 范围规则（含钳制/`pageCount 0`） | 通过 | 我的烟测逐条：`end=pageCount`、`start===end ⇒ String(start)`、`page===null` 不入 Map、未展开孙节点在 Map、`pageCount 0 ⇒ +∞` 且 label 单页、`Math.min` 钳制样本 `[5,4]` ⇒ `end 4 / label "5"` |
| N52-4 同页重叠 | 通过 | 烟测：同页两节点 range 相同、同一条笔记两键 `total` 均 1；离屏 `child-badge` 父/子同为 2 行 |
| N52-5 父不覆盖后代 | 通过 | 烟测：`P[1,1]`/`C[2,2]`，第 2 页笔记只计入子 |
| N52-6 页码文本单一来源 | 通过 | 模板只读 `row.pageLabel`（=`ChapterRange.label`），无第二处拼接 |
| N52-7 离屏页码序列 | 通过 | `map-outline.sample` = `["1","2","2","3","3","2-3"]`（唯一文案变化 `Appendix B` ⇒ `2-3` 被钉死） |
| N53 进度行 | 通过 | 走查（单个 `computed`、无第二处算式）+ 离屏 `第 1 / 3 页 · 33%`/`67%`/`100%`、与 `.page-label` 的 N/M 同源、`pageCount===0` 不渲染（53c 加载窗口）、无书签文档仍渲染（50c `第 1 / 2 页 · 50%`） |
| N54 徽标与两类明细 | 通过 | 离屏逐行数字与 title 逐字、4 个徽标、几何 `16px/999px/10px/1px`、0 条行 `childCount===2`、开关 ON/OFF 数值不变、无徽标行页码几何与声明值一致 + `overflowFree`；边界（`page 9`、另一文档、`docKey null`）由我的烟测覆盖 |
| N55 点击徽标 | 通过 | 离屏：切「笔记」标签、条文本/title 逐字、行数≡徽标数、`.notes-group===1`、阅读页与 `.current` 不变、折叠态展开（`leftWidth 268`）、重复点击仍切标签、替换无累积、`notes.json`/`reader-state.json` 字节不变；`focusChapter` no-op 闸门走查（store 不在烟测面内） |
| N56 过滤条与 AND | 通过 | 离屏：DOM 顺序（`compareDocumentPosition` 三元素同现）、两态行 2/组 1/`本章 2 条 / 共 4 条`、OFF 态 `checked===false`、清除回 `共 4 条`、章节空态 `本章暂无笔记` + 条仍在、error/loading 不渲染且状态保留；判定式唯一由 `grep`+烟测双向确认 |
| N57 边界与零残留 | 通过（2 条走查） | 走查：`reading-context.ts`/`ChatPanel.vue` 零 diff、清除点恰三处、不写盘；离屏：过滤态选择集/注入不变（`已选 2 条`/`摘录 2 条`/2 条 `reader_notes`）、切文档清除且不回填、`focus-once`（`notesLoad` 70→70、重进后 `tab=library`、面板不可见）。**N57-1 导出全量与 N57-2 过滤态跳回原文无离屏断言**（见 §4-1） |
| N58 已读弱化 | 通过 | 离屏三页读数 0/1、1/3、3/3，`.read.current` 恒 0、已读行 `opacity 0.55`、当前行 `1`、无页码行豁免且点击仍展开孙行、已读行徽标仍可过滤；`opacity: 0.55` 全文件 1 处、无新色值/未动 `BRANCH_COLORS` |
| N59 规模与复杂度 | 通过（1 处字面偏差） | 走查：notes 恰好一次遍历 + 双前缀和、无逐页累加、模板无按行取计数、计数 computed 依赖不含 `page`/`expanded`；烟测：200+ 键差分与朴素实现逐键相等；离屏：420 节点/220 可见行/22 徽标/`第 1 / 60 页 · 2%`/耗时 86–88 ms（≤800 ms）。**ranges 被遍历两次**（求 `maxPage` + 计数），见 §4-2 |
| N60 烟测面 | 通过 | 我独立复刻该面并跑绿（42 条）；脚本已删除、仓库零残留 |
| N61 取证面 | 通过 | `buildPdf(pages, outline=[])` 契约（`/First` 间接引用、`page===null` 不输出 `/Dest`、对象号不变）+ 4 份声明表 + `long-book.pdf` + `SEL` 10 项 + 50–55 场景 + 6 组 32 条断言 + 20 张新截图齐备；基线比对见 §0-5/6 |
| N62 回归与零外溢 | 通过 | 既有 84 条测量与基线逐字段相等、截图只增不减且 0 丢失、`failure===null`、退出码 0、check 0 error、白名单与受保护路径零 diff、未触发即无痕（36 张既有截图逐字节相同） |

### 2. 三个「最可能出错但没人验证」的点（我的判定）

1. **嵌套/同页章节的笔记被重复计数 ⇒ 徽标撒谎**：判定为**非缺陷**。计数与过滤共用同一 `rangeContains` 与同一份 `ranges`，我在烟测里对每个键做了「`total` ≡ 该范围 `matchesChapterFilter` 命中条数」的恒等式断言（含 200 键差分）全绿；离屏侧 `2. Method Overview` 与 `2.1` 同为 2 行 ≡ 徽标 2。重复计入是需求 §0.1 显式声明的定义（父节点范围是页码范围而非子树范围），且与既有 `isCurrent` 口径一致。
2. **点击徽标后残留标记反复抢标签**：判定为**非缺陷**。token 单调 + watcher 首句 `token<=0||token<=previous` 守卫，`resetNotes` 归零不构成聚焦请求；全仓无「读 `chapterFilter` 切标签」路径（`grep` 0 命中）；离屏 `goHome` 前后 `notesLoad` 70→70、重进工作区后活动标签「资料库」且面板不可见，与我的两轮复跑一致。
3. **过滤 ∩「仅看当前文档」时的计数/空态误判**：判定为**非缺陷**。分支优先级把章节空态放在 `.notes-filtered-empty` 之前，`countLabel` 以 `chapterFilter` 优先；离屏两态同结果（行 2/组 1/`本章 2 条 / 共 4 条`，`checked` 真值随用户选择）且删空后为 `本章暂无笔记` + `本章 0 条 / 共 3 条` + 条仍在。
4. **（附加）书签夹具污染既有场景**：判定为**非缺陷**。`outline` 缺省时 `buildPdf` 产物逐字节不变（§0-7）；既有 84 条测量与基线相等；树新增行位于末行，既有行位置不动（像素差异仅该行文本与相对时间文案）。

### 3. 红线核对（全部通过）

无 `any`、无内联动态 import（改动的 6 个文件 `grep` 0 命中）；UI 文案全中文；无新依赖（`package.json`/`package-lock.json` 零 diff，未出现 d3/markmap/虚拟滚动）；模板内无按节点遍历笔记的调用（徽标只读 `MapRow.count`）；判定式唯一；存储路径未在渲染层拼接；未新增 IPC/落盘字段；未做向后兼容层。

### 4. 观察项（非阻塞，不构成本轮 must-fix）

1. **4 条判据只有走查/缺断言**：N57-1（过滤生效时导出仍全量）、N57-2（过滤态点行跳回原文）、N54-8（错误态徽标照旧）、N56-7（删除被过滤隐藏的笔记）。内容可证伪——导出在主进程按 `notes.json` 全量渲染（`pix/src/main/notes-store.ts:355`，主进程零 diff）、行点击处理器与 `applyNotes`/选择集派生均未改——但 `ui-shot.mjs` 无对应断言，需求档的【离屏】标注与实际证据面不符。建议下次迭代在 52 段顺带补 4 条断言。
2. **`countNotesByChapter` 两次遍历 ranges**（`outline-notes.ts`：先求 `maxPage`、再计数），与 N59-1 字面「对 ranges 的遍历恰好一次」不符；这是设计档 §1.1 冻结「前缀和长度取 `maxPage+1`」的必然结果，复杂度仍 O(n+m)，无功能或性能影响。
3. **`%TEMP%/pix-r5/shots/99-failure-state.png` 是 20:45 失败 run 的残留**（成功 run 不清理该文件）。冻结判据 `MANIFEST.json.failure === null` 与最终 run 的 94 张截图均成立（我在两个新目录的复跑里均无此文件），但建议脚本启动时删除该文件，并避免在开发档里写成「无写入」。
4. **设计档字面与实测的 3 处差异**（52f2 计数 `共 3 条` vs 档内 `共 4 条`、54 段取数顺序、截图下限 74 vs 75）已被开发档 D3/D2/D8 显式记录，处置口径（以契约公式与可判定性为准）判定可接受。
5. `NotesPanel.vue` 新增样式逐字对齐既有同类规则（`.notes-chapter-empty` ← `.notes-filtered-empty`、清除按钮 ← `.notes-selection-clear`），未新增颜色变量；`#fff` 复用既有 `.page-badge` 字面量，未触碰 `BRANCH_COLORS`。

### 5. 未验证 / 不可验证

- 「阅读区宽度 < 620 px ⇒ `.map-toggle:disabled`、地图不卸载 ⇒ 无徽标可点」只有走查（`ReaderPanel.vue` 零 diff）；1600×1000 窗口下不可达，未做窄窗取证。
- `focusChapter` 的 no-op 闸门、watcher 守卫的时序只有走查（store 依赖 vue/pinia 与 `window.pixApi`，不在 N60 烟测面内，与设计档证据面更正一致）。
- DPI ≠ 1 与更窄窗口下的徽标换行/省略行为未取证（`overflowFree` 只在 dpr=1 的 1600 px 面内断言）。
