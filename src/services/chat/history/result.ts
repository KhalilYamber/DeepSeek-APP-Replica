import type { TranslationMessage } from '../../../i18n/index.js'

/** 一次导入的计数：写入、因已存在跳过、因损坏跳过。 */
export type ImportCounts = {
  imported: number
  skipped: number
  failed: number
}

/**
 * 导入结果的提示文案。
 * 三种情况分开，是为了让「没有新对话」不显示成「已导入 0 个」，
 * 也让用户看得出跳过的原因是重复还是文件损坏。
 */
export const importMessage = (result: ImportCounts): TranslationMessage => {
  if (result.imported === 0) {
    return { key: 'historyImportedNothingNew', params: { skipped: result.skipped } }
  }
  const skipped = result.skipped + result.failed
  if (skipped > 0) {
    return { key: 'historyImportedWithSkipped', params: { imported: result.imported, skipped } }
  }
  return {
    key: result.imported === 1 ? 'historyImportedOne' : 'historyImported',
    params: { count: result.imported },
  }
}
