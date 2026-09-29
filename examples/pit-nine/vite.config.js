import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // works from any folder on a static host
  build: { chunkSizeWarningLimit: 1500 },
});
