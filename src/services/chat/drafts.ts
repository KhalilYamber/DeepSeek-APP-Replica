import { create } from 'zustand'
import type { TranslationMessage } from '../../i18n/index.js'
import { createId } from '../../utils/id.js'
import {
  cancelUpload,
  isImage,
  resolveMimeType,
  uploadAttachment,
  validateFileContents,
  validateFiles,
  type UploadTask,
} from '../attachments.js'
import type { FileAttachment } from './types.js'
import { parseDraftRecords, serializeDraftRecords } from './draftStorage.js'

export type DraftAttachment = {
  /** 本地标识，也是 IndexedDB 原件与上传任务的 key */
  id: string
  file: File
  isImage: boolean
  previewUrl: string | null
}

type Draft = { text: string; attachments: DraftAttachment[] }

export const EMPTY_DRAFT: Draft = { text: '', attachments: [] }

const DRAFT_KEY = 'chat-demo:drafts'
/** 打字时不要每个字符碰一次存储 */
const PERSIST_DELAY = 400

const readDrafts = (): Map<string | null, Draft> => {
  const drafts = new Map<string | null, Draft>()
  let raw: string | null = null
  try {
    raw = localStorage.getItem(DRAFT_KEY)
  } catch {
    raw = null
  }
  for (const [sessionId, text] of parseDraftRecords(raw)) {
    drafts.set(sessionId, { text, attachments: [] })
  }
  return drafts
}

/** 草稿文本落盘：附件是 File 对象没法序列化，所以只存文字，读回来时 attachments 为空 */
let persistTimer: ReturnType<typeof setTimeout> | null = null

const persist = (drafts: Map<string | null, Draft>) => {
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
  }
  persistTimer = setTimeout(() => {
    persistTimer = null
    const entries: Array<[string | null, string]> = []
    for (const [sessionId, draft] of drafts) {
      if (draft.text) {
        entries.push([sessionId, draft.text])
      }
    }
    try {
      if (entries.length === 0) {
        localStorage.removeItem(DRAFT_KEY)
      } else {
        localStorage.setItem(DRAFT_KEY, serializeDraftRecords(entries))
      }
    } catch {
      // 存储不可用（隐私模式 / 配额满）时放弃持久化，内存里的草稿照常可用
    }
  }, PERSIST_DELAY)
}

/** 草稿按会话分开存放；null 是新对话的草稿。文本会落盘，附件只在内存里。 */
export const useDrafts = create<{ drafts: Map<string | null, Draft> }>(() => ({
  drafts: readDrafts(),
}))

useDrafts.subscribe((state) => {
  persist(state.drafts)
})

export const getDraft = (sessionId: string | null): Draft =>
  useDrafts.getState().drafts.get(sessionId) ?? EMPTY_DRAFT

const updateDraft = (sessionId: string | null, update: (draft: Draft) => Draft) =>
  useDrafts.setState((state) => {
    const draft = update(state.drafts.get(sessionId) ?? EMPTY_DRAFT)
    const drafts = new Map(state.drafts)
    if (draft.text || draft.attachments.length > 0) {
      drafts.set(sessionId, draft)
    } else {
      drafts.delete(sessionId)
    }
    return { drafts }
  })

export const setDraftText = (sessionId: string | null, text: string) => {
  // 输入法重复抛同一个值时不重建 Map，省掉一次全量重渲染
  if (getDraft(sessionId).text === text) {
    return
  }
  updateDraft(sessionId, (draft) => ({ ...draft, text }))
}

const upload = (attachment: DraftAttachment, apiKey: string) => {
  // 上传任务负责记录错误，输入框的附件卡片展示失败及重试入口。
  void uploadAttachment(
    apiKey,
    attachment.id,
    attachment.file,
    attachment.file.name,
    attachment.isImage
  ).catch(() => {})
}

/** 整批校验通过后才创建预览和开始上传；图片还要读文件头确认真实格式，所以入口是异步的。 */
export const addDraftFiles = async (
  sessionId: string | null,
  files: File[],
  apiKey: string
): Promise<TranslationMessage | null> => {
  if (files.length === 0) {
    return null
  }
  const error = validateFiles(files, getDraft(sessionId).attachments.length)
  if (error) {
    return error
  }
  const contentError = await validateFileContents(files)
  if (contentError) {
    return contentError
  }
  const added = files.map((file): DraftAttachment => {
    const image = isImage(resolveMimeType(file))
    return {
      id: createId(),
      file,
      isImage: image,
      previewUrl: image ? URL.createObjectURL(file) : null,
    }
  })
  updateDraft(sessionId, (draft) => ({ ...draft, attachments: [...draft.attachments, ...added] }))
  added.forEach((attachment) => upload(attachment, apiKey))
  return null
}

export const retryDraftAttachment = (
  sessionId: string | null,
  attachmentId: string,
  apiKey: string
) => {
  const attachment = getDraft(sessionId).attachments.find((item) => item.id === attachmentId)
  if (attachment) {
    upload(attachment, apiKey)
  }
}

/** 发送按钮和实际提交共用规则：有内容，且全部附件已上传成功。 */
export const prepareDraftMessage = (draft: Draft, tasks: Record<string, UploadTask>) => {
  const text = draft.text.trim()
  if (!text && draft.attachments.length === 0) {
    return null
  }
  const files: (FileAttachment & { serverId: string; blob: Blob })[] = []
  for (const attachment of draft.attachments) {
    const task = tasks[attachment.id]
    if (task?.status !== 'done' || !task.serverId) {
      return null
    }
    files.push({
      id: attachment.id,
      serverId: task.serverId,
      name: attachment.file.name,
      size: attachment.file.size,
      isImage: attachment.isImage,
      mimeType: resolveMimeType(attachment.file),
      blob: attachment.file,
    })
  }
  return { text, files }
}

const releaseAttachment = (attachment: DraftAttachment, cancel: boolean) => {
  if (cancel) {
    cancelUpload(attachment.id)
  }
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl)
  }
}

export const removeDraftAttachment = (sessionId: string | null, attachmentId: string) => {
  const attachment = getDraft(sessionId).attachments.find((item) => item.id === attachmentId)
  if (!attachment) {
    return
  }
  releaseAttachment(attachment, true)
  updateDraft(sessionId, (draft) => ({
    ...draft,
    attachments: draft.attachments.filter((item) => item.id !== attachmentId),
  }))
}

/** 发送成功后原件与 serverId 已交给会话，释放预览但保留上传完成态。 */
export const clearSentDraft = (sessionId: string | null) => {
  getDraft(sessionId).attachments.forEach((attachment) => releaseAttachment(attachment, false))
  updateDraft(sessionId, () => EMPTY_DRAFT)
}

/** 删除会话或替换历史成功后，释放尚未发送的草稿及上传任务。 */
export const clearDraft = (sessionId: string | null) => {
  getDraft(sessionId).attachments.forEach((attachment) => releaseAttachment(attachment, true))
  updateDraft(sessionId, () => EMPTY_DRAFT)
}

export const clearAllDrafts = () => {
  for (const draft of useDrafts.getState().drafts.values()) {
    draft.attachments.forEach((attachment) => releaseAttachment(attachment, true))
  }
  useDrafts.setState({ drafts: new Map() })
}
