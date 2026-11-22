import clsx from 'clsx'
import { useRef, useState, type ReactNode } from 'react'
import {
  IconDarkOutline16,
  IconDataOutline16,
  IconDownloadOutline16,
  IconFollowsystemOutline16,
  IconLightOutline16,
  IconSettingsOutline16,
  IconThinkOutline16,
  IconUploadOutline14,
} from '../base/icons.js'
import {
  BackupError,
  clearHistory,
  exportHistory,
  importHistory,
  type ImportMode,
} from '../../services/chat/backup.js'
import { importMessage } from '../../services/chat/history/result.js'
import { AVATAR_SIZE, setAvatar, useAvatars, type AvatarRole } from '../../services/avatar.js'
import {
  READING_LEVELS,
  setReadingLevel,
  useReadingFont,
  type ReadingLevel,
} from '../../services/readingFont.js'
import {
  MAX_BUBBLE_ALPHA,
  MIN_BUBBLE_ALPHA,
  setBackgroundDim,
  setBubbleAlpha,
  setChatBackground,
  useChatBackground,
} from '../../services/chatBackground.js'
import { ImageCropper } from './ImageCropper.js'
import { appVersion, clearDiagnostics, collectDiagnostics } from '../../services/diagnostics.js'
import { isNativeApp, saveBlobOnNative } from '../../services/native/platform.js'
import { useIsMobile } from '../../app/viewport.js'
import { useChatStore } from '../../services/chat/store.js'
import { openMobileSider } from '../sider/mobileSiderState.js'
import { regionCodes, getRegionName, provinces } from '../../services/location.js'
import {
  isChineseBrowser,
  setLocale,
  setLocation,
  setThemePreference,
  setThinkingEnd,
  setTtsVoice,
  useSettings,
  type ThemePreference,
} from '../../services/settings.js'
import { useTranslate, type TranslationKey, type TranslationMessage } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { DisclaimerDialog } from '../disclaimer/DisclaimerDialog.js'
import { Modal } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import { ApiKeyConfirm, ApiKeyField, useApiKeyEditor } from './ApiKeyField.js'
import { closeSettings, useSettingsDialog, type SettingsSection } from './settingsDialogState.js'
import styles from './Settings.module.css'

/**
 * 设置弹窗：分「通用设置」（主题、语言、朗读音色、位置）与「数据管理」（API Key、导入、导出、删除）。
 * 桌面端为居中弹窗、左侧导航；移动端为底部弹层、导航横排在内容上方
 */
export const SettingsDialog = () => {
  const open = useSettingsDialog((state) => state.open)
  return open ? <SettingsContent /> : null
}

const sections: { value: SettingsSection; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'general',
    label: 'settingDialogAsideGeneralOptionLabel',
    icon: <IconSettingsOutline16 />,
  },
  {
    value: 'personalize',
    label: 'settingDialogAsidePersonalizeOptionLabel',
    icon: <IconThinkOutline16 />,
  },
  { value: 'data', label: 'settingDialogAsideDataOptionLabel', icon: <IconDataOutline16 /> },
]

const SettingsContent = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  // 打开时按调用方指定的分组选中，之后在弹窗内切换
  const [section, setSection] = useState(() => useSettingsDialog.getState().section)
  // 切换分组不丢失正在输入的 API Key 与导入状态
  const apiKeyEditor = useApiKeyEditor()
  const historyImport = useHistoryImport()
  const historyDelete = useHistoryDelete()
  const replacingHistory = useChatStore((state) => state.importingHistory)
  const historyBusy = historyImport.busy || historyDelete.busy || replacingHistory
  return (
    <>
      <Modal
        title={t('settings')}
        closable
        className={styles.dialog}
        mainClassName={styles.dialogMain}
        onClose={() => {
          if (!historyDelete.busy) {
            closeSettings()
          }
        }}
      >
        <div role="tablist" className={styles.navigation}>
          {sections.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={section === item.value}
              className={clsx(styles.navItem, section === item.value && styles.navItemActive)}
              onClick={() => setSection(item.value)}
            >
              {item.icon}
              {t(item.label)}
            </button>
          ))}
        </div>
        <div role="tabpanel" className={styles.content}>
          {section === 'general' ? (
            <>
              <ThemeSetting />
              <LocaleSetting />
              <LocationSetting />
              {/* 只在 APK 里出现：网页版刷新就是最新，不存在"检查更新"，跳 APK 下载页更是错位 */}
              {isNativeApp() ? <UpdateSetting /> : null}
              <DisclaimerSetting />
              <DiagnosticsSetting />
            </>
          ) : section === 'personalize' ? (
            <>
              <FontSizeSetting />
              <ThinkingEndSetting />
              <TtsVoiceSetting />
              <AvatarSetting />
              <BackgroundSetting />
            </>
          ) : (
            <>
              <ApiKeyField editor={apiKeyEditor} />
              <ImportHistory historyImport={historyImport} disabled={historyBusy} />
              <ExportHistory disabled={historyBusy} />
              <SettingCell
                label={t('deleteAllSessions')}
                status={null}
                action={
                  <Button
                    variant="dangerOutlined"
                    size="m"
                    className={styles.cellButton}
                    disabled={historyBusy}
                    onClick={historyDelete.open}
                  >
                    {t('delete')}
                  </Button>
                }
              />
              {isMobile ? <ApiKeyConfirm editor={apiKeyEditor} /> : null}
            </>
          )}
        </div>
      </Modal>
      {historyImport.file ? <ImportConfirm historyImport={historyImport} /> : null}
      {historyDelete.opened ? <DeleteAllConfirm historyDelete={historyDelete} /> : null}
    </>
  )
}

/** 删除确认保留在设置之上；失败可重试，成功只关闭确认弹窗。 */
const DeleteAllConfirm = ({
  historyDelete,
}: {
  historyDelete: ReturnType<typeof useHistoryDelete>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('deleteAllSessionsModalTitle')}
      className={styles.deleteConfirm}
      onClose={historyDelete.cancel}
      footer={
        <div className={styles.deleteActions} aria-busy={historyDelete.busy}>
          <Button
            variant="outlined"
            autoFocus
            disabled={historyDelete.busy}
            onClick={historyDelete.cancel}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={historyDelete.busy}
            onClick={() => void historyDelete.confirm()}
          >
            {t(historyDelete.busy ? 'historyDeleting' : 'deleteAllSessions')}
          </Button>
        </div>
      }
    >
      {t('deleteAllSessionsModalDescription')}
    </Modal>
  )
}

const useHistoryDelete = () => {
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const deleting = useRef(false)

  const confirm = async () => {
    if (deleting.current) {
      return
    }
    deleting.current = true
    setBusy(true)
    try {
      await clearHistory()
      setOpened(false)
      showToast({ key: 'historyDeleted' })
    } catch {
      showToast({ key: 'historyDeleteFailed', type: 'error' })
    } finally {
      deleting.current = false
      setBusy(false)
    }
  }

  return {
    opened,
    busy,
    open: () => setOpened(true),
    cancel: () => {
      if (!deleting.current) {
        setOpened(false)
      }
    },
    confirm,
  }
}

const LocationSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const location = useSettings((state) => state.location)
  const province =
    location?.region === 'CN'
      ? provinces.find((item) => item.code === location.province)
      : undefined

  return (
    <SettingCell
      label={t('settingsLocation')}
      status={null}
      className={styles.locationCell}
      action={
        <div className={styles.locationSelectors}>
          {isChineseBrowser() ? (
            <>
              <Select
                ariaLabel={t('settingsLocationProvince')}
                className={styles.provinceSelect}
                value={province?.code ?? ''}
                placeholder={t('settingsLocationProvince')}
                options={provinces.map((item) => ({ value: item.code, label: item.name }))}
                onChange={(value) => {
                  if (value !== province?.code) {
                    setLocation({ region: 'CN', province: value })
                  }
                }}
              />
              <Select
                ariaLabel={t('settingsLocationCity')}
                className={styles.citySelect}
                value={province ? (location?.city ?? '') : ''}
                disabled={!province?.cities.length}
                placeholder={t('settingsLocationCity')}
                options={
                  province?.cities.map((item) => ({ value: item.code, label: item.name })) ?? []
                }
                onChange={(value) => {
                  if (province) {
                    setLocation({ region: 'CN', province: province.code, city: value })
                  }
                }}
              />
            </>
          ) : (
            <Select
              ariaLabel={t('settingsLocationRegion')}
              className={styles.regionSelect}
              value={location?.region ?? ''}
              placeholder={t('settingsLocationRegion')}
              options={regionCodes
                .map((code) => ({ value: code, label: getRegionName(code, locale) }))
                .sort((a, b) => a.label.localeCompare(b.label, locale))}
              onChange={(value) => setLocation({ region: value })}
            />
          )}
        </div>
      }
    />
  )
}

const LocaleSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  return (
    <SettingCell
      label={t('settingsLocalePreference')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsLocalePreference')}
          value={locale}
          options={[
            { value: 'zh-CN', label: t('settingsLocaleZhCN'), lang: 'zh-CN' },
            { value: 'en-US', label: t('settingsLocaleEnUS'), lang: 'en' },
          ]}
          onChange={setLocale}
        />
      }
    />
  )
}

/** 思考结束后：默认收起还是展开。只决定「没被手动碰过」的消息怎么显示 */
const ThinkingEndSetting = () => {
  const t = useTranslate()
  const thinkingEnd = useSettings((state) => state.thinkingEnd)
  return (
    <SettingCell
      label={t('settingsThinkingEnd')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsThinkingEnd')}
          value={thinkingEnd}
          options={[
            { value: 'collapse', label: t('settingsThinkingEndCollapse') },
            { value: 'expand', label: t('settingsThinkingEndExpand') },
          ]}
          onChange={setThinkingEnd}
        />
      }
    />
  )
}

/** 朗读音色：stella（海星，女声）/ tide（暗潮，男声） */
const TtsVoiceSetting = () => {
  const t = useTranslate()
  const ttsVoice = useSettings((state) => state.ttsVoice)
  return (
    <SettingCell
      label={t('settingsTtsVoice')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsTtsVoice')}
          value={ttsVoice}
          options={[
            { value: 'stella', label: t('settingsTtsVoiceStella') },
            { value: 'tide', label: t('settingsTtsVoiceTide') },
          ]}
          onChange={setTtsVoice}
        />
      }
    />
  )
}

/** 导入的二次确认：默认合并，覆盖单独一个危险按钮，避免误清空本地对话。 */
const ImportConfirm = ({
  historyImport,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('historyImportConfirmTitle')}
      className={styles.importConfirm}
      onClose={historyImport.cancel}
      footer={
        <>
          <Button variant="outlined" size="m" onClick={historyImport.cancel}>
            {t('cancel')}
          </Button>
          <Button
            variant="dangerOutlined"
            size="m"
            onClick={() => void historyImport.confirm('replace')}
          >
            {t('historyImportReplace')}
          </Button>
          <Button
            variant="primary"
            size="m"
            autoFocus
            onClick={() => void historyImport.confirm('merge')}
          >
            {t('historyImportMerge')}
          </Button>
        </>
      }
    >
      <div className={styles.importConfirmText}>{t('historyImportConfirmDescription')}</div>
      <div className={styles.importConfirmHint}>{t('historyImportMergeHint')}</div>
      <div className={styles.importConfirmHint}>{t('historyImportReplaceHint')}</div>
    </Modal>
  )
}

const themeOptions: { value: ThemePreference; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'light',
    label: 'avatarMenuSettingsDialogThemeSelectLightOption',
    icon: <IconLightOutline16 />,
  },
  {
    value: 'dark',
    label: 'avatarMenuSettingsDialogThemeSelectDarkOption',
    icon: <IconDarkOutline16 />,
  },
  {
    value: 'system',
    label: 'avatarMenuSettingsDialogThemeSelectSystemOption',
    icon: <IconFollowsystemOutline16 />,
  },
]

/**
 * 主题项：标题下方浅色 / 深色 / 跟随系统三个选块。
 * 与下方语言选项连续排列。
 */
const ThemeSetting = () => {
  const t = useTranslate()
  const themePreference = useSettings((state) => state.themePreference)
  const label = t('avatarMenuSettingsDialogThemeItemLabel')
  return (
    <div className={styles.theme}>
      {label}
      <div role="radiogroup" aria-label={label} className={styles.themeOptions}>
        {themeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={themePreference === option.value}
            className={clsx(
              styles.themeOption,
              themePreference === option.value && styles.themeOptionSelected
            )}
            onClick={() => setThemePreference(option.value)}
          >
            {option.icon}
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 字体大小：四档，作用于聊天正文与输入框；标题、表格、代码按同一系数跟随 */
const FONT_LABELS: Record<ReadingLevel, TranslationKey> = {
  small: 'fontSizeSmall',
  normal: 'fontSizeNormal',
  large: 'fontSizeLarge',
  xlarge: 'fontSizeXLarge',
}

const FontSizeSetting = () => {
  const t = useTranslate()
  const level = useReadingFont((state) => state.level)
  const label = t('fontSizeLabel')
  return (
    <div className={styles.theme}>
      <div className={styles.settingTitle}>
        {label}
        <span className={styles.settingHint}>{t('fontSizeHint')}</span>
      </div>
      <div role="radiogroup" aria-label={label} className={styles.fontSizeOptions}>
        {READING_LEVELS.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={level === item}
            className={clsx(styles.fontSizeOption, level === item && styles.fontSizeOptionSelected)}
            onClick={() => setReadingLevel(item)}
          >
            {t(FONT_LABELS[item])}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 对话背景：选图走同一个裁剪器。900×1600 对手机屏幕（390px 宽）已有 2.3 倍像素密度，
 *  再大只是白占 localStorage；600K 字符约等于 450KB 图，普通照片压到这个尺寸一定能过。 */
const MAX_BACKGROUND_CHARS = 600_000

const BackgroundSetting = () => {
  const t = useTranslate()
  const image = useChatBackground((state) => state.image)
  const dim = useChatBackground((state) => state.dim)
  const bubbleAlpha = useChatBackground((state) => state.bubbleAlpha)
  const [pending, setPending] = useState<File | null>(null)

  return (
    <div className={styles.backgroundSetting}>
      <div className={styles.backgroundHeader}>
        <div>
          <div className={styles.label}>{t('backgroundLabel')}</div>
          <div className={styles.description}>{t('backgroundHint')}</div>
        </div>
        <div className={styles.avatarActions}>
          <label className={styles.avatarUpload}>
            {t('backgroundPick')}
            <input
              className={styles.avatarInput}
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) {
                  setPending(file)
                }
              }}
            />
          </label>
          {image ? (
            <Button
              size="m"
              variant="outlined"
              className={styles.cellButton}
              onClick={() => setChatBackground(null)}
            >
              {t('backgroundClear')}
            </Button>
          ) : null}
        </div>
      </div>
      {image ? (
        <>
          <div className={styles.backgroundPreview}>
            <img src={image} alt="" />
            <div className={styles.backgroundPreviewDim} />
          </div>
          <label className={styles.backgroundDimRow}>
            <span>{t('backgroundDim')}</span>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={dim}
              onChange={(event) => setBackgroundDim(Number(event.target.value))}
            />
          </label>
          <label className={styles.backgroundDimRow}>
            <span>{t('backgroundBubbleOpacity')}</span>
            <input
              type="range"
              min={MIN_BUBBLE_ALPHA}
              max={MAX_BUBBLE_ALPHA}
              step={5}
              value={bubbleAlpha}
              onChange={(event) => setBubbleAlpha(Number(event.target.value))}
            />
            {/* 把数字显示出来：您调到一个满意的值，可以直接报数给我 */}
            <span className={styles.rangeValue}>{bubbleAlpha}%</span>
          </label>
        </>
      ) : null}
      {pending ? (
        <ImageCropper
          file={pending}
          aspect={9 / 16}
          outputWidth={900}
          quality={0.7}
          onCancel={() => setPending(null)}
          onConfirm={(dataUrl) => {
            setPending(null)
            if (dataUrl.length > MAX_BACKGROUND_CHARS) {
              showToast({ key: 'backgroundTooLarge', type: 'error' })
              return
            }
            setChatBackground(dataUrl)
          }}
        />
      ) : null}
    </div>
  )
}

/** `reason` 为失败原因的文案 key，展示时按当前语言翻译后填入 `message` 参数。 */
type Status = (TranslationMessage & { error?: boolean; reason?: TranslationKey }) | null

/** 导出失败附带原因：预期的错误用对应文案作原因，其他错误用错误信息。 */
const errorStatus = (key: TranslationKey, error: unknown): Status => ({
  key,
  ...(error instanceof BackupError
    ? { reason: error.key }
    : { params: { message: error instanceof Error ? error.message : String(error) } }),
  error: true,
})

const SettingCell = ({
  label,
  description,
  status,
  action,
  className,
}: {
  label: string
  description?: string
  status: Status
  action: ReactNode
  className?: string
}) => {
  const t = useTranslate()
  return (
    <div className={clsx(styles.cell, styles.row, className)}>
      <div className={styles.text}>
        <div className={styles.label}>{label}</div>
        {status || description ? (
          <div className={clsx(styles.description, status?.error && styles.error)}>
            {status
              ? t(status.key, status.reason ? { message: t(status.reason) } : status.params)
              : description}
          </div>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/**
 * 选文件 → 确认 → 导入，每一步都有可见状态：
 * 点击上传后先显示等待选中，选择器返回空时明确提示，失败时显示具体原因。
 */
const useHistoryImport = () => {
  const isMobile = useIsMobile()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const importing = useRef(false)
  const waiting = useRef(0)

  /** 点击上传按钮：先告诉用户正在等选择器，避免出现「点了没反应」。 */
  const beginSelect = () => {
    setStatus({ key: 'historyImportWaiting' })
    window.clearTimeout(waiting.current)
    waiting.current = window.setTimeout(() => {
      setStatus((current) =>
        current?.key === 'historyImportWaiting' ? { key: 'historyImportNoPicker' } : current
      )
    }, 8000)
  }

  const select = (picked: File | null) => {
    window.clearTimeout(waiting.current)
    if (!picked) {
      setStatus({ key: 'historyImportNoFile', error: true })
      return
    }
    setStatus(null)
    setFile(picked)
  }

  const cancel = () => {
    window.clearTimeout(waiting.current)
    setFile(null)
  }

  const confirm = async (mode: ImportMode) => {
    if (!file || importing.current) {
      return
    }
    importing.current = true
    const picked = file
    setFile(null)
    setBusy(true)
    setStatus({ key: 'historyImporting' })
    try {
      const result = await importHistory(picked, mode)
      const message = importMessage(result)
      setStatus(message)
      showToast(message)
      // 移动端会话列表在抽屉里：先打开，用户关掉设置就能看到刚导入的对话。
      if (isMobile) {
        openMobileSider()
      }
    } catch (error) {
      setStatus(errorStatus('historyImportFailed', error))
    } finally {
      importing.current = false
      setBusy(false)
    }
  }

  return { file, busy, status, beginSelect, select, cancel, confirm }
}

/** 导入 = 选文件后确认；默认合并，覆盖需要单独选择。 */
const ImportHistory = ({
  historyImport,
  disabled,
}: {
  historyImport: ReturnType<typeof useHistoryImport>
  disabled: boolean
}) => {
  const t = useTranslate()

  return (
    <SettingCell
      label={t('historyImport')}
      description={t('historyImportDescription')}
      status={historyImport.status}
      action={
        <div className={styles.uploadArea}>
          <Button variant="outlined" size="m" className={styles.cellButton} disabled={disabled}>
            <IconUploadOutline14 />
            {t('upload')}
          </Button>
          {/*
            透明覆盖在按钮上，用户点到的就是 input 本身。
            WebView 里对隐藏 input 调用 click() 并不可靠，这条路径要避开。
            accept 留空：系统文件管理器把 zip 报成 octet-stream 时，收窄的 MIME
            白名单会让文件变成不可选；格式由 isZipFile 与 manifest 校验兜底。
          */}
          <input
            type="file"
            aria-label={t('historyImport')}
            className={styles.uploadInput}
            disabled={disabled}
            onClick={historyImport.beginSelect}
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null
              event.target.value = ''
              historyImport.select(picked)
            }}
          />
        </div>
      }
    />
  )
}

/** 将全部会话及图片导出为 ZIP 文件并下载 */
const ExportHistory = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const empty = useChatStore((state) => state.sessions.length === 0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  const onExport = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { name, blob } = await exportHistory()
      // WebView 里 a[download] 不生效，改走原生文件写入 + 系统分享
      if (isNativeApp()) {
        await saveBlobOnNative(name, blob)
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      setStatus(errorStatus('historyExportFailed', error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingCell
      label={t('exportAllLabel')}
      description={t('historyExportDescription')}
      status={status}
      action={
        <Button
          variant="outlined"
          size="m"
          className={styles.cellButton}
          disabled={disabled || busy || empty}
          onClick={() => void onExport()}
        >
          <IconDownloadOutline16 />
          {t(busy ? 'exportAllExporting' : 'exportAllDownload')}
        </Button>
      }
    />
  )
}

/** 头像设置：用户可上传自己的照片，AI 头像也可换或恢复默认。网页版与 APK 都有。 */
const AvatarSetting = () => {
  const t = useTranslate()
  return (
    <div className={styles.avatarSetting}>
      <AvatarRow role="user" label={t('settingsAvatarUser')} />
      <AvatarRow role="assistant" label={t('settingsAvatarAssistant')} />
    </div>
  )
}

const AvatarRow = ({ role, label }: { role: AvatarRole; label: string }) => {
  const t = useTranslate()
  const src = useAvatars((state) => state[role])
  const [pending, setPending] = useState<File | null>(null)

  const pick = (file: File | undefined) => {
    if (file) {
      setPending(file)
    }
  }

  return (
    <div className={styles.avatarRow}>
      <span className={styles.avatarPreview}>
        {src ? (
          <img src={src} alt="" />
        ) : (
          <span className={styles.avatarFallback}>{role === 'user' ? '我' : 'AI'}</span>
        )}
      </span>
      <div className={styles.text}>
        <div className={styles.label}>{label}</div>
        <div className={styles.description}>{t('settingsAvatarDescription')}</div>
      </div>
      <div className={styles.avatarActions}>
        <label className={styles.avatarUpload}>
          {t('settingsAvatarUpload')}
          <input
            className={styles.avatarInput}
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              pick(file)
            }}
          />
        </label>
        {src ? (
          <Button
            size="m"
            variant="outlined"
            className={styles.cellButton}
            onClick={() => setAvatar(role, null)}
          >
            {t('settingsAvatarReset')}
          </Button>
        ) : null}
      </div>
      {pending ? (
        <ImageCropper
          file={pending}
          aspect={1}
          outputWidth={AVATAR_SIZE}
          quality={0.85}
          onCancel={() => setPending(null)}
          onConfirm={(dataUrl) => {
            setAvatar(role, dataUrl)
            setPending(null)
          }}
        />
      ) : null}
    </div>
  )
}

/** 诊断信息：把本机环境与最近的错误整理成一段文本，供用户一键复制给开发者。 */
/** 最新版的下载页。给的是 Releases 页面而不是 APK 直链——页面里能看到版本说明和资产 */
const RELEASES_URL = 'https://github.com/KhalilYamber/DeepSeek-APP-Replica/releases/latest'

/**
 * 版本号 + 检查更新。
 *
 * 点「检查更新」先弹说明，再把用户交给浏览器：跳过去之后成没成、有没有浏览器，
 * App 一律看不见（Capacitor 连 ActivityNotFoundException 都自己吞了），
 * 所以只能事前讲清楚，并留「复制链接」这条退路。
 */
const UpdateSetting = () => {
  const t = useTranslate()
  const [open, setOpen] = useState(false)

  const copy = () => {
    const finish = (ok: boolean) => {
      showToast(
        ok ? { key: 'settingsUpdateCopied' } : { key: 'settingsUpdateCopyFailed', type: 'error' }
      )
    }
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard
        .writeText(RELEASES_URL)
        .then(() => finish(true))
        .catch(() => finish(copyBySelection(RELEASES_URL)))
      return
    }
    finish(copyBySelection(RELEASES_URL))
  }

  return (
    <>
      <SettingCell
        label={`${t('settingsVersion')} ${appVersion()}`}
        status={null}
        action={
          <button type="button" className={styles.updateLink} onClick={() => setOpen(true)}>
            {t('settingsCheckUpdate')}
          </button>
        }
      />
      {open ? (
        <Modal
          title={t('settingsCheckUpdate')}
          closable
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button variant="outlined" onClick={copy}>
                {t('settingsUpdateCopy')}
              </Button>
              <a
                className={styles.updatePrimary}
                href={RELEASES_URL}
                target="_blank"
                rel="noreferrer"
              >
                {t('settingsUpdateOpen')}
              </a>
            </>
          }
        >
          <div className={styles.updatePanel}>
            <p>{t('settingsUpdateIntro')}</p>
            <p>{t('settingsUpdateNetwork')}</p>
            <p>{t('settingsUpdateFallback')}</p>
          </div>
          <div className={styles.updateUrl}>{RELEASES_URL}</div>
        </Modal>
      ) : null}
    </>
  )
}

/** 使用前须知：首次启动展示过的内容，可随时重看 */
const DisclaimerSetting = () => {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  return (
    <>
      <SettingCell
        label={t('disclaimerTitle')}
        description={t('settingsDisclaimerDescription')}
        status={null}
        action={
          <Button
            size="m"
            variant="outlined"
            className={styles.cellButton}
            onClick={() => setOpen(true)}
          >
            {t('settingsDisclaimerOpen')}
          </Button>
        }
      />
      {open ? <DisclaimerDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}

const DiagnosticsSetting = () => {
  const t = useTranslate()
  const [text, setText] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const open = () => {
    setCopied(false)
    void collectDiagnostics().then(setText)
  }

  const copy = () => {
    if (!text) {
      return
    }
    const finish = (ok: boolean) => {
      setCopied(ok)
      if (!ok) {
        showToast({ key: 'settingsDiagnosticsFailed', type: 'error' })
      }
    }
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard
        .writeText(text)
        .then(() => finish(true))
        .catch(() => finish(copyBySelection(text)))
      return
    }
    finish(copyBySelection(text))
  }

  return (
    <>
      <SettingCell
        label={t('settingsDiagnostics')}
        description={t('settingsDiagnosticsDescription')}
        status={null}
        action={
          <Button size="m" variant="outlined" className={styles.cellButton} onClick={open}>
            {t('settingsDiagnosticsCopy')}
          </Button>
        }
      />
      {text === null ? null : (
        <Modal
          title={t('settingsDiagnostics')}
          onClose={() => setText(null)}
          footer={
            <>
              <Button
                variant="outlined"
                onClick={() => {
                  clearDiagnostics()
                  setText(null)
                }}
              >
                {t('settingsDiagnosticsClear')}
              </Button>
              <Button onClick={copy}>
                {copied ? t('settingsDiagnosticsCopied') : t('settingsDiagnosticsCopy')}
              </Button>
            </>
          }
        >
          <pre className={styles.diagnosticsText}>{text}</pre>
        </Modal>
      )}
    </>
  )
}

/** 剪贴板 API 不可用时的兜底：老内核、非安全上下文都走这条路。 */
const copyBySelection = (value: string): boolean => {
  try {
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', 'readonly')
    area.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0'
    document.body.appendChild(area)
    area.select()
    area.setSelectionRange(0, value.length)
    const ok = document.execCommand?.('copy') ?? false
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
