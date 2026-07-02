/**
 * 文件：backend/src/modules/auth/auth.controller.ts
 * 功能：提供登录、退出、OTP 校验、当前用户信息与能力集查询接口。
 * 交互：调用 auth.service.ts；由前端登录页和 auth store 消费；依赖 JWT 守卫保护 me / logout 接口。
 * 作者：吴川
 */
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsEmail, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { ApiResponse } from '../../shared/dto/response.dto';
import { User } from './user.entity';

class LoginDto {
  @IsString()
  login: string;

  @IsString()
  @MinLength(6)
  password: string;
}

class OtpDto {
  @IsString()
  userId: string;

  @IsString()
  @Length(4, 10)
  otp: string;
}

class SupplierRegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @Length(4, 10)
  emailCode: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

}

class SupplierRegisterEmailCodeDto {
  @IsEmail()
  email: string;
}

class PasswordResetRequestDto {
  @IsEmail()
  email: string;
}

class PasswordResetConfirmDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(6)
  password: string;
}

class GoogleSupplierRegisterDto {
  @IsString()
  credential: string;
}

function auditCtx(req: Request) {
  return {
    userId: (req.user as User)?.id ?? 'anonymous',
    userRole: (req.user as User)?.role ?? 'anonymous',
    ipAddress: req.ip ?? '0.0.0.0',
    userAgent: req.headers['user-agent'],
  };
}

@Controller('api/auth')
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const result = await this.svc.login(dto.login, dto.password, {
      userId: 'anonymous', userRole: 'anonymous',
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers['user-agent'],
    });
    return ApiResponse.ok(result);
  }

  @Post('supplier-register')
  async supplierRegister(@Body() dto: SupplierRegisterDto, @Req() req: Request) {
    const result = await this.svc.registerSupplier(dto, {
      userId: '00000000-0000-0000-0000-000000000000',
      userRole: 'public_signup',
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers['user-agent'],
    });
    return ApiResponse.ok(result);
  }

  @Post('supplier-register/email-code')
  async sendSupplierRegisterEmailCode(@Body() dto: SupplierRegisterEmailCodeDto) {
    return ApiResponse.ok(await this.svc.sendSupplierRegisterEmailCode(dto.email));
  }

  @Post('supplier-register/google')
  async supplierRegisterGoogle(@Body() dto: GoogleSupplierRegisterDto, @Req() req: Request) {
    const result = await this.svc.registerSupplierWithGoogle(dto.credential, {
      userId: '00000000-0000-0000-0000-000000000000',
      userRole: 'google_signup',
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers['user-agent'],
    });
    return ApiResponse.ok(result);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  async logout(@Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.svc.logout(user, auditCtx(req)));
  }

  @Post('otp/verify')
  async verifyOtp(@Body() dto: OtpDto, @Req() req: Request) {
    const result = await this.svc.verifyOtp(dto.userId, dto.otp, {
      userId: dto.userId, userRole: 'anonymous',
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers['user-agent'],
    });
    return ApiResponse.ok(result);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@Req() req: Request) {
    const user = req.user as User;
    const profile = await this.svc.buildProfile(user);
    return ApiResponse.ok({ user: profile.user, capabilities: profile.scopes, redirect: profile.redirect });
  }

  @Get('me/capabilities')
  @UseGuards(AuthGuard('jwt'))
  async capabilities(@Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok({ scopes: this.svc.getCapabilities(user), accountType: user.accountType });
  }

  @Post('password-reset/request')
  async passwordResetRequest(@Body() dto: PasswordResetRequestDto, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.requestPasswordReset(dto.email, {
      userId: '00000000-0000-0000-0000-000000000000',
      userRole: 'anonymous',
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers['user-agent'],
    }));
  }

  @Post('password-reset/confirm')
  async passwordResetConfirm(@Body() dto: PasswordResetConfirmDto, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.confirmPasswordReset(dto.token, dto.password, {
      userId: '00000000-0000-0000-0000-000000000000',
      userRole: 'anonymous',
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers['user-agent'],
    }));
  }
}
