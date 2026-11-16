import { useEffect } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { closeSearchPanel, useSearchPanel } from '../components/search/searchPanelState.js'
import { closeSettings, useSettingsDialog } from '../components/settings/settingsDialogState.js'
import { closeMobileSider, useMobileSider } from '../components/sider/mobileSiderState.js'
import { newChat, useChatStore } from '../services/chat/store.js'
import { useTheme } from './theme.js'

/**
 * Capacitor 8 内置的 SystemBars 插件。注意它的语义与旧 StatusBar 插件相反：
 * DARK = 深色背景配浅色图标，LIGHT = 浅色背景配深色图标。
 */
type SystemBarsPlugin = {
  setStyle(options: {
    style: 'LIGHT' | 'DARK' | 'DEFAULT'
    bar?: 'StatusBar' | 'NavigationBar'
  }): Promise<void>
}

const SystemBars = registerPlugin<SystemBarsPlugin>('SystemBars')

/**
 * 安卓返回键：按「最上层先关」的顺序处理，只有什么都不开着时才退出应用。
 * 不接管的话按一次返回就直接杀进程，会话里没发出去的内容会丢。
 */
const handleBack = () => {
  if (useSettingsDialog.getState().open) {
    closeSettings()
    return
  }
  if (useSearchPanel.getState().entry !== null) {
    closeSearchPanel()
    return
  }
  if (useMobileSider.getState().open) {
    closeMobileSider()
    return
  }
  if (useChatStore.getState().activeId !== null) {
    newChat()
    return
  }
  void NativeApp.exitApp()
}

/** 原生外壳：接管返回键，并让系统状态栏随深浅主题切换图标颜色 */
export const useNativeShell = () => {
  const native = Capacitor.isNativePlatform()
  const theme = useTheme()

  useEffect(() => {
    if (!native) {
      return
    }
    const listener = NativeApp.addListener('backButton', handleBack)
    return () => {
      void listener.then((handle) => handle.remove())
    }
  }, [native])

  useEffect(() => {
    if (!native) {
      return
    }
    void SystemBars.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' }).catch(() => {})
  }, [native, theme])
}
