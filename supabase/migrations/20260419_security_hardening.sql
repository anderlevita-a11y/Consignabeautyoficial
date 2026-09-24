-- 
-- Harden security and add missing columns
-- 

-- Ensure image_urls exists for products
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls text[];

-- Ensure description exists for products (it was already in types but let's be sure)
ALTER TABLE products ADD COLUMN IF NOT EXISTS description text;

-- Add limits to text columns to prevent abuse (example)
-- Note: Supabase columns are often 'text' without limit, but we can add constraints.

-- Products table
ALTER TABLE products 
  ALTER COLUMN name TYPE varchar(100),
  ALTER COLUMN label_name TYPE varchar(50),
  ALTER COLUMN ean TYPE varchar(20),
  ALTER COLUMN category TYPE varchar(50);

-- Profiles table
ALTER TABLE profiles
  ALTER COLUMN nome TYPE varchar(100),
  ALTER COLUMN cpf TYPE varchar(14),
  ALTER COLUMN whatsapp TYPE varchar(20),
  ALTER COLUMN email TYPE varchar(255),
  ALTER COLUMN pix_key TYPE varchar(255);

-- Customers table
ALTER TABLE customers
  ALTER COLUMN nome TYPE varchar(100),
  ALTER COLUMN cpf TYPE varchar(14),
  ALTER COLUMN whatsapp TYPE varchar(20),
  ALTER COLUMN instagram TYPE varchar(50),
  ALTER COLUMN cep TYPE varchar(9),
  ALTER COLUMN cidade TYPE varchar(50),
  ALTER COLUMN estado TYPE varchar(2),
  ALTER COLUMN logradouro TYPE varchar(150),
  ALTER COLUMN bairro TYPE varchar(100);

-- Store Settings
ALTER TABLE store_settings
  ALTER COLUMN store_name TYPE varchar(100),
  ALTER COLUMN store_slug TYPE varchar(50),
  ALTER COLUMN whatsapp_number TYPE varchar(20),
  ALTER COLUMN instagram_handle TYPE varchar(50);

-- Campaigns
ALTER TABLE campaigns
  ALTER COLUMN name TYPE varchar(100);

-- Bags
ALTER TABLE bags
  ALTER COLUMN bag_number TYPE varchar(20);

-- Ensure we have RLS (Row Level Security) enabled - though this is a global concept
-- We also add check constraints for numeric values to prevent negatives where it makes no sense
ALTER TABLE products ADD CONSTRAINT check_prices CHECK (cost_price >= 0 AND sale_price >= 0);
ALTER TABLE bags ADD CONSTRAINT check_total CHECK (total_value >= 0);
ALTER TABLE financial_transactions ADD CONSTRAINT check_amount CHECK (amount >= 0);
