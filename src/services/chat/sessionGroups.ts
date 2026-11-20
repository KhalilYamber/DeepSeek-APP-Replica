import { translate } from '../../i18n/index.js'
import { monthKey } from '../../utils/format.js'
import type { Folder, SessionSummary } from './types.js'

const DAY = 86_400_000

const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0)

/** 分组：今天 / 昨天 / 7 天内 / 30 天内 / 按月 */
export const groupSessions = (sessions: SessionSummary[], now: number, t = translate) => {
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

/** 未分类组的固定 key：没挂文件夹、或挂的文件夹已不存在，都落在这里 */
const UNCATEGORIZED_KEY = '__uncategorized__'

/** 一个文件夹，以及它内部的时间分组 */
export type FolderGroup = {
  /** 文件夹 id；未分类固定为 '__uncategorized__' */
  key: string
  /** 文件夹名；未分类用 t('folderUncategorized') */
  label: string
  /** 未分类为 null */
  folderId: string | null
  /** 该文件夹内的时间分组（今天 / 昨天 / 7 天内 / 30 天内 / 按月）；空文件夹为空数组 */
  groups: { key: string; label: string; sessions: SessionSummary[] }[]
}

/**
 * 分组：先按文件夹（createdAt 升序，未分类固定排在最后），再在每个文件夹内按时间分组。
 * 会话按传入顺序落组——与 groupSessions 一样，调用方给的应是 updatedAt 降序。
 * folderId 指向不存在的文件夹时归到未分类：导入的历史数据可能还带着已删掉的文件夹 id。
 */
export const groupSessionsByFolder = (
  sessions: SessionSummary[],
  folders: Folder[],
  now: number,
  t = translate,
): FolderGroup[] => {
  const ordered = [...folders].sort((a, b) => a.createdAt - b.createdAt)
  const byFolder = new Map<string, SessionSummary[]>()
  for (const folder of ordered) {
    byFolder.set(folder.id, [])
  }
  const uncategorized: SessionSummary[] = []
  for (const session of sessions) {
    const bucket = session.folderId ? byFolder.get(session.folderId) : undefined
    if (bucket) {
      bucket.push(session)
    } else {
      uncategorized.push(session)
    }
  }
  const groups: FolderGroup[] = ordered.map((folder) => ({
    key: folder.id,
    label: folder.name,
    folderId: folder.id,
    groups: groupSessions(byFolder.get(folder.id) ?? [], now, t),
  }))
  groups.push({
    key: UNCATEGORIZED_KEY,
    label: t('folderUncategorized'),
    folderId: null,
    groups: groupSessions(uncategorized, now, t),
  })
  return groups
}
