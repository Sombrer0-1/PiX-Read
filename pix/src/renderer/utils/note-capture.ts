/**
 * 摘录的页码解析（渲染层唯一实现点，纯函数）。
 *
 * 只做「选区锚点 → [data-page] 页节点」的几何映射；原文归一化、长度限额与
 * 绝对路径换算都在别处（归一化/限额在主进程，路径走 notes-path.ts）。
 */

function readPage(el: Element): number | null {
  const raw = el instanceof HTMLElement ? el.dataset.page : undefined;
  if (!raw) return null;
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? page : null;
}

/** 选区锚点所在的 [data-page] 页节点 → 页码；失败时按选区矩形命中的页节点回退；跨页取起始页。 */
export function resolveSelectionPage(range: Range, stage: HTMLElement): number | null {
  let node: Element | null = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  while (node && node !== stage && stage.contains(node)) {
    const page = readPage(node);
    if (page !== null) return page;
    node = node.parentElement;
  }

  // 锚点不在页节点内：用选区顶边做纵向命中，命中失败取垂直距离最近的页节点
  const probe = range.getBoundingClientRect().top + 1;
  let nearest: { page: number; distance: number } | null = null;
  for (const el of stage.querySelectorAll<HTMLElement>("[data-page]")) {
    const page = readPage(el);
    if (page === null) continue;
    const box = el.getBoundingClientRect();
    if (probe >= box.top && probe <= box.bottom) return page;
    const distance = box.top > probe ? box.top - probe : probe - box.bottom;
    if (!nearest || distance < nearest.distance) nearest = { page, distance };
  }
  return nearest?.page ?? null;
}
