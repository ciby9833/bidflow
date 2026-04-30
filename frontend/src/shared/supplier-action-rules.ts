/*
文件：frontend/src/shared/supplier-action-rules.ts
功能：集中定义公司端供应商管理的状态动作规则，避免列表、Web 详情和 H5 详情按钮判断不一致。
交互：被供应商列表和审核详情页调用；动作最终映射到 supplier.controller.ts 的审核/冻结接口。
作者：吴川
*/

export type SupplierActionKey = 'approve' | 'supplement' | 'reject' | 'suspend' | 'resume';

export interface SupplierAction {
  key: SupplierActionKey;
  label: string;
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'info';
}

interface SupplierActionState {
  status?: string;
  reviewStatus?: string;
}

const ACTIONS: Record<SupplierActionKey, SupplierAction> = {
  approve: { key: 'approve', label: '通过', tone: 'success' },
  supplement: { key: 'supplement', label: '要求补件', tone: 'info' },
  reject: { key: 'reject', label: '驳回', tone: 'danger' },
  suspend: { key: 'suspend', label: '冻结', tone: 'warning' },
  resume: { key: 'resume', label: '解冻', tone: 'success' },
};

export function getSupplierActions(supplier: SupplierActionState): SupplierAction[] {
  if (supplier.status === 'suspended') return [ACTIONS.resume];
  if (supplier.status !== 'active') return [];

  if (supplier.reviewStatus === 'pending_review') {
    return [ACTIONS.approve, ACTIONS.supplement, ACTIONS.reject, ACTIONS.suspend];
  }

  if (supplier.reviewStatus === 'approved') {
    return [ACTIONS.supplement, ACTIONS.suspend];
  }

  return [ACTIONS.suspend];
}

export function hasSupplierAction(supplier: SupplierActionState, key: SupplierActionKey) {
  return getSupplierActions(supplier).some((item) => item.key === key);
}
