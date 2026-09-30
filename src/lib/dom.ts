/** DOM 小工具：替代原 gE/cE/isOn */

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

/** 技能/物品是否可用：原 isOn 语义 */
export function isOn(id: string | number): Element | false {
  const key = String(id);
  if (Number(key) > 10000) {
    return qs(`.bti3>div[onmouseover*="${key}"]`) ?? false;
  }
  const node = document.getElementById(key);
  return node && (node as HTMLElement).style.opacity !== '0.5' ? node : false;
}

export function click(sel: string | Element | null): boolean {
  const node = typeof sel === 'string' ? qs<HTMLElement>(sel) : (sel as HTMLElement | null);
  if (!node) return false;
  node.click();
  return true;
}

export function openUrl(url: string, newTab = false): void {
  const a = el('a');
  a.href = url;
  a.target = newTab ? '_blank' : '_self';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
