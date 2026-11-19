// 探针：已完成的消息里，思考默认收起；点标题能展开。
// 用法：先 pnpm build，再 node _probe/thinking-collapse.mjs
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
const PORT = 9573
const WEB_PORT = 8139
const PROFILE = join(tmpdir(), 'thinking-probe-profile')
const SHOT = join(REPO, 'screenshots', 'thinking-collapsed.png')

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
const waitFor = async (expression, timeoutMs = 10000) => {
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

const THINK = '这段是思考内容ABC'
const ANSWER = '这是最终的回答。'
const TITLE = '已思考'
const bodyHas = (text) => `(document.body.textContent || '').indexOf(${JSON.stringify(text)}) >= 0`

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

  const seeded = await evaluate(`new Promise(function (resolve, reject) {
    var req = indexedDB.open('chat-demo', 11)
    req.onerror = function () { reject(req.error) }
    req.onsuccess = function () {
      var db = req.result
      var now = Date.now()
      var tx = db.transaction(['sessions', 'sessionSummaries'], 'readwrite')
      tx.objectStore('sessions').put({
        id: 'probe-thinking',
        title: '思考折叠检查',
        createdAt: now,
        updatedAt: now,
        messages: [
          { id: 't-u', role: 'user', content: '测试一下', files: [], createdAt: now - 3000 },
          {
            id: 't-a',
            role: 'assistant',
            createdAt: now - 2000,
            model: 'deepseek-flash',
            thinking: true,
            prefix: true,
            status: 'done',
            blocks: [
              { type: 'thinking', thinking: ${JSON.stringify(THINK)}, startedAt: now - 2000, endedAt: now - 1000 },
              { type: 'text', text: ${JSON.stringify(ANSWER)} }
            ]
          }
        ]
      })
      tx.objectStore('sessionSummaries').put({
        id: 'probe-thinking',
        title: '思考折叠检查',
        createdAt: now,
        updatedAt: now
      })
      tx.oncomplete = function () { db.close(); resolve(true) }
      tx.onerror = function () { reject(tx.error) }
    }
  })`)
  check('塞进一条带思考的已完成会话', seeded === true)

  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  await sleep(400)
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(200)
  await evaluate(`(function () {
    var btn = document.querySelector('button[aria-label="打开边栏"]')
    if (btn) btn.click()
  })()`)
  await waitFor(bodyHas('思考折叠检查'))
  const spot = await evaluate(`(function () {
    var nodes = document.querySelectorAll('div')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '思考折叠检查') {
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
  await waitFor(bodyHas(ANSWER))
  check('会话打开了，回答正文可见', await evaluate(bodyHas(ANSWER)))

  const titleThere = await waitFor(bodyHas(TITLE))
  check('标题「已思考…」在', titleThere >= 0)

  const hidden = !(await evaluate(bodyHas(THINK)))
  check('思考内容默认收起（正文里搜不到）', hidden)

  // 先拍收起态，再点开拍展开态
  const collapsedShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(SHOT, Buffer.from(collapsedShot.result.data, 'base64'))

  // 点标题展开
  await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').indexOf(${JSON.stringify(TITLE)}) >= 0) { nodes[i].click(); return true }
    }
    return false
  })()`)
  const shown = await waitFor(bodyHas(THINK))
  check('点标题后思考内容出现', shown >= 0)

  const expandedShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(SHOT.replace('collapsed', 'expanded'), Buffer.from(expandedShot.result.data, 'base64'))
  console.log(`截图：${SHOT} 与 …-expanded.png`)
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
