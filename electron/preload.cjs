const { contextBridge, ipcRenderer, webUtils } = require('electron')
contextBridge.exposeInMainWorld('fengshaDesktop', {
  // Electron 32+ 移除了 File.path，拖拽拿真实路径只能走 webUtils
  pathForFile: file => webUtils.getPathForFile(file),
  chooseDirectory: () => ipcRenderer.invoke('choose-directory'),
  detectGame: () => ipcRenderer.invoke('detect-game'),
  inspectGame: root => ipcRenderer.invoke('inspect-game', root),
  scanMods: root => ipcRenderer.invoke('scan-mods', root),
  inspectModSource: (root, source) => ipcRenderer.invoke('inspect-mod-source', root, source),
  writeModsFile: (root, states) => ipcRenderer.invoke('write-mods', root, states),
  setPakEnabled: (root, type, name, enabled) => ipcRenderer.invoke('set-pak-enabled', root, type, name, enabled),
  modExists: (root, name) => ipcRenderer.invoke('mod-exists', root, name),
  installMod: (...args) => ipcRenderer.invoke('install-mod', ...args),
  installWork: (root, options) => ipcRenderer.invoke('install-work', root, options),
  onInstallWorkProgress: callback => {
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('install-work-progress', listener)
    return () => ipcRenderer.removeListener('install-work-progress', listener)
  },
  launchGame: () => ipcRenderer.invoke('launch-game'),
  checkAgent: origin => ipcRenderer.invoke('agent-check', origin),
  chatWithAgent: (origin, model, messages, gameRoot) => ipcRenderer.invoke('agent-chat', origin, model, messages, gameRoot),
  getCloudConfig: () => ipcRenderer.invoke('cloud-config'),
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: version => ipcRenderer.invoke('download-update', version),
  applyUpdate: () => ipcRenderer.invoke('apply-update'),
  onUpdateDownloadProgress: callback => {
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('update-download-progress', listener)
    return () => ipcRenderer.removeListener('update-download-progress', listener)
  },
  copyText: text => ipcRenderer.invoke('copy-text', text),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  openPath: target => ipcRenderer.invoke('open-path', target)
})
