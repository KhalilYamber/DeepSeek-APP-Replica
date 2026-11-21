import { translate } from '../../i18n/index.js'
import { monthKey } from '../../utils/format.js'
import type { Group, SessionSummary } from './types.js'

const DAY = 86_400_000

const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0)

/** 按时间分组：今天 / 昨天 / 7 天内 / 30 天内 / 按月 */
export const groupSessionsByDate = (sessions: SessionSummary[], now: number, t = translate) => {
  const groups: { key: string; label: string; sessions: SessionSummary[] }[] = []
  for (const session of sessions) {
    const diff = Math.floor((now - startOfDay(session.updatedAt)) / DAY)
    const key =
      diff <= 0
        ? 'sessionHistoryTimelineLabelToday'
        : diff <= 1
          ? 'sessionHistoryTimelineLabelYesterday'
          : diff < 7
            ? 'sessionHistoryTimelineLabel7days'
            : diff < 30
              ? 'sessionHistoryTimelineLabel30days'
              : null
    const groupKey = key ?? monthKey(session.updatedAt) ?? ''
    const last = groups.at(-1)
    if (last?.key === groupKey) {
      last.sessions.push(session)
    } else {
      groups.push({ key: groupKey, label: key ? t(key) : groupKey, sessions: [session] })
    }
  }
  return groups
}

/** 未分类组的固定 key：没挂分组、或挂的分组已不存在，都落在这里 */
const UNCATEGORIZED_KEY = '__uncategorized__'

/** 一个分组，以及它内部的时间分组 */
export type SessionGroup = {
  /** 分组 id；未分类固定为 '__uncategorized__' */
  key: string
  /** 分组名；未分类用 t('groupUncategorized') */
  label: string
  /** 未分类为 null */
  groupId: string | null
  /** 该分组内的时间分组（今天 / 昨天 / 7 天内 / 30 天内 / 按月）；空分组为空数组 */
  groups: { key: string; label: string; sessions: SessionSummary[] }[]
}

/**
 * 分组：先按会话分组（createdAt 升序，未分类固定排在最后），再在每个分组内按时间分组。
 * 会话按传入顺序落组——与 groupSessionsByDate 一样，调用方给的应是 updatedAt 降序。
 * groupId 指向不存在的分组时归到未分类：导入的历史数据可能还带着已删掉的分组 id。
 */
export const groupSessionsByGroup = (
  sessions: SessionSummary[],
  groups: Group[],
  now: number,
  t = translate,
): SessionGroup[] => {
  const ordered = [...groups].sort((a, b) => a.createdAt - b.createdAt)
  const byGroup = new Map<string, SessionSummary[]>()
  for (const group of ordered) {
    byGroup.set(group.id, [])
  }
  const uncategorized: SessionSummary[] = []
  for (const session of sessions) {
    const bucket = session.groupId ? byGroup.get(session.groupId) : undefined
    if (bucket) {
      bucket.push(session)
    } else {
      uncategorized.push(session)
    }
  }
  const result: SessionGroup[] = ordered.map((group) => ({
    key: group.id,
    label: group.name,
    groupId: group.id,
    groups: groupSessionsByDate(byGroup.get(group.id) ?? [], now, t),
  }))
  result.push({
    key: UNCATEGORIZED_KEY,
    label: t('groupUncategorized'),
    groupId: null,
    groups: groupSessionsByDate(uncategorized, now, t),
  })
  return result
}
