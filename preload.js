// Brücke zwischen der Lumo-Website und dem Desktop-Fenster
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lumoDesktop', {
  platform: process.platform,
  authed: isNew => ipcRenderer.send('lumo:authed', !!isNew),
  loggedOut: () => ipcRenderer.send('lumo:loggedOut'),
  getSources: () => ipcRenderer.invoke('lumo:sources'),
  pickSource: (id, audio) => ipcRenderer.invoke('lumo:pick', id, audio),
  getProcs: () => ipcRenderer.invoke('lumo:procs'),
  show: () => ipcRenderer.send('lumo:show'),
  badge: n => ipcRenderer.send('lumo:badge', n | 0),
  version: () => ipcRenderer.invoke('lumo:version')
});
