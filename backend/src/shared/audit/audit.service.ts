/**
 * 文件：backend/src/shared/audit/audit.service.ts
 * 功能：封装审计日志写入，统一记录操作者、实体、前后变更与请求来源。
 * 交互：被 auth/supplier/tender/quote/export 服务调用；持久化到 audit-log.entity.ts。
 * 作者：吴川
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction, AuditEntityType } from './audit-log.entity';

export interface AuditContext {
  userId: string;
  userRole: string;
  ipAddress: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async log(
    ctx: AuditContext,
    entityType: AuditEntityType,
    entityId: string,
    action: AuditAction,
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const entry = this.repo.create({
      entityType,
      entityId,
      action,
      userId: ctx.userId,
      userRole: ctx.userRole,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      beforeState: before as AuditLog['beforeState'],
      afterState: after as AuditLog['afterState'],
      metadata: metadata as AuditLog['metadata'],
    });
    await this.repo.save(entry);
  }
}
