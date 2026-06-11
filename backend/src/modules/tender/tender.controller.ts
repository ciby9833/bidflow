/**
 * 文件：backend/src/modules/tender/tender.controller.ts
 * 功能：暴露招标列表、详情、模板、状态流转、邀请与标包详情接口。
 * 交互：调用 tender.service.ts；依赖 rbac.guard.ts 做权限控制；为前端 Tender* 视图和 QuoteBidView.vue 提供数据入口。
 * 作者：吴川
 */
import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { TenderService } from './tender.service';
import { TenderStatus, TenderType } from './tender.entity';
import { ApiResponse } from '../../shared/dto/response.dto';
import { RbacGuard, RequireScopes } from '../../shared/rbac/rbac.guard';
import { User } from '../auth/user.entity';

function ctx(req: Request) {
  const u = req.user as User;
  return { userId: u.id, userRole: u.role, ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] };
}

@Controller('api/tenders')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class TenderController {
  constructor(private readonly svc: TenderService) {}

  @Post()
  @RequireScopes('tender:create')
  async create(@Body() body: any, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.create(body, ctx(req)));
  }

  @Get()
  @RequireScopes('tender:view')
  async list(@Query() q: {
    status?: TenderStatus;
    type?: TenderType;
    baseCurrency?: string;
    search?: string;
    isHallVisible?: string;
    page?: string;
    limit?: string;
  }, @Req() req: Request) {
    const user = req.user as User;
    const result = await this.svc.findAll({
      status: q.status,
      type: q.type,
      baseCurrency: q.baseCurrency,
      search: q.search,
      isHallVisible: q.isHallVisible === undefined ? undefined : q.isHallVisible === 'true',
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 20,
    }, { role: user.role, supplierId: user.supplierId });
    return ApiResponse.ok(result.items, { total: result.total, page: result.page });
  }

  @Get('templates/:type')
  async getTemplate(@Param('type') type: TenderType) {
    return ApiResponse.ok(this.svc.getTemplate(type));
  }

  @Post('lots/import-preview')
  @RequireScopes('tender:create')
  @UseInterceptors(FileInterceptor('file'))
  async previewLotImport(@UploadedFile() file: any) {
    if (!file?.buffer) throw new BadRequestException('error.tender.import_file_required');
    return ApiResponse.ok(this.svc.previewLotImport(file.buffer));
  }

  @Get(':id/participant-options')
  @RequireScopes('tender:edit')
  async participantOptions(
    @Param('id') id: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('previousOnly') previousOnly?: string,
    @Query('candidateMode') candidateMode?: string,
  ) {
    return ApiResponse.ok(await this.svc.getParticipantOptions(id, search ?? '', Number(page) || 1, Number(limit) || 10, sort ?? 'name', previousOnly === 'true', candidateMode ?? 'all'));
  }

  @Get(':id/participants')
  @RequireScopes('tender:view')
  async participants(@Param('id') id: string) {
    return ApiResponse.ok(await this.svc.getParticipants(id));
  }

  @Get(':id/quote-review')
  @RequireScopes('quote:view_all')
  async quoteReview(@Param('id') id: string) {
    return ApiResponse.ok(await this.svc.getQuoteReview(id));
  }

  @Get('lots/:lotId')
  async getLot(@Param('lotId') lotId: string, @Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.svc.findLotById(lotId, { role: user.role, supplierId: user.supplierId }));
  }

  @Get(':id')
  @RequireScopes('tender:view')
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.svc.findById(id, { role: user.role, supplierId: user.supplierId }));
  }

  @Patch(':id')
  @RequireScopes('tender:edit')
  async update(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.updateDraft(id, body, ctx(req)));
  }

  @Delete(':id')
  @RequireScopes('tender:edit')
  async remove(@Param('id') id: string, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.remove(id, ctx(req)));
  }

  @Post(':id/publish')
  @RequireScopes('tender:publish')
  async publish(@Param('id') id: string, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.publish(id, ctx(req)));
  }

  @Post(':id/rounds/next')
  @RequireScopes('tender:edit')
  async nextRound(@Param('id') id: string, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.advanceQuoteRound(id, ctx(req)));
  }

  @Post(':id/withdraw')
  @RequireScopes('tender:publish')
  async withdraw(@Param('id') id: string, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.withdraw(id, ctx(req)));
  }

  @Post(':id/open')
  @RequireScopes('tender:publish')
  async open(@Param('id') id: string, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.open(id, ctx(req)));
  }

  @Post(':id/close')
  @RequireScopes('tender:close')
  async close(@Param('id') id: string, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.close(id, ctx(req)));
  }

  @Post(':id/invitations')
  @RequireScopes('tender:edit')
  async invite(
    @Param('id') id: string,
    @Body() body: { supplierIds: string[]; visibleAt?: string },
    @Req() req: Request,
  ) {
    return ApiResponse.ok(await this.svc.invite(id, body.supplierIds, body.visibleAt, ctx(req)));
  }
}

@Controller('api/supplier/tenders')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class SupplierTenderController {
  constructor(private readonly svc: TenderService) {}

  @Get()
  @RequireScopes('tender:view')
  async list(@Query() q: {
    status?: TenderStatus;
    type?: TenderType;
    baseCurrency?: string;
    search?: string;
    participationScope?: 'invited' | 'public';
    page?: string;
    limit?: string;
  }, @Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(...await this.buildResponse(q, user));
  }

  private async buildResponse(q: {
    status?: TenderStatus;
    type?: TenderType;
    baseCurrency?: string;
    search?: string;
    participationScope?: 'invited' | 'public';
    page?: string;
    limit?: string;
  }, user: User): Promise<[any[], { total: number; page: number }]> {
    const result = await this.svc.findSupplierVisible({
      status: q.status,
      type: q.type,
      baseCurrency: q.baseCurrency,
      search: q.search,
      participationScope: q.participationScope,
      page: q.page ? parseInt(q.page) : 1,
      limit: q.limit ? parseInt(q.limit) : 20,
    }, user.supplierId!);
    return [result.items, { total: result.total, page: result.page }];
  }
}
