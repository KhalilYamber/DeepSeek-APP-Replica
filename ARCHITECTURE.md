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

## 决策 12：导入的默认语义是「合并」，不是「覆盖」

来源：`src/services/chat/db.ts` 的 `commitStaging(mode)`、`src/components/settings/SettingsDialog.tsx` 的确认弹窗。

**取舍**：上游把导入写成「覆盖全部本地对话」。这在 demo 里成立——用户只有几条测试数据，覆盖是幂等的。到了真人手上，一次误触就清空几百条对话，而且不可撤销。

**选择**：默认合并。同 ID 的会话视为同一份对话，**跳过而不是覆盖**（重复导入同一份归档不该把本地版本改写成归档里的旧版本）。覆盖保留为确认弹窗里单独的红色按钮。

**代价**：合并后列表要重新读一次存储（`db.loadSessionSummaries()`），不能直接用本次写入的摘要；`activeId` 与详情缓存也要按「没被删过」处理，不能像覆盖那样清空。

**边界**：合并只按会话 ID 判断重复。同一个会话如果本地改过标题、归档里是旧标题，保留本地版本——这是刻意的，导入不应该回退用户之后的修改。

**什么时候该推翻**：将来若要做「恢复到某个备份时间点」，那才是覆盖语义的正当场景，且应该做成独立的「恢复」入口，而不是导入对话框里的一个按钮。

## 决策 13：文件选择用「透明覆盖的 input」，不用「隐藏 input + 程序化 click」

来源：`src/components/settings/SettingsDialog.tsx` 的 `.uploadArea` + `.uploadInput`。

**取舍**：`<input type="file" hidden>` 加 `inputRef.current.click()` 在桌面 Chrome 上稳定，但这一跳要跨 JS → WebView → Capacitor 原生 `onShowFileChooser` → 系统选择器四层，其中任何一层静默失败，用户看到的就是「点了没反应」。

**选择**：把 input 绝对定位铺满按钮、`opacity: 0`，用户点到的是 **input 本身**，不依赖脚本触发。按钮不再绑定 onClick。

**代价**：按钮的可点区域等于 input 的区域，布局要保证二者尺寸一致（`.uploadArea` 相对定位、`.uploadInput` 铺满）；`disabled` 要同时传给按钮和 input。

**另一条同源决定**：`accept` 留空。收窄的 MIME 白名单（`.zip,application/zip,application/x-zip-compressed`）会让系统把 ZIP 报成 `application/octet-stream` 的文件在选择器里变成不可选——文件管理器差异不是我们能控制的。格式判断交给 `isZipFile()` 与 manifest 校验，它们本来就在。

**边界**：这条解决的是「能不能打开选择器」。如果某台设备的 WebView 根本不实现 `onShowFileChooser`（Capacitor 只要求 Chrome 60），这条也不够，得换原生文件选择插件。

## 决策 14：宽容解析——单条会话损坏不拖累整包

来源：`src/services/chat/history/importArchive.ts`。

**取舍**：原实现是「归档必须完整」：任何一条会话 JSON 不合规、ZIP 里有未识别条目、索引与导入数对不上，都整包失败。理由是格式自洽，对上游自测很干净。

**选择**：逐条 try/catch。单条会话解析失败只计入 `failed` 并继续；manifest 之前的杂项条目（目录、macOS 资源分叉、重新打包的占位文件）跳过；索引降为交叉核对，不参与成败判定。**结构性错误仍然整体失败**：不是 ZIP、manifest 缺失、版本号不是 3。

**代价**：UI 必须能表达「导入 12 个，跳过 3 个」，否则「部分成功」会被读成「失败」。`result.ts` 专门负责这个映射，避免文案散在组件里。

**边界**：宽容不等于什么都吃。版本号不认识时仍然拒绝——字段结构可能整体变了，硬解析会产出坏数据，比失败更糟。

## 决策 15：上游 demo 不是正确答案

来源：2026-11-16 用户明确指示——「可以不用严格遵守 demo 的，记住了。demo 也可能是错的。」

**含义**：评估这个仓库的行为时，以「产品该有的行为」为准，不以「上游这么写」为准。上游是我们继承的起点，不是验收标准。

**已经据此推翻的**：覆盖语义（决策 12）、整包拒绝的校验（决策 14）、把 6 个具体错误码压成一句猜测的错误处理。

**边界**：这条只管行为设计，不管版权与许可。`LICENSE` 必须继续随产物分发，上游文件头不删（见 AGENTS.md 红线）。

**为什么值得写下来**：否则下一个 agent 会因为「上游是这么写的」而把上面三条决策当成越界改动。

## 尚未决策（悬空）

- **项目命名**：目录 `DeepSeek 复刻APP` / remote `DeepSeek-APP-Replica` / `package.json` name `chat-demo` / README 标题 `DeepSeek APP Replica`。四处不统一，`package.json` 未改。改不改、改成什么，待定。
- **APK 分发方式**：目前 debug 包手动拷到交付目录。是否要接 CI 出新版、是否上架，未定。
- **`services/chat/` 的测试策略**：那块逻辑最重（本地库、分支、导入导出），但全是带运行时依赖的模块。已按决策 6 的路子抽出 `history/result.ts` 与 `test/import-result.test.ts`；存储层（`db.ts` 的 merge 分支）与解析层（`importArchive` 的宽容分支）仍未覆盖，要么继续抽纯函数，要么破例引入打包器，未定。
