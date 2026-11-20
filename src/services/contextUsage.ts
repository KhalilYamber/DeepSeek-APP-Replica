import type { MessageUsage } from './api/types.js'
import type { Session } from './chat/types.js'

/**
 * 两段用量合并：`input_tokens` 在 message_start 里给，`output_tokens` 在 message_delta 里给。
 * 后到的那段用 0 占位时不能把先到的值冲掉，否则长对话的上下文会算成 0。
 */
export const mergeUsage = (
  prev: MessageUsage | undefined,
  next: MessageUsage | undefined
): MessageUsage | undefined => {
  if (!next) {
    return prev
  }
  if (!prev) {
    return next
  }
  return {
    input_tokens: next.input_tokens || prev.input_tokens,
    cache_creation_input_tokens: next.cache_creation_input_tokens || prev.cache_creation_input_tokens,
    cache_read_input_tokens: next.cache_read_input_tokens || prev.cache_read_input_tokens,
    output_tokens: next.output_tokens || prev.output_tokens,
    server_tool_use: next.server_tool_use ?? prev.server_tool_use,
  }
}

/** 这一轮实际送进模型的上下文 = 输入（含缓存读写）+ 本轮输出 */
export const usedTokens = (usage: MessageUsage): number =>
  usage.input_tokens +
  usage.cache_creation_input_tokens +
  usage.cache_read_input_tokens +
  usage.output_tokens

/** 占模型的上下文窗口的百分比；没有上限时返回 null，调用方显示 `--` */
export const percentOf = (used: number, limit: number | null | undefined): number | null => {
  if (!limit || limit <= 0) {
    return null
  }
  return Math.min(100, Math.round((used / limit) * 100))
}

export const formatTokens = (tokens: number): string => {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`
  }
  return String(tokens)
}

/** 最近一条带用量的回复；升级前的老消息没有用量，返回 undefined */
export const latestUsage = (session: Session | undefined): MessageUsage | undefined => {
  if (!session) {
    return undefined
  }
  for (let index = session.messages.length - 1; index >= 0; index--) {
    const message = session.messages[index]
    if (message.role === 'assistant' && message.usage) {
      return message.usage
    }
  }
  return undefined
}
