/**
 * 本机诊断：一份环形错误日志 + 一份可复制的环境摘要。
 *
 * 存在用途只有一个——用户说「发不出去 / 打不开」时，能拿到内核、系统、存储和最近的错误，
 * 而不是靠猜。全部只写本机 localStorage，不上报任何服务器。
 */

export type DiagnosticEntry = {
  at: number
  kind: string
  text: string
}

const STORAGE_KEY = 'chat-demo:diagnostics'
const LIMIT = 20

const readLog = (): DiagnosticEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(
      (item): item is DiagnosticEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as DiagnosticEntry).text === 'string' &&
        typeof (item as DiagnosticEntry).at === 'number'
    )
  } catch {
    return []
  }
}

export const readDiagnostics = (): DiagnosticEntry[] => readLog()

export const clearDiagnostics = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 存储不可用时本来就没有记录
  }
}

/** 记一条；超过上限就丢最旧的。任何异常都不允许影响主流程。 */
export const logDiagnostic = (kind: string, text: string) => {
  try {
    const entries = readLog()
    entries.push({ at: Date.now(), kind, text: String(text).slice(0, 300) })
    while (entries.length > LIMIT) {
      entries.shift()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // 写不进去就算了
  }
}

const two = (value: number) => (value < 10 ? `0${value}` : String(value))

const formatAt = (at: number) => {
  const date = new Date(at)
  return `${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`
}

const appVersion = (): string => {
  const meta = document.querySelector('meta[name="application-version"]')
  return meta?.getAttribute('content') || '读不到'
}

const readKeyState = (): string => {
  try {
    return localStorage.getItem('chat-demo:api-key') ? '已填' : '未填'
  } catch {
    return '读取失败'
  }
}

/** 拼出一份可以直接复制发出去的环境摘要。 */
export const collectDiagnostics = async (): Promise<string> => {
  const lines: string[] = []
  const ua = navigator.userAgent
  const ios = /OS (\d+)[._](\d+)/.exec(ua)
  const chrome = /(?:Chrome|CriOS)\/(\d+)/.exec(ua)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches

  lines.push(`时间 ${formatAt(Date.now())}`)
  lines.push(`页面 ${location.href}`)
  lines.push(`应用版本 ${appVersion()}`)
  lines.push(`UA ${ua}`)
  lines.push(
    `系统 iOS ${ios ? `${ios[1]}.${ios[2]}` : '否'} · 内核 Chrome ${chrome?.[1] ?? '未识别'}`
  )
  lines.push(`独立窗口 ${standalone ? '是' : '否'}（加到主屏幕时为是）`)
  lines.push(
    `屏幕 ${screen.width}×${screen.height} @${devicePixelRatio}x · 视口 ${window.innerWidth}×${window.innerHeight}`
  )
  lines.push(`语言 ${navigator.language} · 配色声明 ${document.documentElement.style.colorScheme || '未设'}`)
  lines.push(`API Key ${readKeyState()}`)

  try {
    const storage = navigator.storage
    const persisted = storage?.persisted ? await storage.persisted() : null
    const estimate = storage?.estimate ? await storage.estimate() : null
    const usage = estimate?.usage
    lines.push(
      `存储 持久化=${persisted === null ? '不支持' : persisted ? '是' : '否'} · 已用 ${
        typeof usage === 'number' ? `${(usage / 1048576).toFixed(1)}MB` : '未知'
      }`
    )
  } catch {
    lines.push('存储 读取失败')
  }

  const entries = readLog()
  if (entries.length === 0) {
    lines.push('错误记录 （无）')
  } else {
    lines.push('错误记录')
    for (const entry of entries.slice(-8)) {
      lines.push(`  ${formatAt(entry.at)} ${entry.kind} ${entry.text}`)
    }
  }
  return lines.join('\n')
}
