/**
 * 文件：backend/src/modules/organization/organization.controller.ts
 * 功能：暴露总部的机构与成员管理接口。
 * 交互：调用 organization.service.ts；由 HqOnlyGuard 限定仅总部身份可访问。
 * 作者：吴川
 */
import {
  Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsEnum, IsISO31661Alpha2, IsObject, IsOptional, IsString, Length,
} from 'class-validator';
import { Request } from 'express';
import { OrganizationService } from './organization.service';
import { HqOnlyGuard } from './hq-only.guard';
import { BranchStatus, BranchSettings } from './branch.entity';
import { BranchMemberRole, BranchMemberStatus } from './branch-member.entity';
import { ApiResponse } from '../../shared/dto/response.dto';
import { User } from '../auth/user.entity';

class CreateBranchDto {
  @IsString()
  @Length(2, 20)
  code: string;

  @IsString()
  @Length(1, 200)
  name: string;

  @IsISO31661Alpha2()
  countryCode: string;

  @IsOptional()
  @IsObject()
  settings?: BranchSettings;
}

class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsObject()
  settings?: BranchSettings;

  @IsOptional()
  @IsEnum(BranchStatus)
  status?: BranchStatus;
}

class AddMemberDto {
  @IsString()
  userId: string;

  @IsEnum(BranchMemberRole)
  role: BranchMemberRole;

  @IsOptional()
  @IsString()
  department?: string;
}

class UpdateMemberDto {
  @IsOptional()
  @IsEnum(BranchMemberRole)
  role?: BranchMemberRole;

  @IsOptional()
  @IsEnum(BranchMemberStatus)
  status?: BranchMemberStatus;

  @IsOptional()
  @IsString()
  department?: string;
}

function ctx(req: Request) {
  const u = req.user as User;
  return { userId: u.id, userRole: u.role, ipAddress: req.ip ?? '0.0.0.0', userAgent: req.headers['user-agent'] };
}

@Controller('api/organization')
@UseGuards(AuthGuard('jwt'), HqOnlyGuard)
export class OrganizationController {
  constructor(private readonly svc: OrganizationService) {}

  @Get('branches')
  async listBranches() {
    return ApiResponse.ok(await this.svc.listBranches());
  }

  @Post('branches')
  async createBranch(@Body() dto: CreateBranchDto, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.createBranch(dto, ctx(req)));
  }

  @Patch('branches/:id')
  async updateBranch(@Param('id') id: string, @Body() dto: UpdateBranchDto, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.updateBranch(id, dto, ctx(req)));
  }

  @Get('branches/:id/members')
  async listMembers(@Param('id') id: string) {
    return ApiResponse.ok(await this.svc.listMembers(id));
  }

  @Post('branches/:id/members')
  async addMember(@Param('id') id: string, @Body() dto: AddMemberDto, @Req() req: Request) {
    return ApiResponse.ok(await this.svc.addMember(id, dto, ctx(req)));
  }

  @Patch('branches/:id/members/:memberId')
  async updateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberDto,
    @Req() req: Request,
  ) {
    return ApiResponse.ok(await this.svc.updateMember(id, memberId, dto, ctx(req)));
  }

  @Delete('branches/:id/members/:memberId')
  async removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Req() req: Request,
  ) {
    return ApiResponse.ok(await this.svc.removeMember(id, memberId, ctx(req)));
  }
}
