// 探针：四边安全区——变量链路、主容器留白、侧栏抽屉让位。
// 用法：先 pnpm build，再 node _probe/safe-area.mjs
// 环境：无头 Chrome（模拟 390×844 移动视口）。真机验证另行进行。
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9586
const WEB_PORT = 8156
const PROFILE = join(tmpdir(), 'safe-area-probe-profile')
const SHOT = join(REPO, 'screenshots', 'safe-area-drawer.png')
const SAFE_TOP = 44

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
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
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
await send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }] })

await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
await sleep(1200)

// 首启须知与「没填 Key 自动弹设置」都会挡住点击，先写掉两条本地状态再重载
await evaluate(`
  localStorage.setItem('chat-demo:disclaimer-ack', '1');
  localStorage.setItem('chat-demo:api-key', 'sk-probe-000000000000');
  true
`)
await send('Page.reload')
await sleep(1600)

const ready = await evaluate(`!!document.querySelector('#root > div')`)
check('页面渲染出主容器', ready === true, String(ready))

const before = await evaluate(
  `getComputedStyle(document.documentElement).getPropertyValue('--app-safe-top').trim()`
)
check('未注入时安全区为 0', before === '0px', `实际 "${before}"`)

await evaluate(
  `document.documentElement.style.setProperty('--safe-area-inset-top', '${SAFE_TOP}px'); true`
)
const after = await evaluate(
  `getComputedStyle(document.documentElement).getPropertyValue('--app-safe-top').trim()`
)
check('注入系统状态栏后变量跟随', after === `${SAFE_TOP}px`, `实际 "${after}"`)

const framePad = await evaluate(
  `getComputedStyle(document.querySelector('#root > div')).paddingTop`
)
check('主容器让出状态栏', framePad === `${SAFE_TOP}px`, `实际 "${framePad}"`)

// 打开侧栏抽屉（移动端顶栏第一个按钮是汉堡）
await evaluate(`document.querySelectorAll('button')[0]?.click(); true`)
let drawer = null
for (let i = 0; i < 40; i++) {
  drawer = await evaluate(`
    (() => {
      const el = document.querySelector('[class*="drawer-"]')
      if (!el) return null
      const rect = el.getBoundingClientRect()
      return { top: Math.round(rect.top), height: Math.round(rect.height) }
    })()
  `)
  if (drawer) break
  await sleep(100)
}
check('抽屉已打开', drawer !== null, drawer ? JSON.stringify(drawer) : '没找到')
if (drawer) {
  check('抽屉顶部让出状态栏', drawer.top === SAFE_TOP, `实际 top=${drawer.top}`)
}

const shot = await send('Page.captureScreenshot', { format: 'png' })
if (shot.result?.data) {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(SHOT, Buffer.from(shot.result.data, 'base64'))
  console.log(`截图: ${SHOT}`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n安全区探针 ${results.length - failed.length}/${results.length}`)

ws.close()
chrome.kill()
server.kill()
await sleep(300)
process.exit(failed.length === 0 ? 0 : 1)
