/**
 * Native file dialog helpers.
 */

import { BrowserWindow, dialog } from "electron";

export async function selectProjectDirectory(parent: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(parent, {
    title: "选择资料库目录",
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

export async function selectChatFiles(parent: BrowserWindow): Promise<string[]> {
  const result = await dialog.showOpenDialog(parent, {
    title: "选择附件",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "所有文件", extensions: ["*"] }],
  });
  return result.canceled ? [] : result.filePaths;
}
