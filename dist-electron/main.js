import { ipcMain as t, app as o, globalShortcut as p, BrowserWindow as d, dialog as S } from "electron";
import { fileURLToPath as h } from "node:url";
import r from "node:path";
import a from "fs";
import { spawn as R, execSync as _ } from "child_process";
function E(e) {
  e.webContents.on("did-finish-load", () => {
    e.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), t.on("win-minimize", () => {
    e.minimize();
  }), t.on("win-maximize", () => {
    e.isMaximized() ? e.restore() : e.maximize();
  }), t.on("win-close", () => {
    o.quit();
  }), t.on("win-toggle-fullscreen", () => {
    e && e.setFullScreen(!e.isFullScreen());
  }), t.handle("win-get-logo", (i, c, u) => {
    if (e)
      try {
        const s = a.readFileSync("D:/logo/logo.png");
        return s ? `data:image/png;base64,${Buffer.from(s).toString("base64")}` : void 0;
      } catch (s) {
        console.log("get logo error", s);
      }
  });
}
function I(e) {
  R(e, [], {
    detached: !0,
    windowsHide: !0,
    cwd: "D:/server/"
  }).unref();
}
function v(e) {
  try {
    return _(`tasklist /FI "IMAGENAME eq ${e}.exe"`).includes(e);
  } catch (i) {
    return console.error(i), !1;
  }
}
function w(e, i, c) {
  try {
    v(e) || I(i);
  } catch (u) {
    c.showErrorBox(`Error checking or running ${e}:`, u + "");
  }
}
const m = r.dirname(h(import.meta.url));
process.env.APP_ROOT = r.join(m, "..");
const l = process.env.VITE_DEV_SERVER_URL, y = r.join(process.env.APP_ROOT, "dist-electron"), f = r.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = l ? r.join(process.env.APP_ROOT, "public") : f;
let n;
function g() {
  n = new d({
    icon: r.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    autoHideMenuBar: !0,
    width: 1280,
    height: 1024,
    frame: !1,
    webPreferences: {
      preload: r.join(m, "preload.mjs")
    }
  }), n && E(n), l ? n.loadURL(l) : n.loadFile(r.join(f, "index.html"));
}
const D = o.requestSingleInstanceLock();
D ? o.on("second-instance", (e) => {
  n && (n.isMinimized() && n.restore(), n.focus());
}) : o.quit();
o.on("ready", () => {
  w("JinJiu.Scan.Server2", "D:/server/JinJiu.Scan.Server2.exe", S), o.setLoginItemSettings({
    openAtLogin: !0
  });
});
o.on("will-finish-launching", () => {
  a.existsSync("D:/JJSK_Data") || a.mkdirSync("D:/JJSK_Data"), o.setPath("appData", "D:/JJSK_Data");
});
o.on("before-quit", () => {
  n == null || n.removeAllListeners("close"), p.unregisterAll(), n == null || n.close();
});
o.on("window-all-closed", () => {
  process.platform !== "darwin" && (o.quit(), n = null);
});
o.on("activate", () => {
  d.getAllWindows().length === 0 && g();
});
o.whenReady().then(g);
export {
  y as MAIN_DIST,
  f as RENDERER_DIST,
  l as VITE_DEV_SERVER_URL
};
