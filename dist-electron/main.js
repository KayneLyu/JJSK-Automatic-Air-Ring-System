import { ipcMain, app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
function setupRendererCommunicator(win2) {
  win2.webContents.on("did-finish-load", () => {
    win2.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  ipcMain.on("win-minimize", () => {
    win2.minimize();
  });
  ipcMain.on("win-maximize", () => {
    const windowIsMax = win2.isMaximized();
    if (windowIsMax) {
      win2.restore();
    } else {
      win2.maximize();
    }
  });
  ipcMain.on("win-close", () => {
    app.quit();
  });
}
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    autoHideMenuBar: true,
    width: 1280,
    height: 1024,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs")
    }
  });
  if (win) {
    setupRendererCommunicator(win);
  }
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const newHeaders = {
      ...details.responseHeaders,
      "Content - Security - Policy": "default - src 'self'; connect - src 'self' http://localhost:10010"
    };
    callback({ responseHeaders: newHeaders });
  });
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(createWindow);
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
