// Lumo Desktop (Electron)
// Öffnet https://lumo-chatcom.netlify.app in einem eigenen Fenster. Neue Lumo-Versionen auf der Website kommen automatisch an.
// Erst ein kleines Anmelde-Fenster, danach das große Lumo-Fenster.
// Beim Schließen läuft Lumo unten rechts in der Taskleiste weiter, damit Benachrichtigungen ankommen.
const { app, BrowserWindow, shell, session, desktopCapturer, Menu, ipcMain, nativeImage, Tray, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

if (require('electron-squirrel-startup')) { app.quit(); return; }
if (!app.requestSingleInstanceLock()) { app.quit(); return; }
app.setAppUserModelId('com.squirrel.lumo.Lumo');

const SITE = 'https://lumo-chatcom.netlify.app/';
const ORIGIN = new URL(SITE).origin;
const ICON = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
const BG = '#05090a';
let authWin = null, mainWin = null, picked = null, tray = null, quitting = false, trayHinted = false;

// Automatische Updates der App selbst (über GitHub-Releases von anonym77701-ui/lumo-app)
try {
  const repo = (require('./package.json').repository || '').replace(/^github:/, '');
  if (app.isPackaged && repo) require('update-electron-app').updateElectronApp({ repo, updateInterval: '1 hour', notifyUser: true });
} catch (_) { }

const boundsFile = () => path.join(app.getPath('userData'), 'window.json');
const loadBounds = () => { try { return JSON.parse(fs.readFileSync(boundsFile(), 'utf8')) } catch (_) { return null } };
const saveBounds = w => { try { fs.writeFileSync(boundsFile(), JSON.stringify({ ...w.getNormalBounds(), max: w.isMaximized() })) } catch (_) { } };
const prefs = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: true, backgroundThrottling: false };

function common(w) {
  w.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN) && !url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
  w.webContents.on('did-fail-load', (e, code, desc, url, isMain) => { if (isMain && code !== -3) w.loadFile(path.join(__dirname, 'offline.html'), { query: { to: url } }); });
  w.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F12' || (i.control && i.shift && i.key.toLowerCase() === 'i')) w.webContents.toggleDevTools();
    if (i.control && i.key.toLowerCase() === 'r') w.webContents.reload();
  });
}
function showMain() {
  const w = mainWin || authWin;
  if (!w) return openAuth();
  if (w.isMinimized()) w.restore();
  w.show(); w.focus();
}
function makeTray() {
  if (tray) return;
  tray = new Tray(ICON.resize({ width: 16, height: 16 }));
  tray.setToolTip('Lumo');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Lumo öffnen', click: showMain },
    { type: 'separator' },
    { label: 'Lumo beenden', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showMain);
  tray.on('double-click', showMain);
}
function openAuth() {
  if (authWin) { authWin.show(); authWin.focus(); return; }
  authWin = new BrowserWindow({ width: 460, height: 680, resizable: false, maximizable: false, fullscreenable: false, backgroundColor: BG, title: 'Lumo', icon: ICON, show: false,
    titleBarStyle: 'hidden', titleBarOverlay: { color: BG, symbolColor: '#9fb8b4', height: 34 }, webPreferences: prefs });
  authWin.loadURL(SITE + '?app=1&win=auth');
  authWin.once('ready-to-show', () => authWin.show());
  authWin.on('closed', () => { authWin = null; if (!mainWin && !quitting) app.quit(); });
  common(authWin);
}
function openMain(isNew) {
  if (mainWin) { showMain(); return; }
  const b = loadBounds() || {};
  mainWin = new BrowserWindow({ width: b.width || 1280, height: b.height || 800, x: b.x, y: b.y, minWidth: 940, minHeight: 560, backgroundColor: BG, title: 'Lumo', icon: ICON, show: false, autoHideMenuBar: true, webPreferences: prefs });
  mainWin.loadURL(SITE + '?app=1' + (isNew ? '&new=1' : ''));
  mainWin.once('ready-to-show', () => { if (b.max) mainWin.maximize(); mainWin.show(); mainWin.focus(); if (authWin) { const a = authWin; authWin = null; a.destroy(); } });
  // Schließen = in die Taskleiste (unten rechts). Wirklich beenden über Rechtsklick auf das Lumo-Symbol.
  mainWin.on('close', e => {
    saveBounds(mainWin);
    if (quitting) return;
    e.preventDefault(); mainWin.hide();
    if (!trayHinted && Notification.isSupported()) {
      trayHinted = true;
      new Notification({ title: 'Lumo läuft weiter', body: 'Lumo ist unten rechts in der Taskleiste. So bekommst du weiter Nachrichten. Rechtsklick auf das Symbol → Beenden.', icon: ICON }).show();
    }
  });
  mainWin.on('closed', () => { mainWin = null; });
  common(mainWin);
  makeTray();
}

// Die alte Lumo-App (Lumo-Setup.exe vor 2.0) automatisch entfernen, damit es nur noch eine Lumo-App gibt
function removeOldApp() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const la = process.env.LOCALAPPDATA, ad = process.env.APPDATA, up = process.env.USERPROFILE;
  if (!la) return;
  const oldDir = path.join(la, 'Programs', 'Lumo'), oldExe = path.join(oldDir, 'Lumo.exe');
  const isOld = t => !!t && /\\Programs\\Lumo\\Lumo\.exe$/i.test(t);
  const stub = path.resolve(path.dirname(process.execPath), '..', 'Lumo.exe');   // Startdatei der neuen App
  const links = [path.join(up || '', 'Desktop', 'Lumo.lnk'), path.join(ad || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Lumo.lnk')];
  try { const d = app.getPath('desktop'); if (!links.includes(path.join(d, 'Lumo.lnk'))) links.push(path.join(d, 'Lumo.lnk')) } catch (_) { }
  for (const l of links) {
    try {
      if (!fs.existsSync(l)) continue;
      const t = shell.readShortcutLink(l).target;
      if (!isOld(t)) continue;
      if (/Start Menu/i.test(l)) fs.rmSync(l, { force: true });
      else if (fs.existsSync(stub)) shell.writeShortcutLink(l, 'replace', { target: stub, cwd: path.dirname(stub), icon: stub, iconIndex: 0, appUserModelId: 'com.squirrel.lumo.Lumo', description: 'Lumo' });
    } catch (_) { }
  }
  if (!fs.existsSync(oldExe)) return;
  const cp = require('child_process');
  const ps = "Get-Process -Name Lumo -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*\\Programs\\Lumo\\Lumo.exe' } | Stop-Process -Force";
  cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], { windowsHide: true }, () => {
    setTimeout(() => {
      try { fs.rmSync(oldDir, { recursive: true, force: true }) } catch (_) { }
      const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Lumo';
      cp.execFile('reg', ['query', key, '/v', 'UninstallString'], { windowsHide: true }, (e, out) => {
        if (!e && /Programs\\Lumo\\Lumo\.exe/i.test(String(out))) cp.execFile('reg', ['delete', key, '/f'], { windowsHide: true }, () => { });
      });
    }, 1500);
  });
}

ipcMain.on('lumo:authed', (_e, isNew) => { if (!mainWin) openMain(!!isNew); });
ipcMain.on('lumo:loggedOut', () => { if (mainWin) { const w = mainWin; mainWin = null; saveBounds(w); w.destroy(); } openAuth(); });
ipcMain.on('lumo:show', showMain);
ipcMain.on('lumo:badge', (_e, n) => { try { app.setBadgeCount(n) } catch (_) { } if (tray) tray.setToolTip(n ? `Lumo – ${n} ungelesen` : 'Lumo'); if (mainWin && process.platform === 'win32') mainWin.flashFrame(!!n && !mainWin.isFocused()); });
ipcMain.handle('lumo:version', () => app.getVersion());
// Spielerkennung: laufende Programme (bleibt auf dem PC, nur Lumo sieht die Namen)
ipcMain.handle('lumo:procs', () => new Promise(res => {
  if (process.platform !== 'win32') return res([]);
  require('child_process').execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 4 << 20 }, (err, out) => {
    if (err) return res([]);
    const s = new Set();
    String(out).split(/\r?\n/).forEach(l => { const m = l.match(/^"([^"]+)"/); if (m) s.add(m[1].toLowerCase()); });
    res([...s]);
  });
}));
// Bildschirm teilen: Fenster und Bildschirme mit Live-Vorschau, wie bei Discord
ipcMain.handle('lumo:sources', async () => {
  const src = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 480, height: 270 }, fetchWindowIcons: true });
  return src.filter(s => !/^Lumo$/.test(s.name) || s.id.startsWith('screen')).map(s => ({
    id: s.id, name: s.id.startsWith('screen') ? (s.name === 'Entire screen' || s.name === 'Entire Screen' ? 'Gesamter Bildschirm' : s.name.replace(/^Screen/, 'Bildschirm')) : s.name,
    type: s.id.startsWith('screen') ? 'screen' : 'window', thumb: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '', icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : ''
  }));
});
ipcMain.handle('lumo:pick', (_e, id, audio) => { picked = { id, audio: !!audio, at: Date.now() }; return true; });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  // Mikrofon, Kamera, Bildschirm und Benachrichtigungen sind für Lumo immer erlaubt
  const ok = ['media', 'display-capture', 'notifications', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'speaker-selection'];
  const trusted = u => { try { return new URL(u).origin === ORIGIN } catch (_) { return false } };
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => cb(ok.includes(perm) && trusted(details.requestingUrl || wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => ok.includes(perm) && (trusted(origin) || trusted(wc ? wc.getURL() : '')));
  session.defaultSession.setDisplayMediaRequestHandler(async (req, cb) => {
    try {
      const src = await desktopCapturer.getSources({ types: ['window', 'screen'] });
      let s = picked && Date.now() - picked.at < 30000 ? src.find(x => x.id === picked.id) : null;
      if (!s) s = src.find(x => x.id.startsWith('screen')) || src[0];
      const withAudio = picked ? picked.audio : true;
      picked = null;
      cb(s ? { video: s, audio: withAudio && process.platform === 'win32' ? 'loopback' : undefined } : {});
    } catch (_) { cb({}); }
  });
  openAuth();
  setTimeout(removeOldApp, 4000);
});
app.on('second-instance', showMain);
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (quitting || !tray) app.quit(); });
