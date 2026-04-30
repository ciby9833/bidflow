/**
 * 文件：frontend/src/mobile/console/users/user-options.ts
 * 功能：移动端公司用户管理共享选项和显示文案。
 * 交互：被 MobileCompanyUserListView/DetailView/FormView 复用，避免角色和状态文案分散。
 * 作者：吴川
 */
export const roleOptions = [
  { label: '超级管理员', value: 'super_admin' },
  { label: '采购经理', value: 'purchase_manager' },
  { label: '采购专员', value: 'purchase_staff' },
  { label: '评审员', value: 'evaluator' },
];

export const statusOptions = [
  { label: '启用', value: 'active' },
  { label: '停用', value: 'suspended' },
];

export function roleText(role: string) {
  return roleOptions.find((item) => item.value === role)?.label ?? role;
}

export function statusText(status: string) {
  return status === 'active' ? '启用' : '停用';
}

export function avatarText(row: any) {
  return String(row.fullName || row.displayName || row.email || '?').slice(0, 1).toUpperCase();
}
