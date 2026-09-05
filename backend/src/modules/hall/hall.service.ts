/**
 * 文件：backend/src/modules/hall/hall.service.ts
 * 功能：提供公开大厅所需的公司信息、公开招标列表和详情能力。
 * 交互：被 hall.controller.ts 调用；读取 tenders/lots 数据，为前端大厅首页和详情页提供公开接口。
 * 作者：吴川
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HallVisibility, ParticipationMode, Tender, TenderStatus } from '../tender/tender.entity';

@Injectable()
export class HallService {
  constructor(
    @InjectRepository(Tender) private readonly tenderRepo: Repository<Tender>,
  ) {}

  async getCompanyProfile() {
    return {
      name: 'BidFlow Procurement Center',
      intro: 'Public tender and collaborative quotation portal for suppliers.',
      contactEmail: 'procurement@bidflow.local',
    };
  }

  async listPublicTenders(page = 1, limit = 20, viewerBranchId?: string, branchCode?: string) {
    await this.refreshLifecycleStatuses();
    const qb = this.publicTenderBaseQuery(viewerBranchId, branchCode)
      .leftJoinAndSelect('t.lots', 'lots')
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('t.createdAt', 'DESC');
    const [items, total] = await qb.getManyAndCount();

    // 附带机构信息：多机构大厅里必须让访客看出这条标属于哪个国家，
    // 否则点进去才发现不是自己机构的，体验是断的。
    const branchIds = Array.from(new Set(items.map((t) => t.branchId).filter(Boolean)));
    const branchRows = branchIds.length
      ? await this.tenderRepo.manager.query(
        'SELECT id, code, name FROM branches WHERE id = ANY($1::uuid[])',
        [branchIds],
      )
      : [];
    const branchMap = new Map(branchRows.map((b: any) => [b.id, { code: b.code, name: b.name }]));

    return {
      items: items.map((t) => ({ ...t, branch: branchMap.get(t.branchId) ?? null })),
      total,
      page,
      limit,
    };
  }

  async getPortalSummary() {
    await this.refreshLifecycleStatuses();
    const now = new Date();
    const closingBefore = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const publicStatuses = this.publicStatuses();

    const publicTenderCount = await this.publicTenderBaseQuery()
      .getCount();

    const lotCountRow = await this.publicTenderBaseQuery()
      .leftJoin('t.lots', 'lots')
      .select('COUNT(lots.id)', 'count')
      .getRawOne<{ count: string }>();

    const publicQuoteOpenCount = await this.publicTenderBaseQuery()
      .andWhere('t.status = :status', { status: TenderStatus.OPEN })
      .andWhere('t.participationMode = :participationMode', { participationMode: ParticipationMode.ALL })
      .andWhere('(t.bidDeadline IS NULL OR t.bidDeadline > :now)', { now })
      .getCount();

    const closingSoonCount = await this.publicTenderBaseQuery()
      .andWhere('t.status IN (:...activeStatuses)', { activeStatuses: [TenderStatus.PUBLISHED, TenderStatus.OPEN] })
      .andWhere('t.bidDeadline IS NOT NULL')
      .andWhere('t.bidDeadline > :now', { now })
      .andWhere('t.bidDeadline <= :closingBefore', { closingBefore })
      .getCount();

    const nextDeadlineRow = await this.publicTenderBaseQuery()
      .andWhere('t.status IN (:...activeStatuses)', { activeStatuses: [TenderStatus.PUBLISHED, TenderStatus.OPEN] })
      .andWhere('t.bidDeadline IS NOT NULL')
      .andWhere('t.bidDeadline > :now', { now })
      .select('MIN(t.bidDeadline)', 'nextDeadlineAt')
      .getRawOne<{ nextDeadlineAt?: Date | string }>();

    return {
      publicTenderCount,
      publicLotCount: Number(lotCountRow?.count ?? 0),
      publicQuoteOpenCount,
      closingSoonCount,
      nextDeadlineAt: nextDeadlineRow?.nextDeadlineAt ?? null,
      rules: {
        publicTenderStatuses: publicStatuses,
        quoteOpenStatus: TenderStatus.OPEN,
        quoteOpenParticipationMode: ParticipationMode.ALL,
        closingSoonHours: 72,
      },
    };
  }

  async getPublicTender(id: string, viewerBranchId?: string) {
    await this.refreshLifecycleStatuses();
    // 走与列表相同的可见性判定：能在大厅列表里看到的，点进去就应该打得开
    const tender = await this.publicTenderBaseQuery(viewerBranchId)
      .leftJoinAndSelect('t.lots', 'lots')
      .andWhere('t.id = :id', { id })
      .getOne();
    if (!tender) throw new NotFoundException('error.tender.not_found');

    const [branch] = await this.tenderRepo.manager.query(
      'SELECT code, name FROM branches WHERE id = $1',
      [tender.branchId],
    );

    return {
      ...tender,
      deadlineChanges: await this.tenderRepo.manager.query(`SELECT id,round_no,old_deadline,new_deadline,
        announcement,timezone,created_at FROM tender_deadline_changes
        WHERE tender_id=$1 ORDER BY created_at DESC LIMIT 100`, [tender.id]),
      // 招标所属机构。前端据此判断：若与访客当前机构不同，
      // 提示"切换到该机构后可参与"，而不是让用户面对一个点不动的按钮。
      branch: branch ? { code: branch.code, name: branch.name } : null,
      belongsToViewerBranch: Boolean(viewerBranchId) && tender.branchId === viewerBranchId,
    };
  }

  private publicStatuses() {
    return [TenderStatus.PUBLISHED, TenderStatus.OPEN, TenderStatus.CLOSED, TenderStatus.AWARDED];
  }

  /**
   * 公开招标的统一基础查询。大厅的所有查询都必须经过这里 ——
   * 公开范围判定只有一处实现，避免各查询各写一套导致口径不一致。
   *
   * @param viewerBranchId 访客当前所在机构。未登录访客传空，此时只能看到范围为 global 的招标。
   * @param branchCode 访客主动选择的国家筛选，与公开范围是「与」的关系：
   *                   筛选只能收窄可见集合，不能扩大。
   */
  private publicTenderBaseQuery(viewerBranchId?: string, branchCode?: string) {
    const qb = this.tenderRepo.createQueryBuilder('t')
      .where('t.isHallVisible = :visible', { visible: true })
      .andWhere('t.status IN (:...statuses)', { statuses: this.publicStatuses() });

    if (viewerBranchId) {
      qb.andWhere(
        `(
          t.hall_visibility = :global
          OR t.branch_id = :viewerBranch
          OR (t.hall_visibility = :branches AND :viewerBranch = ANY(t.hall_visible_branches))
        )`,
        {
          global: HallVisibility.GLOBAL,
          branches: HallVisibility.BRANCHES,
          viewerBranch: viewerBranchId,
        },
      );
    } else {
      // 未登录访客没有机构上下文，只能看到明确标记为全球公开的招标
      qb.andWhere('t.hall_visibility = :global', { global: HallVisibility.GLOBAL });
    }

    if (branchCode) {
      qb.andWhere(
        't.branch_id IN (SELECT id FROM branches WHERE code = :branchCode)',
        { branchCode: branchCode.toUpperCase() },
      );
    }
    return qb;
  }

  /**
   * 供应商注册时可选择的机构。
   * 与大厅筛选选项不同：这里列出全部启用中的国家机构，包括当前没有公开招标的 ——
   * 新开的机构一开始没有标，但供应商必须能先注册进去，否则新机构永远招不到供应商。
   * 只暴露代码、名称与国别，不返回机构配置。
   */
  async listRegistrableBranches() {
    // 一并返回时区：前端据此按浏览器时区做地区预选，避免用户在多国机构里逐个辨认
    const rows = await this.tenderRepo.manager.query(
      `SELECT id, code, name, country_code AS "countryCode", settings->>'timezone' AS timezone
       FROM branches WHERE type = 'BRANCH' AND status = 'active' ORDER BY code`,
    );
    return rows;
  }

  /** 大厅的国家筛选选项：有公开招标的机构。没有公开内容的机构不列出，避免筛出空列表。 */
  async listHallBranches(viewerBranchId?: string) {
    const rows = await this.publicTenderBaseQuery(viewerBranchId)
      .innerJoin('branches', 'b', 'b.id = t.branch_id')
      .select('b.code', 'code')
      .addSelect('b.name', 'name')
      .addSelect('COUNT(DISTINCT t.id)', 'tenderCount')
      .groupBy('b.code')
      .addGroupBy('b.name')
      .orderBy('b.code', 'ASC')
      .getRawMany<{ code: string; name: string; tenderCount: string }>();
    return rows.map((r) => ({ ...r, tenderCount: Number(r.tenderCount) }));
  }

  private async refreshLifecycleStatuses() {
    const now = new Date();
    await this.tenderRepo
      .createQueryBuilder()
      .update(Tender)
      .set({ status: TenderStatus.CLOSED })
      .where('status IN (:...statuses)', { statuses: [TenderStatus.PUBLISHED, TenderStatus.OPEN] })
      .andWhere('bid_deadline IS NOT NULL')
      .andWhere('bid_deadline <= :now', { now })
      .execute();

    await this.tenderRepo
      .createQueryBuilder()
      .update(Tender)
      .set({ status: TenderStatus.OPEN })
      .where('status = :status', { status: TenderStatus.PUBLISHED })
      .andWhere('(bid_start_at IS NULL OR bid_start_at <= :now)', { now })
      .andWhere('(bid_deadline IS NULL OR bid_deadline > :now)', { now })
      .execute();
  }
}
