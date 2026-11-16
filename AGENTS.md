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
test/                单元测试，node:test 直跑 TS 源码
.github/workflows/ci.yml  CI：push / PR 时跑 type / lint / test / build
docs/                使用说明、上游说明
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

只做静态门（跳过构建）用 `./init.ps1 -SkipBuild`。

CI 在 push 到 `main` 与开 PR 时自动跑同一条链路（`.github/workflows/ci.yml`）：install → type → lint → test → build → 产物检查。**本地 `./init.ps1` 是自觉，CI 是强制执行；两边红都算基线红。**

视觉与真机验收（进不了自动化门，靠人眼与真机）：

```powershell
node tools/serve.mjs          起静态服务看 dist/
node tools/shot.mjs           无头截图，落到 screenshots/
node tools/webview-eval.mjs   在已连真机的 WebView 里跑脚本取证
```

## 红线

- **保留上游版权**：`src/` 主体来自 deepseek-ai/chat-demo（MIT）。`LICENSE` 必须随产物分发（构建会拷进 `dist/`），改动不删上游文件头。
- **API Key 只在本地**：只存本机存储，绝不进仓库、不进日志、不进截图、不进 issue。发布前搜一遍 `sk-`。
- **产物不进版本控制**：`dist/`、`release/`、`screenshots/`、安卓构建中间物一律 gitignore。已跟踪的要 `git rm --cached` 撤出。
- **不手改 `android/` 生成文件**：那是 `capacitor sync` 的产物，改了会被覆盖。要改配置改 `capacitor.config.ts`，要改原生代码改后单独登记。
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
- 代码写完不等于功能完成；没有跑过的验证不算证据。
- 不悄悄改弱验证规则，也不通过改写功能清单来掩盖未完成的工作。
- 除消除当前 blocker 的窄范围修复外，不扩到其他功能。
- 以仓库内文件为唯一事实来源，聊天记录不算。

### 完成定义

一个功能同时满足以下全部才算完成：

- 目标行为已实现。
- `./init.ps1` 全绿（最低限度：`pnpm type`、`pnpm lint`、`pnpm test` 三项必须过）。
- 涉及界面的改动，附一张截图或一段真机取证；只有代码没有画面的 UI 改动不算完成。
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
