/**
 * 文件：frontend/vite.config.ts
 * 功能：定义前端 Vite 构建配置。
 * 交互：被 Vite dev/build 命令读取；影响前端工程的打包、代理与开发端口。
 * 作者：吴川
 */
import { defineConfig } from 'vite';
import { loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devPort = Number(env.FRONTEND_DEV_PORT ?? 5173);

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
    server: {
      host: '0.0.0.0',
      port: Number.isFinite(devPort) ? devPort : 5173,
      strictPort: false,
      proxy: {
        '/api': { target: env.VITE_API_BASE_URL ?? 'http://localhost:3000', changeOrigin: true },
        '/ws': { target: env.VITE_WS_URL ?? 'ws://localhost:3000', ws: true, changeOrigin: true },
      },
    },
  };
});
