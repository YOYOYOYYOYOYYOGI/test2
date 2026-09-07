import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Standalone build for the Manifest V3 background service worker.
 * Output: dist/background.js (single IIFE, no shared chunks).
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: false,
    minify: 'esbuild',
    lib: {
      entry: resolve(__dirname, 'src/background/index.ts'),
      formats: ['iife'],
      name: 'OrderLabelManagerBackground',
      fileName: () => 'background.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
