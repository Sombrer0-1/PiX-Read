<script setup lang="ts">
/**
 * Root App Component
 */
import { onMounted, ref, onUnmounted } from "vue";
import { useSettingsStore } from "./stores/settings-store";
import { useTheme } from "./composables/useTheme";

const settingsStore = useSettingsStore();
const { initTheme } = useTheme();

const windowControlsAvailable = ref(false);

function detectWindowControls(): void {
  const api = window.pixApi;
  windowControlsAvailable.value = Boolean(
    api &&
    typeof api.windowMinimize === "function" &&
    typeof api.windowMaximize === "function" &&
    typeof api.windowClose === "function"
  );
}

// Window controls
const isWindowMaximized = ref(false);
let unsubMaximizeChange: (() => void) | null = null;

onMounted(async () => {
  detectWindowControls();

  try {
    await settingsStore.load();
  } catch (err) {
    console.error("[App] 启动时读取设置失败:", err);
  }
  initTheme();

  // The renderer can be opened directly by Vite for UI inspection. Electron
  // provides the real API through preload; a browser-only preview simply has
  // no window controls to subscribe to.
  if (!windowControlsAvailable.value) return;

  try {
    isWindowMaximized.value = await window.pixApi.windowIsMaximized();
  } catch { /* ignore */ }
  unsubMaximizeChange = window.pixApi.onWindowMaximizeChange((maximized: boolean) => {
    isWindowMaximized.value = maximized;
  });
});

onUnmounted(() => {
  if (unsubMaximizeChange) {
    unsubMaximizeChange();
    unsubMaximizeChange = null;
  }
});

async function windowMinimize(): Promise<void> {
  if (!window.pixApi) return;
  await window.pixApi.windowMinimize();
}

async function windowMaximize(): Promise<void> {
  if (!window.pixApi) return;
  await window.pixApi.windowMaximize();
}

async function windowClose(): Promise<void> {
  if (!window.pixApi) return;
  await window.pixApi.windowClose();
}
</script>

<template>
  <v-app>
    <!-- Global window controls — macOS-style colored dots -->
    <div v-if="windowControlsAvailable" class="window-controls" aria-label="窗口控制">
      <button
        type="button"
        class="win-control win-control-min"
        @click.stop="windowMinimize"
        @pointerdown.stop
        aria-label="最小化"
        title="最小化"
      >
        <span class="window-glyph" aria-hidden="true"></span>
      </button>
      <button
        type="button"
        class="win-control win-control-max"
        @click.stop="windowMaximize"
        @pointerdown.stop
        :aria-label="isWindowMaximized ? '还原窗口' : '最大化窗口'"
        :title="isWindowMaximized ? '还原' : '最大化'"
      >
        <span class="window-glyph" :class="{ restored: isWindowMaximized }" aria-hidden="true"></span>
      </button>
      <button
        type="button"
        class="win-control win-control-close"
        @click.stop="windowClose"
        @pointerdown.stop
        aria-label="关闭窗口"
        title="关闭"
      >
        <span class="window-glyph" aria-hidden="true"></span>
      </button>
    </div>
    <router-view />
  </v-app>
</template>

<style>
/* Global app styles are in assets/styles/main.css */

/* Window controls live in their own hit-test layer. Every app-level header
 * reserves this width so its actions can never sit underneath the controls. */
.window-controls {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 2147483000;
  display: flex;
  width: var(--pix-window-controls-width);
  height: var(--pix-window-controls-height);
  -webkit-app-region: no-drag !important;
  pointer-events: auto !important;
  background: var(--pix-bg-topbar);
  border-left: 1px solid var(--pix-border-light);
  isolation: isolate;
}

.win-control {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 34px;
  border-radius: 0;
  border: none;
  cursor: pointer;
  padding: 0;
  color: var(--pix-text-secondary);
  -webkit-app-region: no-drag !important;
  pointer-events: auto !important;
  user-select: none;
  transition: background-color var(--pix-transition-fast), color var(--pix-transition-fast);
}

.win-control:focus-visible {
  outline: 2px solid var(--pix-accent);
  outline-offset: -4px;
}

.win-control:hover {
  background: var(--pix-bg-hover);
  color: var(--pix-text-primary);
}

.win-control-close:hover {
  background: var(--pix-error);
  color: var(--pix-text-inverse);
}

.window-glyph {
  position: relative;
  display: block;
  width: 10px;
  height: 10px;
  -webkit-app-region: no-drag !important;
  pointer-events: none;
}

.win-control-min .window-glyph::before {
  position: absolute;
  left: 0;
  right: 0;
  top: 5px;
  height: 1px;
  background: currentColor;
  content: "";
}

.win-control-max .window-glyph {
  border: 1px solid currentColor;
}

.win-control-max .window-glyph.restored::before {
  position: absolute;
  top: -3px;
  left: 3px;
  width: 7px;
  height: 7px;
  border: 1px solid currentColor;
  background: var(--pix-bg-topbar);
  content: "";
}

.win-control-close .window-glyph::before,
.win-control-close .window-glyph::after {
  position: absolute;
  left: 4px;
  top: -1px;
  width: 1px;
  height: 12px;
  background: currentColor;
  content: "";
}

.win-control-close .window-glyph::before {
  transform: rotate(45deg);
}

.win-control-close .window-glyph::after {
  transform: rotate(-45deg);
}
</style>
