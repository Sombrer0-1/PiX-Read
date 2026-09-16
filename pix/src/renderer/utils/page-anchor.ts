/**
 * 原文锚点的匹配纯函数（R16 唯一实现点）。
 *
 * 处理流程：片段列表 → 折叠文本（含回溯表）→ 折叠域内的子串命中区间；
 * 折叠域 → 原文域 → DOM Range 的重建由调用方完成（本文件无任何模块依赖、零 DOM、不抛错、不改入参）。
 */

/** 折叠文本与回溯表：text = 折叠域；at[i] = 折叠文本第 i 个字符在「连接后未折叠串」中的下标；假分隔符记 -1。 */
export interface FoldedText {
  text: string;
  at: number[];
}

/** 折叠域内的命中区间（start 含、end 不含，单位 = 折叠域下标）。 */
export interface AnchorRange {
  key: string;
  start: number;
  end: number;
}

/** 一条待匹配的摘录：key 由调用方给出（本轮 = note.id），text = 摘录原文。 */
export interface AnchorExcerpt {
  key: string;
  text: string;
}

/** 折叠后字符数上限：超过即跳过该条摘录。 */
export const MAX_ANCHOR_TEXT_LENGTH = 400;

/** ASCII 空白与常见 Unicode 空白（近似 `\s`；不含 `U+FEFF`/ZWNBSP，夹具与中文不受影响；逐字符判定，不用正则以免把注释里的正则面弄乱）。 */
function isSpace(code: number): boolean {
  return (
    code === 32 || (code >= 9 && code <= 13) || code === 160 || code === 5760 ||
    (code >= 8192 && code <= 8202) || code === 8232 || code === 8233 ||
    code === 8239 || code === 8287 || code === 12288
  );
}

/** 片段列表 → 折叠文本 + 回溯表（片段间假分隔符 + 两侧 trim + 空白折叠为单空格 + 末尾统一小写）。 */
export function foldText(parts: string[]): FoldedText {
  const joined = parts.map((part) => (typeof part === "string" ? part : "")).join("\n");
  const text: string[] = [];
  const at: number[] = [];
  let pendingSpace = false;
  for (let index = 0; index < joined.length; index += 1) {
    const code = joined.charCodeAt(index);
    if (isSpace(code)) {
      pendingSpace = text.length > 0;
      continue;
    }
    if (pendingSpace) {
      text.push(" ");
      at.push(-1); // 折叠出来的空格：回溯到相邻的真实字符（起点侧取后一个，终点侧用 at[end - 1] 取前一个）
      pendingSpace = false;
    }
    text.push(joined[index]);
    at.push(index);
  }
  return { text: text.join("").toLowerCase(), at };
}

/** 页面折叠文本 × 摘录列表 → 已接受的命中区间（首个命中、超长 / 空跳过、重叠整体丢弃、返回顺序 = 被接受输入的子序）。 */
export function matchExcerpts(page: FoldedText, excerpts: AnchorExcerpt[]): AnchorRange[] {
  const accepted: AnchorRange[] = [];
  for (const excerpt of excerpts) {
    const needle = foldText([excerpt.text]).text;
    if (needle === "" || needle.length > MAX_ANCHOR_TEXT_LENGTH) continue;
    const start = page.text.indexOf(needle); // 每页最多一处 = 首个命中
    if (start < 0) continue;
    const end = start + needle.length;
    if (accepted.some((range) => start < range.end && end > range.start)) continue; // 重叠 ⇒ 整体丢弃
    accepted.push({ key: excerpt.key, start, end });
  }
  return accepted;
}
