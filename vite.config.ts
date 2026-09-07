import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Build config for the extension UI pages (app, popup, print) + static assets.
 * The background service worker has its own build (vite.bg.config.ts) so it is
 * emitted as a single self-contained IIFE file (MV3 service workers cannot
 * load shared chunks).
 */
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    // allow preview hosts (e.g. sandboxed *.e2b.app) to reach the dev server
    allowedHosts: true,
  },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'index.html'),
        popup: resolve(__dirname, 'popup.html'),
        print: resolve(__dirname, 'print.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
