import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { AuthStatusMap } from "@/types/rpc";
import { useRpc } from "@/composables/useRpc";

type AuthStatusValue = AuthStatusMap[keyof AuthStatusMap];
type AuthSource = NonNullable<AuthStatusValue["source"]>;

/** 内核上报的凭据来源。PiX 默认清理了环境变量，所以 environment 一般不会出现。 */
const authSourceLabels: Record<AuthSource, string> = {
  stored: "PiX 内保存",
  runtime: "运行时注入",
  environment: "环境变量",
  fallback: "自定义解析",
  models_json_key: "models.json 密钥",
  models_json_command: "models.json 命令",
};

export function authSourceLabel(source?: AuthSource): string {
  return source ? authSourceLabels[source] : "";
}

/**
 * Auth Store
 *
 * Manages authentication status for model providers.
 * Reads auth state from the pi AuthStorage through SessionBridge;
 * the key file lives in the PiX-Read data directory (see pix-paths.ts).
 */
export const useAuthStore = defineStore("auth", () => {
  const authStatus = ref<AuthStatusMap>({});
  const isLoaded = ref(false);

  const configuredProviders = computed(() =>
    Object.entries(authStatus.value)
      .filter(([, status]) => status.configured)
      .map(([name]) => name)
  );

  const unconfiguredProviders = computed(() =>
    Object.entries(authStatus.value)
      .filter(([, status]) => !status.configured)
      .map(([name]) => name)
  );

  const providerCount = computed(() => Object.keys(authStatus.value).length);
  const configuredCount = computed(() => configuredProviders.value.length);

  async function refreshStatus(): Promise<void> {
    const rpc = useRpc();
    if (!rpc.isConnected.value) {
      authStatus.value = {};
      isLoaded.value = false;
      return;
    }
    try {
      const status = await rpc.getAuthStatus();
      if (status) {
        authStatus.value = status;
        isLoaded.value = true;
      }
    } catch (err) {
      console.error("[auth-store] Failed to get auth status:", err);
      isLoaded.value = false;
    }
  }

  function getProviderStatus(provider: string): { configured: boolean; source?: string; label?: string } {
    const status = authStatus.value[provider];
    if (!status) return { configured: false };
    return {
      configured: status.configured,
      source: status.source,
      label: status.label,
    };
  }

  return {
    authStatus,
    isLoaded,
    configuredProviders,
    unconfiguredProviders,
    providerCount,
    configuredCount,
    refreshStatus,
    getProviderStatus,
  };
});
