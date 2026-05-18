/**
 * 文件：backend/src/shared/upload/upload.controller.ts
 * 功能：提供供应商认证资料附件上传与预览代理接口；预览以流方式直接返回文件内容，避免暴露 MinIO 内网地址。
 * 交互：前端认证资料页/招标附件上传；公司审核页与供应商查看页通过 preview 地址内联展示。
 * 作者：吴川
 */
import {
  Controller, Get, Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
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

  /**
   * 流式代理 MinIO 中的对象，避免向公网暴露 MinIO 端点与预签名 URL。
   * objectKey 由前端 URL-encode 后传入，这里解码后传给 S3 SDK。
   */
  @Get('preview/:objectKey')
  async preview(@Param('objectKey') objectKey: string, @Res() res: Response) {
    await this.uploadService.streamObjectTo(decodeURIComponent(objectKey), res);
  }
}
