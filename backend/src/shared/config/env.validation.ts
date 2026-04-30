import { plainToInstance } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsNotEmpty() @IsString() DB_URL: string;
  @IsNotEmpty() @IsString() REDIS_URL: string;
  @IsNotEmpty() @IsString() JWT_SECRET: string;
  @IsNotEmpty() @IsString() JWT_EXPIRES_IN: string;
  @IsNotEmpty() @IsString() OSS_ENDPOINT: string;
  @IsNotEmpty() @IsString() OSS_BUCKET: string;
  @IsNotEmpty() @IsString() OSS_ACCESS_KEY: string;
  @IsNotEmpty() @IsString() OSS_SECRET_KEY: string;
  @IsOptional() @IsString() OSS_REGION: string = 'us-east-1';
  @IsOptional() @IsString() SMTP_HOST: string;
  @IsOptional() @IsNumber() SMTP_PORT: number = 587;
  @IsOptional() @IsString() SMTP_USER: string;
  @IsOptional() @IsString() SMTP_PASS: string;
  @IsOptional() @IsString() SMTP_FROM: string;
  @IsOptional() @IsBoolean() SMTP_SECURE: boolean = false;
  @IsOptional() @IsString() GOOGLE_CLIENT_ID: string;
  @IsEnum(NodeEnv) @IsOptional() NODE_ENV: NodeEnv = NodeEnv.Development;
  @IsNumber() @IsOptional() PORT: number = 3000;
  @IsNumber() @IsOptional() OTP_EXPIRES_SECONDS: number = 300;
  @IsNumber() @IsOptional() OTP_LENGTH: number = 6;
  @IsNumber() @IsOptional() OTP_RESEND_COOLDOWN_SECONDS: number = 60;
}

/**
 * 文件：backend/src/shared/config/env.validation.ts
 * 功能：校验后端运行所需的环境变量，确保启动前发现配置缺失。
 * 交互：被 app.module.ts 的 ConfigModule.forRoot(validate) 调用；为 redis/typeorm/jwt 等配置提供兜底校验。
 * 作者：吴川
 */
export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) throw new Error(errors.toString());
  return validated;
}
