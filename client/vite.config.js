import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  root: 'client',
  optimizeDeps: {
    exclude: ['@ternlight/mini'],
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    fs: {
      allow: [projectRoot],
    },
    proxy: {
      '/api': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
});
