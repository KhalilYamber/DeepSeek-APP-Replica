// 探针：设置页「个性化」——分组导航、字体四档、背景入口。
// 用法：先 pnpm build，再 node _probe/personalize.mjs
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9590
const WEB_PORT = 8160
const PROFILE = join(tmpdir(), 'personalize-probe-profile')

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
await send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }] })

await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
await sleep(1400)
await evaluate(`
  localStorage.setItem('chat-demo:disclaimer-ack', '1');
  localStorage.setItem('chat-demo:api-key', 'sk-probe-000000000000');
  true
`)
await send('Page.reload')
await sleep(1600)

// 打开侧栏 → 设置
await evaluate(`document.querySelectorAll('button')[0]?.click(); true`)
await sleep(500)
await evaluate(`
  (() => {
    const buttons = [...document.querySelectorAll('button')]
    const target = buttons.find((b) => (b.textContent || '').trim() === '设置')
    target?.click()
    return !!target
  })()
`)
await sleep(700)

const navTexts = await evaluate(`
  [...document.querySelectorAll('[role="tab"]')].map((el) => (el.textContent || '').trim())
`)
check('设置导航有「个性化」', Array.isArray(navTexts) && navTexts.includes('个性化'), JSON.stringify(navTexts))

// 切到个性化
await evaluate(`
  (() => {
    const tab = [...document.querySelectorAll('[role="tab"]')].find((el) => (el.textContent || '').includes('个性化'))
    tab?.click()
    return !!tab
  })()
`)
await sleep(500)

const bodyText = await evaluate(`document.body.innerText`)
check('个性化里有「字体大小」', bodyText.includes('字体大小'))
check('个性化里有「对话背景」', bodyText.includes('对话背景'))
check('个性化里有「朗读音色」', bodyText.includes('朗读音色'))
check('个性化里有「思考结束后」', bodyText.includes('思考结束'))

// 点「大」档，验证正文与存储
await evaluate(`
  (() => {
    const buttons = [...document.querySelectorAll('[role="radio"]')]
    const target = buttons.find((b) => (b.textContent || '').trim() === '大')
    target?.click()
    return !!target
  })()
`)
await sleep(400)

await evaluate(`
  (() => {
    document.getElementById('probe-md')?.remove()
    const box = document.createElement('div')
    box.id = 'probe-md'
    box.className = 'ds-markdown'
    box.innerHTML = '<p id="probe-p">正文</p>'
    document.body.appendChild(box)
    return true
  })()
`)
const size = await evaluate(`getComputedStyle(document.getElementById('probe-p')).fontSize`)
check('选「大」后正文变 18px', size === '18px', size)
const stored = await evaluate(`localStorage.getItem('chat-demo:reading-scale')`)
check('档位写进了本地存储', stored === 'large', String(stored))

const shot = await send('Page.captureScreenshot', { format: 'png' })
if (shot.result?.data) {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(join(REPO, 'screenshots', 'personalize.png'), Buffer.from(shot.result.data, 'base64'))
  console.log('截图: screenshots/personalize.png')
}

// ---- 背景图：注入一张渐变图，重载后应渲染在内容下面并带遮罩 ----
const dataUrl = await evaluate(`(() => {
  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 640
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 360, 640)
  gradient.addColorStop(0, '#3b82f6')
  gradient.addColorStop(1, '#ec4899')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 360, 640)
  return canvas.toDataURL('image/jpeg', 0.8)
})()`)
await evaluate(`localStorage.setItem('chat-demo:chat-background', ${JSON.stringify(dataUrl)}); true`)
await send('Page.reload')
await sleep(1700)

const bg = await evaluate(`(() => {
  const main = document.querySelector('main')
  const img = main ? main.querySelector('img') : null
  if (!img) return null
  const layer = img.parentElement?.children?.[1]
  return {
    src: (img.getAttribute('src') || '').slice(0, 24),
    opacity: layer ? getComputedStyle(layer).opacity : null,
  }
})()`)
check('背景图渲染进主区域', !!bg && bg.src.startsWith('data:image/jpeg'), bg ? bg.src : '未找到')
check('遮罩按默认 40% 生效', !!bg && bg.opacity !== null && Math.abs(Number(bg.opacity) - 0.4) < 0.02, bg ? String(bg.opacity) : '未找到')

const bgShot = await send('Page.captureScreenshot', { format: 'png' })
if (bgShot.result?.data) {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(join(REPO, 'screenshots', 'background.png'), Buffer.from(bgShot.result.data, 'base64'))
  console.log('截图: screenshots/background.png')
}

const failed = results.filter((r) => !r).length
console.log(`\n个性化探针 ${results.length - failed}/${results.length}`)

ws.close()
chrome.kill()
server.kill()
await sleep(300)
process.exit(failed === 0 ? 0 : 1)
