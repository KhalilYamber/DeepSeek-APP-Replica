# 变更日志

本项目的显著变更记在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [0.4.0] - 2026-11-17

### 修复 — 老设备白屏的真正原因

- **构建目标从 `chrome >= 105` 降到 `chrome >= 70`**。原来允许安装的设备（minSdk 24 / WebView 60+）比代码愿意支持的设备老得多，老内核解析到 `??` 就整包失败，表现是白屏——CSS 修得再好也没用
- **`.mjs` 后缀漏转译**：loader 规则是 `\.(j|t)sx?$`，不匹配 `.mjs`，而 mermaid 的入口是 `mermaid.core.mjs`。补上后，含 `??` 的产物文件从 24 个降到 2 个（剩下 2 处是 prismjs 正则字面量，不是语法）
- **补齐 API 垫片**：`swc` 只降语法不降 API。补了 `globalThis`（Chrome 71）、`Object.fromEntries`（73）、`Promise.allSettled`（76）、`String.replaceAll`（85）、`String.matchAll`（73），加上原有的 `structuredClone`（98）、`Object.hasOwn`（93）、`Array/String.at`（92）
- 其中 `globalThis` 最要命：它就在垫片文件第一行，在 Chrome 70 上会让兜底代码自己先崩

### 新增 — 启动兜底与兼容性自检

- `src/index.html` 内联一段纯 ES5 脚本，在任何打包代码之前执行：内核版本门槛（< 70）、全局错误捕获、8 秒后检查 `#root` 是否渲染。慢启动会延长等待而不是误判，界面晚到会把兜底页自动撤下
- `src/check.html`：逐项能力检测（跑不了 / 有毛病 / 有兜底三档）+ 环境信息 + 一键复制。样式也是老的，因为它要跑在比应用更老的机器上
- 兜底页上有「打开自检」按钮，不依赖应用启动

### 新增 — 图片格式校验

- 图片扩展名收窄到服务端支持的 `jpeg / jpg / jpe / jfif / png / apng / webp / gif`；移除 `bmp / tif / tiff / svg / ico / raw / avif / heic / svgz / dib / cur / avifs / xbm`
- `src/services/imageFormat.ts`：读文件头 magic number 判断真实格式（纯函数，32 条测试），并用它做内容校验——扩展名与内容不一致、或格式服务端不支持，在**选择阶段**就拦下
- 发送阶段服务端拒绝附件时给中文提示（「有附件格式不受支持（第 47 个内容块），请转成 JPG 或 PNG 后重发」），不再展示英文原文

### 新增 — 网络超时与有限重试

- 三类超时：连接 5s、首字节 30s、流空闲 60s；上传单独给 120s（大文件要先写完请求体，5 秒会把正常上传误判成超时）
- 自动重试 1 次，只针对「还没拿到响应」的连接失败、429、5xx；超时与流式中途断开不重试（会重复内容）
- 用户主动停止不会被误报成超时；重试时弹 toast，不静默

### 变更 — 横屏布局

- `isMobile` 判据加上宽高比：高 < 520 或（宽 > 高 且 高 < 700）都按手机处理，11 处 CSS 媒体查询逐字同步
- 从移动端切回桌面布局时**不自动展开侧栏**，只有用户点 ≡ 才展开并持久化

### 变更 — 门禁

- `tools/measure-layout.mjs` 从 8 档扩到 10 档（新增 800×480、1024×600），模式判定改为看 DOM 而不是 localStorage，每档导航前清 localStorage 消除顺序依赖
- `tools/verify-boot-guard.mjs`：真开 Chrome 跑 7 个场景 27 条断言（兜底页出现、不误伤、按钮可用、自检页可达）

## [0.3.0] - 2026-11-17

### 新增 — 兼容门禁与几何量测

- `tools/scan-compat.mjs`：构建后扫产物，找出「用了有内核门槛的特性但没兜底」的地方，有发现即非零退出。规则覆盖视口单位双声明、`:has()` / `@container` / `color-mix()` / `aspect-ratio`、JS 新 API 的运行时调用、源码里的 UA 版本嗅探
- `tools/measure-layout.mjs`：8 档固定尺寸量布局并断言（`--baseline` 存基线、`--check` 比对），基线 `tools/layout-baseline.json` 入库
- `init.ps1` 新增第六道门「内核兼容」；`.github/workflows/ci.yml` 同步加一步
- `docs/known-devices.md`：已知设备坑、尚未验证的风险、真机验证操作步骤

### 变更 — 适配健壮性

- **矮屏按手机处理**：11 条窄屏媒体查询追加 `, (max-height: 479px)`（逗号＝或），手机横过来（915×412）不再被当成桌面布局
- **横屏安全边距镜像**：刘海或导航条只报在一侧时两侧共用较大的一边。逻辑抽成 `resolveSafeSide` 纯函数，`env()` 经 `.safe-area-probe` 读成像素写入 `--app-safe-side`
- **布局突变不播过渡**：转屏、窗口缩放、键盘改变视口时挂 `change-layout`，120ms 后自动摘掉
- **`structuredClone` 兜底**：新增 `src/app/polyfills.ts`，修掉旧内核上渲染 Mermaid 图抛 TypeError
- **`:has()` 与 `@container` 降级**：`:has()` 改为外合并等价写法（32 个组合实测间距 0 差异）；`@container` 改为类名（`MessageFile` 新增可选 `compact` 属性）

### 变更 — 验收规矩

- `feature_list.json` 新增 `verified`（目标设备验过）与 `inferred`（推理未验）两级；`passing` 只用于不涉及设备行为的条目
- `compat-001` 与 `import-001` 由 `passing` 降为 `inferred`，**证据一条未删**
- `AGENTS.md` 完成定义新增三条：证据必须分级、每条证据要带机器口、判定口径（拿不准按涉及设备行为处理）

## [0.2.0] - 2026-11-16

### 变更 — 历史导入重做

- 入口：隐藏 input 加程序化 click 改为透明覆盖在「上传」按钮上的 input，点击不再依赖脚本触发；`accept` 留空，避免系统把 ZIP 报成 `application/octet-stream` 时选不到文件
- 反馈：新增「等待选择文件 / 没有选择文件 / 没弹出选择器 / 正在导入」四种状态；成功后显示导入与跳过数量
- 错误：导入失败显示具体原因（版本不符、文件不完整、不是 ZIP、文件里没有可导入的对话），不再统一压成一句猜测
- 语义：默认「合并导入」，保留现有对话、同 ID 会话跳过；覆盖改为独立的危险按钮
- 解析：单条会话损坏只跳过并计数，不再让整包失败；ZIP 里的杂项条目（目录、macOS 资源分叉）跳过；索引文件降为交叉核对
- 测试：新增 `test/import-result.test.ts`（4 条）

### 新增 — 工程骨架

- `AGENTS.md`：仓库布局、命令、红线、质量约定、**会话工作循环**（开工 / 工作规则 / 完成定义 / 收尾）、提交纪律
- `claude-progress.md`：跨会话进度日志，按 Session 编号，记验证与遗留风险
- `feature_list.json`：功能清单，三条硬规则（单活跃功能 / 完成必须有证据 / 不许跳过验证）
- `ARCHITECTURE.md`：编号设计决策（为什么用官方前端、为什么 Capacitor、为什么自写构建与 SSE、为什么测试用 Node 原生类型剥离、导入为什么默认合并…）与悬空项
- `init.ps1`：开工基线，一次跑完依赖 + 五道门（type / lint / test / build / artifacts）
- `test/`：34 条单元测试
  - `format.test.ts` — 日期格式化与月键的边界
  - `sse.test.ts` — SSE 解码跨片、CRLF 跨片、多行 data、注释、id 跨事件保留
  - `parse-event.test.ts` — 流事件畸形输入丢弃与合法透传
  - `i18n.test.ts` — 中英 key 集合、占位符一致、无空翻译
  - `import-result.test.ts` — 导入结果文案映射

### 变更

- `package.json`：版本 0.1.1 → 0.2.0
- `android/app/build.gradle`：版本号改从 `package.json` 读取，`versionCode` 由 semver 折算（0.2.0 → 200），保证新包能覆盖安装
- `.gitignore`：补 `release/`、`screenshots/` 与安卓构建中间物
- `.github/workflows/ci.yml`：push 到 `main` / PR / 手动触发时跑 install → type → lint → test → build → 产物检查

### 已知问题

- **历史导入未在真机验证**：入口在桌面 Chrome 里走通过（构造归档 → 确认弹窗 → 合并成功 → 列表出现会话），系统文件选择器是否弹出仍需真机确认
- **测试覆盖面有限**：只覆盖 5 个自包含模块；`services/chat/` 的存储层（`db.ts` 的 merge 分支）与解析层（`importArchive` 的宽容分支）没有测试
- `test/_probe.test.ts` 名字带下划线是历史原因：原为环境探测文件，因搭建环境不允许删除而就地改写为框架自检（钉住 Node >= 22 这个测试链路前提）
- 项目名四处不统一：目录 `DeepSeek 复刻APP` / remote `DeepSeek-APP-Replica` / `package.json` name `chat-demo` / README 标题 `DeepSeek APP Replica`

## [0.1.1] - 2026-11-16

### 新增

- 初始版本：官方开源的 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo) 前端（MIT）套 Capacitor 8 安卓壳，可安装在自己手机上独立运行
- 模型调用走使用者自己的 DeepSeek API 账户（按 token 计费），不提供免费额度
- 深度思考、联网搜索、文件上传、语音输入、多会话
- 主题（深/浅）与语言（中/英）设置
- 历史会话本地存储与导入导出（ZIP，`export_format_version: 3`）
