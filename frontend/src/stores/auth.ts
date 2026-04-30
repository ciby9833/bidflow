/**
 * 文件：frontend/src/stores/auth.ts
 * 功能：维护前端登录态、用户资料与能力集，并统一处理登录、退出。
 * 交互：被 router/index.ts、LayoutView.vue 和业务页面调用；通过 useApi.ts 请求后端 auth.controller.ts。
 * 作者：吴川
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../composables/useApi';
import { router } from '../router';

export interface AuthUser {
  id: string;
  email: string;
  loginName?: string;
  displayName: string;
  role: string;
  accountType?: string;
  supplierId?: string;
  supplierName?: string;
  supplierStatus?: string;
  supplierReviewStatus?: string;
  supplierRelationRole?: string;
  needsSupplierBinding?: boolean;
  employeeId?: string;
  fullName?: string;
  locale: string;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'));
  const user = ref<AuthUser | null>(null);
  const scopes = ref<string[]>([]);

  const isLoggedIn = computed(() => !!token.value);

  function hasScope(scope: string) {
    return scopes.value.includes('*') || scopes.value.includes(scope);
  }

  function applyAuthSession(session: {
    accessToken: string;
    user: AuthUser;
    scopes?: string[];
    redirect?: string;
  }, redirectOverride?: string) {
    token.value = session.accessToken;
    user.value = session.user;
    scopes.value = session.scopes ?? [];
    localStorage.setItem('token', session.accessToken);
    router.replace(redirectOverride ?? session.redirect ?? '/hall');
  }

  async function login(login: string, password: string, redirectOverride?: string) {
    const res = await api.post('/api/auth/login', { login, password });
    const {
      accessToken, user: u, scopes: grantedScopes, redirect,
    } = res.data.data;
    applyAuthSession({
      accessToken, user: u, scopes: grantedScopes, redirect,
    }, redirectOverride);
    if (!grantedScopes) await loadCapabilities();
    return res.data.data;
  }

  async function loadCapabilities() {
    const res = await api.get('/api/auth/me/capabilities');
    scopes.value = res.data.data.scopes;
  }

  async function loadMe() {
    if (!token.value) return;
    try {
      const res = await api.get('/api/auth/me');
      user.value = res.data.data.user;
      scopes.value = res.data.data.capabilities;
    } catch {
      logout();
    }
  }

  async function logout(redirectOverride = '/login') {
    try {
      if (token.value) await api.post('/api/auth/logout');
    } catch {
      // ignore logout network errors and clear client state anyway
    }
    token.value = null;
    user.value = null;
    scopes.value = [];
    localStorage.removeItem('token');
    router.push(redirectOverride);
  }

  return { token, user, scopes, isLoggedIn, hasScope, applyAuthSession, login, loadMe, logout };
});
