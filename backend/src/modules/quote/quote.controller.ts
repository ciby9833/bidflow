/**
 * 文件：backend/src/modules/quote/quote.controller.ts
 * 功能：提供报价提交、个人排名、报价列表、排名重建与排名快照接口。
 * 交互：调用 quote.service.ts；依赖 rbac.guard.ts 做角色控制；供 QuoteBidView.vue 和评标/导出流程访问。
 * 作者：吴川
 */
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { QuoteService } from './quote.service';
import { SnapshotTrigger } from './ranking-snapshot.entity';
import { ApiResponse } from '../../shared/dto/response.dto';
import { RbacGuard, RequireScopes } from '../../shared/rbac/rbac.guard';
import { User } from '../auth/user.entity';

function ctx(req: Request) {
  const u = req.user as User;
  return { userId: u.id, userRole: u.role, ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] };
}

@Controller('api/quotes')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class QuoteController {
  constructor(private readonly svc: QuoteService) {}

  @Post()
  @RequireScopes('quote:submit')
  async submit(@Body() body: any, @Req() req: Request) {
    const user = req.user as User;
    const result = await this.svc.submit({
      lotId: body.lotId,
      supplierId: user.supplierId!,
      totalPrice: body.totalPrice,
      currency: body.currency,
      items: body.items,
      remark: body.remark,
      idempotencyKey: body.idempotencyKey,
    }, req.ip ?? '0.0.0.0', ctx(req));
    return ApiResponse.ok(result);
  }

  @Post('lines/:lineId')
  @RequireScopes('quote:submit')
  async submitLine(@Param('lineId') lineId: string, @Body() body: any, @Req() req: Request) {
    const user = req.user as User;
    const result = await this.svc.submitLineQuote({
      lineId,
      supplierId: user.supplierId!,
      totalPrice: body.totalPrice,
      currency: body.currency,
      items: body.items,
      remark: body.remark,
      idempotencyKey: body.idempotencyKey,
    }, req.ip ?? '0.0.0.0', ctx(req));
    return ApiResponse.ok(result);
  }

  @Get('lots/:lotId/my-rank')
  @RequireScopes('quote:view_own')
  async myRank(@Param('lotId') lotId: string, @Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.svc.getMyRankForSupplier(lotId, user.supplierId!));
  }

  @Get('lines/:lineId/my-rank')
  @RequireScopes('quote:view_own')
  async myLineRank(@Param('lineId') lineId: string, @Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.svc.getLineRankForSupplier(lineId, user.supplierId!));
  }

  @Get('lines/:lineId/mine')
  @RequireScopes('quote:view_own')
  async myLineQuote(@Param('lineId') lineId: string, @Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.svc.getMyLineQuoteState(lineId, user.supplierId!));
  }

  @Get('lines/:lineId/mine/history')
  @RequireScopes('quote:view_own')
  async myLineQuoteHistory(@Param('lineId') lineId: string, @Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.svc.getLineQuoteHistory(lineId, user.supplierId!));
  }

  @Get('lines/:lineId/ranking')
  @RequireScopes('quote:view_all')
  async lineRanking(@Param('lineId') lineId: string) {
    return ApiResponse.ok(await this.svc.getLineQuotes(lineId));
  }

  @Get('lines/:lineId/suppliers/:supplierId/history')
  @RequireScopes('quote:view_all')
  async lineSupplierHistory(@Param('lineId') lineId: string, @Param('supplierId') supplierId: string) {
    return ApiResponse.ok(await this.svc.getLineQuoteHistoryForReview(lineId, supplierId));
  }

  @Get('lots/:lotId/mine')
  @RequireScopes('quote:view_own')
  async myQuote(@Param('lotId') lotId: string, @Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.svc.getMyQuoteState(lotId, user.supplierId!));
  }

  @Get('lots/:lotId/mine/history')
  @RequireScopes('quote:view_own')
  async myQuoteHistory(@Param('lotId') lotId: string, @Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.svc.getQuoteHistory(lotId, user.supplierId!));
  }

  @Get('lots/:lotId/ranking')
  @RequireScopes('quote:view_all')
  async ranking(@Param('lotId') lotId: string) {
    return ApiResponse.ok(await this.svc.getQuotes(lotId));
  }

  @Post('lots/:lotId/rebuild-ranking')
  @RequireScopes('tender:close')
  async rebuild(@Param('lotId') lotId: string) {
    const count = await this.svc.rebuildRankingFromDb(lotId);
    return ApiResponse.ok({ rebuilt: count });
  }

  @Post('lots/:lotId/snapshot')
  @RequireScopes('eval:freeze')
  async snapshot(
    @Param('lotId') lotId: string,
    @Body() body: { trigger: SnapshotTrigger },
    @Req() req: Request,
  ) {
    const user = req.user as User;
    const snap = await this.svc.generateSnapshot(lotId, body.trigger, user.id);
    return ApiResponse.ok(snap);
  }
}
