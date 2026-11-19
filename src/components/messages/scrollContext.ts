import { createContext, useContext } from 'react'

/**
 * 消息列表的「滚到底部」能力。
 *
 * - `scrollToBottom`：**只在跟随状态开着时**才滚。Markdown 每次渲染完都调它，
 *   所以用户在往上翻的时候，新内容不会把他拽回底部。
 * - `jumpToBottom`：强制回到最新一条并**重新打开跟随**（用户点浮标时用）。
 * - `atBottom`：是否已经在底部；浮标据此决定显不显示。只在真假切换时更新，
 *   避免滚动时每帧触发重渲染。
 */
type ScrollToBottom = {
  scrollToBottom: () => void
  jumpToBottom: () => void
  atBottom: boolean
}

const noop = () => {}

export const ScrollToBottomContext = createContext<ScrollToBottom>({
  scrollToBottom: noop,
  jumpToBottom: noop,
  atBottom: true,
})

export const useScrollToBottom = () => useContext(ScrollToBottomContext)
