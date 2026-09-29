import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    svelte(),
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'ahvauto',
        description: 'HV auto attack script, TS + Svelte rewrite.',
        version: '3.0.0',
        author: 'dodying',
        namespace: 'https://github.com/dodying/',
        icon: 'https://raw.githubusercontent.com/dodying/UserJs/master/Logo.png',
        match: ['*://hentaiverse.org/*', '*://alt.hentaiverse.org/*'],
        include: ['https://e-hentai.org/news.php'],
        exclude: [
          '*://hentaiverse.org/pages/showequip.php?*',
          '*://alt.hentaiverse.org/pages/showequip.php?*',
        ],
        grant: ['unsafeWindow', 'GM_xmlhttpRequest'],
        connect: ['*'],
        'run-at': 'document-end',
      },
      build: {
        externalGlobals: {},
      },
    }),
  ],
});
