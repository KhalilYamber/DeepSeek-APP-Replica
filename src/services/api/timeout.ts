import type { TranslationMessage } from '../../i18n/index.js'

/**
 * 请求超时的阈值、文案映射与重试策略。
 *
 * 这里只放常量与纯函数：计时器、AbortController 的接线都在 client.ts。
 * 这样 Node 能直接跑 test/timeout.test.ts 守住边界（决策 6 的约束：不带运行时 import）。
 */

/** 一个请求处于哪一段：等响应头 → 等第一段内容 → 流式内容之间 */
export type TimeoutScope = 'connect' | 'firstByte' | 'stream'

/** 等响应头（含建连、TLS、服务端受理）：超了就当连不上 */
export const CONNECT_TIMEOUT_MS = 5_000
/** 拿到响应头后，第一个流式事件的最长等待；思考型回答起步慢，给得宽一些 */
export const FIRST_BYTE_TIMEOUT_MS = 30_000
/** 流式过程中两段内容之间的最长静默 */
export const STREAM_IDLE_TIMEOUT_MS = 60_000
/**
 * 上传要先把请求体写完才会有响应头，按「连接」的 5 秒算会把正常的大文件上传判成超时。
 * 这条边界只负责「彻底卡死」，不负责「慢」。
 */
export const UPLOAD_TIMEOUT_MS = 120_000
/** 重试间隔 */
export const RETRY_DELAY_MS = 1_000
/** 首次 + 最多 1 次重试 */
export const MAX_REQUEST_ATTEMPTS = 2

const TIMEOUTS: Record<TimeoutScope, number> = {
  connect: CONNECT_TIMEOUT_MS,
  firstByte: FIRST_BYTE_TIMEOUT_MS,
  stream: STREAM_IDLE_TIMEOUT_MS,
}

export const timeoutMs = (scope: TimeoutScope): number => TIMEOUTS[scope]

const TIMEOUT_MESSAGE_KEYS: Record<TimeoutScope, TranslationMessage['key']> = {
  connect: 'requestTimeout',
  firstByte: 'firstByteTimeout',
  stream: 'streamIdleTimeout',
}

/** 超时文案：把秒数一起带上，用户才知道自己等了多久（上传走自己的预算，所以允许覆盖） */
export const timeoutMessage = (
  scope: TimeoutScope,
  budgetMs: number = TIMEOUTS[scope]
): TranslationMessage => ({
  key: TIMEOUT_MESSAGE_KEYS[scope],
  params: { seconds: Math.round(budgetMs / 1000) },
})

/**
 * 把调用方的 signal 接到本次请求自己的 controller 上：任一方中止，两者都中止。
 * AbortSignal.any 要 Chrome 116，本项目的内核目标是 Chrome 70（rspack targets），所以手动串。
 * 返回解绑函数：一次尝试结束就摘掉监听，重试不会堆监听器、也不会被上一次的 signal 拖着走。
 */
export const linkAbort = (
  source: AbortSignal | undefined,
  target: AbortController
): (() => void) => {
  if (!source) {
    return () => {}
  }
  if (source.aborted) {
    target.abort()
    return () => {}
  }
  const onAbort = () => target.abort()
  source.addEventListener('abort', onAbort, { once: true })
  return () => source.removeEventListener('abort', onAbort)
}

/**
 * 流式看门狗的状态：先等首字节，收到过事件之后按空闲间隔算。
 * 纯状态机——阈值的选择在 timeoutMs，client.ts 只负责把定时器接上去。
 */
export type StreamWatch = { events: number; deadline: TimeoutScope }

export const startStreamWatch = (): StreamWatch => ({ events: 0, deadline: 'firstByte' })

export const noteStreamEvent = (watch: StreamWatch): StreamWatch => ({
  events: watch.events + 1,
  deadline: 'stream',
})

/** 请求失败的原因：决定能不能重发 */
export type RequestFailure = 'aborted' | 'timeout' | 'network' | 'http'

export type RetryInput = {
  /** 已经失败过几次，从 0 开始 */
  attempt: number
  failure: RequestFailure
  /** failure 为 http 时的状态码 */
  status?: number
}

/**
 * 只重试「还没拿到任何响应内容、重发不会产生重复内容」的失败：连接立刻失败、429、5xx，最多 1 次。
 * 超时不重试——再等一轮只是把用户的等待翻倍，且没有任何证据说第二次会通。
 * 用户主动停止（aborted）更不重试。
 */
export const shouldRetry = ({ attempt, failure, status }: RetryInput): boolean => {
  if (attempt + 1 >= MAX_REQUEST_ATTEMPTS) {
    return false
  }
  if (failure === 'aborted' || failure === 'timeout') {
    return false
  }
  if (failure === 'network') {
    return true
  }
  return status === 429 || (status ?? 0) >= 500
}

type RetryNoticeListener = () => void

let retryNoticeListener: RetryNoticeListener | null = null

/** 重试是可见动作：通知订阅方（App 接成 toast），不静默重发 */
export const onRequestRetry = (listener: RetryNoticeListener): (() => void) => {
  retryNoticeListener = listener
  return () => {
    if (retryNoticeListener === listener) {
      retryNoticeListener = null
    }
  }
}

export const notifyRequestRetry = () => {
  retryNoticeListener?.()
}
