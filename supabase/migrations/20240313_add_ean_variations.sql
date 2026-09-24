ALTER TABLE products ADD COLUMN IF NOT EXISTS ean_variations TEXT[] DEFAULT '{}';
