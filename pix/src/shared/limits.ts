/**
 * 大输入上限（叶子常量模块：只放常量与说明，不含逻辑、不 import 任何模块）。
 *
 * 约束：不得被 library-root / notes-store / reader-state-store 反向依赖——那三个模块在
 * smoke-notes 的编译面里（required/allowed 逐项比对），多出的 shared/limits.js 会让烟测红。
 * 目前只被 main/pdf-tools.ts 引用；F17b（附件上限）启用后由 chat-files 侧引用。
 */

/** PDF 工具整读上限：与 ipc-handlers 的 MAX_READABLE_FILE_BYTES 同口径（256 MB），超出直接拒绝而不是 OOM。 */
export const MAX_PDF_BYTES = 256 * 1024 * 1024;

/** F17b 预留：文本附件上限。产品口径（文本截断 vs 图片拒绝）未裁决前不被引用；数值随裁决调整。 */
export const MAX_TEXT_ATTACHMENT_BYTES = 1024 * 1024;

/** F17b 预留：图片附件上限。产品口径未裁决前不被引用；数值随裁决调整。 */
export const MAX_IMAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
