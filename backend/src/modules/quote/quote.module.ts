/**
 * 文件：backend/src/modules/quote/quote.module.ts
 * 功能：装配报价、排名快照、招标标包与 Redis 依赖，形成报价域运行模块。
 * 交互：向 app.module.ts 注册；为 quote.controller.ts / quote.service.ts 提供实体仓储与共享服务。
 * 作者：吴川
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quote } from './quote.entity';
import { LineQuote } from './line-quote.entity';
import { RankingSnapshot } from './ranking-snapshot.entity';
import { Tender } from '../tender/tender.entity';
import { Lot } from '../tender/lot.entity';
import { LotLine } from '../tender/lot-line.entity';
import { Invitation } from '../tender/invitation.entity';
import { Supplier } from '../supplier/supplier.entity';
import { QuoteController } from './quote.controller';
import { QuoteService } from './quote.service';
import { AuditLog } from '../../shared/audit/audit-log.entity';
import { AuditService } from '../../shared/audit/audit.service';
import { RedisService } from '../../shared/config/redis.config';

@Module({
  imports: [TypeOrmModule.forFeature([Quote, LineQuote, RankingSnapshot, Tender, Lot, LotLine, Invitation, Supplier, AuditLog])],
  controllers: [QuoteController],
  providers: [QuoteService, AuditService, RedisService],
  exports: [QuoteService],
})
export class QuoteModule {}
