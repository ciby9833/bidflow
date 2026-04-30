/**
 * 文件：backend/src/modules/hall/hall.controller.ts
 * 功能：暴露大厅公开接口，支持免登录查看公司信息与公开招标。
 * 交互：调用 hall.service.ts；供前端大厅首页和公开项目详情页使用。
 * 作者：吴川
 */
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiResponse } from '../../shared/dto/response.dto';
import { HallService } from './hall.service';

@Controller('api/hall')
export class HallController {
  constructor(private readonly svc: HallService) {}

  @Get('company-profile')
  async companyProfile() {
    return ApiResponse.ok(await this.svc.getCompanyProfile());
  }

  @Get('tenders')
  async list(@Query() q: { page?: string; limit?: string }) {
    const result = await this.svc.listPublicTenders(
      q.page ? parseInt(q.page, 10) : 1,
      q.limit ? parseInt(q.limit, 10) : 20,
    );
    return ApiResponse.ok(result.items, { total: result.total, page: result.page, limit: result.limit });
  }

  @Get('tenders/:id')
  async detail(@Param('id') id: string) {
    return ApiResponse.ok(await this.svc.getPublicTender(id));
  }
}
