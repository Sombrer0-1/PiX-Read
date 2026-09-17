/**
 * 快捷键总览的只读数据源（R17 N96）。
 * 冻结：3 组 / 18 行；组件只按 keys.join(SHORTCUT_KEY_JOIN) 与 desc 渲染，不得手写键位文案。
 * 本文件零 import（与 page-anchor.ts / notes-path.ts 同范式）。
 */

export interface ShortcutRow {
  keys: string[];
  desc: string;
}

export interface ShortcutSection {
  title: string;
  rows: ShortcutRow[];
}

export const SHORTCUT_KEY_JOIN = " / ";

export const SHORTCUT_SECTIONS: readonly ShortcutSection[] = [
  {
    title: "阅读区（打开文档后）",
    rows: [
      { keys: ["/"], desc: "打开文档搜索" },
      { keys: ["Ctrl+F"], desc: "打开文档搜索" },
      { keys: ["PageUp", "←"], desc: "上一页" },
      { keys: ["PageDown", "→"], desc: "下一页" },
      { keys: ["Home"], desc: "跳到第一页" },
      { keys: ["End"], desc: "跳到最后一页" },
      { keys: ["["], desc: "上一节" },
      { keys: ["]"], desc: "下一节" },
      { keys: ["Esc"], desc: "退出框选模式或关闭文档搜索" },
    ],
  },
  {
    title: "输入框",
    rows: [
      { keys: ["Enter"], desc: "发送消息（对话输入框）" },
      { keys: ["Shift+Enter"], desc: "换行（对话输入框）" },
      { keys: ["Enter"], desc: "下一处（文档搜索框）" },
      { keys: ["Shift+Enter"], desc: "上一处（文档搜索框）" },
      { keys: ["Enter"], desc: "跳转到该页（页码输入框）" },
      { keys: ["Esc"], desc: "取消页码输入（页码输入框）" },
      { keys: ["Esc"], desc: "清空搜索并移出焦点（笔记搜索框）" },
      { keys: ["Enter"], desc: "提交重命名（对话名称输入框）" },
    ],
  },
  {
    title: "工作区",
    rows: [{ keys: ["?"], desc: "打开或关闭本总览" }],
  },
];

export const SHORTCUT_NOTE = "选区浮层（选中文本后出现，无键位）：问 AI / 解释 / 翻译 / 摘录";
