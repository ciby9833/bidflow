/**
 * 文件：backend/src/modules/tender/tender.module.ts
 * 功能：装配招标、标包与邀请相关的控制器、服务和仓储。
 * 交互：向 app.module.ts 注册；为 quote.service.ts 与前端招标页面提供招标域能力。
 * 作者：吴川
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tender } from './tender.entity';
import { Lot } from './lot.entity';
import { LotLine } from './lot-line.entity';
import { Invitation } from './invitation.entity';
import { Quote } from '../quote/quote.entity';
import { LineQuote } from '../quote/line-quote.entity';
import { Supplier } from '../supplier/supplier.entity';
import { User } from '../auth/user.entity';
import { SupplierTenderController, TenderController } from './tender.controller';
import { TenderService } from './tender.service';
import { AuditLog } from '../../shared/audit/audit-log.entity';
import { AuditService } from '../../shared/audit/audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tender, Lot, LotLine, Invitation, Quote, LineQuote, Supplier, User, AuditLog])],
  controllers: [TenderController, SupplierTenderController],
  providers: [TenderService, AuditService],
  exports: [TenderService],
})
export class TenderModule {}
