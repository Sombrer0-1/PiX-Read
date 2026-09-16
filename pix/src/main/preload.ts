/**
 * Preload Script
 *
 * Exposes a typed API to the renderer process via contextBridge.
 *
 * Shared types are import type only. CJS emit must stay in dist/preload-tmp
 * so it cannot overwrite ESM dist/main/shared/*.js.
 */

import { contextBridge, ipcRenderer } from "electron";
import type { PixStoragePaths } from "./pix-paths.js";
import type {
  AgentSessionEvent,
  GuiSettings,
  LibraryFileResult,
  LibraryNode,
  McpConfigInfo,
  McpServerInfo,
  ReaderNoteDraft,
  ReaderNotesExportResult,
  ReaderNotesLoadResult,
  ReaderNotesMutationResult,
  ReaderNotesReportInput,
  ReaderNotesReportResult,
  ReaderNotesResetResult,
  ReaderNotesStatResult,
  ReaderStateLoadResult,
  ReaderStateSaveDraft,
  ReaderStateSaveResult,
  RequestUserInputRequest,
  RpcCommand,
  SessionInfo,
} from "../shared/types.js";

export interface PixApi {
  // File dialogs
  selectProject: () => Promise<string | null>;
  selectChatFiles: () => Promise<string[]>;

  // Agent session lifecycle
  startSession: (projectDir: string) => Promise<{ success: boolean; error?: string }>;
  stopSession: () => Promise<{ success: boolean }>;
  isAgentRunning: () => Promise<boolean>;

  // RPC commands
  sendCommand: <T = unknown>(command: RpcCommand) => Promise<{ success: boolean; data?: T; error?: string }>;

  // Settings
  getSettings: () => Promise<GuiSettings>;
  setSettings: (settings: Partial<GuiSettings>) => Promise<{ success: boolean }>;
  getStoragePaths: () => Promise<PixStoragePaths>;

  // Event subscriptions
  onAgentEvent: (callback: (event: AgentSessionEvent) => void) => () => void;
  onAgentReady: (callback: () => void) => () => void;
  onAgentExit: (callback: (data: { code: number | null; signal: string | null; stderr: string }) => void) => () => void;
  onAgentError: (callback: (err: { message: string }) => void) => () => void;
  onUserInputRequest: (callback: (request: RequestUserInputRequest) => void) => () => void;

  // Session management
  listSessions: (projectDir: string) => Promise<SessionInfo[]>;
  deleteSession: (sessionPath: string, projectDir?: string) => Promise<{ success: boolean; error?: string }>;

  // Library (workspace file tree)
  libraryList: (dir: string, depth?: number) => Promise<{ success: boolean; nodes: LibraryNode[]; error?: string }>;
  libraryOpenPath: (targetPath: string) => Promise<{ success: boolean; error?: string }>;
  libraryShowInFolder: (targetPath: string) => Promise<{ success: boolean }>;
  libraryReadText: (targetPath: string) => Promise<LibraryFileResult & { content?: string; truncated?: boolean }>;
  libraryReadFile: (targetPath: string) => Promise<LibraryFileResult>;

  // Reader notes (workspace .pix-read/notes.json)
  notesLoad: () => Promise<ReaderNotesLoadResult>;
  notesAdd: (draft: ReaderNoteDraft) => Promise<ReaderNotesMutationResult>;
  notesUpdate: (id: string, comment: string) => Promise<ReaderNotesMutationResult>;
  notesDelete: (id: string) => Promise<ReaderNotesMutationResult>;
  notesRestore: (id: string) => Promise<ReaderNotesMutationResult>;
  notesExport: () => Promise<ReaderNotesExportResult>;
  notesExportReport: (input: ReaderNotesReportInput) => Promise<ReaderNotesReportResult>;
  notesReset: () => Promise<ReaderNotesResetResult>;
  notesStat: () => Promise<ReaderNotesStatResult>;

  // Reader state (workspace .pix-read/reader-state.json)
  readerStateLoad: () => Promise<ReaderStateLoadResult>;
  readerStateSave: (draft: ReaderStateSaveDraft) => Promise<ReaderStateSaveResult>;

  // Window controls (frameless window)
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  onWindowMaximizeChange: (callback: (maximized: boolean) => void) => () => void;

  // MCP queries
  mcpGetServers: () => Promise<McpServerInfo[]>;
  mcpGetConfig: () => Promise<McpConfigInfo>;

  // Auto update
  checkForUpdates: () => Promise<{
    success: boolean;
    hasUpdate?: boolean;
    currentVersion?: string;
    latestVersion?: string;
    releaseNotes?: string;
    releaseDate?: string;
    error?: string;
  }>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => void;
}

const api: PixApi = {
  selectProject: () => ipcRenderer.invoke("select-project"),
  selectChatFiles: () => ipcRenderer.invoke("select-chat-files"),

  startSession: (projectDir: string) => ipcRenderer.invoke("session-start", projectDir),
  stopSession: () => ipcRenderer.invoke("session-stop"),
  isAgentRunning: () => ipcRenderer.invoke("agent-is-running"),

  sendCommand: <T = unknown>(command: RpcCommand) =>
    ipcRenderer.invoke("rpc-command", command) as Promise<{ success: boolean; data?: T; error?: string }>,

  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (settings: Partial<GuiSettings>) => ipcRenderer.invoke("set-settings", settings),
  getStoragePaths: () => ipcRenderer.invoke("get-storage-paths"),

  onAgentEvent: (callback: (event: AgentSessionEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgentSessionEvent) => callback(data);
    ipcRenderer.on("agent-event", handler);
    return () => ipcRenderer.removeListener("agent-event", handler);
  },
  onAgentReady: (callback: () => void) => {
    ipcRenderer.on("agent-ready", callback);
    return () => ipcRenderer.removeListener("agent-ready", callback);
  },
  onAgentExit: (callback: (data: { code: number | null; signal: string | null; stderr: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { code: number | null; signal: string | null; stderr: string }) => callback(data);
    ipcRenderer.on("agent-exit", handler);
    return () => ipcRenderer.removeListener("agent-exit", handler);
  },
  onAgentError: (callback: (err: { message: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data);
    ipcRenderer.on("agent-error", handler);
    return () => ipcRenderer.removeListener("agent-error", handler);
  },
  onUserInputRequest: (callback: (request: RequestUserInputRequest) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: RequestUserInputRequest) => callback(data);
    ipcRenderer.on("user-input-request", handler);
    return () => ipcRenderer.removeListener("user-input-request", handler);
  },

  listSessions: (projectDir: string) => ipcRenderer.invoke("list-sessions", projectDir),

  deleteSession: (sessionPath: string, projectDir?: string) =>
    ipcRenderer.invoke("delete-session", sessionPath, projectDir) as Promise<{ success: boolean; error?: string }>,

  libraryList: (dir: string, depth?: number) => ipcRenderer.invoke("library-list", dir, depth),
  libraryOpenPath: (targetPath: string) => ipcRenderer.invoke("library-open-path", targetPath),
  libraryShowInFolder: (targetPath: string) => ipcRenderer.invoke("library-show-in-folder", targetPath),
  libraryReadText: (targetPath: string) => ipcRenderer.invoke("library-read-text", targetPath),
  libraryReadFile: (targetPath: string) => ipcRenderer.invoke("library-read-file", targetPath) as Promise<LibraryFileResult>,

  notesLoad: () => ipcRenderer.invoke("notes-load") as Promise<ReaderNotesLoadResult>,
  notesAdd: (draft: ReaderNoteDraft) => ipcRenderer.invoke("notes-add", draft) as Promise<ReaderNotesMutationResult>,
  notesUpdate: (id: string, comment: string) =>
    ipcRenderer.invoke("notes-update", id, comment) as Promise<ReaderNotesMutationResult>,
  notesDelete: (id: string) => ipcRenderer.invoke("notes-delete", id) as Promise<ReaderNotesMutationResult>,
  notesRestore: (id: string) => ipcRenderer.invoke("notes-restore", id) as Promise<ReaderNotesMutationResult>,
  notesExport: () => ipcRenderer.invoke("notes-export") as Promise<ReaderNotesExportResult>,
  notesExportReport: (input: ReaderNotesReportInput) =>
    ipcRenderer.invoke("notes-export-report", input) as Promise<ReaderNotesReportResult>,
  notesReset: () => ipcRenderer.invoke("notes-reset") as Promise<ReaderNotesResetResult>,
  notesStat: () => ipcRenderer.invoke("notes-stat") as Promise<ReaderNotesStatResult>,

  readerStateLoad: () => ipcRenderer.invoke("reader-state-load") as Promise<ReaderStateLoadResult>,
  readerStateSave: (draft: ReaderStateSaveDraft) =>
    ipcRenderer.invoke("reader-state-save", draft) as Promise<ReaderStateSaveResult>,

  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowMaximize: () => ipcRenderer.invoke("window-maximize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  onWindowMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on("window-maximize-change", handler);
    return () => ipcRenderer.removeListener("window-maximize-change", handler);
  },

  mcpGetServers: () => ipcRenderer.invoke("mcp-get-servers"),
  mcpGetConfig: () => ipcRenderer.invoke("mcp-get-config"),

  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
};

contextBridge.exposeInMainWorld("pixApi", api);
