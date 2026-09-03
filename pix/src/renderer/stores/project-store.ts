/**
 * Project Store
 *
 * Manages the current workspace (project) and its session list.
 */

import { defineStore } from "pinia";
import { ref } from "vue";
import type { ProjectInfo, SessionInfo } from "@/types/session";

function api() {
  if (!window.pixApi) {
    throw new Error("PiX preload API is not available.");
  }
  return window.pixApi;
}

function normalizePath(path: string | undefined): string {
  return (path || "").replace(/\\/g, "/").toLowerCase();
}

export const useProjectStore = defineStore("project", () => {
  const recentProjects = ref<ProjectInfo[]>([]);
  const currentProject = ref<ProjectInfo | null>(null);
  const sessions = ref<SessionInfo[]>([]);
  const currentSession = ref<SessionInfo | null>(null);
  const isLoadingSessions = ref(false);

  async function loadSettings(): Promise<void> {
    try {
      const settings = await api().getSettings();
      recentProjects.value = settings.recentProjects || [];
    } catch {
      // Settings not available yet
    }
  }

  async function openProject(dirPath: string): Promise<void> {
    const name = dirPath.split(/[/\\]/).pop() || dirPath;

    currentProject.value = {
      path: dirPath,
      name,
      lastOpened: Date.now(),
      sessionCount: 0,
    };

    // Save to recent projects
    try {
      const settings = await api().getSettings();
      const existing = (settings.recentProjects || []).findIndex((p: ProjectInfo) => p.path === dirPath);
      let updated: ProjectInfo[];
      if (existing !== -1) {
        // Remove from old position and move to front
        updated = [...settings.recentProjects];
        const [moved] = updated.splice(existing, 1);
        updated.unshift({ ...moved, lastOpened: Date.now(), name });
      } else {
        updated = [
          { path: dirPath, name, lastOpened: Date.now(), sessionCount: 0 },
          ...(settings.recentProjects || []),
        ].slice(0, 20);
      }
      await api().setSettings({ recentProjects: updated });
      recentProjects.value = updated;
    } catch {
      // Non-critical
    }

    await listSessions();
  }

  async function removeRecentProject(path: string): Promise<void> {
    const next = recentProjects.value.filter((project) => project.path !== path);
    recentProjects.value = next;
    try {
      const settings = await api().getSettings();
      const latest = (settings.recentProjects || []).filter((project: ProjectInfo) => project.path !== path);
      await api().setSettings({ recentProjects: latest });
    } catch (err) {
      console.error("[project-store] Failed to remove recent project:", err);
      await loadSettings();
    }
  }

  function setCurrentProject(project: ProjectInfo | null): void {
    currentProject.value = project;
  }

  async function listSessions(): Promise<void> {
    const project = currentProject.value;
    if (!project) return;
    isLoadingSessions.value = true;
    try {
      const sessionInfos = await api().listSessions(project.path);
      if (Array.isArray(sessionInfos)) {
        if (currentProject.value?.path !== project.path) return;
        sessions.value = sessionInfos;
        currentProject.value.sessionCount = sessionInfos.length;
      }
    } catch (err) {
      console.error("[project-store] Failed to list sessions:", err);
    } finally {
      isLoadingSessions.value = false;
    }
  }

  function setCurrentSession(session: SessionInfo | null): void {
    currentSession.value = session;
  }

  function syncCurrentSession(sessionFile: string | undefined, sessionId: string | undefined): SessionInfo | null {
    const normalizedSessionFile = normalizePath(sessionFile);
    const match = sessions.value.find((session) => {
      if (normalizedSessionFile && normalizePath(session.path) === normalizedSessionFile) return true;
      return !!sessionId && session.id === sessionId;
    });

    currentSession.value = match ?? null;
    return currentSession.value;
  }

  function addSession(session: SessionInfo): void {
    const existing = sessions.value.findIndex((s) => s.id === session.id);
    if (existing !== -1) {
      sessions.value[existing] = session;
    } else {
      sessions.value.unshift(session);
    }
    if (currentProject.value) {
      currentProject.value.sessionCount = sessions.value.length;
    }
  }

  return {
    recentProjects,
    currentProject,
    sessions,
    currentSession,
    isLoadingSessions,
    loadSettings,
    openProject,
    setCurrentProject,
    listSessions,
    removeRecentProject,
    setCurrentSession,
    syncCurrentSession,
    addSession,
  };
});
