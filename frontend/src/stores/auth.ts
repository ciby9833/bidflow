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

/** 用户可访问的机构。role 可空 —— 供应商在组织结构中不占位，没有机构角色。 */
export interface BranchAccess {
  branchId: string;
  branchCode: string;
  branchName: string;
  branchType: 'HQ' | 'BRANCH';
  currency?: string;
  role?: string;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'));
  const user = ref<AuthUser | null>(null);
  const scopes = ref<string[]>([]);
  const branches = ref<BranchAccess[]>([]);
  /**
   * 多机构用户登录后的待选状态。
   * selectionToken 是后端下发的受限令牌，只能用于选择机构 ——
   * 它换不到任何业务数据，因此暂存于内存即可，刻意不落 localStorage：
   * 页面刷新后应重新登录，而不是把一枚半程凭据长期留在浏览器里。
   */
  const pendingSelection = ref<{ selectionToken: string; branches: BranchAccess[] } | null>(null);
  const activeBranchId = ref<string | null>(null);
  const isHq = ref(false);

  const isLoggedIn = computed(() => !!token.value);
  const activeBranch = computed(() => branches.value.find((b) => b.branchId === activeBranchId.value) ?? null);
  /** 仅在用户确实可访问多个机构时才展示切换入口 */
  const canSwitchBranch = computed(() => branches.value.length > 1);

  function hasScope(scope: string) {
    return scopes.value.includes('*') || scopes.value.includes(scope);
  }

  function applyAuthSession(session: {
    accessToken?: string;
    user?: AuthUser;
    requiresBranchSelection?: boolean;
    selectionToken?: string;
    scopes?: string[];
    redirect?: string;
    branches?: BranchAccess[];
    activeBranchId?: string;
  }, redirectOverride?: string) {
    // Google sign-in and password login must both handle the restricted selection response.
    if (session.requiresBranchSelection && session.selectionToken) {
      pendingSelection.value = { selectionToken: session.selectionToken, branches: session.branches ?? [] };
      router.replace('/select-branch');
      return;
    }
    if (!session.accessToken || !session.user) throw new Error('invalid auth session');
    token.value = session.accessToken;
    user.value = session.user;
    scopes.value = session.scopes ?? [];
    branches.value = session.branches ?? [];
    activeBranchId.value = session.activeBranchId ?? null;
    isHq.value = activeBranch.value?.branchType === 'HQ';
    localStorage.setItem('token', session.accessToken);
    router.replace(redirectOverride ?? session.redirect ?? '/hall');
  }

  async function login(login: string, password: string, redirectOverride?: string) {
    const res = await api.post('/api/auth/login', { login, password });

    // 多机构且无可用的上次选择：后端不发放正式令牌，先去选机构
    if (res.data.data?.requiresBranchSelection) {
      pendingSelection.value = {
        selectionToken: res.data.data.selectionToken,
        branches: res.data.data.branches ?? [],
      };
      router.replace('/select-branch');
      return res.data.data;
    }

    const {
      accessToken, user: u, scopes: grantedScopes, redirect,
      branches: branchList, activeBranchId: activeId,
    } = res.data.data;
    applyAuthSession({
      accessToken, user: u, scopes: grantedScopes, redirect,
      branches: branchList, activeBranchId: activeId,
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
      // 刷新页面后据此恢复切换器状态
      branches.value = res.data.data.branches ?? [];
      activeBranchId.value = res.data.data.activeBranchId ?? null;
      isHq.value = res.data.data.isHq ?? false;
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
    branches.value = [];
    activeBranchId.value = null;
    isHq.value = false;
    localStorage.removeItem('token');
    router.push(redirectOverride);
  }

  /**
   * 切换当前机构。
   * 由后端校验归属并重新签发 Token —— 前端不持有、也无法伪造机构范围。
   * 切换后整页重载，避免各页面残留上一机构的数据。
   */
  async function switchBranch(branchId: string) {
    const res = await api.post('/api/auth/branches/switch', { branchId });
    const d = res.data.data;
    token.value = d.accessToken;
    localStorage.setItem('token', d.accessToken);
    branches.value = d.branches ?? [];
    activeBranchId.value = d.activeBranchId ?? null;
    // Detail URLs and mobile back stacks belong to the previous institution.
    sessionStorage.removeItem('bidflow:mobile:tabState');
    window.location.replace(window.location.pathname.startsWith('/m/') ? '/m/hall' : '/hall');
  }

  /** 用受限令牌完成机构选择，换取正式会话 */
  async function completeBranchSelection(branchId: string) {
    const pending = pendingSelection.value;
    if (!pending) throw new Error('no pending selection');
    const res = await api.post('/api/auth/branches/select', {
      selectionToken: pending.selectionToken,
      branchId,
    });
    const d = res.data.data;
    pendingSelection.value = null;
    applyAuthSession({
      accessToken: d.accessToken,
      user: d.user,
      scopes: d.scopes,
      redirect: d.redirect,
      branches: d.branches,
      activeBranchId: d.activeBranchId,
    });
    if (!d.scopes) await loadCapabilities();
    return d;
  }

  function clearPendingSelection() {
    pendingSelection.value = null;
  }

  return {
    token, user, scopes, branches, activeBranchId, isHq,
    pendingSelection, completeBranchSelection, clearPendingSelection,
    isLoggedIn, activeBranch, canSwitchBranch,
    hasScope, applyAuthSession, login, loadMe, logout, switchBranch,
  };
});
