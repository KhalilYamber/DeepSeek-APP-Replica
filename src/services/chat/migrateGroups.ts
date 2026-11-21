import { logDiagnostic } from '../diagnostics.js'
import { openMigrationDB } from './db.js'
import type { Group } from './types.js'

/**
 * 12 版 → 13 版的分组迁移：把遗留的 folders 表搬进 groups，并把会话上的 folderId 改写成 groupId。
 *
 * 不写进 db.ts 的 upgrade：那里抛错会让整个数据库打不开、App 卡在启动失败页。
 * 这里失败只留一条诊断日志，标记不写，下次启动重试；数据本身要么整段搬完，要么一条没动。
 */

/** 12 版遗留的存储名；13 版起正式结构里不再有它，只有本模块读写 */
const LEGACY_STORE = 'folders'
/** 12 版遗留的字段名 */
const LEGACY_FIELD = 'folderId'
/** 迁移完成标记；写上了就不再进迁移 */
const MIGRATION_KEY = 'chat-demo:groups-migrated-13'

/** 12 版记录的遗留字段 */
type LegacyGroupField = { folderId?: string | null }

/**
 * 三个起点共用同一条判断：标记写过就不再进；没写过时只看 12 版的 folders 表在不在。
 * 全新安装与 11 版都没有这张表——搬不到东西，写个标记退出即可。
 */
export const needsGroupsMigration = (flagged: boolean, hasLegacyStore: boolean): boolean =>
  !flagged && hasLegacyStore

/**
 * 把记录的 folderId 改写成 groupId：值不变（null 仍是未分类），旧字段删掉。
 * 没有 folderId 的记录原样返回同一个引用，调用方据此跳过写入——11 版数据不会被凭空塞进 groupId。
 */
export const adoptGroupId = <T extends LegacyGroupField>(record: T) => {
  if (!Object.hasOwn(record, LEGACY_FIELD)) {
    return record
  }
  const { folderId, ...rest } = record
  return { ...rest, groupId: folderId }
}

/** 12 版的 folders 记录原样成为 13 版的 groups：两版结构相同，只取原始的三个字段 */
export const toGroupRecord = (record: Group): Group => ({
  id: record.id,
  name: record.name,
  createdAt: record.createdAt,
})

const isFlagged = (): boolean => {
  try {
    return localStorage.getItem(MIGRATION_KEY) !== null
  } catch {
    // 读不到标记就当作没迁移过：真迁过也不会出错，对象是同一批数据
    return false
  }
}

const writeFlag = () => {
  try {
    localStorage.setItem(MIGRATION_KEY, '1')
  } catch {
    // 写不进去就下次启动再跑一遍；迁移是幂等的
  }
}

/** 搬迁一整段放在一个事务里：中途出错整体回滚，不会留下搬了一半的库 */
const moveGroups = async (): Promise<void> => {
  const db = await openMigrationDB()
  const tx = db.transaction([LEGACY_STORE, 'groups', 'sessions', 'sessionSummaries'], 'readwrite')
  const groups = tx.objectStore('groups')
  const legacy = tx.objectStore(LEGACY_STORE)
  // 逐条游标搬：会话对象带着全部消息，一次读进内存可能是几十 MB
  for (let cursor = await legacy.openCursor(); cursor; cursor = await cursor.continue()) {
    await groups.put(toGroupRecord(cursor.value as Group))
  }
  for (const name of ['sessions', 'sessionSummaries'] as const) {
    const store = tx.objectStore(name)
    for (let cursor = await store.openCursor(); cursor; cursor = await cursor.continue()) {
      const next = adoptGroupId(cursor.value)
      if (next !== cursor.value) {
        await cursor.update(next)
      }
    }
  }
  // 搬完就清空：标记若因清缓存丢失，下次重跑也不会把用户删掉的分组复活
  await tx.objectStore(LEGACY_STORE).clear()
  await tx.done
}

export const migrateGroupsIfNeeded = async (): Promise<void> => {
  const flagged = isFlagged()
  if (flagged) {
    return
  }
  try {
    const db = await openMigrationDB()
    if (!needsGroupsMigration(flagged, db.objectStoreNames.contains(LEGACY_STORE))) {
      writeFlag()
      return
    }
    await moveGroups()
    writeFlag()
  } catch (error) {
    // 迁移失败不抛给界面：不写标记，下次启动重试
    logDiagnostic('migration', error instanceof Error ? error.message : String(error))
  }
}
