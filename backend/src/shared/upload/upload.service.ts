/**
 * 文件：backend/src/shared/upload/upload.service.ts
 * 功能：封装供应商认证资料附件上传、文件类型校验与 MinIO/S3 预览地址生成。
 * 交互：被 upload.controller.ts 调用；返回的 objectKey/fileUrl 写入 supplier_documents。
 * 作者：吴川
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';
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
  private readonly ttlSeconds: number;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>('OSS_BUCKET');
    this.ttlSeconds = Number(this.config.get('DOWNLOAD_URL_TTL_SECONDS') ?? 900);
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
    const ext = this.extFromName(file.originalname);
    const objectKey = `${prefix}/${Date.now()}-${randomUUID()}${ext}`;
    await this.s3.putObject({
      Bucket: this.bucket,
      Key: objectKey,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        originalName: encodeURIComponent(file.originalname ?? 'document'),
      },
    }).promise();

    return {
      objectKey,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      fileUrl: `/api/uploads/preview/${encodeURIComponent(objectKey)}`,
      previewUrl: `/api/uploads/preview/${encodeURIComponent(objectKey)}`,
    };
  }

  async getSignedPreviewUrl(objectKey: string) {
    try {
      await this.s3.headObject({ Bucket: this.bucket, Key: objectKey }).promise();
    } catch {
      throw new NotFoundException('error.upload.file_not_found');
    }
    return this.s3.getSignedUrlPromise('getObject', {
      Bucket: this.bucket,
      Key: objectKey,
      Expires: this.ttlSeconds,
      ResponseContentDisposition: 'inline',
    });
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
}
