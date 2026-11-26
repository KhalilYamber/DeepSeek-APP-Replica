// 探针：回车的发送语义按输入设备判定。
// 桌面（鼠标为主）回车应当发送；手机（手指输入）回车应当只是换行。
// 判据只有一个：回车之后输入框的值。发送成功会同步清空草稿（store.ts 的 clearSentDraft），
// 不发送则原值留着。每档都先证明「这一页确实能发出去」：桌面档靠回车本身，手机档靠点发送按钮做对照，
// 否则「回车没发」可能只是页面还没就绪，会假通过。
// 局限：合成的 keydown 不会触发浏览器的默认插入，所以这里只证明「没有进入发送分支」，
// 真正的换行插入必须在真机上验。
// 用法：先 pnpm build，再 node _probe/ime-enter.mjs
import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9594
const WEB_PORT = 8164
const PROFILE = join(tmpdir(), 'ime-enter-probe-profile')
const TEXT = '第一行'

await rm(PROFILE, { recursive: true, force: true })

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

/** 每个档位重新起一遍：先定视口与触摸，再加载、落预置、刷新，最后把网络拦住 */
const load = async ({ width, height, mobile }) => {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: mobile ? 3 : 1,
    mobile,
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 })
  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  await sleep(1200)
  await evaluate(`
    localStorage.setItem('chat-demo:disclaimer-ack', '1');
    localStorage.setItem('chat-demo:api-key', 'sk-probe-000000000000');
    true
  `)
  await send('Page.reload')
  await sleep(2000)
  // 发送会真的去请求接口，这里拦住，判据不依赖网络
  await evaluate(`
    window.fetch = function () { return new Promise(function () {}) };
    true
  `)
}

const readState = () =>
  evaluate(`(function () {
    var el = document.querySelector('textarea')
    return {
      width: window.innerWidth,
      coarse: matchMedia('(pointer: coarse)').matches,
      hint: el ? el.getAttribute('enterkeyhint') : null,
      value: el ? el.value : null,
    }
  })()`)

/** 写入文本，不派发任何按键 */
const typeText = () =>
  evaluate(`(function () {
    var el = document.querySelector('textarea')
    if (!el) return false
    var type = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    type.call(el, ${JSON.stringify(TEXT)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)

/** 派发一次回车 */
const dispatchEnter = () =>
  evaluate(`(function () {
    var el = document.querySelector('textarea')
    if (!el) return false
    var event = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    })
    if (event.keyCode !== 13) {
      Object.defineProperty(event, 'keyCode', { value: 13 })
    }
    el.dispatchEvent(event)
    return true
  })()`)

/** 点右下角发送按钮：用来证明「这一页确实能发出去」，否则「回车没发」可能是页面还没就绪 */
const clickSend = () =>
  evaluate(`(function () {
    var button = document.querySelector('button[aria-label="发送"]')
    if (!button) return false
    button.click()
    return true
  })()`)

/** 反复读输入框，直到它变空或次数用完 */
const waitCleared = async (times = 6) => {
  let value = null
  for (let i = 0; i < times; i++) {
    await sleep(400)
    value = (await readState()).value
    if (value === '') break
  }
  return value
}

// 桌面档：鼠标为主，回车应当发送
await load({ width: 1280, height: 900, mobile: false })
const desktopEnv = await readState()
console.log(
  `桌面档环境：宽 ${desktopEnv.width}，粗指针 ${desktopEnv.coarse}，enterkeyhint ${desktopEnv.hint}`
)
check('桌面档判定为鼠标输入', desktopEnv.coarse === false)
check('桌面档键帽语义是「发送」', desktopEnv.hint === 'send', String(desktopEnv.hint))
check('桌面档找到输入框并写入文字', (await typeText()) === true)

const desktopPressed = await dispatchEnter()
check('桌面档派发回车', desktopPressed === true)
const desktopValue = await waitCleared()
check('桌面档回车把消息发出去了（草稿被清空）', desktopValue === '', JSON.stringify(desktopValue))

// 手机档：手指输入，回车应当只是换行
await load({ width: 390, height: 844, mobile: true })
const mobileEnv = await readState()
console.log(
  `手机档环境：宽 ${mobileEnv.width}，粗指针 ${mobileEnv.coarse}，enterkeyhint ${mobileEnv.hint}`
)
check('手机档判定为手指输入', mobileEnv.coarse === true)
check('手机档键帽语义是「换行」', mobileEnv.hint === 'enter', String(mobileEnv.hint))

// 先做对照：同一个页面上点发送按钮能发出去，证明应用已就绪
check('手机档找到输入框并写入文字', (await typeText()) === true)
const clicked = await clickSend()
check('手机档找到发送按钮', clicked === true)
const sentByButton = await waitCleared()
check(
  '手机档点发送按钮能发出去（对照，证明页面就绪）',
  sentByButton === '',
  JSON.stringify(sentByButton)
)

// 再验回车：同一页面上回车不该发送
await sleep(400)
check('手机档重新写入文字', (await typeText()) === true)
const mobilePressed = await dispatchEnter()
check('手机档派发回车', mobilePressed === true)
await sleep(600)
const mobileValue = (await readState()).value
check('手机档回车没有发送（草稿仍在）', mobileValue === TEXT, JSON.stringify(mobileValue))

const failed = results.filter((r) => !r).length
console.log(`\n回车语义探针 ${results.length - failed}/${results.length}`)

ws.close()
chrome.kill()
server.kill()
await sleep(300)
process.exit(failed === 0 ? 0 : 1)
