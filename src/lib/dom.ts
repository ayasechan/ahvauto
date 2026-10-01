/** DOM 小工具 */

export function qs<T extends Element = Element>(
  sel: string,
  root: ParentNode = document,
): T | null {
  if (!sel.startsWith('.') && !sel.startsWith('#') && !sel.includes(' ') && !sel.includes('[')) {
    const byId = (root === document ? document.getElementById(sel) : null) as T | null;
    if (byId) return byId;
  }
  return root.querySelector(sel) as T | null;
}

export function qsa<T extends Element = Element>(sel: string, root: ParentNode = document): T[] {
  return [...root.querySelectorAll(sel)] as T[];
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
