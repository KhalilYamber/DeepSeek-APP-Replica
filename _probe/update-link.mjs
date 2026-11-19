// 探针：设置里的「版本 + 检查更新」——行、说明面板、复制链接、去打开的链接。
// 用法：先 pnpm build，再 node _probe/update-link.mjs
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
const PORT = 9574
const WEB_PORT = 8140
const PROFILE = join(tmpdir(), 'update-probe-profile')
const SHOTS = join(REPO, 'screenshots')
const RELEASES = 'https://github.com/KhalilYamber/DeepSeek-APP-Replica/releases/latest'

await rm(PROFILE, { recursive: true, force: true })
await mkdir(SHOTS, { recursive: true })

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
const shot = async (name) => {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(join(SHOTS, name), Buffer.from(res.result.data, 'base64'))
}

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const bodyHas = (text) => `(document.body.textContent || '').indexOf(${JSON.stringify(text)}) >= 0`
const clickByText = (text) => `(function () {
  var nodes = document.querySelectorAll('button')
  for (var i = 0; i < nodes.length; i++) {
    if ((nodes[i].textContent || '').trim() === ${JSON.stringify(text)}) { nodes[i].click(); return true }
  }
  return false
})()`

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
  await sleep(600)

  check('切到「通用设置」', await evaluate(clickByText('通用设置')))
  await sleep(400)

  // ---- 第一段：网页版（没有 androidBridge）——这一行不该出现 ----
  const rowInWeb = await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '检查更新') { return true }
    }
    return false
  })()`)
  check('网页版里没有「检查更新」这一行', rowInWeb === false)

  // ---- 第二段：伪装成 Android（Capacitor 靠 window.androidBridge 判定）----
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.androidBridge = { postMessage: function () {} }',
  })
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  await sleep(600)
  check('（伪装环境）切到「通用设置」', await evaluate(clickByText('通用设置')))
  await sleep(400)

  const version = await evaluate(
    `(function () {
      var meta = document.querySelector('meta[name="application-version"]')
      return meta ? meta.getAttribute('content') : null
    })()`
  )
  check('页面里能读到版本号', typeof version === 'string' && version.length > 0, version)

  const row = await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '检查更新') {
        return { row: (nodes[i].closest('div') || {}).textContent || '' }
      }
    }
    return null
  })()`)
  check('行上有「检查更新」按钮', row !== null)
  check('同一行显示版本号', (row?.row || '').includes(version || 'x'), (row?.row || '').slice(0, 30))

  // 滚到底拍一张：这一行在设置页最底部
  await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '检查更新') { nodes[i].scrollIntoView({ block: 'center' }); return }
    }
  })()`)
  await sleep(400)
  await shot('settings-update-row-scrolled.png')

  // 点开说明面板
  check('点了「检查更新」', await evaluate(clickByText('检查更新')))
  const panel = await waitFor(bodyHas('接下来会用浏览器打开 GitHub 的下载页'))
  check('弹出说明面板（讲了会发生什么）', panel >= 0)
  check('提到了打不开不是 App 坏了', await evaluate(bodyHas('不是 App 坏了')))
  check('给了「复制链接」这条退路', await evaluate(bodyHas('复制链接')))
  check('面板里能看到链接本身', await evaluate(bodyHas(RELEASES)))

  const openLink = await evaluate(`(function () {
    var links = document.querySelectorAll('a')
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('href') === ${JSON.stringify(RELEASES)}) {
        return { text: (links[i].textContent || '').trim(), target: links[i].getAttribute('target'), rel: links[i].getAttribute('rel') }
      }
    }
    return null
  })()`)
  check('「去打开」是链接且指向 releases/latest', openLink !== null, openLink?.text)
  check('「去打开」在新窗口打开', openLink?.target === '_blank' && (openLink?.rel || '').includes('noreferrer'))
  await shot('settings-update-panel.png')

  // 复制链接：剪贴板不通也要有提示
  await evaluate(clickByText('复制链接'))
  const toast = await waitFor(
    `(document.body.textContent || '').indexOf('链接已复制') >= 0 || (document.body.textContent || '').indexOf('复制失败') >= 0`
  )
  check('复制后给了提示（成功或失败都有话说）', toast >= 0)
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
