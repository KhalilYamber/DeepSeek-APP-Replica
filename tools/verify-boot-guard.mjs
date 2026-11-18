#!/usr/bin/env node
/**
 * 启动兜底与自检页的验收：真开浏览器点一遍，不靠推理。
 *
 * 为什么不能只用 tools/shot.mjs：它固定等 7 秒，而启动兜底的判定点在 8 秒之后——
 * 用 7 秒的截图证明「没有误伤」，等于在兜底还没来得及开口的时候就收工。
 *
 * 六个场景：
 *   1 normal        dist/index.html 正常启动，11 秒后仍无错误页（跨过 8 秒判定点）
 *   2 no-render     拿 dist 里那段真实的内联脚本套一个「永远不渲染」的页面，等兜底页出现
 *   3 no-render-ua  同上 + UA 改成 Chrome/60，确认内核分支走的是「内核太旧」而不是「超时」
 *   4 ua-but-ok     dist/index.html + UA 改成 Chrome/60，确认界面渲染成功时不上错误页（抗误伤）
 *   5 check         dist/check.html 的检测项与结论
 *   6 check-stubbed 把几项能力删掉后重新打开 check.html，确认判定真的会翻红
 *
 * 用法：node tools/verify-boot-guard.mjs [--only <场景名>]
 * 退出码：0 全部通过；1 有断言失败；2 环境问题（dist 不在、Chrome 起不来等）
 *
 * 边界：CDP 换 UA 只换字符串，不换引擎。所以本文验的是「判定逻辑与文案」，不是「老内核上真的怎么样」。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const DIST = join(REPO, 'dist')
const SHOTS = join(REPO, 'screenshots')
const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome')
const DIST_PORT = Number(process.env.BOOT_GUARD_DIST_PORT ?? 8134)
const FIXTURE_PORT = Number(process.env.BOOT_GUARD_FIXTURE_PORT ?? 8135)
const DEVTOOLS_PORT = 9600 + Math.floor(Math.random() * 200)
const OLD_UA =
  'Mozilla/5.0 (Linux; Android 9; MI 8 Build/PKQ1.190828.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/60.0.3112.116 Mobile Safari/537.36'

const argv = process.argv.slice(2)
const onlyIndex = argv.indexOf('--only')
const only = onlyIndex >= 0 ? argv[onlyIndex + 1] : ''

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// 只要能收到 HTTP 响应就算服务起来了：fixture 目录的根目录没有 index.html，会返回 404，
// 用 response.ok 判断会把「已经起来了」误判成「没起来」。
const reachable = async (url) => {
  try {
    await fetch(url)
    return true
  } catch {
    return false
  }
}

const startServer = async (root, port) => {
  const url = `http://127.0.0.1:${port}/`
  if (await reachable(url)) return { child: null, url }
  const child = spawn(process.execPath, [join(REPO, 'tools/serve.mjs'), root, String(port)], {
    cwd: REPO,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  for (let i = 0; i < 60; i++) {
    if (await reachable(url)) return { child, url }
    await sleep(200)
  }
  child.kill()
  throw new Error(`静态服务起不来：${root} @ ${port}`)
}

const startChrome = async () => {
  if (!existsSync(CHROME)) throw new Error(`找不到 Chrome：${CHROME}（可用 CHROME_PATH 指定）`)
  const profile = join(tmpdir(), `boot-guard-profile-${DEVTOOLS_PORT}`)
  await rm(profile, { recursive: true, force: true })
  const child = spawn(
    CHROME,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--disable-dev-shm-usage',
      '--mute-audio',
      `--remote-debugging-port=${DEVTOOLS_PORT}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  )
  let page = null
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/list`)
      const targets = await response.json()
      page = targets.find((target) => target.type === 'page')
      if (page) break
    } catch {}
    await sleep(250)
  }
  if (!page) {
    child.kill()
    throw new Error('DevTools 没起来')
  }
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((ok, fail) => {
    socket.addEventListener('open', ok)
    socket.addEventListener('error', fail)
  })
  let seq = 0
  const pending = new Map()
  const consoleLines = []
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
      return
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      const text = (message.params.args || [])
        .map((arg) => arg.value ?? arg.description ?? arg.type)
        .join(' ')
      consoleLines.push(String(text))
    }
  })
  const send = (method, params = {}) =>
    new Promise((ok) => {
      const id = ++seq
      pending.set(id, ok)
      socket.send(JSON.stringify({ id, method, params }))
    })
  return { child, profile, socket, send, consoleLines }
}

const session = {
  async evaluate(expression) {
    const message = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    const failure = message.result?.exceptionDetails
    if (failure) throw new Error(`页面求值失败：${expression} → ${failure.text}`)
    return message.result?.result?.value
  },
  async navigate(url) {
    await this.send('Page.navigate', { url })
  },
  async shot(name) {
    const message = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    })
    if (!message.result?.data) throw new Error(`截图失败：${name}`)
    const file = join(SHOTS, name)
    await writeFile(file, Buffer.from(message.result.data, 'base64'))
    return file
  },
  /**
   * 轮询等一个条件成立，返回毫秒数（超时返回 -1）。
   * 用它而不是固定 sleep：既能证明「兜底在 8 秒前就开了口」，也不至于在多慢的机器上白发呆。
   */
  async waitFor(expression, timeoutMs = 15000, intervalMs = 250) {
    const began = Date.now()
    while (Date.now() - began < timeoutMs) {
      if (await this.evaluate(`!!(${expression})`)) return Date.now() - began
      await sleep(intervalMs)
    }
    return -1
  },
}

const hasOverlay = `document.getElementById('boot-guard-fatal')`
// 按文字点按钮，不按顺序猜：按钮组末尾还有「复制诊断信息」
const clickByText = (label) => `(function () {
  var nodes = document.querySelectorAll('#boot-guard-fatal button')
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].textContent.indexOf(${JSON.stringify(label)}) === 0) { nodes[i].click(); return true }
  }
  return false
})()`
const overlayText = `(document.getElementById('boot-guard-fatal') || {textContent:''}).textContent`
const rootInfo = `(function(){var r=document.getElementById('root');if(!r)return {count:-1,height:-1};return {count:r.children.length,height:Math.round(r.getBoundingClientRect().height)}})()`

const main = async () => {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('dist/index.html 不存在，先 pnpm build')
  if (!existsSync(join(DIST, 'check.html'))) throw new Error('dist/check.html 不存在，先 pnpm build')
  await mkdir(SHOTS, { recursive: true })

  const built = await readFile(join(DIST, 'index.html'), 'utf8')
  const inline = /<script>([\s\S]*?)<\/script>/.exec(built)
  if (!inline) throw new Error('dist/index.html 里没有内联兜底脚本——产物不对')
  const guard = inline[1]

  // 一个「永远不会渲染」的页面，套的是 dist 里那段真实脚本，不是另抄一份
  const fixtureDir = await mkdtemp(join(tmpdir(), 'boot-guard-fixture-'))
  await writeFile(
    join(fixtureDir, 'no-render.html'),
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
      `<meta name="application-version" content="fixture">` +
      `<title>fixture: 界面不渲染</title><script>${guard}</script></head>` +
      `<body><div id="root"></div>` +
      `<script>throw new Error('fixture: boot crashed on purpose')</script>` +
      `</body></html>`,
    'utf8'
  )
  // 自检页也要一起放进 fixture：错误页的「打开自检」按钮是相对路径跳转，
  // 真实 APK 里两个文件在同一个目录，这里得照同样的关系摆。
  await writeFile(join(fixtureDir, 'check.html'), await readFile(join(DIST, 'check.html'), 'utf8'), 'utf8')

  const distServer = await startServer(DIST, DIST_PORT)
  const fixtureServer = await startServer(fixtureDir, FIXTURE_PORT)
  const chrome = await startChrome()
  Object.assign(session, chrome)

  try {
    await session.send('Page.enable')
    await session.send('Runtime.enable')
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    })
    const realUa = await session.evaluate('navigator.userAgent')
    const realChromium = Number((/Chrome\/(\d+)/.exec(realUa) ?? [])[1] ?? 0)
    console.log(`浏览器：${CHROME}\nUA：${realUa}\n内核版本（解出来的）：${realChromium}\n`)

    const skip = (name) => only && only !== name

    if (!skip('normal')) {
      await session.send('Emulation.setUserAgentOverride', { userAgent: realUa })
      await session.navigate(`${distServer.url}`)
      await sleep(11000)
      const shown = await session.evaluate(hasOverlay) !== null
      const root = await session.evaluate(rootInfo)
      const file = await session.shot('boot-ok-after-watchdog.png')
      record('normal：过了 8 秒判定点仍无错误页', !shown, shown ? '错误页出现了（误伤）' : `#root 子节点 ${root.count}、高 ${root.height}px`)
      record('normal：主界面确实渲染了', root.count > 0 && root.height >= 120, `子节点 ${root.count}、高 ${root.height}px → ${file}`)
    }

    if (!skip('no-render')) {
      await session.send('Emulation.setUserAgentOverride', { userAgent: realUa })
      await session.navigate(`${fixtureServer.url}no-render.html`)
      const waited = await session.waitFor(hasOverlay, 15000)
      const text = await session.evaluate(overlayText)
      const buttons = await session.evaluate(
        `Array.prototype.map.call(document.querySelectorAll('#boot-guard-fatal button'), function (node) { return node.textContent }).join(' | ')`
      )
      const file = await session.shot('boot-norender.png')
      record('no-render：兜底页在 8 秒判定点之后出现', waited >= 7500, `等了 ${waited}ms → ${file}`)
      record('no-render：标题说清「没有渲染出来」', text.includes('8 秒内没有渲染出来'), text.slice(0, 40))
      record('no-render：给了更新 WebView 的办法', text.includes('Android System WebView'))
      record('no-render：提示完全退出再打开', text.includes('完全退出'))
      record('no-render：诊断信息抓到了启动期错误', text.includes('boot crashed on purpose'))
      record('no-render：诊断信息带内核版本', /内核 Chrome \d+/.test(text), '')
      record('no-render：三个按钮齐全', buttons.includes('重新加载') && buttons.includes('打开自检') && buttons.includes('继续等待'), buttons)
      // 按文字找按钮，不按顺序猜：按钮组末尾还有「复制诊断信息」
      const dismissed = await session.evaluate(
        `(function () {
          var nodes = document.querySelectorAll('#boot-guard-fatal button')
          for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].textContent.indexOf('继续等待') === 0) { nodes[i].click(); break }
          }
          return document.getElementById('boot-guard-fatal') === null
        })()`
      )
      record('no-render：「继续等待」能关掉兜底页', dismissed)
      const again = await session.waitFor(hasOverlay, 15000)
      record('no-render：关掉后仍没渲染会重新出现', again >= 7500, `等了 ${again}ms`)
    }

    if (!skip('buttons')) {
      await session.send('Emulation.setUserAgentOverride', { userAgent: realUa })
      await session.navigate(`${fixtureServer.url}no-render.html`)
      await session.waitFor(hasOverlay, 15000)
      await session.evaluate('window.__bootGuardReloadMarker = 1')
      await session.evaluate(clickByText('重新加载'))
      await sleep(1500)
      const marker = await session.evaluate('typeof window.__bootGuardReloadMarker')
      record('buttons：「重新加载」真的重载了页面', marker === 'undefined', `重载后标记是 ${marker}`)

      await session.waitFor(hasOverlay, 15000)
      await session.evaluate(clickByText('打开自检'))
      await sleep(2500)
      const where = await session.evaluate('location.pathname')
      const items = await session.evaluate(`document.querySelectorAll('.item').length`)
      const file = await session.shot('boot-entry-to-check.png')
      record(
        'buttons：「打开自检」能进自检页（这就是白屏用户的入口）',
        String(where).endsWith('/check.html') && items >= 18,
        `${where}、${items} 项 → ${file}`
      )
    }

    if (!skip('no-render-ua')) {
      await session.send('Emulation.setUserAgentOverride', { userAgent: OLD_UA })
      await session.navigate(`${fixtureServer.url}no-render.html`)
      const waited = await session.waitFor(hasOverlay, 15000)
      const text = await session.evaluate(overlayText)
      const file = await session.shot('boot-oldua-norender.png')
      record('no-render-ua：内核分支在 8 秒前就开口', waited > 0 && waited < 6000, `等了 ${waited}ms → ${file}`)
      record('no-render-ua：判定是「内核太旧」不是「超时」', text.includes('系统内核太旧') && !text.includes('8 秒内没有渲染出来'))
      record('no-render-ua：写出了当前内核 Chrome 60', text.includes('Chrome 60'))
      record('no-render-ua：写出了最低要求 Chrome 84', text.includes('Chrome 84'))
      record('no-render-ua：给了 WebView 更新与完全退出', text.includes('Android System WebView') && text.includes('完全退出'))
    }

    if (!skip('ua-but-ok')) {
      await session.send('Emulation.setUserAgentOverride', { userAgent: OLD_UA })
      await session.navigate(`${distServer.url}`)
      await sleep(11000)
      const shown = await session.evaluate(hasOverlay) !== null
      const root = await session.evaluate(rootInfo)
      const warned = chrome.consoleLines.some((line) => line.includes('boot-guard'))
      const file = await session.shot('boot-oldua-but-rendered.png')
      record('ua-but-ok：界面渲染成功时不上错误页（抗误伤）', !shown, shown ? '错误页出现了' : `#root 子节点 ${root.count}、高 ${root.height}px → ${file}`)
      record('ua-but-ok：控制台留了说明', warned, 'console.warn [boot-guard] …')
    }

    if (!skip('check')) {
      await session.send('Emulation.setUserAgentOverride', { userAgent: realUa })
      await session.navigate(`${distServer.url}check.html`)
      await sleep(2500)
      const items = await session.evaluate(`document.querySelectorAll('.item').length`)
      const text = await session.evaluate(`document.getElementById('app').textContent`)
      const file = await session.shot('check-page.png')
      record('check：检测项都渲染出来了', items >= 18, `${items} 项 → ${file}`)
      record('check：现代内核上跑不了 0 项', text.includes('跑不了 0 项'))
      record('check：三档分组都在', text.includes('跑不了') && text.includes('能跑但有毛病') && text.includes('未使用 / 有兜底'))
      record('check：写了要求的最低内核与应用版本', text.includes('要求的最低内核 Chrome 84') && !text.includes('__APP_VERSION__'), text.slice(0, 30))
      // 复制按钮不是断言项：headless 下 execCommand 能不能过和真实点击不是一回事。
      // 用真实鼠标事件点它（先滚进视口），把实际结果打出来，别让「一键复制」停在「应该能用」。
      const box = await session.evaluate(`(function () {
        var nodes = document.querySelectorAll('#app button')
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].textContent.indexOf('复制检测结果给开发者') === 0) {
            nodes[i].scrollIntoView({ block: 'center' })
            var rect = nodes[i].getBoundingClientRect()
            return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
          }
        }
        return null
      })()`)
      if (box) {
        for (const type of ['mousePressed', 'mouseReleased']) {
          await session.send('Input.dispatchMouseEvent', {
            type,
            x: box.x,
            y: box.y,
            button: 'left',
            clickCount: 1,
          })
        }
        await sleep(500)
        const label = await session.evaluate(`document.querySelector('#app button').textContent`)
        console.log(`  （参考）真实点击「复制检测结果给开发者」后的文案：${label}`)
      }
    }

    if (!skip('check-stubbed')) {
      const added = await session.send('Page.addScriptToEvaluateOnNewDocument', {
        source:
          'delete window.ResizeObserver; delete window.structuredClone; delete Object.hasOwn; delete Object.fromEntries;',
      })
      const identifier = added.result?.identifier
      await session.navigate(`${distServer.url}check.html`)
      await sleep(2500)
      const text = await session.evaluate(`document.getElementById('app').textContent`)
      const file = await session.shot('check-page-stubbed.png')
      record('check-stubbed：删掉 ResizeObserver 后跑不了翻成 1 项', text.includes('跑不了 1 项'), `→ ${file}`)
      // 删掉的四项里三项在主包有垫片（fromEntries / hasOwn / structuredClone，见 polyfills.ts），
      // 自检页会把它们算作「已兜底」而不是「能跑但有毛病」——所以有毛病是 0 项、有兜底是 3 项。
      // 原先这里写的是「有毛病 1 项 / 有兜底 2 项」，那是 fromEntries 还没有垫片时的口径。
      record('check-stubbed：四项垫片能力全记为「有兜底」', text.includes('有兜底 3 项'))
      record('check-stubbed：有垫片的能力不再算「有毛病」', text.includes('能跑但有毛病 0 项'))
      if (identifier) await session.send('Page.removeScriptToEvaluateOnNewDocument', { identifier })
    }
  } finally {
    try {
      chrome.socket.close()
    } catch {}
    try {
      chrome.child.kill()
    } catch {}
    for (let i = 0; i < 4; i++) {
      await sleep(250)
      try {
        await rm(chrome.profile, { recursive: true, force: true })
        break
      } catch {}
    }
    if (distServer.child) distServer.child.kill()
    if (fixtureServer.child) fixtureServer.child.kill()
    await rm(fixtureDir, { recursive: true, force: true })
  }

  const failed = results.filter((item) => !item.ok)
  console.log(`\n${results.length - failed.length}/${results.length} 通过`)
  if (failed.length > 0) {
    for (const item of failed) console.log(`  FAIL ${item.name}${item.detail ? ` — ${item.detail}` : ''}`)
  }
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(`verify-boot-guard: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
})
