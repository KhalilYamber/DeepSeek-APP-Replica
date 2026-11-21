// 探针：草稿跨刷新保留。以前草稿只在内存里，刷新或 App 被回收就没了。
// 用法：先 pnpm build，再 node _probe/draft-persist.mjs
import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9591
const WEB_PORT = 8161
const PROFILE = join(tmpdir(), 'draft-persist-probe-profile')
const DRAFT = '这是一段还没发出去的草稿\n第二行也算'

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
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (res.result?.exceptionDetails) {
    throw new Error(`${res.result.exceptionDetails.text}: ${expression.slice(0, 120)}`)
  }
  return res.result?.result?.value
}

const results = []
const check = (name, pass, detail = '') => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
})
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
await sleep(1400)
await evaluate(`
  localStorage.setItem('chat-demo:disclaimer-ack', '1');
  localStorage.setItem('chat-demo:api-key', 'sk-probe-000000000000');
  true
`)
await send('Page.reload')
await sleep(1600)

// 往欢迎页的输入框里打一段字（走 React 的受控链路）
const typed = await evaluate(`(function () {
  var el = document.querySelector('textarea')
  if (!el) return false
  var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, ${JSON.stringify(DRAFT)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)
check('找到输入框并写入草稿', typed === true)

// 防抖是 400ms，等它落盘
await sleep(900)
const stored = await evaluate(`localStorage.getItem('chat-demo:drafts')`)
check('草稿写进了本地存储', typeof stored === 'string' && stored.includes('还没发出去的草稿'), String(stored || '').slice(0, 60))

// 刷新后应该还在
await send('Page.reload')
await sleep(1700)
const restored = await evaluate(`(function () {
  var el = document.querySelector('textarea')
  return el ? el.value : null
})()`)
check('刷新后草稿还在', restored === DRAFT, JSON.stringify(restored))

// 清空草稿 → 存储里的记录也应该消失
await evaluate(`(function () {
  var el = document.querySelector('textarea')
  if (!el) return false
  var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, '')
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)
await sleep(900)
const cleared = await evaluate(`localStorage.getItem('chat-demo:drafts')`)
check('清空后存储里的键被删掉', cleared === null, String(cleared))

const failed = results.filter((r) => !r).length
console.log(`\n草稿持久化探针 ${results.length - failed}/${results.length}`)

ws.close()
chrome.kill()
server.kill()
await sleep(300)
process.exit(failed === 0 ? 0 : 1)
