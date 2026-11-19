// 探针：思考区的展开/收起——默认态、手动记忆、设置联动。
// 用法：先 pnpm build，再 node _probe/thinking-collapse.mjs
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
const PORT = 9573
const WEB_PORT = 8139
const PROFILE = join(tmpdir(), 'thinking-probe-profile')
const SHOT = join(REPO, 'screenshots', 'thinking-collapsed.png')

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
const bodyHas = (text) => `(document.body.textContent || '').indexOf(${JSON.stringify(text)}) >= 0`

const THINK1 = '这段是思考内容ABC'
const THINK2 = '第二段思考XYZ'
const ANSWER1 = '这是最终的回答。'
const ANSWER2 = '这是第二条回答。'
const TITLE = '已思考'

/** 往库里塞一条会话；id / 标题 / 思考文本 / 回答文本由调用方指定 */
const seed = (id, title, think, answer) => `new Promise(function (resolve, reject) {
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
        { id: ${JSON.stringify(id + '-u')}, role: 'user', content: '测试一下', files: [], createdAt: now - 3000 },
        {
          id: ${JSON.stringify(id + '-a')},
          role: 'assistant',
          createdAt: now - 2000,
          model: 'deepseek-flash',
          thinking: true,
          prefix: true,
          status: 'done',
          blocks: [
            { type: 'thinking', thinking: ${JSON.stringify(think)}, startedAt: now - 2000, endedAt: now - 1000 },
            { type: 'text', text: ${JSON.stringify(answer)} }
          ]
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

/** 抽屉里按标题点会话：条目是 div，按坐标真点 */
const clickSession = async (title) => {
  const spot = await evaluate(`(function () {
    var nodes = document.querySelectorAll('div')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === ${JSON.stringify(title)}) {
        var rect = nodes[i].getBoundingClientRect()
        return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) }
      }
    }
    return null
  })()`)
  if (!spot) {
    return false
  }
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: spot.x, y: spot.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: spot.x, y: spot.y, button: 'left', clickCount: 1 })
  return true
}

const clickTitle = `(function () {
  var nodes = document.querySelectorAll('button')
  for (var i = 0; i < nodes.length; i++) {
    if ((nodes[i].textContent || '').indexOf(${JSON.stringify(TITLE)}) >= 0) {
      nodes[i].click()
      return true
    }
  }
  return false
})()`

const boot = async () => {
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(200)
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
  // 首启「使用前须知」盖在最上面：先点掉，否则后面点不到任何东西
  await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '我知道了') { nodes[i].click(); return true }
    }
    return false
  })()`)
  await sleep(400)

  check('塞进两条带思考的已完成会话', (await evaluate(seed('probe-t1', '思考折叠检查', THINK1, ANSWER1))) === true)
  check('第二条也塞好了', (await evaluate(seed('probe-t2', '设置联动检查', THINK2, ANSWER2))) === true)

  // ---- 阶段 1：默认收起 + 点开 ----
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  await sleep(400)
  await boot()
  await evaluate(openDrawer)
  await waitFor(bodyHas('思考折叠检查'))
  check('点开了第一条会话', await clickSession('思考折叠检查'))
  await waitFor(bodyHas(ANSWER1))
  check('回答正文可见', await evaluate(bodyHas(ANSWER1)))
  check('标题「已思考…」在', (await waitFor(bodyHas(TITLE))) >= 0)
  check('默认收起：思考内容不在正文里', !(await evaluate(bodyHas(THINK1))))

  const collapsedShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(SHOT, Buffer.from(collapsedShot.result.data, 'base64'))

  await evaluate(clickTitle)
  check('点标题后展开', (await waitFor(bodyHas(THINK1))) >= 0)

  const expandedShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(SHOT.replace('collapsed', 'expanded'), Buffer.from(expandedShot.result.data, 'base64'))

  // ---- 阶段 2：切到别的对话再回来，手动展开要还在 ----
  await evaluate(openDrawer)
  await waitFor(bodyHas('开启新对话'))
  await evaluate(`(function () {
    var nodes = document.querySelectorAll('button')
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').indexOf('开启新对话') >= 0) { nodes[i].click(); return true }
    }
    return false
  })()`)
  await sleep(600)
  await evaluate(openDrawer)
  await waitFor(bodyHas('思考折叠检查'))
  await clickSession('思考折叠检查')
  await waitFor(bodyHas(ANSWER1))
  check('切走再回来：手动展开仍然保持', await evaluate(bodyHas(THINK1)))

  // ---- 阶段 3：设置改成「展开思考」，没手动过的新消息默认展开 ----
  await evaluate(`localStorage.setItem('chat-demo:thinking-end', 'expand')`)
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  await sleep(400)
  await boot()
  await evaluate(openDrawer)
  await waitFor(bodyHas('设置联动检查'))
  await clickSession('设置联动检查')
  await waitFor(bodyHas(ANSWER2))
  check('设置=展开思考：没手动过的消息默认展开', await evaluate(bodyHas(THINK2)))

  // 同一个设置下，之前手动展开的那条也还是展开（设置改回不影响手动记录）
  await evaluate(`localStorage.setItem('chat-demo:thinking-end', 'collapse')`)
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  await sleep(400)
  await boot()
  await evaluate(openDrawer)
  await waitFor(bodyHas('思考折叠检查'))
  await clickSession('思考折叠检查')
  await waitFor(bodyHas(ANSWER1))
  check('设置改回收起：手动展开过的那条不受影响', await evaluate(bodyHas(THINK1)))
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
