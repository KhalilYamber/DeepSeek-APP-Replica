/** DeepSeek 官方余额接口；允许浏览器跨域，网页版与 APK 都能直接请求 */
export const BALANCE_URL = 'https://api.deepseek.com/user/balance'

/** 余额请求的超时：网络不通时 8 秒后放弃，加载态才能收敛到 `--` */
const BALANCE_TIMEOUT_MS = 8000

export type BalanceInfo = {
  currency: string
  total_balance: string
  granted_balance?: string
  topped_up_balance?: string
}

export type UserBalance = {
  is_available: boolean
  balance_infos: BalanceInfo[]
}

/** 优先人民币，没有就取第一条；空数组返回 null */
export const pickBalance = (balance: UserBalance | null): BalanceInfo | null => {
  if (!balance || !Array.isArray(balance.balance_infos) || balance.balance_infos.length === 0) {
    return null
  }
  return balance.balance_infos.find((info) => info.currency === 'CNY') ?? balance.balance_infos[0]
}

/** `¥12.34` / `$12.34`；接口给的是字符串，转不动就原样带上符号 */
export const formatMoney = (info: BalanceInfo): string => {
  const symbol = info.currency === 'CNY' ? '¥' : info.currency === 'USD' ? '$' : ''
  const value = Number(info.total_balance)
  return Number.isFinite(value) ? `${symbol}${value.toFixed(2)}` : `${symbol}${info.total_balance}`
}

export const fetchBalance = async (apiKey: string, signal?: AbortSignal): Promise<UserBalance> => {
  // 裸 fetch 没有超时：网络卡住时余额会永远停在“…”。8 秒后主动中止。
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BALANCE_TIMEOUT_MS)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort)
  try {
    const response = await fetch(BALANCE_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`balance ${response.status}`)
    }
    // 计时器留到 body 读完再清：只包住响应头的话，json() 挂起时没有保护
    return (await response.json()) as UserBalance
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}
