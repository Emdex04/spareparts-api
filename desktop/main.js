// SpareParts Pro — Windows app.
// The app's screens live inside the app (so it opens instantly, even with no internet).
// The shop's data lives on the shop's online server; sales, restocks and counts made offline are sent later.
const { app, BrowserWindow, protocol, net, shell, session, Menu } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

const WEB_DIR = path.join(__dirname, "web");

// app://shop/ behaves like a normal secure website: camera, saved sign-in and storage all work
protocol.registerSchemesAsPrivileged([{
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
}]);

// Only one copy of the app at a time; opening it again brings the window forward
if (!app.requestSingleInstanceLock()) app.quit();

let win;
function createWindow() {
    win = new BrowserWindow({
        width: 1280, height: 820, minWidth: 380, minHeight: 600,
        title: "SpareParts Pro",
        icon: path.join(__dirname, "build", "icon.png"),
        backgroundColor: "#0b0d12",
        autoHideMenuBar: true,
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
    });
    win.once("ready-to-show", () => win.show());

    // Links such as "Share on WhatsApp" open in the normal browser, never inside the app
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^(https?:|mailto:|tel:)/.test(url)) shell.openExternal(url);
        return { action: "deny" };
    });
    win.webContents.on("will-navigate", (e, url) => {
        if (!url.startsWith("app://")) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
    });

    win.loadURL("app://shop/index.html");
}

app.whenReady().then(() => {
    // Serve the app's own files for app://shop/...
    protocol.handle("app", req => {
        const { pathname } = new URL(req.url);
        const file = path.normalize(path.join(WEB_DIR, decodeURIComponent(pathname)));
        if (!file.startsWith(WEB_DIR)) return new Response("Not found", { status: 404 });
        return net.fetch(pathToFileURL(file).toString());
    });

    // Allow the camera (barcode scanning) for the app's own screens only
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
        const own = (details.requestingUrl || wc.getURL()).startsWith("app://");
        callback(own && ["media", "clipboard-sanitized-write"].includes(permission));
    });
    session.defaultSession.setPermissionCheckHandler((wc, permission, origin) =>
        String(origin || "").startsWith("app://") && permission === "media");

    // Small menu so keyboard shortcuts (copy, paste, zoom, reload) keep working; hidden until Alt is pressed
    Menu.setApplicationMenu(Menu.buildFromTemplate([
        { label: "File", submenu: [{ role: "reload", label: "Refresh" }, { type: "separator" }, { role: "quit", label: "Close SpareParts Pro" }] },
        { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
        { label: "View", submenu: [{ role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }, { type: "separator" }, { role: "togglefullscreen" }] }
    ]));

    createWindow();
});

app.on("second-instance", () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
app.on("window-all-closed", () => app.quit());
