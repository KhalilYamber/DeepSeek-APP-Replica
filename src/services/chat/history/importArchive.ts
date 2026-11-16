import * as db from '../db.js'
import { BackupError, fail } from './errors.js'
import { INDEX_PATH, MANIFEST_PATH, USER_PATH, parseSessionPath } from './paths.js'
import { checkManifest, readSessionFile, readSessionIndex } from './schema.js'
import { toLocalSession } from './toLocal.js'
import {
  ArchiveError,
  isZipFile,
  readArchive,
  readEntry,
  skipEntry,
  type ArchiveEntry,
} from './zipReader.js'

/** 从原件字节补充图片 MIME；无法识别时为空字符串，图片身份仍由归档的 is_image 决定。 */
const imageType = (bytes: Uint8Array): string => {
  const startsWith = (...prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte)
  const header = new TextDecoder('ascii').decode(bytes.subarray(0, 12))
  if (startsWith(0xff, 0xd8, 0xff)) {
    return 'image/jpeg'
  }
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return 'image/png'
  }
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) {
    return 'image/gif'
  }
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (startsWith(0x42, 0x4d)) {
    return 'image/bmp'
  }
  if (startsWith(0x49, 0x49, 0x2a, 0) || startsWith(0x4d, 0x4d, 0, 0x2a)) {
    return 'image/tiff'
  }
  if (header.slice(4, 8) === 'ftyp' && ['avif', 'avis'].includes(header.slice(8, 12))) {
    return 'image/avif'
  }
  return ''
}

const readJson = async (entry: ArchiveEntry): Promise<unknown> => {
  const text = await (await readEntry(entry)).text()
  try {
    return JSON.parse(text)
  } catch {
    return fail('backupInvalidJson')
  }
}

/** 宽容读取：整个条目读完再解析，失败返回 undefined，由调用方决定跳过。 */
const tryReadJson = async (entry: ArchiveEntry): Promise<unknown> => {
  const text = await (await readEntry(entry)).text()
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** 导入结果：真正写出的会话数与因格式损坏被跳过的会话数。 */
export type ImportArchiveResult = {
  sessions: number
  failed: number
}

/**
 * 检查 ZIP 格式与格式版本。
 * 只要求归档里存在合法 manifest；manifest 之前的杂项条目（目录、macOS 资源分叉等）直接跳过，
 * 因为这些条目来自重新打包，不代表文件损坏。
 */
export const checkArchiveFormat = async (file: File): Promise<void> => {
  if (!(await isZipFile(file))) {
    fail('backupUnrecognized')
  }
  try {
    for await (const entry of readArchive(file)) {
      if (entry.path !== MANIFEST_PATH) {
        await skipEntry(entry)
        continue
      }
      checkManifest(await readJson(entry))
      return
    }
  } catch (error) {
    throw error instanceof ArchiveError ? new BackupError('backupIncomplete') : error
  }
  fail('backupUnrecognized')
}

/**
 * 流式导入：manifest → user（不导入）→ 全部会话 JSON → index → 全部图片。
 * 也支持会话与图片交错排列、index 位于末尾的条目顺序。
 * 会话读完立即暂存，只保留图片路径映射；图片全部读完后逐会话回填 MIME，不改变图片身份。
 * 写入导入暂存存储；调用方负责先清空暂存，成功后替换正式数据，失败时清理暂存。
 *
 * 单条会话损坏只计入 `failed`，不中止整包：一个会话的消息树不合规，不该让其余几百条
 * 对话一起进不来。结构性问题（不是 ZIP、manifest 缺失或版本不符）仍然整体失败。
 */
export const importArchive = async (file: File): Promise<ImportArchiveResult> => {
  if (!(await isZipFile(file))) {
    fail('backupUnrecognized')
  }
  const imported = new Set<string>()
  const images = new Map<string, string>()
  /** 已保存的原件：文件 ID → MIME。同一图片出现在多个会话目录时只保存一次。 */
  const stored = new Map<string, string>()
  let manifest = false
  let failed = 0

  const saveImage = async (entry: ArchiveEntry, id: string) => {
    if (stored.has(id)) {
      await skipEntry(entry)
      return
    }
    const data = await readEntry(entry)
    const type = imageType(new Uint8Array(await data.slice(0, 16).arrayBuffer()))
    await db.saveStagingFiles([{ id, blob: new Blob([data], { type }) }])
    stored.set(id, type)
  }

  try {
    for await (const entry of readArchive(file)) {
      const { path } = entry
      const sessionId = parseSessionPath(path)
      if (!manifest) {
        if (path !== MANIFEST_PATH) {
          // manifest 之前的杂项（目录、macOS 资源分叉、重新打包时的占位文件）不代表文件损坏。
          await skipEntry(entry)
          continue
        }
        checkManifest(await readJson(entry))
        manifest = true
        continue
      }
      if (path === USER_PATH) {
        // 账号信息（已脱敏）不导入；文件可能缺失。
        await skipEntry(entry)
      } else if (path === INDEX_PATH) {
        // 索引只用于交叉核对，不再决定导入成败：会话与图片才是数据本身。
        const data = await tryReadJson(entry)
        if (data !== undefined) {
          try {
            readSessionIndex(data)
          } catch {
            // 索引损坏不影响会话导入。
          }
        }
      } else if (sessionId !== null) {
        if (imported.has(sessionId)) {
          failed += 1
          await skipEntry(entry)
          continue
        }
        const data = await tryReadJson(entry)
        if (data === undefined) {
          failed += 1
          continue
        }
        let local: ReturnType<typeof toLocalSession>
        try {
          local = toLocalSession(readSessionFile(data))
        } catch {
          failed += 1
          continue
        }
        if (local.session.id !== sessionId) {
          failed += 1
          continue
        }
        imported.add(sessionId)
        for (const [imagePath, id] of local.images) {
          images.set(imagePath, id)
        }
        await db.addStagingSession(local.session)
      } else {
        // 没有被引用的条目、以及无法识别的杂项，读完丢弃；引用了但缺失的图片只展示文件名。
        const imageId = images.get(path)
        await (imageId === undefined ? skipEntry(entry) : saveImage(entry, imageId))
      }
    }
  } catch (error) {
    throw error instanceof ArchiveError ? new BackupError('backupIncomplete') : error
  }
  if (!manifest) {
    fail('backupUnrecognized')
  }
  if (imported.size === 0) {
    fail('backupEmpty')
  }
  await db.updateStagingFileTypes(stored)
  return { sessions: imported.size, failed }
}
