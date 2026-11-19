// 探针：设置里的「版本 + 检查更新」有没有正确渲染、链接指向对不对。
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
const SHOT = join(REPO, 'screenshots', 'settings-update-row.png')
const RELEASES = 'https://github.com/KhalilYamber/DeepSeek-APP-Replica/releases/latest'

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
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  await sleep(600)

  // 没填过 Key 时设置弹窗会自动打开；切到「通用设置」
  const tabbed = await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '通用设置') { nodes[i].click(); return true }
    }
    return false
  })()`)
  check('切到「通用设置」', tabbed)
  await sleep(400)

  const version = await evaluate(
    `(function () {
      var meta = document.querySelector('meta[name="application-version"]')
      return meta ? meta.getAttribute('content') : null
    })()`
  )
  check('页面里能读到版本号', typeof version === 'string' && version.length > 0, version)

  const info = await evaluate(`(function () {
    var links = document.querySelectorAll('a')
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('href') === ${JSON.stringify(RELEASES)}) {
        return {
          text: (links[i].textContent || '').trim(),
          target: links[i].getAttribute('target'),
          rel: links[i].getAttribute('rel'),
          row: (links[i].closest('div') || {}).textContent || ''
        }
      }
    }
    return null
  })()`)
  check('「检查更新」链接存在且指向 releases/latest', info !== null)
  check('链接文案是「检查更新」', info?.text === '检查更新', info?.text)
  check('在新窗口打开（交给系统浏览器）', info?.target === '_blank' && (info?.rel || '').includes('noreferrer'))
  check('同一行显示了版本号', (info?.row || '').includes(version || 'x'), info?.row?.slice(0, 40))

  // 点一下：网页版会新开标签页，这里只确认点击没把当前页导航走
  const before = await evaluate('location.pathname')
  await evaluate(`(function () {
    var links = document.querySelectorAll('a')
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('href') === ${JSON.stringify(RELEASES)}) { links[i].click(); return true }
    }
    return false
  })()`)
  await sleep(800)
  const after = await evaluate('location.pathname')
  check('点击后当前页面没有被导航走', before === after, `${before} → ${after}`)

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(SHOT, Buffer.from(shot.result.data, 'base64'))
  console.log(`截图：${SHOT}`)

  // 再滚到「检查更新」那一行拍一张：它在设置页最底部
  await evaluate(`(function () {
    var links = document.querySelectorAll('a')
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('href') === ${JSON.stringify(RELEASES)}) {
        links[i].scrollIntoView({ block: 'center' })
        return true
      }
    }
    return false
  })()`)
  await sleep(500)
  const shot2 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(SHOT.replace('.png', '-scrolled.png'), Buffer.from(shot2.result.data, 'base64'))
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
