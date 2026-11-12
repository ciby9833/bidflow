import { ElMessage } from 'element-plus';
import { i18n } from '../i18n';
import { api } from './useApi';
export async function filePreviewUrl(raw: string): Promise<string> {
  try {
  const url = new URL(raw, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/uploads/preview/')) throw new Error('Unsupported attachment URL');
  const result = await api.get(url.pathname, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(result.data);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60 * 1000);
  return blobUrl;
  } catch (error) {
    ElMessage.error(i18n.global.t('supplierReviewDetail.previewFailed'));
    throw error;
  }
}
export async function openFilePreview(raw: string) {
  const tab = window.open('about:blank', '_blank');
  if (tab) tab.opener = null;
  try {
    const url = await filePreviewUrl(raw);
    if (tab) tab.location.replace(url); else window.location.assign(url);
  } catch (error) { tab?.close(); throw error; }
}
