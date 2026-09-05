<template>
  <section class="deadline-changes" v-if="editable || changes.length || loadError">
    <div class="deadline-heading">
      <strong>{{ t('history') }}</strong>
      <el-button v-if="editable && ['published','open','closed'].includes(tender.status)" @click="openEditor" :loading="opening">
        {{ tender.status === 'closed' ? t('reopen') : t('extend') }}
      </el-button>
    </div>
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" />
    <p v-if="!changes.length && !loadError" class="muted">{{ t('empty') }}</p>
    <el-collapse v-else>
      <el-collapse-item v-for="(item,index) in changes" :key="item.id" :name="item.id">
        <template #title><span class="change-title">{{ index === 0 ? t('latest') + ' · ' : '' }}{{ t('round') }} {{ item.round_no }} · {{ format(item.new_deadline,item.timezone) }}</span></template>
        <p>{{ t('previous') }}: {{ format(item.old_deadline,item.timezone) }}</p>
        <p>{{ t('next') }}: {{ format(item.new_deadline,item.timezone) }}</p>
        <p class="announcement">{{ item.announcement }}</p>
        <p>{{ t('recorded') }}: {{ format(item.created_at,item.timezone) }}</p>
        <template v-if="editable">
          <p>{{ t('actor') }}: {{ item.actor_name }} · {{ t('reason') }}: {{ item.reason }}</p>
          <p>{{ t('delivery') }}: {{ item.sent }}/{{ item.recipients }} · {{ t('failed') }}: {{ item.failed }}</p>
          <el-button v-if="item.failed" size="small" :loading="retrying === item.id" @click="retry(item.id)">{{ t('retry') }}</el-button>
        </template>
      </el-collapse-item>
    </el-collapse>
    <el-alert v-if="changes.length && !editable" class="notice" :title="changes[0].announcement" :description="t('unchanged')" type="warning" :closable="false" show-icon />

    <el-dialog v-model="visible" :title="preview?.status === 'closed' ? t('reopen') : t('extend')" width="min(640px, 94vw)" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving">
      <template v-if="preview">
        <p>{{ preview.tenderNo }} · {{ t('round') }} {{ preview.round }} · {{ preview.timezone }}</p>
        <p>{{ t('previous') }}: {{ format(preview.deadline,preview.timezone) }}</p>
        <p>{{ t('responders') }}: {{ preview.quotedSuppliers }} · {{ t('recipients') }}: {{ preview.recipientCount }}</p>
        <el-alert :title="t('unchanged')" type="info" :closable="false" show-icon />
        <p class="muted">{{ preview.participationMode === 'all' ? t('publicNotice') : t('directedNotice') }}</p>
        <el-form label-position="top" @submit.prevent="submit">
          <el-form-item :label="`${t('next')} (${preview.timezone})`" required>
            <el-date-picker v-model="newDate" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" format="YYYY-MM-DD HH:mm:ss" style="width:100%" :disabled="saving" />
          </el-form-item>
          <p v-if="utcDate" class="muted">UTC: {{ utcDate }}</p>
          <el-form-item :label="t('reason')" required>
            <el-input v-model="reason" type="textarea" :rows="2" maxlength="2000" show-word-limit :disabled="saving" />
          </el-form-item>
          <el-form-item :label="t('announcement')" required>
            <el-input v-model="announcement" type="textarea" :rows="3" maxlength="4000" show-word-limit :disabled="saving" />
          </el-form-item>
        </el-form>
        <p class="muted">{{ t('scheduleNote') }}</p>
        <el-alert v-if="error" :title="error" type="error" :closable="false" />
      </template>
      <template #footer>
        <el-button :disabled="saving" @click="visible=false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" :disabled="!utcDate || !reason.trim() || !announcement.trim()" @click="submit">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { api } from '../composables/useApi';
dayjs.extend(utc); dayjs.extend(timezone);
const props = defineProps<{ tender: any; editable?: boolean; notices?: any[] }>();
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n({ useScope: 'local', messages: {
  'zh-CN': { history:'截止时间变更', extend:'延长截止时间', reopen:'重新开放报价', empty:'暂无延期记录',latest:'最近变更',round:'轮次',previous:'原截止时间',next:'新截止时间',recorded:'操作时间',actor:'操作人',reason:'内部调整原因',announcement:'供应商公告',delivery:'邮件已发送',failed:'失败',retry:'重试失败邮件',unchanged:'已有报价、参与范围及改价次数、降幅、冷却规则保持不变。',responders:'已报价供应商',recipients:'邮件收件人数',publicNotice:'公开参与标：公告对有权查看该标的供应商可见，邮件通知已有报价的供应商。',directedNotice:'定向标：公告对有权查看该标的供应商可见，邮件通知本轮受邀供应商。',scheduleNote:'请核对标书、附件和后续谈判安排。延期不会自动修改这些内容。',cancel:'取消',confirm:'确认调整并发布公告',success:'已调整截止时间，通知已入队',queued:'失败邮件已重新入队',invalid:'新截止时间必须晚于现在及原截止时间',conflict:'招标已被修改或切换轮次，请关闭窗口、刷新后重试',input:'请填写有效的时间、原因和公告',state:'当前状态不允许调整截止时间',unknown:'操作失败，请重试；如提交结果不确定，请使用相同内容重试',loadFailed:'变更记录加载失败，请刷新页面' },
  en: { history:'Deadline changes',extend:'Extend deadline',reopen:'Reopen bidding',empty:'No deadline changes',latest:'Latest change',round:'Round',previous:'Previous deadline',next:'New deadline',recorded:'Recorded at',actor:'Changed by',reason:'Internal reason',announcement:'Supplier announcement',delivery:'Emails sent',failed:'Failed',retry:'Retry failed emails',unchanged:'Existing bids, participation scope, remaining revisions, minimum decrement and cooldown remain unchanged.',responders:'Responding suppliers',recipients:'Email recipients',publicNotice:'Public participation: announcements are visible to authorized suppliers; emails go to known responding suppliers.',directedNotice:'Directed participation: announcements are visible to authorized suppliers; emails go to invited suppliers in this round.',scheduleNote:'Review tender documents, attachments and subsequent negotiation dates. These are not changed automatically.',cancel:'Cancel',confirm:'Confirm and publish announcement',success:'Deadline updated; notifications queued',queued:'Failed emails queued again',invalid:'The new deadline must be later than now and the existing deadline',conflict:'The tender or round changed. Close this dialog, refresh and try again.',input:'Enter a valid deadline, reason and announcement',state:'This tender cannot be extended in its current state',unknown:'Request failed. If the result is uncertain, retry with the same details.',loadFailed:'Could not load deadline changes. Refresh the page.' },
  'id-ID': { history:'Perubahan batas waktu',extend:'Perpanjang batas waktu',reopen:'Buka kembali penawaran',empty:'Belum ada perubahan',latest:'Perubahan terbaru',round:'Putaran',previous:'Batas waktu sebelumnya',next:'Batas waktu baru',recorded:'Waktu perubahan',actor:'Diubah oleh',reason:'Alasan internal',announcement:'Pengumuman pemasok',delivery:'Email terkirim',failed:'Gagal',retry:'Kirim ulang email gagal',unchanged:'Penawaran, peserta, sisa revisi, penurunan minimum dan jeda tetap berlaku.',responders:'Pemasok yang menawar',recipients:'Penerima email',publicNotice:'Pengumuman terlihat oleh pemasok berhak akses; email dikirim kepada pemasok yang telah menawar.',directedNotice:'Pengumuman terlihat oleh pemasok berhak akses; email dikirim kepada pemasok yang diundang pada putaran ini.',scheduleNote:'Periksa dokumen, lampiran dan jadwal negosiasi berikutnya. Jadwal tersebut tidak berubah otomatis.',cancel:'Batal',confirm:'Konfirmasi dan terbitkan pengumuman',success:'Batas waktu diperbarui; notifikasi dijadwalkan',queued:'Email gagal dijadwalkan ulang',invalid:'Batas waktu baru harus setelah sekarang dan batas waktu sebelumnya',conflict:'Tender atau putaran berubah. Tutup dialog, muat ulang dan coba lagi.',input:'Isi waktu, alasan dan pengumuman yang valid',state:'Status tender tidak mengizinkan perpanjangan',unknown:'Permintaan gagal. Jika hasil belum pasti, coba lagi dengan data yang sama.',loadFailed:'Gagal memuat perubahan. Muat ulang halaman.' },
  'vi-VN': { history:'Thay đổi thời hạn',extend:'Gia hạn báo giá',reopen:'Mở lại báo giá',empty:'Chưa có thay đổi',latest:'Thay đổi mới nhất',round:'Vòng',previous:'Thời hạn cũ',next:'Thời hạn mới',recorded:'Thời gian thay đổi',actor:'Người thay đổi',reason:'Lý do nội bộ',announcement:'Thông báo nhà cung cấp',delivery:'Email đã gửi',failed:'Thất bại',retry:'Gửi lại email thất bại',unchanged:'Báo giá, phạm vi tham gia, số lần sửa còn lại, mức giảm tối thiểu và thời gian chờ giữ nguyên.',responders:'Nhà cung cấp đã báo giá',recipients:'Người nhận email',publicNotice:'Thông báo hiển thị cho nhà cung cấp có quyền truy cập; email gửi cho nhà cung cấp đã báo giá.',directedNotice:'Thông báo hiển thị cho nhà cung cấp có quyền truy cập; email gửi cho nhà cung cấp được mời trong vòng này.',scheduleNote:'Kiểm tra tài liệu, tệp đính kèm và lịch đàm phán tiếp theo. Các nội dung này không tự động thay đổi.',cancel:'Hủy',confirm:'Xác nhận và đăng thông báo',success:'Đã cập nhật thời hạn và xếp hàng thông báo',queued:'Đã xếp hàng gửi lại email',invalid:'Thời hạn mới phải sau hiện tại và thời hạn cũ',conflict:'Gói thầu hoặc vòng đã thay đổi. Đóng, tải lại và thử lại.',input:'Nhập thời hạn, lý do và thông báo hợp lệ',state:'Trạng thái hiện tại không cho phép gia hạn',unknown:'Yêu cầu thất bại. Nếu chưa rõ kết quả, thử lại với cùng nội dung.',loadFailed:'Không tải được thay đổi. Vui lòng tải lại.' },
} });
const changes = ref<any[]>([]), preview = ref<any>(null);
const visible=ref(false), saving=ref(false), opening=ref(false), retrying=ref('');
const newDate=ref(''), reason=ref(''), announcement=ref(''), error=ref(''), loadError=ref('');
let requestKey='', submittedPayload='';
const utcDate = computed(() => {
  try { return newDate.value && preview.value ? dayjs.tz(newDate.value,preview.value.timezone).toISOString() : ''; }
  catch { return ''; }
});
function format(value: string, zone: string) { return value ? `${dayjs(value).tz(zone).format('YYYY-MM-DD HH:mm:ss')} (${zone})` : '—'; }
function message(e: any) {
  const key=String(e.response?.data?.error?.message_key || '');
  if (key.includes('deadline_conflict')) return t('conflict');
  if (key.includes('deadline_extension_only')) return t('invalid');
  if (key.includes('deadline_input')) return t('input');
  if (key.includes('deadline_state')) return t('state');
  return t('unknown');
}
async function load() {
  if(props.notices) { changes.value=props.notices; loadError.value=''; return; }
  const id=props.tender?.id;
  if (!id) return;
  try { const r=await api.get(`/api/tenders/${id}/deadline-changes`); if(id===props.tender?.id) { changes.value=r.data.data; loadError.value=''; } }
  catch { loadError.value=t('loadFailed'); }
}
watch(() => [props.tender?.id,props.tender?.updatedAt,props.notices], () => void load(), {immediate:true});
async function openEditor() {
  opening.value=true;
  try {
    preview.value=(await api.get(`/api/tenders/${props.tender.id}/deadline-changes/preview`)).data.data;
    newDate.value=''; reason.value=''; announcement.value=''; error.value=''; submittedPayload=''; requestKey=''; visible.value=true;
  } catch(e) { ElMessage.error(message(e)); }
  finally { opening.value=false; }
}
async function submit() {
  if(saving.value || !preview.value) return;
  if(!utcDate.value || Date.parse(utcDate.value)<=Date.now() || (preview.value.deadline && Date.parse(utcDate.value)<=Date.parse(preview.value.deadline))) { error.value=t('invalid'); return; }
  const body={ newDeadline:utcDate.value,reason:reason.value.trim(),announcement:announcement.value.trim(),expectedRound:preview.value.round,expectedStatus:preview.value.status,expectedUpdatedAt:preview.value.updatedAt,expectedVersion:preview.value.version };
  if(!body.reason || !body.announcement) { error.value=t('input'); return; }
  const signature=JSON.stringify(body);
  if(signature!==submittedPayload) { requestKey=crypto.randomUUID(); submittedPayload=signature; }
  saving.value=true; error.value='';
  try {
    await api.post(`/api/tenders/${props.tender.id}/deadline-changes`,{...body,idempotencyKey:requestKey});
    visible.value=false; ElMessage.success(t('success')); emit('changed'); await load();
  } catch(e) { error.value=message(e); }
  finally { saving.value=false; }
}
async function retry(id: string) {
  retrying.value=id;
  try { await api.post(`/api/tenders/${props.tender.id}/deadline-changes/${id}/retry`); ElMessage.success(t('queued')); await load(); }
  catch(e) { ElMessage.error(message(e)); }
  finally { retrying.value=''; }
}
</script>

<style scoped>
.deadline-changes { margin:16px 0; padding:16px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#0f172a; }
.deadline-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.muted { color:#475569; font-size:13px; line-height:1.6; }
.announcement,.notice { white-space:pre-wrap; overflow-wrap:anywhere; }
.change-title { line-height:1.5; padding:10px 0; overflow-wrap:anywhere; }
.notice { margin-top:12px; }
.deadline-changes :deep(.el-collapse-item__header) { height:auto; min-height:48px; line-height:1.5; }
.notice :deep(.el-alert__title),.notice :deep(.el-alert__description) { color:#713f12; }
</style>
