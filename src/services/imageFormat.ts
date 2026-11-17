/**
 * 图片真实格式识别：只看文件头部的签名字节，不信任扩展名，也不信任浏览器给的 MIME。
 *
 * 纯函数、没有运行时依赖、不碰 DOM，可以直接在 Node 里跑测试。
 * 判定是「签名级」的：认出 PNG 的 8 字节签名只说明这份文件按 PNG 组织，
 * 不代表整张图能解码；能不能发给服务端由 checkImageContent 判。
 */
import type { TranslationMessage } from '../i18n/index.js'

/** 能识别出的图片格式 */
export type ImageFormat = 'jpeg' | 'png' | 'gif' | 'webp' | 'bmp' | 'tiff' | 'avif' | 'heic' | 'svg'

/**
 * 服务端能解析的图片格式。其余格式上传能成功（Files API 不校验内容），
 * 到发送阶段才被服务端拒绝，整条消息一起失败，所以在添加附件时就挡掉。
 */
export const SENDABLE_IMAGE_FORMATS: readonly ImageFormat[] = ['jpeg', 'png', 'webp', 'gif']

/** 提示文案里显示的格式名 */
export const IMAGE_FORMAT_LABEL: Record<ImageFormat, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  gif: 'GIF',
  webp: 'WebP',
  bmp: 'BMP',
  tiff: 'TIFF',
  avif: 'AVIF',
  heic: 'HEIC',
  svg: 'SVG',
}

/** 扩展名与实际内容不一致时，建议用户改回的那个扩展名（能发的用常见的那个） */
const IMAGE_FORMAT_EXT: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
  bmp: 'bmp',
  tiff: 'tif',
  avif: 'avif',
  heic: 'heic',
  svg: 'svg',
}

/**
 * 扩展名声明的图片格式。apng 是 PNG 的动画扩展，pjpeg / pjp / jpe 是 JPEG 的别名，
 * 字节头与主格式完全相同，所以映射到同一个格式。
 */
const IMAGE_FORMAT_BY_EXT: Record<string, ImageFormat> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  jpe: 'jpeg',
  jfif: 'jpeg',
  pjpeg: 'jpeg',
  pjp: 'jpeg',
  png: 'png',
  apng: 'png',
  gif: 'gif',
  webp: 'webp',
  bmp: 'bmp',
  tif: 'tiff',
  tiff: 'tiff',
  avif: 'avif',
  avifs: 'avif',
  svg: 'svg',
}

/** 按扩展名取声明的图片格式（小写、不含点）；不是图片扩展名时返回 null */
export const imageFormatByExt = (ext: string): ImageFormat | null => {
  const key = ext.toLowerCase()
  return Object.hasOwn(IMAGE_FORMAT_BY_EXT, key) ? IMAGE_FORMAT_BY_EXT[key] : null
}

/** 头部是否以给定字节序列开头；不足签名长度（截断）时为 false */
const startsWith = (bytes: Uint8Array, ...signature: number[]): boolean =>
  bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte)

/** 取头部的一段字符（按字节当 ASCII 读），越界部分忽略 */
const ascii = (bytes: Uint8Array, start: number, end: number): string => {
  let text = ''
  for (let index = start; index < Math.min(end, bytes.length); index += 1) {
    text += String.fromCharCode(bytes[index])
  }
  return text
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const TIFF_LE = [0x49, 0x49, 0x2a, 0x00]
const TIFF_BE = [0x4d, 0x4d, 0x00, 0x2a]
const BIG_TIFF_LE = [0x49, 0x49, 0x2b, 0x00]
const BIG_TIFF_BE = [0x4d, 0x4d, 0x00, 0x2b]
/**
 * BMP 的 'BM' 只有两字节，弱到任意以 BM 开头的文本都会命中，
 * 所以要求文件至少有 14 字节的位图文件头。
 */
const BMP_MIN_LENGTH = 14
/** ISO 基础媒体格式（HEIC / AVIF）的品牌名；主品牌或兼容品牌列表里出现即认 */
const AVIF_BRANDS = ['avif', 'avis']
const HEIC_BRANDS = ['heic', 'heix', 'heim', 'heis', 'hevc']

/** HEIC / AVIF 都以 'ftyp' 盒开头，格式名写在品牌字段里（主品牌 + 兼容品牌列表） */
const isoBrand = (bytes: Uint8Array): 'avif' | 'heic' | null => {
  if (ascii(bytes, 4, 8) !== 'ftyp') {
    return null
  }
  const brands = ascii(bytes, 8, 64)
  if (AVIF_BRANDS.some((brand) => brands.includes(brand))) {
    return 'avif'
  }
  return HEIC_BRANDS.some((brand) => brands.includes(brand)) ? 'heic' : null
}

/**
 * SVG 是文本：跳过 UTF-8 BOM 与前导空白后看开头是不是 <svg；
 * 带 XML 声明、注释或 DOCTYPE 的，在这一段头部里继续找 <svg。
 * 头部太短（只读十几字节）时认不出带声明的 SVG，调用方要按能认出来读够长度。
 */
const isSvg = (bytes: Uint8Array): boolean => {
  let start = startsWith(bytes, 0xef, 0xbb, 0xbf) ? 3 : 0
  while (start < bytes.length && ' \t\r\n'.includes(String.fromCharCode(bytes[start]))) {
    start += 1
  }
  const head = ascii(bytes, start, bytes.length).toLowerCase()
  if (head === '') {
    return false
  }
  if (head.startsWith('<svg')) {
    return true
  }
  if (head.startsWith('<?xml') || head.startsWith('<!--') || head.startsWith('<!doctype')) {
    return head.includes('<svg')
  }
  return false
}

/** 按文件头字节判断真实图片格式；认不出来（空文件、非图片、只有半截签名）返回 null */
export const detectImageFormat = (bytes: Uint8Array): ImageFormat | null => {
  if (startsWith(bytes, ...PNG_SIGNATURE)) {
    return 'png'
  }
  if (startsWith(bytes, ...JPEG_SIGNATURE)) {
    return 'jpeg'
  }
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') {
    return 'gif'
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'webp'
  }
  if (bytes.length >= BMP_MIN_LENGTH && ascii(bytes, 0, 2) === 'BM') {
    return 'bmp'
  }
  if (
    startsWith(bytes, ...TIFF_LE) ||
    startsWith(bytes, ...TIFF_BE) ||
    startsWith(bytes, ...BIG_TIFF_LE) ||
    startsWith(bytes, ...BIG_TIFF_BE)
  ) {
    return 'tiff'
  }
  const brand = isoBrand(bytes)
  if (brand) {
    return brand
  }
  return isSvg(bytes) ? 'svg' : null
}

/** 内容校验的三种问题：认不出是图片、与声明的格式不一致、格式服务端不支持 */
export type ImageContentIssue = 'notImage' | 'mismatch' | 'unsupported'

export type ImageContentVerdict = {
  /** null 表示内容可以发送 */
  issue: ImageContentIssue | null
  /** 真实识别出的格式；认不出来为 null */
  actual: ImageFormat | null
}

/**
 * 判定一份图片文件的内容是否可发送。
 * declared 是扩展名声明的格式；没有图片扩展名（如粘贴进来、只有 MIME 说是图片）时传 null，
 * 此时只按真实格式判断能不能发，不做一致性比较。
 * 先看服务端能力再看一致性：`a.jpg` 里装着 BMP 时，真正拦住它的是「服务端不认 BMP」。
 */
export const checkImageContent = (
  declared: ImageFormat | null,
  head: Uint8Array
): ImageContentVerdict => {
  const actual = detectImageFormat(head)
  if (!actual) {
    return { issue: 'notImage', actual: null }
  }
  if (!SENDABLE_IMAGE_FORMATS.includes(actual)) {
    return { issue: 'unsupported', actual }
  }
  if (declared !== null && declared !== actual) {
    return { issue: 'mismatch', actual }
  }
  return { issue: null, actual }
}

/**
 * 内容校验结果对应的提示文案；可以发送时返回 null。
 * 放在这里是为了让「判断 + 怎么说」一起被测到：上传链路是异步且依赖浏览器的，
 * 只有这段纯逻辑能在 Node 里拿真实文件字节跑。
 */
export const describeImageContent = (
  name: string,
  { issue, actual }: ImageContentVerdict
): TranslationMessage | null => {
  if (!issue) {
    return null
  }
  if (issue === 'notImage') {
    return { key: 'uploadImageInvalid', params: { name } }
  }
  const format = actual ? IMAGE_FORMAT_LABEL[actual] : ''
  // 扩展名不对时最有用的信息是「该用哪个扩展名」：`a.jpg` 里是 PNG，改成 .png 就能发
  return issue === 'mismatch'
    ? {
        key: 'uploadImageFormatMismatch',
        params: { name, format, ext: actual ? IMAGE_FORMAT_EXT[actual] : '' },
      }
    : { key: 'uploadImageFormatUnsupported', params: { name, format } }
}

/**
 * 发送阶段服务端拒绝解析附件（errors.ts 里归为 parseFailed）时给用户看的话。
 *
 * 原文形如 `messages.560.content.47: You have uploaded an unsupported image. ...`，
 * 对用户既没有信息量也没有可操作项。这里只负责「怎么说」，判断是不是这一类由
 * errors.ts 的 getUploadErrorInfo 负责——两件事分开，免得把报错文案的正则抄成两份。
 *
 * 分类方式：报错里带 image 的是图片类，可以建议转 JPG / PNG；
 * 其余（加密文档、无法识别的文件）不能给这个建议，只说无法解析。
 * 能取出内容块序号时一并带上，长会话里几十个附件至少能定位到出错的那一块。
 */
export const describeParseFailed = (message: string): TranslationMessage => {
  const found = /\bmessages\.\d+\.content\.(\d+)\b/.exec(message)
  const position = found ? Number(found[1]) : null
  if (/image/i.test(message)) {
    return position === null
      ? { key: 'replyImageUnsupported' }
      : { key: 'replyImageUnsupportedAt', params: { position } }
  }
  return position === null
    ? { key: 'replyAttachmentUnreadable' }
    : { key: 'replyAttachmentUnreadableAt', params: { position } }
}
