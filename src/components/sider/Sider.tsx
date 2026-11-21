import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconEditOutline16,
  IconEllipsisOutline16,
  IconGroupOutline16,
  IconPanelLeftOutline16,
  IconSettingsOutline16,
  IconTrashOutline16,
  NewChatIcon,
} from '../base/icons.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { groupSessionsByGroup } from '../../services/chat/sessionGroups.js'
import {
  createGroup,
  deleteGroup,
  moveSessionToGroup,
  newChat,
  newChatInGroup,
  removeSession,
  renameGroup,
  useChatStore,
} from '../../services/chat/store.js'
import { useGroupCollapsed } from '../../services/groupCollapsed.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Menu } from '../base/Menu.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { closeMobileSider, useMobileSider } from './mobileSiderState.js'
import { SearchBox, SearchResults, useSessionSearch } from './SearchBox.js'
import { SessionItem } from './SessionItem.js'
import styles from './Sider.module.css'

/** 展开的侧边栏：名称与收起按钮、开启新对话、搜索、会话分组、按时间分组的会话、底部设置；移动端放在抽屉里 */
export const Sider = ({ mobile = false }: { mobile?: boolean }) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const groups = useChatStore((state) => state.groups)
  const activeId = useChatStore((state) => state.activeId)
  const [now, setNow] = useState(Date.now)
  const sessionGroups = useMemo(
    () => groupSessionsByGroup(sessions, groups, now, t),
    [sessions, groups, now, t]
  )
  const collapsedKeys = useGroupCollapsed((state) => state.collapsed)
  const toggleGroupCollapsed = useGroupCollapsed((state) => state.toggle)
  const setAllGroupsCollapsed = useGroupCollapsed((state) => state.setAll)
  const [deleting, setDeleting] = useState<SessionSummary | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [groupEditor, setGroupEditor] = useState<{ id: string | null; name: string } | null>(null)
  const [groupPending, setGroupPending] = useState(false)
  const [removingGroup, setRemovingGroup] = useState<{
    id: string
    name: string
    count: number
  } | null>(null)
  const [moving, setMoving] = useState<SessionSummary | null>(null)
  // 历史搜索：网页版与 APK 都渲染。APK 侧原先被 isNativeApp() 挡掉（2026-11-18 按「只给网页版」
  // 做的），2026-11-19 按需求在 APK 里打开；同一份源码两个形态，不维护第二套构建产物。
  const [query, setQuery] = useState('')
  const search = useSessionSearch(query)
  const searching = query.trim().length > 0

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const time = Date.now()
      setNow(time)
      const midnight = new Date(time).setHours(24, 0, 0, 0)
      timer = setTimeout(refresh, midnight - time)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const toggleGroup = (key: string) => toggleGroupCollapsed(key)

  const groupKeys = sessionGroups.map((item) => item.key)
  const allCollapsed =
    groupKeys.length > 0 && groupKeys.every((key) => collapsedKeys.includes(key))
  const toggleAllGroups = () => setAllGroupsCollapsed(groupKeys, !allCollapsed)

  const startChatInGroup = (groupId: string | null, label: string) => {
    newChatInGroup(groupId)
    if (mobile) {
      closeMobileSider()
    }
    showToast({ key: 'groupNewChatHint', params: { group: label } })
  }

  const openGroupEditor = (group: { id: string; name: string } | null) =>
    setGroupEditor({ id: group?.id ?? null, name: group?.name ?? '' })

  const submitGroup = async () => {
    const name = groupEditor?.name.trim()
    if (!groupEditor || !name || groupPending) {
      return
    }
    setGroupPending(true)
    try {
      if (groupEditor.id) {
        renameGroup(groupEditor.id, name)
      } else {
        createGroup(name)
      }
      setGroupEditor(null)
    } finally {
      setGroupPending(false)
    }
  }

  const confirmDeleteGroup = async (withSessions: boolean) => {
    if (!removingGroup || groupPending) {
      return
    }
    setGroupPending(true)
    try {
      await deleteGroup(removingGroup.id, withSessions)
      setRemovingGroup(null)
    } finally {
      setGroupPending(false)
    }
  }

  const moveTo = (groupId: string | null, name: string) => {
    if (!moving) {
      return
    }
    moveSessionToGroup(moving.id, groupId)
    setMoving(null)
    showToast({ key: 'groupMoved', params: { name } })
  }

  return (
    <div className={clsx(styles.sider, mobile && styles.mobile)}>
      <div className={styles.top}>
        <div className={styles.appName}>{t('appName')}</div>
        <IconButton
          size="m"
          icon={<IconPanelLeftOutline16 />}
          tooltip={t('collapseSiderbarButton')}
          tooltipPlacement="bottom"
          onClick={() => (mobile ? closeMobileSider() : setSiderCollapsed(true))}
        />
      </div>
      <button
        type="button"
        className={styles.newChat}
        onClick={() => {
          newChat()
          closeMobileSider()
        }}
      >
        <span className={styles.newChatIcon}>
          <NewChatIcon />
        </span>
        {t('newChat')}
      </button>
      <SearchBox value={query} onChange={setQuery} />
      <div className={styles.groupTools}>
        <button type="button" className={styles.newGroup} onClick={() => openGroupEditor(null)}>
          <IconGroupOutline16 />
          <span>{t('groupNew')}</span>
        </button>
        <IconButton
          icon={allCollapsed ? <IconChevronDownOutline14 /> : <IconChevronRightOutline14 />}
          aria-label={allCollapsed ? t('groupExpandAll') : t('groupCollapseAll')}
          tooltip={allCollapsed ? t('groupExpandAll') : t('groupCollapseAll')}
          onClick={toggleAllGroups}
        />
      </div>
      <div className={styles.listWrap}>
        <div className={styles.list}>
          {searching ? (
            <SearchResults state={search} />
          ) : (
            sessionGroups.map((sessionGroup) => {
              const isCollapsed = collapsedKeys.includes(sessionGroup.key)
              const count = sessionGroup.groups.reduce(
                (total, group) => total + group.sessions.length,
                0
              )
              return (
                <div key={sessionGroup.key} className={styles.groupSection}>
                  <div className={styles.groupHeader}>
                    <button
                      type="button"
                      className={styles.groupToggle}
                      aria-expanded={!isCollapsed}
                      onClick={() => toggleGroup(sessionGroup.key)}
                    >
                      {isCollapsed ? <IconChevronRightOutline14 /> : <IconChevronDownOutline14 />}
                      <span className={styles.groupName}>{sessionGroup.label}</span>
                      {count > 0 ? <span className={styles.groupCount}>{count}</span> : null}
                    </button>
                    <IconButton
                      icon={<span className={styles.groupAddGlyph}>+</span>}
                      aria-label={t('groupNewChat')}
                      tooltip={t('groupNewChat')}
                      onClick={() => startChatInGroup(sessionGroup.groupId, sessionGroup.label)}
                    />
                    {sessionGroup.groupId ? (
                      <Menu
                        options={[
                          {
                            key: 'rename',
                            label: t('groupMenuRename'),
                            icon: <IconEditOutline16 />,
                            onSelect: () =>
                              openGroupEditor({
                                id: sessionGroup.groupId as string,
                                name: sessionGroup.label,
                              }),
                          },
                          {
                            key: 'delete',
                            label: t('groupMenuDelete'),
                            icon: <IconTrashOutline16 />,
                            danger: true,
                            onSelect: () =>
                              setRemovingGroup({
                                id: sessionGroup.groupId as string,
                                name: sessionGroup.label,
                                count,
                              }),
                          },
                        ]}
                      >
                        {({ toggle }) => (
                          <IconButton
                            icon={<IconEllipsisOutline16 />}
                            aria-label={t('more')}
                            onClick={toggle}
                          />
                        )}
                      </Menu>
                    ) : null}
                  </div>
                  {isCollapsed ? null : sessionGroup.groups.length === 0 ? (
                    <div className={styles.groupEmpty}>{t('groupEmpty')}</div>
                  ) : (
                    sessionGroup.groups.map((section) => (
                      <div key={section.key} className={styles.section}>
                        <div className={styles.sectionHeader}>{section.label}</div>
                        {section.sessions.map((session) => (
                          <SessionItem
                            key={session.id}
                            session={session}
                            active={session.id === activeId}
                            onDelete={() => setDeleting(session)}
                            onMove={() => setMoving(session)}
                          />
                        ))}
                      </div>
                    ))
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
      <div className={styles.bottom}>
        <button type="button" className={styles.settings} onClick={() => openSettings('general')}>
          <span className={styles.settingsIcon}>
            <IconSettingsOutline16 />
          </span>
          <span className={styles.settingsLabel}>{t('settings')}</span>
        </button>
      </div>
      {deleting ? (
        <Modal
          title={t('deleteSessionModalContentTitle')}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={deletePending} onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={async () => {
                  setDeletePending(true)
                  try {
                    if (await removeSession(deleting.id)) {
                      setDeleting(null)
                    } else {
                      showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    }
                  } finally {
                    setDeletePending(false)
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('deleteSessionWithFilesDescription')}
        </Modal>
      ) : null}
      {groupEditor ? (
        <Modal
          title={groupEditor.id ? t('groupMenuRename') : t('groupNew')}
          onClose={() => {
            if (!groupPending) {
              setGroupEditor(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={groupPending} onClick={() => setGroupEditor(null)}>
                {t('cancel')}
              </Button>
              <Button
                disabled={groupPending || !groupEditor.name.trim()}
                onClick={() => void submitGroup()}
              >
                {groupEditor.id ? t('confirm') : t('groupCreate')}
              </Button>
            </>
          }
        >
          <input
            className={styles.groupInput}
            value={groupEditor.name}
            placeholder={t('groupNamePlaceholder')}
            autoFocus
            onChange={(event) =>
              setGroupEditor((current) =>
                current ? { ...current, name: event.target.value } : current
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                void submitGroup()
              }
            }}
          />
        </Modal>
      ) : null}
      {removingGroup ? (
        <Modal
          title={t('groupDeleteTitle', { name: removingGroup.name })}
          closable
          onClose={() => {
            if (!groupPending) {
              setRemovingGroup(null)
            }
          }}
          footer={
            <>
              <Button
                variant="outlined"
                disabled={groupPending}
                onClick={() => void confirmDeleteGroup(false)}
              >
                {t('groupDeleteOnly')}
              </Button>
              <Button
                variant="danger"
                disabled={groupPending}
                onClick={() => void confirmDeleteGroup(true)}
              >
                {t('groupDeleteWithSessions')}
              </Button>
            </>
          }
        >
          <div className={styles.groupDialogText}>
            {t('groupDeleteOnlyDescription', { count: removingGroup.count })}
          </div>
          <div className={styles.groupDialogText}>
            {t('groupDeleteWithSessionsDescription', { count: removingGroup.count })}
          </div>
        </Modal>
      ) : null}
      {moving ? (
        <Modal title={t('groupMoveTo')} closable onClose={() => setMoving(null)}>
          <div className={styles.groupPickList}>
            <button
              type="button"
              className={styles.groupPickItem}
              onClick={() => moveTo(null, t('groupUncategorized'))}
            >
              <IconGroupOutline16 />
              <span>{t('groupUncategorized')}</span>
            </button>
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={styles.groupPickItem}
                onClick={() => moveTo(group.id, group.name)}
              >
                <IconGroupOutline16 />
                <span>{group.name}</span>
              </button>
            ))}
            <button
              type="button"
              className={styles.groupPickItem}
              onClick={() => {
                setMoving(null)
                openGroupEditor(null)
              }}
            >
              <span className={styles.groupPickPlus}>+</span>
              <span>{t('groupNew')}</span>
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

/** 移动端抽屉：浮在页面上方，点空白区域关闭。 */
export const MobileSider = () => {
  const open = useMobileSider((state) => state.open)
  if (!open) {
    return null
  }
  return (
    <>
      <div className={styles.drawerMask} onClick={closeMobileSider} />
      <div className={styles.drawer}>
        <Sider mobile />
      </div>
    </>
  )
}
