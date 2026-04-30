/**
 * 文件：backend/src/modules/auth/auth.module.ts
 * 功能：装配认证模块所需的控制器、服务、JWT 与 Passport 能力。
 * 交互：向 app.module.ts 暴露 AuthService、JwtModule 与 PassportModule；供其他模块复用认证上下文。
 * 作者：吴川
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { CompanyUserController } from './company-user.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { User } from './user.entity';
import { CompanyUser } from './company-user.entity';
import { SupplierAccount } from './supplier-account.entity';
import { Supplier } from '../supplier/supplier.entity';
import { AuditLog } from '../../shared/audit/audit-log.entity';
import { AuditService } from '../../shared/audit/audit.service';
import { RedisService } from '../../shared/config/redis.config';
import { MailModule } from '../../shared/mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, CompanyUser, SupplierAccount, Supplier, AuditLog]),
    MailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.getOrThrow('JWT_SECRET'),
        signOptions: { expiresIn: cfg.get('JWT_EXPIRES_IN', '8h') },
      }),
    }),
  ],
  controllers: [AuthController, CompanyUserController],
  providers: [AuthService, JwtStrategy, AuditService, RedisService],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
