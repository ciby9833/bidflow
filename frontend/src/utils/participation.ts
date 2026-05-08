export type ParticipationScope = 'invited' | 'public';

export function resolveParticipationScope(item: { participationScope?: string; participationMode?: string }): ParticipationScope {
  if (item.participationScope === 'invited' || item.participationScope === 'public') return item.participationScope;
  return item.participationMode === 'selected' ? 'invited' : 'public';
}

export function participationLabelKey(scope: ParticipationScope) {
  return scope === 'invited' ? 'supplierTenderHall.invitedMe' : 'supplierTenderHall.publicTender';
}

export function participationTagType(scope: ParticipationScope) {
  return scope === 'invited' ? 'warning' : 'info';
}

export function participationClass(scope: ParticipationScope) {
  return scope === 'invited' ? 'invited' : 'public';
}
