import type { Message, Session, TextPart } from './types.js'

/** 一段命中文本：前后各截一小段，中间是原文里命中的那几个字。 */
export type SearchSnippet = {
  before: string
  match: string
  after: string
}

/** 一个会话至多出一条结果：标题命中或任一条消息正文命中都算。 */
export type SearchHit = {
  sessionId: string
  /** 未命名的会话为空串，由界面决定显示什么 */
  title: string
  /** 会话最后更新时间，用于排序 */
  at: number
  /** 正文里的命中片段；只有标题命中时为 null */
  snippet: SearchSnippet | null
}

/** 上下文各截多少字：手机侧栏一行大约放得下这些。 */
const RADIUS = 26

/**
 * 一条消息里可被搜索到的正文。
 * 用户消息取正文；助手消息只取可见的文本块——思考过程不进搜索，
 * 否则会出现「搜到了但点进去看不见这几个字」。
 */
export const messageText = (message: Message): string => {
  if (message.role === 'user') {
    return message.content
  }
  return message.blocks
    .filter((block): block is TextPart => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

/** 把空白压成单个空格：预览是一行文本，换行与缩进只会让它看起来断掉。 */
export const flattenText = (text: string): string => text.replace(/\s+/g, ' ').trim()

const indexOfQuery = (text: string, query: string): number =>
  text.toLowerCase().indexOf(query.toLowerCase())

/**
 * 命中位置前后各取 RADIUS 个字；不命中返回 null。
 * 中文没有空格，所以这里是「连续几个字」的子串匹配，不做分词。
 */
export const makeSnippet = (text: string, query: string): SearchSnippet | null => {
  const needle = query.trim()
  if (!needle) {
    return null
  }
  const flat = flattenText(text)
  const at = indexOfQuery(flat, needle)
  if (at < 0) {
    return null
  }
  const start = Math.max(0, at - RADIUS)
  const end = Math.min(flat.length, at + needle.length + RADIUS)
  return {
    before: (start > 0 ? '…' : '') + flat.slice(start, at),
    match: flat.slice(at, at + needle.length),
    after: flat.slice(at + needle.length, end) + (end < flat.length ? '…' : ''),
  }
}

/**
 * 在单个会话里找结果：标题命中即算命中，正文则从最新消息往旧找第一条命中的。
 * 有正文命中时带上片段，只有标题命中时片段为 null。
 */
export const findInSession = (session: Session, query: string): SearchHit | null => {
  const needle = query.trim()
  if (!needle) {
    return null
  }
  let snippet: SearchSnippet | null = null
  for (let index = session.messages.length - 1; index >= 0; index--) {
    snippet = makeSnippet(messageText(session.messages[index]), needle)
    if (snippet) {
      break
    }
  }
  const titleHit = indexOfQuery(session.title ?? '', needle) >= 0
  if (!snippet && !titleHit) {
    return null
  }
  return {
    sessionId: session.id,
    title: session.title ?? '',
    at: session.updatedAt,
    snippet,
  }
}

/** 按最近更新排，最多留 limit 条——结果要稳定，不能随扫描顺序变。 */
export const sortHits = (hits: SearchHit[], limit = 40): SearchHit[] =>
  hits.sort((a, b) => b.at - a.at).slice(0, limit)

/** 跨会话搜索（已把全部会话读进内存时用；存储层走游标，不必先拼出整个数组）。 */
export const searchAllSessions = (
  sessions: readonly Session[],
  query: string,
  limit = 40
): SearchHit[] => {
  const hits: SearchHit[] = []
  for (const session of sessions) {
    const hit = findInSession(session, query)
    if (hit) {
      hits.push(hit)
    }
  }
  return sortHits(hits, limit)
}
