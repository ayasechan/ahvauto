import { DISABLED_KEY } from '../platform/storage-keys';

export function isDisabled(): boolean {
  return localStorage.getItem(DISABLED_KEY) !== null;
}

export function setDisabled(v: boolean): void {
  if (v) localStorage[DISABLED_KEY] = '1';
  else localStorage.removeItem(DISABLED_KEY);
}
