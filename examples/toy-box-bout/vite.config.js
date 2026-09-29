import { defineConfig } from 'vite';

// base './' so the build works from any static host sub-folder.
export default defineConfig({
  base: './',
  server: { host: true },
  build: { chunkSizeWarningLimit: 900 },
});
