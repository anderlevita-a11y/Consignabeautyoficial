-- Table for price suggestions
CREATE TABLE IF NOT EXISTS price_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  central_product_id UUID REFERENCES central_products(id) ON DELETE CASCADE,
  suggested_cost_price DECIMAL(10,2),
  suggested_sale_price DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Table for global notifications/announcements
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info', -- 'info', 'update', 'price_change'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- RLS Policies
ALTER TABLE price_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid errors
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Anyone can read price suggestions" ON price_suggestions;
    DROP POLICY IF EXISTS "Admins can manage price suggestions" ON price_suggestions;
    DROP POLICY IF EXISTS "Anyone can read announcements" ON announcements;
    DROP POLICY IF EXISTS "Admins can manage announcements" ON announcements;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

CREATE POLICY "Anyone can read price suggestions" ON price_suggestions FOR SELECT USING (true);
CREATE POLICY "Admins can manage price suggestions" ON price_suggestions FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.email IN ('anderlevita@gmail.com'))
  )
);

CREATE POLICY "Anyone can read announcements" ON announcements FOR SELECT USING (true);
CREATE POLICY "Admins can manage announcements" ON announcements FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.email IN ('anderlevita@gmail.com'))
  )
);
