import { ipcMain as i, app as o, dialog as d, globalShortcut as h, BrowserWindow as f } from "electron";
import { fileURLToPath as R } from "node:url";
import t from "node:path";
import a from "fs";
import { spawn as _, execSync as v } from "child_process";
function w(e) {
  _(e, [], {
    detached: !0,
    windowsHide: !0,
    cwd: "D:/server/"
  }).unref();
}
function E(e) {
  try {
    return v(`tasklist /FI "IMAGENAME eq ${e}.exe"`).includes(e);
  } catch (r) {
    return console.error(r), !1;
  }
}
function m(e, r, s) {
  try {
    return E(e) ? !1 : (w(r), !0);
  } catch (u) {
    s.showErrorBox(`Error checking or running ${e}:`, u + "");
  }
}
function I(e) {
  e.webContents.on("did-finish-load", () => {
    e.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), i.on("win-minimize", () => {
    e.minimize();
  }), i.on("win-maximize", () => {
    e.isMaximized() ? e.restore() : e.maximize();
  }), i.on("win-close", () => {
    o.quit();
  }), i.on("win-toggle-fullscreen", () => {
    e && e.setFullScreen(!e.isFullScreen());
  }), i.handle("win-get-logo", (r, s, u) => {
    if (e)
      try {
        const c = a.readFileSync("D:/logo/logo.png");
        return c ? `data:image/png;base64,${Buffer.from(c).toString("base64")}` : void 0;
      } catch {
      }
  }), i.handle("win-open-client", () => {
    try {
      return m("JinJiu.Scan.Client2", "D:/server/JinJiu.Scan.Client2.exe", d);
    } catch {
    }
  });
}
const p = t.dirname(R(import.meta.url));
process.env.APP_ROOT = t.join(p, "..");
const l = process.env.VITE_DEV_SERVER_URL, y = t.join(process.env.APP_ROOT, "dist-electron"), g = t.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = l ? t.join(process.env.APP_ROOT, "public") : g;
let n;
function S() {
  n = new f({
    icon: t.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    autoHideMenuBar: !0,
    width: 1280,
    height: 1024,
    frame: !1,
    webPreferences: {
      preload: t.join(p, "preload.mjs")
    }
  }), n && I(n), l ? n.loadURL(l) : n.loadFile(t.join(g, "index.html"));
}
const D = o.requestSingleInstanceLock();
D ? o.on("second-instance", (e) => {
  n && (n.isMinimized() && n.restore(), n.focus());
}) : o.quit();
o.on("ready", () => {
  m("JinJiu.Scan.Server2", "D:/server/JinJiu.Scan.Server2.exe", d), o.setLoginItemSettings({
    openAtLogin: !0
  });
});
o.on("will-finish-launching", () => {
  a.existsSync("D:/JJSK_Data") || a.mkdirSync("D:/JJSK_Data"), o.setPath("appData", "D:/JJSK_Data");
});
o.on("before-quit", () => {
  n == null || n.removeAllListeners("close"), h.unregisterAll(), n == null || n.close();
});
o.on("window-all-closed", () => {
  process.platform !== "darwin" && (o.quit(), n = null);
});
o.on("activate", () => {
  f.getAllWindows().length === 0 && S();
});
o.whenReady().then(S);
export {
  y as MAIN_DIST,
  g as RENDERER_DIST,
  l as VITE_DEV_SERVER_URL
};
