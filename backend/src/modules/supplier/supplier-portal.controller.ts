/**
 * 文件：backend/src/modules/supplier/supplier-portal.controller.ts
 * 功能：提供供应商账号本人提交认证资料和查看审核进度的接口。
 * 交互：调用 supplier.service.ts；被供应商资料提交页和待审核页使用。
 * 作者：吴川
 */
import {
  Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ApiResponse } from '../../shared/dto/response.dto';
import { User } from '../auth/user.entity';
import { SupplierService } from './supplier.service';

function supplierCtx(req: Request) {
  const u = req.user as User;
  return { userId: u.id, userRole: u.role, ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] };
}

@Controller('api/supplier')
@UseGuards(AuthGuard('jwt'))
export class SupplierPortalController {
  constructor(private readonly svc: SupplierService) {}

  @Get('profile')
  async myProfile(@Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.svc.getSupplierPortalProfileForAccount(user.id));
  }

  @Post('profile/submit')
  async submitProfile(@Body() body: any, @Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.svc.submitProfileForAccount(user.id, body, supplierCtx(req)));
  }

  @Post('company/create')
  async createCompany(@Body() body: any, @Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.svc.createCompanyForAccount(user.id, body, supplierCtx(req)));
  }

  @Post('company/join')
  async joinCompany(@Body() body: { token: string }, @Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.svc.joinCompanyByInvitation(user.id, body.token, supplierCtx(req)));
  }

  @Get('company/invitation-preview')
  async previewInvitation(@Query('token') token: string) {
    return ApiResponse.ok(await this.svc.previewInvitation(token));
  }

  @Post('members/invitations')
  async createMemberInvitation(@Body() body: { email?: string; relationRole?: 'admin' | 'operator' }, @Req() req: Request) {
    const user = req.user as User;
    const supplierId = user.supplierId ?? await this.svc.findSupplierIdForAccount(user.id);
    if (!supplierId) return ApiResponse.ok({ needsSupplierBinding: true });
    await this.svc.ensureCanManageSupplierMembers(supplierId, user.id);
    return ApiResponse.ok(await this.svc.createInvitation(supplierId, body, supplierCtx(req)));
  }

  @Get('members/invitations')
  async listMemberInvitations(@Req() req: Request, @Query('page') page?: string, @Query('limit') limit?: string) {
    const user = req.user as User;
    const supplierId = user.supplierId ?? await this.svc.findSupplierIdForAccount(user.id);
    if (!supplierId) return ApiResponse.ok({ items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 10 });
    return ApiResponse.ok(await this.svc.listInvitations(supplierId, Number(page), Number(limit)));
  }

  @Get('members')
  async listMembers(@Req() req: Request, @Query('page') page?: string, @Query('limit') limit?: string) {
    const user = req.user as User;
    const supplierId = user.supplierId ?? await this.svc.findSupplierIdForAccount(user.id);
    if (!supplierId) return ApiResponse.ok({ items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 10 });
    return ApiResponse.ok(await this.svc.listMembers(supplierId, Number(page), Number(limit)));
  }

  @Patch('members/:id')
  async updateMember(
    @Param('id') id: string,
    @Body() body: { relationRole?: 'owner' | 'admin' | 'operator'; status?: 'active' | 'suspended'; isPrimary?: boolean; displayName?: string },
    @Req() req: Request,
  ) {
    const user = req.user as User;
    const supplierId = user.supplierId ?? await this.svc.findSupplierIdForAccount(user.id);
    if (!supplierId) return ApiResponse.ok({ needsSupplierBinding: true });
    await this.svc.ensureCanManageSupplierMembers(supplierId, user.id);
    return ApiResponse.ok(await this.svc.updateMember(supplierId, id, body, supplierCtx(req)));
  }

  @Post('members/:id/reset-password')
  async resetMemberPassword(@Param('id') id: string, @Body() body: { password: string }, @Req() req: Request) {
    const user = req.user as User;
    const supplierId = user.supplierId ?? await this.svc.findSupplierIdForAccount(user.id);
    if (!supplierId) return ApiResponse.ok({ needsSupplierBinding: true });
    await this.svc.ensureCanManageSupplierMembers(supplierId, user.id);
    return ApiResponse.ok(await this.svc.resetMemberPassword(supplierId, id, body.password, supplierCtx(req)));
  }

  @Get('review-logs')
  async listReviewLogs(@Req() req: Request, @Query('page') page?: string, @Query('limit') limit?: string) {
    const user = req.user as User;
    const supplierId = user.supplierId ?? await this.svc.findSupplierIdForAccount(user.id);
    if (!supplierId) return ApiResponse.ok({ items: [], total: 0, page: Number(page) || 1, limit: Number(limit) || 10 });
    return ApiResponse.ok(await this.svc.listReviewLogs(supplierId, Number(page), Number(limit)));
  }

  @Post('members/invitations/:id/revoke')
  async revokeMemberInvitation(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as User;
    const supplierId = user.supplierId ?? await this.svc.findSupplierIdForAccount(user.id);
    if (!supplierId) return ApiResponse.ok({ needsSupplierBinding: true });
    await this.svc.ensureCanManageSupplierMembers(supplierId, user.id);
    return ApiResponse.ok(await this.svc.revokeInvitation(supplierId, id, supplierCtx(req)));
  }
}
