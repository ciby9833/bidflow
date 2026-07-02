/**
 * 文件：frontend/src/router/index.ts
 * 功能：定义前端路由表和登录守卫，串联登录、招标、供应商与报价页面。
 * 交互：依赖 stores/auth.ts 判断登录态；动态加载各 views 页面；被 main.ts 注册。
 * 作者：吴川
 */
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  {
    path: '/m',
    component: () => import('../mobile/MobileShell.vue'),
    children: [
      { path: '', redirect: '/m/hall' },
      { path: 'hall', component: () => import('../mobile/hall/MobileHallView.vue'), meta: { public: true, mobile: true, title: 'hallHome' } },
      { path: 'hall/tenders/:id', component: () => import('../mobile/hall/MobileHallTenderDetailView.vue'), meta: { public: true, mobile: true, title: 'projectDetail', back: true } },
      { path: 'tenders', component: () => import('../mobile/tender/MobileTenderHallView.vue'), meta: { mobile: true, title: 'supplierTenders' } },
      { path: 'tenders/search', component: () => import('../mobile/tender/MobileTenderSearchView.vue'), meta: { mobile: true, title: 'supplierSearch', back: true } },
      { path: 'tenders/:id', component: () => import('../mobile/tender/MobileSupplierTenderDetailView.vue'), meta: { mobile: true, title: 'tenderDetail', back: true } },
      { path: 'quotes/lots/:lotId', component: () => import('../mobile/quote/MobileSupplierQuoteBidView.vue'), meta: { mobile: true, title: 'quoteSubmit', back: true } },
      { path: 'supplier/bids', component: () => import('../mobile/bid/MobileSupplierBidRecordView.vue'), meta: { mobile: true, title: 'supplierBids', back: true } },
      { path: 'supplier/bids/search', component: () => import('../mobile/bid/MobileSupplierBidSearchView.vue'), meta: { mobile: true, title: 'supplierBidSearch', back: true } },
      { path: 'console', component: () => import('../mobile/console/MobileConsoleView.vue'), meta: { mobile: true, title: 'console' } },
      { path: 'console/users', component: () => import('../mobile/console/users/MobileCompanyUserListView.vue'), meta: { mobile: true, title: 'users', back: true } },
      { path: 'console/users/new', component: () => import('../mobile/console/users/MobileCompanyUserFormView.vue'), meta: { mobile: true, title: 'userCreate', back: true } },
      { path: 'console/users/:id', component: () => import('../mobile/console/users/MobileCompanyUserDetailView.vue'), meta: { mobile: true, title: 'userDetail', back: true } },
      { path: 'console/users/:id/edit', component: () => import('../mobile/console/users/MobileCompanyUserFormView.vue'), meta: { mobile: true, title: 'userEdit', back: true } },
      { path: 'console/suppliers', component: () => import('../mobile/console/suppliers/MobileSupplierListView.vue'), meta: { mobile: true, title: 'suppliers', back: true } },
      { path: 'console/suppliers/search', component: () => import('../mobile/console/suppliers/MobileSupplierSearchView.vue'), meta: { mobile: true, title: 'supplierSearch', back: true } },
      { path: 'console/suppliers/new', component: () => import('../mobile/console/suppliers/MobileSupplierFormView.vue'), meta: { mobile: true, title: 'supplierCreate', back: true } },
      { path: 'console/suppliers/:id/review', component: () => import('../mobile/console/suppliers/MobileSupplierDetailView.vue'), meta: { mobile: true, title: 'supplierDetail', back: true } },
      { path: 'console/suppliers/:id/edit', component: () => import('../mobile/console/suppliers/MobileSupplierFormView.vue'), meta: { mobile: true, title: 'supplierEdit', back: true } },
      { path: 'console/supplier-profile', redirect: '/m/supplier/profile' },
      { path: 'mine', component: () => import('../mobile/mine/MobileMineView.vue'), meta: { public: true, mobile: true, title: 'mine' } },
      { path: 'login', component: () => import('../mobile/auth/MobileLoginView.vue'), meta: { public: true, mobile: true, hideMobileChrome: true } },
      { path: 'register/supplier', component: () => import('../mobile/auth/MobileSupplierRegisterView.vue'), meta: { public: true, mobile: true, hideMobileChrome: true } },
      { path: 'supplier/profile', component: () => import('../mobile/supplier/MobileSupplierProfileView.vue'), meta: { mobile: true, title: 'supplierProfile' } },
      { path: 'supplier/profile/edit', component: () => import('../mobile/supplier/MobileSupplierProfileEditView.vue'), meta: { mobile: true, title: 'supplierProfileEdit', back: true } },
      { path: 'supplier/review-pending', component: () => import('../mobile/supplier/MobileSupplierReviewPendingView.vue'), meta: { mobile: true, title: 'supplierReviewPending' } },
    ],
  },
  { path: '/register/supplier', component: () => import('../views/auth/SupplierRegisterView.vue'), meta: { public: true } },
  { path: '/login', component: () => import('../views/auth/LoginView.vue'), meta: { public: true } },
  { path: '/forget-password', component: () => import('../views/auth/ForgetPasswordView.vue'), meta: { public: true } },
  { path: '/reset-password', component: () => import('../views/auth/ResetPasswordView.vue'), meta: { public: true } },
  { path: '/supplier/review-pending', component: () => import('../views/supplier/SupplierReviewPendingView.vue') },
  {
    path: '/',
    component: () => import('../views/LayoutView.vue'),
    children: [
      { path: '', redirect: '/hall' },
      { path: 'hall', component: () => import('../views/hall/HallHomeView.vue'), meta: { public: true, title: 'hall' } },
      { path: 'hall/tenders/:id', component: () => import('../views/hall/HallTenderDetailView.vue'), meta: { public: true, title: 'hallTenderDetail' } },
      { path: 'tenders', component: () => import('../views/tender/TenderListView.vue'), meta: { title: 'tenders' } },
      { path: 'tenders/new', component: () => import('../views/tender/TenderCreateView.vue'), meta: { title: 'tenderCreate' } },
      { path: 'tenders/:id/edit', component: () => import('../views/tender/TenderCreateView.vue'), meta: { title: 'tenderEdit' } },
      { path: 'tenders/:id', component: () => import('../views/tender/TenderDetailView.vue'), meta: { title: 'tenderDetail' } },
      { path: 'supplier/tenders', component: () => import('../views/tender/SupplierTenderHallView.vue'), meta: { title: 'supplierTenders' } },
      { path: 'supplier/tenders/:id', component: () => import('../views/tender/SupplierTenderDetailView.vue'), meta: { title: 'tenderDetail' } },
      { path: 'supplier/bids', component: () => import('../views/bid/SupplierBidRecordView.vue'), meta: { title: 'supplierBids' } },
      { path: 'suppliers', component: () => import('../views/supplier/SupplierListView.vue'), meta: { title: 'suppliers' } },
      { path: 'suppliers/new', component: () => import('../views/supplier/SupplierCreateView.vue'), meta: { title: 'supplierCreate' } },
      { path: 'suppliers/:id/review', component: () => import('../views/supplier/SupplierReviewDetailView.vue'), meta: { title: 'supplierReview' } },
      { path: 'users', component: () => import('../views/user/CompanyUserListView.vue'), meta: { title: 'users' } },
      { path: 'supplier/profile', component: () => import('../views/supplier/SupplierProfileView.vue'), meta: { title: 'supplierProfile' } },
      { path: 'supplier/quotes/lots/:lotId', component: () => import('../views/quote/SupplierQuoteBidView.vue'), meta: { title: 'quoteSubmit' } },
      { path: 'tenders/:tenderId/lots/:lotId/quotes', component: () => import('../views/quote/CompanyQuoteReviewView.vue'), meta: { title: 'quoteReview' } },
      { path: 'quotes/lots/:lotId', component: () => import('../views/quote/CompanyQuoteReviewView.vue'), meta: { title: 'quoteReview' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

function isMobileExperience() {
  if (typeof window === 'undefined') return false;

  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const hasHover = window.matchMedia('(hover: hover)').matches;

  return isTouch && !hasHover;
}

function mobileEquivalent(path: string) {
  if (path === '/hall') return '/m/hall';
  if (path.startsWith('/hall/tenders/')) return path.replace('/hall/tenders/', '/m/hall/tenders/');
  if (path === '/login' || path === '/register/supplier') return '/m/mine';
  if (path === '/supplier/profile') return '/m/supplier/profile';
  if (path === '/supplier/review-pending') return '/m/supplier/review-pending';
  if (path === '/supplier/bids') return '/m/supplier/bids';
  if (path === '/supplier/tenders') return '/m/tenders';
  if (path.startsWith('/supplier/tenders/')) return path.replace('/supplier/tenders/', '/m/tenders/');
  if (path.startsWith('/supplier/quotes/lots/')) return path.replace('/supplier/quotes/lots/', '/m/quotes/lots/');
  if (path === '/tenders') return '/m/tenders';
  if (path === '/users') return '/m/console/users';
  if (path === '/suppliers') return '/m/console/suppliers';
  if (path === '/suppliers/new') return '/m/console/suppliers/new';
  if (path.startsWith('/suppliers/') && path.endsWith('/review')) return path.replace('/suppliers/', '/m/console/suppliers/');
  return '';
}

function desktopEquivalent(path: string) {
  if (path === '/m/hall') return '/hall';
  if (path.startsWith('/m/hall/tenders/')) return path.replace('/m/hall/tenders/', '/hall/tenders/');
  if (path === '/m/mine' || path === '/m/login' || path === '/m/register/supplier') return '/login';
  if (path === '/m/supplier/profile') return '/supplier/profile';
  if (path === '/m/supplier/profile/edit') return '/supplier/profile';
  if (path === '/m/supplier/review-pending') return '/supplier/review-pending';
  if (path === '/m/supplier/bids') return '/supplier/bids';
  if (path === '/m/supplier/bids/search') return '/supplier/bids';
  if (path === '/m/tenders/search') return '/supplier/tenders';
  if (path === '/m/tenders') return '/supplier/tenders';
  if (path.startsWith('/m/tenders/')) return path.replace('/m/tenders/', '/supplier/tenders/');
  if (path.startsWith('/m/quotes/lots/')) return path.replace('/m/quotes/lots/', '/supplier/quotes/lots/');
  if (path === '/m/console/users') return '/users';
  if (path === '/m/console/users/new') return '/users';
  if (/^\/m\/console\/users\/[^/]+(\/edit)?$/.test(path)) return '/users';
  if (path === '/m/console/suppliers') return '/suppliers';
  if (path === '/m/console/suppliers/search') return '/suppliers';
  if (path === '/m/console/suppliers/new') return '/suppliers/new';
  if (path.startsWith('/m/console/suppliers/') && path.endsWith('/edit')) return '/suppliers';
  if (path.startsWith('/m/console/suppliers/') && path.endsWith('/review')) return path.replace('/m/console/suppliers/', '/suppliers/');
  if (path === '/m/console') return '/hall';
  return '';
}

function expectedExperiencePath(path: string) {
  const isMobilePath = path.startsWith('/m');
  if (isMobileExperience()) return isMobilePath ? '' : mobileEquivalent(path);
  return isMobilePath ? desktopEquivalent(path) : '';
}

export function syncExperienceRoute() {
  const target = expectedExperiencePath(router.currentRoute.value.path);
  if (target && target !== router.currentRoute.value.fullPath) {
    router.replace(target);
  }
}

export function installExperienceRouteSync() {
  if (typeof window === 'undefined') return;

  const mediaQueries = [
    window.matchMedia('(pointer: coarse)'),
    window.matchMedia('(hover: hover)'),
  ];
  const sync = () => syncExperienceRoute();

  mediaQueries.forEach((query) => {
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', sync);
      return;
    }
    query.addListener(sync);
  });
}

router.beforeEach(async (to) => {
  if (to.path === '/') {
    return isMobileExperience() ? '/m/hall' : '/hall';
  }
  const auth = useAuthStore();
  const isMobile = to.path.startsWith('/m');
  const experienceTarget = expectedExperiencePath(to.path);
  if (experienceTarget) return experienceTarget;

  const loginPath = isMobile ? '/m/mine' : '/login';
  const hallPath = isMobile ? '/m/hall' : '/hall';
  const supplierProfilePath = isMobile ? '/m/supplier/profile' : '/supplier/profile';
  const supplierProfileEditPath = isMobile ? '/m/supplier/profile/edit' : '/supplier/profile';
  const supplierPendingPath = isMobile ? '/m/supplier/review-pending' : '/supplier/review-pending';

  if (['/login', '/register/supplier', '/m/login', '/m/register/supplier'].includes(to.path) && auth.isLoggedIn) {
    if (!auth.user) await auth.loadMe();
    if (auth.user) return hallPath;
  }

  if (to.meta.public) return true;
  if (!auth.isLoggedIn) return loginPath;
  if (!auth.user) await auth.loadMe();

  // 供应商审核状态会被公司端异步修改；导航时刷新一次，避免移动端仍按旧的 pending_review 拦截。
  if (auth.user?.accountType === 'supplier_account' || auth.user?.supplierId) {
    await auth.loadMe();
  }

  if (auth.user?.supplierId && to.path === '/tenders') {
    return '/supplier/tenders';
  }
  if (auth.user?.supplierId && /^\/tenders\/[^/]+$/.test(to.path)) {
    return to.path.replace('/tenders/', '/supplier/tenders/');
  }
  if (auth.user?.supplierId && to.path.startsWith('/quotes/lots/')) {
    return to.path.replace('/quotes/lots/', '/supplier/quotes/lots/');
  }

  if (!auth.user?.supplierId && to.path === '/supplier/tenders') {
    return '/tenders';
  }
  if (!auth.user?.supplierId && to.path.startsWith('/supplier/tenders/')) {
    return to.path.replace('/supplier/tenders/', '/tenders/');
  }
  if (!auth.user?.supplierId && to.path.startsWith('/supplier/quotes/lots/')) {
    return to.path.replace('/supplier/quotes/lots/', '/quotes/lots/');
  }

  if (auth.user?.accountType === 'supplier_account' && !auth.user?.supplierId) {
    return [supplierProfilePath, supplierProfileEditPath].includes(to.path) ? true : supplierProfilePath;
  }

  if (auth.user?.supplierId) {
    const reviewStatus = auth.user.supplierReviewStatus;
    const supplierStatus = auth.user.supplierStatus;
    const isSupplierPortalRoute = [supplierProfilePath, supplierProfileEditPath, supplierPendingPath].includes(to.path);

    if (supplierStatus !== 'active') {
      return isSupplierPortalRoute ? true : supplierPendingPath;
    }
    if (reviewStatus === 'approved') {
      return true;
    }
    if (reviewStatus === 'pending_review') {
      return to.path === supplierPendingPath ? true : supplierPendingPath;
    }
    return [supplierProfilePath, supplierProfileEditPath].includes(to.path) ? true : supplierProfilePath;
  }

  return true;
});
