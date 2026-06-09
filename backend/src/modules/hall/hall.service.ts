/**
 * 文件：backend/src/modules/hall/hall.service.ts
 * 功能：提供公开大厅所需的公司信息、公开招标列表和详情能力。
 * 交互：被 hall.controller.ts 调用；读取 tenders/lots 数据，为前端大厅首页和详情页提供公开接口。
 * 作者：吴川
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ParticipationMode, Tender, TenderStatus } from '../tender/tender.entity';

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

  async listPublicTenders(page = 1, limit = 20) {
    await this.refreshLifecycleStatuses();
    const qb = this.tenderRepo.createQueryBuilder('t')
      .leftJoinAndSelect('t.lots', 'lots')
      .where('t.isHallVisible = :visible', { visible: true })
      .andWhere('t.status IN (:...statuses)', { statuses: this.publicStatuses() })
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('t.createdAt', 'DESC');
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
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

  async getPublicTender(id: string) {
    await this.refreshLifecycleStatuses();
    const tender = await this.tenderRepo.findOne({
      where: { id, isHallVisible: true as any },
      relations: ['lots'],
    });
    if (!tender || ![TenderStatus.PUBLISHED, TenderStatus.OPEN, TenderStatus.CLOSED, TenderStatus.AWARDED].includes(tender.status)) {
      throw new NotFoundException('error.tender.not_found');
    }
    return tender;
  }

  private publicStatuses() {
    return [TenderStatus.PUBLISHED, TenderStatus.OPEN, TenderStatus.CLOSED, TenderStatus.AWARDED];
  }

  private publicTenderBaseQuery() {
    return this.tenderRepo.createQueryBuilder('t')
      .where('t.isHallVisible = :visible', { visible: true })
      .andWhere('t.status IN (:...statuses)', { statuses: this.publicStatuses() });
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
