const pad = (value: number, length = 2): string => String(value).padStart(length, '0')

const toDate = (value: string | number | Date): Date | null => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const formatDate = (
  value: string | number | Date,
  separator: '/' | '-' = '-'
): string | null => {
  const date = toDate(value)
  if (!date) {
    return null
  }
  return [pad(date.getFullYear(), 4), pad(date.getMonth() + 1), pad(date.getDate())].join(separator)
}

export const monthKey = (value: string | number | Date): string | null => {
  const date = toDate(value)
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}` : null
}

/**
 * 字节 → 一位小数的 MB 字符串（如 `12.3`）。
 * 固定按 MB 报、不做单位自适应：导出进度里数字一路往上走才好读，中途换成 GB 反而看不清进度。
 */
export const formatMegabytes = (bytes: number): string =>
  (Math.max(0, bytes) / (1024 * 1024)).toFixed(1)
