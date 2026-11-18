import { cityNames, regionCodes, regionNameOverrides, provinceNames } from './locationData.js'
import { createRegionFormatter, type RegionNameFormatter } from './regionName.js'

export { regionCodes } from './locationData.js'

export const provinces = Object.entries(provinceNames).map(([code, name]) => ({
  code,
  name,
  cities: Object.entries(cityNames)
    .filter(([city]) => city.startsWith(code.slice(0, 2)))
    .map(([code, name]) => ({ code, name })),
}))

export type UserLocation = {
  region: string
  province?: string
  city?: string
}

const regions = new Set(regionCodes)

// 惰性 + 缓存：旧内核上没有 Intl.DisplayNames，这一格永远是 null，地区名直接退回代码。
// 不在模块顶层 new 是硬要求——那会让整个主包在 Chrome 70–80 上求值阶段就崩，见 regionName.ts。
const regionFormatters = new Map<'zh-CN' | 'en-US', RegionNameFormatter | null>()
const formatterFor = (locale: 'zh-CN' | 'en-US'): RegionNameFormatter | null => {
  if (!regionFormatters.has(locale)) {
    regionFormatters.set(locale, createRegionFormatter(locale))
  }
  return regionFormatters.get(locale) ?? null
}

export const getRegionName = (code: string, locale: 'zh-CN' | 'en-US'): string =>
  regions.has(code)
    ? (regionNameOverrides[locale][code] ?? formatterFor(locale)?.of(code) ?? code)
    : ''

export const normalizeLocation = (value: unknown): UserLocation | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const location = value as Record<string, unknown>
  const { region, province, city } = location
  if (typeof region !== 'string' || !regions.has(region)) {
    return null
  }
  if (region !== 'CN') {
    return { region }
  }
  if (province === undefined) {
    return city === undefined ? { region } : null
  }
  const selectedProvince = provinces.find((item) => item.code === province)
  if (!selectedProvince) {
    return null
  }
  if (city === undefined) {
    return { region, province: selectedProvince.code }
  }
  const selectedCity = selectedProvince.cities.find((item) => item.code === city)
  return selectedCity ? { region, province: selectedProvince.code, city: selectedCity.code } : null
}
