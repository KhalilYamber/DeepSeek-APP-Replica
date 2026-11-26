/**
 * 输入法拼字期间的回车不能当成「发送」或「确认」。
 *
 * 为什么不能只信 `KeyboardEvent.isComposing`：
 * 1. 部分安卓输入法把输入法按键报成 `keyCode === 229`，同时 `isComposing` 仍是假；
 * 2. WebKit 系可能在 keydown 之前就派发 `compositionend`，等按键处理时 `isComposing` 已经复位。
 *
 * 所以另外记一个「本轮刚结束」的标记，用 `setTimeout(task, 0)` 在下一轮事件里清掉。
 * 不用毫秒窗口：窗口会把「确认候选之后立刻再按一次」的那一下也吞掉，用户会觉得回车失灵。
 */

export type ImeKeySignal = {
  /** 浏览器报的组字状态 */
  isComposing: boolean
  /** 部分安卓输入法把输入法按键报成 229 */
  keyCode: number
  /** 组字进行中，或组字刚在同一轮事件里结束 */
  composingRecently: boolean
}

export const isImeSettling = (signal: ImeKeySignal) =>
  signal.isComposing || signal.keyCode === 229 || signal.composingRecently

export type CompositionTracker = {
  start: () => void
  end: () => void
  isSettling: () => boolean
}

/** schedule 只负责把「刚结束」的标记挪到下一轮；测试里注入同步调度即可 */
export const createCompositionTracker = (
  schedule: (task: () => void) => void = (task) => void setTimeout(task, 0)
): CompositionTracker => {
  let composing = false
  let endedInThisTurn = false
  return {
    start: () => {
      composing = true
      endedInThisTurn = false
    },
    end: () => {
      composing = false
      endedInThisTurn = true
      schedule(() => {
        endedInThisTurn = false
      })
    },
    isSettling: () => composing || endedInThisTurn,
  }
}
