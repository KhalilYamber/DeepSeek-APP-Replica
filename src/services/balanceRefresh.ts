type BalanceRefreshListener = () => void

let listener: BalanceRefreshListener | null = null

/**
 * 余额只在扣费之后才变，所以「答完一条」是最该刷新的时刻。
 * 与 onRequestRetry 同一套单监听器写法：返回退订函数，避免组件卸载后还被调用。
 */
export const onBalanceRefresh = (next: BalanceRefreshListener): (() => void) => {
  listener = next
  return () => {
    if (listener === next) {
      listener = null
    }
  }
}

export const requestBalanceRefresh = () => {
  listener?.()
}
