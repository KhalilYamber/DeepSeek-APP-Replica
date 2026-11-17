#!/usr/bin/env node
/**
 * 固定尺寸下量布局并断言：根容器高度、布局模式、上/左/右安全区的实际像素。
 *
 * 和 tools/shot.mjs 同一套做法（起无头 Chrome + CDP），区别是目的不是截图而是量数字：
 * 尺寸写死在 PRESETS 里，别每次随手拖窗口——拖出来的尺寸进不了基线。
 *
 * 用法：
 *   node tools/measure-layout.mjs
 *   node tools/measure-layout.mjs --baseline screenshots/layout-baseline.json
 *   node tools/measure-layout.mjs --check screenshots/layout-baseline.json
 *
 * 退出码：0 = 全部断言通过；1 = 有断言失败或与基线不符；2 = 起不来（dist/Chrome/服务）。
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const TOLERANCE = 1

/**
 * 标准尺寸。requireMobile = 「这类屏必须走移动端布局（侧栏为抽屉）」；
 * symmetric = 「横屏时左右边距必须相等」——两条都按需求写死，不给命令行改。
 * insets 是要模拟的 env(safe-area-inset-*)，单位 CSS px。
 */
const PRESETS = [
  {
    id: '390x844',
    note: '手机竖（iPhone 12/13 尺寸）',
    w: 390,
    h: 844,
    mobile: true,
    insets: { top: 24, left: 0, right: 0, bottom: 0 },
    requireMobile: true,
  },
  {
    id: '412x915',
    note: '手机竖（另一款常见比例，Android 大屏）',
    w: 412,
    h: 915,
    mobile: true,
    insets: { top: 24, left: 0, right: 0, bottom: 0 },
    requireMobile: true,
  },
  {
    id: '915x412',
    note: '手机横（刘海在左：左 36 / 右 0）',
    w: 915,
    h: 412,
    mobile: true,
    insets: { top: 0, left: 36, right: 0, bottom: 0 },
    requireMobile: true,
    symmetric: true,
  },
  {
    id: '412x915R',
    note: '反向横屏替身（竖尺寸 + 右 36）。注意：竖屏判据是 w>h，这一档验不到镜像，只验「竖屏别被横向安全区带跑偏」',
    w: 412,
    h: 915,
    mobile: true,
    insets: { top: 24, left: 0, right: 36, bottom: 0 },
    requireMobile: true,
    symmetric: true,
  },
  {
    id: '768x980',
    note: '临界点（断点 768：min-width 命中 → 桌面布局）',
    w: 768,
    h: 980,
    mobile: false,
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  },
  {
    id: '1024x768',
    note: '小桌面',
    w: 1024,
    h: 768,
    mobile: false,
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  },
  {
    id: '1280x800',
    note: '桌面',
    w: 1280,
    h: 800,
    mobile: false,
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  },
  {
    id: '915x412R',
    note: '附加档·验镜像：真横屏（刘海在右：左 0 / 右 36 → 镜像后两侧都该是 36）',
    w: 915,
    h: 412,
    mobile: true,
    insets: { top: 0, left: 0, right: 36, bottom: 0 },
    requireMobile: true,
    symmetric: true,
    mirror: true,
    extra: true,
  },
]

const HELP = `measure-layout —— 固定尺寸下量布局并断言（无头 Chrome + CDP，零依赖）

用法
  node tools/measure-layout.mjs [选项]

选项
  --baseline <file>  把本次量到的数字写成 JSON 基线
  --check <file>     与基线比对，容差 ${TOLERANCE}px；不一致退出 1
  --dist <dir>       要预览的产物目录，默认 <仓库>/dist
  --chrome <path>    指定 Chrome 可执行文件（默认读 CHROME_PATH，再退到系统安装路径）
  --help, -h         这份说明

每个尺寸量什么
  frame 高          根容器（CSS Modules 里 .frame-xxxxxx）的 border-box 高度
  布局模式          常驻侧栏 / 抽屉（读 DOM 里 sider- / drawer- 元素，并用
                    localStorage 的 chat-demo:sider-collapsed 区分「桌面收起」与「抽屉关着」）
  上安全区          根容器实际 padding-top 的像素值
  左/右距           视口边缘到内容盒的水平距离 = 容器左边 + 左 padding，
                    右侧同理。安全区镜像生效时两侧应相等。

断言（写死，命令行改不了）
  1 frame 高 > 0 且等于视口高（容差 ${TOLERANCE}px）——塌成 0 就是白屏征兆
  2 requireMobile 的尺寸（390/412 竖、915 之类矮屏）必须走移动端布局
  3 symmetric 的尺寸左右距相等（容差 ${TOLERANCE}px）。光判相等会被 0/0 蒙过去——两侧一起
    忽略安全区时也相等——所以横屏还要求两侧都等于「较大那次安全区」，竖屏则要求是 0。

safe-area 怎么模拟
  用 CDP 的 Emulation.setSafeAreaInsetsOverride 真改 env(safe-area-inset-*)。
  这个命令在旧版 Chrome 上没有：拿不到时脚本会明说「本机模拟不了」，
  左右对称那两条会标 SKIP，不计为通过——不拿 0/0 假装对称成立。
`

const MEASURE_SCRIPT = `(() => {
  const tokens = (el) => [...el.classList].filter((c) => !c.startsWith('__'))
  const find = (prefix) =>
    [...document.querySelectorAll('[class]')].find((el) => tokens(el).some((c) => c.startsWith(prefix)))
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none'
  const frame = find('frame-')
  if (!frame) return { missingFrame: true }
  const rect = frame.getBoundingClientRect()
  const cs = getComputedStyle(frame)
  const padding = {
    top: parseFloat(cs.paddingTop) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
    right: parseFloat(cs.paddingRight) || 0,
  }
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);padding-left:env(safe-area-inset-left,0px);' +
    'padding-right:env(safe-area-inset-right,0px)'
  document.body.appendChild(probe)
  const probeStyle = getComputedStyle(probe)
  const env = {
    top: parseFloat(probeStyle.paddingTop) || 0,
    left: parseFloat(probeStyle.paddingLeft) || 0,
    right: parseFloat(probeStyle.paddingRight) || 0,
  }
  probe.remove()
  let collapsed = null
  try {
    collapsed = localStorage.getItem('chat-demo:sider-collapsed')
  } catch {}
  const sider = find('sider-')
  const drawer = find('drawer-')
  const mode = visible(drawer)
    ? 'mobile-drawer(open)'
    : visible(sider)
      ? 'desktop-persistent'
      : collapsed === 'true'
        ? 'desktop-collapsed'
        : 'mobile-drawer(closed)'
  return {
    viewport: { w: innerWidth, h: innerHeight },
    frame: { h: rect.height, w: rect.width, top: rect.top, left: rect.left, right: rect.right },
    padding,
    env,
    mode,
    siderCollapsed: collapsed,
    safeSideVar: getComputedStyle(document.documentElement).getPropertyValue('--app-safe-side').trim(),
  }
})()`

const colors = process.stdout.isTTY
  ? { red: '\u001b[31m', green: '\u001b[32m', yellow: '\u001b[33m', dim: '\u001b[2m', reset: '\u001b[0m' }
  : { red: '', green: '', yellow: '', dim: '', reset: '' }

const fail2 = (message) => {
  process.stderr.write(`measure-layout: ${message}\n`)
  process.exit(2)
}

const padRight = (text, width) => String(text).padEnd(width)

const main = async () => {
  const args = { baseline: null, check: null, dist: null, chrome: null }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(HELP)
      return
    }
    if (arg === '--baseline' || arg === '--check' || arg === '--dist' || arg === '--chrome') {
      const value = argv[++i]
      if (!value) fail2(`${arg} 需要一个路径参数`)
      args[arg.slice(2)] = value
      continue
    }
    fail2(`不认识的参数：${arg}（看 node tools/measure-layout.mjs --help）`)
  }

  const distDir = resolve(REPO_ROOT, args.dist ?? 'dist')
  if (!existsSync(join(distDir, 'index.html'))) {
    fail2(
      `找不到 ${join(distDir, 'index.html')}\n` +
        '  先跑 pnpm build 产生产物（或者 ./init.ps1）；这个工具量的是构建后的真实产物，不是 dev server。'
    )
  }
  const chromePath = findChrome(args.chrome)
  if (!chromePath) {
    fail2(
      '找不到 Chrome。三条路：\n' +
        '  1. 设环境变量 CHROME_PATH 指向 chrome.exe；\n' +
        '  2. 用 --chrome "<路径>" 传进来；\n' +
        '  3. 装一份 Google Chrome（默认路径 C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe）。'
    )
  }

  const server = await startServer(distDir)
  const browser = await startChrome(chromePath)
  let exitCode = 0
  try {
    const rows = []
    const safeAreaSupported = await supportsSafeAreaInsets(browser)
    if (!safeAreaSupported) {
      process.stdout.write(
        `${colors.yellow}! 本机 Chrome 没有 Emulation.setSafeAreaInsetsOverride：env(safe-area-inset-*) 一律按 0 量${colors.reset}\n` +
          `${colors.yellow}  左右对称那几条会标 SKIP——0/0 相等不能当成镜像生效的证据。${colors.reset}\n\n`
      )
    }

    process.stdout.write(`measure-layout · ${browser.version}\n`)
    process.stdout.write(`  产物 ${distDir}\n`)
    process.stdout.write(`  safe-area 模拟：${safeAreaSupported ? '已启用（setSafeAreaInsetsOverride）' : '不可用'}\n\n`)

    for (const preset of PRESETS) {
      const row = await measurePreset({ browser, preset, url: server.url, safeAreaSupported })
      rows.push(row)
      if (row.failed) exitCode = 1
      printRow(row)
    }

    printSummary(rows, safeAreaSupported)

    if (args.baseline) {
      writeBaseline(resolve(REPO_ROOT, args.baseline), browser, rows)
    }
    if (args.check) {
      const ok = checkBaseline(resolve(REPO_ROOT, args.check), rows)
      if (!ok) exitCode = 1
    }
  } finally {
    await browser.close()
    server.close()
  }
  process.exit(exitCode)
}

const findChrome = (explicit) => {
  // 显式传了路径就别悄悄换一个：那会让人以为量的是自己指定的那份浏览器
  if (explicit) {
    if (!existsSync(explicit)) fail2(`--chrome 指定的文件不存在：${explicit}`)
    return explicit
  }
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  return candidates.find((c) => existsSync(c)) ?? null
}

const startServer = async (distDir) => {
  const port = 8200 + Math.floor(Math.random() * 600)
  const child = spawn(process.execPath, [join(REPO_ROOT, 'tools', 'serve.mjs'), distDir, String(port)], {
    stdio: 'ignore',
  })
  const url = `http://127.0.0.1:${port}/`
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(url)
      if (response.ok) return { url, close: () => child.kill() }
    } catch {}
    await sleep(100)
  }
  child.kill()
  fail2(`静态服务起不来（${url}）。tools/serve.mjs 可能在报错，单独跑一下看原因。`)
  return null
}

const startChrome = async (chromePath) => {
  const port = 9500 + Math.floor(Math.random() * 200)
  const profile = join(tmpdir(), `measure-layout-${port}`)
  rmSync(profile, { recursive: true, force: true })
  const child = spawn(
    chromePath,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--disable-dev-shm-usage',
      '--mute-audio',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  )
  child.on('error', () => {})
  let targets = null
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      targets = await response.json()
      if (targets?.some((t) => t.type === 'page')) break
    } catch {}
    await sleep(250)
  }
  if (!targets) {
    child.kill()
    fail2(
      'Chrome 起来了，但 DevTools 端口没有响应。\n' +
        '  常见原因：安全软件拦了本地端口、--headless 在这台机器上不可用。\n' +
        '  手工验一下：chrome --headless --remote-debugging-port=9222 about:blank，然后开 http://127.0.0.1:9222/json/list'
    )
  }
  const version = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).Browser ?? 'Chrome'
  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })

  let seq = 0
  const pending = new Map()
  let loadFired = false
  const exceptions = []
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
      return
    }
    if (message.method === 'Page.loadEventFired') loadFired = true
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails
      exceptions.push(`${detail.text} ${detail.exception?.description ?? ''}`.slice(0, 300))
    }
  })
  const send = (method, params = {}) =>
    new Promise((res) => {
      const id = ++seq
      pending.set(id, res)
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.error) throw new Error(`${result.error.message} (${expression.slice(0, 60)}…)`)
    if (result.result?.exceptionDetails) throw new Error(result.result.exceptionDetails.text)
    return result.result?.result?.value
  }

  await send('Runtime.enable')
  await send('Page.enable')

  return {
    version,
    exceptions,
    send,
    evaluate,
    resetExceptions: () => {
      exceptions.length = 0
    },
    waitForLoad: async () => {
      loadFired = false
      for (let i = 0; i < 200 && !loadFired; i++) await sleep(25)
      return loadFired
    },
    close: async () => {
      try {
        ws.close()
      } catch {}
      try {
        child.kill()
      } catch {}
      await sleep(150)
      // Windows 上 Chrome 刚被杀时还攥着 profile 目录（EPERM）。删不掉就算了：
      // 它是临时目录，为它把一次成功的测量变成 exit 2 才是真的错。
      for (let i = 0; i < 3; i++) {
        try {
          rmSync(profile, { recursive: true, force: true })
          return
        } catch {
          await sleep(200)
        }
      }
    },
  }
}

const supportsSafeAreaInsets = async (browser) => {
  const probe = await browser.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  })
  return !probe.error
}

const measurePreset = async ({ browser, preset, url, safeAreaSupported }) => {
  const { send, evaluate } = browser
  browser.resetExceptions()

  await send('Emulation.setDeviceMetricsOverride', {
    width: preset.w,
    height: preset.h,
    deviceScaleFactor: preset.mobile ? 2 : 1,
    mobile: preset.mobile,
    screenWidth: preset.w,
    screenHeight: preset.h,
  })
  if (safeAreaSupported) {
    await send('Emulation.setSafeAreaInsetsOverride', { insets: preset.insets })
  }

  const navigation = send('Page.navigate', { url })
  await navigation
  await browser.waitForLoad()
  let measured = null
  for (let i = 0; i < 120; i++) {
    try {
      measured = await evaluate(MEASURE_SCRIPT)
    } catch (error) {
      measured = { evaluationError: String(error.message ?? error) }
    }
    if (measured && measured.mode) break
    await sleep(50)
  }
  await sleep(150)
  try {
    measured = await evaluate(MEASURE_SCRIPT)
  } catch (error) {
    measured = { evaluationError: String(error.message ?? error) }
  }

  const row = { preset, measured, checks: [], warnings: [] }
  if (!measured || measured.missingFrame) {
    row.checks.push({ name: 'frame 存在', ok: false, detail: '页面上找不到 .frame-*（整页没渲染出来，白屏征兆）' })
    if (browser.exceptions.length > 0) {
      row.warnings.push(`页面异常：${browser.exceptions[0]}`)
    }
    row.failed = true
    return row
  }

  const vw = measured.viewport.w
  const vh = measured.viewport.h
  const frameH = Math.round(measured.frame.h * 100) / 100
  const leftMargin = Math.round((measured.frame.left + measured.padding.left) * 100) / 100
  const rightMargin = Math.round((vw - measured.frame.right + measured.padding.right) * 100) / 100
  const topPad = Math.round(measured.padding.top * 100) / 100
  row.values = { viewport: measured.viewport, frameH, leftMargin, rightMargin, topPad, mode: measured.mode, env: measured.env, safeSideVar: measured.safeSideVar }

  row.checks.push({
    name: 'frame 高 = 视口高',
    ok: frameH > 0 && Math.abs(frameH - vh) <= TOLERANCE,
    detail: `frame ${frameH} vs 视口 ${vh}`,
  })

  if (preset.requireMobile) {
    const isMobile = measured.mode.startsWith('mobile')
    row.checks.push({
      name: '走移动端布局（侧栏为抽屉）',
      ok: isMobile,
      detail: `实测 ${measured.mode}`,
    })
  }

  if (preset.symmetric) {
    // 只判「左右相等」会被 0/0 蒙过去：两侧都忽略安全区时也相等。所以再补一条「等于期望值」。
    // 期望值：横屏取两侧较大者（镜像），竖屏按设计恒为 0（safeArea.ts 的 resolveSafeSide）。
    const landscape = preset.w > preset.h
    const expected = landscape ? Math.max(preset.insets.left, preset.insets.right) : 0
    if (!safeAreaSupported) {
      row.checks.push({
        name: '左右距相等',
        ok: true,
        skipped: true,
        detail: `本机 Chrome 模拟不了 safe-area，${preset.mirror ? '镜像未验证' : '这一条不算通过'}`,
      })
      row.failed = row.checks.some((check) => !check.ok)
      return row
    }
    row.checks.push({
      name: '左右距相等',
      ok: Math.abs(leftMargin - rightMargin) <= TOLERANCE,
      detail: `左 ${leftMargin} 右 ${rightMargin}`,
    })
    row.checks.push({
      name: landscape ? `镜像：两侧都吃到 ${expected}px` : '竖屏不吃横向安全区（期望 0）',
      ok: Math.abs(leftMargin - expected) <= TOLERANCE && Math.abs(rightMargin - expected) <= TOLERANCE,
      detail: `期望 ${expected}/${expected}，实测 ${leftMargin}/${rightMargin}`,
    })
  }

  if (safeAreaSupported) {
    const drift = ['top', 'left', 'right'].filter(
      (side) => Math.abs((measured.env[side] ?? 0) - preset.insets[side]) > TOLERANCE
    )
    if (drift.length > 0) {
      row.warnings.push(
        `safe-area 模拟没落到位（${drift.join('/')}）：期望 ${JSON.stringify(preset.insets)}，页内 env() 读到 ${JSON.stringify(measured.env)}`
      )
    }
  }

  if (!preset.mobile && preset.id === '768x980' && measured.mode.startsWith('mobile')) {
    row.warnings.push('768 宽被判成移动端，与「窄于 768 才移动端」的文档不一致（断点方向变了？）')
  }

  row.failed = row.checks.some((check) => !check.ok)
  return row
}

const printRow = (row) => {
  const { preset, values } = row
  if (!values) {
    process.stdout.write(
      `${padRight(preset.id, 9)} | ${padRight('frame ?', 10)} | ${padRight('缺少 .frame', 23)} | ${padRight('左    ?', 6)} | ${padRight('右    ?', 6)} | ${colors.red}FAIL${colors.reset}\n`
    )
    process.stdout.write(`  ${colors.dim}${preset.note}${colors.reset}\n`)
    for (const warning of row.warnings) process.stdout.write(`  ${colors.dim}${warning}${colors.reset}\n`)
    return
  }
  const verdict = row.failed ? `${colors.red}FAIL${colors.reset}` : `${colors.green}OK${colors.reset}`
  const suffix = row.warnings.length > 0 ? ` ${colors.yellow}!${colors.reset}` : ''
  process.stdout.write(
    `${padRight(preset.id, 9)} | ${padRight(`frame ${values.frameH}`, 10)} | ${padRight(values.mode, 23)} | ` +
      `${padRight(`左 ${values.leftMargin}`, 6)} | ${padRight(`右 ${values.rightMargin}`, 6)} | ${verdict}${suffix}\n`
  )
  process.stdout.write(
    `  ${colors.dim}${preset.note}${colors.reset}\n` +
      `  ${colors.dim}env 上/左/右 = ${values.env.top}/${values.env.left}/${values.env.right}（模拟 ${preset.insets.top}/${preset.insets.left}/${preset.insets.right}）；` +
      `padding-top = ${values.topPad}；--app-safe-side = ${values.safeSideVar || '未设置'}${colors.reset}\n`
  )
  for (const warning of row.warnings) {
    process.stdout.write(`  ${colors.yellow}! ${warning}${colors.reset}\n`)
  }
  for (const check of row.checks) {
    if (check.ok && !check.skipped) continue
    const mark = check.skipped ? 'SKIP' : 'FAIL'
    process.stdout.write(`  ${colors.red}${mark}${colors.reset} ${check.name}：${check.detail}\n`)
  }
}

const printSummary = (rows, safeAreaSupported) => {
  const failed = rows.filter((row) => row.failed)
  const warned = rows.filter((row) => row.warnings.length > 0)
  const skipped = rows.flatMap((row) => row.checks.filter((check) => check.skipped))
  process.stdout.write('\n')
  if (failed.length === 0) {
    process.stdout.write(`${colors.green}全部 ${rows.length} 个尺寸通过${colors.reset}\n`)
  } else {
    process.stdout.write(`${colors.red}${failed.length}/${rows.length} 个尺寸失败：${failed.map((r) => r.preset.id).join(', ')}${colors.reset}\n`)
  }
  if (warned.length > 0) process.stdout.write(`  ${warned.length} 个尺寸带警告（!）\n`)
  if (skipped.length > 0) process.stdout.write(`  ${skipped.length} 条断言被跳过（本机模拟不了 safe-area）\n`)
  if (!safeAreaSupported) {
    process.stdout.write(`  ${colors.yellow}这台机器上的左右对称结论不成立，真机验收仍要看手机。${colors.reset}\n`)
  }
}

const writeBaseline = (file, browser, rows) => {
  const snapshot = {
    tool: 'measure-layout',
    browser: browser.version,
    capturedAt: new Date().toISOString(),
    tolerance: TOLERANCE,
    presets: rows
      .filter((row) => row.values)
      .map((row) => ({
        id: row.preset.id,
        viewport: row.values.viewport,
        frameH: row.values.frameH,
        mode: row.values.mode,
        leftMargin: row.values.leftMargin,
        rightMargin: row.values.rightMargin,
        topPad: row.values.topPad,
      })),
  }
  writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`)
  process.stdout.write(`基线已写入 ${file}（${snapshot.presets.length} 个尺寸）\n`)
}

const checkBaseline = (file, rows) => {
  if (!existsSync(file)) {
    process.stdout.write(`${colors.red}基线文件不存在：${file}${colors.reset}\n`)
    return false
  }
  let baseline
  try {
    baseline = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    process.stdout.write(`${colors.red}基线文件不是合法 JSON：${file}（${error.message}）${colors.reset}\n`)
    return false
  }
  const expected = new Map((baseline.presets ?? []).map((row) => [row.id, row]))
  const diffs = []
  for (const row of rows) {
    if (!row.values) {
      diffs.push(`${row.preset.id}: 本次没量出数字`)
      continue
    }
    const base = expected.get(row.preset.id)
    if (!base) {
      diffs.push(`${row.preset.id}: 基线里没有这一档（基线是哪一版工具写的？）`)
      continue
    }
    expected.delete(row.preset.id)
    if (base.mode !== row.values.mode) {
      diffs.push(`${row.preset.id}: 布局模式 ${base.mode} → ${row.values.mode}`)
    }
    for (const key of ['frameH', 'leftMargin', 'rightMargin', 'topPad']) {
      const now = row.values[key]
      const was = base[key]
      if (typeof was !== 'number') continue
      if (Math.abs(now - was) > TOLERANCE) {
        diffs.push(`${row.preset.id}: ${key} ${was} → ${now}（差 ${Math.round((now - was) * 100) / 100}px）`)
      }
    }
  }
  for (const id of expected.keys()) {
    diffs.push(`${id}: 基线里有，这次没量（尺寸表改过了？）`)
  }
  if (diffs.length === 0) {
    process.stdout.write(`${colors.green}与基线一致（容差 ${TOLERANCE}px，基线取自 ${baseline.capturedAt ?? '未知时间'}）${colors.reset}\n`)
    return true
  }
  process.stdout.write(`${colors.red}与基线不一致：${diffs.length} 处${colors.reset}\n`)
  for (const diff of diffs) process.stdout.write(`  ${diff}\n`)
  return false
}

try {
  await main()
} catch (error) {
  const detail = error instanceof Error ? (process.env.DEBUG ? error.stack ?? error.message : error.message) : String(error)
  process.stderr.write(`measure-layout: 脚本自身出错 —— ${detail}\n`)
  process.stderr.write('  加 DEBUG=1 重跑可以看完整堆栈。\n')
  process.exit(2)
}
