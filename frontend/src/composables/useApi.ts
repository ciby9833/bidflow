/**
 * 文件：frontend/src/composables/useApi.ts
 * 功能：封装 Axios 实例，统一注入 JWT、超时与 401 处理。
 * 交互：被前端 store 与各页面调用；对接后端所有 REST 接口。
 * 作者：吴川
 */
import axios from 'axios';
import { i18n } from '../i18n';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  timeout: 15000,
});

// Inject JWT + 当前 locale on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // 把 vue-i18n 当前 locale 通过 X-Locale 发给后端，后端用于翻译错误消息、Excel 表头等。
  config.headers['X-Locale'] = i18n.global.locale.value;
  return config;
});

// Normalize error responses
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const url = err.config?.url ?? '';
    const isPublicAuthRequest = url.startsWith('/api/auth/login') || url.startsWith('/api/auth/supplier-register');
    if (err.response?.status === 401 && !isPublicAuthRequest) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);
