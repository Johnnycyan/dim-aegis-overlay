import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false, // Kept unminified for auditability and debugging
    sourcemap: false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts'),
        'main-world-content': resolve(__dirname, 'src/main-world-content.ts'),
        popup: resolve(__dirname, 'src/popup.ts'),
        'lightgg-content': resolve(__dirname, 'src/lightgg-content.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});
