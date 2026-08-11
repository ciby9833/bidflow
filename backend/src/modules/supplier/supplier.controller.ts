/**
 * 文件：backend/src/modules/supplier/supplier.controller.ts
 * 功能：提供供应商列表、详情、创建、更新、挂起与恢复接口。
 * 交互：调用 supplier.service.ts；被 SupplierListView.vue 和 SupplierCreateView.vue 使用；依赖 rbac.guard.ts 控制权限。
 * 作者：吴川
 */
import {
  Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors, Delete } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { SupplierService } from './supplier.service';
import { SupplierReviewStatus, SupplierStatus } from './supplier.entity';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { BranchScope, emptyBranchScope } from '../../shared/tenant/branch-scope';
import { ApiResponse } from '../../shared/dto/response.dto';
import { RbacGuard, RequireScopes } from '../../shared/rbac/rbac.guard';
import { User } from '../auth/user.entity';

function ctx(req: Request) {
  const u = req.user as User;
  return { userId: u.id, userRole: u.role, ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] };
}

/** 取当前请求的机构作用域。由 jwt.strategy.ts 校验成员资格后挂载，不接受客户端指定。 */
/** 当前请求是否以总部身份操作。总部代各机构执行管理动作时必须显式指明目标机构。 */
function isHqOf(req: Request): boolean {
  return (req.user as AuthenticatedUser).branch?.isHq ?? false;
}

function scopeOf(req: Request): BranchScope {
  return (req.user as AuthenticatedUser).branch?.scope ?? emptyBranchScope();
}

@Controller('api/suppliers')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class SupplierController {
  constructor(private readonly svc: SupplierService) {}

  @Post()
  @RequireScopes('supplier:create')
  async create(@Body() body: any, @Req() req: Request) {
    const result = await this.svc.create(scopeOf(req), isHqOf(req), body, ctx(req));
    return ApiResponse.ok(result);
  }

  @Get()
  @RequireScopes('supplier:view')
  async list(@Req() req: Request, @Query() q: {
    status?: SupplierStatus;
    reviewStatus?: SupplierReviewStatus;
    search?: string;
    page?: string;
    limit?: string;
  }) {
    const result = await this.svc.findAll(scopeOf(req), {
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
  async export(@Req() req: Request, 
    @Query() q: { status?: SupplierStatus; reviewStatus?: SupplierReviewStatus; search?: string },
    @Res() res: Response,
  ) {
    const buffer = await this.svc.exportSuppliers(scopeOf(req), {
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

  @Get('import-template')
  @RequireScopes('supplier:create')
  async createImportTemplate(@Res() res: Response) {
    const buffer = this.svc.buildCreateImportTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="bidflow-supplier-import-template.xlsx"');
    res.send(buffer);
  }

  @Post('import')
  @RequireScopes('supplier:create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async bulkCreate(
    @UploadedFile() file: any,
    @Req() req: Request,
    @Body('branchId') branchId?: string,
  ) {
    return ApiResponse.ok(await this.svc.bulkCreateSuppliers(scopeOf(req), isHqOf(req), branchId, file?.buffer, ctx(req)));
  }

  @Get('accounts/import-template')
  @RequireScopes('supplier:create')
  async accountImportTemplate(@Res() res: Response) {
    const buffer = this.svc.buildAccountImportTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="bidflow-supplier-account-import-template.xlsx"');
    res.send(buffer);
  }

  @Post('accounts/import')
  @RequireScopes('supplier:create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async bulkImportAccounts(@UploadedFile() file: any, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.bulkImportSupplierAccounts(file?.buffer, ctx(req)));
  }

  @Get(':id')
  @RequireScopes('supplier:view')
  async findOne(@Req() req: Request, @Param('id') id: string) {
    return ApiResponse.ok(await this.svc.findById(scopeOf(req), id));
  }

  @Get(':id/review-detail')
  @RequireScopes('supplier:view')
  async reviewDetail(@Req() req: Request, @Param('id') id: string) {
    return ApiResponse.ok(await this.svc.findReviewDetail(scopeOf(req), id));
  }

  @Get(':id/members')
  @RequireScopes('supplier:view')
  async listMembers(@Req() req: Request, @Param('id') id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return ApiResponse.ok(await this.svc.listMembers(scopeOf(req), id, Number(page), Number(limit)));
  }

  @Patch(':id/members/:memberId')
  @RequireScopes('supplier:edit')
  async updateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: { relationRole?: 'owner' | 'admin' | 'operator'; status?: 'active' | 'suspended'; isPrimary?: boolean; displayName?: string },
    @Req() req: Request,
  ) {
    return ApiResponse.ok(await this.svc.updateMember(scopeOf(req), id, memberId, body, ctx(req)));
  }

  @Post(':id/members/:memberId/reset-password')
  @RequireScopes('supplier:edit')
  async resetMemberPassword(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: { password: string },
    @Req() req: Request,
  ) {
    return ApiResponse.ok(await this.svc.resetMemberPassword(scopeOf(req), id, memberId, body.password, ctx(req)));
  }

  @Patch(':id')
  @RequireScopes('supplier:edit')
  async update(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.update(scopeOf(req), id, body, ctx(req)));
  }

  @Post(':id/suspend')
  @RequireScopes('supplier:edit')
  async suspend(@Param('id') id: string, @Body() body: { reason: string }, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.suspend(scopeOf(req), id, body.reason, ctx(req)));
  }

  @Post(':id/resume')
  @RequireScopes('supplier:edit')
  async resume(@Param('id') id: string, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.resume(scopeOf(req), id, ctx(req)));
  }

  @Post(':id/approve')
  @RequireScopes('supplier:edit')
  async approve(@Param('id') id: string, @Body() body: { comment?: string }, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.approve(scopeOf(req), id, ctx(req), body.comment));
  }

  @Post(':id/reject')
  @RequireScopes('supplier:edit')
  async reject(@Param('id') id: string, @Body() body: { comment?: string }, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.reject(scopeOf(req), id, body.comment, ctx(req)));
  }

  @Post(':id/request-supplement')
  @RequireScopes('supplier:edit')
  async requestSupplement(@Param('id') id: string, @Body() body: { comment?: string }, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.requestSupplement(scopeOf(req), id, body.comment, ctx(req)));
  }

  @Post(':id/invitations')
  @RequireScopes('supplier:edit')
  async createInvitation(
    @Param('id') id: string,
    @Body() body: { email?: string; relationRole?: 'admin' | 'operator' },
    @Req() req: Request,
  ) {
    return ApiResponse.ok(await this.svc.createInvitation(scopeOf(req), id, body, ctx(req)));
  }

  @Get(':id/invitations')
  @RequireScopes('supplier:view')
  async listInvitations(@Req() req: Request, @Param('id') id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return ApiResponse.ok(await this.svc.listInvitations(scopeOf(req), id, Number(page), Number(limit)));
  }

  @Post(':id/invitations/:invitationId/revoke')
  @RequireScopes('supplier:edit')
  async revokeInvitation(@Param('id') id: string, @Param('invitationId') invitationId: string, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.revokeInvitation(id, invitationId, ctx(req)));
  }
  /** 按商务编号或税号精确查找全局供应商，用于跨机构授权 */
  @Get('lookup/global')
  @RequireScopes('supplier:create')
  async lookupGlobal(
    @Req() req: Request,
    @Query('businessId') businessId?: string,
    @Query('taxId') taxId?: string,
  ) {
    return ApiResponse.ok(await this.svc.lookupGlobalSupplier(scopeOf(req), { businessId, taxId }));
  }

  @Get(':id/branch-access')
  @RequireScopes('supplier:view')
  async branchAccess(@Param('id') id: string, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.listBranchAccess(scopeOf(req), id));
  }

  @Post(':id/branch-access')
  @RequireScopes('supplier:edit')
  async grantAccess(@Param('id') id: string, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.grantBranchAccess(scopeOf(req), id, ctx(req)));
  }

  @Delete(':id/branch-access')
  @RequireScopes('supplier:edit')
  async revokeAccess(@Param('id') id: string, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.revokeBranchAccess(scopeOf(req), id, ctx(req)));
  }

}
