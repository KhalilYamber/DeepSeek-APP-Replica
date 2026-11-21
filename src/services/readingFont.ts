import { create } from 'zustand'

export type ReadingLevel = 'small' | 'normal' | 'large' | 'xlarge'

/**
 * 档位到缩放系数。1 是当前的正文尺寸（16px），也是升级后的默认值——
 * 不改变老用户的观感；嫌大的人自己选「小」。
 */
export const READING_SCALES: Record<ReadingLevel, number> = {
  small: 0.875,
  normal: 1,
  large: 1.125,
  xlarge: 1.25,
}

export const READING_LEVELS: ReadingLevel[] = ['small', 'normal', 'large', 'xlarge']

const KEY = 'chat-demo:reading-scale'

/** 认不出来的值一律回标准档，坏数据不会把界面缩成 0 */
export const pickReadingLevel = (raw: string | null): ReadingLevel =>
  raw !== null && Object.hasOwn(READING_SCALES, raw) ? (raw as ReadingLevel) : 'normal'

const read = (): ReadingLevel => {
  try {
    return pickReadingLevel(localStorage.getItem(KEY))
  } catch {
    return 'normal'
  }
}

/** 写进根元素的内联样式：优先级高于样式表里的默认值 */
export const applyReadingLevel = (level: ReadingLevel) => {
  try {
    document.documentElement.style.setProperty('--app-reading-scale', String(READING_SCALES[level]))
  } catch {
    // 没有 document 的环境（测试）只做内存生效
  }
  try {
    localStorage.setItem(KEY, level)
  } catch {
    // 存储不可用时本次会话内仍然生效
  }
}

type ReadingStore = { level: ReadingLevel }

export const useReadingFont = create<ReadingStore>(() => ({ level: read() }))

export const setReadingLevel = (level: ReadingLevel) => {
  applyReadingLevel(level)
  useReadingFont.setState({ level })
}

/** 首屏渲染前同步一次，避免先按标准档画一帧再跳 */
export const initReadingFont = () => {
  applyReadingLevel(read())
}
