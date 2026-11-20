import { memo, useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useTranslate } from '../../i18n/index.js'
import { useSettings } from '../../services/settings.js'
import type { Session } from '../../services/chat/types.js'
import { verifyApiKey } from '../../services/api/client.js'
import {
  fetchBalance,
  formatMoney,
  pickBalance,
  type UserBalance,
} from '../../services/balance.js'
import {
  formatTokens,
  latestUsage,
  percentOf,
  usedTokens,
} from '../../services/contextUsage.js'
import {
  pickContextWindow,
  readCachedContextWindow,
  writeCachedContextWindow,
} from '../../services/contextWindow.js'
import { showToast } from '../base/toastState.js'
import styles from './UsageBar.module.css'

/** 余额 60 秒内不重复请求；点一下可以强制刷新 */
const BALANCE_INTERVAL = 60 * 1000
const RADIUS = 7
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** 标题栏下面那条状态栏：左余额、右上下文占用圆环 */
export const UsageBar = memo(function UsageBar({ session }: { session?: Session }) {
  const t = useTranslate()
  const apiKey = useSettings((state) => state.apiKey)
  const model = useSettings((state) => state.model)
  const [balance, setBalance] = useState<UserBalance | null>(null)
  const [loading, setLoading] = useState(false)
  const [limit, setLimit] = useState<number | null>(() => readCachedContextWindow(model))
  const lastFetch = useRef(0)

  const refreshBalance = useCallback(
    async (force = false) => {
      if (!apiKey) {
        setBalance(null)
        return
      }
      if (!force && Date.now() - lastFetch.current < BALANCE_INTERVAL) {
        return
      }
      setLoading(true)
      try {
        const next = await fetchBalance(apiKey)
        setBalance(next)
        lastFetch.current = Date.now()
      } catch {
        // 失败保留上一次的值；从没成功过就显示 --
      } finally {
        setLoading(false)
      }
    },
    [apiKey]
  )

  useEffect(() => {
    void refreshBalance()
  }, [refreshBalance])

  // 上下文上限不常变：先读缓存，没有才请一次 /models
  useEffect(() => {
    const cached = readCachedContextWindow(model)
    if (cached) {
      setLimit(cached)
      return
    }
    if (!apiKey) {
      setLimit(null)
      return
    }
    let cancelled = false
    verifyApiKey(apiKey)
      .then((models) => {
        const value = pickContextWindow(models.data, model)
        if (value !== null && !cancelled) {
          setLimit(value)
          writeCachedContextWindow(model, value)
        }
      })
      .catch(() => {
        // 拿不到上限就只显示已用 token
      })
    return () => {
      cancelled = true
    }
  }, [apiKey, model])

  const usage = latestUsage(session)
  const used = usage ? usedTokens(usage) : 0
  const percent = usage && limit ? percentOf(used, limit) : null
  const info = pickBalance(balance)
  const low = balance !== null && !balance.is_available

  const balanceText = !apiKey ? '--' : loading ? '…' : info ? formatMoney(info) : '--'
  const percentText = percent === null ? '--' : `${percent}%`
  const tone = percent !== null && percent > 80 ? styles.danger : percent !== null && percent >= 50 ? styles.warn : undefined

  const onBalanceClick = () => {
    if (!apiKey) {
      showToast({ key: 'usageSetKeyFirst' })
      return
    }
    void refreshBalance(true)
  }

  const onRingClick = () => {
    if (!apiKey) {
      showToast({ key: 'usageSetKeyFirst' })
      return
    }
    if (percent === null || !limit) {
      showToast({ key: 'usageContextEmpty' })
      return
    }
    showToast({
      key: 'usageContextTip',
      params: { percent, used: formatTokens(used), limit: formatTokens(limit) },
    })
  }

  return (
    <div className={styles.bar}>
      <button type="button" className={styles.item} onClick={onBalanceClick}>
        <span className={clsx(styles.balance, low && styles.danger)} title={low ? t('usageBalanceLow') : undefined}>
          {balanceText}
        </span>
      </button>
      <button type="button" className={styles.item} onClick={onRingClick}>
        <svg className={styles.ring} viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <circle
            cx="10"
            cy="10"
            r={RADIUS}
            fill="none"
            stroke="var(--dsw-alias-bg-skeleton)"
            strokeWidth="2.5"
          />
          {percent === null ? null : (
            <circle
              cx="10"
              cy="10"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={`${(percent / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              transform="rotate(-90 10 10)"
            />
          )}
        </svg>
        <span className={clsx(styles.percent, tone)}>{percentText}</span>
      </button>
    </div>
  )
})
