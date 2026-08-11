/**
 * 文件：backend/src/modules/hall/hall.controller.ts
 * 功能：暴露大厅公开接口，支持免登录查看公司信息与公开招标。
 * 交互：调用 hall.service.ts；供前端大厅首页和公开项目详情页使用。
 * 作者：吴川
 */
import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiResponse } from '../../shared/dto/response.dto';
import { HallService } from './hall.service';
import { OptionalJwtGuard } from '../auth/optional-jwt.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * 取访客当前所在机构。未登录时为空 —— 此时只能看到范围为 global 的公开招标。
 * 大厅本身是全球的；登录后默认收窄到当前机构，用户可通过 branch 参数改看其他国家。
 */
function viewerBranch(req: Request): string | undefined {
  return (req.user as AuthenticatedUser | undefined)?.branch?.activeBranchId;
}

@Controller('api/hall')
@UseGuards(OptionalJwtGuard)
export class HallController {
  constructor(private readonly svc: HallService) {}

  @Get('company-profile')
  async companyProfile() {
    return ApiResponse.ok(await this.svc.getCompanyProfile());
  }

  @Get('portal-summary')
  async portalSummary() {
    return ApiResponse.ok(await this.svc.getPortalSummary());
  }

  /** 供应商注册可选的机构列表（公开） */
  @Get('registrable-branches')
  async registrableBranches() {
    return ApiResponse.ok(await this.svc.listRegistrableBranches());
  }

  /** 大厅的国家筛选选项 */
  @Get('branches')
  async branches(@Req() req: Request) {
    return ApiResponse.ok(await this.svc.listHallBranches(viewerBranch(req)));
  }

  @Get('tenders')
  async list(@Query() q: { page?: string; limit?: string; branch?: string }, @Req() req: Request) {
    const result = await this.svc.listPublicTenders(
      q.page ? parseInt(q.page, 10) : 1,
      q.limit ? parseInt(q.limit, 10) : 20,
      viewerBranch(req),
      q.branch,
    );
    return ApiResponse.ok(result.items, { total: result.total, page: result.page, limit: result.limit });
  }

  @Get('tenders/:id')
  async detail(@Param('id') id: string, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.getPublicTender(id, viewerBranch(req)));
  }
}
