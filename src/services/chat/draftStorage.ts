/** 把草稿记录在本地存储里的形状固定下来：key 是会话 id（新对话用一个不可能与真实 id 冲突的标记） */

/** 控制字符开头，真实 sessionId 不会长这样 */
const NEW_CHAT_KEY = '\u0000new'

export const encodeDraftKey = (sessionId: string | null): string =>
  sessionId === null ? NEW_CHAT_KEY : sessionId

export const decodeDraftKey = (key: string): string | null =>
  key === NEW_CHAT_KEY ? null : key

/**
 * 只认「key → 非空字符串」。
 * 坏 JSON、数组、非对象、空文本一律丢弃——草稿丢了没关系，不能因为一条脏数据让整个界面起不来。
 */
export const parseDraftRecords = (raw: string | null): Array<[string | null, string]> => {
  if (!raw) {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return []
  }
  const entries: Array<[string | null, string]> = []
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string' && value.length > 0) {
      entries.push([decodeDraftKey(key), value])
    }
  }
  return entries
}

export const serializeDraftRecords = (entries: Array<[string | null, string]>): string => {
  const out: Record<string, string> = {}
  for (const [sessionId, text] of entries) {
    if (text) {
      out[encodeDraftKey(sessionId)] = text
    }
  }
  return JSON.stringify(out)
}
