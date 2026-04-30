/**
 * 文件：backend/src/shared/upload/upload.controller.ts
 * 功能：提供供应商认证资料附件上传和预览跳转接口。
 * 交互：前端认证资料页上传文件；公司审核页通过 preview 地址查看附件。
 * 作者：吴川
 */
import {
  Controller, Get, Param, Post, Redirect, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { ApiResponse } from '../dto/response.dto';
import { UploadService } from './upload.service';
import { User } from '../../modules/auth/user.entity';

@Controller('api/uploads')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('supplier-documents')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadSupplierDocument(@UploadedFile() file: any, @Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.uploadService.uploadSupplierDocument(file, user.id));
  }

  @Post('tender-attachments')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadTenderAttachment(@UploadedFile() file: any, @Req() req: Request) {
    const user = req.user as User;
    return ApiResponse.ok(await this.uploadService.uploadTenderAttachment(file, user.id));
  }

  @Get('preview/:objectKey')
  @Redirect()
  async preview(@Param('objectKey') objectKey: string) {
    const url = await this.uploadService.getSignedPreviewUrl(decodeURIComponent(objectKey));
    return { url };
  }
}
