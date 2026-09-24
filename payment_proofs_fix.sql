-- SQL para adicionar suporte a comprovantes em sorteios
-- Execute este script no SQL Editor do seu projeto Supabase

-- 1. Adicionar coluna receipt_url à tabela sweepstakes_participants
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sweepstakes_participants' AND column_name = 'receipt_url') THEN
        ALTER TABLE sweepstakes_participants ADD COLUMN receipt_url TEXT;
    END IF;
END $$;

-- 2. Garantir que o bucket 'payment_proofs' exista e tenha políticas públicas
-- Nota: A criação de buckets via SQL pode exigir extensões ou permissões específicas.
-- É recomendado criar o bucket 'payment_proofs' manualmente no painel do Supabase se não existir.

-- 3. Políticas de Armazenamento para o bucket 'payment_proofs'
-- Se você preferir usar o bucket 'products' como no script anterior, ajuste as políticas abaixo.
-- Vamos criar políticas para um bucket dedicado 'payment_proofs' para melhor organização.

-- Permitir upload público
CREATE POLICY "Permitir upload público de comprovantes de pagamento"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payment_proofs'
);

-- Permitir leitura pública
CREATE POLICY "Permitir leitura pública de comprovantes de pagamento"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payment_proofs'
);
