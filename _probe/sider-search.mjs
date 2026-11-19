// 探针：手机视口下打开侧栏抽屉，确认「搜索历史对话」入口存在并真的触发查询。
// 用法：先 pnpm build，再 node _probe/sider-search.mjs
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
const PORT = 9571
const WEB_PORT = 8137
const PROFILE = join(tmpdir(), 'sider-search-profile')
const SHOT = join(REPO, 'screenshots', 'sider-search-apk.png')

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
  const mounted = await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  check('手机视口下界面挂载', mounted >= 0, `${mounted}ms`)

  // 首次打开会自动弹出「填 API Key」的设置弹窗，先按 Esc 关掉，否则点不到抽屉
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(300)
  const modal = await evaluate(`document.querySelector('[role="dialog"]') !== null`)
  check('设置弹窗已关掉（可以点抽屉了）', !modal)

  await evaluate(`(function () {
    var btn = document.querySelector('button[aria-label="打开边栏"]')
    if (btn) btn.click()
    return !!btn
  })()`)
  const box = await waitFor(`document.querySelector('input[aria-label="搜索历史对话"]')`)
  check('抽屉里出现「搜索历史对话」输入框', box >= 0, `${box}ms`)

  // React 受控输入要用原生 setter 再派发 input 事件，否则 value 改了但组件不知道
  await evaluate(`(function () {
    var input = document.querySelector('input[aria-label="搜索历史对话"]')
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '物理化学')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return input.value
  })()`)
  const hint = await waitFor(
    `(function () {
      var node = document.querySelector('[class*="searchHint"]')
      return node && node.textContent.indexOf('正在搜索') < 0
    })()`
  )
  const hintText = await evaluate(
    `(document.querySelector('[class*="searchHint"]') || { textContent: '' }).textContent`
  )
  check('输入后查完了（空库时给「没有找到」）', hint >= 0, `${hintText}`)

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(SHOT, Buffer.from(shot.result.data, 'base64'))
  console.log(`截图：${SHOT}`)
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
