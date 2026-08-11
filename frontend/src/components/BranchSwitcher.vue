<!--
文件：frontend/src/components/BranchSwitcher.vue
功能：顶部机构切换器，展示当前机构并允许在有权限的机构间切换。
交互：读取 stores/auth.ts 的 branches / activeBranch；切换调用 switchBranch 由后端重新签发 Token。
作者：吴川

仅在用户可访问多个机构时渲染 —— 单机构用户不应看到无意义的切换入口。
-->
<template>
  <el-dropdown v-if="auth.canSwitchBranch" trigger="click" @command="onSwitch">
    <button class="branch-trigger" type="button">
      <span class="branch-dot" :class="{ hq: isHqActive }" />
      <span class="branch-name">{{ auth.activeBranch?.branchName }}</span>
      <el-icon class="branch-caret"><ArrowDown /></el-icon>
    </button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="b in auth.branches"
          :key="b.branchId"
          :command="b.branchId"
          :disabled="b.branchId === auth.activeBranchId"
        >
          <div class="branch-item">
            <span class="branch-dot" :class="{ hq: b.branchType === 'HQ' }" />
            <span class="branch-item-name">{{ b.branchName }}</span>
            <span v-if="b.branchType === 'HQ'" class="branch-tag">{{ t('branch.read_only') }}</span>
            <el-icon v-else-if="b.branchId === auth.activeBranchId" class="branch-check"><Check /></el-icon>
          </div>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown, Check } from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';

const { t } = useI18n();
const auth = useAuthStore();

const isHqActive = computed(() => auth.activeBranch?.branchType === 'HQ');

async function onSwitch(branchId: string) {
  if (branchId === auth.activeBranchId) return;
  const target = auth.branches.find((b) => b.branchId === branchId);
  if (!target) return;

  // 切换会整页重载，未保存的编辑会丢失，因此先确认
  try {
    await ElMessageBox.confirm(
      t('branch.switch_confirm', { name: target.branchName }),
      t('branch.switch_title'),
      { type: 'warning' },
    );
  } catch {
    return; // 用户取消
  }

  try {
    await auth.switchBranch(branchId);
  } catch {
    ElMessage.error(t('branch.switch_failed'));
  }
}
</script>

<style scoped>
.branch-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #1f2937;
  font-size: 13px;
  cursor: pointer;
}
.branch-trigger:hover {
  border-color: #2563eb;
  color: #2563eb;
}
.branch-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #16a34a;
  flex: none;
}
/* 总部为只读视角，用不同颜色与国家机构区分，避免误以为可以下单操作 */
.branch-dot.hq {
  background: #a855f7;
}
.branch-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.branch-caret {
  font-size: 12px;
}
.branch-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 180px;
}
.branch-item-name {
  flex: 1;
}
.branch-tag {
  padding: 1px 6px;
  border-radius: 4px;
  background: #f3e8ff;
  color: #7e22ce;
  font-size: 11px;
}
.branch-check {
  color: #16a34a;
  font-size: 14px;
}
</style>
