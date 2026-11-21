// 探针：两处吸顶——分组标题（侧栏）、思考折叠条（消息流），以及长会话下的吸附边界。
// 用法：先 pnpm build，再 node _probe/sticky.mjs
// 环境：无头 Chrome，390×844 移动视口。
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9587
const WEB_PORT = 8157
const PROFILE = join(tmpdir(), 'sticky-probe-profile')
const SHOT = join(REPO, 'screenshots', 'sticky.png')

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

// 造数据：两个分组各 30 条会话 + 一条带长思考的会话（思考内容足够高）
const THINK = '这是一段用来撑高度的思考内容，重复出现以便制造可以吸附的距离。'.repeat(120)
const ANSWER = '这是回答正文，也足够长，用来验证思考折叠条在正文开始后就不再吸附。'.repeat(60)
const seed = `new Promise(function (resolve, reject) {
  var req = indexedDB.open('chat-demo')
  req.onerror = function () { reject(req.error) }
  req.onsuccess = function () {
    var db = req.result
    var now = Date.now()
    var tx = db.transaction(['sessions', 'sessionSummaries', 'groups'], 'readwrite')
    tx.objectStore('groups').put({ id: 'g-work', name: '工作', createdAt: now - 20000 })
    tx.objectStore('groups').put({ id: 'g-keep', name: '归档', createdAt: now - 10000 })
    function putSession(id, title, groupId, updatedAt) {
      tx.objectStore('sessions').put({ id: id, title: title, createdAt: updatedAt, updatedAt: updatedAt, groupId: groupId, messages: [] })
      tx.objectStore('sessionSummaries').put({ id: id, title: title, createdAt: updatedAt, updatedAt: updatedAt, groupId: groupId, fileIds: [] })
    }
    for (var i = 0; i < 30; i++) putSession('w' + i, '工作会话 ' + i, 'g-work', now - i * 1000)
    for (var j = 0; j < 30; j++) putSession('k' + j, '归档会话 ' + j, 'g-keep', now - 100000 - j * 1000)
    var think = ${JSON.stringify(THINK)}
    var answer = ${JSON.stringify(ANSWER)}
    tx.objectStore('sessions').put({
      id: 'sticky-think', title: '思考吸附检查', createdAt: now, updatedAt: now, groupId: 'g-work',
      messages: [
        { id: 'u1', role: 'user', content: '问一句，用来触发思考块。', files: [], createdAt: now },
        {
          id: 'a1', role: 'assistant', createdAt: now + 1000, model: 'deepseek-flash', prefix: true, status: 'done',
          blocks: [
            { type: 'thinking', thinking: think, startedAt: now, endedAt: now + 900 },
            { type: 'text', text: answer }
          ]
        }
      ]
    })
    tx.objectStore('sessionSummaries').put({ id: 'sticky-think', title: '思考吸附检查', createdAt: now, updatedAt: now, groupId: 'g-work', fileIds: [] })
    tx.oncomplete = function () { db.close(); resolve(true) }
    tx.onerror = function () { reject(tx.error) }
  }
})`
check('造出两个分组与一条带长思考的会话', (await evaluate(seed)) === true)

await send('Page.reload')
await sleep(1800)

// ---- A. 分组标题吸顶 ----
await evaluate(`document.querySelectorAll('button')[0]?.click(); true`)
for (let i = 0; i < 40; i++) {
  if (await evaluate(`!!document.querySelector('[class*="groupHeader-"]')`)) break
  await sleep(100)
}
const groupGeometry = await evaluate(`
  (() => {
    const list = [...document.querySelectorAll('div')].find((el) => {
      const style = getComputedStyle(el)
      return style.overflowY === 'auto' && el.querySelector('[class*="groupHeader-"]')
    })
    if (!list) return { error: 'no-list' }
    const headers = [...list.querySelectorAll('[class*="groupHeader-"]')]
    list.scrollTop = 400
    const listTop = Math.round(list.getBoundingClientRect().top)
    return {
      listTop,
      scrollTop: list.scrollTop,
      headers: headers.map((el) => Math.round(el.getBoundingClientRect().top)),
    }
  })()
`)
check('找到侧栏滚动容器与分组标题', !groupGeometry?.error, JSON.stringify(groupGeometry))
if (!groupGeometry?.error) {
  check(
    '第一个分组标题吸在列表顶部',
    groupGeometry.headers[0] === groupGeometry.listTop,
    `header=${groupGeometry.headers[0]} list=${groupGeometry.listTop}`
  )
  check(
    '没有出现「全部分组都吸顶」',
    groupGeometry.headers[1] > groupGeometry.listTop,
    `第二个 header=${groupGeometry.headers[1]}`
  )
}

// ---- B. 思考折叠条吸顶 ----
await evaluate(`
  (() => {
    const item = [...document.querySelectorAll('div,button')].find((el) =>
      el.textContent && el.textContent.trim() === '思考吸附检查'
    )
    item?.click()
    return true
  })()
`)
await sleep(1200)
// 思考结束后默认收起：先点开标题，标题下面才有可以被吸附掠过的高度
const opened = await evaluate(`
  (() => {
    const title = [...document.querySelectorAll('button')].find((b) => /已思考|思考中/.test(b.textContent || ''))
    if (!title) return false
    title.click()
    return true
  })()
`)
await sleep(500)
check('点开思考区（默认收起时没有可吸附的内容）', opened === true)

const thinkGeometry = await evaluate(`
  (() => {
    const title = [...document.querySelectorAll('button')].find((b) => /已思考|思考中/.test(b.textContent || ''))
    if (!title) return { error: 'no-title' }
    const scroller = [...document.querySelectorAll('div')].find((el) => {
      const style = getComputedStyle(el)
      return style.overflowY === 'auto' && el.contains(title)
    })
    if (!scroller) return { error: 'no-scroller' }
    scroller.scrollTop = 600
    const chain = []
    let el = title
    while (el && chain.length < 9) {
      const style = getComputedStyle(el)
      chain.push({
        tag: el.tagName,
        cls: String(el.className || '').slice(0, 46),
        overflowY: style.overflowY,
        contain: style.contain,
        position: style.position,
      })
      el = el.parentElement
    }
    return {
      titleTop: Math.round(title.getBoundingClientRect().top),
      scrollerTop: Math.round(scroller.getBoundingClientRect().top),
      scrollTop: scroller.scrollTop,
      position: getComputedStyle(title).position,
      chain,
    }
  })()
`)
check('找到思考折叠条与消息滚动容器', !thinkGeometry?.error, JSON.stringify(thinkGeometry))
if (!thinkGeometry?.error) {
  check(
    '思考折叠条吸在滚动容器顶部',
    thinkGeometry.titleTop === thinkGeometry.scrollerTop,
    `title=${thinkGeometry.titleTop} scroller=${thinkGeometry.scrollerTop}`
  )
}

// 滚到思考内容末尾之后：折叠条应跟着这段思考离开，而不是一直粘着
const afterThink = await evaluate(`
  (() => {
    const title = [...document.querySelectorAll('button')].find((b) => /已思考|思考中/.test(b.textContent || ''))
    if (!title) return { error: 'no-title' }
    const scroller = [...document.querySelectorAll('div')].find((el) => {
      const style = getComputedStyle(el)
      return style.overflowY === 'auto' && el.contains(title)
    })
    if (!scroller) return { error: 'no-scroller' }
    scroller.scrollTop = scroller.scrollHeight
    return {
      titleTop: Math.round(title.getBoundingClientRect().top),
      scrollerTop: Math.round(scroller.getBoundingClientRect().top),
      titleBottom: Math.round(title.getBoundingClientRect().bottom),
    }
  })()
`)
check('滚过思考区后折叠条不再吸附', !afterThink?.error, JSON.stringify(afterThink))
if (!afterThink?.error) {
  check(
    '折叠条已随思考区离开顶部',
    afterThink.titleBottom <= afterThink.scrollerTop + 2 || afterThink.titleTop > afterThink.scrollerTop,
    `titleTop=${afterThink.titleTop} scrollerTop=${afterThink.scrollerTop}`
  )
}

const shot = await send('Page.captureScreenshot', { format: 'png' })
if (shot.result?.data) {
  await writeFile(SHOT, Buffer.from(shot.result.data, 'base64'))
  console.log(`截图: ${SHOT}`)
}

const failed = results.filter((r) => !r).length
console.log(`\n吸顶探针 ${results.length - failed}/${results.length}`)

ws.close()
chrome.kill()
server.kill()
await sleep(300)
process.exit(failed === 0 ? 0 : 1)
