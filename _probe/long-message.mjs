// 探针：单条「超长消息」的渲染与滚动成本。
//
// 为什么单独测：`content-visibility` 能跳过屏幕外的**消息**，但一条消息内部是整块渲染的。
// 如果某个会话的上下文有一半压在一条回复里（几十万字），打开它时的开销不在「条数」上，
// 而在「单条体量」上——这类长对话不会被现有的长列表优化覆盖。
//
// 用法：node _probe/long-message.mjs            （默认 20 万字符）
//       PROBE_CHARS=400000 node _probe/long-message.mjs
import { spawn } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const CHROME =
  process.env.PROBE_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const CHARS = Number(process.env.PROBE_CHARS ?? 200_000)
const PORT = Number(process.env.PROBE_DEVTOOLS_PORT ?? 9593)
const WEB_PORT = Number(process.env.PROBE_WEB_PORT ?? 8163)
const PROFILE = join(tmpdir(), `long-message-profile-${Date.now()}`)

const block = [
  '这一段落用来占体量，混排**加粗**、`行内代码`、[链接](https://example.com) 与 $x^2+y^2=z^2$。',
  '',
  '- 列表项一',
  '- 列表项二',
  '',
  '| 列 A | 列 B |',
  '| --- | --- |',
  '| 1 | 2 |',
  '',
  '```ts',
  'const value = items.reduce((sum, item) => sum + item.price, 0)',
  '```',
  '',
  '$$',
  '\\int_0^1 x^2 \\, dx = \\frac{1}{3}',
  '$$',
  '',
].join('\n')

const body = block.repeat(Math.ceil(CHARS / block.length)).slice(0, CHARS)

const seed = `new Promise(function (resolve, reject) {
  var req = indexedDB.open('chat-demo')
  req.onerror = function () { reject(req.error) }
  req.onsuccess = function () {
    var db = req.result
    var now = Date.now()
    var tx = db.transaction(['sessions', 'sessionSummaries'], 'readwrite')
    tx.objectStore('sessions').put({
      id: 'long-message', title: '超长单条消息', createdAt: now - 10000, updatedAt: now,
      messages: [
        { id: 'u1', role: 'user', content: '这是一条超长回复的检查。', files: [], createdAt: now - 10000 },
        {
          id: 'a1', role: 'assistant', createdAt: now - 9000, model: 'deepseek-flash',
          prefix: true, status: 'done',
          blocks: [{ type: 'text', text: ${JSON.stringify(body)} }],
          usage: { input_tokens: 5120, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 900 }
        }
      ]
    })
    tx.objectStore('sessionSummaries').put({
      id: 'long-message', title: '超长单条消息', createdAt: now - 10000, updatedAt: now, fileIds: []
    })
    tx.oncomplete = function () { db.close(); resolve(true) }
    tx.onerror = function () { reject(tx.error) }
  }
})`

await rm(PROFILE, { recursive: true, force: true })
await mkdir(join(REPO, 'screenshots'), { recursive: true })

const server = spawn(
  process.execPath,
  [join(REPO, 'tools/serve.mjs'), join(REPO, 'dist'), String(WEB_PORT)],
  {
    cwd: REPO,
    stdio: 'ignore',
  }
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
    '--enable-precise-memory-info',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
)

const cleanup = async (code) => {
  try {
    chrome.kill()
  } catch {}
  try {
    server.kill()
  } catch {}
  await rm(PROFILE, { recursive: true, force: true }).catch(() => {})
  process.exit(code)
}

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
  await cleanup(2)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', rej)
})

let seq = 0
const pending = new Map()
const errors = []
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
    return
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    errors.push(`${d.text} ${d.exception?.description ?? ''}`.slice(0, 200))
  }
})

const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.text)
  }
  return r.result?.result?.value
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }] })

  await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/` })
  for (let i = 0; i < 60; i++) {
    if (await evaluate(`!!document.getElementById('root')?.children.length`)) break
    await sleep(150)
  }
  await evaluate(`(function () {
    localStorage.setItem('chat-demo:disclaimer-ack', '1')
    localStorage.setItem('chat-demo:api-key', 'sk-probe-long-message')
    localStorage.setItem('chat-demo:model', 'deepseek-flash')
    localStorage.setItem('chat-demo:theme-preference', '${process.env.PROBE_THEME ?? 'light'}')
    localStorage.setItem('chat-demo:context-window', JSON.stringify({ model: 'deepseek-flash', value: 128000, at: Date.now() }))
    return true
  })()`)
  await evaluate(seed)
  await send('Page.reload')
  await sleep(1500)

  // 打开会话，量「从点击到两帧画完」的耗时，同时收集这期间的长任务
  const measure = await evaluate(`(async function () {
    var longtasks = []
    var obs = new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (e) { longtasks.push(Math.round(e.duration)) })
    })
    try { obs.observe({ entryTypes: ['longtask'] }) } catch (e) {}

    var btn = document.querySelector('button[aria-label="打开边栏"]')
    if (btn) btn.click()
    await new Promise(function (r) { setTimeout(r, 400) })

    var nodes = document.querySelectorAll('div,span,button')
    var target = null
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === '超长单条消息') {
        var rect = nodes[i].getBoundingClientRect()
        if (rect.width > 10 && rect.height > 10) { target = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; break }
      }
    }
    if (!target) return { error: '找不到会话条目' }

    var t0 = performance.now()
    document.elementFromPoint(target.x, target.y)?.click()
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r) }) })
    var firstPaint = Math.round(performance.now() - t0)

    await new Promise(function (r) { setTimeout(r, 2500) })
    obs.disconnect()

    var text = document.body.textContent || ''
    var bubble = document.querySelector('[class*="bubble-"]')
    return {
      firstPaint,
      longtasks: longtasks.slice(),
      longTotal: longtasks.reduce(function (a, b) { return a + b }, 0),
      nodes: document.querySelectorAll('*').length,
      renderedChars: text.length,
      hasTable: !!document.querySelector('table'),
      hasCode: !!document.querySelector('pre'),
      hasMath: !!document.querySelector('.katex'),
      bubble: bubble ? 1 : 0
    }
  })()`)

  console.log(`消息体量：${CHARS.toLocaleString()} 字符`)
  if (measure?.error) {
    console.log(`测量失败：${measure.error}`)
    await cleanup(1)
  }
  console.log(`首帧（点击 → 两帧画完）：${measure.firstPaint} ms`)
  console.log(
    `2.5s 内长任务：${measure.longtasks.length} 次，共 ${measure.longTotal} ms${
      measure.longtasks.length ? '（最长 ' + Math.max(...measure.longtasks) + ' ms）' : ''
    }`
  )
  console.log(
    `DOM 节点：${measure.nodes}；渲染文本：${measure.renderedChars} 字；表格 ${measure.hasTable ? '有' : '无'}；代码块 ${
      measure.hasCode ? '有' : '无'
    }；公式 ${measure.hasMath ? '有' : '无'}`
  )

  // 交互闭环：点「展开全文」→ 出现「收起全文」；点收起 → 回到预览
  const feedback = await evaluate(`(async function () {
    var all = [].slice.call(document.querySelectorAll('button'))
    var expand = all.find(function (b) { return (b.textContent || '').indexOf('展开全文') >= 0 })
    if (!expand) return { error: 'no-expand' }
    expand.click()
    // 等一帧：此时「展开中…」应该已经上屏，而正文还没开始渲染
    await new Promise(function (r) { requestAnimationFrame(function () { r() }) })
    return { label: (expand.textContent || '').trim() }
  })()`)
  console.log(
    feedback?.error ? `展开反馈缺失：${feedback.error}` : `点击后第一帧按钮文案：${feedback.label}`
  )
  await sleep(4000)

  // 展开态截图：看「收起」是不是贴在顶部，顺手看有没有挡住正文
  const expandedShot = await send('Page.captureScreenshot', { format: 'png' })
  if (expandedShot.result?.data) {
    const { writeFile } = await import('node:fs/promises')
    const theme = process.env.PROBE_THEME ?? 'light'
    await writeFile(
      join(REPO, 'screenshots', `long-message-${theme}-expanded.png`),
      Buffer.from(expandedShot.result.data, 'base64')
    )
    console.log(`截图：screenshots/long-message-${theme}-expanded.png`)
  }

  const toggle = await evaluate(`(async function () {
    var all = function () { return [].slice.call(document.querySelectorAll('button')) }
    var collapse = all().find(function (b) { return (b.textContent || '').indexOf('收起全文') >= 0 })
    var expandedChars = (document.body.textContent || '').length
    if (!collapse) return { error: 'no-collapse', expandedChars: expandedChars }
    collapse.click()
    await new Promise(function (r) { setTimeout(r, 1200) })
    var back = all().some(function (b) { return (b.textContent || '').indexOf('展开全文') >= 0 })
    return { collapse: true, back: back, expandedChars: expandedChars, collapsedChars: (document.body.textContent || '').length }
  })()`)

  console.log(
    toggle?.error
      ? `交互验证失败：${toggle.error}`
      : `展开后可收起：${toggle.collapse}；收起后回到预览：${toggle.back}；渲染文本 ${toggle.expandedChars} → ${toggle.collapsedChars}`
  )

  if (errors.length) {
    console.log('页面异常：' + errors.slice(0, 3).join(' | '))
  }

  // 留一张图：折叠态长什么样，比数字更直观
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  if (shot.result?.data) {
    const { writeFile } = await import('node:fs/promises')
    const theme = process.env.PROBE_THEME ?? 'light'
    await writeFile(
      join(REPO, 'screenshots', `long-message-${theme}.png`),
      Buffer.from(shot.result.data, 'base64')
    )
    console.log(`截图：screenshots/long-message-${theme}.png`)
  }

  await cleanup(0)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  await cleanup(1)
}
