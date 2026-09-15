/**
 * IPC Handlers
 *
 * Bridges between renderer and main process.
 * Registers all ipcMain handlers for session control, settings, library
 * browsing, and file dialogs.
 *
 * Uses SessionBridge for direct AgentSession integration (no RPC subprocess).
 */

import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync } from "fs";
import { join, resolve } from "path";
import { BrowserWindow, Notification, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import electronUpdater from "electron-updater";
import { selectChatFiles, selectProjectDirectory } from "./file-dialogs.js";
import { resolvePixSessionDir, type SessionBridge } from "./session-bridge.js";
import { getPixStoragePaths, pixAgentDir, pixSessionsRootDir } from "./pix-paths.js";
import type { SettingsStore } from "./settings-store.js";
import { clearLibraryRoot, getLibraryRoot, isLibraryFilePath, isPathInsideDirectory, setLibraryRoot } from "./library-root.js";
import { addNote, deleteNote, exportNotesMarkdown, loadNotes, resetCorruptNotes, restoreNote, updateNoteComment } from "./notes-store.js";
import { loadReaderState, saveReaderState } from "./reader-state-store.js";
import type {
  GuiSettings,
  LibraryFileResult,
  LibraryNode,
  ProjectInfo,
  ReaderNoteDraft,
  ReaderNotesMutationResult,
  ReaderStateSaveDraft,
  ReaderStateSaveResult,
  RpcCommand,
  ThinkingLevel,
} from "../shared/types.js";

const { autoUpdater } = electronUpdater;

let handlersRegistered = false;
let eventForwardingSetup = false;
let currentWindow: BrowserWindow | null = null;
let detachWindowStateListeners: (() => void) | null = null;

const SETTING_KEYS = new Set([
  "theme",
  "recentProjects",
  "defaultProvider",
  "defaultModel",
  "defaultThinkingLevel",
  "takeHerEyes",
]);

const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh"]);

/** Directories skipped when listing the library tree. */
const LIBRARY_IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "release", ".pi"]);

/** Reading hands pdf.js the whole file, so cap it instead of risking an OOM. */
const MAX_READABLE_FILE_BYTES = 256 * 1024 * 1024;

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && THINKING_LEVELS.has(value as ThinkingLevel);
}

function isProjectInfo(value: unknown): value is ProjectInfo {
  if (!value || typeof value !== "object") return false;
  const project = value as Record<string, unknown>;
  return (
    typeof project.path === "string" &&
    typeof project.name === "string" &&
    typeof project.lastOpened === "number" &&
    typeof project.sessionCount === "number"
  );
}

function sanitizeTakeHerEyes(value: unknown): GuiSettings["takeHerEyes"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const result: GuiSettings["takeHerEyes"] = {
    enabled: raw.enabled === true,
  };
  if (typeof raw.provider === "string" && raw.provider.trim()) {
    result.provider = raw.provider;
  }
  if (typeof raw.modelId === "string" && raw.modelId.trim()) {
    result.modelId = raw.modelId;
  }
  return result;
}

function sanitizeSettings(settings: Record<string, unknown>): Partial<GuiSettings> {
  const sanitized: Partial<GuiSettings> = {};

  for (const key of Object.keys(settings)) {
    if (!SETTING_KEYS.has(key)) {
      console.warn(`[ipc] Ignoring unknown setting key: ${key}`);
    }
  }

  if (settings.theme === "light") {
    sanitized.theme = "light";
  }
  if (Array.isArray(settings.recentProjects) && settings.recentProjects.every(isProjectInfo)) {
    sanitized.recentProjects = settings.recentProjects;
  }
  if (Object.hasOwn(settings, "defaultProvider")) {
    const value = settings.defaultProvider;
    if (value === undefined || typeof value === "string") {
      sanitized.defaultProvider = value;
    }
  }
  if (Object.hasOwn(settings, "defaultModel")) {
    const value = settings.defaultModel;
    if (value === undefined || typeof value === "string") {
      sanitized.defaultModel = value;
    }
  }
  if (Object.hasOwn(settings, "defaultThinkingLevel")) {
    const value = settings.defaultThinkingLevel;
    if (value === undefined || isThinkingLevel(value)) {
      sanitized.defaultThinkingLevel = value;
    }
  }
  if (Object.hasOwn(settings, "takeHerEyes")) {
    const value = settings.takeHerEyes;
    if (value === undefined) {
      sanitized.takeHerEyes = undefined;
    } else {
      const cleaned = sanitizeTakeHerEyes(value);
      if (cleaned) sanitized.takeHerEyes = cleaned;
    }
  }

  return sanitized;
}

function getUsableWindow(win: BrowserWindow | null | undefined): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null;
}

function getWindowFromEvent(event: IpcMainInvokeEvent): BrowserWindow | null {
  return getUsableWindow(BrowserWindow.fromWebContents(event.sender)) ?? getUsableWindow(currentWindow);
}

function sendWindowMaximizeChange(win: BrowserWindow, maximized: boolean): void {
  if (!win.isDestroyed()) {
    win.webContents.send("window-maximize-change", maximized);
  }
}

function setCurrentWindow(win: BrowserWindow): void {
  currentWindow = win;
  detachWindowStateListeners?.();

  const onMaximize = () => sendWindowMaximizeChange(win, true);
  const onUnmaximize = () => sendWindowMaximizeChange(win, false);
  const onFocus = () => {
    if (!win.isDestroyed()) win.flashFrame(false);
  };
  const onClosed = () => {
    if (currentWindow === win) {
      currentWindow = null;
      detachWindowStateListeners = null;
    }
  };

  win.on("maximize", onMaximize);
  win.on("unmaximize", onUnmaximize);
  win.on("focus", onFocus);
  win.on("closed", onClosed);
  detachWindowStateListeners = () => {
    win.off("maximize", onMaximize);
    win.off("unmaximize", onUnmaximize);
    win.off("focus", onFocus);
    win.off("closed", onClosed);
  };
}

/** Either the guarded absolute path, or a failure shaped like LibraryFileResult. */
type LibraryPathGuard = { path: string } | LibraryFileResult;

/**
 * Every renderer file read goes through here: without the root check the text
 * preview would happily return any absolute path on disk.
 */
function guardLibraryPath(targetPath: unknown): LibraryPathGuard {
  if (typeof targetPath !== "string" || !targetPath) {
    return { success: false, code: "invalid", error: "文件路径无效" };
  }
  if (!getLibraryRoot()) {
    return { success: false, code: "no-root", error: "尚未选择资料库根目录" };
  }
  const resolved = resolve(targetPath);
  if (!isLibraryFilePath(resolved)) {
    return { success: false, code: "outside", error: "该文件不在当前资料库内" };
  }
  return { path: resolved };
}

function listLibraryChildren(dir: string, depth: number): LibraryNode[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: LibraryNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (LIBRARY_IGNORED_DIRS.has(entry.name)) continue;
      const node: LibraryNode = { name: entry.name, path: fullPath, type: "directory", children: [] };
      if (depth > 1) {
        node.children = listLibraryChildren(fullPath, depth - 1);
      }
      nodes.push(node);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      nodes.push({ name: entry.name, path: fullPath, type: "file" });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

function isNoteDraft(value: unknown): value is ReaderNoteDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    (draft.kind === "excerpt" || draft.kind === "answer") &&
    typeof draft.docFilePath === "string" &&
    draft.docFilePath.length > 0 &&
    typeof draft.page === "number" &&
    Number.isFinite(draft.page) &&
    typeof draft.text === "string"
  );
}

function isNoteId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNoteComment(value: unknown): value is string {
  return typeof value === "string";
}

/** 守卫只做形状；路径归属、归一化、限额与去重都在 notes-store 内完成。 */
function invalidNotesInput(): ReaderNotesMutationResult {
  return { success: false, notes: [], code: "invalid-input", error: "笔记数据不合法" };
}

function isReaderStateDraft(value: unknown): value is ReaderStateSaveDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.docFilePath === "string" &&
    draft.docFilePath.length > 0 &&
    typeof draft.page === "number" &&
    Number.isFinite(draft.page) &&
    typeof draft.scale === "number" &&
    Number.isFinite(draft.scale)
  );
}

/** 守卫只做形状；相对化、越界、取值域与原子写都在 reader-state-store 内完成。 */
function invalidReaderStateInput(): ReaderStateSaveResult {
  return {
    success: false,
    state: { version: 1, lastDocPath: null, documents: {} },
    code: "invalid-input",
    error: "阅读状态数据不合法",
  };
}

export function registerIpcHandlers(
  win: BrowserWindow,
  sessionBridge: SessionBridge,
  settingsStore: SettingsStore
): void {
  setCurrentWindow(win);

  // Prevent duplicate registration (e.g. macOS activate)
  if (handlersRegistered) {
    console.log("[ipc-handlers] Already registered, skipping");
    return;
  }
  handlersRegistered = true;
  console.log("[ipc-handlers] registerIpcHandlers() start");

  // =========================================================================
  // File Dialogs
  // =========================================================================

  ipcMain.handle("select-project", async (event) => {
    const callerWin = BrowserWindow.fromWebContents(event.sender);
    if (!callerWin) return null;
    return selectProjectDirectory(callerWin);
  });

  ipcMain.handle("select-chat-files", async (event) => {
    const callerWin = BrowserWindow.fromWebContents(event.sender);
    if (!callerWin) return [];
    return selectChatFiles(callerWin);
  });

  // =========================================================================
  // Session Lifecycle
  // =========================================================================

  ipcMain.handle("session-start", async (_event, projectDir: string) => {
    try {
      await sessionBridge.start(projectDir, settingsStore.getAll());
      setLibraryRoot(projectDir);
      return { success: true };
    } catch (err: unknown) {
      clearLibraryRoot();
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("session-stop", async () => {
    try {
      await sessionBridge.dispose();
    } catch (err) {
      console.error("[ipc] Error during session dispose:", err);
    }
    clearLibraryRoot();
    return { success: true };
  });

  // =========================================================================
  // RPC Commands dispatched directly to SessionBridge methods.
  // =========================================================================

  ipcMain.handle("rpc-command", async (_event, command: unknown) => {
    if (!isRpcCommand(command)) {
      return { success: false, error: `Invalid command: ${JSON.stringify(command)}` };
    }
    try {
      const result = await executeCommand(sessionBridge, command);
      return { success: true, data: result };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // =========================================================================
  // Session listing
  // =========================================================================

  ipcMain.handle("list-sessions", async (_event, projectDir: string) => {
    try {
      const sessions = await SessionManager.list(projectDir, resolvePixSessionDir(projectDir));
      return sessions.map((session) => ({
        path: session.path,
        id: session.id,
        cwd: session.cwd || projectDir,
        name: session.name,
        created: session.created.toISOString(),
        modified: session.modified.toISOString(),
        messageCount: session.messageCount,
        firstMessage: session.firstMessage,
      }));
    } catch (err) {
      console.error("[ipc] Error listing sessions:", err);
      return [];
    }
  });

  // =========================================================================
  // Library (workspace file tree)
  // =========================================================================

  ipcMain.handle("library-list", async (_event, dir: string, depth?: number) => {
    const root = resolve(dir);
    let isDirectory = false;
    try {
      isDirectory = existsSync(root) && statSync(root).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) {
      return { success: false, error: `目录不存在：${root}`, nodes: [] };
    }
    const effectiveDepth = Math.min(Math.max(depth ?? 2, 1), 4);
    return { success: true, nodes: listLibraryChildren(root, effectiveDepth) };
  });

  ipcMain.handle("library-open-path", async (_event, targetPath: string) => {
    const resolved = resolve(targetPath);
    if (!existsSync(resolved)) {
      return { success: false, error: `路径不存在：${resolved}` };
    }
    const result = await shell.openPath(resolved);
    return result ? { success: false, error: result } : { success: true };
  });

  ipcMain.handle("library-show-in-folder", async (_event, targetPath: string) => {
    shell.showItemInFolder(resolve(targetPath));
    return { success: true };
  });

  ipcMain.handle("library-read-text", async (_event, targetPath: string): Promise<LibraryFileResult & { content?: string; truncated?: boolean }> => {
    const guard = guardLibraryPath(targetPath);
    if (!("path" in guard)) return guard;
    try {
      const stat = statSync(guard.path);
      if (!stat.isFile()) {
        return { success: false, code: "not-found", error: "文件不存在" };
      }
      const MAX_BYTES = 2 * 1024 * 1024;
      const truncated = stat.size > MAX_BYTES;
      // Read only the cap, never the whole file: a 100 MB log must not be
      // pulled into memory to show its first 2 MB.
      const byteLength = Math.min(stat.size, MAX_BYTES);
      const buffer = Buffer.alloc(byteLength);
      let read = 0;
      const fd = openSync(guard.path, "r");
      try {
        read = readSync(fd, buffer, 0, byteLength, 0);
      } finally {
        closeSync(fd);
      }
      // A leading BOM renders as an invisible stray character in the preview.
      const content = buffer.subarray(0, read).toString("utf-8").replace(/^\uFEFF/, "");
      return { success: true, content, truncated };
    } catch (err) {
      return { success: false, code: "read-failed", error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("library-read-file", (_event, targetPath: string): LibraryFileResult => {
    const guard = guardLibraryPath(targetPath);
    if (!("path" in guard)) return guard;
    const resolved = guard.path;
    let size: number;
    try {
      if (!existsSync(resolved) || !statSync(resolved).isFile()) {
        return { success: false, code: "not-found", error: "文件不存在" };
      }
      size = statSync(resolved).size;
    } catch {
      return { success: false, code: "not-found", error: "文件不存在" };
    }
    if (size > MAX_READABLE_FILE_BYTES) {
      return {
        success: false,
        code: "too-large",
        error: `文件过大（${Math.round(size / 1024 / 1024)} MB），超出可打开上限 ${Math.round(MAX_READABLE_FILE_BYTES / 1024 / 1024)} MB`,
      };
    }
    try {
      const buffer = readFileSync(resolved);
      return { success: true, data: new Uint8Array(buffer) };
    } catch (err) {
      return { success: false, code: "read-failed", error: err instanceof Error ? err.message : String(err) };
    }
  });

  // =========================================================================
  // Reader notes (workspace .pix-read/notes.json)
  // =========================================================================

  ipcMain.handle("notes-load", () => loadNotes());

  ipcMain.handle("notes-add", (_event, draft: unknown) => (isNoteDraft(draft) ? addNote(draft) : invalidNotesInput()));

  ipcMain.handle("notes-update", (_event, id: unknown, comment: unknown) =>
    isNoteId(id) && isNoteComment(comment) ? updateNoteComment(id, comment) : invalidNotesInput()
  );

  ipcMain.handle("notes-delete", (_event, id: unknown) => (isNoteId(id) ? deleteNote(id) : invalidNotesInput()));

  ipcMain.handle("notes-restore", (_event, id: unknown) => (isNoteId(id) ? restoreNote(id) : invalidNotesInput()));

  ipcMain.handle("notes-export", () => exportNotesMarkdown());

  ipcMain.handle("notes-reset", () => resetCorruptNotes());

  // =========================================================================
  // Reader state (workspace .pix-read/reader-state.json)
  // =========================================================================

  ipcMain.handle("reader-state-load", () => loadReaderState());

  ipcMain.handle("reader-state-save", (_event, draft: unknown) =>
    isReaderStateDraft(draft) ? saveReaderState(draft) : invalidReaderStateInput()
  );

  // =========================================================================
  // Settings
  // =========================================================================

  ipcMain.handle("get-settings", () => {
    return settingsStore.getAll();
  });

  ipcMain.handle("set-settings", (_event, settings: Record<string, unknown>) => {
    settingsStore.setMany(sanitizeSettings(settings));
    sessionBridge.updateGuiSettings(settingsStore.getAll());
    return { success: true };
  });

  ipcMain.handle("get-storage-paths", () => {
    return getPixStoragePaths();
  });

  // =========================================================================
  // Agent runtime status
  // =========================================================================

  ipcMain.handle("agent-is-running", () => {
    return sessionBridge.isRunning();
  });

  // =========================================================================
  // MCP Queries
  // =========================================================================

  ipcMain.handle("mcp-get-servers", () => {
    return sessionBridge.mcpGetServers();
  });

  ipcMain.handle("mcp-get-config", () => {
    return sessionBridge.mcpGetConfig();
  });

  // =========================================================================
  // Auto Update
  // =========================================================================

  ipcMain.handle("check-for-updates", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      const currentVersion = autoUpdater.currentVersion.version;
      if (!result) {
        return { success: true, hasUpdate: false, currentVersion };
      }
      const latestVersion = result.updateInfo.version;
      return {
        success: true,
        hasUpdate: latestVersion !== currentVersion,
        currentVersion,
        latestVersion,
        releaseNotes: result.updateInfo.releaseNotes,
        releaseDate: result.updateInfo.releaseDate,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("download-update", async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("install-update", () => {
    // Refuse to quit-and-install while a session is running: doing so mid-turn
    // can corrupt the in-memory session state.
    if (sessionBridge.isRunning()) {
      const message = "有会话正在运行，请先停止会话再安装更新。";
      console.warn("[ipc] install-update blocked: a session is running");
      try {
        if (Notification.isSupported()) {
          new Notification({ title: "PiX-Read 更新已推迟", body: message }).show();
        }
      } catch (err) {
        console.error("[ipc] Failed to show install-update blocked notification:", err);
      }
      return { success: false, error: message };
    }
    autoUpdater.quitAndInstall();
    return { success: true };
  });

  // =========================================================================
  // Window Controls (frameless window)
  // =========================================================================

  ipcMain.handle("window-minimize", (event) => {
    getWindowFromEvent(event)?.minimize();
  });

  ipcMain.handle("window-maximize", (event) => {
    const targetWin = getWindowFromEvent(event);
    if (!targetWin) return;
    if (targetWin.isMaximized()) {
      targetWin.unmaximize();
    } else {
      targetWin.maximize();
    }
  });

  ipcMain.handle("window-close", (event) => {
    getWindowFromEvent(event)?.close();
  });

  ipcMain.handle("window-is-maximized", (event) => {
    return getWindowFromEvent(event)?.isMaximized() ?? false;
  });

  // =========================================================================
  // Session Management (delete)
  // =========================================================================

  ipcMain.handle("delete-session", async (_event, sessionPath: string, projectDir?: string) => {
    try {
      const resolved = resolve(sessionPath);
      // Guard: only delete .jsonl session files that live in a PiX-Read session
      // directory - the PiX sessions root plus the directory list-sessions
      // resolved for this project, so both share one resolution basis.
      const allowedDirs = [pixSessionsRootDir];
      const configuredSessionDir = resolvePixSessionDir(projectDir || pixAgentDir);
      if (!allowedDirs.includes(resolve(configuredSessionDir))) {
        allowedDirs.push(resolve(configuredSessionDir));
      }
      if (!allowedDirs.some((dir) => isPathInsideDirectory(resolved, dir))) {
        return { success: false, error: "Invalid session path" };
      }
      if (!existsSync(resolved) || statSync(resolved).isDirectory() || !resolved.toLowerCase().endsWith(".jsonl")) {
        return { success: false, error: "Not a session file" };
      }
      rmSync(resolved, { force: true });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

// ===========================================================================
// Command Dispatch
// ===========================================================================

function isRpcCommand(cmd: unknown): cmd is RpcCommand {
  return (
    typeof cmd === "object" &&
    cmd !== null &&
    "type" in cmd &&
    typeof (cmd as Record<string, unknown>).type === "string"
  );
}

async function executeCommand(bridge: SessionBridge, cmd: RpcCommand): Promise<unknown> {
  switch (cmd.type) {
    // Prompting
    case "prompt":
      await bridge.prompt(cmd.message, cmd.filePaths, cmd.images, cmd.displayText);
      return null;
    case "steer":
      await bridge.steer(cmd.message, cmd.filePaths, cmd.images, cmd.displayText);
      return null;
    case "follow_up":
      await bridge.followUp(cmd.message, cmd.filePaths, cmd.images, cmd.displayText);
      return null;
    case "abort":
      await bridge.abort();
      return null;
    case "respond_user_input":
      bridge.respondUserInput(cmd.response);
      return null;

    // State
    case "get_state":
      return bridge.getState();

    // Model
    case "set_model":
      await bridge.setModel(cmd.provider, cmd.modelId);
      return null;
    case "cycle_model":
      await bridge.cycleModel(cmd.direction ?? "forward");
      return null;
    case "get_available_models":
      return { models: bridge.getAvailableModels() };
    case "get_available_thinking_levels":
      return bridge.getAvailableThinkingLevels();
    case "supports_thinking":
      return bridge.supportsThinking();
    case "set_scoped_models":
      await bridge.setScopedModels(cmd.patterns);
      return null;
    case "get_scoped_models":
      return bridge.getScopedModels();

    // Thinking
    case "set_thinking_level":
      bridge.setThinkingLevel(cmd.level);
      return null;
    case "cycle_thinking_level":
      bridge.cycleThinkingLevel();
      return null;

    // Compaction
    case "compact":
      await bridge.compact(cmd.customInstructions);
      return null;

    // Session
    case "get_session_stats":
      return bridge.getSessionStats();
    case "switch_session":
      return bridge.switchSession(cmd.sessionPath);
    case "fork":
      return bridge.fork(cmd.entryId, cmd.position ?? "before", cmd.label);
    case "navigate_tree":
      return bridge.navigateTree(cmd.targetId, {
        summarize: cmd.summarize,
        customInstructions: cmd.customInstructions,
        replaceInstructions: cmd.replaceInstructions,
        label: cmd.label,
      });
    case "clone":
      return bridge.clone();
    case "get_last_assistant_text":
      return bridge.getLastAssistantText();
    case "set_session_name":
      bridge.setSessionName(cmd.name);
      return null;
    case "get_tree":
      return bridge.getTree();
    case "get_user_messages_for_forking":
      return bridge.getUserMessagesForForking();
    case "set_steering_mode":
      bridge.setSteeringMode(cmd.mode);
      return null;
    case "set_follow_up_mode":
      bridge.setFollowUpMode(cmd.mode);
      return null;

    // Messages
    case "get_messages":
      return bridge.getMessages();

    // Commands
    case "get_commands":
      return { commands: await bridge.getCommands() };

    // Session management
    case "new_session":
      return bridge.newSession(cmd.parentSession);

    // Export
    case "export_html":
      return { path: await bridge.exportToHtml(cmd.outputPath) };
    case "export_jsonl":
      return { path: await bridge.exportToJsonl(cmd.outputPath) };

    // Auth
    case "set_api_key":
      bridge.setApiKey(cmd.provider, cmd.key);
      return null;
    case "remove_auth":
      bridge.removeAuth(cmd.provider);
      return null;
    case "get_auth_status":
      return bridge.getAuthStatus();

    // Settings (full pi settings)
    case "get_pi_settings":
      return bridge.getPiSettings();
    case "set_pi_setting":
      await bridge.setPiSetting(cmd.key, cmd.value);
      return null;
    case "set_pi_settings":
      await bridge.setPiSettings(cmd.entries);
      return null;

    // Resources
    case "reload_resources":
      await bridge.reloadResources();
      return null;
    case "get_resource_status":
      return bridge.getResourceStatus();

    default:
      throw new Error(`Unknown command type: ${(cmd as { type: string }).type}`);
  }
}

// ===========================================================================
// Event Forwarding
// ===========================================================================

/**
 * Set up event forwarding from SessionBridge to renderer.
 *
 * Uses a getter for the current window so that forwarding survives
 * window close/reopen cycles on macOS.
 */
export function setupEventForwarding(
  getWin: () => BrowserWindow | null,
  sessionBridge: SessionBridge
): void {
  if (eventForwardingSetup) return;
  eventForwardingSetup = true;

  // Forward agent session events
  sessionBridge.onEvent((event) => {
    const win = getWin();
    if (win && !win.isDestroyed()) {
      win.webContents.send("agent-event", event);
    }
  });

  sessionBridge.onUserInputRequest((request) => {
    const win = getWin();
    if (win && !win.isDestroyed()) {
      win.webContents.send("user-input-request", request);
    }
  });

  // Lifecycle: ready
  sessionBridge.onLifecycle("ready", () => {
    const win = getWin();
    if (win && !win.isDestroyed()) {
      win.webContents.send("agent-ready");
    }
  });

  // Lifecycle: exit
  sessionBridge.onLifecycle("exit", (data) => {
    const win = getWin();
    if (win && !win.isDestroyed()) {
      win.webContents.send("agent-exit", data);
    }
  });

  // Lifecycle: error
  sessionBridge.onLifecycle("error", (err) => {
    const win = getWin();
    if (win && !win.isDestroyed()) {
      win.webContents.send("agent-error", { message: err.message ?? String(err) });
    }
  });
}
