<!--
文件：frontend/src/components/TargetBranchSelect.vue
功能：管理动作的目标机构选择器。总部需显式指定为哪个国家机构操作，机构用户则固定为本机构。
交互：读取 /api/hall/registrable-branches 列出启用中的国家机构；由建用户、建供应商等表单复用。
作者：吴川

为什么机构用户不显示选择器：
后端对机构用户会强制归属其所在机构并忽略请求里的 branchId，
若前端仍展示一个可选的下拉，用户改了却不生效，是更糟的体验 —— 直接展示只读归属更诚实。
-->
<template>
  <el-form-item :label="t('org.targetBranch')" :required="auth.isHq">
    <el-select
      v-if="auth.isHq"
      :model-value="modelValue"
      class="target-branch"
      :placeholder="t('org.selectTargetBranch')"
      @update:model-value="(v: string) => emit('update:modelValue', v)"
    >
      <el-option v-for="b in branches" :key="b.id" :label="`${b.name} (${b.code})`" :value="b.id" />
    </el-select>
    <template v-else>
      <el-tag type="success" effect="plain">{{ auth.activeBranch?.branchName ?? '-' }}</el-tag>
      <span class="fixed-hint">{{ t('org.targetBranchFixed') }}</span>
    </template>
  </el-form-item>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../composables/useApi';
import { useAuthStore } from '../stores/auth';
import { preselectBranch } from '../composables/useBranchPreselect';

const props = defineProps<{ modelValue?: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

const { t } = useI18n();
const auth = useAuthStore();
const branches = ref<{ id: string; code: string; name: string; countryCode?: string; timezone?: string }[]>([]);

onMounted(async () => {
  // 机构用户不需要候选列表，省一次请求
  if (!auth.isHq) return;
  try {
    branches.value = (await api.get('/api/hall/registrable-branches')).data.data;
  } catch {
    // 拉取失败不阻塞表单；提交时后端会校验目标机构
  }
});

/**
 * 预选目标机构。
 *
 * 用 watch 而非只在 onMounted 里做一次：宿主表单常以弹窗形式复用同一个组件实例，
 * 每次打开都会把字段重置为空。只在挂载时预选的话，第二次打开就变成空值，
 * 用户会以为"上次能自动填这次不行了"。
 * immediate 让首次渲染即生效，无论候选与父组件哪个先就绪。
 */
watch(
  [() => props.modelValue, branches],
  ([current, list]) => {
    if (!auth.isHq || current || !list.length) return;
    const guess = preselectBranch(list);
    if (guess) emit('update:modelValue', guess);
  },
  { immediate: true },
);
</script>

<style scoped>
.target-branch { width: 100%; }
.fixed-hint { margin-left: 8px; font-size: 12px; color: #909399; }
</style>
