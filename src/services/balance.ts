/** DeepSeek 官方余额接口；允许浏览器跨域，网页版与 APK 都能直接请求 */
export const BALANCE_URL = 'https://api.deepseek.com/user/balance'

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
  const response = await fetch(BALANCE_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  })
  if (!response.ok) {
    throw new Error(`balance ${response.status}`)
  }
  return (await response.json()) as UserBalance
}
