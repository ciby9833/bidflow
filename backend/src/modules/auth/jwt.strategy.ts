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

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('error.auth.token_invalid');
    }
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('error.auth.token_invalid');
    }
    return user;
  }
}
