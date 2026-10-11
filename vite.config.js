import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works both locally and under /claude-theft-auto-bombay/ on GitHub Pages
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
  preview: { port: 4173, strictPort: true },
});
