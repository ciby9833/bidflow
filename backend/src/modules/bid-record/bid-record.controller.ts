/**
 * 文件：backend/src/modules/bid-record/bid-record.controller.ts
 * 功能：提供供应商“我的投标”列表查询接口。
 * 交互：读取当前 JWT 用户的 supplierId，调用 bid-record.service.ts 返回本人投标记录。
 * 作者：吴川
 */
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ApiResponse } from '../../shared/dto/response.dto';
import { RbacGuard, RequireScopes } from '../../shared/rbac/rbac.guard';
import { User } from '../auth/user.entity';
import { BidRecordKind, BidRecordService } from './bid-record.service';
import { TenderStatus, TenderType } from '../tender/tender.entity';

@Controller('api/supplier/bids')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class BidRecordController {
  constructor(private readonly svc: BidRecordService) {}

  @Get()
  @RequireScopes('quote:view_own')
  async list(@Query() q: {
    search?: string;
    status?: TenderStatus;
    type?: TenderType;
    kind?: BidRecordKind;
    page?: string;
    limit?: string;
  }, @Req() req: Request) {
    const user = req.user as User;
    const result = await this.svc.listMine(user.supplierId!, {
      search: q.search,
      status: q.status,
      type: q.type,
      kind: q.kind,
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 20,
    });
    return ApiResponse.ok(result.items, { total: result.total, page: result.page, limit: result.limit });
  }
}
