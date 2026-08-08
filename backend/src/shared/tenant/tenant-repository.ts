/**
 * 文件：backend/src/shared/tenant/tenant-repository.ts
 * 功能：租户表的受限仓储。所有读写都必须显式传入机构作用域，从结构上杜绝"忘记加机构条件"。
 * 交互：包装 TypeORM Repository；由 tenant-repository.providers.ts 注入业务服务；作用域来自 branch-scope.ts。
 * 作者：吴川
 *
 * 为什么不用装饰器或运行时代理：
 * 那类方案把机构条件隐式注入，出问题时无法从调用处看出发生了什么，也无法被 code review 发现。
 * 这里选择让作用域成为必填首参 —— 漏传是**编译错误**，而不是运行期静默泄漏。
 *
 * 与数据库行级安全（RLS）的取舍：
 * RLS 能防御应用层之外的访问（手工 SQL、运维脚本），但需要每请求开事务、独立数据库角色与 CLS 依赖。
 * 本项目为单体应用、单一团队、两层组织，该收益不足以抵消长期的运维与调试成本。
 * 若将来出现多服务共用同一数据库的场景，可在此基础上增量补 RLS —— branch_id 列已就位。
 */
import { Inject, Injectable, Type } from '@nestjs/common';
import {
  DataSource, DeepPartial, FindManyOptions, FindOneOptions, FindOptionsWhere,
  In, ObjectLiteral, Repository, SelectQueryBuilder,
} from 'typeorm';
import { BranchScope, canRead, requireWritableBranch } from './branch-scope';

/** 租户实体必须携带机构归属列 */
export interface TenantEntity extends ObjectLiteral {
  branchId: string;
}

/**
 * 受限仓储。刻意不暴露任何无作用域的查询方法 —— 服务层无法绕过机构过滤。
 * 需要跨机构的系统级操作（如定时任务）请显式使用 DataSource，并在代码中说明理由。
 */
export class TenantRepository<T extends TenantEntity> {
  constructor(private readonly repo: Repository<T>) {}

  /** 实体元数据，供少量需要表名/列名的场景使用 */
  get metadata() {
    return this.repo.metadata;
  }

  // ── 读 ────────────────────────────────────────────────────────────────────

  async find(scope: BranchScope, options?: FindManyOptions<T>): Promise<T[]> {
    // 短路而非交给 SQL：In([]) 在不同 TypeORM 版本下行为不一致，显式返回空集更可靠。
    if (!canRead(scope)) return [];
    return this.repo.find({ ...options, where: this.scopedWhere(scope, options?.where) });
  }

  async findOne(scope: BranchScope, options: FindOneOptions<T>): Promise<T | null> {
    if (!canRead(scope)) return null;
    return this.repo.findOne({ ...options, where: this.scopedWhere(scope, options.where) });
  }

  /** 按主键取单条，并校验其机构归属。请求携带的 ID 一律走这里，避免跨机构直查。 */
  async findById(scope: BranchScope, id: string): Promise<T | null> {
    if (!canRead(scope)) return null;
    return this.repo.findOne({
      where: { id, branchId: In([...scope.readable]) } as unknown as FindOptionsWhere<T>,
    });
  }

  async count(scope: BranchScope, options?: FindManyOptions<T>): Promise<number> {
    if (!canRead(scope)) return 0;
    return this.repo.count({ ...options, where: this.scopedWhere(scope, options?.where) });
  }

  /**
   * 已预置机构条件的 QueryBuilder。
   * 返回前即已 andWhere 机构过滤，后续 andWhere 无法覆盖它。
   */
  createQueryBuilder(scope: BranchScope, alias: string): SelectQueryBuilder<T> {
    const qb = this.repo.createQueryBuilder(alias);
    if (!canRead(scope)) {
      // 无可见机构时强制空集，避免退化成全表扫描
      return qb.andWhere('1 = 0');
    }
    return qb.andWhere(`${alias}.branch_id IN (:...__branchScope)`, {
      __branchScope: [...scope.readable],
    });
  }

  // ── 写 ────────────────────────────────────────────────────────────────────

  /** 创建实体并强制写入作用域内的机构，调用方传入的 branchId 会被覆盖。 */
  create(scope: BranchScope, data: DeepPartial<T>): T {
    const branchId = requireWritableBranch(scope);
    return this.repo.create({ ...data, branchId } as DeepPartial<T>);
  }

  async save(scope: BranchScope, entity: DeepPartial<T>): Promise<T> {
    const branchId = requireWritableBranch(scope);
    return this.repo.save({ ...entity, branchId } as DeepPartial<T>);
  }

  /** 按主键更新。机构条件参与匹配，跨机构的 ID 不会命中任何行。 */
  async update(scope: BranchScope, id: string, patch: Partial<T>): Promise<number> {
    const branchId = requireWritableBranch(scope);
    // 剔除 branchId，禁止通过更新把数据挪到别的机构
    const { branchId: _ignored, ...safePatch } = patch as Record<string, unknown>;
    const result = await this.repo
      .createQueryBuilder()
      .update()
      .set(safePatch as never)
      .where('id = :id AND branch_id = :branchId', { id, branchId })
      .execute();
    return result.affected ?? 0;
  }

  async delete(scope: BranchScope, id: string): Promise<number> {
    const branchId = requireWritableBranch(scope);
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where('id = :id AND branch_id = :branchId', { id, branchId })
      .execute();
    return result.affected ?? 0;
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────

  /**
   * 把机构条件合并进 where。
   * 机构条件放在展开的最后，调用方无法通过传入 branchId 覆盖它。
   * where 为数组（OR 语义）时逐项合并，否则会漏掉其中某些分支。
   */
  private scopedWhere(
    scope: BranchScope,
    where?: FindManyOptions<T>['where'],
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    const branchCond = { branchId: In([...scope.readable]) } as unknown as FindOptionsWhere<T>;
    if (!where) return branchCond;
    if (Array.isArray(where)) return where.map((w) => ({ ...w, ...branchCond }));
    return { ...where, ...branchCond };
  }
}

// ── 依赖注入装配 ────────────────────────────────────────────────────────────

export function tenantRepositoryToken(entity: Type<unknown>): string {
  return `TENANT_REPOSITORY_${entity.name}`;
}

/** 在模块的 providers 中注册租户仓储 */
export function provideTenantRepository(entity: Type<TenantEntity>) {
  return {
    provide: tenantRepositoryToken(entity),
    useFactory: (ds: DataSource) => new TenantRepository(ds.getRepository(entity)),
    inject: [DataSource],
  };
}

/** 在服务构造函数中注入租户仓储 */
export const InjectTenantRepository = (entity: Type<TenantEntity>) => Inject(tenantRepositoryToken(entity));
