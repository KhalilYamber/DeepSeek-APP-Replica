// 探针：标题栏下的状态栏——余额位、上下文圆环百分比、点击反馈。
// 不请求真实接口：无 Key 时余额显示 --；圆环用 seed 的用量 + 缓存的上限算。
// 用法：先 pnpm build，再 node _probe/usage-bar.mjs
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9577
const WEB_PORT = 8143
const PROFILE = join(tmpdir(), 'usage-probe-profile')
const SHOT = join(REPO, 'screenshots', 'usage-bar.png')

await rm(PROFILE, { recursive: true, force: true })
await mkdir(join(REPO, 'screenshots'), { recursive: true })

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
const bodyHas = (text) => `(document.body.textContent || '').indexOf(${JSON.stringify(text)}) >= 0`

const USAGE = {
  input_tokens: 64000,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  output_tokens: 1000,
}
const ANSWER = '这是一条带用量记录的回答。'

const seed = (id, title, answer, usage) => `new Promise(function (resolve, reject) {
  var req = indexedDB.open('chat-demo', 11)
  req.onerror = function () { reject(req.error) }
  req.onsuccess = function () {
    var db = req.result
    var now = Date.now()
    var tx = db.transaction(['sessions', 'sessionSummaries'], 'readwrite')
    tx.objectStore('sessions').put({
      id: ${JSON.stringify(id)},
      title: ${JSON.stringify(title)},
      createdAt: now,
      updatedAt: now,
      messages: [
        { id: ${JSON.stringify(id + '-u')}, role: 'user', content: '用量检查', files: [], createdAt: now - 3000 },
        {
          id: ${JSON.stringify(id + '-a')},
          role: 'assistant',
          createdAt: now - 2000,
          model: 'deepseek-flash',
          thinking: false,
          prefix: true,
          status: 'done',
          blocks: [{ type: 'text', text: ${JSON.stringify(answer)} }],
          usage: ${JSON.stringify(usage)}
        }
      ]
    })
    tx.objectStore('sessionSummaries').put({
      id: ${JSON.stringify(id)},
      title: ${JSON.stringify(title)},
      createdAt: now,
      updatedAt: now
    })
    tx.oncomplete = function () { db.close(); resolve(true) }
    tx.onerror = function () { reject(tx.error) }
  }
})`

const openDrawer = `(function () {
  var btn = document.querySelector('button[aria-label="打开边栏"]')
  if (btn) btn.click()
})()`

const clickSession = async (title) => {
  const spot = await evaluate(`(function () {
    var nodes = document.querySelectorAll('div')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === ${JSON.stringify(title)}) {
        var rect = nodes[i].getBoundingClientRect()
        if (rect.width < 10 || rect.height < 10 || rect.x < 0) continue
        return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
      }
    }
    return null
  })()`)
  if (!spot) return false
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: spot.x, y: spot.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: spot.x, y: spot.y, button: 'left', clickCount: 1 })
  return true
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  })
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  // 不填 Key：余额位应显示 --；上下文上限写进缓存，供圆环算百分比
  await evaluate(`localStorage.setItem('chat-demo:context-window', JSON.stringify({
    model: 'deepseek-flash', value: 128000, at: Date.now()
  }))`)
  await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '我知道了') { nodes[i].click(); return true }
    }
    return false
  })()`)
  await sleep(400)

  check('塞进一条带用量的会话', (await evaluate(seed('probe-u1', '用量检查', ANSWER, USAGE))) === true)

  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  await sleep(500)
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await evaluate(openDrawer)
  await sleep(600)
  await waitFor(bodyHas('用量检查'))
  check('点开了会话', await clickSession('用量检查'))
  await waitFor(bodyHas(ANSWER))
  await sleep(600)

  check('状态栏出现余额位（无 Key 时为 --）', await evaluate(bodyHas('--')))
  check('圆环按缓存上限算出 51%', await evaluate(bodyHas('51%')))
  check('状态栏里有圆环 SVG', (await evaluate(`document.querySelectorAll('svg').length`)) >= 1)

  // 点圆环：无 Key 时要给出「先填 Key」的提示，不能静默
  await evaluate(`(function () {
    var buttons = document.querySelectorAll('button')
    for (var i = 0; i < buttons.length; i++) {
      if ((buttons[i].textContent || '').indexOf('%') >= 0) { buttons[i].click(); return true }
    }
    return false
  })()`)
  await sleep(400)
  check('点圆环提示先填 API Key', await evaluate(bodyHas('先在设置里填 API Key')))

  // ---- 阶段 2：网络挂起时，加载态必须收敛，不能永远停在 … ----
  await evaluate(`localStorage.setItem('chat-demo:api-key', 'sk-probe-not-real')`)
  await evaluate(`localStorage.removeItem('chat-demo:context-window')`)
  await send('Fetch.enable', { patterns: [{ urlPattern: '*api.deepseek.com*' }] })
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  // 余额 8 秒超时、/models 5 秒超时；留 9 秒余量
  await sleep(9000)
  const balanceText = await evaluate(
    `(document.querySelector('[data-role="usage-balance"]') || {}).textContent || ''`
  )
  const percentText = await evaluate(
    `(document.querySelector('[data-role="usage-percent"]') || {}).textContent || ''`
  )
  check('网络挂起 9 秒后余额不再是 …（超时收敛）', balanceText !== '…', balanceText)
  check('网络挂起 9 秒后圆环不再是 …（超时收敛）', percentText !== '…', percentText)
  await send('Fetch.disable')

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(SHOT, Buffer.from(shot.result.data, 'base64'))

  const failed = results.filter((ok) => !ok).length
  console.log(`\n${results.length - failed}/${results.length} 通过`)
  process.exitCode = failed === 0 ? 0 : 1
} catch (error) {
  console.error('探针异常：', error)
  process.exitCode = 1
} finally {
  ws.close()
  chrome.kill()
  server.kill()
}
