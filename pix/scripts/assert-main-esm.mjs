/**
 * Fail the main build if shared/main JS was emitted as CJS, or if preload.cjs
 * is missing. Electron package.json is "type": "module"; a CJS types.js would
 * throw SyntaxError: The requested module does not provide an export named ...
 */
import { access, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distMain = join(root, "dist", "main");
const preloadCjs = join(distMain, "main", "preload.cjs");
const preloadTmp = join(root, "dist", "preload-tmp");

async function walkJs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkJs(full)));
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

try {
  await access(preloadCjs);
} catch {
  console.error("[assert-main-esm] missing dist/main/main/preload.cjs");
  process.exit(1);
}

try {
  await access(preloadTmp);
  await rm(preloadTmp, { recursive: true, force: true });
  console.error("[assert-main-esm] dist/preload-tmp leaked into the package tree; removed it");
} catch {
  // already absent
}

const files = await walkJs(distMain);
const cjs = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  if (text.includes("Object.defineProperty(exports, \"__esModule\"") || /^\s*"use strict";/m.test(text.slice(0, 80))) {
    cjs.push(file.replace(`${root}\\`, "").replace(`${root}/`, ""));
  }
}

if (cjs.length > 0) {
  console.error("[assert-main-esm] CJS leaked into dist/main:\n" + cjs.map((p) => `  ${p}`).join("\n"));
  process.exit(1);
}
