import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
    // Three.js is intentionally its own cacheable ~548 KB / ~137 KB gzip chunk.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Cache the large 3D engine independently of gameplay/UI updates.
          if (id.includes("/node_modules/three/")) return "three";
        },
      },
    },
  },
  server: { host: "0.0.0.0", allowedHosts: true },
  preview: { host: "0.0.0.0", allowedHosts: true },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
