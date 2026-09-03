/**
 * Settings Store
 *
 * GUI settings + PiX-owned storage locations. The previous fake PixApi used as
 * a browser-preview fallback is gone: every call now goes through the real
 * preload contract, so removing an IPC channel from PixApi stops typechecking.
 * Without the bridge (plain Vite preview) reads/writes are skipped instead of
 * being satisfied by stubs.
 */

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { GuiSettings } from "@/types/session";
import type { PixApi } from "../../main/preload";
import type { PixStoragePaths } from "../../main/pix-paths";

function api(): PixApi | null {
  if (!window.pixApi) {
    console.error("[settings-store] pixApi 不可用，preload 可能未加载");
    return null;
  }
  return window.pixApi;
}

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<GuiSettings>({
    theme: "light",
    recentProjects: [],
  });
  const storagePaths = ref<PixStoragePaths | null>(null);
  const isLoaded = ref(false);

  async function load(): Promise<void> {
    const bridge = api();
    if (!bridge) return;
    settings.value = await bridge.getSettings();
    storagePaths.value = await bridge.getStoragePaths();
    isLoaded.value = true;
  }

  async function save(partial: Partial<GuiSettings>): Promise<void> {
    const bridge = api();
    if (!bridge) return;
    await bridge.setSettings(partial);
    settings.value = { ...settings.value, ...partial };
  }

  return {
    settings,
    storagePaths,
    isLoaded,
    load,
    save,
    theme: computed(() => settings.value.theme),
    recentProjects: computed(() => settings.value.recentProjects),
  };
});
