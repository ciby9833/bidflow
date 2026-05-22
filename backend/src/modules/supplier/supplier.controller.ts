/**
 * 文件：backend/src/modules/supplier/supplier.controller.ts
 * 功能：提供供应商列表、详情、创建、更新、挂起与恢复接口。
 * 交互：调用 supplier.service.ts；被 SupplierListView.vue 和 SupplierCreateView.vue 使用；依赖 rbac.guard.ts 控制权限。
 * 作者：吴川
 */
import {
  Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { SupplierService } from './supplier.service';
import { SupplierReviewStatus, SupplierStatus } from './supplier.entity';
import { ApiResponse } from '../../shared/dto/response.dto';
import { RbacGuard, RequireScopes } from '../../shared/rbac/rbac.guard';
import { User } from '../auth/user.entity';

function ctx(req: Request) {
  const u = req.user as User;
  return { userId: u.id, userRole: u.role, ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] };
}

@Controller('api/suppliers')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class SupplierController {
  constructor(private readonly svc: SupplierService) {}

  @Post()
  @RequireScopes('supplier:create')
  async create(@Body() body: any, @Req() req: Request) {
    const result = await this.svc.create(body, ctx(req));
    return ApiResponse.ok(result);
  }

  @Get()
  @RequireScopes('supplier:view')
  async list(@Query() q: {
    status?: SupplierStatus;
    reviewStatus?: SupplierReviewStatus;
    search?: string;
    page?: string;
    limit?: string;
  }) {
    const result = await this.svc.findAll({
      status: q.status,
      reviewStatus: q.reviewStatus,
      search: q.search,
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 20,
    });
    return ApiResponse.ok(result.items, { total: result.total, page: result.page, limit: result.limit });
  }

  @Get('export')
  @RequireScopes('supplier:view')
  async export(
    @Query() q: { status?: SupplierStatus; reviewStatus?: SupplierReviewStatus; search?: string },
    @Res() res: Response,
  ) {
    const buffer = await this.svc.exportSuppliers({
      status: q.status,
      reviewStatus: q.reviewStatus,
      search: q.search,
    });
    const filename = `bidflow-suppliers-${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('participants/import-template')
  @RequireScopes('supplier:view')
  async importTemplate(@Res() res: Response) {
    const buffer = this.svc.buildParticipantImportTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="bidflow-participant-import-template.xlsx"');
    res.send(buffer);
  }

  @Post('participants/import')
  @RequireScopes('supplier:view')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async importParticipants(@UploadedFile() file: any) {
    return ApiResponse.ok(await this.svc.resolveParticipantImport(file?.buffer));
  }

  @Get(':id')
  @RequireScopes('supplier:view')
  async findOne(@Param('id') id: string) {
    return ApiResponse.ok(await this.svc.findById(id));
  }

  @Get(':id/review-detail')
  @RequireScopes('supplier:view')
  async reviewDetail(@Param('id') id: string) {
    return ApiResponse.ok(await this.svc.findReviewDetail(id));
  }

  @Patch(':id')
  @RequireScopes('supplier:edit')
  async update(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.update(id, body, ctx(req)));
  }

  @Post(':id/suspend')
  @RequireScopes('supplier:edit')
  async suspend(@Param('id') id: string, @Body() body: { reason: string }, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.suspend(id, body.reason, ctx(req)));
  }

  @Post(':id/resume')
  @RequireScopes('supplier:edit')
  async resume(@Param('id') id: string, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.resume(id, ctx(req)));
  }

  @Post(':id/approve')
  @RequireScopes('supplier:edit')
  async approve(@Param('id') id: string, @Body() body: { comment?: string }, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.approve(id, ctx(req), body.comment));
  }

  @Post(':id/reject')
  @RequireScopes('supplier:edit')
  async reject(@Param('id') id: string, @Body() body: { comment?: string }, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.reject(id, body.comment, ctx(req)));
  }

  @Post(':id/request-supplement')
  @RequireScopes('supplier:edit')
  async requestSupplement(@Param('id') id: string, @Body() body: { comment?: string }, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.requestSupplement(id, body.comment, ctx(req)));
  }

  @Post(':id/invitations')
  @RequireScopes('supplier:edit')
  async createInvitation(
    @Param('id') id: string,
    @Body() body: { email?: string; relationRole?: 'admin' | 'operator' },
    @Req() req: Request,
  ) {
    return ApiResponse.ok(await this.svc.createInvitation(id, body, ctx(req)));
  }

  @Get(':id/invitations')
  @RequireScopes('supplier:view')
  async listInvitations(@Param('id') id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return ApiResponse.ok(await this.svc.listInvitations(id, Number(page), Number(limit)));
  }

  @Post(':id/invitations/:invitationId/revoke')
  @RequireScopes('supplier:edit')
  async revokeInvitation(@Param('id') id: string, @Param('invitationId') invitationId: string, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.revokeInvitation(id, invitationId, ctx(req)));
  }
}
