/**
 * 首启「使用前须知」是否已经看过。
 *
 * 按**设备**记，不按版本：装了旧版的老用户升级后没有这个标记，会看到一次。
 * 以后文案有实质变化、想再弹一次时，换个键名即可，不要按版本号反复弹。
 */
const KEY = 'chat-demo:disclaimer-ack'

export const isDisclaimerAcknowledged = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    // 存储不可用时干脆不弹，免得每次启动都拦一下
    return true
  }
}

export const acknowledgeDisclaimer = () => {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // 存不下就下次再弹，不影响使用
  }
}
