/**
 * 文件：frontend/src/composables/useBranchPreselect.ts
 * 功能：按访问者所在地区推测最可能的国家机构，用于表单预选。
 * 交互：被供应商注册、建用户、建供应商等表单复用；机构数据来自 /api/hall/registrable-branches。
 * 作者：吴川
 *
 * 只做「预选」不做「锁定」：
 * 浏览器时区与语言都可能因 VPN、跨境办公、系统设置而失真。
 * 猜错若锁死，会把数据静默落进错误的国家，事后极难发现且极难纠正；
 * 预选则把默认值给对多数人，同时保留一眼可见、随手可改的出口。
 */

export interface PreselectableBranch {
  id: string;
  code: string;
  name: string;
  countryCode?: string;
  timezone?: string;
}

/**
 * 推测应预选的机构。
 *
 * 判定顺序（可靠性从高到低）：
 * 1. 唯一机构 —— 没有歧义，直接选中
 * 2. 时区完全匹配 —— 机构配置里存了 IANA 时区，与浏览器时区比对最准确
 * 3. 语言中的地区码 —— 如 id-ID / vi-VN，对应机构的国别
 *
 * 都不命中时返回空字符串，让用户自己选，而不是退而求其次挑第一个。
 */
export function preselectBranch(branches: PreselectableBranch[]): string {
  if (!branches.length) return '';
  if (branches.length === 1) return branches[0].id;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const byTimezone = branches.find((b) => b.timezone && b.timezone === tz);
  if (byTimezone) return byTimezone.id;

  const region = regionFromLocales();
  if (region) {
    const byRegion = branches.find((b) => b.countryCode?.toUpperCase() === region);
    if (byRegion) return byRegion.id;
  }

  return '';
}

/** 从浏览器语言列表里取第一个带地区码的，如 zh-CN → CN */
function regionFromLocales(): string | null {
  const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const locale of locales) {
    const parts = locale?.split('-') ?? [];
    const region = parts[parts.length - 1];
    if (region && region.length === 2) return region.toUpperCase();
  }
  return null;
}
