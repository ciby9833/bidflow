import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../../shared/config/redis.config';
import { JwtStrategy } from '../auth/jwt.strategy';
import { AccountType } from '../auth/user.entity';
import { QuoteService } from '../quote/quote.service';
import Redis from 'ioredis';

@Injectable()
@WebSocketGateway({ cors: { origin: process.env.FRONTEND_ORIGIN ?? '*', credentials: true }, path: '/ws' })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly subscriber: Redis;
  private readonly clients = new Map<string, { socket: Socket; token: string; lots: Set<string>; timer: ReturnType<typeof setInterval> }>();
  constructor(private readonly jwt: JwtService, private readonly redis: RedisService,
    private readonly strategy: JwtStrategy, private readonly quotes: QuoteService) {
    this.subscriber = this.redis.raw.duplicate();
    this.subscriber.on('message', (channel) => {
      const lotId = channel.split(':')[1];
      for (const client of this.clients.values()) if (client.lots.has(lotId)) void this.snapshot(client.socket, lotId);
    });
  }
  private async principal(token: string) {
    const payload = this.jwt.verify(token);
    if (payload.purpose) throw new Error('restricted token');
    const user = await this.strategy.validate(payload);
    if (user.accountType !== AccountType.SUPPLIER_ACCOUNT || !user.supplierId
      || !payload.activeBranchId || user.branch.activeBranchId !== payload.activeBranchId) throw new Error('invalid branch');
    return user;
  }
  async handleConnection(socket: Socket) {
    const token = socket.handshake.auth?.token;
    try {
      if (typeof token !== 'string') throw new Error('missing token');
      const ready = this.principal(token);
      socket.data ??= {};
      socket.data.authReady = ready;
      await ready;
      if (socket.disconnected === true) return;
      const timer = setInterval(async () => {
        try { await this.principal(token); socket.emit('ping'); } catch { this.deny(socket); }
      }, 15000);
      this.clients.set(socket.id, { socket, token, lots: new Set(), timer });
    } catch { this.deny(socket); }
  }
  private deny(socket: Socket) {
    socket.emit('error', { code: 4403, message: 'FORBIDDEN' });
    socket.disconnect(true);
    this.handleDisconnect(socket);
  }
  private async snapshot(socket: Socket, lotId: string) {
    const client = this.clients.get(socket.id);
    if (!client) return false;
    try {
      const user = await this.principal(client.token);
      const state = await this.quotes.getMyRankForSupplier(user.branch.scope, lotId, user.supplierId!);
      // Never broadcast other suppliers' identities/prices. Honor the same ranking mode as HTTP.
      if (this.clients.has(socket.id)) socket.emit('rank_snapshot', { lotId, ...state });
      return true;
    } catch { this.deny(socket); return false; }
  }
  @SubscribeMessage('subscribe_lot')
  async subscribeLot(@ConnectedSocket() socket: Socket, @MessageBody() data: { lotId?: string }) {
    try { await socket.data?.authReady; } catch { return this.deny(socket); }
    const client = this.clients.get(socket.id);
    if (!client || !/^[0-9a-f-]{36}$/i.test(data?.lotId ?? '') || client.lots.size >= 20) return this.deny(socket);
    const lotId = data.lotId!;
    if (!await this.snapshot(socket, lotId) || !this.clients.has(socket.id)) return;
    client.lots.add(lotId);
    await this.subscriber.subscribe(`lot:${lotId}:channel`);
  }
  @SubscribeMessage('unsubscribe_lot')
  async unsubscribeLot(@ConnectedSocket() socket: Socket, @MessageBody() data: { lotId?: string }) {
    const client = this.clients.get(socket.id);
    if (!data?.lotId) return;
    client?.lots.delete(data.lotId);
    await this.release(data.lotId);
  }
  @SubscribeMessage('pong')
  handlePong() {}
  private async release(lotId: string) {
    if (![...this.clients.values()].some(c => c.lots.has(lotId))) await this.subscriber.unsubscribe(`lot:${lotId}:channel`);
  }
  handleDisconnect(socket: Socket) {
    const client = this.clients.get(socket.id);
    if (!client) return;
    clearInterval(client.timer);
    this.clients.delete(socket.id);
    for (const lotId of client.lots) void this.release(lotId);
  }
  onModuleDestroy() {
    for (const c of this.clients.values()) { clearInterval(c.timer); c.socket.disconnect(true); }
    this.clients.clear();
    this.subscriber.disconnect();
  }
}
