/**
 * 文件：backend/src/modules/notification/ws.gateway.ts
 * 功能：处理报价排名的 WebSocket 连接、订阅、心跳保活与 Redis Pub/Sub 转发。
 * 交互：依赖 redis.config.ts 订阅 lot 排名频道；与 frontend/src/composables/useWs.ts 配套；使用 JWT 校验 socket 身份。
 * 作者：吴川
 */
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect,
  SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/config/redis.config';
import Redis from 'ioredis';

const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 5_000;

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_ORIGIN ?? '*',
    credentials: true,
  },
  path: '/ws',
})
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(WsGateway.name);
  private readonly subscriber: Redis;
  private readonly pingTimers = new Map<string, NodeJS.Timeout>();
  private readonly pongTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {
    // Dedicated subscriber connection (not the shared client)
    this.subscriber = this.redis.raw.duplicate();
    this.subscriber.on('message', (channel, message) => this.onPubSubMessage(channel, message));
  }

  // ── Connection lifecycle ─────────────────────────────────────────────────
  async handleConnection(socket: Socket) {
    const token = socket.handshake.query['token'] as string;

    if (!token) {
      socket.disconnect();
      return;
    }

    try {
      const payload = this.jwt.verify(token);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      socket.data.supplierId = payload.supplierId;
      this.startPing(socket);
    } catch {
      socket.disconnect();
      socket.emit('error', { code: 4401, message: 'UNAUTHORIZED' });
    }
  }

  handleDisconnect(socket: Socket) {
    this.clearTimers(socket.id);
  }

  // ── Client subscribes to a lot's ranking channel ─────────────────────────
  @SubscribeMessage('subscribe_lot')
  async subscribeLot(@ConnectedSocket() socket: Socket, @MessageBody() data: { lotId: string }) {
    await socket.join(`lot:${data.lotId}`);
    await this.subscriber.subscribe(`lot:${data.lotId}:channel`);

    // Send immediate snapshot
    const rank = await this.redis.zrank(`lot:${data.lotId}:rank`, socket.data.supplierId);
    const total = await this.redis.zcard(`lot:${data.lotId}:rank`);
    socket.emit('rank_snapshot', { lotId: data.lotId, myRank: rank !== null ? rank + 1 : null, total });
  }

  @SubscribeMessage('unsubscribe_lot')
  async unsubscribeLot(@ConnectedSocket() socket: Socket, @MessageBody() data: { lotId: string }) {
    await socket.leave(`lot:${data.lotId}`);
  }

  @SubscribeMessage('pong')
  handlePong(@ConnectedSocket() socket: Socket) {
    const t = this.pongTimers.get(socket.id);
    if (t) clearTimeout(t);
  }

  // ── Pub/Sub → WS broadcast ───────────────────────────────────────────────
  private onPubSubMessage(channel: string, message: string) {
    // channel = "lot:{lotId}:channel"
    const lotId = channel.split(':')[1];
    const event = JSON.parse(message);

    // Broadcast to all subscribers of this lot room
    this.server.to(`lot:${lotId}`).emit('rank_update', event);
  }

  // ── Ping/pong keepalive ──────────────────────────────────────────────────
  private startPing(socket: Socket) {
    const timer = setInterval(() => {
      socket.emit('ping');
      const pongTimeout = setTimeout(() => {
        socket.disconnect();
        this.clearTimers(socket.id);
      }, PONG_TIMEOUT_MS);
      this.pongTimers.set(socket.id, pongTimeout);
    }, PING_INTERVAL_MS);

    this.pingTimers.set(socket.id, timer);
  }

  private clearTimers(socketId: string) {
    const ping = this.pingTimers.get(socketId);
    const pong = this.pongTimers.get(socketId);
    if (ping) clearInterval(ping);
    if (pong) clearTimeout(pong);
    this.pingTimers.delete(socketId);
    this.pongTimers.delete(socketId);
  }
}
