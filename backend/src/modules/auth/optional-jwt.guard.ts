/**
 * 文件：backend/src/modules/auth/optional-jwt.guard.ts
 * 功能：可选鉴权守卫。带有效 Token 时解析出用户与机构上下文，否则以匿名访客放行。
 * 交互：供公开大厅等「登录与否都可访问、但登录后展示不同」的接口使用。
 * 作者：吴川
 *
 * 与 AuthGuard('jwt') 的区别：Token 缺失或无效时不抛 401，而是让 request.user 保持 undefined。
 * 大厅是公开页面，一枚过期 Token 不应该把访客挡在门外 —— 那会让用户以为站点坏了。
 * 调用方据此决定展示范围：无用户上下文即按未登录访客处理（只看得到全球公开内容）。
 */
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // 无 Token / Token 无效 / 已失效：按匿名访客继续
    }
    return true;
  }

  /** 覆盖默认行为：passport 校验失败时返回 undefined 而非抛异常 */
  handleRequest<TUser>(_err: unknown, user: TUser): TUser {
    return (user || undefined) as TUser;
  }
}
