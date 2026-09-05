/**
 * 文件：backend/src/modules/organization/organization.service.ts
 * 功能：总部对机构与机构成员的管理能力——建机构、停用机构、分配成员与角色。
 * 交互：被 organization.controller.ts 调用；写入 branches / branch_members；变更成员时联动 users.token_version。
 * 作者：吴川
 *
 * 安全约束（刻意为之，勿擅改）：
 * 1. 撤销成员资格、停用机构、降级角色时必须自增 token_version。
 *    否则被移除的人手上的旧 Token 仍带着原机构，能继续读该机构数据直到过期 —— 权限隔离形同虚设。
 * 2. hq_admin 只能出现在总部机构下。该规则无法用 CHECK 约束表达（PostgreSQL 的 CHECK 不支持子查询），
 *    因此在此显式校验，是唯一的把关点。
 * 3. 总部机构不可通过接口创建或删除：全系统只允许一个总部，由迁移建立。
 */
import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { Branch, BranchSettings, BranchStatus, BranchType } from './branch.entity';
import { BranchMember, BranchMemberRole, BranchMemberStatus } from './branch-member.entity';
import { AccountType, User } from '../auth/user.entity';
import { AuditService, AuditContext } from '../../shared/audit/audit.service';
import { AuditAction, AuditEntityType } from '../../shared/audit/audit-log.entity';

export interface CreateBranchInput {
  code: string;
  name: string;
  countryCode: string;
  settings?: BranchSettings;
}

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(BranchMember) private readonly memberRepo: Repository<BranchMember>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly audit: AuditService,
    private readonly ds: DataSource,
  ) {}

  // ── 机构 ──────────────────────────────────────────────────────────────────

  async listBranches() {
    const branches = await this.branchRepo.find({
      order: { type: 'DESC', code: 'ASC' },
    });
    const counts = await this.memberRepo
      .createQueryBuilder('m')
      .select('m.branch_id', 'branchId')
      .addSelect('COUNT(*)', 'count')
      .where('m.status = :s', { s: BranchMemberStatus.ACTIVE })
      .groupBy('m.branch_id')
      .getRawMany<{ branchId: string; count: string }>();
    const countMap = new Map(counts.map((c) => [c.branchId, Number(c.count)]));

    return branches.map((b) => ({ ...b, memberCount: countMap.get(b.id) ?? 0 }));
  }

  async createBranch(input: CreateBranchInput, ctx: AuditContext) {
    const code = input.code.trim().toUpperCase();
    const countryCode = input.countryCode.trim().toUpperCase();
    if (!code) throw new BadRequestException('error.branch.code_required');

    const existing = await this.branchRepo.findOne({ where: { code } });
    if (existing) throw new ConflictException('error.branch.code_exists');

    const branch = this.branchRepo.create({
      code,
      name: input.name.trim(),
      // 接口只能创建国家机构：全系统仅一个总部，由迁移建立且不可增删
      type: BranchType.BRANCH,
      countryCode,
      settings: {
        ...(input.settings ?? {}),
        ...(!input.settings?.currency && countryCode === 'ID' ? { currency: 'IDR' } : {}),
        ...(!input.settings?.currency && countryCode === 'VN' ? { currency: 'VND' } : {}),
      },
      status: BranchStatus.ACTIVE,
    });
    const saved = await this.branchRepo.save(branch);

    await this.audit.log(ctx, AuditEntityType.USER, saved.id, AuditAction.USER_CREATE, undefined, {
      branchCode: saved.code,
      branchName: saved.name,
    });
    return saved;
  }

  async updateBranch(
    id: string,
    patch: { name?: string; settings?: BranchSettings; status?: BranchStatus },
    ctx: AuditContext,
  ) {
    const branch = await this.branchRepo.findOne({ where: { id } });
    if (!branch) throw new NotFoundException('error.branch.not_found');

    const before = { name: branch.name, status: branch.status };
    const disabling = patch.status === BranchStatus.INACTIVE && branch.status === BranchStatus.ACTIVE;

    if (branch.type === BranchType.HQ && patch.status === BranchStatus.INACTIVE) {
      throw new BadRequestException('error.branch.hq_cannot_be_disabled');
    }

    await this.ds.transaction(async (em) => {
      await em.update(Branch, id, {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.settings !== undefined ? { settings: patch.settings } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      });

      // 停用机构后，其成员手上的旧 Token 仍指向该机构，必须立即失效
      if (disabling) await this.revokeTokensOfBranch(em, id);
    });

    await this.audit.log(ctx, AuditEntityType.USER, id, AuditAction.USER_UPDATE, before, patch);
    return this.branchRepo.findOne({ where: { id } });
  }

  // ── 成员 ──────────────────────────────────────────────────────────────────

  async listMembers(branchId: string) {
    return this.memberRepo
      .createQueryBuilder('m')
      .innerJoin(User, 'u', 'u.id = m.auth_user_id')
      .select([
        'm.id AS "id"',
        'm.role AS "role"',
        'm.status AS "status"',
        'm.department AS "department"',
        'u.id AS "userId"',
        'u.email AS "email"',
        'u.display_name AS "displayName"',
      ])
      .where('m.branch_id = :branchId', { branchId })
      .orderBy('u.email', 'ASC')
      .getRawMany();
  }

  async addMember(
    branchId: string,
    input: { userId: string; role: BranchMemberRole; department?: string },
    ctx: AuditContext,
  ) {
    const branch = await this.branchRepo.findOne({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('error.branch.not_found');

    const user = await this.userRepo.findOne({ where: { id: input.userId } });
    if (!user) throw new NotFoundException('error.auth.user_not_found');
    // 供应商是机构下的业务主体，其机构归属由供应商机构档案决定，不能作为组织成员
    if (user.accountType !== AccountType.COMPANY_USER) {
      throw new BadRequestException('error.branch.supplier_cannot_be_member');
    }
    this.assertRoleFitsBranch(branch, input.role);

    const existing = await this.memberRepo.findOne({ where: { branchId, authUserId: input.userId } });
    if (existing) throw new ConflictException('error.branch.member_exists');

    const member = await this.memberRepo.save(this.memberRepo.create({
      branchId,
      authUserId: input.userId,
      role: input.role,
      department: input.department,
      status: BranchMemberStatus.ACTIVE,
      createdBy: ctx.userId,
    }));

    await this.audit.log(ctx, AuditEntityType.USER, input.userId, AuditAction.USER_UPDATE, undefined, {
      addedToBranch: branch.code,
      role: input.role,
    });
    return member;
  }

  async updateMember(
    branchId: string,
    memberId: string,
    patch: { role?: BranchMemberRole; status?: BranchMemberStatus; department?: string },
    ctx: AuditContext,
  ) {
    const member = await this.memberRepo.findOne({ where: { id: memberId, branchId } });
    if (!member) throw new NotFoundException('error.branch.member_not_found');

    const branch = await this.branchRepo.findOne({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('error.branch.not_found');
    if (patch.role) this.assertRoleFitsBranch(branch, patch.role);

    const before = { role: member.role, status: member.status };
    // 角色变更与停用都可能收窄权限，旧 Token 必须失效，否则降级后仍能按原权限操作
    const permissionNarrowed = (patch.role && patch.role !== member.role)
      || (patch.status === BranchMemberStatus.INACTIVE);

    await this.ds.transaction(async (em) => {
      await em.update(BranchMember, memberId, patch);
      if (permissionNarrowed) await this.revokeTokensOfUser(em, member.authUserId);
    });

    await this.audit.log(ctx, AuditEntityType.USER, member.authUserId, AuditAction.USER_UPDATE, before, patch);
    return this.memberRepo.findOne({ where: { id: memberId } });
  }

  async removeMember(branchId: string, memberId: string, ctx: AuditContext) {
    const member = await this.memberRepo.findOne({ where: { id: memberId, branchId } });
    if (!member) throw new NotFoundException('error.branch.member_not_found');

    // 总部不能没有管理员，否则无人能再管理组织结构
    if (member.role === BranchMemberRole.HQ_ADMIN) {
      const remaining = await this.memberRepo.count({
        where: {
          branchId, role: BranchMemberRole.HQ_ADMIN, status: BranchMemberStatus.ACTIVE, id: Not(memberId),
        },
      });
      if (remaining === 0) throw new BadRequestException('error.branch.last_hq_admin');
    }

    await this.ds.transaction(async (em) => {
      await em.delete(BranchMember, memberId);
      await this.revokeTokensOfUser(em, member.authUserId);
    });

    await this.audit.log(ctx, AuditEntityType.USER, member.authUserId, AuditAction.USER_UPDATE, {
      branchId, role: member.role,
    }, { removedFromBranch: branchId });
    return { removed: true };
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────

  /** hq_admin 只允许出现在总部；国家机构不得使用总部角色。 */
  private assertRoleFitsBranch(branch: Branch, role: BranchMemberRole) {
    const isHqRole = role === BranchMemberRole.HQ_ADMIN;
    if (isHqRole && branch.type !== BranchType.HQ) {
      throw new BadRequestException('error.branch.hq_role_outside_hq');
    }
    if (!isHqRole && branch.type === BranchType.HQ) {
      throw new BadRequestException('error.branch.branch_role_in_hq');
    }
  }

  /**
   * 让该用户已签发的 Token 立即失效。
   * 用 SQL 自增而非读改写，避免并发变更时版本号相互覆盖。
   */
  private async revokeTokensOfUser(em: { query: (sql: string, p?: unknown[]) => Promise<unknown> }, userId: string) {
    await em.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [userId]);
  }

  /** 让该机构全部成员的 Token 失效，用于机构停用。 */
  private async revokeTokensOfBranch(em: { query: (sql: string, p?: unknown[]) => Promise<unknown> }, branchId: string) {
    await em.query(
      `UPDATE users SET token_version = token_version + 1
       WHERE id IN (SELECT auth_user_id FROM branch_members WHERE branch_id = $1)`,
      [branchId],
    );
  }
}
