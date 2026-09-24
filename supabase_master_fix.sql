-- MASTER SCHEMA FIX FOR CONSIGNABBEAUTY
-- Execute este script no SQL Editor do seu projeto Supabase para garantir que todas as tabelas e colunas necessárias existam.

-- Ativar extensão pgcrypto se necessário
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Tabela profiles (Usuários do Sistema)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pix_beneficiary TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accepted_terms_version INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vencimento TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_pagamento TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'Trial';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status_pagamento TEXT DEFAULT 'TRIAL';

-- 2. Tabela products (Produtos da Loja)
ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_grid BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS label_name TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ean_variations TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS grid_data JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_visible_in_store BOOLEAN DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;

-- 3. Tabela central_products (Produtos Globais)
CREATE TABLE IF NOT EXISTS central_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  label_name TEXT,
  ean TEXT,
  cost_price DECIMAL(10,2),
  sale_price DECIMAL(10,2),
  has_grid BOOLEAN DEFAULT false,
  photo_url TEXT,
  image_urls TEXT[] DEFAULT '{}',
  ean_variations TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela customers (Clientes)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 5. Tabela bags (Sacolas/Vendas)
DO $$ 
BEGIN 
  -- Renomear se existir a coluna antiga
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bags' AND column_name = 'reseller_name') THEN
    ALTER TABLE bags RENAME COLUMN reseller_name TO notes;
  END IF;

  -- Garantir que a coluna notes existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bags' AND column_name = 'notes') THEN
    ALTER TABLE bags ADD COLUMN notes TEXT;
  END IF;
  
  -- Adicionar coluna installments
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bags' AND column_name = 'installments') THEN
    ALTER TABLE bags ADD COLUMN installments INTEGER DEFAULT 1;
  END IF;
END $$;

-- 6. Tabelas para cobranças avulsas
CREATE TABLE IF NOT EXISTS miscellaneous_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  customer_id UUID REFERENCES customers(id),
  description TEXT NOT NULL,
  total_value NUMERIC(15,2) NOT NULL,
  installments_count INTEGER DEFAULT 1,
  apply_late_fees BOOLEAN DEFAULT true,
  original_due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS miscellaneous_charge_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id UUID NOT NULL REFERENCES miscellaneous_charges(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  value NUMERIC(15,2) NOT NULL,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Tabela app_legal_settings (Termos e Privacidade)
CREATE TABLE IF NOT EXISTS app_legal_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privacy_policy TEXT NOT NULL,
  terms_of_use TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Tabela smart_notepad (Bloco de Notas)
CREATE TABLE IF NOT EXISTS smart_notepad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 9. Tabela price_suggestions (Sugestões de Preço)
CREATE TABLE IF NOT EXISTS price_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  central_product_id UUID REFERENCES central_products(id) ON DELETE CASCADE,
  suggested_cost_price DECIMAL(10,2),
  suggested_sale_price DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- 10. Tabela announcements (Anúncios/Alertas)
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- 11. Habilitar RLS em tudo
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE central_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bags ENABLE ROW LEVEL SECURITY;
ALTER TABLE miscellaneous_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE miscellaneous_charge_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_legal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_notepad ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- 12. Políticas de Acesso
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Usuários gerenciam suas próprias cobranças" ON miscellaneous_charges;
    DROP POLICY IF EXISTS "Usuários gerenciam parcelas de suas cobranças" ON miscellaneous_charge_installments;
    DROP POLICY IF EXISTS "Usuários gerenciam seu próprio notepad" ON smart_notepad;
    DROP POLICY IF EXISTS "Permitir leitura para todos" ON app_legal_settings;
    DROP POLICY IF EXISTS "Anyone can read price suggestions" ON price_suggestions;
    DROP POLICY IF EXISTS "Admins can manage price suggestions" ON price_suggestions;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

CREATE POLICY "Usuários gerenciam suas próprias cobranças" ON miscellaneous_charges FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Usuários gerenciam parcelas de suas cobranças" ON miscellaneous_charge_installments FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM miscellaneous_charges WHERE id = charge_id AND user_id = auth.uid())
);
CREATE POLICY "Usuários gerenciam seu próprio notepad" ON smart_notepad FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Permitir leitura para todos" ON app_legal_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can read price suggestions" ON price_suggestions FOR SELECT USING (true);
CREATE POLICY "Admins can manage price suggestions" ON price_suggestions FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.email IN ('romanceitapema@gmail.com'))
  )
);
