/**
 * Shared types between main and renderer processes.
 * These mirror the Pi RPC protocol types.
 */

// ============================================================================
// RPC Command Types (commands sent to the agent session)
// ============================================================================

export interface ClipboardImage {
  mimeType: string;
  base64: string;
}

export type RpcCommand =
  // Prompting
  | {
      id?: string;
      type: "prompt";
      message: string;
      filePaths?: string[];
      images?: ClipboardImage[];
      /** Clean user-visible text when `message` carries injected context. */
      displayText?: string;
    }
  | {
      id?: string;
      type: "steer";
      message: string;
      filePaths?: string[];
      images?: ClipboardImage[];
      displayText?: string;
    }
  | {
      id?: string;
      type: "follow_up";
      message: string;
      filePaths?: string[];
      images?: ClipboardImage[];
      displayText?: string;
    }
  | { id?: string; type: "abort" }
  | { id?: string; type: "respond_user_input"; response: RequestUserInputResponse }
  | { id?: string; type: "new_session"; parentSession?: string }
  // State
  | { id?: string; type: "get_state" }
  // Model
  | { id?: string; type: "set_model"; provider: string; modelId: string }
  | { id?: string; type: "cycle_model"; direction?: "forward" | "backward" }
  | { id?: string; type: "get_available_models" }
  | { id?: string; type: "get_available_thinking_levels" }
  | { id?: string; type: "supports_thinking" }
  | { id?: string; type: "set_scoped_models"; patterns: string[] }
  | { id?: string; type: "get_scoped_models" }
  // Thinking
  | { id?: string; type: "set_thinking_level"; level: ThinkingLevel }
  | { id?: string; type: "cycle_thinking_level" }
  // Compaction
  | { id?: string; type: "compact"; customInstructions?: string }
  // Session
  | { id?: string; type: "get_session_stats" }
  | { id?: string; type: "switch_session"; sessionPath: string }
  | { id?: string; type: "fork"; entryId: string; position?: "before" | "at"; label?: string }
  | {
      id?: string;
      type: "navigate_tree";
      targetId: string;
      summarize?: boolean;
      customInstructions?: string;
      replaceInstructions?: boolean;
      label?: string;
    }
  | { id?: string; type: "clone" }
  | { id?: string; type: "get_last_assistant_text" }
  | { id?: string; type: "set_session_name"; name: string }
  | { id?: string; type: "get_tree" }
  | { id?: string; type: "get_user_messages_for_forking" }
  | { id?: string; type: "set_steering_mode"; mode: "all" | "one-at-a-time" }
  | { id?: string; type: "set_follow_up_mode"; mode: "all" | "one-at-a-time" }
  // Messages
  | { id?: string; type: "get_messages" }
  // Commands
  | { id?: string; type: "get_commands" }
  // Export
  | { id?: string; type: "export_html"; outputPath?: string }
  | { id?: string; type: "export_jsonl"; outputPath?: string }
  // Auth
  | { id?: string; type: "login"; provider: string }
  | { id?: string; type: "logout"; provider: string }
  | { id?: string; type: "get_auth_status" }
  | { id?: string; type: "set_api_key"; provider: string; key: string }
  | { id?: string; type: "remove_auth"; provider: string }
  // Settings (full pi settings from SettingsManager)
  | { id?: string; type: "get_pi_settings" }
  | { id?: string; type: "set_pi_setting"; key: string; value: unknown }
  | { id?: string; type: "set_pi_settings"; entries: Array<{ key: string; value: unknown }> }
  // Resources
  | { id?: string; type: "reload_resources" }
  | { id?: string; type: "get_resource_status" };

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

// ============================================================================
// RPC Response Types
// ============================================================================

export interface RpcSessionState {
  model?: { provider: string; id: string };
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  executionMode: "approval" | "unattended" | "read-only";
  steeringMode: "all" | "one-at-a-time";
  followUpMode: "all" | "one-at-a-time";
  sessionFile?: string;
  sessionId: string;
  sessionName?: string;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
  blockImages?: boolean;
  goal?: ThreadGoal;
}

export interface RpcSlashCommand {
  name: string;
  description?: string;
  source: "builtin" | "extension" | "prompt" | "skill";
  sourceInfo: {
    path?: string;
    package?: string;
    name?: string;
  };
}

export type ThreadGoalStatus = "active" | "paused" | "blocked" | "usage_limited" | "budget_limited" | "complete";

export interface ThreadGoal {
  id: string;
  objective: string;
  status: ThreadGoalStatus;
  tokenBudget?: number;
  tokensUsed: number;
  timeUsedMs: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionStats {
  sessionFile: string | undefined;
  sessionId: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  contextUsage?: {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  };
}

export interface ModelInfo {
  provider: string;
  id: string;
  contextWindow?: number;
  reasoning?: boolean;
  thinkingLevels?: ThinkingLevel[];
  input?: ("text" | "image")[];
}

export interface TakeHerEyesSettings {
  enabled: boolean;
  provider?: string;
  modelId?: string;
}

// ============================================================================
// Agent Session Event Types (streamed from the agent session)
// ============================================================================

export type AgentSessionEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: unknown[]; willRetry?: boolean }
  | { type: "turn_start" }
  | { type: "turn_end"; message: unknown; toolResults: unknown[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent?: unknown }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: unknown; partialResult: unknown }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: "file_change"; toolCallId: string; toolName: string; change: FileChangeSummary; aggregate: TurnDiffSummary }
  | { type: "verification_gate"; reason: "file_changes"; summary: TurnDiffSummary }
  | { type: "queue_update"; steering: readonly string[]; followUp: readonly string[] }
  | { type: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
  | { type: "compaction_end"; reason: "manual" | "threshold" | "overflow"; result?: unknown; aborted: boolean; willRetry: boolean; errorMessage?: string }
  | { type: "session_info_changed"; name: string | undefined }
  | { type: "thinking_level_changed"; level: ThinkingLevel }
  | { type: "eye_model_start"; id?: string; provider: string; modelId: string; imageCount: number }
  | { type: "eye_model_end"; id?: string; provider: string; modelId: string; imageCount: number; success: boolean; errorMessage?: string }
  | { type: "goal_update"; goal: ThreadGoal | undefined }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string };

export interface AgentMessage {
  role: string;
  content: string | Array<{ type: string; text?: string }>;
  [key: string]: unknown;
}

export interface ChatMessageAttachment {
  path: string;
  name: string;
  kind: "text" | "image" | "file";
  size?: number;
  content?: string;
}

// ============================================================================
// Display Block Types (derived from events for rendering)
// ============================================================================

export interface ToolWorkItem {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  isError: boolean;
  diff?: DiffSummary;
  fileChange?: FileChangeSummary;
}

export interface DiffSummary {
  added: number;
  removed: number;
}

export interface FileChangeSummary extends DiffSummary {
  path?: string;
  toolCallId: string;
  toolName: string;
  diff?: string;
  patch?: string;
  firstChangedLine?: number;
}

export interface TurnDiffSummary extends DiffSummary {
  files: number;
  changes: FileChangeSummary[];
}

export type DisplayBlock =
  | { id: string; type: "user-message"; text: string; attachments?: ChatMessageAttachment[]; timestamp: number }
  | { id: string; type: "agent-message"; content: string; isStreaming: boolean; timestamp: number }
  | { id: string; type: "thinking"; timestamp: number }
  | { id: string; type: "vision-status"; provider: string; modelId: string; imageCount: number; status: "running" | "success" | "error"; timestamp: number }
  | { id: string; type: "work-status"; tools: ToolWorkItem[]; isStreaming: boolean; timestamp: number; elapsedSeconds?: number }
  | { id: string; type: "turn-separator"; timestamp: number }
  | { id: string; type: "error"; message: string; source?: string; timestamp: number }
  | { id: string; type: "compaction"; reason: string; result: string; aborted: boolean; timestamp: number }
  | { id: string; type: "retry"; success: boolean; attempt: number; maxAttempts: number; delayMs?: number; timestamp: number }
  | { id: string; type: "note"; text: string; timestamp: number }
  | { id: string; type: "status"; status: "running" | "idle" | "error" | "compacting"; timestamp: number }
  | { id: string; type: "guide"; kind: "auth"; message: string; timestamp: number };

// ============================================================================
// Project & Session Info Types
// ============================================================================

export interface ProjectInfo {
  path: string;
  name: string;
  lastOpened: number;
  sessionCount: number;
}

export interface SessionInfo {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
}

// ============================================================================
// Library Types (file tree in the workspace)
// ============================================================================

export interface LibraryNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: LibraryNode[];
}

/** Bytes of a library file. `code` distinguishes failure causes the renderer words differently. */
export interface LibraryFileResult {
  success: boolean;
  data?: Uint8Array;
  code?: "invalid" | "no-root" | "outside" | "not-found" | "too-large" | "read-failed";
  error?: string;
}

export interface ReaderOutlineNode {
  title: string;
  page: number | null;
  items: ReaderOutlineNode[];
}

/** PNG snapshot of a selected PDF page region. */
export interface PageCapture {
  mimeType: string;
  base64: string;
}

// ============================================================================
// Reader Notes Types (workspace .pix-read/notes.json)
// ============================================================================

export type ReaderNoteKind = "excerpt" | "answer";

/**
 * A saved reading note. `docPath` is workspace-relative with forward slashes
 * (original case kept); `page` is 1-based and never clamped here - the main
 * process does not parse PDFs, so an out-of-range page is clamped to the last
 * page by the jump consumer (reader-store).
 */
export interface ReaderNote {
  id: string;
  kind: ReaderNoteKind;
  docPath: string;
  page: number;
  text: string;
  comment: string;
  createdAt: number;
  updatedAt: number;
}

/** Renderer draft: absolute document path, normalized/relativized by the main process. */
export interface ReaderNoteDraft {
  docFilePath: string;
  page: number;
  text: string;
}

export interface ReaderNotesFile {
  version: 1;
  notes: ReaderNote[];
}

export type ReaderNotesErrorCode =
  | "no-root"
  | "outside"
  | "invalid-input"
  | "too-long"
  | "not-found"
  | "corrupt"
  | "version-unsupported"
  | "read-failed"
  | "write-failed"
  | "empty"
  | "not-corrupt";

/** `filePath` is empty only when no workspace root is set; `notes` is empty on failure. */
export interface ReaderNotesLoadResult {
  success: boolean;
  notes: ReaderNote[];
  filePath: string;
  code?: ReaderNotesErrorCode;
  error?: string;
}

/** Mutations return the authoritative full list; `duplicateOf` marks a dedup hit (no new note). */
export interface ReaderNotesMutationResult {
  success: boolean;
  notes: ReaderNote[];
  note?: ReaderNote;
  duplicateOf?: string;
  code?: ReaderNotesErrorCode;
  error?: string;
}

export interface ReaderNotesExportResult {
  success: boolean;
  filePath?: string;
  count?: number;
  code?: ReaderNotesErrorCode;
  error?: string;
}

/** Explicit rebuild of a damaged file: `corrupt` and `version-unsupported` may both be reset. */
export interface ReaderNotesResetResult {
  success: boolean;
  notes: ReaderNote[];
  backupPath?: string;
  code?: ReaderNotesErrorCode;
  error?: string;
}

// ============================================================================
// Reader State Types (workspace .pix-read/reader-state.json)
// ============================================================================

/** 单篇文档的现场：page 1-based；scale 为 reader-store 钳制后的两位小数。 */
export interface ReaderDocState {
  page: number;
  scale: number;
  updatedAt: number;
}

/** 状态文件内存模型。documents 以「比较键（小写 + 正斜杠）」为键；lastDocPath 保留原大小写相对路径。 */
export interface ReaderStateFile {
  version: 1;
  lastDocPath: string | null;
  documents: Record<string, ReaderDocState>;
}

/** 复用 notes 的词表，避免两套码表分叉；本轮这些码只进日志与取证，不进任何文案。 */
export type ReaderStateErrorCode = "no-root" | "outside" | "invalid-input" | "read-failed" | "write-failed";

/** 读侧降级原因。degraded === true ⇔ reason !== undefined。 */
export type ReaderStateDegradeReason = "missing" | "corrupt" | "version-unsupported" | "read-failed";

/** 写入草稿：docFilePath 必须传绝对路径（与 ReaderNoteDraft 同口径）。 */
export interface ReaderStateSaveDraft {
  docFilePath: string;
  page: number;
  scale: number;
}

/** success 仅在「无工作区根」时为 false；state 在降级时为空状态。 */
export interface ReaderStateLoadResult {
  success: boolean;
  state: ReaderStateFile;
  filePath: string;
  degraded: boolean;
  reason?: ReaderStateDegradeReason;
  code?: ReaderStateErrorCode;
  error?: string;
}

/** 失败时 state 恒为空状态（与 ReaderNotesMutationResult 的「失败回传空值」同形），渲染层不得消费失败 payload。 */
export interface ReaderStateSaveResult {
  success: boolean;
  state: ReaderStateFile;
  code?: ReaderStateErrorCode;
  error?: string;
}

// ============================================================================
// GUI Settings Types
// ============================================================================

export interface GuiSettings {
  theme: "light";
  recentProjects: ProjectInfo[];
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: ThinkingLevel;
  takeHerEyes?: TakeHerEyesSettings;
}

// ============================================================================
// Model-initiated User Input
// ============================================================================

export interface RequestUserInputOption {
  label: string;
  description?: string;
}

export interface RequestUserInputQuestion {
  id: string;
  header: string;
  question: string;
  options?: RequestUserInputOption[];
}

export interface RequestUserInputRequest {
  id: string;
  questions: RequestUserInputQuestion[];
}

export interface RequestUserInputResponse {
  id: string;
  answers: Record<string, string>;
  cancelled?: boolean;
}

// ============================================================================
// Auth Types
// ============================================================================

export interface AuthStatus {
  provider: string;
  configured: boolean;
  source?: "stored" | "runtime" | "environment" | "fallback" | "models_json_key" | "models_json_command";
  label?: string;
}

/** Map of provider name -> auth status */
export type AuthStatusMap = Record<string, AuthStatus>;

// ============================================================================
// Session Tree Types
// ============================================================================

export interface TreeEntry {
  id: string;
  parentId: string | null;
  type: string;
  timestamp: string;
  summary?: string;
  messagePreview?: string;
  label?: string;
  labelTimestamp?: number | string;
  children?: TreeEntry[];
}

export interface UserMessageForForking {
  entryId: string;
  text: string;
}

// ============================================================================
// Resource Types
// ============================================================================

export interface ResourceStatus {
  extensions: { loaded: number; errors: string[] };
  skills: { loaded: number };
  prompts: { loaded: number };
}

// ============================================================================
// MCP Types
// ============================================================================

export interface McpServerInfo {
  name: string;
  status: "disconnected" | "connecting" | "connected" | "failed";
  error?: string;
  toolCount: number;
  tools: string[];
  transport: "stdio" | "http" | "sse";
  required: boolean;
  stderr?: string;
}

export interface McpConfigInfo {
  configPaths: string[];
  errors: string[];
}

export interface McpResourceInfo {
  server: string;
  resources: unknown[];
}

export interface McpResourceContent {
  server: string;
  contents: unknown[];
  errors?: string[];
}
