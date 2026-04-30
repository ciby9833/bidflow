/**
 * 文件：backend/src/main.ts
 * 功能：NestJS 启动入口，负责全局校验、CORS 与 HTTP 服务监听。
 * 交互：启动 app.module.ts；为前端与外部调用暴露统一 API 入口。
 * 作者：吴川
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { I18nExceptionFilter } from './shared/i18n/i18n.exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: false,
  }));

  // 全局异常过滤器：把 service 抛的 message_key 翻译为当前 locale 文本，统一 ApiResponse 形状。
  app.useGlobalFilters(app.get(I18nExceptionFilter));

  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? '*',
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Locale', 'Accept-Language'],
  });

  const port = parseInt(process.env.PORT ?? '3000');
  await app.listen(port);
  console.log(`BidFlow backend running on :${port}`);
}

bootstrap();
