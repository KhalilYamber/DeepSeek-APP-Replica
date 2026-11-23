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
- 当前功能账：57 条（0.4.18 新增 4 条：字体四档、头像裁剪、设置页三栏为 passing；背景图因真机未验标 inferred）
- 当前 blocker：无
- 应用显示名：**DS Echo**（0.4.3 起；仓库名与 `appId` 不变，见 ARCHITECTURE 决策 23）
- 最近发布：**v0.4.18**（2026-11-22，Latest）——字号四档、头像裁剪、对话背景、设置页分栏、草稿跨刷新保留。Release 含 `DS-Echo-0.4.18-20261121-debug.apk`（6,423,522 字节 / `versionCode 418`），CI run 44910342154 全绿（含 Pages 发布）。**这一版没动数据库**，仍是库 13，可退回 0.4.17
- 上一个发布：**v0.4.17**（2026-11-21）——分组吸顶、状态栏归位、界面改名。数据库从 12 升到 13，**装回 0.4.16 及更早会打不开**
- 只在本地构建、从未发过 Release 的版本：0.4.2、0.4.3、0.4.5、0.4.6、0.4.7、0.4.11（`release/` 里有包，无 tag、无 Release）。完整发布历史见 GitHub Releases
- 已发布：**v0.4.1**（2026-11-18）。Release 含 `DeepSeek-APP-Replica-0.4.1-debug.apk`（6,379,811 字节，SHA256 `A6E8CA48…15AB3CF4`），CI run 44334050643 全绿。修掉 0.4.0 兜底页在正常设备上误报（量 `#root` 高度判断渲染，而 `.frame` 是 absolute 定位、`#root` 高度恒 0）；带上滑动性能与深色主题修复；网页版历史搜索与头像一并发布。**注意：这一版在「不认 dvh」的内核上仍会整屏空白，已在 0.4.2 修掉**
- 已发布：**v0.4.0**（2026-11-17）。Release 含 `DeepSeek-APP-Replica-0.4.0-debug.apk`（6,376,387 字节，SHA256 `CAD2EC32…80424AF`），CI run 44068960454 全绿。版本号 0.3.0 → 0.4.0（versionCode 400）。**注意：这一版的兜底页有误报缺陷，已在 0.4.1 修掉**
- 已发布：**v0.3.0**（2026-11-17）。Release 含 `DeepSeek-APP-Replica-0.3.0-debug.apk`（6,344,320 字节），CI run 44029554535 全绿——含「内核兼容」步的首个真实运行（日志：`error 0 / hint 0 / info 9 / 豁免 0`）
- CI：push 到 `main` 即跑六道门（与本地 `./init.ps1` 同一条链路），通过后把同一份 `dist` 发布到 Pages；本机验证仍以 `./init.ps1` 为准

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

### Session 009

- 日期：2026-11-18
- 本轮目标：用户反馈「手机滑动有点卡」；找潜在 bug 并 debug（允许 0 改动，不许硬调）
- 诊断过程（先量再改）：
  1. 合成滚动测速（`_probe/perf-probe.mjs`，60 / 150 条消息，CPU 降速 4 倍与 10 倍）：**主线程一直是 60fps**，p90 约 20ms，几乎无掉帧 → 说明卡顿不在 JS 逻辑
  2. 改从触摸链路查：`viewport.ts` 的 `preventPageScroll` 挂在 `document` 的 `touchmove` 上且 **`passive: false`**，每次事件都从触点向上逐祖先 `getComputedStyle` + 读 `scrollHeight/clientHeight`（强制样式 + 强制布局）；浏览器必须等它算完才敢滚
  3. 量化：一次祖先扫描 0.219ms（CPU/10，1501 节点），换成 `closest()` 同场景 0.02ms
- 已完成：
  - **去掉阻塞滚动的监听**：支持 `overscroll-behavior` 的内核直接不挂（global.css 已把 html/body/#root 的 overflow 与 overscroll 设死）；老内核保留拦截，但把祖先扫描挪到 `touchstart`（passive），`touchmove` 只读布尔值
  - `MessageList` 的 scroll 回调不再每帧读 `scrollHeight/clientHeight`（同样是强制布局），改由已有的 `ResizeObserver` 量一次写进 `metricsRef`
  - **修红**：`tools/verify-boot-guard.mjs` 两条 `check-stubbed` 断言口径过期（v0.4.0 给 `Object.fromEntries` 补了垫片后，实际是 3 项兜底 / 0 项有毛病）。断言已更新，套件回到 **27/27**
- 运行过的验证：
  - `./init.ps1` 六道门全绿（type / lint / 97 tests / build / 产物 / scan-compat error 0）
  - `_probe/listener-check.mjs`（390×844）：`document` 上**不再有** `touchmove(passive=false)`
  - `_probe/touch-cost.mjs`：祖先扫描 0.219ms/次 vs `closest()` 0.02ms/次
  - `verify-boot-guard`：27/27
- **未验证（必须记清，不算通过）**：
  - **改善只在真机体现，本机测不到**：合成滚动不走触摸事件链，所以「等不等主线程」在这套测法里不存在。改了之后的帧耗时与改前一致（avg 16.83 → 17.25，噪声内），**不能拿它当改善证据**
  - 老内核（无 `overscroll-behavior`）上的新拦截逻辑只做了代码推理，没在真机跑过
- 刻意没做：`content-visibility` / 列表虚拟化（能省绘制，但可能让滚动位置跳动，得先有真机数据）；Markdown 渲染策略（没有证据指向它）
- 更新过的文件或工件：`src/app/viewport.ts`、`src/components/messages/MessageList.tsx`、`tools/verify-boot-guard.mjs`、`feature_list.json`（`web-004`、`web-005`）、本文件
- 下一步最佳动作：请用户在真机上滑一遍确认手感；若仍卡，下一步再量绘制（`content-visibility` 需要先做 A/B 再决定）





### Session 010

- 日期：2026-11-18
- 本轮目标：用户反馈在**夸克浏览器**里主题被浏览器主题压制
- 定位：
  - `theme.ts` 原来只写 `colorScheme = 'light' | 'dark'`。按标准，`light` 仍可能被 UA 的强制深色接管；明确「不要替我反色」要写 `only light`
  - 另外这个声明由 JS 在运行时写入，**首屏之前文档没有任何 color-scheme 声明**——强制深色最容易在这一段生效
- 已完成：
  - `src/index.html` head 加 `<meta name="color-scheme" content="light">`，首屏即声明
  - `theme.ts`：浅色分支改写为 `only light`，深色仍为 `dark`
- 运行过的验证（`_probe/theme-check.mjs`，headless Chrome 157 / 390×844）：
  - 选浅色 → html 计算值 `light only`，body 背景 rgb(255,255,255)
  - 选深色 → `dark`，rgb(21,21,23)
  - **模拟系统深色 + 应用浅色 → 仍是浅色**；系统浅色 + 应用深色 → 仍是深色
  - 六道门全绿（97 条测试）
- **未验证（必须记清，不算通过）**：
  - **夸克本体没有验过**（这台机器装不了夸克；也没法在桌面复现它的强制深色）。如果夸克的「网页深色」是自己渲染后统一反色的滤镜，页面侧无法阻止，只能在浏览器里关掉
  - 夸克是否把 `prefers-color-scheme` 报成固定值，未测
- 更新过的文件或工件：`src/index.html`、`src/app/theme.ts`、`feature_list.json`（`theme-001`）、本文件
- 下一步最佳动作：用户在夸克里按「选浅色 / 选深色 / 跟随系统」三组各看一次；若仍被反色，说明是浏览器滤镜，去关它的网页深色开关

### Session 011

- 日期：2026-11-19
- 本轮目标：按用户要求做「防御性兜底」四块（自愈 / 第二通道 / 降级 / 取证）。起因是 iPhone 用户反馈「UI 卡 + 消息发不出去」
- 已完成：
  - **取证**：`src/services/diagnostics.ts`（环形日志 20 条 + `collectDiagnostics()` 环境摘要）；`main.tsx` 挂全局 error / unhandledrejection；设置 → 通用设置新增「诊断信息」，弹窗可复制（`navigator.clipboard` 不可用时退回 `execCommand`）
  - **第二通道 / 有回应**：`ChatInput.send()` 两处静默 return 改成 toast + 诊断日志；回车发送上游本来就有，未另加按钮
  - **自愈**：`streamMessage` 除 `setTimeout` 外另记 `lastChunkAt`，回到前台时按时间戳判断超时并 abort——针对 iOS 冻结后台定时器
  - **降级**：删掉整页滚动的 JS 拦截（`usePreventPageScroll` 及三个辅助函数），老内核允许橡皮筋回弹，不再每帧等 JS
- 运行过的验证：
  - 六道门全绿（type / lint / 97 tests / build / 产物 / scan-compat error 0）
  - `_probe/defense-check.mjs`（headless Chrome 157，390×844）：诊断面板打开成功、11 行、含 UA / 系统 iOS / 存储；空输入点发送弹出「还有内容没准备好…」；本机日志记下 `{kind:'send'}` 一条
- **未验证（必须记清，不算通过）**：
  - **iPhone 真机一次没跑过**：自愈那条（后台冻结定时器）与「老内核不再被拦截」都只有代码路径与静态门，没有真机
  - 真机剪贴板被拒时的退回路径未跑
  - 刻意没做：流式失败自动降级为非流式重发（要改 API 层、且没有真 Key 无法验证）；备用发送按钮（回车已可发）
- 更新过的文件或工件：`src/services/diagnostics.ts`、`src/main.tsx`、`src/services/api/client.ts`、`src/components/chatInput/ChatInput.tsx`、`src/app/viewport.ts`、`src/app/App.tsx`、`src/components/settings/SettingsDialog.tsx`、`Settings.module.css`（含 d.ts）、`i18n/zh.ts`、`i18n/en.ts`、`feature_list.json`（`defense-001`~`004`）、本文件
- 下一步最佳动作：请那位 iPhone 用户点「设置 → 诊断信息 → 复制」，把文本发回来；那份文本能直接定位「卡」是内核问题还是布局问题

### Session 012

- 日期：2026-11-19
- 本轮目标：用户问「你的计划考虑过为旧手机适配吗」。查了一遍**特性地板**，发现对外承诺的「最低内核 Chrome 70」只对语法成立，真实地板更高——其中一条会让整包不启动。按用户选定的 C+A 做：先修掉硬崩，再把承诺改成 84
- 定位（读产物逐项核，不是按 API 常见程度猜）：
  - `src/services/location.ts` 在**模块顶层** `new Intl.DisplayNames(...)`。该接口要 Chrome 81+，`location.ts` 又在启动主链上（`App` → `services/settings` → `services/location`），所以 Chrome 70–80 上 `new undefined()` 抛 TypeError → 主包求值中断 → 白屏，且报错早于 React，兜底层接不住
  - 其余特性地板：flex `gap` 84（44 处，只影响观感）、`:focus-visible` 86（9 处，焦点框）、`min()/max()/clamp()` 79（5 处）
  - 顺带确认两件「已经兜住」的事：`inset` 简写被构建期拆成 `top/right/bottom/left`（产物里 `inset:` 0 处）；`crypto.randomUUID` 有 `typeof` 兜底
- 已完成：
  - **C｜`Intl.DisplayNames` 惰性化**：新增 `src/services/regionName.ts`（`createRegionFormatter`：缺接口或构造失败返回 null，永不抛）；`location.ts` 改成 `formatterFor(locale)` 惰性 + 缓存，缺接口时地区名退回地区代码；删掉顶层的两行 `new`
  - **A｜承诺改 84**：`index.html` / `check.html` 的 `MIN_CHROMIUM` 70 → 84；兜底页「内核太旧」的成因改写为两种（低于 70 = 解析失败，70–83 = 缺接口）；README 与 `docs/使用说明.md` 的系统要求同步；`docs/known-devices.md` 加一行（70–80 上顶层 `new` 的坑）与一条经验；`ARCHITECTURE.md` 新增决策 21（构建目标 70 ≠ 支持承诺 84），决策 17 加交叉引用
  - `check.html` 新增 `Intl.DisplayNames` 检测项（注明已兜底）
  - 新增 `test/region-name.test.ts` 4 条：缺接口返回 null、构造抛错返回 null、正常环境可用、`location.ts` 源码不许再出现 `new Intl.DisplayNames`（防回流）
- 运行过的验证：
  - `./init.ps1` 六道门全绿：type / lint（132 文件 0 警告）/ **101 条测试** / build / 产物齐全 / scan-compat（error 0 · hint 1 · info 9）
  - 产物核对：`dist/index.html` 有 `d<84`、「最低要求 84」、两种成因文案；`dist/check.html` 的 `MIN_CHROMIUM = 84`；`main.js` 里 `Intl.DisplayNames` **只剩一处**，形态是 `typeof` 检查 + `try/catch` 的惰性闭包
  - `node tools/verify-boot-guard.mjs`：**27/27 通过**（真实 Chrome 157，CDP 把 UA 改成 Chrome/60），含「写出了最低要求 Chrome 84」「要求的最低内核 Chrome 84」
  - **复审（同一轮内）**：发现并修掉一条本轮自己引入的风险——「1.5 秒就判内核太旧」原来只对 <70 成立（那批永远渲染不出来），承诺改 84 后 70–83 的「慢但能跑」也进了这条分支，会糊一页误报。现改为提前判定只挂 `HARD_MIN_CHROMIUM = 70`，70–83 交给 8 秒判定并按 `MIN_CHROMIUM` 归因；加了一条单测钉住「硬地板与承诺门槛分离」（测试 102 条），复跑六道门与 27/27 仍全绿
- **未验证（必须记清，不算通过）**：
  - **Chrome 70–80 真机一次没跑过**：结论依据是源码形态 + 单测模拟缺失/抛错 + 接口最低版本
  - **70–83 设备上 gap 全塌后的观感**没看过——没有真机也没有截图
  - 本轮**没有动** OPPO A58 / A58x 的整屏空白：那是另一条路径（视口变量或绘制层），属于上一轮方案里的 L1–L3
- 环境坑：
  - pwsh 沙箱对 `chat-demo` 目录**无写权限**（`mkdir` 在 dist 里就 EPERM），`pnpm build` 与 `verify-boot-guard` 全程用 `danger-full-access` 执行
  - `pnpm exec oxfmt` 报 `spawn EPERM`，格式化跑不了；本次改动按既有风格手写对齐
- 更新过的文件或工件：`src/services/regionName.ts`（新）、`src/services/location.ts`、`src/index.html`、`src/check.html`、`test/region-name.test.ts`（新）、`test/boot-guard.test.ts`、`tools/verify-boot-guard.mjs`、`README.md`、`docs/使用说明.md`、`docs/known-devices.md`、`ARCHITECTURE.md`、`CHANGELOG.md`、`feature_list.json`（`compat-006`、`compat-007`）、本文件
- 下一步最佳动作：回到用户眼前那两台机器——视口变量钳制 + 看门狗 + 双层错误边界（上一轮分析的 L1–L3）。`gap` 的 margin 兜底按用户选择先不做

### Session 013

- 日期：2026-11-19
- 本轮目标：做上一轮定的三块防御——L1 视口钳制、L2 错误边界、L3 几何看门狗
- 已完成：
  - **L1 视口钳制**：新增 `src/app/viewportClamp.ts`（纯函数，返回 keep / css / pin 三态）；`viewport.ts` 的 `useMobileViewport` 重写为「事件 + 每秒复核 + 只写变化值」，不再按焦点判断
  - **L2 错误边界**：新增 `src/components/base/ErrorBoundary.tsx`（class 组件，`componentDidCatch` → 诊断日志，retry 换 key 重挂子树），挂三层：`main.tsx` 整树、`App.tsx` 会话区、`MessageList.tsx` 每条消息（compact）；补 4 个词条
  - **L3 几何看门狗**：`src/index.html` 内联 ES5（跑在 React 之前）——每秒量根容器矩形，先自愈（撤视口变量 + 强制回流），连续 3 次修不好才弹修复条；自愈记录写进 `chat-demo:diagnostics`
  - 验收脚本加 `watchdog` 场景 + 「normal 不许误报修复条」断言（27 → 34 条）
- 运行过的验证：
  - 六道门全绿：type / lint（135 文件 0 警告）/ **114 条测试** / build / 产物 / scan-compat（error 0 · hint 1 · info 9）
  - 单测新增：`viewport-clamp` 8 条、`error-boundary` 3 条、`boot-guard` +1 条
  - `node tools/verify-boot-guard.mjs`：**34/34**（本机 Chrome 157 / 390×844）。故障注入：注入 `height:0` → 7.0 秒出现修复条、文案「界面显示异常（高度 0）」、诊断日志 3 条 boot-guard、撤掉注入后 0.8 秒修复条自己消失；正常态 11 秒无修复条
  - 截图 `screenshots/watchdog-repair.png`：设置弹窗正常、背后整块空白、底部是修复条——与用户反馈的症状形态一致
- **写这版时被测试抓到的一个真缺陷**：看门狗最初的「武装」条件是「看到过一次正常高度」，于是**从第一秒就塌着**的界面永远不会被武装，正好是 A58x 那种形态。改成「根节点有内容就武装」+ 2 秒宽限期。
- **复审（同一轮内）**：宽度判据原来写成 `width > 0 && width < 120`，等于**宽度塌成 0 时永远不报**——而「宽度没了」本来就在要抓的四种形态里。判据漏了自己的一条。改成不排除 0（启动误报风险已由「武装 + 2 秒宽限期」挡掉），并把 width:0 注入加进验收场景，复跑 35/35。
- **未验证（必须记清，不算通过）**：
  - 三块**都没有真机**：键盘弹出/收起、错误边界接不接得住、看门狗在 OPPO 上的行为，全部是代码 + 本机 Chrome 证据
  - 错误边界只做了结构断言，**没造一条必然抛错的组件去点**
  - GPU 光栅化失败那一类整块空白，看门狗检测不到（几何读数正常）
  - 视口钳制改了触发语义：不再看焦点，只看视觉视口高度——设置弹窗里打字也会让背后那层跟着缩，收键盘恢复
- 更新过的文件或工件：`src/app/viewportClamp.ts`（新）、`src/app/viewport.ts`、`src/components/base/ErrorBoundary.tsx`（新）、`ErrorBoundary.module.css`（含 d.ts）、`src/main.tsx`、`src/app/App.tsx`、`src/components/messages/MessageList.tsx`、`src/i18n/zh.ts`、`src/i18n/en.ts`、`src/index.html`、`test/viewport-clamp.test.ts`（新）、`test/error-boundary.test.ts`（新）、`test/boot-guard.test.ts`、`tools/verify-boot-guard.mjs`、`CHANGELOG.md`、`feature_list.json`（`defense-005`~`007`）、本文件
- 下一步最佳动作：打一个包装到 A58x 上看两件事——① 是否还整屏空白；② 若还会，底部有没有出现修复条（有 → 几何问题且自愈失效；没有 → 更可能是绘制层）。这一步能把本轮的猜测收敛成事实

### Session 014

- 日期：2026-11-19
- 本轮目标：用户装了防御版 APK，A58 仍然整屏空白——**但底部出现了修复条，写的是「高度 0」**。据此定位真根因并修掉
- 定位（先做实验，不猜）：
  - 看门狗报「高度 0」→ 根容器几何确实是 0，不是绘制层
  - 写了一个 headless 复现件 `_probe/var-fallback.html`：`height:300px; height:var(--missing,100qq)` 实测 **0**；兜底换成 `250px` 时是 250；只有 `height:300px` 时是 300
  - 结论：**`var()` 的兜底里带本内核不认识的单位时，整条声明在「计算期」失效退回 `auto`，前面那条 `100vh` 不会接管**（只有解析期就整条丢弃的值才会退回上一条声明）
  - `.frame` 正好是 `height: var(…,100vh); height: var(…,100dvh);` → 旧内核上第二条胜出并失效 → 根容器塌成 0
  - 这也解释了 0.3.0 那次「双声明兜底」为什么没治好：前提是错的；而验证环境 Chrome 157 支持 dvh，永远走不到这条路径
- 已完成：
  - `App.module.css` / `ChatInput.module.css`：去掉 `var()` 兜底里的 `100dvh`，只留 `100vh`（`Settings.module.css` 那条是纯 `calc(100vh/100dvh)`，解析期就被丢弃，本来就对，未动）
  - `viewport.ts`：高度改由 JS **每秒写内联 `height`（像素）**——键盘弹出用视觉视口、平时用布局视口；内联优先级最高，写坏了 1 秒内自动覆盖
  - `index.html`：`healFrame()` 额外撤掉内联 `height` / `width`
  - 验收新增 `poison` 场景：注入 `var(--nope,100qq)` → 塌成 0 → 断言 1 秒内自动写回、且不弹修复条
  - 看门狗场景改用 `display:none` 注入（`height` 注入现在会被 L1 一秒覆盖，测不到看门狗）；宽度改用 `max-width`（`width` 注入会被自愈撤掉）
- 运行过的验证：
  - 六道门全绿（114 条测试）
  - `node tools/verify-boot-guard.mjs`：**39/39**（8 个场景）；poison 场景：塌成 0 → **1057ms** 自动恢复、无修复条
  - APK 重新打包并核对：包内 CSS 的 `.frame` 已是 `var(…,100vh)`，无 dvh
- **未验证（必须记清）**：
  - 修复本身**尚未在 A58 真机复验**（新包已放在桌面目录）
  - iOS Safari 上高度改由 `innerHeight` 驱动，与 dvh 的细微差别未验
- 更新过的文件或工件：`src/app/App.module.css`、`src/components/chatInput/ChatInput.module.css`、`src/app/viewport.ts`、`src/index.html`、`tools/verify-boot-guard.mjs`、`docs/known-devices.md`、`ARCHITECTURE.md`（决策 22 + 决策 17 补充）、`CHANGELOG.md`、`feature_list.json`（`compat-008`；`compat-001` 加更正）、`_probe/var-fallback.html`、本文件
- 下一步最佳动作：那台机器装新包（`D:\快速访问_from用户\Desktop\DeepSeek复刻-防御版-20261119\`），看界面是否出来——出来了这条线才算闭环
- 交付包改为 **0.4.2（versionCode 402）**：最初那一版与已发布的 0.4.1 同名同版本号，用户分不出装的是哪一个（实测连体积都只差 29 字节）。改成 0.4.2 之后，文件名、系统安装提示、诊断信息里的「应用版本」三处都能区分
- **真机复验（2026-11-19 11:40）**：用户在那台 OPPO A58 上装 0.4.2，界面正常显示——白屏这条线闭环。`compat-008` 与 `defense-007` 由 inferred 升为 **verified**（后者只覆盖「检测 + 提示」两段：真机截图里修复条写出「高度 0」）。**A58x 尚未复验**，但它与 A58 同代，大概率同因

### Session 015

- 日期：2026-11-19
- 本轮目标：按需求在 **APK** 里打开「搜索历史对话」（2026-11-18 是照「只给网页版」用 `isNativeApp()` 挡住整块的）
- 已完成：
  - `Sider.tsx`：删掉 `webSearch = !isNativeApp()`，搜索框与查询无条件启用；`SearchBox.tsx` 的注释同步
  - 版本 0.4.2 → **0.4.3**（versionCode 403），便于和已装包区分
  - 新增 `_probe/sider-search.mjs`：headless Chrome 390×844，关掉首启的设置弹窗 → 点 ≡ 打开抽屉 → 输入「物理化学」→ 断言查询走完
  - 新增 `test/sider-search.test.ts`：钉住「Sider 不再 import isNativeApp / 不再有 webSearch 开关」
- 运行过的验证：
  - 六道门全绿（**115 条测试**）
  - `_probe/sider-search.mjs`：**4/4**——挂载 243ms、抽屉出现输入框 9ms、输入后显示「没有找到匹配的对话」；截图 `screenshots/sider-search-apk.png`（抽屉里搜索框、清空按钮、提示都对）
  - 写这条测试时自己踩了一下：断言里查 `isNativeApp` 把注释里的历史说明也算了进去，收窄成「查 import 与 webSearch 开关」
- **未验证（必须记清）**：
  - **真机没验**：尤其小屏 + 键盘弹出时抽屉里搜索框的位置，以及点结果后抽屉是否顺畅收起（代码里 `closeMobileSider()` 已有，但没在真机上点过）
  - iOS Safari 未验
- 更新过的文件或工件：`src/components/sider/Sider.tsx`、`src/components/sider/SearchBox.tsx`、`test/sider-search.test.ts`（新）、`_probe/sider-search.mjs`（新）、`package.json`（0.4.3）、`CHANGELOG.md`、`feature_list.json`（`web-001` 改为「网页版 + APK」）、本文件
- 下一步最佳动作：把 0.4.3 装到 A58 上，走一遍「打开抽屉 → 搜一个以前聊过的词 → 点结果」，确认抽屉会收起、会话能切过去

### Session 016

- 日期：2026-11-19
- 本轮目标：应用改名——从 0.4.3 起不再叫「DeepSeek」「API 使用 demo」，正式叫 **DS Echo**
- 已完成：
  - 三处同步：`android/app/src/main/res/values/strings.xml`（`app_name` / `title_activity_main`）、`i18n` 的 `appName`（中英）、`src/index.html` 的 `<title>`
  - `capacitor.config.ts` 的 `appName` 同步改，供将来重建工程用
  - `strings.xml` 是 `cap sync` **不会重写**的文件（只在 `cap add` 时生成一次），属决策 8 的手改例外 → 登记 `ARCHITECTURE.md` 决策 23
  - README 顶部加一行：应用显示名 DS Echo，仓库名与 `appId` 不变
  - APK 文件名与桌面交付名改为 `DS-Echo-0.4.3-20261119-debug.apk`
- 运行过的验证：
  - `aapt2 dump badging` → `application-label: 'DS Echo'`，versionCode 403 / versionName 0.4.3
  - APK 内 `assets/public/index.html` 的 `<title>` 也是 DS Echo
  - 六道门全绿（115 条测试）；CI run 44456899754 success
- 复审（同一轮内）发现并修掉：`docs/使用说明.md` 被改名弄出四处事实错误（标题、更新日期、APK 文件名、「桌面出现 DeepSeek 图标」），并把商标那段改写成现状（名字已避开商标、图标仍是默认素材）
- **未做**：
  - 桌面图标仍是 Capacitor 默认素材，用户看到的是「DS Echo + 默认图标」
  - 导出文件名仍是 `deepseek_data-*.zip`（沿用官方导出格式命名，导入不看文件名）
  - 模型名、`api.deepseek.com`、`SYSTEM_PROMPT` 里那句「该助手为 DeepSeek」都没动——那是被调用模型的身份
- 更新过的文件或工件：`android/app/src/main/res/values/strings.xml`、`capacitor.config.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`、`src/index.html`、`README.md`、`docs/使用说明.md`、`ARCHITECTURE.md`、`CHANGELOG.md`、`feature_list.json`（`brand-001`）、本文件
- 下一步最佳动作：装 0.4.3 到 A58，确认桌面名变成 DS Echo、搜索能用；**A58x 仍未复验**

### Session 017

- 日期：2026-11-19
- 本轮目标：按需求把头像搬进 APK，版本 0.4.3 → **0.4.4**
- 关键判断：头像被**三处** `isNativeApp()` 挡着——设置里的头像区、`UserMessage`、`AssistantMessage`。只打开设置会造成「设了不显示」，所以三处一并去掉
- 已完成：
  - `SettingsDialog.tsx`：去掉 `isNativeApp() ? null : <AvatarSetting />`
  - `UserMessage.tsx` / `AssistantMessage.tsx`：`showAvatar` 常量与 `isNativeApp` 导入一并删除，头像和 `.withAvatar` 内边距无条件生效
  - 新增 `_probe/avatar-apk.mjs`：手机视口下切「通用设置」→ 断言头像两行与两个上传入口 → CDP 真塞一张 PNG → 断言存成 JPEG dataURL 并出现「恢复默认」
- 运行过的验证：
  - 六道门全绿（115 条测试）
  - `_probe/avatar-apk.mjs` **6/6**；截图 `screenshots/avatar-apk.png`（手机宽度下排版正常，上传后预览立刻变照片）
  - APK 0.4.4（versionCode 404）重新打包
  - 写探针时踩了一下：首次启动的设置弹窗默认停在「数据管理」，头像在「通用设置」，得先切页签——不是产品问题
- **未验证（必须记清）**：
  - **真机相册选择器**：WebView 里 `<input type="file">` 要经 Capacitor 的 `onShowFileChooser`，这条路径只在桌面 Chrome 上验过
  - **HEIC 照片**：安卓相机/相册导出的 HEIC 能否被 WebView 的 Image 解码，未知；失败会走 toast「这张图片处理失败」
  - iOS Safari 的 canvas 编码差异未验
- 更新过的文件或工件：`src/components/settings/SettingsDialog.tsx`、`src/components/messages/UserMessage.tsx`、`src/components/messages/AssistantMessage.tsx`、`_probe/avatar-apk.mjs`（新）、`package.json`（0.4.4）、`CHANGELOG.md`、`feature_list.json`（`web-002` 改为「网页版 + APK」）、本文件
- 下一步最佳动作：装 0.4.4，走一遍「设置 → 通用设置 → 上传照片 → 回会话看头像」；顺带把 A58x 一起验了

### Session 018

- 日期：2026-11-19
- 本轮目标：仿官方 App——思考过程流式时收进小窗口，回答完自动收起；版本 0.4.4 → **0.4.5**
- 开工前的分析（四轮，结论写进了 feature_list 的 `think-001`）：
  - 官方截图确认：**限高 + 内部滚动**（不是文本截断）、工具行**混在窗口里一起滚**、上下缘**渐隐**
  - 我们已有的骨架：左侧竖线、小圆点、chevron、shimmer、14px/24px 的思考字号 —— 缺的只是"窗口"这一层
  - 四个边界：无标题的工具区不能被收、空块不能露白框、续写要反向展开、内层滚动不能拽人
  - `hasResponse` 会在流式中来回翻（正文被顶进 steps 就变 null），所以判据只能取收尾那一刻
- 已完成：
  - 新增 `src/components/messages/thinkingPanel.ts`（`shouldCollapseThinking` / `shouldExpandThinking`），8 条单测
  - `ReplyArea.tsx`：`open` 初值改成 `streaming`（历史默认收起）、`touched` 用 ref、两个边沿 effect；小窗口（96px、贴底跟随、rAF 合帧）；上下渐隐用伪元素（`pointer-events: none`）；标题改 `<button>` + `aria-expanded`
  - `ReplyArea.module.css`：`.windowBox` / `.window` / `.fade*`，`.title` 补 button 复位样式
- 运行过的验证：
  - 六道门全绿（**123 条测试**）
  - 新探针 `_probe/thinking-collapse.mjs`（390×844）：已完成消息默认收起、标题显示「已思考（用时 1 秒）」、点标题展开 —— **5/5**；截图 `thinking-collapsed.png` / `thinking-expanded.png`
- **未验证（必须记清）**：
  - **流式中的小窗口验不了**：`streaming` 来自 store 的 AbortController 表，塞静态消息造不出流式态；只能真机跑一次真实的深度思考
  - 96px 的观感、渐隐是否自然、嵌套滚动与消息列表是否打架 —— 都要真机
- 已知取舍：在小窗口里往上滚**不会**阻止收尾时的自动收起（只有点标题才算用户干预）
- 更新过的文件或工件：`src/components/messages/thinkingPanel.ts`（新）、`ReplyArea.tsx`、`ReplyArea.module.css`、`test/thinking-panel.test.ts`（新）、`_probe/thinking-collapse.mjs`（新）、`package.json`（0.4.5）、`CHANGELOG.md`、`feature_list.json`（`think-001`）、本文件
- 下一步最佳动作：装 0.4.5，开深度思考问一个需要想一会儿的问题，看四件事——窗口高度、贴底跟随、渐隐、收尾自动收起；再把历史会话打开看是否默认收起

### Session 019

- 日期：2026-11-19
- 本轮目标：给 0.4.5 的思考折叠加一个设置项「思考结束后」（收起思考 / 展开思考），并按消息 id 记住用户的手动选择；版本 → **0.4.6**
- 对齐时定下的三条：
  - 手动优先：手动收起过的消息，续写时也不自动展开
  - 改设置不干扰手动记录
  - 旧对话升级后默认收起（放弃了"升级时间点标记"那套，复杂且收益有限）
- 已完成：
  - `settings.ts`：加 `thinkingEnd`（键 `chat-demo:thinking-end`，非法值回落 collapse）+ `setThinkingEnd`
  - 新增 `src/services/thinkingOpen.ts`：按消息 id 存展开状态（键 `chat-demo:thinking-open`），只收布尔值，不设上限、不清理、不碰已有键
  - `thinkingPanel.ts`：判据从「收尾该不该收起」改成 `resolveThinkingOpen` 三级回落（手动 → 流式 → 设置）；`ReplyArea` 因此**删掉 `useState(open)`、`touched`、`wasStreaming` 与两个边沿 effect**
  - 设置页加 `ThinkingEndSetting`（照「语言」那行：SettingCell + Select），位置在朗读音色与头像之间；中英各 3 个词条
- 运行过的验证：
  - 六道门全绿（**121 条测试**；`thinking-panel.test.ts` 重写成 6 条）
  - `_probe/thinking-collapse.mjs` **10/10**：默认收起、点标题展开、**切走再回来保持**、设置=展开时新消息默认展开、设置改回后手动记录不受影响
- **未验证**：真机（流式小窗口那几条依旧只能真机；设置行的排版也要看一眼）
- 更新过的文件或工件：`src/services/settings.ts`、`src/services/thinkingOpen.ts`（新）、`src/components/messages/thinkingPanel.ts`、`ReplyArea.tsx`、`src/components/settings/SettingsDialog.tsx`、`src/i18n/zh.ts`、`src/i18n/en.ts`、`test/thinking-panel.test.ts`、`_probe/thinking-collapse.mjs`、`package.json`（0.4.6）、`CHANGELOG.md`、`feature_list.json`（`think-002`，`think-001` 加交叉引用）、本文件
- 复审（同日，→ 0.4.7）：查出 0.4.6 丢了 0.4.5 的一条规则——**没有正文时不收起**（用户点停止 / 请求出错时）。简化成三级回落时把 `hasResponse` 这一项漏了，导致默认收起下"一点停止，思考立刻被收起来"。已在 0.4.7 补回，测试 6→7 条（总 **122**）。顺带修正：上一轮我记成"129 条"，实际是 121 条
- 下一步最佳动作：装 0.4.7，先看设置里那行（位置/文案/下拉），再验「手动收起一条 → 切走再回来」和「设置改成展开 → 新回答是否展开」

### Session 020

- 日期：2026-11-19
- 本轮目标：设置里加「版本号 + 检查更新」跳 GitHub Releases；版本 → **0.4.8**；**首次发正式 Release**
- 已完成：
  - `diagnostics.ts` 的 `appVersion()` 改为导出，设置页复用（版本号与诊断信息同源）
  - 新增 `UpdateSetting`：`SettingCell` + 普通 `<a target="_blank" rel="noreferrer">`，位置在「位置信息」之下、「诊断信息」之上
  - `.updateLink` 样式照 outlined 按钮写（不引新组件）
  - 中英词条 `settingsVersion` / `settingsCheckUpdate`
- 运行过的验证：
  - 新探针 `_probe/update-link.mjs`（390×844）**7/7**：链接 href 指向 releases/latest、文案「检查更新」、`target=_blank` + `noreferrer`、同行显示版本号、点击后当前页没被导航走；截图 `screenshots/settings-update-row-scrolled.png`
  - 六道门全绿（122 条测试）
- **未验证**：真机点「检查更新」是否真的进系统浏览器（Capacitor 对 `target=_blank` 的默认处理）。若变成 WebView 内导航，用户会困在没有地址栏的页面里，那时要改接 `@capacitor/browser`
- 附带完成：把 keystore 备份到 `E:\DS-Echo-签名备份\`（做法 A：原位留一份 + E 盘副本，两份 SHA256 已核对一致），并写了说明文件。**这不是换签名**，老用户照常升级
- 已知局限：无代理用户大概率打不开 GitHub；文案里刻意没写
- 更新过的文件或工件：`src/components/settings/SettingsDialog.tsx`、`Settings.module.css`、`src/services/diagnostics.ts`、`src/i18n/{zh,en}.ts`、`_probe/update-link.mjs`（新）、`package.json`（0.4.8）、`CHANGELOG.md`、`feature_list.json`（`update-001`）、本文件
- 下一步最佳动作：真机点一次「检查更新」；然后按需改 release 说明或补发后续版本

### Session 021

- 日期：2026-11-19
- 本轮目标：给「检查更新」加出错防御——先弹说明面板再跳转；版本 → **0.4.9**
- 用户定的口径：放进 0.4.9；**不做**「点完再弹一个已交给浏览器」的二次打扰；文案说白话
- 已完成：
  - 行内控件 `<a>` → `<button>`，点击开 `Modal` 说明面板（复用诊断信息那套弹窗，`closable`）
  - 面板文案三段：会打开 GitHub 下载页 / 国内有时打不开、不是 App 坏了 / 打不开就复制链接去别处下
  - footer：「复制链接」（outlined Button，clipboard 失败回落 `copyBySelection`，两种都给轻提示）+「去打开」（`<a>` 套 primary 按钮样式，`target=_blank`）
  - 面板里显示完整链接（`user-select: all`），复制失败也能手动拿
  - CSS：`.updateLink` 兼容 button、新增 `.updatePrimary` / `.updatePanel` / `.updateUrl`
- 运行过的验证：
  - 新探针 `_probe/update-link.mjs` **12/12**（行、面板文案、链接可见、target、复制提示）；截图 `settings-update-row-scrolled.png`、`settings-update-panel.png`
  - 六道门全绿（122 条测试）
- **未验证**：真机上点「去打开」是否真的进系统浏览器（源码已确认机制，但仍缺那一眼）
- 更新过的文件或工件：`SettingsDialog.tsx`、`Settings.module.css`、`i18n/{zh,en}.ts`、`_probe/update-link.mjs`、`package.json`（0.4.9）、`CHANGELOG.md`、`feature_list.json`（`update-001`）、本文件
- 下一步最佳动作：装 0.4.9，点「检查更新」看面板，再点「去打开」确认进浏览器

### Session 022

- 日期：2026-11-19
- 本轮目标：修一个**逻辑错位**——「检查更新」不该出现在网页版；版本 → **0.4.10**
- 问题：网页版每次打开就是服务器上最新那份（CI 自动重部署），刷新即最新，不存在"检查更新"；而它跳的还是 APK 下载页。**我在网页版上验这一行，本身就验错了对象**
- 已完成：
  - `<UpdateSetting />` 用 `isNativeApp()` 包住，网页版整行不渲染
  - 探针改两段：先断言网页环境**没有**这一行；再注入 `window.androidBridge` 伪装安卓（Capacitor 的 `getPlatformId()` 就是看它），断言 APK 里行与面板都正常
- 运行过的验证：`_probe/update-link.mjs` **14/14**；六道门全绿（122 条测试）
- **未验证**：真机点「去打开」是否进系统浏览器
- 更新过的文件或工件：`SettingsDialog.tsx`、`_probe/update-link.mjs`、`package.json`（0.4.10）、`CHANGELOG.md`、`feature_list.json`（`update-001`）、本文件
- 下一步最佳动作：真机验一次；之后这个功能的纸面工作就结束了
- 已把这条判断沉淀成 **ARCHITECTURE 决策 24**（同一份产物、两种运行环境；新功能先分别判断在哪种形态成立），并在 AGENTS.md 的工作规则里加了一句提醒。顺手同步了 AGENTS.md 里过时的两处：APK 命名规则（`DS-Echo-<version>-<date>-debug.apk`）、仓库布局里漏掉的 `_probe/`

### Session 023

- 日期：2026-11-19
- 本轮目标：0.4.11 流畅度（用户把范围收窄成"小修、见效"），并加一个「回到底部」浮标；版本 → **0.4.11**
- 判断依据：读代码后发现「廉价胜利」基本已被前几轮吃掉——滚动回调不读布局、视口写样式有变更检测、消息组件已 memo、流式滚底已 rAF 合帧。剩下唯一的大头是**长会话全量 DOM 在每次全局重排时的代价**
- 已完成：
  - **回到底部浮标**：`scrollContext` 从 `() => void` 扩成 `{ scrollToBottom, jumpToBottom, atBottom }`（`scrollToBottom` 保持"只在跟随时才滚"，Markdown 在用它）；`atBottom` 只在真假切换时 `setState`；浮标渲染在 `SessionView` 的 `.inputContainer` 里，绝对定位到底部上方，不跟消息滚
  - **长会话渲染**：超过 200 条时给消息列挂 `longColumn`，CSS 里用**两层 @supports**（`content-visibility` + `contain-intrinsic-size: auto`）才启用
  - **图片懒加载**：`MessageFile` 的 `<img>` 加 `loading="lazy" decoding="async"`
- 运行过的验证：
  - 六道门全绿（122 条测试）
  - 新探针 `_probe/scroll-to-bottom.mjs` **7/7**（210 条会话）
  - **五条探针并行回归 52 条断言全过**（avatar 11 / sider 8 / thinking 10 / update 16 / scroll 7）
- **未验证**：真机——浮标手感、`content-visibility` 在 A58 上会不会跳（WebView 版本未知，85–97 时规则自动不生效）
- **本轮刻意停在打包前**：用户要求先不打包、不发 Release。代码与文档已在本地提交，**没有 push、没有 tag、没有 APK**
- 更新过的文件或工件：`scrollContext.ts`、`ScrollToBottomButton.tsx`（新）+ 样式、`MessageList.tsx`、`MessageList.module.css`、`SessionView.tsx`、`MessageFile.tsx`、`Markdown.tsx`、`i18n/{zh,en}.ts`、`_probe/scroll-to-bottom.mjs`（新）、`package.json`（0.4.11）、`CHANGELOG.md`、`feature_list.json`（`ux-001` / `perf-001`）、本文件

### Session 024

- 日期：2026-11-19
- 本轮目标：0.4.12 —— 首启「使用前须知」+ 设置里可重看；用户逐句定稿了文案
- 已完成：
  - `services/disclaimer.ts`：`chat-demo:disclaimer-ack`，**按设备记不按版本**（老用户升级后会看到一次）
  - `components/disclaimer/DisclaimerDialog.tsx` + 样式：四段文案，正文 `max-height: 60vh` + 滚动
  - `App.tsx`：首启状态；`ensureApiKey()` 从 `useEffect([])` 挪到须知关掉之后再跑，避免两层遮罩叠加；须知渲染在 `SettingsDialog` 之后（后渲染在上）
  - `SettingsDialog.tsx`：加「使用前须知」行（查看 → 重开），位置在版本/检查更新之下、诊断信息之上
  - 中英各 8 个词条
- 运行过的验证：
  - 新探针 `_probe/disclaimer.mjs` **11/11**，跑了 **390×844** 与 **360×800（A58 那档）**
  - 五条老探针回归：avatar 11 / sider 8 / thinking 10 / update 16 / scroll 7 —— 全过
  - 六道门全绿（122 条测试）
- **踩到的坑**：
  1. **base `Modal` 不滚动**（`.content`/`.main` 没有 max-height/overflow）——之前以为它滚，实际只有诊断信息自己加了 `max-height`。须知正文因此自己限高
  2. **英文词条里 `DeepSeek's` 的撇号把单引号字符串截断**，tsc 报在几十行之后；改写成 "the open-source chat-demo published by DeepSeek"
  3. **头像探针第一段 `waitFor('[role="dialog"]')` 先匹配到了须知弹窗**，导致「设置弹窗自动打开」假通过、后面点不到「通用设置」；修法：先点掉须知，再等设置弹窗
  4. **同时开 6 个 Chrome 会抖**：disclaimer 探针在 6 路并行时失败一次，单独跑 11/11 —— 以后并行别超过 5 条
- **未验证**：真机（A58 字体放大到最大时正文要滑动一下）
- 更新过的文件或工件：`services/disclaimer.ts`（新）、`components/disclaimer/`（新）、`App.tsx`、`SettingsDialog.tsx`、`i18n/{zh,en}.ts`、`_probe/disclaimer.mjs`（新）、五个老探针头部、`package.json`（0.4.12）、`CHANGELOG.md`、`feature_list.json`（`notice-001`）、本文件

### Session 025

- 日期：2026-11-20
- 本轮目标：0.4.13 —— 裸 LaTeX 识别、公式失败降级、20 门代码语言、标题栏下状态栏（余额 + 上下文圆环）
- 已完成：
  - `services/markdown/bareTex.ts`（新）：整段匹配的裸 LaTeX 识别；`parse.ts` 只对 text 节点生效，代码块天然排除
  - `services/markdown/katex.ts`：`normalizeFormula` 把 U+00B7 换成 U+22C5
  - `components/markdown/MathFormula.tsx` + `mathLoading.tsx`（新）：流式中严格、结束后宽松降级，诊断记一条去重原因
  - `services/markdown/highlight.ts`：补 20 门语言与别名，按 components.json 的依赖补齐
  - `services/contextUsage.ts`（新）：usage 两段合并、已用 token、百分比 clamp、token 格式化、取最近一条用量
  - `services/chat/reply.ts`：usage 从「后到覆盖」改成 `mergeUsage`
  - `services/balance.ts`（新）：余额接口、币种优先、格式化
  - `services/contextWindow.ts`（新）：按模型 id 取 `context_window`，缓存 24 小时
  - `services/api/client.ts`：`verifyApiKey` 返回 /models 的 JSON（向后兼容，原调用方只 await）
  - `components/session/UsageBar.tsx`（新）+ 样式；`SessionView` / `Welcome` 落点；`Welcome.container` 桌面也改 column
  - 中英词条各 4 个
- 运行过的验证：
  - `pnpm type` / `pnpm lint` / `pnpm test` — 全绿（156 条）
  - `_probe/math-render.mjs` **8/8**、`_probe/usage-bar.mjs` **6/6**
  - `measure-layout --check`：10 档断言全过；**基线重存**（新增 32px 栏改变几何，属预期变化）
  - `verify-boot-guard.mjs` **39/39**
  - `./init.ps1` 六道门 error 0 / hint 1 / info 9
- **未验证**：真机（A58 上状态栏观感、余额请求的实际网络表现）
- 踩到的坑：
  1. **Node 的类型剥离不认 `.js → .ts`**：测试里不能 import 带本地运行时 import 的 `parse.ts`，接线验证只能交给探针
  2. **没填 Key 时应用会自动弹设置窗**：探针点不到会话，先在 localStorage 塞假 Key 或按 Escape
  3. **KaTeX 的 MathML `<annotation>` 保留原文**：探针用 `body.textContent` 查「有没有反斜杠残留」会误判，要看 `.katex-html`
  4. **KaTeX 宽松模式不用 `katex-error` 类**：是红色文本（`mathcolor="#cc0000"`）
  5. **`measure-layout` 基线是旧版工具写的**（缺 800x480、1024x600 两档），重存后才一致
- 更新过的文件或工件：见提交 `feat: 裸 LaTeX 识别…` 与 `feat: 标题栏下新增状态栏…`；`package.json`（0.4.13）、`CHANGELOG.md`、`feature_list.json`（math-001/002、code-001、usage-001）、`tools/layout-baseline.json`、本文件
- 下一步最佳动作：打 0.4.13 debug 包，装 A58 看状态栏与公式；旧会话圆环显示 `--` 是预期

### Session 026

- 日期：2026-11-20
- 本轮目标：0.4.14 —— 加载态收敛（余额超时、上限加载态、导出反馈）
- 已完成：
  - `services/balance.ts`：`fetchBalance` 加 8 秒 `AbortController` 超时，`clearTimeout` 放在 `finally`，覆盖到 `response.json()` 读完
  - `components/session/UsageBar.tsx`：新增 `limitLoading`；没有用量时优先 `--`，加载中才 `…`；余额与百分比加 `data-role` 供探针定位
  - `components/settings/SettingsDialog.tsx`：导出按钮 `busy` 时文案变「导出中...」
  - `i18n/{zh,en}.ts`：新增 `exportAllExporting`
- 运行过的验证：
  - `pnpm type` / `pnpm lint` / `pnpm build` 全绿
  - `_probe/usage-bar.mjs` **8/8**：新增阶段 2，用 CDP 的 Fetch 域挂起 `api.deepseek.com`，9 秒后断言余额与圆环都收敛到 `--`
  - `./init.ps1` 六道门 error 0 / hint 1 / info 9
- **未验证**：真机（A58 上超时期间的观感）
- 取舍：**图片骨架底色不做**——本地 blob 解码通常 <50ms，骨架看不见；给容器加底色会让透明 PNG 透出灰底
- 更新过的文件或工件：`balance.ts`、`UsageBar.tsx`、`SettingsDialog.tsx`、`i18n/{zh,en}.ts`、`_probe/usage-bar.mjs`、`package.json`（0.4.14）、`CHANGELOG.md`、`feature_list.json`（`loading-001`）、本文件
- 下一步最佳动作：真机验一眼；再往后只剩「首屏骨架」与「附件上传进度」两个大件，都属于要单独评估性能的范畴

### Session 027

- 日期：2026-11-20
- 本轮目标：0.4.15 —— 系统提示声明客户端渲染能力，阻止模型用 HTML 模拟样式
- 背景：用户真机截图里，模型为「橙色 + 加粗」输出了 `<span style="...">`，客户端把标签原样显示成源码；同一张截图里 `$\color{#ff4500}{\textbf{...}}$` 是渲染成功的。定责：渲染引擎没问题，是模型不知道客户端支持什么。
- 已完成：
  - `services/chat/store.ts`：`SYSTEM_PROMPT` 从一行扩成四行，追加「输出格式约定」三条（公式用 KaTeX、禁 HTML、颜色用 `\textcolor`、中文强调用 Markdown）
  - 刻意**不加**「整段裸 LaTeX 也支持」（会诱导模型输出只部分支持的形式）与「表格/Mermaid」（不解决问题）
- 运行过的验证：
  - `pnpm type` / `pnpm lint` / `pnpm build` 全绿
  - `./init.ps1` 六道门全绿（156 条测试）
  - **模型是否遵守未验**：探针用假 Key，拿不到真实输出；要用户用自己的 Key 测一句「用橙色加粗写微积分基本定理」
- **未验证**：提示的实际效果（只能真机真 Key 验）
- 更新过的文件或工件：`store.ts`、`package.json`（0.4.15）、`CHANGELOG.md`、`README.md`、`feature_list.json`（`prompt-001`）、本文件
- 下一步最佳动作：用户真机测一句，看模型是否改用 `$\textcolor{...}$`；若仍用 HTML，再把提示写具体（给正反例）

### Session 028

- 日期：2026-11-20
- 本轮目标：0.4.16 —— 会话分类文件夹
- 已完成：
  - `types.ts`：新增 `Folder`；`Session` / `SessionSummary` 带 `folderId`（缺省按未分类读）
  - `db.ts`：DB 11 → 12，只加 `folders` 表；`loadFolders` / `saveFolder` / `moveSessionFolder` / `deleteFolderOnly` / `deleteFolderWithSessions`
  - `store.ts`：`folders` 状态、`createFolder` / `renameFolder` / `moveSessionToFolder` / `deleteFolder`；`sameSummary` 纳入 `folderId`
  - `sessionGroups.ts`：`groupSessionsByFolder`（子代理写，文件夹升序、未分类最后、无效 folderId 兜底）
  - `test/folder-groups.test.ts`：7 条（子代理写）
  - `Sider.tsx`：文件夹分组、折叠、新建入口、新建/重命名/删除/移动四个弹窗
  - `SessionItem.tsx`：菜单加「归到文件夹」；`icons.tsx`：新增文件夹图标
  - `Sider.module.css`：文件夹相关样式
  - 中英词条 15 个（子代理写）
  - `_probe/folders.mjs`：11 条
- 运行过的验证：
  - `pnpm type` / `lint` / `test` 全绿（163 条）
  - 探针 `folders.mjs` **11/11**
  - `./init.ps1` 六道门全绿
- **未验证**：真机（折叠手感、文件夹多了以后的滚动）
- 踩到的坑：
  1. **会话行的「⋯」默认 `display:none`**，只在 `@media (hover: hover)` 的 hover 或 `@media (hover: none)` 下显示——探针没模拟触摸时锚点矩形为 0，菜单跑到左上角；补 `Emulation.setTouchEmulationEnabled` + `setEmulatedMedia({ hover: none })` 后定位正常
  2. **`sessionGroups.ts` 带运行时本地 import**，Node 的类型剥离不认 `.js → .ts`；`test/folder-groups.test.ts` 用 `module.registerHooks` 补了解析，这是仓库里第一次这么干
- 更新过的文件或工件：`types.ts`、`db.ts`、`store.ts`、`sessionGroups.ts`、`Sider.tsx`、`SessionItem.tsx`、`icons.tsx`、`Sider.module.css`、`i18n/{zh,en}.ts`、`test/folder-groups.test.ts`（新）、`_probe/folders.mjs`（新）、`package.json`（0.4.16）、`CHANGELOG.md`、`README.md`、`feature_list.json`（`folder-001`）、本文件
- 下一步最佳动作：真机试折叠与「归到文件夹」；再往后若要文件夹排序/拖拽，另开一条

### Session 029

- 日期：2026-11-20
- 本轮目标：把 0.4.16 发布出去（用户授权「补推送、打 tag、发 Release」）
- 开工前核实（决定这次能不能直接发的那一条）：本地 APK 构建时间 21:25:28，晚于两个数据一致性 fix 的提交时间（21:18:26 / 21:21:04）→ 包内含这两条修复；`package.json` 0.4.16，`release/` 里 APK 6,418,294 字节
- 已完成：
  - 补齐 `CHANGELOG.md` 缺失的 0.4.12～0.4.15 四个版本标题（内容早就在，标题在历次「未发布 → 版本号」替换中被吃掉，导致 0.4.16 之后直接跳到 0.4.11）
  - `ARCHITECTURE.md` 决策 10 的「`git rm --cached` 尚未执行」改为「已执行（commit `166fe23`）」，与 `products-001` 的 passing 对齐
  - `feature_list.json`：`last_updated` 与 `note` 更新为 47 条（compat 16 / feature 22 / harness 6 / performance 2 / repo 1），去掉容易腐坏的按状态计数
  - `claude-progress.md` 顶部状态块：功能账条数、最近发布版本、从未发布的版本清单三处同步
  - commit `821cd27` → tag `v0.4.16` → push main 与 tag → `gh release create v0.4.16`（APK 已上传）
- 运行过的验证：
  - `./init.ps1` 六道门全绿：type / lint（0 warning）/ test 163 / build / 产物齐全 / 内核兼容 `error 0 / hint 1 / info 9`
  - CI run 44746267665 全绿，含「发布到 GitHub Pages」作业
  - 线上网页版首页 200，主 chunk `static/js/main.189460bf.js` 与本地重建产物同名 → 部署的就是这份源码
  - Release 资产核对：非草稿、非预发布、tag `v0.4.16`、APK 6,418,294 字节、sha256 `21f669b8…2820d`
- 环境坑（会复现，记下来）：
  1. 本会话 pwsh 在 workspace-write 下跑 `pnpm build` 会在 `scripts/build.mjs:17` 的 `rmSync(dist)` 处 EPERM；文件策略切到 danger-full-access 后同一命令通过——与 Session 023 记的是同一个坑
  2. `pwsh -File .\init.ps1` 必须把工作目录设在仓库根，否则报「参数 '.\init.ps1' 无法识别为脚本文件名」
- 未验证（仍是 inferred）：
  - 0.4.16 的两个数据修复、文件夹折叠手感、文件夹多时的滚动——全部只在 headless 探针里验过，真机还没装
- 下一步最佳动作：装 0.4.16 覆盖升级，验「移动会话后不弹回未分类」「删文件夹后正在生成的会话不被写回」

### Session 030

- 日期：2026-11-21
- 本轮目标：0.4.17 —— 四边安全区、分组改名与数据库迁移、两处吸顶、折叠记忆与组内新建、余额自动刷新、流畅度标尺
- 已完成：
  - **安全区**：`global.css` 定义 `--app-safe-*`（Capacitor 注入的 `--safe-area-inset-*` → `env()` → 0）；主容器、抽屉、搜索面板、Toast、底部、横屏边距探针全部改用它。根因是变量名差一个前缀，不是缺能力
  - **改名**：`Folder`→`Group`、`folders`→`groups`、`folderId`→`groupId`、CSS 类名与图标名一起改
  - **数据库 12→13**：`upgrade` 只建 `groups` 表；`migrateGroupsIfNeeded()` 在 `initChat` 里搬数据，失败只记诊断、不写标记、不阻塞启动；旧表清空不删
  - **两处吸顶**：分组标题（包含块=分组，被下一个顶走）、思考折叠条（包含块=思考区，滚完松手），都补了不透明底色
  - **折叠记忆**：`services/groupCollapsed.ts`，只记「收起的 key」，新建默认展开；一键收起/展开用同一份记录
  - **组内新建**：`pendingGroupId` + `newChatInGroup()`，第一条消息建出会话时才写 `groupId`；不碰折叠/滚动/顺序
  - **余额**：`services/balanceRefresh.ts` + UsageBar 三时机（答完、回前台、5 分钟兜底），后台刷新不闪「…」
  - **标尺**：`_probe/scroll-perf.mjs` + `docs/perf-baseline.md`
  - 探针：新增 `safe-area.mjs`、`sticky.mjs`；`folders.mjs`→`groups.mjs`；**所有探针去掉硬编码库版本号**
- 运行过的验证：
  - 六道门全绿（**176 条测试**：迁移 6、折叠 4、余额 3、分组 8）
  - 探针：安全区 6/6、分组 11/11、吸顶 9/9
  - 回归：侧栏搜索 8/8、思考折叠 10/10、回到底部 7/7、状态栏 8/8
  - 迁移三起点本机 Chrome 实测：全新 / 11 版 / 12 版，会话与消息逐条一致
  - 基线（0.4.16 产物，构建于 18:17:51）：P50 16.7ms / P95 16.8ms / 长任务 2 次共 127ms
- **未验证（按 inferred 记）**：
  - 真机全部：状态栏实际高度、吸顶手感、余额刷新网络表现
  - 长会话（>200 条）下的吸附边界：按规范包含块不变，但未实测
- 踩到的坑：
  1. **思考结束后默认收起**，吸附探针第一次量不到——必须先点开标题才有可吸附的内容
  2. **老探针写死 `indexedDB.open('chat-demo', 11|12)`**，库升到 13 直接 VersionError；改成不带版本号，以后升版本不用再改探针
  3. **dist 被三方重建**，基线数字必须带「构建于 + 版本」两行，否则会把改过的产物当成改前的
  4. 旧的 `folders.mjs` 断言文案已改名，且写死 v12——一并改掉并 `git mv` 成 `groups.mjs`
- 下一步最佳动作：装 0.4.17 覆盖升级，验「侧栏标题不再压状态栏」「分组标题与思考条吸顶」「关掉的分组下次还是关着」「组里点 + 建的会话落在该组」

### Session 031

- 日期：2026-11-21
- 本轮目标：0.4.18 —— 字体大小四档、头像裁剪、对话背景图、设置页三栏
- 已完成：
  - **字体四档**：`--app-reading-scale`（0.875 / 1 / 1.125 / 1.25）定义在 `:root`，把 theme.css 里 **9 个 `font` 简写变量**改成 `calc(px × scale)`，正文、h1–h4、表格、代码一起缩放；用户消息气泡与输入框同样乘系数，输入框用 `max(16px, …)` 兜住 iOS 的下限。`services/readingFont.ts` 存 `chat-demo:reading-scale`，`main.tsx` 在渲染前应用一次
  - **头像裁剪**：新增通用 `ImageCropper`（pointer 拖动 + 滑块缩放 + 圆形遮罩 + canvas 导出），`AvatarRow` 从「选完直接存」改成「选完进裁剪器、确认才存」；`services/imageCrop.ts` 是纯函数，负责屏幕坐标 → 原图坐标的换算与夹紧
  - **对话背景**：`services/chatBackground.ts` 存图与遮罩浓度（默认 40）；`App` 的主区域加背景层 + 遮罩层（`--app-bg-dim-color` 跟主题，深色压黑、浅色压白），没图时两层都不渲染
  - **设置页三栏**：`SettingsSection` 加 `personalize`，把字体、思考结束后、朗读音色、头像、背景收进「个性化」；通用设置留下主题、语言、位置、更新、须知、诊断
  - **草稿持久化**（debug 阶段补的）：`services/chat/draftStorage.ts` 负责 key 编码与坏数据兜底，`drafts.ts` 用 `subscribe` + 400ms 防抖落盘；只存文本，附件仍在内存
- 运行过的验证：
  - 六道门全绿（**190 条测试**：新增字号 4 条、裁剪 6 条）
  - 探针：字号 13/13（四档下正文/h1/表格/输入框逐个核对，且标题四档都不小于正文）、头像 12/12（真实文件输入 → 裁剪器 → 保存 → 生效）、个性化 9/9（导航三项、四项齐全、选「大」正文 18px、背景图渲染 + 遮罩 0.4）
  - 回归：使用前须知 16/16、检查更新 16/16
- **未验证（按 inferred 记）**：
  - 背景图在真机上的渲染与滚动性能（本机无头 Chrome 只证明结构对）
  - iOS 上输入框 16px 下限是否真的不触发整页放大（规范如此，未实测）
  - 真机触摸下的拖动/滑块手感
- 踩到的坑：
  1. **主题按钮与字体按钮不能共用样式**：`.themeOption` 是竖向大卡（min-width 128px），四个字号并排放不下，另写了 `.fontSizeOptions` / `.fontSizeOption`
  2. **裁剪器的「保存」在图片解码前是 disabled**：头像探针第一版只等按钮出现就点，结果是 0 字符；改成等 `!disabled`
  3. **设置页重排后头像入口从「通用设置」挪到「个性化」**，老探针断言「两个上传入口」也变成三个（多了背景图的 input）
  4. **`IconSparkleOutline16` 不存在**，写了个不存在的图标名，`pnpm type` 当场拦下
- 下一步最佳动作：打包 0.4.18，真机上验四件事——字号四档切换、头像拖动缩放、背景图观感与遮罩、设置页三栏切换

### Session 032

- 日期：2026-11-22
- 本轮目标：壁纸模式的表面层级（用户反馈：余额条实白横断、AI 正文直接压在图上、思考条一坨、底部大白块、操作图标看不清），共 5 批逐批截图验收
- 已完成：
  - **表面令牌**（`global.css`）：`--app-bar` / `--app-dock` / `--app-input` / `--app-title` / `--app-chip` / `--app-action` / `--app-bubble` / `--app-answer` / `--app-fade`，默认值全部等于改动前的实色；`body[data-chat-bg]` 下换成半透明。**必须声明在 body**：它们引用主题色，而主题色也在 body；写到 `:root` 上会求值失败、底色塌成透明
  - **壁纸开关**：`chatBackground` 服务维护 `document.body.dataset.chatBg`，与遮罩同一处初始化；`--app-bubble-alpha` 只声明在 `:root`，JS 内联写 html（若 body 也声明默认值会压掉内联值）
  - **气泡**：用户气泡换令牌；AI 回复新增 `.body` 包裹（`data-role="answer-bubble"`），只在壁纸模式有内边距/圆角/底色；操作行跟着进气泡，用户消息那条用窄胶囊；气泡间加 12px 间距 + 1px 细边（浅色壁纸下不加边会看成连体）
  - **思考折叠条**：壁纸模式下 `fit-content` 胶囊（圆角 100、0.85 底、细边），不再横贯；思考区渐隐改用 `--app-fade`
  - **底部**：底板渐变在壁纸下改成平滑过渡（0.88），输入框 0.82；`--until` 硬边在半透明底上会显形
  - **其余**：移动端顶栏补底色（原先完全没有）、回到底部按钮换 `--app-chip`、欢迎页问候与加载/报错文字加描边、分支切换器与操作图标调深一档
  - **设置**：个性化 → 对话背景 →「气泡透明度」滑杆（20–90/步长 5/默认 70，右侧显示百分比）
  - **探针**：`_probe/wallpaper-surfaces.mjs`（360×787@3x，注入壁纸 + 假余额 + 演示会话；`--shots` 出图、`--until=bubbles|title|chrome` 分批断言、`--welcome` 截欢迎页）
- 运行过的验证：
  - `pnpm type` / `lint`（0 warning）/ `test`（**194 条**）/ `build` / 产物齐全 / `scan-compat`（error 0）全绿
  - 新探针 **24/24**；无壁纸对照逐像素 **0 差异**（浅/深）
  - 回归：personalize 9/9、usage-bar 8/8、thinking-collapse 10/10、sticky 9/9、scroll-to-bottom 7/7、measure-layout 10 档与基线一致
- **未验证（按 inferred 记）**：真机观感、滚动手感、旧内核表现；全部只有本机 Chrome 157 无头截图与断言
- 踩到的坑：
  1. **漏定义 `--app-answer`**：AI 气泡第一版算出来 `rgba(0,0,0,0)`，肉眼在浅色壁纸上几乎看不出，是断言报出来的
  2. **探针选择器抓错元素**：`[class*="title-"]` 先命中顶栏标题，思考标题断言读到 `0px`；改成 `button[aria-expanded][class*="title-"]`
  3. **Windows 上 Chrome profile 目录 EBUSY**：同一脚本连跑两次会卡在启动时 `rm`；改成每次运行用带时间戳的独立目录
  4. **气泡贴在一起**：加了 12px 间距仍显得连体，根因是壁纸本身是白色、气泡边界消失；补 1px 细边才解决
- 更新过的文件或工件：`global.css`、`theme.css`、`chatBackground.ts`、`AssistantMessage.{tsx,module.css}`、`UserMessage.module.css`、`ReplyArea.{tsx,module.css}`、`SessionView.module.css`、`MobileHeader.module.css`、`UsageBar.module.css`、`ChatInput.module.css`、`SettingsDialog.tsx`、`Settings.module.css`、`ScrollToBottomButton.module.css`、`Welcome.module.css`、`BranchSwitcher.module.css`、`App.module.css`、`i18n/{zh,en}.ts`、`test/bubble-opacity.test.ts`（新）、`_probe/wallpaper-surfaces.mjs`（新）、`README.md`、`CHANGELOG.md`、`feature_list.json`（surface-001）、本文件
- 下一步最佳动作：等用户对着 `screenshots/wallpaper/b5-*.png` 最终点头 → 改版本号 0.4.19 → 六道门 → 打包 → 真机验（尤其滚动手感与旧内核）

### Session 033

- 日期：2026-11-22
- 本轮目标：① 对 Session 032 做一次 debug；② 处理「导出历史会话」在大数据下把 App 撑退的问题
- 已完成：
  - **debug**：CSS 变量引用/定义对账（全齐）、滑杆值 40 → 气泡 0.4、清除壁纸后标记与透明度全回退；发现并修「旧消息下面的空胶囊」（提交 `5ab7fd8`：胶囊底从 `.bottom` 挪到 `.actions`，图标淡出时胶囊一起消失）
  - **导出**：核实导入端本来就是 256KB 分片流式读（安全）；导出端原生写盘是「整包 ZIP → base64 → 过桥」，同一份数据在内存里复制三四份，是撑退的来源。改为**分块写盘**：>8MB 时按 3MB 一块（3 的倍数，base64 边界不错位）逐块 `writeFile`/`appendFile`；≤8MB 与 `appendFile` 不可用时仍走老路
  - 新增 `src/services/native/chunkPlan.ts`（纯函数）与 4 条单测；新增 `test/archive-roundtrip.test.ts` 2 条：导出 ZIP 能被自己的读取器原样读回、重复导出字节一致
- 运行过的验证：
  - `pnpm type` / `lint`（0 warning）/ `test`（**200 条**）/ `build` / `scan-compat`（error 0 / hint 1 / info 9，与 0.4.18 基线一致）
  - 壁纸探针 **33/33**；无壁纸逐像素 0 差异；`verify-boot-guard` **39/39**
- **未验证（按 inferred 记）**：
  - A58 真机观感、滚动跟手度、旧内核表现
  - 安卓端分块写盘与系统分享的实际行为——本机没有 adb/设备，只能等打包后真机验
- 踩到的坑：
  1. **「截图有图标、断言却是 opacity:0」不是矛盾**：`MessageList.tsx:215` 的 `isLast || lastIndex-1` 让末尾两条消息的图标常显；探针量到的是第一条（旧）消息
  2. 分块写必须按 3 字节对齐：`appendFile` 每块独立 base64 解码，块长不是 3 的倍数会在拼接处错位
- 下一步最佳动作：真机上导出一份大历史验证分块写盘；再走 0.4.19 发版

### Session 034

- 日期：2026-11-22
- 本轮目标：把壁纸、导出、长会话三块收尾，跑兼容预检后打 0.4.19
- 已完成：
  - **超长回复折叠**：单条 > 3 万字符先渲染 8000 字预览 +「展开全文（共 N 字）」；点击时先用双 rAF 把「展开中…」画出来再渲染；展开后「收起全文」吸顶在气泡顶部（滚动中随时可点）。**本次流式生成出来的长回复不折叠**（否则读着读着内容会被抽走）
  - **侧栏密度**：会话行 44→40、小节留白 20→10、分组间距 12→6；分组标题的点击高度与「新建/搜索」没动
  - **导出**：>8MB 分块写盘（3MB 一块，3 的倍数对齐）+ 设置页「已写 X MB / 共 Y MB」进度（200ms 节流）
  - **打包**：`pnpm build` → `cap sync android` → `gradlew assembleDebug`；产物 `release/DS-Echo-0.4.19-20261122-debug.apk`（6,440,628 字节，versionCode 419，minSdk 24），桌面另存一份交付文件夹
- 运行过的验证：
  - 六道门：type / lint(0) / test(**211 条**) / build / 产物 / 兼容（error 0 / hint 1 / info 9，与 0.4.18 一致）
  - 启动兜底页 **39/39**；壁纸探针 33/33；measure-layout 10 档与基线一致
  - 长消息探针：20 万字符首帧 **3564ms → 187~265ms**，DOM 16.7 万 → 6.7 千；展开/收起闭环通
- **未验证（按 inferred 记）**：A58 真机观感与滚动手感；安卓端分块写盘与系统分享的真实行为；**从正文深处点「收起」是否会把滚动位置甩走**（现有夹具只有一条消息，测不出）
- 踩到的坑：
  1. 流式结束那一下不能触发折叠——要记「这条消息在本次会话流过」（`streamedHere`）
  2. 侧栏探针第一次拍出来按钮图标可见，是因为 `isLast || lastIndex-1` 让末尾两条常显；断言量的是第一条旧消息
  3. 性能探针跑出长任务 60 次是机器上残留 17 个 Chrome 进程，清场后为 0
- 更新过的文件或工件：`AssistantMessage.{tsx,module.css}`、`Sider.module.css`、`SessionItem.module.css`、`platform.ts`、`SettingsDialog.tsx`、`format.ts`、`longMessage.ts`（新）、`i18n/{zh,en}.ts`、`test/{long-message,native-chunk-plan,format}.test.ts`、`_probe/{long-message,wallpaper-surfaces}.mjs`、`CHANGELOG.md`、`package.json`（0.4.19）、本文件
- **当前状态：以上改动全部未提交**（工作区 16 个文件）。打包用的 APK 已出，等真机验完再 commit / tag / Release
- 下一步最佳动作：装 `DS-Echo-0.4.19-20261122-debug.apk` 到手机，按桌面「怎么验.txt」走一遍；重点：A58 类旧机不白屏、长会话滑动、导出大历史、壁纸模式各处表面

### Session 035

- 日期：2026-11-23
- 本轮目标：文档同步。作者交代了项目命名的由来，把「项目命名」从悬空项结案；不动任何代码
- 已完成：
  - `ARCHITECTURE.md` 新增**决策 36**：四处名字逐处给结论与代价（目录名是临时取的；remote 保留；`chat-demo` 沿用上游 `deepseek-ai/chat-demo` 的名字；README 标题随对外发布一起处理；显示名 `DS Echo`；`appId` 永不改）。「尚未决策」里该条改为索引
  - `CHANGELOG.md` 的 0.2.0「项目名四处不统一」追加结论指向，原文保留
  - 依据为作者 2026-11-23 口述：「文件夹名是当时临时取的名字」「demo 的名字是官方 DeepSeek 公布的那个项目来的」
- 运行过的验证：改动只落在 Markdown；按提交纪律仍跑三道门，全绿（`pnpm type` 0；`pnpm lint` 0 警告 0 错误、156 个文件；`pnpm test` 211 条全过）
- 未验证：无（不涉设备、不涉产物）
- 更新过的文件或工件：`ARCHITECTURE.md`、`CHANGELOG.md`、本文件
- 下一步最佳动作：`release/DS-Echo-0.4.19-20261122-debug.apk` 仍在等真机复验（见 Session 034 的未验证项）；文档侧无遗留
