// Overlay-Fenster: bekommt nur die Anzeige-Daten (wer spricht), sonst nichts
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lumoOverlay', { onData: f => ipcRenderer.on('ov:data', (_e, d) => f(d)) });
