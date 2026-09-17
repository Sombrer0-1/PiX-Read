/**
 * Reader State Store
 *
 * 工作区级阅读现场（.pix-read/reader-state.json）的渲染层唯一数据源。
 * 状态类失败对用户完全不可见：唯一消费点是一行 console.warn("[reader-state] …")，
 * 本文件不产生任何 UI 状态（无 status/error 字段，degraded 不进模板）。
 *
 * 时序纪律（改动前先读 R6-design §3.3/§3.4）：
 * - 快照持续维护（noteLanding / noteChange），flush 只做「同步捕获 + 提交」，绝不回读 readerStore；
 * - ready 之前不落盘：加载窗口里的复位值结构上无法进入快照；
 * - 去重基线 = 已提交的 payload（提交即记账、失败不回滚），并由加载值播种；
 * - 文档身份一律走 currentDocKey（工作区相对比较键），绝对路径只出现在 IPC payload 里。
 * 主进程返回的 state 是唯一真相，这里不拼任何存储路径。
 */

import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { ReaderDocState, ReaderStateFile } from "@shared/types";
import type { PixApi } from "../../main/preload";
import { MAX_SCALE, MIN_SCALE, useReaderStore } from "./reader-store";
import { useProjectStore } from "./project-store";
import { absoluteDocPath, currentDocKey, docDisplayName, docPathKey } from "../utils/notes-path";
import { deriveSessionTitle } from "../utils/session-title";

/** 尾触发去抖窗口：连续翻页/拖滚动条只写停止后的稳定值一次。 */
const DEBOUNCE_MS = 600;

interface ReaderSnapshot {
  /** 工作区相对路径比较键（与 documents / settledKey 同域）。 */
  key: string;
  /** 绝对路径：唯一进 IPC payload 的形态。 */
  filePath: string;
  page: number;
  scale: number;
}

/** R18：一条讨论记录的提交载荷（渲染层内部使用，不导出）。 */
interface DiscussionStamp {
  path: string;
  at: number;
}

/** R18：一篇文档的最近讨论入口的解析结果（无记录 / 会话不在列表 ⇒ null）。 */
export interface DiscussionLink {
  /** 会话文件绝对路径（原样来自现场记录）。 */
  sessionPath: string;
  /** 会话标题（deriveSessionTitle，与历史会话菜单同一规则）。 */
  title: string;
  /** 讨论时刻（现场记录的 lastSessionAt）。 */
  at: number;
  /** 当前文档显示名（docDisplayName(currentKey)）。 */
  docName: string;
}

function bridge(): PixApi {
  if (!window.pixApi) {
    throw new Error("PiX preload API is not available.");
  }
  return window.pixApi;
}

/** 失败只落一行日志：状态问题不得产生面板、toast、禁用态或任何模板分支。 */
function warn(message: string): void {
  console.warn(`[reader-state] ${message}`);
}

export const useReaderStateStore = defineStore("readerState", () => {
  const readerStore = useReaderStore();
  const projectStore = useProjectStore();

  /** 已加载映射（键 = 工作区相对路径比较键）；提交时乐观更新，成功后由主进程 state 覆盖。 */
  const documents = ref<Record<string, ReaderDocState>>({});
  /** 续读入口唯一数据源；docPath 为原大小写相对路径。 */
  const lastDoc = ref<{ docPath: string; page: number; scale: number } | null>(null);
  /** 状态加载已结束（成功或降级都算结束）；快照与提交、续读入口显示的硬前置。 */
  const ready = ref(false);
  const degraded = ref(false);

  /** 内部非响应式状态：竞态序号、去抖、快照、去重基线、落点认领键。 */
  let loadSeq = 0;
  /** 保存世代：resetState 递增，跨复位的迟到 save 响应一律丢弃（不得回灌已清空的 store）。 */
  let saveEpoch = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let snapshot: ReaderSnapshot | null = null;
  let committed: ReaderSnapshot | null = null;
  let settledKey: string | null = null;

  function rootDir(): string {
    return projectStore.currentProject?.path ?? "";
  }

  function toSnapshot(absPath: string, page: number, scale: number): ReaderSnapshot | null {
    const key = currentDocKey(absPath, rootDir());
    if (!key) return null;
    return { key, filePath: absPath, page, scale };
  }

  /** 绝对路径 → 原大小写相对路径（只供展示与续读入口；键运算仍走 currentDocKey）。 */
  function relativeDocPath(absPath: string, root: string): string {
    const normalized = absPath.replace(/\\/g, "/").replace(/\/+$/, "");
    const key = currentDocKey(absPath, root);
    return key ? normalized.slice(normalized.length - key.length) : normalized;
  }

  /** 主进程是唯一写者：lastDocPath 已做过交叉过滤，这里只做形状兜底。 */
  function resolveLastDoc(state: ReaderStateFile): { docPath: string; page: number; scale: number } | null {
    const docPath = state.lastDocPath;
    if (!docPath) return null;
    const root = rootDir();
    const key = currentDocKey(absoluteDocPath(root, docPath), root);
    const entry = key ? state.documents[key] : undefined;
    return entry ? { docPath, page: entry.page, scale: entry.scale } : null;
  }

  function applyState(state: ReaderStateFile): void {
    documents.value = state.documents;
    lastDoc.value = resolveLastDoc(state);
  }

  /** 乐观更新：提交瞬间就把本地模型推到新值；失败不回滚（下一个真实变化自然重写）。 */
  function applyLocal(next: ReaderSnapshot, stamp: DiscussionStamp | null = null): void {
    const previous = documents.value[next.key];
    const carried = stamp
      ? { lastSessionPath: stamp.path, lastSessionAt: stamp.at }
      : previous && previous.lastSessionPath !== undefined && previous.lastSessionAt !== undefined
        ? { lastSessionPath: previous.lastSessionPath, lastSessionAt: previous.lastSessionAt }
        : {};
    documents.value = {
      ...documents.value,
      // stamp 非空时 updatedAt 取发送时刻（与主进程写侧的 Date.now() 相差毫秒级）；未携带时保留既有对
      [next.key]: { page: next.page, scale: next.scale, updatedAt: stamp ? stamp.at : Date.now(), ...carried },
    };
    lastDoc.value = { docPath: relativeDocPath(next.filePath, rootDir()), page: next.page, scale: next.scale };
  }

  async function submit(next: ReaderSnapshot, stamp: DiscussionStamp | null = null): Promise<void> {
    const epoch = saveEpoch;
    try {
      const result = await bridge().readerStateSave({
        docFilePath: next.filePath,
        page: next.page,
        scale: next.scale,
        ...(stamp ? { lastSessionPath: stamp.path, lastSessionAt: stamp.at } : {}),
      });
      // 响应到达前已 resetState（切工作区）：上一轮的状态不得写进本轮的内存模型
      if (epoch !== saveEpoch) return;
      if (result.success) {
        applyState(result.state);
        return;
      }
      warn(`save rejected (${result.code ?? "unknown"}): ${result.error ?? ""}`);
    } catch (err) {
      if (epoch !== saveEpoch) return;
      warn(`save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function submitIfChanged(): void {
    const next = snapshot;
    if (!next) return;
    const base = committed;
    if (base && base.key === next.key && base.page === next.page && base.scale === next.scale) return;
    // 提交即记账：异步 IPC 未回落前再次 flush 不会重复提交；失败不回滚基线（避免同值重试）
    committed = next;
    applyLocal(next);
    void submit(next);
  }

  /** 快照入口：ready 与取值域双闸门；每次被接受的观察都覆盖快照并起/续去抖。 */
  function capture(absPath: string, page: number, scale: number): void {
    if (!ready.value) return;
    if (!Number.isInteger(page) || page < 1) return;
    if (!Number.isFinite(scale) || scale < MIN_SCALE || scale > MAX_SCALE) return;
    const next = toSnapshot(absPath, page, scale);
    if (!next) return;
    snapshot = next;
    if (debounceTimer === null) {
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        submitIfChanged();
      }, DEBOUNCE_MS);
    }
  }

  async function loadReaderState(): Promise<void> {
    const seq = ++loadSeq;
    try {
      const result = await bridge().readerStateLoad();
      // 过期响应（切工作区 / 被 resetState 作废）不写任何状态
      if (seq !== loadSeq) return;
      ready.value = true;
      if (!result.success) {
        // 读取失败（no-root 等）：按空模型继续并记一条日志；ready 必须置位，否则本轮永不落盘
        degraded.value = false;
        applyState(result.state);
        committed = null;
        warn(`load failed (${result.code ?? "unknown"}): ${result.error ?? ""}`);
        return;
      }
      degraded.value = result.degraded;
      applyState(result.state);
      const last = lastDoc.value;
      // 基线播种：它就是文件此刻的内容，因此「打开 lastDoc 且值一致」= 0 次 IPC
      committed = last ? toSnapshot(absoluteDocPath(rootDir(), last.docPath), last.page, last.scale) : null;
      if (degraded.value) warn(`load degraded (${result.reason ?? "unknown"}): ${result.error ?? ""}`);
    } catch (err) {
      if (seq !== loadSeq) return;
      // IPC reject：按空模型继续；ready 必须置位，否则本轮永不落盘
      ready.value = true;
      degraded.value = true;
      applyState({ version: 1, lastDocPath: null, documents: {} });
      committed = null;
      warn(`load failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** 树徽标查询：当前文档取实时页码，其它文档取已加载映射；无记录返回 null（不显示徽标）。 */
  function progressPageFor(absPath: string): number | null {
    const root = rootDir();
    const key = currentDocKey(absPath, root);
    if (!key) return null;
    if (key === currentDocKey(readerStore.filePath, root) && readerStore.pageCount > 0) {
      return readerStore.page;
    }
    return documents.value[key]?.page ?? null;
  }

  /** 恢复意图的唯一登记点（树行 / 续读入口 / 笔记跳转共用）；无记录不登记。 */
  function requestRestoreFor(absPath: string): void {
    const key = currentDocKey(absPath, rootDir());
    if (!key) return;
    const entry = documents.value[key];
    if (!entry) return;
    readerStore.requestRestore(absPath, entry.page, entry.scale);
  }

  /**
   * 每次加载成功后的唯一落点观察。两段式：
   * 认领不受 ready 约束（「该文档已落过点」是事实，否则加载窗口内打开的文档整程不落盘）；
   * 快照受 ready 约束（宁可少写一次，也不把已存的页写成 1）。
   */
  function noteLanding(absPath: string, page: number, scale: number): void {
    const key = currentDocKey(absPath, rootDir());
    if (!key) return;
    settledKey = key;
    capture(absPath, page, scale);
  }

  /** 落点之后的位置/缩放变化观察；四条闸门全过才接受（全部在本文件内）。 */
  function noteChange(absPath: string, page: number, scale: number): void {
    const root = rootDir();
    const key = currentDocKey(absPath, root);
    if (!key || key !== settledKey) return;
    // pageCount === 0 是 openDocument 复位态与加载窗口的判据：复位值 1 结构上无法进入快照
    if (readerStore.pageCount <= 0) return;
    if (key !== currentDocKey(readerStore.filePath, root)) return;
    capture(absPath, page, scale);
  }

  /**
   * R18：发送成功后的记录动作（唯一入口）。五条守卫全过 ⇒ 立即提交（不经 DEBOUNCE_MS、
   * 不写 snapshot / committed）；失败只允许 submit 内既有的一行 warn。
   */
  function noteDiscussion(absPath: string | null, page: number, scale: number, sessionPath: string | null): void {
    if (!ready.value) return;
    if (!absPath || !sessionPath) return;
    if (!Number.isInteger(page) || page < 1) return;
    if (!Number.isFinite(scale) || scale < MIN_SCALE || scale > MAX_SCALE) return;
    const next = toSnapshot(absPath, page, scale);
    if (!next) return;
    const stamp: DiscussionStamp = { path: sessionPath, at: Date.now() };
    applyLocal(next, stamp);
    void submit(next, stamp);
  }

  /** R18：现场记录 × 会话列表 ⇒ 入口 / 标记的唯一数据源；无记录或会话不在列表 ⇒ null。 */
  const currentDiscussion = computed<DiscussionLink | null>(() => {
    const key = currentDocKey(readerStore.filePath, rootDir());
    if (!key) return null;
    const entry = documents.value[key];
    if (!entry) return null;
    const sessionPath = entry.lastSessionPath;
    const sessionAt = entry.lastSessionAt;
    if (sessionPath === undefined || sessionAt === undefined) return null;
    const session = projectStore.sessions.find((item) => docPathKey(item.path) === docPathKey(sessionPath));
    if (!session) return null;
    return { sessionPath, title: deriveSessionTitle(session), at: sessionAt, docName: docDisplayName(key) };
  });

  /** 安全点入口：同步捕获快照 → 去重 → 提交；返回后即可 resetState。 */
  function flush(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    submitIfChanged();
  }

  /** 跨工作区残留防护：清空全部内存与在途状态；调用前必须先 flush（否则丢最后一次现场）。 */
  function resetState(): void {
    loadSeq += 1;
    saveEpoch += 1;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    snapshot = null;
    committed = null;
    settledKey = null;
    documents.value = {};
    lastDoc.value = null;
    ready.value = false;
    degraded.value = false;
  }

  return {
    documents,
    lastDoc,
    ready,
    degraded,
    currentDiscussion,
    loadReaderState,
    progressPageFor,
    requestRestoreFor,
    noteLanding,
    noteChange,
    noteDiscussion,
    flush,
    resetState,
  };
});
