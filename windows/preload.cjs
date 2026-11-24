'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const WEBDAV_CHANNEL = 'french-reading-desktop:webdav-request';

/**
 * The desktop renderer gets exactly one capability: an explicit WebDAV
 * request function. Node, the rest of ipcRenderer, and unrelated IPC
 * channels stay outside the page.
 */
const desktopApi = Object.freeze({
  webdavRequest(options) {
    return ipcRenderer.invoke(WEBDAV_CHANNEL, options);
  },
});

contextBridge.exposeInMainWorld('frenchReadingDesktop', desktopApi);
