<script setup lang="ts">
/**
 * AppLayout - Three-panel workspace shell
 *
 * ┌────────┬────────────────────────┬────────┐
 * │ Left   │ Center                 │ Right  │
 * │        │ (topbar+content+       │        │
 * │        │  composer internal)    │        │
 * └────────┴────────────────────────┴────────┘
 *
 * A thin drag bar owns the frameless window's draggable strip, so the window
 * controls stay clickable. Left and Right are full-height. Center manages its
 * own internal header / content / composer structure.
 * Left can collapse so reader + chat take the remaining width; below 960px the
 * chat pane becomes an overlay the user can open and close.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

defineProps<{
  leftCollapsed?: boolean;
}>();

const NARROW_QUERY = "(max-width: 959px)";
const narrow = ref(window.matchMedia(NARROW_QUERY).matches);
const chatOpen = ref(false);

const chatVisible = computed(() => !narrow.value || chatOpen.value);

function onNarrowChange(event: MediaQueryListEvent): void {
  narrow.value = event.matches;
  if (!event.matches) chatOpen.value = false;
}

let mediaQuery: MediaQueryList | null = null;

onMounted(() => {
  mediaQuery = window.matchMedia(NARROW_QUERY);
  narrow.value = mediaQuery.matches;
  mediaQuery.addEventListener("change", onNarrowChange);
});

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener("change", onNarrowChange);
  mediaQuery = null;
});
</script>

<template>
  <div class="app-shell">
    <div class="pix-drag-bar"></div>

    <div class="app-layout" :class="{ 'left-collapsed': leftCollapsed }">
      <aside v-show="!leftCollapsed" class="layout-left">
        <slot name="left" />
      </aside>

      <main class="layout-center">
        <slot name="center" />
      </main>

      <aside v-show="chatVisible" class="layout-right" :class="{ 'chat-overlay': narrow }">
        <div v-if="narrow" class="chat-overlay-bar">
          <span class="chat-overlay-title">Agent 对话</span>
          <button
            type="button"
            class="chat-overlay-close"
            title="收起对话面板"
            aria-label="收起对话面板"
            @click="chatOpen = false"
          >
            <v-icon size="16">mdi-close</v-icon>
          </button>
        </div>
        <div class="chat-slot">
          <slot name="right" />
        </div>
      </aside>

      <button
        v-if="narrow && !chatOpen"
        type="button"
        class="chat-open-btn"
        title="打开对话面板"
        aria-label="打开对话面板"
        @click="chatOpen = true"
      >
        <v-icon size="16">mdi-chat-outline</v-icon>
        <span>对话</span>
      </button>

      <slot name="overlay" />
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--pix-bg-app);
}

.app-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
  gap: 8px;
  padding: 4px 12px 10px 10px;
  background: var(--pix-bg-app);
}

.layout-left {
  width: var(--pix-left-width);
  min-width: var(--pix-left-width);
  background: var(--pix-bg-left);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-xl);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--pix-shadow-sm);
}

.layout-center {
  flex: 1;
  min-width: 0;
  background: var(--pix-bg-content);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--pix-shadow-sm);
  position: relative;
  z-index: 1;
}

.layout-right {
  width: var(--pix-right-width);
  min-width: var(--pix-right-width);
  background: var(--pix-bg-right);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-xl);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--pix-shadow-sm);
}

.chat-slot {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.chat-overlay-bar {
  display: none;
}

.left-collapsed .layout-left {
  display: none;
}

@media (max-width: 959px) {
  .app-layout {
    gap: 6px;
    padding: 4px 8px 8px;
  }

  .layout-left {
    width: 220px;
    min-width: 220px;
  }

  /* Chat becomes an overlay above the reader instead of disappearing, so the
   * narrow layout still gives the conversation a full-height column. */
  .layout-right.chat-overlay {
    position: absolute;
    top: 4px;
    right: 8px;
    bottom: 8px;
    width: min(var(--pix-right-width), calc(100% - 16px));
    min-width: 0;
    z-index: 20;
    box-shadow: var(--pix-shadow-lg);
  }

  .chat-overlay-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 6px 6px 12px;
    border-bottom: 1px solid var(--pix-border-light);
    flex-shrink: 0;
  }

  .chat-overlay-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--pix-text-secondary);
  }

  .chat-overlay-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--pix-text-secondary);
    cursor: pointer;
    padding: 0;
  }

  .chat-overlay-close:hover {
    background: var(--pix-bg-hover);
    color: var(--pix-text-primary);
  }

  .chat-open-btn {
    position: absolute;
    right: 14px;
    bottom: 22px;
    z-index: 15;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 14px;
    border: 1px solid var(--pix-border-light);
    border-radius: 999px;
    background: var(--pix-bg-elevated);
    box-shadow: var(--pix-shadow-md);
    color: var(--pix-text-primary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .chat-open-btn:hover {
    background: var(--pix-bg-hover);
  }
}
</style>
