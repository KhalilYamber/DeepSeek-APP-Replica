# 变更日志

本项目的显著变更记在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [未发布]

### 新增 — 工程骨架

- `AGENTS.md`：仓库布局、命令、红线、质量约定、**会话工作循环**（开工 / 工作规则 / 完成定义 / 收尾）、提交纪律
- `claude-progress.md`：跨会话进度日志，按 Session 编号，记验证与遗留风险
- `feature_list.json`：功能清单，三条硬规则（单活跃功能 / 完成必须有证据 / 不许跳过验证）
- `ARCHITECTURE.md`：10 条编号设计决策（为什么用官方前端、为什么 Capacitor、为什么自写构建与 SSE、为什么测试用 Node 原生类型剥离…）与 3 条悬空项
- `init.ps1`：开工基线，一次跑完依赖 + 五道门（type / lint / test / build / artifacts）
- `test/`：30 条单元测试
  - `format.test.ts` — 日期格式化与月键的边界
  - `sse.test.ts` — SSE 解码跨片、CRLF 跨片、多行 data、注释、id 跨事件保留
  - `parse-event.test.ts` — 流事件畸形输入丢弃与合法透传
  - `i18n.test.ts` — 中英 key 集合、占位符一致、无空翻译

### 变更

- `.gitignore`：补 `release/`、`screenshots/` 与安卓构建中间物
- `.github/workflows/ci.yml`：push 到 `main` / PR / 手动触发时跑 install → type → lint → test → build → 产物检查

### 已知问题

- `release/` 与 `screenshots/` **仍被 git 跟踪**（APK 6.5MB），`.gitignore` 已写但 `git rm --cached` 尚未执行
- `test/_probe.test.ts` 名字带下划线是历史原因：原为环境探测文件，因搭建环境不允许删除而就地改写为框架自检（钉住 Node >= 22 这个测试链路前提）
- `pnpm build` 与 `oxfmt --check` 未在搭骨架的会话环境里验证通过（该环境禁止删目录与子进程），需在本机跑一次确认

## [0.1.1] - 2026-11-16

### 新增

- 初始版本：官方开源的 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo) 前端（MIT）套 Capacitor 8 安卓壳，可安装在自己手机上独立运行
- 模型调用走使用者自己的 DeepSeek API 账户（按 token 计费），不提供免费额度
- 深度思考、联网搜索、文件上传、语音输入、多会话
- 主题（深/浅）与语言（中/英）设置
- 历史会话本地存储与导入导出（ZIP，`export_format_version: 3`）
