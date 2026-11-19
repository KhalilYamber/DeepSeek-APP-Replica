import { create } from 'zustand'

/**
 * 用户对**单条消息**思考区的手动展开/收起，按消息 id 记住。
 *
 * 为什么要单独存：设置项只决定「没被手动碰过」的消息怎么显示；
 * 手动点过的必须压过设置，而且切到别的对话再切回来也要保持——
 * 那是用户对这条消息的选择，不是临时状态。
 *
 * 存 localStorage：一条键装一个 { 消息id: 布尔 }，**不设上限、不自动清理**。
 * 每条几十字节，几千条约几十 KB，离 localStorage 的上限（通常 5MB）很远；
 * 删会话也不清（残留条目没有功能影响，清它反而要遍历全库）。
 */
type ThinkingOpenState = { overrides: Record<string, boolean> }

const KEY = 'chat-demo:thinking-open'

const load = (): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const result: Record<string, boolean> = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'boolean') {
        result[id] = value
      }
    }
    return result
  } catch {
    return {}
  }
}

const save = (overrides: Record<string, boolean>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(overrides))
  } catch {
    // 存储不可用时只在内存中生效，界面其它部分不受影响
  }
}

export const useThinkingOpen = create<ThinkingOpenState>(() => ({ overrides: load() }))

/** 记下这条消息的手动选择；已经有记录就覆盖 */
export const setThinkingOpen = (messageId: string, open: boolean) => {
  const overrides = { ...useThinkingOpen.getState().overrides, [messageId]: open }
  save(overrides)
  useThinkingOpen.setState({ overrides })
}
