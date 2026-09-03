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

export function getLibraryRoot(): string {
  return libraryRoot;
}

export function setLibraryRoot(root: string): void {
  libraryRoot = root ? resolve(root) : "";
}

export function clearLibraryRoot(): void {
  libraryRoot = "";
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

export function isLibraryFilePath(candidatePath: string): boolean {
  if (!libraryRoot) return false;
  const resolved = normalizeFsPath(candidatePath);
  const root = normalizeFsPath(libraryRoot);
  if (!isPathInsideDirectory(resolved, root)) return false;
  try {
    const real = normalizeFsPath(realpathSync(candidatePath));
    if (real !== resolved && !isPathInsideDirectory(real, root)) return false;
  } catch {
    // Missing files still 404 at fetch time; only in-root paths are allowed.
  }
  return true;
}
