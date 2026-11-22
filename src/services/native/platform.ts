import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { planNativeWrite, type WriteRange } from './chunkPlan.js'

/** 是否运行在 Capacitor 原生外壳里（Android / iOS），而不是浏览器 */
export const isNativeApp = () => Capacitor.isNativePlatform()

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('blob read failed'))
    reader.readAsDataURL(blob)
  })

/** 已写入 / 总字节；只在大文件分块写时回调，小文件一次性写完没有中间态 */
export type WriteProgress = (writtenBytes: number, totalBytes: number) => void

const writeWhole = async (name: string, blob: Blob): Promise<string> => {
  const data = await blobToBase64(blob)
  const written = await Filesystem.writeFile({
    path: name,
    data,
    directory: Directory.Cache,
    recursive: true,
  })
  return written.uri
}

/** 每块单独转 base64、单独过桥，峰值内存只跟块大小有关，不跟文件总大小有关 */
const writeChunked = async (
  name: string,
  blob: Blob,
  ranges: WriteRange[],
  onProgress?: WriteProgress
): Promise<string> => {
  let uri = ''
  for (const [index, range] of ranges.entries()) {
    const data = await blobToBase64(blob.slice(range.start, range.end))
    if (index === 0) {
      const written = await Filesystem.writeFile({
        path: name,
        data,
        directory: Directory.Cache,
        recursive: true,
      })
      uri = written.uri
    } else {
      await Filesystem.appendFile({ path: name, data, directory: Directory.Cache })
    }
    // 报进度放在写完之后：数字对应「已经落盘的字节」，不是「已经读进内存的字节」
    onProgress?.(range.end, blob.size)
  }
  return uri
}

/**
 * WebView 里 `a[download]` 不生效：先把文件写进应用缓存目录，再交给系统分享面板，
 * 用户可以存到「文件 / 下载」或直接发给别人。
 *
 * 大文件走分块写：一次把整包转 base64 过桥时，同一份数据会在内存里复制三四份，
 * 几十 MB 的历史足以把进程撑死（表现是 App 直接退出）。阈值以下仍是原来的一次写。
 */
export const saveBlobOnNative = async (
  name: string,
  blob: Blob,
  onProgress?: WriteProgress
): Promise<void> => {
  const plan = planNativeWrite(blob.size)
  const uri =
    plan.kind === 'chunks' && typeof Filesystem.appendFile === 'function'
      ? await writeChunked(name, blob, plan.ranges, onProgress)
      : await writeWhole(name, blob)
  await Share.share({ title: name, url: uri, dialogTitle: name })
}
