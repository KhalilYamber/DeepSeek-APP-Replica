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

