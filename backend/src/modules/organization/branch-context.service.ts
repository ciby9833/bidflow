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

/** 用户在单个机构内的成员身份 */
export interface BranchMembershipView {
  branchId: string;
  branchCode: string;
  branchName: string;
  branchType: BranchType;
  role: BranchMemberRole;
}

/** 请求级机构上下文 */
export interface BranchContext {
  /** 该用户全部有效成员身份，用于前端机构切换器 */
  memberships: BranchMembershipView[];
  /** 当前激活机构。总部成员在未选择具体机构时为空。 */
  activeBranchId?: string;
  /** 当前激活机构内的角色 */
  activeRole?: BranchMemberRole;
  /** 是否为总部成员 */
  isHq: boolean;
  /**
   * 数据可见范围。查询统一使用 `branch_id IN (:...branchScope)`。
   * 总部为全部启用中的国家机构，普通用户为其单个激活机构，无归属时为空数组。
   */
  branchScope: string[];
}

@Injectable()
export class BranchContextService {
  constructor(
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(BranchMember) private readonly memberRepo: Repository<BranchMember>,
  ) {}

  /** 读取用户全部有效成员身份（机构与成员关系都必须为 active） */
  async listMemberships(authUserId: string): Promise<BranchMembershipView[]> {
    const rows = await this.memberRepo
      .createQueryBuilder('m')
      .innerJoin(Branch, 'b', 'b.id = m.branch_id')
      .select([
        'm.branch_id AS "branchId"',
        'b.code AS "branchCode"',
        'b.name AS "branchName"',
        'b.type AS "branchType"',
        'm.role AS "role"',
      ])
      .where('m.auth_user_id = :authUserId', { authUserId })
      .andWhere('m.status = :memberStatus', { memberStatus: BranchMemberStatus.ACTIVE })
      .andWhere('b.status = :branchStatus', { branchStatus: BranchStatus.ACTIVE })
      // 国家机构优先于总部：总部不能执行业务操作，默认激活国家机构更符合日常使用
      .orderBy(`CASE WHEN b.type = '${BranchType.BRANCH}' THEN 0 ELSE 1 END`, 'ASC')
      .addOrderBy('b.code', 'ASC')
      .getRawMany<BranchMembershipView>();

    return rows;
  }

  /**
   * 解析请求级机构上下文。
   * @param preferredBranchId 期望激活的机构（来自 Token 或切换请求）。不在成员范围内时忽略，回落到默认机构。
   */
  async resolve(authUserId: string, preferredBranchId?: string): Promise<BranchContext> {
    const memberships = await this.listMemberships(authUserId);
    const isHq = memberships.some((m) => m.branchType === BranchType.HQ);

    if (!memberships.length) {
      // fail-closed：无任何机构归属时不给予任何数据可见范围
      return { memberships, isHq: false, branchScope: [] };
    }

    // 只接受成员范围内的机构，防止携带任意 branchId 越权
    const active = memberships.find((m) => m.branchId === preferredBranchId) ?? memberships[0];

    const branchScope = isHq
      ? await this.listActiveBranchIds()
      : [active.branchId];

    return {
      memberships,
      activeBranchId: active.branchId,
      activeRole: active.role,
      isHq,
      branchScope,
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
