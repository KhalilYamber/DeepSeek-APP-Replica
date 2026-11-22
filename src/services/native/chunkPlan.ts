/**
 * 原生写盘的分块计划。
 *
 * WebView 里只能把整段数据转成 base64 字符串交给 Capacitor 桥；一次交一整包的话，
 * 同一份数据在内存里会被复制三四份（base64 一份、桥的 JSON 一份、Java 侧 UTF-16 一份、
 * 解码出的 byte[] 一份），几十 MB 的历史就可能把进程撑死——用户看到的是 App 直接退出。
 *
 * 这里把大文件切成能独立解码的块（长度是 3 的倍数，base64 边界才不会错位），
 * 一块一块写盘，峰值内存只跟块大小有关，跟总大小无关。
 *
 * 阈值以下仍然一次写完：那是已经被验证过的老路，不给普通用户换代码。
 */

/** 3 MB：能被 3 整除（3,145,728 = 3 × 1,048,576），最后一块不需要对齐 */
export const CHUNK_BYTES = 3 * 1024 * 1024

/** 超过这个大小才走分块；以下一次写完 */
export const CHUNK_THRESHOLD = 8 * 1024 * 1024

export type WriteRange = { start: number; end: number }

export type WritePlan = { kind: 'single' } | { kind: 'chunks'; ranges: WriteRange[] }

export const planNativeWrite = (
  size: number,
  chunk = CHUNK_BYTES,
  threshold = CHUNK_THRESHOLD
): WritePlan => {
  if (chunk <= 0 || chunk % 3 !== 0) {
    throw new Error('chunk size must be a positive multiple of 3')
  }
  if (size <= threshold) {
    return { kind: 'single' }
  }
  const ranges: WriteRange[] = []
  for (let start = 0; start < size; start += chunk) {
    ranges.push({ start, end: Math.min(start + chunk, size) })
  }
  return { kind: 'chunks', ranges }
}
