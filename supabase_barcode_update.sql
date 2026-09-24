-- Adicionar coluna de código de barras exclusivo
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Criar índice de unicidade por usuário para evitar duplicatas
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_user_id ON products (user_id, barcode) WHERE barcode IS NOT NULL;

-- Atualizar políticas RLS (já existem para user_id, mas garantindo que a nova coluna seja protegida)
-- Como a política de produtos é "FOR ALL USING (auth.uid() = user_id)", ela já cobre a nova coluna.
