/**
 * 文件：backend/src/modules/notification/notification.module.ts
 * 功能：装配实时通知模块，向系统注册 WebSocket 网关。
 * 交互：提供 ws.gateway.ts；依赖 redis.config.ts 订阅排名变更消息；被 app.module.ts 引入。
 * 作者：吴川
 */
import { Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { AuthModule } from '../auth/auth.module';
import { RedisService } from '../../shared/config/redis.config';

@Module({
  imports: [AuthModule],
  providers: [WsGateway, RedisService],
  exports: [WsGateway],
})
export class NotificationModule {}
