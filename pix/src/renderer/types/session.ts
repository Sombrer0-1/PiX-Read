/**
 * Session display types for the renderer.
 */

import type { DisplayBlock as SharedDisplayBlock } from "../../shared/types";

/**
 * 渲染层对 vision-status 变体的扩展：主进程在失败（含「主模型不支持图片、
 * 视觉转述未启用」等）时经 eye_model_end.errorMessage 携带原因，展示层据此显示。
 */
type WithVisionStatusError<Block> = Block extends { type: "vision-status" }
  ? Block & { errorMessage?: string }
  : Block;

export type DisplayBlock = WithVisionStatusError<SharedDisplayBlock>;

export type {
  ToolWorkItem,
  ChatMessageAttachment,
  ProjectInfo,
  SessionInfo,
  GuiSettings,
} from "../../shared/types";
