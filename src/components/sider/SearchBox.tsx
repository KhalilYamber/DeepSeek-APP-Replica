import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { IconCloseOutline16, IconSearchOutline16 } from '../base/icons.js'
import { searchSessions } from '../../services/chat/db.js'
import type { SearchHit } from '../../services/chat/search.js'
import { selectSession } from '../../services/chat/store.js'
import { closeMobileSider } from './mobileSiderState.js'
import styles from './Sider.module.css'

/** 输入停顿多久才真的去查：每次查询都要扫一遍本地库，按键不能直接触发。 */
const DEBOUNCE_MS = 200

export type SearchState = {
  hits: SearchHit[]
  pending: boolean
}

/**
 * 按当前输入去查历史对话。
 * 查询串为空时不查也不清空上一次结果——清空交给调用方决定，避免输入框抖一下结果就闪没。
 */
export const useSessionSearch = (query: string): SearchState => {
  const [state, setState] = useState<SearchState>({ hits: [], pending: false })
  useEffect(() => {
    const needle = query.trim()
    if (!needle) {
      setState({ hits: [], pending: false })
      return
    }
    let cancelled = false
    setState((prev) => ({ hits: prev.hits, pending: true }))
    const timer = setTimeout(() => {
      void searchSessions(needle)
        .then((hits) => {
          if (!cancelled) {
            setState({ hits, pending: false })
          }
        })
        .catch(() => {
          if (!cancelled) {
            setState({ hits: [], pending: false })
          }
        })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])
  return state
}

/** 侧栏顶部的搜索框：只出现在网页版（APK 里不渲染）。 */
export const SearchBox = ({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) => {
  const t = useTranslate()
  return (
    <div className={styles.search}>
      <span className={styles.searchIcon}>
        <IconSearchOutline16 />
      </span>
      <input
        className={styles.searchInput}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('searchChatsPlaceholder')}
        aria-label={t('searchChatsPlaceholder')}
        autoComplete="off"
        spellCheck={false}
      />
      {value ? (
        <button
          type="button"
          className={styles.searchClear}
          aria-label={t('searchChatsClear')}
          onClick={() => onChange('')}
        >
          <IconCloseOutline16 />
        </button>
      ) : null}
    </div>
  )
}

/** 搜索结果列表：一个会话一条，点开即切换到那个对话。 */
export const SearchResults = ({ state }: { state: SearchState }) => {
  const t = useTranslate()
  if (state.hits.length === 0) {
    return (
      <div className={styles.searchHint}>
        {state.pending ? t('searchChatsSearching') : t('searchChatsNoResult')}
      </div>
    )
  }
  return (
    <>
      {state.hits.map((hit) => (
        <button
          key={hit.sessionId}
          type="button"
          className={styles.searchResult}
          onClick={() => {
            selectSession(hit.sessionId)
            closeMobileSider()
          }}
        >
          <span className={styles.searchResultTitle}>{hit.title || t('untitledChat')}</span>
          {hit.snippet ? (
            <span className={styles.searchResultSnippet}>
              {hit.snippet.before}
              <mark className={styles.searchMatch}>{hit.snippet.match}</mark>
              {hit.snippet.after}
            </span>
          ) : null}
        </button>
      ))}
    </>
  )
}
