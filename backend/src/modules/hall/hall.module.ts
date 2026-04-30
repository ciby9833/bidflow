/**
 * 文件：backend/src/modules/hall/hall.module.ts
 * 功能：装配大厅公开接口所需的服务、控制器与仓储。
 * 交互：向 app.module.ts 注册；为公开大厅提供招标与公司信息读取能力。
 * 作者：吴川
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tender } from '../tender/tender.entity';
import { HallController } from './hall.controller';
import { HallService } from './hall.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tender])],
  controllers: [HallController],
  providers: [HallService],
})
export class HallModule {}
