import { defineConfig } from 'vite';

export default defineConfig({
  base: './',                                // works from any sub-folder on a static host
  build: { chunkSizeWarningLimit: 1000 },    // three.js alone is ~700 kB before gzip
});
