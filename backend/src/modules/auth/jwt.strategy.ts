/**
 * 文件：backend/src/modules/auth/jwt.strategy.ts
 * 功能：校验 Bearer Token 并加载当前用户，是 API 鉴权链路的 JWT 适配层。
 * 交互：由 Passport JWT 守卫触发；读取 user.entity.ts；被各受保护 controller 依赖。
 * 作者：吴川
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from './user.entity';
import { JwtPayload } from './auth.service';
import { BranchContext, BranchContextService } from '../organization/branch-context.service';

/**
 * 请求上下文中的当前用户。
 * 在 User 实体基础上附加机构上下文 —— 改造前 validate() 只返回裸 User，
 * Token 里的机构信息在这里被整个丢弃，导致业务层拿不到任何机构归属。
 */
export type AuthenticatedUser = User & { branch: BranchContext };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly branchContext: BranchContextService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('error.auth.token_invalid');
    }
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('error.auth.token_invalid');
    }

    // 机构范围每次请求在服务端解析，不取 Token 内的快照：
    // 新增机构后总部立即可见，成员被移除后立即失效，无需等待 Token 过期。
    // Token 里的 activeBranchId 仅作为「期望激活哪个机构」的输入，解析时会校验其是否在成员范围内。
    // 供应商账号的机构归属来自供应商机构档案，公司用户来自 branch_members。
    const branch = await this.branchContext.resolve(user.id, payload.activeBranchId, user.supplierId);

    // Phase 3 双轨：branch 仅挂载不消费，鉴权仍走 users.role，线上行为不变。
    return Object.assign(user, { branch });
  }
}
