/**
 * 文件：backend/src/shared/config/typeorm.config.ts
 * 功能：提供 TypeORM CLI 使用的数据库配置入口。
 * 交互：被 backend/package.json 中的 migration 命令引用；复用环境变量连接数据库。
 * 作者：吴川
 */
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join, resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

export default new DataSource({
  type: 'postgres',
  url: process.env.DB_URL,
  entities: [join(__dirname, '../../**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, '../../migrations/*{.ts,.js}')],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
