// Independent local origin for simultaneous buyer/supplier sessions; no mocks.
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(''),
    'import.meta.env.VITE_WS_URL': JSON.stringify(''),
  },
  server: {
    host: '127.0.0.1', port: 5181, strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3011', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:3011', ws: true, changeOrigin: true },
    },
  },
});
