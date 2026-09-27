// 临时预览打包配置（用完即删）：只打 UI 预览 bundle 到 /tmp，不过 monkey 插件。
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: '/tmp',
    emptyOutDir: false,
    lib: {
      entry: 'src/preview-ui.ts',
      formats: ['iife'],
      name: 'HvAAPreview',
      fileName: () => 'hvaa-preview.js',
    },
  },
});
