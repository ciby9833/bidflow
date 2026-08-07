/**
 * 文件：backend/src/shared/rbac/scope-map.ts
 * 功能：角色-能力映射的唯一事实来源，避免鉴权守卫与认证服务各持一份导致放行口径不一致。
 * 交互：被 shared/rbac/rbac.guard.ts 与 modules/auth/auth.service.ts 导入；角色枚举来自 modules/auth/user.entity.ts。
 * 作者：吴川
 */
import { AccountType, UserRole } from '../../modules/auth/user.entity';

export const SCOPE_MAP: Record<UserRole, string[]> = {
  super_admin: ['*'],
  purchase_manager: [
    'tender:view', 'tender:create', 'tender:edit', 'tender:publish', 'tender:close',
    'supplier:view', 'supplier:create', 'supplier:edit',
    'quote:view_all', 'export:full', 'export:masked',
    'admin:unlock', 'eval:freeze', 'user:view',
  ],
  purchase_staff: [
    'tender:view', 'tender:create', 'tender:edit', 'supplier:view', 'supplier:create',
    'quote:view_all', 'export:masked',
  ],
  evaluator: ['tender:view', 'quote:view_all', 'eval:freeze', 'export:masked'],
  supplier: ['tender:view', 'quote:submit', 'quote:rebid', 'quote:view_own', 'tender:view_invited'],
};

/** 按角色取能力集；未知角色返回空集（fail-closed）。 */
export function scopesForRole(role: UserRole): string[] {
  return SCOPE_MAP[role] ?? [];
}

/**
 * 按账号类型取能力集。
 * 供应商账号不走 users.role，统一落到 supplier 角色的能力集，避免供应商被赋予公司侧角色时越权。
 */
export function scopesForAccount(account: { role: UserRole; accountType: AccountType }): string[] {
  if (account.accountType === AccountType.COMPANY_USER) return scopesForRole(account.role);
  return SCOPE_MAP[UserRole.SUPPLIER];
}
