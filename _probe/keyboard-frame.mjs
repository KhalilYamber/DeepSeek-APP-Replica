// 探针：键盘弹起时这帧要跟着视觉视口收缩，桌面布局也要（iPad 横屏就是桌面布局）。
// 缺了这条：输入框被键盘盖住，系统再把整页平移上来，屏幕上露出大片空白、输入框跑到导航栏下面。
// 做法：1080×740 + 触屏仿真（走桌面布局，但判成触屏设备），把视觉视口伪造成 415，看这帧是否收缩。
// 局限：伪造的是视口读数，不是真键盘；真机行为仍要在 iPad 上验。
// 用法：先 pnpm build，再 node _probe/keyboard-frame.mjs
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9605
const WEB = 8176

const server = spawn(process.execPath, [join(REPO, 'tools/serve.mjs'), join(REPO, 'dist'), String(WEB)], {
  cwd: REPO,
  stdio: 'ignore',
})
await sleep(1500)

const chrome = spawn(
  CHROME,
  [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(tmpdir(), 'keyboard-frame-profile')}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
)

let page = null
for (let i = 0; i < 60; i++) {
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
await new Promise((ok) => ws.addEventListener('open', ok))
let seq = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
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
  if (res.result?.exceptionDetails) return 'ERR:' + res.result.exceptionDetails.text
  return res.result?.result?.value
}

const results = []
const check = (name, pass, detail = '') => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
const frameState = () =>
  evaluate(`(function () {
    var f = document.querySelector('[class*="frame"]')
    return JSON.stringify({
      attr: f.hasAttribute('data-frame-clamped'),
      height: f.style.height,
      top: getComputedStyle(f).top,
      position: getComputedStyle(f).position,
    })
  })()`)

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1080,
  height: 740,
  deviceScaleFactor: 1,
  mobile: false,
})
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/` })
await sleep(2200)

const env = JSON.parse(
  await evaluate(
    `JSON.stringify({
      desktop: matchMedia('(min-width: 768px)').matches,
      coarse: matchMedia('(pointer: coarse)').matches,
      hover: matchMedia('(hover: hover)').matches,
      touch: navigator.maxTouchPoints,
    })`
  )
)
console.log(`环境：桌面布局 ${env.desktop}，粗指针 ${env.coarse}，可悬停 ${env.hover}，触摸点 ${env.touch}`)
check('这一档走桌面布局但判成触屏', env.desktop === true && env.coarse === true && env.hover === false)

const idle = JSON.parse(await frameState())
check('无键盘时不打接管标记', idle.attr === false, JSON.stringify(idle))
check('无键盘时高度是布局视口', idle.height === '740px', idle.height)

// 伪造键盘弹起：布局视口仍是 740，视觉视口缩到 415
await evaluate(`(function () {
  window.__vv = 415
  Object.defineProperty(window, 'innerHeight', { configurable: true, get: function () { return 740 } })
  Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: function () { return window.__vv } })
  window.visualViewport.dispatchEvent(new Event('resize'))
  return true
})()`)
await sleep(400)

const clamped = JSON.parse(await frameState())
console.log(`键盘弹起时：${JSON.stringify(clamped)}`)
check('键盘弹起后这帧打了接管标记', clamped.attr === true)
check('高度收缩到视觉视口高度', clamped.height === '415px', clamped.height)
check('定位改成 fixed 并贴住视觉视口', clamped.position === 'fixed' && clamped.top === '0px')

// 收键盘：视觉视口恢复
await evaluate(`(function () {
  window.__vv = 740
  window.visualViewport.dispatchEvent(new Event('resize'))
  return true
})()`)
await sleep(400)

const restored = JSON.parse(await frameState())
check('收键盘后标记撤掉', restored.attr === false, JSON.stringify(restored))
check('高度回到布局视口高度', restored.height === '740px', restored.height)

// #kbdiag 浮层：只在地址带 hash 时出现，且要能读数
await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/#kbdiag` })
await sleep(2200)
const overlayText = await evaluate(`(function () {
  var nodes = document.querySelectorAll('div')
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].textContent.indexOf('视口读数') === 0) return nodes[i].textContent
  }
  return null
})()`)
check('#kbdiag 时浮层出现', typeof overlayText === 'string', String(overlayText).slice(0, 40))
check('浮层里有视口读数', typeof overlayText === 'string' && overlayText.includes('inner=') && overlayText.includes('clamp='))

const plainOverlay = await evaluate(`(function () {
  location.hash = ''
  return new Promise(function (resolve) {
    setTimeout(function () {
      var nodes = document.querySelectorAll('div')
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].textContent.indexOf('视口读数') === 0) return resolve(true)
      }
      resolve(false)
    }, 300)
  })
})()`)
check('去掉 hash 后浮层消失', plainOverlay === false)

// 自动弹出：键盘弹着、但焦点输入框越出可见区域时，浮层要自己出来（微信里改地址等于刷新，现场会没）
await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/` })
await sleep(2200)
await evaluate(`(function () {
  window.__vv = 415
  window.__inner = 740
  Object.defineProperty(window, 'innerHeight', { configurable: true, get: function () { return window.__inner } })
  Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: function () { return window.__vv } })
  window.visualViewport.dispatchEvent(new Event('resize'))
  var el = document.querySelector('textarea')
  el.focus()
  el.getBoundingClientRect = function () {
    return { top: 0, bottom: 900, left: 0, right: 0, width: 100, height: 900 }
  }
  return true
})()`)
await sleep(1800)
const autoOpened = await evaluate(`(function () {
  var nodes = document.querySelectorAll('div')
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].textContent.indexOf('视口读数') === 0) return nodes[i].textContent.indexOf('出问题那一刻的读数') >= 0
  }
  return false
})()`)
check('输入框越出可见区域时浮层自动弹出并记下读数', autoOpened === true)

const failed = results.filter((x) => !x).length
console.log(`\n键盘跟随探针 ${results.length - failed}/${results.length}`)

ws.close()
chrome.kill()
server.kill()
await sleep(300)
process.exit(failed === 0 ? 0 : 1)
