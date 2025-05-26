import { ipcMain as t, app as o, BrowserWindow as u, dialog as g } from "electron";
import { fileURLToPath as p } from "node:url";
import r from "node:path";
import w from "fs";
import { spawn as h, execSync as R } from "child_process";
function S(e) {
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
  }), t.handle("win-get-logo", (i, c, l) => {
    if (e)
      try {
        const s = w.readFileSync("D:/logo/logo.png");
        return s ? `data:image/png;base64,${Buffer.from(s).toString("base64")}` : void 0;
      } catch (s) {
        console.log("get logo error", s);
      }
  });
}
function E(e) {
  h(e, [], {
    detached: !0,
    windowsHide: !0,
    cwd: "D:/server/"
  }).unref();
}
function I(e) {
  try {
    return R(`tasklist /FI "IMAGENAME eq ${e}.exe"`).includes(e);
  } catch (i) {
    return console.error(i), !1;
  }
}
function v(e, i, c) {
  try {
    I(e) || E(i);
  } catch (l) {
    c.showErrorBox(`Error checking or running ${e}:`, l + "");
  }
}
const d = r.dirname(p(import.meta.url));
process.env.APP_ROOT = r.join(d, "..");
const a = process.env.VITE_DEV_SERVER_URL, b = r.join(process.env.APP_ROOT, "dist-electron"), m = r.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = a ? r.join(process.env.APP_ROOT, "public") : m;
let n;
function f() {
  n = new u({
    icon: r.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    autoHideMenuBar: !0,
    width: 1280,
    height: 1024,
    frame: !1,
    webPreferences: {
      preload: r.join(d, "preload.mjs")
    }
  }), n && S(n), a ? n.loadURL(a) : n.loadFile(r.join(m, "index.html"));
}
const _ = o.requestSingleInstanceLock();
_ ? o.on("second-instance", (e) => {
  n && (n.isMinimized() && n.restore(), n.focus());
}) : o.quit();
o.on("ready", () => {
  v("JinJiu.Scan.Server2", "D:/server/JinJiu.Scan.Server2.exe", g), o.setLoginItemSettings({
    openAtLogin: !0
  });
});
o.on("window-all-closed", () => {
  process.platform !== "darwin" && (o.quit(), n = null);
});
o.on("activate", () => {
  u.getAllWindows().length === 0 && f();
});
o.whenReady().then(f);
export {
  b as MAIN_DIST,
  m as RENDERER_DIST,
  a as VITE_DEV_SERVER_URL
};
