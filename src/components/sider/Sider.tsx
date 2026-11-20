import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconEditOutline16,
  IconEllipsisOutline16,
  IconFolderOutline16,
  IconPanelLeftOutline16,
  IconSettingsOutline16,
  IconTrashOutline16,
  NewChatIcon,
} from '../base/icons.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { groupSessionsByFolder } from '../../services/chat/sessionGroups.js'
import {
  createFolder,
  deleteFolder,
  moveSessionToFolder,
  newChat,
  removeSession,
  renameFolder,
  useChatStore,
} from '../../services/chat/store.js'
import type { Folder, SessionSummary } from '../../services/chat/types.js'
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

/** 展开的侧边栏：名称与收起按钮、开启新对话、搜索、分类文件夹、按时间分组的会话、底部设置；移动端放在抽屉里 */
export const Sider = ({ mobile = false }: { mobile?: boolean }) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const folders = useChatStore((state) => state.folders)
  const activeId = useChatStore((state) => state.activeId)
  const [now, setNow] = useState(Date.now)
  const groups = useMemo(
    () => groupSessionsByFolder(sessions, folders, now, t),
    [sessions, folders, now, t]
  )
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [deleting, setDeleting] = useState<SessionSummary | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [folderEditor, setFolderEditor] = useState<{ id: string | null; name: string } | null>(null)
  const [folderPending, setFolderPending] = useState(false)
  const [removingFolder, setRemovingFolder] = useState<{
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

  const toggleFolder = (key: string) =>
    setCollapsed((current) => ({ ...current, [key]: current[key] !== true }))

  const openFolderEditor = (folder: Folder | null) =>
    setFolderEditor({ id: folder?.id ?? null, name: folder?.name ?? '' })

  const submitFolder = async () => {
    const name = folderEditor?.name.trim()
    if (!folderEditor || !name || folderPending) {
      return
    }
    setFolderPending(true)
    try {
      if (folderEditor.id) {
        renameFolder(folderEditor.id, name)
      } else {
        createFolder(name)
      }
      setFolderEditor(null)
    } finally {
      setFolderPending(false)
    }
  }

  const confirmDeleteFolder = async (withSessions: boolean) => {
    if (!removingFolder || folderPending) {
      return
    }
    setFolderPending(true)
    try {
      await deleteFolder(removingFolder.id, withSessions)
      setRemovingFolder(null)
    } finally {
      setFolderPending(false)
    }
  }

  const moveTo = (folderId: string | null, name: string) => {
    if (!moving) {
      return
    }
    moveSessionToFolder(moving.id, folderId)
    setMoving(null)
    showToast({ key: 'folderMoved', params: { name } })
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
      <button type="button" className={styles.newFolder} onClick={() => openFolderEditor(null)}>
        <IconFolderOutline16 />
        <span>{t('folderNew')}</span>
      </button>
      <div className={styles.listWrap}>
        <div className={styles.list}>
          {searching ? (
            <SearchResults state={search} />
          ) : (
            groups.map((folderGroup) => {
              const isCollapsed = collapsed[folderGroup.key] === true
              const count = folderGroup.groups.reduce(
                (total, group) => total + group.sessions.length,
                0
              )
              return (
                <div key={folderGroup.key} className={styles.folderSection}>
                  <div className={styles.folderHeader}>
                    <button
                      type="button"
                      className={styles.folderToggle}
                      aria-expanded={!isCollapsed}
                      onClick={() => toggleFolder(folderGroup.key)}
                    >
                      {isCollapsed ? <IconChevronRightOutline14 /> : <IconChevronDownOutline14 />}
                      <span className={styles.folderName}>{folderGroup.label}</span>
                      {count > 0 ? <span className={styles.folderCount}>{count}</span> : null}
                    </button>
                    {folderGroup.folderId ? (
                      <Menu
                        options={[
                          {
                            key: 'rename',
                            label: t('folderMenuRename'),
                            icon: <IconEditOutline16 />,
                            onSelect: () =>
                              openFolderEditor({
                                id: folderGroup.folderId as string,
                                name: folderGroup.label,
                                createdAt: 0,
                              }),
                          },
                          {
                            key: 'delete',
                            label: t('folderMenuDelete'),
                            icon: <IconTrashOutline16 />,
                            danger: true,
                            onSelect: () =>
                              setRemovingFolder({
                                id: folderGroup.folderId as string,
                                name: folderGroup.label,
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
                  {isCollapsed ? null : folderGroup.groups.length === 0 ? (
                    <div className={styles.folderEmpty}>{t('folderEmpty')}</div>
                  ) : (
                    folderGroup.groups.map((section) => (
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
      {folderEditor ? (
        <Modal
          title={folderEditor.id ? t('folderMenuRename') : t('folderNew')}
          onClose={() => {
            if (!folderPending) {
              setFolderEditor(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={folderPending} onClick={() => setFolderEditor(null)}>
                {t('cancel')}
              </Button>
              <Button
                disabled={folderPending || !folderEditor.name.trim()}
                onClick={() => void submitFolder()}
              >
                {folderEditor.id ? t('confirm') : t('folderCreate')}
              </Button>
            </>
          }
        >
          <input
            className={styles.folderInput}
            value={folderEditor.name}
            placeholder={t('folderNamePlaceholder')}
            autoFocus
            onChange={(event) =>
              setFolderEditor((current) =>
                current ? { ...current, name: event.target.value } : current
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                void submitFolder()
              }
            }}
          />
        </Modal>
      ) : null}
      {removingFolder ? (
        <Modal
          title={t('folderDeleteTitle', { name: removingFolder.name })}
          closable
          onClose={() => {
            if (!folderPending) {
              setRemovingFolder(null)
            }
          }}
          footer={
            <>
              <Button
                variant="outlined"
                disabled={folderPending}
                onClick={() => void confirmDeleteFolder(false)}
              >
                {t('folderDeleteOnlyFolder')}
              </Button>
              <Button
                variant="danger"
                disabled={folderPending}
                onClick={() => void confirmDeleteFolder(true)}
              >
                {t('folderDeleteWithSessions')}
              </Button>
            </>
          }
        >
          <div className={styles.folderDialogText}>
            {t('folderDeleteOnlyDescription', { count: removingFolder.count })}
          </div>
          <div className={styles.folderDialogText}>
            {t('folderDeleteWithSessionsDescription', { count: removingFolder.count })}
          </div>
        </Modal>
      ) : null}
      {moving ? (
        <Modal title={t('folderMoveTo')} closable onClose={() => setMoving(null)}>
          <div className={styles.folderPickList}>
            <button
              type="button"
              className={styles.folderPickItem}
              onClick={() => moveTo(null, t('folderUncategorized'))}
            >
              <IconFolderOutline16 />
              <span>{t('folderUncategorized')}</span>
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={styles.folderPickItem}
                onClick={() => moveTo(folder.id, folder.name)}
              >
                <IconFolderOutline16 />
                <span>{folder.name}</span>
              </button>
            ))}
            <button
              type="button"
              className={styles.folderPickItem}
              onClick={() => {
                setMoving(null)
                openFolderEditor(null)
              }}
            >
              <span className={styles.folderPickPlus}>+</span>
              <span>{t('folderNew')}</span>
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
