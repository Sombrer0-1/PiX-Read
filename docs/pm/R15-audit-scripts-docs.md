# R15 全量代码审计：脚本、配置与文档

> 审计面：`pix/scripts/ui-shot.mjs`（8954 行）、`pix/scripts/smoke-notes.mjs`（1141 行）、`pix/scripts/smoke-view.mjs`（587 行）、`pix/scripts/assert-main-esm.mjs`（53 行）、`pix/scripts/dev-electron.mjs`（25 行）、`pix/package.json`、`pix/tsconfig{,.main,.preload}.json`、`pix/vite.config.ts`、`README.md`、`REMAINING.md`、`docs/pm/**` 中的过时陈述（只登记）。
> 方式：只读。本轮**未修改任何源码或脚本**，**未执行任何 git 写命令**，**未运行** `npm run build` / `npm test` / `npm run package` / `npm run dev`，**未跑离屏 `ui-shot.mjs`**（按分片纪律留给后续步骤，避免并发占端口 5199）。
> 编号约定：`S-SD-NN` = 问题项（P0/P1/P2），`D-SD-NN` = 登记不修项。所有行号来自本轮真实读取的 HEAD `e5dc001` 版本文件。
> 判据来源：`docs/pm/PRD-V0.5.md` §5（工程红线，逐条编号见 §0）、`docs/pm/R11-{design,req,review}.md`（守卫与产物自净契约）、`docs/pm/R13/R14-{design,dev,review}.md`（读数与零缺失口径）、`pix/scripts/ui-shot.mjs` 头部（自述约束）。

## 0. 基线与复跑证据

| 命令 | 真实结果 |
| --- | --- |
| `cd pix && npm run check` | 退出 0、无 error 输出（`vue-tsc` + 主进程 `tsc` + preload `tsc` 全绿） |
| `cd pix && node scripts/smoke-view.mjs` | 尾行 `通过 35 / 失败 0`，`SMOKE_VIEW_EXIT=0` |
| `cd pix && node scripts/smoke-notes.mjs` | 尾行 `通过 51 / 失败 0`，`SMOKE_NOTES_EXIT=0` |
| 两个烟测跑完后 `git status --short` | 仅 4 个并行分片的 `?? docs/pm/R15-audit-*.md`；**无新增残留**，`ls -d $TEMP/pix-smoke-*` 无命中 ⇒ 自清理声明成立 |
| `git log --oneline -1` / `git branch` / `node --version` | `e5dc001` / `main` / `v24.19.0` |
| 文件行数（`wc -l`） | ui-shot 8954、smoke-notes 1141、smoke-view 587、assert-main-esm 53、dev-electron 25、README 120、REMAINING 153 |
| stub↔preload 三面对齐探针（自写，只读两文件） | `iface=42 stub=42 equal=true`、`onlyInInterface=[]`、`onlyInStub=[]` ⇒ **当前无漂移，但无自动判据（见 S-SD-01）** |
| 静态计数（自写正则，只读 ui-shot） | `capturePage(win, "<name>")` 唯一名字 **144**（含失败帧 `99-failure-state.png` ⇒ 成功路径 **143**，与 `docs/pm/R14-dev.md:444` 的「产出 143 张截图」一致）；`record("<label>", …)` 调用 **207** + `measurements.push({ label: "<name>"…})` **4** = **211 条测量**（与 `docs/pm/R14-design.md:1075` 的 211 一致）；label 前缀 **51 种**（与同处一致） |
| `grep -rn "PixApi" pix/scripts/*.mjs` | 只命中 `smoke-view.mjs:29` 的一条注释；**无任何脚本读取/比对 preload 与 stub 的方法名** |
| `ls -a` / `find . -maxdepth 2 -name "*.yml"`（排除 node_modules） | 无 `.github/`、无任何 CI 配置；`git ls-files \| grep -i husky` 无命中 |
| 未被允许执行的检查（本轮做不了） | `npm run build` / `npm test` / `npm run package` / `npm run dev` / `ui-shot.mjs` / `assert-main-esm.mjs`（后者会删 `dist/preload-tmp`，属构建产物写操作） |

## 1. 结论分布与总表

**P0 = 0，P1 = 3，P2 = 17，D = 3**（合计 23 条；另有「已核对、确认非缺陷」13 项见 §5，未验证事项见 §6）。
本面没有 P0：`ui-shot.mjs` 的越界守卫（`assertOutRootSafe`）、产物自净（只删 `<OUT_ROOT>/shots`）、userData 重定向（`:8834`）三者叠加后，脚本对本机数据与仓库的破坏面已被实跑与走查双重覆盖；两处残余风险（临时目录归属、`window-all-closed` 的退出码竞态）分别列 D-SD-03 与 S-SD-07。

| 编号 | 分级 | 位置 | 一句话 |
| --- | --- | --- | --- |
| S-SD-01 | P1 | `ui-shot.mjs:814`、`pix/src/main/preload.ts:34-107`/`:109-191`；PRD `:78` | stub 与真实 `PixApi` 的「三面一致」是 PRD 硬要求，但**零自动化判据**，每轮靠手工正则比对（R14 甚至留成未决项 U2） |
| S-SD-02 | P1 | `ui-shot.mjs:1726-1741`（`:1738`）对照 `:5268-5305`、`:1578-1581` | `selectPageSpan` 用裸 20 s `waitFor("摘录浮层")` 等前置；一次环境性迟到滚动即整轮取证终止（R14 记录到两次：dev 基线 116/143 张 + 审查步重跑） |
| S-SD-03 | P1 | `ui-shot.mjs:8910-8929`、`:8938`；PRD `:76` | 结束自检只比「磁盘 PNG ↔ 清单名字」；`MEASUREMENTS` 与场景/label 数只打印不校验 ⇒ 整组场景静默消失仍 exit 0，PRD「零缺失」全靠人工 |
| S-SD-04 | P2 | `ui-shot.mjs:66`、`:109` | `SEL` 两项死键（`mapNode` / `staleText`）无任何消费者 |
| S-SD-05 | P2 | `ui-shot.mjs:1560-8797`（单个 7240 行函数）、`:1248/:1250` 与 `:1561/:1567`、`:486` | 结构：一个函数装完全部场景；`js` / `waitFor` / `sleep` 各重复定义两份 |
| S-SD-06 | P2 | `ui-shot.mjs:34` | 默认 `OUT_ROOT` 写死本机用户名路径；换机器不设 `PIX_SHOT_ROOT` 时守卫直接拒绝启动 |
| S-SD-07 | P2 | `ui-shot.mjs:8932-8939` 与 `:8954` | 失败判定前先 `win.destroy()`，而 `window-all-closed → app.exit(0)`：若该事件先被处理，失败 run 会以 0 退出（假绿） |
| S-SD-08 | P2 | `ui-shot.mjs:8813-8830`、`:8832-8838` | `assertOutRootSafe` 只 `app.exit(1)` 不向 `main()` 返回状态；注释声称的「失败路径零副作用」依赖 `app.exit` 的同步性 |
| S-SD-09 | P2 | `assert-main-esm.mjs:27-32`、`:44-52` | 只断言 `preload.cjs` 存在 + 无 CJS 特征；不校验包入口与 `shared/types.js` 等关键产物，也不校验「walk 到 >0 个文件」 |
| S-SD-10 | P2 | `ui-shot.mjs:1237-1245`、`:1226-1230`、`:8910-8929` | `capturePage` 不记录字节数、无「非空/最小体积」判据 ⇒ 0 字节或空白帧同样进清单并通过结束自检 |
| S-SD-11 | P2 | `ui-shot.mjs:382-407`（`:386`/`:394`/`:395`） | fixture 库不重置为确定状态：只删 `reports/` 与两个 `reader-state.json`，`notes.md` 等上轮遗留保留 |
| S-SD-12 | P2 | `smoke-view.mjs:10`、`smoke-notes.mjs:11` | 两个烟测头部注释的覆盖面/条数已过时（4 组 29 条 vs 实际 5 组 35 条；smoke-notes 头未提 report/stat 四组） |
| S-SD-13 | P2 | `pix/package.json:32/34/36/42/45`（共 16 处 `^`） | 直接依赖用 `^` 范围，与根 `package.json` 全精确锁定 + `AGENTS.md:53`「直接外部依赖保持固定版本」冲突（PRD `:77` 冻结依赖字段） |
| S-SD-14 | P2 | `pix/package.json:56-65` | `build.files` 里 `index.html` 为死配置；`resources/skills/**/*` 与 `extraResources` 重复打包同一份技能 |
| S-SD-15 | P2 | `pix/tsconfig.preload.json:10-11` | `verbatimModuleSyntax: false` 与 `importsNotUsedAsValues: "remove"` 均为无效配置（等于默认值） |
| S-SD-16 | P2 | `README.md:14-28`、`:73-92` | 功能特性停在与 R11 同步的状态（缺 R12/R13/R14 三条主线）；「开发」节没有 `smoke:notes` / `smoke:view` / 离屏取证入口 |
| S-SD-17 | P2 | `REMAINING.md:3`、`:20`、`:15` | 自述与实现不符：称「红笔圈画…已落地」（全库零实现）、把 `annotationMode` 列为 reader-store 字段（实际为 `captureMode`）、引用的空态/placeholder 文案已过时 |
| S-SD-18 | P2 | `R13-design.md:1158`、`R14-design.md:191`、`R14-dev.md:288`、`R11-review.md:41/208`、`R11-req.md:44` | 轮次文档里的读数（135/198/46、smoke 44/29）与行号锚点（`:33`/`:5854`/`:1024-1032`）相对 HEAD 已过时（现为 143/211/51、35/51，行号 34/8835+8838/1237 起） |
| S-SD-19 | P2 | `dev-electron.mjs:19-25` | 无 `child.on("error")`；`process.exit(code ?? 0)` 把信号退出（`code === null`）归一化为 0 |
| S-SD-20 | P2 | `pix/package.json:16-18`、`package.json:5-7`/`:13`、`test.sh:75` | 验证入口无聚合：无 CI、根 `npm test` 只覆盖 `packages/*`（pix 不在 workspaces），三个验证入口（`check` / 两个烟测 / 离屏）全靠人工纪律 |
| D-SD-01 | D | `ui-shot.mjs:1578-1581` | `record()` 首败即抛 ⇒ 单点失败终止全轮（取证契约，改动牵动 MANIFEST 语义与文档口径） |
| D-SD-02 | D | `ui-shot.mjs:414-1120` 等 | stub 是主进程语义的第二实现（约 40 个镜像函数），无自动交叉比对；收敛为单一来源需重构取证基建 |
| D-SD-03 | D | `ui-shot.mjs:8813-8830`、`:8838` | `PIX_SHOT_ROOT` 只保证「在 tmpdir 内、与仓库互不包含」，不校验目录归属 ⇒ 指向他人临时目录时会递归删其 `shots/`（R11 已登记取舍） |

## 2. P1 条目

### S-SD-01：stub 与真实 `PixApi` 的三面一致没有自动判据（PRD 硬要求靠手工）

| 项 | 内容 |
| --- | --- |
| 分级 | P1（契约漂移：同一 API 面存在三处实现，规则散落且无机器判据） |
| 位置 | `pix/scripts/ui-shot.mjs:814`（stub `const api = {`）、`:21` 与 `:428`（自述约束注释）；`pix/src/main/preload.ts:34-107`（`PixApi` 接口）/`:109-191`（`api: PixApi` 实现）；`docs/pm/PRD-V0.5.md:78`（硬要求）；`docs/pm/R14-design.md:191`（手工判据命令）；`docs/pm/R14-dev.md:288`（U2 未决项）；`pix/package.json:12-18`（构建/检查链，无该项） |
| 证据 | ① PRD-V0.5 §5.9 原文：「离屏取证脚本 `pix/scripts/ui-shot.mjs` 是唯一 UI 回归基线：stub 的 `pixApi` 面必须与 `pix/src/main/preload.ts` 保持一致」。② `grep -rn "PixApi" pix/scripts/*.mjs` 只命中 `smoke-view.mjs:29` 一条注释 —— 没有任何脚本读取这两个文件做比对。③ 每轮的判据是手写命令，见 `R14-design.md:191`「建议命令：以 `^  [A-Za-z0-9_]+[:(]` 提取三处名单并做字符串相等比较」；`R14-dev.md:288` 的 U2 行明确写着 stub 面「待 B 落 `notesStat` 后按同法复跑」。④ 本轮自写探针（只读）结果：`iface=42 stub=42 equal=true`、`onlyInInterface=[]`、`onlyInStub=[]` ⇒ 今天是一致的。 |
| 为什么是问题 | 三处实现同一规则，判据却是「每轮人工跑一条一行命令」：漏跑一次就退化为无判据（U2 就是漏跑后的登记）。漂移后果不对称——stub 少一个方法会在 ui-shot 里以 `undefined is not a function` 直接炸出来（可见），而 stub 多一个方法、或 stub 与 preload 的同名方法语义不同（例如参数顺序、返回 `notes` 是否回传）时，**ui-shot 全绿而真机是坏的**，属于本仓库最贵的一类假绿：它骗过的正是「UI 回归基线」本身。 |
| 建议修法 | 新增 `pix/scripts/assert-api-parity.mjs`（约 40 行、零依赖，沿用 `spawnSync`/正则范式）：分别提取（a）`preload.ts` 中 `export interface PixApi { … }` 的成员名序列、（b）同文件 `const api: PixApi = { … }` 的键序列、（c）`ui-shot.mjs` 里 stub 模板 `const api = { … }` 的键序列，要求三者**有序逐字相等**，否则打印差集并 `process.exit(1)`；把它接到 `pix/package.json` 的 `check`（或与 `smoke:notes`/`smoke:view` 并列的新 `smoke:api`）即可每轮自动生效。 |
| 修复风险 | 零：新增文件 + 1 个 `scripts` 条目；PRD §5.8 明确允许新增 scripts（R11 有先例），不改 `preload.ts`、不改 stub、不动任何既有断言。 |
| 判据 | ① `node scripts/assert-api-parity.mjs` ⇒ 退出 0、打印 `42 / 42 / 42`。② 负向控制：临时删掉 stub 里 `notesStat` 一行（或把 `api` 中某键改名）⇒ 退出 1 且打印 `onlyInInterface=["notesStat"]`（对照本轮探针输出格式）。③ `npm run check` 仍 0 error。 |

### S-SD-02：`selectPageSpan` 的裸 20 s 等待是已知 flake 点，一次超时牺牲整轮取证

| 项 | 内容 |
| --- | --- |
| 分级 | P1（失败路径缺陷 + 环境竞态：与产品行为无关的时序会毁掉全部证据） |
| 位置 | `pix/scripts/ui-shot.mjs:1726-1741`（`selectPageSpan`，问题语句 `:1738` `await waitFor("摘录浮层", …)`，超时取 `:1250`/`:1567` 的默认 20000 ms）；同文件已有的正解范式 `:5268-5305`（`ensureQuickAskExcerptReady`：有界静默 → 复核可见/选区/文本三项 → 不成立则有界重建选区）；失败放大机制 `:1578-1581`（`record` 首败即抛）；仓库内 flake 记录 `docs/pm/R14-dev.md:348`、`:451`、`:564`、`docs/pm/R14-review.md:352` |
| 证据 | `docs/pm/R14-dev.md:348`：「本轮基线目录 `pix-v05-r14-base` …**未跑完**：在 r11-3 相位 4 等待「摘录浮层」超时（既有 hover/滚动时序 flake，与本轮改动无因果关系）⇒ 产物 116 张 / 160 条 / 34 种 label、`failure` 为该超时原文」；`R14-review.md:352` 记录审查步对照实验「第一次运行在 `r11-3` 相位 4「摘录浮层」等待超时…重跑完成」。代码侧根因可读：`selectPageSpan` 只做「重建选区 → 等浮层可见」，而迟到的阅读区滚动会按既有语义隐藏浮层（`ensureQuickAskExcerptReady` 的注释 `:5268-5274` 把这条语义写明为「指针落在 hide 路径」），此时等待条件永久为假，只能耗满 20 s 抛错。 |
| 为什么是问题 | 本轮取证是「一次全量 run = 143 张图 + 211 条测量」的整体，`record` 首败即抛意味着一次环境噪声的代价是**整轮重跑**（R14 为此重跑两次：dev 基线一次、审查对照一次），而下一次同样的噪声会落在同一处（该点是所有相位共用的前置）。这不是产品缺陷，但它直接决定回归基线的可信度与迭代成本，且「既有 flake」已经被文档承认为常态。 |
| 建议修法 | 把 `selectPageSpan` 的第三步换成与 `ensureQuickAskExcerptReady` 同款的**有界重取**：`waitFor("摘录浮层", …, 3000)` 失败后不抛错，而是重放一次「重建选区 + selectionchange」并复核「浮层可见 && feedbackClass === null && 选区文本 == span 文本 && 锚点在 .reader-stage 内」，最多 N 次；仍不成立则保留原文案判红（不得降级为通过），并在测量里落 `attempts` 计数。可选加强（不属于本条必做）：把 `record` 改成本场景内先聚合 failures 再抛，避免一个相位失败即丢弃后续 100+ 场景。 |
| 修复风险 | 中低。`selectPageSpan` 被既有场景多处调用（`:1726` 定义；调用点 `:1943`、`:3860`、`:5182`、`:6457`、`:6569`、`:6666`、`:6677`，加上 `:5293` 的重取路径共 8 处），改法必须保持「断言字面与期望值零改写」；风险点是重取可能把「产品真的不再显示浮层」洗成通过——因此复核条件必须与阶段 4/5 的既有三项判据逐字同源（可见 actions 态 + 选区同文本 + 锚点在 stage 内），并在 `record` 数据里留下 attempts/trail 供人工判读。 |
| 判据 | ① 连续 3 次全量离屏（三个不同 `PIX_SHOT_ROOT`）⇒ 退出码 0、`MANIFEST.failure === null`、张数与 label 集合逐字相同。② 负向控制：在相位前置注入一次「选区后立刻 `scrollTop = 200`」的脚本，若浮层因此消失，`MEASUREMENTS` 里该场景的 `attempts ≥ 2` 且断言仍全绿（证明是重取生效，而非把等待时间加长掩盖）。③ 反向保护：让复现条件变为「浮层永不出现」（例如临时改 stub 不派发快速摘录浮层数据）⇒ 必须判红而不是通过。 |

### S-SD-03：结束自检不校验「场景/断言覆盖」，整组场景静默消失仍绿灯

| 项 | 内容 |
| --- | --- |
| 分级 | P1（静默失败：回归基线的覆盖丢失无法被自身发现） |
| 位置 | `pix/scripts/ui-shot.mjs:8910-8929`（结束自检：磁盘 PNG 名字 ↔ `shots[]` 双向相等 + 白名单外条目告警）、`:8907`（`MEASUREMENTS.json` 只写）、`:8938`（只 `console.log` 张数）；纪律出处 `docs/pm/PRD-V0.5.md:76`（第 7 条「既有场景与断言零缺失」） |
| 证据 | 自检代码只有两段：PNG 名字差集、白名单外条目（`:8910-8929`）。`grep -n "baseline\|EXPECTED\|shots.length\|measurements.length" ui-shot.mjs` 只命中夹具正文与 `:8938` 的打印 —— 没有任何与基线或常量的比对。零缺失判据目前靠人工：`docs/pm/R13-req.md:639`、`R13-dev.md:508-509`、`R14-dev.md:598` 都是「与基线目录的 `MANIFEST.shots[].name` 集合 / `MEASUREMENTS` label 集合做 ⊇ 比对」的一次性命令。本轮独立复算：静态名字 144（含失败帧）⇒ 成功路径 143、`record` 207 + 字面 `measurements.push` 4 = 211 = 文档读数，说明**当前**口径没丢东西。 |
| 为什么是问题 | 该脚本是 PRD 定义的唯一 UI 回归基线，而它的自检只覆盖「已发生的截图没写丢」，不覆盖「本该发生的场景没发生」。9k 行、每轮追加、允许最小改动既有场景（R14 的 D2 就是改既有场景 1 行）——只要一次 `return`/误嵌套/复制粘贴覆盖让某组 `record` 不再执行，run 仍然退出 0，人工比对是唯一防线；一旦有人拿该 run 当基线，下一轮就会把丢失固化成「新常态」。 |
| 建议修法 | 在 MANIFEST 增加 `groups`（`record` label → 条数）与 `counts`（`shots` / `measurements` / `labels`）；脚本末尾：① 若 `process.env.PIX_SHOT_BASELINE` 指向上一轮 `MANIFEST.json`，做 label 集合 ⊇ 比较并把缺失项 push 进 `errors`（判据与 R13/R14 文档里的手工命令同口径，可直接复用其脚本片段）；② 未给基线时至少断言 `shots.length >= <内联常量>` 与 `measurements.length >= <内联常量>`（常量与文档表格同源，改一处改两处可见）。 |
| 修复风险 | 低，但有一个真实成本：把绝对值写死会让「每轮新增场景」都必须同步常量（团队已在文档里手工维护 143/211/51，属于同类成本）。建议默认「无基线时只打印读数、有基线时判红」，并把基线路径写进脚本头部用法说明。 |
| 判据 | ① 正常 run：`MANIFEST.json` 里出现 `groups`/`counts`，退出 0。② 负向控制：临时注释掉 `record("r14-group-jump", …)`（或整段 r14-5）后带 `PIX_SHOT_BASELINE=<上一轮 MANIFEST>` 跑 ⇒ 退出 1 且错误文案列出缺失 label；恢复后退出 0。 |

## 3. P2 条目

### S-SD-04：`SEL` 的两项死键

| 项 | 内容 |
| --- | --- |
| 位置 | `pix/scripts/ui-shot.mjs:66`（`mapNode: ".map-node"`）、`:109`（`staleText: ".notes-stale .stale-text"`） |
| 证据 | 用只读探针统计 `SEL.<key>` 在 `SEL` 定义之后全文的引用：60 项中仅 `mapNode`、`staleText` 零引用（其余 58 项均有消费者；`mapRow`、`staleRow` 等在场景里被用到）。同名选择器在别处以字面量硬写：`".map-node"` 出现在 `:4171`（`rowProbe` 内 `row.querySelector`）与 `:4240`（点击），`".stale-text"` 出现在 `:8130`。 |
| 为什么是问题 | `SEL` 是跨轮追加的共享契约表（R10–R14 每轮追加若干项），留着没人用的键会让「选择器集合 = 场景实际依赖」这一心智模型失真，也让后来者误以为该元素有断言覆盖。 |
| 建议修法 | 二选一：① 删除这两项（对应断言改为类名直写，与 `:4171`/`:4240`/`:8130` 现状一致）；② 或在 `:4171`/`:4240`/`:8130` 改用 `SEL.mapNode`/`SEL.staleText`，让「选择器集合 = 场景实际依赖」重新成立。推荐 ②（保留单一来源），但需注意 `:4171` 在模板字符串内拼接，改动要放在 JS 注入片段的构造处而非字符串内部。 |
| 修复风险 | 零：删除后重新 `npm run check` 无关；ui-shot 若要复跑，静态引用已确认为 0。 |
| 判据 | `grep -c "SEL.mapNode\|SEL.staleText" pix/scripts/ui-shot.mjs` = 0，且 `.map-node` / `.stale-text` 若仍需断言则改用类名直写（当前不需要）。 |

### S-SD-05：单函数 7240 行的场景体 + 重复 helper

| 项 | 内容 |
| --- | --- |
| 位置 | `pix/scripts/ui-shot.mjs:1560-8797`（`runReaderStateScenarios` 一个函数容纳 R6/R9–R14 全部场景，约 7240 行）；重复定义：`:1248`（`runScenario` 内 `js`）与 `:1561`（同签名再定义）、`:1250-1258` 与 `:1567-1575`（`waitFor` 逐字重复，含 20000 ms 默认值与同一句超时文案）、`:486`（模块级 `sleep`）与 `:1562`（场景内再定义） |
| 证据 | `grep -n "^async function \|^function "`：顶层只有 4 个函数（`repaint` / `capturePage` / `runScenario` / `runReaderStateScenarios`）+ `assertOutRootSafe` / `main`；`:1567-1575` 的 `waitFor` 与 `:1250-1258` 逐字相同；`:1562` 的 `sleep` 与 `:486-490` 同实现。 |
| 为什么是问题 | 导航与增量维护成本直接可见（R15 审计只能按 `// --- 场景 NN` 注释定位）；重复 helper 带来两份默认超时与两份失败文案，改一处漏一处就会让「同一语义在不同相位表现不同」，也让将来的 per-scenario 隔离/并行无从下手。 |
| 建议修法 | 至少把 `js`/`waitFor`/`sleep` 提升为模块级工厂函数（`makeDriver(win)` 返回同一套原语），两个场景函数共用；进一步把每轮场景拆成 `scenarios/rNN-*.mjs` 导出 `(ctx) => Promise<void>`，由 `runReaderStateScenarios` 顺序执行（`ctx` 携带现有关闭变量）。 |
| 修复风险 | 纯重构，但在 9k 行文件上必须逐段移动、不能改字面；建议分两步（先抽 helper，再拆场景）并在每步后跑一次全量离屏比对 label 集合。 |
| 判据 | `grep -c "const waitFor = async" = 1`、`grep -c "const sleep = " = 1`；拆分后全量 run 的 `MANIFEST.shots[].name` 集合与 label 集合逐字等于重构前。 |

### S-SD-06：默认 `OUT_ROOT` 写死本机用户目录

| 项 | 内容 |
| --- | --- |
| 位置 | `pix/scripts/ui-shot.mjs:34` `const OUT_ROOT = process.env.PIX_SHOT_ROOT \|\| "C:/Users/86157/AppData/Local/Temp/pix-r5";`（守卫在 `:8813-8830`；专名目录约定见 `R11-design.md:22`） |
| 证据 | 同文件 `:8813-8830` 的守卫要求 `OUT_ROOT` 严格位于 `os.tmpdir()` 之下；仓库文档已承认该约束的机器耦合：`docs/pm/R11-design.md:22`「本机 `os.tmpdir()` … `:33` 默认值位于其下 ⇒ 不设 `PIX_SHOT_ROOT` 时守卫可过（其它机器若 tmpdir 不同，必须显式设置）」、`R11-req.md:46` 同义。 |
| 为什么是问题 | 换用户/换机器后不设环境变量时脚本会走 `app.exit(1)` 拒绝启动（失败是响亮的，不是静默），但这意味着「默认路径」在任何非本机环境都不可用，而默认值本可以直接满足守卫。 |
| 建议修法 | 改为 `const OUT_ROOT = process.env.PIX_SHOT_ROOT \|\| join(tmpdir(), "pix-r5");`（`tmpdir` 已在 `:29` 顶层导入；`resolve`/`sep` 也已在同一行导入）。守卫语义、产物自净路径、文档里的显式 `PIX_SHOT_ROOT=…` 用法全部不变。 |
| 修复风险 | 零：仅默认值分支；R11 的「失败路径零副作用」判据（`test ! -e` 两次 + `EXIT=1`）不受影响。 |
| 判据 | 清空 `PIX_SHOT_ROOT` 跑一次 ⇒ 守卫通过、产物落在 `%TEMP%/pix-r5`；再设 `PIX_SHOT_ROOT=<系统盘外路径>` ⇒ 仍按原文案拒绝启动。 |

### S-SD-07：`window-all-closed → app.exit(0)` 与失败判定构成退出码竞态

| 项 | 内容 |
| --- | --- |
| 位置 | `pix/scripts/ui-shot.mjs:8954`（`app.on("window-all-closed", () => app.exit(0));`）、`:8931-8939`（`await server.close(); win.destroy();` 之后才判断 `failure \|\| errors.length` 并 `app.exit(1)`） |
| 证据 | 代码顺序即证据：终局路径先销毁唯一窗口，再同步评估失败；若 `destroy()` 触发的 `window-all-closed` 先于 `:8933` 的条件被处理，进程会以 0 退出且不打印失败原因。仓库内既有实跑显示当前顺序通常成立（`docs/pm/R11-dev.md:877` 记录失败 run `UI_SHOT_EXIT=1` 且产出 `99-failure-state.png`），但这一顺序没有任何判据保护（自检里不含退出码反向测试）。 |
| 为什么是问题 | 对取证工具而言「失败 run 变成绿灯」是最坏的一类假绿：CI/流水线只看退出码，`MANIFEST.failure` 的存在就没人读了。触发条件是事件调度的先后，随 Electron/OS 版本变化而变，属于潜伏而非已爆。 |
| 建议修法 | 把 handler 改为惰性：`let finished = false; app.on("window-all-closed", () => { if (finished) app.exit(0); });` 并在 `:8931` 前后置 `finished = true`；或直接 `app.on("window-all-closed", () => {})`（本脚本场景内不需要关窗行为）。 |
| 修复风险 | 零：不改任何场景与断言，仅终局退出路径。 |
| 判据 | 负向控制：临时在场景里抛错（或改一条期望值）跑全量 ⇒ 必须 `UI_SHOT_EXIT=1` 且 `MANIFEST.failure` 非空；正常 run ⇒ `UI_SHOT_EXIT=0`。 |

### S-SD-08：`assertOutRootSafe` 不向 `main()` 返回状态

| 项 | 内容 |
| --- | --- |
| 位置 | `pix/scripts/ui-shot.mjs:8813-8830`（函数体末 `app.exit(1); return;` 只从自身返回）、`:8832-8838`（`main()` 第一句即调用它，随后无条件 `app.setPath` / `mkdirSync(OUT_ROOT)` / `rmSync(SHOTS_DIR)`） |
| 证据 | 注释原文（`:8811-8812`）：「`main()` 的第一条语句：失败路径零副作用（不建目录、不删路径、不设 userData）」，但代码没有 `if (!ok) return;` 这类早退；零副作用完全依赖 `app.exit(1)` 的即时性。`docs/pm/R11-review.md:208` 的判定命令（`test ! -e` 两次 + `EXIT=1`）证明在实际 Electron 上通过，但该保证是运行期行为而非代码结构。 |
| 为什么是问题 | 若 `app.exit` 在某些版本/平台上异步化，`mkdirSync(OUT_ROOT)` 与 `rmSync(SHOTS_DIR, { recursive: true, force: true })` 会在守卫已判定「路径不安全」的前提下照常执行——即守卫拒绝的正是最不该写的那类路径。 |
| 建议修法 | `function assertOutRootSafe(): boolean` 返回 `false`，`main()` 里 `if (!assertOutRootSafe()) return;`（`app.exit(1)` 保留用于立即终止）。 |
| 修复风险 | 零。 |
| 判据 | `PIX_SHOT_ROOT=<仓库内路径>` 跑一次 ⇒ `EXIT=1`、打印拒绝文案，且该路径下无 `shots/`、无 `electron-userdata/`（R11-review 的 `test ! -e` 判据可原样复用）。 |

### S-SD-09：`assert-main-esm.mjs` 的产物面断言过窄

| 项 | 内容 |
| --- | --- |
| 位置 | `pix/scripts/assert-main-esm.mjs:27-32`（只 `access(preloadCjs)`）、`:44-52`（walk `.js` 查 CJS 特征） |
| 证据 | 全文 53 行只有两类判据：`dist/main/main/preload.cjs` 存在；`dist/main/**` 内 `.js` 不含 `Object.defineProperty(exports, "__esModule"` 或无前导 `"use strict"`。没有断言包入口（`pix/package.json:6` 的 `dist/main/main/index.js`）、没有断言 `dist/main/shared/types.js`（`preload.ts:4-6` 注释点名的关键产物）、也没有「walk 结果非空」。 |
| 为什么是问题 | 该脚本的职责是「产物形态错了就拦住 build」，但形态漂移（例如 `rootDir` 推断变化导致层级改变、`shared` 未 emit）只要 `preload.cjs` 还在、且剩下的文件都不是 CJS，就会静默通过；缺陷会推迟到 `electron .` 启动时才炸。 |
| 建议修法 | 加一行期望清单并逐个 `access`：`const REQUIRED = ["main/index.js", "main/preload.cjs", "shared/types.js"];`（相对 `dist/main`），并断言 `files.length > 0`。 |
| 修复风险 | 零（构建辅助脚本，不属任何冻结面；不影响 `dist` 内容）。 |
| 判据 | `node scripts/assert-main-esm.mjs`（在 `npm run build:main` 之后）⇒ 退出 0；临时删掉 `dist/main/shared/types.js` 再跑 ⇒ 退出 1 且点名缺失产物。 |

### S-SD-10：截图产物无字节级判据（0 字节 / 空白帧同样进清单）

| 项 | 内容 |
| --- | --- |
| 位置 | `pix/scripts/ui-shot.mjs:1237-1245`（`capturePage`：`:1241` `writeFileSync(file, image.toPNG());`、`:1242` `shots.push({ name, file, rect: rect || null })`）、`:8910-8929`（自检只比名字与白名单外条目） |
| 证据 | `shots[]` 条目字段只有 `name` / `file` / `rect`（`:1242`）；PNG 字节数既不落盘也不判据。离屏窗口的已知行为（脚本头部 `:21-22` 注释）是「只在 DOM 变更时出帧、`capturePage()` 会拿到上一帧」，团队已用 `invalidate()` + 200 ms 等待缓解；但**若某帧彻底为空**（0 字节 PNG），结束自检仍会通过（名字在、文件在），后续人工目视才会发现。 |
| 为什么是问题 | 取证产物的价值全在「图能看」；一张 0 字节/空白的 PNG 会以「绿 run + 有截图」的形式进入基线目录，下一轮的零缺失比对（按名字）也会把它继承下去。R14 已登记过「两张截图字节相同」（同帧）的偏差 ⇒ 字节级读数这条路径本来就是团队认可的判据来源。 |
| 建议修法 | `const buffer = image.toPNG();` 记录 `bytes: buffer.length` 进 `shots[]`，并在 `bytes < 1024` 时 push 进 `errors`（离屏 PNG 至少数 KB）；`MANIFEST` 里同时给出 `counts.shotsBytes`。 |
| 修复风险 | 零（不新增截图、不改场景）；若某张合法截图确实很小，阈值取 1 KB 足够保守。 |
| 判据 | 正常 run 后 `MANIFEST.shots[].bytes` 全部 > 1024；负向控制：把某次 `capturePage` 的 `toPNG()` 临时替换为 `Buffer.alloc(0)` ⇒ 自检报红并 exit 1。 |

### S-SD-11：fixture 库不重置为确定状态

| 项 | 内容 |
| --- | --- |
| 位置 | `pix/scripts/ui-shot.mjs:382-407`（`writeFixtures`）：只 `rmSync(.pix-read/reports)`（`:386`）与两个 `reader-state.json`（`:394-395`），其余靠覆盖写；`notes.md`、`.pix-read/` 下其它文件、库根任何非夹具文件都跨轮保留 |
| 证据 | 62-5 会点导出按钮写出 `.pix-read/notes.md`（`:5870-5889` 断言导出提示 `已导出 4 条 → .pix-read/notes.md`），r13 会写 `.pix-read/reports/*.md`（已清）。`notes.md` 没有任何清理或重置动作；当前断言都只用「前后哈希相等」（`:7654`、`:7773`）⇒ 本轮**无断言依赖其不存在**。 |
| 为什么是问题 | 这是「跨轮不可复现」的潜在面：任何新增的枚举类断言（数 `.pix-read` 条目、数库根文件数、断言「首次导出」空态）都会踩到上一轮残留，而失败现象依赖「上一次跑没跑过导出」，属于最难定位的一类偶发。fixture 库位于 `OUT_ROOT` 内、可安全整体重建，没有理由不做确定性重置。 |
| 建议修法 | `writeFixtures()` 开头 `rmSync(LIBRARY_DIR, { recursive: true, force: true }); rmSync(LIBRARY_B_DIR, { recursive: true, force: true });` 再按现有代码重建（注意保留 `SHOTS_DIR` 的创建顺序不变）。 |
| 修复风险 | 零（都在临时目录内）；唯一影响是每次 run 多一次小规模删除。 |
| 判据 | 连续两次全量 run，第二次的 `MANIFEST.shots[].name` 与 label 集合逐字等于第一次；且 `ls <OUT_ROOT>/library/.pix-read` 在 run 开始时只含 `notes.json`。 |

### S-SD-12：两个烟测脚本头部注释的覆盖面/条数已过时

| 项 | 内容 |
| --- | --- |
| 位置 | `pix/scripts/smoke-view.mjs:10`（「…`<reading_context>` 载荷组装（4 组 29 条）」）、`pix/scripts/smoke-notes.mjs:11`（「…驱动 notes-store 的撤销 / 失败 / 槽生命周期 / 导出面」） |
| 证据 | 本轮实跑与静态计数：smoke-view 实际 **5 组 35 条**（`section-hit 8` / `section-null 8` / `section-nav 8` / `section-format 5` / `badge-counts 6`，组注释分别在 `:129/:211/:264/:341/:429`），头部只描述前四组；smoke-notes 实际 **8 组 51 条**（`undo-roundtrip 8` / `undo-failures 8` / `undo-slot-lifecycle 6` / `export-and-empty 4` / `report-render 7` / `report-files 5` / `report-failures 6` / `notes-stat 7`），头部完全没有 R13/R14 追加的四个组。 |
| 为什么是问题 | 头部是这两个脚本唯一的使用说明（README 未收录，见 S-SD-16）；写死且滞后的条数会让「这一轮加了几条/有没有漏跑」这类判断失去参照，也是 §0 表格里「4 组 29 条」与实跑「35」对不上的原因。 |
| 建议修法 | 头部改为不含数字的覆盖清单（组名列表），或改为「组名 + 条数」并规定与 `runSection*` 调用序同源；把「总数」留给运行输出（尾行已有 `通过 N / 失败 M`）。 |
| 修复风险 | 零。 |
| 判据 | 头部描述与 `main()` 里 `run*` 调用序一一对应；`grep -c "^function run"` 数目等于头部列出的组数（view 5 / notes 8）。 |

### S-SD-13：pix 直接依赖未固定版本，与仓库规范冲突

| 项 | 内容 |
| --- | --- |
| 位置 | `pix/package.json` 的 16 个 `^` 范围依赖（如 `:32` `"pinia": "^2.1.0"`、`:34` `"vue": "^3.4.0"`、`:36` `"vuetify": "^3.12.7"`、`:42` `"electron": "^33.0.0"`、`:45` `"vite": "^5.4.0"`）；对照 `package.json` 根字段全为精确版本（无 `^`/`~`） |
| 证据 | 自写探针统计：pix 非固定直接依赖 = 16 项（`@mdi/font`、`electron-store`、`electron-updater`、`highlight.js`、`marked`、`pinia`、`vue`、`vue-router`、`vuetify`、`@types/node`、`@vitejs/plugin-vue`、`concurrently`、`electron`、`electron-builder`、`vite`、`wait-on`）；根 = 0 项。规范出处：`AGENTS.md:53`「将 npm 依赖和 lockfile 变更视为已审查的代码。直接外部依赖保持固定版本」；`docs/pm/PRD-V0.5.md:77`（§5.8）把每轮的依赖字段改动冻结为零改动。 |
| 为什么是问题 | 同一仓库两套口径（根精确、pix 浮动），且 pix 有自己的 `pix/package-lock.json`（已被 git 跟踪）⇒ 两次 `npm install --ignore-scripts` 之间 `node_modules` 内容可以漂移，而「取证基线」对渲染层依赖版本（尤其 vuetify 的组件 DOM 结构、pdfjs 已单独锁死）是敏感的。 |
| 建议修法 | 在负责人批准的一次性依赖收口里把这些范围改为精确版本（`npm install --package-lock-only --ignore-scripts` 刷新 `pix/package-lock.json`），或反向修订规范（把「直接外部依赖固定」限定为内核白名单）。**本轮不动**（PRD §5.8 冻结 + 需负责人批准）。 |
| 修复风险 | 触碰依赖字段与 lockfile（PRD §5.8 冻结面），需要负责人追认并单独一轮；改后必须跑 `npm ci --ignore-scripts` + `check` + 两个烟测 + 一次全量离屏比对。 |
| 判据 | `node -e "const p=require('./pix/package.json');console.log(Object.values({...p.dependencies,...p.devDependencies}).filter(v=>/^[~^]/.test(v)))"` ⇒ `[]`。 |

### S-SD-14：`build.files` 的死配置与重复打包

| 项 | 内容 |
| --- | --- |
| 位置 | `pix/package.json:56-65`：`"files": [...]`（`:57` 起，`:58` `index.html`、`:59` `resources/skills/**/*`）+ `"extraResources": [{ "from": "resources/skills", "to": "skills" }]`（`:61-65`） |
| 证据 | 运行时只加载 `dist/renderer/index.html`：`pix/src/main/index.ts:129` `win.loadFile(join(__dirname, "..", "..", "renderer", "index.html"))`（dev 分支 `:122` 走 vite dev server，模板由 vite 从项目根提供）⇒ 打进 asar 的根 `index.html` 无消费者。技能目录被两份配置同时打包；运行时优先 `process.resourcesPath/skills`（extraResources 的落点）：`pix/src/main/session-bridge.ts:86-96` `const packaged = join(process.resourcesPath, "skills"); if (app.isPackaged && existsSync(packaged)) return packaged;`，asar 内的 `resources/skills` 只是第三顺位回退。 |
| 为什么是问题 | 死配置会让人误以为「改根目录 `index.html` 会影响打包产物」；重复打包同一份技能会让产物多一份无用的体积，并在「两份不一致」时产生难以解释的加载歧义（虽然单次构建不会不一致）。 |
| 建议修法 | 从 `files` 删除 `"index.html"`；`resources/skills/**/*` 二选一——保留 `extraResources`（运行时首选）并删 `files` 项，或保留 asar 内副本并删 `extraResources`（但这会让 `session-bridge.ts:86-88` 的首选分支永远不命中，不推荐）。 |
| 修复风险 | 打包面改动（`npm run package` 属禁跑项，本轮无法验证）；改完必须至少做一次真机安装后「技能可加载」的核对。 |
| 判据 | 打包产物内 `resources/skills/read-and-analyze-materials/SKILL.md` 存在（extraResources 路径）；asar 内不再有 `index.html`；启动后技能列表仍能加载。 |

### S-SD-15：`tsconfig.preload.json` 的两条无效选项

| 项 | 内容 |
| --- | --- |
| 位置 | `pix/tsconfig.preload.json:10`（`"verbatimModuleSyntax": false`）、`:11`（`"importsNotUsedAsValues": "remove"`） |
| 证据 | TS 5.8.3（`pix/node_modules/typescript` 实测 `Version 5.8.3`）的选项表里 `verbatimModuleSyntax` 默认即 `false`；`importsNotUsedAsValues` 的 `category` 为 `Backwards_Compatibility`、`defaultValueDescription` 为 `0`（= `remove`）——从 `pix/node_modules/typescript/lib/_tsc.js` 的选项表直接读出（`{"name":"importsNotUsedAsValues", … "category": Diagnostics.Backwards_Compatibility, "defaultValueDescription": 0 /* Remove */}`）。两行都不改变 emit 结果；`npm run check` 通过也印证没有生效差异。 |
| 为什么是问题 | 注释与实现不符的孪生形态：配置里写着「让 preload 以 CJS 形态 emit」的两条保险，实际是默认值，会给后来者虚假的安全感（尤其是 preload 必须 CJS 这条约定）。 |
| 建议修法 | 删除这两行；若确实想表达「preload 必须 CJS」，用注释写清 `module: "CommonJS"` 的作用与 `assert-main-esm.mjs` 的产物判据。 |
| 修复风险 | 零（构建产物逐字不变，可用 `npm run build:main` 前后 `git diff dist/main` 证明——但 build 属禁跑项，本轮只作静态判断）。 |
| 判据 | 删除后 `npm run check` 仍 0 error；`tsc -p tsconfig.preload.json -o` 输出与删除前逐字节相同（编译产物比对）。 |

### S-SD-16：README 的功能与验证两节滞后于实现

| 项 | 内容 |
| --- | --- |
| 位置 | `README.md:14-28`（功能特性）、`:73-92`（开发） |
| 证据 | 功能特性最后一条落在 R11 之前的主线；R12（章节 chip / 上一下一节 / `reading_context` section 行）、R13（结构化阅读报告导出）、R14（资料库树笔记徽标、笔记文件外部改动感知与刷新、笔记组头跳转）三条已发布主线在 README 中**零出现**（`grep -n "报告\|徽标\|外部\|章节" README.md` 只命中 `:18`/`:19`/`:21` 的 R6/R10 旧文案）。开发节只列 `build:main`/`dev`/`dev:renderer`/`check`/`build`/`package`（`:81-86`），没有 `pix/package.json:16-17` 已提供的 `smoke:notes`/`smoke:view`，也没有离屏取证的入口（其运行方式只写在该脚本头部 `:5-6`）。README 最后一次改动停在 R11 提交（`git log -1 -- README.md` = `c16135d`）。 |
| 为什么是问题 | README 是本仓库「功能现状」的唯一权威入口（`REMAINING.md:3` 也把读者指向它）；滞后的功能清单会让新会话在错误的前提下规划（比如以为没有报告导出而重复设计），缺失的验证入口会让「怎么证明没坏」只能靠翻脚本头部。 |
| 建议修法 | 功能特性补 3 条（R12/R13/R14 各一条，措辞照抄 `docs/pm/R13-*.md`/`R14-*.md` 的用户可见描述）；开发节补一段「验证」：`npm run check`、`npm run smoke:notes`、`npm run smoke:view`、离屏取证完整命令（`PATH=... ./node_modules/.bin/electron scripts/ui-shot.mjs`，含 `PIX_SHOT_ROOT` 说明与「不得并发」提醒）。 |
| 修复风险 | 零（纯文档）。 |
| 判据 | README 功能特性覆盖 R6–R14 每条已发布主线；开发节能给出四条命令且逐字可执行；与 `pix/package.json:15-17` 的脚本名一致。 |

### S-SD-17：REMAINING.md 的自述与实现不符（红笔圈画 / reader-store 字段 / 文案）

| 项 | 内容 |
| --- | --- |
| 位置 | `REMAINING.md:3`（状态说明尾句）、`:20`（reader-store 字段清单）、`:15`（空态与 placeholder 引文） |
| 证据 | ① `:3` 称「知识地图、红笔圈画、阅读向 agent 工具均已落地」，但红笔圈画全库零实现：`grep -rln "annotationMode\|PdfAnnotator\|annotations" pix/src pix/resources` **无命中**；`ls pix/src/renderer/components/workspace/` 无 `PdfAnnotator.vue`（只有 ChatPanel/KnowledgeMap/LibraryPanel/NotesPanel/PdfSearchPanel/PdfSelectionQuickAsk/PdfViewer/ReaderPanel）；`grep -rn "captureCurrentPage" pix/src` 无命中。② `:20` 把 `annotationMode` 列为既有字段，实际 `reader-store.ts:8` 的字段表与 `:32` 的定义是 `captureMode`。③ `:15` 引用的空态文案「输入消息即可新建或继续对话。」与 placeholder「向 PiX-Read 提问」在 `ChatPanel.vue:1056`（实际「输入消息即可新建或继续对话；提问会自动附带当前文档与页码。」）与 `:1101`（实际「向 PiX-Read 提问，可直接粘贴截图」）已过时。 |
| 为什么是问题 | 该文件虽然自我声明为「历史路线图参考」，但状态说明那一句是**对当前实现的事实陈述**（同句还正确地指向 `pix-paths.ts` 与 README），读者会据此认为「红笔圈画已具备」，而下一节 `:59` 又把红笔圈画列为「未开始」，文件内部自相矛盾。 |
| 建议修法 | `:3` 改为「知识地图、阅读向 agent 工具均已落地；红笔圈画见下文『未开始』」；`:20` 的字段清单改为指向 `reader-store.ts:8` 的权威列表（或直接删除该行）；`:15` 的文案引文加「（当时）」或同步为现文案。 |
| 修复风险 | 零（纯文档；`REMAINING.md` 不在任何冻结面内）。 |
| 判据 | `grep -n "红笔圈画" REMAINING.md` 的三处陈述互相一致且与 `pix/src/renderer/components/workspace/` 实际文件集合一致。 |

### S-SD-18：docs/pm 轮次文档里的读数与行号锚点已过时

| 项 | 内容 |
| --- | --- |
| 位置 | `docs/pm/R13-design.md:1158`（「离屏 135 张 / 198 条测量 / 46 种 label…`smoke:notes` 通过 44 / 失败 0；`smoke:view` 通过 29 / 失败 0」）、`docs/pm/R14-design.md:191`、`docs/pm/R14-dev.md:288`（U2：三面同步手工比对/待复跑）、`docs/pm/R11-review.md:41`（`ui-shot.mjs:33`）、`docs/pm/R11-review.md:208`（`main()` 之前无落盘、`:5843-5848`、`:31-38`）、`docs/pm/R11-req.md:44`（`ui-shot.mjs:33`、`grep -c "rmSync(SHOTS_DIR" = 0`） |
| 证据 | 本轮实测/静态计数：成功路径 **143** 张截图、**211** 条测量、**51** 种 label（与 `R14-design.md:1075` 的验收读数一致；R13 那份 135/198/46 是 R13 轮次读数）；`smoke:notes` 实跑 `通过 51 / 失败 0`、`smoke:view` 实跑 `通过 35 / 失败 0`（R13 文档里的 44/29 对应更早的版本）。行号锚点：`const OUT_ROOT` 现在在 `ui-shot.mjs:34`（文档写 `:33`）、`mkdirSync(OUT_ROOT)` 在 `:8835`+`rmSync(SHOTS_DIR)` 在 `:8838`（文档写 `:5854`）、`capturePage` 在 `:1237-1246`（文档写 `:1024-1032`）、`grep -c "rmSync(SHOTS_DIR" ui-shot.mjs` 现为 **1**（R11-req 记的是改造前 0）。 |
| 为什么是问题 | 这些文档是「唯一 UI 回归基线」的判据出处（`R13-req.md:321` 的零缺失判据、`R14-design.md:191` 的三面对齐命令都直接被后续轮次引用），读数与行号不带 as-of 标记时，后来的执行者会拿旧数字去比对新 run，把真实新增/删除当成偏差。 |
| 建议修法 | 只登记、不改内容；建议在这些行尾部加「读数 as-of `<commit>`」或在文档头部加一行「本文所有读数与行号锚点为该轮 HEAD 快照」。 |
| 修复风险 | 零（纯文档；`git status` 会显示为未跟踪/已跟踪文档改动，需负责人决定）。 |
| 判据 | 文档里出现的每个数字/行号都能被一句 `as-of <commit>` 限定；下一轮引用时不再被当作 HEAD 事实。 |

### S-SD-19：`dev-electron.mjs` 的退出码归一化与缺失的 error 处理

| 项 | 内容 |
| --- | --- |
| 位置 | `pix/scripts/dev-electron.mjs:19-25`（`child.on("exit", (code) => { process.exit(code ?? 0); });`，全文无 `child.on("error")`） |
| 证据 | 全文 25 行；`:15-18` 用 `spawn("electron", ["."], { stdio: "inherit", shell: process.platform === "win32" })`。信号终止时 `code === null` ⇒ `code ?? 0` 返回 0；spawn 失败（`error` 事件）在 Node 里是未处理事件，会以栈回溯崩掉而不是给出「electron 未安装/未在 PATH」的可读提示。 |
| 为什么是问题 | 只影响开发启动器，但后果是误导性的：`npm run dev` 可能报成功而 Electron 实际被杀；出错时错误信息不是仓库语言（中文文案规范）也不指明补救（`npm install`/`npx electron`）。 |
| 建议修法 | 加 `child.on("error", (err) => { console.error("[dev-electron] electron 启动失败：", err.message); process.exit(1); });`，并把退出归一化改为保留信号信息：`if (child.signalCode) { console.error("electron 被信号终止：" + child.signalCode); process.exit(1); }`。 |
| 修复风险 | 零（dev-only 启动器，不参与打包与取证）。 |
| 判据 | 把 `electron` 从 PATH 移除后 `npm run dev` ⇒ 一条中文错误 + exit 1；正常 Ctrl+C 终止 ⇒ 非 0 退出并打印信号名。 |

### S-SD-20：验证入口没有聚合（无 CI、`npm test` 不覆盖 pix、钩子不可见）

| 项 | 内容 |
| --- | --- |
| 位置 | `pix/package.json:15-18`（`check` / `smoke:notes` / `smoke:view` / `package`，离屏无脚本入口）、`package.json:5-7`（`workspaces: ["packages/*"]`）/`:13`（`"test": "npm run test --workspaces --if-present"`）、`test.sh:75`（`npm test`） |
| 证据 | ① 无 CI：`ls -a` 无 `.github`，`find . -maxdepth 2 -name "*.yml" -o -name "*.yaml"`（排除 node_modules）零命中。② `pix` 不在根 `workspaces` 内 ⇒ 根 `npm test` 只跑 `packages/*` 的测试，永远不跑 `pix` 的 `check` 与两个烟测。③ `git ls-files \| grep -i husky` 无命中、仓库内无 `.husky/`，而根 `package.json:14` 声明 `"prepare": "husky"`（本轮禁跑生命周期脚本，其实际副作用未验证）。④ 离屏取证需要 `./node_modules/.bin/electron` + `PIX_SHOT_ROOT`，没有 npm script，只能靠脚本头部注释与人传。 |
| 为什么是问题 | 三套判据（类型检查 / 纯函数烟测 / 数据面烟测 / 离屏）各自都做得很好，但没有任何一处把「提交前必须跑哪些」变成可执行的一条命令；AGENTS.md 与 PRD §5 把这些写成纪律，纪律的强度完全取决于每个会话的记忆。本面唯一能自动跑的只有 `pix` 的 `check` 与两个烟测（都很便宜：本轮实测两者合计 ≈1 分钟）。 |
| 建议修法 | 在 `pix/package.json` 加一个聚合脚本（例如 `"verify": "npm run check && npm run smoke:notes && npm run smoke:view"`）并在 README 的验证小节里写明（与 S-SD-16 同一处改动）；离屏因需要窗口环境单独列为「取证」而非「verify」。若负责人愿意，再加一个 `smoke:ui`（`electron scripts/ui-shot.mjs`）以便统一调用。 |
| 修复风险 | 零（新增 scripts 条目；PRD §5.8 允许）。 |
| 判据 | `cd pix && npm run verify` ⇒ 三个子命令依次执行且尾部 `通过 N / 失败 0`（check 无 error），退出 0。 |

## 4. D 条目（登记不修）

| 编号 | 位置 | 为什么登记不修 | 代价 / 若将来要做 |
| --- | --- | --- | --- |
| D-SD-01 | `ui-shot.mjs:1578-1581`（`record` 首败即抛） | 「一次失败即整轮红」是 R11–R14 一路冻结的取证契约：`MANIFEST.failure` 是单字符串、文档里的零缺失/终验口径都按「整轮」表述，改成「失败继续 + 逐场景状态」需要同时重新定义产物字段与所有轮的终验读法，属流程决策而非脚本修补。 | 现状代价：慢机器上一次环境 flake 牺牲整轮（R14 记录了两处：dev 基线 116/143 张、审查对照重跑）。缓解：S-SD-02 的有界重取（把环境噪声在源头吸收）+ S-SD-03 的覆盖自检（把「没跑的」变成可判），两者都不动契约；若仍要改，建议最小形态是「同场景内聚合 failures」，场景之间仍保持首败即停。 |
| D-SD-02 | `ui-shot.mjs:414-1120`（stub 内 `readNotesFile`/`notesAdd`/`notesRestore`/`renderDocumentReport`/`normalizeState`/`libraryList` 等约 40 个镜像函数） | stub 按设计是「假主进程」：它必须**不依赖编译产物**（`sandbox: false` 的 preload 里跑，`?worker`/ESM 产物不保证可 require），所以只能重写语义。收敛为单一来源需要把 `src/main/*` 编译成 CJS 预载进 stub 或让 ui-shot 起真主进程，二者都会改动取证形态（`pixApi` 全量替换为真 IPC、注入口消失），等于重做基线基建。 | 现状代价：主进程语义变更时，ui-shot 侧可能在「符合 stub 的错语义」下全绿（stub 少方法会炸，语义漂移不会）。缓解已有两处：报告模板用「同一份手写期望串」在 `smoke-notes`（真主进程）与 stub 两侧钉住；错误文案常量在 stub 内逐字复制并在烟测侧断言。可继续按此模式把更多可复用规则纳入同串断言。 |
| D-SD-03 | `ui-shot.mjs:8813-8830` 守卫范围、`:8838` `rmSync(SHOTS_DIR, …)` | 守卫只保证「在 `os.tmpdir()` 内且与仓库互不包含」，不保证目录归本脚本所有：把 `PIX_SHOT_ROOT` 指向 `%TEMP%` 下别的工具的目录时，会递归删除 `<该目录>/shots`。R11 需求/评审已显式登记该取舍（`R11-req.md:44`「评审的第一种写法（只挡仓库路径）挡不住『仓库外的任意目录』」，`R11-review.md:208` 记录了最终取「tmpdir 归属 + 仓库互不包含」）。 | 现状代价：需要使用者自己保证 `PIX_SHOT_ROOT` 指向专用目录（文档里的用法都是 `pix-v05-rXX` 专名，风险低）。加固设想：要求 `OUT_ROOT` 为空目录或含 `.pix-shot-root` 标记文件，否则拒绝启动；费用是所有既有调用命令都要先建标记文件（文档、脚本头注释、历史 dev 档里的命令全部要改）。 |

## 5. 已核对、确认非缺陷（本轮实读/实跑）

| # | 核对项 | 依据 | 结论 |
| --- | --- | --- | --- |
| 1 | 143 张 / 211 条 / 51 种 label 的口径与脚本静态计数一致 | 自写正则统计（§0 表）；对照 `R14-design.md:1075` | **一致**：144 个名字 − 1 个失败帧 = 143；207 个字面 `record` + 4 个字面 `measurements.push` = 211；label 前缀 51 种。R14 的验收读数在交付态可复算 ⇒ 「数量口径」当前无误，只是缺自动判据（S-SD-03） |
| 2 | stub `api` 与 `preload.ts` 的 `PixApi` 当前是否漂移 | §0 的三面对齐探针（只读） | **无漂移**：42 / 42 有序逐字相等（`onlyInInterface=[]`、`onlyInStub=[]`）；缺的是机器判据（S-SD-01） |
| 3 | 两个烟测的清理与退出码声明 | 本轮实跑：`通过 35 / 失败 0`、`通过 51 / 失败 0`，跑完 `git status --short` 无新增、`ls -d $TEMP/pix-smoke-*` 无命中；代码侧 `finally { rmSync(TMP, …) }`（view `:577-584`、notes `:1131-1138`） | **成立**：仓库零残留、退出码 0/1 语义与头部注释一致 |
| 4 | 两个烟测的编译面白名单（产物集合缺失/多出即红） | `smoke-view.mjs:539-555`、`smoke-notes.mjs:1089-1099`（`required`/`allowed` 双向差集，不通过则不进入断言） | **有效**：这是「用仓库自身类型系统编译真实源码、不复制源码」的关键防漂移设计，本轮实跑证明产物集合稳定（`renderer/utils/*.js` + `shared/types.js` / `main/*.js`） |
| 5 | `smoke-notes` 的越界判据与 PRD §5.6 一致 | `smoke-notes.mjs:556`「`.pix-read/` 之外零写盘（ws-a 一级条目只有 `.pix-read`；ws-b 为空）」+ `:510-557` 的 `export-and-empty` 组 | **通过**：写盘面被夹具根锁定，且断言用「一级条目集合逐字」而非「存在性」 |
| 6 | 守卫失败路径在本机的实际行为 | `R11-review.md:208`（`test ! -e` 两次 + `EXIT=1`）；本轮读码确认 `assertOutRootSafe` 是 `main()` 第一条语句（`:8833`） | **成立**（结构上仍建议加早退，见 S-SD-08） |
| 7 | 失败 run 的退出码 | `R11-dev.md:877`（`UI_SHOT_EXIT=1` + `[shot] 99-failure-state.png` + 场景失败原文） | **成立**（当前顺序可用；竞态无判据，见 S-SD-07） |
| 8 | `pix-file://` 是否已彻底移除（REMAINING 的失效声明） | `grep -rn "pix-file" pix/src pix/resources` 零命中；PDF 字节走 `libraryReadFile`（stub `:876-880` / preload `:160`） | **一致**：REMAINING 那段「本文该节已失效」的自述与代码相符 |
| 9 | README「项目结构」清单与实际文件集合 | 逐个核对 `pix/src/main/*.ts`（14 个全在）、`renderer/{components,stores,composables,utils,types,assets}` 全部条目、`resources/skills/read-and-analyze-materials/SKILL.md` | **一致**：README 的路径清单没有指向不存在的文件（滞后的是「功能特性」，见 S-SD-16） |
| 10 | `.gitignore` 是否覆盖 AGENTS.md 点名的产物 | `.gitignore` 含 `node_modules/`、`dist/`、`pix/release/`、`pix/release-bugfix/`、`*.tsbuildinfo`、`*.log`；`git ls-files pix/dist \| wc -l` = 0 | **通过**：仓库只跟踪源码（701 个跟踪文件中无构建产物） |
| 11 | `assert-main-esm.mjs` 的两个 CJS 判据在当前产物上是否误报 | 未执行（会删 `dist/preload-tmp`，属构建产物写操作） | **未验证**（列入 §6），但走查其判据（`Object.defineProperty(exports, "__esModule"` / 首个 80 字符内的 `"use strict";`）与 tsc 的 CJS emit 形态相符 |
| 12 | `vite.config.ts` 与离屏取证的配合 | `pix/vite.config.ts`（root `.`、`base './'`、`resolve.alias` 指 `src/renderer`+`src/shared`、`build.outDir dist/renderer`、`server.port 5173 strictPort`、`server.fs.allow` 含仓库根以便加载 `packages/*` 的 `file:` 依赖、`worker.format 'es'` 对应 `PdfViewer.vue:14` 的 `?worker&inline`）；`ui-shot.mjs:8844-8852` 用同配置起 5199（`:8849` `server: { port: PORT, strictPort: true }`）并把 `cacheDir` 指到 `OUT_ROOT/vite-cache`（`:8847`） | **一致**：离屏不会写仓库（vite 缓存与 userData 都在 `OUT_ROOT` 内） |
| 13 | 烟测脚本的并发安全 | `smoke-view.mjs:24` / `smoke-notes.mjs:24` 的临时目录名带 `Date.now()`；`ui-shot.mjs:42` 固定 5199、`:8849` `strictPort: true`（PRD §5.9「两个取证进程不得并发」由端口冲突自然拒绝） | **通过**：烟测可并行；离屏并发会在 `server.listen()` 处响亮失败（`main()` 的 catch → `app.exit(1)`，`:8947-8951`） |

## 6. 未覆盖 / 未验证事项（供负责人判断）

| # | 事项 | 原因 |
| --- | --- | --- |
| 1 | 本条目的全部时序/退出码/截图读数（S-SD-02 的 flake 复现、S-SD-07 的竞态、S-SD-10 的字节判据） | 分片纪律禁止跑离屏 `ui-shot.mjs`（避免与并行取证争用 5199）与其依赖的 build；S-SD-02 的证据来自仓库内既有实跑记录（R14 dev/review），非本轮实测 |
| 2 | `assert-main-esm.mjs` 的实际行为、`npm run build:main` 产物比对 | 不在允许命令清单内（会写/删 `dist`） |
| 3 | 打包面（S-SD-14）的真实产物结构与技能加载路径 | `npm run package` 禁跑；结论来自 `pix/package.json` + `session-bridge.ts:86-96` + `index.ts:129` 的走查 |
| 4 | 根 `package.json:14` `"prepare": "husky"` 的实际副作用 | 禁跑生命周期脚本；只能确认「仓库内无 `.husky/`、git 未跟踪任何 husky 文件」 |
| 5 | `dev-electron.mjs` 的信号/错误路径（S-SD-19） | 需要真跑 `npm run dev`（禁跑）与移除 PATH 的实验 |
| 6 | `docs/pm` 全量过时陈述 | 只抽样核对了 R11/R13/R14 四份文档里的读数与行号锚点（S-SD-18）；R6–R10 轮次文档未逐份复查 |
| 7 | stub 镜像语义与主进程的逐字段等价性 | 只核对了方法名集合（42/42）与两处文案常量（notes-store 的 4 条中文错误、reader-state 的 `MIN/MAX_SCALE`）；`notesAdd` 的越界判据用 `CONFIG.root`（工作区 A）而写盘路径随 `activeRoot`（`ui-shot.mjs:518-523` 与 `:694-696`），A 侧行为等价、B 侧若新增「在 B 工作区摘录」的场景会与真主进程（以当前库根判越界）不同口径 —— 本轮无场景触发，登记为潜在漂移点（并入 D-SD-02 的缓解清单） |

## 7. 本面最值得修的 3 条

| 序 | 编号 | 一句话 | 排序理由 |
| --- | --- | --- | --- |
| 1 | **S-SD-01** | 给「`PixApi` 接口 / `api` 实现 / ui-shot stub」三面一致加一个自动比对脚本（约 40 行） | 它守的是 PRD 明文的硬要求，却是本面唯一「每轮靠人肉一条命令」的判据，且已经在 R14 留下未决项（U2）；漂移后果是 UI 回归基线的假绿（stub 语义/签名不同步时真机坏、ui-shot 全绿），代价最小（新增文件 + 1 个 script 条目，不动任何冻结面），收益是永久消除。 |
| 2 | **S-SD-02** | `selectPageSpan` 复用同文件既有的「有界静默 + 复核 + 有界重取」，别让一次环境性迟到滚动毁掉整轮取证 | 这是本面唯一有**多份实跑记录**的可靠性缺陷（R14 dev 基线 116/143 张 + 审查步同点重跑），代价是整轮离屏时间；正解就写在同一个文件里（阶段 4/5 的 `ensureQuickAskExcerptReady`），复用其判据与文案即可，既不改断言字面也不降级为「通过」。 |
| 3 | **S-SD-03** | 让脚本自己能判「场景/断言零缺失」（MANIFEST 记 `groups`/`counts` + 与基线 label 集合比对） | PRD §5.7 把「既有场景与断言零缺失」写成每轮硬纪律，但判据全在文档里的一次性命令；9k 行、每轮追加、允许最小改动的既有场景（R14 的 D2 就是改既有场景 1 行）意味着「一组场景静默消失」是真实可能且当前不可发现的假绿。加判据的成本低于一次误信基线带来的返工。 |
