// Amaya Heroes desktop: a window around the live app, with silent slip printing.
const { app, BrowserWindow, Menu, shell, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_URL = 'https://abdualdore-dev.github.io/amayaheros/';
const APP_ORIGIN = new URL(APP_URL).origin;
let win = null;

const cfgFile = () => path.join(app.getPath('userData'), 'desktop.json');
const cfgRead = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; } };
const cfgWrite = c => { try { fs.writeFileSync(cfgFile(), JSON.stringify(c)); } catch (e) {} };

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function load() { win.loadURL(APP_URL).catch(() => {}); }

async function buildMenu() {
  let printers = [];
  try { printers = await win.webContents.getPrintersAsync(); } catch (e) {}
  const cur = cfgRead().printer || '';
  const pick = name => { const c = cfgRead(); c.printer = name; cfgWrite(c); buildMenu(); };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Amaya Heroes', submenu: [
      { label: 'تحديث الصفحة', accelerator: 'CmdOrCtrl+R', click: () => load() },
      { label: 'ملء الشاشة', accelerator: 'F11', click: () => win.setFullScreen(!win.isFullScreen()) },
      { type: 'separator' },
      { label: 'خروج', role: 'quit' },
    ] },
    { label: 'طابعة الوصولات', submenu: [
      { label: 'الطابعة الافتراضية للجهاز', type: 'radio', checked: !cur, click: () => pick('') },
      ...printers.map(p => ({ label: p.displayName || p.name, type: 'radio', checked: cur === p.name, click: () => pick(p.name) })),
      { type: 'separator' },
      { label: 'تحديث قائمة الطابعات', click: () => buildMenu() },
    ] },
    { label: 'عرض', submenu: [{ role: 'zoomIn', label: 'تكبير' }, { role: 'zoomOut', label: 'تصغير' }, { role: 'resetZoom', label: 'الحجم الأصلي' }] },
  ]));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 380, minHeight: 600, show: false, backgroundColor: '#efe9fb',
    icon: path.join(__dirname, 'icon.png'), title: 'Amaya Heroes',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('page-title-updated', e => e.preventDefault());

  // only the app itself runs inside the window; any other link opens in the normal browser
  const inApp = u => { try { return new URL(u).origin === APP_ORIGIN || u.startsWith('file://'); } catch (e) { return false; } };
  win.webContents.on('will-navigate', (e, u) => { if (!inApp(u)) { e.preventDefault(); if (/^https:\/\//.test(u)) shell.openExternal(u); } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => { if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'offline.html')); });
  win.webContents.on('did-finish-load', () => buildMenu());

  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    let ok = false; try { ok = new URL(details.requestingUrl || wc.getURL()).origin === APP_ORIGIN && ['notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permission); } catch (e) {}
    cb(ok);
  });
  load();
}

ipcMain.handle('amaya-retry', () => { load(); return true; });
ipcMain.handle('amaya-print', async (e, opts) => {
  if (!win || e.sender !== win.webContents) return { ok: false, error: 'bad sender' };
  try { if (new URL(e.sender.getURL()).origin !== APP_ORIGIN) return { ok: false, error: 'bad origin' }; } catch (x) { return { ok: false, error: 'bad origin' }; }
  const h = Math.max(40000, Math.min(2000000, Math.round(+(opts && opts.heightMicrons) || 150000)));
  const deviceName = cfgRead().printer || undefined;
  return new Promise(resolve => {
    try {
      win.webContents.print({ silent: true, printBackground: true, deviceName, margins: { marginType: 'none' }, pageSize: { width: 80000, height: h } },
        (success, reason) => resolve({ ok: !!success, error: success ? '' : String(reason || 'failed') }));
    } catch (err) { resolve({ ok: false, error: String(err && err.message || err) }); }
  });
});

app.whenReady().then(async () => {
  try { await session.defaultSession.clearCache(); } catch (e) {}
  createWindow();
});
app.on('window-all-closed', () => app.quit());
