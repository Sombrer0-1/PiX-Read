/**
 * 大输入上限（叶子常量模块：只放常量与说明，不含逻辑、不 import 任何模块）。
 *
 * 约束：不得被 library-root / notes-store / reader-state-store 反向依赖——那三个模块在
 * smoke-notes 的编译面里（required/allowed 逐项比对），多出的 shared/limits.js 会让烟测红。
 * 被 main/pdf-tools.ts 与 main/chat-files.ts（附件上限）引用。
 */

/** PDF 工具整读上限：与 ipc-handlers 的 MAX_READABLE_FILE_BYTES 同口径（256 MB），超出直接拒绝而不是 OOM。 */
export const MAX_PDF_BYTES = 256 * 1024 * 1024;

/** 文本附件上限：超出部分按字节截断读取并在 <file> 标签上注明 truncated-at-bytes。 */
export const MAX_TEXT_ATTACHMENT_BYTES = 1024 * 1024;

/** 图片附件上限：超出直接省略并在 <file> 标签内注明，不再内联进 prompt。 */
export const MAX_IMAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
