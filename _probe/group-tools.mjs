// 探针：侧栏「新建分组」与「一键折叠」两块各自的常态底色，以及按下态。
// 浅色主题 + 强制 :active（CDP CSS.forcePseudoState），比模拟触摸可靠。
// 用法：先 pnpm build，再 node _probe/group-tools.mjs
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9588
const WEB_PORT = 8158
const PROFILE = join(tmpdir(), 'group-tools-probe-profile')
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light'

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
await send('DOM.enable')
await send('CSS.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
})
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

// 浅色主题 + 跳过首启须知与设置弹窗
await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
await sleep(1400)
await evaluate(`
  localStorage.setItem('chat-demo:disclaimer-ack', '1');
  localStorage.setItem('chat-demo:api-key', 'sk-probe-000000000000');
  localStorage.setItem('chat-demo:theme-preference', '${THEME}');
  true
`)
await send('Page.reload')
await sleep(1600)

const seed = `new Promise(function (resolve, reject) {
  var req = indexedDB.open('chat-demo')
  req.onerror = function () { reject(req.error) }
  req.onsuccess = function () {
    var db = req.result
    var now = Date.now()
    var tx = db.transaction(['groups'], 'readwrite')
    tx.objectStore('groups').put({ id: 'g-a', name: '分类1', createdAt: now - 2000 })
    tx.objectStore('groups').put({ id: 'g-b', name: '分类2', createdAt: now - 1000 })
    tx.oncomplete = function () { db.close(); resolve(true) }
    tx.onerror = function () { reject(tx.error) }
  }
})`
await evaluate(seed)
await send('Page.reload')
await sleep(1600)

// 打开抽屉（移动端第一个按钮是汉堡）
await evaluate(`document.querySelectorAll('button')[0]?.click(); true`)
for (let i = 0; i < 40; i++) {
  if (await evaluate(`!!document.querySelector('[class*="groupTools-"]')`)) break
  await sleep(100)
}

const readTools = `(function () {
  var newGroup = document.querySelector('[class*="newGroup-"]')
  var collapse = document.querySelector('[class*="collapseAll-"]')
  if (!newGroup || !collapse) return { error: 'not-found' }
  return {
    newGroupBg: getComputedStyle(newGroup).backgroundColor,
    collapseBg: getComputedStyle(collapse).backgroundColor,
    newGroupBorder: getComputedStyle(newGroup).borderTopColor,
    collapseWidth: Math.round(collapse.getBoundingClientRect().width),
    collapseHeight: Math.round(collapse.getBoundingClientRect().height)
  }
})()`

const light = await evaluate(readTools)
check(THEME + '：两块都找到了', !!light && !light.error, JSON.stringify(light))
if (light && !light.error) {
  check(THEME + '：新建分组有底色', light.newGroupBg !== 'rgba(0, 0, 0, 0)', light.newGroupBg)
  check(THEME + '：一键折叠有底色', light.collapseBg !== 'rgba(0, 0, 0, 0)', light.collapseBg)
  check(THEME + '：边框可见（不是全透明）', light.newGroupBorder !== 'rgba(0, 0, 0, 0)', light.newGroupBorder)
  check(THEME + '：视觉尺寸 32×32', light.collapseWidth === 32 && light.collapseHeight === 32,
    `${light.collapseWidth}×${light.collapseHeight}`)
}

const shotLight = await send('Page.captureScreenshot', { format: 'png' })
if (shotLight.result?.data) {
  await writeFile(join(REPO, 'screenshots', `group-tools-${THEME}.png`), Buffer.from(shotLight.result.data, 'base64'))
  console.log(`截图: screenshots/group-tools-${THEME}.png`)
}

// 强制 :active，验证按下态与常态不同色
const doc = await send('DOM.getDocument')
const rootNodeId = doc.result?.root?.nodeId
const node = await send('DOM.querySelector', {
  nodeId: rootNodeId,
  selector: '[class*="collapseAll-"]',
})
if (node.result?.nodeId) {
  await send('CSS.forcePseudoState', {
    nodeId: node.result.nodeId,
    forcedPseudoClasses: ['active'],
  })
  // 按钮有 200ms 的颜色过渡，等它走完再读，否则读到的是插值中间色
  await sleep(320)
  const varValue = await evaluate(
    `getComputedStyle(document.body).getPropertyValue('--dsw-alias-interactive-bg-hover').trim()`
  )
  console.log(`  按下色变量 = ${varValue}`)
  const active = await evaluate(
    `getComputedStyle(document.querySelector('[class*="collapseAll-"]')).backgroundColor`
  )
  check('按下态与常态不同', !!active && active !== light.collapseBg, `${active} vs ${light.collapseBg}`)
  const shotActive = await send('Page.captureScreenshot', { format: 'png' })
  if (shotActive.result?.data) {
    await writeFile(join(REPO, 'screenshots', `group-tools-active-${THEME}.png`), Buffer.from(shotActive.result.data, 'base64'))
    console.log(`截图: screenshots/group-tools-active-${THEME}.png`)
  }
  await send('CSS.forcePseudoState', { nodeId: node.result.nodeId, forcedPseudoClasses: [] })
} else {
  check('找到一键折叠按钮的节点', false, 'DOM.querySelector 没返回 nodeId')
}

const failed = results.filter((r) => !r).length
console.log(`\n工具按钮探针 ${results.length - failed}/${results.length}`)

ws.close()
chrome.kill()
server.kill()
await sleep(300)
process.exit(failed === 0 ? 0 : 1)
