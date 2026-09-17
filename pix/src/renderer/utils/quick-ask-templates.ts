/**
 * 选区模板动作的纯函数与字面（R17 N97）。
 * 零 import：只被 PdfSelectionQuickAsk.vue / ChatPanel.vue 引用，并被 smoke-view 直驱。
 */

export type TemplateAction = "explain" | "translate";

export const EXPLAIN_TEMPLATE = "请解释选中的这段话在论文中的含义与作用：";
export const TRANSLATE_TEMPLATE = "请把选中的这段话翻译成中文：";

export function templateForAction(action: TemplateAction): string {
  return action === "explain" ? EXPLAIN_TEMPLATE : TRANSLATE_TEMPLATE;
}

/**
 * 草稿替换规则（三分支，冻结）：
 * ① current 为空或纯空白 ⇒ 返回 template；
 * ② current 逐字等于 replaceableTemplates 之一（含首尾空白差异即不匹配）⇒ 返回 template；
 * ③ 其余 ⇒ null（调用方一字不改）。
 */
export function resolveTemplateDraft(
  current: string,
  template: string,
  replaceableTemplates: readonly string[],
): string | null {
  if (current.trim() === "") return template;
  if (replaceableTemplates.includes(current)) return template;
  return null;
}
