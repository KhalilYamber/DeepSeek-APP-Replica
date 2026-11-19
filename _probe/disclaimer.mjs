// 探针：首启「使用前须知」——首次出现、点掉后不再出现、设置里能重开。
// 用法：先 pnpm build，再 node _probe/disclaimer.mjs
// 可换尺寸：PROBE_WIDTH=360 PROBE_HEIGHT=800 node _probe/disclaimer.mjs（A58 那档）
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
function fileURLToPath(url) {
  return decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1')
}

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9576
const WEB_PORT = 8142
const PROFILE = join(tmpdir(), 'disclaimer-probe-profile')
const WIDTH = Number(process.env.PROBE_WIDTH ?? 390)
const HEIGHT = Number(process.env.PROBE_HEIGHT ?? 844)
const SHOT = join(REPO, 'screenshots', `disclaimer-${WIDTH}.png`)

await rm(PROFILE, { recursive: true, force: true })
await mkdir(join(REPO, 'screenshots'), { recursive: true })

const server = spawn(process.execPath, [join(REPO, 'tools/serve.mjs'), join(REPO, 'dist'), String(WEB_PORT)], {
  cwd: REPO,
  stdio: 'ignore',
})
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
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.text)
  return res.result?.result?.value
}
const waitFor = async (expression, timeoutMs = 12000) => {
  const began = Date.now()
  while (Date.now() - began < timeoutMs) {
    if (await evaluate(`!!(${expression})`)) return Date.now() - began
    await sleep(200)
  }
  return -1
}
const bodyHas = (text) => `(document.body.textContent || '').indexOf(${JSON.stringify(text)}) >= 0`
const clickText = (text) => `(function () {
  var nodes = document.querySelectorAll('button')
  for (var i = 0; i < nodes.length; i++) {
    if ((nodes[i].textContent || '').trim() === ${JSON.stringify(text)}) { nodes[i].click(); return true }
  }
  return false
})()`

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

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

  // ---- 第一次打开：应当看到须知 ----
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  const first = await waitFor(bodyHas('使用前须知'))
  check('首次打开弹出「使用前须知」', first >= 0)
  check('写着不是官方 App', await evaluate(bodyHas('不是官方 App')))
  check('写清了费用由 API 方结算', await evaluate(bodyHas('费用由 API 方按用量结算')))
  check('写清了数据只在本机', await evaluate(bodyHas('工具作者这边看不到')))
  check('写清了模型可能出错', await evaluate(bodyHas('可能有错')))

  // 按钮必须在视口内点得到（小屏 + 字体放大时靠正文滚动兜底）
  const inView = await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '我知道了') {
        var r = nodes[i].getBoundingClientRect()
        return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0
      }
    }
    return false
  })()`)
  check('「我知道了」按钮在视口内', inView)

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(SHOT, Buffer.from(shot.result.data, 'base64'))
  console.log(`截图：${SHOT}`)

  // ---- 点掉：应当消失，并且接着弹出填 Key 的设置 ----
  check('点了「我知道了」', await evaluate(clickText('我知道了')))
  await sleep(600)
  check('须知消失', (await evaluate(bodyHas('使用前须知'))) === false)

  // ---- 再打开：不再出现 ----
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  await sleep(800)
  check('重新打开后不再弹出须知', (await evaluate(bodyHas('不是官方 App'))) === false)

  // ---- 设置里能重开 ----
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(300)
  await evaluate(`(function () {
    var btn = document.querySelector('button[aria-label="打开边栏"]')
    if (btn) btn.click()
  })()`)
  await sleep(400)
  await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '设置') { nodes[i].click(); return true }
    }
    return false
  })()`)
  await sleep(500)
  await evaluate(clickText('通用设置'))
  await sleep(400)
  // 把「使用前须知」那行滚进视野拍一张，人眼确认位置与文案
  await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '查看') { nodes[i].scrollIntoView({ block: 'center' }); return true }
    }
    return false
  })()`)
  await sleep(400)
  const rowShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(join(REPO, 'screenshots', 'disclaimer-settings-row.png'), Buffer.from(rowShot.result.data, 'base64'))
  const row = await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '查看') { nodes[i].click(); return true }
    }
    return false
  })()`)
  check('设置里有「使用前须知」的查看按钮', row)
  const reopened = await waitFor(bodyHas('不是官方 App'))
  check('点「查看」能重新打开须知', reopened >= 0)

  // ---- 老用户路径：已经有 API Key，点掉须知后不该再弹设置 ----
  await evaluate(`(function () {
    localStorage.setItem('chat-demo:api-key', 'sk-probe-not-real')
    localStorage.removeItem('chat-demo:disclaimer-ack')
  })()`)
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  check('（老用户）升级后仍然弹一次须知', (await waitFor(bodyHas('不是官方 App'))) >= 0)
  await evaluate(clickText('我知道了'))
  await sleep(700)
  const dialogAfter = await evaluate(`document.querySelector('[role="dialog"]') !== null`)
  check('（老用户）已经有 Key，点掉后不再弹设置', dialogAfter === false)

  // ---- 英文界面：同一个弹窗要跟着语言走 ----
  await evaluate(`(function () {
    localStorage.removeItem('chat-demo:api-key')
    localStorage.removeItem('chat-demo:disclaimer-ack')
    localStorage.setItem('chat-demo:locale', 'en-US')
  })()`)
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  check('（英文）弹出 Before you start', (await waitFor(bodyHas('Before you start'))) >= 0)
  check('（英文）文案是英文', await evaluate(bodyHas('Not an official app')))
  check('（英文）按钮是 Got it', await evaluate(bodyHas('Got it')))
  const enShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(join(REPO, 'screenshots', 'disclaimer-en.png'), Buffer.from(enShot.result.data, 'base64'))
} finally {
  ws.close()
  chrome.kill()
  server.kill()
  await sleep(500)
  await rm(PROFILE, { recursive: true, force: true }).catch(() => {})
}

const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} 通过`)
process.exit(failed === 0 ? 0 : 1)
