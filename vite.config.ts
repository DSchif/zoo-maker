import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0', // Allow LAN access
    port: 3000,
  },
  build: {
    target: 'ES2020',
  },
  worker: {
    format: 'es',
  },
});
