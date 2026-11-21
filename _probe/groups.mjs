// 探针：会话分类分组——渲染、折叠、归到分组弹窗。
// 用法：先 pnpm build，再 node _probe/groups.mjs
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9585
const WEB_PORT = 8155
const PROFILE = join(tmpdir(), 'groups-probe-profile')
const SHOT = join(REPO, 'screenshots', 'groups.png')

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
    if (await evaluate(`!!(${expression})`)) return true
    await sleep(200)
  }
  return false
}

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const bodyHas = (text) => `(document.body.textContent || '').indexOf(${JSON.stringify(text)}) >= 0`

const seed = `new Promise(function (resolve, reject) {
  var req = indexedDB.open('chat-demo')
  req.onerror = function () { reject(req.error) }
  req.onsuccess = function () {
    var db = req.result
    var now = Date.now()
    var tx = db.transaction(['sessions', 'sessionSummaries', 'groups'], 'readwrite')
    tx.objectStore('groups').put({ id: 'f-work', name: '工作', createdAt: now - 20000 })
    function putSession(id, title, groupId, updatedAt) {
      tx.objectStore('sessions').put({
        id: id, title: title, createdAt: updatedAt, updatedAt: updatedAt, groupId: groupId,
        messages: [
          { id: id + '-u', role: 'user', content: title, files: [], createdAt: updatedAt },
          {
            id: id + '-a', role: 'assistant', createdAt: updatedAt + 1,
            model: 'deepseek-flash', thinking: false, prefix: true, status: 'done',
            blocks: [{ type: 'text', text: '回答：' + title }]
          }
        ]
      })
      tx.objectStore('sessionSummaries').put({
        id: id, title: title, createdAt: updatedAt, updatedAt: updatedAt,
        groupId: groupId, fileIds: []
      })
    }
    putSession('s-in', '归到工作里的会话', 'f-work', now - 10000)
    putSession('s-out', '还没归类的会话', null, now - 5000)
    tx.oncomplete = function () { db.close(); resolve(true) }
    tx.onerror = function () { reject(tx.error) }
  }
})`

const openDrawer = `(function () {
  var btn = document.querySelector('button[aria-label="打开边栏"]')
  if (btn) btn.click()
})()`

const clickTextButton = (text) => `(function () {
  var buttons = document.querySelectorAll('button')
  for (var i = 0; i < buttons.length; i++) {
    if ((buttons[i].textContent || '').indexOf(${JSON.stringify(text)}) >= 0) {
      buttons[i].click()
      return true
    }
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
  // 触摸屏没有 hover：补上这个媒体特性，会话行的「⋯」才会像真机一样常显
  await send('Emulation.setTouchEmulationEnabled', { enabled: true })
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'hover', value: 'none' }],
  })
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  await evaluate(`localStorage.setItem('chat-demo:disclaimer-ack', '1')`)
  await evaluate(`localStorage.setItem('chat-demo:api-key', 'sk-probe-not-real')`)
  await sleep(400)
  check('塞进一个分组与两条会话', (await evaluate(seed)) === true)

  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await waitFor(`document.getElementById('root') && document.getElementById('root').children.length > 0`)
  await sleep(500)
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await evaluate(openDrawer)
  await sleep(700)

  check('侧栏有「新建分组」入口', await evaluate(bodyHas('新建分组')))

  // 两个工具按钮各自要有常态底色（不依赖 hover / active）
  const tools = await evaluate(`(function () {
    var buttons = document.querySelectorAll('button')
    var group = null
    for (var i = 0; i < buttons.length; i++) {
      if ((buttons[i].textContent || '').indexOf('新建分组') >= 0) { group = buttons[i]; break }
    }
    if (!group) return { error: 'no-new-group' }
    var siblings = group.parentElement.querySelectorAll('button')
    if (siblings.length < 2) return { error: 'no-collapse' }
    var collapse = siblings[siblings.length - 1]
    return {
      newGroupBg: getComputedStyle(group).backgroundColor,
      collapseBg: getComputedStyle(collapse).backgroundColor,
      collapseWidth: Math.round(collapse.getBoundingClientRect().width)
    }
  })()`)
  check('新建分组有常态底色', !!tools && tools.newGroupBg !== 'rgba(0, 0, 0, 0)', tools ? tools.newGroupBg : '未找到')
  check('一键折叠有常态底色', !!tools && tools.collapseBg !== 'rgba(0, 0, 0, 0)', tools ? tools.collapseBg : '未找到')
  check('一键折叠视觉宽度 32px', !!tools && tools.collapseWidth === 32, tools ? String(tools.collapseWidth) : '未找到')
  check('分组「工作」渲染出来', await evaluate(bodyHas('工作')))
  check('未分类组在', await evaluate(bodyHas('未分类')))
  check('分组里的会话在', await evaluate(bodyHas('归到工作里的会话')))
  check('未分类的会话也在', await evaluate(bodyHas('还没归类的会话')))

  // 折叠分组：里面的会话应该隐藏
  await evaluate(clickTextButton('工作'))
  await sleep(400)
  check('点分组头能折叠', !(await evaluate(bodyHas('归到工作里的会话'))))

  // 展开回来
  await evaluate(clickTextButton('工作'))
  await sleep(400)
  check('再点能展开', await evaluate(bodyHas('归到工作里的会话')))

  // 点未分类会话的「更多」→ 菜单里应有「归到分组」
  await evaluate(`(function () {
    var buttons = document.querySelectorAll('button[aria-label="更多"]')
    if (buttons.length === 0) return false
    buttons[buttons.length - 1].click()
    return true
  })()`)
  await sleep(500)
  check('会话菜单里有「归到分组」', await evaluate(bodyHas('归到分组')))

  await evaluate(`(function () {
    var items = document.querySelectorAll('[role="menuitem"]')
    for (var i = 0; i < items.length; i++) {
      if ((items[i].textContent || '').indexOf('归到分组') >= 0) { items[i].click(); return true }
    }
    return false
  })()`)
  await sleep(500)
  check('弹窗列出「未分类」', await evaluate(bodyHas('未分类')))
  check('弹窗里有「新建分组」', await evaluate(bodyHas('新建分组')))

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
