import { ipcMain, app, dialog, globalShortcut, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "fs";
import { execSync, spawn } from "child_process";
function runAppInBackground(exePath) {
  const options = {
    detached: true,
    windowsHide: true,
    cwd: "D:/server/"
  };
  const child = spawn(exePath, [], options);
  child.unref();
}
function isExeRunning(exeName) {
  try {
    const output = execSync(`tasklist /FI "IMAGENAME eq ${exeName}.exe"`);
    return output.includes(exeName);
  } catch (error) {
    console.error(error);
    return false;
  }
}
function ensureServerRunning(exeName, exePath, dialog2) {
  try {
    if (!isExeRunning(exeName)) {
      runAppInBackground(exePath);
      return true;
    } else {
      return false;
    }
  } catch (error) {
    dialog2.showErrorBox(`Error checking or running ${exeName}:`, error + "");
  }
}
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
  ipcMain.on("win-toggle-fullscreen", () => {
    if (win2) {
      win2.setFullScreen(!win2.isFullScreen());
    }
  });
  ipcMain.handle("win-get-logo", (e, message, params) => {
    if (win2) {
      try {
        const imageBuffer = fs.readFileSync("D:/logo/logo.png");
        if (!imageBuffer) return;
        const base64Image = Buffer.from(imageBuffer).toString("base64");
        const imgSrc = `data:image/png;base64,${base64Image}`;
        return imgSrc;
      } catch (error) {
      }
    }
  });
  ipcMain.handle("win-open-client", () => {
    try {
      const result = ensureServerRunning("JinJiu.RScan.Client", "D:/server/JinJiu.RScan.Client.exe", dialog);
      return result;
    } catch (error) {
    }
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
}
const getLock = app.requestSingleInstanceLock();
if (!getLock) {
  app.quit();
} else {
  app.on("second-instance", (event) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}
app.on("ready", () => {
  ensureServerRunning("JinJiu.RScan.Server", "D:/server/JinJiu.RScan.Server.exe", dialog);
  app.setLoginItemSettings({
    openAtLogin: true
  });
});
app.on("will-finish-launching", () => {
  if (!fs.existsSync("D:/JJSK_Data")) {
    fs.mkdirSync("D:/JJSK_Data");
  }
  app.setPath("appData", "D:/JJSK_Data");
});
app.on("before-quit", () => {
  win == null ? void 0 : win.removeAllListeners("close");
  globalShortcut.unregisterAll();
  win == null ? void 0 : win.close();
});
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
