import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.yang.adeepseek',
  appName: 'DS Echo',
  webDir: 'dist',
  // 不要在这里写 webContentsDebuggingEnabled: true。
  // Capacitor 的默认行为是 debug 构建自动开启、release 构建关闭；
  // 一旦写死，release 包也会对外开放 WebView 调试口，而 API Key 就存在本地存储里。
}

export default config
