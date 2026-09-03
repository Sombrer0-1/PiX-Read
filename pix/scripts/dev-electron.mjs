/**
 * Dev-only electron launcher.
 *
 * `npm run dev` serves the renderer with Vite, but Electron inherited no env
 * vars, so main/index.ts fell back to the stale dist build and HMR never
 * reached the app window. This wrapper injects the dev-server URL and marks
 * NODE_ENV before spawning Electron.
 */
import { spawn } from "node:child_process";

const viteServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";

const child = spawn("electron", ["."], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    NODE_ENV: "development",
    VITE_DEV_SERVER_URL: viteServerUrl,
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
