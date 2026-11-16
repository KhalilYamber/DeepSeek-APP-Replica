// 通过 adb + WebView DevTools 在 APK 内部执行 JS，用于自动化自测。
// usage: node webview-eval.mjs "<表达式>"
import { execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const ADB = 'D:\\android-sdk\\platform-tools\\adb.exe'
const PORT = 9222
const expr = process.argv[2] ?? 'document.title'

const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8' })

const findSocket = () => {
  const out = adb('shell', 'cat', '/proc/net/unix')
  const matches = [...out.matchAll(/@?(webview_devtools_remote_\d+)/g)].map((m) => m[1])
  if (!matches.length) throw new Error('找不到 WebView 调试 socket（App 没启动或不是 debug 包）')
  return matches[0]
}

const socket = findSocket()
adb('forward', `tcp:${PORT}`, `localabstract:${socket}`)
console.log(`forwarded ${socket} -> tcp:${PORT}`)

let list = null
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json`)
    list = await r.json()
    if (list.length) break
  } catch {}
  await sleep(250)
}
if (!list || !list.length) throw new Error('DevTools 没有返回页面列表')

const page = list.find((p) => p.type === 'page') ?? list[0]
console.log(`page: ${page.title} ${page.url}`)

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', rej)
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
  new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })

const result = await send('Runtime.evaluate', {
  expression: expr,
  returnByValue: true,
  awaitPromise: true,
})
if (result.result?.exceptionDetails) {
  console.error('EXCEPTION:', JSON.stringify(result.result.exceptionDetails, null, 2))
} else {
  const value = result.result?.result?.value
  console.log('RESULT:', typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}
ws.close()
