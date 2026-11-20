// 探针：公式渲染——裸 LaTeX 识别、行内/块级公式、普通文本与代码块不被误伤、失败降级。
// 用法：先 pnpm build，再 node _probe/math-render.mjs
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9575
const WEB_PORT = 8141
const PROFILE = join(tmpdir(), 'math-probe-profile')
const SHOT = join(REPO, 'screenshots', 'math-render.png')

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
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.text)
  return res.result?.result?.value
}
const waitFor = async (expression, timeoutMs = 15000) => {
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
const bodyHas = (text) => `(document.body.textContent || '').indexOf(${JSON.stringify(text)}) >= 0`

const B = String.fromCharCode(92)
const USER_TEX = `${B}small${B}textcolor{#b2b2b2}{${B}texttt{上海·新家客厅 ${B};${B},2016.1.2${B},${B};17:03}}`
const PLAIN_SENTENCE = `你可以用 ${B}frac{a}{b} 这样写。`
const BLOCK_TEX = `${B}frac{a}{b}=1`
const UNKNOWN_CMD = `${B}cancelto{a}{b}`

const ANSWER = [
  USER_TEX,
  '行内公式 $E=mc^2$ 结束。',
  `$$\n${BLOCK_TEX}\n$$`,
  PLAIN_SENTENCE,
  `${String.fromCharCode(96).repeat(3)}latex\n${B}frac{a}{b}\n${String.fromCharCode(96).repeat(3)}`,
  `$${UNKNOWN_CMD}$`,
].join('\n\n')

const seed = (id, title, answer) => `new Promise(function (resolve, reject) {
  var req = indexedDB.open('chat-demo', 11)
  req.onerror = function () { reject(req.error) }
  req.onsuccess = function () {
    var db = req.result
    var now = Date.now()
    var tx = db.transaction(['sessions', 'sessionSummaries'], 'readwrite')
    tx.objectStore('sessions').put({
      id: ${JSON.stringify(id)},
      title: ${JSON.stringify(title)},
      createdAt: now,
      updatedAt: now,
      messages: [
        { id: ${JSON.stringify(id + '-u')}, role: 'user', content: '公式渲染检查', files: [], createdAt: now - 3000 },
        {
          id: ${JSON.stringify(id + '-a')},
          role: 'assistant',
          createdAt: now - 2000,
          model: 'deepseek-flash',
          thinking: false,
          prefix: true,
          status: 'done',
          blocks: [{ type: 'text', text: ${JSON.stringify(answer)} }]
        }
      ]
    })
    tx.objectStore('sessionSummaries').put({
      id: ${JSON.stringify(id)},
      title: ${JSON.stringify(title)},
      createdAt: now,
      updatedAt: now
    })
    tx.oncomplete = function () { db.close(); resolve(true) }
    tx.onerror = function () { reject(tx.error) }
  }
})`

const openDrawer = `(function () {
  var btn = document.querySelector('button[aria-label="打开边栏"]')
  if (btn) btn.click()
})()`

const clickSession = async (title) => {
  const spot = await evaluate(`(function () {
    var nodes = document.querySelectorAll('div')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === ${JSON.stringify(title)}) {
        var rect = nodes[i].getBoundingClientRect()
        if (rect.width < 10 || rect.height < 10 || rect.x < 0) continue
        return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
      }
    }
    return null
  })()`)
  if (!spot) return false
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: spot.x, y: spot.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: spot.x, y: spot.y, button: 'left', clickCount: 1 })
  return true
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
  // 填个假 Key：没 Key 时应用会自动弹设置窗，挡住后面的点击
  await evaluate(`localStorage.setItem('chat-demo:api-key', 'sk-probe-not-real')`)
  // 首启须知：先点掉
  await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '我知道了') { nodes[i].click(); return true }
    }
    return false
  })()`)
  await sleep(400)

  check('塞进一条公式会话', (await evaluate(seed('probe-m1', '公式渲染检查', ANSWER))) === true)

  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  await sleep(500)
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await evaluate(openDrawer)
  await sleep(600)
  await waitFor(bodyHas('公式渲染检查'))
  check('点开了公式会话', await clickSession('公式渲染检查'))
  await waitFor(bodyHas('上海·新家客厅'))
  await sleep(800)

  const katexCount = await evaluate(`document.querySelectorAll('.katex').length`)
  check('至少 3 处公式渲染出来（裸 LaTeX / 行内 / 块级）', katexCount >= 3, `katex=${katexCount}`)

  // KaTeX 会在 MathML 的 <annotation> 里保留原文（视觉隐藏），所以只看 katex-html 的可见文本
  const visible = await evaluate(`(function () {
    var html = document.querySelector('.katex-html')
    return html ? html.textContent || '' : ''
  })()`)
  check(
    '裸 LaTeX 渲染后可见部分没有反斜杠命令',
    visible.indexOf(`${B}small`) < 0 && visible.indexOf(`${B}textcolor`) < 0,
    visible.slice(0, 40)
  )
  check('裸 LaTeX 的地点文字还在（中点已归一化为 ⋅）', visible.indexOf('上海') >= 0 && visible.indexOf('新家客厅') >= 0)

  check(
    '普通句子里的 LaTeX 保持原文（整段匹配不误伤）',
    await evaluate(bodyHas(PLAIN_SENTENCE))
  )

  const preText = await evaluate(`(function () {
    var pre = document.querySelector('pre')
    return pre ? pre.textContent || '' : ''
  })()`)
  check('代码块里的 LaTeX 保持原文', preText.indexOf(`${B}frac{a}{b}`) >= 0, preText.trim().slice(0, 20))

  const redCount = await evaluate(`document.querySelectorAll('[mathcolor="#cc0000"]').length`)
  check('不支持的命令标红而不是整条消失', redCount >= 1, `red=${redCount}`)

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(SHOT, Buffer.from(shot.result.data, 'base64'))

  const failed = results.filter((ok) => !ok).length
  console.log(`\n${results.length - failed}/${results.length} 通过`)
  process.exitCode = failed === 0 ? 0 : 1
} catch (error) {
  console.error('探针异常：', error)
  process.exitCode = 1
} finally {
  ws.close()
  chrome.kill()
  server.kill()
}
