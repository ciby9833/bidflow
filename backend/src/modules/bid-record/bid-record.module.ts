/**
 * 文件：backend/src/modules/bid-record/bid-record.module.ts
 * 功能：装配“我的投标”只读查询模块。
 * 交互：向 app.module.ts 注册，提供供应商投标记录聚合接口。
 * 作者：吴川
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BidRecordController } from './bid-record.controller';
import { BidRecordService } from './bid-record.service';
import { Quote } from '../quote/quote.entity';
import { LineQuote } from '../quote/line-quote.entity';
import { LotLine } from '../tender/lot-line.entity';
import { Invitation } from '../tender/invitation.entity';
import { Supplier } from '../supplier/supplier.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Quote, LineQuote, LotLine, Invitation, Supplier])],
  controllers: [BidRecordController],
  providers: [BidRecordService],
})
export class BidRecordModule {}
