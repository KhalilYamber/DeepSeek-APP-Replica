// 探针：长会话滚动的流畅度标尺——帧间隔与主线程长任务。
// 用法：node _probe/scroll-perf.mjs（读现有 dist/，不重建；数字写进 docs/perf-baseline.md）
//
// 造一条 600 条消息的会话（正文带 GFM 表格、代码块、行内与块级公式），
// 用 rAF 驱动两轮连续滚动：顶部→底部、底部→顶部，每帧采一个帧间隔。
// 输出 P50 / P95 / 最大帧间隔，以及 >50ms 长任务的次数、总时长与滚动阶段分布。
// 参数（都可环境变量覆盖，改前改后必须用同一组值）：
//   PROBE_MESSAGES=600  PROBE_WIDTH=390  PROBE_HEIGHT=844  PROBE_STEP_DIVISOR=8
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

/**
 * 记录这次到底测的是哪一份产物。
 * dist/ 不进版本控制、谁都能重建，光靠 package.json 的版本号认不出产物是不是同一份——
 * 2026-11-21 就出现过「探针跑到一半别人重建了 dist」，数字差点被当成同一版的基线。
 */
const readArtifact = async () => {
  let version = '未知'
  try {
    version = JSON.parse(await readFile(join(REPO, 'package.json'), 'utf8')).version
  } catch {}
  const times = []
  for (const target of ['dist/index.html', 'dist/static']) {
    try {
      times.push((await stat(join(REPO, target))).mtime)
    } catch {}
  }
  times.sort((a, b) => b - a)
  const builtAt = times[0]
    ? times[0].toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
    : '未知'
  return { version, builtAt }
}

const CHROME = process.env.PROBE_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = Number(process.env.PROBE_DEVTOOLS_PORT ?? 9581)
const WEB_PORT = Number(process.env.PROBE_WEB_PORT ?? 8143)
const PROFILE = join(tmpdir(), 'scroll-perf-profile')
const WIDTH = Number(process.env.PROBE_WIDTH ?? 390)
const HEIGHT = Number(process.env.PROBE_HEIGHT ?? 844)
/** 会话里的消息条数：600 条足够走完 content-visibility 的「未测量 → 已测量」全流程 */
const MESSAGES = Number(process.env.PROBE_MESSAGES ?? 600)
/** 每帧滚动 clientHeight / 这个数：8 → 约 105 px/帧（快速滑动的手感） */
const STEP_DIVISOR = Number(process.env.PROBE_STEP_DIVISOR ?? 8)
const SESSION_ID = 'probe-scroll-perf'
const TITLE = '流畅度基线会话'
const DOC = join(REPO, 'docs', 'perf-baseline.md')

/** 代码块围栏用字符串拼，避免把探针自己的模板字面量打断 */
const FENCE = '```'

/** 每段回答都带同样几类工作：标题、段落、行内公式、列表、表格、代码块、块级公式 */
const answerText = (index) => {
  const n = index + 1
  return [
    `## 第 ${n} 段：最小二乘的数值表现`,
    '',
    `这一段的主题是拟合残差与误差传递。参数估计写成 $\\hat\\theta = (X^{T}X)^{-1}X^{T}y$ 之后，协方差矩阵是`,
    '',
    '$$',
    '\\mathrm{Cov}(\\hat\\theta) = \\sigma^{2}(X^{T}X)^{-1}',
    '$$',
    '',
    `- 条件数 $\\kappa(X^{T}X)$ 决定数值稳定性；第 ${n} 组样本下它随样本量增长而变大。`,
    '- 加权最小二乘把对角线换成 $W$，等价于对每行乘 $\\sqrt{w_i}$。',
    '- **结论**：先中心化再求解，可以把条件数压下来一个量级。',
    '',
    '| 统计量 | 符号 | 定义 |',
    '| --- | --- | --- |',
    '| 残差平方和 | $RSS$ | $\\sum_{i}(y_i-\\hat y_i)^2$ |',
    '| 自由度 | $df$ | $n-p$ |',
    '| 判定系数 | $R^2$ | $1-RSS/TSS$ |',
    '',
    `${FENCE}js`,
    'function fit(xs, ys) {',
    '  let num = 0',
    '  let den = 0',
    '  for (let i = 0; i < xs.length; i++) {',
    '    num += xs[i] * ys[i]',
    '    den += xs[i] * xs[i]',
    '  }',
    '  return den === 0 ? 0 : num / den',
    '}',
    FENCE,
    '',
    '行内公式再来两个 $O(n^{2})$ 与 $\\frac{\\partial RSS}{\\partial \\theta}$，保证每段都有公式与代码块的工作量。',
  ].join('\n')
}

const buildMessages = () => {
  const now = Date.now()
  const messages = []
  for (let i = 0; i < MESSAGES / 2; i++) {
    messages.push({
      id: `perf-u${i}`,
      role: 'user',
      content: `探针问题 ${i + 1}：把第 ${i + 1} 段的最小二乘推导复核一遍，重点看条件数与加权形式。`,
      files: [],
      createdAt: now - (MESSAGES - i * 2) * 3000,
    })
    messages.push({
      id: `perf-a${i}`,
      role: 'assistant',
      createdAt: now - (MESSAGES - i * 2) * 3000 + 1000,
      model: 'deepseek-flash',
      thinking: false,
      prefix: true,
      status: 'done',
      blocks: [{ type: 'text', text: answerText(i) }],
    })
  }
  return messages
}

/**
 * 塞会话：不带版本号打开，用应用自己定的库版本。
 * 写死版本号会和应用抢版本——dist 的库版本比 src 里的常量新过一次（12 → 13），
 * 那次探针直接 VersionError 挂掉。库还没建表时（应用还没打开过库）就等它升级出来。
 */
const seedExpression = (messages) => `new Promise(function (resolve, reject) {
  var messages = ${JSON.stringify(messages)}
  var attempts = 0
  var open = function () {
    var req = indexedDB.open('chat-demo')
    req.onerror = function () { reject(req.error) }
    req.onsuccess = function () {
      var db = req.result
      db.onversionchange = function () { db.close() }
      if (!db.objectStoreNames.contains('sessions') || !db.objectStoreNames.contains('sessionSummaries')) {
        db.close()
        attempts += 1
        if (attempts > 60) { reject(new Error('等了 15s 还没等到应用建表')); return }
        setTimeout(open, 250)
        return
      }
      var now = Date.now()
      var tx = db.transaction(['sessions', 'sessionSummaries'], 'readwrite')
      tx.objectStore('sessions').put({
        id: ${JSON.stringify(SESSION_ID)},
        title: ${JSON.stringify(TITLE)},
        createdAt: now,
        updatedAt: now,
        messages: messages
      })
      tx.objectStore('sessionSummaries').put({
        id: ${JSON.stringify(SESSION_ID)},
        title: ${JSON.stringify(TITLE)},
        createdAt: now,
        updatedAt: now,
        fileIds: []
      })
      tx.oncomplete = function () { db.close(); resolve(messages.length) }
      tx.onerror = function () { reject(tx.error) }
    }
  }
  open()
})`

/**
 * 页面内测量脚本。
 * 关键约束：每帧只做「读上一帧落到哪儿、写这一帧的目标位置」，不读 scrollHeight，
 * 否则每次读都会强制布局，测出来的数字就不是滚动本身的开销了。
 */
const measureExpression = `(async function () {
  function pickScroller() {
    var best = null
    var nodes = document.getElementsByTagName('*')
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i]
      if (node.scrollHeight <= node.clientHeight + 200) continue
      var style = getComputedStyle(node)
      if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') continue
      if (!best || node.scrollHeight > best.scrollHeight) best = node
    }
    return best
  }

  var el = pickScroller()
  if (!el) return { ok: false, error: 'no-scroller' }

  var longs = []
  var observer = new PerformanceObserver(function (list) {
    var entries = list.getEntries()
    for (var i = 0; i < entries.length; i++) {
      longs.push({ at: entries[i].startTime, duration: entries[i].duration })
    }
  })
  try {
    observer.observe({ entryTypes: ['longtask'] })
  } catch (error) {
    return { ok: false, error: 'longtask-unsupported' }
  }

  var nextFrame = function () {
    return new Promise(function (done) { requestAnimationFrame(done) })
  }
  var idleFrames = async function (count) {
    for (var i = 0; i < count; i++) await nextFrame()
  }

  // 能力门禁：先确认这个环境支持 longtask，再看它报不报。
  var longTaskSupported = false
  try {
    longTaskSupported = PerformanceObserver.supportedEntryTypes.indexOf('longtask') >= 0
  } catch (error) {
    longTaskSupported = false
  }
  if (!longTaskSupported) return { ok: false, error: 'longtask-unsupported' }

  // 诊断（不作门禁）：主线程忙等 150ms，看观察者会不会把它报成 longtask。
  // 实测这一页上没报（原因未查清），而滚动期间的真实长任务能被记到（见下方 rounds），
  // 所以「0 次长任务」的可信度由 supportedEntryTypes 与滚动中的实际记录共同支撑，
  // 不靠这条忙等自检。判定用「忙等前已有的条数」为界：忙等跑在一次 Runtime.evaluate 的任务里，
  // 该任务在这之前就已开始（扫滚动层、装观察者），按 startTime 卡窗口会把自己漏掉。
  var selfCheckBefore = longs.length
  var busyUntil = performance.now() + 150
  while (performance.now() < busyUntil) {
    // 故意占住主线程
  }
  await idleFrames(3)
  var selfCheckSeen = false
  for (var s = selfCheckBefore; s < longs.length; s++) {
    if (longs[s].duration >= 100) selfCheckSeen = true
  }

  var FRAME_CAP = 9000

  var runRound = function (direction) {
    return new Promise(function (resolveRound) {
      var step = Math.max(16, Math.round(el.clientHeight / ${STEP_DIVISOR}))
      el.scrollTop = direction === 'down' ? 0 : el.scrollHeight
      // 程序化改 scrollTop 不一定派发 scroll 事件；补一次，让应用的跟随状态先归位
      el.dispatchEvent(new Event('scroll'))
      var startTop = el.scrollTop
      var scrollHeightStart = el.scrollHeight
      var frames = []
      var samples = []
      var lastTime = 0
      var startedAt = 0
      var stuck = 0

      var finish = function (reason) {
        resolveRound({
          direction: direction,
          step: step,
          frames: frames,
          samples: samples,
          startedAt: startedAt,
          endedAt: lastTime,
          startTop: startTop,
          finalTop: el.scrollTop,
          scrollHeightStart: scrollHeightStart,
          scrollHeightEnd: el.scrollHeight,
          stopReason: reason,
          reachedEnd:
            direction === 'down'
              ? el.scrollTop + el.clientHeight >= el.scrollHeight - 2
              : el.scrollTop <= 1
        })
      }

      // 不用「总帧数」当出口：列表高度在滚动中会变（content-visibility 把估值换成实测），
      // 固定帧数会提前收工，把没滚到的那截当成已滚完。改用「位置不再变化」当出口。
      var tick = function (time) {
        if (lastTime === 0) {
          lastTime = time
          startedAt = time
          requestAnimationFrame(tick)
          return
        }
        var top = el.scrollTop
        frames.push(time - lastTime)
        samples.push({ at: time, top: top })
        lastTime = time
        var previous = samples.length > 1 ? samples[samples.length - 2].top : startTop
        stuck = top === previous ? stuck + 1 : 0
        if (stuck >= 2) {
          finish('end')
          return
        }
        if (frames.length >= FRAME_CAP) {
          finish('cap')
          return
        }
        el.scrollTop = top + (direction === 'down' ? step : -step)
        requestAnimationFrame(tick)
      }

      requestAnimationFrame(tick)
    })
  }

  await idleFrames(4)
  var down = await runRound('down')
  await idleFrames(2)
  var up = await runRound('up')
  await idleFrames(3)
  observer.disconnect()

  var summarize = function (round) {
    var count = 0
    var totalMs = 0
    var maxMs = 0
    var quarters = [0, 0, 0, 0]
    var quarterMs = [0, 0, 0, 0]
    var span = round.finalTop - round.startTop
    for (var i = 0; i < longs.length; i++) {
      var entry = longs[i]
      if (entry.at < round.startedAt || entry.at > round.endedAt + 60) continue
      var progress = 1
      for (var j = 0; j < round.samples.length; j++) {
        if (round.samples[j].at >= entry.at) {
          progress = span === 0 ? 1 : (round.samples[j].top - round.startTop) / span
          break
        }
      }
      var clamped = Math.min(0.999, Math.max(0, progress))
      var bucket = Math.min(3, Math.floor(clamped * 4))
      count += 1
      totalMs += entry.duration
      if (entry.duration > maxMs) maxMs = entry.duration
      quarters[bucket] += 1
      quarterMs[bucket] += entry.duration
    }
    return {
      direction: round.direction,
      step: round.step,
      frames: round.frames,
      frameCount: round.frames.length,
      durationMs: round.endedAt - round.startedAt,
      startTop: round.startTop,
      finalTop: round.finalTop,
      distance: Math.abs(round.finalTop - round.startTop),
      scrollHeightStart: round.scrollHeightStart,
      scrollHeightEnd: round.scrollHeightEnd,
      stopReason: round.stopReason,
      reachedEnd: round.reachedEnd,
      longTaskCount: count,
      longTaskTotalMs: totalMs,
      longTaskMaxMs: maxMs,
      longTaskQuarters: quarters,
      longTaskQuarterMs: quarterMs
    }
  }

  var column = document.querySelector('[class*="longColumn"]')
  return {
    ok: true,
    longTaskSupported: longTaskSupported,
    longTaskSelfCheck: selfCheckSeen,
    env: {
      userAgent: navigator.userAgent,
      cores: navigator.hardwareConcurrency,
      dpr: window.devicePixelRatio
    },
    list: {
      messages: column ? column.children.length : 0,
      longColumn: Boolean(column),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      nodes: document.getElementsByTagName('*').length
    },
    rounds: [summarize(down), summarize(up)]
  }
})()`

await rm(PROFILE, { recursive: true, force: true })

const server = spawn(
  process.execPath,
  [join(REPO, 'tools/serve.mjs'), join(REPO, 'dist'), String(WEB_PORT)],
  { cwd: REPO, stdio: 'ignore' }
)
for (let i = 0; i < 60; i++) {
  try {
    await fetch(`http://127.0.0.1:${WEB_PORT}/`)
    break
  } catch {}
  await sleep(200)
}

const chrome = spawn(
  CHROME,
  [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--mute-audio',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
)

let page = null
for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    page = list.find((t) => t.type === 'page')
    if (page) break
  } catch {}
  await sleep(250)
}
if (!page) {
  console.error('DevTools 没起来')
  chrome.kill()
  server.kill()
  process.exit(2)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((ok, fail) => {
  ws.addEventListener('open', ok)
  ws.addEventListener('error', fail)
})
let seq = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
})
const send = (method, params = {}) =>
  new Promise((ok) => {
    const id = ++seq
    pending.set(id, ok)
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) {
    throw new Error(res.result.exceptionDetails.exception?.description ?? res.result.exceptionDetails.text)
  }
  return res.result?.result?.value
}
const waitFor = async (expression, timeoutMs = 15000) => {
  const began = Date.now()
  while (Date.now() - began < timeoutMs) {
    if (await evaluate(`!!(${expression})`)) return Date.now() - began
    await sleep(200)
  }
  return -1
}

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const percentile = (values, p) => {
  if (!values.length) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

const round1 = (value) => Math.round(value * 10) / 10

let report = null
let failure = null
try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 2,
    mobile: WIDTH < 768,
    screenWidth: WIDTH,
    screenHeight: HEIGHT,
  })
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`, 30000)
  // 没有 Key 会自动弹设置窗；须知页盖在最上面，都会挡住后面的点击
  await evaluate(`localStorage.setItem('chat-demo:api-key', 'sk-probe-not-real')`)
  await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '我知道了') { nodes[i].click(); return true }
    }
    return false
  })()`)
  await sleep(400)

  const seeded = await evaluate(seedExpression(buildMessages()))
  check(`造了一条 ${MESSAGES} 条的会话`, seeded === MESSAGES, `${seeded} 条`)

  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`, 30000)
  await sleep(600)
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await evaluate(`(function () {
    var btn = document.querySelector('button[aria-label="打开边栏"]')
    if (btn) btn.click()
  })()`)
  await waitFor(`(document.body.textContent || '').indexOf(${JSON.stringify(TITLE)}) >= 0`, 30000)
  const spot = await evaluate(`(function () {
    var nodes = document.querySelectorAll('div')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === ${JSON.stringify(TITLE)}) {
        var rect = nodes[i].getBoundingClientRect()
        if (rect.width < 10 || rect.height < 10) continue
        return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
      }
    }
    return null
  })()`)
  if (spot) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: spot.x, y: spot.y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: spot.x, y: spot.y, button: 'left', clickCount: 1 })
  }
  // 600 条消息要全部挂载（含 Markdown/AST 与公式），给它足够长的等待
  const opened = await waitFor(
    `(document.body.textContent || '').indexOf('探针问题 ${MESSAGES / 2}') >= 0`,
    180000
  )
  check('会话打开了、消息挂满了', opened >= 0, opened >= 0 ? `${(opened / 1000).toFixed(1)}s` : '超时')

  const raw = await evaluate(measureExpression)
  if (!raw?.ok) {
    failure = `测量脚本没跑起来：${raw?.error ?? 'unknown'}`
  } else {
    report = raw
    const rounds = raw.rounds
    const allFrames = rounds.flatMap((round) => round.frames)
    const totalLong = rounds.reduce((sum, round) => sum + round.longTaskCount, 0)
    const totalLongMs = rounds.reduce((sum, round) => sum + round.longTaskTotalMs, 0)

    check(`会话里的 ${MESSAGES} 条消息都在 DOM 里`, raw.list.messages === MESSAGES, `${raw.list.messages} 条`)
    check('长列表启用了 content-visibility', raw.list.longColumn === true)
    check(
      '长任务采集可用（supportedEntryTypes 含 longtask）',
      raw.longTaskSupported === true,
      raw.longTaskSupported
        ? raw.longTaskSelfCheck
          ? '有能力，忙等自检也记到了'
          : '有能力；忙等自检没记到（已知假阴性，滚动中的真实长任务能记到，见下表）'
        : '这个环境不支持 longtask，长任务数字不可信'
    )
    check(
      '两轮都采到了足够的帧',
      rounds.every((round) => round.frameCount >= 100),
      rounds.map((round) => round.frameCount).join(' / ')
    )
    check(
      '两轮都滚到了另一头',
      rounds.every((round) => round.reachedEnd && round.stopReason === 'end'),
      rounds.map((round) => (round.reachedEnd ? '到位' : `${round.stopReason} 收工`)).join(' / ')
    )

    const chromeVersion = (raw.env.userAgent.match(/(?:Headless)?Chrome\/([\d.]+)/) ?? [])[1] ?? '未知'
    const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
    const artifact = await readArtifact()

    const line = (round) =>
      `${round.direction === 'down' ? '向下' : '向上'}: 帧 ${round.frameCount} / P50 ${round1(percentile(round.frames, 50))}ms / P95 ${round1(percentile(round.frames, 95))}ms / 最大 ${round1(Math.max(...round.frames))}ms / 长任务 ${round.longTaskCount} 次 ${Math.round(round.longTaskTotalMs)}ms`

    console.log(`\n=== 流畅度基线（v${artifact.version} dist）===`)
    console.log(`产物：dist 构建于 ${artifact.builtAt}（package.json v${artifact.version}，未重建）`)
    console.log(`环境：无头 Chrome ${chromeVersion} / 本机 / ${WIDTH}×${HEIGHT}@${raw.env.dpr} / ${raw.env.cores} 逻辑核`)
    console.log(
      `会话：${raw.list.messages} 条消息，列表高 ${raw.list.scrollHeight} px，视口高 ${raw.list.clientHeight} px，DOM 节点 ${raw.list.nodes}`
    )
    console.log(`步长：每帧 ${rounds[0].step} px（clientHeight/${STEP_DIVISOR}），顶部→底部→顶部两轮 + rAF 采样`)
    for (const round of rounds) {
      console.log(`\n${line(round)}`)
      console.log(
        `  滚动距离 ${round.distance} px，用时 ${(round.durationMs / 1000).toFixed(1)} s，速度约 ${Math.round(round.distance / (round.durationMs / 1000))} px/s`
      )
      console.log(
        `  长任务最长 ${Math.round(round.longTaskMaxMs)} ms；阶段分布（滚动进度 1/4 段）次数 ${round.longTaskQuarters.join(' / ') || '0 / 0 / 0 / 0'}，毫秒 ${round.longTaskQuarterMs.map((ms) => Math.round(ms)).join(' / ')}`
      )
      if (round.scrollHeightEnd !== round.scrollHeightStart) {
        console.log(`  列表高度在滚动中 ${round.scrollHeightStart} → ${round.scrollHeightEnd} px（content-visibility 由估值换成实测）`)
      }
    }
    console.log(
      `\n合计：帧 ${allFrames.length}，P50 ${round1(percentile(allFrames, 50))}ms，P95 ${round1(percentile(allFrames, 95))}ms，最大 ${round1(Math.max(...allFrames))}ms`
    )
    console.log(`      长任务 ${totalLong} 次，共 ${Math.round(totalLongMs)} ms（占滚动时间约 ${((totalLongMs / rounds.reduce((sum, r) => sum + r.durationMs, 0)) * 100).toFixed(1)}%）`)

    const cell = (value) => String(value)
    const table = rounds.map((round) => ({
      frames: round.frameCount,
      p50: round1(percentile(round.frames, 50)),
      p95: round1(percentile(round.frames, 95)),
      max: round1(Math.max(...round.frames)),
      longCount: round.longTaskCount,
      longTotal: Math.round(round.longTaskTotalMs),
      longMax: Math.round(round.longTaskMaxMs),
      distance: round.distance,
      seconds: (round.durationMs / 1000).toFixed(1),
      speed: Math.round(round.distance / (round.durationMs / 1000)),
      quarters: round.longTaskQuarters.join(' / '),
      quarterMs: round.longTaskQuarterMs.map((ms) => Math.round(ms)).join(' / '),
    }))

    const doc = [
      `# 流畅度基线（v${artifact.version} dist）`,
      '',
      `- 环境：无头 Chrome ${chromeVersion} / 本机 / dist（package.json v${artifact.version}，构建于 ${artifact.builtAt}，未重建）`,
      `- 采集：${stamp}（Asia/Shanghai），${raw.env.cores} 逻辑核，devicePixelRatio ${raw.env.dpr}`,
      `- 视口：${WIDTH}×${HEIGHT}（移动断点；滚动层是 \`.scroll\`），与真机窄屏同档`,
      `- 会话：${raw.list.messages} 条消息（${MESSAGES / 2} 问 / ${MESSAGES / 2} 答），正文含 GFM 表格、代码块、行内与块级公式；列表高 ${raw.list.scrollHeight} px，DOM 节点 ${raw.list.nodes}`,
      `- 方法：每帧滚动 clientHeight/${STEP_DIVISOR}（${rounds[0].step} px），顶部→底部→顶部两轮连续滚动（约 ${((rounds[0].durationMs + rounds[1].durationMs) / 60000).toFixed(1)} 分钟），rAF 采样帧间隔；长任务由 \`PerformanceObserver({entryTypes:['longtask']})\` 采集（supportedEntryTypes 含 longtask：${raw.longTaskSupported ? '是' : '否'}）`,
      '',
      '| 指标 | 向下（顶部→底部） | 向上（底部→顶部） |',
      '| --- | --- | --- |',
      `| 采样帧数 | ${cell(table[0].frames)} | ${cell(table[1].frames)} |`,
      `| 帧间隔 P50（ms） | ${cell(table[0].p50)} | ${cell(table[1].p50)} |`,
      `| 帧间隔 P95（ms） | ${cell(table[0].p95)} | ${cell(table[1].p95)} |`,
      `| 帧间隔最大（ms） | ${cell(table[0].max)} | ${cell(table[1].max)} |`,
      `| 长任务（>50ms）次数 | ${cell(table[0].longCount)} | ${cell(table[1].longCount)} |`,
      `| 长任务总时长（ms） | ${cell(table[0].longTotal)} | ${cell(table[1].longTotal)} |`,
      `| 最长单次长任务（ms） | ${cell(table[0].longMax)} | ${cell(table[1].longMax)} |`,
      `| 滚动距离（px） | ${cell(table[0].distance)} | ${cell(table[1].distance)} |`,
      `| 滚动用时（s） | ${cell(table[0].seconds)} | ${cell(table[1].seconds)} |`,
      `| 平均速度（px/s） | ${cell(table[0].speed)} | ${cell(table[1].speed)} |`,
      `| 长任务按进度 1/4 段分布（次数） | ${table[0].quarters} | ${table[1].quarters} |`,
      `| 同上（毫秒） | ${table[0].quarterMs} | ${table[1].quarterMs} |`,
      '',
      '读法：P50 是「一般的一帧」，P95 是「每 20 帧里最慢那一帧」，最大帧间隔对应一次明显顿住；',
      '长任务次数与总时长是主线程被占住的量——滚动里的长任务基本等于「这一帧跟不上」的原因。',
      '两轮不是对照组：向下是冷轮，要把没量过的消息由 `contain-intrinsic-size` 的估值高度换成实测高度；',
      '向上是暖轮，对象已经量过。所以改前改后只比同向的两轮，别拿向上的数字去比向下的。',
      '列表高度在滚动中的变化也一并记在上面（内容高度没稳定时，两轮的距离本来就不相等）。',
      '',
      '## 复跑',
      '',
      '```powershell',
      'node _probe/scroll-perf.mjs',
      '```',
      '',
      '覆盖参数（改前改后必须用同一组）：`PROBE_MESSAGES`、`PROBE_WIDTH`、`PROBE_HEIGHT`、`PROBE_STEP_DIVISOR`。',
      '',
      '## 边界',
      '',
      '无头 Chrome 的数字只证明「没退化」，不代表真机手感：',
      '它是同一台机器、同一份产物、同一组参数下的纵向对照，能回答「这次改动让滚动更慢了吗」，',
      '不能回答「在我的手机上滑起来顺不顺」——真机的手感要看设备 GPU、触控采样率与实际内核版本，',
      '这三样这台无头浏览器都没有。涉及设备行为的结论仍按 `inferred` 记，等真机取证。',
      '',
    ].join('\n')
    await mkdir(join(REPO, 'docs'), { recursive: true })
    await writeFile(DOC, doc, 'utf8')
    console.log(`\n数字已写入 docs/perf-baseline.md`)
  }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error)
  console.error('探针异常：', error)
} finally {
  ws.close()
  chrome.kill()
  server.kill()
  await sleep(500)
  await rm(PROFILE, { recursive: true, force: true }).catch(() => {})
}

if (failure) {
  console.error(`\n失败：${failure}`)
}

const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} 通过`)
process.exit(failure || failed > 0 ? 1 : 0)
