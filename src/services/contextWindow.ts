export type ModelEntry = {
  id: string
  /** GET /models 返回的上下文窗口；接口没给时缺省 */
  context_window?: number
}

/** 按当前模型 id 找上限；找不到、或值不是正数时返回 null（不猜一个假上限） */
export const pickContextWindow = (
  models: ModelEntry[] | undefined,
  modelId: string
): number | null => {
  if (!Array.isArray(models)) {
    return null
  }
  const entry = models.find((model) => model.id === modelId)
  const value = entry?.context_window
  return typeof value === 'number' && value > 0 ? value : null
}

const CACHE_KEY = 'chat-demo:context-window'

type CachedWindow = {
  model: string
  value: number
  at: number
}

/** 缓存一天：模型上限不常变，没必要每次启动都请一次 /models */
const MAX_AGE = 24 * 60 * 60 * 1000

export const readCachedContextWindow = (model: string): number | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) {
      return null
    }
    const cached: unknown = JSON.parse(raw)
    if (typeof cached !== 'object' || cached === null) {
      return null
    }
    const { model: cachedModel, value, at } = cached as CachedWindow
    if (cachedModel !== model || typeof value !== 'number' || value <= 0) {
      return null
    }
    if (typeof at !== 'number' || Date.now() - at > MAX_AGE) {
      return null
    }
    return value
  } catch {
    return null
  }
}

export const writeCachedContextWindow = (model: string, value: number): void => {
  try {
    const cached: CachedWindow = { model, value, at: Date.now() }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  } catch {
    // 存储不可用时只能在内存里用，不影响主流程
  }
}
