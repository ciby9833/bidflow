/**
 * 文件：backend/src/shared/upload/upload.service.ts
 * 功能：封装供应商认证资料附件上传、文件类型校验与 MinIO/S3 文件读取（流式代理回前端）。
 * 交互：被 upload.controller.ts 调用；返回的 objectKey/fileUrl 写入 supplier_documents 与 tender.attachments。
 * 作者：吴川
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';
import { Response } from 'express';
import { randomUUID } from 'crypto';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

@Injectable()
export class UploadService {
  private readonly s3: AWS.S3;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>('OSS_BUCKET');
    this.s3 = new AWS.S3({
      endpoint: this.config.getOrThrow<string>('OSS_ENDPOINT'),
      accessKeyId: this.config.getOrThrow<string>('OSS_ACCESS_KEY'),
      secretAccessKey: this.config.getOrThrow<string>('OSS_SECRET_KEY'),
      region: this.config.get<string>('OSS_REGION') ?? 'us-east-1',
      s3ForcePathStyle: true,
      signatureVersion: 'v4',
    });
  }

  async uploadSupplierDocument(file: any, userId: string) {
    return this.uploadFile(file, `supplier-documents/${userId}`);
  }

  async uploadTenderAttachment(file: any, userId: string) {
    return this.uploadFile(file, `tender-attachments/${userId}`);
  }

  private async uploadFile(file: any, prefix: string) {
    if (!file) throw new BadRequestException('error.upload.file_required');
    if (!ALLOWED_MIME.has(file.mimetype)) throw new BadRequestException('error.upload.file_type_not_allowed');
    if (file.size > 20 * 1024 * 1024) throw new BadRequestException('error.upload.file_too_large');

    await this.ensureBucket();

    // multer 默认按 latin1 解析 originalname，UTF-8 中文/印尼语会乱码（如 "2026å¹´..." 实为 "2026年..."）。
    const originalName = this.normalizeOriginalName(file.originalname);

    const ext = this.extFromName(originalName);
    const objectKey = `${prefix}/${Date.now()}-${randomUUID()}${ext}`;
    await this.s3.putObject({
      Bucket: this.bucket,
      Key: objectKey,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        // 元数据头部仅支持 ASCII，安全地用 URI 编码
        originalName: encodeURIComponent(originalName),
      },
    }).promise();

    return {
      objectKey,
      fileName: originalName,
      fileSize: file.size,
      mimeType: file.mimetype,
      fileUrl: `/api/uploads/preview/${encodeURIComponent(objectKey)}`,
      previewUrl: `/api/uploads/preview/${encodeURIComponent(objectKey)}`,
    };
  }

  /**
   * 把 MinIO 上的对象内容流式回写给前端响应。
   * 这样浏览器只与公网域名通信，不需要直连 MinIO；也不依赖预签名 URL。
   */
  async streamObjectTo(objectKey: string, res: Response): Promise<void> {
    let head: AWS.S3.HeadObjectOutput;
    try {
      head = await this.s3.headObject({ Bucket: this.bucket, Key: objectKey }).promise();
    } catch {
      throw new NotFoundException('error.upload.file_not_found');
    }

    res.setHeader('Content-Type', head.ContentType ?? 'application/octet-stream');
    if (head.ContentLength !== undefined) {
      res.setHeader('Content-Length', String(head.ContentLength));
    }
    res.setHeader('Content-Disposition', 'inline');
    // 私有缓存 5 分钟，避免短期内反复回源
    res.setHeader('Cache-Control', 'private, max-age=300');

    const stream = this.s3.getObject({ Bucket: this.bucket, Key: objectKey }).createReadStream();
    stream.on('error', (err) => {
      if (!res.headersSent) res.status(500);
      res.end();
    });
    stream.pipe(res);
  }

  private async ensureBucket() {
    try {
      await this.s3.headBucket({ Bucket: this.bucket }).promise();
    } catch {
      await this.s3.createBucket({ Bucket: this.bucket }).promise();
    }
  }

  private extFromName(name?: string) {
    const match = name?.match(/\.[a-zA-Z0-9]+$/);
    return match ? match[0].toLowerCase() : '';
  }

  /** multer 用 latin1 读取 originalname，转回 UTF-8。 */
  private normalizeOriginalName(name?: string): string {
    if (!name) return 'document';
    try {
      return Buffer.from(name, 'latin1').toString('utf8');
    } catch {
      return name;
    }
  }
}
