/**
 * 文件：backend/src/shared/config/redis.config.ts
 * 功能：封装 Redis 连接、Sorted Set、Hash、分布式锁与 Pub/Sub 常用操作。
 * 交互：被 quote.service.ts 和 ws.gateway.ts 调用；承载实时排名、频控与消息广播。
 * 作者：吴川
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private readonly client: Redis;

  constructor(private config: ConfigService) {
    this.client = new Redis(this.config.get<string>('REDIS_URL')!, {
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
    });

    this.client.on('error', (err) => {
      console.error('[Redis] connection error:', err.message);
    });
  }

  get raw(): Redis { return this.client; }

  // ── Sorted Set ──────────────────────────────────────────────────────────
  async zadd(key: string, score: number, member: string) {
    return this.client.zadd(key, score, member);
  }

  async zrank(key: string, member: string): Promise<number | null> {
    return this.client.zrank(key, member);
  }

  async zcard(key: string): Promise<number> {
    return this.client.zcard(key);
  }

  async zrange(key: string, start: number, stop: number, withScores = false) {
    if (withScores) return this.client.zrange(key, start, stop, 'WITHSCORES');
    return this.client.zrange(key, start, stop);
  }

  async zscore(key: string, member: string): Promise<string | null> {
    return this.client.zscore(key, member);
  }

  // ── Hash ────────────────────────────────────────────────────────────────
  async hset(key: string, field: string, value: string) {
    return this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  // ── String / TTL ────────────────────────────────────────────────────────
  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds) return this.client.set(key, value, 'EX', ttlSeconds);
    return this.client.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  async del(key: string) {
    return this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number) {
    return this.client.expire(key, ttlSeconds);
  }

  // ── Atomic set-if-not-exists (distributed lock) ─────────────────────────
  async setnx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  // ── Pub/Sub ─────────────────────────────────────────────────────────────
  async publish(channel: string, message: string) {
    return this.client.publish(channel, message);
  }

  // ── Consistency check support ────────────────────────────────────────────
  async rebuildLotRanking(lotId: string, entries: { supplierId: string; price: number }[]) {
    const rankKey = `lot:${lotId}:rank`;
    const pipeline = this.client.pipeline();
    pipeline.del(rankKey);
    for (const e of entries) {
      pipeline.zadd(rankKey, e.price, e.supplierId);
    }
    await pipeline.exec();
  }
}
