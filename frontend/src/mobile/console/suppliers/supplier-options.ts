/**
 * 文件：frontend/src/mobile/console/suppliers/supplier-options.ts
 * 功能：移动端供应商管理共享状态文案和样式映射。
 * 交互：被 MobileSupplierListView/MobileSupplierDetailView 复用，保持状态展示一致。
 * 作者：吴川
 */
import { i18n } from '../../../i18n';
export function supplierInitial(row: any) {
  return String(row.legalName || row.shortName || row.businessId || '?').slice(0, 1).toUpperCase();
}

export function statusText(status?: string) {
  return i18n.global.t(`supplier.status.${status || 'active'}`);
}

export function reviewText(status?: string) {
  return i18n.global.t(`supplierReview.${status || 'not_submitted'}`);
}

export function statusTone(status?: string) {
  if (status === 'active') return 'ok';
  if (status === 'suspended') return 'warn';
  return 'neutral';
}

export function reviewTone(status?: string) {
  if (status === 'approved') return 'ok';
  if (status === 'pending_review') return 'warn';
  if (status === 'rejected') return 'danger';
  return 'neutral';
}
