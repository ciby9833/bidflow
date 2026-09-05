<template>
  <el-form-item :label="t('supplierCountry.label')" required>
    <el-select :model-value="modelValue" filterable style="width:100%" :placeholder="t('supplierCountry.select')" @update:model-value="select">
      <el-option v-for="country in countries" :key="country.code" :value="country.code" :label="`${country.name} (${country.code})`" />
    </el-select>
    <p class="country-hint">{{ t('supplierCountry.hint') }}</p>
  </el-form-item>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import { api } from '../composables/useApi';

const props = withDefaults(defineProps<{ modelValue: string; branchId?: string; autoDefault?: boolean }>(), { autoDefault: false });
const emit = defineEmits<{ 'update:modelValue': [string] }>();
const auth = useAuthStore();
const { t, locale } = useI18n();
const explicitlySelected = ref(false);
const branches = ref<{ id: string; countryCode?: string }[]>([]);
const codes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const countries = computed(() => {
  const names = new Intl.DisplayNames([locale.value], { type: 'region' });
  return codes.map(code => ({ code, name: names.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, locale.value));
});
const defaultCountry = computed(() => branches.value.find(b => b.id === (props.branchId || auth.activeBranchId))?.countryCode);
watch([defaultCountry, () => props.autoDefault, () => props.modelValue], ([country, enabled]) => {
  // Only untouched NEW records follow the selected institution. Never rewrite an existing company.
  if (enabled && country && !explicitlySelected.value && props.modelValue !== country) emit('update:modelValue', country);
}, { immediate: true });
function select(code: string) {
  explicitlySelected.value = true;
  emit('update:modelValue', code);
}
onMounted(async () => {
  if (!props.autoDefault) return;
  try { branches.value = (await api.get('/api/hall/registrable-branches')).data.data; } catch { /* explicit selection remains available */ }
});
</script>

<style scoped>
.country-hint { margin: 6px 0 0; color: #475569; font-size: 12px; line-height: 1.5; }
</style>
