/**
 * 文件：backend/src/modules/auth/company-user.controller.ts
 * 功能：提供公司内部账号管理接口，支持列表、新增内部账号、调整角色与启停状态。
 * 交互：调用 auth.service.ts；通过 JWT 与 RBAC 保护；供 WEB 端用户管理页面消费。
 * 作者：吴川
 */
import {
  Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsEmail, IsEnum, IsOptional, IsString, Length, MinLength,
} from 'class-validator';
import { Request } from 'express';
import { AuthenticatedUser } from './jwt.strategy';
import {
  BranchScope, emptyBranchScope, resolveAdminWriteBranch,
} from '../../shared/tenant/branch-scope';
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

  /**
   * 目标机构。仅总部需要传：总部不拥有数据空间，必须指明为哪个国家机构建号。
   * 机构用户传入无效 —— 服务端强制归属其所在机构。
   */
  @IsOptional()
  @IsString()
  branchId?: string;

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

/** 取当前请求的机构作用域。由 jwt.strategy.ts 校验成员资格后挂载，不接受客户端指定。 */
function scopeOf(req: Request): BranchScope {
  return (req.user as AuthenticatedUser).branch?.scope ?? emptyBranchScope();
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
  async list(@Req() req: Request) {
    return ApiResponse.ok(await this.svc.listCompanyUsers(scopeOf(req)));
  }

  @Post()
  @RequireScopes('user:create')
  async create(@Body() dto: CreateCompanyUserDto, @Req() req: Request) {
    // 机构用户：强制归属自己所在机构，忽略请求里的 branchId ——
    //   否则印尼的管理员可以凭一个 branchId 往越南机构里塞人。
    // 总部：不拥有自己的数据空间，必须显式指明要为哪个国家机构建号。
    const branch = (req.user as AuthenticatedUser).branch;
    const branchId = resolveAdminWriteBranch(
      branch?.scope ?? emptyBranchScope(),
      branch?.isHq ?? false,
      dto.branchId,
    );
    return ApiResponse.ok(await this.svc.createCompanyUser({ ...dto, branchId }, auditCtx(req)));
  }

  @Patch(':id')
  @RequireScopes('user:edit')
  async update(@Param('id') id: string, @Body() dto: UpdateCompanyUserDto, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.updateCompanyUser(id, dto, auditCtx(req)));
  }
}
