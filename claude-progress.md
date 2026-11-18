# 进度日志

<!--
文件名沿用课程历史约定（learn-harness-engineering），与具体 agent 无关：
DSH、Codex、Claude Code 都可以用。agent 不会自动维护它，靠 AGENTS.md 的
「会话工作循环」要求：开工时读，收尾时更新。
-->

## 当前已验证状态

- 仓库根：`D:\GitHub_place\projects\DeepSeek 复刻APP\chat-demo`（git 仓库，remote 指向 GitHub `KhalilYamber/DeepSeek-APP-Replica`）
- 标准启动路径：`./init.ps1`（依赖同步 + 六道门：type / lint / test / build / 产物齐全 / 内核兼容）
- 标准验证路径：`pnpm test`；完整跑 `./init.ps1`
- 当前最高优先级未完成功能：无（12 条：7 条 passing、5 条 inferred，无 open）
- 当前 blocker：无
- 已发布：**v0.4.0**（2026-11-17）。Release 含 `DeepSeek-APP-Replica-0.4.0-debug.apk`（6,376,387 字节，SHA256 `CAD2EC32…80424AF`），CI run 44068960454 全绿。版本号 0.3.0 → 0.4.0（versionCode 400）
- 已发布：**v0.3.0**（2026-11-17）。Release 含 `DeepSeek-APP-Replica-0.3.0-debug.apk`（6,344,320 字节），CI run 44029554535 全绿——含「内核兼容」步的首个真实运行（日志：`error 0 / hint 0 / info 9 / 豁免 0`）
- CI：GitHub Actions 已生效，push 到 `main` 即跑，链路已含「内核兼容」一步（最近一次全绿 run 43841705481 早于本轮新增的 scan 步，下次 push 才是首个含它的 run）

## 会话记录

### Session 001

- 日期：2026-11-16
- 本轮目标：为仓库搭起 harness 骨架（工作循环 + 门禁 + 功能清单 + 本日志 + 第一层自动化测试）
- 已完成：
  - `AGENTS.md` 新建：仓库布局、命令、红线、质量约定、**会话工作循环**（开工 / 工作规则 / 完成定义 / 收尾）、提交纪律
  - `feature_list.json` 新建：三条 harness 条目
  - `claude-progress.md` 新建（本文件）
  - `ARCHITECTURE.md` 新建：把仓库里已经存在但没写下来的设计决策编号归档
  - `CHANGELOG.md` 新建：0.1.1 至今
  - `init.ps1` 新建：依赖 + 五道门（type / lint / test / build / artifacts）
  - `test/` 新建：**30 条测试**，覆盖 3 个纯函数模块 + 1 份词表一致性
    - `test/format.test.ts`（7 条）日期格式化与月键的边界
    - `test/sse.test.ts`（11 条）SSE 解码：跨片、CRLF 跨片、多行 data、注释、id 跨事件保留、无 data 不派发
    - `test/parse-event.test.ts`（9 条）流事件的畸形输入丢弃与合法透传
    - `test/i18n.test.ts`（3 条）中英 key 集合、占位符一致、无空翻译
  - `.gitignore` 补 `release/`、`screenshots/`、安卓构建中间物
  - `.github/workflows/ci.yml` 新建：push `main` / PR / 手动触发，九步（检出 → pnpm 11 → Node 24 → install --frozen-lockfile → type → lint → test → build → 产物齐全）
- 运行过的验证：
  - `pnpm type` — 通过（无输出即通过）
  - `pnpm lint` — 0 warnings / 0 errors，120 文件 100 规则
  - `pnpm test` — tests 32 / pass 32 / fail 0（含 2 条框架探针）
  - 词表实测：zh 167 key / en 167 key / 差集为空 / 占位符无不一致 / 无空值
  - 变异验证：打断 `src/utils/format.ts` 的补零逻辑 → 2 条测试变红、退出码 1 → 改回 → 32 条全绿，`git diff -- src/` 为空。证明测试拦得住真实回归
  - CI 前置核查：lockfile 含 `@rspack/binding-linux-x64-gnu` / `@oxlint/binding-linux-x64-gnu` / `@oxfmt/binding-linux-x64-gnu`（Ubuntu runner 不会缺平台二进制）；`pnpm install --frozen-lockfile --lockfile-only` 退出码 0（lockfile 与 manifest 同步）；`ci.yml` 通过 PyYAML 解析（9 步、triggers 正确、无 BOM）
- **未在此环境验证（必须记清，不算通过）**：
  - `pnpm build` — 卡在 `scripts/build.mjs:17` 的 `rmSync(dist)`，本会话运行环境禁止删目录（EPERM）。脚本逻辑本身未发现问题，用户机器上此前已成功构建过（`dist/` 现有产物完整：index.html + 60 余个 js chunk + KaTeX 字体）。
  - `pnpm exec oxfmt --check .` — 本环境禁止子进程（spawn EPERM）。因此格式化没有设为硬门。
- 已记录证据：见 `feature_list.json` 的 `harness-*`；其中 `harness-003` 含一次**变异验证**（打断补零逻辑 → 2 条变红、退出码 1 → 改回 → 32 条全绿且 `git diff -- src/` 为空），证明测试拦得住真实回归
- 更新过的文件或工件：`AGENTS.md`、`claude-progress.md`、`feature_list.json`、`ARCHITECTURE.md`、`CHANGELOG.md`、`init.ps1`、`.gitignore`、`package.json`（加 test 脚本）、`.github/workflows/ci.yml`、`test/` 下 5 个文件
- 已知风险或未解决问题：
  - **`test/_probe.test.ts` 名字带下划线是历史原因**：它最初是探测「Node 24 能否直跑 TS」的临时文件，而搭骨架的会话环境不允许删除或重命名文件（EPERM / Access denied）。已就地改写为**框架自检**——钉住「Node 主版本 >= 22」这个整条测试链路的前提，环境不满足时它给出人能读懂的原因，而不是让 30 条业务测试一起报同一个看不懂的错。想改名请在能删文件的环境里改。
  - ~~**`release/` 与 `screenshots/` 仍被 git 跟踪**~~（**已解决** 2026-11-16：commit `166fe23` 撤出索引，复核 `git ls-files release screenshots` 返回空，本地文件一个没丢）——原记录：6.5MB APK 与 6 张截图在索引里，`git ls-files` 可见。`.gitignore` 已写好并验证规则命中（`git check-ignore --no-index` 显示 `.gitignore:14/15` 命中），但**已跟踪文件不会自动退出**。本会话尝试 `git rm --cached -r release screenshots` 被环境拒绝——`.git/index` 不可写（`fatal: Unable to create index.lock: Permission denied`），不是判断问题而是权限问题。**需在本机执行这一条**，可逆（`git reset` 恢复索引，工作区文件不动）。见 `products-001`。
  - **测试覆盖面有限**：只覆盖 4 个自包含模块。`services/chat/` 下的存储、导入导出、分支逻辑都没有测试，它们是带运行时依赖的模块，要测得先把纯逻辑抽出来。
  - ~~**CI 从未真实运行过**~~（**已解决** 2026-11-16：push 触发 run 43841705481，job 27 秒，9 步全绿，含生产构建与产物齐全）——原记录：`.github/workflows/ci.yml` 已就位并通过本地解析，但本会话环境无法模拟 ubuntu-latest runner。首次 push 后才能确认九步全绿。如果红，最可能卡在 `pnpm build`（rspack 在 Linux 上的实际行为）或 `--frozen-lockfile`。
  - 项目名四处不统一：目录 `DeepSeek 复刻APP` / remote `DeepSeek-APP-Replica` / `package.json` name `chat-demo` / README 标题 `DeepSeek APP Replica`。骨架已按 remote 的口径称本项目为 DeepSeek APP Replica，但 `package.json` 未改。
- 下一步最佳动作：骨架与环境债已全部清空。按实际需求补录业务功能条目，替换 `feature_list.json` 里的占位说明。CI 已有两条上游提示待跟进（动作仍以 Node 20 为目标、`ubuntu-latest` 将于 2026-10-19 迁移到 Ubuntu 26），不急于处理。

### Session 002

- 日期：2026-11-16
- 本轮目标：修掉「OPPO A58x 打开只显示黑屏/白屏」的兼容性缺陷（`compat-001`）
- 已完成：
  - 定位根因：`.frame` 移动端规则 `height: var(--app-viewport-height, 100dvh)`；`dvh` 需 Chrome 108+，不识别时 `var()` 兜底失效 → 整条 `height` 被丢弃 → 根容器塌成 0 → 深色 body 背景露出，表现为黑屏
  - 三处 CSS 改为「先 `100vh` 后 `100dvh`」双声明（`App.module.css`、`ChatInput.module.css`、`Settings.module.css`）
  - 两处 `toSorted` / `toReversed`（需 Chrome 110）改为复制后 `sort` / `reverse`（`store.ts`、`toLocal.ts`）
  - 顺带修 `useNativeShell` 里重复 `registerPlugin('SystemBars')` 触发的 “already registered” 警告：改为从 `globalThis.Capacitor.Plugins` 按需取
  - 修 `tools/shot.mjs`：Chrome 157 上 `--headless=new` 起不来 DevTools，改 `--headless`；`--user-data-dir` 由相对路径改绝对路径
  - 结掉 `harness-002`（构建门）——此前 blocked 是搭骨架会话的环境限制，本机重跑全绿
- 运行过的验证：
  - `./init.ps1` — 全绿（type / lint / test 32 条 / build / 产物）
  - 产物检查：dist CSS 三处均为 `100vh` 在前、`100dvh` 在后
  - 布局实测：强制 100vh 兜底时 frameH=844 / contentH=844，与正常态逐像素一致（`screenshots/07-vh-fallback.png`）
  - 截图：`screenshots/06-compat-fix.png`、`08-after-fix.png`；后者确认 SystemBars 警告消失
- **未验证（必须记清，不算通过）**：
  - 真实低版本 WebView（Chromium 93 级别）上是否真的不再白屏——本机与模拟器 WebView 均为 133，复现不出 dvh 缺失
  - 若白屏另有 JS 报错路径（`.frame` 未创建），本修复不覆盖；需 logcat 才能区分
- 已记录证据：`feature_list.json` 的 `compat-001`
- 更新过的文件或工件：`src/app/App.module.css`、`src/components/chatInput/ChatInput.module.css`、`src/components/settings/Settings.module.css`、`src/services/chat/store.ts`、`src/services/chat/history/toLocal.ts`、`src/app/useNativeShell.ts`、`tools/shot.mjs`、`feature_list.json`、`claude-progress.md`
- 下一步最佳动作：让反馈白屏的那台机器装上新 APK 复验；同时把 `products-001` 结掉（本机有写权限，一条 `git rm --cached` 即可）

### Session 003

- 日期：2026-11-16
- 本轮目标：重做「导入历史对话」。用户反馈两类现象：点「上传」没有任何反应；以及「导入了没效果」
- 诊断（代码层，四处叠加）：
  - **入口**：`<input type="file" hidden>` + `inputRef.current.click()`。选择器返回空时 `if (file)` 静默 return；原生壳 `ActivityNotFoundException` 也静默 `onReceiveValue(null)`。整条链没有一处告诉用户「卡住了」
  - **错误**：6 个具体错误码（backupUnrecognized / NewerVersion / InvalidVersion / Incomplete / InvalidJson / InvalidBranches）在 UI 层被 `catch {}` 压成一句「可能是旧版 ZIP」的猜测；`errorStatus()` 本来能带出原因，导出功能用了它，导入没用
  - **语义**：导入 = 覆盖全部。这是网页 demo 的假设，被直接带到「用户有几百条真实对话」的场景
  - **解析**：任一条会话不合规、或 ZIP 里有未识别条目（重新打包带的目录/资源分叉）→ 整包失败；index 必须与导入数一一对应
- 已完成：
  - 入口改成透明覆盖 input（用户点到的就是 input 本身），`accept` 留空，格式交给 `isZipFile` 与 manifest 校验
  - 四层状态：等待选中 / 未选择文件 / 没弹出选择器 / 导入中
  - 失败显示具体原因（`errorStatus` + 文案加 `{message}` 占位符）
  - `importArchive` 宽容解析：单条会话损坏只跳过并计数；manifest 之前的杂项跳过；未知条目丢弃；index 只做交叉核对
  - `commitStaging` 增加 `merge`：同 ID 会话跳过而非覆盖，`replace` 保持原行为
  - 确认弹窗三按钮：取消 / 覆盖导入 / 合并导入，默认合并
  - 结果文案区分「全部新增 / 有跳过 / 没有新对话」，同时 toast + 移动端打开会话抽屉
  - 抽出 `history/result.ts` 纯函数与 `test/import-result.test.ts`（4 条）
- 运行过的验证：
  - `pnpm type` / `pnpm lint`（0 warning）/ `pnpm test`（36 条）/ `pnpm build` 全绿
  - headless Chrome（390×844）实测：`elementFromPoint` 在「上传」按钮中心命中 `input[aria-label="导入历史对话"]`；喂入构造的 v3 归档 → 出现确认弹窗 → 点合并 → 会话列表出现「探针测试对话」
  - APK 核对：6,531,413 字节，包内含 uploadInput / importConfirmHint / historyImportNoPicker / historyImportedWithSkipped / backupEmpty
- 未验证（必须记清，不算通过）：
  - 真机上系统文件选择器是否真的弹出（headless 环境没有系统选择器）
  - Android 上合并后的列表刷新
  - 「重复导入且全部已存在」时的提示没在探针里跑到；该分支由 `commitStaging` 的 `getKey` 判断 + `test/import-result.test.ts` 覆盖
- 环境坑（重要）：本会话 pwsh 沙箱对 `chat-demo` 目录的写权限被拒（新建文件即失败），`build` / `cap sync` / `gradlew` 与探针全程用 `danger-full-access` 执行
- 已记录证据：`feature_list.json` 的 `import-001`；截图 `screenshots/probe-04-confirm.png`、`probe-06-list.png`
- 下一步最佳动作：拿一台真机装新 APK，走一遍「上传 → 合并导入 → 看列表」，这是唯一还没被验证的环节

### Session 004

- 日期：2026-11-17
- 本轮目标：把「适配」从「出问题再修」改成「先归类、再验」——建机器口、补兜底、立证据分级规矩
- 已完成：
  - **机器口**：`tools/scan-compat.mjs`（698 行，零依赖）扫产物里裸用的新特性，有发现即非零退出；`tools/measure-layout.mjs`（671 行）8 档固定尺寸量布局并断言；`tools/layout-baseline.json` 入库
  - **门禁**：`init.ps1` 第六道门「内核兼容」；`.github/workflows/ci.yml` 同步加一步
  - **矮屏按手机处理**：11 条窄屏媒体查询追加 `, (max-height: 479px)`（逗号＝或），JS 侧 `viewport.ts:5` 同步
  - **横屏安全边距镜像**：`safeArea.ts` 的 `resolveSafeSide` 纯函数 + `.safe-area-probe` 读 `env()` + `--app-safe-side`
  - **布局突变不播过渡**：挂 `change-layout`，120ms 后自动摘，不永久关动画
  - **`structuredClone` 兜底**：`src/app/polyfills.ts`，修旧内核上渲染 Mermaid 图抛 TypeError
  - **`:has()` / `@container` 降级**：`:has()` 改外合并等价写法；`@container` 改类名（动了组件契约，`MessageFile` 新增可选 `compact`）
  - **验收规矩**：`feature_list.json` 新增 `verified` / `inferred`；`compat-001`、`import-001` 降为 `inferred`（证据未删）；`AGENTS.md` 完成定义加三条；新建 `docs/known-devices.md`
- 运行过的验证：
  - `./init.ps1` 六道门全绿，退出码 0
  - `scan-compat`：error 0 / hint 0 / info 9 / 豁免 0
  - `pnpm test` 41 条全过（新增 5 条：safe-area 3、polyfills 2）
  - scan-compat 反例：注入 `100dvh` 违规 → 退出码 1、报出 `L1:89116 offset=89115`（与期望相等）→ 还原后 sha256 与注入前字节一致 → 再跑回到 0
  - 门会红：临时造违规 → `./init.ps1` 输出 `[FAIL] exit 1` 并给三条修法 → 删掉后回到「基线全绿」
  - `measure-layout` 8 档全过；`--check` 改基线 3 个值后精确报出 3 处差异
  - 截图 6 张：`screenshots/adapt-20261117/`（390×844 / 412×915 / 915×412 / 768×1024 / 1280×800 / 1280×450）
- **未验证（必须记清，不算通过）**：
  - **Chromium 93 上一次都没跑过**——本机只有 Chrome 157，所有「旧内核能跑」的结论都是 `inferred`
  - **真机刘海未验**：`env(safe-area-inset-*)` 是 CDP 模拟出来的
  - **软键盘是否真把布局视口压到 480 以下**：未知。若会，平板横屏打字时可能中途切一次布局。已记入 `known-devices.md` 的「尚未验证的风险」
  - **带附件消息在窄容器下的实际画面**：`@container` 改类名后只做了构造等价，没发真实消息截图
  - iOS / 鸿蒙的 `orientationchange` 时序
  - `aspect-ratio` / `color-mix()` 两条扫描规则当前产物 0 命中，没跑过反例
- 已记录证据：`feature_list.json` 的 `compat-002`、`adapt-001`、`adapt-002`、`adapt-003`、`harness-005`
- 更新过的文件或工件：21 个 `src/` 文件、`tools/scan-compat.mjs`、`tools/measure-layout.mjs`、`tools/layout-baseline.json`、`init.ps1`、`ci.yml`、`AGENTS.md`、`feature_list.json`、`CHANGELOG.md`、`docs/known-devices.md`、`test/safe-area.test.ts`、`test/polyfills.test.ts`
- 已知风险或未解决问题：
  - `@container` 那条动了 React 组件契约（`MessageFile.tsx` 新增可选 `compact`、`UserMessage.tsx` 传入），因为跨 CSS 模块拿不到父级类名；若想回到容器查询，这一小段可单独回退
  - `tools/layout-baseline.json` 绑 Chrome/157.0.8103.79，大版本变化后需重新生成并在提交信息里写原因
  - 工作区仍有 3 个未提交文件（`src/services/api/types.ts`、`chat/store.ts`、`settings.ts`，模型切换功能），不属本轮，未碰也未提交
- 下一步最佳动作：拿一台 Android 12 出厂的机器装 debug 包，按 `docs/known-devices.md` 的四步走一遍，把 `compat-001`、`compat-002`、`adapt-001`、`adapt-002` 从 `inferred` 推到 `verified`

### Session 005

- 日期：2026-11-17
- 本轮目标：用户反馈「有的用户打开 APK 还是白屏」+ 给出三个具体缺陷（图片发送失败、横屏侧栏挡内容、网络无限转圈）。一句话概括：**把「跑不起来」变成「能跑」**，跑不了也要说清为什么
- 已完成（五个阶段）：
  - **构建目标降级**：`chrome >= 105` → `chrome >= 70`。**白屏的真正原因是语法不是 CSS**——老内核解析到 `??` 整包失败
  - **`.mjs` 漏转译**：loader 规则 `\.(j|t)sx?$` 不匹配 `.mjs`，mermaid 入口是 `mermaid.core.mjs`。改成 `\.(m?[jt])sx?$`
  - **9 个 API 垫片**：`swc` 只降语法不降 API。补 `globalThis`/`fromEntries`/`allSettled`/`replaceAll`/`matchAll`，加上已有的 `structuredClone`/`hasOwn`/`at`
  - **启动兜底**：`src/index.html` 内联纯 ES5 脚本（内核门槛、全局错误、8 秒看 `#root`），慢启动会延长不误判，界面晚到自动撤页
  - **自检页**：`src/check.html`，20 项分三档 + 一键复制
  - **图片格式**：白名单收窄到 8 个格式；`imageFormat.ts` 读 magic number；发送失败给中文提示
  - **横屏布局**：`isMobile` 加宽高比判据，11 处 CSS 同步；转回桌面不自动展开侧栏
  - **网络超时重试**：连接 5s / 首字节 30s / 流空闲 60s / 上传 120s；自动重试 1 次
- 运行过的验证：
  - 六道门全绿；`pnpm test` **89 条**（原 41 + image-format 32 + timeout 11 + boot-guard 5）
  - `measure-layout` **10/10**（新增 800×480、1024×600 都走 mobile-drawer）
  - `scan-compat`：error 0 / hint 0 / info 9 / 豁免 0
  - 产物语法扫描：真实 `??` **0 处**；含 `??` 的文件从 24 个降到 2 个（剩下是 prismjs 正则字面量）
  - 垫片行为验证 21/21（在 Node 里删掉原生实现后加载垫片）
  - 超时/重试真实起假服务验证：5019ms / 30020ms / 60016ms 精确触发，500→200 重试命中 2 次
  - 启动兜底 27/27 断言（真开 Chrome 跑 7 个场景）
  - 截图：`screenshots/final-390x844.png`、`final-915x412.png`、`boot-*.png`、`check-page.png`
- **未验证（必须记清，不算通过）**：
  - **Chromium 70 真机或模拟器一次都没跑过**——这是本轮最重要的未验项。所有「老内核能跑」的结论都是产物扫描 + 语义等价 + 本机 Chrome 157 实测
  - 真机刘海、真机相册导出的 HEIC、Capacitor 原生壳里 File 的扩展名保留
  - CDP 的 UA override 只换字符串不换引擎，所以「Chrome 60 真机上的样子」没有证据
  - 真实弱网抖动、后台标签页定时器节流
  - 非流式请求读完响应头后读 body 没有单独超时（已知空洞）
- 已记录证据：`feature_list.json` 的 `compat-003`、`compat-004`、`compat-005`、`adapt-004`、`net-001`
- 更新过的文件或工件：34 个文件（见 `git status`）
- 已知风险或未解决问题：
  - i18n 有一处 `Object.hasOwn` 的**函数定义**在垫片之前（位置 176432 vs 185574），只是定义不是调用，当前安全但靠执行顺序
  - `.raw` 从白名单移除，副作用是 `.raw` 数据文件也不能附加
  - `importArchive.ts:16` 有一份重复的 magic number 嗅探，建议单独提交收敛
  - `check.html` 一度把 `fromEntries`/`allSettled` 标成「功能退化」，本轮已补 `fallback` 字段（主包有垫片）
- 下一步最佳动作：**拿那台白屏手机装 `DeepSeek-APP-Replica-0.3.0-full-20261117.apk`**。能开 → 降到 70 够了，把 `compat-003`/`compat-004` 推到 `verified`；还是白 → 说明内核 < 70，兜底页会说明原因，届时考虑继续降到 60 或接受兜底页方案

### Session 006

- 日期：2026-11-18
- 本轮目标：把同一份前端发布成**网页版**（GitHub Pages），给装不了 APK 的苹果 / 鸿蒙 / 老机型用户一条入口
- 已完成：
  - **发布链路**：`ci.yml` 增加 `deploy` 作业——`needs: gates`，只在 push 到 main 时跑，取回 gates 产出的**那一份 `dist`** 直接发布，不重新构建。发布串行（`concurrency: group: pages`），两次发布不交错
  - `gates` 作业在 main 上把 `dist` 作为 artifact 交出去（PR 不传）
  - 仓库 Pages 的 Source 已由用户设为「GitHub Actions」
  - 站点：<https://khalilyamber.github.io/DeepSeek-APP-Replica/>
- 运行过的验证：
  - **子路径 404 不存在**：产物 HTML 引用的是相对路径（`static/js/...`）+ `publicPath: 'auto'`，本地把 `dist` 放到 `/DeepSeek-APP-Replica/` 前缀下起服务，index、JS、CSS、check.html 全部 200，截图渲染正常（`screenshots/pages-subpath-check.png`）
  - push 后 run #9：gates 16 步 ✅ + deploy 5 步 ✅
  - 线上复核：`https://khalilyamber.github.io/DeepSeek-APP-Replica/` 200，`static/js/main.e6cb252b.js`、`static/css/main.89073ee2.css`、`check.html` 全部 200
- **未验证（必须记清，不算通过）**：
  - **iOS Safari / 鸿蒙浏览器一次都没打开过**。用户手上 iOS 侧只有 iPad 9，Windows 上用不了 Safari 远程调试
  - 国内可达性没有测（`github.io` 时通时不通，不在我们控制内）
- 更新过的文件或工件：`.github/workflows/ci.yml`、`screenshots/pages-subpath-check.png`、本文件、`feature_list.json`
- 下一步最佳动作：等用户在真机上看过再动界面；搜索与头像按「一次一个单元」推进

### Session 007

- 日期：2026-11-18
- 本轮目标：网页版加「搜索历史对话」（用户要求只给网页版）
- 已完成：
  - `src/services/chat/search.ts`（纯函数）：`messageText` / `flattenText` / `makeSnippet` / `findInSession` / `sortHits` / `searchAllSessions`
  - `src/services/chat/db.ts` 新增 `searchSessions`：游标逐条读，不 `getAll`
  - `src/components/sider/SearchBox.tsx`：200ms 防抖 + 结果列表 + 命中高亮（`<mark>`）
  - `Sider.tsx` 接入；**用 `isNativeApp()` 运行时判断，APK 里不渲染**——一份产物两个形态
  - 词表 5 个 key；`Sider.module.css` 新增 9 个类
- 运行过的验证：
  - `pnpm test` **97 条**（原 89 + `search.test.ts` 8 条）；`pnpm lint` 127 文件 0 警告；`pnpm build` 通过
  - 真浏览器（headless Chrome 157）：灌两条构造对话后敲字。「头像」1 条命中并高亮、「IndexedDB」1 条、「内部思考」0 条（思考过程不进搜索）、「物理化学」1 条、「不存在的词」0 条
  - 手机端 390×844：点「打开边栏」后抽屉里搜索框可见，输入「头像」1 条命中。截图 `screenshots/pages-search.png`
- **未验证（必须记清，不算通过）**：
  - 真机（iOS Safari / 鸿蒙 / 老内核）未验
  - 数据量大时的搜索耗时未测（几百条会话量级未实测）
- 更新过的文件或工件：`src/services/chat/search.ts`、`src/services/chat/db.ts`、`src/components/sider/SearchBox.tsx`、`Sider.tsx`、`Sider.module.css`（含 `.d.ts`）、`i18n/zh.ts`、`i18n/en.ts`、`test/search.test.ts`、`feature_list.json`（`web-001`）、本文件
- 下一步最佳动作：头像（用户要求：用户可上传自己的照片设置头像）

### Session 008

- 日期：2026-11-18
- 本轮目标：网页版加头像（用户可上传自己的照片），顺手修掉发现的一处 v0.4.0 缺陷
- 已完成：
  - `src/services/avatar.ts`：头像存 localStorage 两条 key；`fileToAvatar` 居中裁正方形 → 160px → JPEG 0.85（用 Image + canvas，不用 `createImageBitmap`，旧 Safari 没有）
  - `MessageAvatar.tsx`：绝对定位左/右，消息容器加 `.withAvatar` 内边距，**不改原有气泡流式布局**
  - 设置 → 通用设置新增头像区（两个上传入口 + 恢复默认）；只在网页版渲染
  - **修 bug**：`src/index.html` 兜底脚本新增 `renderedHeight()`——原先用「#root 高度 < 120px」判定没渲染，而 `.frame` 是 `position:absolute; inset:0`，`#root` 自身高度恒为 0，于是**界面正常也会在 8 秒后弹出「打不开」**。改为 #root 高度为 0 时量第一个元素子节点
- 运行过的验证：
  - `./init.ps1` 六道门全绿（type / lint / 97 tests / build / 产物 / scan-compat error 0）
  - 真浏览器（headless Chrome 157，1280×800）：默认头像 2 个（我 / AI）；设置里有头像区与 2 个上传入口；`DOM.setFileInputFiles` 喂一张脚本手搓的 200×200 PNG → localStorage 存下 2495 字符 `data:image/jpeg`、预览立刻变照片；回会话 2 个头像、1 个是图片。截图 `screenshots/avatar-0*.png`
  - 兜底页误报复现与复验：`_probe/boot-check.mjs` 等 3/6 秒无兜底页、10/14 秒**修复前出现**且 `rootHeight:0`；修复后四次等待全部无兜底页
- **未验证（必须记清，不算通过）**：
  - 真机上传未验（手机相册选择器、iOS HEIC 照片、iPad Safari 的 canvas 编码差异）
  - **`tools/verify-boot-guard.mjs` 现在 25/27**：两条 `check-stubbed` 断言失败（去掉 `Object.fromEntries` / `hasOwn`·`structuredClone` 后的分级）。与「#root 高度」这条修复无关，且 `src/check.html` 最后修改于 v0.4.0 的 `75a1e32`，属**先前就存在的失败**，待单独一轮修
- 更新过的文件或工件：`src/services/avatar.ts`、`src/components/messages/MessageAvatar.tsx`（含 css + d.ts）、`UserMessage.tsx`/`.module.css`（含 d.ts）、`AssistantMessage.tsx`/`.module.css`（含 d.ts）、`src/components/settings/SettingsDialog.tsx`、`Settings.module.css`（含 d.ts）、`src/i18n/zh.ts`、`src/i18n/en.ts`、`src/index.html`、`feature_list.json`（`web-002`、`web-003`）、本文件
- 下一步最佳动作：修 `check.html` 的两条 stub 断言；真机上验一次头像上传



