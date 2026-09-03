/**
 * Electron Main Process Entry Point
 *
 * v2: Uses SessionBridge for direct AgentSession integration.
 * No more subprocess spawning; the coding agent runs in-process.
 */

import "./env-setup.js";
import { BrowserWindow, Menu, app, shell, type MenuItemConstructorOptions } from "electron";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { registerIpcHandlers, setupEventForwarding } from "./ipc-handlers.js";
import { SessionBridge } from "./session-bridge.js";
import { SettingsStore } from "./settings-store.js";

// ESM doesn't have __dirname; derive it from import.meta.url.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let sessionBridge: SessionBridge | null = null;
let settingsStore: SettingsStore;

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

function isAllowedAppNavigation(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      return url === pathToFileURL(join(__dirname, "..", "..", "renderer", "index.html")).href;
    }

    const devServer = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
    if (process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL) {
      return parsed.origin === new URL(devServer).origin;
    }
  } catch {
    return false;
  }
  return false;
}

function openExternalIfSafe(url: string): void {
  if (isSafeExternalUrl(url)) {
    void shell.openExternal(url);
  }
}

/**
 * Electron only binds Ctrl/Cmd+C, V, X, A, Z and Y inside web contents through
 * menu roles, so the previous `Menu.setApplicationMenu(null)` silently killed
 * copy/paste on Windows (pasting an API key, copying PDF text layer, ...).
 * This menu exists purely for those roles; the bar itself is hidden per window.
 */
function setupApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "编辑",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "PiX-Read",
    backgroundColor: "#f3f6f9",
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });
  mainWindow = win;

  // The menu only carries accelerators; keep it out of the client area of this
  // frameless window. No-op on macOS, where the bar lives in the system menu.
  win.setMenuBarVisibility(false);

  win.once("ready-to-show", () => {
    win.show();
  });

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isAllowedAppNavigation(url)) return;
    event.preventDefault();
    openExternalIfSafe(url);
  });

  // Load app
  if (process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || "http://localhost:5173");
    // Devtools are opt-in: a detached window steals focus on every dev start.
    if (process.env.PIX_OPEN_DEVTOOLS === "1") {
      win.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    // __dirname is dist/main/main, renderer build is at dist/renderer/
    win.loadFile(join(__dirname, "..", "..", "renderer", "index.html"));
  }

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  return win;
}

async function cleanup(): Promise<void> {
  if (sessionBridge) {
    try {
      await sessionBridge.dispose();
    } catch (err) {
      console.error("[main] Error during session bridge cleanup:", err);
    }
  }
}

let shuttingDown = false;

/** Every quit path funnels here, so cleanup() runs exactly once. */
function requestShutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  void cleanup().finally(() => app.quit());
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  // Another PiX-Read instance owns the lock; focus it instead and exit.
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = mainWindow;
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
  // Edit roles double as the clipboard accelerators the frameless window needs.
  setupApplicationMenu();

  console.log("[main] app.whenReady() callback executing");

  try {
    settingsStore = new SettingsStore();
    console.log("[main] SettingsStore created");
  } catch (err) {
    console.error("[main] SettingsStore FAILED:", err);
    throw err;
  }

  try {
    sessionBridge = new SessionBridge();
    console.log("[main] SessionBridge created");
  } catch (err) {
    console.error("[main] SessionBridge FAILED:", err);
    throw err;
  }

  const win = createWindow();
  console.log("[main] Window created");

  if (sessionBridge) {
    console.log("[main] registering IPC handlers...");
    registerIpcHandlers(win, sessionBridge, settingsStore);
    setupEventForwarding(() => mainWindow, sessionBridge);
    console.log("[main] IPC handlers registered");
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    const reopened = createWindow();
    if (sessionBridge) {
      // Re-point the handlers at the new window (the guard inside skips
      // duplicate listener registration); event forwarding already reads
      // through the mainWindow getter.
      registerIpcHandlers(reopened, sessionBridge, settingsStore);
    }
  });
});
}

app.on("window-all-closed", () => {
  // macOS keeps the app alive so `activate` can reopen a window. Everywhere
  // else closing the last window quits; a windowless background process on
  // Windows would be unreachable and leave a zombie behind.
  if (process.platform === "darwin") return;
  requestShutdown();
});

app.on("before-quit", (event) => {
  if (shuttingDown) return;
  // Hold the quit open while cleanup() runs asynchronously; the app.quit() it
  // schedules re-enters this handler with the guard already set.
  event.preventDefault();
  requestShutdown();
});
