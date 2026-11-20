import { translate, type TranslationMessage } from '../../i18n/index.js'
import { readMessageEvent } from './parseEvent.js'
import { readServerSentEvents } from './sse.js'
import {
  CONNECT_TIMEOUT_MS,
  RETRY_DELAY_MS,
  UPLOAD_TIMEOUT_MS,
  linkAbort,
  noteStreamEvent,
  notifyRequestRetry,
  shouldRetry,
  startStreamWatch,
  timeoutMessage,
  timeoutMs,
  type TimeoutScope,
} from './timeout.js'
import type {
  ApiErrorBody,
  CreateMessageRequest,
  FileObject,
  FilePurpose,
  MessageStreamEvent,
} from './types.js'

/** 构建期 API 地址，默认 https://api.deepseek.com；本地开发支持开发服务器代理 */
export const API_ORIGIN = __API_ORIGIN__
/** Anthropic 兼容接口的前缀 */
const ANTHROPIC_BASE_URL = `${API_ORIGIN}/anthropic/v1`
/** 引用 Files API 上传的图片、调用 Anthropic 兼容 Files API 时必须携带 */
const FILES_BETA = 'files-api-2025-04-14'

export type ApiErrorKind =
  /** 非 2xx 响应 */
  | 'http'
  /** 流中返回的错误帧（如等待生成超时），随后连接关闭 */
  | 'stream'
  /** 请求没有到达服务端（断网、跨域被拦截等） */
  | 'network'
  /** 流在 message_stop 之前结束 */
  | 'interrupted'
  /** 响应不符合协议（如非 SSE 响应） */
  | 'protocol'

export class ApiError extends Error {
  readonly localMessage?: TranslationMessage

  constructor(
    readonly kind: ApiErrorKind,
    message: string | TranslationMessage,
    readonly status?: number
  ) {
    super(typeof message === 'string' ? message : translate(message.key, message.params))
    this.name = 'ApiError'
    this.localMessage = typeof message === 'string' ? undefined : message
  }
}

const isErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof (value as ApiErrorBody).error?.message === 'string'

const readErrorResponse = async (
  response: Response,
  kind: 'http' | 'protocol' = 'http',
  fallback = response.statusText
): Promise<ApiError> => {
  const text = await response.text().catch(() => '')
  let message = text || fallback
  try {
    const body: unknown = JSON.parse(text)
    if (isErrorBody(body)) {
      message = body.error.message
    }
  } catch {
    // 非 JSON 响应体直接展示原文
  }
  return new ApiError(kind, message, response.status)
}

export type RequestOptions = {
  /** 等响应头的最长时间；默认按「连接」算，上传按体积给更大的边界 */
  timeoutMs?: number
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 发请求并等响应头：超时、断网都会抛 ApiError，不会一直挂着。
 * 只对「还没拿到任何响应内容」的失败自动重试一次（连接失败、429、5xx），重试前弹一条 toast。
 * 超时与调用方主动停止不重试；调用方停止时原样抛出它自己的中止错误。
 */
export const request = async (
  url: string,
  init: RequestInit,
  options: RequestOptions = {}
): Promise<Response> => {
  const scope: TimeoutScope = 'connect'
  const budget = options.timeoutMs ?? CONNECT_TIMEOUT_MS
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController()
    const unlink = linkAbort(init.signal ?? undefined, controller)
    let timedOut = false
    const timer = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, budget)
    try {
      let response: Response
      try {
        response = await fetch(url, { ...init, signal: controller.signal })
      } catch (cause) {
        // 调用方主动停止：原样抛出，别误报成超时
        if (init.signal?.aborted) {
          throw cause
        }
        if (timedOut) {
          throw new ApiError('network', timeoutMessage(scope, budget))
        }
        const error = new ApiError(
          'network',
          cause instanceof Error ? cause.message : String(cause)
        )
        if (!shouldRetry({ attempt, failure: 'network' })) {
          throw error
        }
        notifyRequestRetry()
        await wait(RETRY_DELAY_MS)
        continue
      }
      if (response.ok) {
        return response
      }
      const error = await readErrorResponse(response)
      if (!shouldRetry({ attempt, failure: 'http', status: error.status })) {
        throw error
      }
      notifyRequestRetry()
      await wait(RETRY_DELAY_MS)
    } finally {
      window.clearTimeout(timer)
      unlink()
    }
  }
}

const anthropicHeaders = (apiKey: string, beta: boolean): Record<string, string> => ({
  // DeepSeek 兼容接口的鉴权方式，也可使用 Authorization: Bearer。
  'x-api-key': apiKey,
  // Files API 和通过 file_id 引用图片时必传；纯文本聊天无需携带。
  ...(beta ? { 'anthropic-beta': FILES_BETA } : {}),
})

/** 用 GET /models 校验 API Key（不产生费用），并把模型清单带回来（含 context_window） */
export const verifyApiKey = async (
  apiKey: string,
  signal?: AbortSignal
): Promise<{ data: Array<{ id: string; context_window?: number }> }> => {
  const response = await request(`${API_ORIGIN}/models`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  })
  try {
    return (await response.json()) as { data: Array<{ id: string; context_window?: number }> }
  } catch {
    // 状态码已经通过，body 解析不出来不影响「Key 有效」这个结论
    return { data: [] }
  }
}

/**
 * POST /anthropic/v1/files 上传附件（不设过期时间，会话里的历史附件一直可用）。
 * purpose 为 null 时不传该字段（图片）；purpose 必须排在 file 之前。
 */
export const uploadFile = async (
  apiKey: string,
  file: File,
  purpose: FilePurpose | null,
  signal?: AbortSignal
): Promise<FileObject> => {
  const form = new FormData()
  if (purpose) {
    form.append('purpose', purpose)
  }
  form.append('file', file)
  const response = await request(
    `${ANTHROPIC_BASE_URL}/files`,
    {
      method: 'POST',
      headers: anthropicHeaders(apiKey, true),
      body: form,
      signal,
    },
    { timeoutMs: UPLOAD_TIMEOUT_MS }
  )
  return (await response.json()) as FileObject
}

/** DELETE /anthropic/v1/files/{file_id} */
export const deleteFile = async (apiKey: string, fileId: string): Promise<void> => {
  await request(`${ANTHROPIC_BASE_URL}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: anthropicHeaders(apiKey, true),
  })
}

const hasFile = (body: CreateMessageRequest) =>
  body.messages.some(
    (message) =>
      typeof message.content !== 'string' &&
      message.content.some((block) => block.type === 'image' || block.type === 'document')
  )

/**
 * POST /anthropic/v1/messages（stream: true），逐个产出流式事件，收到 message_stop 时结束。
 * ping、保活注释与无法解析的内容不产出；中止请求时抛出 signal 的 AbortError。
 */
export async function* streamMessage(
  apiKey: string,
  body: CreateMessageRequest,
  signal: AbortSignal
): AsyncGenerator<MessageStreamEvent> {
  const response = await request(`${ANTHROPIC_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      ...anthropicHeaders(apiKey, hasFile(body)),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  })
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw await readErrorResponse(response, 'protocol', '')
  }

  // 看门狗：连上后先等首字节（思考型回答起步慢，30 秒），之后每收到一个事件就把截止时间
  // 推到流空闲阈值（60 秒）。超时就中止读取并抛 interrupted——调用方据此提示「没有新内容」，
  // 而不是让转圈永远转下去。
  const stream = new AbortController()
  const unlink = linkAbort(signal, stream)
  let watch = startStreamWatch()
  const stalled: { scope: TimeoutScope | null } = { scope: null }
  let timer = 0
  const arm = () => {
    const scope = watch.deadline
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      stalled.scope = scope
      stream.abort()
    }, timeoutMs(scope))
  }

  // iOS 会冻结后台标签页里的定时器：切回前台时那根定时器可能还没走到点，
  // 但流其实早就断了——界面就一直停在「正在生成」，发送键永远是灰的。
  // 所以除定时器外再记一个「最后一次收到数据的时间」，回到前台时按时间戳判断，
  // 不依赖后台是否执行过定时器。
  let lastChunkAt = Date.now()
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') {
      return
    }
    const scope = watch.deadline
    if (Date.now() - lastChunkAt >= timeoutMs(scope)) {
      stalled.scope = scope
      stream.abort()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  try {
    arm()
    for await (const { event: eventName, data } of readServerSentEvents(
      response.body,
      stream.signal
    )) {
      watch = noteStreamEvent(watch)
      lastChunkAt = Date.now()
      arm()
      let payload: unknown
      try {
        payload = JSON.parse(data)
      } catch {
        if (eventName !== 'error') {
          continue
        }
      }
      if (isErrorBody(payload)) {
        throw new ApiError('stream', payload.error.message)
      }
      if (eventName === 'error') {
        throw new ApiError('stream', data)
      }
      const event = readMessageEvent(payload)
      if (!event) {
        continue
      }
      yield event
      if (event.type === 'message_stop') {
        return
      }
    }
  } finally {
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibility)
    unlink()
  }
  const stalledScope = stalled.scope
  // 用户主动停止不报超时：那是我们自己中止的，调用方按「已停止」处理。
  if (stalledScope && !signal.aborted) {
    throw new ApiError('interrupted', timeoutMessage(stalledScope))
  }
  // 服务端没有提供错误内容时保持为空，不推测断流原因。
  throw new ApiError('interrupted', '')
}
