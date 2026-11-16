import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

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

/**
 * WebView 里 `a[download]` 不生效：先把文件写进应用缓存目录，再交给系统分享面板，
 * 用户可以存到「文件 / 下载」或直接发给别人。
 */
export const saveBlobOnNative = async (name: string, blob: Blob): Promise<void> => {
  const data = await blobToBase64(blob)
  const written = await Filesystem.writeFile({
    path: name,
    data,
    directory: Directory.Cache,
    recursive: true,
  })
  await Share.share({ title: name, url: written.uri, dialogTitle: name })
}
