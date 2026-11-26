# AGENTS.md

DeepSeek APP Replica：把 DeepSeek 官方开源的 **chat-demo** 前端（MIT，2026-11-12 发布）套一层 Capacitor 8 安卓壳，做成一个能装在自己手机上的独立 App。模型调用走使用者自己的 DeepSeek API 账户，按 token 计费。

**不是**官方 App 的破解版，**不**提供免费额度，**不**绕过任何官方限制。

本仓库面向长时运行的 coding agent：目标不是尽快产出代码，而是让每轮会话结束后，下一个会话仍能无猜测地接着干。开工前先读 `README.md`（对外说明）、`claude-progress.md`（最新状态）、`feature_list.json`（当前该做哪一条）。

## 仓库布局

```
src/                 应用源码（上游官方前端 + 本项目改造）
  app/               外壳：App.tsx、主题令牌、viewport、原生壳接线
  components/        界面组件（base 基础控件 / chatInput / messages / settings /
                     sider / search / markdown / files / session）
  services/          业务逻辑
    api/             接口调用、SSE 流式解析（sse.ts）、事件校验（parseEvent.ts）
    chat/            本地库、分支、草稿、历史导入导出（history/）
    markdown/        解析与高亮装配
    speech/ native/  语音与原生桥
  i18n/              中英词表：zh.ts 为基准，en.ts 用 satisfies 钉住 key 集合
  utils/             无依赖小工具（日期格式化、id）
android/             Capacitor 生成的安卓工程。生成物不作手改；要改配置改 capacitor.config.ts
scripts/build.mjs    跨平台构建入口（官方 package.json 用 rm -rf，Windows 下不可用）
tools/serve.mjs      本地静态服务（预览 dist/）
tools/shot.mjs       无头截图（视觉验收的机械门）
tools/webview-eval.mjs  在真机 WebView 里执行脚本（真机取证）
tools/scan-compat.mjs   兼容扫描：产物里有没有「用了新特性但没兜底」的地方（门禁第 6 道）
tools/measure-layout.mjs 固定 10 档尺寸量布局并断言，给适配留机器口
tools/verify-boot-guard.mjs 真开 Chrome 验启动兜底（白屏时那页说明能不能出来）
test/                单元测试，node:test 直跑 TS 源码
_probe/              无头 Chrome 探针（真开页面点按钮，验 UI 行为；每个都以 0 退出码收尾）
.github/workflows/ci.yml  CI：push / PR 时跑 type / lint / test / build / 产物 / 兼容
docs/                使用说明、上游说明、已知设备坑（known-devices.md）
dist/                构建产物        （gitignore，不进版本控制）
release/             打包好的 APK    （gitignore）
screenshots/         验收截图        （gitignore）
```

新增被测试 import 的源码模块不需要额外注册；`test/` 靠 glob 自动发现。

## 命令

```powershell
pnpm install                 安装依赖
pnpm dev                     开发服务器，默认 :8090
pnpm build                   生产构建到 dist/（先清空 dist）
pnpm type                    tsc 类型检查
pnpm lint                    oxlint 静态检查
pnpm format                  oxfmt 格式化（写入）
pnpm exec oxfmt --check .    格式化检查（不写入）
pnpm test                    单元测试
./init.ps1                   开工基线：依赖 + 全部门禁，退出码 0 才算能开工
```

若被 Windows 执行策略拦下（报「无法加载文件…禁止运行脚本」），改用：

```powershell
pwsh -ExecutionPolicy Bypass -File ./init.ps1
```

只做静态门（跳过构建）用 `./init.ps1 -SkipBuild`——产物齐全与内核兼容这两道都要读 `dist/`，会一起跳过。

CI 在 push 到 `main` 与开 PR 时自动跑同一条链路（`.github/workflows/ci.yml`）：install → type → lint → test → build → 产物检查 → 内核兼容。**本地 `./init.ps1` 是自觉，CI 是强制执行；两边红都算基线红。**

视觉与真机验收（进不了自动化门，靠人眼与真机）：

```powershell
node tools/serve.mjs          起静态服务看 dist/
node tools/shot.mjs           无头截图，落到 screenshots/
node tools/webview-eval.mjs   在已连真机的 WebView 里跑脚本取证
node tools/scan-compat.mjs    兼容扫描（构建后跑；有发现则退出码 1）
node tools/measure-layout.mjs 量 10 档尺寸的布局并断言（--baseline 存基线、--check 比对）
node tools/verify-boot-guard.mjs 真开 Chrome 验启动兜底页（7 个场景、27 条断言）
```

## 发布

一个 APK 对应一个版本，旧版随时可从 Releases 下载：

1. 改 `package.json` 的 `version`——`versionCode` 由它折算（`major*10000 + minor*100 + patch`，见 ARCHITECTURE 决策 16），不要再手改 `build.gradle`
2. 更新 `CHANGELOG.md`：把 `[未发布]` 换成新版本号与日期
3. `pnpm build` → `pnpm exec cap sync android` → `cd android; .\gradlew.bat assembleDebug`
4. 产物重命名为 `DS-Echo-<version>-<yyyyMMdd>-debug.apk`（例：`DS-Echo-0.4.10-20261119-debug.apk`）
5. `git commit -m "chore(release): <version>"` → `git tag -a v<version> -m "<摘要>"` → 推分支与 tag
6. `gh release create v<version> <apk> --title "<版本> — <摘要>" --notes-file <说明>`

`gh` 要在 git 仓库根目录执行，否则会报 `not a git repository`。国内网络下 `git push` 与 `gh` 需要走本地代理（本机实测 `http://127.0.0.1:7897`，以实际端口为准），且 SSL 偶发断连——重试一次通常就好。

## 红线

- **保留上游版权**：`src/` 主体来自 deepseek-ai/chat-demo（MIT）。三份声明缺一不可，且都必须随产物分发（构建会拷进 `dist/`）：`LICENSE`（本仓 AGPL-3.0 全文）、`LICENSE-upstream`（上游 MIT 全文）、`NOTICE`（谁写了哪部分的归属说明）。少带一份就等于把归属弄丢。改动不删上游文件头。
- **API Key 只在本地**：只存本机存储，绝不进仓库、不进日志、不进截图、不进 issue。发布前搜一遍 `sk-`。
- **产物不进版本控制**：`dist/`、`release/`、`screenshots/`、安卓构建中间物一律 gitignore。已跟踪的要 `git rm --cached` 撤出。
- **`android/` 里哪些文件能改**：`capacitor.build.gradle`、`capacitor.settings.gradle`、`app/src/main/assets/` 是 `cap sync` 的产物，改了会被覆盖，要改配置改 `capacitor.config.ts`；`app/src/main/AndroidManifest.xml` 自 `cap add` 之后 `cap sync` 不再覆盖（`git log` 只有初始提交，`RECORD_AUDIO` 权限也是手工加的），属手工维护，改动要在这里登记；其余原生代码（`MainActivity.java` 等）改了同样要登记。
- **不做绕过额度的事**：模型调用走使用者自己的 API 账户，仓库里不放任何共享密钥或代理池。

## 质量约定

- **测试只测纯函数与边界，不测 UI 渲染。** UI 的正误由「构建通过 + 截图 + 真机点一遍」判定，写渲染测试的维护成本高于收益。
- **测试直接 import `.ts` 源码**，靠 Node 24 的类型剥离运行，因此被 import 的模块在剥离后不能有运行时 `import`（本项目源码写 `./x.js` 指向 `.ts`，Node 不重写路径会解析失败）。只有 `import type` 是安全的。要测带运行时依赖的模块，先把逻辑抽成纯函数，别为测试引入打包器。
- **同一个功能只写能长期活的测试**：守住「错了会真出事」的边界，不追覆盖率数字。
- 中英词条同步：加 key 先加 `zh.ts`，`en.ts` 的 `satisfies Record<keyof typeof zh, string>` 会在 `pnpm type` 时强制补齐；占位符（如 `{seconds}`）由 `test/i18n.test.ts` 守。
- 文件以恰好一个换行结尾。不注释显而易见的事实。
- 一次改动一个逻辑单元；跨模块的重构单独提交。

## 会话工作循环

### 开工

写代码前按顺序做：

1. `pwd` 确认在 `chat-demo/` 仓库根。
2. 读本文件。
3. 读 `claude-progress.md`：最新已验证状态与下一步。
4. 读 `feature_list.json`：取优先级最高的未完成功能。
5. `git log --oneline -5` 看最近提交。
6. 跑 `./init.ps1`。**基线一开始就红，先修基线，不要在坏起点上叠新功能。**

### 工作规则

- 一次只做一个功能：`feature_list.json` 里同时只有一条 `in_progress`。
- **新增功能先回答两句**：它在网页版成立吗？它在 APK 里成立吗？——答案不同就用 `isNativeApp()` 分开处理（见 ARCHITECTURE 决策 24；0.4.9 就是在网页版多显示了「检查更新」）。
- 代码写完不等于功能完成；没有跑过的验证不算证据。
- 不悄悄改弱验证规则，也不通过改写功能清单来掩盖未完成的工作。
- 除消除当前 blocker 的窄范围修复外，不扩到其他功能。
- 以仓库内文件为唯一事实来源，聊天记录不算。

### 完成定义

一个功能同时满足以下全部才算完成：

- 目标行为已实现。
- `./init.ps1` 全绿（最低限度：`pnpm type`、`pnpm lint`、`pnpm test` 三项必须过）。
- 涉及界面的改动，附一张截图或一段真机取证；只有代码没有画面的 UI 改动不算完成。
- **证据必须分级**：涉及设备行为的改动，「在本机能跑」不算完成。要么在目标设备/目标内核上验过（`feature_list.json` 里标 `verified`），要么明写「未验证」并标 `inferred`。**不许把推理写成通过**——规范推演、等价环境实测、产物检查都只算 `inferred`，永远不算 `passing`。
- **每条证据要带机器口**：写清是在哪台设备、什么环境下验的，例如「本机 Chrome 157 / 模拟器 WebView 133 / 真机 OPPO A58x / Android 12 出厂 Chromium 93」。没写环境的证据，当作没验。
- **判定口径**：凡「本机装了、模拟器跑过，但结果可能因设备而异」的行为，一律按涉及设备行为处理。拿不准时按涉及设备行为处理——宁可标 `inferred` 等真机，不要标 `passing` 等翻车。
- 新发现的设备兼容坑（「某类设备上有某症状」这一类）记进 `docs/known-devices.md`，并写明有没有真机确认。
- 证据记录在 `feature_list.json` 或 `claude-progress.md`。

### 收尾

结束会话前：

1. 更新 `claude-progress.md`：本轮做了什么、跑了什么验证、留下什么。
2. 更新 `feature_list.json`：状态与证据。
3. 记录未解决的风险与 blocker。
4. 工作处于安全状态后按提交纪律提交。
5. 给下一轮留下干净的重启路径。

## 提交纪律

- conventional commit 前缀：`feat:` / `fix:` / `refactor:` / `chore:` / `docs:` / `test:`，中文描述。
- 一个逻辑变更一个 commit。
- 提交前必过：`pnpm type`、`pnpm lint`、`pnpm test`；`git status` 无杂物。
- 行为变更同 commit 更新测试与词表。

## 编辑本文件

规则保持自包含；改完须与仓库现状一致。新增目录、新增命令、新增红线时必须回来同步本文件，否则下一轮 agent 会按过期的地图走路。
