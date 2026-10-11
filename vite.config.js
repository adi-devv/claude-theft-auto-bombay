import { defineConfig } from 'vite';

export default defineConfig({
  build: { chunkSizeWarningLimit: 2000 },
  preview: { port: 4173, strictPort: true },
});
