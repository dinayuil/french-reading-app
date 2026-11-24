const { createHash } = require('node:crypto');
const { promises: fs } = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, Menu, protocol, session, shell } = require('electron');
const { requestWebDav } = require('./webdav.cjs');

const APP_URL = 'frp://desktop/';
const APP_NAME = 'Lire en français';
const DIST = path.join(__dirname, '..', 'dist');
const ASSETS = path.join(DIST, 'assets');
const ASSET_TYPES = { '.js': 'text/javascript', '.css': 'text/css' };

protocol.registerSchemesAsPrivileged([{
  scheme: 'frp',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

function appUrl(rawUrl) {
  const url = URL.parse(rawUrl);
  return url?.protocol === 'frp:' && url.host === 'desktop' && !url.username && !url.password
    ? url
    : null;
}

async function serveApp() {
  // Electron reads the same paths from the ASAR archive in the installed app.
  if (!(await fs.lstat(DIST)).isDirectory() || !(await fs.lstat(ASSETS)).isDirectory()) {
    throw new Error('The Windows app requires a Vite build.');
  }
  const indexPath = path.join(DIST, 'index.html');
  if (!(await fs.lstat(indexPath)).isFile()) throw new Error('Missing Vite index.html.');
  const html = (await fs.readFile(indexPath, 'utf8')).replace(/\r\n?/g, '\n');
  const inlineHashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, source]) =>
    `'sha256-${createHash('sha256').update(source).digest('base64')}'`,
  );
  const csp = [
    "default-src 'none'",
    `script-src 'self' ${inlineHashes.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "connect-src 'self' https:",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join('; ');

  const assetTypes = new Map();
  for (const file of await fs.readdir(ASSETS, { withFileTypes: true })) {
    const type = ASSET_TYPES[path.extname(file.name)];
    if (file.isFile() && type) assetTypes.set(`/assets/${file.name}`, type);
  }

  protocol.handle('frp', async (request) => {
    const url = appUrl(request.url);
    if (!url || request.method !== 'GET') return new Response(null, { status: 404 });
    const headers = { 'X-Content-Type-Options': 'nosniff' };
    const type = assetTypes.get(url.pathname);
    if (type) {
      const asset = await fs.readFile(path.join(ASSETS, path.posix.basename(url.pathname)));
      return new Response(asset, { headers: { ...headers, 'Content-Type': type } });
    }
    const isNavigation = request.headers.get('accept')?.includes('text/html');
    if (url.pathname.startsWith('/assets/') || !isNavigation) {
      return new Response(null, { status: 404 });
    }
    return new Response(html, {
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp },
    });
  });
}

function openInBrowser(rawUrl) {
  const url = URL.parse(rawUrl);
  if ((url?.protocol === 'https:' || url?.protocol === 'http:') && !url.username && !url.password) {
    void shell.openExternal(url.href).catch(() => undefined);
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 460,
    minHeight: 500,
    show: false,
    title: APP_NAME,
    backgroundColor: '#fbf9f4',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const contents = window.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: 'deny' };
  });
  contents.on('will-frame-navigate', (event) => {
    if (event.isMainFrame && appUrl(event.url)) return;
    event.preventDefault();
    if (event.isMainFrame) openInBrowser(event.url);
  });
  contents.on('will-redirect', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  return window.loadURL(APP_URL);
}

app.setName(APP_NAME);
app.setAppUserModelId('cc.yosorano.frenchreading');

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.on('window-all-closed', () => app.quit());

  ipcMain.handle('french-reading-desktop:webdav-request', (event, options) => {
    const frame = event.senderFrame;
    if (!frame || frame !== event.sender.mainFrame || !appUrl(frame.url)) {
      throw new Error('WebDAV request rejected.');
    }
    return requestWebDav(options);
  });

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, reply) => reply(false));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'fileMenu' },
      { role: 'editMenu' },
      { label: 'Affichage', submenu: [
        { label: 'Retour', accelerator: 'Alt+Left', click: (_item, window) => window?.webContents.navigationHistory.goBack() },
        { role: 'reload' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
      ] },
    ]));
    await serveApp();
    await createWindow();
  }).catch((error) => {
    console.error('Unable to start the Windows app.', error);
    app.quit();
  });
} else {
  app.quit();
}
