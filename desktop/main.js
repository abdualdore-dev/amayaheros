// Amaya Heroes desktop: a window around the live app, with silent slip printing.
const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_URL = 'https://abdualdore-dev.github.io/amayaheros/';
const APP_ORIGIN = new URL(APP_URL).origin;
let win = null, tray = null, quitting = false;
const HIDDEN = process.argv.includes('--hidden');
app.setAppUserModelId('Amaya Heroes');

const cfgFile = () => path.join(app.getPath('userData'), 'desktop.json');
const cfgRead = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; } };
const cfgWrite = c => { try { fs.writeFileSync(cfgFile(), JSON.stringify(c)); } catch (e) {} };

if (!app.requestSingleInstanceLock()) app.quit();
function showWin() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
app.on('second-instance', () => showWin());
const autoStart = () => { try { return app.getLoginItemSettings().openAtLogin; } catch (e) { return false; } };
const setAutoStart = on => { try { app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] }); } catch (e) {} };

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
      { label: 'يشتغل ويه تشغيل الكمبيوتر', type: 'checkbox', checked: autoStart(), click: m => setAutoStart(m.checked) },
      { type: 'separator' },
      { label: 'إيقاف التطبيق نهائياً', click: () => { quitting = true; app.quit(); } },
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => { win.maximize(); if (!HIDDEN) win.show(); });
  // closing the window keeps the app running next to the clock, so notifications keep arriving
  win.on('close', e => {
    if (quitting) return;
    e.preventDefault(); win.hide();
    const c = cfgRead();
    if (!c.trayTold && tray) { c.trayTold = 1; cfgWrite(c); try { tray.displayBalloon({ title: 'Amaya Heroes', content: 'التطبيق بعده شغال يم الساعة حتى توصلك الإشعارات. للإيقاف: كليك يمين على الأيقونة ثم إيقاف.' }); } catch (x) {} }
  });
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
ipcMain.handle('amaya-show', e => { if (win && e.sender === win.webContents) showWin(); return true; });
function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('Amaya Heroes');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'فتح Amaya Heroes', click: () => showWin() },
    { type: 'separator' },
    { label: 'إيقاف التطبيق نهائياً', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => showWin());
}
app.on('before-quit', () => { quitting = true; });
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
  const c = cfgRead();
  if (!c.autoSet) { c.autoSet = 1; cfgWrite(c); setAutoStart(true); }
  createTray();
  createWindow();
});
app.on('window-all-closed', () => { if (quitting) app.quit(); });
