/** DOM 小工具 */

export function qs<T extends Element = Element>(
  sel: string,
  root: ParentNode = document,
): T | null {
  if (!sel.startsWith('.') && !sel.startsWith('#') && !sel.includes(' ') && !sel.includes('[')) {
    const byId = (root === document ? document.getElementById(sel) : null) as T | null;
    if (byId) return byId;
    // 纯数字技能 id（如 '213'）缺失时 querySelector 会抛 SyntaxError，
    // 这里直接判空，让调用方走 miss/false 路径（异常上浮会跳过看门狗）。
    if (/^\d+$/.test(sel)) return null;
  }
  try {
    return root.querySelector(sel) as T | null;
  } catch {
    return null;
  }
}

export function qsa<T extends Element = Element>(sel: string, root: ParentNode = document): T[] {
  try {
    return [...root.querySelectorAll(sel)] as T[];
  } catch {
    return [];
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
  return document.createElement(tag);
}

export function click(sel: string | Element | null): boolean {
  const node = typeof sel === 'string' ? qs<HTMLElement>(sel) : (sel as HTMLElement | null);
  if (!node) return false;
  node.click();
  return true;
}
