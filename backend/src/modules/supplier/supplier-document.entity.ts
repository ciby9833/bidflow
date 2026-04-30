/**
 * 文件：backend/src/modules/supplier/supplier-document.entity.ts
 * 功能：定义供应商认证资料条目，保存文本资料和简单附件信息。
 * 交互：被 supplier.service.ts 读写；供供应商资料提交页和公司审核详情页使用。
 * 作者：吴川
 */
import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('supplier_documents')
export class SupplierDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ name: 'doc_type', type: 'varchar', length: 50 })
  docType: string;

  @Column({ name: 'doc_label', type: 'varchar', length: 100 })
  docLabel: string;

  @Column({ name: 'text_value', type: 'text', nullable: true })
  textValue?: string;

  @Column({ name: 'file_name', type: 'varchar', length: 200, nullable: true })
  fileName?: string;

  @Column({ name: 'file_url', type: 'text', nullable: true })
  fileUrl?: string;

  @Column({ name: 'object_key', type: 'text', nullable: true })
  objectKey?: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 120, nullable: true })
  mimeType?: string;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize?: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
