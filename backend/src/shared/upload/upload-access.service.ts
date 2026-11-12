import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../modules/auth/jwt.strategy';
import { AccountType } from '../../modules/auth/user.entity';
import { scopesForAccount } from '../rbac/scope-map';

/** Object names are identifiers, not credentials. Check live business access on each request. */
@Injectable()
export class UploadAccessService {
  constructor(private readonly ds: DataSource) {}
  async authorize(key: string, user?: AuthenticatedUser): Promise<void> {
    const denied = () => { throw new NotFoundException('error.upload.file_not_found'); };
    if (!/^(supplier-documents|tender-attachments|quote-attachments)\/[a-zA-Z0-9-]+\/[^/]+$/.test(key) || key.includes('..')) return denied();
    const url = `/api/uploads/preview/${encodeURIComponent(key)}`;
    const scope = user?.branch?.scope.readable ?? [];
    const supplier = user?.accountType === AccountType.SUPPLIER_ACCOUNT;
    const capabilities = user ? scopesForAccount(user) : [];
    const can = (action: string) => capabilities.includes('*') || capabilities.includes(action);
    let linked = false;
    if (key.startsWith('supplier-documents/')) {
      const docs = await this.ds.query(`SELECT d.supplier_id,p.branch_id FROM supplier_documents d
        LEFT JOIN supplier_branch_profiles p ON p.supplier_id=d.supplier_id AND p.status='active'
        WHERE d.object_key=$1 OR d.file_url=$2`, [key,url]);
      linked = docs.length > 0;
      if (docs.some((d: { branch_id: string; supplier_id: string }) => scope.includes(d.branch_id) && (supplier ? d.supplier_id === user.supplierId : can('supplier:view')))) return;
    } else if (key.startsWith('tender-attachments/')) {
      const tenders = await this.ds.query(`SELECT t.* FROM tenders t JOIN branches b ON b.id=t.branch_id AND b.status='active'
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(t.attachments,'[]'::jsonb)) a
          WHERE a->>'key'=$1 OR a->>'objectKey'=$1 OR a->>'fileUrl'=$2)`, [key,url]);
      linked = tenders.length > 0;
      for (const t of tenders) {
        const published = ['published','open','closed','awarded'].includes(t.status);
        if (published && t.is_hall_visible && (t.hall_visibility === 'global'
          || (user?.branch?.activeBranchId && (t.branch_id === user.branch.activeBranchId
            || (t.hall_visibility === 'branches' && (t.hall_visible_branches ?? []).includes(user.branch.activeBranchId)))))) return;
        if (!user || !scope.includes(t.branch_id)) continue;
        if (!supplier && can('tender:view')) return;
        if (supplier && published && user.supplierId) {
          if (t.participation_mode === 'all') return;
          const invites = await this.ds.query(`SELECT id FROM invitations WHERE tender_id=$1 AND supplier_id=$2
            AND round_no=$3 AND status IN ('pending','accepted') AND (visible_at IS NULL OR visible_at<=now())`,
          [t.id,user.supplierId,t.current_quote_round ?? 1]);
          if (invites.length) return;
        }
      }
    } else {
      const quotes = await this.ds.query(`SELECT q.branch_id,q.supplier_id FROM lot_quote_attachments q
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(q.attachments,'[]'::jsonb)) a
          WHERE a->>'key'=$1 OR a->>'objectKey'=$1 OR a->>'fileUrl'=$2)`, [key,url]);
      linked = quotes.length > 0;
      if (quotes.some((q: { branch_id: string; supplier_id: string }) => scope.includes(q.branch_id) && (supplier ? q.supplier_id === user.supplierId : can('quote:view_all')))) return;
    }
    // Unsubmitted uploads are visible only to the uploader, never to arbitrary authenticated users.
    if (!linked && user && key.split('/')[1] === user.id) return;
    return denied();
  }
}
