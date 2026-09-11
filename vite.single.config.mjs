import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };
export default defineConfig({
  root: '/home/claude/cnc-vps',
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version + '-demo') },
  build: { outDir: '/tmp/claude-0/-home-claude/08e95335-a0e1-524d-a812-721e8e2e606a/scratchpad/single', emptyOutDir: true, rollupOptions: { output: { inlineDynamicImports: true } }, assetsInlineLimit: 0 },
  resolve: { alias: { 'virtual:pwa-register': '/home/claude/cnc-vps/nosw.mjs' } }
});
