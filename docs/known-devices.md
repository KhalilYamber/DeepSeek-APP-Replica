# 已知会出毛病的设备

给未来的自己和 agent 看的。**不是**面向用户的说明文档，不需要写得好看，只需要写得准。

这里记的是具体案例：某类设备（或某个内核版本、某台具体机器）上有某个症状，根因是什么、现在什么状态、怎么验的。「移动端兼容性很重要」这种话不收。

## 清单

| 设备或内核 | 症状 | 根因 | 现状 | 验证方式 |
| --- | --- | --- | --- | --- |
| Android 12 出厂 / Chromium 93 级别 WebView（反馈来自 OPPO A58x） | 装得上、开得开，但打开就是白屏（深色 body 露出来时看起来是黑屏），界面完全不出现 | 根容器用 `height: var(--app-viewport-height, 100dvh)`；`dvh` 需 Chrome 108+，内核不识别时 `var()` 兜底一并失效，整条 `height` 被丢弃，根容器塌成 0 高度 | 已改为「先 `100vh` 后 `100dvh`」双声明，并把 `toSorted` / `toReversed`（需 Chrome 110）改成复制后 `sort` / `reverse`。**未真机确认**——`feature_list.json` 里 `compat-001` 标 `inferred` | 真机装 debug 包打开看界面是否出现；仍白屏就取 logcat，区分是这条 CSS 路径，还是另有 JS 报错导致 `.frame` 根本没创建（后者本修复不覆盖） |
| 本机 Chrome 157（Windows，`tools/shot.mjs` 用的那台） | `node tools/shot.mjs` 起不来，CDP 连不上 DevTools，出不了图 | 该版本上 `--headless=new` 起不来 DevTools | 已改 `--headless`；顺带把 `--user-data-dir` 由相对路径改绝对路径（Chrome 对相对路径处理不稳）。**已确认**：改后截图正常产出（2026-11-16） | 跑一次 `node tools/shot.mjs <url> <out.png>`，能落下 png 即为好 |
| Chromium 93 级别 WebView（`structuredClone` 需 Chrome 98+） | 打开**带 Mermaid 图**的对话时图表区报错、图不出来；纯文字对话不受影响 | mermaid 的 5 个异步 chunk 里用了 `structuredClone`（共 9 处：`3909` ×1、`4138` ×3、`4471` ×1、`5172` ×2、`8821` ×2）。这是 `node_modules` 被 bundle 进来的，源码层没有。老内核上是 `undefined`，调用即 TypeError | 已加 `src/app/polyfills.ts`（JSON 深拷贝兜底，不处理 Date/Map/Set/循环引用——够用是因为 mermaid 只克隆纯配置对象），在 `src/main.tsx` 最早 import。`tools/scan-compat.mjs` 检查兜底痕迹是否在入口 chunk `main.*.js` 里，在就把这类调用降级为 info。**未真机确认** | 真机装 APK 打开一个带流程图或时序图的对话，看图能否渲染；或 `node tools/scan-compat.mjs --json` 看 `structuredClone` 是否仍落在 info 而非 error |

相关背景（不是设备本身的毛病，但决定了它为什么能装上）：Capacitor 8 对 Android WebView 的默认最低要求是 Chrome 60，远低于上面这些特性所需的 108 / 110。所以旧内核的设备**既不拦也不提示**，装得上、打得开，然后白屏。

## 尚未验证的风险（不是已知毛病，是还没撞到或还没验的）

| 风险 | 为什么要留意 | 现在什么状态 | 怎么降风险 |
| --- | --- | --- | --- |
| 软键盘弹出会不会把布局视口压到 480 以下，导致**打字途中**从桌面布局切成移动端 | 矮屏规则用的是 `(max-height: 479px)`。若 Android WebView 在 `adjustResize` 下真的把**布局视口**压矮（而不是只改 `visualViewport`），那平板横屏打字时会中途切一次布局 | 只证明了「布局视口一旦低于 480 就会切移动端」（1280×450 实测），**没验过键盘是否会真把布局视口压矮**——本机无软键盘 | 真机上在 768 宽以上横屏点输入框，看布局跳不跳。跳的话把阈值调小（如 `420px`），或改用 `min-height` 反向写法 |
| `@container` 换成类名后，带附件消息的缩略图在窄容器下的表现 | 原 `@container (max-width: 63px)` 改成了 `.reasonCompact` 类名，触发条件改为「与文档混排时缩略图为 64px」。构造上等价，但没发过一条真实消息看画面 | 构造等价 + 产物核对，**没有真发消息截图** | 发一条带「失败附件 + 文档」的消息，看缩略图是否仍按预期收窄 |
| Chromium 93 上的实际表现 | 本轮所有修复的**目标环境**就是它，但手上没有这个内核的设备 | 全部 `inferred`。产物形态 + 同引擎实测 + 规范推演，不等同真机 | 找一台 Android 12 出厂的机器装 debug 包，按下面「真机验证的操作步骤」走一遍 |

## 怎么往里加一条

**什么情况该记**：凡是「某类设备上有某症状」，就记一条。修好了也留着——下一个人（或下一个 agent）会撞同一个坑，而修好的那一行正好是他要抄的答案。推翻过的也留着，在「现状」里写清楚为什么推翻。

**每列怎么填**：

- **设备或内核**：精确到能复现。出厂 Android 版本 + WebView 主版本（内核版本比机型名有用，机型名只用来定位是谁报的），或者写清是本机哪台机器上的哪个浏览器版本。
- **症状**：写看到的现象，不写你的猜测。「打开白屏」「输入框被键盘遮住」是症状；「dvh 兼容性问题」是猜测，它属于下一列。
- **根因**：定位到哪写到哪。没定位就写「未定位」，不许为了填满而编一个看起来合理的解释。
- **现状**：改了没有、改成什么、有没有验过。分了 `verified` / `inferred` 的，就照 `feature_list.json` 里的状态写。
- **验证方式**：别人拿到一样东西，怎么自己复现或确认你说的这句。

**必须写「有没有真机确认」**：这一列不许省。要么写「已确认」并附日期与设备/版本，要么写「未真机确认，仅推理/等价环境实测」。**不许把推测写成结论**——同一条规矩写在 `AGENTS.md` 的「完成定义」里，机器执行的口在 `feature_list.json` 的 `rules.passing_requires_device_evidence`。

**三处要同步**：本表加行时，`feature_list.json` 对应条目的 status（`verified` / `inferred`）与 `claude-progress.md` 的会话记录一起改，别只改一处。

## 真机验证的操作步骤

### 1. 打 APK

在仓库根依次执行：

```powershell
pnpm build
pnpm exec cap sync android
cd android; .\gradlew.bat assembleDebug
```

产物：`android\app\build\outputs\apk\debug\app-debug.apk`（AGP 的 debug 默认输出目录；换过签名或输出配置就以实际输出为准）。

### 2. 装到手机

手机开 USB 调试，用 adb 装；或把 APK 拷进手机直接点安装。装新包前确认装的是**刚打出来的那个**（同版本号覆盖安装不会自动清数据，遇到「改了没效果」先 `adb install -r` 重装一次再判断）。

### 3. 装上去之后看什么

逐条走，每条都要留下「看到了什么」，不是「应该没问题」：

1. **根容器有没有塌**：打开应用，界面是否出现。要进一步取证，用 `node tools/webview-eval.mjs "<表达式>"` 在真机 WebView 里读根容器高度（`.frame`）与 `window.innerHeight`——两者相等说明容器撑满了视口，差距很大说明塌了。这条直接对应上面 Chromium 93 那一行。
2. **侧栏出现方式**：窄屏下点开侧栏（会话抽屉）——是覆盖在内容上，还是把内容挤走；关掉后是否回到原样、有没有留下错位。
3. **键盘弹出后输入框位置**：点输入框弹出软键盘——输入框有没有被顶到键盘上方，还是被键盘遮住；页面是否被整体顶跳、松手后是否复位。
4. **转屏后草稿是否还在**：输入半句话 → 转屏 → 草稿在不在、光标位置是否还合理。

还没被真机碰过的两条（来自 `import-001`，一起验掉更省事）：

- 点「上传」时，系统文件选择器是否真的弹出（桌面 Chrome 里验不出系统选择器）。
- Android 上「合并导入」之后，会话列表是否真的刷新出新会话。

### 4. 记结果

看到的写进本表「现状」列；结论写进 `feature_list.json` 对应条目的 `status`（`verified` 还是 `inferred`）与 notes；会话归纳给 `claude-progress.md`。截图或 logcat 落 `screenshots/`（该目录不进版本控制）。
