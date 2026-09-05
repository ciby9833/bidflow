/**
 * 文件：backend/src/modules/organization/branch-context.service.ts
 * 功能：解析登录用户的机构归属、机构内角色与可访问机构范围，是机构隔离的唯一事实来源。
 * 交互：被 auth.service.ts 在签发 Token 时调用，被 jwt.strategy.ts 在每次请求时调用；读取 branches / branch_members。
 * 作者：吴川
 *
 * 设计约束（刻意为之，勿擅改）：
 * 1. 总部的可访问机构范围**不写进 Token** —— 新增机构后旧 Token 会缺失、撤权后旧 Token 仍有效、机构多时 Token 膨胀。
 *    Token 只存 isHq 标记，范围每次请求在服务端解析。
 * 2. 总部与普通用户返回同一种结构（branchScope 数组），差别仅在数组长度。
 *    调用方因此只有一条代码路径，不需要写 `if (isHq) 跳过过滤` —— 那种写法漏一处就是越权。
 * 3. 解析结果 fail-closed：无有效成员关系时 branchScope 为空数组，查询将命中空集而非全集。
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch, BranchStatus, BranchType } from './branch.entity';
import { BranchMember, BranchMemberRole, BranchMemberStatus } from './branch-member.entity';
import {
  BranchScope, branchScopeFor, emptyBranchScope, hqBranchScope,
} from '../../shared/tenant/branch-scope';

/**
 * 用户可访问的单个机构。
 *
 * role 可空：公司用户在机构内持有明确的组织角色；供应商账号则是「机构下的业务主体」，
 * 在组织结构中不占位、没有角色，其能力集由 accountType 决定（见 scope-map.ts）。
 * 早期为满足类型给供应商填了一个占位角色，会让「供应商是评审员」这类错误语义进入系统，已废弃。
 */
export interface BranchAccessView {
  branchId: string;
  branchCode: string;
  branchName: string;
  branchType: BranchType;
  /** Current branch base currency, used only for form defaults. */
  currency?: string;
  role?: BranchMemberRole;
}

/** 请求级机构上下文 */
export interface BranchContext {
  /** 该用户可访问的全部机构，用于前端机构切换器 */
  branches: BranchAccessView[];
  /** 当前激活机构。总部成员在未选择具体机构时为空。 */
  activeBranchId?: string;
  /** 当前激活机构内的角色 */
  activeRole?: BranchMemberRole;
  /** 是否为总部成员 */
  isHq: boolean;
  /**
   * 数据作用域，业务查询的唯一凭据，直接传给 TenantRepository。
   * 总部可读全部启用中的国家机构但不可写；普通用户读写限于其激活机构；无归属时读写皆空。
   */
  scope: BranchScope;
}

@Injectable()
export class BranchContextService {
  constructor(
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(BranchMember) private readonly memberRepo: Repository<BranchMember>,
  ) {}

  /** 读取用户全部有效成员身份（机构与成员关系都必须为 active） */
  async listMemberships(authUserId: string): Promise<BranchAccessView[]> {
    const rows = await this.memberRepo
      .createQueryBuilder('m')
      .innerJoin(Branch, 'b', 'b.id = m.branch_id')
      .select([
        'm.branch_id AS "branchId"',
        'b.code AS "branchCode"',
        'b.name AS "branchName"',
        'b.type AS "branchType"',
        `b.settings->>'currency' AS "currency"`,
        'm.role AS "role"',
      ])
      .where('m.auth_user_id = :authUserId', { authUserId })
      .andWhere('m.status = :memberStatus', { memberStatus: BranchMemberStatus.ACTIVE })
      .andWhere('b.status = :branchStatus', { branchStatus: BranchStatus.ACTIVE })
      // 国家机构优先于总部：总部不能执行业务操作，默认激活国家机构更符合日常使用
      .orderBy(`CASE WHEN b.type = '${BranchType.BRANCH}' THEN 0 ELSE 1 END`, 'ASC')
      .addOrderBy('b.code', 'ASC')
      .getRawMany<BranchAccessView>();

    return rows;
  }

  /**
   * 读取供应商账号的机构归属。
   * 供应商不是组织成员，其机构来自「在哪些机构有准入档案」，因此走 supplier_branch_profiles。
   * 跨境供应商可在多个机构有档案，此时与多机构员工一样需要选择激活机构。
   */
  async listSupplierBranches(supplierId: string): Promise<BranchAccessView[]> {
    return this.memberRepo.manager
      .createQueryBuilder()
      .select([
        'p.branch_id AS "branchId"',
        'b.code AS "branchCode"',
        'b.name AS "branchName"',
        'b.type AS "branchType"',
        `b.settings->>'currency' AS "currency"`,
      ])
      .from('supplier_branch_profiles', 'p')
      .innerJoin(Branch, 'b', 'b.id = p.branch_id')
      .where('p.supplier_id = :supplierId', { supplierId })
      .andWhere(`p.status = 'active'`)
      .andWhere('b.status = :branchStatus', { branchStatus: BranchStatus.ACTIVE })
      .orderBy('b.code', 'ASC')
      // 不补角色：供应商在组织结构中不占位，role 保持 undefined
      .getRawMany<BranchAccessView>();
  }

  /**
   * 解析请求级机构上下文。
   * @param preferredBranchId 期望激活的机构（来自 Token 或切换请求）。不在归属范围内时忽略，回落到默认机构。
   * @param supplierId 供应商账号的供应商 ID。传入时机构归属改从供应商机构档案解析。
   */
  async resolve(
    authUserId: string,
    preferredBranchId?: string,
    supplierId?: string,
  ): Promise<BranchContext> {
    const branches = supplierId
      ? await this.listSupplierBranches(supplierId)
      : await this.listMemberships(authUserId);

    if (!branches.length) {
      // fail-closed：无任何机构归属时读写皆空，绝不退化成可见全部
      return { branches, isHq: false, scope: emptyBranchScope() };
    }

    // 只接受成员范围内的机构，防止携带任意 branchId 越权
    const active = branches.find((m) => m.branchId === preferredBranchId) ?? branches[0];

    // 关键：以「当前激活的是哪个机构」判定，而非「是否拥有总部成员资格」。
    // 同一人可能既是总部管理员又是某国机构成员（如系统负责人），
    // 若按后者判定，他在国家机构下也会被当成总部而无法写入业务数据。
    const actingAsHq = active.branchType === BranchType.HQ;

    // 总部视角：可跨机构读、不可写；国家机构视角：读写限于该机构。
    // 两者返回同一种结构，调用方因此只有一条代码路径，不需要写 `if (isHq)` 分支。
    const scope = actingAsHq
      ? hqBranchScope(await this.listActiveBranchIds())
      : branchScopeFor(active.branchId);

    return {
      branches,
      activeBranchId: active.branchId,
      activeRole: active.role,
      isHq: actingAsHq,
      scope,
    };
  }

  /** 全部启用中的国家机构 ID。总部的数据可见范围，不含总部自身（总部不持有业务数据）。 */
  async listActiveBranchIds(): Promise<string[]> {
    const rows = await this.branchRepo.find({
      where: { type: BranchType.BRANCH, status: BranchStatus.ACTIVE },
      select: ['id'],
    });
    return rows.map((r) => r.id);
  }
}
