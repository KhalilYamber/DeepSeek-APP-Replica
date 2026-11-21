import { create } from 'zustand'

/**
 * 记住「哪些分组是收起的」。
 * 只记收起的：没记录的分组一律按展开算，所以新建的分组默认展开。
 * 存 localStorage 而不是数据库——它是这台设备的界面记忆，不是分组本身的内容。
 */
const KEY = 'chat-demo:group-collapsed'

const read = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

const write = (keys: string[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(keys))
  } catch {
    // 存储不可用时只在内存中生效
  }
}

export const toggleCollapsedKey = (keys: string[], key: string): string[] =>
  keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key]

export const mergeCollapsedKeys = (
  keys: string[],
  targets: string[],
  collapsed: boolean
): string[] =>
  collapsed
    ? [...new Set([...keys, ...targets])]
    : keys.filter((key) => !targets.includes(key))

type GroupCollapsedStore = {
  collapsed: string[]
  toggle: (key: string) => void
  /** 一键折叠/展开：collapsed 为 true 时把 targets 全部收进集合，否则全部移出 */
  setAll: (targets: string[], collapsed: boolean) => void
}

export const useGroupCollapsed = create<GroupCollapsedStore>((set, get) => ({
  collapsed: read(),
  toggle: (key) => {
    const next = toggleCollapsedKey(get().collapsed, key)
    write(next)
    set({ collapsed: next })
  },
  setAll: (targets, collapsed) => {
    const next = mergeCollapsedKeys(get().collapsed, targets, collapsed)
    write(next)
    set({ collapsed: next })
  },
}))
