/**
 * 文件：backend/src/modules/organization/organization.module.ts
 * 功能：装配机构与成员管理能力，并对外提供机构上下文解析服务。
 * 交互：向 app.module.ts 暴露 OrganizationController；BranchContextService 供 auth 模块解析登录用户的机构范围。
 * 作者：吴川
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from './branch.entity';
import { BranchMember } from './branch-member.entity';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import { User } from '../auth/user.entity';
import { AuditLog } from '../../shared/audit/audit-log.entity';
import { AuditService } from '../../shared/audit/audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([Branch, BranchMember, User, AuditLog])],
  controllers: [OrganizationController],
  providers: [OrganizationService, AuditService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
