/**
 * 文件：backend/src/modules/supplier/supplier.module.ts
 * 功能：装配供应商模块的控制器、服务与实体仓储。
 * 交互：向 app.module.ts 注册；供招标邀请、导出和供应商后台页面复用供应商数据能力。
 * 作者：吴川
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './supplier.entity';
import { SupplierDocument } from './supplier-document.entity';
import { SupplierReviewLog } from './supplier-review-log.entity';
import { SupplierInvitation } from './supplier-invitation.entity';
import { SupplierController } from './supplier.controller';
import { SupplierPortalController } from './supplier-portal.controller';
import { SupplierService } from './supplier.service';
import { AuditLog } from '../../shared/audit/audit-log.entity';
import { AuditService } from '../../shared/audit/audit.service';
import { User } from '../auth/user.entity';
import { SupplierAccount } from '../auth/supplier-account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, SupplierDocument, SupplierReviewLog, SupplierInvitation, AuditLog, User, SupplierAccount])],
  controllers: [SupplierController, SupplierPortalController],
  providers: [SupplierService, AuditService],
  exports: [SupplierService],
})
export class SupplierModule {}
