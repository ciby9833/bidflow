/**
 * 文件：backend/src/shared/export/export.controller.ts
 * 功能：提供报价导出接口，并根据角色限制完整版导出权限。
 * 交互：调用 export.service.ts 生成文件；被 TenderDetailView.vue 触发下载；依赖 rbac.guard.ts 与 auth 用户信息。
 * 作者：吴川
 */
import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { ExportService, ExportMode, ExportView } from './export.service';
import { RbacGuard, RequireScopes } from '../rbac/rbac.guard';
import { User } from '../../modules/auth/user.entity';
import { AuthenticatedUser } from '../../modules/auth/jwt.strategy';
import { BranchScope, emptyBranchScope } from '../tenant/branch-scope';

/** 取当前请求的机构作用域。由 jwt.strategy.ts 校验成员资格后挂载，不接受客户端指定。 */
function scopeOf(req: Request): BranchScope {
  return (req.user as AuthenticatedUser).branch?.scope ?? emptyBranchScope();
}

@Controller('api/export')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ExportController {
  constructor(private readonly svc: ExportService) {}

  @Get('tenders/:id/quotes')
  @RequireScopes('export:masked')
  async exportQuotes(
    @Param('id') tenderId: string,
    @Query('mode') mode: ExportMode,
    @Query('view') view: ExportView,
    @Query('round') round: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('fields') fields?: string,
  ) {
    const user = req.user as User;
    const exportMode = mode ?? 'masked';
    const exportView = view ?? 'item';
    const exportRound = round ?? 'all';
    if (exportMode === 'full' && !user.role.includes('manager') && user.role !== 'super_admin') {
      return res.status(403).json({ success: false, data: null, error: { code: 'FORBIDDEN', message_key: 'error.export.full_requires_manager' } });
    }

    const ctx = { userId: user.id, userRole: user.role, ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] };
    const buffer = await this.svc.exportTenderQuotes(scopeOf(req), tenderId, exportMode, ctx, {
      view: exportView,
      round: exportRound,
      fields: fields?.split(',').map((item) => item.trim()).filter(Boolean),
    });

    const filename = `bidflow-export-${tenderId}-${exportMode}-${exportView}-${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
