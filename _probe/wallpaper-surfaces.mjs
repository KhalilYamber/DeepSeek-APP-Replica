// 探针：壁纸模式下的表面层级——截图工位 + 断言。
//
// 用法：
//   node _probe/wallpaper-surfaces.mjs --shots before     只出图（改前基线 / 每批看片）
//   node _probe/wallpaper-surfaces.mjs --shots b2 --check  出图并跑断言（实现完成后）
//   node _probe/wallpaper-surfaces.mjs --shots b2 --settings  额外截一张设置页
//
// 壁纸素材：screenshots/wallpaper-src.jpg（gitignore，按 App 规则压成 900×1600 / JPEG 0.7）。
// 会话内容是自己造的演示数据，不是用户真实对话。
//
// 为什么要它：headless 里能注入 localStorage 壁纸 + 假余额 + 演示会话，
// 才能在「和你手机上同一屏」的条件下看层次与对比，而不是在空白首页上瞎猜。
import { spawn } from 'node:child_process'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const WEB_PORT = 8162
const CDP_PORT = 9592
const PROFILE = join(tmpdir(), `wallpaper-surfaces-profile-${Date.now()}`)
const WALLPAPER_SRC = join(REPO, 'screenshots', 'wallpaper-src.jpg')
const SHOT_DIR = join(REPO, 'screenshots', 'wallpaper')

const argv = process.argv.slice(2)
const SHOT_LABEL = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null
// 分批验收：--until=bubbles|title|chrome 只跑已经实现的那几组，没做的部分不算失败；
// --check 等于全部（bubbles + title + chrome）。
const UNTIL = (argv.find((a) => a.startsWith('--until=')) ?? '--until=none').split('=')[1]
const LEVEL = argv.includes('--check')
  ? 3
  : UNTIL === 'bubbles'
    ? 1
    : UNTIL === 'title'
      ? 2
      : UNTIL === 'chrome'
        ? 3
        : 0
const CHECK_ANY = LEVEL >= 1
const WITH_SETTINGS = argv.includes('--settings')
// 欢迎页：不点开会话，直接截「新对话」那一屏
const WELCOME = argv.includes('--welcome')

// 与真机同尺寸：1080×2362 / 3 ≈ 360×787
const WIDTH = 360
const HEIGHT = 787
const DSF = 3

/** 每个主题跑一遍：先无壁纸（回归），再有壁纸（本次目标）。 */
const THEMES = ['light', 'dark']

const BALANCE = JSON.stringify({
  is_available: true,
  balance_infos: [
    { currency: 'CNY', total_balance: '9.59', granted_balance: '0.00', topped_up_balance: '9.59' },
  ],
})

const THINKING = [
  '用户在问矩阵乘法的性质，先把交换律与结合律分开。',
  '交换律不成立：AB 与 BA 的维度都可能对不上，即使都是方阵，元素也不相等。',
  '结合律成立，因为乘法对下标求和的顺序可以重排；这一步要给出具体例子，别只下结论。',
  '还要提醒：单位矩阵 I 与任何同阶方阵交换，这是「几乎不交换」的例外。',
].join('\n\n')

const ANSWER = [
  '## 一句话结论',
  '',
  '矩阵乘法**不满足交换律**，但满足结合律。',
  '',
  '- 交换律：不成立',
  '- 结合律：成立',
  '- 分配律：成立',
  '',
  '```ts',
  'const multiply = (a: number[][], b: number[][]) =>',
  '  a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)))',
  '```',
  '',
  '| 运算 | 交换律 | 结合律 |',
  '| --- | --- | --- |',
  '| 加法 | ✓ | ✓ |',
  '| 乘法 | ✗ | ✓ |',
  '',
  '行内公式 $AB \\neq BA$，独立公式：',
  '',
  '$$',
  '(AB)C = A(BC)',
  '$$',
].join('\n')

const SHORT = '乘积不交换：$AB \\neq BA$。'

/** 造一条演示会话：用户消息、带思考的长回答、再一问一答。 */
const seed = `new Promise(function (resolve, reject) {
  var req = indexedDB.open('chat-demo')
  req.onerror = function () { reject(req.error) }
  req.onsuccess = function () {
    var db = req.result
    var now = Date.now()
    var tx = db.transaction(['sessions', 'sessionSummaries'], 'readwrite')
    tx.objectStore('sessions').put({
      id: 'wallpaper-demo',
      title: '壁纸模式检查',
      createdAt: now - 60000,
      updatedAt: now,
      messages: [
        { id: 'u1', role: 'user', content: '把公式、表格、代码放在一起给我看看。', files: [], createdAt: now - 60000 },
        {
          id: 'a1', role: 'assistant', createdAt: now - 59000, model: 'deepseek-flash',
          prefix: true, status: 'done',
          blocks: [
            { type: 'thinking', thinking: ${JSON.stringify(THINKING)}, startedAt: now - 59000, endedAt: now - 57000 },
            { type: 'text', text: ${JSON.stringify(ANSWER)} }
          ],
          usage: { input_tokens: 5120, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 320 }
        },
        { id: 'u2', role: 'user', content: '再短一点，只说结论。', files: [], createdAt: now - 20000 },
        {
          id: 'a2', role: 'assistant', createdAt: now - 19000, model: 'deepseek-flash',
          prefix: true, status: 'done',
          blocks: [{ type: 'text', text: ${JSON.stringify(SHORT)} }],
          usage: { input_tokens: 5300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 120 }
        }
      ]
    })
    tx.objectStore('sessionSummaries').put({
      id: 'wallpaper-demo', title: '壁纸模式检查', createdAt: now - 60000, updatedAt: now, fileIds: []
    })
    tx.oncomplete = function () { db.close(); resolve(true) }
    tx.onerror = function () { reject(tx.error) }
  }
})`

await mkdir(SHOT_DIR, { recursive: true })
await rm(PROFILE, { recursive: true, force: true })

if (!existsSync(WALLPAPER_SRC)) {
  console.error(`缺少壁纸素材：${WALLPAPER_SRC}`)
  process.exit(2)
}
await mkdir(join(REPO, 'dist', '__probe'), { recursive: true })
await copyFile(WALLPAPER_SRC, join(REPO, 'dist', '__probe', 'wallpaper.jpg'))

const server = spawn(
  process.execPath,
  [join(REPO, 'tools/serve.mjs'), join(REPO, 'dist'), String(WEB_PORT)],
  {
    cwd: REPO,
    stdio: 'ignore',
  }
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
    // 只为截图：让余额 mock 不必手搓 CORS 预检
    '--disable-web-security',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
)

const cleanup = async (code) => {
  try {
    chrome.kill()
  } catch {}
  try {
    server.kill()
  } catch {}
  await rm(join(REPO, 'dist', '__probe'), { recursive: true, force: true }).catch(() => {})
  await rm(PROFILE, { recursive: true, force: true }).catch(() => {})
  process.exit(code)
}

let page = null
for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
    page = list.find((t) => t.type === 'page')
    if (page) break
  } catch {}
  await sleep(250)
}
if (!page) {
  console.error('DevTools 没起来')
  await cleanup(2)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', rej)
})

let seq = 0
const pending = new Map()
const errors = []
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
    return
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    errors.push(`${d.text} ${d.exception?.description ?? ''}`.slice(0, 300))
  }
  if (msg.method === 'Fetch.requestPaused') {
    const { requestId, request } = msg.params
    const headers = [
      { name: 'content-type', value: 'application/json' },
      { name: 'access-control-allow-origin', value: '*' },
      { name: 'access-control-allow-headers', value: 'authorization,content-type' },
      { name: 'access-control-allow-methods', value: 'GET,POST,OPTIONS' },
    ]
    if (request.method === 'OPTIONS') {
      void send('Fetch.fulfillRequest', { requestId, responseCode: 204, responseHeaders: headers })
    } else {
      void send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: headers,
        body: Buffer.from(BALANCE).toString('base64'),
      })
    }
  }
})

const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  const details = r.result?.exceptionDetails
  if (details) {
    throw new Error(`${details.text} ${details.exception?.description ?? ''}`)
  }
  return r.result?.result?.value
}

const waitFor = async (expression, timeout = 8000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) {
      return true
    }
    await sleep(120)
  }
  return false
}

const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  if (!r.result?.data) {
    throw new Error(`截图失败：${name}`)
  }
  await writeFile(join(SHOT_DIR, `${name}.png`), Buffer.from(r.result.data, 'base64'))
  console.log(`截图：screenshots/wallpaper/${name}.png`)
}

const results = []
const check = (name, ok, detail) => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

/** 把 computed backgroundColor 里的 alpha 取出来；不是 rgba 就当 1。 */
const alphaOf = (color) => {
  if (typeof color !== 'string') {
    return null
  }
  const m = color.match(/^rgba?\(([^)]+)\)$/)
  if (!m) {
    return null
  }
  const parts = m[1].split(',').map((v) => v.trim())
  return parts.length === 4 ? Number(parts[3]) : 1
}

const openDrawer = `(function () {
  var btn = document.querySelector('button[aria-label="打开边栏"]')
  if (btn) { btn.click(); return true }
  return false
})()`

/** 消息列表滚到顶或底：找那个「真的能滚、且装着气泡」的容器 */
const scrollMessages = (where) =>
  evaluate(`(function () {
    var nodes = document.querySelectorAll('div')
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i]
      if (el.scrollHeight > el.clientHeight + 120 && el.querySelector('[class*="bubble-"]')) {
        el.scrollTop = ${where === 'top' ? '0' : 'el.scrollHeight'}
        return el.scrollTop
      }
    }
    return -1
  })()`)

/** 点开侧栏里那条演示会话（用真实鼠标事件，React 才认） */
const clickSession = async (title) => {
  await evaluate(openDrawer)
  await sleep(400)
  const spot = await evaluate(`(function () {
    var nodes = document.querySelectorAll('div,span,button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === ${JSON.stringify(title)}) {
        var rect = nodes[i].getBoundingClientRect()
        if (rect.width < 10 || rect.height < 10 || rect.x < 0) continue
        return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
      }
    }
    return null
  })()`)
  if (!spot) {
    return false
  }
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: spot.x,
    y: spot.y,
    button: 'left',
    clickCount: 1,
  })
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: spot.x,
    y: spot.y,
    button: 'left',
    clickCount: 1,
  })
  return true
}

const readSurface = () =>
  evaluate(`(function () {
    var bar = document.querySelector('[data-role="usage-balance"]')
    var barBox = bar ? bar.closest('[class*="bar-"]') : null
    var bubble = document.querySelector('[class*="bubble-"]')
    var answer = document.querySelector('[data-role="answer-bubble"]')
    // 只认「思考折叠条」这个 button：顶栏标题也叫 .title，按 class 抓会抓错
    var title = document.querySelector('button[aria-expanded][class*="title-"]')
    var dock = document.querySelector('[class*="inputContainer-"]')
    var input = document.querySelector('[class*="wrapper-"]')
    var cs = function (el) { return el ? getComputedStyle(el) : null }
    // 第一条 AI 气泡的底边 与 第二条用户气泡的顶边 之间的空隙（CSS px）
    var answers = document.querySelectorAll('[data-role="answer-bubble"]')
    var users = document.querySelectorAll('[class*="bubble-"]')
    var gap = null
    if (answers.length > 0 && users.length > 1) {
      gap = Math.round(users[1].getBoundingClientRect().top - answers[0].getBoundingClientRect().bottom)
    }
    var square = function (el) {
      if (!el) return null
      var r = el.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    }
    return {
      hasAttr: document.body.hasAttribute('data-chat-bg'),
      barBg: cs(barBox) ? cs(barBox).backgroundColor : null,
      bubbleBg: cs(bubble) ? cs(bubble).backgroundColor : null,
      answerBg: answer ? cs(answer).backgroundColor : null,
      answerPadding: answer ? cs(answer).paddingTop : null,
      titleRadius: title ? cs(title).borderRadius : null,
      titleBg: title ? cs(title).backgroundColor : null,
      titleBox: square(title),
      dockImage: dock ? cs(dock).backgroundImage.slice(0, 120) : null,
      inputBg: input ? cs(input).backgroundColor : null,
      messageGap: gap
    }
  })()`)

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*api.deepseek.com*' }] })
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: DSF,
    mobile: true,
    screenWidth: WIDTH,
    screenHeight: HEIGHT,
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }] })

  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(
    `!!document.getElementById('root') && document.getElementById('root').children.length > 0`
  )

  // 免责声明已读 + 假 Key（否则会自动弹设置）+ 固定模型 + 上下文上限缓存（避免再发 /models）
  await evaluate(`(function () {
    localStorage.setItem('chat-demo:disclaimer-ack', '1')
    localStorage.setItem('chat-demo:api-key', 'sk-probe-000000000000')
    localStorage.setItem('chat-demo:model', 'deepseek-flash')
    localStorage.setItem('chat-demo:thinking-end', 'expand')
    localStorage.setItem('chat-demo:context-window', JSON.stringify({ model: 'deepseek-flash', value: 128000, at: Date.now() }))
    return true
  })()`)

  await evaluate(seed)
  await send('Page.reload')
  await sleep(1600)

  // 无壁纸基线：证明「没设壁纸时就是老样子」
  for (const theme of THEMES) {
    await evaluate(`localStorage.setItem('chat-demo:theme-preference', '${theme}'); true`)
    await send('Page.reload')
    await sleep(1500)
    const clicked = await clickSession('壁纸模式检查')
    await sleep(900)
    if (!clicked) {
      console.log(`（${theme}）没点开会话，仍截首页`)
    }
    if (SHOT_LABEL) {
      await shot(`${SHOT_LABEL}-nobg-${theme}`)
      await scrollMessages('top')
      await sleep(350)
      await shot(`${SHOT_LABEL}-nobg-${theme}-top`)
      await scrollMessages('bottom')
      await sleep(250)
    }
    if (CHECK_ANY) {
      const s = await readSurface()
      check(`${theme}：无壁纸时不打标记`, s?.hasAttr === false, String(s?.hasAttr))
      check(`${theme}：无壁纸时用户气泡不透明`, alphaOf(s?.bubbleBg) === 1, String(s?.bubbleBg))
      check(
        `${theme}：无壁纸时 AI 气泡不显形`,
        s?.answerBg === null || alphaOf(s.answerBg) === 0,
        String(s?.answerBg)
      )
    }
  }

  // 壁纸模式：把压缩好的图写进 localStorage 再重载
  await evaluate(`(async function () {
    var res = await fetch('/__probe/wallpaper.jpg')
    var blob = await res.blob()
    var dataUrl = await new Promise(function (resolve) {
      var reader = new FileReader()
      reader.onload = function () { resolve(reader.result) }
      reader.readAsDataURL(blob)
    })
    localStorage.setItem('chat-demo:chat-background', String(dataUrl))
    return String(dataUrl).length
  })()`)

  for (const theme of THEMES) {
    await evaluate(`localStorage.setItem('chat-demo:theme-preference', '${theme}'); true`)
    await send('Page.reload')
    await sleep(1600)
    if (WELCOME) {
      if (SHOT_LABEL) {
        await shot(`${SHOT_LABEL}-welcome-${theme}`)
      }
      continue
    }
    const clicked = await clickSession('壁纸模式检查')
    await sleep(1000)
    if (!clicked) {
      console.log(`（${theme}）没点开会话，仍截首页`)
    }
    if (SHOT_LABEL) {
      await shot(`${SHOT_LABEL}-bg-${theme}`)
      await scrollMessages('top')
      await sleep(350)
      await shot(`${SHOT_LABEL}-bg-${theme}-top`)
      await scrollMessages('bottom')
      await sleep(250)
    }
    const s = await readSurface()
    if (CHECK_ANY) {
      check(`${theme}：有壁纸时打上 data-chat-bg`, s?.hasAttr === true, String(s?.hasAttr))
      check(
        `${theme}：余额条半透明 0.75`,
        Math.abs((alphaOf(s?.barBg) ?? 1) - 0.75) < 0.02,
        String(s?.barBg)
      )
      check(
        `${theme}：用户气泡跟着滑杆（0.7）`,
        Math.abs((alphaOf(s?.bubbleBg) ?? 1) - 0.7) < 0.02,
        String(s?.bubbleBg)
      )
      check(
        `${theme}：AI 气泡存在且同透明度`,
        s?.answerBg !== null && Math.abs((alphaOf(s.answerBg) ?? 1) - 0.7) < 0.02,
        String(s?.answerBg)
      )
    }
    if (LEVEL >= 2) {
      check(`${theme}：思考标题变胶囊`, s?.titleRadius === '100px', String(s?.titleRadius))
      check(
        `${theme}：思考标题是半透明底（0.85）`,
        Math.abs((alphaOf(s?.titleBg) ?? 1) - 0.85) < 0.02,
        String(s?.titleBg)
      )
    }
    if (LEVEL >= 3) {
      check(
        `${theme}：输入框半透明 0.82`,
        Math.abs((alphaOf(s?.inputBg) ?? 1) - 0.82) < 0.02,
        String(s?.inputBg)
      )
      check(
        `${theme}：底部底板渐变带 0.88`,
        String(s?.dockImage ?? '').includes('0.88'),
        String(s?.dockImage)
      )
      check(
        `${theme}：两条消息之间留出空隙（≥8px）`,
        typeof s?.messageGap === 'number' && s.messageGap >= 8,
        String(s?.messageGap)
      )
    }
  }

  if (WITH_SETTINGS && SHOT_LABEL) {
    for (const theme of THEMES) {
      await evaluate(`localStorage.setItem('chat-demo:theme-preference', '${theme}'); true`)
      await send('Page.reload')
      await sleep(1500)
      await evaluate(openDrawer)
      await sleep(400)
      await evaluate(`(function () {
        var buttons = document.querySelectorAll('button')
        for (var i = 0; i < buttons.length; i++) {
          if ((buttons[i].textContent || '').trim() === '设置') { buttons[i].click(); return true }
        }
        return false
      })()`)
      await sleep(700)
      await evaluate(`(function () {
        var tabs = document.querySelectorAll('[role="tab"]')
        for (var i = 0; i < tabs.length; i++) {
          if ((tabs[i].textContent || '').indexOf('个性化') >= 0) { tabs[i].click(); return true }
        }
        return false
      })()`)
      await sleep(600)
      // 滚到「对话背景」那一块
      await evaluate(`(function () {
        var nodes = document.querySelectorAll('div')
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i]
          if (el.scrollHeight > el.clientHeight + 40 && el.querySelector('input[type="range"]')) {
            el.scrollTop = el.scrollHeight
            return true
          }
        }
        return false
      })()`)
      await sleep(300)
      await shot(`${SHOT_LABEL}-settings-${theme}`)
    }
  }

  if (errors.length) {
    console.log('--- 页面异常 ---')
    for (const line of errors.slice(0, 10)) {
      console.log(line)
    }
  }

  if (CHECK_ANY) {
    const failed = results.filter((ok) => !ok).length
    console.log(`\n断言 ${results.length - failed}/${results.length} 通过`)
    await cleanup(failed === 0 ? 0 : 1)
  } else {
    await cleanup(0)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  await cleanup(1)
}
