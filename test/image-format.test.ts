import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  IMAGE_FORMAT_LABEL,
  SENDABLE_IMAGE_FORMATS,
  checkImageContent,
  describeImageContent,
  describeParseFailed,
  detectImageFormat,
  imageFormatByExt,
} from '../src/services/imageFormat.ts'
import { ACCEPT_FILE_EXTS, SENDABLE_IMAGE_EXTS } from '../src/services/uploadExts.ts'

/** 用十进制字节数组造头部；注释里写清每个格式的前几个字节 */
const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values)
/** ASCII 片段转字节 */
const ascii = (text: string): Uint8Array => Uint8Array.from(text, (char) => char.charCodeAt(0))
/** 拼接多段字节 */
const concat = (...parts: Array<Uint8Array | number[]>): Uint8Array =>
  Uint8Array.from(parts.flatMap((part) => [...part]))

/**
 * 各格式的真实头部（从真实文件里抄下来的前十几到几十字节）。
 * 这里只喂头部，因为检测本来就只看头部；完整文件的验证在构建外的构造文件里跑。
 */
const PNG = bytes(
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0,
  0,
  0,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52
)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01)
const GIF87 = concat(ascii('GIF87a'), [0x01, 0x00, 0x01, 0x00])
const GIF89 = concat(ascii('GIF89a'), [0x01, 0x00, 0x01, 0x00])
const WEBP = concat(ascii('RIFF'), [0x24, 0x00, 0x00, 0x00], ascii('WEBP'), ascii('VP8 '))
/** BMP：'BM' + 文件大小 + 保留字段 + 像素偏移，共 14 字节的位图文件头 */
const BMP = concat(ascii('BM'), [0x46, 0x00, 0x00, 0x00, 0, 0, 0, 0, 0x36, 0x00, 0x00, 0x00])
const TIFF_LE = concat([0x49, 0x49, 0x2a, 0x00], [0x08, 0x00, 0x00, 0x00])
const TIFF_BE = concat([0x4d, 0x4d, 0x00, 0x2a], [0x00, 0x00, 0x00, 0x08])
const BIG_TIFF = concat([0x49, 0x49, 0x2b, 0x00], [0x08, 0x00, 0x00, 0x00])
/** AVIF / HEIC：4 字节盒长度 + 'ftyp' + 主品牌 + 版本 + 兼容品牌 */
const AVIF = concat([0x00, 0x00, 0x00, 0x1c], ascii('ftypavif'), [0, 0, 0, 0], ascii('avifmif1'))
const AVIF_COMPAT = concat(
  [0x00, 0x00, 0x00, 0x1c],
  ascii('ftypmif1'),
  [0, 0, 0, 0],
  ascii('mif1avif')
)
const HEIC = concat([0x00, 0x00, 0x00, 0x18], ascii('ftypheic'), [0, 0, 0, 0], ascii('heicmif1'))
/** 同为 ISO 基础媒体格式，但不是图片（mp4 视频） */
const MP4 = concat([0x00, 0x00, 0x00, 0x18], ascii('ftypisom'), [0, 0, 0, 0], ascii('isomiso2'))
const SVG = concat(
  ascii('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1">'),
  ascii('</svg>')
)
const SVG_WITH_PROLOG = concat(
  ascii('<?xml version="1.0" encoding="UTF-8"?>\n'),
  ascii('<!-- Generator: hand written -->\n'),
  SVG
)
const SVG_WITH_BOM = concat([0xef, 0xbb, 0xbf], ascii('  \n'), SVG)

test('PNG 的 8 字节签名', () => {
  assert.equal(detectImageFormat(PNG), 'png')
})

test('JPEG 以 FF D8 FF 开头', () => {
  assert.equal(detectImageFormat(JPEG), 'jpeg')
})

test('GIF87a 与 GIF89a 都认', () => {
  assert.equal(detectImageFormat(GIF87), 'gif')
  assert.equal(detectImageFormat(GIF89), 'gif')
})

test('WebP 要 RIFF 开头且第 8 字节起是 WEBP', () => {
  assert.equal(detectImageFormat(WEBP), 'webp')
  // RIFF 但容器里不是 WEBP（如 WAV）：不是图片
  assert.equal(detectImageFormat(concat(ascii('RIFF'), [0x24, 0, 0, 0], ascii('WAVE'))), null)
})

test('BMP 的 BM 头要求文件至少 14 字节——两字节的 BM 太弱，不足以判定', () => {
  assert.equal(detectImageFormat(BMP), 'bmp')
  assert.equal(detectImageFormat(ascii('BM')), null)
  assert.equal(detectImageFormat(concat(ascii('BM'), [0, 0, 0, 0])), null)
})

test('TIFF 的两种字节序与 BigTIFF', () => {
  assert.equal(detectImageFormat(TIFF_LE), 'tiff')
  assert.equal(detectImageFormat(TIFF_BE), 'tiff')
  assert.equal(detectImageFormat(BIG_TIFF), 'tiff')
})

test('AVIF 认主品牌，也认兼容品牌列表里的 avif', () => {
  assert.equal(detectImageFormat(AVIF), 'avif')
  assert.equal(detectImageFormat(AVIF_COMPAT), 'avif')
})

test('HEIC 单独认出来，好在提示里说清「实际是 HEIC」', () => {
  assert.equal(detectImageFormat(HEIC), 'heic')
})

test('ftyp 但不是图片格式（mp4）不算图片', () => {
  assert.equal(detectImageFormat(MP4), null)
})

test('SVG 是文本：裸 <svg>、带 XML 声明与注释、带 BOM 与空白的都认', () => {
  assert.equal(detectImageFormat(SVG), 'svg')
  assert.equal(detectImageFormat(SVG_WITH_PROLOG), 'svg')
  assert.equal(detectImageFormat(SVG_WITH_BOM), 'svg')
})

test('不是 svg 元素的 XML 不当成 SVG', () => {
  assert.equal(
    detectImageFormat(concat(ascii('<?xml version="1.0"?>'), ascii('<plist></plist>'))),
    null
  )
})

test('空文件认不出格式', () => {
  assert.equal(detectImageFormat(bytes()), null)
  assert.equal(detectImageFormat(new Uint8Array(0)), null)
})

test('签名被截断时不算认出来（宁可说不认识，也不要误判成图片）', () => {
  assert.equal(detectImageFormat(PNG.subarray(0, 7)), null)
  assert.equal(detectImageFormat(bytes(0xff, 0xd8)), null)
  assert.equal(detectImageFormat(concat(ascii('GIF8'))), null)
  assert.equal(detectImageFormat(concat(ascii('RIFF'), [0x24, 0, 0, 0], ascii('WEB'))), null)
  assert.equal(detectImageFormat(concat([0x49, 0x49, 0x2a])), null)
  assert.equal(detectImageFormat(concat([0x00, 0x00, 0x00, 0x1c], ascii('ftyp'))), null)
  assert.equal(detectImageFormat(concat(ascii('<'))), null)
})

test('纯文本、代码、PDF、ZIP 都不算图片', () => {
  assert.equal(detectImageFormat(ascii('hello world\n')), null)
  assert.equal(detectImageFormat(ascii('import os\nprint("hi")\n')), null)
  assert.equal(detectImageFormat(ascii('%PDF-1.7\n')), null)
  assert.equal(detectImageFormat(bytes(0x50, 0x4b, 0x03, 0x04)), null)
})

test('已知局限：以 BM 开头且不短于 14 字节的文本会被当成 BMP', () => {
  // 'BM' 只有两字节，靠「长度 >= 14」挡掉常见的 BM 开头文本；
  // 更长的（如 'BMatrix: 1 0 0'）仍会误判。代价是这种文件被要求转成 JPG / PNG，可以接受。
  assert.equal(detectImageFormat(ascii('BM')), null)
  assert.equal(detectImageFormat(ascii('BMatrix: 1 0 0')), 'bmp')
})

test('扩展名到声明格式：JPEG / PNG 的别名共用一个格式', () => {
  assert.equal(imageFormatByExt('jpg'), 'jpeg')
  assert.equal(imageFormatByExt('JPEG'), 'jpeg')
  assert.equal(imageFormatByExt('jpe'), 'jpeg')
  assert.equal(imageFormatByExt('jfif'), 'jpeg')
  assert.equal(imageFormatByExt('pjpeg'), 'jpeg')
  assert.equal(imageFormatByExt('pjp'), 'jpeg')
  // apng 是 PNG 的动画扩展，字节头就是 PNG
  assert.equal(imageFormatByExt('apng'), 'png')
  assert.equal(imageFormatByExt('png'), 'png')
  assert.equal(imageFormatByExt('webp'), 'webp')
  assert.equal(imageFormatByExt('gif'), 'gif')
  assert.equal(imageFormatByExt('bmp'), 'bmp')
  assert.equal(imageFormatByExt('tif'), 'tiff')
  assert.equal(imageFormatByExt('svg'), 'svg')
})

test('非图片扩展名不是图片：代码、文档、数据文件都不该触发内容读取', () => {
  for (const ext of ['py', 'ts', 'txt', 'md', 'pdf', 'docx', 'xlsx', 'json', 'csv', 'epub', '']) {
    assert.equal(imageFormatByExt(ext), null, `${ext} 不该被当成图片扩展名`)
  }
})

test('内容与声明一致且格式受支持：可以发送', () => {
  for (const [declared, head] of [
    ['jpeg', JPEG],
    ['png', PNG],
    ['gif', GIF89],
    ['webp', WEBP],
  ] as const) {
    assert.deepEqual(checkImageContent(declared, head), { issue: null, actual: declared })
  }
})

test('声明 jpeg、内容其实是 PNG：报「扩展名与内容不一致」', () => {
  assert.deepEqual(checkImageContent('jpeg', PNG), { issue: 'mismatch', actual: 'png' })
})

test('声明 png、内容其实是 WebP：同样是不一致', () => {
  assert.deepEqual(checkImageContent('png', WEBP), { issue: 'mismatch', actual: 'webp' })
})

test('真实格式服务端不认（BMP / TIFF / AVIF / HEIC / SVG）：拦下并说明实际格式', () => {
  for (const [declared, head, actual] of [
    ['jpeg', BMP, 'bmp'],
    ['jpeg', TIFF_LE, 'tiff'],
    ['png', AVIF, 'avif'],
    ['png', HEIC, 'heic'],
    ['svg', SVG, 'svg'],
  ] as const) {
    // 声明格式与实际格式不一致时，服务端能力优先：真正拦住它的是「不认这种格式」
    const verdict = checkImageContent(declared, head)
    assert.equal(verdict.issue, 'unsupported')
    assert.equal(verdict.actual, actual)
  }
})

test('没有图片扩展名（只有 MIME 说是图片）时只按真实格式判断', () => {
  assert.deepEqual(checkImageContent(null, JPEG), { issue: null, actual: 'jpeg' })
  assert.deepEqual(checkImageContent(null, BMP), { issue: 'unsupported', actual: 'bmp' })
  assert.deepEqual(checkImageContent(null, ascii('hello')), { issue: 'notImage', actual: null })
})

test('伪装成图片的非图片内容：认不出就是认不出', () => {
  assert.deepEqual(checkImageContent('png', ascii('hello world')), {
    issue: 'notImage',
    actual: null,
  })
  assert.deepEqual(checkImageContent('jpg', new Uint8Array(0)), { issue: 'notImage', actual: null })
  assert.deepEqual(checkImageContent('jpg', PNG.subarray(0, 4)), {
    issue: 'notImage',
    actual: null,
  })
})

test('提示文案：三种问题各自带上文件名与实际格式', () => {
  assert.deepEqual(describeImageContent('a.png', checkImageContent('png', ascii('x'))), {
    key: 'uploadImageInvalid',
    params: { name: 'a.png' },
  })
  assert.deepEqual(describeImageContent('b.jpg', checkImageContent('jpeg', WEBP)), {
    key: 'uploadImageFormatMismatch',
    params: { name: 'b.jpg', format: 'WebP', ext: 'webp' },
  })
  assert.deepEqual(describeImageContent('b.jpg', checkImageContent('jpeg', PNG)), {
    key: 'uploadImageFormatMismatch',
    params: { name: 'b.jpg', format: 'PNG', ext: 'png' },
  })
  assert.deepEqual(describeImageContent('c.png', checkImageContent('png', BMP)), {
    key: 'uploadImageFormatUnsupported',
    params: { name: 'c.png', format: 'BMP' },
  })
  assert.equal(describeImageContent('d.png', checkImageContent('png', PNG)), null)
})

test('可以发送的格式与文案标签一一对上：新增格式不会漏文案', () => {
  for (const format of SENDABLE_IMAGE_FORMATS) {
    assert.equal(typeof IMAGE_FORMAT_LABEL[format], 'string')
    assert.notEqual(IMAGE_FORMAT_LABEL[format], '')
  }
  assert.deepEqual([...SENDABLE_IMAGE_FORMATS].sort(), ['gif', 'jpeg', 'png', 'webp'])
})

test('白名单里的图片扩展名，声明的格式必须是服务端支持的', () => {
  for (const ext of SENDABLE_IMAGE_EXTS) {
    assert.ok(ACCEPT_FILE_EXTS.includes(ext), `${ext} 声明可发送，却不在上传白名单里`)
    const format = imageFormatByExt(ext)
    if (format === null) {
      assert.fail(`${ext} 应是图片扩展名，但没在 imageFormat 的扩展名表里`)
    }
    assert.ok(
      SENDABLE_IMAGE_FORMATS.includes(format),
      `${ext} 声明的格式 ${format} 不在服务端支持集里`
    )
  }
})

test('服务端不认的图片扩展名已从白名单里去掉', () => {
  for (const ext of [
    'bmp',
    'tif',
    'tiff',
    'svg',
    'svgz',
    'ico',
    'raw',
    'avif',
    'avifs',
    'cur',
    'dib',
    'xbm',
  ]) {
    assert.ok(
      !ACCEPT_FILE_EXTS.includes(ext),
      `${ext} 仍在上传白名单里，会让整条消息在发送阶段失败`
    )
  }
})

test('非图片扩展名一个没动：代码、文本、文档、数据格式照旧可上传', () => {
  for (const ext of [
    'py',
    'ts',
    'js',
    'c',
    'go',
    'rs',
    'txt',
    'md',
    'json',
    'csv',
    'pdf',
    'docx',
    'pptx',
    'xlsx',
    'epub',
    'hdf',
    'fits',
    'grib',
  ]) {
    assert.ok(ACCEPT_FILE_EXTS.includes(ext), `${ext} 被误删了`)
  }
})

test('白名单没有重复项', () => {
  assert.equal(new Set(ACCEPT_FILE_EXTS).size, ACCEPT_FILE_EXTS.length)
})

/** 线上真实报错：长会话里第 47 个内容块的图片格式不被接受 */
const REAL_UNSUPPORTED_IMAGE =
  'messages.560.content.47: You have uploaded an unsupported image. Please make sure your image is valid and in a supported image format.'

test('发送阶段拒绝图片：换成中文提示，并从报错里取出内容块序号', () => {
  assert.deepEqual(describeParseFailed(REAL_UNSUPPORTED_IMAGE), {
    key: 'replyImageUnsupportedAt',
    params: { position: 47 },
  })
})

test('取不到内容块序号时只给通用提示', () => {
  assert.deepEqual(
    describeParseFailed('You have uploaded an unsupported image. Please check the format.'),
    { key: 'replyImageUnsupported' }
  )
  assert.deepEqual(
    describeParseFailed('messages.560.content.x: The image is too large to process'),
    {
      key: 'replyImageUnsupported',
    }
  )
})

test('文档类失败不建议转成 JPG / PNG（加密的 PDF 转图片也没用）', () => {
  assert.deepEqual(describeParseFailed('messages.12.content.0: The file is password-protected.'), {
    key: 'replyAttachmentUnreadableAt',
    params: { position: 0 },
  })
  assert.deepEqual(describeParseFailed('Failed to recognize the file'), {
    key: 'replyAttachmentUnreadable',
  })
})
