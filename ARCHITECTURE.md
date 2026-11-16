# 架构与设计决策

本文件不是目录说明（那在 `AGENTS.md`），只记**为什么这样，而不是那样**。每条决策编了号，后续引用用「决策 N」。决策一旦被推翻，不删除，改标为「已废」并写清推翻理由——保留被否掉的选项，是下一轮能避免重走老路的原因。

## 形态：三层拼装，不是重写

```
官方 chat-demo 前端（React 18 + rspack，MIT，原样搬运）
        ↓ 套壳，不改 UI 实现
Capacitor 8（把 Web 产物装进安卓 WebView，提供原生能力桥）
        ↓ 打包
APK（使用者拿自己的 API Key 运行）
```

分层的目的：每一层都能被单独替换。换壳不动 UI，换 UI 不动壳。

## 决策 1：用官方开源的 chat-demo 前端，不自己写界面

**取舍**：自己写 UI 能完全按自己的设计来，但要复刻对话、思考过程、搜索引用、Markdown 公式、语音这些细节，工作量在月级别，且会持续落后于官方。

**选择**：直接搬官方前端。理由写在 README 里——界面「不是仿的，是官方自己开源的」。

**代价**：受上游组件体系约束。改界面要顺着它的 `components/` 分层走，不能另起一套；上游改结构时合入成本高。目前项目接受这个代价，因为目标是「把官方体验搬到安卓」，不是「做一个不同的客户端」。

**什么时候该推翻**：当需求变成「界面要跟官方明显不同」时，这套约束就从资产变成负债。

## 决策 2：用 Capacitor 8，不用纯 WebView 壳或 React Native

**取舍**：纯 WebView 壳最轻，但拿不到原生文件、分享、状态栏、启动屏这些能力；React Native 要重写全部 UI。

**选择**：Capacitor。它把现有 Web 产物直接装进 WebView，同时提供 `@capacitor/filesystem`、`share`、`status-bar`、`splash-screen`、`app` 等原生桥，且不必重写 UI。

**代价**：`android/` 下是生成工程，`capacitor sync` 会覆盖手改内容（见决策 8）。原生能力受 Capacitor 插件生态约束，冷门能力得自己写插件。

## 决策 3：构建入口自己写 `scripts/build.mjs`

**取舍**：上游 `package.json` 的构建命令是 `rm -rf dist && NODE_ENV=production rspack build`。

**问题**：`rm -rf` 是 Unix 语法，在 Windows 的 cmd 下直接失败。而本项目的主开发环境是 Windows。

**选择**：用 Node 写 `scripts/build.mjs`，做同样的事（清 dist → 以 NODE_ENV=production 调 rspack），跨平台一致。`package.json` 的 `build` 指向它。

**代价**：多维护一个脚本；上游构建流程变化时要手动同步。

## 决策 4：SSE 解析自己实现，按 WHATWG 规范

来源：`src/services/api/sse.ts`。

**取舍**：浏览器自带 `EventSource`，但它只能发 GET、不能带请求体、不能自定义请求头——而 DeepSeek 的流式接口是 POST + JSON body。

**选择**：自己按 [WHATWG 规范](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation)实现解码器，配 `TextDecoder(stream: true)` 处理跨片的多字节字符。

**关键边界**（也是 `test/sse.test.ts` 守的那几条）：
- 结尾孤立的 `\r` 可能是 CRLF 的前半，必须等下一片，不能当完整换行消费；
- 一个事件可能被切成任意多片到达；
- 流末尾未以空行结尾的事件按规范**丢弃**，不补发；
- `lastEventId` 跨事件保留。

**代价**：规范细节要自己守，所以有 11 条测试盯着。换第三方库能省代码，但会引入依赖并失去对中止行为的控制。

## 决策 5：未知事件静默丢弃，不报错

来源：`src/services/api/parseEvent.ts`。

**问题**：服务端会持续加新的事件类型（新的工具、新的片段类型）。客户端如果对未知类型抛错，官方一上线新功能，老版本 App 就整段对话失败。

**选择**：`readMessageEvent` 只校验「消费这段内容所需的最小字段集」，未知类型一律返回 `null` 静默跳过。校验也只做字段级降级——例如 `usage` 不合法时降级为 `undefined`，但事件本身保留。

**代价**：真实的服务端错误会被静默吞掉一部分，排查时要靠日志而不是异常。这是刻意选的：**宁可少显示，不可整段崩**。

**边界**：这条不等于「所有错误都吞」。网络错误、鉴权错误走 `src/services/api/errors.ts` 那条路，照常抛。

## 决策 6：测试用 Node 原生类型剥离，不引入 vitest / tsx

**取舍**：
- vitest/tsx 能直接跑 TS 并处理 `./x.js → x.ts` 的路径映射，代价是新增一条依赖链与配置；
- 本项目源码的 import 写 `.js` 后缀（NodeNext 风格），被 rspack 的 `extensionAlias` 映射到 `.ts`。

**选择**：用 Node 24 自带的类型剥离，`node --test` 直跑 `test/*.test.ts`。零新依赖，零额外配置。

**关键约束**：Node 的类型剥离**不重写 import 路径**，剥离后若还有运行时 `import`，`./x.js` 会解析失败。所以：

1. 能测的只有「无运行时 import」或「只有 `import type`」的模块（`import type` 剥离后整条消失）；
2. 带依赖的模块（如 `services/chat/` 下大部分）要测，**先把纯逻辑抽成独立函数**，不是为测试引入打包器。

**代价**：覆盖面受限，见 `claude-progress.md` 的已知风险。对纯函数这个层次，这个代价换来的是一条 `pnpm test` 就能跑、不用构建的测试链路——在「项目要做大」的前提下，这比覆盖率数字重要。

**补充**：`--experimental-test-isolation=none` 让测试在同一进程跑。纯函数测试不需要进程隔离，这样启动更快，也避免部分环境禁止子进程时整条测试链路不可用。

## 决策 7：测试只覆盖纯函数，UI 不写渲染测试

**取舍**：渲染测试能守住组件行为，但要引入 jsdom/测试库、要维护快照、组件重构时大面积返工。

**选择**：UI 的正误由「构建通过 + 无头截图（`tools/shot.mjs`）+ 真机点一遍（`tools/webview-eval.mjs`）」判定。

**代价**：UI 回归靠人眼，不能自动拦。因此 `AGENTS.md` 的完成定义里写死：**涉及界面的改动必须附截图或真机取证**——用证据要求替代测试要求。

## 决策 8：`android/` 是生成物，不手改

`android/` 由 `capacitor sync` 生成。直接改里面的文件，下次 sync 就被覆盖，且没人知道改过什么。

**规则**：要改配置改 `capacitor.config.ts`；要改原生代码，改完必须在本文件登记一条决策，写清「改了哪个文件、为什么、sync 会不会冲掉、怎么保住」。

## 决策 9：中英词表以 `zh.ts` 为基准，用 `satisfies` 强制对齐

来源：`src/i18n/`。

**问题**：`en.ts` 缺 key 时，英文界面会显示 `undefined` 或原始 key 名，且 tsc 默认不管。

**选择**：`zh.ts` 是基准（`TranslationKey = keyof typeof zh`），`en.ts` 末尾写 `satisfies Record<keyof typeof zh, string>`。这样漏一个 key，`pnpm type` 直接红。

**`satisfies` 管不到的两件事**，由 `test/i18n.test.ts` 守：
- **占位符一致性**：`'录音 {seconds} 秒'` 译成 `'Recording'`（漏掉占位符）→ 运行时少显示数字，tsc 完全不管；
- **空翻译**：值译成空字符串，类型仍是 `string`。

**代价**：新增语言时要同时满足 key 集合与占位符两条约束，翻译工作量大一点。这是对的。

## 决策 10：产物不进版本控制

`dist/`、`release/`、`screenshots/` 都是**可从源码重建**的东西：

- `dist/` 一次构建就有，带 contenthash，进 git 只会制造无意义的 diff；
- `release/` 的 APK 6.5MB，每打一次包就把仓库撑大一倍；
- `screenshots/` 是验收证据，属于每轮的临时产物。

**规则**：产物一律 gitignore。验收需要的截图，放在交付目录或 issue 里，不进仓库。

**未完成**：历史上它们已被跟踪，`git rm --cached` 尚未执行（见 `feature_list.json` 的 `products-001`）。撤出索引后历史里的 blob 仍在，真要瘦身得另做 `filter-repo`，那是独立决策。

## 决策 11：CI 只跑能给出明确对错的门，不跑格式与打包

**取舍**：
- 把 `oxfmt --check` 放进 CI，能让格式统一；但它会把「这行没格式化」升级成「CI 红、不能合并」。对单人项目，这是拿最不值钱的约束去拦最值钱的改动。
- 把 APK 打包放进 CI，能直接产出安装包；但要装 Android SDK、配签名、管密钥，属发布流程而非代码门禁。

**选择**：CI 只跑五道能明确判对错的门——install（可复现）、type、lint、test、build + 产物检查。格式留给人自己 `pnpm format`；APK 留在本机或日后的发布流程。

**代价**：格式会飘，靠自律。真要统一，正确做法是加一个只在 PR 上跑、且**不阻断合并**的检查，而不是把它塞进主链路。

**另一条边界**：CI 固定 Node 24 + pnpm 11，与本地一致，不做多版本矩阵。多版本矩阵验的是「能兼容多少环境」，而这里只有一个开发者、一个运行环境。等真有人提兼容需求再加。

**为什么值得有**：本地 `./init.ps1` 是自觉——换台机器、隔两周、别人提 PR，都可能忘跑。CI 是同一套门禁的强制执行版本。两边共用同一份 `package.json` 脚本，不另写一套，避免「本地绿、CI 红」这种最恶心的情况。

## 尚未决策（悬空）

- **项目命名**：目录 `DeepSeek 复刻APP` / remote `DeepSeek-APP-Replica` / `package.json` name `chat-demo` / README 标题 `DeepSeek APP Replica`。四处不统一，`package.json` 未改。改不改、改成什么，待定。
- **APK 分发方式**：目前 debug 包手动拷到交付目录。是否要接 CI 出新版、是否上架，未定。
- **`services/chat/` 的测试策略**：那块逻辑最重（本地库、分支、导入导出），但全是带运行时依赖的模块。是抽纯函数、还是破例引入打包器，未定。
