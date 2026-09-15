/**
 * Session Store
 *
 * Manages the current session's event stream and display blocks.
 * Transforms raw AgentSessionEvents into organized DisplayBlocks for rendering.
 *
 * Tool executions are aggregated into a single "work-status" block instead of
 * individual inline blocks. This keeps the chat mainline clean.
 */

import { defineStore } from "pinia";
import { ref } from "vue";
import type { AgentMessage, AgentSessionEvent } from "@/types/rpc";
import type { ChatMessageAttachment, DisplayBlock, ToolWorkItem } from "@/types/session";
import type { ReadingAnchor } from "@shared/types";

function nextBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

interface MessageDisplay {
  text: string;
  attachments: ChatMessageAttachment[];
  noteKind?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function messageTimestamp(message: AgentMessage): number {
  return typeof message.timestamp === "number" ? message.timestamp : Date.now();
}

function attachmentName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function attachmentFromPath(path: string): ChatMessageAttachment {
  return {
    path,
    name: attachmentName(path),
    kind: "file",
  };
}

function normalizeAttachment(value: unknown): ChatMessageAttachment | null {
  if (!isRecord(value) || typeof value.path !== "string") return null;
  const kind = value.kind === "image" || value.kind === "file" || value.kind === "text" ? value.kind : "file";
  return {
    path: value.path,
    name: typeof value.name === "string" ? value.name : attachmentName(value.path),
    kind,
    size: typeof value.size === "number" ? value.size : undefined,
    content: typeof value.content === "string" ? value.content : undefined,
  };
}

function extractContentText(message: AgentMessage): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block): block is { type: "text"; text: string } =>
        block.type === "text" && typeof (block as { text?: unknown }).text === "string")
      .map((block) => (block as { text: string }).text)
      .join("");
  }
  return "";
}

function parseEmbeddedFileBlocks(text: string): { text: string; attachments: ChatMessageAttachment[] } {
  const attachments: ChatMessageAttachment[] = [];
  const stripped = text.replace(/<file name="([^"]*)">\r?\n?([\s\S]*?)\r?\n?<\/file>\r?\n?/g, (_match, path, content) => {
    const filePath = String(path);
    const body = String(content);
    attachments.push({
      path: filePath,
      name: attachmentName(filePath),
      kind: body.trim().startsWith("[Image ") || body.trim().startsWith("Image ") ? "image" : "text",
      content: body,
    });
    return "";
  });
  return { text: stripped.trim(), attachments };
}

function mergeAttachments(...groups: ChatMessageAttachment[][]): ChatMessageAttachment[] {
  const merged = new Map<string, ChatMessageAttachment>();
  for (const group of groups) {
    for (const attachment of group) {
      const key = attachment.path || attachment.name;
      const existing = merged.get(key);
      merged.set(key, {
        ...existing,
        ...attachment,
        content: attachment.content ?? existing?.content,
        size: attachment.size ?? existing?.size,
      });
    }
  }
  return Array.from(merged.values());
}

/**
 * A user bubble the composer rendered before the session confirmed it. The
 * confirmed message may carry extra synthetic attachments (for example
 * "clipboard-image-1" for a page-region screenshot), so reconciliation only
 * requires the optimistic paths to be a subset of the confirmed ones.
 */
interface PendingOptimisticUserMessage {
  blockId: string;
  text: string;
  paths: string[];
  separatorId: string | null;
}

function matchOptimisticUserMessage(
  pending: PendingOptimisticUserMessage[],
  text: string,
  attachments: ChatMessageAttachment[],
): PendingOptimisticUserMessage | undefined {
  const trimmed = text.trim();
  const confirmedPaths = new Set(
    attachments.map((attachment) => attachment.path).filter((path) => !!path),
  );
  return pending.find(
    (item) => item.text === trimmed && item.paths.every((path) => confirmedPaths.has(path)),
  );
}

function extractMessageDisplay(message: AgentMessage): MessageDisplay {
  if (message.role === "custom" && message.customType === "pi.ui_note" && isRecord(message.details)) {
    return {
      text: typeof message.details.text === "string" ? message.details.text : "",
      attachments: [],
      noteKind: typeof message.details.kind === "string" ? message.details.kind : undefined,
    };
  }

  const rawText = extractContentText(message);
  const parsed = parseEmbeddedFileBlocks(rawText);
  const metadataAttachments = Array.isArray(message.attachments)
    ? message.attachments.map(normalizeAttachment).filter((a): a is ChatMessageAttachment => a !== null)
    : [];

  const displayText = typeof message.displayText === "string" ? message.displayText : undefined;
  return {
    text: displayText !== undefined ? displayText : parsed.text,
    attachments: mergeAttachments(metadataAttachments, parsed.attachments),
  };
}

const MAX_EVENTS = 50000;
const MAX_DISPLAY_BLOCKS = 20000;

export const useSessionStore = defineStore("session", () => {
  const events = ref<AgentSessionEvent[]>([]);
  const displayBlocks = ref<DisplayBlock[]>([]);
  const isStreaming = ref(false);
  const errorMessage = ref<string | null>(null);

  let currentAgentBlockId: string | null = null;
  let currentWorkStatusId: string | null = null;
  let currentThinkingBlockId: string | null = null;
  let legacyVisionStatusId: string | null = null;
  let visionStatusIds = new Map<string, string>();
  let optimisticUserMessages: PendingOptimisticUserMessage[] = [];
  let agentStartedAt: number | null = null;

  function freezeWorkStatusElapsed(ws: Extract<DisplayBlock, { type: "work-status" }>): void {
    if (typeof ws.elapsedSeconds === "number") return;
    const start = agentStartedAt ?? ws.timestamp;
    ws.elapsedSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  }

  function removeThinkingBlock(): void {
    if (!currentThinkingBlockId) return;
    const blockId = currentThinkingBlockId;
    displayBlocks.value = displayBlocks.value.filter((block) => block.id !== blockId);
    currentThinkingBlockId = null;
  }

  function showThinkingBlock(timestamp = Date.now()): void {
    if (currentThinkingBlockId) return;
    const block: DisplayBlock = {
      id: nextBlockId(),
      type: "thinking",
      timestamp,
    };
    currentThinkingBlockId = block.id;
    displayBlocks.value.push(block);
  }

  function appendTurnSeparator(timestamp = Date.now()): string | null {
    const last = displayBlocks.value.at(-1);
    if (!last || last.type === "turn-separator") return null;
    const id = nextBlockId();
    displayBlocks.value.push({
      id,
      type: "turn-separator",
      timestamp,
    });
    return id;
  }

  function appendUserOrNoteMessage(msg: AgentMessage): void {
    const display = extractMessageDisplay(msg);
    if (msg.role === "custom" && display.noteKind && display.noteKind !== "user_command") {
      if (display.text) {
        displayBlocks.value.push({
          id: nextBlockId(),
          type: "note",
          text: display.text,
          timestamp: messageTimestamp(msg),
        });
      }
      return;
    }

    if (display.text || display.attachments.length > 0) {
      closeCurrentWorkStatus(true);
      if (msg.role === "user") {
        const optimistic = matchOptimisticUserMessage(optimisticUserMessages, display.text, display.attachments);
        if (optimistic) {
          const optimisticBlock = displayBlocks.value.find((block) => block.id === optimistic.blockId);
          if (optimisticBlock && optimisticBlock.type === "user-message") {
            optimisticBlock.text = display.text;
            optimisticBlock.attachments = display.attachments;
            optimisticBlock.timestamp = messageTimestamp(msg);
          }
          optimisticUserMessages = optimisticUserMessages.filter((item) => item.blockId !== optimistic.blockId);
          return;
        }
        appendTurnSeparator(messageTimestamp(msg));
      }
      displayBlocks.value.push({
        id: nextBlockId(),
        type: "user-message",
        text: display.text,
        attachments: display.attachments,
        timestamp: messageTimestamp(msg),
      });
    }
  }

  /**
   * 第三参：本轮发送时刻的阅读位置快照；null = 无锚点（不写该字段）。
   * 锚点是值拷贝、不落任何文件，随块被 clearSession / 裁剪 / 发送失败一起消失。
   */
  function appendOptimisticUserMessage(
    text: string,
    filePaths: string[] = [],
    anchor: ReadingAnchor | null = null,
  ): string | null {
    const attachments = filePaths.map(attachmentFromPath);
    if (!text.trim() && attachments.length === 0) return null;

    const timestamp = Date.now();
    closeCurrentWorkStatus(true);
    const separatorId = appendTurnSeparator(timestamp);
    const block: DisplayBlock = {
      id: nextBlockId(),
      type: "user-message",
      text: text.trim(),
      attachments,
      timestamp,
      ...(anchor ? { readingAnchor: anchor } : {}),
    };
    displayBlocks.value.push(block);
    optimisticUserMessages.push({
      blockId: block.id,
      text: text.trim(),
      paths: attachments.map((attachment) => attachment.path).sort(),
      separatorId,
    });
    return block.id;
  }

  /**
   * 回答块的轮次锚点（唯一读取处）：向前跳过非 user-message 块，遇第一个 user-message 即终止
   * —— 它有锚点就返回，没有就返回 null。绝不回溯到更早一个带锚点的用户块（那会把上一轮的
   * 锚点当成本轮目标）；块被裁剪或本就不在列表里时同样返回 null，不抛错。
   */
  function readingAnchorFor(blockId: string): ReadingAnchor | null {
    const blocks = displayBlocks.value;
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index < 0) return null;
    for (let i = index - 1; i >= 0; i -= 1) {
      const block = blocks[i];
      if (block.type !== "user-message") continue;
      return block.readingAnchor ?? null;
    }
    return null;
  }

  function failOptimisticUserMessage(blockId: string | null, message: string): void {
    if (!blockId) return;
    const optimistic = optimisticUserMessages.find((item) => item.blockId === blockId);
    if (!optimistic) return;

    const removeIds = new Set([optimistic.blockId]);
    if (optimistic.separatorId) removeIds.add(optimistic.separatorId);
    displayBlocks.value = displayBlocks.value.filter((block) => !removeIds.has(block.id));
    optimisticUserMessages = optimisticUserMessages.filter((item) => item.blockId !== blockId);

    displayBlocks.value.push({
      id: nextBlockId(),
      type: "error",
      message,
      source: "send",
      timestamp: Date.now(),
    });
  }

  function showVisionStatus(event: Extract<AgentSessionEvent, { type: "eye_model_start" }>): void {
    const block: DisplayBlock = {
      id: nextBlockId(),
      type: "vision-status",
      provider: event.provider,
      modelId: event.modelId,
      imageCount: event.imageCount,
      status: "running",
      timestamp: Date.now(),
    };
    if (event.id) {
      visionStatusIds.set(event.id, block.id);
    } else {
      legacyVisionStatusId = block.id;
    }
    displayBlocks.value.push(block);
  }

  function finishVisionStatus(event: Extract<AgentSessionEvent, { type: "eye_model_end" }>): void {
    const blockId = event.id ? visionStatusIds.get(event.id) : legacyVisionStatusId;
    const block = blockId
      ? displayBlocks.value.find((item) => item.id === blockId && item.type === "vision-status")
      : null;
    if (block && block.type === "vision-status") {
      block.status = event.success ? "success" : "error";
      block.timestamp = Date.now();
      if (event.id) {
        visionStatusIds.delete(event.id);
      } else {
        legacyVisionStatusId = null;
      }
      return;
    }
    displayBlocks.value.push({
      id: nextBlockId(),
      type: "vision-status",
      provider: event.provider,
      modelId: event.modelId,
      imageCount: event.imageCount,
      status: event.success ? "success" : "error",
      timestamp: Date.now(),
    });
  }

  function closeCurrentWorkStatus(force = false): void {
    const ws = currentWorkStatusId
      ? displayBlocks.value.find((b) => b.id === currentWorkStatusId && b.type === "work-status")
      : null;
    if (ws && ws.type === "work-status") {
      const hasPending = ws.tools.some((tool) => tool.result === null);
      if (ws.tools.length === 0) {
        // No tools were executed — remove the empty "thinking" block entirely
        displayBlocks.value = displayBlocks.value.filter((block) => block.id !== ws.id);
        currentWorkStatusId = null;
      } else if (!hasPending || force) {
        // All tools done, or agent ended (force) — mark as finished
        ws.isStreaming = false;
        freezeWorkStatusElapsed(ws);
        currentWorkStatusId = null;
      }
      // else: tools still pending — keep currentWorkStatusId so we can
      // find and close this block when tools finish
    } else {
      currentWorkStatusId = null;
    }
  }

  function createAgentBlock(text: string, isStreamingBlock: boolean, timestamp = Date.now()): string {
    removeThinkingBlock();
    closeCurrentWorkStatus();
    const block: DisplayBlock = {
      id: nextBlockId(),
      type: "agent-message",
      content: text,
      isStreaming: isStreamingBlock,
      timestamp,
    };
    displayBlocks.value.push(block);
    return block.id;
  }

  function ensureWorkStatusBlock(timestamp = Date.now()): Extract<DisplayBlock, { type: "work-status" }> {
    let ws = currentWorkStatusId
      ? displayBlocks.value.find(
          (b) => b.id === currentWorkStatusId && b.type === "work-status"
        )
      : undefined;
    if (!ws || ws.type !== "work-status") {
      // The tracked block may have been pruned by the display-block cap;
      // start a fresh one instead of failing the current turn.
      const wsBlock: DisplayBlock = {
        id: nextBlockId(),
        type: "work-status",
        tools: [],
        isStreaming: true,
        timestamp: agentStartedAt ?? timestamp,
      };
      currentWorkStatusId = wsBlock.id;
      displayBlocks.value.push(wsBlock);
      return wsBlock;
    }
    return ws;
  }

  function findWorkStatusForTool(toolCallId: string): Extract<DisplayBlock, { type: "work-status" }> | null {
    for (let i = displayBlocks.value.length - 1; i >= 0; i--) {
      const block = displayBlocks.value[i];
      if (block.type === "work-status" && block.tools.some((tool) => tool.toolCallId === toolCallId)) {
        return block;
      }
    }
    return null;
  }

  function addEvent(event: AgentSessionEvent): void {
    if (events.value.length >= MAX_EVENTS) {
      events.value = events.value.slice(-Math.floor(MAX_EVENTS / 2));
    }
    if (displayBlocks.value.length >= MAX_DISPLAY_BLOCKS) {
      displayBlocks.value = displayBlocks.value.slice(-Math.floor(MAX_DISPLAY_BLOCKS / 2));
    }
    events.value.push(event);
    processEvent(event);
  }

  function processEvent(event: AgentSessionEvent): void {
    switch (event.type) {
      case "agent_start": {
        isStreaming.value = true;
        errorMessage.value = null;
        agentStartedAt = Date.now();
        break;
      }
      case "agent_end": {
        isStreaming.value = false;
        currentAgentBlockId = null;
        removeThinkingBlock();
        closeCurrentWorkStatus(true);
        agentStartedAt = null;
        break;
      }

      case "message_start": {
        const msg = event.message;
        if (msg.role === "user" || msg.role === "custom") {
          if (msg.role === "custom" && msg.display === false) break;
          appendUserOrNoteMessage(msg);
          if (msg.role === "user") {
            showThinkingBlock(messageTimestamp(msg));
          }
        } else if (msg.role === "assistant") {
          const text = extractContentText(msg);
          // Only create agent block when there's real text — skip empty tool-call-only messages
          if (text) {
            currentAgentBlockId = createAgentBlock(text, true);
          }
        }
        break;
      }
      case "message_update": {
        const msg = event.message;
        if (msg.role === "assistant") {
          const text = extractContentText(msg);
          if (!text) return;
          removeThinkingBlock();
          if (!currentAgentBlockId) {
            // First text in this response — create the agent block now
            currentAgentBlockId = createAgentBlock(text, true);
          } else {
            const block = displayBlocks.value.find((b) => b.id === currentAgentBlockId);
            if (block && block.type === "agent-message") {
              block.content = text;
            }
          }
        }
        break;
      }
      case "message_end": {
        if (currentAgentBlockId) {
          const block = displayBlocks.value.find((b) => b.id === currentAgentBlockId);
          if (block && block.type === "agent-message") {
            block.isStreaming = false;
          }
          currentAgentBlockId = null;
        }
        break;
      }

      // Tool lifecycle — aggregate into a single work-status block
      case "eye_model_start": {
        showVisionStatus(event);
        break;
      }

      case "eye_model_end": {
        finishVisionStatus(event);
        break;
      }

      case "tool_execution_start": {
        removeThinkingBlock();
        ensureWorkStatusBlock().tools.push({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          result: null,
          isError: false,
        });
        break;
      }
      case "tool_execution_update": {
        const ws = findWorkStatusForTool(event.toolCallId);
        if (ws && ws.type === "work-status") {
          const tool = ws.tools.find((t) => t.toolCallId === event.toolCallId);
          if (tool) tool.result = event.partialResult;
        }
        break;
      }
      case "tool_execution_end": {
        const ws = findWorkStatusForTool(event.toolCallId);
        if (ws && ws.type === "work-status") {
          const tool = ws.tools.find((t) => t.toolCallId === event.toolCallId);
          if (tool) {
            tool.result = event.result;
            tool.isError = event.isError;
          }
          // Finalize if no more pending tools
          const hasPending = ws.tools.some((t) => t.result === null);
          if (!hasPending) {
            ws.isStreaming = false;
            freezeWorkStatusElapsed(ws);
          }
        }
        break;
      }
      case "file_change": {
        const ws = findWorkStatusForTool(event.toolCallId);
        if (ws && ws.type === "work-status") {
          const tool = ws.tools.find((t) => t.toolCallId === event.toolCallId);
          if (tool) {
            tool.fileChange = event.change;
            tool.diff = { added: event.change.added, removed: event.change.removed };
          }
        }
        break;
      }
      case "verification_gate": {
        break;
      }

      case "compaction_start": {
        displayBlocks.value.push({
          id: nextBlockId(),
          type: "compaction",
          reason: event.reason,
          result: "",
          aborted: false,
          timestamp: Date.now(),
        });
        break;
      }
      case "compaction_end": {
        const compactionSummary =
          (event.result && typeof event.result === "object" && "summary" in event.result
            ? String((event.result as Record<string, unknown>).summary)
            : undefined) ||
          event.errorMessage ||
          "";
        displayBlocks.value.push({
          id: nextBlockId(),
          type: "compaction",
          reason: event.reason,
          result: compactionSummary,
          aborted: event.aborted,
          timestamp: Date.now(),
        });
        break;
      }

      case "auto_retry_start": {
        displayBlocks.value.push({
          id: nextBlockId(),
          type: "retry",
          success: false,
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          delayMs: event.delayMs,
          timestamp: Date.now(),
        });
        break;
      }
      case "auto_retry_end": {
        displayBlocks.value.push({
          id: nextBlockId(),
          type: "retry",
          success: event.success,
          attempt: event.attempt,
          maxAttempts: 0,
          timestamp: Date.now(),
        });
        if (!event.success && event.finalError) {
          errorMessage.value = event.finalError;
          // The retry note alone hides the failure reason; surface it as an error block.
          appendError(event.finalError, "api");
        }
        break;
      }

      case "queue_update": {
        break;
      }
    }
  }

  function addEvents(newEvents: AgentSessionEvent[]): void {
    for (const event of newEvents) {
      addEvent(event);
    }
  }

  /**
   * Load messages from history.
   * AgentMessage = Message (from pi-ai) | CustomAgentMessages.
   * - AssistantMessage: content has TextContent | ThinkingContent | ToolCall blocks
   * - ToolResultMessage: role="toolResult", has toolCallId, toolName, content, isError
   */
  function loadMessages(messages: AgentMessage[]): void {
    clearSession();

    const toolsById = new Map<string, ToolWorkItem>();

    function appendToolCall(block: { type: string; id?: string; name?: string; arguments?: unknown }, timestamp: number): void {
      const toolCallId = block.id || nextBlockId();
      const ws = ensureWorkStatusBlock(timestamp);
      const item: ToolWorkItem = {
        toolCallId,
        toolName: block.name || "task",
        args: block.arguments,
        result: null,
        isError: false,
      };
      ws.tools.push(item);
      toolsById.set(toolCallId, item);
    }

    function finalizeWorkBlocks(): void {
      for (const block of displayBlocks.value) {
        if (block.type === "work-status") {
          block.isStreaming = false;
          if (typeof block.elapsedSeconds !== "number") {
            block.elapsedSeconds = 0;
          }
        }
      }
      currentWorkStatusId = null;
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === "user" || msg.role === "custom") {
        if (msg.role === "custom" && msg.display === false) continue;
        appendUserOrNoteMessage(msg);
      } else if (msg.role === "assistant") {
        const timestamp = messageTimestamp(msg);
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
              createAgentBlock(block.text, false, timestamp);
            } else if (block.type === "toolCall") {
              appendToolCall(block as { type: string; id?: string; name?: string; arguments?: unknown }, timestamp);
            }
          }
        } else {
          const text = extractContentText(msg);
          if (text) createAgentBlock(text, false, timestamp);
        }
      } else if (msg.role === "toolResult") {
        // Match tool result to pending tool
        const tr = msg as {
          role: string; toolCallId: string; toolName: string;
          content: Array<{ type: string; text?: string }>;
          isError: boolean;
        };
        const tool = toolsById.get(tr.toolCallId);
        if (tool) {
          tool.result = tr.content;
          tool.isError = tr.isError;
          if (!tool.toolName && tr.toolName) tool.toolName = tr.toolName;
        }
      }
    }

    finalizeWorkBlocks();
  }

  function appendError(message: string, source = "system"): void {
    displayBlocks.value.push({
      id: nextBlockId(),
      type: "error",
      message,
      source,
      timestamp: Date.now(),
    });
  }

  /** Guidance card in the stream; only the newest block of the same kind survives. */
  function appendGuide(kind: "auth", message: string): void {
    displayBlocks.value = displayBlocks.value.filter(
      (block) => !(block.type === "guide" && block.kind === kind),
    );
    displayBlocks.value.push({
      id: nextBlockId(),
      type: "guide",
      kind,
      message,
      timestamp: Date.now(),
    });
  }

  function clearSession(): void {
    events.value = [];
    displayBlocks.value = [];
    isStreaming.value = false;
    errorMessage.value = null;
    currentAgentBlockId = null;
    currentWorkStatusId = null;
    currentThinkingBlockId = null;
    legacyVisionStatusId = null;
    visionStatusIds = new Map();
    optimisticUserMessages = [];
    agentStartedAt = null;
  }

  function getRawEventsJson(): string {
    return JSON.stringify(events.value, null, 2);
  }

  return {
    events,
    displayBlocks,
    isStreaming,
    errorMessage,
    addEvent,
    addEvents,
    appendOptimisticUserMessage,
    readingAnchorFor,
    failOptimisticUserMessage,
    appendError,
    appendGuide,
    loadMessages,
    clearSession,
    getRawEventsJson,
  };
});
