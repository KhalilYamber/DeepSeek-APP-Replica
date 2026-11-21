// 探针：字号四档。验证 font 简写里的 calc(var()) 在构建产物里真的生效，
// 并且标题、表格、输入框都跟着同一档位缩放。
// 用法：先 pnpm build，再 node _probe/font-scale.mjs
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9589
const WEB_PORT = 8159
const PROFILE = join(tmpdir(), 'font-scale-probe-profile')

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

// 造一个 markdown 容器（.ds-markdown 是全局类名，不依赖真实会话）
await evaluate(`
  (() => {
    document.getElementById('probe-md')?.remove()
    const box = document.createElement('div')
    box.id = 'probe-md'
    box.className = 'ds-markdown'
    box.innerHTML = '<h1 id="probe-h1">标题</h1><p id="probe-p">正文一行</p><table><tr><td id="probe-td">格子</td></tr></table>'
    document.body.appendChild(box)
    return true
  })()
`)

const readSizes = `(() => {
  const md = document.getElementById('probe-md')
  const input = document.querySelector('[class*="wrapper-"]')
  return {
    base: getComputedStyle(md).fontSize,
    baseLine: getComputedStyle(md).lineHeight,
    h1: getComputedStyle(document.getElementById('probe-h1')).fontSize,
    table: getComputedStyle(document.getElementById('probe-td')).fontSize,
    input: input ? getComputedStyle(input).fontSize : null,
  }
})()`

const setScale = async (scale) => {
  await evaluate(`document.documentElement.style.setProperty('--app-reading-scale', '${scale}'); true`)
  await sleep(80)
  return evaluate(readSizes)
}

const standard = await setScale(1)
check('标准档正文 16px', standard.base === '16px', standard.base)
check('标准档行高 28px', standard.baseLine === '28px', standard.baseLine)
check('标准档 h1 24px', standard.h1 === '24px', standard.h1)
check('标准档表格 15px', standard.table === '15px', standard.table)

const small = await setScale(0.875)
check('小档正文 14px', small.base === '14px', small.base)
check('小档 h1 21px', small.h1 === '21px', small.h1)
check('小档输入框仍不低于 16px', small.input !== null && parseFloat(small.input) >= 16, String(small.input))

const large = await setScale(1.125)
check('大档正文 18px', large.base === '18px', large.base)
check('大档输入框 18px', large.input === '18px', String(large.input))

const xlarge = await setScale(1.25)
check('特大档正文 20px', xlarge.base === '20px', xlarge.base)
check('特大档 h1 30px', xlarge.h1 === '30px', xlarge.h1)
check('特大档表格 18.75px', xlarge.table === '18.75px', xlarge.table)

// 层级不倒挂：任何档位下标题都必须大于正文
const order = [small, standard, large, xlarge].every(
  (item) => parseFloat(item.h1) > parseFloat(item.base)
)
check('四档下标题都大于正文（不倒挂）', order, order ? 'ok' : 'h1 <= base')

const failed = results.filter((r) => !r).length
console.log(`\n字号探针 ${results.length - failed}/${results.length}`)

ws.close()
chrome.kill()
server.kill()
await sleep(300)
process.exit(failed === 0 ? 0 : 1)
