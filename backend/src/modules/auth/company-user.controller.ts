/**
 * 文件：backend/src/modules/auth/company-user.controller.ts
 * 功能：提供公司内部账号管理接口，支持列表、新增内部账号、调整角色与启停状态。
 * 交互：调用 auth.service.ts；通过 JWT 与 RBAC 保护；供 WEB 端用户管理页面消费。
 * 作者：吴川
 */
import {
  Body, Controller, Get, Param, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsEmail, IsEnum, IsOptional, IsString, Length, MinLength,
} from 'class-validator';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { User, UserRole, UserStatus } from './user.entity';
import { ApiResponse } from '../../shared/dto/response.dto';
import { RbacGuard, RequireScopes } from '../../shared/rbac/rbac.guard';

const COMPANY_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.PURCHASE_MANAGER,
  UserRole.PURCHASE_STAFF,
  UserRole.EVALUATOR,
] as const;

class CreateCompanyUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(COMPANY_ROLES)
  role: Exclude<UserRole, UserRole.SUPPLIER>;

  @IsString()
  @Length(1, 100)
  fullName: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  companyName?: string;
}

class UpdateCompanyUserDto {
  @IsOptional()
  @IsEnum(COMPANY_ROLES)
  role?: Exclude<UserRole, UserRole.SUPPLIER>;

  @IsOptional()
  @IsEnum([UserStatus.ACTIVE, UserStatus.SUSPENDED])
  status?: UserStatus;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  fullName?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  companyName?: string;
}

function auditCtx(req: Request) {
  const user = req.user as User;
  return {
    userId: user.id,
    userRole: user.role,
    ipAddress: req.ip ?? '0.0.0.0',
    userAgent: req.headers['user-agent'],
  };
}

@Controller('api/company-users')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class CompanyUserController {
  constructor(private readonly svc: AuthService) {}

  @Get()
  @RequireScopes('user:view')
  async list() {
    return ApiResponse.ok(await this.svc.listCompanyUsers());
  }

  @Post()
  @RequireScopes('user:create')
  async create(@Body() dto: CreateCompanyUserDto, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.createCompanyUser(dto, auditCtx(req)));
  }

  @Patch(':id')
  @RequireScopes('user:edit')
  async update(@Param('id') id: string, @Body() dto: UpdateCompanyUserDto, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.updateCompanyUser(id, dto, auditCtx(req)));
  }
}
