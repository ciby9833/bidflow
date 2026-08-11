/**
 * 文件：backend/src/modules/organization/hq-only.guard.ts
 * 功能：限制组织管理接口只能由「当前以总部身份操作」的用户访问。
 * 交互：由 organization.controller.ts 使用；判定依据来自 jwt.strategy.ts 挂载的机构上下文。
 * 作者：吴川
 *
 * 为什么不复用 RbacGuard：
 * RbacGuard 读的是 users.role 这个全局列，印尼的 super_admin 同样会被放行，
 * 结果是任一国家机构的管理员都能创建/停用别的国家机构。
 * 组织管理的边界是「当前激活机构是否为总部」，与全局角色无关，因此单独成一道守卫。
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/jwt.strategy';

@Injectable()
export class HqOnlyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user as AuthenticatedUser | undefined;
    if (!user) throw new ForbiddenException('error.auth.unauthenticated');

    // 以「当前激活机构的类型」判定，而非「是否拥有总部成员资格」：
    // 同一人可能既是总部管理员又是某国机构成员，切换到国家机构后不应再持有组织管理权。
    if (!user.branch?.isHq) throw new ForbiddenException('error.branch.hq_only');
    return true;
  }
}
