/**
 * 文件：backend/src/migrations/1713400000000-InitSchema.ts
 * 功能：初始化数据库结构，创建项目当前版本依赖的核心表、索引与约束。
 * 交互：由 TypeORM migration 脚本执行；服务运行时依赖其创建的 users/suppliers/tenders/lots/quotes 等表结构。
 * 作者：吴川
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1713400000000 implements MigrationInterface {
  name = 'InitSchema1713400000000';

  public async up(qr: QueryRunner): Promise<void> {
    // ── Enums ──────────────────────────────────────────────────────────────
    await qr.query(`CREATE TYPE user_role_enum AS ENUM ('super_admin','purchase_manager','purchase_staff','evaluator','supplier')`);
    await qr.query(`CREATE TYPE user_status_enum AS ENUM ('active','suspended','pending_verify')`);
    await qr.query(`CREATE TYPE supplier_status_enum AS ENUM ('pending','active','suspended','blacklisted')`);
    await qr.query(`CREATE TYPE tender_status_enum AS ENUM ('draft','published','open','closed','cancelled','awarded')`);
    await qr.query(`CREATE TYPE tender_type_enum AS ENUM ('engineering','transport','routine')`);
    await qr.query(`CREATE TYPE ranking_mode_enum AS ENUM ('interval','top_n','leading_flag')`);
    await qr.query(`CREATE TYPE invitation_status_enum AS ENUM ('pending','accepted','declined','expired')`);
    await qr.query(`CREATE TYPE snapshot_trigger_enum AS ENUM ('BID_CLOSE','CANCEL','EVAL_FREEZE','MANUAL_EXPORT')`);

    // ── Sequence helpers ───────────────────────────────────────────────────
    await qr.query(`CREATE SEQUENCE IF NOT EXISTS seq_supplier_id START 1`);
    await qr.query(`CREATE SEQUENCE IF NOT EXISTS seq_tender_id START 1`);
    await qr.query(`CREATE SEQUENCE IF NOT EXISTS seq_lot_id START 1`);
    await qr.query(`CREATE SEQUENCE IF NOT EXISTS seq_quote_id START 1`);
    await qr.query(`CREATE SEQUENCE IF NOT EXISTS seq_export_id START 1`);

    // ── users ──────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE users (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email           VARCHAR(100) UNIQUE NOT NULL,
        phone           VARCHAR(30),
        password_hash   TEXT NOT NULL,
        role            user_role_enum NOT NULL,
        status          user_status_enum NOT NULL DEFAULT 'pending_verify',
        display_name    VARCHAR(100) NOT NULL,
        locale          VARCHAR(10) NOT NULL DEFAULT 'zh-CN',
        supplier_id     UUID,
        otp_code        VARCHAR(10),
        otp_expires_at  TIMESTAMPTZ,
        otp_fail_count  INT NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_users_email ON users(email)`);
    await qr.query(`CREATE INDEX idx_users_supplier ON users(supplier_id) WHERE supplier_id IS NOT NULL`);

    // ── suppliers ──────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE suppliers (
        id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id              VARCHAR(30) UNIQUE NOT NULL,
        legal_name               VARCHAR(200) NOT NULL,
        short_name               VARCHAR(100) NOT NULL,
        status                   supplier_status_enum NOT NULL DEFAULT 'pending',
        country_code             CHAR(2) NOT NULL DEFAULT 'CN',
        region                   VARCHAR(10),
        categories               JSONB,
        contact_name             VARCHAR(100),
        contact_email            VARCHAR(150),
        contact_phone            VARCHAR(30),
        bank_account_encrypted   TEXT,
        tax_id                   VARCHAR(50),
        rating                   NUMERIC(3,2),
        suspended_reason         TEXT,
        fingerprint_hash         VARCHAR(64),
        anti_collusion_flagged   BOOLEAN NOT NULL DEFAULT FALSE,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_suppliers_status ON suppliers(status)`);
    await qr.query(`CREATE INDEX idx_suppliers_fingerprint ON suppliers(fingerprint_hash) WHERE fingerprint_hash IS NOT NULL`);

    // ── tenders ────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE tenders (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tender_no         VARCHAR(30) UNIQUE NOT NULL,
        title             VARCHAR(200) NOT NULL,
        type              tender_type_enum NOT NULL,
        status            tender_status_enum NOT NULL DEFAULT 'draft',
        created_by        UUID NOT NULL REFERENCES users(id),
        base_currency     CHAR(3) NOT NULL DEFAULT 'IDR',
        ranking_mode      ranking_mode_enum NOT NULL DEFAULT 'leading_flag',
        ranking_top_n     INT,
        bid_deadline      TIMESTAMPTZ,
        open_time         TIMESTAMPTZ,
        max_rebid_count   INT NOT NULL DEFAULT 3,
        min_decrement_pct NUMERIC(5,2) NOT NULL DEFAULT 1.00,
        cooldown_seconds  INT NOT NULL DEFAULT 60,
        description       TEXT,
        attachments       JSONB,
        is_public_ranking_visible BOOLEAN NOT NULL DEFAULT FALSE,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_tenders_status ON tenders(status)`);
    await qr.query(`CREATE INDEX idx_tenders_created_by ON tenders(created_by)`);

    // ── lots ───────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE lots (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lot_no          VARCHAR(30) UNIQUE NOT NULL,
        tender_id       UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
        title           VARCHAR(200) NOT NULL,
        description     TEXT,
        quantity        NUMERIC(20,4),
        unit            VARCHAR(50),
        pricing_mode    VARCHAR(40) NOT NULL DEFAULT 'total_price',
        lot_version     INT NOT NULL DEFAULT 1,
        schema_version  INT NOT NULL DEFAULT 1,
        spec_json       JSONB,
        ui_schema       JSONB,
        budget_amount   NUMERIC(20,4),
        budget_currency CHAR(3) DEFAULT 'IDR',
        sort_order      INT NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_lots_tender ON lots(tender_id)`);

    // ── invitations ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE invitations (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tender_id    UUID NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
        supplier_id  UUID NOT NULL REFERENCES suppliers(id),
        status       invitation_status_enum NOT NULL DEFAULT 'pending',
        invited_at   TIMESTAMPTZ,
        visible_at   TIMESTAMPTZ,
        responded_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tender_id, supplier_id)
      )
    `);

    // ── quotes ─────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE quotes (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quote_no            VARCHAR(30) UNIQUE NOT NULL,
        tender_id           UUID NOT NULL REFERENCES tenders(id),
        lot_id              UUID NOT NULL REFERENCES lots(id),
        supplier_id         UUID NOT NULL REFERENCES suppliers(id),
        version             INT NOT NULL DEFAULT 1,
        is_latest           BOOLEAN NOT NULL DEFAULT TRUE,
        is_valid            BOOLEAN NOT NULL DEFAULT TRUE,
        total_price         NUMERIC(20,4) NOT NULL,
        currency            CHAR(3) NOT NULL DEFAULT 'CNY',
        exchange_rate       NUMERIC(16,6),
        base_currency       CHAR(3),
        price_in_base       NUMERIC(20,4),
        lot_schema_version  INT NOT NULL,
        items               JSONB,
        attachments         JSONB,
        idempotency_key     VARCHAR(64),
        submit_ip           INET,
        remark              TEXT,
        submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE UNIQUE INDEX idx_quotes_idempotency ON quotes(tender_id,lot_id,supplier_id,idempotency_key) WHERE idempotency_key IS NOT NULL`);
    await qr.query(`CREATE UNIQUE INDEX idx_quotes_version ON quotes(tender_id,lot_id,supplier_id,version)`);
    await qr.query(`CREATE INDEX idx_quotes_latest ON quotes(lot_id,supplier_id,is_latest) WHERE is_latest = TRUE`);

    // ── ranking_snapshots ──────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE ranking_snapshots (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tender_id       UUID NOT NULL REFERENCES tenders(id),
        lot_id          UUID NOT NULL REFERENCES lots(id),
        snapshot_data   JSONB NOT NULL,
        trigger_reason  snapshot_trigger_enum NOT NULL,
        triggered_by    UUID,
        immutable       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_snapshots_lot ON ranking_snapshots(lot_id, created_at DESC)`);

    // ── audit_log ──────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE audit_log (
        id            BIGSERIAL PRIMARY KEY,
        entity_type   VARCHAR(50) NOT NULL,
        entity_id     VARCHAR(64) NOT NULL,
        action        VARCHAR(50) NOT NULL,
        user_id       UUID NOT NULL,
        user_role     VARCHAR(50) NOT NULL,
        ip_address    INET NOT NULL,
        user_agent    TEXT,
        before_state  JSONB,
        after_state   JSONB,
        metadata      JSONB,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await qr.query(`CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC)`);
    await qr.query(`CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC)`);
    await qr.query(`CREATE INDEX idx_audit_action ON audit_log(action, created_at DESC)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS audit_log`);
    await qr.query(`DROP TABLE IF EXISTS ranking_snapshots`);
    await qr.query(`DROP TABLE IF EXISTS quotes`);
    await qr.query(`DROP TABLE IF EXISTS invitations`);
    await qr.query(`DROP TABLE IF EXISTS lots`);
    await qr.query(`DROP TABLE IF EXISTS tenders`);
    await qr.query(`DROP TABLE IF EXISTS suppliers`);
    await qr.query(`DROP TABLE IF EXISTS users`);
    await qr.query(`DROP SEQUENCE IF EXISTS seq_export_id`);
    await qr.query(`DROP SEQUENCE IF EXISTS seq_quote_id`);
    await qr.query(`DROP SEQUENCE IF EXISTS seq_lot_id`);
    await qr.query(`DROP SEQUENCE IF EXISTS seq_tender_id`);
    await qr.query(`DROP SEQUENCE IF EXISTS seq_supplier_id`);
    await qr.query(`DROP TYPE IF EXISTS snapshot_trigger_enum`);
    await qr.query(`DROP TYPE IF EXISTS invitation_status_enum`);
    await qr.query(`DROP TYPE IF EXISTS ranking_mode_enum`);
    await qr.query(`DROP TYPE IF EXISTS tender_type_enum`);
    await qr.query(`DROP TYPE IF EXISTS tender_status_enum`);
    await qr.query(`DROP TYPE IF EXISTS supplier_status_enum`);
    await qr.query(`DROP TYPE IF EXISTS user_status_enum`);
    await qr.query(`DROP TYPE IF EXISTS user_role_enum`);
  }
}
