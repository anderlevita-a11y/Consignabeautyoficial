-- Adicionar colunas de plano na tabela profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plano_tipo TEXT DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plano_status TEXT DEFAULT 'inativo';

-- Criar tabela de log de pagamentos
CREATE TABLE IF NOT EXISTS pagamentos_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  stripe_session_id TEXT,
  amount INTEGER,
  currency TEXT,
  status TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS para pagamentos_log
ALTER TABLE pagamentos_log ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Users can view their own payment logs" ON pagamentos_log;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

CREATE POLICY "Users can view their own payment logs" ON pagamentos_log FOR SELECT USING (auth.uid() = user_id);
