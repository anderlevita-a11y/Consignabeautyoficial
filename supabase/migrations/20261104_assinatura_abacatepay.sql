-- =====================================================================
-- Consigna Beauty — Assinatura recorrente via AbacatePay (R$ 39,99/mês)
-- =====================================================================
-- Planos de acesso:
--   TRIAL    → 7 dias grátis, liberado manualmente pelo admin
--   MENSAL   → libera todas as funções; ativado automaticamente pelo
--              pagamento na AbacatePay (ou manualmente pelo admin)
--   PENDENTE → sem acesso
-- Bloqueio/desbloqueio e arquivamento continuam manuais no painel admin.
-- =====================================================================

-- 1) Colunas de controle da assinatura -------------------------------
-- Garante que as colunas usadas pelo trigger existam (idempotente)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role             TEXT DEFAULT 'user';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan             TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plano_tipo       TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plano_status     TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status_pagamento TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vencimento       TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_pagamento   TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access_key_code  TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_blocked       BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_archived      BOOLEAN DEFAULT false;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS abacate_customer_id        TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS abacate_checkout_id        TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS abacate_checkout_url       TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS abacate_subscription_id    TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS abacate_subscription_status TEXT; -- ACTIVE | CANCELLED | PENDING
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS abacate_method             TEXT; -- CARD | PIX
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assinatura_atualizada_em   TIMESTAMPTZ;
-- 'manual' = bloqueado pelo admin (pagamento NÃO desbloqueia)
-- 'inadimplencia' = bloqueado por vencimento (pagamento desbloqueia sozinho)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blocked_reason             TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_abacate_checkout     ON profiles (abacate_checkout_id);
CREATE INDEX IF NOT EXISTS idx_profiles_abacate_subscription ON profiles (abacate_subscription_id);
CREATE INDEX IF NOT EXISTS idx_profiles_abacate_customer     ON profiles (abacate_customer_id);

-- 2) Unificar categorias antigas (PRO / STARTER / PAGO) em MENSAL ----
--    O vencimento de cada usuário é preservado.
UPDATE profiles
   SET status_pagamento = 'MENSAL',
       plano_tipo       = 'mensal',
       plan             = 'Mensal'
 WHERE status_pagamento IN ('PRO', 'STARTER', 'PAGO');

UPDATE profiles SET blocked_reason = 'manual'
 WHERE is_blocked = true AND blocked_reason IS NULL;

-- 3) Log idempotente dos webhooks ------------------------------------
CREATE TABLE IF NOT EXISTS abacatepay_webhook_events (
  id           TEXT PRIMARY KEY,           -- "id" raiz do webhook (log_...)
  event        TEXT NOT NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload      JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  result       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE abacatepay_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins leem eventos de pagamento" ON abacatepay_webhook_events;
CREATE POLICY "Admins leem eventos de pagamento" ON abacatepay_webhook_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
     WHERE p.id = auth.uid()
       AND (p.role = 'admin' OR p.email = 'anderlevita@gmail.com')
  ));
-- Escrita somente pelo service_role (Edge Functions), que ignora RLS.

-- 4) Proteção: usuário comum não pode se auto-liberar ----------------
--    Antes, a policy "Users can update own profile" permitia que qualquer
--    usuário alterasse o próprio status_pagamento, vencimento, is_blocked
--    e até role pelo console do navegador. Este trigger devolve esses
--    campos ao valor anterior quando quem altera não é admin nem o
--    servidor (service_role). Edições cadastrais normais seguem iguais.
CREATE OR REPLACE FUNCTION public.cb_is_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = uid
       AND (role = 'admin' OR email = 'anderlevita@gmail.com')
  );
$$;

CREATE OR REPLACE FUNCTION public.cb_protect_billing_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Servidor (Edge Functions com service_role) e chamadas sem JWT de usuário
  IF coalesce(auth.role(), '') = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.cb_is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.role                        := 'user';
    NEW.status_pagamento            := 'PENDENTE';
    NEW.plano_tipo                  := NULL;
    NEW.plan                        := NULL;
    NEW.vencimento                  := NULL;
    NEW.access_key_code             := NULL;
    NEW.is_blocked                  := false;
    NEW.blocked_reason              := NULL;
    NEW.abacate_customer_id         := NULL;
    NEW.abacate_checkout_id         := NULL;
    NEW.abacate_checkout_url        := NULL;
    NEW.abacate_subscription_id     := NULL;
    NEW.abacate_subscription_status := NULL;
    NEW.abacate_method              := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE por usuário comum: mantém os campos de cobrança/acesso
  NEW.role                        := OLD.role;
  NEW.status_pagamento            := OLD.status_pagamento;
  NEW.plano_tipo                  := OLD.plano_tipo;
  NEW.plano_status                := OLD.plano_status;
  NEW.plan                        := OLD.plan;
  NEW.vencimento                  := OLD.vencimento;
  NEW.data_pagamento              := OLD.data_pagamento;
  NEW.access_key_code             := OLD.access_key_code;
  NEW.is_blocked                  := OLD.is_blocked;
  NEW.blocked_reason              := OLD.blocked_reason;
  NEW.is_archived                 := OLD.is_archived;
  NEW.abacate_customer_id         := OLD.abacate_customer_id;
  NEW.abacate_checkout_id         := OLD.abacate_checkout_id;
  NEW.abacate_checkout_url        := OLD.abacate_checkout_url;
  NEW.abacate_subscription_id     := OLD.abacate_subscription_id;
  NEW.abacate_subscription_status := OLD.abacate_subscription_status;
  NEW.abacate_method              := OLD.abacate_method;
  NEW.assinatura_atualizada_em    := OLD.assinatura_atualizada_em;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cb_protect_billing_fields ON profiles;
CREATE TRIGGER trg_cb_protect_billing_fields
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.cb_protect_billing_fields();
