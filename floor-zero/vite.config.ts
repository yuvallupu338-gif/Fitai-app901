import { defineConfig } from 'vite';

/**
 * FZ_SINGLE=1 builds everything into one JS chunk and one stylesheet, which
 * tools/build-single.mjs then inlines into a single self-contained HTML file.
 */
const single = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  ?.FZ_SINGLE === '1';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    cssCodeSplit: !single,
    assetsInlineLimit: single ? 100_000_000 : 4096,
    rollupOptions: {
      output: single
        ? { inlineDynamicImports: true, manualChunks: undefined }
        : { manualChunks: { three: ['three'] } },
    },
  },
});
