/**
 * 文件：backend/src/app.module.ts
 * 功能：后端根模块，汇总配置、数据库连接、业务模块与共享导出能力。
 * 交互：装配 auth/supplier/tender/quote/notification 模块；注册 RedisService、AuditService、ExportService；被 main.ts 启动。
 * 作者：吴川
 */
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validate } from './shared/config/env.validation';
import mailConfig from './shared/config/mail.config';
import { I18nModule } from './shared/i18n/i18n.module';
import { LocaleMiddleware } from './shared/i18n/locale.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { SupplierModule } from './modules/supplier/supplier.module';
import { TenderModule } from './modules/tender/tender.module';
import { QuoteModule } from './modules/quote/quote.module';
import { BidRecordModule } from './modules/bid-record/bid-record.module';
import { NotificationModule } from './modules/notification/notification.module';
import { HallModule } from './modules/hall/hall.module';
import { RedisService } from './shared/config/redis.config';
import { AuditService } from './shared/audit/audit.service';
import { ExportService } from './shared/export/export.service';
import { ExportController } from './shared/export/export.controller';
import { UploadController } from './shared/upload/upload.controller';
import { UploadService } from './shared/upload/upload.service';
import { AuditLog } from './shared/audit/audit-log.entity';
import { User } from './modules/auth/user.entity';
import { CompanyUser } from './modules/auth/company-user.entity';
import { SupplierAccount } from './modules/auth/supplier-account.entity';
import { Supplier } from './modules/supplier/supplier.entity';
import { SupplierDocument } from './modules/supplier/supplier-document.entity';
import { SupplierReviewLog } from './modules/supplier/supplier-review-log.entity';
import { SupplierInvitation } from './modules/supplier/supplier-invitation.entity';
import { Tender } from './modules/tender/tender.entity';
import { TenderNotificationLog } from './modules/tender/tender-notification-log.entity';
import { Lot } from './modules/tender/lot.entity';
import { LotLine } from './modules/tender/lot-line.entity';
import { Invitation } from './modules/tender/invitation.entity';
import { Quote } from './modules/quote/quote.entity';
import { LineQuote } from './modules/quote/line-quote.entity';
import { LotQuoteAttachment } from './modules/quote/lot-quote-attachment.entity';
import { RankingSnapshot } from './modules/quote/ranking-snapshot.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: ['.env'],
      load: [mailConfig],
    }),
    I18nModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        url: cfg.getOrThrow('DB_URL'),
        entities: [User, CompanyUser, SupplierAccount, Supplier, SupplierDocument, SupplierReviewLog, SupplierInvitation, Tender, TenderNotificationLog, Lot, LotLine, Invitation, Quote, LineQuote, LotQuoteAttachment, RankingSnapshot, AuditLog],
        migrations: ['dist/migrations/*{.ts,.js}'],
        synchronize: cfg.get('NODE_ENV') === 'development',
        logging: cfg.get('NODE_ENV') === 'development',
      }),
    }),
    TypeOrmModule.forFeature([Quote, LineQuote, Tender, Lot, LotLine, Supplier, SupplierDocument, SupplierReviewLog, SupplierInvitation, AuditLog, CompanyUser, SupplierAccount]),
    AuthModule,
    SupplierModule,
    TenderModule,
    QuoteModule,
    BidRecordModule,
    NotificationModule,
    HallModule,
  ],
  controllers: [ExportController, UploadController],
  providers: [RedisService, AuditService, ExportService, UploadService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // 全路径注册：在所有请求进入业务层前，把 X-Locale / Accept-Language 写入 LocaleContext。
    consumer.apply(LocaleMiddleware).forRoutes('*');
  }
}
