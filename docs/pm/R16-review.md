## 需求评审（R16）

评审对象：`docs/pm/R16-req.md`（703 行，本轮全文读取）。
评审角色：独立挑刺。本轮只读文件、只写本档；不跑离屏取证、不动源码、不跑任何 git 写命令。`git status --short` 在本档落盘后只有两条未跟踪项：`?? docs/pm/R16-req.md`、`?? docs/pm/R16-review.md`。

### 0. 本轮核对用到的真实证据

| 证据 | 真实结果 |
| --- | --- |
| 基线产物目录读数 | `C:/Users/86157/AppData/Local/Temp/pix-v05-r15-final/shots`：`MANIFEST.json` ⇒ `shots.length = 153`、`failure = null`；`MEASUREMENTS.json` 长度 223、label 去重 59；目录内 png 153（本轮 `node -e` 复读） |
| 命名预检（本轮全部为新增名） | `grep -rn` 逐名计数（`pix/src`）：`page-notes` / `countNotesByPage` / `PageNoteCount` / `pix-note-anchor` / `foldText` / `matchExcerpts` / `MAX_ANCHOR_TEXT_LENGTH` / `ANCHOR_LAYER_WAIT_MS` / `ANCHOR_HIGHLIGHT_MS` / `focusPageNotes` / `pageFocusToken` / `pageFocusPage` / `is-anchored` / `pageFilter` / `pageOnly` / `pageRange` / `本页 ` / `本页笔记不在当前筛选结果中` **全部为 0**；`pix/src/renderer/utils/page-anchor.ts` 不存在；`ui-shot.mjs` 内 `r16` 出现 0 次 |
| 既有计数项 | `grep -c "for (" notes-path.ts` = **3**（`:75` / `:94` / `:118`）；`grep -rn "pix-search" pix/src | wc -l` = **4**；`grep -c "::highlight(" PdfViewer.vue` = **3**（`:1301` 注释 + `:1303` / `:1307` 两条规则）；`grep -c "addEventListener" PdfViewer.vue` = **2**（`:458` / `:860`）；`grep -c "ipcMain\|ipcRenderer\|pixApi" PdfViewer.vue` = **2**（`:676` / `:739`）；`grep -rn "notesStat\|notesLoad\|notesAdd\|ipcRenderer" PdfViewer.vue` = **0** |
| 夹具与匹配事实（本轮离线复算） | `ui-shot.mjs:211-232` 的 `SAMPLE_PAGES` 按行折叠后：页 1 含标准种子 `n-current-1` 摘录（`indexOf` = 54）；页 2 摘录折叠长度 333 > 页 2 折叠长度 192 ⇒ 不可匹配；页 3 摘录命中（`indexOf` = 14）；三条摘录折叠长度 92 / 333 / 63，均 ≤ 400 |
| stub 面 | `ui-shot.mjs:825-1168` 的 `api` 面 **42** 方法，`pix/src/main/preload.ts:35-110` 的 `PixApi` **42** 方法，逐名相等 |
| 未执行（本轮禁止） | 离屏 `ui-shot.mjs`、基线复跑、`npm run build` / `npm test` / `npm run package`、`npm run check`（本轮未必要） |

### 1. 逐条结论

#### 1.1 N91 标记位置与既有页面结构 —— 机制成立，两处口径需收紧

- **定位上下文成立**：`.pdf-page { position: relative; margin: 0 auto 16px }`（`PdfViewer.vue:1063-1068`）⇒ 标记的 `absolute` 定位以页面盒为基准；`.pdf-page` 无 `overflow` 裁剪 ⇒ 贴角标记不会被切。
- **缩放几何成立**：页盒宽高由 `:style` 的 `cssSize`（`:103`）+ 缩放重排驱动，标记的定位量（`right` / `bottom`）与页盒尺寸无耦合 ⇒ 缩放不改变相对位置规则。
- **框选与截图链路成立**：`.capture-layer`（`:1114`）是 `.pdf-scroll` 的兄弟、`inset: 0`、`z-index: 5`，标记 `z-index: 3`（同层叠上下文、DOM 在后者在上）⇒ 框选模式下点击被拦截的结论为真；`captureRegion` 只读 `target.querySelector("canvas")`（`:594`）⇒ 标记不进截图内容；`clearPageLayers`（`:181`）只清 canvas 与 `.textLayer` ⇒ release / 缩放不碰标记；渲染期零新增 `querySelector`（标记是模板节点，不受 `pageElement` / `observePages` 影响）。
- **页码 pill / 章节 chip 的层级事实**：`.pdf-page-indicator`（`:1244`，`bottom: 12px` 居中）、`.reader-section`（`:1209`，`bottom: 46px` 居中）、`.pdf-toolbar`（`:1034`）与标记同为 `z-index: 3`，DOM 靠后者在上（控件在后）⇒ 一旦重叠，是「控件压标记且拦截点击」，不是相反。是否重叠取决于「页右缘的水平位置（居中页宽随缩放变化）」与「页面底边在视口内的垂直位置（随滚动变化）」，不是可由固定 `right/bottom` 保证的不变量；夹具的静止几何（`.pdf-scroll` 的 `padding-bottom: 48px` 使文档末尾页底距阅读区底 ≥ 48px，指示器 / 章节件水平居中）只是特例，N91-1 判据 3 因此可过。
- **需收紧**：见 must-fix M6（§0.3 位置约束③ 与 §0.1「不覆盖 `.textLayer` 可选择区域」的全局措辞不可实现；两者都只在夹具口径下成立）。

#### 1.2 N92 定位与既有过滤 / 返回路径 / 面板未打开 —— 面板与过滤面成立，loading 窗口不成立

- **面板未打开 / 左栏折叠**：行为明确且可判定。`WorkspacePage.vue:204-212` 的 `selectLeftTab`、`:215-221` 的 `chapterFocusToken` watcher 判据逐字为 `token <= 0 || token <= previous`（与档 §0.4 要求同构）；`NotesPanel` 与 `LibraryPanel` 都是 `v-show` 常挂载（`WorkspacePage.vue:291-292` / `:298-299` 两处）⇒ token watcher 在 token 变化时必然已注册，`await nextTick()` 能拿到已切显的 DOM。
- **不新增过滤维度**：`grep -rn "pageFilter|pageOnly|pageRange" pix/src` = 0；N92-1 判据 4 的可判定式成立。
- **三维过滤语义不打架**：面板行序实际由 `groupNotesByDocument`（分组、page 升序）→ `applyViewToGroups`（`notes-view.ts:56-63`：搜索过滤 + `sortNotesForView`）决定；`sortMode = "created"` 时组内行序会重排，档 §0.4 的括号注「行序由 groupNotesByDocument 的 page 升序决定」不准确，但「DOM 顺序的第一行」这一定义本身不受影响 ⇒ 判据可判（建议删掉该括号注）。
- **「返回路径」表述不实**：见 must-fix M7。
- **致命缺口**：`locate-panel-closed` 相位（N92-2 判据 1/2）必然经过 `loadNotes()` 的 loading 窗口，而 loading 期间整个 `.notes-list` 从 DOM 消失 ⇒ 按 §0.4 冻结的「单次 `await nextTick()` + 查行」必然落空并走退化提示。见 must-fix M1。

#### 1.3 N93 匹配规则 / 夹具 / Highlight 兼容与清理 —— 规则与夹具可判定，三处需补

- **匹配规则可判定**：§0.6 把折叠（假分隔符 → `\s+` → 单空格 → `trim` → `toLowerCase`）、子串、每条每页最多一处、重叠整体丢弃、超长 400、空串、不跨页全部写死；`at` 回溯表的两条结构性不变量（长度 = `text.length`、非 -1 下标严格递增）可被判；「起点/终点必为真实字符」的推理成立（两侧都 trim ⇒ 匹配端点不可能是折叠出来的空白）。
- **不可匹配 / 超长 / 重复 / 跨行处理都写死** ⇒ 无「未定义行为」空档。
- **夹具可构造**：`buildPdf`（`ui-shot.mjs:131-209`）逐行 `Tj`，pdf.js 4.10.38 的 TextLayer 逐文本项落一个 `span`（R15 基线 `spanCount = 6` 与 6 行夹具一一对应；`#appendText` 见 `node_modules/pdfjs-dist/build/pdf.mjs:11057`），`hasEOL` 时追加 `<br>`（`:11129-11131`）⇒ 片段 = 文本节点、假分隔符正对行边界；本轮离线复算得页 1 命中、页 2 不可匹配、页 3 命中，与 `seedNotes()`（`:332-379`）声明一致；`MAX_ANCHOR_TEXT_LENGTH = 400` 对三条摘录都不触发，边界用例只能来自烟测夹具（档已写死 401/400 边界，可构造）。
- **CSS Custom Highlight API 兼容与清理**：注册表纪律（各删各名）与「无高亮 ⇒ 删除注册表」可判；清空四条时机只有 ③（页面 release）缺少运行期断言，仅走查计数兜底（可接受）；**等待窗口缺「作废」语义**（见 must-fix M10）；`CSS.highlights` 写接口的本地类型未登记（见 must-fix M11）。
- **样式入口计数口径有歧义**：见 must-fix M12。

#### 1.4 N94 边界穷尽性 —— 大体穷尽，四点缺口

- 已写死并可判：0 笔记页 / 0 笔记文档 / 越界页、非 PDF（`grep` 判据）、加载中 / 失败 / `pageCount === 0`（无 `.pdf-page`）、无文字层与未就绪（静默 + 超时放弃）、缩放与 release、外部改动 + 刷新、面板内增删改 / 撤销、不可匹配 / 超长 / 库外 / 框选模式。
- 缺口：① 「缩放级联（`ZOOM_COALESCE_MS` 合并窗口内不重复绘画）」只有行为描述、**无任何判定式**（N94-4 表第 3 行）；② 等待窗口内当前页 / 文档 / 缩放变化未定义（M10）；③ 外部刷新只有「当前页高亮消失」的反向断言，缺「刷新后当前页重新出现可匹配摘录 ⇒ 重画」的正向断言；④ `notes.json` 读取失败（`status = 'error'`，`notes.value` 保留上次列表，`notes-store.ts:228-262`）时标记的数据来源未写死。

#### 1.5 N95 可构造性与空断言 —— helper 与行号全部为真，五处按现文不可构造

- **行号与名字全部核对为真**（抽查全部命中）：`SEL` 60 项 `:47-113`；`openRow` `:1706`；`clickNext` / `clickPrev` `:1715-1716`（定义在 `runReaderStateScenarios` 内，追加到函数末尾可用）；`readNotes` / `notesHash` `:2375-2376`；`rectOfSelector` `:2564`；`rowFinder` `:2963`；`enterCleanWorkspace` `:3392`；`openNotesPanel` `:3405`；`restoreStandardSeed` `:3411`；`loadCalls` `:4350`；`openMap` `:4376`；`clickMapBadge` `:4455`；`enterMapWorkspace` `:4492`；`backToLibraryTab` `:4506`；`waitNotesTab` `:4510`；`enterNotesProbe` `:5211`；`setSearch` `:5220`；`groupHeads` `:5294`；`deleteRowByText` `:5309`；`clickUndo` `:5349`；`notesNotice` `:5356`；`narrowProbe` `:5655`；`r15-f18`（label `r15-capture-region`）`:6675-6760`；`clickEl` `:7268`；`triggerWindowFocus` `:8404`；`writeNotesOutside` `:8487`；`appendExternalNote` `:8489`；`r15-f16` `:9199-9249`；`runReaderStateScenarios` 收口 `:9250`；`record` 先落测量再抛错 `:1603-1608`。
- **可构造性缺口（不可按现文执行）**：M2（SEL 键冲突 + 页级截图裁错）、M4（PDF 搜索入口）、M5（夹具条数）、M8（缺开地图步骤）、M9（翻页采样序列）。另有 M1（定位在 loading 窗口下不可达）直接命中 `r16-2` 的 `locate-panel-closed`。
- **空断言风险**：`pageNotesProbe` 的「标记矩形 ∩ span 矩形 = ∅」在该页文字层尚未渲染 / 已被 release 时恒真（集合为空）；判据只对页 1 钉了 `spanCount = 6`，页 2 / 页 3 没有防空读数。建议每页同时断言 `spanCount > 0`。
- **其它可判性确认**：`r16-1` 的 `deleteRowByText("Table 2 repo")` 与 `seedNotes` 的正文前缀一致（`.note-row .note-text` 含该子串）；`setSearch("Reproducibility")` 只命中 `n-other-1`（`ui-shot.mjs:361-369`）⇒ 退化相位的行数断言成立；`clickMapBadge("2. Method Overview")` 的行存在（`mapRowExpr` 按 `.map-row .label` 逐字匹配，`SAMPLE_MAP_EXPECT` 声明表内含该标题）。

#### 1.6 白名单与改动一一对应 —— 映射完整；一处未登记

- 逐项对账成立：8 个文件（`notes-path.ts`、`page-anchor.ts`、`PdfViewer.vue`、`notes-store.ts`、`WorkspacePage.vue`、`NotesPanel.vue`、`smoke-view.mjs`、`ui-shot.mjs`）与 N91–N95 的映射无遗漏；`smoke-view.mjs` 的 `files` / `required` / `allowed` 各追加 1 项与 `pix/scripts/smoke-view.mjs:521-540` 的真实结构一致（显式登记变更，合理）；`pix/package.json` / `main/**` / `shared/types.ts` / `smoke-notes.mjs` / `PdfSearchPanel.vue` 零改动与 stub 面 42 方法一致。
- **全局类型面结论**：`Highlight` 与 `HighlightRegistry` 已有全局声明（`pix/node_modules/typescript/lib/lib.dom.d.ts:14314` / `:14320`），**不存在缺失的全局注册文件**；缺的只是 `HighlightRegistry` 的写方法（只有 `forEach`），既有实现以本地类型 + 断言绕过（`PdfSearchPanel.vue:19-20` / `:91-92`），R16 需要在 `PdfViewer.vue` 内重复这一手 —— 见 must-fix M11。

### 2. must-fix 清单（阻塞项，按严重度排序）

**M1｜定位动作在「面板刚触发 `loadNotes` 的 loading 窗口」下不可达，且退化文案会说错**
- 证据（真实代码）：`WorkspacePage.vue:204-212` 的 `selectLeftTab` 在切到 `notes` 时执行 `void notesStore.loadNotes()`（`:210`）；`notes-store.ts:228-231` 的 `loadNotes` 第一句是 `status.value = "loading"`；`NotesPanel.vue:638/642/674/680/682` 是 `v-if / v-else` 链，`status === 'loading'` 分支把整个 `.notes-list`（含全部 `.note-row`）移出 DOM。
- 证据（档内矛盾）：§0.4 冻结「定位动作 = `await nextTick()` 之后查目标行 + `scrollIntoView`」，同时把「面板处于 loading」写进「不可达退化 ⇒ 逐字 `本页笔记不在当前筛选结果中`」；N92-2 判据 1/2 的 `locate-panel-closed` 相位却要求先 `backToLibraryTab()`（切到 library）再点标记 ⇒ `selectLeftTab("notes")` 必然触发一次 `loadNotes()`（判据 2 自己允许 `notesLoadCalls()` 增量 ≤ 1）⇒ 必然出现 loading 窗口，而同一相位断言 `.note-row.is-anchored` 在场。同一次 flush 内 watcher 先跑、渲染 effect 后跑，`nextTick` 续体在 loading 渲染之后、列表恢复渲染之前执行 ⇒ 单次 `await nextTick()` 后查不到行。
- 修法：把定位动作改为**有界等待**（等 `status === 'ready'` 且目标行在 DOM，超时才走退化），或让 loading 期间保留列表 DOM；并把「loading」从「不在当前筛选结果中」这条文案里摘出（loading 不是筛选结果问题）。§0.4、N92-2 判据与 `r16-2` 的 `locate-panel-closed` 相位需同步改。

**M2｜新增 SEL 项 `pdfPageOne` 与既有项同名不同义（冻结面冲突 + 页级截图裁错）**
- 证据：`ui-shot.mjs:59` 现为 `pdfPageOne: '.pdf-page[data-page="1"] .textLayer span'`，既有使用点 `:1345`（等文本层就绪）、`:1381` / `:1429` / `:1457`（在页 1 文字层上建 Range）；而 §0.8 拟新增 `pdfPageOne: '.pdf-page[data-page="1"]'`，N95-2 判据 2 又冻结「既有 SEL 零改写」⇒ 互斥。按字面覆盖键会改变 06 / 06b / 06c / 06d / 06e 的取点语义；N95-2 判据 3「页级用 `rectOfSelector(SEL.pdfPageOne, 8)`」按现值会裁到首个 span（R15 基线 `firstSpan` = 387×20）⇒ `r16-1` / `r16-3` / `r16-3b` / `r16-3c` / `r16-4` / `r16-4b` / `r16-5b` 等页级截图拍不到标记或高亮，§0.9 的逐张目视比对失去证据。
- 修法：另起新键（如 `pageBoxOne`），`SEL` 增量仍为 4；`pdfPageOne` 逐字不动；N95-2 判据 3 同步改名。

**M3｜`releasePage` 的「函数体零 diff」与注册表清空时机③互斥**
- 证据：§0.3 与 N91-4 判据 2 要求 `pageElement` / `observePages` / `updateCurrentPage` / `releasePage` / `clearPageLayers` / `captureRegion` / `toLayerPoint` / `onCapturePointerDown` 函数体零 diff；而 §0.5 清空时机③、N93-3 判据 4、N94-4 判据 3 要求在 `releasePage` 内清注册表。`releasePage` 的调用点只有两处：scale watcher（`PdfViewer.vue:818-824`）与 IO 回调（`:281`，属 `observePages` 函数体，也在零 diff 名单内）⇒ 不存在「不动这些函数体」的落点。
- 修法：把零 diff 口径改成 §7 已有的「既有分支语义不变」，并明确列出允许新增调用的四个点（`releasePage` / `loadPdf` 起始段 / scale watcher / `onBeforeUnmount`）。

**M4｜`r16-4` 的搜索驱动用了笔记面板的 helper（PDF 搜索面板无入口）**
- 证据：`setSearch`（`ui-shot.mjs:5220`）与 `searchProbe`（`:5231`）只操作 `SEL.searchInput` = `.notes-search-input`（`:73`）；PDF 搜索面板的输入是 `.search-input`（`PdfSearchPanel.vue:404`）、「下一处」是 `.pdf-search-panel button[title="下一处"]`（`:421`），两者都不在 `SEL`（只有容器 `SEL.pdfSearchPanel` `:82`）。⇒ 按档文 `setSearch("retrieval")` 不产生 `pix-search`，`waitFor` 必超时；「点下一处」无既有 helper / 选择器。
- 修法：登记 PDF 搜索输入 helper（或写死字面量选择器）与「下一处」定位式，并说明这不是复用 `setSearch`；若选择器要进 `SEL`，需说明 `SEL` 增量由 4 改为 6 的配额变更。

**M5｜`seedR16Focus()` 条数自相矛盾（14 ≠ 4 + 10 + 1），且 `docPath` 口径冲突**
- 证据：§0.8 第 2 行写「14 条：标准 4 条 + 10 条页 2 填充摘录 + 1 条页 3 摘录 …，`docPath` 全部为 `sample-paper.pdf`」；标准种子的第 4 条 `n-other-1` 的 `docPath` 是 `archive/older-paper.pdf`（`ui-shot.mjs:361`）。`r16-2` 前置 `enterNotesProbe(seedR16Focus(), 14)` 会按 `openNotesPanel(14)` 等「`.note-row` 恰 14」（`:3405-3408`）；N92-3 与 `r16-1` 的多个读数也建立在这个行数上。
- 修法：写死 14 条的逐条构成（并交代是否保留 `n-other-1`），或把等待行数改成与构成一致的数。

**M6｜§0.3 位置约束③ 与 §0.1「不覆盖 `.textLayer` 可选择区域」的全局措辞不可实现**
- 证据：标记固定 `right: 6px; bottom: 6px`，页面无 `overflow` 裁剪；`.pdf-page-indicator`（`PdfViewer.vue:1244`，`bottom: 12px` 居中）与 `.reader-section`（`:1209`，`bottom: 46px` 居中）是视图层控件，与标记同为 `z-index: 3` 且 DOM 在后 ⇒ 页面贴底 / 页面宽于视口需横向滚动时可能重叠并被拦截点击；`.textLayer` 是 `inset: 0` 的整页层（`:1076`）⇒ 右下角常驻标记在正文铺满的真实 PDF 上必然覆盖部分文字层。N91-1 判据 3 是夹具口径，无法支撑全局措辞。
- 修法：把③限定为夹具相位内的几何判据；§0.1 改成「不改变文字层 DOM 与几何，允许在右下角覆盖标记自身面积（登记取舍）」；并登记「同 z-index 时 DOM 靠后者在上」的既有层叠事实。

**M7｜§0.0 第 1 条的「返回路径 / 可见集合零变化」与 §0.4 的「清章节过滤」互斥**
- 证据：§0.0 第 1 条称「『返回路径』由『列表可见集合零变化』自然满足（见 N92-1 判据 2 与判据 5）」，第 2 条又冻结「点击页标记清除既有章节过滤」；`r16-2` 的 `degrade-filters` 相位与 N92-3 判据 3 据此断言 `.notes-chapter-filter` 从在场变不在 DOM，而 N92-1 判据 2（点击前也没有）只在无过滤时成立 ⇒ 可见集合在这种情形下必然变化（变宽），且被清除的章节过滤没有一键回退（只能经地图徽标重建；`chapterFocusToken` 是一次性信号，`WorkspacePage.vue:215-221`）。
- 修法：§0.0 第 1 条改写为「唯一被改动的视图状态 = 章节过滤被单向清除（不可一键回退，可由地图徽标重建）」；「零变化」只对搜索 / 排序 / 仅看当前文档 / 选择集 / 阅读位置 / 缩放成立。

**M8｜`r16-2` 的 `degrade-filters` 相位缺「开地图」步骤，按现文不可执行**
- 证据：`.map-row` 只在 `showMap` 为真时渲染（`ReaderPanel.vue:207`；`showMap = readerStore.mapOpen && isPdf && mapFits`，`:62`）；`clickMapBadge`（`ui-shot.mjs:4455`）找不到 `.map-row` 直接 throw。相位的入口 `enterNotesProbe()` → `enterMapWorkspace()`（`:4492`）只做 `enterCleanWorkspace` + `waitTreeRows(5)`，不含 `openMap()`（`:4376`，也不在档 §0.8 的复用 helper 名单里）；且 `enterCleanWorkspace` 先 `goHome()`，`goHome` 会 `readerStore.setMapOpen(false)`（`WorkspacePage.vue:249`）⇒ 相位开始时地图必关。
- 修法：把开图步骤写进相位前置并加入复用 helper 名单；登记「开图后舞台变窄」对同相位其它断言无影响。

**M9｜N93-4 的 10 次翻页采样序列不可执行**
- 证据：`clickNext` / `clickPrev`（`ui-shot.mjs:1715-1716`）点 `.pdf-page-indicator` 的两个按钮；`PdfViewer.vue:993-994` / `:1016-1017` 在首页 / 末页把按钮置 `disabled`，禁用 `<button>` 不派发 click ⇒ 夹具只有 3 页时「下一页」连点会在第 3 页卡住，`.page-label` 不再变化，`waitFor` 20s 超时。档文只写「连续点『下一页 / 上一页』共 10 次」，未写死方向交替。
- 修法：写死序列（如从第 1 页起 next/prev 交替 10 次，或先断言目标按钮未禁用），并让「两次进入同一页」的读数点与该序列对齐。

**M10｜等待窗口缺「本次等待作废」语义**
- 证据：§0.5 只写「按帧轮询等待，上限 2000ms；超时即放弃本次绘画」，未定义等待期内当前页 / 文档 / 缩放变化时的处理；既有搜索侧有对应范式（`PdfSearchPanel.vue:193-218` 的 `waitForTextLayer` 内 `token !== revealToken ⇒ resolve(null)`，`revealToken` 每次 reveal 前 +1）。缺此语义时，旧页的等待可能在翻页后写出注册表 ⇒ 违反「只画当前页」，N93-3 判据 1/2 会红。
- 修法：把「等待期内 `readerStore.page` / 文档 / 缩放任一变化即作废（丢弃、不写注册表）」写进 §0.5，并补一条可判定式（例如快速连续翻页后锚点区间所属 `.pdf-page` 恒等于当前页）。

**M11｜`CSS.highlights` 写接口的本地类型未登记（白名单 / 名字表缺项）**
- 证据：`typescript@5.8.3` 的 `lib.dom.d.ts:14320-14322` 的 `HighlightRegistry` 只声明 `forEach`（无 `set` / `delete` / `has` / `get`）；既有实现以本地 `HighlightRegistryWriter` + 断言绕过（`PdfSearchPanel.vue:19-20` / `:91-92`）。R16 要在 `PdfViewer.vue` 内 `set` / `delete`，必须同样绕（工程红线禁 `any`），而 §0.8 的名字清单与 §7 的 PdfViewer 改动点均无此项。
- 修法：登记该本地别名与落点（`PdfViewer.vue` 顶层，不新建文件、不改 `env.d.ts`），并在 §0.0 第 3 条补一句「第二份 write 类型是刻意重复（不抽共享模块，理由同不抽 `paintHighlights`）」。

**M12｜N93-2 判据 4 的「`::highlight(` 规则数 = 3」没有可复跑命令，按字面 grep 为 4**
- 证据：`grep -c "::highlight(" PdfViewer.vue` 现值为 **3**（`:1301` 注释里的 `::highlight() cannot be scoped;` + `:1303` / `:1307` 两条规则）；新增第三条后字面 grep = 4，与判据写的 3 冲突；而该判据是【走查】项，未给命令。
- 修法：给出可复跑判据（例如 `grep -cE "^::highlight\("`，现值 2、改后 3），或明确「规则数」按 `document.styleSheets` 读法统计，并说明注释行不参与计数。

### 3. 非阻塞观察（建议，不影响定稿结论）

1. **防空补充**：`pageNotesProbe` 建议对每页同时断言 `spanCount > 0`（否则页 2 / 页 3 文字层未渲染时「标记矩形 ∩ span 矩形 = ∅」恒真，判据只钉了页 1）。
2. **N94-4 表第 3 行**（`ZOOM_COALESCE_MS` 合并窗口内不重复绘画）无判定式，建议补可复跑断言或降级为「实现自由」。
3. **N94 补两条边界**：外部刷新后「当前页重新出现可匹配摘录 ⇒ 重画」的正向断言；`status = 'error'`（读取失败，`notes.value` 保留上次列表）时标记的数据来源。
4. **常量计数口径偏紧**：`ANCHOR_LAYER_WAIT_MS` 写死「恰 2 处」（定义 1 + 使用 1）会限制实现（等待函数与触发点各引用一次即破 2），建议改成「定义 1 + 使用 ≥ 1」。
5. **行序注释**：§0.4 的「行序由 `groupNotesByDocument` 的 page 升序决定」应删除或改为「DOM 顺序（搜索 / 排序可重排，判定只看 DOM 顺序）」，实测排序管道是 `applyViewToGroups` → `sortNotesForView`（`notes-view.ts:44-63`）。
6. **N92-1 判据 5 的 grep 口径**：`grep -c "pageFocusToken"` = 4 依赖「声明 / 复位 / 递增 / return」各占独立行且无注释提及该名，建议在判据里补一句「不得在注释中出现该标识符」。

### 4. 结论

需求档的**事实基线扎实**：本轮抽查的 30 余处行号 / 常量 / 计数（含 `SEL` 60 项、`clickNext` / `clickPrev` 的作用域、`record` 的先落测量语义、153 / 223 / 59 基线读数、42 = 42 的 stub 面、`for (` 3 处、`::highlight(` 3 处、`addEventListener` 2 处）**逐条为真**；N91–N94 的行为写死程度与 N95 的证据设计整体达到「可判定」要求；`PdfSearchPanel.vue` 零改动、零 IPC、不改 `notes.json`、不引依赖的边界也成立。

但存在 **12 项 must-fix**，其中 **M1（loading 窗口下定位不可达 + 退化文案说错）与 M2（SEL 键名冲突导致页级截图失效）会直接让 `r16-2` / `r16-1` / `r16-3` 等相位红或在无证据的情况下「看起来绿」**；M3–M12 分别命中「冻结条款互斥」「夹具条数矛盾」「helper 用错」「不可执行的采样序列」「缺作废语义」「类型面未登记」「计数口径歧义」。建议在进入设计档前先修 M1 / M2 / M3 / M5 / M8（这五项会改变档内配额与相位结构），其余可在设计档内以显式登记方式收敛。

---

## 设计评审（R16）

评审对象：`docs/pm/R16-design.md`（1071 行，本轮全文读取）。评审角色：独立挑刺。本轮只读文件、只写本档，未跑离屏取证、未跑 build / test / package、未动任何源码或脚本、未提交。

### 0. 本步用到的真实证据（可复跑）

| 证据 | 真实读数 |
| --- | --- |
| 仓库状态 | `git status --short` ⇒ `?? docs/pm/R16-design.md` / `?? docs/pm/R16-req.md` / `?? docs/pm/R16-review.md`；`git log --oneline -1` ⇒ `dbc2a58 docs: V0.6 迭代路线与 PRD（R16-R20）` |
| 规模 | `wc -l`：`PdfViewer.vue` 1311 / `notes-path.ts` 138 / `notes-store.ts` 535 / `NotesPanel.vue` 1572 / `WorkspacePage.vue` 461 / `PdfSearchPanel.vue` 484 / `ui-shot.mjs` 9407 / `smoke-view.mjs` 587 |
| `SEL` 现值 | `sed -n '47,113p' ui-shot.mjs \| grep -cE "^\s+[A-Za-z][A-Za-z0-9]*:\s"` ⇒ **60**（设计档 §0.1 与 §2.2 #9 写 64，见 F10） |
| 既有正则计数 | `grep -c "HighlightRegistryWriter" PdfSearchPanel.vue` ⇒ **3**（`:19` / `:91` / `:92`）；`grep -c "notes-notice" NotesPanel.vue` ⇒ **4**（`:574` / `:1006` / `:1017` / `:1022`）；`grep -rn "pix-search" pix/src \| wc -l` ⇒ **4**；`grep -c "addEventListener" PdfViewer.vue` ⇒ **2**；`grep -c "setInterval" PdfViewer.vue` ⇒ **0**；`grep -c "for (" notes-path.ts` ⇒ **3**（`:75` / `:94` / `:118`）；`grep -cE "^::highlight\(" PdfViewer.vue` ⇒ **2**、字面 `::highlight(` ⇒ **3** |
| 零命中预检 | `grep -rn`（`pix/src`）：`page-notes` / `本页 ` / `countNotesByPage` / `page-anchor` / `foldText` / `matchExcerpts` / `pageFocusToken` / `pageFocusPage` / `focusPageNotes` / `is-anchored` 全部 **0**；`PdfViewer.vue` 未 import notes store（现有 import：`useProjectStore` / `useReaderStore` / `useReaderStateStore`） |
| 层级事实（`PdfViewer.vue` 本次实读） | `.textLayer` `:1082` = 1；`.pdf-overlay` `:1104` = 2；`.pdf-toolbar` `:1038` = **3**（设计档写 4，见 F14）；`.reader-section` `:1214` = 3；`.pdf-page-indicator` `:1249` = 3；`.capture-layer` `:1117` = 5；`.pdf-capture-fab` `:1162` = 6；`PdfSearchPanel.vue` 的 `.pdf-search-panel` = **4**（`top: 78px; right: 12px; width: 300px`，设计档 §1.1.4 表未列，见 F7） |
| 渲染 / 生命周期锚点（本次实读行号） | `renderPage` `:191`（`await textLayer.render()` `:242`、`finally` 收口 `:243-247`）；`releasePage` `:250`；`observePages` `:266`（release 条件 `:280`）；`updateCurrentPage` `:292`；`loadPdf` `:637`；`ZOOM_COALESCE_MS` `:776`；scale watcher `:817-828`（release 循环 `:820-822`）；`onBeforeUnmount` `:863-874` |
| pdf.js 文字层真实行为 | `node_modules/pdfjs-dist/build/pdf.mjs:10895` `class TextLayer`；`:10980` `#processItems(value.items)`；`:11061` 每个文本项 `document.createElement("span")`；`:11101` `textDiv.textContent = geom.str`；`:11129-11132` `hasEOL` 时追加 `<br>` ⇒ 设计档「一个文本项 = 一个 span、片段 = 文本节点的 `nodeValue`」的事实成立 |
| `HighlightRegistry` 类型面 | `PdfSearchPanel.vue:18-21` 本地别名 + `:91-92` 断言式取用；TS 5.8.3 dom lib 只声明 `forEach` ⇒ 设计档「刻意重复一份 `HighlightRegistryWriter`」与既有先例同形 |
| 基线复读 | `C:/Users/86157/AppData/Local/Temp/pix-v05-r15-final/shots`：`MANIFEST.json` ⇒ `shots.length = 153`、`failure = null`；`MEASUREMENTS.json` ⇒ 223、label 去重 **59**；目录内 png **153**；既有 label 中 `r15-*` 四种（`r15-capture-region` / `r15-notes-recover` / `r15-vision-fallback` / `r15-workspace-late-register`），`r16*` 命中 **0** |
| 唯一工程门（本步允许实跑） | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` ⇒ `CHECK_EXIT=0`（vue-tsc 2.1.6 + TS 5.8.3） |
| 手工推演（离线、只读夹具，设计档 §1.4.3 参考实现逐字复刻后跑真实 `SAMPLE_PAGES` / `seedNotes()` 文本；脚本写在仓外临时目录、本步已删除） | 页 1 折叠长 **329**；`n-current-1` 折叠长 **92**（不是 91）、`indexOf = 54`、命中区间 `[54,146)`、`slice` 逐字等于折叠摘录 ✓；页 2 折叠长 **192** < `n-current-2` 折叠长 **333**、`indexOf = -1`、返回 `[]`，其前 120 字符前缀可命中（证明是「更长」而非「文本不同」）；页 3 夹具 `Sparse attention keeps recall at one third of the dense budget,` ⇒ 命中 `[14,77)`、`slice` 逐字相等；`retrieval` 全文档命中 **3**（全部在页 1：标题的 `Retrieval` + 摘要的 `retrieval` + `Keywords:` 的 `retrieval`）；`foldText(["alpha","beta"]).text` ⇒ `"alpha beta"`；`foldText(ANCHOR_PARTS).text.indexOf(ANCHOR_NEEDLE)` ⇒ **-1** |
| 类型面探针（仓外临时工程 + 仓库同一 `node_modules/vue-tsc` 2.1.6 + 仓库 `tsconfig.json` 的 `"strict": true` 口径；本步已删除） | 把设计档 §1.1.2 的逐字模板贴入 `.vue` 后 ⇒ **4 条 `error TS2532: Object is possibly 'undefined'`**（正是 `pageNoteCount(index + 1).total/.excerpt/.answer` 三处 title + 一处文本）；对照探针（模板内引用不存在标识符）报 `TS2339` ⇒ 该探针工程确实在检查模板 |
| smoke 编译面探针（同一组 compilerOptions：`module: commonjs` / `target: ES2022` / `strict` / `types: ["node"]`；本步已删除） | 含 `Text` / `Range` / `document` 的探针文件 ⇒ **0 error**（未显式指定 `lib` 时默认 `es2022.full` 带 DOM）⇒ 把 `page-anchor.ts` 纳入 `smoke-view.mjs` 编译面在类型面可行 |
| 未执行（本步禁止 / 不必要） | 离屏 `ui-shot.mjs`、基线复跑、`npm run build` / `npm test` / `npm run package` / `npm run dev`；本步**未**跑 `smoke:view`（会写 `%TEMP%` 并需要新增代码） |

### 1. 逐条结论

#### 1.1 高亮的生命周期与「与搜索高亮互不破坏」——机制成立、可判定，两处需收敛

- **重建时机写清了**：清空四条（文档切换 → `loadPdf` 起始段 `:637-651`；缩放 → scale watcher `:817-828` 内 release 循环之后、`await nextTick()` 之前；页面 release → `releasePage` `:250-264` 末尾；卸载 → `onBeforeUnmount` `:863-874`）+ 幂等第五条（每次重画先删后画）；重画四个触发（页变化 / 笔记变化 / 缩放 / 文字层渲染完成）收敛到 `scheduleNoteAnchor()`，其中「渲染完成」的落点写在 `renderPage` 末尾（`:246-247` 之后）—— 这条是**必要的**：`TextLayer.render()` 的 `pump()` 是流式（`pdf.mjs:10964-10983`），「首个 `span`」只保证该 chunk 落 DOM，若只靠等待窗口，理论上可能按部分文本折叠并静默漏配；`renderPage` 末尾的触发在 `await textLayer.render()` 之后（该页片段完整时）补一次重画 ⇒ 收敛成立。设计档没有把这条「收敛论证」写出来，建议补一句（非阻塞）。
- **Range 失效面被覆盖**：Range 失效的来源只有节点被 `replaceChildren()`（`clearPageLayers` `:181-190` 与 `renderPage` `:231` 的重建）或页元素被重建；`releasePage` / 缩放 / 文档切换 / 卸载四个清空点与「重画前先删」正好覆盖，`anchorRangeFor` 返回 `null` 时丢弃区间并在整页无区间时删除注册表（`has === false` 为「无高亮」唯一判据）⇒ 不会留下指向旧节点的注册表条目（前提是实现按 §1.4.4 ②「不缓存节点引用」——见 F12）。
- **与 `pix-search` 互不破坏在 API 层面成立**：`PdfSearchPanel.clearHighlights()`（`:95-98`）只删自己两个名字；锚点侧 `clearNoteAnchor()` 只删 `pix-note-anchor`；两侧等待各自独立（`revealToken` / `anchorToken` 同款范式）；`grep -rn "pix-search" pix/src | wc -l` 仍为 4 ⇒ 零改动的判据可判。唯一未写死的是**重叠绘制次序**（CSS Custom Highlight 按注册顺序叠加，后注册者在交叠区生效）：设计档只写「语义可区分」，不写交叠区谁压谁。因为两者都 `color: transparent` + 只改背景/下划线，观感上不构成破坏，登记为观察即可。
- **作废语义（M10）已落地**：`anchorToken` 的一次性令牌 + 「页 / 文档 / 缩放任一变化即作废」+ 快速连点 4 次的可判定式（区间所属 `data-page` 恒等于当前页）⇒ 可判。

#### 1.2 匹配规则可行性——三手工推演全部可判，设计档两处期望值写错

推演用真实夹具（`ui-shot.mjs:211-232` 的 `SAMPLE_PAGES` + `:332-379` 的 `seedNotes()`），按设计档 §1.4.3 参考实现逐字复刻后运行（结果见 §0 表）：

| # | 输入 | 结论 | 关键读数 |
| --- | --- | --- | --- |
| 1 | 页 1（6 片段）× `n-current-1` | **命中** | 折叠页 1 = 329 字符；折叠摘录 = **92**（设计档写 91，见 F14）；`indexOf = 54`、区间 `[54,146)`；`slice` 逐字等于折叠摘录 |
| 2 | 页 2（4 片段）× `n-current-2` | **降级失败（预期）** | 折叠页 2 = 192 < 摘录 333；`indexOf = -1`、返回 `[]`；其前 120 字符前缀可命中 ⇒ 失败原因是「摘录更长」，不是「页文本不相干」 |
| 3 | 页 3 × 设计档夹具 `n-r16-p3`（`Sparse attention keeps recall at one third of the dense budget,`） | **命中** | 区间 `[14,77)`、`slice` 逐字相等 |

其余可判性核对：`foldText(["a\tb","c   d"])` 与 `foldText(["a b c d"])` 折叠文本逐字相等（设计档烟测 #3 成立）；`at.length === text.length` 对夹具成立；「两侧 trim ⇒ 区间端点必为真实字符」的推理成立（Needle 首尾非空白，`at[start]` / `at[end-1]` 不可能是 `-1`）。**但**设计档两处烟测期望值按现文必红：`foldText(["alpha","beta"]).text` 实测 `"alpha beta"`（设计档写 `"alphabet"`，见 F3——该空格正是页 1 摘录跨片段命中的唯一手段，若为迁就该断言而改折叠实现，N93-1 的核心用例会一起红）；`foldText(ANCHOR_PARTS).text.indexOf(ANCHOR_NEEDLE)` 实测 **-1**（`page.text` 已小写、`ANCHOR_NEEDLE` 首字母大写，见 F4）。

#### 1.3 标记的几何与层级——100% 夹具口径成立；50% / 300% / 窄栏 / 搜索面板开启三种情形未写死

- **100% 夹具口径可判**：页盒 595×842、正文集中在页面顶部（R15 基线 `firstSpan = { dx: 56, dy: 86, w: 387, h: 20 }`），标记按 `right: 6px; bottom: 6px` + `padding: 1px 6px` + `font-size: 11px` 估得约 59×20（左缘 ≈ 页左 + 530、上缘 ≈ 页顶 + 855）⇒ 与任一 span 矩形不相交；`.reader-section`（`bottom: 46px` 居中）、`.pdf-page-indicator`（`bottom: 12px` 居中）都在 `.pdf-viewer` 底部、与页右下角无垂直重叠；`.pdf-capture-fab` 在左下（`left: 12px`）⇒ 判据 ⑤ 在夹具内成立。
- **层级事实核对**：`.textLayer` 1 / `.pdf-overlay` 2 / 标记 3 / 指示器 3 / `.reader-section` 3 / `.capture-layer` 5 / `.pdf-capture-fab` 6 / `.pdf-search-panel` **4**；`.pdf-page` 未创建层叠上下文（`position: relative` 且无 `z-index`）⇒ 同层按 DOM 顺序绘制、`.pdf-scroll` 之后的控件压住标记的结论成立。**但** `.pdf-toolbar` 的真实 `z-index` 是 **3**（`:1038`），设计档 §0.1 与 §1.1.4 写 4（见 F14）；结论（工具栏在 `.pdf-scroll` 之前 ⇒ 重叠时标记在上）不变，但冻结事实表的数字必须改。
- **未写死的三种情形**：① **缩放档位**：50% / 120% / 300% 下标记与控件的关系没有任何断言；req N91-3 判据 4（滚动 + 100%→120% 后标记读数与几何判据不变）在设计的 5 场景 / 13 相位中**无落点**（`live` 只有滚动、`scale-stable` 是 80% 且只判锚点、`no-text-layer` 的缩放段只等锚点恢复）⇒ 见 F8。② **窄栏**：设计档只在 `r16-2` 读 `.layout-left` 宽度，不判标记几何；req 未要求，登记为观察（重叠风险已由 §1.1.4 取舍登记覆盖）。③ **搜索面板开启**：req §0.3 位置约束②③ 明文要求「不得与 `.pdf-search-panel`（面板打开时）的矩形相交」，设计档 §1.1.4 表与 `pageNotesProbe` 的四个控件（`.pdf-toolbar` / `.pdf-page-indicator` / `.reader-section` / `.pdf-capture-fab`）都**漏了这一项**，`r16-4` 开面板时也没有几何断言 ⇒ 见 F7。
- **框选模式写死且可判（代理式）**：标记仍在（视觉）、点击被 `.capture-layer`（5 > 3）拦截、不新增分支代码；判定用 `z-index` 读数代理真实指针命中（离屏用 `.click()` 无法复现遮挡）⇒ 可接受，登记为观察。

#### 1.4 N92 定位 × 三维过滤——自洽、可判、返回路径已登记；三处需补

- **自洽**：`focusPageNotes` 的守卫顺序（`currentDocKey === null` ⇒ no-op；只清 `chapterFilter`；写载荷；递增 token）与「唯一被改动的视图状态 = 章节过滤被单向清除」逐字一致；`WorkspacePage` 的新 watcher 与既有 `chapterFocusToken` watcher（`:215-221`）同构；`selectLeftTab("notes")` 必发 `loadNotes()`（`:211`）⇒ 面板 `status === 'loading'` 时 `.notes-list` 整体不在 DOM（`NotesPanel.vue:638-682` 的 `v-if / v-else-if` 链）⇒ 有界等待 `LOCATE_WAIT_MS = 3000` 是必要且足够的吸收手段；`is-anchored` 只改边框色与背景（几何零变化）。
- **可判**：目标行定义（当前文档组内 `第 {N} 页` 徽标的**首行**，只看 DOM 顺序）与既有 DOM 结构一致（`.notes-group` `:683`、`.notes-group-head` `:684`、当前文档 chip `:689`、`.note-page-badge` `:715`）；四维视图状态零变化 + `.notes-chapter-filter` 从在场到不在 DOM 都有明确读数；退化文案复用 `.notes-notice.is-error` + `.notice-text`，且「立即退化（不等满 3s）」与「超时退化」两态分开。
- **返回路径**：设计档已按 M7 改判为「单向清除、可由地图徽标重建、不可一键回退」，并把「零变化」限定在搜索 / 排序 / 仅看当前文档 / 选择集 / 阅读位置 / 缩放 ⇒ 自洽。
- **三处缺口**：① `degrade-filters` 相位在 `ensureMapOpen()` 后直接 `clickMapBadge(...)`，缺 `.map-row` 就绪等待（既有 5 处用法全部在两者之间插了 `waitFor("地图行就绪", ".map-row === 7")`，`:5812-5814` / `:5843-5845` / `:5903-5905` / `:6080-6082` / `:6192-6194`）⇒ 见 F6。②「面板滚动位置不变」与「`borderColor` / `backgroundColor` 前后不同」两条断言在 `panelRowProbe` 的语义清单里没有对应读数字段（`scrollTop` / 计算样式）⇒ 见 F13。③ `locate-panel-open` 的防空断言 `row.top > panel.bottom` 依赖「14 行 × 行高 > 面板可视高度」的估计（本步无法离线实测：`.note-row` 的行高取决于 `padding 7px` + `.note-head` 16px + `.note-text` 两行 + 备注行 + 6px 外边距，约 76-86px；14 行约 1060-1200px，面板可视高度约 880-940px ⇒ 大概率成立但余量不大）⇒ 建议 dev 在相位内先读该差值并在不成立时改按 `scrollTop` 的防空（登记为观察，不列为阻塞）。

#### 1.5 离屏与烟测的可构造性 / 空断言风险 / 既有 153 张与 223 条的零缺失

- **可构造性**：`SEL` 追加 4 项（含新键 `pageBoxOne`，既有 `pdfPageOne` 逐字不动 ⇒ M2 已正确收敛）；10 个新 helper 与 `seedR16Focus()`（14 条 = 标准 4 + 9 条页 2 + 1 条页 3）可用；`enterNotesProbe(seed, rows)` `:5211`、`waitChapterFilter(text, rows)` `:4480`、`ensureMapOpen()` `:5254`、`clickMapBadge` `:4455`、`openMap()` `:4376`、`deleteRowByText` `:5309`、`clickUndo` `:5349`、`notesNotice` `:5356`、`backToLibraryTab` `:4506`、`waitNotesTab` `:4510`、`clickNext` / `clickPrev` `:1715-1716`、`triggerWindowFocus` `:8404`、`writeNotesOutside` `:8487`、`appendExternalNote` `:8489`、`notesHash` `:2376`、`readNotes` `:2375`、`notesAddCalls` `:2377`、`notesReportCalls` `:7806`、`loadCalls` `:4350` 全部存在且在 `runReaderStateScenarios` 作用域内（R16 块追加在 `:9249` 之后，晚于上述定义 ⇒ 可引用）；`pdfSearchBtn` 是既有 `SEL` 键（`:81`）；`long-book.pdf` 是 60 页夹具（`:309-310` / `:404`）；`SEL.staleRow` / `SEL.staleRefresh` 存在（`:108` / `:110`）。**两处按现文不可执行 / 会红**：`notesLoadCalls()` 不是场景内 helper（F11）；`r16-5c` 截图在步骤里没有拍摄动作（F5）；`degrade-filters` 缺地图行等待（F6）。
- **空断言风险**：`r16-3` 的 `unmatched-silent` ⑦（`has === false`）由 ⑧（回页后 `size === 1`）兜底 ⇒ 非空；`r16-4` 前置先等锚点非空 ⇒ 非空；`r16-2` 三个相位的目标行断言都有「先读不可见 / 先读过滤态」的防空。**唯一残留**：`r16-1` 判据 ⑤「标记矩形与页 2 的任一 span 矩形不相交」在页 2 文字层尚未渲染时恒真（req 已把「逐页补 `spanCount > 0`」登记为非阻塞建议，设计档未采纳）⇒ 维持观察，建议 dev 在 `pageNotesProbe` 里对每页同时读 `spanCount` 并在断言里钉 `> 0`。
- **既有 153 张 / 223 条 / 59 种零缺失：判定为不被破坏，逐条理由**（本步用 `grep` 复核了全部「可能被新子元素影响」的读数面）：
  1. **没有任何既有场景 / 测量读取 `.pdf-page` 的子元素数量、子元素结构或页面 `textContent`**：`grep -n "children\|childNodes\|childElementCount" ui-shot.mjs` 的命中只有 `.map-row`（`:4419` / `:4437`）与面板（`:8453`）；`.pdf-page` 的页面元素命中（`:1406` / `:1753` / `:1755` / `:1943` / `:1984` / `:5480` / `:5487` / `:5491` / `:6692` / `:6722` / `:6725` / `:6745`，以及 `SEL.pdfPageOne` `:59`）都只取 `canvas` / `.textLayer span` / 页矩形 ⇒ 新增第 4 个子元素（`.page-notes`）不改变任何既有读数。
  2. **`pdf-text-layer-geometry`（`:1404-1417`）**只读页盒、`spanCount`、`firstSpan`、span 计算样式、`--scale-factor`、`canvas.style.width` ⇒ 逐字段不变（标记是绝对定位的独立 `<button>`，不参与流布局）。
  3. **产品侧既有查询面不受影响**：`renderPage` / `clearPageLayers` 取 `querySelector("canvas")` / `querySelector(".textLayer")`（`:182-189` / `:194-196`）；`observePages` 取 `querySelectorAll("[data-page]")`（`:270` / `:288`）；`captureRegion` 只取 `querySelector("canvas")`（`:600`）——标记都没有这些选择器命中所需的属性 / 类名。
  4. **指针面不受影响**：`moveMouse`（CDP / `sendInputEvent` + `elementFromPoint` 落点校验，`:2469-2515`）的 8 处调用全部针对 `.agent-message`（`:2629` … `:3230`），不在 PDF 页面上；`ui-shot.mjs` 无基于坐标的页面点击（无 `Input.dispatchMouseEvent` 落在阅读区）⇒ 标记不会抢走 hover / click 落点。
  5. **`r15-f18` 框选两相位**（`:6675-6760`）在含笔记的页上运行（标记在场）：框选层 `z-index: 5` 高于标记 3，`.capture-mode` 只把 `.textLayer` / `.pdf-overlay` 置 `pointer-events: none`（`:1108-1111`）⇒ 框选拖拽与成败判定不受标记影响（仍建议在 dev 档目视清单里确认，§8.2 #12）。
  6. **既有截图的内容变化**（含笔记的页多一枚药丸、定位行短暂变色、退化 4s 提示、锚点高亮）已逐项登记在 §2.2 的「允许的内容变化」①–⑥，不是零缺失判据的对象（判据只比清单名与 label 集合）。
- **烟测面**：`smoke-view.mjs` 的 `files` / `required` / `allowed` 结构核对为真（编译入口 `compileAndLoad` `:505`、`required` `:539`、`allowed` `:540`：`allowed = new Set([...required, "shared/types.js"])` 派生）⇒ 设计档「各追加 1 项、`allowed` 自动覆盖」的口径与代码一致；DOM 全局在该编译选项下可用（§0 探针 ⇒ 0 error）⇒ 把 `page-anchor.ts` 纳入编译面不会因为 `Text` / `Range` / `document` 而红。`main()` 追加两行调用（`:560-566`）与既有顺序固定一致。

#### 1.6 白名单一致性 / 遗漏文件 / 性能口径

- **文件级白名单与 req §7 逐条对账成立**：8 个改动文件（`notes-path.ts` / `page-anchor.ts` / `PdfViewer.vue` / `notes-store.ts` / `WorkspacePage.vue` / `NotesPanel.vue` / `smoke-view.mjs` / `ui-shot.mjs`）+ 3 组不动面（`PdfSearchPanel.vue`；`main/**` + `shared/types.ts` + `smoke-notes.mjs` + `package.json`；范围外清单）⇒ 无遗漏文件。**两处越界 / 需登记**：`page-anchor.ts` 的 `anchorRangeFor` + `AnchorSegment`（F2）；`renderPage` 末尾新增触发调用未在 req §7 第 3 行的「允许新增调用」四项里列名（req §0.5「绘画触发④」要求该触发，设计档 §2.2 #5 已写明，但建议在 §4 / §2.2 里显式标注「req §7 第 3 行的第 5 个新增调用点」以免走查时误判为越界）⇒ 观察。
- **性能口径可判且有阈值**：每页归一 1 次（`anchorTextCache`，键 = 页号、仅文档切换失效、缩放不失效——与 R11 `textCache` 同口径）、每条摘录 1 次 `indexOf`、超长门在匹配前；离屏阈值 `maxMs ≤ 1000` / `totalMs ≤ 6000`（10 次交替翻页）/ `max(revisitMs) ≤ 300ms`，读数登记进 `data` ⇒ 可复跑。观察项：`matchExcerpts` 对每条摘录在**每次调用**都重新 `foldText`（无摘录级缓存），复杂度上界 O(摘录数 × 摘录长度 + 页文本长度)，夹具与真实场景（每页 1-2 条）都可接受，登记为观察。
- **`for (` ≤ 2 的判据与 `anchorRangeFor` 冲突**（见 F2 证据）：参考实现的 `locate()` 自身就是一处 `for (`，加上 `foldText` / `matchExcerpts` 共 3 处 > req N93-1 判据 11 的 `≤ 2`。

### 2. must-fix 清单（按严重度排序；阻塞 = 按现文会红或不可执行）

**F1｜`PdfViewer.vue` 的冻结模板在唯一工程门下必红（4 × TS2532）**
- 证据：把设计档 §1.1.2 的逐字片段（`v-if="pageNoteCount(index + 1)"` + `:title` 内三处 `pageNoteCount(index + 1).total/.excerpt/.answer` + 文本一处）放入 `.vue`，用仓库同一 `vue-tsc` 2.1.6 与 `tsconfig.json` 的 `"strict": true` 检查 ⇒ `error TS2532: Object is possibly 'undefined'` **4 条**；TS 不对函数调用结果做窄化。
- 修法：把派生数据预计算为「页号 → 计数」的列表在 `v-for` 上消费，或把三处访问写成 `pageNoteCount(index + 1)?.total`（并在文档里同步 §1.1.2 / §5.4 #5 的逐字口径），确保 `CHECK_EXIT=0`。

**F2｜`page-anchor.ts` 越界（DOM 进入「零 DOM」纯函数文件），并连带打破 `for (` ≤ 2**
- 证据：req §0.7 明文「该文件**零 import**（纯字符串逻辑，不依赖 `@shared/types`、不依赖 DOM、不依赖 `pdfjs-dist`）」、并写明「折叠域 → 原文域的映射由调用方（`PdfViewer.vue`）用 `page.at` 完成」；req §7 白名单第 2 行「只放 §0.7 的纯函数与类型」；设计档却在 `page-anchor.ts` 里新增 `AnchorSegment { node: Text; start: number }` 与 `anchorRangeFor(...): Range | null`（内部 `document.createRange()`），且参考实现的 `locate()` 是一处 `for (` ⇒ 该文件 `grep -c "for ("` = 3 > req N93-1 判据 11 的 ≤ 2。
- 修法（二选一）：① 把 Range 重建放回 `PdfViewer.vue`（与 req 原文一致，最小改动）；② 显式登记为 req 修订（同步 §0.7 / §7 第 2 行的措辞与 `for (` 判据），并在走查里给出新的可复跑计数口径。

**F3｜烟测 `excerpt-match` #4 的期望值与设计档自己的折叠实现矛盾（必红，且会诱导改坏核心用例）**
- 证据：实测 `foldText(["alpha","beta"]).text === "alpha beta"`（片段间假分隔符 `"\n"` 被 `\s+` 折叠为单空格）；设计档 §5.1.3 #4 却要求 `text === "alphabet"`（无空格）。该空格同时是页 1 摘录跨两行命中的**唯一**手段（见 §1.2 推演 #1）。
- 修法：期望值改为 `"alpha beta"`，或把 #4 改写为「片段边界折叠为恰一个空格」的正向断言；§1.4.3 的「折叠规则」表可同步补一句「假分隔符参与折叠、产出的是空格不是空串」。

**F4｜烟测 `excerpt-match` #1 的子断言按字面必为 -1**
- 证据：实测 `foldText(ANCHOR_PARTS).text.indexOf(ANCHOR_NEEDLE) === -1`（`page.text` 已 `toLowerCase`，而 `ANCHOR_NEEDLE` 首字母为大写 `W`）。
- 修法：把该子断言改成 `page.text.indexOf(foldText([ANCHOR_NEEDLE]).text) === start`，或直接删掉（`slice` 逐字相等已足够）。

**F5｜`r16-5` 相位 `external-refresh` 缺第 13 张截图**
- 证据：§5.3.3 冻结 `r16-5c-after-external-refresh.png`（整窗，归属 `r16-5`），§5.3.4 判据 1 要求 13 张齐备；而 §5.3.2 该相位的步骤只到「读三页标记 / 注册表 / 计数」，没有 `capturePage`。
- 修法：在该相位步骤末尾补 `capturePage(win, "r16-5c-after-external-refresh.png")`。

**F6｜`degrade-filters` 缺 `.map-row` 就绪等待（可能非确定红）**
- 证据：`openMap()`（`:4376-4379`）只等 `.knowledge-map-slot`；`clickMapBadge`（`:4455-4461`）找不到 `.map-row` 直接 `throw`；既有 5 处用法全部在 `ensureMapOpen()` 与 `clickMapBadge` 之间插了 `waitFor("地图行就绪", ... === 7)`（`:5812` / `:5843` / `:5903` / `:6080` / `:6192`）。
- 修法：相位前置改成 `ensureMapOpen()` → `waitFor("地图行就绪", ".map-row === 7")` → `clickMapBadge(...)`。

**F7｜req §0.3 位置约束②③ 要求的 `.pdf-search-panel`（面板打开时）未进入设计档的几何判定**
- 证据：req §0.3 明列「不得与 `.pdf-toolbar` / `.pdf-page-indicator` / `.reader-section` / `.pdf-capture-fab` / `.pdf-search-panel`（面板打开时）的矩形相交」；设计档 §1.1.4 表与 §5.3.2 的 `pageNotesProbe`（四个控件）均无该项，`r16-4`（面板打开的两个相位）也没有几何断言。`.pdf-search-panel` 实测 `z-index: 4`（高于标记 3、且会拦截点击），属真实重叠风险面。
- 修法：`pageNotesProbe` 增读 `.pdf-search-panel` 矩形（不存在时记 `null`）并在 `r16-4` 的 `coexist` 相位补一条「标记矩形与该面板矩形不相交」的断言（或显式登记为取舍并说明为何不判）。

**F8｜req N91-3 判据 4（滚动 + 100%→120% 后标记读数与几何判据不变）在设计档无落点**
- 证据：req 该判据要求「滚到第 2 页 → 滚回第 1 页 → 点两次『放大』⇒ 标记计数与两页文本逐字不变，且标记矩形始终满足 N91-1 判据 3」；设计档 `r16-1` 的 `badges` 只做一次静态读数，`live` 只有滚动段（⑪），`r16-3` 的 `scale-stable` 是 80% 且只判锚点区间 ⇒ 缩放后的标记几何无任何断言。
- 修法：在 `r16-1` 的 `live`（或 `badges` 续段）补「回第 1 页后点两次放大 → 复读三页标记文本 / title + 判据 ⑤ 的相交判定」；若确定不补，须在 §5.3.2 显式登记该 req 判据被改判。

**F9｜两处走查基线与真实值不符（按现文会误判为红）**
- 证据：`grep -rn "HighlightRegistryWriter" pix/src | wc -l` ⇒ **现值 3**（全部在 `PdfSearchPanel.vue`：`:19` / `:91` / `:92`；设计档 §0.1 / §5.4 #9 却写「该文件内既有 2」），按设计档新增 ≥2 后应为 **≥5**，而 §5.4 #9 写「= **4**（既有 2 + 新增 2）」；`grep -c "notes-notice" NotesPanel.vue` **现值 4**（`:574` / `:1006` / `:1017` / `:1022`），而 §0.1 与 §5.4 #12 写「现值 1 ⇒ 改后仍 1」（「增量 0」这个结论本身是对的）。
- 修法：更正两处现值（`HighlightRegistryWriter` 改为「既有 3，改后 ≥5」；`notes-notice` 改为「现值 4，增量 0」）。

**F10｜`SEL` 现值自相矛盾（§0.1 / §2.2 #9 写 64，实测 60）**
- 证据：`sed -n '47,113p' ui-shot.mjs` 的键行计数 = **60**；§0.1 自己的分项 `基础 24 + R10 7 + R11 11 + R12 8 + R13 4 + R14 6` 之和也是 60；§1.6 / §5.3.1 的「60 → 64」才是正确口径。
- 修法：把 §0.1 与 §2.2 #9 的现值改为 60、改后 64。

**F11｜相位引用了不存在的 helper 名（`notesLoadCalls()`）**
- 证据：`runReaderStateScenarios` 内既有 helper 是 `const loadCalls = () => js("window.__pixStub.notesLoadCalls()")`（`:4350`）；`grep -n "const notesLoadCalls" ui-shot.mjs` 无命中（`notesLoadCalls` 只出现在 stub 的变量 / API 面 `:474` / `:1175`）。设计档 §1.3.8 / §5.3.2 `locate-panel-closed` ⑫ / §6 R3 都写 `notesLoadCalls()`。
- 修法：统一改为 `loadCalls()`（或在 §5.3.1 的 helper 表里显式登记一个同义新 helper）。

**F12｜`anchorSegments` 与「不缓存 `Text` 节点引用」互斥，且类型名与 §1.4.3 不一致**
- 证据：§0.3 命名表登记 `anchorSegments`（**`Map<number, TextSegment[]>`**）；§1.4.4 ② 明说「片段表 `AnchorSegment[]`……**不缓存 `Text` 节点引用**（缩放 / 重渲染会重建节点 ⇒ 每次重画都重取）」。若实现按 §0.3 缓存节点，缩放后 `anchorRangeFor` 会用已脱离文档的节点建 Range（`has === true` 但画不出、`startContainer.parentElement` 为 `null`），直接违反「只画当前页」并让 `r16-3` 判据 ②/⑬ 红。
- 修法：删掉 `anchorSegments` 一行（或改写为「只存每页的 `start` 偏移与折叠结果，不存节点」），并把 `TextSegment` 统一为 §1.4.3 的 `AnchorSegment`。

**F13｜`NotesPanel.vue` 的参考实现与 `panelRowProbe` 语义各有缺口**
- 证据：§1.3.5 的参考 `targetRow()` 用 `panelEl.value?.querySelector(".notes-list")`，但 `NotesPanel.vue` 内**没有** `panelEl` 这个 ref（`grep -n "panelEl" NotesPanel.vue` 无命中；模板只有 `searchInputRef` `:505`）；§5.3.1 的 `panelRowProbe` 语义清单不含 `scrollTop` 与计算样式，而 §5.3.2 的 `degrade-filters` ⑭ 断言「面板滚动位置不变」、`locate-panel-open` ⑧ 断言「`borderColor` / `backgroundColor` 前后不同」。
- 修法：登记「给 `.notes-panel` 增一个模板 ref」或改用 `document.querySelector`；把 `scrollTop` 与 `getComputedStyle(row).borderColor/backgroundColor` 写进 `panelRowProbe` 的读回字段。

**F14｜三处事实数值写错（冻结事实表 / 相位前置）**
- 证据：① `n-current-1` 折叠后长度实测 **92**（§0.1 写 91，req 评审档记 92）；② `retrieval` 全文档命中实测 **3**（全在页 1：`Retrieval` / `retrieval` / `retrieval`），§5.3.2 `r16-4` ① 写「2 处」；③ `.pdf-toolbar` 的真实 `z-index` = **3**（`:1038`），§0.1 与 §1.1.4 写 4。
- 修法：三处按实测值改正（结论不受影响：`r16-4` 的断言保持 `size ≥ 1` 即可；工具栏在 `.pdf-scroll` 之前 ⇒ 重叠时标记在上的推导不变）。

**F15｜`r16-2-page-anchor.png` 的时序与 §8.2 的目视要点互斥**
- 证据：§5.3.2 把截图放在 `sleep(2500)` 之后，而 `ANCHOR_HIGHLIGHT_MS = 2000` ⇒ 截图时 `is-anchored` 已按判据 ⑧ 被移除；§8.2 第 3 行却要求该截图能看出「边框色变深 + 背景变浅（`is-anchored`）」。
- 修法：把 `capturePage(win, "r16-2-page-anchor.png", rectOfSelector(SEL.layoutLeft, 2))` 移到 `sleep(2500)` 之前（或改 §8.2 的目视要点）。

**F16｜§0.3 的占位常量是死代码**
- 证据：§0.3「场景局部件数常量 | `const ANCHOR_MARKER_MS = 1;`（占位，见下）」不在任何相位的步骤 / 断言中；与 PRD §4 反需求 7（不写未被调用的死代码；req 头部沿用该条款）冲突。
- 修法：删除该行。

### 3. 非阻塞观察（建议，不影响 revise 结论的阻塞性）

1. **收敛论证建议补一句**：§1.4.5 触发④ + §1.4.7 作废语义已能保证「部分片段先到、完整文本后到」的情形收敛，但设计档没有把这条明确写成论证（pdf.js `TextLayer.render()` 是流式 `pump()`，`pdf.mjs:10964-10983`），建议在 §1.4.7 补一句「若本次绘画发生在片段未完整时，`renderPage` 末尾的触发会再重画一次」。
2. **交叠绘制次序未写**：`::highlight(pix-note-anchor)` 与 `::highlight(pix-search)` 在同一段文本上重叠时，CSS Custom Highlight 按注册顺序叠加（后注册者在上）；设计档只写「语义可区分」。观感上两者都 `color: transparent`，不构成破坏；若要写死，建议在 §1.4.2 补一句或登记为开放问题。
3. **`smoke-view.mjs` 的行计数判据偏紧**：req N93-1 判据 11 要求 `grep -rn "matchExcerpts\|foldText" pix/src | wc -l` = 4（定义 2 + import 1 + 调用 1），但 `foldText(parts)` 与 `matchExcerpts(...)` 若各占一行就是 5 —— 建议在设计档把该判据改写成「定义 2 + import 1 + 调用 ≤ 2」或指明两者必须同行的实现口径（本项源自 req，非设计档新增）。
4. **`foldText` 的 `isSpace` 与 `\s` 并不完全等价**：参考实现漏了 `U+FEFF`（JS `\s` 含 ZWNBSP），而 §1.4.3 注释写「等价于 `\s` 的 JS 语义」；夹具与中文无影响，建议改措辞或补码位。
5. **helper 表「不写 DOM 除 ⑤」不准确**：`selectionOnPageOne()`（⑥）会改 `Selection` 并触发产品链路（`.quick-ask` 出现、`setSelectedText`）；其语义描述也建议补「派发 `selectionchange`」（既有手法见 `:1429-1437`）。
6. **`renderPage` 新增触发点在 req §7 第 3 行未列名**：req 只列了四个「各新增 1 处清空调用」的落点，设计档 §2.2 #5 的触发调用建议标注为「req §0.5 绘画触发④的落点（第 5 个新增调用点）」，避免走查时误判越界。
7. **「不允许 `.pdf-page` 的文本（DOM）变化」措辞与允许项①冲突**：`.page-notes` 是 `.pdf-page` 的子元素且带文本，§0.9 的「不允许」条款应读作「除 §2.2 已登记的允许项外」；建议在设计档加一句限定语（该措辞源自 req，非设计档新增）。
8. **`pageNotesProbe` 的逐页防空**（`spanCount > 0`）：req 已登记为非阻塞，设计档未采纳；建议采纳（与 §1.5 的空断言残留同源）。
9. **`locate-panel-open` 的『目标行初始不可见』防空**依赖 14 行的实测高度（本步未跑离屏，无法钉死）；建议 dev 在实现时先读该差值，必要时把防空改成「定位前后 `scrollTop` 变化且目标行进入可视区」的等价式。
10. **框选模式用 `z-index` 读数代理真实遮挡判定**：可接受（离屏 `.click()` 不经过命中测试），但建议在 dev 档目视清单里写明「标记在框选模式下仍在但不可点」的证据来源。
11. **`r16-4` 的 `pdfSearchSet` 与 `PdfSearchPanel` 的 `DEBOUNCE_MS = 300`**：写值与「等 `pix-search` 非空」之间由面板自身 debounce + 全文档扫描（`runSearch` 里 `requestIdleCallback`）决定，`waitFor` 默认 20s 足够；无需改动，仅登记。

### 4. 结论

**revise。**

设计档的骨架成立：文件级清单与 req §7 对账无遗漏；`releasePage` / `loadPdf` / 缩放 watcher / `onBeforeUnmount` 四个清空点与「页 / 笔记 / 缩放 / 文字层就绪」四个重画触发都有真实行号支撑；`SEL` 新键解决了 M2 的键名冲突；M1 的有界等待、M7 的「单向清除」、M8 的开图步骤、M9 的交替采样序列、M10 的作废语义、M11 的写接口别名、M12 的 `^::highlight\(` 计数口径都按定稿修订落地；手工推演的三条摘录匹配（命中 / 降级 / 命中）与 `retrieval`、`foldText` 的实测都落在设计档声明的语义内。

但存在 **16 项 must-fix**，其中 **F1（冻结模板 4 × TS2532，唯一工程门必红）、F2（`page-anchor.ts` 越界进 DOM，破 req §0.7 / §7 第 2 行 / 判据 11）、F3 与 F4（烟测两条期望值按字面必红）** 属于「照设计档逐字实现即失败」的硬缺陷；**F5（少拍第 13 张截图）、F6（缺地图行等待）、F7（缺 `.pdf-search-panel` 几何判定）、F8（req N91-3 判据 4 无落点）** 属于「相位不可执行 / 断言覆盖缺口」；其余 8 项为计数口径与事实数值（F9–F16）。建议先修 F1–F4、F12（影响编译 / 断言 / 核心匹配），再修 F5–F8（影响相位结构与 req 对齐），最后收敛计数与事实数值（F9–F11、F13–F16），修完可进入开发步。

---

## 代码审查（R16）

> 审查对象：R16 交付（`git diff` 的 8 个文件 + `pix/src/renderer/utils/page-anchor.ts` 新文件 + `docs/pm/R16-dev.md`），对照 `docs/pm/R16-req.md`（含 §0 定稿修订 M1–M12 与 §0.0–§0.9）与 `docs/pm/R16-design.md`（含定稿修订 F1–F16）。
> 审查方式：冷启动独立复验。**未复用交付方的任何结论与产物**：离屏取证写入全新目录 `C:/Users/86157/AppData/Local/Temp/pix-v06-r16-review`（交付方目录为 `pix-v06-r16-after`）；全部断言按原始读数自行复算；匹配语义按 req §0.6 / §0.7 冻结规则**自行重写一份实现**离线复算夹具事实。
> 只读命令与一次性脚本（`%TEMP%`，运行后已删除）之外未做任何写入；未运行 git 写命令、未跑 `npm run build` / `npm test` / `npm run package` / `npm run dev`；两个离屏进程串行（本步只跑一次）。

### A. 实跑证据（全部为本次真实命令输出）

| # | 命令 | 结果 |
| --- | --- | --- |
| 1 | `cd pix && PATH="/c/Program Files/nodejs:$PATH" npm run check` | `CHECK_EXIT=0`（`vue-tsc --noEmit -p tsconfig.json && tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.preload.json --noEmit`，0 error） |
| 2 | `node scripts/smoke-view.mjs`（连续两次） | 两次均末行 `通过 51 / 失败 0`、退出码 0（7 组：既有 5 组 35 条 + `notes-by-page` 6 + `excerpt-match` 10） |
| 3 | `node scripts/smoke-notes.mjs` | 末行 `通过 65 / 失败 0`、退出码 0（10 组） |
| 4 | `CD pix && PIX_SHOT_ROOT=C:/Users/86157/AppData/Local/Temp/pix-v06-r16-review ./node_modules/.bin/electron scripts/ui-shot.mjs` | `[ui-shot] 结束：产出 166 张截图`、`ACCEPT_EXIT=0`；`MANIFEST.json.failure === null`；`shots.length = 166`；`MEASUREMENTS.json` 长度 **237**、label 去重 **64** |
| 5 | 清单双向比对（脚本复算） | 基线 153 张 `name` 缺失 **0**；新增恰 13 张（名字与 §0.8 冻结清单逐字相同）；磁盘 png **166** == 清单 166，目录内只有 `*.png` + `MANIFEST.json` + `MEASUREMENTS.json`（结束自检通过） |
| 6 | 测量集合比对（脚本复算） | 基线 59 种 label 缺失 **0**；新增 5 种 label，条数 `r16-page-badge:3` / `r16-page-anchor:3` / `r16-note-highlight:3` / `r16-highlight-coexist:2` / `r16-degrade:3` = **14** 条 |
| 7 | 既有 223 条测量 vs 基线（**归一化后逐条比对**：剔除临时根路径前缀、`updatedAt`/`generatedAt`/`lastAt` 时间戳、`elapsedMs`/`waitMs`/`sinceLastEventAtT0Ms` 等计时抖动） | 命中 **8** 条差异，全部为路径 / 时间戳 / 计时字段；其中唯一非计时字段 = `r11-quick-ask-scroll-scope` 的 `stageScroll.t0.count`（基线 1、本次 0）——**该计数器在 R16 之前的运行里本身就是抖动值**：`pix-v05-r14-final` = 0、`pix-v05-r15-review` = 0、`pix-v05-r15-final` = 1（三次真实读数），且该字段不参与任何断言（该相位只对 `windowCount === 0` 判红）。其余几何 / 文本 / 计数 / 交互读数逐字相同 |
| 8 | 独立复算夹具事实（自写 `foldText` / `matchExcerpts` 实现，按 req §0.6 / §0.7 冻结规则） | 页 1 折叠长 **329**、`n-current-1` 折叠长 **92**、`indexOf = 54`、区间 **[54,146)**、`slice` 逐字等于折叠摘录；页 2 折叠长 **192** < 摘录 **333** ⇒ 不可匹配；页 3 折叠长 **131**、`n-r16-p3` 区间 **[14,77)**；`retrieval` 全文档命中 **3** 处（全在页 1）；`ANCHOR_PARTS` 折叠长 119、`at[58] = -1`、`-1` 共 17 个；重叠规则「先到者获胜、后来者整体丢弃」两向成立；标准种子页级计数 `p1 = {1,1,0}` / `p2 = {2,1,1}` |
| 9 | 14 条新 record 的断言**逐条按原始读数复算**（自写脚本，另加几何相交判定与阈值复算） | 不通过项 **0**。抽样：页 1 / 页 2 文本与 title 逐字命中；子元素序列 `["", "textLayer", "pdf-overlay", "page-notes"]` / 无标记页三元素；标记矩形与 span 矩形（自算相交函数）均不相交、与五个控件矩形不相交；页盒 595×842；`locate-panel-open` 定位前 `top 1819 > panel.bottom 989`、定位后 `top 620 / bottom 740` 落在 `header.bottom 190` 与 `panel.bottom 967` 之间且 `scrollTop 0 → 1177`；`is-anchored` 恰 1 且 `第 3 页`、2.5s 后 0、配色读数回基线；折叠 + 资料库标签下 `collapsedWidth 0 → expandedWidth 268`、`loadDelta 1`；章节过滤「在场 → 不在 DOM」且 `degradeMs 130 < 2500`、提示逐字、`scrollTop` 不变、重试成功；80% 下 `--scale-factor 0.8` / `canvas 476px`（595 × 0.8 独立复算）；10 次翻页 `maxMs 6` / `totalMs 26` / `revisitMs` 最大 6（阈值 1000 / 6000 / 300）；快速连点后区间所属页 == 当前页；60 页零标记且 `pageCount 60`；无文字层 `logDelta 0`、提示 `null`、标记仍 2 |
| 10 | 夹具 `notes.json` ↔ 屏幕标记（自算） | 运行结束时文件 = 标准种子 4 条（version 1）：自算 `sample-paper.pdf` 页 1 = 1 摘录 / 页 2 = 1 摘录 + 1 结论 ⇒ 与记录的 `本页 1 条`（摘录 1 · AI 结论 0）/ `本页 2 条`（摘录 1 · AI 结论 1）逐字一致；外部刷新相位按「`n-current-1` 移到 p3」自算 ⇒ p2 = 2、p3 = 1、p1 无 ⇒ 与记录一致 |
| 11 | 走查计数（`grep` 实跑） | `page-notes` 全仓 **3** / `NotesPanel.vue` **0**；`本页 ` **2**；`countNotesByPage` **3**；`countNotesByPage` 函数体内 `for (` **1**、`notes-path.ts` 共 **4**；`page-anchor.ts` 的 `for (` **2** / `toLowerCase` **1** / `indexOf` **1** / `^(import\|export … from)` **0**；行首 `^::highlight(` **3**（字面 **4**，差 1 = 注释行）；`pix-note-anchor` **2**；`pix-search` **4**（零增量）；`HIGHLIGHT_NOTE_ANCHOR` **3**；`HighlightRegistryWriter` 组件内 **3** / 全仓 **6**；四个新常量各 **2**；`pageFilter\|pageOnly\|pageRange` **0**；`pageFocusToken` store **4** / 全仓 **7**；`token <= 0 \|\| token <= previous` **2**；`PdfViewer.vue` 的 `notesStat\|notesLoad\|notesAdd\|ipcRenderer` **0**；`addEventListener` **2**（零增量）、`setInterval` **0**、`setTimeout` **2**（均为既有缩放合并，`git diff` 新增 0 行）；`is-anchored` **2**；`本页笔记不在当前筛选结果中` **1**；`NotesPanel.vue` 的 `notes-notice` **4**（零增量）；store 新增行含 `chapterFilter.value = null` 恰 **1** 行；实现注释中不出现 `pageFocusToken` |
| 12 | 红线 diff 走查 | `git diff -U0`（`PdfViewer.vue`）**纯新增**（无 `-` 行）；`pageElement` / `observePages` / `updateCurrentPage` / `clearPageLayers` / `captureRegion` / `toLayerPoint` / `onCapturePointerDown` 的函数体 **0** 处新增；`.pdf-page` / `.pdf-scroll` / `.textLayer` / `.pdf-overlay` / `.capture-layer` 的 CSS 规则名不作为 `+` 行出现（唯一命中 = 代码内选择器字符串 `querySelector<HTMLElement>(".textLayer")`，即交付档 D4 已登记项）；`::highlight(` 只新增第三条；`NotesPanel.vue` 的 `-` 行恰 2 处（模板根加 `ref="panelEl"`、`.note-row` 的 `:class` 扩展，均为登记项）；`ui-shot.mjs` 只有 **2 个 hunk 且零删除**（`SEL` +4、`r16` 块 980 行）；`smoke-view.mjs` 唯一 `-` 行 = `required` 数组按设计追加；冻结面零 diff：`src/main` / `src/shared/types.ts` / `PdfSearchPanel.vue` / `smoke-notes.mjs` / `assets/styles` / `package.json` / `package-lock.json` / `packages` / `tsconfig*` / `vite.config.ts`；`git status --short` 只出现白名单 8 文件 + `docs/pm/R16-*.md`；无新增依赖、无 `any`、无内联动态 import |
| 13 | 错误日志面 | 本运行的 `[renderer:2\|3]` 行数与种类与 R15 基线运行日志（`pix-v05-r15-final-run2.log`）**逐项相同**（8 行 / 6 种，含既有 `r15-f18` 的 `setPointerCapture` 噪声与三条注入型日志）；锚点链路未产生任何新日志 |
| 14 | 目视（`read` 工具实看 4 张新截图） | `r16-1-page-badges.png`：页 1 右下角 `本页 1 条` 胶囊落在正文下方空白区、不压字形；正文中摘录句有浅色下划线且**无重影**。`r16-4-anchor-with-search.png`：同屏三态可分——锚点 = 下划线、搜索全部命中 = 灰块（`Retrieval`）、当前命中 = 反白（第 2 处 `retrieval`），互不遮挡；标记与搜索面板不相交。`r16-2c-page-anchor-filter-degrade.png`：章节过滤块已消失、提示行逐字 `本页笔记不在当前筛选结果中`、列表仍为搜索过滤态（1 行）且无行高亮。`r16-3b-note-anchor-unmatched.png`：页 2 **无任何高亮 / 残影 / 提示**，标记 `本页 2 条` 仍在 |
| 15 | 零残留 | 一次性脚本（`%TEMP%/r16-review-*.cjs`）运行后删除；`%TEMP%/pix-smoke-view-*` 0 项；仓库内无临时脚本 / 临时产物 / 调试日志；取证进程已退出（`tasklist` 无 electron） |

### B. 验收逐条结论（对照 req / design 冻结判据）

| 需求 | 判据判定 | 关键证据 |
| --- | --- | --- |
| N91-1 | 通过 | 页 1 / 页 2 文本与 title 逐字；页 3 `exists === false` 且页数防空 3；子元素位次（有标记 4 / 无标记 3、`pdf-overlay` 仍在第 3）；`position: absolute` / `z-index 3`；页盒 595×842；标记与 span 及四个控件均不相交；走查计数三项全中 |
| N91-2 | 通过 | `countNotesByPage` 唯一实现点（全仓 3 命中）、函数体内 `for (` 1、文件 `for (` 4；`docKey === null` ⇒ 空 Map；非法页号四条不产键；比较键归一；恒等式；纯性 —— 烟测 `notes-by-page` 6/6 绿，模板 0 次 `Map` 读取（预计算 `pageNotesForRender`） |
| N91-3 | 通过 | 删 / 撤销 ⇒ `本页 2 条 ↔ 本页 1 条`（行数 4/3/4 防空）；搜索过滤态下标记逐字不变而 `.notes-count` / `.group-count` 确实变化；跨文档 `older-paper.pdf` 零标记 + 越界 p7 零改写 + 回切恢复；滚动 / 120% 缩放读数不变；无笔记 IPC、`setInterval` 0 |
| N91-4 | 通过 | `span = 6` / `pageEl.children.length = 4` / `canvas.style.width = 595px`；四个清空点各 1 处新增调用且既有语句零改写；`capture-layer` `z-index 5` 且框选模式下标记仍 2 枚；`r15-f18` 两相位继续通过、153 张既有截图零缺失 |
| N91-5 | 通过 | 60 页 / 0 笔记文档 `.page-notes = 0` 且 `.pdf-page = 60`，翻两页后仍 0；`ReaderPanel.vue` / `WorkspacePage.vue` 内 `page-notes` 0 命中；零笔记文档注册表不存在且无提示 |
| N92-1 | 通过 | 定位前后 `readNotes()` / `notesHash()` 不变、`add/report` 增量 0；`第 3 / 3 页` / `100%` / `sample-paper.pdf` 不变；四维视图状态零变化、无章节过滤；`pageFilter\|pageOnly\|pageRange` 0；`pageFocusToken` 计数 4/7；`chapterFilter.value = null` 新增恰 1 行 |
| N92-2 | 通过 | `collapsedWidth 0 → expandedWidth 268`、活动标签 `notes`、目标行在 loading 窗口之后被定位、`loadDelta 1`、hash 不变；watcher 判据逐字同构（增量恰 1） |
| N92-3 | 通过 | 目标行初始不可见（1819 > 989）→ 定位后完整可见且不被 sticky 头部遮挡、`scrollTop 0 → 1177`；`is-anchored` 恰 1 且 2s 后为 0、期间无提示、配色读数前后不同；退化相位：过滤被单向清除且唯一改动、搜索遮挡时提示逐字 + 无行高亮 + `scrollTop` 不变 + `degradeMs 130`（ready 后立即）、清空搜索后重试成功；文案 1 命中、`is-anchored` 2、`notes-notice` 零增量；rAF 与定时器在 `onBeforeUnmount` 成对清理 |
| N93-1 | 通过 | `excerpt-match` 10/10（含 401/400 边界、重叠两向、重复首命中、`at` 结构性不变量、纯性）；`toLowerCase` 1 / `indexOf` 1 / `for (` 2；实现与冻结参考实现逐字同构（另：我自写的独立实现产出与夹具期望值一致） |
| N93-2 | 通过 | 并存相位：锚点 `size 1` 与 `pix-search` `size 3` / `pix-search-current` `size 1` 同时成立、文本集合不同、下一处不改锚点、`span 6`；关闭搜索后搜索侧自清而锚点仍在；`pix-note-anchor` 2 命中、`pix-search` 零增量、`PdfSearchPanel.vue` 零 diff、别名计数 3/6、行首 `::highlight(` 3 |
| N93-3 | 通过 | 页 1 区间文本去空白后等于摘录、所属页 `1`、两次结构快照逐字相同、`mark 0`、`--scale-factor 1` / `595px`；第 2 页注册表不存在 + `logDelta 0` + 无提示、回页恢复；80% 与回 100% 读数逐字（476px 为独立复算）；快速连点后区间页 == 当前页；四个清空点 + 一个触发点收敛到唯一删除函数（`HIGHLIGHT_NOTE_ANCHOR` 3） |
| N93-4 | 通过 | 交替序列 10 次点击全部 `disabled === false`，`maxMs 6 ≤ 1000`、`totalMs 26 ≤ 6000`、`revisitMs` 最大 6 ≤ 300（逐次登记）；超长门在 `indexOf` 之前、`MAX_ANCHOR_TEXT_LENGTH` 2 命中、页缓存为 `Map` 且文档切换清空；`CHECK_EXIT=0` |
| N93-5 | 通过 | 高亮前后文字层 `childNodes` 类型序列与文本逐字相同；同页真实选区非空且 `.quick-ask` 出现；`addEventListener` 零增量、`setInterval` 0、无内联样式写入文字层；`PdfSearchPanel.vue` 与既有两条 `::highlight()` 规则零 diff |
| N94-1…N94-6 | 通过 | 逐行对照 §1.5 分支表：零笔记页 / 整篇零笔记 / 越界页 / 非法页号 / 非 PDF / 加载中与失败 / `pageCount 0` / 无文字层（2s 静默放弃、不重试、日志 0、标记仍在）/ 文字层未就绪（等待后补画）/ 不可匹配（静默且同页其它摘录照常）/ 缩放与 release 与文档切换与卸载（先清后画）/ 外部改动 + 刷新（只读、按新列表重算）/ 框选模式（标记仍在、点击被既有层拦截、高亮不清）| `r16-5` 三相位 + `r16-1` 两相位 + `r16-3` 两相位读数全绿；`pix/src/main/**` 与 `shared/types.ts` 零 diff |
| N95-1 | 通过 | `通过 51 / 失败 0` 连续两次、退出码 0；既有 5 组 35 条零改动（`smoke-view.mjs` 唯一 `-` 行 = `required` 追加）；新文件按登记进入 `files` / `required` |
| N95-2 | 通过 | 5 组 14 条 record / 13 张截图齐备；`SEL` 4 项新键且既有 `pdfPageOne` 逐字不动；既有场景 / label / 截图名 / helper 零删除零改写（2 hunk、零 `-` 行）；stub 面零 hunk；`pix/package.json` 零 diff |
| N95-3 | 通过 | 零缺失（153 张 / 59 种 label 全在，153+13 = 166、223+14 = 237、59+5 = 64）；双向相等；对标记与高亮最有判别力的既有场景（`pdf-text-layer-geometry` / `page-tracking` / `scale-restored` / R11 搜索 / R12 `.reader-section` / `r15-f18` / R13–R14）全部续存且读数相同 |
| N95-4 | 通过 | `CHECK_EXIT=0`；主进程 / 共享类型 / `package.json` / `package-lock.json` / `packages` / electron-builder 配置 / `variables.css` 零 diff；`git status --short` 只在白名单内；无临时产物与调试日志 |

### C. 专项反证（任务书 ①–⑥）

| # | 反证项 | 结论与证据 |
| --- | --- | --- |
| ① | 高亮生命周期（翻页 / 缩放 / 重渲染后仍正确、不残留失效 Range） | **未发现残留**。翻页：第 2 页（不可匹配）注册表不存在、回第 1 页恢复同一区间文本；缩放：80% 与回 100% 两次读数一致、每次都由清空 → 重画收敛到**新**文字层（`--scale-factor` / `canvas.style.width` 同步复算）；重渲染：`r16-5` 清空文字层后用缩放重建 ⇒ 高亮恢复；快速连点 4 次后断言「区间所属页 == 当前页」（实测通过）。`releasePage` 的整表清空与「清空后不重画」的残留窗口见 D 节次级项①（夹具外，未触发） |
| ② | 与搜索高亮共存（同页同时有搜索命中与摘录高亮） | **成立且互不破坏**：并存相位两注册表同时非空（锚点 1 / 搜索 3 / 当前命中 1）、区间文本集合不同、点「下一处」后锚点逐字不变、关闭搜索面板后搜索侧自清而锚点仍在；`span` 计数 6 不变 |
| ③ | 不可匹配摘录必须静默（不报错、不空刷） | **静默**：第 2 页与无文字层两处均 `has === false`、`.notes-notice` 为 `null`、`[pdf-viewer]` 日志增量 0（等待窗口只做 rAF + `querySelector` 读取，超时即放弃且不重试）；整轮运行的错误日志面与 R15 基线逐项相同 |
| ④ | 标记计数与 `notes.json` 一致（含外部改动刷新后） | **一致**：标准种子（文件自算 p1 = 1 摘录 / p2 = 2（1 摘录 + 1 结论）/ p3 无）与屏幕文本 title 逐字命中；面板内删 / 撤销实时跟随；外部把 `n-current-1` 移到 p3 并刷新后 ⇒ p1 无标记、p2 `本页 2 条`、p3 `本页 1 条（摘录 1 · AI 结论 0）`、刷新只读（hash 不变、add/report 增量 0）；跨文档不串页、越界页不钳制不改写 |
| ⑤ | 标记点击后的定位与返回路径可用 | **可用**：面板打开时滚动到目标行（完整可见、不被 sticky 头部遮挡）+ 2s 瞬时高亮；左栏折叠 + 资料库标签时自动展开并切到「笔记」标签、目标行在 loading 窗口之后被定位、`loadDelta ≤ 1`；章节过滤被单向清除（可见：整块从 DOM 消失）而搜索 / 排序 / 仅看当前文档 / 选择集 / 阅读位置 / 缩放零变化；目标行被搜索挡住时逐字提示且「清空搜索后重试成功」（退化不粘滞） |
| ⑥ | 选择 / 复制 / 框选不受影响 | **不受影响**：锚点相位内真实选区非空且 `.quick-ask` 出现；高亮不插入任何节点（文字层快照逐字相同）；框选层 `z-index 5` 仍在标记之上、框选模式下标记仍 2 枚；既有选择 / 摘录 / 复制 / 框选场景（R3 / R11 / R15 的 `r15-f18` 两相位、复制链路的 `n 条` 读数）全部续存且测量值不变 |

### D. must-fix 清单

**无（0 项）**。唯一工程门 0 error；两套烟测与离屏验收全绿；零缺失与新增配额齐备；14 条新断言按原始读数逐条复算通过；白名单、禁项与零结构改动红线全过。

### E. 次级项（不阻塞验收，建议登记 / 后续轮次）

1. **`releasePage` 的整表清空存在「清空后不重画」的残留窗口（设计层取舍，夹具外）**：`releasePage` 只对「距当前页 > 4 页」的页调用（`observePages` 的守卫），被 release 的页**不可能是当前页**，因此该清空会把当前页仍然有效的区间一并删掉，而清空点没有安排重画 —— 在长文档里（跳页 / 大跨度滚动后 IO 回调晚于最后一次重画）存在「当前页高亮消失且直到下一次翻页 / 缩放 / 列表变化 / 任意页渲染完成才恢复」的窗口。夹具（3 页）无法触发，且 req §0.5 清空时机③ 的措辞就是「与既有 `releasePage` 同步清注册表」，故不作为 must-fix；建议后续轮次二选一：把清空范围限定到被 release 的页，或在 `releasePage` 后补一次重画调度。
2. **`renderPage` 末尾实际新增 2 行（登记项 D2）**：设计 §2.2 #5 写「追加一行 `scheduleNoteAnchor();`」，实现另有 `anchorTextCache.delete(pageNumber);`（流式 chunk 下避免用不完整片段写缓存，是「收敛」成立的必要一步，语义上属 §1.4.4③ 缓存纪律的超集）。建议在设计档同步该行，避免后续轮次按「1 行」口径误判越界。
3. **文档计数口径自相矛盾（登记项 D3，行为无差异）**：req N93-1 判据 11 与设计 §5.4 #14 写 `grep -rn "matchExcerpts\|foldText" pix/src | wc -l` = **4**，但冻结参考实现在 `matchExcerpts` 内部调用 `foldText`（两侧同一份折叠），实测 **6**；本次实现按冻结参考实现，行为正确。建议按实现放宽该行或写明拆解口径。
4. **`foldText` 的两处边界（登记，不影响夹具与中文）**：① `at.length === text.length` 对含 `U+0130`（`İ`）等「小写化会改变长度」的字符不成立（本步实测：`foldText(["İstanbul cafe"])` ⇒ 折叠长 14 / `at` 长 13）⇒ 该点之后的端点映射可能错位一位或被丢弃（`anchorRangeFor` 取到 `undefined` 即返回 `null`，仍是静默降级，不会抛错）；② `isSpace` 不含 `U+FEFF`（与 `\s` 不同，代码注释已如实写明「近似 `\s`、不含 `U+FEFF`」）。两者都在最佳努力语义内，建议登记为已知取舍。
5. **既有 measurement 的抖动字段（基线口径建议）**：`r11-quick-ask-scroll-scope` 的 `stageScroll.count` 是「累积滚动事件计数」，在 R16 之前的运行里也出现 0 / 1 两种取值（`pix-v05-r14-final` 0、`pix-v05-r15-review` 0、`pix-v05-r15-final` 1）；本步复验同样为 0，与 R16 变更无关。建议后续零缺失比对脚本对这类计时 / 计数噪声字段使用归一化口径（本步即用该口径：归一化后 223 条既有测量零实质差异）。

### F. 结论

**accept。** 交付与冻结契约逐条对齐：页标记（字面 / 位次 / 零占位 / 计数口径 / 实时跟随 / 跨文档）、标记点击的一次性定位（含 loading 有界等待、章节过滤单向清除、退化提示与重试）、原文锚点（唯一实现点、只画当前页、等待作废、零结构改动、与搜索高亮互不破坏）、降级矩阵与配额（13 张 / 14 条 / 5 种 label / 51 条烟测）全部由独立复验的真实读数支撑；工程门、烟测、离屏（退出码 0、`failure === null`）与红线走查全过，未发现阻塞性缺陷。E 节 5 条为登记型建议，不改变本轮验收结论。
