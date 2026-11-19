import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import styles from './DisclaimerDialog.module.css'

/**
 * 首次启动的告知：非官方、费用、数据边界、模型会出错。
 * 设置里也挂着同一个（「使用前须知」→ 查看），文案只有一份。
 *
 * 正文自己带 max-height + overflow：base Modal 不滚动，内容多高它就多高。
 * 这样系统字体被放大时，最坏是文字要滑一下，按钮始终在滚动区外、点得到。
 */
export const DisclaimerDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useTranslate()
  return (
    <Modal title={t('disclaimerTitle')} onClose={onClose} footer={<Button onClick={onClose}>{t('disclaimerAck')}</Button>}>
      <div className={styles.body}>
        <p>{t('disclaimerOfficial')}</p>
        <p>{t('disclaimerFree')}</p>
        <p>{t('disclaimerData')}</p>
        <p>{t('disclaimerModel')}</p>
      </div>
    </Modal>
  )
}
