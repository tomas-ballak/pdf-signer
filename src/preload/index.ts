import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom API for Renderer
const api = {
  // Helper to get file path securely
  getPathForFile: (file: File) => {
    return webUtils.getPathForFile(file)
  },
  setTheme: (theme: 'system' | 'light' | 'dark') => {
    return ipcRenderer.invoke('theme:toggle', theme)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api) // Expose our custom API
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in d.ts if needed)
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
