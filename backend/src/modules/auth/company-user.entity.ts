/**
 * 文件：backend/src/modules/auth/company-user.entity.ts
 * 功能：定义公司内部员工主体，与统一认证账号分离保存员工资料和组织身份。
 * 交互：由 auth.service.ts 在登录后解析 redirect/org 信息；供后续内部账号管理与 RBAC 扩展使用。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('company_users')
export class CompanyUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'auth_user_id', type: 'uuid', unique: true })
  authUserId: string;

  @Column({ name: 'company_name', type: 'varchar', length: 200, nullable: true })
  companyName?: string;

  @Column({ name: 'full_name', type: 'varchar', length: 100 })
  fullName: string;

  @Column({ name: 'employee_id', type: 'varchar', length: 50, nullable: true, unique: true })
  employeeId?: string;

  @Column({ type: 'varchar', length: 30, default: 'active' })
  status: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
