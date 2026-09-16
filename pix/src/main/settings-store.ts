/**
 * GUI Settings Store
 *
 * Persistent storage for PiX GUI settings, written to the PiX-owned
 * %APPDATA%/PiX-Read/pix-settings.json (see pix-paths.ts).
 */

import { existsSync, mkdirSync, renameSync } from "fs";
import { dirname } from "path";
import Store from "electron-store";
import type { GuiSettings, ProjectInfo, ThinkingLevel } from "../shared/types.js";
import { pixGuiSettingsFile } from "./pix-paths.js";

const defaultSettings: GuiSettings = {
  theme: "light",
  recentProjects: [],
  defaultProvider: undefined,
  defaultModel: undefined,
  defaultThinkingLevel: "xhigh",
  takeHerEyes: { enabled: false },
};

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecentProject(value: unknown): value is ProjectInfo {
  if (!isRecord(value)) return false;
  return (
    typeof value.path === "string" &&
    value.path.length > 0 &&
    typeof value.name === "string" &&
    typeof value.lastOpened === "number" &&
    typeof value.sessionCount === "number"
  );
}

/** 形状校验：conf 只保证「能解析成 JSON」，字段类型仍是任意值；非法字段一律回落默认值。 */
function sanitizeGuiSettings(raw: unknown): GuiSettings {
  const value = isRecord(raw) ? raw : {};
  const settings: GuiSettings = { ...defaultSettings, recentProjects: [] };
  if (value.theme === "light") settings.theme = value.theme;
  if (Array.isArray(value.recentProjects)) settings.recentProjects = value.recentProjects.filter(isRecentProject);
  if (typeof value.defaultProvider === "string") settings.defaultProvider = value.defaultProvider;
  if (typeof value.defaultModel === "string") settings.defaultModel = value.defaultModel;
  if (THINKING_LEVELS.includes(value.defaultThinkingLevel as ThinkingLevel)) {
    settings.defaultThinkingLevel = value.defaultThinkingLevel as ThinkingLevel;
  }
  if (isRecord(value.takeHerEyes)) {
    const eyes = value.takeHerEyes;
    if (typeof eyes.enabled === "boolean") {
      settings.takeHerEyes = {
        enabled: eyes.enabled,
        ...(typeof eyes.provider === "string" ? { provider: eyes.provider } : {}),
        ...(typeof eyes.modelId === "string" ? { modelId: eyes.modelId } : {}),
      };
    }
  }
  return settings;
}

/** 备份文件后缀用紧凑格式：yyyyMMdd-HHmmss（与 notes-store 同规则）。 */
function formatStampDashed(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * 坏设置文件的唯一逃生口：坏文件挪成同名唯一备份，原字节不丢。
 * Windows 上 renameSync 会静默覆盖同名目标，因此同一秒内的第二次启动必须换名。
 */
function backupInvalidSettingsFile(filePath: string, now: number): string {
  const base = `${filePath}.corrupt-${formatStampDashed(now)}`;
  let target = base;
  for (let index = 2; existsSync(target); index += 1) target = `${base}-${index}`;
  mkdirSync(dirname(filePath), { recursive: true });
  renameSync(filePath, target);
  return target;
}

export class SettingsStore {
  private store: Store<GuiSettings>;

  constructor() {
    this.store = SettingsStore.openStore();
  }

  /**
   * conf 在构造期就同步读盘：JSON 损坏时 `store` getter 会把 SyntaxError 直接重抛，
   * 应用随之启动不了。这里捕获后把坏文件挪走再重建 —— 文件已不在原处，
   * conf 走 ENOENT 分支，用 defaults 重建并落盘，用户至少能进设置页。
   */
  private static openStore(): Store<GuiSettings> {
    const options = { name: "pix-settings", cwd: dirname(pixGuiSettingsFile), defaults: defaultSettings };
    try {
      return new Store<GuiSettings>(options);
    } catch (err) {
      const backupPath = backupInvalidSettingsFile(pixGuiSettingsFile, Date.now());
      console.warn(
        `[settings] pix-settings.json 读取失败，已备份为 ${backupPath}：${err instanceof Error ? err.message : String(err)}`
      );
      return new Store<GuiSettings>(options);
    }
  }

  getAll(): GuiSettings {
    return sanitizeGuiSettings(this.store.store);
  }

  get<K extends keyof GuiSettings>(key: K): GuiSettings[K] {
    return this.store.get(key);
  }

  set<K extends keyof GuiSettings>(key: K, value: GuiSettings[K]): void {
    this.store.set(key, value);
  }

  setMany(settings: Partial<GuiSettings>): void {
    if (Object.hasOwn(settings, "theme") && settings.theme !== undefined) {
      this.store.set("theme", settings.theme);
    }
    if (Object.hasOwn(settings, "recentProjects") && settings.recentProjects !== undefined) {
      this.store.set("recentProjects", settings.recentProjects);
    }
    if (Object.hasOwn(settings, "defaultProvider")) {
      if (settings.defaultProvider === undefined) {
        this.store.delete("defaultProvider");
      } else {
        this.store.set("defaultProvider", settings.defaultProvider);
      }
    }
    if (Object.hasOwn(settings, "defaultModel")) {
      if (settings.defaultModel === undefined) {
        this.store.delete("defaultModel");
      } else {
        this.store.set("defaultModel", settings.defaultModel);
      }
    }
    if (Object.hasOwn(settings, "defaultThinkingLevel")) {
      if (settings.defaultThinkingLevel === undefined) {
        this.store.delete("defaultThinkingLevel");
      } else {
        this.store.set("defaultThinkingLevel", settings.defaultThinkingLevel);
      }
    }
    if (Object.hasOwn(settings, "takeHerEyes")) {
      if (settings.takeHerEyes === undefined) {
        this.store.delete("takeHerEyes");
      } else {
        this.store.set("takeHerEyes", settings.takeHerEyes);
      }
    }
  }

  addRecentProject(path: string, name: string): void {
    const projects = this.store.get("recentProjects") || [];
    const existing = projects.findIndex((p: ProjectInfo) => p.path === path);
    if (existing !== -1) {
      projects[existing] = {
        ...projects[existing],
        lastOpened: Date.now(),
        name,
      };
    } else {
      projects.unshift({
        path,
        name,
        lastOpened: Date.now(),
        sessionCount: 0,
      });
    }
    // Keep only 20 recent projects
    this.store.set("recentProjects", projects.slice(0, 20));
  }

  removeRecentProject(path: string): void {
    const projects = this.store.get("recentProjects") || [];
    this.store.set(
      "recentProjects",
      projects.filter((p: ProjectInfo) => p.path !== path)
    );
  }
}
