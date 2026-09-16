/**
 * Notes Store
 *
 * 工作区级笔记的渲染层唯一数据源：`notes` 只由主进程返回的全量列表覆盖，不做乐观合并。
 * status / errorCode / errorDetail 只由 loadNotes 与 recoverCorruptNotes 写；摘录、删除、
 * 导出失败只产生瞬时结果，不把整个面板推入错误态。
 * 本文件不拼任何存储路径（存储位置由主进程从资料库根派生）。
 */

import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import type {
  ReaderNote,
  ReaderNoteDraft,
  ReaderNotesErrorCode,
  ReaderNotesMutationResult,
  ReaderNotesReportChapter,
  ReaderNotesStatResult,
} from "@shared/types";
import type { PixApi } from "../../main/preload";
import { useReaderStore } from "./reader-store";
import { useProjectStore } from "./project-store";
import { buildChapterRanges } from "../utils/outline-notes";
import {
  currentDocKey as toDocKey,
  docDisplayName,
  groupNotesByDocument,
  type NoteGroup,
  type PageRange,
} from "../utils/notes-path";
import {
  applyViewToGroups,
  isUndoExpired,
  normalizeQuery,
  UNDO_EXPIRED_MESSAGE,
  type NotesSortMode,
} from "../utils/notes-view";
import { MAX_CONTEXT_NOTES } from "../utils/reading-context";

export type AddNoteResult = { ok: true; duplicate: boolean; page: number } | { ok: false; message: string };
export type ExportNotesResult = { ok: true; filePath: string; count: number } | { ok: false; message: string };

/** 撤销三态：stale = 响应所属的撤销目标已被替换或已复位，调用方必须零副作用。 */
export type UndoDeleteResult = { ok: true } | { ok: false; message: string } | { ok: false; stale: true };

/**
 * 报告导出四态：stale = 归属守卫丢弃（零副作用）；empty = 当前文档 0 条（未发 IPC）；
 * 失败只带主进程 error 原文（面板补前缀）。
 */
export type ExportDocReportResult =
  | { ok: true; filePath: string; displayPath: string; count: number }
  | { ok: false; stale: true }
  | { ok: false; empty: true }
  | { ok: false; message: string };

export interface PendingUndo {
  id: string;
  page: number;
  text: string;
  deletedAt: number;
}

/** backupPath 只在逃生口两类结果上出现：成功 = 新建空库前的备份，失败 = 写失败时仍在的备份。 */
type NotesActionResult = { ok: true; backupPath?: string } | { ok: false; message: string; backupPath?: string };

/** 错误态标题；正文仍以主进程 error 原文（errorDetail）为准。 */
const ERROR_TITLES: Record<ReaderNotesErrorCode, string> = {
  "no-root": "尚未选择资料库根目录",
  outside: "该文档不在当前资料库内",
  "invalid-input": "笔记数据不合法",
  "too-long": "选中内容过长",
  "not-found": "笔记不存在",
  corrupt: "笔记文件无法读取",
  "version-unsupported": "笔记文件版本不支持",
  "read-failed": "笔记文件读取失败",
  "write-failed": "笔记写入失败",
  empty: "暂无笔记可导出",
  "not-corrupt": "笔记文件未损坏",
};

function bridge(): PixApi {
  if (!window.pixApi) {
    throw new Error("PiX preload API is not available.");
  }
  return window.pixApi;
}

/** IPC 被 reject（handler 抛错）也要有可见反馈，不能让动作停在 pending 状态。 */
function rejectMessage(err: unknown): string {
  return `主进程调用异常：${err instanceof Error ? err.message : String(err)}`;
}

export const useNotesStore = defineStore("notes", () => {
  const readerStore = useReaderStore();
  const projectStore = useProjectStore();

  const notes = ref<ReaderNote[]>([]);
  const status = ref<"idle" | "loading" | "ready" | "error">("idle");
  const errorCode = ref<ReaderNotesErrorCode | null>(null);
  const errorDetail = ref("");
  const notesFilePath = ref("");
  const lastExport = ref<{ filePath: string; count: number; at: number } | null>(null);
  /** 最近一次成功的单文档报告：displayName 取发起瞬间的保大小写显示名（不承载任何存储路径）。 */
  const lastReport = ref<{ filePath: string; displayPath: string; displayName: string; count: number } | null>(null);
  const currentDocOnly = ref(false);

  /** 搜索输入原串（不 trim/不归一化存值）；是否生效只看派生 searchActive。 */
  const searchQuery = ref("");
  const sortMode = ref<NotesSortMode>("page");
  /** 撤销行只存展示与时限四项；还原载荷完全由主进程槽提供（渲染层无法伪造正文）。 */
  const pendingUndo = ref<PendingUndo | null>(null);

  /** 外部改动标记：只在 store 内部改写；唯一渲染条件 = 面板提示行的 v-if。 */
  const externalChange = ref(false);

  /**
   * 章节过滤：视图状态，非消费式（持续生效直到显式清除或文档作用域失效）；
   * label 只接受 buildChapterRanges 的产出，不在本文件拼第二份页码文本。
   */
  const chapterFilter = ref<{ title: string; label: string; start: number; end: number } | null>(null);
  /** 一次性聚焦请求信号：单调递增（focusChapter 每次 +1），resetNotes 归 0；复位不构成聚焦请求。 */
  const chapterFocusToken = ref(0);
  /** 页标记定位的目标页号（一次性载荷；与 chapterFocusToken 同纪律：复位不清不构成定位请求）。 */
  const pageFocusPage = ref<number | null>(null);
  /** 一次性页定位请求信号：单调递增（每次点击页标记 +1），resetNotes 归 0。 */
  const pageFocusToken = ref(0);

  /**
   * 选择集只存 id，整组替换式更新（不做就地 add/delete）；允许含失效 id，
   * 计数、上限与注入一律取派生结果，故删除/重载后不产生幽灵条目。
   */
  const selectedNoteIds = ref<ReadonlySet<string>>(new Set());

  /** 竞态序号：loadSeq 丢弃过期 load；writeSeq 让已完成的变更不被先发起的 load 覆盖。 */
  let loadSeq = 0;
  let writeSeq = 0;
  /** 撤销作用域令牌：resetNotes() 递增，跨工作区的在途响应一律丢弃（守卫②）。 */
  let undoScope = 0;
  /** 报告作用域令牌：与 undoScope 同处同语义（跨工作区/跨文档的在途报告一律丢弃）。 */
  let reportScope = 0;
  /** 指纹请求序号（R14）：响应落地时序号已变即丢弃（resetNotes() 递增 ⇒ 跨工作区在途作废）。 */
  let notesFileSeq = 0;
  /** 指纹基线（R14）：null = 尚未捕获（比对时按捕获处理）；"" = 文件缺失；其余 = sha256 十六进制。 */
  let notesFingerprint: string | null = null;

  const totalCount = computed(() => notes.value.length);
  const hasNotes = computed(() => notes.value.length > 0);
  const activeQuery = computed(() => normalizeQuery(searchQuery.value));
  const searchActive = computed(() => activeQuery.value !== "");
  const currentDocKey = computed(() => toDocKey(readerStore.filePath, projectStore.currentProject?.path ?? ""));
  const chapterRange = computed<PageRange | null>(() =>
    chapterFilter.value ? { start: chapterFilter.value.start, end: chapterFilter.value.end } : null
  );
  // 搜索与排序的唯一管道：分组、章节/文档过滤保持 R9 语义，视图维度只在其之后追加
  const groups = computed<NoteGroup[]>(() =>
    applyViewToGroups(
      groupNotesByDocument(notes.value, currentDocKey.value, currentDocOnly.value, chapterRange.value),
      activeQuery.value,
      sortMode.value
    )
  );
  /** V：列表实际渲染行数之和（计数与空态判别的唯一定点，面板不再自行求和）。 */
  const visibleCount = computed(() => groups.value.reduce((sum, group) => sum + group.notes.length, 0));
  /**
   * 当前文档的笔记条数：与视图维度（搜索/排序/章节过滤/仅看当前文档）无关
   * —— 报告导出的空库判据只认这个数，不写第二处文档归属比较。
   */
  const currentDocNoteCount = computed(() => {
    const key = currentDocKey.value;
    if (key === null) return 0;
    const groups = groupNotesByDocument(notes.value, key, true);
    return groups.length > 0 ? groups[0].notes.length : 0;
  });

  // 文档作用域：切文档/关文档即清除章节过滤（token 不变 ⇒ 不触发标签切换，也不发 notesLoad）
  watch(currentDocKey, () => {
    chapterFilter.value = null;
    // 文档作用域切换即清除报告行：上一份报告不属于当前文档
    lastReport.value = null;
  });
  const errorMessage = computed(() => (errorCode.value ? ERROR_TITLES[errorCode.value] : "") || errorDetail.value);
  const selectedNotes = computed<ReaderNote[]>(() => notes.value.filter((n) => selectedNoteIds.value.has(n.id)));
  const selectedCount = computed(() => selectedNotes.value.length);
  const selectionFull = computed(() => selectedNotes.value.length >= MAX_CONTEXT_NOTES);

  /** 只有 success === true 的变更才覆盖本地列表（失败时主进程回传的 notes 恒为空）。 */
  function applyNotes(next: ReaderNote[]): void {
    notes.value = next;
    writeSeq += 1;
    // 写操作成功即证明数据可用：面板若停在 loading/error（变更先于 load 落地、或错误态下写入成功）
    // 必须在此复位，否则后续 load 结果被丢弃后没有任何东西能把状态推出来
    if (status.value !== "ready") {
      status.value = "ready";
      errorCode.value = null;
      errorDetail.value = "";
    }
    externalChange.value = false;
    void syncNotesFile("capture");
  }

  /**
   * 指纹同步（唯一入口）：capture = 重新对标；compare = 置 / 清 externalChange。
   * 失败静默：IPC reject、success !== true、非字符串 hash 三种情形一律 return（保持现状：不置位、不清除、不弹错、不写日志）。
   */
  async function syncNotesFile(mode: "capture" | "compare"): Promise<void> {
    const seq = ++notesFileSeq;
    let result: ReaderNotesStatResult;
    try {
      result = await bridge().notesStat();
    } catch {
      return;
    }
    if (seq !== notesFileSeq) return;
    if (!result || result.success !== true || typeof result.hash !== "string") return;
    const fingerprint = result.exists ? result.hash : "";
    if (mode === "capture") {
      notesFingerprint = fingerprint;
      return;
    }
    if (notesFingerprint === null) {
      notesFingerprint = fingerprint;
      return;
    }
    externalChange.value = fingerprint !== notesFingerprint;
  }

  /** 检测入口（面板焦点监听唯一调用点）。 */
  async function checkNotesFile(): Promise<void> {
    await syncNotesFile("compare");
  }

  async function loadNotes(): Promise<void> {
    const seq = ++loadSeq;
    const startWriteSeq = writeSeq;
    status.value = "loading";
    try {
      const result = await bridge().notesLoad();
      // 过期结果（更新的 load、或已完成的变更）不得覆盖当前状态
      if (seq !== loadSeq || startWriteSeq !== writeSeq) {
        // 仍是最新一次 load：只丢弃数据不动状态机，路径用于展示，缺失会让错误态少一个「在文件夹中显示」
        if (seq === loadSeq) notesFilePath.value = result.filePath;
        return;
      }
      notesFilePath.value = result.filePath;
      if (result.success) {
        notes.value = result.notes;
        status.value = "ready";
        errorCode.value = null;
        errorDetail.value = "";
        externalChange.value = false;
        void syncNotesFile("capture");
        return;
      }
      status.value = "error";
      errorCode.value = result.code ?? null;
      errorDetail.value = result.error ?? "";
    } catch (err) {
      // 与成功分支同一守卫：已完成的写（writeSeq 递增）之后到达的 load reject 不得把面板推入 error 态
      if (seq !== loadSeq || startWriteSeq !== writeSeq) return;
      status.value = "error";
      errorCode.value = null;
      errorDetail.value = rejectMessage(err);
    }
  }

  async function addNote(draft: ReaderNoteDraft): Promise<AddNoteResult> {
    try {
      const result = await bridge().notesAdd(draft);
      if (!result.success) return { ok: false, message: result.error ?? "摘录失败" };
      applyNotes(result.notes);
      // 去重命中时主进程不返回新条目，页码仍取草稿值（去重键已含页码）
      return result.note
        ? { ok: true, duplicate: false, page: result.note.page }
        : { ok: true, duplicate: true, page: draft.page };
    } catch (err) {
      return { ok: false, message: rejectMessage(err) };
    }
  }

  async function runMutation(call: (api: PixApi) => Promise<ReaderNotesMutationResult>): Promise<NotesActionResult> {
    try {
      const result = await call(bridge());
      if (!result.success) return { ok: false, message: result.error ?? "笔记操作失败" };
      applyNotes(result.notes);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: rejectMessage(err) };
    }
  }

  async function updateNoteComment(id: string, comment: string): Promise<NotesActionResult> {
    return runMutation((api) => api.notesUpdate(id, comment));
  }

  async function removeNote(id: string): Promise<NotesActionResult> {
    try {
      const result = await bridge().notesDelete(id);
      if (!result.success) return { ok: false, message: result.error ?? "删除失败" };
      applyNotes(result.notes);
      // 缺载荷 = 内部不一致（删除已真实落盘）：必须非静默，且不产生撤回不了的撤销行
      if (!result.note) return { ok: false, message: "删除已生效，但未收到撤销数据（内部不一致）" };
      pendingUndo.value = { id, page: result.note.page, text: result.note.text, deletedAt: Date.now() };
      return { ok: true };
    } catch (err) {
      return { ok: false, message: rejectMessage(err) };
    }
  }

  /**
   * 撤销最近一次删除：无槽/已过期在发 IPC 之前返回；两条 stale 守卫必须在 applyNotes 之前
   * —— 迟到响应不得复活新删除的条目，也不得把上一个工作区的列表写进已复位的 store。
   */
  async function undoDelete(): Promise<UndoDeleteResult> {
    const pending = pendingUndo.value;
    if (pending === null) return { ok: false, message: UNDO_EXPIRED_MESSAGE };
    if (isUndoExpired(pending.deletedAt, Date.now())) return { ok: false, message: UNDO_EXPIRED_MESSAGE };
    const scope = undoScope;
    try {
      const result = await bridge().notesRestore(pending.id);
      if (scope !== undoScope) return { ok: false, stale: true };
      if (pendingUndo.value !== null && pendingUndo.value.id !== pending.id) return { ok: false, stale: true };
      if (!result.success) return { ok: false, message: result.error ?? "撤销失败" };
      applyNotes(result.notes);
      pendingUndo.value = null;
      return { ok: true };
    } catch (err) {
      if (scope !== undoScope) return { ok: false, stale: true };
      return { ok: false, message: rejectMessage(err) };
    }
  }

  async function exportMarkdown(): Promise<ExportNotesResult> {
    try {
      const result = await bridge().notesExport();
      if (!result.success || !result.filePath) return { ok: false, message: result.error ?? "导出失败" };
      const count = result.count ?? 0;
      lastExport.value = { filePath: result.filePath, count, at: Date.now() };
      return { ok: true, filePath: result.filePath, count };
    } catch (err) {
      return { ok: false, message: rejectMessage(err) };
    }
  }

  /**
   * 单文档报告导出：章节范围与阅读进度只取既有派生，路径一律由主进程回传（本文件不拼存储路径）。
   * 守卫顺序 = 判据：归属缺失 → 空库（不发 IPC）→ 发起快照 → 在途归属守卫（成功与失败同一处理）。
   */
  async function exportCurrentDocReport(): Promise<ExportDocReportResult> {
    const docKey = currentDocKey.value;
    const filePath = readerStore.filePath;
    // ① 归属缺失（无当前文档 / 库外文件）：按钮已禁用；动作级防御与在途归属守卫同语义（丢弃、零副作用）
    if (docKey === null || !filePath) return { ok: false, stale: true };
    // ② 当前文档 0 条 ⇒ 不发 IPC、不写任何文件（文案由面板渲染，store 不持有字面）
    if (currentDocNoteCount.value === 0) return { ok: false, empty: true };
    // ③ 发起瞬间快照：归属令牌 + 显示名（保原大小写）
    const scope = reportScope;
    const displayName = docDisplayName(filePath);
    const pageCount = readerStore.pageCount;
    // ④ 章节只取自既有唯一派生（顺序 = Map 插入序）；pageCount === 0 时不派生，避免 Infinity 外泄
    const chapters =
      pageCount > 0
        ? [...buildChapterRanges(readerStore.outline, pageCount).values()].map(
            (range): ReaderNotesReportChapter => ({
              title: range.title,
              start: range.start,
              end: range.end,
              label: range.label,
            }),
          )
        : [];
    const progress = pageCount > 0 ? { page: readerStore.page, pageCount } : null;
    try {
      const result = await bridge().notesExportReport({ docFilePath: filePath, chapters: chapters, progress: progress });
      // ⑤ 在途归属守卫：文档已切换或 store 已复位 ⇒ 丢弃结果（成功与失败同一处理）
      if (scope !== reportScope || currentDocKey.value !== docKey) return { ok: false, stale: true };
      if (!result.success || !result.filePath || !result.displayPath) {
        return { ok: false, message: result.error ?? "生成报告失败" };
      }
      const count = result.count ?? 0;
      lastReport.value = { filePath: result.filePath, displayPath: result.displayPath, displayName, count };
      return { ok: true, filePath: result.filePath, displayPath: result.displayPath, count };
    } catch (err) {
      if (scope !== reportScope || currentDocKey.value !== docKey) return { ok: false, stale: true };
      return { ok: false, message: rejectMessage(err) };
    }
  }

  async function recoverCorruptNotes(): Promise<NotesActionResult> {
    try {
      const result = await bridge().notesReset();
      if (!result.success) return { ok: false, message: result.error ?? "重建失败", backupPath: result.backupPath };
      notes.value = result.notes;
      writeSeq += 1;
      status.value = "ready";
      errorCode.value = null;
      errorDetail.value = "";
      externalChange.value = false;
      void syncNotesFile("capture");
      return { ok: true, backupPath: result.backupPath };
    } catch (err) {
      return { ok: false, message: rejectMessage(err) };
    }
  }

  /** 跨工作区残留防护：goHome 与工作区卸载时各调一次；同时作废在途 load 与在途撤销。 */
  function resetNotes(): void {
    loadSeq += 1;
    undoScope += 1;
    reportScope += 1;
    notesFileSeq += 1;
    notesFingerprint = null;
    externalChange.value = false;
    notes.value = [];
    status.value = "idle";
    errorCode.value = null;
    errorDetail.value = "";
    notesFilePath.value = "";
    lastExport.value = null;
    lastReport.value = null;
    currentDocOnly.value = false;
    chapterFilter.value = null;
    chapterFocusToken.value = 0;
    pageFocusPage.value = null;
    pageFocusToken.value = 0;
    searchQuery.value = "";
    sortMode.value = "page";
    pendingUndo.value = null;
    clearNoteSelection();
  }

  function setCurrentDocOnly(value: boolean): void {
    currentDocOnly.value = value;
  }

  function setSearchQuery(value: string): void {
    searchQuery.value = value;
  }

  function clearSearchQuery(): void {
    searchQuery.value = "";
  }

  function setSortMode(mode: NotesSortMode): void {
    sortMode.value = mode;
  }

  function clearPendingUndo(): void {
    pendingUndo.value = null;
  }

  /**
   * 徽标点击入口：只写过滤状态 + 发一次性聚焦信号；不跳页、不改标签、不清选择集、不发 IPC。
   * currentDocKey === null（资料库外文件）时 no-op：此时地图上也没有可点击入口。
   */
  function focusChapter(input: { title: string; start: number; end: number; label: string }): void {
    if (currentDocKey.value === null) return;
    chapterFilter.value = { title: input.title, label: input.label, start: input.start, end: input.end };
    chapterFocusToken.value += 1;
  }

  /** 清除只把过滤置 null：不改标签、不改阅读位置、不改选择集、不写盘、不发 IPC。 */
  function clearChapterFilter(): void {
    chapterFilter.value = null;
  }

  /**
   * 页标记点击入口：一次性定位（滚动 + 瞬时高亮），不新增任何持久过滤维度。
   * 唯一被改动的视图状态 = 既有章节过滤被单向清除（直接寻址优先于范围限制）；
   * 搜索 / 排序 / 仅看当前文档 / 选择集 / 阅读位置 / 缩放零变化。
   * currentDocKey === null（资料库外文件）时 no-op：此时页标记本就不渲染。
   */
  function focusPageNotes(page: number): void {
    if (currentDocKey.value === null) return;
    chapterFilter.value = null;
    pageFocusPage.value = page;
    pageFocusToken.value += 1;
  }

  function isNoteSelected(id: string): boolean {
    return selectedNoteIds.value.has(id);
  }

  /** 上限守卫用派生计数判（失效 id 不占名额）：未选且已满 ⇒ no-op。 */
  function toggleNoteSelected(id: string): void {
    if (isNoteSelected(id)) {
      selectedNoteIds.value = new Set([...selectedNoteIds.value].filter((noteId) => noteId !== id));
      return;
    }
    if (selectionFull.value) return;
    selectedNoteIds.value = new Set([...selectedNoteIds.value, id]);
  }

  /** 「追问」的替换语义：id 不在最新清单 ⇒ 返回 false 且零副作用（不改集合、不发信号、不聚焦）。 */
  function replaceSelectionWith(id: string): boolean {
    if (!notes.value.some((note) => note.id === id)) return false;
    selectedNoteIds.value = new Set([id]);
    return true;
  }

  function clearNoteSelection(): void {
    selectedNoteIds.value = new Set();
  }

  return {
    notes,
    status,
    errorCode,
    errorDetail,
    notesFilePath,
    lastExport,
    lastReport,
    currentDocOnly,
    searchQuery,
    activeQuery,
    searchActive,
    sortMode,
    pendingUndo,
    externalChange,
    visibleCount,
    chapterFilter,
    chapterFocusToken,
    pageFocusPage,
    pageFocusToken,
    selectedNotes,
    selectedCount,
    selectionFull,
    totalCount,
    hasNotes,
    currentDocKey,
    chapterRange,
    currentDocNoteCount,
    groups,
    errorMessage,
    loadNotes,
    checkNotesFile,
    addNote,
    updateNoteComment,
    removeNote,
    exportMarkdown,
    exportCurrentDocReport,
    recoverCorruptNotes,
    resetNotes,
    setCurrentDocOnly,
    setSearchQuery,
    clearSearchQuery,
    setSortMode,
    undoDelete,
    clearPendingUndo,
    focusChapter,
    clearChapterFilter,
    focusPageNotes,
    isNoteSelected,
    toggleNoteSelected,
    replaceSelectionWith,
    clearNoteSelection,
  };
});
