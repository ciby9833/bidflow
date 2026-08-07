/**
 * 文件：backend/src/shared/rbac/rbac.guard.ts
 * 功能：根据角色-能力映射拦截接口访问，并读取控制器上的作用域元数据做鉴权。
 * 交互：被各 controller 通过 @UseGuards(RbacGuard) 使用；角色定义来自 auth/user.entity.ts；能力集需要与 auth.service.ts 保持一致。
 * 作者：吴川
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../modules/auth/user.entity';
import { scopesForRole } from './scope-map';

export const SCOPES_KEY = 'required_scopes';
export const RequireScopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = ctx.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('error.auth.unauthenticated');

    const granted = scopesForRole(user.role as UserRole);
    if (granted.includes('*')) return true;

    const allowed = required.every((s) => granted.includes(s));
    if (!allowed) throw new ForbiddenException('error.auth.forbidden');
    return true;
  }
}
