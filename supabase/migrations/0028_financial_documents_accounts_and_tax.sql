-- Migration 0028: user-scoped account, statement, document, provenance and tax records.
-- All tables are additive. Original document bodies remain optional and are not stored by default.

CREATE TABLE public.financial_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  institution TEXT NOT NULL CHECK (char_length(trim(institution)) BETWEEN 1 AND 100),
  account_type TEXT NOT NULL CHECK (account_type IN ('bank', 'credit_card', 'cash', 'wallet', 'investment', 'loan')),
  account_number_last4 TEXT CHECK (account_number_last4 IS NULL OR account_number_last4 ~ '^[0-9]{4}$'),
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  opening_balance_paise BIGINT NOT NULL DEFAULT 0,
  opening_balance_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_financial_accounts_id_user UNIQUE (id, user_id)
);
CREATE INDEX idx_financial_accounts_user_active ON public.financial_accounts(user_id, is_active, name);
CREATE TRIGGER trg_financial_accounts_updated_at BEFORE UPDATE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE TABLE public.statement_import_batches (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id UUID,
  source_name TEXT NOT NULL CHECK (char_length(trim(source_name)) BETWEEN 1 AND 180),
  source_format TEXT NOT NULL CHECK (source_format IN ('pdf', 'csv', 'xlsx', 'xls')),
  parser_id TEXT NOT NULL DEFAULT 'generic',
  parser_version TEXT NOT NULL DEFAULT '1',
  statement_start DATE,
  statement_end DATE,
  opening_balance_paise BIGINT,
  closing_balance_paise BIGINT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'partial', 'failed', 'undone')),
  detected_count INTEGER NOT NULL DEFAULT 0 CHECK (detected_count >= 0),
  imported_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  discrepancy_count INTEGER NOT NULL DEFAULT 0 CHECK (discrepancy_count >= 0),
  source_sha256 TEXT CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$'),
  retained_until TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_statement_batches_id_user UNIQUE (id, user_id),
  CONSTRAINT fk_statement_batch_account_owner FOREIGN KEY (account_id, user_id)
    REFERENCES public.financial_accounts(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT chk_statement_period CHECK (statement_start IS NULL OR statement_end IS NULL OR statement_start <= statement_end)
);
CREATE INDEX idx_statement_batches_user_created ON public.statement_import_batches(user_id, created_at DESC);
CREATE TRIGGER trg_statement_batches_updated_at BEFORE UPDATE ON public.statement_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

ALTER TABLE public.transactions
  ADD COLUMN account_id UUID,
  ADD COLUMN import_batch_id UUID,
  ADD CONSTRAINT uq_transactions_id_user UNIQUE (id, user_id),
  ADD CONSTRAINT fk_transactions_account_owner FOREIGN KEY (account_id, user_id)
    REFERENCES public.financial_accounts(id, user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_transactions_import_batch_owner FOREIGN KEY (import_batch_id, user_id)
    REFERENCES public.statement_import_batches(id, user_id) ON DELETE RESTRICT;
CREATE INDEX idx_transactions_user_account_date ON public.transactions(user_id, account_id, transaction_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_import_batch ON public.transactions(user_id, import_batch_id)
  WHERE import_batch_id IS NOT NULL;

CREATE TABLE public.account_movements (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_account_id UUID NOT NULL,
  to_account_id UUID NOT NULL,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  movement_date DATE NOT NULL,
  reference TEXT,
  notes TEXT,
  import_batch_id UUID,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_account_movement_distinct CHECK (from_account_id <> to_account_id),
  CONSTRAINT fk_account_movement_from_owner FOREIGN KEY (from_account_id, user_id)
    REFERENCES public.financial_accounts(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_account_movement_to_owner FOREIGN KEY (to_account_id, user_id)
    REFERENCES public.financial_accounts(id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_account_movement_batch_owner FOREIGN KEY (import_batch_id, user_id)
    REFERENCES public.statement_import_batches(id, user_id) ON DELETE RESTRICT
);
CREATE INDEX idx_account_movements_user_date ON public.account_movements(user_id, movement_date DESC) WHERE deleted_at IS NULL;

CREATE TABLE public.financial_documents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'form16', 'form16a', 'form130', 'form131', 'form26as', 'ais', 'tis', 'payslip',
    'investment_declaration', 'epf', 'ppf', 'life_insurance', 'elss', 'nps', 'health_insurance',
    'home_loan_interest', 'rent_receipt', 'rental_agreement', 'tuition_fee', 'education_loan_interest',
    'donation_receipt', 'fd_interest', 'savings_interest', 'capital_gains', 'investment_statement',
    'bank_statement', 'other_tax_document'
  )),
  display_name TEXT NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 180),
  tax_year TEXT,
  assessment_year TEXT,
  issuer_name TEXT,
  storage_path TEXT,
  file_sha256 TEXT CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$'),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel')),
  file_size_bytes BIGINT CHECK (file_size_bytes BETWEEN 0 AND 31457280),
  retention_mode TEXT NOT NULL DEFAULT 'metadata_only' CHECK (retention_mode IN ('metadata_only', 'retain_until')),
  retained_until TIMESTAMPTZ,
  document_status TEXT NOT NULL DEFAULT 'awaiting_review' CHECK (document_status IN ('awaiting_review', 'verified', 'conflict', 'manual_review', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_financial_documents_id_user UNIQUE (id, user_id),
  CONSTRAINT chk_document_retention CHECK (
    (retention_mode = 'metadata_only' AND storage_path IS NULL AND retained_until IS NULL)
    OR (retention_mode = 'retain_until' AND storage_path IS NOT NULL AND retained_until IS NOT NULL)
  )
);
CREATE INDEX idx_financial_documents_user_year ON public.financial_documents(user_id, tax_year, document_type);
CREATE TRIGGER trg_financial_documents_updated_at BEFORE UPDATE ON public.financial_documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE TABLE public.tax_extracted_fields (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_id UUID NOT NULL,
  field_key TEXT NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_.-]{0,99}$'),
  field_value JSONB NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  source_page INTEGER CHECK (source_page IS NULL OR source_page > 0),
  source_location TEXT,
  extraction_method TEXT NOT NULL CHECK (extraction_method IN ('text_pdf', 'ocr_local', 'spreadsheet', 'manual')),
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  verification_status TEXT NOT NULL DEFAULT 'awaiting_confirmation' CHECK (verification_status IN (
    'extracted', 'awaiting_confirmation', 'verified', 'conflicting', 'evidence_required', 'not_applicable', 'manual_review'
  )),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_tax_field_document_owner FOREIGN KEY (document_id, user_id)
    REFERENCES public.financial_documents(id, user_id) ON DELETE CASCADE
);
CREATE INDEX idx_tax_fields_user_document ON public.tax_extracted_fields(user_id, document_id, field_key);
CREATE TRIGGER trg_tax_extracted_fields_updated_at BEFORE UPDATE ON public.tax_extracted_fields
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE TABLE public.tax_profiles (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  framework TEXT NOT NULL CHECK (framework IN ('income_tax_act_1961', 'income_tax_act_2025')),
  tax_year TEXT NOT NULL,
  ruleset_id TEXT NOT NULL,
  taxpayer_category TEXT NOT NULL CHECK (taxpayer_category IN ('individual', 'huf', 'other')),
  profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_regime TEXT CHECK (selected_regime IS NULL OR selected_regime IN ('old', 'new')),
  calculation_status TEXT NOT NULL DEFAULT 'incomplete' CHECK (calculation_status IN ('incomplete', 'estimated', 'ready_for_review', 'unsupported')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tax_profiles_user_framework_year UNIQUE (user_id, framework, tax_year)
);
CREATE INDEX idx_tax_profiles_user_year ON public.tax_profiles(user_id, tax_year DESC);
CREATE TRIGGER trg_tax_profiles_updated_at BEFORE UPDATE ON public.tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE TABLE public.merchant_rules (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  merchant_key TEXT NOT NULL CHECK (char_length(trim(merchant_key)) BETWEEN 1 AND 160),
  category_id UUID NOT NULL,
  transaction_type public.transaction_type NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  apply_to_past BOOLEAN NOT NULL DEFAULT FALSE,
  created_from_transaction_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_merchant_rules_user_key_type UNIQUE (user_id, merchant_key, transaction_type),
  CONSTRAINT fk_merchant_rule_category_owner FOREIGN KEY (category_id, user_id, transaction_type)
    REFERENCES public.categories(id, user_id, type) ON DELETE RESTRICT
);
CREATE TRIGGER trg_merchant_rules_updated_at BEFORE UPDATE ON public.merchant_rules
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

CREATE TABLE public.transaction_links (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_transaction_id UUID NOT NULL,
  target_transaction_id UUID NOT NULL,
  relationship TEXT NOT NULL CHECK (relationship IN ('transfer_pair', 'card_settlement', 'refund_of', 'reversal_of', 'duplicate_of', 'statement_match')),
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  explanation TEXT NOT NULL CHECK (char_length(trim(explanation)) BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'confirmed', 'rejected')),
  created_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_transaction_link_distinct CHECK (source_transaction_id <> target_transaction_id),
  CONSTRAINT uq_transaction_link_pair UNIQUE (user_id, source_transaction_id, target_transaction_id, relationship),
  CONSTRAINT fk_transaction_link_source_owner FOREIGN KEY (source_transaction_id, user_id)
    REFERENCES public.transactions(id, user_id) ON DELETE CASCADE,
  CONSTRAINT fk_transaction_link_target_owner FOREIGN KEY (target_transaction_id, user_id)
    REFERENCES public.transactions(id, user_id) ON DELETE CASCADE
);
CREATE INDEX idx_transaction_links_user_status ON public.transaction_links(user_id, status, relationship);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'financial_accounts', 'statement_import_batches', 'account_movements', 'financial_documents',
    'tax_extracted_fields', 'tax_profiles', 'merchant_rules', 'transaction_links'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid())', t || '_select_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())', t || '_insert_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t || '_update_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid())', t || '_delete_own', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- RLS on transactions already exists. Account/batch owner FKs prevent cross-user associations.
GRANT ALL ON public.financial_accounts, public.statement_import_batches, public.account_movements,
  public.financial_documents, public.tax_extracted_fields, public.tax_profiles, public.merchant_rules,
  public.transaction_links TO service_role;

-- Optional retained document bytes use a private bucket. Metadata-only processing is the default.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('arth-private-documents', 'arth-private-documents', false, 31457280,
  ARRAY['application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "arth_private_documents_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'arth-private-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "arth_private_documents_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'arth-private-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "arth_private_documents_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'arth-private-documents' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'arth-private-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "arth_private_documents_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'arth-private-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
