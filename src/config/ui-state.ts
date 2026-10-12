import { writable } from 'svelte/store';

export const panelOpen = writable(false);
export const activeTab = writable('Main');
