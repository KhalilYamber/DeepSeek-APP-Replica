// CDP-based screenshot: precise device emulation, reusable for later automation.
// usage: node shot.mjs <url> <out.png> [width] [height] [deviceScaleFactor]
import { spawn } from 'node:child_process'
import { writeFile, rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome')
const [url, out, wArg, hArg, dsfArg] = process.argv.slice(2)
if (!url || !out) {
  console.error('usage: node shot.mjs <url> <out.png> [w] [h] [dsf]')
  process.exit(1)
}
const width = Number(wArg ?? 390)
const height = Number(hArg ?? 844)
const dsf = Number(dsfArg ?? 2)
const port = 9500 + Math.floor(Math.random() * 200)
// profile 放系统临时目录：原先放在截图旁边（`${out}.profile`），而 Windows 上
// Chrome 刚被杀时常还攥着目录，rm 失败被 catch 吞掉，于是 screenshots/ 里越积越多。
// 放临时目录后即便删不掉也只脏系统盘，不会混进验收截图。
const prof = join(tmpdir(), `shot-profile-${port}`)
if (existsSync(prof)) await rm(prof, { recursive: true, force: true })

const child = spawn(
  CHROME,
  [
    // Chrome 157 上 `--headless=new` 起不来 DevTools，`--headless` 可以
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--disable-dev-shm-usage',
    '--mute-audio',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${prof}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
)

const cleanup = async (code) => {
  try { child.kill() } catch {}
  // Windows 上 Chrome 刚被杀时还攥着 profile，过一会儿才放（实测 150ms 不够）。
  // 重试几次；仍失败就算了——它在系统临时目录，不会污染项目。
  for (let i = 0; i < 4; i++) {
    await sleep(250)
    try { await rm(prof, { recursive: true, force: true }); break } catch {}
  }
  process.exit(code)
}

let targets = null
for (let i = 0; i < 80; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/list`)
    targets = await r.json()
    if (targets && targets.some((t) => t.type === 'page')) break
  } catch {}
  await sleep(250)
}
if (!targets) {
  console.error('devtools did not start')
  await cleanup(2)
}
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', rej)
})

let seq = 0
const pending = new Map()
const consoleLines = []
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
    return
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')
    consoleLines.push(`[${msg.params.type}] ${text}`)
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    consoleLines.push(`[exception] ${d.text} ${d.exception?.description ?? ''}`)
  }
})

const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })

await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: dsf,
  mobile: true,
  screenWidth: width,
  screenHeight: height,
})
await send('Page.navigate', { url })
await sleep(7000)

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
if (!shot.result?.data) {
  console.error('capture failed', JSON.stringify(shot))
  await cleanup(3)
}
await writeFile(out, Buffer.from(shot.result.data, 'base64'))
if (consoleLines.length) {
  console.log('--- console ---')
  for (const line of consoleLines.slice(0, 30)) console.log(line)
}
console.log(`saved ${out} (${width}x${height} @${dsf}x)`)
ws.close()
await cleanup(0)
