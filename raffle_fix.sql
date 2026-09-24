-- SQL para garantir que as tabelas de rifa e sacola surpresa suportem o envio de comprovantes
-- Execute este script no SQL Editor do seu projeto Supabase

-- 1. Garantir que a tabela raffle_tickets tenha a coluna receipt_url
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'raffle_tickets' AND column_name = 'receipt_url') THEN
        ALTER TABLE raffle_tickets ADD COLUMN receipt_url TEXT;
    END IF;
END $$;

-- 2. Garantir que a tabela mystery_bags tenha a coluna receipt_url
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mystery_bags' AND column_name = 'receipt_url') THEN
        ALTER TABLE mystery_bags ADD COLUMN receipt_url TEXT;
    END IF;
END $$;

-- 3. Políticas de Armazenamento (Storage)
-- Estas políticas permitem que usuários anônimos enviem comprovantes para a pasta correta no bucket 'products'

-- Permitir inserção pública de comprovantes
CREATE POLICY "Permitir upload público de comprovantes"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'products'
);

-- Permitir leitura pública de comprovantes
CREATE POLICY "Permitir leitura pública de comprovantes"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'products'
);
