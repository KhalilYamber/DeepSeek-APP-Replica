// 探针：手机视口下打开设置，确认头像区在，并真上传一张图验证链路（APK 里用的就是这条链路）。
// 用法：先 pnpm build，再 node _probe/avatar-apk.mjs
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
const PORT = 9572
const WEB_PORT = 8138
const PROFILE = join(tmpdir(), 'avatar-probe-profile')
const FIXTURES = join(REPO, '_probe', 'fixtures')
const PNG = join(FIXTURES, 'avatar.png')
const SHOT = join(REPO, 'screenshots', 'avatar-apk.png')

// 1×1 PNG 就够：裁正方形、缩到 160 都只看 naturalWidth/Height 是否大于 0
await rm(PROFILE, { recursive: true, force: true })
await mkdir(FIXTURES, { recursive: true })
await mkdir(join(REPO, 'screenshots'), { recursive: true })
await writeFile(
  PNG,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
)

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

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('DOM.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  })
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })

  // 首次打开没有 API Key，设置弹窗会自动弹出，但停在「数据管理」——头像在「通用设置」里，先切过去
  const dialog = await waitFor(`document.querySelector('[role="dialog"]')`)
  check('设置弹窗自动打开', dialog >= 0, `${dialog}ms`)
  const switched = await evaluate(`(function () {
    var nodes = document.querySelectorAll('[role="dialog"] button')
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].textContent.indexOf('通用设置') >= 0) { nodes[i].click(); return true }
    }
    return false
  })()`)
  check('切到「通用设置」', switched === true)
  const hasRows = await waitFor(
    `(function () {
      var text = (document.querySelector('[role="dialog"]') || { textContent: '' }).textContent
      return text.indexOf('你的头像') >= 0 && text.indexOf('AI 的头像') >= 0
    })()`
  )
  check('头像区出现（你的头像 / AI 的头像）', hasRows >= 0)

  const uploads = await evaluate(
    `document.querySelectorAll('[role="dialog"] input[type="file"]').length`
  )
  check('两个上传入口都在', uploads === 2, `找到 ${uploads} 个`)

  // 真上传：CDP 把文件塞进第一个 input，走应用自己的 onChange → fileToAvatar 那条链路
  const doc = await send('DOM.getDocument')
  const node = await send('DOM.querySelector', {
    nodeId: doc.result.root.nodeId,
    selector: '[role="dialog"] input[type="file"]',
  })
  await send('DOM.setFileInputFiles', { nodeId: node.result.nodeId, files: [PNG] })

  const stored = await waitFor(
    `(function () {
      var value = localStorage.getItem('chat-demo:avatar-user')
      return typeof value === 'string' && value.indexOf('data:image/jpeg') === 0
    })()`
  )
  const length = await evaluate(`(localStorage.getItem('chat-demo:avatar-user') || '').length`)
  check('上传后存成 JPEG dataURL', stored >= 0, `${length} 字符`)

  const reset = await waitFor(
    `(document.querySelector('[role="dialog"]') || { textContent: '' }).textContent.indexOf('恢复默认') >= 0`
  )
  check('出现「恢复默认」按钮', reset >= 0)

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
