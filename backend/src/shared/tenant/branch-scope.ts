/**
 * 文件：backend/src/shared/tenant/branch-scope.ts
 * 功能：定义机构数据作用域，是租户隔离在应用层的唯一凭据。
 * 交互：由 modules/organization/branch-context.service.ts 解析出的上下文构造；被 tenant-repository.ts 消费。
 * 作者：吴川
 *
 * 设计约束（刻意为之，勿擅改）：
 * 1. 读写分离：readable 是数组（总部可跨机构读），writable 是单值（数据只能写入一个明确的机构）。
 * 2. 总部 writable 恒为 undefined —— 总部只做跨机构汇总，不产生业务数据，写入必须由国家机构成员执行。
 * 3. fail-closed：无机构归属时 readable 为空数组，查询短路返回空集，绝不退化成"查全部"。
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';

export interface BranchScope {
  /** 可读机构 ID 列表。空数组表示无任何可见数据。 */
  readonly readable: readonly string[];
  /** 可写机构 ID。总部与无归属用户为 undefined。 */
  readonly writable?: string;
}

/** 普通用户：读写均限定在单个机构 */
export function branchScopeFor(branchId: string): BranchScope {
  return { readable: [branchId], writable: branchId };
}

/** 总部：可读全部启用中的国家机构，不可写 */
export function hqBranchScope(branchIds: readonly string[]): BranchScope {
  return { readable: [...branchIds], writable: undefined };
}

/** 无机构归属：读不到任何数据，也不可写 */
export function emptyBranchScope(): BranchScope {
  return { readable: [], writable: undefined };
}

/** 该作用域是否能读到任何数据 */
export function canRead(scope: BranchScope): boolean {
  return scope.readable.length > 0;
}

/**
 * 取写入机构，缺失时拒绝。
 * 命中场景：总部成员尝试写业务数据（总部只做跨机构汇总），或无机构归属的账号尝试写入。
 * 抛 ForbiddenException 而非普通 Error —— 否则会被兜底为 500 error.internal，
 * 前端无法区分"权限不足"与"服务异常"。
 */
export function requireWritableBranch(scope: BranchScope): string {
  if (!scope.writable) {
    throw new ForbiddenException('error.branch.write_not_allowed');
  }
  return scope.writable;
}

/**
 * 解析「本次操作要写入哪个机构」，用于总部代各机构执行的管理动作（建账号、建供应商等）。
 *
 * 这里区分了两件此前被我混为一谈的事：
 * - 总部**不拥有自己的数据空间**：任何业务数据都不能挂在总部名下（requireWritableBranch 仍然拒绝）。
 * - 总部**可以代具体机构执行管理动作**：但必须显式指明目标机构，不存在"默认机构"。
 *
 * 普通机构用户一律写入自己所在机构，并**忽略**请求里携带的目标机构 ——
 * 若采纳客户端传值，印尼的管理员就能凭一个 branchId 往越南塞数据。
 *
 * @param requestedBranchId 总部指定的目标机构；机构用户传入无效。
 */
export function resolveAdminWriteBranch(
  scope: BranchScope,
  isHq: boolean,
  requestedBranchId?: string,
): string {
  if (!isHq) return requireWritableBranch(scope);
  if (!requestedBranchId) throw new BadRequestException('error.branch.target_required');
  // 总部的目标机构不在此校验合法性：
  // scope.readable 是「数据可读范围」，只含国家机构（总部不持有业务数据）；
  // 而管理动作的目标可以是总部自身（例如为总部创建管理员账号），两者不是同一个集合。
  // 目标机构是否存在、是否启用、角色是否匹配，由各业务在写入事务内校验 ——
  // 那里本就要读机构记录，在此重复校验既多一次查询，也容易与业务规则脱节。
  return requestedBranchId;
}
