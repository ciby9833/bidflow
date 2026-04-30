/**
 * 文件：frontend/src/mobile/mobileTabState.ts
 * 功能：维护 H5 底部 Tab 的独立停留路径，使 TabBar 表现接近 iOS/Android 原生应用的多栈导航。
 * 交互：被 MobileShell.vue 记录当前 Tab 的最后路径；被 MobileTabBar.vue 切换 Tab 时恢复对应路径。
 * 作者：吴川
 */
export type MobileTabKey = 'home' | 'tenders' | 'console' | 'mine';

const STORAGE_KEY = 'bidflow:mobile:tabState';

type MobileTabState = {
  lastPathByTab: Partial<Record<MobileTabKey, string>>;
  stackByTab: Partial<Record<MobileTabKey, string[]>>;
};

export const mobileTabRoots: Record<MobileTabKey, string> = {
  home: '/m/hall',
  tenders: '/m/tenders',
  console: '/m/console',
  mine: '/m/mine',
};

function readState(): MobileTabState {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    // 兼容旧版本只保存 { home: path } 的结构。
    if (!raw.lastPathByTab && !raw.stackByTab) {
      return { lastPathByTab: raw, stackByTab: {} };
    }
    return {
      lastPathByTab: raw.lastPathByTab ?? {},
      stackByTab: raw.stackByTab ?? {},
    };
  } catch {
    return { lastPathByTab: {}, stackByTab: {} };
  }
}

function writeState(state: MobileTabState) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getMobileTabKey(path: string): MobileTabKey | null {
  if (path === '/m/hall' || path.startsWith('/m/hall/')) return 'home';
  if (path === '/m/tenders' || path.startsWith('/m/tenders/') || path.startsWith('/m/quotes/')) return 'tenders';
  if (
    path === '/m/console'
    || path.startsWith('/m/console/')
    || path.startsWith('/m/supplier/bids')
    || path.startsWith('/m/supplier/profile')
    || path.startsWith('/m/supplier/review-pending')
  ) return 'console';
  if (path === '/m/mine') return 'mine';
  return null;
}

export function rememberMobileTabPath(path: string, fullPath = path) {
  const tab = getMobileTabKey(path);
  if (!tab) return;
  const state = readState();
  const stack = state.stackByTab[tab] ?? [];
  if (stack[stack.length - 1] !== fullPath) {
    stack.push(fullPath);
    state.stackByTab[tab] = stack.slice(-24);
  }
  state.lastPathByTab[tab] = fullPath;
  writeState(state);
}

export function getLastMobileTabPath(tab: MobileTabKey) {
  const state = readState();
  return state.lastPathByTab[tab] || mobileTabRoots[tab];
}

export function resetMobileTabPath(tab: MobileTabKey) {
  const state = readState();
  state.lastPathByTab[tab] = mobileTabRoots[tab];
  state.stackByTab[tab] = [mobileTabRoots[tab]];
  writeState(state);
  return mobileTabRoots[tab];
}

export function consumeMobileTabBackPath(path: string, fullPath = path) {
  const tab = getMobileTabKey(path);
  if (!tab) return '/m/hall';

  const state = readState();
  const stack = state.stackByTab[tab] ?? [mobileTabRoots[tab]];

  while (stack.length && stack[stack.length - 1] === fullPath) stack.pop();
  const target = stack[stack.length - 1] || mobileTabRoots[tab];

  state.stackByTab[tab] = stack.length ? stack : [target];
  state.lastPathByTab[tab] = target;
  writeState(state);
  return target;
}
