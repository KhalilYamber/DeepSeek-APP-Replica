# DeepSeek APP Replica

> **应用显示名：DS Echo**（2026-11-19 起）。仓库名沿用旧称，`appId` 不变——改 `appId` 等于换一个应用，覆盖安装会变成两个并存。

把 DeepSeek 官方 App 的对话体验搬到安卓上，用**自己的 API Key** 跑，不受官方免费额度的各种限制。

界面不是仿的，是**官方自己开源的**前端 —— 来自 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo)（MIT 许可，2026-11-12 随「全家桶应用 API」一起发布）。外面套一层 [Capacitor 8](https://capacitorjs.com/) 安卓壳。

---

## 它是什么，不是什么

**是**：一个能装在安卓手机上的独立 App。填自己的 API Key 后，深度思考、联网搜索、文件上传、语音输入、多会话这些都有。

**不是**：不是官方 App 的破解版，不提供免费额度。模型调用走你自己的 DeepSeek API 账户，按 token 计费。

### 与官方 App 的差异

| | 官方 App | 本项目 |
|---|---|---|
| 计费 | 官方出算力，免费 | 扣你自己的 API 余额 |
| 单次输入长度 | 约 4 万字 | 受模型上下文限制（未核实具体上限，按模型文档为准） |
| 会话保存 | 官方服务器，7 天不活跃会清 | 手机本地，不会被清 |
| 每日额度 | 有 | 无，只有余额 |
| 跨设备同步 | 有 | 无 |
| 账号体系 | 有 | 无 |

**换句话说**：用「每月几十块的账单」换「把限制去掉 + 数据留在自己手机里」。

---

## 功能

- 流式回复；**深度思考**：思考过程中收进一个约四行高的小窗口跟着往下滚，回答结束后按设置收起或展开，手动点开/收起过的会被记住（设置 →「思考结束后」）
- 联网搜索 + 来源引用、链接自动阅读
- 图片 / PDF / Office 附件上传与解析（图片支持 JPG / PNG / WebP / GIF，选择时即校验真实格式）
- 语音输入、回复朗读
- Markdown、代码高亮、KaTeX 公式、Mermaid 图表
- 多会话管理（自动标题、重命名、删除、消息分支切换）
- 深浅色主题、中英文切换
- 导入 DeepSeek 官方 App 导出的历史对话（ZIP）
- 导出全部对话为 ZIP（安卓端走「写文件 + 系统分享」）
- **网络超时与自动重试**：连接 5 秒 / 首字节 30 秒 / 流式空闲 60 秒，超时给中文提示，不再无限转圈
- **启动兜底与兼容性自检**：打不开时显示一页说明（内核版本、怎么更新 WebView、可复制的诊断信息），并可进入 `check.html` 逐项检测设备能力
- **历史对话搜索、自定义头像**：网页版与 APK 都有（搜索 0.4.3 起、头像 0.4.4 起进了 APK）
- **版本号与检查更新（仅 APK）**：设置最底部显示当前版本，点「检查更新」先弹一段说明，再用系统浏览器打开 Releases 页自行下载。网页版没有这一行——刷新就是最新，不需要检查

## 两种用法

| | 安卓 APK | 网页版 |
|---|---|---|
| 怎么用 | 装到手机 | 浏览器直接打开 |
| 数据存在哪 | App 私有目录 | 浏览器 localStorage / IndexedDB |
| 怎么拿到新版 | 设置里「检查更新」→ 下载安装包覆盖安装 | **刷新一下**，服务器上永远是最新 |
| 检查更新入口 | ✅ 有 | ❌ 没有（也不需要） |
| 语音输入、文件导出 | ✅ 原生能力 | 受浏览器限制 |

两者是**同一份源码、同一个版本号**构建出来的，差别只在运行环境：网页版由 CI 在每次推送后自动部署，APK 装在手机里不会自己变新。所以像「检查更新」这种功能只对 APK 成立。

网页版地址：<https://khalilyamber.github.io/DeepSeek-APP-Replica/>

网页版由 CI 在每次推送 `main` 之后自动发布（验过的同一份 `dist`），见 `.github/workflows/ci.yml` 的 `deploy` 作业。

## 截图

| 主界面 | 设置（深色） | 主题与语言 |
|---|---|---|
| ![主界面](screenshots/02-main.png) | ![设置](screenshots/01-settings-dark.png) | ![主题](screenshots/04-theme-language.png) |

---

## 安装

`release/` 目录下有已构建好的 debug APK：

```
release/DS-Echo-<版本>-<日期>-debug.apk     例：DS-Echo-0.4.10-20261119-debug.apk
```

也可以直接从 [Releases](https://github.com/KhalilYamber/DeepSeek-APP-Replica/releases) 下载对应版本。

传到手机安装即可。要求 Android 8.0+。**系统 WebView 需要 Chrome 84 以上**：构建目标（语法）仍是 70，所以 70–83 的设备多数还能打开，但界面会错位（间距塌掉）；低于 84 并且确实没渲染出来时，会看到一页中文说明而不是白屏（见下）。

**第一次打开会要求填 API Key**（在 <https://platform.deepseek.com/api_keys> 创建）。

---

## 从源码构建

### 环境要求

- Node.js 22.12+
- pnpm
- JDK 21
- Android SDK（compileSdk 36、build-tools 36.0.0）

设好环境变量：

```powershell
$env:JAVA_HOME  = "<你的 JDK 21 路径>"
$env:ANDROID_HOME = "<你的 Android SDK 路径>"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
```

`android/local.properties` 写上 `sdk.dir=<SDK 路径>`（该文件已被 gitignore）。

### 构建

```powershell
pnpm install
pnpm build                    # 构建网页产物到 dist/
pnpm exec cap sync android    # 同步到安卓工程
cd android
.\gradlew.bat assembleDebug   # 产物：app/build/outputs/apk/debug/app-debug.apk
```

---

## 相对官方 chat-demo 的改动

上游是纯网页 demo。本项目做了两类改动：**把它变成一个能装的安卓 App**，以及 **让它在老设备上也能跑起来**。

### 新增

| 文件 | 作用 |
|---|---|
| `src/services/native/platform.ts` | 判断是否在原生壳内；导出 ZIP 在安卓端改用 Filesystem + Share |
| `src/app/useNativeShell.ts` | 接管安卓返回键（关弹层 → 回列表 → 退 App），状态栏图标跟随主题 |
| `src/app/polyfills.ts` | 9 个运行时 API 垫片（`globalThis` / `Object.hasOwn` / `Array.at` / `structuredClone` 等） |
| `src/app/safeArea.ts` | 横屏左右安全边距的取大逻辑（纯函数） |
| `src/services/imageFormat.ts` | 读文件头判断图片真实格式（纯函数） |
| `src/services/api/timeout.ts` | 三类超时、有限重试、流式空闲检测 |
| `src/check.html` | 兼容性自检页（单独一份老语法的样式，因为它要跑在更老的机器上） |
| `scripts/build.mjs` | 跨平台构建脚本（官方的是 `rm -rf`，Windows 上不可用） |
| `capacitor.config.ts` | Capacitor 配置 |

### 修改

| 文件 | 改动 |
|---|---|
| `src/index.html` | viewport 加 `viewport-fit=cover`；内联一段纯 ES5 的启动兜底脚本 |
| `rspack.config.ts` | 构建目标 `chrome >= 70`（上游是 105）；loader 规则补 `.mjs`（否则 mermaid 不会被转译） |
| `src/app/App.module.css` | 根容器加 `box-sizing` 与安全区 padding |
| `src/app/App.tsx` | 挂载 `useNativeShell`；转回桌面布局时不自动展开侧栏 |
| `src/app/viewport.ts` | `isMobile` 判据加高度与宽高比 |
| `src/components/settings/SettingsDialog.tsx` | 导出逻辑分流到原生实现 |
| `android/app/src/main/AndroidManifest.xml` | 加 `RECORD_AUDIO` 权限 |
| `android/build.gradle` | Maven 换阿里云镜像（国内直连 Central 会失败） |
| `android/gradle.properties` | 允许含非 ASCII 字符的项目路径 |

### 工具

`tools/` 下有开发期与验收脚本：

| 脚本 | 用途 |
|---|---|
| `serve.mjs` | 本地静态服务器，用来在浏览器里验证 dist |
| `shot.mjs` | 用 Chrome DevTools 协议做精确设备尺寸截图 |
| `webview-eval.mjs` | 通过 adb 连到真机/模拟器里的 WebView 执行 JS，用于自动化断言 |
| `scan-compat.mjs` | 扫产物里裸用的新特性（视口单位、`:has()`、新 API 等），是 `init.ps1` 的第六道门 |
| `measure-layout.mjs` | 10 档固定尺寸量布局并断言，防适配回归 |
| `verify-boot-guard.mjs` | 真开 Chrome 验启动兜底页（7 个场景、27 条断言） |

---

## 已知问题

| 问题 | 说明 |
|---|---|
| 启动图 / 桌面图标是 Capacitor 默认素材 | 未替换 |
| 状态栏底色跟随系统而非 App 主题 | WebView 内核 < 140 时做不到真全屏；内核 ≥ 140 的设备会自动正确 |
| **图片只支持 JPG / PNG / WebP / GIF** | 服务端只认这几种。BMP、TIFF、SVG 等在选择时会被拦下并说明原因，不会等到发送才失败 |
| **`.raw` 文件不能再作为附件** | 它同时是相机 RAW 格式和传感器数据格式，为避免前者被误发而整体移除 |
| 键盘弹出后的布局未经真机验证 | — |
| 语音输入未经真机验证 | 权限已声明，模拟器无麦克风 |
| **Chrome 70–83 的真实设备未验证** | 构建目标 70、支持承诺 84（见 ARCHITECTURE 决策 21）。本机只测过 Chrome 157；老内核上「能跑」以及「错位到什么程度」都是推理，不是实测 |
| 没有应用内自动更新 | 设置里能看版本、能「检查更新」并跳到下载页（**仅 APK**，还会给一条「复制链接」的退路），但不做应用内下载安装——那要多申请安装权限，还需要一个国内可达的下载源 |
| 这是 debug 构建 | debug 包默认开放 WebView 调试口，正式分发请打 release。**签名沿用固定的 keystore（已备份）**：不要换 keystore，换了已安装的用户就无法覆盖升级，只能卸载重装（对话会丢） |

---

## 隐私与安全

- **API Key 只存在本机**（WebView 的 localStorage，属于 App 私有目录，其他 App 读不到）。
- **对话数据不上传到任何第三方服务器**，只在你发消息时提交给 DeepSeek API 本身。
- **卸载 App 会清空全部本地对话**，重要内容请先在设置里导出 ZIP。
- 不要把自己填了 Key 的设备交给别人；不要在 root 过的设备上使用。
- 若要分发给他人：**让每个人填自己的 Key**，绝不要把 Key 打包进 APK，也不要自建后端替所有人转发。

## 许可

界面与主要代码来自 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo)，MIT 许可，见 `LICENSE`。

「DeepSeek」名称与标识归其所有者所有。本仓库是个人项目，与 DeepSeek 官方无关。若要公开发布，请更换应用名称与图标。
