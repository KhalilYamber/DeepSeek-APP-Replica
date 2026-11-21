// 探针：长会话的「回到底部」浮标 + content-visibility 启用条件。
// 用法：先 pnpm build，再 node _probe/scroll-to-bottom.mjs
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
const PORT = 9575
const WEB_PORT = 8141
const PROFILE = join(tmpdir(), 'scroll-probe-profile')
const WIDTH = Number(process.env.PROBE_WIDTH ?? 390)
const HEIGHT = Number(process.env.PROBE_HEIGHT ?? 844)
const SHOT = join(REPO, 'screenshots', `scroll-to-bottom-${WIDTH}.png`)

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

/** 造一条 210 轮的会话：既够触发 content-visibility，也够滚很远 */
const seed = `new Promise(function (resolve, reject) {
  var req = indexedDB.open('chat-demo')
  req.onerror = function () { reject(req.error) }
  req.onsuccess = function () {
    var db = req.result
    var now = Date.now()
    var messages = []
    for (var i = 0; i < 105; i++) {
      messages.push({
        id: 'p-r' + i, role: 'user', content: '第 ' + i + ' 个问题：随便问一句，用来把会话撑长。',
        files: [], createdAt: now - (105 - i) * 6000
      })
      messages.push({
        id: 'p-a' + i, role: 'assistant', createdAt: now - (105 - i) * 6000 + 1000,
        model: 'deepseek-flash', prefix: true, status: 'done',
        blocks: [{ type: 'text', text: '第 ' + i + ' 个回答：这是一段用来撑高度的普通回复，长度中等，足够占几行。' }]
      })
    }
    var tx = db.transaction(['sessions', 'sessionSummaries'], 'readwrite')
    tx.objectStore('sessions').put({ id: 'probe-scroll', title: '滚动浮标检查', createdAt: now, updatedAt: now, messages: messages })
    tx.objectStore('sessionSummaries').put({ id: 'probe-scroll', title: '滚动浮标检查', createdAt: now, updatedAt: now })
    tx.oncomplete = function () { db.close(); resolve(messages.length) }
    tx.onerror = function () { reject(tx.error) }
  }
})`

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
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  // 首启「使用前须知」盖在最上面：先点掉，否则后面点不到任何东西
  await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '我知道了') { nodes[i].click(); return true }
    }
    return false
  })()`)
  await sleep(400)
  const count = await evaluate(seed)
  check('塞进一条 210 条的会话', count === 210, `${count} 条`)

  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  await sleep(500)
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(200)
  await evaluate(`(function () {
    var btn = document.querySelector('button[aria-label="打开边栏"]')
    if (btn) btn.click()
  })()`)
  await waitFor(`(document.body.textContent || '').indexOf('滚动浮标检查') >= 0`)
  const spot = await evaluate(`(function () {
    var nodes = document.querySelectorAll('div')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '滚动浮标检查') {
        var rect = nodes[i].getBoundingClientRect()
        return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
      }
    }
    return null
  })()`)
  if (spot) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: spot.x, y: spot.y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: spot.x, y: spot.y, button: 'left', clickCount: 1 })
  }
  check('会话打开了', (await waitFor(`(document.body.textContent || '').indexOf('第 104 个回答') >= 0`)) >= 0)

  const longClass = await evaluate(`document.querySelectorAll('[class*="longColumn"]').length`)
  check('长会话挂上了 content-visibility 的类', longClass > 0, `找到 ${longClass} 个`)

  const jumpButton = `(function () {
    var btns = document.querySelectorAll('button')
    for (var i = 0; i < btns.length; i++) {
      if ((btns[i].getAttribute('aria-label') || '') === '回到底部') return btns[i]
    }
    return null
  })()`

  check('在底部时浮标不出现', (await evaluate(`!!${jumpButton}`)) === false)

  // 往上滚一大段
  await evaluate(`(function () {
    var scrollers = [].slice.call(document.querySelectorAll('div')).filter(function (el) { return el.scrollHeight > el.clientHeight + 50 })
    var el = scrollers[scrollers.length - 1]
    el.scrollTop = 0
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
    return { top: el.scrollTop, h: el.scrollHeight }
  })()`)
  const appeared = await waitFor(`!!${jumpButton}`)
  check('往上滚后浮标出现', appeared >= 0)

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(SHOT, Buffer.from(shot.result.data, 'base64'))

  // 点它：应该回到底部，浮标消失
  await evaluate(`(function () {
    var btns = document.querySelectorAll('button')
    for (var i = 0; i < btns.length; i++) {
      if ((btns[i].getAttribute('aria-label') || '') === '回到底部') { btns[i].click(); return true }
    }
    return false
  })()`)
  await sleep(600)
  const backAtBottom = await evaluate(`(function () {
    var scrollers = [].slice.call(document.querySelectorAll('div')).filter(function (el) { return el.scrollHeight > el.clientHeight + 50 })
    var el = scrollers[scrollers.length - 1]
    return el.scrollHeight - el.scrollTop - el.clientHeight < 60
  })()`)
  check('点浮标后回到底部', backAtBottom)
  check('回到底部后浮标消失', (await evaluate(`!!${jumpButton}`)) === false)
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
