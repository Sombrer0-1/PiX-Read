/**
 * Current library / project root and path-containment helpers.
 *
 * Kept as a leaf module so pdf-tools and the library file readers can guard
 * paths without importing ipc-handlers (ESM cycle).
 */

import { realpathSync } from "fs";
import { isAbsolute, relative, resolve } from "path";

/** Absolute path of the current library / project root. Empty when no workspace is open. */
let libraryRoot = "";
/** realpath 解析后的库根：目录联接/符号链接下与字面根不同（setLibraryRoot 时缓存，失败回退字面）。 */
let libraryRootReal = "";

export function getLibraryRoot(): string {
  return libraryRoot;
}

export function setLibraryRoot(root: string): void {
  libraryRoot = root ? resolve(root) : "";
  libraryRootReal = "";
  if (!libraryRoot) return;
  try {
    libraryRootReal = normalizeFsPath(realpathSync(libraryRoot));
  } catch {
    // 根尚不存在（或不可访问）：只保留字面判定，不能因此拒掉整库
    libraryRootReal = normalizeFsPath(libraryRoot);
  }
}

export function clearLibraryRoot(): void {
  libraryRoot = "";
  libraryRootReal = "";
}

export function isPathInsideDirectory(candidatePath: string, directoryPath: string): boolean {
  const relativePath = relative(directoryPath, candidatePath);
  // Strict containment: the directory itself (relativePath === "") is rejected
  // so passing the sessions directory as the session path cannot wipe it.
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

export function normalizeFsPath(targetPath: string): string {
  const resolved = resolve(targetPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** realpath 归一化；路径不存在或不可访问时返回 null（调用方退回字面判定）。 */
function realPathOrNull(targetPath: string): string | null {
  try {
    return normalizeFsPath(realpathSync(targetPath));
  } catch {
    return null;
  }
}

/**
 * 库内双根判定：字面命中 || （realpath 成功 && 解析根下命中）。
 * 库根本身是目录联接/符号链接时，经联接路径访问的候选只满足字面命中；
 * 经真实路径访问的候选只满足解析命中：两者都必须放行，否则整库被判越界。
 */
function contained(candidateResolved: string, candidateReal: string | null, allowRoot: boolean): boolean {
  const literal = normalizeFsPath(libraryRoot);
  const hit = (root: string, value: string): boolean => (value === root ? allowRoot : isPathInsideDirectory(value, root));
  if (hit(literal, candidateResolved)) return true;
  return candidateReal !== null && hit(libraryRootReal, candidateReal);
}

export function isLibraryFilePath(candidatePath: string): boolean {
  if (!libraryRoot) return false;
  const resolved = normalizeFsPath(candidatePath);
  // 不存在：只保留字面判定（既有语义；缺失文件在读取时 404）
  return contained(resolved, realPathOrNull(candidatePath), false);
}

/**
 * 目录自入围：与 isLibraryFilePath 同一谓词，但额外放行库根自身
 * （library-list 的调用方 LibraryPanel 传的就是 rootDir；严格谓词会拒掉整棵树）。
 */
export function isLibraryDirAllowed(candidatePath: string): boolean {
  if (!libraryRoot) return false;
  const resolved = normalizeFsPath(candidatePath);
  return contained(resolved, realPathOrNull(candidatePath), true);
}

/**
 * 会话目录放行（pdf-tools 的 cwd）：对目录现场求 realpath，语义与库谓词同构。
 * 严格包含：目录自身不放行。
 */
export function isPathInsideDirectoryResolved(candidatePath: string, directoryPath: string): boolean {
  const literalRoot = normalizeFsPath(directoryPath);
  const rootReal = realPathOrNull(directoryPath) ?? literalRoot;
  const hit = (root: string, value: string): boolean => value !== root && isPathInsideDirectory(value, root);
  if (hit(literalRoot, normalizeFsPath(candidatePath))) return true;
  const real = realPathOrNull(candidatePath);
  return real !== null && hit(rootReal, real);
}
